# Vue 模板与指令

Vue 的 UI 描述方式是 **模板**(类 HTML),不是 JSX。模板里通过 **指令**(以 `v-` 开头)和插值(`{{}}`)实现动态行为。

理解模板和指令,你写 Vue UI 就没有门槛了。

---

## 一、插值:{{}}

```vue
<template>
  <h1>{{ title }}</h1>
  <p>{{ user.name }} - {{ user.age + 1 }} 岁</p>
  <p>{{ isDone ? '完成' : '进行中' }}</p>
  <p>{{ items.length }}</p>
</template>
```

`{{}}` 内是 **JS 表达式**,但只能是表达式不能是语句:

```vue
{{ if (x) ... }}     ❌ 语句
{{ x ? a : b }}      ✅
{{ items.filter(x => x.done).length }}    ✅
```

类似 React JSX 的 `{}`。

---

## 二、属性绑定:v-bind / :

```vue
<img v-bind:src="imageUrl" />
<img :src="imageUrl" />               <!-- 简写 -->

<a :href="`/user/${id}`">详情</a>
<button :disabled="isLoading">提交</button>
<div :class="theme">...</div>
<div :style="{ color: textColor, fontSize: '16px' }">...</div>
```

### 动态 class

```vue
<!-- 对象语法 -->
<div :class="{ active: isActive, error: hasError }"></div>

<!-- 数组 -->
<div :class="['btn', isActive ? 'btn-active' : '']"></div>
<div :class="['btn', { 'btn-active': isActive }]"></div>
```

### 动态 style

```vue
<div :style="{ color: 'red', fontSize: size + 'px' }"></div>
<div :style="[baseStyle, overrideStyle]"></div>
```

类比 React:
```jsx
<img src={imageUrl} className={isActive ? 'active' : ''} />
```

Vue 用对象/数组语法处理条件 class,**比 React 的 clsx 更直接**。

---

## 三、事件绑定:v-on / @

```vue
<button v-on:click="handleClick">click</button>
<button @click="handleClick">click</button>            <!-- 简写 -->

<button @click="count++">+1</button>                   <!-- 内联 -->
<button @click="handleClick($event, 'extra')">click</button>

<input @keyup.enter="submit" />                        <!-- 修饰符:回车键触发 -->
<form @submit.prevent="onSubmit">                      <!-- .prevent = preventDefault -->
<button @click.stop="...">                             <!-- .stop = stopPropagation -->
```

### 修饰符大全

```vue
@click.stop          阻止冒泡
@click.prevent       阻止默认
@click.capture       捕获阶段
@click.self          只在自己触发(不在子级)
@click.once          只触发一次
@click.passive       不阻止滚动

@keyup.enter         回车
@keyup.esc           ESC
@keyup.tab
@keyup.delete
@keyup.up/down/left/right
@keyup.ctrl.c        Ctrl+C
@keyup.alt.s
```

类比 React 的 `e.preventDefault()` / `e.stopPropagation()`,Vue **修饰符方式更声明式**。

---

## 四、双向绑定:v-model

最香的 Vue 特性。

```vue
<script setup>
const message = ref('');
const checked = ref(false);
const selected = ref('');
</script>

<template>
  <input v-model="message" />
  <p>{{ message }}</p>

  <input type="checkbox" v-model="checked" />

  <select v-model="selected">
    <option value="a">A</option>
    <option value="b">B</option>
  </select>

  <textarea v-model="message"></textarea>
</template>
```

`v-model` 等价于:

```vue
<input :value="message" @input="message = $event.target.value" />
```

它是"语法糖",但比 React 受控组件 `value + onChange` 简洁太多。

### 修饰符

```vue
<input v-model.lazy="msg" />    <!-- change 时才更新(不是 input) -->
<input v-model.number="age" />  <!-- 自动转数字 -->
<input v-model.trim="name" />   <!-- 自动去首尾空格 -->
```

---

## 五、条件渲染:v-if / v-else / v-show

```vue
<p v-if="loading">加载中</p>
<p v-else-if="error">错</p>
<p v-else>{{ data }}</p>

<p v-show="isVisible">显示/隐藏(用 CSS display)</p>
```

