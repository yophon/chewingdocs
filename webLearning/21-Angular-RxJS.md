# RxJS 在 Angular 中的应用

RxJS 是 Angular 处理异步的核心工具。HttpClient 返回 Observable,路由、表单、事件都是流。理解 RxJS 是读懂 Angular 代码的前提。

---

## 一、什么是 Observable

```ts
import { Observable, of, from, interval } from 'rxjs';

// 创建
const obs$ = new Observable<number>(subscriber => {
  subscriber.next(1);
  subscriber.next(2);
  subscriber.complete();
});

// 订阅
obs$.subscribe({
  next: v => console.log(v),
  error: e => console.error(e),
  complete: () => console.log('完成'),
});
```

Observable 是**懒执行的数据流**:不订阅就不执行,每次订阅独立运行。

跟 Promise 对比:

| | Promise | Observable |
| --- | --- | --- |
| 值的数量 | 一个 | 零到无限个 |
| 执行时机 | 立即 | 订阅时 |
| 可取消 | 不行 | `unsubscribe()` |
| 操作符 | `.then/.catch` | 丰富的操作符 |

---

## 二、Angular 里最常用的 Observable 来源

### HttpClient(最常用)

```ts
@Injectable({ providedIn: 'root' })
export class UserService {
  private http = inject(HttpClient);

  getUsers() {
    return this.http.get<User[]>('/api/users');    // Observable<User[]>
  }

  getById(id: string) {
    return this.http.get<User>(`/api/users/${id}`);
  }
}
```

### Router 事件

```ts
export class AppComponent {
  private router = inject(Router);

  ngOnInit() {
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(e => console.log('路由变了', e));
  }
}
```

### ActivatedRoute 参数

```ts
export class UserDetailComponent {
  private route = inject(ActivatedRoute);

  ngOnInit() {
    this.route.params
      .pipe(switchMap(params => this.userService.getById(params['id'])))
      .subscribe(user => this.user = user);
  }
}
```

### FormControl 值变化

```ts
this.searchControl.valueChanges
  .pipe(debounceTime(300), distinctUntilChanged())
  .subscribe(q => this.search(q));
```

---

## 三、核心操作符

### map / filter(变换 + 过滤)

```ts
this.http.get<User[]>('/api/users').pipe(
  map(users => users.filter(u => u.active)),    // 过滤活跃用户
  map(users => users.sort((a, b) => a.name.localeCompare(b.name))),
).subscribe(users => this.users = users);
```

### switchMap(切换内部流,最重要)

```ts
// 搜索:用户快速输入时,只保留最新请求
this.searchControl.valueChanges.pipe(
  debounceTime(300),
  distinctUntilChanged(),
  switchMap(q => this.http.get<Result[]>(`/api/search?q=${q}`)),
).subscribe(results => this.results = results);
```

`switchMap` 的核心:新值来了,**取消上一个内部 Observable,订阅新的**。避免竞态条件。

### mergeMap(并发执行)

```ts
// 并发上传多个文件
from(fileList).pipe(
  mergeMap(file => this.uploadService.upload(file)),
).subscribe(result => this.onUploaded(result));
```

### concatMap(顺序执行)

```ts
// 顺序提交操作日志
from(pendingActions).pipe(
  concatMap(action => this.http.post('/api/log', action)),
).subscribe();
```

### catchError(错误处理)

```ts
this.http.get<User[]>('/api/users').pipe(
  catchError(err => {
    console.error('请求失败', err);
    return of([]);     // 返回空数组作为降级
  }),
).subscribe(users => this.users = users);
```

### tap(调试 / 副作用)

```ts
this.http.get<User[]>('/api/users').pipe(
  tap(users => console.log('got', users.length)),
).subscribe(users => this.users = users);
```

### debounceTime + distinctUntilChanged(防抖搜索标配)

```ts
searchControl.valueChanges.pipe(
  debounceTime(300),          // 停止输入 300ms 后才发出
  distinctUntilChanged(),     // 值没变不发出
  switchMap(q => this.search(q)),
)
```

### forkJoin(并发多个请求,全部完成才继续)

```ts
forkJoin({
  user: this.http.get<User>('/api/user/me'),
  products: this.http.get<Product[]>('/api/products'),
  cart: this.http.get<Cart>('/api/cart'),
}).subscribe(({ user, products, cart }) => {
  this.user = user;
  this.products = products;
  this.cart = cart;
});
```

---

## 四、取消订阅(内存泄漏防范)

**订阅必须取消**,否则组件销毁后流仍在跑。

### 方式一:takeUntilDestroyed(推荐,Angular 16+)

```ts
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

export class MyComponent {
  ngOnInit() {
    this.someService.data$.pipe(
      takeUntilDestroyed(),   // 组件销毁时自动取消
    ).subscribe(data => this.data = data);
  }
}
```

### 方式二:async pipe(模板里,自动管理)

```ts
// 组件
export class UserListComponent {
  users$ = this.userService.getUsers();   // 直接暴露 Observable
}
```

```html
<!-- 模板 -->
<ul>
  <li *ngFor="let user of users$ | async">{{ user.name }}</li>
</ul>
```

