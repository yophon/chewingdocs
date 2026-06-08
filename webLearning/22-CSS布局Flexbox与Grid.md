# CSS 布局:Flexbox 与 Grid

CSS 布局曾经是地狱:`float`、`position`、`vertical-align: middle`、清浮动、`<table>` 模拟列。
**Flexbox 解决一维布局,Grid 解决二维布局**。两个搞懂,99% 的页面都能优雅写出来。

这一篇把两个布局模型讲透,顺便带常见 trap 与现代补充(`gap`、`aspect-ratio`、`subgrid`)。

---

## 一、为什么不用 float / position 了

```
旧时代          | 现代
float           | flex / grid
position 顶角对齐 | flex 居中 / grid place-items
负 margin 调位置  | gap
table-cell      | grid
```

**`float` 是为了让文字绕图设计的**,不是为了布局。`position: absolute` 脱离文档流,父容器的高度收不回来。Flex/Grid 才是**真正为布局设计的工具**。

---

## 二、Flexbox:一维布局之王

> 一维 = 主轴一个方向,要么横排要么竖排。

### 1. 基本概念

```html
<div class="container">
  <div class="item">A</div>
  <div class="item">B</div>
  <div class="item">C</div>
</div>
```

```css
.container {
  display: flex;            /* 父容器 = flex 容器 */
  /* 默认主轴 = 水平,从左到右 */
}
```

```
container
┌─────────────────────────────┐
│  ┌──┐  ┌──┐  ┌──┐           │  → 主轴(main axis)
│  │A │  │B │  │C │           │
│  └──┘  └──┘  └──┘           │
└─────────────────────────────┘
                              ↓ 交叉轴(cross axis)
```

### 2. 容器属性(用最多)

```css
.container {
  display: flex;

  /* 主轴方向 */
  flex-direction: row | row-reverse | column | column-reverse;

  /* 主轴对齐(决定子元素之间的"水平"分布) */
  justify-content: flex-start | flex-end | center | space-between | space-around | space-evenly;

  /* 交叉轴对齐(决定子元素的"垂直"分布) */
  align-items: stretch | flex-start | flex-end | center | baseline;

  /* 换行 */
  flex-wrap: nowrap | wrap | wrap-reverse;

  /* 元素之间的间距(替代 margin,推荐) */
  gap: 16px;
  /* gap: 16px 24px;   行间距 列间距 */
}
```

### 3. 常用排列对照

```
justify-content: space-between
[A]──────[B]──────[C]   两端对齐,中间均分

justify-content: space-around
──[A]──[B]──[C]──        每个两边间距相等

justify-content: space-evenly
──[A]──[B]──[C]──        所有间距完全相等
```

`space-around` 和 `space-evenly` 经常混淆,记住:
- **around**:每个**元素**周围间距相等(所以两端是中间间距的一半)
- **evenly**:所有**间距**完全相等

### 4. 子元素属性

```css
.item {
  flex-grow: 1;       /* 多余空间分配比例(默认 0,不抢) */
  flex-shrink: 1;     /* 空间不够时缩小比例(默认 1,会缩) */
  flex-basis: auto;   /* 基础尺寸(默认 auto = content) */

  /* 简写 */
  flex: 1;            /* = 1 1 0,常用"等分剩余空间" */
  flex: auto;         /* = 1 1 auto */
  flex: none;         /* = 0 0 auto,不伸不缩 */

  /* 单独覆盖交叉轴对齐 */
  align-self: flex-start | center | flex-end;

  /* 排列顺序(默认 0) */
  order: 1;
}
```

### 5. 经典场景

#### 居中(终于不用脑细胞了)

```css
.center {
  display: flex;
  justify-content: center;
  align-items: center;
  /* 完事 */
}
```

#### 顶部导航栏(logo 左 + 菜单右)

```css
.nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
}
```

#### 卡片列表换行 + 等高

```css
.list {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}
.list > .card {
  flex: 1 1 280px;    /* 最少 280,自动伸缩 */
}
```

#### 圣杯布局(头/侧栏/主内容/底)

```css
.app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}
.app .main {
  display: flex;
  flex: 1;            /* 占剩余高度 */
}
.app .main .sidebar { width: 240px; }
.app .main .content { flex: 1; }
```

---

## 三、Grid:二维布局之王

> 二维 = 同时控制行和列。表格、复杂仪表盘、拼图式布局首选。

### 1. 最简版

