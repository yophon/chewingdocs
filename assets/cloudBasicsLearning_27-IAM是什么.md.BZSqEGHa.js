import{_ as s,H as n,f as p,i as e}from"./chunks/framework.BHvCMIhP.js";const h=JSON.parse('{"title":"IAM 是什么:用户、角色、策略、临时凭证","description":"","frontmatter":{},"headers":[],"relativePath":"cloudBasicsLearning/27-IAM是什么.md","filePath":"cloudBasicsLearning/27-IAM是什么.md","lastUpdated":1779015580000}'),l={name:"cloudBasicsLearning/27-IAM是什么.md"};function t(i,a,o,c,r,d){return n(),p("div",null,[...a[0]||(a[0]=[e(`<h1 id="iam-是什么-用户、角色、策略、临时凭证" tabindex="-1">IAM 是什么:用户、角色、策略、临时凭证 <a class="header-anchor" href="#iam-是什么-用户、角色、策略、临时凭证" aria-label="Permalink to &quot;IAM 是什么:用户、角色、策略、临时凭证&quot;">​</a></h1><h2 id="一句话解释" tabindex="-1">一句话解释 <a class="header-anchor" href="#一句话解释" aria-label="Permalink to &quot;一句话解释&quot;">​</a></h2><p><strong>IAM 是云平台用来管理&quot;谁可以对哪些资源做什么操作&quot;的权限系统,核心概念通常是用户、角色、策略和临时凭证</strong>。</p><p>IAM 最容易被误解成&quot;创建子账号的地方&quot;。子账号只是 IAM 的一部分。真正重要的是权限表达能力:某个身份能不能读这个存储桶,能不能写这张数据库表,能不能删除服务器,能不能创建新的密钥。</p><p>如果账号安全解决的是&quot;谁能进门&quot;,IAM 解决的是&quot;进门之后能碰什么&quot;。没有 IAM,团队只能在&quot;全给管理员&quot;和&quot;完全不给&quot;之间摇摆。对云部署来说,这会让人和程序都拿到过大的权限。</p><h2 id="放在系统哪里" tabindex="-1">放在系统哪里 <a class="header-anchor" href="#放在系统哪里" aria-label="Permalink to &quot;放在系统哪里&quot;">​</a></h2><p>IAM 位于管理面和资源面之间:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>人 / 程序 / CI/CD / 云服务</span></span>
<span class="line"><span>  -&gt; 使用某个身份登录或调用 API</span></span>
<span class="line"><span>  -&gt; IAM 判断身份和策略</span></span>
<span class="line"><span>  -&gt; 允许或拒绝访问服务器、数据库、对象存储、队列、日志</span></span></code></pre></div><p>IAM 不只管人,也管程序。一个后端服务访问对象存储,一个 GitHub Actions 部署到云平台,一个 Serverless 函数读数据库,都需要身份。区别在于,人适合使用账号登录,程序更适合使用角色、服务账号或临时凭证。</p><p>几个概念可以这样理解:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>用户 User</span></span>
<span class="line"><span>  -&gt; 通常代表一个人或一个固定身份</span></span>
<span class="line"><span></span></span>
<span class="line"><span>角色 Role</span></span>
<span class="line"><span>  -&gt; 一组可被承担的权限,常用于服务、临时授权、跨账号访问</span></span>
<span class="line"><span></span></span>
<span class="line"><span>策略 Policy</span></span>
<span class="line"><span>  -&gt; 具体规则:允许或拒绝哪些动作、哪些资源、哪些条件</span></span>
<span class="line"><span></span></span>
<span class="line"><span>临时凭证 Temporary Credentials</span></span>
<span class="line"><span>  -&gt; 有过期时间的访问凭证,泄露后的有效窗口更短</span></span></code></pre></div><p>临时凭证是现代云权限里非常关键的一层。长期 Access Key 一旦泄露,只要没被发现和轮换,攻击者就能一直使用。临时凭证即使泄露,也会在较短时间后失效,更适合给 CI/CD、容器、函数计算、跨服务调用使用。</p><h2 id="常见套餐和使用限制" tabindex="-1">常见套餐和使用限制 <a class="header-anchor" href="#常见套餐和使用限制" aria-label="Permalink to &quot;常见套餐和使用限制&quot;">​</a></h2><p>大多数主流云平台都会提供基础 IAM,但免费或低价套餐常见限制包括:</p><ul><li>可创建的用户、角色、项目或组织数量有限.</li><li>细粒度策略能力不足,只能选择 Owner、Admin、Viewer 这类粗角色.</li><li>条件策略较弱,不能按 IP、MFA 状态、时间、标签等限制访问.</li><li>审计日志保留时间短,很难追踪权限变更历史.</li><li>临时凭证、工作负载身份联合、跨账号角色可能属于高级能力.</li><li>SSO 和目录同步通常在团队版或企业版里.</li></ul><p>对小团队来说,最危险的不是 IAM 功能不够复杂,而是权限模型太粗。比如一个部署 Token 同时拥有读取所有项目、修改环境变量、删除数据库、创建账单资源的能力。这样部署确实省事,但任何 CI 日志泄露、依赖包后门、开发机被盗,都会变成全平台风险。</p><p>还有一个常见坑是&quot;只加权限,不清权限&quot;。项目初期为了赶进度,某个账号临时拿了管理员权限;半年后没人记得,它还在。外包结束、员工离职、测试环境下线,对应的用户、角色和密钥也常常没有删除。</p><h2 id="小团队建议" tabindex="-1">小团队建议 <a class="header-anchor" href="#小团队建议" aria-label="Permalink to &quot;小团队建议&quot;">​</a></h2><p>小团队可以先建立简单但清晰的 IAM 规则:</p><ul><li>人用个人账号登录,不要用共享账号.</li><li>程序使用服务账号、角色或工作负载身份,不要使用个人账号的长期密钥.</li><li>CI/CD 优先使用临时凭证或 OIDC 联合登录云平台,避免在仓库里保存长期 Access Key.</li><li>按环境分权限:开发、测试、生产分开,生产权限更少、更严格.</li><li>按资源分权限:只需要读对象存储,就不要给删除数据库的权限.</li></ul><p>一个实用的权限分层可以是:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Owner</span></span>
<span class="line"><span>  -&gt; 极少数人,负责账单、组织、安全恢复</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Admin</span></span>
<span class="line"><span>  -&gt; 管理项目资源,但不一定能改账单和关闭安全设置</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Developer</span></span>
<span class="line"><span>  -&gt; 部署、看日志、管理非生产资源</span></span>
<span class="line"><span></span></span>
<span class="line"><span>ReadOnly</span></span>
<span class="line"><span>  -&gt; 查看监控、日志、账单,不能修改资源</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Runtime Role</span></span>
<span class="line"><span>  -&gt; 应用运行时身份,只访问运行所需资源</span></span></code></pre></div><p>策略要从&quot;够用&quot;开始,不要从&quot;完美&quot;开始。第一步先去掉明显过大的权限:不要让前端部署密钥能删数据库,不要让日志查看账号能改 DNS,不要让应用运行身份能管理 IAM。第二步再逐渐按项目、环境、资源收细。</p><p>定期检查也很重要。每个月或每个版本发布前,快速过一遍:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>哪些用户还在团队里?</span></span>
<span class="line"><span>哪些密钥超过 90 天没轮换?</span></span>
<span class="line"><span>哪些角色长期没有被使用?</span></span>
<span class="line"><span>哪些策略包含 * 或 Administrator?</span></span>
<span class="line"><span>生产环境有没有不必要的写权限?</span></span></code></pre></div><p>IAM 的目标不是制造流程阻力,而是让错误和泄露有边界。权限给得越大,事故发生时你能做的就越少。</p><h2 id="一句话总结" tabindex="-1">一句话总结 <a class="header-anchor" href="#一句话总结" aria-label="Permalink to &quot;一句话总结&quot;">​</a></h2><p><strong>IAM 是云资源的权限边界:人用个人账号,程序用角色或临时凭证,策略按最小权限写;不要让一个泄露的密钥或一个误操作拥有摧毁全系统的能力</strong>。</p>`,28)])])}const g=s(l,[["render",t]]);export{h as __pageData,g as default};
