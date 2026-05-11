# React 数据获取:TanStack Query / SWR

API 数据是一种**特殊的状态**:有 loading / error / cache / refetch / invalidate / pagination / 乐观更新等 11 种特性。Redux / Zustand 把它当普通状态存其实是浪费——**专门工具更简洁**。

两大主流:

| 库 | 特点 |
| --- | --- |
| **TanStack Query**(原 React Query) | 功能最全,API 多但完整 |
| **SWR** | Vercel 出品,API 极简 |

新项目选哪个?**功能少选 SWR,中大型选 TanStack Query**。

---

## 一、为什么不用 useState + useEffect?

```jsx
function User({ id }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch(`/api/users/${id}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) setError(e); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [id]);

  // ...
}
```

每个组件都要这一套。但还差:
- 切到别的页面再回来 → 重新请求(浪费)
- 多个组件请求同一个 URL → 并发(浪费)
- 数据过时怎么自动刷新?
- 网络断了重试?
- 提交后让别处缓存失效?
- 乐观更新?
- 分页 / 无限滚动?

写完 1000 行你才能凑出 TanStack Query。

---

## 二、TanStack Query 起步

```bash
pnpm add @tanstack/react-query
```

### 配置 Client

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,         // 1 分钟内数据视为新鲜,不会重新请求
      gcTime: 5 * 60 * 1000,         // 5 分钟无使用后从缓存清理
      retry: 1,
      refetchOnWindowFocus: false,   // 切回页面是否重新请求
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>,
);
```

### 最小例子

```tsx
import { useQuery } from '@tanstack/react-query';

function User({ id }: { id: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['user', id],
    queryFn: () => fetch(`/api/users/${id}`).then(r => r.json()),
  });

  if (isLoading) return <Spinner />;
  if (error) return <p>错:{error.message}</p>;
  return <h1>{data.name}</h1>;
}
```

类比 Flutter Riverpod 的 `FutureProvider`(回顾 09):**自动 loading / error / data 三态**。

---

## 三、queryKey:缓存的钥匙

```tsx
useQuery({
  queryKey: ['user', id],          // 不同 id → 独立缓存
  queryFn: () => api.getUser(id),
});

useQuery({
  queryKey: ['users', { page, filter }],   // 复杂参数也行
  queryFn: () => api.getUsers(page, filter),
});
```

key 决定缓存:
- 相同 key → 共享缓存
- 不同 key → 独立缓存
- key 变化 → 自动重新请求

> 把 key 看成函数的"参数序列化"。同样的参数返回同样的数据。

---

## 四、数据返回的状态

```tsx
const {
  data,            // 数据
  error,           // 错误
  isLoading,       // 第一次加载
  isFetching,      // 任何时候在请求(包括后台刷新)
  isError,
  isSuccess,
  status,          // 'pending' | 'error' | 'success'
  refetch,         // 手动刷新
  dataUpdatedAt,   // 数据更新时间
} = useQuery({...});
```

**isLoading vs isFetching**:
- `isLoading`:第一次加载(没数据)
- `isFetching`:任何后台请求(可能有旧数据)

```tsx
{isLoading && <Spinner />}
{isFetching && <RefreshIndicator />}
{data && <UserCard user={data} />}
```

---

## 五、突变(Mutation):修改数据

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';

function CreateTodoForm() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (title: string) => api.createTodo(title),
    onSuccess: () => {
      // 创建成功 → 让 todos 列表缓存失效 → 自动重新拉
      queryClient.invalidateQueries({ queryKey: ['todos'] });
    },
  });

  return (
    <form onSubmit={e => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      mutation.mutate(fd.get('title') as string);
    }}>
      <input name="title" />
      <button disabled={mutation.isPending}>
        {mutation.isPending ? '提交中' : '提交'}
      </button>
    </form>
  );
}
```

`mutation.mutate()`:触发请求
`mutation.mutateAsync()`:返回 Promise
`onSuccess / onError / onSettled`:回调

---

## 六、invalidateQueries:让缓存过期

```tsx
queryClient.invalidateQueries({ queryKey: ['todos'] });
// 让所有以 ['todos'] 开头的缓存失效

