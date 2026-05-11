## CSRF / SameSite / SOP / CORS:浏览器同源模型与四种绕过

讲 CSRF 最常见的开场白是「攻击者伪造一个表单让你点」,**这种讲法害人不浅**——它让人觉得 CSRF 是「钓鱼」的一种,装个 Token 就完事。真相是:**CSRF 是浏览器同源模型的结构性副作用**——「自动带 Cookie」这个设计本来是为了 SSO 体验,在 CSRF 场景下却变成了攻击者的弹药库。webLearning/35 一节带过了「CSRF Token」是什么;**这一篇把整个浏览器同源模型(SOP / CORS / SameSite / Cookie 三件套)一次讲透**,看完你应该能在白板前回答「为什么 SameSite=Lax 不能完全替代 CSRF Token」「为什么 CORS 不是用来防 CSRF 的」。

> 一句话先记住:**SOP 是浏览器的"默认拒绝",CORS 是"放宽 SOP"的协议,SameSite 是 Cookie 自己的隔离机制,CSRF Token 是应用层兜底**——**四个东西解决的是同一个问题的不同面**,缺一不可。任何「我配了 CORS 所以不会有 CSRF」「我用了 SameSite=Lax 所以不需要 Token」的说法都是混淆了层次。CORS 和 SOP 保护的是「读」(跨源 JS 能不能拿到响应内容),CSRF 防御保护的是「写」(跨源 HTML 能不能让浏览器替你发请求)。**这两条防线方向相反**。

---

### 一、同源策略(SOP):浏览器最古老的安全边界

#### 1.1 为什么浏览器需要 SOP

浏览器是个**极其危险的运行环境**——它要在同一个进程里同时跑 N 个互不信任的网站的代码:你打开了银行的 tab,又打开了一个论坛的 tab,论坛的 JS 不能去读银行 tab 的 DOM、不能读银行的 Cookie、不能伪造一个银行的 fetch 请求并拿到响应。**没有这条规则,任何一个网站只要让你访问一下就能掏空你所有其他网站**。

1995 年 Netscape 引入 JS 的时候就意识到这个问题,所以从一开始就立了一条规矩:**Same-Origin Policy**——同源的资源互相完全信任,跨源的资源默认完全隔离。

#### 1.2 origin 的精确定义

```
origin = scheme + host + port

https://bank.com:443/page
└─┬─┘   └──┬───┘ └┬┘
 scheme   host  port

任意一个不同 = 跨源(cross-origin)
```

一组让新手栽跟头的例子:

```
https://bank.com         vs  http://bank.com         → 跨源(scheme 不同)
https://bank.com:443     vs  https://bank.com:8443   → 跨源(port 不同)
https://bank.com         vs  https://www.bank.com    → 跨源(host 不同,子域不算同源)
https://bank.com/login   vs  https://bank.com/admin  → 同源(path 不影响 origin)
https://bank.com         vs  https://bank.com#hash   → 同源(fragment 不影响)
```

**子域名不算同源**——这点最容易记错。`a.bank.com` 和 `b.bank.com` 是跨源的,如果想让它们互相访问,要么用 `document.domain`(已被废弃),要么用 postMessage / CORS。

#### 1.3 SOP 到底拦了什么

SOP 是一条**默认拒绝**规则,但它**只拦"读"不拦"写"**:

```
跨源 JS 能做的(写):
  - <img src="跨源 URL">          ── 浏览器会发请求,带 Cookie
  - <form action="跨源 URL">      ── 提交时浏览器会发请求,带 Cookie
  - <script src="跨源 URL">       ── 加载并执行
  - fetch('跨源 URL')              ── 请求会发出(简单请求场景)

跨源 JS 不能做的(读):
  - 读跨源 fetch 的响应 body
  - 读跨源 iframe 的 DOM(innerHTML / contentDocument)
  - 读跨源图片的像素(canvas getImageData 会污染)
  - 读跨源 window 的属性(只能调几个白名单方法如 postMessage)
```

**记住这条不对称性,后面 CSRF 的所有故事都从这儿来**:浏览器允许你发跨源请求,但不让你读响应。**攻击者利用「发出去」就够了——只要那个请求是「转账」「改密码」,响应是什么不重要**。

