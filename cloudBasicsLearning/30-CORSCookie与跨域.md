# CORS,Cookie 与跨域:前后端联调最常见的安全边界

## 一句话解释

**CORS 是浏览器决定一个网页能不能读取另一个域名接口响应的规则;Cookie 是浏览器随请求自动携带的身份状态;跨域是前端页面和后端接口不在同一个 Origin 下访问时遇到的边界**.

这三个词经常一起出现,因为独立开发最常见的部署方式就是:

```text
前端: https://app.example.com
后端: https://api.example.com
登录 Cookie: 发给 api.example.com 或 example.com
```

本地开发时更明显:

```text
前端: http://localhost:3000
后端: http://localhost:8080
```

端口不同也算不同 Origin.浏览器会问:这个页面有没有资格读取那个接口的响应?这就是 CORS 常见报错的来源.

最容易误解的是:**CORS 不是安全万能开关**.它主要约束浏览器里的前端代码能不能读取跨域响应,不是后端接口的权限系统.攻击者可以不用浏览器,直接用 curl,脚本,Postman 调你的 API.你把 CORS 配得再严格,也不能替代登录校验,权限校验,CSRF 防护和服务端参数检查.

另一个常见误解是:**允许跨域不等于允许带 Cookie**.如果前端要跨域携带 Cookie,服务端,浏览器 Cookie 属性,前端请求参数都要同时配对,任何一处不对都会出现"登录成功但下一次请求还是未登录".

## 放在系统哪里

CORS 发生在浏览器和服务端之间,更准确地说,是浏览器在保护当前网页上下文:

```text
浏览器中的前端代码
  -> 发起 fetch / XMLHttpRequest
  -> 浏览器检查是否跨域
  -> 必要时先发 OPTIONS 预检请求
  -> CDN / 网关 / 反向代理
  -> 后端 API
  -> 浏览器根据 CORS 响应头决定前端能不能读取结果
```

注意关键点:请求可能已经到了服务端,只是浏览器不把响应交给前端代码.很多人看到控制台报 CORS 错误,以为"接口没有被调用",其实服务端日志里可能已经有请求了.

一次典型跨域登录链路是:

```text
用户打开 https://app.example.com
  -> 前端调用 https://api.example.com/login
  -> 后端校验账号密码
  -> 后端通过 Set-Cookie 写入 session
  -> 浏览器保存 Cookie
  -> 前端继续调用 https://api.example.com/me
  -> 浏览器决定是否携带 Cookie
  -> 后端根据 Cookie 识别用户
```

这里至少涉及四类配置:

- API 响应头里的 `Access-Control-Allow-Origin`.
- API 响应头里的 `Access-Control-Allow-Credentials`.
- 前端请求里的 `credentials: "include"` 或同类选项.
- Cookie 本身的 `Domain`,`Path`,`SameSite`,`Secure`,`HttpOnly`.

如果接口只是公开读数据,例如读取文章列表,通常不需要 Cookie,也不需要 `credentials`.如果接口涉及登录状态,用户资料,订单,后台操作,跨域 Cookie 就必须非常谨慎.

## 常见套餐和使用限制

CORS 本身通常不是单独收费产品,它常出现在这些地方:

- 对象存储的跨域规则.
- CDN 的响应头改写规则.
- API Gateway 的 CORS 配置.
- Serverless 函数或后端框架的中间件.
- 反向代理的 Header 配置.

免费套餐常见限制不一定写着"CORS 限制",而是藏在相邻能力里:

- 响应头改写规则数量有限.
- API Gateway 路由数量有限.
- Serverless 对 OPTIONS 预检也计入请求数.
- CDN 缓存了错误的 CORS Header,导致修复后仍然报错.
- 日志保留太短,排查不到预检请求和真实请求的差异.
- 自定义域名,HTTPS,Cookie `Secure` 需要更高套餐或额外配置.

一个小团队常见坑:

```text
前端部署到 https://app.example.com
后端部署到 https://api.example.com
开发时为了省事:
  Access-Control-Allow-Origin: *
  Access-Control-Allow-Credentials: true

结果浏览器直接拒绝:
  因为带 credentials 时不能使用通配符 *
```

另一个坑是把 `SameSite=None` 写上了,但没有 `Secure`.现代浏览器通常要求跨站 Cookie 使用 `SameSite=None; Secure`,也就是必须走 HTTPS.本地 HTTP 调试,预览环境和正式环境经常因此表现不一致.

还有一个安全坑是动态反射 Origin:

```text
请求 Origin 是什么,服务端就原样回什么
```

如果没有白名单校验,这等于把任何站点都放进允许列表.对于带 Cookie 的接口,这会明显扩大风险.

## 小团队建议

先把域名设计想清楚.最省心的方式是让前端和 API 处在同一个站点体系下:

```text
https://example.com        官网
https://app.example.com    应用前端
https://api.example.com    API
```

如果可以,用同站点子域名,不要一会儿 `vercel.app`,一会儿 `workers.dev`,一会儿自定义域名.临时域名适合预览,不适合长期承载登录 Cookie.

最低限度建议:

- CORS 允许列表写具体 Origin,不要对带登录状态的接口使用 `*`.
- 不要把 CORS 当权限控制,服务端每个敏感接口都要校验用户身份和资源归属.
- 登录 Cookie 尽量设置 `HttpOnly` 和 `Secure`,减少被前端脚本读取和明文传输的风险.
- 明确 `SameSite` 策略.普通后台可以优先考虑 `Lax`;必须跨站嵌入或第三方回调时再评估 `None`.
- 把本地,预览,正式环境分开配置,不要把本地调试用的宽松规则带到生产.
- 记录 CORS 相关请求日志,尤其是 OPTIONS,Origin,状态码和被拒原因.

什么时候需要更认真设计?

- 你有浏览器登录态,并且前后端分域部署.
- 你要给第三方网站提供 API.
- 你有管理后台,支付,用户数据,上传接口.
- 你要把产品嵌入别人的网站,例如 iframe,小组件,插件.
- 你发现团队经常靠"先把 CORS 放开"来解决联调问题.

排查 CORS 时不要只看浏览器控制台.正确顺序是:

```text
确认前端 Origin
  -> 确认是否需要 Cookie
  -> 看 OPTIONS 预检是否成功
  -> 看真实请求是否成功
  -> 看响应头是否匹配
  -> 看 Cookie 是否被浏览器保存和携带
  -> 最后再看业务权限
```

这能避免把登录失败,Cookie 丢失,权限 403,网关 502 全部误判成 CORS.

## 一句话总结

**CORS 是浏览器跨域读取响应的边界,Cookie 是登录状态的自动携带机制;它们能减少前端跨域风险,但不能替代后端鉴权,权限校验和真实的业务安全设计**.
