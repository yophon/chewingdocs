# TCP 三次握手与四次挥手

「TCP 握手是三次」这句话每个程序员都会说,但 90% 的人画不出三次握手的完整序列号变化、说不清半连接队列和全连接队列的区别、答不出 TIME_WAIT 为什么必须存在 60 秒——**而这些细节,正是高并发服务器调优的核心**。本章把 TCP 连接的「生」(三次握手)、「死」(四次挥手)、「11 状态机」三件事一次讲穿——**画三张大 ASCII 图,记一辈子**。

> 一句话先记住:**TCP 是一个 11 状态的状态机**。生:三次握手(`CLOSED → SYN_SENT → ESTABLISHED` / `LISTEN → SYN_RCVD → ESTABLISHED`)。死:四次挥手(主动方走 `FIN_WAIT_1 → FIN_WAIT_2 → TIME_WAIT → CLOSED`,被动方走 `CLOSE_WAIT → LAST_ACK → CLOSED`)。**TIME_WAIT 是给主动关闭方的「2 MSL 守墓期」**——为了让对面的 FIN 重传能找到自己应答,以及让本次连接的迷路包自然死掉。**SYN flood 攻击就是攻击半连接队列**——SYN cookie 是反击武器。

---

## 一、为什么是三次握手而不是两次或四次

上一篇 11 讲完了 UDP——零握手、零状态。TCP 反过来,**为了「可靠 + 有序 + 流控」三件事,先把状态建起来**。

### 1.1 两次握手为什么不够

```
client                                server
  │── SYN seq=x ─────────────────────>│
  │<── SYN+ACK seq=y, ack=x+1 ──────│
  │                                    │
                                  client 已经 ESTABLISHED
                                  开始发数据
                                    │
   ↑↑↑ 但 client 不知道 server 有没有收到自己的 SYN ↑↑↑
```

**两次握手的根本问题**:

```
场景 1:client 的旧 SYN 包在网络里漂了好几分钟,延迟到达
        server 收到老 SYN,回 SYN+ACK,以为新连接成立了
        client 早就关了,根本不会响应
        server 一直等,资源浪费 → 「幽灵连接」
```

**所以需要第三次——让 server 也确认「client 真的还活着」**。

### 1.2 四次握手为什么浪费

理论上,server 收到 SYN 后可以分两步:**先 ACK 你的 SYN**,**再单独发我的 SYN**。但既然两个动作可以在同一个包里完成(SYN + ACK 标志位都置上),**合成一次发就能省一个 RTT**。

```
   两次:不可靠
   三次:刚好够用 ← TCP 的选择
   四次:浪费 RTT
```

> 经验法则:**三次握手 = 双方各发一次 SYN,各确认一次,合并中间那次**。这是「最少消息数完成双向状态同步」的理论最优解。

---

## 二、三次握手:序列号、ACK、半连接队列

### 2.1 完整时序图

```
client                                                  server
state: CLOSED                                          state: LISTEN
                                                       (已 socket+bind+listen)
  │
  │ socket() / connect()
  │
  │── seq=x, SYN ──────────────────────────────────>│
  │   (SYN 标志位置 1, 初始序列号 x = ISN_c)         │
  │                                                  │
state: SYN_SENT                                      state: SYN_RCVD
                                                     (放入半连接队列 SYN backlog)
                                                      │
  │<── seq=y, ack=x+1, SYN+ACK ───────────────────│
  │   (server 也发自己的 SYN, 序列号 y = ISN_s)    │
  │   (确认收到 client 的 SYN, ack = x+1)           │
  │                                                  │
state: ESTABLISHED                                    │
                                                      │
  │── seq=x+1, ack=y+1, ACK ──────────────────────>│
  │   (确认收到 server 的 SYN, ack = y+1)            │
  │                                                  │
                                                state: ESTABLISHED
                                                (从半连接队列移到全连接队列)
                                                (accept() 返回新 fd)
  │                                                  │
  │── 数据 (seq=x+1, ack=y+1, PSH+ACK) ──────────>│
  │                                                  │
```

**关键点**:

