# Angular 总览与心智

Angular 是 Google 维护的**全功能前端框架**。跟 React/Vue 是"库 + 自选生态"不同,Angular 是"**一切都在框中**":路由、表单、HTTP、DI、测试全部官方内置。

写法风格也完全不同:**TypeScript 优先、面向对象、装饰器驱动**。

---

## 一、Angular 的核心心智

```ts
// 一个最简单的组件
import { Component } from '@angular/core';

@Component({
  selector: 'app-counter',
  template: `
    <button (click)="inc()">{{ count }}</button>
  `,
})
export class CounterComponent {
  count = 0;
  inc() { this.count++; }
}
```

- **装饰器**(`@Component`、`@Injectable`...)描述类的角色
- **模板**是 HTML 超集(跟 Vue 类似但语法不同)
- **类**持有逻辑和状态(跟 React 函数组件相反)

---

## 二、跟 React / Vue 对比

| 维度 | React | Vue | Angular |
| --- | --- | --- | --- |
| 编程范式 | 函数式 | 函数式 + OOP | OOP(类 + 装饰器) |
| 模板 | JSX | HTML 模板 | HTML 超集模板 |
| 响应式 | setState(手动) | Proxy 自动追踪 | Zone.js 或 Signals |
| 语言 | JS / TS | JS / TS | **强制 TypeScript** |
| 内置功能 | 只管 UI | 官方 Router+Pinia | **全套内置** |
| 学习曲线 | 中 | 低 | **高** |
| 适合 | 中小~大型 | 中小~大型 | **企业级大型** |

---

## 三、Angular 独特的概念

Angular 比 React/Vue 多了几个你必须理解的概念。

### 1. NgModule(模块系统)— Angular 14 前必须,15+ 可选

```ts
@NgModule({
  declarations: [AppComponent, HeaderComponent],  // 这模块里有哪些组件
  imports: [BrowserModule, RouterModule],          // 依赖哪些模块
  providers: [UserService],                        // 提供哪些 Service
  bootstrap: [AppComponent],                       // 根组件
})
export class AppModule {}
```

Angular 15+ 引入了 **Standalone Component**,不再需要 NgModule,跟 React/Vue 一样"按需 import"。**新项目直接用 Standalone**。

### 2. 依赖注入(DI)

Angular 自带一套**工业级 DI 容器**,是它跟 React/Vue 最大的区别。

```ts
@Injectable({ providedIn: 'root' })  // 注入到根,全局单例
export class AuthService {
  isLoggedIn = false;
}

@Component({ ... })
export class NavComponent {
  constructor(private auth: AuthService) {}  // 自动注入!
  // 或 Angular 14+ inject()
  // auth = inject(AuthService);
}
```

**DI 的意义**:
- 不用 `new AuthService()`,框架帮你管生命周期
- 测试时换成 `MockAuthService` 零成本
- Service 之间互相依赖,框架自动解析顺序

### 3. Zone.js(变更检测的旧方式)

Angular 的神奇之处:你直接改 `this.count++`,UI 就自动更新——不用 `setState`、不用 `.value`。

原理:Zone.js **猴补丁**了所有异步 API(`setTimeout`、`Promise`、`addEventListener`...),一旦异步任务完成,自动触发变更检测。

```ts
this.count++;             // 直接改属性!UI 自动更新
setTimeout(() => {
  this.count++;           // 也会更新(Zone 拦截了 setTimeout)
}, 1000);
```

代价:Zone.js 包体大约 100KB,每次变更检测遍历整个组件树,大型 App 可能有性能问题。

Angular 17+ 用 **Signals** 替代(见第 22 篇)。

---

## 四、项目结构

```bash
ng new my-app --standalone --routing --style=scss
```

```
my-app/
├── src/
│   ├── app/
│   │   ├── app.component.ts      # 根组件
│   │   ├── app.component.html
│   │   ├── app.config.ts         # Standalone 模式的根配置
│   │   ├── app.routes.ts         # 路由
│   │   │
│   │   ├── features/             # 按功能分模块
│   │   │   └── user/
│   │   │       ├── user.component.ts
│   │   │       └── user.service.ts
│   │   │
│   │   └── shared/               # 共享组件
│   │
│   ├── main.ts                   # 入口
│   └── styles.scss
│
├── angular.json                  # CLI 配置
└── tsconfig.json
```

---

## 五、Angular CLI:必须掌握

```bash
ng new my-app                     # 创建项目
ng serve                          # 开发服务器
ng build                          # 生产构建

ng generate component user        # 生成组件(简写 ng g c)
ng generate service api           # 生成 Service(ng g s)
ng generate pipe format           # 生成管道
ng generate guard auth            # 生成路由守卫

ng test                           # 跑单元测试(Karma/Jest)
ng e2e                            # 端到端测试(Playwright)

ng update @angular/core           # 升级 Angular
```

---

## 六、Angular 版本演进(理解为什么有"新旧"两种写法)

| 版本 | 年份 | 里程碑 |
| --- | --- | --- |
| Angular 2 | 2016 | 从 AngularJS 完全重写,TypeScript |
| Angular 8-13 | 2019~2021 | Ivy 编译器,性能大提升 |
| Angular 14 | 2022 | Standalone Component 预览 |
| Angular 15 | 2022 | Standalone 稳定,NgModule 可选 |
| Angular 16 | 2023 | Signals 引入(开发者预览) |
| Angular 17 | 2023 | Signals 稳定,新模板语法(@if/@for) |
| Angular 18-19 | 2024 | Zoneless 支持,性能持续提升 |

**现在学 Angular**:用 Standalone + Signals + 新模板语法(@if/@for)。老项目里的 NgModule + Zone.js 能看懂就好。

---

## 七、Angular 的优势和局限

### ✅ 优势

1. **全功能内置**:不用纠结生态选型,团队统一
2. **强 TypeScript**:DI、模板、表单全是类型安全的
3. **工业级 DI**:依赖管理、测试替换远优于 React/Vue
4. **企业级工具**:Angular CLI、Angular DevTools、Schematics
5. **向后兼容**:Google 保证长期稳定

### ⚠️ 局限

1. **学习曲线陡**:概念多(DI、模块、装饰器、RxJS、Zone...)
2. **包体大**:默认比 React/Vue 大
3. **灵活性低**:框架意见强烈,想跳出来做事比较难
4. **社区规模**:国内和全球都比 React/Vue 小

---

## 八、什么时候选 Angular

✅ 适合:
- 大型企业项目(多团队、长周期)
- 后台管理系统(CRUD 多、表单重)
- 公司技术栈统一要求
- 需要严格 TypeScript + 测试

❌ 不适合:
- 小项目(配置开销不划算)
- 追求极致性能的面向用户产品(React/Vue 更轻)
- 团队 TS 基础弱

---

## 九、一句话记忆

```
React  = 自由组装的乐高
Vue    = 上手友好的积木套装
Angular = 钢构预制的工业建筑
```
