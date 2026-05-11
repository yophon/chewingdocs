# React 性能与渲染机制

React 默认"够快",但写错容易卡。这一篇把 **renderer 工作原理 + 优化手段** 讲透。
理解原理后,90% 性能问题你能自己定位。

---

## 一、render 是什么

```jsx
function Counter() {
  const [count, setCount] = useState(0);
  console.log('render');
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```

每次 setState → React 调用这个函数 → "render"。

`render` 在 React 语境里 = **执行组件函数,得到 JSX**。**不等于"重新画到屏幕上"**。

完整流程:

```
1. 状态变化(setState / Context 变 / 父级 rerender)
2. React 调度 render(组件函数从头跑)
3. 返回新 JSX
4. React 跟旧 JSX diff(reconciliation)
5. 把变化提交到 DOM(commit)
6. 浏览器 paint
```

**前 4 步在 React 内,只有第 5 步才是真"画 DOM"**。优化的目标:**减少 1~5 的工作量**。

---

## 二、什么会导致 render

| 原因 | 是否触发当前组件 render |
| --- | --- |
| 自己调 setState | ✅ |
| 父级 render | ✅(子级跟着) |
| Context value 变化 | ✅(消费它的所有组件) |
| useReducer dispatch | ✅ |
| props 变化 | ✅(父级 render 时传新 props) |

**关键**:**父级 render → 所有子级默认跟着 render**,不管子级 props 变没变。

```jsx
function Parent() {
  const [count, setCount] = useState(0);
  return (
    <>
      <button onClick={() => setCount(c => c + 1)}>+</button>
      <ExpensiveChild />        {/* 跟着 render,即使没收 props */}
    </>
  );
}
```

这是 React 性能问题的最大来源。

---

## 三、React.memo:跳过不必要的子级 render

```jsx
const ExpensiveChild = React.memo(function ExpensiveChild() {
  console.log('child render');
  return <div>...</div>;
});

// 现在 Parent 加 1,ExpensiveChild 不再 render
```

`memo` 包一层后,React 会**比较新旧 props**(默认浅比较),没变就跳过。

### 自定义比较

```jsx
const Tile = React.memo(
  ({ user }) => <div>{user.name}</div>,
  (prev, next) => prev.user.id === next.user.id,
);
```

### memo 失效的常见情况

```jsx
function Parent() {
  return <Child onClick={() => alert('hi')} />;
  // 每次 Parent render,onClick 都是新函数 → memo 失效
}

// 修复
const handleClick = useCallback(() => alert('hi'), []);
return <Child onClick={handleClick} />;
```

---

## 四、useMemo 和 useCallback

```jsx
const filtered = useMemo(
  () => items.filter(x => x.active),
  [items],
);

const handleClick = useCallback(
  () => doSomething(id),
  [id],
);
```

### 何时用

```
✅ 派生计算昂贵(过滤大列表、排序、复杂聚合)
✅ 派生值 / 函数作为 memo 化子组件的 prop
✅ 作为其他 hook 的依赖(useEffect 依赖一个对象)

❌ 简单数学(a + b)
❌ 简单字符串拼接
❌ "保险起见全包"——每个 useMemo 自己也有开销
```

**默认不优化,profile 后再加**。盲目 useMemo 反而慢。

---

## 五、React DevTools Profiler

Chrome 装 React DevTools,Profiler 面板:

1. 点击录制
2. 操作复现卡顿
3. 停止
4. 看时间轴上每次 render 的:
   - 哪个组件 render 了
   - 耗时多少
   - 为什么 render(state / props / parent / context 变化)
   - 哪些组件被跳过(memo)

**任何性能问题第一步:profiler**,不要拍脑袋优化。

---

## 六、Why Did You Render(可选)

`@welldone-software/why-did-you-render` 包,**自动检测不必要的 render**:

```js
import './wdyr';   // main.tsx 第一行

// wdyr.ts
import React from 'react';
if (process.env.NODE_ENV === 'development') {
  const wdyr = require('@welldone-software/why-did-you-render');
  wdyr(React, { trackAllPureComponents: true });
}
```

控制台会打印每个不必要的 render,精确定位优化点。

---

## 七、列表性能

```jsx
{items.map(item => <Card key={item.id} {...item} />)}
```

**关键**:
1. **Key 用稳定 id**(回顾 03、Flutter 07)
2. **Card 用 React.memo**,只在自己 props 变时 render
3. **大列表用虚拟化**

### 虚拟化

10000 行的列表全渲染会卡。只渲染**屏幕可见的几十行**:

```bash
pnpm add @tanstack/react-virtual
```

