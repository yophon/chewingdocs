# Nuxt:Vue 全栈框架

Nuxt 之于 Vue,等于 **Next.js 之于 React**(回顾 10):全栈、SSR / SSG、文件即路由、Server API。

Vue 团队官方维护,**新 Vue 项目要做 SEO / 全栈,首选 Nuxt**。

---

## 一、Nuxt 的核心特性

```
✅ 文件即路由(自动)
✅ SSR / SSG / ISR 一键切换
✅ Server Routes(后端 API 跟前端同项目)
✅ 自动 imports(ref / computed / 自家 composable 都不用 import)
✅ 优秀的 SEO 工具(useHead / useSeoMeta)
✅ 模块系统(@nuxt/image / @pinia/nuxt / 等)
✅ 内置数据获取(useFetch / useAsyncData)
✅ 部署多种(Node / Cloudflare / Vercel / Netlify / 静态)
```

---

## 二、起项目

```bash
pnpm dlx nuxi@latest init my-app
cd my-app
pnpm install
pnpm dev
```

### 目录结构

```
my-app/
├── app.vue                 根组件
├── nuxt.config.ts          配置
├── pages/                  ⭐ 页面(自动路由)
│   ├── index.vue           → /
│   ├── about.vue           → /about
│   └── user/
│       └── [id].vue        → /user/:id
├── layouts/                ⭐ 布局
│   ├── default.vue
│   └── admin.vue
├── components/             组件(自动 import)
├── composables/            自定义 composable(自动 import)
├── stores/                 Pinia
├── server/                 ⭐ 后端
│   ├── api/
│   │   └── users.get.ts    → GET /api/users
│   └── middleware/
├── middleware/             路由中间件
├── plugins/                Vue 插件
├── public/                 静态资源
└── assets/                 编译时资源
```

---

## 三、文件即路由

### 简单页面

```vue
<!-- pages/index.vue -->
<template>
  <h1>首页</h1>
</template>
```

→ 路径 `/`,不需要任何配置。

### 动态参数

```
pages/
├── user/
│   ├── index.vue          → /user
│   └── [id].vue           → /user/:id
└── post/
    └── [...slug].vue      → /post/* (任意嵌套)
```

```vue
<!-- pages/user/[id].vue -->
<script setup>
const route = useRoute();
const id = route.params.id;
</script>
```

类比 Next.js App Router(回顾 10)和 Flutter go_router 的混合。

---

## 四、Layouts(布局)

```vue
<!-- layouts/default.vue -->
<template>
  <Header />
  <main>
    <slot />     <!-- 页面内容渲染在这 -->
  </main>
  <Footer />
</template>
```

```vue
<!-- pages/admin/dashboard.vue -->
<script setup>
definePageMeta({
  layout: 'admin',     // 用 layouts/admin.vue
});
</script>
```

或动态切:

```vue
<NuxtLayout name="admin">
  <NuxtPage />
</NuxtLayout>
```

类似 Next.js layout / Flutter ShellRoute。

---

## 五、自动 imports(超甜)

```vue
<script setup>
// 不用 import!
const count = ref(0);
const doubled = computed(() => count.value * 2);
const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

// 自家 components / composables 也自动 import
const data = await useFetch('/api/users');
</script>

<template>
  <UserCard :user="data" />     <!-- components/UserCard.vue 自动 import -->
</template>
```

Nuxt 通过构建时分析自动注入,**写起来跟 PHP / Python 一样省心**。

---

## 六、useFetch:数据获取(SSR 友好)

```vue
<script setup>
const { data, pending, error, refresh } = await useFetch('/api/users');
</script>

<template>
  <div v-if="pending">加载中</div>
  <div v-else-if="error">错</div>
  <ul v-else>
    <li v-for="u in data" :key="u.id">{{ u.name }}</li>
  </ul>
</template>
```

特点:
- **SSR 时在服务端跑,把数据 hydrate 给客户端**(避免重复请求)
- 自动缓存
- 类型自动推导(`/api/users` 来自 server/ 文件夹时)

类比:
- Flutter Riverpod FutureProvider
- React 的 fetch + Server Component

### 高级选项

