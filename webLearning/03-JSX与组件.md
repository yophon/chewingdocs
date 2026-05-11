# JSX 与组件

JSX 是 React 写 UI 的方式,本质是 JS 表达式。组件是 React 的复用单元。这一篇把"怎么用 JSX 拼 UI"全套讲清。

---

## 一、JSX 本质

```jsx
const el = <h1 className="title">Hello</h1>;
```

编译后:

```js
const el = React.createElement('h1', { className: 'title' }, 'Hello');
// React 19 + 新 transform:
const el = jsx('h1', { className: 'title', children: 'Hello' });
```

JSX 是**对象构造**,不是 HTML 字符串。**编译时**(Babel / SWC)被转换。

---

## 二、JSX 表达式(`{}`)

`{}` 内是任意 JS 表达式:

```jsx
const name = '张三';
const user = { age: 20 };
const items = ['a', 'b'];

<div>
  <h1>{name}</h1>                              // 变量
  <p>{user.age + 1}</p>                        // 表达式
  <p>{name === '张三' ? '主角' : '其他'}</p>   // 三元
  <ul>{items.map(x => <li key={x}>{x}</li>)}</ul>   // map 渲染列表
</div>
```

**只能放表达式,不能放语句**(if、for、let)。

```jsx
<div>{if (x) ...}</div>            // ❌ 不行
<div>{x && <p>显示</p>}</div>      // ✅ 短路求值
<div>{x ? <A /> : <B />}</div>     // ✅ 三元
```

---

## 三、属性语法

```jsx
<button
  className="primary"                // 类
  id="submit"                        // id
  type="submit"                      // 普通
  disabled                           // 布尔 true
  data-id="42"                       // data-*
  aria-label="提交"                   // aria-*
  onClick={handleClick}              // 事件
  style={{ color: 'red', fontSize: 16 }}    // 内联样式(对象)
>
  确定
</button>
```

注意:
- 多数属性**驼峰**:`onClick`、`tabIndex`、`htmlFor`
- 例外:`data-*`、`aria-*` 保留中划线
- `class` → `className`(因为 JS 里 class 是关键字)
- `for` → `htmlFor`

---

## 四、条件渲染

### 三元

```jsx
{loading ? <Spinner /> : <Content />}
```

### 短路 `&&`

```jsx
{user && <Greeting name={user.name} />}
```

⚠️ **数字 0 陷阱**:

```jsx
{items.length && <List items={items} />}
// items 长度为 0 时,渲染出 "0" 而不是什么都没!
```

→ 用三元或 `Boolean()`:

```jsx
{items.length > 0 && <List items={items} />}
{Boolean(items.length) && <List items={items} />}
```

### 提前 return

```jsx
function Page({ loading, user }) {
  if (loading) return <Spinner />;
  if (!user) return <Login />;
  return <Profile user={user} />;
}
```

复杂条件用 early return,可读性最好。

---

## 五、列表渲染

```jsx
{users.map(user => <UserCard key={user.id} user={user} />)}
```

### key 是必须的

```jsx
{items.map(item => <li key={item.id}>{item.name}</li>)}
```

`key` 让 React 知道**哪个是哪个**,新旧列表 diff 时不会错位。**没 key 报警告**。

不要用 index 当 key(顺序变了会出 bug):

```jsx
{items.map((item, i) => <li key={i}>...)}    // ❌ 列表变化时易错
```

类比 Flutter 的 ValueKey,回顾 07,概念完全一样。

---

## 六、Fragment(避免多余 div)

```jsx
function Group() {
  return (
    <>                       // 短语法
      <h1>标题</h1>
      <p>内容</p>
    </>
  );
}

// 等价
<React.Fragment>
  ...
</React.Fragment>
```

组件返回多个 sibling 时用 Fragment,**不会在 DOM 里产生包裹元素**。

需要 key 时用完整写法:

```jsx
{items.map(item => (
  <React.Fragment key={item.id}>
    <Header />
    <Body />
  </React.Fragment>
))}
```

---

## 七、组件:从哪里开始

```jsx
function Hello() {
  return <h1>Hi</h1>;
}

// 使用
<Hello />
```

**组件名首字母大写**。小写会被当成 HTML 标签:

```jsx
<hello />       // 当成 <hello> HTML 标签,不会调用 Hello 组件
```

---

## 八、Props:不可变,从父到子

```jsx
type Props = {
  name: string;
  age?: number;                       // 可选
  onChange?: (v: string) => void;
  children?: React.ReactNode;         // 子内容
};

function User({ name, age = 18, onChange, children }: Props) {
  return (
    <div>
      <h1>{name}</h1>
      {age && <p>{age}</p>}
      {children}
    </div>
  );
}

// 用
<User name="张三">
  <p>额外内容</p>
</User>
```

Props **只读**,不能在子组件里改:

```jsx
function Bad({ name }) {
  name = '改了';                      // ❌ 改了也无效
  return <h1>{name}</h1>;
}
```

