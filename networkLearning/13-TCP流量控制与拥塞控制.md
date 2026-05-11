# TCP 流量控制与拥塞控制

「TCP 慢」九成是拥塞控制慢,「TCP 卡」九成是窗口卡。这两个机制一旦搞混,优化就变成乱拍脑袋:开 BBR、加缓冲、改 cwnd——结果性能反而更差。**流量控制和拥塞控制是 TCP 性能的两个独立维度**:前者解决「接收方处理不过来」,后者解决「网络中间塞车」。本章把这两件事拆开讲清楚——再加上 CUBIC 那条三次曲线为什么是三次、BBR 凭什么吊打 CUBIC、为什么 BBR 在共享链路下「不公平」——**所有 TCP 性能调优的理论基础全在这一章**。

> 一句话先记住:**流量控制 ≠ 拥塞控制**。流控用「接收窗口 rwnd」(对方告诉我能收多少),拥塞控制用「拥塞窗口 cwnd」(我自己估算网络能塞多少)。**实际发送窗口 = min(rwnd, cwnd)**——两者取最小。CUBIC 是 Linux 默认拥塞算法,**基于丢包**,公网丢包高时性能差;BBR 是 Google 2016 年发明,**基于带宽和延迟**,公网神器,但在共享链路上对 CUBIC 不公平,会挤掉它。

---

## 一、为什么 TCP 需要两套控制

参考 12 篇的 11 状态机——三次握手后进入 ESTABLISHED,数据开始流动。但**「能发多快」这件事 TCP 不能想发就发**:

```
                    [发送端]                          [接收端]
                       │                                │
                       │── 1 字节 ─────────────────────>│ → 内核 buffer
                       │                                │ → 应用 read 慢,buffer 积满
                       │                                │
                       │── 又来 1 字节 ───────────────>│ → 没地方放,只能丢
                       │                                │
                       问题 1:接收方处理不过来,需要「流控」
                       
                       │                                │
                       │── 大量数据 ───── 网络拥堵 ──── │
                       │                                │
                       │ 路由器 buffer 爆了,丢包      │
                       │ 重传,更堵,雪崩              │
                       │                                │
                       问题 2:网络扛不住,需要「拥塞控制」
```

**两个独立瓶颈,需要两套机制**:

| 控制 | 问题 | 信号 | 解决方案 |
| --- | --- | --- | --- |
| **流量控制** | 接收方慢 | 对方通告的接收窗口 | rwnd(接收窗口) |
| **拥塞控制** | 网络中间塞车 | 丢包 / 延迟变大 | cwnd(拥塞窗口) |

**TCP 实际能发的数据 = `min(rwnd, cwnd)`**——两个窗口取最小,谁是瓶颈谁说了算。

---

## 二、流量控制:滑动窗口与 rwnd

### 2.1 接收窗口 rwnd

TCP 头里有个 16 bit 的 **Window Size** 字段,接收方每发一个 ACK 都告诉发送方:**「我现在还能收 X 字节」**。

```
接收端 socket buffer 总大小:64 KB
应用已读走:        20 KB
内核 buffer 积压:  10 KB
还能接收:         34 KB ← 这就是 rwnd

[发送端]                                 [接收端]
   │                                        │
   │── 数据(50 字节)─────────────────>│  应用没及时 read
   │                                        │  buffer 积累
   │<── ACK,Window=34000 ───────────────│  ← 告诉发送方能收 34 KB
   │                                        │
   │── 数据(34 KB)──────────────────────>│  buffer 满了
   │                                        │
   │<── ACK,Window=0 ────────────────────│  ← 「停发」
   │                                        │
   │   等待...                              │  应用 read 走 10 KB
   │                                        │
   │<── ACK,Window=10000 ────────────────│  ← 「能收 10 KB 了」
```

### 2.2 滑动窗口

```
                    发送方角度
                         
1   2   3   4   5   6   7   8   9   10
└───┘   └─────┘   └─────────┘
已确认  已发送   可发送
                  └──────────┘
                  接收方允许的窗口
                                  └─────┘
                                  不能发送(超窗)
                                  
ACK 来了 → 窗口右移 = 「滑动」
```

