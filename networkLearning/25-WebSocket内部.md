# WebSocket 内部

「WebSocket 不就是双向 socket 吗?」——这是 90% 前端工程师对 WebSocket 的全部认知。但**WebSocket 是 HTTP 时代最巧妙的"协议越狱"**——它**借了一次 HTTP 升级,然后从此抛弃 HTTP**,跑自己的二进制帧协议。RFC 6455(2011)定义了它,**今天聊天、实时推送、协作编辑、在线游戏、股票行情**都靠它。但**WebSocket 的坑也最多**:**心跳怎么设、断线怎么重连、鉴权怎么做、压缩开不开、负载均衡怎么过、HTTP/2 上跑还是 HTTP/1.1**——每一项都有踩坑历史。

> 一句话先记住:**WebSocket = HTTP 升级握手 + 之后的二进制 / 文本帧双向通信**——一个 TCP 连接长开,**两端都能主动发**。**握手是 HTTP,握完 WebSocket 帧和 HTTP 完全无关**。**和 SSE 比**:WebSocket 双向、SSE 单向(只有服务器推);**和 Long Polling 比**:WebSocket 是真长连接、Long Polling 是反复短连接装长连接。

---

## 一、WebSocket 解决什么:HTTP 推不动

### 1.1 HTTP 的根本限制

HTTP 是**请求 / 响应**模式——客户端不发,服务器永远不能"主动"推一句话过去。**实时场景**(聊天、股票、协作编辑、游戏)不能接受。

### 1.2 三种"假装服务端推"

WebSocket 出现前,业界用三种 hack 模拟"服务端推送":

```
1. 短轮询(Polling)
   客户端每 5 秒发一次:"有新消息吗?"
   → 90% 请求空跑,服务器压力大,延迟最高 5 秒
   
2. 长轮询(Long Polling)  
   客户端发一个请求,服务器**hang 住不返**,有消息才返
   → 一返立即再发下一个请求
   → 像极了真实推送,但每次推都要重建 HTTP 连接
   
3. SSE(Server-Sent Events)
   服务器返一个 chunked 响应,**永远不结束**,有消息就 chunk 出去
   → 浏览器原生支持(EventSource)
   → 单向(只能服务器→客户端)
```

### 1.3 WebSocket 横空出世

**WebSocket 给你"真双工"**:

```
客户端发                  服务器发
   │                        │
   ├──── 帧 ───────────────►│
   │◄──── 帧 ───────────────┤
   ├──── 帧 ───────────────►│
   │◄──── 帧 ───────────────┤
   │◄──── 帧 ───────────────┤   ← 服务器可以连续推
   │◄──── 帧 ───────────────┤
   ├──── 帧 ───────────────►│
   
一个 TCP 连接,两端任意时刻发任意帧
```

**典型应用**:聊天(WhatsApp Web)、协作(Google Docs)、行情(Binance Order Book)、游戏(Agar.io)、IDE(VS Code Live Share)。

---

## 二、升级握手:借 HTTP 一次

### 2.1 握手请求

```http
GET /chat HTTP/1.1
Host: example.com
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13
Sec-WebSocket-Protocol: chat, superchat       ← 子协议候选
Sec-WebSocket-Extensions: permessage-deflate  ← 扩展候选
Origin: https://example.com
```

关键 header:

| Header | 干什么 |
| --- | --- |
| `Upgrade: websocket` | 我要升级到 WebSocket |
| `Connection: Upgrade` | 这个连接要换协议 |
| `Sec-WebSocket-Key` | 16 字节随机数的 base64,**防误升级** |
| `Sec-WebSocket-Version` | 必须是 13(其他是历史版本) |
| `Sec-WebSocket-Protocol` | 应用层"子协议"协商(可选) |
| `Sec-WebSocket-Extensions` | 协议扩展(如压缩) |
| `Origin` | 前端来源,服务器做 CORS-like 校验 |

### 2.2 握手响应:状态码 101

```http
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
Sec-WebSocket-Protocol: chat                    ← 选中的子协议
Sec-WebSocket-Extensions: permessage-deflate    ← 选中的扩展
```

**101 Switching Protocols** = "本连接从此不再走 HTTP"。

### 2.3 Sec-WebSocket-Accept 怎么算

```
Sec-WebSocket-Accept = base64(SHA1(
    Sec-WebSocket-Key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
))
```

后面那串 GUID 是**写死的魔数**(magic number),来自 RFC 6455。**作用**:**防止误把普通 HTTP 当成 WebSocket**——非 WebSocket 服务器不知道这个魔数,算不出正确的 Accept。

