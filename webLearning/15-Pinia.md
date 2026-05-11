# Pinia:Vue 状态管理

Pinia 是 Vue 官方推荐的状态管理库,**Vuex 5 的事实版本**(已正式取代 Vuex)。

特点:
- API 极简(比 Vuex 少 50% 概念)
- TypeScript 友好
- 多 store 模块化
- 完美 DevTools 支持
- 跟 Composition API 风格一致

---

## 一、安装

```bash
pnpm add pinia
```

```ts
// main.ts
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';

const app = createApp(App);
app.use(createPinia());
app.mount('#app');
```

---

## 二、定义 Store(setup 风格,推荐)

```ts
// stores/counter.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useCounterStore = defineStore('counter', () => {
  // state
  const count = ref(0);
  const name = ref('张三');

  // getters(就是 computed)
  const doubled = computed(() => count.value * 2);

  // actions(就是函数)
  function increment() {
    count.value++;
  }

  async function loadFromApi() {
    const data = await api.getCounter();
    count.value = data.value;
  }

  return { count, name, doubled, increment, loadFromApi };
});
```

`defineStore` 第一参数是 store 唯一 ID,第二参数是 setup 函数,**写法跟 `<script setup>` 完全一致**。

---

## 三、使用

```vue
<script setup>
import { useCounterStore } from '@/stores/counter';
import { storeToRefs } from 'pinia';

const counter = useCounterStore();

// 直接用
console.log(counter.count);
counter.increment();

// 解构保留响应性 → storeToRefs
const { count, doubled } = storeToRefs(counter);
const { increment } = counter;          // 函数直接解构
</script>

<template>
  <p>{{ counter.count }} (×2 = {{ counter.doubled }})</p>
  <button @click="counter.increment()">+1</button>

  <!-- 解构后 -->
  <p>{{ count }} - {{ doubled }}</p>
</template>
```

⭐ **注意 `storeToRefs`**:直接解构 store 会丢响应性,**必须用 `storeToRefs`**(回顾 14 响应式原理)。

---

## 四、定义 Store(Options 风格,可选)

```ts
export const useCounterStore = defineStore('counter', {
  state: () => ({
    count: 0,
    name: '张三',
  }),
  getters: {
    doubled: (state) => state.count * 2,
  },
  actions: {
    increment() {
      this.count++;
    },
    async loadFromApi() {
      this.count = await api.getCounter();
    },
  },
});
```

类似 Vuex 老风格。**新项目用 setup 风格**,跟组件写法一致。

---

## 五、跨 Store 调用

```ts
// stores/cart.ts
import { defineStore } from 'pinia';
import { useUserStore } from './user';

export const useCartStore = defineStore('cart', () => {
  const items = ref<Item[]>([]);

  const checkout = async () => {
    const userStore = useUserStore();
    if (!userStore.isLoggedIn) throw new Error('未登录');
    await api.checkout(items.value, userStore.user);
  };

  return { items, checkout };
});
```

直接 import 别的 store 用,**没有 Vuex 的 modules 嵌套地狱**。

---

## 六、修改 state 的方式

### 1. 直接改

```ts
counter.count++;
counter.name = '李四';
```

不像 Redux 必须 dispatch,Pinia **直接改**(响应式驱动)。

### 2. patch(批量)

```ts
counter.$patch({
  count: counter.count + 1,
  name: '李四',
});

// 或函数式(更推荐)
counter.$patch((state) => {
  state.count++;
  state.list.push(newItem);
});
```

### 3. reset

```ts
counter.$reset();    // 重置回 state 初始值(只有 Options 风格才有,setup 风格自己实现)
```

setup 风格自己 reset:

```ts
export const useCounterStore = defineStore('counter', () => {
  const count = ref(0);
  function $reset() {
    count.value = 0;
  }
  return { count, $reset };
});
```

---

## 七、Subscribe(订阅变化)

```ts
counter.$subscribe((mutation, state) => {
  console.log('state 变了', state);
  localStorage.setItem('counter', JSON.stringify(state));
});

counter.$onAction(({ name, args, after }) => {
  console.log('action 调用了', name, args);
  after((result) => console.log('结果', result));
});
```

适合做日志、持久化、监控。

---

## 八、持久化:pinia-plugin-persistedstate

```bash
pnpm add pinia-plugin-persistedstate
```

```ts
// main.ts
import { createPinia } from 'pinia';
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate';

const pinia = createPinia();
pinia.use(piniaPluginPersistedstate);
```

```ts
// store
export const useUserStore = defineStore('user', () => {
  const user = ref<User | null>(null);
  return { user };
}, {
  persist: true,        // 全部字段存 localStorage
  // 或精细配置:
  // persist: {
  //   key: 'app-user',
  //   storage: sessionStorage,
  //   paths: ['user'],   // 只持久化某些字段
  // },
});
```

