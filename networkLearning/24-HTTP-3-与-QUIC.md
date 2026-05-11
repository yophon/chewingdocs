# HTTP/3 与 QUIC

「HTTP/3 不就是 HTTP/2 跑在 UDP 上吗?」——这是一句正确但毫无信息量的话。**QUIC 才是主角**——HTTP/3 只是 QUIC 的一个用户。**QUIC 是过去 30 年传输层最大的革命**:**把 TCP + TLS 合二为一**、**把传输层从内核搬到用户态**、**用 UDP 当底层但提供可靠传输**、**0-RTT 重连**、**WiFi 切 4G 不断线的连接迁移**。Google 2012 年开始搞,2021 年 IETF 标准化为 RFC 9000-9002。**今天 Cloudflare、Google、Facebook 25%+ 的流量是 HTTP/3**。

> 一句话先记住:**QUIC = UDP + 用户态可靠传输 + 内置 TLS 1.3 + 多流(无 TCP HOL)+ 连接迁移**。**HTTP/3 = HTTP 语义 + QUIC 传输 + QPACK 头压缩**。**HTTP/2 解决了应用层 HOL 但 TCP 层 HOL 还在,HTTP/3 是为了消灭最后这一层 HOL**。**记住一句话**:**HTTP/3 把 HTTP/2 的"流"概念下沉到了传输层,所以丢包只影响那一条流**。

---

## 一、HTTP/2 留下的烂摊子:TCP 层队头阻塞

### 1.1 现象再讲一次

```
HTTP/2 一个 TCP 连接跑 N 条流:
  
  TCP 字节流(按序):  [stream1帧][stream3帧][stream5帧][stream1帧][stream3帧]...
                                          ↑
                                       这一段丢包
                                          ↓
  TCP 必须按序投递   →  内核扣下后续所有数据
                     →  应用层的 stream 1, 3, 5 全部卡住
                     →  哪怕只有 stream 3 的帧丢了,stream 1 和 5 也得等
```

**根本原因**:**TCP 是字节流协议**,内核根本不知道哪些字节属于哪条 HTTP/2 流。

### 1.2 为什么 TCP 改不了

TCP **跑在内核**,所有路由器 / 中间盒(middlebox)都假设 TCP 行为不变:

```
中间盒(NAT / 防火墙 / WAF / LB):
  - 检查 SYN / ACK 序号
  - 跟踪窗口 / 重传
  - 修改 MSS / TSecr
  - 假装智能限流

→ 你想给 TCP 加新功能?
   要中间盒升级 → 要厂商升级 → 要运营商升级
   → 10 年都搞不完(MPTCP 就是反例,2013 标准化,今天还没普及)

→ 这就是「TCP 协议僵化」(ossification)
```

**结论**:**在 TCP 上叠新功能死路一条**。要革命就只能换协议——但**新协议过不了中间盒**(防火墙看到陌生协议直接丢)。**唯一活路**:**包在 UDP 里**——所有中间盒认 UDP。

---

## 二、QUIC 是什么:UDP 之上的可靠传输

### 2.1 一句话定义

**QUIC = 在 UDP 之上,用户态实现的"可靠 + 加密 + 多流"传输协议**。

```
HTTP/1.1 / HTTP/2 协议栈:
  HTTP                  ← 应用
  TLS                   ← 加密
  TCP                   ← 可靠传输
  IP                    ← 网络层
  
HTTP/3 协议栈:
  HTTP/3                ← 应用
  QUIC                  ← 可靠传输 + 加密 + 多流(三合一)
  UDP                   ← 网络层之上的最薄层
  IP                    ← 网络层
```

### 2.2 QUIC 把三件事合一

**TCP + TLS + HTTP/2 多流** → **QUIC 一层全干**:

