# HTTP/1.1 深度

「HTTP 不就是 GET / POST,加几个 header 吗?」——这是 99% 后端工程师对 HTTP 的认知。但**翻开 RFC 7230~7235 这五本一共 300 页**,HTTP/1.1 是一个比你想象复杂得多的协议:**Keep-Alive 凭什么默认开 / pipelining 为什么没人用 / chunked 编码为什么必须 / Range 怎么实现断点续传 / Cookie 的 Secure 和 SameSite 是怎么救你于 CSRF 的**——这些才是真正的 HTTP/1.1。从 1999 年 RFC 2616 定型到今天,HTTP/1.1 是互联网上**仍然占 30%+ 流量**的协议(剩下大部分是 HTTP/2,见 23 篇),你必须把它吃透。

> 一句话先记住:**HTTP/1.1 = 文本协议 + 一连接一请求(默认)+ 队头阻塞**——所有后续演进(HTTP/2 二进制帧 + 多路复用、HTTP/3 QUIC + 解决 TCP 队头阻塞)都是在补 1.1 的坑。**1.1 的核心问题就一句话**:**TCP 连接很贵,但 HTTP/1.1 一个连接同一时间只能跑一个请求**——并发只能靠多开连接,浏览器对同一域名最多开 6 个,这就是为什么静态资源要分 CDN 子域名("域名分片")。

承接上一篇 21-PKI:你已经知道证书链怎么验、CA 怎么签、自建 CA 怎么搭。**HTTPS 跑起来后,跑在 TLS 之上的应用协议就是 HTTP**——这一篇起的五章(22-26)讲应用层最重要的协议簇:HTTP/1.1、HTTP/2、HTTP/3+QUIC、WebSocket、WebRTC。

---

## 一、HTTP/1.1 报文结构:文本协议的快感和负担

HTTP/0.9(1991)只有一行:`GET /index.html`。HTTP/1.0(1996)加了 header 和状态码。**HTTP/1.1(1999)= 1.0 + Host 头 + Keep-Alive + chunked + Range + 缓存控制大改**——是真正生产可用的版本。

### 1.1 请求报文骨架

```
GET /api/users?id=42 HTTP/1.1\r\n            ← 请求行
Host: api.example.com\r\n                     ← 头部
User-Agent: curl/7.79.1\r\n
Accept: */*\r\n
Authorization: Bearer eyJhbGc...\r\n
Content-Length: 0\r\n
\r\n                                          ← 空行(分隔头和体)
                                              ← Body(GET 通常没有)
```

四段:**请求行 / 头部行 / 空行 / Body**。**全是 ASCII 文本**,行尾用 `\r\n`(CRLF),空行 `\r\n\r\n` 作为头部结束标志。

### 1.2 响应报文骨架

```
HTTP/1.1 200 OK\r\n                          ← 状态行
Content-Type: application/json\r\n
Content-Length: 27\r\n
Server: nginx/1.21.0\r\n
Date: Sun, 10 May 2026 03:14:15 GMT\r\n
\r\n
{"id":42,"name":"alice"}                      ← Body
```

### 1.3 文本协议的代价

```
优点(为什么 1991 年这么设计):
  - 人眼可读,telnet 都能调
  - 实现简单,任何语言 100 行能写个 HTTP 服务器

缺点(为什么逼出 HTTP/2 二进制):
  - 解析慢(逐字节扫 \r\n)
  - 体积大(每个请求重复发 User-Agent / Cookie 一坨 KB)
  - 必须用 \r\n 分隔 → 注入风险(CRLF 注入,HTTP Response Splitting)
```

**一个典型 HTTPS 请求,头部就 1-2 KB**——而响应可能就几十字节 JSON,**头部比正文还大**。这就是 HTTP/2 HPACK 头压缩的动机(23 篇)。

### 1.4 用 telnet 手发一次 HTTP 请求

```bash
$ telnet example.com 80
Trying 93.184.216.34...
Connected to example.com.
GET / HTTP/1.1
Host: example.com
                     ← 这里多敲一次回车(空行)

HTTP/1.1 200 OK
Content-Type: text/html
Content-Length: 1256
...
```

**纯手工握协议**——这是为什么 HTTP/1.1 入门门槛低。`openssl s_client -connect example.com:443` 就是 HTTPS 版本。

---

