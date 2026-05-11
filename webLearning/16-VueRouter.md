# Vue Router

Vue 官方路由,**API 跟 React Router 思路一致,但更"Vue 风"**:配置式 + 模板里用 `<router-link>` / `<router-view>`。

---

## 一、安装

```bash
pnpm add vue-router@4
```

---

## 二、最小配置

```ts
// router/index.ts
import { createRouter, createWebHistory } from 'vue-router';
import Home from '@/views/Home.vue';
import About from '@/views/About.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: Home },
    { path: '/about', component: About },
    { path: '/:pathMatch(.*)*', component: NotFound },   // 404
  ],
});

export default router;
```

```ts
// main.ts
import router from './router';
app.use(router);
```

```vue
<!-- App.vue -->
<template>
  <nav>
    <router-link to="/">首页</router-link>
    <router-link to="/about">关于</router-link>
  </nav>
  <router-view />     <!-- 当前路由对应的组件 -->
</template>
```

类比 Flutter `MaterialApp.router` + `Outlet`(回顾 12)、React Router 的 `BrowserRouter` + `Outlet`(回顾 06)。

---

## 三、history 模式

| | createWebHistory | createWebHashHistory |
| --- | --- | --- |
| URL | `/about` | `/#/about` |
| 服务端要求 | 必须 fallback 到 index.html | 无 |
| SEO | 友好 | 一般 |

服务端能配 fallback(Nginx `try_files` / Vercel rewrites)永远用 WebHistory。

---

## 四、路径参数

```ts
{ path: '/user/:id', component: UserPage }
```

```vue
<script setup>
import { useRoute } from 'vue-router';

const route = useRoute();
console.log(route.params.id);
</script>
```

或在 setup 里响应式监听:

```ts
import { computed, watch } from 'vue';

const id = computed(() => route.params.id);

watch(id, (newId) => {
  console.log('id 变了', newId);
});
```

### 多个路径段

```ts
{ path: '/post/:year/:month/:day', component: Post }
// /post/2026/05/02
```

### 通配符 / 可选

```ts
{ path: '/files/:path(.*)', component: Files }
// /files/a/b/c → params.path = 'a/b/c'

{ path: '/user/:id?', component: User }
// id 可选
```

---

## 五、Query

```vue
<script setup>
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

const q = computed(() => route.query.q);

function search(text: string) {
  router.replace({ query: { q: text } });
}
</script>

<template>
  <input :value="q" @input="search($event.target.value)" />
</template>
```

`route.query` 是只读响应式对象。

---

## 六、跳转

### 声明式:`<router-link>`

```vue
<router-link to="/about">关于</router-link>
<router-link :to="`/user/${id}`">用户</router-link>
<router-link :to="{ name: 'user', params: { id: 42 } }">命名</router-link>
<router-link :to="{ path: '/search', query: { q: 'vue' } }">查询</router-link>

<!-- 替换栈(不能后退回来) -->
<router-link :to="..." replace>...</router-link>

<!-- 自定义渲染 -->
<router-link :to="..." custom v-slot="{ navigate, isActive, href }">
  <li @click="navigate" :class="{ active: isActive }">...</li>
</router-link>
```

### 命令式:useRouter

```vue
<script setup>
import { useRouter } from 'vue-router';

const router = useRouter();

router.push('/about');
router.push({ name: 'user', params: { id: 42 } });
router.replace('/login');         // 替换
router.back();
router.forward();
router.go(-2);
</script>
```

类比 React Router 的 `useNavigate`(回顾 06)。

---

## 七、嵌套路由

```ts
const routes = [
  {
    path: '/dashboard',
    component: DashboardLayout,
    children: [
      { path: '', component: DashboardHome },         // /dashboard
      { path: 'users', component: UserList },         // /dashboard/users
      { path: 'users/:id', component: UserDetail },   // /dashboard/users/:id
    ],
  },
];
```

