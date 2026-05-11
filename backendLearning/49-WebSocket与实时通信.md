# WebSocket 与实时通信

HTTP 是请求/响应模型——**客户端问、服务器答**。但下面这些场景 HTTP 根本撑不住:

- **聊天 / IM**:别人发消息,你立刻收到
- **实时通知 / push**:服务器主动告诉你"订单状态变了"
- **协同编辑**:多人改同一份文档,光标位置实时同步
- **股票行情 / 弹幕 / 体育比分**:数据持续推送
- **AI 流式输出**:LLM 一字一字往外吐(48 章 RAG 的 UI 就靠它)

这一章把"服务器主动推数据给客户端"的几种姿势讲清楚。

---

## 一、为什么 HTTP 不够用

```
HTTP:Client ──问──▶ Server  ◀──答── 一来一回,连接关闭

要做"服务器推",HTTP 只能轮询:
  Client 每 1s 问一次:有新消息吗?
  Server: 没有... 没有... 没有... 有了!
```

**问题**:

- 没消息时也每秒一次请求 → 服务器压力 + 流量浪费
- 真有消息时延迟最差 1 秒
- 大量空请求毫无意义

---

## 二、四种解法 + 适用边界

| 方式 | 通信方向 | 何时选 |
| --- | --- | --- |
| **短轮询** | 单向(客户端拉) | 简单,频率低(几分钟一次) |
| **长轮询(Long Polling)** | 单向(客户端拉) | 不能用 WS 的兜底方案 |
| **SSE(Server-Sent Events)** | 服务器 → 客户端 | 服务器单向推(通知、流式输出) |
| **WebSocket** | 双向 | 全双工(IM、协同、游戏) |

```
短轮询:    Client ─请求─▶ Server  (每 5s 一次,即使没数据)

长轮询:    Client ─请求─▶ Server (hold 30s,有事立刻返回 / 超时返回)
           Client ─再请求─▶ ...

SSE:       Client ─请求─▶ Server ◀──持续 push 一个个事件
                                   text/event-stream

WebSocket: Client ◀──双向全双工──▶ Server  (一条 TCP 连接,持续)
```

> 经验法则:**单向推(通知、AI 流式)选 SSE,双向交互(IM、协同)选 WebSocket**。两者都做不了再退回长轮询(老浏览器 / 严格代理环境)。

---

## 三、SSE:被低估的轻量方案

很多人一上来就想用 WebSocket,实际上**很多场景 SSE 完美够用**——而且简单得多。

```http
# 服务器响应
Content-Type: text/event-stream
Cache-Control: no-cache

data: {"msg":"first"}

data: {"msg":"second"}

event: orderUpdate
data: {"orderId":42, "status":"PAID"}

```

**SSE 的优势**:

1. **协议是 HTTP**——所有 LB / 代理 / WAF 天然支持
2. **自动重连**——浏览器原生 EventSource 自带
3. **断点续传**——`Last-Event-ID` 头让服务器知道上次推到哪
4. **可走 HTTP/2 多路复用**——比 WebSocket 还省连接

**SSE 的劣势**:**单向**(只能服务器推)、IE 不支持(2026 年问题不大了)。

```js
// 浏览器侧
const sse = new EventSource('/api/stream');
sse.onmessage = e => console.log(JSON.parse(e.data));
sse.addEventListener('orderUpdate', e => updateOrder(JSON.parse(e.data)));
```

```java
// Spring 侧:返回 Flux<ServerSentEvent>
@GetMapping(value="/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
public Flux<ServerSentEvent<String>> stream() {
    return Flux.interval(Duration.ofSeconds(1))
               .map(i -> ServerSentEvent.<String>builder()
                       .id(String.valueOf(i))
                       .event("tick")
                       .data("ping " + i)
                       .build());
}
```

> 经验法则:**LLM 流式输出、订单状态推送、轻量通知 → SSE 是最佳选择**。这两年 LLM 流行,SSE 重新成为热门——OpenAI / Claude 的流式 API 就是 SSE。

---

## 四、WebSocket:全双工的标准

握手过程:

```
Client → Server: HTTP Upgrade 请求
   GET /ws HTTP/1.1
   Connection: Upgrade
   Upgrade: websocket
   Sec-WebSocket-Key: ...

Server → Client: 101 Switching Protocols
   一旦升级成功,这条 TCP 连接就成了 WebSocket(不再是 HTTP)
   双向、全双工、二进制 / 文本帧
```

**协议成本**:握手是一次 HTTP,后续每帧只有 2~14 字节头,**比 HTTP 长连接还省**。

```js
const ws = new WebSocket('wss://api.example.com/ws');
ws.onopen = () => ws.send(JSON.stringify({type:'subscribe', channel:'orders'}));
ws.onmessage = e => console.log('收到:', JSON.parse(e.data));
ws.onclose = () => reconnectLater();
```

---

## 五、WebSocket 在 Spring 里的两种姿势

### 1. 原生 WebSocket(底层、灵活)

```java
@Configuration
@EnableWebSocket
class WsConfig implements WebSocketConfigurer {
    public void registerWebSocketHandlers(WebSocketHandlerRegistry r) {
        r.addHandler(new MyHandler(), "/ws").setAllowedOrigins("*");
    }
}

class MyHandler extends TextWebSocketHandler {
    public void afterConnectionEstablished(WebSocketSession s) {
        sessions.add(s);
    }
    public void handleTextMessage(WebSocketSession s, TextMessage m) {
        // 收到消息处理
    }
    public void afterConnectionClosed(WebSocketSession s, CloseStatus st) {
        sessions.remove(s);
    }
}
```

### 2. STOMP over WebSocket(协议层封装)

```java
@Configuration
@EnableWebSocketMessageBroker
class StompConfig implements WebSocketMessageBrokerConfigurer {
    public void registerStompEndpoints(StompEndpointRegistry r) {
        r.addEndpoint("/ws").withSockJS();
    }
    public void configureMessageBroker(MessageBrokerRegistry r) {
        r.setApplicationDestinationPrefixes("/app");
        r.enableSimpleBroker("/topic", "/queue");
    }
}

@Controller
class ChatController {
    @MessageMapping("/chat.send")
    @SendTo("/topic/messages")
    public ChatMsg send(ChatMsg msg) { return msg; }
}
```

STOMP 提供"订阅 / 发送主题"模型,前端用 stomp.js / @stomp/stompjs 连接——适合**多频道广播**场景。

> 经验法则:**点对点交互用原生 WS,多频道订阅 / 群组消息用 STOMP**。STOMP 是 IM、协同编辑、消息广播的捷径。

---

## 六、Elysia (Bun) 里写 WebSocket

```ts
import { Elysia } from 'elysia'

new Elysia()
  .ws('/chat', {
    open(ws) {
      ws.subscribe('room-1')
    },
    message(ws, message) {
      ws.publish('room-1', message)        // 广播到 room-1
    },
    close(ws) {
      ws.unsubscribe('room-1')
    },
  })
  .listen(3000)
```

Bun 的 WebSocket 性能是同类里第一梯队——uWebSockets 底座,百万连接级。

---

## 七、心跳:别让连接"睡死"

WebSocket 是长连接,但**中间有一堆设备会主动掐**:

- NAT 设备(路由器)默认 30~60s 无流量就回收 conntrack
- LB / 代理(Nginx 默认 60s 空闲断开)
- 移动网络切换基站时连接消失

解决:**应用层心跳**

```
每 25s:
  Client → Server: ping
  Server → Client: pong
```

```js
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({type:'ping'}));
}, 25_000);
```

服务端 N 秒收不到客户端心跳 → 主动关连接(防泄漏)。

> 经验法则:**心跳间隔 < 中间设备最短超时(通常 25s 安全)**。Nginx 要把 `proxy_read_timeout` 设大(>心跳间隔)。

---

## 八、断线重连:必做不可省

网络抖一下、服务器重启、手机切 4G/Wi-Fi——连接断了用户在等,你必须重连。

```js
class ReconnectingWS {
  constructor(url) { this.url = url; this.connect(); }
  connect() {
    this.ws = new WebSocket(this.url);
    this.ws.onclose = () => {
      const delay = Math.min(1000 * 2 ** this.attempts++, 30_000);
      setTimeout(() => this.connect(), delay);   // 指数退避
    };
    this.ws.onopen = () => this.attempts = 0;
  }
}
```

