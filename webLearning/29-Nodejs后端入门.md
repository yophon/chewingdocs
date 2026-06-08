# Node.js 后端入门:Hono / Express + REST API 设计

前端写多了想做全栈,Node.js 是最自然的路径——**同一种语言写前后端**。

```
2009 年:Node.js 诞生(Ryan Dahl,V8 + libuv)
2010s :Express 一统江湖
2020s :Fastify / Koa / NestJS / Hono / Elysia 群雄并起
2024+ :Bun / Deno 让 Node 不再是唯一 JS runtime
```

这一篇讲两件事:

1. **怎么写一个 Node.js 后端**(用 Hono 和 Express 演示)
2. **怎么设计 REST API**(行业惯例 + 实战考量)

---

## 一、Node.js 是什么

```
Node.js = V8 (Chrome 的 JS 引擎) + libuv (异步 I/O 库) + 标准库
```

**特点**:
- **单线程 + 异步 I/O**:一个线程处理大量并发(不像 PHP 一请求一线程)
- **事件循环**:见第 25 篇
- **NPM 生态最大**:200 万 + 包

**适合**:
- I/O 密集型(API 服务、实时通信、爬虫)
- 全栈应用(Next.js / Nuxt 服务端)
- 工具脚本(CLI、构建工具)

**不适合**:
- CPU 密集型(图像处理、加密计算)→ 阻塞主线程
- 高内存稳定要求(Java / Go 更稳)

### Node 18 / 20 / 22 内置的能力(2025)

```js
// 原生 fetch(以前要 axios / node-fetch)
const r = await fetch('https://api.github.com');

// 原生 test runner
node --test

// 原生 watch
node --watch app.js

// Web Streams
import { Readable } from 'node:stream';

// crypto / fs / http 等标准库
import { readFile } from 'node:fs/promises';
```

---

## 二、Bun / Deno:Node 的替代

```
Bun (2022, Zig)        : Node 兼容 + 极快(JS 运行 + npm 安装 + 测试)
Deno (2018, Rust)      : Node 同作者,默认 TS / 安全权限模型
```

**Bun 的吸引力**:

```bash
bun install           # 比 npm 快 10 倍
bun run dev           # 比 node 快 2-3 倍
bun test              # 内置测试,Jest 兼容
bun build             # 内置打包
bun --hot index.ts    # 内置 HMR
```

直接跑 TS,不用 ts-node。一个工具搞定 Node + npm + Vitest + esbuild + nodemon。

**生产成熟度**:
- 简单 API 服务可以用
- 复杂场景(数据库 driver / 流处理)还有兼容问题
- Vercel / Cloudflare Workers 用类似 runtime,不是 Node

**当下推荐**:**学 Node.js,工具链可选 Bun**。生产先 Node 稳。

---

## 三、Hono:现代轻量框架(推荐新项目)

Hono 的优势:
- **跨 runtime**:Node / Bun / Deno / Cloudflare Workers / Vercel Edge 都能跑
- **极小**:只有几 KB
- **TypeScript 友好**:类型推导一流
- **API 类似 Express**,迁移成本低

### 1. 第一个服务

```bash
pnpm create hono my-api
cd my-api
pnpm install
pnpm dev
```

```ts
// src/index.ts
import { Hono } from 'hono';

const app = new Hono();

app.get('/', (c) => c.text('Hello!'));
app.get('/api/users/:id', (c) => {
  const id = c.req.param('id');
  return c.json({ id, name: 'Alice' });
});

export default app;
```

部署到 Cloudflare Workers / Vercel 一行配置。

### 2. 中间件

```ts
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { jwt } from 'hono/jwt';

app.use('*', logger());
app.use('/api/*', cors({ origin: 'https://your-app.com' }));
app.use('/api/admin/*', jwt({ secret: process.env.JWT_SECRET }));

app.get('/api/admin/users', (c) => {
  const payload = c.get('jwtPayload');
  return c.json({ user: payload.sub });
});
```

### 3. 校验(zod 配合)

```ts
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

app.post('/api/users', zValidator('json', schema), (c) => {
  const data = c.req.valid('json');     // 类型自动是 z.infer<typeof schema>
  return c.json({ ok: true, data });
});
```

### 4. RPC 模式(端到端类型安全)

```ts
// 服务端
const route = app.get('/api/users/:id', (c) => {
  return c.json({ id: c.req.param('id'), name: 'Alice' });
});

export type AppType = typeof route;
```