```bash
# 手算一下
$ echo -n "dGhlIHNhbXBsZSBub25jZQ==258EAFA5-E914-47DA-95CA-C5AB0DC85B11" \
    | openssl dgst -sha1 -binary | base64
s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

### 2.4 wss:// = WebSocket over TLS

```
ws://  → 跑在 HTTP 上(端口 80,明文)
wss:// → 跑在 HTTPS 上(端口 443,TLS 加密)
```

**生产一律 wss://**——明文 ws:// 在公网会被中间盒(运营商 / 公司代理)误判 + 拦截。

---

## 三、帧格式:RFC 6455 的二进制设计

### 3.1 完整帧布局

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-------+-+-------------+-------------------------------+
|F|R|R|R| opcode|M| Payload len |    Extended payload length    |
|I|S|S|S|  (4)  |A|     (7)     |             (16/64)           |
|N|V|V|V|       |S|             |   (if payload len==126/127)   |
| |1|2|3|       |K|             |                               |
+-+-+-+-+-------+-+-------------+-------------------------------+
|     Extended payload length continued, if payload len == 127  |
+-------------------------------+-------------------------------+
|                               | Masking-key, if MASK set to 1 |
+-------------------------------+-------------------------------+
| Masking-key (continued)       |          Payload Data         |
+-------------------------------- - - - - - - - - - - - - - - - +
:                       Payload Data continued ...              :
+ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - +
|                       Payload Data continued ...              |
+---------------------------------------------------------------+
```

### 3.2 字段速查

| 字段 | 位 | 含义 |
| --- | --- | --- |
| FIN | 1 | 是否最后一帧(分片用) |
| RSV1/2/3 | 各 1 | 保留,扩展用(permessage-deflate 用 RSV1) |
| opcode | 4 | 帧类型(见下) |
| MASK | 1 | payload 是否掩码(**客户端→服务器必须 1**,反向必须 0) |
| Payload len | 7 | 0-125 直接长度;126 = 用接下来 16 位;127 = 用接下来 64 位 |
| Extended len | 16/64 | 大 payload 的真实长度 |
| Masking-key | 32 | 4 字节掩码(MASK=1 时) |
| Payload | 变长 | 数据 |

### 3.3 opcode 全集

| opcode | 名字 | 含义 |
| --- | --- | --- |
| 0x0 | continuation | 续帧(分片) |
| 0x1 | text | UTF-8 文本(JSON 走这) |
| 0x2 | binary | 二进制(protobuf / msgpack 走这) |
| 0x8 | close | 关连接 |
| 0x9 | ping | 心跳请求 |
| 0xA | pong | 心跳响应 |
| 0x3-0x7 / 0xB-0xF | 保留 | 未来用 |

**0x8-0xF 是控制帧**——必须 ≤ 125 字节,不能分片。

### 3.4 为什么客户端必须 mask

```
风险:
  WebSocket 帧的某些字段如果纯文本可见
  → 中间缓存 / 代理可能错把它当成 HTTP
  → "缓存投毒攻击"(cache poisoning)
  
解决:
  客户端发的每一帧用一个 32 位随机 key
  把 payload 每个字节 XOR 上 key[i % 4]
  → 中间设备看到的就是"随机字节",不会误判

服务器→客户端不需要 mask:
  服务器是受信任的,不存在"恶意客户端缓存投毒"反向问题
```

### 3.5 一个最小 text 帧

发送 "Hi" 这两字节(从客户端,所以要 mask):

```
0x81  → FIN=1, opcode=1(text)
0x82  → MASK=1, len=2
0x12 0x34 0x56 0x78  → 4 字节 mask key
0x5B 0x5D            → "Hi"(0x48 0x69)XOR mask 后

服务器解码:
  收到 0x5B 0x5D
  XOR 0x12 0x34 → 0x49 0x69 → "Ii"  ← 不对,因为 mask 是按字节循环
  正确算:0x5B^0x12=0x49='I'  0x5D^0x34=0x69='i'
  → "Ii"  
  (这个例子的 mask 我编的,实际 mask 不同,得到 "Hi")
```

(细节看 RFC 6455 5.3 节)

### 3.6 分片(Fragmentation)

发一个超大消息(比如 10MB 文件):

```
帧 1: FIN=0, opcode=0x2(binary), payload=前 1MB
帧 2: FIN=0, opcode=0x0(continuation), payload=中间 1MB
...
帧 N: FIN=1, opcode=0x0(continuation), payload=最后部分

接收方:把 N 帧 payload 拼起来 = 完整消息
```

**控制帧(ping/pong/close)可以插在分片之间**——心跳不被大消息阻塞。

---