## 二、Host 头:HTTP/1.1 的"分水岭"

HTTP/1.0 没有 Host 头,**一个 IP 只能跑一个网站**。HTTP/1.1 强制 Host:**一个 IP 可以靠 Host 区分无数虚拟主机**(virtual host)。

```
GET / HTTP/1.1
Host: api.example.com    ← Nginx 看这个判断转发到哪个 server 块
```

```
没有 Host 头:
  TCP 包到 80 端口 → Nginx 不知道你要 a.com 还是 b.com
  
有了 Host 头:
  TCP 包到 80 端口 → Nginx 看 Host: a.com → 转给 a 的后端
  TCP 包到 80 端口 → Nginx 看 Host: b.com → 转给 b 的后端
```

> 经验法则:**Host 头不发 = HTTP/1.1 协议错**,Nginx 直接 400。**这是 HTTPS 时代 SNI 出现之前的"主机区分"机制**——SNI(TLS 1.2 以后)是它的下沉版,在 TLS 握手阶段就告诉服务器"我要哪个站"(详见 19 篇 TLS)。

---

## 三、Keep-Alive:为什么 1.1 默认开

### 3.1 短连接的悲惨

HTTP/1.0 默认**一次请求 = 一个 TCP 连接**:

```
客户端                       服务器
  │                           │
  ├──── TCP 三次握手 ─────────►│  (1.5 RTT)
  │                           │
  ├──── GET /a.html ─────────►│
  │◄──── 200 OK ──────────────┤
  │                           │
  ├──── 四次挥手 ─────────────►│  (2 RTT)
  
                              ↓
                  20 张图 = 20 次握手 = 几秒延迟
```

**一个 HTML 引用 20 张图?**1.0 时代要建 21 个 TCP 连接,光 TCP 握手 + 慢启动就把延迟吃光。

### 3.2 Keep-Alive 怎么省

```
客户端                       服务器
  │                           │
  ├──── TCP 三次握手 ─────────►│  (1 次)
  │                           │
  ├──── GET /a.html ─────────►│  请求 1
  │◄──── 200 OK ──────────────┤
  ├──── GET /b.png ──────────►│  请求 2(复用同一连接)
  │◄──── 200 OK ──────────────┤
  ├──── GET /c.css ──────────►│  请求 3
  │◄──── 200 OK ──────────────┤
  │                           │
  (空闲一段时间)
  │                           │
  ├──── 四次挥手 ─────────────►│  (1 次)
```

**头部加一行就行**:

```
Connection: keep-alive
Keep-Alive: timeout=5, max=1000
```

**HTTP/1.1 默认 Keep-Alive**(不发 `Connection: close` 都是 keep-alive)。要关连接得显式说:

```
Connection: close
```

### 3.3 服务端怎么判定连接结束

这是 HTTP/1.1 一个微妙点:**TCP 连接复用时,服务器怎么知道一个响应"读完了"**?三种机制:

```
1. Content-Length: 100   → 读 100 字节就结束
2. Transfer-Encoding: chunked  → 看到 0\r\n\r\n 才结束(见五)
3. Connection: close   → 读到 EOF 才结束(没有长度时的兜底)
```

**只要 Content-Length 算错一个字节,连接就废了**——剩下的字节会被解析成下一个响应的开头,典型的"HTTP smuggling 攻击"(攻击者构造一个错的 Content-Length 让前后端解析不一致)。

### 3.4 Nginx 配 Keep-Alive

```nginx
http {
    keepalive_timeout 65s;        # 空闲连接保留 65 秒
    keepalive_requests 1000;      # 一个连接最多服务 1000 个请求
    
    upstream backend {
        server 127.0.0.1:8080;
        keepalive 32;             # 上游连接池里保留 32 个空闲连接
    }
}
```

> 经验法则:**`keepalive_timeout` 比客户端 `Keep-Alive: timeout` 大 5-10 秒**——避免服务器先关、客户端复用时撞到 RST。**短链接重连**问题里 80% 来自 timeout 不匹配。

---

## 四、Pipelining:为什么没人用

### 4.1 设计意图

HTTP/1.1 引入 pipelining:**不等响应回来就发下一个请求**——把多个请求"流水线"塞进同一个 TCP 连接。