```vue
<!-- DashboardLayout.vue -->
<template>
  <div class="dashboard">
    <Sidebar />
    <main>
      <router-view />     <!-- 子路由在这渲染 -->
    </main>
  </div>
</template>
```

类比 React Router 的 `<Outlet />`、Flutter ShellRoute。

### 多层嵌套

```ts
{
  path: '/dashboard',
  component: DashboardLayout,
  children: [
    {
      path: 'users',
      component: UsersLayout,
      children: [
        { path: '', component: UserList },
        { path: ':id', component: UserDetail },
      ],
    },
  ],
}
```

每一层 `<router-view />` 渲染对应层级。

---

## 八、命名路由

```ts
{ path: '/user/:id', name: 'user', component: User }

router.push({ name: 'user', params: { id: 42 } });

<router-link :to="{ name: 'user', params: { id: 42 } }">
```

适合复杂路径不想拼字符串。

---

## 九、命名视图(多个 router-view)

```ts
{
  path: '/dashboard',
  components: {
    default: MainContent,
    sidebar: Sidebar,
    header: Header,
  },
}
```

```vue
<router-view name="header" />
<router-view name="sidebar" />
<router-view />     <!-- default -->
```

布局复杂时用,但一般用嵌套路由 + slot 替代。

---

## 十、懒加载(Code Splitting)

```ts
const routes = [
  {
    path: '/dashboard',
    component: () => import('@/views/Dashboard.vue'),
  },
];
```

Vite 自动分包,**进对应路由才下载**。
回顾 06、09:大型项目必加。

### 命名 chunk

```ts
component: () => import(/* webpackChunkName: "dashboard" */ '@/views/Dashboard.vue')
```

让打包后文件名可读。

---

## 十一、路由守卫(Guards)

### 全局前置守卫

```ts
router.beforeEach((to, from, next) => {
  if (to.meta.requiresAuth && !isLoggedIn()) {
    next('/login');
  } else {
    next();          // 必须 next!不然永远不进
  }
});

// Vue Router 4 也支持返回值
router.beforeEach((to, from) => {
  if (to.meta.requiresAuth && !isLoggedIn()) {
    return { name: 'login' };
  }
  // 返回 false / undefined / true 也行
});
```

### 全局解析守卫

```ts
router.beforeResolve(async (to) => {
  // 在所有组件内的 beforeRouteEnter 之后,导航被确认前
  if (to.meta.requiresPermissions) {
    await fetchPermissions();
  }
});
```

### 全局后置钩子

```ts
router.afterEach((to, from) => {
  // 不能改变导航
  document.title = to.meta.title ?? 'MyApp';
  trackPageView(to.path);
});
```

### 路由独享守卫

```ts
{
  path: '/admin',
  beforeEnter: (to, from) => {
    if (!isAdmin()) return '/login';
  },
}
```

### 组件内守卫

```vue
<script setup>
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router';

onBeforeRouteLeave((to, from) => {
  if (hasUnsavedChanges) {
    return confirm('确定离开?');
  }
});

onBeforeRouteUpdate((to, from) => {
  // 同一路由组件,只是 params 变(/user/1 → /user/2)
  await refetch(to.params.id);
});
</script>
```

---

## 十二、路由元信息(meta)

```ts
{
  path: '/dashboard',
  component: Dashboard,
  meta: {
    requiresAuth: true,
    title: '仪表盘',
    layout: 'admin',
    permissions: ['view-dashboard'],
  },
}
```

```ts
router.beforeEach((to) => {
  if (to.meta.requiresAuth && !isLoggedIn()) return '/login';
  document.title = to.meta.title ?? 'MyApp';
});
```

类比 Flutter go_router 的 redirect / Hook 写法。

### 类型化 meta

```ts
// router.d.ts
import 'vue-router';

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean;
    title?: string;
    permissions?: string[];
  }
}
```

---

## 十三、动态路由(运行时添加)