```ts
const { data } = await useFetch('/api/users', {
  query: { page: 1, limit: 10 },
  headers: { Authorization: 'Bearer xxx' },
  watch: [page],         // page 变化自动重新 fetch
  lazy: true,            // 不阻塞 SSR
  server: false,         // 仅客户端 fetch
  default: () => [],
  transform: (data) => data.items,
});
```

### useAsyncData(更通用)

```ts
const { data } = await useAsyncData('users', () => $fetch('/api/users'));
```

`useFetch` 是 `useAsyncData + $fetch` 的简写。

### $fetch(直接调,不缓存)

```ts
const data = await $fetch('/api/users', {
  method: 'POST',
  body: { name: '张三' },
});
```

适合事件回调里调 API。

---

## 七、Server Routes(后端 API)

### 基础

```ts
// server/api/hello.ts
export default defineEventHandler(() => {
  return { message: 'Hello from server' };
});
```

→ 自动注册为 `GET /api/hello`。

### 不同 HTTP 方法

```
server/api/
├── users.get.ts       GET /api/users
├── users.post.ts      POST /api/users
└── users/
    └── [id].delete.ts DELETE /api/users/:id
```

### 拿请求数据

```ts
// server/api/users.post.ts
export default defineEventHandler(async (event) => {
  const body = await readBody(event);          // POST body
  const query = getQuery(event);                // ?x=1
  const params = event.context.params;          // 路径参数
  const headers = getHeaders(event);
  const cookie = getCookie(event, 'session');

  // 写 cookie
  setCookie(event, 'session', 'xxx');

  // 错误
  if (!body.email) {
    throw createError({ statusCode: 400, message: 'email 必填' });
  }

  return { user: await db.users.create(body) };
});
```

### 中间件

```ts
// server/middleware/auth.ts
export default defineEventHandler((event) => {
  const token = getCookie(event, 'token');
  if (!token && event.path.startsWith('/api/admin')) {
    throw createError({ statusCode: 401 });
  }
});
```

类似 Next.js middleware,但更细分:`server/middleware` 跑在所有 server 路由前。

---

## 八、useHead / useSeoMeta(SEO)

```vue
<script setup>
useHead({
  title: '产品列表',
  meta: [
    { name: 'description', content: '...' },
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' },
  ],
});

// 或专用 SEO 助手
useSeoMeta({
  title: '产品列表',
  description: '我家的产品都在这',
  ogTitle: '产品列表',
  ogImage: '/og.png',
  twitterCard: 'summary_large_image',
});
</script>
```

服务端渲染时自动出现在 HTML `<head>` 里,**SEO 友好**。

---

## 九、路由中间件(前端)

```ts
// middleware/auth.global.ts(全局)
export default defineNuxtRouteMiddleware((to, from) => {
  const user = useUserStore();
  if (to.meta.requiresAuth && !user.isLoggedIn) {
    return navigateTo('/login');
  }
});
```

或路由级别:

```vue
<!-- pages/dashboard.vue -->
<script setup>
definePageMeta({
  middleware: 'auth',     // middleware/auth.ts
});
</script>
```

类似 React Router 的守卫 / Flutter go_router redirect。

---

## 十、模块系统

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: [
    '@nuxt/image',          // 图片优化
    '@pinia/nuxt',           // Pinia 集成
    '@nuxtjs/tailwindcss',   // Tailwind
    '@nuxt/icon',            // 图标
    '@vueuse/nuxt',          // VueUse 自动 import
    '@nuxtjs/i18n',          // 国际化
  ],
});
```

模块 = 一站式集成。**装一个就齐活**。

### 流行模块

| 模块 | 用途 |
| --- | --- |
| `@pinia/nuxt` | Pinia |
| `@nuxt/image` | next/image 同等 |
| `@nuxt/icon` | 图标库 |
| `@vueuse/nuxt` | VueUse 自动注入 |
| `@nuxtjs/tailwindcss` | Tailwind |
| `@nuxtjs/i18n` | 国际化 |
| `@sidebase/nuxt-auth` | 鉴权 |
| `@nuxt/content` | 文档 / Markdown |
| `nuxt-security` | 安全 headers |

---

## 十一、SSR / SSG / ISR

### 默认 SSR

```bash
pnpm build
pnpm preview     # 启动 Node 服务器
```

### SSG(生成静态站点)

```bash
pnpm generate
```

输出 `dist/` 全是 HTML,可丢任意 CDN。
**博客 / 文档 / 营销站首选**。

### ISR(混合)

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  routeRules: {
    '/': { prerender: true },                              // SSG
    '/blog/**': { isr: 3600 },                              // ISR,1 小时刷新
    '/api/**': { cors: true },
    '/admin/**': { ssr: false },                            // 客户端渲染
    '/old/**': { redirect: '/new' },
  },
});
```

