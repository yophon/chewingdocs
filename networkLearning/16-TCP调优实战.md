# TCP 调优实战

「TCP 调优」是 SRE 面试三大送分题之一,但**真上手能写出完整 sysctl 配置 + 解释每条为什么的人不到 10%**——大多数人都是「网上抄一份 sysctl 改改」。改对了运气好,改错了能让服务器更不稳。本章把前 5 章(11 UDP / 12 握手 / 13 拥塞 / 14 高级特性 / 15 MPTCP)的所有理论落到 **「这一行 sysctl 改了什么、为什么改、改坏了什么样」**——附一份「**高并发 web 服务器 TCP 调参完整 sysctl 配置**」可以直接抄走,但更重要的是:**抄之前先理解,因为不同业务侧重点完全不一样**。

> 一句话先记住:**TCP 调优 = buffer + 队列 + TIME_WAIT + 拥塞算法 + Fast Open**——五件事各自有几个 sysctl,合起来不到 30 行。**给所有 buffer 加大不是调优是浪费内存**;**`tcp_tw_recycle` 已被 Linux 4.12 移除,见到还在用立刻删掉**;BBR 上线必须配 `fq` qdisc 否则 pacing 失效。**`ss -tin` 是查看 TCP 状态的瑞士军刀**——比抓包高效,90% 问题不需要 tcpdump。

---

## 一、调优前提:先量化再调优

参考 13 篇——优化前先看现状,**别瞎改**。

### 1.1 看连接状态分布

```bash
ss -tan | awk 'NR>1 {print $1}' | sort | uniq -c | sort -rn

  12345 ESTAB
   3456 TIME-WAIT
    234 CLOSE-WAIT       ← 这个数字大说明应用 bug(参考 12 篇)
     45 FIN-WAIT-2
      8 LISTEN
```

### 1.2 看队列溢出

```bash
nstat -az | grep -iE 'listen|drop|overflow'

TcpExtListenOverflows         3245   ← 全连接队列溢出 3245 次
TcpExtListenDrops             3245   ← 因此丢的连接
TcpExtTCPBacklogDrop          12     ← backlog 溢出
TcpExtTCPRcvQDrop             0      ← 接收队列丢包
```

任何一个非 0 都是信号。

### 1.3 看具体连接的拥塞 / 重传

```bash
ss -tin sport = :443 | head -20

ESTAB ... cubic rtt:50/10 cwnd:200 retrans:5/200 ...
                                         ↑ 重传次数 / 总段数
```

**重传率 > 1% 就值得排查**(网络问题 / cwnd 太大压网 / Bufferbloat)。

### 1.4 看 sysctl 当前值

```bash
sysctl -a 2>/dev/null | grep -E '^net\.(core|ipv4)\.tcp' | head -50
```

---

## 二、Socket 缓冲区:rmem / wmem

参考 13 篇的流量控制——**buffer 决定流控窗口能开多大**,**buffer 决定单连接吞吐上限**。

### 2.1 三个层次的 buffer

```
[应用]
   │ recv(fd, buf, 4096)         ← 应用 buffer (用户态,你定的)
[内核 socket buffer]
   │ rcv_buf (per-socket)        ← Linux auto-tune 范围内
[网卡 ring buffer]
   │ ethtool -g eth0
```

### 2.2 关键 sysctl

```bash
# core 层:所有 socket(包括 UDP)的上下限
net.core.rmem_max = 16777216           # 16 MB,SO_RCVBUF 能设到的上限
net.core.wmem_max = 16777216           # 16 MB,SO_SNDBUF 能设到的上限
net.core.rmem_default = 262144         # 256 KB,默认值
net.core.wmem_default = 262144

# tcp 层:auto-tune 三元组 [min, default, max]
net.ipv4.tcp_rmem = 4096 87380 16777216
net.ipv4.tcp_wmem = 4096 16384 16777216

# 内核可用于所有 TCP 的总内存(单位:页,4 KB)
net.ipv4.tcp_mem = 190512 254016 381024
#                    low      pressure   high
#                  低于 low: 不回收
#                  低于 high: pressure 状态,新分配限制
#                  超过 high: 拒绝新分配
```

