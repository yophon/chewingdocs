# React 路由

SPA(单页应用)只加载一次 HTML,**前端管路由切换**。React 没有官方路由库,生态里两个主流:

| 库 | 特点 |
| --- | --- |
| **React Router**(社区标杆) | 历史悠久,生态最大,推荐 |
| **TanStack Router** | 新秀,类型安全极强,数据 / 路由一体 |

新项目能用 React Router 就用 React Router。需要极致 TS 体验或精细数据加载用 TanStack Router。

---

## 一、React Router 7 起步

React Router 6/7 用 hooks API,简洁现代。

```bash
pnpm add react-router-dom
```

### 最小例子

```tsx
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';

function App() {
  return (
    <BrowserRouter>
      <nav>
        <Link to="/">首页</Link>
        <Link to="/about">关于</Link>
      </nav>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
```

`BrowserRouter` 用 HTML5 history(干净 URL)。
`HashRouter` 用 `#/path`(适合无服务端配置的静态部署)。

类比 Flutter 的 `go_router`(回顾 12),思路完全一样。

---

## 二、路径参数与 Query

### 路径参数

```tsx
<Route path="/user/:id" element={<User />} />

// 组件里读取
import { useParams } from 'react-router-dom';

function User() {
  const { id } = useParams<{ id: string }>();
  return <div>用户 {id}</div>;
}
```

### Query

```tsx
import { useSearchParams } from 'react-router-dom';

function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q');

  return (
    <>
      <input value={q ?? ''} onChange={e => setSearchParams({ q: e.target.value })} />
      <p>搜索:{q}</p>
    </>
  );
}
```

`searchParams` 是只读的 URLSearchParams。
`setSearchParams` 可以传对象 / 函数,会自动同步到 URL。

---

## 三、跳转

### 声明式:Link / NavLink

```tsx
<Link to="/about">关于</Link>
<Link to={`/user/${user.id}`}>查看</Link>

// NavLink 自动加激活样式
<NavLink to="/about" className={({ isActive }) => isActive ? 'active' : ''}>
  关于
</NavLink>
```

### 命令式:useNavigate

```tsx
import { useNavigate } from 'react-router-dom';

function LoginForm() {
  const navigate = useNavigate();

  const onSubmit = async () => {
    await login();
    navigate('/dashboard');
    // navigate('/dashboard', { replace: true });   // 替换栈,不能后退回来
    // navigate(-1);                                 // 后退
    // navigate(1);                                  // 前进
  };
}
```

类比 Flutter `context.go` / `context.push`(回顾 12)。

---

## 四、嵌套路由

### Layout 模式

```tsx
<Routes>
  <Route path="/" element={<RootLayout />}>
    <Route index element={<Home />} />              // path="/"
    <Route path="about" element={<About />} />     // path="/about"
    <Route path="user/:id" element={<User />} />   // path="/user/:id"
  </Route>
</Routes>

// RootLayout
import { Outlet } from 'react-router-dom';

function RootLayout() {
  return (
    <div>
      <Header />
      <main>
        <Outlet />     {/* 子路由在这里渲染 */}
      </main>
      <Footer />
    </div>
  );
}
```

`<Outlet />` 是子路由的占位符,**类似 Flutter 的 ShellRoute**(回顾 12)。

### 多层嵌套

```tsx
<Route path="dashboard" element={<DashboardLayout />}>
  <Route index element={<DashboardHome />} />
  <Route path="users" element={<UserList />}>
    <Route path=":id" element={<UserDetail />} />
  </Route>
</Route>

// 路径会拼接:/dashboard/users/42
```

---

## 五、404 / 兜底

```tsx
<Routes>
  <Route path="/" element={<Home />} />
  <Route path="*" element={<NotFound />} />     {/* 任何没匹配到的 */}
</Routes>
```

---

## 六、配置式路由(推荐 v7)

React Router 7 推荐 `createBrowserRouter` + 配置对象,更接近 TanStack Router / Next.js:

```tsx
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <Home /> },
      { path: 'about', element: <About /> },
      {
        path: 'user/:id',
        element: <User />,
        loader: async ({ params }) => {
          return await fetch(`/api/users/${params.id}`).then(r => r.json());
        },
      },
    ],
  },
]);

function App() {
  return <RouterProvider router={router} />;
}
```

`loader` 是路由进入前自动执行的数据加载。配合 `useLoaderData()` 在组件里读:

```tsx
import { useLoaderData } from 'react-router-dom';

function User() {
  const user = useLoaderData() as User;
  return <h1>{user.name}</h1>;
}
```

跟 Next.js / TanStack Query 思想一致:**数据跟着路由,不是组件加载完才请求**。

---

## 七、表单提交:Action