要修改"父传下来的值",通过回调让父级改:

```jsx
function Form({ value, onChange }) {
  return <input value={value} onChange={e => onChange(e.target.value)} />;
}

// 父
<Form value={name} onChange={setName} />
```

这就是 **受控组件** 模式。

---

## 九、children 的几种用法

### 直接渲染

```jsx
function Card({ children }) {
  return <div className="card">{children}</div>;
}

<Card>
  <h1>hi</h1>
</Card>
```

### Render prop(把 children 当函数)

```jsx
function MouseTracker({ children }) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  return (
    <div onMouseMove={e => setPos({ x: e.clientX, y: e.clientY })}>
      {children(pos)}
    </div>
  );
}

<MouseTracker>
  {pos => <p>{pos.x}, {pos.y}</p>}
</MouseTracker>
```

适合"逻辑复用 + UI 自定义"。

### React.Children API(罕见)

遍历 children:

```jsx
React.Children.map(children, child => ...)
React.Children.count(children)
React.Children.only(children)
```

---

## 十、事件处理

```jsx
<button onClick={handleClick}>OK</button>
<input onChange={handleChange} />
<form onSubmit={handleSubmit}>
```

### 传参

```jsx
<button onClick={() => deleteUser(user.id)}>删除</button>

// 或
<button onClick={handleClick.bind(null, user.id)}>删除</button>
```

### event 对象

```tsx
function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
  console.log(e.target.value);
}

function handleSubmit(e: React.FormEvent) {
  e.preventDefault();              // 阻止默认
  e.stopPropagation();             // 阻止冒泡
}
```

React 的事件是 **SyntheticEvent**(合成事件),跨浏览器一致。

---

## 十一、表单(受控 vs 非受控)

### 受控(推荐)

```jsx
function Form() {
  const [email, setEmail] = useState('');

  return (
    <form>
      <input
        value={email}
        onChange={e => setEmail(e.target.value)}
      />
    </form>
  );
}
```

state 是**唯一真相**,input 显示的就是 state。

### 非受控(用 ref 拿值)

```jsx
function Form() {
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    console.log(inputRef.current?.value);
  };

  return (
    <form onSubmit={submit}>
      <input ref={inputRef} defaultValue="abc" />
    </form>
  );
}
```

适合"提交时才需要值"。复杂表单用 React Hook Form(见 08)。

---

## 十二、样式方案

### 1. 内联(简单 / 动态)

```jsx
<div style={{ color: 'red', fontSize: 16, marginTop: 10 }}>...</div>
```

驼峰键名,值是字符串或数字(数字默认 px)。

### 2. CSS 类

```css
/* App.css */
.title { color: red; }
```

```jsx
import './App.css';

<h1 className="title">hi</h1>
```

### 3. CSS Modules(推荐基础)

```css
/* Button.module.css */
.primary { background: blue; }
```

```jsx
import s from './Button.module.css';

<button className={s.primary}>OK</button>
```

类名自动生成 hash,不冲突。

### 4. Tailwind(主流)

```jsx
<button className="bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded">
  OK
</button>
```

原子化 CSS,**不写 CSS 文件**。学习曲线一周,后期生产力极高。

### 5. CSS-in-JS(styled-components / emotion)

```jsx
import styled from 'styled-components';

const Button = styled.button`
  background: ${p => p.primary ? 'blue' : 'gray'};
`;

<Button primary>OK</Button>
```

性能略差,**Server Components 时代不推荐**。新项目用 Tailwind。

### 6. clsx 拼接类名

```jsx
import clsx from 'clsx';

<button className={clsx(
  'btn',
  isPrimary && 'btn-primary',
  disabled && 'opacity-50',
)}>
```

条件类名利器。

---

## 十三、组件组合(Composition)

不要继承组件。**用组合**:

```jsx
// ❌ 别这样
class FancyButton extends Button { ... }

// ✅
function FancyButton(props) {
  return <Button {...props} className="fancy" />;
}
```

### Slot 模式

```jsx
function Layout({ header, sidebar, children }) {
  return (
    <div className="layout">
      <header>{header}</header>
      <aside>{sidebar}</aside>
      <main>{children}</main>
    </div>
  );
}

<Layout
  header={<Logo />}
  sidebar={<Nav />}
>
  <Article />
</Layout>
```

类似 Flutter 的 `appBar / body / drawer`。

### 高阶组件 HOC(老模式,Hooks 后少用)

```jsx
function withAuth(Component) {
  return function Authed(props) {
    const user = useUser();
    if (!user) return <Login />;
    return <Component {...props} user={user} />;
  };
}

const ProtectedPage = withAuth(MyPage);
```

现在更多用 hook(`useAuth`)替代 HOC。

---

## 十四、组件文件组织

### 单文件组件

```
src/components/UserCard.tsx     # 单文件,简单组件
```