| 功能 | TCP/TLS 时代 | QUIC |
| --- | --- | --- |
| 可靠传输 | TCP | QUIC 帧 + ACK 帧 |
| 加密 | TLS over TCP | QUIC 内置(TLS 1.3 提供密钥) |
| 多流 | HTTP/2 stream(在 TCP 字节流上) | QUIC stream(传输层原生) |
| 拥塞控制 | TCP CUBIC / BBR | QUIC 用户态 CUBIC / BBR |
| 流量控制 | TCP 窗口 + HTTP/2 窗口(两层) | QUIC 一层(连接 + 流) |

### 2.3 为什么"用户态"是革命

```
TCP:协议栈在内核
  → 改协议要改内核
  → 部署:Linux 升级 → 几年起
  → 用户态进程拿不到底层包(除了 raw socket)

QUIC:协议栈在用户态库(quiche / msquic / lsquic)
  → 改协议改库就行
  → 部署:升级 nginx / Chrome → 几个月
  → 想加新功能?发个 PR
  
迭代速度:TCP 5-10 年,QUIC 几个月
```

**这就是为什么 QUIC 能在 5 年内反复迭代,而 TCP BBR 推 10 年还有人不开**。

### 2.4 代价

```
1. CPU 占用高
   QUIC 用户态实现,每个包都要 syscall + 加解密
   → CPU 占用是 TCP 的 2-3 倍
   → 服务器扛 100Gbps QUIC 比 100Gbps TCP 难

2. 中间盒不友好
   很多企业防火墙 / 4G 运营商默认丢 UDP
   → QUIC 必须能 fallback 到 TCP+TLS+HTTP/2
   → 浏览器先并发尝试 QUIC + HTTP/2,谁先连上用谁(Happy Eyeballs)

3. 调试难
   wireshark 能看 QUIC 但要导密钥
   tcpdump 看到一坨 UDP 字节
```

> 经验法则:**QUIC 不是万能药**——内网一切正常的场景,TCP + HTTP/2 仍然简单高效。**QUIC 真正发光在公网弱网 + 移动端**。

---

## 三、QUIC 帧 vs HTTP/3 帧:分层的细致

### 3.1 两层帧

QUIC 自己有一套帧(传输层),HTTP/3 在 QUIC 流里又有一套帧(应用层)——容易混淆。

```
UDP 包
└── QUIC Packet(QUIC 报文,带连接 ID + 包号)
    └── QUIC Frames(可以多个)
        ├── STREAM Frame  ← 装应用数据
        │   └── HTTP/3 Frames(应用层帧)
        │       ├── HEADERS
        │       ├── DATA
        │       └── ...
        ├── ACK Frame
        ├── PING Frame
        ├── CRYPTO Frame  ← 装 TLS 握手
        └── ...
```

### 3.2 QUIC 帧类型(部分)

| 类型 | 干什么 |
| --- | --- |
| PADDING | 填充 |
| PING | 心跳 |
| ACK | 确认收到哪些包 |
| RESET_STREAM | 关一条流 |
| STOP_SENDING | 让对端别发某条流 |
| CRYPTO | 装 TLS 1.3 握手数据 |
| NEW_TOKEN | 给客户端一个 token,下次 0-RTT 用 |
| **STREAM** | 装应用数据(HTTP/3 帧塞这里) |
| MAX_DATA | 连接级流量控制 |
| MAX_STREAM_DATA | 流级流量控制 |
| MAX_STREAMS | 最多能开多少流 |
| NEW_CONNECTION_ID | 给对端一个新的连接 ID(连接迁移用) |
| RETIRE_CONNECTION_ID | 回收旧连接 ID |
| PATH_CHALLENGE | 验证新路径(连接迁移) |
| PATH_RESPONSE | 响应路径验证 |
| CONNECTION_CLOSE | 关连接 |
| HANDSHAKE_DONE | 握手完成 |

### 3.3 HTTP/3 帧类型