刷新后 store 状态自动恢复。

---

## 九、典型 Store:用户 / 购物车 / 主题

### 用户 store

```ts
// stores/user.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '@/api';

export const useUserStore = defineStore('user', () => {
  const user = ref<User | null>(null);
  const token = ref<string | null>(null);

  const isLoggedIn = computed(() => !!user.value);

  async function login(email: string, password: string) {
    const r = await api.login(email, password);
    user.value = r.user;
    token.value = r.token;
  }

  function logout() {
    user.value = null;
    token.value = null;
  }

  return { user, token, isLoggedIn, login, logout };
}, { persist: true });
```

### 购物车 store

```ts
// stores/cart.ts
export const useCartStore = defineStore('cart', () => {
  const items = ref<{ product: Product; qty: number }[]>([]);

  const total = computed(() =>
    items.value.reduce((sum, i) => sum + i.product.price * i.qty, 0)
  );

  const itemCount = computed(() =>
    items.value.reduce((sum, i) => sum + i.qty, 0)
  );

  function add(product: Product) {
    const exist = items.value.find(i => i.product.id === product.id);
    if (exist) exist.qty++;
    else items.value.push({ product, qty: 1 });
  }

  function remove(productId: string) {
    items.value = items.value.filter(i => i.product.id !== productId);
  }

  function clear() {
    items.value = [];
  }

  return { items, total, itemCount, add, remove, clear };
});
```

```vue
<script setup>
import { storeToRefs } from 'pinia';
import { useCartStore } from '@/stores/cart';

const cart = useCartStore();
const { items, total, itemCount } = storeToRefs(cart);
</script>

<template>
  <div>
    <span>购物车 ({{ itemCount }})</span>
    <ul>
      <li v-for="i in items" :key="i.product.id">
        {{ i.product.name }} × {{ i.qty }}
        <button @click="cart.remove(i.product.id)">删除</button>
      </li>
    </ul>
    <p>总计:¥{{ total }}</p>
  </div>
</template>
```

注意:
- `items`、`total`、`itemCount` 用 `storeToRefs` 解构(保留响应)
- 函数 `cart.remove(...)` 直接用(函数解构无所谓)

---

## 十、Pinia DevTools

Vue DevTools 浏览器扩展自动支持 Pinia:
- 看每个 store 的当前 state
- 看每个 action 调用历史
- 时间旅行(回退到之前的 state)
- 实时编辑

跟 Redux DevTools 类似的体验。

---

## 十一、跟 Zustand / Redux / Riverpod 对比

| 维度 | Pinia | Zustand | Redux Toolkit | Riverpod |
| --- | --- | --- | --- | --- |
| 框架 | Vue | React | React | Flutter |
| API 复杂度 | 低 | 极低 | 中 | 中 |
| 模板代码 | 少 | 极少 | 中等(大幅减少 vs 老 Redux) | 中 |
| TypeScript | 强 | 强 | 强 | 强 |
| 多 store | 天然 | 天然 | reducer 模块 | 全局 provider |
| DevTools | 优秀 | 一般 | 优秀 | 内置 |
| 持久化 | 插件 | 中间件 | 插件 | 手写 |
| 学习曲线 | 平 | 平 | 中 | 中 |

**Pinia 跟 Zustand 体验最像**,Vue 版的 Zustand。

---

## 十二、跟 Vuex 区别(不重要了,但简单提)

```
Vuex             →  Pinia
─────────────       ─────────────
mutations        →  没有(直接改 state)
modules + 命名空间 →  多个独立 store
mapState 等辅助    →  直接 import 用
this.$store      →  useStore()
```

Pinia 把 Vuex 的"模板代码 + 命名空间地狱"全消灭了。

---

## 十三、组合多个 store(派生 / 联动)

```ts
// stores/checkout.ts
export const useCheckoutStore = defineStore('checkout', () => {
  const cart = useCartStore();
  const user = useUserStore();

  const canCheckout = computed(() =>
    user.isLoggedIn && cart.items.length > 0
  );

  async function checkout() {
    if (!canCheckout.value) return;
    await api.placeOrder(cart.items, user.user!);
    cart.clear();
  }

  return { canCheckout, checkout };
});
```

派生跨 store 的状态用 computed,Pinia 自动建立依赖关系。

---

## 十四、SSR(配合 Nuxt)

```ts
// stores/user.ts(Nuxt 自动支持)
export const useUserStore = defineStore('user', () => {
  const user = ref<User | null>(null);
  return { user };
});
```

Nuxt 会自动处理 SSR 序列化 + 客户端 hydration。回顾 17。

---

