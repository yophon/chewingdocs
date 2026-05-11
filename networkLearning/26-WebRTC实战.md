# WebRTC 实战

「WebRTC 不就是浏览器视频通话吗?」——这是 95% 工程师对 WebRTC 的认知。但**WebRTC 是浏览器里最复杂的协议**——**它不是一个协议,是一整套协议簇**:**SDP(会话描述)+ ICE(穿透)+ STUN(打洞)+ TURN(中继)+ DTLS(加密)+ SRTP(媒体)+ SCTP(数据)+ RTCP(反馈)**——每一项都是独立 RFC,加起来上千页。一个简单的 P2P 视频通话,**从你点击"呼叫"到第一帧画面显示,内部要经过 30+ 步**。Zoom / Google Meet / Discord / FaceTime 网页版都用 WebRTC,**但能讲清楚 ICE 怎么打洞的工程师不到 1%**。

> 一句话先记住:**WebRTC = 信令(开发者自己搭) + 媒体(浏览器搞定) + 数据通道(基于 SCTP)**——浏览器把"找到对端 + 编解码音视频 + 加密 + 发送"全包了,**只留两件事给开发者**:**1. 搭信令服务器交换 SDP**;**2. 搭 STUN / TURN 服务器帮 NAT 穿透**。**全球公网 P2P 直连成功率 70-85%,剩下走 TURN 中继**。

---

## 一、WebRTC 三件事

```
┌─────────────────────────────────────────────────────────┐
│                      WebRTC                             │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   1. 信令(Signaling)  ← 开发者自己搭                  │
│      WebSocket / XHR / 任意                             │
│      - 交换 SDP(offer / answer)                       │
│      - 交换 ICE candidates                              │
│                                                         │
│   2. 媒体(Media)     ← 浏览器实现                    │
│      getUserMedia 拿摄像头 / 麦克风                     │
│      RTCPeerConnection 协商编解码 + 加密发送            │
│      RTP / SRTP / RTCP                                  │
│                                                         │
│   3. 数据(Data)      ← 浏览器实现                    │
│      RTCDataChannel                                     │
│      SCTP over DTLS over UDP                            │
│      可设可靠 / 不可靠 / 有序 / 无序                   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**关键认知**:**WebRTC 标准里没规定信令协议**——你可以用 WebSocket、HTTP 长轮询、Firebase、邮件,理论上手抄 SDP 给对方都行。**WebRTC = 数据通道 + 媒体通道,信令完全自由**。

---

## 二、最小通话流程:10 步

```
A 想和 B 视频通话:

A 浏览器                     信令服务器                    B 浏览器
   │                              │                          │
   │ 1. getUserMedia(摄像头)      │                          │
   │                              │                          │
   │ 2. createOffer() → SDP       │                          │
   │ 3. setLocalDescription       │                          │
   │ 4. POST offer SDP ──────────►│                          │
   │                              │ 5. push offer ──────────►│
   │                              │                          │ 6. setRemoteDescription
   │                              │                          │ 7. createAnswer() → SDP
   │                              │                          │ 8. setLocalDescription
   │                              │◄── POST answer SDP ──────┤
   │◄── push answer ──────────────┤                          │
   │ 9. setRemoteDescription      │                          │
   │                              │                          │
   │ ◄────── 双方互发 ICE candidates(trickle) ─────────────►│
   │                              │                          │
   │ 10. ICE 收敛 → DTLS 握手 → SRTP 媒体流 → 视频出现       │
   │ ◄═══════════════════════ P2P 直连 ════════════════════►│
