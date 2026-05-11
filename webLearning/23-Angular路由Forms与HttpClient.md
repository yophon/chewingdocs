# Angular 路由、表单与 HttpClient

Angular 把路由、表单、HTTP 全内置了。这三个是构建 CRUD 应用的骨架,本篇一次讲透。

---

## 一、Angular Router

### 配置路由

```ts
// app.routes.ts
import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: '/home', pathMatch: 'full' },
  { path: 'home', component: HomeComponent },
  {
    path: 'users',
    children: [
      { path: '', component: UserListComponent },
      { path: ':id', component: UserDetailComponent },
      { path: ':id/edit', component: UserEditComponent },
    ],
  },
  // 懒加载(推荐)
  {
    path: 'admin',
    loadComponent: () => import('./admin/admin.component').then(m => m.AdminComponent),
  },
  {
    path: 'shop',
    loadChildren: () => import('./shop/shop.routes').then(m => m.shopRoutes),
  },
  { path: '**', component: NotFoundComponent },
];
```

```ts
// app.config.ts
export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withRouterConfig({ onSameUrlNavigation: 'reload' })),
  ],
};
```

### Router Outlet

```html
<!-- app.component.html -->
<nav>
  <a routerLink="/home" routerLinkActive="active">首页</a>
  <a routerLink="/users" routerLinkActive="active">用户</a>
</nav>
<router-outlet />
```

### 路由导航

```ts
export class SomeComponent {
  private router = inject(Router);

  goToUser(id: string) {
    this.router.navigate(['/users', id]);
    // 或带 query params
    this.router.navigate(['/users'], { queryParams: { page: 2, sort: 'name' } });
  }
}
```

### 读取路由参数

```ts
export class UserDetailComponent {
  private route = inject(ActivatedRoute);
  private userService = inject(UserService);

  // Signal 方式(Angular 16+,推荐)
  userId = this.route.snapshot.paramMap.get('id')!;

  // Observable 方式(参数变化时响应)
  user$ = this.route.params.pipe(
    switchMap(params => this.userService.getById(params['id'])),
  );
}
```

### 路由守卫

```ts
// auth.guard.ts
export const authGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isLoggedIn()) return true;

  return router.createUrlTree(['/login'], {
    queryParams: { returnUrl: state.url },
  });
};

// 使用
{ path: 'profile', component: ProfileComponent, canActivate: [authGuard] }
```

### Resolver(数据预加载)

```ts
export const userResolver: ResolveFn<User> = (route) => {
  const userService = inject(UserService);
  return userService.getById(route.paramMap.get('id')!);
};

// 路由配置
{ path: ':id', component: UserDetailComponent, resolve: { user: userResolver } }

// 组件里取
export class UserDetailComponent {
  private route = inject(ActivatedRoute);
  user = toSignal(this.route.data.pipe(map(d => d['user'] as User)));
}
```

---

## 二、Reactive Forms(响应式表单)

Angular 有两种表单:Template-driven(简单)和 Reactive(复杂,推荐)。

### 基础 FormGroup

```ts
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()">
      <input formControlName="email" type="email">
      @if (form.get('email')?.invalid && form.get('email')?.touched) {
        <p>邮箱格式错误</p>
      }

      <input formControlName="password" type="password">
      <button type="submit" [disabled]="form.invalid">登录</button>
    </form>
  `,
})
export class LoginComponent {
  private fb = inject(FormBuilder);

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  submit() {
    if (this.form.invalid) return;
    const { email, password } = this.form.value;
    this.authService.login(email!, password!);
  }
}
```

### 常用验证器

```ts
Validators.required
Validators.email
Validators.minLength(6)
Validators.maxLength(20)
Validators.pattern(/^[a-zA-Z]+$/)
Validators.min(0)
Validators.max(100)
```

### 自定义验证器

```ts
function passwordMatch(group: AbstractControl): ValidationErrors | null {
  const pwd = group.get('password')?.value;
  const confirm = group.get('confirmPassword')?.value;
  return pwd === confirm ? null : { mismatch: true };
}

form = this.fb.group({
  password: ['', Validators.required],
  confirmPassword: ['', Validators.required],
}, { validators: passwordMatch });
```

### 异步验证器(检查用户名是否已存在)

```ts
function usernameExists(userService: UserService): AsyncValidatorFn {
  return (control: AbstractControl) =>
    timer(300).pipe(
      switchMap(() => userService.checkUsername(control.value)),
      map(exists => exists ? { usernameTaken: true } : null),
    );
}

form = this.fb.group({
  username: ['', Validators.required, usernameExists(this.userService)],
});
```

### FormArray(动态列表)

```ts
form = this.fb.group({
  tags: this.fb.array(['Angular', 'TypeScript']),
});

get tags() { return this.form.get('tags') as FormArray; }

addTag() {
  this.tags.push(this.fb.control(''));
}

removeTag(i: number) {
  this.tags.removeAt(i);
}
```

```html
<div formArrayName="tags">
  @for (tag of tags.controls; track $index; let i = $index) {
    <input [formControlName]="i">
    <button (click)="removeTag(i)">删</button>
  }
