# JavaScript 异步与事件循环

JavaScript 是**单线程**语言。一个线程跑所有事:UI、DOM、JS、计时器。但 Web 充满异步:网络、用户交互、计时器,都得等。

JS 怎么做到"等"而不卡住?**事件循环**(Event Loop)。

理解事件循环,你才能解释:
- 为什么 `setTimeout(fn, 0)` 不是立刻执行?
- 为什么 `await` 后面的代码会比 `Promise.resolve().then(...)` 晚?
- 为什么 `console.log` 顺序看起来反直觉?

这一篇彻底讲清楚。

---

## 一、JS 单线程的现实

```
浏览器进程
├─ 渲染线程(主线程)→ JS、DOM、布局、绘制都在这跑
├─ 网络线程
├─ 计时器线程
└─ Web Worker(独立 JS 线程,但不能碰 DOM)
```

**主线程被 JS 长任务卡住,UI 就冻住**。这就是为什么前端关心"异步"——把耗时操作扔出去,主线程能继续响应用户。

```js
// ❌ 卡死
function bad() {
  for (let i = 0; i < 1e10; i++) {}     // 主线程被占,页面冻住
}

// ✅ 异步
async function good() {
  await new Promise(r => setTimeout(r, 0));   // 让出主线程
  // ...
}
```

---

## 二、Callback:最早的异步

```js
setTimeout(() => console.log('1s 后'), 1000);
fs.readFile('a.txt', (err, data) => { ... });
button.addEventListener('click', () => { ... });
```

**问题:Callback Hell**

```js
getUser(id, (err, user) => {
  if (err) return done(err);
  getOrders(user.id, (err, orders) => {
    if (err) return done(err);
    getProducts(orders[0].productId, (err, p) => {
      // ...
    });
  });
});
```

错误处理重复,嵌套深,看起来像金字塔。Promise 就是为了解决这个。

---

## 三、Promise:异步操作的"对象化"

### 1. 三种状态

```
pending(等待)
  ├─ resolve → fulfilled(成功)
  └─ reject  → rejected(失败)

状态一旦变化就不可逆。
```

```js
const p = new Promise((resolve, reject) => {
  setTimeout(() => resolve('ok'), 1000);
});

p.then(v => console.log(v));         // 'ok'(1s 后)
p.then(v => console.log(v + '!'));    // 'ok!'(同 1s 触发)
```

### 2. 链式调用

```js
fetch('/api/user')
  .then(r => r.json())              // 返回新 Promise
  .then(user => fetch(`/api/orders/${user.id}`))
  .then(r => r.json())
  .then(orders => console.log(orders))
  .catch(err => console.error(err));
```

每个 `.then` 返回新 Promise,**值会自动透传**。

### 3. 关键 API

```js
Promise.resolve(1)           // 立刻 fulfilled
Promise.reject(new Error())  // 立刻 rejected

Promise.all([p1, p2, p3])    // 全部成功才成功,任一失败立即失败
Promise.allSettled([p1, p2]) // 等所有 settled,无论成败,返回 [{status, value}, ...]
Promise.race([p1, p2])       // 第一个 settled 的胜出
Promise.any([p1, p2])        // 第一个 fulfilled 的胜出(任一失败可继续)
```

**Promise.all 实战**:

```js
const [user, orders, products] = await Promise.all([
  fetchUser(),
  fetchOrders(),
  fetchProducts(),
]);
```

三个请求并发,比串行快 3 倍。

**Promise.allSettled**:不要因为一个失败就全废:

```js
const results = await Promise.allSettled([fetchA(), fetchB(), fetchC()]);
results.forEach(r => {
  if (r.status === 'fulfilled') console.log(r.value);
  else console.error(r.reason);
});
```

---

## 四、async / await:Promise 的语法糖

### 1. 写法

```js
// Promise 链
function load() {
  return fetch('/api/user')
    .then(r => r.json())
    .then(user => fetch(`/api/orders/${user.id}`))
    .then(r => r.json());
}

// async/await
async function load() {
  const user = await fetch('/api/user').then(r => r.json());
  const orders = await fetch(`/api/orders/${user.id}`).then(r => r.json());
  return orders;
}
```

