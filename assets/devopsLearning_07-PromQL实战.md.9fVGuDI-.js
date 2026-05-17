import{c as a,Q as n,j as e,m as p}from"./chunks/framework.CBiVa4O3.js";const u=JSON.parse('{"title":"PromQL 实战:rate / histogram_quantile / 常见踩坑 / 别再用 increase 算 QPS","description":"","frontmatter":{},"headers":[],"relativePath":"../devopsLearning/07-PromQL实战.md","filePath":"../devopsLearning/07-PromQL实战.md","lastUpdated":1778496697000}'),t={name:"../devopsLearning/07-PromQL实战.md"};function i(l,s,o,r,c,d){return n(),e("div",null,[...s[0]||(s[0]=[p(`<h1 id="promql-实战-rate-histogram-quantile-常见踩坑-别再用-increase-算-qps" tabindex="-1">PromQL 实战:rate / histogram_quantile / 常见踩坑 / 别再用 increase 算 QPS <a class="header-anchor" href="#promql-实战-rate-histogram-quantile-常见踩坑-别再用-increase-算-qps" aria-label="Permalink to &quot;PromQL 实战:rate / histogram_quantile / 常见踩坑 / 别再用 increase 算 QPS&quot;">​</a></h1><p>第二层「可观测性三件套」的 Metrics 部分,前两篇讲了&quot;<strong>打什么 metric</strong>&quot;和&quot;<strong>怎么抓 metric</strong>&quot;,<strong>这一篇讲&quot;怎么用 metric&quot;</strong>——也就是 PromQL。<strong>这一层我打算讲到底,因为 PromQL 是 Prometheus 整个生态里,中型团队工程师最容易写错、写错了还看不出来错的东西</strong>。Dashboard 上挂的一条 P99 曲线长得平平稳稳——你以为业务稳如老狗——<strong>实际上是 PromQL 写错了,真实的 P99 早就破了 SLO</strong>。告警写&quot;5xx 率 &gt; 1% 触发&quot;——<strong>你以为这条告警准时响</strong>——实际上是 PromQL 把不同时区不同实例的请求乱聚合,真出事时被稀释成 0.3%,<strong>告警永远不响</strong>。<strong>这种&quot;看起来在监控,实际全错&quot;的状态比&quot;完全没监控&quot;还危险</strong>——前者让你产生&quot;我们有监控&quot;的错觉,后者至少你知道自己没有。</p><p>backendLearning/33 浅讲过 PromQL 的 <code>rate / sum / by</code> 基本语法,<strong>这一篇假设你已经能写 <code>sum by (service) (rate(http_requests_total[5m]))</code></strong>。这一篇只讲 PromQL 的工程视角:<strong>rate vs irate vs increase 三个函数的差别和坑(尤其是为什么 increase 不能算 QPS)、rate 时间窗口的最小约束(必须 ≥ 4 × scrape_interval)、histogram_quantile 正确写法和错误写法只差一行 <code>by (le)</code>、offset / @ modifier / subquery 这些高级特性什么时候真有用、counter reset 和 stale marker 怎么让你的告警在最关键时刻失准、5 条生产里每天在用的 PromQL 模板</strong>。看完你应该能在 Grafana 上<strong>一眼看出&quot;这个查询写错了&quot;</strong>,而不是只会跟着同事的截图照抄。</p><blockquote><p>一句话先记住:<strong>PromQL 是声明式的,但它不是&quot;你写出来就一定对&quot;——它会&quot;算出一个数&quot;给你,但那个数可能跟你想问的问题完全无关</strong>。Counter reset、stale marker、scrape interval 抖动、bucket 边界、聚合顺序——这五个隐藏变量决定了同一行 PromQL 在不同上下文返回的结果差别可以是几倍到几十倍。<strong>这一篇不讲 PromQL 完整语法,只讲&quot;工程师每天写 PromQL 时最容易踩、踩了还看不见的坑&quot;</strong>。</p></blockquote><hr><h2 id="一、问题场景-一条错的-promql-比没监控还坑" tabindex="-1">一、问题场景:一条错的 PromQL 比没监控还坑 <a class="header-anchor" href="#一、问题场景-一条错的-promql-比没监控还坑" aria-label="Permalink to &quot;一、问题场景:一条错的 PromQL 比没监控还坑&quot;">​</a></h2><p>直接讲一个真实事故,在某中型 SaaS 团队。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>P0 事故:某产品页加载延迟从 100ms 飙到 3 秒,持续 25 分钟才被工程师发现</span></span>
<span class="line"><span>       (是从客服投诉里发现的,不是从告警)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>事后复盘:</span></span>
<span class="line"><span>  - 团队 dashboard 上有&quot;产品页 P99&quot;这条曲线</span></span>
<span class="line"><span>  - 事故期间这条曲线显示 350ms,完全没异常</span></span>
<span class="line"><span>  - 告警阈值是 P99 &gt; 500ms,所以没触发</span></span>
<span class="line"><span>  - 但实际 P99 是 3000ms </span></span>
<span class="line"><span></span></span>
<span class="line"><span>PromQL 拆开看:</span></span>
<span class="line"><span>  团队写的(错的):</span></span>
<span class="line"><span>    avg(histogram_quantile(0.99, rate(product_page_duration_seconds_bucket[5m])))</span></span>
<span class="line"><span>                                     ↑                                          ↑</span></span>
<span class="line"><span>                                     这两个括号位置错了,导致先按 instance 算各自 P99</span></span>
<span class="line"><span>                                     然后 avg 把 100 个 instance 的 P99 平均掉了</span></span>
<span class="line"><span>    </span></span>
<span class="line"><span>  应该写的(对的):</span></span>
<span class="line"><span>    histogram_quantile(0.99, </span></span>
<span class="line"><span>      sum by (le) (rate(product_page_duration_seconds_bucket[5m]))</span></span>
<span class="line"><span>    )</span></span>
<span class="line"><span>    ↑ 先把所有 instance 的 bucket 加起来,再算分位数</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  结果差别:</span></span>
<span class="line"><span>    错的:  ~350ms(100 个 instance 各自 P99 的平均,被稀释)</span></span>
<span class="line"><span>    对的:  ~3000ms(全局 P99,反映真实用户体验)</span></span>
<span class="line"><span>    差了 8 倍</span></span></code></pre></div><p><strong>这场事故的根因不是工具,不是 cardinality,不是告警阈值——是 PromQL 写错了一行</strong>。<strong>而且团队没有任何机制能发现这一行写错了</strong>——dashboard 显示数字,数字看起来&quot;合理&quot;,所有人都默认它对的。</p><p>中型团队撞上 PromQL 错误的临界点很明显:</p><table tabindex="0"><thead><tr><th>团队规模</th><th>PromQL 表现</th></tr></thead><tbody><tr><td>&lt; 5 人</td><td>一个老员工写所有 PromQL,他写对了就对</td></tr><tr><td><strong>5-15 人 / 100 微服务</strong></td><td><strong>PromQL 各团队自己写,错率最高的阶段</strong></td></tr><tr><td>15-30 人</td><td>必须有 PromQL Code Review + Recording Rule 模板</td></tr><tr><td>&gt; 30 人</td><td>必须有 PromQL Linter + Dashboard 治理流程</td></tr></tbody></table><p><strong>这一篇主要服务 5-15 人这一档</strong>——刚开始让每个团队自己写 PromQL,但还没建好治理。</p><hr><h2 id="二、rate-irate-increase-三个看似一样的函数-大不相同" tabindex="-1">二、rate / irate / increase:三个看似一样的函数,大不相同 <a class="header-anchor" href="#二、rate-irate-increase-三个看似一样的函数-大不相同" aria-label="Permalink to &quot;二、rate / irate / increase:三个看似一样的函数,大不相同&quot;">​</a></h2><p><strong>这是 PromQL 里最容易混淆的一组函数</strong>。三者都作用于 Counter,<strong>都&quot;看起来&quot;在算&quot;涨了多少&quot;</strong>,但语义和适用场景完全不同。</p><h3 id="_2-1-三者的语义" tabindex="-1">2.1 三者的语义 <a class="header-anchor" href="#_2-1-三者的语义" aria-label="Permalink to &quot;2.1 三者的语义&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>假设一个 Counter 的样本(scrape_interval = 15s):</span></span>
<span class="line"><span>  t=0s    counter = 100</span></span>
<span class="line"><span>  t=15s   counter = 120</span></span>
<span class="line"><span>  t=30s   counter = 145</span></span>
<span class="line"><span>  t=45s   counter = 170</span></span>
<span class="line"><span>  t=60s   counter = 200</span></span>
<span class="line"><span></span></span>
<span class="line"><span>rate(counter[1m])     在 t=60 时:</span></span>
<span class="line"><span>  含义:过去 1 分钟内的&quot;平均&quot;增长速率(每秒)</span></span>
<span class="line"><span>  算法:(末值 - 首值) / 时间窗口</span></span>
<span class="line"><span>       (200 - 100) / 60s = 1.67 /s</span></span>
<span class="line"><span>       但 Prom 会做&quot;外推&quot;(extrapolation)调整边界</span></span>
<span class="line"><span>  返回:接近 1.67(单位:per second)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>irate(counter[1m])    在 t=60 时:</span></span>
<span class="line"><span>  含义:最近两个样本的&quot;瞬时&quot;增长速率</span></span>
<span class="line"><span>  算法:(最后一个 - 倒数第二个) / 间隔</span></span>
<span class="line"><span>       (200 - 170) / 15s = 2 /s</span></span>
<span class="line"><span>  返回:2(单位:per second)</span></span>
<span class="line"><span>  注意:窗口里只用最后两个点,前面 4 个点完全没用</span></span>
<span class="line"><span></span></span>
<span class="line"><span>increase(counter[1m]) 在 t=60 时:</span></span>
<span class="line"><span>  含义:过去 1 分钟&quot;总共&quot;涨了多少(不是每秒)</span></span>
<span class="line"><span>  算法:跟 rate 一样的 (末值-首值),但乘以窗口长度</span></span>
<span class="line"><span>       基本等价于 rate(...[1m]) * 60</span></span>
<span class="line"><span>  返回:接近 100(单位:绝对值,不是 per second)</span></span></code></pre></div><p><strong>这三个函数的输出单位不同</strong>:rate / irate 是&quot;per second&quot;(速率),increase 是&quot;绝对值&quot;(总量)。这是它们最大的语义差异。</p><h3 id="_2-2-rate-99-的场景用它" tabindex="-1">2.2 rate:99% 的场景用它 <a class="header-anchor" href="#_2-2-rate-99-的场景用它" aria-label="Permalink to &quot;2.2 rate:99% 的场景用它&quot;">​</a></h3><p><strong>rate 是 PromQL 算 Counter 速率的默认答案</strong>——除非你有明确理由用 irate 或 increase,<strong>永远先选 rate</strong>。</p><div class="language-promql vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">promql</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># 每秒请求数(QPS)</span></span>
<span class="line"><span>sum(rate(http_requests_total[5m]))</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 按服务拆 QPS</span></span>
<span class="line"><span>sum by (service) (rate(http_requests_total[5m]))</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 错误率</span></span>
<span class="line"><span>sum(rate(http_requests_total{status=&quot;5xx&quot;}[5m]))</span></span>
<span class="line"><span>  / sum(rate(http_requests_total[5m]))</span></span></code></pre></div><p><strong>rate 的工程优势</strong>:</p><ol><li><strong>平滑 / 抗抖动</strong>——窗口内所有样本都用,scrape 偶尔失败一次不影响结果</li><li><strong>自动处理 counter reset</strong>——Counter 重启从 0 开始,rate 看到下跌会自动补偿(假定刚好涨到上一个值就重启)</li><li><strong>外推(extrapolation)</strong>——窗口边界的样本通常不在精确时间点上,rate 会按比例外推</li></ol><h3 id="_2-3-irate-只看最后两个点-适合-瞬时尖峰" tabindex="-1">2.3 irate:只看最后两个点,适合&quot;瞬时尖峰&quot; <a class="header-anchor" href="#_2-3-irate-只看最后两个点-适合-瞬时尖峰" aria-label="Permalink to &quot;2.3 irate:只看最后两个点,适合&quot;瞬时尖峰&quot;&quot;">​</a></h3><div class="language-promql vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">promql</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># 实时 CPU 使用率(亚分钟尖峰可见)</span></span>
<span class="line"><span>irate(node_cpu_seconds_total{mode=&quot;user&quot;}[1m])</span></span></code></pre></div><p><strong>irate 的特征</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>窗口[1m]内有 4 个样本:[100, 120, 145, 170, 200]</span></span>
<span class="line"><span>rate:    用全部 5 个点 → 平均速率 1.67/s</span></span>
<span class="line"><span>irate:   只用最后两个 → 瞬时速率 2.0/s</span></span>
<span class="line"><span></span></span>
<span class="line"><span>如果中间有突变:</span></span>
<span class="line"><span>  样本:  [100, 120, 145, 170, 500]   ← 最后一秒突然 +330</span></span>
<span class="line"><span>  rate:  (500-100)/60 = 6.67/s</span></span>
<span class="line"><span>  irate: (500-170)/15 = 22/s         ← 尖峰被精准捕捉</span></span></code></pre></div><p><strong>irate 适合什么</strong>:<strong>短时间内可能有尖峰、你需要&quot;最新一刻&quot;的速率,不在乎平均</strong>。典型用法是<strong>实时 dashboard</strong>(看当前一瞬间在涨多快)。</p><p><strong>irate 不适合什么</strong>:<strong>告警</strong>。告警评估每 15s 一次,<strong>irate 在窗口边缘抖动剧烈</strong>,容易触发误报或漏报。<strong>告警永远用 rate</strong>。</p><h3 id="_2-4-increase-只算-总量-不是-qps" tabindex="-1">2.4 increase:只算&quot;总量&quot;,不是 QPS <a class="header-anchor" href="#_2-4-increase-只算-总量-不是-qps" aria-label="Permalink to &quot;2.4 increase:只算&quot;总量&quot;,不是 QPS&quot;">​</a></h3><p><strong>这一节是这一章的重点</strong>——大量团队<strong>用 increase 算 QPS,而且不知道自己写错了</strong>。</p><div class="language-promql vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">promql</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># 错的(看起来对,实际错):</span></span>
<span class="line"><span>increase(http_requests_total[5m])</span></span>
<span class="line"><span># 工程师以为:&quot;过去 5 分钟的 QPS&quot;</span></span>
<span class="line"><span># 实际上:    &quot;过去 5 分钟总共多少个请求&quot;</span></span>
<span class="line"><span># 单位:     绝对值,不是 per second</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 错误后果:</span></span>
<span class="line"><span># 看到 dashboard 上的数字是 30000</span></span>
<span class="line"><span># 你以为 QPS 是 30000(很高?)</span></span>
<span class="line"><span># 其实是&quot;5 分钟内 30000 个请求&quot; → QPS = 30000/300 = 100</span></span></code></pre></div><p><strong>那 increase 在什么时候用</strong>?<strong>只有当你想知道&quot;某个时间窗口内总共多少&quot;这个绝对值时</strong>。</p><div class="language-promql vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">promql</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># 对的用法:</span></span>
<span class="line"><span># 过去 1 小时一共发生多少次错误</span></span>
<span class="line"><span>increase(http_errors_total[1h])</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 一天的请求总量(报表用)</span></span>
<span class="line"><span>increase(http_requests_total[24h])</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 跟&quot;速率&quot;无关,跟&quot;累计&quot;有关</span></span></code></pre></div><p><strong>判别口诀</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>你的问题是&quot;每秒&quot;几个?  → rate</span></span>
<span class="line"><span>你的问题是&quot;总共&quot;几个?  → increase</span></span>
<span class="line"><span>你的问题是&quot;现在&quot;几个?  → irate</span></span></code></pre></div><p><strong>最严重的踩坑</strong>:Grafana 默认 panel 的 unit 设错——比如 panel 设了 &quot;requests/sec&quot; 但 PromQL 是 <code>increase()</code>,<strong>数字是绝对值但单位标 per second,直接误导一年</strong>。</p><h3 id="_2-5-时间窗口选多大" tabindex="-1">2.5 时间窗口选多大 <a class="header-anchor" href="#_2-5-时间窗口选多大" aria-label="Permalink to &quot;2.5 时间窗口选多大&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>窗口[X]的最小约束:</span></span>
<span class="line"><span>   X ≥ 4 × scrape_interval</span></span>
<span class="line"><span></span></span>
<span class="line"><span>为什么必须 ≥ 4 倍:</span></span>
<span class="line"><span>   rate 至少需要 2 个数据点才能算</span></span>
<span class="line"><span>   但抖动 / scrape 失败 / counter reset 会让点变少</span></span>
<span class="line"><span>   留至少 4 倍 buffer,才稳定</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   scrape_interval = 15s</span></span>
<span class="line"><span>      ✓ rate(...[1m])     窗口 60s,够 4 个点  ← 标准选择</span></span>
<span class="line"><span>      ✓ rate(...[5m])     窗口 300s,够 20 个点 ← 平滑</span></span>
<span class="line"><span>      ✗ rate(...[30s])    只够 2 个点,极易出现 NaN</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   scrape_interval = 30s</span></span>
<span class="line"><span>      ✓ rate(...[2m])     8 个点</span></span>
<span class="line"><span>      ✓ rate(...[5m])     10 个点</span></span>
<span class="line"><span>      ✗ rate(...[1m])     2 个点,不稳</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   scrape_interval = 60s</span></span>
<span class="line"><span>      ✓ rate(...[4m])     4 个点(刚好达标)</span></span>
<span class="line"><span>      ✓ rate(...[10m])    10 个点(更稳)</span></span></code></pre></div><p><strong>经验</strong>:</p><ul><li><strong>告警用 <code>[5m]</code> 或 <code>[10m]</code></strong>——足够稳,误报少</li><li><strong>实时 dashboard 用 <code>[1m]</code> 或 <code>[2m]</code></strong>——足够细,看变化快</li><li><strong>业务指标(QPS / 错误率)用 <code>[5m]</code></strong>——平衡稳定性和实时性</li></ul><p><strong>绝对不要用 <code>[15s]</code> <code>[30s]</code></strong>——这是新人最常犯的错,以为&quot;窗口越小越实时&quot;,<strong>结果是 PromQL 返回 NaN 一半时间</strong>。</p><h3 id="_2-6-一张选型决策表" tabindex="-1">2.6 一张选型决策表 <a class="header-anchor" href="#_2-6-一张选型决策表" aria-label="Permalink to &quot;2.6 一张选型决策表&quot;">​</a></h3><table tabindex="0"><thead><tr><th>你要算什么</th><th>用什么</th><th>例子</th></tr></thead><tbody><tr><td>QPS / 每秒错误数 / 速率</td><td><code>rate</code></td><td><code>sum(rate(http_requests_total[5m]))</code></td></tr><tr><td>总数 / 累计量 / 报表</td><td><code>increase</code></td><td><code>increase(http_requests_total[24h])</code></td></tr><tr><td>实时尖峰 / 瞬时变化</td><td><code>irate</code></td><td><code>irate(node_cpu_seconds_total[1m])</code>(只用在 dashboard)</td></tr><tr><td>Gauge(不是 Counter)</td><td>直接查</td><td><code>node_memory_MemAvailable_bytes</code></td></tr><tr><td>Gauge 的变化率</td><td><code>deriv</code></td><td><code>deriv(queue_length[5m])</code></td></tr><tr><td>Gauge 在某窗口平均</td><td><code>avg_over_time</code></td><td><code>avg_over_time(cpu_usage[10m])</code></td></tr></tbody></table><hr><h2 id="三、histogram-quantile-最容易写错的一个函数" tabindex="-1">三、histogram_quantile:最容易写错的一个函数 <a class="header-anchor" href="#三、histogram-quantile-最容易写错的一个函数" aria-label="Permalink to &quot;三、histogram_quantile:最容易写错的一个函数&quot;">​</a></h2><p><strong>这是 PromQL 第二个高发错误区</strong>。<strong>写错的方式只有一种,写对的方式也只有一种,但 80% 的工程师写的是错的那一种</strong>。</p><h3 id="_3-1-错的写法-vs-对的写法" tabindex="-1">3.1 错的写法 vs 对的写法 <a class="header-anchor" href="#_3-1-错的写法-vs-对的写法" aria-label="Permalink to &quot;3.1 错的写法 vs 对的写法&quot;">​</a></h3><p>直接看代码:</p><div class="language-promql vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">promql</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># === 错的写法 1:先 quantile 再聚合 ===</span></span>
<span class="line"><span>avg(histogram_quantile(0.99, </span></span>
<span class="line"><span>  rate(http_request_duration_seconds_bucket[5m])</span></span>
<span class="line"><span>))</span></span>
<span class="line"><span># 这个写法在每个 instance 上各算一次 p99</span></span>
<span class="line"><span># 然后 avg 把这些 instance 的 p99 平均掉</span></span>
<span class="line"><span># → &quot;100 个 instance 各自 p99 的平均&quot;</span></span>
<span class="line"><span># → 不是&quot;全局 p99&quot;</span></span>
<span class="line"><span># 数学上:平均 p99 ≠ 全局 p99,后者通常大很多</span></span>
<span class="line"><span></span></span>
<span class="line"><span></span></span>
<span class="line"><span># === 错的写法 2:le 没有 by 进去 ===</span></span>
<span class="line"><span>histogram_quantile(0.99, </span></span>
<span class="line"><span>  sum(rate(http_request_duration_seconds_bucket[5m]))</span></span>
<span class="line"><span>)</span></span>
<span class="line"><span># sum 把所有 series(包括 le 维度)都加成一个数</span></span>
<span class="line"><span># histogram_quantile 找不到 le 标签,直接报错或返回 NaN</span></span>
<span class="line"><span># Prom 现代版本会 silent 失败</span></span>
<span class="line"><span></span></span>
<span class="line"><span></span></span>
<span class="line"><span># === 对的写法 ===</span></span>
<span class="line"><span>histogram_quantile(0.99,</span></span>
<span class="line"><span>  sum by (le) (rate(http_request_duration_seconds_bucket[5m]))</span></span>
<span class="line"><span>)</span></span>
<span class="line"><span># 1. 先 rate() 算每个 bucket 的速率</span></span>
<span class="line"><span># 2. sum by (le) 把所有 instance / 所有维度,按 le(桶上界)合并</span></span>
<span class="line"><span># 3. histogram_quantile 看到只剩 le 维度,正确算分位数</span></span>
<span class="line"><span></span></span>
<span class="line"><span></span></span>
<span class="line"><span># === 对的写法(按 endpoint 拆,看每个 endpoint 的 p99)===</span></span>
<span class="line"><span>histogram_quantile(0.99,</span></span>
<span class="line"><span>  sum by (le, endpoint) (rate(http_request_duration_seconds_bucket[5m]))</span></span>
<span class="line"><span>)</span></span>
<span class="line"><span># by (le, endpoint) ── 保留 endpoint 维度,le 必须 by</span></span>
<span class="line"><span># 输出:每个 endpoint 一条 p99 曲线</span></span></code></pre></div><h3 id="_3-2-为什么-le-必须-by-进去" tabindex="-1">3.2 为什么 <code>le</code> 必须 <code>by</code> 进去 <a class="header-anchor" href="#_3-2-为什么-le-必须-by-进去" aria-label="Permalink to &quot;3.2 为什么 \`le\` 必须 \`by\` 进去&quot;">​</a></h3><p><strong>这是 Histogram 的内部数据结构决定的</strong>——上一篇 05 讲过,Histogram 用一组按 <code>le</code>(less-than-or-equal)累计的 Counter 表示分布:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>http_request_duration_seconds_bucket{le=&quot;0.005&quot;}   1234</span></span>
<span class="line"><span>http_request_duration_seconds_bucket{le=&quot;0.01&quot;}    1500</span></span>
<span class="line"><span>http_request_duration_seconds_bucket{le=&quot;0.025&quot;}   1800</span></span>
<span class="line"><span>http_request_duration_seconds_bucket{le=&quot;0.05&quot;}    2100</span></span>
<span class="line"><span>http_request_duration_seconds_bucket{le=&quot;0.1&quot;}     2500</span></span>
<span class="line"><span>http_request_duration_seconds_bucket{le=&quot;0.25&quot;}    2800</span></span>
<span class="line"><span>http_request_duration_seconds_bucket{le=&quot;0.5&quot;}     2950</span></span>
<span class="line"><span>http_request_duration_seconds_bucket{le=&quot;1&quot;}       2990</span></span>
<span class="line"><span>http_request_duration_seconds_bucket{le=&quot;2.5&quot;}     2998</span></span>
<span class="line"><span>http_request_duration_seconds_bucket{le=&quot;5&quot;}       2999</span></span>
<span class="line"><span>http_request_duration_seconds_bucket{le=&quot;10&quot;}      3000</span></span>
<span class="line"><span>http_request_duration_seconds_bucket{le=&quot;+Inf&quot;}    3000</span></span></code></pre></div><p><strong><code>histogram_quantile(0.99, …)</code> 函数的算法</strong>:<strong>遍历所有 le 标签,找出&quot;刚好覆盖 99% 累计数&quot;的那个桶,然后线性插值算具体值</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>total_count = 3000(le=+Inf 桶)</span></span>
<span class="line"><span>99% × 3000 = 2970</span></span>
<span class="line"><span></span></span>
<span class="line"><span>遍历:</span></span>
<span class="line"><span>  le=0.005   累计 1234 &lt; 2970,继续</span></span>
<span class="line"><span>  le=0.01    累计 1500 &lt; 2970,继续</span></span>
<span class="line"><span>  ...</span></span>
<span class="line"><span>  le=0.25    累计 2800 &lt; 2970,继续</span></span>
<span class="line"><span>  le=0.5     累计 2950 &lt; 2970,继续</span></span>
<span class="line"><span>  le=1       累计 2990 ≥ 2970,停!</span></span>
<span class="line"><span></span></span>
<span class="line"><span>p99 在 [0.5, 1] 之间,线性插值:</span></span>
<span class="line"><span>  上一桶累计 2950(在 le=0.5)</span></span>
<span class="line"><span>  这一桶累计 2990(在 le=1)</span></span>
<span class="line"><span>  需要 2970(在 le=?)</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  比例 = (2970 - 2950) / (2990 - 2950) = 0.5</span></span>
<span class="line"><span>  p99 = 0.5 + 0.5 × (1 - 0.5) = 0.75 (秒)</span></span></code></pre></div><p><strong>关键</strong>:<strong>这个算法依赖&quot;<code>le</code> 是一个独立的维度&quot;,才能遍历</strong>。如果你把 <code>le</code> <code>sum</code> 掉了,所有 bucket 加成一个数,<strong>histogram_quantile 没法工作</strong>。</p><h3 id="_3-3-多实例聚合-正确的层次" tabindex="-1">3.3 多实例聚合:正确的层次 <a class="header-anchor" href="#_3-3-多实例聚合-正确的层次" aria-label="Permalink to &quot;3.3 多实例聚合:正确的层次&quot;">​</a></h3><div class="language-promql vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">promql</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># 100 个 Pod,每个 Pod 自己的 p99 (单独看每个 Pod)</span></span>
<span class="line"><span>histogram_quantile(0.99,</span></span>
<span class="line"><span>  sum by (le, instance) (rate(http_request_duration_seconds_bucket[5m]))</span></span>
<span class="line"><span>)</span></span>
<span class="line"><span># by 里多了 instance,每个 instance 一条曲线</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 全局 p99 (把 100 个 Pod 加起来一起算)</span></span>
<span class="line"><span>histogram_quantile(0.99,</span></span>
<span class="line"><span>  sum by (le) (rate(http_request_duration_seconds_bucket[5m]))</span></span>
<span class="line"><span>)</span></span>
<span class="line"><span># 只 by le,instance 维度被 sum 掉</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 按 endpoint 拆全局 p99</span></span>
<span class="line"><span>histogram_quantile(0.99,</span></span>
<span class="line"><span>  sum by (le, endpoint) (rate(http_request_duration_seconds_bucket[5m]))</span></span>
<span class="line"><span>)</span></span>
<span class="line"><span># 既要按 endpoint 拆,le 也 by</span></span></code></pre></div><p><strong>判别口诀</strong>:<strong><code>histogram_quantile(...)</code> 的内部表达式,<code>by (le, X1, X2, …)</code> 里的 X 维度就是你最后看到的曲线分组</strong>。<strong><code>le</code> 永远在里面,后面跟你想看的业务维度</strong>。</p><h3 id="_3-4-一个真实的反面教材" tabindex="-1">3.4 一个真实的反面教材 <a class="header-anchor" href="#_3-4-一个真实的反面教材" aria-label="Permalink to &quot;3.4 一个真实的反面教材&quot;">​</a></h3><p>某团队的 dashboard 上有这条:</p><div class="language-promql vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">promql</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>histogram_quantile(0.99,</span></span>
<span class="line"><span>  rate(http_request_duration_seconds_bucket[5m])</span></span>
<span class="line"><span>)</span></span></code></pre></div><p><strong>这条没显式聚合,Prom 会保留所有原始维度(instance / status / le / ...)</strong>。结果:<strong>每个 instance × 每个 status 一条 p99 曲线</strong>——dashboard 上几千条线,看不见任何模式。</p><p><strong>修复</strong>:</p><div class="language-promql vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">promql</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>histogram_quantile(0.99,</span></span>
<span class="line"><span>  sum by (le) (rate(http_request_duration_seconds_bucket[5m]))</span></span>
<span class="line"><span>)</span></span></code></pre></div><p><strong>一条干净的全局 p99 曲线</strong>——这才是 dashboard 该有的样子。</p><h3 id="_3-5-recording-rule-必预算-histogram-quantile" tabindex="-1">3.5 Recording Rule 必预算 histogram_quantile <a class="header-anchor" href="#_3-5-recording-rule-必预算-histogram-quantile" aria-label="Permalink to &quot;3.5 Recording Rule 必预算 histogram_quantile&quot;">​</a></h3><p><code>histogram_quantile</code> 的计算量是 PromQL 里最大的一档——<strong>dashboard 频繁查 + 告警频繁评估 = CPU 飙满</strong>。<strong>必须用 Recording Rule 预算</strong>(上一篇 §5 详谈过):</p><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># rules.yml</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">groups</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">latency</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    interval</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">30s</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    rules</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">record</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">endpoint:http_request_duration_seconds:p99_5m</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        expr</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">|</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          histogram_quantile(0.99,</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            sum by (le, endpoint, service) (</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">              rate(http_request_duration_seconds_bucket[5m])</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            )</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          )</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">record</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">endpoint:http_request_duration_seconds:p95_5m</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        expr</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">|</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          histogram_quantile(0.95,</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            sum by (le, endpoint, service) (</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">              rate(http_request_duration_seconds_bucket[5m])</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            )</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          )</span></span></code></pre></div><p><strong>之后</strong>,dashboard 和告警查 <code>endpoint:http_request_duration_seconds:p99_5m</code>——一个简单的指标查询,<strong>比原始 PromQL 快 100 倍</strong>。</p><hr><h2 id="四、5-条生产里每天在用的-promql" tabindex="-1">四、5 条生产里每天在用的 PromQL <a class="header-anchor" href="#四、5-条生产里每天在用的-promql" aria-label="Permalink to &quot;四、5 条生产里每天在用的 PromQL&quot;">​</a></h2><p>讲完原理,看模板。下面这 5 条是 RED 指标 + 容量预测的核心 PromQL,<strong>直接抄到 dashboard 上能跑</strong>。</p><h3 id="_4-1-服务-qps-请求速率" tabindex="-1">4.1 服务 QPS(请求速率) <a class="header-anchor" href="#_4-1-服务-qps-请求速率" aria-label="Permalink to &quot;4.1 服务 QPS(请求速率)&quot;">​</a></h3><div class="language-promql vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">promql</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># 全局</span></span>
<span class="line"><span>sum(rate(http_requests_total[5m]))</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 按服务拆</span></span>
<span class="line"><span>sum by (service) (rate(http_requests_total[5m]))</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 按 endpoint 拆(注意要先 path normalize)</span></span>
<span class="line"><span>sum by (service, endpoint) (rate(http_requests_total[5m]))</span></span></code></pre></div><p><strong>单位</strong>:requests / second(req/s)</p><p><strong>踩坑</strong>:</p><ul><li>别用 <code>increase()</code> 替代 <code>rate()</code>(已说)</li><li>别用 <code>irate()</code>(告警用 rate)</li><li>别忘了 <code>sum</code>——不 sum 的话每个 instance 一条线</li></ul><h3 id="_4-2-错误率-5xx-ratio" tabindex="-1">4.2 错误率(5xx ratio) <a class="header-anchor" href="#_4-2-错误率-5xx-ratio" aria-label="Permalink to &quot;4.2 错误率(5xx ratio)&quot;">​</a></h3><div class="language-promql vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">promql</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># 全局错误率</span></span>
<span class="line"><span>sum(rate(http_requests_total{status=&quot;5xx&quot;}[5m]))</span></span>
<span class="line"><span>  /</span></span>
<span class="line"><span>sum(rate(http_requests_total[5m]))</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 按服务拆</span></span>
<span class="line"><span>sum by (service) (rate(http_requests_total{status=&quot;5xx&quot;}[5m]))</span></span>
<span class="line"><span>  /</span></span>
<span class="line"><span>sum by (service) (rate(http_requests_total[5m]))</span></span></code></pre></div><p><strong>单位</strong>:ratio(0-1),Grafana 上设 unit &quot;percent (0.0-1.0)&quot;</p><p><strong>踩坑</strong>:</p><ul><li><strong>分母是所有请求,不只是非 5xx</strong>——不要写成 <code>5xx / non-5xx</code></li><li><strong>status label 必须 normalize 成 2xx/4xx/5xx</strong>(不是具体 200/404/500),否则筛选条件麻烦</li><li><strong>分母为 0 → NaN</strong>:某段时间没请求,这个表达式返回 NaN。<strong>告警判定要带 <code>or vector(0)</code> 兜底</strong></li></ul><div class="language-promql vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">promql</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># 防御性写法(NaN 时返回 0)</span></span>
<span class="line"><span>(</span></span>
<span class="line"><span>  sum by (service) (rate(http_requests_total{status=&quot;5xx&quot;}[5m]))</span></span>
<span class="line"><span>    /</span></span>
<span class="line"><span>  sum by (service) (rate(http_requests_total[5m]))</span></span>
<span class="line"><span>)</span></span>
<span class="line"><span>or</span></span>
<span class="line"><span>sum by (service) (rate(http_requests_total[5m])) * 0</span></span></code></pre></div><h3 id="_4-3-p99-延迟" tabindex="-1">4.3 P99 延迟 <a class="header-anchor" href="#_4-3-p99-延迟" aria-label="Permalink to &quot;4.3 P99 延迟&quot;">​</a></h3><div class="language-promql vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">promql</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># 全局 p99(必经 Recording Rule)</span></span>
<span class="line"><span>histogram_quantile(0.99,</span></span>
<span class="line"><span>  sum by (le) (rate(http_request_duration_seconds_bucket[5m]))</span></span>
<span class="line"><span>)</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 按服务拆</span></span>
<span class="line"><span>histogram_quantile(0.99,</span></span>
<span class="line"><span>  sum by (le, service) (rate(http_request_duration_seconds_bucket[5m]))</span></span>
<span class="line"><span>)</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 三条线同图(p50/p95/p99)</span></span>
<span class="line"><span>histogram_quantile(0.50, sum by (le) (rate(...[5m])))   # 中位数</span></span>
<span class="line"><span>histogram_quantile(0.95, sum by (le) (rate(...[5m])))   # 95 分位</span></span>
<span class="line"><span>histogram_quantile(0.99, sum by (le) (rate(...[5m])))   # 99 分位</span></span></code></pre></div><p><strong>单位</strong>:seconds</p><p><strong>踩坑</strong>:</p><ul><li><strong><code>le</code> 必须 by</strong>(已经说过 3 遍)</li><li><strong>bucket 不覆盖 SLO 边界 → p99 算不准</strong>(上一篇说过)</li><li><strong>太少样本 → p99 抖动剧烈</strong>:某 endpoint QPS &lt; 10,5min 才几十个样本,p99 跳来跳去。<strong>用 30m 窗口</strong> <code>rate(...[30m])</code> 平滑</li></ul><h3 id="_4-4-cpu-饱和度" tabindex="-1">4.4 CPU 饱和度 <a class="header-anchor" href="#_4-4-cpu-饱和度" aria-label="Permalink to &quot;4.4 CPU 饱和度&quot;">​</a></h3><div class="language-promql vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">promql</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># 节点 CPU 使用率(USE 方法)</span></span>
<span class="line"><span>1 - avg by (instance) (</span></span>
<span class="line"><span>  rate(node_cpu_seconds_total{mode=&quot;idle&quot;}[5m])</span></span>
<span class="line"><span>)</span></span>
<span class="line"><span># 思路:CPU idle 速率越低,使用率越高</span></span>
<span class="line"><span># 100% = 1.0(注意单位,Grafana 设 percent unit)</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 容器 CPU(Pod 级)</span></span>
<span class="line"><span>sum by (pod) (</span></span>
<span class="line"><span>  rate(container_cpu_usage_seconds_total{container!=&quot;&quot;}[5m])</span></span>
<span class="line"><span>)</span></span>
<span class="line"><span># 单位:CPU cores(1.5 = 1.5 个核)</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 容器 CPU 占 limit 的比例</span></span>
<span class="line"><span>sum by (pod) (rate(container_cpu_usage_seconds_total[5m]))</span></span>
<span class="line"><span>  /</span></span>
<span class="line"><span>sum by (pod) (kube_pod_container_resource_limits{resource=&quot;cpu&quot;})</span></span>
<span class="line"><span># 0-1 之间,0.8+ 接近 throttle</span></span></code></pre></div><p><strong>踩坑</strong>:</p><ul><li><strong><code>mode=&quot;idle&quot;</code></strong>——node_exporter 暴露 idle/user/system/iowait 等,<strong>用 1 - idle 比 sum(user+system+…) 简单且更准</strong>(包含了 iowait)</li><li><strong><code>container!=&quot;&quot;</code></strong>——过滤掉 cgroup root,否则 sum 会双计</li><li><strong>不要用 <code>node_load1</code></strong>——load average 是&quot;运行队列长度&quot;,和 CPU% 不一样(虽然相关)</li></ul><h3 id="_4-5-容量预测-predict-linear" tabindex="-1">4.5 容量预测:predict_linear <a class="header-anchor" href="#_4-5-容量预测-predict-linear" aria-label="Permalink to &quot;4.5 容量预测:predict_linear&quot;">​</a></h3><div class="language-promql vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">promql</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># 预测磁盘是否会在 24 小时内被写满</span></span>
<span class="line"><span>predict_linear(node_filesystem_avail_bytes[1h], 24 * 3600) &lt; 0</span></span>
<span class="line"><span># 含义:用过去 1 小时的下跌趋势,预测 24h 后的余量</span></span>
<span class="line"><span># &lt; 0 → 24h 内会满,告警</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 预测内存是否会在 4 小时内 OOM</span></span>
<span class="line"><span>predict_linear(node_memory_MemAvailable_bytes[2h], 4 * 3600) &lt; 0</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 预测某指标在 N 小时后达到某阈值</span></span>
<span class="line"><span>predict_linear(some_metric[1h], 6 * 3600) &gt; 10000</span></span></code></pre></div><p><strong>predict_linear 的算法</strong>:<strong>用窗口内的样本做线性回归,外推到未来 N 秒</strong>。<strong>前提是趋势是线性的</strong>——指数增长(垃圾回收堆积)算不准。</p><p><strong>踩坑</strong>:</p><ul><li><strong>窗口太小预测震荡</strong>:<code>predict_linear([5m], …)</code> 用 5min 样本预测 24h,<strong>抖一下就告警</strong>。<strong>至少用 1h-6h 窗口预测</strong></li><li><strong>不能预测非单调指标</strong>:用来预测 Counter / 单调下跌的 Gauge 才行,<strong>对周期性指标(QPS 有日夜节奏)用 predict_linear 会乱</strong></li><li><strong>告警要带&quot;持续 N 分钟&quot;</strong>:<code>predict_linear(...) &lt; 0 for 10m</code>——单次跳变不算</li></ul><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Alertmanager rule 示例</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">- </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">alert</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">DiskWillFillIn24h</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  expr</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">predict_linear(node_filesystem_avail_bytes[2h], 24 * 3600) &lt; 0</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  for</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">30m</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">              # 持续 30 分钟才告警</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  labels</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    severity</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">warning</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  annotations</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    summary</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;磁盘 {{ $labels.device }} 在 24h 内可能写满&quot;</span></span></code></pre></div><hr><h2 id="五、高级特性-offset-modifier-subquery" tabindex="-1">五、高级特性:offset / @ modifier / subquery <a class="header-anchor" href="#五、高级特性-offset-modifier-subquery" aria-label="Permalink to &quot;五、高级特性:offset / @ modifier / subquery&quot;">​</a></h2><p>这三个特性是中型团队 PromQL 进阶必备——<strong>用得对省一半 PromQL,用错就给自己挖坑</strong>。</p><h3 id="_5-1-offset-看-过去某个时间点-的值" tabindex="-1">5.1 offset:看&quot;过去某个时间点&quot;的值 <a class="header-anchor" href="#_5-1-offset-看-过去某个时间点-的值" aria-label="Permalink to &quot;5.1 offset:看&quot;过去某个时间点&quot;的值&quot;">​</a></h3><div class="language-promql vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">promql</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># 当前 QPS</span></span>
<span class="line"><span>sum(rate(http_requests_total[5m]))</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 一周前同一时刻的 QPS</span></span>
<span class="line"><span>sum(rate(http_requests_total[5m] offset 7d))</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 同环比(本周 vs 上周)</span></span>
<span class="line"><span>sum(rate(http_requests_total[5m]))</span></span>
<span class="line"><span>  /</span></span>
<span class="line"><span>sum(rate(http_requests_total[5m] offset 7d))</span></span>
<span class="line"><span># 数值 &gt; 1 = 涨,&lt; 1 = 跌</span></span></code></pre></div><p><strong>典型应用</strong>:</p><ul><li><strong>同环比报表</strong>(今天 vs 一周前)</li><li><strong>节假日对比</strong>(今年双 11 vs 去年双 11,offset 1y)</li><li><strong>回归测试</strong>(发布前 vs 发布后,offset 1h)</li></ul><p><strong>踩坑</strong>:</p><ul><li><strong>offset 不能跨 retention</strong>——你 Prom 只存 15 天,<code>offset 30d</code> 直接返回空</li><li><strong>offset 不影响窗口大小</strong>——<code>rate([5m] offset 7d)</code> 是&quot;一周前那段 5m&quot;的 rate</li></ul><h3 id="_5-2-modifier-绝对时间锚点" tabindex="-1">5.2 <code>@</code> modifier:绝对时间锚点 <a class="header-anchor" href="#_5-2-modifier-绝对时间锚点" aria-label="Permalink to &quot;5.2 \`@\` modifier:绝对时间锚点&quot;">​</a></h3><p><code>@</code> 是 Prom 2.25+ 的新特性,让你<strong>固定 PromQL 的&quot;现在时间&quot;</strong>:</p><div class="language-promql vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">promql</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># 用 @end() 锚定到 dashboard 选的时间范围结尾</span></span>
<span class="line"><span>some_metric @ end()</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 用 @start() 锚定到时间范围开头</span></span>
<span class="line"><span>some_metric @ start()</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 锚定到固定 unix 时间戳</span></span>
<span class="line"><span>some_metric @ 1700000000</span></span></code></pre></div><p><strong>典型应用</strong>:</p><div class="language-promql vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">promql</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># 计算&quot;从 t0 到现在的累计增长率&quot;</span></span>
<span class="line"><span>(</span></span>
<span class="line"><span>  http_requests_total</span></span>
<span class="line"><span>    -</span></span>
<span class="line"><span>  http_requests_total @ 1700000000      # 锚定到 t0</span></span>
<span class="line"><span>)</span></span></code></pre></div><p><strong>踩坑</strong>:</p><ul><li><strong>@ 是新特性,Grafana 老版本不支持</strong>——升级先</li><li><strong>跟 offset 容易混淆</strong>——offset 是&quot;相对偏移&quot;,@ 是&quot;绝对锚点&quot;</li></ul><h3 id="_5-3-subquery-在查询里再查询" tabindex="-1">5.3 subquery:在查询里再查询 <a class="header-anchor" href="#_5-3-subquery-在查询里再查询" aria-label="Permalink to &quot;5.3 subquery:在查询里再查询&quot;">​</a></h3><p><strong>subquery 让你在 PromQL 里嵌一个&quot;内层 range query&quot;</strong>:</p><div class="language-promql vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">promql</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># 用 5 分钟一段的 rate 作为新的&quot;指标&quot;,再算它的 max</span></span>
<span class="line"><span>max_over_time(</span></span>
<span class="line"><span>  rate(http_requests_total[5m])[1h:1m]</span></span>
<span class="line"><span>)</span></span>
<span class="line"><span># 内层:每 1 分钟算一次过去 5 分钟的 rate</span></span>
<span class="line"><span># 外层:在过去 1 小时,对这些 rate 取 max</span></span>
<span class="line"><span># → &quot;过去 1 小时里,最高的 5 分钟 QPS&quot;</span></span></code></pre></div><p><strong>典型应用</strong>:</p><ul><li><strong>算&quot;高峰 QPS&quot;</strong>(过去 1 小时最高的 5m 速率)</li><li><strong>算&quot;长尾事件&quot;</strong>(过去 24h 出现过几次某情况)</li></ul><div class="language-promql vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">promql</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># 过去 24h 错误率超 1% 的总分钟数</span></span>
<span class="line"><span>count_over_time(</span></span>
<span class="line"><span>  ((sum(rate(http_requests_total{status=&quot;5xx&quot;}[5m]))</span></span>
<span class="line"><span>    / sum(rate(http_requests_total[5m]))) &gt; 0.01)[24h:1m]</span></span>
<span class="line"><span>)</span></span></code></pre></div><p><strong>踩坑</strong>:</p><ul><li><strong>Subquery 计算量大</strong>:<code>[24h:1m]</code> = 1440 次内层查询。<strong>Recording Rule 必须预算内层</strong></li><li><strong>窗口和步长写错</strong>:<code>[1h:1m]</code> 意思是&quot;过去 1 小时,每 1m 一次内层&quot;;写成 <code>[1h:10m]</code> 就只有 6 个点</li></ul><hr><h2 id="六、隐藏陷阱-counter-reset-stale-跨-prom-聚合" tabindex="-1">六、隐藏陷阱:counter reset / stale / 跨 Prom 聚合 <a class="header-anchor" href="#六、隐藏陷阱-counter-reset-stale-跨-prom-聚合" aria-label="Permalink to &quot;六、隐藏陷阱:counter reset / stale / 跨 Prom 聚合&quot;">​</a></h2><p>讲完语法和高级特性,讲三个&quot;PromQL 看起来跑了,但答案错了&quot;的隐藏陷阱。</p><h3 id="_6-1-counter-reset-重启的-幽灵下跌" tabindex="-1">6.1 Counter Reset:重启的&quot;幽灵下跌&quot; <a class="header-anchor" href="#_6-1-counter-reset-重启的-幽灵下跌" aria-label="Permalink to &quot;6.1 Counter Reset:重启的&quot;幽灵下跌&quot;&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>原始 Counter 样本:</span></span>
<span class="line"><span>  t=0    counter = 1,000,000</span></span>
<span class="line"><span>  t=15s  counter = 1,000,050</span></span>
<span class="line"><span>  t=30s  counter = 1,000,100</span></span>
<span class="line"><span>  t=45s  ← 进程重启</span></span>
<span class="line"><span>  t=45s  counter = 0</span></span>
<span class="line"><span>  t=60s  counter = 50</span></span>
<span class="line"><span></span></span>
<span class="line"><span>如果不处理:</span></span>
<span class="line"><span>  rate 会看到 (50 - 1,000,000) / 60 = -16666 /s ← 负数,荒谬</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Prom 的处理:</span></span>
<span class="line"><span>  发现样本下跌(reset 信号)</span></span>
<span class="line"><span>  假定&quot;刚好涨到上一个值就重启,然后继续涨&quot;</span></span>
<span class="line"><span>  补偿:把&quot;跌掉的&quot;部分加回来</span></span>
<span class="line"><span>  → rate ≈ (1,000,100 + 50) / 60 ≈ 16668 /s ← 但其实是错的近似</span></span>
<span class="line"><span></span></span>
<span class="line"><span>正确的真实速率 = 涨 100 / 30s = 3.3 /s</span></span>
<span class="line"><span>Prom 估算 = 16668 /s</span></span>
<span class="line"><span>差了 5000 倍</span></span></code></pre></div><p><strong>根因</strong>:<strong>Prom 不知道重启发生时 counter 实际涨到哪了</strong>——它只能用最后一个采到的值当上限。<strong>如果重启时 counter 还在涨,真实值会高于最后采到的值</strong>——但 Prom 看不见,只能近似。</p><p><strong>治理</strong>:</p><ul><li><strong>进程不要频繁重启</strong>——Prom 假定 reset 不常发生,1 小时一次以下问题不大</li><li><strong>Counter 重启时,如果短时间(&lt; scrape_interval)内涨很多,数据丢</strong>——这是 Counter 的硬限制</li><li><strong>不要把&quot;业务 GMV&quot;这种重要指标做成 Counter</strong>——做成&quot;事件流推 Kafka + 数仓&quot;,Prom 算近似就够</li></ul><h3 id="_6-2-stale-marker-消失的-series" tabindex="-1">6.2 Stale Marker:消失的 series <a class="header-anchor" href="#_6-2-stale-marker-消失的-series" aria-label="Permalink to &quot;6.2 Stale Marker:消失的 series&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Pod 被删 → 该 Pod 的 /metrics 拉不到 → series 失活</span></span>
<span class="line"><span></span></span>
<span class="line"><span>如果不标 stale:</span></span>
<span class="line"><span>  Prom 不知道这个 series 永远不会再来</span></span>
<span class="line"><span>  Dashboard 上还会显示这条线最后一刻的值</span></span>
<span class="line"><span>  PromQL aggregation 把这个&quot;死掉的&quot;值也加进去</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Prom 的处理:</span></span>
<span class="line"><span>  连续 5 个 scrape 都拉不到该 target → 标记 stale</span></span>
<span class="line"><span>  之后 rate / sum 等函数会忽略这个 series</span></span></code></pre></div><p><strong>坑</strong>:<strong>Stale marker 只在&quot;target 整个失联&quot;才触发</strong>——如果 Pod 还在,/metrics 还能拉,但某个 metric 不再被暴露(被删了一个 label 的某个值),<strong>这个 series 不会被自动 stale</strong>。<strong>Prom 会看到它&quot;卡在最后一个值&quot;</strong>——dashboard 上一条平直线,看起来&quot;很稳&quot;。</p><p><strong>示例</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>某 Pod 暴露 metric{user_id=&quot;42&quot;} ── 这条 series 之前有数据</span></span>
<span class="line"><span>此用户被删,Pod 不再暴露这个 label 值的 metric</span></span>
<span class="line"><span>Prom 仍然看见 metric{user_id=&quot;42&quot;} = &lt;最后一个值&gt;,持续显示</span></span>
<span class="line"><span>直到 5 分钟 (默认 staleness window) 过去</span></span></code></pre></div><p><strong>这就是为什么 cardinality 高的 label 是噩梦</strong>——不仅占内存,还会留下&quot;幽灵 series&quot;长达 5 分钟。</p><h3 id="_6-3-跨-prom-聚合-federation-remote-read-的隐性偏差" tabindex="-1">6.3 跨 Prom 聚合:Federation / Remote Read 的隐性偏差 <a class="header-anchor" href="#_6-3-跨-prom-聚合-federation-remote-read-的隐性偏差" aria-label="Permalink to &quot;6.3 跨 Prom 聚合:Federation / Remote Read 的隐性偏差&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>两个 Prom 实例 A 和 B,各自抓 50 个 target</span></span>
<span class="line"><span>scrape_interval = 15s,但 A 和 B 不同步</span></span>
<span class="line"><span></span></span>
<span class="line"><span>中心 Federation 每 30s 拉一次,在 t=30 拉到:</span></span>
<span class="line"><span>  A 的最新数据是 t=27</span></span>
<span class="line"><span>  B 的最新数据是 t=22</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  ↓ 中心 Prom 把 t=22 和 t=27 的数据混在一起算 rate</span></span>
<span class="line"><span>  ↓ rate 窗口里,样本时间戳不连续</span></span>
<span class="line"><span>  ↓ 结果偏离真实值</span></span></code></pre></div><p><strong>根因</strong>:<strong>Prom 假定一个 series 的样本来自同一来源、时间戳连续</strong>。跨实例聚合时这个假设打破。</p><p><strong>治理</strong>:</p><ul><li><strong>跨实例 PromQL 只用 Recording Rule 产物</strong>——本地 Prom 已经做完 aggregation,中心 Prom 看到的是稳定的预算 metric</li><li><strong>不要在中心 Prom 重新跑 rate / histogram_quantile</strong>——这些是&quot;原始 metric 级&quot;的操作,在已聚合的 metric 上跑会丢精度</li><li><strong>Thanos / Mimir 等长存储工具有&quot;专门处理跨副本&quot;的机制</strong>(<code>__replica__</code> label + deduplication)</li></ul><hr><h2 id="七、一段最差实践的-promql-改造" tabindex="-1">七、一段最差实践的 PromQL 改造 <a class="header-anchor" href="#七、一段最差实践的-promql-改造" aria-label="Permalink to &quot;七、一段最差实践的 PromQL 改造&quot;">​</a></h2><p>讲完原理和坑,看一个真实的&quot;烂 PromQL&quot;改造案例。</p><h3 id="_7-1-改造前" tabindex="-1">7.1 改造前 <a class="header-anchor" href="#_7-1-改造前" aria-label="Permalink to &quot;7.1 改造前&quot;">​</a></h3><p>某团队 Grafana 上的&quot;产品页 P99 延迟&quot;panel:</p><div class="language-promql vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">promql</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>avg(</span></span>
<span class="line"><span>  histogram_quantile(</span></span>
<span class="line"><span>    0.99,</span></span>
<span class="line"><span>    rate(product_page_duration_ms_bucket[30s])</span></span>
<span class="line"><span>  )</span></span>
<span class="line"><span>) * 1000</span></span></code></pre></div><p><strong>问题清单</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 指标名 product_page_duration_ms_bucket </span></span>
<span class="line"><span>   → 单位 ms 进了名字,违反 _seconds 约定</span></span>
<span class="line"><span>   → &quot;* 1000&quot; 暗示开发者也不确定单位,凑数</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. rate([30s]) </span></span>
<span class="line"><span>   → 30s 窗口 &lt; 4 × 15s = 60s,样本不足,经常 NaN</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. histogram_quantile 没 by (le) </span></span>
<span class="line"><span>   → rate 输出保留原始 instance 维度,le 没显式聚合</span></span>
<span class="line"><span>   → Prom 现代版本可能 silent 返回错值</span></span>
<span class="line"><span></span></span>
<span class="line"><span>4. 外面 avg() </span></span>
<span class="line"><span>   → 平均&quot;每个 instance 的 p99&quot;,不是全局 p99</span></span>
<span class="line"><span>   → 数学上是错的</span></span>
<span class="line"><span></span></span>
<span class="line"><span>5. 整个表达式没 service / endpoint 维度</span></span>
<span class="line"><span>   → 多个产品页混在一起,看不出哪个慢</span></span></code></pre></div><h3 id="_7-2-改造步骤" tabindex="-1">7.2 改造步骤 <a class="header-anchor" href="#_7-2-改造步骤" aria-label="Permalink to &quot;7.2 改造步骤&quot;">​</a></h3><p><strong>第一步</strong>:<strong>修指标名</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>旧:product_page_duration_ms_bucket</span></span>
<span class="line"><span>新:product_page_duration_seconds_bucket    # 单位改成秒</span></span>
<span class="line"><span>   值:0.005 / 0.01 / 0.025 / 0.05 / 0.1 / 0.25 / 0.5 / 1 / 2.5 / 5 / 10</span></span>
<span class="line"><span>代码层把 ms 改成 seconds(value / 1000.0)</span></span></code></pre></div><p><strong>第二步</strong>:<strong>改 PromQL</strong>。</p><div class="language-promql vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">promql</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># 改后(全局 P99)</span></span>
<span class="line"><span>histogram_quantile(0.99,</span></span>
<span class="line"><span>  sum by (le) (rate(product_page_duration_seconds_bucket[5m]))</span></span>
<span class="line"><span>)</span></span></code></pre></div><div class="language-promql vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">promql</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># 改后(按 endpoint 拆 P99)</span></span>
<span class="line"><span>histogram_quantile(0.99,</span></span>
<span class="line"><span>  sum by (le, endpoint) (rate(product_page_duration_seconds_bucket[5m]))</span></span>
<span class="line"><span>)</span></span></code></pre></div><p><strong>第三步</strong>:<strong>做 Recording Rule</strong>。</p><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">groups</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">product_page_latency</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    interval</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">30s</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    rules</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">record</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">endpoint:product_page_duration_seconds:p99_5m</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        expr</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">|</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          histogram_quantile(0.99,</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            sum by (le, endpoint) (</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">              rate(product_page_duration_seconds_bucket[5m])</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            )</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          )</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">record</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">endpoint:product_page_duration_seconds:p95_5m</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        expr</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">|</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          histogram_quantile(0.95,</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            sum by (le, endpoint) (</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">              rate(product_page_duration_seconds_bucket[5m])</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            )</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          )</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">record</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">endpoint:product_page_duration_seconds:p50_5m</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        expr</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">|</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          histogram_quantile(0.50,</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            sum by (le, endpoint) (</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">              rate(product_page_duration_seconds_bucket[5m])</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            )</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          )</span></span></code></pre></div><p><strong>第四步</strong>:<strong>Dashboard 改成查 Recording Rule 产物</strong>。</p><div class="language-promql vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">promql</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># Dashboard panel 1:全局 P99</span></span>
<span class="line"><span>sum(endpoint:product_page_duration_seconds:p99_5m)</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 等一下,这条是错的!sum 会把不同 endpoint 加起来</span></span>
<span class="line"><span># 改成:</span></span>
<span class="line"><span>max(endpoint:product_page_duration_seconds:p99_5m)</span></span>
<span class="line"><span># 或者:</span></span>
<span class="line"><span>avg(endpoint:product_page_duration_seconds:p99_5m)</span></span>
<span class="line"><span># 取决于你要&quot;最慢的 endpoint&quot;还是&quot;平均水平&quot;</span></span></code></pre></div><p><strong>注意</strong>:<strong>Recording Rule 产物已经按 endpoint 拆好了,Dashboard 上再聚合时要想清楚</strong>。如果要全局 P99 而不是&quot;各 endpoint P99 的平均&quot;,<strong>应该在 Recording Rule 里再写一条不按 endpoint 拆的版本</strong>:</p><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">- </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">record</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">service:product_page_duration_seconds:p99_5m</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  expr</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">|</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    histogram_quantile(0.99,</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">      sum by (le) (</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">        rate(product_page_duration_seconds_bucket[5m])</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">      )</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    )</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 注意 level 是 service,没有 endpoint</span></span></code></pre></div><p><strong>第五步</strong>:<strong>告警 expr 用 Recording Rule 产物</strong>。</p><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">- </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">alert</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">ProductPageHighLatency</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  expr</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">|</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    endpoint:product_page_duration_seconds:p99_5m &gt; 0.5</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  for</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">5m</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  labels</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    severity</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">warning</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  annotations</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    summary</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;Endpoint {{ $labels.endpoint }} P99 &gt; 500ms&quot;</span></span></code></pre></div><h3 id="_7-3-改造前后对比" tabindex="-1">7.3 改造前后对比 <a class="header-anchor" href="#_7-3-改造前后对比" aria-label="Permalink to &quot;7.3 改造前后对比&quot;">​</a></h3><table tabindex="0"><thead><tr><th>维度</th><th>改造前</th><th>改造后</th></tr></thead><tbody><tr><td>单位</td><td>ms(违规)</td><td>seconds(标准)</td></tr><tr><td>窗口</td><td>30s(易 NaN)</td><td>5m(稳定)</td></tr><tr><td><code>le</code> 处理</td><td>没 by(可能错)</td><td>by (le)(正确)</td></tr><tr><td>聚合顺序</td><td>avg 后 quantile(错)</td><td>sum by le 后 quantile(对)</td></tr><tr><td>维度拆分</td><td>全部混合</td><td>按 endpoint 拆</td></tr><tr><td>性能</td><td>每次查询全算</td><td>Recording Rule 预算</td></tr><tr><td>数值差</td><td>350ms(错的)</td><td>3000ms(对的)</td></tr></tbody></table><p><strong>改造的意义不只是数字变对,还有&quot;告警终于会在该响的时候响&quot;</strong>——之前 P99 看起来 350ms 永远不触发,改造后真实 P99 3000ms 立刻告警。</p><hr><h2 id="八、踩坑提醒" tabindex="-1">八、踩坑提醒 <a class="header-anchor" href="#八、踩坑提醒" aria-label="Permalink to &quot;八、踩坑提醒&quot;">​</a></h2><h3 id="_8-1-rate-irate-increase-单位混淆" tabindex="-1">8.1 <code>rate / irate / increase</code> 单位混淆 <a class="header-anchor" href="#_8-1-rate-irate-increase-单位混淆" aria-label="Permalink to &quot;8.1 \`rate / irate / increase\` 单位混淆&quot;">​</a></h3><p><code>rate</code> 和 <code>irate</code> 是 per second,<code>increase</code> 是绝对总量。<strong>Grafana panel 的 unit 必须和 PromQL 输出单位匹配</strong>——错了你的图就在骗你。</p><h3 id="_8-2-窗口-x-小于-4-×-scrape-interval" tabindex="-1">8.2 窗口 <code>[X]</code> 小于 <code>4 × scrape_interval</code> <a class="header-anchor" href="#_8-2-窗口-x-小于-4-×-scrape-interval" aria-label="Permalink to &quot;8.2 窗口 \`[X]\` 小于 \`4 × scrape_interval\`&quot;">​</a></h3><p>PromQL 静默返回 NaN 一半时间。<strong>最小 <code>[1m]</code>(配 15s scrape),稳妥 <code>[5m]</code></strong>。</p><h3 id="_8-3-histogram-quantile-顺序错" tabindex="-1">8.3 <code>histogram_quantile</code> 顺序错 <a class="header-anchor" href="#_8-3-histogram-quantile-顺序错" aria-label="Permalink to &quot;8.3 \`histogram_quantile\` 顺序错&quot;">​</a></h3><p>记住口诀:<strong>&quot;先 rate,再 sum by le,最后 quantile&quot;</strong>。<strong>绝不能 avg(quantile(…))</strong>。</p><h3 id="_8-4-用-increase-算-qps" tabindex="-1">8.4 用 <code>increase()</code> 算 QPS <a class="header-anchor" href="#_8-4-用-increase-算-qps" aria-label="Permalink to &quot;8.4 用 \`increase()\` 算 QPS&quot;">​</a></h3><p>最常见的入门错误。<strong>rate 是速率,increase 是总量</strong>。</p><h3 id="_8-5-没监控-promql-自己的性能" tabindex="-1">8.5 没监控 PromQL 自己的性能 <a class="header-anchor" href="#_8-5-没监控-promql-自己的性能" aria-label="Permalink to &quot;8.5 没监控 PromQL 自己的性能&quot;">​</a></h3><p><code>prometheus_engine_query_duration_seconds</code>、<code>prometheus_rule_evaluation_duration_seconds</code>——<strong>这些指标告诉你哪条 PromQL 太慢</strong>。慢查询就送 Recording Rule。</p><h3 id="_8-6-分母为-0-返回-nan-告警永远不响" tabindex="-1">8.6 分母为 0 返回 NaN,告警永远不响 <a class="header-anchor" href="#_8-6-分母为-0-返回-nan-告警永远不响" aria-label="Permalink to &quot;8.6 分母为 0 返回 NaN,告警永远不响&quot;">​</a></h3><div class="language-promql vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">promql</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># 错的写法</span></span>
<span class="line"><span>rate(errors[5m]) / rate(total[5m])    # total = 0 时 NaN,告警条件永远不满足</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 防御性写法</span></span>
<span class="line"><span>(rate(errors[5m]) / rate(total[5m])) or vector(0)</span></span></code></pre></div><h3 id="_8-7-跨-prom-聚合用原始-metric" tabindex="-1">8.7 跨 Prom 聚合用原始 metric <a class="header-anchor" href="#_8-7-跨-prom-聚合用原始-metric" aria-label="Permalink to &quot;8.7 跨 Prom 聚合用原始 metric&quot;">​</a></h3><p>跨实例聚合丢精度。<strong>Federation / Thanos 跨实例时只查 Recording Rule 产物</strong>。</p><h3 id="_8-8-counter-重启-pod-漂移" tabindex="-1">8.8 Counter 重启 / Pod 漂移 <a class="header-anchor" href="#_8-8-counter-重启-pod-漂移" aria-label="Permalink to &quot;8.8 Counter 重启 / Pod 漂移&quot;">​</a></h3><p>重启时高速涨的 Counter,Prom 算不准。<strong>重要的&quot;业务总量&quot;不要做成 Prom Counter,做成事件流</strong>。</p><h3 id="_8-9-path-normalize-没做" tabindex="-1">8.9 path normalize 没做 <a class="header-anchor" href="#_8-9-path-normalize-没做" aria-label="Permalink to &quot;8.9 path normalize 没做&quot;">​</a></h3><p><code>/users/12345 /users/67890</code> 各成一个 series → cardinality 爆炸。在 web framework 层做 template:<code>/users/:id</code>。</p><h3 id="_8-10-dashboard-上-100-条线" tabindex="-1">8.10 dashboard 上 100 条线 <a class="header-anchor" href="#_8-10-dashboard-上-100-条线" aria-label="Permalink to &quot;8.10 dashboard 上 100 条线&quot;">​</a></h3><p>不显式 <code>sum by (...)</code> 聚合的 PromQL,Grafana panel 上就是 100 条线挤一起。<strong>Dashboard 一行 query 必须有显式聚合</strong>。</p><h3 id="_8-11-用-promql-算-明细" tabindex="-1">8.11 用 PromQL 算&quot;明细&quot; <a class="header-anchor" href="#_8-11-用-promql-算-明细" aria-label="Permalink to &quot;8.11 用 PromQL 算&quot;明细&quot;&quot;">​</a></h3><p>&quot;上一个小时哪些用户失败了 5 次以上&quot;——这是日志的事,不是 metric。Metric 是聚合数据。</p><h3 id="_8-12-告警评估慢" tabindex="-1">8.12 告警评估慢 <a class="header-anchor" href="#_8-12-告警评估慢" aria-label="Permalink to &quot;8.12 告警评估慢&quot;">​</a></h3><p><code>histogram_quantile + 复杂 by + 长窗口</code> 的告警每 15s 评估一次,直接把 Prom CPU 拖满。<strong>所有复杂告警 expr 必走 Recording Rule</strong>。</p><h3 id="_8-13-subquery-滥用" tabindex="-1">8.13 Subquery 滥用 <a class="header-anchor" href="#_8-13-subquery-滥用" aria-label="Permalink to &quot;8.13 Subquery 滥用&quot;">​</a></h3><p><code>[24h:1m]</code> 就是 1440 个内层 query。<strong>Subquery 是核武器,不是默认工具</strong>。</p><hr><h2 id="九、何时不该用-promql-或者-换工具的信号" tabindex="-1">九、何时不该用 PromQL(或者:换工具的信号) <a class="header-anchor" href="#九、何时不该用-promql-或者-换工具的信号" aria-label="Permalink to &quot;九、何时不该用 PromQL(或者:换工具的信号)&quot;">​</a></h2><p>PromQL 不是万能。这一节是给&quot;我们 PromQL 越写越长越复杂&quot;的团队一个反思机会。</p><h3 id="_9-1-信号-1-promql-写到-30-行还看不懂" tabindex="-1">9.1 信号 1:PromQL 写到 30 行还看不懂 <a class="header-anchor" href="#_9-1-信号-1-promql-写到-30-行还看不懂" aria-label="Permalink to &quot;9.1 信号 1:PromQL 写到 30 行还看不懂&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>某团队的&quot;健康度&quot;PromQL 写了 30 行,5 个嵌套</span></span>
<span class="line"><span>   - 没人能解释为什么这样写</span></span>
<span class="line"><span>   - 改一下就崩</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>真相:这是&quot;业务报表&quot;逻辑,不是&quot;指标聚合&quot;逻辑</span></span>
<span class="line"><span>解决:数据进 ClickHouse / 数仓,用 SQL 写</span></span></code></pre></div><p><strong>PromQL 是为&quot;几条线性聚合 + 简单算术&quot;设计的</strong>——复杂业务逻辑塞进 PromQL 永远是错的方向。</p><h3 id="_9-2-信号-2-经常要-join-不同来源的-metric" tabindex="-1">9.2 信号 2:经常要 join 不同来源的 metric <a class="header-anchor" href="#_9-2-信号-2-经常要-join-不同来源的-metric" aria-label="Permalink to &quot;9.2 信号 2:经常要 join 不同来源的 metric&quot;">​</a></h3><p>PromQL 的 <code>* on(...) group_left(...)</code> 语法是为简单 join 设计的——<strong>不是 SQL 风格的多表 join</strong>。如果你天天写 <code>group_left</code>,<strong>说明你需要的是 SQL,不是 PromQL</strong>。</p><h3 id="_9-3-信号-3-要看个体明细" tabindex="-1">9.3 信号 3:要看个体明细 <a class="header-anchor" href="#_9-3-信号-3-要看个体明细" aria-label="Permalink to &quot;9.3 信号 3:要看个体明细&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>✗ &quot;user_id=42 这个用户过去 1 小时的延迟历史&quot;</span></span>
<span class="line"><span>   - 在 metric 层做不到(label 不能放 user_id)</span></span>
<span class="line"><span>   - → Trace / Log 查</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>✗ &quot;上次部署影响了哪几个 endpoint&quot;</span></span>
<span class="line"><span>   - 还是 Trace / Log 的事</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>✗ &quot;某个 device_id 最后心跳时间&quot;</span></span>
<span class="line"><span>   - 这是事件流,不是 metric</span></span></code></pre></div><h3 id="_9-4-信号-4-跨-prom-实例频繁" tabindex="-1">9.4 信号 4:跨 Prom 实例频繁 <a class="header-anchor" href="#_9-4-信号-4-跨-prom-实例频繁" aria-label="Permalink to &quot;9.4 信号 4:跨 Prom 实例频繁&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>跨 region / 跨集群的 PromQL 永远有精度问题</span></span>
<span class="line"><span>→ 用 Thanos / VM / Mimir 提供的全局 PromQL(看 08 篇)</span></span>
<span class="line"><span>→ 或者把数据落到 OLAP(ClickHouse / Druid)用 SQL 查</span></span></code></pre></div><h3 id="_9-5-promql-之外的选择" tabindex="-1">9.5 PromQL 之外的选择 <a class="header-anchor" href="#_9-5-promql-之外的选择" aria-label="Permalink to &quot;9.5 PromQL 之外的选择&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>要做明细查询      → SQL on ClickHouse / Druid</span></span>
<span class="line"><span>要做时序预测      → ML 模型 / Prophet / 算法库</span></span>
<span class="line"><span>要做复杂 join     → SQL on OLAP</span></span>
<span class="line"><span>要做长时间报表    → 数仓</span></span>
<span class="line"><span>要看个体记录      → Trace + Log</span></span></code></pre></div><hr><h2 id="十、踩坑提醒清单" tabindex="-1">十、踩坑提醒清单 <a class="header-anchor" href="#十、踩坑提醒清单" aria-label="Permalink to &quot;十、踩坑提醒清单&quot;">​</a></h2><ol><li><strong><code>increase</code> 算 QPS</strong> —— 单位错了 N 倍,dashboard 长期误导</li><li><strong>窗口 &lt; 4 × scrape_interval</strong> —— NaN 一半时间</li><li><strong><code>histogram_quantile</code> 没 <code>by (le)</code></strong> —— 函数 silent 失败或错值</li><li><strong>avg(quantile(...)) 跨实例 P99</strong> —— 数学上不等价,真实 P99 看不见</li><li><strong><code>irate</code> 用在告警里</strong> —— 窗口边缘抖动剧烈,误报漏报</li><li><strong>分母可能为 0 不写 <code>or vector(0)</code></strong> —— NaN 让告警永远不响</li><li><strong>跨 Prom 用原始 metric 算 PromQL</strong> —— 时间戳不同步,精度丢</li><li><strong>PromQL 写 30 行嵌套</strong> —— 这是业务逻辑,该用 SQL 不是 PromQL</li><li><strong>没 Recording Rule</strong> —— 复杂查询每次重算,Prom CPU 飙</li><li><strong>不做 path normalize</strong> —— cardinality 爆炸,PromQL 巨慢</li><li><strong>Counter Reset 没考虑</strong> —— 高频重启时 rate 不准</li><li><strong>Stale Marker 5 min 假象</strong> —— 死掉的 series 还在 dashboard 显示</li><li><strong>跨 endpoint 聚合时 P99 求平均</strong> —— &quot;平均 P99&quot; 数学上不存在</li><li><strong>subquery 滥用</strong> —— <code>[24h:1m]</code> 是核武器,不是默认工具</li><li><strong>dashboard 没显式聚合,100 条线挤一起</strong> —— 啥都看不出来</li></ol><hr><h2 id="十一、本篇的硬指标" tabindex="-1">十一、本篇的硬指标 <a class="header-anchor" href="#十一、本篇的硬指标" aria-label="Permalink to &quot;十一、本篇的硬指标&quot;">​</a></h2><p>看完这一篇,你应该能在白板前讲清楚:</p><ul><li><strong><code>rate / irate / increase</code> 三者的语义和适用场景</strong>——给具体业务问题能 5 秒选出对的函数</li><li><strong>rate 窗口的最小约束</strong>——<code>[X] ≥ 4 × scrape_interval</code>,且<strong>告警永远用 5m+</strong></li><li><strong><code>histogram_quantile</code> 的正确写法</strong>——口诀&quot;先 rate,再 sum by le,最后 quantile&quot;</li><li><strong>错误率 / QPS / P99 / CPU / 容量预测 五条核心 PromQL</strong>——直接能写出来不用查文档</li><li><strong>counter reset / stale marker / 跨 Prom 聚合 三个隐藏陷阱</strong>——能在 code review 时识别</li><li><strong>何时该用 PromQL,何时该换工具</strong>(SQL / Trace / 数仓)</li></ul><p>并且能给团队<strong>写一份 PromQL 模板库</strong>——RED 指标 / USE 指标 / 容量预测 各 1 条标准 query,新人直接复用,不再各写各的。</p><hr><h2 id="十二、第二层-metrics-三连小结" tabindex="-1">十二、第二层 Metrics 三连小结 <a class="header-anchor" href="#十二、第二层-metrics-三连小结" aria-label="Permalink to &quot;十二、第二层 Metrics 三连小结&quot;">​</a></h2><p>到这里,<strong>Metrics 这一层的三篇连起来形成了一张完整地图</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>05-Metrics 心智 (打什么)</span></span>
<span class="line"><span>   ├─ Counter / Gauge / Histogram / Summary</span></span>
<span class="line"><span>   ├─ avg 是骗人的,长尾用 Histogram</span></span>
<span class="line"><span>   ├─ cardinality 是底线,user_id 不进 label</span></span>
<span class="line"><span>   └─ 命名带 _seconds / _bytes / _total</span></span>
<span class="line"><span></span></span>
<span class="line"><span>06-Prometheus 深入 (怎么抓)</span></span>
<span class="line"><span>   ├─ Pull 模型为什么在 K8s 简单</span></span>
<span class="line"><span>   ├─ Service Discovery 三种</span></span>
<span class="line"><span>   ├─ scrape_interval 15s 是标准</span></span>
<span class="line"><span>   ├─ Recording Rule 命名 level:metric:operations</span></span>
<span class="line"><span>   ├─ Federation vs Remote Write 边界</span></span>
<span class="line"><span>   └─ 单实例容量上限 2-3M series</span></span>
<span class="line"><span></span></span>
<span class="line"><span>07-PromQL 实战 (怎么查) ← 这一篇</span></span>
<span class="line"><span>   ├─ rate / irate / increase 三选一</span></span>
<span class="line"><span>   ├─ histogram_quantile 必须 by le</span></span>
<span class="line"><span>   ├─ 5 条核心 PromQL 模板</span></span>
<span class="line"><span>   ├─ counter reset / stale / 跨 Prom 三大陷阱</span></span>
<span class="line"><span>   └─ Recording Rule 让 dashboard 飞起来</span></span></code></pre></div><p><strong>这三件事一起到位,你团队的 Metrics 这一层就稳了</strong>。<strong>任何一件漏一项,这三件都白做</strong>——比如打了 Histogram 但 PromQL 用 avg,白搭;PromQL 写对但用 Summary,白搭;两件都对但没 cardinality 治理,Prometheus OOM 一切归零。<strong>这三篇是一个套件,不是单独阅读</strong>。</p><hr><p>下一篇:<code>08-VictoriaMetrics-Thanos-Mimir.md</code>,讲完单实例 Prometheus,讲&quot;超出单实例容量后怎么办&quot;——<strong>VictoriaMetrics / Thanos / Mimir 三选一</strong>,讲清楚三者的设计哲学差别(VM 是单二进制重写,Thanos 是 Prom + 对象存储,Mimir 是 Cortex 的演进)、<strong>长期存储的存储分层</strong>(本地热存 / 对象存储冷存)、<strong>高 cardinality 友好度比较</strong>、<strong>多机房 PromQL 查询的 Thanos Query 模式</strong>——以及<strong>为什么 2026 年 90% 中型团队的答案是 VictoriaMetrics</strong>(开源、单二进制、扛 cardinality)。<strong>这是 Metrics 这一层的&quot;长存储&quot;答案,看完整 Metrics 章节才闭环</strong>。</p>`,224)])])}const g=a(t,[["render",i]]);export{u as __pageData,g as default};