窗口左边界 = 已 ACK 的最大字节;右边界 = 左边界 + min(rwnd, cwnd)。

**「滑动」的本质**:**接收方处理掉数据 → 释放 buffer → 通告新窗口 → 发送方又能发**。

### 2.3 0 窗口与窗口探测

接收方说 Window=0,发送方就停发。但万一接收方后来又有空间,**新的 ACK 可能丢**——发送方就一直停。

**窗口探测(Zero Window Probe)**:发送方在 0 窗口期间,**周期性发 1 字节探测**:

```
[发送端]                            [接收端]
   │── 探测 1 字节 ───────────────>│
   │<── ACK Window=0 ───────────────│  ← 还是没空间
   │   (指数退避,等更久再探)         │
   │── 探测 1 字节 ───────────────>│
   │<── ACK Window=4096 ────────────│  ← 终于有空间
   │── 数据 ──────────────────────>│
```

> 经验法则:**抓包看到大量「Zero Window」消息** —— 接收端应用 read 太慢,内核 buffer 撑爆;不是网络问题,是应用瓶颈。

### 2.4 buffer 大小由谁决定

```bash
# 接收 buffer
sysctl net.ipv4.tcp_rmem
# net.ipv4.tcp_rmem = 4096   131072   6291456
#                     min    default   max

# 发送 buffer
sysctl net.ipv4.tcp_wmem
# net.ipv4.tcp_wmem = 4096   16384   4194304
```

应用可以 `setsockopt(SO_RCVBUF / SO_SNDBUF)` 自定义,但**会绕过 Linux auto-tuning**——通常不建议。

详见 16 篇调优。

---

## 三、拥塞控制:cwnd 与四阶段

### 3.1 拥塞控制要解决什么

**1986 年互联网经历了「拥塞崩溃」(Congestion Collapse)**——网络流量增加但有效吞吐反而下降:

```
没有拥塞控制:
  发送端不管网络,持续大流量
        ↓
  路由器 buffer 满,大量丢包
        ↓
  TCP 重传,流量更大
        ↓
  雪崩,大家都不能用
```

Van Jacobson 1988 年提出 **慢启动 + 拥塞避免** 算法,救了互联网——这就是 TCP 拥塞控制的开山之作。

### 3.2 cwnd:拥塞窗口

**cwnd 是发送方自己估算的「网络能塞多少」**——不是接收方告诉的(那是 rwnd)。

实际发送窗口 = `min(cwnd, rwnd)`。

cwnd 的单位是 **MSS**(Maximum Segment Size,通常 1460 字节)。

### 3.3 四阶段:慢启动 → 拥塞避免 → 快重传 → 快恢复

```
                       慢启动                  拥塞避免
                       cwnd 指数增长            cwnd 线性增长
     cwnd                 ╱
       │                ╱
       │              ╱
ssthresh ────────── ╱  ─────────────────  ╲ ←  丢包(超时)
       │            ╱        \             ╲     cwnd = 1, ssthresh /= 2
       │          ╱           \              ╲   重新慢启动
       │        ╱              \                ╲
       │      ╱                 \                  ╲___ ╱
       │    ╱                    \              快重传 + 快恢复
       │  ╱                       \    cwnd /= 2(不是 1),线性增长
   1   ╱                           
       └────────────────────────────────────────────→ time
```

#### 3.3.1 慢启动(Slow Start)

- **初始 cwnd = 1-10 MSS**(Linux 现在是 10,RFC 6928)
- 每收到一个 ACK,**cwnd += 1**
- 一个 RTT 内 cwnd 翻倍 → 指数增长
- 直到 cwnd ≥ ssthresh(慢启动阈值,默认很大),进入拥塞避免

**「慢」启动其实指数增长一点不慢**——名字源于「比之前不带控制的猛发要慢」。

#### 3.3.2 拥塞避免(Congestion Avoidance)

