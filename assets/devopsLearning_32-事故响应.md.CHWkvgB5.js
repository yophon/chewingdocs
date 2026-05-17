import{_ as n,H as a,f as p,i as t}from"./chunks/framework.BHvCMIhP.js";const g=JSON.parse('{"title":"事故响应:IC / Comms / Ops 角色 / 战时频道 / 时间线记录","description":"","frontmatter":{},"headers":[],"relativePath":"../devopsLearning/32-事故响应.md","filePath":"../devopsLearning/32-事故响应.md","lastUpdated":1778496697000}'),e={name:"../devopsLearning/32-事故响应.md"};function l(o,s,i,r,c,d){return a(),p("div",null,[...s[0]||(s[0]=[t(`<h1 id="事故响应-ic-comms-ops-角色-战时频道-时间线记录" tabindex="-1">事故响应:IC / Comms / Ops 角色 / 战时频道 / 时间线记录 <a class="header-anchor" href="#事故响应-ic-comms-ops-角色-战时频道-时间线记录" aria-label="Permalink to &quot;事故响应:IC / Comms / Ops 角色 / 战时频道 / 时间线记录&quot;">​</a></h1><p>凌晨三点,Pager 把你从床上震醒——P0 告警,核心交易接口错误率从 0.1% 飙到 38%,SLO 错误预算半小时烧光。你迷迷糊糊摸到电脑,点开 Grafana 一看,五条曲线一起红。<strong>这一刻你做的第一件事是什么</strong>?</p><p>如果你的回答是&quot;先去看日志找原因&quot;——这一篇就是写给你的。<strong>在中型团队里,事故的处置质量从来不是被技术决定的,是被组织决定的</strong>。出事时谁拍板回滚、谁通知客服、谁记时间线、谁拦着不让 CTO 自己下场敲键盘——<strong>这五个角色没分清楚,30 分钟能修好的事故能拖成 3 小时,3 小时的事故能拖成上头条</strong>。</p><p>事故响应是 SRE 工作的&quot;高光时刻&quot;,<strong>也是最容易暴露团队短板的时刻</strong>。28-31 篇讲了 On-call / Runbook / 容量 / 混沌——那些都是&quot;事前准备&quot;;这一篇讲事故发生那一刻的组织协同。<strong>前 31 篇是&quot;让事故少发生&quot;,这一篇是&quot;让事故发生时损失最小&quot;</strong>。</p><blockquote><p>一句话先记住:<strong>事故响应不是技术活,是组织活——你能不能扛 P0,90% 决定于&quot;出事时有没有一个不动手的人在指挥&quot;</strong>,只有 10% 是&quot;动手的人技术多硬&quot;。后者你早晚招到,前者要靠制度长出来。Google SRE Book 里那句被反复引用的&quot;Incident Commander not touching keyboard&quot;——<strong>不是文化口号,是工程结论</strong>。</p></blockquote><hr><h2 id="一、问题场景-没有响应制度的团队是怎么塌的" tabindex="-1">一、问题场景:没有响应制度的团队是怎么塌的 <a class="header-anchor" href="#一、问题场景-没有响应制度的团队是怎么塌的" aria-label="Permalink to &quot;一、问题场景:没有响应制度的团队是怎么塌的&quot;">​</a></h2><h3 id="_1-1-一个真实场景的两种版本" tabindex="-1">1.1 一个真实场景的两种版本 <a class="header-anchor" href="#_1-1-一个真实场景的两种版本" aria-label="Permalink to &quot;1.1 一个真实场景的两种版本&quot;">​</a></h3><p><strong>版本 A——没有制度</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>03:01  P0 告警,小王第一个被叫醒</span></span>
<span class="line"><span>03:03  小王登服务器看日志,猜是数据库</span></span>
<span class="line"><span>03:08  小李也被叫醒,登另一台机器看慢查询</span></span>
<span class="line"><span>03:12  组长来了,直接 ssh 到 master,kill 几个长事务</span></span>
<span class="line"><span>03:14  客服群开始炸:&quot;用户大量反馈下单失败&quot;</span></span>
<span class="line"><span>03:17  小王在 #core 群发&quot;我在排查&quot;——客服没看到</span></span>
<span class="line"><span>03:25  CTO 进群:&quot;什么情况?&quot;,所有人开始重新解释</span></span>
<span class="line"><span>03:30  CTO 自己 SSH 上线 dump 表结构,小李拦不住</span></span>
<span class="line"><span>03:42  小王偷偷做了个临时索引,没记下来</span></span>
<span class="line"><span>03:55  小李重启了一个不相关的服务&quot;试试&quot;</span></span>
<span class="line"><span>04:30  系统勉强恢复,没人知道是哪一步起的作用</span></span>
<span class="line"><span>04:45  CEO 发微信:&quot;刚客户打电话,怎么回事?&quot;</span></span>
<span class="line"><span>       没人能给出&quot;准确的影响时段 / 用户数 / 已修复状态&quot;</span></span>
<span class="line"><span>次日   复盘开成扯皮大会,**谁都说不清那 90 分钟到底发生了什么**</span></span></code></pre></div><p><strong>版本 B——有 IC 制度</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>03:01  P0 告警,小王第一个收到</span></span>
<span class="line"><span>03:02  小王看了一眼,声明&quot;我是 IC&quot;,拉战时频道</span></span>
<span class="line"><span>03:05  小李 + 组长加入,IC 分工:小李 Ops 查 DB,组长 Ops 看 RPC</span></span>
<span class="line"><span>03:06  小王指定客服值班同学进群当 Comms,5 分钟内发第一条公告</span></span>
<span class="line"><span>03:08  Scribe 角色由小王兼,开始记时间线</span></span>
<span class="line"><span>03:15  Ops 报告:慢查询定位到 order 表某索引缺失</span></span>
<span class="line"><span>03:18  IC 决策:回滚发布(今晚发了一个 SQL)</span></span>
<span class="line"><span>03:20  Ops 执行回滚,IC 同步给 Comms,5 分钟一次状态更新</span></span>
<span class="line"><span>03:28  错误率回归正常,Ops 保留现场不动,等观察 10 分钟</span></span>
<span class="line"><span>03:40  IC 宣布&quot;已恢复 / 监控中&quot;,Comms 发关闭公告</span></span>
<span class="line"><span>       次日 14:00 复盘,时间线、影响、根因、Action 全在文档里</span></span></code></pre></div><p>两个版本的差别<strong>不是&quot;小王技术好不好&quot;</strong>,是<strong>组织有没有把&quot;指挥 / 动手 / 沟通 / 记录&quot;这四件事分到四个人头上</strong>。版本 A 的团队不是没技术能力,是<strong>所有人都在动手,所以没人在思考</strong>。</p><h3 id="_1-2-黄金-30-分钟-为什么前半小时这么关键" tabindex="-1">1.2 黄金 30 分钟:为什么前半小时这么关键 <a class="header-anchor" href="#_1-2-黄金-30-分钟-为什么前半小时这么关键" aria-label="Permalink to &quot;1.2 黄金 30 分钟:为什么前半小时这么关键&quot;">​</a></h3><p>工业界一条经验:<strong>事故的影响面在前 30 分钟内基本定型</strong>——超过这个窗口,要么你已经收住,要么影响开始指数级扩散(用户告知朋友 / 媒体盯上 / 客户违约 / 客服爆炸)。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>事故影响面随时间膨胀(典型曲线):</span></span>
<span class="line"><span></span></span>
<span class="line"><span>影响面 ▲</span></span>
<span class="line"><span>       │                                  ╱ 客户违约 / 媒体</span></span>
<span class="line"><span>       │                            ╱</span></span>
<span class="line"><span>       │                       ╱ 用户告知朋友 / 投诉爆发</span></span>
<span class="line"><span>       │                  ╱</span></span>
<span class="line"><span>       │             ╱ 客服开始接到电话</span></span>
<span class="line"><span>       │        ╱</span></span>
<span class="line"><span>       │   ╱  内部告警</span></span>
<span class="line"><span>       └─────────────────────────────────────────▶</span></span>
<span class="line"><span>       0   5   10   15   20   25   30   45   60+  分钟</span></span>
<span class="line"><span>       │           │                  │</span></span>
<span class="line"><span>       发现        决策窗口            影响外溢</span></span>
<span class="line"><span>       │←─── 黄金 30 分钟 ───→│←── 公关期 ──→</span></span></code></pre></div><p><strong>前 30 分钟你做对一件事,后 3 小时省 100 件事</strong>:有没有人在指挥(IC)、有没有同步给客服(Comms)、有没有在记录(Scribe)、有没有人专心动手(Ops)。<strong>没有这四件事,30 分钟里能犯 5 个并行错误</strong>——一个人改配置另一个人滚回去,谁也不知道现在到底是什么状态。</p><hr><h2 id="二、四个角色-四个独立的人-四件不一样的事" tabindex="-1">二、四个角色:四个独立的人,四件不一样的事 <a class="header-anchor" href="#二、四个角色-四个独立的人-四件不一样的事" aria-label="Permalink to &quot;二、四个角色:四个独立的人,四件不一样的事&quot;">​</a></h2><p>事故响应的核心模型来自 FEMA(美国联邦应急管理署)的 Incident Command System(ICS)——<strong>消防员用了 50 年的事故指挥框架</strong>,Google SRE 把它搬进了软件行业。</p><h3 id="_2-1-角色一览" tabindex="-1">2.1 角色一览 <a class="header-anchor" href="#_2-1-角色一览" aria-label="Permalink to &quot;2.1 角色一览&quot;">​</a></h3><table tabindex="0"><thead><tr><th>角色</th><th>中文</th><th>干什么</th><th>不干什么</th></tr></thead><tbody><tr><td><strong>IC</strong>(Incident Commander)</td><td>指挥官</td><td>决策 / 分工 / 升级 / 宣布开始 &amp; 结束</td><td><strong>不动手</strong> / 不调试 / 不写代码</td></tr><tr><td><strong>Ops</strong>(Operations)</td><td>处置</td><td>改配置 / 改代码 / 回滚 / 验证修复</td><td>不对外沟通 / 不决策影响面</td></tr><tr><td><strong>Comms</strong>(Communications)</td><td>沟通</td><td>内部状态更新 / 客服话术 / 客户通知 / PR</td><td>不动手 / 不进技术战时频道争论</td></tr><tr><td><strong>Scribe</strong></td><td>记录</td><td>时间线 / 决策依据 / 操作记录</td><td>不评论 / 不下场</td></tr></tbody></table><p><strong>这张表的精髓在右列——&quot;不干什么&quot;比&quot;干什么&quot;重要</strong>。每个角色的边界都是用&quot;绝不越界做的事&quot;定义的。</p><h3 id="_2-2-角色协作图" tabindex="-1">2.2 角色协作图 <a class="header-anchor" href="#_2-2-角色协作图" aria-label="Permalink to &quot;2.2 角色协作图&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                       ┌──────────────────┐</span></span>
<span class="line"><span>                       │      IC          │</span></span>
<span class="line"><span>                       │ (Incident        │</span></span>
<span class="line"><span>                       │  Commander)      │</span></span>
<span class="line"><span>                       │                  │</span></span>
<span class="line"><span>                       │ - 决策回滚 / 升级 │</span></span>
<span class="line"><span>                       │ - 拍板分工        │</span></span>
<span class="line"><span>                       │ - 宣布开始/结束   │</span></span>
<span class="line"><span>                       │ - 不动手 ★★★      │</span></span>
<span class="line"><span>                       └──┬───────┬───────┘</span></span>
<span class="line"><span>                          │       │</span></span>
<span class="line"><span>              指令        │       │   状态更新</span></span>
<span class="line"><span>              分工        │       │   决策依据</span></span>
<span class="line"><span>                          ▼       ▼</span></span>
<span class="line"><span>                   ┌──────────────────────┐</span></span>
<span class="line"><span>                   │                      │</span></span>
<span class="line"><span>        ┌──────────▼────────┐  ┌──────────▼────────┐</span></span>
<span class="line"><span>        │      Ops          │  │     Comms         │</span></span>
<span class="line"><span>        │                   │  │                   │</span></span>
<span class="line"><span>        │ - 看监控           │  │ - 客服话术更新     │</span></span>
<span class="line"><span>        │ - 改配置 / 回滚    │  │ - 站点 Status Page│</span></span>
<span class="line"><span>        │ - 验证修复         │  │ - 内部同步         │</span></span>
<span class="line"><span>        │ - 不发公告 ★       │  │ - 大客户单独通知   │</span></span>
<span class="line"><span>        │                   │  │ - 不动技术 ★       │</span></span>
<span class="line"><span>        └──────────┬────────┘  └──────────┬────────┘</span></span>
<span class="line"><span>                   │                      │</span></span>
<span class="line"><span>                   └──────────┬───────────┘</span></span>
<span class="line"><span>                              │</span></span>
<span class="line"><span>                              ▼</span></span>
<span class="line"><span>                   ┌─────────────────────┐</span></span>
<span class="line"><span>                   │      Scribe         │</span></span>
<span class="line"><span>                   │                     │</span></span>
<span class="line"><span>                   │ - 时间线(只记事实) │</span></span>
<span class="line"><span>                   │ - 决策记录           │</span></span>
<span class="line"><span>                   │ - 影响范围数字       │</span></span>
<span class="line"><span>                   │ - 不评价 / 不推测 ★  │</span></span>
<span class="line"><span>                   └─────────────────────┘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>                     ↑</span></span>
<span class="line"><span>              升级 / 跨部门</span></span>
<span class="line"><span>                     ↑</span></span>
<span class="line"><span>        ┌──────────────────────────┐</span></span>
<span class="line"><span>        │ 升级目标(IC 决定何时拉) │</span></span>
<span class="line"><span>        │                          │</span></span>
<span class="line"><span>        │  技术失控 → CTO          │</span></span>
<span class="line"><span>        │  影响用户 → CEO / 法务   │</span></span>
<span class="line"><span>        │  合约风险 → 商务 / 客户成功 │</span></span>
<span class="line"><span>        │  数据安全 → 安全 / 合规  │</span></span>
<span class="line"><span>        └──────────────────────────┘</span></span></code></pre></div><h3 id="_2-3-为什么-ic-不能动手——这条最反直觉" tabindex="-1">2.3 为什么 IC 不能动手——这条最反直觉 <a class="header-anchor" href="#_2-3-为什么-ic-不能动手——这条最反直觉" aria-label="Permalink to &quot;2.3 为什么 IC 不能动手——这条最反直觉&quot;">​</a></h3><p>新手 IC 最常犯的错:<strong>自己技术好,直接下场敲键盘</strong>。后果几乎可以预测:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>没动手前的 IC          动手后的 IC</span></span>
<span class="line"><span>   ─────────             ─────────</span></span>
<span class="line"><span>看全局                  看自己屏幕</span></span>
<span class="line"><span>听所有人汇报            一个人解决问题</span></span>
<span class="line"><span>能决策&quot;是否回滚&quot;        陷入&quot;我快修好了&quot;的幻觉</span></span>
<span class="line"><span>能拉升级                忘了通知客服</span></span>
<span class="line"><span>能管时间                ssh 进 prod 一去不回</span></span>
<span class="line"><span>能记 5 个并行线索       脑里只剩当前线索</span></span></code></pre></div><p><strong>动手的人没法宏观决策</strong>——这是认知科学的硬限制,不是&quot;自律&quot;能克服的。一旦 IC 自己开终端跑命令,他的视野塌缩到光标那 80 个字符,<strong>剩下的事故现场对他不存在</strong>。</p><p><strong>这条规则的最强反例</strong>:你的团队只有 3 个人,IC 兼 Ops。<strong>那也得分阶段</strong>——指挥的时候就指挥,动手的时候就动手,<strong>切换前必须明确口播&quot;我现在去执行 X,5 分钟内 Y 接管指挥&quot;</strong>。最忌讳&quot;边指挥边动手&quot;——两件事一起干,两件事都做不好。</p><h3 id="_2-4-comms-为什么是独立角色" tabindex="-1">2.4 Comms 为什么是独立角色 <a class="header-anchor" href="#_2-4-comms-为什么是独立角色" aria-label="Permalink to &quot;2.4 Comms 为什么是独立角色&quot;">​</a></h3><p>新手最常忽略 Comms——&quot;出事了大家都在修,公告等修完再发&quot;。<strong>错</strong>。事故的&quot;对外感知&quot;和&quot;内部处置&quot;是两条独立时间线:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>内部:   告警 ── 排查 ── 决策 ── 回滚 ── 验证 ── 恢复</span></span>
<span class="line"><span>对外:   ╳     ╳     ╳    ╳    ╳    ╳     ← 没有 Comms 的时间线</span></span>
<span class="line"><span>对外:   通知  状态  状态  状态  状态  关闭   ← 有 Comms 的时间线</span></span>
<span class="line"><span>        ↑     ↑     ↑     ↑     ↑     ↑</span></span>
<span class="line"><span>        5min  10min 15min 20min 25min 30min</span></span></code></pre></div><p><strong>没有 Comms,用户先于你知道你出事了——这是最致命的时序</strong>。客服群、社交媒体、Status Page 上一片空白,用户开始猜测、抱怨、发朋友圈;<strong>等你 30 分钟修完出来发公告,信任已经塌掉</strong>。</p><h3 id="_2-5-scribe-为什么必须有专人记录" tabindex="-1">2.5 Scribe:为什么必须有专人记录 <a class="header-anchor" href="#_2-5-scribe-为什么必须有专人记录" aria-label="Permalink to &quot;2.5 Scribe:为什么必须有专人记录&quot;">​</a></h3><p>事故现场最稀缺的不是技术,是<strong>注意力</strong>。所有人都在处理&quot;现在&quot;,<strong>没人记得&quot;15 分钟前发生了什么&quot;</strong>。</p><p>Scribe 的工作不是写日记,是<strong>实时维护事故时间线</strong>,要求:</p><ul><li>用 UTC 时间戳(避免跨时区争议)</li><li>只记<strong>事实</strong>(observation),不记推测(speculation)</li><li>记<strong>决策</strong>(谁决定的什么)</li><li>记<strong>操作</strong>(谁执行了什么命令 / 改了什么配置)</li><li>记<strong>影响</strong>(数字:错误率、影响用户数、降级范围)</li></ul><p><strong>Scribe 和 IC 可以同一人兼</strong>(小团队的常态),<strong>但绝不能 Scribe 和 Ops 同一人</strong>——动手的人没空记录。</p><hr><h2 id="三、战时频道-war-room-怎么开、谁能进" tabindex="-1">三、战时频道(War Room):怎么开、谁能进 <a class="header-anchor" href="#三、战时频道-war-room-怎么开、谁能进" aria-label="Permalink to &quot;三、战时频道(War Room):怎么开、谁能进&quot;">​</a></h2><h3 id="_3-1-一定要-voice-不要-email" tabindex="-1">3.1 一定要 voice,不要 email <a class="header-anchor" href="#_3-1-一定要-voice-不要-email" aria-label="Permalink to &quot;3.1 一定要 voice,不要 email&quot;">​</a></h3><p><strong>事故频道有三档</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 文字频道(Slack / 飞书 / 钉钉):事故 channel,记录所有 ack / 决策</span></span>
<span class="line"><span>2. 语音频道(Zoom / Teams / 飞书会议): 实时讨论</span></span>
<span class="line"><span>3. 邮件 / 工单:严禁用作处置工具,只用作&quot;事后归档&quot;</span></span></code></pre></div><p><strong>文字是慢的</strong>——别人在打字的时候你看不到他在打字,等你看到时已经过了 30 秒。<strong>语音是快的</strong>——三个人同时说话也能听清楚谁在喊&quot;停&quot;,决策可以毫秒级达成。</p><p>但语音是<strong>不可回放的</strong>(就算录了也没人翻),所以文字频道必须同步开着,<strong>关键决策在语音里达成,但要复述到文字里</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>[03:18] @IC 决策:回滚发布 v2.4.7 → v2.4.6</span></span>
<span class="line"><span>[03:18] @Ops 确认:开始执行 argocd rollback</span></span>
<span class="line"><span>[03:21] @Ops 完成:已回滚,等待 10 分钟观察</span></span></code></pre></div><h3 id="_3-2-临时频道-用完即弃" tabindex="-1">3.2 临时频道:用完即弃 <a class="header-anchor" href="#_3-2-临时频道-用完即弃" aria-label="Permalink to &quot;3.2 临时频道:用完即弃&quot;">​</a></h3><p><strong>正确做法</strong>:每次 P0 / P1 临时拉一个 channel,命名规范:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>#incident-2026-05-11-trade-error-spike</span></span>
<span class="line"><span>   ─┬─       ─┬──────  ──┬─────────────</span></span>
<span class="line"><span>    │         │           └─ 简短描述(便于事后搜索)</span></span>
<span class="line"><span>    │         └─ 日期(便于归档)</span></span>
<span class="line"><span>    └─ 固定前缀</span></span></code></pre></div><p>事故结束后这个频道<strong>归档</strong>(不删),作为事后复盘的原始证据。</p><p><strong>反例</strong>:在常驻的 <code>#core-engineering</code> 群里处理事故——里面一堆无关人士、一堆历史消息、关键信息会被刷掉。</p><h3 id="_3-3-谁能进-谁必须出" tabindex="-1">3.3 谁能进 / 谁必须出 <a class="header-anchor" href="#_3-3-谁能进-谁必须出" aria-label="Permalink to &quot;3.3 谁能进 / 谁必须出&quot;">​</a></h3><p><strong>进</strong>:IC、Ops、Comms、Scribe、相关服务 owner、值班 SRE。</p><p><strong>不能进</strong>(或必须 IC 同意才能进):</p><ul><li>路过想看热闹的同事——&quot;我能加一下吗,想学学&quot;——拒绝</li><li>高管(&quot;CTO 想看看进展&quot;)——拒绝直接进战时频道,<strong>让 Comms 单独同步</strong></li><li>不相关的产品经理(&quot;用户在催了&quot;)——只能找 Comms</li></ul><blockquote><p><strong>战时频道刷屏是事故响应最常见的失败模式</strong>——一群好心人涌进来问&quot;现在怎么样了 / 我能帮什么忙 / 是不是 XX 服务的问题&quot;——<strong>每一条问题都把 Ops 的注意力拽走 5 秒钟</strong>,十个人问就是 50 秒。50 秒在 P0 现场是一个回滚命令的时间。</p></blockquote><h3 id="_3-4-大公司-vs-中型团队的取舍" tabindex="-1">3.4 大公司 vs 中型团队的取舍 <a class="header-anchor" href="#_3-4-大公司-vs-中型团队的取舍" aria-label="Permalink to &quot;3.4 大公司 vs 中型团队的取舍&quot;">​</a></h3><table tabindex="0"><thead><tr><th>维度</th><th>大公司(SRE 团队 ≥ 30 人)</th><th>中型团队(SRE 0-5 人)</th></tr></thead><tbody><tr><td>战时频道</td><td>永久频道 / 按服务分</td><td>临时 channel,事后归档</td></tr><tr><td>语音</td><td>24h on-call 桥,一键加入</td><td>按需开 Zoom</td></tr><tr><td>角色</td><td>4 个角色 4 个人</td><td>1 人兼 2 角(IC + Scribe / Comms + 客服)</td></tr><tr><td>Status Page</td><td>公开站点 + 内部页面</td><td>一个飞书文档当 status</td></tr><tr><td>工具</td><td>PagerDuty + Statuspage.io + Opsgenie</td><td>飞书机器人 + 一个共享文档</td></tr></tbody></table><p><strong>中型团队最容易犯的错</strong>:学大公司搭一套大而全的事故响应平台,<strong>没人有空填</strong>。<strong>先用文档 + 群跑通流程</strong>,等流程跑顺了再上工具,<strong>反过来一定砸</strong>。</p><hr><h2 id="四、时间线-timeline-事实和推测的分界" tabindex="-1">四、时间线(Timeline):事实和推测的分界 <a class="header-anchor" href="#四、时间线-timeline-事实和推测的分界" aria-label="Permalink to &quot;四、时间线(Timeline):事实和推测的分界&quot;">​</a></h2><h3 id="_4-1-6-类记录" tabindex="-1">4.1 6 类记录 <a class="header-anchor" href="#_4-1-6-类记录" aria-label="Permalink to &quot;4.1 6 类记录&quot;">​</a></h3><p>时间线记录分 6 类,<strong>每一类的写法都不一样</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>[03:02] 发现:订单接口错误率从 0.1% 升到 38% (Datadog 告警 ord-err-rate)</span></span>
<span class="line"><span>        ↑ 谁触发的、什么数字、从哪个监控来 —— 一个事实</span></span>
<span class="line"><span></span></span>
<span class="line"><span>[03:05] 决策:小王声明 IC,小李 / 组长 Ops,客服-A Comms</span></span>
<span class="line"><span>        ↑ 谁决定了什么 —— 一个决策</span></span>
<span class="line"><span></span></span>
<span class="line"><span>[03:08] 操作:Ops-小李 执行 kubectl rollout history deployment/order-api</span></span>
<span class="line"><span>        ↑ 谁、做了什么、命令是什么 —— 一个操作</span></span>
<span class="line"><span></span></span>
<span class="line"><span>[03:10] 影响:支付成功率从 99.7% 降到 61%,过去 8 分钟约 12,400 笔订单失败</span></span>
<span class="line"><span>        ↑ 量化的影响 —— 一个数字</span></span>
<span class="line"><span></span></span>
<span class="line"><span>[03:13] 沟通:Comms 在 Status Page 发布第一条公告 &quot;我们正在调查支付服务异常&quot;</span></span>
<span class="line"><span>        ↑ 对外说了什么 —— 一个公告</span></span>
<span class="line"><span></span></span>
<span class="line"><span>[03:30] 恢复:错误率回归 0.15%,确认核心链路已恢复</span></span>
<span class="line"><span>        ↑ 什么时候开始恢复 —— 一个状态变更</span></span></code></pre></div><p>每一行都有明确的&quot;主语 + 动作 + 客观可验证内容&quot;。<strong>没有形容词、没有猜测、没有情绪</strong>。</p><h3 id="_4-2-fact-vs-speculation-这条铁律" tabindex="-1">4.2 Fact vs Speculation:这条铁律 <a class="header-anchor" href="#_4-2-fact-vs-speculation-这条铁律" aria-label="Permalink to &quot;4.2 Fact vs Speculation:这条铁律&quot;">​</a></h3><p>时间线<strong>只记事实,推测和臆测全部放到复盘</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错的:</span></span>
<span class="line"><span>[03:15] 可能是上周发的索引变更引起的?</span></span>
<span class="line"><span>[03:18] 听说是 DBA 改了什么配置</span></span>
<span class="line"><span>[03:22] 不知道为什么,反正回滚后好了</span></span>
<span class="line"><span></span></span>
<span class="line"><span>对的:</span></span>
<span class="line"><span>[03:15] Ops-小李 报告:慢查询日志显示 order.status_idx 索引缺失</span></span>
<span class="line"><span>[03:18] Ops-组长 报告:对比 git,发现 v2.4.7 的 migration 删除了 idx_status_created</span></span>
<span class="line"><span>[03:22] IC 决策:回滚到 v2.4.6 (恢复索引),观察</span></span></code></pre></div><p><strong>为什么这条这么重要</strong>:复盘时所有人对时间线的依赖度,远远超过你的想象。<strong>人的记忆是会自动重写的</strong>——一周后所有人都会&quot;记得&quot;自己当时怎么判断,<strong>但记忆里 70% 是事后合理化</strong>。时间线里如果掺了推测,复盘会变成&quot;我当时就猜到了&quot;的扯皮大会;<strong>只记事实,推测在复盘里专门一节回顾</strong>,才能真正学到东西。</p><h3 id="_4-3-时间线工具" tabindex="-1">4.3 时间线工具 <a class="header-anchor" href="#_4-3-时间线工具" aria-label="Permalink to &quot;4.3 时间线工具&quot;">​</a></h3><p>可以是任何东西,<strong>关键是实时同步</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>最简单:一个飞书共享文档,Scribe 边发生边写</span></span>
<span class="line"><span>   优点:零门槛,所有人可见</span></span>
<span class="line"><span>   缺点:格式不统一,不利于归档</span></span>
<span class="line"><span></span></span>
<span class="line"><span>进阶: Slack/飞书机器人 命令 /incident-log</span></span>
<span class="line"><span>   /incident-log fact &quot;错误率从 0.1% 升到 38%&quot;</span></span>
<span class="line"><span>   /incident-log decision &quot;IC 决定回滚&quot;</span></span>
<span class="line"><span>   优点:自动加时间戳、自动归档</span></span>
<span class="line"><span>   缺点:要花一周开发</span></span>
<span class="line"><span></span></span>
<span class="line"><span>成熟:PagerDuty / Incident.io / Rootly</span></span>
<span class="line"><span>   优点:完整模板、自动复盘 / Action 跟踪</span></span>
<span class="line"><span>   缺点:贵,小团队用不上</span></span></code></pre></div><p><strong>中型团队 99% 的场景,飞书 / 钉钉 + 一个共享文档够用</strong>。<strong>别花时间造工具</strong>,花时间训练人。</p><hr><h2 id="五、升级路径-技术失控-vs-业务失控-完全是两件事" tabindex="-1">五、升级路径:技术失控 vs 业务失控,完全是两件事 <a class="header-anchor" href="#五、升级路径-技术失控-vs-业务失控-完全是两件事" aria-label="Permalink to &quot;五、升级路径:技术失控 vs 业务失控,完全是两件事&quot;">​</a></h2><h3 id="_5-1-技术升级-让更多人下场" tabindex="-1">5.1 技术升级:让更多人下场 <a class="header-anchor" href="#_5-1-技术升级-让更多人下场" aria-label="Permalink to &quot;5.1 技术升级:让更多人下场&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>触发条件                    升级到</span></span>
<span class="line"><span>─────────────────          ─────────</span></span>
<span class="line"><span>处置 30 分钟无进展          → SRE Lead / 高级工程师</span></span>
<span class="line"><span>判断需要数据回填 / DDL      → DBA Lead</span></span>
<span class="line"><span>判断需要扩容 50% 以上       → 平台 / 基础设施 Lead</span></span>
<span class="line"><span>判断可能是基础设施问题       → IDC / 云厂商工单</span></span>
<span class="line"><span>判断需要联动安全(可疑入侵) → 安全应急 + 法务</span></span></code></pre></div><h3 id="_5-2-业务升级-让更多角色感知" tabindex="-1">5.2 业务升级:让更多角色感知 <a class="header-anchor" href="#_5-2-业务升级-让更多角色感知" aria-label="Permalink to &quot;5.2 业务升级:让更多角色感知&quot;">​</a></h3><p><strong>这条经常被忽略,但比技术升级影响更大</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>触发条件                       升级到</span></span>
<span class="line"><span>──────────────────────       ─────────</span></span>
<span class="line"><span>影响 &gt; 1% 用户 / &gt; 30 分钟     → CTO(让 TA 知道)</span></span>
<span class="line"><span>影响 &gt; 10% 用户 / &gt; 1 小时     → CEO / COO</span></span>
<span class="line"><span>影响付费用户 / 大客户          → 客户成功 / 商务</span></span>
<span class="line"><span>合约可能触发 SLA 赔偿          → 法务 + 财务</span></span>
<span class="line"><span>涉及数据泄露 / 监管            → 法务 + 合规 + DPO</span></span>
<span class="line"><span>媒体可能介入                   → PR / 品牌</span></span></code></pre></div><p><strong>关键点</strong>:业务升级<strong>不是&quot;出事之后向上汇报&quot;</strong>,是&quot;在影响升级的同时,让相关角色提前进入待命&quot;。<strong>让 CEO 在媒体打电话进来之前先知道</strong>,而不是反过来。</p><h3 id="_5-3-升级的按钮-谁有权按" tabindex="-1">5.3 升级的按钮:谁有权按 <a class="header-anchor" href="#_5-3-升级的按钮-谁有权按" aria-label="Permalink to &quot;5.3 升级的按钮:谁有权按&quot;">​</a></h3><p><strong>只有 IC 能按升级按钮</strong>——这条规则的作用是:Ops 不会因为&quot;焦虑&quot;就升级(经常是过度反应),Comms 不会因为&quot;客户压力&quot;就升级(经常是被裹挟)。<strong>IC 站在全局视角判断&quot;现在的影响是否真的需要这一级&quot;</strong>。</p><p>但要给 IC 一个<strong>强制升级规则</strong>——某些条件下他没有不升级的选项:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>强制升级触发(任一满足,IC 必须升级,不能拍脑袋决定不升):</span></span>
<span class="line"><span>   - 错误预算被烧穿超过 50%</span></span>
<span class="line"><span>   - 影响范围 &gt; 5% 用户 且 持续 &gt; 15 分钟</span></span>
<span class="line"><span>   - 涉及付费 / 合约客户</span></span>
<span class="line"><span>   - 涉及数据丢失(任何量级)</span></span>
<span class="line"><span>   - 涉及安全事件(可疑入侵 / 数据泄露)</span></span></code></pre></div><p>把这个规则<strong>写进 IC 手册</strong>,不靠人判断,靠制度兜底。</p><hr><h2 id="六、事故响应模板-一份能直接抄的协议" tabindex="-1">六、事故响应模板:一份能直接抄的协议 <a class="header-anchor" href="#六、事故响应模板-一份能直接抄的协议" aria-label="Permalink to &quot;六、事故响应模板:一份能直接抄的协议&quot;">​</a></h2><p>下面是一份完整的事故响应文档模板,<strong>贴到团队 Wiki 第一页</strong>,出事时 IC 照着走。</p><h3 id="_6-1-开始声明-incident-declaration" tabindex="-1">6.1 开始声明(Incident Declaration) <a class="header-anchor" href="#_6-1-开始声明-incident-declaration" aria-label="Permalink to &quot;6.1 开始声明(Incident Declaration)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>=========================================</span></span>
<span class="line"><span>INCIDENT DECLARATION</span></span>
<span class="line"><span>=========================================</span></span>
<span class="line"><span>Title:    [一句话描述,如:订单接口错误率飙升]</span></span>
<span class="line"><span>Severity: [P0 / P1 / P2]</span></span>
<span class="line"><span>Started:  YYYY-MM-DD HH:MM (UTC+8)</span></span>
<span class="line"><span>IC:       @小王</span></span>
<span class="line"><span>Ops:      @小李 @组长</span></span>
<span class="line"><span>Comms:    @客服-A</span></span>
<span class="line"><span>Scribe:   @小王(兼)</span></span>
<span class="line"><span>Channel:  #incident-2026-05-11-trade-error-spike</span></span>
<span class="line"><span>Voice:    Zoom https://...</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Summary:</span></span>
<span class="line"><span>  - 影响服务:order-api / payment-callback</span></span>
<span class="line"><span>  - 影响范围:估算 5% 下单流量</span></span>
<span class="line"><span>  - 当前状态:排查中</span></span>
<span class="line"><span>  - 下次更新:5 分钟后</span></span>
<span class="line"><span></span></span>
<span class="line"><span>链接:</span></span>
<span class="line"><span>  - Dashboard: https://grafana.../trade</span></span>
<span class="line"><span>  - Runbook:   https://wiki.../order-api-down</span></span>
<span class="line"><span>  - Status:    https://status.example.com/incidents/123</span></span>
<span class="line"><span>=========================================</span></span></code></pre></div><h3 id="_6-2-状态更新-每-10-15-分钟一次" tabindex="-1">6.2 状态更新(每 10-15 分钟一次) <a class="header-anchor" href="#_6-2-状态更新-每-10-15-分钟一次" aria-label="Permalink to &quot;6.2 状态更新(每 10-15 分钟一次)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>[03:15] STATUS UPDATE</span></span>
<span class="line"><span>  - 当前状态:已定位 / 处置中</span></span>
<span class="line"><span>  - 已确认根因:v2.4.7 migration 删了关键索引</span></span>
<span class="line"><span>  - 当前动作:Ops-小李 正在执行回滚</span></span>
<span class="line"><span>  - 影响变化:错误率仍 38%,未改善</span></span>
<span class="line"><span>  - 下次更新:03:25 (或状态有变时立刻)</span></span></code></pre></div><p><strong>为什么 10-15 分钟一次,雷打不动</strong>:不更新 → 高管会进战时频道问 → Ops 被打断 → 修复变慢。<strong>主动按节奏 push 状态,等于把&quot;被催&quot;变成&quot;被信任&quot;</strong>。</p><h3 id="_6-3-升级声明" tabindex="-1">6.3 升级声明 <a class="header-anchor" href="#_6-3-升级声明" aria-label="Permalink to &quot;6.3 升级声明&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>=========================================</span></span>
<span class="line"><span>INCIDENT ESCALATION</span></span>
<span class="line"><span>=========================================</span></span>
<span class="line"><span>Incident: #incident-2026-05-11-trade-error-spike</span></span>
<span class="line"><span>Time:     03:32</span></span>
<span class="line"><span>Severity: P1 → P0</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Reason:   错误预算已烧穿 80%,处置 30 分钟未恢复</span></span>
<span class="line"><span>Action:   升级触发,通知 CTO + 客户成功负责人加入</span></span>
<span class="line"><span></span></span>
<span class="line"><span>新加入:</span></span>
<span class="line"><span>  - @CTO(只通知,不参与战时频道讨论)</span></span>
<span class="line"><span>  - @客户成功-王经理(对接 3 个大客户预警)</span></span>
<span class="line"><span>=========================================</span></span></code></pre></div><h3 id="_6-4-关闭声明" tabindex="-1">6.4 关闭声明 <a class="header-anchor" href="#_6-4-关闭声明" aria-label="Permalink to &quot;6.4 关闭声明&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>=========================================</span></span>
<span class="line"><span>INCIDENT RESOLVED</span></span>
<span class="line"><span>=========================================</span></span>
<span class="line"><span>Title:    订单接口错误率飙升</span></span>
<span class="line"><span>Severity: P0</span></span>
<span class="line"><span>Started:  2026-05-11 03:01 (UTC+8)</span></span>
<span class="line"><span>Detected: 2026-05-11 03:02 (Datadog 告警)</span></span>
<span class="line"><span>Resolved: 2026-05-11 03:30</span></span>
<span class="line"><span>Total:    29 minutes</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Root Cause(初步):</span></span>
<span class="line"><span>  v2.4.7 数据库迁移误删 idx_status_created 索引,导致 order</span></span>
<span class="line"><span>  查询全表扫描,DB CPU 跑满,接口超时</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Resolution:</span></span>
<span class="line"><span>  回滚到 v2.4.6,索引恢复,错误率降回 0.15%</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Impact:</span></span>
<span class="line"><span>  - 估算 12,400 笔订单受影响</span></span>
<span class="line"><span>  - 估算 5,200 用户感知失败</span></span>
<span class="line"><span>  - 错误预算消耗 ~85%(本月)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Action:</span></span>
<span class="line"><span>  复盘安排在 2026-05-13 14:00,所有相关人参加</span></span>
<span class="line"><span>  详细复盘报告:[link, 复盘后填]</span></span>
<span class="line"><span>=========================================</span></span></code></pre></div><h3 id="_6-5-何时不发完整响应" tabindex="-1">6.5 何时不发完整响应 <a class="header-anchor" href="#_6-5-何时不发完整响应" aria-label="Permalink to &quot;6.5 何时不发完整响应&quot;">​</a></h3><p><strong>不是所有告警都该上完整响应</strong>——小事故走精简流程,否则团队会&quot;事故疲劳&quot;,最后真出大事时反应迟钝。</p><table tabindex="0"><thead><tr><th>严重度</th><th>触发条件</th><th>响应级别</th></tr></thead><tbody><tr><td><strong>P0</strong></td><td>全站宕 / 核心交易停 / 数据丢</td><td>完整四角色 + 战时频道 + Status Page</td></tr><tr><td><strong>P1</strong></td><td>影响 &gt; 1% 用户 / 部分功能不可用</td><td>IC + Ops + Comms 三角色,可不开语音</td></tr><tr><td><strong>P2</strong></td><td>影响 &lt; 1% 用户 / 降级可用</td><td>单人处置 + 记录,无需 Comms</td></tr><tr><td><strong>P3</strong></td><td>自愈成功的告警 / 单实例异常</td><td><strong>只记录,不响应</strong></td></tr></tbody></table><p><strong>重点</strong>:<strong>P3 必须只记录、不响应</strong>——但<strong>一周内同类 P3 出现 3 次以上,自动升级讨论</strong>。不是放过 P3,是用统计学的方式管 P3。</p><hr><h2 id="七、5-个常见反模式-每一个我都见过" tabindex="-1">七、5 个常见反模式:每一个我都见过 <a class="header-anchor" href="#七、5-个常见反模式-每一个我都见过" aria-label="Permalink to &quot;七、5 个常见反模式:每一个我都见过&quot;">​</a></h2><h3 id="反模式-1-没人当-ic——大家都在动手" tabindex="-1">反模式 1:没人当 IC——大家都在动手 <a class="header-anchor" href="#反模式-1-没人当-ic——大家都在动手" aria-label="Permalink to &quot;反模式 1:没人当 IC——大家都在动手&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>症状:    群里 5 个人,5 个人都在 ssh 到不同机器</span></span>
<span class="line"><span>后果:    一个改配置,一个滚回去,一个加索引,三件事互相打架</span></span>
<span class="line"><span>怎么办:  团队 Wiki 第一条规则:出事时第一个发&quot;我是 IC&quot;的人就是 IC</span></span>
<span class="line"><span>         其他人立即停下来听他分工</span></span></code></pre></div><h3 id="反模式-2-战时频道刷屏" tabindex="-1">反模式 2:战时频道刷屏 <a class="header-anchor" href="#反模式-2-战时频道刷屏" aria-label="Permalink to &quot;反模式 2:战时频道刷屏&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>症状:    出事 10 分钟,群里 80 条消息,30 条是&quot;咋样了&quot;</span></span>
<span class="line"><span>后果:    Ops 一边修一边回 @,实际处置速度减半</span></span>
<span class="line"><span>怎么办:  IC 第一条命令:&quot;非 Ops / Comms 不要发言,有进展我会同步&quot;</span></span>
<span class="line"><span>         设一个 #incident-观察 频道给关心的人看(只读 mirror)</span></span></code></pre></div><h3 id="反模式-3-没记时间线" tabindex="-1">反模式 3:没记时间线 <a class="header-anchor" href="#反模式-3-没记时间线" aria-label="Permalink to &quot;反模式 3:没记时间线&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>症状:    事故 1 小时,所有人凭记忆复盘</span></span>
<span class="line"><span>后果:    复盘变成&quot;我记得当时是 XX&quot;的扯皮</span></span>
<span class="line"><span>         &quot;那个回滚是谁做的?&quot;——没人记得</span></span>
<span class="line"><span>怎么办:  IC 第一件事是指定 Scribe(可以是自己兼)</span></span>
<span class="line"><span>         事故频道每条关键消息都标 [FACT] / [DECISION] / [ACTION]</span></span></code></pre></div><h3 id="反模式-4-客服没人告知——用户先发现" tabindex="-1">反模式 4:客服没人告知——用户先发现 <a class="header-anchor" href="#反模式-4-客服没人告知——用户先发现" aria-label="Permalink to &quot;反模式 4:客服没人告知——用户先发现&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>症状:    技术群里热火朝天,客服群里&quot;用户大量反馈下单失败,有谁在处理吗&quot;</span></span>
<span class="line"><span>后果:    用户在朋友圈骂街,客服没有话术,公司形象塌了</span></span>
<span class="line"><span>怎么办:  Comms 必须在事故声明的同时同步给客服 leader</span></span>
<span class="line"><span>         5 分钟内给客服一份&quot;标准话术&quot;(哪怕只是&quot;我们正在调查&quot;)</span></span>
<span class="line"><span>         站点 Status Page 必须出现</span></span></code></pre></div><h3 id="反模式-5-修完不验证" tabindex="-1">反模式 5:修完不验证 <a class="header-anchor" href="#反模式-5-修完不验证" aria-label="Permalink to &quot;反模式 5:修完不验证&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>症状:    &quot;回滚了 / 改完了&quot;——所有人散场</span></span>
<span class="line"><span>后果:    1 小时后告警再来,这次没人在线了</span></span>
<span class="line"><span>怎么办:  IC 在宣布恢复前,必须验证 5 件事:</span></span>
<span class="line"><span>         1. 主要指标恢复到事故前水位</span></span>
<span class="line"><span>         2. 二级指标(下游服务)没有继承故障</span></span>
<span class="line"><span>         3. 持续观察 10 分钟无回弹</span></span>
<span class="line"><span>         4. 用户侧抽样验证(客服找 3 个用户确认能下单)</span></span>
<span class="line"><span>         5. 写下&quot;如果再来,我下一步做什么&quot;作为后手</span></span></code></pre></div><hr><h2 id="八、何时不该上完整响应" tabindex="-1">八、何时不该上完整响应 <a class="header-anchor" href="#八、何时不该上完整响应" aria-label="Permalink to &quot;八、何时不该上完整响应&quot;">​</a></h2><p>事故响应制度不是越严越好,<strong>滥用会有反效果</strong>:</p><h3 id="_8-1-小范围影响-1-用户-单实例" tabindex="-1">8.1 小范围影响(&lt; 1% 用户 / 单实例) <a class="header-anchor" href="#_8-1-小范围影响-1-用户-单实例" aria-label="Permalink to &quot;8.1 小范围影响(&lt; 1% 用户 / 单实例)&quot;">​</a></h3><p>P2 / P3 等级——<strong>不要开战时频道,不要拉 Comms</strong>。一个值班工程师处理,记录到事故日志即可。<strong>滥开战时频道的代价</strong>:团队成员对 P0 召集脱敏,真出 P0 时大家以为是又一次&quot;小事&quot;。</p><h3 id="_8-2-自愈成功的告警" tabindex="-1">8.2 自愈成功的告警 <a class="header-anchor" href="#_8-2-自愈成功的告警" aria-label="Permalink to &quot;8.2 自愈成功的告警&quot;">​</a></h3><p>某些告警是&quot;恢复型&quot;——比如单实例 OOM 后被 K8s 重启自愈、临时网络抖动后自动恢复。<strong>这种只需要事后看一眼,不需要响应</strong>。</p><p>但要<strong>自动归档</strong>——一周一次扫描&quot;自愈告警频率&quot;,超过阈值就升级讨论(因为自愈成功不等于没问题,是 Toil 在累积)。</p><h3 id="_8-3-演练-混沌" tabindex="-1">8.3 演练 / 混沌 <a class="header-anchor" href="#_8-3-演练-混沌" aria-label="Permalink to &quot;8.3 演练 / 混沌&quot;">​</a></h3><p>GameDay / 混沌注入产生的告警,<strong>走演练响应流程</strong>,不走真实响应——但<strong>演练响应流程要 100% 复刻真实响应</strong>。这是混沌工程能给团队带来的最大价值:<strong>让事故响应肌肉在没有真事故时也保持热度</strong>。</p><h3 id="_8-4-小团队的边界" tabindex="-1">8.4 小团队的边界 <a class="header-anchor" href="#_8-4-小团队的边界" aria-label="Permalink to &quot;8.4 小团队的边界&quot;">​</a></h3><p><strong>5 人以下团队</strong>:角色合并到 2 人(IC+Scribe / Ops+Comms),但<strong>不能合并到 1 人</strong>——1 人既动手又指挥又对外沟通,等于没有响应制度。如果团队真的只有 1 人 on-call,就<strong>只配 P2 以下流程</strong>,P0 强制升级到外援 / 创始人。</p><hr><h2 id="九、踩坑提醒" tabindex="-1">九、踩坑提醒 <a class="header-anchor" href="#九、踩坑提醒" aria-label="Permalink to &quot;九、踩坑提醒&quot;">​</a></h2><p>把这 10 条贴在 On-call 工程师工作台前。</p><ol><li><strong>IC 自己动手</strong>——所有&quot;我直接改一下&quot;的 IC,后面都没人在指挥了</li><li><strong>Comms 进战时技术频道争论</strong>——Comms 的战场在客服群和 Status Page,不在战时频道</li><li><strong>战时频道开在常驻群里</strong>——一定要临时拉,事后归档</li><li><strong>只发文字不开语音</strong>——文字快不过紧急决策的节奏</li><li><strong>时间线掺推测</strong>——只记事实,推测和反思全部留给复盘</li><li><strong>状态更新等修完再发</strong>——10-15 分钟一次,雷打不动,<strong>没进展也要更新&quot;无进展&quot;</strong></li><li><strong>修完立刻散场</strong>——必须持续观察 10 分钟,且写下&quot;如果再来下一步做什么&quot;</li><li><strong>业务升级靠 IC 拍脑袋</strong>——把强制升级触发条件写死,不靠人判断</li><li><strong>小事故也开完整响应</strong>——团队会脱敏,关键时刻召不动人</li><li><strong>以为&quot;响应&quot;是一次性事件</strong>——事故关闭只是起点,复盘和 Action 跟踪才是核心(见下一篇)</li></ol><hr><h2 id="十、写在最后" tabindex="-1">十、写在最后 <a class="header-anchor" href="#十、写在最后" aria-label="Permalink to &quot;十、写在最后&quot;">​</a></h2><p>事故响应这件事,<strong>写得再细的手册也不如演练一次</strong>。手册告诉你应该有 IC,但<strong>只有亲身经历过&quot;IC 拒绝下场 / Ops 安静干活 / Comms 准时发公告&quot;那种秩序感</strong>,你才会真信这套东西管用。</p><p>所以<strong>最有效的一步,是下周就跑一次 GameDay</strong>——挑一个非高峰时段,Ops 故意把一个非核心服务挂掉,<strong>让团队按 IC / Ops / Comms / Scribe 走完整流程</strong>。第一次一定乱,<strong>这就是收获</strong>——你会发现书里写的&quot;30 分钟战时秩序&quot;在你团队真实场景里到底卡在哪。</p><p>事故响应的核心不在工具,在<strong>纪律</strong>:不动手的能忍住不动手,动手的能屏蔽外界专心动手,沟通的能在内部和外部之间架桥,记录的能在所有人焦虑时保持冷静记一行字。<strong>这是软件团队最像消防队的一刻——你不是在写代码,你是在指挥一场救援</strong>。</p><blockquote><p>下一篇 <code>33-Blameless-Postmortem.md</code> 讲事故之后:<strong>复盘要怎么开才不变成批斗大会,Action Items 要怎么跟才不变成空头支票,5 Whys 要挖到哪一层才停</strong>。事故响应让损失最小化,复盘才让同类事故不再发生——<strong>两件事缺一不可,缺一个这个团队就在原地踏步</strong>。</p></blockquote>`,137)])])}const u=n(e,[["render",l]]);export{g as __pageData,u as default};
