# React Hooks 详解

Hooks 是 React 16.8(2019)的革命。在它之前,要管 state、生命周期、复用逻辑只能用类组件。Hooks 让函数组件能做所有事——而且更优雅。

理解 Hooks,你才真正理解了"现代 React"。

---

## 一、Hooks 的两大铁律

### 1. 只在顶层调用

```jsx
function Bad() {
  if (cond) {
    const [x, setX] = useState(0);     // ❌
  }

  for (...) {
    useEffect(...);                     // ❌
  }
}
```

**所有 Hook 必须按相同顺序、每次都被调用**。React 内部用调用顺序匹配每个 hook 的 state。

### 2. 只在 React 函数里调用

```jsx
function helper() {
  useState(0);                          // ❌ 不是组件 / 自定义 hook
}
```

只能在:
- 函数组件本体
- 自定义 hook(以 `use` 开头的函数)

ESLint 插件 `eslint-plugin-react-hooks` 会自动检查这两条。**必装**。

---

## 二、useState:基础状态

```jsx
const [count, setCount] = useState(0);

setCount(1);                  // 直接设新值
setCount(c => c + 1);         // 函数式(基于旧值,推荐)
```

### 函数式更新

```jsx
function Counter() {
  const [count, setCount] = useState(0);

  // 异步场景:几个连续点击
  const triple = () => {
    setCount(c => c + 1);     // ✅ 每次基于最新值
    setCount(c => c + 1);
    setCount(c => c + 1);     // 总共 +3
  };

  // 错误版本
  const tripleBad = () => {
    setCount(count + 1);      // ❌ 三次都基于同一个 count
    setCount(count + 1);      // 最终只 +1
    setCount(count + 1);
  };
}
```

### 惰性初始化(初始值算起来贵)

```jsx
const [data, setData] = useState(() => expensiveCalc());   // 只算一次
const [data, setData] = useState(expensiveCalc());          // ❌ 每次渲染都算
```

### 状态更新的"批处理"

React 18+ 自动批处理:

```jsx
setA(1);
setB(2);
setC(3);
// 一帧内合并成一次 rerender
```

---

## 三、useEffect:副作用

副作用 = 跟 React 渲染无关的"对外界做事":网络请求、订阅、计时器、修改 DOM。

```jsx
useEffect(() => {
  console.log('每次渲染后跑');
});

useEffect(() => {
  console.log('只跑一次');
}, []);

useEffect(() => {
  console.log('id 变就跑');
}, [id]);

useEffect(() => {
  const timer = setInterval(() => {}, 1000);
  return () => clearInterval(timer);     // 清理函数
}, []);
```

### 依赖数组规则

```
[]         → 只在挂载 / 卸载时跑
[a, b]     → 任意一个变化就重跑
不写        → 每次渲染后都跑(罕见)
```

ESLint 插件会强制你**把 effect 用到的所有外部变量都写到依赖里**,不要骗它。

### 类比 Flutter 生命周期

```
useEffect(() => {
  // = initState + didChangeDependencies
  return () => {
    // = dispose
  };
}, [deps]);   // = didUpdateWidget(对依赖变化)
```

回顾 Flutter 的 06 生命周期。

---

## 四、useEffect 的常见误用

### 1. 同步状态(应该用派生)

```jsx
// ❌ 用 effect 同步状态
const [items, setItems] = useState([]);
const [count, setCount] = useState(0);

useEffect(() => {
  setCount(items.length);    // 多余
}, [items]);

// ✅ 直接派生
const count = items.length;
```

**能在渲染过程中算的就别放 effect**。

### 2. 在 effect 里改父级状态

```jsx
useEffect(() => {
  onChange?.(value);         // 触发父级 rerender,可能死循环
}, [value]);
```

→ 在事件回调里直接调 onChange,不放 effect。

### 3. 没清理订阅

```jsx
useEffect(() => {
  socket.on('msg', handle);
  // ❌ 忘了 socket.off
}, []);

// ✅
useEffect(() => {
  socket.on('msg', handle);
  return () => socket.off('msg', handle);
}, []);
```

