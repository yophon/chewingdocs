import{c as s,Q as n,j as p,m as e}from"./chunks/framework.Bhbi9jCp.js";const d=JSON.parse('{"title":"OAuth、OIDC 与 SSO:登录不是自己存密码这么简单","description":"","frontmatter":{},"headers":[],"relativePath":"cloudBasicsLearning/29-OAuthOIDC与SSO.md","filePath":"cloudBasicsLearning/29-OAuthOIDC与SSO.md","lastUpdated":1779015580000}'),t={name:"cloudBasicsLearning/29-OAuthOIDC与SSO.md"};function i(l,a,o,c,u,h){return n(),p("div",null,[...a[0]||(a[0]=[e(`<h1 id="oauth、oidc-与-sso-登录不是自己存密码这么简单" tabindex="-1">OAuth、OIDC 与 SSO:登录不是自己存密码这么简单 <a class="header-anchor" href="#oauth、oidc-与-sso-登录不是自己存密码这么简单" aria-label="Permalink to &quot;OAuth、OIDC 与 SSO:登录不是自己存密码这么简单&quot;">​</a></h1><h2 id="一句话解释" tabindex="-1">一句话解释 <a class="header-anchor" href="#一句话解释" aria-label="Permalink to &quot;一句话解释&quot;">​</a></h2><p><strong>OAuth 主要解决授权访问,OIDC 在 OAuth 之上解决登录身份,SSO 解决一次登录访问多个系统;它们的边界是:不要把&quot;能调 API&quot;误当成&quot;已经可信登录&quot;</strong>。</p><p>很多人第一次接触 OAuth,是在网站上做&quot;使用 Google / GitHub 登录&quot;。于是很容易以为 OAuth 就是第三方登录协议。更准确地说,OAuth 2.0 关注的是授权:用户允许某个应用访问某些资源。OIDC 才是在 OAuth 2.0 基础上增加身份层,让应用能可靠知道&quot;这个用户是谁&quot;。</p><p>SSO 则是另一层概念。它不是某一个具体协议,而是一种登录体验和组织能力:用户在身份提供方登录一次,就能访问多个内部系统。SSO 背后可以用 OIDC,也可以用 SAML。对小团队来说,重点不是背协议细节,而是知道登录、授权、组织身份管理不是同一件事。</p><h2 id="放在系统哪里" tabindex="-1">放在系统哪里 <a class="header-anchor" href="#放在系统哪里" aria-label="Permalink to &quot;放在系统哪里&quot;">​</a></h2><p>登录协议位于用户身份链路里:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>用户</span></span>
<span class="line"><span>  -&gt; 点击登录</span></span>
<span class="line"><span>  -&gt; 跳转到身份提供方 Google / GitHub / 企业 IdP</span></span>
<span class="line"><span>  -&gt; 用户完成认证和授权</span></span>
<span class="line"><span>  -&gt; 应用收到回调</span></span>
<span class="line"><span>  -&gt; 应用换取 Token / 验证 ID Token</span></span>
<span class="line"><span>  -&gt; 建立自己的会话</span></span></code></pre></div><p>这里有几个边界必须分清:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>认证 Authentication</span></span>
<span class="line"><span>  -&gt; 证明用户是谁</span></span>
<span class="line"><span></span></span>
<span class="line"><span>授权 Authorization</span></span>
<span class="line"><span>  -&gt; 用户或系统允许你访问什么</span></span>
<span class="line"><span></span></span>
<span class="line"><span>会话 Session</span></span>
<span class="line"><span>  -&gt; 你的应用记住这个用户已登录</span></span>
<span class="line"><span></span></span>
<span class="line"><span>权限 Permission</span></span>
<span class="line"><span>  -&gt; 用户在你的应用里能做什么</span></span></code></pre></div><p>第三方登录只能帮你确认外部身份,不能自动决定应用内权限。一个人能用 GitHub 登录,不代表他就是你的管理员。一个人属于某个 Google Workspace,也不代表他能看你的生产账单。外部身份要映射到你自己的用户、团队、角色和权限。</p><p>常见流程是:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>用户用 GitHub 登录</span></span>
<span class="line"><span>  -&gt; 应用验证 OIDC ID Token</span></span>
<span class="line"><span>  -&gt; 根据 provider + subject 找到本地用户</span></span>
<span class="line"><span>  -&gt; 创建应用自己的 session cookie</span></span>
<span class="line"><span>  -&gt; 按本地角色判断是否能访问后台</span></span></code></pre></div><p>如果只把 access token 存起来,然后认为用户已经安全登录,就容易混淆 OAuth 和 OIDC 的边界。</p><h2 id="常见套餐和使用限制" tabindex="-1">常见套餐和使用限制 <a class="header-anchor" href="#常见套餐和使用限制" aria-label="Permalink to &quot;常见套餐和使用限制&quot;">​</a></h2><p>第三方登录和 SSO 的套餐差异很明显:</p><ul><li>基础 OAuth / OIDC 登录通常可以免费接入,但需要自己正确实现流程.</li><li>托管 Auth 平台可能按月活用户、短信、MFA、组织数、社交登录提供商数量计费.</li><li>企业 SSO、SAML、目录同步、SCIM、强制 MFA 常常在高级套餐.</li><li>自定义域名登录页、审计日志、风险登录检测可能额外收费.</li><li>免费计划可能限制回调地址数量、租户数量、团队成员数量或日志保留时间.</li></ul><p>这些限制会直接影响产品设计。个人工具用 GitHub 登录很简单;面向企业客户的 SaaS,客户可能要求 SAML SSO、员工离职自动禁用、强制 MFA、审计记录。这时&quot;自己存一张 users 表 + 密码哈希&quot;远远不够。</p><p>不要低估短信登录和邮件验证码的成本。短信有费用和风控问题,邮件有送达率和被钓鱼风险。托管 Auth 看起来贵,但它通常帮你处理了密码重置、MFA、社交登录、会话安全、风控和合规日志的一部分复杂度。</p><h2 id="小团队建议" tabindex="-1">小团队建议 <a class="header-anchor" href="#小团队建议" aria-label="Permalink to &quot;小团队建议&quot;">​</a></h2><p>如果只是独立项目或早期 SaaS,优先选择成熟登录方案,不要从零手写密码系统。自己存密码不是绝对不能做,但你要同时处理哈希算法、密码重置、撞库防护、MFA、会话失效、邮件验证、审计日志和安全通知。大多数小团队不值得把早期精力花在这里。</p><p>接入 OAuth / OIDC 时,至少守住这些规则:</p><ul><li>使用 Authorization Code Flow,公开客户端配合 PKCE.</li><li>不要在前端长期保存 access token,尤其不要放 localStorage 里当万能登录态.</li><li>后端必须验证 ID Token 的签名、issuer、audience、过期时间和 nonce.</li><li>access token 用来访问资源,ID Token 用来表达身份,不要混用.</li><li>登录成功后建立你自己应用的会话,并按本地权限系统授权.</li><li>管理后台、账单、删除数据等高风险操作,最好要求 MFA 或重新认证.</li></ul><p>SSO 要等到真的有组织客户需求再复杂化。早期可以先支持少数社交登录或邮箱登录,但数据模型要给未来留位置:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>User</span></span>
<span class="line"><span>  -&gt; 应用内用户</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Identity</span></span>
<span class="line"><span>  -&gt; provider + provider_user_id,例如 github:12345</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Organization</span></span>
<span class="line"><span>  -&gt; 团队或客户公司</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Membership</span></span>
<span class="line"><span>  -&gt; 用户在组织里的角色</span></span></code></pre></div><p>这样以后从 GitHub 登录扩展到 Google、OIDC、SAML SSO 时,不需要把用户表推倒重来。</p><p>还要理解退出登录的边界。用户从你的应用退出,不一定等于从 Google 或企业 IdP 退出;用户在 IdP 被禁用,你的应用会话也不一定马上失效。企业场景里,这就是为什么需要短会话、刷新策略、目录同步、SCIM 或定期校验。</p><h2 id="一句话总结" tabindex="-1">一句话总结 <a class="header-anchor" href="#一句话总结" aria-label="Permalink to &quot;一句话总结&quot;">​</a></h2><p><strong>OAuth 管授权,OIDC 管登录身份,SSO 管跨系统登录体验;小团队可以用托管方案起步,但必须分清外部身份、应用会话和本地权限,不要把一个 Token 当成全部安全边界</strong>。</p>`,29)])])}const g=s(t,[["render",i]]);export{d as __pageData,g as default};
