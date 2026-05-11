# MPTCP 与 SCTP

「为什么 iPhone 在 WiFi 信号变差时切到 4G 不会断 Siri」——这不是魔法,是 **MPTCP**(Multi-Path TCP)在偷偷干活。同样有人问「WebRTC 那么多控制信号怎么不互相阻塞」——SCTP 在 DataChannel 底下扛着。**这两个协议从 RFC 看都是十几二十年前发明的「TCP 的进化版」,可惜全军覆没——只在少数场景活了下来**。本章讲清楚它们解决了什么、为什么没普及、为什么 QUIC 把它们的精髓全部内化——**理解了这两个失败案例,才理解 QUIC 凭什么成功**。

> 一句话先记住:**MPTCP = TCP 同时跑在多条路径上(WiFi + 4G 同时收发)**;**SCTP = 一个连接里多个独立流互相不阻塞 + 内置消息边界**。两者技术都精彩,但**全部败给了「中间盒不友好」**——防火墙 / NAT / 运营商盒子只认 TCP/UDP/ICMP,新 IP 协议号直接丢。**QUIC 走的是 UDP,把这俩的思想都实现了一遍——这就是它能成功的根本原因**。

---

## 一、为什么 TCP 之外又造轮子

参考 12-14 篇——TCP 是 1981 年的老东西,**在某些场景上明显不够用**:

```
TCP 局限 1:一个连接绑定一对 IP                    
            手机从 WiFi 切 4G,IP 变,连接就死      
            音视频通话直接掉线                    

TCP 局限 2:只有一个数据流(byte stream)           
            HTTP/1.1 队头阻塞                       
            一段数据丢,后面所有数据都堵            

TCP 局限 3:无消息边界                              
            send(1KB) + send(1KB) → recv 可能一次拿到 2KB    
            应用必须自己分隔                        

TCP 局限 4:端到端协议                              
            不能利用多条路径同时发                   
```

**MPTCP** 解决局限 1+4(多路径),**SCTP** 解决局限 2+3(多流 + 消息边界),**QUIC** 全包了。

---

## 二、MPTCP:多路径 TCP

### 2.1 设计目标

```
传统 TCP:                       MPTCP:
                                              ┌── subflow A: WiFi
应用 ── 一个 TCP 连接 ── 网络   应用 ── MPTCP ┤
                                              └── subflow B: 4G
```

**对应用透明**——`socket(AF_INET, SOCK_STREAM, IPPROTO_TCP)` 一行代码,内核底下偷偷跑多路径。

### 2.2 协议设计

MPTCP 是**「在 TCP 之上的子层」**:

```
应用层
  │
[MPTCP 层]  ← 维护多个 subflow,把数据切片分发,接收时重组
  │
[TCP 层 (subflow A)]   [TCP 层 (subflow B)]   [TCP 层 (subflow C)]
  │                       │                       │
[IP A]                  [IP B]                  [IP C]
  │                       │                       │
WiFi                     4G                      Ethernet
```

**每个 subflow 是一个完整 TCP 连接**(自己有序列号、握手、ACK、拥塞控制),**MPTCP 层在上面做总调度**:

- 主连接:第一次握手用普通 TCP + MPTCP 选项(`MP_CAPABLE`)
- 加 subflow:用 `MP_JOIN` 选项告诉对方「我要再开一条」
- 数据级序列号(DSN):每段数据有「全局序号」,接收方按 DSN 重排
- 拥塞控制:每个 subflow 独立 cwnd,但 MPTCP 总体协调,**保证不比单 TCP 更猛**(LIA / OLIA / BALIA 算法)

### 2.3 MP_CAPABLE / MP_JOIN

```
[client]                                [server]
   │── SYN, MP_CAPABLE(token_c) ──────>│  握手 + MPTCP 协商
   │<── SYN+ACK, MP_CAPABLE(token_s) ───│
   │── ACK ────────────────────────────>│
   │   ← 主 subflow 建立 (用 IP A)
   │
   │   后来 client 想加 subflow (用 IP B):
   │
   │── SYN, MP_JOIN(token_s, hash) ────>│
   │<── SYN+ACK, MP_JOIN ───────────────│
   │── ACK ────────────────────────────>│
   │   ← 第二个 subflow 建立 (用 IP B)
   │
   │   现在 client 同时用 IP A 和 IP B 收发,server 重组
```