```
普通(serial):
  → req1
       ←── resp1
  → req2
       ←── resp2
  
Pipelining:
  → req1
  → req2          (不等 resp1)
  → req3
       ←── resp1
       ←── resp2
       ←── resp3
```

**理论上**:省 RTT,大幅提速。

### 4.2 为什么死了

四个致命问题:

```
1. 严格 FIFO
   响应必须按请求顺序返回 → 第一个请求慢,后续全堵
   ↑↑↑ 队头阻塞,见六

2. 中间设备不支持
   很多代理 / 防火墙看到 pipelined 请求会乱序、丢请求

3. 实现复杂
   任何一个请求出错,整个连接要 reset

4. POST 不能 pipeline
   POST 不幂等,出错没法重发
```

**结果**:Chrome / Firefox 都默认关掉 pipelining(2016 年 Firefox 移除),**实际上没人用**。**HTTP/2 的多路复用才是 pipelining 的正确实现**——见 23 篇。

> 经验法则:**听到"HTTP pipelining 优化"立刻怀疑**——99% 是过时知识。

---

## 五、队头阻塞(HOL Blocking):HTTP/1.1 的原罪

### 5.1 在哪一层

「队头阻塞」(Head-of-Line Blocking)有两层含义,常被混淆:

```
HTTP/1.1 应用层 HOL:
  一个 TCP 连接同一时间只能跑一个请求
  → 慢请求堵住后面的请求
  → 浏览器只能开 6 个并发连接缓解

TCP 传输层 HOL:
  TCP 必须按序投递,丢一个包后面全卡
  → HTTP/2 多路复用没解决这个
  → 必须 QUIC(24 篇)
```

**HTTP/1.1 同时背了两个 HOL**——所以慢。

### 5.2 浏览器为什么开 6 个连接

```
RFC 2616 建议:同一个域名 ≤ 2 个并发连接
RFC 7230 删了这条限制
现代浏览器实际:同一域名 6 个(Chrome / Firefox)
                同一域名 17 个(Safari 老版,后改 6)
```

**6 个连接 ≠ 6 个并发请求**,因为每个连接还是 HOL。**6 是经验值**:

- 太少 → 慢
- 太多 → 服务器扛不住,自己 CPU 也吃不消

### 5.3 域名分片(Domain Sharding)

为了突破"6 个连接"上限,**HTTP/1.1 时代标准实践**:

```
img1.example.com  → 6 个连接
img2.example.com  → 6 个连接
img3.example.com  → 6 个连接
                    ────────
                    18 个并发
```

CDN 厂商曾大力推广这个。**HTTP/2 之后反过来了**——所有资源**合并到一个域名**才能享受多路复用,域名分片成了反优化。

---

## 六、分块传输 chunked encoding:动态长度的解药

### 6.1 为什么需要

HTTP/1.1 响应必须告诉客户端"我多长":要么 `Content-Length`,要么 `Transfer-Encoding: chunked`。

```
问题:
  服务器流式生成内容(SSE / 大文件 / 实时日志)
  → 开始发响应时不知道总长度
  → Content-Length 写不出来

解药:
  Transfer-Encoding: chunked
  → 一块一块发,每块前面写本块长度
  → 最后用一个长度为 0 的块表示结束
```

### 6.2 wire 格式

```
HTTP/1.1 200 OK\r\n
Transfer-Encoding: chunked\r\n
Content-Type: text/plain\r\n
\r\n
7\r\n                          ← 第 1 块长度(16 进制 = 7 字节)
Mozilla\r\n                    ← 第 1 块数据
9\r\n                          ← 第 2 块长度
Developer\r\n                  ← 第 2 块数据
7\r\n                          ← 第 3 块长度
Network\r\n                    ← 第 3 块数据
0\r\n                          ← 长度 0 = 结束标记
\r\n                           ← 最后空行
```

**关键**:**长度用 16 进制写**(不是 10 进制),`\r\n` 分隔。客户端拼起来 = `MozillaDeveloperNetwork`。

### 6.3 用 curl 验证

```bash
$ curl -v --raw http://httpbin.org/stream/3
< HTTP/1.1 200 OK
< Transfer-Encoding: chunked
< Content-Type: application/json
<
fd                                    ← 第 1 块,253 字节(0xfd)
{"url": "...", "args": {}, "headers": {...}, "id": 0}
fd
{"url": "...", "args": {}, "headers": {...}, "id": 1}
fd
{"url": "...", "args": {}, "headers": {...}, "id": 2}
0                                     ← 结束

```

