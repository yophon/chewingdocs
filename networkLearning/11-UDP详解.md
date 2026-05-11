# UDP 详解

「TCP 那么复杂,为什么还要 UDP」——很多人对 UDP 的印象停在「不可靠的 TCP」这一句。**完全错了**。UDP 不是 TCP 的简化版,**它是另一个物种**:零状态、零握手、无序、可丢——**但正是因为啥都没做,它才能做 TCP 永远做不到的事**。DNS 查询、视频通话、网游、QUIC、RTP、SNMP、NTP——**今天互联网上 30% 以上的流量是 UDP**(YouTube / Netflix 在 QUIC 上跑、Zoom 在 UDP 上跑、绝地求生开一局十几万 UDP 包)。本章把 UDP 这个「最简协议」掰开看清楚:8 字节的头、4 个字段、零状态机——**简单到极致就是它的力量**。

> 一句话先记住:**UDP = IP 包 + 端口 + 一个长度 + 一个校验和**——8 字节头,无握手,无重传,无流控,无拥塞控,无连接状态。**它不是「不可靠的 TCP」,它是「让你自己决定可靠性怎么实现」**。DNS / 实时音视频 / QUIC / 游戏全选 UDP——因为 TCP 的「保证按序到达」在它们眼里是负担,不是恩赐。

---

## 一、为什么有 UDP

### 1.1 TCP 不能做的事

上一篇 10-NAT 讲完了网络层和子网,现在到了传输层。传输层只有两个老牌选手:**TCP** 和 **UDP**。

TCP 给你三件事:**可靠 + 有序 + 流控**。代价是:

```
1. 三次握手 → 建连接最少 1 RTT(几十 ms)
2. 失序包要等 → 后面包堵在前面包后面(队头阻塞)
3. 丢一个包 → 至少一个 RTT 才能补回来
4. 拥塞控制 → 启动慢,慢启动要爬好几个 RTT
5. 连接是双方的状态机 → 中间路由 / NAT 必须维护表
```

**对很多场景来说,这五件事是反向需求**:

| 场景 | 真实需求 | 用 TCP 的代价 |
| --- | --- | --- |
| **DNS 查询** | 一来一回 50 字节,毫秒级 | 三次握手已经超过 DNS 自身耗时 |
| **视频会议** | 丢一帧无所谓,延迟 200ms 就完蛋 | 队头阻塞会让画面卡住等丢的包 |
| **游戏射击** | 老的位置数据已无价值,新数据更重要 | TCP 一定要按序送达老数据 |
| **NTP 对时** | 一个包就完事 | 握手 1 RTT,误差就到位了 |
| **VPN / 隧道** | 上层是 TCP,不需要再可靠一次 | TCP-over-TCP 双重重传雪崩 |

**这些场景共同点:实时性 > 可靠性,或者上层自己有可靠性方案**。

### 1.2 UDP 的设计哲学

**「内核别管,留给应用」**。UDP 把所有控制权交给应用:

- 要可靠?自己实现 ACK / 重传(QUIC 干的事)
- 要有序?自己加序列号
- 要流控?自己看 RTT 调发送速率
- 要加密?自己包 DTLS 或 QUIC

**UDP 的内核态实现不到 1000 行代码**(Linux 的 `udp.c` 就那么点)——**它只是把 IP 包打了个端口标签**。

> 经验法则:**TCP 是「内核帮你想好了一切」;UDP 是「内核帮你打个端口,剩下你自己玩」**——前者省事,后者灵活。

---

## 二、UDP 报文格式:8 字节,4 字段,完事

```
0                   1                   2                   3
0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|         Source Port           |       Destination Port        |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|            Length             |           Checksum            |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                          Data ...                             |
+---------------- ----------------------------------------------+
```

**四个字段,每个 16 bit,共 8 字节**——比 TCP 头(20-60 字节)小一半还多。

### 2.1 Source Port / Destination Port

