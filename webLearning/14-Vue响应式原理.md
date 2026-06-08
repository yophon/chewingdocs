# Vue 响应式原理

理解了响应式底层,**Vue 的所有"魔法"都不再神秘**。本篇从 ref / reactive 的实现机制讲到性能与边界,最后跟 SolidJS Signals 对比。

---

## 一、响应式是什么

```ts
const count = ref(0);
count.value++;     // 自动更新所有用了 count 的 UI / computed / watch
```

需要框架做三件事:

1. **依赖追踪**:谁用了 count(模板、computed、watch)?
2. **变化检测**:count.value++ 时框架要知道
3. **派发更新**:通知所有依赖去更新

Vue 3 用 **Proxy + 副作用收集** 实现。

---

## 二、ref 的实现(简化版)

```ts
class RefImpl<T> {
  private _value: T;
  private _deps = new Set<Effect>();

  constructor(value: T) {
    this._value = value;
  }

  get value() {
    track(this, 'value');     // 当前 effect 订阅这个 ref
    return this._value;
  }

  set value(v: T) {
    if (v !== this._value) {
      this._value = v;
      trigger(this, 'value');  // 通知所有订阅者
    }
  }
}

function ref<T>(v: T) {
  return new RefImpl(v);
}
```

**核心是 getter / setter**:
- 读 → 收集依赖
- 写 → 触发更新

---

## 三、reactive 的实现(简化版)

```ts
function reactive<T extends object>(target: T): T {
  return new Proxy(target, {
    get(t, key) {
      track(t, key);
      const v = t[key];
      // 嵌套也要 reactive
      return typeof v === 'object' ? reactive(v) : v;
    },
    set(t, key, value) {
      const old = t[key];
      t[key] = value;
      if (old !== value) trigger(t, key);
      return true;
    },
  });
}
```

`reactive` 用 **Proxy** 代理整个对象,任何字段读写都被拦截。

### Vue 2 的局限(讲历史)

Vue 2 用 `Object.defineProperty`,**只能定义已有字段**:

```ts
const data = { count: 0 };
data.newField = 1;    // ⚠️ Vue 2 不响应,需要 Vue.set
```

Vue 3 的 Proxy 解决了这个问题,**任意字段增删都响应**。

---

## 四、依赖追踪机制

```ts
let activeEffect: Effect | null = null;
const targetMap = new WeakMap();   // target -> key -> Set<Effect>

function effect(fn: () => void) {
  const e = () => {
    activeEffect = e;
    fn();           // 执行时收集依赖
    activeEffect = null;
  };
  e();
  return e;
}

function track(target, key) {
  if (!activeEffect) return;
  let depsMap = targetMap.get(target);
  if (!depsMap) targetMap.set(target, depsMap = new Map());
  let dep = depsMap.get(key);
  if (!dep) depsMap.set(key, dep = new Set());
  dep.add(activeEffect);
}

function trigger(target, key) {
  const dep = targetMap.get(target)?.get(key);
  dep?.forEach(e => e());
}
```

`effect` 包一个函数 → 跑一遍函数 → 函数里访问的所有响应式字段都被记录 → 字段变化时重跑函数。

`watchEffect`、`computed`、组件渲染本质都是 effect。

---

## 五、ref vs reactive 全对比

| | ref | reactive |
| --- | --- | --- |
| 实现 | getter/setter | Proxy |
| 用法 | `.value` | 直接 |
| 模板 | 自动 unwrap | 自动 |
| 解构 | 失去响应 | 失去响应 |
| 原始值 | ✅ | ❌(只对象) |
| 重新赋值 | `x.value = newObj` | 不行(必须改字段) |
| 适合 | 单值 / 任意类型 | 对象 |

### 重新赋值的差异

```ts
const list = ref([1, 2, 3]);
list.value = [4, 5];        // ✅ 整体替换

const list2 = reactive([1, 2, 3]);
list2 = [4, 5];              // ❌ 完全失去响应
list2.length = 0;            // ✅ 通过修改字段
list2.push(...[4, 5]);       // ✅
```

→ 需要"整体替换"的状态用 ref;不替换只改字段的用 reactive。

---

## 六、模板自动 unwrap 规则

