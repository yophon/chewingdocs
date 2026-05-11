# TCP 高级特性

「TCP 都跑了三十年还有什么新东西」——一句话暴露不懂行。SACK / Window Scaling / 时间戳 这些「TCP 选项」从 RFC 1323 起就在演进,**没这些东西今天 TCP 跑不动 10 Gbps**;Nagle + Delayed ACK 那个臭名昭著的 200ms 延迟陷阱**至今还在坑无数小请求场景**;`SO_KEEPALIVE` 默认 2 小时空闲才探活,**几乎等于没用**——除非你自己把它调小。本章讲 6 个真正决定 TCP 性能/正确性的高级特性,**每一个都是真实生产事故的修复方案**。

> 一句话先记住:**SACK 让重传精准(只重传丢的那段)**、**快重传让 RTO 不再是 1 秒(收到 3 个 dup ACK 立刻重传)**、**Nagle + Delayed ACK 是死亡组合(交互式协议必关 Nagle)**、**Window Scaling 是高带宽必备(默认窗口最大 64 KB,WS 能扩到 1 GB)**、**时间戳让 RTT 测量精准 + 防回绕(PAWS)**、**keepalive 默认 2 小时空闲,几乎等于没用,要自己调**。

---

## 一、SACK:选择性确认

### 1.1 没有 SACK 的痛

参考 13 篇——TCP 用累积 ACK:**ACK n 表示「n 之前的全收到了,期待 n」**。

```
[发送端]                          [接收端]
   │── seq=1 (1KB) ─────────────>│  收到
   │── seq=2 ── 丢 ─ X            │  
   │── seq=3 ─────────────────>│  收到 3,但期待 2
   │── seq=4 ─────────────────>│  收到 4,但期待 2
   │── seq=5 ─────────────────>│  收到 5,但期待 2
   │<── ACK=2 ──────────────────│  ← 第 1 个 dup ACK
   │<── ACK=2 ──────────────────│  ← 第 2 个 dup ACK
   │<── ACK=2 ──────────────────│  ← 第 3 个 dup ACK
   │── seq=2 重传 ────────────>│  
   │── seq=3 重传 ?              │  ← 不知道 3 收没收到
   │── seq=4 重传 ?              │  ← 不知道 4 收没收到
   │── seq=5 重传 ?              │  ← 不知道 5 收没收到
```

**没 SACK 的发送方只知道「2 之后的全没确认」,不知道是「2 丢了 3 4 5 都没到」还是「2 丢了 3 4 5 都到了」**。保守做法:**全部重传 2-5**——浪费带宽。

### 1.2 SACK 选项

RFC 2018,TCP 头加一个选项,接收方告诉发送方:**「我收到了 [3-5]」**

```
[发送端]                              [接收端]
   │── seq=1 ─────────────────────>│  
   │── seq=2 ── 丢 ─ X                │  
   │── seq=3 ─────────────────────>│  收到
   │── seq=4 ─────────────────────>│  收到
   │── seq=5 ─────────────────────>│  收到
   │<── ACK=2, SACK=[3-5] ───────────│  ← 「期待 2,但 3-5 已经收到」
   │── 只重传 seq=2 ───────────────>│  
   │<── ACK=6 ───────────────────────│  
```

**节省了 3 个段的重传**——丢包率高时能差几倍带宽。

### 1.3 看是否启用 SACK

```bash
# 全局开关
sysctl net.ipv4.tcp_sack
# net.ipv4.tcp_sack = 1   ← 默认开

# 抓包看 SYN
tcpdump -nn -vvv 'tcp[tcpflags] & tcp-syn != 0'
# Flags [S], options [mss 1460, sackOK, nop, ...]
#                                ↑ 双方都支持 SACK 才会启用
```

### 1.4 D-SACK:重复 SACK

RFC 2883 扩展——**接收方告诉发送方「这段我之前已经收过」**(去重)。

用途:**让发送方知道「之前认为丢的其实没丢,可能是 RTO 太短或路径乱序」**——发送方可以调大 RTO,避免不必要重传。

> 经验法则:**SACK 默认开,几乎所有现代 TCP 栈都支持**——除非和 1990 年代的设备通信,否则别关。

---

## 二、快重传:不等 RTO 的优化