```ts
// 客户端
import { hc } from 'hono/client';
import type { AppType } from './server';

const client = hc<AppType>('http://localhost:3000');
const r = await client.api.users[':id'].$get({ param: { id: '1' } });
const data = await r.json();
// data.id, data.name 都有类型
```

**前端调用类型完全推导,不用 OpenAPI**。这是 Hono(以及 tRPC)的杀手锏。

---

## 四、Express:经典老大哥

写 Node 后端绕不开 Express。生态最深,旧项目最多。

### 1. Hello

```bash
pnpm add express
pnpm add -D @types/express tsx
```

```ts
import express from 'express';

const app = express();

app.use(express.json());

app.get('/', (req, res) => res.send('Hello'));

app.get('/api/users/:id', (req, res) => {
  res.json({ id: req.params.id });
});

app.listen(3000);
```

### 2. 中间件

```ts
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

app.use(helmet());                   // 安全头
app.use(cors({ origin: '...' }));     // 跨域
app.use(morgan('combined'));          // 日志
app.use(express.json());              // 解析 JSON
app.use(express.urlencoded({ extended: true }));   // 表单

// 自定义
app.use((req, res, next) => {
  console.log(req.method, req.url);
  next();
});

// 错误处理(必须 4 参)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal' });
});
```

### 3. 路由分组

```ts
const router = express.Router();

router.get('/users/:id', getUserHandler);
router.post('/users', createUserHandler);

app.use('/api', router);
```

### 4. Express 5(2024 release)

Express 5 终于支持 async handler 自动错误处理:

```ts
// Express 4 必须手 catch
app.get('/x', async (req, res, next) => {
  try {
    const data = await db.query();
    res.json(data);
  } catch (e) {
    next(e);
  }
});

// Express 5 自动转
app.get('/x', async (req, res) => {
  const data = await db.query();
  res.json(data);
});
```

新项目可以试 Express 5,旧项目稳定可以暂时不升。

---

## 五、Hono vs Express vs 其他

| 维度 | Hono | Express | Fastify | NestJS | Elysia |
| --- | --- | --- | --- | --- | --- |
| 性能 | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 类型支持 | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 生态 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ |
| Edge 跑 | ✅ | ❌ | ❌ | ❌ | ⚠️ Bun only |
| 学习成本 | 低 | 低 | 中 | 高 | 低 |

**选型**:

- **新项目 + 边缘部署 + 类型敏感**:**Hono**
- **新项目传统服务器 + 类型 + 性能**:**Fastify**
- **大型企业项目 + OOP / DI**:**NestJS**
- **接老项目 / 学习用**:**Express**
- **只用 Bun**:Elysia(类型推导极致)

Express 仍然是"必学的基础",但**新项目 Hono 是更好的起点**。

---

## 六、REST API 设计

### 1. 资源 + 动词分离

```
错误            | 正确
GET /getUser    | GET /users/:id
POST /createUser| POST /users
POST /deleteUser| DELETE /users/:id
GET /userList   | GET /users
```

URL 是名词(资源),HTTP 方法是动词。

### 2. 标准 HTTP 方法

| 方法 | 用途 | 幂等 | 安全 |
| --- | --- | --- | --- |
| GET | 读 | ✅ | ✅ |
| POST | 创建 | ❌ | ❌ |
| PUT | **整体替换** | ✅ | ❌ |
| PATCH | **局部更新** | ❌(理论上视情况) | ❌ |
| DELETE | 删除 | ✅ | ❌ |

幂等 = 重复发同样请求结果一样。

### 3. URL 设计

```
GET    /users                    列表
GET    /users/:id                单个
POST   /users                    创建
PUT    /users/:id                整体替换
PATCH  /users/:id                局部更新
DELETE /users/:id                删除

GET    /users/:id/orders         嵌套资源
GET    /users/:id/orders/:oid    嵌套单个
```

**层级不要太深**(2 层够了),太深难维护:

```
❌ /users/:uid/orders/:oid/items/:iid/comments/:cid
✅ /comments/:cid?orderId=...
```

### 4. 查询参数(Query)

```
GET /users?role=admin&page=2&limit=20&sort=-createdAt
       ↓        ↓         ↓        ↓
   过滤      分页      分页    排序(- 表示降序)

GET /users?fields=id,name        只返这些字段(节流)
GET /users?expand=orders          展开关联
GET /users?q=alice                搜索
```

### 5. 状态码