```tsx
import { useVirtualizer } from '@tanstack/react-virtual';

function BigList({ items }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50,
  });

  return (
    <div ref={parentRef} style={{ height: 600, overflow: 'auto' }}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map(v => (
          <div
            key={v.key}
            style={{
              position: 'absolute',
              top: 0,
              transform: `translateY(${v.start}px)`,
              height: v.size,
              width: '100%',
            }}
          >
            {items[v.index].name}
          </div>
        ))}
      </div>
    </div>
  );
}
```

类比 Flutter ListView.builder(回顾 18 / 32)。React 没自带,**用社区库**。

---

## 八、状态局部化(state colocation)

```jsx
// ❌ 状态放父级,父级和所有子级都重渲染
function Page() {
  const [openModal, setOpenModal] = useState(false);
  return (
    <>
      <ModalButton onClick={() => setOpenModal(true)} />
      <BigContent />            {/* 跟 modal 没关系也 rerender */}
      {openModal && <Modal onClose={() => setOpenModal(false)} />}
    </>
  );
}

// ✅ 提取成单独组件
function Page() {
  return (
    <>
      <ModalSection />
      <BigContent />
    </>
  );
}

function ModalSection() {
  const [openModal, setOpenModal] = useState(false);
  ...
}
```

**state 放在最低必要层级**,影响最小化。

---

## 九、拆分 Context

频繁变化的 Context value 让所有消费者重渲染:

```jsx
const AppContext = createContext({ user, setUser, theme, setTheme });
// theme 变 → 所有用了 user 的也 rerender
```

### 拆分

```jsx
const UserContext = createContext(null);
const ThemeContext = createContext('light');
```

或用 Zustand,**字段级订阅**(回顾 05)。

---

## 十、useTransition 和 useDeferredValue

把"不重要的更新"标记为低优先级:

```jsx
const [isPending, startTransition] = useTransition();

const handleSearch = (q) => {
  setQuery(q);                       // 高优,立刻更新输入框
  startTransition(() => {
    setResults(slowFilter(q));       // 低优,可被打断
  });
};
```

或:

```jsx
const deferredQuery = useDeferredValue(query);
return <SlowList q={deferredQuery} />;
```

类比 Flutter 的 isolate(回顾 37):重活让出 UI 线程。但 `useTransition` 仍然在主线程,**只是调度优先级低**。

---

## 十一、代码分割(Code Splitting)

首屏只加载必要的代码,其他懒加载:

```jsx
import { lazy, Suspense } from 'react';

const Dashboard = lazy(() => import('./Dashboard'));

<Suspense fallback={<Spinner />}>
  <Dashboard />
</Suspense>
```

Vite / webpack 看到 `import()` 会自动分包。访问对应路由 / 按钮触发时才下载 JS。

回顾 06:路由级别懒加载是最常见用法。

---

## 十二、图片优化

```jsx
<img src={url} loading="lazy" decoding="async" />

// 现代格式
<picture>
  <source srcSet="image.avif" type="image/avif" />
  <source srcSet="image.webp" type="image/webp" />
  <img src="image.jpg" alt="..." />
</picture>

// 响应式
<img
  src="small.jpg"
  srcSet="small.jpg 1x, large.jpg 2x"
  alt="..."
/>
```

Next.js 的 `<Image />` 自动做这些(见 10)。

---

## 十三、不要在 render 期间做副作用

```jsx
function Bad({ user }) {
  fetch('/api/log', { method: 'POST', body: user.id });   // ❌ 每次 render 都发
  return <div>{user.name}</div>;
}

// ✅
useEffect(() => {
  fetch('/api/log', { method: 'POST', body: user.id });
}, [user.id]);
```

**render 必须是纯函数**,跟 Flutter build 一样(回顾 06)。

---

## 十四、避免在 JSX 里创建对象 / 函数

```jsx
// ❌ 每次 render 都新对象,memo 化的子级失效
<Child style={{ color: 'red' }} options={{ a: 1 }} onClick={() => x()} />

// ✅
const style = { color: 'red' };
const options = { a: 1 };
const handleClick = useCallback(() => x(), []);
<Child style={style} options={options} onClick={handleClick} />
```

或把对象提到组件外面(只创建一次)。

---

## 十五、Concurrent Features(React 18+)

### 自动批处理

```jsx
function handleClick() {
  setA(1);
  setB(2);
  setC(3);
}
// React 18 自动一次 render,React 17 是三次
```

### Suspense 支持

```jsx
<Suspense fallback={<Spinner />}>
  <SlowComponent />
</Suspense>
```

`SlowComponent` 加载数据时,Suspense 显示 fallback。React 19 + `use(promise)` 让这变得自然。

---

## 十六、Server Components(React 19)

```jsx
// 服务端组件(默认)
async function UserPage({ id }) {
  const user = await db.users.findOne({ id });    // 直接连数据库!
  return <h1>{user.name}</h1>;
}

// 客户端组件
'use client';

function ClickCounter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```

