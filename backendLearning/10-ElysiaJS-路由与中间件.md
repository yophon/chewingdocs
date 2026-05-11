# ElysiaJS 路由与中间件

入门后,Elysia 的进阶价值集中在 **路由组合、生命周期钩子、依赖装配(decorate / state / derive)、错误处理、模块复用**。这一章把这些"中等深度"的能力一次性讲透。

---

## 一、路由分组

```ts
import { Elysia, t } from 'elysia'

const app = new Elysia()
  .group('/api/v1', (app) =>
    app
      .group('/users', (app) =>
        app
          .get('/', () => list())
          .get('/:id', ({ params }) => get(params.id))
          .post('/', ({ body }) => create(body)))
      .group('/orders', (app) =>
        app.get('/', () => listOrders()))
  )
  .listen(3000)
```

或用前缀 + 子模块:

```ts
const userMod = new Elysia({ prefix: '/users' })
  .get('/', () => list())
  .post('/', ({ body }) => create(body))

new Elysia({ prefix: '/api/v1' })
  .use(userMod)
  .listen(3000)
```

> 经验法则:**用 `.use()` 组合而不是 `.group()` 嵌套**,前者是"模块化",后者只是"加前缀"。

---

## 二、guard:把校验/权限统一到一组路由

```ts
new Elysia()
  .guard(
    {
      // 所有此分组下的接口都强制带这个 schema 与钩子
      headers: t.Object({ authorization: t.String() }),
      beforeHandle({ headers, error }) {
        if (!headers.authorization?.startsWith('Bearer ')) return error(401)
      }
    },
    (app) => app
      .get('/me', ({ headers }) => parseUser(headers.authorization))
      .get('/orders', () => myOrders())
  )
  .get('/public', () => 'no auth')
```

`guard` 的好处:**类型也跟着收紧**,组内 handler 里的 `headers.authorization` 是 `string` 而不是 `string | undefined`。

---

## 三、生命周期钩子全景

```
onRequest        ── 收到请求(还没解析 body)
parse            ── 自定义 body 解析器(默认 JSON / form-urlencoded / multipart)
transform        ── 改写 params / query / body
beforeHandle     ── 真正进 handler 前(鉴权常用)
handle           ── 你的业务函数
afterHandle      ── 拿到 handler 返回,准备序列化
mapResponse      ── 改最终响应(改 Header、加密 body 等)
onError          ── 任何阶段抛错触发
onResponse       ── 响应已发出
```

```ts
new Elysia()
  .onRequest(({ request }) => console.log(request.method, request.url))
  .onAfterHandle(({ response, set }) => {
    set.headers['x-trace-id'] = crypto.randomUUID().slice(0, 8)
  })
  .onError(({ code, error, set }) => {
    set.status = code === 'VALIDATION' ? 422 : 500
    return { code, message: error.message }
  })
  .get('/x', () => 'ok')
```

---

## 四、注入依赖:state / decorate / derive / resolve

Elysia 的 DI 机制非常巧妙,用四个关键字代表四种"作用域"。

| 关键字 | 作用域 | 常见用途 |
| --- | --- | --- |
| `.state(key, value)` | 应用全局,**可变** | 计数器、单例 |
| `.decorate(key, value)` | 应用全局,**只读引用** | 数据库客户端、Redis 客户端 |
| `.derive(fn)` | **每次请求** 计算一次,放进 ctx | 解析 token、提取 traceId |
| `.resolve(fn)` | 同 derive,但 **必须在 schema 校验后**(可访问 typed body) | 拿 body 派生字段 |

```ts
import { Elysia } from 'elysia'
import { db } from './db'

new Elysia()
  .state('counter', 0)
  .decorate('db', db)
  .derive(({ headers }) => ({
    user: headers.authorization
      ? parseJwt(headers.authorization.slice(7))
      : null,
  }))
  .get('/me', ({ user, db, store }) => {
    store.counter++
    return user ? db.user.find(user.id) : { anon: true }
  })
```

`derive` 的强大之处:**它产出的字段是类型安全的**,handler 里能直接拿到 `user`。

---

## 五、自定义 macro

把"可复用的生命周期片段"打包,之后用一个标记位启用:

```ts
const auth = new Elysia({ name: 'auth' })
  .macro(({ onBeforeHandle }) => ({
    requireAuth(enabled: boolean) {
      if (!enabled) return
      onBeforeHandle(({ headers, error }) => {
        if (!headers.authorization) return error(401)
      })
    },
  }))

new Elysia()
  .use(auth)
  .get('/public', () => 'no')
  .get('/private', () => 'yes', { requireAuth: true })
```

---

## 六、Cookie 与 Session

```ts
new Elysia()
  .get('/login', ({ cookie: { token } }) => {
    token.value = 'abc'
    token.httpOnly = true
    token.maxAge = 3600
    token.path = '/'
    return 'ok'
  })
  .get('/me', ({ cookie: { token } }) =>
    token.value ? { name: 'tom' } : { anon: true }
  )
```

签名 cookie:

```ts
new Elysia({ cookie: { secrets: 'super-secret', sign: ['token'] } })
  .get('/x', ({ cookie: { token } }) => { token.value = 'abc'; return 'ok' })
```

---

## 七、CORS

```bash
bun add @elysiajs/cors
```

```ts
import { cors } from '@elysiajs/cors'

new Elysia()
  .use(cors({
    origin: ['https://app.example.com'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  }))
```

---

## 八、文件上传

```ts
new Elysia()
  .post('/upload',
    async ({ body }) => {
      const path = `./uploads/${crypto.randomUUID()}-${body.file.name}`
      await Bun.write(path, body.file)         // Bun 原生写文件,极快
      return { path }
    },
    {
      body: t.Object({
        type: t.String(),
        file: t.File({ maxSize: '10m', type: ['image/png', 'image/jpeg'] }),
      }),
    })
```

`t.File` 自带大小、MIME 校验,省心。

---

## 九、SSE 与 WebSocket

### Server-Sent Events

```ts
new Elysia().get('/stream', function* () {
  for (let i = 0; i < 5; i++) {
    yield { i, ts: Date.now() }
    Bun.sleepSync(1000)
  }
})
```

(generator 返回值会自动转成 SSE 流)

### WebSocket

```ts
new Elysia().ws('/chat', {
  body: t.Object({ msg: t.String() }),
  open(ws)    { ws.subscribe('room:1') },
  message(ws, { msg }) {
    ws.publish('room:1', { from: ws.id, msg })
  },
  close(ws)   { console.log('bye', ws.id) },
})
```

---

## 十、错误体系

```ts
import { Elysia, NotFoundError } from 'elysia'

class BizError extends Error {
  constructor(public code: string, public status: number, msg: string) { super(msg) }
}

new Elysia()
  .error({ BIZ: BizError })
  .get('/x', () => { throw new BizError('NO_FUND', 400, '余额不足') })
  .onError(({ code, error, set }) => {
    if (code === 'BIZ') {
      set.status = error.status
      return { code: error.code, message: error.message }
    }
    if (code === 'NOT_FOUND') { set.status = 404; return { message: 'not found' } }
    set.status = 500
    return { message: 'internal error' }
  })
```

`code` 是 Elysia 内置 + 你 `.error()` 注册的字符串字面量,**switch 时类型完全收敛**。

---

## 十一、运行时配置:env

Bun 自带 `Bun.env` / `process.env`:

```ts
const port = Number(Bun.env.PORT ?? 3000)
const dbUrl = Bun.env.DATABASE_URL!
```

或用 `t.Object` + 启动时校验:

```ts
const env = Value.Decode(t.Object({
  PORT: t.Numeric({ default: 3000 }),
  DATABASE_URL: t.String(),
}), Bun.env)
```

---

## 十二、给新手的建议

1. **`derive` 是 Elysia 最爽的设计**,把 traceId / user / tenant 这种"每个请求都需要算一次的东西"塞这里
2. **`guard` 比手动加 `beforeHandle` 优雅 10 倍**,且类型自动收紧
3. **不要写大块 onError**,把错误分类用自定义 `Error` 类 + `.error()` 注册
4. **模块化**:每个领域一个 `Elysia({ prefix })` 子实例,主入口只 `.use(...)`
5. 下一章讲 **类型系统(Eden Treaty)与官方插件**,Elysia 真正的"杀器"在那里