</div>
<button (click)="addTag()">添加标签</button>
```

### 错误提示组件

```ts
@Component({
  selector: 'field-error',
  standalone: true,
  template: `
    @if (control.invalid && control.touched) {
      @if (control.hasError('required')) { <p>必填</p> }
      @if (control.hasError('email')) { <p>邮箱格式错误</p> }
      @if (control.hasError('minlength')) {
        <p>至少 {{ control.errors?.['minlength'].requiredLength }} 个字符</p>
      }
    }
  `,
})
export class FieldErrorComponent {
  control = input.required<AbstractControl>();
}
```

---

## 三、HttpClient

### 配置

```ts
// app.config.ts
import { provideHttpClient, withInterceptors } from '@angular/common/http';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(
      withInterceptors([authInterceptor, loggingInterceptor]),
    ),
  ],
};
```

### 基本 CRUD

```ts
@Injectable({ providedIn: 'root' })
export class UserService {
  private http = inject(HttpClient);
  private base = '/api/users';

  getAll(params?: { page?: number; search?: string }) {
    return this.http.get<{ data: User[]; total: number }>(this.base, { params });
  }

  getById(id: string) {
    return this.http.get<User>(`${this.base}/${id}`);
  }

  create(dto: CreateUserDto) {
    return this.http.post<User>(this.base, dto);
  }

  update(id: string, dto: Partial<User>) {
    return this.http.patch<User>(`${this.base}/${id}`, dto);
  }

  delete(id: string) {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
```

### Interceptor(拦截器)

```ts
// auth.interceptor.ts
import { HttpInterceptorFn } from '@angular/common/http';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = localStorage.getItem('token');
  if (!token) return next(req);

  const authed = req.clone({
    headers: req.headers.set('Authorization', `Bearer ${token}`),
  });
  return next(authed);
};
```

```ts
// error.interceptor.ts
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401) {
        inject(Router).navigate(['/login']);
        return EMPTY;
      }
      if (err.status === 403) {
        inject(NotificationService).show('权限不足');
        return EMPTY;
      }
      return throwError(() => err);
    }),
  );
};
```

```ts
// logging.interceptor.ts
export const loggingInterceptor: HttpInterceptorFn = (req, next) => {
  console.log(`→ ${req.method} ${req.url}`);
  return next(req).pipe(
    tap(event => {
      if (event instanceof HttpResponse) {
        console.log(`← ${event.status} ${req.url}`);
      }
    }),
  );
};
```

### 文件上传

```ts
upload(file: File) {
  const fd = new FormData();
  fd.append('file', file);

  return this.http.post<{ url: string }>('/api/upload', fd, {
    reportProgress: true,
    observe: 'events',
  }).pipe(
    filter(event => event.type === HttpEventType.UploadProgress),
    map(event => Math.round(100 * event.loaded / (event.total ?? 1))),
  );
}
```

---

## 四、路由 + 表单 + HttpClient 组合实战

```ts
@Component({
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()">
      <input formControlName="name">
      <input formControlName="email">
      <button [disabled]="form.invalid || saving()">
        {{ saving() ? '保存中...' : '保存' }}
      </button>
    </form>
    <a routerLink="/users">返回列表</a>
  `,
})
export class UserEditComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private userService = inject(UserService);
  private fb = inject(FormBuilder);

  saving = signal(false);
  userId = this.route.snapshot.paramMap.get('id');

  form = this.fb.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
  });

  ngOnInit() {
    if (this.userId) {
      this.userService.getById(this.userId).pipe(
        takeUntilDestroyed(),
      ).subscribe(user => this.form.patchValue(user));
    }
  }

  submit() {
    if (this.form.invalid) return;
    this.saving.set(true);

    const req = this.userId
      ? this.userService.update(this.userId, this.form.value as Partial<User>)
      : this.userService.create(this.form.value as CreateUserDto);

    req.pipe(
      takeUntilDestroyed(),
      finalize(() => this.saving.set(false)),
    ).subscribe({
      next: () => this.router.navigate(['/users']),
      error: () => alert('保存失败'),
    });
  }
}
```

---

## 五、和 React / Vue 的对比

| 功能 | React | Vue | Angular |
| --- | --- | --- | --- |
| 路由 | React Router / TanStack Router | Vue Router | 官方 Router |
| 表单 | React Hook Form | VeeValidate / 手写 | 官方 Reactive Forms |
| HTTP | fetch / axios / TanStack Query | fetch / axios / TanStack Query | 官方 HttpClient |
| 拦截器 | axios 拦截器 | axios 拦截器 | HttpInterceptor |
| 路由守卫 | Loader / 自定义 | Navigation Guards | CanActivate / CanLoad |
| 表单验证 | 库自带 / 手写 | 库自带 / 手写 | 内置 Validators |

Angular 的优势:全官方内置,风格统一。代价是 API 较多,需要专门学习。

---

## 六、心智模型

```
Angular 三大内置:

路由:
  Routes 配置 → RouterOutlet 渲染 → routerLink 导航
  懒加载:loadComponent / loadChildren
  守卫:canActivate(权限) + resolve(数据预加载)

表单:
  FormGroup + FormControl + FormArray
  Validators(内置) + 自定义验证器
  (ngSubmit) → 检查 form.valid → 提交

HttpClient:
  get / post / patch / delete → Observable
  Interceptor → 统一处理 token / 错误 / 日志
  withFetch() → 用 fetch 替代 XMLHttpRequest
```

下一篇 24 讲 Angular Universal——Angular 的 SSR 方案,以及新版 Angular 的服务端渲染能力。
