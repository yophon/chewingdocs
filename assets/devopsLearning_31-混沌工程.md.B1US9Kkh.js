import{c as a,Q as n,j as i,m as p}from"./chunks/framework.CBiVa4O3.js";const c=JSON.parse('{"title":"混沌工程:ChaosMesh / Litmus / 稳态假设 / 从演练到 GameDay","description":"","frontmatter":{},"headers":[],"relativePath":"../devopsLearning/31-混沌工程.md","filePath":"../devopsLearning/31-混沌工程.md","lastUpdated":1778496697000}'),l={name:"../devopsLearning/31-混沌工程.md"};function t(e,s,h,k,o,r){return n(),i("div",null,[...s[0]||(s[0]=[p(`<h1 id="混沌工程-chaosmesh-litmus-稳态假设-从演练到-gameday" tabindex="-1">混沌工程:ChaosMesh / Litmus / 稳态假设 / 从演练到 GameDay <a class="header-anchor" href="#混沌工程-chaosmesh-litmus-稳态假设-从演练到-gameday" aria-label="Permalink to &quot;混沌工程:ChaosMesh / Litmus / 稳态假设 / 从演练到 GameDay&quot;">​</a></h1><p>容量规划告诉你&quot;理论上 100 实例能扛 50k QPS&quot;,但<strong>真到了挂一个 AZ 的时刻,你的系统真的能扛吗</strong>?压测压不出&quot;Redis 主从切换 30 秒延迟&quot;这种问题,容量公式算不出&quot;Pod OOM 之后下游的连接池怎么飘&quot;。<strong>混沌工程就是把&quot;我的系统应该有韧性&quot;从&quot;信念&quot;做成&quot;被验证过的事实&quot;</strong>。</p><blockquote><p>一句话先记住:<strong>混沌工程不是&quot;破坏服务&quot;,是&quot;科学地验证韧性假设&quot;——区别在&quot;假设&quot;两个字</strong>。无脑 <code>kubectl delete pod</code> 是破坏,有稳态假设 + 有护栏 + 有自动回滚的故障注入才是工程。这一篇不教你怎么把生产搞崩(那是 0day 干的事),而是讲怎么有控制地、可重复地、可度量地暴露系统隐藏的脆弱点——<strong>让 GameDay 上发现的问题,不要在凌晨三点的真实故障里第一次被发现</strong>。但这一篇有一条铁律我会反复说:<strong>没有 SLO 别上混沌、没有可观测性别上混沌、没有护栏别上混沌</strong>——三个条件少一个,混沌就从&quot;工程&quot;变成&quot;自杀&quot;。</p></blockquote><hr><h2 id="一、问题场景-不做混沌的团队会撞上什么" tabindex="-1">一、问题场景:不做混沌的团队会撞上什么 <a class="header-anchor" href="#一、问题场景-不做混沌的团队会撞上什么" aria-label="Permalink to &quot;一、问题场景:不做混沌的团队会撞上什么&quot;">​</a></h2><h3 id="_1-1-真实场景-1-可用区切换比想象的慢" tabindex="-1">1.1 真实场景 1:可用区切换比想象的慢 <a class="header-anchor" href="#_1-1-真实场景-1-可用区切换比想象的慢" aria-label="Permalink to &quot;1.1 真实场景 1:可用区切换比想象的慢&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>某团队 2023 年事故:</span></span>
<span class="line"><span>  - 部署在 3 AZ,以为&quot;挂一个还能跑&quot;</span></span>
<span class="line"><span>  - 某天凌晨,AZ-1 整个挂掉(云厂商电力故障)</span></span>
<span class="line"><span>  - 理论上:流量应该 1-2 分钟内切到 AZ-2 和 AZ-3</span></span>
<span class="line"><span>  - 实际上:</span></span>
<span class="line"><span>      Service Mesh 健康检查 30s 一轮 → 90s 才标记 AZ-1 实例 unhealthy</span></span>
<span class="line"><span>      DNS 缓存 60s → 应用还在用旧的 endpoint 列表</span></span>
<span class="line"><span>      Redis 主从切换:哨兵 30s 才提升新主</span></span>
<span class="line"><span>      下游连接池没有自动重连,卡死 5min 直到连接超时</span></span>
<span class="line"><span>  - 真实切换耗时:8 分钟</span></span>
<span class="line"><span>  - 这 8 分钟里:5xx 率 60%,P99 30s,业务损失 ¥800k</span></span></code></pre></div><p><strong>这种问题压测压不出来</strong>——压测是&quot;加流量&quot;,不是&quot;挂掉一个 AZ&quot;。<strong>只有混沌注入才能暴露</strong>。</p><h3 id="_1-2-真实场景-2-级联失败超出预期" tabindex="-1">1.2 真实场景 2:级联失败超出预期 <a class="header-anchor" href="#_1-2-真实场景-2-级联失败超出预期" aria-label="Permalink to &quot;1.2 真实场景 2:级联失败超出预期&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>某团队&quot;我们做了熔断器,下游挂了我们能扛&quot;:</span></span>
<span class="line"><span>  - 测试环境:杀掉下游,本服务确实 fallback,5xx 控制在 1%</span></span>
<span class="line"><span>  - 生产 GameDay:杀掉下游</span></span>
<span class="line"><span>  - 结果:本服务 fallback OK,但 fallback 路径会回写一个 metric 到另一个服务</span></span>
<span class="line"><span>  - 那个 metric 服务被海量 fallback 请求打挂</span></span>
<span class="line"><span>  - metric 服务挂了又触发本服务的健康检查失败</span></span>
<span class="line"><span>  - 全链路雪崩,GameDay 当天没救回来</span></span></code></pre></div><p><strong>这是&quot;二阶失效&quot;——你以为防住的故障,会通过你没想到的路径反弹回来</strong>。压测、单元测试都看不到,<strong>只有真实注入才能暴露</strong>。</p><h3 id="_1-3-真实场景-3-runbook-在-gameday-上失效" tabindex="-1">1.3 真实场景 3:Runbook 在 GameDay 上失效 <a class="header-anchor" href="#_1-3-真实场景-3-runbook-在-gameday-上失效" aria-label="Permalink to &quot;1.3 真实场景 3:Runbook 在 GameDay 上失效&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>团队 Runbook 写得很全,但平时没人跑</span></span>
<span class="line"><span>GameDay 注入故障:某 Pod CPU 飙到 100%</span></span>
<span class="line"><span>值班人翻 Runbook:&quot;执行 kubectl scale deploy/X --replicas=20&quot;</span></span>
<span class="line"><span>跑命令:报错 &quot;deploy/X not found&quot;</span></span>
<span class="line"><span>查了 5 分钟才发现:deploy 名字 6 个月前改过,Runbook 没同步更新</span></span></code></pre></div><p><strong>Runbook 没演练 = 没价值</strong>。</p><hr><h2 id="二、混沌工程的-4-个核心原则" tabindex="-1">二、混沌工程的 4 个核心原则 <a class="header-anchor" href="#二、混沌工程的-4-个核心原则" aria-label="Permalink to &quot;二、混沌工程的 4 个核心原则&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  Chaos Engineering 4 原则(Netflix 提出)              │</span></span>
<span class="line"><span>├────────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>│  1. 稳态假设(Steady State Hypothesis)               │</span></span>
<span class="line"><span>│     先定义&quot;系统正常时长什么样&quot;,再注入                  │</span></span>
<span class="line"><span>│                                                        │</span></span>
<span class="line"><span>│  2. 真实事件(Vary Real-world Events)                 │</span></span>
<span class="line"><span>│     模拟真实可能发生的故障,不是异想天开                │</span></span>
<span class="line"><span>│                                                        │</span></span>
<span class="line"><span>│  3. 在生产上做(Run Experiments in Production)        │</span></span>
<span class="line"><span>│     测试环境的结论不能代表生产                          │</span></span>
<span class="line"><span>│     —— 但要有护栏,不是裸奔                            │</span></span>
<span class="line"><span>│                                                        │</span></span>
<span class="line"><span>│  4. 自动化连续运行(Automate to Run Continuously)     │</span></span>
<span class="line"><span>│     一次性实验只能发现&quot;已知未知&quot;                       │</span></span>
<span class="line"><span>│     持续运行才能发现&quot;未知未知&quot;                          │</span></span>
<span class="line"><span>└────────────────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>最重要的是第 1 条</strong>:<strong>没有稳态假设的故障注入不是混沌工程,是破坏</strong>。</p><h3 id="_2-1-稳态假设怎么写" tabindex="-1">2.1 稳态假设怎么写 <a class="header-anchor" href="#_2-1-稳态假设怎么写" aria-label="Permalink to &quot;2.1 稳态假设怎么写&quot;">​</a></h3><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Steady State Hypothesis 模板</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">experiment</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">order-service-pod-kill</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">hypothesis</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  # 在故障下,以下指标应保持稳态</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">metric</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">http_5xx_rate_5m</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    expected</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;&lt; 0.1%&quot;</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    actual_query</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">|</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">      sum(rate(http_requests_total{service=&quot;order&quot;,status=~&quot;5..&quot;}[5m]))</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">      / sum(rate(http_requests_total{service=&quot;order&quot;}[5m]))</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">metric</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">http_p99_latency_5m</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    expected</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;&lt; 800ms&quot;</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    actual_query</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">|</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">      histogram_quantile(0.99,</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">        rate(http_request_duration_seconds_bucket{service=&quot;order&quot;}[5m]))</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">metric</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">total_throughput</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    expected</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;drop &lt; 5% from baseline&quot;</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    actual_query</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">|</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">      sum(rate(http_requests_total{service=&quot;order&quot;}[5m]))</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 自动中止条件(护栏)</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">abort_conditions</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">metric</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">http_5xx_rate_5m &gt; 1%</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">      # 比预期高 10 倍 → 紧急中止</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">metric</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">http_p99_latency_5m &gt; 5s</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">   # 远超 SLO → 中止</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">duration</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">10min</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                    # 即便没爆,最多 10 分钟</span></span></code></pre></div><p><strong>这份假设回答了三个问题</strong>:</p><ol><li>&quot;正常&quot;长什么样?(具体指标 + 阈值)</li><li>这次实验&quot;通过&quot;的标准?(指标维持在阈值内)</li><li>实验&quot;失控&quot;的标准?(护栏触发自动回滚)</li></ol><hr><h2 id="三、工具选型-chaosmesh-litmus-fis-gremlin" tabindex="-1">三、工具选型:ChaosMesh / Litmus / FIS / Gremlin <a class="header-anchor" href="#三、工具选型-chaosmesh-litmus-fis-gremlin" aria-label="Permalink to &quot;三、工具选型:ChaosMesh / Litmus / FIS / Gremlin&quot;">​</a></h2><h3 id="_3-1-主流工具对比" tabindex="-1">3.1 主流工具对比 <a class="header-anchor" href="#_3-1-主流工具对比" aria-label="Permalink to &quot;3.1 主流工具对比&quot;">​</a></h3><table tabindex="0"><thead><tr><th>工具</th><th>出处</th><th>优势</th><th>劣势</th></tr></thead><tbody><tr><td><strong>ChaosMesh</strong></td><td>PingCAP 出 / CNCF</td><td>K8s 原生 / 中文友好 / 大厂落地多 / CRD 设计清晰</td><td>仅 K8s,VM 场景不支持</td></tr><tr><td><strong>LitmusChaos</strong></td><td>MayaData / CNCF</td><td>CNCF 毕业项目 / Hub 化的实验库</td><td>UI 较重,学习曲线陡</td></tr><tr><td><strong>AWS FIS</strong></td><td>亚马逊</td><td>云原生,EC2/RDS/Lambda 全集成</td><td>仅 AWS</td></tr><tr><td><strong>Gremlin</strong></td><td>商业</td><td>最早商业化,生态最成熟,GUI 友好</td><td>价格贵(企业级 $$$)</td></tr><tr><td><strong>Chaos Monkey</strong></td><td>Netflix</td><td>始祖 / 简单</td><td>只能 kill 实例,功能少</td></tr><tr><td><strong>PowerfulSeal</strong></td><td>早期 K8s 混沌</td><td>灵活</td><td>项目已不活跃</td></tr></tbody></table><h3 id="_3-2-选型决策" tabindex="-1">3.2 选型决策 <a class="header-anchor" href="#_3-2-选型决策" aria-label="Permalink to &quot;3.2 选型决策&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>你的环境是…              推荐</span></span>
<span class="line"><span>─────────────────────────────────────────</span></span>
<span class="line"><span>K8s + 国内业务           ChaosMesh ★★★★★</span></span>
<span class="line"><span>K8s + 国际化业务         ChaosMesh 或 LitmusChaos</span></span>
<span class="line"><span>纯 AWS(EC2/RDS)         AWS FIS</span></span>
<span class="line"><span>混合云 / VM 为主          Gremlin(付费)或 自研</span></span>
<span class="line"><span>小团队 / 简单 kill       Chaos Monkey + 自研脚本</span></span>
<span class="line"><span></span></span>
<span class="line"><span>中型团队推荐路径:</span></span>
<span class="line"><span>   Step 1:ChaosMesh 单点注入(Pod kill / 网络延迟)</span></span>
<span class="line"><span>   Step 2:加上稳态假设和自动回滚</span></span>
<span class="line"><span>   Step 3:进 GameDay 流程</span></span>
<span class="line"><span>   Step 4:CI 集成持续混沌</span></span></code></pre></div><h3 id="_3-3-为什么我推荐-chaosmesh" tabindex="-1">3.3 为什么我推荐 ChaosMesh <a class="header-anchor" href="#_3-3-为什么我推荐-chaosmesh" aria-label="Permalink to &quot;3.3 为什么我推荐 ChaosMesh&quot;">​</a></h3><ul><li><strong>CRD 设计清晰</strong>:故障类型分得很细(NetworkChaos / PodChaos / IOChaos / StressChaos / TimeChaos / DNSChaos / HTTPChaos / JVMChaos)</li><li><strong>中文文档全</strong>:PingCAP 中国团队主导</li><li><strong>生产可控</strong>:命名空间隔离、selector 精准、自动到期</li><li><strong>生态融入</strong>:ChaosDashboard 可视化、ChaosEngine 编排</li><li><strong>大厂背书</strong>:小米、Bilibili、京东 都在用</li></ul><hr><h2 id="四、故障注入维度-能注入什么" tabindex="-1">四、故障注入维度:能注入什么 <a class="header-anchor" href="#四、故障注入维度-能注入什么" aria-label="Permalink to &quot;四、故障注入维度:能注入什么&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  故障注入的 5 个维度                                   │</span></span>
<span class="line"><span>├────────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>│                                                        │</span></span>
<span class="line"><span>│  网络层  ─ 延迟 / 丢包 / 重复 / 错序 / 带宽限制       │</span></span>
<span class="line"><span>│            分区(partition)/ DNS 劫持               │</span></span>
<span class="line"><span>│                                                        │</span></span>
<span class="line"><span>│  Pod 层  ─ Kill / OOM / 容器挂起 / 容器重启          │</span></span>
<span class="line"><span>│                                                        │</span></span>
<span class="line"><span>│  节点层  ─ Node NotReady / CPU 跑满 / 磁盘满         │</span></span>
<span class="line"><span>│            时钟漂移(NTP)                            │</span></span>
<span class="line"><span>│                                                        │</span></span>
<span class="line"><span>│  IO 层   ─ 磁盘读写延迟 / 错误 / 读写慢              │</span></span>
<span class="line"><span>│                                                        │</span></span>
<span class="line"><span>│  应用层  ─ JVM GC 抖动 / Java 抛异常 / HTTP 中断     │</span></span>
<span class="line"><span>│            返回错误状态码                              │</span></span>
<span class="line"><span>└────────────────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>优先级</strong>:<strong>先从网络层和 Pod 层开始</strong>——这两类故障最常见、最容易暴露问题、风险也最小(网络可恢复、Pod 会自重启)。</p><hr><h2 id="五、一份最小-chaosmesh-实验-从-0-到-1" tabindex="-1">五、一份最小 ChaosMesh 实验:从 0 到 1 <a class="header-anchor" href="#五、一份最小-chaosmesh-实验-从-0-到-1" aria-label="Permalink to &quot;五、一份最小 ChaosMesh 实验:从 0 到 1&quot;">​</a></h2><p>我们做一个最经典的实验:<strong>给订单服务的下游注入 200ms 网络延迟,验证 P99 不超过 1s</strong>。</p><h3 id="_5-1-完整-yaml" tabindex="-1">5.1 完整 YAML <a class="header-anchor" href="#_5-1-完整-yaml" aria-label="Permalink to &quot;5.1 完整 YAML&quot;">​</a></h3><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># experiment-network-delay.yaml</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">apiVersion</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">chaos-mesh.org/v1alpha1</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">kind</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">NetworkChaos</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">metadata</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">payment-200ms-delay</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  namespace</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">staging</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">spec</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  action</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">delay</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">              # 故障类型:延迟</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  mode</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">all</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                  # 影响所有匹配 Pod</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  selector</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    namespaces</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">staging</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    labelSelectors</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">      &quot;app&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;payment-service&quot;</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">   # 给 payment 注入延迟</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  delay</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    latency</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;200ms&quot;</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">         # 延迟 200ms</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    correlation</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;0&quot;</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    jitter</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;10ms&quot;</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">            # 加点抖动模拟真实网络</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  direction</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">to</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">              # 出向流量(payment → 其他)</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  target</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:                    </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 影响 payment 调用的下游</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    selector</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      namespaces</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        - </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">staging</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      labelSelectors</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">        &quot;app&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;order-service&quot;</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    mode</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">all</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  duration</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;5m&quot;</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">             # 5 分钟自动停</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  scheduler</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    cron</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;@once&quot;</span></span></code></pre></div><h3 id="_5-2-跑起来-看监控" tabindex="-1">5.2 跑起来 + 看监控 <a class="header-anchor" href="#_5-2-跑起来-看监控" aria-label="Permalink to &quot;5.2 跑起来 + 看监控&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 1. 跑实验</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">kubectl</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> apply</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -f</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> experiment-network-delay.yaml</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 2. 监控 Grafana,看稳态指标</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#    - 5xx 率有没有抖</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#    - P99 有没有超 SLO</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#    - 整体吞吐有没有跌</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 3. 5 分钟后自动结束</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">kubectl</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> get</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> networkchaos</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -n</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> staging</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#    payment-200ms-delay   Finished</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 4. 如果失控,手动中止</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">kubectl</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> delete</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> networkchaos</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> payment-200ms-delay</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -n</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> staging</span></span></code></pre></div><h3 id="_5-3-实验通过的判定" tabindex="-1">5.3 实验通过的判定 <a class="header-anchor" href="#_5-3-实验通过的判定" aria-label="Permalink to &quot;5.3 实验通过的判定&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>通过(韧性达标):</span></span>
<span class="line"><span>  ✓ P99 &lt; 1000ms(SLO 内)</span></span>
<span class="line"><span>  ✓ 5xx 率 &lt; 0.1%</span></span>
<span class="line"><span>  ✓ 吞吐没掉 5% 以上</span></span>
<span class="line"><span>  → 结论:200ms 网络延迟不会击穿系统</span></span>
<span class="line"><span></span></span>
<span class="line"><span>未通过(发现脆弱点):</span></span>
<span class="line"><span>  ✗ P99 飙到 5s</span></span>
<span class="line"><span>  ✗ 5xx 率涨到 2%</span></span>
<span class="line"><span>  → 行动项:</span></span>
<span class="line"><span>     - 检查 payment 客户端是否设了合理超时</span></span>
<span class="line"><span>     - 检查重试逻辑(是不是 retry 把延迟放大了)</span></span>
<span class="line"><span>     - 加熔断</span></span>
<span class="line"><span>     - 验证修复后再跑实验</span></span></code></pre></div><hr><h2 id="六、护栏-这一节比上一节重要-10-倍" tabindex="-1">六、护栏:这一节比上一节重要 10 倍 <a class="header-anchor" href="#六、护栏-这一节比上一节重要-10-倍" aria-label="Permalink to &quot;六、护栏:这一节比上一节重要 10 倍&quot;">​</a></h2><p>混沌工程最大的争议不是&quot;该不该做&quot;,是&quot;<strong>怎么不把自己玩崩</strong>&quot;。</p><h3 id="_6-1-五道护栏" tabindex="-1">6.1 五道护栏 <a class="header-anchor" href="#_6-1-五道护栏" aria-label="Permalink to &quot;6.1 五道护栏&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  生产混沌实验的 5 道护栏                               │</span></span>
<span class="line"><span>├────────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>│  护栏 1:Blast Radius(爆炸半径)                       │</span></span>
<span class="line"><span>│   只影响 1-5% 流量 / 1-2 个 Pod / 单 AZ 一个分片       │</span></span>
<span class="line"><span>│                                                        │</span></span>
<span class="line"><span>│  护栏 2:Time-bound(自动到期)                         │</span></span>
<span class="line"><span>│   每个实验最多 5-10min,自动结束                       │</span></span>
<span class="line"><span>│                                                        │</span></span>
<span class="line"><span>│  护栏 3:Auto-abort(指标超阈值自动停)                 │</span></span>
<span class="line"><span>│   监控核心 SLI,超阈值立即终止实验                     │</span></span>
<span class="line"><span>│                                                        │</span></span>
<span class="line"><span>│  护栏 4:Manual Kill Switch(一键终止)                 │</span></span>
<span class="line"><span>│   值班人能用一条命令立即结束所有实验                   │</span></span>
<span class="line"><span>│                                                        │</span></span>
<span class="line"><span>│  护栏 5:Off-hours(选时段)                            │</span></span>
<span class="line"><span>│   不在大促 / 重要发布 / 工作时间高峰跑                 │</span></span>
<span class="line"><span>└────────────────────────────────────────────────────────┘</span></span></code></pre></div><h3 id="_6-2-blast-radius-从小到大渐进" tabindex="-1">6.2 Blast Radius:从小到大渐进 <a class="header-anchor" href="#_6-2-blast-radius-从小到大渐进" aria-label="Permalink to &quot;6.2 Blast Radius:从小到大渐进&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌──────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  混沌实验&quot;爆炸半径&quot;渐进路径                  │</span></span>
<span class="line"><span>├──────────────────────────────────────────────┤</span></span>
<span class="line"><span>│  Stage 1:Staging 全量                        │</span></span>
<span class="line"><span>│   - 在 staging 环境跑完整故障                │</span></span>
<span class="line"><span>│   - 验证稳态假设和护栏                       │</span></span>
<span class="line"><span>│                                              │</span></span>
<span class="line"><span>│  Stage 2:Prod 1% 流量                       │</span></span>
<span class="line"><span>│   - 用 service mesh / 灰度分流               │</span></span>
<span class="line"><span>│   - 只影响 1% 实例                           │</span></span>
<span class="line"><span>│                                              │</span></span>
<span class="line"><span>│  Stage 3:Prod 单 AZ                         │</span></span>
<span class="line"><span>│   - 影响一个 AZ 的实例                       │</span></span>
<span class="line"><span>│   - 验证跨 AZ 切换                           │</span></span>
<span class="line"><span>│                                              │</span></span>
<span class="line"><span>│  Stage 4:Prod 全量短时                      │</span></span>
<span class="line"><span>│   - 影响所有实例,但只 1-2 分钟              │</span></span>
<span class="line"><span>│   - 验证全局韧性                             │</span></span>
<span class="line"><span>└──────────────────────────────────────────────┘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>任何一步发现问题,回到上一步修完再继续</span></span></code></pre></div><p><strong>永远从 Staging 开始,从不直接 Prod 全量</strong>——直接 Prod 全量跑混沌的团队,迟早会上新闻。</p><h3 id="_6-3-自动-abort-配置" tabindex="-1">6.3 自动 Abort 配置 <a class="header-anchor" href="#_6-3-自动-abort-配置" aria-label="Permalink to &quot;6.3 自动 Abort 配置&quot;">​</a></h3><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># ChaosMesh 实验加自动中止</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">apiVersion</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">chaos-mesh.org/v1alpha1</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">kind</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">Workflow</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">metadata</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">payment-delay-with-guardrails</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">spec</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  entry</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">main</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  templates</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">main</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      templateType</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">Serial</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      children</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        - </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">inject-delay</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        - </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">watch-metrics</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">inject-delay</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      templateType</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">NetworkChaos</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      networkChaos</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        action</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">delay</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">        # ... 同上</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        duration</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;10m&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">watch-metrics</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      templateType</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">Task</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      task</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        container</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          image</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">prometheus-watcher:latest</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          command</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;/bin/watch.sh&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          env</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">ABORT_IF</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">              value</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;5xx_rate &gt; 0.5% OR p99 &gt; 2s&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">CHECK_INTERVAL</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">              value</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;10s&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">ON_ABORT</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">              value</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;kubectl delete networkchaos -A --all&quot;</span></span></code></pre></div><p><strong>Auto-abort 的 3 个要点</strong>:</p><ol><li><strong>频次</strong>:10 秒查一次,不要 1 分钟才查(那 1 分钟里可能已经雪崩了)</li><li><strong>多指标</strong>:不是只看一个,5xx + P99 + 吞吐都要看,任何一个炸都停</li><li><strong>回滚动作</strong>:不只是停实验,还要&quot;恢复&quot;——把被注入的 Pod 重启 / 网络规则清空</li></ol><h3 id="_6-4-一键-kill-switch" tabindex="-1">6.4 一键 Kill Switch <a class="header-anchor" href="#_6-4-一键-kill-switch" aria-label="Permalink to &quot;6.4 一键 Kill Switch&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 团队共享的一键终止脚本</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#!/bin/bash</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># chaos-kill-all.sh</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">set</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -e</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">echo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;Aborting all chaos experiments...&quot;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 1. 删除所有 ChaosMesh 资源</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">kubectl</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> delete</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> networkchaos</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -A</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --all</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">kubectl</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> delete</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> podchaos</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -A</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --all</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">kubectl</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> delete</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> iochaos</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -A</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --all</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">kubectl</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> delete</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> stresschaos</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -A</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --all</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">kubectl</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> delete</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> httpchaos</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -A</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --all</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 2. 通知告警系统</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">curl</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -X</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> POST</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> https://pagerduty/api/.../resolve</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -d</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;{&quot;reason&quot;:&quot;chaos manually aborted&quot;}&#39;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 3. 通知 Slack</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">curl</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -X</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> POST</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> https://hooks.slack.com/...</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -d</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;{&quot;text&quot;:&quot;CHAOS ABORTED by &#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$USER</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39; at $(date)&quot;}&#39;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">echo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;Done. All chaos abortted.&quot;</span></span></code></pre></div><p><strong>放在哪</strong>:</p><ul><li>每个 SRE 的 笔记本本地</li><li>On-call 跳板机的 <code>~/scripts/</code></li><li>War Room 的 README 头几行</li></ul><p><strong>任何时候、任何人能一秒钟终止所有实验</strong>——这是混沌工程的&quot;急停按钮&quot;。</p><hr><h2 id="七、gameday-从单一实验到团队演练" tabindex="-1">七、GameDay:从单一实验到团队演练 <a class="header-anchor" href="#七、gameday-从单一实验到团队演练" aria-label="Permalink to &quot;七、GameDay:从单一实验到团队演练&quot;">​</a></h2><h3 id="_7-1-gameday-是什么" tabindex="-1">7.1 GameDay 是什么 <a class="header-anchor" href="#_7-1-gameday-是什么" aria-label="Permalink to &quot;7.1 GameDay 是什么&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>GameDay:团队组织的&quot;灾难演练&quot;</span></span>
<span class="line"><span>  - 提前设计一组故障场景(模拟真实事故)</span></span>
<span class="line"><span>  - 在控制时间内注入到 staging / prod</span></span>
<span class="line"><span>  - 让 On-call 团队按真实流程响应</span></span>
<span class="line"><span>  - 复盘:响应速度 / Runbook 有效性 / 系统韧性 / 团队协作</span></span>
<span class="line"><span></span></span>
<span class="line"><span>GameDay vs 单次实验:</span></span>
<span class="line"><span>  单次实验:验证&quot;系统能否扛&quot;</span></span>
<span class="line"><span>  GameDay:验证&quot;团队能否扛&quot;</span></span></code></pre></div><h3 id="_7-2-gameday-流程" tabindex="-1">7.2 GameDay 流程 <a class="header-anchor" href="#_7-2-gameday-流程" aria-label="Permalink to &quot;7.2 GameDay 流程&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌──────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  GameDay 标准 5 步流程                                   │</span></span>
<span class="line"><span>├──────────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>│                                                          │</span></span>
<span class="line"><span>│  Step 1:场景设计(D-14 天)                              │</span></span>
<span class="line"><span>│   - 选 3-5 个真实可能的故障                              │</span></span>
<span class="line"><span>│   - 写每个故障的&quot;稳态假设&quot;                               │</span></span>
<span class="line"><span>│   - 写预期的&quot;团队响应路径&quot;(Runbook)                   │</span></span>
<span class="line"><span>│                                                          │</span></span>
<span class="line"><span>│  Step 2:风险评估 + 通知(D-7 天)                       │</span></span>
<span class="line"><span>│   - 评估爆炸半径                                          │</span></span>
<span class="line"><span>│   - 给受影响业务团队 / 客户提前通知                       │</span></span>
<span class="line"><span>│   - 准备应急联系人                                        │</span></span>
<span class="line"><span>│                                                          │</span></span>
<span class="line"><span>│  Step 3:演练当天                                         │</span></span>
<span class="line"><span>│   - 战时频道开启                                          │</span></span>
<span class="line"><span>│   - GameDay 主持人(不是 On-call)知情,值班人不知情     │</span></span>
<span class="line"><span>│   - 按计划注入故障                                        │</span></span>
<span class="line"><span>│   - 团队按真实流程响应(Ack / Runbook / 沟通)           │</span></span>
<span class="line"><span>│                                                          │</span></span>
<span class="line"><span>│  Step 4:观察 + 干预                                      │</span></span>
<span class="line"><span>│   - 主持人观察是否触发护栏                                │</span></span>
<span class="line"><span>│   - 必要时手动 abort                                      │</span></span>
<span class="line"><span>│   - 记录响应时间线                                        │</span></span>
<span class="line"><span>│                                                          │</span></span>
<span class="line"><span>│  Step 5:复盘(GameDay 结束 24h 内)                     │</span></span>
<span class="line"><span>│   - 时间线回顾                                            │</span></span>
<span class="line"><span>│   - 哪些 Runbook 有效                                     │</span></span>
<span class="line"><span>│   - 哪些指标没看到                                        │</span></span>
<span class="line"><span>│   - 团队协作的卡点                                        │</span></span>
<span class="line"><span>│   - 行动项 + owner + deadline                            │</span></span>
<span class="line"><span>└──────────────────────────────────────────────────────────┘</span></span></code></pre></div><h3 id="_7-3-gameday-场景设计示例" tabindex="-1">7.3 GameDay 场景设计示例 <a class="header-anchor" href="#_7-3-gameday-场景设计示例" aria-label="Permalink to &quot;7.3 GameDay 场景设计示例&quot;">​</a></h3><div class="language-markdown vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">markdown</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;"># GameDay 2026-05-15</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">## 场景 1:订单服务的 Redis 主节点挂掉(15min)</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 注入:</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">\`PodChaos\`</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> kill redis-master</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 稳态假设:订单创建 5xx &lt; 1%、P99 &lt; 800ms</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 预期路径:Sentinel 检测 → 提升 redis-slave → 应用连接重建 → 30s 内恢复</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 验证:实际切换耗时、读延迟、5xx</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">## 场景 2:支付下游网络分区(10min)</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 注入:</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">\`NetworkChaos\`</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> partition between order ↔ payment</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 稳态假设:订单接口降级,直接返回&quot;系统繁忙&quot;,5xx &lt; 5%</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 预期路径:circuit breaker 打开 → fallback → 用户看到友好提示</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 验证:熔断是否打开、用户体验、相关告警是否触发</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">## 场景 3:某 AZ 整个挂掉(20min)</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 注入:Pod selector by AZ,所有该 AZ 实例 kill</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 稳态假设:整体可用,P99 暂时 +200ms,5xx &lt; 2%</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 预期路径:负载均衡剔除 AZ → 流量切到剩余 2 AZ → HPA 扩容</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 验证:切换耗时、剩余 AZ 容量是否够</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">## 场景 4:Postmortem 实操(无注入)</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 模拟一份历史 Postmortem 的事故场景</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 团队按真实流程跑一次响应</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 验证团队是否对历史教训有&quot;肌肉记忆&quot;</span></span></code></pre></div><h3 id="_7-4-gameday-的反模式" tabindex="-1">7.4 GameDay 的反模式 <a class="header-anchor" href="#_7-4-gameday-的反模式" aria-label="Permalink to &quot;7.4 GameDay 的反模式&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>反模式 1:GameDay 变 Demo</span></span>
<span class="line"><span>  - &quot;我们要给老板演示我们多强&quot;</span></span>
<span class="line"><span>  - 提前预演,真当天没风险</span></span>
<span class="line"><span>  → 没价值,跟&quot;汇报&quot;没区别</span></span>
<span class="line"><span></span></span>
<span class="line"><span>反模式 2:GameDay 不复盘</span></span>
<span class="line"><span>  - 演练完大家鼓掌散会</span></span>
<span class="line"><span>  - 没人记录时间线、没人提行动项</span></span>
<span class="line"><span>  → 演了等于没演</span></span>
<span class="line"><span></span></span>
<span class="line"><span>反模式 3:不通知就搞 prod</span></span>
<span class="line"><span>  - &quot;我们要测试 SRE 的真实响应速度&quot;</span></span>
<span class="line"><span>  - 业务团队不知道,客户也没通知</span></span>
<span class="line"><span>  → 出真问题没人能区分&quot;是 GameDay 还是真事故&quot;</span></span>
<span class="line"><span>  → 协调成本爆炸,被业务/客户骂</span></span>
<span class="line"><span></span></span>
<span class="line"><span>反模式 4:护栏没设就上</span></span>
<span class="line"><span>  - 直接 prod 全量 kill 30% Pod</span></span>
<span class="line"><span>  - 5 分钟雪崩到无法挽回</span></span>
<span class="line"><span>  → 这不是 GameDay 是事故</span></span></code></pre></div><hr><h2 id="八、从混沌到-gameday-成熟度模型" tabindex="-1">八、从混沌到 GameDay:成熟度模型 <a class="header-anchor" href="#八、从混沌到-gameday-成熟度模型" aria-label="Permalink to &quot;八、从混沌到 GameDay:成熟度模型&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  混沌工程成熟度(Maturity Model)                          │</span></span>
<span class="line"><span>├────────────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>│                                                            │</span></span>
<span class="line"><span>│  L0:无混沌                                                 │</span></span>
<span class="line"><span>│   只靠真实事故&quot;自然演练&quot;                                   │</span></span>
<span class="line"><span>│                                                            │</span></span>
<span class="line"><span>│  L1:Ad-hoc 单点实验                                        │</span></span>
<span class="line"><span>│   偶尔在 staging 跑一次 pod kill,无复盘                   │</span></span>
<span class="line"><span>│                                                            │</span></span>
<span class="line"><span>│  L2:计划性单故障实验                                       │</span></span>
<span class="line"><span>│   月度 staging 实验,有稳态假设,有复盘                    │</span></span>
<span class="line"><span>│                                                            │</span></span>
<span class="line"><span>│  L3:GameDay 制度化                                         │</span></span>
<span class="line"><span>│   季度 GameDay,prod 上跑(带护栏),多故障组合            │</span></span>
<span class="line"><span>│                                                            │</span></span>
<span class="line"><span>│  L4:持续混沌 CI/CD                                         │</span></span>
<span class="line"><span>│   每次发布前自动跑混沌实验,作为发布门禁                   │</span></span>
<span class="line"><span>│   实验失败 = 发布失败                                       │</span></span>
<span class="line"><span>│                                                            │</span></span>
<span class="line"><span>│  L5:全自动混沌(Chaos Monkey 风格)                       │</span></span>
<span class="line"><span>│   随机时间在 prod 杀实例,作为日常验证                     │</span></span>
<span class="line"><span>│   要求极强可观测性 + 自动恢复                              │</span></span>
<span class="line"><span>└────────────────────────────────────────────────────────────┘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>中型团队推荐:L2 → L3,大约 6-12 个月达成</span></span>
<span class="line"><span>L4 / L5 是 100+ 工程师的体量才上</span></span></code></pre></div><hr><h2 id="九、何时不该上混沌工程" tabindex="-1">九、何时不该上混沌工程 <a class="header-anchor" href="#九、何时不该上混沌工程" aria-label="Permalink to &quot;九、何时不该上混沌工程&quot;">​</a></h2><h3 id="_9-1-三个硬条件" tabindex="-1">9.1 三个硬条件 <a class="header-anchor" href="#_9-1-三个硬条件" aria-label="Permalink to &quot;9.1 三个硬条件&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>混沌工程的入场券(都必须满足):</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  ✓ 1. 系统已经有 SLO</span></span>
<span class="line"><span>       —— 没 SLO 就没&quot;稳态&quot;,注入没基准比较</span></span>
<span class="line"><span>       </span></span>
<span class="line"><span>  ✓ 2. 可观测性完整</span></span>
<span class="line"><span>       —— Metrics + Logs + Traces 都有</span></span>
<span class="line"><span>       —— 否则实验出问题你看不到、看到了也定位不到</span></span>
<span class="line"><span>       </span></span>
<span class="line"><span>  ✓ 3. 团队有 On-call + Runbook</span></span>
<span class="line"><span>       —— 万一炸了能立即响应</span></span>
<span class="line"><span>       —— 没团队接的混沌 = 自杀</span></span></code></pre></div><h3 id="_9-2-团队规模" tabindex="-1">9.2 团队规模 <a class="header-anchor" href="#_9-2-团队规模" aria-label="Permalink to &quot;9.2 团队规模&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>&lt; 5 人团队:</span></span>
<span class="line"><span>  ✗ 别上混沌</span></span>
<span class="line"><span>  - 没人专门写实验</span></span>
<span class="line"><span>  - 没人盯护栏</span></span>
<span class="line"><span>  - 出事没人接</span></span>
<span class="line"><span>  ✓ 改做&quot;故障故事会&quot;:每月会上讲一个&quot;如果 X 挂了我们怎么办&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>5-20 人团队:</span></span>
<span class="line"><span>  △ L1-L2 可以,L3 谨慎</span></span>
<span class="line"><span>  - 季度 staging GameDay</span></span>
<span class="line"><span>  - prod 实验等团队大一点</span></span>
<span class="line"><span></span></span>
<span class="line"><span>20-50 人团队:</span></span>
<span class="line"><span>  ✓ L2-L3 的甜蜜点</span></span>
<span class="line"><span>  - 季度 prod GameDay 标配</span></span>
<span class="line"><span>  - 持续混沌还早</span></span>
<span class="line"><span></span></span>
<span class="line"><span>50+ 团队:</span></span>
<span class="line"><span>  ✓ L3-L4</span></span>
<span class="line"><span>  - 月度 GameDay</span></span>
<span class="line"><span>  - CI 集成混沌实验</span></span></code></pre></div><h3 id="_9-3-业务阶段" tabindex="-1">9.3 业务阶段 <a class="header-anchor" href="#_9-3-业务阶段" aria-label="Permalink to &quot;9.3 业务阶段&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>不适合混沌的业务阶段:</span></span>
<span class="line"><span>  ✗ 产品刚上线 / 还在快速迭代</span></span>
<span class="line"><span>       —— 系统本身在变,混沌结论几周就过期</span></span>
<span class="line"><span>  ✗ 大促 / 关键发布期间</span></span>
<span class="line"><span>       —— 风险叠加,不要找麻烦</span></span>
<span class="line"><span>  ✗ 监管严格的金融 / 医疗 prod</span></span>
<span class="line"><span>       —— 任何&quot;故意搞挂&quot;都可能违规</span></span>
<span class="line"><span>       —— 必须先有合规批准</span></span>
<span class="line"><span>  ✗ 业务收入高度集中在某个时间窗</span></span>
<span class="line"><span>       —— 半夜没人下单,半夜搞,别白天搞</span></span></code></pre></div><h3 id="_9-4-一个常见误区-把混沌当救命稻草" tabindex="-1">9.4 一个常见误区:把混沌当救命稻草 <a class="header-anchor" href="#_9-4-一个常见误区-把混沌当救命稻草" aria-label="Permalink to &quot;9.4 一个常见误区:把混沌当救命稻草&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错误的引入混沌的理由:</span></span>
<span class="line"><span>  &quot;我们事故太多,搞混沌降低事故率&quot;</span></span>
<span class="line"><span>  → 错,你应该先把 SLO / Runbook / Postmortem 做好</span></span>
<span class="line"><span>  → 混沌只是验证手段,不是修复手段</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  &quot;竞争对手在做 GameDay,我们也要做&quot;</span></span>
<span class="line"><span>  → 错,工具不是文化,跟风做出来都是表演</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  &quot;投资人要看混沌能力&quot;</span></span>
<span class="line"><span>  → ……这种公司迟早被炸醒</span></span></code></pre></div><p><strong>混沌工程是&quot;成熟系统的体检&quot;,不是&quot;重症患者的抢救&quot;</strong>。</p><hr><h2 id="十、一个真实案例-从-30-秒切换到秒切" tabindex="-1">十、一个真实案例:从 30 秒切换到秒切 <a class="header-anchor" href="#十、一个真实案例-从-30-秒切换到秒切" aria-label="Permalink to &quot;十、一个真实案例:从 30 秒切换到秒切&quot;">​</a></h2><p>某团队 2024 年的真实演化:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>背景:</span></span>
<span class="line"><span>  - 业务用 Redis 哨兵(Sentinel)模式</span></span>
<span class="line"><span>  - 单主单从,Sentinel 监控</span></span>
<span class="line"><span>  - 团队相信&quot;主挂了 Sentinel 会自动切&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>GameDay 实验:</span></span>
<span class="line"><span>  - 注入:kill redis-master(用 ChaosMesh PodChaos)</span></span>
<span class="line"><span>  - 稳态假设:订单服务 5xx &lt; 1%,P99 &lt; 800ms</span></span>
<span class="line"><span>  - 时长:5 分钟</span></span>
<span class="line"><span></span></span>
<span class="line"><span>实际表现:</span></span>
<span class="line"><span>  T+0s:    redis-master 挂</span></span>
<span class="line"><span>  T+5s:    Sentinel 标记 master 不可达</span></span>
<span class="line"><span>  T+10s:   Sentinel quorum 达成,开始切换</span></span>
<span class="line"><span>  T+15s:   提升 redis-slave 为新主</span></span>
<span class="line"><span>  T+18s:   通知所有客户端</span></span>
<span class="line"><span>  T+18s+:  老客户端连接还卡在旧 master 上</span></span>
<span class="line"><span>  T+30s:   客户端连接超时,触发重连</span></span>
<span class="line"><span>  T+32s:   连接到新主,业务恢复</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  总耗时:32 秒</span></span>
<span class="line"><span>  5xx 率峰值:8%(SLO 是 0.1%)</span></span>
<span class="line"><span>  P99 峰值:6s(SLO 是 800ms)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>复盘发现:</span></span>
<span class="line"><span>  1. Sentinel 切换本身可控(15s),但客户端不够&quot;机灵&quot;</span></span>
<span class="line"><span>  2. 客户端连接池没设主动健康检查</span></span>
<span class="line"><span>  3. 业务侧没有对 Redis 写操作做降级</span></span>
<span class="line"><span>  4. 一些写操作直接抛异常返回 5xx,没 fallback</span></span>
<span class="line"><span></span></span>
<span class="line"><span>行动项:</span></span>
<span class="line"><span>  ✓ 升级 Redis 客户端,启用 Sentinel push 通知(非轮询)</span></span>
<span class="line"><span>  ✓ 业务写 Redis 失败 → 异步重试 + 默认值兜底</span></span>
<span class="line"><span>  ✓ 评估升级到 Redis Cluster(原生分片 + 多主)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3 个月后再做 GameDay:</span></span>
<span class="line"><span>  - 升级到 Redis Cluster 6 节点</span></span>
<span class="line"><span>  - 注入:kill 1 个主分片</span></span>
<span class="line"><span>  - 实际切换:1.2 秒,5xx 几乎无波动</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  结论:GameDay 把&quot;30 秒事故&quot;变成了&quot;1 秒小抖动&quot;</span></span></code></pre></div><p><strong>这就是混沌工程的真正价值</strong>——<strong>不是&quot;发现问题&quot;,是&quot;在凌晨之前发现问题&quot;</strong>。</p><hr><h2 id="十一、踩坑提醒" tabindex="-1">十一、踩坑提醒 <a class="header-anchor" href="#十一、踩坑提醒" aria-label="Permalink to &quot;十一、踩坑提醒&quot;">​</a></h2><ol><li><strong>没 SLO 就上混沌</strong> —— 没基准比较,实验没意义</li><li><strong>没可观测性就上混沌</strong> —— 出问题看不到,定位不到</li><li><strong>prod 没护栏裸跑</strong> —— 自动 abort / 时长上限 / 一键 kill,缺一不可</li><li><strong>从 prod 直接全量开始</strong> —— 必须 staging → prod 1% → prod 单 AZ 渐进</li><li><strong>不写稳态假设</strong> —— 注入完不知道&quot;通过&quot;还是&quot;失败&quot;</li><li><strong>GameDay 不复盘</strong> —— 演完散会,行动项无人跟踪</li><li><strong>不通知 prod 跑</strong> —— 业务被搞蒙,协作成本爆炸</li><li><strong>混沌当救命药</strong> —— 治标不治本,系统问题该修就修</li><li><strong>小团队硬上 L4/L5</strong> —— 跑得起,扛不住</li><li><strong>故障设计脱离现实</strong> —— 注入&quot;5 个 AZ 同时挂&quot;,现实概率为 0,白干</li><li><strong>不集成 CI</strong> —— 实验跑完看下报告,一个月不再跑 = 数据老化</li><li><strong>Runbook 不结合 GameDay</strong> —— GameDay 暴露 Runbook 失效但不修</li></ol><hr><h2 id="十二、本篇硬指标" tabindex="-1">十二、本篇硬指标 <a class="header-anchor" href="#十二、本篇硬指标" aria-label="Permalink to &quot;十二、本篇硬指标&quot;">​</a></h2><p>看完这一篇,你应该能:</p><ul><li><strong>写出一份完整的稳态假设</strong>(指标 + 阈值 + 自动 abort)</li><li><strong>画出 5 道护栏</strong>(爆炸半径 / 时长 / 自动 abort / 手动 kill / 选时段)</li><li><strong>设计一个最小 ChaosMesh 实验</strong>(YAML 能跑)</li><li><strong>组织一次 GameDay</strong>(从场景设计到复盘的 5 步)</li><li><strong>判断自己团队的混沌成熟度</strong>(L0-L5)</li><li><strong>判断自己团队该不该上混沌</strong>(3 个硬条件 + 团队规模 + 业务阶段)</li></ul><p><strong>最重要的一句话</strong>:<strong>混沌工程不是用来证明&quot;我们牛&quot;,是用来证明&quot;我们脆&quot;——脆在哪、脆到什么程度、有了护栏之后能否变强</strong>。这种心态对了,工具用什么都行;心态错了,工具再贵也救不了你。</p><hr><h2 id="十三、第六层上半部小结" tabindex="-1">十三、第六层上半部小结 <a class="header-anchor" href="#十三、第六层上半部小结" aria-label="Permalink to &quot;十三、第六层上半部小结&quot;">​</a></h2><p>四篇看完(28-31),你应该已经能在白板前讲清楚:</p><ul><li><strong>On-call</strong>:轮值 / Pager / 第一响应 / Hero 文化的危害</li><li><strong>Runbook</strong>:一告警一手册 / 自愈边界 / Confluence 是反模式</li><li><strong>容量规划</strong>:单实例上限 / 总容量公式 / Pre-scale 比 HPA 安全</li><li><strong>混沌工程</strong>:稳态假设 / 5 道护栏 / GameDay 流程 / 三个入场条件</li></ul><p>这四篇有一条暗线:<strong>把&quot;碰运气&quot;变成&quot;工程化&quot;</strong>——On-call 把&quot;靠老张&quot;变成&quot;靠制度&quot;、Runbook 把&quot;靠记忆&quot;变成&quot;靠脚本&quot;、容量规划把&quot;靠感觉&quot;变成&quot;靠公式&quot;、混沌工程把&quot;靠真实事故学习&quot;变成&quot;靠主动演练学习&quot;。<strong>所有这些,都是为了让你在真正的 P0 来临时,能比上一次少手忙脚乱一点</strong>。</p><hr><p>下一篇:<code>32-事故响应.md</code>,前 4 篇讲了&quot;事故来之前怎么准备&quot;,32 篇讲&quot;事故来了的那一刻怎么办&quot;——IC / Comms / Ops 三个角色怎么分工、战时频道怎么开、时间线怎么实时记录、对外/对内的沟通模板、为什么 Slack thread 不能当时间线、为什么 IC 不该自己动手修。32 + 33 篇会教你<strong>从凌晨 3:00 收到告警到第二天写完 Postmortem 的全流程</strong>——读完这套,你应该能独立指挥一次 P0 事故,而不是&quot;等老板来定夺&quot;。</p>`,104)])])}const g=a(l,[["render",t]]);export{c as __pageData,g as default};
