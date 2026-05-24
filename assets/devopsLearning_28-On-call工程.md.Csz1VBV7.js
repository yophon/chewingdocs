import{_ as a,H as n,f as i,i as p}from"./chunks/framework.BHvCMIhP.js";const g=JSON.parse('{"title":"On-call 工程:轮值制度 / Pager / 第一响应 / 不要 hero 文化","description":"","frontmatter":{},"headers":[],"relativePath":"devopsLearning/28-On-call工程.md","filePath":"devopsLearning/28-On-call工程.md","lastUpdated":1778496697000}'),l={name:"devopsLearning/28-On-call工程.md"};function t(e,s,o,r,h,c){return n(),i("div",null,[...s[0]||(s[0]=[p(`<h1 id="on-call-工程-轮值制度-pager-第一响应-不要-hero-文化" tabindex="-1">On-call 工程:轮值制度 / Pager / 第一响应 / 不要 hero 文化 <a class="header-anchor" href="#on-call-工程-轮值制度-pager-第一响应-不要-hero-文化" aria-label="Permalink to &quot;On-call 工程:轮值制度 / Pager / 第一响应 / 不要 hero 文化&quot;">​</a></h1><p>第六层「生产实战」开篇必须先讲清楚一件事:<strong>On-call 不是&quot;加班文化&quot;的代号,也不是&quot;高级开发的福利&quot;,它是 SRE 工程的</strong>地基**——没有一支能在凌晨三点被叫起来、5 分钟内 Ack、30 分钟内进入战时状态的团队,前面 27 篇讲的 SLO、错误预算、可观测性、灰度发布,全部白搭**。前面 17 篇讲了告警怎么配,这一篇讲的是「告警响起之后,人怎么转起来」。</p><blockquote><p>一句话先记住:<strong>On-call 是把&quot;任何一个时刻团队都有一个能拍板的人&quot;做成制度,而不是赌&quot;那个老员工 24 小时都在&quot;</strong>——所有&quot;我们团队靠 XX 一个人扛&quot;的故事,翻译过来都是「这家公司离一次离职就出大事」。On-call 工程就是把这种隐性的英雄主义,<strong>拆解成轮值 + Runbook + 升级路径 + 健康度指标的工程产品</strong>,让任何一个合格工程师值班都能把事故处理到 P1 以下。<strong>Hero 不是答案,Hero 是问题</strong>。</p></blockquote><hr><h2 id="一、问题场景-没有-on-call-制度的团队长什么样" tabindex="-1">一、问题场景:没有 On-call 制度的团队长什么样 <a class="header-anchor" href="#一、问题场景-没有-on-call-制度的团队长什么样" aria-label="Permalink to &quot;一、问题场景:没有 On-call 制度的团队长什么样&quot;">​</a></h2><p>我见过太多团队是这样的:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>凌晨 2:30,Grafana 上 P99 飙到 5s,5xx 率 8%。</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  - 告警群里 200+ 条消息刷屏,@here / @all 全靠运气</span></span>
<span class="line"><span>  - 最先看到的人是值班的 SRE 老李,他点了一句&quot;我看下&quot;</span></span>
<span class="line"><span>  - 老李翻 wiki 找不到这个服务的负责人,@后端组长求救</span></span>
<span class="line"><span>  - 后端组长睡熟没醒,过了 25 分钟才回</span></span>
<span class="line"><span>  - 期间又来了俩告警,没人 Ack,新人小王看到了不敢动</span></span>
<span class="line"><span>  - 老李折腾到 3:40 大致定位:某个下游 RPC 超时</span></span>
<span class="line"><span>  - 下游团队周末没人值班,等到周一才 fix 根因</span></span>
<span class="line"><span>  - 一夜过去客户跑了一波,P0 写了一份&quot;未来要改进&quot;的复盘</span></span>
<span class="line"><span>  - 一个月后,同样的事故又发生一次,因为&quot;未来要改进&quot;还没动</span></span></code></pre></div><p><strong>这一段里你能数出多少个反模式</strong>:没有 Primary / Secondary 双值、没有 Ack 机制、没有升级超时、没有跨团队的轮值名单、没有 follow-up 跟踪、没有事故 ticket 化。<strong>每一条都不是&quot;运维不努力&quot;,是&quot;工程没做&quot;</strong>。</p><p>中型团队(10 人 / 100 微服务 / 5000 QPS)撞上 On-call 问题的临界点很明显:</p><table tabindex="0"><thead><tr><th>团队规模</th><th>On-call 表现</th></tr></thead><tbody><tr><td>&lt; 5 人</td><td>大家都在群里,谁醒了谁修,<strong>临时凑合</strong>还撑得住</td></tr><tr><td>5-15 人</td><td>必须有正式轮值,<strong>最容易出问题的阶段</strong>——制度还没建,服务已经多</td></tr><tr><td>15-50 人</td><td>必须分组轮值 + 跨组升级路径</td></tr><tr><td>&gt; 50 人</td><td>必须有专门的 IM / SRE 团队 + 7x24 调度中心</td></tr></tbody></table><p><strong>这一篇主要服务 10 人这一档</strong>——已经不能靠&quot;老张随时在线&quot;扛,但还不到搞 7x24 NOC(网络运营中心)的体量。</p><hr><h2 id="二、轮值制度-工程师视角的-上下班" tabindex="-1">二、轮值制度:工程师视角的&quot;上下班&quot; <a class="header-anchor" href="#二、轮值制度-工程师视角的-上下班" aria-label="Permalink to &quot;二、轮值制度:工程师视角的&quot;上下班&quot;&quot;">​</a></h2><h3 id="_2-1-双值-primary-secondary" tabindex="-1">2.1 双值 = Primary + Secondary <a class="header-anchor" href="#_2-1-双值-primary-secondary" aria-label="Permalink to &quot;2.1 双值 = Primary + Secondary&quot;">​</a></h3><p>单点 Primary 是脆弱的——他在地铁里、在洗澡、在开车、在跟另一个 P0 缠斗,都可能 miss 告警。<strong>必须有 Secondary</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>         ┌─────────────────────────────────┐</span></span>
<span class="line"><span>         │      告警(Alertmanager)       │</span></span>
<span class="line"><span>         └───────────────┬─────────────────┘</span></span>
<span class="line"><span>                         │ 路由</span></span>
<span class="line"><span>                ┌────────┴────────┐</span></span>
<span class="line"><span>                ▼                 ▼</span></span>
<span class="line"><span>        ┌──────────────┐   ┌──────────────┐</span></span>
<span class="line"><span>        │  Primary 值  │   │  Secondary   │</span></span>
<span class="line"><span>        │  - 接所有告警 │   │  - 只接升级  │</span></span>
<span class="line"><span>        │  - 5min Ack  │   │  - 待命备份  │</span></span>
<span class="line"><span>        └───────┬──────┘   └──────┬───────┘</span></span>
<span class="line"><span>                │ 5min 没 Ack     │</span></span>
<span class="line"><span>                └────────升级─────┘</span></span>
<span class="line"><span>                         │</span></span>
<span class="line"><span>                         ▼ 还不响应</span></span>
<span class="line"><span>                ┌──────────────────┐</span></span>
<span class="line"><span>                │   Manager / IC   │</span></span>
<span class="line"><span>                │   (15-30min)     │</span></span>
<span class="line"><span>                └──────────────────┘</span></span></code></pre></div><p><strong>两人的职责切分</strong>:</p><ul><li><strong>Primary</strong>:第一时间响应所有告警,负责 Ack / Triage / 拉群 / 跑 Runbook</li><li><strong>Secondary</strong>:Primary 失联或忙不过来时接管,<strong>不需要 24h 盯屏</strong>,只需要 5 分钟内响应升级</li></ul><p><strong>取舍</strong>:Secondary 不轮值会变成&quot;老好人轮空岗&quot;,所以<strong>Secondary 也要排班、也要付加班费/调休</strong>——和 Primary 同等待遇,只是负载轻。</p><h3 id="_2-2-轮值周期-一周一轮-不超过-12-周一年" tabindex="-1">2.2 轮值周期:一周一轮,不超过 12 周一年 <a class="header-anchor" href="#_2-2-轮值周期-一周一轮-不超过-12-周一年" aria-label="Permalink to &quot;2.2 轮值周期:一周一轮,不超过 12 周一年&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>轮值长度:</span></span>
<span class="line"><span>   ✓ 1 周 — 主流,工作日 + 周末连续值</span></span>
<span class="line"><span>   △ 1 天 — 太频繁,每天都在切交接</span></span>
<span class="line"><span>   ✗ 2 周 — 太久,人会崩溃</span></span>
<span class="line"><span></span></span>
<span class="line"><span>年度上限:</span></span>
<span class="line"><span>   ✓ 一年不超过 12 周 = 全年 1/4 的时间</span></span>
<span class="line"><span>   ✗ 一年 26 周 = 半年都在值班 → burnout 必至</span></span></code></pre></div><p><strong>为什么这两个数字</strong>:</p><ul><li><strong>1 周一轮</strong>:足够长到熟悉本周的告警模式、跟进未完成的事故;足够短到不会被打到神经衰弱</li><li><strong>一年 12 周封顶</strong>:留出 3/4 的时间给&quot;非值班的工程时间&quot;——SRE 50% 工程时间的硬约束在这里落地</li></ul><p>如果团队 5 个人轮值,每人一年 52/5 ≈ 10.4 周,刚好低于 12;如果只有 3 个人轮,每人 17 周——<strong>这是团队过小的信号,该招人或者降覆盖时间(只值工作时间)</strong>。</p><h3 id="_2-3-轮值表怎么排" tabindex="-1">2.3 轮值表怎么排 <a class="header-anchor" href="#_2-3-轮值表怎么排" aria-label="Permalink to &quot;2.3 轮值表怎么排&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>团队 5 人:A B C D E</span></span>
<span class="line"><span>轮值表(简化):</span></span>
<span class="line"><span>   Week 1:  Primary=A   Secondary=B</span></span>
<span class="line"><span>   Week 2:  Primary=B   Secondary=C</span></span>
<span class="line"><span>   Week 3:  Primary=C   Secondary=D</span></span>
<span class="line"><span>   Week 4:  Primary=D   Secondary=E</span></span>
<span class="line"><span>   Week 5:  Primary=E   Secondary=A</span></span>
<span class="line"><span>   (循环)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>要点:</span></span>
<span class="line"><span>   - Secondary 是下一周的 Primary —— 平滑过渡,信息不丢</span></span>
<span class="line"><span>   - 节假日提前一个月公布,允许换班</span></span>
<span class="line"><span>   - 病假 / 婚假 / 家庭紧急情况 必须 immediate swap,manager 兜底</span></span></code></pre></div><p><strong>Follow-the-sun(地球村轮值)</strong>:如果团队跨时区,可以亚太白天 → 欧洲白天 → 美洲白天接力,<strong>没人需要凌晨值班</strong>。但对中型团队几乎不现实——一个时区都凑不齐 5 个人,何况三个时区。<strong>不要为了 follow-the-sun 强行招远端工程师,人不够会更累</strong>。</p><h3 id="_2-4-谁该-on-call-开发还是-sre" tabindex="-1">2.4 谁该 On-call:开发还是 SRE? <a class="header-anchor" href="#_2-4-谁该-on-call-开发还是-sre" aria-label="Permalink to &quot;2.4 谁该 On-call:开发还是 SRE?&quot;">​</a></h3><p>经典争论:</p><table tabindex="0"><thead><tr><th>方案</th><th>优点</th><th>缺点</th></tr></thead><tbody><tr><td><strong>只 SRE 值班</strong></td><td>开发心理负担小,专心写代码</td><td>SRE 不懂业务,只能重启 / rollback,根因等次日找开发</td></tr><tr><td><strong>只开发值班</strong></td><td>谁写代码谁负责,根因修复快</td><td>开发不会看 Prometheus / kubectl,前 30 分钟手忙脚乱</td></tr><tr><td><strong>混合值班(推荐)</strong></td><td>SRE 接基础设施告警,开发接业务告警</td><td>路由复杂,告警分类要清晰</td></tr></tbody></table><p><strong>我的立场</strong>:<strong>开发必须 On-call,且必须 On-call 自己写的服务</strong>——这是 &quot;You build it, you run it&quot;(Amazon 名言)的硬约束。开发不 On-call 等于&quot;代码上线就完事&quot;,会写出一堆&quot;理论上能跑、出事查不清&quot;的代码。但开发不需要值&quot;基础设施告警&quot;(节点挂、网络故障),那些是 SRE/Platform 团队的范围。</p><p><strong>告警路由示例</strong>:</p><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># alertmanager.yml 片段</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">route</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  receiver</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;default&#39;</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  group_by</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;alertname&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;service&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  routes</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # 业务告警 → 该服务的开发组</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">matchers</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">team=~&quot;order|payment|user&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      receiver</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;team-{{ .Labels.team }}-oncall&#39;</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # 基础设施告警 → SRE</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">matchers</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">category=&quot;infra&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      receiver</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;sre-oncall&#39;</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # P0 全员可见</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">matchers</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">severity=&quot;critical&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      receiver</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;all-oncall&#39;</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      continue</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">true</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  # 继续往下匹配</span></span></code></pre></div><p><strong>关键</strong>:<code>continue: true</code> —— P0 告警不仅发给具体团队,还广播给所有人,<strong>让管理层看见</strong>。</p><hr><h2 id="三、pager-工具-不是-群机器人-那么简单" tabindex="-1">三、Pager 工具:不是&quot;群机器人&quot;那么简单 <a class="header-anchor" href="#三、pager-工具-不是-群机器人-那么简单" aria-label="Permalink to &quot;三、Pager 工具:不是&quot;群机器人&quot;那么简单&quot;">​</a></h2><p>中型团队最常见的偷懒做法是「告警群 + @机器人」。<strong>这条路在 50 人以下勉强能走,过了 50 人或者过了 5000 QPS,必崩</strong>。</p><h3 id="_3-1-群机器人为什么不够" tabindex="-1">3.1 群机器人为什么不够 <a class="header-anchor" href="#_3-1-群机器人为什么不够" aria-label="Permalink to &quot;3.1 群机器人为什么不够&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>群机器人(钉钉 / 飞书 / 企微):</span></span>
<span class="line"><span>   ✗ 没有 Ack 机制(谁看了不知道)</span></span>
<span class="line"><span>   ✗ 没有升级超时(5min 没人理 → 沉底)</span></span>
<span class="line"><span>   ✗ 没有静音 / on-call 状态切换</span></span>
<span class="line"><span>   ✗ 多人值班路由难</span></span>
<span class="line"><span>   ✗ 历史归档 / 告警风暴聚合 几乎没有</span></span>
<span class="line"><span>   ✗ 凌晨手机静音 = 你听不见</span></span></code></pre></div><p><strong>最致命的是最后一条</strong>:手机微信群推送默认在勿扰模式下静音,<strong>凌晨告警 = 你睡过去 = MTTR 无限大</strong>。Pager 工具的最核心价值是<strong>单独绕过勿扰模式</strong>——iOS 的 &quot;Critical Alert&quot; / Android 的&quot;重要联系人&quot;,必须能响醒人。</p><h3 id="_3-2-主流-pager-工具对比" tabindex="-1">3.2 主流 Pager 工具对比 <a class="header-anchor" href="#_3-2-主流-pager-工具对比" aria-label="Permalink to &quot;3.2 主流 Pager 工具对比&quot;">​</a></h3><table tabindex="0"><thead><tr><th>工具</th><th>国家</th><th>优势</th><th>劣势</th><th>价格(2026)</th></tr></thead><tbody><tr><td><strong>PagerDuty</strong></td><td>美</td><td>行业标杆,生态最全,API 成熟</td><td>价格贵,中文支持一般</td><td>~$25/人/月起</td></tr><tr><td><strong>Opsgenie</strong>(Atlassian)</td><td>美</td><td>和 Jira / Statuspage 联动好</td><td>被 Atlassian 收购后产品力下降</td><td>~$15/人/月</td></tr><tr><td><strong>Splunk On-Call</strong>(原 VictorOps)</td><td>美</td><td>和 Splunk SIEM 深度集成</td><td>中型团队过重</td><td>~$30/人/月</td></tr><tr><td><strong>Squadcast / Better Stack</strong></td><td>国际</td><td>新派,价格友好</td><td>生态不如 PD</td><td>$10-15/人/月</td></tr><tr><td><strong>告警酱 / FlashDuty</strong></td><td>国</td><td>中文产品,微信/钉钉/飞书原生</td><td>国际化弱</td><td>约 ¥30/人/月</td></tr><tr><td><strong>自研 + 飞书/钉钉机器人</strong></td><td>DIY</td><td>0 成本,完全可控</td><td>自己得维护轮值 / 升级 / Ack</td><td>工程时间成本</td></tr></tbody></table><p><strong>我的建议</strong>:</p><ul><li><strong>国际化业务 / 美区客户</strong>:PagerDuty,事实标准,集成生态最全</li><li><strong>国内业务 / 团队 &lt; 30 人</strong>:FlashDuty / 告警酱,中文体验好,价格友好</li><li><strong>超大公司 / 重监管</strong>:自研,但要做好&quot;这是一个常态产品,不是 hackathon 项目&quot;的预期</li><li><strong>绝对不要</strong>:只靠飞书/钉钉群,过了 5 人团队必崩</li></ul><h3 id="_3-3-pager-工具的核心-5-个能力" tabindex="-1">3.3 Pager 工具的核心 5 个能力 <a class="header-anchor" href="#_3-3-pager-工具的核心-5-个能力" aria-label="Permalink to &quot;3.3 Pager 工具的核心 5 个能力&quot;">​</a></h3><p>无论选哪个,<strong>这 5 个能力缺一不可</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌─────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  Pager 工具的最小能力集                              │</span></span>
<span class="line"><span>├─────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>│  1. Schedule       — 轮值表,自动算出&quot;现在谁值班&quot;   │</span></span>
<span class="line"><span>│  2. Routing        — 告警 → 当前值班人,不要群发    │</span></span>
<span class="line"><span>│  3. Notification   — 多通道(电话/短信/App/邮件)   │</span></span>
<span class="line"><span>│                      自动绕过勿扰                    │</span></span>
<span class="line"><span>│  4. Acknowledge    — 一键 Ack,系统知道&quot;已有人接&quot;   │</span></span>
<span class="line"><span>│  5. Escalation     — N 分钟没 Ack → 升级到下一级    │</span></span>
<span class="line"><span>└─────────────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>Escalation Policy 配置示例</strong>(PagerDuty 风格):</p><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># escalation_policy.yaml</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">order-service-oncall</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">description</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">订单服务 7x24 升级策略</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">levels</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">level</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">1</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    targets</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">schedule</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">order-primary-schedule</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    timeout_minutes</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">5</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # Primary 5min 没 Ack 升级</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">level</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">2</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    targets</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">schedule</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">order-secondary-schedule</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    timeout_minutes</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">10</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">   # Secondary 再 10min 没 Ack 升级</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">level</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">3</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    targets</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">user</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">order-team-manager</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">user</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">sre-lead</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    timeout_minutes</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">15</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">   # 经理 + SRE 主管同时叫</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">level</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">4</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    targets</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">user</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">cto</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    repeat</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">true</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">         # 还没人响应就一直叫 CTO</span></span></code></pre></div><p><strong>关键取舍</strong>:</p><ul><li><strong>5 / 10 / 15 这三个数字怎么定</strong>:5 分钟是&quot;睡梦中也得醒&quot;的极限,10 分钟够 Secondary 拿手机,15 分钟够经理接管。<strong>比这个长 = 客户已经在骂街了;比这个短 = Primary 上厕所都触发误升级</strong></li><li><strong>Level 4 设 CTO 还是不设</strong>:看公司文化。<strong>好的文化是&quot;P0 必须惊动 CTO&quot;,出过事让 CTO 心疼一次,资源就能批下来</strong>;坏的文化是&quot;CTO 永远不知道 P0&quot;,资源永远批不到</li></ul><h3 id="_3-4-多通道-电话是最后的命门" tabindex="-1">3.4 多通道:电话是最后的命门 <a class="header-anchor" href="#_3-4-多通道-电话是最后的命门" aria-label="Permalink to &quot;3.4 多通道:电话是最后的命门&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>通道优先级(从轻到重):</span></span>
<span class="line"><span>  飞书/钉钉 App 通知   → 白天告警,工作时段</span></span>
<span class="line"><span>  企业 IM @your_name   → 多人协作</span></span>
<span class="line"><span>  邮件                 → 低优,归档用</span></span>
<span class="line"><span>  短信                 → 中优,App 关了能收</span></span>
<span class="line"><span>  电话                 → 高优,凌晨叫醒</span></span>
<span class="line"><span>  连环电话             → P0,直到接听</span></span></code></pre></div><p><strong>配置策略</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>P2 / P3:  仅 IM 推送</span></span>
<span class="line"><span>P1:       IM + 短信</span></span>
<span class="line"><span>P0:       IM + 短信 + 电话(若 5min 未 Ack 升级)</span></span></code></pre></div><p><strong>踩过的坑</strong>:</p><ol><li><strong>iOS 勿扰模式</strong>——必须把 Pager App 加进&quot;允许的 App&quot;,或者用 &quot;Critical Alert&quot; 权限(PD / Opsgenie 都支持)</li><li><strong>运营商短信延迟</strong>——节假日短信网关常崩,<strong>短信不能是唯一通道</strong></li><li><strong>VoIP 电话</strong>——Pager 用 VoIP 打过来,如果手机没装 App / App 后台被杀,电话也接不到。必须配合 PSTN 兜底</li><li><strong>飞书企业号免打扰</strong>——飞书的&quot;勿扰模式&quot;会把 Bot 消息屏蔽,<strong>必须把告警机器人单独设白名单</strong></li></ol><hr><h2 id="四、第一响应-ack-triage-communicate-三步" tabindex="-1">四、第一响应:Ack / Triage / Communicate 三步 <a class="header-anchor" href="#四、第一响应-ack-triage-communicate-三步" aria-label="Permalink to &quot;四、第一响应:Ack / Triage / Communicate 三步&quot;">​</a></h2><p>凌晨 2:30 告警响起,你睡眼惺忪点开手机,<strong>前 5 分钟最关键的不是&quot;修&quot;,是&quot;接管&quot;</strong>。</p><h3 id="_4-1-三个动作-顺序不能乱" tabindex="-1">4.1 三个动作,顺序不能乱 <a class="header-anchor" href="#_4-1-三个动作-顺序不能乱" aria-label="Permalink to &quot;4.1 三个动作,顺序不能乱&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌──────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  第一响应 3 步法                                  │</span></span>
<span class="line"><span>├──────────────────────────────────────────────────┤</span></span>
<span class="line"><span>│  1. Ack          — 在 Pager 系统点确认           │</span></span>
<span class="line"><span>│                    (停止升级,告诉团队&quot;我在&quot;)    │</span></span>
<span class="line"><span>│  2. Triage       — 评估严重程度,分类 P0/P1/P2    │</span></span>
<span class="line"><span>│                    (决定要不要拉人、要不要开 War │</span></span>
<span class="line"><span>│                     Room、要不要 rollback)        │</span></span>
<span class="line"><span>│  3. Communicate  — 拉群通报、写战时频道开场       │</span></span>
<span class="line"><span>│                    (告诉团队 / 上游 / 客户)      │</span></span>
<span class="line"><span>└──────────────────────────────────────────────────┘</span></span>
<span class="line"><span>                  ↓</span></span>
<span class="line"><span>            然后才开始&quot;修&quot;</span></span></code></pre></div><p><strong>为什么这个顺序</strong>:</p><ul><li><strong>不 Ack 直接修</strong> → 系统继续升级,半夜把 CTO 和 Secondary 一起叫醒,<strong>资源浪费 + 信任损耗</strong></li><li><strong>不 Triage 就拉群</strong> → 拉了一堆人结果是个 P2,<strong>狼来了第 N 次,下次就没人接了</strong></li><li><strong>不 Communicate 就闷头修</strong> → 客服 / 产品 / CTO 不知道发生了什么,<strong>他们已经被客户骂了</strong>,你这边修完才报告</li></ul><h3 id="_4-2-triage-严重程度的三级判定" tabindex="-1">4.2 Triage:严重程度的三级判定 <a class="header-anchor" href="#_4-2-triage-严重程度的三级判定" aria-label="Permalink to &quot;4.2 Triage:严重程度的三级判定&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>P0(SEV-1):核心功能不可用 / 数据损坏 / 资金风险</span></span>
<span class="line"><span>            → 5min 内拉群,30min 内 IC 接管</span></span>
<span class="line"><span>            → 必须实时通报 CTO + 产品 + 客服</span></span>
<span class="line"><span>            → 一切其他工作让路</span></span>
<span class="line"><span></span></span>
<span class="line"><span>P1(SEV-2):部分功能降级 / SLO 持续燃烧 / 单可用区故障</span></span>
<span class="line"><span>            → 30min 内拉群,工作时间内修复</span></span>
<span class="line"><span>            → 告知本团队 + 上下游</span></span>
<span class="line"><span></span></span>
<span class="line"><span>P2(SEV-3):告警但用户无感 / 已自愈但需查根因</span></span>
<span class="line"><span>            → 工作时间处理</span></span>
<span class="line"><span>            → 写 ticket,本周内 follow up</span></span></code></pre></div><p><strong>判定的 3 个维度</strong>:</p><table tabindex="0"><thead><tr><th>维度</th><th>问 自 己</th></tr></thead><tbody><tr><td><strong>用户影响</strong></td><td>多少用户被影响?核心功能还是边缘?能不能 fallback?</td></tr><tr><td><strong>业务影响</strong></td><td>是否涉及收入 / 资金 / 合规 / SLA 违约?</td></tr><tr><td><strong>可恢复性</strong></td><td>自愈中还是恶化中?重启能修还是要 rollback?</td></tr></tbody></table><p><strong>踩过的坑</strong>:Triage 经常被新人低估——「告警是 P0 但用户没感觉,我标 P2 吧」。<strong>永远不要根据&quot;我直觉觉得不严重&quot;降级</strong>——告警级别是工程师<strong>和告警系统一起</strong>决定的,降级是 IC 的权力,不是值班人的。<strong>宁可虚惊一场,不要漏报一次</strong>。</p><h3 id="_4-3-communicate-war-room-怎么开" tabindex="-1">4.3 Communicate:War Room 怎么开 <a class="header-anchor" href="#_4-3-communicate-war-room-怎么开" aria-label="Permalink to &quot;4.3 Communicate:War Room 怎么开&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>P0 触发后 5 分钟内,值班人必须做这件事:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>┌─────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  飞书/钉钉新建群:#incident-20260511-orders-5xx     │</span></span>
<span class="line"><span>│                                                     │</span></span>
<span class="line"><span>│  开场模板:                                          │</span></span>
<span class="line"><span>│  ──────────────────────────────────────             │</span></span>
<span class="line"><span>│  【P0 事故】订单服务 5xx 异常                       │</span></span>
<span class="line"><span>│  时间:2026-05-11 02:30 (CST)                       │</span></span>
<span class="line"><span>│  影响:订单创建 API 5xx 率 8%(SLO 阈值 0.1%)       │</span></span>
<span class="line"><span>│  现状:正在排查                                      │</span></span>
<span class="line"><span>│  IC:@张三(值班)                                  │</span></span>
<span class="line"><span>│  待加入:@后端组长 @SRE @PM @客服主管               │</span></span>
<span class="line"><span>│  实时看板:https://grafana.../d/orders              │</span></span>
<span class="line"><span>│  ──────────────────────────────────────             │</span></span>
<span class="line"><span>└─────────────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>这个开场必须包含 5 件事</strong>:</p><ol><li><strong>是什么</strong>(一句话事故描述)</li><li><strong>影响什么</strong>(具体指标 + SLO 对比)</li><li><strong>谁在管</strong>(IC 是谁)</li><li><strong>谁该来</strong>(@ 谁)</li><li><strong>去哪看</strong>(Grafana / Kibana / 战时频道)</li></ol><p><strong>取舍</strong>:</p><ul><li><strong>War Room 频道 vs 现有团队群</strong>:必须<strong>单独建群</strong>——现有群有日常聊天,事故消息会被淹;单独群事后归档/复盘也方便</li><li><strong>拉多少人</strong>:<strong>只拉决策者 + 实际 fixer</strong>——不要把整个公司都拉进来&quot;围观&quot;,War Room 30 人会变成噪声场</li></ul><h3 id="_4-4-5-分钟规则" tabindex="-1">4.4 5 分钟规则 <a class="header-anchor" href="#_4-4-5-分钟规则" aria-label="Permalink to &quot;4.4 5 分钟规则&quot;">​</a></h3><p><strong>铁律</strong>:<strong>5 分钟内没 Ack,就该升级</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>告警发出 ──┬── 0-5 min ── Primary 应该 Ack</span></span>
<span class="line"><span>           │</span></span>
<span class="line"><span>           ├── 5+ min   ── 系统自动升级 Secondary</span></span>
<span class="line"><span>           │</span></span>
<span class="line"><span>           └── 15+ min  ── 升级到 Manager / IC</span></span>
<span class="line"><span></span></span>
<span class="line"><span>为什么是 5 分钟,不是 1 分钟也不是 15 分钟:</span></span>
<span class="line"><span>  - 1 分钟:Primary 上厕所就触发误升级,值班体验极差</span></span>
<span class="line"><span>  - 5 分钟:够 Primary 从睡梦中拿手机、点 Ack,但不会让事故失控</span></span>
<span class="line"><span>  - 15 分钟:用户已经在客服群里骂街了</span></span></code></pre></div><p><strong>为什么不能让 Primary &quot;迟到一会&quot;</strong>:</p><ul><li>Pager 系统的 Ack 不仅是&quot;我看到了&quot;,还是<strong>事故时间线上的官方时间点</strong>——延迟 Ack = MTTR 数据失真 = 复盘不准</li><li>5 分钟规则<strong>强制 Primary 不能拖延</strong>——拖了系统自动找 Secondary,不会出现&quot;Primary 装睡假装没看到&quot;</li></ul><hr><h2 id="五、hero-文化-这一篇最反对的东西" tabindex="-1">五、Hero 文化:这一篇最反对的东西 <a class="header-anchor" href="#五、hero-文化-这一篇最反对的东西" aria-label="Permalink to &quot;五、Hero 文化:这一篇最反对的东西&quot;">​</a></h2><h3 id="_5-1-hero-文化长什么样" tabindex="-1">5.1 Hero 文化长什么样 <a class="header-anchor" href="#_5-1-hero-文化长什么样" aria-label="Permalink to &quot;5.1 Hero 文化长什么样&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>&quot;老张什么都会修,问他就行&quot;</span></span>
<span class="line"><span>&quot;这块只有李四清楚,他在就稳&quot;</span></span>
<span class="line"><span>&quot;小王是上次那个事故的救火队长,P0 必须他在&quot;</span></span></code></pre></div><p>听起来是夸,<strong>实际是制度失败的诊断书</strong>:</p><ul><li>知识没沉淀(全在某个人脑子里)</li><li>文档没写(写了也没人维护)</li><li>训练没做(新人没机会练手)</li><li>工具没建(还在靠&quot;老张的私人脚本&quot;)</li></ul><p><strong>Hero 走了 = 公司断手</strong>:老张一休假就出大事,小王离职就崩盘——<strong>这是工程治理的严重缺陷,不是赞美</strong>。</p><h3 id="_5-2-怎么消解-hero-文化" tabindex="-1">5.2 怎么消解 Hero 文化 <a class="header-anchor" href="#_5-2-怎么消解-hero-文化" aria-label="Permalink to &quot;5.2 怎么消解 Hero 文化&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>反 Hero 的工程动作:</span></span>
<span class="line"><span>  ✓ 每个事故强制写 Postmortem,知识公开化</span></span>
<span class="line"><span>  ✓ Runbook 必须是&quot;任何值班工程师都能跑&quot;</span></span>
<span class="line"><span>  ✓ Shadow 制度:新人值班前先跟 2 周</span></span>
<span class="line"><span>  ✓ 故意让&quot;Hero&quot;不值班,让别人去顶</span></span>
<span class="line"><span>  ✓ GameDay 演练,把&quot;只有 X 会修&quot;的事故场景拿出来练</span></span>
<span class="line"><span>  ✓ 平时强制 owner 轮换,避免单一所有制</span></span></code></pre></div><p><strong>最关键的一条</strong>:<strong>Hero 自己也要支持去 Hero 化</strong>——很多 Hero 享受被需要的感觉,潜意识里抗拒沉淀。<strong>Manager 的工作是把 Hero 的工作&quot;产品化&quot;,而不是表扬他</strong>。</p><h3 id="_5-3-hero-的反义词不是-平庸-是-系统" tabindex="-1">5.3 Hero 的反义词不是&quot;平庸&quot;,是&quot;系统&quot; <a class="header-anchor" href="#_5-3-hero-的反义词不是-平庸-是-系统" aria-label="Permalink to &quot;5.3 Hero 的反义词不是&quot;平庸&quot;,是&quot;系统&quot;&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Hero 团队:</span></span>
<span class="line"><span>   告警 ──→ 老张(70% 命中)──→ 修好(MTTR 30min)</span></span>
<span class="line"><span>              └─ 老张不在 ──→ 崩盘(MTTR 5h)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>系统化团队:</span></span>
<span class="line"><span>   告警 ──→ Runbook 70% 自动 ──→ 修好(MTTR 15min)</span></span>
<span class="line"><span>            └─ 自动失败 ──→ 任何值班人 ──→ 修好(MTTR 45min)</span></span>
<span class="line"><span>            └─ 还失败 ──→ 升级 IC ──→ 修好(MTTR 90min)</span></span></code></pre></div><p><strong>两条曲线的差别</strong>:Hero 团队的&quot;最好情况&quot;比系统化团队还快,<strong>但最差情况比系统化团队差 5-10 倍</strong>——而事故偏偏总在最差情况下发生。</p><hr><h2 id="六、on-call-健康度-把-看不见的累-做成指标" tabindex="-1">六、On-call 健康度:把&quot;看不见的累&quot;做成指标 <a class="header-anchor" href="#六、on-call-健康度-把-看不见的累-做成指标" aria-label="Permalink to &quot;六、On-call 健康度:把&quot;看不见的累&quot;做成指标&quot;">​</a></h2><p>值班的累是隐性的——加班看得见,<strong>凌晨被叫醒一次的疲劳值=白天加班 2 小时</strong>——但很少人量化。<strong>必须做成指标,而且必须给 PM / 经理看</strong>。</p><h3 id="_6-1-4-个核心指标" tabindex="-1">6.1 4 个核心指标 <a class="header-anchor" href="#_6-1-4-个核心指标" aria-label="Permalink to &quot;6.1 4 个核心指标&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌─────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  On-call 健康度仪表盘(每周 / 每月)                 │</span></span>
<span class="line"><span>├─────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>│  1. 每周告警总数(分 P0/P1/P2)                      │</span></span>
<span class="line"><span>│       目标:每人每周 &lt; 10 个                         │</span></span>
<span class="line"><span>│       超过 = 告警太吵或服务太烂                       │</span></span>
<span class="line"><span>│                                                     │</span></span>
<span class="line"><span>│  2. 每周被打断睡眠次数(凌晨 0-6 点告警)             │</span></span>
<span class="line"><span>│       目标:&lt; 2 次/周                                │</span></span>
<span class="line"><span>│       超过 = burnout 红线,要么静音要么换班         │</span></span>
<span class="line"><span>│                                                     │</span></span>
<span class="line"><span>│  3. 每月误报率                                       │</span></span>
<span class="line"><span>│       目标:&lt; 10%                                    │</span></span>
<span class="line"><span>│       超过 = 告警工程有问题(看 15 篇)              │</span></span>
<span class="line"><span>│                                                     │</span></span>
<span class="line"><span>│  4. Runbook 覆盖率                                   │</span></span>
<span class="line"><span>│       目标:&gt; 90% 告警有可用 Runbook                 │</span></span>
<span class="line"><span>│       不达标 = 下一篇 29 要解决的                    │</span></span>
<span class="line"><span>└─────────────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>为什么必须给 PM / 经理看</strong>:</p><ul><li>PM 总想加功能 / 加复杂度,<strong>On-call 健康度告诉他&quot;加这个会让团队半夜被叫醒多 3 次&quot;</strong>——他才会权衡</li><li>经理总想优化 headcount,<strong>On-call 健康度告诉他&quot;现在 3 个人轮值已经每年 17 周了&quot;</strong>——他才会招人</li><li>老板总想吹&quot;99.99% 可用&quot;,<strong>On-call 健康度告诉他&quot;过去一个月 Primary 被吵醒 8 次&quot;</strong>——他才知道代价</li></ul><h3 id="_6-2-真实的健康度阈值" tabindex="-1">6.2 真实的健康度阈值 <a class="header-anchor" href="#_6-2-真实的健康度阈值" aria-label="Permalink to &quot;6.2 真实的健康度阈值&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌──────────────────┬─────────┬──────────┬──────────┐</span></span>
<span class="line"><span>│  指标            │ 健康     │ 警告      │ 危险     │</span></span>
<span class="line"><span>├──────────────────┼─────────┼──────────┼──────────┤</span></span>
<span class="line"><span>│ 每周告警数/人    │  &lt; 10   │ 10-25    │  &gt; 25    │</span></span>
<span class="line"><span>│ 凌晨告警/周/人   │  &lt; 2    │ 2-5      │  &gt; 5     │</span></span>
<span class="line"><span>│ 误报率           │  &lt; 10%  │ 10-30%   │  &gt; 30%   │</span></span>
<span class="line"><span>│ Runbook 覆盖率   │  &gt; 90%  │ 60-90%   │  &lt; 60%   │</span></span>
<span class="line"><span>│ MTTR(P0)        │  &lt; 30m  │ 30-90m   │  &gt; 90m   │</span></span>
<span class="line"><span>│ 年度值班周/人    │  &lt; 12   │ 12-20    │  &gt; 20    │</span></span>
<span class="line"><span>└──────────────────┴─────────┴──────────┴──────────┘</span></span></code></pre></div><p><strong>任何一项进&quot;危险&quot;区,SRE 经理必须在下次双周会拿出动作</strong>——否则团队会用脚投票(辞职)。</p><h3 id="_6-3-补偿-钱不是全部-但不能没有" tabindex="-1">6.3 补偿:钱不是全部,但不能没有 <a class="header-anchor" href="#_6-3-补偿-钱不是全部-但不能没有" aria-label="Permalink to &quot;6.3 补偿:钱不是全部,但不能没有&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>On-call 补偿三件套:</span></span>
<span class="line"><span>  1. 加班费 / 调休       —— 法律 + 心理双重必要</span></span>
<span class="line"><span>  2. 凌晨告警 next-day off —— 被吵醒后一天可调休</span></span>
<span class="line"><span>  3. 季度 / 年度激励      —— 把 On-call 算进绩效,不是&quot;额外义务&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>国内常见模式:</span></span>
<span class="line"><span>  ✓ 工作日值班 ¥50-100/天,周末 ¥200-300/天</span></span>
<span class="line"><span>  ✓ 凌晨告警 ¥100/次(无论是不是误报)</span></span>
<span class="line"><span>  ✓ 调休 1:1.5(凌晨被叫一次 → 第二天下午 + 半天调休)</span></span></code></pre></div><p><strong>反模式</strong>:</p><ul><li>&quot;On-call 是工程师本来就该做的,不发钱&quot; → <strong>没几个月人就跑光</strong></li><li>&quot;出事再发,平时不发&quot; → <strong>激励错位,鼓励&quot;出事&quot;而不是&quot;防出事&quot;</strong></li><li>&quot;钱多但没调休&quot; → <strong>没人能从生理疲劳里恢复,burnout 必至</strong></li></ul><hr><h2 id="七、on-call-follow-up-每个事故必须有尾巴" tabindex="-1">七、On-call follow-up:每个事故必须有尾巴 <a class="header-anchor" href="#七、on-call-follow-up-每个事故必须有尾巴" aria-label="Permalink to &quot;七、On-call follow-up:每个事故必须有尾巴&quot;">​</a></h2><p>事故处理完不是结束,<strong>是下一次事故的起点</strong>。最大的反模式是「P0 修完,大家松一口气,然后忘了根因」——三个月后同样手法再被打一次。</p><h3 id="_7-1-事故的-三个-ticket" tabindex="-1">7.1 事故的&quot;三个 ticket&quot; <a class="header-anchor" href="#_7-1-事故的-三个-ticket" aria-label="Permalink to &quot;7.1 事故的&quot;三个 ticket&quot;&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>事故发生</span></span>
<span class="line"><span>   ↓</span></span>
<span class="line"><span>   ├── Ticket 1:事故记录(必须)</span></span>
<span class="line"><span>   │     - 时间线、影响范围、根因</span></span>
<span class="line"><span>   │     - Postmortem 链接(33 篇详述)</span></span>
<span class="line"><span>   │     - 必须在 1 周内完成</span></span>
<span class="line"><span>   │</span></span>
<span class="line"><span>   ├── Ticket 2:根因修复(必须有 owner + deadline)</span></span>
<span class="line"><span>   │     - 代码 fix / 配置改 / 容量调</span></span>
<span class="line"><span>   │     - 必须在下一次该人轮值前完成</span></span>
<span class="line"><span>   │     - 否则升级到 Manager</span></span>
<span class="line"><span>   │</span></span>
<span class="line"><span>   └── Ticket 3:防御措施(强烈建议)</span></span>
<span class="line"><span>         - 加告警 / 加 Runbook / 加压测场景</span></span>
<span class="line"><span>         - 让&quot;下次同样的事不会再发生&quot;</span></span></code></pre></div><p><strong>没有 Ticket 2 的事故等于没修过</strong>。</p><h3 id="_7-2-follow-up-review-每周必开" tabindex="-1">7.2 Follow-up Review:每周必开 <a class="header-anchor" href="#_7-2-follow-up-review-每周必开" aria-label="Permalink to &quot;7.2 Follow-up Review:每周必开&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>On-call Handoff 会议(每周一,30 分钟):</span></span>
<span class="line"><span>  上周值班人 → 本周值班人</span></span>
<span class="line"><span></span></span>
<span class="line"><span>议程:</span></span>
<span class="line"><span>  1. 上周告警总数 / P0/P1 个数</span></span>
<span class="line"><span>  2. 每个 P0 / P1 的 Ticket 状态</span></span>
<span class="line"><span>     - Ticket 1(Postmortem)写了没?</span></span>
<span class="line"><span>     - Ticket 2(根因 fix)做了没?多少天了?</span></span>
<span class="line"><span>     - Ticket 3(防御)排期了没?</span></span>
<span class="line"><span>  3. 待跟进:有没有&quot;本周需要本周值班人接手&quot;的事</span></span>
<span class="line"><span>  4. 健康度回顾:上周指标在哪个区</span></span></code></pre></div><p><strong>这个会的最高价值是&quot;反对老化的事故&quot;</strong>——一个 P0 ticket 拖了 3 周没动,下次同样的事故来了,<strong>你没有任何借口</strong>。</p><h3 id="_7-3-一个真实的反面案例" tabindex="-1">7.3 一个真实的反面案例 <a class="header-anchor" href="#_7-3-一个真实的反面案例" aria-label="Permalink to &quot;7.3 一个真实的反面案例&quot;">​</a></h3><p>某团队 2024 年发生:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>事件 A:某下游服务超时,主服务 5xx 飙到 5%,半夜 P0</span></span>
<span class="line"><span>        Primary 重启了下游 → 自愈,30min 修完</span></span>
<span class="line"><span>        Postmortem:写了,根因是&quot;下游没设超时&quot;</span></span>
<span class="line"><span>        Ticket 2:开了,assignee 是下游的小李</span></span>
<span class="line"><span>                  小李那周很忙没改</span></span>
<span class="line"><span>                  下下周小李去出差了</span></span>
<span class="line"><span>                  Ticket 拖到 5 周后还没动</span></span>
<span class="line"><span></span></span>
<span class="line"><span>事件 B(6 周后):同样的下游再超时,这次叠加了一次发布</span></span>
<span class="line"><span>                  主服务 5xx 飙到 25%,持续 2 小时</span></span>
<span class="line"><span>                  这次升级到 P0 + 老板会议</span></span>
<span class="line"><span>                  根因还是&quot;下游没设超时&quot;</span></span>
<span class="line"><span>                  Ticket 2 现在变成 P0 fix,强制 2 天内完成</span></span></code></pre></div><p><strong>这场事故的真正原因不是技术,是治理</strong>——Ticket 2 没人盯,没人追,过期就过期。<strong>Follow-up Review 就是治这个的</strong>。</p><hr><h2 id="八、on-call-准入清单-谁能值班" tabindex="-1">八、On-call 准入清单:谁能值班 <a class="header-anchor" href="#八、on-call-准入清单-谁能值班" aria-label="Permalink to &quot;八、On-call 准入清单:谁能值班&quot;">​</a></h2><p>不是新人入职第一天就能上岗。<strong>值班是有门槛的工程能力</strong>,不是体力劳动。</p><h3 id="_8-1-准入要求" tabindex="-1">8.1 准入要求 <a class="header-anchor" href="#_8-1-准入要求" aria-label="Permalink to &quot;8.1 准入要求&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>新人 On-call 准入清单:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>[ ] 1. 必读文档</span></span>
<span class="line"><span>       - 服务的 SLO 文档</span></span>
<span class="line"><span>       - 告警分级与升级路径</span></span>
<span class="line"><span>       - Runbook 列表</span></span>
<span class="line"><span>       - Postmortem 库(看过最近 3 个 P0)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>[ ] 2. 工具熟练度</span></span>
<span class="line"><span>       - 能在 Grafana 上找到 5 个核心 dashboard</span></span>
<span class="line"><span>       - 能 kubectl exec / logs / describe</span></span>
<span class="line"><span>       - 能在告警系统点 Ack / Snooze / Resolve</span></span>
<span class="line"><span>       - 能用 PromQL 写出 RED 指标查询</span></span>
<span class="line"><span></span></span>
<span class="line"><span>[ ] 3. 实战训练</span></span>
<span class="line"><span>       - 跑过至少 3 份 Runbook(在 staging 上)</span></span>
<span class="line"><span>       - 主持过至少 1 次 GameDay(31 篇)</span></span>
<span class="line"><span>       - 参加过至少 2 次真实事故的复盘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>[ ] 4. Shadow 期</span></span>
<span class="line"><span>       - Shadow 一次完整 On-call 轮值(1 周)</span></span>
<span class="line"><span>       - 跟着上一周值班人交接</span></span>
<span class="line"><span>       - Manager / Tech Lead 签字确认</span></span></code></pre></div><p><strong>绕过这个清单 = 给团队埋雷</strong>。我见过新人值第一周就遇到 P0 的——他不知道 Runbook 在哪,不知道 PD 怎么 Ack,不知道战时频道怎么开,半夜手忙脚乱地把生产搞得更糟。<strong>这不是新人的错,是没让他过准入的人的错</strong>。</p><h3 id="_8-2-shadow-最被低估的训练" tabindex="-1">8.2 Shadow:最被低估的训练 <a class="header-anchor" href="#_8-2-shadow-最被低估的训练" aria-label="Permalink to &quot;8.2 Shadow:最被低估的训练&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Shadow 期(2 周):</span></span>
<span class="line"><span>   Week 1: 跟着 Primary,看他怎么处理每个告警</span></span>
<span class="line"><span>            - Ack 之前他先看了什么 dashboard?</span></span>
<span class="line"><span>            - 他为什么选了这条 Runbook 而不是另一条?</span></span>
<span class="line"><span>            - 他什么时候决定升级,什么时候决定 rollback?</span></span>
<span class="line"><span>   Week 2: Reverse-shadow,Primary 在旁边看,新人主导</span></span>
<span class="line"><span>            - 新人先 Ack,出错 Primary 兜底</span></span>
<span class="line"><span>            - 复盘每个判断点</span></span></code></pre></div><p><strong>Shadow 的最大价值不是教操作,是教判断</strong>——告警响起的那一刻,经验丰富的工程师会下意识地排除一些可能性、优先看某些 panel,<strong>这种&quot;决策路径&quot;只能跟人学,文档教不了</strong>。</p><hr><h2 id="九、何时不该有-7x24-on-call" tabindex="-1">九、何时不该有 7x24 On-call <a class="header-anchor" href="#九、何时不该有-7x24-on-call" aria-label="Permalink to &quot;九、何时不该有 7x24 On-call&quot;">​</a></h2><p>不是所有服务都需要凌晨值班。<strong>滥用 7x24 = 把团队当成廉价劳动力</strong>。</p><h3 id="_9-1-决策矩阵" tabindex="-1">9.1 决策矩阵 <a class="header-anchor" href="#_9-1-决策矩阵" aria-label="Permalink to &quot;9.1 决策矩阵&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  是否需要 7x24 On-call:                                 │</span></span>
<span class="line"><span>├────────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>│  ✓ 必须 7x24:                                          │</span></span>
<span class="line"><span>│      - 付费用户(尤其企业 SLA 客户)                    │</span></span>
<span class="line"><span>│      - 凌晨也有真实业务(支付、游戏、海外)              │</span></span>
<span class="line"><span>│      - P0 影响营收 / 合规 / 用户安全                     │</span></span>
<span class="line"><span>│                                                        │</span></span>
<span class="line"><span>│  △ 可选 7x24(看 SLA):                                 │</span></span>
<span class="line"><span>│      - 国内 to-C 业务夜间低峰                           │</span></span>
<span class="line"><span>│      - 内部工具 / 后台系统                              │</span></span>
<span class="line"><span>│                                                        │</span></span>
<span class="line"><span>│  ✗ 不需要 7x24:                                        │</span></span>
<span class="line"><span>│      - 实验项目 / 尚未付费的产品                        │</span></span>
<span class="line"><span>│      - 内部研发工具(CI / 测试环境)                     │</span></span>
<span class="line"><span>│      - 没有 SLA 承诺的边缘服务                          │</span></span>
<span class="line"><span>└────────────────────────────────────────────────────────┘</span></span></code></pre></div><h3 id="_9-2-替代方案" tabindex="-1">9.2 替代方案 <a class="header-anchor" href="#_9-2-替代方案" aria-label="Permalink to &quot;9.2 替代方案&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>不到 7x24 的几个梯度:</span></span>
<span class="line"><span>  1. 工作时间响应(9:00 - 22:00)</span></span>
<span class="line"><span>     - 适合 to-B / 内部工具 / 国内白天业务</span></span>
<span class="line"><span>     - 夜间告警:静音 + 早上看,不叫人</span></span>
<span class="line"><span>  2. 5x12 + 周末轮值</span></span>
<span class="line"><span>     - 工作日严格响应,周末有 best-effort</span></span>
<span class="line"><span>  3. 5x8 + 节假日预案</span></span>
<span class="line"><span>     - 仅工作日值,大促 / 节假日提前部署预案</span></span>
<span class="line"><span>  4. Best Effort(谁醒了谁修)</span></span>
<span class="line"><span>     - 适合 &lt; 5 人小团队 + 内部产品</span></span>
<span class="line"><span>     - 告警 IM 群推送,不强制响应时间</span></span></code></pre></div><p><strong>一句话</strong>:<strong>SLA 严格度决定 On-call 覆盖度,反过来不成立</strong>——不要先决定&quot;我们要 7x24&quot;,再倒推 SLA。先和产品 / 客户谈清楚 SLA,<strong>再用 SLA 反推 On-call 工作量</strong>。</p><h3 id="_9-3-一个常见误区" tabindex="-1">9.3 一个常见误区 <a class="header-anchor" href="#_9-3-一个常见误区" aria-label="Permalink to &quot;9.3 一个常见误区&quot;">​</a></h3><p>「我们是创业公司,所有人都得 24x7 待命」——<strong>这是创业公司常见的自我感动</strong>。事实是:</p><ul><li>创业公司用户少,夜间出事影响范围小</li><li>创业公司没钱招 SRE,凌晨告警没人能修</li><li>创业公司开发白天还要写代码,夜间被吵 = 第二天产能为 0</li><li><strong>创业公司最该做的不是 7x24,是&quot;白天值班 + 夜间静音 + 早上恢复&quot;</strong></li></ul><p><strong>只有当产品已经成熟、用户已经付费、SLA 已经写进合同了,才有必要扛 7x24</strong>。在那之前,扛 7x24 是浪费。</p><hr><h2 id="十、一份最小可用的-on-call-制度模板" tabindex="-1">十、一份最小可用的 On-call 制度模板 <a class="header-anchor" href="#十、一份最小可用的-on-call-制度模板" aria-label="Permalink to &quot;十、一份最小可用的 On-call 制度模板&quot;">​</a></h2><p>把这个贴到你们团队的 Notion / Confluence,改改就能用。</p><div class="language-markdown vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">markdown</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">## 团队 On-call 制度 v1.0</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">### 1. 覆盖时间</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">工作日 9:00 - 24:00,周末 10:00 - 22:00</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">夜间(0:00 - 9:00):告警自动静音,只在 P0 触发电话</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">### 2. 角色</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> Primary:5min 内 Ack,负责第一响应</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> Secondary:Primary 失联或忙不过来时接管</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> IC:P0 事故的总指挥(参考 32 篇)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">### 3. 轮值</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 周期:1 周一轮,周一上午交接</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 团队:A B C D E 五人轮(Primary)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">       下一周 Primary = 本周 Secondary</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 年度上限:每人 12 周/年</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">### 4. 升级</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">P0 告警(5xx&gt;1% / 核心功能不可用):</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  5min  → Primary</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  +10min → Secondary</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  +15min → Manager + SRE Lead</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  +20min → CTO</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">### 5. 第一响应</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">1.</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> Ack(在 PagerDuty 点确认)</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">2.</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> Triage(判 P0/P1/P2)</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">3.</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> Communicate(P0 拉群,模板见 Runbook)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">### 6. 补偿</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 工作日值班:¥80/天</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 周末/节假日值班:¥250/天</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 凌晨告警(0-6 点):¥100/次 + 次日上午调休</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">### 7. 健康度</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">每月 Review:每人告警数 / 凌晨告警次数 / MTTR / 误报率</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">任何指标进&quot;危险&quot;区,1 周内有响应动作</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">### 8. 准入</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">新人值班前必须:</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">  -</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 读完 Runbook 列表</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">  -</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> Shadow 一周</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">  -</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> Tech Lead 签字</span></span></code></pre></div><hr><h2 id="十一、踩坑提醒" tabindex="-1">十一、踩坑提醒 <a class="header-anchor" href="#十一、踩坑提醒" aria-label="Permalink to &quot;十一、踩坑提醒&quot;">​</a></h2><ol><li><strong>把 On-call 当奖励</strong> —— &quot;你表现好,给你值班机会&quot;。<strong>On-call 不是福利,是责任,该轮就轮</strong></li><li><strong>新人独自值班</strong> —— 没经验的人独自值 P0,<strong>等于赌博</strong>。必须 Shadow + 老人兜底</li><li><strong>只发钱不调休</strong> —— 凌晨被叫醒一次 = 第二天产能减半,<strong>生理疲劳钱补不了</strong></li><li><strong>告警群代替 Pager</strong> —— 群消息会被勿扰静音,<strong>凌晨 = 等于没告警</strong></li><li><strong>没 Secondary</strong> —— Primary 失联系统不知道,<strong>升级直接断链</strong></li><li><strong>5 分钟规则被破坏</strong> —— &quot;再等等 Primary 应该会看到的&quot;,<strong>等等就升级 = 信任崩盘</strong></li><li><strong>Hero 文化默许</strong> —— &quot;老张总能修&quot;,<strong>老张离职日就是公司断手日</strong></li><li><strong>事故修完不写 Postmortem</strong> —— 同样的坑 6 周后再踩</li><li><strong>Ticket 2 没人盯</strong> —— &quot;改进措施&quot;挂着不做,下次同样事故来更狠</li><li><strong>拿钱不做事</strong> —— 排班里有人但实际不响应,<strong>这种轮值毒性比没有还大</strong>,必须用健康度指标暴露</li><li><strong>7x24 滥用</strong> —— 实验项目也搞 7x24,<strong>烧光团队</strong></li><li><strong>轮值周期太长</strong> —— 2 周轮一次,<strong>人会精神崩溃</strong></li></ol><hr><h2 id="十二、本篇的硬指标" tabindex="-1">十二、本篇的硬指标 <a class="header-anchor" href="#十二、本篇的硬指标" aria-label="Permalink to &quot;十二、本篇的硬指标&quot;">​</a></h2><p>看完这一篇,你应该能在白板前画清楚:</p><ul><li><strong>Primary / Secondary 双值的升级链路</strong>(每一级的超时阈值和触发条件)</li><li><strong>告警从产生到 Ack 的全路径</strong>(Alertmanager → Pager → 通道 → 手机 → Ack 回写)</li><li><strong>第一响应 3 步法</strong>(Ack / Triage / Communicate)的具体动作</li><li><strong>On-call 健康度的 4 个指标</strong>和它们的阈值</li><li><strong>何时不该上 7x24</strong>——决策矩阵的三档</li></ul><p>并且能给自己团队<strong>写出一份 1 页纸的 On-call 制度</strong>——上面 §10 的模板就是底稿。</p><hr><p>下一篇:<code>29-Runbook与告警自愈.md</code>,这一篇讲完&quot;人怎么响应&quot;,下一篇接着讲&quot;响应里跑什么&quot;——Runbook 是 On-call 的肌肉,没有 Runbook 的 On-call 就是把人当 Google 用。<strong>29 篇是这一层最实用的一篇</strong>,讲清楚 Runbook 不是 wiki 是脚本、自愈的边界在哪、为什么 Confluence 里的 Runbook 是&quot;出事时打不开的死文档&quot;,以及一个真实的反面教材:<strong>某团队 Runbook 写&quot;重启服务&quot;,但服务自动重启已默认开,人为重启反而 reset 了关键状态</strong>——这种坑只有写过、用过、用错过的人才知道。</p>`,155)])])}const k=a(l,[["render",t]]);export{g as __pageData,k as default};