- 每收到一个 ACK,cwnd += 1/cwnd
- **一个 RTT 内 cwnd += 1** → 线性增长
- 一直到丢包

#### 3.3.3 超时(RTO)→ 全部归零

- 没收到 ACK,定时器超时(RTO,Retransmission Timeout)
- ssthresh = cwnd / 2
- **cwnd = 1**,重新慢启动
- 这是最痛的——**一次超时,半天爬不回来**

#### 3.3.4 快重传 + 快恢复(Tahoe → Reno → NewReno)

```
[发送端]                              [接收端]
   │── seg 1 ─────────────────────>│
   │── seg 2 ──── 丢 ─ X            │  没收到
   │── seg 3 ─────────────────────>│  收到 3,但期待 2
   │<── ACK 2 (重复)────────────────│  ← 第 1 个重复 ACK
   │── seg 4 ─────────────────────>│
   │<── ACK 2 (重复)────────────────│  ← 第 2 个重复 ACK
   │── seg 5 ─────────────────────>│
   │<── ACK 2 (重复)────────────────│  ← 第 3 个重复 ACK
   │── seg 2 重传(快重传)────────>│  ← 不等超时,立刻重传
   │<── ACK 6 ────────────────────│
```

- **快重传**:收到 3 个重复 ACK 立刻重传(不等 RTO 超时,省一秒级延迟)
- **快恢复**:不要 cwnd 归零,**cwnd = ssthresh = cwnd / 2**,直接进拥塞避免

> 经验法则:**「丢包 = 网络拥塞」是 1988 年的假设**——在公网无线 / 跨国 / 移动网络上,丢包很多是「随机丢」(信号差、buffer 抖动),不是真的拥塞。这是 BBR 出现的根本原因。

---

## 四、CUBIC:Linux 默认算法

### 4.1 为什么需要 CUBIC

经典 Reno / NewReno 算法在 **高带宽 + 高延迟(BDP 大)** 的链路上爬得太慢:

```
1 Gbps 跨国链路,RTT = 100 ms
BDP(带宽延迟积) = 1 Gbps × 100 ms = 12.5 MB

cwnd 要爬到 12.5 MB / 1460 = 8500 个段
线性增长每 RTT +1
8500 RTT × 100 ms = 850 秒 才能填满管道
```

慢得令人发指。

### 4.2 CUBIC 怎么改

**用三次函数曲线代替线性增长**:

```
W(t) = C × (t - K)³ + W_max
其中:
  W_max = 上次丢包时的 cwnd
  K = 三次根号(W_max × β / C)
  β = 0.7(每次拥塞,cwnd 缩到 70%)
  C = 0.4(增长因子)

cwnd                                                ╱
  │            W_max ─────╲                      ╱
  │              ╱─────────────╲              ╱
  │           ╱                  ╲          ╱  ← 接近 W_max 慢
  │         ╱                      ╲      ╱      远离时快
  │       ╱                          ╲  ╱
  │     ╱                              ╳
  │  ╱                                                 
  │ ╱  ← 远离 W_max 时增长快
  └──────────────────────────────────────────→ time
                          ↑ 丢包
```

**核心思路**:
- 拥塞之后,cwnd 缩到 70%(不是 50%,更保守)
- 然后用三次曲线:**接近 W_max 时增长慢(怕又丢),超过 W_max 后增长加速(探索新带宽)**

**优势**:
- **跨 RTT 公平**:cwnd 增长不依赖 RTT(经典 Reno 高 RTT 增长慢,CUBIC 不会)
- **高 BDP 链路友好**:能快速利用带宽

**Linux 2.6.19+ 默认就是 CUBIC**(BIC → CUBIC)。

### 4.3 CUBIC 的局限

- **依然「丢包驱动」**:看到丢包就缩窗
- **公网丢包不一定意味着拥塞**(WiFi / 4G / 跨国)
- **缓冲区膨胀(Bufferbloat)** 时表现差:中间路由器 buffer 太大,丢包前延迟已经爆炸

---

## 五、BBR:基于带宽和延迟的革命

### 5.1 BBR 的核心思想