参考 12 / 13 篇——经典 TCP 等 RTO 超时才重传,**RTO 至少 1 秒(Linux 最小 200ms),交互式响应等不起**。

**快重传**:**收到 3 个相同的 dup ACK 立刻重传那个段**(不等超时):

```
丢一个段 → 后续段收到 → 接收方持续回 ACK=丢的那个序号 → 发送方收到 3 个相同 ACK → 立即重传

时延差:  RTO 重传 = 1 秒
         快重传  = 3 个段时间 = 几十 ms
```

### 2.1 为什么是 3 不是 1 或 2

```
1 个 dup ACK   → 不一定丢,可能只是包乱序
2 个 dup ACK   → 不一定丢,可能短暂乱序
3 个 dup ACK   → 大概率真丢了,触发重传
```

**Linux 现在用「TCP RACK」(Recent ACKnowledgement)** 替代部分快重传逻辑——**基于时间而非计数**,更智能。

### 2.2 快恢复

参考 13 篇——配合快重传,**cwnd 不归零,只缩到一半**:

```
快重传触发 → ssthresh = cwnd / 2 → cwnd = ssthresh + 3 → 直接进拥塞避免

(经典 Reno 是 cwnd=1 重新慢启动,新 BBR / CUBIC 都用快恢复)
```

### 2.3 ER:Early Retransmit

更新优化——**当窗口里只剩 ≤ 4 个包时,2 个 dup ACK 就重传**(因为不可能凑齐 3 个 dup ACK)。

RFC 5827。

```bash
sysctl net.ipv4.tcp_early_retrans
# 0 = 关
# 1 = ER
# 2 = ER + 200ms 延迟
# 3 = TLP (Tail Loss Probe) ← 默认
# 4 = TLP + Reordering Detection
```

**TLP**:连接尾部丢包时(没有更多数据触发 dup ACK),**主动发一个 probe 包探**——避免要等 RTO。

---

## 三、Nagle 算法:小包合并

### 3.1 问题:海量小包

`telnet` / `ssh` / 早期 X11 这种交互式应用——**用户每敲一个字符就发一个包**:

```
"h"   → 1 字节数据 + 40 字节 TCP/IP 头 = 41 字节包
"e"   → 同上
"l"   → 同上
...

数据吞吐效率:1/41 = 2.4%
```

带宽 95% 浪费在头上,叫 「小包雪崩」(silly window syndrome 的一种)。

### 3.2 Nagle 算法(RFC 896)

**「上一个未 ACK 的小包还在路上时,新数据先攒着,凑成大包再发」**:

```
没 Nagle:
  "h" → 立刻发包
  "e" → 立刻发包
  "l" → 立刻发包

有 Nagle:
  "h" → 发包
  "e" → 上一个还没 ACK,先攒着
  "l" → 攒着
  "lo" → 攒着
  "wait" → ACK 来了,把攒的 "ello wait" 一起发
```

**减少小包数**:典型情况 5-10 倍效率提升。

### 3.3 Delayed ACK

接收方的优化——**ACK 不立刻发,攒一会儿(Linux 最长 40ms,默认依赖流量)**:

```
没 Delayed ACK:
  收 1 字节 → 发 1 个 ACK
  收 1 字节 → 发 1 个 ACK
  ↓ 大量 40 字节小 ACK 包

有 Delayed ACK:
  收 1 字节 → 等
  收 1 字节 → 等
  ↓ 攒到 200ms 或有数据要回 piggyback,一起发
```

### 3.4 Nagle + Delayed ACK 的死亡组合

**这两个机制单独看都是优化,合起来就是灾难**:

```
[client]                                [server]
   │── req 100 字节 ─────────────────>│  收到
   │                                    │  
   │   Nagle 等待:                      │  Delayed ACK 等待:
   │   再发的话,要等上个 ACK          │  攒 ACK,等 200ms 或下个数据
   │                                    │  
   │              200ms 等待               │
   │                                    │  
   │<── ACK ─────────────────────────│  ← 200ms 后 timer 到
   │── req 第二段 100 字节 ──────────>│  
   │<── 响应 ──────────────────────│  
```

**典型场景:小请求**(< 1 MSS)**变成 200ms 一发**——P99 直接爆。

> 经验法则:**任何「小消息 + 低延迟」场景必关 Nagle**(redis client / RPC / WebSocket 等)。