1. **ISN(Initial Sequence Number)随机生成** —— 不能从 0 开始,否则攻击者能预测序列号伪造包(RFC 6528 用伪随机)
2. **SYN 自己也占一个序列号** —— 所以 ack 是 x+1,不是 x
3. **第三次 ACK 可以带数据**(称为 piggyback)—— 节省 1 RTT,但实际很少用
4. **半连接队列 ≠ 全连接队列** —— 这是 SYN flood 的关键

### 2.2 半连接队列 vs 全连接队列

```
client SYN 进来
   ↓
[半连接队列 (SYN queue)] ← 状态 SYN_RCVD,server 已发 SYN+ACK,等 client 的 ACK
   ↓ (ACK 到达)
[全连接队列 (Accept queue)] ← 状态 ESTABLISHED,等应用 accept()
   ↓ (应用 accept())
应用拿到 fd,正常 read/write
```

**两个队列对应的 sysctl**:

| 参数 | 默认值 | 意义 |
| --- | --- | --- |
| `net.ipv4.tcp_max_syn_backlog` | 128-1024 | 半连接队列长度 |
| `net.core.somaxconn` | 128(老)/ 4096(新) | 全连接队列上限 |
| listen(fd, **backlog**) | 应用指定 | 实际全连接队列长度 = `min(backlog, somaxconn)` |

**半连接队列满了会怎样**:

- 默认丢弃新 SYN(client 收不到 SYN+ACK,几秒后超时重传)
- 开启 `tcp_syncookies=1` 后,内核不放队列,**用 cookie 算出有效响应**(SYN flood 防御核心)

**全连接队列满了会怎样**:

- 默认行为:server 直接丢掉 client 的 ACK(client 觉得已经 ESTABLISHED,但 server 什么都没建)
- `net.ipv4.tcp_abort_on_overflow=1` 时:server 发 RST 直接拒绝(client 立刻报错,比超时好排查)

```bash
# 看全连接队列溢出
ss -lnt
State   Recv-Q   Send-Q   Local Address:Port
LISTEN  0        128      *:80                  ← Send-Q=128 是 backlog,Recv-Q=0 是当前队列长度

# 历史溢出统计
nstat -az | grep -i listen
TcpExtListenOverflows         3245   ← 全连接队列溢出过 3245 次
TcpExtListenDrops             3245   ← 因此丢的连接数
```

> 踩坑提醒:**Nginx / Java 应用看着 ESTABLISHED 数量正常,但 client 抱怨连接超时** —— 多半是 listen 队列溢出,看 `ListenOverflows`。

---

## 三、四次挥手:谁主动关谁有 TIME_WAIT

### 3.1 完整时序图

```
client                                              server
state: ESTABLISHED                                  state: ESTABLISHED
  │
  │ close() / shutdown(fd, SHUT_WR)
  │
  │── seq=u, FIN+ACK ─────────────────────────────>│
  │                                                 │
state: FIN_WAIT_1                                   │
                                                    │
  │<── seq=v, ack=u+1, ACK ─────────────────────│
  │                                                 │
state: FIN_WAIT_2                              state: CLOSE_WAIT
                                               (server 应用还没 close,可继续发数据)
                                                    │
  │<── 数据 (server 还能发) ───────────────────│
  │                                                 │
                                               server 应用 close()
                                                    │
  │<── seq=w, ack=u+1, FIN+ACK ─────────────────│
  │                                                 │
state: TIME_WAIT                              state: LAST_ACK
                                                    │
  │── seq=u+1, ack=w+1, ACK ──────────────────>│
  │                                                 │
                                              state: CLOSED
                                                    
state: TIME_WAIT (持续 2 MSL = 60 秒)
       │
       │ (2 MSL 后)
       ↓
state: CLOSED
```

**为什么是四次不是三次**:

- 三次握手时,server 的「ACK 你的 SYN」和「我的 SYN」可以合并(都是控制消息,无延迟)
- 四次挥手时,server 收到 FIN 后**应用层不一定立刻 close**——可能还在发数据(server 处于 CLOSE_WAIT 状态)
- 等 server 应用 close 了,才发自己的 FIN
- **所以 ACK 和 FIN 不能合并,必须分开**(除非应用立刻 close,这种情况下也确实会合并成「三次挥手」)

### 3.2 半关闭(half-close)

`shutdown(fd, SHUT_WR)` 只关写不关读——**「我说完了,但还想听你说」**:

```
client → server: shutdown(SHUT_WR) 发 FIN
server → client: 还能发数据(client 用 read 收)
server → client: server 自己 close 后发 FIN
client → server: 收到 FIN,read 返回 0
```

**典型场景**:

- HTTP/1.0 客户端发完请求,shutdown 写,等服务器返回所有响应数据再断
- shell 命令行 `cat file | nc host port` —— `nc` 发完 stdin 关闭写,等服务器响应

### 3.3 谁主动关闭谁有 TIME_WAIT

**记住一句话**:**主动调用 close 的那一方,会经过 TIME_WAIT**。

- 客户端主动断 → 客户端 TIME_WAIT
- 服务器主动断 → **服务器 TIME_WAIT**(常见高并发问题)

```bash
ss -tan | awk 'NR>1 {print $1}' | sort | uniq -c
   23456 TIME-WAIT       ← 这个数字大就头疼
     876 ESTABLISHED
       4 LISTEN
```

---

## 四、TIME_WAIT 为什么是 2 MSL = 60 秒

**MSL = Maximum Segment Lifetime,IP 包在网络中最长存活时间,RFC 793 定为 2 分钟,Linux 实现为 30 秒**。所以 TIME_WAIT = 2 × 30 = **60 秒**。

### 4.1 为什么需要 TIME_WAIT

**两个理由**:

#### 理由 1:让对面的 FIN 重传有应答

```
TIME_WAIT 状态下:
  client 已发 ACK,但这个 ACK 可能丢
  server 收不到 ACK,会重传 FIN
  client 必须还在「能响应 ACK」的状态
        ↓
  如果 client 立刻 CLOSED 释放四元组
  收到重传的 FIN 会回 RST,server 看到不正常关闭报错
```

**所以 TIME_WAIT 必须留一段时间,接住可能重传的 FIN**。

#### 理由 2:让本次连接的迷路包死掉

```
本次连接用的四元组(client_ip:port → server_ip:port)
        ↓
  如果立刻关闭并复用同样四元组
  此前迷路的旧包(还没死)突然到达,被新连接当成自己的数据
        ↓
  数据错乱,且无法检测
```

**2 MSL 是「让任何旧包都自然过期」的保险**——一去一回最多 2 个 MSL。

### 4.2 TIME_WAIT 的真实代价

```
高并发 server 主动断连
        ↓
TIME_WAIT 累积到几万、几十万
        ↓
1. 占内存(每个约 0.5 KB)
2. 占四元组(同一对 IP 端口对的可用范围被锁住)
3. ip_local_port_range 端口耗尽,新连接 connect 失败
```

**举例**:client 每秒 1000 次连接到同一 server,**每个连接 TIME_WAIT 60 秒**:

```
积累 TIME_WAIT 数 = 1000 × 60 = 60000 个
ip_local_port_range 默认 32768-60999 = ~28000 个端口
        ↓
端口耗尽,新连接失败
```

### 4.3 怎么缓解

详见 16 篇调优——这里先列要点:

| 方案 | 配置 | 说明 |
| --- | --- | --- |
| **客户端复用端口** | `net.ipv4.tcp_tw_reuse=1` | TIME_WAIT 状态下的端口可被新连接复用(用时间戳防迷路包) |
| **不要用 tcp_tw_recycle** | (已被 Linux 4.12 移除) | 在 NAT 环境下会乱杀连接 |
| **加大端口范围** | `net.ipv4.ip_local_port_range="1024 65535"` | 给客户端更多临时端口 |
| **复用连接** | HTTP keep-alive / 数据库连接池 | 根本解决:别频繁建连 |
| **server 不主动断** | 长连接 | 把 TIME_WAIT 推给 client |

> 经验法则:**TIME_WAIT 不是 bug,是设计**——它在保护你。要解决「TIME_WAIT 过多」,首选「不要频繁建短连接」,而不是粗暴关闭。

---

## 五、TCP 11 状态机:画一遍记一辈子

