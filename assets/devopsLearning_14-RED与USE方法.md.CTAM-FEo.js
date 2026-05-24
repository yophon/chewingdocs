import{_ as a,H as n,f as p,i as e}from"./chunks/framework.BHvCMIhP.js";const h=JSON.parse('{"title":"RED 与 USE 方法:服务该看什么 / 资源该看什么 / 两者不能混","description":"","frontmatter":{},"headers":[],"relativePath":"devopsLearning/14-RED与USE方法.md","filePath":"devopsLearning/14-RED与USE方法.md","lastUpdated":1778496697000}'),l={name:"devopsLearning/14-RED与USE方法.md"};function t(i,s,o,c,r,u){return n(),p("div",null,[...s[0]||(s[0]=[e(`<h1 id="red-与-use-方法-服务该看什么-资源该看什么-两者不能混" tabindex="-1">RED 与 USE 方法:服务该看什么 / 资源该看什么 / 两者不能混 <a class="header-anchor" href="#red-与-use-方法-服务该看什么-资源该看什么-两者不能混" aria-label="Permalink to &quot;RED 与 USE 方法:服务该看什么 / 资源该看什么 / 两者不能混&quot;">​</a></h1><p>上一篇 13 讲 SLI/SLO/SLA——SLI 是定义、SLO 是承诺、SLA 是合同。但定义说完,真到值班那一刻,<strong>你打开 Grafana 看哪几个 panel?</strong> 这就是 14 篇要解决的问题。<strong>前面讲的是&quot;该承诺什么&quot;,这一篇讲的是&quot;该看什么&quot;</strong>——两件事都做不好,告警是配不出来的,因为你根本不知道该把告警挂在哪个指标上。</p><blockquote><p>一句话先记住:<strong>RED 是给服务的体温表,USE 是给资源的血压计——一个测&quot;用户感觉怎么样&quot;,一个测&quot;机器还撑得住吗&quot;,混用就像拿温度计量血压一样荒唐</strong>。我见过太多团队把 CPU &gt; 80% 的告警当成&quot;服务变慢了&quot;——结果业务延迟从 100ms 涨到 2s 那一刻,CPU 才 30%,告警一声不响。<strong>那 90% 的 CPU 是 GC 在原地烧,不是用户请求在烧</strong>。这一篇讲清楚:<strong>用户视角先看 RED 确认有没有事,机器视角再看 USE 找根因</strong>——顺序反了一次,事故就拖一倍。</p></blockquote><hr><h2 id="一、问题场景-看错指标的两种悲剧" tabindex="-1">一、问题场景:看错指标的两种悲剧 <a class="header-anchor" href="#一、问题场景-看错指标的两种悲剧" aria-label="Permalink to &quot;一、问题场景:看错指标的两种悲剧&quot;">​</a></h2><p>我把生产事故里&quot;指标用错&quot;的场景归成两类——<strong>漏报和误报</strong>,每类都见过几十次。</p><h3 id="_1-1-悲剧-a-用资源指标告警-漏报了服务问题" tabindex="-1">1.1 悲剧 A:用资源指标告警,漏报了服务问题 <a class="header-anchor" href="#_1-1-悲剧-a-用资源指标告警-漏报了服务问题" aria-label="Permalink to &quot;1.1 悲剧 A:用资源指标告警,漏报了服务问题&quot;">​</a></h3><p>某团队订单服务,告警配的是「CPU &gt; 80% 持续 5min」。某天凌晨业务延迟从 80ms 飙到 1.8s,<strong>告警一声不响</strong>——因为 CPU 才 45%。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>凌晨 1:30  用户开始反馈下单慢</span></span>
<span class="line"><span>凌晨 1:45  客服群炸了,工单上百</span></span>
<span class="line"><span>凌晨 1:50  值班 SRE 自己点开 Grafana 才看见 P99 飙了</span></span>
<span class="line"><span>凌晨 1:55  告警没响,因为 CPU 没飙到 80%</span></span>
<span class="line"><span>凌晨 2:10  定位:Redis 主从切换中,大量 GET 在等待</span></span>
<span class="line"><span>凌晨 2:30  修好</span></span></code></pre></div><p><strong>根因</strong>:这个服务大部分时间在等 Redis,<strong>CPU 利用率天然就低</strong>。&quot;CPU 80% 才告警&quot;是从教科书里抄来的&quot;经验值&quot;,<strong>和这个服务的实际工作模式毫无关系</strong>。</p><p><strong>这不是 SRE 不努力,是指标选错了</strong>——用资源指标(CPU)去回答服务问题(慢了没有),<strong>回答错了第一个问题,后面所有动作全错位</strong>。</p><h3 id="_1-2-悲剧-b-用服务指标告警-告警闪烁" tabindex="-1">1.2 悲剧 B:用服务指标告警,告警闪烁 <a class="header-anchor" href="#_1-2-悲剧-b-用服务指标告警-告警闪烁" aria-label="Permalink to &quot;1.2 悲剧 B:用服务指标告警,告警闪烁&quot;">​</a></h3><p>另一个团队反向操作。告警配的是「P99 &gt; 500ms 持续 1min」,<strong>结果整天告警闪烁</strong>——白天发布、晚上跑批、缓存预热,任何一个动作都能把 P99 推过 500ms,<strong>值班一周收 60 多条告警</strong>,最后大家都把告警群静音了。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>告警 → 值班看 → 看一眼就过去了 → 告警 → 静音 → 真出事再没人看</span></span></code></pre></div><p><strong>根因</strong>:<strong>P99 是个高噪声指标</strong>,1 分钟的瞬时抖动几乎和系统真坏没区别。<strong>只看服务指标不看资源,就分不清&quot;系统真挂了&quot;还是&quot;系统只是抖了一下&quot;</strong>。</p><h3 id="_1-3-两种悲剧的共同点" tabindex="-1">1.3 两种悲剧的共同点 <a class="header-anchor" href="#_1-3-两种悲剧的共同点" aria-label="Permalink to &quot;1.3 两种悲剧的共同点&quot;">​</a></h3><p><strong>两种悲剧都是&quot;只看一边&quot;造成的</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>只看 RED(服务):      P99 抖一下你就响,真挂了你又说不清根因</span></span>
<span class="line"><span>只看 USE(资源):      资源没爆你就睡,业务早就慢成狗</span></span>
<span class="line"><span>RED + USE 配合:       服务先报警,资源指根因,这才叫闭环</span></span></code></pre></div><p>中型团队(10 人 / 100 微服务)撞上这两类问题几乎是必然——<strong>没有一个 10 人团队能凭直觉给 100 个服务挑指标</strong>,必须有方法论兜底。<strong>RED 和 USE 就是这两个方法论</strong>。</p><hr><h2 id="二、red-服务视角的三件套" tabindex="-1">二、RED:服务视角的三件套 <a class="header-anchor" href="#二、red-服务视角的三件套" aria-label="Permalink to &quot;二、RED:服务视角的三件套&quot;">​</a></h2><h3 id="_2-1-概念" tabindex="-1">2.1 概念 <a class="header-anchor" href="#_2-1-概念" aria-label="Permalink to &quot;2.1 概念&quot;">​</a></h3><p><strong>RED</strong> 由 Tom Wilkie 在 Weaveworks 工作时提出(2015,影响 Prometheus 生态最深的一篇博客),针对<strong>请求驱动型服务</strong>(HTTP、RPC、消息消费):</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>R - Rate         请求速率(QPS / RPS)</span></span>
<span class="line"><span>E - Errors       错误数 / 错误率</span></span>
<span class="line"><span>D - Duration     延迟分布(P50 / P99)</span></span></code></pre></div><p><strong>这三个指标是用户感知系统的全部入口</strong>——用户访问你,只能看到&quot;快不快、对不对、能不能用&quot;,<strong>对应的就是 D / E / R</strong>。</p><h3 id="_2-2-为什么是这三个-不是别的" tabindex="-1">2.2 为什么是这三个,不是别的 <a class="header-anchor" href="#_2-2-为什么是这三个-不是别的" aria-label="Permalink to &quot;2.2 为什么是这三个,不是别的&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>为什么 R 必选:</span></span>
<span class="line"><span>   - 没有 R 你无法判断&quot;错误率&quot;的分母</span></span>
<span class="line"><span>     1 个错误 / 10 个请求 = 10% 错误(灾难)</span></span>
<span class="line"><span>     1 个错误 / 100,000 个请求 = 0.001% 错误(噪声)</span></span>
<span class="line"><span>   - R 的突降本身是事故信号(用户访问不到 = 流量没了)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>为什么 E 必选:</span></span>
<span class="line"><span>   - 用户感知的&quot;坏&quot;的最直接信号</span></span>
<span class="line"><span>   - 必须区分 4xx / 5xx(下面踩坑会讲)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>为什么 D 必选:</span></span>
<span class="line"><span>   - 用户感知的&quot;慢&quot;的最直接信号</span></span>
<span class="line"><span>   - 必须用分位数,不能用 avg(下面踩坑会讲)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>为什么&quot;不是 CPU / Memory / Connections&quot;:</span></span>
<span class="line"><span>   - 这些是&quot;为什么慢/错&quot;的根因,不是&quot;用户感觉&quot;</span></span>
<span class="line"><span>   - 走对了顺序:先 RED 确认&quot;用户感觉怎么样&quot;,再下钻</span></span></code></pre></div><h3 id="_2-3-red-在-prometheus-里的标准写法" tabindex="-1">2.3 RED 在 Prometheus 里的标准写法 <a class="header-anchor" href="#_2-3-red-在-prometheus-里的标准写法" aria-label="Permalink to &quot;2.3 RED 在 Prometheus 里的标准写法&quot;">​</a></h3><p>针对一个 HTTP 服务,<strong>这三条 PromQL 几乎是固定写法</strong>:</p><div class="language-promql vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">promql</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># R: 当前 5min QPS</span></span>
<span class="line"><span>sum(rate(http_requests_total{service=&quot;order&quot;}[5m]))</span></span>
<span class="line"><span></span></span>
<span class="line"><span># E: 当前 5min 错误率(5xx 占比)</span></span>
<span class="line"><span>sum(rate(http_requests_total{service=&quot;order&quot;, status=~&quot;5..&quot;}[5m]))</span></span>
<span class="line"><span>  /</span></span>
<span class="line"><span>sum(rate(http_requests_total{service=&quot;order&quot;}[5m]))</span></span>
<span class="line"><span></span></span>
<span class="line"><span># D: 当前 5min P99 延迟</span></span>
<span class="line"><span>histogram_quantile(0.99,</span></span>
<span class="line"><span>  sum by (le) (rate(http_request_duration_seconds_bucket{service=&quot;order&quot;}[5m]))</span></span>
<span class="line"><span>)</span></span></code></pre></div><p><strong>这三条放在仪表盘第一屏</strong>——任何服务的总览,前三行就是这三条曲线。<strong>这一条规则</strong>违反了 60% 的 dashboard 就不要看了,大概率是&quot;导航灯堆&quot;反模式(下篇 16 详述)。</p><h3 id="_2-4-red-的扩展-red-saturation-四金信号" tabindex="-1">2.4 RED 的扩展:RED + Saturation = 四金信号 <a class="header-anchor" href="#_2-4-red-的扩展-red-saturation-四金信号" aria-label="Permalink to &quot;2.4 RED 的扩展:RED + Saturation = 四金信号&quot;">​</a></h3><p>Google SRE Book 里说的&quot;<strong>Four Golden Signals</strong>&quot;:Latency / Traffic / Errors / Saturation,<strong>前三个就是 RED 重命名,加了 Saturation</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Tom Wilkie 的 RED          Google 的四金信号</span></span>
<span class="line"><span>─────────────              ───────────────</span></span>
<span class="line"><span>Rate                  ≡   Traffic</span></span>
<span class="line"><span>Errors                ≡   Errors</span></span>
<span class="line"><span>Duration              ≡   Latency</span></span>
<span class="line"><span>(没有)                +   Saturation  ← Google 多加的一个</span></span></code></pre></div><p><strong>Saturation(饱和度)其实是 USE 里的概念</strong>——用户视角看不到饱和度,但服务工程师需要看。<strong>所以 Google 的四金信号其实是 RED + 半个 USE 的拼盘</strong>——这个细节大部分人没注意到,但理解了它,你就能解释为什么 Datadog 的 &quot;APM Overview&quot; 默认显示这四件而不是三件。</p><hr><h2 id="三、use-资源视角的三件套" tabindex="-1">三、USE:资源视角的三件套 <a class="header-anchor" href="#三、use-资源视角的三件套" aria-label="Permalink to &quot;三、USE:资源视角的三件套&quot;">​</a></h2><h3 id="_3-1-概念" tabindex="-1">3.1 概念 <a class="header-anchor" href="#_3-1-概念" aria-label="Permalink to &quot;3.1 概念&quot;">​</a></h3><p><strong>USE</strong> 由 Netflix 的 Brendan Gregg 提出(2012,《Systems Performance》的核心方法论),针对<strong>资源</strong>(CPU、内存、磁盘、网络、连接池、线程池):</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>U - Utilization  利用率(资源被用了多少时间)</span></span>
<span class="line"><span>S - Saturation   饱和度(资源排队 / 等待程度)</span></span>
<span class="line"><span>E - Errors       错误(资源本身报错次数)</span></span></code></pre></div><p><strong>USE 是&quot;机器视角&quot;</strong> —— 它不关心用户感觉怎么样,只关心&quot;这台机器/这块资源还能撑多久&quot;。</p><h3 id="_3-2-u-vs-s-的区别——大部分人没分清" tabindex="-1">3.2 U vs S 的区别——大部分人没分清 <a class="header-anchor" href="#_3-2-u-vs-s-的区别——大部分人没分清" aria-label="Permalink to &quot;3.2 U vs S 的区别——大部分人没分清&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Utilization(利用率):</span></span>
<span class="line"><span>  - &quot;资源在工作的时间占比&quot;</span></span>
<span class="line"><span>  - CPU 利用率 80% = 100ms 里有 80ms 在执行指令</span></span>
<span class="line"><span>  - 单纯看 U 看不出&quot;快撑不住了&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Saturation(饱和度):</span></span>
<span class="line"><span>  - &quot;资源排队等待的程度&quot;</span></span>
<span class="line"><span>  - CPU 饱和度高 = run queue 里堆了很多等着调度的进程</span></span>
<span class="line"><span>  - U 100% 还有空间,S 高了才真的卡</span></span>
<span class="line"><span></span></span>
<span class="line"><span>类比:</span></span>
<span class="line"><span>  超市收银台 U = 收银员忙不忙</span></span>
<span class="line"><span>  超市收银台 S = 顾客排队队伍长不长</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  U 80% 可能根本不堵(收银员忙但没人等)</span></span>
<span class="line"><span>  U 50% 可能已经堵(收银员速度慢,人都在等)</span></span></code></pre></div><p><strong>这一组对比是 USE 方法论的核心</strong>。<strong>很多人监控只看 U 不看 S</strong>——结果 CPU 70% 心想没事,run queue 已经堆了 20 个进程,实际响应已经卡了。<strong>U 给假象,S 给真相</strong>。</p><h3 id="_3-3-每种资源的-use-指标对照表" tabindex="-1">3.3 每种资源的 USE 指标对照表 <a class="header-anchor" href="#_3-3-每种资源的-use-指标对照表" aria-label="Permalink to &quot;3.3 每种资源的 USE 指标对照表&quot;">​</a></h3><p>这是工程上最有用的一张表,<strong>贴在工位上</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌────────────────┬──────────────────────┬───────────────────────┬───────────────────────┐</span></span>
<span class="line"><span>│  资源          │  Utilization         │  Saturation           │  Errors               │</span></span>
<span class="line"><span>├────────────────┼──────────────────────┼───────────────────────┼───────────────────────┤</span></span>
<span class="line"><span>│  CPU           │  cpu_usage_percent   │  run_queue_length     │  hardware ECC errors  │</span></span>
<span class="line"><span>│                │  (1 - idle 时间)     │  load_average / cores │  (硬件错,几乎不出)   │</span></span>
<span class="line"><span>├────────────────┼──────────────────────┼───────────────────────┼───────────────────────┤</span></span>
<span class="line"><span>│  内存          │  used / total        │  swap I/O rate        │  OOM kill count       │</span></span>
<span class="line"><span>│                │  (含 buffer/cache    │  page fault rate      │  malloc fail count    │</span></span>
<span class="line"><span>│                │   还是不含?见 §6.5) │  oom score adj        │                       │</span></span>
<span class="line"><span>├────────────────┼──────────────────────┼───────────────────────┼───────────────────────┤</span></span>
<span class="line"><span>│  磁盘 I/O      │  iostat %util        │  iostat avgqu-sz      │  iostat r_await / err │</span></span>
<span class="line"><span>│                │                      │  (await time)         │  smart 错误 / EIO     │</span></span>
<span class="line"><span>├────────────────┼──────────────────────┼───────────────────────┼───────────────────────┤</span></span>
<span class="line"><span>│  磁盘空间      │  df used %           │  inode used %         │  filesystem errors    │</span></span>
<span class="line"><span>│                │                      │  (新建文件失败)        │                       │</span></span>
<span class="line"><span>├────────────────┼──────────────────────┼───────────────────────┼───────────────────────┤</span></span>
<span class="line"><span>│  网络          │  bandwidth used /    │  TCP retransmit rate  │  rx/tx errors         │</span></span>
<span class="line"><span>│                │  link capacity       │  syn backlog full     │  drops (interface)    │</span></span>
<span class="line"><span>├────────────────┼──────────────────────┼───────────────────────┼───────────────────────┤</span></span>
<span class="line"><span>│  DB 连接池     │  active / max        │  waiting threads      │  acquire timeout      │</span></span>
<span class="line"><span>│                │  (HikariCP active)   │  pending acquisition  │  connection refused   │</span></span>
<span class="line"><span>├────────────────┼──────────────────────┼───────────────────────┼───────────────────────┤</span></span>
<span class="line"><span>│  线程池        │  active / max        │  queue size           │  rejected tasks       │</span></span>
<span class="line"><span>│                │                      │  rejected rate        │  uncaught exceptions  │</span></span>
<span class="line"><span>├────────────────┼──────────────────────┼───────────────────────┼───────────────────────┤</span></span>
<span class="line"><span>│  Redis 等连接  │  connected_clients / │  blocked_clients      │  rejected connections │</span></span>
<span class="line"><span>│                │  maxclients          │                       │                       │</span></span>
<span class="line"><span>├────────────────┼──────────────────────┼───────────────────────┼───────────────────────┤</span></span>
<span class="line"><span>│  Kafka 消费者  │  consumer lag = 0?   │  consumer lag(秒数)   │  rebalance failures   │</span></span>
<span class="line"><span>│                │  (消费跟得上吗)      │                       │                       │</span></span>
<span class="line"><span>└────────────────┴──────────────────────┴───────────────────────┴───────────────────────┘</span></span></code></pre></div><p><strong>这张表回答你 90% 的&quot;该看哪个指标&quot;的问题</strong>。需要新建一个监控面板?对照这张表,<strong>每个资源三列都要有</strong>——少一列就少了一个看见故障的眼睛。</p><h3 id="_3-4-use-在-node-exporter-的常见查询" tabindex="-1">3.4 USE 在 node_exporter 的常见查询 <a class="header-anchor" href="#_3-4-use-在-node-exporter-的常见查询" aria-label="Permalink to &quot;3.4 USE 在 node_exporter 的常见查询&quot;">​</a></h3><div class="language-promql vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">promql</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># CPU U:  CPU 利用率(1 - idle)</span></span>
<span class="line"><span>1 - avg by (instance) (rate(node_cpu_seconds_total{mode=&quot;idle&quot;}[5m]))</span></span>
<span class="line"><span></span></span>
<span class="line"><span># CPU S:  load avg 标准化(/ 核数)</span></span>
<span class="line"><span>node_load5 / on(instance) count by (instance) (node_cpu_seconds_total{mode=&quot;idle&quot;})</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 内存 U:  使用率(不含 cache,常被搞混)</span></span>
<span class="line"><span>1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 内存 S:  page fault 速率 / swap I/O</span></span>
<span class="line"><span>rate(node_vmstat_pgmajfault[5m])</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 磁盘 I/O U:  util%</span></span>
<span class="line"><span>rate(node_disk_io_time_seconds_total[5m])</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 磁盘 I/O S:  await(等待时间)</span></span>
<span class="line"><span>rate(node_disk_io_time_weighted_seconds_total[5m]) </span></span>
<span class="line"><span>  / rate(node_disk_io_time_seconds_total[5m])</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 网络 S:  TCP retransmit rate</span></span>
<span class="line"><span>rate(node_netstat_Tcp_RetransSegs[5m])</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 网络 E:  接口错包</span></span>
<span class="line"><span>rate(node_network_receive_errs_total[5m])</span></span></code></pre></div><p><strong>这一段配一份 Grafana 「Node Overview」dashboard 就齐了</strong>——任何一台机器你怀疑&quot;是不是 OS 在抖&quot;,这套 PromQL 翻一遍 30 秒看完。</p><hr><h2 id="四、red-use-配合-故障定位的标准流程" tabindex="-1">四、RED + USE 配合:故障定位的标准流程 <a class="header-anchor" href="#四、red-use-配合-故障定位的标准流程" aria-label="Permalink to &quot;四、RED + USE 配合:故障定位的标准流程&quot;">​</a></h2><p>讲清楚两套指标各自是什么后,<strong>真正值钱的是&quot;两者怎么配合&quot;</strong>——下面这张图是这一篇最重要的一张图。</p><h3 id="_4-1-故障定位流程图" tabindex="-1">4.1 故障定位流程图 <a class="header-anchor" href="#_4-1-故障定位流程图" aria-label="Permalink to &quot;4.1 故障定位流程图&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌────────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│       告警响起(或用户反馈&quot;服务慢&quot;/客服炸了)                  │</span></span>
<span class="line"><span>└────────────────────────┬───────────────────────────────────────┘</span></span>
<span class="line"><span>                         │</span></span>
<span class="line"><span>                         ▼</span></span>
<span class="line"><span>       ┌─────────────────────────────────────────┐</span></span>
<span class="line"><span>       │  Step 1: RED 三看(用户视角先确认)      │</span></span>
<span class="line"><span>       │                                         │</span></span>
<span class="line"><span>       │  Rate     是否暴跌?(用户进不来)       │</span></span>
<span class="line"><span>       │  Errors   是否飙升?(用户出错)         │</span></span>
<span class="line"><span>       │  Duration 是否变长?(用户变慢)         │</span></span>
<span class="line"><span>       └─────────────────┬───────────────────────┘</span></span>
<span class="line"><span>                         │</span></span>
<span class="line"><span>              ┌──────────┴──────────┐</span></span>
<span class="line"><span>              │                     │</span></span>
<span class="line"><span>            是              否(虚惊一场)</span></span>
<span class="line"><span>              │                     │</span></span>
<span class="line"><span>              ▼                     ▼</span></span>
<span class="line"><span>   ┌──────────────────────┐    ┌──────────────────────┐</span></span>
<span class="line"><span>   │ Step 2: 是哪种异常?  │    │  关闭告警 / 验证假阳  │</span></span>
<span class="line"><span>   │                      │    │  → 走 15 篇的降噪    │</span></span>
<span class="line"><span>   │ A. Rate 暴跌          │    └──────────────────────┘</span></span>
<span class="line"><span>   │ B. Errors 飙升        │</span></span>
<span class="line"><span>   │ C. Duration 变长      │</span></span>
<span class="line"><span>   │ D. 复合(A+B / B+C)  │</span></span>
<span class="line"><span>   └──────────┬───────────┘</span></span>
<span class="line"><span>              │</span></span>
<span class="line"><span>              ▼</span></span>
<span class="line"><span>   ┌─────────────────────────────────────────────────┐</span></span>
<span class="line"><span>   │  Step 3: USE 下钻(资源视角找根因)              │</span></span>
<span class="line"><span>   │                                                 │</span></span>
<span class="line"><span>   │  ABC 不同问题看不同资源:                        │</span></span>
<span class="line"><span>   │                                                 │</span></span>
<span class="line"><span>   │  Rate 暴跌      → 流量没到?网关 / DNS / LB     │</span></span>
<span class="line"><span>   │                 → 客户端集体异常?              │</span></span>
<span class="line"><span>   │  Errors 飙升    → 代码 bug 看日志 / 看发布历史  │</span></span>
<span class="line"><span>   │                 → 下游不可用?看下游 RED       │</span></span>
<span class="line"><span>   │  Duration 变长  → CPU 饱和?(run queue)        │</span></span>
<span class="line"><span>   │                 → 内存抖?(GC / swap)         │</span></span>
<span class="line"><span>   │                 → 网络抖?(retransmit)        │</span></span>
<span class="line"><span>   │                 → DB 慢?(连接池 saturation)  │</span></span>
<span class="line"><span>   │                 → 下游慢?(看下游 D)          │</span></span>
<span class="line"><span>   └─────────────────┬───────────────────────────────┘</span></span>
<span class="line"><span>                     │</span></span>
<span class="line"><span>                     ▼</span></span>
<span class="line"><span>   ┌─────────────────────────────────────────┐</span></span>
<span class="line"><span>   │  Step 4: 验证假设 + 处置                 │</span></span>
<span class="line"><span>   │                                         │</span></span>
<span class="line"><span>   │  - 把&quot;假设的根因&quot;对应的 USE 指标         │</span></span>
<span class="line"><span>   │    画到 dashboard 同时间段对比          │</span></span>
<span class="line"><span>   │  - 看时间相关性是否对得上                │</span></span>
<span class="line"><span>   │  - 如果对得上 → 按 Runbook 处置(29 篇)│</span></span>
<span class="line"><span>   │  - 如果对不上 → 回 Step 3 换一组资源    │</span></span>
<span class="line"><span>   └─────────────────────────────────────────┘</span></span></code></pre></div><p><strong>这张图是这一篇最值得抄到工位的东西</strong>。从我自己的事故笔记里统计,<strong>80% 的故障可以靠这个四步流程在 15 分钟内定位</strong>——剩下 20% 是复合故障,需要事故响应制度(32 篇)兜底。</p><h3 id="_4-2-顺序问题-为什么必须-red-在前-use-在后" tabindex="-1">4.2 顺序问题:为什么必须 RED 在前 USE 在后 <a class="header-anchor" href="#_4-2-顺序问题-为什么必须-red-在前-use-在后" aria-label="Permalink to &quot;4.2 顺序问题:为什么必须 RED 在前 USE 在后&quot;">​</a></h3><p><strong>反过来走一遍</strong>会发生什么:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错的顺序:USE 先 → RED 后</span></span>
<span class="line"><span>   值班一上来看 node-exporter dashboard:</span></span>
<span class="line"><span>   &quot;CPU 75%,有点高,内存 78% 也有点高&quot;</span></span>
<span class="line"><span>   &quot;嗯,该扩容了吧?&quot;</span></span>
<span class="line"><span>   → 扩了容</span></span>
<span class="line"><span>   → 业务还是慢</span></span>
<span class="line"><span>   → 折腾 30 分钟才想起来看 RED</span></span>
<span class="line"><span>   → 发现是 DB 慢,跟 CPU 内存毛关系都没有</span></span>
<span class="line"><span></span></span>
<span class="line"><span>对的顺序:RED 先 → USE 后</span></span>
<span class="line"><span>   值班一上来看 service overview:</span></span>
<span class="line"><span>   &quot;P99 飙了,Errors 还行,Rate 没变&quot;</span></span>
<span class="line"><span>   → &quot;用户体验在变慢,但还能进来&quot;</span></span>
<span class="line"><span>   → &quot;看哪个资源饱和度最高?&quot;</span></span>
<span class="line"><span>   → DB 连接池 saturation 飙了</span></span>
<span class="line"><span>   → 直接定位是 DB 问题,5 分钟搞定</span></span></code></pre></div><p><strong>用户视角先,机器视角后</strong>——这条规则的根因是:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>用户视角:Bottom Line  → 直接回答&quot;有没有事 / 多严重&quot;</span></span>
<span class="line"><span>机器视角:Diagnostic   → 回答&quot;事在哪里 / 怎么修&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>先 Bottom Line 再 Diagnostic ✓ ——先判断该不该投人,再查</span></span>
<span class="line"><span>先 Diagnostic 再 Bottom Line ✗ ——拿着锤子找钉子</span></span></code></pre></div><hr><h2 id="五、真实场景演练-延迟从-100ms-涨到-2s-的四步定位" tabindex="-1">五、真实场景演练:延迟从 100ms 涨到 2s 的四步定位 <a class="header-anchor" href="#五、真实场景演练-延迟从-100ms-涨到-2s-的四步定位" aria-label="Permalink to &quot;五、真实场景演练:延迟从 100ms 涨到 2s 的四步定位&quot;">​</a></h2><p>把上面的流程图用一次真实事故走一遍。<strong>这个场景是我 2024 年某次复盘里挑出来最典型的一个</strong>。</p><h3 id="_5-1-场景" tabindex="-1">5.1 场景 <a class="header-anchor" href="#_5-1-场景" aria-label="Permalink to &quot;5.1 场景&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>背景:订单服务,正常 P99 = 100ms,QPS = 3000</span></span>
<span class="line"><span>时间:2024-08-12 下午 3 点(白天非高峰)</span></span>
<span class="line"><span>告警:OrderServiceLatencyP99 &gt; 500ms 持续 5min</span></span>
<span class="line"><span>现象:用户反馈下单&quot;按了没反应&quot;</span></span></code></pre></div><h3 id="_5-2-step-1-red-三看" tabindex="-1">5.2 Step 1:RED 三看 <a class="header-anchor" href="#_5-2-step-1-red-三看" aria-label="Permalink to &quot;5.2 Step 1:RED 三看&quot;">​</a></h3><p>打开服务总览 dashboard(15 秒):</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Rate:       3000 → 2800 QPS(略降,但不是暴跌,大概是用户开始放弃)</span></span>
<span class="line"><span>Errors:     0.1% → 0.15%(微升,但还在正常波动范围)</span></span>
<span class="line"><span>Duration:   P99 100ms → 1.8s(18x,这是大事)</span></span>
<span class="line"><span>            P50 30ms → 80ms(2.6x)</span></span>
<span class="line"><span>            P95 80ms → 800ms(10x)</span></span></code></pre></div><p><strong>判断</strong>:这是经典的 &quot;Duration 飙升,Errors 还行,Rate 略降&quot; 模式——<strong>用户没出错,就是变慢了,而且是大面积变慢</strong>(P50 也涨了 2 倍多)。</p><h3 id="_5-3-step-2-是哪种异常" tabindex="-1">5.3 Step 2:是哪种异常 <a class="header-anchor" href="#_5-3-step-2-是哪种异常" aria-label="Permalink to &quot;5.3 Step 2:是哪种异常&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>异常分类:</span></span>
<span class="line"><span>   A. Rate 暴跌       ✗(只降 7%)</span></span>
<span class="line"><span>   B. Errors 飙升     ✗(0.15% 不算飙)</span></span>
<span class="line"><span>   C. Duration 变长   ✓✓✓ 主要异常</span></span>
<span class="line"><span>   D. 复合           ✗</span></span></code></pre></div><p><strong>这是一个纯 Duration 异常</strong>——下一步就是去 USE 找&quot;什么资源变慢了&quot;。</p><h3 id="_5-4-step-3-use-下钻" tabindex="-1">5.4 Step 3:USE 下钻 <a class="header-anchor" href="#_5-4-step-3-use-下钻" aria-label="Permalink to &quot;5.4 Step 3:USE 下钻&quot;">​</a></h3><p>按&quot;延迟变长可能的资源因素&quot;,<strong>一组一组看</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. CPU 饱和?</span></span>
<span class="line"><span>   - cpu_usage_percent:    45%(正常)</span></span>
<span class="line"><span>   - load1 / cores:        0.6(正常,小于 1 都健康)</span></span>
<span class="line"><span>   - run queue length:     2(正常)</span></span>
<span class="line"><span>   → CPU 不是元凶,跳过</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. 内存 / GC 抖?</span></span>
<span class="line"><span>   - heap used:            正常波动,没 OOM 前兆</span></span>
<span class="line"><span>   - GC pause(JVM):       平均 50ms,正常</span></span>
<span class="line"><span>   - swap I/O:             0(正常)</span></span>
<span class="line"><span>   → 内存不是元凶,跳过</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. 网络抖?</span></span>
<span class="line"><span>   - 入向带宽:             200Mbps(平时 180Mbps,正常)</span></span>
<span class="line"><span>   - TCP retransmit:       0.01%(正常)</span></span>
<span class="line"><span>   - 接口 errs:            0</span></span>
<span class="line"><span>   → 网络不是元凶,跳过</span></span>
<span class="line"><span></span></span>
<span class="line"><span>4. DB 连接池?</span></span>
<span class="line"><span>   - hikari active:        50/50(★★★ 满了!)</span></span>
<span class="line"><span>   - hikari pending:       80(★★★ 80 个请求在等连接!)</span></span>
<span class="line"><span>   - hikari timeout:       12 次/分钟(★★★ 已经在超时!)</span></span>
<span class="line"><span>   → 找到了</span></span>
<span class="line"><span></span></span>
<span class="line"><span>5. Redis 连接?(同样的逻辑也要看)</span></span>
<span class="line"><span>   - connected_clients:    正常</span></span>
<span class="line"><span>   - blocked_clients:      0</span></span>
<span class="line"><span>   → Redis 没事</span></span></code></pre></div><p><strong>关键洞察</strong>:CPU 才 45%,但是<strong>DB 连接池 saturation 已经爆表</strong>——这就是为什么&quot;CPU 80% 才告警&quot;会漏报这种事故的根因。<strong>Saturation 在用户感知到慢之前就先满了</strong>。</p><h3 id="_5-5-step-4-验证-处置" tabindex="-1">5.5 Step 4:验证 + 处置 <a class="header-anchor" href="#_5-5-step-4-验证-处置" aria-label="Permalink to &quot;5.5 Step 4:验证 + 处置&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>假设:DB 连接池满 → 请求排队 → 用户感知延迟</span></span>
<span class="line"><span></span></span>
<span class="line"><span>验证步骤(都对得上):</span></span>
<span class="line"><span>   ✓ 连接池 active 达到上限的时间点 == 延迟开始飙的时间点</span></span>
<span class="line"><span>   ✓ 连接池 pending 增长曲线和 P99 增长曲线高度同步</span></span>
<span class="line"><span>   ✓ DB 上的慢查询数同步增长</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>真因:某个新发布的批量查询接口没加 LIMIT,</span></span>
<span class="line"><span>     单次查询拉了 50w 行,占着连接 30s 不放,</span></span>
<span class="line"><span>     连接池被慢查询耗光,正常请求只能等</span></span>
<span class="line"><span></span></span>
<span class="line"><span>处置(按 Runbook):</span></span>
<span class="line"><span>   1. 立即 kill 长事务</span></span>
<span class="line"><span>   2. rollback 发布</span></span>
<span class="line"><span>   3. 验证 P99 恢复</span></span>
<span class="line"><span>   4. 开 ticket:DB 慢 SQL 防御 + 接口 review</span></span></code></pre></div><p><strong>整个流程下来,从告警响起到定位根因 12 分钟</strong>——80% 的时间花在 Step 3 的 USE 逐项核对。<strong>没有这套方法论,典型团队同样的事故要花 60-90 分钟</strong>。</p><hr><h2 id="六、5-条踩坑提醒-每一条都见过" tabindex="-1">六、5 条踩坑提醒(每一条都见过) <a class="header-anchor" href="#六、5-条踩坑提醒-每一条都见过" aria-label="Permalink to &quot;六、5 条踩坑提醒(每一条都见过)&quot;">​</a></h2><h3 id="_6-1-坑-1-errors-只看-5xx-漏了-4xx" tabindex="-1">6.1 坑 1:Errors 只看 5xx 漏了 4xx <a class="header-anchor" href="#_6-1-坑-1-errors-只看-5xx-漏了-4xx" aria-label="Permalink to &quot;6.1 坑 1:Errors 只看 5xx 漏了 4xx&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错误的做法:</span></span>
<span class="line"><span>   Errors = sum(rate(http_requests_total{status=~&quot;5..&quot;}[5m]))</span></span>
<span class="line"><span>            / sum(rate(http_requests_total[5m]))</span></span>
<span class="line"><span></span></span>
<span class="line"><span>漏的场景:</span></span>
<span class="line"><span>   某次发布把鉴权改坏,所有请求都 401(4xx)</span></span>
<span class="line"><span>   - 5xx 错误率:0%</span></span>
<span class="line"><span>   - 用户体验:全部用户登录不进来,系统等于挂了</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   告警:不响(因为只看 5xx)</span></span></code></pre></div><p><strong>正确做法</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>- 业务错误:看 5xx + 部分 4xx(401 / 403 / 429)</span></span>
<span class="line"><span>  这些是&quot;服务端拒绝了用户&quot;的信号</span></span>
<span class="line"><span>- 客户端错误:404 / 400 单独看,正常的有一定占比</span></span>
<span class="line"><span>- 关键是:每个 4xx 状态码语义不同,不要一锅炖</span></span>
<span class="line"><span></span></span>
<span class="line"><span>更细的做法:</span></span>
<span class="line"><span>   Errors = sum(rate(http_requests_total{status=~&quot;5..|401|403|429&quot;}[5m]))</span></span>
<span class="line"><span>            / sum(rate(http_requests_total[5m]))</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   再加一个 4xx 异常 告警(单独的):</span></span>
<span class="line"><span>   sum(rate(http_requests_total{status=~&quot;4..&quot;}[5m])) &gt; 历史均值 * 3</span></span></code></pre></div><p><strong>这个坑我见过的反例最多——团队&quot;凭直觉&quot;配 5xx,生产被一次 401 风暴打趴</strong>。</p><h3 id="_6-2-坑-2-duration-只看-avg-不看分位数" tabindex="-1">6.2 坑 2:Duration 只看 avg 不看分位数 <a class="header-anchor" href="#_6-2-坑-2-duration-只看-avg-不看分位数" aria-label="Permalink to &quot;6.2 坑 2:Duration 只看 avg 不看分位数&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错的:</span></span>
<span class="line"><span>   avg_latency = sum(rate(duration_sum[5m])) </span></span>
<span class="line"><span>                 / sum(rate(duration_count[5m]))</span></span>
<span class="line"><span></span></span>
<span class="line"><span>为什么错:</span></span>
<span class="line"><span>   1000 个请求:990 个 50ms,10 个 5s</span></span>
<span class="line"><span>   avg = (990 * 50 + 10 * 5000) / 1000 = 99.5ms ← 看起来挺好</span></span>
<span class="line"><span>   P99 = 5000ms ← 真相是 1% 用户体验灾难</span></span>
<span class="line"><span></span></span>
<span class="line"><span>avg 把&quot;少数用户的灾难&quot;平均掉了</span></span></code></pre></div><p><strong>正确做法</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>- 必须用 histogram 而不是 summary(参考 7 篇 PromQL)</span></span>
<span class="line"><span>- 至少看 P50 / P95 / P99</span></span>
<span class="line"><span>- P99.9 和 P99.99 只在大流量场景看(QPS &gt; 10w 才有意义)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>错误的延伸: histogram_quantile 算错</span></span>
<span class="line"><span>   做错的:histogram_quantile(0.99, rate(bucket{}[5m]))</span></span>
<span class="line"><span>            ↑ 没 sum by(le)</span></span>
<span class="line"><span>   做对的:histogram_quantile(0.99, sum by(le) (rate(bucket{}[5m])))</span></span></code></pre></div><p><strong>这条已经在 07 篇 PromQL 实战详细讲过,这里只复诵一遍重要性</strong>——<strong>用 avg 配告警的团队,告警基本是个摆设</strong>。</p><h3 id="_6-3-坑-3-use-只看-utilization-漏了-saturation" tabindex="-1">6.3 坑 3:USE 只看 Utilization 漏了 Saturation <a class="header-anchor" href="#_6-3-坑-3-use-只看-utilization-漏了-saturation" aria-label="Permalink to &quot;6.3 坑 3:USE 只看 Utilization 漏了 Saturation&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>反例:</span></span>
<span class="line"><span>   服务延迟飙升,值班看 CPU 利用率 60% / 内存 65% / 磁盘 70%</span></span>
<span class="line"><span>   → &quot;看起来都没爆,资源没问题&quot;</span></span>
<span class="line"><span>   → 实际:run queue 长度 = 30(进程都在等 CPU 调度)</span></span>
<span class="line"><span>   → 实际:DB 连接池 active=49/50,pending=200(快要爆但还差 1)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Utilization 给你&quot;忙不忙&quot;的假象,Saturation 才说真话</span></span></code></pre></div><p><strong>铁律</strong>:<strong>任何一类资源的监控,必须 U 和 S 都画</strong>。<strong>只画 U 等于把眼睛蒙住一半</strong>。</p><p><strong>操作建议</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>对照 §3.3 的 USE 表格,逐项检查你团队的 dashboard:</span></span>
<span class="line"><span>   - 每种资源都画了 U 吗?</span></span>
<span class="line"><span>   - 每种资源都画了 S 吗?</span></span>
<span class="line"><span>   - 哪些资源 S 没画?(很可能 80% 的资源 S 都没画)</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>缺失的 S 是定时炸弹——平时它代替告警系统在&quot;沉默&quot;</span></span></code></pre></div><h3 id="_6-4-坑-4-共享资源的-use-谁负责" tabindex="-1">6.4 坑 4:共享资源的 USE,谁负责? <a class="header-anchor" href="#_6-4-坑-4-共享资源的-use-谁负责" aria-label="Permalink to &quot;6.4 坑 4:共享资源的 USE,谁负责?&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>真实痛点:</span></span>
<span class="line"><span>   一个 MySQL 实例被 5 个微服务共用</span></span>
<span class="line"><span>   连接池打满了,谁的告警?谁的责任?</span></span>
<span class="line"><span></span></span>
<span class="line"><span>常见错误:</span></span>
<span class="line"><span>   A. 5 个团队都不收告警(觉得是别人的问题)</span></span>
<span class="line"><span>   B. 一个 DBA 团队收所有(DBA 团队 burnout)</span></span>
<span class="line"><span>   C. 5 个团队都收(告警重复 5 倍,值班疯)</span></span></code></pre></div><p><strong>正确做法</strong>:<strong>按&quot;谁占的多谁负责&quot;分桶</strong></p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 给每个连接打上 source tag(哪个服务连进来的)</span></span>
<span class="line"><span>   SHOW PROCESSLIST 里用 user_name 区分</span></span>
<span class="line"><span>   Hikari 给每个池起独立名字</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. 告警按主要消费者路由:</span></span>
<span class="line"><span>   &quot;DB 连接池告警 + top consumer == order-service&quot;</span></span>
<span class="line"><span>   → 路由给 order team</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>3. 总告警(没人是主因)→ DBA team(基础设施告警)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>4. 设容量预算:</span></span>
<span class="line"><span>   DB 总连接 1000,5 个服务各分 200</span></span>
<span class="line"><span>   超出自己配额 → 自己的告警</span></span></code></pre></div><p><strong>这条工程上最难,因为它是组织问题不是技术问题</strong>——但<strong>不解决就是&quot;基础设施告警黑洞&quot;</strong>:谁都看见,谁都不修。</p><h3 id="_6-5-坑-5-容器化下-cpu-utilization-的-cgroup-vs-宿主机歧义" tabindex="-1">6.5 坑 5:容器化下 CPU Utilization 的 cgroup vs 宿主机歧义 <a class="header-anchor" href="#_6-5-坑-5-容器化下-cpu-utilization-的-cgroup-vs-宿主机歧义" aria-label="Permalink to &quot;6.5 坑 5:容器化下 CPU Utilization 的 cgroup vs 宿主机歧义&quot;">​</a></h3><p>K8s 时代最常见的指标错认。<strong>值班看 dashboard 上 CPU 80%,你不知道是 80% 占了哪 100%</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>两种 CPU U 的语义:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>A. 宿主机 U(node_cpu_seconds_total)</span></span>
<span class="line"><span>   = 这台物理机的 CPU 用了多少</span></span>
<span class="line"><span>   - 节点上跑 30 个 Pod,这个 U 是 30 个 Pod + 系统的总和</span></span>
<span class="line"><span>   - 适合&quot;宿主机/节点饱不饱&quot;的判断</span></span>
<span class="line"><span>   - 用来给 cluster autoscaler 决策</span></span>
<span class="line"><span></span></span>
<span class="line"><span>B. cgroup U(container_cpu_usage_seconds_total)</span></span>
<span class="line"><span>   = 这个容器自己用了多少 / 自己 limit 多少</span></span>
<span class="line"><span>   - 1 个 Pod 内的用量</span></span>
<span class="line"><span>   - 适合&quot;我这个服务有没有被 throttle&quot;</span></span>
<span class="line"><span>   - 用来给 HPA 决策</span></span></code></pre></div><p><strong>告警混用的常见错误</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错: 我服务延迟飙了,看 cAdvisor 显示 cgroup U = 60%</span></span>
<span class="line"><span>     &quot;我才 60%,跟 CPU 无关吧&quot;</span></span>
<span class="line"><span>     → 实际:节点上别的 Pod 把宿主机吃满,导致这个服务被调度延迟</span></span>
<span class="line"><span></span></span>
<span class="line"><span>错: 告警配了&quot;node CPU &gt; 80%&quot;</span></span>
<span class="line"><span>     → 实际:节点上跑了 30 个 Pod,某个 Pod 自己 cgroup throttle 已经爆,</span></span>
<span class="line"><span>       但节点 U 才 40%(其他 Pod 闲着)</span></span></code></pre></div><p><strong>正确做法</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 服务级告警:用 cgroup U + CPU throttle</span></span>
<span class="line"><span>   container_cpu_cfs_throttled_seconds_total[5m] &gt; 0 ← 这个最关键</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>2. 节点级告警:用 node U + load avg</span></span>
<span class="line"><span>   适合容量规划告警,不是服务告警</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>3. 两者都要,不能省任一一个</span></span>
<span class="line"><span>   服务级问&quot;我有没有被卡&quot;,节点级问&quot;集群够不够&quot;</span></span></code></pre></div><p><strong>CPU throttle 这个指标在 cgroup v1 / v2 还不一样,很多人没监控这个,被坑到神经衰弱</strong>——明明 limit 给够了,容器还是慢,<strong>就是因为 throttle 数据没看</strong>。</p><h3 id="_6-6-bonus-坑-把-red-当-use-来配告警" tabindex="-1">6.6 Bonus 坑:把 RED 当 USE 来配告警 <a class="header-anchor" href="#_6-6-bonus-坑-把-red-当-use-来配告警" aria-label="Permalink to &quot;6.6 Bonus 坑:把 RED 当 USE 来配告警&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错的告警:</span></span>
<span class="line"><span>   alert: HighCPU</span></span>
<span class="line"><span>   expr: cpu_usage &gt; 0.8</span></span>
<span class="line"><span>   → &quot;服务延迟会变高的预警&quot;  ← 错位!</span></span>
<span class="line"><span></span></span>
<span class="line"><span>为什么错位:</span></span>
<span class="line"><span>   - CPU 高 ≠ 用户慢(很多 CPU 高在做正常 batch / GC)</span></span>
<span class="line"><span>   - CPU 不高 ≠ 用户快(可能在等 IO / 等下游)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>正确的告警分两条:</span></span>
<span class="line"><span>   1. 服务慢的告警:看 RED 的 Duration</span></span>
<span class="line"><span>      alert: ServiceLatencyHigh</span></span>
<span class="line"><span>      expr: histogram_quantile(0.99, ...) &gt; 0.5</span></span>
<span class="line"><span>      → &quot;用户感觉慢了&quot;</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   2. 资源饱和的告警:看 USE 的 Saturation</span></span>
<span class="line"><span>      alert: CPUSaturated</span></span>
<span class="line"><span>      expr: load5 / cores &gt; 1.5</span></span>
<span class="line"><span>      → &quot;扛不住要扩容了&quot;</span></span></code></pre></div><p><strong>这两个告警是不同的东西,不要试图用其中一个代替另一个</strong>——它们的处置 Runbook 也不一样,<strong>用资源告警调延迟问题,等于在错的 Runbook 上浪费时间</strong>。</p><hr><h2 id="七、把-red-use-落进-dashboard-和告警" tabindex="-1">七、把 RED + USE 落进 dashboard 和告警 <a class="header-anchor" href="#七、把-red-use-落进-dashboard-和告警" aria-label="Permalink to &quot;七、把 RED + USE 落进 dashboard 和告警&quot;">​</a></h2><p>讲完方法论,<strong>怎么落到团队?</strong> 给一个具体的执行路径。</p><h3 id="_7-1-每个服务的-dashboard-第一屏必须有-red" tabindex="-1">7.1 每个服务的 dashboard 第一屏必须有 RED <a class="header-anchor" href="#_7-1-每个服务的-dashboard-第一屏必须有-red" aria-label="Permalink to &quot;7.1 每个服务的 dashboard 第一屏必须有 RED&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  Service Overview - order-service                          │</span></span>
<span class="line"><span>├────────────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>│                                                            │</span></span>
<span class="line"><span>│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │</span></span>
<span class="line"><span>│  │  R: QPS      │  │  E: Err Rate │  │  D: P99 / P95 │    │</span></span>
<span class="line"><span>│  │              │  │              │  │              │    │</span></span>
<span class="line"><span>│  │  (rate over  │  │  (sum 5xx /  │  │  (histogram_ │    │</span></span>
<span class="line"><span>│  │   5min)      │  │   total)     │  │   quantile)  │    │</span></span>
<span class="line"><span>│  └──────────────┘  └──────────────┘  └──────────────┘    │</span></span>
<span class="line"><span>│                                                            │</span></span>
<span class="line"><span>│  ┌──────────────────────────────────────────────────┐     │</span></span>
<span class="line"><span>│  │  错误率 by endpoint(下钻)                       │     │</span></span>
<span class="line"><span>│  └──────────────────────────────────────────────────┘     │</span></span>
<span class="line"><span>│                                                            │</span></span>
<span class="line"><span>│  ┌──────────────────────────────────────────────────┐     │</span></span>
<span class="line"><span>│  │  延迟分布 P50/P95/P99 trend                      │     │</span></span>
<span class="line"><span>│  └──────────────────────────────────────────────────┘     │</span></span>
<span class="line"><span>└────────────────────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>这一屏就是用户视角</strong>——值班一打开,30 秒判断&quot;是不是真出事&quot;。第二屏起再放 USE(CPU / 内存 / 连接池 / 下游 RED 等)。<strong>顺序反了就是反模式</strong>(下篇 16 详述 dashboard 工程)。</p><h3 id="_7-2-告警挂在哪些指标" tabindex="-1">7.2 告警挂在哪些指标 <a class="header-anchor" href="#_7-2-告警挂在哪些指标" aria-label="Permalink to &quot;7.2 告警挂在哪些指标&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>P0/P1 告警的标准三类(给所有 user-facing 服务):</span></span>
<span class="line"><span>   1. RED-D: P99 &gt; SLO 阈值 + multi-burn-rate</span></span>
<span class="line"><span>   2. RED-E: 错误率 &gt; SLO 阈值 + multi-burn-rate</span></span>
<span class="line"><span>   3. RED-R: 流量异常(暴跌 50% 或暴涨 200%)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>P2 告警的标准 USE 类:</span></span>
<span class="line"><span>   1. USE-S: 关键资源饱和度高(连接池 / 线程池 / 队列)</span></span>
<span class="line"><span>   2. USE-E: 资源错误(OOM kill / drop / retry)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>不要单独配 USE-U 告警 ← 容易误报,看趋势就够</span></span></code></pre></div><p><strong>这个清单是 13-15 三篇的合奏</strong>——14 篇定义&quot;看什么&quot;,13 篇定义&quot;阈值多少&quot;,15 篇定义&quot;怎么挂告警不抖动&quot;。</p><h3 id="_7-3-给团队-onboard-用的-use-检查清单" tabindex="-1">7.3 给团队 onboard 用的 USE 检查清单 <a class="header-anchor" href="#_7-3-给团队-onboard-用的-use-检查清单" aria-label="Permalink to &quot;7.3 给团队 onboard 用的 USE 检查清单&quot;">​</a></h3><p>新人值班准入(参考 28 篇 §8.1)里加一条:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>[ ] 给团队负责的服务,默写出:</span></span>
<span class="line"><span>    - RED 的三条 PromQL</span></span>
<span class="line"><span>    - USE 的关键资源(列 3-5 项)</span></span>
<span class="line"><span>    - 每项资源的 U / S / E 在 dashboard 上的位置</span></span>
<span class="line"><span>    - 没看见就意味着这条指标团队没监控</span></span></code></pre></div><p><strong>这个练习能暴露 60% 的监控盲区</strong>。我做过几次,<strong>几乎所有团队都漏了 2-3 项 saturation</strong>。</p><hr><h2 id="八、何时不该上-red-use" tabindex="-1">八、何时不该上 RED + USE <a class="header-anchor" href="#八、何时不该上-red-use" aria-label="Permalink to &quot;八、何时不该上 RED + USE&quot;">​</a></h2><h3 id="_8-1-单体应用-流量极小" tabindex="-1">8.1 单体应用 / 流量极小 <a class="header-anchor" href="#_8-1-单体应用-流量极小" aria-label="Permalink to &quot;8.1 单体应用 / 流量极小&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>服务 &lt; 5 个 / QPS &lt; 100 / 用户 &lt; 100:</span></span>
<span class="line"><span>   - RED 三条够了,USE 偶尔看看</span></span>
<span class="line"><span>   - 不用搭建完整 USE 监控</span></span>
<span class="line"><span>   - 出事直接 SSH 上去 top + iostat,5 分钟搞定</span></span></code></pre></div><p><strong>理由</strong>:USE 监控也有成本——指标采集、存储、维护、看仪表盘的人。<strong>100 QPS 的服务给它配 30 个资源 panel,等于给一辆自行车装 GPS 导航</strong>。</p><h3 id="_8-2-批处理-流式作业" tabindex="-1">8.2 批处理 / 流式作业 <a class="header-anchor" href="#_8-2-批处理-流式作业" aria-label="Permalink to &quot;8.2 批处理 / 流式作业&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>RED 不完全适用:</span></span>
<span class="line"><span>   - 没有 Rate 概念(批次按天 / 小时跑)</span></span>
<span class="line"><span>   - Duration 是&quot;任务时长&quot;,不是&quot;用户感知&quot;</span></span>
<span class="line"><span>   - Errors 是&quot;任务失败&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>替代方案:</span></span>
<span class="line"><span>   - 看任务状态(running / done / failed)</span></span>
<span class="line"><span>   - 看处理 throughput(records/sec)</span></span>
<span class="line"><span>   - 看积压(input queue depth)</span></span>
<span class="line"><span>   - USE 还能用,但要换框架:Spark 看 stage time,</span></span>
<span class="line"><span>     Flink 看 backpressure,Kafka 看 consumer lag</span></span></code></pre></div><p><strong>RED + USE 是给 user-facing 在线服务</strong>的——批处理用错了反而误导。</p><h3 id="_8-3-库-sdk-进程内组件" tabindex="-1">8.3 库 / SDK / 进程内组件 <a class="header-anchor" href="#_8-3-库-sdk-进程内组件" aria-label="Permalink to &quot;8.3 库 / SDK / 进程内组件&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>不要给一个 SDK 配 RED:</span></span>
<span class="line"><span>   - 它不是&quot;服务&quot;,没有用户视角</span></span>
<span class="line"><span>   - 给宿主服务的 RED 反映 SDK 表现就够了</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>USE 也克制:</span></span>
<span class="line"><span>   - 进程内连接池 OK 监控</span></span>
<span class="line"><span>   - 进程内内存 / GC 看 JVM/Go 自带指标</span></span>
<span class="line"><span>   - 不要给每个 SDK 独立 dashboard</span></span></code></pre></div><h3 id="_8-4-平台-中间件-网关-db-mq" tabindex="-1">8.4 平台 / 中间件(网关 / DB / MQ) <a class="header-anchor" href="#_8-4-平台-中间件-网关-db-mq" aria-label="Permalink to &quot;8.4 平台 / 中间件(网关 / DB / MQ)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>看似 user-facing,实际不全是:</span></span>
<span class="line"><span>   - 网关:RED 完全适用,而且最该看(它是用户入口)</span></span>
<span class="line"><span>   - DB:USE 是主,RED 概念扭曲(DB 的&quot;用户&quot;是上游服务)</span></span>
<span class="line"><span>   - MQ:RED 概念变形(看 produce/consume rate + lag)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>具体方法:</span></span>
<span class="line"><span>   - 网关:RED + USE 全配</span></span>
<span class="line"><span>   - DB:USE 全配 + 慢查询监控(类似 RED-D)</span></span>
<span class="line"><span>   - MQ:特化的&quot;队列模型监控&quot;(rate + lag + DLQ rate)</span></span></code></pre></div><hr><h2 id="九、和上下游的关系" tabindex="-1">九、和上下游的关系 <a class="header-anchor" href="#九、和上下游的关系" aria-label="Permalink to &quot;九、和上下游的关系&quot;">​</a></h2><h3 id="_9-1-和-13-篇-sli-slo-的关系" tabindex="-1">9.1 和 13 篇(SLI/SLO)的关系 <a class="header-anchor" href="#_9-1-和-13-篇-sli-slo-的关系" aria-label="Permalink to &quot;9.1 和 13 篇(SLI/SLO)的关系&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>SLI 的选择,本质就是&quot;挑 RED 里哪几条做承诺指标&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>典型 SLI:</span></span>
<span class="line"><span>   - 可用性:RED-E = (1 - 错误率)  → 99.9%</span></span>
<span class="line"><span>   - 延迟:  RED-D = P99 &lt; 500ms 的比例 → 99%</span></span>
<span class="line"><span>   - 吞吐:  RED-R(很少作为 SLI,更多作为容量指标)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>RED 是 SLI 的候选池,SLO 是从池里挑出来做承诺的那几个</span></span></code></pre></div><h3 id="_9-2-和-15-篇-告警分级-的关系" tabindex="-1">9.2 和 15 篇(告警分级)的关系 <a class="header-anchor" href="#_9-2-和-15-篇-告警分级-的关系" aria-label="Permalink to &quot;9.2 和 15 篇(告警分级)的关系&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>RED 的 D 和 E 是&quot;长尾型&quot;指标,适合 multi-burn-rate 告警</span></span>
<span class="line"><span>USE 的 S 是&quot;阈值型&quot;指标,适合静态阈值 + for 间隔</span></span>
<span class="line"><span>USE 的 U 不适合直接告警(波动太大,用趋势看)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>下一篇 15 会详细讲怎么把 RED + USE 转成告警规则</span></span></code></pre></div><h3 id="_9-3-和-16-篇-仪表盘-的关系" tabindex="-1">9.3 和 16 篇(仪表盘)的关系 <a class="header-anchor" href="#_9-3-和-16-篇-仪表盘-的关系" aria-label="Permalink to &quot;9.3 和 16 篇(仪表盘)的关系&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>RED 应该放在 dashboard 第一屏(总览)</span></span>
<span class="line"><span>USE 应该放在 dashboard 第二屏起(下钻)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>不要把 USE 的图放在第一屏 ←★</span></span>
<span class="line"><span>   &quot;节点 CPU/内存&quot;这种监控应该是 L3 排障 dashboard,</span></span>
<span class="line"><span>   不是 L1 总览 dashboard</span></span></code></pre></div><h3 id="_9-4-和-29-篇-runbook-的关系" tabindex="-1">9.4 和 29 篇(Runbook)的关系 <a class="header-anchor" href="#_9-4-和-29-篇-runbook-的关系" aria-label="Permalink to &quot;9.4 和 29 篇(Runbook)的关系&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Runbook 的&quot;排查步骤&quot;应该是 RED + USE 的应用:</span></span>
<span class="line"><span>   1. 先看 RED 确认&quot;是不是真出事&quot;(15 秒)</span></span>
<span class="line"><span>   2. 然后 USE 下钻找根因(2-5 分钟)</span></span>
<span class="line"><span>   3. 验证假设(对照时间点)</span></span>
<span class="line"><span>   4. 处置</span></span>
<span class="line"><span></span></span>
<span class="line"><span>写 Runbook 的人如果不懂 RED + USE,</span></span>
<span class="line"><span>写出来的步骤就是&quot;看下日志看下监控&quot;这种废话</span></span></code></pre></div><hr><h2 id="十、踩坑提醒汇总" tabindex="-1">十、踩坑提醒汇总 <a class="header-anchor" href="#十、踩坑提醒汇总" aria-label="Permalink to &quot;十、踩坑提醒汇总&quot;">​</a></h2><p>把这一篇的 5 条踩坑 + 1 条 bonus 重新列一次,<strong>贴墙上</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. Errors 只看 5xx 漏 4xx          → 5xx + 401/403/429 + 4xx 异常告警</span></span>
<span class="line"><span>2. Duration 只看 avg               → 必看 P50/P95/P99,histogram_quantile</span></span>
<span class="line"><span>3. USE 只看 U 漏 Saturation       → 每类资源 U/S 都要画</span></span>
<span class="line"><span>4. 共享资源谁负责                  → 按主消费者分桶,设容量预算</span></span>
<span class="line"><span>5. 容器化 CPU U 的 cgroup vs 宿主机 → cgroup throttle 必看,两套都要</span></span>
<span class="line"><span>6. RED 当 USE 用配告警            → RED-D 告&quot;用户感觉&quot;,USE-S 告&quot;快撑不住&quot;</span></span>
<span class="line"><span>                                    两条独立告警,不要混</span></span></code></pre></div><hr><h2 id="十一、本篇硬指标" tabindex="-1">十一、本篇硬指标 <a class="header-anchor" href="#十一、本篇硬指标" aria-label="Permalink to &quot;十一、本篇硬指标&quot;">​</a></h2><p>看完这一篇,你应该能给团队:</p><ul><li><strong>3 分钟内</strong>:为团队负责的任一服务,默写出 RED 三条 PromQL</li><li><strong>5 分钟内</strong>:对照 §3.3 的 USE 表格,挑出团队 dashboard 漏画的 saturation 指标(至少 2 个)</li><li><strong>15 分钟内</strong>:用 §4.1 的四步流程,把上个月某次故障重新走一遍——验证流程能不能复用</li><li><strong>一周内</strong>:在团队 wiki 上挂一份「RED + USE 速查」,新人值班准入要默背 §3.3 的资源对照表</li></ul><p>最重要的:<strong>下次告警响起,你心里有一张&quot;RED 先 → USE 后&quot;的图,而不是&quot;啊该看哪个 panel&quot;的茫然</strong>。</p><hr><blockquote><p>下一篇 <code>15-告警分级与降噪.md</code>,<strong>这一层最有用的一篇</strong>。讲清楚 P0/P1/P2 语义、静态阈值为什么必定爆炸、<strong>multi-window multi-burn-rate</strong> 怎么用(SLO 工程里最反直觉、最救命的一个工具),以及告警风暴的根因诊治。<strong>14 篇告诉你看什么,15 篇告诉你什么时候叫人</strong>——配错了,所有上面这些 RED/USE 都变成&quot;看完没人响应&quot;的摆设。</p></blockquote>`,160)])])}const g=a(l,[["render",t]]);export{h as __pageData,g as default};