```vue
<script setup>
const count = ref(0);
const user = reactive({ name: '张三' });
</script>

<template>
  <p>{{ count }}</p>           <!-- 自动 unwrap -->
  <p>{{ user.name }}</p>       <!-- reactive 直接访问 -->
</template>
```

但**嵌套对象里的 ref 不会自动 unwrap**:

```ts
const state = reactive({
  count: ref(0),
});

console.log(state.count);     // ⚠️ Vue 3.4 是 number,3.5 之后还是 ref
                              // 始终用 .value 才稳:state.count.value
```

实际经验:**别在 reactive 里嵌 ref**。一层就一层。

---

## 七、computed 内部就是 effect

```ts
const doubled = computed(() => count.value * 2);

// 简化实现
function computed(getter) {
  let value;
  let dirty = true;

  const e = effect(() => {
    dirty = true;            // 依赖变了,标记脏
  });

  return {
    get value() {
      if (dirty) {
        value = getter();    // 重新计算
        dirty = false;
      }
      return value;
    },
  };
}
```

**懒计算 + 缓存**:依赖变 → 标脏 → 下次访问才重算。

---

## 八、watch 的实现

```ts
function watch(source, cb) {
  let oldValue;
  effect(() => {
    const newValue = typeof source === 'function' ? source() : source.value;
    if (oldValue !== newValue) {
      cb(newValue, oldValue);
      oldValue = newValue;
    }
  });
}
```

watch 也是个 effect,但带"对比新旧值"。

---

## 九、组件渲染就是 effect

```ts
const render = effect(() => {
  // setup 返回的所有响应式数据,被模板用到
  // → effect 收集到这些依赖
  // → 任一变化触发整个 render effect 重跑
  patch(prevVNode, generateVNode());
});
```

**"组件级粒度"的更新**:数据变了,触发 patch(VDOM diff),只更新最小 DOM。

跟 React 的差异:
- React:**整个组件函数重跑**
- Vue:**setup 只跑一次,只是 render 函数重跑**(模板编译成 render)

---

## 十、shallow vs deep

### shallowRef / shallowReactive

```ts
const big = shallowRef({ nested: { value: 1 } });

big.value.nested.value = 2;     // ❌ 不触发
big.value = { nested: { value: 2 } };  // ✅ 整体替换才触发
```

**只追踪一层**。适合大对象、不需要深度响应、性能优化。

### markRaw

```ts
const obj = markRaw({ id: 1 });
const state = reactive({ obj });    // obj 不会被 reactive 化
```

适合"放进 reactive 但本身不需要响应"的对象(如 Map / Set 实例、第三方库的对象、DOM)。

---

## 十一、toRef / toRefs

```ts
const state = reactive({ count: 0, name: '' });

// toRefs:整个 reactive → 一组 ref
const { count, name } = toRefs(state);
// count 仍然响应:count.value 跟 state.count 同步

// toRef:单字段
const count = toRef(state, 'count');
```

适合 composable 返回值:

```ts
function useUser() {
  const state = reactive({ name: '', age: 0 });
  return toRefs(state);
}

// 解构后仍响应
const { name, age } = useUser();
```

---

## 十二、Vue 3.5 响应式重写

Vue 3.5(2024)对响应式系统做了大重写:
- **更小的内存占用**(每个 dep 不再单独 Set)
- **更快的 trigger**(链式存储)
- **更准确的 mounted effect 清理**

**用户层面 API 不变**,只是更快。直接升级享受。

---

## 十三、调试响应式

### Vue DevTools

浏览器装 Vue DevTools 扩展,Components 面板:
- 看每个响应式变量当前值
- 改值实时更新
- 看 computed / watcher 的依赖关系

### onTrack / onTrigger

```ts
watch(count, cb, {
  onTrack(e) { console.log('收集依赖', e); },
  onTrigger(e) { console.log('触发更新', e); },
});

// computed / watchEffect 同理
```

适合排查"为什么没响应"或"为什么过度响应"。

---

## 十四、和 SolidJS Signals 对比

```ts
// SolidJS
const [count, setCount] = createSignal(0);
const doubled = createMemo(() => count() * 2);
createEffect(() => console.log(count()));

// Vue
const count = ref(0);
const doubled = computed(() => count.value * 2);
watchEffect(() => console.log(count.value));
```

**API 几乎一致**,核心差异:

| | SolidJS Signals | Vue Reactive |
| --- | --- | --- |
| 编译 | 编译时把 JSX 转成"细粒度更新"代码 | 运行时 patch VDOM |
| render 粒度 | DOM 节点级别(`{count()}` 直接绑那个文本节点) | 组件级别(整个 render function rerun) |
| 调用 | `count()` getter | `count.value` |
| API | createSignal / createMemo / createEffect | ref / computed / watchEffect |

**SolidJS 比 Vue 快**(无 VDOM 开销),但生态小很多。Vue 的"组件粒度 + 静态提升 + 编译器优化"在实战中也极快。

详细 SolidJS 见 18-21 篇。

---

## 十五、性能优化技巧

### 1. shallowRef / shallowReactive

大对象、不需要深度响应。

### 2. markRaw

第三方库对象塞进 reactive 时。

### 3. 避免在 computed 里返回新对象

```ts
const filtered = computed(() => items.value.filter(x => x.active));
// 每次访问 filtered.value,如果依赖没变,Vue 缓存
// 但如果上游 items 引用变了,filtered 也算"变了"
```

### 4. v-memo(模板级缓存)

```vue
<div v-memo="[user.id, user.name]">
  <ExpensiveContent :user="user" />
</div>
```

依赖没变就跳过 patch。**罕用,但有用**。

### 5. v-once

```vue
<p v-once>{{ user.name }}</p>
```

只渲染一次,后续永不更新。

### 6. defineAsyncComponent + Suspense

```ts
const HeavyChart = defineAsyncComponent(() => import('./HeavyChart.vue'));
```

按需加载组件。

---

## 十六、常见误解

### 1. "Vue 的响应式是魔法"

不是。本质就是 Proxy + getter/setter + 依赖图。能在脑子里想出来,debug 也清楚。

### 2. "ref 比 reactive 慢"

差不多。ref 内部用 RefImpl 类,reactive 用 Proxy。**性能差距在 ms 级,不必纠结**。

### 3. "setup 每次都跑"

错。**setup 只在挂载时跑一次**。后续状态变化只是触发 render(模板)重跑。

### 4. "v-if 比 v-show 性能好"

不一定。频繁切换 v-show 更好,只切一次或很少切 v-if 更好(不挂载组件)。

### 5. "computed 自动缓存所以可以无脑用"

如果 getter 里**有非响应式依赖**,缓存可能"过期"。computed 只跟踪响应式的依赖。

```ts
const x = computed(() => Math.random() + count.value);
// count 没变,x 就不重算,即使你每次想要新随机数
```

---

## 十七、跟 React 心智差异(再强调)

```
React:
  状态变 → 整个组件函数重跑 → 返回新 JSX → diff
  ⇒ 你必须主动"防止"重跑(memo、useMemo、useCallback)

Vue:
  状态变 → 找到依赖图里订阅的 effect → 重跑那些 effect
  ⇒ 默认就最优,不需要主动优化
```

所以 Vue 没有"忘记 useMemo 导致性能爆炸"这种坑——**默认就细粒度**。

---

## 十八、和 Flutter ChangeNotifier 对照

| Flutter | Vue Reactive |
| --- | --- |
| `ValueNotifier<int>` | `ref<number>(0)` |
| `valueNotifier.value++` | `ref.value++` |
| `ListenableBuilder` | 模板自动响应 |
| `ChangeNotifier + notifyListeners()` | `reactive` 自动通知 |
| `Provider.of<T>(context)` | `inject<T>(key)` |

**Vue 的 reactive 自动化程度比 Flutter ChangeNotifier 高**:Flutter 你要手动 `notifyListeners`,Vue Proxy 帮你做。

---

## 十九、心智模型

```
响应式三角:
  数据(ref / reactive)→ 被读取 → 收集"我有谁在用我"
                       ↓
                       被改写 → 通知所有用户重新跑

模板 / computed / watch / watchEffect 都是"effect"
effect 跑的时候被收集到响应式数据的依赖列表里
数据变 → 通知所有 effect 重新跑

ref 和 reactive 都是这套机制,只是 API 不同
```

理解到这一层,**Vue 不会再有任何"为什么不更新"的诡异问题**。下一篇 15 进 Pinia,把状态管理在 Vue 里讲透。