## 十五、TanStack Query 的位置

```
Pinia          → 全局客户端状态(用户、主题、购物车 UI)
TanStack Query → 服务端数据缓存(API 数据、实时刷新、乐观更新)
```

跟 React 那边一致(回顾 07)。**别把所有 API 数据塞 Pinia**——TanStack Query 现在也支持 Vue。

```ts
import { useQuery } from '@tanstack/vue-query';

const { data, isLoading } = useQuery({
  queryKey: ['users'],
  queryFn: () => api.getUsers(),
});
```

---

## 十六、常见模式

### 1. 异步加载

```ts
export const useUsersStore = defineStore('users', () => {
  const list = ref<User[]>([]);
  const loading = ref(false);
  const error = ref<Error | null>(null);

  async function fetchAll() {
    loading.value = true;
    error.value = null;
    try {
      list.value = await api.getUsers();
    } catch (e) {
      error.value = e as Error;
    } finally {
      loading.value = false;
    }
  }

  return { list, loading, error, fetchAll };
});
```

### 2. 乐观更新

```ts
async function deleteItem(id: string) {
  const backup = items.value;
  items.value = items.value.filter(i => i.id !== id);

  try {
    await api.delete(id);
  } catch (e) {
    items.value = backup;       // 失败回滚
    throw e;
  }
}
```

### 3. WebSocket 推送

```ts
export const useChatStore = defineStore('chat', () => {
  const messages = ref<Message[]>([]);
  let socket: WebSocket | null = null;

  function connect() {
    socket = new WebSocket('wss://...');
    socket.onmessage = (e) => {
      messages.value.push(JSON.parse(e.data));
    };
  }

  function disconnect() {
    socket?.close();
    socket = null;
  }

  return { messages, connect, disconnect };
});
```

---

## 十七、常见坑

### 1. 解构丢响应性

```ts
const { count } = useCounterStore();    // ❌ 普通值
const { count } = storeToRefs(useCounterStore());   // ✅
```

### 2. 在 setup 之外调 useStore

```ts
// utils/something.ts
const cart = useCartStore();    // ❌ 报错:pinia 还没 install
```

→ 把 useStore 调用放函数内部:

```ts
export function doIt() {
  const cart = useCartStore();
  cart.add(...);
}
```

### 3. SSR 状态污染

服务端如果用全局 ref / 全局变量存数据,**多个用户请求共享同一个状态**——隐私事故。
→ 全部走 Pinia store(每个请求独立 pinia 实例)。

Nuxt 自动处理这点。

### 4. 多次 useStore

```ts
const a = useCounterStore();
const b = useCounterStore();
console.log(a === b);    // true,同一个实例
```

不用担心重复创建,Pinia 内部缓存。

### 5. 没用 storeToRefs 解构

```vue
<script setup>
const counter = useCounterStore();
const { count } = counter;          // ❌ 普通值
</script>
<template>
  {{ count }}    <!-- 不响应 -->
</template>
```

---

## 十八、组织建议

```
src/stores/
├── index.ts          可选,统一导出
├── user.ts           用户
├── cart.ts           购物车
├── theme.ts          主题
├── notification.ts   通知
└── ...
```

按业务领域拆分 store,**一个 store 一件事**。

复杂业务:store 内部抽 composable:

```ts
// stores/feature/x.ts
import { defineStore } from 'pinia';

function useUserLogic() {  // 内部 composable
  const user = ref(...);
  // ...
  return { user };
}

export const useFeatureStore = defineStore('feature', () => {
  const userLogic = useUserLogic();
  return { ...userLogic };
});
```

---

## 十九、和 Flutter 状态管理对照

| Flutter | Pinia |
| --- | --- |
| `Riverpod NotifierProvider` | `defineStore` setup 风格 |
| `ref.watch(provider)` | `useStore()` |
| `ref.read(provider)` | `useStore()` (函数调用,不订阅) |
| `Riverpod 的 .select` | `storeToRefs` + computed |
| `BlocCubit + emit` | `defineStore` actions |
| `Riverpod autoDispose` | 没自动,但 store 跟着 app 周期 |

**心智一致**:store 是逻辑容器,组件按需订阅。

---

## 二十、心智模型

```
Pinia 是 "Vue 版 Zustand":

一个 store = 一组相关的 state + getter + action
defineStore  →  组件外定义
useXxxStore() →  组件内取
storeToRefs   →  保留响应解构
state 直接改  →  不用 dispatch / mutation

跨 store:直接 import 用
持久化:plugin
SSR:Nuxt 自动管

服务端数据 → TanStack Query(别塞 Pinia)
```

下一篇 16 讲 Vue Router——Vue 官方路由,跟前面 React Router 思路一致但更简洁。