### 2.4 实战:iPhone 的 Siri

**Apple 是 MPTCP 最大用户**——从 iOS 7 开始,**Siri 就用 MPTCP**。原因:

```
你按住 Siri 键 → iPhone 同时建 WiFi 和 4G 两条 subflow → Siri 服务器
        ↓
WiFi 信号变差?4G subflow 接管,无感切换
家里走出门?WiFi 断,Siri 不会卡死
```

后来扩展到 Apple Maps、Apple Music 等。

**苹果还把 MPTCP 直接 fork 进 iOS / macOS 内核**——比 Linux 实现更早稳定。

### 2.5 Linux 上启用 MPTCP

Linux 5.6+ 主线支持(以前是 fork 版本):

```bash
# 看是否启用
sysctl net.mptcp.enabled
# net.mptcp.enabled = 1   ← Linux 5.6+ 默认 1

# socket 创建
int s = socket(AF_INET, SOCK_STREAM, IPPROTO_MPTCP);
// 注意是 IPPROTO_MPTCP 不是 IPPROTO_TCP
```

应用要主动选 `IPPROTO_MPTCP`——不然走传统 TCP。

```bash
# mptcpd:用户态控制器,管理 subflow
apt install mptcpd
ip mptcp endpoint add 192.168.2.10 dev wlan0 subflow
ip mptcp endpoint add 10.0.0.5 dev eth1 subflow
```

### 2.6 为什么 MPTCP 没普及

**最大原因:中间盒不友好**。

```
某些防火墙看到 TCP 选项里有 MP_CAPABLE → 直接 strip 掉
                                              ↓
client 协商 MPTCP 失败 → fallback 到普通 TCP
                                              ↓
表面看似工作,实际上多路径完全没生效
```

**统计数据**:
- 公网约 5-10% 的中间盒会破坏 MPTCP 选项
- 部分企业防火墙直接丢 MP_CAPABLE 包

**其他原因**:
- 应用要用 `IPPROTO_MPTCP`,需要改代码
- 服务端要部署支持
- 调试链路问题更复杂(多路径排查难)

---

## 三、SCTP:多流不阻塞 + 消息边界

### 3.1 设计目标

```
TCP 的问题:                                SCTP 的解决:
                                             
单一字节流                                   多个独立流(stream)
                                             一个流丢包不影响其他流
                                             
无消息边界                                   有消息边界
                                             send(1KB) → recv(1KB) 严格对应
                                             
单连接绑定一对 IP                            multi-homing
                                             一个 association 多个 IP

应用层要自己做心跳                           内置心跳
```

### 3.2 协议位置

```
应用层 (WebRTC DataChannel / SS7 / Diameter)
  │
SCTP (传输层,IP 协议号 132)
  │
IP
```

**SCTP 是和 TCP / UDP 平级的传输层协议**——**用 IP 协议号 132**,不是 6(TCP)或 17(UDP)。

### 3.3 流(stream)与消息

```
应用 send: stream_id=0, "Hello"
应用 send: stream_id=1, "World"
应用 send: stream_id=0, "!"

网络丢失 stream_id=0 的 "Hello":

接收方:
  stream_id=0 队列:[等 "Hello"]
  stream_id=1 队列:[收到 "World", 立刻交付]
  
应用 recv stream 1:"World"  ← 不等 stream 0
```

**对比 TCP**:HTTP/2 多路复用是「应用层多流」,但底层 TCP 一段丢包,**所有 stream 全堵**(队头阻塞)——这是 HTTP/3 / QUIC 出现的根本原因。**SCTP 在传输层就解决了**——可惜没普及。

### 3.4 multi-homing

```
[host A]                              [host B]
 IP A1 ─── path 1 ────────────────── IP B1
 IP A2 ─── path 2 ────────────────── IP B2

一个 SCTP association:
  - 两边各有多个 IP
  - 一条路径挂了,自动切到另一条
  - 类似 MPTCP 但更早(SCTP 2000 年,MPTCP 2013 年)
```

**SCTP 默认只用一条路径,其他作为备份**(failover)——不像 MPTCP 同时用。

### 3.5 SCTP 主要应用场景

```
场景 1:电信信令(SS7 over IP / Diameter)        ← SCTP 最大用户
        4G 核心网、计费、用户认证

场景 2:WebRTC DataChannel                        
        浏览器 P2P,JS 写一个 dc.send("hello")    
        底层走 SCTP over DTLS over UDP            

场景 3:某些金融交易系统                          
        需要严格消息边界 + 高可靠                  
```

