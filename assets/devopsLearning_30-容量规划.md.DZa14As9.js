import{_ as a,H as n,f as i,i as p}from"./chunks/framework.BHvCMIhP.js";const d=JSON.parse('{"title":"容量规划:压测 → 模型 → 预算 / 单实例上限 / 弹性容量","description":"","frontmatter":{},"headers":[],"relativePath":"../devopsLearning/30-容量规划.md","filePath":"../devopsLearning/30-容量规划.md","lastUpdated":1778496697000}'),l={name:"../devopsLearning/30-容量规划.md"};function t(e,s,h,k,r,o){return n(),i("div",null,[...s[0]||(s[0]=[p(`<h1 id="容量规划-压测-→-模型-→-预算-单实例上限-弹性容量" tabindex="-1">容量规划:压测 → 模型 → 预算 / 单实例上限 / 弹性容量 <a class="header-anchor" href="#容量规划-压测-→-模型-→-预算-单实例上限-弹性容量" aria-label="Permalink to &quot;容量规划:压测 → 模型 → 预算 / 单实例上限 / 弹性容量&quot;">​</a></h1><p>backendLearning/36 讲过压测基础——怎么搭 k6 / wrk2、怎么读 P99 / 错误率、怎么避开&quot;压测压自己&quot;的低级坑。<strong>这一篇接着讲下一步:压测数据出来了,怎么把它变成&quot;容量决策&quot;</strong>。压测不是目的,是手段——目的是回答三个问题:<strong>现在能撑多少 / 增长趋势怎样 / 大促能不能扛</strong>。</p><blockquote><p>一句话先记住:<strong>容量规划不是&quot;调大点 CPU 就完事&quot;,是把&quot;服务的能力&quot;做成可度量、可预测、可预算的工程数字</strong>——压测找出单实例上限,模型算出总容量,弹性给突发兜底,预算把它转成 RMB。没有这一套,大促当天你只有两个选择:<strong>冒着雪崩硬扛 / 紧急砸钱临时扩容(成本翻 3 倍)</strong>。真正成熟的团队是大促前 2 周就知道&quot;我们能扛 50k QPS,需要扩到 80 实例,成本 +¥ 80k&quot;,<strong>写进 ticket、走完审批、用 IaC 一行命令上线</strong>——这一篇就是教你做这个的。</p></blockquote><hr><h2 id="一、问题场景-不做容量规划的三种死法" tabindex="-1">一、问题场景:不做容量规划的三种死法 <a class="header-anchor" href="#一、问题场景-不做容量规划的三种死法" aria-label="Permalink to &quot;一、问题场景:不做容量规划的三种死法&quot;">​</a></h2><h3 id="_1-1-死法一-大促雪崩" tabindex="-1">1.1 死法一:大促雪崩 <a class="header-anchor" href="#_1-1-死法一-大促雪崩" aria-label="Permalink to &quot;1.1 死法一:大促雪崩&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>某电商团队大促前一周:</span></span>
<span class="line"><span>  - PM:&quot;今年 GMV 目标 5x,流量预估 3x&quot;</span></span>
<span class="line"><span>  - 后端:&quot;3x?我们扩 3 倍机器就行&quot;</span></span>
<span class="line"><span>  - SRE:&quot;现在多少机器?能扛多少 QPS?&quot;</span></span>
<span class="line"><span>  - 后端:&quot;没压过,反正现在没问题&quot;</span></span>
<span class="line"><span>  - 大促开抢:实际流量 4x</span></span>
<span class="line"><span>  - 09:00 开始 5xx 飙升,购物车崩,30 分钟雪崩到下单不能</span></span>
<span class="line"><span>  - 紧急扩容:K8s Cluster Autoscaler 新节点冷启动 5min</span></span>
<span class="line"><span>  - 应用启动后 JIT 预热 + cache warm 还要 3min</span></span>
<span class="line"><span>  - 等到能扛流量时,大促高峰已经过去</span></span>
<span class="line"><span>  - GMV 损失:估算 ¥3M+</span></span></code></pre></div><p><strong>根因</strong>:&quot;扩 3 倍机器&quot;是凭感觉的,<strong>没有&quot;单实例上限&quot;这个基础数,后面所有计算都是空中楼阁</strong>。</p><h3 id="_1-2-死法二-闷头扩容-钱花光" tabindex="-1">1.2 死法二:闷头扩容,钱花光 <a class="header-anchor" href="#_1-2-死法二-闷头扩容-钱花光" aria-label="Permalink to &quot;1.2 死法二:闷头扩容,钱花光&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>另一个团队的反向死法:</span></span>
<span class="line"><span>  - 老板:&quot;绝不能出事,把机器加足&quot;</span></span>
<span class="line"><span>  - SRE:加到 200 实例,日均 CPU 利用率 8%</span></span>
<span class="line"><span>  - 一个月后财务表:成本同比 +60%</span></span>
<span class="line"><span>  - 老板:&quot;你们怎么花这么多钱?&quot;</span></span>
<span class="line"><span>  - 大家面面相觑</span></span></code></pre></div><p><strong>根因</strong>:<strong>没容量模型 = 只能&quot;无脑加&quot;</strong>——加多了浪费,加少了出事。没人知道&quot;什么叫够&quot;。</p><h3 id="_1-3-死法三-hpa-单飞-扛不住突发" tabindex="-1">1.3 死法三:HPA 单飞,扛不住突发 <a class="header-anchor" href="#_1-3-死法三-hpa-单飞-扛不住突发" aria-label="Permalink to &quot;1.3 死法三:HPA 单飞,扛不住突发&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>某团队&quot;我们用了 HPA,自动扩容,没事&quot;</span></span>
<span class="line"><span>  - HPA 配:CPU &gt; 70% 扩容</span></span>
<span class="line"><span>  - 某天某产品突然爆火,流量 30 秒翻 10 倍</span></span>
<span class="line"><span>  - HPA 看到 CPU 飙到 95%,触发扩容</span></span>
<span class="line"><span>  - 新 Pod 调度成功,镜像拉取 90s,启动 30s,预热 60s</span></span>
<span class="line"><span>  - 等新 Pod ready 时,3 分钟过去了</span></span>
<span class="line"><span>  - 这 3 分钟里:老 Pod 全部 100% CPU,P99 飙到 30s,5xx 50%</span></span>
<span class="line"><span>  - 等 HPA 终于稳定时,业务已经损失客户</span></span></code></pre></div><p><strong>根因</strong>:HPA 救得了&quot;渐变&quot;,救不了&quot;突变&quot;——<strong>HPA 不是万能的</strong>,它只能应对 5-10 分钟尺度的波动,30 秒级突发要靠&quot;预扩&quot;(Pre-scale)和&quot;过量储备&quot;(Over-provisioning)。</p><hr><h2 id="二、容量规划的-3-个核心问题" tabindex="-1">二、容量规划的 3 个核心问题 <a class="header-anchor" href="#二、容量规划的-3-个核心问题" aria-label="Permalink to &quot;二、容量规划的 3 个核心问题&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌─────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  容量规划要回答的 3 个问题                          │</span></span>
<span class="line"><span>├─────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>│  1. 现在能撑多少?                                   │</span></span>
<span class="line"><span>│     → 压测单实例上限 + 当前实例数 → 总上限           │</span></span>
<span class="line"><span>│                                                     │</span></span>
<span class="line"><span>│  2. 增长趋势怎样?                                   │</span></span>
<span class="line"><span>│     → 历史数据 + 业务增长率 → 未来 N 月需求         │</span></span>
<span class="line"><span>│                                                     │</span></span>
<span class="line"><span>│  3. 大促 / 突发能不能扛?                            │</span></span>
<span class="line"><span>│     → 峰值预估 + 弹性策略 + Pre-scale → 应急预案    │</span></span>
<span class="line"><span>└─────────────────────────────────────────────────────┘</span></span></code></pre></div><p>回答这三个问题的工程顺序:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>压测 → 单实例上限 → 总容量公式 → 预测模型 → 弹性策略 → 容量评审 → 预算</span></span>
<span class="line"><span>  ↑                                                          ↓</span></span>
<span class="line"><span>  └─────────────────── 季度复审 ──────────────────────────────┘</span></span></code></pre></div><p>下面逐节展开。</p><hr><h2 id="三、单实例上限-压测找出-一个-pod-能扛多少" tabindex="-1">三、单实例上限:压测找出&quot;一个 Pod 能扛多少&quot; <a class="header-anchor" href="#三、单实例上限-压测找出-一个-pod-能扛多少" aria-label="Permalink to &quot;三、单实例上限:压测找出&quot;一个 Pod 能扛多少&quot;&quot;">​</a></h2><h3 id="_3-1-找极限不是-压到崩" tabindex="-1">3.1 找极限不是&quot;压到崩&quot; <a class="header-anchor" href="#_3-1-找极限不是-压到崩" aria-label="Permalink to &quot;3.1 找极限不是&quot;压到崩&quot;&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>新人压测的错误姿势:</span></span>
<span class="line"><span>  &quot;我加流量到 5xx 出现为止,这就是上限&quot;</span></span>
<span class="line"><span>  → 错!这是&quot;崩溃点&quot;,不是&quot;容量上限&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>正确姿势:</span></span>
<span class="line"><span>  找&quot;刚好满足 SLO&quot;的最大 QPS</span></span>
<span class="line"><span>  例:SLO = P99 &lt; 500ms,5xx &lt; 0.1%</span></span>
<span class="line"><span>       压到 P99 = 480ms 时的 QPS,就是这个 Pod 的&quot;SLO 上限&quot;</span></span></code></pre></div><h3 id="_3-2-单实例上限的-4-个维度" tabindex="-1">3.2 单实例上限的 4 个维度 <a class="header-anchor" href="#_3-2-单实例上限的-4-个维度" aria-label="Permalink to &quot;3.2 单实例上限的 4 个维度&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌──────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  单实例上限同时受 4 个维度约束:                      │</span></span>
<span class="line"><span>├──────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>│  1. RPS(吞吐):每秒能处理多少请求                  │</span></span>
<span class="line"><span>│  2. 延迟:在 RPS 下 P99 是否 &lt; SLO                   │</span></span>
<span class="line"><span>│  3. 资源:CPU / Memory / 文件描述符 / 连接数         │</span></span>
<span class="line"><span>│  4. 错误:5xx / Timeout / panic 是否 &lt; SLO           │</span></span>
<span class="line"><span>└──────────────────────────────────────────────────────┘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>任何一个先到瓶颈,就是这个 Pod 的上限。</span></span></code></pre></div><h3 id="_3-3-一次完整的压测产出" tabindex="-1">3.3 一次完整的压测产出 <a class="header-anchor" href="#_3-3-一次完整的压测产出" aria-label="Permalink to &quot;3.3 一次完整的压测产出&quot;">​</a></h3><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 压测报告:order-service v1.5.0 单实例</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">target</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">order-service (single pod, 2vCPU/4GB)</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">test_duration</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">30min</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">ramping</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">100 → 2000 RPS in 5min, hold</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">results</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  rps_at_slo_breach</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">1450</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">       # 这是核心数字</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  rps_at_crash</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">2100</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">             # 比 SLO 高 45%</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  breaking_dimension</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">P99 latency</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"> # 哪个维度先崩</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  </span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  at_1450_rps</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    p50_latency</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">85ms</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    p99_latency</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">490ms</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">          # 接近 SLO 上限 500ms</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    p999_latency</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">1200ms</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    error_rate</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">0.08%</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    cpu_usage</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">65%</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    memory_usage</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">60%</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    fd_count</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">800 / 65535</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">       # 还远</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    db_conn_pool</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">42/50</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">          # 接近满</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    </span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  conclusion</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    &quot;单实例 SLO 上限 = 1450 RPS&quot;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    &quot;瓶颈:数据库连接池 + P99 延迟&quot;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    &quot;下次优化方向:DB 连接池调大 / 查询索引优化&quot;</span></span></code></pre></div><p><strong>这份报告的关键不是数字,是&quot;瓶颈在哪&quot;</strong>——下一次扩容前,这个瓶颈如果没解,扩 10 倍机器也突破不了。</p><h3 id="_3-4-设-70-为容量上限" tabindex="-1">3.4 设 70% 为容量上限 <a class="header-anchor" href="#_3-4-设-70-为容量上限" aria-label="Permalink to &quot;3.4 设 70% 为容量上限&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>压测出来 1450 RPS 不等于实际用 1450 RPS</span></span>
<span class="line"><span></span></span>
<span class="line"><span>为什么要 70% (~ 1000 RPS) 当容量上限?</span></span>
<span class="line"><span>   ✗ 100% = 任何突发(限流抖动 / GC / 网络抖动)都会越线</span></span>
<span class="line"><span>   △ 80%  = 仍紧张,P99 在 SLO 边缘抖</span></span>
<span class="line"><span>   ✓ 70%  = 留 30% 给突发 + GC + 偶发慢查询</span></span>
<span class="line"><span>   ✗ 50%  = 太保守,机器永远在 idle 状态,浪费</span></span>
<span class="line"><span></span></span>
<span class="line"><span>业内经验值:</span></span>
<span class="line"><span>  - 计算密集型(API):70%</span></span>
<span class="line"><span>  - I/O 密集型(网关):60%(突发更剧烈)</span></span>
<span class="line"><span>  - 内存敏感型(缓存):50%(GC 触发临界点更早)</span></span></code></pre></div><p><strong>这是&quot;容量水位&quot;的核心理念</strong>:<strong>永远留 20-30% 余量</strong>,不是为了浪费,是为了&quot;突发时能扛 5 分钟,直到自动扩容跟上&quot;。</p><hr><h2 id="四、容量公式-从单实例上限到总容量" tabindex="-1">四、容量公式:从单实例上限到总容量 <a class="header-anchor" href="#四、容量公式-从单实例上限到总容量" aria-label="Permalink to &quot;四、容量公式:从单实例上限到总容量&quot;">​</a></h2><h3 id="_4-1-基础公式" tabindex="-1">4.1 基础公式 <a class="header-anchor" href="#_4-1-基础公式" aria-label="Permalink to &quot;4.1 基础公式&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>              ┌─────────────────────────────────────┐</span></span>
<span class="line"><span>              │  总容量 = 单实例上限 × 实例数        │</span></span>
<span class="line"><span>              │          × 多 AZ 折扣 / 安全系数     │</span></span>
<span class="line"><span>              └─────────────────────────────────────┘</span></span></code></pre></div><p>展开:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>总可用 QPS = (R_single × N_instances × F_az) / S_safety</span></span>
<span class="line"><span></span></span>
<span class="line"><span>其中:</span></span>
<span class="line"><span>  R_single  = 单实例 SLO 上限 × 70%       (容量水位)</span></span>
<span class="line"><span>  N         = 实例数</span></span>
<span class="line"><span>  F_az      = 多 AZ 折扣(挂一个 AZ 还能用多少)</span></span>
<span class="line"><span>              单 AZ:1.0</span></span>
<span class="line"><span>              2 AZ 各占 50%:0.5(挂 1 个剩 50%)</span></span>
<span class="line"><span>              3 AZ 各占 33%:0.67(挂 1 个剩 67%)</span></span>
<span class="line"><span>  S_safety  = 安全系数(1.2-1.5,看业务关键度)</span></span></code></pre></div><p><strong>例子</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>order-service 现状:</span></span>
<span class="line"><span>  单实例 SLO 上限:1450 RPS</span></span>
<span class="line"><span>  容量水位:70% → 1000 RPS</span></span>
<span class="line"><span>  实例数:30</span></span>
<span class="line"><span>  部署:3 AZ 各 10 个</span></span>
<span class="line"><span>  安全系数:1.3(支付关键服务)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>总可用 QPS = (1000 × 30 × 0.67) / 1.3 = 15,461 RPS</span></span>
<span class="line"><span></span></span>
<span class="line"><span>业务实际峰值:9000 RPS  → 60% 水位,健康</span></span>
<span class="line"><span>预期 6 个月后峰值:14000 → 接近上限,需要扩容</span></span></code></pre></div><h3 id="_4-2-多-az-折扣的真正含义" tabindex="-1">4.2 多 AZ 折扣的真正含义 <a class="header-anchor" href="#_4-2-多-az-折扣的真正含义" aria-label="Permalink to &quot;4.2 多 AZ 折扣的真正含义&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>你部署 30 个实例在 3 AZ:</span></span>
<span class="line"><span>  AZ-a: 10 个   ──┐</span></span>
<span class="line"><span>  AZ-b: 10 个   ──┼── 总容量 30,000 RPS(假设单实例 1000)</span></span>
<span class="line"><span>  AZ-c: 10 个   ──┘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>如果 AZ-a 整个挂了:</span></span>
<span class="line"><span>  剩余:AZ-b + AZ-c = 20 个实例 = 20,000 RPS</span></span>
<span class="line"><span>  即:可用容量 = 30,000 × (2/3) = 20,000</span></span>
<span class="line"><span></span></span>
<span class="line"><span>所以单 AZ 故障下的&quot;可用容量&quot;= 总容量 × (n-1)/n</span></span>
<span class="line"><span>  n = AZ 数</span></span>
<span class="line"><span></span></span>
<span class="line"><span>n=2: 50% (一挂掉就剩一半,危险!)</span></span>
<span class="line"><span>n=3: 67% (挂一个还能扛 2/3,主流)</span></span>
<span class="line"><span>n=4+: 75%+ (大公司常用)</span></span></code></pre></div><p><strong>为什么 2 AZ 不够</strong>:挂一个就只剩 50%,<strong>而正常水位是 60-70%,挂掉 = 立刻越线</strong> → 雪崩。<strong>3 AZ 是中型团队的最低门槛</strong>。</p><h3 id="_4-3-安全系数怎么选" tabindex="-1">4.3 安全系数怎么选 <a class="header-anchor" href="#_4-3-安全系数怎么选" aria-label="Permalink to &quot;4.3 安全系数怎么选&quot;">​</a></h3><table tabindex="0"><thead><tr><th>业务关键度</th><th>S_safety</th><th>例子</th></tr></thead><tbody><tr><td>边缘服务</td><td>1.0</td><td>内部工具、报表</td></tr><tr><td>一般业务</td><td>1.2</td><td>用户中心、内容</td></tr><tr><td>核心业务</td><td>1.3</td><td>商品、订单、搜索</td></tr><tr><td>资金类</td><td>1.5</td><td>支付、结算、风控</td></tr><tr><td>生命线</td><td>2.0</td><td>鉴权、网关、监控自身</td></tr></tbody></table><p><strong>取舍</strong>:S_safety = 1.5 意味着&quot;理论上能撑 15000 QPS,实际只承诺 10000&quot;——<strong>多出来的 5000 是给 5xx 抖动、慢查询、突发用的</strong>。</p><hr><h2 id="五、容量预测-不只是看历史" tabindex="-1">五、容量预测:不只是看历史 <a class="header-anchor" href="#五、容量预测-不只是看历史" aria-label="Permalink to &quot;五、容量预测:不只是看历史&quot;">​</a></h2><h3 id="_5-1-三个数据源" tabindex="-1">5.1 三个数据源 <a class="header-anchor" href="#_5-1-三个数据源" aria-label="Permalink to &quot;5.1 三个数据源&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>未来容量需求 = 历史趋势 + 业务增长 + 突发场景</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  历史趋势      = 过去 12 个月日均/峰值 QPS 曲线</span></span>
<span class="line"><span>  业务增长      = PM 给的&quot;未来 6 个月业务目标增速&quot;</span></span>
<span class="line"><span>  突发场景      = 大促 / 营销 / 病毒传播 的乘数</span></span></code></pre></div><h3 id="_5-2-一个完整的容量曲线" tabindex="-1">5.2 一个完整的容量曲线 <a class="header-anchor" href="#_5-2-一个完整的容量曲线" aria-label="Permalink to &quot;5.2 一个完整的容量曲线&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>              QPS</span></span>
<span class="line"><span>               ↑</span></span>
<span class="line"><span>              │</span></span>
<span class="line"><span>       30k ─ │                              ╱── 大促峰值</span></span>
<span class="line"><span>              │                          ╱ ╱   (4x 日均)</span></span>
<span class="line"><span>              │                       ╱ ╱</span></span>
<span class="line"><span>              │                    ╱ ╱</span></span>
<span class="line"><span>       20k ─ │                  ╱ ╱</span></span>
<span class="line"><span>              │              ╱ ╱         ←── 营销活动</span></span>
<span class="line"><span>              │           ╱ ╱  ╲ ╱       (2x 日均,持续 3 天)</span></span>
<span class="line"><span>              │        ╱ ╱     V         </span></span>
<span class="line"><span>       10k ─ │     ╱ ╱  ←── 日常增长曲线</span></span>
<span class="line"><span>              │  ╱ ╱      (月增 10%)</span></span>
<span class="line"><span>              │╱</span></span>
<span class="line"><span>              └────────────────────────────────────→ 月</span></span>
<span class="line"><span>                Jan  Mar  May  Jul  Sep  Nov  </span></span>
<span class="line"><span>                                     ↑</span></span>
<span class="line"><span>                                  现在 (May 2026)</span></span>
<span class="line"><span>                                  </span></span>
<span class="line"><span>              ←─── 历史 ───→ ←─── 预测 ───→</span></span>
<span class="line"><span></span></span>
<span class="line"><span>需要规划:</span></span>
<span class="line"><span>  6 个月后(Nov)日均:18k    → 容量水位 60% 时实例数:18k×1.3/(1000×0.67) = 35 实例</span></span>
<span class="line"><span>  双 11 峰值:60k             → 短时扛 80k 需扩到 ~150 实例</span></span></code></pre></div><h3 id="_5-3-业务增长率怎么拿" tabindex="-1">5.3 业务增长率怎么拿 <a class="header-anchor" href="#_5-3-业务增长率怎么拿" aria-label="Permalink to &quot;5.3 业务增长率怎么拿&quot;">​</a></h3><p><strong>最差的方式</strong>:PM 拍脑袋&quot;我觉得明年涨 50%&quot;——<strong>这个数字不可信</strong>。</p><p><strong>正确的方式</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 看 PM 的核心 KPI(MAU / GMV / 订单数)目标</span></span>
<span class="line"><span>2. 看历史业务增长 → 技术流量增长 的转换比</span></span>
<span class="line"><span>   例:MAU +20%  →  下单 QPS +25% (用户上来更活跃)</span></span>
<span class="line"><span>3. 算未来 6 个月技术流量预估</span></span>
<span class="line"><span>4. 加上&quot;新功能上线&quot;带来的流量(PM 不会主动告诉你)</span></span></code></pre></div><p><strong>特别提醒</strong>:<strong>别忘了新功能的&quot;长尾流量&quot;</strong>——某个新页面上线后,可能引入新的 API 调用,<strong>单次请求会触发 3-5 次后端调用</strong>(详情页拉评价 / 推荐 / 库存 / 物流估算...)。<strong>业务流量翻 1 倍,技术流量可能翻 2-3 倍</strong>。</p><hr><h2 id="六、弹性容量-hpa-vpa-cluster-autoscaler" tabindex="-1">六、弹性容量:HPA / VPA / Cluster Autoscaler <a class="header-anchor" href="#六、弹性容量-hpa-vpa-cluster-autoscaler" aria-label="Permalink to &quot;六、弹性容量:HPA / VPA / Cluster Autoscaler&quot;">​</a></h2><h3 id="_6-1-三种弹性" tabindex="-1">6.1 三种弹性 <a class="header-anchor" href="#_6-1-三种弹性" aria-label="Permalink to &quot;6.1 三种弹性&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌──────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  K8s 弹性 3 件套                                     │</span></span>
<span class="line"><span>├──────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>│  HPA (Horizontal Pod Autoscaler)                     │</span></span>
<span class="line"><span>│    水平扩容:加 Pod 数                                │</span></span>
<span class="line"><span>│    适合:无状态服务,流量驱动                          │</span></span>
<span class="line"><span>│                                                      │</span></span>
<span class="line"><span>│  VPA (Vertical Pod Autoscaler)                       │</span></span>
<span class="line"><span>│    垂直扩容:加 Pod 资源(CPU/Mem)                  │</span></span>
<span class="line"><span>│    适合:有状态服务,资源不足但实例少                  │</span></span>
<span class="line"><span>│    注意:多数情况下 VPA 会重启 Pod,慎用             │</span></span>
<span class="line"><span>│                                                      │</span></span>
<span class="line"><span>│  Cluster Autoscaler                                  │</span></span>
<span class="line"><span>│    节点扩容:Pod 调度不上时加 Node                    │</span></span>
<span class="line"><span>│    适合:节点池满了的兜底                              │</span></span>
<span class="line"><span>│    延迟:新 Node 启动 3-5min(致命短板)              │</span></span>
<span class="line"><span>└──────────────────────────────────────────────────────┘</span></span></code></pre></div><h3 id="_6-2-hpa-的踩坑实战" tabindex="-1">6.2 HPA 的踩坑实战 <a class="header-anchor" href="#_6-2-hpa-的踩坑实战" aria-label="Permalink to &quot;6.2 HPA 的踩坑实战&quot;">​</a></h3><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 反例:常见配错的 HPA</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">apiVersion</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">autoscaling/v2</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">kind</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">HorizontalPodAutoscaler</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">metadata</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">order-service</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">spec</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  scaleTargetRef</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    apiVersion</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">apps/v1</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    kind</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">Deployment</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">order-service</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  minReplicas</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">3</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  maxReplicas</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">100</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  metrics</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">type</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">Resource</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      resource</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">cpu</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        target</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          type</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">Utilization</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          averageUtilization</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">70</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">   # 看 CPU,经典坑</span></span></code></pre></div><p><strong>为什么&quot;看 CPU&quot;是坑</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>场景 1:CPU 70% 但 P99 已经飙到 2s</span></span>
<span class="line"><span>   → 业务慢了但 HPA 不扩,因为 CPU 没&quot;红&quot;</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>场景 2:大量 I/O 等待,CPU 30% 但请求堆积</span></span>
<span class="line"><span>   → 用户在排队,HPA 看不见</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>场景 3:GC 期间 CPU 暴涨到 95%</span></span>
<span class="line"><span>   → HPA 触发扩容,新 Pod 上来后老 Pod GC 结束,过量扩容</span></span></code></pre></div><p><strong>正确做法</strong>:用&quot;业务指标&quot;而不是 CPU:</p><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">metrics</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">type</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">Pods</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    pods</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      metric</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">http_requests_per_second</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">   # 业务 QPS</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      target</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        type</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">AverageValue</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        averageValue</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;1000&quot;</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">           # 每个 Pod 1000 QPS 触发扩容</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">type</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">Resource</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    resource</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">cpu</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      target</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        type</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">Utilization</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        averageUtilization</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">80</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">         # CPU 作为兜底,80% 也扩</span></span></code></pre></div><p><strong>两个指标 OR 关系</strong>——任何一个超阈值都扩,<strong>双保险</strong>。</p><h3 id="_6-3-hpa-扩缩容速度调优" tabindex="-1">6.3 HPA 扩缩容速度调优 <a class="header-anchor" href="#_6-3-hpa-扩缩容速度调优" aria-label="Permalink to &quot;6.3 HPA 扩缩容速度调优&quot;">​</a></h3><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">behavior</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  scaleUp</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    stabilizationWindowSeconds</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">0</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # 立即扩(默认 0)</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    policies</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">type</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">Percent</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        value</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">100</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                    # 每次最多翻倍</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        periodSeconds</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">60</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">type</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">Pods</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        value</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">10</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                     # 或一次加 10 个</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        periodSeconds</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">60</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    selectPolicy</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">Max</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                 # 取大者(快速扩)</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  scaleDown</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    stabilizationWindowSeconds</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">300</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">   # 5min 才缩(慢)</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    policies</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">type</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">Percent</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        value</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">10</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                     # 每次最多缩 10%</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        periodSeconds</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">60</span></span></code></pre></div><p><strong>取舍</strong>:<strong>扩快、缩慢</strong>——</p><ul><li>扩快:避免雪崩,<strong>保守一点也比挨打强</strong></li><li>缩慢:避免抖动 → 反复扩缩,Pod 调度成本高 + 缓存反复 invalidate</li></ul><h3 id="_6-4-cluster-autoscaler-的致命延迟" tabindex="-1">6.4 Cluster Autoscaler 的致命延迟 <a class="header-anchor" href="#_6-4-cluster-autoscaler-的致命延迟" aria-label="Permalink to &quot;6.4 Cluster Autoscaler 的致命延迟&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>节点扩容时间线:</span></span>
<span class="line"><span>  T+0s:    Pod Pending,触发 CA</span></span>
<span class="line"><span>  T+30s:   CA 计算需要的节点类型</span></span>
<span class="line"><span>  T+60s:   云厂商 API 创建 EC2 / 阿里云 ECS</span></span>
<span class="line"><span>  T+120s:  节点开机,操作系统启动</span></span>
<span class="line"><span>  T+180s:  kubelet 注册,加入集群</span></span>
<span class="line"><span>  T+200s:  containerd 拉镜像(可能 1GB+)</span></span>
<span class="line"><span>  T+260s:  Pod 调度上,启动应用</span></span>
<span class="line"><span>  T+290s:  应用预热(JIT / cache warm)</span></span>
<span class="line"><span>  T+300s:  ready,开始接流量</span></span>
<span class="line"><span>                                    </span></span>
<span class="line"><span>  → 总耗时 5 分钟 → 突发流量根本扛不住</span></span></code></pre></div><p><strong>对策</strong>:<strong>别指望 CA 扛突发,要么 Pre-scale,要么&quot;过量储备&quot;</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>策略 A:Pre-scale(主动预扩)</span></span>
<span class="line"><span>  大促前 1 小时 / 营销活动开始前  → 手动 scale 到目标值</span></span>
<span class="line"><span>  比 HPA 安全 100 倍</span></span>
<span class="line"><span></span></span>
<span class="line"><span>策略 B:Over-provisioning(预留 Pod)</span></span>
<span class="line"><span>  跑 N 个&quot;占位 Pod&quot;(低优先级 + sleep)</span></span>
<span class="line"><span>  突发来了:抢占占位 Pod 的资源,新 Pod 立刻调度</span></span>
<span class="line"><span>  代价:常驻一些&quot;空&quot;节点</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>策略 C:Karpenter(更快的节点扩容)</span></span>
<span class="line"><span>  AWS 出的开源工具,比 CA 快 50%</span></span>
<span class="line"><span>  仍要 90-120s,扛不住 30 秒级突发</span></span></code></pre></div><hr><h2 id="七、pre-scale-大促容量规划的核心" tabindex="-1">七、Pre-scale:大促容量规划的核心 <a class="header-anchor" href="#七、pre-scale-大促容量规划的核心" aria-label="Permalink to &quot;七、Pre-scale:大促容量规划的核心&quot;">​</a></h2><h3 id="_7-1-pre-scale-流程" tabindex="-1">7.1 Pre-scale 流程 <a class="header-anchor" href="#_7-1-pre-scale-流程" aria-label="Permalink to &quot;7.1 Pre-scale 流程&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌──────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  大促容量规划标准流程(D = 大促日)                       │</span></span>
<span class="line"><span>├──────────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>│                                                          │</span></span>
<span class="line"><span>│  D-30:容量评审                                          │</span></span>
<span class="line"><span>│    - PM 给最终流量预估                                    │</span></span>
<span class="line"><span>│    - SRE 算目标实例数                                     │</span></span>
<span class="line"><span>│    - 走预算审批                                           │</span></span>
<span class="line"><span>│                                                          │</span></span>
<span class="line"><span>│  D-14:全链路压测                                        │</span></span>
<span class="line"><span>│    - 模拟大促流量,跑 80%                                 │</span></span>
<span class="line"><span>│    - 找出新瓶颈                                           │</span></span>
<span class="line"><span>│                                                          │</span></span>
<span class="line"><span>│  D-7:配置冻结                                           │</span></span>
<span class="line"><span>│    - 不再改代码,只做容量调整                             │</span></span>
<span class="line"><span>│    - Feature Flag 默认关                                  │</span></span>
<span class="line"><span>│                                                          │</span></span>
<span class="line"><span>│  D-1 18:00:Pre-scale 开始                              │</span></span>
<span class="line"><span>│    - 手动 scale 到目标值的 80%                           │</span></span>
<span class="line"><span>│    - 监控冷启动 + 预热完成                                │</span></span>
<span class="line"><span>│                                                          │</span></span>
<span class="line"><span>│  D-1 23:00:终态扩容                                    │</span></span>
<span class="line"><span>│    - scale 到 100% 目标                                  │</span></span>
<span class="line"><span>│    - 等所有 Pod ready                                     │</span></span>
<span class="line"><span>│                                                          │</span></span>
<span class="line"><span>│  D Day:开抢前 30min                                     │</span></span>
<span class="line"><span>│    - 最后健康检查                                         │</span></span>
<span class="line"><span>│    - 战时频道开起来                                       │</span></span>
<span class="line"><span>│    - On-call 全部到位                                     │</span></span>
<span class="line"><span>│                                                          │</span></span>
<span class="line"><span>│  D Day +24h:逐步缩容                                    │</span></span>
<span class="line"><span>│    - 流量回落后慢慢缩,留余量观察 12 小时                 │</span></span>
<span class="line"><span>│                                                          │</span></span>
<span class="line"><span>└──────────────────────────────────────────────────────────┘</span></span></code></pre></div><h3 id="_7-2-pre-scale-的取舍" tabindex="-1">7.2 Pre-scale 的取舍 <a class="header-anchor" href="#_7-2-pre-scale-的取舍" aria-label="Permalink to &quot;7.2 Pre-scale 的取舍&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>为什么不用 HPA 自动应对大促?</span></span>
<span class="line"><span>  ✗ HPA 看到流量来了才扩,延迟 1-3 分钟</span></span>
<span class="line"><span>  ✗ Cluster Autoscaler 5 分钟节点冷启动</span></span>
<span class="line"><span>  ✗ 应用预热(JVM JIT / cache warm) 2-3 分钟</span></span>
<span class="line"><span>  → 加起来 10 分钟才到能扛流量</span></span>
<span class="line"><span>  → 大促秒杀场景:10 分钟 = 完蛋</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Pre-scale 提前 6 小时扩好:</span></span>
<span class="line"><span>  ✓ 流量来之前 Pod 已 ready</span></span>
<span class="line"><span>  ✓ JIT 已热,缓存已预热(可以发&quot;预热脚本&quot;主动跑)</span></span>
<span class="line"><span>  ✓ 失败成本:多花 6 小时的机器钱(几千 RMB)</span></span>
<span class="line"><span>  ✓ 收益:大促 GMV 损失减少几百万</span></span>
<span class="line"><span></span></span>
<span class="line"><span>成本对比:</span></span>
<span class="line"><span>  Pre-scale 多花的钱 vs 雪崩损失的 GMV → 后者贵 100 倍</span></span></code></pre></div><p><strong>铁律</strong>:<strong>业务关键时刻,永远 Pre-scale,不指望弹性</strong>。</p><hr><h2 id="八、容量水位告警-三档机制" tabindex="-1">八、容量水位告警:三档机制 <a class="header-anchor" href="#八、容量水位告警-三档机制" aria-label="Permalink to &quot;八、容量水位告警:三档机制&quot;">​</a></h2><h3 id="_8-1-60-70-80-的设计" tabindex="-1">8.1 60 / 70 / 80 的设计 <a class="header-anchor" href="#_8-1-60-70-80-的设计" aria-label="Permalink to &quot;8.1 60 / 70 / 80 的设计&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  容量水位三档告警                                   │</span></span>
<span class="line"><span>├────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>│  60% — 注意                                        │</span></span>
<span class="line"><span>│   → 告知 SRE / 团队,本季度需要规划扩容             │</span></span>
<span class="line"><span>│   → 不打扰,但记录                                  │</span></span>
<span class="line"><span>│                                                    │</span></span>
<span class="line"><span>│  70% — 警告                                        │</span></span>
<span class="line"><span>│   → P2 告警,工作时间处理                          │</span></span>
<span class="line"><span>│   → 1 周内提扩容方案                                │</span></span>
<span class="line"><span>│                                                    │</span></span>
<span class="line"><span>│  80% — 立即扩容                                    │</span></span>
<span class="line"><span>│   → P1 告警,立即触发 HPA / Pre-scale              │</span></span>
<span class="line"><span>│   → 同时通知 On-call                                │</span></span>
<span class="line"><span>│                                                    │</span></span>
<span class="line"><span>│  90% — 紧急                                        │</span></span>
<span class="line"><span>│   → P0 告警,准备降级 + 紧急扩容                   │</span></span>
<span class="line"><span>│   → 客户已经在抖动                                  │</span></span>
<span class="line"><span>└────────────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>告警规则示例</strong>:</p><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">groups</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">capacity</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    rules</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">alert</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">CapacityWatermark60</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        expr</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">|</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          sum(rate(http_requests_total{service=&quot;order&quot;}[5m]))</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          / (count(up{service=&quot;order&quot;}==1) * 1000 * 0.67 / 1.3)</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          &gt; 0.60</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        for</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">30m</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        labels</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          severity</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">info</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        annotations</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          summary</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;Order service 容量水位 &gt; 60%,计划扩容&quot;</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          runbook_url</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;https://runbooks/RB-CAP-60&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      </span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">alert</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">CapacityWatermark80</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        expr</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">|</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          sum(rate(http_requests_total{service=&quot;order&quot;}[5m]))</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          / (count(up{service=&quot;order&quot;}==1) * 1000 * 0.67 / 1.3)</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          &gt; 0.80</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        for</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">5m</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        labels</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          severity</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">P1</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        annotations</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          summary</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;Order service 容量水位 &gt; 80%,立即扩容!&quot;</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          runbook_url</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;https://runbooks/RB-CAP-80&quot;</span></span></code></pre></div><p><strong>关键</strong>:<strong>分母是&quot;总可用容量&quot;</strong>(用上面 §4.1 的公式算),不是简单 CPU。</p><h3 id="_8-2-错误预算和容量挂钩" tabindex="-1">8.2 错误预算和容量挂钩 <a class="header-anchor" href="#_8-2-错误预算和容量挂钩" aria-label="Permalink to &quot;8.2 错误预算和容量挂钩&quot;">​</a></h3><p>接第 17 篇错误预算的思路:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>容量不够 → SLI 失败 → 错误预算消耗</span></span>
<span class="line"><span></span></span>
<span class="line"><span>例:</span></span>
<span class="line"><span>  SLO = 99.9% 月可用(43min/月 错误预算)</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  容量 80% 水位时:P99 偶尔越过 SLI 阈值</span></span>
<span class="line"><span>  → 每小时消耗 0.5min 错误预算</span></span>
<span class="line"><span>  → 月底消耗 360min ≫ 43min 预算</span></span>
<span class="line"><span>  → 政策:必须扩容,不允许&quot;错误预算用完&quot;</span></span></code></pre></div><p><strong>这种联动让容量规划不再是&quot;成本中心&quot;,变成&quot;SLO 保障的工程动作&quot;</strong>——CFO 看到是花钱,CTO 看到是守 SLO,<strong>话语权不一样</strong>。</p><hr><h2 id="九、容量评审清单" tabindex="-1">九、容量评审清单 <a class="header-anchor" href="#九、容量评审清单" aria-label="Permalink to &quot;九、容量评审清单&quot;">​</a></h2><p>每个核心服务,<strong>每季度一次</strong>容量评审。会议产出一份清单:</p><div class="language-markdown vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">markdown</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;"># 容量评审 - Q2 2026 - order-service</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">## 1. 服务基础信息</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 服务名:order-service</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 关键度:P0(核心业务)</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 部署:3 AZ,30 实例</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 单实例资源:2vCPU / 4GB / 50GB</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">## 2. 现有上限</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 压测时间:2026-04-15</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 单实例 SLO 上限:1450 RPS</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 容量水位:70% → 1000 RPS/实例</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 总可用容量:(1000 × 30 × 0.67) / 1.3 = 15,461 RPS</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">## 3. 当前水位</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 日均峰值:9000 RPS (58% 水位)</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 双十一峰值预估:60000 RPS (388% 水位 → 必须扩容)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">## 4. 预期增长(未来 6 个月)</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 业务目标:GMV +30%</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 估算流量:日均 12000 RPS (78% 水位)</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 6 个月后 必须扩容</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">## 5. 弹性策略</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> HPA:最小 30,最大 80,扩容阈值 800 RPS/Pod</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 节点池:预留 20 个空闲节点</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> Pre-scale 计划:双十一前 24h 扩到 150 实例</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">## 6. 风险</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 数据库连接池在 1200 RPS/实例 时打满</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  → 行动项:Q2 调整 HikariCP max-size 50 → 100</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> Redis 集群单分片 90% CPU 在 5w QPS</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  → 行动项:Q3 升级到 Cluster 模式</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">## 7. 预算</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 当前月开销:¥120k</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 6 个月后预估:¥160k (+33%)</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 双十一额外:¥80k(临时)</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 总预算请求:已写入 FY26-Q4 财务计划</span></span></code></pre></div><p><strong>这份清单不是给你看的,是给 CTO / CFO 看的</strong>——他们要的是&quot;具体数字 + 风险清单 + 钱&quot;。</p><hr><h2 id="十、何时不该做容量规划" tabindex="-1">十、何时不该做容量规划 <a class="header-anchor" href="#十、何时不该做容量规划" aria-label="Permalink to &quot;十、何时不该做容量规划&quot;">​</a></h2><h3 id="_10-1-服务太小" tabindex="-1">10.1 服务太小 <a class="header-anchor" href="#_10-1-服务太小" aria-label="Permalink to &quot;10.1 服务太小&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>小服务无 SLA / 内部工具 / 用户 &lt; 100 / 日均 &lt; 1k 请求:</span></span>
<span class="line"><span>  ✗ 别做容量规划</span></span>
<span class="line"><span>  ✗ 别上 HPA</span></span>
<span class="line"><span>  ✓ 设个固定副本数(2-3 个),够用</span></span>
<span class="line"><span>  ✓ 出事手动 scale,5 分钟解决</span></span></code></pre></div><p><strong>容量规划的工程成本不低</strong>——压测搭建、模型建立、告警配置、季度 review……<strong>小服务做这套是浪费</strong>。</p><h3 id="_10-2-实验项目" tabindex="-1">10.2 实验项目 <a class="header-anchor" href="#_10-2-实验项目" aria-label="Permalink to &quot;10.2 实验项目&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>未上线 / 灰度阶段:</span></span>
<span class="line"><span>  ✗ 别做长期容量规划</span></span>
<span class="line"><span>  ✓ 设个保守的副本数 + HPA(防止失控)</span></span>
<span class="line"><span>  ✓ 等 GA 之后再做正规规划</span></span></code></pre></div><h3 id="_10-3-临时服务" tabindex="-1">10.3 临时服务 <a class="header-anchor" href="#_10-3-临时服务" aria-label="Permalink to &quot;10.3 临时服务&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>任务型 / 一次性 / Cron Job:</span></span>
<span class="line"><span>  ✗ 别按&quot;QPS&quot;思维做规划</span></span>
<span class="line"><span>  ✓ 按&quot;任务并发度&quot;和&quot;单任务资源&quot;做估算</span></span>
<span class="line"><span>  ✓ K8s Job + ResourceQuota 兜底</span></span></code></pre></div><hr><h2 id="十一、容量规划的反模式" tabindex="-1">十一、容量规划的反模式 <a class="header-anchor" href="#十一、容量规划的反模式" aria-label="Permalink to &quot;十一、容量规划的反模式&quot;">​</a></h2><ol><li><strong>凭感觉扩</strong> ——&quot;加 3 倍机器&quot;,没有单实例上限数据</li><li><strong>HPA 单飞</strong> —— 不做 Pre-scale,指望 HPA 救突发,突发就崩</li><li><strong>看 CPU 扩容</strong> —— 应该看业务 QPS / 延迟</li><li><strong>2 AZ 部署</strong> —— 挂一个剩 50%,<strong>几乎等于单点</strong></li><li><strong>不考虑冷启动</strong> —— Cluster Autoscaler 5 分钟延迟,扛不住秒级突发</li><li><strong>从来不缩容</strong> —— 大促完不缩,长期成本失控</li><li><strong>没有季度评审</strong> —— 半年没人看容量,大促前才发现不够</li><li><strong>容量数据散落</strong> —— 压测一份 doc、HPA 一个 yaml、扩容计划一个 wiki,没人对齐</li><li><strong>容量 = 成本</strong> —— 把容量规划当成纯财务问题,SRE 没话语权</li><li><strong>预测不带不确定性</strong> —— 算一个数当神算,实际峰值翻倍来就傻眼</li></ol><hr><h2 id="十二、本篇的硬指标" tabindex="-1">十二、本篇的硬指标 <a class="header-anchor" href="#十二、本篇的硬指标" aria-label="Permalink to &quot;十二、本篇的硬指标&quot;">​</a></h2><p>看完这一篇,你应该能:</p><ul><li><strong>画出自己负责的服务&quot;未来 6 个月容量曲线&quot;</strong>(历史 + 预测 + 大促)</li><li><strong>算出&quot;总可用容量&quot;</strong>(用 §4.1 公式)</li><li><strong>指出当前服务的瓶颈维度</strong>(RPS / 延迟 / 资源 / 错误)</li><li><strong>给出 HPA 配置的 3 个改进点</strong>(指标选择 / 扩缩速度 / 上限)</li><li><strong>画出大促 D-30 / D-14 / D-1 / D 的 Pre-scale 时间线</strong></li><li><strong>写出一份容量评审清单</strong>(§9 模板,改改就能用)</li></ul><p>并且能在 CTO 面前讲清楚:<strong>&quot;再花 ¥80k,我们大促能多扛 50% 流量&quot;</strong>——这就是容量规划工程化的最终价值。</p><hr><p>下一篇:<code>31-混沌工程.md</code>,容量规划解决&quot;理论上能扛&quot;,混沌工程验证&quot;实际真的能扛&quot;——压测告诉你单点上限,混沌告诉你&quot;挂掉一个 AZ 整体怎么样&quot;、&quot;网络抖动 200ms 还能用吗&quot;、&quot;Redis 哨兵切换需要 30 秒,你的业务能扛吗&quot;。下一篇讲 ChaosMesh / LitmusChaos 的工具选型、稳态假设怎么写、GameDay 怎么组织,以及最重要的——<strong>混沌工程的护栏怎么设</strong>(别在 prod 没护栏跑混沌,会把自己玩崩)。<strong>没护栏的混沌 = 武装暴动,不是工程</strong>。</p>`,118)])])}const g=a(l,[["render",t]]);export{d as __pageData,g as default};
