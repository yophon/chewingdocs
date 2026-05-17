import{c as s,Q as n,j as e,m as p}from"./chunks/framework.CBiVa4O3.js";const g=JSON.parse('{"title":"API Key、Token 与 Secret:怎么存、怎么轮换、怎么泄露","description":"","frontmatter":{},"headers":[],"relativePath":"../cloudBasicsLearning/28-APIKeyToken与Secret.md","filePath":"../cloudBasicsLearning/28-APIKeyToken与Secret.md","lastUpdated":1779015580000}'),t={name:"../cloudBasicsLearning/28-APIKeyToken与Secret.md"};function l(i,a,c,r,o,d){return n(),e("div",null,[...a[0]||(a[0]=[p(`<h1 id="api-key、token-与-secret-怎么存、怎么轮换、怎么泄露" tabindex="-1">API Key、Token 与 Secret:怎么存、怎么轮换、怎么泄露 <a class="header-anchor" href="#api-key、token-与-secret-怎么存、怎么轮换、怎么泄露" aria-label="Permalink to &quot;API Key、Token 与 Secret:怎么存、怎么轮换、怎么泄露&quot;">​</a></h1><h2 id="一句话解释" tabindex="-1">一句话解释 <a class="header-anchor" href="#一句话解释" aria-label="Permalink to &quot;一句话解释&quot;">​</a></h2><p><strong>API Key、Token 和 Secret 都是系统之间证明身份或授权访问的凭据,它们的共同风险是:一旦泄露,别人可能绕过登录流程直接调用你的服务或云资源</strong>。</p><p>这几个词经常混用。API Key 通常是调用某个 API 的固定凭据,Token 常常带有登录状态、权限范围或过期时间,Secret 更泛化,可以是数据库密码、Webhook 签名密钥、JWT 签名密钥、云访问密钥、支付平台密钥。</p><p>对小团队来说,不要纠结名字,先记住一句话:凡是拿到后能访问资源、伪造身份、解密数据、签发请求的字符串,都应该当成 Secret 处理。它不能进 Git,不能打印到日志,不能写进前端代码,不能随便发到聊天软件。</p><h2 id="放在系统哪里" tabindex="-1">放在系统哪里 <a class="header-anchor" href="#放在系统哪里" aria-label="Permalink to &quot;放在系统哪里&quot;">​</a></h2><p>Secret 分布在系统很多位置:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>前端构建</span></span>
<span class="line"><span>  -&gt; 公开环境变量、埋点 Key、地图 Key</span></span>
<span class="line"><span></span></span>
<span class="line"><span>后端服务</span></span>
<span class="line"><span>  -&gt; 数据库密码、第三方 API Key、JWT Secret、Webhook Secret</span></span>
<span class="line"><span></span></span>
<span class="line"><span>CI/CD</span></span>
<span class="line"><span>  -&gt; 部署 Token、云访问密钥、包管理发布 Token</span></span>
<span class="line"><span></span></span>
<span class="line"><span>云资源</span></span>
<span class="line"><span>  -&gt; 对象存储密钥、消息队列凭证、服务账号密钥</span></span>
<span class="line"><span></span></span>
<span class="line"><span>团队协作</span></span>
<span class="line"><span>  -&gt; 密码库、运维文档、聊天记录、工单、截图</span></span></code></pre></div><p>最关键的边界是前端和后端。任何打包进浏览器、App 客户端、小程序的 Secret,都应该默认会被用户拿到。前端可以放公开标识符,例如某些 publishable key、client id、项目 id,但不能放能操作后台资源的私密密钥。</p><p>一个常见事故是:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>开发者把云存储 Secret 写进 .env</span></span>
<span class="line"><span>  -&gt; 本地测试正常</span></span>
<span class="line"><span>  -&gt; 不小心把 .env 提交到 GitHub</span></span>
<span class="line"><span>  -&gt; 搜索机器人几分钟内发现密钥</span></span>
<span class="line"><span>  -&gt; 攻击者用密钥上传垃圾文件或下载私有数据</span></span>
<span class="line"><span>  -&gt; 团队以为删除 commit 就安全了</span></span></code></pre></div><p>删除代码不等于密钥安全。只要 Secret 曾经暴露在 Git 历史、CI 日志、错误页面、前端包、截图、聊天记录里,都要视为已经泄露,必须轮换。</p><h2 id="常见套餐和使用限制" tabindex="-1">常见套餐和使用限制 <a class="header-anchor" href="#常见套餐和使用限制" aria-label="Permalink to &quot;常见套餐和使用限制&quot;">​</a></h2><p>不同平台对 Secret 管理的支持差异很大:</p><ul><li>免费计划通常提供基础环境变量,但不一定有版本管理和访问审计.</li><li>Secret 数量、大小、环境数量可能有限制.</li><li>团队成员谁能查看 Secret,谁只能使用 Secret,权限不一定能细分.</li><li>Secret 轮换通常需要你自己设计,平台只负责保存.</li><li>专业的 Secret Manager、KMS、自动轮换、访问审计可能额外收费.</li><li>CI/CD 的 Secret 可能会被注入到构建日志,需要额外脱敏和权限限制.</li></ul><p>还有一种限制是&quot;环境边界&quot;。开发、测试、生产如果共用同一组密钥,测试环境泄露就等于生产泄露。很多小团队为了省事,所有环境共用一个数据库密码、一个对象存储 Key、一个支付测试账号。短期方便,长期会让事故定位和轮换都很痛苦。</p><p>Secret 的成本不只在保存,还在轮换。一个密钥被写进 5 个服务、3 个定时任务、2 个 CI 流程和一份旧文档里,轮换时很容易漏掉某个地方。漏掉的结果可能是线上故障,所以很多团队明知密钥长期不换也不敢动。</p><h2 id="小团队建议" tabindex="-1">小团队建议 <a class="header-anchor" href="#小团队建议" aria-label="Permalink to &quot;小团队建议&quot;">​</a></h2><p>先建立几条硬规则:</p><ul><li>Secret 不进 Git,包括私有仓库.</li><li>Secret 不放前端代码,不放浏览器可见的环境变量.</li><li>Secret 不打印到日志,错误上报和调试输出要脱敏.</li><li>Secret 不通过截图、聊天记录、普通文档长期保存.</li><li>泄露后不讨论&quot;有没有人看到&quot;,直接轮换.</li></ul><p>存储方式可以从简单到专业:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>个人实验</span></span>
<span class="line"><span>  -&gt; 本地 .env + .gitignore + 密码管理器</span></span>
<span class="line"><span></span></span>
<span class="line"><span>小团队项目</span></span>
<span class="line"><span>  -&gt; 部署平台环境变量 + 团队密码库 + 分环境 Secret</span></span>
<span class="line"><span></span></span>
<span class="line"><span>生产系统</span></span>
<span class="line"><span>  -&gt; Secret Manager / KMS + IAM 控制 + 审计日志 + 轮换流程</span></span></code></pre></div><p>轮换要提前设计。最实用的方式是支持新旧密钥短时间并存:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 创建新 Secret</span></span>
<span class="line"><span>2. 部署应用同时支持新旧 Secret</span></span>
<span class="line"><span>3. 把调用方切到新 Secret</span></span>
<span class="line"><span>4. 观察日志和错误率</span></span>
<span class="line"><span>5. 禁用旧 Secret</span></span>
<span class="line"><span>6. 删除旧 Secret 并记录轮换时间</span></span></code></pre></div><p>对于签名类 Secret,例如 JWT Secret、Webhook Secret,尤其要注意兼容窗口。直接替换可能导致所有用户登录态失效,或第三方回调验证失败。对云访问密钥,要优先使用临时凭证、角色或工作负载身份,减少长期 Secret 的数量。</p><p>还要给仓库和 CI 加上泄露防线。启用 secret scanning,在 pre-commit 或 CI 中检测常见密钥格式。检测不是万能的,但能挡住很多低级事故。任何进入日志和报错系统的配置值,默认都要经过脱敏。</p><h2 id="一句话总结" tabindex="-1">一句话总结 <a class="header-anchor" href="#一句话总结" aria-label="Permalink to &quot;一句话总结&quot;">​</a></h2><p><strong>Secret 的安全不靠藏得深,而靠不进前端、不进 Git、不进日志、权限够小、能快速轮换;只要泄露过一次,正确动作就是立即撤销并换新</strong>。</p>`,28)])])}const u=s(t,[["render",l]]);export{g as __pageData,u as default};