| 类型 | 干什么 |
| --- | --- |
| DATA | 请求 / 响应 body |
| HEADERS | 请求 / 响应头(QPACK 编码) |
| CANCEL_PUSH | 取消推送 |
| SETTINGS | 连接参数 |
| PUSH_PROMISE | 推送声明(同 HTTP/2,基本不用) |
| GOAWAY | 优雅关闭 |
| MAX_PUSH_ID | 推送 ID 上限 |

**QUIC 帧管"传输怎么走",HTTP/3 帧管"语义"**——分得很干净。

---

## 四、QUIC 包的格式

### 4.1 长头(Long Header,握手用)

```
+-+-+-+-+-+-+-+-+
|1|1|T T|R R|P P|
+-+-+-+-+-+-+-+-+
|         Version (32)            |
+-+-+-+-+-+-+-+-+
| DCID Len (8)  |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|  Destination Conn ID (0..160)  |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| SCID Len (8)  |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|   Source Conn ID (0..160)      |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| Type-specific payload          |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

**长头 4 类型**:Initial / 0-RTT / Handshake / Retry。

### 4.2 短头(Short Header,握手后用)

```
+-+-+-+-+-+-+-+-+
|0|1|S|R|R|K|P P|
+-+-+-+-+-+-+-+-+
| Destination Conn ID (0..160)  |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| Packet Number (8/16/24/32)    |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| Protected Payload             |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

**没有源连接 ID**(已经在握手时换过)。**头部本身大部分加密**——中间盒看不到。

### 4.3 加密强制

QUIC 规定:**包号(Packet Number)**也加密、**头部 flag**也加密——**只有连接 ID 和最少的元数据明文**。

```
意图:
  防止中间盒"基于 TCP 序号"的优化僵化
  → 中间盒看到的就是一串看似随机的字节
  → 想搞特殊处理?没法搞 → 协议保持灵活

代价:
  CPU 又涨一档
  调试更难
```

> 这是 QUIC 团队**故意的对抗设计**——他们说"我们不能再让 TCP 那种僵化重演,所以从一开始就不给中间盒留口子"。

---

## 五、连接 ID:替代四元组

### 5.1 TCP 的痛

TCP 连接由**四元组**唯一标识:

```
(源 IP, 源端口, 目 IP, 目端口)

任意一个变 → 连接断
```

**典型场景**:

```
你在咖啡店连 WiFi 看 YouTube → 192.168.1.10:54321 → ...
走出门切 4G                     → 100.100.100.100:54321 → ...
                                  ↑ 源 IP 变了
                                  ↓
                              TCP 连接断
                              → YouTube 视频卡 → 重连 → 重新登录
```

### 5.2 QUIC 的解法:连接 ID

QUIC 包带一个**连接 ID(CID)**,长度 0-20 字节:

```
你的 IP 从 192.168.1.10 切到 100.100.100.100
  → 但 CID 还是 0xa1b2c3d4...
  → 服务器收到包,看 CID 找到原来的连接状态
  → 继续走

视频不卡,登录不丢
```

### 5.3 安全:CID 怎么避免被追踪

**只用一个 CID 会被中间人追踪**(同一个 CID 跨网络出现 = 同一个用户)。所以:

```
握手时,服务器一次给客户端发一组 CID(NEW_CONNECTION_ID 帧)
客户端切换网络时,**用一个新的 CID**
→ 中间观察者看到不同 CID 的包,以为是不同连接
→ 隐私保护
```

### 5.4 现状

**Chrome / Firefox / Safari 都实现了连接迁移**,但**很多 NAT 路由器超时太短**,实际效果打折。**最稳的场景**:**移动端 4G ↔ WiFi 切换**——视频 / 大文件下载基本无感。

---

## 六、握手:TLS 1.3 内嵌 + 1-RTT

### 6.1 QUIC 握手 = TLS 1.3 握手

QUIC 不是"TCP 握手 + TLS 握手"——它把 TLS 1.3 握手**直接编码到 QUIC 帧里**(CRYPTO 帧):

