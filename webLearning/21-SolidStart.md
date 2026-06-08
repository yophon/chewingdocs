# SolidStart:SolidJS 全栈框架

SolidStart 是 SolidJS 官方的全栈框架,类比 Next.js(React)和 Nuxt(Vue)。提供文件路由、SSR、服务端函数、流式渲染等功能。

---

## 一、创建项目

```bash
npm create solid@latest
# 选择 SolidStart
# 选择 TypeScript
# 选择功能(SSR / API / 等)

cd my-app && npm install && npm run dev
```

---

## 二、项目结构

```
my-app/
├── src/
│   ├── routes/             # 文件路由(类比 Next.js app/)
│   │   ├── index.tsx       # /
│   │   ├── about.tsx       # /about
│   │   ├── users/
│   │   │   ├── index.tsx   # /users
│   │   │   └── [id].tsx    # /users/:id
│   │   └── api/
│   │       └── users.ts    # /api/users (API 路由)
│   │
│   ├── components/
│   ├── stores/
│   ├── app.tsx             # 根组件 + 路由配置
│   └── entry-client.tsx    # 客户端入口
│   └── entry-server.tsx    # 服务端入口
│
├── app.config.ts           # SolidStart 配置
└── vite.config.ts
```

---

## 三、文件路由

```
routes/index.tsx         → /
routes/about.tsx         → /about
routes/users/index.tsx   → /users
routes/users/[id].tsx    → /users/:id
routes/users/[...rest].tsx → /users/* (catch-all)
```

### 基本页面组件

```tsx
// routes/users/[id].tsx
import { useParams } from '@solidjs/router';
import { createResource, Show, Suspense } from 'solid-js';

export default function UserDetail() {
  const params = useParams();
  const [user] = createResource(() => params.id, id =>
    fetch(`/api/users/${id}`).then(r => r.json())
  );

  return (
    <Suspense fallback={<p>加载中...</p>}>
      <Show when={user()} fallback={<p>用户不存在</p>}>
        {user => (
          <div>
            <h1>{user().name}</h1>
            <p>{user().email}</p>
          </div>
        )}
      </Show>
    </Suspense>
  );
}
```

---

## 四、服务端函数(Server Functions)

这是 SolidStart 的核心特性:在组件里写服务端代码。

```tsx
// routes/users/index.tsx
import { createServerData$ } from 'solid-start/server';
// 或新版 API:
import { query, createAsync } from '@solidjs/router';

// 定义服务端查询(只在服务器执行)
const getUsers = query(async () => {
  'use server';   // 标记这是服务端函数
  const users = await db.user.findMany();
  return users;
}, 'users');

export default function UsersPage() {
  const users = createAsync(() => getUsers());

  return (
    <Suspense fallback={<p>加载中...</p>}>
      <For each={users()}>
        {user => <UserCard user={user} />}
      </For>
    </Suspense>
  );
}
```

```tsx
// 带参数的查询
const getUser = query(async (id: string) => {
  'use server';
  return db.user.findUnique({ where: { id } });
}, 'user');

// 组件里用
const user = createAsync(() => getUser(params.id));
```

### 服务端 Action(表单提交 / 写操作)

```tsx
import { action, useSubmission, redirect } from '@solidjs/router';

const createUser = action(async (formData: FormData) => {
  'use server';
  const name = formData.get('name') as string;
  const email = formData.get('email') as string;

  await db.user.create({ data: { name, email } });
  throw redirect('/users');
}, 'createUser');

export default function NewUserPage() {
  const submission = useSubmission(createUser);

  return (
    <form action={createUser} method="post">
      <input name="name" required />
      <input name="email" type="email" required />
      <button type="submit" disabled={submission.pending}>
        {submission.pending ? '创建中...' : '创建用户'}
      </button>
    </form>
  );
}
```

---

## 五、路由布局

```tsx
// routes/(app)/layout.tsx  ← 括号分组不影响 URL
import { Outlet } from '@solidjs/router';

export default function AppLayout() {
  return (
    <div class="app">
      <NavBar />
      <main>
        <Outlet />   {/* 子路由渲染在这里 */}
      </main>
      <Footer />
    </div>
  );
}
```

```tsx
// routes/(app)/users/index.tsx → URL: /users
// 自动套用 (app)/layout.tsx 的布局
```

---

## 六、API 路由

```ts
// routes/api/users.ts
import { APIEvent } from '@solidjs/start/server';

export async function GET(event: APIEvent) {
  const users = await db.user.findMany();
  return Response.json(users);
}

export async function POST(event: APIEvent) {
  const body = await event.request.json();
  const user = await db.user.create({ data: body });
  return Response.json(user, { status: 201 });
}
```

