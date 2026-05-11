# HTTP/2

「HTTP/2 不就是 HTTP/1.1 加了个'多路复用'吗?」——这是新手对 HTTP/2 的全部认知。但**HTTP/2 是 HTTP 历史上最大的协议重构**:**从文本协议变成二进制协议**、**从一连接一请求变成一连接 N 流**、**头部从明文变成 HPACK 压缩**——基本上"长得像 HTTP 的别的协议"。HTTP/2 占今天网络流量的 60%+,但**会写 HTTP/2 服务器的人不到 1%**——因为它根本不能用 telnet 调,必须依赖 nghttp / Wireshark / curl --http2。

> 一句话先记住:**HTTP/2 = 二进制帧 + 流 + 多路复用 + HPACK**——一个 TCP 连接同一时间能跑 100 个请求,**消灭 HTTP/1.1 的应用层队头阻塞**。但**TCP 层的队头阻塞还在**(丢一个包整个连接卡)——那个要等 HTTP/3 + QUIC(24 篇)。**HTTP/2 是"在 TCP 上能做到的极限"**。

---

## 一、为什么有 HTTP/2:1.1 的极限

### 1.1 三个挠心的问题

```
1. 应用层队头阻塞
   一个 TCP 连接同一时间只能跑一个请求
   → 浏览器开 6 个连接缓解,但仍然是"6 路 HOL"
   
2. 头部冗余
   每个请求重发同一坨 User-Agent / Cookie / Accept
   → 1KB header + 50 字节 body,头比正文还大
   
3. 没有优先级
   浏览器同时要 CSS / JS / 图片,
   服务器不知道哪个先发,只能 FIFO
```

### 1.2 SPDY → HTTP/2

Google 2009 年开搞 **SPDY 协议**(读 "speedy"),想:**把 HTTP 包在一层二进制 + 流 + 压缩里**。Chrome 和 Firefox 实现后实测:**页面加载快 30%-50%**。

2015 年 IETF 把 SPDY 标准化,改名 **HTTP/2,RFC 7540**。**协议语义和 HTTP/1.1 完全一致**(还是 GET/POST/200/404),**改的是 wire format**(线上的字节怎么编码)。

> 经验法则:**HTTP/2 是 HTTP/1.1 的"传输层重写"**——你写后端代码不用改,Nginx / Envoy 帮你做了 1.1 ↔ 2 的桥接。

---

## 二、二进制分帧:替代文本协议

### 2.1 一切都是帧

HTTP/1.1 是 `\r\n` 分隔的文本。HTTP/2 把所有东西塞进**帧(Frame)**:

```
HTTP/1.1 一个请求 = 请求行 + 头 + 空行 + body 文本

HTTP/2 一个请求 = HEADERS 帧 + DATA 帧 + DATA 帧 + ...(全二进制)
```

### 2.2 帧的统一格式

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                  Length (24)                  |   Type (8)    |
+---------------+-----------------------------------------------+
|   Flags (8)   |
+-+-------------+-----------------------------------------------+
|R|                 Stream Identifier (31)                      |
+=+=============================================================+
|                       Frame Payload (0..Length)               |
+---------------------------------------------------------------+
```

**9 字节固定头**:

| 字段 | 位 | 含义 |
| --- | --- | --- |
| Length | 24 | Payload 长度,最大 16MB(SETTINGS_MAX_FRAME_SIZE 默认 16KB) |
| Type | 8 | 帧类型(见下表) |
| Flags | 8 | 类型相关的标志位 |
| R | 1 | 保留,必须 0 |
| Stream ID | 31 | 这个帧属于哪条流(0 = 整个连接控制) |
| Payload | 变长 | 帧内容 |

### 2.3 十种帧类型

| Type | 名字 | 干什么 |
| --- | --- | --- |
| 0x0 | DATA | 请求 / 响应的 body |
| 0x1 | HEADERS | 请求 / 响应的头部(HPACK 编码) |
| 0x2 | PRIORITY | 流优先级声明 |
| 0x3 | RST_STREAM | 强制关闭一条流(等价于 1.1 的"取消请求") |
| 0x4 | SETTINGS | 连接参数协商(窗口大小、最大流数等) |
| 0x5 | PUSH_PROMISE | 服务端推送声明 |
| 0x6 | PING | 心跳 + RTT 测量 |
| 0x7 | GOAWAY | 优雅关闭连接(告诉对端"别再发流了") |
| 0x8 | WINDOW_UPDATE | 流量控制窗口加大 |
| 0x9 | CONTINUATION | HEADERS 太长拆包,后续接 |

### 2.4 一个 GET 请求的帧序列

```
客户端 → 服务器:
  HEADERS 帧 (stream=1, END_HEADERS, END_STREAM)
    :method: GET
    :scheme: https
    :path: /api/users
    :authority: api.example.com
    user-agent: curl/7.79

