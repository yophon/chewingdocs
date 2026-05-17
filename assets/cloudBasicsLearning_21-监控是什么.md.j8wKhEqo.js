import{c as s,Q as n,j as p,m as l}from"./chunks/framework.CBiVa4O3.js";const u=JSON.parse('{"title":"监控是什么:指标、日志、链路追踪的分工","description":"","frontmatter":{},"headers":[],"relativePath":"../cloudBasicsLearning/21-监控是什么.md","filePath":"../cloudBasicsLearning/21-监控是什么.md","lastUpdated":1779015580000}'),e={name:"../cloudBasicsLearning/21-监控是什么.md"};function i(t,a,c,o,h,d){return n(),p("div",null,[...a[0]||(a[0]=[l(`<h1 id="监控是什么-指标、日志、链路追踪的分工" tabindex="-1">监控是什么:指标、日志、链路追踪的分工 <a class="header-anchor" href="#监控是什么-指标、日志、链路追踪的分工" aria-label="Permalink to &quot;监控是什么:指标、日志、链路追踪的分工&quot;">​</a></h1><blockquote><p>一句话先记住:<strong>监控不是摆几张漂亮图表,而是在系统出问题前后,让你知道哪里异常、影响多大、该先查什么</strong>。</p></blockquote><p>很多人把监控理解成 CPU、内存、磁盘三张图。它们当然有用,但对一个真实网站或 SaaS 来说远远不够。用户登录失败、支付回调丢失、CDN 回源异常、数据库连接打满、第三方接口变慢,这些都可能发生在机器指标看起来还正常的时候。</p><p>监控的目标不是&quot;看起来专业&quot;,而是缩短三个时间:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>发现问题的时间</span></span>
<span class="line"><span>定位问题的时间</span></span>
<span class="line"><span>恢复服务的时间</span></span></code></pre></div><hr><h2 id="一、一句话解释" tabindex="-1">一、一句话解释 <a class="header-anchor" href="#一、一句话解释" aria-label="Permalink to &quot;一、一句话解释&quot;">​</a></h2><h3 id="_1-1-监控到底监什么" tabindex="-1">1.1 监控到底监什么 <a class="header-anchor" href="#_1-1-监控到底监什么" aria-label="Permalink to &quot;1.1 监控到底监什么&quot;">​</a></h3><p>监控要回答四类问题:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>可用性:</span></span>
<span class="line"><span>  用户能不能访问?</span></span>
<span class="line"><span></span></span>
<span class="line"><span>正确性:</span></span>
<span class="line"><span>  请求有没有成功?</span></span>
<span class="line"><span></span></span>
<span class="line"><span>性能:</span></span>
<span class="line"><span>  响应是不是变慢?</span></span>
<span class="line"><span></span></span>
<span class="line"><span>容量:</span></span>
<span class="line"><span>  资源是不是快用完?</span></span></code></pre></div><p>如果只监控服务器是否在线,你只能知道&quot;机器大概还活着&quot;。但用户关心的是&quot;我能不能完成操作&quot;。</p><h3 id="_1-2-指标、日志、链路追踪分别做什么" tabindex="-1">1.2 指标、日志、链路追踪分别做什么 <a class="header-anchor" href="#_1-2-指标、日志、链路追踪分别做什么" aria-label="Permalink to &quot;1.2 指标、日志、链路追踪分别做什么&quot;">​</a></h3><p>这三个词经常一起出现,但分工不同:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>指标(Metrics):</span></span>
<span class="line"><span>  用数字看趋势</span></span>
<span class="line"><span>  例如错误率、延迟、CPU、内存、请求数、队列积压</span></span>
<span class="line"><span></span></span>
<span class="line"><span>日志(Logs):</span></span>
<span class="line"><span>  用事件看细节</span></span>
<span class="line"><span>  例如某次请求为什么失败、具体错误堆栈是什么</span></span>
<span class="line"><span></span></span>
<span class="line"><span>链路追踪(Tracing):</span></span>
<span class="line"><span>  用调用链看一次请求经过了哪些服务</span></span>
<span class="line"><span>  例如前端 -&gt; API -&gt; 数据库 -&gt; 支付服务,每一步花了多久</span></span></code></pre></div><p>一句简单区别:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>指标告诉你&quot;哪里不对劲&quot;</span></span>
<span class="line"><span>日志告诉你&quot;发生了什么&quot;</span></span>
<span class="line"><span>链路追踪告诉你&quot;一次请求卡在哪一段&quot;</span></span></code></pre></div><h3 id="_1-3-监控和告警不是一回事" tabindex="-1">1.3 监控和告警不是一回事 <a class="header-anchor" href="#_1-3-监控和告警不是一回事" aria-label="Permalink to &quot;1.3 监控和告警不是一回事&quot;">​</a></h3><p>监控是收集和展示系统状态。告警是当状态异常时通知人。</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>监控:</span></span>
<span class="line"><span>  5xx 错误率从 0.1% 升到 8%</span></span>
<span class="line"><span></span></span>
<span class="line"><span>告警:</span></span>
<span class="line"><span>  把这件事通过短信、电话、邮件、群消息告诉负责人</span></span></code></pre></div><p>没有监控,告警没有依据。没有告警,监控可能只是事后翻图。</p><hr><h2 id="二、放在系统哪里" tabindex="-1">二、放在系统哪里 <a class="header-anchor" href="#二、放在系统哪里" aria-label="Permalink to &quot;二、放在系统哪里&quot;">​</a></h2><h3 id="_2-1-监控应该覆盖用户请求链路" tabindex="-1">2.1 监控应该覆盖用户请求链路 <a class="header-anchor" href="#_2-1-监控应该覆盖用户请求链路" aria-label="Permalink to &quot;2.1 监控应该覆盖用户请求链路&quot;">​</a></h3><p>一个小产品可以按链路看监控点:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>用户侧:</span></span>
<span class="line"><span>  页面是否能打开</span></span>
<span class="line"><span>  首屏加载是否过慢</span></span>
<span class="line"><span></span></span>
<span class="line"><span>入口层:</span></span>
<span class="line"><span>  DNS 是否正常</span></span>
<span class="line"><span>  CDN 命中率</span></span>
<span class="line"><span>  WAF 拦截量</span></span>
<span class="line"><span>  4xx / 5xx 比例</span></span>
<span class="line"><span></span></span>
<span class="line"><span>应用层:</span></span>
<span class="line"><span>  API 请求数</span></span>
<span class="line"><span>  错误率</span></span>
<span class="line"><span>  P95 / P99 延迟</span></span>
<span class="line"><span>  函数执行时间</span></span>
<span class="line"><span></span></span>
<span class="line"><span>数据层:</span></span>
<span class="line"><span>  数据库连接数</span></span>
<span class="line"><span>  慢查询</span></span>
<span class="line"><span>  存储容量</span></span>
<span class="line"><span>  缓存命中率</span></span>
<span class="line"><span></span></span>
<span class="line"><span>异步层:</span></span>
<span class="line"><span>  队列积压</span></span>
<span class="line"><span>  任务失败次数</span></span>
<span class="line"><span>  重试次数</span></span>
<span class="line"><span></span></span>
<span class="line"><span>外部依赖:</span></span>
<span class="line"><span>  支付、短信、邮件、地图、AI API 的成功率和延迟</span></span></code></pre></div><p>监控不一定一开始全部做满,但你要知道每一层出问题时会影响什么。</p><h3 id="_2-2-外部探测很重要" tabindex="-1">2.2 外部探测很重要 <a class="header-anchor" href="#_2-2-外部探测很重要" aria-label="Permalink to &quot;2.2 外部探测很重要&quot;">​</a></h3><p>很多小团队只看云控制台里的服务状态,忽略了外部探测。外部探测是从真实用户附近定时访问你的网站或接口:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>每 1 分钟:</span></span>
<span class="line"><span>  访问首页</span></span>
<span class="line"><span>  调用健康检查接口</span></span>
<span class="line"><span>  检查返回状态码和响应时间</span></span></code></pre></div><p>它能发现一些内部监控看不到的问题:</p><ul><li>DNS 配置错误</li><li>CDN 节点异常</li><li>TLS 证书过期</li><li>WAF 误拦截</li><li>首页部署白屏</li><li>某个地区访问失败</li></ul><p>如果你只监控服务器内部,这些问题可能会漏掉。</p><h3 id="_2-3-业务监控比机器监控更接近用户" tabindex="-1">2.3 业务监控比机器监控更接近用户 <a class="header-anchor" href="#_2-3-业务监控比机器监控更接近用户" aria-label="Permalink to &quot;2.3 业务监控比机器监控更接近用户&quot;">​</a></h3><p>机器监控告诉你资源状态,业务监控告诉你产品是否正常运转:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>机器监控:</span></span>
<span class="line"><span>  CPU 80%</span></span>
<span class="line"><span>  内存 70%</span></span>
<span class="line"><span>  磁盘剩余 20GB</span></span>
<span class="line"><span></span></span>
<span class="line"><span>业务监控:</span></span>
<span class="line"><span>  最近 10 分钟注册成功率下降</span></span>
<span class="line"><span>  支付回调失败率上升</span></span>
<span class="line"><span>  文件上传失败次数增加</span></span>
<span class="line"><span>  队列积压超过 10000 条</span></span></code></pre></div><p>对小团队来说,业务监控经常比机器监控更早暴露真实问题。</p><hr><h2 id="三、常见套餐和使用限制" tabindex="-1">三、常见套餐和使用限制 <a class="header-anchor" href="#三、常见套餐和使用限制" aria-label="Permalink to &quot;三、常见套餐和使用限制&quot;">​</a></h2><h3 id="_3-1-免费监控常限制保留时间和粒度" tabindex="-1">3.1 免费监控常限制保留时间和粒度 <a class="header-anchor" href="#_3-1-免费监控常限制保留时间和粒度" aria-label="Permalink to &quot;3.1 免费监控常限制保留时间和粒度&quot;">​</a></h3><p>免费套餐或低价套餐常见限制:</p><ul><li>指标只保留 1 天、7 天或 30 天</li><li>日志保留时间短</li><li>日志量超过后丢弃或收费</li><li>监控粒度较粗,例如 1 分钟或 5 分钟一个点</li><li>自定义指标数量有限</li><li>告警规则数量有限</li><li>通知渠道有限</li><li>链路追踪采样率有限</li><li>多团队协作和权限功能受限</li></ul><p>这些限制平时不明显,出事故时很要命。因为你最需要查历史的时候,可能发现日志已经过期;你最需要看细节的时候,发现免费套餐只保留聚合数据。</p><h3 id="_3-2-日志成本可能比想象中高" tabindex="-1">3.2 日志成本可能比想象中高 <a class="header-anchor" href="#_3-2-日志成本可能比想象中高" aria-label="Permalink to &quot;3.2 日志成本可能比想象中高&quot;">​</a></h3><p>日志不是越多越好。大量 debug 日志、请求体日志、重复错误日志都会带来成本和风险:</p><ul><li>存储费用增加</li><li>查询费用增加</li><li>日志平台超额</li><li>敏感信息泄露风险增加</li><li>排查时被噪音淹没</li></ul><p>小团队常见错误是上线时忘了关 debug 日志,一次流量增长后日志量暴涨,账单也跟着涨。</p><h3 id="_3-3-链路追踪通常不是免费无限用" tabindex="-1">3.3 链路追踪通常不是免费无限用 <a class="header-anchor" href="#_3-3-链路追踪通常不是免费无限用" aria-label="Permalink to &quot;3.3 链路追踪通常不是免费无限用&quot;">​</a></h3><p>链路追踪很有价值,但也常受限制:</p><ul><li>采样率限制</li><li>trace 数量限制</li><li>保留时间限制</li><li>高级分析付费</li><li>跨服务接入需要额外配置</li></ul><p>如果系统还很简单,可以先用日志里的 request_id 串起一次请求。等服务变多、调用链变长,再引入完整 tracing。</p><h3 id="_3-4-状态页不等于监控系统" tabindex="-1">3.4 状态页不等于监控系统 <a class="header-anchor" href="#_3-4-状态页不等于监控系统" aria-label="Permalink to &quot;3.4 状态页不等于监控系统&quot;">​</a></h3><p>状态页是给用户或客户看的,监控系统是给工程团队排障用的。</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>状态页:</span></span>
<span class="line"><span>  &quot;我们正在调查 API 异常&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>监控系统:</span></span>
<span class="line"><span>  &quot;从 10:02 开始,登录接口 5xx 升到 12%,数据库连接数达到上限,主要影响亚洲用户&quot;</span></span></code></pre></div><p>状态页可以提升沟通效率,但它不能替代监控。</p><hr><h2 id="四、小团队建议" tabindex="-1">四、小团队建议 <a class="header-anchor" href="#四、小团队建议" aria-label="Permalink to &quot;四、小团队建议&quot;">​</a></h2><h3 id="_4-1-先做最小监控面" tabindex="-1">4.1 先做最小监控面 <a class="header-anchor" href="#_4-1-先做最小监控面" aria-label="Permalink to &quot;4.1 先做最小监控面&quot;">​</a></h3><p>一个小团队上线初期,至少要有:</p><ul><li>首页外部可用性探测</li><li>核心 API 健康检查</li><li>5xx 错误率</li><li>P95 延迟</li><li>数据库连接数和存储容量</li><li>队列积压和失败任务数</li><li>部署失败通知</li><li>证书过期提醒</li><li>账单和用量告警</li></ul><p>这套监控不复杂,但能覆盖大多数早期事故。</p><h3 id="_4-2-每个告警都要能行动" tabindex="-1">4.2 每个告警都要能行动 <a class="header-anchor" href="#_4-2-每个告警都要能行动" aria-label="Permalink to &quot;4.2 每个告警都要能行动&quot;">​</a></h3><p>不要为了显得专业设置几十个告警。告警太多会让人麻木。</p><p>好的告警应该满足:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>有人负责:</span></span>
<span class="line"><span>  谁收到?谁处理?</span></span>
<span class="line"><span></span></span>
<span class="line"><span>影响明确:</span></span>
<span class="line"><span>  影响用户还是只影响后台任务?</span></span>
<span class="line"><span></span></span>
<span class="line"><span>阈值合理:</span></span>
<span class="line"><span>  不因为短暂抖动频繁报警</span></span>
<span class="line"><span></span></span>
<span class="line"><span>有下一步:</span></span>
<span class="line"><span>  收到后先看哪张图?哪份日志?哪个服务?</span></span></code></pre></div><p>如果一个告警响了以后没人知道该做什么,它就是噪音。</p><h3 id="_4-3-保留关键日志-少存无用日志" tabindex="-1">4.3 保留关键日志,少存无用日志 <a class="header-anchor" href="#_4-3-保留关键日志-少存无用日志" aria-label="Permalink to &quot;4.3 保留关键日志,少存无用日志&quot;">​</a></h3><p>建议至少保留这些日志:</p><ul><li>请求入口日志</li><li>错误日志和异常堆栈</li><li>登录、支付、权限变更等关键业务事件</li><li>第三方 API 调用失败记录</li><li>后台任务执行结果</li><li>管理员操作记录</li></ul><p>同时避免记录:</p><ul><li>明文密码</li><li>完整银行卡信息</li><li>长期有效的 API Key</li><li>敏感 Token</li><li>大量重复 debug 输出</li></ul><p>日志既是排障工具,也是安全和合规风险点。</p><h3 id="_4-4-监控要和发布流程连起来" tabindex="-1">4.4 监控要和发布流程连起来 <a class="header-anchor" href="#_4-4-监控要和发布流程连起来" aria-label="Permalink to &quot;4.4 监控要和发布流程连起来&quot;">​</a></h3><p>很多故障发生在发布后几分钟。小团队应该养成习惯:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>发布前:</span></span>
<span class="line"><span>  确认核心路径有监控</span></span>
<span class="line"><span></span></span>
<span class="line"><span>发布后:</span></span>
<span class="line"><span>  看错误率</span></span>
<span class="line"><span>  看 P95 延迟</span></span>
<span class="line"><span>  看登录、注册、支付等核心动作是否正常</span></span>
<span class="line"><span></span></span>
<span class="line"><span>出问题:</span></span>
<span class="line"><span>  先回滚或降级</span></span>
<span class="line"><span>  再慢慢分析根因</span></span></code></pre></div><p>监控不是上线后才补的装饰,它应该是发布流程的一部分。</p><hr><h2 id="五、一句话总结" tabindex="-1">五、一句话总结 <a class="header-anchor" href="#五、一句话总结" aria-label="Permalink to &quot;五、一句话总结&quot;">​</a></h2><p><strong>监控的价值不是图表,而是让你更早发现故障、更快定位原因、更稳恢复服务;小团队先覆盖外部可用性、核心 API、错误率、延迟、数据库和账单用量。</strong></p>`,78)])])}const b=s(e,[["render",i]]);export{u as __pageData,b as default};