`--raw` 让 curl 不自动 decode chunked,你能看到原始字节流。

### 6.4 用 nc 手工模拟一个 chunked 服务器

```bash
{ printf 'HTTP/1.1 200 OK\r\n'
  printf 'Transfer-Encoding: chunked\r\n'
  printf 'Content-Type: text/plain\r\n'
  printf '\r\n'
  printf '5\r\nhello\r\n'
  printf '5\r\nworld\r\n'
  printf '0\r\n\r\n'
} | nc -l 8080
```

另一个终端 `curl -v http://127.0.0.1:8080/`,你能看到 `helloworld` 拼起来。

> 经验法则:**chunked 不是优化,是必要工具**——SSE(Server-Sent Events)、大文件、实时流全靠它。**HTTP/2 没有 chunked**——它的帧本身就是变长的。

---

## 七、Trailer:被遗忘的功能

### 7.1 什么是

Trailer = "尾部头部"——**在 chunked body 结束后再发一组头**。常用于:**响应数据校验和**(发完才能算)、**响应结束状态**(gRPC 用 `grpc-status` trailer 表示成功 / 失败)。

```
HTTP/1.1 200 OK\r\n
Transfer-Encoding: chunked\r\n
Trailer: Expires\r\n              ← 声明会有 Expires trailer
\r\n
4\r\n
data\r\n
0\r\n                              ← chunked 结束
Expires: Wed, 21 Oct 2026 07:28:00 GMT\r\n   ← Trailer 在这
\r\n
```

### 7.2 为什么没流行

**浏览器和大部分代理不支持 trailer**——它们见到 `0\r\n` 就关连接了。**只有 gRPC over HTTP/2 真正大规模用 trailer**(因为 HTTP/2 帧能干净地表达 trailer)。

> HTTP/1.1 trailer 是"理论存在,生产不用"——知道有这东西就够了。

---

## 八、206 Partial Content:断点续传是怎么做的

### 8.1 Range 请求

客户端发:

```
GET /large.zip HTTP/1.1
Host: example.com
Range: bytes=1000-1999          ← 我只要 1000~1999 这 1000 个字节
```

服务器返(注意**状态码 206**,不是 200):

```
HTTP/1.1 206 Partial Content
Content-Range: bytes 1000-1999/5000000     ← 5MB 文件,我给了 1000~1999
Content-Length: 1000
Accept-Ranges: bytes
Content-Type: application/zip

<1000 字节的二进制>
```

### 8.2 多段 Range

```
GET /file HTTP/1.1
Range: bytes=0-499, 1000-1499
```

```
HTTP/1.1 206 Partial Content
Content-Type: multipart/byteranges; boundary=BOUND
Content-Length: ...

--BOUND
Content-Range: bytes 0-499/5000000

<500 字节>
--BOUND
Content-Range: bytes 1000-1499/5000000

<500 字节>
--BOUND--
```

类似 multipart/form-data 的格式。**实际上**:多段 Range 浏览器和 CDN 实现都半残,**别用**——要多段就发多个请求。

### 8.3 怎么实现断点续传

```
1. 客户端先发 HEAD,拿 Content-Length 和 Accept-Ranges
   $ curl -I https://example.com/file.iso
   Content-Length: 5000000000
   Accept-Ranges: bytes
   
2. 客户端开 N 个 Range 请求并行下载
   $ curl -r 0-999999999      -o part1 ...
   $ curl -r 1000000000-1999999999 -o part2 ...
   ...
   
3. 出错重连时,带上已下载到的位置
   $ curl -C - -o file.iso ...    (curl -C - 自动续传)
```

**aria2、IDM、迅雷**全是这套逻辑。**CDN 边缘节点也用 Range 拉源**——一个大文件分片缓存。

### 8.4 强弱校验:If-Range

并发下载时**怕文件中途被改**:

```
GET /file HTTP/1.1
Range: bytes=1000-1999
If-Range: "abc123"        ← 如果 ETag 还是 abc123,给我 206
                          ← 如果变了,给我整个文件 200
```

**ETag** = 文件指纹(通常是文件 hash 或 mtime+size)。

```
Strong ETag: "abc123"      ← 字节级一致
Weak ETag: W/"abc123"      ← 语义一致(如压缩后内容相同)
```

