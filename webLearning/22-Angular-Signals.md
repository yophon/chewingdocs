# Angular Signals

Angular 17 正式稳定了 Signals 系统。Signals 是 Angular 的细粒度响应式方案,用来替代 Zone.js 的&quot;全树扫描&quot;,跟 Vue 的 `ref` / SolidJS 的 `createSignal` 是同一类思想。

---

## 一、Signal 基础

```ts
import { signal, computed, effect } from '@angular/core';

// 创建 signal
const count = signal(0);

// 读取
console.log(count());    // 0

// 写入
count.set(1);
count.update(prev => prev + 1);   // 基于旧值更新
count.mutate(v => v.push(...));   // 直接改(数组/对象用)

// 派生:computed
const doubled = computed(() => count() * 2);

// 副作用:effect
effect(() => {
  console.log('count changed:', count());
});
```

跟 Vue ref 的对比:

```ts
// Vue
const count = ref(0);
count.value++;
const doubled = computed(() => count.value * 2);

// Angular
const count = signal(0);
count.update(v => v + 1);
const doubled = computed(() => count() * 2);
```

主要差异:Angular signal 是**函数调用读取**(`count()`),Vue ref 是**属性访问**(`count.value`)。

---

## 二、在组件里使用

```ts
@Component({
  selector: 'app-counter',
  standalone: true,
  template: `
    <p>{{ count() }}</p>
    <p>doubled: {{ doubled() }}</p>
    <button (click)="inc()">+1</button>
  `,
})
export class CounterComponent {
  count = signal(0);
  doubled = computed(() => this.count() * 2);

  inc() {
    this.count.update(v => v + 1);
  }
}
```

模板里 `count()` 就是读取——Angular 编译器把这个调用变成响应式绑定:count 变了,只更新用到它的 DOM 节点。

---

## 三、Signal Input / Output(Angular 17.1+)

新版推荐用 `input()` 代替 `@Input` 装饰器:

```ts
import { Component, input, output, model, computed } from '@angular/core';

@Component({
  selector: 'app-user-card',
  standalone: true,
  template: `
    <h2>{{ fullName() }}</h2>
    <button (click)="select()">选择</button>
  `,
})
export class UserCardComponent {
  // Signal Input
  user = input.required<User>();
  size = input<'sm' | 'md'>('md');          // 有默认值

  // 双向绑定
  isOpen = model(false);

  // Output
  selected = output<User>();

  // computed 直接基于 input signal
  fullName = computed(() => `${this.user().firstName} ${this.user().lastName}`);

  select() {
    this.selected.emit(this.user());
  }
}
```

```html
<!-- 父组件使用 -->
<app-user-card
  [user]="currentUser"
  [(isOpen)]="dialogOpen"
  (selected)="onSelected($event)"
/>
```

### Signal Input vs @Input

| | @Input | input() Signal |
| --- | --- | --- |
| 类型 | 普通属性 | Signal |
| 响应式 | 需要 ngOnChanges | 直接 `inputSignal()` |
| computed | 需要手动 getter | 直接 `computed(() => input())` |
| required | `@Input({ required: true })` | `input.required<T>()` |
| 变换 | `@Input({ transform })` | `input({ transform })` |

---

## 四、effect:响应式副作用

```ts
export class MyComponent {
  private theme = inject(ThemeService);
  private count = signal(0);

  constructor() {
    // 注意:effect 必须在注入上下文里创建(构造函数或 inject 函数中)
    effect(() => {
      document.title = `计数器: ${this.count()}`;
    });

    effect(() => {
      localStorage.setItem('theme', this.theme.current());
    });
  }
}
```

**effect 自动追踪依赖**:函数里读了哪些 signal,那些 signal 变了就重跑。

### 清理副作用

```ts
effect((onCleanup) => {
  const id = setInterval(() => console.log(this.count()), 1000);
  onCleanup(() => clearInterval(id));
});
```

---

## 五、toSignal / toObservable:RxJS 桥接

```ts
import { toSignal, toObservable } from '@angular/core/rxjs-interop';

@Component({ ... })
export class SearchComponent {
  searchQuery = signal('');

  // Signal → Observable → 搜索 API → Signal
  results = toSignal(
    toObservable(this.searchQuery).pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(q => this.http.get<Result[]>(`/api/search?q=${q}`)),
    ),
    { initialValue: [] as Result[] },
  );
}
```

---

## 六、linkedSignal(Angular 18+)

```ts
import { linkedSignal } from '@angular/core';

// 当 source 变化时,自动重置 derived
const page = signal(1);
const pageSize = linkedSignal({
  source: page,
  computation: () => 10,    // page 变了,pageSize 重置为 10
});
```

适合&quot;A 变了就重置 B&quot;这类场景。

---

## 七、resource(Angular 19+,数据获取)

