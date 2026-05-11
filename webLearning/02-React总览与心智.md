# React 总览与心智

React 是 Facebook 2013 年开源的 UI 库。**它不是框架,是库**——只管渲染 UI,路由、状态管理、数据获取都靠生态。

但实际上,**React + 几个生态库** = 完整的"框架体验"。

---

## 一、React 的核心理念

### UI = f(state)

```jsx
function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

UI 是 state 的纯函数。**state 变,函数重跑,React 把新结果跟旧的对比,改 DOM**。

这是 React 最大的认知:**组件不是对象,是函数**。每次状态变化都重跑这个函数。

---

## 二、和 Flutter 的对应

| Flutter | React |
| --- | --- |
| StatelessWidget | 函数组件(无 state) |
| StatefulWidget + setState | 函数组件 + useState |
| build() 方法 | 函数组件本体 |
| BuildContext | React Context |
| InheritedWidget | Context.Provider |
| ChangeNotifier + Listener | useState / useReducer |
| ValueNotifier | useState(单值) |
| RepaintBoundary | memo / useMemo |
| ListView.builder | 自己用 .map() |
| Hot Reload | HMR(Vite) |

**核心心智完全一样**:声明式 UI + 状态驱动。

差异:
- Flutter 把所有 UI 自己画(Skia 引擎)
- React 输出 DOM(浏览器渲染)
- React 没有"约束系统"那种布局算法,布局靠 CSS

---

## 三、安装与启动一个 React 项目

```bash
# 推荐:Vite(快、轻、现代)
pnpm create vite my-app --template react-ts
cd my-app
pnpm install
pnpm dev
```

新项目都用 Vite,**不要再用 create-react-app**(已停更)。

### 项目结构

```
my-app/
├── index.html              入口 HTML
├── src/
│   ├── main.tsx            React 启动
│   ├── App.tsx             根组件
│   ├── components/
│   ├── hooks/
│   ├── pages/
│   └── assets/
├── public/                 静态资源
├── vite.config.ts          构建配置
├── package.json
└── tsconfig.json
```

### main.tsx 长这样

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

---

## 四、第一个组件

```tsx
// src/Counter.tsx
import { useState } from 'react';

export default function Counter() {
  const [count, setCount] = useState(0);

  return (
    <div>
      <p>当前:{count}</p>
      <button onClick={() => setCount(count + 1)}>+1</button>
    </div>
  );
}

// 使用
import Counter from './Counter';

function App() {
  return <Counter />;
}
```

**几个关键点**:
1. 组件名首字母大写(小写当作普通 HTML 标签)
2. 返回 JSX(类似 HTML 但是 JS 表达式)
3. 用 `useState` 管理状态
4. 事件用驼峰:`onClick`,不是 `onclick`

---

## 五、JSX 是什么

```jsx
const el = <h1 className="title">Hello</h1>;

// 等价于
const el = React.createElement('h1', { className: 'title' }, 'Hello');
```

JSX 只是**语法糖**,编译后变成函数调用。

跟 HTML 的几个区别:

| HTML | JSX |
| --- | --- |
| `class="x"` | `className="x"` |
| `for="x"` | `htmlFor="x"` |
| `onclick="..."` | `onClick={fn}` |
| `style="color:red"` | `style={{ color: 'red' }}` |
| `<input />`(可选闭合) | `<input />`(必须闭合) |

JSX 详细见 03。

---

## 六、声明式 vs 命令式

### 命令式(jQuery 风)

```js
$('#btn').click(() => {
  const cnt = parseInt($('#cnt').text());
  $('#cnt').text(cnt + 1);
});
```

"做什么":先取数,加一,再写回去。

### 声明式(React 风)

```jsx
<button onClick={() => setCount(count + 1)}>{count}</button>
```

"是什么":这个按钮显示 `count`,点击后 `count + 1`。

**React 做的是把声明翻译成 DOM 操作**。你不再操心 DOM。

---

## 七、组件的两种形态

### 函数组件(2026 年默认)

```jsx
function Greeting({ name }) {
  return <h1>Hi, {name}</h1>;
}
```

### 类组件(老代码会见到,但新项目别写)

```jsx
class Greeting extends React.Component {
  render() {
    return <h1>Hi, {this.props.name}</h1>;
  }
}
```

**Hooks 出现后,函数组件能做所有事,类组件几乎没用了**。看老代码时认识就好。

---

## 八、Props:父传子

```jsx
// 父
<UserCard name="张三" age={20} onClick={() => alert('hi')} />

// 子(TypeScript)
type Props = {
  name: string;
  age: number;
  onClick: () => void;
};

function UserCard({ name, age, onClick }: Props) {
  return (
    <div onClick={onClick}>
      <p>{name}({age})</p>
    </div>
  );
}
```

类比 Flutter:就是 Widget 构造参数。

### children 特殊 prop

```jsx
function Card({ children }) {
  return <div className="card">{children}</div>;
}

// 用
<Card>
  <h1>标题</h1>
  <p>内容</p>
</Card>
```

`children` 是父级标签里的内容。Flutter 里类似 `child` / `children`。

---

## 九、State:组件自己的可变数据

```jsx
const [count, setCount] = useState(0);

