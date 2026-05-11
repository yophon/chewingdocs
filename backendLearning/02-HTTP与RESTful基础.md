# HTTP 与 RESTful 基础

写后端的第一课不是 Spring 也不是 Elysia,而是 **HTTP**。所有框架都只是在 HTTP 之上加了一层封装,搞不清楚底层语义,就会写出"能跑但味道很差"的接口。

---

## 一、HTTP 请求/响应模型

```
Client                                   Server
  │  ── HTTP Request ──────────────────────▶  │
  │     Method  URL  Headers  Body            │
  │                                           │
  │  ◀────────────────────── HTTP Response ── │
  │     Status  Headers  Body                 │
```

**请求由四部分组成**:

| 组成 | 例 | 说明 |
| --- | --- | --- |
| Method | `GET / POST / PUT / DELETE` | 动作语义 |
| URL | `/api/users/42?expand=role` | 资源定位 + 查询参数 |
| Headers | `Content-Type: application/json` | 元信息 |
| Body | `{ "name": "Tom" }` | 数据载体(GET 一般无) |

**响应由三部分组成**:状态码、Headers、Body。

---

## 二、常用方法的语义

| 方法 | 幂等 | 安全 | 典型用途 |
| --- | --- | --- | --- |
| GET | ✅ | ✅ | 查询 |
| POST | ❌ | ❌ | 创建、不可幂等的操作 |
| PUT | ✅ | ❌ | 完整替换资源 |
| PATCH | ❌(规范上) | ❌ | 部分更新 |
| DELETE | ✅ | ❌ | 删除 |

> **幂等**:重复 N 次效果与 1 次相同。
> **安全**:不修改服务端状态。

⚠️ 误区:很多人把"创建"统一用 POST 没问题,但**重试场景**(网络抖动)下,POST 会重复创建,要么靠**前端去重 token**,要么改用 **PUT + 客户端生成 ID**。

---

## 三、状态码:别只会 200 / 500

| 段位 | 含义 | 常见值 |
| --- | --- | --- |
| 1xx | 信息性 | 100 Continue |
| 2xx | 成功 | 200 OK / 201 Created / 204 No Content |
| 3xx | 重定向 | 301 永久 / 302 临时 / 304 Not Modified(缓存命中) |
| 4xx | 客户端错 | 400 / 401 / 403 / 404 / 409 / 422 / 429 |
| 5xx | 服务端错 | 500 / 502 / 503 / 504 |

新手最常搞混的几个:

- **401 vs 403**:401 是"你没登录",403 是"你登录了但没权限"
- **400 vs 422**:400 一般指请求格式错(JSON 解析失败),422 指语义错(字段值不合法)
- **404 vs 410**:404 资源不存在,410 资源以前存在但被删除
- **502 vs 504**:502 是上游响应坏了,504 是上游超时

> 经验法则:**别用 200 包错误**(像 `{ "code": -1, "msg": "失败" }` 还回 200)——监控、网关、CDN 全要靠状态码。

---

## 四、Header 里那些会出现在简历八股的字段

| Header | 用途 |
| --- | --- |
| `Content-Type` | Body 的格式,如 `application/json` |
| `Accept` | 客户端能接受的格式 |
| `Authorization` | `Bearer xxx`(JWT)或 `Basic` |
| `Cookie` / `Set-Cookie` | 会话 |
| `Cache-Control` | 缓存策略,如 `no-cache`、`max-age=60` |
| `ETag` / `If-None-Match` | 资源版本号,用于 304 |
| `X-Forwarded-For` | 经过代理后的真实 IP |
| `User-Agent` | 客户端标识 |

---

## 五、RESTful 风格

REST(Representational State Transfer)的核心:**用 URL 表达资源,用 HTTP 方法表达动作**。

```
GET    /users          → 列表
GET    /users/42       → 详情
POST   /users          → 创建
PUT    /users/42       → 全量更新
PATCH  /users/42       → 部分更新
DELETE /users/42       → 删除

子资源:
GET    /users/42/orders        → 用户 42 的订单列表
POST   /users/42/orders        → 给用户 42 创建订单
```

