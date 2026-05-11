# ElysiaJS 类型系统与插件

Elysia 的杀手锏不是"快",而是 **"端到端类型安全"**——服务器一改 schema,客户端立即编译报错。这一章讲它的类型系统(TypeBox / Eden)和官方插件生态。

---

## 一、TypeBox:运行时 schema + 编译期类型

`t.*` 是 [TypeBox](https://github.com/sinclairzx81/typebox) 的封装。它做的事:**写一份 JSON Schema,既校验、又导出 TS 类型**。

```ts
import { Elysia, t } from 'elysia'

const UserSchema = t.Object({
  id:    t.Numeric(),                      // 字符串 → number
  name:  t.String({ minLength: 2 }),
  email: t.String({ format: 'email' }),
  role:  t.Union([t.Literal('admin'), t.Literal('user')]),
  tags:  t.Array(t.String()),
  meta:  t.Optional(t.Record(t.String(), t.Any())),
})

type User = typeof UserSchema.static
//   ^? { id: number; name: string; email: string; role: 'admin' | 'user'; tags: string[]; meta?: Record<string, any> }
```

| TypeBox | TS 类型 |
| --- | --- |
| `t.String()` | string |
| `t.Number() / t.Numeric()` | number(后者支持字符串转数字) |
| `t.Boolean() / t.BooleanString()` | boolean |
| `t.Array(t.String())` | string[] |
| `t.Object({...})` | { ... } |
| `t.Union([...])` | A \| B \| C |
| `t.Literal('a')` | 'a' |
| `t.Optional(x)` | x \| undefined |
| `t.Nullable(x)` | x \| null |
| `t.Record(t.String(), t.Number())` | Record<string, number> |
| `t.Date()` | Date |
| `t.File({ maxSize, type })` | File |

---

## 二、四个 schema 槽位

```ts
.get('/users/:id',
  ({ params, query }) => find(params.id, query.expand),
  {
    params:   t.Object({ id: t.Numeric() }),
    query:    t.Object({ expand: t.Optional(t.String()) }),
    headers:  t.Object({ authorization: t.String() }),
    body:     t.Object({ ... }),                            // POST/PUT
    response: {
      200: t.Object({ id: t.Number(), name: t.String() }),
      404: t.Object({ message: t.String() }),
    },
    detail: { summary: '查询用户', tags: ['User'] },         // OpenAPI 元信息
  }
)
```

把 schema 写到第三个参数里有三大好处:

1. **运行时校验**,不合法直接 422
2. **编译期类型**,handler 里 `params.id` 是 `number`
3. **生成 OpenAPI**,接口文档自动出

---

## 三、Models:复用 schema

```ts
const App = new Elysia()
  .model({
    'user.create': t.Object({ name: t.String(), email: t.String({ format: 'email' }) }),
    'user.public': t.Object({ id: t.Number(), name: t.String(), email: t.String() }),
  })
  .post('/users', ({ body }) => save(body), {
    body: 'user.create',                    // 引用名,而不是写死 schema
    response: 'user.public',
  })
```

---

## 四、Eden Treaty:类型化客户端

服务器和客户端在同一个 monorepo 里时,Eden 让你**像调本地函数一样调远端**:

```ts
// server.ts
import { Elysia, t } from 'elysia'
export const app = new Elysia()
  .post('/users', ({ body }) => ({ id: 1, ...body }), {
    body: t.Object({ name: t.String(), email: t.String({ format: 'email' }) })
  })
  .listen(3000)
export type App = typeof app

// client.ts
import { treaty } from '@elysiajs/eden'
import type { App } from './server'

const api = treaty<App>('http://localhost:3000')

const { data, error } = await api.users.post({ name: 'Tom', email: 'a@a.com' })
//                                ^? 自动补全 + 校验 body
//        ^? data: { id: number; name: string; email: string } | null
```

服务器删除 `email` 字段,**客户端立刻编译报错**——不再有"接口文档落后于代码"的问题。

---

## 五、官方插件矩阵

```bash
bun add @elysiajs/swagger @elysiajs/jwt @elysiajs/cors @elysiajs/bearer @elysiajs/static @elysiajs/cron
```

| 插件 | 作用 |
| --- | --- |
| `@elysiajs/swagger` | OpenAPI / Scalar 文档(自动从 schema 生成) |
| `@elysiajs/cors` | CORS |
| `@elysiajs/bearer` | 解析 `Authorization: Bearer xxx` |
| `@elysiajs/jwt` | JWT 签发 / 校验 |
| `@elysiajs/static` | 静态文件 |
| `@elysiajs/cron` | 定时任务 |
| `@elysiajs/server-timing` | Server-Timing header,排查耗时 |
| `@elysiajs/html` | HTML 模板 / SSR |
| `@elysiajs/trpc` | tRPC 兼容 |
| `@elysiajs/graphql-yoga` | GraphQL |
| `@elysiajs/opentelemetry` | OTel 追踪 |

---

## 六、Swagger 自动文档

```ts
import { swagger } from '@elysiajs/swagger'

new Elysia()
  .use(swagger({
    documentation: {
      info: { title: 'My API', version: '1.0.0' },
      tags: [{ name: 'User', description: '用户相关' }],
    },
  }))
  .post('/users', ({ body }) => ..., {
    body: t.Object({ name: t.String() }),
    detail: { tags: ['User'], summary: '创建用户' },
  })
```

启动后访问 `http://localhost:3000/swagger`(默认是 Scalar 风格的现代 UI)。

---

## 七、JWT 实战

```ts
import { jwt } from '@elysiajs/jwt'

const app = new Elysia()
  .use(jwt({
    name: 'jwt',
    secret: Bun.env.JWT_SECRET!,
    exp: '2h',
  }))
  .post('/login', async ({ body, jwt }) => {
    const u = await verifyPassword(body.username, body.password)
    if (!u) return { error: 'bad creds' }
    return { token: await jwt.sign({ sub: u.id, role: u.role }) }
  }, {
    body: t.Object({ username: t.String(), password: t.String() })
  })
  .derive(async ({ jwt, headers: { authorization } }) => {
    if (!authorization?.startsWith('Bearer ')) return { user: null }
    const payload = await jwt.verify(authorization.slice(7))
    return { user: payload || null }
  })
  .get('/me', ({ user, error }) => {
    if (!user) return error(401)
    return user
  })
```

注意 `derive` 内 `jwt.verify` 失败会返回 `false`,而不是抛错;统一用空值判断更稳。

---

## 八、定时任务

```ts
import { cron } from '@elysiajs/cron'

new Elysia()
  .use(cron({
    name: 'cleanup',
    pattern: '0 3 * * *',          // 每天 3 点
    run() { console.log('cleanup') }
  }))
```

⚠️ 多实例部署时同样会重复触发,生产用 K8s CronJob 或队列 + 分布式锁。

---

## 九、ORM 搭配

Elysia 不绑定 ORM,常见组合:

| ORM | 特点 |
| --- | --- |
| **Drizzle** | TS-first、SQL-like 写法、零运行时,Elysia 项目最常配 |
| Prisma | 体验好但启动慢、Bun 兼容近期才稳定 |
| Kysely | 纯 SQL builder,类型完全推断 |
| Bun.sql | Bun 1.1 起内置的轻量 PG/SQLite 客户端 |

Drizzle 速览:

```ts
// schema.ts
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'
export const users = pgTable('users', {
  id:        serial('id').primaryKey(),
  name:      text('name').notNull(),
  email:     text('email').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow(),
})

// 用
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
const db = drizzle(postgres(Bun.env.DATABASE_URL!))

await db.insert(users).values({ name: 'Tom', email: 'a@a.com' })
const list = await db.select().from(users).where(eq(users.email, 'a@a.com'))
```

---

## 十、单元测试

Bun 内置 test runner:

```ts
// users.test.ts
import { describe, it, expect } from 'bun:test'
import { app } from './server'

describe('user api', () => {
  it('GET /users/1', async () => {
    const res = await app.handle(new Request('http://localhost/users/1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 1 })
  })
})
```

`app.handle(req)` 直接喂请求,**不需要起真 HTTP server**,毫秒级跑完。

---

## 十一、性能小贴士

1. **schema 越严越快**:Elysia 给每个 schema 编译出专属解析器
2. **handler 别 async if 不需要**:同步函数比 async 快一点(JIT 优化)
3. **Bun.serve 默认开启 HTTP keep-alive**,不用配
4. **静态文件用 `@elysiajs/static`**,直接 sendfile 路径,不走 JS

---

## 十二、给新手的建议

1. **写 schema 是义务,不是可选**——这是 Elysia 价值的核心
2. **monorepo 项目一定上 Eden**,前后端类型一致是质变
3. **swagger 插件第一天就装**,文档与代码同步更新
4. **derive + jwt + bearer** 是 Elysia 鉴权的常规组合,不要自己重新发明
5. ORM 选 Drizzle 安全、用 Prisma 也行,**但避免在 Elysia 里硬塞 TypeORM 那套装饰器风格**