### 4. 闭包陷阱

```jsx
function Bad() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const t = setInterval(() => {
      setCount(count + 1);    // ❌ count 永远是 0
    }, 1000);
    return () => clearInterval(t);
  }, []);                     // 依赖空,effect 只跑一次,捕获了初始 count
}

// ✅ 函数式更新
useEffect(() => {
  const t = setInterval(() => setCount(c => c + 1), 1000);
  return () => clearInterval(t);
}, []);
```

---

## 五、useEffect 何时跑

```
渲染流程:
  1. 组件函数运行(渲染)
  2. React 把 JSX → 真实 DOM 更新
  3. 浏览器 paint
  4. useEffect 回调跑(异步)
```

`useEffect` 是**渲染后**跑的,不影响首屏。

如果需要**渲染前**(同步、操作 DOM):

```jsx
useLayoutEffect(() => {
  // 同步,在 paint 之前跑
  // 适合测量 DOM、防止闪烁
});
```

99% 用 `useEffect`,**只在测量布局 / 必须同步时**用 `useLayoutEffect`。

---

## 六、useRef:可变值 + DOM 引用

### DOM 引用

```jsx
function FocusInput() {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return <input ref={ref} />;
}
```

### 普通可变值(不触发 rerender)

```jsx
function Timer() {
  const timerId = useRef<number | null>(null);

  const start = () => {
    timerId.current = setInterval(() => {}, 1000);
  };

  const stop = () => {
    if (timerId.current) clearInterval(timerId.current);
  };
}
```

`ref.current = xxx` **不会触发 rerender**。这是它跟 useState 的核心区别。

适合存:
- 计时器 ID
- 上一次的值(prev)
- DOM 节点
- 任何"不需要 UI 跟随变化"的可变值

### 存"上次的值"

```jsx
function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();
  useEffect(() => { ref.current = value; });
  return ref.current;
}

const prevCount = usePrevious(count);
```

---

## 七、useMemo:派生值缓存

```jsx
const filtered = useMemo(
  () => items.filter(x => x.active),
  [items],
);
```

只在 `items` 变化时重新计算。

### 什么时候用

✅ 派生值计算昂贵
✅ 派生值作为子组件的 prop,且子组件 memo 了

❌ 简单 `.length`、`.map` 不用包(开销不大)
❌ "保险起见全包"——每个 useMemo 自己也有开销,过度反而慢

```jsx
// ❌ 多此一举
const sum = useMemo(() => a + b, [a, b]);

// ✅ 真的有计算量
const filtered = useMemo(() => bigList.filter(...), [bigList]);
```

---

## 八、useCallback:函数缓存

```jsx
const handleClick = useCallback(() => {
  console.log(value);
}, [value]);
```

**返回稳定引用的函数**,只在依赖变化时新建。

### 什么时候用

```jsx
function Parent() {
  const [count, setCount] = useState(0);

  // ❌ 每次 Parent 渲染都新建函数
  const handleClick = () => doSomething();

  return <ExpensiveChild onClick={handleClick} />;
  // 子组件 memo 了也没用,因为 onClick 引用每次都变
}

// ✅
const handleClick = useCallback(() => doSomething(), []);
```

适合:**传给 memo 化的子组件、useEffect 依赖里**。
不适合:每个函数都包 → 过度优化。

---

## 九、useContext:跨层数据传递

```jsx
const ThemeContext = createContext('light');

function App() {
  return (
    <ThemeContext.Provider value="dark">
      <Page />
    </ThemeContext.Provider>
  );
}

function Page() {
  const theme = useContext(ThemeContext);
  return <div className={theme}>...</div>;
}
```

类比 Flutter 的 InheritedWidget(回顾 02 / 04),完全一样。

### 注意

- Context **变化会让所有用了它的组件 rerender**
- 频繁变化的 state 不要直接放 Context(性能问题)
- 大型项目用 Zustand / Jotai 比 Context 更细粒度

