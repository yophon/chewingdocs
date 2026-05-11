# Vue 组合式 API(Composition API)

`<script setup>` + Composition API 是 Vue 3 的核心写法。理解这一篇,你写 Vue 业务逻辑就完全顺了。

---

## 一、`<script setup>` 是什么

```vue
<script setup>
import { ref, onMounted } from 'vue';

const count = ref(0);
const inc = () => count.value++;

onMounted(() => console.log('mounted'));
</script>

<template>
  <button @click="inc">{{ count }}</button>
</template>
```

特点:
- **整个 `<script setup>` 块就是 setup() 函数体**
- 顶层声明的变量、函数自动暴露给模板
- 不需要 return 任何东西
- 用编译宏(defineProps / defineEmits / defineModel / defineExpose),**不需要 import**

类比 React 函数组件:**`<script setup>` 就是函数体,只跑一次,不像 React 每次状态变化都重跑**。

⭐ **这点跟 React 截然不同**:Vue setup 只执行一次,响应式靠 ref 自身机制驱动 UI 更新,**组件函数本体不会被反复调用**。

---

## 二、ref:基础响应式

```ts
import { ref } from 'vue';

const count = ref(0);
const name = ref('张三');
const list = ref<string[]>([]);

console.log(count.value);    // 0
count.value = 1;             // 改值
list.value.push('a');        // 数组操作
```

**核心规则**:
- JS 代码里访问值用 **`.value`**
- 模板里 Vue 自动解包,**直接 `count` 不用 `.value`**

```vue
<template>
  <p>{{ count }}</p>          <!-- 模板自动解包 -->
  <p>{{ count.value }}</p>    <!-- ❌ 多了 -->
</template>
```

类比:
- Flutter `ValueNotifier(0)` → `notifier.value`(回顾 02)
- React `useState(0)` → `[count, setCount]`,改值用 setCount

---

## 三、reactive:对象响应式

```ts
import { reactive } from 'vue';

const user = reactive({
  name: '张三',
  age: 20,
});

user.age++;                  // 直接改,不用 .value
console.log(user.name);
```

| 用谁 | 何时 |
| --- | --- |
| `ref` | 基本类型 / 也能装对象 |
| `reactive` | 对象 / 数组(不能装基本类型) |

社区共识:**99% 用 ref**,因为统一 `.value`。

```ts
// reactive 的几个限制:
const state = reactive({ count: 0 });

// 1. 解构丢响应性
const { count } = state;    // count 不再响应

// 2. 重新赋值丢响应性
state = { count: 5 };       // ❌

// 3. 必须用对象,不能装数字字符串
reactive(0)                 // ❌
```

ref 没这些坑。

---

## 四、computed:派生值

```ts
import { ref, computed } from 'vue';

const firstName = ref('张');
const lastName = ref('三');

const fullName = computed(() => firstName.value + lastName.value);

console.log(fullName.value);    // '张三'
firstName.value = '李';
console.log(fullName.value);    // '李三'
```

特点:
- 自动追踪依赖
- **缓存**:依赖不变就不重算
- 模板里像 ref 一样自动解包

类似 React 的 `useMemo`,但 Vue **不用写依赖数组**。

### 链式 computed

```ts
const items = ref<Todo[]>([]);
const active = computed(() => items.value.filter(t => !t.done));
const activeCount = computed(() => active.value.length);
```

派生层层叠,Vue 自动管。

---

## 五、watch:监听变化

```ts
import { ref, watch } from 'vue';

const count = ref(0);

// 监听 ref
watch(count, (newVal, oldVal) => {
  console.log(`${oldVal} → ${newVal}`);
});

// 监听多个
watch([count, name], ([c, n], [oc, on]) => { ... });

// 监听对象的某属性 → 用 getter
watch(() => user.name, (newName) => { ... });

// 深度监听对象
watch(user, (newUser) => { ... }, { deep: true });

// 立即执行一次
watch(count, callback, { immediate: true });
```

类比 React 的 `useEffect(() => {...}, [count])`。

---

## 六、watchEffect:自动追踪依赖