```
2xx 成功
200 OK                  通用成功
201 Created             创建成功(POST)
204 No Content          成功但没返回内容(DELETE)

3xx 重定向
301 Moved Permanently
304 Not Modified        缓存未变(配合 ETag)

4xx 客户端错
400 Bad Request         参数错 / JSON 格式错
401 Unauthorized        没登录 / token 无效
403 Forbidden           登录了但没权限
404 Not Found           资源不存在
409 Conflict            冲突(重复创建 / 版本冲突)
422 Unprocessable Entity  语义错(校验失败)
429 Too Many Requests    限流

5xx 服务端错
500 Internal Server Error
502 Bad Gateway          上游服务错
503 Service Unavailable  服务不可用
504 Gateway Timeout      上游超时
```

**别什么都返 200 + `{ success: false }`**,丢失了 HTTP 自身的语义。

### 6. 错误响应统一格式

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email is invalid",
    "details": [
      { "field": "email", "issue": "format" }
    ]
  }
}
```

或者 RFC 7807(Problem Details):

```json
{
  "type": "https://api.example.com/errors/validation",
  "title": "Validation Error",
  "status": 422,
  "detail": "Email is invalid",
  "instance": "/users"
}
```

### 7. 分页

#### Offset 分页(简单,小数据)

```
GET /users?page=2&limit=20
{
  "data": [...],
  "page": 2,
  "limit": 20,
  "total": 1234
}
```

**问题**:数据量大时数据库 `OFFSET` 慢,且翻页时数据变了会错位。

#### Cursor 分页(推荐,大数据)

```
GET /users?cursor=abc&limit=20
{
  "data": [...],
  "nextCursor": "xyz"
}
```

cursor 通常是上一页最后一项的 id 或时间戳。**性能稳定,翻页不错位**。

### 8. 版本管理

```
URL 前缀:GET /v1/users        ← 简单粗暴,最常见
Header:Accept: application/vnd.api+json;version=1
查询参数:GET /users?v=1
```

**生产推荐 URL 前缀**,客户端容易调试。

### 9. HATEOAS / 超媒体(REST 教科书,实际很少用)

理论上每个响应应该包含相关链接:

```json
{
  "id": "1",
  "name": "Alice",
  "_links": {
    "self": "/users/1",
    "orders": "/users/1/orders"
  }
}
```

**实战:绝大多数 API 不用**,前端记 URL 模式更直接。

---

## 七、API 实战:博客 CRUD

```ts
// Hono 例
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

const app = new Hono();

const postSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  tags: z.array(z.string()).optional(),
});

app.get('/posts', async (c) => {
  const { page = '1', limit = '20' } = c.req.query();
  const posts = await db.post.findMany({
    skip: (Number(page) - 1) * Number(limit),
    take: Number(limit),
    orderBy: { createdAt: 'desc' },
  });
  return c.json({ data: posts });
});

app.get('/posts/:id', async (c) => {
  const post = await db.post.findUnique({ where: { id: c.req.param('id') } });
  if (!post) return c.json({ error: { code: 'NOT_FOUND', message: 'Post not found' } }, 404);
  return c.json(post);
});

app.post('/posts', zValidator('json', postSchema), async (c) => {
  const data = c.req.valid('json');
  const post = await db.post.create({ data });
  return c.json(post, 201);
});

app.put('/posts/:id', zValidator('json', postSchema), async (c) => {
  const post = await db.post.update({
    where: { id: c.req.param('id') },
    data: c.req.valid('json'),
  });
  return c.json(post);
});

app.delete('/posts/:id', async (c) => {
  await db.post.delete({ where: { id: c.req.param('id') } });
  return c.body(null, 204);
});

export default app;
```

---

## 八、其他 API 风格(选讲)

### GraphQL

```graphql
query {
  user(id: "1") {
    name
    orders {
      total
      products { name }
    }
  }
}
```

**优点**:
- 客户端自己定字段,减少过 / 欠取
- 强类型 schema
- 一次查多资源

**缺点**:
- 服务端复杂,缓存难
- N+1 查询陷阱
- REST 工具链(curl / Postman)用起来累

**适合**:复杂多端应用、关系数据多。**不适合**:简单 CRUD。

### tRPC(纯 TS 全栈)

```ts
// 服务端定义
export const appRouter = t.router({
  user: t.procedure.input(z.string()).query(async ({ input }) => {
    return await db.user.findUnique({ where: { id: input } });
  }),
});

