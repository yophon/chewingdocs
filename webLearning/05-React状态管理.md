# React 状态管理:从 useState 到 Zustand / Redux Toolkit

React 自带的 `useState` 适合**单组件状态**。跨组件、全局共享时,要用更专业的方案。

类比 Flutter:回顾 01 状态管理总览,Web 也是同样的演化路径。

---

## 一、状态分类(回顾 Flutter 01)

| 类型 | 例子 | 工具 |
| --- | --- | --- |
| **本地状态** | 输入框、Tab 切换 | `useState` / `useReducer` |
| **跨组件状态** | 主题、用户登录 | Context / Zustand / Redux |
| **服务端状态** | API 数据、缓存 | TanStack Query / SWR(见 07) |
| **URL 状态** | 路由参数、筛选 | React Router(见 06) |
| **表单状态** | 输入校验 | React Hook Form(见 08) |

**先分清楚状态属于哪类,再选工具**。新人最常见的错误:把所有状态都丢全局。

---

## 二、状态管理选项地图

```
本地     → useState / useReducer
跨几层   → 状态提升 + props
跨整个 App → Context / Zustand / Jotai / Redux
服务端    → TanStack Query / SWR(单独讲)
表单     → React Hook Form / Formik
```

---

## 三、状态提升(最朴素也最重要)

```jsx
function Parent() {
  const [count, setCount] = useState(0);

  return (
    <>
      <Display count={count} />
      <Button onClick={() => setCount(c => c + 1)} />
    </>
  );
}
```

把 state 放到两个组件**最近的共同祖先**。永远先想:**这个状态非全局不可吗?能提一两层就够了吗?**

类比 Flutter 的"状态提升"(回顾 02),思路一致。

---

## 四、Context:跨多层共享(原生方案)

### 基本用法

```jsx
import { createContext, useContext, useState } from 'react';

const ThemeContext = createContext<'light' | 'dark'>('light');

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  return (
    <ThemeContext.Provider value={theme}>
      <Page />
      <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}>
        切换
      </button>
    </ThemeContext.Provider>
  );
}

function DeepChild() {
  const theme = useContext(ThemeContext);
  return <div className={theme}>Hi</div>;
}
```

类比 Flutter `InheritedWidget`(回顾 02 / 04)。

### Context 的痛点

```jsx
<UserContext.Provider value={{ user, setUser }}>
```

每次 `value` 引用变化,**所有用了 useContext 的组件都 rerender**。
即使你只用了 `user.name`,改 `user.age` 也触发重建。

→ 大型 App 别把可变 state 直接丢 Context,用 Zustand / Jotai。

### 拆分 Context

把"读"和"写"分开,减少不必要的 rerender:

```jsx
const UserContext = createContext<User | null>(null);
const UserDispatchContext = createContext<((u: User) => void) | null>(null);

function UserProvider({ children }) {
  const [user, setUser] = useState<User | null>(null);
  return (
    <UserContext.Provider value={user}>
      <UserDispatchContext.Provider value={setUser}>
        {children}
      </UserDispatchContext.Provider>
    </UserContext.Provider>
  );
}

// 只读组件订阅 user
const user = useContext(UserContext);

// 只调函数的组件订阅 dispatch
const setUser = useContext(UserDispatchContext);
```

虽然能减少重建,但代码丑。**真要细粒度,直接用 Zustand**。

---

## 五、Zustand:轻量级首选

```bash
pnpm add zustand
```

```typescript
import { create } from 'zustand';

type Counter = {
  count: number;
  increment: () => void;
  reset: () => void;
};

const useCounterStore = create<Counter>((set) => ({
  count: 0,
  increment: () => set(s => ({ count: s.count + 1 })),
  reset: () => set({ count: 0 }),
}));
```

### 使用

```jsx
function CounterDisplay() {
  const count = useCounterStore(s => s.count);     // 只订阅 count
  return <p>{count}</p>;
}

function CounterButton() {
  const increment = useCounterStore(s => s.increment);  // 只订阅函数
  return <button onClick={increment}>+1</button>;
}
```