```
                                  +---------+
                                  | CLOSED  | ← 起点 / 终点
                                  +----+----+
                                       │
                  passive open (listen)│ active open (connect)
                                       │ → 发 SYN
                                       │
                       +---------------+----------------+
                       │                                │
                       ↓                                ↓
                  +---------+                      +-----------+
                  | LISTEN  |                      | SYN_SENT  |
                  +----+----+                      +-----+-----+
                       │                                 │
                  收到 SYN                          收到 SYN+ACK
                  → 发 SYN+ACK                     → 发 ACK
                       │                                 │
                       ↓                                 │
                  +-----------+                          │
                  | SYN_RCVD  |                          │
                  +-----+-----+                          │
                        │                                │
                   收到 ACK                              │
                        │                                │
                        └────────────┬───────────────────┘
                                     ↓
                              +-------------+
                              | ESTABLISHED |  ← 数据传输状态
                              +------+------+
                                     │
                  ╔══════════════════╧═════════════════╗
                  ║                                    ║
              主动关闭                              被动关闭
              (调 close)                            (收到 FIN)
                  ║                                    ║
                  ↓ 发 FIN                       ↓ 发 ACK
              +------------+                 +-------------+
              | FIN_WAIT_1 |                 | CLOSE_WAIT  |
              +-----+------+                 +------+------+
                    │                               │
        ┌───────────┼───────────┐                  │
        │           │           │           应用 close()
        │           │           │                  │
   收 ACK    收 ACK+FIN     收 FIN              发 FIN
        │           │           │                  ↓
        ↓           │           ↓           +-----------+
   +------------+   │      +---------+      | LAST_ACK  |
   | FIN_WAIT_2 |   │      | CLOSING |      +-----+-----+
   +-----+------+   │      +----+----+            │
         │          │           │            收 ACK
    收 FIN          │     收 ACK                  ↓
         │          │           │            +--------+
         ↓          │           ↓            | CLOSED |
     +-----------+  │      +-----------+     +--------+
     | TIME_WAIT |<─┘      | TIME_WAIT |
     +-----+-----+         +-----+-----+
           │                     │
           └──── 2 MSL = 60 秒 ──┘
                       │
                       ↓
                  +--------+
                  | CLOSED |
                  +--------+
```

### 5.1 11 个状态各自做什么

| 状态 | 含义 | 触发 |
| --- | --- | --- |
| **CLOSED** | 关闭(初始) | socket 还没建 / 关完 |
| **LISTEN** | 监听 | server 调用 listen |
| **SYN_SENT** | 已发 SYN,等 SYN+ACK | client 调用 connect |
| **SYN_RCVD** | 已发 SYN+ACK,等 ACK | server 收到 client SYN |
| **ESTABLISHED** | 已建立连接,正常数据 | 三次握手完成 |
| **FIN_WAIT_1** | 主动方已发 FIN,等对方 ACK | 应用 close |
| **FIN_WAIT_2** | 已收对方 ACK,等对方 FIN | 半关闭中 |
| **CLOSE_WAIT** | 被动方收 FIN,自己还能发数据 | 收到对方 FIN |
| **CLOSING** | 罕见,双方同时 close | 同时关闭 |
| **LAST_ACK** | 被动方已发 FIN,等对方 ACK | 被动方应用 close |
| **TIME_WAIT** | 主动方等待 2 MSL | 收到对方 FIN |

### 5.2 异常状态:CLOSE_WAIT 大量堆积

**最常见的 bug 信号**:`netstat -an | grep CLOSE_WAIT | wc -l` 数字大。

**意义**:**对方关了连接(发了 FIN),你的应用没 close**——典型「应用代码漏调 close」、「死循环里没释放 fd」、「某个异常没走 finally 释放 socket」。

```bash
ss -tan state close-wait
# 数量大 → 应用 bug,排查代码
```

**这个状态不会自动结束**——只有应用主动 close 才能往 LAST_ACK 转移。

### 5.3 异常状态:FIN_WAIT_2 持续不变

**主动方发了 FIN,收到对方 ACK,但对方应用一直不 close**(对方处于 CLOSE_WAIT)——主动方就一直停留在 FIN_WAIT_2。

**Linux 给了一个超时**:`net.ipv4.tcp_fin_timeout=60`(默认 60 秒)——超时后自动转 CLOSED,防止泄露。

---

## 六、看本机连接状态