`async` pipe:自动订阅、自动取消订阅。**最简洁**。

### 方式三:手动 unsubscribe

```ts
export class MyComponent implements OnDestroy {
  private sub = new Subscription();

  ngOnInit() {
    this.sub.add(
      this.service.data$.subscribe(d => this.data = d)
    );
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }
}
```

---

## 五、Subject:可主动发送的 Observable

```ts
import { Subject, BehaviorSubject, ReplaySubject } from 'rxjs';

// Subject:只有订阅后才能收到值
const events$ = new Subject<string>();
events$.next('click');    // 订阅之前的值会丢失

// BehaviorSubject:有初始值,新订阅者立刻收到最新值
const currentUser$ = new BehaviorSubject<User | null>(null);
currentUser$.next(user);
currentUser$.value;      // 同步读当前值

// ReplaySubject:缓存最近 N 个值
const log$ = new ReplaySubject<string>(10);  // 缓存最近 10 条
```

### BehaviorSubject 作状态容器

```ts
@Injectable({ providedIn: 'root' })
export class AuthService {
  private _user$ = new BehaviorSubject<User | null>(null);
  readonly user$ = this._user$.asObservable();  // 只读暴露
  readonly isLoggedIn$ = this._user$.pipe(map(u => !!u));

  login(user: User) { this._user$.next(user); }
  logout() { this._user$.next(null); }
}
```

---

## 六、toSignal:RxJS → Signal(Angular 16+)

Angular 16+ 提供了桥接工具:

```ts
import { toSignal, toObservable } from '@angular/core/rxjs-interop';

export class UserListComponent {
  private userService = inject(UserService);

  // Observable → Signal
  users = toSignal(this.userService.getUsers(), { initialValue: [] });

  // Signal → Observable
  private count = signal(0);
  count$ = toObservable(this.count);
}
```

```html
<!-- 模板直接用 Signal,不用 async pipe -->
<li *ngFor="let user of users()">{{ user.name }}</li>
```

**新代码优先用 Signal,和 RxJS 的整合用 toSignal/toObservable**。

---

## 七、错误处理策略

```ts
export class ApiService {
  private http = inject(HttpClient);

  get<T>(url: string) {
    return this.http.get<T>(url).pipe(
      retry({ count: 2, delay: 1000 }),   // 失败重试2次
      catchError(err => {
        if (err.status === 401) {
          this.router.navigate(['/login']);
          return EMPTY;    // 不发出任何值,直接 complete
        }
        return throwError(() => err);
      }),
    );
  }
}
```

---

## 八、实战:带 loading 和 error 的请求

```ts
export class ProductListComponent {
  private productService = inject(ProductService);

  products = signal<Product[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);

  ngOnInit() {
    this.loading.set(true);

    this.productService.getAll().pipe(
      takeUntilDestroyed(),
      finalize(() => this.loading.set(false)),
    ).subscribe({
      next: products => this.products.set(products),
      error: err => this.error.set(err.message),
    });
  }
}
```

---

## 九、RxJS vs Promise:选哪个

```
用 Observable(RxJS):
  - HttpClient(Angular 默认)
  - 需要取消、重试、超时
  - 多值流(WebSocket、SSE、表单 valueChanges)
  - 操作符组合(debounce、switchMap...)
  - async pipe 简化模板

用 Promise:
  - 第三方 API 返回 Promise
  - 简单一次性异步
  - await 写法更直观时(可以 firstValueFrom 转换)
```

```ts
// Observable → Promise
import { firstValueFrom, lastValueFrom } from 'rxjs';

const user = await firstValueFrom(this.userService.getById(id));
```

---

## 十、和 Flutter Stream 对比

| Flutter | Angular RxJS |
| --- | --- |
| `Stream<T>` | `Observable<T>` |
| `StreamController` | `Subject` |
| `BehaviorSubject` | `BehaviorSubject` |
| `StreamBuilder` | `async pipe` |
| `stream.listen()` | `observable.subscribe()` |
| `stream.map()` | `pipe(map(...))` |
| `StreamTransformer` | 操作符 |
| `stream.cancel()` | `subscription.unsubscribe()` |

**几乎一一对应**。Flutter Bloc 的事件流跟 RxJS Subject 模式完全一致。

---

## 十一、心智模型

```
Observable = 异步数据流的"管道"
  创建 → 操作符变换 → 订阅消费

Angular 里的流:
  HttpClient → 一次请求,发一个值,complete
  Router.events → 持续发路由事件
  FormControl.valueChanges → 持续发表单值

关键操作符:
  switchMap  → 切换(搜索、路由参数)
  mergeMap   → 并发(批量上传)
  concatMap  → 顺序(队列操作)
  forkJoin   → 并发等全部(初始化数据)
  debounceTime → 防抖
  catchError → 错误降级

取消订阅:
  async pipe(模板)→ 最简
  takeUntilDestroyed() → 最通用
```

下一篇 22 讲 Angular Signals——Angular 17 引入的细粒度响应式系统,正在取代 RxJS 处理本地状态的角色。
