import{c as a,Q as n,j as i,m as p}from"./chunks/framework.Bhbi9jCp.js";const d=JSON.parse('{"title":"告警分级与降噪:P0 / P1 / P2 / 多窗口多燃烧率 / 别再用静态阈值","description":"","frontmatter":{},"headers":[],"relativePath":"devopsLearning/15-告警分级与降噪.md","filePath":"devopsLearning/15-告警分级与降噪.md","lastUpdated":1778496697000}'),l={name:"devopsLearning/15-告警分级与降噪.md"};function e(t,s,h,r,k,o){return n(),i("div",null,[...s[0]||(s[0]=[p(`<h1 id="告警分级与降噪-p0-p1-p2-多窗口多燃烧率-别再用静态阈值" tabindex="-1">告警分级与降噪:P0 / P1 / P2 / 多窗口多燃烧率 / 别再用静态阈值 <a class="header-anchor" href="#告警分级与降噪-p0-p1-p2-多窗口多燃烧率-别再用静态阈值" aria-label="Permalink to &quot;告警分级与降噪:P0 / P1 / P2 / 多窗口多燃烧率 / 别再用静态阈值&quot;">​</a></h1><p>这是这一层<strong>最有用</strong>的一篇。13 篇定义了 SLO,14 篇讲清楚 RED + USE,<strong>到这一篇,所有方法论必须收敛成一件事:告警</strong>——错误预算在烧、用户在骂,<strong>告警是把&quot;指标变成行动&quot;的唯一桥梁</strong>。这座桥搭歪了,前面 14 篇全废。</p><blockquote><p>一句话先记住:<strong>95% 的告警系统死法都是同一种——一开始按&quot;CPU &gt; 80%&quot;配,半年后告警群一天 200 条,所有人静音,真出事没人看</strong>。这条死法不是&quot;团队不努力&quot;,是<strong>静态阈值这个工具天生不适合&quot;被用户感知的系统&quot;</strong>——用户感知是长尾、是波动、是渐变,你用一条直线去截,要么截得太早(误报刷屏),要么截得太晚(用户已经走了你才告警)。<strong>Multi-Window Multi-Burn-Rate</strong>(多窗口多燃烧率)就是这个问题的工程解——这一篇大半篇幅都在讲它,<strong>因为它是这一层唯一能救命的工具</strong>。</p></blockquote><hr><h2 id="一、问题场景-静态阈值的四种死法" tabindex="-1">一、问题场景:静态阈值的四种死法 <a class="header-anchor" href="#一、问题场景-静态阈值的四种死法" aria-label="Permalink to &quot;一、问题场景:静态阈值的四种死法&quot;">​</a></h2><h3 id="_1-1-死法-a-cpu-80-在容器场景必爆" tabindex="-1">1.1 死法 A:CPU &gt; 80% 在容器场景必爆 <a class="header-anchor" href="#_1-1-死法-a-cpu-80-在容器场景必爆" aria-label="Permalink to &quot;1.1 死法 A:CPU &gt; 80% 在容器场景必爆&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>配置:</span></span>
<span class="line"><span>   alert: HighCPU</span></span>
<span class="line"><span>   expr: cpu_usage &gt; 0.8</span></span>
<span class="line"><span>   for: 5m</span></span>
<span class="line"><span></span></span>
<span class="line"><span>实际场景:</span></span>
<span class="line"><span>   - K8s 上跑 JVM,启动时 GC 把 CPU 顶到 95%(正常,持续 30s)</span></span>
<span class="line"><span>   - Cron 半夜跑批,CPU 90% 持续 5min(正常,业务无感)</span></span>
<span class="line"><span>   - HPA 扩容前夜,CPU 故意拉到 85% 触发(正常,这是设计)</span></span>
<span class="line"><span>   - 真出事时:某 Pod 死锁,CPU 100%,但只占节点 5%——节点 U 没飙</span></span>
<span class="line"><span></span></span>
<span class="line"><span>结果:</span></span>
<span class="line"><span>   - 误报:每天 20+ 条 &quot;正常 GC / Cron / HPA 触发&quot;</span></span>
<span class="line"><span>   - 漏报:Pod 卡死,节点维度看不到</span></span>
<span class="line"><span>   - 团队:静音了</span></span></code></pre></div><h3 id="_1-2-死法-b-错误率-1-在低-qps-必误报" tabindex="-1">1.2 死法 B:错误率 &gt; 1% 在低 QPS 必误报 <a class="header-anchor" href="#_1-2-死法-b-错误率-1-在低-qps-必误报" aria-label="Permalink to &quot;1.2 死法 B:错误率 &gt; 1% 在低 QPS 必误报&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>配置:</span></span>
<span class="line"><span>   alert: HighErrorRate</span></span>
<span class="line"><span>   expr: error_rate &gt; 0.01</span></span>
<span class="line"><span>   for: 1m</span></span>
<span class="line"><span></span></span>
<span class="line"><span>实际场景:</span></span>
<span class="line"><span>   QPS = 10:1 个错就是 10% → 误报海洋</span></span>
<span class="line"><span>   QPS = 100:1 个错是 1%,刚好触发,但 1 个错不算事故</span></span>
<span class="line"><span>   QPS = 10000:1% 才报,等于 100 个错——这才是事故</span></span>
<span class="line"><span></span></span>
<span class="line"><span>结果:</span></span>
<span class="line"><span>   - 凌晨 QPS 低,稍微抖一下就误报</span></span>
<span class="line"><span>   - 白天 QPS 高,1% 已经是大问题但还要等&quot;持续 1min&quot;</span></span>
<span class="line"><span>   - 阈值和流量无关 = 阈值就是错的</span></span></code></pre></div><h3 id="_1-3-死法-c-阈值拍脑袋-跟不上系统演化" tabindex="-1">1.3 死法 C:阈值拍脑袋,跟不上系统演化 <a class="header-anchor" href="#_1-3-死法-c-阈值拍脑袋-跟不上系统演化" aria-label="Permalink to &quot;1.3 死法 C:阈值拍脑袋,跟不上系统演化&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>2024 年 1 月:订单服务 P99 平均 200ms,配阈值 500ms</span></span>
<span class="line"><span>2024 年 6 月:接了支付 + 风控,P99 平均 400ms,500ms 阈值天天报</span></span>
<span class="line"><span>2024 年 9 月:有人嫌吵,改成 800ms,然后一直没人调</span></span>
<span class="line"><span>2025 年 3 月:真出事时 P99 飙到 700ms,告警还是不响</span></span>
<span class="line"><span>              (因为 700 &lt; 800)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>阈值定下来就再也没复检过——这是 90% 团队的现状</span></span></code></pre></div><h3 id="_1-4-死法-d-告警在抖动-值班在猜测" tabindex="-1">1.4 死法 D:告警在抖动,值班在猜测 <a class="header-anchor" href="#_1-4-死法-d-告警在抖动-值班在猜测" aria-label="Permalink to &quot;1.4 死法 D:告警在抖动,值班在猜测&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>配置:</span></span>
<span class="line"><span>   alert: P99High</span></span>
<span class="line"><span>   expr: p99 &gt; 0.5</span></span>
<span class="line"><span>   for: 1m</span></span>
<span class="line"><span></span></span>
<span class="line"><span>凌晨某段:</span></span>
<span class="line"><span>   01:00:00  P99 = 0.6  → 触发</span></span>
<span class="line"><span>   01:00:30  P99 = 0.4  → 恢复</span></span>
<span class="line"><span>   01:01:00  P99 = 0.7  → 又触发</span></span>
<span class="line"><span>   01:01:30  P99 = 0.45 → 又恢复</span></span>
<span class="line"><span>   01:02:00  P99 = 0.55 → 又触发</span></span>
<span class="line"><span>   ...</span></span>
<span class="line"><span>   值班:手机震 5 次,每次拿起来都&quot;已恢复&quot;</span></span>
<span class="line"><span>        第 6 次真出大事,值班以为又是抖动,30 分钟没看</span></span></code></pre></div><p><strong>抖动告警最毒</strong>——它不只是&quot;误报&quot;,而是<strong>主动训练值班人忽视告警</strong>。这个团队下一次真出事,MTTR 必然超过 30 分钟。</p><h3 id="_1-5-共同根因-静态阈值天生不适合用户感知" tabindex="-1">1.5 共同根因:静态阈值天生不适合用户感知 <a class="header-anchor" href="#_1-5-共同根因-静态阈值天生不适合用户感知" aria-label="Permalink to &quot;1.5 共同根因:静态阈值天生不适合用户感知&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>静态阈值的隐含假设:</span></span>
<span class="line"><span>   &quot;系统有一条明确的好/坏分界线&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>真实系统的状态:</span></span>
<span class="line"><span>   ▲ 服务延迟分布</span></span>
<span class="line"><span>   │                ╱ 真出事(超长)</span></span>
<span class="line"><span>   │              ╱</span></span>
<span class="line"><span>   │      ╲    ╱      ← 抖动 / GC / 批</span></span>
<span class="line"><span>   │       ╲ ╱        ← 噪声地带</span></span>
<span class="line"><span>   │       ╱╲</span></span>
<span class="line"><span>   │      ╱  ╲</span></span>
<span class="line"><span>   │     ╱    ╲       ← 正常波动</span></span>
<span class="line"><span>   │ ╱</span></span>
<span class="line"><span>   └────────────────────────────────▶ 时间</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   不存在&quot;一条线分两边&quot;的现实——任何一条线</span></span>
<span class="line"><span>   你都会同时砍掉一堆噪声和一些真事故</span></span></code></pre></div><p><strong>这就是为什么&quot;调一下阈值&quot;永远调不好</strong>——你不是在调参数,<strong>你是在用错误的工具回答问题</strong>。<strong>Multi-burn-rate 才是这个问题的正解</strong>(下面 §4 详述)。</p><hr><h2 id="二、告警分级-不是-严重程度-是-响应承诺" tabindex="-1">二、告警分级:不是&quot;严重程度&quot;,是&quot;响应承诺&quot; <a class="header-anchor" href="#二、告警分级-不是-严重程度-是-响应承诺" aria-label="Permalink to &quot;二、告警分级:不是&quot;严重程度&quot;,是&quot;响应承诺&quot;&quot;">​</a></h2><p>讲降噪之前,先把分级语义讲清楚。<strong>大部分团队的告警分级是错的</strong>——它们把&quot;问题严不严重&quot;和&quot;我们怎么响应&quot;搞混了。</p><h3 id="_2-1-p0-p3-的本质-响应承诺-不是问题描述" tabindex="-1">2.1 P0-P3 的本质:响应承诺,不是问题描述 <a class="header-anchor" href="#_2-1-p0-p3-的本质-响应承诺-不是问题描述" aria-label="Permalink to &quot;2.1 P0-P3 的本质:响应承诺,不是问题描述&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错的语义(描述问题严重程度):</span></span>
<span class="line"><span>   P0 = &quot;非常严重&quot;</span></span>
<span class="line"><span>   P1 = &quot;严重&quot;</span></span>
<span class="line"><span>   P2 = &quot;一般&quot;</span></span>
<span class="line"><span>   P3 = &quot;轻微&quot;</span></span>
<span class="line"><span>   → 问题:谁判断&quot;严重&quot;?不同人不同标准,告警分级靠拍脑袋</span></span>
<span class="line"><span></span></span>
<span class="line"><span>对的语义(描述响应承诺):</span></span>
<span class="line"><span>   P0 = 5min Ack / 30min 修 / 任何时段叫人 / SMS+电话</span></span>
<span class="line"><span>   P1 = 15min Ack / 2h 修 / 工作时间叫 / 短信即可</span></span>
<span class="line"><span>   P2 = 1h Ack / 1 工作日修 / 工作时间 IM 通知</span></span>
<span class="line"><span>   P3 = 异步 / 1 周修 / 周报里看见</span></span>
<span class="line"><span></span></span>
<span class="line"><span>为什么这套对:</span></span>
<span class="line"><span>   每条告警上线前,工程师必须回答&quot;我承诺什么响应时间&quot;</span></span>
<span class="line"><span>   有了承诺,值班和管理才有抓手</span></span></code></pre></div><h3 id="_2-2-完整对照表" tabindex="-1">2.2 完整对照表 <a class="header-anchor" href="#_2-2-完整对照表" aria-label="Permalink to &quot;2.2 完整对照表&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌─────┬──────────────┬──────────────┬──────────────┬──────────────┬──────────────┐</span></span>
<span class="line"><span>│ 等级│  Ack 时间    │  修复 SLA    │  通知通道     │  叫人时段     │  典型场景     │</span></span>
<span class="line"><span>├─────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┤</span></span>
<span class="line"><span>│ P0  │  5 分钟      │  30-60 分钟  │  SMS+电话    │  7x24 必叫    │  核心宕机    │</span></span>
<span class="line"><span>│     │              │              │  +Pager App  │              │  数据丢失     │</span></span>
<span class="line"><span>│     │              │              │  +IM         │              │  支付不可用   │</span></span>
<span class="line"><span>├─────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┤</span></span>
<span class="line"><span>│ P1  │  15 分钟     │  2-4 小时    │  短信+IM     │  工作时段叫  │  部分功能降级 │</span></span>
<span class="line"><span>│     │              │              │              │  夜间静音     │  SLO 持续燃烧 │</span></span>
<span class="line"><span>│     │              │              │              │              │  单可用区故障 │</span></span>
<span class="line"><span>├─────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┤</span></span>
<span class="line"><span>│ P2  │  1 小时      │  1 工作日    │  IM 推送     │  仅工作时段  │  告警但已自愈 │</span></span>
<span class="line"><span>│     │              │              │              │              │  Toil 累积    │</span></span>
<span class="line"><span>│     │              │              │              │              │  容量水位告警 │</span></span>
<span class="line"><span>├─────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┤</span></span>
<span class="line"><span>│ P3  │  无 SLA      │  1 周内      │  日报/周报    │  不叫        │  缓慢老化     │</span></span>
<span class="line"><span>│     │  (异步审视)│              │              │              │  低优 backlog│</span></span>
<span class="line"><span>└─────┴──────────────┴──────────────┴──────────────┴──────────────┴──────────────┘</span></span></code></pre></div><p><strong>这张表是团队 On-call 制度的契约</strong>——告警一旦标了 P0,就是&quot;凌晨 3 点必须有人接电话&quot;的承诺。<strong>贴在团队 wiki 第一页,所有人都能查到</strong>。</p><h3 id="_2-3-分级里最常见的两个错" tabindex="-1">2.3 分级里最常见的两个错 <a class="header-anchor" href="#_2-3-分级里最常见的两个错" aria-label="Permalink to &quot;2.3 分级里最常见的两个错&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错 1: 所有告警都是 P1</span></span>
<span class="line"><span>   症状:配告警的人想&quot;再次出大事时反应快&quot;,所有的都标 P1</span></span>
<span class="line"><span>   后果:夜里告警刷屏,真 P0 淹没,值班 burnout</span></span>
<span class="line"><span>   修复:严格区分,P0 占总告警 &lt; 5%,P1 &lt; 20%</span></span>
<span class="line"><span></span></span>
<span class="line"><span>错 2: 没有 P3,所有&quot;轻微&quot;的都不告</span></span>
<span class="line"><span>   症状:觉得 P3 没人看,干脆不告了</span></span>
<span class="line"><span>   后果:慢性问题在累积,3 个月后变成 P0</span></span>
<span class="line"><span>   修复:P3 不叫人但要留观察,周报里 review</span></span></code></pre></div><p><strong>配告警这件事的关键不是&quot;该不该告&quot;,是&quot;告到哪一级&quot;</strong>——这个判断错了,降噪从一开始就输了。</p><hr><h2 id="三、静态阈值的失败模式总结" tabindex="-1">三、静态阈值的失败模式总结 <a class="header-anchor" href="#三、静态阈值的失败模式总结" aria-label="Permalink to &quot;三、静态阈值的失败模式总结&quot;">​</a></h2><p>把第一节四种死法收敛成&quot;失败模式&quot;——下次你看到一条告警规则,<strong>用这四条照一遍</strong>,有违反就是设计错的:</p><h3 id="_3-1-失败模式-1-阈值和流量解耦" tabindex="-1">3.1 失败模式 1:阈值和流量解耦 <a class="header-anchor" href="#_3-1-失败模式-1-阈值和流量解耦" aria-label="Permalink to &quot;3.1 失败模式 1:阈值和流量解耦&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错: error_rate &gt; 0.01</span></span>
<span class="line"><span>对: 用 SLO + burn rate(下面 §4)</span></span>
<span class="line"><span>   或:error_rate &gt; 0.01 AND request_rate &gt; 100</span></span>
<span class="line"><span>   (低流量不告警)</span></span></code></pre></div><h3 id="_3-2-失败模式-2-阈值跟不上系统演化" tabindex="-1">3.2 失败模式 2:阈值跟不上系统演化 <a class="header-anchor" href="#_3-2-失败模式-2-阈值跟不上系统演化" aria-label="Permalink to &quot;3.2 失败模式 2:阈值跟不上系统演化&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错: 拍一次阈值再也不调</span></span>
<span class="line"><span>对: 把阈值绑到 baseline:</span></span>
<span class="line"><span>    expr: rate(errors[5m]) &gt; 3 * stddev_over_time(rate(errors[1d])[7d])</span></span>
<span class="line"><span>    &quot;现在错误率超过过去 7 天 baseline 的 3 倍&quot;</span></span>
<span class="line"><span>    </span></span>
<span class="line"><span>    或用 SLO:阈值跟着 SLO 走,SLO 每季度复检</span></span></code></pre></div><h3 id="_3-3-失败模式-3-窗口太短" tabindex="-1">3.3 失败模式 3:窗口太短 <a class="header-anchor" href="#_3-3-失败模式-3-窗口太短" aria-label="Permalink to &quot;3.3 失败模式 3:窗口太短&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错: for: 1m  → 必然抖动</span></span>
<span class="line"><span>对: 短期燃烧率 5min,长期 1h(双窗口)</span></span>
<span class="line"><span>    &quot;短期窗口快响应,长期窗口防抖&quot;</span></span>
<span class="line"><span>    </span></span>
<span class="line"><span>    一般经验:</span></span>
<span class="line"><span>    - P0: 短窗口 5min,长窗口 1h</span></span>
<span class="line"><span>    - P1: 短窗口 30min,长窗口 6h</span></span>
<span class="line"><span>    - P2: 短窗口 2h,长窗口 24h</span></span></code></pre></div><h3 id="_3-4-失败模式-4-单一阈值无差别覆盖业务" tabindex="-1">3.4 失败模式 4:单一阈值无差别覆盖业务 <a class="header-anchor" href="#_3-4-失败模式-4-单一阈值无差别覆盖业务" aria-label="Permalink to &quot;3.4 失败模式 4:单一阈值无差别覆盖业务&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错: P99 &gt; 500ms (全服务一刀切)</span></span>
<span class="line"><span>对: 按 endpoint 分级</span></span>
<span class="line"><span>    - 创建订单 P99 &lt; 500ms (核心,严)</span></span>
<span class="line"><span>    - 查询订单 P99 &lt; 1s    (重要,松)</span></span>
<span class="line"><span>    - 历史订单 P99 &lt; 3s    (非核心,松)</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   配告警按业务等级,不是一锅炖</span></span></code></pre></div><hr><h2 id="四、multi-window-multi-burn-rate-这一篇的核心" tabindex="-1">四、Multi-Window Multi-Burn-Rate:这一篇的核心 <a class="header-anchor" href="#四、multi-window-multi-burn-rate-这一篇的核心" aria-label="Permalink to &quot;四、Multi-Window Multi-Burn-Rate:这一篇的核心&quot;">​</a></h2><p><strong>讲到这里,正题来了</strong>。这一节是这一层最值钱的内容,我会讲得很细——<strong>理解它,你的告警系统就脱胎换骨</strong>。</p><h3 id="_4-1-燃烧率-burn-rate-是什么" tabindex="-1">4.1 燃烧率(Burn Rate)是什么 <a class="header-anchor" href="#_4-1-燃烧率-burn-rate-是什么" aria-label="Permalink to &quot;4.1 燃烧率(Burn Rate)是什么&quot;">​</a></h3><p>回想 13 篇的错误预算:<strong>99.9% SLO 一个月 = 43.2 分钟错误预算</strong>。但&quot;一个月 43 分钟&quot;是一个总数,<strong>实时怎么看消耗速度</strong>?这就是燃烧率。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>定义:</span></span>
<span class="line"><span>   burn rate = 当前错误率 / SLO 允许错误率</span></span>
<span class="line"><span>             = current error rate / (1 - SLO)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>例子(SLO = 99.9%,允许错误率 = 0.1%):</span></span>
<span class="line"><span>   当前 5min 错误率 = 1%</span></span>
<span class="line"><span>   burn rate = 1% / 0.1% = 10</span></span>
<span class="line"><span>   含义:&quot;按这个速度,1/10 的时间就能烧完一个月的预算&quot;</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   一个月有 30 * 24 * 60 = 43200 分钟</span></span>
<span class="line"><span>   烧完时间 = 43200 / 10 = 4320 分钟 ≈ 3 天</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   按当前速度,3 天烧完一个月的预算</span></span></code></pre></div><p><strong>这个比率&quot;几倍&quot;才是真正的事故严重程度——比绝对错误率更有意义</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错误率 1% 但 SLO = 99%(允许 1%):</span></span>
<span class="line"><span>   burn rate = 1</span></span>
<span class="line"><span>   一个月刚好烧完一个月预算 ← 正常</span></span>
<span class="line"><span></span></span>
<span class="line"><span>错误率 1% 但 SLO = 99.9%(允许 0.1%):</span></span>
<span class="line"><span>   burn rate = 10</span></span>
<span class="line"><span>   3 天烧完一个月预算 ← 大事故</span></span></code></pre></div><p><strong>同样 1% 错误率,在不同 SLO 下完全不同的紧急度</strong>——这就是为什么不能配&quot;错误率 &gt; 1% 就告警&quot;——<strong>它脱离了 SLO 上下文</strong>。</p><h3 id="_4-2-烧完预算-vs-速度告警-为什么-烧-是更好的视角" tabindex="-1">4.2 烧完预算 vs 速度告警:为什么&quot;烧&quot;是更好的视角 <a class="header-anchor" href="#_4-2-烧完预算-vs-速度告警-为什么-烧-是更好的视角" aria-label="Permalink to &quot;4.2 烧完预算 vs 速度告警:为什么&quot;烧&quot;是更好的视角&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>传统视角(状态):</span></span>
<span class="line"><span>   &quot;错误率超过阈值就告警&quot;</span></span>
<span class="line"><span>   → 错误率 0.5% 持续 30 天 = 不告警(没超阈值)</span></span>
<span class="line"><span>   → 但 30 天累计 ≈ 200 分钟错误 → SLO 烧穿</span></span>
<span class="line"><span></span></span>
<span class="line"><span>燃烧率视角(速率):</span></span>
<span class="line"><span>   &quot;按当前速度,N 小时烧完预算就告警&quot;</span></span>
<span class="line"><span>   → 错误率 0.5% 但 SLO 0.1% → burn rate = 5 → 6 天烧完 → 告</span></span>
<span class="line"><span>   → 错误率 0.3% 但 SLO 0.1% → burn rate = 3 → 10 天烧完 → 略</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   告警直接对应&quot;用户体验在变坏的速度&quot;,</span></span>
<span class="line"><span>   不是&quot;系统出错没有&quot;</span></span></code></pre></div><p><strong>燃烧率的真正威力是&quot;它直接连接到业务承诺&quot;</strong>——一条告警出来,值班看到 &quot;burn rate = 14&quot;,<strong>他知道这是&quot;再不停下来一小时就违约 SLA&quot;</strong>。这比 &quot;5xx 飙到 2%&quot; 信号量大 10 倍。</p><h3 id="_4-3-多窗口-multi-window-防抖动-不漏长尾" tabindex="-1">4.3 多窗口(Multi-Window):防抖动 + 不漏长尾 <a class="header-anchor" href="#_4-3-多窗口-multi-window-防抖动-不漏长尾" aria-label="Permalink to &quot;4.3 多窗口(Multi-Window):防抖动 + 不漏长尾&quot;">​</a></h3><p>单窗口的问题:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>窗口太短(5min):</span></span>
<span class="line"><span>   - 反应快,但抖动严重</span></span>
<span class="line"><span>   - 一次 GC stop 30s 就触发</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>窗口太长(1h):</span></span>
<span class="line"><span>   - 防抖好,但反应慢</span></span>
<span class="line"><span>   - 真出事故等 1h 才告警 → 半个 SLO 已烧</span></span></code></pre></div><p><strong>多窗口的解法</strong>:用<strong>两个或多个窗口同时计算 burn rate,必须都触发才告警</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>P0 告警的多窗口条件:</span></span>
<span class="line"><span>   短窗口(5min)burn rate &gt; X     ← 快响应</span></span>
<span class="line"><span>   AND</span></span>
<span class="line"><span>   长窗口(1h)burn rate &gt; X       ← 防抖动</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   只有短窗口 burn rate 高:抖动,不告</span></span>
<span class="line"><span>   只有长窗口 burn rate 高:慢性,P1 处理</span></span>
<span class="line"><span>   两者都高:真事故,P0 立即告</span></span></code></pre></div><h3 id="_4-4-多燃烧率-multi-burn-rate-不漏长尾事故" tabindex="-1">4.4 多燃烧率(Multi-Burn-Rate):不漏长尾事故 <a class="header-anchor" href="#_4-4-多燃烧率-multi-burn-rate-不漏长尾事故" aria-label="Permalink to &quot;4.4 多燃烧率(Multi-Burn-Rate):不漏长尾事故&quot;">​</a></h3><p><strong>只有一档 burn rate 阈值</strong>有什么问题?</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>配置:burn rate &gt; 14 才告 P0</span></span>
<span class="line"><span>场景:某次事故,错误率持续 0.3%(SLO=0.1%)</span></span>
<span class="line"><span>     burn rate = 3 → 不告 P0</span></span>
<span class="line"><span>     持续 10 天 → 预算烧光 → 用户已经骂街</span></span>
<span class="line"><span></span></span>
<span class="line"><span>为什么不告:14 倍门槛对这次&quot;慢性事故&quot;太高</span></span></code></pre></div><p><strong>多燃烧率的解法</strong>:用<strong>几档不同的 burn rate + 不同窗口配对</strong>,<strong>覆盖&quot;快速大事故&quot;和&quot;慢速小事故&quot;两种</strong>。</p><p>Google SRE 实战篇给的经典推荐(基于 99.9% SLO):</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌─────────┬───────────┬───────────┬───────────────────────────────┐</span></span>
<span class="line"><span>│  告警级 │ 短窗口    │ 长窗口    │   burn rate 阈值              │</span></span>
<span class="line"><span>├─────────┼───────────┼───────────┼───────────────────────────────┤</span></span>
<span class="line"><span>│  P0     │  5min     │  1h       │   &gt; 14.4(2% 预算/1h)         │</span></span>
<span class="line"><span>│  P1     │  30min    │  6h       │   &gt; 6   (5% 预算/6h)          │</span></span>
<span class="line"><span>│  P2     │  2h       │  24h      │   &gt; 3   (10% 预算/24h)        │</span></span>
<span class="line"><span>│  P3     │  6h       │  72h      │   &gt; 1   (10% 预算/3day)       │</span></span>
<span class="line"><span>└─────────┴───────────┴───────────┴───────────────────────────────┘</span></span></code></pre></div><p><strong>这套数字是 Google 经过大量实践得出的&quot;覆盖完整频谱&quot;配置</strong>——但中型团队不需要四档,<strong>用 P0 + P1 两档已经够 90% 场景</strong>。</p><h3 id="_4-5-三组数字的来源" tabindex="-1">4.5 三组数字的来源 <a class="header-anchor" href="#_4-5-三组数字的来源" aria-label="Permalink to &quot;4.5 三组数字的来源&quot;">​</a></h3><p>每一行的 burn rate 阈值是怎么算出来的?<strong>关键是&quot;在多长时间内会烧多少预算&quot;</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>P0: 1 小时烧 2% 预算 → 50 小时烧完整月预算 ≈ 2 天</span></span>
<span class="line"><span>   预算 = 1 个月 = 43200 min</span></span>
<span class="line"><span>   2% 预算 = 864 min</span></span>
<span class="line"><span>   1 小时 = 60 min</span></span>
<span class="line"><span>   burn rate = 864 / 60 = 14.4 ← 这个数字怎么来的</span></span>
<span class="line"><span></span></span>
<span class="line"><span>P1: 6 小时烧 5% 预算 → 5 天烧完整月预算</span></span>
<span class="line"><span>   5% 预算 = 2160 min</span></span>
<span class="line"><span>   6 小时 = 360 min</span></span>
<span class="line"><span>   burn rate = 2160 / 360 = 6</span></span>
<span class="line"><span></span></span>
<span class="line"><span>P2: 24 小时烧 10% 预算 → 10 天烧完整月预算</span></span>
<span class="line"><span>   10% 预算 = 4320 min</span></span>
<span class="line"><span>   24 小时 = 1440 min</span></span>
<span class="line"><span>   burn rate = 4320 / 1440 = 3</span></span></code></pre></div><p><strong>这套数字给你三个不同的&quot;故障速度光谱&quot;</strong>——快爆(P0)、中速(P1)、慢爆(P2)。<strong>一条告警规则覆盖不了三种,所以才要多燃烧率</strong>。</p><h3 id="_4-6-一段-prometheus-实现-可以直接抄" tabindex="-1">4.6 一段 Prometheus 实现:可以直接抄 <a class="header-anchor" href="#_4-6-一段-prometheus-实现-可以直接抄" aria-label="Permalink to &quot;4.6 一段 Prometheus 实现:可以直接抄&quot;">​</a></h3><p>这是这一篇最值钱的代码片段。<strong>复制改改就能上线</strong>:</p><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># alerts/burn_rate.yaml</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 假设 SLO = 99.9%(错误预算 = 0.1%)</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Service = order-service</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">groups</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">order-burn-rate</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    interval</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">30s</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    rules</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">      # ─── Recording rules: 提前算好不同窗口的错误率 ───</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">record</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">order:request_error_ratio:rate5m</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        expr</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">|</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          sum(rate(http_requests_total{service=&quot;order&quot;,status=~&quot;5..&quot;}[5m]))</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          /</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          sum(rate(http_requests_total{service=&quot;order&quot;}[5m]))</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">      </span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">record</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">order:request_error_ratio:rate1h</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        expr</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">|</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          sum(rate(http_requests_total{service=&quot;order&quot;,status=~&quot;5..&quot;}[1h]))</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          /</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          sum(rate(http_requests_total{service=&quot;order&quot;}[1h]))</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">      </span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">record</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">order:request_error_ratio:rate6h</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        expr</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">|</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          sum(rate(http_requests_total{service=&quot;order&quot;,status=~&quot;5..&quot;}[6h]))</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          /</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          sum(rate(http_requests_total{service=&quot;order&quot;}[6h]))</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">      </span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">record</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">order:request_error_ratio:rate30m</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        expr</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">|</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          sum(rate(http_requests_total{service=&quot;order&quot;,status=~&quot;5..&quot;}[30m]))</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          /</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          sum(rate(http_requests_total{service=&quot;order&quot;}[30m]))</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">      </span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">      # ─── P0 告警:5min + 1h 双窗口,burn rate &gt; 14.4 ───</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">alert</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">OrderSLOBurnRateP0</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        expr</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">|</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          (</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            order:request_error_ratio:rate5m &gt; (14.4 * 0.001)</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            and</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            order:request_error_ratio:rate1h &gt; (14.4 * 0.001)</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          )</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        for</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">2m</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        labels</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          severity</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">P0</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          service</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">order</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          slo</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;99.9&quot;</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        annotations</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          summary</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;Order SLO burn rate critical (&gt;14.4x)&quot;</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          description</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">|</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            5min error ratio = {{ $value | humanizePercentage }}</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            按当前速度,2 小时内将烧穿一个月错误预算</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          runbook_url</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;https://runbooks/order/slo-burn-critical&quot;</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          dashboard</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;https://grafana/d/order-slo&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      </span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">      # ─── P1 告警:30min + 6h 双窗口,burn rate &gt; 6 ───</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">alert</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">OrderSLOBurnRateP1</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        expr</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">|</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          (</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            order:request_error_ratio:rate30m &gt; (6 * 0.001)</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            and</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            order:request_error_ratio:rate6h &gt; (6 * 0.001)</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          )</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        for</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">5m</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        labels</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          severity</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">P1</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          service</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">order</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          slo</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;99.9&quot;</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        annotations</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          summary</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;Order SLO burn rate high (&gt;6x)&quot;</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          description</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">|</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            30min error ratio = {{ $value | humanizePercentage }}</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            按当前速度,5 天将烧穿一个月错误预算</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          runbook_url</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;https://runbooks/order/slo-burn-high&quot;</span></span></code></pre></div><p><strong>这段配置的关键设计</strong>:</p><ol><li><strong>用 Recording Rules 把错误率算好</strong>——告警表达式只做比较,不重复计算(性能差 10 倍)</li><li><strong><code>and</code> 把两个窗口拼起来</strong>——必须同时高才告警,这是降抖动核心</li><li><strong><code>for: 2m / 5m</code></strong>——再加一层时间过滤,防止 burn rate 瞬时尖刺</li><li><strong><code>labels.severity: P0/P1</code></strong>——给 Alertmanager 路由用</li><li><strong><code>runbook_url</code> 必填</strong>——参考 29 篇</li></ol><p><strong>这一段配置看完了能不能直接抄? 几乎可以</strong>——把 <code>service=&quot;order&quot;</code> 改成自己的服务名,<strong>主要要改的只有 SLO 数值</strong>(<code>0.001</code> 是 0.1%,对应 99.9% SLO)。</p><h3 id="_4-7-burn-rate-ascii-图示" tabindex="-1">4.7 burn rate ASCII 图示 <a class="header-anchor" href="#_4-7-burn-rate-ascii-图示" aria-label="Permalink to &quot;4.7 burn rate ASCII 图示&quot;">​</a></h3><p>下面这张图把&quot;两个窗口&quot;在告警判断上的协同关系画出来:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                  错误率(单位:SLO 倍数)</span></span>
<span class="line"><span>        ▲</span></span>
<span class="line"><span>   30x  │     ╱╲                          ← 真事故(尖峰且持续)</span></span>
<span class="line"><span>        │    ╱  ╲</span></span>
<span class="line"><span>   20x  │   ╱    ╲              ╱╲</span></span>
<span class="line"><span>        │  ╱      ╲            ╱  ╲       ← 抖动(尖锐但短)</span></span>
<span class="line"><span>   14x  │ ╱      ╲ 阈值线 ─────╱────╲────</span></span>
<span class="line"><span>        │╱        ╲         ╱      ╲</span></span>
<span class="line"><span>        │          ╲___╱╲__╱  ╱─╲    ╲___ ← 慢性烧(低但持久)</span></span>
<span class="line"><span>    1x  ├───────────────────────────────────</span></span>
<span class="line"><span>        │</span></span>
<span class="line"><span>        └─────────────────────────────────▶ 时间</span></span>
<span class="line"><span>        </span></span>
<span class="line"><span>单窗口告警(只看 5min):</span></span>
<span class="line"><span>   ✓ 真事故触发      ← 正确</span></span>
<span class="line"><span>   ✗ 抖动也触发      ← 误报</span></span>
<span class="line"><span>   ✗ 慢性不触发(&lt; 14x)  ← 漏报</span></span>
<span class="line"><span></span></span>
<span class="line"><span>5min + 1h 双窗口(两者都 &gt; 14x 才告 P0):</span></span>
<span class="line"><span>   ✓ 真事故触发(两个窗口都长时间高)</span></span>
<span class="line"><span>   ✓ 抖动不触发(1h 窗口被平均掉)</span></span>
<span class="line"><span>   △ 慢性不触发 P0(&lt; 14x)</span></span>
<span class="line"><span>        ↓</span></span>
<span class="line"><span>        慢性走 P1 双窗口(30min + 6h,burn rate &gt; 6)</span></span>
<span class="line"><span>   ✓ 慢性触发 P1     ← 正确</span></span>
<span class="line"><span></span></span>
<span class="line"><span>多窗口多燃烧率 = 完整覆盖&quot;快事故 + 慢事故&quot;,同时去抖动</span></span></code></pre></div><p><strong>这张图我自己工位上贴着,值班的时候看一眼就知道当前是哪种烧法</strong>。</p><hr><h2 id="五、告警风暴的根因诊治" tabindex="-1">五、告警风暴的根因诊治 <a class="header-anchor" href="#五、告警风暴的根因诊治" aria-label="Permalink to &quot;五、告警风暴的根因诊治&quot;">​</a></h2><p>讲完核心方法,再讲剩下的降噪工程。<strong>告警风暴</strong>是中型团队最常见的痛点——一次 P0 来,群里 200 条告警刷屏,关键的那一条被淹没。</p><h3 id="_5-1-风暴的四种根因" tabindex="-1">5.1 风暴的四种根因 <a class="header-anchor" href="#_5-1-风暴的四种根因" aria-label="Permalink to &quot;5.1 风暴的四种根因&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>风暴 1: 级联告警(根因 + 上游全炸)</span></span>
<span class="line"><span>   症状:数据库挂 → 5 个用 DB 的服务全 5xx → 5 个服务的告警同时响</span></span>
<span class="line"><span>   修复:用 Alertmanager inhibit 抑制</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>风暴 2: 抖动告警(同一条规则重复触发)</span></span>
<span class="line"><span>   症状:错误率在阈值附近抖,1 分钟告警 + 解决 + 再告警 5 次</span></span>
<span class="line"><span>   修复:加 \`for: 5m\`,或换 multi-burn-rate</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>风暴 3: 窗口太短(实例级 vs 服务级粒度问题)</span></span>
<span class="line"><span>   症状:100 个 Pod 同样的告警分 100 次响,@100 个人</span></span>
<span class="line"><span>   修复:Alertmanager grouping(by service / alertname)</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>风暴 4: 跨集群 / 多副本去重失败</span></span>
<span class="line"><span>   症状:同样的告警 Prometheus 主+备都发了一遍,@值班双倍</span></span>
<span class="line"><span>   修复:统一发到一个 Alertmanager,或用 cluster HA</span></span></code></pre></div><h3 id="_5-2-修复-1-alertmanager-路由-grouping" tabindex="-1">5.2 修复 1:Alertmanager 路由 + grouping <a class="header-anchor" href="#_5-2-修复-1-alertmanager-路由-grouping" aria-label="Permalink to &quot;5.2 修复 1:Alertmanager 路由 + grouping&quot;">​</a></h3><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># alertmanager.yml(最小可用 30 行)</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">route</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  receiver</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;default&#39;</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  group_by</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;alertname&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;service&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;severity&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  group_wait</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">30s</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">          # 第一次告警延迟,等同类告警归组</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  group_interval</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">5m</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">       # 同组的下一批告警间隔</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  repeat_interval</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">4h</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">      # 同告警 4h 不重复发</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  routes</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # P0 → 电话 + IM</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">matchers</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">severity=&quot;P0&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      receiver</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;pager-and-im&#39;</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      group_wait</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">0s</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">              # P0 立即发</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      repeat_interval</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">30m</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">         # P0 半小时重复一次防忘</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # P1 → IM + 短信</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">matchers</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">severity=&quot;P1&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      receiver</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;sms-and-im&#39;</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # P2 → 仅 IM</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">matchers</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">severity=&quot;P2&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      receiver</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;im-only&#39;</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # 维护窗口:静音所有</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">matchers</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">maintenance=&quot;true&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      receiver</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;null&#39;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">receivers</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;pager-and-im&#39;</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    webhook_configs</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">url</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;https://pager.internal/api/critical&#39;</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    pagerduty_configs</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">service_key</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;\${PD_KEY}&#39;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;sms-and-im&#39;</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    webhook_configs</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">url</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;https://im.internal/api/alert&#39;</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    pagerduty_configs</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">service_key</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;\${PD_KEY_LOW}&#39;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;im-only&#39;</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    webhook_configs</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">url</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;https://im.internal/api/alert&#39;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;null&#39;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">inhibit_rules</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  # 节点挂时不再发 Pod 不可达(根因抑制)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">source_matchers</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">alertname=&quot;NodeDown&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    target_matchers</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">alertname=~&quot;PodNotReady|ServiceUnavailable&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    equal</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;node&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span></code></pre></div><p><strong>这段配置的关键设计</strong>:</p><ol><li><strong><code>group_by</code></strong>:同 service / 同 alertname 的告警合并成一条,不会刷屏</li><li><strong><code>group_wait: 30s</code></strong>:第一条告警来了等 30s,期间同组的合并到一起发</li><li><strong><code>repeat_interval</code> P0=30min</strong>:P0 没解决要不停提醒,P2 = 4h(避免疲劳)</li><li><strong><code>inhibit_rules</code></strong>:节点挂时所有 Pod 告警都抑制(因为根因是节点)</li><li><strong><code>maintenance=&quot;true&quot;</code> 静音</strong>:维护窗口期间专门的标签静音,见 §5.4</li></ol><h3 id="_5-3-修复-2-inhibition-抑制-真实用法" tabindex="-1">5.3 修复 2:Inhibition(抑制)真实用法 <a class="header-anchor" href="#_5-3-修复-2-inhibition-抑制-真实用法" aria-label="Permalink to &quot;5.3 修复 2:Inhibition(抑制)真实用法&quot;">​</a></h3><p>抑制是 Alertmanager 最被低估的特性。<strong>用好它能减少 70% 的级联告警</strong>。</p><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 三个最有用的 inhibit 规则:</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">inhibit_rules</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  # 1. 集群节点挂 → 上面的 Pod / 服务告警全抑制</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">source_matchers</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">alertname=&quot;NodeDown&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    target_matchers</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">alertname=~&quot;PodNotReady|ContainerCrashLooping&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    equal</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;node&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  </span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  # 2. 数据库挂 → 用这个 DB 的服务的 5xx 告警全抑制</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">source_matchers</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">alertname=&quot;MySQLDown&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">service=&quot;rds-order&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    target_matchers</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">alertname=&quot;ServiceErrorRate&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">service=~&quot;order|payment&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    equal</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: []   </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 不需要 equal,因为已经明确指定服务</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  </span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  # 3. 高级别同名告警抑制低级别</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">source_matchers</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">severity=&quot;P0&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    target_matchers</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">severity=~&quot;P1|P2&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">alertname=&quot;.*&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    equal</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;alertname&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;service&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span></code></pre></div><p><strong>第三条最有用</strong>:同样的告警,P0 触发后 P1/P2 自动抑制——<strong>让值班只看 P0,不在低优先级上分神</strong>。</p><h3 id="_5-4-修复-3-silence-沉默-和维护窗口" tabindex="-1">5.4 修复 3:Silence(沉默)和维护窗口 <a class="header-anchor" href="#_5-4-修复-3-silence-沉默-和维护窗口" aria-label="Permalink to &quot;5.4 修复 3:Silence(沉默)和维护窗口&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>什么时候用 silence:</span></span>
<span class="line"><span>   - 计划内维护(数据库升级、网络变更)</span></span>
<span class="line"><span>   - 已知问题处置中(免得重复打扰)</span></span>
<span class="line"><span>   - 误报排查期(避免再次触发干扰)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>什么时候 不该用 silence:</span></span>
<span class="line"><span>   - &quot;这条告警烦死了&quot; → 治本是改告警规则</span></span>
<span class="line"><span>   - &quot;我现在不想看&quot; → 治本是路由分级</span></span>
<span class="line"><span>   - 上完线忘了取消 silence → 真出事漏报</span></span></code></pre></div><p><strong>Silence 的标准操作</strong>:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># CLI 创建 silence(amtool)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">amtool</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> silence</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> add</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  --comment</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;维护:DB 升级到 8.0&quot;</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  --duration</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 2h</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  --author</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;zhangsan&quot;</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  alertname=~&quot;MySQL.*&quot;</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  service=&quot;rds-order&quot;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 列出当前 silence</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">amtool</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> silence</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> query</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 提前取消</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">amtool</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> silence</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> expire</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> &lt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">silence-i</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">d</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">&gt;</span></span></code></pre></div><p><strong>维护窗口的工程化做法</strong>(避免忘记取消):</p><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 在 alert rules 里加 maintenance 标签</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">- </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">alert</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">MySQLHighConnections</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  expr</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">...</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  labels</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    severity</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">P1</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    service</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">rds-order</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # 这里不写 maintenance,因为是动态的</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 用一条&quot;meta 告警&quot;标记维护期</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">- </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">alert</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">__MaintenanceWindow</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  expr</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">maintenance_window{service=&quot;rds-order&quot;} == 1</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  labels</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    maintenance</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;true&quot;</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    service</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">rds-order</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Alertmanager 路由里捕获</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">routes</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">matchers</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">maintenance=&quot;true&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    receiver</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;null&#39;</span></span></code></pre></div><p><strong>这套设计让&quot;维护窗口&quot;变成一个数据源驱动的状态</strong>,不是手动 silence——升级前打开开关,完事关掉,不会忘。</p><h3 id="_5-5-修复-4-跨集群-多副本去重" tabindex="-1">5.5 修复 4:跨集群 / 多副本去重 <a class="header-anchor" href="#_5-5-修复-4-跨集群-多副本去重" aria-label="Permalink to &quot;5.5 修复 4:跨集群 / 多副本去重&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>痛点:</span></span>
<span class="line"><span>   Prometheus HA 部署,A / B 两台同时跑同一份告警规则</span></span>
<span class="line"><span>   两条相同告警都发到 Alertmanager</span></span>
<span class="line"><span>   Alertmanager 又 HA 部署,A / B 两台都发到 IM</span></span>
<span class="line"><span>   → 值班手机震 4 次</span></span>
<span class="line"><span></span></span>
<span class="line"><span>修复:</span></span>
<span class="line"><span>   1. Alertmanager 设 cluster,内部去重(--cluster.* 参数)</span></span>
<span class="line"><span>   2. Prometheus 同样规则发到同一组 Alertmanager</span></span>
<span class="line"><span>   3. 用 external_labels 区分来源,而不是发两份</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   prometheus.yml:</span></span>
<span class="line"><span>   global:</span></span>
<span class="line"><span>     external_labels:</span></span>
<span class="line"><span>       cluster: prod-cn   ← 同一 cluster 名,Alertmanager 就能去重</span></span></code></pre></div><hr><h2 id="六、告警工程的硬指标" tabindex="-1">六、告警工程的硬指标 <a class="header-anchor" href="#六、告警工程的硬指标" aria-label="Permalink to &quot;六、告警工程的硬指标&quot;">​</a></h2><p>让&quot;降噪&quot;变成可度量的工程目标,不是凭感觉。</p><h3 id="_6-1-4-个核心指标" tabindex="-1">6.1 4 个核心指标 <a class="header-anchor" href="#_6-1-4-个核心指标" aria-label="Permalink to &quot;6.1 4 个核心指标&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌──────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  告警工程健康度仪表盘(每周 / 每月看)               │</span></span>
<span class="line"><span>├──────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>│  1. 每周每人告警数                                   │</span></span>
<span class="line"><span>│      目标:&lt; 10                                       │</span></span>
<span class="line"><span>│      &gt; 25 = 危险区,值班 burnout                     │</span></span>
<span class="line"><span>│                                                      │</span></span>
<span class="line"><span>│  2. 误报率(无需 action 的告警 / 总告警)            │</span></span>
<span class="line"><span>│      目标:&lt; 10%                                      │</span></span>
<span class="line"><span>│      &gt; 30% = 告警工程没做,直接静音吧                │</span></span>
<span class="line"><span>│                                                      │</span></span>
<span class="line"><span>│  3. P0/P1 占比                                       │</span></span>
<span class="line"><span>│      目标:P0 &lt; 5%,P1 &lt; 20%                          │</span></span>
<span class="line"><span>│      P0 &gt; 15% = 等级标错,需要降级                   │</span></span>
<span class="line"><span>│                                                      │</span></span>
<span class="line"><span>│  4. 自动确认 / 人工确认比                            │</span></span>
<span class="line"><span>│      目标:&lt; 30%                                      │</span></span>
<span class="line"><span>│      高 = 一堆告警系统自动好了,本来就不该告         │</span></span>
<span class="line"><span>└──────────────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>这些指标每月在 SRE Review 上拿出来看——任一项进危险区,1 周内必须有改进动作</strong>(参考 28 篇 On-call 健康度的工作方式)。</p><h3 id="_6-2-怎么实现误报率统计" tabindex="-1">6.2 怎么实现误报率统计 <a class="header-anchor" href="#_6-2-怎么实现误报率统计" aria-label="Permalink to &quot;6.2 怎么实现误报率统计&quot;">​</a></h3><div class="language-python vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">python</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 每条告警关闭后,值班人填一个 tag:</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># - &quot;real_issue&quot;  (真事故)</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># - &quot;false_positive&quot;(误报)</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># - &quot;self_healed&quot;(自愈,不算误报但需观察)</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># - &quot;duplicate&quot;(同根因重复告警)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Pager 系统 / 工单系统集成</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 每月统计:</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># false_positive_rate = false_positive / (real_issue + false_positive)</span></span></code></pre></div><p><strong>强制每条告警都要标 outcome</strong>——没标的告警不算结案,这样数据才不漂移。</p><hr><h2 id="七、告警治理的工程动作" tabindex="-1">七、告警治理的工程动作 <a class="header-anchor" href="#七、告警治理的工程动作" aria-label="Permalink to &quot;七、告警治理的工程动作&quot;">​</a></h2><p>讲完工具和指标,<strong>真正治理告警风暴的工程动作有 5 项</strong>:</p><h3 id="_7-1-动作-1-告警必须有-owner" tabindex="-1">7.1 动作 1:告警必须有 owner <a class="header-anchor" href="#_7-1-动作-1-告警必须有-owner" aria-label="Permalink to &quot;7.1 动作 1:告警必须有 owner&quot;">​</a></h3><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 在 alert rules 里强制 labels:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">- </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">alert</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">OrderSLOBurnRateP0</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  expr</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">...</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  labels</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    severity</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">P0</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    service</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">order</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">      # 服务</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    team</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">payments</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">      # 团队 owner</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    owner_email</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">payments-oncall@company.internal</span></span></code></pre></div><p><strong>CI 校验</strong>(参考 29 篇 Runbook 校验):</p><div class="language-python vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">python</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># scripts/check_alert_owner.py</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">for</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> rule </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">in</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> load_rules(</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;alerts/&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">):</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    if</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;team&quot;</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> not</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> in</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> rule.labels </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">or</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;owner_email&quot;</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> not</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> in</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> rule.labels:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        fail(</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">f</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">{</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">rule.alert</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">}</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">: 缺 team / owner_email&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span></code></pre></div><p><strong>没 owner 的告警,等于没人收</strong>——这是最常见的&quot;告警黑洞&quot;根源。</p><h3 id="_7-2-动作-2-告警必须有-runbook-url" tabindex="-1">7.2 动作 2:告警必须有 runbook_url <a class="header-anchor" href="#_7-2-动作-2-告警必须有-runbook-url" aria-label="Permalink to &quot;7.2 动作 2:告警必须有 runbook_url&quot;">​</a></h3><div class="language-python vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">python</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 同样的 CI 校验</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">if</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> not</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> rule.annotations.get(</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;runbook_url&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">):</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    fail(</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">f</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">{</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">rule.alert</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">}</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">: 缺 runbook_url&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span></code></pre></div><p><strong>详见 29 篇</strong>。这一条是 14/15 篇的硬约束之一。</p><h3 id="_7-3-动作-3-每月告警-review-关停-老不响-老乱响" tabindex="-1">7.3 动作 3:每月告警 review,关停&quot;老不响&quot;+&quot;老乱响&quot; <a class="header-anchor" href="#_7-3-动作-3-每月告警-review-关停-老不响-老乱响" aria-label="Permalink to &quot;7.3 动作 3:每月告警 review,关停&quot;老不响&quot;+&quot;老乱响&quot;&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>review 内容:</span></span>
<span class="line"><span>   - 过去 30 天 0 触发的告警(占用 noise 不解决问题)</span></span>
<span class="line"><span>       → 删 / 降级 P3 / 改成 dashboard 信息</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   - 过去 30 天误报率 &gt; 50% 的告警</span></span>
<span class="line"><span>       → 改阈值 / 换 multi-burn-rate / 调窗口</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   - 过去 30 天最响的 top 10 告警</span></span>
<span class="line"><span>       → 这些是治理 ROI 最高的对象,优先 review</span></span></code></pre></div><p><strong>每月 1 小时,把告警系统的&quot;老化&quot;做掉</strong>——这件事不做,告警系统 6 个月必腐烂。</p><h3 id="_7-4-动作-4-alert-as-code-pr-review" tabindex="-1">7.4 动作 4:Alert as Code + PR review <a class="header-anchor" href="#_7-4-动作-4-alert-as-code-pr-review" aria-label="Permalink to &quot;7.4 动作 4:Alert as Code + PR review&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>告警不允许&quot;在 Grafana 界面点几下创建&quot;</span></span>
<span class="line"><span>   → 必须走 Git PR,SRE Lead review</span></span>
<span class="line"><span>   → CI 校验:owner、runbook、severity 标签齐全</span></span>
<span class="line"><span>   → 上线后跟踪误报率,2 周不达标 PR 回滚</span></span></code></pre></div><p><strong>这是 alert 工程化的核心</strong>。没有 PR + Review 制度,告警系统就是&quot;谁焦虑谁加&quot;,<strong>永远在加,永远不减</strong>。</p><h3 id="_7-5-动作-5-告警的-消音期-机制" tabindex="-1">7.5 动作 5:告警的&quot;消音期&quot;机制 <a class="header-anchor" href="#_7-5-动作-5-告警的-消音期-机制" aria-label="Permalink to &quot;7.5 动作 5:告警的&quot;消音期&quot;机制&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>症状:</span></span>
<span class="line"><span>   值班 24h 处理一次同样的告警 8 次</span></span>
<span class="line"><span>   都是同样的事故,8 次拉群</span></span>
<span class="line"><span></span></span>
<span class="line"><span>修复:</span></span>
<span class="line"><span>   - Alertmanager repeat_interval 设合理</span></span>
<span class="line"><span>     P0 = 30min(必须重复,防忘)</span></span>
<span class="line"><span>     P1 = 2h</span></span>
<span class="line"><span>     P2 = 8h</span></span>
<span class="line"><span>   - 配合 group_interval 不要太短</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   同样事故,同一个 IM 群,4h 内不重复刷屏</span></span></code></pre></div><hr><h2 id="八、何时不该上-multi-burn-rate" tabindex="-1">八、何时不该上 multi-burn-rate <a class="header-anchor" href="#八、何时不该上-multi-burn-rate" aria-label="Permalink to &quot;八、何时不该上 multi-burn-rate&quot;">​</a></h2><p>讲完了这么久 multi-burn-rate 的好处,<strong>也得说什么时候不该用</strong>。</p><h3 id="_8-1-没有-slo-的服务" tabindex="-1">8.1 没有 SLO 的服务 <a class="header-anchor" href="#_8-1-没有-slo-的服务" aria-label="Permalink to &quot;8.1 没有 SLO 的服务&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>multi-burn-rate 的本质是&quot;对 SLO 错误预算的消耗速度告警&quot;</span></span>
<span class="line"><span>   ↓</span></span>
<span class="line"><span>没 SLO 就没&quot;标准错误率&quot;,burn rate 无意义</span></span>
<span class="line"><span>   ↓</span></span>
<span class="line"><span>怎么办:先去 13 篇定 SLO,再回来配 burn rate</span></span>
<span class="line"><span></span></span>
<span class="line"><span>(不要为了配 multi-burn-rate 而瞎拍一个 SLO,</span></span>
<span class="line"><span> 拍出来的 SLO 一样会让告警失真)</span></span></code></pre></div><h3 id="_8-2-突发流量-低-qps-服务" tabindex="-1">8.2 突发流量 / 低 QPS 服务 <a class="header-anchor" href="#_8-2-突发流量-低-qps-服务" aria-label="Permalink to &quot;8.2 突发流量 / 低 QPS 服务&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>QPS &lt; 10 的服务:</span></span>
<span class="line"><span>   - 错误率本身波动巨大(1 个错就是 10%)</span></span>
<span class="line"><span>   - burn rate 5min 窗口在低 QPS 下数据稀疏</span></span>
<span class="line"><span>   - 即使有 SLO,burn rate 的统计意义弱</span></span>
<span class="line"><span></span></span>
<span class="line"><span>替代方案:</span></span>
<span class="line"><span>   - 用绝对错误数告警(error count &gt; N)</span></span>
<span class="line"><span>   - 用更长的 SLO 窗口(30 天而不是 1 周)</span></span>
<span class="line"><span>   - 加 request_rate &gt; X 作为前置条件</span></span>
<span class="line"><span>     (没流量就不告警,反正用户没访问)</span></span></code></pre></div><h3 id="_8-3-资源饱和度类告警" tabindex="-1">8.3 资源饱和度类告警 <a class="header-anchor" href="#_8-3-资源饱和度类告警" aria-label="Permalink to &quot;8.3 资源饱和度类告警&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>USE-S 类告警(DB 连接池 / 线程池 / 队列):</span></span>
<span class="line"><span>   - 这些有&quot;硬上限&quot;(50 个连接就是 50,没法弹性)</span></span>
<span class="line"><span>   - 不是用户感知的连续量,是离散的&quot;满 or 没满&quot;</span></span>
<span class="line"><span>   - 直接用 static threshold + for 就好</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   例:</span></span>
<span class="line"><span>   alert: DBConnectionPoolNearFull</span></span>
<span class="line"><span>   expr: hikaricp_connections_active / hikaricp_connections_max &gt; 0.9</span></span>
<span class="line"><span>   for: 2m</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   不需要 multi-burn-rate</span></span></code></pre></div><h3 id="_8-4-团队-5-人-服务-10-个" tabindex="-1">8.4 团队 &lt; 5 人 / 服务 &lt; 10 个 <a class="header-anchor" href="#_8-4-团队-5-人-服务-10-个" aria-label="Permalink to &quot;8.4 团队 &lt; 5 人 / 服务 &lt; 10 个&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>小团队 + 服务少:</span></span>
<span class="line"><span>   - 实现 multi-burn-rate 的工程成本 ≈ 收益</span></span>
<span class="line"><span>   - 大家都在群里,告警刷屏也能盯住</span></span>
<span class="line"><span>   - 直接用静态阈值 + 简单 routing 够了</span></span>
<span class="line"><span></span></span>
<span class="line"><span>阶段建议:</span></span>
<span class="line"><span>   阶段 1(&lt; 10 服务):static threshold + Alertmanager routing</span></span>
<span class="line"><span>   阶段 2(10-50):核心服务用 multi-burn-rate,其他保持简单</span></span>
<span class="line"><span>   阶段 3(&gt; 50 / 多团队):全面 multi-burn-rate + 完整告警工程</span></span></code></pre></div><p><strong>不要为了&quot;用上 multi-burn-rate&quot;而强行套</strong>——它是工程工具,不是 KPI。</p><hr><h2 id="九、7-条踩坑提醒" tabindex="-1">九、7 条踩坑提醒 <a class="header-anchor" href="#九、7-条踩坑提醒" aria-label="Permalink to &quot;九、7 条踩坑提醒&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 告警没 owner</span></span>
<span class="line"><span>   → 告警黑洞:出事谁都不收 / 解决谁都不修</span></span>
<span class="line"><span>   → 修:CI 强制 team / owner_email label</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. 告警没 runbook</span></span>
<span class="line"><span>   → 凌晨 3 点告警:&quot;我不知道这玩意是啥&quot;</span></span>
<span class="line"><span>   → 修:CI 强制 runbook_url(参考 29 篇)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. P0 触发了没人响应</span></span>
<span class="line"><span>   → 路由错位 / Pager 没配 / 值班人手机静音</span></span>
<span class="line"><span>   → 修:Test alert 每月演练,验证全链路通</span></span>
<span class="line"><span></span></span>
<span class="line"><span>4. 告警疲劳(告警群一刷,大家集体静音)</span></span>
<span class="line"><span>   → 直接症状,不是问题本身</span></span>
<span class="line"><span>   → 修:看告警工程的 4 个硬指标,</span></span>
<span class="line"><span>     哪一项危险区先治哪一项</span></span>
<span class="line"><span></span></span>
<span class="line"><span>5. 自愈告警遗留</span></span>
<span class="line"><span>   → 服务自己好了,但告警系统不知道,留个未关闭工单</span></span>
<span class="line"><span>   → 修:Alertmanager 的 send_resolved: true</span></span>
<span class="line"><span>     + 工单系统监听 resolved 事件自动关</span></span>
<span class="line"><span></span></span>
<span class="line"><span>6. 跨集群去重失败</span></span>
<span class="line"><span>   → A 集群 Prometheus 和 B 集群同样的规则,告警双发</span></span>
<span class="line"><span>   → 修:Alertmanager cluster HA + external_labels</span></span>
<span class="line"><span></span></span>
<span class="line"><span>7. 维护窗口忘记 silence</span></span>
<span class="line"><span>   → 上线一次,告警群被维护期间的 200 条告警刷屏</span></span>
<span class="line"><span>     真出事埋没在维护噪音里</span></span>
<span class="line"><span>   → 修:基于数据源的 maintenance flag(§5.4)</span></span>
<span class="line"><span>     不靠人记忆</span></span></code></pre></div><hr><h2 id="十、本篇硬指标" tabindex="-1">十、本篇硬指标 <a class="header-anchor" href="#十、本篇硬指标" aria-label="Permalink to &quot;十、本篇硬指标&quot;">​</a></h2><p>看完这一篇,你应该能给团队:</p><ul><li><strong>2 小时内</strong>:挑一个核心服务,基于 13 篇定的 SLO,写出一份 multi-burn-rate 告警规则(P0 + P1 两档)</li><li><strong>当天</strong>:在 CI 里加上&quot;告警必须有 owner + runbook_url&quot;的强制校验</li><li><strong>一周内</strong>:盘点团队当前所有告警,标出哪些是「静态阈值死法」(§1)的受害者</li><li><strong>一个月内</strong>:实现告警工程的 4 个健康度指标(§6.1),挂在 SRE Review 上</li></ul><p>并且能在白板前讲清楚:</p><ul><li>为什么 &quot;CPU &gt; 80% 持续 5min&quot; 这种告警必然死(§1.1)</li><li>burn rate 怎么从 SLO 算出来,14.4 / 6 / 3 这三个数字怎么来的(§4.5)</li><li>双窗口告警为什么能同时去抖和不漏长尾(§4.3-4.7)</li><li>Alertmanager 的 group_by / inhibit / silence 各自解决什么问题(§5)</li></ul><hr><h2 id="十一、和其他篇的关系" tabindex="-1">十一、和其他篇的关系 <a class="header-anchor" href="#十一、和其他篇的关系" aria-label="Permalink to &quot;十一、和其他篇的关系&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>13(SLO)定下&quot;承诺&quot;,给 burn rate 提供分母</span></span>
<span class="line"><span>14(RED/USE)定下&quot;看什么&quot;,给告警规则提供指标</span></span>
<span class="line"><span>15(本篇)定下&quot;怎么告&quot;,把承诺变成行动</span></span>
<span class="line"><span>16(仪表盘)给值班看的可视化</span></span>
<span class="line"><span>17(错误预算政治)讲告警之后的政治博弈</span></span>
<span class="line"><span></span></span>
<span class="line"><span>28(On-call)讲告警响起后人怎么响应</span></span>
<span class="line"><span>29(Runbook)讲响应里跑什么</span></span>
<span class="line"><span>32(事故响应)讲 P0 来了怎么组织</span></span>
<span class="line"><span></span></span>
<span class="line"><span>这一篇是这条线最中间的工具——</span></span>
<span class="line"><span>失败了,前 14 篇的方法论都成废纸,</span></span>
<span class="line"><span>做对了,后面的 On-call / Runbook 才有飞跃空间</span></span></code></pre></div><hr><blockquote><p>下一篇 <code>16-仪表盘工程.md</code>,15 篇配完告警,<strong>告警响起后值班人打开 Grafana 看什么?</strong> 这就是 16 篇——讲清楚&quot;导航灯堆&quot;反模式、一图一意原则、黄金 4 信号在 dashboard 上的标准布局、Dashboard 分层(L1 总览 / L2 服务 / L3 资源 / L4 调试)、JSON 进 Git 的版本管理、Grafonnet 怎么写。<strong>14 教看什么、15 教什么时候告、16 教告了之后看哪个屏</strong>——三件事一起做对,值班的体感才能从&quot;手忙脚乱&quot;变成&quot;5 分钟定位&quot;。</p></blockquote>`,153)])])}const g=a(l,[["render",e]]);export{d as __pageData,g as default};
