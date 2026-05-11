# SolidJS Stores、Effects 进阶与 Memos

本篇深入 SolidJS 的状态管理模式:复杂 Store 操作、Effect 进阶、Memo 优化,以及常见的组合模式。

---

## 一、createStore 深入

### 嵌套更新

```jsx
import { createStore, produce, reconcile } from 'solid-js/store';

const [state, setState] = createStore({
  user: {
    profile: {
      name: 'Alice',
      address: { city: 'Beijing' },
    },
  },
  items: [
    { id: 1, name: 'A', done: false },
    { id: 2, name: 'B', done: false },
  ],
});

// 路径更新(推荐,精准更新)
setState('user', 'profile', 'name', 'Bob');
setState('user', 'profile', 'address', 'city', 'Shanghai');

// 对象合并
setState('user', 'profile', prev => ({ ...prev, name: 'Bob' }));

// 数组操作
setState('items', 0, 'done', true);
setState('items', items => [...items, { id: 3, name: 'C', done: false }]);
```

### produce(可变风格更新)

```jsx
setState(produce(s => {
  s.user.profile.name = 'Bob';
  s.items[0].done = true;
  s.items.push({ id: 3, name: 'C', done: false });
  s.items.splice(1, 1);  // 删除第二项
}));
```

`produce` 内部用的是 Immer 类似的方式——看起来在"直接改",实际上生成新的不可变引用。

### reconcile(整体替换,保留响应性)

```jsx
// 从 API 拿到新数据后,用 reconcile 智能合并而不是整体替换
const newItems = await fetchItems();
setState('items', reconcile(newItems));  // 只更新变化的部分
```

直接 `setState('items', newItems)` 会触发整个列表重渲染。`reconcile` 会对比新旧数组,**只更新变化的元素**。

---

## 二、Store 作为全局状态

```jsx
// stores/user.ts
import { createStore } from 'solid-js/store';

export type User = { id: string; name: string; email: string };

const [userState, setUserState] = createStore<{
  user: User | null;
  token: string | null;
  loading: boolean;
}>({
  user: null,
  token: null,
  loading: false,
});

export const userStore = {
  // 只读暴露
  get user() { return userState.user; },
  get isLoggedIn() { return !!userState.user; },
  get token() { return userState.token; },
  get loading() { return userState.loading; },

  // 操作
  async login(email: string, password: string) {
    setUserState('loading', true);
    try {
      const { user, token } = await api.login(email, password);
      setUserState({ user, token, loading: false });
    } catch (e) {
      setUserState('loading', false);
      throw e;
    }
  },

  logout() {
    setUserState({ user: null, token: null });
  },
};
```

```jsx
// 组件里使用
import { userStore } from './stores/user';

function NavBar() {
  return (
    <Show when={userStore.isLoggedIn} fallback={<a href="/login">登录</a>}>
      <span>{userStore.user?.name}</span>
      <button onClick={userStore.logout}>退出</button>
    </Show>
  );
}
```

---

## 三、createEffect 进阶

### 初始化后才运行

```jsx
import { createEffect, on } from 'solid-js';

const [count, setCount] = createSignal(0);

// on 包装:明确指定依赖,且 defer:true 跳过初始执行
createEffect(on(count, (val, prevVal) => {
  console.log(`从 ${prevVal} 变成 ${val}`);
}, { defer: true }));  // 不在挂载时执行
```

### 嵌套 Effect

```jsx
createEffect(() => {
  const userId = selectedUserId();

  // 每次 userId 变,内部 effect 重新创建
  // 旧的内部 effect 自动清理
  createEffect(() => {
    console.log('user detail', userId, someDetail());
  });
});
```

SolidJS 的 effect 会自动管理嵌套 effect 的生命周期——父 effect 重跑时,子 effect 先销毁再重建。

### 防止无限循环

```jsx
// ❌ 无限循环:effect 里写 signal,signal 变触发 effect
const [a, setA] = createSignal(0);
createEffect(() => {
  setA(a() + 1);  // 死循环!
});

// ✅ 用 untrack 打破循环
createEffect(() => {
  const newVal = someComputation();
  untrack(() => setA(newVal));  // 写 a 但不把 a 加入追踪
});
```

---

## 四、createMemo 进阶

### Memo 链

```jsx
const [data, setData] = createSignal<Product[]>([]);
const [filter, setFilter] = createSignal('');
const [sort, setSort] = createSignal<'price' | 'name'>('name');
const [page, setPage] = createSignal(1);

// 级联 Memo:每层只在依赖变化时重算
const filtered = createMemo(() =>
  data().filter(p => p.name.includes(filter()))
);

const sorted = createMemo(() =>
  [...filtered()].sort((a, b) => a[sort()] > b[sort()] ? 1 : -1)
);

const PAGE_SIZE = 20;
const paginated = createMemo(() =>
  sorted().slice((page() - 1) * PAGE_SIZE, page() * PAGE_SIZE)
);
```

filter 变了 → `filtered` 重算 → `sorted` 重算 → `paginated` 重算。
sort 变了 → `filtered` 缓存命中 → `sorted` 重算 → `paginated` 重算。

---

## 五、组件通信

### Props 传递

```jsx
// 子组件
function UserCard(props: { user: User; onSelect: (user: User) => void }) {
  return (
    <div onClick={() => props.onSelect(props.user)}>
      <h3>{props.user.name}</h3>
    </div>
  );
}

// 父组件
function UserList() {
  const [users] = createResource(fetchUsers);
  const [selected, setSelected] = createSignal<User | null>(null);

  return (
    <For each={users()}>
      {user => <UserCard user={user} onSelect={setSelected} />}
    </For>
  );
}
```