```
┌───────────── 浏览器(同一个用户) ───────────────┐
│                                                 │
│   evil.com 的页面            bank.com 的会话    │
│      │                            ▲             │
│      │  <form action=             │  Cookie 自动 │
│      │   "bank.com/transfer">    │  跟着请求走  │
│      └──────────────────────────────┐           │
│                                     ▼           │
│                              bank.com 处理转账   │
│                                     │           │
│      ✗ JS 读不到响应  ◀────────────┘           │
│      但请求已经成功了!                          │
└─────────────────────────────────────────────────┘
```

---

### 二、CSRF 原理:Cookie 自动携带是双刃剑

#### 2.1 浏览器为什么自动带 Cookie

HTTP 是无状态的,服务器靠 Cookie 识别用户。**Cookie 的核心规则**:只要请求的目标域和 Cookie 的 domain 匹配,**不管这个请求是从哪个页面发起的**,浏览器都会带上。

这个设计本来是为了**体验**——你登录了 google.com,之后任何 google 服务都自动认得你,不用每个子产品都登一次。**但攻击者一旦能让你的浏览器替他向 bank.com 发请求,bank.com 的 Cookie 就被无情地附上了**。

```
受害者已登录 bank.com,浏览器有 bank.com 的 Session Cookie

受害者访问 evil.com,evil.com 的 HTML 里有:
  <img src="https://bank.com/transfer?to=hacker&amount=10000">

浏览器加载 img → 发起 GET bank.com/transfer →
  自动带上 bank.com 的 Cookie → 服务器以为是合法用户操作
```

**这就是 CSRF(Cross-Site Request Forgery)的本质**:**攻击者不需要偷 Cookie,他借浏览器之手用你的 Cookie 发请求**。这和 XSS 的差别要看清——XSS 是攻击者在你的域内执行代码(JS 跑在 bank.com 的 origin 里),**CSRF 是攻击者在他自己的域内"诱发"你的浏览器替他打**(JS 跑在 evil.com,但请求发到 bank.com)。

#### 2.2 CSRF 成立的三个条件

不是任何接口都能 CSRF——成立需要同时满足:

1. **接口靠 Cookie 鉴权**(不是 Authorization header / 自定义 token header)
2. **接口操作是"写"语义**(POST / PUT / DELETE,GET 也能写就更糟)
3. **请求体是攻击者能从跨源 HTML 构造出来的形式**(application/x-www-form-urlencoded、multipart/form-data、text/plain)

**第三条最容易被忽略**。如果接口只接受 `Content-Type: application/json`,**纯 HTML 表单是构造不出 JSON 请求的**(form 只能发上面那三种 Content-Type),CSRF 就被天然挡住——但这条防线脆得吓人,见下文 GET CSRF / JSON CSRF 段落。

#### 2.3 真实事故:某银行的 GET 转账接口

```
GET /transfer?from=ME&to=12345&amount=10000 HTTP/1.1
Cookie: SESSIONID=...
```

把转账写成 GET 是经典反模式。**`<img src="...">` 就能直接打**——攻击者在论坛贴一个图片标签,凡是已登录该银行的用户访问帖子,浏览器都会偷偷发起一笔转账。**RESTful 教科书里"GET 不能有副作用"那一条不是审美,是安全红线**。

---

### 三、最小 PoC:CSRF 是怎么发生的

漏洞接口(典型 Flask):

```python
@app.route('/change_email', methods=['POST'])
def change_email():
    if not session.get('user_id'):
        return 'login required', 401
    new_email = request.form['email']   # 表单 form-urlencoded
    db.update_email(session['user_id'], new_email)
    return 'ok'
```

攻击者只需要在自己的域(evil.com)托管一个 HTML:

```html
<!DOCTYPE html>
<html>
<body>
<form id="f" action="https://victim.com/change_email" method="POST">
  <input name="email" value="attacker@evil.com">
</form>
<script>document.getElementById('f').submit();</script>
</body>
</html>
```

诱导受害者访问 evil.com,**JS 自动提交表单 → 浏览器跨源 POST → 自动带上 victim.com 的 Cookie → 服务器认为是合法用户改邮箱 → 攻击者用"忘记密码"邮件接管账户**。

**整个利用链没有任何 0day,只用了 HTML 表单本身的能力**。这就是为什么 CSRF 列入 OWASP Top 10 二十年不掉队。

---

### 四、CSRF 防御四代

#### 4.1 第一代:Referer / Origin 校验

```python
def is_safe_request():
    origin = request.headers.get('Origin') or request.headers.get('Referer')
    return origin and origin.startswith('https://bank.com')
```

