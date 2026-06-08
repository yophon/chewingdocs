import{c as s,Q as n,j as p,m as e}from"./chunks/framework.Bhbi9jCp.js";const b=JSON.parse('{"title":"WebView、Hybrid、H5 离线包与热更新边界","description":"","frontmatter":{},"headers":[],"relativePath":"mobileCommonLearning/17-WebView-Hybrid-H5离线包与热更新边界.md","filePath":"mobileCommonLearning/17-WebView-Hybrid-H5离线包与热更新边界.md","lastUpdated":1780912084000}'),t={name:"mobileCommonLearning/17-WebView-Hybrid-H5离线包与热更新边界.md"};function i(l,a,d,c,o,h){return n(),p("div",null,[...a[0]||(a[0]=[e(`<h1 id="webview、hybrid、h5-离线包与热更新边界" tabindex="-1">WebView、Hybrid、H5 离线包与热更新边界 <a class="header-anchor" href="#webview、hybrid、h5-离线包与热更新边界" aria-label="Permalink to &quot;WebView、Hybrid、H5 离线包与热更新边界&quot;">​</a></h1><p>WebView 能让 App 快速承载 H5 页面,也会把前端、安全、缓存、审核、原生能力混在一起。</p><p>一句话:<strong>Hybrid 可以提高交付效率,但不能绕过平台规则,更不能把热更新当成无限制发版。</strong></p><hr><h2 id="一、先区分几种形态" tabindex="-1">一、先区分几种形态 <a class="header-anchor" href="#一、先区分几种形态" aria-label="Permalink to &quot;一、先区分几种形态&quot;">​</a></h2><table tabindex="0"><thead><tr><th>形态</th><th>说明</th></tr></thead><tbody><tr><td>WebView 页面</td><td>App 内嵌网页</td></tr><tr><td>Hybrid 页面</td><td>H5 通过 JSBridge 调用原生能力</td></tr><tr><td>H5 离线包</td><td>把 H5 资源预置或下载到本地</td></tr><tr><td>RN / Flutter 热更新</td><td>更新跨端代码或资源</td></tr><tr><td>原生发版</td><td>通过商店更新二进制</td></tr></tbody></table><p>它们的边界不同:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>WebView 更新网页最快</span></span>
<span class="line"><span>离线包更新资源和页面逻辑</span></span>
<span class="line"><span>热更新更新部分跨端逻辑</span></span>
<span class="line"><span>原生发版更新平台能力和二进制代码</span></span></code></pre></div><p>不要把所有&quot;不用发版&quot;都叫热更新。</p><hr><h2 id="二、webview-适合什么" tabindex="-1">二、WebView 适合什么 <a class="header-anchor" href="#二、webview-适合什么" aria-label="Permalink to &quot;二、WebView 适合什么&quot;">​</a></h2><p>适合:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>活动页</span></span>
<span class="line"><span>内容页</span></span>
<span class="line"><span>协议页</span></span>
<span class="line"><span>帮助中心</span></span>
<span class="line"><span>运营配置页面</span></span>
<span class="line"><span>低频业务流程</span></span>
<span class="line"><span>需要快速调整的展示逻辑</span></span></code></pre></div><p>不适合:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>高性能交互</span></span>
<span class="line"><span>复杂手势动画</span></span>
<span class="line"><span>强依赖系统能力的页面</span></span>
<span class="line"><span>关键支付链路的全部逻辑</span></span>
<span class="line"><span>需要离线强一致的核心流程</span></span></code></pre></div><p>WebView 是工程工具,不是性能和体验的万能替代。</p><hr><h2 id="三、jsbridge-要当成安全边界设计" tabindex="-1">三、JSBridge 要当成安全边界设计 <a class="header-anchor" href="#三、jsbridge-要当成安全边界设计" aria-label="Permalink to &quot;三、JSBridge 要当成安全边界设计&quot;">​</a></h2><p>JSBridge 本质是:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>网页调用 App 能力的接口</span></span></code></pre></div><p>因此必须控制:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>哪些域名可以调用</span></span>
<span class="line"><span>哪些方法可以调用</span></span>
<span class="line"><span>参数怎么校验</span></span>
<span class="line"><span>结果怎么返回</span></span>
<span class="line"><span>是否需要用户确认</span></span>
<span class="line"><span>是否记录审计日志</span></span></code></pre></div><p>不要这样做:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>任意 URL 都能调用 bridge</span></span>
<span class="line"><span>bridge 暴露 openUrl、writeFile、getToken 等高危能力</span></span>
<span class="line"><span>参数直接拼接执行</span></span>
<span class="line"><span>H5 可以拿到完整登录凭据</span></span></code></pre></div><p>Bridge API 要像服务端接口一样设计权限。</p><hr><h2 id="四、webview-登录态怎么处理" tabindex="-1">四、WebView 登录态怎么处理 <a class="header-anchor" href="#四、webview-登录态怎么处理" aria-label="Permalink to &quot;四、WebView 登录态怎么处理&quot;">​</a></h2><p>常见方案:</p><table tabindex="0"><thead><tr><th>方案</th><th>风险</th></tr></thead><tbody><tr><td>Cookie 同步</td><td>平台差异、清理复杂</td></tr><tr><td>URL 带 token</td><td>容易泄漏到日志和历史记录</td></tr><tr><td>JS 注入 token</td><td>XSS 风险高</td></tr><tr><td>Bridge 获取短期票据</td><td>相对可控</td></tr></tbody></table><p>推荐思路:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>H5 不直接持有长期 refresh token</span></span>
<span class="line"><span>App 通过 bridge 发放短期一次性票据</span></span>
<span class="line"><span>H5 用票据换业务会话</span></span>
<span class="line"><span>退出登录时同时清 App token、Cookie、WebView storage</span></span></code></pre></div><p>登录态要统一退出,不能 App 退出了 WebView 还在线。</p><hr><h2 id="五、离线包解决什么问题" tabindex="-1">五、离线包解决什么问题 <a class="header-anchor" href="#五、离线包解决什么问题" aria-label="Permalink to &quot;五、离线包解决什么问题&quot;">​</a></h2><p>离线包常用于:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>加快首屏</span></span>
<span class="line"><span>弱网可用</span></span>
<span class="line"><span>降低服务器静态资源压力</span></span>
<span class="line"><span>减少线上紧急改动成本</span></span></code></pre></div><p>基本结构:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>manifest.json</span></span>
<span class="line"><span>资源文件</span></span>
<span class="line"><span>版本号</span></span>
<span class="line"><span>hash / 签名</span></span>
<span class="line"><span>灰度规则</span></span>
<span class="line"><span>回滚规则</span></span></code></pre></div><p>离线包不是简单 zip 下载。它是一套小型发布系统。</p><hr><h2 id="六、离线包必须有校验" tabindex="-1">六、离线包必须有校验 <a class="header-anchor" href="#六、离线包必须有校验" aria-label="Permalink to &quot;六、离线包必须有校验&quot;">​</a></h2><p>至少要校验:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>来源</span></span>
<span class="line"><span>完整性</span></span>
<span class="line"><span>版本</span></span>
<span class="line"><span>hash</span></span>
<span class="line"><span>签名</span></span>
<span class="line"><span>兼容的 App 版本</span></span></code></pre></div><p>更新流程:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>请求 manifest</span></span>
<span class="line"><span>检查 App 版本和渠道</span></span>
<span class="line"><span>下载资源包</span></span>
<span class="line"><span>校验 hash / 签名</span></span>
<span class="line"><span>解压到临时目录</span></span>
<span class="line"><span>切换指针</span></span>
<span class="line"><span>保留上一版本可回滚</span></span></code></pre></div><p>不要下载后直接覆盖当前线上资源。</p><hr><h2 id="七、热更新边界" tabindex="-1">七、热更新边界 <a class="header-anchor" href="#七、热更新边界" aria-label="Permalink to &quot;七、热更新边界&quot;">​</a></h2><p>热更新不能用来绕过审核规则。</p><p>原则:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>不能改变 App 核心用途</span></span>
<span class="line"><span>不能下发未经审核的高风险能力</span></span>
<span class="line"><span>不能动态开启隐藏功能规避审核</span></span>
<span class="line"><span>不能替换支付、登录、隐私采集等核心合规逻辑</span></span>
<span class="line"><span>不能下载可执行原生代码破坏平台规则</span></span></code></pre></div><p>合理用途:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>修 UI 文案</span></span>
<span class="line"><span>修业务展示逻辑</span></span>
<span class="line"><span>调整活动页</span></span>
<span class="line"><span>修非核心流程 bug</span></span>
<span class="line"><span>灰度配置和开关</span></span></code></pre></div><p>涉及平台政策时要按当前商店规则复查。复查日期:2026-06-08。</p><hr><h2 id="八、webview-常见工程问题" tabindex="-1">八、WebView 常见工程问题 <a class="header-anchor" href="#八、webview-常见工程问题" aria-label="Permalink to &quot;八、WebView 常见工程问题&quot;">​</a></h2><p>常见坑:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>缓存策略不清导致用户一直看到旧页面</span></span>
<span class="line"><span>Android / iOS WebView 内核差异</span></span>
<span class="line"><span>文件上传、相机、定位权限链路复杂</span></span>
<span class="line"><span>返回栈和原生导航冲突</span></span>
<span class="line"><span>页面白屏缺少兜底</span></span>
<span class="line"><span>H5 崩溃和 JS 错误未上报</span></span>
<span class="line"><span>Cookie 清理不完整</span></span>
<span class="line"><span>深链跳转循环</span></span></code></pre></div><p>每个 WebView 容器都应该提供:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>加载态</span></span>
<span class="line"><span>错误页</span></span>
<span class="line"><span>重试</span></span>
<span class="line"><span>标题同步</span></span>
<span class="line"><span>返回处理</span></span>
<span class="line"><span>权限拦截</span></span>
<span class="line"><span>域名白名单</span></span>
<span class="line"><span>JS 错误上报</span></span></code></pre></div><hr><h2 id="九、什么时候会出事故" tabindex="-1">九、什么时候会出事故 <a class="header-anchor" href="#九、什么时候会出事故" aria-label="Permalink to &quot;九、什么时候会出事故&quot;">​</a></h2><p>常见事故:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>离线包 hash 校验缺失,资源被污染</span></span>
<span class="line"><span>新 H5 调用了旧 App 不支持的 bridge 方法</span></span>
<span class="line"><span>热更新下发后旧版本 App 白屏</span></span>
<span class="line"><span>退出登录没有清 WebView Cookie</span></span>
<span class="line"><span>URL 携带 token 被埋点平台采集</span></span>
<span class="line"><span>Android 文件选择器没适配导致上传失败</span></span>
<span class="line"><span>iOS WKWebView 缓存导致审核看到旧页面</span></span>
<span class="line"><span>动态下发能力被商店认为规避审核</span></span></code></pre></div><p>Hybrid 事故通常发生在&quot;原生、H5、服务端版本没有对齐&quot;。</p><hr><h2 id="十、检查清单" tabindex="-1">十、检查清单 <a class="header-anchor" href="#十、检查清单" aria-label="Permalink to &quot;十、检查清单&quot;">​</a></h2><ul><li>[ ] WebView 是否限制可访问域名</li><li>[ ] JSBridge 是否有方法白名单和参数校验</li><li>[ ] H5 是否拿不到长期 token</li><li>[ ] 退出登录是否清 Cookie、localStorage、sessionStorage</li><li>[ ] 离线包是否有 hash / 签名校验</li><li>[ ] 离线包是否按 App 版本做兼容控制</li><li>[ ] 离线包是否能回滚</li><li>[ ] H5 JS 错误是否上报</li><li>[ ] 热更新范围是否不触碰审核红线</li><li>[ ] 新 bridge 方法是否兼容旧 App</li></ul><hr><h2 id="十一、结论" tabindex="-1">十一、结论 <a class="header-anchor" href="#十一、结论" aria-label="Permalink to &quot;十一、结论&quot;">​</a></h2><p>Hybrid 的核心不是&quot;快&quot;,而是边界:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>H5 负责可快速变化的展示和轻业务</span></span>
<span class="line"><span>原生负责平台能力和安全边界</span></span>
<span class="line"><span>离线包负责资源交付</span></span>
<span class="line"><span>热更新负责有限修复</span></span>
<span class="line"><span>商店发版负责二进制和核心能力</span></span></code></pre></div><p>边界清楚,Hybrid 是效率工具。边界不清,它就是线上事故入口。</p>`,73)])])}const g=s(t,[["render",i]]);export{b as __pageData,g as default};