Google 2016 年提出 **BBR(Bottleneck Bandwidth and Round-trip propagation time)**——**完全不看丢包,只看「带宽和延迟」**。

```
经典:cwnd 控制「能发多少」,看到丢包就缩
BBR:测出 BtlBw(瓶颈带宽)和 RTprop(最小 RTT),发送速率 = BtlBw,等待时间 = RTprop
```

**BDP(带宽延迟积) = BtlBw × RTprop** —— 这是「网络管道的容积」。**保持在管道容积上下,既不饿,也不溢出**。

### 5.2 BBR 状态机

```
                    +------------+
                    |  STARTUP   |  快速找带宽,cwnd 指数增长 ×2.89
                    +------+-----+
                           │ 带宽不再增长
                           ↓
                    +------------+
                    |   DRAIN    |  排空过多 buffer(发太快堆积的)
                    +------+-----+
                           │ buffer 排空
                           ↓
                    +------------+
                    |  PROBE_BW  | ← 主状态,8 阶段循环
                    +------+-----+   一会儿 ×1.25 探带宽,一会儿 ×0.75 排空
                           │ 10 秒内没探到新 RTT 最小值
                           ↓
                    +------------+
                    | PROBE_RTT  |  cwnd 缩到 4,测真实最小 RTT
                    +------+-----+
                           │ 200ms 测完
                           ↓
                    回到 PROBE_BW
```

### 5.3 BBR 怎么估带宽和 RTT

**每个 ACK 都更新两个值**:

```
delivery_rate = data_acked / time_elapsed   (本周期数据传输速率)
RTT_sample = ack_arrival - send_time        (本包 RTT)

BtlBw = max(过去 10 秒所有 delivery_rate)   ← 滑动窗口取最大
RTprop = min(过去 10 秒所有 RTT_sample)      ← 滑动窗口取最小
```

**「BtlBw 用 max」**:带宽是峰值能力,丢一两个采样不算。
**「RTprop 用 min」**:延迟是最优,排队会让 RTT 变大,真正的最小才是物理时延。

### 5.4 BBR vs CUBIC:谁更猛

```
       吞吐 (公网, RTT=100ms, 1% 丢包率)
       
       │                                       
       │  BBR  ████████████████████  ← 几乎不掉
       │
       │  CUBIC  ████  ← 1% 丢包就崩
       │
       └─────────────────────────────────
```

**BBR 在公网吊打 CUBIC 的场景**:
- 高 RTT(跨国 / CDN)
- 高丢包(WiFi / 4G / 5G 边缘)
- 大缓冲(Bufferbloat 链路)

> 实测数据:**YouTube 全量 BBR 后,平均延迟降低 53%,吞吐提升 14%**(Google 2017 SIGCOMM)。

---

## 六、BBR vs CUBIC 公平性问题

**BBR 的争议**:**BBR 在共享链路上对 CUBIC 不公平,会挤掉对手**。

### 6.1 为什么不公平

```
共享 100 Mbps 瓶颈链路:
  CUBIC 流:看丢包,缩窗,慢慢爬
  BBR 流:看带宽,发现还有空间就继续发
  
  当链路 buffer 略满,CUBIC 检测到丢包就缩窗(让出带宽)
  BBR 此时还在 PROBE_BW 阶段继续探,占住带宽
        ↓
  几分钟后,BBR 占 80%,CUBIC 占 20%
```

### 6.2 BBR v2 / v3 的改进

Google 后来做了 BBRv2、BBRv3:
- 加入丢包信号(不再完全无视)
- 主动「让步」,提升公平性

但**生产部署 BBRv1 仍是大头**——v2/v3 还在迭代。

### 6.3 实战建议

| 场景 | 选择 |
| --- | --- |
| **大 CDN / 视频服务器(占主导)** | BBR(吃满带宽,不在乎友好) |
| **企业内部多业务共享链路** | CUBIC(避免抢资源) |
| **海外 / 移动 / 高丢包公网** | BBR |
| **数据中心内(低 RTT 低丢包)** | CUBIC 或 DCTCP |