```

**信令服务器**做完 4-5、8 之后**任务就完了**——后续音视频流不经过它。

---

## 三、SDP:Session Description Protocol

### 3.1 SDP 是什么

**SDP**(RFC 8866)= **一段描述会话的纯文本**。WebRTC 用它告诉对方:

- 我有几路媒体(video / audio)
- 每路用什么编码(H264 / VP8 / Opus)
- 我的 ICE candidates(IP / 端口)
- 我的 DTLS 指纹(防中间人)
- 加密参数

### 3.2 一段真实 SDP(简化)

```
v=0
o=- 1234567890 1 IN IP4 0.0.0.0
s=-
t=0 0
a=group:BUNDLE 0 1
a=msid-semantic:WMS *
m=video 9 UDP/TLS/RTP/SAVPF 96 97
c=IN IP4 0.0.0.0
a=rtcp:9 IN IP4 0.0.0.0
a=ice-ufrag:F7gI
a=ice-pwd:0PqW9b8...
a=fingerprint:sha-256 AB:CD:EF:01:23:45:...
a=setup:actpass
a=mid:0
a=sendrecv
a=rtcp-mux
a=rtpmap:96 VP8/90000
a=rtpmap:97 H264/90000
a=fmtp:97 profile-level-id=42e01f
a=ssrc:1234567890 cname:abcdef
m=audio 9 UDP/TLS/RTP/SAVPF 111
c=IN IP4 0.0.0.0
a=rtcp:9 IN IP4 0.0.0.0
a=ice-ufrag:F7gI
a=ice-pwd:0PqW9b8...
a=fingerprint:sha-256 AB:CD:EF:01:23:45:...
a=setup:actpass
a=mid:1
a=sendrecv
a=rtcp-mux
a=rtpmap:111 opus/48000/2
a=ssrc:0987654321 cname:abcdef
```

### 3.3 重要字段

| 行 | 含义 |
| --- | --- |
| `m=video 9 UDP/TLS/RTP/SAVPF 96 97` | 一路视频媒体,可用 PT 96 和 97 |
| `a=rtpmap:96 VP8/90000` | PT 96 = VP8,采样 90kHz |
| `a=rtpmap:97 H264/90000` | PT 97 = H264 |
| `a=ice-ufrag` / `a=ice-pwd` | ICE 用户名和密码 |
| `a=fingerprint:sha-256 ...` | DTLS 证书指纹(自签名),防中间人 |
| `a=setup:actpass` | DTLS 角色(active / passive / actpass) |
| `a=sendrecv` | 双向收发(也可 sendonly / recvonly / inactive) |
| `a=rtcp-mux` | RTP 和 RTCP 复用一个端口 |
| `a=ssrc:...` | RTP 流的源标识 |
| `a=group:BUNDLE 0 1` | 多个 m= 复用一条传输(同一 ICE / DTLS) |

### 3.4 Offer / Answer 模型

```
A 创建 offer SDP:
  "我能编 VP8 / H264,我能解 Opus,我的 ICE 是..."

B 收到,创建 answer SDP:
  "我也能,我们用 H264 + Opus,我的 ICE 是..."

→ 双方达成"会话契约"
```

**A offer 列了 N 个候选编码,B answer 选其中能交集的**。**不能在 answer 里加 offer 没列的东西**。

### 3.5 SDP 在浏览器里

```javascript
const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
});

const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
stream.getTracks().forEach(t => pc.addTrack(t, stream));

const offer = await pc.createOffer();
await pc.setLocalDescription(offer);

console.log(offer.sdp);   // ← 上面那一坨文本
// 通过信令服务器发给 B
```

---

## 四、ICE:Interactive Connectivity Establishment

### 4.1 为什么需要 ICE

**A 怎么知道 B 的 IP**?A 在公司内网 192.168.1.x,B 在家里 10.0.0.x——**互相看不见**。要靠某种方式发现"对端可以怎么找到我"。

### 4.2 三种候选(Candidate)

ICE 收集**所有可能的"对端能连到我"的地址**:

```
1. host(主机候选)
   本机所有网卡 IP:port
   - 192.168.1.10:54321(局域网 IP)
   - 10.8.0.5:54321(VPN IP)
   - fe80::xxx:54321(IPv6)
   
2. srflx(server reflexive,STUN 反射)
   通过 STUN 服务器看到的"NAT 外的 IP:port"
   - 公司出口 IP 是 218.x.x.x → STUN 告诉你"你看起来像 218.x.x.x:54321"
   
3. relay(中继)
   TURN 服务器分配的中继地址
   - turn.example.com:3478 上的 50000 端口
   - 所有发到这个地址的流量,TURN 转给你
```

### 4.3 ICE 怎么选

收集完所有候选,A 和 B 互发,然后**两两配对做连通性检查**(发 STUN binding request):

```
A 的候选:
  host:    192.168.1.10:54321
  srflx:   218.5.5.5:54321
  relay:   turn.example.com:50001

B 的候选:
  host:    10.0.0.20:54322
  srflx:   115.6.6.6:54322
  relay:   turn.example.com:50002