跟 Next.js 的 revalidate 思路一致(回顾 10)。

---

## 十二、Pinia 整合

```ts
// stores/user.ts
export const useUserStore = defineStore('user', () => {
  const user = ref<User | null>(null);
  return { user };
});
```

任何页面 / 组件直接 `useUserStore()`,不用 import。

SSR 时,**store 状态自动序列化到 HTML、客户端 hydrate**——多用户隔离 Nuxt 帮你处理。

---

## 十三、State / 跨组件传递

```ts
// composables/useCounter.ts
export const useCounter = () => useState('counter', () => 0);

// 任何组件
const counter = useCounter();
counter.value++;
```

`useState` 是 Nuxt 的简化版 store,**SSR 友好,共享单值**。轻量场景用,复杂的还是 Pinia。

---

## 十四、错误页

```vue
<!-- error.vue(项目根目录) -->
<script setup>
const error = useError();
</script>

<template>
  <div>
    <h1>错误 {{ error?.statusCode }}</h1>
    <p>{{ error?.message }}</p>
    <button @click="clearError({ redirect: '/' })">回首页</button>
  </div>
</template>
```

任何抛错都到这页(类似 Flutter `errorBuilder`)。

---

## 十五、环境变量

```ini
# .env
NUXT_PUBLIC_API_BASE=https://api.example.com
DATABASE_URL=postgres://...
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  runtimeConfig: {
    // 仅服务端
    databaseUrl: '',
    // 客户端可访问(NUXT_PUBLIC_*)
    public: {
      apiBase: '',
    },
  },
});
```

```ts
// 用
const config = useRuntimeConfig();
console.log(config.public.apiBase);    // 客户端 OK
console.log(config.databaseUrl);        // 仅服务端
```

类似 Next.js 的 `process.env` + `NEXT_PUBLIC_` 前缀(回顾 10)。

---

## 十六、Server vs Client

```ts
// 仅服务端(plugins/server-only.server.ts)
// 仅客户端(plugins/client-only.client.ts)

if (process.server) ...        // 服务端
if (process.client) ...        // 客户端
```

### `<ClientOnly>` 组件

```vue
<ClientOnly>
  <ChartComponent />     <!-- 用了 window 等浏览器 API,只在客户端渲染 -->
  <template #fallback>
    <div>加载中</div>
  </template>
</ClientOnly>
```

跟 Next.js 的 'use client' 思路一致。

---

## 十七、Plugins(插件)

```ts
// plugins/dayjs.client.ts
import dayjs from 'dayjs';

export default defineNuxtPlugin(() => {
  return {
    provide: {
      dayjs,
    },
  };
});
```

```vue
<script setup>
const { $dayjs } = useNuxtApp();
console.log($dayjs().format('YYYY-MM-DD'));
</script>
```

适合注入全局工具(dayjs / axios / SDK)。

---

## 十八、部署

### Vercel(零配置)

```bash
pnpm dlx vercel
```

或绑定 GitHub 仓库,自动 push 部署。

### 自部署 Node

```bash
pnpm build
node .output/server/index.mjs
```

### 静态(SSG)

```bash
pnpm generate
# dist/ 上传任意 CDN
```