⭐ **核心**:用 selector(`s => s.count`)只订阅你需要的字段。其他字段变化**不触发当前组件重建**。

类比 Flutter 的 Riverpod / Provider 的 select(回顾 08 / 09)。

### Zustand 的优势

- **不需要 Provider 包裹**(纯 hook,可在任何地方用)
- **TypeScript 友好**,类型自动推断
- **API 极简**(20 行能学会)
- **细粒度订阅**(selector)
- **不依赖 React**(可在 vanilla JS 用)

### 异步 action

```typescript
const useUserStore = create<UserState>((set) => ({
  user: null,
  loading: false,
  error: null,

  loadUser: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const user = await api.getUser(id);
      set({ user, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },
}));
```

### 中间件

```typescript
import { devtools, persist } from 'zustand/middleware';

const useStore = create<State>()(
  devtools(
    persist(
      (set) => ({...}),
      { name: 'my-storage' },     // 自动持久化到 localStorage
    ),
  ),
);
```

`devtools` 让 Redux DevTools 也能调试 Zustand,`persist` 自动存 localStorage。

### 多 Store

```typescript
// stores/auth.ts
export const useAuthStore = create<Auth>(...);

// stores/cart.ts
export const useCartStore = create<Cart>(...);

// 任何地方
const user = useAuthStore(s => s.user);
const items = useCartStore(s => s.items);
```

按业务领域拆分,每个 store 内聚一件事。

---

## 六、Jotai:原子级状态

```bash
pnpm add jotai
```

```typescript
import { atom, useAtom } from 'jotai';

const countAtom = atom(0);
const doubledAtom = atom((get) => get(countAtom) * 2);    // 派生

function Counter() {
  const [count, setCount] = useAtom(countAtom);
  const [doubled] = useAtom(doubledAtom);

  return (
    <>
      <p>{count} → {doubled}</p>
      <button onClick={() => setCount(c => c + 1)}>+</button>
    </>
  );
}
```

特点:
- **原子**(atom)是最小状态单元
- **派生原子**(`(get) => ...`)自动追踪依赖
- 类似 SolidJS / Recoil

适合:状态高度解耦、派生关系复杂的场景。

跟 Zustand 比:Zustand 是"一个 store 含多字段",Jotai 是"无数原子各自存活"。生态选 Zustand 多一些,但 Jotai 在某些场景更优雅。

---

## 七、Redux Toolkit(RTK):企业级老牌

Redux 是 2015 年的"祖宗",RTK 是它的官方现代版,**写起来不再痛苦**。

```bash
pnpm add @reduxjs/toolkit react-redux
```

### 创建 slice

```typescript
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

type CounterState = { value: number };

const counterSlice = createSlice({
  name: 'counter',
  initialState: { value: 0 } as CounterState,
  reducers: {
    increment: (state) => { state.value += 1; },          // ⚠️ 看下面
    incrementBy: (state, action: PayloadAction<number>) => {
      state.value += action.payload;
    },
  },
});

export const { increment, incrementBy } = counterSlice.actions;
export default counterSlice.reducer;
```

⚠️ 注意 `state.value += 1`——**直接改**?这是 RTK 用 Immer 做的"看似可变实际不可变":你写普通 JS,Immer 后台帮你生成新 state。

### Store

```typescript
import { configureStore } from '@reduxjs/toolkit';
import counterReducer from './counterSlice';

export const store = configureStore({
  reducer: {
    counter: counterReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
```

### Provider + Hooks

```jsx
import { Provider } from 'react-redux';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <Provider store={store}>
    <App />
  </Provider>,
);
```

```jsx
import { useSelector, useDispatch } from 'react-redux';

function Counter() {
  const value = useSelector((s: RootState) => s.counter.value);
  const dispatch = useDispatch<AppDispatch>();

  return (
    <button onClick={() => dispatch(increment())}>{value}</button>
  );
}
```

### 异步:createAsyncThunk

