# Web Components

Web Components = **浏览器原生组件标准**。不依赖任何框架,**写一次到处用**(React / Vue / Angular / 原生 HTML 都能用)。

```
Custom Elements    自定义标签 <my-button>
Shadow DOM         样式隔离 + DOM 封装
HTML Templates     <template> / <slot>
ES Modules         JS 模块化
```

四个标准合起来 = Web Components。

---

## 一、为什么有 Web Components

```
React / Vue / Angular 各写一套组件库
  → 换框架时全部重写
  → A 公司用 React,B 公司用 Vue,组件无法共享

Web Components 是浏览器原生标准
  → 写一次,任何框架都能用
  → 不依赖打包工具就能跑
  → 浏览器持续维护
```

适合:
- **跨框架组件库**(Adobe Spectrum / Microsoft FAST / Shoelace)
- **设计系统**(大公司一份组件库给所有产品用)
- **微前端集成**(不同框架的应用共享 UI)
- **极简项目**(不想引入框架)

不适合:
- 重度状态管理(框架还是更好)
- SSR(WC 服务端渲染麻烦,2024 还在演进)

---

## 二、Custom Elements:自定义标签

### 1. 第一个组件

```js
class MyButton extends HTMLElement {
  constructor() {
    super();
  }

  connectedCallback() {
    // 元素插入到 DOM 后
    this.innerHTML = `<button>${this.textContent}</button>`;
  }
}

customElements.define('my-button', MyButton);
```

```html
<my-button>Click me</my-button>
```

**约定**:Custom Element 名**必须带连字符**(`my-button`,不是 `mybutton`),避免和未来的 HTML 标签冲突。

### 2. 生命周期

```js
class MyEl extends HTMLElement {
  connectedCallback() {
    // 插入 DOM(类似 React mount / Vue mounted)
  }

  disconnectedCallback() {
    // 移出 DOM(unmount)
  }

  attributeChangedCallback(name, oldVal, newVal) {
    // 属性变化(必须配合下面的 observedAttributes)
  }

  static get observedAttributes() {
    return ['count', 'label'];   // 监听这些属性
  }
}
```

### 3. 属性 vs 属性

HTML 元素有两种"属性":
- **attribute**:HTML 上写的 `<my-el count="5">`,字符串
- **property**:JS 里 `el.count = 5`,任意类型

```html
<my-button label="Click"></my-button>
<script>
  const el = document.querySelector('my-button');
  el.label;        // "Click"(getter 自己实现)
  el.count = 5;    // 设 property
</script>
```

约定:简单值同步两边,复杂数据用 property:

```js
class MyEl extends HTMLElement {
  static observedAttributes = ['label'];

  // attribute 变 → property
  attributeChangedCallback(name, oldV, newV) {
    if (name === 'label') this._label = newV;
  }

  get label() { return this._label; }
  set label(v) {
    this._label = v;
    this.setAttribute('label', v);    // property 变 → attribute
    this.render();
  }

  render() { /* 重新渲染 */ }
}
```

---

## 三、Shadow DOM:样式与 DOM 封装

### 1. 什么是 Shadow DOM

```js
class MyCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        .card { border: 1px solid #ccc; padding: 16px; border-radius: 8px; }
      </style>
      <div class="card">
        <slot></slot>
      </div>
    `;
  }
}
customElements.define('my-card', MyCard);
```

```html
<my-card>This is content</my-card>
```

效果:
- `<style>` 里的 CSS **只作用于 shadow tree 里**,不污染外部
- 外部 CSS `.card { background: red }` **影响不到** shadow 内部
- DOM 树有"边界",`document.querySelector('.card')` 看不到

### 2. open vs closed

```js
this.attachShadow({ mode: 'open' });    // 外部能 el.shadowRoot 访问
this.attachShadow({ mode: 'closed' });   // 外部访问不到
```

**99% 用 open**,closed 太严反而难调试,且并不真正"安全"。

### 3. Slot:插槽

```html
<!-- 组件内 -->
<div class="card">
  <header>
    <slot name="title"></slot>
  </header>
  <main>
    <slot></slot>
  </main>
  <footer>
    <slot name="footer">Default footer</slot>
  </footer>
</div>

<!-- 使用 -->
<my-card>
  <h2 slot="title">Hello</h2>
  <p>Body content</p>
  <button slot="footer">OK</button>