| 指令 | 行为 |
| --- | --- |
| `v-if` | 不满足时**完全不渲染**(DOM 里没有) |
| `v-show` | 始终渲染,用 `display: none` 控制 |

频繁切换用 `v-show`(只切 CSS,快);很少切换用 `v-if`(节省 DOM)。

类比 React:`{x ? <A /> : <B />}` / `{x && <A />}`,Vue 写起来更像声明式。

---

## 六、列表渲染:v-for

```vue
<ul>
  <li v-for="item in items" :key="item.id">
    {{ item.name }}
  </li>
</ul>

<!-- 带索引 -->
<li v-for="(item, index) in items" :key="item.id">
  {{ index + 1 }}. {{ item.name }}
</li>

<!-- 遍历对象 -->
<li v-for="(value, key) in obj" :key="key">
  {{ key }}: {{ value }}
</li>

<!-- 数字 -->
<span v-for="n in 5" :key="n">{{ n }}</span>     <!-- 1, 2, 3, 4, 5 -->
```

**必须给 `:key`**(回顾 03 React、07 Flutter,概念一样)。

### v-for + v-if(优先级)

```vue
<!-- ❌ Vue 3 里 v-if 优先级更高,这里 item 还没解构 -->
<li v-for="item in items" v-if="item.active">

<!-- ✅ 用 template 包一层 -->
<template v-for="item in items" :key="item.id">
  <li v-if="item.active">{{ item.name }}</li>
</template>

<!-- 或在 computed 里过滤 -->
<li v-for="item in activeItems" :key="item.id">
```

---

## 七、计算属性:computed

```vue
<script setup>
import { ref, computed } from 'vue';

const firstName = ref('张');
const lastName = ref('三');

const fullName = computed(() => `${firstName.value}${lastName.value}`);
</script>

<template>
  <p>{{ fullName }}</p>
</template>
```

**自动追踪依赖**:`firstName` / `lastName` 变化才重新计算。

### computed 和 method 的区别

```vue
<script setup>
const items = ref([...]);

// 方法:每次模板访问都重新执行
const getActiveCount = () => items.value.filter(i => i.active).length;

// computed:只在依赖变化时执行,结果缓存
const activeCount = computed(() => items.value.filter(i => i.active).length);
</script>

<template>
  <p>{{ getActiveCount() }}</p>     <!-- 每次 rerender 都跑 -->
  <p>{{ activeCount }}</p>          <!-- 只在 items 变化时跑 -->
</template>
```

类比 React 的 `useMemo`,**Vue 的 `computed` 更自然**(不用写依赖数组)。

### 可写 computed(罕用)

```ts
const fullName = computed({
  get: () => `${firstName.value} ${lastName.value}`,
  set: (v) => {
    [firstName.value, lastName.value] = v.split(' ');
  },
});
```

---

## 八、监听:watch / watchEffect

```vue
<script setup>
import { ref, watch, watchEffect } from 'vue';

const count = ref(0);
const id = ref(1);

// 监听一个
watch(count, (newVal, oldVal) => {
  console.log(`${oldVal} → ${newVal}`);
});

// 监听多个
watch([count, id], ([c, i], [oldC, oldI]) => { ... });

// 监听对象的某属性
watch(() => user.name, (newName) => { ... });

// watchEffect:自动追踪所有用到的响应式变量
watchEffect(() => {
  console.log(count.value);
  fetchUser(id.value);
});
</script>
```

| API | 何时跑 | 适合 |
| --- | --- | --- |
| `watch` | 显式 watch 的源变化 | 想精确指定监听对象 |
| `watchEffect` | 内部用到的响应式变量变化 | 写起来更直接 |

类比 React:
- `watch` ≈ `useEffect(() => {...}, [a, b])`
- `watchEffect` ≈ "自动收集依赖的 useEffect"(React 里没有)

### 选项

```ts
watch(source, callback, {
  immediate: true,    // 立即执行一次
  deep: true,         // 深度监听对象内部变化
  flush: 'post',      // 'pre' / 'post' / 'sync' (默认 pre)
});
```

---