```ts
router.addRoute({ path: '/dynamic', component: DynamicPage });
router.removeRoute('routeName');

// 嵌套
router.addRoute('parent', { path: 'child', component: Child });
```

适合权限系统:**用户登录后根据权限动态加路由**。

---

## 十四、滚动行为

```ts
const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition;       // 浏览器 back/forward 恢复
    if (to.hash) return { el: to.hash, behavior: 'smooth' };  // 锚点
    return { top: 0 };
  },
});
```

### 等待异步内容渲染完再滚

```ts
scrollBehavior(to) {
  if (to.hash) {
    return new Promise(resolve => {
      setTimeout(() => resolve({ el: to.hash, behavior: 'smooth' }), 500);
    });
  }
}
```

---

## 十五、过渡动画

```vue
<!-- App.vue -->
<router-view v-slot="{ Component }">
  <transition name="fade" mode="out-in">
    <component :is="Component" />
  </transition>
</router-view>

<style>
.fade-enter-active, .fade-leave-active {
  transition: opacity .3s;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
```

也可以根据路由 meta 切换不同动画。

---

## 十六、KeepAlive 保留 State

```vue
<router-view v-slot="{ Component }">
  <keep-alive>
    <component :is="Component" />
  </keep-alive>
</router-view>
```

切到别的路由再回来,组件 state 保留(类似 Flutter PageView 的 keepAlive)。

### 部分缓存

```vue
<keep-alive :include="['UserList', 'PostList']">
  ...
</keep-alive>

<keep-alive :exclude="['Login']">
  ...
</keep-alive>
```

---

## 十七、props 模式(参数自动传给组件)

```ts
{ path: '/user/:id', component: User, props: true }
```

```vue
<!-- User.vue -->
<script setup>
const props = defineProps<{ id: string }>();
console.log(props.id);
</script>
```

`route.params.id` 自动作为 prop 传入。**组件解耦路由**,可以脱离路由用 / 测试方便。

### 函数模式

```ts
{
  path: '/search',
  component: Search,
  props: route => ({ query: route.query.q }),
}
```

### 对象模式

```ts
{ path: '/static', component: Static, props: { default: 'value' } }
```

---

## 十八、useRoute / useRouter

```vue
<script setup>
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();      // 当前路由(响应式)
const router = useRouter();    // 路由器实例

route.path           // 当前路径
route.params         // 路径参数
route.query          // query
route.hash           // #fragment
route.name           // 命名路由
route.meta           // 元信息
route.fullPath       // 完整路径

router.push(...)
router.replace(...)
router.go(-1)
</script>
```

`route` 是响应式的,**watch 它会跟着路由变化**:

```ts
watch(() => route.params.id, (newId) => {
  refetch(newId);
});
```

---

## 十九、模态框路由(URL 即模态框)

跟 React Router 思路一致:

```ts
{
  path: '/photos',
  component: PhotoGallery,
  children: [
    {
      path: ':id',
      component: PhotoModal,    // /photos/42 → 模态框
    },
  ],
}
```

```vue
<!-- PhotoGallery.vue -->
<template>
  <Grid />
  <router-view />     <!-- 模态在这渲染 -->
</template>
```

---

## 二十、完整鉴权流程

```ts
// router/index.ts
import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: () => import('@/views/Login.vue') },
    {
      path: '/',
      component: () => import('@/views/Layout.vue'),
      meta: { requiresAuth: true },
      children: [
        { path: '', component: () => import('@/views/Home.vue') },
        { path: 'profile', component: () => import('@/views/Profile.vue') },
      ],
    },
    { path: '/:pathMatch(.*)*', component: () => import('@/views/NotFound.vue') },
  ],
});

router.beforeEach((to) => {
  const auth = useAuthStore();

  if (to.meta.requiresAuth && !auth.isLoggedIn) {
    return { path: '/login', query: { redirect: to.fullPath } };
  }

  if (to.path === '/login' && auth.isLoggedIn) {
    return '/';
  }
});

export default router;
```

