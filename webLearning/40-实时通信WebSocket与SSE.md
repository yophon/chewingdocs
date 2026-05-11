# 实时通信:WebSocket 与 SSE

HTTP 是"客户端问,服务端答"的模型。但很多场景需要**服务端主动推**:

```
聊天                      新消息到了
通知 / Toast              系统事件
实时仪表盘 / 行情          数据流
协同编辑                  别人改了
LLM 流式输出              token 一个个吐
游戏 / 直播弹幕            高频事件
```

实时通信三大方案:

```
轮询(Polling)        客户端定时问,简单但浪费
SSE(Server-Sent Events)  HTTP 长连接,服务端单向推送
WebSocket            全双工持久连接,双向通信
WebRTC               P2P,音视频 / 数据流(选讲)
```

这一篇讲 SSE 和 WebSocket 的实战与选型,顺便讲轮询的合适用法。

---

## 一、轮询(Polling)— 最简方案

### 1. 短轮询

```ts
setInterval(async () => {
  const messages = await fetch('/messages').then(r => r.json());
  setMessages(messages);
}, 5000);
```

每 5 秒问一次。**简单但浪费**:99% 请求是没新内容的。

### 2. 长轮询(Long Polling)

```ts
async function poll() {
  while (true) {
    // 服务端 hold 住请求,有新数据才返回(或 30 秒超时)
    const r = await fetch('/messages?since=lastId');
    const messages = await r.json();
    handle(messages);
    // 立刻发下一次
  }
}
```

服务端实现要支持 hold,**复杂度比真 SSE 还高**,但浏览器兼容性好(2010 时代的方案)。

**2025 几乎不用长轮询**了,现代浏览器都支持 SSE / WebSocket。短轮询用在"几分钟一次的状态查"还能用。

---

## 二、SSE(Server-Sent Events)

### 1. 心智

```
客户端发一个 HTTP GET 请求,服务端 hold 住连接,持续往里写消息。
连接断了浏览器自动重连。

特点:
  - 单向(服务端 → 客户端)
  - 基于 HTTP,所有代理 / CDN / 防火墙都支持
  - 自动重连
  - 消息有 id,断了重连能从断点续
  - 标准浏览器 API(EventSource)
```

**适合**:服务端推送(通知 / 行情 / LLM 流式)。**不适合**:客户端要发大量消息回来(那时 WebSocket)。

### 2. 服务端实现(Hono)

```ts
import { streamSSE } from 'hono/streaming';

app.get('/stream', (c) => {
  return streamSSE(c, async (stream) => {
    let id = 0;
    while (true) {
      await stream.writeSSE({
        id: String(++id),
        event: 'message',
        data: JSON.stringify({ time: Date.now() }),
      });
      await stream.sleep(1000);
    }
  });
});
```

服务端实现(Express):

```ts
app.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (data: any) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const interval = setInterval(() => send({ time: Date.now() }), 1000);

  req.on('close', () => {
    clearInterval(interval);
    res.end();
  });
});
```

SSE 协议格式:

```
data: hello\n\n              单条消息

event: message\n              带类型
data: {"a": 1}\n\n

id: 42\n                      带 id(便于断线重连)
data: ...\n\n

retry: 5000\n\n               告诉客户端断线后多久重连(默认 3000)
```

`\n\n` 是消息分隔符。**别忘了**。

### 3. 客户端

```ts
const es = new EventSource('/stream');

es.onmessage = (e) => {
  const data = JSON.parse(e.data);
  console.log(data);
};

es.addEventListener('notification', (e) => {
  // 自定义 event 类型
});

es.onerror = (e) => {
  console.error('lost', e);
  // 浏览器会自动重连
};

// 关闭
es.close();
```

`EventSource` 是浏览器内置 API。

### 4. 断线重连 + 续传

```ts
// 服务端
res.write(`id: ${msg.id}\n`);
res.write(`data: ${JSON.stringify(msg)}\n\n`);

// 客户端断线重连时,EventSource 会自动带上 Last-Event-ID 头
// 服务端可以从这个 id 之后开始推
app.get('/stream', (req, res) => {
  const lastId = req.headers['last-event-id'];
  // 从 lastId 之后取消息推送
});
```

### 5. SSE 的 trap

#### Trap 1:HTTP/1.1 浏览器 6 连接限制