## 九、模板引用:ref

操作 DOM 或调子组件方法:

```vue
<script setup>
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

**注意命名**:`<input ref="inputRef">` 和 `const inputRef = ref(null)` 名字必须一致。

类似 React 的 `useRef`。

### 函数 ref(动态)

```vue
<input :ref="el => itemRefs.push(el)" />
```

---

## 十、组件传值

```vue
<!-- 子:Child.vue -->
<script setup lang="ts">
type Props = {
  name: string;
  age?: number;
};

const props = defineProps<Props>();
const emit = defineEmits<{
  click: [];
  change: [value: string];
}>();

// 不是必须,只有用模板里直接 props.name 才不需要解构
</script>

<template>
  <div @click="emit('click')">{{ props.name }} - {{ props.age ?? 18 }}</div>
  <input @input="emit('change', ($event.target as HTMLInputElement).value)" />
</template>

<!-- 父 -->
<script setup>
import Child from './Child.vue';

const onChange = (v: string) => console.log(v);
</script>

<template>
  <Child name="张三" :age="20" @click="..." @change="onChange" />
</template>
```

### 默认值

```ts
const props = withDefaults(defineProps<Props>(), {
  age: 18,
});
```

### v-model 上自定义组件

```vue
<!-- 子 -->
<script setup>
const model = defineModel<string>();
</script>

<template>
  <input :value="model" @input="model = $event.target.value" />
</template>

<!-- 父 -->
<MyInput v-model="text" />
```

`defineModel` 是 Vue 3.4+ 的简化语法。

---

## 十一、插槽 Slots(类似 children)

### 默认插槽

```vue
<!-- Card.vue -->
<template>
  <div class="card">
    <slot></slot>     <!-- 父级内容塞这里 -->
  </div>
</template>

<!-- 父 -->
<Card>
  <h1>标题</h1>
  <p>内容</p>
</Card>
```

类比 React 的 `children`。

### 具名插槽

```vue
<!-- Layout.vue -->
<template>
  <header><slot name="header" /></header>
  <main><slot /></main>
  <footer><slot name="footer" /></footer>
</template>

<!-- 父 -->
<Layout>
  <template #header>头部</template>
  <p>主体</p>
  <template #footer>底部</template>
</Layout>
```

类比 React 的多 slot props 模式。

### 作用域插槽

子级把数据传给插槽内容:

```vue
<!-- List.vue -->
<template>
  <ul>
    <li v-for="item in items" :key="item.id">
      <slot :item="item" :index="i">{{ item.name }}</slot>     <!-- 默认渲染 -->
    </li>
  </ul>
</template>

<!-- 父 -->
<List :items="items">
  <template #default="{ item, index }">
    <strong>{{ index }}. {{ item.name }}</strong>
  </template>
</List>
```

类比 React 的 render prop 模式。

---

## 十二、动态组件

```vue
<component :is="currentComponent" />
```

```vue
<script setup>
import Home from './Home.vue';
import About from './About.vue';

const tabs = { Home, About };
const current = ref('Home');
</script>

<template>
  <button v-for="t in Object.keys(tabs)" @click="current = t">{{ t }}</button>
  <component :is="tabs[current]" />
</template>
```

类似 React 的 `{Component && <Component />}`,但 Vue 直接 `<component :is>` 更声明式。

### KeepAlive(类似 PageView 缓存)

```vue
<KeepAlive>
  <component :is="currentComponent" />
</KeepAlive>
```

切换时**不销毁组件,保留状态**。回顾 Flutter 的 PageView + AutomaticKeepAlive(32)。

---

## 十三、Teleport(类似 React Portal)

```vue
<Teleport to="body">
  <div class="modal">...</div>
</Teleport>
```

把这块渲染到 `body` 末尾,不受当前父级 z-index 影响。

类比 React `createPortal`,**Vue 自带**。

---

## 十四、Suspense(异步组件)

```vue
<Suspense>
  <template #default>
    <AsyncComponent />
  </template>
  <template #fallback>
    <Spinner />
  </template>