```ts
import { watchEffect } from 'vue';

watchEffect(() => {
  console.log(count.value);     // 自动追踪 count
  fetchUser(id.value);          // 也自动追踪 id
});
```

**不用列依赖**,Vue 自动追踪用到的响应式变量。

跟 watch 的区别:
- `watch`:**懒**(数据变才跑),能拿新旧值
- `watchEffect`:**立即跑一次**(收集依赖),拿不到旧值

实战 70% 用 `watch`,30% 用 `watchEffect`。

### 取消监听

```ts
const stop = watch(count, callback);
stop();    // 不再监听
```

`watchEffect` 同理,**组件卸载时自动停**,不用手动清理。

### 清理副作用

```ts
watch(query, async (q, _, onCleanup) => {
  let cancelled = false;
  onCleanup(() => { cancelled = true; });
  const data = await fetch(q);
  if (cancelled) return;       // 新 query 来了,丢掉旧的
  results.value = data;
});
```

类似 React useEffect 的 return 清理函数。

---

## 七、生命周期 Hooks

```ts
import {
  onMounted,
  onUpdated,
  onUnmounted,
  onBeforeMount,
  onBeforeUnmount,
  onActivated,
  onDeactivated,
} from 'vue';

onMounted(() => {
  console.log('挂载完成');
});

onUnmounted(() => {
  console.log('卸载,清理资源');
});
```

| Hook | 时机 |
| --- | --- |
| `onBeforeMount` | 挂载前 |
| `onMounted` | 挂载后(类似 Flutter initState 末) |
| `onBeforeUpdate` | 数据更新前 |
| `onUpdated` | DOM 更新后 |
| `onBeforeUnmount` | 卸载前 |
| `onUnmounted` | 卸载后(类似 dispose) |
| `onActivated` | KeepAlive 激活 |
| `onDeactivated` | KeepAlive 失活 |

类比 Flutter 06 生命周期 / React useEffect。

---

## 八、Provide / Inject:跨层共享

```ts
// 父
import { provide, ref } from 'vue';

const theme = ref<'light' | 'dark'>('dark');
provide('theme', theme);

// 任何深层后代
import { inject } from 'vue';

const theme = inject<Ref<'light' | 'dark'>>('theme');
```

类比 React Context / Flutter InheritedWidget。

### 类型安全的 InjectionKey

```ts
// keys.ts
import type { Ref, InjectionKey } from 'vue';

export const themeKey: InjectionKey<Ref<'light' | 'dark'>> = Symbol('theme');

// 父
provide(themeKey, theme);

// 子(类型自动推)
const theme = inject(themeKey);
```

---

## 九、Composables:逻辑复用(Vue 的"自定义 Hook")

把一组 ref + watch + 函数 包成函数,以 `use` 开头:

```ts
// composables/useToggle.ts
import { ref } from 'vue';

export function useToggle(initial = false) {
  const value = ref(initial);
  const toggle = () => value.value = !value.value;
  return { value, toggle };
}
```

```vue
<script setup>
import { useToggle } from '@/composables/useToggle';

const { value: open, toggle: toggleOpen } = useToggle();
</script>

<template>
  <button @click="toggleOpen">{{ open ? '关' : '开' }}</button>
</template>
```

类比 React 的自定义 hook,**思路完全一致**。

### 实战:useFetch

```ts
import { ref, watchEffect } from 'vue';

export function useFetch<T>(url: () => string) {
  const data = ref<T | null>(null);
  const error = ref<Error | null>(null);
  const loading = ref(true);

  watchEffect(async (onCleanup) => {
    let cancelled = false;
    onCleanup(() => { cancelled = true; });

    loading.value = true;
    try {
      const r = await fetch(url());
      if (!cancelled) data.value = await r.json();
    } catch (e) {
      if (!cancelled) error.value = e as Error;
    } finally {
      if (!cancelled) loading.value = false;
    }
  });

  return { data, error, loading };
}

// 用
const userId = ref('1');
const { data, loading } = useFetch<User>(() => `/api/users/${userId.value}`);
// userId 改了自动重新请求
```

实战中用 TanStack Query 替代手写。

---

## 十、defineProps:接收 props