### Cloudflare Workers / Edge

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  nitro: { preset: 'cloudflare' },
});
```

Nuxt 用 **Nitro**(底层服务器引擎),支持 15+ 部署目标。**比 Next.js 部署灵活**。

---

## 十九、典型项目结构

```
my-app/
├── nuxt.config.ts
├── app.vue
├── error.vue
├── pages/
│   ├── index.vue
│   ├── login.vue
│   ├── dashboard/
│   │   ├── index.vue
│   │   └── settings.vue
│   └── product/
│       └── [id].vue
├── layouts/
│   ├── default.vue
│   └── auth.vue
├── components/
│   ├── ProductCard.vue
│   └── ui/
│       └── Button.vue
├── composables/
│   └── useAuth.ts
├── stores/
│   ├── user.ts
│   └── cart.ts
├── server/
│   └── api/
│       ├── products.get.ts
│       └── auth/
│           └── login.post.ts
├── middleware/
│   ├── auth.ts
│   └── admin.ts
├── plugins/
│   └── dayjs.ts
├── public/
└── assets/
```

---

## 二十、和 Next.js 对照

| Next.js | Nuxt |
| --- | --- |
| App Router (`app/`) | `pages/` + `layouts/` |
| Server Components | `<script setup>` 默认服务端运行 |
| `'use client'` | `<ClientOnly>` |
| Server Actions | server/api/*.post.ts |
| `metadata` | `useHead / useSeoMeta` |
| middleware.ts | middleware/*.ts |
| Image | `<NuxtImg>` |
| API Routes | `server/api/*` |
| `revalidate` | routeRules `isr` |

**两者覆盖范围几乎一致**。Nuxt 路由更"约定式",Next.js 灵活度稍高。

---

## 二十一、和 Flutter / Riverpod 对照

| Flutter | Nuxt |
| --- | --- |
| go_router | 文件即路由 |
| Riverpod FutureProvider | `useFetch` |
| Dio + Repository | `$fetch` + server/api |
| Bloc 状态 | Pinia |
| Flutter SDK 配置 | nuxt.config.ts |
| 多端打包 | nitro presets(多种 server) |

跟 Flutter 对应不太直接(因为 Flutter 是端,Nuxt 是 Web 全栈),但思路上 **Nuxt 给 Vue 加了"工程化外壳",类似 Flutter 框架提供的工程化能力**。

---

## 二十二、常见坑

### 1. 服务端用了浏览器 API

```ts
const w = window.innerWidth;     // ❌ SSR 时 window 不存在
```

→ 加 `if (process.client)` 或用 `<ClientOnly>` 包。

### 2. useFetch 多次执行

```vue
<script setup>
// SSR 跑一次,客户端 hydrate 时不再跑(好)
// 但如果在 onMounted 里调,客户端额外跑一次
const { data } = await useFetch('/api/users');     // ✅
</script>
```

### 3. 全局 ref 状态污染

```ts
// composables/useGlobal.ts
const counter = ref(0);    // ❌ 服务端共享给所有用户
export const useCounter = () => counter;

// ✅ 用 useState
export const useCounter = () => useState('counter', () => 0);
```

### 4. server/ 里 import 客户端代码

```ts
// server/api/x.ts
import VueComponent from '~/components/X.vue';    // ❌ Vue 组件不能在 server 用
```

→ server/ 文件夹只能用 Node / Web 标准 API。

### 5. routeRules 改了不生效

→ 需要 `pnpm build` 重新构建。dev 模式部分规则不会触发。

### 6. SEO 数据没出现

→ 检查 `useHead / useSeoMeta` 是不是在 setup 顶层调用。

---

## 二十三、推荐栈(Nuxt 3)

```
Nuxt 3                  框架
TypeScript              类型
Vue 3.4+                UI
Pinia (@pinia/nuxt)     状态
Tailwind 或 UnoCSS      样式
Nuxt UI / Naive UI      UI 组件
@nuxt/image             图片
@vueuse/nuxt            工具集
TanStack Vue Query      服务端数据(可选,Nuxt 自带 useFetch 也够)
@sidebase/nuxt-auth     鉴权
zod                     类型校验
@nuxtjs/i18n            国际化
Vitest                  单测
Playwright              E2E
```

---

## 二十四、心智模型

```
Nuxt = "Vue + 工程化全套"

文件即路由:pages/
布局:layouts/
后端:server/api/
配置:nuxt.config.ts
模块:一行装齐生态(@xxx/nuxt)
数据:useFetch / useAsyncData / $fetch
SEO:useHead / useSeoMeta

部署灵活:Node / Cloudflare / Vercel / SSG / Edge
```

到这里 Vue 系列 7 篇全部完成:

```
11 Vue 总览与心智
12 Vue 模板与指令
13 Vue 组合式 API
14 Vue 响应式原理
15 Pinia
16 Vue Router
17 Nuxt
```

学完这套,任何 Vue 项目你都能从零搭起来。

下一篇进入 **SolidJS**。它长得像 React,但用 Signals 做细粒度响应式,适合拿来反向理解 React 和 Vue 的更新模型。