`async` 函数**永远返回 Promise**。`await` = "等这个 Promise resolve,把值拿出来"。

### 2. 错误处理

```js
async function load() {
  try {
    const user = await fetchUser();
    const orders = await fetchOrders(user.id);
    return orders;
  } catch (err) {
    console.error(err);
    return [];
  }
}
```

像同步代码,但实际是异步的。

### 3. 串行 vs 并行(常见错误)

```js
// ❌ 串行(每个等前一个)
const a = await fetchA();
const b = await fetchB();
const c = await fetchC();
// 总耗时 = a + b + c

// ✅ 并行(同时发起)
const [a, b, c] = await Promise.all([fetchA(), fetchB(), fetchC()]);
// 总耗时 = max(a, b, c)
```

只要相互独立,**永远 Promise.all**。这是性能差异最常见的来源。

### 4. Top-level await(2022+)

```js
// ESM 模块顶层可以直接 await
const data = await fetch('/config').then(r => r.json());
export default data;
```

CJS 不行,只在 `type: "module"` 或 `.mjs` 里。

---

## 五、事件循环(Event Loop)

### 1. 核心模型

```
主线程
┌─────────────────────────────────────┐
│  Call Stack(执行栈)                  │
│  执行 JS 代码                          │
└─────────────────────────────────────┘
           ↑ 取出执行
           |
┌──────────┴────────────┐
│  Microtask Queue        │  ← Promise.then / queueMicrotask / MutationObserver
│  (微任务队列)             │
├──────────────────────┤
│  Macrotask Queue        │  ← setTimeout / setInterval / I/O / UI 事件
│  (宏任务队列 = Task Queue)│
└──────────────────────┘
```

**循环规则**:

```
每次循环:
  1. 从宏任务队列取一个执行
  2. 执行过程中产生的微任务,排到微任务队列
  3. 当前宏任务完成后,清空所有微任务(全部跑完)
  4. 渲染(可能,看浏览器策略)
  5. 回到 1
```

**关键**:微任务在每个宏任务后**全部清空**。

### 2. 经典面试题

```js
console.log('1');
setTimeout(() => console.log('2'), 0);
Promise.resolve().then(() => console.log('3'));
console.log('4');
```

输出顺序:**1, 4, 3, 2**

解释:
1. 同步 `console.log('1')` → 1
2. `setTimeout` 进宏任务
3. `Promise.then` 进微任务
4. 同步 `console.log('4')` → 4
5. 当前宏任务(脚本本身)结束,清空微任务 → 3
6. 取下一个宏任务 → 2

### 3. await 后的代码 = 微任务

```js
async function foo() {
  console.log('A');
  await null;             // 等价于 await Promise.resolve()
  console.log('B');       // ← 进微任务队列
}

foo();
console.log('C');
```

输出:**A, C, B**

`await` 之后的代码相当于扔进 `.then`,所以 B 比 C 晚。

### 4. 复杂例子

```js
console.log('1');

setTimeout(() => {
  console.log('2');
  Promise.resolve().then(() => console.log('3'));
}, 0);

Promise.resolve().then(() => {
  console.log('4');
  setTimeout(() => console.log('5'), 0);
});

console.log('6');
```

输出:**1, 6, 4, 2, 3, 5**

逐步分析:
1. 同步:1, 6
2. 微任务清空:4(同时把 5 的 setTimeout 推入宏任务)
3. 宏任务:2(同时把 3 的 then 推入微任务)
4. 微任务清空:3
5. 下一宏任务:5

---

## 六、Microtask vs Macrotask

| 类型 | 来源 |
| --- | --- |
| **微任务** | `Promise.then/catch/finally`、`queueMicrotask`、`MutationObserver` |
| **宏任务** | `setTimeout`、`setInterval`、`setImmediate`(Node)、I/O、UI 事件、`MessageChannel`、`requestAnimationFrame`(浏览器特殊) |

**关键差异**:

```
微任务:当前任务结束后立即清空,优先级更高,会"插队"在下次渲染之前
宏任务:每个循环只取一个,优先级低,渲染穿插其中
```

实战:

```js
// 想"立刻在下一拍跑"  → queueMicrotask 或 Promise.resolve().then
// 想"延迟一帧再跑"    → setTimeout(fn, 0) 或 requestAnimationFrame
// 想"批量更新合并"    → MutationObserver 或微任务
```

---

## 七、setTimeout 的真相

### 1. `setTimeout(fn, 0)` 不是 0ms

```js
console.time('t');
setTimeout(() => console.timeEnd('t'), 0);
// 一般是 4~10ms,浏览器最小延迟限制
```

HTML 规范规定**嵌套 5 层后最少 4ms**。要"下一拍立刻执行"用 `queueMicrotask`。

### 2. 不准时

```js
setTimeout(fn, 1000);
for (let i = 0; i < 1e9; i++) {}    // 主线程被卡 5 秒
// fn 实际 5 秒后才跑
```

**setTimeout 只保证"不会早于"**,不保证准时。

### 3. setTimeout vs queueMicrotask

```js
queueMicrotask(() => console.log('micro'));    // 当前同步代码后立即
setTimeout(() => console.log('macro'), 0);     // 至少 4ms
```

**优先级:微 > 宏**。

---

## 八、requestAnimationFrame(rAF)

```js
function animate() {
  // 改 DOM / 画 canvas
  requestAnimationFrame(animate);
}
animate();
```

- 浏览器**下一帧前**调用,通常 60fps = 每帧 ~16.67ms
- 标签页隐藏时**不跑**(省电)
- **比 setInterval 平滑得多**

动画用 rAF,不要用 setInterval。

---

## 九、并发控制

### 1. 限制并发数

```js
async function pLimit<T>(n: number, jobs: (() => Promise<T>)[]) {
  const results: T[] = [];
  const queue = [...jobs];
  const workers = Array(n).fill(0).map(async () => {
    while (queue.length) {
      const job = queue.shift()!;
      results.push(await job());
    }
  });
  await Promise.all(workers);
  return results;
}

// 使用
await pLimit(3, urls.map(u => () => fetch(u).then(r => r.json())));
```