```css
.grid {
  display: grid;
  grid-template-columns: 200px 1fr 1fr;     /* 三列 */
  grid-template-rows: auto 1fr auto;        /* 三行 */
  gap: 16px;
}
```

```
┌──────┬──────┬──────┐
│  A   │  B   │  C   │  ← row 1
├──────┼──────┼──────┤
│  D   │  E   │  F   │  ← row 2
└──────┴──────┴──────┘
 200px  1fr    1fr
```

`fr` = fraction,**剩余空间的份数**。`1fr 2fr` 就是 1:2 分。

### 2. 常用模式

#### 自适应等宽列(响应式神器)

```css
.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}
```

**这一行能解决 80% 的响应式列表布局**。
- `auto-fill`:能塞几列就塞几列
- `minmax(200px, 1fr)`:每列最少 200px,有空间就平分

宽屏:5 列;中屏:3 列;手机:1 列。**不写 media query**。

#### 命名网格区域(可读性极强)

```css
.layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  grid-template-rows: 60px 1fr 40px;
  grid-template-areas:
    "header  header"
    "sidebar main"
    "footer  footer";
  min-height: 100vh;
}

.layout > header  { grid-area: header; }
.layout > aside   { grid-area: sidebar; }
.layout > main    { grid-area: main; }
.layout > footer  { grid-area: footer; }
```

**布局图就写在 CSS 里**,改起来直观。

### 3. 子元素属性

```css
.item {
  /* 占哪几列(从第 1 条线到第 3 条线 = 占 2 列) */
  grid-column: 1 / 3;
  grid-column: 1 / span 2;     /* 等价写法 */
  grid-column: span 2;         /* 占 2 列(从默认位置) */

  /* 占哪几行 */
  grid-row: 2 / 4;

  /* 简写:row-start / column-start / row-end / column-end */
  grid-area: 2 / 1 / 4 / 3;
}
```

### 4. Grid vs Flex 决策

```
一维(横排或竖排) → Flex
二维(行 + 列同时控制) → Grid

复杂仪表盘 / 主体页面框架 → Grid
组件内的对齐 / 等分 → Flex
```

**真实项目里 Grid 套 Flex** 是常态:外层 Grid 划分大区域,每个区域内部用 Flex 排小元素。

---

## 四、现代补充(2024+ 必会)

### 1. `gap` 解放 `margin`

```css
/* 旧时代 */
.list > * { margin-right: 12px; }
.list > *:last-child { margin-right: 0; }

/* 现代 */
.list { display: flex; gap: 12px; }
```

`gap` Flex 和 Grid 都支持。**不要再用负 margin 抵消首尾间距了**。

### 2. `aspect-ratio`

```css
.video-thumbnail {
  aspect-ratio: 16 / 9;    /* 永远保持 16:9 */
  width: 100%;
}
```

以前要 `padding-top: 56.25%` + 绝对定位 hack,现在一行解决。

### 3. `place-items` / `place-content` / `place-self`

```css
.center {
  display: grid;
  place-items: center;     /* = align-items + justify-items */
}
```

Grid 居中三个字搞定。

### 4. `subgrid`(2023 全员支持)

```css
.parent {
  display: grid;
  grid-template-columns: 1fr 2fr 1fr;
}
.child {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: subgrid;   /* 继承父级列轨道 */
}
```

子级网格**对齐父级网格的列**,做卡片对齐神器。

### 5. 容器查询(Container Queries)

```css
.card-container { container-type: inline-size; }

@container (min-width: 400px) {
  .card { display: grid; grid-template-columns: 1fr 2fr; }
}
```

**根据父容器宽度而不是视口宽度**改样式。组件级响应式的终极方案。

---

## 五、常见 Trap

### Trap 1:`flex` 项目宽度溢出

```css
.item {
  flex: 1;
  /* 内容很长 → 整行被撑爆 */
}
```

**Flex item 默认 `min-width: auto`**,内容能撑就撑。修复:

```css
.item {
  flex: 1;
  min-width: 0;       /* 让它能缩小到 0 */
  overflow: hidden;
}
```

或者给文本加 `text-overflow: ellipsis` 也要先 `min-width: 0`。

### Trap 2:`100vh` 在手机上不对

iOS Safari 的 `100vh` 包含了地址栏,实际内容会被截。修复:

```css
.full {
  height: 100vh;
  height: 100dvh;     /* dynamic viewport height,2023+ 普及 */
}
```

`dvh` 是动态视口高度,会根据浏览器 UI 收缩调整。

### Trap 3:Grid 项目超出格子

