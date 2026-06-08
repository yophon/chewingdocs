# SolidJS Signals 与细粒度响应式

SolidJS 的响应式系统是它的核心。理解 Signals、Effects、Memos 的运行机制,才能写出正确高效的 Solid 代码。

---

## 一、Signal:最小的响应式单元

```jsx
import { createSignal } from 'solid-js';

const [count, setCount] = createSignal(0);

// 读
console.log(count());     // 0

// 写
setCount(1);
setCount(prev => prev + 1);

// 信号比较:默认用 ===
const [obj, setObj] = createSignal({ x: 1 });
setObj({ x: 1 });   // 触发更新(新对象引用不同)
setObj(prev => { prev.x = 2; return prev; });  // ⚠️ 不触发(同一引用)
```

自定义比较函数:

```jsx
const [list, setList] = createSignal([], {
  equals: (a, b) => a.length === b.length && a.every((v, i) => v === b[i]),
});
```

---

## 二、细粒度更新是怎么实现的

```jsx
function App() {
  const [name, setName] = createSignal('Alice');
  const [age, setAge] = createSignal(25);

  return (
    <div>
      <p>Name: {name()}</p>   {/* 只绑定到 name */}
      <p>Age: {age()}</p>     {/* 只绑定到 age */}
    </div>
  );
}
```

`setName('Bob')` 时:
- 只有 `<p>Name: ...</p>` 里的文本节点更新
- `<p>Age: ...</p>` **完全不动**
- `App` 函数**不重跑**

这是 SolidJS 跟 React 最本质的区别——React 的 `setName` 会让整个 `App` 重跑。

---

## 三、createEffect:响应式副作用

```jsx
import { createEffect } from 'solid-js';

const [count, setCount] = createSignal(0);

createEffect(() => {
  console.log('count is', count());  // 自动追踪 count
  document.title = `计数: ${count()}`;
});
// 立即执行一次,之后每次 count 变就重跑
```

### Effect 的执行时机

```jsx
createEffect(() => {
  // 同步执行,在 DOM 更新后
  console.log('effect ran');
});
```

### 清理副作用

```jsx
createEffect(() => {
  const id = setInterval(() => console.log(count()), 1000);
  onCleanup(() => clearInterval(id));   // 下次重跑前先清理
});
```

### Effect 依赖追踪规则

**只追踪同步读取的 signal**:

```jsx
createEffect(() => {
  if (condition()) {
    console.log(value());   // 只有 condition() 为 true 时才追踪 value
  }
  // 所以 condition 变 false 时,effect 重跑,但这次不读 value → 不再追踪 value
});
```

这是 Vue watchEffect 和 SolidJS createEffect 共同的"动态依赖追踪"特性。

---

## 四、createMemo:派生值(带缓存)

```jsx
import { createMemo } from 'solid-js';

const [items, setItems] = createSignal([1, 2, 3, 4, 5]);
const [threshold, setThreshold] = createSignal(3);

// 只有 items 或 threshold 变了才重算
const filtered = createMemo(() =>
  items().filter(x => x > threshold())
);

console.log(filtered());   // [4, 5]
```

Memo 的特点:
- **惰性求值**:不被读取就不重算
- **缓存**:依赖没变,多次读取返回同一个值
- 本身也是 signal,可以被其他 effect/memo 订阅

### Memo vs computed

SolidJS 的 `createMemo` ≈ Vue 的 `computed`。它们都表示"由响应式数据派生出来的缓存值"。

---

## 五、createStore:结构化响应式状态

对于对象和数组,用 `createStore` 比多个 signal 更合适:

```jsx
import { createStore } from 'solid-js/store';

const [state, setState] = createStore({
  user: { name: 'Alice', age: 25 },
  items: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }],
  loading: false,
});

// 读
console.log(state.user.name);    // 'Alice'

// 写(路径更新)
setState('user', 'name', 'Bob');
setState('loading', true);

// 函数式更新
setState('items', items => [...items, { id: 3, name: 'C' }]);

// 批量更新
setState({
  loading: false,
  user: { ...state.user, age: 26 },
});
```

Store 的响应式是**属性级别**的:改 `state.user.name` 不会触发依赖 `state.user.age` 的地方更新。

### produce(immer 风格)

```jsx
import { produce } from 'solid-js/store';

setState(produce(s => {
  s.user.name = 'Bob';         // 可以直接改
  s.items.push({ id: 3 });     // 数组操作
}));
```

---

## 六、batch:批量更新