### 2.3 怎么算合适的 buffer

**单连接最大吞吐 ≤ buffer / RTT**:

```
要 1 Gbps 跨国链路打满 (RTT = 100ms):
buffer = 1 Gbps × 100 ms = 12.5 MB

→ tcp_rmem max 至少 16 MB
→ rmem_max 至少 16 MB
```

**别盲目调大**:
- 100 万连接每个 10 MB = **10 TB 内存**——服务器装不下
- Linux auto-tune 会自动按需扩(从 default 涨到 max),**默认值给小,max 给大**

### 2.4 实战配置

```bash
# 高并发 web 服务器(短连接 + 中等吞吐)
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.ipv4.tcp_rmem = 4096 87380 16777216
net.ipv4.tcp_wmem = 4096 65536 16777216

# CDN / 视频服务器(长连接 + 大吞吐)
net.core.rmem_max = 67108864       # 64 MB
net.core.wmem_max = 67108864
net.ipv4.tcp_rmem = 4096 87380 67108864
net.ipv4.tcp_wmem = 4096 65536 67108864

# 数据中心内(低 RTT,buffer 不需要太大)
net.core.rmem_max = 4194304        # 4 MB 够了
net.core.wmem_max = 4194304
```

---

## 三、连接队列:somaxconn / backlog / netdev_max_backlog

参考 12 篇的半连接 / 全连接队列。

### 3.1 三层队列

```
[网卡 → 内核]
   netdev_max_backlog       软中断处理慢时,数据包暂存
   ↓
[半连接队列 (SYN queue)]
   tcp_max_syn_backlog      未完成握手的连接
   ↓ (握手完成)
[全连接队列 (Accept queue)]
   somaxconn / listen(backlog)   等待 accept() 的连接
   ↓ (应用 accept)
[应用]
```

### 3.2 关键 sysctl

```bash
# 网卡软中断队列
net.core.netdev_max_backlog = 65536    # 默认 1000,高负载必调

# 半连接队列(SYN flood 防御)
net.ipv4.tcp_max_syn_backlog = 65535   # 默认 128-1024
net.ipv4.tcp_syncookies = 1            # 防 SYN flood
net.ipv4.tcp_synack_retries = 2        # 默认 5,SYN+ACK 重传 5 次太多

# 全连接队列
net.core.somaxconn = 65535             # 默认老内核 128,新内核 4096

# accept 失败的处理
net.ipv4.tcp_abort_on_overflow = 0     # 默认 0(丢 ACK,client 超时);
                                       # 1 是发 RST(client 立即报错,易排查但不友好)
```

### 3.3 应用层也要改

`somaxconn` 只是**上限**,**实际队列长度 = `min(应用 listen() 的 backlog, somaxconn)`**。

```c
// C
listen(s, 65535);  // 必须传大值

// Java
new ServerSocket(80, 65535);

// Go(用 net.Listen)
// 内部调 listen(fd, ...),Go 1.11+ 会传 syscall.SOMAXCONN
// Go 1.19+ 会读 /proc/sys/net/core/somaxconn

// Python(socketserver)
# 内部 backlog 默认 5,要自己改 ThreadingTCPServer.request_queue_size = 65535

// Nginx
listen 80 backlog=65535;  # 必须显式
```

**改了 sysctl 不改应用,等于没改**。

### 3.4 实战检查

```bash
# 看监听 socket 队列状态
ss -lnt
State   Recv-Q   Send-Q   Local Address:Port
LISTEN  0        65535    0.0.0.0:80          ← Send-Q = 队列上限,Recv-Q = 当前队列长度
LISTEN  3        128      0.0.0.0:443         ← 这个 backlog 太小了

# 看历史溢出
nstat -az | grep ListenOverflows
TcpExtListenOverflows         0   ← 0 = 健康
```