- **16 bit 端口号**,范围 0-65535
- 0-1023 是 well-known 端口(DNS 用 53、NTP 用 123、SNMP 用 161)
- 1024-49151 是注册端口
- 49152-65535 是动态端口(客户端临时端口范围,Linux `net.ipv4.ip_local_port_range`)

**Source Port 可以为 0**——表示「我不期望你回我」(单向广播 / 多播经常这样)。

### 2.2 Length

UDP 头 + 数据的总长度,**包括 8 字节头本身**。最小值是 8(空数据),最大值理论上 65535(因为 16 bit)。

**实际很难达到 65535**——IP 包头 20 字节,加上 UDP 头 8 字节,数据最多 65507 字节。但**MTU 限制(以太网 1500 字节)会让超过 1472 字节的 UDP 包被分片**(后面详谈)。

### 2.3 Checksum

校验和,**16 bit**。覆盖范围:

```
  伪首部(IP src/dst + 协议号 + 长度,12 字节)
+ UDP 头
+ UDP 数据
─────────────────
求 16 位反码和
```

**为什么算「伪首部」**:让 UDP 校验也能发现「IP 地址被改」的错误(NAT 场景重要)。

**IPv4 下 Checksum 可选**(填 0 表示「我不算」),IPv6 下 **必须填**——因为 IPv6 自己没有头校验。

> 踩坑提醒:**抓包看到 Checksum 是 0 别慌**——是发送端没算,不一定是错的。多数现代网卡会硬件 offload 校验,tcpdump 看到的可能是「offload 之前」的状态。

---

## 三、UDP 适用场景:实时性 > 可靠性

### 3.1 DNS:最经典的 UDP 用户

```
client                                 DNS server
  │                                          │
  │── UDP 53,query "example.com A"       ──>│
  │                                          │
  │<── UDP 53,response "1.2.3.4" ──────────│
  │                                          │
1 RTT 完事
```

**为什么 DNS 选 UDP**:

| 项 | 数字 |
| --- | --- |
| DNS 查询包大小 | 50-100 字节 |
| DNS 响应包大小 | 100-300 字节 |
| 一次 DNS 查询时长(UDP) | 1 RTT(20-50 ms) |
| 同样查询用 TCP | 4 RTT(握手 1 + 查询 1 + 关闭 2)|

**UDP 比 TCP 快 4 倍**——而且全球每秒几千亿次 DNS 查询,TCP 的连接表会撑爆服务器。

### 3.2 视频通话 / 直播 / RTC

```
丢了一帧画面 → 用户看到一帧花屏 → 下一帧又是新数据,自动恢复
TCP 重传一帧 → 用户卡住等几十 ms → 后面新数据全部排队 → 卡顿
```

**实时音视频对延迟极度敏感,对丢包反而不敏感**——丢就丢了,新的来。

WebRTC、RTP、SRT、Zoom、腾讯会议——**全用 UDP**。

### 3.3 游戏

```
玩家位置每 50 ms 上报一次
└─ 第 N 次上报丢了 → 第 N+1 次包含新位置,N 已经过时
└─ 用 TCP 等 N 重传 → 玩家看到「鬼畜回滚」
```

FPS / MOBA / 大型 MMO 全是 UDP。**连接型游戏(回合制 / 卡牌)才用 TCP**——它们对实时性要求低,但要保证消息送达。

### 3.4 QUIC = UDP + 应用层重做 TCP

Google 2012 年发现:**TCP 演进太慢**(改一个特性要等几年内核 + 中间盒升级)。所以**把 TCP 拆掉,用 UDP 重新做一个**:

```
传统:           应用 / TLS / TCP / IP
QUIC:           应用 / QUIC(包含 TLS 1.3 + 重传 + 拥塞)/ UDP / IP
```

QUIC 用 UDP 是因为:

1. **UDP 在所有 NAT / 防火墙 / 中间盒上都通**(TCP 改了字段会被丢)
2. **应用层迭代不需要等内核**(部署一个新版本 quiche / msquic 就行)
3. **可以做 TCP 做不到的事**(连接迁移、0 RTT、多路复用无队头阻塞)