```typescript
import { createAsyncThunk } from '@reduxjs/toolkit';

export const loadUser = createAsyncThunk(
  'user/load',
  async (id: string) => {
    return await api.getUser(id);
  },
);

const userSlice = createSlice({
  name: 'user',
  initialState: { data: null, loading: false, error: null },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(loadUser.pending, (state) => { state.loading = true; })
      .addCase(loadUser.fulfilled, (state, action) => {
        state.data = action.payload;
        state.loading = false;
      })
      .addCase(loadUser.rejected, (state, action) => {
        state.error = action.error.message;
        state.loading = false;
      });
  },
});
```

类比 Flutter 的 Bloc(回顾 10):事件 → reducer → 新状态。

### 类型化 hooks

```typescript
// hooks/redux.ts
import { useDispatch, useSelector, TypedUseSelectorHook } from 'react-redux';
import type { RootState, AppDispatch } from './store';

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
```

后面所有组件用 `useAppDispatch / useAppSelector`,自动有类型。

---

## 八、Redux 还该用吗?

```
✅ 已经在用 Redux 的项目:留着,RTK 升级
✅ 大型团队、多人协作、业务复杂(银行 / 政府类)
✅ 需要"时间旅行调试"
❌ 新中小项目:Zustand / Jotai 更轻
❌ 服务端状态:用 TanStack Query 而不是 Redux 缓存 API
```

Redux 的**时间旅行调试**是杀手级功能。你能在 DevTools 里**回退每一个 action**,这是其他方案没有的。

---

## 九、其他选项

### Recoil(Facebook 实验性,基本停更)

```jsx
const countState = atom({ key: 'count', default: 0 });
const [count, setCount] = useRecoilState(countState);
```

API 类似 Jotai,**但已停更,新项目别用**。

### Valtio(基于 Proxy)

```typescript
import { proxy, useSnapshot } from 'valtio';

const state = proxy({ count: 0 });

function Counter() {
  const snap = useSnapshot(state);
  return <button onClick={() => state.count++}>{snap.count}</button>;
}
```

写起来"伪可变",细粒度自动追踪。小众但优雅。

### MobX(还活着,Vue 风格)

```typescript
class Counter {
  count = 0;
  constructor() { makeAutoObservable(this); }
  increment() { this.count++; }
}
```

OOP + 响应式,跟 MobX-React 配合。**新项目少见**,有偏好的人喜欢。

---

## 十、TanStack Query 不算状态管理

很多人把 TanStack Query 跟 Zustand 比,**这是两类东西**:

```
客户端状态(UI、表单、模态框开关)→ Zustand / Redux
服务端状态(API 数据、缓存)→ TanStack Query
```

**API 数据不该塞 Redux**,因为它有"过期、重新获取、轮询、乐观更新"等特殊语义。详细见 07。

---

## 十一、选型决策树

```
小项目 / Demo
  └─ useState + 状态提升

中型项目
  ├─ 跨层共享少 → useState + Context
  └─ 跨层共享多 → Zustand

大型项目
  ├─ 偏函数式 / 原子 → Jotai
  ├─ 偏过程式 / Redux 经验 → Redux Toolkit
  └─ 团队偏好 / 标准化 → Redux Toolkit

服务端数据
  └─ TanStack Query(永远独立)

复杂表单
  └─ React Hook Form(永远独立)
```

实战推荐(2026):

```
Zustand            → 全局客户端状态
TanStack Query     → 服务端状态
React Hook Form    → 表单
React Router       → URL 状态
useState           → 组件本地状态
```

这套组合对中大型项目是甜点。

---

## 十二、常见坑

### 1. 把所有 state 都丢全局

```typescript
// ❌
const useStore = create(() => ({
  modalOpen: false,
  selectedTab: 'home',
  inputValue: '',
  // ...50 个字段
}));
```

→ 让组件失去封装。**先想本地能否解决**。

### 2. Zustand selector 写非纯函数