服务器 → 客户端:
  HEADERS 帧 (stream=1, END_HEADERS)
    :status: 200
    content-type: application/json
    content-length: 27
  DATA 帧 (stream=1, END_STREAM)
    {"id":42,"name":"alice"}
```

**关键观察**:

- `:method` / `:status` 这种**带冒号的"伪头"**(pseudo-header)替代了 1.1 的请求行 / 状态行
- `END_STREAM` 标志位表示"这条流到此结束"
- **HEADERS + DATA 通过同一个 stream id 关联**

---

## 三、流(Stream)与多路复用:核心创新

### 3.1 什么是流

**流 = 一对请求 / 响应在 HTTP/2 连接上的逻辑通道**——靠 Stream ID 区分。

```
TCP 连接(物理):
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  stream 1: HEADERS DATA DATA          (GET /a.html)     │
│  stream 3:        HEADERS DATA        (GET /b.css)      │
│  stream 5:    HEADERS DATA DATA DATA  (GET /c.png)      │
│  stream 7:                HEADERS     (GET /d.js)       │
│                                                         │
└─────────────────────────────────────────────────────────┘
                帧在 wire 上交错(interleave)
```

**所有帧在 TCP 字节流上交错传输**——客户端 / 服务器按 Stream ID 重新组装。**这就是多路复用**。

### 3.2 Stream ID 规则

```
0           保留给连接级控制(SETTINGS / PING / GOAWAY)
奇数(1,3,5,7,...)   客户端发起的流
偶数(2,4,6,8,...)   服务器发起的流(Server Push)
单调递增              不能重用
```

**Stream ID 是 31 位**——一个连接能用 ~21 亿个流,**用完只能新建连接**。所以连接复用 + 长寿命对 HTTP/2 重要。

### 3.3 流状态机

```
                    +--------+
                    |  idle  |
                    +--------+
                       |  发 HEADERS
                       v
                    +--------+    
                    |  open  |   ← 正常请求 / 响应进行中
                    +--------+
              END_STREAM /
                       |
                       v
                +-------------+
                | half-closed |
                +-------------+
              对端 END_STREAM
                       |
                       v
                    +--------+
                    | closed |
                    +--------+
```

(简化,实际还有 reserved / RST_STREAM 跳转分支)

### 3.4 为什么"多路复用"消灭 HOL

```
HTTP/1.1(单连接):
  req1: ████████████████████ (slow)
  req2:                      ███ (waits for req1)

HTTP/1.1(6 连接):
  conn1: req1 ████████████████████
  conn2: req2 ███
  conn3: req3 ████
  conn4-6: idle

HTTP/2(单连接,多路复用):
  stream1: ███ ███ ███ █ █ █ █ █ █ █ █ █ █ █ █ █ █ █ █
  stream3:    ███ ███
  stream5:        ███ ███ ███ ███
  
  ↑ 三个流的帧在 wire 上交错,谁有数据谁先发
```

**应用层 HOL 消失**——慢请求不堵后续请求。

但是!**TCP 层 HOL 还在**:

```
TCP 字节流:[stream1 帧][stream3 帧][stream5 帧][stream1 帧]...
                              ↑
                          这一段丢包
                              ↓
                  TCP 必须按序投递 → 整个连接的所有流都卡住

