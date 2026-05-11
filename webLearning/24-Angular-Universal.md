# Angular Universal 与 SSR

Angular Universal 是 Angular 的服务端渲染方案。Angular 17+ 将 SSR 深度集成进框架本身,不再需要单独配置。

---

## 一、为什么要 SSR

```
纯 CSR(SPA):
  浏览器下载 JS → 执行 JS → 请求数据 → 渲染 HTML
  问题:首屏白屏久、SEO 差

SSR:
  服务器渲染完整 HTML → 浏览器直接显示 → JS 加载后接管(hydration)
  优点:首屏快、SEO 好
```

Angular SSR 的三种模式:
- **SSR**(服务端渲染):每次请求服务器动态渲染 HTML
- **SSG**(静态预渲染):构建时预渲染 HTML,部署静态文件
- **CSR**(纯客户端):传统 SPA,不需要 SSR 时用

---

## 二、创建带 SSR 的 Angular 项目

```bash
# 新项目直接开启 SSR
ng new my-app --ssr

# 已有项目添加 SSR
ng add @angular/ssr
```

生成的文件结构:

```
src/
├── app/
│   ├── app.component.ts
│   ├── app.config.ts          # 客户端配置
│   └── app.config.server.ts   # 服务端配置
├── main.ts                    # 客户端入口
└── main.server.ts             # 服务端入口

server.ts                      # Express 服务器
```

---

## 三、配置

```ts
// app.config.ts(客户端)
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideClientHydration } from '@angular/platform-browser';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideClientHydration(),   // 开启 hydration
  ],
};
```

```ts
// app.config.server.ts(服务端)
import { mergeApplicationConfig } from '@angular/core';
import { provideServerRendering } from '@angular/platform-server';
import { appConfig } from './app.config';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(),
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
```

---

## 四、Hydration(水合)

Angular 17+ 默认开启增量水合(Incremental Hydration)。

```ts
// 全量 hydration
provideClientHydration()

// Angular 17.2+:跳过某些组件的 hydration
@Component({
  selector: 'app-heavy',
  template: '...',
})
export class HeavyComponent {}
```

```html
<!-- 模板里按需 hydrate(Angular 19+) -->
@defer (hydrate on viewport) {
  <app-heavy />
}
```

---

## 五、SSR 里的常见陷阱

### 1. 没有 window / document

```ts
import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';

@Component({ ... })
export class MyComponent {
  private platformId = inject(PLATFORM_ID);

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      // 只在浏览器里跑
      window.scrollTo(0, 0);
    }
  }
}
```

或用 Angular 内置的 `afterNextRender` / `afterRender`:

```ts
export class MyComponent {
  constructor() {
    afterNextRender(() => {
      // 只在客户端渲染完后跑,服务端不跑
      initChart();
    });
  }
}
```

### 2. HTTP 请求重复执行(服务端发了,客户端又发)

```ts
// app.config.ts
import { provideClientHydration, withHttpTransferCache } from '@angular/platform-browser';

providers: [
  provideClientHydration(withHttpTransferCache()),  // 缓存 SSR 的请求结果
]
```

服务端请求的数据会序列化进 HTML,客户端直接用,不重复请求。

### 3. 第三方库不兼容 SSR

```ts
// 懒加载只在客户端用的库
const Chart = await import('chart.js').then(m => m.Chart);
```

---

## 六、静态预渲染(SSG)

```ts
// app.routes.server.ts
import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },        // 静态预渲染
  { path: 'about', renderMode: RenderMode.Prerender },
  { path: 'users/:id', renderMode: RenderMode.Server },  // 动态 SSR
  { path: 'dashboard', renderMode: RenderMode.Client },  // 纯 CSR
];
```

```ts
// app.config.server.ts
import { provideServerRoutesConfig } from '@angular/ssr';
import { serverRoutes } from './app.routes.server';

const serverConfig = {
  providers: [
    provideServerRendering(),
    provideServerRoutesConfig(serverRoutes),
  ],
};
```

预渲染时动态参数可以指定列表:

```ts
{
  path: 'products/:id',
  renderMode: RenderMode.Prerender,
  getPrerenderParams: async () => {
    const products = await fetch('/api/products').then(r => r.json());
    return products.map((p: Product) => ({ id: p.id }));
  },
}
```

---

## 七、部署

```bash
ng build          # 构建,生成 dist/
```

```
dist/my-app/
├── browser/      # 客户端资源
└── server/       # 服务端 Node.js 代码
```

```bash
# 本地运行 SSR 服务
node dist/my-app/server/server.mjs
```

**部署到 Docker:**

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY dist/my-app/server ./server
COPY dist/my-app/browser ./browser
EXPOSE 4000
CMD ["node", "server/server.mjs"]
```

**部署到 Firebase Hosting:**

```bash
ng add @angular/fire
firebase deploy
```

---

## 八、和 Next.js / Nuxt 对比

| 维度 | Next.js(React) | Nuxt(Vue) | Angular SSR |
| --- | --- | --- | --- |
| 文件路由 | ✅ | ✅ | ❌(手写 routes) |
| 数据获取 | Server Components | useFetch | HttpClient + resource |
| SSG | ✅ 自动 | ✅ 自动 | ✅ RenderMode.Prerender |
| ISR | ✅ | ✅ | ❌(无内置支持) |
| 边缘部署 | Vercel Edge | Nuxt Edge | 需自行配置 |
| 配置复杂度 | 低 | 低 | 中 |

Angular SSR 最大的差异:**没有文件路由和内置数据获取约定**。路由还是手写,数据还是 HttpClient/resource。适合已有 Angular 项目加 SSR,而不是以 SSR 为核心来设计应用。

---

## 九、心智模型

```
Angular SSR 三步:
  1. ng new --ssr 或 ng add @angular/ssr
  2. 用 RenderMode 控制每条路由的渲染策略
  3. isPlatformBrowser / afterNextRender 处理浏览器 API

主要坑:
  window/document 在服务端不存在 → isPlatformBrowser
  HTTP 请求重复 → withHttpTransferCache
  第三方 DOM 库 → afterNextRender 或动态 import

和 Next.js/Nuxt 的定位不同:
  Next/Nuxt 是以 SSR 为中心设计的全栈框架
  Angular SSR 是给已有 Angular 应用加 SSR 能力
```

Angular 系列到这里结束。下一篇 25 开始 SolidJS——一个用 JSX 写但完全不用 VDOM 的高性能框架。
