import{c as n,Q as a,j as p,m as i}from"./chunks/framework.CBiVa4O3.js";const d=JSON.parse('{"title":"SLI / SLO / SLA:怎么定指标 / 用户视角的 SLI / 错误预算的算术","description":"","frontmatter":{},"headers":[],"relativePath":"../devopsLearning/13-SLI-SLO-SLA.md","filePath":"../devopsLearning/13-SLI-SLO-SLA.md","lastUpdated":1778496697000}'),t={name:"../devopsLearning/13-SLI-SLO-SLA.md"};function l(e,s,o,r,g,h){return a(),p("div",null,[...s[0]||(s[0]=[i(`<h1 id="sli-slo-sla-怎么定指标-用户视角的-sli-错误预算的算术" tabindex="-1">SLI / SLO / SLA:怎么定指标 / 用户视角的 SLI / 错误预算的算术 <a class="header-anchor" href="#sli-slo-sla-怎么定指标-用户视角的-sli-错误预算的算术" aria-label="Permalink to &quot;SLI / SLO / SLA:怎么定指标 / 用户视角的 SLI / 错误预算的算术&quot;">​</a></h1><p>讲 SLI / SLO 的文章 90% 都从「Google SRE 三个 9」这种数字游戏起手——这是错的。<strong>SLO 不是数字游戏,是把&quot;可靠性&quot;从工程师的脑子里搬到工程承诺里的工具</strong>——它逼着你回答:<strong>&quot;什么算坏 / 坏到什么程度算违约 / 谁来踩刹车&quot;</strong>。05-12 篇讲完可观测性四件套(metrics / logs / traces / profiles),<strong>收集来这么多数据,该怎么用</strong>?<strong>SLO 是答案</strong>——<strong>它把数据变成决策</strong>:超预算停发布、有余额激进上线、没争议地砍掉不该做的功能。这一篇是第三层(SLO 与告警工程)的开篇,<strong>它讲清楚之后,后面 14-17 篇的告警工程才能展开</strong>。</p><blockquote><p>一句话先记住:<strong>SLI 是测量、SLO 是承诺、SLA 是合同</strong>——三个词分别属于工程、产品、法务三个语境。<strong>SRE 工作 80% 的争吵根因都是&quot;工程师讨论 SLI 时用 SLO 的语气,产品讨论 SLO 时用 SLA 的语气,法务讨论 SLA 时用工程师听不懂的话&quot;</strong>。<strong>这三个概念必须分清楚</strong>——分不清楚的团队,告警永远在吵 / 发布永远在赌 / 复盘永远在吵谁的锅。</p></blockquote><hr><h2 id="一、sli-slo-sla-三件套到底是什么" tabindex="-1">一、SLI / SLO / SLA 三件套到底是什么 <a class="header-anchor" href="#一、sli-slo-sla-三件套到底是什么" aria-label="Permalink to &quot;一、SLI / SLO / SLA 三件套到底是什么&quot;">​</a></h2><p>这一节讲清楚三个概念的精确定义,<strong>所有后面的工程实践都建立在这个定义上</strong>。</p><h3 id="_1-1-sli-service-level-indicator——客观可测量" tabindex="-1">1.1 SLI:Service Level Indicator——客观可测量 <a class="header-anchor" href="#_1-1-sli-service-level-indicator——客观可测量" aria-label="Permalink to &quot;1.1 SLI:Service Level Indicator——客观可测量&quot;">​</a></h3><p><strong>SLI = 服务的&quot;质量指标&quot;——一个具体数字,从生产数据中算出来</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>   SLI 的定义模板:</span></span>
<span class="line"><span>   ────────────────────────────────────────</span></span>
<span class="line"><span>   &quot;好&quot;事件数  / &quot;总&quot;事件数  =  某个百分比</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   例子:</span></span>
<span class="line"><span>   ─────────────────────────────────────</span></span>
<span class="line"><span>   SLI_1: 过去 30 天中,HTTP 状态码 &lt; 500 的请求 / 总请求</span></span>
<span class="line"><span>   SLI_2: 过去 30 天中,响应时间 &lt; 500ms 的请求 / 总请求</span></span>
<span class="line"><span>   SLI_3: 过去 30 天中,订单创建成功的请求 / 总请求</span></span></code></pre></div><p><strong>SLI 的本质是分数</strong>——分子是&quot;好&quot;的事件数,分母是&quot;总&quot;事件数。<strong>任何一个 SLI 都必须能拆成这两个数</strong>,不能拆的不是 SLI(后面会讲反例)。</p><h3 id="_1-2-slo-service-level-objective——内部承诺" tabindex="-1">1.2 SLO:Service Level Objective——内部承诺 <a class="header-anchor" href="#_1-2-slo-service-level-objective——内部承诺" aria-label="Permalink to &quot;1.2 SLO:Service Level Objective——内部承诺&quot;">​</a></h3><p><strong>SLO = 团队内部承诺 SLI 应该达到的目标</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>   SLO 的定义模板:</span></span>
<span class="line"><span>   ────────────────────────────────────────</span></span>
<span class="line"><span>   在某个时间窗口里,SLI ≥ 某个阈值</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   例子:</span></span>
<span class="line"><span>   ─────────────────────────────────────</span></span>
<span class="line"><span>   SLO_1: 过去 30 天里,SLI_1 ≥ 99.9%</span></span>
<span class="line"><span>        (30 天里至少 99.9% 的请求 status &lt; 500)</span></span>
<span class="line"><span>   SLO_2: 过去 30 天里,SLI_2 ≥ 99.0%</span></span>
<span class="line"><span>        (30 天里至少 99% 的请求 &lt; 500ms)</span></span></code></pre></div><p><strong>SLO 是数字而已</strong>——但它的意义是**&quot;低于这个数字,团队会采取行动&quot;**(停发布 / 加人 / 改架构)。<strong>没有行动的 SLO 是装饰品</strong>。</p><h3 id="_1-3-sla-service-level-agreement——对外合同" tabindex="-1">1.3 SLA:Service Level Agreement——对外合同 <a class="header-anchor" href="#_1-3-sla-service-level-agreement——对外合同" aria-label="Permalink to &quot;1.3 SLA:Service Level Agreement——对外合同&quot;">​</a></h3><p><strong>SLA = 写进合同 / 服务条款里的法律承诺,违反了要赔钱</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>   SLA 的定义模板:</span></span>
<span class="line"><span>   ────────────────────────────────────────</span></span>
<span class="line"><span>   &quot;我们承诺过去 N 天里 SLI ≥ X%,</span></span>
<span class="line"><span>    达不到就赔偿客户 / 退款 / 减免 Y&quot;</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   例子:</span></span>
<span class="line"><span>   ─────────────────────────────────────</span></span>
<span class="line"><span>   SLA_1: 月度可用性 ≥ 99.0%,</span></span>
<span class="line"><span>          如果低于这个值,赔月费的 10%</span></span>
<span class="line"><span>   SLA_2: 月度可用性 ≥ 99.9%,</span></span>
<span class="line"><span>          如果低于这个值,赔月费的 30%</span></span></code></pre></div><p><strong>SLA 涉及法律责任和金钱</strong>——通常<strong>比 SLO 宽松一档</strong>(SLA 99% / SLO 99.5%):<strong>SLO 是内部&quot;应该做到&quot;,SLA 是&quot;做不到要赔钱&quot;——内部目标必须比赔钱线高,留缓冲</strong>。</p><h3 id="_1-4-三者的关系图" tabindex="-1">1.4 三者的关系图 <a class="header-anchor" href="#_1-4-三者的关系图" aria-label="Permalink to &quot;1.4 三者的关系图&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>   ┌──────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>   │  现实世界(数据)                                          │</span></span>
<span class="line"><span>   │       SLI = 客观测量 = 99.92%(过去 30 天)                 │</span></span>
<span class="line"><span>   │       ▲                                                   │</span></span>
<span class="line"><span>   │       │ 测量                                              │</span></span>
<span class="line"><span>   ├───────┼──────────────────────────────────────────────────┤</span></span>
<span class="line"><span>   │  工程承诺                                                  │</span></span>
<span class="line"><span>   │       SLO = 99.9%(团队对自己的目标)                       │</span></span>
<span class="line"><span>   │       ▲                                                   │</span></span>
<span class="line"><span>   │       │ 留缓冲                                            │</span></span>
<span class="line"><span>   ├───────┼──────────────────────────────────────────────────┤</span></span>
<span class="line"><span>   │  对外合同                                                  │</span></span>
<span class="line"><span>   │       SLA = 99.0%(对客户的合同承诺)                       │</span></span>
<span class="line"><span>   │       ▲                                                   │</span></span>
<span class="line"><span>   │       │ 法律责任                                          │</span></span>
<span class="line"><span>   └───────────────────────────────────────────────────────────┘</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   SLI &gt; SLO &gt; SLA  ← 健康的 SaaS 应该长这样</span></span></code></pre></div><p><strong>典型错误</strong>:<strong>很多团队把 SLA 当 SLO 用</strong>——比如对客户承诺 99.99%,内部目标也设 99.99%,<strong>这等于没留缓冲</strong>,<strong>一旦 SLI 跌到 99.99% 以下就直接违约</strong>。<strong>正确姿势</strong>:<strong>SLO 比 SLA 高 1-2 个 9</strong>——SLA 99% / SLO 99.9% / SLI 实际跑 99.95%。</p><hr><h2 id="二、怎么定-sli-用户视角-不要用-cpu" tabindex="-1">二、怎么定 SLI:用户视角,不要用 CPU <a class="header-anchor" href="#二、怎么定-sli-用户视角-不要用-cpu" aria-label="Permalink to &quot;二、怎么定 SLI:用户视角,不要用 CPU&quot;">​</a></h2><p><strong>这一节是 SLO 工程最关键的一节</strong>——SLI 选错了,SLO 全是噪音。</p><h3 id="_2-1-sli-必须从用户视角选" tabindex="-1">2.1 SLI 必须从用户视角选 <a class="header-anchor" href="#_2-1-sli-必须从用户视角选" aria-label="Permalink to &quot;2.1 SLI 必须从用户视角选&quot;">​</a></h3><p><strong>核心原则</strong>:<strong>SLI 测的是&quot;用户感受到的服务质量&quot;,不是&quot;系统的资源使用&quot;</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>   ┌───────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>   │  错的 SLI(系统视角):                                  │</span></span>
<span class="line"><span>   │  ─────────────────────────────                         │</span></span>
<span class="line"><span>   │  ✗ CPU 使用率 &lt; 80%                                    │</span></span>
<span class="line"><span>   │  ✗ 内存使用率 &lt; 90%                                    │</span></span>
<span class="line"><span>   │  ✗ Pod 数量 &gt; 5                                        │</span></span>
<span class="line"><span>   │  ✗ 数据库连接池 &lt; 80%                                  │</span></span>
<span class="line"><span>   │                                                        │</span></span>
<span class="line"><span>   │  为什么错:用户不在乎你 CPU 多少,                       │</span></span>
<span class="line"><span>   │           他们在乎&quot;我的请求成不成功&quot;                    │</span></span>
<span class="line"><span>   ├───────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>   │  对的 SLI(用户视角):                                  │</span></span>
<span class="line"><span>   │  ─────────────────────────────                         │</span></span>
<span class="line"><span>   │  ✓ HTTP 请求成功率(status &lt; 500)                     │</span></span>
<span class="line"><span>   │  ✓ 请求延迟 P99 &lt; 500ms                                │</span></span>
<span class="line"><span>   │  ✓ 订单创建到完成的端到端时间 &lt; 30s                    │</span></span>
<span class="line"><span>   │  ✓ 数据可用性(查询能返回正确结果)                    │</span></span>
<span class="line"><span>   └───────────────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>为什么 CPU 不能当 SLI</strong>:<strong>CPU 90% 时用户可能完全正常(批处理服务)/ CPU 30% 时用户可能很惨(GC 抖动)</strong>——<strong>CPU 和用户感受不是一一对应</strong>。把 CPU 当 SLI = 监控了&quot;系统忙不忙&quot;,<strong>没监控&quot;用户爽不爽&quot;</strong>。</p><h3 id="_2-2-四个维度的-sli" tabindex="-1">2.2 四个维度的 SLI <a class="header-anchor" href="#_2-2-四个维度的-sli" aria-label="Permalink to &quot;2.2 四个维度的 SLI&quot;">​</a></h3><p>Google SRE Book 给的四个用户视角维度,<strong>中型团队也通用</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>   ┌─────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>   │  1. 可用性(Availability)                                    │</span></span>
<span class="line"><span>   │  ─────────────────────────                                   │</span></span>
<span class="line"><span>   │  服务能不能用?请求成功还是失败?                             │</span></span>
<span class="line"><span>   │  典型 SLI:status &lt; 500 的请求占比 / 总请求                  │</span></span>
<span class="line"><span>   │  适用:所有 API 服务                                        │</span></span>
<span class="line"><span>   ├─────────────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>   │  2. 延迟(Latency)                                          │</span></span>
<span class="line"><span>   │  ─────────────────────────                                   │</span></span>
<span class="line"><span>   │  服务用起来快不快?                                          │</span></span>
<span class="line"><span>   │  典型 SLI:响应时间 &lt; 阈值 的请求占比                       │</span></span>
<span class="line"><span>   │  适用:用户交互服务、API 服务                                │</span></span>
<span class="line"><span>   ├─────────────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>   │  3. 正确性(Correctness / Quality)                          │</span></span>
<span class="line"><span>   │  ─────────────────────────                                   │</span></span>
<span class="line"><span>   │  返回的数据对不对?                                          │</span></span>
<span class="line"><span>   │  典型 SLI:订单金额正确的订单数 / 总订单数                  │</span></span>
<span class="line"><span>   │  适用:涉及业务正确性的关键服务(支付 / 订单 / 推荐)          │</span></span>
<span class="line"><span>   ├─────────────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>   │  4. 容量 / 吞吐(Throughput / Capacity)                      │</span></span>
<span class="line"><span>   │  ─────────────────────────                                   │</span></span>
<span class="line"><span>   │  能不能扛得住目标流量?                                       │</span></span>
<span class="line"><span>   │  典型 SLI:能处理的 QPS / 目标 QPS                          │</span></span>
<span class="line"><span>   │  适用:批处理 / 数据管道 / 消息队列                          │</span></span>
<span class="line"><span>   └─────────────────────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>90% 中型团队的服务用前两个就够</strong>——<strong>可用性 + 延迟</strong>。<strong>正确性和容量是高阶</strong>,<strong>业务关键服务才上</strong>。</p><h3 id="_2-3-不要把-4xx-和-5xx-混在一起" tabindex="-1">2.3 不要把 4xx 和 5xx 混在一起 <a class="header-anchor" href="#_2-3-不要把-4xx-和-5xx-混在一起" aria-label="Permalink to &quot;2.3 不要把 4xx 和 5xx 混在一起&quot;">​</a></h3><p><strong>最常见的 SLI 错误</strong>:<strong>&quot;成功率 = status &lt; 400&quot;</strong>——这是<strong>错的</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>   原因:</span></span>
<span class="line"><span>   ─────────────────────────────────────────</span></span>
<span class="line"><span>   - 4xx 是客户端错误(参数错、权限错、找不到资源)</span></span>
<span class="line"><span>     → 服务&quot;按规定返回了 4xx&quot;,对用户来说这是预期行为</span></span>
<span class="line"><span>     → 不应该计入&quot;我服务挂了&quot;</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   - 5xx 是服务端错误(代码 bug / 依赖崩 / 超时)</span></span>
<span class="line"><span>     → 服务&quot;应该返回结果但失败了&quot;</span></span>
<span class="line"><span>     → 这才是&quot;挂了&quot;</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   - 把 4xx 算进失败:</span></span>
<span class="line"><span>     比如客户端在写错参数刷接口</span></span>
<span class="line"><span>     → 4xx 比例飙升</span></span>
<span class="line"><span>     → SLO 触发,P0 告警,SRE 起夜</span></span>
<span class="line"><span>     → 起来一看是客户端 bug,你没挂</span></span>
<span class="line"><span>     → 真正出问题时反而被噪音淹没</span></span></code></pre></div><p><strong>正确公式</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>   success_rate = (count(status &lt; 500) - count(401, 403)) / count(all)</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   说明:</span></span>
<span class="line"><span>   - status &lt; 500 主流&quot;好&quot;事件</span></span>
<span class="line"><span>   - 但 401 / 403 在&quot;非预期路径&quot;时也可能是 bug,要看场景</span></span>
<span class="line"><span>   - 极端严格:只把 200 / 201 / 204 / 301 / 302 当好</span></span></code></pre></div><p><strong>经验</strong>:<strong>SLI 公式写下来之后,模拟几种场景跑一遍</strong>——&quot;客户端在刷 404 / 攻击者刷 401 / 业务异常 422&quot;——这些场景下 SLI 应该不动,<strong>动了就是定义错</strong>。</p><h3 id="_2-4-p99-p95-p99-9-怎么选" tabindex="-1">2.4 P99 / P95 / P99.9 怎么选 <a class="header-anchor" href="#_2-4-p99-p95-p99-9-怎么选" aria-label="Permalink to &quot;2.4 P99 / P95 / P99.9 怎么选&quot;">​</a></h3><p><strong>延迟 SLI 不要用平均值</strong>——05 篇 Metrics 心智讲过原因。<strong>用分位数(percentile)</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>   分位数选择:</span></span>
<span class="line"><span>   ─────────────────────────────────────────</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   P50(中位数):用户感觉慢的指标,但忽略尾部</span></span>
<span class="line"><span>                → 不当 SLI,只看趋势</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   P95:95% 用户的体验,**留 5% 慢请求**</span></span>
<span class="line"><span>        → 适合内部工具、非关键路径</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   P99:99% 用户的体验,**留 1% 慢请求**</span></span>
<span class="line"><span>        → 适合主流 API,**90% 中型团队的默认选择**</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   P99.9:99.9% 用户体验,**只留 0.1% 慢请求**</span></span>
<span class="line"><span>        → 适合关键业务(支付 / 登录),**很贵**</span></span></code></pre></div><p><strong>为什么 P99 通常够</strong>:<strong>P99 = 100 个用户里只有 1 个慢请求</strong>——<strong>对大多数业务这个程度的&quot;差用户体验&quot;是可接受</strong>。<strong>P99.9 意味着 1000 个里只有 1 个慢</strong>——<strong>每加一个 9 工程成本翻倍</strong>(后面错误预算章节展开)。</p><hr><h2 id="三、sli-的常见模式" tabindex="-1">三、SLI 的常见模式 <a class="header-anchor" href="#三、sli-的常见模式" aria-label="Permalink to &quot;三、SLI 的常见模式&quot;">​</a></h2><p><strong>SLI 定义有三种典型模式</strong>——这一节讲清楚选哪个的依据。</p><h3 id="_3-1-request-based-请求级别" tabindex="-1">3.1 Request-based:请求级别 <a class="header-anchor" href="#_3-1-request-based-请求级别" aria-label="Permalink to &quot;3.1 Request-based:请求级别&quot;">​</a></h3><p><strong>最常见</strong>——<strong>直接用单个请求的成功 / 失败计数</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>   公式:</span></span>
<span class="line"><span>   SLI = count(good_requests) / count(all_requests)</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   时间窗口:30 天滑动窗口</span></span>
<span class="line"><span>   ──────────────────────────────────────</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   例:</span></span>
<span class="line"><span>   过去 30 天的所有 HTTP 请求:</span></span>
<span class="line"><span>     总请求:1,000,000</span></span>
<span class="line"><span>     status &lt; 500:999,500</span></span>
<span class="line"><span>     SLI = 999,500 / 1,000,000 = 99.95%</span></span></code></pre></div><p><strong>适合</strong>:<strong>所有 HTTP API / RPC 服务</strong>——主流场景。</p><p><strong>短板</strong>:<strong>低流量服务统计不稳</strong>——一天才 1000 个请求,<strong>1 个失败就是 0.1%</strong>,SLI 抖动非常大。</p><h3 id="_3-2-window-based-窗口级别" tabindex="-1">3.2 Window-based:窗口级别 <a class="header-anchor" href="#_3-2-window-based-窗口级别" aria-label="Permalink to &quot;3.2 Window-based:窗口级别&quot;">​</a></h3><p><strong>按时间窗口切片</strong>——<strong>每个窗口看一次,统计&quot;好&quot;窗口的比例</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>   公式:</span></span>
<span class="line"><span>   SLI = count(good_windows) / count(all_windows)</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   &quot;good window&quot; 定义:</span></span>
<span class="line"><span>   ─────────────────────</span></span>
<span class="line"><span>   一个 1 分钟的窗口,如果该窗口内 success_rate ≥ 95%,</span></span>
<span class="line"><span>   就算&quot;好&quot;窗口</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   ──────────────────────────────────────</span></span>
<span class="line"><span>   过去 30 天 = 30 × 24 × 60 = 43,200 个 1 分钟窗口</span></span>
<span class="line"><span>   好的窗口:43,150 个</span></span>
<span class="line"><span>   SLI = 43,150 / 43,200 = 99.88%</span></span></code></pre></div><p><strong>适合</strong>:<strong>低流量服务</strong>(窗口比单个请求稳定)/ <strong>持续性服务</strong>(消息队列 / 数据管道,没法按&quot;请求&quot;算)。</p><p><strong>短板</strong>:<strong>1 个差窗口被记 = 几百个失败请求被忽略</strong>——粒度比 request-based 粗。</p><h3 id="_3-3-user-journey-based-用户旅程级别" tabindex="-1">3.3 User-journey-based:用户旅程级别 <a class="header-anchor" href="#_3-3-user-journey-based-用户旅程级别" aria-label="Permalink to &quot;3.3 User-journey-based:用户旅程级别&quot;">​</a></h3><p><strong>最贴近用户感受</strong>——<strong>完整的业务流程</strong>(下单 / 支付 / 注册)是否成功。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>   公式:</span></span>
<span class="line"><span>   SLI = count(successful_journeys) / count(all_journey_attempts)</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   &quot;successful journey&quot; 定义:</span></span>
<span class="line"><span>   ─────────────────────────────────</span></span>
<span class="line"><span>   用户点&quot;下单&quot; → 选商品 → 填地址 → 选支付 → 完成</span></span>
<span class="line"><span>   全程:</span></span>
<span class="line"><span>   - 每一步都成功</span></span>
<span class="line"><span>   - 总耗时 &lt; 30s</span></span>
<span class="line"><span>   - 没有报错跳转</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   就算 successful_journey</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   ──────────────────────────────────────</span></span>
<span class="line"><span>   一天 10000 次下单尝试,9500 次走完完整流程</span></span>
<span class="line"><span>   SLI = 9500 / 10000 = 95%</span></span></code></pre></div><p><strong>适合</strong>:<strong>核心业务流程</strong>——<strong>比 request-based 更接近&quot;用户爽不爽&quot;</strong>。</p><p><strong>短板</strong>:<strong>实现难</strong>——需要 trace / event 把跨服务跨步骤的事件关联起来。<strong>实施成本高,但 SLI 准确度也最高</strong>。</p><h3 id="_3-4-选型决策树" tabindex="-1">3.4 选型决策树 <a class="header-anchor" href="#_3-4-选型决策树" aria-label="Permalink to &quot;3.4 选型决策树&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                  你要监控什么?</span></span>
<span class="line"><span>                       │</span></span>
<span class="line"><span>        ┌──────────────┼──────────────┐</span></span>
<span class="line"><span>        ▼              ▼              ▼</span></span>
<span class="line"><span>   单个 API         一段用户       低 QPS 服务</span></span>
<span class="line"><span>   是否成功         旅程是否走完    或持续性服务</span></span>
<span class="line"><span>        │              │              │</span></span>
<span class="line"><span>        ▼              ▼              ▼</span></span>
<span class="line"><span>   Request-based   User-journey   Window-based</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   ────────────────────────────────────────</span></span>
<span class="line"><span>   90% 团队从 Request-based 起步</span></span>
<span class="line"><span>   核心业务流程上 User-journey</span></span>
<span class="line"><span>   不规律小流量服务上 Window-based</span></span></code></pre></div><p><strong>实操经验</strong>:<strong>第一个 SLO 永远是 Request-based</strong>——简单、易实施、数据现成。<strong>先把这个跑通,再上 User-journey</strong>。</p><hr><h2 id="四、错误预算-必须背的算术" tabindex="-1">四、错误预算:必须背的算术 <a class="header-anchor" href="#四、错误预算-必须背的算术" aria-label="Permalink to &quot;四、错误预算:必须背的算术&quot;">​</a></h2><p><strong>这一节是 SLO 工程最反直觉的一节</strong>——<strong>99.9% 一个月只有 43 分钟</strong>,<strong>这个数字算不清楚的人,SLO 永远是装饰品</strong>。</p><h3 id="_4-1-错误预算的定义" tabindex="-1">4.1 错误预算的定义 <a class="header-anchor" href="#_4-1-错误预算的定义" aria-label="Permalink to &quot;4.1 错误预算的定义&quot;">​</a></h3><p><strong>错误预算 = 1 - SLO</strong>。如果 SLO = 99.9%,<strong>错误预算 = 0.1%</strong>——<strong>你&quot;被允许出错&quot;的额度</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>   一个月 = 30 天 × 24 小时 × 60 分钟 = 43,200 分钟</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   ┌─────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>   │  SLO     | 错误预算 | 一个月允许&quot;坏&quot;的时长          │</span></span>
<span class="line"><span>   │  ────────|──────────|───────────────────             │</span></span>
<span class="line"><span>   │  99%     |  1%      |  432 分钟 ≈ **7.2 小时**       │</span></span>
<span class="line"><span>   │  99.5%   |  0.5%    |  216 分钟 ≈ **3.6 小时**       │</span></span>
<span class="line"><span>   │  99.9%   |  0.1%    |   43.2 分钟                    │</span></span>
<span class="line"><span>   │  99.95%  |  0.05%   |   21.6 分钟                    │</span></span>
<span class="line"><span>   │  99.99%  |  0.01%   |   **4.32 分钟**                │</span></span>
<span class="line"><span>   │  99.999% |  0.001%  |   **0.432 分钟 ≈ 26 秒**       │</span></span>
<span class="line"><span>   └─────────────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>这张表必须背</strong>——<strong>你和产品 / 老板讨论 SLO 时,所有人都需要心里有这个数</strong>。</p><h3 id="_4-2-每加一个-9-成本-×-10" tabindex="-1">4.2 每加一个 9 成本 × 10 <a class="header-anchor" href="#_4-2-每加一个-9-成本-×-10" aria-label="Permalink to &quot;4.2 每加一个 9 成本 × 10&quot;">​</a></h3><p>这是 SRE 圈的&quot;摩尔定律&quot;——<strong>SLO 每多一个 9,工程投入大约要 × 10</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>   ┌──────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>   │  99%      → 99.9%                                     │</span></span>
<span class="line"><span>   │  能做到的事:                                          │</span></span>
<span class="line"><span>   │   - 单机房 + HA(主从切换)                            │</span></span>
<span class="line"><span>   │   - 定期巡检                                          │</span></span>
<span class="line"><span>   │   - 业务高峰人盯着                                    │</span></span>
<span class="line"><span>   │  工程投入:1 个 SRE                                   │</span></span>
<span class="line"><span>   ├──────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>   │  99.9%   → 99.99%                                     │</span></span>
<span class="line"><span>   │  能做到的事:                                          │</span></span>
<span class="line"><span>   │   - 多机房热备 + 自动故障转移                          │</span></span>
<span class="line"><span>   │   - 灰度发布 + 自动回滚                                │</span></span>
<span class="line"><span>   │   - 7×24 On-call + Runbook                            │</span></span>
<span class="line"><span>   │   - 混沌工程演练                                       │</span></span>
<span class="line"><span>   │  工程投入:5+ SRE                                      │</span></span>
<span class="line"><span>   ├──────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>   │  99.99%  → 99.999%                                    │</span></span>
<span class="line"><span>   │  能做到的事:                                          │</span></span>
<span class="line"><span>   │   - 全球多区 active-active                             │</span></span>
<span class="line"><span>   │   - 单元化部署 + 流量染色                              │</span></span>
<span class="line"><span>   │   - 自动化恢复(自愈系统)                              │</span></span>
<span class="line"><span>   │   - 自家硬件 / 网络 / 调度系统                         │</span></span>
<span class="line"><span>   │  工程投入:20+ SRE,几个亿基础设施                     │</span></span>
<span class="line"><span>   └──────────────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>反过来推</strong>:<strong>中型团队(10-100 人)的合理 SLO 上限是 99.95%</strong>。<strong>敢承诺 99.99% 的中型团队几乎都做不到</strong>——<strong>Google / AWS / Azure 这种巨头才有 99.99% 的工程能力</strong>,<strong>中型团队声称 99.99% 都是市场话术,内部 SLO 没人在守</strong>。</p><h3 id="_4-3-错误预算怎么用" tabindex="-1">4.3 错误预算怎么用 <a class="header-anchor" href="#_4-3-错误预算怎么用" aria-label="Permalink to &quot;4.3 错误预算怎么用&quot;">​</a></h3><p><strong>这是 SLO 真正变成&quot;决策工具&quot;的地方</strong>——<strong>错误预算余额决定团队的行为</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>   ┌──────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>   │  情景 A:错误预算有余                                  │</span></span>
<span class="line"><span>   │  ─────────────────────────                            │</span></span>
<span class="line"><span>   │  当月已用 &lt; 50% 错误预算                               │</span></span>
<span class="line"><span>   │  → 团队可以&quot;激进&quot;:                                    │</span></span>
<span class="line"><span>   │     - 上风险大的特性                                   │</span></span>
<span class="line"><span>   │     - 大幅重构                                         │</span></span>
<span class="line"><span>   │     - 灰度激进(50% / 100% 直接铺)                    │</span></span>
<span class="line"><span>   │     - 不要求 100% 完美的发布                           │</span></span>
<span class="line"><span>   ├──────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>   │  情景 B:错误预算紧                                    │</span></span>
<span class="line"><span>   │  ─────────────────────────                            │</span></span>
<span class="line"><span>   │  当月已用 50%-80% 错误预算                             │</span></span>
<span class="line"><span>   │  → 团队&quot;保守&quot;:                                        │</span></span>
<span class="line"><span>   │     - 灰度更谨慎(1% / 5% / 25%)                       │</span></span>
<span class="line"><span>   │     - 高风险特性延后                                   │</span></span>
<span class="line"><span>   │     - 投入更多自动化测试                               │</span></span>
<span class="line"><span>   ├──────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>   │  情景 C:错误预算耗尽                                  │</span></span>
<span class="line"><span>   │  ─────────────────────────                            │</span></span>
<span class="line"><span>   │  当月已用 ≥ 100% 错误预算                              │</span></span>
<span class="line"><span>   │  → 团队&quot;停发布&quot;:                                      │</span></span>
<span class="line"><span>   │     - 只允许 bug fix / 安全补丁                        │</span></span>
<span class="line"><span>   │     - 不上新特性                                       │</span></span>
<span class="line"><span>   │     - 全员投入做可靠性提升                             │</span></span>
<span class="line"><span>   │     - 直到下个月预算重置                               │</span></span>
<span class="line"><span>   └──────────────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>错误预算的政治学</strong>:<strong>这套机制能用的前提是&quot;老板支持停发布&quot;</strong>——<strong>如果错误预算超了老板还要求继续发,SLO 就是装饰品</strong>。<strong>17 篇专门讲这个政治学</strong>,这里只点到为止。</p><h3 id="_4-4-燃烧率-burn-rate-预算消耗速度" tabindex="-1">4.4 燃烧率(Burn Rate):预算消耗速度 <a class="header-anchor" href="#_4-4-燃烧率-burn-rate-预算消耗速度" aria-label="Permalink to &quot;4.4 燃烧率(Burn Rate):预算消耗速度&quot;">​</a></h3><p><strong>错误预算不是按天平均消耗的</strong>——<strong>故障会&quot;集中消耗&quot;</strong>。<strong>燃烧率 = 实际消耗速度 / 平均消耗速度</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>   定义:</span></span>
<span class="line"><span>   ────────────────────────</span></span>
<span class="line"><span>   burn_rate = (1 - SLI_window) / (1 - SLO)</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   解读:</span></span>
<span class="line"><span>   ─────────────────────────────────────</span></span>
<span class="line"><span>   burn_rate = 1   → 按正常速度消耗,30 天刚好消耗完</span></span>
<span class="line"><span>   burn_rate = 10  → 比正常快 10 倍消耗,3 天消耗完</span></span>
<span class="line"><span>   burn_rate = 100 → 比正常快 100 倍,7 小时消耗完</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   实际意义:</span></span>
<span class="line"><span>   ─────────────────────────────────────</span></span>
<span class="line"><span>   burn_rate &gt; 14:1 小时窗口里,2 天就把月预算烧光</span></span>
<span class="line"><span>   burn_rate &gt; 6:6 小时窗口里,5 天烧光</span></span>
<span class="line"><span>   → 这两个阈值是 Google SRE 的&quot;多窗口多燃烧率告警&quot;基础</span></span>
<span class="line"><span>   → 15 篇告警工程会详细讲</span></span></code></pre></div><p><strong>为什么要看燃烧率</strong>:<strong>SLO 30 天窗口太长,等 SLI 真的跌穿才告警 → 已经晚了</strong>。<strong>燃烧率能在故障的前几分钟就预警</strong>——<strong>&quot;这个速度烧下去,3 天预算就没了,立刻干预&quot;</strong>。</p><hr><h2 id="五、slo-文档模板" tabindex="-1">五、SLO 文档模板 <a class="header-anchor" href="#五、slo-文档模板" aria-label="Permalink to &quot;五、SLO 文档模板&quot;">​</a></h2><p><strong>SLO 必须写成文档</strong>——口头共识不算 SLO,<strong>只有写下来的才能被维护</strong>。</p><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># slo/order-service.yaml</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">service</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">order-service</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">team</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">order-team</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">owner</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">alice@company.com</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">reviewed_at</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">2026-05-11</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">review_cycle</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">quarterly</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">       # 每季度 review</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># === 描述 ===</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">description</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">|</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  订单服务负责创建 / 查询 / 修改订单。这是核心业务,</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  SLO 直接影响营收。</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># === SLI 定义 ===</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">slis</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">availability</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    description</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;HTTP 请求成功率(排除 4xx 业务错误)&quot;</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    metric</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">|</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">      sum(rate(http_requests_total{job=&quot;order-service&quot;,code!~&quot;5..&quot;,code!=&quot;429&quot;}[5m]))</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">      /</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">      sum(rate(http_requests_total{job=&quot;order-service&quot;}[5m]))</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">latency_p99</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    description</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;P99 响应时间&quot;</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    metric</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">|</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">      histogram_quantile(0.99,</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">        sum by (le) (rate(http_request_duration_seconds_bucket{job=&quot;order-service&quot;}[5m])))</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    threshold</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">0.5</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">   # 500ms</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># === SLO 目标 ===</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">slos</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">sli</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">availability</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    target</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">0.995</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">              # 99.5%</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    window</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">30d</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                # 30 天滑动窗口</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    error_budget</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">0.005</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">        # 1 - 0.995</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">sli</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">latency_p99</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    target</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">0.99</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">               # 99% 请求 &lt; 500ms</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    window</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">30d</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># === 关联的 SLA(如有)===</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">sla</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  customer_promise</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">0.99</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">       # 对客户承诺 99%(比 SLO 低)</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  penalty</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;退还月费的 10%&quot;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># === 错误预算政策 ===</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">policy</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  green</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:                       </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 余 &gt; 50%</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    actions</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;正常发布&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;灰度激进可&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  yellow</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:                      </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 余 20-50%</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    actions</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;发布需 SRE review&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;灰度更细&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  red</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:                         </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 余 &lt; 20%</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    actions</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;仅 bug fix&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;新特性停&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;全员可靠性&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  burned</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:                      </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 已耗尽</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    actions</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;发布冻结&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;事故级响应&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;升级到 VP&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># === Runbook ===</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">runbook</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">https://wiki.company.com/sre/order-service-runbook</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># === 历史回顾 ===</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">history</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">quarter</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">2026-Q1</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    sli_achieved</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">0.9952</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    incidents</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">2</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    notes</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;二月一次 DB 慢查询事故,消耗 60% 预算&quot;</span></span></code></pre></div><p><strong>这份文档的 7 个关键设计</strong>:</p><ol><li><strong><code>owner</code> 必须有具体人</strong>——<strong>不是&quot;团队&quot;是&quot;人&quot;</strong>,出问题找到人</li><li><strong><code>reviewed_at</code> + <code>review_cycle</code></strong>——<strong>SLO 不是设了就完,要定期复盘 + 调整</strong></li><li><strong><code>metric</code> 是真实可执行的 PromQL</strong>——<strong>写不出 PromQL 的 SLI 是空话</strong></li><li><strong><code>window: 30d</code></strong> 用滚动窗口而不是&quot;日历月&quot;——<strong>避免月初月底人为切换</strong></li><li><strong><code>error_budget</code> 显式计算</strong>——<strong>让所有人一眼看到&quot;我有多少额度&quot;</strong></li><li><strong><code>policy</code> 把行为写清楚</strong>——<strong>绿黄红的具体做什么,不留模糊</strong></li><li><strong><code>history</code> 留痕</strong>——<strong>这季度怎么样,出过什么事,下季度调不调 SLO</strong></li></ol><hr><h2 id="六、7-条踩坑清单" tabindex="-1">六、7 条踩坑清单 <a class="header-anchor" href="#六、7-条踩坑清单" aria-label="Permalink to &quot;六、7 条踩坑清单&quot;">​</a></h2><h3 id="坑-1-只看-5xx-漏了-4xx" tabindex="-1">坑 1:只看 5xx,漏了 4xx <a class="header-anchor" href="#坑-1-只看-5xx-漏了-4xx" aria-label="Permalink to &quot;坑 1:只看 5xx,漏了 4xx&quot;">​</a></h3><p><strong>症状</strong>:<strong>SLI 全绿但客户投诉不断</strong>——查日志发现某 API 大量返回 422(Unprocessable Entity),用户其实在投诉&quot;提交失败&quot;,但 SLI 公式只把 5xx 算失败。</p><p><strong>根因</strong>:<strong>4xx 里也有真的&quot;服务问题&quot;</strong>——比如 422(参数验证失败)、413(payload 太大)、429(限流)——<strong>这些可能是服务端问题,不全是用户的锅</strong>。</p><p><strong>修复</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>   不同 4xx 的处理:</span></span>
<span class="line"><span>   ─────────────────────────────</span></span>
<span class="line"><span>   400 Bad Request:   通常是客户端错,排除</span></span>
<span class="line"><span>   401/403 权限:      通常是客户端错,排除</span></span>
<span class="line"><span>   404 Not Found:     看场景,API 路由 404 = 服务端错</span></span>
<span class="line"><span>   409 Conflict:      看业务,可能是服务端</span></span>
<span class="line"><span>   422 Unprocessable: 看实现,业务逻辑错可能在服务端</span></span>
<span class="line"><span>   429 Too Many:      限流命中,排除(是预期行为)</span></span>
<span class="line"><span>   413 Payload Large: 排除(客户端错)</span></span></code></pre></div><p><strong>经验</strong>:<strong>SLI 公式定下来之后,模拟攻击 / 客户端错 / 业务异常各种场景</strong>,<strong>模拟一下数字会不会异常</strong>——<strong>异常了就是定义有问题</strong>。</p><h3 id="坑-2-窗口太短-误报满天飞" tabindex="-1">坑 2:窗口太短,误报满天飞 <a class="header-anchor" href="#坑-2-窗口太短-误报满天飞" aria-label="Permalink to &quot;坑 2:窗口太短,误报满天飞&quot;">​</a></h3><p><strong>症状</strong>:<strong>SLO 用了 5 分钟窗口,告警一天 100 次</strong>——<strong>统计意义不强</strong>(5 分钟内才几千个请求,<strong>1 个超时就是 0.1%</strong>),<strong>抖动天然就大</strong>。</p><p><strong>根因</strong>:<strong>短窗口适合&quot;快速告警&quot;,不适合 SLO 评估</strong>。<strong>SLO 评估必须用长窗口</strong>(7 天 / 30 天)。</p><p><strong>修复</strong>:<strong>长窗口看 SLO,短窗口配合燃烧率看告警</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>   SLO 评估:30 天滑动窗口        → 看&quot;有没有超预算&quot;</span></span>
<span class="line"><span>   告警评估:5min + 1h 双窗口     → 看&quot;消耗速度太快&quot;</span></span>
<span class="line"><span>                                     (15 篇详谈)</span></span></code></pre></div><p><strong>经验</strong>:<strong>SLO 窗口永远 ≥ 7 天</strong>——<strong>短了不稳</strong>。</p><h3 id="坑-3-窗口太长-告警滞后" tabindex="-1">坑 3:窗口太长,告警滞后 <a class="header-anchor" href="#坑-3-窗口太长-告警滞后" aria-label="Permalink to &quot;坑 3:窗口太长,告警滞后&quot;">​</a></h3><p><strong>症状</strong>:<strong>SLO 用 90 天窗口,某次故障烧了 70% 预算</strong>,<strong>但因为 90 天分母大,SLI 看起来还是 99.4%(目标 99%)</strong>——<strong>没触发&quot;红色&quot;告警,继续发布,几天后下一次故障直接破 SLA</strong>。</p><p><strong>根因</strong>:<strong>长窗口让&quot;集中故障&quot;被分母稀释,看不出严重性</strong>。</p><p><strong>修复</strong>:<strong>用&quot;多窗口&quot;组合</strong>——<strong>30 天看 SLO 达成,1 小时 + 6 小时看燃烧率</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>   多窗口策略:</span></span>
<span class="line"><span>   ────────────────────────────────────</span></span>
<span class="line"><span>   1h 窗口 + burn_rate &gt; 14   → 立刻告警(2 天烧光)</span></span>
<span class="line"><span>   6h 窗口 + burn_rate &gt; 6    → 严重告警(5 天烧光)</span></span>
<span class="line"><span>   3d 窗口 + burn_rate &gt; 1    → 注意告警(节奏不对)</span></span>
<span class="line"><span>   30d 窗口 + &lt; target        → SLO 违约</span></span></code></pre></div><p><strong>这是 15 篇告警工程的核心</strong>——SLO 的&quot;达成判断&quot;和&quot;告警判断&quot;是两件事,<strong>别混</strong>。</p><h3 id="坑-4-跨服务-slo-不复合" tabindex="-1">坑 4:跨服务 SLO 不复合 <a class="header-anchor" href="#坑-4-跨服务-slo-不复合" aria-label="Permalink to &quot;坑 4:跨服务 SLO 不复合&quot;">​</a></h3><p><strong>症状</strong>:<strong>服务 A 和服务 B 各自 SLO 99%,但客户旅程依赖 A→B,实际成功率 99% × 99% = 98%</strong>——<strong>客户感受的 SLO 比单服务低</strong>。</p><p><strong>根因</strong>:<strong>SLO 不能简单按服务叠加</strong>——<strong>用户旅程跨多个服务,每多一跳就乘一次</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>   一个用户下单流程:</span></span>
<span class="line"><span>   ─────────────────────────────────</span></span>
<span class="line"><span>   API Gateway   99.9%   ┐</span></span>
<span class="line"><span>   订单服务      99.9%   │  全部都要成功</span></span>
<span class="line"><span>   库存服务      99.9%   │  </span></span>
<span class="line"><span>   支付服务      99.9%   ┘</span></span>
<span class="line"><span>   ──────────────────────────────</span></span>
<span class="line"><span>   端到端 = 0.999^4 = 99.6%</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   想要端到端 99.9%:每个服务必须 ≥ 99.975%</span></span></code></pre></div><p><strong>修复</strong>:</p><ul><li><strong>核心业务流程定 user-journey SLO</strong>——<strong>直接测端到端,不靠各服务叠加</strong></li><li><strong>依赖深的服务,每个的 SLO 要更高</strong>(99.95+)</li><li><strong>架构层面减少依赖</strong>(缓存 / 异步化 / 降级)</li></ul><p><strong>经验</strong>:<strong>先画清楚&quot;用户旅程依赖几个服务&quot;,再算每个服务该承担多少 SLO</strong>——<strong>这是 SLO 规划的基础动作</strong>。</p><h3 id="坑-5-slo-数字拍脑袋" tabindex="-1">坑 5:SLO 数字拍脑袋 <a class="header-anchor" href="#坑-5-slo-数字拍脑袋" aria-label="Permalink to &quot;坑 5:SLO 数字拍脑袋&quot;">​</a></h3><p><strong>症状</strong>:<strong>老板说&quot;我们要 99.99% SLO&quot;</strong>——团队照做,<strong>3 个月后 SLO 永远红色,所有人都麻木了</strong>。</p><p><strong>根因</strong>:<strong>SLO 数字必须建立在&quot;我们历史上能做到&quot;的基础上</strong>,<strong>不是&quot;我们希望做到&quot;</strong>。</p><p><strong>修复</strong>:<strong>定 SLO 的工作流</strong>——</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>   step 1:看历史数据</span></span>
<span class="line"><span>   ─────────────────</span></span>
<span class="line"><span>   过去 6 个月,SLI 的实际分布是多少?</span></span>
<span class="line"><span>   - 月度平均 SLI = 99.95%?</span></span>
<span class="line"><span>   - 最差月份 SLI = 99.5%?</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   step 2:定 SLO</span></span>
<span class="line"><span>   ─────────────────</span></span>
<span class="line"><span>   SLO 应该略低于历史平均(给空间)</span></span>
<span class="line"><span>   但高于最差月份(逼迫改进)</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   例:历史 99.95% 平均,99.5% 最差</span></span>
<span class="line"><span>   → SLO 定 99.9%(合理)</span></span>
<span class="line"><span>   → SLO 定 99.99%(野心)→ 必败</span></span>
<span class="line"><span>   → SLO 定 99%(躺平)→ 没价值</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   step 3:跑 3 个月再调</span></span>
<span class="line"><span>   ─────────────────</span></span>
<span class="line"><span>   3 个月数据看 SLO 达成率:</span></span>
<span class="line"><span>   - 全部超额完成 → SLO 太松,调高</span></span>
<span class="line"><span>   - 经常达不到 → SLO 太严,调低 或 真改进</span></span></code></pre></div><p><strong>经验</strong>:<strong>SLO 不是&quot;理想&quot;,是&quot;测量基线 + 改进目标&quot;</strong>——<strong>和历史脱节的 SLO 是装饰品</strong>。</p><h3 id="坑-6-第一次就定-99-99" tabindex="-1">坑 6:第一次就定 99.99% <a class="header-anchor" href="#坑-6-第一次就定-99-99" aria-label="Permalink to &quot;坑 6:第一次就定 99.99%&quot;">​</a></h3><p><strong>症状</strong>:<strong>团队第一个 SLO 直接定 99.99%</strong>——<strong>4.32 分钟错误预算 / 月</strong>,<strong>实际上任何一次部署 / 任何一次小故障都超</strong>——<strong>3 个月所有人都&quot;麻木超额&quot;</strong>。</p><p><strong>根因</strong>:<strong>没看过历史 SLI 数据就拍数字</strong>。</p><p><strong>修复</strong>:<strong>先观察 1-3 个月</strong>(只跑 SLI,不上 SLO 强制),<strong>有数据再定 SLO</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>   第 1 个月:观察期</span></span>
<span class="line"><span>   ─────────────────</span></span>
<span class="line"><span>   只跑 SLI 数据采集,不设 SLO</span></span>
<span class="line"><span>   看 SLI 的实际分布</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   第 2 个月:试 SLO</span></span>
<span class="line"><span>   ─────────────────</span></span>
<span class="line"><span>   按观察期数据,定一个 SLO(略低于平均)</span></span>
<span class="line"><span>   不强制,看团队行为</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   第 3 个月:正式 SLO</span></span>
<span class="line"><span>   ─────────────────</span></span>
<span class="line"><span>   错误预算开始执行</span></span>
<span class="line"><span>   超了真的停发布</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   每季度复盘 + 调整</span></span></code></pre></div><p><strong>经验</strong>:<strong>第一个 SLO 永远从 99% 或 99.5% 开始</strong>——<strong>99.9% 都要慎重</strong>,<strong>99.99% 是 3 年以后的事</strong>。</p><h3 id="坑-7-把-slo-当通过率" tabindex="-1">坑 7:把 SLO 当通过率 <a class="header-anchor" href="#坑-7-把-slo-当通过率" aria-label="Permalink to &quot;坑 7:把 SLO 当通过率&quot;">​</a></h3><p><strong>症状</strong>:<strong>SLO 99.9% 当月 SLI 99.95% → 团队认为&quot;我们超额完成,可以躺平&quot;</strong>。</p><p><strong>根因</strong>:<strong>SLO 是底线不是通过率</strong>——<strong>SLI 高于 SLO 不代表&quot;完美&quot;</strong>。</p><p><strong>修复</strong>:<strong>SLO 的两种用法</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>   错误理解:</span></span>
<span class="line"><span>   ─────────────────────────────</span></span>
<span class="line"><span>   SLO = &quot;应试目标&quot;,过线就算&quot;100 分&quot;</span></span>
<span class="line"><span>   → 团队达成 SLO 就放松</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   正确理解:</span></span>
<span class="line"><span>   ─────────────────────────────</span></span>
<span class="line"><span>   SLO = &quot;工程承诺底线&quot;,过线只是&quot;不违约&quot;</span></span>
<span class="line"><span>   超额完成的&quot;额度&quot;= 错误预算</span></span>
<span class="line"><span>   → 用预算来&quot;投资&quot;激进的改进 / 实验</span></span>
<span class="line"><span>   → 错误预算用完之前的余额是资源,不是奖励</span></span></code></pre></div><p><strong>经验</strong>:<strong>SLO 不是 KPI,SLO 是工程约束</strong>——<strong>用 SLO 衡量个人 / 团队 KPI 是最大的反 pattern</strong>(会逼着团队隐藏故障 / 不报告问题)。</p><hr><h2 id="七、何时不该上-slo" tabindex="-1">七、何时不该上 SLO <a class="header-anchor" href="#七、何时不该上-slo" aria-label="Permalink to &quot;七、何时不该上 SLO&quot;">​</a></h2><p><strong>这一节给真小团队</strong>——<strong>以下情况,先放放</strong>。</p><h3 id="_7-1-5-服务-100-qps" tabindex="-1">7.1 &lt; 5 服务 + &lt; 100 QPS <a class="header-anchor" href="#_7-1-5-服务-100-qps" aria-label="Permalink to &quot;7.1 &lt; 5 服务 + &lt; 100 QPS&quot;">​</a></h3><p><strong>这个规模下,工程师对系统的&quot;直觉&quot;比 SLO 数字准</strong>——<strong>SLO 是给&quot;复杂到一个人脑子装不下&quot;的系统用的</strong>,<strong>5 个服务大家都能心里有数</strong>。</p><p><strong>例外</strong>:<strong>对外 SaaS 业务,客户合同里有 SLA</strong>——<strong>那必须有 SLO,法律责任压着</strong>。</p><h3 id="_7-2-团队没人懂-promql-数据基础" tabindex="-1">7.2 团队没人懂 PromQL / 数据基础 <a class="header-anchor" href="#_7-2-团队没人懂-promql-数据基础" aria-label="Permalink to &quot;7.2 团队没人懂 PromQL / 数据基础&quot;">​</a></h3><p><strong>SLO 的核心是&quot;用数据说话&quot;</strong>——<strong>不会写 PromQL / 不知道 histogram_quantile 怎么用 / 不知道 percentile 和 average 的区别</strong>——<strong>这些基础不打好,SLO 数字是错的</strong>。</p><p><strong>应对</strong>:<strong>先把 05-07 篇(Metrics / Prometheus / PromQL)学完</strong>,<strong>再开始上 SLO</strong>。</p><h3 id="_7-3-公司文化不支持-停发布" tabindex="-1">7.3 公司文化不支持&quot;停发布&quot; <a class="header-anchor" href="#_7-3-公司文化不支持-停发布" aria-label="Permalink to &quot;7.3 公司文化不支持&quot;停发布&quot;&quot;">​</a></h3><p><strong>SLO 的最大价值是&quot;超预算停发布&quot;</strong>——<strong>如果产品 / 老板说&quot;业绩优先,SLO 是技术的事不影响发布&quot;</strong>,<strong>SLO 就是装饰品</strong>,<strong>别上</strong>——<strong>装上反而让工程师觉得自己被无视</strong>,<strong>士气受损</strong>。</p><p><strong>应对</strong>:<strong>先和老板 / 产品对齐&quot;错误预算政策&quot;</strong>——<strong>他们认可&quot;超预算停发布&quot;再上 SLO</strong>。<strong>17 篇会专门讲怎么吵这个</strong>。</p><h3 id="_7-4-业务还没有-用户视角" tabindex="-1">7.4 业务还没有&quot;用户视角&quot; <a class="header-anchor" href="#_7-4-业务还没有-用户视角" aria-label="Permalink to &quot;7.4 业务还没有&quot;用户视角&quot;&quot;">​</a></h3><p><strong>B2B 业务的&quot;用户&quot; = 谁的体验</strong>?<strong>To C 业务很清楚(终端用户)</strong>,<strong>To B 业务可能是&quot;客户运营&quot;也可能是&quot;客户技术&quot;</strong>。<strong>SLI 选错了用户,所有数据都是噪音</strong>。</p><p><strong>应对</strong>:<strong>先把&quot;我服务的用户是谁&quot;想清楚</strong>——<strong>别为 SLO 而 SLO</strong>。</p><hr><h2 id="八、回到一开始" tabindex="-1">八、回到一开始 <a class="header-anchor" href="#八、回到一开始" aria-label="Permalink to &quot;八、回到一开始&quot;">​</a></h2><p><strong>SLO 是把&quot;可靠性&quot;从感觉变成承诺的工程工具</strong>——<strong>它不是为了好看,是为了让团队在&quot;上特性&quot;和&quot;稳系统&quot;之间有客观的依据吵架</strong>。</p><p>这一篇要给你留下的不是&quot;SLO 怎么写&quot;,<strong>是 5 件事</strong>:</p><ol><li><strong>SLI / SLO / SLA 是三件事</strong>——分别属于工程 / 产品 / 法务,<strong>别混</strong></li><li><strong>SLI 必须用户视角</strong>——<strong>CPU / Pod 数当 SLI 都是装饰品</strong></li><li><strong>错误预算的算术必须背</strong>——<strong>99.9% 一个月 43 分钟,99.99% 一个月 4.32 分钟,每加一个 9 成本 × 10</strong></li><li><strong>错误预算是决策工具</strong>——<strong>有余额激进,超支停发布</strong>,<strong>没行动的 SLO 是空话</strong></li><li><strong>SLO 不是 KPI</strong>——<strong>用 SLO 考核团队是最大的反 pattern</strong></li></ol><blockquote><p>经验法则:<strong>中型团队第一个 SLO 永远是&quot;主要 API 服务的 availability + latency,SLO 99.5%,30 天窗口&quot;</strong>——<strong>6 个月之后再考虑调高 / 加 user journey / 拆细</strong>。<strong>别一上来就 99.99% 全套</strong>,<strong>那种 SLO 装饰意义大于工程意义</strong>。</p></blockquote><hr><p><strong>这一篇结束了第三层的开篇</strong>——<strong>SLO 工程的三个核心(SLI 选择 / 错误预算 / 政策)讲完了</strong>,<strong>接下来的 14-17 篇是 SLO 的具体应用</strong>:</p><ul><li><strong>14 RED / USE 方法</strong>:服务该看什么(RED:Rate / Errors / Duration),资源该看什么(USE:Utilization / Saturation / Errors)——<strong>这是 SLI 选型的具体框架</strong></li><li><strong>15 告警分级与降噪</strong>:<strong>SLO 算术 → 多窗口多燃烧率告警</strong>——<strong>这是 SLO 真正变成&quot;行动&quot;的桥梁</strong></li><li><strong>16 仪表盘工程</strong>:<strong>SLO + 黄金 4 信号 + Grafana</strong>——<strong>让数据从&quot;我能查&quot;变成&quot;老板能看&quot;</strong></li><li><strong>17 错误预算的政治学</strong>:<strong>SLO 红的时候怎么和产品吵</strong>——<strong>这是 SLO 落地的最大障碍</strong></li></ul><p><strong>SLO 是数据,告警是行动,Runbook 是手册,On-call 是人——这四样合起来才是 SRE 工程</strong>。<strong>13 是这一切的开始</strong>,<strong>没有 SLO 的可靠性都是耍流氓</strong>。</p><p>下一篇 <code>14-RED-与-USE-方法.md</code>,从&quot;怎么定 SLI&quot;切到&quot;具体看哪几个指标&quot;——讲清楚为什么服务用 RED(Rate / Errors / Duration)、资源用 USE(Utilization / Saturation / Errors)、为什么这两个<strong>不能混</strong>(用 USE 监控 API 服务 / 用 RED 监控 CPU,都是常见错误)、以及<strong>每个微服务的&quot;必备 4 张图&quot;长什么样</strong>——这是 SLI 落地的工程框架。</p>`,159)])])}const k=n(t,[["render",l]]);export{d as __pageData,k as default};