→ 弱网下 HTTP/2 反而比 HTTP/1.1 慢
→ HTTP/3 + QUIC 才彻底解决
```

> 经验法则:**HTTP/2 在好网络下大胜 HTTP/1.1,在弱网下不一定**。**移动 / 跨国走 HTTP/3**。

---

## 四、HPACK 头压缩:把 1KB 压到 30 字节

### 4.1 为什么需要

HTTP/1.1 每个请求都重发:

```
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ...
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,...
Accept-Encoding: gzip, deflate, br
Accept-Language: en-US,en;q=0.9,zh-CN;q=0.8
Cookie: a=1; b=2; c=3; ...(可能几 KB)
```

加起来 **1-4 KB**。一个网页 100 个资源 = **100-400 KB 纯重复头**。

### 4.2 HPACK 三件套

**HPACK** = Header Compression for HTTP/2,RFC 7541。三个机制:

```
1. 静态表(Static Table)
   预定义 61 个常用头部
   :method GET → 索引 2
   :status 200 → 索引 8
   accept-encoding gzip, deflate → 索引 16
   ...
   
2. 动态表(Dynamic Table)
   连接级别的"已发过的头"缓存
   第一次发 cookie: sessionid=abc → 加入动态表 (index 62)
   下次再发 → 直接发索引 62
   
3. Huffman 编码
   字符串字面量用 Huffman 压(英文字符压缩 ~30%)
```

### 4.3 静态表(部分)

| Index | Name | Value |
| --- | --- | --- |
| 1 | :authority |  |
| 2 | :method | GET |
| 3 | :method | POST |
| 4 | :path | / |
| 5 | :path | /index.html |
| 6 | :scheme | http |
| 7 | :scheme | https |
| 8 | :status | 200 |
| ... | ... | ... |
| 16 | accept-encoding | gzip, deflate |
| ... | ... | ... |
| 32 | cookie |  |
| 33 | date |  |
| ... | ... | ... |

**`:method GET` 这种最常见的请求头,在 wire 上就 1 个字节**(index 2)。

### 4.4 编码策略

每个头有 4 种编码方式:

```
1. Indexed(完全在表里)        1 字节
   "Static[2]" → :method GET

2. Literal with indexing       变长,加入动态表
   "name=cookie, value=abc" → 加入动态表

3. Literal without indexing    变长,不加表
   敏感字段(Authorization)用,不进表防侧信道

4. Literal never indexed       变长,代理也不能加表
   超敏感字段
```

### 4.5 真实案例:压缩比

```
原始头(HTTP/1.1):
  GET / HTTP/1.1
  Host: example.com
  User-Agent: Mozilla/5.0 (...) Chrome/120
  Accept: text/html,...
  Accept-Encoding: gzip, deflate, br
  Cookie: sid=abc123def456...
  ────────────────────────────
  总长 ~1200 字节

第一次 HTTP/2 发(动态表为空):
  HEADERS 帧约 ~400 字节(Huffman 压缩)
  
第二次发(同样的头):
  HEADERS 帧约 ~30 字节(全是动态表索引)
```

**省 90%+ 字节**——这是 HTTP/2 在重复请求场景的隐藏暴击。

### 4.6 HPACK 安全:CRIME 攻击的教训

HPACK **不用通用 gzip**——是因为前任 SPDY 用 gzip,**结果有 CRIME 攻击**:

```
攻击者控制部分头部内容(如 URL)
观察压缩后大小
猜测 Cookie 字符 → 字符匹配时压缩率高
→ 一字节一字节猜出 Cookie
```

HPACK 的设计**故意限制**字符串字面量的处理,**让攻击者无法通过观察长度推断秘密**。**敏感字段用"never indexed"明确禁止入表**。

> 经验法则:**`Authorization` 和敏感 Cookie 用 never-indexed**——大部分 HTTP/2 实现自动处理,但写代理 / SDK 时要注意。

---

## 五、流优先级与依赖

### 5.1 浏览器视角的需求

```
一个网页要加载:
  index.html(HTML,优先级 P0)
    → 引用 main.css      (P1,阻塞渲染)
    → 引用 app.js        (P1,阻塞执行)
    → 引用 hero.jpg      (P5,首屏图)
    → 引用 footer.png    (P9,首屏外)
    → 异步 analytics.js  (P10,可以最后)