```vue
<!-- Login.vue -->
<script setup>
import { useAuthStore } from '@/stores/auth';
import { useRouter, useRoute } from 'vue-router';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

async function login(email: string, pwd: string) {
  await auth.login(email, pwd);
  const redirect = (route.query.redirect as string) ?? '/';
  router.replace(redirect);
}
</script>
```

类似 Flutter go_router 的 redirect + Pinia 配合。

---

## 二十一、和 React Router 对照

| Vue Router | React Router |
| --- | --- |
| `<router-link to="...">` | `<Link to="...">` |
| `<router-view />` | `<Outlet />` |
| `useRouter() / router.push` | `useNavigate() / navigate` |
| `useRoute()` | `useLocation() / useParams() / useSearchParams()` |
| `beforeEach` 全局守卫 | loader 抛 redirect |
| `meta.requiresAuth` | 自定义 ProtectedRoute / loader |
| `KeepAlive` | 自己写 / `react-keep-alive` |
| 路由懒加载 | `lazy(() => import(...))` |

**思路相同**,API 风格按各自框架习惯。

---

## 二十二、和 Flutter go_router 对照

| Flutter (go_router) | Vue Router |
| --- | --- |
| `GoRouter(routes:)` | `createRouter({ routes })` |
| `GoRoute(path:)` | `{ path, component }` |
| `state.pathParameters` | `route.params` |
| `state.uri.queryParameters` | `route.query` |
| `context.go(...)` | `router.push(...)` |
| `redirect:` | `beforeEach` |
| `ShellRoute` | 嵌套 routes + `<router-view />` |

---

## 二十三、常见坑

### 1. router-link 不响应

→ 检查 to 字符串拼写,或对象语法是否正确(`name` / `path` 大小写)。

### 2. 守卫里 next() 漏调

```ts
router.beforeEach((to, from, next) => {
  if (...) {
    return;       // ❌ 忘了 next(),永远不前进
  }
  next();
});
```

→ Vue Router 4 推荐用返回值,简洁不易漏:

```ts
router.beforeEach((to) => {
  if (...) return false;      // 取消导航
  // 返回 true / undefined 通过
});
```

### 3. Layout 路由没 router-view

→ 子路由不显示。父级 layout 必须有 `<router-view />`。

### 4. 动态参数 watch 不触发

```ts
watch(route, ...);     // ❌ 整个 route 引用稳定,watch 不触发

watch(() => route.params.id, ...);   // ✅
```

### 5. KeepAlive + 异步组件

→ 配合 `Suspense` 包裹:

```vue
<router-view v-slot="{ Component }">
  <keep-alive>
    <Suspense>
      <component :is="Component" />
    </Suspense>
  </keep-alive>
</router-view>
```

### 6. 服务端没配 fallback

→ 直接访问 `/about` 404。Nginx:

```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

### 7. TypeScript 路径参数没类型

→ 用 `useRoute<{ params: { id: string } }>()` 或自己 cast。

---

## 二十四、推荐组合(Vue 项目)

```
Vue Router 4(基础)
+ 命名路由(避免拼路径)
+ 路由懒加载(大项目必加)
+ meta + 守卫(权限管理)
+ scrollBehavior(用户体验)
+ Pinia 配合(auth 状态)
+ KeepAlive(列表页保留状态)
```

---

## 二十五、心智模型

```
URL = 应用状态的一部分

声明:routes 配置树
读取:useRoute() / route.params / route.query / route.meta
跳转:<router-link to=""> / router.push()
布局:嵌套 + <router-view />
守卫:beforeEach / beforeEnter / 组件内
数据:meta + 自己 fetch / vue-query
缓存:KeepAlive
```

下一篇 17 进 Nuxt——Vue 全栈框架,文件即路由 + SSR + Server API,**类似 Next.js 在 React 的地位**。