// 客户端调用,完全类型安全
const user = await trpc.user.query('1');
```

不是 REST,不是 HTTP 标准——**纯函数调用**(底层是 HTTP)。

**优点**:类型 100% 端到端,改服务端前端立即有错误。
**缺点**:绑死 TS,非 TS 客户端调用不友好。

**适合**:Next.js 全栈、内部 API。**不适合**:对外 API、多语言客户端。

### REST + OpenAPI

```yaml
# openapi.yaml
paths:
  /users/{id}:
    get:
      parameters:
        - name: id
          in: path
          schema: { type: string }
      responses:
        '200':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/User' }
```

OpenAPI 描述 REST API,**自动生成客户端 SDK / 文档**(Swagger UI)。**对外公开 API 必备**。

Hono 有 `@hono/zod-openapi` 自动生成 OpenAPI 文档。

---

## 九、最佳实践 checklist

### 代码组织

```
src/
├── routes/         路由(按资源分文件)
│   ├── users.ts
│   └── posts.ts
├── services/       业务逻辑
├── db/             数据库 / ORM
├── middleware/     中间件
├── lib/            工具
├── types/          类型
└── index.ts        入口
```

### 安全

- [ ] HTTPS only
- [ ] CORS 白名单具体源
- [ ] helmet / 安全头
- [ ] 限流(express-rate-limit / hono/limiter)
- [ ] 输入校验(zod)
- [ ] 参数化查询 / ORM
- [ ] 不暴露错误堆栈
- [ ] secret 在环境变量

### 性能

- [ ] gzip / brotli 压缩(`compression`)
- [ ] 关键 API 加缓存(Redis / CDN)
- [ ] 数据库加索引
- [ ] 慢查询日志
- [ ] 不在循环里 await DB(用 Promise.all 或 batch)

### 可观测性

- [ ] 结构化日志(pino / winston)
- [ ] 请求 ID 串联日志
- [ ] 错误上报(Sentry)
- [ ] 指标(Prometheus / Datadog)
- [ ] 健康检查 `GET /health`

---

## 十、常见 Trap

### Trap 1:同步操作阻塞主线程

```ts
// ❌ 阻塞所有请求
app.get('/x', (req, res) => {
  const data = fs.readFileSync('big.json');
  res.json(JSON.parse(data));
});

// ✅
app.get('/x', async (req, res) => {
  const data = await fs.promises.readFile('big.json');
  res.json(JSON.parse(data));
});
```

### Trap 2:循环 await DB

```ts
// ❌ N 次串行查询
for (const id of ids) {
  const u = await db.user.findUnique({ where: { id } });
  ...
}

// ✅ 一次批量
const users = await db.user.findMany({ where: { id: { in: ids } } });
```

### Trap 3:未处理的 Promise rejection

```ts
process.on('unhandledRejection', (e) => {
  log.error('UNHANDLED', e);
});
```

不加这个,异步未捕获错误 Node 22+ 直接退出。

### Trap 4:连接池耗尽

```ts
// ❌ 每次请求新连接
app.get('/x', async (req, res) => {
  const db = new Database();         // 漏
  ...
});

// ✅ 全局单例
const db = new Database();
app.get('/x', async (req, res) => { ... });
```

### Trap 5:内存泄漏

- 全局数组 / map 不断 push 不清
- Listener 加了不删
- setInterval 不 clear

定期跑 `node --inspect` 看堆,生产用 Node 自带 heap snapshot。

---

## 十一、心智模型

```
Node.js 后端三层:

  HTTP 框架(Hono / Express / Fastify)
       ↓
  业务逻辑(Service)
       ↓
  数据层(ORM:Prisma / Drizzle)

REST API 设计三大原则:
  - 资源 = 名词,方法 = 动词
  - 状态码用语义,别什么都 200
  - 输入永远校验,输出永远统一格式

2025 推荐栈(轻量后端):
  Hono + Drizzle + Postgres + Cloudflare Workers
  零冷启动 + 全球边缘 + TypeScript 全栈

或传统服务器:
  Node + Hono/Fastify + Prisma + Postgres + Docker
```

---

## 十二、推荐学习路径

1. **看官方教程**:Hono(https://hono.dev/)
2. **写一个 CRUD**:博客 / Todo / 短链接
3. **加数据库**(下一篇 30 讲)
4. **加认证**(35 篇)
5. **部署到 Vercel / Cloudflare / VPS**(38 篇)

后端入门 1 周内能写出可用的 API。**做完一个真实项目**比学十个框架更有用。

下一篇 30 讲数据库与 ORM:Postgres + Prisma / Drizzle。