queryClient.invalidateQueries({ queryKey: ['todos', { filter: 'done' }] });
// 只失效特定 key
```

**这是数据流的关键**:写入操作完成 → 让相关查询失效 → 自动重新拉 → UI 自动更新。

类比 Flutter:Bloc 用事件触发新状态,这里用"失效"触发自动重拉。

---

## 七、乐观更新

```tsx
const mutation = useMutation({
  mutationFn: api.toggleTodo,
  onMutate: async (todoId) => {
    // 1. 取消正在进行的请求
    await queryClient.cancelQueries({ queryKey: ['todos'] });

    // 2. 拿当前数据
    const prev = queryClient.getQueryData<Todo[]>(['todos']);

    // 3. 乐观更新 UI
    queryClient.setQueryData<Todo[]>(['todos'], (old) =>
      old?.map(t => t.id === todoId ? { ...t, done: !t.done } : t)
    );

    return { prev };
  },
  onError: (err, todoId, context) => {
    // 失败,回滚
    queryClient.setQueryData(['todos'], context?.prev);
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['todos'] });
  },
});
```

乐观更新 = "**先改 UI,再发请求,失败回滚**"。点赞、收藏、Toggle 这种小操作必备。

---

## 八、分页与无限滚动

### 分页

```tsx
const { data, isFetching } = useQuery({
  queryKey: ['todos', page],
  queryFn: () => api.getTodos(page),
  placeholderData: (prev) => prev,    // 切页时保留上页数据,避免闪烁
});
```

### 无限滚动:useInfiniteQuery

```tsx
const {
  data,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
} = useInfiniteQuery({
  queryKey: ['feed'],
  queryFn: ({ pageParam }) => api.getFeed(pageParam),
  initialPageParam: 0,
  getNextPageParam: (last, all) => last.nextCursor,
});

return (
  <>
    {data?.pages.map((page, i) => (
      <Fragment key={i}>
        {page.items.map(item => <Item key={item.id} {...item} />)}
      </Fragment>
    ))}
    <button onClick={() => fetchNextPage()} disabled={!hasNextPage || isFetchingNextPage}>
      加载更多
    </button>
  </>
);
```

配合 IntersectionObserver 自动触发:

```tsx
const observerRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (!observerRef.current || !hasNextPage) return;
  const obs = new IntersectionObserver(([e]) => {
    if (e.isIntersecting) fetchNextPage();
  });
  obs.observe(observerRef.current);
  return () => obs.disconnect();
}, [hasNextPage, fetchNextPage]);

return <div ref={observerRef} />;     // 滚到这里自动加载下一页
```

---

## 九、依赖查询(链式)

```tsx
const { data: user } = useQuery({
  queryKey: ['user', userId],
  queryFn: () => api.getUser(userId),
});

const { data: posts } = useQuery({
  queryKey: ['posts', user?.id],
  queryFn: () => api.getPostsByUser(user!.id),
  enabled: !!user,        // 只在 user 加载完才请求
});
```

`enabled: false` 让 query 暂停,直到条件满足。

---

## 十、Prefetching:预加载

```tsx
// 鼠标移到链接上,提前加载
function UserLink({ id }) {
  const queryClient = useQueryClient();
  return (
    <Link
      to={`/user/${id}`}
      onMouseEnter={() => {
        queryClient.prefetchQuery({
          queryKey: ['user', id],
          queryFn: () => api.getUser(id),
        });
      }}
    >
      用户 {id}
    </Link>
  );
}
```

进详情页时数据已经准备好了,**用户感觉极快**。

### 配合路由 loader

```tsx
// 路由 loader 里 prefetch
const router = createBrowserRouter([{
  path: '/user/:id',
  loader: ({ params }) => {
    queryClient.ensureQueryData({
      queryKey: ['user', params.id],
      queryFn: () => api.getUser(params.id!),
    });
    return null;
  },
  element: <UserPage />,
}]);
```

---

## 十一、SWR:更轻量

```bash
pnpm add swr
```

```tsx
import useSWR from 'swr';