> 经验法则:**Range 是 CDN 和大文件下载的命脉**。**Nginx 默认开 Range,但反代某些 backend 时要 `proxy_force_ranges on`**。

---

## 九、Cookie 与 Set-Cookie:安全属性是命

### 9.1 基本机制

```
服务器返:
  Set-Cookie: sessionid=abc123; Path=/; Domain=example.com; Expires=...

客户端后续请求自动带:
  Cookie: sessionid=abc123
```

Cookie 是**浏览器**的自动行为——一旦 Set-Cookie,后续访问该域名**自动带上**(除非你用 fetch + `credentials: 'omit'`)。

### 9.2 五大安全属性

| 属性 | 作用 | 不设的后果 |
| --- | --- | --- |
| `Secure` | 只在 HTTPS 上发 | HTTP 上明文传 → 被嗅探 |
| `HttpOnly` | JS 不能读(`document.cookie` 看不到) | XSS 偷 token |
| `SameSite=Strict` | 跨站请求不带 | CSRF |
| `SameSite=Lax` | 跨站 GET 带,POST 不带(默认值) | 中等保护 |
| `SameSite=None; Secure` | 任何跨站都带(必须配 Secure) | 跨域接口需要 |
| `Path=/api` | 只在 `/api/*` 路径下带 | 限定作用域 |
| `Domain=example.com` | 子域共享 | `a.example.com` 也带 |
| `Max-Age=3600` 或 `Expires` | 过期 | 不设 = 会话 cookie,关浏览器消失 |

### 9.3 实战范例:登录 cookie

**好的写法**:

```
Set-Cookie: sid=abc123; Max-Age=86400; Path=/; HttpOnly; Secure; SameSite=Lax
```

**烂的写法**(实际上很多遗留系统就这样):

```
Set-Cookie: sid=abc123                   ← 没 HttpOnly → XSS 偷
                                         ← 没 Secure → HTTP 嗅探
                                         ← 没 SameSite → CSRF
```

### 9.4 SameSite 是怎么救你的

CSRF(跨站请求伪造)经典套路:

```
1. 你在 bank.com 登录,有 sid cookie
2. 你访问 evil.com,evil.com 页面里有:
   <form action="https://bank.com/transfer" method="POST">
     <input name="to" value="hacker"><input name="amount" value="999">
   </form>
   <script>document.forms[0].submit()</script>
3. 浏览器自动带 bank.com 的 sid cookie 发出 POST → 转账成功
```

**SameSite=Lax**(2020 年后浏览器默认):**跨站 POST 不带 cookie**——CSRF 这条最常见的攻击就废了。

> 经验法则:**所有登录态 cookie 必须 `HttpOnly; Secure; SameSite=Lax`**。**没这三个属性不要上线**。

### 9.5 用 curl 玩 cookie

```bash
# 登录,把 cookie 存到文件
$ curl -c cookies.txt -d 'user=alice&pwd=xxx' https://example.com/login

# 后续请求带上 cookie
$ curl -b cookies.txt https://example.com/api/profile
```

---

## 十、Connection / Upgrade:WebSocket 的入口

### 10.1 Connection 头

```
Connection: keep-alive       ← 复用连接
Connection: close            ← 用完关掉
Connection: Upgrade          ← 协议升级
```

### 10.2 Upgrade 头:从 HTTP 切到别的协议

WebSocket(25 篇)就靠这个建立:

```
客户端发:
  GET /chat HTTP/1.1
  Host: example.com
  Upgrade: websocket
  Connection: Upgrade
  Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
  Sec-WebSocket-Version: 13

服务器返(状态码 101!):
  HTTP/1.1 101 Switching Protocols
  Upgrade: websocket
  Connection: Upgrade
  Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=

之后:这个 TCP 连接不再走 HTTP,改走 WebSocket 帧
```

**101 Switching Protocols** = "本连接从此跑别的协议"。**HTTP 是个"协议谈判平台"**——这是 1.1 一个被低估的设计。

### 10.3 HTTP/2 没有 Upgrade

HTTP/2 是二进制协议,没有 `Connection: Upgrade` 这种文本头。**WebSocket over HTTP/2** 是 RFC 8441 单独定义的(用 HTTP/2 的 Extended CONNECT),**主流 WebSocket 还是跑在 HTTP/1.1 升级上**。