```jsx
// ❌ 每次创建新对象 → 永远 rerender
const data = useStore(s => ({ a: s.a, b: s.b }));

// ✅ 用 shallow 比较
import { useShallow } from 'zustand/react/shallow';
const { a, b } = useStore(useShallow(s => ({ a: s.a, b: s.b })));

// 或拆开:
const a = useStore(s => s.a);
const b = useStore(s => s.b);
```

### 3. Redux 直接改 state

```typescript
// ❌
reducers: {
  add: (state, action) => {
    return state.list.push(action.payload);    // 不要 push,要新数组
  }
}

// ✅(RTK + Immer)
reducers: {
  add: (state, action) => {
    state.list.push(action.payload);    // RTK 用 Immer,这样合法
  }
}
```

注意:**这是 RTK 的特殊写法**,纯 Redux 必须返回新对象。

### 4. Context 当全局 store

频繁变化的 state 丢 Context → 整个子树重建。**要么拆 Context,要么用 Zustand**。

### 5. 在 Zustand store 里读 React state

```typescript
const useStore = create((set) => ({
  // ❌ store 内部不能用 React hook
  doSomething: () => {
    const params = useParams();
  },
}));
```

→ store 是纯 JS。要用 React 数据,在组件里读了传给 action。

---

## 十三、实战示例:购物车

### Zustand 版

```typescript
type Product = { id: string; name: string; price: number };

type CartState = {
  items: { product: Product; qty: number }[];
  add: (p: Product) => void;
  remove: (id: string) => void;
  total: () => number;
};

export const useCart = create<CartState>((set, get) => ({
  items: [],
  add: (p) => set(s => {
    const existing = s.items.find(i => i.product.id === p.id);
    if (existing) {
      return {
        items: s.items.map(i =>
          i.product.id === p.id ? { ...i, qty: i.qty + 1 } : i
        ),
      };
    }
    return { items: [...s.items, { product: p, qty: 1 }] };
  }),
  remove: (id) => set(s => ({
    items: s.items.filter(i => i.product.id !== id),
  })),
  total: () => get().items.reduce((sum, i) => sum + i.product.price * i.qty, 0),
}));
```

```jsx
function CartButton() {
  const count = useCart(s => s.items.length);
  return <Badge>{count}</Badge>;
}

function CartList() {
  const items = useCart(s => s.items);
  const remove = useCart(s => s.remove);
  return (
    <ul>{items.map(i => (
      <li key={i.product.id}>
        {i.product.name} x{i.qty}
        <button onClick={() => remove(i.product.id)}>×</button>
      </li>
    ))}</ul>
  );
}

function CheckoutBar() {
  const total = useCart(s => s.total());
  return <p>总计:¥{total}</p>;
}
```

注意每个组件**只订阅自己关心的字段**,Cart 改了 items,CheckoutBar 才重建,CartButton 只看 length 也重建,但 CheckoutBar 不会因为别的字段变化而重建。

---

## 十四、和 Flutter 状态管理的对照

| Flutter | React |
| --- | --- |
| `setState` | `useState` |
| `ChangeNotifier + Provider` | `Context + useState` |
| `Riverpod NotifierProvider` | Zustand store |
| `Riverpod 的 .select` | Zustand selector |
| `Bloc` | Redux Toolkit + createAsyncThunk |
| `GetX 的 .obs` | Jotai atom / Valtio proxy |
| Riverpod FutureProvider / StreamProvider | TanStack Query / SWR |

**心智一致**:状态分层、细粒度订阅、副作用与状态分离。

---

## 十五、心智模型

```
状态有边界:
  组件本地  → useState
  跨几个组件 → 状态提升
  跨整 App   → Zustand / Context / Redux
  服务端数据 → TanStack Query

订阅的细粒度决定性能:
  Zustand selector → 字段级
  Jotai atom      → 原子级
  Context         → Provider 级
  Redux           → 字段级(useSelector)
```

**先用 useState,真不够再升级**。永远反思:**这状态非全局不可吗?**

下一篇 06 讲路由,把"页面切换"这一块串起来。
