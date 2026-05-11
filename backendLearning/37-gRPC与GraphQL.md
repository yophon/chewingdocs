# gRPC 与 GraphQL

REST 是 90% 后端的默认协议——但它不是唯一答案。两个最常见的"非 REST"选择：

- **gRPC**：服务间内部通信，要极致性能、强类型、流式
- **GraphQL**：面向前端，要"按需取数、一次拿完"

这一章把三者放一起对比，并讲清楚什么时候该用哪个。

---

## 一、三个协议的定位

| 协议 | 序列化 | 传输 | 强类型 | 适用 |
| --- | --- | --- | --- | --- |
| **REST + JSON** | 文本 | HTTP/1.1 + 1.2 | 弱 | 公开 API、前后端通用 |
| **gRPC** | Protobuf 二进制 | HTTP/2 | 强（IDL） | 内部 RPC、流式、低延迟 |
| **GraphQL** | JSON | HTTP/1.1 + WS | 强（Schema） | 前端聚合、按需取数 |

> 经验法则：**对外 REST，对内 gRPC，前端聚合 GraphQL**。三者经常在同一个系统里共存。

---

## 二、gRPC：高性能 RPC

gRPC 的几个核心优势：

| 优势 | 含义 |
| --- | --- |
| **二进制序列化** | Protobuf 比 JSON 小 30~70%，解析更快 |
| **HTTP/2** | 多路复用，单连接并发 |
| **强类型 IDL** | `.proto` 一份，所有语言生成 stub |
| **流式** | 服务端流 / 客户端流 / 双向流 |
| **拦截器** | 鉴权、日志、Metrics 统一切面 |

### proto 文件

```protobuf
// user.proto
syntax = "proto3";
package user.v1;
option java_multiple_files = true;
option java_package = "com.example.user.v1";

service UserService {
  rpc GetUser   (GetUserRequest)    returns (User);
  rpc ListUsers (ListUsersRequest)  returns (stream User);    // 服务端流
  rpc UploadLog (stream LogEntry)   returns (UploadResp);     // 客户端流
  rpc Chat      (stream ChatMsg)    returns (stream ChatMsg); // 双向流
}

message GetUserRequest { int64 id = 1; }
message User {
  int64  id   = 1;
  string name = 2;
  string email = 3;
}
```

### Spring Boot 服务端

```java
@GrpcService
public class UserGrpc extends UserServiceGrpc.UserServiceImplBase {
    @Override
    public void getUser(GetUserRequest req, StreamObserver<User> resp) {
        User u = User.newBuilder()
            .setId(req.getId()).setName("Tom").setEmail("t@x.com").build();
        resp.onNext(u);
        resp.onCompleted();
    }
}
```

### Bun / Node 客户端

```ts
import { createPromiseClient } from "@connectrpc/connect";
import { createGrpcTransport } from "@connectrpc/connect-node";
import { UserService } from "./gen/user_pb";

const client = createPromiseClient(UserService,
  createGrpcTransport({ baseUrl: "http://user-svc:9090", httpVersion: "2" }));

const u = await client.getUser({ id: 42n });
console.log(u.name);
```

---

## 三、gRPC 四种模式

```
1. 一元调用    Request → Response          普通 RPC
2. 服务端流    Request → stream Response   下载、订阅
3. 客户端流    stream Request → Response   上传、批量
4. 双向流      stream ⇄ stream             聊天、实时同步
```

流式的杀手场景：

- **实时报价**：服务端流推送行情
- **大文件上传**：客户端流分片上传
- **协同编辑 / IM**：双向流

---

## 四、Protobuf 演进规则

向后兼容是分布式系统的命根子。Protobuf 几条铁律：

```
✅ 加新字段，给新 tag 号
✅ 删字段时改名 reserved 保留 tag
❌ 不要改已有字段的 tag 号
❌ 不要改字段类型
❌ 不要复用旧 tag
```

```protobuf
message User {
  int64  id   = 1;
  string name = 2;
  reserved 3;             // 之前的 phone 删掉，tag 不能再用
  reserved "phone";
  string email = 4;
  string nick  = 5;       // 新加字段
}
```

---

## 五、gRPC 的代价

- **浏览器不支持**（要走 grpc-web 或 connect 协议中转）
- **调试不直观**（不像 curl 直接打）—— 用 grpcurl / grpcui
- **网关支持要适配**（APISIX、Envoy 都行；Spring Cloud Gateway 略弱）
- **跨公网弱**：长连接 + HTTP/2 在一些代理后表现不稳

> 经验法则：**内网服务间用 gRPC，对外接口用 REST 或 connect-protocol**（兼容 HTTP/1）。

---

## 六、GraphQL：让前端按需取数

REST 的痛点：