```tsx
{
  path: 'todo/new',
  element: <NewTodoForm />,
  action: async ({ request }) => {
    const formData = await request.formData();
    await api.createTodo(formData.get('title'));
    return redirect('/todos');
  },
}
```

```tsx
import { Form } from 'react-router-dom';

function NewTodoForm() {
  return (
    <Form method="post">
      <input name="title" />
      <button type="submit">添加</button>
    </Form>
  );
}
```

`<Form>` 是 React Router 的特殊组件,提交后自动调对应路由的 `action`。
**思想类似 Remix**:让浏览器原生表单 + 服务端 action 模式回归。

---

## 八、路由守卫(Guards)

不是单独 API,**用 loader / 高阶组件实现**:

```tsx
// 在 loader 里检查
{
  path: 'admin',
  element: <AdminPage />,
  loader: async () => {
    const user = await getCurrentUser();
    if (!user.isAdmin) throw redirect('/login');
    return user;
  },
}

// 或包一层 ProtectedRoute
function ProtectedRoute({ children }) {
  const user = useUser();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

<Route path="/dashboard" element={
  <ProtectedRoute>
    <Dashboard />
  </ProtectedRoute>
} />
```

类比 Flutter go_router 的 `redirect`(回顾 12)。

---

## 九、错误处理

```tsx
{
  path: '/user/:id',
  element: <User />,
  errorElement: <ErrorPage />,
  loader: async ({ params }) => {
    const r = await fetch(`/api/users/${params.id}`);
    if (!r.ok) throw new Response('用户不存在', { status: 404 });
    return r.json();
  },
}

// ErrorPage
import { useRouteError } from 'react-router-dom';

function ErrorPage() {
  const error = useRouteError();
  if (error instanceof Response) {
    return <p>错误 {error.status}</p>;
  }
  return <p>未知错误</p>;
}
```

任何路由 / loader / action 抛错,自动到最近的 `errorElement`。

---

## 十、滚动行为

页面切换默认不会自动滚到顶部:

```tsx
import { ScrollRestoration } from 'react-router-dom';

function RootLayout() {
  return (
    <>
      <Outlet />
      <ScrollRestoration />     {/* 自动管理滚动恢复 */}
    </>
  );
}
```

或自己写:

```tsx
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  return null;
}
```

---

## 十一、状态保留:返回时记得位置

```tsx
import { useLocation } from 'react-router-dom';

function ListPage() {
  const location = useLocation();
  // location.state 保留前一次的状态
  ...

  return <Link to="/detail/1" state={{ from: location.pathname }}>详情</Link>;
}

function Detail() {
  const { state } = useLocation();
  return <Link to={state?.from ?? '/'}>返回</Link>;
}
```

跨路由传"非 URL 数据"用 state。注意 **刷新会丢**,关键数据放 URL。

---

## 十二、TanStack Router(类型最强)

```bash
pnpm add @tanstack/react-router
pnpm add -D @tanstack/router-plugin     # Vite 插件
```

特点:
- **路由表完全类型化**(链接错路径直接编译报错)
- **搜索参数有类型 + schema 校验**(zod)
- **Loader / 数据获取一体化**

```tsx
import { createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const userRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/user/$id',
  validateSearch: z.object({ tab: z.enum(['info', 'posts']).optional() }),
  loader: ({ params }) => fetchUser(params.id),
  component: UserPage,
});

function UserPage() {
  const { id } = useParams({ from: userRoute.id });
  const { tab } = useSearch({ from: userRoute.id });
  const user = useLoaderData({ from: userRoute.id });
  return ...;
}
```

学习曲线比 React Router 陡,**但极致类型安全**。新项目偏好 TS 极致体验可以试试。

---

## 十三、Code Splitting:按路由懒加载

```tsx
import { lazy, Suspense } from 'react';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Settings = lazy(() => import('./pages/Settings'));

const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <Suspense fallback={<Spinner />}>
        <Outlet />
      </Suspense>
    ),
    children: [
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'settings', element: <Settings /> },
    ],
  },
]);
```

进入路由时才加载对应代码,**大项目首屏速度大幅提升**。Vite 自动分包。

---

## 十四、Modal 路由(URL 即模态框)

```tsx
{
  path: '/photos',
  element: <PhotoGallery />,
  children: [
    {
      path: ':id',
      element: <PhotoModal />,    // /photos/42 → 模态框打开
    },
  ],
}
```

```tsx
function PhotoGallery() {
  return (
    <>
      <Grid />
      <Outlet />        {/* 模态框在这里渲染 */}
    </>
  );
}
```

URL 即状态,刷新 / 分享都能直接进到对应模态。**比单纯组件状态更优雅**。

---

## 十五、Hash Router vs Browser Router

```tsx
import { HashRouter } from 'react-router-dom';

<HashRouter>...</HashRouter>
// URL 长这样: yourapp.com/#/about
```