候选对(candidate pair)= 9 对(3 × 3),按优先级:
  (host, host)   → 最优(局域网内能连)
  (srflx, srflx) → 次优(NAT 穿透成功)
  (relay, *)     → 兜底(走中继,延迟高)

每对都发 STUN binding request 试连通性
→ 选择"成功 + 优先级最高"的那对
```

### 4.4 priority 计算

```
priority = (2^24) * type_pref + (2^8) * local_pref + (2^0) * (256 - component_id)

type_pref:
  host    = 126
  srflx   = 100
  prflx   = 110
  relay   = 0

→ host 永远排第一
→ relay 永远排最后
→ 同类型按 local_pref 选(IPv6 / IPv4 / 不同网卡)
```

### 4.5 Trickle ICE

**老式 ICE**:候选全收集完才发 SDP → 慢(STUN 要发包等回包)。

**Trickle ICE**(RFC 8838):**一边收集一边发**——SDP 先发(不带 candidates),候选**陆续 trickle 过来**。**首字节快几百毫秒**。

### 4.6 ICE 状态机

```
new → checking → connected → completed
                   ↓
              disconnected → failed → closed

connected:有一对候选连通了,可以发数据
completed:所有可能性都试完了,选好了最优
disconnected:连接中断(暂时丢包)
failed:全部候选都不通 → P2P 失败
```

---

## 五、STUN:打洞

### 5.1 STUN 干什么

**STUN**(RFC 5389)= **告诉你"在 NAT 外面看,你长啥样"**。

```
你的内网 IP:port = 192.168.1.10:54321
你向 STUN 服务器(stun.l.google.com:19302)发个 binding request

经过 NAT 转换后,STUN 服务器看到的源 IP:port 是 218.5.5.5:33333
STUN 服务器把这个地址回给你

→ 你现在知道:外界看到的我是 218.5.5.5:33333
→ 把这个地址告诉对端,对端往这里发包
→ 你的 NAT 表里有这个映射 → 包能进来
```

### 5.2 NAT 类型决定打洞难度

| NAT 类型 | 行为 | STUN 能打通? |
| --- | --- | --- |
| Full Cone | 内网 X:y → 外 P:q,**任何外部 IP 都能往 P:q 发** | 容易 |
| Restricted Cone | 内网 X:y → 外 P:q,**只有 X:y 主动发过的目标 IP 能回** | 容易 |
| Port Restricted | Restricted + IP+port 都要匹配 | 容易 |
| Symmetric | **内网 X:y → 不同目标用不同外部 P:q** | **难!** |

**双方都是 Symmetric NAT** → STUN 几乎打不通(因为 STUN 看到的端口和实际给对端用的端口不一样)→ **必须走 TURN**。

### 5.3 公司 / 运营商常见 NAT 类型

```
家庭路由器:大部分 Restricted / Full Cone(95%+ 能打通)
公司防火墙:经常 Symmetric(打不通比例高)
4G / 5G:运营商 NAT,**经常 Symmetric**(打不通比例 30%+)
WiFi 公共网络:不可预测
```

### 5.4 用 stun 工具测自己的 NAT

```bash
$ npm install -g stun
$ stun stun.l.google.com 19302

  Mapped Address: 218.5.5.5:33333
  Source Address: 142.250.x.x:19302
  ...

# 也可以测公司的 NAT 类型
$ stun -t stun.l.google.com  # type detection
```

---

## 六、TURN:打不通时的兜底

### 6.1 TURN 干什么

**TURN**(Traversal Using Relays around NAT,RFC 8656)= **"我的 NAT 太严,打不通,你帮我中继一下"**。

```
A 和 B 都是 Symmetric NAT,直连失败
↓
A 联系 TURN 服务器:"给我分配一个中继地址"
TURN 服务器:"你用 turn.example.com:50001 这个端口"
↓
A 把 turn.example.com:50001 作为自己的 candidate 发给 B
B 把数据发到 turn.example.com:50001
↓
TURN 服务器收到,转发给 A
A 回包给 TURN,TURN 转给 B
```

**所有流量经过 TURN 服务器**——**带宽你出**。

### 6.2 TURN 的成本

```
1080p 视频通话:~2 Mbps 双向 = 4 Mbps × 服务器
1000 个并发通话经 TURN 转发 = 4 Gbps
按云服务流量价 ~0.05 元/GB:
  4 Gbps × 1 小时 = 1800 GB → 90 元/小时 → 65万/年(只算 1000 路)