- **过度获取（over-fetching）**：列表页只要 id+name，REST 把全字段都返
- **过少获取（under-fetching）**：详情页要并发调 5 个接口，前端写得很苦

GraphQL 的解法：**前端写一个查询，描述自己要什么**。

```graphql
# Schema 定义
type User {
  id: ID!
  name: String!
  email: String!
  orders(top: Int = 10): [Order!]!
}

type Order {
  id: ID!
  total: Float!
  items: [OrderItem!]!
}

type Query {
  user(id: ID!): User
}
```

```graphql
# 前端发的查询
query {
  user(id: "42") {
    name
    orders(top: 3) {
      total
      items { name }
    }
  }
}
```

```json
// 服务端响应（结构与查询完全对应）
{ "data": { "user": { "name": "Tom",
  "orders": [
    { "total": 199.0, "items": [{ "name": "T 恤" }] }
  ] }}}
```

---

## 七、Resolver 与 N+1 问题

Resolver 是字段对应的解析函数：

```ts
const resolvers = {
  Query: {
    user: (_, { id }) => userDao.findById(id),
  },
  User: {
    orders: (user, { top }) => orderDao.byUserId(user.id, top),
  },
};
```

如果一次查询返回 100 个 user，每个 user 又要 orders ——会触发 100 次 `orderDao.byUserId`。这就是 **N+1 问题**。

**DataLoader** 是标准解：把同一 tick 内的查询合批：

```ts
const orderLoader = new DataLoader(async (userIds) => {
  const rows = await orderDao.byUserIds(userIds);   // IN 查询，一次搞定
  return userIds.map(id => rows.filter(r => r.userId === id));
});

// resolver
orders: (user) => orderLoader.load(user.id),
```

> ⚠️ **没用 DataLoader 的 GraphQL 服务，上线必出 DB 性能事故**。

---

## 八、GraphQL 的代价

| 代价 | 说明 |
| --- | --- |
| HTTP 缓存难 | 都是 POST，URL 固定，CDN 不能按 URL 缓存 |
| 复杂度 | Schema、Resolver、DataLoader、订阅、Federation |
| 安全 | 恶意深度查询可炸服务（限制 depth / cost） |
| 鉴权粒度 | 字段级权限要专门做 |
| 监控 | 一个 endpoint 万千查询，传统 URI 维度指标失效 |

### Persisted Query

生产推荐：客户端构建期把 query 注册到服务端，运行时只发 hash —— 既缩小请求体，又把允许查询白名单化（防恶意查询）。

### Federation

多团队多服务时，每个领域服务暴露一份子 schema，由 gateway 合并：

```
account-svc:  type User @key(fields: "id")
order-svc:    type User @key(fields: "id") { orders: [Order!]! }
gateway:      自动拼合
```

---

## 九、REST / gRPC / GraphQL 怎么选

```
┌──────────────────────────────────────────────┐
│ 对外公开 API、SEO 关心、需要 CDN 缓存        │ → REST
│ 内部服务间、要强类型、高性能、流式            │ → gRPC
│ 前端复杂、聚合多服务、按需取数                │ → GraphQL
│ 需要订阅/实时（行情、IM、协同）              │ → gRPC 双向流 / GraphQL Subscription / WebSocket
└──────────────────────────────────────────────┘
```

> 经验法则：**先 REST 跑通业务，量上来再针对热点接口换 gRPC，前端体验需求再加 GraphQL BFF**。一开始就上全套 = 复杂度过早膨胀。

---

## 十、新手踩坑

1. **gRPC proto 不版本化**：直接放业务仓库，别人接入要找人要——独立 schema 仓库 + 自动发 Maven/npm 包
2. **proto 改 tag 号**：客户端老版本立刻挂
3. **GraphQL 不上 DataLoader**：N+1 把 DB 打崩
4. **GraphQL 没 depth/cost limit**：恶意 query 嵌套 100 层
5. **以为 GraphQL 替代 REST**：内部 RPC 仍然用 gRPC / REST 更合适
6. **gRPC 走外网长连接**：经过 ALB/SLB 的连接超时配置不一致，半夜批量报错

---

## 十一、本章 Checklist

| 项 | 说明 |
| --- | --- |
| ✅ 内部用 gRPC | 性能 + 强类型 |
| ✅ proto 独立仓库 | 多语言生成 SDK |
| ✅ proto 演进规则 | 不改 tag、reserved 删除字段 |
| ✅ 流式选最合适的 | 别强行用一元 |
| ✅ GraphQL + DataLoader | 解决 N+1 |
| ✅ Persisted Query | 防恶意 + 缩小请求体 |
| ✅ 字段级鉴权 | GraphQL 的硬需求 |
| ✅ REST 仍是默认 | 对外、调试友好 |

下一章我们补足数据库阵营——MongoDB 与时序库。