### 文件夹组件(复杂)

```
src/components/UserCard/
├── index.tsx
├── UserCard.tsx
├── UserCard.module.css
├── UserCard.test.tsx
└── types.ts
```

复杂组件用文件夹,简单的就一个文件。

---

## 十五、Refs:操作 DOM

```jsx
import { useRef, useEffect } from 'react';

function Auto() {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();        // 自动 focus
  }, []);

  return <input ref={inputRef} />;
}
```

ref 在 React 19 之后是 prop,不需要 forwardRef:

```jsx
// React 19+
function MyInput({ ref, ...props }: { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} {...props} />;
}

// React 18 及之前
const MyInput = forwardRef<HTMLInputElement>((props, ref) => {
  return <input ref={ref} {...props} />;
});
```

---

## 十六、Portal:渲染到别处

```jsx
import { createPortal } from 'react-dom';

function Modal({ children }) {
  return createPortal(
    <div className="modal">{children}</div>,
    document.body,                     // 渲染到 body 末尾
  );
}
```

适合 Modal、Tooltip、Dropdown,**避免 z-index 嵌套问题**。

---

## 十七、TypeScript 写组件

```tsx
type Props = {
  name: string;
  age: number;
  onClick?: () => void;
};

function User({ name, age, onClick }: Props) {
  return <div onClick={onClick}>{name}({age})</div>;
}
```

### 用 React 自带类型

```tsx
type Props = {
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  refValue?: React.Ref<HTMLDivElement>;
};
```

### 继承 HTML 属性

```tsx
type Props = React.ComponentProps<'button'> & {
  loading?: boolean;
};

function Button({ loading, ...props }: Props) {
  return <button {...props} disabled={loading} />;
}
```

`{...props}` 把所有原生 button 属性透传(`onClick / type / disabled`...)。

---

## 十八、常见坑

### 1. 大小写组件名

```jsx
function myComponent() {}      // ❌ 用作 <myComponent /> 会被当 HTML
function MyComponent() {}      // ✅
```

### 2. 0 / 空字符串渲染

```jsx
{count && <div>...</div>}      // count 是 0 时显示 "0"
{count > 0 && <div>...</div>}  // ✅
```

### 3. 列表 key 用 index

排序时出 bug。用业务 id。

### 4. 在 JSX 里写 if

```jsx
return (
  <div>
    if (x) <p>...</p>          {/* ❌ 不行 */}
    {x && <p>...</p>}          {/* ✅ */}
    {x ? <a /> : <b />}        {/* ✅ */}
  </div>
);
```

### 5. style 用字符串

```jsx
<div style="color: red">       {/* ❌ */}
<div style={{ color: 'red' }}> {/* ✅ */}
```

### 6. 直接修改 props

```jsx
function Bad({ user }) {
  user.age++;                  // ❌ 修改父级数据
  return ...;
}
```

→ props 永远只读。

### 7. JSX 内有相邻根元素

```jsx
return (
  <h1>...</h1>
  <p>...</p>                   // ❌ 报错
);

// ✅
return (
  <>
    <h1>...</h1>
    <p>...</p>
  </>
);
```

### 8. 注释语法

```jsx
<div>
  // 错!HTML 不识别这种注释
  {/* 这才对 */}
</div>
```

---

## 十九、调试技巧

### React DevTools(浏览器扩展)

Chrome / Edge 装 React Developer Tools。

- **Components 面板**:看组件树、props、state
- **Profiler 面板**:看哪个组件 rerender、耗时多少

### console.log 在 JSX 里

```jsx
return (
  <div>
    {(() => { console.log(data); return null; })()}
    ...
  </div>
);
```

或在函数体里 log:

```jsx
function Comp({ data }) {
  console.log('rerender', data);
  return <div>...</div>;
}
```

---

## 二十、和 Flutter 的对照

| Flutter | React |
| --- | --- |
| `Container(child: Text('hi'))` | `<div><span>hi</span></div>` |
| `Row` / `Column` | flex 布局(CSS) |
| `setState(() => count++)` | `setCount(count + 1)` |
| Widget 构造参数 | Props |
| `child` / `children` | `children` prop |
| `Widget build(BuildContext context)` | 函数组件本体 |
| `ValueKey(item.id)` | `key={item.id}` |
| `GestureDetector(onTap:)` | `onClick={...}` |
| Hot Reload | Vite HMR |

唯一的"陌生"是 CSS。Flutter 完全用代码描述样式,Web 必须借助 CSS。后面慢慢就习惯了。

---

## 二十一、心智模型

```
JSX 是"描述",不是"操作"
组件是"函数",不是"对象"
Props 是"参数",不是"字段"
State 是"快照",不是"变量"

UI = f(state)
状态变 → 函数重跑 → React diff → 改 DOM
```

理解这套,JSX 和组件就再没有玄学。下一篇 04 详讲 Hooks——React 真正的灵魂。