```css
.item {
  /* 内容比格子大 → 撑出网格 */
  min-width: 0;
  min-height: 0;       /* Grid item 默认 min: auto,同 flex */
}
```

### Trap 4:`align-items: baseline` 行高错位

文字对齐用 baseline,但**不同 font-size 对齐基线时整行高度会被拉**。除非确实要对文字基线,否则用 `center`。

---

## 六、响应式策略

### 断点集(Tailwind 风格)

```css
/* 小屏 < 640px:不写 media query 视为默认 */
@media (min-width: 640px)  { /* sm 平板竖 */ }
@media (min-width: 768px)  { /* md 平板横 */ }
@media (min-width: 1024px) { /* lg 笔记本 */ }
@media (min-width: 1280px) { /* xl 大屏 */ }
@media (min-width: 1536px) { /* 2xl 超大屏 */ }
```

**Mobile First**:先写小屏样式,再用 `min-width` 加大屏覆盖。这样小屏不用反复 reset。

### 优先级:能不写 media query 就不写

```css
/* ✅ 用 grid 自适应,无需 media query */
.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
}

/* ❌ 多重 media query */
.gallery { grid-template-columns: 1fr; }
@media (min-width: 640px) { .gallery { grid-template-columns: 1fr 1fr; } }
@media (min-width: 1024px) { .gallery { grid-template-columns: 1fr 1fr 1fr; } }
```

第一种短、活、不用维护。

---

## 七、实战案例:常见页面骨架

### 1. 仪表盘

```css
.dashboard {
  display: grid;
  grid-template-columns: 240px 1fr;
  grid-template-rows: 56px 1fr;
  grid-template-areas:
    "sidebar header"
    "sidebar main";
  height: 100dvh;
}
.dashboard > .sidebar { grid-area: sidebar; overflow-y: auto; }
.dashboard > .header  { grid-area: header; }
.dashboard > .main    {
  grid-area: main;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  padding: 24px;
}
```

### 2. 卡片(图 + 文 + 按钮垂直对齐)

```css
.card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border-radius: 12px;
  background: #fff;
}
.card .actions {
  margin-top: auto;     /* 按钮永远贴底 */
}
```

### 3. 表单(label 在左,输入框在右,自适应)

```css
.form {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 12px 16px;
  align-items: center;
}
```

`max-content` 让 label 列自动按最长 label 取宽,输入框列占剩下。**写一次,所有表单对齐**。

---

## 八、调试

```
浏览器 DevTools(Chrome / Firefox)有内置 Flex/Grid 可视化:
- 选中 flex 容器 → "flex" 标签 → 显示主轴/交叉轴箭头
- 选中 grid 容器 → "grid" 标签 → 叠加网格线和编号
```

写布局**永远开着 DevTools**,F12 是布局工程师的副驾驶。

---

## 九、Tailwind 对照(不是必学,但常见)

```
display: flex              →  flex
flex-direction: column     →  flex-col
justify-content: center    →  justify-center
align-items: center        →  items-center
gap: 16px                  →  gap-4
flex: 1                    →  flex-1

display: grid              →  grid
grid-template-columns: repeat(3, 1fr)  →  grid-cols-3
grid-column: span 2        →  col-span-2
```

下一篇 23 详细讲 Tailwind / CSS Modules / styled-components。

---

## 十、心智模型

```
Flex  : "我有一行(或一列)东西,告诉它们怎么挤、怎么对齐"
Grid  : "我画一张表格,告诉每个东西放哪个格子"

布局 90% 流程:
  1. 先想清楚是一维还是二维 → 选 Flex 或 Grid
  2. 设计大框架(通常 Grid)
  3. 框架里小区域(通常 Flex)
  4. 间距用 gap,不用 margin
  5. 响应式优先用 auto-fill / minmax,不行再 media query
```

记住一句话:**Flex 排东西,Grid 划地盘**。

---

## 十一、参考速查

```
Flex 容器:
  display: flex
  flex-direction / flex-wrap / gap
  justify-content (主轴)
  align-items (交叉轴)

Flex 子项:
  flex: 1  (常用等分)
  align-self
  order

Grid 容器:
  display: grid
  grid-template-columns / -rows
  grid-template-areas
  gap
  justify-items / align-items
  place-items (合写)

Grid 子项:
  grid-column / grid-row
  grid-area

通用:
  aspect-ratio
  100dvh
  min-width: 0 (解决子项溢出)
  container-type + @container (容器查询)
```