setCount(1);              // 直接设
setCount(c => c + 1);     // 函数式更新(基于旧值)
```

**调 setCount 后,组件函数会被重跑**。新的 `count` 进入 state,UI 更新。

⚠️ 不要直接改 state:

```jsx
const [list, setList] = useState([1, 2]);

list.push(3);              // ❌ React 不知道你改了
setList([...list, 3]);     // ✅ 创建新数组
```

state **必须不可变**。这是 React 的"潜规则",违反它你会得到诡异的 bug。

类比:回顾 Flutter Riverpod(09)的 `state = newState`,完全一样。

---

## 十、生命周期(在 Hooks 里)

```jsx
import { useState, useEffect } from 'react';

function User({ id }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    // 类似 Flutter 的 initState + didChangeDependencies
    fetch(`/api/users/${id}`).then(r => r.json()).then(setUser);

    return () => {
      // 类似 dispose
      console.log('清理');
    };
  }, [id]);    // id 变就重跑,类似 didUpdateWidget

  if (!user) return <p>加载中...</p>;
  return <h1>{user.name}</h1>;
}
```

详细见 04 Hooks。

---

## 十一、为什么 React 这么火

### 1. 声明式
代码描述"是什么",不是"怎么做"。可读性高。

### 2. 组件化
UI 拆成可复用组件,跟 Flutter 一样,跟搭积木似的。

### 3. JSX
**HTML 即 JS**。模板和逻辑写一起,IDE 补全/重构都方便。

### 4. 单向数据流
父传子用 props,子改父用回调。状态来源清晰。

### 5. 生态最大
任何需求都能找到包。npm 上 80% 的前端包跟 React 兼容。

### 6. React Native
**同一套思维写 iOS / Android App**。Web 程序员低成本进移动端。

---

## 十二、React 的"难处"

诚实讲,React 不完美:

### 1. Hooks 顺序敏感
```jsx
if (cond) {
  const [x, setX] = useState(0);    // ❌ 不能在条件里
}
```

Hooks 必须**每次渲染都按相同顺序**调用。这是函数组件 + 闭包的代价。

### 2. 闭包陷阱
```jsx
function Demo() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    setInterval(() => setCount(count + 1), 1000);
    // ⚠️ count 永远是 0!闭包捕获了初始值
  }, []);
}
```

捕获旧值是 React 最大的坑,详细见 04。

### 3. rerender 频繁
状态变 → 组件函数从头跑一遍 → 子组件也跟着跑。**性能要主动优化**。

### 4. 心智成本
- 什么时候用 useEffect?
- 什么时候 memo?
- Server / Client 组件区分?

每个都不难,**但加起来 → 学习曲线陡**。

### 5. Server / Client 分裂(2024+)

React 19 + Next.js 13+ 引入 **Server Components**,跟传统组件**两套心智模型并存**。新人会懵。

---

## 十三、React 的版本节点

| 版本 | 特性 |
| --- | --- |
| 16 | Fiber 架构 |
| 16.8 | **Hooks**(2019,革命) |
| 17 | 平台升级 |
| 18 | **Concurrent Features**(2022)|
| 19 | **Server Components**、Actions、`use` |

**新项目直接 React 19 + Vite + TS + Next.js 14+**。

---

## 十四、生态地图

```
React 本身
  ├─ 路由       :React Router 7 / TanStack Router
  ├─ 状态       :useState / Context / Zustand / Redux Toolkit / Jotai
  ├─ 数据获取    :TanStack Query / SWR
  ├─ 表单       :React Hook Form
  ├─ 样式       :Tailwind / CSS Modules / styled-components
  ├─ UI 库      :MUI / Chakra / shadcn/ui / Ant Design
  ├─ 测试       :Vitest + React Testing Library / Playwright
  ├─ SSR / 全栈  :Next.js / Remix / Astro
  └─ 移动端     :React Native
```

每一个都会单独在后续讲。

---

## 十五、React 项目的"标配栈"(2026)

```
Vite              开发服务器 / 打包
TypeScript        类型
React 19          UI
Tailwind CSS      样式
React Router 7    路由(SPA)/ 或 Next.js App Router(SSR)
TanStack Query    数据获取
React Hook Form   表单
Zustand           轻量状态(全局)
Vitest + RTL      单测
Playwright        E2E
ESLint + Prettier 代码规范
pnpm              包管理
```

入职任何 React 团队这套都不会错。

---

## 十六、第一周练习建议

1. `pnpm create vite my-todo --template react-ts` 起项目
2. 写一个 Todo App:增 / 删 / 改 / 选中
3. 用 `useState` 管 todos 数组
4. 把 TodoItem 拆成子组件,体会 props 单向传递
5. 加个 LocalStorage 持久化(用 useEffect)
6. 加个过滤器(全部 / 未完成 / 已完成)

写完你就建立了 80% 的 React 直觉。

---

## 十七、心智模型

```
React = "状态驱动,组件即函数,JSX 是 UI 描述"

每次 setState:
  1. 标记当前组件为 dirty
  2. 重跑这个组件函数
  3. 新 JSX 跟旧的 diff
  4. 改最少的 DOM

这意味着:
  - 组件可以频繁重跑(所以函数本体要轻)
  - state 必须不可变(才能 diff)
  - 副作用(订阅、计时器)放 useEffect
```

理解了这一段,后面 Hooks、性能、状态管理都是这个心智的延伸。

接下来 03 讲 JSX 与组件,把"UI 怎么写"展开。
