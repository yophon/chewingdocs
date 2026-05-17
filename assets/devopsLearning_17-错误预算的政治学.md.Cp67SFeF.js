import{c as n,Q as a,j as p,m as l}from"./chunks/framework.CBiVa4O3.js";const d=JSON.parse('{"title":"错误预算的政治学:超支了怎么办 / 谁来踩刹车 / 跟产品怎么吵","description":"","frontmatter":{},"headers":[],"relativePath":"../devopsLearning/17-错误预算的政治学.md","filePath":"../devopsLearning/17-错误预算的政治学.md","lastUpdated":1778496697000}'),i={name:"../devopsLearning/17-错误预算的政治学.md"};function e(t,s,o,c,h,u){return a(),p("div",null,[...s[0]||(s[0]=[l(`<h1 id="错误预算的政治学-超支了怎么办-谁来踩刹车-跟产品怎么吵" tabindex="-1">错误预算的政治学:超支了怎么办 / 谁来踩刹车 / 跟产品怎么吵 <a class="header-anchor" href="#错误预算的政治学-超支了怎么办-谁来踩刹车-跟产品怎么吵" aria-label="Permalink to &quot;错误预算的政治学:超支了怎么办 / 谁来踩刹车 / 跟产品怎么吵&quot;">​</a></h1><p>13 篇定 SLO,14 篇看 RED+USE,15 篇配 multi-burn-rate 告警,16 篇画 dashboard。<strong>到这里 SLO 工程层&quot;技术部分&quot;完结</strong>——但每个做过 SLO 的 SRE 都知道,<strong>真正难的不是算术,是政治</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>SLO 0.1% 错误预算超支了 → 工程的回答是&quot;该停发布&quot;</span></span>
<span class="line"><span>                       → 产品的回答是&quot;下周必须上&quot;</span></span>
<span class="line"><span>                       → 你说什么?</span></span></code></pre></div><p>这一刻,前面 16 篇的工程功底全失效——<strong>不是因为技术不够,是因为没有政策、没有授权、没有商业语言</strong>。这一篇要讲的,<strong>不是怎么算预算,而是怎么把&quot;我们应该停发布&quot;变成一个公司层面的、产品 PM 也得遵守的协议</strong>。</p><blockquote><p>一句话先记住:<strong>错误预算不是技术指标,是工程师跟产品的&quot;和约&quot;</strong>——和约的核心条款是&quot;超过预算谁踩刹车&quot;。这条款不写下来,<strong>错误预算就是一个 Grafana 上很漂亮的数字、和实际决策毫无关系</strong>。我见过 90% 的团队卡在这里:SLO 文档写了 30 页,<strong>告警一响产品一句&quot;客户在催&quot;就给上线</strong>——这种 SLO 等于不存在。这一篇就是给那剩下 10% 真正能用上 SLO 的团队看的——<strong>核心是政策(policy),不是算术(math)</strong>。</p></blockquote><hr><h2 id="一、问题场景-错误预算超支后-典型的-4-个反应" tabindex="-1">一、问题场景:错误预算超支后,典型的 4 个反应 <a class="header-anchor" href="#一、问题场景-错误预算超支后-典型的-4-个反应" aria-label="Permalink to &quot;一、问题场景:错误预算超支后,典型的 4 个反应&quot;">​</a></h2><h3 id="_1-1-反应-a-工程师-温柔劝说-产品-客户在催" tabindex="-1">1.1 反应 A:工程师&quot;温柔劝说&quot;,产品&quot;客户在催&quot; <a class="header-anchor" href="#_1-1-反应-a-工程师-温柔劝说-产品-客户在催" aria-label="Permalink to &quot;1.1 反应 A:工程师&quot;温柔劝说&quot;,产品&quot;客户在催&quot;&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错误预算消耗 80%(还有 20%)</span></span>
<span class="line"><span>SRE:&quot;我们这个月预算紧张,是不是发布慢一点?&quot;</span></span>
<span class="line"><span>PM:&quot;客户答应了下周三上,营销都准备好了&quot;</span></span>
<span class="line"><span>SRE:&quot;那预算可能要烧穿&quot;</span></span>
<span class="line"><span>PM:&quot;烧穿了多大事?&quot;</span></span>
<span class="line"><span>SRE:&quot;按合同我们承诺 99.9%,违约会赔钱&quot;</span></span>
<span class="line"><span>PM:&quot;那也是销售的问题,先上&quot;</span></span>
<span class="line"><span>SRE:&quot;...&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>结果:照常上,错误预算超支</span></span>
<span class="line"><span>1 个月后:同样的对话,SRE 失去了第二次否决权</span></span>
<span class="line"><span>3 个月后:SLO 文档变成摆设</span></span></code></pre></div><h3 id="_1-2-反应-b-sre-单方面阻止-被绕过" tabindex="-1">1.2 反应 B:SRE 单方面阻止,被绕过 <a class="header-anchor" href="#_1-2-反应-b-sre-单方面阻止-被绕过" aria-label="Permalink to &quot;1.2 反应 B:SRE 单方面阻止,被绕过&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错误预算超支 → SRE 在 CI 加了&quot;超支不让合&quot;的 gate</span></span>
<span class="line"><span>某天 PM 直接找 CTO:&quot;SRE 卡我上线,客户要疯了&quot;</span></span>
<span class="line"><span>CTO:&quot;先放行,SLO 的事下次再讨论&quot;</span></span>
<span class="line"><span>SRE 的 gate 被人为绕过</span></span>
<span class="line"><span>                                </span></span>
<span class="line"><span>3 个月后:再没人尊重那个 gate</span></span></code></pre></div><h3 id="_1-3-反应-c-sre-默默忍受-burnout" tabindex="-1">1.3 反应 C:SRE 默默忍受,burnout <a class="header-anchor" href="#_1-3-反应-c-sre-默默忍受-burnout" aria-label="Permalink to &quot;1.3 反应 C:SRE 默默忍受,burnout&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>SRE 看着预算烧穿,但不知道怎么说</span></span>
<span class="line"><span>继续配告警、扛 on-call、写 runbook</span></span>
<span class="line"><span>3 个月后:开发把锅都甩 SRE</span></span>
<span class="line"><span>6 个月后:SRE 离职,留下&quot;系统又一次没人懂&quot;的烂摊子</span></span></code></pre></div><h3 id="_1-4-反应-d-有政策-理性博弈" tabindex="-1">1.4 反应 D:有政策,理性博弈 <a class="header-anchor" href="#_1-4-反应-d-有政策-理性博弈" aria-label="Permalink to &quot;1.4 反应 D:有政策,理性博弈&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错误预算消耗 80%(还剩 20%)</span></span>
<span class="line"><span>   ↓ 触发预设政策</span></span>
<span class="line"><span>   &quot;20-50% 预算:降发布频率,只允许必要发布&quot;</span></span>
<span class="line"><span>SRE 把规则贴出来:&quot;按上次和大家签字的政策,</span></span>
<span class="line"><span>                  现在只允许 P0 bug fix,</span></span>
<span class="line"><span>                  feature 推到下个周期&quot;</span></span>
<span class="line"><span>PM 想吵:&quot;客户答应了&quot;</span></span>
<span class="line"><span>SRE 拿出政策:&quot;这是产品 + SRE + CTO 三方签的版本,</span></span>
<span class="line"><span>              要破例必须 CTO 批准&quot;</span></span>
<span class="line"><span>PM 找 CTO:&quot;批一下吧?&quot;</span></span>
<span class="line"><span>CTO 拿出政策:&quot;批可以,这次破例算我同意。</span></span>
<span class="line"><span>              但是月底总结里要算我一次&quot;</span></span>
<span class="line"><span>PM:&quot;......&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>结果:大多数情况下 PM 不去找 CTO 破例(成本太高)</span></span>
<span class="line"><span>     真有商业必要时,破例走流程,系统能修正</span></span>
<span class="line"><span>     政策成了&quot;自动机制&quot;,不靠每次吵架</span></span></code></pre></div><p><strong>反应 D 是这一篇的目标终态</strong>。怎么从 ABC 走到 D?<strong>核心是写下来一份&quot;错误预算政策&quot;</strong>——这是这一篇的核心交付物。</p><hr><h2 id="二、为什么-错误预算-工程与产品的和约" tabindex="-1">二、为什么&quot;错误预算 = 工程与产品的和约&quot; <a class="header-anchor" href="#二、为什么-错误预算-工程与产品的和约" aria-label="Permalink to &quot;二、为什么&quot;错误预算 = 工程与产品的和约&quot;&quot;">​</a></h2><h3 id="_2-1-工程师视角和产品视角的对立" tabindex="-1">2.1 工程师视角和产品视角的对立 <a class="header-anchor" href="#_2-1-工程师视角和产品视角的对立" aria-label="Permalink to &quot;2.1 工程师视角和产品视角的对立&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                  工程师视角           产品视角</span></span>
<span class="line"><span>                 ─────────────       ──────────</span></span>
<span class="line"><span>SLO 是什么       承诺 + 底线          营销说辞</span></span>
<span class="line"><span>预算超支         必须停手             &quot;再加把劲就行&quot;</span></span>
<span class="line"><span>质量 vs 速度     不能为速度牺牲质量    速度优先,质量持平就行</span></span>
<span class="line"><span>&quot;再发一次&quot;      违约风险              客户要,商业要</span></span>
<span class="line"><span>延期发布         合理                  机会成本</span></span></code></pre></div><p><strong>这两套视角都不能算错</strong>——SRE 太严格会拖 KPI,PM 太激进会出事故。<strong>错误预算就是把&quot;什么时候该谁说了算&quot;用数字写清楚</strong>。</p><h3 id="_2-2-错误预算的-立法权" tabindex="-1">2.2 错误预算的&quot;立法权&quot; <a class="header-anchor" href="#_2-2-错误预算的-立法权" aria-label="Permalink to &quot;2.2 错误预算的&quot;立法权&quot;&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>没错误预算政策:</span></span>
<span class="line"><span>   ┌──────────────┐    ┌──────────────┐</span></span>
<span class="line"><span>   │  工程师       │ ←→ │   产品        │</span></span>
<span class="line"><span>   │  &quot;我觉得该停&quot; │    │ &quot;我觉得该上&quot;   │</span></span>
<span class="line"><span>   └──────────────┘    └──────────────┘</span></span>
<span class="line"><span>   每次吵架都是&quot;个人意见对个人意见&quot;</span></span>
<span class="line"><span>   声大者赢,工程师永远输</span></span>
<span class="line"><span></span></span>
<span class="line"><span>有错误预算政策:</span></span>
<span class="line"><span>   ┌──────────────┐    ┌──────────────┐</span></span>
<span class="line"><span>   │  工程师       │    │   产品        │</span></span>
<span class="line"><span>   └───────┬──────┘    └──────┬───────┘</span></span>
<span class="line"><span>           │                   │</span></span>
<span class="line"><span>           └────────┬──────────┘</span></span>
<span class="line"><span>                   ▼</span></span>
<span class="line"><span>          ┌────────────────┐</span></span>
<span class="line"><span>          │  错误预算政策   │ ← 第三方:CTO + 工程 + 产品三方签字</span></span>
<span class="line"><span>          │  (写下来的)    │</span></span>
<span class="line"><span>          └────────────────┘</span></span>
<span class="line"><span>                   ↓</span></span>
<span class="line"><span>          政策说停,大家都停</span></span>
<span class="line"><span>          政策说上,大家都上</span></span>
<span class="line"><span>          要破例,走升级流程(成本高)</span></span></code></pre></div><p><strong>这才是错误预算的真正价值</strong>——它把&quot;个人意见&quot;升级成&quot;政策&quot;,把&quot;声大者赢&quot;变成&quot;规则裁判&quot;。</p><h3 id="_2-3-政策的政治学-为什么必须事先签字" tabindex="-1">2.3 政策的政治学:为什么必须事先签字 <a class="header-anchor" href="#_2-3-政策的政治学-为什么必须事先签字" aria-label="Permalink to &quot;2.3 政策的政治学:为什么必须事先签字&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>事后吵:</span></span>
<span class="line"><span>   预算超了 → SRE 想停 → PM 不同意</span></span>
<span class="line"><span>   → 现场吵架 → CTO 临时拍板 → 工程师永远输</span></span>
<span class="line"><span></span></span>
<span class="line"><span>事先签:</span></span>
<span class="line"><span>   预算还没烧 → 大家平静地写下规则 → 三方签</span></span>
<span class="line"><span>   → 真到超时 → 按规则办 → 不需要现场争论</span></span>
<span class="line"><span>   → CTO 已经签过了 → 想破例他自己有压力</span></span>
<span class="line"><span></span></span>
<span class="line"><span>哲学:利益冲突时不能等冲突来,要在没冲突时定规则</span></span></code></pre></div><p><strong>这就是为什么 SLO 政策必须在&quot;风平浪静&quot;时写,不能等出事才写</strong>——出事的时候,谁也写不出公平政策。</p><hr><h2 id="三、错误预算政策-error-budget-policy-模板" tabindex="-1">三、错误预算政策(Error Budget Policy)模板 <a class="header-anchor" href="#三、错误预算政策-error-budget-policy-模板" aria-label="Permalink to &quot;三、错误预算政策(Error Budget Policy)模板&quot;">​</a></h2><p>下面是一份<strong>真正能落地的错误预算政策模板</strong>——50 行,改改就能贴到团队 Wiki / Notion 当公司级文档。</p><h3 id="_3-1-政策模板-直接抄用版" tabindex="-1">3.1 政策模板(直接抄用版) <a class="header-anchor" href="#_3-1-政策模板-直接抄用版" aria-label="Permalink to &quot;3.1 政策模板(直接抄用版)&quot;">​</a></h3><div class="language-markdown vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">markdown</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;"># 错误预算政策 v1.0</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;"># 生效日期:2026-05-11</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;"># 适用范围:order / payment / user 三个核心服务</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;"># 签字方:CTO @张三 / 工程总监 @李四 / 产品 VP @王五</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">## 1. 目标</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">通过错误预算的实时消耗,自动驱动&quot;质量 vs 速度&quot;的决策。</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">不靠每次吵架,靠预设规则。</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">## 2. SLO 与错误预算</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">| 服务 | SLO | 月度预算 | 备注 |</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">| --- | --- | --- | --- |</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">| order | 99.9% | 43.2 min | 用户面核心 |</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">| payment | 99.95% | 21.6 min | 涉及资金,严 |</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">| user | 99.9% | 43.2 min | 影响登录 |</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">错误预算 = 月度允许的&quot;用户不可用时间&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">预算计算:</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">\`(1 - SLO) × 月度时长\`</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">## 3. 预算状态与对应行动</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">| 预算剩余 | 状态 | 允许的行动 | 不允许的行动 |</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">| --- | --- | --- | --- |</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">| &gt; 50% | 健康 | 正常发布、功能开发 | (无限制) |</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">| 20%-50% | 谨慎 | 必要发布(灰度 + 30min 观察) | 大型架构变更 / 周末发布 |</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">| 0%-20% | 警告 | 仅 P0 bug fix + 稳定性改进 | 新 feature / 非紧急变更 |</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">| &lt; 0%(超支) | 冻结 | 仅 P0 紧急修复 + 稳定性工作 | 一切非紧急变更 + 50/50 SRE/Dev 时间分配 |</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">## 4. 升级路径</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">预算消耗到 20% 以下 → 自动 ticket → 服务 owner + SRE Lead review</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">预算消耗到 0% 以下 → 升级到工程总监 + CTO,要 review 触发原因</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">## 5. 破例机制</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">任何&quot;破例上线&quot;必须:</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">1.</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 服务 owner 写一份 RFC,说明必要性</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">2.</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> SRE Lead + 工程总监双签字</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">3.</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> CTO 知晓(默认 24h 无反对视为同意)</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">4.</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 破例上线的影响计入下月预算</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">每月破例次数公开,放在 SRE Review 议题。</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">## 6. 预算重置</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 每月 1 号 0 点重置</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 滚动 30 天计算,不卡日历月(防&quot;月初任性月底紧张&quot;)</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> SLO 调整需要 30 天前通知,不能临时改</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">## 7. 长期超支的硬规则</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">连续 3 个月超支 → 强制 SRE / Dev 时间 50/50 分配</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">连续 6 个月超支 → 升级到 CEO,重新评估 SLO 目标或团队配置</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">## 8. 修改本政策</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">本政策的修改必须三方签字</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">紧急破例不算&quot;修改本政策&quot;</span></span></code></pre></div><h3 id="_3-2-这份政策的关键设计点" tabindex="-1">3.2 这份政策的关键设计点 <a class="header-anchor" href="#_3-2-这份政策的关键设计点" aria-label="Permalink to &quot;3.2 这份政策的关键设计点&quot;">​</a></h3><p><strong>点 1:四档状态而不是简单二元</strong></p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错的:&quot;超支才停&quot;</span></span>
<span class="line"><span>对的:50% / 20% / 0% / 负数,四档逐渐收紧</span></span>
<span class="line"><span></span></span>
<span class="line"><span>为什么:</span></span>
<span class="line"><span>   - 二元状态(超 / 没超)切换太突然</span></span>
<span class="line"><span>   - 50% 时就开始降节奏,等到 0 已经晚了</span></span>
<span class="line"><span>   - 给团队&quot;逐渐紧张&quot;的预警,而不是&quot;突然刹车&quot;</span></span></code></pre></div><p><strong>点 2:每档的&quot;允许&quot;和&quot;不允许&quot;都明确</strong></p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>不能写&quot;必要时可以发&quot;——什么是必要由谁判断?</span></span>
<span class="line"><span>要写&quot;P0 bug fix 允许,新 feature 不允许&quot;——具体到行为</span></span></code></pre></div><p><strong>点 3:破例机制必须存在但成本要高</strong></p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>没破例机制:政策太死,真有商业紧急时被推翻 → 政策失效</span></span>
<span class="line"><span>破例太容易:每次都破 → 政策等于没有</span></span>
<span class="line"><span>合理的破例:</span></span>
<span class="line"><span>   - SRE Lead + 工程总监双签</span></span>
<span class="line"><span>   - CTO 24h 内可否决</span></span>
<span class="line"><span>   - 计入下月预算</span></span>
<span class="line"><span>   → 破例的&quot;政治成本&quot;足够高,大多数情况大家不破</span></span></code></pre></div><p><strong>点 4:连续超支的硬升级</strong></p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>预算超支不是常态,连续超 = 团队 / SLO / 系统出大问题</span></span>
<span class="line"><span>3 个月升级 50/50 工程时间</span></span>
<span class="line"><span>6 个月升级 CEO 重新讨论 SLO 或团队配置</span></span>
<span class="line"><span>→ 这是政策的&quot;防止躺平&quot;机制</span></span></code></pre></div><p><strong>点 5:三方签字 + 修改门槛</strong></p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>为什么三方:工程 / 产品 / 高层缺一不可</span></span>
<span class="line"><span>为什么签字:有名字 → 政策有&quot;作者&quot;,出问题大家都担责</span></span>
<span class="line"><span>为什么改要三方同意:防止&quot;老板拍脑袋删条款&quot;</span></span></code></pre></div><hr><h2 id="四、错误预算超支后的工程响应流程" tabindex="-1">四、错误预算超支后的工程响应流程 <a class="header-anchor" href="#四、错误预算超支后的工程响应流程" aria-label="Permalink to &quot;四、错误预算超支后的工程响应流程&quot;">​</a></h2><p>把政策落到流程图——<strong>这是这一篇最重要的一张图</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌──────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│         错误预算超支后的工程响应流程                          │</span></span>
<span class="line"><span>└──────────────────────────────────────────────────────────────┘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   ┌────────────────────────────────┐</span></span>
<span class="line"><span>   │  Burn-rate 持续高,预算消耗中  │</span></span>
<span class="line"><span>   └────────────┬───────────────────┘</span></span>
<span class="line"><span>                │</span></span>
<span class="line"><span>                ▼</span></span>
<span class="line"><span>   ┌──────────────────────────────┐</span></span>
<span class="line"><span>   │  预算剩余 &gt; 50%(健康)        │</span></span>
<span class="line"><span>   │  ✓ 正常发布                  │</span></span>
<span class="line"><span>   │  ✓ 功能开发                  │</span></span>
<span class="line"><span>   └────────────┬─────────────────┘</span></span>
<span class="line"><span>                │ 消耗到 50%</span></span>
<span class="line"><span>                ▼</span></span>
<span class="line"><span>   ┌──────────────────────────────────────────────┐</span></span>
<span class="line"><span>   │  预算剩余 20-50%(谨慎)                       │</span></span>
<span class="line"><span>   │  → 自动 Slack/IM 通知服务 owner               │</span></span>
<span class="line"><span>   │  → 发布加 30min 观察期 + 必须灰度             │</span></span>
<span class="line"><span>   │  → 周末禁止非 P0 发布                         │</span></span>
<span class="line"><span>   │  → 在 dashboard 上挂橙色 banner               │</span></span>
<span class="line"><span>   └────────────┬─────────────────────────────────┘</span></span>
<span class="line"><span>                │ 消耗到 20%</span></span>
<span class="line"><span>                ▼</span></span>
<span class="line"><span>   ┌──────────────────────────────────────────────┐</span></span>
<span class="line"><span>   │  预算剩余 0-20%(警告)                        │</span></span>
<span class="line"><span>   │  → 自动开 ticket 给服务 owner + SRE Lead     │</span></span>
<span class="line"><span>   │  → CI/CD 在 PR 模板上加警告                  │</span></span>
<span class="line"><span>   │  → 仅允许 P0 bug fix + 稳定性改进             │</span></span>
<span class="line"><span>   │  → 新 feature PR 自动加 &quot;blocked&quot; 标签       │</span></span>
<span class="line"><span>   │  → SRE Lead 周会 special agenda 讨论根因      │</span></span>
<span class="line"><span>   └────────────┬─────────────────────────────────┘</span></span>
<span class="line"><span>                │ 烧穿到 &lt; 0</span></span>
<span class="line"><span>                ▼</span></span>
<span class="line"><span>   ┌──────────────────────────────────────────────┐</span></span>
<span class="line"><span>   │  预算 &lt; 0(超支冻结)                          │</span></span>
<span class="line"><span>   │  → 自动升级到 工程总监 + CTO                  │</span></span>
<span class="line"><span>   │  → CI/CD 强制 block 所有非 P0 PR              │</span></span>
<span class="line"><span>   │  → 服务 owner 必须开&quot;超支根因 review&quot;          │</span></span>
<span class="line"><span>   │  → SRE / Dev 时间分配自动改 50/50             │</span></span>
<span class="line"><span>   │      (开发 50% 时间投入稳定性 backlog)       │</span></span>
<span class="line"><span>   │  → 如要破例:走破例流程(§3.1 第 5 节)       │</span></span>
<span class="line"><span>   └────────────┬─────────────────────────────────┘</span></span>
<span class="line"><span>                │ 连续超 3 个月</span></span>
<span class="line"><span>                ▼</span></span>
<span class="line"><span>   ┌──────────────────────────────────────────────┐</span></span>
<span class="line"><span>   │  长期超支(系统级问题)                       │</span></span>
<span class="line"><span>   │  → 升级到 CEO                                 │</span></span>
<span class="line"><span>   │  → 重新评估:                                 │</span></span>
<span class="line"><span>   │      a) SLO 是否定得过严?                    │</span></span>
<span class="line"><span>   │      b) 团队是否需要扩招?                    │</span></span>
<span class="line"><span>   │      c) 架构是否需要重构?                    │</span></span>
<span class="line"><span>   │  → 这一档代表&quot;SLO 政策已经无法靠流程修复&quot;     │</span></span>
<span class="line"><span>   └──────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>这张图的关键设计</strong>:</p><ol><li><strong>每档都是&quot;自动触发&quot;</strong> —— 不需要人去判断 &quot;现在算不算紧张&quot;,由 burn rate / 预算余额自动驱动</li><li><strong>每档都有具体动作</strong> —— &quot;通知&quot;、&quot;加观察期&quot;、&quot;开 ticket&quot;、&quot;block PR&quot; 都是机器可执行的</li><li><strong>每档都有升级条件</strong> —— 不允许&quot;卡在某一档不动&quot;,必须流向下一档或者好转</li><li><strong>最高档强制升级到决策层</strong> —— 工程团队不背&quot;系统级问题&quot;的锅</li></ol><hr><h2 id="五、sre-的否决权-不需要-但需要-leader-背书" tabindex="-1">五、SRE 的否决权:不需要,但需要 leader 背书 <a class="header-anchor" href="#五、sre-的否决权-不需要-但需要-leader-背书" aria-label="Permalink to &quot;五、SRE 的否决权:不需要,但需要 leader 背书&quot;">​</a></h2><p>这一节讲清楚一个<strong>最常被误解的点</strong>:<strong>SRE 不需要&quot;否决发布&quot;的权力</strong>,SRE 需要的是**&quot;否决发布&quot;的政策**——<strong>两者本质区别</strong>。</p><h3 id="_5-1-否决权-vs-政策" tabindex="-1">5.1 否决权 vs 政策 <a class="header-anchor" href="#_5-1-否决权-vs-政策" aria-label="Permalink to &quot;5.1 否决权 vs 政策&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>SRE 有&quot;否决权&quot;(每次都靠 SRE 拍板):</span></span>
<span class="line"><span>   - SRE 自己扛压力,PM 直接找 SRE 头上</span></span>
<span class="line"><span>   - SRE 心累,经常被绕过</span></span>
<span class="line"><span>   - 这是 95% 团队的痛点</span></span>
<span class="line"><span></span></span>
<span class="line"><span>SRE 执行&quot;政策&quot;(政策说停就停):</span></span>
<span class="line"><span>   - SRE 只是&quot;执行规则的人&quot;</span></span>
<span class="line"><span>   - 找 SRE 没用,要找规则的作者(CTO)</span></span>
<span class="line"><span>   - SRE 心理负担小,流程稳定</span></span></code></pre></div><h3 id="_5-2-为什么个人否决权撑不住" tabindex="-1">5.2 为什么个人否决权撑不住 <a class="header-anchor" href="#_5-2-为什么个人否决权撑不住" aria-label="Permalink to &quot;5.2 为什么个人否决权撑不住&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>SRE 个人否决:</span></span>
<span class="line"><span>   PM:&quot;我去找 CTO 说一下&quot;</span></span>
<span class="line"><span>   CTO:&quot;先放行吧&quot; → SRE 否决被推翻</span></span>
<span class="line"><span>   下一次 SRE 还会否决吗?不会。</span></span>
<span class="line"><span>   → 否决权流于形式</span></span>
<span class="line"><span></span></span>
<span class="line"><span>政策执行:</span></span>
<span class="line"><span>   PM:&quot;我去找 CTO 说一下&quot;</span></span>
<span class="line"><span>   CTO:&quot;我自己签过这个政策的,</span></span>
<span class="line"><span>        要破例你写 RFC,我 24h 内审&quot;</span></span>
<span class="line"><span>   PM:&quot;...算了&quot;</span></span>
<span class="line"><span>   → 政策起作用</span></span></code></pre></div><p><strong>SRE 在公司层级里几乎永远是弱势角色</strong>——靠个人扛&quot;否决产品&quot;很难。<strong>政策代替个人,这是 SRE 工程的核心保护机制</strong>。</p><h3 id="_5-3-怎么获得-政策-的授权" tabindex="-1">5.3 怎么获得&quot;政策&quot;的授权 <a class="header-anchor" href="#_5-3-怎么获得-政策-的授权" aria-label="Permalink to &quot;5.3 怎么获得&quot;政策&quot;的授权&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>对 SRE Lead 的工作清单:</span></span>
<span class="line"><span>   1. 起草政策(参考 §3.1 模板)</span></span>
<span class="line"><span>   2. 找 工程总监 / CTO 谈,讲清楚:</span></span>
<span class="line"><span>      - 政策对工程团队的好处(可量化:MTTR / change failure rate)</span></span>
<span class="line"><span>      - 不签政策对工程团队的代价(burnout / 离职)</span></span>
<span class="line"><span>      - 政策对业务的&quot;成本&quot;(可能少发 X 次版本)</span></span>
<span class="line"><span>   3. 找 产品 VP 谈:</span></span>
<span class="line"><span>      - SLA 违约风险(可能赔钱)</span></span>
<span class="line"><span>      - 长期客户流失(数据驱动)</span></span>
<span class="line"><span>      - &quot;短期慢一点 = 长期稳一点&quot;的商业故事</span></span>
<span class="line"><span>   4. 三方坐下来签</span></span>
<span class="line"><span>   5. 公开发到全公司 wiki(透明化)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>不要&quot;偷偷上 SRE 政策&quot;——</span></span>
<span class="line"><span>   政策必须高层签字,公开,所有人都知道</span></span>
<span class="line"><span>   不公开的政策 = 没有政策</span></span></code></pre></div><p><strong>这一步是这一篇最难的部分,但也是最重要的</strong>。<strong>没有 leader 背书的 SLO 政策一钱不值</strong>——下次冲突时,你拿不出来。</p><hr><h2 id="六、怎么跟产品-pm-吵-把-技术债-翻译成-商业语言" tabindex="-1">六、怎么跟产品 PM 吵:把&quot;技术债&quot;翻译成&quot;商业语言&quot; <a class="header-anchor" href="#六、怎么跟产品-pm-吵-把-技术债-翻译成-商业语言" aria-label="Permalink to &quot;六、怎么跟产品 PM 吵:把&quot;技术债&quot;翻译成&quot;商业语言&quot;&quot;">​</a></h2><p>讲清楚政策怎么写、怎么签后,<strong>真正的实战场景是日常的对话</strong>。这一节给你&quot;翻译&quot;工具——<strong>把工程师的语言翻译成产品 / 高管能听懂的语言</strong>。</p><h3 id="_6-1-错误的吵法-技术语言" tabindex="-1">6.1 错误的吵法:技术语言 <a class="header-anchor" href="#_6-1-错误的吵法-技术语言" aria-label="Permalink to &quot;6.1 错误的吵法:技术语言&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>SRE:&quot;我们错误预算超了,不能发&quot;</span></span>
<span class="line"><span>PM: &quot;啥预算?&quot;</span></span>
<span class="line"><span>SRE:&quot;99.9% SLO 一个月只能错 43 分钟,现在用了 50 分钟&quot;</span></span>
<span class="line"><span>PM: &quot;客户没投诉啊&quot;</span></span>
<span class="line"><span>SRE:&quot;我们 burn rate 已经 14 倍了&quot;</span></span>
<span class="line"><span>PM: &quot;你说的 14 倍是什么意思?&quot;</span></span>
<span class="line"><span>SRE:&quot;......&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>问题:SRE 用了一堆术语,PM 听不懂</span></span>
<span class="line"><span>       PM 听不懂 = PM 没有 stake = PM 不会被说服</span></span></code></pre></div><h3 id="_6-2-正确的吵法-商业语言" tabindex="-1">6.2 正确的吵法:商业语言 <a class="header-anchor" href="#_6-2-正确的吵法-商业语言" aria-label="Permalink to &quot;6.2 正确的吵法:商业语言&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>SRE:&quot;我们这个月的&#39;可用性预算&#39;用完了&quot;</span></span>
<span class="line"><span>PM: &quot;什么意思?&quot;</span></span>
<span class="line"><span>SRE:&quot;我们和大客户 A / B / C 签的合同里承诺</span></span>
<span class="line"><span>     &#39;一个月最多挂 43 分钟&#39;,现在已经挂了 50 分钟&quot;</span></span>
<span class="line"><span>PM: &quot;那要赔钱?&quot;</span></span>
<span class="line"><span>SRE:&quot;按 SLA,这个月需要赔 A 客户 5 万、B 客户 8 万&quot;</span></span>
<span class="line"><span>PM: &quot;...13 万?&quot;</span></span>
<span class="line"><span>SRE:&quot;是的。而且 C 客户合同里写了&#39;连续 2 个月超 SLA 可解约&#39;&quot;</span></span>
<span class="line"><span>PM: &quot;C 客户合同年值多少?&quot;</span></span>
<span class="line"><span>SRE:&quot;300 万&quot;</span></span>
<span class="line"><span>PM: &quot;......那这个版本能晚一周吗?&quot;</span></span>
<span class="line"><span>SRE:&quot;晚一周可以让我们多积累 10 分钟预算,够买回 1 万的赔付额度</span></span>
<span class="line"><span>     如果今晚发出去事故,可能再赔 5 万&quot;</span></span>
<span class="line"><span>PM: &quot;晚发。我去跟客户解释&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>成功:PM 知道了&quot;赔钱&quot;和&quot;客户流失&quot;,</span></span>
<span class="line"><span>      他自己就成了延期的支持者</span></span></code></pre></div><h3 id="_6-3-翻译速查表" tabindex="-1">6.3 翻译速查表 <a class="header-anchor" href="#_6-3-翻译速查表" aria-label="Permalink to &quot;6.3 翻译速查表&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌─────────────────────────────┬────────────────────────────────┐</span></span>
<span class="line"><span>│  工程语言                    │  商业语言                       │</span></span>
<span class="line"><span>├─────────────────────────────┼────────────────────────────────┤</span></span>
<span class="line"><span>│  错误预算超了                │  赔款风险 X 万 + 客户流失风险   │</span></span>
<span class="line"><span>│  SLO 99.9%                  │  和客户合同里写的&quot;挂 43 分钟&quot;  │</span></span>
<span class="line"><span>│  Burn rate 14x              │  按这个速度 2 小时烧穿一个月    │</span></span>
<span class="line"><span>│  P99 飙到 2s                │  X% 用户在等待,有 Y% 会放弃    │</span></span>
<span class="line"><span>│  错误率 1%                  │  每 100 次请求 1 次出错(失败下单)│</span></span>
<span class="line"><span>│  容量饱和                    │  扛不住下次大促,会重演 XX 事故 │</span></span>
<span class="line"><span>│  Toil 太多                   │  团队疲劳率 X%,下个月可能离职   │</span></span>
<span class="line"><span>│  Change failure rate 30%    │  每 3 次发布失败 1 次,意味着... │</span></span>
<span class="line"><span>│  MTTR 90 分钟                │  出事后 1.5 小时才修好          │</span></span>
<span class="line"><span>└─────────────────────────────┴────────────────────────────────┘</span></span></code></pre></div><p><strong>翻译的核心</strong>:<strong>永远把指标翻译成&quot;用户流失 / 钱 / 客诉 / 退款 / 合规风险&quot;</strong>——这才是 PM / 高管真正在意的东西。</p><h3 id="_6-4-几个常见话术对照" tabindex="-1">6.4 几个常见话术对照 <a class="header-anchor" href="#_6-4-几个常见话术对照" aria-label="Permalink to &quot;6.4 几个常见话术对照&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>情景 A:产品要新功能,预算不允许</span></span>
<span class="line"><span>错: &quot;我们不能发,预算超了&quot;</span></span>
<span class="line"><span>对: &quot;现在发的话,你这个功能上线就赶上事故风险高峰。</span></span>
<span class="line"><span>     上次类似情景我们 5xx 跑到 5%,这功能上线</span></span>
<span class="line"><span>     反而被用户骂&#39;刚上线就崩&#39;。</span></span>
<span class="line"><span>     推到下周,功能口碑会好很多&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>情景 B:CEO 问&quot;为啥这季度只发了 3 个 feature&quot;</span></span>
<span class="line"><span>错: &quot;我们错误预算紧张,发布卡了很多&quot;</span></span>
<span class="line"><span>对: &quot;我们这季度 99.95% 可用性达成。代价是慢一些发布</span></span>
<span class="line"><span>     —— 慢一些发的好处是大客户 A / B 续了 5 年合同</span></span>
<span class="line"><span>     (有数据:他们续约就是因为我们稳)。</span></span>
<span class="line"><span>     下季度 backlog 加速消化,</span></span>
<span class="line"><span>     可用性目标会保持但发布节奏可以恢复&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>情景 C:开发吐槽&quot;你们 SRE 总是卡我们&quot;</span></span>
<span class="line"><span>错: &quot;这是政策规定,我也没办法&quot;</span></span>
<span class="line"><span>对: &quot;我也想让大家更快发布。</span></span>
<span class="line"><span>     我们一起看看为什么连续 2 个月超预算 —— </span></span>
<span class="line"><span>     是不是有几个服务持续在烧?</span></span>
<span class="line"><span>     如果是 X 服务的 bug,</span></span>
<span class="line"><span>     花 1 个月修了,接下来发布会顺很多&quot;</span></span>
<span class="line"><span>     (把&quot;工程师 vs SRE&quot;翻译成&quot;我们一起对抗坏服务&quot;)</span></span></code></pre></div><hr><h2 id="七、长期超支-不是-slo-的问题-是团队的问题" tabindex="-1">七、长期超支:不是 SLO 的问题,是团队的问题 <a class="header-anchor" href="#七、长期超支-不是-slo-的问题-是团队的问题" aria-label="Permalink to &quot;七、长期超支:不是 SLO 的问题,是团队的问题&quot;">​</a></h2><p>讲完单次冲突,<strong>讲长期模式</strong>——这是最反直觉的一点:<strong>长期超支 ≠ SRE 没做好,而是更深层的组织问题</strong>。</p><h3 id="_7-1-长期超支的-3-种根因" tabindex="-1">7.1 长期超支的 3 种根因 <a class="header-anchor" href="#_7-1-长期超支的-3-种根因" aria-label="Permalink to &quot;7.1 长期超支的 3 种根因&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>根因 A:SLO 定得太严(脱离实际)</span></span>
<span class="line"><span>   症状:连续 3 个月超支,但用户实际感知尚可</span></span>
<span class="line"><span>   信号:错误预算消耗 110-130%,但 NPS / 客诉没变化</span></span>
<span class="line"><span>   修复:把 SLO 调松 0.1%(99.9% → 99.8%)</span></span>
<span class="line"><span>        给业务一个真实可达的目标</span></span>
<span class="line"><span>   注意:调 SLO 必须三方重新签字,不能 SRE 自己调</span></span>
<span class="line"><span></span></span>
<span class="line"><span>根因 B:团队优先级错了(质量被忽视)</span></span>
<span class="line"><span>   症状:连续超支,业务 KPI 都是新功能,</span></span>
<span class="line"><span>        没人有时间做稳定性</span></span>
<span class="line"><span>   信号:稳定性 backlog 一直在堆,</span></span>
<span class="line"><span>        没人有时间填</span></span>
<span class="line"><span>   修复:工程总监强制 50/50,</span></span>
<span class="line"><span>        新 feature 暂停一个 sprint,</span></span>
<span class="line"><span>        全员投入稳定性</span></span>
<span class="line"><span>   这是错误预算政策的硬规则在起作用</span></span>
<span class="line"><span></span></span>
<span class="line"><span>根因 C:架构 / 基础设施过时(系统在腐烂)</span></span>
<span class="line"><span>   症状:超支,但根因都不一样(没规律)</span></span>
<span class="line"><span>   信号:每次事故都是&quot;新的根因&quot;,</span></span>
<span class="line"><span>        不是同一个系统的不同表现</span></span>
<span class="line"><span>   修复:这是技术债危机,</span></span>
<span class="line"><span>        需要工程总监 / CTO 拍板做架构升级</span></span>
<span class="line"><span>   不是 SRE 一个团队的事</span></span></code></pre></div><h3 id="_7-2-三种根因的判断流程" tabindex="-1">7.2 三种根因的判断流程 <a class="header-anchor" href="#_7-2-三种根因的判断流程" aria-label="Permalink to &quot;7.2 三种根因的判断流程&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>连续超支 → 触发&quot;超支根因 review&quot;:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   ┌─────────────────────────────────────┐</span></span>
<span class="line"><span>   │  Q1: 用户感知怎么样?               │</span></span>
<span class="line"><span>   │     - NPS / 客诉 / 续约 数据        │</span></span>
<span class="line"><span>   └────────────┬────────────────────────┘</span></span>
<span class="line"><span>                │</span></span>
<span class="line"><span>       ┌────────┴────────┐</span></span>
<span class="line"><span>       │                 │</span></span>
<span class="line"><span>   用户没感觉            用户在骂</span></span>
<span class="line"><span>       │                 │</span></span>
<span class="line"><span>       ▼                 ▼</span></span>
<span class="line"><span>   根因 A             ┌──────────────────┐</span></span>
<span class="line"><span>   SLO 太严           │ Q2: 根因有规律吗?│</span></span>
<span class="line"><span>   → 调 SLO           └────────┬─────────┘</span></span>
<span class="line"><span>                              │</span></span>
<span class="line"><span>                     ┌────────┴────────┐</span></span>
<span class="line"><span>                     │                 │</span></span>
<span class="line"><span>                  规律           没规律</span></span>
<span class="line"><span>                     │                 │</span></span>
<span class="line"><span>                     ▼                 ▼</span></span>
<span class="line"><span>                  根因 B            根因 C</span></span>
<span class="line"><span>                  优先级错           架构腐烂</span></span>
<span class="line"><span>                  → 50/50            → 大重构</span></span></code></pre></div><p><strong>这三个根因的处置完全不同</strong>——盲目&quot;加严 SLO&quot;或&quot;加 SRE 人手&quot;都是错的。<strong>正确做法是先找根因,再开药</strong>。</p><h3 id="_7-3-长期超支也要避免的反模式" tabindex="-1">7.3 长期超支也要避免的反模式 <a class="header-anchor" href="#_7-3-长期超支也要避免的反模式" aria-label="Permalink to &quot;7.3 长期超支也要避免的反模式&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>反模式 1:&quot;加 SRE 人手&quot;</span></span>
<span class="line"><span>   症状:超支了,招 SRE 加大值班</span></span>
<span class="line"><span>   后果:SRE 越多越疲劳,因为根因没解决</span></span>
<span class="line"><span></span></span>
<span class="line"><span>反模式 2:&quot;上更多自动化&quot;</span></span>
<span class="line"><span>   症状:超支了,加一堆告警 / 自愈 / Runbook</span></span>
<span class="line"><span>   后果:工具越多越乱,根因还在</span></span>
<span class="line"><span></span></span>
<span class="line"><span>反模式 3:&quot;加严流程&quot;</span></span>
<span class="line"><span>   症状:超支了,所有发布都要 SRE 签字</span></span>
<span class="line"><span>   后果:发布更慢,质量没变,业务方愤怒</span></span>
<span class="line"><span></span></span>
<span class="line"><span>反模式 4:&quot;调松 SLO 让数字好看&quot;</span></span>
<span class="line"><span>   症状:超支了,把 SLO 99.9% → 99.5%</span></span>
<span class="line"><span>   后果:技术债被掩盖,3 个月后还会超</span></span>
<span class="line"><span>   注意:这个反模式和根因 A 的&quot;合理调松&quot;</span></span>
<span class="line"><span>        区别在于:有没有先做根因分析</span></span></code></pre></div><p><strong>没有根因分析的&quot;应对&quot;,都是给问题盖被子</strong>——盖到一天被子也盖不住为止。</p><hr><h2 id="八、toil-与错误预算的协同" tabindex="-1">八、Toil 与错误预算的协同 <a class="header-anchor" href="#八、toil-与错误预算的协同" aria-label="Permalink to &quot;八、Toil 与错误预算的协同&quot;">​</a></h2><p><strong>这一节讲一个常被忽略的连接</strong>——Toil(劳役)和错误预算是同一件事的两面。</p><h3 id="_8-1-toil-是什么-快速回顾" tabindex="-1">8.1 Toil 是什么(快速回顾) <a class="header-anchor" href="#_8-1-toil-是什么-快速回顾" aria-label="Permalink to &quot;8.1 Toil 是什么(快速回顾)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Toil 的特征(Google SRE Book 定义):</span></span>
<span class="line"><span>   - 手工 / 重复</span></span>
<span class="line"><span>   - 自动化可能</span></span>
<span class="line"><span>   - 无长期价值</span></span>
<span class="line"><span>   - 与服务规模成正比</span></span>
<span class="line"><span></span></span>
<span class="line"><span>典型 toil:</span></span>
<span class="line"><span>   - 手动改配置 / 手动重启 / 手动扩容</span></span>
<span class="line"><span>   - 例行报表手填</span></span>
<span class="line"><span>   - 重复处理同类工单</span></span>
<span class="line"><span>   - 手动 Runbook 步骤</span></span></code></pre></div><h3 id="_8-2-toil-和错误预算的关系" tabindex="-1">8.2 Toil 和错误预算的关系 <a class="header-anchor" href="#_8-2-toil-和错误预算的关系" aria-label="Permalink to &quot;8.2 Toil 和错误预算的关系&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>高 Toil + 错误预算超支 = 必然组合</span></span>
<span class="line"><span>   原因:Toil 占用工程时间 → 没时间做稳定性</span></span>
<span class="line"><span>        → 稳定性差 → 事故多 → 预算超支</span></span>
<span class="line"><span>        → 更多紧急修复(更多 Toil)→ 死循环</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Google SRE 的 50% 工程时间规则:</span></span>
<span class="line"><span>   SRE 团队 50% 时间 做工程项目(自动化 / 优化 / 工具)</span></span>
<span class="line"><span>   另 50% 做 toil 是上限,超了必须处理</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   实践:</span></span>
<span class="line"><span>   - 每月统计 toil 时间占比</span></span>
<span class="line"><span>   - &gt; 50% 触发&quot;toil cleanup sprint&quot;</span></span>
<span class="line"><span>   - 永久 toil 升级到 P0 优化任务</span></span></code></pre></div><h3 id="_8-3-错误预算超支时-toil-项的处理" tabindex="-1">8.3 错误预算超支时,Toil 项的处理 <a class="header-anchor" href="#_8-3-错误预算超支时-toil-项的处理" aria-label="Permalink to &quot;8.3 错误预算超支时,Toil 项的处理&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错误预算超支 → 触发 50/50 Dev/SRE 时间</span></span>
<span class="line"><span>   ↓</span></span>
<span class="line"><span>开发花 50% 时间做&quot;稳定性 backlog&quot;</span></span>
<span class="line"><span>   稳定性 backlog 里都是什么?</span></span>
<span class="line"><span>   - 重复 toil 的自动化(参考 29 篇 Runbook 工程)</span></span>
<span class="line"><span>   - 重复事故的根因修复</span></span>
<span class="line"><span>   - 容量短板的补强(参考 30 篇容量规划)</span></span>
<span class="line"><span>   - 监控缺口的填补(本层 14 / 15 / 16 篇)</span></span>
<span class="line"><span>   ↓</span></span>
<span class="line"><span>30 天后回看:toil 时间下降 + 事故数下降 + 预算回正</span></span>
<span class="line"><span></span></span>
<span class="line"><span>→ 错误预算政策的真正威力:</span></span>
<span class="line"><span>   它把&quot;团队优先级&quot;从&quot;加功能&quot;自动转到&quot;稳定性&quot;,</span></span>
<span class="line"><span>   不需要每次靠 SRE 单方面争取</span></span></code></pre></div><p><strong>这是错误预算最深刻的工程价值</strong>——<strong>它不只是&quot;让 SRE 卡住发布&quot;,更是&quot;在工程师内部重新调配时间&quot;的机制</strong>。</p><hr><h2 id="九、何时不该上-slo-错误预算" tabindex="-1">九、何时不该上 SLO / 错误预算 <a class="header-anchor" href="#九、何时不该上-slo-错误预算" aria-label="Permalink to &quot;九、何时不该上 SLO / 错误预算&quot;">​</a></h2><p>讲完错误预算的威力,<strong>也得说什么时候不该用</strong>——SLO 不是万灵药,<strong>有些场景上 SLO 是浪费工程时间</strong>。</p><h3 id="_9-1-团队太小-3-工程师" tabindex="-1">9.1 团队太小(&lt; 3 工程师) <a class="header-anchor" href="#_9-1-团队太小-3-工程师" aria-label="Permalink to &quot;9.1 团队太小(&lt; 3 工程师)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>3 个人的团队:</span></span>
<span class="line"><span>   - 全员既写代码又值班</span></span>
<span class="line"><span>   - 沟通成本极低(一个 Slack 群够了)</span></span>
<span class="line"><span>   - 没必要写 30 行政策文档,大家口头约定就行</span></span>
<span class="line"><span></span></span>
<span class="line"><span>替代方案:</span></span>
<span class="line"><span>   - 简单的 &quot;出事就停发&quot; 默认规则</span></span>
<span class="line"><span>   - 一个 dashboard 看可用性</span></span>
<span class="line"><span>   - 不上 burn rate 告警(用静态阈值就行)</span></span></code></pre></div><h3 id="_9-2-mvp-早期产品-还在找-pmf" tabindex="-1">9.2 MVP / 早期产品(还在找 PMF) <a class="header-anchor" href="#_9-2-mvp-早期产品-还在找-pmf" aria-label="Permalink to &quot;9.2 MVP / 早期产品(还在找 PMF)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>产品还在 PMF 阶段:</span></span>
<span class="line"><span>   - 用户少(&lt; 1000),错误预算样本量不够</span></span>
<span class="line"><span>   - 产品方向还在变,SLO 定不准</span></span>
<span class="line"><span>   - 速度优先,质量平衡</span></span>
<span class="line"><span>   - 一个月发 20 个版本,SLO 永远在烧</span></span>
<span class="line"><span></span></span>
<span class="line"><span>替代方案:</span></span>
<span class="line"><span>   - 先做基础监控(看 8 篇 / 9 篇)</span></span>
<span class="line"><span>   - 上线一个数字 dashboard</span></span>
<span class="line"><span>   - 等用户上 1 万 + 产品稳定 6 个月再上 SLO</span></span></code></pre></div><h3 id="_9-3-没监控基础" tabindex="-1">9.3 没监控基础 <a class="header-anchor" href="#_9-3-没监控基础" aria-label="Permalink to &quot;9.3 没监控基础&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>监控连 RED 都没有的团队:</span></span>
<span class="line"><span>   - SLO 是建立在&quot;能测量&quot;基础上的</span></span>
<span class="line"><span>   - 没监控 = 没数据 = SLO 拍脑袋 = 政策无意义</span></span>
<span class="line"><span></span></span>
<span class="line"><span>正确顺序:</span></span>
<span class="line"><span>   1. 先做监控(05-12 篇)</span></span>
<span class="line"><span>   2. 再做 SLI(13 篇)</span></span>
<span class="line"><span>   3. 再做 SLO + 错误预算(13 / 17 篇)</span></span>
<span class="line"><span>   4. 再做政策(本篇)</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   跳步 = 在沙地上盖房子</span></span></code></pre></div><h3 id="_9-4-无法量化的服务" tabindex="-1">9.4 无法量化的服务 <a class="header-anchor" href="#_9-4-无法量化的服务" aria-label="Permalink to &quot;9.4 无法量化的服务&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>某些服务的&quot;用户体验&quot;难量化:</span></span>
<span class="line"><span>   - 内部 BI 工具(不影响外部用户)</span></span>
<span class="line"><span>   - 实验性 API(还没人正式用)</span></span>
<span class="line"><span>   - 离线 batch job(没&quot;用户感知&quot;概念)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>这些不上 SLO,改用别的:</span></span>
<span class="line"><span>   - 内部工具:简单 &quot;工作时段可用&quot; 即可</span></span>
<span class="line"><span>   - 实验 API:加进 SLO 但目标低(99%)</span></span>
<span class="line"><span>   - 离线 batch:用&quot;SLA 时间窗口&quot;(每天 12 点前完成)</span></span></code></pre></div><h3 id="_9-5-老板不在乎-公司文化激进" tabindex="-1">9.5 老板不在乎 / 公司文化激进 <a class="header-anchor" href="#_9-5-老板不在乎-公司文化激进" aria-label="Permalink to &quot;9.5 老板不在乎 / 公司文化激进&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>极端反例:</span></span>
<span class="line"><span>   &quot;我们公司就是要快,出事再说&quot;</span></span>
<span class="line"><span>   &quot;客户都习惯我们偶尔挂&quot;</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   这种情况下上 SLO:</span></span>
<span class="line"><span>   - 政策签不下来(老板不签)</span></span>
<span class="line"><span>   - 签了也没人执行(没人在乎)</span></span>
<span class="line"><span>   - SRE 自己被孤立</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   建议:</span></span>
<span class="line"><span>   - 先做监控基础,让数据说话</span></span>
<span class="line"><span>   - 用&quot;赔钱&quot;数据(§6.2)说服老板</span></span>
<span class="line"><span>   - 老板心动了再上政策</span></span>
<span class="line"><span>   - 老板不心动,先别浪费时间</span></span></code></pre></div><p><strong>SLO 是&quot;上层愿意为可靠性付代价&quot;的工程表达</strong>——上层不愿意,你强行上,只是让自己更累。</p><hr><h2 id="十、5-条踩坑提醒" tabindex="-1">十、5 条踩坑提醒 <a class="header-anchor" href="#十、5-条踩坑提醒" aria-label="Permalink to &quot;十、5 条踩坑提醒&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 政策没人签</span></span>
<span class="line"><span>   症状:SRE 自己写了个 SLO 政策放 wiki,从来没要谁签字</span></span>
<span class="line"><span>   后果:出事时拿出来,没人认账</span></span>
<span class="line"><span>   修复:必须三方签字(SRE Lead / 工程总监 / 产品 VP / CTO)</span></span>
<span class="line"><span>        公开放,所有人都能查到</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. 太严:每月都超</span></span>
<span class="line"><span>   症状:SLO 定 99.99%,实际系统天然能做到 99.7%</span></span>
<span class="line"><span>   后果:每月超 → 政策每月在触发 → 大家都疲了 → 政策失效</span></span>
<span class="line"><span>   修复:基于历史数据定 SLO(参考 13 篇),</span></span>
<span class="line"><span>        不要拍脑袋</span></span>
<span class="line"><span>        过严比过松更危险——大家会觉得 SLO 是&quot;摆设&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. 太松:超支了也不能踩刹车</span></span>
<span class="line"><span>   症状:SLO 定 99%(允许 7 小时/月错),</span></span>
<span class="line"><span>        实际系统能做 99.95%,</span></span>
<span class="line"><span>        预算永远花不完</span></span>
<span class="line"><span>   后果:政策没用武之地,</span></span>
<span class="line"><span>        发布失控时没有刹车</span></span>
<span class="line"><span>   修复:SLO 应该&quot;刚好够用,略有压力&quot;</span></span>
<span class="line"><span>        预算永远花不完 = SLO 太松,该收紧</span></span>
<span class="line"><span></span></span>
<span class="line"><span>4. 无升级路径</span></span>
<span class="line"><span>   症状:政策写了&quot;预算超支冻结发布&quot;,</span></span>
<span class="line"><span>        但没说&quot;谁有权破例 / 怎么破例&quot;</span></span>
<span class="line"><span>   后果:真出商业紧急情况,工程团队没法响应</span></span>
<span class="line"><span>        反而被指责&quot;教条&quot;</span></span>
<span class="line"><span>   修复:必须有破例机制(§3.1 第 5 节),</span></span>
<span class="line"><span>        而且破例成本要明确高</span></span>
<span class="line"><span></span></span>
<span class="line"><span>5. SLO 拍脑袋不基于历史数据</span></span>
<span class="line"><span>   症状:&quot;我们 SLO 定 99.9% 吧&quot; — 凭直觉</span></span>
<span class="line"><span>   后果:不是过严就是过松,两种结局都坏</span></span>
<span class="line"><span>   修复:看过去 90 天的实际可用性数据</span></span>
<span class="line"><span>        SLO 目标 = 历史 P50 + 一点压力</span></span>
<span class="line"><span>        (历史 P50 = &quot;正常情况下能做到的水平&quot;</span></span>
<span class="line"><span>         + 一点压力 = &quot;稍微努力才能保持&quot;)</span></span></code></pre></div><hr><h2 id="十一、错误预算政策的常见误解" tabindex="-1">十一、错误预算政策的常见误解 <a class="header-anchor" href="#十一、错误预算政策的常见误解" aria-label="Permalink to &quot;十一、错误预算政策的常见误解&quot;">​</a></h2><p>把这一篇里&quot;反直觉&quot;的几条总结成一张表——<strong>这些反直觉的点,90% 团队都没想清楚</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌──────────────────────────────────┬──────────────────────────────────┐</span></span>
<span class="line"><span>│  常见误解                         │  实际正解                        │</span></span>
<span class="line"><span>├──────────────────────────────────┼──────────────────────────────────┤</span></span>
<span class="line"><span>│  SLO 越严越好                    │  够用就好,过严反而失效          │</span></span>
<span class="line"><span>├──────────────────────────────────┼──────────────────────────────────┤</span></span>
<span class="line"><span>│  SRE 应该有否决权                │  SRE 应该有&quot;政策&quot;,不是&quot;权力&quot;   │</span></span>
<span class="line"><span>├──────────────────────────────────┼──────────────────────────────────┤</span></span>
<span class="line"><span>│  错误预算超支 = SRE 失败          │  错误预算超支 = 信号触发 + 行动  │</span></span>
<span class="line"><span>│                                  │  (这是预算系统的&quot;工作状态&quot;)     │</span></span>
<span class="line"><span>├──────────────────────────────────┼──────────────────────────────────┤</span></span>
<span class="line"><span>│  长期超支说明 SLO 没用            │  长期超支说明组织/架构出问题     │</span></span>
<span class="line"><span>│                                  │  (不是 SLO 错,是更深的根因)    │</span></span>
<span class="line"><span>├──────────────────────────────────┼──────────────────────────────────┤</span></span>
<span class="line"><span>│  错误预算是技术指标              │  错误预算是商业契约              │</span></span>
<span class="line"><span>├──────────────────────────────────┼──────────────────────────────────┤</span></span>
<span class="line"><span>│  上 SLO 就能让团队稳              │  没政策的 SLO 是装饰,            │</span></span>
<span class="line"><span>│                                  │  政策没人签的 SLO 是摆设         │</span></span>
<span class="line"><span>├──────────────────────────────────┼──────────────────────────────────┤</span></span>
<span class="line"><span>│  &quot;破例上线&quot; 是失败                │  破例机制是政策的必要部分,       │</span></span>
<span class="line"><span>│                                  │  破例次数才是健康指标            │</span></span>
<span class="line"><span>└──────────────────────────────────┴──────────────────────────────────┘</span></span></code></pre></div><p><strong>这张表里每一条反直觉,都是我自己或团队踩过坑才学到的</strong>——希望读到这里的人能少踩几个。</p><hr><h2 id="十二、本篇硬指标" tabindex="-1">十二、本篇硬指标 <a class="header-anchor" href="#十二、本篇硬指标" aria-label="Permalink to &quot;十二、本篇硬指标&quot;">​</a></h2><p>看完这一篇,你应该能给团队:</p><ul><li><strong>一周内</strong>:基于 §3.1 模板,起草团队的错误预算政策草案(50 行起步)</li><li><strong>一个月内</strong>:把政策推到三方签字(SRE Lead / 工程总监 / 产品 VP),公开发出去</li><li><strong>一个季度内</strong>:政策上线后,统计触发次数 / 破例次数,有第一份&quot;政策健康度&quot;报告</li><li><strong>半年内</strong>:政策跑过至少一次 &quot;20-50% 谨慎&quot; 或 &quot;0-20% 警告&quot; 档,验证机制有效</li></ul><p>并且能在白板前讲清楚:</p><ul><li>为什么错误预算政策必须事先写、必须签字(§2.3)</li><li>四档预算状态对应的行动(§3.1 § 4)</li><li>SRE 不需要否决权但需要政策背书的逻辑(§5.1)</li><li>如何把&quot;超支了&quot;翻译成 PM / CEO 听得懂的语言(§6.2)</li><li>长期超支的三种根因 + 处置(§7.1)</li></ul><hr><h2 id="十三、slo-工程层完结" tabindex="-1">十三、SLO 工程层完结 <a class="header-anchor" href="#十三、slo-工程层完结" aria-label="Permalink to &quot;十三、SLO 工程层完结&quot;">​</a></h2><p>13 / 14 / 15 / 16 / 17 五篇连起来,<strong>就是中型团队的 SLO 工程全套</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌─────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  SLO 工程层(13-17)— 完整闭环                          │</span></span>
<span class="line"><span>├─────────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>│                                                         │</span></span>
<span class="line"><span>│  13. SLI / SLO / SLA                                   │</span></span>
<span class="line"><span>│      → 定承诺(用户视角的 SLI / 错误预算的算术)        │</span></span>
<span class="line"><span>│                                                         │</span></span>
<span class="line"><span>│  14. RED 与 USE                                         │</span></span>
<span class="line"><span>│      → 定看什么(服务视角 + 资源视角的指标)            │</span></span>
<span class="line"><span>│                                                         │</span></span>
<span class="line"><span>│  15. 告警分级与降噪                                     │</span></span>
<span class="line"><span>│      → 定什么时候叫人(multi-burn-rate)                │</span></span>
<span class="line"><span>│                                                         │</span></span>
<span class="line"><span>│  16. 仪表盘工程                                         │</span></span>
<span class="line"><span>│      → 定怎么看(L1 / L2 / L3 / L4 分层 + 一图一意)   │</span></span>
<span class="line"><span>│                                                         │</span></span>
<span class="line"><span>│  17. 错误预算的政治学(本篇)                           │</span></span>
<span class="line"><span>│      → 定预算用完后做什么(政策 + 升级路径)            │</span></span>
<span class="line"><span>│                                                         │</span></span>
<span class="line"><span>└─────────────────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>这五件事缺一就是 SLO 工程不完整</strong>:</p><ul><li>没 13:目标不明确</li><li>没 14:看错指标</li><li>没 15:告警刷屏 / 漏报</li><li>没 16:看不到 dashboard</li><li><strong>没 17:所有 13-16 的努力都被&quot;产品说先上&quot;瞬间抵消</strong></li></ul><p><strong>17 是 SLO 工程的承重墙</strong>——前面 4 篇是技术,17 是政治。<strong>政治不立,技术再好都浪费</strong>。</p><hr><blockquote><p>下一篇 <code>18-CICD心智.md</code>,SLO 工程层完结,<strong>第四层 CI/CD 与发布工程</strong>开始。从&quot;为什么 CI 必须快&quot;讲起,流水线分层、制品 vs 部署、为什么 80% 团队的发布流程都不及格。<strong>13-17 让你能&quot;承诺并兑现&quot;,18-23 让你能&quot;快速并安全地变更&quot;</strong>——发布质量直接决定错误预算消耗,所以错误预算政策的&quot;最大消耗源&quot;就是发布,18 篇开始我们专门攻这个。</p></blockquote>`,130)])])}const g=n(i,[["render",e]]);export{d as __pageData,g as default};