或直接用库 [`p-limit`](https://www.npmjs.com/package/p-limit)。

### 2. 超时

```js
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
  ]);
}

await withTimeout(fetch('/api'), 5000);
```

或 2024 后用 `AbortSignal.timeout`:

```js
fetch('/api', { signal: AbortSignal.timeout(5000) });
```

### 3. 重试

```js
async function retry<T>(fn: () => Promise<T>, n = 3): Promise<T> {
  for (let i = 0; i < n; i++) {
    try { return await fn(); }
    catch (e) { if (i === n - 1) throw e; }
  }
  throw new Error('unreachable');
}
```

### 4. 取消(AbortController)

```js
const ctl = new AbortController();
fetch('/api', { signal: ctl.signal })
  .catch(e => e.name === 'AbortError' && console.log('cancelled'));

// 取消
ctl.abort();
```

React 中常用于组件 unmount 时取消请求。

---

## 十、常见 Trap

### Trap 1:循环里 await(串行)

```js
// ❌ 串行,慢
for (const id of ids) {
  await fetch(`/api/${id}`);
}

// ✅ 并行
await Promise.all(ids.map(id => fetch(`/api/${id}`)));
```

但是**写操作 / 限速 API**要串行:

```js
// 写操作要串行,避免冲突
for (const id of ids) {
  await db.update(id);
}
```

### Trap 2:async 函数里同步抛错

```js
async function fn() {
  throw new Error('boom');
}

fn().catch(e => console.error(e));   // ✅ 能接住
```

`async` 函数内的同步 throw 会被自动包成 rejected Promise。

### Trap 3:忘了 await

```js
async function save() {
  db.write(...);                // ❌ 没 await,函数已返回,write 还在跑
}

await save();
console.log('done');             // 可能 write 还没完
```

ESLint 规则 `no-floating-promises`(typescript-eslint)能拦住。

### Trap 4:`Promise.all` 一败全败

```js
await Promise.all([p1, p2, p3]);
// p2 失败,p1/p3 的结果丢了
```

不能丢就用 `Promise.allSettled`。

### Trap 5:在 then 里返回 Promise 忘了 return

```js
fetch('/a')
  .then(r => {
    fetch('/b').then(...)   // ❌ 没 return,主链以为完了
  })
  .then(...)
```

```js
.then(r => fetch('/b').then(...))   // ✅ return 了
```

`async/await` 写法不会有这个问题,这也是它优于 then 链的原因之一。

---

## 十一、Node.js 事件循环(简版)

Node 有自己的实现(libuv),阶段比浏览器多:

```
┌───────────────────────────┐
│  timers       (setTimeout/setInterval)
│  pending callbacks
│  idle, prepare
│  poll          (I/O 回调,阻塞处)
│  check         (setImmediate)
│  close callbacks
└───────────────────────────┘
   每阶段结束清空微任务(process.nextTick > Promise.then)
```

**记住**:
- `process.nextTick` 优先级高于 `Promise.then`
- `setImmediate` 在 I/O 回调后执行,`setTimeout(fn, 0)` 在 timer 阶段
- 大部分时候**忽略这些差异,跟浏览器一样**用就行

---

## 十二、生成器(Generator)与异步迭代

### Generator(很少用,但要看懂)

```js
function* gen() {
  yield 1;
  yield 2;
  yield 3;
}

const g = gen();
g.next();    // { value: 1, done: false }
g.next();    // { value: 2, done: false }
g.next();    // { value: 3, done: false }
g.next();    // { value: undefined, done: true }
```

`async/await` 本质就是 generator + Promise 的语法糖。学了 generator 才能彻底懂 async。

### 异步迭代器(`for await of`)

```js
async function* fetchPages() {
  let page = 1;
  while (true) {
    const data = await fetch(`/api?page=${page}`).then(r => r.json());
    if (!data.length) return;
    yield data;
    page++;
  }
}

for await (const page of fetchPages()) {
  console.log(page);
}
```

**SSE / 流式 API / 大文件分页**首选。

### Streams API

```js
const r = await fetch('/large');
const reader = r.body.getReader();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  console.log(value);     // Uint8Array
}
```

或用 `for await of`:

```js
const r = await fetch('/large');
for await (const chunk of r.body) {
  // ...
}
```

LLM 流式响应、视频流处理都是这套。

---

## 十三、Web Worker(真·多线程)

```js
// main.js
const w = new Worker('./worker.js');
w.postMessage({ task: 'heavy' });
w.onmessage = e => console.log(e.data);

// worker.js
self.onmessage = e => {
  const result = compute(e.data);
  self.postMessage(result);
};
```

- Worker **独立线程**,不能碰 DOM
- 主线程通过 `postMessage` 通信(数据是拷贝)
- 适合:加密、图像处理、大数据计算

更轻量的 RPC 风格库:[Comlink](https://github.com/GoogleChromeLabs/comlink)。

---

## 十四、心智模型

```
JS 异步的本质:
  "把要等的事丢出去 → 等到了把回调放队列 → 主线程空了再执行"

事件循环规则:
  1. 跑同步代码到栈空
  2. 清空所有微任务
  3. 浏览器渲染(可能)
  4. 取一个宏任务,回到 1

四个层级:
  同步代码        > 微任务          > 渲染          > 宏任务
  立刻执行         then / micro    每帧 16ms     timer / event

并发模式:
  Promise.all     全部并发,任一败全败
  Promise.allSettled  全部并发,各自报告
  Promise.race    任一胜出
  Promise.any     任一成功
```

---

## 十五、面试自检 checklist

- [ ] 解释 `setTimeout(fn, 0)` 为什么不是 0ms
- [ ] 解释微任务和宏任务的区别
- [ ] 写出经典输出顺序题(1/4/3/2 那种)
- [ ] `Promise.all` vs `allSettled` 的差异
- [ ] async/await 的错误处理
- [ ] 怎么并行发起多个请求
- [ ] 怎么取消 fetch
- [ ] requestAnimationFrame 和 setTimeout 区别
- [ ] await 后的代码本质是什么(微任务)
- [ ] for...of 串行 vs Promise.all 并行的取舍

会答这十个,**异步算过关了**。