</my-card>
```

slot 类似 React 的 `children` 或 Vue 的 `<slot>`,**让用户填内容**。

### 4. CSS 穿透 Shadow

外部 CSS 影响不到 Shadow 内部,但有几种方式:

```css
/* 1. CSS 变量(穿透) */
my-card { --card-bg: #f0f0f0; }
/* 组件内: */
.card { background: var(--card-bg, white); }

/* 2. ::part() 暴露 */
my-card::part(header) { color: red; }
/* 组件内: <header part="header"> */

/* 3. :host(组件根选择器) */
:host { display: block; }
:host([disabled]) { opacity: 0.5; }
:host(.large) { font-size: 20px; }
```

CSS 变量是**最常用的主题方式**。

---

## 四、Template

```html
<template id="card-tpl">
  <style>.card { padding: 16px; }</style>
  <div class="card">
    <slot></slot>
  </div>
</template>

<script>
  class MyCard extends HTMLElement {
    constructor() {
      super();
      const tpl = document.getElementById('card-tpl');
      this.attachShadow({ mode: 'open' })
          .appendChild(tpl.content.cloneNode(true));
    }
  }
  customElements.define('my-card', MyCard);
</script>
```

`<template>` 内容**默认不渲染**,JS 取出来 clone 用。**比 innerHTML 拼字符串性能好**(只解析一次)。

---

## 五、用框架写 Web Components

原生 API 写组件啰嗦,实战用框架:

### 1. Lit(Google,2KB,最流行)

```bash
pnpm add lit
```

```ts
import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('my-counter')
export class MyCounter extends LitElement {
  static styles = css`
    button { padding: 8px 16px; }
  `;

  @property({ type: Number }) count = 0;

  render() {
    return html`
      <button @click=${() => this.count++}>
        Count: ${this.count}
      </button>
    `;
  }
}
```

```html
<my-counter></my-counter>
<my-counter count="10"></my-counter>
```

特点:
- 模板用 tagged template literals(html` `),编译时优化
- 响应式:property 变自动 re-render(像 Vue)
- 体积小(2KB)
- TypeScript 友好

### 2. Stencil(Ionic 出品)

```ts
import { Component, Prop, h } from '@stencil/core';

@Component({ tag: 'my-button', styleUrl: 'my-button.css', shadow: true })
export class MyButton {
  @Prop() label: string;

  render() {
    return <button>{this.label}</button>;
  }
}
```

特点:
- 像 React 写法 + 装饰器
- 编译时生成框架适配器(React / Vue / Angular 都能用)
- 适合做组件库

### 3. SolidJS / Svelte 也能编译到 Web Components

```ts
// Svelte
<svelte:options tag="my-counter" />
```

```ts
// SolidJS
import { customElement } from 'solid-element';
customElement('my-counter', { count: 0 }, MyCounter);
```

---

## 六、跨框架使用

### 1. 在 React 里用

```jsx
function App() {
  return <my-counter count={5}></my-counter>;
}
```

注意:
- React 把 prop 当 attribute 传(字符串),复杂数据要用 ref:

```jsx
function App() {
  const ref = useRef();
  useEffect(() => {
    ref.current.user = { name: 'Alice' };   // 设 property
  });
  return <my-counter ref={ref}></my-counter>;
}
```

- React 19 改善了:**直接支持 property + 自定义事件**,不用 ref
- 自定义事件:在 React 里写 `onmycustom={...}`(全小写 + on 前缀),React 19+ 自动处理

### 2. 在 Vue 里用

```vue
<template>
  <my-counter :count="num" @my-event="onEvent" />
</template>
```

Vue 自动处理 property / attribute,**最好的兼容性**。

### 3. 在 Angular 里用

```ts
@NgModule({
  schemas: [CUSTOM_ELEMENTS_SCHEMA]    // 必加,告诉 Angular 别检查这个标签
})
```

```html
<my-counter [count]="num" (myEvent)="onEvent($event)"></my-counter>
```

---

## 七、自定义事件

```js
class MyButton extends HTMLElement {
  connectedCallback() {
    this.shadowRoot.querySelector('button').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('my-click', {
        detail: { time: Date.now() },
        bubbles: true,        // 冒泡到外层
        composed: true,       // 穿透 shadow boundary
      }));
    });
  }
}
```

```html
<my-button id="b">Click</my-button>
<script>
  document.getElementById('b').addEventListener('my-click', (e) => {
    console.log(e.detail.time);
  });
</script>
```

**`composed: true` 是穿透 shadow DOM 的关键**,默认 false 不能冒泡到外面。

---

## 八、Form-associated Custom Elements(2022+)

让自定义元素**集成到 `<form>`**(像 input 一样):

```js
class MyInput extends HTMLElement {
  static formAssociated = true;   // 关键