---

## 七、怎么换拥塞算法

### 7.1 看当前算法

```bash
sysctl net.ipv4.tcp_congestion_control
# net.ipv4.tcp_congestion_control = cubic

sysctl net.ipv4.tcp_available_congestion_control
# net.ipv4.tcp_available_congestion_control = reno cubic
```

### 7.2 加载 BBR 模块

```bash
# 看是否已编译
modinfo tcp_bbr

# 加载
modprobe tcp_bbr

# 临时切换
sysctl -w net.ipv4.tcp_congestion_control=bbr

# 永久(写入 /etc/sysctl.conf)
echo "net.ipv4.tcp_congestion_control=bbr" >> /etc/sysctl.conf
echo "net.core.default_qdisc=fq" >> /etc/sysctl.conf
sysctl -p
```

**注意**:BBR 强烈推荐配合 **fq**(Fair Queueing)qdisc——不然 pacing 不准,效果打折。

### 7.3 验证生效

```bash
# 看 socket 用的算法
ss -ti
ESTAB ... cubic wscale:7,7 rto:213 rtt:13.5/2 mss:1448 cwnd:10 ...
                ↑ 拥塞算法

# 切到 BBR 后
ESTAB ... bbr wscale:7,7 rto:213 rtt:13.5/2 mss:1448 cwnd:10 ...
                ↑
```

### 7.4 单 socket 选算法

应用层可以 setsockopt:

```c
const char* algo = "bbr";
setsockopt(s, IPPROTO_TCP, TCP_CONGESTION, algo, strlen(algo));
```

**Nginx 也支持**:`listen 443 ssl reuseport so_keepalive=on;` 配 sysctl 即可,Nginx 不直接配算法。

---

## 八、ss -i:看每个连接的拥塞状态

```bash
ss -tin

ESTAB  0   0   10.0.0.5:55001  1.2.3.4:443
       cubic wscale:7,7 rto:213 rtt:13.5/2.5 ato:40 mss:1448 
       pmtu:1500 rcvmss:1448 advmss:1448 
       cwnd:10 ssthresh:7 
       bytes_sent:5234567 bytes_acked:5230000 
       bytes_received:1234567 segs_out:3500 segs_in:2400 
       data_segs_out:3000 data_segs_in:2000 
       send 8.6Mbps lastsnd:8 lastrcv:8 lastack:8 pacing_rate 17.2Mbps 
       delivery_rate 8.5Mbps app_limited busy:5234ms 
       reord_seen:2 retrans:0/2 dsack_dups:0 rcv_rtt:14 rcv_space:14600 
       rcv_ssthresh:65535 minrtt:11.2
```

**关键字段**:

| 字段 | 含义 |
| --- | --- |
| **cubic / bbr** | 拥塞算法 |
| **rto:213** | 重传超时 213 ms |
| **rtt:13.5/2.5** | 平滑 RTT 13.5 ms,RTT 方差 2.5 ms |
| **mss:1448** | 最大报文段 |
| **cwnd:10** | 拥塞窗口 10 个 MSS = 14480 字节 |
| **ssthresh:7** | 慢启动阈值 |
| **bytes_sent / bytes_acked** | 发送 / 已确认字节 |
| **send 8.6Mbps** | 当前发送速率 |
| **delivery_rate 8.5Mbps** | 实际投递速率(BBR 看这个) |
| **pacing_rate** | pacing 速率(BBR 用) |
| **retrans:0/2** | 当前重传 0,总重传 2 |
| **minrtt:11.2** | 历史最小 RTT(BBR 的 RTprop) |

> 经验法则:**`ss -tin` 是看 TCP 性能的首选**——不用抓包,直接看每个连接的内核状态。

---

## 九、流控 + 拥塞控制综合实例

### 9.1 一个慢连接的诊断

```bash
ss -tin sport = :80
ESTAB  0   123456   server:80  client:54321
       cubic rtt:200/30 cwnd:5 retrans:50/200 
       send 290Kbps
       
       Send-Q = 123456 字节  ← 应用塞了一堆数据进 socket buffer
       cwnd = 5 (低)         ← 拥塞窗口被压
       retrans = 200 次      ← 大量重传
       rtt = 200ms           ← 高延迟
```