思路:**检查请求是从哪个 origin 发起的**。`Origin` 头是浏览器在跨源请求中自动加的,**JS 改不了**,理论上可靠。

陷阱:
- **Referer 可以缺失**(浏览器隐私设置、`Referrer-Policy: no-referrer`、HTTPS → HTTP 跳转),不能用「Referer 为空就放行」的逻辑
- `startswith` 用错就翻车——`https://bank.com.evil.com` 也通过校验
- 老 IE 不发 Origin 头(已无实战意义,但要知道)

**正确做法**:严格白名单,精确匹配 host,Referer 缺失视为不可信(对写操作)。

#### 4.2 第二代:Synchronizer Token Pattern(同步 Token)

服务器生成一个**不可预测的 Token**,放在表单隐藏字段,提交时校验。

```html
<form method="POST" action="/change_email">
  <input type="hidden" name="csrf_token" value="r9X2...随机...">
  <input name="email">
</form>
```

```python
@app.route('/change_email', methods=['POST'])
def change_email():
    if request.form['csrf_token'] != session['csrf_token']:
        abort(403)
    ...
```

**为什么这能防 CSRF**:攻击者在 evil.com **读不到** victim.com 页面的 Token(SOP 拦截读),自然无法构造合法表单。

**实现要点**:
- Token 要绑定 session,且每个 session 唯一
- Token 不要走 URL(会进日志 / Referer)
- 用 HMAC 把 sessionID + nonce 签出 Token,服务器无状态校验(无 session 存储压力)
- **CSRF Token 不是密码学秘密,但要不可预测**——用 `secrets.token_urlsafe`,不要 `random.random`

#### 4.3 第三代:Double Submit Cookie(双重提交 Cookie)

无状态的版本——服务器把同一个 Token 既种到 Cookie 又放进表单/Header,提交时检查两个值是否相等。

```
Set-Cookie: csrf=abcd1234
<form>
  <input name="csrf" value="abcd1234">
</form>
```

服务器只比对两个 csrf 是否一致,**不需要存 session state**。

**为什么生效**:攻击者从 evil.com 读不到 victim.com 的 Cookie(SOP),也写不进 victim.com 域的 Cookie(默认 SameSite 限制 + Cookie 的 domain 隔离),无法让两个值对上。

**坑**:必须确保 Cookie 不被子域写入(子域可以写父域 Cookie 的话,xss.bank.com 上的攻击能伪造 csrf cookie),用 `__Host-` 前缀的 Cookie 来强制。

#### 4.4 第四代:SameSite Cookie(浏览器层面解决)

这是最干净的方案——**让浏览器自己决定哪些跨源请求带 Cookie**。Chrome 80+(2020)默认 `Lax`,从那一刻起 CSRF 攻击面减小了一个数量级。

```
Set-Cookie: SESSIONID=...; SameSite=Strict
Set-Cookie: SESSIONID=...; SameSite=Lax       <-- 现代默认
Set-Cookie: SESSIONID=...; SameSite=None; Secure   <-- 必须带 Secure
```

三档行为差异(必须记):

| 场景 | Strict | Lax | None |
| --- | --- | --- | --- |
| 同站请求 | 带 | 带 | 带 |
| 跨站子资源(img / iframe / fetch) | 不带 | 不带 | 带 |
| 跨站 POST 表单 | 不带 | **不带** | 带 |
| 跨站 GET 顶层导航(点击外链跳转过来) | **不带** | **带** | 带 |
| 跨站 prefetch | 不带 | 通常不带 | 带 |

**Lax 和 Strict 的关键差异在"顶层 GET 导航"**——用户点击邮件里的 `https://bank.com/dashboard` 链接,Strict 不带 Cookie(用户看到登录页,体验崩),Lax 带 Cookie(看到正常仪表盘)。**Lax 是体验和安全的现代默认平衡点**。

**"site" 和 "origin" 不是一回事**——SameSite 用的是 **eTLD+1**(注册域),`a.bank.com` 和 `b.bank.com` 是**同 site** 但**不同 origin**。这就是为什么名字里是 `Site` 不是 `Origin`——它放宽了同 site 间的请求,只严格挡跨 site。

#### 4.5 SameSite 不是银弹:四个剩余攻击面

不要以为开了 SameSite=Lax 就高枕无忧:

1. **子域 XSS / 跨子域信任**——`xss.bank.com` 上的脚本能向 `bank.com` 发请求(同 site),SameSite 不挡
2. **GET 写操作仍然能打**——Lax 模式下顶层 GET 导航**带 Cookie**,如果你的转账接口接受 GET,`<a href="...">用户点一下就完蛋
3. **Chrome 的 2 分钟豁免期**(已逐步移除,但老逻辑里曾存在):新建 Cookie 在前 2 分钟内当作 Lax-allowing-unsafe 处理,POST 也会带——历史坑
4. **明确设 SameSite=None 的接口**(为了支持跨站嵌入)又把面打开

**结论**:SameSite=Lax 把 CSRF 从「默认存在」变成「需要满足特定条件才存在」,**但仍然要在写操作接口加 CSRF Token 或 Origin 校验**——纵深防御。

---

### 五、CORS:不是安全机制,是"放宽 SOP"的协议

#### 5.1 最常见的误解

「我配了 CORS 所以跨源攻击不会发生」——**这句话完全错**。**CORS 是用来让你"故意"放宽 SOP 的协议**,默认不配 CORS,浏览器就按 SOP 严格隔离。**配置 CORS 是在打开一道门,不是在锁一道门**。

**CORS 跟 CSRF 防御没有直接关系**:
- SOP 拦的是「跨源 JS 读响应」
- CORS 是「服务器主动同意被某些 origin 读」
- CSRF 关心的是「请求能不能发出去」,**这一步在 CORS 检查之前就完成了**

所以「我没开 CORS」**根本不能阻止 CSRF**——跨源 form 提交、跨源 img 请求,这些东西**不受 CORS 管**,浏览器照发不误,只是 JS 读不到响应。**而 CSRF 不在乎响应**。

#### 5.2 简单请求 vs 预检请求

CORS 把跨源请求分成两类:

**简单请求(simple request)**——直接发,不预检:
- 方法是 GET / HEAD / POST
- Content-Type 只能是 `application/x-www-form-urlencoded` / `multipart/form-data` / `text/plain`
- 不带自定义 header(除了几个白名单)

**预检请求(preflight)**——先发 OPTIONS 探路:
- 方法是 PUT / DELETE / PATCH 等
- Content-Type 是 `application/json`
- 带了任何自定义 header(`X-Requested-With`、`Authorization`、`X-CSRF-Token` 等)

预检流程:

```
浏览器(JS)                              服务器
   │                                      │
   │  ① OPTIONS /api/transfer             │
   │     Origin: https://app.com          │
   │     Access-Control-Request-Method:   │
   │       PUT                            │
   │     Access-Control-Request-Headers:  │
   │       Content-Type,Authorization     │
   ├─────────────────────────────────────▶│
   │                                      │
   │  ② 200 OK                            │
   │     Access-Control-Allow-Origin:     │
   │       https://app.com                │
   │     Access-Control-Allow-Methods:    │
   │       GET,POST,PUT,DELETE            │
   │     Access-Control-Allow-Headers:    │
   │       Content-Type,Authorization     │
   │     Access-Control-Max-Age: 600      │
   │◀─────────────────────────────────────┤
   │                                      │
   │  ③ PUT /api/transfer  ← 真实请求     │
   │     Origin: https://app.com          │
   │     Cookie: ...                      │
   ├─────────────────────────────────────▶│
   │                                      │
   │  ④ 200 OK                            │
   │     Access-Control-Allow-Origin:     │
   │       https://app.com                │
   │◀─────────────────────────────────────┤
```

**预检是浏览器在保护你**——它先问服务器「你欢迎来自 app.com 的 PUT 吗」,服务器同意才放行真实请求。**对于 `Content-Type: application/json` 的写接口,这一步天然挡住了纯 HTML 构造的 CSRF**——HTML 表单发不出 JSON,只能用 fetch,fetch 跨源就要预检,预检过不去就完蛋。

#### 5.3 预检的常见误配

```http
# 史诗级错配 #1:回声 Origin
Access-Control-Allow-Origin: <把请求里的 Origin 原样回写>
Access-Control-Allow-Credentials: true

# 后果:任何 origin 都能跨域读你的响应,且带 Cookie
# 等价于:整个 CORS 形同虚设
```

```http
# 错配 #2:通配符 + 凭证
Access-Control-Allow-Origin: *
Access-Control-Allow-Credentials: true