```ts
import { resource } from '@angular/core';

export class UserDetailComponent {
  userId = signal('1');

  // 当 userId 变化时,自动重新请求
  userResource = resource({
    request: () => ({ id: this.userId() }),
    loader: ({ request }) => fetch(`/api/users/${request.id}`).then(r => r.json()),
  });

  // userResource.value()    → 数据
  // userResource.isLoading() → 加载中
  // userResource.error()    → 错误
}
```

```html
@if (userResource.isLoading()) {
  <spinner />
} @else if (userResource.error()) {
  <p>出错了</p>
} @else {
  <h2>{{ userResource.value()?.name }}</h2>
}
```

---

## 八、Zoneless 模式(Angular 18+)

Zone.js 是 Angular 旧的变更检测方式,Signals 让 Zoneless 成为可能:

```ts
// app.config.ts
import { provideExperimentalZonelessChangeDetection } from '@angular/core';

export const appConfig: ApplicationConfig = {
  providers: [
    provideExperimentalZonelessChangeDetection(),   // 不再需要 Zone.js
    provideRouter(routes),
  ],
};
```

Zoneless 的好处:
- 去掉 ~100KB 的 Zone.js
- 变更检测只在 signal 变化时触发,**不再全树扫描**
- 启动更快,运行更快

前提:组件里的状态必须全用 Signals(不能有 `this.xxx = ...` 直接改属性)。

---

## 九、变更检测策略

### 旧版:ChangeDetectionStrategy.OnPush

```ts
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `...`,
})
export class OptimizedComponent {
  @Input() data!: Data;
  private cdr = inject(ChangeDetectorRef);

  onAsyncUpdate() {
    this.cdr.markForCheck();    // 手动通知
  }
}
```

### 新版:Signals 自动搞定

```ts
@Component({
  template: `{{ count() }}`,   // 模板直接用 signal
})
export class ModernComponent {
  count = signal(0);
  // 不需要 OnPush,不需要 markForCheck,框架自动最优化
}
```

---

## 十、常见模式

### 派生状态

```ts
export class ProductListComponent {
  products = signal<Product[]>([]);
  searchQuery = signal('');
  sortBy = signal<'name' | 'price'>('name');

  filteredProducts = computed(() => {
    const q = this.searchQuery().toLowerCase();
    return this.products()
      .filter(p => p.name.toLowerCase().includes(q))
      .sort((a, b) => a[this.sortBy()] > b[this.sortBy()] ? 1 : -1);
  });
}
```

### 本地 UI 状态

```ts
export class DropdownComponent {
  isOpen = signal(false);
  selectedItem = signal<Item | null>(null);

  toggle() { this.isOpen.update(v => !v); }
  select(item: Item) {
    this.selectedItem.set(item);
    this.isOpen.set(false);
  }
}
```

### Service 里的共享状态

```ts
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private _theme = signal<'light' | 'dark'>('light');
  readonly theme = this._theme.asReadonly();   // 只读对外暴露

  toggle() {
    this._theme.update(t => t === 'light' ? 'dark' : 'light');
  }
}
```

---

## 十一、Signals vs Zone.js vs RxJS:各司其职

```
Zone.js(旧,正在淡出)
  适合:遗留代码,自动检测所有异步
  缺点:性能差,包体大,调试难

Signals(新,首选)
  适合:本地组件状态,派生值,UI 交互
  优点:细粒度,性能好,类型安全

RxJS(持续用)
  适合:多值流(HTTP、WebSocket、表单 valueChanges)
  用 toSignal 把流接入 Signal 系统
```

**新项目策略**:本地状态用 Signal,异步流用 RxJS + toSignal,不用 Zone.js。

---

## 十二、和 Vue ref / SolidJS signal 对比

| | Vue ref | SolidJS createSignal | Angular signal |
| --- | --- | --- | --- |
| 读取 | `count.value` | `count()` | `count()` |
| 写入 | `count.value++` | `setCount(v)` | `count.set(v)` / `count.update()` |
| 派生 | `computed()` | `createMemo()` | `computed()` |
| 副作用 | `watchEffect()` | `createEffect()` | `effect()` |
| 双向绑定 | `v-model` | `createSignal` + setter | `model()` |
| 桥接异步 | - | - | `toSignal()` |

**三者思想完全一致**,API 略有差异。Angular 多了 RxJS 桥接。

---

## 十三、心智模型

```
Signal = 可追踪的值
  signal(v)     → 创建
  count()       → 读(触发追踪)
  count.set(v)  → 写(触发更新)
  count.update  → 基于旧值写
  computed()    → 懒计算,有缓存
  effect()      → 自动跑副作用

Angular Signals 和 Zone.js 的区别:
  Zone.js   → 猜:任何异步后扫描整棵树
  Signals   → 精准:只更新订阅了这个 signal 的地方

迁移路线:
  旧代码:Zone.js + ChangeDetection.Default
  过渡期:OnPush + RxJS + async pipe
  新写法:Signals + Zoneless + toSignal
```

下一篇 23 讲 Angular 路由、表单和 HttpClient——三个内置的核心功能,也是 CRUD 应用的骨架。