---

## 十、useReducer:复杂状态机

`useState` 的"重型版":

```jsx
type State = { count: number; loading: boolean };
type Action =
  | { type: 'increment' }
  | { type: 'set'; payload: number }
  | { type: 'load'; payload: boolean };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'increment': return { ...state, count: state.count + 1 };
    case 'set': return { ...state, count: action.payload };
    case 'load': return { ...state, loading: action.payload };
  }
}

const [state, dispatch] = useReducer(reducer, { count: 0, loading: false });

dispatch({ type: 'increment' });
dispatch({ type: 'set', payload: 100 });
```

适合:多个相关状态、复杂转换逻辑、像状态机的场景。
**类比 Flutter 的 Bloc**(回顾 10):事件驱动,reducer 计算新状态。

---

## 十一、自定义 Hook:逻辑复用

把 Hook 用法包成一个函数。**约定以 `use` 开头**。

```jsx
function useToggle(initial = false) {
  const [on, setOn] = useState(initial);
  const toggle = useCallback(() => setOn(o => !o), []);
  return [on, toggle] as const;
}

// 用
function Demo() {
  const [open, toggleOpen] = useToggle(false);
  return <button onClick={toggleOpen}>{open ? '关' : '开'}</button>;
}
```

### 实战例子:useFetch

```tsx
function useFetch<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch(url)
      .then(r => r.json())
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) setError(e); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [url]);

  return { data, error, loading };
}

// 用
function User({ id }: { id: number }) {
  const { data, loading } = useFetch<User>(`/api/users/${id}`);
  if (loading) return <Spinner />;
  return <div>{data?.name}</div>;
}
```

实战中用 TanStack Query / SWR 替代手写,见 07。

---

## 十二、useTransition:非阻塞更新(React 18+)

把"低优先级"更新标记为 transition,UI 不卡顿:

```jsx
const [isPending, startTransition] = useTransition();
const [query, setQuery] = useState('');
const [results, setResults] = useState([]);

const onChange = (e) => {
  setQuery(e.target.value);    // 高优先级,立即更新输入框

  startTransition(() => {
    setResults(slowSearch(e.target.value));   // 低优先级,可被打断
  });
};

return (
  <>
    <input value={query} onChange={onChange} />
    {isPending && <Spinner />}
    <Results data={results} />
  </>
);
```

类比 Flutter:把重活放 isolate(回顾 37),UI 不卡。

---

## 十三、useDeferredValue:延迟值

```jsx
const [text, setText] = useState('');
const deferredText = useDeferredValue(text);

// deferredText 跟 text 慢一拍,适合昂贵渲染
return <SlowList query={deferredText} />;
```

跟 useTransition 思想类似,但**包装"值"而不是"动作"**。

---

## 十四、useId:稳定唯一 ID

```jsx
function FormField({ label }) {
  const id = useId();
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <input id={id} />
    </>
  );
}
```

SSR 友好,不会客户端 / 服务端不一致。

---

## 十五、useImperativeHandle:暴露方法给父级

```tsx
function MyInput({ ref }: { ref: Ref<{ focus: () => void }> }) {
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }), []);

  return <input ref={inputRef} />;
}

// 父
const myRef = useRef<{ focus: () => void }>(null);
<MyInput ref={myRef} />
<button onClick={() => myRef.current?.focus()}>Focus</button>
```

罕用,**99% 场景用 props 回调更好**。

---

## 十六、use(React 19):读取 Promise / Context

```jsx
function User() {
  const data = use(fetchUser());     // 直接 await,Suspense 自动处理 loading
  return <h1>{data.name}</h1>;
}
```

需要外面包 Suspense:

```jsx
<Suspense fallback={<Spinner />}>
  <User />
</Suspense>
```

新写法,可读性好。**配合 Server Components 是 React 19 主推**。

---

## 十七、Hooks 心智模型