**诊断**:**拥塞 + 高延迟,可能跨国客户**——切 BBR 试试,或者降低发送量。

### 9.2 一个被流控限制的连接

```bash
ss -tin
ESTAB  Recv-Q=0  Send-Q=65000   server:80  client:54321
       cubic rtt:5/1 cwnd:200
       Window: rcv_space=65535
       
       Send-Q 一直接近 65K
       cwnd 200 没问题(够大)
       rwnd 65K 是瓶颈
```

**诊断**:**接收方 buffer 满了,应用 read 慢**——典型客户端 CPU 100% / GC 暂停。

---

## 十、一些进阶概念

### 10.1 Bufferbloat:缓冲区肥大

家用路由器 / 移动基站 buffer 太大(几百毫秒数据),拥塞时数据全堆在 buffer 里:

```
没 Bufferbloat:                    有 Bufferbloat:
  buffer 满 → 立刻丢包           buffer 几 MB,500ms 都不丢
  → TCP 缩窗                      → TCP 觉得网络好继续发
  → 延迟稳定 30ms                 → 延迟从 30ms 涨到 500ms
                                   → 视频会议直接卡死
```

**fq_codel / cake qdisc** 是缓解 Bufferbloat 的招——**主动早丢包**给 TCP 信号。

### 10.2 ECN:显式拥塞通告

路由器 buffer 快满时,**不丢包,而是给包打个标记**(ECN bit),告诉 TCP「你慢点」:

```bash
sysctl net.ipv4.tcp_ecn=1
# 0 = 关闭
# 1 = 服务端被动启用
# 2 = 主动协商(默认在某些发行版)
```

ECN 几十年都没普及——**中间盒友好性差**(很多盒子会丢标记的包)。

### 10.3 TCP Small Queues / Pacing

为减小自身造成的 Bufferbloat,Linux 限制单个 socket 在 qdisc 里堆积的字节数:

```bash
sysctl net.ipv4.tcp_limit_output_bytes
# 默认 1 MB
```

**Pacing**:不让 cwnd 内的所有数据一次性发出,**按速率均匀发**——BBR 必备,CUBIC 也支持。

---

## 十一、踩坑提醒

1. **流控和拥塞控制混淆** —— rwnd 是对方告诉你能收多少,cwnd 是你自己估算网络能塞多少
2. **以为换 BBR 永远更好** —— 共享链路对 CUBIC 不公平,会被监管 / 邻居骂
3. **BBR 不配 fq qdisc** —— pacing 不准,效果打折
4. **看到 cwnd=10 觉得低** —— 那是 IW10(初始窗口),正常爬
5. **改 buffer 不看 auto-tuning** —— Linux 自动调,手动 setsockopt 反而限制
6. **0 窗口当成 bug** —— 应用 read 慢,不是网络问题
7. **以为 CUBIC 在低 RTT 数据中心也最好** —— DCTCP / BBR 都是更好的选择
8. **快重传等不到 3 个 dup ACK** —— 路径上重排导致,SACK 能缓解(详见 14 篇)
9. **以为拥塞控制是 socket 选项** —— 是 sysctl 全局,可以用 setsockopt 单 socket 覆盖
10. **不用 ss -i 看连接** —— 抓包再分析等于重新发明轮子

---

下一篇:`14-TCP高级特性.md`,讲那些「看似小但能让 P99 暴跌或暴涨」的细节——SACK(选择性确认,丢一个不重传整段)、快重传、Nagle 算法(攒小包但和 Delayed ACK 凑一起就是 200ms 延迟陷阱)、TCP_NODELAY、keepalive、Window Scaling(高带宽时窗口超 64K 必备)、时间戳(RTT 测量 + PAWS 防回绕)。**真正的 TCP 调优老手,功底全在这一章**——参考本篇的 cwnd / rwnd 理解 SACK 怎么让重传更精准。