| 方案 | 优 | 劣 |
| --- | --- | --- |
| BrowserRouter | URL 干净 | 服务端必须配 fallback |
| HashRouter | 无需服务端配置 | 带 # 不好看,SEO 差 |

**有服务端能配 fallback 永远用 BrowserRouter**。静态部署(GitHub Pages)且不能配置时用 Hash。

### 服务端 fallback(Nginx)

```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

任何路径找不到文件,都返回 index.html,让前端路由处理。

---

## 十六、深度链接 / SEO

SPA 默认所有路由是同一个 HTML,**爬虫看不到内容**。

解决方案:
1. **SSR(Next.js / Remix)**:服务端渲染,SEO 友好
2. **预渲染**:打包时生成各路径的 HTML(`vite-plugin-react-ssr` 等)
3. **动态 meta**:用 `react-helmet-async` 改 title / meta

```tsx
import { Helmet } from 'react-helmet-async';

function ProductPage({ product }) {
  return (
    <>
      <Helmet>
        <title>{product.name} - MyApp</title>
        <meta name="description" content={product.summary} />
      </Helmet>
      <ProductDetail product={product} />
    </>
  );
}
```

但 meta 是 JS 设置的,**不一定被爬虫执行**。SEO 重要场景上 Next.js。

---

## 十七、常见坑

### 1. Link 必须在 Router 内

```tsx
<Link to="/x" />     // ❌ 不在 BrowserRouter / RouterProvider 子树里报错
```

### 2. params 是 string

```tsx
const { id } = useParams<{ id: string }>();
const num = Number(id);    // 用之前转
```

URL 参数都是字符串,**业务里用之前转换**。

### 3. NavLink 默认 className 是函数

```tsx
<NavLink to="/" className="nav">                   // ❌ 永远不激活
<NavLink to="/" className={({isActive}) => isActive ? 'active' : 'nav'}>  // ✅
```

### 4. <Form> vs <form>

```tsx
<form action="/x">       // 浏览器原生,会跳整页
<Form action="/x">       // React Router 的,会拦截
```

### 5. 路由顺序

```tsx
<Routes>
  <Route path="/user/new" element={<NewUser />} />        {/* 先 */}
  <Route path="/user/:id" element={<User />} />           {/* 后 */}
</Routes>
```

更具体的路径放前面。React Router v6+ 用智能匹配,但仍建议显式排序。

### 6. SSR / 静态部署 fallback 没配

→ 直接访问 `/about` 报 404。回顾上面 Nginx 配置。

### 7. 在路由 Provider 之外用 useNavigate

```tsx
function Header() {
  const navigate = useNavigate();    // ❌ 在 RouterProvider 之外
}
```

→ 把 Header 放进 layout 内或 BrowserRouter 内。

---

## 十八、状态管理 + 路由的搭配

不要把"当前页"或"筛选条件"放 Zustand,**放 URL**:

```tsx
// ❌ 放 Zustand
const useStore = create(() => ({ filter: 'all' }));

// ✅ 放 URL
const [searchParams, setSearchParams] = useSearchParams();
const filter = searchParams.get('filter') ?? 'all';
```

URL 即真相:刷新不丢、分享链接对方看到的就是你看到的。

---

## 十九、和 Flutter 的对照

| Flutter (go_router) | React Router |
| --- | --- |
| `GoRouter(routes:)` | `createBrowserRouter(...)` |
| `GoRoute(path:)` | `<Route path>` |
| `state.pathParameters` | `useParams()` |
| `state.uri.queryParameters` | `useSearchParams()` |
| `context.go(...)` | `navigate(...)` |
| `context.push(...)` | `navigate(...)` 默认就是 push |
| `redirect:` | loader 里 throw redirect |
| `ShellRoute` | `<Outlet />` |
| `errorBuilder` | `errorElement` |
| `refreshListenable` | 自己 trigger 刷新 |

**思路完全相同**,语法只是换种写法。

---

## 二十、推荐组合

```
中小项目 SPA  → React Router 7 + createBrowserRouter
大型 App     → React Router 7 + lazy + ScrollRestoration
极致 TS      → TanStack Router
SSR / SEO    → Next.js(自带路由,见 10)
全栈表单     → Remix(基于 React Router 的全栈框架)
```

---

## 二十一、心智模型

```
URL = 应用状态的一部分

声明:routes 配置("有哪些页面")
读取:useParams / useSearchParams / useLocation
跳转:Link(声明)/ navigate(命令)
布局:Outlet 嵌套
数据:loader(进入前)/ action(提交)
错误:errorElement
```

**把"哪些状态属于 URL"想清楚是路由设计的核心**。能放 URL 的(当前 Tab、详情 ID、筛选)就放 URL,不要重新发明。

下一篇 07 讲服务端状态——TanStack Query / SWR,把 React 数据获取这一块讲透。
