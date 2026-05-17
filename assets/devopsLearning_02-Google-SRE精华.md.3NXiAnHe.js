import{c as a,Q as n,j as p,m as l}from"./chunks/framework.CBiVa4O3.js";const d=JSON.parse('{"title":"Google SRE 精华:错误预算 / Toil / 50% 工程时间 / 黄金信号","description":"","frontmatter":{},"headers":[],"relativePath":"../devopsLearning/02-Google-SRE精华.md","filePath":"../devopsLearning/02-Google-SRE精华.md","lastUpdated":1778496697000}'),i={name:"../devopsLearning/02-Google-SRE精华.md"};function e(t,s,o,c,r,h){return n(),p("div",null,[...s[0]||(s[0]=[l(`<h1 id="google-sre-精华-错误预算-toil-50-工程时间-黄金信号" tabindex="-1">Google SRE 精华:错误预算 / Toil / 50% 工程时间 / 黄金信号 <a class="header-anchor" href="#google-sre-精华-错误预算-toil-50-工程时间-黄金信号" aria-label="Permalink to &quot;Google SRE 精华:错误预算 / Toil / 50% 工程时间 / 黄金信号&quot;">​</a></h1><p>讲 Google SRE 最大的问题是:<strong>这本书有 500 多页,中型团队没人有时间认认真真读完,但又被反复引用</strong>。结果就是大家被一些断章取义的概念喂大:<strong>&quot;错误预算&quot;被理解成&quot;用完就停发版&quot;、&quot;Toil&quot;被理解成&quot;加班&quot;、&quot;50% 工程时间&quot;被理解成&quot;摸鱼合法化&quot;、&quot;黄金信号&quot;被理解成&quot;四个 dashboard&quot;</strong>。这一篇不翻译 SRE Book,也不试图概括全书——<strong>只挑 4 个我认为中型团队真正能用上的概念</strong>,把每个讲透,然后告诉你哪些直接抄、哪些必须改、哪些千万别学。</p><blockquote><p>一句话先记住:<strong>Google SRE 范式的 4 个核心概念不是&quot;理念&quot;,是&quot;算术 + 制度&quot;——错误预算是算术,Toil 上限是制度,50% 时间是组织设计,黄金信号是工程纪律</strong>。这 4 件事的共同点是<strong>都可以量化、都可以执行、都可以审计</strong>。任何把 SRE 讲成&quot;文化&quot;和&quot;理念&quot;的人,要么是没读懂,要么是想卖咨询。<strong>这一篇就是把这 4 件事还原成&quot;你下周能开始用的工具&quot;</strong>。</p></blockquote><hr><h2 id="一、问题场景-中型团队抄-sre-book-的三种翻车" tabindex="-1">一、问题场景:中型团队抄 SRE Book 的三种翻车 <a class="header-anchor" href="#一、问题场景-中型团队抄-sre-book-的三种翻车" aria-label="Permalink to &quot;一、问题场景:中型团队抄 SRE Book 的三种翻车&quot;">​</a></h2><h3 id="_1-1-翻车-a-错误预算变成-用完了我们就吵架" tabindex="-1">1.1 翻车 A:错误预算变成&quot;用完了我们就吵架&quot; <a class="header-anchor" href="#_1-1-翻车-a-错误预算变成-用完了我们就吵架" aria-label="Permalink to &quot;1.1 翻车 A:错误预算变成&quot;用完了我们就吵架&quot;&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>团队 8 人,核心交易服务,SRE Lead 读完 SRE Book 很兴奋</span></span>
<span class="line"><span>给服务定 SLO 99.9%(月度错误预算 43 分钟)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>第一个月顺利,余额 30 分钟</span></span>
<span class="line"><span>第二个月发了个有 bug 的版本,某天烧掉 50 分钟,超支 7 分钟</span></span>
<span class="line"><span>SRE Lead 在群里宣布:&quot;按 Google 政策,我们停发版一周&quot;</span></span>
<span class="line"><span>产品经理炸了:&quot;客户 demo 在周三,你停了我吃不了兜着走&quot;</span></span>
<span class="line"><span>拉了个会,CTO 拍板&quot;这次特殊处理,继续发&quot;</span></span>
<span class="line"><span>此后:错误预算政策再也没人提</span></span>
<span class="line"><span></span></span>
<span class="line"><span>教训:错误预算不是&quot;用完就停&quot;,是&quot;超支触发一系列动作&quot;</span></span>
<span class="line"><span>      这套动作必须事先和业务谈好,否则就是政治问题</span></span></code></pre></div><h3 id="_1-2-翻车-b-toil-不能被识别-什么都被叫-toil" tabindex="-1">1.2 翻车 B:Toil 不能被识别,什么都被叫 Toil <a class="header-anchor" href="#_1-2-翻车-b-toil-不能被识别-什么都被叫-toil" aria-label="Permalink to &quot;1.2 翻车 B:Toil 不能被识别,什么都被叫 Toil&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>SRE 周会,主管问&quot;上周大家 Toil 多少&quot;</span></span>
<span class="line"><span>工程师 A:&quot;我修了 5 个 bug,这都是 Toil&quot;</span></span>
<span class="line"><span>工程师 B:&quot;我看了一天 Prometheus 调 query,Toil 占 80%&quot;</span></span>
<span class="line"><span>工程师 C:&quot;我帮人 review 了 10 个 PR,Toil 50%&quot;</span></span>
<span class="line"><span>主管把数据加起来:&quot;全队平均 Toil 70%,该报警了&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>实际上:</span></span>
<span class="line"><span>   - 修 bug 是工程,不是 Toil</span></span>
<span class="line"><span>   - 调 PromQL 是学习,不是 Toil</span></span>
<span class="line"><span>   - PR review 是工程纪律,不是 Toil</span></span>
<span class="line"><span>   - 真正的 Toil(手动扩容、重启脚本)被混在里面看不清</span></span>
<span class="line"><span></span></span>
<span class="line"><span>结果:统计数据失真,所有改进决策都跑偏</span></span></code></pre></div><h3 id="_1-3-翻车-c-黄金-4-信号变成-每个服务-4-个-dashboard" tabindex="-1">1.3 翻车 C:黄金 4 信号变成&quot;每个服务 4 个 dashboard&quot; <a class="header-anchor" href="#_1-3-翻车-c-黄金-4-信号变成-每个服务-4-个-dashboard" aria-label="Permalink to &quot;1.3 翻车 C:黄金 4 信号变成&quot;每个服务 4 个 dashboard&quot;&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>SRE Lead 看完&quot;黄金信号&quot;那章,给每个微服务建了 4 个 dashboard:</span></span>
<span class="line"><span>   Latency / Traffic / Errors / Saturation</span></span>
<span class="line"><span></span></span>
<span class="line"><span>100 个微服务 = 400 个 dashboard</span></span>
<span class="line"><span>没人看,因为:</span></span>
<span class="line"><span>   - &quot;Saturation&quot;对每个服务定义不一样,没统一过</span></span>
<span class="line"><span>   - &quot;Errors&quot;包含 5xx 还是包含业务错误,没定义过</span></span>
<span class="line"><span>   - &quot;Latency&quot;是 avg 还是 p99,没说过</span></span>
<span class="line"><span>   - 没有 SLO 阈值线,看了不知道&quot;正常不正常&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>教训:黄金信号是&quot;心智模型&quot;,不是&quot;4 个 dashboard 模板&quot;</span></span>
<span class="line"><span>      没 SLO 兜底,4 个信号就是 4 张图,没工程价值</span></span></code></pre></div><hr><h2 id="二、概念-1-错误预算-error-budget" tabindex="-1">二、概念 1:错误预算(Error Budget) <a class="header-anchor" href="#二、概念-1-错误预算-error-budget" aria-label="Permalink to &quot;二、概念 1:错误预算(Error Budget)&quot;">​</a></h2><p>错误预算是 SRE 范式里<strong>最反直觉但最有用的一个概念</strong>——它把&quot;不可用&quot;从&quot;应该避免&quot;翻译成&quot;可以计算的预算&quot;。</p><h3 id="_2-1-算术先讲清楚" tabindex="-1">2.1 算术先讲清楚 <a class="header-anchor" href="#_2-1-算术先讲清楚" aria-label="Permalink to &quot;2.1 算术先讲清楚&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>SLO 99.9% 是什么意思?</span></span>
<span class="line"><span>   = 在某个时间窗口内,99.9% 的请求是&quot;成功&quot;的</span></span>
<span class="line"><span>   = 允许 0.1% 的请求&quot;失败&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>时间窗口常见有:</span></span>
<span class="line"><span>   - 滚动 30 天(rolling 30d)</span></span>
<span class="line"><span>   - 自然月(calendar month)</span></span>
<span class="line"><span>   - 自然季度(calendar quarter)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>把 0.1% 翻译成具体时间(假设服务 24x7):</span></span>
<span class="line"><span>   30 天 = 30 * 24 * 60 = 43,200 分钟</span></span>
<span class="line"><span>   0.1% = 43.2 分钟  ← 这就是&quot;43 分钟错误预算&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>不同 SLO 对应的月度错误预算(滚动 30 天):</span></span>
<span class="line"><span>   99%        = 432 分钟 ≈ 7.2 小时</span></span>
<span class="line"><span>   99.5%      = 216 分钟 ≈ 3.6 小时</span></span>
<span class="line"><span>   99.9%      = 43.2 分钟</span></span>
<span class="line"><span>   99.95%     = 21.6 分钟</span></span>
<span class="line"><span>   99.99%     = 4.32 分钟  ← 一次发布失败回滚就用完</span></span>
<span class="line"><span>   99.999%    = 0.43 分钟  ← 几乎只能做不动的系统</span></span></code></pre></div><p><strong>这套算术不是数学游戏,是给业务方算账的工具</strong>——你跟销售说&quot;我们能做 99.99%&quot;,销售要懂&quot;这意味着一次升级失败就违约&quot;。</p><h3 id="_2-2-错误预算的两层含义" tabindex="-1">2.2 错误预算的两层含义 <a class="header-anchor" href="#_2-2-错误预算的两层含义" aria-label="Permalink to &quot;2.2 错误预算的两层含义&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>含义 A:测量(Measurement)</span></span>
<span class="line"><span>   &quot;我们这个月还有多少错误预算?&quot;</span></span>
<span class="line"><span>   → 实时计算:已消耗 / 总预算</span></span>
<span class="line"><span>   → 这个数字决定&quot;接下来的发布激进还是保守&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>含义 B:政策(Policy)</span></span>
<span class="line"><span>   &quot;错误预算超支了怎么办?&quot;</span></span>
<span class="line"><span>   → 不是&quot;立即停发版&quot;,是触发一系列阶梯响应</span></span>
<span class="line"><span>   → 这是 SRE / 开发 / 业务 三方事先约定的规则</span></span></code></pre></div><p><strong>国内团队 80% 只做了含义 A</strong>(算个数字看着),含义 B(政策)从来没建立——所以错误预算永远是个&quot;指标&quot;而不是&quot;工具&quot;。</p><h3 id="_2-3-错误预算燃烧曲线" tabindex="-1">2.3 错误预算燃烧曲线 <a class="header-anchor" href="#_2-3-错误预算燃烧曲线" aria-label="Permalink to &quot;2.3 错误预算燃烧曲线&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错误预算余额 ▲</span></span>
<span class="line"><span>            │</span></span>
<span class="line"><span>   100% ────┼──── (月初满)</span></span>
<span class="line"><span>            │ ╲</span></span>
<span class="line"><span>            │  ╲ 正常燃烧(发布带来的小事故 + 偶发问题)</span></span>
<span class="line"><span>            │   ╲</span></span>
<span class="line"><span>    50% ────┤    ╲</span></span>
<span class="line"><span>            │     ╲</span></span>
<span class="line"><span>            │      ╲╲╲ 某次大事故,断崖式消耗</span></span>
<span class="line"><span>            │         ╲</span></span>
<span class="line"><span>     0% ────┼──────────╲────── (耗尽)</span></span>
<span class="line"><span>            │           ╲</span></span>
<span class="line"><span>   超支 ────┼            ╲ ← 这里触发政策响应</span></span>
<span class="line"><span>            │             ╲</span></span>
<span class="line"><span>            └──────────────────────────────▶ 时间</span></span>
<span class="line"><span>            月初                          月末</span></span>
<span class="line"><span></span></span>
<span class="line"><span>健康的服务:燃烧曲线平缓 + 月底有余额</span></span>
<span class="line"><span>不健康的服务:断崖式消耗 + 反复超支</span></span></code></pre></div><h3 id="_2-4-错误预算的-政策阶梯" tabindex="-1">2.4 错误预算的&quot;政策阶梯&quot; <a class="header-anchor" href="#_2-4-错误预算的-政策阶梯" aria-label="Permalink to &quot;2.4 错误预算的&quot;政策阶梯&quot;&quot;">​</a></h3><p><strong>这是 SRE Book 里最有价值但最少被认真讲的部分</strong>——错误预算的政策不是&quot;二元&quot;的(停 / 不停),是分阶梯的:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错误预算余额 ── 触发动作</span></span>
<span class="line"><span></span></span>
<span class="line"><span>剩余 &gt; 50%:</span></span>
<span class="line"><span>   ✓ 发布激进:可以做风险变更</span></span>
<span class="line"><span>   ✓ 可以做混沌实验</span></span>
<span class="line"><span>   ✓ 可以做容量压测</span></span>
<span class="line"><span></span></span>
<span class="line"><span>剩余 25% - 50%:</span></span>
<span class="line"><span>   △ 发布保守:只允许小范围、有回滚预案的变更</span></span>
<span class="line"><span>   △ 大变更需要 SRE Lead 签字</span></span>
<span class="line"><span>   △ 混沌实验暂停</span></span>
<span class="line"><span></span></span>
<span class="line"><span>剩余 0% - 25%:</span></span>
<span class="line"><span>   ⚠ 发布冻结:只允许&quot;修复事故&quot;和&quot;安全补丁&quot;</span></span>
<span class="line"><span>   ⚠ 任何新功能上线需 CTO + 产品 + SRE Lead 三方签字</span></span>
<span class="line"><span>   ⚠ 必须在双周会复盘&quot;为什么烧得这么快&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>超支(&lt; 0%):</span></span>
<span class="line"><span>   🔥 强制停发版:除非&quot;修复正在烧的事故&quot;</span></span>
<span class="line"><span>   🔥 升级到事故响应模式</span></span>
<span class="line"><span>   🔥 SRE Lead 有权 veto 所有非紧急变更</span></span>
<span class="line"><span>   🔥 触发跨团队复盘:产品 / 开发 / SRE 谈&quot;我们到底要不要这个 SLO&quot;</span></span></code></pre></div><p><strong>关键不在&quot;哪一档触发什么动作&quot;,而在&quot;这套阶梯是事先和业务方谈好的&quot;</strong>——不是 SRE 出事时单方面宣布。</p><h3 id="_2-5-错误预算-该花在哪" tabindex="-1">2.5 错误预算&quot;该花在哪&quot; <a class="header-anchor" href="#_2-5-错误预算-该花在哪" aria-label="Permalink to &quot;2.5 错误预算&quot;该花在哪&quot;&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>43 分钟错误预算的健康分配:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  ┌─────────────────────────────────────┐</span></span>
<span class="line"><span>  │ 类型              │ 占比 │ 备注     │</span></span>
<span class="line"><span>  ├───────────────────┼──────┼──────────┤</span></span>
<span class="line"><span>  │ 计划内发布事故    │ 40%  │ 17 min   │</span></span>
<span class="line"><span>  │ 计划内压测/混沌   │ 20%  │ 8 min    │</span></span>
<span class="line"><span>  │ 计划内升级/迁移   │ 15%  │ 6 min    │</span></span>
<span class="line"><span>  │ 意外故障          │ 20%  │ 8 min    │</span></span>
<span class="line"><span>  │ 余量              │  5%  │ 2 min    │</span></span>
<span class="line"><span>  └─────────────────────────────────────┘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>如果一个月所有 43 分钟都花在&quot;意外故障&quot;上 = 你没在做工程,你在救火</span></span>
<span class="line"><span>   → 必须停下来,反思&quot;为什么意外这么多&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>如果一个月 0 个意外 + 0 个计划性消耗 = 你的 SLO 定低了</span></span>
<span class="line"><span>   → 把 SLO 往上提一档,把节省的预算用来&quot;敢做激进改进&quot;</span></span></code></pre></div><p><strong>这个表格是 Google 给的&quot;健康分配&quot;概念的中型团队改造版</strong>——意思是错误预算应该被&quot;计划性消耗&quot;占主导,而不是被&quot;意外故障&quot;占满。<strong>如果意外故障吃掉了所有预算,说明根本就没在做 SRE,只是在救火</strong>。</p><h3 id="_2-6-sli-slo-sla-的字母游戏" tabindex="-1">2.6 SLI / SLO / SLA 的字母游戏 <a class="header-anchor" href="#_2-6-sli-slo-sla-的字母游戏" aria-label="Permalink to &quot;2.6 SLI / SLO / SLA 的字母游戏&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>SLI(Service Level Indicator):</span></span>
<span class="line"><span>   = 一个具体测量值</span></span>
<span class="line"><span>   例:HTTP 5xx 率 / P99 延迟 / 请求成功率</span></span>
<span class="line"><span>   = 怎么算的</span></span>
<span class="line"><span></span></span>
<span class="line"><span>SLO(Service Level Objective):</span></span>
<span class="line"><span>   = SLI 的目标值</span></span>
<span class="line"><span>   例:5xx 率 &lt; 0.1% / P99 &lt; 500ms / 成功率 &gt; 99.9%</span></span>
<span class="line"><span>   = 我们要达到什么</span></span>
<span class="line"><span></span></span>
<span class="line"><span>SLA(Service Level Agreement):</span></span>
<span class="line"><span>   = 写进客户合同的承诺(违约要赔钱)</span></span>
<span class="line"><span>   例:99.5% 月度可用,违约按合同金额 10% 赔</span></span>
<span class="line"><span>   = 法律意义上的承诺</span></span>
<span class="line"><span></span></span>
<span class="line"><span>关系:SLA &lt; SLO &lt; 理论极限</span></span>
<span class="line"><span>       │     │</span></span>
<span class="line"><span>       │     └─ 工程目标(为 SLA 留缓冲)</span></span>
<span class="line"><span>       └─ 商业承诺(给客户的)</span></span></code></pre></div><p><strong>最大的常识错误</strong>:SLA = SLO。<strong>这两个数字必须不一样,而且 SLO 必须高于 SLA</strong>——比如客户 SLA 99.5%,你内部 SLO 应该 99.9% 至少。这样的好处是:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>当你的 SLO 99.9% 超支时:</span></span>
<span class="line"><span>   - 内部告警 → 团队开始紧张</span></span>
<span class="line"><span>   - 但 SLA 99.5% 还没违约 → 客户不知道</span></span>
<span class="line"><span>   - 你有缓冲时间修复 → 不会被罚款</span></span>
<span class="line"><span></span></span>
<span class="line"><span>如果 SLO = SLA = 99.5%:</span></span>
<span class="line"><span>   - 内部告警 = 同时客户违约</span></span>
<span class="line"><span>   - 没有任何缓冲时间</span></span>
<span class="line"><span>   - 每次 SLO 烧光就是合同纠纷</span></span></code></pre></div><p><strong>SLI / SLO / SLA 的细节会在第三层(13 篇)展开</strong>,这里只是&quot;知道有这三个层级&quot;,别在合同里写错。</p><hr><h2 id="三、概念-2-toil-机械可重复无长期价值的工作" tabindex="-1">三、概念 2:Toil(机械可重复无长期价值的工作) <a class="header-anchor" href="#三、概念-2-toil-机械可重复无长期价值的工作" aria-label="Permalink to &quot;三、概念 2:Toil(机械可重复无长期价值的工作)&quot;">​</a></h2><p>Toil 是 SRE Book 第 5 章的核心概念,<strong>也是中型团队最容易理解错的</strong>——很多人把&quot;加班&quot;叫 Toil,把&quot;修 bug&quot;叫 Toil,把&quot;看 dashboard&quot;叫 Toil,全错。</p><h3 id="_3-1-toil-的精确定义-sre-book-原文" tabindex="-1">3.1 Toil 的精确定义(SRE Book 原文) <a class="header-anchor" href="#_3-1-toil-的精确定义-sre-book-原文" aria-label="Permalink to &quot;3.1 Toil 的精确定义(SRE Book 原文)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Toil 是同时具备以下特征的工作:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>1. 手工的(Manual)</span></span>
<span class="line"><span>   - 必须人亲手做,不能跑脚本</span></span>
<span class="line"><span>   - 例:每次故障都手动重启 pod</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. 可重复的(Repetitive)</span></span>
<span class="line"><span>   - 这次做完跟下次做的内容几乎一样</span></span>
<span class="line"><span>   - 例:每周清理一次磁盘空间</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. 可自动化的(Automatable)</span></span>
<span class="line"><span>   - 不需要人的判断力,只需要机器执行</span></span>
<span class="line"><span>   - 例:磁盘满了就清,需要的不是判断是触发</span></span>
<span class="line"><span></span></span>
<span class="line"><span>4. 没有长期价值的(No enduring value)</span></span>
<span class="line"><span>   - 做完之后系统状态回到起点,没积累</span></span>
<span class="line"><span>   - 例:重启之后,下次还会挂</span></span>
<span class="line"><span></span></span>
<span class="line"><span>5. 与服务规模线性增长的(Scales with growth)</span></span>
<span class="line"><span>   - 服务规模 *2,这件事也 *2</span></span>
<span class="line"><span>   - 例:每个服务都要手动配 Prometheus 抓取规则</span></span>
<span class="line"><span></span></span>
<span class="line"><span>6. 中断驱动的、被动的(Interrupt-driven, reactive)</span></span>
<span class="line"><span>   - 是被告警 / 工单触发的,不是主动设计的</span></span>
<span class="line"><span>   - 例:有人提工单&quot;扩容&quot;,你才去操作</span></span></code></pre></div><p><strong>所有 6 条特征都满足的才是 Toil</strong>。一条都不满足就不是 Toil。</p><h3 id="_3-2-什么不是-toil-但常被误认" tabindex="-1">3.2 什么不是 Toil(但常被误认) <a class="header-anchor" href="#_3-2-什么不是-toil-但常被误认" aria-label="Permalink to &quot;3.2 什么不是 Toil(但常被误认)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>❌ 修 bug</span></span>
<span class="line"><span>   → &quot;修&quot;是判断 + 创造,有长期价值,不是 Toil</span></span>
<span class="line"><span>   → 但&quot;反复修同一个 bug 的不同表现&quot;是 Toil 的征兆</span></span>
<span class="line"><span></span></span>
<span class="line"><span>❌ Code Review</span></span>
<span class="line"><span>   → 需要判断力,有积累价值(传递经验、防御漏洞)</span></span>
<span class="line"><span>   → 不是 Toil</span></span>
<span class="line"><span></span></span>
<span class="line"><span>❌ 开会</span></span>
<span class="line"><span>   → 不是手工操作,是沟通工作</span></span>
<span class="line"><span>   → 烂会议是浪费,不是 Toil</span></span>
<span class="line"><span></span></span>
<span class="line"><span>❌ 写文档</span></span>
<span class="line"><span>   → 有长期价值</span></span>
<span class="line"><span>   → 不是 Toil(但&quot;写完没人看的文档&quot;是另一种问题)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>❌ 加班</span></span>
<span class="line"><span>   → Toil 跟&quot;加班&quot;是两个维度</span></span>
<span class="line"><span>   → 加班可以全是工程(熬夜写新代码),也可以全是 Toil</span></span>
<span class="line"><span>   → &quot;加班&quot;不是 Toil 的同义词</span></span></code></pre></div><h3 id="_3-3-真正的-toil-长什么样" tabindex="-1">3.3 真正的 Toil 长什么样 <a class="header-anchor" href="#_3-3-真正的-toil-长什么样" aria-label="Permalink to &quot;3.3 真正的 Toil 长什么样&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>我见过的真实 Toil 清单(按消耗时间排序):</span></span>
<span class="line"><span></span></span>
<span class="line"><span>1. 手动扩容(每周 3 次)</span></span>
<span class="line"><span>   告警来了 → 看 dashboard 确认 → kubectl scale → 验证</span></span>
<span class="line"><span>   平均 15 分钟 / 次 = 每周 45 分钟</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. 数据修复脚本(每周 1-2 次)</span></span>
<span class="line"><span>   客服群里有人说&quot;用户 X 的数据不对&quot; → 你登 DB 写 SQL 改</span></span>
<span class="line"><span>   平均 30 分钟 / 次 = 每周 45 分钟</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. 看 Slack / 飞书的 P2 告警没人响应(每天 5 条)</span></span>
<span class="line"><span>   不严重但要看一眼,确认不是真问题 → 标记 resolve</span></span>
<span class="line"><span>   平均 2 分钟 / 次 = 每周 70 分钟</span></span>
<span class="line"><span></span></span>
<span class="line"><span>4. 给新服务配 Prometheus 抓取规则(每月 5 次)</span></span>
<span class="line"><span>   复制粘贴一份模板 → 改 service 名 → 部署 → 验证</span></span>
<span class="line"><span>   平均 20 分钟 / 次 = 每月 100 分钟</span></span>
<span class="line"><span></span></span>
<span class="line"><span>5. 给离职员工 revoke 权限(每月 2 次)</span></span>
<span class="line"><span>   翻一遍系统列表 → 手动改每个系统的权限</span></span>
<span class="line"><span>   平均 30 分钟 / 次 = 每月 60 分钟</span></span>
<span class="line"><span></span></span>
<span class="line"><span>6. 解决 PR review 的 CI 红(每周 3 次)</span></span>
<span class="line"><span>   有人 PR 红了 → 来问你 → 你看一眼是 flaky test → rerun</span></span>
<span class="line"><span>   平均 5 分钟 / 次 = 每周 15 分钟</span></span></code></pre></div><p><strong>加起来一个月 Toil 大概 12-15 小时</strong>——一周 3 小时,占工程时间 7-10%。<strong>这是健康水平</strong>。超过 20% 就要警报了。</p><h3 id="_3-4-怎么测量-toil" tabindex="-1">3.4 怎么测量 Toil <a class="header-anchor" href="#_3-4-怎么测量-toil" aria-label="Permalink to &quot;3.4 怎么测量 Toil&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>最简单的做法:每周自报 Toil 时间</span></span>
<span class="line"><span></span></span>
<span class="line"><span>工程师每周末花 5 分钟,写一个简短列表:</span></span>
<span class="line"><span>   &quot;本周 Toil:</span></span>
<span class="line"><span>    - 手动扩容 3 次 / 共 50 分钟</span></span>
<span class="line"><span>    - 数据修复 1 次 / 共 20 分钟</span></span>
<span class="line"><span>    - 看告警没事 / 共 30 分钟</span></span>
<span class="line"><span>    总计 100 分钟&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>聚合到团队层面:</span></span>
<span class="line"><span>   - 每周 Toil 总分钟 / 团队总工程小时 = Toil 比例</span></span>
<span class="line"><span>   - 这个数字应 &lt; 20%</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Toil &gt; 20% 触发动作:</span></span>
<span class="line"><span>   → 排序 Toil 项,挑&quot;耗时最多 + 自动化最便宜&quot;的</span></span>
<span class="line"><span>   → 拿出一周时间做自动化</span></span>
<span class="line"><span>   → 下周再看 Toil 比例</span></span></code></pre></div><p><strong>关键不在&quot;测得多准&quot;</strong>——10% 误差完全可以。<strong>关键是&quot;有人在记,这就是改进的开始&quot;</strong>。</p><h3 id="_3-5-消灭-toil-的优先级矩阵" tabindex="-1">3.5 消灭 Toil 的优先级矩阵 <a class="header-anchor" href="#_3-5-消灭-toil-的优先级矩阵" aria-label="Permalink to &quot;3.5 消灭 Toil 的优先级矩阵&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌──────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│              │ 自动化便宜          │ 自动化贵           │</span></span>
<span class="line"><span>├──────────────┼─────────────────────┼────────────────────┤</span></span>
<span class="line"><span>│ 次数多       │ ⭐ 第一优先          │ ⚪ 第三优先         │</span></span>
<span class="line"><span>│              │ 一周耗 5 小时        │ 一周耗 5 小时       │</span></span>
<span class="line"><span>│              │ 一天写完自动化       │ 写一个月自动化      │</span></span>
<span class="line"><span>│              │ ROI 极高             │ ROI 看团队规模      │</span></span>
<span class="line"><span>├──────────────┼─────────────────────┼────────────────────┤</span></span>
<span class="line"><span>│ 次数少       │ ⚪ 第二优先          │ ❌ 不做             │</span></span>
<span class="line"><span>│              │ 一周耗 10 分钟       │ 一周耗 10 分钟      │</span></span>
<span class="line"><span>│              │ 半天写完自动化       │ 写一个月自动化      │</span></span>
<span class="line"><span>│              │ 干掉一个算一个       │ 不值,不做          │</span></span>
<span class="line"><span>└──────────────────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>这套矩阵的核心洞察</strong>:<strong>不是所有 Toil 都值得自动化</strong>。次数少 + 自动化贵的 Toil 留着手动做反而是理性选择——花一个月写自动化解决一年 50 分钟的 Toil,<strong>ROI 是负的</strong>。</p><p><strong>一个反例</strong>:某团队为了消灭&quot;每月 2 次离职员工权限回收(每次 30 分钟)&quot;的 Toil,<strong>花了 2 个月写了一套 IAM 自动化系统,bug 不断,反而增加新 Toil</strong>——这是过度工程化。<strong>这种情况下,接受手动是正确的</strong>。</p><h3 id="_3-6-toil-减少的-陷阱-新-toil" tabindex="-1">3.6 Toil 减少的&quot;陷阱&quot;:新 Toil <a class="header-anchor" href="#_3-6-toil-减少的-陷阱-新-toil" aria-label="Permalink to &quot;3.6 Toil 减少的&quot;陷阱&quot;:新 Toil&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>你写了自动化重启脚本,把&quot;手动重启 OOM 的 pod&quot;自动化了</span></span>
<span class="line"><span>   → 老 Toil 消失 ✓</span></span>
<span class="line"><span></span></span>
<span class="line"><span>新 Toil 出现:</span></span>
<span class="line"><span>   → &quot;自动化脚本本身的告警&quot;(脚本失败怎么办)</span></span>
<span class="line"><span>   → &quot;脚本逻辑维护&quot;(场景变了脚本要改)</span></span>
<span class="line"><span>   → &quot;自动化掩盖根因&quot;(没人查为什么 OOM 了)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>净效果可能是:</span></span>
<span class="line"><span>   - 老 Toil 60 min/week 消失</span></span>
<span class="line"><span>   - 新 Toil 30 min/week 出现</span></span>
<span class="line"><span>   - 净减少 30 min,但隐藏了一个慢性病(内存泄漏)</span></span></code></pre></div><p><strong>这就是&quot;04 篇的第 3 个真相&quot;会展开的话题</strong>——自动化不是答案,是工具。<strong>衡量 Toil 减少的真实指标不是&quot;自动化了多少&quot;,是&quot;自动化之后净 Toil 是不是减少了 + 系统是不是更健康了&quot;</strong>。</p><hr><h2 id="四、概念-3-50-工程时间" tabindex="-1">四、概念 3:50% 工程时间 <a class="header-anchor" href="#四、概念-3-50-工程时间" aria-label="Permalink to &quot;四、概念 3:50% 工程时间&quot;">​</a></h2><p>50% 工程时间是 SRE Book 里 Google 给自己定的硬约束——<strong>这是 4 个概念里最被国内团队&quot;误传&quot;的一个</strong>。</p><h3 id="_4-1-google-的原版规则" tabindex="-1">4.1 Google 的原版规则 <a class="header-anchor" href="#_4-1-google-的原版规则" aria-label="Permalink to &quot;4.1 Google 的原版规则&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>SRE 的工作时间分配硬约束:</span></span>
<span class="line"><span>   - 至多 50% 在 Toil(运维、告警响应、工单)</span></span>
<span class="line"><span>   - 至少 50% 在工程(写代码、做工具、做平台)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>超过 50% Toil 触发的动作:</span></span>
<span class="line"><span>   1. SRE 团队给开发团队发&quot;援助请求&quot;</span></span>
<span class="line"><span>      &quot;这个服务的 Toil 我们扛不下了,需要开发协助&quot;</span></span>
<span class="line"><span>   2. 部分 Toil 工作转回开发团队</span></span>
<span class="line"><span>      开发团队不得不暂停新功能,先解决稳定性问题</span></span>
<span class="line"><span>   3. 直到 Toil 比例降回 50% 以下</span></span></code></pre></div><p><strong>这条规则的本质不是&quot;工程师该摸鱼一半时间&quot;,是&quot;运维和开发之间的压力转移机制&quot;</strong>——如果 SRE 一直在救火,开发就要停下来帮忙。这种压力反向传导,<strong>逼着开发写出运维负担更小的代码</strong>。</p><h3 id="_4-2-这条规则在中型团队不能直接抄" tabindex="-1">4.2 这条规则在中型团队不能直接抄 <a class="header-anchor" href="#_4-2-这条规则在中型团队不能直接抄" aria-label="Permalink to &quot;4.2 这条规则在中型团队不能直接抄&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>中型团队的真实约束:</span></span>
<span class="line"><span>   - SRE 编制 1-3 个,没法&quot;团队&quot;层面切 50%</span></span>
<span class="line"><span>   - SRE 和开发不是平等谈判方,&quot;任务回流&quot;做不到</span></span>
<span class="line"><span>   - 没有 Google 那种&quot;开发暂停新功能&quot;的奢侈</span></span>
<span class="line"><span>   - 业务压力一直在,产品经理不允许&quot;50% 摸鱼&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>直接抄的后果:</span></span>
<span class="line"><span>   ✗ SRE 喊&quot;我们要 50% 工程时间&quot;</span></span>
<span class="line"><span>   ✗ 开发听不懂,以为 SRE 想偷懒</span></span>
<span class="line"><span>   ✗ 产品听不懂,以为 SRE 在挑事</span></span>
<span class="line"><span>   ✗ CTO 调和:&quot;按比例处理工作呗,别搞这种政策&quot;</span></span>
<span class="line"><span>   ✗ 50% 规则名存实亡</span></span></code></pre></div><h3 id="_4-3-中型团队的改造版" tabindex="-1">4.3 中型团队的改造版 <a class="header-anchor" href="#_4-3-中型团队的改造版" aria-label="Permalink to &quot;4.3 中型团队的改造版&quot;">​</a></h3><p><strong>改造原则</strong>:把&quot;团队 50% 切割&quot;改成&quot;个人 / 周级别的工程时间保护&quot;。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>改造方案 1:每人每周保留 1 天非告警工程时间</span></span>
<span class="line"><span></span></span>
<span class="line"><span>实施:</span></span>
<span class="line"><span>   - 每周二 或 每周四,某人挂&quot;工程日&quot;标识</span></span>
<span class="line"><span>   - 那一天不接非紧急告警,所有 P2 转给当周 Primary</span></span>
<span class="line"><span>   - 那一天用来做&quot;减少未来 Toil&quot;的工作</span></span>
<span class="line"><span></span></span>
<span class="line"><span>效果:</span></span>
<span class="line"><span>   - 5 人团队,周一到周五各有 1 人在做工程</span></span>
<span class="line"><span>   - 每周保证 5 个工程人日的&quot;消减 Toil&quot;产出</span></span>
<span class="line"><span>   - 一年下来,约 250 工程人日花在&quot;消灭 Toil&quot;上</span></span></code></pre></div><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>改造方案 2:每周 Toil Review</span></span>
<span class="line"><span></span></span>
<span class="line"><span>实施:</span></span>
<span class="line"><span>   - 周五下午 30 分钟,团队过一遍上周 Toil 数据</span></span>
<span class="line"><span>   - 排出&quot;本周最该自动化&quot;的 1-2 项</span></span>
<span class="line"><span>   - 下周分配工程时间去做</span></span>
<span class="line"><span></span></span>
<span class="line"><span>效果:</span></span>
<span class="line"><span>   - Toil 数据被持续审视,不会&quot;忘记&quot;</span></span>
<span class="line"><span>   - 每周有具体改进项,而不是&quot;我们要降低 Toil&quot;的空喊</span></span></code></pre></div><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>改造方案 3:On-call 周后半天恢复</span></span>
<span class="line"><span></span></span>
<span class="line"><span>实施:</span></span>
<span class="line"><span>   - 谁值完一周班,下周一上午自动调休半天</span></span>
<span class="line"><span>   - 下周一下午不安排任何会议</span></span>
<span class="line"><span>   - 让 burnout 在生理层面被缓解</span></span>
<span class="line"><span></span></span>
<span class="line"><span>效果:</span></span>
<span class="line"><span>   - 不是工程时间,但是生理恢复时间</span></span>
<span class="line"><span>   - 大幅降低 On-call 的&quot;心理代价&quot;</span></span></code></pre></div><h3 id="_4-4-什么时候坚决要-动用-50-规则" tabindex="-1">4.4 什么时候坚决要&quot;动用 50% 规则&quot; <a class="header-anchor" href="#_4-4-什么时候坚决要-动用-50-规则" aria-label="Permalink to &quot;4.4 什么时候坚决要&quot;动用 50% 规则&quot;&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>红线 1:某工程师连续 6 个月 Toil &gt; 60%</span></span>
<span class="line"><span>   → burnout 临界,必须强制干预</span></span>
<span class="line"><span>   → 转岗 / 调假 / 招人 三选一</span></span>
<span class="line"><span></span></span>
<span class="line"><span>红线 2:某服务的 Toil 占整个团队 30% 以上</span></span>
<span class="line"><span>   → 这个服务有结构性问题</span></span>
<span class="line"><span>   → 必须立刻停掉那个服务的新功能,做&quot;稳定化项目&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>红线 3:On-call 凌晨告警 &gt; 5 次/周</span></span>
<span class="line"><span>   → 不是&quot;工程师够不够强&quot;,是&quot;系统太脆弱&quot;</span></span>
<span class="line"><span>   → 必须暂停发版,先修底子</span></span>
<span class="line"><span></span></span>
<span class="line"><span>红线 4:同一类事故 3 个月内重复 3 次</span></span>
<span class="line"><span>   → 不是&quot;事故不可避免&quot;,是&quot;根因没修过&quot;</span></span>
<span class="line"><span>   → 强制冻结发布,直到根因修复</span></span></code></pre></div><p><strong>这 4 条红线是底线,任何业务理由都不能绕过</strong>。中型团队的 CTO 必须懂这 4 条——SRE Lead 单独喊喊没用,<strong>必须 CTO 兜底,才能挡住业务压力</strong>。</p><h3 id="_4-5-50-工程时间-的真正灵魂" tabindex="-1">4.5 &quot;50% 工程时间&quot;的真正灵魂 <a class="header-anchor" href="#_4-5-50-工程时间-的真正灵魂" aria-label="Permalink to &quot;4.5 &quot;50% 工程时间&quot;的真正灵魂&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>不是&quot;工程师该有 50% 闲时间&quot;</span></span>
<span class="line"><span>是&quot;组织必须设计一种压力外溢机制</span></span>
<span class="line"><span>   让稳定性问题反向传导到产品 / 开发,</span></span>
<span class="line"><span>   而不是让 SRE 一个人扛&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>中型团队没有 Google 的&quot;任务回流&quot;机制</span></span>
<span class="line"><span>但你必须自己设计一个等价物:</span></span>
<span class="line"><span>   - &quot;工程日&quot;的产出 = 让 SRE 的工程时间不被吃光</span></span>
<span class="line"><span>   - &quot;Toil Review&quot; = 让数据透明,问题不被忽视</span></span>
<span class="line"><span>   - &quot;红线干预&quot; = 让 burnout 不被&quot;打鸡血&quot;掩盖</span></span>
<span class="line"><span>   - &quot;CTO 兜底&quot; = 让稳定性投资有最高层支持</span></span></code></pre></div><hr><h2 id="五、概念-4-黄金信号-golden-signals" tabindex="-1">五、概念 4:黄金信号(Golden Signals) <a class="header-anchor" href="#五、概念-4-黄金信号-golden-signals" aria-label="Permalink to &quot;五、概念 4:黄金信号(Golden Signals)&quot;">​</a></h2><p>黄金信号是 SRE Book 第 6 章的核心——<strong>4 个信号决定了&quot;一个服务是否健康&quot;</strong>。</p><h3 id="_5-1-为什么是这-4-个" tabindex="-1">5.1 为什么是这 4 个 <a class="header-anchor" href="#_5-1-为什么是这-4-个" aria-label="Permalink to &quot;5.1 为什么是这 4 个&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>任何一个服务,对外都可以抽象成:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   ┌─────────────────────────────────┐</span></span>
<span class="line"><span>   │   服务 S                         │</span></span>
<span class="line"><span>   │                                  │</span></span>
<span class="line"><span>   │   接收请求 → 处理 → 返回响应     │</span></span>
<span class="line"><span>   │                                  │</span></span>
<span class="line"><span>   └─────────────────────────────────┘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  从用户视角,服务的&quot;健康&quot;取决于 4 件事:</span></span>
<span class="line"><span>   1. 用户的请求多吗?(Traffic)</span></span>
<span class="line"><span>   2. 用户的请求成功吗?(Errors)</span></span>
<span class="line"><span>   3. 用户的请求快吗?(Latency)</span></span>
<span class="line"><span>   4. 服务还撑得住吗?(Saturation)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  这 4 个加起来,就描述了&quot;用户感知 + 系统状态&quot;</span></span></code></pre></div><p><strong>这 4 个信号的&quot;完整性&quot;——它们一起覆盖了用户视角和系统视角</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>用户视角:Traffic + Errors + Latency</span></span>
<span class="line"><span>   → 用户能感知的所有维度</span></span>
<span class="line"><span>   → 这 3 个都好 = 用户没在抱怨</span></span>
<span class="line"><span></span></span>
<span class="line"><span>系统视角:Saturation</span></span>
<span class="line"><span>   → 用户感知不到但工程师必须看</span></span>
<span class="line"><span>   → 这个差 = 用户开始感知前的预警</span></span></code></pre></div><h3 id="_5-2-为什么不是-7-个-5-个-3-个" tabindex="-1">5.2 为什么不是 7 个 / 5 个 / 3 个 <a class="header-anchor" href="#_5-2-为什么不是-7-个-5-个-3-个" aria-label="Permalink to &quot;5.2 为什么不是 7 个 / 5 个 / 3 个&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>有人主张加&quot;GC time&quot;</span></span>
<span class="line"><span>   → GC 是 Latency 的归因,不是独立信号</span></span>
<span class="line"><span></span></span>
<span class="line"><span>有人主张加&quot;CPU 利用率&quot;</span></span>
<span class="line"><span>   → CPU 是 Saturation 的代理,不是独立信号</span></span>
<span class="line"><span></span></span>
<span class="line"><span>有人主张加&quot;Memory 使用&quot;</span></span>
<span class="line"><span>   → Memory 是 Saturation 的代理</span></span>
<span class="line"><span></span></span>
<span class="line"><span>有人主张加&quot;网络流量&quot;</span></span>
<span class="line"><span>   → 是 Traffic 的下钻</span></span>
<span class="line"><span></span></span>
<span class="line"><span>有人主张减成&quot;RED&quot;:Rate / Errors / Duration</span></span>
<span class="line"><span>   → 这是 4 个里的前 3 个,缺 Saturation</span></span>
<span class="line"><span>   → 适合&quot;服务层&quot;看,不适合&quot;资源层&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>4 个是经过权衡的最小完整集:</span></span>
<span class="line"><span>   - 少于 4 个,会漏维度(尤其漏 Saturation)</span></span>
<span class="line"><span>   - 多于 4 个,信号被稀释(看了反应不过来)</span></span></code></pre></div><p><strong>少即是多——黄金信号的核心价值就是&quot;用最少的信号覆盖最多的维度&quot;</strong>。</p><h3 id="_5-3-黄金-4-信号的具体定义" tabindex="-1">5.3 黄金 4 信号的具体定义 <a class="header-anchor" href="#_5-3-黄金-4-信号的具体定义" aria-label="Permalink to &quot;5.3 黄金 4 信号的具体定义&quot;">​</a></h3><h4 id="_5-3-1-latency-延迟" tabindex="-1">5.3.1 Latency(延迟) <a class="header-anchor" href="#_5-3-1-latency-延迟" aria-label="Permalink to &quot;5.3.1 Latency(延迟)&quot;">​</a></h4><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>不是 avg!不是 avg!不是 avg!</span></span>
<span class="line"><span></span></span>
<span class="line"><span>正确的 Latency 看法:</span></span>
<span class="line"><span>   - p50:中位数,正常请求的体验</span></span>
<span class="line"><span>   - p90:90% 用户低于这个值</span></span>
<span class="line"><span>   - p99:99% 用户低于这个值,长尾用户体验</span></span>
<span class="line"><span>   - p99.9:对慢请求最敏感</span></span>
<span class="line"><span></span></span>
<span class="line"><span>错误的 Latency 看法:</span></span>
<span class="line"><span>   ✗ avg latency 50ms,看着挺好</span></span>
<span class="line"><span>   ✗ 实际:p99 = 5s,1% 用户体验极差</span></span>
<span class="line"><span>   ✗ avg 把这一切都平均掉了</span></span>
<span class="line"><span></span></span>
<span class="line"><span>黄金原则:</span></span>
<span class="line"><span>   ✓ 在 dashboard 上画 p50/p90/p99 三条线</span></span>
<span class="line"><span>   ✓ SLO 用 p99 而不是 avg</span></span>
<span class="line"><span>   ✓ 把 success 和 error 的 latency 分开看</span></span>
<span class="line"><span>     (失败请求往往很快,会拉低 avg,造成假象)</span></span></code></pre></div><p><strong>latency 怎么算见 07 篇(PromQL 实战)的 <code>histogram_quantile</code>,这里只讲心智</strong>。</p><h4 id="_5-3-2-traffic-流量" tabindex="-1">5.3.2 Traffic(流量) <a class="header-anchor" href="#_5-3-2-traffic-流量" aria-label="Permalink to &quot;5.3.2 Traffic(流量)&quot;">​</a></h4><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Traffic 不是&quot;网卡 Mbps&quot;,是&quot;服务自己理解的流量&quot;:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   HTTP 服务:QPS(每秒请求数)</span></span>
<span class="line"><span>   消息系统:每秒消息数 / 每秒事务数</span></span>
<span class="line"><span>   存储系统:每秒读写次数 / 字节数</span></span>
<span class="line"><span>   推送系统:每秒长连接数 / 每秒推送数</span></span>
<span class="line"><span></span></span>
<span class="line"><span>为什么 Traffic 必须画?</span></span>
<span class="line"><span>   - 知道&quot;现在是高峰还是低谷&quot;</span></span>
<span class="line"><span>   - 错误率上升,先看是不是流量也上升(攻击 / 营销)</span></span>
<span class="line"><span>   - 容量规划的输入(20 篇会讲)</span></span></code></pre></div><h4 id="_5-3-3-errors-错误率" tabindex="-1">5.3.3 Errors(错误率) <a class="header-anchor" href="#_5-3-3-errors-错误率" aria-label="Permalink to &quot;5.3.3 Errors(错误率)&quot;">​</a></h4><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Errors 不只是&quot;5xx&quot;:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   类别 1:HTTP 5xx</span></span>
<span class="line"><span>   - 服务器自己报的错</span></span>
<span class="line"><span>   - 最容易抓</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   类别 2:HTTP 4xx</span></span>
<span class="line"><span>   - 客户端错,但有些是&quot;服务的错&quot;</span></span>
<span class="line"><span>   - 例:401(认证失败,可能是 token 服务挂了)</span></span>
<span class="line"><span>   - 例:429(限流,可能是限流配置错了)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   类别 3:HTTP 200 但业务错</span></span>
<span class="line"><span>   - 返回 200,但 body 里 {code: 500, msg: &quot;内部错误&quot;}</span></span>
<span class="line"><span>   - 必须看业务字段,不能只看 HTTP 状态</span></span>
<span class="line"><span>   - **这是最容易漏的一类**</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   类别 4:超时 / 连接拒绝</span></span>
<span class="line"><span>   - 在客户端看是错,在服务端可能没记录</span></span>
<span class="line"><span>   - 必须从客户端视角再看一遍</span></span>
<span class="line"><span></span></span>
<span class="line"><span>黄金原则:</span></span>
<span class="line"><span>   ✓ 错误率定义必须包含上述 4 类</span></span>
<span class="line"><span>   ✓ 不要只看 HTTP 5xx 就声称&quot;无错误&quot;</span></span></code></pre></div><h4 id="_5-3-4-saturation-饱和度" tabindex="-1">5.3.4 Saturation(饱和度) <a class="header-anchor" href="#_5-3-4-saturation-饱和度" aria-label="Permalink to &quot;5.3.4 Saturation(饱和度)&quot;">​</a></h4><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Saturation 是 4 个里最难讲的一个:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>定义:服务&quot;还能承受多少&quot;的剩余裕度</span></span>
<span class="line"><span></span></span>
<span class="line"><span>具体指标(看服务类型):</span></span>
<span class="line"><span>   计算密集:CPU 利用率(&lt; 80% 算健康)</span></span>
<span class="line"><span>   内存密集:内存使用率 / GC 频率</span></span>
<span class="line"><span>   IO 密集:磁盘 IOPS / 网络带宽</span></span>
<span class="line"><span>   并发密集:活跃连接数 / 队列长度</span></span>
<span class="line"><span>   I/O 等待:队列长度(请求堆积是饱和的早期信号)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>为什么 Saturation 是早期信号?</span></span>
<span class="line"><span>   - Errors / Latency 是&quot;已经出事&quot;</span></span>
<span class="line"><span>   - Saturation 是&quot;快出事了&quot;</span></span>
<span class="line"><span>   - 看 Saturation 让你能&quot;在用户感知之前&quot;动作</span></span></code></pre></div><p><strong>实际中,Saturation 最有用的指标是&quot;队列长度&quot;</strong>——所有服务的内部都有队列(线程池队列、连接池队列、消息队列),队列长度 = 系统抗压的实时余量。</p><h3 id="_5-4-黄金信号-vs-red-vs-use" tabindex="-1">5.4 黄金信号 vs RED vs USE <a class="header-anchor" href="#_5-4-黄金信号-vs-red-vs-use" aria-label="Permalink to &quot;5.4 黄金信号 vs RED vs USE&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>RED(Tom Wilkie 提出):</span></span>
<span class="line"><span>   Rate / Errors / Duration</span></span>
<span class="line"><span>   = 黄金 4 信号的前 3 个(没 Saturation)</span></span>
<span class="line"><span>   → 适合&quot;服务层&quot;(为服务画)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>USE(Brendan Gregg 提出):</span></span>
<span class="line"><span>   Utilization / Saturation / Errors</span></span>
<span class="line"><span>   = 黄金 4 信号的资源视角</span></span>
<span class="line"><span>   → 适合&quot;资源层&quot;(为机器 / DB / 网络画)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>黄金 4 信号 = RED + Saturation</span></span>
<span class="line"><span>            = 服务层 + 资源层的统一框架</span></span>
<span class="line"><span></span></span>
<span class="line"><span>实践:</span></span>
<span class="line"><span>   - 服务的 dashboard 用 RED + Saturation = 黄金 4 信号</span></span>
<span class="line"><span>   - 资源的 dashboard 用 USE</span></span>
<span class="line"><span>   - 两者覆盖完整</span></span></code></pre></div><p><strong>14 篇会展开 RED / USE 各自怎么具体落地</strong>,这里只是&quot;知道有这两个框架,它们和黄金信号是什么关系&quot;。</p><h3 id="_5-5-黄金信号的-dashboard-模板" tabindex="-1">5.5 黄金信号的 dashboard 模板 <a class="header-anchor" href="#_5-5-黄金信号的-dashboard-模板" aria-label="Permalink to &quot;5.5 黄金信号的 dashboard 模板&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>一个标准的&quot;服务 dashboard&quot;应该长这样:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  ┌─────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>  │  服务名 + 当前 SLO 状态(健康 / 警告 / 燃烧中)         │</span></span>
<span class="line"><span>  ├─────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>  │  Traffic                                            │</span></span>
<span class="line"><span>  │  [QPS 时间序列图,带过去一周对比]                     │</span></span>
<span class="line"><span>  ├─────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>  │  Latency                                            │</span></span>
<span class="line"><span>  │  [p50/p90/p99 三条线,带 SLO 阈值线]                 │</span></span>
<span class="line"><span>  ├─────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>  │  Errors                                             │</span></span>
<span class="line"><span>  │  [按类别堆叠:5xx / 4xx(异常)/ 业务错 / 超时]         │</span></span>
<span class="line"><span>  ├─────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>  │  Saturation                                         │</span></span>
<span class="line"><span>  │  [CPU + 内存 + 队列长度 + 连接数 多图同屏]            │</span></span>
<span class="line"><span>  └─────────────────────────────────────────────────────┘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  这个模板的精髓:</span></span>
<span class="line"><span>  - 一屏看完</span></span>
<span class="line"><span>  - 4 个信号一目了然</span></span>
<span class="line"><span>  - SLO 阈值线让&quot;健康 / 不健康&quot;一眼可读</span></span>
<span class="line"><span>  - 不堆 50 个 panel,只放真正关键的 4 个</span></span></code></pre></div><p><strong>16 篇(仪表盘工程)会展开&quot;为什么不要堆 50 个 panel&quot;——堆 panel 等于没看</strong>。</p><hr><h2 id="六、哪些直接抄-哪些必须改-哪些千万别学" tabindex="-1">六、哪些直接抄,哪些必须改,哪些千万别学 <a class="header-anchor" href="#六、哪些直接抄-哪些必须改-哪些千万别学" aria-label="Permalink to &quot;六、哪些直接抄,哪些必须改,哪些千万别学&quot;">​</a></h2><p>这一节是这一篇的重头戏——把上面 4 个概念翻译成&quot;中型团队的执行清单&quot;。</p><h3 id="_6-1-可以直接抄的-改一改字段就能用" tabindex="-1">6.1 可以直接抄的(改一改字段就能用) <a class="header-anchor" href="#_6-1-可以直接抄的-改一改字段就能用" aria-label="Permalink to &quot;6.1 可以直接抄的(改一改字段就能用)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>✓ 错误预算的&quot;算术&quot;</span></span>
<span class="line"><span>  - SLO 99.x% → 月度 X 分钟错误预算</span></span>
<span class="line"><span>  - 这套算术是数学,所有团队都通用</span></span>
<span class="line"><span>  - 改的是 SLO 的具体数字,不是算法</span></span>
<span class="line"><span></span></span>
<span class="line"><span>✓ Toil 的&quot;6 条特征定义&quot;</span></span>
<span class="line"><span>  - 这 6 条是定义,任何团队都成立</span></span>
<span class="line"><span>  - 用它当周报 Toil 自报的判定标准</span></span>
<span class="line"><span></span></span>
<span class="line"><span>✓ 黄金 4 信号的&quot;心智模型&quot;</span></span>
<span class="line"><span>  - Latency / Traffic / Errors / Saturation</span></span>
<span class="line"><span>  - 这 4 个维度对所有服务都通用</span></span>
<span class="line"><span>  - 改的是每个信号的具体指标(QPS 还是消息数)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>✓ Blameless Postmortem 的&quot;格式&quot;</span></span>
<span class="line"><span>  - 时间线 / 影响 / 根因 / 行动项</span></span>
<span class="line"><span>  - 这个模板可以直接用(33 篇会展开)</span></span></code></pre></div><h3 id="_6-2-必须改造的-原版直接用会翻车" tabindex="-1">6.2 必须改造的(原版直接用会翻车) <a class="header-anchor" href="#_6-2-必须改造的-原版直接用会翻车" aria-label="Permalink to &quot;6.2 必须改造的(原版直接用会翻车)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>△ 错误预算的&quot;政策响应&quot;</span></span>
<span class="line"><span>  原版:超支 → 停发版</span></span>
<span class="line"><span>  改造:超支 → 阶梯响应(警告 → 限制 → 冻结 → 升级)</span></span>
<span class="line"><span>  原因:中型团队的业务方&quot;接受不了硬停发版&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>△ 50% 工程时间</span></span>
<span class="line"><span>  原版:SRE 团队层面切 50%,超过就任务回流</span></span>
<span class="line"><span>  改造:每人每周保 1 天工程日 + 每周 Toil Review</span></span>
<span class="line"><span>  原因:中型团队没有&quot;任务回流&quot;的组织支撑</span></span>
<span class="line"><span></span></span>
<span class="line"><span>△ Toil 自动化的&quot;普遍优先&quot;</span></span>
<span class="line"><span>  原版:所有 Toil 都要自动化</span></span>
<span class="line"><span>  改造:用 ROI 矩阵筛(次数多 + 自动化便宜的先做)</span></span>
<span class="line"><span>  原因:中型团队工程人力稀缺,不能花一个月写 ROI 负的自动化</span></span>
<span class="line"><span></span></span>
<span class="line"><span>△ SLO 的&quot;细粒度&quot;</span></span>
<span class="line"><span>  原版:每个服务一份 SLO</span></span>
<span class="line"><span>  改造:核心服务有 SLO,边缘服务用 SLI 看,实验服务无 SLO</span></span>
<span class="line"><span>  原因:100 个微服务定 100 份 SLO 没人能维护</span></span>
<span class="line"><span></span></span>
<span class="line"><span>△ On-call 的&quot;全员轮值&quot;</span></span>
<span class="line"><span>  原版:每个 SRE 都轮 7x24</span></span>
<span class="line"><span>  改造:看业务场景,白天值 + 夜间 P0 only 也可以</span></span>
<span class="line"><span>  原因:中型团队没有那么多人也没有那么严的 SLA</span></span></code></pre></div><h3 id="_6-3-千万别学的-google-内部专属" tabindex="-1">6.3 千万别学的(Google 内部专属) <a class="header-anchor" href="#_6-3-千万别学的-google-内部专属" aria-label="Permalink to &quot;6.3 千万别学的(Google 内部专属)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>✗ Google 全球流量调度</span></span>
<span class="line"><span>  - GFE / B4 / Andromeda 这些组件</span></span>
<span class="line"><span>  - 你不在 Google,搬过来没意义</span></span>
<span class="line"><span></span></span>
<span class="line"><span>✗ Borgmon / Monarch 自研</span></span>
<span class="line"><span>  - Google 内部的监控系统</span></span>
<span class="line"><span>  - 用 Prometheus / VictoriaMetrics 就够了</span></span>
<span class="line"><span>  - 自研代价 10 人年,中型团队烧不起</span></span>
<span class="line"><span></span></span>
<span class="line"><span>✗ 大规模 SRE 团队设计</span></span>
<span class="line"><span>  - Google 一个 SRE 团队 30-50 人</span></span>
<span class="line"><span>  - 你 5 人团队学不来组织设计</span></span>
<span class="line"><span></span></span>
<span class="line"><span>✗ &quot;Bug Bash Day&quot;全员一天找 bug</span></span>
<span class="line"><span>  - Google 才有这种&quot;全员暂停业务&quot;的奢侈</span></span>
<span class="line"><span>  - 中型团队产品压力不允许</span></span>
<span class="line"><span></span></span>
<span class="line"><span>✗ &quot;SRE Lead 拥有发布否决权&quot;</span></span>
<span class="line"><span>  - 没 CTO 兜底,这种否决权在中型团队是给 SRE Lead 招黑</span></span>
<span class="line"><span></span></span>
<span class="line"><span>✗ &quot;完全标准化的 SLI 计算口径&quot;</span></span>
<span class="line"><span>  - Google 内部有统一框架,中型团队没人写</span></span>
<span class="line"><span>  - 与其追求&quot;标准&quot;,不如先把核心服务的 SLO 定起来</span></span></code></pre></div><h3 id="_6-4-这套规则的元规则" tabindex="-1">6.4 这套规则的元规则 <a class="header-anchor" href="#_6-4-这套规则的元规则" aria-label="Permalink to &quot;6.4 这套规则的元规则&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>判断&quot;该不该抄&quot;的元规则:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>问 1:这个做法依赖什么前提?</span></span>
<span class="line"><span>  - 前提在中型团队成立 → 可以抄</span></span>
<span class="line"><span>  - 前提不成立 → 必须改或不学</span></span>
<span class="line"><span></span></span>
<span class="line"><span>问 2:这个做法的 ROI 在中型规模下如何?</span></span>
<span class="line"><span>  - ROI 正 → 抄</span></span>
<span class="line"><span>  - ROI 负 → 不抄(再先进也不抄)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>问 3:这个做法的&quot;政治资本&quot;我有吗?</span></span>
<span class="line"><span>  - 有(CTO 支持 / 业务方愿意配合)→ 抄</span></span>
<span class="line"><span>  - 没有 → 改造成&quot;软&quot;的版本或不做</span></span>
<span class="line"><span></span></span>
<span class="line"><span>问 4:这个做法和我团队当前主要问题相关吗?</span></span>
<span class="line"><span>  - 相关 → 优先抄</span></span>
<span class="line"><span>  - 不相关 → 后面再说</span></span></code></pre></div><p><strong>SRE 不是&quot;做得越像 Google 越好&quot;,是&quot;做到适合自己团队规模&quot;——这个判断本身就是 SRE 工程的一部分</strong>。</p><hr><h2 id="七、本篇的实战配置示例" tabindex="-1">七、本篇的实战配置示例 <a class="header-anchor" href="#七、本篇的实战配置示例" aria-label="Permalink to &quot;七、本篇的实战配置示例&quot;">​</a></h2><p>讲了 4 个概念,<strong>这一节给一些可以直接落地的&quot;工程产物&quot;</strong>——把概念变成代码 / 配置。</p><h3 id="_7-1-错误预算的-promql-计算" tabindex="-1">7.1 错误预算的 PromQL 计算 <a class="header-anchor" href="#_7-1-错误预算的-promql-计算" aria-label="Permalink to &quot;7.1 错误预算的 PromQL 计算&quot;">​</a></h3><div class="language-promql vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">promql</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># 假设有指标:http_requests_total{status, service}</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 1. 计算当前月的成功率(滚动 30 天)</span></span>
<span class="line"><span>sum(rate(http_requests_total{service=&quot;api&quot;, status!~&quot;5..&quot;}[30d]))</span></span>
<span class="line"><span>/</span></span>
<span class="line"><span>sum(rate(http_requests_total{service=&quot;api&quot;}[30d]))</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 2. 计算错误预算消耗比例(SLO = 99.9%)</span></span>
<span class="line"><span>1 - (</span></span>
<span class="line"><span>  sum(rate(http_requests_total{service=&quot;api&quot;, status!~&quot;5..&quot;}[30d]))</span></span>
<span class="line"><span>  /</span></span>
<span class="line"><span>  sum(rate(http_requests_total{service=&quot;api&quot;}[30d]))</span></span>
<span class="line"><span>) / 0.001</span></span>
<span class="line"><span># 结果是 0-1 之间,1.0 表示完全耗尽,&gt; 1.0 表示超支</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 3. 计算剩余错误预算(分钟)</span></span>
<span class="line"><span>43.2 * (1 - 上面那个表达式)</span></span></code></pre></div><p>**这套 PromQL 写完接到 Grafana,**就是错误预算的实时燃烧图。<strong>别只看&quot;成功率&quot;,要看&quot;错误预算消耗速度&quot;——后者是 SLO 工程的核心指标</strong>。</p><h3 id="_7-2-toil-自报的周报模板" tabindex="-1">7.2 Toil 自报的周报模板 <a class="header-anchor" href="#_7-2-toil-自报的周报模板" aria-label="Permalink to &quot;7.2 Toil 自报的周报模板&quot;">​</a></h3><div class="language-markdown vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">markdown</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">## 本周 Toil 自报(姓名 / 周次)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">### Toil 总时间:XX 分钟</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">| 类型 | 次数 | 单次耗时 | 总耗时 | 备注 |</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">|------|------|----------|--------|------|</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">| 手动扩容 | 3 | 15 min | 45 min | 某下游 RPC 突增 |</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">| 数据修复 | 1 | 30 min | 30 min | 某客户数据脏 |</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">| P2 告警确认 | 8 | 3 min | 24 min | 大多 flaky |</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">| 给新服务配 Prometheus | 1 | 25 min | 25 min | 复制模板 |</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">### 本周 Toil 比例:124 / (5 * 8 * 60) = 5.2%</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">### 可消除的(下周改进):</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 手动扩容 → HPA 配好就消失(下周一做)</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> P2 告警 → 多数是 flaky,下周改阈值</span></span></code></pre></div><p><strong>全团队这么记,每周末 PM 在 Slack 发一个汇总</strong>——这就是&quot;50% 工程时间&quot;在中型团队的可执行版本。</p><h3 id="_7-3-黄金-4-信号的-grafana-模板-简化" tabindex="-1">7.3 黄金 4 信号的 Grafana 模板(简化) <a class="header-anchor" href="#_7-3-黄金-4-信号的-grafana-模板-简化" aria-label="Permalink to &quot;7.3 黄金 4 信号的 Grafana 模板(简化)&quot;">​</a></h3><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 一个服务的最简 Grafana dashboard,4 个 panel</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">panels</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">title</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;Traffic (QPS)&quot;</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    targets</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">expr</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;sum(rate(http_requests_total{service=&quot;$service&quot;}[1m]))&#39;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">title</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;Latency (p50/p90/p99)&quot;</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    targets</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">expr</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;histogram_quantile(0.50, sum(rate(http_duration_seconds_bucket{service=&quot;$service&quot;}[5m])) by (le))&#39;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">expr</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;histogram_quantile(0.90, sum(rate(http_duration_seconds_bucket{service=&quot;$service&quot;}[5m])) by (le))&#39;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">expr</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;histogram_quantile(0.99, sum(rate(http_duration_seconds_bucket{service=&quot;$service&quot;}[5m])) by (le))&#39;</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # SLO 阈值线</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    thresholds</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">value</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">0.5</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  # 500ms</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        colorMode</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">critical</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">title</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;Errors&quot;</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    targets</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">expr</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;sum(rate(http_requests_total{service=&quot;$service&quot;, status=~&quot;5..&quot;}[1m])) by (status)&#39;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">expr</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;sum(rate(business_errors_total{service=&quot;$service&quot;}[1m]))&#39;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">title</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;Saturation&quot;</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    targets</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">expr</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;avg(container_cpu_usage_seconds_total{pod=~&quot;$service-.*&quot;}) by (pod)&#39;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">expr</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;avg(go_goroutines{service=&quot;$service&quot;})&#39;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">expr</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;avg(http_request_queue_length{service=&quot;$service&quot;})&#39;</span></span></code></pre></div><p><strong>这就是一个微服务的&quot;最小黄金 4 信号&quot;dashboard</strong>。复用这个模板,100 个服务 100 张 dashboard 不是负担——参数化 <code>$service</code> 一份模板搞定。</p><hr><h2 id="八、踩坑提醒" tabindex="-1">八、踩坑提醒 <a class="header-anchor" href="#八、踩坑提醒" aria-label="Permalink to &quot;八、踩坑提醒&quot;">​</a></h2><ol><li><strong>错误预算 = 用完停发版</strong>——是阶梯响应,不是二元开关</li><li><strong>SLA = SLO</strong>——SLO 必须高于 SLA,留缓冲</li><li><strong>Toil 包括修 bug</strong>——修 bug 是工程,不是 Toil</li><li><strong>50% 时间是&quot;个人切割&quot;</strong>——是组织设计,不是个人摸鱼合法化</li><li><strong>黄金 4 信号 = 4 个 dashboard</strong>——是心智模型,没 SLO 兜底就是装饰</li><li><strong>Latency 用 avg</strong>——必须用 p99,avg 骗人</li><li><strong>Errors 只看 5xx</strong>——业务错 / 4xx 异常 / 超时都得算</li><li><strong>Saturation 只看 CPU</strong>——队列长度 / 连接数才是早期信号</li><li><strong>照搬 Google 全套</strong>——前提条件不一样,选择性抄</li><li><strong>Toil 自动化不算 ROI</strong>——花一个月写自动化解决一年 50 分钟 Toil 是亏的</li><li><strong>错误预算只算不响应</strong>——只看不动作,等于没定 SLO</li><li><strong>黄金信号每个团队定义不同</strong>——必须先统一&quot;什么算 Errors&quot;,再画 dashboard</li></ol><hr><h2 id="九、本篇的硬指标" tabindex="-1">九、本篇的硬指标 <a class="header-anchor" href="#九、本篇的硬指标" aria-label="Permalink to &quot;九、本篇的硬指标&quot;">​</a></h2><p>看完这一篇,你应该能在白板前讲清楚:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>□ SLO 99.9% 对应一个月多少分钟错误预算(43 分钟)</span></span>
<span class="line"><span>□ SLI / SLO / SLA 的差别,为什么 SLA 不能等于 SLO</span></span>
<span class="line"><span>□ Toil 的 6 条精确定义,为什么&quot;修 bug&quot;不是 Toil</span></span>
<span class="line"><span>□ Google 的 50% 规则在中型团队怎么改造(3 个具体方案)</span></span>
<span class="line"><span>□ 黄金 4 信号是哪 4 个,为什么不是 7 个</span></span>
<span class="line"><span>□ Latency 为什么不能看 avg(用 p99 + 用 SLO 阈值线)</span></span>
<span class="line"><span>□ 哪些 Google 做法直接抄,哪些必须改,哪些别学</span></span></code></pre></div><p>并且能给自己团队<strong>做出 4 件具体动作</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 给核心服务定 SLO + 算出月度错误预算</span></span>
<span class="line"><span>2. 给团队建一份 Toil 自报模板</span></span>
<span class="line"><span>3. 设计一份&quot;错误预算阶梯响应&quot;政策</span></span>
<span class="line"><span>4. 给至少一个核心服务做一个黄金 4 信号 dashboard</span></span></code></pre></div><p><strong>做完这 4 件事,你团队的 SRE 工程就有了骨架——剩下的 32 篇就是把每根骨头补上肌肉</strong>。</p><hr><p>下一篇:<strong><code>03-可观测性是什么.md</code></strong>——这一篇讲 SRE 的&quot;概念骨架&quot;,下一篇讲这套骨架最重要的能力——<strong>可观测性</strong>。Monitoring 和 Observability 的本质差别,Metrics / Logs / Traces 三件套各自擅长什么,<strong>为什么&quot;加一个 user_id label 让 Prometheus 挂掉&quot;是真实事故</strong>,以及可观测性的 3 个心智:<strong>能定位故障 / 能解释为什么 / 能预测下次</strong>。这一篇是第二层(可观测性 8 篇)的&quot;入门票&quot;,看完这一篇再去看 Prometheus / PromQL / OTel 才看得懂。</p>`,136)])])}const g=a(i,[["render",e]]);export{d as __pageData,g as default};
