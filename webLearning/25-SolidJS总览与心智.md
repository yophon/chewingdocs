# SolidJS 总览与心智

SolidJS 是一个性能极佳的前端框架。长得像 React,但底层完全不同:**组件只跑一次,Signals 直接驱动 DOM 更新**。

---

## 一、核心心智:组件只跑一次

```jsx
// React:每次状态变化,Counter 函数重跑
function Counter() {
  const [count, setCount] = useState(0);
  console.log('重新渲染');  // 每次点击都打印
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}

// SolidJS:Counter 只跑一次
function Counter() {
  const [count, setCount] = createSignal(0);
  console.log('只打印一次');  // 组件初始化时打印一次,之后不再
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>;
}
```

**这是 SolidJS 最重要的概念**:
- `Counter` 函数在挂载时执行一次
- `createSignal` 创建响应式数据
- `count()` 是 getter,JSX 编译后变成"订阅这个文本节点到 count signal"
- count 变了,**只有那个文本节点更新**,函数不重跑

---

## 二、和四大框架的对比

```
React  : 函数每次重跑 → VDOM diff → 更新 DOM
Vue    : 模板编译 + setup 只跑一次 + VDOM diff(组件粒度)
Angular: 类 + 装饰器 + Zone.js 或 Signals
SolidJS: 函数只跑一次 + Signal 直接绑 DOM 节点(无 VDOM)
```

SolidJS 的性能优势来自:**没有 VDOM**。Signal 变了,直接 `element.textContent = newValue`,跳过 diff 过程。

---

## 三、为什么没有 VDOM 仍然安全

React 用 VDOM 是因为组件函数会重跑,需要 diff 新旧 JSX。

SolidJS 的 JSX 在**编译时**就确定了响应式绑定:

```jsx
// 你写的
const App = () => <div>{count()}</div>;

// 编译后(大致)
const App = () => {
  const div = document.createElement('div');
  const text = document.createTextNode('');
  div.appendChild(text);
  // 建立绑定:count 变了就更新 text
  createEffect(() => { text.data = String(count()); });
  return div;
};
```

**编译时静态分析**替代了运行时 diff,既准确又高效。

---

## 四、Signals 是函数

```jsx
const [count, setCount] = createSignal(0);

// 读:调用函数
console.log(count());    // 0

// 写:调用 setter
setCount(1);
setCount(prev => prev + 1);
```

注意:不是 `count.value`(Vue),也不是 `count`(React state 直接读)。**必须调用 `count()` 才能读**。

这个"必须调用"是有意设计的——让编译器和运行时知道"这里建立了订阅"。

---

## 五、和 React 的 API 对比

| React | SolidJS |
| --- | --- |
| `useState` | `createSignal` |
| `useEffect` | `createEffect` |
| `useMemo` | `createMemo` |
| `useRef` | `createSignal` / `let ref` |
| `useContext` | `useContext` |
| `React.memo` | 不需要(组件不重跑) |
| `useCallback` | 不需要(函数不重建) |
| `useSyncExternalStore` | 不需要 |

SolidJS **没有** `memo`、`useCallback`——因为组件函数只跑一次,这些优化本就不需要。

---

## 六、JSX 但有自己的控制流

SolidJS 的 JSX 不能用普通 JS 的 `if` / `map` 做条件渲染和列表,需要用内置组件:

```jsx
import { Show, For, Switch, Match } from 'solid-js';

// 条件渲染
<Show when={isLoggedIn()} fallback={<a>请登录</a>}>
  <Dashboard />
</Show>

// 列表
<For each={items()} fallback={<p>暂无数据</p>}>
  {(item) => <li>{item.name}</li>}
</For>

// Switch
<Switch fallback={<p>未知状态</p>}>
  <Match when={status() === 'loading'}><Spinner /></Match>
  <Match when={status() === 'error'}><p>出错了</p></Match>
  <Match when={status() === 'success'}><Content /></Match>
</Switch>
```

为什么不能用 `{condition && <Comp />}`?因为 JSX 是**一次性执行的**,`condition` 如果是 signal,必须通过 `Show` 建立响应式绑定才能响应变化。

---

## 七、性能

SolidJS 在主流框架基准测试(js-framework-benchmark)中**长年第一或前三**:

```
js-framework-benchmark(选取):
  Solid        ~1.0x  (接近原生 JS)
  Vue          ~1.3x
  React        ~1.5x
  Angular      ~1.4x
```

生产中差距没这么大——但 Solid 的优势在**复杂 UI + 高频更新**时(实时数据、大量交互)最明显。

---

## 八、生态现状(2026)

| 功能 | 方案 |
| --- | --- |
| 路由 | @solidjs/router |
| 状态管理 | 内置 Store |
| 数据获取 | createResource / TanStack Query (Solid) |
| 表单 | solid-hook-form / modular-forms |
| SSR / 全栈 | SolidStart |
| UI 组件库 | Kobalte / Solid UI(shadcn 风格) |
| 动画 | solid-transition-group |
| 测试 | Vitest + solid-testing-library |

生态比 React/Vue 小,但**核心都覆盖了**。API 质量高,文档清晰。

---

## 九、适合什么项目

✅ 适合:
- 性能敏感的面向用户产品
- 高频更新 UI(实时数据面板、游戏 UI)
- 喜欢 React JSX 风格但不想要 VDOM 开销
- 技术先锋,想理解细粒度响应式

❌ 不适合:
- 需要大型 UI 组件库支持
- 团队对 React/Vue 有大量积累
- 生态需求强(需要很多现成库)

---

## 十、快速上手

```bash
npx degit solidjs/templates/ts my-app
cd my-app && npm install && npm run dev
```

或用 SolidStart(全栈):

```bash
npm create solid@latest
```

---

## 十一、和 Flutter 的对比

| Flutter | SolidJS |
| --- | --- |
| `ValueNotifier` | `createSignal` |
| `ListenableBuilder` | `<Show>` / `<For>` |
| `build()` 重建 | 不存在(函数只跑一次) |
| `Widget` 树 | 真实 DOM 树 |
| `const Widget` 跳过重建 | 不需要(默认就跳过) |
| `StreamBuilder` | `createResource` |

Flutter 的 `build()` 每次重建对应 React 的重跑函数——SolidJS 绕过了这个概念。

---

## 十二、心智模型

```
SolidJS 的三个核心规则:

1. 组件函数只跑一次
   → 不需要 memo/useCallback
   → 不需要担心闭包陷阱

2. Signals 是响应式的原子
   → count() 读 = 建立订阅
   → setCount() 写 = 触发更新

3. JSX 是编译时的绑定声明
   → <Show> / <For> 建立细粒度响应
   → 没有 VDOM,直接更新 DOM

记住:"长得像 React,但不是 React"
```

下一篇 26 讲 Signals 与细粒度响应式——SolidJS 响应式系统的全貌。