详见 24 篇 QUIC。

### 3.5 其他常见 UDP 协议

```
DNS         53        查询 / 响应
DHCP        67/68     地址分配,广播,无需连接
NTP         123       时间同步,一来一回
SNMP        161/162   网络监控,海量短包
TFTP        69        简单文件传输,广播 / 加载固件
RTP         动态       实时流媒体
QUIC        443       HTTP/3 底层
WireGuard   动态       VPN
Mosh        动态       SSH 替代,UDP-based 抗丢包
```

> 经验法则:**「无状态 + 短消息 + 高频」三件套,选 UDP**;「长会话 + 大数据 + 必须送达」三件套,选 TCP。

---

## 四、UDP 之上自己实现可靠性的代价

很多面试官会问:「**既然 UDP 没保证,那要可靠不就得自己实现 ACK / 重传 / 流控?那不就成了 TCP 吗?**」

**部分对,但不完全**。

### 4.1 自己造可靠性需要做哪些事

```
1. 序列号             —— 知道哪些包丢了
2. ACK / SACK         —— 接收方告诉发送方收到了哪些
3. 重传                —— 没 ACK 的重发
4. 超时计算 (RTO)      —— 多久没 ACK 算丢
5. RTT 测量            —— 算超时阈值的基础
6. 拥塞控制            —— 不能把网络打爆
7. 流量控制            —— 不能把接收方淹没
8. 分包 / 重组          —— 大消息拆成小 UDP 包
9. 加密 / 完整性        —— 防中间人
10. 连接 ID             —— 区分多路 / 抗 IP 漂移
```

**这正好就是 QUIC 干的事**——用了 5 年时间、几十个 RFC,Google 才把这套东西做稳定。

### 4.2 自己造的好处

```
TCP:           内核给你一套通用方案,改不了
自己造:        可以为你的业务定制
                ↓
   - 游戏:不重传旧位置(只重传关键事件)
   - 视频:FEC(前向纠错)而不是重传
   - 文件传输:UDT 大窗口
   - QUIC:0-RTT 复用、多流无阻塞、连接迁移
```

### 4.3 自己造的坑

```
× 拥塞控制写错 → 你一个程序能把你公司的网打瘫
× 加密写错 → 中间人攻击
× 重传写错 → 雪崩(指数级重传)
× 没考虑中间盒 → 各种代理 / NAT 把你包丢了
× 没考虑 MTU → 大包必丢
```

> 经验法则:**「我要在 UDP 上自己做可靠性」之前,先看看 QUIC / KCP / Aeron / DCCP 能不能直接用**——除非有强业务定制,99% 情况你重新发明的轮子没人家好。

---

## 五、UDP 包大小:MTU 限制 + 分片陷阱

这是 UDP 最容易踩的坑。

### 5.1 MTU 限制链路层

以太网 MTU 是 **1500 字节**,扣掉 IP 头 20 字节、UDP 头 8 字节,**UDP 数据载荷最大 1472 字节**(无 IP 选项时)。

```
1500 (MTU)
- 20 (IPv4 头)
-  8 (UDP 头)
─────
1472 (UDP 最大数据载荷)
```

IPv6 头是 40 字节,所以 IPv6 下 UDP 最大数据是 **1452 字节**。

走隧道(VPN / IPsec / GRE)还要再扣几十字节。

### 5.2 超过 MTU 会怎样

UDP 包超过 MTU,**IP 层会分片**:

```
应用发送 3000 字节 UDP 包
        ↓
IP 层看到 MTU=1500,拆成两片
        ↓
片 1:offset=0,    1480 字节(包含 UDP 头)
片 2:offset=1480, 1500 字节
        ↓
接收端 IP 层重组成完整 UDP 包再交给 UDP 层
```

**问题在哪**:

1. **任何一片丢了,整个 UDP 包失效**——丢包率被放大 N 倍
2. **NAT / 防火墙经常丢分片**——很多设备只看第一片(有 UDP 头)的端口,后续片认不出来扔了
3. **PMTU(路径 MTU)不一定是 1500**——VPN / 移动网络可能更小
4. **IP 分片可被攻击利用**(DoS / 内核漏洞历史多次)

### 5.3 实战建议

```
游戏 / RTP / DNS / QUIC 都遵循:
  - UDP 单包 ≤ 1200 字节(留 300 字节给隧道封装)
  - 大消息应用层自己分片 + 加序列号
  - 设置 socket 选项 IP_MTU_DISCOVER / IPV6_DONTFRAG
    告诉内核「不要分片,超了直接报错」
```

DNS 标准上 UDP 最大 512 字节(RFC 1035),后来 EDNS0 扩展到 4096 字节——**但实际上很多 DNS 中间件只支持 512**,超了 fallback 到 TCP。

> 踩坑提醒:**UDP 包别超 1200 字节** —— 这是经过 VPN / NAT / 移动网络 / IPv6 隧道都还能稳过的「通用安全值」。

---

## 六、UDP 调试:nc / dig / 抓包

### 6.1 用 nc 测 UDP 端口

```bash
# 监听端
nc -ul 9999

# 客户端发
echo "hello" | nc -u 127.0.0.1 9999

# 监听端会看到 "hello"
```

`-u` = UDP,`-l` = listen。

**测端口通不通**:

```bash
nc -uvz example.com 53
# Connection to example.com 53 port [udp/domain] succeeded!
```

**注意**:UDP 没有连接,`nc -uvz` 的「成功」其实是「**没收到 ICMP Port Unreachable**」——**很多防火墙会静默丢弃,看起来通其实不通**。**测 UDP 必须双向验证**(两端各发一个包,对面收到了才算通)。

### 6.2 用 dig 测 DNS

```bash
dig @8.8.8.8 example.com A

;; QUESTION SECTION:
;example.com.                   IN      A

;; ANSWER SECTION:
example.com.            300     IN      A       93.184.216.34

;; Query time: 28 msec
;; SERVER: 8.8.8.8#53(8.8.8.8)
```

`dig +tcp` 强制走 TCP(默认 UDP)。

`dig +bufsize=4096` 测 EDNS0 大包响应。

### 6.3 抓 UDP 包

```bash
# 抓所有 DNS 流量
sudo tcpdump -i any -n udp port 53

# 抓特定主机的 UDP
sudo tcpdump -i any -n 'host 8.8.8.8 and udp'

# 抓 + 存到文件,Wireshark 看细节
sudo tcpdump -i any -w udp.pcap udp port 53
```

Wireshark 打开 .pcap,能看到每个 UDP 包的源端口、目的端口、长度、校验和、载荷。

### 6.4 看 socket 状态

```bash
# 看本机所有 UDP socket
ss -ulnp

State    Recv-Q   Send-Q   Local Address:Port   Peer Address:Port   Process
UNCONN   0        0        0.0.0.0:53           0.0.0.0:*           dnsmasq
UNCONN   0        0        0.0.0.0:123          0.0.0.0:*           ntpd
```

**UDP socket 永远是 UNCONN 状态**——无连接概念。

`Recv-Q` 是接收缓冲区已堆积的字节数(非零说明应用没及时 recv,可能丢包)。

---

## 七、为什么 DNS 用 UDP 但响应大时退回 TCP

DNS 是 UDP 的代表,但有一个细节让无数人困惑:**DNS 也用 TCP**。

### 7.1 历史原因:512 字节限制

RFC 1035 (1987) 规定 **DNS UDP 响应最大 512 字节**——为了适应当时小 MTU 网络。

但今天:

- 一个域名可能有几十个 A 记录(CDN)
- 加 DNSSEC 签名一次几百字节
- 一个 TXT 记录可能几 KB(SPF / DKIM)

**512 字节根本不够**。