服务端组件:**只在服务端跑,直接连数据库 / 文件系统**。客户端拿到的是 HTML 片段,**不需要 hydrate 这部分**,bundle 大小骤降。

详细见 10 Next.js。

---

## 十七、Bundle 分析

### Vite

```bash
pnpm add -D rollup-plugin-visualizer
```

`vite.config.ts`:

```ts
import { visualizer } from 'rollup-plugin-visualizer';

export default {
  plugins: [
    visualizer({ open: true, filename: 'stats.html' }),
  ],
};
```

`pnpm build` 后打开 `stats.html`,看每个 chunk 大小、谁最重、有没有重复包。

### 常见优化

```
├─ moment.js  (200KB) → 用 dayjs / date-fns
├─ lodash       → 用 lodash-es + tree-shaking,或 lodash.cloneDeep 单独引入
├─ icon 库      → 只导入用到的图标(react-icons / lucide-react 都支持 tree-shake)
└─ 重复 react   → pnpm-workspace 配 root react
```

---

## 十八、Web Vitals 指标

| 指标 | 含义 | 目标 |
| --- | --- | --- |
| **LCP** | 首屏最大内容渲染 | < 2.5s |
| **FID / INP** | 交互响应延迟 | < 200ms |
| **CLS** | 布局抖动 | < 0.1 |
| **TTFB** | 首字节时间 | < 800ms |
| **FCP** | 首次内容绘制 | < 1.8s |

```bash
pnpm add web-vitals
```

```ts
import { onCLS, onINP, onLCP } from 'web-vitals';

onLCP(console.log);
onINP(console.log);
onCLS(console.log);
```

接入 Sentry / Datadog 的 RUM 监控真实用户性能。

---

## 十九、常见性能问题排查清单

```
1. 打开 React DevTools Profiler,记录卡顿
2. 看哪个组件 render 太多 / 太慢
3. 检查 props 是否引用稳定(对象 / 函数)
4. 加 React.memo / useMemo / useCallback
5. 检查列表 key,大列表上虚拟化
6. 检查 Context 是否过度共享
7. 服务端数据用 TanStack Query 自动缓存
8. 路由级懒加载
9. 图片懒加载 + 现代格式
10. bundle analyzer 看哪些包过大
```

---

## 二十、不要犯的错

### 1. 一开始就过度优化

```jsx
// ❌ 写每一行就 useMemo / useCallback
```

→ 先正确写,再 profiler 找瓶颈。React 默认很快。

### 2. 把 useMemo 当作"防止重新计算"

```jsx
// useMemo 不是"缓存数据",依赖变了一样重算
useMemo(() => ..., [data]);
```

→ 缓存结果跨 render 用 `useState` + 自己控制刷新,或用 TanStack Query。

### 3. 把所有状态丢全局

→ Context / Redux 频繁变化让全局重渲染。回顾 05。

### 4. ListView 没虚拟化

→ 100+ 项就考虑虚拟化。

### 5. 在 useEffect 里 setState 形成循环

```jsx
useEffect(() => {
  setX(1);                  // ❌ 触发 rerender,effect 又跑
});
```

→ 加依赖数组 + 条件。

### 6. 在 render 里订阅 / 创建昂贵对象

```jsx
function Bad() {
  const ws = new WebSocket(...);    // ❌ 每次 render 新建
}

// ✅
const wsRef = useRef<WebSocket>();
useEffect(() => {
  wsRef.current = new WebSocket(...);
  return () => wsRef.current?.close();
}, []);
```

---

## 二十一、和 Flutter 性能对照

| Flutter (回顾 18) | React |
| --- | --- |
| `const Widget` | `React.memo` + 静态对象 |
| `RepaintBoundary` | `React.memo` 隔离子树 |
| `ListView.builder` | `@tanstack/react-virtual` |
| `Selector / context.select` | Zustand selector / Jotai atom |
| Profile 模式 + DevTools | React DevTools Profiler |
| Isolate(重活) | useTransition / Web Worker |
| 图片 cacheWidth | `<img loading="lazy" />` + 服务端 |

**心智一样**:**测量 → 找瓶颈 → 针对性优化**,绝不"凭感觉"。

---

## 二十二、心智模型

```
React 默认很快,但
  - 父 render → 子默认跟着 render
  - props 引用变化 → memo 失效
  - Context value 变 → 所有消费者 rerender

优化三件套:
  React.memo       → 子组件
  useMemo          → 派生值
  useCallback      → 函数引用稳定

但更高级的优化:
  - 状态局部化(state colocation)
  - 拆分 Context
  - 服务端数据用 TanStack Query
  - 列表虚拟化
  - 路由懒加载
  - Server Components(React 19)

性能优化的金科玉律:
  Profile first, optimize later.
```

下一篇 10 讲 Next.js——React 全栈框架,SSR / SSG / Server Components 全套。