> 经验法则:**`somaxconn=65535` 是高并发服务器标配**,但应用必须同步改 listen backlog,否则白调。

---

## 四、TIME_WAIT 调参:三件事

参考 12 篇——**TIME_WAIT 是设计,不是 bug**。但堆积过多会爆端口。

### 4.1 关键 sysctl

```bash
# 客户端复用 TIME_WAIT 状态的端口(用时间戳防迷路包)
net.ipv4.tcp_tw_reuse = 1              # 默认 0,推荐 1(client 端有效)

# !!! 不要用 tcp_tw_recycle !!!
# 已在 Linux 4.12+ 移除,在 NAT 环境下会乱杀连接

# 加大临时端口范围
net.ipv4.ip_local_port_range = "1024 65535"   # 默认 32768-60999

# 加快 FIN 后等待
net.ipv4.tcp_fin_timeout = 30          # 默认 60,缩到 30 加速 FIN_WAIT_2 回收

# TIME_WAIT 上限(超出按 LRU 回收)
net.ipv4.tcp_max_tw_buckets = 1048576  # 默认 4096-262144,大并发要大
```

### 4.2 tcp_tw_reuse 详解

**只对客户端发起的连接有效**,内核检查:

1. 目标四元组在 TIME_WAIT 状态
2. 时间戳必须开(`tcp_timestamps=1`)
3. 新连接的时间戳比 TIME_WAIT 里的大(防迷路包)

满足以上,**直接用这个端口建新连接**——绕过 TIME_WAIT。

```bash
# 看是否生效
nstat -az | grep -i tw
TcpExtTW                       12345   ← 进入 TW 的次数
TcpExtTWRecycled               0       ← (已移除,这里应该是 0)
TcpExtTWReused                 5678    ← 复用的次数,有数说明生效了
```

### 4.3 服务端怎么办

**服务端 TIME_WAIT 多 = 服务端在主动断连**——根本办法是**改成长连接**,让 client 主动断。

```
HTTP keep-alive
连接池(数据库 / Redis / 微服务)
gRPC 长连接
```

如果必须服务端断,`SO_LINGER=0` + close() 会发 RST 而不是 FIN——**绕过 TIME_WAIT,但破坏 TCP 协议**(可能丢未发送的数据)。**慎用,只在确实有连接泄漏问题时**。

> 踩坑提醒:**所有「打开 tcp_tw_recycle」的教程立刻关掉**——已经在 Linux 4.12 移除,在 NAT 后多 client 时间戳不一致,会丢包。

---

## 五、Fast Open(TFO):握手时带数据

参考 12 篇——三次握手要 1 RTT 才能开始发数据。**TFO 让客户端在 SYN 包里就带数据**,服务端收到 SYN 时就能开始处理,**省 1 RTT**。

### 5.1 工作机制

```
首次连接:                            后续连接(用 cookie):
   SYN ─────────────>                   SYN + cookie + 数据 ───>
   SYN+ACK + cookie <───                SYN+ACK + 响应数据 <───
   ACK ─────────────>                   ACK ────────────────>
   数据 ────────────>                   完成 (0 RTT 数据传输!)
   数据 <────────────
```

**首次连接**:服务端发个 cookie,客户端缓存。
**后续连接**:客户端在 SYN 里带 cookie + 数据,服务端验证 cookie 后**立刻交给应用**。

### 5.2 配置

```bash
# 0 = 关
# 1 = client 启用
# 2 = server 启用
# 3 = client + server (推荐)
net.ipv4.tcp_fastopen = 3

# server 端 listen socket 必须设
setsockopt(s, SOL_TCP, TCP_FASTOPEN, &(int){65535}, sizeof(int));

# Nginx
listen 80 fastopen=256;
```

### 5.3 客户端用法