**关键点**:

- **指数退避**——别 1s 一次猛重连,服务器没拉起来你打它没意义
- **最大延迟封顶**——20~30s 即可
- **重连后状态恢复**——重新订阅频道、补拉漏掉的消息

补漏机制:**Last-Event-ID** 模式

```
客户端记录最后收到的消息 ID
重连时:GET /ws?since=12345
服务器从 12345 之后开始推
```

---

## 九、集群广播:WebSocket 上规模的核心难题

```
单机 WebSocket: pod1 → 100 个用户 connected
                pod2 → 100 个用户 connected

发消息给"用户 A"——他可能连在 pod1 也可能在 pod2,你怎么知道?
广播给全员——pod1 上的人 pod2 怎么通知?
```

四种主流方案:

### 1. Redis Pub/Sub

```
pod1 收到一条消息 → publish 到 Redis "broadcast" 频道
所有 pod 订阅 → 各自推给自己的连接
```

```java
@Bean
RedisMessageListenerContainer container(RedisConnectionFactory cf) {
    var c = new RedisMessageListenerContainer();
    c.setConnectionFactory(cf);
    c.addMessageListener((message, ch) -> {
        sessions.values().forEach(s -> s.sendMessage(...));
    }, new PatternTopic("ws.broadcast"));
    return c;
}
```

**优点**:简单。**缺点**:Pub/Sub 不持久,发出去没人收就丢。

### 2. Redis Streams / Kafka

替换 Pub/Sub,有持久化、消费组:

```
pod 启动 → 加入消费组 "ws-cluster"
消息走 stream,任一 pod 收到 → 推到本地连接
```

更可靠,适合不能丢消息的 IM 场景。

### 3. STOMP Broker(RabbitMQ / ActiveMQ)

Spring STOMP + 外部 broker:

```yaml
spring:
  websocket:
    stomp:
      relay:
        enabled: true
        host: rabbitmq
```

业务服务无状态,broker 负责路由——多 pod 共享主题,**STOMP 集群的标准答案**。

### 4. 网关层做 WS(Spring Cloud Gateway / Envoy)

WebSocket 在网关层终结,业务服务用消息队列通信——彻底解耦。

> 经验法则:**< 1 万连接,Redis Pub/Sub 简单粗暴够用;1 万 ~ 10 万,STOMP + RabbitMQ;10 万以上,专门的 WS 网关 + Kafka**。

---

## 十、专门做 WebSocket 的中间件

业务规模大了,WebSocket 经常会拆出去:

| 产品 | 形态 | 强项 |
| --- | --- | --- |
| **Centrifugo** | 独立 Go 网关 | 简单、性能好、支持 SSE/WS/HTTP |
| **Soketi** | 独立 Node | Pusher 兼容、自部署 |
| **Pusher / Ably / PubNub** | SaaS | 全托管、零运维 |
| **MQTT(EMQX / Mosquitto)** | IoT 协议 | 海量设备、低带宽 |
| **Phoenix Channels(Elixir)** | 框架内置 | 百万连接级,Discord 用的就是这个 |
| **NATS** | 通用消息 | 轻量、低延迟、可做 WS 后端 |

---

## 十一、AI 流式输出:SSE 的高光时刻

LLM 调用是几秒到几十秒——同步等用户早跑了。**流式输出**是必备:

```java
@PostMapping(value="/chat", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
public Flux<String> chat(@RequestBody ChatReq req) {
    return chatClient.prompt()
        .user(req.message())
        .stream()
        .content();   // 一边生成一边发
}
```

```js
const sse = new EventSource(`/chat?msg=${q}`);
sse.onmessage = e => append(e.data);   // 一字一字追加
```

OpenAI / Claude / Gemini 的 SDK 都已经把 SSE 流式封装好了,这是**今天后端要会的"AI 标准动作"**。

---

## 十二、安全要点

1. **CORS / Origin 校验**:WebSocket 默认不走 CORS,要在握手时手动校验 Origin 头
2. **认证**:握手 URL 带 token,或者首条消息带 token
   - URL token:`wss://api.com/ws?token=xxx`(注意 token 会进 access log)
   - Cookie:跨域时麻烦
   - 首消息 auth:握手成功后立刻发认证消息,认证前不能订阅
