# Web 性能优化:Web Vitals、代码分割、懒加载、渲染管线

性能不是"加速器",是**给用户的尊重**。

```
1 秒延迟  → 跳出率 +32%
3 秒延迟  → 跳出率 +90%
快 1 秒   → 转化率 +27%(亚马逊数据)
```

**Google 把 Web Vitals 作为 SEO 排名因子**,你的页面不快连搜索流量都拿不到。

这一篇按"测什么 → 优化什么"两条线:

```
一、测量:Web Vitals 三大指标
二、优化资源:代码分割、懒加载、图片
三、优化渲染:Critical Rendering Path、CSR/SSR/SSG/RSC
四、网络优化:HTTP/2/3、Cache、CDN
五、JS 性能:长任务、内存、Web Worker
```

---

## 一、Web Vitals(Google 三大指标)

```
LCP   Largest Contentful Paint   最大内容绘制
INP   Interaction to Next Paint  交互到下次绘制(2024 取代 FID)
CLS   Cumulative Layout Shift    累计布局偏移
```

### LCP(< 2.5s 良好)

**首屏最大元素绘制完成的时间**。通常是 Hero 图、标题、视频海报。

诊断:
- DevTools → Performance 面板 → LCP 标记
- 看是哪个元素,为什么慢

常见原因:
- 图太大没压缩
- 服务器响应慢(TTFB > 600ms)
- JS / CSS 阻塞渲染
- 字体加载慢导致 fallback

修法:
- 图片用 WebP / AVIF
- LCP 元素加 `fetchpriority="high"`
- 关键 CSS 内联,非关键 defer
- 用 SSR / SSG 减 TTFB

### INP(< 200ms 良好)

**用户交互到下一次画面更新的延迟**。点按钮、输入、滑动都算。**2024 替代了 FID**(FID 只测第一次交互,INP 测全过程)。

常见原因:
- 长任务(> 50ms)阻塞主线程
- 大列表 re-render
- 频繁状态更新没节流

修法:
- 拆长任务(`scheduler.yield()` / `setTimeout(0)`)
- React `useMemo` / `memo` / `useDeferredValue`
- 虚拟列表(react-window)
- 重活扔 Web Worker

### CLS(< 0.1 良好)

**布局偏移累计值**。文字看一半图加载完撑下来,你点错按钮——就是 CLS。

常见原因:
- 图片 / 视频没设宽高
- 字体加载替换尺寸不一(FOUT / FOIT)
- 动态注入广告 / 横幅
- 异步内容塞进首屏

修法:
- `<img width height>` 或 `aspect-ratio` 占位
- `font-display: swap` + 字体匹配 `size-adjust`
- 给加载占位预留空间
- 动态内容放底部或固定容器

### 测量工具

```
浏览器:
  Chrome DevTools → Lighthouse(整体打分)
  Chrome DevTools → Performance(详细 trace)
  PageSpeed Insights:https://pagespeed.web.dev

线上:
  Web Vitals 库 + Vercel/CF Analytics 自动采集
  Real User Monitoring(RUM):Datadog / New Relic / Sentry

代码内采集:
  import { onLCP, onINP, onCLS } from 'web-vitals';
  onLCP(metric => sendToAnalytics(metric));
```

**线上数据 > 实验室数据**。Lighthouse 在你电脑跑很快,真实用户可能 4G + 旧手机。装 Vercel Analytics(免费),能看每天 P75 LCP / INP / CLS。

---

## 二、代码分割(Code Splitting)

### 1. 为什么要分割

```
不分割:用户访问首页就下载所有页面的 JS
分割:只下载首页需要的,其他按需加载
```

**首屏 JS 越小,LCP / INP 越好**。

### 2. 路由级分割(框架自动)

```
Next.js / Nuxt / SvelteKit:每个 page 自动一个 chunk
React Router(纯 SPA):用 lazy import
```