### 3.5 TCP_NODELAY:关闭 Nagle

```c
int yes = 1;
setsockopt(s, IPPROTO_TCP, TCP_NODELAY, &yes, sizeof(yes));
```

或者 `TCP_QUICKACK`(关闭 Delayed ACK,临时):

```c
int yes = 1;
setsockopt(s, IPPROTO_TCP, TCP_QUICKACK, &yes, sizeof(yes));
// 注意:这是「下一次 ACK 立即发」,不是永久关
```

**最佳实践**:

| 场景 | TCP_NODELAY | 说明 |
| --- | --- | --- |
| HTTP / RPC / Redis | **开** | 小请求,延迟敏感 |
| 大文件传输 | 关 | 让 Nagle 攒包,效率高 |
| WebSocket / gRPC | **开** | 实时消息推送 |
| ssh / telnet | **开** | 交互式输入 |
| 数据库写日志 | 看场景 | 主要是大批量,关 Nagle 即可 |

**Nginx 默认开 TCP_NODELAY**,Apache 也是。**自己写 socket 程序记得开**。

---

## 四、keepalive:连接探活

### 4.1 为什么要 keepalive

TCP 是状态机,但**不发数据时无法知道对方是否还活着**:

- 对方拔网线 → 你不知道
- 对方电源拔了 → 你不知道
- 中间 NAT 表过期 → 你不知道
- 你以为连接还在,实际是「半开连接」(half-open)

### 4.2 keepalive 机制

开启后,**长时间无数据传输,内核自动发探测包**:

```
[A]                          [B]
 │  没数据 2 小时(默认)
 │── keepalive probe ─────>│
 │<── ACK ──────────────────│  ← B 还活着,继续等
 │
 │  没数据 2 小时
 │── keepalive probe ─────>│
 │  没响应
 │── keepalive probe ─────>│  (75 秒后再探)
 │── keepalive probe ─────>│
 │── keepalive probe ─────>│
 │ (9 次都没响应)
 │
 │  → 内核断开连接,read 返回错误
```

### 4.3 默认参数(Linux)

```bash
sysctl net.ipv4.tcp_keepalive_time     # 7200 秒 = 2 小时(空闲多久开始探)
sysctl net.ipv4.tcp_keepalive_intvl    # 75 秒(每次探的间隔)
sysctl net.ipv4.tcp_keepalive_probes   # 9 次(探几次没响应就断)

# 默认要 2 小时 + 9 × 75 = 2.18 小时才能感知断连
# 这几乎等于没用
```

**生产配置建议**:

```bash
# 5 分钟空闲开始探,30 秒一次,3 次失败就断
sysctl -w net.ipv4.tcp_keepalive_time=300
sysctl -w net.ipv4.tcp_keepalive_intvl=30
sysctl -w net.ipv4.tcp_keepalive_probes=3
```

### 4.4 应用层 vs 内核 keepalive

```
内核 keepalive:无业务感知,纯探活
应用层心跳:可以包含业务信息(序列号 / 状态 / 健康检查)
            可以单连接独立超时
            可以做 active 检查
```

**多数高质量协议都自己做心跳**(MQTT PINGREQ、WebSocket Ping/Pong、gRPC keepalive frames),不依赖内核。

### 4.5 单 socket 启用 keepalive

```c
int yes = 1;
setsockopt(s, SOL_SOCKET, SO_KEEPALIVE, &yes, sizeof(yes));

// 单 socket 自定义参数
int idle = 300;
setsockopt(s, IPPROTO_TCP, TCP_KEEPIDLE, &idle, sizeof(idle));
int intvl = 30;
setsockopt(s, IPPROTO_TCP, TCP_KEEPINTVL, &intvl, sizeof(intvl));
int cnt = 3;
setsockopt(s, IPPROTO_TCP, TCP_KEEPCNT, &cnt, sizeof(cnt));
```

> 经验法则:**默认 keepalive 几乎等于没用**——长连接服务必须把 `tcp_keepalive_time` 调到 5-10 分钟,或者应用层做心跳。

---

## 五、Window Scaling:突破 64 KB

### 5.1 16 bit 窗口的限制

TCP 头里 Window Size 只有 16 bit → **最大 65535 字节(64 KB)**。