### 3.6 Linux 上用 SCTP

```c
#include <netinet/sctp.h>

int s = socket(AF_INET, SOCK_STREAM, IPPROTO_SCTP);
// SOCK_SEQPACKET 也行(消息边界模式)

bind(s, ...);
listen(s, 5);
int c = accept(s, ...);

// 发到特定 stream
struct sctp_sndinfo info = {.snd_sid = 0};  // stream id
sctp_sendmsg(c, "hello", 5, NULL, 0, 0, 0, /*stream*/0, 0, 0);
```

```bash
apt install libsctp-dev  # 用户态库
modprobe sctp            # 加载内核模块
```

---

## 四、为什么 SCTP 没普及

**和 MPTCP 同病相怜**——**中间盒不友好**:

```
防火墙规则:允许 TCP 6 / UDP 17 / ICMP 1
SCTP 用 IP 协议号 132 → 默认丢
```

**结果**:
- 公网上 SCTP 几乎完全不通
- 只在专网 / 电信内部 / 浏览器内部隧道里活着

**WebRTC 的「妥协」**:**SCTP over DTLS over UDP**——把 SCTP 包封装在 UDP 里:

```
SCTP 包 → DTLS 加密 → UDP → IP
        ↑↑↑ 中间盒只看到 UDP,放行
```

**这是「在 UDP 之上重做传输层」的最早实践之一**——后来 QUIC 基本走的同条路。

---

## 五、QUIC 怎么把 MPTCP / SCTP 内化

参考 24 篇 QUIC——**QUIC 在 UDP 之上,实现了 MPTCP 和 SCTP 的核心思想**:

| 特性 | MPTCP | SCTP | QUIC |
| --- | --- | --- | --- |
| **多路径 / 连接迁移** | ✓ | ✓ (multi-homing) | ✓ (Connection Migration) |
| **多流** | ✗ | ✓ | ✓ (multi stream) |
| **消息边界** | ✗ | ✓ | ✓ (帧) |
| **加密** | ✗ | ✗ | ✓ (内置 TLS 1.3) |
| **0-RTT** | ✗ | ✗ | ✓ |
| **中间盒友好** | ✗ | ✗ | ✓ (UDP) |

**QUIC = MPTCP + SCTP + TLS 1.3 + 0-RTT,全部跑在 UDP 之上**。

### 5.1 Connection Migration:致敬 MPTCP

```
QUIC 用 Connection ID 而不是 4-tuple 标识连接
        ↓
client 从 WiFi 切到 4G,IP 变了
        ↓
QUIC 包还是同一个 Connection ID,server 识别后无缝接管
        ↓
HTTPS 请求不中断
```

这就是 MPTCP 的「失败重做」。

### 5.2 多流无队头阻塞:致敬 SCTP

```
QUIC 的一个连接里有多个 stream
        ↓
stream 1 数据丢了,只重传 stream 1 那段
        ↓
stream 2、3 的数据正常交付
```

**对比 HTTP/2 over TCP**:TCP 段丢了,所有 stream 全堵——**这是 HTTP/3 改用 QUIC 的根本动力**。

### 5.3 中间盒友好

```
MPTCP / SCTP 失败的根本原因:中间盒识别新协议,直接丢
QUIC 用 UDP:中间盒只看到普通 UDP 包,放行
QUIC 内容全加密:中间盒看不到协议字段,改不了
```

**这个「全加密 + UDP」的设计直接绕过了所有中间盒**——比 MPTCP / SCTP 高明的关键一步。

---

## 六、什么时候用 MPTCP / SCTP

### 6.1 MPTCP 适用

| 场景 | 适用度 | 原因 |
| --- | --- | --- |
| 移动设备 WiFi+4G 切换 | 高 | iPhone 实证 |
| 双网卡服务器(冗余 / 负载均衡) | 中 | 数据中心内可控 |
| 公网普通 web 服务 | 低 | 中间盒兼容性差 |
| 内网企业网络 | 中 | 防火墙可控 |

### 6.2 SCTP 适用

| 场景 | 适用度 | 原因 |
| --- | --- | --- |
| 电信核心网(SS7/Diameter) | 高 | 历史悠久,标配 |
| WebRTC DataChannel | 高 | 但实际是 SCTP over DTLS over UDP |
| 普通业务通信 | 极低 | 完全打不通公网 |
| 微服务通信 | 低 | gRPC over HTTP/2 更主流 |