```jsx
// React Router lazy
import { lazy } from 'react';

const Dashboard = lazy(() => import('./Dashboard'));

<Route path="/dashboard" element={
  <Suspense fallback={<Spinner />}>
    <Dashboard />
  </Suspense>
} />
```

### 3. 组件级分割

```jsx
// 不在首屏的重组件
const HeavyChart = lazy(() => import('./HeavyChart'));

function Dashboard() {
  const [show, setShow] = useState(false);
  return (
    <>
      <button onClick={() => setShow(true)}>Show chart</button>
      {show && <Suspense fallback={<Skeleton />}><HeavyChart /></Suspense>}
    </>
  );
}
```

### 4. 第三方库按需引入

```ts
// ❌ 引入整个 lodash(70KB)
import _ from 'lodash';
_.cloneDeep(x);

// ✅ 按需(2KB)
import cloneDeep from 'lodash/cloneDeep';

// ✅✅ 用 lodash-es / 现代等价物
import { cloneDeep } from 'lodash-es';     // tree-shaking 友好

// ✅✅✅ 用现代 API
const x = structuredClone(value);          // 浏览器原生
```

`date-fns` 也类似:`import { format } from 'date-fns'` 只打包 format。

### 5. 动态 import(按需)

```ts
// 用户点击时才加载
async function exportPdf() {
  const { jsPDF } = await import('jspdf');
  // ...
}
```

### 6. 看打包结果

```bash
# Vite
pnpm add -D rollup-plugin-visualizer
# vite.config.ts plugins: [visualizer({ open: true })]
pnpm build
# 自动打开 stats.html,看每个 chunk 大小

# Next.js
pnpm next build
# 输出每个路由的 First Load JS

# 通用
ANALYZE=true pnpm build
```

**关注**:
- 单 chunk > 200KB → 拆
- 重复打包(同一 lib 出现在多 chunk)→ 配 manualChunks

---

## 三、图片优化(LCP 杀手)

### 1. 选对格式

```
JPEG  : 老,通用,适合照片
PNG   : 透明,文件大
WebP  : 比 JPEG 小 25-35%,所有现代浏览器都支持
AVIF  : 比 WebP 再小 20-30%,2023+ 普及
SVG   : 矢量,图标必选
```

**默认输出 AVIF + WebP fallback**:

```html
<picture>
  <source srcset="hero.avif" type="image/avif">
  <source srcset="hero.webp" type="image/webp">
  <img src="hero.jpg" alt="..." width="1200" height="600">
</picture>
```

### 2. 响应式图片(srcset)

```html
<img
  src="hero-800.jpg"
  srcset="hero-400.jpg 400w, hero-800.jpg 800w, hero-1600.jpg 1600w"
  sizes="(max-width: 600px) 400px, 800px"
  alt="..."
>
```

浏览器选最合适的尺寸。**别给手机送 4K 图**。

### 3. 用框架的 Image 组件

```jsx
// Next.js
import Image from 'next/image';
<Image src="/hero.jpg" width={1200} height={600} alt="..." priority />
```

自动:
- 响应式 srcset
- AVIF/WebP 转换
- lazy load
- 防 CLS(reserved space)
- LCP 加 `priority` → fetchpriority + preload

```jsx
// Astro
<Image src={hero} alt="..." />

// Nuxt
<NuxtImg src="/hero.jpg" :width="1200" />
```

**用框架的图片组件,免去 80% 优化工作**。

### 4. lazy load(浏览器原生)

```html
<img src="..." loading="lazy" decoding="async">
```

非首屏图自动延迟加载。**首屏 LCP 图不要 lazy**(`loading="eager" fetchpriority="high"`)。

### 5. 占位

```html
<!-- LQIP(低质量预览) -->
<img src="data:image/jpeg;base64,..." srcset="real.jpg" />

<!-- BlurHash / Plaiceholder -->
<!-- Next.js Image 自带 placeholder="blur" -->
```