→ 大厂自己跑 coturn 集群 + 自带带宽
→ 小厂用 Twilio / Xirsys 这种 TURN-as-a-Service
```

### 6.3 TURN 协议

TURN 跑在 UDP 3478(也支持 TCP / TLS,绕过严格防火墙)。基本流程:

```
1. Allocate 请求 → TURN 分配中继地址
2. CreatePermission → 允许某个对端 IP 发数据
3. Send 数据 → TURN 转发
4. ChannelBind → 给对端绑定个 channel id,后续用更紧凑的 ChannelData(省 36 字节头)
```

### 6.4 ICE-TCP / TURN-TCP / TURNS

**严格防火墙只放 80/443 TCP**(很多公司):

```
TURN over TCP(端口 3478)→ 还是公司可能拦
TURN over TLS(443)→ 看起来像 HTTPS,几乎都能过
TURNS = TURN over TLS over TCP
```

**生产 TURN 服务器都开 443/TCP/TLS 端口**——保证最坏情况也能通。

---

## 七、NAT 穿透成功率:残酷的数字

业界共识(Cisco / Google / Cloudflare 数据):

```
P2P 直连(host 或 STUN):  70-85%
走 TURN:                  10-25%
全失败(网络太烂):          1-5%

→ 必须有 TURN 兜底,否则 20%+ 用户连不上
```

**移动端更糟**:**4G 运营商 NAT 普遍 Symmetric**,直连成功率掉到 50% 以下。

> 经验法则:**生产 WebRTC 服务,TURN 是必备基础设施,不是可选项**。**没 TURN 的 demo 跑得通,是因为你还没遇到 Symmetric NAT 用户**。

---

## 八、DataChannel:WebSocket 的 P2P 替代

### 8.1 什么是 DataChannel

**RTCDataChannel** = WebRTC 提供的**任意二进制 / 文本数据通道**——点对点,**不经过服务器**。

```javascript
const pc = new RTCPeerConnection(...);
const dc = pc.createDataChannel('chat', {
    ordered: true,           // 有序
    maxRetransmits: 3,       // 最多重传 3 次
    maxPacketLifeTime: 1000  // 1 秒内重传(只能选一个)
});

dc.onopen = () => dc.send('hello');
dc.onmessage = (e) => console.log('recv:', e.data);
```

### 8.2 协议栈

```
RTCDataChannel
   ↓
SCTP(可靠 / 部分可靠 / 不可靠 + 多流)
   ↓
DTLS(加密)
   ↓
UDP
```

**SCTP**(Stream Control Transmission Protocol)是个很老的传输协议(2000 年 RFC 2960),它的**多流 + 部分可靠**特性正好适合 WebRTC。

### 8.3 三种可靠性模式

| 配置 | 行为 | 适用 |
| --- | --- | --- |
| 默认(`ordered=true`) | 完全可靠 + 有序,等同 TCP | 文件传输 / 游戏状态同步 |
| `ordered=false` | 可靠但乱序到达就投递,不阻塞后续 | 实时消息 |
| `maxRetransmits=N` | 最多重传 N 次,失败就丢 | 游戏位置(过时就过时) |
| `maxPacketLifeTime=ms` | N 毫秒内重传,过期丢 | 实时光标 / 弹幕 |

### 8.4 vs WebSocket

| 维度 | WebSocket | DataChannel |
| --- | --- | --- |
| 拓扑 | 客户端-服务器 | P2P(两端直连) |
| 服务器带宽 | 全过服务器 | 只走信令(几 KB) |
| 延迟 | 经服务器一跳 | 直连,RTT 减半 |
| 鉴权 | 服务器统一管 | P2P 难鉴权 |
| 浏览器支持 | 全 | 全(包括 mobile) |
| 适用 | 群聊 / 大房间 | 1-1 / 小房间 / 文件传 |

**典型场景**:**WebRTC 视频会议附带的"文件传输"用 DataChannel**——服务器只转发信令,几 GB 文件直接 P2P 传。

---

## 九、媒体编码:VP8 / VP9 / H264 / AV1

### 9.1 视频编码对比

| 编码 | 优点 | 缺点 | 占用 |
| --- | --- | --- | --- |
| **H264** | 兼容性最好(所有手机都有硬解) | 专利费(WebRTC 没收,但你用别的产品要付) | 标准 |
| **VP8** | 免专利(Google) | 老,压缩比不如 H264 | 略大 |
| **VP9** | 比 H264 省 30% 带宽 | 硬解支持差 | 中 |
| **AV1** | 比 VP9 省 30% | CPU 软编巨慢,硬件刚普及 | 最小 |

**WebRTC 必须支持 VP8 + Opus**(强制),H264 / VP9 / AV1 是可选。

### 9.2 音频:Opus 一统天下

**Opus**(RFC 6716)= **WebRTC 默认音频编码**。

```
特性:
  6 kbps - 510 kbps 全覆盖
  延迟 < 26ms
  抗丢包(FEC + DTX)
  音乐 + 语音都好
  
