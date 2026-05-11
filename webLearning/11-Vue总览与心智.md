# Vue 总览与心智

Vue 是尤雨溪 2014 年开源的 UI 框架。**直觉简单、上手最快**,在国内尤其流行。

跟 React 比,Vue 的核心差异:
- **模板** 而不是 JSX
- **响应式数据自动追踪** 而不是手动 setState
- **官方全家桶**(Router、Pinia、Nuxt 都是官方)

---

## 一、Vue 的核心心智

```vue
<script setup>
import { ref } from 'vue';

const count = ref(0);
</script>

<template>
  <button @click="count++">{{ count }}</button>
</template>
```

只看这 5 行,你就理解了 Vue 的全部哲学:

1. **数据是响应式的**:`ref(0)` 包了一层,Vue 知道它何时被读、何时被改
2. **模板里直接用**:`{{ count }}` 自动建立依赖
3. **改值就这么改**:`count++` 直接写,Vue 内部触发更新
4. **只更新用了它的地方**:不重跑整个组件

类比 Flutter 的 `ValueNotifier + ValueListenableBuilder`(回顾 02):**精准刷新,但 API 像普通变量**。

---

## 二、跟 React 的核心对比

```jsx
// React
function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

```vue
<!-- Vue -->
<script setup>
const count = ref(0);
</script>
<template>
  <button @click="count++">{{ count }}</button>
</template>
```

| 维度 | React | Vue |
| --- | --- | --- |
| 模板 | JSX(JS 表达式) | 模板字符串(类 HTML) |
| 状态修改 | `setCount(c => c + 1)` | `count++` 直接改 |
| 重新渲染 | 整个函数重跑 + diff | 依赖追踪,只更新用到的 |
| 事件 | `onClick={fn}` | `@click="fn"` |
| 条件 | `{x && <p />}` | `v-if="x"` |
| 列表 | `items.map(...)` | `v-for="..."` |
| 双向绑定 | 手写 value + onChange | `v-model` 一行 |

Vue 学起来感觉"啊,这个就该这样",直觉性最强。React 需要更多规则解释。

---

## 三、Vue 2 vs Vue 3:别学错版本

```
Vue 2  : Options API,旧版,2023 年底停止维护
Vue 3  : Composition API + Options API,**当前版本**

新项目 100% 用 Vue 3。**别看 Vue 2 教程**。
```

---

## 四、Options API vs Composition API

Vue 3 支持两种组件写法。

### Options API(老,适合教学)

```vue
<script>
export default {
  data() {
    return { count: 0 };
  },
  methods: {
    increment() { this.count++; }
  },
  computed: {
    doubled() { return this.count * 2; }
  },
  mounted() {
    console.log('挂载了');
  }
};
</script>
```

按"选项"组织:`data` / `methods` / `computed` / `watch` / `mounted` 等。**新人友好,大组件难维护**。

### Composition API + `<script setup>`(推荐)

```vue
<script setup>
import { ref, computed, onMounted } from 'vue';

const count = ref(0);
const increment = () => count.value++;
const doubled = computed(() => count.value * 2);

onMounted(() => console.log('挂载了'));
</script>
```

按"逻辑"组织:相关代码放一起。
**所有新项目用 `<script setup>` + Composition API**。

类比 React Hooks——把同一个特性的状态、计算、副作用聚合在一起,而不是按"类型"分散到 data / computed / methods 几个区。

---

## 五、SFC(单文件组件)

Vue 的特色:一个 `.vue` 文件包含三块。

```vue
<script setup>
// 逻辑
const count = ref(0);
</script>

<template>
  <!-- UI -->
  <button @click="count++">{{ count }}</button>
</template>

<style scoped>
/* 样式,scoped 只在本组件生效 */
button { color: red; }
</style>
```

**逻辑、UI、样式同处一个文件**,但又分块清晰。Vue 称之为 SFC(Single File Component)。

类似 Flutter 把 widget、state、style 都写在一个 .dart 文件,但 Vue 用三个区块更清晰。

---

## 六、安装与起项目

```bash
pnpm create vue@latest
# 一路选:TypeScript / Vue Router / Pinia / ESLint / Prettier 全选

cd my-project
pnpm install
pnpm dev
```

或者用 Vite 直接起:

```bash
pnpm create vite my-app --template vue-ts
```

### 项目结构

```
my-app/
├── index.html
├── src/
│   ├── main.ts                启动入口
│   ├── App.vue                根组件
│   ├── components/
│   ├── views/                 路由页面
│   ├── stores/                Pinia
│   ├── router/                Vue Router
│   └── assets/
├── public/
├── vite.config.ts
└── tsconfig.json
```

### main.ts

```ts
import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import { createPinia } from 'pinia';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');
```

类似 React 的 `ReactDOM.createRoot(...).render(<App />)`。

---

## 七、第一个组件

```vue
<!-- src/components/UserCard.vue -->
<script setup lang="ts">
type Props = {
  name: string;
  age?: number;
};

const props = defineProps<Props>();
const emit = defineEmits<{
  click: [];
  rename: [newName: string];
}>();
</script>

<template>
  <div class="card" @click="emit('click')">
    <h3>{{ props.name }}</h3>
    <p v-if="props.age">{{ props.age }} 岁</p>
    <button @click="emit('rename', '新名字')">改名</button>
  </div>
</template>

<style scoped>
.card {
  padding: 16px;
  border: 1px solid #eee;
}
</style>
```

使用:

```vue
<script setup>
import UserCard from './components/UserCard.vue';

const onRename = (n: string) => console.log(n);
</script>

<template>
  <UserCard
    name="张三"
    :age="20"
    @click="console.log('clicked')"
    @rename="onRename"
  />