**1981 年 RFC 793 设计时**,1 Mbps 链路 / 100 ms RTT,BDP = 1Mbps × 100ms = 12.5 KB——64 KB 绰绰有余。

**今天 1 Gbps 跨国链路**:BDP = 1 Gbps × 100 ms = **12.5 MB** —— 64 KB 只能用 0.5% 带宽。

### 5.2 Window Scaling(RFC 1323 / 7323)

**SYN 阶段协商一个 shift count(0-14)**,实际窗口 = `Window << shift`:

```
shift = 7 → 窗口最大 64K × 128 = 8 MB
shift = 14 → 窗口最大 64K × 16384 = 1 GB
```

**只在 SYN 时协商,握手后不能改**——所以 SYN 包必须开。

### 5.3 抓包看协商

```bash
tcpdump -nn -vvv 'tcp[tcpflags] & tcp-syn != 0'

# Flags [S], options [mss 1460, sackOK, TS val ..., nop, wscale 7]
                                                          ↑ 协商 shift=7
```

### 5.4 配置

```bash
sysctl net.ipv4.tcp_window_scaling
# net.ipv4.tcp_window_scaling = 1   ← 默认开

# 配合 buffer 调大,window 才有意义(参考 13/16 篇)
sysctl net.ipv4.tcp_rmem
# net.ipv4.tcp_rmem = 4096   131072   6291456    ← max=6MB,够 50ms RTT 跨国
```

> 踩坑提醒:**老防火墙 / NAT 不识别 Window Scale 选项**(直接当 0 处理)—— 极端场景下会导致连接卡住。理论 bug,生产已极少遇到。

---

## 六、TCP 时间戳:RTT 测量 + PAWS

### 6.1 时间戳选项(RFC 1323)

每个 TCP 包带两个 32 bit 时间戳:**TSval**(发送时本地时间)、**TSecr**(回显对方上次的 TSval)。

### 6.2 用途 1:精确测 RTT

经典 RTT 测量:**记下发送时间,收到 ACK 时算差**。但**有个段重传过的话,这个 ACK 是确认原段还是重传段?**——算不准。

时间戳:**ACK 里 TSecr = 那个被 ACK 包发出去时的 TSval**——**直接算差就是真实 RTT**,不管重传了几次。

```
发送 seq=100, TSval=1000
ACK seq=100, TSecr=1000

收到 ACK 时本地时间 1050
RTT = 1050 - 1000 = 50ms ✓ 精确
```

### 6.3 用途 2:PAWS 防回绕

序列号是 32 bit → **4 GB 后回绕**。

千兆链路:4 GB / 1 Gbps = 32 秒后回绕。

**问题**:回绕后,新连接的 seq=100 和老连接 4 GB 前的 seq=100 数值一样——**老的迷路包到达,被当成新数据**(数据混乱)。

PAWS(Protect Against Wrapped Sequences):**包里时间戳必须比上次大,否则丢弃**——回绕的老包时间戳老,直接被识别。

### 6.4 配置

```bash
sysctl net.ipv4.tcp_timestamps
# net.ipv4.tcp_timestamps = 1   ← 默认开
```

> 踩坑提醒:**`tcp_tw_recycle` 已经被 Linux 4.12 移除**(参考 12/16 篇),原因之一是 NAT 后的多个 client 时间戳不同步,被 PAWS 误判丢包。

---

## 七、其他 TCP 选项简介

### 7.1 MSS(Maximum Segment Size)

SYN 时协商**单个段最大数据载荷**(不算头):

```
以太网 MTU=1500 → MSS = 1500 - 20 (IP) - 20 (TCP 无选项) = 1460
```

如果链路 MTU 小(VPN 加封装):

```
WireGuard 后:MTU=1420 → MSS = 1380
```

**MSS clamping**:NAT / 路由器看到 SYN 中 MSS,主动改小到合适值——常见做法。

### 7.2 SO_REUSEADDR / SO_REUSEPORT

```c
int yes = 1;
setsockopt(s, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof(yes));  // 端口在 TIME_WAIT 也能 bind
setsockopt(s, SOL_SOCKET, SO_REUSEPORT, &yes, sizeof(yes));  // 多个进程 bind 同端口,内核做负载均衡
```

`SO_REUSEPORT` 是 Nginx / Envoy 高并发的杀手锏(详见 31 篇 epoll)。