→ 比 G.711 / G.722 / Speex 全面碾压
```

### 9.3 编码协商

SDP 里 offer 列编码,answer 选交集。**Chrome 默认偏好 VP8**,**Safari 偏好 H264**——跨浏览器场景最好两个都列。

---

## 十、Simulcast:一路上多档清晰度

### 10.1 问题

视频会议有 1 个发送方、N 个接收方。每个接收方:

```
有人在大屏 1080p 看
有人在手机 360p 看
有人在弱网 180p 看

发送方编一份 1080p → 浏览器自动转码给所有人?
→ 转码 CPU 在哪?在 SFU 服务器(Selective Forwarding Unit)
→ SFU 转码 = CPU 巨贵
```

### 10.2 Simulcast 的解法

**发送方同时编 3 档**:**1080p + 540p + 180p**,**全部发给 SFU**。**SFU 不转码**——只是按接收方需求**选一档转发**。

```javascript
const sender = pc.getSenders().find(s => s.track.kind === 'video');
sender.setParameters({
    encodings: [
        { rid: 'q', maxBitrate: 100000  },  // 低
        { rid: 'h', maxBitrate: 500000  },  // 中
        { rid: 'f', maxBitrate: 2500000 }   // 高
    ]
});
```

**SFU 看接收方网络情况选档**——网络好给 f,网络差降到 q。**典型 SFU 实现**:Janus / mediasoup / Jitsi / livekit。

### 10.3 SVC(Scalable Video Coding)

更高级的方案:**一路码流内部分层**——一个码流里包含 base layer + 增强 layer。**SFU 截断高层就降清晰度**。**比 Simulcast 省发送带宽**,**实现更复杂**(VP9 / AV1 才有完整 SVC)。

---

## 十一、自建 STUN / TURN:coturn

### 11.1 装 coturn

```bash
$ sudo apt install coturn
$ sudo vi /etc/turnserver.conf
```

最小配置:

```conf
listening-port=3478
tls-listening-port=5349

# 公网 IP(必须配)
external-ip=YOUR.PUBLIC.IP

# 鉴权:长期凭据 or REST API
lt-cred-mech
user=alice:secretpassword

# 域(WebRTC 客户端要传)
realm=example.com

# TLS 证书(TURN over TLS)
cert=/etc/letsencrypt/live/turn.example.com/fullchain.pem
pkey=/etc/letsencrypt/live/turn.example.com/privkey.pem

# 中继端口范围
min-port=49152
max-port=65535

# 日志
log-file=/var/log/turn.log
verbose
```

启动:

```bash
$ sudo systemctl enable --now coturn
```

### 11.2 浏览器配置

```javascript
const pc = new RTCPeerConnection({
    iceServers: [
        { urls: 'stun:stun.example.com:3478' },
        {
            urls: [
                'turn:turn.example.com:3478?transport=udp',
                'turn:turn.example.com:3478?transport=tcp',
                'turns:turn.example.com:5349?transport=tcp'
            ],
            username: 'alice',
            credential: 'secretpassword'
        }
    ]
});
```

**生产**:**username/password 不要写死**——用**TURN REST API**(HMAC 签名,短期 token)。

### 11.3 防火墙开端口

```
3478 UDP/TCP    STUN + TURN
5349 TCP        TURN over TLS
49152-65535 UDP 中继端口段
```

---

## 十二、调试:chrome://webrtc-internals

### 12.1 打开调试页

Chrome 地址栏输入 `chrome://webrtc-internals`,**显示当前所有活跃 WebRTC 连接**——**最强大的内置调试工具**。

### 12.2 能看到什么