</template>
```

注意:
- `defineProps` / `defineEmits` 是 Vue 编译宏,**不需要 import**
- 静态值用 `name="张三"`,动态值加 `:` → `:age="20"`
- 事件用 `@xxx`

类比 React:
- `defineProps` ≈ Props 类型
- `defineEmits` ≈ 回调 props(`onClick`)

---

## 八、Vue 的"五大武器"

每个都跟 React 有清晰对应:

| Vue | React | 用途 |
| --- | --- | --- |
| `ref` / `reactive` | `useState` | 响应式数据 |
| `computed` | `useMemo` | 派生值 |
| `watch` / `watchEffect` | `useEffect` | 副作用 |
| `provide` / `inject` | `Context` | 跨层共享 |
| `<script setup>` 自动暴露 | 函数返回值 | 模板可用 |

学会这五样,Vue 的核心就掌握了。

---

## 九、和 Flutter 的对照

| Flutter | Vue |
| --- | --- |
| `StatelessWidget` | 没 ref / reactive 的组件 |
| `StatefulWidget + setState` | `ref + count.value++` |
| `ValueNotifier + ValueListenableBuilder` | `ref` + 模板自动追踪 |
| `ChangeNotifier + ListenableBuilder` | `reactive(...)` |
| `BuildContext + InheritedWidget` | `provide / inject` |
| `Riverpod` | Pinia |
| `Bloc` | Pinia + actions(可写得像) |
| `go_router` | Vue Router |
| `freezed` | TS 类型 + 各种 schema 库 |
| Hot Reload | Vite HMR |

**心智惊人地一致**。如果你 Flutter 用得熟,Vue 几乎不需要重新学。

---

## 十、Vue 的优势

### 1. 上手最快
模板就是 HTML 加几个新指令,前端老手 1 小时入门。

### 2. 文档第一(中文友好)
Vue 官方中文文档质量极高,**没有比这更好的中文前端框架文档**。

### 3. 国内生态强
Element Plus、Ant Design Vue、Naive UI、Vuetify、Quasar——主流 UI 库齐全。

### 4. 性能好
依赖追踪 + 编译优化,**默认就快**,不用太多手动优化。

### 5. 全家桶官方
Router、Pinia、Nuxt 都是官方维护,**版本永远兼容**。
React 的 Router、状态管理、SSR 是各自社区做的,版本对齐有时麻烦。

---

## 十一、Vue 的劣势

### 1. 模板的限制
JSX 是 JS 表达式,任何动态结构都能写;模板表达性受限,复杂逻辑只能拆组件 / 用 `<component :is>`。

### 2. 类型推导没 React 强
TS + 模板的结合不如 TS + JSX 自然。但 Vue 3 改进很多,2026 年体验已经接近。

### 3. 国际化生态弱一些
英文社区中 React > Vue,海外公司更多用 React,招人也是。

### 4. 双向绑定的"魔法"
v-model、响应式追踪用多了,新人容易"什么都不知道发生了"。

---

## 十二、Vue 3 的版本节点

| 版本 | 特性 |
| --- | --- |
| 3.0(2020) | Composition API 上线 |
| 3.2 | `<script setup>` 稳定,defineProps/Emits |
| 3.3 | 泛型组件、defineModel |
| 3.4 | 响应式重构,加速 |
| 3.5+ | Reactive props destructure(props 解构响应式) |

**新项目用 3.4+**,享受最新 DX。

---

## 十三、生态地图

```
Vue 核心
  ├─ Vue Router(官方,见 16)
  ├─ Pinia(官方,状态管理,见 15)
  ├─ Nuxt(官方,SSR / 全栈,见 17)
  ├─ VueUse(官方,500+ Composable)
  ├─ UI 库     :Element Plus / Naive UI / Vuetify / Quasar / Ant Design Vue
  ├─ 表单      :VeeValidate / FormKit / 手写
  ├─ 数据获取   :TanStack Query(支持 Vue)/ unjs/ofetch / axios
  ├─ 测试      :Vitest + Vue Test Utils / Playwright
  └─ 移动端    :Vue Native(已停)/ Quasar / Tauri / Capacitor
```

---

## 十四、Vue 项目"标配栈"(2026)

```
Vite              开发服务器 / 打包
TypeScript        类型
Vue 3.4+          UI
<script setup>    组件写法
Pinia             状态管理
Vue Router        路由(SPA)/ Nuxt(SSR)
VueUse            常用 Composable 工具集
TanStack Query    服务端数据(也兼容 Vue)
VeeValidate + zod 表单
Tailwind          样式
Element Plus      UI 库(国内最常用)
Vitest + VTU      测试
ESLint + Prettier 代码规范
pnpm              包管理
```

---

## 十五、第一周练习建议

1. `pnpm create vue@latest` 起项目
2. 写 Todo List(增删改查 + 选中)
3. 用 Pinia 管 todos
4. 加 Vue Router 做"全部 / 已完成"两个 tab
5. 加 LocalStorage 持久化(Pinia 的 persist 插件)
6. 加滤镜(VeeValidate + zod 校验输入)

写完你就有 Vue 的"肌肉记忆"。

---

## 十六、心智模型

```
Vue 核心心智:
  数据是响应式的(ref / reactive)
  模板自动追踪依赖
  数据变 → 只更新用了它的地方,不重跑组件

跟 React 的不同:
  React  : "状态 → 重跑函数 → diff DOM"
  Vue    : "状态 → 自动追踪谁用了 → 精准更新"

跟 Flutter 的对应:
  Vue ≈ ValueNotifier + ValueListenableBuilder
  ref.value ≈ notifier.value
  模板 ≈ ValueListenableBuilder 包裹的部分
```

下一篇 12 详讲模板与指令,把 Vue 的 UI 描述方式说透。
