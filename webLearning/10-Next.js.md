# Next.js:React 全栈框架

Next.js 是 Vercel 出品的 React 全栈框架,**事实上的 React 标配**。它解决了纯 React 的几个痛点:

- 路由(自带,文件即路由)
- SSR / SSG / ISR(SEO + 性能)
- API 路由(后端在同一项目)
- 图片 / 字体 / 脚本优化
- Server Components(React 19+)
- 部署(Vercel 一键)

新建 React 项目,**默认上 Next.js**(除非纯 SPA 后台管理那种)。

---

## 一、SSR / SSG / CSR / ISR 概念

| 渲染方式 | 含义 | 适合 |
| --- | --- | --- |
| **CSR**(客户端) | 浏览器跑 JS 渲染 | 后台管理、内部工具 |
| **SSR**(服务端) | 每次请求时服务端渲染 HTML | 实时数据、个性化 |
| **SSG**(静态生成) | 构建时生成 HTML | 博客、文档、营销页 |
| **ISR**(增量静态再生) | SSG + 后台定时刷新 | 商品页、新闻 |

Next.js 默认 SSG,但每个页面可以单独选。

---

## 二、安装

```bash
pnpm create next-app@latest my-app --typescript --tailwind --eslint --app
cd my-app
pnpm dev
```

`--app`:用新版 App Router(强烈推荐),旧版 Pages Router 维护用。

---

## 三、目录结构(App Router)

```
my-app/
├── app/                    路由 + 页面
│   ├── layout.tsx          根布局
│   ├── page.tsx            /
│   ├── about/
│   │   └── page.tsx        /about
│   ├── user/
│   │   └── [id]/
│   │       └── page.tsx    /user/:id
│   └── api/
│       └── users/
│           └── route.ts    API 路由
├── components/
├── lib/
├── public/                 静态资源
├── next.config.js
└── package.json
```

**文件即路由**,跟 Flutter 的 go_router(回顾 12)思路完全不同——**约定优于配置**。

---

## 四、Page 与 Layout

```tsx
// app/layout.tsx(根布局,所有页面共享)
export default function RootLayout({ children }) {
  return (
    <html lang="zh">
      <body>
        <Header />
        {children}        {/* 子路由的内容 */}
        <Footer />
      </body>
    </html>
  );
}

// app/page.tsx
export default function Home() {
  return <h1>首页</h1>;
}

// app/about/page.tsx
export default function About() {
  return <h1>关于</h1>;
}
```

类比 Flutter 的 ShellRoute + Outlet(回顾 12)。

### 嵌套 layout

```tsx
// app/dashboard/layout.tsx
export default function DashboardLayout({ children }) {
  return (
    <div className="dashboard">
      <Sidebar />
      <main>{children}</main>
    </div>
  );
}

// app/dashboard/page.tsx        → /dashboard
// app/dashboard/users/page.tsx  → /dashboard/users
```

每一层 layout 自动包裹子路由。

---

## 五、动态路由

```tsx
// app/user/[id]/page.tsx
export default function User({ params }: { params: { id: string } }) {
  return <h1>用户 {params.id}</h1>;
}

// app/post/[...slug]/page.tsx     - 多段(/post/a/b/c)
// app/post/[[...slug]]/page.tsx   - 可选多段
```

---

## 六、Server Components(默认)

```tsx
// app/users/page.tsx
async function UsersPage() {
  const users = await db.users.findAll();    // ⭐ 直接连数据库
  return (
    <ul>
      {users.map(u => <li key={u.id}>{u.name}</li>)}
    </ul>
  );
}

export default UsersPage;
```

这是个**服务端组件**:
- 在服务端执行
- 可以 `await`,直接调数据库 / 文件系统
- 不带到客户端 bundle(代码不被下载)
- 不能用 hooks(useState、useEffect 等)
- 不能用浏览器 API(window、localStorage)

类比:像后端模板渲染(Jinja、ERB),**但语法是 React**。

---

## 七、Client Components

需要 useState / 浏览器 API 的组件,加 `'use client'` 头:

```tsx
// app/components/Counter.tsx
'use client';

import { useState } from 'react';

export default function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```

`'use client'` **不是**"客户端渲染",**是**"边界标记":这个组件及其子树会被 hydrate。

### 服务端 + 客户端组合

```tsx
// app/page.tsx (Server Component)
import Counter from './components/Counter';   // Client Component

export default async function Home() {
  const data = await fetchData();
  return (
    <>
      <h1>{data.title}</h1>          {/* 服务端渲染 */}
      <Counter />                      {/* 水合后可交互 */}
    </>
  );
}
```