```c
// 不用 connect(),直接 sendto:
sendto(s, data, len, MSG_FASTOPEN, (struct sockaddr*)&server, sizeof(server));
```

或者更新方式:`TCP_FASTOPEN_CONNECT` socket 选项,然后正常 write。

### 5.4 实战考量

**优点**:
- 短连接场景省 1 RTT(几十 ms)
- 类似 QUIC 0-RTT 的效果(但只在重复连接)

**缺点 / 限制**:
- 中间盒不友好(部分 NAT 会丢含数据的 SYN)
- 第一次连接没用,只对重复连接生效
- 重放风险(server 拿到 SYN 数据就处理,要求幂等)

> 经验法则:**TFO 适合幂等的小请求**(GET / health check)——POST 之类不能用,有重放风险。

---

## 六、拥塞算法:BBR 上线 Checklist

参考 13 篇——BBR 在公网神器,但部署有讲究。

### 6.1 切换到 BBR

```bash
# 1. 确认内核支持(Linux 4.9+)
uname -r       # 至少 4.9
modinfo tcp_bbr

# 2. 加载模块
modprobe tcp_bbr

# 3. 查看可用算法
sysctl net.ipv4.tcp_available_congestion_control
# net.ipv4.tcp_available_congestion_control = reno cubic bbr

# 4. 切换默认算法
sysctl -w net.ipv4.tcp_congestion_control=bbr

# 5. 必须配合 fq qdisc(BBR 依赖 pacing)
sysctl -w net.core.default_qdisc=fq
# 或 fq_codel(也支持 pacing)

# 6. 持久化
cat >> /etc/sysctl.conf << EOF
net.core.default_qdisc=fq
net.ipv4.tcp_congestion_control=bbr
EOF
sysctl -p
```

### 6.2 验证生效

```bash
# 全局
sysctl net.ipv4.tcp_congestion_control
# net.ipv4.tcp_congestion_control = bbr

# 单连接
ss -tin
ESTAB ... bbr wscale:7,7 rto:213 ...
            ↑ 用上 BBR 了

# 看 qdisc
tc qdisc show dev eth0
# qdisc fq 8001: root refcnt 2 limit 10000p flow_limit 100p ...
```

### 6.3 BBR 不该用的场景

```
× 数据中心内部(低 RTT 低丢包)→ CUBIC 或 DCTCP 更合适
× 共享公司链路(BBR 抢带宽,挤掉 CUBIC 同事)
× 严格 SLA 要求公平性的环境
```

### 6.4 BBR 上线 checklist

- [ ] 内核 ≥ 4.9
- [ ] `modprobe tcp_bbr` 成功
- [ ] `tcp_congestion_control = bbr`
- [ ] `default_qdisc = fq` 或 `fq_codel`
- [ ] `ss -tin` 看到连接确实在用 bbr
- [ ] 灰度 5% 观察 1 周(P99 / 重传率 / 上下游反馈)
- [ ] 全量上线 + 监控 P50 / P99 / 重传 / 吞吐
- [ ] 文档记录回滚方法(改回 cubic 一键 sysctl)

---

## 七、ss -i:看每个连接的内核状态

参考 13 篇——这是 TCP 调优的瑞士军刀,比 tcpdump 更高效。

### 7.1 一个完整输出

```bash
ss -tin

ESTAB  0  256  10.0.0.5:55001  1.2.3.4:443
       bbr wscale:7,7 rto:212 rtt:11.5/2.5 ato:40 mss:1448 
       pmtu:1500 rcvmss:1448 advmss:1448 
       cwnd:100 ssthresh:7 
       bytes_sent:5234567 bytes_acked:5230000 bytes_received:1234567 
       segs_out:3500 segs_in:2400 
       data_segs_out:3000 data_segs_in:2000 
       send 100Mbps lastsnd:8 lastrcv:8 lastack:8 
       pacing_rate 110Mbps delivery_rate 95Mbps app_limited 
       busy:5234ms 
       retrans:0/2 dsack_dups:0 rcv_rtt:14 rcv_space:14600 
       rcv_ssthresh:65535 minrtt:11.2
       
       bbr:(bw:100Mbps,mrtt:11.2,pacing_gain:1.25,cwnd_gain:2)
```