function User({ id }) {
  const { data, error, isLoading } = useSWR(
    `/api/users/${id}`,
    fetcher,
  );

  if (isLoading) return <Spinner />;
  if (error) return <p>错</p>;
  return <h1>{data.name}</h1>;
}
```

`fetcher` 全局配置:

```tsx
import { SWRConfig } from 'swr';

const fetcher = (url: string) => fetch(url).then(r => r.json());

<SWRConfig value={{ fetcher }}>
  <App />
</SWRConfig>
```

### 突变

```tsx
import useSWR, { mutate } from 'swr';

const updateTodo = async (id, data) => {
  await api.updateTodo(id, data);
  mutate(`/api/todos`);    // 让对应 key 重新请求
};
```

### TanStack Query vs SWR 对比

| 特性 | TanStack Query | SWR |
| --- | --- | --- |
| API 复杂度 | 中(很多选项) | 极简 |
| 突变 | useMutation,完整 | mutate,基础 |
| 乐观更新 | 内建 | 手动 |
| 无限滚动 | useInfiniteQuery | 自己组合 |
| DevTools | 强大 | 简单 |
| 包大小 | 较大 | 小 |

简单需求选 SWR,**复杂业务选 TanStack Query**。

---

## 十二、TanStack Query DevTools

```tsx
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

<QueryClientProvider client={queryClient}>
  <App />
  <ReactQueryDevtools initialIsOpen={false} />     {/* 仅 dev 显示 */}