每个域名同时只能有 6 个 HTTP/1.1 连接。**SSE 占一个,其他请求会被卡**。

修复:**用 HTTP/2**(同一连接多路复用,不限)。生产 CDN / Nginx 配 HTTP/2。

#### Trap 2:Nginx / Cloudflare buffering

代理可能缓冲响应,SSE 卡住不传。修复:

```nginx
# Nginx
proxy_buffering off;
proxy_cache off;
proxy_http_version 1.1;
proxy_set_header Connection "";
```

Cloudflare:`Cache-Control: no-cache` + `Content-Type: text/event-stream`,Cloudflare 自动不缓冲。

#### Trap 3:不能跨域(默认)

CORS 要服务端配:

```ts
res.setHeader('Access-Control-Allow-Origin', 'https://your-app.com');
```

`EventSource` 默认不带 cookie。要带:

```ts
new EventSource('/stream', { withCredentials: true });
```

#### Trap 4:不能加自定义 header(原生 EventSource 限制)

要加 `Authorization` 头怎么办?

- 用 token 放 query:`/stream?token=xxx`(老办法)
- 用 [`@microsoft/fetch-event-source`](https://github.com/Azure/fetch-event-source) 库,基于 fetch 实现 SSE,**支持自定义 header**

```ts
import { fetchEventSource } from '@microsoft/fetch-event-source';

await fetchEventSource('/stream', {
  headers: { Authorization: `Bearer ${token}` },
  onmessage(ev) { ... },
});
```

LLM 流式响应推荐用这个库(OpenAI / Anthropic 都用 SSE)。

### 6. SSE 实战:LLM 流式输出

```ts
// 服务端代理 OpenAI
app.post('/chat', async (c) => {
  return streamSSE(c, async (stream) => {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: '...' },
      body: JSON.stringify({ model: 'gpt-4', messages, stream: true }),
    });

    const reader = r.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      // 解析 SSE 格式,转发 token
      await stream.writeSSE({ data: chunk });
    }
  });
});
```

```ts
// 客户端
const es = new EventSource('/chat?prompt=...');
es.onmessage = (e) => {
  if (e.data === '[DONE]') { es.close(); return; }
  const token = JSON.parse(e.data);
  appendToUI(token);
};
```

ChatGPT、Claude、所有 AI Chat 应用都是这个套路。

---

## 三、WebSocket

### 1. 心智

```
基于 TCP,经过 HTTP Upgrade 握手后,变成全双工持久连接。

特点:
  - 双向(任何一边都能发)
  - 低开销(没有 HTTP 头反复传)
  - 实时(消息毫秒级)
  - 自定义协议(消息格式自己定)
```

**适合**:聊天、协同编辑、游戏、直播弹幕。**不适合**:简单单向推送(SSE 更简单)、HTTP 缓存场景。

### 2. 客户端

```ts
const ws = new WebSocket('wss://your-app.com/ws');

ws.onopen = () => {
  console.log('connected');
  ws.send(JSON.stringify({ type: 'join', room: 'lobby' }));
};

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  console.log(msg);
};

ws.onclose = () => {
  console.log('closed');
};

ws.onerror = (e) => {
  console.error(e);
};

// 关闭
ws.close();
```

`ws://` = 不加密,`wss://` = TLS 加密。**生产永远用 wss**。

### 3. 服务端

#### Node + ws

```ts
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', (ws) => {
  console.log('client connected');

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    // 广播给所有
    wss.clients.forEach((c) => {
      if (c.readyState === ws.OPEN) c.send(data);
    });
  });

  ws.on('close', () => console.log('disconnected'));
});
```

#### Hono + Cloudflare Workers

```ts
app.get('/ws', (c) => {
  const upgrade = c.req.header('Upgrade');
  if (upgrade !== 'websocket') return c.text('Expected WebSocket', 400);

  const { 0: client, 1: server } = new WebSocketPair();
  server.accept();

  server.addEventListener('message', (e) => {
    server.send(`echo: ${e.data}`);
  });

  return new Response(null, { status: 101, webSocket: client });
});
```

Cloudflare Durable Objects 能做有状态 WebSocket,**单房间所有客户端连同一个 DO**。

### 4. 心跳(必须)

WebSocket 看似持久,实际**很多代理 / 防火墙会杀掉空闲连接**(常见 60 秒)。要心跳保活:

```ts
// 客户端
let alive = true;
ws.onopen = () => {
  setInterval(() => {
    if (!alive) {
      ws.close();      // 服务端没回应,主动断
      return;
    }
    alive = false;
    ws.send(JSON.stringify({ type: 'ping' }));
  }, 30_000);
};

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === 'pong') { alive = true; return; }
  // ...
};

// 服务端
ws.on('message', (data) => {
  const msg = JSON.parse(data);
  if (msg.type === 'ping') return ws.send(JSON.stringify({ type: 'pong' }));
  // ...
});
```

或用浏览器 / 库自带的 ping/pong 帧(WebSocket 协议有但 JS API 不暴露,Node `ws` 库有 `ping()`)。

### 5. 自动重连

```ts
class ReconnectingWS {
  ws: WebSocket | null = null;
  private retries = 0;

  constructor(private url: string) { this.connect(); }

  private connect() {
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => { this.retries = 0; };
    this.ws.onclose = () => {
      const delay = Math.min(1000 * 2 ** this.retries, 30_000);
      this.retries++;
      setTimeout(() => this.connect(), delay);
    };
  }

  send(data: any) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(data));
  }
}
```

**指数退避**(1s → 2s → 4s → 8s,封顶 30s)避免雪崩。

或直接用现成库:[reconnecting-websocket](https://www.npmjs.com/package/reconnecting-websocket)。

### 6. 消息协议

WebSocket 只是传输层,**消息格式要自己定**。常见:

```json
// 简单 type + payload
{ "type": "message", "data": { "text": "hello", "user": "Alice" } }

// 或带 id 用于 ack / 响应
{ "id": "uuid", "type": "join", "room": "lobby" }
{ "id": "uuid", "type": "ack", "ok": true }
```

或用 [Protocol Buffers](https://protobuf.dev) / [MessagePack](https://msgpack.org) 二进制(省流量,但调试难)。

### 7. 房间 / 频道

```ts
const rooms = new Map<string, Set<WebSocket>>();

ws.on('message', (data) => {
  const msg = JSON.parse(data);
  if (msg.type === 'join') {
    const room = rooms.get(msg.room) ?? new Set();
    room.add(ws);
    rooms.set(msg.room, room);
  }
  if (msg.type === 'broadcast') {
    rooms.get(msg.room)?.forEach(c => {
      if (c !== ws && c.readyState === WebSocket.OPEN) c.send(JSON.stringify(msg));
    });
  }
});

ws.on('close', () => {
  rooms.forEach(r => r.delete(ws));
});
```

### 8. 横向扩展

单服务器 WebSocket 简单,但**多服务器**怎么 broadcast?

```
客户端 A 连服务器 1,客户端 B 连服务器 2,A 发消息怎么到 B?

方案:Redis Pub/Sub(或 Kafka / NATS)
  服务器 1 收到消息 → publish 到 Redis
  所有服务器 subscribe Redis,收到后转发给本机的客户端
```

或用托管:**Cloudflare Durable Objects**(单房间所有客户端连同一个 DO,天然不需要 pub/sub)、**Pusher**、**Ably**、**Soketi**(自托管开源)。

---

## 四、Socket.IO(选讲)

Socket.IO 不是 WebSocket,是**WebSocket + 长轮询 fallback + 房间 + 重连等**的封装库。

```ts
// 服务端
import { Server } from 'socket.io';
const io = new Server(httpServer);

io.on('connection', (socket) => {
  socket.on('chat', (msg) => {
    io.to(socket.handshake.query.room).emit('chat', msg);
  });
});

// 客户端
import { io as ioc } from 'socket.io-client';
const socket = ioc('https://your-app.com', { query: { room: 'lobby' } });
socket.on('chat', (msg) => console.log(msg));
socket.emit('chat', 'hello');
```

**优点**:
- 自带重连、心跳、房间、ack
- 旧浏览器 fallback 长轮询
- 文档丰富

**缺点**:
- **不是标准 WebSocket**,跟非 Socket.IO 客户端不能通
- 体积大(~30KB)
- 现代项目可以直接用原生 WebSocket + 几十行胶水

**选型**:复杂应用(房间多 / 需要 ack)用 Socket.IO,简单聊天用原生。

---

## 五、SSE vs WebSocket vs Polling 对照

| 维度 | Polling | SSE | WebSocket |
| --- | --- | --- | --- |
| 双向 | ❌(每次 HTTP) | ❌(只推) | ✅ |
| 协议 | HTTP | HTTP(text/event-stream) | WS(基于 TCP)|
| 自动重连 | n/a | ✅ 内置 | 需自己实现 |
| 浏览器代理友好 | ✅ | ✅ | ⚠️ 个别企业代理拦 |
| HTTP 缓存 | ✅ | ❌ | n/a |
| 流量开销 | 高 | 中 | 低 |
| 服务端开发 | 简单 | 中 | 中 |
| 适合 | 几分钟一查 | LLM 流式 / 通知 | 聊天 / 协同 / 游戏 |

**默认选 SSE**(单向推),**双向才上 WebSocket**。

---

## 六、WebRTC(简介)

P2P,**客户端直连客户端**(中间靠信令服务器牵线)。

```
适合:
  视频通话(Zoom / Google Meet)
  音视频 / 屏幕共享
  低延迟数据通道(游戏)

不适合:
  普通业务(用 WebSocket 就够)
```

学习曲线陡(SDP / ICE / STUN / TURN),**有具体需求再学**。库:[simple-peer](https://github.com/feross/simple-peer)、[livekit](https://livekit.io)。

---

## 七、实战架构

### 1. 聊天室(WebSocket + Redis)

```
前端 ─ WebSocket ─ Server N
                        │
                    Redis Pub/Sub
                        │
前端 ─ WebSocket ─ Server M

消息持久化 → Postgres
```

### 2. 实时通知(SSE,简单)

```
后端事件触发 → 写 Redis Stream → SSE 推给在线客户端
                              ↓
                          离线 → 写数据库,下次上线再读
```

### 3. LLM 流式(SSE)

```
浏览器 ─ POST /chat ─ Hono Edge ─ OpenAI/Anthropic 流式
                          ↓
                       SSE 转发
                          ↓
                       浏览器逐字显示
```

### 4. 协同编辑(WebSocket + CRDT)

```
浏览器 ─ WebSocket ─ Yjs / Automerge 协同算法
                       ↓
                   广播差异给其他客户端
                       ↓
                  各端独立 merge,最终一致
```

工具:Yjs + y-websocket / Liveblocks / Partykit。

---

## 八、生产 checklist

### SSE

- [ ] HTTP/2 启用
- [ ] 代理 buffering 关掉
- [ ] CORS 配置
- [ ] 消息 id + Last-Event-ID 支持续传
- [ ] 客户端用 `@microsoft/fetch-event-source` 加 auth
- [ ] 心跳消息(空消息 30s 一次,防断)

### WebSocket

- [ ] wss(TLS)
- [ ] 心跳 ping/pong(30s)
- [ ] 客户端自动重连(指数退避)
- [ ] 消息有 id / ack
- [ ] 服务端限连接数(防 DDoS)
- [ ] 横向扩展用 Redis Pub/Sub 或 Durable Objects
- [ ] 消息持久化(数据库)
- [ ] 鉴权(token 在握手参数 / cookie / 第一条消息)

### 通用

- [ ] 监控连接数 / 消息量 / 延迟
- [ ] 限流(每个用户 / IP)
- [ ] 服务退出时 graceful 关闭(发 close 给客户端,等他们退)

---

## 九、心智模型

```
实时通信选型:

只是"几分钟一查" → 短轮询(setInterval + fetch)
"服务端推消息给我" → SSE(EventSource / fetch-event-source)
"双方都要发消息" → WebSocket
"音视频" → WebRTC
"协同编辑" → WebSocket + CRDT(Yjs)

实战核心:
  心跳防断
  断线重连
  消息要 id(去重 / ack / 续传)
  扩展用 Redis Pub/Sub 或托管(Pusher / Ably / Cloudflare DO)
```

---

## 十、参考资源

- MDN EventSource:https://developer.mozilla.org/en-US/docs/Web/API/EventSource
- MDN WebSocket:https://developer.mozilla.org/en-US/docs/Web/API/WebSocket
- Cloudflare Durable Objects:https://developers.cloudflare.com/durable-objects/
- Yjs(协同编辑):https://yjs.dev
- Liveblocks(托管协同):https://liveblocks.io
- Partykit(WebSocket on Cloudflare):https://www.partykit.io

下一篇 41 讲 PWA 与 Service Worker。