服务器需要知道:CSS 优先于 footer.png 发
```

### 5.2 RFC 7540 的优先级:依赖树

每个流可以声明:

```
stream 3 依赖 stream 1,权重 200
stream 5 依赖 stream 1,权重 100
stream 7 依赖 stream 5,权重 16
```

形成一棵树:

```
       stream 1 (HTML)
      /         \
   200/         100\
    /             \
stream 3        stream 5
                   |
                  16
                   |
                stream 7
```

服务器**按树和权重分配带宽**。

### 5.3 为什么没人真正用对

- **太复杂**:浏览器实现各异(Chrome / Firefox / Safari 优先级树都不一样)
- **服务器不会优化**:Nginx 长期忽略优先级,h2o 早期才认真做
- **HTTP/3 简化**:RFC 9218 弃用依赖树,改成简单的 `urgency` + `incremental` 两个标量

> HTTP/2 优先级**理论很美,工程实现一塌糊涂**。**HTTP/3 已经放弃依赖树**,回到简单的"紧急度 + 是否增量"。

---

## 六、Server Push:为什么被废弃

### 6.1 设计意图

服务器在客户端**还没要的时候**主动推送:

```
浏览器发 GET /index.html
  → 服务器知道"这个 HTML 引用了 main.css 和 app.js"
  → 干脆和 HTML 一起把 main.css 和 app.js 推过去
  → 浏览器解析 HTML 时发现要 main.css → 已经在本地了 → 0 RTT
```

机制:**服务器先发 PUSH_PROMISE 帧**(在响应原请求的流上),声明"我要在 stream X 上推一个 main.css 给你",然后在 stream X 上正常发 HEADERS + DATA。

### 6.2 为什么死了

```
1. 浏览器缓存判断难
   Server 不知道客户端有没有缓存 → 重复推浪费带宽
   
2. 收益小
   测试显示 push 相比 preload 提速很小
   
3. 实现复杂
   HTTP/2 push 需要服务器知道页面依赖 → 紧耦合
   
4. <link rel="preload"> 替代
   HTML 里写 preload,浏览器自己优先拉
   → 浏览器知道自己有没有缓存
   → 不浪费

5. Chrome 2022 年宣布弃用
   HTTP/2 和 HTTP/3 都移除 push 支持
```

**结论**:**Server Push 是失败的优化**。现在的标准答案是 **`<link rel="preload">`** 或 **HTTP `103 Early Hints`**(在主响应前发一个 103 告诉浏览器"先去拉这些资源")。

> 经验法则:**别开 Server Push**,Nginx `http2_push` 配置已经被新版本移除。

---

## 七、流量控制

### 7.1 两层窗口

HTTP/2 在 TCP 流量控制之上又加了一层:

```
连接级窗口(connection window)
  整个 HTTP/2 连接的"接收方还能收多少字节"
  默认 65535 字节(64KB)

流级窗口(stream window)  
  每条流单独的窗口
  默认 65535 字节
```

接收方处理完数据 → 发 `WINDOW_UPDATE` 帧 → 增加窗口。

### 7.2 为什么需要流级窗口

```
你下载 1GB 大文件(stream 1) + 同时聊天(stream 3)
  
没有流级窗口:
  服务器把 1GB 全发给 TCP buffer
  → 聊天的小消息也卡在 buffer 后面
  
有流级窗口:
  stream 1 窗口 = 64KB → 服务器最多发 64KB
  → 客户端慢慢消费 → 客户端慢慢加窗口
  → stream 3 的聊天不被堵