### 7.2 关键字段速查

| 字段 | 看什么 |
| --- | --- |
| `cubic / bbr` | 拥塞算法 |
| `rto:212` | 重传超时(ms) |
| `rtt:11.5/2.5` | 平滑 RTT 11.5ms,RTT 方差 2.5ms |
| `cwnd:100` | 拥塞窗口(MSS 数) |
| `ssthresh:7` | 慢启动阈值 |
| `send 100Mbps` | 当前发送速率 |
| `pacing_rate 110Mbps` | pacing 速率(BBR 用) |
| `delivery_rate 95Mbps` | 实际投递速率 |
| `retrans:0/2` | 当前重传 / 总重传 |
| `minrtt:11.2` | 历史最小 RTT(BBR 的 RTprop) |
| `app_limited` | 应用没数据可发(不是网络限制) |
| `bbr:(...)` | BBR 内部状态 |

### 7.3 常用过滤

```bash
# 只看建立的
ss -tan state established

# 按端口
ss -tin sport = :443

# 按对端
ss -tin dst 1.2.3.4

# 按 ESTABLISHED 数量排序
ss -tan | awk '$1=="ESTAB"{print $5}' | sort | uniq -c | sort -rn | head

# 看 socket 扩展统计
ss -tane | head
```

---

## 八、其他常用 sysctl

### 8.1 启用 TCP 时间戳与 SACK

```bash
# 默认都开,无需调
net.ipv4.tcp_timestamps = 1     # 必开:RTT 测量 + PAWS
net.ipv4.tcp_sack = 1           # 必开:精准重传
net.ipv4.tcp_window_scaling = 1 # 必开:大窗口
net.ipv4.tcp_dsack = 1          # 推荐开:D-SACK
```

### 8.2 减小重试次数

```bash
# SYN 重传(connect 超时)
net.ipv4.tcp_syn_retries = 3        # 默认 6,3 次约 7 秒后放弃

# SYN+ACK 重传(防 SYN flood)
net.ipv4.tcp_synack_retries = 2     # 默认 5,2 次约 6 秒后放弃

# 数据重传次数
net.ipv4.tcp_retries1 = 3           # 软重试,触发路由探测
net.ipv4.tcp_retries2 = 8           # 硬重试,默认 15(约 15 分钟),太长
```

### 8.3 keepalive(参考 14 篇)

```bash
net.ipv4.tcp_keepalive_time = 600       # 默认 7200,缩到 10 分钟
net.ipv4.tcp_keepalive_intvl = 30       # 默认 75
net.ipv4.tcp_keepalive_probes = 3       # 默认 9
```

### 8.4 文件描述符上限(应用层)

```bash
# 系统级
fs.file-max = 1000000

# 进程级(/etc/security/limits.conf)
*    soft  nofile  1000000
*    hard  nofile  1000000
```

---

## 九、完整 sysctl 配置:高并发 Web 服务器

把所有调优合一份配置:

```bash
# /etc/sysctl.d/99-tcp-tuning.conf
# 高并发 Web 服务器 TCP 调优(适用 Nginx / Envoy / 网关 / 反代)
# 假设场景:几十万并发 + 中等吞吐 + 公网混合 + 长短连接都有

#-------- 文件描述符 --------
fs.file-max = 1000000

#-------- core 缓冲区 --------
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.core.rmem_default = 262144
net.core.wmem_default = 262144

#-------- 网卡软中断队列 --------
net.core.netdev_max_backlog = 65536

#-------- 全连接队列上限 --------
net.core.somaxconn = 65535

#-------- 默认 qdisc(BBR 必须 fq) --------
net.core.default_qdisc = fq

#-------- TCP 缓冲区(auto-tune) --------
net.ipv4.tcp_rmem = 4096 87380 16777216
net.ipv4.tcp_wmem = 4096 65536 16777216
net.ipv4.tcp_mem = 786432 1048576 1572864

#-------- TCP 选项(必开) --------
net.ipv4.tcp_timestamps = 1
net.ipv4.tcp_sack = 1
net.ipv4.tcp_window_scaling = 1
net.ipv4.tcp_dsack = 1

#-------- 半连接队列与 SYN flood 防御 --------
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.tcp_syncookies = 1
net.ipv4.tcp_synack_retries = 2
net.ipv4.tcp_syn_retries = 3

#-------- TIME_WAIT 处理 --------
net.ipv4.tcp_tw_reuse = 1
# !!! 不要用 tcp_tw_recycle,已在 4.12+ 移除 !!!
net.ipv4.tcp_max_tw_buckets = 1048576
net.ipv4.tcp_fin_timeout = 30
net.ipv4.ip_local_port_range = 1024 65535

#-------- keepalive(默认 2 小时太长)--------
net.ipv4.tcp_keepalive_time = 600
net.ipv4.tcp_keepalive_intvl = 30
net.ipv4.tcp_keepalive_probes = 3

#-------- 重传次数(避免长时间挂死)--------
net.ipv4.tcp_retries2 = 8

#-------- 拥塞控制(BBR for 公网,CUBIC for 内网)--------
net.ipv4.tcp_congestion_control = bbr

#-------- TCP Fast Open(短连接场景)--------
net.ipv4.tcp_fastopen = 3

#-------- ECN(可选,中间盒兼容性差)--------
# net.ipv4.tcp_ecn = 1

#-------- 关闭一些不需要的 --------
net.ipv4.tcp_no_metrics_save = 1   # 别保存历史 metric(避免老数据影响新连接)
```

### 9.1 应用配套

**Nginx**:

```nginx
worker_rlimit_nofile 1000000;
events {
    worker_connections 65535;
    use epoll;
    multi_accept on;
}

http {
    keepalive_timeout 60;
    keepalive_requests 10000;
    
    # 上游连接池
    upstream backend {
        server 10.0.0.10:80;
        keepalive 256;
    }
    
    server {
        listen 80 backlog=65535 fastopen=256 reuseport;
        # ...
    }
}
```

**应用代码**:

```c
// 必加
setsockopt(s, IPPROTO_TCP, TCP_NODELAY, &(int){1}, sizeof(int));
setsockopt(s, SOL_SOCKET, SO_KEEPALIVE, &(int){1}, sizeof(int));
setsockopt(s, SOL_SOCKET, SO_REUSEADDR, &(int){1}, sizeof(int));
setsockopt(s, SOL_SOCKET, SO_REUSEPORT, &(int){1}, sizeof(int));  // 多进程同端口
```

### 9.2 应用配置:Java

```bash
# JVM
-Xmx4g
-Dsun.net.useExclusiveBind=false   # 允许 SO_REUSEADDR

# Tomcat
server.tomcat.accept-count=65535
server.tomcat.max-connections=100000
```

### 9.3 应用配置:Go

```go
// Go 1.19+ 自动用 /proc/sys/net/core/somaxconn,但旧版要手动
// 见 https://pkg.go.dev/net#Listen

// HTTP server 配 keepalive
srv := &http.Server{
    ReadTimeout:  60 * time.Second,
    WriteTimeout: 60 * time.Second,
    IdleTimeout:  120 * time.Second,
}
```

---

## 十、调优后验证

### 10.1 压测对比

```bash
# 压测前后对比
wrk -t 16 -c 1000 -d 60s http://localhost/

# Before: Requests/sec: 50000, Latency p99: 200ms
# After:  Requests/sec: 200000, Latency p99: 30ms
```

### 10.2 上线监控指标