```
- 所有 RTCPeerConnection 实例
- 完整 SDP(offer / answer)
- 所有 ICE candidates 及配对
- ICE state 转换历史
- DTLS 握手状态
- 实时统计:
  - 收 / 发码率(每秒)
  - 丢包率
  - RTT
  - jitter
  - 帧率 / 分辨率
  - 编解码器
- getStats() API 的全部数据
- 事件时间线
```

**典型用法**:

```
1. 视频卡 → 看 packetsLost、jitter
2. 连不上 → 看 iceConnectionState 卡在 checking → 找 ICE candidate 配对失败原因
3. CPU 高 → 看用了什么编码、有没有用硬件加速
4. 中继了没 → 看活跃 candidate pair 是 host / srflx / relay
```

### 12.3 导出 dump 给 RTC 工程师看

页面有 "Create Dump" 按钮 → 下一个 JSON,**任何 WebRTC 工程师能用它复盘整个会话**。

### 12.4 其他调试工具

```
Firefox: about:webrtc
Safari: develop → service workers → Web Inspector
Wireshark: STUN / DTLS / SRTP 抓包(要 SSLKEYLOGFILE 解 DTLS)
Trickle ICE 测试: https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/
```

---

## 十三、踩坑提醒

1. **没配 TURN → 30% 用户连不上**(Symmetric NAT)
2. **TURN 没开 443/TLS → 严格防火墙穿不过**
3. **TURN 凭据写死在前端**——任何人能拿去白嫖你的带宽,**用 REST API 短期 token**
4. **以为 WebRTC 能省服务器** → 1-1 是 P2P,但**多人会议必须 SFU**(MCU 太贵)
5. **Simulcast 不开 → SFU 要转码 → CPU 爆炸**
6. **AEC(回声消除)不开 → 用户耳机一拔扬声器播自己声音 → 啸叫**
7. **getUserMedia 在非 HTTPS → 浏览器拒绝授权**(localhost 例外)
8. **iceServers 顺序错** → 把 TURN 放第一个,STUN 永远不试 → 全走中继
9. **DataChannel 大文件没分片** → 单包 > MTU → 失败;**手动分块 16KB**
10. **以为 SDP 可以乱改** → SDP 字段联动,改一行可能整个握手失败
11. **不监听 oniceconnectionstatechange** → 网络抖动后不重启 ICE,连接死了不知道
12. **多端登录冲突** → 同账号多设备发起信令,候选混乱
13. **服务端 WebRTC(SFU)忘了 SO_REUSEPORT + 多核 → 单核 CPU 100%**
14. **DTLS 证书不防中间人** → SDP 必须带 fingerprint,**fingerprint 必须经可信信令通道传**(否则中间人改 SDP 就能 MITM)
15. **以为 WebRTC 简单** → 它是浏览器最复杂的协议,**没有之一**

---

## 十四、HTTP 演进五章总结

至此 22-26 章讲完应用层最重要的五个协议:

| 章 | 协议 | 解决什么 | 典型场景 |
| --- | --- | --- | --- |
| 22 | HTTP/1.1 | 文本 + Keep-Alive + Range | 经典 API |
| 23 | HTTP/2 | 二进制 + 多路复用 + HPACK | 高性能 API / Web |
| 24 | HTTP/3 + QUIC | 消灭 TCP HOL + 0-RTT + 连接迁移 | 移动 / 弱网 / 直播 |
| 25 | WebSocket | 双向长连接 | 聊天 / 协作 / 推送 |
| 26 | WebRTC | P2P 音视频 / 数据 | 通话 / 会议 / 文件直传 |

**心智图**:

```
请求-响应  →  HTTP/1.1 → HTTP/2 → HTTP/3
推送       →  SSE
双向       →  WebSocket
P2P        →  WebRTC
```

---

下一篇:`27-DNS协议.md`,讲互联网最被低估的瓶颈——**DNS 协议**:**递归 vs 迭代解析**(你的 8.8.8.8 帮你跑全图,顶级权威服务器一去就是十几跳)、**记录类型**(A / AAAA / CNAME / MX / TXT / SRV / NS / SOA,每种用途不同)、**DNS 报文格式**(那个让人怀疑人生的二进制压缩格式,name compression 用指针引用)、**EDNS0**(把 DNS 报文从 512 字节扩到 4KB,DNSSEC / ECS 全靠它)、**dig 全字段拆解**——以及为什么"系统第一次连一个新服务,P99 80% 来自 DNS 慢"。