```
客户端                              服务器
  │                                  │
  ├── Initial[CRYPTO[ClientHello]] ──►│   1 个 UDP 包
  │                                  │   = QUIC 连接建立 + TLS ClientHello
  │                                  │
  │◄── Initial[CRYPTO[ServerHello]] ─┤   1 个 UDP 包  
  │     Handshake[CRYPTO[Cert,...]]  │   = ServerHello + Cert + Finished
  │                                  │
  ├── Handshake[CRYPTO[Finished]] ──►│
  ├── 1-RTT[STREAM[HTTP request]] ──►│   ← 第二个 RTT 已经在发数据
  │                                  │
  │◄── 1-RTT[STREAM[HTTP response]] ─┤
```

**对比 TCP + TLS 1.3**:

```
TCP 三次握手    1 RTT
TLS 1.3 握手    1 RTT
─────────────  ──────
                2 RTT 才能发数据

QUIC 握手       1 RTT 就能发数据
```

**省了 1 个 RTT**——50ms RTT 链路上,**首字节快 50ms**。

### 6.2 0-RTT:第二次连接 0 个 RTT

```
第一次连过的客户端,服务器给了 NEW_TOKEN(包含一些会话信息)

第二次连接:
  ├── Initial[CRYPTO[ClientHello + token + early_data]] + STREAM[HTTP req] ──►│
  │                                                            ↑
  │                                                       同一个 UDP 包里就发了请求
  │◄── Initial[CRYPTO[ServerHello]] + 1-RTT[HTTP response] ─────────────────────┤
```

**第二次连接,0 个 RTT 就开始发数据**——你打开常去的网站,**首字节延迟可以 < 网络 RTT**。

### 6.3 0-RTT 的安全代价

**0-RTT 数据有重放风险**:

```
中间人录下一个 0-RTT 数据包(比如"购买 1 件 A")
不解密,直接重发
→ 服务器收到两个相同的购买请求
→ 重复购买
```

**对策**:**0-RTT 只能发幂等请求**(GET / HEAD)。**POST / PUT / DELETE 必须等到 1-RTT 之后**。

> 经验法则:**0-RTT 是"为缓存命中的 GET 加速"**——用对地方暴击,用错(写操作)出血。

---

## 七、连接迁移实战:WiFi → 4G

### 7.1 完整流程

```
你在 WiFi 上看 YouTube,QUIC 连接已建立
  CID = 0xABCDEF
  
切换到 4G:
  你的源 IP 从 192.168.1.10 变成 100.100.100.100
  
QUIC 客户端:
  1. 检测到网络变化(操作系统通知)
  2. 用新 IP 发一个 PATH_CHALLENGE 帧到服务器,带 CID
  3. 服务器收到,看 CID 找到原连接,从新地址回 PATH_RESPONSE
  4. 客户端收到 PATH_RESPONSE → 验证新路径可用
  5. 切换到新路径,继续传
  
全程不重连、不重新握手、不重传
```

### 7.2 防伪造攻击:路径验证

**为什么需要 PATH_CHALLENGE**?攻击者可能伪造 IP 头,让服务器把流量"打"到无辜第三方(放大攻击):

```
攻击:
  攻击者把源 IP 伪造成受害者 IP,发"我切到这个新 IP 了"
  → 服务器开始往受害者 IP 发数据 → 受害者被打
  
防御:
  PATH_CHALLENGE 带一个 8 字节随机数
  → 必须从那个 IP 收到包含同一随机数的 PATH_RESPONSE 才信
  → 攻击者拿不到随机数,验证失败
```

---

## 八、流(Stream)在 QUIC 里

### 8.1 流是传输层原生概念

```
TCP + HTTP/2:    流是 HTTP/2 在 TCP 字节流上"虚拟"出来的概念
                 → TCP 不知道流的存在 → 一段丢全卡

QUIC:            流是 QUIC 传输层的原生概念
                 → 每条流独立排序、独立 ACK、独立流量控制
                 → stream 1 的包丢了,stream 3 照常投递
                 → 真·消灭传输层 HOL
```

