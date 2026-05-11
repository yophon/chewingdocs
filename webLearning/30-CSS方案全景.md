# CSS 方案全景:Tailwind / CSS Modules / styled-components

CSS 的本质问题是**全局命名空间**和**作用域泄漏**。一个 `.button` 类,可能被另外一个组件不小心覆盖。

二十年来前端社区围绕这个问题进化出了几大流派:

```
原始 CSS  →  BEM / SMACSS(命名约定)
         →  CSS-in-JS(styled-components / emotion)
         →  CSS Modules(局部作用域)
         →  Utility-First(Tailwind)
         →  Zero-Runtime CSS-in-JS(vanilla-extract / panda CSS)
```

这一篇把当下主流的几种讲清楚,包括它们的取舍和选型建议。

---

## 一、原始 CSS 的问题

```css
/* button.css */
.button { padding: 8px 16px; background: blue; color: white; }

/* card.css */
.card .button { background: red; }   /* 副作用:改了 button.css 的样式 */
```

问题:
- **全局命名空间**:类名重名,后面的覆盖前面
- **死代码无法识别**:删了组件,CSS 留下垃圾
- **重构有风险**:改一个 `.button`,不知道哪些地方在用

所有现代方案,都是在**给 CSS 加边界**。

---

## 二、Tailwind:Utility-First(2025 主流)

### 1. 心智

不写 CSS 文件,**直接在 HTML 用工具类**:

```jsx
<button className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
  Click
</button>
```

每个 class 只做一件事:`px-4` = `padding-left/right: 1rem`,`bg-blue-500` = 蓝色。

### 2. 优点(为什么火)

- **不用想类名**:写 CSS 50% 时间花在"该叫啥"
- **不会越来越大**:无新 CSS 文件,字节数有上限(自动 purge 未用到的)
- **响应式快**:`md:flex lg:grid` 直接写在 className
- **设计系统强约束**:间距用 `4 8 12 16` 而不是随便 `13px`,设计稿更一致
- **代码能搜**:`hover:bg-blue-600` 全文搜索能找到所有用到的地方
- **改 design token 一处生效**:`tailwind.config.js` 里改 `blue.500`,全站自动更新

### 3. 反对意见(以及反驳)

```
"className 一长串,丑"
  → IDE 折叠 / 拆 prettier-plugin-tailwindcss 自动排序
  → 复用模式抽 React 组件,不是抽 CSS 类

"等于把 CSS 写在 HTML 里"
  → 是的,这正是它的"设计哲学"。组件 = 模板 + 样式 + 行为
  → 实际维护更容易,改样式不用跨文件跳

"覆盖第三方组件难"
  → @apply 或 group/peer 修饰符配合
```

### 4. 安装(2025)

```bash
pnpm install -D tailwindcss@latest @tailwindcss/postcss postcss
# 或 Vite 项目用官方插件:
pnpm install -D @tailwindcss/vite
```

```js
// vite.config.ts
import tailwindcss from '@tailwindcss/vite';

export default {
  plugins: [tailwindcss()],
};
```

```css
/* src/index.css */
@import "tailwindcss";
```

Tailwind 4 之后**零配置可用**,大部分场景不需要 `tailwind.config.js`。

### 5. 高频用法

```jsx
// 间距 / 尺寸(一格 = 0.25rem = 4px)
<div className="p-4 m-2 w-64 h-screen" />

// Flex / Grid
<div className="flex items-center justify-between gap-4" />
<div className="grid grid-cols-3 gap-2" />
<div className="grid grid-cols-[200px_1fr_200px]" />   // 任意值

// 颜色
<div className="bg-slate-100 text-slate-900 border border-slate-300" />

// 状态
<button className="bg-blue-500 hover:bg-blue-600 active:bg-blue-700 disabled:opacity-50" />

// 响应式(min-width 优先)
<div className="text-sm md:text-base lg:text-lg" />

// 暗色模式
<div className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white" />

// 任意值
<div className="top-[17px] bg-[#fafafa] grid-cols-[repeat(auto-fill,minmax(220px,1fr))]" />
```

### 6. 抽象重复:三种姿势

#### a. 抽组件(首选)

```jsx
function Button({ children, variant = 'primary' }) {
  const styles = {
    primary: 'bg-blue-500 hover:bg-blue-600 text-white',
    danger:  'bg-red-500 hover:bg-red-600 text-white',
  };
  return (
    <button className={`px-4 py-2 rounded ${styles[variant]}`}>
      {children}
    </button>
  );
}
```

**这是 Tailwind 推荐的复用方式**——抽 React 组件,不抽 CSS 类。

#### b. 用 `clsx` / `cva`(条件类)