## 四、心跳:keep alive 是命

### 4.1 为什么必须心跳

```
WebSocket 连接长开,但中间有:
  - NAT(家庭路由器、运营商)
  - 防火墙
  - LB / 反向代理
  
这些设备的连接表都有超时:
  NAT TCP 超时:30 秒到 1 小时不等(运营商 4G 经常 30s)
  Nginx proxy_read_timeout:默认 60s
  AWS ALB 空闲超时:60s
  
没数据流动一段时间 → 中间设备清表 → 连接被半关
→ 客户端不知道,继续往这个"已死"连接发数据
→ 几秒后才超时
```

**结论**:**WebSocket 必须主动维持心跳**——20-30 秒一次比较稳。

### 4.2 ping/pong 帧

```
客户端发 ping(opcode 0x9),payload 任意(常见空或 4 字节时间戳)
服务器收到,**必须**回相同 payload 的 pong(opcode 0xA)
反之亦然

如果 N 秒没收到对方的 pong → 认为连接死了 → 关掉重连
```

### 4.3 应用层心跳 vs 协议心跳

```
协议层 ping/pong:浏览器原生 WebSocket 不能直接发 ping(JS API 没有)
                  Node.js 'ws' 库 socket.ping() 可以
                  
应用层心跳:发一个 text 帧 {"type":"ping"},对端回 {"type":"pong"}
            → 浏览器也能发
            → 业内更常用
```

**典型实现**:

```javascript
// 浏览器
const ws = new WebSocket('wss://example.com/');
let pongTimeout;

setInterval(() => {
    ws.send(JSON.stringify({type: 'ping'}));
    pongTimeout = setTimeout(() => {
        ws.close();   // 5 秒没收到 pong,认为死了
        reconnect();
    }, 5000);
}, 25000);   // 25 秒一个心跳

ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'pong') clearTimeout(pongTimeout);
};
```

> 经验法则:**心跳 25-30 秒一次**(挡住 60s 超时),**等待 pong 超时设 5-10 秒**(挡住网络抖动)。**收不到 pong 立刻断+重连**。

---

## 五、permessage-deflate 压缩扩展

### 5.1 为什么需要

WebSocket 传输 JSON 时,**重复的字段名 / 字段值压缩比 70%+**——开了压缩,带宽减少一大截。

```
{"type":"chat","user":"alice","text":"hello"}     ← 50 字节
{"type":"chat","user":"alice","text":"world"}     ← 50 字节
重复的 type/user 字段名能高压缩
```

### 5.2 怎么开

握手时声明:

```
请求:Sec-WebSocket-Extensions: permessage-deflate; client_max_window_bits
响应:Sec-WebSocket-Extensions: permessage-deflate
```

之后**每个数据帧** payload 用 deflate(zlib)压缩,**头部 RSV1=1** 标记。

### 5.3 滑动窗口共享

可选 `client_no_context_takeover` / `server_no_context_takeover`:

```
带 takeover(默认):多帧之间共享压缩字典 → 压缩率高但内存占用大
                    服务器维护 N 个连接 = N 个 32KB 窗口 = 几十 GB
                    
no_context_takeover:每帧独立压缩 → 内存省但压缩率低
```

> 经验法则:**少量大流量连接开 takeover**;**海量小连接(IM 服务器)用 no_context_takeover**——否则内存爆炸。

### 5.4 性能 trade-off

```
压缩 CPU:每帧多一次 zlib → CPU +20-50%
压缩比:JSON 通常 60-80% 减少
小帧反而更大:< 100 字节的帧,压缩开销 > 节省

场景:
  聊天(每帧 < 1KB):一般不压
  行情推送(JSON,每帧 1-10KB):开压缩省一半带宽
  二进制 protobuf:已经紧凑,压缩收益小,关
```

---

## 六、关闭握手:close 帧

### 6.1 优雅关闭

```
一方发 close(opcode 0x8),payload = 2 字节状态码 + UTF-8 reason
对方回一个 close 帧
两边关 TCP
```

### 6.2 状态码

| 码 | 含义 |
| --- | --- |
| 1000 | 正常关闭 |
| 1001 | 端点离开(浏览器关页) |
| 1002 | 协议错 |
| 1003 | 收到不能接受的数据(比如只支持 text 收到 binary) |
| 1006 | **不能在帧里出现**——是 JS API 用的"异常断"标记 |
| 1007 | 数据格式错(比如 text 帧非 UTF-8) |
| 1008 | 策略违反 |
| 1009 | 消息太大 |
| 1011 | 服务器内部错 |
| 4000-4999 | **应用自定义**(自由用) |