```

**这是"在应用层做 backpressure"**——比 TCP 层精细。

### 7.3 调优陷阱

**默认 64KB 窗口太小**——1Gbps 网络 + 50ms RTT,带宽时延积 = 6.25 MB,**64KB 窗口让你只能用到 1% 带宽**。

```nginx
http2_recv_buffer_size 256k;
http2_max_field_size 16k;
http2_max_header_size 32k;
```

或在客户端:

```
SETTINGS_INITIAL_WINDOW_SIZE = 16777215  (16MB-1)
```

---

## 八、SETTINGS 帧:连接参数协商

连接建立后,双方互发一个 SETTINGS 帧告诉对方"我能扛多少":

| 参数 | 默认 | 含义 |
| --- | --- | --- |
| HEADER_TABLE_SIZE | 4096 | HPACK 动态表大小 |
| ENABLE_PUSH | 1 | 是否接受 Server Push |
| MAX_CONCURRENT_STREAMS | 无限制 | 最多同时多少流 |
| INITIAL_WINDOW_SIZE | 65535 | 流级窗口 |
| MAX_FRAME_SIZE | 16384 | 单帧最大 payload |
| MAX_HEADER_LIST_SIZE | 无限制 | 头部总大小 |

**典型设置**:Chrome 把 MAX_CONCURRENT_STREAMS 设 1000,Nginx 默认 128。**N 个并发流** = N 个并行请求(在一个 TCP 连接里)。

---

## 九、连接建立:三种姿势

### 9.1 HTTPS + ALPN(99% 用法)

```
TLS ClientHello {
  ALPN: ["h2", "http/1.1"]      ← 我能说 HTTP/2 或 1.1
}
TLS ServerHello {
  ALPN: "h2"                    ← 我们说 HTTP/2
}
TLS 握手完成
↓
客户端发 Connection Preface:
  PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n     ← 24 字节魔数
  + SETTINGS 帧
↓
服务器回 SETTINGS 帧
↓
开始正常 HTTP/2
```

**ALPN**(Application-Layer Protocol Negotiation)是 TLS 扩展,在 TLS 握手时协商上层协议——**0 个额外 RTT**。

### 9.2 HTTP + Upgrade(几乎没人用)

```
GET / HTTP/1.1
Host: example.com
Connection: Upgrade, HTTP2-Settings
Upgrade: h2c
HTTP2-Settings: <base64 encoded settings>

→ 101 Switching Protocols
  Connection: Upgrade
  Upgrade: h2c
```

**`h2c`** = HTTP/2 cleartext(明文 HTTP/2)。**浏览器全部不支持 h2c**——只能 HTTPS 上跑。后端到后端的内网调用偶尔用。

### 9.3 Prior Knowledge

客户端**直接假设**对方支持 HTTP/2,直接发 Preface + 帧。**只用于内网受控环境**。

---

## 十、nghttp 实操:抓 HTTP/2

```bash
# 看 HTTP/2 帧详情
$ nghttp -nv https://www.google.com/
[  0.052] Connected
[  0.150] h2 negotiated
[  0.150] send SETTINGS frame <length=18, flags=0x00, stream_id=0>
          (niv=3)
          [SETTINGS_MAX_CONCURRENT_STREAMS(0x03):100]
          [SETTINGS_INITIAL_WINDOW_SIZE(0x04):65535]
          [SETTINGS_ENABLE_PUSH(0x02):0]