### ⚠️ Props 不要解构

```jsx
// ❌ 解构后失去响应性
function BadComp({ name, age }: { name: string; age: number }) {
  return <p>{name} - {age}</p>;  // name/age 是普通值,不响应变化
}

// ✅ 直接用 props
function GoodComp(props: { name: string; age: number }) {
  return <p>{props.name} - {props.age}</p>;
}
```

原理:SolidJS 的 props 是一个 Proxy,访问 `props.name` 时建立响应依赖。解构后拿到的是当时的普通值。

### splitProps(安全分割 props)

```jsx
import { splitProps } from 'solid-js';

function Button(props: { variant: string; disabled?: boolean; children: any; class?: string }) {
  // 安全分割:own 响应式,rest 也响应式
  const [own, rest] = splitProps(props, ['variant', 'disabled', 'children']);

  return (
    <button
      class={`btn btn-${own.variant}`}
      disabled={own.disabled}
      {...rest}   // 传给原生 button
    >
      {own.children}
    </button>
  );
}
```

### mergeProps(带默认值)

```jsx
import { mergeProps } from 'solid-js';

function Alert(props: { type?: string; message: string }) {
  const merged = mergeProps({ type: 'info' }, props);
  return <div class={`alert-${merged.type}`}>{merged.message}</div>;
}
```

---

## 六、ref:访问 DOM

```jsx
function FocusInput() {
  let inputRef!: HTMLInputElement;

  onMount(() => {
    inputRef.focus();
  });

  return <input ref={inputRef} />;
}
```

注意:SolidJS 的 `ref` 是在组件挂载后赋值的普通变量,不是 signal。

---

## 七、生命周期

```jsx
import { onMount, onCleanup, onError } from 'solid-js';

function MyComponent() {
  onMount(() => {
    // DOM 挂载后
    console.log('mounted');
    const sub = someObservable.subscribe(...);
    onCleanup(() => sub.unsubscribe());  // 在 onMount 里清理
  });

  onCleanup(() => {
    // 组件销毁时
    console.log('cleanup');
  });

  onError(err => {
    // 子孙组件的错误会冒泡到这里
    console.error('caught', err);
  });

  return <div>...</div>;
}
```

---

## 八、Suspense 与异步

```jsx
import { Suspense } from 'solid-js';
import { createResource } from 'solid-js';

function UserDetail(props: { id: string }) {
  const [user] = createResource(() => props.id, fetchUser);
  return <h1>{user()?.name}</h1>;
}

function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <UserDetail id="1" />
    </Suspense>
  );
}
```

`createResource` 配合 `<Suspense>` 实现自动 loading 状态——**无需手动管 loading 变量**。

### ErrorBoundary

```jsx
import { ErrorBoundary } from 'solid-js';

function App() {
  return (
    <ErrorBoundary fallback={err => <p>出错了: {err.message}</p>}>
      <UserDetail id="1" />
    </ErrorBoundary>
  );
}
```

---

## 九、典型应用模式

### 搜索

```jsx
function SearchPage() {
  const [query, setQuery] = createSignal('');
  const debouncedQuery = createMemo(() => {
    const q = query();
    return q;
  });

  const [results] = createResource(debouncedQuery, q =>
    q ? fetch(`/api/search?q=${q}`).then(r => r.json()) : []
  );

  return (
    <>
      <input
        value={query()}
        onInput={e => setQuery(e.target.value)}
        placeholder="搜索..."
      />
      <Suspense fallback={<Spinner />}>
        <For each={results()}>
          {item => <ResultItem item={item} />}
        </For>
      </Suspense>
    </>
  );
}
```

### 乐观更新

```jsx
function TodoList() {
  const [todos, { mutate, refetch }] = createResource(fetchTodos);

  const toggleTodo = async (id: string) => {
    // 乐观更新
    mutate(prev => prev?.map(t => t.id === id ? { ...t, done: !t.done } : t));

    try {
      await api.toggleTodo(id);
    } catch {
      refetch();  // 失败回滚
    }
  };

  return (
    <For each={todos()}>
      {todo => (
        <li onClick={() => toggleTodo(todo.id)}
            style={{ 'text-decoration': todo.done ? 'line-through' : 'none' }}>
          {todo.title}
        </li>
      )}
    </For>
  );
}
```

---

## 十、和 Vue/React 的横向对比

```
状态:
  React    useState     → 整个组件重渲染
  Vue      ref/reactive → 组件 render 重跑(VDOM diff)
  Solid    createSignal → 只更新订阅的 DOM 节点

派生:
  React    useMemo      → 组件级缓存
  Vue      computed     → effect 级缓存
  Solid    createMemo   → effect 级缓存,且跨组件

副作用:
  React    useEffect    → 依赖数组,闭包陷阱
  Vue      watchEffect  → 自动追踪,无依赖数组
  Solid    createEffect → 自动追踪,无依赖数组,组件不重跑

数据获取:
  React    TanStack Query / SWR
  Vue      TanStack Query(Vue) / useFetch
  Solid    createResource / TanStack Query(Solid)
```

---

## 十一、心智模型

```
Store vs Signal:
  单值 → createSignal
  对象/数组(需要细粒度路径更新) → createStore

Effect vs Memo:
  有副作用(DOM 操作、网络、日志) → createEffect
  纯派生值(只计算不操作) → createMemo

性能守则:
  不解构 props(用 splitProps/mergeProps)
  列表用 <For>,条件用 <Show>
  需要细粒度更新用 createStore + 路径更新
  跨组件共享:createStore 导出 + store 对象
```

下一篇 28 讲 SolidStart——SolidJS 的全栈框架,类比 Next.js / Nuxt。