---

## 四、字体优化

### 1. 自托管 + preload

```html
<link rel="preload" href="/fonts/inter.woff2" as="font" type="font/woff2" crossorigin>

<style>
  @font-face {
    font-family: 'Inter';
    src: url('/fonts/inter.woff2') format('woff2');
    font-display: swap;
  }
</style>
```

`font-display: swap` = 先用系统字体显示,字体加载完再换。**不阻塞渲染**。

### 2. 子集化(只用到的字符)

中文字体动辄 4MB,英文几百 KB。用 `subfont` / `glyphhanger` 工具裁剪。

或用 [`fontsource`](https://fontsource.org):

```bash
pnpm add @fontsource/inter
```

```ts
import '@fontsource/inter/400.css';
import '@fontsource/inter/700.css';
```

### 3. CSS `size-adjust` 防 CLS

```css
@font-face {
  font-family: 'InterFallback';
  src: local('Arial');
  size-adjust: 107%;     /* 让 fallback 跟最终字体宽度接近 */
  ascent-override: 90%;
}
```

字体替换时尺寸不变,**避免文字跳动**。Next.js `next/font` 自动处理。

---

## 五、CSS 优化

### 1. Critical CSS 内联

首屏需要的 CSS 内联到 `<head>`,其他外链。

```html
<head>
  <style>/* critical inline */</style>
  <link rel="preload" href="/style.css" as="style" onload="this.rel='stylesheet'">
</head>
```

Next.js / Astro / Nuxt 默认做这个。

### 2. 删未用 CSS

Tailwind 自动 purge:`tailwind.config` 里 `content` 配好,**没用的 class 编译时删掉**。

```js
// tailwind.config.ts
export default {
  content: ['./src/**/*.{ts,tsx,vue,html}'],
};
```

最终 CSS 通常 < 10KB。

### 3. 不阻塞渲染

```html
<!-- 阻塞 -->
<link rel="stylesheet" href="big.css">

<!-- 非阻塞 -->
<link rel="preload" href="big.css" as="style" onload="this.rel='stylesheet'">
```

或拆首屏 + 异步:

```html
<link rel="stylesheet" href="critical.css">
<link rel="stylesheet" href="rest.css" media="print" onload="this.media='all'">
```

### 4. 别用 `@import`

```css
/* style.css */
@import 'a.css';      /* 浏览器要先下载 style.css 才知道 a.css,串行 */
```

用 `<link>` 并联加载。

---

## 六、JS 加载策略

### 1. defer / async

```html
<script src="..."></script>           阻塞解析,顺序执行
<script src="..." async></script>     不阻塞,加载完立即执行(顺序不定)
<script src="..." defer></script>     不阻塞,DOM 解析完按顺序执行
<script src="..." type="module"></script>  默认 defer
```

**99% 用 defer 或 type=module**。

### 2. preload / prefetch / preconnect

```html
<!-- 关键资源,立刻预加载 -->
<link rel="preload" href="/critical.js" as="script">

<!-- 下个页面可能用,空闲时预取 -->
<link rel="prefetch" href="/dashboard.js">

<!-- 提前建连接(DNS + TCP + TLS) -->
<link rel="preconnect" href="https://api.example.com">

<!-- DNS 提前解析 -->
<link rel="dns-prefetch" href="https://cdn.example.com">
```

### 3. 第三方脚本延迟

广告、统计、客服弹窗这种**不影响主功能的**,延迟到主线程空了:

```html
<script async src="https://www.google-analytics.com/analytics.js"></script>
```

或用 [Partytown](https://partytown.builder.io) 把第三方 JS 扔到 Web Worker:

```html
<script type="text/partytown" src="https://gtm.com/..."></script>
```

主线程不被它们拖慢。

---

## 七、渲染策略(CSR / SSR / SSG / RSC)

### 各自影响

```
CSR(Client-Side):
  HTML 几乎空,JS 下来才渲染
  TTFB 快,LCP 慢,SEO 差
  适合:后台、登录后

SSR(Server-Side):
  服务端生成 HTML,浏览器立刻看到
  TTFB 慢(算 HTML),LCP 快
  适合:个性化内容、登录后

SSG(Static Site):
  build 时生成 HTML,纯静态文件
  TTFB 极快,LCP 极快
  适合:博客、文档、营销页

ISR(Incremental SSG):
  SSG + 后台定时刷新
  适合:商品、新闻

RSC(React Server Components):
  默认服务端渲染,JS 不打到客户端
  最低 JS 体积,但需要 React 19 + Next.js 15
  适合:大部分新项目
```

### 选择决策

```
内容静态(博客、文档)
  → SSG(Astro / Next SSG / Hugo)

需要 SEO 的动态内容
  → SSR / RSC(Next.js / Nuxt)

后台 / 内部工具
  → CSR(Vite + React,简单快)

电商
  → SSG(产品页) + ISR(库存) + CSR(购物车)
```

**性能最好的策略 = 混合**。Next.js / Nuxt 默认让你按页面选。

---

## 八、CDN 与缓存

### 1. 静态资源

```
HTML        : Cache-Control: no-cache(每次问)
JS / CSS    : Cache-Control: public, max-age=31536000, immutable
            (文件名带 hash,改了 hash 变,新 URL miss 即重新下)
图片        : 长缓存
字体        : 永久
```

### 2. CDN 选择

```
Vercel / Cloudflare:静态文件自动分发到边缘
Cloudflare:免费 + 全球
AWS CloudFront:贵但功能全
七牛 / 阿里 / 腾讯:国内
```

### 3. Service Worker(PWA)

第 34 篇会详细讲。可以**完全离线 + 自定义缓存策略**。

### 4. HTTP 缓存策略

```
强缓存(Cache-Control / Expires):浏览器直接用本地,不发请求
协商缓存(ETag / Last-Modified):发请求,服务端 304 不返 body
```

```http
Cache-Control: public, max-age=3600, stale-while-revalidate=86400
```

`stale-while-revalidate`:**先用旧的展示,后台默默更新**。SWR / TanStack Query 就用这个思路。

---

## 九、网络优化

### 1. HTTP/2 / HTTP/3

```
HTTP/1.1:每个 TCP 连接一次只能跑一个请求(队头阻塞),浏览器最多 6 个连接
HTTP/2:多路复用,一个连接同时跑多请求
HTTP/3:基于 UDP / QUIC,丢包不阻塞,弱网体验好
```

**生产服务必开 HTTP/2 起步**。Cloudflare / Vercel 默认 HTTP/3。

### 2. 减少请求数

```
合并 sprite / 雪碧图:HTTP/1 时代神器,HTTP/2 后没必要
inline 关键 CSS / 小图(< 4KB)
```

### 3. 压缩

```
Gzip:旧标准,通用
Brotli:更小 20%,2017+ 浏览器
```

```js
// Express
import compression from 'compression';
app.use(compression());
```

Cloudflare / Vercel 自动 Brotli。

### 4. CDN 边缘函数

```
原:用户 → 1000ms 飞越大洋 → 你的服务器 → 数据
现:用户 → 50ms 到边缘 → 边缘函数处理 → 数据
```

Cloudflare Workers / Vercel Edge / AWS Lambda@Edge。

---

## 十、JS 运行时性能

### 1. 长任务(Long Task)

```
单个 task > 50ms = 长任务,会阻塞 INP
```

DevTools Performance 面板看红色三角。常见原因:
- 大循环 / 计算
- 一次 render 太多组件
- 同步算法

### 2. 拆任务

```ts
// scheduler API(浏览器原生,2024+ 普及)
async function process(items) {
  for (const item of items) {
    await scheduler.yield();   // 让出主线程
    handle(item);
  }
}

// fallback
const yieldToMain = () => new Promise(r => setTimeout(r, 0));
```

或用 `requestIdleCallback`(空闲再跑)。

### 3. React 的优化武器

```
memo / useMemo / useCallback   防不必要 render
useDeferredValue              低优先级更新
useTransition                 大状态更新标记为非紧急
虚拟列表(react-window)         长列表
```

详见第 9 篇 React 性能。

### 4. Web Worker(重活分流)

```js
// main.js
const w = new Worker('./heavy.js');
w.postMessage(data);
w.onmessage = e => useResult(e.data);

// heavy.js
self.onmessage = e => {
  const result = expensive(e.data);
  self.postMessage(result);
};
```

加密、图像处理、PDF 解析、大 CSV 解析都该扔 Worker。

### 5. 内存

```js
// 检查
performance.memory.usedJSHeapSize    // 当前堆
```

避免内存泄漏:
- removeEventListener 配对
- clearInterval / clearTimeout
- WeakMap / WeakRef 存 DOM 引用
- 取消订阅(useEffect 返回 cleanup)

DevTools → Memory → Heap snapshot,做 snapshot diff 看哪些对象一直在涨。

---

## 十一、性能预算(Budget)

```
LCP    < 2.5s
INP    < 200ms
CLS    < 0.1
TTFB   < 600ms
JS bundle (gzipped):
  首页 < 100KB
  其他 < 200KB
图片 < 200KB / 张
首屏请求数 < 30
```

**写入 CI**,超标拒绝合并:

```yaml
# .github/workflows/perf.yml
- run: pnpm lighthouse-ci autorun
```

[Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci)、[bundlesize](https://github.com/siddharthkp/bundlesize) 等工具。

---

## 十二、Quick Win 清单

### 上线前过一遍

- [ ] 图片用 WebP/AVIF,设宽高,框架的 Image 组件
- [ ] 首屏图加 `priority` / preload
- [ ] 字体 self-host + preload + `font-display: swap`
- [ ] CSS:Tailwind 配 content path,删未用
- [ ] JS:看 bundle 分析,首页 < 100KB gzipped
- [ ] 第三方脚本 defer / async / Partytown
- [ ] 路由级 lazy load
- [ ] 重组件(图表 / 富文本)按需 import
- [ ] HTTP/2 + Brotli
- [ ] CDN(Vercel / Cloudflare 默认有)
- [ ] LCP 元素 server-render(SSR/SSG)
- [ ] 长列表用虚拟列表
- [ ] 重计算扔 Web Worker
- [ ] 装 Sentry + Vercel Analytics

90% 项目过完这些清单,Web Vitals 全绿。

---

## 十三、心智模型

```
性能优化三步曲:

1. 测(Web Vitals)
   LCP / INP / CLS,真实用户数据
   工具:PageSpeed / Vercel Analytics / Lighthouse

2. 找瓶颈
   LCP 慢 → 网络 / 图片 / TTFB
   INP 慢 → JS 长任务 / re-render
   CLS 大 → 图 / 字体 / 异步注入

3. 对症下药
   减:代码分割、按需加载、压缩、删未用
   缓:CDN、HTTP cache、SWR
   预:preload / preconnect / prefetch
   后:lazy load、defer、idle callback

性能优化的本质:
  - 第一字节早(SSR / Edge / CDN)
  - JS 少(分割 / tree shake / 现代 API)
  - 渲染稳(预留空间 / 字体 swap)
  - 交互快(拆长任务 / 优化 re-render)
```

---

## 十四、参考资源

- web.dev:https://web.dev(Google 官方,最权威)
- Web Vitals:https://web.dev/vitals
- PageSpeed Insights:https://pagespeed.web.dev
- Chrome DevTools 文档:Performance / Lighthouse 面板教程
- Patterns.dev:https://patterns.dev(渲染模式 + 性能模式)

下一篇 33 讲实时通信:WebSocket 与 SSE。