[  0.150] send HEADERS frame <length=42, flags=0x25, stream_id=13>
          ; END_STREAM | END_HEADERS | PRIORITY
          (padlen=0, dep_stream_id=11, weight=22, exclusive=0)
          ; Open new stream
          :method: GET
          :path: /
          :scheme: https
          :authority: www.google.com
          accept: */*
          accept-encoding: gzip, deflate
          user-agent: nghttp2/1.51.0
[  0.262] recv SETTINGS frame <length=18, flags=0x00, stream_id=0>
[  0.262] recv (stream_id=13) :status: 200
[  0.262] recv (stream_id=13) content-type: text/html; charset=ISO-8859-1
[  0.262] recv DATA frame <length=14792, flags=0x00, stream_id=13>
[  0.265] recv DATA frame <length=145, flags=0x01, stream_id=13>
          ; END_STREAM
```

**`-v` 看握手 + 帧**,`-nv` 不验证证书。

```bash
# h2load 做压测
$ h2load -n 1000 -c 10 -m 100 https://example.com/api/
finished in 1.23s, 813.01 req/s, 24.42MB/s
requests: 1000 total, 1000 started, 1000 done, 1000 succeeded
```

`-c 10` 10 个 TCP 连接,`-m 100` 每个连接最多 100 个并发流。**比 wrk(只支持 HTTP/1.1)更适合 HTTP/2 压测**。

```bash
# curl --http2
$ curl -v --http2 https://www.google.com/
* ALPN, server accepted to use h2
* Using HTTP2, server supports multi-use
* Connection state changed (HTTP/2 confirmed)
```

```bash
# Wireshark 看 HTTP/2(必须有 SSLKEYLOGFILE)
$ SSLKEYLOGFILE=/tmp/keys.log curl --http2 https://example.com/
$ wireshark → Edit → Preferences → Protocols → TLS → (Pre)-Master-Secret log filename: /tmp/keys.log
→ 现在 Wireshark 能解密 TLS,看到 HTTP/2 帧
```

---

## 十一、HTTP/2 没解决的:TCP 队头阻塞

### 11.1 现象

```
HTTP/2 一个连接跑 10 条流
  → 全部塞进同一个 TCP 字节流
  → TCP 包号 1 2 3 4 5 6 7 8 9 10
  
包 3 丢了
  → TCP 收到 4 5 6 7 8 9 10 也不能投递给应用
  → 因为要"按序"
  → 所有 10 条流都卡住,等包 3 重传
  
HTTP/1.1(6 个 TCP 连接):
  包 3 丢了 → 只影响那一个 TCP 连接 → 另外 5 个连接照常跑
```

**结论**:**弱网(丢包率 > 1%)下,HTTP/2 反而可能比 1.1 慢**——因为 1.1 的多连接"分散"了丢包影响。

### 11.2 为什么躲不开

TCP 是**字节流**协议,内核无法理解"这段字节属于 HTTP/2 stream 1,那段属于 stream 3"。**要解决就得自己做传输层** → **QUIC**(24 篇)。

---

## 十二、踩坑提醒

1. **以为 HTTP/2 自动比 1.1 快**——弱网更慢,移动场景必须 HTTP/3
2. **域名分片(domain sharding)还在做**——HTTP/2 时代是反优化,合并到一个域名才能多路复用
3. **MAX_CONCURRENT_STREAMS 设太低**——Nginx 默认 128,高并发后端要调到 1000+
4. **INITIAL_WINDOW_SIZE 不调**——默认 64KB 在高 BDP 链路上跑不满
5. **开 Server Push**——废弃了,用 preload / 103 Early Hints
6. **不开 ALPN**——退化到 HTTP/1.1,浪费
7. **HTTP/2 + 长连接但 LB 没优化**——所有流量打到一个后端,负载不均
8. **以为 telnet 能调 HTTP/2**——它是二进制,只能用 nghttp / curl --http2
9. **HPACK 动态表把敏感数据入表**——Authorization 必须 never-indexed
10. **Cookie 多个 cookie 拼一行**——HTTP/2 应该每个 cookie 单独一个 header field(否则 HPACK 压缩效率差)
11. **过度信任优先级**——浏览器实现各异,服务器很多忽略,**别依赖优先级保证关键资源先到**
12. **gRPC 必须 HTTP/2**——gRPC 用 trailer,1.1 没法干净支持

---

下一篇:`24-HTTP-3-与-QUIC.md`,讲 HTTP/3 怎么从根上消灭 TCP 队头阻塞——**QUIC 是什么**(UDP 之上的可靠 + 加密传输)、**为什么把传输层放在用户态**(快速迭代 + 0-RTT + 强制加密)、**连接 ID 替代四元组**(WiFi 切 4G 不断线)、**QUIC 帧 vs HTTP/3 帧的分层**、**curl --http3 / quiche-client 实操**——以及为什么 Cloudflare、Google、Facebook 全在押 HTTP/3。