  constructor() {
    super();
    this._internals = this.attachInternals();
  }

  set value(v) {
    this._internals.setFormValue(v);    // 把值给 form
  }

  // 校验
  checkValidity() {
    if (!this.value) {
      this._internals.setValidity({ valueMissing: true }, 'Required');
      return false;
    }
    this._internals.setValidity({});
    return true;
  }
}
customElements.define('my-input', MyInput);
```

```html
<form>
  <my-input name="email" required></my-input>
  <button type="submit">Submit</button>
</form>
```

提交时 `my-input` 的值会和原生 input 一样进入 `FormData`。

---

## 九、SSR 与 Web Components(2024 难点)

```
浏览器:Custom Element 立刻升级,所有功能可用
SSR:服务端渲染时 Custom Element 还没 JS,只是一个 <my-card> 空标签

解决:
  Declarative Shadow DOM(2023+ 标准)
  服务端直接输出 <template shadowrootmode="open">,浏览器解析时自动建 shadow
```

```html
<my-card>
  <template shadowrootmode="open">
    <style>...</style>
    <div class="card">
      <slot></slot>
    </div>
  </template>
  <p>Real content</p>
</my-card>
```

**SSR 直接吐 HTML 就有样式**,JS 加载后接管交互。Lit 的 `@lit-labs/ssr` 已支持。

但仍然不如 React / Vue 的 SSR 成熟。**重 SSR 项目暂不推荐 WC**。

---

## 十、Shoelace:实战 WC 库参考

[Shoelace](https://shoelace.style)(2024 改名 [Web Awesome](https://www.webawesome.com))是基于 Lit 的 UI 库:

```html
<sl-button variant="primary">Click me</sl-button>
<sl-input label="Email" type="email"></sl-input>
<sl-dialog label="Hello">
  <p>Content</p>
  <sl-button slot="footer" variant="primary">OK</sl-button>
</sl-dialog>
```

**任何框架都能用**,设计系统统一,**没有 React 版本 / Vue 版本之分**。

类似的:
- **FAST**(Microsoft):https://www.fast.design
- **Spectrum Web Components**(Adobe)
- **Carbon**(IBM)
- **Material Web**(Google,@material/web)

---

## 十一、Web Components 的争议

### 优点

- 浏览器原生,**永远向后兼容**
- 跨框架
- 样式 / DOM 真正隔离
- 渐进增强(没 JS 时也能 fallback)

### 缺点

- **DX 不如 React / Vue**:模板表达能力弱(Lit 缓解)
- **SSR 难**(Declarative Shadow DOM 改善了,但仍然麻烦)
- **样式穿透麻烦**(::part / CSS variables 学习成本)
- **状态管理弱**:复杂状态还是要框架
- **生态不如主流框架**

### 现实

```
适合的场景:设计系统 / 跨框架组件库 / 微前端 / 极简页
不适合的场景:复杂 SPA(还是 React / Vue 更舒服)
```

很多公司**应用层用 React,组件层用 Web Components**(Adobe / GitHub / Salesforce 都这样)。

---

## 十二、心智模型

```
Web Components 四件套:
  Custom Elements  自定义标签
  Shadow DOM       样式隔离
  Template / Slot   插槽
  ES Modules       模块化

浏览器原生 ≠ DX 最佳:
  原生 API 写组件啰嗦,实战用 Lit
  Lit ≈ Web Components 的 React/Vue

定位:
  跨框架共享组件 = WC 的杀手锏
  普通应用开发 = 还是用 React / Vue / Angular / Solid
```

---

## 十三、推荐学习路径

如果你想用 WC:

1. **跑通 Lit 官方 tutorial**(30 分钟):https://lit.dev/tutorials
2. **写一个 `<my-button>`**,放进现有 React/Vue 项目用
3. 看 Shoelace 源码,学组件库实战
4. 微前端场景再深入(下一篇 45 微前端)

如果只是了解:这一篇 + 知道 WC 存在,需要时再回来。

---

## 十四、参考资源

- MDN Web Components:https://developer.mozilla.org/en-US/docs/Web/API/Web_components
- Lit:https://lit.dev
- Shoelace / Web Awesome:https://www.webawesome.com
- open-wc:https://open-wc.org(WC 最佳实践)
- custom-elements-everywhere:https://custom-elements-everywhere.com(各框架兼容性)

下一篇 45 讲微前端架构(Module Federation)。