# 浏览器规范禁止这种组合,会拒绝带 Cookie 的请求
# 但 Chromium 早期版本曾接受过,业务以为生效了其实没生效
```

```http
# 错配 #3:正则匹配松
Access-Control-Allow-Origin: <匹配 .*\.bank\.com 的逻辑>
# 攻击者注册 xbank.com → 子域 evil.xbank.com → 绕过
# 必须用 endswith + . 边界,或者白名单精确匹配
```

**CORS 的工程黄金法则**:
- 白名单精确匹配 origin(map / set),不要正则
- 不要返回 `Access-Control-Allow-Origin: *` 给带 Cookie 的接口
- 默认 `Vary: Origin`,否则 CDN 会把 A 用户的允许头缓存给 B 用户

---

### 六、四种绕过:从 GET CSRF 到 DNS Rebinding

#### 6.1 GET CSRF(最古老最常用)

接口写成 GET,任何 `<img>` / `<a>` / `<link>` 都能触发。SameSite=Lax 不挡顶层 GET 导航,所以「让用户点一下钓鱼链接」就成。**修复:只接受 POST / PUT / DELETE,Web 框架默认开 method 校验**。

#### 6.2 JSON CSRF(2010 年代的故事)

接口要求 `Content-Type: application/json`,看起来天然防 CSRF——HTML 表单发不出 JSON。**但**:

```html
<form action="https://victim.com/api/transfer" method="POST"
      enctype="text/plain">
  <input name='{"to":"hacker","amount":10000,"x":"'
         value='ignored"}'>
</form>
```

利用 `enctype="text/plain"`,form 会发出形如:

```
Content-Type: text/plain

{"to":"hacker","amount":10000,"x":"=ignored"}
```

**很多框架的 JSON 解析器对 Content-Type 不严格**,看到内容像 JSON 就解析,结果 CSRF 打穿。**修复**:服务器严格校验 `Content-Type: application/json`,或者强制要求自定义 header(触发预检)。

#### 6.3 Flash 跨域(历史)

2018 年之前,Flash 的 `crossdomain.xml` 是另一条 CORS 通道,无数公司在根目录放了 `<allow-access-from domain="*"/>`,等价于全开 CORS。**Flash 死了之后这条路废了**——但要知道历史上它是真实威胁,迁移老系统时记得删掉根目录的 crossdomain.xml。

#### 6.4 DNS Rebinding(SOP 的根本缺陷)

SOP 是按「host 字符串」判同源的——**但 host 解析到哪个 IP 是 DNS 决定的**。攻击者控制 DNS,可以让浏览器在两次请求之间「同一个 host 指向不同 IP」:

```
T=0:  evil.com  →  攻击者公网 IP,返回恶意 HTML / JS
T=2s: evil.com  →  攻击者改 DNS,指向 127.0.0.1(或内网 IP)
      JS 此时再访问 evil.com/admin → 浏览器以为同源
      → 直接访问受害者内网服务,绕过 SOP 和防火墙
```

**这是 SOP 的根本设计漏洞**——SOP 信任 host 字符串,但 host 不是不可变的。**典型受害对象**:监听 127.0.0.1 的 dev 工具、家用路由器管理界面、IoT 设备、云元数据服务(169.254.169.254)。**防御**:服务端校验 `Host` 头白名单(不接受 `Host: evil.com`)、加 CORS 校验 Origin、不要在 localhost 上跑无认证的特权服务。

---

### 七、真实事故复盘

#### 7.1 GitHub OAuth CSRF(2014 前)

OAuth 授权码流程里,**回调 URL 应该带 `state` 参数**做 CSRF 防御:

```
GET /auth/callback?code=xyz&state=随机
```

`state` 是发起授权时生成的随机值,回调时校验。**如果不校验,攻击者可以**:
- 自己登录 attacker 账户,从 GitHub 拿到一个 `code`
- 诱导受害者访问 `https://victim.com/auth/callback?code=<attacker_code>`
- 受害者的会话被绑到 attacker 的 GitHub 账户上
- attacker 用自己的 GitHub 账号登录,看到受害者上传的所有数据

**修复**:OAuth state 强制校验,不通过就 403。OAuth 2.1 把 state 列为 MUST。这个坑现在还在中小厂 SSO 实现里反复出现。

#### 7.2 某银行 CSRF 转账(典型案例 / 已脱敏)

接口:`POST /transfer`,form-urlencoded,只靠 Session Cookie 鉴权,无 CSRF Token,无 Origin 校验,SameSite 默认未设。攻击者把 PoC HTML 嵌在第三方广告里,**用户点广告就被自动转账**。漏洞链全部用合规 HTML 功能,没用任何 0day。修复后:加 CSRF Token + SameSite=Lax + Origin 白名单 + 二次验证短信。**四层都加,才叫纵深防御**。

