import{c as a,Q as n,j as p,m as i}from"./chunks/framework.CBiVa4O3.js";const k=JSON.parse('{"title":"仪表盘工程:Grafana / 黄金 4 信号 / 一图一意 / 反对\\"导航灯堆\\"","description":"","frontmatter":{},"headers":[],"relativePath":"../devopsLearning/16-仪表盘工程.md","filePath":"../devopsLearning/16-仪表盘工程.md","lastUpdated":1778496697000}'),l={name:"../devopsLearning/16-仪表盘工程.md"};function e(t,s,h,r,o,d){return n(),p("div",null,[...s[0]||(s[0]=[i(`<h1 id="仪表盘工程-grafana-黄金-4-信号-一图一意-反对-导航灯堆" tabindex="-1">仪表盘工程:Grafana / 黄金 4 信号 / 一图一意 / 反对&quot;导航灯堆&quot; <a class="header-anchor" href="#仪表盘工程-grafana-黄金-4-信号-一图一意-反对-导航灯堆" aria-label="Permalink to &quot;仪表盘工程:Grafana / 黄金 4 信号 / 一图一意 / 反对&quot;导航灯堆&quot;&quot;">​</a></h1><p>14 教你看什么指标,15 教你什么时候告警。<strong>这一篇讲告警响起或者每周巡检时,你打开 Grafana 看什么页面、看什么 panel、按什么顺序看</strong>。听起来简单——&quot;不就是画几个图嘛&quot;——但<strong>90% 团队的 dashboard 都是错的</strong>:不是数据错,是<strong>布局错、单位错、刷新错、版本错</strong>,关键时刻就是看不懂、找不到、点不开。</p><blockquote><p>一句话先记住:<strong>dashboard 不是&quot;把指标都画出来&quot;,是&quot;让看的人 30 秒内回答一个问题&quot;</strong>——这是它和 metric explorer 的本质区别。一个 dashboard 上摆 50 个 panel、各种颜色、没标题没单位,凌晨 3 点的值班看一眼脑子炸了——这是工程错误,不是技术品味问题。这一篇讲清楚&quot;一图一意&quot;原则、四层 dashboard 架构(L1 给业务看 / L2 给值班看 / L3 给排障看 / L4 给开发调试)、为什么 dashboard 必须进 Git,以及那个最常见反模式——<strong>导航灯堆</strong>——为什么是 dashboard 工程的头号公敌。</p></blockquote><hr><h2 id="一、问题场景-导航灯堆是怎么炼成的" tabindex="-1">一、问题场景:导航灯堆是怎么炼成的 <a class="header-anchor" href="#一、问题场景-导航灯堆是怎么炼成的" aria-label="Permalink to &quot;一、问题场景:导航灯堆是怎么炼成的&quot;">​</a></h2><h3 id="_1-1-一个典型的烂-dashboard" tabindex="-1">1.1 一个典型的烂 dashboard <a class="header-anchor" href="#_1-1-一个典型的烂-dashboard" aria-label="Permalink to &quot;1.1 一个典型的烂 dashboard&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>打开公司 Grafana,搜 &quot;order&quot;。出来 27 个 dashboard:</span></span>
<span class="line"><span>   order-service-overview</span></span>
<span class="line"><span>   order-service-overview-new</span></span>
<span class="line"><span>   order-service-overview-v2</span></span>
<span class="line"><span>   order-service-overview-zhangsan</span></span>
<span class="line"><span>   order-service-real</span></span>
<span class="line"><span>   order-service-temp</span></span>
<span class="line"><span>   order-service-真正用的</span></span>
<span class="line"><span>   ...</span></span>
<span class="line"><span></span></span>
<span class="line"><span>随便点一个,翻到底:</span></span>
<span class="line"><span>   ┌──────────────────────────────────────────────────┐</span></span>
<span class="line"><span>   │  panel 1: 一个数字 &quot;1247&quot;   panel 2: 一个数字 &quot;0.3&quot;│  ← 没单位 没标题</span></span>
<span class="line"><span>   │                                                  │</span></span>
<span class="line"><span>   │  panel 3: 蓝绿红黄紫 5 条线挤在一起,没图例        │  ← 没图例</span></span>
<span class="line"><span>   │                                                  │</span></span>
<span class="line"><span>   │  panel 4: 一个曲线 范围 0-1                       │  ← 不知道是错误率还是 CPU</span></span>
<span class="line"><span>   │                                                  │</span></span>
<span class="line"><span>   │  panel 5: &quot;Latency&quot;(平均 / P50 / P99 全画一条线) │  ← 看不出来是哪个</span></span>
<span class="line"><span>   │                                                  │</span></span>
<span class="line"><span>   │  ...                                             │</span></span>
<span class="line"><span>   │                                                  │</span></span>
<span class="line"><span>   │  panel 47: 一年前的人配的,服务早就改名,数据没了   │  ← 死 panel</span></span>
<span class="line"><span>   └──────────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>这就是导航灯堆</strong>——50 个红绿灯并排,<strong>信息密度极高但信息量为 0</strong>。它的形成路径几乎都一样:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>阶段 1: 一个工程师起了个 panel,挺好用</span></span>
<span class="line"><span>阶段 2: 别人觉得我也加一个吧,加到他自己关心的指标</span></span>
<span class="line"><span>阶段 3: 又有人加,3 个月 panel 从 5 个涨到 30 个</span></span>
<span class="line"><span>阶段 4: 改服务名,部分 panel 数据没了</span></span>
<span class="line"><span>阶段 5: 加完一个新指标,谁也不敢删旧的,继续叠</span></span>
<span class="line"><span>阶段 6: 50 个 panel,值班看不下去,自己另起一个</span></span>
<span class="line"><span>阶段 7: GOTO 阶段 1</span></span></code></pre></div><p><strong>结果</strong>:每个团队 5-10 个&quot;重复但不同&quot; dashboard,每个都用一阵就老化,<strong>真出事谁都找不到&quot;正确的那个&quot;</strong>。</p><h3 id="_1-2-一图一意是反命题" tabindex="-1">1.2 一图一意是反命题 <a class="header-anchor" href="#_1-2-一图一意是反命题" aria-label="Permalink to &quot;1.2 一图一意是反命题&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错的思路:&quot;我把所有相关的指标都画出来,值班自己挑&quot;</span></span>
<span class="line"><span>对的思路:&quot;每个 panel 回答一个具体的问题&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>为什么&quot;全画出来&quot;是错的:</span></span>
<span class="line"><span>   - 30 个 panel 看不完</span></span>
<span class="line"><span>   - 每个 panel 之间的优先级不清楚</span></span>
<span class="line"><span>   - 值班需要&quot;思考&quot;,而思考时间在事故现场是奢侈品</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>为什么&quot;一图一意&quot;:</span></span>
<span class="line"><span>   - 每个 panel = 一个明确的问题(下面 §2.1)</span></span>
<span class="line"><span>   - 问题之间有先后顺序(总览 → 下钻)</span></span>
<span class="line"><span>   - 值班不思考,直接跑流程</span></span></code></pre></div><p>中型团队(10 人 / 100 微服务)dashboard 通常已经 100 个起步,<strong>没工程化必然变成导航灯堆</strong>——这一篇就是治这个的。</p><hr><h2 id="二、一图一意-每个-panel-回答一个问题" tabindex="-1">二、一图一意:每个 panel 回答一个问题 <a class="header-anchor" href="#二、一图一意-每个-panel-回答一个问题" aria-label="Permalink to &quot;二、一图一意:每个 panel 回答一个问题&quot;">​</a></h2><h3 id="_2-1-panel-设计的核心原则" tabindex="-1">2.1 panel 设计的核心原则 <a class="header-anchor" href="#_2-1-panel-设计的核心原则" aria-label="Permalink to &quot;2.1 panel 设计的核心原则&quot;">​</a></h3><p><strong>一图一意</strong>(One Chart, One Insight)——<strong>每个 panel 都要能用一句话回答&quot;它在说什么&quot;</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  好 panel 的自检 4 条:                                      │</span></span>
<span class="line"><span>├────────────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>│  1. 标题就是问题                                            │</span></span>
<span class="line"><span>│      ✓ &quot;订单接口 P99 延迟&quot;   ← 一眼知道在测什么            │</span></span>
<span class="line"><span>│      ✗ &quot;Latency&quot;             ← 哪个服务?哪个指标?         │</span></span>
<span class="line"><span>│                                                            │</span></span>
<span class="line"><span>│  2. 单位明确(必须显示)                                    │</span></span>
<span class="line"><span>│      ✓ &quot;ms / requests/sec / % / GB&quot;                        │</span></span>
<span class="line"><span>│      ✗ 纯数字,没单位                                       │</span></span>
<span class="line"><span>│                                                            │</span></span>
<span class="line"><span>│  3. 阈值线 / SLO 线 / baseline 标注                        │</span></span>
<span class="line"><span>│      ✓ 画一条 &quot;SLO P99 &lt; 500ms&quot; 的虚线在曲线上              │</span></span>
<span class="line"><span>│      ✗ 只画曲线,看不出来&quot;现在算高还是低&quot;                  │</span></span>
<span class="line"><span>│                                                            │</span></span>
<span class="line"><span>│  4. 颜色有语义,不是装饰                                    │</span></span>
<span class="line"><span>│      ✓ 红=坏 / 绿=好 / 黄=警告                              │</span></span>
<span class="line"><span>│      ✗ 蓝紫青粉橙,看的人猜哪个是 P99 哪个是 avg            │</span></span>
<span class="line"><span>└────────────────────────────────────────────────────────────┘</span></span></code></pre></div><h3 id="_2-2-panel-的反命题-不应该出现什么" tabindex="-1">2.2 panel 的反命题:不应该出现什么 <a class="header-anchor" href="#_2-2-panel-的反命题-不应该出现什么" aria-label="Permalink to &quot;2.2 panel 的反命题:不应该出现什么&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>❌ 不写标题或写英文缩写</span></span>
<span class="line"><span>   &quot;p99l&quot; / &quot;qps_5xx_o&quot; ← 谁能看懂?</span></span>
<span class="line"><span></span></span>
<span class="line"><span>❌ Y 轴没单位</span></span>
<span class="line"><span>   &quot;1247&quot; 是什么?ms?bytes?count?</span></span>
<span class="line"><span></span></span>
<span class="line"><span>❌ X 轴时间不一致</span></span>
<span class="line"><span>   panel A 看 1h,panel B 看 24h,</span></span>
<span class="line"><span>   值班想关联指标都对不上</span></span>
<span class="line"><span></span></span>
<span class="line"><span>❌ Stacked 图画延迟</span></span>
<span class="line"><span>   延迟不能 stack,把 P50/P99 stack 出来是无意义的数</span></span>
<span class="line"><span></span></span>
<span class="line"><span>❌ Pie chart 画时序</span></span>
<span class="line"><span>   饼图天生没时间维度,</span></span>
<span class="line"><span>   用饼图画&quot;过去 1h 错误来源&quot;是最常见的反模式</span></span>
<span class="line"><span></span></span>
<span class="line"><span>❌ 用 instant query 画时序</span></span>
<span class="line"><span>   query 写了 sum(http_requests_total),没 rate</span></span>
<span class="line"><span>   出来一条单调上升的反人类曲线</span></span></code></pre></div><p><strong>这些反模式不是审美问题,是工程错误</strong>——它们会让 dashboard 在事故现场失去价值。</p><hr><h2 id="三、golden-four-signals-在-dashboard-的标准布局" tabindex="-1">三、Golden Four Signals 在 dashboard 的标准布局 <a class="header-anchor" href="#三、golden-four-signals-在-dashboard-的标准布局" aria-label="Permalink to &quot;三、Golden Four Signals 在 dashboard 的标准布局&quot;">​</a></h2><p>Google SRE Book 的 Four Golden Signals(Latency / Traffic / Errors / Saturation),<strong>到 dashboard 上是四个象限</strong>——这是任何&quot;服务总览&quot;的标准开局。</p><h3 id="_3-1-总览第一屏的四象限布局" tabindex="-1">3.1 总览第一屏的四象限布局 <a class="header-anchor" href="#_3-1-总览第一屏的四象限布局" aria-label="Permalink to &quot;3.1 总览第一屏的四象限布局&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌──────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│            Service Overview: order-service                    │</span></span>
<span class="line"><span>│           Period: last 1h     Refresh: 30s                   │</span></span>
<span class="line"><span>├───────────────────────────────┬──────────────────────────────┤</span></span>
<span class="line"><span>│                               │                              │</span></span>
<span class="line"><span>│       ① Traffic (R)          │       ② Errors (E)           │</span></span>
<span class="line"><span>│                               │                              │</span></span>
<span class="line"><span>│  ┌──────────────────────────┐ │  ┌──────────────────────────┐│</span></span>
<span class="line"><span>│  │      QPS 曲线            │ │  │  错误率 曲线 (红色)       ││</span></span>
<span class="line"><span>│  │      ─────────           │ │  │       ───┐               ││</span></span>
<span class="line"><span>│  │     ╱      ╲             │ │  │        ╱  ╲       ── 1% ││ ← SLO</span></span>
<span class="line"><span>│  │   ╱          ╲           │ │  │     ╱       ╲     ── 0.1% (限)</span></span>
<span class="line"><span>│  │ ╱                        │ │  │ ──╱                      ││</span></span>
<span class="line"><span>│  │                          │ │  │                          ││</span></span>
<span class="line"><span>│  │  当前: 2840/s            │ │  │  当前: 0.18%             ││</span></span>
<span class="line"><span>│  └──────────────────────────┘ │  └──────────────────────────┘│</span></span>
<span class="line"><span>│                               │                              │</span></span>
<span class="line"><span>├───────────────────────────────┼──────────────────────────────┤</span></span>
<span class="line"><span>│                               │                              │</span></span>
<span class="line"><span>│       ③ Latency (D)          │     ④ Saturation (S)         │</span></span>
<span class="line"><span>│                               │                              │</span></span>
<span class="line"><span>│  ┌──────────────────────────┐ │  ┌──────────────────────────┐│</span></span>
<span class="line"><span>│  │   P50 / P95 / P99        │ │  │  CPU usage  ──────       ││</span></span>
<span class="line"><span>│  │   ─── P99                │ │  │  Mem usage  ──────       ││</span></span>
<span class="line"><span>│  │   ─── P95                │ │  │  DB pool    ──────       ││</span></span>
<span class="line"><span>│  │   ─── P50  ───── 500ms   │ │  │  Thread pool ─────       ││</span></span>
<span class="line"><span>│  │                          │ │  │                          ││</span></span>
<span class="line"><span>│  │  P99: 280ms / P50: 80ms  │ │  │  CPU 45%, DB 70%, ...    ││</span></span>
<span class="line"><span>│  └──────────────────────────┘ │  └──────────────────────────┘│</span></span>
<span class="line"><span>│                               │                              │</span></span>
<span class="line"><span>└───────────────────────────────┴──────────────────────────────┘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>┌──────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  Below: 下钻 panels(by endpoint, by status, by upstream)    │</span></span>
<span class="line"><span>└──────────────────────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>这一屏的 4 个原则</strong>:</p><ol><li><strong>大约一屏一个服务</strong>——不要在总览页放第二个服务,看不过来</li><li><strong>4 个 panel 同等大小</strong>——视觉等权,谁都不偏袒</li><li><strong>每个 panel 上画 SLO/threshold 线</strong>——值班看一眼知道&quot;现在算不算事&quot;</li><li><strong>下钻 panels 放在下方</strong>——总览看到异常,往下滚动找细节</li></ol><h3 id="_3-2-为什么是-red-saturation-而不是只-red" tabindex="-1">3.2 为什么是 RED + Saturation 而不是只 RED <a class="header-anchor" href="#_3-2-为什么是-red-saturation-而不是只-red" aria-label="Permalink to &quot;3.2 为什么是 RED + Saturation 而不是只 RED&quot;">​</a></h3><p>14 篇讲过:<strong>RED 是用户视角,Saturation 是机器视角</strong>。总览同时放两边,<strong>值班 5 秒判断&quot;是出事了 (RED)&quot; + &quot;是哪里出事 (Saturation)&quot;</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错的总览:</span></span>
<span class="line"><span>   只放 RED 三件</span></span>
<span class="line"><span>   值班看到 P99 飙了 → 必须切换到另一个 dashboard 看资源 → 多 2 步</span></span>
<span class="line"><span></span></span>
<span class="line"><span>对的总览:</span></span>
<span class="line"><span>   RED + Saturation 同屏</span></span>
<span class="line"><span>   值班看到 P99 飙了 → 余光扫到 DB pool 也飙了 → 1 步定位</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   这一秒的差别,在事故响应里就是 MTTR 30% 的差距</span></span></code></pre></div><h3 id="_3-3-注意-saturation-不画-utilization" tabindex="-1">3.3 注意:Saturation 不画 Utilization <a class="header-anchor" href="#_3-3-注意-saturation-不画-utilization" aria-label="Permalink to &quot;3.3 注意:Saturation 不画 Utilization&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错: 第四象限画 CPU 利用率</span></span>
<span class="line"><span>对: 第四象限画 CPU saturation(load avg / cores)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>理由参考 14 篇 §3.2:</span></span>
<span class="line"><span>   - U 给假象(GC / 批量任务把 U 拉高但用户无感)</span></span>
<span class="line"><span>   - S 给真相(run queue / pending request / queue depth)</span></span>
<span class="line"><span>   - 总览屏的稀缺空间应该留给&quot;真信号&quot;</span></span></code></pre></div><p><strong>总览屏一上来就画 CPU U 这种&quot;看起来正经&quot;的指标</strong>,是最常见的反模式之一——<strong>值班会被 U 误导,以为&quot;CPU 高一点就是要扩容&quot;</strong>,实际饱和度才说话。</p><hr><h2 id="四、dashboard-分层-l1-l2-l3-l4" tabindex="-1">四、Dashboard 分层:L1 / L2 / L3 / L4 <a class="header-anchor" href="#四、dashboard-分层-l1-l2-l3-l4" aria-label="Permalink to &quot;四、Dashboard 分层:L1 / L2 / L3 / L4&quot;">​</a></h2><p>100 个微服务的团队,<strong>dashboard 必然分层</strong>——单一 dashboard 应对不了&quot;业务高管看 / SRE 值班看 / 排障的人看 / 开发调试看&quot;四种受众。</p><h3 id="_4-1-四层架构" tabindex="-1">4.1 四层架构 <a class="header-anchor" href="#_4-1-四层架构" aria-label="Permalink to &quot;4.1 四层架构&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  L1: 业务总览(给老板 / 产品看)                            │</span></span>
<span class="line"><span>│                                                            │</span></span>
<span class="line"><span>│  - 主要业务指标(订单量 / GMV / 活跃用户)                  │</span></span>
<span class="line"><span>│  - 系统可用性(几个 9)                                     │</span></span>
<span class="line"><span>│  - 错误预算剩余                                            │</span></span>
<span class="line"><span>│  - 5-10 个 panel,信息高度浓缩                              │</span></span>
<span class="line"><span>│  - 大屏(墙上 TV / 早会展示)                                │</span></span>
<span class="line"><span>│  受众:CTO / VP / PM / 业务方                              │</span></span>
<span class="line"><span>│  打开频率:每天 1-2 次                                      │</span></span>
<span class="line"><span>├────────────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>│  L2: 服务总览(给值班 SRE 看)                              │</span></span>
<span class="line"><span>│                                                            │</span></span>
<span class="line"><span>│  - 每个 user-facing 服务一份                                │</span></span>
<span class="line"><span>│  - 黄金 4 信号四象限(§3.1)                                │</span></span>
<span class="line"><span>│  - 下钻 panels:by endpoint, by status, by upstream         │</span></span>
<span class="line"><span>│  - 15-25 个 panel                                          │</span></span>
<span class="line"><span>│  受众:On-call SRE / 服务 owner                            │</span></span>
<span class="line"><span>│  打开频率:每天多次,告警时第一站                            │</span></span>
<span class="line"><span>├────────────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>│  L3: 资源详情(给排障的人看)                                │</span></span>
<span class="line"><span>│                                                            │</span></span>
<span class="line"><span>│  - 节点 / Pod / DB / 中间件层面                             │</span></span>
<span class="line"><span>│  - USE 的所有指标(参考 14 篇 §3.3)                        │</span></span>
<span class="line"><span>│  - 跨服务对比(同一节点上多少服务)                          │</span></span>
<span class="line"><span>│  - 30-50 个 panel,数据密集                                  │</span></span>
<span class="line"><span>│  受众:深度排障的 SRE / 平台团队                            │</span></span>
<span class="line"><span>│  打开频率:出事时打开 / 周巡检                              │</span></span>
<span class="line"><span>├────────────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>│  L4: 调试详情(给开发自己看)                                │</span></span>
<span class="line"><span>│                                                            │</span></span>
<span class="line"><span>│  - 服务内部状态(GC、cache 命中、自定义业务指标)            │</span></span>
<span class="line"><span>│  - Trace 链路 / Span 详情                                  │</span></span>
<span class="line"><span>│  - 性能剖析(Pyroscope / Parca)                            │</span></span>
<span class="line"><span>│  - 可以很多 panel,反正只有自己看                            │</span></span>
<span class="line"><span>│  受众:服务作者 / 排查特定 bug                              │</span></span>
<span class="line"><span>│  打开频率:开发期 / 优化时                                  │</span></span>
<span class="line"><span>└────────────────────────────────────────────────────────────┘</span></span></code></pre></div><h3 id="_4-2-分层的意义" tabindex="-1">4.2 分层的意义 <a class="header-anchor" href="#_4-2-分层的意义" aria-label="Permalink to &quot;4.2 分层的意义&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>为什么分四层而不是&quot;一个 dashboard 包打天下&quot;:</span></span>
<span class="line"><span>   - 受众不同,信息密度需求不同</span></span>
<span class="line"><span>   - L1 老板要&quot;5 秒看完&quot;,不能塞太多</span></span>
<span class="line"><span>   - L4 开发要&quot;塞满细节&quot;,不怕乱</span></span>
<span class="line"><span>   - 强行合并 = 大家都看不爽</span></span>
<span class="line"><span></span></span>
<span class="line"><span>为什么不分得更细:</span></span>
<span class="line"><span>   - 5 层以上记不住</span></span>
<span class="line"><span>   - 跳转链路长,事故现场失误概率高</span></span>
<span class="line"><span>   - 4 层覆盖 95% 场景</span></span></code></pre></div><h3 id="_4-3-分层的导航关系" tabindex="-1">4.3 分层的导航关系 <a class="header-anchor" href="#_4-3-分层的导航关系" aria-label="Permalink to &quot;4.3 分层的导航关系&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌──────┐</span></span>
<span class="line"><span>│  L1  │  ← 老板看</span></span>
<span class="line"><span>│ 总览 │</span></span>
<span class="line"><span>└──┬───┘</span></span>
<span class="line"><span>   │ 哪个服务红了?点过去</span></span>
<span class="line"><span>   ▼</span></span>
<span class="line"><span>┌──────┐</span></span>
<span class="line"><span>│  L2  │  ← 值班看,告警的第一站</span></span>
<span class="line"><span>│ 服务 │</span></span>
<span class="line"><span>└──┬───┘</span></span>
<span class="line"><span>   │ 是哪个资源饱和了?点过去</span></span>
<span class="line"><span>   ▼</span></span>
<span class="line"><span>┌──────┐</span></span>
<span class="line"><span>│  L3  │  ← 排障的看</span></span>
<span class="line"><span>│ 资源 │</span></span>
<span class="line"><span>└──┬───┘</span></span>
<span class="line"><span>   │ 是代码哪段引起的?点过去</span></span>
<span class="line"><span>   ▼</span></span>
<span class="line"><span>┌──────┐</span></span>
<span class="line"><span>│  L4  │  ← 开发自己调试</span></span>
<span class="line"><span>│ 调试 │</span></span>
<span class="line"><span>└──────┘</span></span></code></pre></div><p><strong>每个上层 dashboard 的 panel 都应该 &quot;drilldown&quot; 链接到下一层</strong>——值班点 L1 上的&quot;订单服务红了&quot;,直接跳到 L2 的订单服务总览。<strong>这是 Grafana 的 &quot;Data Links&quot; 功能,严重被低估</strong>。</p><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Grafana panel data link 配置</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">links</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">title</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;下钻到服务总览&quot;</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    url</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;/d/order-service?from=\${__from}&amp;to=\${__to}&quot;</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    targetBlank</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">false</span></span></code></pre></div><p><code>\${__from}</code> <code>\${__to}</code> 自动带上当前时间窗口——点过去时间一致,不用手动调。</p><hr><h2 id="五、dashboard-进-git-grafonnet-dashboard-as-code" tabindex="-1">五、Dashboard 进 Git:Grafonnet / dashboard-as-code <a class="header-anchor" href="#五、dashboard-进-git-grafonnet-dashboard-as-code" aria-label="Permalink to &quot;五、Dashboard 进 Git:Grafonnet / dashboard-as-code&quot;">​</a></h2><p><strong>Grafana 界面点点点是大部分团队的开发模式——这是 dashboard 工程化的最大障碍</strong>。</p><h3 id="_5-1-界面-dev-的死法" tabindex="-1">5.1 界面 dev 的死法 <a class="header-anchor" href="#_5-1-界面-dev-的死法" aria-label="Permalink to &quot;5.1 界面 dev 的死法&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>痛点 1: 没有版本历史</span></span>
<span class="line"><span>   &quot;谁改的这个 dashboard?上周还好的现在错了&quot;</span></span>
<span class="line"><span>   → Grafana 自带的 history 只保留 N 次,且没有 commit msg</span></span>
<span class="line"><span></span></span>
<span class="line"><span>痛点 2: 没有 review</span></span>
<span class="line"><span>   任何人都能上去改,改坏了不知道</span></span>
<span class="line"><span>   → 改 dashboard ≠ 改代码,但同样影响生产</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>痛点 3: 不能批量改</span></span>
<span class="line"><span>   &quot;我们 30 个微服务都要加一个 SLO 阈值线&quot;</span></span>
<span class="line"><span>   → 在 GUI 改 30 次,改完发现单位错了,再改 30 次</span></span>
<span class="line"><span></span></span>
<span class="line"><span>痛点 4: 不能跨环境迁移</span></span>
<span class="line"><span>   测试环境调好了,prod 怎么同步?</span></span>
<span class="line"><span>   → 导出 JSON 再 import,但每次都漂移</span></span>
<span class="line"><span></span></span>
<span class="line"><span>痛点 5: 不能 backup</span></span>
<span class="line"><span>   服务器挂了,dashboard 全没</span></span></code></pre></div><h3 id="_5-2-dashboard-as-code-三条路" tabindex="-1">5.2 Dashboard as Code:三条路 <a class="header-anchor" href="#_5-2-dashboard-as-code-三条路" aria-label="Permalink to &quot;5.2 Dashboard as Code:三条路&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>路 1: 纯 JSON</span></span>
<span class="line"><span>   - Grafana 原生的 JSON 模型</span></span>
<span class="line"><span>   - 导出 / 导入 / 进 Git</span></span>
<span class="line"><span>   - 优点:零学习成本</span></span>
<span class="line"><span>   - 缺点:JSON 4000 行,改一个 panel 改半天</span></span>
<span class="line"><span></span></span>
<span class="line"><span>路 2: Grafonnet(Jsonnet for Grafana)</span></span>
<span class="line"><span>   - Grafana 官方的&quot;代码生成 dashboard&quot;工具</span></span>
<span class="line"><span>   - Jsonnet 语言,函数 / 变量 / 复用</span></span>
<span class="line"><span>   - 优点:批量生成 / 模板化 / DRY</span></span>
<span class="line"><span>   - 缺点:Jsonnet 学习曲线</span></span>
<span class="line"><span></span></span>
<span class="line"><span>路 3: Terraform Grafana Provider</span></span>
<span class="line"><span>   - 用 Terraform 管理 Grafana 资源</span></span>
<span class="line"><span>   - 优点:和基础设施 IaC 统一</span></span>
<span class="line"><span>   - 缺点:对 panel 级别的微调不友好</span></span></code></pre></div><p><strong>我的推荐</strong>:<strong>Grafonnet</strong>——批量生成的能力对 100 微服务团队是刚需,<strong>Terraform 适合管 datasource / folder / user 这种粗粒度资源</strong>,JSON 适合一次性 prototype。</p><h3 id="_5-3-一个最小-grafonnet-例子" tabindex="-1">5.3 一个最小 Grafonnet 例子 <a class="header-anchor" href="#_5-3-一个最小-grafonnet-例子" aria-label="Permalink to &quot;5.3 一个最小 Grafonnet 例子&quot;">​</a></h3><div class="language-jsonnet vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">jsonnet</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">// dashboards/lib/service-overview.libsonnet</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">local</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> g </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> import</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;grafonnet/grafana.libsonnet&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">// 一个服务总览的模板函数</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">local</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> serviceOverview</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(serviceName, slo) </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> </span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  g.dashboard.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">new</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    title=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;%s - Service Overview&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> % serviceName,</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    refresh=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;30s&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    time_from=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;now-1h&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    tags=[</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;service-overview&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, serviceName],</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  )</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  // ── Row 1: 黄金 4 信号 ──</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  .</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">addPanel</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    g.graphPanel.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">new</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      title=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;Traffic (QPS)&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      datasource=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;prometheus&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    )</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    .</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">addTarget</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(g.prometheus.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">target</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">      &#39;sum(rate(http_requests_total{service=&quot;%s&quot;}[5m]))&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> % serviceName,</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      legendFormat=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;{{ service }}&#39;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    )),</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    gridPos={x: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">0</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, y: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">0</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, w: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">12</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, h: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">8</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  )</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  .</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">addPanel</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    g.graphPanel.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">new</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      title=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;Errors (rate %)&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      datasource=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;prometheus&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      thresholds=[</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        {value: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">1</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> - slo, color: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;red&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">},   </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">// SLO 违约线</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        {value: (</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">1</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> - slo) * </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">0.5</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, color: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;yellow&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">},</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      ],</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    )</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    .</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">addTarget</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(g.prometheus.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">target</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">      ||| </span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">        sum(rate(http_requests_total{service=&quot;%s&quot;,status=~&quot;5..&quot;}[5m]))</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">        / sum(rate(http_requests_total{service=&quot;%s&quot;}[5m]))</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">      |||</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> % [serviceName, serviceName],</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      legendFormat=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;5xx ratio&#39;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    )),</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    gridPos</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">{</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">x:</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 12</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">y:</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 0</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">w:</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 12</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">h:</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 8</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  )</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  // ... P99 / Saturation 同理</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  ;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">// 生成 5 个服务的 dashboard</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">{</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;order-overview.json&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">:</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    serviceOverview</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;order&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">0.999</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">),</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;payment-overview.json&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">:</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  serviceOverview</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;payment&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">0.9995</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">),</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;user-overview.json&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">:</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">     serviceOverview</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;user&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">0.999</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">),</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;cart-overview.json&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">:</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">     serviceOverview</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;cart&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">0.99</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">),</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;catalog-overview.json&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">:</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  serviceOverview</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;catalog&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">0.995</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">),</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span></code></pre></div><p><strong>这段代码做了什么</strong>:</p><ol><li><strong><code>serviceOverview</code> 函数</strong>:抽象出&quot;服务总览模板&quot;,参数化服务名 + SLO</li><li><strong>批量生成</strong>:5 个服务一个文件,改模板一次,5 个 dashboard 同步更新</li><li><strong>SLO 阈值线参数化</strong>:每个服务的 SLO 不一样(支付严 / cart 松),自动算出阈值</li></ol><p><strong>编译</strong>:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">jsonnet</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -J</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> vendor</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -m</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> dashboards/output</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> dashboards/main.jsonnet</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 输出 5 个 .json 文件,push 到 Grafana</span></span></code></pre></div><h3 id="_5-4-grafana-provisioning-自动加载" tabindex="-1">5.4 Grafana provisioning:自动加载 <a class="header-anchor" href="#_5-4-grafana-provisioning-自动加载" aria-label="Permalink to &quot;5.4 Grafana provisioning:自动加载&quot;">​</a></h3><p>写完 JSON 还要让 Grafana 自己加载——<strong>provisioning</strong> 就是这个。</p><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># /etc/grafana/provisioning/datasources/datasources.yaml</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">apiVersion</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">1</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">datasources</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">prometheus</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    type</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">prometheus</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    access</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">proxy</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    url</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">http://prometheus.monitoring:9090</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    isDefault</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">true</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    jsonData</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      timeInterval</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;15s&#39;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">loki</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    type</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">loki</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    access</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">proxy</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    url</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">http://loki.monitoring:3100</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">tempo</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    type</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">tempo</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    access</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">proxy</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    url</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">http://tempo.monitoring:3200</span></span></code></pre></div><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># /etc/grafana/provisioning/dashboards/dashboards.yaml</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">apiVersion</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">1</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">providers</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;service-overview&#39;</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    orgId</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">1</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    folder</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;Services&#39;</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    folderUid</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">services-folder</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    type</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">file</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    disableDeletion</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">false</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    updateIntervalSeconds</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">30</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    allowUiUpdates</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">false</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">      # ← 关键:UI 改不动,只能 Git 改</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    options</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      path</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">/var/lib/grafana/dashboards/services</span></span></code></pre></div><p><strong>关键</strong>:<code>allowUiUpdates: false</code>——<strong>禁止 UI 修改</strong>,所有 dashboard 必须走 Git PR。<strong>这一条不开,前面 Grafonnet 工作白做</strong>,因为有人会在 UI 上偷偷改。</p><h3 id="_5-5-完整-ci-cd-链路" tabindex="-1">5.5 完整 CI/CD 链路 <a class="header-anchor" href="#_5-5-完整-ci-cd-链路" aria-label="Permalink to &quot;5.5 完整 CI/CD 链路&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>开发流程:</span></span>
<span class="line"><span>   1. 改 Grafonnet 代码(local 跑 jsonnet 编译)</span></span>
<span class="line"><span>   2. PR 进 Git</span></span>
<span class="line"><span>   3. SRE Lead review:命名、单位、阈值、布局</span></span>
<span class="line"><span>   4. 合并后 CI 跑:</span></span>
<span class="line"><span>      - jsonnet compile</span></span>
<span class="line"><span>      - JSON schema 校验</span></span>
<span class="line"><span>      - rsync 到 Grafana 节点的 /var/lib/grafana/dashboards/</span></span>
<span class="line"><span>   5. Grafana provisioning 自动 reload(30s 内)</span></span>
<span class="line"><span>   6. 验证:新 dashboard 出现在 Grafana UI</span></span>
<span class="line"><span></span></span>
<span class="line"><span>回滚:</span></span>
<span class="line"><span>   git revert + CI 重跑 → dashboard 自动回到旧版</span></span></code></pre></div><p><strong>这套链路 vs UI 改的差别</strong>:</p><table tabindex="0"><thead><tr><th>维度</th><th>UI 改</th><th>Git + CI</th></tr></thead><tbody><tr><td>版本历史</td><td>Grafana 内置 N 条</td><td>Git 全部</td></tr><tr><td>Review</td><td>没有</td><td>必须 PR</td></tr><tr><td>批量更改</td><td>一次只能一个</td><td>改模板批量</td></tr><tr><td>跨环境同步</td><td>手动 export/import</td><td>同代码同 dashboard</td></tr><tr><td>离线编辑</td><td>不能</td><td>可以</td></tr><tr><td>回滚</td><td>找 history 复制</td><td>git revert</td></tr></tbody></table><hr><h2 id="六、不要用截图汇报-dashboard-链接是基本素养" tabindex="-1">六、不要用截图汇报:dashboard 链接是基本素养 <a class="header-anchor" href="#六、不要用截图汇报-dashboard-链接是基本素养" aria-label="Permalink to &quot;六、不要用截图汇报:dashboard 链接是基本素养&quot;">​</a></h2><p>讲完工程,<strong>讲一个文化</strong>——这是导致 dashboard 失效的最大组织反模式。</p><h3 id="_6-1-截图反模式" tabindex="-1">6.1 截图反模式 <a class="header-anchor" href="#_6-1-截图反模式" aria-label="Permalink to &quot;6.1 截图反模式&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>PM:    &quot;上周服务可用性怎么样?&quot;</span></span>
<span class="line"><span>工程师:发了一张 Grafana 截图到飞书</span></span>
<span class="line"><span></span></span>
<span class="line"><span>PM:    &quot;这是哪天的?&quot;</span></span>
<span class="line"><span>工程师:&quot;上周三的&quot;</span></span>
<span class="line"><span>PM:    &quot;上周三是几号?&quot;</span></span>
<span class="line"><span>工程师:&quot;呃...8 月 14 号&quot;</span></span>
<span class="line"><span>PM:    &quot;范围是什么?&quot;</span></span>
<span class="line"><span>工程师:&quot;24 小时&quot;</span></span>
<span class="line"><span>PM:    &quot;从几点到几点?&quot;</span></span>
<span class="line"><span>工程师:&quot;我看下 ... UTC+8 9 点到次日 9 点&quot;</span></span>
<span class="line"><span>PM:    &quot;现在还能看到吗?&quot;</span></span>
<span class="line"><span>工程师:&quot;等我再拉一下 ... 不一样了&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>(15 分钟过去了,问题还没回答清楚)</span></span></code></pre></div><h3 id="_6-2-链接-标注的正确做法" tabindex="-1">6.2 链接 + 标注的正确做法 <a class="header-anchor" href="#_6-2-链接-标注的正确做法" aria-label="Permalink to &quot;6.2 链接 + 标注的正确做法&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>PM:    &quot;上周服务可用性怎么样?&quot;</span></span>
<span class="line"><span>工程师:发了一个 Grafana share link</span></span>
<span class="line"><span>       https://grafana.../d/order-overview?</span></span>
<span class="line"><span>         from=2024-08-14T09:00:00&amp;to=2024-08-15T09:00:00</span></span>
<span class="line"><span>       </span></span>
<span class="line"><span>       附文字:</span></span>
<span class="line"><span>       &quot;8 月 14 日 0:00-24:00 (UTC+8),order 服务:</span></span>
<span class="line"><span>        - 可用性 99.92%,SLO 99.9% 略超</span></span>
<span class="line"><span>        - 主要故障:23:15-23:38 缓存故障</span></span>
<span class="line"><span>        - 详细看 panel &#39;Error rate by endpoint&#39;&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>(2 分钟,问题完整回答)</span></span></code></pre></div><p><strong>链接 + 时间窗口 + 标注</strong>——这三件事是 dashboard 工程的&quot;沟通工程&quot;,<strong>比 dashboard 本身的设计更重要</strong>。</p><h3 id="_6-3-dashboard-share-的最佳实践" tabindex="-1">6.3 dashboard share 的最佳实践 <a class="header-anchor" href="#_6-3-dashboard-share-的最佳实践" aria-label="Permalink to &quot;6.3 dashboard share 的最佳实践&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>要把 dashboard 链接发出去时:</span></span>
<span class="line"><span>   1. 锁定时间窗口(用绝对时间不是 &quot;last 1h&quot;)</span></span>
<span class="line"><span>   2. 锁定变量(具体服务 / 具体环境)</span></span>
<span class="line"><span>   3. 用 Grafana 的 &quot;Share -&gt; Snapshot&quot; 而不是普通链接</span></span>
<span class="line"><span>      → 截图 + 数据快照,即使原数据被删也能看</span></span>
<span class="line"><span>   4. 重要场景用 &quot;Reporting&quot; 自动出 PDF</span></span>
<span class="line"><span>   5. 长链接用短链工具(避免 IM 截断)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>❌ 反模式:</span></span>
<span class="line"><span>   - 截图存到 Notion / Excel 里</span></span>
<span class="line"><span>   - 截图后 dashboard 就改了,</span></span>
<span class="line"><span>     图上的数据再也对不上 Grafana 现状</span></span>
<span class="line"><span>   - 截图丢了上下文(看图人不知道是哪天哪个服务)</span></span></code></pre></div><h3 id="_6-4-老板-高管的-l1-dashboard-是另一个故事" tabindex="-1">6.4 老板 / 高管的 L1 dashboard 是另一个故事 <a class="header-anchor" href="#_6-4-老板-高管的-l1-dashboard-是另一个故事" aria-label="Permalink to &quot;6.4 老板 / 高管的 L1 dashboard 是另一个故事&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>对老板:</span></span>
<span class="line"><span>   - 提供&quot;链接&quot; + &quot;解读&quot; 双发</span></span>
<span class="line"><span>   - 链接给&quot;可以验证&quot;,解读给&quot;5 秒看完&quot;</span></span>
<span class="line"><span>   - L1 dashboard 必须有大字号、SLO 状态、错误预算</span></span>
<span class="line"><span>   - 不要让老板自己去推导</span></span>
<span class="line"><span></span></span>
<span class="line"><span>对工程师:</span></span>
<span class="line"><span>   - 直接链接,带时间 + 服务参数</span></span>
<span class="line"><span>   - 不要解读(浪费时间)</span></span></code></pre></div><hr><h2 id="七、6-条踩坑提醒" tabindex="-1">七、6 条踩坑提醒 <a class="header-anchor" href="#七、6-条踩坑提醒" aria-label="Permalink to &quot;七、6 条踩坑提醒&quot;">​</a></h2><p>每条都见过 N 次,<strong>直接看代码 / 改 dashboard 时一条条验</strong>。</p><h3 id="_7-1-坑-1-时间不同步-timezone-时间窗口不一致" tabindex="-1">7.1 坑 1:时间不同步(timezone / 时间窗口不一致) <a class="header-anchor" href="#_7-1-坑-1-时间不同步-timezone-时间窗口不一致" aria-label="Permalink to &quot;7.1 坑 1:时间不同步(timezone / 时间窗口不一致)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>症状:</span></span>
<span class="line"><span>   panel A 看 UTC 时间,panel B 看 UTC+8 时间</span></span>
<span class="line"><span>   值班对比两个 panel,以为延迟 8 小时</span></span>
<span class="line"><span></span></span>
<span class="line"><span>修复:</span></span>
<span class="line"><span>   - Grafana 设默认 timezone(UTC 或 UTC+8 二选一,贯穿全局)</span></span>
<span class="line"><span>   - dashboard variables 时间统一</span></span>
<span class="line"><span>   - 跨地区团队:统一用 UTC,值班自己心里换算</span></span>
<span class="line"><span>     (不要让数据带时区,数据带时区是噩梦)</span></span></code></pre></div><h3 id="_7-2-坑-2-刷新太快-refresh-interval" tabindex="-1">7.2 坑 2:刷新太快(refresh interval) <a class="header-anchor" href="#_7-2-坑-2-刷新太快-refresh-interval" aria-label="Permalink to &quot;7.2 坑 2:刷新太快(refresh interval)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>症状:</span></span>
<span class="line"><span>   dashboard 设 5s 刷新</span></span>
<span class="line"><span>   panel 越多,Prometheus 越扛不住</span></span>
<span class="line"><span>   30 个 panel × 12 次/分钟 = 360 次/分钟查询</span></span>
<span class="line"><span>   值班一开 dashboard,Prometheus CPU 飙</span></span>
<span class="line"><span></span></span>
<span class="line"><span>修复:</span></span>
<span class="line"><span>   - L1 / L2:30s-1min 刷新(实时性够)</span></span>
<span class="line"><span>   - L3:1-5min 刷新(排障级别)</span></span>
<span class="line"><span>   - L4:不自动刷新(手动按钮)</span></span>
<span class="line"><span>   - 高基数查询用 recording rule 预算好</span></span></code></pre></div><h3 id="_7-3-坑-3-用-instant-query-不用-range-query" tabindex="-1">7.3 坑 3:用 instant query 不用 range query <a class="header-anchor" href="#_7-3-坑-3-用-instant-query-不用-range-query" aria-label="Permalink to &quot;7.3 坑 3:用 instant query 不用 range query&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错的:</span></span>
<span class="line"><span>   sum(http_requests_total{service=&quot;order&quot;})    ← 累计值</span></span>
<span class="line"><span>   出来一条单调上升的曲线,看起来&quot;流量在涨!&quot;</span></span>
<span class="line"><span>   实际是&quot;counter 一直在累计,从来没下降过&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>对的:</span></span>
<span class="line"><span>   sum(rate(http_requests_total{service=&quot;order&quot;}[5m]))  ← 速率</span></span>
<span class="line"><span>   出来真实的 QPS 曲线</span></span>
<span class="line"><span></span></span>
<span class="line"><span>详见 07 篇 PromQL 实战。这条坑出现频率太高,</span></span>
<span class="line"><span>凡是 panel 看上去&quot;曲线只涨不跌&quot;的,都是这个 bug</span></span></code></pre></div><h3 id="_7-4-坑-4-变量联动慢-template-variables" tabindex="-1">7.4 坑 4:变量联动慢(template variables) <a class="header-anchor" href="#_7-4-坑-4-变量联动慢-template-variables" aria-label="Permalink to &quot;7.4 坑 4:变量联动慢(template variables)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>症状:</span></span>
<span class="line"><span>   dashboard 顶部有 service / endpoint 两个下拉</span></span>
<span class="line"><span>   切换 service 时,endpoint 下拉刷新要 10 秒</span></span>
<span class="line"><span>   值班点一下 → 等 → 再点 → 等 → 沮丧</span></span>
<span class="line"><span></span></span>
<span class="line"><span>修复:</span></span>
<span class="line"><span>   - 变量查询用 label_values() 而不是全表 scan</span></span>
<span class="line"><span>     ✓ label_values(http_requests_total, service)</span></span>
<span class="line"><span>     ✗ http_requests_total{}</span></span>
<span class="line"><span>   - 用 recording rule 缩小查询面</span></span>
<span class="line"><span>   - 高基数 label 不要做成变量(用文本搜索代替)</span></span>
<span class="line"><span>   - 多变量级联:子变量加 datasource 缓存</span></span></code></pre></div><h3 id="_7-5-坑-5-annotations-没用-失去事件标注" tabindex="-1">7.5 坑 5:annotations 没用,失去事件标注 <a class="header-anchor" href="#_7-5-坑-5-annotations-没用-失去事件标注" aria-label="Permalink to &quot;7.5 坑 5:annotations 没用,失去事件标注&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>症状:</span></span>
<span class="line"><span>   值班看 P99 曲线&quot;3 点开始飙&quot;,</span></span>
<span class="line"><span>   但他不知道 2:55 发了一个版本</span></span>
<span class="line"><span></span></span>
<span class="line"><span>修复:</span></span>
<span class="line"><span>   用 Grafana annotations 标注:</span></span>
<span class="line"><span>   - 发布事件(从 ArgoCD / Jenkins webhook 写入)</span></span>
<span class="line"><span>   - 告警事件(Alertmanager webhook)</span></span>
<span class="line"><span>   - 容量变更(HPA scale 事件)</span></span>
<span class="line"><span>   - 维护窗口</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   配置示例(发布事件作为 annotation):</span></span>
<span class="line"><span>   - datasource: prometheus</span></span>
<span class="line"><span>     query: changes(version_info{service=&quot;order&quot;}[1h]) &gt; 0</span></span>
<span class="line"><span>     iconColor: blue</span></span>
<span class="line"><span>     name: deploys</span></span>
<span class="line"><span>     tags: [deploy]</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   值班看图:在飙升点上有蓝色竖线 &quot;deploy 14:55&quot;</span></span>
<span class="line"><span>   30 秒定位&quot;是发布引起的&quot;</span></span></code></pre></div><h3 id="_7-6-坑-6-单位错-0-1-比例-b-gb-混用" tabindex="-1">7.6 坑 6:单位错(% / 0-1 比例 / B / GB 混用) <a class="header-anchor" href="#_7-6-坑-6-单位错-0-1-比例-b-gb-混用" aria-label="Permalink to &quot;7.6 坑 6:单位错(% / 0-1 比例 / B / GB 混用)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>症状:</span></span>
<span class="line"><span>   panel 显示 &quot;0.85&quot; → 是 85% 还是 0.85 GB 还是 85 个错?</span></span>
<span class="line"><span>   panel 显示 &quot;1.2K&quot; → 1200 还是 1200 万?</span></span>
<span class="line"><span></span></span>
<span class="line"><span>修复:</span></span>
<span class="line"><span>   每个 panel 必须设 unit:</span></span>
<span class="line"><span>   - 比例:percentunit(0-1 范围)或 percent(0-100 范围)</span></span>
<span class="line"><span>   - 字节:bytes (auto-scale to KB/MB/GB)</span></span>
<span class="line"><span>   - 时间:s / ms (auto-scale)</span></span>
<span class="line"><span>   - 计数:short / none</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   Grafana 设 unit 是免费的,</span></span>
<span class="line"><span>   不设就是工程不及格</span></span></code></pre></div><hr><h2 id="八、dashboard-工程的硬指标" tabindex="-1">八、Dashboard 工程的硬指标 <a class="header-anchor" href="#八、dashboard-工程的硬指标" aria-label="Permalink to &quot;八、Dashboard 工程的硬指标&quot;">​</a></h2><h3 id="_8-1-4-个核心指标" tabindex="-1">8.1 4 个核心指标 <a class="header-anchor" href="#_8-1-4-个核心指标" aria-label="Permalink to &quot;8.1 4 个核心指标&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌──────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  Dashboard 工程健康度                                │</span></span>
<span class="line"><span>├──────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>│  1. 覆盖率                                            │</span></span>
<span class="line"><span>│      = 有 L2 总览的服务数 / 用户面服务数              │</span></span>
<span class="line"><span>│      目标:100%                                       │</span></span>
<span class="line"><span>│      没 L2 的服务等于&quot;出事没看的地方&quot;                 │</span></span>
<span class="line"><span>│                                                      │</span></span>
<span class="line"><span>│  2. 命中率                                            │</span></span>
<span class="line"><span>│      = 事故里实际打开了 dashboard / 事故总数          │</span></span>
<span class="line"><span>│      目标:&gt; 90%                                      │</span></span>
<span class="line"><span>│      &lt; 70% = dashboard 设计有问题,值班用不上         │</span></span>
<span class="line"><span>│                                                      │</span></span>
<span class="line"><span>│  3. 死 dashboard 比例                                 │</span></span>
<span class="line"><span>│      = 30 天 0 访问的 dashboard / 总数                │</span></span>
<span class="line"><span>│      目标:&lt; 20%                                      │</span></span>
<span class="line"><span>│      Grafana 自带 usage stats                        │</span></span>
<span class="line"><span>│                                                      │</span></span>
<span class="line"><span>│  4. UI 改动比例                                       │</span></span>
<span class="line"><span>│      = UI 改动的 dashboard / 总 dashboard 变更        │</span></span>
<span class="line"><span>│      目标:0%                                         │</span></span>
<span class="line"><span>│      理想是 100% Git 改,UI 是只读模式                │</span></span>
<span class="line"><span>└──────────────────────────────────────────────────────┘</span></span></code></pre></div><h3 id="_8-2-季度审计" tabindex="-1">8.2 季度审计 <a class="header-anchor" href="#_8-2-季度审计" aria-label="Permalink to &quot;8.2 季度审计&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>每季度做一次 dashboard 大扫除:</span></span>
<span class="line"><span>   - 删 30 天没访问的(留个 archived 文件夹存 30 天)</span></span>
<span class="line"><span>   - 合并重复(同一个服务的 3 个总览,留 1 个)</span></span>
<span class="line"><span>   - 检查死链(指标已下线但 dashboard 还在引用)</span></span>
<span class="line"><span>   - 验证关键 panel 还能跑(数据源迁移后常坏)</span></span></code></pre></div><p><strong>这件事不做,Grafana 6 个月必腐烂</strong>——和告警治理(15 篇 §7)是一对的工程动作。</p><hr><h2 id="九、何时不该上完整-dashboard-工程" tabindex="-1">九、何时不该上完整 dashboard 工程 <a class="header-anchor" href="#九、何时不该上完整-dashboard-工程" aria-label="Permalink to &quot;九、何时不该上完整 dashboard 工程&quot;">​</a></h2><h3 id="_9-1-团队-5-人-服务-10-个" tabindex="-1">9.1 团队 &lt; 5 人 / 服务 &lt; 10 个 <a class="header-anchor" href="#_9-1-团队-5-人-服务-10-个" aria-label="Permalink to &quot;9.1 团队 &lt; 5 人 / 服务 &lt; 10 个&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>典型情况:</span></span>
<span class="line"><span>   - 全员能记住所有服务</span></span>
<span class="line"><span>   - dashboard 5-10 个,直接 UI 维护</span></span>
<span class="line"><span>   - 出事就拉群,不需要 dashboard 自助</span></span>
<span class="line"><span></span></span>
<span class="line"><span>够用方案:</span></span>
<span class="line"><span>   - Grafana UI 改,定期 export 到 Git backup</span></span>
<span class="line"><span>   - 不上 Grafonnet,JSON 都不用太严格</span></span>
<span class="line"><span>   - L1 一个,L2 每个服务一个,共 5-10 个</span></span>
<span class="line"><span></span></span>
<span class="line"><span>什么时候升级:</span></span>
<span class="line"><span>   服务 &gt; 30 个 或 团队 &gt; 10 人,UI 改不动了</span></span></code></pre></div><h3 id="_9-2-实验项目-短命产品" tabindex="-1">9.2 实验项目 / 短命产品 <a class="header-anchor" href="#_9-2-实验项目-短命产品" aria-label="Permalink to &quot;9.2 实验项目 / 短命产品&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>还在 PMF / 6 个月内可能下线的产品:</span></span>
<span class="line"><span>   - 用最小 dashboard,只看核心指标</span></span>
<span class="line"><span>   - 不上 L3/L4,出事直接 SSH</span></span>
<span class="line"><span>   - 别浪费工程时间画完美 dashboard</span></span></code></pre></div><h3 id="_9-3-内部工具-后台系统" tabindex="-1">9.3 内部工具 / 后台系统 <a class="header-anchor" href="#_9-3-内部工具-后台系统" aria-label="Permalink to &quot;9.3 内部工具 / 后台系统&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>没有外部用户的服务:</span></span>
<span class="line"><span>   - L1 不需要(没业务方看)</span></span>
<span class="line"><span>   - L2 简化(就 4 个金信号)</span></span>
<span class="line"><span>   - L3 用通用 node-exporter dashboard 就行</span></span>
<span class="line"><span>   - L4 看团队自己 ROI</span></span></code></pre></div><p><strong>完整 dashboard 工程是给&quot;对生产负责&quot;的服务的</strong>——内部工具凭性价比看。</p><hr><h2 id="十、dashboard-工程的落地路线图" tabindex="-1">十、Dashboard 工程的落地路线图 <a class="header-anchor" href="#十、dashboard-工程的落地路线图" aria-label="Permalink to &quot;十、Dashboard 工程的落地路线图&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌─────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  阶段 1(第 1-2 周):救火                                │</span></span>
<span class="line"><span>│   - 列出团队所有 dashboard,标使用频率                   │</span></span>
<span class="line"><span>│   - 找出&quot;导航灯堆&quot;的,改成 4 象限黄金信号                │</span></span>
<span class="line"><span>│   - 每个用户面服务画一个 L2 总览                         │</span></span>
<span class="line"><span>│   - 不动 L3 / L4(还轮不到)                            │</span></span>
<span class="line"><span>│                                                         │</span></span>
<span class="line"><span>│  阶段 2(第 3-6 周):分层                                │</span></span>
<span class="line"><span>│   - L1 业务总览:做 1 个给 PM / 老板的大屏               │</span></span>
<span class="line"><span>│   - L2 服务总览:模板化,每个服务一个                    │</span></span>
<span class="line"><span>│   - L3 资源详情:用 node-exporter / cAdvisor 现成模板    │</span></span>
<span class="line"><span>│   - L4 调试:让开发自己加(不强制)                      │</span></span>
<span class="line"><span>│                                                         │</span></span>
<span class="line"><span>│  阶段 3(第 2-3 个月):工程化                            │</span></span>
<span class="line"><span>│   - dashboard 进 Git,allowUiUpdates: false              │</span></span>
<span class="line"><span>│   - 引入 Grafonnet / Terraform Provider                  │</span></span>
<span class="line"><span>│   - CI 校验:命名、单位、SLO 阈值                        │</span></span>
<span class="line"><span>│                                                         │</span></span>
<span class="line"><span>│  阶段 4(第 4-6 个月):优化                              │</span></span>
<span class="line"><span>│   - usage stats 驱动:删死的,优化高频的                  │</span></span>
<span class="line"><span>│   - annotations 接入发布 / 告警事件                      │</span></span>
<span class="line"><span>│   - L1 加 status page 给客户看                          │</span></span>
<span class="line"><span>└─────────────────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>很多团队卡在阶段 1</strong>——一直在和导航灯堆斗争。<strong>进阶段 3 之后,dashboard 才能像代码一样被工程化管理</strong>。</p><hr><h2 id="十一、和其他篇的关系" tabindex="-1">十一、和其他篇的关系 <a class="header-anchor" href="#十一、和其他篇的关系" aria-label="Permalink to &quot;十一、和其他篇的关系&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>14(RED / USE)定义 dashboard panel 上画什么指标</span></span>
<span class="line"><span>15(告警)定义阈值线 / SLO 线画在 dashboard 上</span></span>
<span class="line"><span>本篇定义&quot;这些指标怎么布局、怎么管理&quot;</span></span>
<span class="line"><span>17(错误预算政治)定义 L1 给老板看什么</span></span>
<span class="line"><span></span></span>
<span class="line"><span>01-04(SRE 心智)讲&quot;可观测性&quot;,dashboard 是它的产出</span></span>
<span class="line"><span>06(Prometheus)给 dashboard 提供数据源</span></span>
<span class="line"><span>07(PromQL)写 dashboard 的查询</span></span>
<span class="line"><span>11(OTel / Trace)L4 调试 dashboard 离不开</span></span>
<span class="line"><span></span></span>
<span class="line"><span>28(On-call)值班用 L2</span></span>
<span class="line"><span>29(Runbook)Runbook 链接 L2 / L3</span></span>
<span class="line"><span>32(事故响应)IC 用 L1 跟高管同步,Ops 用 L2/L3 处置</span></span></code></pre></div><p><strong>Dashboard 是把 5-12 篇的可观测性&quot;翻译&quot;成可视化的桥梁</strong>——前面采集得再好,dashboard 拉胯,值班也看不见。</p><hr><h2 id="十二、本篇硬指标" tabindex="-1">十二、本篇硬指标 <a class="header-anchor" href="#十二、本篇硬指标" aria-label="Permalink to &quot;十二、本篇硬指标&quot;">​</a></h2><p>看完这一篇,你应该能给团队:</p><ul><li><strong>当天</strong>:用 §3.1 的四象限改造一个团队最常用的 dashboard,把&quot;导航灯堆&quot;清理掉</li><li><strong>一周内</strong>:画出团队 L1 / L2 / L3 的 dashboard 清单,补齐缺失的 L2(每个用户面服务一个)</li><li><strong>两周内</strong>:把 dashboard 进 Git,开 allowUiUpdates: false,所有变更走 PR</li><li><strong>一个月内</strong>:Grafonnet 化 5+ 个相似服务的 L2,做到改模板一次、5 个 dashboard 同步更新</li></ul><p>并且能在白板前讲清楚:</p><ul><li>为什么&quot;导航灯堆&quot;是反模式(§1.2)</li><li>一图一意原则的 4 条自检(§2.1)</li><li>四金信号在 dashboard 上的布局(§3.1)</li><li>L1-L4 分层的受众和打开频率(§4.1)</li><li>为什么 dashboard 必须进 Git 而不是 UI 改(§5.1)</li></ul><hr><blockquote><p>下一篇 <code>17-错误预算的政治学.md</code>,<strong>这一层最反直觉的一篇,讲政治博弈</strong>。SLO 算术再准、告警配得再好、dashboard 画得再漂亮,出事时产品说&quot;下周必须上&quot;——你怎么扛?这一篇讲清楚错误预算政策怎么写、谁来踩刹车、怎么跟 PM / CEO 把&quot;技术债&quot;翻译成&quot;赔钱&quot;、为什么&quot;不写政策的错误预算等于没有&quot;。<strong>14 / 15 / 16 是工程,17 是政治——SLO 工程层完结于此</strong>。</p></blockquote>`,128)])])}const g=a(l,[["render",e]]);export{k as __pageData,g as default};