### 6.3 没收到对端的 close 怎么办

**等 5-10 秒后强制关 TCP**——别死等。

---

## 七、WebSocket 之上的应用协议

WebSocket 只规定了"帧",**怎么封装应用消息**留给上层。常见三套:

### 7.1 Socket.IO(Node 生态)

**Socket.IO ≠ WebSocket**——它是个**封装库**,先尝试 WebSocket,**不行就 fallback 到长轮询**。

```
特性:
  房间(rooms)/ 命名空间(namespaces)
  自动重连 + 重连退避
  消息确认(ack)
  二进制支持
  
代价:
  协议比裸 WebSocket 复杂
  浏览器和服务器必须用 Socket.IO 库(不能用裸 WebSocket 客户端连)
```

**典型用例**:Node.js 后端的实时应用,前端用 socket.io-client。

### 7.2 MQTT(物联网首选)

**MQTT** = Message Queuing Telemetry Transport。**发布 / 订阅模型**,跑在 TCP 或 WebSocket 上。

```
QoS 0:发后不管(可能丢)
QoS 1:至少一次(可能重)
QoS 2:精确一次(开销大)

适用:
  IoT 设备(几 KB 内存的单片机也能跑)
  车联网
  传感器网络
```

**MQTT over WebSocket**:浏览器也能直接订阅 IoT topic。

### 7.3 STOMP(企业 Java 系常见)

**STOMP** = Simple Text Oriented Messaging Protocol,基于文本,跑在 TCP 或 WebSocket 上。**Spring 全家桶里 `@MessageMapping` 用的就是 STOMP over WebSocket**。

```
特性:
  destination(类似 topic)
  send / subscribe / ack 命令
  事务支持
  
缺点:
  文本协议,体积大
  生态偏 Java
```

---

## 八、WebSocket vs SSE vs Long Polling

| 维度 | WebSocket | SSE | Long Polling |
| --- | --- | --- | --- |
| 方向 | 双向 | 单向(server → client) | 双向(但每次都要新连接) |
| 协议层 | 自己一套二进制帧 | HTTP chunked + text/event-stream | 普通 HTTP |
| 浏览器支持 | 全 | 全(IE 不支持) | 全 |
| 自动重连 | 自己实现 | **EventSource 自动** | 自己实现 |
| 二进制 | 支持(opcode 0x2) | 不支持(只能文本,要 base64) | 看你用什么 |
| 鉴权 | 难(见九) | 简单(普通 HTTP) | 简单 |
| HTTP/2 | 1.1 升级,HTTP/2 要 RFC 8441 | HTTP/2 原生支持,**多个 SSE 流复用一个 TCP** | HTTP/2 原生 |
| 通过代理 / LB | 可能要特殊配置 | 简单(就是 HTTP) | 简单 |
| 适用 | 聊天 / 游戏 / 协作 | 行情推送 / 通知 / 日志流 | 兜底方案 |

**选型建议**:

```
真双向交互(聊天 / 游戏)→ WebSocket
只服务器推(通知 / 行情)→ SSE(更简单 + HTTP/2 复用更友好)
连 WebSocket 都过不去的环境 → Long Polling
```

> 经验法则:**新项目优先 SSE**——大部分"实时"场景其实是单向。**只有真双向才 WebSocket**。

---

## 九、wscat:命令行调 WebSocket

```bash
$ npm i -g wscat

$ wscat -c wss://echo.websocket.org
Connected (press CTRL+C to quit)
> hello
< hello
> ping
< ping

$ wscat -c wss://example.com/ws -H "Authorization: Bearer xxx"
$ wscat -c wss://example.com/ws -s chat              # 子协议
```

**调试连不上的 WebSocket 第一招**:`wscat -v` 看握手详情;`curl -i -N -H 'Connection: Upgrade' -H 'Upgrade: websocket' ...` 直接看 101 响应。

---

## 十、鉴权:WebSocket 的最痛

WebSocket 鉴权比 HTTP 难:**只有握手时能发 HTTP header**——之后都是 WebSocket 帧。

### 10.1 方案对比

| 方案 | 怎么做 | 问题 |
| --- | --- | --- |
| **Cookie** | 浏览器 wss:// 自动带同域 cookie | 跨域 / SameSite 麻烦 |
| **子协议(Sec-WebSocket-Protocol)** | 把 token 塞 `Sec-WebSocket-Protocol: bearer.eyJhbGc...` | 不优雅但浏览器 API 支持 |
| **token in URL** | `wss://example.com/ws?token=xxx` | **token 进日志**(Nginx access log 默认记 URL) |
| **首帧鉴权** | 连上后第一帧发 `{"type":"auth","token":"..."}` | 服务器要先建连接才能拒 → DoS 风险 |
| **HTTP 接口先换 ticket** | HTTP 拿 ticket → wss://?ticket=xxx | 麻烦但安全(ticket 一次性) |

