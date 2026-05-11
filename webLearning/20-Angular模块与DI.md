# Angular 模块与依赖注入(DI)

Angular 的 DI 系统是它区别于 React/Vue 最大的地方。理解 DI,才能理解 Angular 的架构哲学。

---

## 一、为什么需要 DI

不用 DI 的世界:

```ts
class OrderComponent {
  private userService = new UserService();         // 自己 new
  private paymentService = new PaymentService();   // 自己 new
}
```

问题:
- 测试时没法换成 Mock
- `UserService` 内部 `new HttpClient()`,依赖链手动管
- 多个组件各自 `new`,没法共享同一个实例

Angular DI 的解法:

```ts
@Component({ ... })
class OrderComponent {
  constructor(
    private userService: UserService,
    private paymentService: PaymentService,
  ) {}
}
```

**框架负责创建并注入**——你只声明"我需要什么",DI 容器帮你拼。

---

## 二、Injectable:声明一个可注入的服务

```ts
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AuthService {
  isLoggedIn = false;

  login(email: string, password: string) {
    // ...
    this.isLoggedIn = true;
  }

  logout() {
    this.isLoggedIn = false;
  }
}
```

`providedIn: 'root'` 表示注册到根注入器:
- **全局单例**:整个应用只有一个 `AuthService` 实例
- **树摇支持**:如果没有任何地方注入,打包时自动删除

---

## 三、注入的两种写法

### 构造函数注入(传统)

```ts
@Component({ ... })
export class NavComponent {
  constructor(private auth: AuthService) {}

  logout() { this.auth.logout(); }
}
```

### inject() 函数(Angular 14+,推荐)

```ts
import { Component, inject } from '@angular/core';

@Component({ ... })
export class NavComponent {
  private auth = inject(AuthService);

  logout() { this.auth.logout(); }
}
```

`inject()` 可以在函数体顶层调用,不局限于构造函数——**composable/函数式风格更自然**。

```ts
// 在 composable 里用 inject
function useAuth() {
  const auth = inject(AuthService);
  return {
    isLoggedIn: computed(() => auth.isLoggedIn),
    logout: () => auth.logout(),
  };
}
```

---

## 四、注入器层级(重要)

Angular 的 DI 是**树形层级**:

```
根注入器(ApplicationRef)
  └── 路由模块注入器
        └── 组件注入器
              └── 子组件注入器
```

查找规则:**从当前层级往上查,找到第一个提供者**。

```ts
// 根级:全局单例
@Injectable({ providedIn: 'root' })
export class GlobalService {}

// 组件级:每个组件实例独立
@Component({
  providers: [LocalService]   // 这里提供 → 这个组件及子组件的独立实例
})
export class FeatureComponent {}
```

### 实际场景

```ts
// 对话框组件:每个对话框独立的 FormService
@Component({
  selector: 'app-dialog',
  providers: [FormService],   // 每个 dialog 实例有独立 FormService
})
export class DialogComponent {
  form = inject(FormService);
}
```

---

## 五、NgModule(旧模式,能看懂即可)

Angular 14 前,所有组件必须在 NgModule 里声明:

```ts
@NgModule({
  declarations: [AppComponent, UserListComponent, UserCardComponent],
  imports: [BrowserModule, RouterModule, FormsModule, HttpClientModule],
  providers: [UserService],    // 模块级提供者
  exports: [UserCardComponent], // 其他模块可用
  bootstrap: [AppComponent],
})
export class AppModule {}
```

### NgModule 的问题
- 组件必须声明在某个 module 里才能用
- 想在 A 模块用 B 模块的组件,必须先 import B 模块
- 嵌套关系复杂,新手经常忘记声明

---

## 六、Standalone Component(新模式,推荐)

Angular 15+ 稳定,**新项目全用 Standalone**:

```ts
// 独立组件:自己声明依赖
@Component({
  selector: 'app-user-card',
  standalone: true,
  imports: [CommonModule, RouterLink],   // 直接 import 用到的
  template: `...`,
})
export class UserCardComponent {}
```

```ts
// main.ts:启动入口
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, appConfig);
```

```ts
// app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(),
  ],
};
```

**不需要 NgModule**,和 React/Vue 一样"按需 import"。

---

## 七、提供者(Provider)的几种形式

### 1. useClass(默认)

```ts
providers: [UserService]
// 等价于
providers: [{ provide: UserService, useClass: UserService }]
```

### 2. useValue(常量/配置)

```ts
// 注入 token
export const API_BASE = new InjectionToken<string>('apiBase');

// 提供值
providers: [
  { provide: API_BASE, useValue: 'https://api.example.com' }
]

// 注入
class ApiService {
  private base = inject(API_BASE);
}
```

### 3. useFactory(动态创建)

```ts
providers: [{
  provide: LogService,
  useFactory: (env: EnvService) => {
    return env.isDev ? new DevLogService() : new ProdLogService();
  },
  deps: [EnvService],
}]
```

### 4. useExisting(别名)

