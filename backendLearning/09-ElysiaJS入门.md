# ElysiaJS 入门

[ElysiaJS](https://elysiajs.com) 是 **Bun 时代** 的 TypeScript-first Web 框架。性能极致、类型驱动、API 简洁,用过 Express/Hono 的人能秒上手,但 Elysia 的"端到端类型安全"会让你觉得回不去了。

---

## 一、它在 Node 框架里的位置

| 框架 | 运行时 | 性能 | 类型 | 体感 |
| --- | --- | --- | --- | --- |
| Express | Node | 一般 | 弱 | 老朋友,生态最大 |
| Koa | Node | 中 | 弱 | 更现代的中间件模型 |
| Fastify | Node | 高 | 中(JSON Schema) | 高性能、生态好 |
| NestJS | Node | 中 | 强(基于装饰器) | 后端工程化、企业首选 |
| **Hono** | 任意(Bun/Node/Deno/Edge) | 极高 | 中 | 跨平台 / Edge 首选 |
| **Elysia** | **Bun** 优先 | **极高** | **极强** | TS-first、类型自动推到客户端 |

> 简单选型:**追求性能 + Bun + TS 体验** → Elysia;**Edge / 多平台部署** → Hono;**大型企业、需要 DI/模块化** → NestJS。

---

## 二、装环境

```bash
curl -fsSL https://bun.sh/install | bash      # 装 Bun
bun --version

bun create elysia my-app
cd my-app
bun dev        # 默认 3000 端口
```

`package.json` 里:

```json
{
  "scripts": {
    "dev": "bun run --hot src/index.ts",
    "start": "bun src/index.ts"
  },
  "dependencies": {
    "elysia": "^1.1.0"
  }
}
```

---

## 三、第一个接口

```ts
// src/index.ts
import { Elysia } from 'elysia'

const app = new Elysia()
  .get('/', () => 'Hello Elysia')
  .get('/users/:id', ({ params: { id } }) => ({ id, name: `user-${id}` }))
  .post('/echo', ({ body }) => body)
  .listen(3000)

console.log(`🦊 running at http://${app.server?.hostname}:${app.server?.port}`)
```

```bash
bun dev
curl localhost:3000
curl localhost:3000/users/42
curl -X POST localhost:3000/echo -H 'content-type: application/json' -d '{"a":1}'
```

特点:

- **链式调用**:每个 `.get / .post / .use` 都返回新的 Elysia 实例(类型不断聚合)
- **解构参数**:Handler 一般写成 `({ body, params, query, headers, set })`
- **不需要 `res.send`**:return 什么就响应什么(自动 JSON 化对象)

---

## 四、Context 对象

```ts
.get('/path/:id', ({ params, query, body, headers, request, set, store, cookie, error }) => {
  // params  : { id: string }
  // query   : { keyword?: string } —— ?keyword=foo
  // body    : 已解析的 JSON / form
  // headers : Record<string, string>
  // request : 原始 Request 对象
  // set     : 修改响应:set.status = 201;  set.headers['x-trace'] = 't1'
  // store   : 应用级共享状态
  // cookie  : { name: { value, set, remove } }
  // error   : 抛 HTTP 错误工具
})
```

---

## 五、用 Schema 做参数校验(TypeBox)

Elysia 内置了 `t`(基于 TypeBox)。**你写一次 schema,既校验、又生成 TS 类型、还出 OpenAPI**。

```ts
import { Elysia, t } from 'elysia'

new Elysia()
  .post(
    '/users',
    ({ body }) => ({ ok: true, ...body }),
    {
      body: t.Object({
        name: t.String({ minLength: 2, maxLength: 30 }),
        email: t.String({ format: 'email' }),
        age: t.Optional(t.Integer({ minimum: 0, maximum: 150 })),
      }),
      response: t.Object({ ok: t.Boolean(), name: t.String(), email: t.String() }),
    }
  )
  .listen(3000)
```

非法请求自动返 422:

```bash
curl -X POST localhost:3000/users \
  -H 'content-type: application/json' \
  -d '{"name":"a","email":"x"}'
# {"type":"validation","summary":"...","errors":[...]}
```

---

## 六、与 Express / Hono 对照

```ts
// Express
app.get('/users/:id', (req, res) => {
  const id = Number(req.params.id)
  if (isNaN(id)) return res.status(400).send('bad id')
  res.json({ id })
})

// Hono
app.get('/users/:id', (c) => {
  const id = Number(c.req.param('id'))
  if (isNaN(id)) return c.text('bad id', 400)
  return c.json({ id })
})

// Elysia
app.get('/users/:id', ({ params: { id } }) => ({ id }), {
  params: t.Object({ id: t.Numeric() })   // 自动 string→number + 校验
})
```

> Elysia 的 `t.Numeric()` 是 query/params 场景的特别好用——**把字符串自动转 number 并校验**。

---

## 七、错误与状态码

```ts
.get('/users/:id', ({ params: { id }, error }) => {
  const u = users.find(u => u.id === id)
  if (!u) return error(404, { code: 'USER_NOT_FOUND', message: '用户不存在' })
  return u
})

// 或用 set
.get('/x', ({ set }) => { set.status = 201; return { ok: true } })

// 抛错
.get('/y', () => { throw new Error('boom') })
.onError(({ code, error, set }) => {
  if (code === 'NOT_FOUND') { set.status = 404; return { msg: 'not found' } }
  set.status = 500
  return { msg: error.message }
})
```

`code` 内置常量:`NOT_FOUND / VALIDATION / PARSE / INTERNAL_SERVER_ERROR / UNKNOWN`。

---

## 八、生命周期钩子(Macro System)

Elysia 把请求生命周期切成多个钩子:

```
request → parse → transform → beforeHandle → handle → afterHandle → mapResponse → onError
```

```ts
new Elysia()
  .onRequest(({ request }) => console.log('→', request.method, request.url))
  .onBeforeHandle(({ headers, error }) => {
    if (!headers.authorization) return error(401, '请登录')
  })
  .onAfterHandle(({ response, set }) => {
    set.headers['x-app'] = 'demo'
  })
  .onError(({ error, set }) => { set.status = 500; return { msg: error.message } })
  .get('/secret', () => '🤫')
```

---

## 九、目录结构与模块化

随项目变大,推荐拆成多个 Elysia 实例 + `.use` 组合:

```
src/
├── index.ts
├── modules/
│   ├── user/
│   │   ├── index.ts        ← 导出 userModule
│   │   ├── service.ts
│   │   └── model.ts        ← schema (t.Object)
│   └── order/
│       └── index.ts
└── plugins/
    ├── auth.ts
    └── logger.ts
```

```ts
// modules/user/index.ts
import { Elysia, t } from 'elysia'

export const userModule = new Elysia({ prefix: '/users' })
  .get('/', () => list())
  .get('/:id', ({ params }) => get(params.id), {
    params: t.Object({ id: t.Numeric() })
  })
  .post('/', ({ body }) => create(body), {
    body: t.Object({ name: t.String(), email: t.String({ format: 'email' }) })
  })

// index.ts
import { Elysia } from 'elysia'
import { userModule } from './modules/user'
import { orderModule } from './modules/order'

new Elysia().use(userModule).use(orderModule).listen(3000)
```

---

## 十、运行性能数据感受

`elysia.get('/')` 在 M1 + Bun 上单核 **~70 万 RPS**,接近 Rust 框架 axum 的水平,远超 Express(~3 万)。

不过别迷信 benchmark,真实业务瓶颈在数据库和远程调用,不在框架。

---

## 十一、给新手的建议

1. **第一周不要装太多插件**,先把 `t.*` 校验、生命周期钩子、组合 `.use()` 玩熟
2. **永远写 schema**:Elysia 的杀手锏就是类型贯穿,不写 schema 等于浪费它一半价值
3. **Bun 现在生产可用,但生态偏 Node 时遇到原生模块要测试**
4. **不要把 Elysia 当成 Express 写**(疯狂用 ctx.req/res),用它的链式 + 解构风格
5. 后两章会讲 **路由进阶 / 中间件 / Eden Treaty 类型化客户端 / 官方插件**