---

## 十一、缓存控制:这一篇只点名,详见 36 篇 CDN

```
Cache-Control: max-age=3600, public        ← 浏览器和 CDN 缓存 1 小时
Cache-Control: no-store                    ← 不缓存
Cache-Control: no-cache                    ← 缓存但用前必须 revalidate
ETag: "abc123"                             ← 资源指纹,配合 If-None-Match
Last-Modified: ...                         ← 上次修改时间,配合 If-Modified-Since
Vary: Accept-Encoding                      ← 缓存按这些头分桶(同一个 URL,gzip 和不 gzip 缓存两份)
```

`If-None-Match` 命中返 **304 Not Modified**——服务器不发 body,客户端用本地缓存。**这是 HTTP 性能的第一武器**——99% 的静态资源应该是 304。

---

## 十二、状态码地图

```
1xx 信息:
  100 Continue        → 我看了头,可以继续发 body(用于 Expect: 100-continue)
  101 Switching       → 协议升级(WebSocket)

2xx 成功:
  200 OK
  201 Created         → POST 成功创建资源
  204 No Content      → 成功但没东西返
  206 Partial Content → Range 请求

3xx 重定向:
  301 Moved Permanently  → 永久,浏览器会缓存
  302 Found              → 临时
  303 See Other          → POST 后跳到 GET(PRG 模式)
  304 Not Modified       → 缓存有效
  307 Temporary Redirect → 临时,不改方法(POST 后还是 POST)
  308 Permanent Redirect → 永久,不改方法

4xx 客户端错:
  400 Bad Request        → 协议错(Host 头都没)
  401 Unauthorized       → 没认证(其实"没登录")
  403 Forbidden          → 认证了但没权限
  404 Not Found          → 资源不存在
  405 Method Not Allowed → 方法错(GET-only 资源你 POST)
  409 Conflict           → 写冲突
  410 Gone               → 永久删除(给爬虫看的"别再来")
  413 Payload Too Large  → body 太大
  415 Unsupported Media Type
  418 I'm a teapot       → 彩蛋,RFC 2324
  429 Too Many Requests  → 限流

5xx 服务端错:
  500 Internal Server Error → 后端炸了
  502 Bad Gateway           → 反代连不上后端
  503 Service Unavailable   → 服务器告诉你"我累了"(maintenance / 限流)
  504 Gateway Timeout       → 反代等后端超时
```

> 经验法则:**5xx 是服务端责任,4xx 是客户端责任**。**反代日志里 502/504 飙升 = 后端服务挂了或者慢了**。

---

## 十三、踩坑提醒

1. **以为 Connection: keep-alive 要显式发**——HTTP/1.1 默认就开,反而 `Connection: close` 才是显式
2. **Content-Length 和实际 body 长度不一致**——HTTP smuggling 攻击的根源,Nginx 严格校验
3. **大文件下载不开 Range**——网络抖一次,从头下;开 Range 配 `-C -` 续传
4. **Cookie 不设 HttpOnly**——XSS 直接拿走 token
5. **Cookie 不设 SameSite**——CSRF 容易中招
6. **以为 pipelining 是优化**——已经废了,用 HTTP/2
7. **Host 头注入**——后端用 Host 头拼 URL 时,攻击者发假 Host 可以构造钓鱼链接
8. **CRLF 注入**——header value 里塞 `\r\n` 可以注入新头(`Set-Cookie`),后端必须过滤
9. **chunked 编码忘记最后 `0\r\n\r\n`**——客户端永远等
10. **以为 HTTP/1.1 已死**——nginx -> backend 内网调用、大量遗留 API 还在用,**占比 30%+**

---

下一篇:`23-HTTP-2.md`,讲 HTTP/2 怎么从根上重构 HTTP——**二进制分帧**(替代文本)、**流(stream)与多路复用**(一个 TCP 连接同时跑 N 个请求,真·解决应用层 HOL)、**HPACK 头压缩**(动态表 + 静态表 + Huffman,一个请求头从 1KB 压到 30 字节)、**流优先级**(让 CSS 比图片先下)、**Server Push**(为什么生不逢时被废弃)、**用 nghttp 抓包看二进制帧**——以及 HTTP/2 没解决的那个最后的问题:**TCP 队头阻塞**(留给 24 篇的 QUIC)。