### 7.3 TCP Fast Open(TFO)

详见 16 篇——**握手时携带数据**,省 1 RTT。

### 7.4 TCP Cork(Linux 特有)

```c
int yes = 1;
setsockopt(s, IPPROTO_TCP, TCP_CORK, &yes, sizeof(yes));
// ... write 多次
int no = 0;
setsockopt(s, IPPROTO_TCP, TCP_CORK, &no, sizeof(no));
// 取消 cork,内核把攒的全部发出去
```

**比 Nagle 更激进**:**完全不发,直到 cork 关或者 buffer 满 (200ms)**。

适合「先发多个小段然后明确告诉内核可以发了」的场景(比如 HTTP 头 + 体一起发)。

---

## 八、性能调优实战:一个延迟事故

### 8.1 现象

某 RPC 服务 P99 突然从 5ms 涨到 220ms,P50 仍 5ms。

### 8.2 排查

```bash
# 看连接状态
ss -tin sport = :8080
ESTAB ... cubic rtt:5/1 cwnd:200 ...   ← RTT 正常

# 抓包
tcpdump -nn -i any -w trace.pcap port 8080
```

Wireshark 时序图看到:

```
client 发请求 (200 字节)
server 收到,40ms 后才回 ACK
server 处理完,200ms 后 timer 触发,把 ACK 和响应一起发
client 收到 → 总耗时 200+ ms
```

### 8.3 定位

**Nagle + Delayed ACK 死亡组合**:

- server 收 200 字节,Delayed ACK 等 piggyback
- server 应用 100ms 才生成响应
- 期间 client 还有第二段请求要发,但被 Nagle 卡住等第一段 ACK
- 200ms 超时双方才一起发

### 8.4 修复

```c
// client / server 都加
setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &(int){1}, sizeof(int));
```

P99 立刻回到 5ms。

> 经验法则:**RPC / 微服务任何 socket 必加 `TCP_NODELAY`**——这条规则刻在每个 SRE 心里。

---

## 九、命令行检查这些特性

```bash
# 看一个具体连接启用了哪些选项
ss -tin
ESTAB ... wscale:7,7 rto:213 backoff:0 rtt:1.5/0.5 ato:40 mss:1448 
       pmtu:1500 cwnd:10 ssthresh:7 ts sack ecn
                                     ↑↑↑↑↑↑↑↑
                                     启用的选项: ts(时间戳) sack ecn

# 看每个 SYN 协商
tcpdump -nn -vvv 'tcp[tcpflags] & tcp-syn != 0'
# Flags [S], options [mss 1460, sackOK, TS val 12345 ecr 0, nop, wscale 7]
                                  ↑          ↑                     ↑
                                  SACK     时间戳            Window Scale
```

```bash
# 全局 TCP 选项一览
sysctl net.ipv4 | grep -E 'tcp_(sack|timestamps|window_scaling|fack|early_retrans|tcp_keepalive)'
```

---

## 十、踩坑提醒

1. **不开 TCP_NODELAY** —— 小请求场景 P99 直接爆 200ms
2. **关 SACK** —— 公网丢包率高时浪费几倍带宽
3. **依赖默认 keepalive** —— 2 小时探活等于没用,长连接服务必调
4. **以为 Nagle 是 bug** —— 大文件传输不该关
5. **使用 tcp_tw_recycle** —— 已经移除,NAT 后会乱断
6. **Window Scaling 不开** —— 高带宽长链路只能用 0.5% 带宽
7. **以为 MSS 永远 1460** —— VPN / 移动 / IPv6 都不一定
8. **ACK 丢了导致 Zero Window** —— 必须有窗口探测,默认开
9. **TCP_CORK 用完忘关** —— 数据卡 200ms
10. **以为 keepalive 探活就行** —— 应用层心跳更可靠,内核 keepalive 只是兜底

---

下一篇:`15-MPTCP与SCTP.md`,讲两个「**TCP 没普及但思想被 QUIC 内化**」的协议——MPTCP(多路径 TCP,iPhone 把 WiFi 和蜂窝同时跑数据)、SCTP(多流不阻塞,RTC / 信令场景),以及为什么这俩协议躺在 RFC 三十年都没普及——**中间盒不友好**。HTTP/3 / QUIC 在 UDP 之上把它们的核心思想全部实现了。