```vue
<script setup lang="ts">
type Props = {
  name: string;
  age?: number;
};

const props = defineProps<Props>();

// 默认值
const props = withDefaults(defineProps<Props>(), {
  age: 18,
});

// JS 风格
const props = defineProps({
  name: { type: String, required: true },
  age: { type: Number, default: 18 },
});
</script>
```

### Vue 3.5+ 解构 props 保留响应性

```vue
<script setup lang="ts">
const { name, age = 18 } = defineProps<{ name: string; age?: number }>();

// name / age 是响应式的!
watchEffect(() => console.log(name));
</script>
```

之前版本必须 `props.name`,3.5 之后解构也行。

---

## 十一、defineEmits:声明事件

```vue
<script setup lang="ts">
const emit = defineEmits<{
  click: [];                              // 无参数
  change: [value: string];                // 一个参数
  rename: [oldName: string, newName: string];
}>();

emit('click');
emit('change', 'hello');
emit('rename', '张三', '李四');
</script>
```

类比 React 的 `onClick / onChange` 等回调 prop,**Vue 显式声明哪些事件可触发**。

---

## 十二、defineModel:v-model 自定义组件

```vue
<!-- MyInput.vue -->
<script setup>
const model = defineModel<string>();
const placeholder = defineModel<string>('placeholder');    // 多个 v-model
</script>

<template>
  <input :value="model" @input="model = $event.target.value" />
</template>

<!-- 父 -->
<MyInput v-model="text" v-model:placeholder="hint" />
```

`defineModel` 是 Vue 3.4+ 简化语法,**比之前 `props + emit('update:modelValue')` 简单太多**。

---

## 十三、defineExpose:暴露给父级

子组件默认 `<script setup>` 里的 ref / 函数都不暴露给外部。父级用 ref 拿到这个组件实例时,需要 `defineExpose`:

```vue
<!-- Child.vue -->
<script setup>
const count = ref(0);
const reset = () => count.value = 0;

defineExpose({ count, reset });
</script>

<!-- 父 -->
<script setup>
import Child from './Child.vue';

const childRef = ref<InstanceType<typeof Child> | null>(null);

const handleReset = () => {
  childRef.value?.reset();
};
</script>

<template>
  <Child ref="childRef" />
  <button @click="handleReset">重置</button>
</template>
```

类似 React `useImperativeHandle`,但少用——**优先 props/emit**。

---

## 十四、模板 ref 类型

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue';

const inputRef = ref<HTMLInputElement | null>(null);

onMounted(() => {
  inputRef.value?.focus();
});
</script>

<template>
  <input ref="inputRef" />
</template>
```

### 子组件实例

```vue
<script setup lang="ts">
import Child from './Child.vue';

const childRef = ref<InstanceType<typeof Child> | null>(null);
// childRef.value?.someExposedMethod()
</script>
```

---

## 十五、useTemplateRef(Vue 3.5+)

新写法,更简洁:

```vue
<script setup>
import { useTemplateRef, onMounted } from 'vue';

const inputRef = useTemplateRef<HTMLInputElement>('myInput');

onMounted(() => inputRef.value?.focus());
</script>

<template>
  <input ref="myInput" />
</template>
```

不需要变量名跟 ref 字符串一致。

---

## 十六、setup() 函数(老写法)

`<script setup>` 之前,Composition API 用 `setup()` 函数:

```vue
<script>
import { ref } from 'vue';

export default {
  setup(props, { emit }) {
    const count = ref(0);
    return { count };    // 必须 return 才能在模板用
  }
};
</script>

<template>
  <p>{{ count }}</p>
</template>
```

**新代码全用 `<script setup>`**,这种写法只在某些库 / 老代码里看到。

---

## 十七、VueUse:500+ 现成 Composables

```bash
pnpm add @vueuse/core
```

```ts
import {
  useStorage,        // 自动同步 localStorage
  useMouse,          // 鼠标位置
  useDark,           // 暗黑模式
  useElementSize,    // 元素尺寸
  useDebounce,
  useThrottle,
  useClipboard,
  useFetch,
  useTitle,
  useEventListener,
  useIntersectionObserver,
  // ... 数百个
} from '@vueuse/core';

const { x, y } = useMouse();
const isDark = useDark();
const settings = useStorage('settings', { theme: 'light' });