**思路**:**所有页面默认服务端,只有需要交互的小块用 Client Component**。Bundle 极小。

---

## 八、数据获取

### 服务端组件直接 fetch

```tsx
async function Page() {
  const res = await fetch('https://api.example.com/users', {
    next: { revalidate: 60 },          // 60 秒重新生成
    // cache: 'no-store',               // 每次请求都重新获取(SSR)
    // cache: 'force-cache',            // 默认,SSG
  });
  const users = await res.json();
  return ...;
}
```

`next.revalidate` 是 ISR:页面构建后缓存,每 60 秒后台再生。

### 客户端用 TanStack Query

回顾 07。Server Component 不能用 hook,客户端组件就用熟悉的 TanStack Query。

### Server Actions(React 19)

```tsx
// app/actions.ts
'use server';

export async function createTodo(formData: FormData) {
  await db.todos.create({ title: formData.get('title') });
}

// app/page.tsx
import { createTodo } from './actions';

export default function Page() {
  return (
    <form action={createTodo}>
      <input name="title" />
      <button>添加</button>
    </form>
  );
}
```

`'use server'` 标记函数是服务端动作。客户端调用时**自动包成 RPC**,无需写 API 路由。**革命性**——前后端代码混写但安全。

---

## 九、API 路由

```tsx
// app/api/users/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const users = await db.users.findAll();
  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const user = await db.users.create(body);
  return NextResponse.json(user, { status: 201 });
}
```

类似传统的 Express / Koa 处理函数。客户端 `fetch('/api/users')` 即可。

### 动态 API 路由

```tsx
// app/api/users/[id]/route.ts
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await db.users.findById(params.id);
  return NextResponse.json(user);
}
```

---

## 十、Loading / Error / Not Found

每个路由可以放特殊文件:

```
app/dashboard/
├── layout.tsx
├── page.tsx
├── loading.tsx       数据加载时显示
├── error.tsx         报错时显示
└── not-found.tsx     404
```

```tsx
// app/dashboard/loading.tsx
export default function Loading() {
  return <Spinner />;
}

// app/dashboard/error.tsx
'use client';

export default function Error({ error, reset }) {
  return (
    <div>
      <p>错误:{error.message}</p>
      <button onClick={reset}>重试</button>
    </div>
  );
}

// app/dashboard/not-found.tsx
export default function NotFound() {
  return <p>页面不存在</p>;
}
```

类似 React Router 的 errorElement。

---

## 十一、链接与导航

```tsx
import Link from 'next/link';

<Link href="/about">关于</Link>
<Link href={`/user/${id}`}>用户详情</Link>
```

`Link` 自动:
- 预加载(鼠标移上去开始加载)
- 客户端导航(不刷新整页)
- 滚动到顶

### 命令式跳转

```tsx
'use client';
import { useRouter } from 'next/navigation';

const router = useRouter();
router.push('/dashboard');
router.replace('/login');
router.back();
router.refresh();      // 刷新当前路由数据
```

### 拿当前路径

```tsx
import { usePathname, useSearchParams } from 'next/navigation';

const pathname = usePathname();
const searchParams = useSearchParams();
const q = searchParams.get('q');
```

---

## 十二、Metadata(SEO)

```tsx
// app/page.tsx
export const metadata = {
  title: '首页 - MyApp',
  description: '欢迎来到 MyApp',
  openGraph: {
    title: 'MyApp',
    images: ['https://.../og.png'],
  },
};

export default function Page() { ... }

// 动态
export async function generateMetadata({ params }) {
  const product = await getProduct(params.id);
  return { title: product.name };
}
```

服务端渲染时 meta 已就位,**SEO 友好**(纯 SPA 做不到)。

---

## 十三、Image 与 Font 优化

### Image

```tsx
import Image from 'next/image';

<Image
  src="/photo.jpg"
  width={400}
  height={300}
  alt="..."
  priority         // LCP 关键图片用 priority
/>
```

自动:
- 多尺寸 srcset
- 现代格式(WebP / AVIF)
- 懒加载
- 占位符防抖(blur / color)

### Font

```tsx
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export default function Layout({ children }) {
  return <body className={inter.className}>{children}</body>;
}
```

字体自动子集化、不阻塞渲染。

---

## 十四、Middleware(请求拦截)

```tsx
// middleware.ts
import { NextResponse } from 'next/server';

export function middleware(req) {
  const token = req.cookies.get('token');
  if (!token && req.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
```