**好 vs 不好**对比:

```
❌ POST /getUser?id=42
❌ POST /deleteUser
❌ GET  /api/v1/user/list/all/json

✅ GET    /users/42
✅ DELETE /users/42
✅ GET    /users
```

> 经验法则:**URL 用名词复数,动词放 HTTP method 里**。

---

## 六、查询、分页、过滤、排序

约定俗成的写法:

```
GET /users?page=1&pageSize=20
GET /users?sort=createdAt,desc
GET /users?status=active&role=admin
GET /users?search=tom&fields=id,name,email
```

**两种主流分页**:

| 方案 | 写法 | 适用 |
| --- | --- | --- |
| 偏移分页 | `?page=3&size=20` | 后台管理、可跳页 |
| 游标分页 | `?cursor=xxx&size=20` | feed 流、海量数据,深翻不掉性能 |

⚠️ 海量数据用 `OFFSET 100000` 极慢(会扫前面所有行),改用游标(基于上一页最后一条 id/createdAt)。

---

## 七、错误响应应该长什么样

业内共识(参考 RFC 7807):

```json
{
  "type": "https://example.com/errors/validation",
  "title": "Validation failed",
  "status": 422,
  "code": "INVALID_EMAIL",
  "message": "email 字段格式不正确",
  "errors": [
    { "field": "email", "rule": "format", "message": "must be email" }
  ],
  "traceId": "8d2c1f0a"
}
```

要点:

- **状态码** 走 HTTP 标准,不要全 200
- **业务码 `code`**:给前端做分支判断(状态码太粗)
- **traceId**:线上排查必备,贯穿日志、链路追踪

---

## 八、HTTPS、HTTP/2、HTTP/3

| 版本 | 关键特性 |
| --- | --- |
| HTTP/1.1 | 文本协议、Keep-Alive、队头阻塞 |
| HTTP/2 | 二进制、多路复用、Header 压缩 |
| HTTP/3 | 基于 QUIC(UDP),抗丢包、连接迁移 |

后端日常:**HTTPS 必须开**(证书用 Let's Encrypt 免费签),HTTP/2 多由网关层(Nginx / Caddy / 云 LB)开启,业务代码无感。

---

## 九、跨域(CORS)

浏览器的"同源策略"会拦截跨域请求。后端要做的就两件事:

1. 响应正确的 `Access-Control-Allow-*` 头
2. 处理预检请求 `OPTIONS`

```http
Access-Control-Allow-Origin: https://app.example.com
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
Access-Control-Allow-Credentials: true
Access-Control-Max-Age: 86400
```

⚠️ `Allow-Origin: *` 和 `Allow-Credentials: true` **不能同时存在**。生产环境别图省事开 `*`。

---

## 十、幂等性、重试、超时

工业级接口要思考的"非功能性"问题:

- **幂等**:支付、扣库存这类操作,客户端必须带 `idempotencyKey`,服务端去重
- **超时**:一切外部调用必须设超时,默认无穷大就是定时炸弹
- **重试**:只对 **幂等的 / GET / 5xx + 网络错误** 重试,POST 重试要小心
- **熔断 / 降级**:下游挂时,快速失败而不是一起拖死

---

## 十一、推荐工具

| 用途 | 工具 |
| --- | --- |
| 调试接口 | curl / HTTPie / Postman / Bruno / Hoppscotch |
| 抓包 | Wireshark / Charles / mitmproxy |
| 压测 | wrk / k6 / hey / vegeta |
| 接口文档 | OpenAPI(Swagger UI / Redoc / Stoplight) |

```bash
# curl 速查
curl -X POST https://api.example.com/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer xxx" \
  -d '{"name":"Tom"}' -i
```

---

## 十二、给新手的 5 条建议

1. **先用 curl 调通再开浏览器**,排除前端干扰
2. **状态码不要乱用**,出错就回 4xx/5xx
3. **接口先想清楚再写**,别 PR 阶段才返工 URL 设计
4. **统一错误结构 + traceId**,这是后端工程素养的硬指标
5. **永远设超时**,永远

下一章进入 Spring Boot 入门。