```jsx
import clsx from 'clsx';

<button className={clsx(
  'px-4 py-2 rounded',
  variant === 'primary' && 'bg-blue-500 text-white',
  variant === 'danger'  && 'bg-red-500 text-white',
  disabled && 'opacity-50 cursor-not-allowed'
)} />
```

复杂状态用 [`class-variance-authority`](https://cva.style):

```js
import { cva } from 'class-variance-authority';

const button = cva('px-4 py-2 rounded', {
  variants: {
    variant: {
      primary: 'bg-blue-500 text-white',
      danger:  'bg-red-500 text-white',
    },
    size: {
      sm: 'text-sm',
      lg: 'text-lg',
    },
  },
  defaultVariants: { variant: 'primary', size: 'sm' },
});

<button className={button({ variant: 'danger', size: 'lg' })} />
```

CVA + Tailwind 是 2025 React 组件库标准搭配(shadcn/ui 用的就是这个)。

#### c. `@apply`(慎用)

```css
.btn {
  @apply px-4 py-2 rounded bg-blue-500 hover:bg-blue-600 text-white;
}
```

会让你又回到"想类名"的困境,**只在确实有强复用价值时用**。

### 7. 设计 token 配置(Tailwind 4)

```css
/* index.css */
@import "tailwindcss";

@theme {
  --color-brand: oklch(0.7 0.15 280);
  --font-display: 'Cal Sans', sans-serif;
  --spacing-15: 3.75rem;     /* 自定义 spacing */
}
```

然后就能用 `bg-brand`、`font-display`、`p-15`。

---

## 三、CSS Modules:文件级局部作用域

### 1. 心智

每个 `.module.css` 文件里的类名**自动加 hash 后缀**,作用域只在这个文件里。

```css
/* Button.module.css */
.button { padding: 8px 16px; background: blue; }
.primary { background: blue; }
.danger { background: red; }
```

```jsx
import styles from './Button.module.css';

<button className={styles.button} />
<button className={`${styles.button} ${styles.primary}`} />
```

构建后 class 名变成 `Button_button__a1b2c3`,**完全隔离**。

### 2. 优点

- **就是 CSS**,学习成本低
- **零运行时**,性能最好
- 编辑器有跳转支持
- 兼容所有框架(Vite/Next 都自带)

### 3. 缺点

- 类名仍要起(`button` `primary` 等)
- 跨组件共享样式不方便(要 `composes` 或拆 `.css`)
- 不带 design token,要自己用 CSS 变量做

### 4. 适用

- 中等规模项目
- 团队反感 Tailwind 长 className
- 需要严格 BEM-like 写法

```jsx
import s from './Card.module.css';

<div className={s.card}>
  <h3 className={s.title}>...</h3>
  <p className={s.subtitle}>...</p>
</div>
```

---

## 四、styled-components / Emotion:CSS-in-JS(已退潮)

### 1. 写法

```jsx
import styled from 'styled-components';

const Button = styled.button`
  padding: 8px 16px;
  background: ${props => props.danger ? 'red' : 'blue'};
  color: white;
  &:hover { opacity: 0.9; }
`;

<Button danger>Delete</Button>
```

样式 = 组件,**props 驱动样式**。

### 2. 优点(当年的)

- 真正的"组件即样式"
- 动态样式直观
- TypeScript 友好
- 基于 props 切换主题

### 3. 缺点(为什么退潮)

- **运行时开销**:每次渲染要算 className、注入 `<style>`
- **SSR 复杂**:Server Components / Next.js App Router 兼容差
- **打包体积**:库本身几十 KB
- **DevTools 看到一堆乱码 class 名**

2024 之后 React 生态逐步推荐 **零运行时方案**(Tailwind / vanilla-extract / Panda CSS)。

### 4. 现状

- 老项目还在用,迁移成本高
- 新项目**不建议从头开始用 styled-components**
- Emotion 比 styled-components 略好,但同样有运行时问题

如果就是喜欢 CSS-in-JS 写法,推荐 [vanilla-extract](https://vanilla-extract.style)(零运行时,编译时生成静态 CSS)或 [Panda CSS](https://panda-css.com)(类似)。

---

## 五、Vue / Angular / Svelte 的"自带方案"

### Vue:Single File Component 的 `<style scoped>`

```vue
<template>
  <button class="btn">Click</button>
</template>

<style scoped>
.btn { padding: 8px 16px; background: blue; }
</style>
```

`scoped` 自动给类加属性选择器,**作用域限定在当前组件**。Vue 默认就有,不用配置。

### Angular:每个组件天然 scoped

```typescript
@Component({
  selector: 'my-button',
  template: `<button class="btn">Click</button>`,
  styles: [`.btn { padding: 8px; }`]
})
```

Angular 用 Shadow DOM-like 模拟,**默认就是组件作用域**。

### Svelte:`<style>` 块自动 scoped

```svelte
<button class="btn">Click</button>

<style>
  .btn { padding: 8px; }
</style>
```

跟 Vue 一样,**默认 scoped**。

**结论**:Vue/Angular/Svelte 都自带组件级样式隔离,React 没有,所以要选额外方案。

---

## 六、CSS 变量(无论选哪个都要会)

```css
:root {
  --color-brand: #3b82f6;
  --color-text: #111;
  --space-md: 16px;
  --radius: 8px;
}

.card {
  background: var(--color-brand);
  padding: var(--space-md);
  border-radius: var(--radius);
}

/* 暗色模式 */
[data-theme="dark"] {
  --color-text: #fafafa;
}
```

**CSS 变量做主题、design token 是 2025 标准做法**。比 Sass 变量好的地方:**运行时可改**,JS 能动态修改。

```js
document.documentElement.style.setProperty('--color-brand', '#10b981');
```

---

## 七、对比表

| 维度 | Tailwind | CSS Modules | styled-components | Vanilla CSS |
| --- | --- | --- | --- | --- |
| 学习成本 | 中(要记类) | 低 | 低 | 低 |
| 作用域 | 全局工具类 | 文件级 | 组件级 | 全局 |
| 运行时开销 | ✅ 零 | ✅ 零 | ❌ 有 | ✅ 零 |
| SSR 兼容 | ✅ 完美 | ✅ 完美 | ⚠️ 需配置 | ✅ |
| 设计系统约束 | ✅ 强 | ❌ 自己做 | ⚠️ 主题 | ❌ |
| 动态样式 | ⚠️ 类切换 | ⚠️ 类切换 | ✅ props | ⚠️ 变量 |
| 死代码消除 | ✅ 自动 | ✅ 自动 | ✅ Tree shake | ❌ |
| 适合 | 大部分 | 中型 React | 旧项目 | 老页面 |

---

## 八、选型建议(2025)

```
新 React 项目
  ├─ 默认:Tailwind 4 + CVA(组件变体)
  ├─ 反 Tailwind 美学:CSS Modules + CSS Variables
  └─ 重运行时主题:Vanilla Extract(类似 styled-components 但零运行时)

新 Vue 项目
  └─ <style scoped> + CSS 变量,简单美好,Tailwind 也可加

新 Angular 项目
  └─ 自带组件样式 + Angular Material 或 PrimeNG

旧项目接手
  └─ 保留现有方案(切换成本远大于收益)
```

**最强组合:Tailwind + CVA + shadcn/ui**

```
shadcn/ui 是把组件源码"拷贝到你的项目里"的库,基于 Radix(无样式)+ Tailwind(样式)。
你拥有所有代码,可以随便改。2024 全网最热的 React UI 方案。
```

---

## 九、常见问题

### Q1: Tailwind 长 className 怎么办

- 装 `prettier-plugin-tailwindcss`,自动排序统一
- 抽组件,而不是抽 CSS 类
- 复杂的用 `cva` 拆 variant
- VS Code 有 Tailwind IntelliSense 提示

### Q2: 第三方组件样式怎么覆盖

```jsx
// 用 className prop(组件库要支持)
<DatePicker className="!bg-blue-500 !text-white" />
//                    ↑ ! 表示 important
```

或在全局 CSS 里:

```css
.rdrCalendarWrapper { background: #fff !important; }
```

### Q3: 服务端渲染 + Tailwind

Next.js / Nuxt / SolidStart 默认完美支持。Tailwind 是构建时静态生成 CSS,SSR 没任何问题。

### Q4: Tailwind vs Bootstrap

- Bootstrap = "组件 + 主题",直接给一套现成 UI
- Tailwind = "工具类",自己组装组件

新项目 2025 几乎不再用 Bootstrap。需要现成组件用 shadcn/ui / Mantine / Material UI。

---

## 十、心智模型

```
CSS 方案的本质问题 = "怎么给 CSS 加边界"

Tailwind        : 不写 CSS,用工具类拼,边界由"工具粒度"控制
CSS Modules     : 文件级 hash,边界 = 文件
styled-components: 组件级,边界 = 组件,但运行时
Vue/Angular/Svelte: 自带组件级 scoped

2025 React 默认搭配:
  Tailwind 4 + CVA + shadcn/ui + CSS 变量做主题
```

记住:**写 CSS 90% 时间花在"怎么不让它们打架"上,选好方案能省 90% 的精力**。

---

## 十一、推荐学习路径

1. **CSS 基础**(Flex / Grid / 选择器 / 优先级)→ 上一篇
2. **CSS 变量** → 看 MDN
3. **Tailwind**(刷一遍官网 ~3 小时)→ 完
4. **看一个真实项目**(shadcn/ui 源码 / Vercel 模板)
5. 偶尔遇到 styled-components 老项目能读就行

不需要把每个方案都精通,**主力一个,看得懂别的就够了**。