</QueryClientProvider>
```

底部出现一个图标,点开看所有 query 的状态、缓存、refetch、invalidate……必装。

---

## 十三、错误处理

```tsx
const { data, error } = useQuery({
  queryKey: ['user', id],
  queryFn: async () => {
    const r = await fetch(`/api/users/${id}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  },
  retry: 3,                  // 失败重试 3 次
  retryDelay: 1000,
});
```

### 全局 onError

```tsx
import { QueryCache, MutationCache } from '@tanstack/react-query';

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      console.error('Query 失败', error);
      // toast.error(error.message);
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      // toast.error(error.message);
    },
  }),
});
```

任何 query / mutation 失败统一处理,**不必每个组件写一遍**。

---

## 十四、跟 Axios / Dio 一致的封装

回顾 Flutter 13 的 Dio + Repo:同样思路用在 React。

```tsx
// api/client.ts
import axios from 'axios';

export const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      // 跳登录
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);

// api/users.ts
export const userApi = {
  getById: (id: string) => api.get<User>(`/users/${id}`).then(r => r.data),
  list: (page: number) => api.get<User[]>('/users', { params: { page } }).then(r => r.data),
  create: (user: Omit<User, 'id'>) => api.post<User>('/users', user).then(r => r.data),
  delete: (id: string) => api.delete(`/users/${id}`),
};

// 用
useQuery({
  queryKey: ['user', id],
  queryFn: () => userApi.getById(id),
});
```

**API 模块独立**,query 只负责调度。

---

## 十五、自定义 Query Hook

把 query 包成专用 hook,组件代码更干净:

```tsx
// queries/users.ts
export function useUser(id: string) {
  return useQuery({
    queryKey: ['user', id],
    queryFn: () => userApi.getById(id),
  });
}

export function useUsers(page: number) {
  return useQuery({
    queryKey: ['users', page],
    queryFn: () => userApi.list(page),
    placeholderData: (prev) => prev,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: userApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

// 组件
function UserPage({ id }) {
  const { data, isLoading } = useUser(id);
  ...
}
```

类似 Flutter 的 Repository 模式(回顾 21)。**业务逻辑在自定义 hook,组件只关心展示**。

---

## 十六、SSR / Next.js 整合

```tsx
// Next.js App Router 里 prefetch + dehydrate
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';

export default async function Page() {
  const queryClient = new QueryClient();
  await queryClient.prefetchQuery({ queryKey: ['user', '1'], queryFn: ... });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <UserPage />
    </HydrationBoundary>
  );
}
```

数据在服务端预加载,客户端无缝接管。详细见 10 Next.js。

---

## 十七、何时不该用 TanStack Query?

✅ 适合:
- API 数据获取
- 缓存、失效、刷新
- 服务端真相

❌ 不适合:
- 表单状态(用 React Hook Form)
- UI 状态(模态框、Tab)
- 实时双向同步(WebSocket 数据 → Zustand 更合适)
- 客户端纯计算(useMemo)

**TanStack Query = "服务端的状态管理器"**,不是"啥都管"。

---

## 十八、常见坑

### 1. queryKey 不稳定

```tsx
useQuery({
  queryKey: ['users', { page, filter: { status: 'all' } }],
  // ⚠️ 每次渲染对象都是新的!
});
```

→ TanStack Query 会做深比较,但**避免每次创建新对象**。把对象提到组件外或用 useMemo。

### 2. fetch 错误码不抛异常

```tsx
queryFn: () => fetch('/api/users').then(r => r.json())
// ❌ 404 / 500 不会进 error,只 r.ok = false
```

→ 显式抛:

```tsx
queryFn: async () => {
  const r = await fetch('/api/users');
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
```

axios 默认会抛,fetch 不会。

### 3. 失效错 key

```tsx
queryClient.invalidateQueries({ queryKey: ['todos', 1] });  // 只失效 page=1
queryClient.invalidateQueries({ queryKey: ['todos'] });     // 失效所有 todos
```

invalidate 是前缀匹配,**别给具体参数**。

### 4. 在 Provider 之外用 hook

```tsx
function Header() {
  const { data } = useQuery(...);    // ❌ 不在 QueryClientProvider 里
}
```

### 5. 数据不更新

通常是 staleTime 太长,或没 invalidate。打开 DevTools 看缓存状态。

---

## 十九、和 Flutter 的对照

| Flutter (Riverpod) | React (TanStack Query) |
| --- | --- |
| `FutureProvider` | `useQuery` |
| `FutureProvider.family` | `queryKey: [key, param]` |
| `ref.invalidate(provider)` | `queryClient.invalidateQueries` |
| `ref.refresh(provider)` | `refetch()` |
| `AsyncValue.when(loading: ..., data: ...)` | `isLoading / data / error` |
| `Notifier.update` | `useMutation + setQueryData` |
| autoDispose | `gcTime` |

**心智一样**:服务端数据自动管理生命周期,UI 用 selector 订阅。

---

## 二十、推荐组合(2026)

```
中型 React 项目:

axios                 → API 客户端
TanStack Query        → 服务端状态(缓存、refetch、mutation)
Zustand               → 客户端状态(全局 UI / Auth)
React Hook Form       → 表单
React Router 7        → 路由
TypeScript            → 类型
Vite                  → 构建
Tailwind              → 样式
Vitest + RTL          → 测试
```

这套是 2026 React 主流栈的甜点配置。

---

## 二十一、心智模型

```
状态分层:
  服务端真相  → TanStack Query(自动缓存 + 失效 + refetch)
  客户端 UI   → Zustand / useState
  表单        → React Hook Form
  URL         → React Router

服务端数据流:
  组件 useQuery(key)
    ↓
  Query Cache(共享、自动管理)
    ↓
  queryFn → API
    ↓
  数据 → 缓存 → 所有用 key 的组件自动 rerender

修改流程:
  useMutation
    ↓
  API 修改成功
    ↓
  invalidate ↔ 自动 refetch ↔ UI 自动更新
```

**一旦把"服务端状态"抽出来用 TanStack Query / SWR 管,React 代码会"瘦"30%**。把它和 Zustand 配合用,你就基本告别"手写 loading / error / cache"的时代。

下一篇 08 讲表单——React 里手感最好的库 React Hook Form。