```bash
# 列所有 TCP 连接 + 状态
ss -tan

# 按状态聚合
ss -tan | awk '{print $1}' | sort | uniq -c | sort -rn
   1234 ESTAB
    234 TIME-WAIT
     45 CLOSE-WAIT
      4 LISTEN

# 看监听端口的队列
ss -lnt
State   Recv-Q   Send-Q   Local Address:Port
LISTEN  0        128      0.0.0.0:80          ← Send-Q = backlog
LISTEN  3        128      0.0.0.0:443         ← Recv-Q = 当前等 accept 的连接数

# 看连接的 cwnd / rtt(详见 13/16 篇)
ss -tin
```

---

## 七、SYN Flood 攻击与防御

### 7.1 攻击原理

```
攻击者源 IP 伪造,大量发 SYN 包
        ↓
server 进入 SYN_RCVD,发 SYN+ACK,放半连接队列
        ↓
SYN+ACK 发到伪造 IP,要么没人响应,要么响应 RST 但中间防火墙丢
        ↓
半连接队列瞬间打满,真用户 SYN 进不来
        ↓
拒绝服务
```

**单个连接占用资源**:几百字节内存 + 一个表项。

**攻击成本**:1Gbps 带宽 = 每秒约 200 万个 SYN(64 字节包)= 几秒打满一个普通服务器的半连接队列。

### 7.2 防御 1:SYN Cookie

**核心思路**:**「不存半连接,用算出来的 cookie 验证」**。

```
正常流程:
   收到 SYN → 放入半连接队列 → 发 SYN+ACK → 等 ACK → 移到全连接队列
                ↑↑↑ 这里队列会满 ↑↑↑

SYN Cookie 流程:
   收到 SYN → 不放队列
   ↓
   计算 cookie = hash(client_ip, client_port, server_ip, server_port, secret, time)
   ↓
   把 cookie 当作 ISN_s 发给 client(SYN+ACK 的 seq=cookie)
   ↓
   client 回 ACK,ack = cookie + 1
   ↓
   server 收到,反算这个 cookie 是否合法,合法就建连接
```

**优点**:**根本不占用半连接队列**,SYN flood 打不动。

**缺点**:**TCP 选项丢失**(因为半连接没存,SYN 里的 MSS / Window Scale / SACK 这些都丢了),可能性能略差。

```bash
# 开启 SYN cookie(默认就是 1)
sysctl net.ipv4.tcp_syncookies=1

# 看是否触发过(说明被攻击或队列小)
nstat -az | grep -i syncookie
TcpExtSyncookiesSent      0
TcpExtSyncookiesRecv      0
TcpExtSyncookiesFailed    0
```

### 7.3 防御 2:SYN Proxy(中间盒方案)

**云厂商 / DDoS 清洗中心**用的方案——**在边缘代理上完成握手,真用户的 ACK 才转发到后端**:

```
attacker SYN ──→ 边缘代理 ──→ 后端 server
                  │ 自己回 SYN+ACK
                  │ 等 ACK
                  │ ↓ 收到 ACK 才知道真用户
                  └─→ 跟后端建连接 → 把数据转发
```

边缘代理用专用硬件 / DPDK,**单机能扛 100 Gbps SYN flood**。

### 7.4 其他配套配置

```bash
# 加大半连接队列
sysctl net.ipv4.tcp_max_syn_backlog=65535

# 减少 SYN+ACK 重传次数(快速放弃)
sysctl net.ipv4.tcp_synack_retries=2

# 启用 SYN cookie
sysctl net.ipv4.tcp_syncookies=1
```

> 经验法则:**SYN flood 防御三板斧**:`tcp_syncookies=1` + `tcp_max_syn_backlog` 调大 + `tcp_synack_retries` 调小到 2-3。云上还要加 DDoS 清洗。

---

## 八、用 tcpdump 抓握手 / 挥手