### 8.2 流 ID 编码

```
最低 2 位:
  00:客户端发起,双向流
  01:服务端发起,双向流
  10:客户端发起,单向流
  11:服务端发起,单向流

→ 单向流用于 QPACK 编码器流、控制流等
→ 双向流用于 HTTP 请求 / 响应
```

### 8.3 QPACK:HTTP/3 的头压缩

HPACK(HTTP/2)有个问题:**动态表更新顺序敏感**——HTTP/2 用 TCP 保证顺序,所以没事。**HTTP/3 流之间无序**,直接搬 HPACK 会出问题。

**QPACK 的解法**:**把动态表更新放在专门的"编码器流"上**,数据流引用动态表项。**编码器流和数据流的顺序问题用"插入计数"解决**——头部块声明依赖到第几个动态表项,接收方等到那个项被更新才能解码。

```
省字节的同时,处理了"流之间乱序"
代价:实现复杂,QPACK 库都不好写
```

---

## 九、curl --http3 / quiche 实操

### 9.1 安装支持 HTTP/3 的 curl

curl 默认不带 HTTP/3,要装带 quiche / ngtcp2 的版本:

```bash
# macOS
$ brew install curl --HEAD       # Homebrew curl 默认 quiche

# 检查
$ curl --version | grep HTTP3
Features: alt-svc AsynchDNS HTTP2 HTTP3 ...
```

### 9.2 curl --http3

```bash
$ curl -v --http3 https://www.google.com/

* Trying 142.250.200.4:443...
* QUIC connect to 142.250.200.4 port 443 OK
* Connected to www.google.com (142.250.200.4) port 443
* Using HTTP/3
* h3 [:method: GET]
* h3 [:path: /]
* h3 [:scheme: https]
* h3 [:authority: www.google.com]
> GET / HTTP/3
> Host: www.google.com
> 
< HTTP/3 200
< content-type: text/html; charset=ISO-8859-1
< ...
```

### 9.3 Alt-Svc:HTTP/3 怎么被发现

浏览器第一次访问站点时还是 HTTP/2,服务器返:

```
HTTP/2 200 OK
alt-svc: h3=":443"; ma=86400
```

意思:**"我也支持 HTTP/3,在端口 443,缓存这个信息 86400 秒(1 天)"**。**浏览器下次访问就直接用 HTTP/3**。

```bash
# 看 alt-svc
$ curl -I https://www.google.com/
HTTP/2 200
alt-svc: h3=":443"; ma=86400
```

### 9.4 quiche-client(Cloudflare 出的 QUIC 库)

```bash
$ git clone --recursive https://github.com/cloudflare/quiche
$ cargo build --examples
$ ./target/debug/examples/http3-client https://cloudflare-quic.com/

connected
recv 1-RTT data
HTTP/3 response: HEADERS Status 200
HTTP/3 response: DATA <html>...</html>
```

### 9.5 用 Wireshark 看 QUIC

QUIC 完全加密,要解密必须导出 TLS 密钥:

```bash
$ SSLKEYLOGFILE=/tmp/quic_keys.log curl --http3 https://www.google.com/

# Wireshark → Preferences → Protocols → TLS
#   (Pre)-Master-Secret log filename: /tmp/quic_keys.log
# 抓包 udp port 443
# 现在能看到 QUIC 帧详情
```

### 9.6 nginx 上开 HTTP/3

```nginx
http {
    server {
        listen 443 ssl;
        listen 443 quic reuseport;     # QUIC 监听
        
        http2 on;
        http3 on;
        
        ssl_certificate     /etc/ssl/cert.pem;
        ssl_certificate_key /etc/ssl/key.pem;
        ssl_protocols TLSv1.3;          # QUIC 强制 TLS 1.3
        
        add_header alt-svc 'h3=":443"; ma=86400';
    }
}
```

---