### 7.2 截断机制:TC 标志

DNS 头有一个 `TC`(Truncated)标志位:

```
DNS UDP 响应 > 512 字节
        ↓
服务器只发前 512 字节,设置 TC=1
        ↓
客户端看到 TC=1,知道「截断了」
        ↓
客户端用 TCP 重新查一次,完整接收
```

**所以 DNS 不是「只用 UDP」,而是「先 UDP 试,大了切 TCP」**。

### 7.3 EDNS0:扩展 UDP 大小

RFC 6891 引入 **EDNS0**(Extension Mechanisms for DNS),客户端在请求里加一个 `OPT` 记录,声明「**我能收 4096 字节的 UDP**」:

```bash
dig +bufsize=4096 example.com TXT

;; OPT PSEUDOSECTION:
; EDNS: version: 0, flags:; udp: 4096
```

服务器看到这个,**只要响应 ≤ 4096 字节就继续用 UDP**,不强制截断。

**今天的现状**:

- 现代 DNS 客户端默认 EDNS0 + UDP 4096
- 中间盒 / 老防火墙可能丢大于 1472 字节的 UDP(分片)
- **所以实际部署经常配 EDNS0 = 1232**(IPv6 友好,不会触发 IP 分片)

### 7.4 zone transfer 永远走 TCP

DNS 区域传输(主从同步,AXFR / IXFR)**始终走 TCP**——一次几兆几十兆数据,UDP 根本扛不住。

> 经验法则:**「DNS 用 UDP 还是 TCP」的正确答案是「先 UDP,响应大或区域传输切 TCP」**——面试遇到这题别只答前半句。

---

## 八、UDP socket 编程速览

### 8.1 服务器端

```c
#include <sys/socket.h>
#include <netinet/in.h>

int s = socket(AF_INET, SOCK_DGRAM, 0);  // 注意是 SOCK_DGRAM

struct sockaddr_in addr = {
    .sin_family = AF_INET,
    .sin_port = htons(9999),
    .sin_addr.s_addr = INADDR_ANY,
};
bind(s, (struct sockaddr*)&addr, sizeof(addr));

// 不用 listen / accept,直接收
char buf[1500];
struct sockaddr_in client;
socklen_t len = sizeof(client);

ssize_t n = recvfrom(s, buf, sizeof(buf), 0,
                    (struct sockaddr*)&client, &len);

// 回复
sendto(s, "ack", 3, 0, (struct sockaddr*)&client, len);
```

**对比 TCP**:没有 listen / accept / connect 这三个 syscall——**UDP 服务器永远只有一个 socket**,所有客户端的包都从这一个 fd 读,通过 `recvfrom` 返回的 `client` 区分。

### 8.2 客户端

```c
int s = socket(AF_INET, SOCK_DGRAM, 0);

struct sockaddr_in server = {
    .sin_family = AF_INET,
    .sin_port = htons(9999),
};
inet_pton(AF_INET, "1.2.3.4", &server.sin_addr);

sendto(s, "hello", 5, 0, (struct sockaddr*)&server, sizeof(server));

char buf[1500];
recvfrom(s, buf, sizeof(buf), 0, NULL, NULL);
```

### 8.3 connect 也能用在 UDP 上

```c
connect(s, (struct sockaddr*)&server, sizeof(server));
// 之后可以用 send / recv 而不是 sendto / recvfrom
send(s, "hello", 5, 0);
```

UDP 的 `connect` **不发包**——只是在内核里记一下「这个 socket 默认对方是谁」,加一个过滤(只收来自这个对方的包)。

性能差异:

- **没 connect 的 UDP**:每次 sendto 都要查路由表
- **connect 过的 UDP**:路由查一次缓存住,后续 send 快

**高频 UDP 通信(游戏 / RTC)** 都会 connect 一下。

---

## 九、UDP 的「连接」状态:NAT 视角

UDP 协议本身无连接,但**中间设备(NAT / 防火墙)会自己造一个「伪连接」**:

```
内网 client 10.0.0.5:55000 → NAT → 公网 server 1.2.3.4:53
                              ↓
                        NAT 表记录:
                        10.0.0.5:55000 ↔ 公网IP:39000 ↔ 1.2.3.4:53
                              ↓
                  超时后(通常 30-180 秒)自动删除
```

**UDP 在 NAT 上的 timeout 比 TCP 短很多**:

| 协议 | NAT 默认超时 |
| --- | --- |
| TCP ESTABLISHED | 5 天(7440 秒) |
| **UDP** | **30-180 秒** |
| ICMP | 30 秒 |

**实践影响**:

1. **UDP 长连接(游戏 / VPN)必须发心跳**——否则 NAT 表删了,服务器再发包发不回来
2. **WireGuard 默认 25 秒发一个 keepalive**——就是为了维持 NAT 表
3. **STUN / ICE 打洞**(WebRTC)依赖 UDP 这个 NAT 行为(详见 26 篇)

> 经验法则:**任何 UDP 长会话都要心跳**——25 秒一次最稳,30 秒可能正好踩到 NAT 删除。

---

## 十、UDP vs TCP 对比一张表

| 维度 | UDP | TCP |
| --- | --- | --- |
| **头大小** | 8 字节 | 20-60 字节 |
| **建连接** | 无 | 三次握手 (1 RTT) |
| **可靠性** | 无保证 | 保证送达 |
| **顺序** | 不保证 | 严格顺序 |
| **流控** | 无 | 滑动窗口 |
| **拥塞控制** | 无 | 慢启动 / CUBIC / BBR |
| **多对一** | 一个 socket 收所有客户端 | 每个连接一个 socket |
| **大包** | 应用自己分包 | TCP 自动分段 |
| **延迟** | 极低 | 受握手 + 重传影响 |
| **吞吐** | 看应用层实现 | 受拥塞控制限制 |
| **NAT 友好性** | 短超时,需心跳 | 长超时 |
| **典型场景** | DNS / RTP / 游戏 / QUIC | HTTP / SSH / 数据库 |

---

## 十一、踩坑提醒

1. **以为 UDP 一定丢包** —— 内网 / 短距离 / 小包的 UDP 丢包率接近 0,公网 / 大包 / 跨国才常丢
2. **UDP 大于 1472 字节** —— 必分片,丢包率被放大,中间盒可能直接扔
3. **UDP socket 收到的不止一个客户端** —— 用 `recvfrom` 区分源地址,不是「来一个 socket 收一个」
4. **UDP 没有 ACK,但 ICMP 会回 Port Unreachable** —— 服务关了,客户端能收到 ICMP 错误(然后 sendto 返回 ECONNREFUSED)
5. **udp 缓冲区默认 200KB 左右,高并发会丢** —— `sysctl net.core.rmem_max` 调大
6. **UDP 心跳不发,NAT 表 30 秒删** —— 你以为还在,对面再也找不到你
7. **以为 UDP 永远比 TCP 快** —— 公网丢包高时,自己造的 UDP 可靠传输可能比 TCP 慢(没人家拥塞控制好)
8. **DNS 响应总是 < 512** —— EDNS0 之后可以 4096,但中间盒可能丢分片
9. **抓包看到 UDP Checksum=0** —— 不一定是错,IPv4 下校验可选,网卡 offload 也可能显示 0
10. **以为 QUIC 就是 UDP** —— QUIC = UDP + 一套完整的可靠传输 + 加密协议,**复杂度堪比 TCP+TLS**

---

下一篇:`12-TCP三次握手与四次挥手.md`,**整个传输层的核心**——三次握手为什么是三次不是两次也不是四次、四次挥手为什么是四次不是三次、TIME_WAIT 那 60 秒到底干嘛、SYN flood 怎么打怎么防、半连接队列和全连接队列怎么调,以及那张「TCP 11 状态机」——**画一遍能记一辈子**。