3. **心跳鉴权**:周期性检查 token 是否过期,过期主动断
4. **消息大小限制**:WebSocket 默认无限制,要在容器配 `maxTextMessageBufferSize`
5. **限流**:每个连接发消息频率限制,防滥用
6. **监控异常断连**:大量断连可能是 DDoS

---

## 十三、可观测性

WebSocket 的指标和 HTTP 完全不同:

| 指标 | 关注 |
| --- | --- |
| **当前在线连接数** | 容量规划核心 |
| **每 pod 连接数** | 不均衡说明 LB 策略问题 |
| **消息收发 QPS** | 容量 |
| **首次连接耗时(握手)** | 用户体感 |
| **平均连接时长** | 越长越说明稳 |
| **心跳失败率** | 网络质量风向标 |
| **断线重连率** | 异常监控 |
| **消息堆积** | 集群广播是否打满 |

---

## 十四、常见踩坑

1. **不做心跳 / 间隔太长**:NAT 静默断了客户端不知,以为还连着
2. **重连不退避**:服务器宕机时被自己人 DDoS
3. **集群广播没做**:多 pod 时只有同一 pod 的用户收到
4. **没有消息补拉**:重连后中间漏掉的消息丢了
5. **认证只在握手**:token 过期还能继续用
6. **同步阻塞 onMessage**:一个慢消息卡住整个连接的处理
7. **后端连接泄漏**:客户端断了但后端还以为连着,内存涨上天
8. **广播消息无去重**:同一条消息同一用户收到 N 次
9. **大消息全帧发**:几 MB 的消息卡住客户端,要分片
10. **直连业务服务**:不上网关 → 一台业务发版所有连接断
11. **K8s 不配置 sticky session**:LB 把同一连接打到不同 pod 一直握手失败
12. **Nginx 不开 WebSocket 支持**:`proxy_set_header Upgrade $http_upgrade` 没加

---

## 十五、本章 Checklist

| 项 | 说明 |
| --- | --- |
| ✅ 单向推用 SSE,双向用 WS | 别一上来就 WebSocket |
| ✅ 心跳(25s 内)+ 服务端超时 | 防 NAT/代理掐断 |
| ✅ 客户端断线指数退避重连 | 防 DDoS 自己 |
| ✅ 重连有消息补拉 | Last-Event-ID 模式 |
| ✅ 集群广播跑通 | Redis/STOMP/网关 |
| ✅ 握手 + 周期校验 token | 不只是握手时认证 |
| ✅ 监控连接数 + 断线率 | WebSocket 的核心指标 |
| ✅ Nginx/LB 配置正确 | Upgrade 头 + 长超时 |
| ✅ 消息大小限制 | 防大帧卡死 |
| ✅ AI 流式用 SSE | 今天的标配 |

---

## 小结

实时通信看起来是"前端事",其实**所有难点都在后端**——心跳、重连、广播、补拉、鉴权、限流、监控。

到此,40 ~ 49 章把后端"还差的"那一截全部补齐了:

```
40 CI/CD 与 GitOps         —— 代码到生产的自动化
41 配置中心与注册中心       —— 微服务的两根鞋带
42 分布式事务              —— 数据一致性的真实方案
43 限流熔断降级            —— 高可用三板斧
44 任务调度                —— 业务里到处都用
45 对象存储                —— 文件系统不够用
46 CDC 与数据同步          —— 双写陷阱的解药
47 流处理                  —— 实时计算的工具
48 向量数据库与 AI Infra   —— 2026 年的新基建
49 WebSocket 与实时通信    —— 服务器主动推
```

加上 1 ~ 39 的主线,这套教程已经覆盖了一个现代后端工程师"扎实站住中位线"该有的全部认知。

下一步往深里走,看你是想做**性能极致**(JVM、内核、eBPF)、**业务复杂度**(DDD、领域建模)、**数据规模**(数据湖、Hadoop 生态)、还是**AI 工程**(Agent、推理优化)——但所有这些深度,都得先把这一套"业务跑稳"的能力打牢。