</Suspense>
```

```vue
<!-- AsyncComponent.vue -->
<script setup>
const data = await fetch('/api/data').then(r => r.json());
</script>
```

`<script setup>` 顶层 `await`,**Vue 自动包成 Suspense**。

---

## 十五、渲染函数(如果一定要用 JSX)

少数场景模板表达不够时,可以写 render function 或 JSX:

```vue
<script setup lang="tsx">
import { ref } from 'vue';

const count = ref(0);
</script>

<template>
  <button @click="count++">{{ count }}</button>
</template>
```

或纯 TSX:

```tsx
import { defineComponent, ref } from 'vue';

export default defineComponent(() => {
  const count = ref(0);
  return () => <button onClick={() => count.value++}>{count.value}</button>;
});
```

**99% 用模板就好**,JSX 仅在动态结构特别复杂时考虑。

---

## 十六、常见模板技巧

### 1. v-html(渲染 HTML 字符串)

```vue
<div v-html="rawHtml"></div>
```

⚠️ XSS 风险,**只对受信任内容用**。

### 2. v-pre(跳过编译)

```vue
<span v-pre>{{ this will not compile }}</span>
```

适合显示模板示例。

### 3. v-once(只渲染一次)

```vue
<span v-once>{{ neverChange }}</span>
```

性能优化,**这块永不更新**。

### 4. v-memo(缓存渲染)

```vue
<div v-memo="[value]">...</div>
```

`value` 没变就不重新渲染这块。少用。

---

## 十七、常见坑

### 1. 直接修改 props

```vue
<script setup>
const props = defineProps<{ name: string }>();
props.name = '改了';   // ❌ 报错
</script>
```

→ props 只读,**通过 emit 让父级改**。

### 2. 解构 props 失去响应式

```vue
<script setup>
const { name, age } = defineProps<...>();
// ❌ name / age 是普通变量,父级改了这里看不到

// ✅ Vue 3.5+ 自动保留响应性
// 或 watch(() => props.name, ...)
</script>
```

Vue 3.5+ 加了 reactive props destructure,默认就响应。

### 3. v-for 没 key

→ 列表更新时 DOM 错乱(同 React,回顾 03)。

### 4. ref 忘了 .value

```ts
const count = ref(0);
console.log(count);         // 是 ref 对象
console.log(count.value);   // 0
```

模板里 Vue 自动解包,**JS 里必须 `.value`**。详细见 13。

### 5. 在 setup 顶层 if

```vue
<script setup>
if (cond) {
  const x = ref(0);   // ❌ 条件语句无意义,setup 只跑一次
}
</script>
```

setup 跟 React 函数组件不同,**只跑一次**。条件状态用 ref + computed 处理。

### 6. v-model 用在数组项

```vue
<input v-for="(item, i) in items" v-model="item" />   <!-- ❌ 改不了 -->
<input v-for="(item, i) in items" v-model="items[i]" />   <!-- ✅ -->
```

---

## 十八、跟 React 模板的对照速查

| 需求 | React | Vue |
| --- | --- | --- |
| 插值 | `{name}` | `{{ name }}` |
| 属性 | `className={x}` | `:class="x"` |
| 事件 | `onClick={fn}` | `@click="fn"` |
| 条件 | `{x && <p />}` | `v-if="x"` |
| 列表 | `items.map(x => <li key={x.id}>{x.n}</li>)` | `<li v-for="x in items" :key="x.id">{{ x.n }}</li>` |
| 双向绑定 | 手写 value + onChange | `v-model` |
| 子内容 | `props.children` | `<slot>` |
| 跨层渲染 | `createPortal` | `<Teleport>` |
| 异步 | `<Suspense>` | `<Suspense>` |
| 派生 | `useMemo` | `computed` |

---

## 十九、心智模型

```
模板  : 类 HTML,描述 UI 形状
{{}}  : 插值表达式
:x    : 动态属性绑定
@x    : 事件
v-if/show: 条件
v-for : 列表
v-model: 双向绑定(input)

模板自动追踪用了哪些响应式变量:
  数据变 → Vue 知道哪些模板片段用了 → 只更新那些片段
```

下一篇 13 讲 Composition API 完整体系,把 Vue 的"逻辑层"全说透。