```bash
# 抓 80 端口三次握手 + 挥手
sudo tcpdump -i any -nn 'tcp port 80 and (tcp[tcpflags] & (tcp-syn|tcp-fin) != 0)'

# 输出示例
14:01:23.123 IP 10.0.0.5.55001 > 1.2.3.4.80: Flags [S], seq 1234567890, ...
14:01:23.180 IP 1.2.3.4.80 > 10.0.0.5.55001: Flags [S.], seq 9876543210, ack 1234567891, ...
14:01:23.181 IP 10.0.0.5.55001 > 1.2.3.4.80: Flags [.], ack 9876543211, ...
                                              ↑ 三次握手完成
... 数据交互 ...
14:01:25.500 IP 10.0.0.5.55001 > 1.2.3.4.80: Flags [F.], seq 1234567950, ack 9876544000
14:01:25.555 IP 1.2.3.4.80 > 10.0.0.5.55001: Flags [.], ack 1234567951
14:01:25.556 IP 1.2.3.4.80 > 10.0.0.5.55001: Flags [F.], seq 9876544000, ack 1234567951
14:01:25.557 IP 10.0.0.5.55001 > 1.2.3.4.80: Flags [.], ack 9876544001
                                              ↑ 四次挥手完成
```

**Wireshark 的 `tcp.flags.syn==1` / `tcp.flags.fin==1` 过滤器** 是抓握手 / 挥手的常用招。

---

## 九、socket 编程:握手 / 挥手对应的 syscall

### 9.1 server 端

```c
int s = socket(AF_INET, SOCK_STREAM, 0);     // → CLOSED
bind(s, ...);
listen(s, 128);                              // → LISTEN

while (1) {
    int c = accept(s, ...);                  // 阻塞等三次握手完成
                                             // 返回时连接已 ESTABLISHED
    
    // ... 收发数据
    
    close(c);                                // 主动方:发 FIN, → FIN_WAIT_1
                                             // 被动方:收 FIN, → CLOSE_WAIT
                                             //         应用 close 后 → LAST_ACK
}
```

### 9.2 client 端

```c
int s = socket(AF_INET, SOCK_STREAM, 0);     // → CLOSED
connect(s, ...);                             // → SYN_SENT
                                             // 阻塞等 SYN+ACK
                                             // 返回时已 ESTABLISHED
// ... 收发数据
shutdown(s, SHUT_WR);                        // 半关闭:只关写,继续读
read(s, buf, n);                             // 等对方关
close(s);                                    // 关读 + 释放 fd
```

### 9.3 异常路径

- **connect 超时** → `net.ipv4.tcp_syn_retries`(默认 6 次,每次翻倍,总耗时约 2 分钟)
- **accept 队列满** → 客户端 connect 成功(三次握手完成),但 accept 拿不到 → 表现为「连上了但没响应」
- **close 后立刻 connect 同样四元组** → `EADDRNOTAVAIL`(端口在 TIME_WAIT)

---

## 十、踩坑提醒

1. **以为 ISN 从 0 开始** —— 必须随机,否则 RST 注入攻击
2. **以为 backlog 就是队列长度** —— Linux 上是 `min(backlog, somaxconn)`,改 listen 不改 sysctl 没用
3. **半连接 / 全连接队列分不清** —— SYN flood 攻半连接,正常爆负载爆全连接
4. **大量 CLOSE_WAIT 找内核** —— 大错,这是应用没调 close,代码 bug
5. **TIME_WAIT 多就 reset 内核** —— 设计如此,改 `tcp_tw_reuse` 而不是关掉
6. **用 `tcp_tw_recycle`** —— Linux 4.12 已移除,NAT 环境下乱杀连接
7. **TIME_WAIT 出现在 server 端** —— 说明 server 主动断,改成 client 主动断 / keep-alive 长连接
8. **以为 shutdown 等于 close** —— shutdown 只关一边,close 才释放 fd
9. **以为 accept 返回就是握手完成** —— 是,但握手在 accept 之前内核已完成,accept 只是从队列取
10. **MSL = 30 秒,TIME_WAIT = 60 秒**(Linux 实现)—— 不是 RFC 的 2 分钟,别说错

---

下一篇:`13-TCP流量控制与拥塞控制.md`,**整个传输层最难的一篇**——滑动窗口怎么动、慢启动为什么慢、CUBIC 那条三次曲线为什么是三次、BBR 凭什么在公网吊打 CUBIC、BBR vs CUBIC 共享链路时谁挤掉谁、`sysctl net.ipv4.tcp_congestion_control` 怎么换算法、`ss -i` 怎么看每个连接的 cwnd / rtt。**TCP 性能调优的核心理论一次讲透**——参考本篇的 11 状态机理解 ESTABLISHED 状态下数据是怎么流动的。
