import{_ as s,H as n,f as p,i as l}from"./chunks/framework.BHvCMIhP.js";const u=JSON.parse('{"title":"SLA / SLO / SLI:服务承诺、内部目标、真实指标","description":"","frontmatter":{},"headers":[],"relativePath":"cloudBasicsLearning/18-SLA-SLO-SLI.md","filePath":"cloudBasicsLearning/18-SLA-SLO-SLI.md","lastUpdated":1779015580000}'),e={name:"cloudBasicsLearning/18-SLA-SLO-SLI.md"};function i(t,a,c,o,r,h){return n(),p("div",null,[...a[0]||(a[0]=[l(`<h1 id="sla-slo-sli-服务承诺、内部目标、真实指标" tabindex="-1">SLA / SLO / SLI:服务承诺、内部目标、真实指标 <a class="header-anchor" href="#sla-slo-sli-服务承诺、内部目标、真实指标" aria-label="Permalink to &quot;SLA / SLO / SLI:服务承诺、内部目标、真实指标&quot;">​</a></h1><blockquote><p>一句话先记住:<strong>SLI 是实际测到的指标,SLO 是团队内部想达到的目标,SLA 是对外写进合同或服务条款里的承诺</strong>。</p></blockquote><p>很多人第一次看到 SLA,会直接把它理解成&quot;这个服务一定不会挂&quot;。这是错误的。SLA 不是魔法护盾,它更像一个服务质量承诺:如果服务可用性低于承诺,厂商可能按条款给你服务抵扣、退款或赔偿,但它不能把已经发生的宕机变没。</p><p>SLO 和 SLI 则更偏工程内部。你真正运营一个小产品时,不能只看云厂商写了多少个 9,还要知道自己的用户实际体验是多少。</p><hr><h2 id="一、一句话解释" tabindex="-1">一、一句话解释 <a class="header-anchor" href="#一、一句话解释" aria-label="Permalink to &quot;一、一句话解释&quot;">​</a></h2><h3 id="_1-1-三个词分别是什么" tabindex="-1">1.1 三个词分别是什么 <a class="header-anchor" href="#_1-1-三个词分别是什么" aria-label="Permalink to &quot;1.1 三个词分别是什么&quot;">​</a></h3><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>SLI(Service Level Indicator)</span></span>
<span class="line"><span>   实际测量出来的指标</span></span>
<span class="line"><span>   例如:请求成功率、接口 P95 延迟、页面可访问率</span></span>
<span class="line"><span></span></span>
<span class="line"><span>SLO(Service Level Objective)</span></span>
<span class="line"><span>   团队内部设定的目标</span></span>
<span class="line"><span>   例如:核心 API 月可用性达到 99.9%,P95 延迟低于 500ms</span></span>
<span class="line"><span></span></span>
<span class="line"><span>SLA(Service Level Agreement)</span></span>
<span class="line"><span>   对外承诺或合同条款</span></span>
<span class="line"><span>   例如:云数据库月可用性低于 99.9% 时,按规则返还服务额度</span></span></code></pre></div><p>最容易混淆的是 SLA 和真实可用性。</p><p>一个云数据库写着 99.95% SLA,不代表你的应用就有 99.95% 可用性。因为你的系统还包含 DNS、CDN、后端、数据库、对象存储、第三方登录、支付接口、代码 bug、发布流程。任意一层出问题,用户看到的都可能是&quot;网站打不开&quot;。</p><h3 id="_1-2-一个小例子" tabindex="-1">1.2 一个小例子 <a class="header-anchor" href="#_1-2-一个小例子" aria-label="Permalink to &quot;1.2 一个小例子&quot;">​</a></h3><p>假设你做了一个小型 SaaS:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>用户访问:</span></span>
<span class="line"><span>  浏览器 -&gt; DNS -&gt; CDN -&gt; 前端托管 -&gt; API -&gt; 数据库 -&gt; 对象存储</span></span>
<span class="line"><span></span></span>
<span class="line"><span>你的云数据库 SLA:99.95%</span></span>
<span class="line"><span>你的前端托管 SLA:99.9%</span></span>
<span class="line"><span>你的 CDN SLA:99.9%</span></span>
<span class="line"><span>你的代码发布:偶尔把 API 部署坏</span></span>
<span class="line"><span>你的支付回调:依赖第三方服务</span></span></code></pre></div><p>这时你不能说&quot;我的产品 SLA 是 99.95%&quot;。你只能说&quot;数据库供应商承诺了 99.95%&quot;。你的产品对用户的可用性,要靠你自己测出来,这就是 SLI。</p><hr><h2 id="二、放在系统哪里" tabindex="-1">二、放在系统哪里 <a class="header-anchor" href="#二、放在系统哪里" aria-label="Permalink to &quot;二、放在系统哪里&quot;">​</a></h2><h3 id="_2-1-sla-在合同和套餐页里" tabindex="-1">2.1 SLA 在合同和套餐页里 <a class="header-anchor" href="#_2-1-sla-在合同和套餐页里" aria-label="Permalink to &quot;2.1 SLA 在合同和套餐页里&quot;">​</a></h3><p>SLA 通常出现在:</p><ul><li>云服务器、数据库、对象存储、CDN、消息队列等产品说明页</li><li>企业版、商业版、Pro 计划的服务条款</li><li>大客户合同、支持协议、赔偿规则</li><li>故障公告和服务状态页</li></ul><p>它是&quot;厂商对你&quot;的承诺,不是&quot;你对用户&quot;的完整承诺。</p><p>独立开发者常犯的错误是:看到某个底层服务 SLA 很高,就以为自己的产品也很稳。真实情况是,你的产品可用性取决于整条链路,还取决于你有没有监控、告警、回滚、备份和故障处理流程。</p><h3 id="_2-2-slo-在团队目标里" tabindex="-1">2.2 SLO 在团队目标里 <a class="header-anchor" href="#_2-2-slo-在团队目标里" aria-label="Permalink to &quot;2.2 SLO 在团队目标里&quot;">​</a></h3><p>SLO 是你给自己定的目标,适合写在内部文档里,例如:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>核心页面:</span></span>
<span class="line"><span>  月可访问率 &gt;= 99.9%</span></span>
<span class="line"><span></span></span>
<span class="line"><span>登录接口:</span></span>
<span class="line"><span>  成功率 &gt;= 99.5%</span></span>
<span class="line"><span>  P95 延迟 &lt;= 800ms</span></span>
<span class="line"><span></span></span>
<span class="line"><span>支付回调:</span></span>
<span class="line"><span>  不丢消息</span></span>
<span class="line"><span>  失败后可重试</span></span>
<span class="line"><span></span></span>
<span class="line"><span>后台导出:</span></span>
<span class="line"><span>  可以慢一点</span></span>
<span class="line"><span>  但不能影响核心接口</span></span></code></pre></div><p>注意 SLO 不应该一开始就全部写成 99.99%。对小团队来说,目标越高,成本越高,架构越复杂,值班压力也越大。</p><h3 id="_2-3-sli-在监控数据里" tabindex="-1">2.3 SLI 在监控数据里 <a class="header-anchor" href="#_2-3-sli-在监控数据里" aria-label="Permalink to &quot;2.3 SLI 在监控数据里&quot;">​</a></h3><p>SLI 是你实际收集的指标,例如:</p><ul><li>最近 30 天首页是否能打开</li><li>API 2xx / 3xx / 4xx / 5xx 比例</li><li>登录接口 P50、P95、P99 延迟</li><li>数据库连接失败次数</li><li>队列积压数量</li><li>第三方支付回调失败率</li></ul><p>如果没有 SLI,你就没有资格认真讨论 SLO。因为你连系统真实表现都不知道,只是凭感觉说&quot;最近挺稳定&quot;。</p><hr><h2 id="三、常见套餐和使用限制" tabindex="-1">三、常见套餐和使用限制 <a class="header-anchor" href="#三、常见套餐和使用限制" aria-label="Permalink to &quot;三、常见套餐和使用限制&quot;">​</a></h2><h3 id="_3-1-免费套餐通常没有强-sla" tabindex="-1">3.1 免费套餐通常没有强 SLA <a class="header-anchor" href="#_3-1-免费套餐通常没有强-sla" aria-label="Permalink to &quot;3.1 免费套餐通常没有强 SLA&quot;">​</a></h3><p>很多免费套餐、个人计划、开发者计划会写得很克制:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>可能提供:</span></span>
<span class="line"><span>  - 基础可用性</span></span>
<span class="line"><span>  - 社区支持</span></span>
<span class="line"><span>  - 状态页公告</span></span>
<span class="line"><span>  - 最佳努力服务</span></span>
<span class="line"><span></span></span>
<span class="line"><span>通常不提供:</span></span>
<span class="line"><span>  - 明确赔偿</span></span>
<span class="line"><span>  - 专属支持</span></span>
<span class="line"><span>  - 故障优先处理</span></span>
<span class="line"><span>  - 严格响应时间</span></span>
<span class="line"><span>  - 企业级 SLA</span></span></code></pre></div><p>这不代表免费套餐不能用,而是你不能把免费套餐当成商业承诺的基础。你的边项目、内部工具、验证型产品可以用免费套餐起步;但如果你已经向客户收费,尤其是 B2B 客户,就要认真看 SLA 和支持条款。</p><h3 id="_3-2-sla-的赔偿通常不是现金赔你损失" tabindex="-1">3.2 SLA 的赔偿通常不是现金赔你损失 <a class="header-anchor" href="#_3-2-sla-的赔偿通常不是现金赔你损失" aria-label="Permalink to &quot;3.2 SLA 的赔偿通常不是现金赔你损失&quot;">​</a></h3><p>SLA 低于承诺后,常见处理是服务抵扣、账单抵扣或按比例返还服务额度。它通常不会赔你:</p><ul><li>用户流失</li><li>广告投放损失</li><li>客户索赔</li><li>品牌损失</li><li>你半夜排障的时间</li></ul><p>所以 SLA 的意义不是&quot;出事有人赔我全部损失&quot;,而是&quot;这个服务提供商愿意为可用性承担一部分合同责任&quot;。</p><h3 id="_3-3-分钟级换算只看大概" tabindex="-1">3.3 分钟级换算只看大概 <a class="header-anchor" href="#_3-3-分钟级换算只看大概" aria-label="Permalink to &quot;3.3 分钟级换算只看大概&quot;">​</a></h3><p>可用性里的几个 9 可以粗略理解为:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>按 30 天一个月粗略估算:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>99%      每月大约允许 7.2 小时不可用</span></span>
<span class="line"><span>99.9%    每月大约允许 43 分钟不可用</span></span>
<span class="line"><span>99.99%   每月大约允许 4 分钟不可用</span></span>
<span class="line"><span>99.999%  每月大约允许 26 秒不可用</span></span></code></pre></div><p>这只是帮助你建立直觉,不要把它当成精确计算。不同厂商对&quot;不可用&quot;的定义不同,有的按区域算,有的按服务实例算,有的会排除计划维护、不可抗力、用户配置错误和第三方故障。</p><h3 id="_3-4-最容易忽略的是-定义" tabindex="-1">3.4 最容易忽略的是&quot;定义&quot; <a class="header-anchor" href="#_3-4-最容易忽略的是-定义" aria-label="Permalink to &quot;3.4 最容易忽略的是&quot;定义&quot;&quot;">​</a></h3><p>看 SLA 时,不要只看 99.9%,还要看:</p><ul><li>什么算不可用</li><li>统计周期是月、季度还是年</li><li>哪些区域、实例、套餐包含 SLA</li><li>计划维护是否排除</li><li>用户配置错误是否排除</li><li>赔偿需要主动申请还是自动返还</li><li>赔偿上限是多少</li></ul><p>这些细节决定了 SLA 是否真的能保护你。</p><hr><h2 id="四、小团队建议" tabindex="-1">四、小团队建议 <a class="header-anchor" href="#四、小团队建议" aria-label="Permalink to &quot;四、小团队建议&quot;">​</a></h2><h3 id="_4-1-不要一开始承诺过高" tabindex="-1">4.1 不要一开始承诺过高 <a class="header-anchor" href="#_4-1-不要一开始承诺过高" aria-label="Permalink to &quot;4.1 不要一开始承诺过高&quot;">​</a></h3><p>如果你是独立开发者或小团队,早期最保守的做法是:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>对外:</span></span>
<span class="line"><span>  不轻易承诺 99.99%</span></span>
<span class="line"><span>  不写超出自己能力的可用性保证</span></span>
<span class="line"><span>  对企业客户单独谈支持和维护窗口</span></span>
<span class="line"><span></span></span>
<span class="line"><span>对内:</span></span>
<span class="line"><span>  核心功能先定 99.9% 左右的目标</span></span>
<span class="line"><span>  非核心功能允许降级</span></span>
<span class="line"><span>  先保证能发现故障,再谈高可用架构</span></span></code></pre></div><p>很多小产品真正需要的不是复杂多地域容灾,而是:</p><ul><li>首页挂了能 1 分钟内知道</li><li>数据库连接打满能看到</li><li>发布出错能快速回滚</li><li>付款、登录、注册这些核心路径有单独监控</li><li>故障时有一个静态状态页或公告渠道</li></ul><h3 id="_4-2-用用户路径定义-sli" tabindex="-1">4.2 用用户路径定义 SLI <a class="header-anchor" href="#_4-2-用用户路径定义-sli" aria-label="Permalink to &quot;4.2 用用户路径定义 SLI&quot;">​</a></h3><p>不要只监控服务器 CPU。对用户来说,CPU 正常但登录失败,系统还是不可用。</p><p>更实用的 SLI 是围绕用户路径:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>访问:</span></span>
<span class="line"><span>  首页能不能打开</span></span>
<span class="line"><span>  静态资源是否正常加载</span></span>
<span class="line"><span></span></span>
<span class="line"><span>账号:</span></span>
<span class="line"><span>  注册是否成功</span></span>
<span class="line"><span>  登录是否成功</span></span>
<span class="line"><span></span></span>
<span class="line"><span>核心业务:</span></span>
<span class="line"><span>  创建订单是否成功</span></span>
<span class="line"><span>  保存数据是否成功</span></span>
<span class="line"><span>  上传文件是否成功</span></span>
<span class="line"><span></span></span>
<span class="line"><span>性能:</span></span>
<span class="line"><span>  P95 延迟是否超过目标</span></span>
<span class="line"><span>  错误率是否突然升高</span></span></code></pre></div><p>这类指标比&quot;机器还活着吗&quot;更接近真实体验。</p><h3 id="_4-3-升级的判断标准" tabindex="-1">4.3 升级的判断标准 <a class="header-anchor" href="#_4-3-升级的判断标准" aria-label="Permalink to &quot;4.3 升级的判断标准&quot;">​</a></h3><p>你需要考虑更高套餐或更专业方案,通常不是因为&quot;看起来更高级&quot;,而是因为出现了这些信号:</p><ul><li>已经有付费客户依赖你的服务</li><li>故障会直接造成收入损失</li><li>客户合同要求明确 SLA</li><li>免费套餐没有足够日志和监控</li><li>支持响应时间太慢</li><li>单区域故障会让业务完全停止</li><li>你已经无法接受手工排障和手工恢复</li></ul><p>在这之前,盲目追求 99.99% 可能只是提前购买复杂度。</p><hr><h2 id="五、一句话总结" tabindex="-1">五、一句话总结 <a class="header-anchor" href="#五、一句话总结" aria-label="Permalink to &quot;五、一句话总结&quot;">​</a></h2><p><strong>SLI 是你实际测到的系统表现,SLO 是你内部想达到的目标,SLA 是服务商或你对外承诺的责任边界;小团队先把真实用户路径监控起来,再决定要不要为更多个 9 付钱。</strong></p>`,66)])])}const S=s(e,[["render",i]]);export{u as __pageData,S as default};