```ts
// Logger 和 OldLogger 指向同一个实例
providers: [
  Logger,
  { provide: OldLogger, useExisting: Logger }
]
```

---

## 八、InjectionToken:注入非类类型

注入字符串、对象、函数时,用 `InjectionToken` 作为 key:

```ts
export const THEME_CONFIG = new InjectionToken<ThemeConfig>('themeConfig', {
  factory: () => ({ primary: '#007bff', dark: false }),  // 默认值
});

// 覆盖
providers: [{
  provide: THEME_CONFIG,
  useValue: { primary: '#ff5722', dark: true }
}]

// 注入
class ThemeService {
  config = inject(THEME_CONFIG);
}
```

---

## 九、服务的常见模式

### 数据 Service

```ts
@Injectable({ providedIn: 'root' })
export class ProductService {
  private http = inject(HttpClient);

  getAll() {
    return this.http.get<Product[]>('/api/products');
  }

  getById(id: string) {
    return this.http.get<Product>(`/api/products/${id}`);
  }

  create(data: CreateProductDto) {
    return this.http.post<Product>('/api/products', data);
  }

  update(id: string, data: Partial<Product>) {
    return this.http.patch<Product>(`/api/products/${id}`, data);
  }

  delete(id: string) {
    return this.http.delete(`/api/products/${id}`);
  }
}
```

### 状态 Service(配合 Signals)

```ts
@Injectable({ providedIn: 'root' })
export class CartService {
  private _items = signal<CartItem[]>([]);

  readonly items = this._items.asReadonly();
  readonly total = computed(() =>
    this._items().reduce((s, i) => s + i.price * i.qty, 0)
  );

  add(item: CartItem) {
    this._items.update(prev => {
      const exist = prev.find(i => i.id === item.id);
      if (exist) return prev.map(i => i.id === item.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, item];
    });
  }

  remove(id: string) {
    this._items.update(prev => prev.filter(i => i.id !== id));
  }
}
```

### 工具 Service

```ts
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private _messages = signal<string[]>([]);
  readonly messages = this._messages.asReadonly();

  show(msg: string) {
    this._messages.update(prev => [...prev, msg]);
    setTimeout(() => this.dismiss(msg), 3000);
  }

  dismiss(msg: string) {
    this._messages.update(prev => prev.filter(m => m !== msg));
  }
}
```

---

## 十、测试中替换依赖(DI 的最大价值)

```ts
// user.service.spec.ts
import { TestBed } from '@angular/core/testing';

describe('UserComponent', () => {
  let authService: jasmine.SpyObj<AuthService>;

  beforeEach(() => {
    const authSpy = jasmine.createSpyObj('AuthService', ['login', 'logout']);

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authSpy }   // 替换成 Mock
      ]
    });

    authService = TestBed.inject(AuthService) as jasmine.SpyObj<AuthService>;
  });

  it('should call login', () => {
    authService.login.and.returnValue(Promise.resolve(true));
    // 测试逻辑
    expect(authService.login).toHaveBeenCalled();
  });
});
```

**DI 让测试变成换零件**:不用改任何业务代码,只需在测试里替换 Provider。

---

## 十一、和 React/Vue 的对比

| 维度 | React | Vue | Angular |
| --- | --- | --- | --- |
| 全局状态共享 | Context + Zustand | Pinia | Service + DI |
| 实例作用域 | Provider 范围 | 全局/composable | 注入器层级 |
| 测试替换 | jest.mock / MSW | jest.mock / MSW | TestBed providers |
| 类型安全 | 一般 | 一般 | 强(TS token + 类型推断) |
| 按需加载 | lazy import | lazy import | 路由级注入器 |

**Angular DI 的核心价值**:可测试性 + 生命周期管理 + 大型团队下的依赖解耦。

---

## 十二、和 Flutter 的对比

| Flutter | Angular |
| --- | --- |
| `Riverpod Provider` | `@Injectable({ providedIn: 'root' })` |
| `ref.watch(provider)` | `inject(Service)` |
| `ProviderScope` 嵌套 | 注入器层级(组件级 providers) |
| `overrideWithValue` | `useValue` / `useClass` |
| `FutureProvider` | `Injectable` + `Observable` |
| `riverpod_generator` | 装饰器 + CLI 生成 |

Flutter Riverpod 的 `Provider` = Angular 的 `@Injectable`。层级覆盖也完全对应。

---

## 十三、心智模型

```
DI 三步:

1. 定义服务:@Injectable({ providedIn: 'root' })
2. 声明需要:inject(Service) 或构造函数参数
3. 框架注入:根据层级找到最近的提供者,自动创建/复用

核心价值:
- 共享:同一注入器下的组件拿到同一个实例
- 隔离:组件级 providers 隔离出独立实例
- 测试:TestBed.configureTestingModule 换掉真实实现

新项目用:Standalone + inject() + providedIn: 'root'
```

下一篇 21 讲 RxJS 在 Angular 中的应用——Observable 是 Angular 里处理异步的核心方式。