#### 7.3 LiveBeef 内网管控台事件(DNS Rebinding 经典)

2018 年研究者披露多款消费级路由器、加密货币钱包桌面客户端、Plex 媒体服务器,因 localhost 服务无认证 + 无 Host 校验,**通过 DNS rebinding 可以从任意网站被攻破**——后续这些产品都加了 Host header 白名单。

---

### 八、Cookie 三件套:HttpOnly / Secure / SameSite

讨论 CSRF 不能不讲 Cookie 安全属性,三个属性各管一件事,**全开是现代基线**。

```http
Set-Cookie: SESSIONID=abc123; Path=/; HttpOnly; Secure; SameSite=Lax
```

| 属性 | 防什么 | 不防什么 |
| --- | --- | --- |
| `HttpOnly` | JS 读不到 Cookie(防 XSS 偷会话) | 不防 CSRF(请求照发,Cookie 照带) |
| `Secure` | 只走 HTTPS,防中间人窃听 | 不防 CSRF |
| `SameSite=Lax/Strict` | 防大多数 CSRF | 不防 XSS,不防同 site 内攻击 |

**进阶**:`__Host-` 前缀(强制 Path=/ + Secure + 不允许 Domain 属性,即不允许子域写入,挡住子域 XSS 写 CSRF Token cookie 的链)。

```http
Set-Cookie: __Host-csrf=xyz; Path=/; Secure; SameSite=Strict
```

---

### 九、怎么把它写进 SDL

四道防线,每道都加,缺一不可:

```
1. Cookie 默认  SameSite=Lax + HttpOnly + Secure + __Host- 前缀
2. 写操作接口  必带 CSRF Token(框架级中间件,白名单豁免)
3. CORS 配置    严格白名单 + Vary: Origin + 不发 *+credentials
4. 高敏操作     二次验证(短信 / TOTP / 通行密钥),不依赖 Cookie 单点
```

**框架默认要全开**:Django / Rails / Spring Security 都有内置 CSRF 中间件,**关闭它是 PR 阻断项**。**API 网关层面**:对所有写操作强制校验 Origin 头,Origin 不在白名单的请求直接拒绝(WAF 层规则,比应用层快)。

**代码评审清单**:
- 看到 `csrf_exempt` / `@csrf_exempt` 装饰器:必须解释为什么
- 看到 `Access-Control-Allow-Origin: *` 配合 `Allow-Credentials: true`:必拒
- 看到接口签名是 GET 但操作有副作用:必拒
- 看到 Cookie 没设 SameSite:必拒
- 看到 CORS 配置用正则匹配 origin:必复审

---

### 十、踩坑提醒

1. **以为 CORS 防 CSRF**——方向反了,CORS 管「读响应」,CSRF 关心「请求发出」
2. **以为 SameSite=Lax 完全替代 Token**——GET 顶层导航仍然带 Cookie,子域信任面仍然存在
3. **以为 HttpOnly 防 CSRF**——HttpOnly 防的是 XSS 偷 Cookie,**CSRF 根本不需要读 Cookie**
4. **以为 JSON Content-Type 天然防 CSRF**——`enctype="text/plain"` 能绕,服务器要严格校验 Content-Type
5. **以为 Referer 校验是过时方案**——其实是廉价有效的纵深手段,但缺失时不能视为可信
6. **CORS Allow-Origin 用 `*` 配 `credentials: true`**——浏览器禁止,这种配置等于完全不生效
7. **CORS Allow-Origin 回写请求头里的 Origin**——等于全放开,经典翻车
8. **localhost 上无认证服务**——DNS rebinding 一打就穿,Electron / dev tools 重灾区
9. **以为子域是同源**——SameSite 把子域当同 site,SOP 不当同 origin,**这两套规则不一致**
10. **OAuth state 不校验**——OAuth CSRF 是身份绑定攻击,后果比转账还严重

---

下一篇:`12-注入家族.md`,讲清楚 SQL 注入为什么二十年杀不死(prepared statement 不是银弹)、NoSQL 注入怎么打 MongoDB、命令注入和 shell metacharacter 的关系、LDAP / 模板 / 表达式注入这五兄弟在「数据被当成代码解析」这件事上是同一类问题,以及为什么 SSTI(Server-Side Template Injection)是现代 SaaS 时代最危险的注入。