## 十、QUIC 的拥塞控制

### 10.1 默认是 NewReno / CUBIC

QUIC 协议规定**默认拥塞控制是 NewReno**(RFC 9002),实现可以替换为 CUBIC / BBR。

### 10.2 用户态 BBR

把 BBR 从内核搬到用户态有意外好处:

```
内核 BBR:
  调参要改 sysctl
  实验要重新编内核
  
用户态 BBR(QUIC):
  代码改一行,重启服务
  A/B 测试不同拥塞算法,几小时见结果

→ Google QUIC 团队自己魔改 BBR(BBRv2 / BBRv3)
→ 想推新算法不用等所有 Linux 升级
```

**这就是"协议在用户态"的工程暴击**——传输层创新加速 10 倍。

---

## 十一、踩坑提醒

1. **以为 HTTP/3 必然比 HTTP/2 快**——CPU 占用更高,内网未必;**真正的暴击在弱网 / 移动**
2. **企业防火墙丢 UDP**——很多公司只放 80/443/TCP,QUIC 完全不通,必须 fallback
3. **0-RTT 用错**——不要在 POST / 写操作上用,有重放风险
4. **以为连接迁移在所有网络都好用**——NAT 表项超时短的话还是会断
5. **服务器 CPU 飙升**——Nginx + HTTP/3 比 HTTP/2 多吃 50%+ CPU,要规划容量
6. **wireshark 抓 QUIC 没东西看**——必须导 SSLKEYLOGFILE
7. **MTU 问题更严重**——QUIC 强制 1200 字节最小 IPv6 MTU,有些隧道不达标
8. **GSO / GRO 没开**——用户态 QUIC 高吞吐必须靠内核 segment offload
9. **以为 HTTP/3 没有 HOL**——单条流内部还是有的(同一条流的乱序还是要等)
10. **以为 QUIC = HTTP/3**——QUIC 是通用传输,DNS-over-QUIC、SMB-over-QUIC、TURN-over-QUIC 都在搞

---

## 十二、HTTP/1.1 / 2 / 3 总结表

| 维度 | HTTP/1.1 | HTTP/2 | HTTP/3 |
| --- | --- | --- | --- |
| 传输层 | TCP | TCP | QUIC (UDP) |
| Wire 格式 | 文本 | 二进制帧 | 二进制帧(QUIC + HTTP/3 双层) |
| 多路复用 | 无(开多连接) | 流 + 帧 | QUIC 原生流 |
| 头压缩 | 无 | HPACK | QPACK |
| 加密 | 可选 TLS | 实践上 TLS 1.2/1.3 | 强制 TLS 1.3(内嵌) |
| 握手 RTT | TCP 1 + TLS 2(1.2)/1(1.3) | 同 1.1 | TLS 内嵌,1 RTT,可 0-RTT |
| 应用层 HOL | 有 | 无 | 无 |
| 传输层 HOL | 有 | 有 | **无** |
| 连接迁移 | 不行 | 不行 | **行**(连接 ID) |
| Server Push | 无 | 有(已废) | 有(基本不用) |
| 调试工具 | telnet / curl | nghttp / curl --http2 | curl --http3 / quiche / wireshark |
| 现状 | ~30% 流量 | ~40% 流量 | ~25% 流量(快速增长) |

---

下一篇:`25-WebSocket内部.md`,讲长连接通信的另一条路——**WebSocket 怎么从 HTTP 升级出来**(`Upgrade: websocket` + `Sec-WebSocket-Key` + 101 Switching)、**帧格式**(opcode / mask / payload / 控制帧 ping/pong/close)、**心跳和超时怎么设**、**permessage-deflate 压缩扩展**、**WebSocket 之上还有协议簇**(Socket.IO / MQTT / STOMP)、**WebSocket vs SSE vs Long Polling 怎么选**、**用 wscat 调 WebSocket**——以及为什么 WebSocket 鉴权比 HTTP 难得多。