// settings.value.theme 自动同步到 localStorage
```

**写 Vue 必装**,重复造轮子是浪费。

类似 React 的 react-use,**但 VueUse 更全更稳定**。

---

## 十八、常见模式

### 1. 异步数据 + 加载 / 错误

```vue
<script setup lang="ts">
import { ref, watchEffect } from 'vue';

const data = ref<User | null>(null);
const loading = ref(true);
const error = ref<Error | null>(null);

watchEffect(async () => {
  loading.value = true;
  error.value = null;
  try {
    const r = await fetch(`/api/users/${userId.value}`);
    data.value = await r.json();
  } catch (e) {
    error.value = e as Error;
  } finally {
    loading.value = false;
  }
});
</script>
```

### 2. 自动同步 URL Query

```ts
import { useRouteQuery } from '@vueuse/router';

const search = useRouteQuery('q', '');     // URL ?q=xxx 双向绑定
```

### 3. 防抖输入

```ts
import { ref } from 'vue';
import { useDebounce } from '@vueuse/core';

const query = ref('');
const debounced = useDebounce(query, 300);

watch(debounced, (q) => {
  fetchResults(q);
});
```

### 4. 滚到顶 / 底

```ts
import { useScroll } from '@vueuse/core';

const { y, arrivedState } = useScroll(window);
// arrivedState.bottom 为 true 时到底
```

---

## 十九、Composition API vs Options API 速查

| 功能 | Options API | Composition API |
| --- | --- | --- |
| 数据 | `data() { return { count: 0 } }` | `const count = ref(0)` |
| 方法 | `methods: { ... }` | 普通函数声明 |
| 计算属性 | `computed: { ... }` | `computed(() => ...)` |
| 监听 | `watch: { ... }` | `watch(...)` |
| 生命周期 | `mounted() { ... }` | `onMounted(() => { ... })` |
| 注入 | `inject: ['x']` | `const x = inject('x')` |

新代码全用 Composition API + `<script setup>`。

---

## 二十、和 React Hooks 的对照

| Vue Composition | React Hooks |
| --- | --- |
| `ref(0)` | `useState(0)` |
| `reactive({...})` | 用 `useState` 配多个或 `useReducer` |
| `computed(() => ...)` | `useMemo(() => ..., [deps])` |
| `watch(src, cb)` | `useEffect(cb, [deps])` |
| `watchEffect(cb)` | (无,需手动列依赖) |
| `onMounted(cb)` | `useEffect(cb, [])` |
| `onUnmounted(cb)` | `useEffect(() => () => cb(), [])` |
| `provide / inject` | `Context.Provider / useContext` |
| 自定义 composable | 自定义 hook |
| `defineProps / defineEmits` | TS 类型 + 函数参数 |

**Vue 的"魔法"在响应式追踪**——你不用写依赖数组,Vue 自动知道哪些变了。React 的"魔法"则在 reconciliation。

---

## 二十一、和 Flutter 的对照

| Flutter | Vue Composition |
| --- | --- |
| `_count = 0; setState(...)` | `const count = ref(0); count.value++` |
| `late final Animation = ...` 在 initState | `const x = ref(...)` |
| `initState` | `onMounted` |
| `dispose` | `onUnmounted` |
| `didChangeDependencies` | `watchEffect` |
| `final user = User(...)` | `const user = reactive({...})` |
| `_value` getter | `computed` |
| StateMixin / 工具类 | 自定义 composable |

**Vue 的 Composition API 跟 Flutter 写法极像**,可以说是前端最 Flutter-friendly 的方式。

---

## 二十二、心智模型

```
<script setup> 只跑一次:
  → 创建响应式数据(ref / reactive)
  → 注册 computed / watch / 生命周期
  → 模板根据数据自动渲染并追踪依赖

数据变 → 触发 effect → 模板局部更新 → DOM 改

跟 React 不同:
  React  : 状态变 → 函数重跑 → diff
  Vue    : 状态变 → 直接通知用了它的地方
```

下一篇 14 深入响应式原理(Proxy、effect、tracked deps),理解 Vue 的"魔法"是怎么实现的。