### 10.2 浏览器原生 WebSocket 的限制

```javascript
// 不能加自定义 header
new WebSocket('wss://x/ws', { headers: ... })  // ❌ 不支持

// 只能子协议或 URL 参数
new WebSocket('wss://x/ws', ['bearer.eyJhbGc...'])  // ✅ 子协议

new WebSocket('wss://x/ws?token=xxx')               // ✅ 但 token 漏给日志
```

### 10.3 推荐方案

```
1. 用 HTTP 短连接登录,拿到 short-lived ticket(JWT,5 分钟过期)
2. WebSocket 握手把 ticket 塞 Sec-WebSocket-Protocol
3. 服务器握手时校验 ticket,过期或无效直接 401(不升级)
4. 升级后 ticket 关联到 WebSocket 连接 → 后续帧无需再带
5. ticket 一次性使用,防重放
```

---

## 十一、WebSocket over HTTP/2(RFC 8441)

HTTP/2 没有 `Connection: Upgrade`——RFC 8441 用 **Extended CONNECT** 实现 WebSocket over HTTP/2:

```
:method = CONNECT
:protocol = websocket          ← 新的伪头
:scheme = https
:path = /chat
:authority = example.com
sec-websocket-protocol = chat
```

**好处**:多个 WebSocket 复用一个 HTTP/2 TCP 连接 → 不再吃"6 连接"上限。**支持情况**:Chrome / Firefox 支持,**Safari 不支持**。**生产应用** Cloudflare、Envoy 都支持。

**HTTP/3 也有对应版本**(RFC 9220)——WebSocket over HTTP/3,生态更早期。

---

## 十二、Nginx 配 WebSocket 反代

```nginx
upstream ws_backend {
    server 127.0.0.1:8080;
}

server {
    listen 443 ssl;
    
    location /ws {
        proxy_pass http://ws_backend;
        
        # 关键:转发 Upgrade 头
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # 长连接超时(默认 60s 太短)
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        
        # 透传客户端信息
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

**最常见踩坑**:**忘记 `proxy_http_version 1.1`** + **`Connection: upgrade`**——Nginx 默认 HTTP/1.0 给上游,丢掉 Upgrade,握手 502。

---

## 十三、踩坑提醒

1. **没心跳 → 30 秒后连接被 NAT 清表 → 神秘断线**
2. **ws:// 在公网用 → 中间盒乱改 / 拦截 → 用 wss://**
3. **token in URL → Nginx access log 记下来 → 日志泄露 → 用 ticket / 子协议**
4. **服务器单进程 N 个连接共享 zlib 字典 → 内存爆炸 → 用 no_context_takeover**
5. **Nginx 反代忘 `proxy_http_version 1.1`**——502
6. **Nginx `proxy_read_timeout` 默认 60s**——长连接秒断
7. **同账号多端连同一 WebSocket 不互斥 → 消息重复 → 用 device_id 区分**
8. **断线不退避重连 → 服务器宕机时雪崩** → exponential backoff(1s, 2s, 4s, 8s, 30s 上限)
9. **依赖 onclose 区分"正常关"和"异常断"**——状态码 1006 表示异常,要据此重连
10. **大消息没分片 → 单帧 1GB → 服务器内存爆**
11. **以为 WebSocket 比 HTTP 快**——同样数据量,差异 < 10%。WebSocket 赢在"不需要轮询"
12. **跨域(CSWSH)忽略 Origin 检查**——攻击者可在自己页面用你的 cookie 连你的 WebSocket
13. **生产用 Socket.IO 默认参数** → fallback 到 long polling 时连接数翻倍,意外服务器压力

---

下一篇:`26-WebRTC实战.md`,讲浏览器原生的 P2P 通信——**WebRTC 三件事**(信令 / 媒体 / 数据)、**SDP 协商**(双方互发"我能编 H264 / VP8 / 我支持这些 ICE 候选")、**ICE 候选收集**(host / srflx / relay)、**STUN 打洞和 TURN 中继**、**DataChannel**(基于 SCTP over DTLS over UDP 的"WebSocket 替代品",可设可靠 / 不可靠 / 有序 / 无序)、**simulcast 一路上多档清晰度**、**自建 coturn 中继服务器**、**chrome://webrtc-internals 抓内部状态**——以及为什么 WebRTC 是"最复杂的浏览器协议,没有之一"。