```ts
// routes/api/users/[id].ts
export async function GET(event: APIEvent) {
  const id = event.params.id;
  const user = await db.user.findUnique({ where: { id } });
  if (!user) return new Response('Not Found', { status: 404 });
  return Response.json(user);
}

export async function PATCH(event: APIEvent) {
  const id = event.params.id;
  const body = await event.request.json();
  const user = await db.user.update({ where: { id }, data: body });
  return Response.json(user);
}

export async function DELETE(event: APIEvent) {
  const id = event.params.id;
  await db.user.delete({ where: { id } });
  return new Response(null, { status: 204 });
}
```

---

## 七、SSR 模式配置

```ts
// app.config.ts
import { defineConfig } from '@solidjs/start/config';

export default defineConfig({
  ssr: true,      // 默认 SSR
  // ssr: false,  // 纯 CSR
});
```

SolidStart 支持多种渲染模式:
- **SSR**(默认):每次请求服务端渲染
- **SSG**:构建时生成静态 HTML
- **CSR**:纯客户端
- **流式 SSR**:边渲染边发送(配合 Suspense)

---

## 八、流式 SSR + Suspense

```tsx
export default function Page() {
  return (
    <div>
      <h1>页面标题</h1>
      {/* 上面的内容立即发送到浏览器 */}

      <Suspense fallback={<Skeleton />}>
        {/* 等数据加载好再发送这部分 */}
        <AsyncContent />
      </Suspense>
    </div>
  );
}
```

流式 SSR 是 SolidStart 的亮点——首屏内容立刻到达浏览器,异步数据就绪后流式补充。

---

## 九、认证模式

```tsx
// middleware.ts
import { createMiddleware } from '@solidjs/start/middleware';

export default createMiddleware({
  onRequest: [
    async (event) => {
      const token = getCookie(event, 'token');
      if (!token && event.url.pathname.startsWith('/dashboard')) {
        return redirect('/login');
      }
    }
  ],
});
```

```tsx
// routes/dashboard/index.tsx
const getDashboardData = query(async () => {
  'use server';
  const user = await getAuthUser();
  if (!user) throw redirect('/login');
  return fetchDashboard(user.id);
}, 'dashboard');
```

---

## 十、和 Next.js / Nuxt 对比

| | Next.js (React) | Nuxt (Vue) | SolidStart |
| --- | --- | --- | --- |
| 文件路由 | app/ 目录 | pages/ | routes/ |
| 服务端函数 | Server Actions | Server Routes | `'use server'` |
| 数据获取 | RSC / fetch | useFetch / $fetch | createAsync + query |
| SSR | ✅ | ✅ | ✅ |
| SSG | ✅ | ✅ | ✅ |
| 流式渲染 | ✅ | ✅ | ✅ |
| 边缘运行时 | ✅ | ✅ | ✅ |
| 包体大小 | 大 | 中 | **小** |
| 生态 | 极大 | 大 | 小但够用 |

---

## 十一、部署

```bash
# 构建
npm run build

# 预览
npm run start
```

SolidStart 支持多种部署目标:

```ts
// app.config.ts
import { defineConfig } from '@solidjs/start/config';
import netlify from 'solid-start-netlify';
import vercel from 'solid-start-vercel';
import cloudflare from 'solid-start-cloudflare-workers';

export default defineConfig({
  server: {
    preset: 'vercel',  // 或 'netlify', 'cloudflare-workers', 'node', 'static'
  },
});
```

---

## 十二、和 Next.js 的心智对比

```
Next.js:
  页面组件 → Server Component(默认) / Client Component('use client')
  数据获取 → async 组件 + fetch / Server Actions

SolidStart:
  页面组件 → 普通 Solid 组件(没有 Server/Client 分类)
  数据获取 → query() + createAsync + 'use server' 函数

SolidStart 更简洁:
  不需要区分 Server/Client Component
  'use server' 标记函数,其余照常写
  响应式系统统一处理客户端状态
```

---

## 十三、心智模型

```
SolidStart = SolidJS + 文件路由 + 服务端函数 + SSR

核心概念:
  routes/      → 文件即路由
  query()      → 服务端数据查询,自动缓存
  action()     → 服务端写操作
  createAsync  → 消费 query 的响应式 hook
  'use server' → 标记在服务端执行的函数

渲染模式:
  SSR          → 默认,SEO + 首屏快
  流式 SSR     → Suspense 边界 + 异步数据
  SSG          → 静态站点

对比其他:
  Next.js  → React,最大生态,RSC 复杂度高
  Nuxt     → Vue,最好 DX,官方全面
  SolidStart → Solid,最小包体,响应式统一
```

SolidJS 系列到这里结束。下一篇进入 CSS 布局,从框架心智切回前端基础能力。