### 6.3 替代方案

```
要多路径 + 在公网?           → QUIC(HTTP/3)
要多流不阻塞 + 在公网?       → QUIC
要在浏览器实现 P2P?          → WebRTC DataChannel(底层用 SCTP)
要在数据中心内多路径?         → MPTCP(可控环境,中间盒友好)
要传统电信信令?             → SCTP(有 30 年历史)
```

---

## 七、协议对比一张大表

| 维度 | TCP | UDP | MPTCP | SCTP | QUIC |
| --- | --- | --- | --- | --- | --- |
| **传输层位置** | IP 协议号 6 | IP 协议号 17 | IP 协议号 6(伪装) | IP 协议号 132 | UDP 之上 |
| **可靠性** | 是 | 否 | 是 | 是 | 是 |
| **顺序** | 是(单流) | 否 | 是(逻辑单流) | 是(每个流内) | 是(每个流内) |
| **多流** | 否 | 否 | 否 | 是 | 是 |
| **多路径** | 否 | N/A | 是 | 是(failover) | 是(迁移) |
| **消息边界** | 否 | 是 | 否 | 是 | 是(帧) |
| **加密** | 否 | 否 | 否 | 否 | 内置 TLS 1.3 |
| **握手开销** | 1 RTT | 0 | 1+ RTT | 4-way | 1 RTT(0 RTT 复用) |
| **中间盒友好** | 高 | 高 | 中 | 极低 | 高 |
| **应用** | HTTP/1.1/2 | DNS / RTP | iPhone Siri | SS7 / WebRTC | HTTP/3 |

---

## 八、抓包看 MPTCP

```bash
# 抓 MPTCP 协商
tcpdump -nn -vvv 'tcp[tcpflags] & tcp-syn != 0 and tcp[20:4] = 0x1e'
# 0x1e = MP_CAPABLE 选项类型 30

# Wireshark 直接过滤
mptcp
mptcp.subtype == 0      # MP_CAPABLE
mptcp.subtype == 1      # MP_JOIN
mptcp.subtype == 2      # DSS (数据序号信号)

# 看 subflow 状态
ip mptcp monitor
```

---

## 九、抓包看 SCTP

```bash
tcpdump -nn -i any 'ip proto 132'
# 或
tcpdump -nn -i any sctp

# Wireshark 过滤
sctp
sctp.chunk_type == 1      # DATA
sctp.chunk_type == 0      # INIT (协商)
```

---

## 十、踩坑提醒

1. **以为 MPTCP 自动用上多路径** —— 必须 socket 用 `IPPROTO_MPTCP` + 配置 endpoint
2. **以为 SCTP 在公网能通** —— 几乎不通,中间盒一律丢 IP 协议号 132
3. **以为 WebRTC DataChannel 直接走 SCTP** —— 实际是 SCTP over DTLS over UDP
4. **以为 MPTCP 比 TCP 总是更快** —— 多路径管理有开销,只在路径切换 / 多 ISP 场景才有优势
5. **以为 SCTP 在数据中心可以普及** —— 大部分负载均衡器 / SDN 不支持
6. **以为 QUIC 不需要再学 SCTP/MPTCP** —— 理解它们的设计才理解 QUIC 为什么这么做
7. **企业内网用 MPTCP 不通** —— 防火墙 strip 选项,要在防火墙白名单
8. **抓包不开过滤** —— SCTP 默认 tcpdump 不显示,要 `ip proto 132`
9. **以为内核协议越多越好** —— 实际生产用的就 TCP/UDP/QUIC,其他都是小众
10. **看到 RFC 老就以为该普及** —— SCTP 1999 年 RFC,二十多年了仍然小众,不是技术不好,是中间盒生态不接受

---

下一篇:`16-TCP调优实战.md`,**整个传输层最实战的一篇**——把前 5 篇(11 UDP / 12 握手 / 13 拥塞 / 14 高级特性 / 15 MPTCP / SCTP)的理论全部落到 sysctl 配置上。socket 缓冲区 / 队列 / TIME_WAIT / Fast Open / BBR 上线 checklist / `ss -i` 实战——给一份「**高并发 web 服务器 TCP 调参完整 sysctl 配置**」可以直接抄走。
