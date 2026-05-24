import{c as a,Q as n,j as i,m as p}from"./chunks/framework.Bhbi9jCp.js";const c=JSON.parse('{"title":"Feature Flag 工程:LaunchDarkly / Unleash / 灰度维度 / 技术债","description":"","frontmatter":{},"headers":[],"relativePath":"devopsLearning/22-Feature-Flag工程.md","filePath":"devopsLearning/22-Feature-Flag工程.md","lastUpdated":1778496697000}'),l={name:"devopsLearning/22-Feature-Flag工程.md"};function e(t,s,h,r,k,o){return n(),i("div",null,[...s[0]||(s[0]=[p(`<h1 id="feature-flag-工程-launchdarkly-unleash-灰度维度-技术债" tabindex="-1">Feature Flag 工程:LaunchDarkly / Unleash / 灰度维度 / 技术债 <a class="header-anchor" href="#feature-flag-工程-launchdarkly-unleash-灰度维度-技术债" aria-label="Permalink to &quot;Feature Flag 工程:LaunchDarkly / Unleash / 灰度维度 / 技术债&quot;">​</a></h1><p>上一篇讲渐进发布——蓝绿、金丝雀、影子流量。<strong>那一篇解决的是&quot;实例维度&quot;的灰度</strong>:5% 的 pod 跑新代码,95% 的 pod 跑旧代码。但很多真实场景下,<strong>&quot;实例维度&quot;的灰度根本不够</strong>——你想让&quot;北京的某个特定用户&quot;看到新功能,你想让&quot;安卓 v4.2.1 以上的设备&quot;启用新逻辑,你想&quot;凌晨 3 点突发流量异常时秒级关掉一个吞吐量高的非核心功能&quot;——这些都不是 K8s 灰度能办到的。</p><p>这一篇就讲另一个维度的灰度:<strong>Feature Flag</strong>。<strong>它不是&quot;工具&quot;,是一整套&quot;把发布(deploy)和启用(release)解耦&quot;的工程方法</strong>。代码可以提前一周 deploy 到生产,<strong>但功能由 flag 控制——开 / 关 / 给 1% 用户 / 给某个 B2B 大客户</strong>——这件事的价值远超&quot;灰度&quot;本身,它是现代发布工程的硬骨架。</p><blockquote><p>一句话先记住:<strong>Feature Flag 的核心价值不是&quot;灰度&quot;,是&quot;把发布的不可逆性解开&quot;</strong>——传统发布里,&quot;上线&quot;和&quot;启用&quot;是耦合的一件事,翻车只能 rollback 代码;有了 Flag,代码先上,功能后开,出问题&quot;关 flag&quot;秒级生效,<strong>不需要触发任何 deploy 流程</strong>。但工具只是开始——Flag 真正的工程难点是「<strong>长出来容易,删干净难</strong>」,半年不管就一堆僵尸 flag,这一篇下半段会讲清楚 Flag 治理的纪律,不讲清楚的话你团队 1 年内就会撞上&quot;代码里 200 个 flag,谁都不敢删&quot;的死锁。</p></blockquote><hr><h2 id="一、问题场景-没有-feature-flag-的团队在踩什么坑" tabindex="-1">一、问题场景:没有 Feature Flag 的团队在踩什么坑 <a class="header-anchor" href="#一、问题场景-没有-feature-flag-的团队在踩什么坑" aria-label="Permalink to &quot;一、问题场景:没有 Feature Flag 的团队在踩什么坑&quot;">​</a></h2><h3 id="_1-1-死法一-大功能想上线-但只想给-10-个用户试用" tabindex="-1">1.1 死法一:大功能想上线,但只想给 10 个用户试用 <a class="header-anchor" href="#_1-1-死法一-大功能想上线-但只想给-10-个用户试用" aria-label="Permalink to &quot;1.1 死法一:大功能想上线,但只想给 10 个用户试用&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>PM:这个&quot;新版搜索&quot;想先给我们的 KA 客户用 2 周,收集反馈再放开</span></span>
<span class="line"><span>Dev:OK,我做一个&quot;白名单&quot;,把这 10 个用户 ID 写死在 if 里</span></span>
<span class="line"><span></span></span>
<span class="line"><span>if user.id in [1001, 1002, ..., 1010]:</span></span>
<span class="line"><span>    return new_search(...)</span></span>
<span class="line"><span>else:</span></span>
<span class="line"><span>    return old_search(...)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2 周后:</span></span>
<span class="line"><span>PM:加 5 个用户试试</span></span>
<span class="line"><span>Dev:改代码,重新发布</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3 周后:</span></span>
<span class="line"><span>PM:用户A 反馈不好,把他从白名单移除</span></span>
<span class="line"><span>Dev:再改代码,再发布</span></span>
<span class="line"><span></span></span>
<span class="line"><span>某次 Dev 忘了把测试用户从白名单移除 → 生产代码里硬编码了&quot;内部员工 999&quot;</span></span>
<span class="line"><span>某次合并冲突 → 白名单被覆盖,所有 KA 用户失去权限,客服爆炸</span></span></code></pre></div><p><strong>根因</strong>:把&quot;灰度名单&quot;当成&quot;代码&quot;管。每次改名单都要发布,<strong>配置和代码耦合,没有运营自助路径</strong>。</p><h3 id="_1-2-死法二-某功能想紧急关闭-但只能-rollback" tabindex="-1">1.2 死法二:某功能想紧急关闭,但只能 rollback <a class="header-anchor" href="#_1-2-死法二-某功能想紧急关闭-但只能-rollback" aria-label="Permalink to &quot;1.2 死法二:某功能想紧急关闭,但只能 rollback&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>20:00  发布 v3.2,新增了&quot;实时推荐&quot;功能</span></span>
<span class="line"><span>22:00  发现&quot;实时推荐&quot;调用的下游 ML 服务扛不住,P99 飙到 8s,整站慢</span></span>
<span class="line"><span>22:01  团队决定关闭这个功能</span></span>
<span class="line"><span>22:02  &quot;实时推荐&quot;没有 flag,只能 rollback 代码</span></span>
<span class="line"><span>22:03  rollback 触发,30 个 pod 滚动重启 6 分钟</span></span>
<span class="line"><span>22:09  好不容易回滚完</span></span>
<span class="line"><span>22:15  发现其他几个 v3.2 才修的 bug 又回来了</span></span>
<span class="line"><span>22:30  最终走 hotfix,把&quot;实时推荐&quot;那行代码注释掉,重新发布</span></span></code></pre></div><p><strong>根因</strong>:<strong>功能没有&quot;关闭&quot;按钮,只能整个版本回退</strong>。一个新功能拉跨,把其他无关 fix 一起拖下水。<strong>这种事故每年都在发生,且完全可避免</strong>。</p><h3 id="_1-3-死法三-a-b-实验靠改代码" tabindex="-1">1.3 死法三:A/B 实验靠改代码 <a class="header-anchor" href="#_1-3-死法三-a-b-实验靠改代码" aria-label="Permalink to &quot;1.3 死法三:A/B 实验靠改代码&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>PM:我想做个 A/B 实验,看看&quot;购物车结算页&quot;红色按钮还是绿色按钮转化率高</span></span>
<span class="line"><span>Dev:OK,我加个 if random() &lt; 0.5</span></span>
<span class="line"><span></span></span>
<span class="line"><span>if random() &lt; 0.5:</span></span>
<span class="line"><span>    button_color = &quot;red&quot;</span></span>
<span class="line"><span>else:</span></span>
<span class="line"><span>    button_color = &quot;green&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>PM:实验结果怎么看?</span></span>
<span class="line"><span>Dev:加埋点,统计哪种颜色的转化高</span></span>
<span class="line"><span>PM:能不能给 A 组红色 7 天,然后切到全部红色?</span></span>
<span class="line"><span>Dev:得改代码,再发布</span></span>
<span class="line"><span></span></span>
<span class="line"><span>PM:能不能新加一个版本测黄色?</span></span>
<span class="line"><span>Dev:再改代码,再发布</span></span></code></pre></div><p><strong>根因</strong>:<strong>A/B 实验和&quot;灰度发布&quot;的需求几乎一致,但被分成两件事做</strong>——A/B 走代码改+埋点,灰度走 K8s yaml,两者完全不复用。Dev 烦死,PM 等得久,实验效率低到没法快速迭代。</p><h3 id="_1-4-三种死法的共同点" tabindex="-1">1.4 三种死法的共同点 <a class="header-anchor" href="#_1-4-三种死法的共同点" aria-label="Permalink to &quot;1.4 三种死法的共同点&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>死法一:灰度白名单写代码      → 灰度名单 = 配置,不该是代码</span></span>
<span class="line"><span>死法二:功能没有&quot;关闭按钮&quot;     → 启用和发布耦合,不该耦合</span></span>
<span class="line"><span>死法三:A/B 实验靠改代码      → 实验配置 = 配置,不该是代码</span></span></code></pre></div><p><strong>这三个问题的根本解决方案,都是 Feature Flag</strong>——把&quot;什么用户在什么时候看到什么功能&quot;从代码里抽出来,变成可运营、可观测、可秒级生效的配置。</p><hr><h2 id="二、feature-flag-是什么-发布与启用的解耦" tabindex="-1">二、Feature Flag 是什么:发布与启用的解耦 <a class="header-anchor" href="#二、feature-flag-是什么-发布与启用的解耦" aria-label="Permalink to &quot;二、Feature Flag 是什么:发布与启用的解耦&quot;">​</a></h2><h3 id="_2-1-一句话定义" tabindex="-1">2.1 一句话定义 <a class="header-anchor" href="#_2-1-一句话定义" aria-label="Permalink to &quot;2.1 一句话定义&quot;">​</a></h3><p>Feature Flag(也叫 Feature Toggle / Feature Switch)= <strong>一段代码里用 <code>if flag.is_enabled(name, user) { ... } else { ... }</code> 包起来的分支判断,其中 <code>is_enabled</code> 的真值由外部配置决定,可以在不重新发布代码的前提下被切换</strong>。</p><h3 id="_2-2-工作流" tabindex="-1">2.2 工作流 <a class="header-anchor" href="#_2-2-工作流" aria-label="Permalink to &quot;2.2 工作流&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌──────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│                  Feature Flag 完整工作流                       │</span></span>
<span class="line"><span>├──────────────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>│                                                              │</span></span>
<span class="line"><span>│   ┌─────────────┐                                            │</span></span>
<span class="line"><span>│   │  Flag Admin │ ← PM / 运营 / 工程师 在 Web UI 改 flag      │</span></span>
<span class="line"><span>│   │   Web UI    │                                            │</span></span>
<span class="line"><span>│   └──────┬──────┘                                            │</span></span>
<span class="line"><span>│          │ HTTP POST 改配置                                   │</span></span>
<span class="line"><span>│          ▼                                                   │</span></span>
<span class="line"><span>│   ┌──────────────┐                                           │</span></span>
<span class="line"><span>│   │ Flag Service │ ← LaunchDarkly / Unleash / 自建            │</span></span>
<span class="line"><span>│   │  (Server)    │ ← 存所有 flag 定义、规则、灰度比例          │</span></span>
<span class="line"><span>│   └──────┬───────┘                                           │</span></span>
<span class="line"><span>│          │ SSE / WebSocket / Polling                         │</span></span>
<span class="line"><span>│          │ 向所有 SDK 推送变更                                │</span></span>
<span class="line"><span>│          ▼                                                   │</span></span>
<span class="line"><span>│   ┌──────────────────────────────────┐                       │</span></span>
<span class="line"><span>│   │   应用进程内的 Flag SDK           │                       │</span></span>
<span class="line"><span>│   │   - 本地缓存 flag 规则             │                       │</span></span>
<span class="line"><span>│   │   - 评估用户 → flag 真值           │                       │</span></span>
<span class="line"><span>│   │   - 上报评估结果(可选)            │                       │</span></span>
<span class="line"><span>│   └────────────────┬─────────────────┘                       │</span></span>
<span class="line"><span>│                    │                                         │</span></span>
<span class="line"><span>│                    ▼                                         │</span></span>
<span class="line"><span>│   ┌──────────────────────────────────┐                       │</span></span>
<span class="line"><span>│   │   应用代码                        │                       │</span></span>
<span class="line"><span>│   │                                  │                       │</span></span>
<span class="line"><span>│   │   if flag.is_enabled(            │                       │</span></span>
<span class="line"><span>│   │       &quot;new_checkout&quot;,            │                       │</span></span>
<span class="line"><span>│   │       user=current_user) {       │                       │</span></span>
<span class="line"><span>│   │     return new_checkout()        │                       │</span></span>
<span class="line"><span>│   │   } else {                       │                       │</span></span>
<span class="line"><span>│   │     return old_checkout()        │                       │</span></span>
<span class="line"><span>│   │   }                              │                       │</span></span>
<span class="line"><span>│   └──────────────────────────────────┘                       │</span></span>
<span class="line"><span>└──────────────────────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>核心特点</strong>:</p><ol><li><strong>配置在外部</strong>——flag 真值不在代码里,在 Flag Service 里</li><li><strong>变更秒级生效</strong>——SDK 通过 SSE / WebSocket / 短轮询拉到新规则,不需要重启进程</li><li><strong>可基于用户上下文判断</strong>——同一个 flag,user_123 看到 true,user_456 看到 false</li><li><strong>本地评估</strong>——SDK 在本地决定真值,<strong>不是每次都调 Flag Service</strong>(否则单点会拖死整站)</li><li><strong>fallback</strong>——Flag Service 挂了,SDK 用本地缓存的最后已知规则,或用&quot;默认值&quot;兜底</li></ol><h3 id="_2-3-核心价值四件" tabindex="-1">2.3 核心价值四件 <a class="header-anchor" href="#_2-3-核心价值四件" aria-label="Permalink to &quot;2.3 核心价值四件&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>价值                      解决的问题</span></span>
<span class="line"><span>─────────────────         ──────────────────────────────────</span></span>
<span class="line"><span>1. Deploy / Release 解耦  代码 deploy 不等于功能 release,可以提前 deploy</span></span>
<span class="line"><span>                          降低发布风险,功能可以慢慢&quot;打开&quot;</span></span>
<span class="line"><span>                          </span></span>
<span class="line"><span>2. 灰度                   按用户 ID / 地域 / 版本灰度,粒度比 K8s 流量切分细</span></span>
<span class="line"><span>                          可以&quot;给某个特定 KA 用户 / 内部员工&quot;提前用</span></span>
<span class="line"><span>                          </span></span>
<span class="line"><span>3. 应急熔断(Kill Switch) 出事不用 rollback 代码,关 flag 秒级生效</span></span>
<span class="line"><span>                          这是 Flag 真正&quot;救命&quot;的场景</span></span>
<span class="line"><span>                          </span></span>
<span class="line"><span>4. A/B 测试               把灰度的&quot;50% 看 A,50% 看 B&quot;变成可重复的实验配置</span></span>
<span class="line"><span>                          配合埋点上报,产品决策有数据支撑</span></span></code></pre></div><p><strong>这四个价值里,我认为&quot;应急熔断&quot;是最被低估的</strong>——平时不显眼,出事时它是命门。<strong>一个 100 个微服务的系统,关键的非核心功能(推荐 / 个性化 / 实时分析)都该有 Kill Switch</strong>,出事时一秒关掉,主流程救活。</p><hr><h2 id="三、选型-launchdarkly-unleash-flagsmith-openfeature-自建" tabindex="-1">三、选型:LaunchDarkly / Unleash / Flagsmith / OpenFeature / 自建 <a class="header-anchor" href="#三、选型-launchdarkly-unleash-flagsmith-openfeature-自建" aria-label="Permalink to &quot;三、选型:LaunchDarkly / Unleash / Flagsmith / OpenFeature / 自建&quot;">​</a></h2><p>Feature Flag 工具市场五个主流方案,<strong>完全不是&quot;哪个最好&quot;的问题,是&quot;你团队规模和预算决定哪个适合&quot;</strong>。</p><h3 id="_3-1-五个方案对比" tabindex="-1">3.1 五个方案对比 <a class="header-anchor" href="#_3-1-五个方案对比" aria-label="Permalink to &quot;3.1 五个方案对比&quot;">​</a></h3><table tabindex="0"><thead><tr><th>方案</th><th>类型</th><th>优势</th><th>劣势</th><th>价格(2026 美元)</th></tr></thead><tbody><tr><td><strong>LaunchDarkly</strong></td><td>SaaS</td><td>行业标杆,SDK 最全,生态最深</td><td>贵,需要可访问外网</td><td>~$15/seat/月 + MAU 费,中型团队 $1k-5k/月</td></tr><tr><td><strong>Unleash</strong></td><td>开源 + 商业</td><td>开源功能完整,自托管可控,中型团队首选</td><td>UI 比 LD 弱,实验功能在 enterprise</td><td>OSS 免费;Cloud $80/月起</td></tr><tr><td><strong>Flagsmith</strong></td><td>开源 + 商业</td><td>开源完整,UI 友好,边缘评估好</td><td>生态比 Unleash 略小</td><td>OSS 免费;Cloud $45/月起</td></tr><tr><td><strong>OpenFeature</strong></td><td>标准 / SDK 抽象</td><td>CNCF 项目,SDK 抽象层,避免供应商锁定</td><td>不是产品,需要后端(LD / Unleash / Flagsmith)</td><td>免费</td></tr><tr><td><strong>自建</strong></td><td>DIY</td><td>完全可控,0 license 费</td><td>工程成本极高,要维护 SDK / 评估引擎 / UI / 高可用</td><td>一个 SRE 半年工时</td></tr></tbody></table><h3 id="_3-2-五个方案的取舍" tabindex="-1">3.2 五个方案的取舍 <a class="header-anchor" href="#_3-2-五个方案的取舍" aria-label="Permalink to &quot;3.2 五个方案的取舍&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>团队 &lt; 5 人 / 几个 flag         → LaunchDarkly 太贵,Unleash 太重,</span></span>
<span class="line"><span>                                  用 Redis + Web 自建够用(&lt; 100 行)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>团队 5-30 人 / 中型业务系统      → Unleash 自托管,功能完整,</span></span>
<span class="line"><span>                                  和 K8s + Prometheus 生态贴合</span></span>
<span class="line"><span></span></span>
<span class="line"><span>团队 30+ / 多产品线             → LaunchDarkly,SDK / 实验 / 审计完整,</span></span>
<span class="line"><span>                                  对外多客户用 segment 管,价值高</span></span>
<span class="line"><span></span></span>
<span class="line"><span>跨多个 SaaS 客户 / 不想锁定供应商 → OpenFeature SDK + 任意后端,</span></span>
<span class="line"><span>                                  以后换供应商不改代码</span></span>
<span class="line"><span></span></span>
<span class="line"><span>监管严格 / 不能用 SaaS          → Unleash / Flagsmith 自托管</span></span>
<span class="line"><span>                                  + 自建审计日志</span></span>
<span class="line"><span></span></span>
<span class="line"><span>国内业务 / 完全国产化            → 自建 + 飞书 / 钉钉机器人审批</span></span>
<span class="line"><span>                                  + Apollo / Nacos 当配置中心一并复用</span></span></code></pre></div><h3 id="_3-3-我对中型团队的建议" tabindex="-1">3.3 我对中型团队的建议 <a class="header-anchor" href="#_3-3-我对中型团队的建议" aria-label="Permalink to &quot;3.3 我对中型团队的建议&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>中型团队(10 人 / 100 微服务 / 5000 QPS)起步路径:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Step 1  写 SDK 之前先用 OpenFeature 接口</span></span>
<span class="line"><span>        → 团队代码里所有 if flag.is_enabled() 调 OpenFeature API</span></span>
<span class="line"><span>        → 后端先用 NoOp Provider,真值都是 default,等于没接</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Step 2  装 Unleash 自托管</span></span>
<span class="line"><span>        → 一个 K8s deployment + 一个 PostgreSQL,跑起来 30 分钟</span></span>
<span class="line"><span>        → 把 OpenFeature 的 Provider 切到 Unleash</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Step 3  从一个 P2 业务接入</span></span>
<span class="line"><span>        → 选一个变化频繁的功能(比如&quot;首页 banner 轮播策略&quot;)</span></span>
<span class="line"><span>        → 接入 flag,跑 2 周,看运营自助效果</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Step 4  扩展到关键服务的&quot;Kill Switch&quot;</span></span>
<span class="line"><span>        → 给所有非核心功能(推荐 / 个性化 / 实时分析)加 kill switch</span></span>
<span class="line"><span>        → 半夜出事时一键关闭</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Step 5  接 A/B 实验(可选)</span></span>
<span class="line"><span>        → 如果产品需要,加埋点和实验分组</span></span></code></pre></div><p><strong>为什么要用 OpenFeature 抽象层</strong>:<strong>早期投入的代码不会被锁死</strong>。如果 Unleash 后期不够用,可以换 LaunchDarkly,<strong>业务代码一行不改</strong>——这件事一年后会让你感谢自己。</p><hr><h2 id="四、灰度维度-flag-评估的输入" tabindex="-1">四、灰度维度:Flag 评估的输入 <a class="header-anchor" href="#四、灰度维度-flag-评估的输入" aria-label="Permalink to &quot;四、灰度维度:Flag 评估的输入&quot;">​</a></h2><p>Feature Flag 真正强大的地方不是&quot;开 / 关&quot;,是<strong>基于用户上下文做精细化决策</strong>——同一个 flag,不同用户看到不同结果。这个&quot;上下文&quot;通常包含:</p><h3 id="_4-1-七种主流维度" tabindex="-1">4.1 七种主流维度 <a class="header-anchor" href="#_4-1-七种主流维度" aria-label="Permalink to &quot;4.1 七种主流维度&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  灰度维度对比                                                │</span></span>
<span class="line"><span>├──────────────┬─────────────────┬───────────────────────────┤</span></span>
<span class="line"><span>│  维度         │  典型用例        │  陷阱                     │</span></span>
<span class="line"><span>├──────────────┼─────────────────┼───────────────────────────┤</span></span>
<span class="line"><span>│  用户 ID hash │ &quot;随机 5% 用户&quot;   │ key 必须稳定,不能用       │</span></span>
<span class="line"><span>│              │  最常见         │  随机数 / IP / cookie     │</span></span>
<span class="line"><span>├──────────────┼─────────────────┼───────────────────────────┤</span></span>
<span class="line"><span>│  地域         │ &quot;先在上海试 1 周&quot; │ IP→地域 准确度不高,       │</span></span>
<span class="line"><span>│              │                 │  典型 95% 准                │</span></span>
<span class="line"><span>├──────────────┼─────────────────┼───────────────────────────┤</span></span>
<span class="line"><span>│  设备         │ &quot;iOS 用户先用&quot;   │ User-Agent 可伪造,        │</span></span>
<span class="line"><span>│              │                 │  内部需要的话用客户端 SDK   │</span></span>
<span class="line"><span>├──────────────┼─────────────────┼───────────────────────────┤</span></span>
<span class="line"><span>│  客户端版本   │ &quot;v4.2.1+ 启用&quot;   │ 旧客户端 fallback 路径必备 │</span></span>
<span class="line"><span>├──────────────┼─────────────────┼───────────────────────────┤</span></span>
<span class="line"><span>│  租户(B2B)│ &quot;公司 A 启用&quot;     │ 租户 ID 必须早就埋进上下文 │</span></span>
<span class="line"><span>├──────────────┼─────────────────┼───────────────────────────┤</span></span>
<span class="line"><span>│  百分比       │ &quot;10% 流量&quot;       │ 同 ID hash,key 选择关键 │</span></span>
<span class="line"><span>├──────────────┼─────────────────┼───────────────────────────┤</span></span>
<span class="line"><span>│  特定属性     │ &quot;VIP / 年龄 30+&quot; │ 属性必须服务端可见         │</span></span>
<span class="line"><span>│              │                 │ 不能由客户端 self-declare  │</span></span>
<span class="line"><span>└──────────────┴─────────────────┴───────────────────────────┘</span></span></code></pre></div><h3 id="_4-2-用户-id-hash-稳定灰度的标准做法" tabindex="-1">4.2 用户 ID hash:稳定灰度的标准做法 <a class="header-anchor" href="#_4-2-用户-id-hash-稳定灰度的标准做法" aria-label="Permalink to &quot;4.2 用户 ID hash:稳定灰度的标准做法&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错的做法(随机):</span></span>
<span class="line"><span>   if random.random() &lt; 0.05:   # 5% 用户</span></span>
<span class="line"><span>       return new_feature()</span></span>
<span class="line"><span>   else:</span></span>
<span class="line"><span>       return old_feature()</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  问题:同一个用户第二次访问可能看到不同结果,</span></span>
<span class="line"><span>        &quot;切换&quot;的体验极差,bug 更难复现</span></span>
<span class="line"><span></span></span>
<span class="line"><span>对的做法(用户 ID hash):</span></span>
<span class="line"><span>   bucket = hash(user.id + &quot;feature_xyz_salt&quot;) % 100   # 0-99</span></span>
<span class="line"><span>   if bucket &lt; 5:                                       # 5% 桶</span></span>
<span class="line"><span>       return new_feature()</span></span>
<span class="line"><span>   else:</span></span>
<span class="line"><span>       return old_feature()</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  保证:同一个 user.id 在 flag 配置不变时永远看到同样结果</span></span>
<span class="line"><span>        放量 5% → 10% 时,新增的 5% 是上一批没看到的,不是新一批随机</span></span></code></pre></div><p><strong>为什么要加 salt</strong>:不同 flag 应该有不同的 bucket 分布。如果所有 flag 都用 <code>hash(user.id) % 100</code>,<strong>同一批&quot;前 5%&quot;用户会在所有 flag 都被选中</strong>——他们成了&quot;永远的灰度白鼠&quot;,体验最不稳。<strong>每个 flag 配自己的 salt,bucket 分布在不同 flag 之间独立</strong>。</p><h3 id="_4-3-多维度组合规则" tabindex="-1">4.3 多维度组合规则 <a class="header-anchor" href="#_4-3-多维度组合规则" aria-label="Permalink to &quot;4.3 多维度组合规则&quot;">​</a></h3><p>工业 Flag 工具支持「规则链」:<strong>按顺序匹配,匹配中就返回,匹配不上往下走</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>flag: new_checkout</span></span>
<span class="line"><span>─────────────────────────────────────────</span></span>
<span class="line"><span>Rule 1: user.tier == &quot;internal&quot;      → ENABLED (内部员工先用)</span></span>
<span class="line"><span>Rule 2: user.country == &quot;JP&quot;          → DISABLED (日本暂不上)</span></span>
<span class="line"><span>Rule 3: client.version &gt;= &quot;4.2.1&quot;     → </span></span>
<span class="line"><span>          - 5% bucket → ENABLED       (移动新版灰度)</span></span>
<span class="line"><span>          - 否则      → DISABLED</span></span>
<span class="line"><span>Default                               → DISABLED</span></span></code></pre></div><p><strong>这种规则的核心价值</strong>:<strong>运营 / 产品在 Web UI 上调,工程师不写代码</strong>。Dev 只负责保证 <code>current_user.tier</code> / <code>current_user.country</code> 这些字段被正确地传入 SDK。</p><hr><h2 id="五、flag-类型-不要把所有-flag-当一种东西" tabindex="-1">五、Flag 类型:不要把所有 flag 当一种东西 <a class="header-anchor" href="#五、flag-类型-不要把所有-flag-当一种东西" aria-label="Permalink to &quot;五、Flag 类型:不要把所有 flag 当一种东西&quot;">​</a></h2><p>Martin Fowler 在《Feature Toggles》一文里提出 Flag 类型化的思路——<strong>不同寿命、不同目的的 flag,管理纪律完全不一样</strong>。混在一起的代价是治理混乱。</p><h3 id="_5-1-四种-flag-类型" tabindex="-1">5.1 四种 Flag 类型 <a class="header-anchor" href="#_5-1-四种-flag-类型" aria-label="Permalink to &quot;5.1 四种 Flag 类型&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌─────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  Flag 类型             生命周期       动态变更        │</span></span>
<span class="line"><span>├─────────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>│  1. Release Flag       1-30 天        是             │</span></span>
<span class="line"><span>│     &quot;新功能灰度发布&quot;                                    │</span></span>
<span class="line"><span>│     发布后逐步放量,放量 100% 后立刻删                  │</span></span>
<span class="line"><span>│                                                       │</span></span>
<span class="line"><span>│  2. Experiment Flag    2-12 周        是             │</span></span>
<span class="line"><span>│     &quot;A/B 实验 / 多臂老虎机&quot;                            │</span></span>
<span class="line"><span>│     实验结束后 → 选胜出方案,删 flag                   │</span></span>
<span class="line"><span>│                                                       │</span></span>
<span class="line"><span>│  3. Ops Flag           长期 / 永久    是             │</span></span>
<span class="line"><span>│     &quot;应急熔断 / 容量限制 / 降级开关&quot;                   │</span></span>
<span class="line"><span>│     不删,但要定期演练                                  │</span></span>
<span class="line"><span>│                                                       │</span></span>
<span class="line"><span>│  4. Permission Flag    长期 / 永久    是             │</span></span>
<span class="line"><span>│     &quot;Premium 用户才能用 / B2B 客户白名单&quot;              │</span></span>
<span class="line"><span>│     这本质是权限系统,不应该用 flag 长期管             │</span></span>
<span class="line"><span>│     → 早期可以用,业务稳定后迁到正经权限系统           │</span></span>
<span class="line"><span>└─────────────────────────────────────────────────────────┘</span></span></code></pre></div><h3 id="_5-2-四种类型的管理纪律差异" tabindex="-1">5.2 四种类型的管理纪律差异 <a class="header-anchor" href="#_5-2-四种类型的管理纪律差异" aria-label="Permalink to &quot;5.2 四种类型的管理纪律差异&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Release Flag:</span></span>
<span class="line"><span>   - 必须有 owner + 创建日期 + 到期日</span></span>
<span class="line"><span>   - 到期日(典型 30 天)前没放完 → 强制提醒 / 升级</span></span>
<span class="line"><span>   - 放完 100% → 1 周内必须删</span></span>
<span class="line"><span>   - 团队季度 review 所有 Release flag,删僵尸</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Experiment Flag:</span></span>
<span class="line"><span>   - 必须有&quot;实验设计&quot;(指标、显著性、停止规则)</span></span>
<span class="line"><span>   - 实验期到了 → 必须出报告 + 决策(选哪个方案)</span></span>
<span class="line"><span>   - 决策完 → 1 周内删 flag,代码合并胜出方案</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Ops Flag:</span></span>
<span class="line"><span>   - 不死,但每月强制&quot;试关&quot;演练 1 次</span></span>
<span class="line"><span>   - 演练流程:在 staging 关 → 验证降级行为 → 关闭并恢复</span></span>
<span class="line"><span>   - 不演练 = 它根本不能用(代码可能已腐烂)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Permission Flag:</span></span>
<span class="line"><span>   - 短期 OK,但 6 个月后要评估&quot;是不是该升级到正式权限&quot;</span></span>
<span class="line"><span>   - 用 flag 管 1000 个客户的权限矩阵 = 噩梦</span></span>
<span class="line"><span>   - 早做迁移</span></span></code></pre></div><p><strong>最常见的失败模式</strong>:<strong>所有 flag 都被当成 Release flag</strong>,没有区分——结果 Ops flag 也被半年清理一次,演练从来不做,真出事的时候才发现&quot;这个降级开关代码已经不工作了&quot;。</p><hr><h2 id="六、技术债-flag-治理是这一篇的真核心" tabindex="-1">六、技术债:Flag 治理是这一篇的真核心 <a class="header-anchor" href="#六、技术债-flag-治理是这一篇的真核心" aria-label="Permalink to &quot;六、技术债:Flag 治理是这一篇的真核心&quot;">​</a></h2><p>讲了一圈&quot;Flag 多好用&quot;,<strong>这一节讲它的反面——Flag 是技术债的高产户</strong>。</p><h3 id="_6-1-僵尸-flag-是怎么长出来的" tabindex="-1">6.1 僵尸 Flag 是怎么长出来的 <a class="header-anchor" href="#_6-1-僵尸-flag-是怎么长出来的" aria-label="Permalink to &quot;6.1 僵尸 Flag 是怎么长出来的&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>T+0   Dev 加了一个 flag &quot;new_checkout&quot;</span></span>
<span class="line"><span>T+10  灰度 5% → 25% → 50% → 100%</span></span>
<span class="line"><span>T+11  Dev 想:&quot;先放一周观察,稳定了我再删&quot;</span></span>
<span class="line"><span>T+18  忘了</span></span>
<span class="line"><span>T+30  另一个 Dev 看到这个 flag,问 &quot;这还要不要?&quot;</span></span>
<span class="line"><span>       原 Dev 说:&quot;还在观察,先留着&quot;</span></span>
<span class="line"><span>T+60  原 Dev 离职 / 转组</span></span>
<span class="line"><span>T+90  团队 review,发现这个 flag,问 &quot;owner 是谁&quot;</span></span>
<span class="line"><span>       没人知道,大家都不敢删</span></span>
<span class="line"><span>T+180 代码里这个 if 分支已经长出了 5 个 sub-flag</span></span>
<span class="line"><span>       删 flag 等于删一片代码,但谁都不敢动</span></span>
<span class="line"><span>T+365 团队的&quot;Flag 列表&quot;已经 200 个,80% 是僵尸</span></span>
<span class="line"><span>       新人 onboard 一脸懵:这些 if 都是干嘛的</span></span></code></pre></div><p><strong>根因</strong>:<strong>Flag 是&quot;加&quot;很容易,&quot;删&quot;是工程动作</strong>。删 flag 不是改 UI 里的开关默认值,<strong>是要去代码里删掉整个 if 分支,然后做一次 PR + CI + deploy</strong>。这个工作量没人主动做,僵尸自然生长。</p><h3 id="_6-2-治理三件套-owner-到期日-季度清理" tabindex="-1">6.2 治理三件套:owner / 到期日 / 季度清理 <a class="header-anchor" href="#_6-2-治理三件套-owner-到期日-季度清理" aria-label="Permalink to &quot;6.2 治理三件套:owner / 到期日 / 季度清理&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌──────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  Flag 治理三件套                                            │</span></span>
<span class="line"><span>├──────────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>│                                                          │</span></span>
<span class="line"><span>│  1. 每个 Flag 必须有 Owner                                 │</span></span>
<span class="line"><span>│     - 创建 flag 时强制填,不填 SDK 拒绝注册               │</span></span>
<span class="line"><span>│     - Owner 离职 / 转组 → 强制 reassign                  │</span></span>
<span class="line"><span>│     - Owner 的工作:flag 的生死他负责                     │</span></span>
<span class="line"><span>│                                                          │</span></span>
<span class="line"><span>│  2. 每个 Flag 必须有&quot;预计删除日期&quot;                         │</span></span>
<span class="line"><span>│     - Release flag:默认 30 天                            │</span></span>
<span class="line"><span>│     - Experiment flag:默认 60 天                         │</span></span>
<span class="line"><span>│     - Ops / Permission:可选&quot;长期&quot;                        │</span></span>
<span class="line"><span>│     - 到期未删 → 自动飞书 / 邮件给 owner,5 次未处理升级到经理│</span></span>
<span class="line"><span>│                                                          │</span></span>
<span class="line"><span>│  3. 季度清理                                              │</span></span>
<span class="line"><span>│     - 每季度扫一次:                                       │</span></span>
<span class="line"><span>│       a. 100% 启用 且 &gt; 60 天 → 删!                      │</span></span>
<span class="line"><span>│       b. 0% 启用 且 &gt; 60 天 → 删!                        │</span></span>
<span class="line"><span>│       c. owner 已离职 / 无明确目的 → 评估删!              │</span></span>
<span class="line"><span>│     - 团队 OKR / 绩效里加&quot;Flag 清理&quot;指标                  │</span></span>
<span class="line"><span>│                                                          │</span></span>
<span class="line"><span>└──────────────────────────────────────────────────────────┘</span></span></code></pre></div><h3 id="_6-3-删-flag-是真删代码" tabindex="-1">6.3 删 Flag 是真删代码 <a class="header-anchor" href="#_6-3-删-flag-是真删代码" aria-label="Permalink to &quot;6.3 删 Flag 是真删代码&quot;">​</a></h3><p><strong>重点重申</strong>:删 flag 不是&quot;在 UI 里把 flag 状态调到 100% 启用就完事&quot;——<strong>是真删代码</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错的&quot;删 flag&quot;:</span></span>
<span class="line"><span>   - UI 上把 new_checkout 调到 100% 启用</span></span>
<span class="line"><span>   - 代码里 if flag.is_enabled(&quot;new_checkout&quot;) { new() } else { old() }</span></span>
<span class="line"><span>   - 永远走 new() 分支,old() 分支变成死代码</span></span>
<span class="line"><span>   - flag 本身还在,SDK 还在查询,新人还以为它有意义</span></span>
<span class="line"><span></span></span>
<span class="line"><span>对的删 flag(完整三步):</span></span>
<span class="line"><span>   Step 1   在 UI 上把 flag 强制设为 100%(不管之前的灰度规则)</span></span>
<span class="line"><span>   Step 2   等一周,确认没人投诉</span></span>
<span class="line"><span>   Step 3   提 PR:</span></span>
<span class="line"><span>              - 代码里删掉 if flag.is_enabled(&quot;...&quot;) 的判断</span></span>
<span class="line"><span>              - 直接调用 new()</span></span>
<span class="line"><span>              - 删掉 old() 函数 / 路径</span></span>
<span class="line"><span>              - 删掉 flag 的定义</span></span>
<span class="line"><span>              - CI / staging / prod 验证一遍</span></span>
<span class="line"><span>   Step 4   PR 合并 deploy 后,在 UI 上 archive flag(不是 disable!)</span></span></code></pre></div><p><strong>只有&quot;代码里删干净 + UI 里 archive&quot;双双完成,这个 flag 才算真死</strong>。少做一步,僵尸还会复活。</p><h3 id="_6-4-防止-flag-蔓延的代码纪律" tabindex="-1">6.4 防止 Flag 蔓延的代码纪律 <a class="header-anchor" href="#_6-4-防止-flag-蔓延的代码纪律" aria-label="Permalink to &quot;6.4 防止 Flag 蔓延的代码纪律&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>✓ 鼓励的做法:</span></span>
<span class="line"><span>   - 一个功能一个 flag(粒度大,长得慢)</span></span>
<span class="line"><span>   - flag 只在&quot;入口处&quot;判断,内部逻辑不再分支</span></span>
<span class="line"><span>   - 一旦放量到 100%,1 周内必删</span></span>
<span class="line"><span></span></span>
<span class="line"><span>✗ 禁止的做法:</span></span>
<span class="line"><span>   - 在循环里 / 高频路径里查 flag(SDK 缓存能扛但代码可读性烂)</span></span>
<span class="line"><span>   - &quot;为了未来灵活&quot;加 flag(YAGNI 原则,真要的时候再加)</span></span>
<span class="line"><span>   - flag 套 flag(if flag_A &amp;&amp; flag_B || flag_C → 复杂度爆炸)</span></span>
<span class="line"><span>   - 用 flag 替代正经的权限系统 / 多租户隔离</span></span>
<span class="line"><span>   - 同一个 flag 在不同环境(dev / staging / prod)行为不一致</span></span>
<span class="line"><span>     (这是&quot;配置漂移&quot;,见 27 篇)</span></span></code></pre></div><hr><h2 id="七、最小接入-openfeature-unleash" tabindex="-1">七、最小接入:OpenFeature + Unleash <a class="header-anchor" href="#七、最小接入-openfeature-unleash" aria-label="Permalink to &quot;七、最小接入:OpenFeature + Unleash&quot;">​</a></h2><p>讲了一堆原则,下面给真代码。<strong>这一节是给&quot;明天就要在团队里跑起来&quot;的工程师</strong>。</p><h3 id="_7-1-openfeature-sdk-接入-go" tabindex="-1">7.1 OpenFeature SDK 接入(Go) <a class="header-anchor" href="#_7-1-openfeature-sdk-接入-go" aria-label="Permalink to &quot;7.1 OpenFeature SDK 接入(Go)&quot;">​</a></h3><div class="language-go vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">go</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">package</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> main</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">import</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    &quot;</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">context</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    of </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">github.com/open-feature/go-sdk/openfeature</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    unleash </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">github.com/Unleash/unleash-openfeature-provider-go</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">func</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> main</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">() {</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    // 一次性初始化,在进程启动时调用</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    provider, _ </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">:=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> unleash.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">NewProvider</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">unleash</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">ProviderConfig</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">{</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        UnleashURL:  </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;https://unleash.example.com/api&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        ApiToken:    </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;&lt;token&gt;&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        AppName:     </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;order-api&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    })</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    of.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">SetProviderAndWait</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(provider)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">func</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> handleRequest</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">ctx</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> context</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">Context</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">user</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> User</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">) {</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    // 业务代码每次请求都这么写</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    client </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">:=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> of.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">NewClient</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;order-api&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    evalCtx </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">:=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> of.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">NewEvaluationContext</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        user.ID,</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">        map</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">[</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">string</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">interface</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">{}{</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            &quot;country&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:        user.Country,</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            &quot;tier&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:           user.Tier,</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            &quot;client_version&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: user.ClientVersion,</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        },</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    )</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    </span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    if</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> client.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">Boolean</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(ctx, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;new_checkout&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">false</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, evalCtx) {  </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">// 第二个参数 = default</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">        newCheckout</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(user)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    } </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">else</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">        oldCheckout</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(user)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    }</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span></code></pre></div><p><strong>关键点</strong>:</p><ol><li><strong><code>of.NewClient(&quot;order-api&quot;)</code> 创建一次复用</strong>——不要每次请求都 new(SDK 内部有缓存,但还是降低开销)</li><li><strong>第二个参数是 default</strong>——Flag Service 挂了 / flag 不存在,返回这个值</li><li><strong><code>evalCtx</code> 必须传完整用户上下文</strong>——country / tier / client_version 这种灰度维度依赖</li><li><strong><code>SetProviderAndWait</code> 启动时等 provider 就绪</strong>——避免冷启动期 default 全返回</li></ol><h3 id="_7-2-openfeature-sdk-接入-typescript" tabindex="-1">7.2 OpenFeature SDK 接入(TypeScript) <a class="header-anchor" href="#_7-2-openfeature-sdk-接入-typescript" aria-label="Permalink to &quot;7.2 OpenFeature SDK 接入(TypeScript)&quot;">​</a></h3><div class="language-typescript vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">typescript</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">import</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> { OpenFeature } </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">from</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;@openfeature/server-sdk&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">import</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> { UnleashProvider } </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">from</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;@openfeature/unleash-provider&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">// 进程启动</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">const</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> provider</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> new</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> UnleashProvider</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">({</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  url: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;https://unleash.example.com/api&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  appName: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;order-api&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  customHeaders: { Authorization: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;&lt;token&gt;&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> },</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">});</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">await</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> OpenFeature.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">setProviderAndWait</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(provider);</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">const</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> client</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> OpenFeature.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">getClient</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;order-api&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">);</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">// 业务代码</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">async</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> function</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> handleRequest</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">user</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">:</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> User</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">) {</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">  const</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> evalCtx</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    targetingKey: user.id,                    </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">// OpenFeature 规范的用户 key</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    country: user.country,</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    tier: user.tier,</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    client_version: user.clientVersion,</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  };</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">  const</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> enabled</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> await</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> client.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">getBooleanValue</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    &#39;new_checkout&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    false</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,          </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">// default</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    evalCtx,</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  );</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">  return</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> enabled </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">?</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> newCheckout</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(user) </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">:</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> oldCheckout</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(user);</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span></code></pre></div><h3 id="_7-3-unleash-服务端-deployment" tabindex="-1">7.3 Unleash 服务端 deployment <a class="header-anchor" href="#_7-3-unleash-服务端-deployment" aria-label="Permalink to &quot;7.3 Unleash 服务端 deployment&quot;">​</a></h3><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">apiVersion</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">apps/v1</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">kind</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">Deployment</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">metadata</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">unleash</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  namespace</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">feature-flag</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">spec</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  replicas</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">2</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  selector</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    matchLabels</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      app</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">unleash</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  template</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    metadata</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      labels</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        app</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">unleash</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    spec</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      containers</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">unleash</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          image</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">unleashorg/unleash-server:5.12.0</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          ports</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">containerPort</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">4242</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          env</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">DATABASE_URL</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">              valueFrom</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">                secretKeyRef</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">                  name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">unleash-pg</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">                  key</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">url</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">INIT_ADMIN_API_TOKENS</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">              valueFrom</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">                secretKeyRef</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">                  name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">unleash-tokens</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">                  key</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">admin</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          resources</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">            requests</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">              cpu</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">200m</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">              memory</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">256Mi</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">            limits</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">              cpu</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">1</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">              memory</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">1Gi</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          livenessProbe</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">            httpGet</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: { </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">path</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">/health</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">port</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">4242</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> }</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">            periodSeconds</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">30</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          readinessProbe</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">            httpGet</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: { </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">path</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">/health</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">port</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">4242</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> }</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">            periodSeconds</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">10</span></span></code></pre></div><p><strong>关键取舍</strong>:</p><ol><li><strong>副本数 2 起步</strong>——单点 Unleash 挂了,SDK 用本地缓存兜底,但变更要 1 分钟以上才生效</li><li><strong>PostgreSQL 用 cloud-managed</strong>(RDS / CloudSQL)——别自己 K8s 起 PG,Flag Service 对 DB 强依赖</li><li><strong>资源 1 vCPU / 1Gi</strong>——中型团队 50 个 flag、1000 QPS 评估,这个配置够用</li><li><strong><code>INIT_ADMIN_API_TOKENS</code> 从 Secret 注入</strong>——绝不写死,token 泄露 = 别人能改你所有 flag</li></ol><h3 id="_7-4-真实的-flag-评估代码-错误处理是重点" tabindex="-1">7.4 真实的 flag 评估代码:错误处理是重点 <a class="header-anchor" href="#_7-4-真实的-flag-评估代码-错误处理是重点" aria-label="Permalink to &quot;7.4 真实的 flag 评估代码:错误处理是重点&quot;">​</a></h3><div class="language-python vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">python</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">from</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> openfeature </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">import</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> api </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">as</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> of</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">def</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> get_checkout_handler</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(user: User):</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    &quot;&quot;&quot;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    返回 new 或 old checkout handler</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    Flag: new_checkout</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    Default: False (走 old)</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    Owner: payment-team</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    To-Delete-By: 2026-08-15</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    &quot;&quot;&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    client </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> of.get_client(</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;order-api&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    </span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    try</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        eval_ctx </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            &quot;targetingKey&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: user.id,        </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 用户唯一标识,稳定的</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            &quot;country&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:      user.country,   </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 地域灰度</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            &quot;tier&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:         user.tier,      </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 用户分层(VIP / 普通)</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            &quot;client_version&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: user.client_version,</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        }</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">        # 第二个参数 default 必须是&quot;出问题也安全&quot;的值</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        enabled </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> client.get_boolean_value(</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            &quot;new_checkout&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">            False</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,          </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 默认值 = 走老路径(已经验证过的)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            eval_ctx,</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        )</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    except</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> Exception</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> as</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> e:</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">        # SDK 异常 / 超时 → 走 default,不要让 flag 评估失败导致请求失败</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        logger.warning(</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;flag eval failed, falling back to default&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">error</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">e)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        enabled </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> False</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    </span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    return</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> new_checkout </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">if</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> enabled </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">else</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> old_checkout</span></span></code></pre></div><p><strong>关键纪律</strong>:</p><ol><li><strong>default 必须是&quot;安全值&quot;</strong>——一般是 false(走旧路径)。<strong>不要把 default 设成 true 然后用 flag 关闭&quot;新功能&quot;</strong>,Flag Service 一挂全员看到新功能。</li><li><strong>try/except 兜底</strong>——SDK 调用必须永远不能抛异常导致主流程失败。<strong>Flag 评估永远是辅助,不能成为依赖</strong>。</li><li><strong>代码注释里写 flag 元数据</strong>——owner / 到期日 / 描述,在 PR review 时同行看得见。</li><li><strong><code>targetingKey</code> 必须稳定</strong>——同一个用户每次评估传同样的 key,<strong>绝不能用 IP / 临时 cookie / session ID</strong>(这些会变,导致灰度抖动)。</li></ol><hr><h2 id="八、flag-与渐进发布-正交的两个维度" tabindex="-1">八、Flag 与渐进发布:正交的两个维度 <a class="header-anchor" href="#八、flag-与渐进发布-正交的两个维度" aria-label="Permalink to &quot;八、Flag 与渐进发布:正交的两个维度&quot;">​</a></h2><p>新人最常问的问题:「<strong>有了金丝雀,还要 Feature Flag 吗?</strong>」</p><p><strong>答案</strong>:<strong>要,而且它们是正交的两个维度</strong>——金丝雀控制&quot;实例维度&quot;,Flag 控制&quot;启用维度&quot;,同一次发布两件事可以叠加。</p><h3 id="_8-1-两者的对比" tabindex="-1">8.1 两者的对比 <a class="header-anchor" href="#_8-1-两者的对比" aria-label="Permalink to &quot;8.1 两者的对比&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                金丝雀                Feature Flag</span></span>
<span class="line"><span>                ──────────────────    ──────────────────</span></span>
<span class="line"><span>控制目标         pod 实例的流量比例     某段代码的启用与否</span></span>
<span class="line"><span>粒度             5% / 25% / 50% pod    具体到用户 ID / 属性</span></span>
<span class="line"><span>生效时间         需要 K8s rollout 改   秒级(SDK 拉新规则)</span></span>
<span class="line"><span>回退方式         调 weight 回 0       关 flag</span></span>
<span class="line"><span>适合场景         整个服务版本切换       单个功能开关 / 实验</span></span>
<span class="line"><span>保留时间         发布完即结束          可长期保留(如 Kill Switch)</span></span>
<span class="line"><span>配置位置         K8s yaml / GitOps     Flag Service Web UI</span></span></code></pre></div><h3 id="_8-2-怎么组合用" tabindex="-1">8.2 怎么组合用 <a class="header-anchor" href="#_8-2-怎么组合用" aria-label="Permalink to &quot;8.2 怎么组合用&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  典型组合场景                                                │</span></span>
<span class="line"><span>├────────────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>│                                                            │</span></span>
<span class="line"><span>│  场景:发布 v2.4.7,包含 3 个新功能,其中 2 个想灰度        │</span></span>
<span class="line"><span>│                                                            │</span></span>
<span class="line"><span>│  Step 1:代码里 3 个新功能都用 flag 包                       │</span></span>
<span class="line"><span>│           - feature_A: flag &quot;new_checkout&quot;                 │</span></span>
<span class="line"><span>│           - feature_B: flag &quot;new_search&quot;                   │</span></span>
<span class="line"><span>│           - feature_C: 没 flag(小修复)                     │</span></span>
<span class="line"><span>│                                                            │</span></span>
<span class="line"><span>│  Step 2:flag 全设为 OFF,代码 deploy 到生产                 │</span></span>
<span class="line"><span>│           - 用渐进发布(金丝雀)推 v2.4.7                    │</span></span>
<span class="line"><span>│           - 1% → 5% → 25% → 50% → 100%                    │</span></span>
<span class="line"><span>│           - 每挡观察:错误率 / P99 / 资源占用                │</span></span>
<span class="line"><span>│           - 这个阶段验证的是&quot;代码本身能跑&quot;                   │</span></span>
<span class="line"><span>│                                                            │</span></span>
<span class="line"><span>│  Step 3:v2.4.7 全量后,flag 仍 OFF,行为等同 v2.4.6         │</span></span>
<span class="line"><span>│           - 验证完成,no surprise                          │</span></span>
<span class="line"><span>│                                                            │</span></span>
<span class="line"><span>│  Step 4:开始 flag 灰度                                     │</span></span>
<span class="line"><span>│           - Day 1:new_checkout 给 5% 用户开                │</span></span>
<span class="line"><span>│           - Day 3:扩到 25%                                 │</span></span>
<span class="line"><span>│           - Day 7:100%                                    │</span></span>
<span class="line"><span>│           - new_search 同理                                │</span></span>
<span class="line"><span>│                                                            │</span></span>
<span class="line"><span>│  Step 5:flag 100% 一周后,删除 flag(改代码)               │</span></span>
<span class="line"><span>│                                                            │</span></span>
<span class="line"><span>└────────────────────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>这种组合的关键价值</strong>:<strong>代码发布 和 功能发布 是两件独立的事</strong>——v2.4.7 deploy 完成 = 代码工程结束;flag 100% + 删 = 产品功能结束。两件事的节奏完全独立,<strong>互不阻塞</strong>。</p><h3 id="_8-3-工程上怎么权衡" tabindex="-1">8.3 工程上怎么权衡 <a class="header-anchor" href="#_8-3-工程上怎么权衡" aria-label="Permalink to &quot;8.3 工程上怎么权衡&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>小修复 / Bug fix       → 不用 flag,渐进发布即可</span></span>
<span class="line"><span>                        flag 反而增加复杂度</span></span>
<span class="line"><span>                        </span></span>
<span class="line"><span>中等功能(用户感知)     → flag 包起来,渐进发布 + flag 灰度</span></span>
<span class="line"><span>                        典型:&quot;新版搜索&quot;、&quot;新结算流程&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>大功能(架构级 / 风险高) → flag + 渐进发布 + 影子流量</span></span>
<span class="line"><span>                        三层保护,稳如老狗</span></span>
<span class="line"><span>                        典型:&quot;切换支付下游&quot;、&quot;重写订单核心&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>紧急 hotfix            → 走快速通道,不必新建 flag</span></span>
<span class="line"><span>                        如果是关闭某个功能,关已有的 flag(假设之前埋过)</span></span></code></pre></div><hr><h2 id="九、何时该用-feature-flag-何时不该" tabindex="-1">九、何时该用 Feature Flag / 何时不该 <a class="header-anchor" href="#九、何时该用-feature-flag-何时不该" aria-label="Permalink to &quot;九、何时该用 Feature Flag / 何时不该&quot;">​</a></h2><p><strong>Flag 是有维护成本的,滥用会把代码搞乱</strong>。这一节给具体决策矩阵。</p><h3 id="_9-1-该用-flag-的四类场景" tabindex="-1">9.1 该用 Flag 的四类场景 <a class="header-anchor" href="#_9-1-该用-flag-的四类场景" aria-label="Permalink to &quot;9.1 该用 Flag 的四类场景&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>✓ 用户感知的功能改动</span></span>
<span class="line"><span>   - 新的 UI / 交互流程 / 业务规则</span></span>
<span class="line"><span>   - 想要&quot;灰度放量&quot;或&quot;按客户白名单开放&quot;</span></span>
<span class="line"><span>   - 上线后想&quot;先开 1 周看反馈&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>✓ 可调节的运行时配置</span></span>
<span class="line"><span>   - 速率限制阈值(峰值时手动调)</span></span>
<span class="line"><span>   - 重试次数 / 超时时间</span></span>
<span class="line"><span>   - 是否启用某个下游(降级用)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>✓ A/B 实验</span></span>
<span class="line"><span>   - 多个候选方案的转化率对比</span></span>
<span class="line"><span>   - 多臂老虎机优化</span></span>
<span class="line"><span></span></span>
<span class="line"><span>✓ 运营紧急关闭(Kill Switch)</span></span>
<span class="line"><span>   - 推荐 / 个性化等&quot;非核心但耗资源&quot;功能</span></span>
<span class="line"><span>   - 出事时一键关闭主流程救活</span></span></code></pre></div><h3 id="_9-2-不该用-flag-的四类场景" tabindex="-1">9.2 不该用 Flag 的四类场景 <a class="header-anchor" href="#_9-2-不该用-flag-的四类场景" aria-label="Permalink to &quot;9.2 不该用 Flag 的四类场景&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>✗ 纯重构(不改变行为)</span></span>
<span class="line"><span>   - 重构是&quot;对外行为不变&quot;的代码改动</span></span>
<span class="line"><span>   - 包 flag 等于&quot;两个版本并存&quot;,违背重构的纪律</span></span>
<span class="line"><span>   - 用渐进发布 + 影子流量验证就够了</span></span>
<span class="line"><span></span></span>
<span class="line"><span>✗ 纯性能优化</span></span>
<span class="line"><span>   - 优化算法 / 加缓存 / 改数据结构</span></span>
<span class="line"><span>   - 这种改动的&quot;对外行为不变&quot;,同上</span></span>
<span class="line"><span>   - 性能优化的灰度走金丝雀,不走 flag</span></span>
<span class="line"><span></span></span>
<span class="line"><span>✗ 生命周期 &lt; 1 周的小功能</span></span>
<span class="line"><span>   - 加 flag → 灰度 → 删 flag 的工作量,可能超过功能本身</span></span>
<span class="line"><span>   - 直接发布 + 渐进灰度即可</span></span>
<span class="line"><span>   - 例外:风险高的小功能(支付 / 鉴权)还是值得 flag</span></span>
<span class="line"><span></span></span>
<span class="line"><span>✗ 长期权限管理</span></span>
<span class="line"><span>   - &quot;Premium 用户能用 / 免费用户不能用&quot;</span></span>
<span class="line"><span>   - 短期可以 Permission Flag,但稳定后必须迁正经权限系统</span></span>
<span class="line"><span>   - 用 flag 管 1000 个客户的权限 = 维护噩梦</span></span></code></pre></div><h3 id="_9-3-一个常被混淆的决策" tabindex="-1">9.3 一个常被混淆的决策 <a class="header-anchor" href="#_9-3-一个常被混淆的决策" aria-label="Permalink to &quot;9.3 一个常被混淆的决策&quot;">​</a></h3><p>「这个新功能要不要包 flag?」</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>判断三问:</span></span>
<span class="line"><span>  1. 这个功能上线后,是否可能因为 bug 或性能问题需要紧急关?</span></span>
<span class="line"><span>     是 → flag</span></span>
<span class="line"><span>     否 → 继续问</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  2. 是否需要给&quot;特定用户群&quot;(白名单 / VIP / 内部)先用?</span></span>
<span class="line"><span>     是 → flag</span></span>
<span class="line"><span>     否 → 继续问</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  3. 是否要做 A/B 实验?</span></span>
<span class="line"><span>     是 → flag</span></span>
<span class="line"><span>     否 → 继续问</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  三问都&quot;否&quot; → 不用 flag,直接发布</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  典型例子:</span></span>
<span class="line"><span>  - &quot;改个按钮文案&quot;            → 都&quot;否&quot;,不用 flag</span></span>
<span class="line"><span>  - &quot;新支付流程&quot;              → 第一问&quot;是&quot;,必须 flag</span></span>
<span class="line"><span>  - &quot;首页 banner 个性化推荐&quot;   → 第一问&quot;是&quot;,必须 flag</span></span>
<span class="line"><span>  - &quot;重构数据库查询逻辑&quot;       → 都&quot;否&quot;(行为不变),不用 flag</span></span></code></pre></div><hr><h2 id="十、7-条踩坑" tabindex="-1">十、7 条踩坑 <a class="header-anchor" href="#十、7-条踩坑" aria-label="Permalink to &quot;十、7 条踩坑&quot;">​</a></h2><h3 id="_10-1-flag-数失控" tabindex="-1">10.1 Flag 数失控 <a class="header-anchor" href="#_10-1-flag-数失控" aria-label="Permalink to &quot;10.1 Flag 数失控&quot;">​</a></h3><p><strong>症状</strong>:1 年后代码里 200+ flag,80% 是僵尸,新人 onboard 看 if 看到崩溃。</p><p><strong>根因</strong>:没有治理纪律——加 flag 没 owner / 到期日,删 flag 没流程,新增容易删除难。</p><p><strong>避坑</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 入口管制:加 flag 必须 PR 里写 owner + 到期日 + 描述</span></span>
<span class="line"><span>2. 出口主动:每季度强制清理,把&quot;已 100% 且 &gt; 60 天&quot;全部 delete</span></span>
<span class="line"><span>3. 指标治理:Flag 总数列入团队健康度,&gt; 50 个就要警惕</span></span>
<span class="line"><span>4. 自动化扫描:写脚本扫代码里的 flag 名 + Flag Service 里的 flag,</span></span>
<span class="line"><span>              对不上号的就是僵尸</span></span></code></pre></div><h3 id="_10-2-测试环境忘开-漏测" tabindex="-1">10.2 测试环境忘开 / 漏测 <a class="header-anchor" href="#_10-2-测试环境忘开-漏测" aria-label="Permalink to &quot;10.2 测试环境忘开 / 漏测&quot;">​</a></h3><p><strong>症状</strong>:staging 跑得好好的,生产开 flag 后 5xx 飙起来。</p><p><strong>根因</strong>:<strong>dev / staging / prod 的 flag 状态不一致</strong>——staging 上 flag 已经默认 ON 跑了一周,但生产 OFF,实际测试的是&quot;flag ON 的代码路径&quot;,生产开的是&quot;刚切到 ON 的代码路径&quot;。</p><p><strong>避坑</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. dev / staging / prod 应该有一致的 default(默认 OFF)</span></span>
<span class="line"><span>2. 灰度测试在 prod 里做,staging 只做&quot;代码能跑&quot;的验证</span></span>
<span class="line"><span>3. 重要 flag 切换前,先在 staging 跑过完整切换流程</span></span>
<span class="line"><span>4. CI 里加&quot;flag 状态 diff 检查&quot;:如果 staging 和 prod 不一致,告警</span></span></code></pre></div><h3 id="_10-3-默认值错误导致全量灾难" tabindex="-1">10.3 默认值错误导致全量灾难 <a class="header-anchor" href="#_10-3-默认值错误导致全量灾难" aria-label="Permalink to &quot;10.3 默认值错误导致全量灾难&quot;">​</a></h3><p><strong>症状</strong>:Flag Service 短暂故障,SDK 返回 default,全员 5xx。</p><p><strong>根因</strong>:<strong>default 写成了 true(新功能)</strong>。SDK 拿不到 Flag Service 的真值,fallback 到 default(true),<strong>等于全员秒切到未验证的新功能</strong>。</p><p><strong>避坑</strong>:<strong>default 永远是&quot;已知安全的旧路径&quot;</strong>:</p><div class="language-python vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">python</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># ✗ 错的:default = True</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">enabled </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> client.get_boolean_value(</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;new_checkout&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">True</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, ctx)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># ✓ 对的:default = False</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">enabled </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> client.get_boolean_value(</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;new_checkout&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">False</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, ctx)</span></span></code></pre></div><p><strong>这条铁律不要破例</strong>——任何&quot;反着写&quot;的 flag 都是定时炸弹。</p><h3 id="_10-4-sdk-缓存导致灰度不生效" tabindex="-1">10.4 SDK 缓存导致灰度不生效 <a class="header-anchor" href="#_10-4-sdk-缓存导致灰度不生效" aria-label="Permalink to &quot;10.4 SDK 缓存导致灰度不生效&quot;">​</a></h3><p><strong>症状</strong>:Flag Service UI 上已经把灰度从 5% 改到 50%,但生产监控发现只有 ~5% 流量走新路径。</p><p><strong>根因</strong>:<strong>SDK 缓存了 5 分钟没刷新</strong>——大部分 SDK 是 polling 模式,默认 30 秒 - 1 分钟拉一次,但有些自建实现是&quot;启动时拉一次,之后不刷新&quot;。</p><p><strong>避坑</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 优先用支持 SSE / WebSocket 推送的 SDK(Unleash / LD 都支持)</span></span>
<span class="line"><span>2. polling 模式的 SDK,刷新间隔不要超过 1 分钟</span></span>
<span class="line"><span>3. 紧急切换的 flag(Kill Switch)→ 用支持推送的 SDK,不依赖 polling</span></span>
<span class="line"><span>4. 生产灰度后等待 5 分钟,再看监控,**不要发现&quot;没切&quot;就慌**</span></span>
<span class="line"><span>5. 监控 SDK 自身的&quot;上次刷新时间&quot;,超过 N 分钟告警</span></span></code></pre></div><h3 id="_10-5-用户-hash-不稳定-用错-key" tabindex="-1">10.5 用户 hash 不稳定 / 用错 key <a class="header-anchor" href="#_10-5-用户-hash-不稳定-用错-key" aria-label="Permalink to &quot;10.5 用户 hash 不稳定 / 用错 key&quot;">​</a></h3><p><strong>症状</strong>:同一个用户来回切换看到新旧版本,体验破碎,投诉爆炸。</p><p><strong>根因</strong>:<strong>用了不稳定的 key 做 hash</strong>——IP / cookie / session ID / 设备指纹都会变。</p><p><strong>避坑</strong>:<strong><code>targetingKey</code> 必须是稳定的业务 ID</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>✓ 正确的 key:</span></span>
<span class="line"><span>   - 已登录:user.id(数据库主键,永不变)</span></span>
<span class="line"><span>   - 未登录:device_id(SDK 生成的 UUID,本地存储,长期不变)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>✗ 错误的 key:</span></span>
<span class="line"><span>   - request.ip(用户网络环境变就变)</span></span>
<span class="line"><span>   - session_id(session 过期就变)</span></span>
<span class="line"><span>   - cookie 值(被清理就丢)</span></span>
<span class="line"><span>   - 随机数(每次请求都不一样)</span></span></code></pre></div><p><strong>对于&quot;未登录用户的灰度&quot;</strong>:<strong>客户端 SDK 必须生成长期稳定的 device_id 并写到本地存储</strong>——这是产品和工程一起的硬要求。</p><h3 id="_10-6-命名混乱" tabindex="-1">10.6 命名混乱 <a class="header-anchor" href="#_10-6-命名混乱" aria-label="Permalink to &quot;10.6 命名混乱&quot;">​</a></h3><p><strong>症状</strong>:Flag 列表里有 <code>new_feature</code> / <code>new_feature_v2</code> / <code>new_feature_final</code> / <code>new_feature_FINAL_FINAL</code>,谁也搞不清谁是活的。</p><p><strong>根因</strong>:<strong>没有命名规范</strong>。每个 Dev 起名乱来,日积月累 Flag Service 像个垃圾场。</p><p><strong>避坑</strong>:<strong>强制命名规范</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>格式:&lt;type&gt;_&lt;service&gt;_&lt;feature&gt;_&lt;version&gt;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>示例:</span></span>
<span class="line"><span>  release_order_new_checkout         (Release 类型,order 服务,新结算,无版本)</span></span>
<span class="line"><span>  experiment_search_recsys_v2        (Experiment 类型,search 服务,推荐 v2)</span></span>
<span class="line"><span>  ops_payment_kill_switch            (Ops 类型,支付服务,熔断开关)</span></span>
<span class="line"><span>  permission_user_premium_features   (Permission 类型,用户系统,Premium 功能)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>规则:</span></span>
<span class="line"><span>  - 全小写 + 下划线</span></span>
<span class="line"><span>  - 不要带日期(到期日在 metadata 里,不要塞进名字)</span></span>
<span class="line"><span>  - 不要带&quot;new&quot; / &quot;v2&quot;(每个 flag 上线都是 new,意义不大)</span></span>
<span class="line"><span>  - 名字描述&quot;做什么&quot;,不要描述&quot;什么状态&quot;</span></span></code></pre></div><h3 id="_10-7-删-flag-漏删-if-分支" tabindex="-1">10.7 删 Flag 漏删 if 分支 <a class="header-anchor" href="#_10-7-删-flag-漏删-if-分支" aria-label="Permalink to &quot;10.7 删 Flag 漏删 if 分支&quot;">​</a></h3><p><strong>症状</strong>:Flag 在 UI 里 archive 了,代码里 <code>if flag.is_enabled(...)</code> 还在,SDK 评估失败警告每秒刷屏。</p><p><strong>根因</strong>:<strong>只 archive 不 删代码</strong>(或反过来),两边没同步。</p><p><strong>避坑</strong>:<strong>&quot;删 flag&quot; 的标准操作流程</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Step 1   Flag UI 设为 100% 启用(不再是灰度规则)</span></span>
<span class="line"><span>Step 2   等 1 周,确认没人投诉</span></span>
<span class="line"><span>Step 3   提 PR:</span></span>
<span class="line"><span>          - 删 code 里的 if flag.is_enabled(name, ...)</span></span>
<span class="line"><span>          - 删 fallback / old 分支</span></span>
<span class="line"><span>          - 注释里说明这个 flag 已被永久启用,代码已合并</span></span>
<span class="line"><span>         CI 通过,review 通过,merge</span></span>
<span class="line"><span>Step 4   PR deploy 到生产</span></span>
<span class="line"><span>Step 5   Flag UI archive this flag</span></span>
<span class="line"><span>Step 6   1 个月后检查没有 SDK 还在评估这个 flag,真删除</span></span></code></pre></div><p><strong>任何&quot;少做一步&quot;的方式都会留坑</strong>——这套流程不能省。</p><hr><h2 id="十一、小结" tabindex="-1">十一、小结 <a class="header-anchor" href="#十一、小结" aria-label="Permalink to &quot;十一、小结&quot;">​</a></h2><ol><li><strong>Feature Flag 是发布与启用的解耦</strong>——代码 deploy 不等于功能 release,这件事的价值远超&quot;灰度&quot;</li><li><strong>核心价值四件</strong>:解耦发布与启用 / 精细化灰度 / 应急熔断 / A/B 实验,<strong>Kill Switch 是最被低估的</strong></li><li><strong>选型决策</strong>:中型团队首选 OpenFeature + Unleash 自托管,跨大客户 / 多 SaaS 用 LaunchDarkly,小团队几个 flag 用自建</li><li><strong>灰度维度</strong>:用户 ID hash 是基础(必须用稳定 key + per-flag salt),地域 / 设备 / 版本 / 租户是组合</li><li><strong>Flag 类型四种</strong>:Release(短期,放完就删) / Experiment(中期,实验结束就删) / Ops(长期,定期演练) / Permission(早期可以,稳定后迁权限系统)</li><li><strong>治理三件套</strong>:owner / 到期日 / 季度清理——<strong>不治理就死于僵尸</strong></li><li><strong>删 flag = 真删代码</strong>——不只是改 UI 的默认值,要真删 if 分支</li><li><strong>Flag 和金丝雀正交配合</strong>——金丝雀控实例,Flag 控启用,两件事独立节奏</li></ol><p>最后给一个硬指标:<strong>看完这一篇,你应该能在白板前讲清「Flag 的生命周期管理」</strong>——从 PR 提出加 flag → owner 填表 → 到期日 → 灰度放量 → 100% 验证 → PR 删代码 → archive flag。这一整套流程<strong>任何一环缺失,都会让团队累积技术债</strong>。<strong>Flag 不是工具,是工程纪律</strong>——上不上工具不重要,重要的是有没有这套纪律。</p><hr><p>下一篇:<strong><code>23-数据库变更与发布耦合.md</code></strong>——发布工程这一层最难、也最容易翻车的一篇。代码可以快速 rollback,<strong>数据回不去</strong>——这是与前两篇本质不同的&quot;不可逆性&quot;。讲清楚 in-place DDL 为什么是地雷、<code>pt-online-schema-change</code> / <code>gh-ost</code> 怎么避开 DDL 锁、PostgreSQL 的 <code>CREATE INDEX CONCURRENTLY</code> 怎么用、<strong>Expand-Contract 模式</strong>怎么把&quot;加字段 / 改字段 / 删字段&quot;拆成多次发布让代码 / schema / 数据三件事永远兼容——会用 <code>users.email → email + email_verified</code> 拆字段的完整 5 步序列讲透。这是 100 微服务团队 1 年内必撞的事,<strong>不讲清楚这一篇,前 22 篇白讲</strong>。</p>`,157)])])}const d=a(l,[["render",e]]);export{c as __pageData,d as default};