```
useState     → 自己的可变数据
useEffect    → 副作用(订阅 / 网络 / DOM 操作)
useRef       → 可变值不触发渲染 / DOM 引用
useMemo      → 缓存计算结果
useCallback  → 缓存函数引用
useContext   → 读上下文
useReducer   → 状态机
useTransition→ 标记更新为低优先级
useDeferredValue → 延迟值
useId        → 唯一 ID(SSR)
use          → 读 Promise / Context(React 19)
自定义 use*   → 逻辑复用
```

---

## 十八、常用模式

### 1. 加载 / 错误 / 数据三态

```jsx
function User({ id }) {
  const { data, error, loading } = useFetch<User>(`/api/users/${id}`);

  if (loading) return <Spinner />;
  if (error) return <Error msg={error.message} />;
  return <Profile user={data!} />;
}
```

### 2. 防抖搜索

```jsx
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function Search() {
  const [query, setQuery] = useState('');
  const debounced = useDebounce(query, 300);

  useEffect(() => {
    if (debounced) fetchResults(debounced);
  }, [debounced]);

  return <input value={query} onChange={e => setQuery(e.target.value)} />;
}
```

### 3. 监听窗口尺寸

```jsx
function useWindowSize() {
  const [size, setSize] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));

  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return size;
}
```

### 4. localStorage state

```jsx
function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : initial;
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue] as const;
}
```

---

## 十九、严格模式(StrictMode)

```jsx
<React.StrictMode>
  <App />
</React.StrictMode>
```

开发环境下会:
- **每个组件 render 两次**(查纯度问题)
- **每个 effect 跑两次**(查清理是否正确)

**生产环境不会双跑**,纯调试用。

刚开始用 StrictMode 看到 effect 跑两次会懵,**这是有意的**——逼你写正确的清理逻辑。

---

## 二十、常见坑总结

1. **依赖数组缺项**:用了某变量但没列依赖 → 闭包陷阱
2. **依赖数组多项**:列了不必要的 → 不必要的重跑
3. **没清理订阅 / 计时器** → 内存泄漏
4. **state 不可变原则**:`list.push` → ❌
5. **useEffect 同步状态**:能派生就别 effect
6. **错误的 useMemo / useCallback**:简单值不用包,反而慢
7. **Context 频繁变化**:整个子树重渲染,大型用 Zustand
8. **在条件 / 循环里调 hook** → 顺序错乱

---

## 二十一、调试 Hooks

### React DevTools

Components 面板:
- 看每个 hook 的当前值
- 改值实时调试
- Profiler 看哪个 hook 触发了 rerender

### console.log effect

```jsx
useEffect(() => {
  console.log('id 变了', id);
}, [id]);
```

最直接的方式确认依赖触发。

---

## 二十二、和 Flutter 的对照

| Flutter | React Hook |
| --- | --- |
| `_count = 0; setState(() => _count++)` | `useState` |
| `initState + dispose` | `useEffect(() => {...; return () => {...}}, [])` |
| `didUpdateWidget` | `useEffect(() => {...}, [props])` |
| `final ctrl = AnimationController(...)`(类字段) | `useRef` |
| `Theme.of(context)` | `useContext(Context)` |
| `late computed = ...`(惰性) | `useMemo` |
| Mixin 复用逻辑 | 自定义 hook |
| Bloc + Stream | useReducer |

学透 Flutter 的人学 Hooks 几乎无障碍。**核心心智一样,只是换了语法**。

---

## 二十三、心智模型

```
Hook 不是魔法,是"在函数里也能记住上次"的机制
React 内部用调用顺序匹配每个 hook 的 state

每次渲染:
  1. 组件函数从头跑
  2. 所有 hook 按顺序拿到上次的值
  3. 返回新 JSX

所以:
  - 必须按相同顺序调
  - 不能在条件里调
  - 闭包捕获当时的值,不会自动更新
```

掌握这套思维,Hooks 不再是"魔法",而是工具。下一篇讲 React 状态管理的进阶选择。