```jsx
import { batch } from 'solid-js';

const [a, setA] = createSignal(0);
const [b, setB] = createSignal(0);

// 不用 batch:两次更新,effect 跑两次
setA(1);
setB(2);

// 用 batch:一次更新,effect 跑一次
batch(() => {
  setA(1);
  setB(2);
});
```

SolidJS 的事件处理器内部**自动 batch**,通常不需要手动调。只在异步场景里手动用。

---

## 七、untrack:不追踪读取

```jsx
import { untrack } from 'solid-js';

createEffect(() => {
  const a = a();   // 追踪 a
  const b = untrack(() => b());  // 读 b 但不追踪
  console.log(a, b);
  // a 变了会重跑,b 变了不会
});
```

适合"需要读取某个值但不想订阅它"的场景。

---

## 八、createResource:数据获取

```jsx
import { createResource } from 'solid-js';

const [userId, setUserId] = createSignal(1);

// 当 userId 变化时,自动重新请求
const [user, { refetch, mutate }] = createResource(userId, async (id) => {
  const res = await fetch(`/api/users/${id}`);
  return res.json();
});

// 在模板里
<Show when={!user.loading} fallback={<Spinner />}>
  <Show when={!user.error} fallback={<p>出错了</p>}>
    <h1>{user()?.name}</h1>
  </Show>
</Show>
```

`createResource` 返回的 `user` 是特殊的 signal:
- `user()` → 数据
- `user.loading` → 加载中
- `user.error` → 错误
- `refetch()` → 重新请求
- `mutate(newData)` → 乐观更新

---

## 九、响应式上下文(Context)

```jsx
import { createContext, useContext } from 'solid-js';

const ThemeContext = createContext('light');

function App() {
  const [theme, setTheme] = createSignal('light');

  return (
    <ThemeContext.Provider value={theme}>
      <Button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}>
        切换
      </Button>
      <ThemedContent />
    </ThemeContext.Provider>
  );
}

function ThemedContent() {
  const theme = useContext(ThemeContext);
  return <div class={theme()}>内容</div>;
}
```

注意:Context 的 `value` 是 signal(函数),子组件里 `theme()` 才能响应变化。

---

## 十、响应式系统对比

| 特性 | React (useState) | Vue (ref) | SolidJS (createSignal) |
| --- | --- | --- | --- |
| 更新粒度 | 组件级 | 组件级(VDOM diff) | DOM 节点级 |
| 重跑组件 | 是 | 否(只跑 render) | 否(组件只跑一次) |
| VDOM | 是 | 是 | 否 |
| 读取语法 | `count` | `count.value` | `count()` |
| 写入语法 | `setCount(v)` | `count.value = v` | `setCount(v)` |
| 追踪时机 | 编译时 hooks | 运行时 Proxy | 运行时函数调用 |

---

## 十一、常见误区

### 1. 在 effect 外读 signal 不会追踪

```jsx
function Component() {
  const [count, setCount] = createSignal(0);

  // ❌ 组件函数只跑一次,这里读 count 不在响应式上下文里
  console.log(count());   // 只打印初始值 0

  // ✅ 放在 effect 或 JSX 里
  createEffect(() => console.log(count()));
  return <p>{count()}</p>;  // JSX 里会建立响应
}
```

### 2. 解构 Store 失去响应性

```jsx
const [state, setState] = createStore({ count: 0 });

// ❌ 解构后 count 是普通值
const { count } = state;

// ✅ 直接访问 state.count
<p>{state.count}</p>
```

### 3. 在异步函数里读 signal

```jsx
createEffect(async () => {
  const id = userId();    // ✅ 追踪
  const data = await fetch(`/api/${id}`).then(r => r.json());
  // 后面的代码在 await 后运行,不在响应式上下文里
  // someOtherSignal() 这里读不会被追踪
});
```

**异步后的 signal 读取不追踪**——这是 SolidJS 和 Vue 共同的限制,用 `createResource` 解决异步数据获取。

---

## 十二、心智模型

```
SolidJS 响应式的三个原语:

createSignal   → 原子状态(单值)
createStore    → 结构化状态(对象/数组,属性级响应)
createMemo     → 派生状态(懒计算 + 缓存)
createEffect   → 副作用(自动追踪依赖,自动重跑)
createResource → 异步状态(数据获取)

追踪规则:
  在 effect / memo / JSX 里同步读 signal → 建立订阅
  signal 变 → 通知所有订阅者重新跑

性能关键:
  无 VDOM → Signal 变化直接更新对应 DOM 节点
  组件不重跑 → 没有 React 的闭包/依赖数组问题
```

下一篇 20 讲 SolidJS Stores、Effects 进阶和 Memos——更复杂的响应式模式。