类似 Express middleware,**在路由匹配前跑**。常用于鉴权、地区重定向、A/B 测试。

---

## 十五、环境变量

`.env.local`(不进 git):

```
DATABASE_URL=postgres://...
SECRET_KEY=xxx
NEXT_PUBLIC_API_URL=https://api.example.com
```

```tsx
// 服务端可访问
process.env.DATABASE_URL

// 客户端只能读 NEXT_PUBLIC_ 开头的
process.env.NEXT_PUBLIC_API_URL
```

`NEXT_PUBLIC_` 前缀是约定:**带前缀的会被打包到客户端**,不带的只在服务端可见。

类比 Flutter 的 `--dart-define`(回顾 35),思路相同。

---

## 十六、ISR(增量静态再生)

```tsx
async function Page() {
  const data = await fetch('https://api.example.com/posts', {
    next: { revalidate: 60 },        // 60 秒重新生成
  });
  ...
}

// 或
export const revalidate = 60;        // 整个路由 60 秒
```

电商商品页、新闻、博客都适合:**像 SSG 一样快,但定期刷新**。

### On-demand revalidation

不等时间到,直接触发:

```tsx
import { revalidatePath, revalidateTag } from 'next/cache';

// Server Action 里
'use server';
export async function updateProduct(id) {
  await db.products.update(...);
  revalidatePath(`/product/${id}`);     // 让这页失效
}
```

---

## 十七、Streaming + Suspense

```tsx
import { Suspense } from 'react';

export default function Page() {
  return (
    <>
      <h1>仪表盘</h1>
      <Suspense fallback={<Spinner />}>
        <SlowChart />          {/* 加载完才出现 */}
      </Suspense>
      <Suspense fallback={<Spinner />}>
        <SlowTable />
      </Suspense>
    </>
  );
}

async function SlowChart() {
  const data = await fetchSlowData();
  return <Chart data={data} />;
}
```

服务端**流式**输出 HTML:头部立刻显示,慢数据来了再 stream 进来。**用户感觉极快**。

---

## 十八、部署

### Vercel(零配置)

```bash
pnpm add -g vercel
vercel
```

绑定 GitHub 仓库后,**push 自动部署**。免费额度对个人项目够用。

### 自部署

```bash
pnpm build
pnpm start          # Node.js 服务器
```

或 Docker:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN pnpm install && pnpm build
CMD ["pnpm", "start"]
```

### 静态导出(纯 SSG)

```js
// next.config.js
module.exports = { output: 'export' };
```

`pnpm build` 生成 `out/`,可以丢到任意 CDN / 静态托管。**只能 SSG,不能 SSR**。

---

## 十九、常用配置

### next.config.js

```js
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['example.com'],            // 允许从这些域名加载图片
  },
  experimental: {
    serverActions: { bodySizeLimit: '5mb' },
  },
  redirects: async () => [
    { source: '/old-path', destination: '/new-path', permanent: true },
  ],
  rewrites: async () => [
    { source: '/api/proxy/:path*', destination: 'https://backend/api/:path*' },
  ],
};

module.exports = nextConfig;
```

### Turbopack(实验性)

```bash
pnpm dev --turbo
```

Next.js 团队的新构建器,Vite 体验,**比 Webpack 快 10x**。生产构建仍用 Webpack(过渡期)。

---

## 十几、Next.js 全栈架构示例

```
app/
├── layout.tsx                       根 layout
├── page.tsx                         首页(Server Component,直接拉数据)
├── login/
│   ├── page.tsx                     登录页(Client Component)
│   └── actions.ts                   Server Actions(login / logout)
├── dashboard/
│   ├── layout.tsx                   带 Sidebar 的 layout
│   ├── page.tsx
│   └── users/
│       ├── page.tsx                 列表(Server Component + Suspense)
│       ├── loading.tsx
│       ├── new/
│       │   └── page.tsx             新建表单(Client + RHF + Server Action)
│       └── [id]/
│           ├── page.tsx             详情
│           └── edit/page.tsx
└── api/
    └── webhook/
        └── route.ts                 Webhook 接收

middleware.ts                         鉴权
next.config.js
```

### 鉴权完整流程

```ts
// middleware.ts
import { jwtVerify } from 'jose';

