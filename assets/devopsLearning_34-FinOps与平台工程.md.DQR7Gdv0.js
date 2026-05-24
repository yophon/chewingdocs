import{c as n,Q as a,j as p,m as l}from"./chunks/framework.Bhbi9jCp.js";const g=JSON.parse('{"title":"FinOps 与平台工程:成本可观测性 / 平台团队 / DevEx / 这个系列的终点","description":"","frontmatter":{},"headers":[],"relativePath":"devopsLearning/34-FinOps与平台工程.md","filePath":"devopsLearning/34-FinOps与平台工程.md","lastUpdated":1778496697000}'),e={name:"devopsLearning/34-FinOps与平台工程.md"};function i(t,s,o,c,r,h){return a(),p("div",null,[...s[0]||(s[0]=[l(`<h1 id="finops-与平台工程-成本可观测性-平台团队-devex-这个系列的终点" tabindex="-1">FinOps 与平台工程:成本可观测性 / 平台团队 / DevEx / 这个系列的终点 <a class="header-anchor" href="#finops-与平台工程-成本可观测性-平台团队-devex-这个系列的终点" aria-label="Permalink to &quot;FinOps 与平台工程:成本可观测性 / 平台团队 / DevEx / 这个系列的终点&quot;">​</a></h1><p>写到第 34 篇,这个系列要收尾了。</p><p>过去 33 篇里我们讲了一件事:<strong>怎么让一个生产系统可观测、可预测、可恢复、可演进</strong>。从 MTTR 到 SLO,从 GitOps 到混沌工程,从 On-call 到 Blameless 复盘——每一篇都是为了让你做的那个系统<strong>少出事 / 出事少 / 出事修得快 / 出事不重复</strong>。</p><p>这条路走完之后,一个问题永远绕不开:<strong>这一切要花多少钱</strong>?</p><p>00 篇我开了一张账单——&quot;MTTR / MTBF / Change Failure Rate&quot;是这个系列的三个核心数字。<strong>今天,在最后一篇,我们必须加上第四个数字:<code>$ / QPS</code></strong>(每 QPS 单位成本)。前三个让系统稳,第四个让系统<strong>可持续地稳</strong>——没有成本视角的可靠性,是公司还能撑就撑、撑不下去就裁员的奢侈品,<strong>不是工程</strong>。</p><p>这一篇还要回答一个更大的问题:<strong>SRE 这个工种,接下来五年要往哪里走?</strong>——答案是<strong>平台工程(Platform Engineering)</strong>。SRE 把&quot;可靠性&quot;做成了可度量的工程产品,平台工程在 SRE 的基础上,把&quot;内部研发体验&quot;也做成了可度量的工程产品。<strong>SRE 是为生产系统负责,平台工程是为研发团队负责</strong>——两件事最终在一个角色上汇合。</p><blockquote><p>一句话先记住:<strong>没有成本视角的可靠性不是工程,是奢侈品;没有平台视角的 SRE 不是 SRE,是高级运维</strong>。一个团队走到 100 人 / 500 微服务,会撞上两堵墙:云账单失控、新人 onboarding 越来越慢——<strong>这两堵墙正面撞过去就是组织事故,绕开它们的解法叫 FinOps 和 Platform Engineering</strong>。这一篇讲完,这个系列就完成它最后一块拼图——<strong>让你能回答&quot;我们的可靠性投入对得起这张账单吗&quot;</strong>。</p></blockquote><hr><h2 id="一、问题场景-为什么-finops-一定会撞上你" tabindex="-1">一、问题场景:为什么 FinOps 一定会撞上你 <a class="header-anchor" href="#一、问题场景-为什么-finops-一定会撞上你" aria-label="Permalink to &quot;一、问题场景:为什么 FinOps 一定会撞上你&quot;">​</a></h2><h3 id="_1-1-一张失控的账单是怎么长出来的" tabindex="-1">1.1 一张失控的账单是怎么长出来的 <a class="header-anchor" href="#_1-1-一张失控的账单是怎么长出来的" aria-label="Permalink to &quot;1.1 一张失控的账单是怎么长出来的&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>公司第一年:    云账单 5 万 / 月       谁也不在意</span></span>
<span class="line"><span>公司第二年:    云账单 25 万 / 月      &quot;正常增长&quot;</span></span>
<span class="line"><span>公司第三年:    云账单 120 万 / 月     CFO 开始拍桌子</span></span>
<span class="line"><span>公司第四年:    云账单 500 万 / 月     &quot;为什么会这样?&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>╔════════════════════════════════════════════════╗</span></span>
<span class="line"><span>║ 拆开看 500 万的明细:                          ║</span></span>
<span class="line"><span>║ ─────────────────────────────                  ║</span></span>
<span class="line"><span>║ EC2 / ECS:      200 万 (40%)                   ║</span></span>
<span class="line"><span>║   ├─ 60% 节点 CPU 利用率 &lt; 15%                  ║</span></span>
<span class="line"><span>║   ├─ 10 个 EKS 集群,3 个常年闲置                ║</span></span>
<span class="line"><span>║   └─ 30 台 c5.4xlarge,谁也说不清是谁的         ║</span></span>
<span class="line"><span>║                                                 ║</span></span>
<span class="line"><span>║ RDS:           80 万 (16%)                     ║</span></span>
<span class="line"><span>║   ├─ 4 个 db.r5.8xlarge 多副本                  ║</span></span>
<span class="line"><span>║   ├─ 测试环境配的和生产一样                       ║</span></span>
<span class="line"><span>║   └─ 一个废弃业务的库每月烧 8 万                  ║</span></span>
<span class="line"><span>║                                                 ║</span></span>
<span class="line"><span>║ 存储 / S3:      60 万 (12%)                     ║</span></span>
<span class="line"><span>║   ├─ 12PB 数据,无生命周期策略                   ║</span></span>
<span class="line"><span>║   └─ 60% 是一年没被访问过的日志和备份             ║</span></span>
<span class="line"><span>║                                                 ║</span></span>
<span class="line"><span>║ 网络流量:       70 万 (14%)                     ║</span></span>
<span class="line"><span>║   ├─ 跨可用区流量没人监控                        ║</span></span>
<span class="line"><span>║   └─ 一个 sidecar 错配,每月白烧 15 万           ║</span></span>
<span class="line"><span>║                                                 ║</span></span>
<span class="line"><span>║ 第三方服务:     50 万 (10%)                     ║</span></span>
<span class="line"><span>║   ├─ Datadog 没限 host,主机翻倍后账单翻倍       ║</span></span>
<span class="line"><span>║   └─ 一个废弃的 Snowflake 试用账户                ║</span></span>
<span class="line"><span>║                                                 ║</span></span>
<span class="line"><span>║ 其他:           40 万 (8%)                      ║</span></span>
<span class="line"><span>╚════════════════════════════════════════════════╝</span></span></code></pre></div><p><strong>这张账单的真相</strong>:<strong>60% 的钱花在了已经没人记得为什么开的资源上</strong>——这不是&quot;成本优化空间&quot;,这是<strong>已经损失的钱</strong>。</p><h3 id="_1-2-为什么研发不看账单-财务看不懂账单" tabindex="-1">1.2 为什么研发不看账单 / 财务看不懂账单 <a class="header-anchor" href="#_1-2-为什么研发不看账单-财务看不懂账单" aria-label="Permalink to &quot;1.2 为什么研发不看账单 / 财务看不懂账单&quot;">​</a></h3><p>这是 FinOps 出现的根本原因——<strong>云时代的成本问题不是&quot;花得多&quot;,是&quot;花的人和懂的人不是同一拨&quot;</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>传统 IT 时代:</span></span>
<span class="line"><span>   财务:   买服务器需要审批,知道每一台多少钱</span></span>
<span class="line"><span>   研发:   申请资源要走流程,知道哪台是自己的</span></span>
<span class="line"><span>   ↓</span></span>
<span class="line"><span>   成本和使用紧密耦合,审批就是天然的成本控制</span></span>
<span class="line"><span></span></span>
<span class="line"><span>云时代:</span></span>
<span class="line"><span>   研发:   一行 terraform apply 就开 100 台,不看价格</span></span>
<span class="line"><span>   财务:   只收到月底账单,看到 &quot;EC2: 800万&quot;,不知道哪些服务用了</span></span>
<span class="line"><span>   ↓</span></span>
<span class="line"><span>   成本和使用完全脱钩,等账单来才发现问题,**已经晚了 30 天**</span></span></code></pre></div><p><strong>这个 30 天滞后是云账单失控的核心机制</strong>。研发开的资源,30 天后才进财务视野;<strong>等财务问出来,资源已经在那儿烧了 30 天 × 24 小时</strong>。</p><h3 id="_1-3-中型团队什么时候撞上这堵墙" tabindex="-1">1.3 中型团队什么时候撞上这堵墙 <a class="header-anchor" href="#_1-3-中型团队什么时候撞上这堵墙" aria-label="Permalink to &quot;1.3 中型团队什么时候撞上这堵墙&quot;">​</a></h3><table tabindex="0"><thead><tr><th>团队规模</th><th>月度云账单</th><th>状态</th></tr></thead><tbody><tr><td>&lt; 10 人</td><td>&lt; 5 万</td><td>谁也不在意</td></tr><tr><td>10-50 人</td><td>5-50 万</td><td>开始有人嫌贵,但不知道找谁</td></tr><tr><td>50-200 人</td><td>50-300 万</td><td><strong>必须有 FinOps 实践</strong>,撞墙临界点</td></tr><tr><td>200+ 人</td><td>300+ 万</td><td>必须有专职 FinOps 团队</td></tr></tbody></table><p><strong>10 人 / 100 微服务 / 5000 QPS 这个 size 的团队,大概率正处在 5-50 万这个区间</strong>——FinOps 还可以&quot;做轻量&quot;,但已经不能完全不管。<strong>这一篇主要服务这一档</strong>。</p><hr><h2 id="二、finops-是什么-把财务、研发、产品拉到同一张桌子" tabindex="-1">二、FinOps 是什么:把财务、研发、产品拉到同一张桌子 <a class="header-anchor" href="#二、finops-是什么-把财务、研发、产品拉到同一张桌子" aria-label="Permalink to &quot;二、FinOps 是什么:把财务、研发、产品拉到同一张桌子&quot;">​</a></h2><h3 id="_2-1-finops-的定义" tabindex="-1">2.1 FinOps 的定义 <a class="header-anchor" href="#_2-1-finops-的定义" aria-label="Permalink to &quot;2.1 FinOps 的定义&quot;">​</a></h3><p>FinOps = <strong>Financial Operations</strong>,但读音和精神都是冲着 <strong>DevOps</strong> 来的——<strong>把财务也拉进 DevOps 的迭代闭环</strong>。</p><p>FinOps Foundation 给了一个定义:</p><blockquote><p>&quot;FinOps 是一种运营框架和文化实践,通过让工程、财务、技术团队和业务团队协作,最大化云的业务价值,实现数据驱动的成本决策。&quot;</p></blockquote><p>把这段官话翻译成中型团队听得懂的:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>FinOps 不是&quot;省钱运动&quot;,是&quot;让花钱的人看得到价钱、</span></span>
<span class="line"><span>让数账单的人听得懂技术、让产品决策的人能比&#39;这个 feature 值不值&#39;&quot;。</span></span>
<span class="line"><span></span></span>
<span class="line"><span>它的三个能力:</span></span>
<span class="line"><span>   1. See (看见): 谁在用 / 用了多少 / 花了多少</span></span>
<span class="line"><span>   2. Inform (告知): 把账单翻译成研发能理解的维度</span></span>
<span class="line"><span>   3. Control (控制): 在花钱之前 / 花完之后做决策</span></span></code></pre></div><h3 id="_2-2-finops-的三阶段" tabindex="-1">2.2 FinOps 的三阶段 <a class="header-anchor" href="#_2-2-finops-的三阶段" aria-label="Permalink to &quot;2.2 FinOps 的三阶段&quot;">​</a></h3><p>FinOps Foundation 给了一个&quot;Crawl / Walk / Run&quot;模型:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Crawl (爬):</span></span>
<span class="line"><span>   - 月度账单按维度切分,知道大头在哪</span></span>
<span class="line"><span>   - 标 tag 给主要服务</span></span>
<span class="line"><span>   - 关掉明显废弃的资源</span></span>
<span class="line"><span>   后果:  砍 10-30% 的明显浪费</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Walk (走):</span></span>
<span class="line"><span>   - 每个服务 / 团队的成本可见</span></span>
<span class="line"><span>   - 异常波动自动告警</span></span>
<span class="line"><span>   - Reserved Instance / Savings Plan</span></span>
<span class="line"><span>   后果:  再砍 10-20%</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Run (跑):</span></span>
<span class="line"><span>   - 每个 feature 的 ROI 可算</span></span>
<span class="line"><span>   - 研发上线前看成本预估</span></span>
<span class="line"><span>   - 平台层有 Quota 和成本预算</span></span>
<span class="line"><span>   后果:  从&quot;省钱&quot;升级到&quot;用钱买价值&quot;</span></span></code></pre></div><p><strong>中型团队的目标:做到 Walk</strong>。Run 是大公司的奢侈品,不要硬上——<strong>Run 阶段的工程成本可能比 Walk 阶段省下来的钱还多</strong>。</p><h3 id="_2-3-finops-不是省钱-是归因" tabindex="-1">2.3 FinOps 不是省钱,是归因 <a class="header-anchor" href="#_2-3-finops-不是省钱-是归因" aria-label="Permalink to &quot;2.3 FinOps 不是省钱,是归因&quot;">​</a></h3><p>新手最常见的误解:<strong>&quot;FinOps 就是教你省钱&quot;</strong>——错。</p><p><strong>省钱是结果,归因是手段</strong>。FinOps 真正在做的事:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>没有 FinOps:</span></span>
<span class="line"><span>   云账单 100 万 → &quot;怎么这么多&quot; → &quot;我们再砍砍预算&quot;</span></span>
<span class="line"><span>   ↓</span></span>
<span class="line"><span>   研发被迫缩减资源 → 服务变慢 → 业务投诉 → 加回来</span></span>
<span class="line"><span></span></span>
<span class="line"><span>有 FinOps:</span></span>
<span class="line"><span>   云账单 100 万 → </span></span>
<span class="line"><span>   - 业务线 A (核心交易): 30 万,带来 5000 万 GMV  → 高 ROI,保</span></span>
<span class="line"><span>   - 业务线 B (推荐系统): 20 万,A/B 测试效果 +0.1% → 低 ROI,砍</span></span>
<span class="line"><span>   - 业务线 C (大数据): 50 万,3 个分析师在用      → 重新讨论是否合理</span></span>
<span class="line"><span>   ↓</span></span>
<span class="line"><span>   决策有依据,不再是&quot;管理层拍脑袋砍预算&quot;</span></span></code></pre></div><p><strong>FinOps 把成本变成了和功能、性能、可靠性并列的产品维度</strong>——可以衡量、可以归因、可以做决策。</p><hr><h2 id="三、成本归因-finops-的核心工程问题" tabindex="-1">三、成本归因:FinOps 的核心工程问题 <a class="header-anchor" href="#三、成本归因-finops-的核心工程问题" aria-label="Permalink to &quot;三、成本归因:FinOps 的核心工程问题&quot;">​</a></h2><h3 id="_3-1-归因维度-服务-团队-feature" tabindex="-1">3.1 归因维度:服务 / 团队 / Feature <a class="header-anchor" href="#_3-1-归因维度-服务-团队-feature" aria-label="Permalink to &quot;3.1 归因维度:服务 / 团队 / Feature&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌─────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│            FinOps 成本归因                                  │</span></span>
<span class="line"><span>└─────────────────────────────────────────────────────────────┘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>云账单 (1,000,000 / 月)</span></span>
<span class="line"><span>    │</span></span>
<span class="line"><span>    │  按 Tag / Label 拆</span></span>
<span class="line"><span>    │</span></span>
<span class="line"><span>    ├─→ 服务维度</span></span>
<span class="line"><span>    │     ├─ order-api       (180k)  ← 团队 A</span></span>
<span class="line"><span>    │     ├─ payment-svc     (120k)  ← 团队 A</span></span>
<span class="line"><span>    │     ├─ search          (200k)  ← 团队 B</span></span>
<span class="line"><span>    │     ├─ recommendation  (150k)  ← 团队 C</span></span>
<span class="line"><span>    │     ├─ data-pipeline   (200k)  ← 团队 D</span></span>
<span class="line"><span>    │     └─ shared (LB/DNS/Net)   (150k)  ← 平台</span></span>
<span class="line"><span>    │</span></span>
<span class="line"><span>    ├─→ 团队维度</span></span>
<span class="line"><span>    │     ├─ 团队 A:    300k  → 对应 X 业务收入</span></span>
<span class="line"><span>    │     ├─ 团队 B:    200k  → 对应 Y 业务收入</span></span>
<span class="line"><span>    │     ├─ 团队 C:    150k  → A/B 实验 feature</span></span>
<span class="line"><span>    │     ├─ 团队 D:    200k  → 数据分析</span></span>
<span class="line"><span>    │     └─ 平台:      150k  → 横向支撑</span></span>
<span class="line"><span>    │</span></span>
<span class="line"><span>    ├─→ 环境维度</span></span>
<span class="line"><span>    │     ├─ prod:       650k  (65%)</span></span>
<span class="line"><span>    │     ├─ staging:    180k  (18%) ← 这个比例正常吗?</span></span>
<span class="line"><span>    │     ├─ dev:        120k  (12%) ← 永远在跑的开发环境</span></span>
<span class="line"><span>    │     └─ test:        50k  (5%)</span></span>
<span class="line"><span>    │</span></span>
<span class="line"><span>    └─→ Feature 维度 (高阶,需要业务侧 instrumentation)</span></span>
<span class="line"><span>          ├─ 推荐主路径:        80k</span></span>
<span class="line"><span>          ├─ A/B 实验 X:        50k</span></span>
<span class="line"><span>          ├─ A/B 实验 Y:        20k</span></span>
<span class="line"><span>          └─ 视频转码:         150k</span></span>
<span class="line"><span>                                ↑</span></span>
<span class="line"><span>                       这个 feature 值不值</span></span>
<span class="line"><span>                       150k? 决策依据在这里</span></span></code></pre></div><p><strong>这张图的精髓不在数字,在&quot;标签是怎么打上去的&quot;</strong>——没有 tag,就没有归因。</p><h3 id="_3-2-tag-策略-从一开始就要规划" tabindex="-1">3.2 Tag 策略:从一开始就要规划 <a class="header-anchor" href="#_3-2-tag-策略-从一开始就要规划" aria-label="Permalink to &quot;3.2 Tag 策略:从一开始就要规划&quot;">​</a></h3><p>最常见的 Tag 维度:</p><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 强制 tag 策略 (terraform / cloudformation 必须带)</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">tags</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  team</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;trade&quot;</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">               # 团队</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  service</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;order-api&quot;</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">        # 服务</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  env</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;prod&quot;</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                 # 环境</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  business_unit</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;ecommerce&quot;</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  # 业务线</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  cost_center</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;BU-001&quot;</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">       # 成本中心 (对应财务系统)</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  owner</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;zhangsan@xxx.com&quot;</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">   # 负责人</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  created_by</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;terraform&quot;</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">     # 创建方式</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  managed_by</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;argocd&quot;</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">        # 管理工具</span></span></code></pre></div><p><strong>为什么 cost_center 关键</strong>:这是<strong>云账单和财务系统对接的桥</strong>。财务的 ERP 里每个 cost_center 都对应一个预算和审批权限,<strong>云账单按 cost_center 切分后,可以直接进财务报表</strong>——这就是从&quot;工程账单&quot;翻译成&quot;财务账单&quot;。</p><h3 id="_3-3-反模式-k8s-上的归因黑洞" tabindex="-1">3.3 反模式:K8s 上的归因黑洞 <a class="header-anchor" href="#_3-3-反模式-k8s-上的归因黑洞" aria-label="Permalink to &quot;3.3 反模式:K8s 上的归因黑洞&quot;">​</a></h3><p><strong>Kubernetes 集群是 FinOps 的最大盲区</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>没有 K8s 视角的归因:</span></span>
<span class="line"><span>   云账单显示: EC2 c5.4xlarge × 30 台 = 50 万 / 月</span></span>
<span class="line"><span>              └─ tag: env=prod, team=platform</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   但是这 30 台机器上跑了:</span></span>
<span class="line"><span>      - 团队 A 的 12 个服务</span></span>
<span class="line"><span>      - 团队 B 的 8 个服务</span></span>
<span class="line"><span>      - 团队 C 的 5 个服务</span></span>
<span class="line"><span>      - 平台自己的 monitoring / logging</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   云厂商只知道这 30 台都是&quot;平台&quot;的,</span></span>
<span class="line"><span>   实际成本应该按 pod 资源用量归到各团队</span></span></code></pre></div><p><strong>K8s 的归因需要专门的工具</strong> —— 这就是 Kubecost / OpenCost 存在的原因。</p><h3 id="_3-4-kubecost-opencost-k8s-维度的成本视角" tabindex="-1">3.4 Kubecost / OpenCost:K8s 维度的成本视角 <a class="header-anchor" href="#_3-4-kubecost-opencost-k8s-维度的成本视角" aria-label="Permalink to &quot;3.4 Kubecost / OpenCost:K8s 维度的成本视角&quot;">​</a></h3><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Kubecost 的部署最小化(Helm chart)</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">helm install kubecost \\</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  --repo https://kubecost.github.io/cost-analyzer/ cost-analyzer \\</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  -n kubecost --create-namespace \\</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  --set kubecostToken=&quot;...&quot; \\</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  --set prometheus.server.persistentVolume.size=64Gi \\</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  --set persistentVolume.size=32Gi</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 关键配置(values.yaml)</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">networkCosts</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  enabled</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">true</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                  # 跟踪跨 AZ / 跨 region 流量(很容易超支)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">reporting</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  productAnalytics</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">false</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">        # 不上传 telemetry 到 Kubecost</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  </span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">prometheus</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  fqdn</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">http://prometheus-server</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"> # 复用已有 Prometheus,别再起一个</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 关键:label 必须打全,否则归因失败</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">extraLabels</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  team</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">required</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                 # pod 必须有 team label</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  service</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">required</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  env</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">required</span></span></code></pre></div><p><strong>Kubecost 给的视角</strong>(也就是 OpenCost 那套):</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>按 namespace 看:</span></span>
<span class="line"><span>   trade           120k / month   (24% of cluster)</span></span>
<span class="line"><span>   search           80k / month   (16%)</span></span>
<span class="line"><span>   recommend        90k / month   (18%)</span></span>
<span class="line"><span>   platform         60k / month   (12%)</span></span>
<span class="line"><span>   ...</span></span>
<span class="line"><span></span></span>
<span class="line"><span>按 deployment 看:</span></span>
<span class="line"><span>   trade/order-api       40k     (运行 80 个副本)</span></span>
<span class="line"><span>   trade/payment-svc     30k     (运行 40 个副本)</span></span>
<span class="line"><span>   ...</span></span>
<span class="line"><span></span></span>
<span class="line"><span>按 label 看(team=A):</span></span>
<span class="line"><span>   total: 250k</span></span>
<span class="line"><span>   - allocated (实际请求): 180k</span></span>
<span class="line"><span>   - idle (浪费):           70k    ← 这块是优化空间</span></span></code></pre></div><h3 id="_3-5-取舍-kubecost-不是免费午餐" tabindex="-1">3.5 取舍:Kubecost 不是免费午餐 <a class="header-anchor" href="#_3-5-取舍-kubecost-不是免费午餐" aria-label="Permalink to &quot;3.5 取舍:Kubecost 不是免费午餐&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Kubecost 的代价:</span></span>
<span class="line"><span>   - 部署本身占用资源(monitoring + DB)</span></span>
<span class="line"><span>   - 商用版收钱,免费版功能受限</span></span>
<span class="line"><span>   - 准确度依赖 label 完整度,label 不完整时数据是错的</span></span>
<span class="line"><span>   - K8s 之外的资源(RDS / S3 / Lambda)它不管</span></span>
<span class="line"><span></span></span>
<span class="line"><span>中型团队的选择:</span></span>
<span class="line"><span>   ✓ 开源 OpenCost (Kubecost 的开源核心) + 自建 Prometheus + Grafana</span></span>
<span class="line"><span>   △ Kubecost 商用版 (10 人团队不值)</span></span>
<span class="line"><span>   ✗ 自己写归因(看似省钱,工程成本巨高)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>边界:</span></span>
<span class="line"><span>   - K8s 资源 80% 以上的团队: 必上 Kubecost / OpenCost</span></span>
<span class="line"><span>   - 主要在 VM / Lambda 上的: 用云厂商原生工具就够</span></span></code></pre></div><hr><h2 id="四、云厂商工具-商用-finops-平台-怎么选" tabindex="-1">四、云厂商工具 + 商用 FinOps 平台:怎么选 <a class="header-anchor" href="#四、云厂商工具-商用-finops-平台-怎么选" aria-label="Permalink to &quot;四、云厂商工具 + 商用 FinOps 平台:怎么选&quot;">​</a></h2><h3 id="_4-1-云厂商原生-不要小看" tabindex="-1">4.1 云厂商原生:不要小看 <a class="header-anchor" href="#_4-1-云厂商原生-不要小看" aria-label="Permalink to &quot;4.1 云厂商原生:不要小看&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>AWS Cost Explorer / Cost Anomaly Detection</span></span>
<span class="line"><span>Azure Cost Management</span></span>
<span class="line"><span>阿里云费用中心 / 腾讯云费用管理</span></span>
<span class="line"><span></span></span>
<span class="line"><span>优点:</span></span>
<span class="line"><span>   - 免费</span></span>
<span class="line"><span>   - 数据最准(就是它自己的账单)</span></span>
<span class="line"><span>   - 集成最深</span></span>
<span class="line"><span></span></span>
<span class="line"><span>缺点:</span></span>
<span class="line"><span>   - 多云不支持</span></span>
<span class="line"><span>   - K8s 视角弱</span></span>
<span class="line"><span>   - 高级分析功能要付费</span></span></code></pre></div><p><strong>10 人团队的起步</strong>:<strong>直接用云厂商原生工具,加 Tag 策略,加月度回顾</strong>——能解决 80% 问题,0 工程成本。</p><h3 id="_4-2-商用-finops-平台" tabindex="-1">4.2 商用 FinOps 平台 <a class="header-anchor" href="#_4-2-商用-finops-平台" aria-label="Permalink to &quot;4.2 商用 FinOps 平台&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Apptio Cloudability   - 老牌,企业级,贵</span></span>
<span class="line"><span>CloudHealth (VMware)  - 多云,集成深,贵</span></span>
<span class="line"><span>Spot.io               - Reserved Instance 优化为主</span></span>
<span class="line"><span>Vantage              - 轻量,SaaS,中型团队友好</span></span>
<span class="line"><span>Datadog Cost Insights - 如果已经用 Datadog 监控,顺手开</span></span></code></pre></div><p><strong>取舍</strong>:中型团队上商用平台<strong>最大的坑是 license 费贵过省下来的钱</strong>。算一笔账:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>团队规模: 100 微服务,云账单 50 万 / 月 = 600 万 / 年</span></span>
<span class="line"><span>FinOps 平台费: 假设 60 万 / 年 (高端)</span></span>
<span class="line"><span>能优化的空间: 10-20% = 60-120 万 / 年</span></span>
<span class="line"><span></span></span>
<span class="line"><span>回本周期: 0.5-1 年 → 边缘可上</span></span>
<span class="line"><span>但如果云账单只有 100 万 / 年:</span></span>
<span class="line"><span>   平台费 60 万 vs 优化空间 10-20 万 → 不值</span></span></code></pre></div><p><strong>经验</strong>:云账单年度 &gt; 500 万,才考虑商用 FinOps 平台,<strong>否则用云厂商原生 + Kubecost 开源版 + 月度人工 review 足够</strong>。</p><h3 id="_4-3-datadog-cost-insights-是个特例" tabindex="-1">4.3 Datadog Cost Insights 是个特例 <a class="header-anchor" href="#_4-3-datadog-cost-insights-是个特例" aria-label="Permalink to &quot;4.3 Datadog Cost Insights 是个特例&quot;">​</a></h3><p>如果你的可观测性栈已经在 Datadog 上,<strong>它的 Cost Insights 模块顺手开</strong>——成本和监控数据在同一个地方,可以直接画&quot;延迟 vs 成本&quot;的图。但<strong>不要为了这个功能上 Datadog</strong>——Datadog 本身就是云成本的一个大头。</p><hr><h2 id="五、finops-的反模式" tabindex="-1">五、FinOps 的反模式 <a class="header-anchor" href="#五、finops-的反模式" aria-label="Permalink to &quot;五、FinOps 的反模式&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>反模式 1: 研发不看账单</span></span>
<span class="line"><span>   症状: &quot;账单是财务管的&quot;</span></span>
<span class="line"><span>   后果: 资源开了就忘,3 个月才发现</span></span>
<span class="line"><span>   修复: 每周一次&quot;团队成本邮件&quot;,自动推给每个 owner</span></span>
<span class="line"><span></span></span>
<span class="line"><span>反模式 2: 财务看不懂账单</span></span>
<span class="line"><span>   症状: &quot;EC2 是什么,为什么这么多?&quot;</span></span>
<span class="line"><span>   后果: 财务只能问&quot;能不能砍 20%&quot;,一刀切</span></span>
<span class="line"><span>   修复: FinOps 工程师做翻译层,</span></span>
<span class="line"><span>        把账单切成&quot;团队 × 业务&quot;的财务可读维度</span></span>
<span class="line"><span></span></span>
<span class="line"><span>反模式 3: 只盯账单大头</span></span>
<span class="line"><span>   症状: &quot;EC2 是大头,砍 EC2&quot;</span></span>
<span class="line"><span>   后果: 砍掉之后服务挂了,实际成本(事故损失)更高</span></span>
<span class="line"><span>   修复: 看&quot;ROI&quot;——一个服务每月烧 50 万但带来 5000 万收入,</span></span>
<span class="line"><span>        它不该被砍</span></span>
<span class="line"><span></span></span>
<span class="line"><span>反模式 4: 一刀切 reserved instance</span></span>
<span class="line"><span>   症状: &quot;三年 RI 便宜,我们都买&quot;</span></span>
<span class="line"><span>   后果: 业务调整后这些 RI 浪费,锁定 36 个月</span></span>
<span class="line"><span>   修复: 70% 用量买 RI / Savings Plan, 30% 用 on-demand 抗弹性</span></span>
<span class="line"><span></span></span>
<span class="line"><span>反模式 5: 闲置 staging / dev</span></span>
<span class="line"><span>   症状: 研发环境永远在跑,周末和半夜也在烧</span></span>
<span class="line"><span>   后果: 非 prod 环境占了 30% 账单</span></span>
<span class="line"><span>   修复: 自动关停(夜间 / 周末),开发时自动唤醒</span></span>
<span class="line"><span></span></span>
<span class="line"><span>反模式 6: 跨可用区流量</span></span>
<span class="line"><span>   症状: 一个 sidecar 配错,数据来回穿可用区</span></span>
<span class="line"><span>   后果: 网络费翻倍,看不出来</span></span>
<span class="line"><span>   修复: 跨 AZ 流量必须监控,异常增长自动告警</span></span>
<span class="line"><span></span></span>
<span class="line"><span>反模式 7: 监控数据本身的成本</span></span>
<span class="line"><span>   症状: Prometheus 存了 30 天高基数指标 + Datadog 全主机付费</span></span>
<span class="line"><span>   后果: 监控费占了 15% 总账单</span></span>
<span class="line"><span>   修复: 监控数据也走采样 / 长期降采样</span></span>
<span class="line"><span></span></span>
<span class="line"><span>反模式 8: 完美主义优化</span></span>
<span class="line"><span>   症状: 一个工程师花 1 个月优化一个每月 5 千的服务</span></span>
<span class="line"><span>   后果: 工程成本 &gt; 优化空间</span></span>
<span class="line"><span>   修复: 按 &quot;潜在节省 / 优化工时&quot; 排序,先做高 ROI 的</span></span></code></pre></div><hr><h2 id="六、平台工程-sre-的下一站" tabindex="-1">六、平台工程:SRE 的下一站 <a class="header-anchor" href="#六、平台工程-sre-的下一站" aria-label="Permalink to &quot;六、平台工程:SRE 的下一站&quot;">​</a></h2><p>成本视角讲完了,我们要看 SRE 这个工种本身的进化。</p><h3 id="_6-1-平台团队-运维团队" tabindex="-1">6.1 平台团队 ≠ 运维团队 <a class="header-anchor" href="#_6-1-平台团队-运维团队" aria-label="Permalink to &quot;6.1 平台团队 ≠ 运维团队&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>传统运维团队:</span></span>
<span class="line"><span>   &quot;请帮我开台机器&quot;</span></span>
<span class="line"><span>   &quot;请帮我配 nginx&quot;</span></span>
<span class="line"><span>   &quot;请帮我看下日志&quot;</span></span>
<span class="line"><span>   工作模式: 工单驱动 / 被动响应</span></span>
<span class="line"><span>   产出: 一次性服务</span></span>
<span class="line"><span></span></span>
<span class="line"><span>SRE 团队:</span></span>
<span class="line"><span>   &quot;我帮你写 Runbook / SLO / 告警&quot;</span></span>
<span class="line"><span>   &quot;我帮你做混沌演练&quot;</span></span>
<span class="line"><span>   工作模式: 项目驱动 / 主动改进</span></span>
<span class="line"><span>   产出: 工程项目 + 文档</span></span>
<span class="line"><span></span></span>
<span class="line"><span>平台工程团队:</span></span>
<span class="line"><span>   &quot;我做了一个内部门户,你点几下就能开服务&quot;</span></span>
<span class="line"><span>   &quot;我做了一套 GitOps 模板,你 fork 一下就能上线&quot;</span></span>
<span class="line"><span>   &quot;我做了一套预算告警,你自己看就懂&quot;</span></span>
<span class="line"><span>   工作模式: 产品驱动 / 自服务</span></span>
<span class="line"><span>   产出: 内部产品 (Internal Developer Platform, IDP)</span></span></code></pre></div><p><strong>关键区别</strong>:平台团队<strong>把自己的能力做成内部产品</strong>——研发可以自助使用,<strong>不需要每次都找平台团队开工单</strong>。</p><h3 id="_6-2-演进图-devops-→-sre-→-platform-engineering" tabindex="-1">6.2 演进图:DevOps → SRE → Platform Engineering <a class="header-anchor" href="#_6-2-演进图-devops-→-sre-→-platform-engineering" aria-label="Permalink to &quot;6.2 演进图:DevOps → SRE → Platform Engineering&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌─────────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│                                                                 │</span></span>
<span class="line"><span>│              DevOps / SRE / Platform Engineering 演进           │</span></span>
<span class="line"><span>│                                                                 │</span></span>
<span class="line"><span>├──────────────┬─────────────┬─────────────┬────────────────────┤</span></span>
<span class="line"><span>│              │   DevOps    │     SRE     │ Platform Engineering│</span></span>
<span class="line"><span>│              │ (2009~)     │   (2003~)   │   (2020s 兴起)     │</span></span>
<span class="line"><span>├──────────────┼─────────────┼─────────────┼────────────────────┤</span></span>
<span class="line"><span>│ 解决的问题   │ 开发运维     │ 可靠性是    │ 研发体验是          │</span></span>
<span class="line"><span>│              │ 协作问题     │ 工程问题    │ 产品问题            │</span></span>
<span class="line"><span>├──────────────┼─────────────┼─────────────┼────────────────────┤</span></span>
<span class="line"><span>│ 核心动作     │ 打破墙       │ 量化目标    │ 做内部产品          │</span></span>
<span class="line"><span>│              │ 自动化       │ 错误预算    │ 自服务平台          │</span></span>
<span class="line"><span>│              │ CI / CD     │ Runbook    │ IDP / Backstage     │</span></span>
<span class="line"><span>├──────────────┼─────────────┼─────────────┼────────────────────┤</span></span>
<span class="line"><span>│ 角色心智     │ &quot;都要懂点&quot;   │ &quot;用软件方法 │ &quot;做内部 SaaS&quot;      │</span></span>
<span class="line"><span>│              │             │ 做运维&quot;     │                    │</span></span>
<span class="line"><span>├──────────────┼─────────────┼─────────────┼────────────────────┤</span></span>
<span class="line"><span>│ KPI         │ 部署频率     │ SLO 达成率   │ DevEx 指标         │</span></span>
<span class="line"><span>│              │ MTTR        │ 错误预算    │ 新人 onboard 时间   │</span></span>
<span class="line"><span>│              │             │ Toil 比例   │ PR 到 prod 时间    │</span></span>
<span class="line"><span>├──────────────┼─────────────┼─────────────┼────────────────────┤</span></span>
<span class="line"><span>│ 触发条件     │ 5-50 人      │ 50-200 人  │ 200+ 人 / 50+ 服务  │</span></span>
<span class="line"><span>└──────────────┴─────────────┴─────────────┴────────────────────┘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>                       ↓ 关系 ↓</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   不是替代,是叠加:</span></span>
<span class="line"><span>      Platform Engineering 必须建在 SRE 之上,</span></span>
<span class="line"><span>      SRE 必须建在 DevOps 之上 —— 跳级会塌。</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   一个团队的成熟度:</span></span>
<span class="line"><span>      看 DevOps 做没做 → 看 SRE 做没做 → 才考虑 Platform</span></span></code></pre></div><h3 id="_6-3-中型团队需要平台工程吗" tabindex="-1">6.3 中型团队需要平台工程吗 <a class="header-anchor" href="#_6-3-中型团队需要平台工程吗" aria-label="Permalink to &quot;6.3 中型团队需要平台工程吗&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>不需要的信号:</span></span>
<span class="line"><span>   - 团队 &lt; 50 人,服务 &lt; 50 个</span></span>
<span class="line"><span>   - 研发自助还能跑通(K8s + ArgoCD 模板,新人能照着搭)</span></span>
<span class="line"><span>   - SRE 没做透(SLO / On-call / 复盘还没建)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>需要的信号:</span></span>
<span class="line"><span>   - 团队 &gt; 100 人,服务 &gt; 100 个</span></span>
<span class="line"><span>   - 新员工 onboard &gt; 2 周才能跑通本地环境</span></span>
<span class="line"><span>   - 同一个流程,各团队各自实现一套</span></span>
<span class="line"><span>   - SRE 团队被工单淹没,做不了工程</span></span>
<span class="line"><span></span></span>
<span class="line"><span>中型团队 (10 人 / 100 微服务) 的现实:</span></span>
<span class="line"><span>   - 没有专职平台团队</span></span>
<span class="line"><span>   - 但是有&quot;平台工程的思路&quot;:</span></span>
<span class="line"><span>     - 一套统一的 K8s + ArgoCD 模板</span></span>
<span class="line"><span>     - 一套统一的 Runbook 格式</span></span>
<span class="line"><span>     - 一套统一的 SLO 模板</span></span>
<span class="line"><span>     - 一套统一的成本归因 dashboard</span></span>
<span class="line"><span>   - 这些&quot;模板&quot;就是中型团队的&quot;内部产品&quot;</span></span></code></pre></div><p><strong>关键洞察</strong>:<strong>平台工程不是&quot;团队&quot;,是&quot;心智&quot;</strong>——10 人团队也可以用平台工程的方式做事,<strong>核心是&quot;把重复的事做成产品,而不是每次都重写&quot;</strong>。</p><hr><h2 id="七、devex-平台工程的-kpi" tabindex="-1">七、DevEx:平台工程的 KPI <a class="header-anchor" href="#七、devex-平台工程的-kpi" aria-label="Permalink to &quot;七、DevEx:平台工程的 KPI&quot;">​</a></h2><h3 id="_7-1-几个硬指标" tabindex="-1">7.1 几个硬指标 <a class="header-anchor" href="#_7-1-几个硬指标" aria-label="Permalink to &quot;7.1 几个硬指标&quot;">​</a></h3><p>DevEx(Developer Experience)是平台工程的<strong>KPI</strong>——和 SRE 的 SLO 等价。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>核心指标:</span></span>
<span class="line"><span>   - 新员工第一行代码上线时间   (目标: &lt; 1 周)</span></span>
<span class="line"><span>   - PR 提交到 review 时间       (目标: &lt; 4 小时)</span></span>
<span class="line"><span>   - PR 通过到 prod 时间         (目标: &lt; 1 天)</span></span>
<span class="line"><span>   - 部署频率(per team / day)  (目标: &gt; 1 次 / 天)</span></span>
<span class="line"><span>   - 部署失败率                 (目标: &lt; 5%)</span></span>
<span class="line"><span>   - 本地环境跑通时间            (目标: &lt; 30 分钟)</span></span>
<span class="line"><span>   - 文档查找命中率              (目标: &gt; 80%)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>进阶指标:</span></span>
<span class="line"><span>   - 跨团队 incident 召集时间    (是不是有&quot;找谁&quot;的盲区)</span></span>
<span class="line"><span>   - 工程师周报里的&quot;被打断次数&quot;  (代理 Toil 指标)</span></span>
<span class="line"><span>   - 工具切换次数               (开个新服务要点几个工具)</span></span></code></pre></div><h3 id="_7-2-dora-指标-工业界共识" tabindex="-1">7.2 DORA 指标:工业界共识 <a class="header-anchor" href="#_7-2-dora-指标-工业界共识" aria-label="Permalink to &quot;7.2 DORA 指标:工业界共识&quot;">​</a></h3><p>Google DORA 团队提出的 4 个指标(2018 年起),被广泛采用为研发效能的&quot;黄金标准&quot;:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. Deployment Frequency (部署频率)</span></span>
<span class="line"><span>2. Lead Time for Changes (代码提交到上线的时间)</span></span>
<span class="line"><span>3. Change Failure Rate (发布失败率)  ← 这个系列开篇就提了</span></span>
<span class="line"><span>4. Time to Restore Service (MTTR)    ← 这个系列开篇就提了</span></span></code></pre></div><p><strong>注意</strong>:DORA 的 4 个指标里,<strong>2 个就是这个系列开篇讲的核心数字</strong>(Change Failure Rate / MTTR)。<strong>SRE 和平台工程在指标上的交集就是 DORA</strong>——这两个工种从两个方向逼近同一个目标:<strong>让研发团队又快又稳地把代码送到用户</strong>。</p><h3 id="_7-3-dora-elite-团队的水位" tabindex="-1">7.3 DORA Elite 团队的水位 <a class="header-anchor" href="#_7-3-dora-elite-团队的水位" aria-label="Permalink to &quot;7.3 DORA Elite 团队的水位&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                Elite       High       Medium     Low</span></span>
<span class="line"><span>                ─────       ────       ──────     ───</span></span>
<span class="line"><span>部署频率         &gt; 1/天      1/周-1/月  1/月-6/月   &lt; 6/月</span></span>
<span class="line"><span>Lead Time       &lt; 1 小时    1 天-1 周  1 周-1 月  &gt; 6 月</span></span>
<span class="line"><span>Change Failure  &lt; 15%       16-30%     16-30%     &gt; 60%</span></span>
<span class="line"><span>MTTR            &lt; 1 小时    &lt; 1 天     &lt; 1 天     &gt; 6 月</span></span></code></pre></div><p><strong>中型团队 (10 人 / 100 微服务) 的现实目标</strong>:Medium → High 这一档(部署每天 1-N 次 / Change Failure &lt; 20% / MTTR &lt; 4 小时)。<strong>追 Elite 是骗 KPI</strong>,<strong>Medium 以下是工程没做好</strong>。</p><hr><h2 id="八、内部开发者平台-idp-backstage-port-cortex" tabindex="-1">八、内部开发者平台(IDP):Backstage / Port / Cortex <a class="header-anchor" href="#八、内部开发者平台-idp-backstage-port-cortex" aria-label="Permalink to &quot;八、内部开发者平台(IDP):Backstage / Port / Cortex&quot;">​</a></h2><h3 id="_8-1-什么是-idp" tabindex="-1">8.1 什么是 IDP <a class="header-anchor" href="#_8-1-什么是-idp" aria-label="Permalink to &quot;8.1 什么是 IDP&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>没有 IDP 的研发流程:</span></span>
<span class="line"><span>   1. 开新服务 → 找平台团队建项目</span></span>
<span class="line"><span>   2. 配 CI/CD → 复制别人的 .github/workflows</span></span>
<span class="line"><span>   3. 配监控   → 找 SRE 帮忙加 dashboard</span></span>
<span class="line"><span>   4. 配告警   → 抄 PrometheusRule</span></span>
<span class="line"><span>   5. 上线     → 找 ArgoCD owner 加 app</span></span>
<span class="line"><span>   6. 出事     → 找客服 / 找 Runbook / 找 SRE</span></span>
<span class="line"><span>   ↓</span></span>
<span class="line"><span>   每一步都要找人 / 翻 wiki</span></span>
<span class="line"><span>   新人 onboard 平均 2-4 周</span></span>
<span class="line"><span></span></span>
<span class="line"><span>有 IDP 的研发流程:</span></span>
<span class="line"><span>   1. 打开门户 → 点&quot;Create Service&quot;</span></span>
<span class="line"><span>   2. 选模板 → 填基本信息</span></span>
<span class="line"><span>   3. 自动:</span></span>
<span class="line"><span>      - GitHub repo 创建好,模板代码就位</span></span>
<span class="line"><span>      - CI/CD pipeline 配好</span></span>
<span class="line"><span>      - 监控 dashboard 自动建好</span></span>
<span class="line"><span>      - 告警规则自动加好</span></span>
<span class="line"><span>      - ArgoCD app 自动注册</span></span>
<span class="line"><span>      - Runbook 模板自动建好</span></span>
<span class="line"><span>      - On-call 排班自动加上</span></span>
<span class="line"><span>   4. 5 分钟后第一次部署完成</span></span>
<span class="line"><span>   ↓</span></span>
<span class="line"><span>   新人第一天就能开服务</span></span></code></pre></div><h3 id="_8-2-主流-idp-工具" tabindex="-1">8.2 主流 IDP 工具 <a class="header-anchor" href="#_8-2-主流-idp-工具" aria-label="Permalink to &quot;8.2 主流 IDP 工具&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Backstage  (Spotify 开源, 2020)</span></span>
<span class="line"><span>   - 行业事实标准</span></span>
<span class="line"><span>   - React + Node.js</span></span>
<span class="line"><span>   - 插件生态最丰富</span></span>
<span class="line"><span>   - 自托管,免费</span></span>
<span class="line"><span>   - 缺点: 上手陡,要工程化投入</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Port  (商用 SaaS)</span></span>
<span class="line"><span>   - 无代码配置</span></span>
<span class="line"><span>   - 上手最快</span></span>
<span class="line"><span>   - 小团队友好</span></span>
<span class="line"><span>   - 缺点: 灵活性弱于 Backstage</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Cortex  (商用)</span></span>
<span class="line"><span>   - 强调 service scorecard (服务健康度)</span></span>
<span class="line"><span>   - 适合已有微服务规模,要做治理</span></span>
<span class="line"><span></span></span>
<span class="line"><span>OpsLevel / Humanitec</span></span>
<span class="line"><span>   - 类似 Cortex / Port,各有特色</span></span></code></pre></div><h3 id="_8-3-中型团队要不要上-backstage" tabindex="-1">8.3 中型团队要不要上 Backstage <a class="header-anchor" href="#_8-3-中型团队要不要上-backstage" aria-label="Permalink to &quot;8.3 中型团队要不要上 Backstage&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>不要的信号:</span></span>
<span class="line"><span>   - 团队 &lt; 30 人</span></span>
<span class="line"><span>   - 服务 &lt; 30 个</span></span>
<span class="line"><span>   - 没有专职平台工程师</span></span>
<span class="line"><span>   - SRE / DevOps 工程已经搞不过来</span></span>
<span class="line"><span></span></span>
<span class="line"><span>要的信号:</span></span>
<span class="line"><span>   - 团队 &gt; 50 人,服务 &gt; 50 个</span></span>
<span class="line"><span>   - 新员工 onboard &gt; 2 周</span></span>
<span class="line"><span>   - 服务文档分散在多处(GitHub / Confluence / Notion)</span></span>
<span class="line"><span>   - 没人能说清楚&quot;线上有多少服务&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>中型团队的轻量替代:</span></span>
<span class="line"><span>   - 一个 Confluence / Notion / Yuque 的&quot;服务目录&quot;</span></span>
<span class="line"><span>   - 每个服务一页 (Owner / Repo / Dashboard / Runbook 链接)</span></span>
<span class="line"><span>   - GitHub Actions / GitLab CI 的&quot;创建新服务&quot;模板</span></span>
<span class="line"><span>   ↓</span></span>
<span class="line"><span>   80% 的 IDP 价值,5% 的工程成本</span></span></code></pre></div><p><strong>经验</strong>:<strong>Backstage 不是 onboarding 慢的解药,&#39;文档系统化 + 模板化&#39;才是</strong>。先把&quot;新服务模板&quot;做到 5 分钟跑通,再考虑要不要上 Backstage——<strong>反过来一定砸</strong>。</p><hr><h2 id="九、ai-infra-llm-ops-新一代-sre-必学" tabindex="-1">九、AI Infra / LLM Ops:新一代 SRE 必学 <a class="header-anchor" href="#九、ai-infra-llm-ops-新一代-sre-必学" aria-label="Permalink to &quot;九、AI Infra / LLM Ops:新一代 SRE 必学&quot;">​</a></h2><p>这本书写到 2026 年,<strong>不提 AI Infra 就是不完整的</strong>——但 aiLearning 系列已经讲透了,这里只补一个 SRE 视角。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>GPU 成本失控的故事 (真实):</span></span>
<span class="line"><span>   2024 年某公司投入 LLM 推理服务</span></span>
<span class="line"><span>   ────────────────────────────</span></span>
<span class="line"><span>   月 0: 12 张 A100 测试,月成本 12 万</span></span>
<span class="line"><span>   月 3: 业务起量,扩到 48 张,月成本 48 万</span></span>
<span class="line"><span>   月 6: 模型升级到更大,扩到 96 张,月成本 96 万</span></span>
<span class="line"><span>   月 9: CFO 拍桌子,要求一周内砍 50%</span></span>
<span class="line"><span>   月 10: 紧急做 LLM 推理优化</span></span>
<span class="line"><span>         - 改用 vLLM,吞吐 ×3</span></span>
<span class="line"><span>         - 改用 H100,效率 ×2</span></span>
<span class="line"><span>         - 加 KV cache 共享,效率 ×1.5</span></span>
<span class="line"><span>         - 最终 96 张 A100 → 24 张 H100</span></span>
<span class="line"><span>         月成本: 30 万</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   学到的:</span></span>
<span class="line"><span>   1. GPU 成本必须比 CPU 成本更早纳入 FinOps</span></span>
<span class="line"><span>   2. LLM 推理优化 (vLLM / SGLang / TensorRT-LLM) 是新 SRE 必备</span></span>
<span class="line"><span>   3. 模型选型不只是效果问题,是 TCO 问题</span></span></code></pre></div><p><strong>AI Infra 是新一代 SRE 的核心战场</strong>——可观测性、SLO、容量规划、成本归因,这套方法论几乎原封不动地适用,<strong>只是指标维度变了</strong>(从 QPS / 延迟 → tokens/s / TTFT / 推理成本 / GPU 利用率)。</p><p><strong>详细内容 aiLearning 系列(尤其是 33 / 41 篇)有专门讲</strong>,这里只提一句:<strong>写这一篇时,LLM Ops 正在成为 SRE 招聘的新刚需,如果你想在 2026-2030 年的 SRE 市场上有竞争力,这是必学的一个方向</strong>。</p><hr><h2 id="十、系列总结-34-篇串成一张地图" tabindex="-1">十、系列总结:34 篇串成一张地图 <a class="header-anchor" href="#十、系列总结-34-篇串成一张地图" aria-label="Permalink to &quot;十、系列总结:34 篇串成一张地图&quot;">​</a></h2><p>这一篇是最后一篇,要把这 34 篇串起来,让你看到这张地图的全貌。</p><h3 id="_10-1-6-层结构的完整地图" tabindex="-1">10.1 6 层结构的完整地图 <a class="header-anchor" href="#_10-1-6-层结构的完整地图" aria-label="Permalink to &quot;10.1 6 层结构的完整地图&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌──────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│                  这个系列的 6 层结构                          │</span></span>
<span class="line"><span>└──────────────────────────────────────────────────────────────┘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>     第 1-4 篇:                  第 5-12 篇:</span></span>
<span class="line"><span>     ┌──────────────────┐       ┌─────────────────────┐</span></span>
<span class="line"><span>     │   心智地基       │  ───→ │   可观测性三件套     │</span></span>
<span class="line"><span>     │ DevOps / SRE     │       │ Metrics / Logs /    │</span></span>
<span class="line"><span>     │ 错误预算 / Toil  │       │ Traces / Profile    │</span></span>
<span class="line"><span>     │ 黄金信号         │       │ Prometheus / OTel   │</span></span>
<span class="line"><span>     └──────────────────┘       └─────────────────────┘</span></span>
<span class="line"><span>            ↓                            ↓</span></span>
<span class="line"><span>            ↓                            ↓</span></span>
<span class="line"><span>     ┌──────────────────────────────────────────────────┐</span></span>
<span class="line"><span>     │              第 13-17 篇: SLO 与告警工程          │</span></span>
<span class="line"><span>     │   SLI 选择 / 错误预算 / 多窗口多燃烧率 / 仪表盘  │</span></span>
<span class="line"><span>     └──────────────────────────────────────────────────┘</span></span>
<span class="line"><span>            ↓</span></span>
<span class="line"><span>            ↓</span></span>
<span class="line"><span>     ┌──────────────────────────────────────────────────┐</span></span>
<span class="line"><span>     │            第 18-23 篇: CI/CD 与发布工程          │</span></span>
<span class="line"><span>     │   GitOps / 渐进发布 / Feature Flag / 数据库变更  │</span></span>
<span class="line"><span>     └──────────────────────────────────────────────────┘</span></span>
<span class="line"><span>            ↓</span></span>
<span class="line"><span>            ↓</span></span>
<span class="line"><span>     ┌──────────────────────────────────────────────────┐</span></span>
<span class="line"><span>     │           第 24-27 篇: IaC 与配置管理             │</span></span>
<span class="line"><span>     │   Terraform / Pulumi / Ansible / Vault           │</span></span>
<span class="line"><span>     └──────────────────────────────────────────────────┘</span></span>
<span class="line"><span>            ↓</span></span>
<span class="line"><span>            ↓</span></span>
<span class="line"><span>     ┌──────────────────────────────────────────────────┐</span></span>
<span class="line"><span>     │             第 28-34 篇: 生产实战                 │</span></span>
<span class="line"><span>     │   On-call / Runbook / 容量 / 混沌 /              │</span></span>
<span class="line"><span>     │   事故响应 / Blameless 复盘 / FinOps + Platform  │</span></span>
<span class="line"><span>     └──────────────────────────────────────────────────┘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>     横向贯穿:</span></span>
<span class="line"><span>     ┌──────────────────────────────────────────────────┐</span></span>
<span class="line"><span>     │     MTTR ↓ / MTBF ↑ / Change Failure Rate ↓     │</span></span>
<span class="line"><span>     │     (前三个数字)                                  │</span></span>
<span class="line"><span>     │                       + $ / QPS ↓                │</span></span>
<span class="line"><span>     │                       (第四个数字)                │</span></span>
<span class="line"><span>     └──────────────────────────────────────────────────┘</span></span></code></pre></div><h3 id="_10-2-每一层让你做什么" tabindex="-1">10.2 每一层让你做什么 <a class="header-anchor" href="#_10-2-每一层让你做什么" aria-label="Permalink to &quot;10.2 每一层让你做什么&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>第 1-4 篇 (心智):</span></span>
<span class="line"><span>  让你知道这些数字 (MTTR / MTBF / Change Failure Rate)</span></span>
<span class="line"><span>  和&quot;SRE 不是高级运维&quot;这件事</span></span>
<span class="line"><span></span></span>
<span class="line"><span>第 5-12 篇 (可观测性):</span></span>
<span class="line"><span>  让你能 *测* 这些数字</span></span>
<span class="line"><span>  Prometheus / Loki / OTel / Pyroscope —— 工具链全套</span></span>
<span class="line"><span></span></span>
<span class="line"><span>第 13-17 篇 (SLO 与告警):</span></span>
<span class="line"><span>  让你能 *用* 这些数字管理工作</span></span>
<span class="line"><span>  错误预算变成产品决策依据,告警变成可信号</span></span>
<span class="line"><span></span></span>
<span class="line"><span>第 18-23 篇 (CI/CD 与发布):</span></span>
<span class="line"><span>  让你能让 *Change Failure Rate 下降*</span></span>
<span class="line"><span>  GitOps + 灰度 + Feature Flag —— 把&quot;发布&quot;从豪赌变工程</span></span>
<span class="line"><span></span></span>
<span class="line"><span>第 24-27 篇 (IaC):</span></span>
<span class="line"><span>  让你的基础设施 *能复现*</span></span>
<span class="line"><span>  没有可复现的环境,前面所有努力都是沙堡</span></span>
<span class="line"><span></span></span>
<span class="line"><span>第 28-33 篇 (生产实战的前半):</span></span>
<span class="line"><span>  让你能让 *MTTR 下降*</span></span>
<span class="line"><span>  On-call / Runbook / 混沌 / 事故响应 / 复盘 —— 把救火变工程</span></span>
<span class="line"><span></span></span>
<span class="line"><span>第 34 篇 (生产实战的收尾):</span></span>
<span class="line"><span>  让你 *知道这一切要花多少钱*</span></span>
<span class="line"><span>  以及让你看到 SRE 下一站在哪里 (Platform Engineering)</span></span></code></pre></div><h3 id="_10-3-三个能力闭环" tabindex="-1">10.3 三个能力闭环 <a class="header-anchor" href="#_10-3-三个能力闭环" aria-label="Permalink to &quot;10.3 三个能力闭环&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>看见:    可观测性 (5-12) + 告警 (13-17) + 成本归因 (34)</span></span>
<span class="line"><span>                    ↓</span></span>
<span class="line"><span>做事:    CI/CD (18-23) + IaC (24-27) + On-call (28)</span></span>
<span class="line"><span>                    ↓</span></span>
<span class="line"><span>学习:    Runbook (29) + 混沌 (31) + 复盘 (33) + DevEx (34)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>完整闭环 → 系统越跑越稳</span></span>
<span class="line"><span>缺哪一环 → 进步停在那一环</span></span></code></pre></div><h3 id="_10-4-这-34-篇没讲什么-故意没讲" tabindex="-1">10.4 这 34 篇没讲什么(故意没讲) <a class="header-anchor" href="#_10-4-这-34-篇没讲什么-故意没讲" aria-label="Permalink to &quot;10.4 这 34 篇没讲什么(故意没讲)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>不讲:</span></span>
<span class="line"><span>   - &quot;Google 全球流量调度&quot; —— 字节级别的极端规模,你用不到</span></span>
<span class="line"><span>   - &quot;如何成为 SRE 大牛&quot; —— 大牛不是写出来的</span></span>
<span class="line"><span>   - &quot;工具厂商最佳实践&quot; —— 那是市场材料不是工程</span></span>
<span class="line"><span>   - &quot;面试题集&quot; —— 这本书是为真懂的人写的</span></span>
<span class="line"><span>   - 完整 yaml 配置堆砌 —— 关键 20 行比 200 行有价值</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>不重复 (别的系列已经讲透):</span></span>
<span class="line"><span>   - K8s / Docker / 服务网格 → backendLearning</span></span>
<span class="line"><span>   - 抗压 / 容灾 / 多机房     → systemDesign</span></span>
<span class="line"><span>   - 性能工具 / eBPF         → osLearning</span></span>
<span class="line"><span>   - 安全监控 / 应急         → securityLearning</span></span>
<span class="line"><span>   - AI Infra / LLM Ops      → aiLearning</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>这本书的边界:</span></span>
<span class="line"><span>   讲清楚&quot;中型团队该做的 SRE 工程&quot;,</span></span>
<span class="line"><span>   既不替你做 Google 级的事,</span></span>
<span class="line"><span>   也不替你做小作坊的事。</span></span></code></pre></div><hr><h2 id="十一、读完这套书-你应该有的本能" tabindex="-1">十一、读完这套书,你应该有的本能 <a class="header-anchor" href="#十一、读完这套书-你应该有的本能" aria-label="Permalink to &quot;十一、读完这套书,你应该有的本能&quot;">​</a></h2><p>回到 00 篇结尾说的那句话:<strong>读完整个系列之后,你应该有一种新的本能</strong>。</p><p>这里把它具体化——<strong>看到任何一个新服务上线,下意识闪过的 10 个问题</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. SLI 是什么?用户视角的成功率怎么定义?</span></span>
<span class="line"><span>   (回到 05 / 13 篇)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. 错误预算给多少?用满了谁来踩刹车?</span></span>
<span class="line"><span>   (回到 13 / 17 篇)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. 告警怎么配?静态阈值还是燃烧率?P0 / P1 / P2 怎么分?</span></span>
<span class="line"><span>   (回到 15 篇)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>4. CI 必须过的检查有哪些?制品怎么签名?</span></span>
<span class="line"><span>   (回到 18 / 19 篇)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>5. 灰度怎么发?自动回滚的触发条件是什么?</span></span>
<span class="line"><span>   (回到 21 篇)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>6. 数据库变更怎么和代码发布解耦?</span></span>
<span class="line"><span>   (回到 23 篇)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>7. 基础设施怎么复现?Terraform state 在哪?</span></span>
<span class="line"><span>   (回到 25 篇)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>8. 出事谁 on-call?P0 的 IC 是谁?升级到谁?</span></span>
<span class="line"><span>   (回到 28 / 32 篇)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>9. Runbook 在哪?有没有自愈?</span></span>
<span class="line"><span>   (回到 29 篇)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>10. 这个服务一个月烧多少钱?ROI 怎么算?</span></span>
<span class="line"><span>    (回到 34 篇)</span></span></code></pre></div><p><strong>这 10 个问题就是这套书想教会你的&quot;本能&quot;</strong>。不是为了回答,是为了<strong>当你看到一个新服务、新设计、新流程时,这 10 个问题在脑子里&quot;嗒&quot;一下并行升起</strong>——任何一个回答不了的,就是你这个服务的漏洞。</p><hr><h2 id="十二、最后-一种身份认同" tabindex="-1">十二、最后:一种身份认同 <a class="header-anchor" href="#十二、最后-一种身份认同" aria-label="Permalink to &quot;十二、最后:一种身份认同&quot;">​</a></h2><p>这个系列写了 34 篇,如果只能留一句话给走到最后的你:</p><blockquote><p><strong>&quot;对生产系统负责的工程师&quot;是一种身份认同,不是一个 KPI</strong>。</p></blockquote><p>KPI 是别人给你的,身份认同是你给自己的。前者会随公司、随汇报关系、随职级变动而变化;后者<strong>只要你一旦获得了,就会跟着你一辈子</strong>——换公司、换岗位、换技术栈都不会丢。</p><p>这个身份的核心,不是&quot;我会装 Prometheus&quot;,不是&quot;我会写 Terraform&quot;,不是&quot;我能扛 P0&quot;——这些都只是表象。<strong>真正的核心是一种心智:你看到任何一个运行中的系统,本能地会担心它会怎么挂,以及挂了之后能不能修</strong>。</p><p>这种担心不是焦虑,是<strong>专业</strong>。<strong>消防员看到一栋楼,本能地会注意逃生通道在哪;医生看到一个人,本能地会观察气色;对生产系统负责的工程师看到一个服务,本能地会问&quot;它的 SLO 是什么 / 出事谁兜着 / 修不好怎么办&quot;</strong>。</p><p>这种本能,<strong>只能在生产系统上长出来</strong>。<strong>这本书只是地图,不是地形</strong>。你真正成为这种工程师的那一刻,<strong>一定是在某个深夜、某次事故、某次复盘之后</strong>——不是因为你读完了第 34 篇,而是因为你扛住了第 N 次 P0。</p><hr><h2 id="十三、写在最后" tabindex="-1">十三、写在最后 <a class="header-anchor" href="#十三、写在最后" aria-label="Permalink to &quot;十三、写在最后&quot;">​</a></h2><p>工具会换。Prometheus 五年后可能被更好的东西替代,Terraform 可能被 Pulumi 或 Crossplane 取代,Backstage 可能被某个新平台覆盖,LLM Ops 可能演化出全新的范式。<strong>这些都不重要</strong>。</p><p><strong>真正不变的是方法论</strong>:</p><ul><li><strong>可度量</strong> —— 不能度量的事,做了等于没做</li><li><strong>可复现</strong> —— 不能复现的环境,不能演进</li><li><strong>可恢复</strong> —— 不能恢复的事故,会摧毁公司</li><li><strong>可归因</strong> —— 不能归因的成本,会失控</li><li><strong>可学习</strong> —— 不能学习的团队,会重复事故</li></ul><p><strong>这五个&quot;可&quot;就是工程的内核</strong>。所有 SRE / DevOps / 平台工程的工具和实践,<strong>都是这五个&quot;可&quot;在不同层面的落地</strong>。学会这五个&quot;可&quot;,换什么栈都能马上上手;只学具体工具,<strong>换一个公司就要重学一遍</strong>。</p><p>最后说一句给在凌晨三点读到这里的读者:<strong>这个系列写完了,你的工作没写完</strong>。明天去看一眼你团队最重要的服务——</p><ul><li>它的 SLO 是什么?</li><li>它出事谁来扛?</li><li>它一个月烧多少钱?</li></ul><p><strong>如果这三个问题你都答不上来,从明天就开始补</strong>。每补一个,你的团队就稳一点;每补一个,你离&quot;对生产系统负责的工程师&quot;就近一点。</p><blockquote><p>真正的工程能力,只能在生产系统上长出来。</p></blockquote><blockquote><p>你的生产系统就是你的道场。<strong>这本书读完了,出门左转,那里有一份新的告警等着你</strong>。</p></blockquote><hr><p>——系列完——</p><blockquote><p>P.S. 如果有人读完整套之后觉得&quot;这套东西挺好但是我们团队上不了&quot;,<strong>这是健康的反应</strong>——本系列从来不主张&quot;全套上&quot;。<strong>SLO 和复盘是任何团队都该立刻做的;混沌工程 / Backstage 大概率你这两年用不上</strong>。判断&quot;上什么 / 不上什么&quot;的能力,<strong>也是这套书想教会你的工程能力的一部分</strong>。</p><p>P.P.S. 这套书的另一面是 aiLearning / securityLearning / systemDesign 等系列。<strong>单独读这套不够,真正的工程能力是跨域的</strong>:出事时你既要懂 SRE 又要懂安全,做容量时你既要懂 SRE 又要懂系统设计,搞 LLM Ops 时你既要懂 SRE 又要懂 AI Infra。<strong>这本书是一个支柱,不是整栋楼</strong>。</p><p>P.P.P.S. 如果你扛过 P0、主持过 blameless 复盘、做过一次 GameDay、被一张失控的账单逼着学了一周 FinOps——<strong>欢迎你加入&quot;对生产系统负责的工程师&quot;这个圈子</strong>。这个圈子没有证书,没有头衔,<strong>就是凌晨三点 Pager 响起时,你愿意拿起来看一眼的那个人</strong>。</p></blockquote>`,147)])])}const u=n(e,[["render",i]]);export{g as __pageData,u as default};