```bash
# 重传率
nstat -az | grep -i 'tcpext.*retrans'

# TIME_WAIT 数量
ss -tan state time-wait | wc -l

# 队列溢出(应该一直是 0)
nstat -az | grep -i 'listen|drop|overflow'

# 端口耗尽
nstat -az | grep -i 'TcpExtTCPMemoryPressures'
```

### 10.3 持续观察

```
头 24 小时:
  P50 / P99 延迟、QPS、错误率、连接数、TIME_WAIT、CLOSE_WAIT
头 1 周:
  内存占用、CPU、特殊路径(跨国客户)的表现
```

---

## 十一、传输层完结综述

走完 11-16 这 6 篇,**整个传输层**应该有一张清晰的认知地图:

```
UDP (11):     无状态、无控制、无连接
              ↓ 用作 DNS / 视频 / 游戏 / QUIC 底层
              
TCP (12-14):  状态机(11 状态)、握手挥手、流控拥塞、SACK / TFO 等
              ↓ 用作 HTTP / SSH / 数据库 / 99% 的服务
              
新协议 (15):  MPTCP / SCTP 解决 TCP 局限
              但败给中间盒,只在小众场景活
              ↓ 思想被 QUIC 内化
              
调优 (16):    把所有理论落到 sysctl
              buffer / 队列 / TW / 拥塞 / TFO 五件事
```

**回答 00 写作计划里那三个白板题**:

1. **「为什么 TLS 1.3 比 1.2 少一个 RTT」**——下一阶段 19 篇会答
2. **「为什么 BBR 在公网比 CUBIC 抗丢包,但内网两者差不多」**——本章 + 13 篇:BBR 不靠丢包估带宽,内网丢包接近 0,两者算法都能跑满
3. **「为什么我的服务 P99 抖动来自 TIME_WAIT 撑爆 socket 表」**——本章 + 12 篇:TIME_WAIT 占四元组,加 `tcp_tw_reuse + ip_local_port_range` 调大

---

## 十二、踩坑提醒

1. **抄网上 sysctl 不思考** —— 不同业务侧重不同,理解每一行
2. **buffer 加到无限大** —— 内存爆,且 auto-tune 已经够用
3. **somaxconn 改了不改应用 listen backlog** —— 等于没改
4. **使用 tcp_tw_recycle** —— 已被 Linux 4.12 移除,见到立刻删
5. **BBR 不配 fq qdisc** —— pacing 失效,效果打折
6. **以为 keepalive 默认就工作** —— 默认 2 小时空闲才探,等于没用
7. **不开 TCP_NODELAY** —— 小请求场景 P99 必爆
8. **应用代码里 listen(fd, 5)** —— 5 是 socket(2) man 的传统例子,实际生产要 65535
9. **TFO 用在非幂等接口** —— 重放风险
10. **改 sysctl 不持久化** —— 重启就没了,放 `/etc/sysctl.d/`
11. **在 NAT 后启 PAWS** —— 多 client 时间戳不同步,被丢包
12. **看到 CLOSE_WAIT 多去改内核** —— 应用 bug,不是 TCP 问题
13. **以为换 BBR 就万事大吉** —— 共享链路对邻居不公平
14. **不用 ss -i 看每连接状态** —— 抓包代价太大,90% 问题 ss 能定位
15. **以为 TCP 调优就能解决一切** —— DNS / TLS / 应用层 / 系统调用全都可能是瓶颈

---

下一篇:`17-密码学基础.md`,**进入 TLS 与密码学体系**——对称加密(AES)、非对称加密(RSA / 椭圆曲线)、Hash(SHA-2/3)、HMAC、密钥交换(DH / ECDH)、数字签名(ECDSA / Ed25519),以及为什么 TLS 1.3 把这些拼成一个「1 RTT + 安全」的握手协议。**TLS 没有密码学基础就是天书**——这一篇是 18-21 四篇 TLS 详解的入门票。