export async function middleware(req) {
  const token = req.cookies.get('token')?.value;
  if (!token && req.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  if (token) {
    try {
      await jwtVerify(token, secret);
    } catch {
      return NextResponse.redirect(new URL('/login', req.url));
    }
  }
}
```

```ts
// app/login/actions.ts
'use server';

export async function login(formData: FormData) {
  const email = formData.get('email');
  const password = formData.get('password');
  const user = await db.users.verify(email, password);
  if (!user) throw new Error('账号密码错');

  const token = await sign({ userId: user.id }, secret);
  cookies().set('token', token, { httpOnly: true, secure: true });
  redirect('/dashboard');
}
```

服务端跑、Cookie httpOnly 防 XSS、自动跳转。**几行代码搞定一套登录**。

---

## 二十一、常见坑

### 1. Hooks 在 Server Component 里报错

→ 加 `'use client'`,或把交互部分抽成单独 Client Component。

### 2. fetch 缓存意外

```tsx
const r = await fetch('https://api.example.com/users');
// 默认 cache: 'force-cache',构建时获取一次,部署后不变
```

→ 想每次请求重新获取:`{ cache: 'no-store' }` 或 `{ next: { revalidate: 0 } }`。

### 3. 客户端用了服务端代码

```tsx
'use client';

import { db } from '@/lib/db';     // ❌ db 引用了 Node only 模块
```

→ 服务端代码绝对不能在 Client Component 里 import。

### 4. 没用 next/image / next/font

→ 性能差。能用 Next.js 优化就用。

### 5. metadata 是同步对象

```tsx
export const metadata = {
  title: await getTitle(),    // ❌ export 不能 await
};

// ✅ 用 generateMetadata
export async function generateMetadata({ params }) {
  return { title: await getTitle(params.id) };
}
```

### 6. revalidate 误解

```tsx
export const revalidate = 60;  // 路由级别,Server Component 默认遵循
```

但 Server Action 调 mutation 后,要主动 `revalidatePath`,**不会自动让缓存失效**。

### 7. dynamic = 'force-dynamic'

某些场景需要强制 SSR(如读 cookies):

```tsx
export const dynamic = 'force-dynamic';
```

或 fetch 加 `{ cache: 'no-store' }`。

---

## 二十二、和其他全栈框架对比

| 框架 | 基础 | 特色 |
| --- | --- | --- |
| **Next.js** | React | 大而全,Vercel 加持,生态最大 |
| **Remix**(被 React Router 7 整合) | React | 表单优先,服务端 mutation |
| **Astro** | 多框架 | 静态优先,内容站点首选 |
| **TanStack Start** | TanStack | 极致 TS,但还在 alpha |

新项目 React 全栈优先 Next.js,内容站点优先 Astro。

---

## 二十三、和 Flutter 的对照

| Flutter | Next.js |
| --- | --- |
| go_router | 文件即路由 |
| Riverpod FutureProvider | Server Component + fetch |
| Dio | fetch / API Routes |
| 路由 redirect | middleware |
| --dart-define | env vars + NEXT_PUBLIC |
| build / release | next build / next start |
| 平台 splash | metadata + loading.tsx |

类似的"工程化框架",Next.js 给 React 加上了 Flutter 自带的工程化。

---

## 二十四、推荐学习项目

照这个项目跑一遍 Next.js,**学到的比看 10 遍文档多**:

1. 起项目,写首页(Server Component)
2. 加登录(Client Component + Server Action + Cookie)
3. 加 Dashboard,带 Sidebar(嵌套 layout)
4. 用 Drizzle / Prisma 接 SQLite
5. CRUD 业务实体,UI 用 shadcn/ui
6. 加权限校验(middleware)
7. 加 ISR(60 秒刷新)
8. 部署 Vercel

跑完 80% Next.js 心智你都有了。

---

## 二十五、心智模型

```
Next.js = "React + 路由 + SSR/SSG + API + 优化"
       = Flutter 给 React 加上了工程化外骨骼

核心创新(2024+):
  Server Components  → 服务端组件,零客户端 JS
  Server Actions     → 表单 / 函数 = RPC
  Streaming + Suspense → 渐进式渲染

边界(use client / use server):
  默认所有都是 Server
  需要交互才 'use client'
  服务端动作用 'use server'

数据流:
  Server Component 直接 await(fetch / DB)
  Client Component 用 TanStack Query
  Mutation 用 Server Actions + revalidatePath
```

掌握 Next.js,**你能独立做出生产级 React 全栈应用**——这是 React 工程师的"高级标配"。

---

到这里 React 系列 9 篇全部完成。回头看你已经覆盖:

```
React 总览 / JSX 与组件 / Hooks / 状态管理
路由 / 数据获取 / 表单 / 性能 / Next.js
```

下一系列将进入 **Vue**——同样的问题,完全不同的解题思路。准备体验"模板 + 响应式"流派。
