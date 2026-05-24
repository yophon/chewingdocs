import{_ as a,H as n,f as i,i as p}from"./chunks/framework.BHvCMIhP.js";const c=JSON.parse('{"title":"CI/CD 心智:为什么 CI 必须快 / 流水线分层 / 制品 vs 部署","description":"","frontmatter":{},"headers":[],"relativePath":"devopsLearning/18-CICD心智.md","filePath":"devopsLearning/18-CICD心智.md","lastUpdated":1778496697000}'),l={name:"devopsLearning/18-CICD心智.md"};function t(e,s,h,k,r,o){return n(),i("div",null,[...s[0]||(s[0]=[p(`<h1 id="ci-cd-心智-为什么-ci-必须快-流水线分层-制品-vs-部署" tabindex="-1">CI/CD 心智:为什么 CI 必须快 / 流水线分层 / 制品 vs 部署 <a class="header-anchor" href="#ci-cd-心智-为什么-ci-必须快-流水线分层-制品-vs-部署" aria-label="Permalink to &quot;CI/CD 心智:为什么 CI 必须快 / 流水线分层 / 制品 vs 部署&quot;">​</a></h1><p>第四层「CI/CD 与发布工程」开篇,先把 CI 和 CD 这两个词捋清楚——<strong>这两个字母的混淆是中型团队发布事故 80% 的认知根因</strong>。backendLearning/40 起步讲过一条 CI/CD 流水线长什么样,<strong>那篇是工具视角</strong>——告诉你 GitHub Actions / GitLab CI 怎么写。<strong>这一篇是工程视角</strong>——告诉你为什么一条 30 分钟的 CI 流水线会把整个团队的工程纪律毁掉,为什么 dev / staging / prod 用三份不同的镜像构建是反模式,为什么 flaky test 不修是技术债的一种最贵的形式。</p><blockquote><p>一句话先记住:<strong>CI 必须 &lt; 10 分钟,&gt; 30 分钟团队会绕过它</strong>。这不是品味问题,是人性——一条 30 分钟的 CI 等于&quot;工程师改一行代码要等半小时才能 merge&quot;,<strong>这种延迟会被人本能地绕过</strong>:本地跳过测试、push 完去开会回来再说、急了直接 <code>--no-verify</code>。一旦绕过形成习惯,CI 这层防线就废了。<strong>CI 的核心 KPI 不是&quot;覆盖率&quot;,是&quot;延迟&quot;</strong>——10 分钟是分水岭,5 分钟是健康线,&lt; 2 分钟是奢侈品。这一篇所有的工程取舍都围绕这条线展开。</p></blockquote><hr><h2 id="一、ci-和-cd-不是一回事——这是-80-团队第一个搞错的事" tabindex="-1">一、CI 和 CD 不是一回事——这是 80% 团队第一个搞错的事 <a class="header-anchor" href="#一、ci-和-cd-不是一回事——这是-80-团队第一个搞错的事" aria-label="Permalink to &quot;一、CI 和 CD 不是一回事——这是 80% 团队第一个搞错的事&quot;">​</a></h2><p>「CI/CD」连着写久了,大家以为这是一件事。<strong>根本不是</strong>。这两件事的目标、节奏、风险都完全不同,把它们写在同一个 pipeline 里&quot;一键全走&quot;是最常见的反模式。</p><h3 id="_1-1-ci-与-cd-各自在做什么" tabindex="-1">1.1 CI 与 CD 各自在做什么 <a class="header-anchor" href="#_1-1-ci-与-cd-各自在做什么" aria-label="Permalink to &quot;1.1 CI 与 CD 各自在做什么&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>CI = Continuous Integration                   CD-1 = Continuous Delivery</span></span>
<span class="line"><span>  目标:让代码能 merge                          目标:让制品能随时上线</span></span>
<span class="line"><span>  输入:代码 diff                               输入:已通过 CI 的制品(镜像)</span></span>
<span class="line"><span>  输出:&quot;可合并 / 不可合并&quot;的判定                输出:&quot;可发布 / 不可发布&quot;的判定</span></span>
<span class="line"><span>  动作:lint / unit / integration / build      动作:promote / deploy / 灰度 / 回滚</span></span>
<span class="line"><span>  节奏:每个 PR 跑、每次 push 跑                节奏:按发布窗口 / 按需触发</span></span>
<span class="line"><span>  失败代价:开发者多等几分钟                    失败代价:用户看到错</span></span>
<span class="line"><span>  关心的指标:延迟、稳定性、覆盖率              关心的指标:MTTR、Change Failure Rate</span></span>
<span class="line"><span></span></span>
<span class="line"><span>CD-2 = Continuous Deployment(更激进的一种 CD)</span></span>
<span class="line"><span>  目标:主干 merge 即上生产</span></span>
<span class="line"><span>  风险:没有人工拦截,bug 直达用户</span></span>
<span class="line"><span>  适用:Netflix / Etsy 这类高频小步发布团队 + 完整的渐进发布 + 自动回滚 + Feature Flag</span></span>
<span class="line"><span>  不适用:绝大多数中型团队</span></span></code></pre></div><p><strong>国内 95% 的团队&quot;做的 CD&quot;是 Continuous Delivery,不是 Continuous Deployment</strong>。把 CD 理解成&quot;代码 push 自动上生产&quot;就是把自己往悬崖边推——你既没有完整的渐进发布工程,也没有自动 rollback 的能力,这种 CD 不是工程进步是赌博。</p><h3 id="_1-2-为什么-ci-和-cd-必须解耦" tabindex="-1">1.2 为什么 CI 和 CD 必须解耦 <a class="header-anchor" href="#_1-2-为什么-ci-和-cd-必须解耦" aria-label="Permalink to &quot;1.2 为什么 CI 和 CD 必须解耦&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>反模式:CI 和 CD 一条 pipeline 串到底</span></span>
<span class="line"><span></span></span>
<span class="line"><span>    push → lint → unit → integration → build → push image → deploy dev → deploy staging → deploy prod</span></span>
<span class="line"><span>                                                                                           ▲</span></span>
<span class="line"><span>                                                                                           │ 哪一步挂了整条挂</span></span>
<span class="line"><span></span></span>
<span class="line"><span>后果:</span></span>
<span class="line"><span>  - 改一行业务代码,要等 deploy staging 跑完才知道这次能不能合</span></span>
<span class="line"><span>  - deploy staging 出问题,所有人 PR 卡住</span></span>
<span class="line"><span>  - &quot;因为 staging 环境有问题所以 unit test 跑不了&quot;——荒谬但常见</span></span>
<span class="line"><span>  - CI 时长被 CD 拖累,从 5 分钟变成 25 分钟</span></span>
<span class="line"><span>  - merge 队列堵起来,工程师开始走&quot;跳过 CI&quot;小路</span></span>
<span class="line"><span></span></span>
<span class="line"><span>正确:CI 和 CD 是两条 pipeline,一份制品衔接</span></span>
<span class="line"><span></span></span>
<span class="line"><span>    PR  → CI 流水线 →   pass/fail</span></span>
<span class="line"><span>                       │ pass</span></span>
<span class="line"><span>                       ▼</span></span>
<span class="line"><span>    merge → CI 流水线 → 构建制品 → 推 registry → 触发 CD</span></span>
<span class="line"><span>                                                  │</span></span>
<span class="line"><span>                                                  ▼</span></span>
<span class="line"><span>                          CD 流水线 → 部署 dev → 自动测试</span></span>
<span class="line"><span>                                             ↓ 通过</span></span>
<span class="line"><span>                                             部署 staging → 烟雾测试</span></span>
<span class="line"><span>                                             ↓ 通过</span></span>
<span class="line"><span>                                             部署 prod (人工审批 / 灰度)</span></span></code></pre></div><p><strong>两条 pipeline 之间靠&quot;制品&quot;耦合</strong>——CI 产出一个不可变的镜像 hash,CD 拿这个 hash 去各环境部署。<strong>这是后面&quot;Build once, deploy many&quot;的基础</strong>。</p><h3 id="_1-3-反对的两种叙述" tabindex="-1">1.3 反对的两种叙述 <a class="header-anchor" href="#_1-3-反对的两种叙述" aria-label="Permalink to &quot;1.3 反对的两种叙述&quot;">​</a></h3><p>我特别反感两种 CI/CD 讲法,这篇绝对不会这么写:</p><ol><li><strong>&quot;CI/CD 是 DevOps 文化的体现&quot;</strong>——空话。文化要落到流水线分层、延迟预算、制品 promotion 流程上,不然只是口号。</li><li><strong>&quot;上 GitLab CI 就完事了&quot;</strong>——工具不解决问题。同一份 GitLab CI,有的团队用得 MTTR 半小时,有的团队半天搞不定一个 rollback——区别在 pipeline 怎么设计、怎么分层、什么时候不该跑什么。</li></ol><hr><h2 id="二、为什么-ci-必须-10-分钟-延迟是-ci-的命门" tabindex="-1">二、为什么 CI 必须 &lt; 10 分钟:延迟是 CI 的命门 <a class="header-anchor" href="#二、为什么-ci-必须-10-分钟-延迟是-ci-的命门" aria-label="Permalink to &quot;二、为什么 CI 必须 &lt; 10 分钟:延迟是 CI 的命门&quot;">​</a></h2><p>这是这一篇最重要的一节,<strong>也是中型团队最容易忽略的一节</strong>。</p><h3 id="_2-1-ci-延迟和工程师行为的关系" tabindex="-1">2.1 CI 延迟和工程师行为的关系 <a class="header-anchor" href="#_2-1-ci-延迟和工程师行为的关系" aria-label="Permalink to &quot;2.1 CI 延迟和工程师行为的关系&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>CI 时长       工程师行为                                  CI 这层防线的状态</span></span>
<span class="line"><span>─────────────────────────────────────────────────────────────────────────</span></span>
<span class="line"><span>&lt; 2 分钟    push 完不离开工位,等结果                  健康,CI 真在拦 bug</span></span>
<span class="line"><span>2-5 分钟    push 完去倒杯水,回来看结果                健康</span></span>
<span class="line"><span>5-10 分钟   push 完切去另一个 PR / 写文档              亚健康,context switch 增加</span></span>
<span class="line"><span>10-30 分钟  push 完去开会,回来已经忘了改的什么        危险,开始有人本地跳过</span></span>
<span class="line"><span>&gt; 30 分钟   push 完吃午饭,中午回来发现挂在第 27 分钟  CI 已废,有人用 --no-verify</span></span></code></pre></div><p><strong>这不是夸张</strong>。我见过一个团队的 Java 微服务 CI 跑 42 分钟——结果:</p><ul><li>工程师习惯一次提交 3-5 个无关的修改一起跑 CI(摊薄等待时间)</li><li>上 CI 之前自己本地跑过测试,<strong>结果 CI 在远程环境一样的代码居然过不了</strong>(本地 vs CI 环境不一致)</li><li>周五下午没人敢 push(下班前跑不完)</li><li>一旦 CI 挂在某个 flaky test,工程师直接 &quot;Restart&quot; 一遍,跑 84 分钟</li><li><strong>整个团队的 PR 周转时间从平均 1 天涨到 3 天</strong>——CI 拖死了发布节奏</li></ul><h3 id="_2-2-一条-ci-流水线的延迟来自哪里" tabindex="-1">2.2 一条 CI 流水线的延迟来自哪里 <a class="header-anchor" href="#_2-2-一条-ci-流水线的延迟来自哪里" aria-label="Permalink to &quot;2.2 一条 CI 流水线的延迟来自哪里&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>典型一条 Java/Go 服务 CI 流水线(没优化):</span></span>
<span class="line"><span>   checkout                      30s</span></span>
<span class="line"><span>   依赖解析(maven / go mod)     60-300s   ← 大头,且最容易优化</span></span>
<span class="line"><span>   lint / format                 30s</span></span>
<span class="line"><span>   unit test                     60-600s   ← 大头,跟代码规模相关</span></span>
<span class="line"><span>   integration test              120-900s  ← 大头,起容器/起数据库慢</span></span>
<span class="line"><span>   build image                   60-300s   ← 大头,FROM 拉镜像 / 多阶段构建</span></span>
<span class="line"><span>   push image                    30-120s</span></span>
<span class="line"><span>   ──────────────────────────────────────────</span></span>
<span class="line"><span>   合计可能 8-40 分钟</span></span></code></pre></div><p><strong>优化优先级</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 缓存依赖     ← 影响最大,5 分钟省到 30 秒</span></span>
<span class="line"><span>2. 并行 jobs    ← unit / lint / build 同时跑,串行变并行</span></span>
<span class="line"><span>3. 拆 PR-time 和 merge-time(下一节讲)</span></span>
<span class="line"><span>4. 容器分层缓存(buildx --cache-from)</span></span>
<span class="line"><span>5. 单测里的&quot;慢测试&quot;挪到集成测试</span></span>
<span class="line"><span>6. integration test 用 testcontainers,不要起整个 K8s</span></span>
<span class="line"><span>7. 自托管 runner(SaaS runner 慢且贵)</span></span></code></pre></div><h3 id="_2-3-缓存策略的取舍" tabindex="-1">2.3 缓存策略的取舍 <a class="header-anchor" href="#_2-3-缓存策略的取舍" aria-label="Permalink to &quot;2.3 缓存策略的取舍&quot;">​</a></h3><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 反例:每次都重新下依赖</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">jobs</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  test</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    steps</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">uses</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">actions/checkout@v4</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">run</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">mvn test</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                    # 每次都下 200MB 的依赖</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 正确:缓存 .m2 / node_modules / .cache</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">jobs</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  test</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    steps</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">uses</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">actions/checkout@v4</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">uses</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">actions/setup-java@v4</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        with</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          java-version</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;21&#39;</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          cache</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;maven&#39;</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                 # 内置 maven 缓存</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">run</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">mvn -B -T 4 test</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">            # -T 4 = 4 线程并行</span></span></code></pre></div><p><strong>关键取舍</strong>:</p><ul><li><strong>缓存 key 用 lock 文件 hash</strong>(<code>hashFiles(&#39;**/pom.xml&#39;)</code>)——<code>pom.xml</code> 不变直接命中,否则重新下</li><li><strong>缓存命中率 &lt; 80% 就是反模式</strong>——key 设计错了,每次都 miss</li><li><strong>不要缓存 build 输出</strong>——可能引入&quot;明明改了代码但跑的是旧 class&quot;的诡异 bug</li><li><strong>缓存大小有上限</strong>(GitHub Actions 10GB / repo),超了 LRU 淘汰</li></ul><h3 id="_2-4-一个特别讨厌的反模式-在-ci-里跑-e2e" tabindex="-1">2.4 一个特别讨厌的反模式:在 CI 里跑 E2E <a class="header-anchor" href="#_2-4-一个特别讨厌的反模式-在-ci-里跑-e2e" aria-label="Permalink to &quot;2.4 一个特别讨厌的反模式:在 CI 里跑 E2E&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>反例:每个 PR 都跑全套 E2E</span></span>
<span class="line"><span>   PR → unit (3min) → integration (5min) → e2e (20min)  ← 把 e2e 拖进 PR</span></span>
<span class="line"><span>                                            ▲</span></span>
<span class="line"><span>                                            │ 这 20 分钟里前端起 / 后端起 / DB 灌数据</span></span>
<span class="line"><span>                                            │ 任何一环 flaky,整个 PR 重跑</span></span>
<span class="line"><span></span></span>
<span class="line"><span>后果:</span></span>
<span class="line"><span>  - PR 周转时间 30 分钟起步,工程师本能绕过</span></span>
<span class="line"><span>  - E2E flaky 率天然高(浏览器、网络、时序)</span></span>
<span class="line"><span>  - 一个 PR 改了 README,跑了 25 分钟 E2E,过了</span></span>
<span class="line"><span>  - 真正改了核心代码的 PR 反而被 flaky E2E 卡住</span></span>
<span class="line"><span></span></span>
<span class="line"><span>正确:E2E 不进 PR,挪到 merge-time 或 nightly</span></span></code></pre></div><p><strong>E2E 测试是&quot;上线信号&quot;不是&quot;合并门禁&quot;</strong>——它该出现在 staging 环境,不是 PR pipeline。下一节专门讲流水线分层。</p><hr><h2 id="三、流水线分层-不同的-trigger-不同的延迟预算" tabindex="-1">三、流水线分层:不同的 trigger,不同的延迟预算 <a class="header-anchor" href="#三、流水线分层-不同的-trigger-不同的延迟预算" aria-label="Permalink to &quot;三、流水线分层:不同的 trigger,不同的延迟预算&quot;">​</a></h2><p>把 CI 看成一个&quot;无差别 pipeline&quot;是反模式。<strong>正确的姿势是按 trigger 分层,每层有不同的延迟预算和检查粒度</strong>。</p><h3 id="_3-1-四层流水线" tabindex="-1">3.1 四层流水线 <a class="header-anchor" href="#_3-1-四层流水线" aria-label="Permalink to &quot;3.1 四层流水线&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌────────────────────────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│                        CI/CD 流水线分层                                          │</span></span>
<span class="line"><span>├────────────────────────────────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>│                                                                                │</span></span>
<span class="line"><span>│   层级           触发           延迟预算    跑什么                                 │</span></span>
<span class="line"><span>│  ──────────────────────────────────────────────────────────────────────────    │</span></span>
<span class="line"><span>│   commit-time    git push       &lt; 30s      pre-commit hook                     │</span></span>
<span class="line"><span>│   (本地)                                   - format / lint / 拼写              │</span></span>
<span class="line"><span>│                                            - 大文件 / 密钥扫描                  │</span></span>
<span class="line"><span>│                                            - 受影响包的 fast 单测              │</span></span>
<span class="line"><span>│                                                                                │</span></span>
<span class="line"><span>│   PR-time        open PR /      &lt; 5min     - 全量 lint + format                │</span></span>
<span class="line"><span>│   (远程)         push to PR                - unit test                         │</span></span>
<span class="line"><span>│                                            - 小型 integration test             │</span></span>
<span class="line"><span>│                                            - 镜像构建(不推送)                │</span></span>
<span class="line"><span>│                                            - SAST 静态扫描                     │</span></span>
<span class="line"><span>│                                                                                │</span></span>
<span class="line"><span>│   merge-time     merge to main  &lt; 15min    - 完整 integration test             │</span></span>
<span class="line"><span>│   (远程)                                   - 跨服务 contract test              │</span></span>
<span class="line"><span>│                                            - 镜像构建 + 签名 + 推 registry      │</span></span>
<span class="line"><span>│                                            - SBOM 生成 + 漏洞扫描              │</span></span>
<span class="line"><span>│                                            - 自动部署 dev                      │</span></span>
<span class="line"><span>│                                                                                │</span></span>
<span class="line"><span>│   release-time   tag / nightly  分钟-小时  - 完整 E2E test                     │</span></span>
<span class="line"><span>│   (远程)                                   - 性能基线对比                      │</span></span>
<span class="line"><span>│                                            - 安全 DAST 扫描                    │</span></span>
<span class="line"><span>│                                            - 部署 staging → 灰度 prod          │</span></span>
<span class="line"><span>│                                                                                │</span></span>
<span class="line"><span>└────────────────────────────────────────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>这张图是这一篇的灵魂</strong>。每一层的延迟预算不一样,工程师对每一层的耐受度也不一样:</p><ul><li><strong>commit-time</strong>:本地 hook,30 秒以上工程师会 disable 它,所以只能跑最快的检查</li><li><strong>PR-time</strong>:工程师在等结果,5 分钟是甜蜜区,超过 10 分钟开始 context switch</li><li><strong>merge-time</strong>:已经 merge 了没人盯着,15 分钟内出结果就行,失败可以告警</li><li><strong>release-time</strong>:发布是一个事件,长一点可以接受,但要给&quot;发布窗口&quot;准备出来</li></ul><h3 id="_3-2-commit-time-pre-commit-hook-的真实定位" tabindex="-1">3.2 commit-time:pre-commit hook 的真实定位 <a class="header-anchor" href="#_3-2-commit-time-pre-commit-hook-的真实定位" aria-label="Permalink to &quot;3.2 commit-time:pre-commit hook 的真实定位&quot;">​</a></h3><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># .pre-commit-config.yaml(用 pre-commit 工具)</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">repos</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">repo</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">https://github.com/pre-commit/pre-commit-hooks</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    rev</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">v4.6.0</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    hooks</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">id</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">trailing-whitespace</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">id</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">end-of-file-fixer</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">id</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">check-yaml</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">id</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">check-added-large-files</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        args</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;--maxkb=500&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]            </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 大文件拦截,防误传二进制</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">repo</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">https://github.com/gitleaks/gitleaks</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    rev</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">v8.18.0</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    hooks</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">id</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">gitleaks</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                     # 密钥扫描,这条是红线</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">repo</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">local</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    hooks</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">id</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">go-fmt</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">gofmt</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        entry</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">gofmt -l -w</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        language</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">system</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        files</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">\\.go$</span></span></code></pre></div><p><strong>关键取舍</strong>:</p><ul><li><strong>pre-commit 不是 CI 的替代品</strong>——它跑得快但跑得少,只能拦&quot;最低级错误&quot;</li><li><strong>不要在 pre-commit 里跑 unit test</strong>——慢,工程师会 <code>git commit --no-verify</code> 跳过</li><li><strong>gitleaks / detect-secrets 必须有</strong>——这是&quot;密钥进 Git&quot;的最后一道防线</li><li><strong>CI 必须再跑一遍 pre-commit</strong>——本地能被绕过,远程不能</li></ul><h3 id="_3-3-pr-time-和-merge-time-的关键区别" tabindex="-1">3.3 PR-time 和 merge-time 的关键区别 <a class="header-anchor" href="#_3-3-pr-time-和-merge-time-的关键区别" aria-label="Permalink to &quot;3.3 PR-time 和 merge-time 的关键区别&quot;">​</a></h3><p>这是最容易被忽略的分层。<strong>两者跑的检查不一样,不要混在一起</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>PR-time 的目标:让 PR 能不能 merge 可判定</span></span>
<span class="line"><span>  - 单测必须过</span></span>
<span class="line"><span>  - 小型 integration 必须过(只起 DB,不起整个生态)</span></span>
<span class="line"><span>  - lint / format / SAST 必须过</span></span>
<span class="line"><span>  - 镜像构建必须能成(但不推 registry)</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  失败代价:开发者改代码再 push</span></span>
<span class="line"><span></span></span>
<span class="line"><span>merge-time 的目标:产出可发布的制品 + 启动 CD</span></span>
<span class="line"><span>  - 完整 integration(起 Kafka / Redis / 外部依赖 mock)</span></span>
<span class="line"><span>  - 跨服务 contract test</span></span>
<span class="line"><span>  - 镜像构建 + 签名 + push</span></span>
<span class="line"><span>  - SBOM + 漏洞扫描</span></span>
<span class="line"><span>  - 自动部署 dev 环境</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  失败代价:回滚 merge 或快速修复</span></span></code></pre></div><p><strong>反对的模式</strong>:PR-time 全跑了一遍,merge-time 又跑一遍同样的东西——浪费时间且不产出新信号。<strong>正确</strong>:PR-time 是&quot;能不能合&quot;的判定,merge-time 是&quot;产出制品 + 部署 dev&quot;的动作,两者职责不同。</p><h3 id="_3-4-release-time-发布是个事件-不是个-push" tabindex="-1">3.4 release-time:发布是个事件,不是个 push <a class="header-anchor" href="#_3-4-release-time-发布是个事件-不是个-push" aria-label="Permalink to &quot;3.4 release-time:发布是个事件,不是个 push&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>反模式:每次 merge 到 main 就自动上 prod(没有渐进发布)</span></span>
<span class="line"><span>   - 凌晨某个工程师改了一个&quot;无关紧要的小 bug&quot;</span></span>
<span class="line"><span>   - merge 后自动部署 prod</span></span>
<span class="line"><span>   - 真出问题,凌晨 3 点告警群炸</span></span>
<span class="line"><span>   - 没人值班,因为大家以为&quot;merge 不上 prod&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>正确:release-time 是一个独立的发布事件</span></span>
<span class="line"><span>   - 由人触发(tag / approve / 按钮)</span></span>
<span class="line"><span>   - 跑完整 E2E + 性能基线</span></span>
<span class="line"><span>   - 部署 staging,跑烟雾测试</span></span>
<span class="line"><span>   - 灰度 prod(下一篇 21 讲)</span></span>
<span class="line"><span>   - 监控关键指标自动判断是否继续灰度</span></span></code></pre></div><p><strong>这一节的精髓</strong>:<strong>不同 trigger 的 pipeline 是不同的工程问题</strong>。把它们捏在一起,既慢又脆,且失去信号区分度。</p><hr><h2 id="四、制品-vs-部署-build-once-deploy-many" tabindex="-1">四、制品 vs 部署:Build once, deploy many <a class="header-anchor" href="#四、制品-vs-部署-build-once-deploy-many" aria-label="Permalink to &quot;四、制品 vs 部署:Build once, deploy many&quot;">​</a></h2><p>这是 CI/CD 工程里最重要的一条原则,<strong>没有之一</strong>。</p><h3 id="_4-1-反模式-每个环境重新构建" tabindex="-1">4.1 反模式:每个环境重新构建 <a class="header-anchor" href="#_4-1-反模式-每个环境重新构建" aria-label="Permalink to &quot;4.1 反模式:每个环境重新构建&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>反模式:</span></span>
<span class="line"><span>  PR    →  build dev image     →  deploy dev</span></span>
<span class="line"><span>  merge →  build staging image  →  deploy staging</span></span>
<span class="line"><span>  tag   →  build prod image     →  deploy prod</span></span>
<span class="line"><span></span></span>
<span class="line"><span>问题:</span></span>
<span class="line"><span>  - 同一份代码,构建了 3 次,产出 3 个不同的镜像 hash</span></span>
<span class="line"><span>  - dev / staging / prod 实际跑的可能是&quot;非常像但不一样&quot;的二进制</span></span>
<span class="line"><span>  - dev 过了 staging 挂了,因为 staging 多装了一个 patch</span></span>
<span class="line"><span>  - prod 出了 bug 用 dev 镜像没法复现,因为不是同一个镜像</span></span>
<span class="line"><span>  - 镜像构建是脆弱步骤,重复 3 次失败概率 ×3</span></span>
<span class="line"><span>  - &quot;在我机器上是好的,在 prod 上挂了&quot;——这就是 prod 环境构建的下场</span></span></code></pre></div><h3 id="_4-2-正确-build-once-promote-everywhere" tabindex="-1">4.2 正确:Build once, promote everywhere <a class="header-anchor" href="#_4-2-正确-build-once-promote-everywhere" aria-label="Permalink to &quot;4.2 正确:Build once, promote everywhere&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>正确:</span></span>
<span class="line"><span>  merge → build 一个镜像 myapp:sha-abc123 → 推 registry</span></span>
<span class="line"><span>                       │</span></span>
<span class="line"><span>                       │ 同一个 hash</span></span>
<span class="line"><span>                       ▼</span></span>
<span class="line"><span>  deploy dev      使用 myapp:sha-abc123</span></span>
<span class="line"><span>  deploy staging  使用 myapp:sha-abc123       (跑过 dev 的同一份镜像)</span></span>
<span class="line"><span>  deploy prod     使用 myapp:sha-abc123       (跑过 staging 的同一份镜像)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  环境差异通过 ConfigMap / Secret / 环境变量注入,</span></span>
<span class="line"><span>  镜像本身完全相同。</span></span></code></pre></div><p><strong>这个原则的工程价值</strong>:</p><ol><li><strong>可复现性</strong>——prod 出 bug,本地拉同一个 hash 镜像就能复现</li><li><strong>可信度</strong>——staging 通过的就是 prod 要跑的,不是&quot;差不多&quot;</li><li><strong>可追溯</strong>——<code>kubectl describe pod</code> 看到的 image hash 能精确对应一个 git commit</li><li><strong>审计友好</strong>——SBOM / 签名只做一次,全环境复用</li></ol><h3 id="_4-3-怎么落地-tag-策略" tabindex="-1">4.3 怎么落地:tag 策略 <a class="header-anchor" href="#_4-3-怎么落地-tag-策略" aria-label="Permalink to &quot;4.3 怎么落地:tag 策略&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>镜像 tag 策略(推荐):</span></span>
<span class="line"><span>  myapp:sha-abc123def    ← 永久 tag,git commit short hash</span></span>
<span class="line"><span>  myapp:1.4.2            ← 语义化版本,release 时打</span></span>
<span class="line"><span>  myapp:dev / staging / prod  ← 浮动 tag(不推荐,见下)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>部署时引用方式:</span></span>
<span class="line"><span>  ❌  image: myapp:latest              ← latest 是反模式,见踩坑章节</span></span>
<span class="line"><span>  ❌  image: myapp:dev                 ← 浮动 tag,昨天的 dev 和今天的 dev 不是同一个</span></span>
<span class="line"><span>  △   image: myapp:1.4.2              ← 可以,但不够精确</span></span>
<span class="line"><span>  ✅  image: myapp:sha-abc123def       ← 最优,精确到 commit</span></span>
<span class="line"><span>  ✅  image: myapp@sha256:abcd...      ← 用 digest pin,连 registry 篡改都防得了</span></span></code></pre></div><p><strong>关键</strong>:<strong>所有环境的 image 字段引用同一个 sha tag,而不是浮动 tag</strong>。GitOps 的 promote 流程(下一篇讲)就是修改某个环境的 manifest,把 image 字段从一个 sha 改成另一个 sha,本质上是个 git commit。</p><h3 id="_4-4-环境差异放在哪" tabindex="-1">4.4 环境差异放在哪 <a class="header-anchor" href="#_4-4-环境差异放在哪" aria-label="Permalink to &quot;4.4 环境差异放在哪&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>镜像里:代码 + 运行时(JDK / Node / Go binary)</span></span>
<span class="line"><span>        共享库</span></span>
<span class="line"><span>        默认配置</span></span>
<span class="line"><span>        启动脚本</span></span>
<span class="line"><span></span></span>
<span class="line"><span>容器外:数据库连接串</span></span>
<span class="line"><span>        外部 API 地址</span></span>
<span class="line"><span>        Feature flag</span></span>
<span class="line"><span>        日志级别</span></span>
<span class="line"><span>        Secret(DB 密码 / API Key)</span></span>
<span class="line"><span>        资源限制(CPU / 内存)</span></span></code></pre></div><p><strong>容器内的东西在所有环境完全相同,容器外的东西随环境注入</strong>。这就是十二要素应用(12-factor app)的 &quot;Config&quot; 原则——<strong>配置和代码分离</strong>。</p><p><strong>反例</strong>:Dockerfile 里 <code>ENV DB_HOST=prod-db.example.com</code>——把环境信息烤进镜像,Build once 立刻破功。</p><hr><h2 id="五、测试金字塔-别让-e2e-占-80" tabindex="-1">五、测试金字塔:别让 E2E 占 80% <a class="header-anchor" href="#五、测试金字塔-别让-e2e-占-80" aria-label="Permalink to &quot;五、测试金字塔:别让 E2E 占 80%&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>       ╱╲</span></span>
<span class="line"><span>      ╱E2╲           少量,高价值</span></span>
<span class="line"><span>     ╱  E ╲          - 关键用户路径</span></span>
<span class="line"><span>    ╱──────╲         - 跨服务最终验证</span></span>
<span class="line"><span>   ╱        ╲</span></span>
<span class="line"><span>  ╱ 集成测试 ╲       适量</span></span>
<span class="line"><span> ╱            ╲      - 服务内多模块协同</span></span>
<span class="line"><span>╱──────────────╲     - 跟数据库 / 中间件交互</span></span>
<span class="line"><span>╱                ╲</span></span>
<span class="line"><span>╱   单元测试      ╲   大量,快</span></span>
<span class="line"><span>╱                  ╲  - 函数级 / 类级</span></span>
<span class="line"><span>────────────────────  - 跑得快,&lt; 1ms/case</span></span></code></pre></div><h3 id="_5-1-数量比例的实战参考" tabindex="-1">5.1 数量比例的实战参考 <a class="header-anchor" href="#_5-1-数量比例的实战参考" aria-label="Permalink to &quot;5.1 数量比例的实战参考&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>单测      :  集成  :  E2E</span></span>
<span class="line"><span>70-80%    :  15-20% :  5-10%</span></span>
<span class="line"><span></span></span>
<span class="line"><span>10 万行代码服务的数量参考:</span></span>
<span class="line"><span>  单测     500-2000 个    跑完 &lt; 30s</span></span>
<span class="line"><span>  集成     50-200 个       跑完 &lt; 5min</span></span>
<span class="line"><span>  E2E      10-30 个        跑完 &lt; 15min</span></span></code></pre></div><p><strong>反模式金字塔</strong>(我见过太多):</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>       ╱╲╲╲╲╲╲╲╲╲╲╲╲╲</span></span>
<span class="line"><span>      ╱  E2E  占 80%   ╲    ← 测试团队主导,只会写 E2E</span></span>
<span class="line"><span>     ╱──────────────────╲</span></span>
<span class="line"><span>    ╱ 单测 占 10%        ╲   ← 开发觉得&quot;反正 E2E 都过了&quot;</span></span>
<span class="line"><span>   ╱────────────────────╲    </span></span>
<span class="line"><span>  ╱ 集成 占 10%           ╲</span></span>
<span class="line"><span> ────────────────────────</span></span></code></pre></div><p><strong>E2E 占 80% 的代价</strong>:</p><ol><li><strong>跑得慢</strong>——10 分钟 起步,所有人都在等</li><li><strong>flaky 率高</strong>——浏览器 / 网络 / 时序问题</li><li><strong>挂了不知道哪一层挂的</strong>——是前端?后端?数据库?Mock 服务?</li><li><strong>修一个 E2E 像修案子</strong>——要复现整个用户流程,不是单点 bug</li></ol><p><strong>正确的做法</strong>:把验证下沉到能下沉的最低层。能用单测覆盖的逻辑就别用集成测试,能用集成测试覆盖的就别用 E2E。<strong>E2E 只保留&quot;几个关键用户路径&quot;——下单 / 登录 / 支付,不要&quot;每个按钮点一遍&quot;</strong>。</p><h3 id="_5-2-集成测试的真正姿势" tabindex="-1">5.2 集成测试的真正姿势 <a class="header-anchor" href="#_5-2-集成测试的真正姿势" aria-label="Permalink to &quot;5.2 集成测试的真正姿势&quot;">​</a></h3><div class="language-go vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">go</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">// 反例:集成测试起整个 K8s</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">func</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> TestOrderService</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">t</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> *</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">testing</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">T</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">) {</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    // 先 kubectl apply 整个环境...</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    // 等 20 个 Pod 就绪...</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    // 灌测试数据...</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    // 跑测试 30 秒...</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    // 清理...</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">// 正确:用 testcontainers 起轻量依赖</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">func</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> TestOrderService</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">t</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> *</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">testing</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">T</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">) {</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    ctx </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">:=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> context.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">Background</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">()</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    pg, _ </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">:=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> postgres.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">RunContainer</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(ctx,                  </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">// 起一个真 PG</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        testcontainers.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">WithImage</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;postgres:16-alpine&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">),</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        postgres.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">WithDatabase</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;test&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">),</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    )</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    defer</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> pg.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">Terminate</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(ctx)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    </span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    dsn, _ </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">:=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> pg.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">ConnectionString</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(ctx)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    db, _ </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">:=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> sql.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">Open</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;postgres&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, dsn)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    </span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    svc </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">:=</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> NewOrderService</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(db)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    order, err </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">:=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> svc.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">Create</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">...</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)        </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">// 真测一遍业务逻辑</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    assert.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">NoError</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(t, err)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    assert.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">NotNil</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(t, order)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span></code></pre></div><p><strong>testcontainers</strong> 是中型团队集成测试的甜蜜区——<strong>起一个真数据库 / Redis / Kafka,跟 mock 比避免&quot;mock 漂移&quot;,跟全环境比够轻量</strong>。</p><hr><h2 id="六、flaky-test-的政治学-这是-cfr-的主要来源" tabindex="-1">六、Flaky test 的政治学:这是 CFR 的主要来源 <a class="header-anchor" href="#六、flaky-test-的政治学-这是-cfr-的主要来源" aria-label="Permalink to &quot;六、Flaky test 的政治学:这是 CFR 的主要来源&quot;">​</a></h2><p><strong>Flaky test</strong> = 同样的代码,有时过有时不过的测试。<strong>这种东西的杀伤力被严重低估</strong>——它不是&quot;小烦人&quot;,它是中型团队 Change Failure Rate(CFR)最大的隐性来源。</p><h3 id="_6-1-flaky-test-怎么搞死团队" tabindex="-1">6.1 flaky test 怎么搞死团队 <a class="header-anchor" href="#_6-1-flaky-test-怎么搞死团队" aria-label="Permalink to &quot;6.1 flaky test 怎么搞死团队&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>工程师 A 的视角:</span></span>
<span class="line"><span>  下午 4 点 push 一个紧急 hotfix</span></span>
<span class="line"><span>  CI 跑了 8 分钟,最后一个 E2E 红了</span></span>
<span class="line"><span>  看一眼:啊,这个 E2E 经常 flaky</span></span>
<span class="line"><span>  点 &quot;Re-run failed jobs&quot;</span></span>
<span class="line"><span>  又跑 8 分钟,过了</span></span>
<span class="line"><span>  merge</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  → 总共耽误 16 分钟,但 hotfix 上去了</span></span>
<span class="line"><span></span></span>
<span class="line"><span>工程师 B 的视角(同一周):</span></span>
<span class="line"><span>  改了一个核心模块</span></span>
<span class="line"><span>  CI 红了,看一眼,跟我改的有关</span></span>
<span class="line"><span>  但点 &quot;Re-run&quot; —— 居然过了</span></span>
<span class="line"><span>  以为是 flaky,merge</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  → 凌晨 2 点 prod 炸</span></span>
<span class="line"><span></span></span>
<span class="line"><span>工程师 C 的视角(三周后):</span></span>
<span class="line"><span>  改了点东西,CI 第一次过</span></span>
<span class="line"><span>  以为没问题,merge</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  → 凌晨 3 点 prod 炸,因为 C 改的代码恰好 break 了那个 flaky test 在 90% 的场景</span></span>
<span class="line"><span></span></span>
<span class="line"><span>经验:</span></span>
<span class="line"><span>  一旦团队默认&quot;挂了就 re-run&quot;,CI 这层防线就废了。</span></span>
<span class="line"><span>  flaky test 让&quot;红色&quot;变成&quot;噪音&quot;,真正的 bug 也被当成噪音。</span></span></code></pre></div><p><strong>Flaky test 是 CFR 的主要隐性来源</strong>——本来 CI 该拦下来的 bug,被 &quot;re-run 大法&quot; 漂上 prod。这是这一篇要强调的核心结论之一。</p><h3 id="_6-2-处理-flaky-的三种策略" tabindex="-1">6.2 处理 flaky 的三种策略 <a class="header-anchor" href="#_6-2-处理-flaky-的三种策略" aria-label="Permalink to &quot;6.2 处理 flaky 的三种策略&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>策略一:自动 retry(危险)</span></span>
<span class="line"><span>  - retry 一次过了就算过</span></span>
<span class="line"><span>  - 治标不治本,把 flaky 隐藏起来</span></span>
<span class="line"><span>  - 适合:新接入的测试 grace period</span></span>
<span class="line"><span>  - 红线:不能成为长期方案,&gt; 3 次 retry 就是设计错误</span></span>
<span class="line"><span></span></span>
<span class="line"><span>策略二:quarantine(隔离)</span></span>
<span class="line"><span>  - 测试被识别为 flaky → 移到 &quot;flaky 池&quot;</span></span>
<span class="line"><span>  - flaky 池的测试不阻塞 PR</span></span>
<span class="line"><span>  - 但有 owner / 有 deadline 修复</span></span>
<span class="line"><span>  - 适合:发现 flaky 又一时修不了</span></span>
<span class="line"><span>  - 红线:flaky 池不能变成&quot;测试垃圾场&quot;,每周 review</span></span>
<span class="line"><span></span></span>
<span class="line"><span>策略三:删除(终极)</span></span>
<span class="line"><span>  - 修不了 / 没人修 / 已经过时</span></span>
<span class="line"><span>  - 直接删</span></span>
<span class="line"><span>  - 适合:测试本身已经没价值</span></span>
<span class="line"><span>  - 红线:删之前确认它原本要测什么</span></span></code></pre></div><p><strong>反对的态度</strong>:&quot;flaky test 跑不了就关掉它&quot;——<strong>关掉本身没错,但要记账</strong>。我见过团队两年内 quarantine 了 200 个测试,没一个修过,最后 quarantine 池变成了&quot;测试墓地&quot;,真出 bug 这 200 个测试一个也没拦住。</p><h3 id="_6-3-怎么判定一个测试是不是-flaky" tabindex="-1">6.3 怎么判定一个测试是不是 flaky <a class="header-anchor" href="#_6-3-怎么判定一个测试是不是-flaky" aria-label="Permalink to &quot;6.3 怎么判定一个测试是不是 flaky&quot;">​</a></h3><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># .github/workflows/flaky-detector.yml(示意)</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 每天凌晨把昨天的 CI 跑 5 遍同样的 commit,</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 如果失败率 &gt; 5%,标记为 flaky</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">flaky-detector</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">on</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  schedule</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [{</span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">cron</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;0 2 * * *&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}]</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">jobs</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  detect</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    strategy</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      matrix</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        run</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">1</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">2</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">3</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">4</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">5</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    steps</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">uses</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">actions/checkout@v4</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        with</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: { </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">ref</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">$</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">{{ </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">github.event.repository.default_branch</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> }} }</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">run</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">./run-tests.sh</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        continue-on-error</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">true</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">run</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">./record-result.sh \${{ matrix.run }} \${{ job.status }}</span></span></code></pre></div><p><strong>关键指标</strong>:某个测试在最近 100 次运行中,失败率 &gt; 5% 且不是因为代码改动 → flaky。</p><h3 id="_6-4-真正治根-让测试本身不-flaky" tabindex="-1">6.4 真正治根:让测试本身不 flaky <a class="header-anchor" href="#_6-4-真正治根-让测试本身不-flaky" aria-label="Permalink to &quot;6.4 真正治根:让测试本身不 flaky&quot;">​</a></h3><p>flaky 的常见根因:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 时间相关       — 用 sleep(100) 等异步完成,机器慢就挂</span></span>
<span class="line"><span>                    修复:用 condition 等待,不要 sleep</span></span>
<span class="line"><span>2. 顺序相关       — testA 跑完污染了 DB,testB 才能过</span></span>
<span class="line"><span>                    修复:每个 test 独立 fixture,跑前清场</span></span>
<span class="line"><span>3. 共享状态       — 多个 test 共享全局变量</span></span>
<span class="line"><span>                    修复:用 t.Parallel() 不安全的别共享</span></span>
<span class="line"><span>4. 外部依赖       — 真调第三方 API,网络抖一下挂了</span></span>
<span class="line"><span>                    修复:mock 外部依赖,只在 contract test 真调</span></span>
<span class="line"><span>5. 时区 / locale   — 本地 CST,CI runner UTC</span></span>
<span class="line"><span>                    修复:测试里固定 timezone</span></span>
<span class="line"><span>6. 端口冲突       — 测试用固定端口,跟另一个测试冲突</span></span>
<span class="line"><span>                    修复:用 ephemeral port</span></span>
<span class="line"><span>7. 资源竞争       — CPU 满了,timeout 触发</span></span>
<span class="line"><span>                    修复:CI runner 别跑满,加 timeout 余量</span></span></code></pre></div><p><strong>经验</strong>:<strong>flaky test 几乎都能修,只是没人愿意花一下午修一个测试</strong>。但每个没修的 flaky test 都是未来 CFR 的一颗雷。</p><hr><h2 id="七、gitflow-vs-trunk-based-中型团队的分支策略" tabindex="-1">七、GitFlow vs Trunk-based:中型团队的分支策略 <a class="header-anchor" href="#七、gitflow-vs-trunk-based-中型团队的分支策略" aria-label="Permalink to &quot;七、GitFlow vs Trunk-based:中型团队的分支策略&quot;">​</a></h2><h3 id="_7-1-gitflow-老派" tabindex="-1">7.1 GitFlow(老派) <a class="header-anchor" href="#_7-1-gitflow-老派" aria-label="Permalink to &quot;7.1 GitFlow(老派)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>master  ────────●────────────────●─────  (生产,tag v1.0 / v1.1)</span></span>
<span class="line"><span>                │                │</span></span>
<span class="line"><span>release ──────●─┴──────────────●─┴─────  (准备发版的分支)</span></span>
<span class="line"><span>              │                │</span></span>
<span class="line"><span>develop ──●───┴───●───●─●──────┴─●─●───  (开发主干)</span></span>
<span class="line"><span>          │       │   │ │        │ │</span></span>
<span class="line"><span>feature   │ ●─────┘   │ │        │ │</span></span>
<span class="line"><span>          ●─────●─────┘ │        │ │</span></span>
<span class="line"><span>                        ● hotfix │ │</span></span>
<span class="line"><span></span></span>
<span class="line"><span>五种分支:master / develop / feature / release / hotfix</span></span>
<span class="line"><span>特征:feature → develop → release → master,每个 release 是&quot;批&quot;发布</span></span></code></pre></div><p><strong>适合</strong>:季度发版的桌面软件 / 嵌入式 / On-premise。<strong>不适合</strong>:&quot;每天发 N 次&quot;的 SaaS / 微服务,分支管理复杂、merge 冲突频繁、release 跟 develop 严重 diverge。</p><h3 id="_7-2-trunk-based-short-lived-branch-现代主流" tabindex="-1">7.2 Trunk-based + Short-lived branch(现代主流) <a class="header-anchor" href="#_7-2-trunk-based-short-lived-branch-现代主流" aria-label="Permalink to &quot;7.2 Trunk-based + Short-lived branch(现代主流)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>main  ──●──●──●──●──●──●──●──●──●──●──●──●──●─────</span></span>
<span class="line"><span>        │     │     │        │        │</span></span>
<span class="line"><span>        │     │     │        │        ●─ feat-d (1 天)</span></span>
<span class="line"><span>        │     │     │        ●─ feat-c (半天)</span></span>
<span class="line"><span>        │     │     ●─ feat-b (1 天)</span></span>
<span class="line"><span>        │     ●─ feat-a (1 天)</span></span>
<span class="line"><span>        ●─ hotfix (1 小时)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>特征:</span></span>
<span class="line"><span>  - 只有一个长期分支 main</span></span>
<span class="line"><span>  - feature 分支生命周期 &lt; 2 天</span></span>
<span class="line"><span>  - 每个 PR 小、快速 merge</span></span>
<span class="line"><span>  - 未完成的功能用 Feature Flag 隐藏(下一篇 22 讲)</span></span></code></pre></div><p><strong>优点</strong>:</p><ul><li>合并冲突极少</li><li>main 始终可发布</li><li>工程师 context switch 少</li><li>配合 Feature Flag,可以 &quot;merge 但不发布&quot;</li></ul><p><strong>缺点</strong>:</p><ul><li>必须有完整 CI/CD 兜底,不然 main 容易脏</li><li>需要 Feature Flag 体系支持</li><li>团队纪律要求高(不能开 long-lived branch)</li></ul><h3 id="_7-3-中型团队怎么选" tabindex="-1">7.3 中型团队怎么选 <a class="header-anchor" href="#_7-3-中型团队怎么选" aria-label="Permalink to &quot;7.3 中型团队怎么选&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>团队 / 业务类型                推荐</span></span>
<span class="line"><span>─────────────────────────────────────────────────────────</span></span>
<span class="line"><span>SaaS / 微服务 / 高频发布      Trunk-based + Feature Flag</span></span>
<span class="line"><span>开源软件 / 库                 类 GitFlow(release 分支)</span></span>
<span class="line"><span>On-premise 软件 / 季度发布    GitFlow</span></span>
<span class="line"><span>游戏 / 客户端                 GitFlow + release 分支</span></span>
<span class="line"><span>中型团队 100 微服务 5000 QPS   Trunk-based(本系列默认)</span></span></code></pre></div><p><strong>我的立场</strong>:<strong>中型团队 99% 应该用 trunk-based</strong>。GitFlow 在 SaaS 场景下是技术债——它的 release 分支带来的 merge / cherry-pick 工作量,远超它带来的&quot;批发布&quot;价值。但 Trunk-based 不是免费的,<strong>它依赖 Feature Flag 把&quot;不可见的功能&quot;和&quot;已发布的代码&quot;解耦</strong>——所以第 22 篇要专门讲 Feature Flag 工程。</p><hr><h2 id="八、最小可用的一段-github-actions" tabindex="-1">八、最小可用的一段 GitHub Actions <a class="header-anchor" href="#八、最小可用的一段-github-actions" aria-label="Permalink to &quot;八、最小可用的一段 GitHub Actions&quot;">​</a></h2><p>下面这段不是&quot;完整模板&quot;,<strong>是最小可用的工程级配置</strong>,看清楚每一行为什么写:</p><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># .github/workflows/ci.yml</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">CI</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">on</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  push</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    branches</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">main</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  pull_request</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 同一个 PR 新 push 时,把旧的 CI 自动取消,省 runner 时间</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">concurrency</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  group</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">ci-\${{ github.workflow }}-\${{ github.ref }}</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  cancel-in-progress</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">\${{ github.event_name == &#39;pull_request&#39; }}</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">permissions</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  contents</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">read</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  packages</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">write</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  id-token</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">write</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">              # OIDC,后面给 cosign 签名用</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">jobs</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  # ----- PR-time:5 分钟内出结果 -----</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  lint</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    runs-on</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">ubuntu-latest</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    timeout-minutes</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">5</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">         # 必须设 timeout,防 hang</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    steps</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">uses</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">actions/checkout@v4</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">uses</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">actions/setup-go@v5</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        with</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: { </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">go-version</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;1.22&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">cache</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">true</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> }</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">run</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">go vet ./...</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">run</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">gofmt -l . | tee /dev/stderr | (! read)</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  # 有未格式化文件就挂</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  unit-test</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    runs-on</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">ubuntu-latest</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    timeout-minutes</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">10</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    steps</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">uses</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">actions/checkout@v4</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">uses</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">actions/setup-go@v5</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        with</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: { </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">go-version</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;1.22&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">cache</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">true</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> }</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">run</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">go test -race -timeout 5m -coverprofile=cov.out ./...</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">uses</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">actions/upload-artifact@v4</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        with</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: { </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">coverage</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">path</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">cov.out</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">retention-days</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">7</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> }</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  # ----- merge-time:只在 main push 才跑 -----</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  build-and-push</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    needs</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">lint</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">unit-test</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    if</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">github.event_name == &#39;push&#39; &amp;&amp; github.ref == &#39;refs/heads/main&#39;</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    runs-on</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">ubuntu-latest</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    timeout-minutes</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">15</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    steps</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">uses</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">actions/checkout@v4</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">uses</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">docker/setup-buildx-action@v3</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">uses</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">docker/login-action@v3</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        with</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          registry</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">ghcr.io</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          username</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">\${{ github.actor }}</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          password</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">\${{ secrets.GITHUB_TOKEN }}</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">uses</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">docker/build-push-action@v6</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        with</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          push</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">true</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          tags</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">|</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            ghcr.io/\${{ github.repository }}:sha-\${{ github.sha }}</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            ghcr.io/\${{ github.repository }}:main</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          cache-from</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">type=gha</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">          # GitHub Actions 内置 buildx cache</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          cache-to</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:   </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">type=gha,mode=max</span></span></code></pre></div><p><strong>关键取舍</strong>:</p><ol><li><strong><code>concurrency</code> + <code>cancel-in-progress</code></strong> —— 同 PR 多次 push 时取消旧 CI,<strong>省 runner 时间 + 给反馈更快</strong></li><li><strong><code>timeout-minutes</code></strong> —— 每个 job 必须设,<strong>防止 hang job 占 runner 数小时</strong></li><li><strong><code>permissions</code> 最小化</strong> —— 不写则默认全开,<strong>安全红线</strong></li><li><strong>PR-time 只跑 lint + unit,merge-time 才 build push</strong> —— 分层</li><li><strong><code>if: github.ref == &#39;refs/heads/main&#39;</code></strong> —— build 只在 main 跑,<strong>PR 上不推 image</strong></li><li><strong>tag 用 sha,不用 latest</strong> —— <code>latest</code> 是后面踩坑章节的红线之一</li><li><strong><code>-race</code> flag</strong> —— Go 必带,<strong>找并发 bug</strong></li><li><strong>gofmt 检查用 <code>| (! read)</code></strong> —— 有任何输出就 fail</li></ol><p><strong>没在这份配置里的东西</strong>(在 merge-time 或更后):</p><ul><li>镜像签名(下一篇 19 讲)</li><li>SBOM 生成(下一篇 19 讲)</li><li>漏洞扫描(下一篇 19 讲)</li><li>部署 dev / staging(下下篇 20 讲 GitOps)</li><li>渐进发布(21 讲)</li></ul><p>这一篇 yaml 故意只到&quot;build + push image&quot;,<strong>后面三篇会一层层把这条 pipeline 补完</strong>。</p><hr><h2 id="九、ci-cd-的-7-条踩坑" tabindex="-1">九、CI/CD 的 7 条踩坑 <a class="header-anchor" href="#九、ci-cd-的-7-条踩坑" aria-label="Permalink to &quot;九、CI/CD 的 7 条踩坑&quot;">​</a></h2><p>实战里我和同事撞过的坑,按惨烈程度排序:</p><h3 id="_9-1-secret-进代码-进镜像" tabindex="-1">9.1 Secret 进代码 / 进镜像 <a class="header-anchor" href="#_9-1-secret-进代码-进镜像" aria-label="Permalink to &quot;9.1 Secret 进代码 / 进镜像&quot;">​</a></h3><div class="language-dockerfile vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">dockerfile</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 反例</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">ENV</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> DATABASE_URL=postgres://user:Pa55w0rd!@db:5432/prod   # 进镜像层</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">RUN</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> curl -u admin:secret https://internal-api/...         # 进 build log + layer history</span></span></code></pre></div><p><strong>修复</strong>:build 阶段用 BuildKit <code>--mount=type=secret</code>(不进 layer);运行时用 K8s Secret + envFrom(不进镜像);CI 里用 <code>\${{ secrets.X }}</code>,<strong>不要 echo / 不要写文件</strong>;git push 前用 gitleaks 扫。</p><h3 id="_9-2-缓存-poisoning" tabindex="-1">9.2 缓存 poisoning <a class="header-anchor" href="#_9-2-缓存-poisoning" aria-label="Permalink to &quot;9.2 缓存 poisoning&quot;">​</a></h3><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 反例:缓存 key 太粗</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">- </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">uses</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">actions/cache@v4</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  with</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: { </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">path</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">./build</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">key</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">build-cache</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> }   </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 所有分支共用 cache → PR 的恶意代码进缓存</span></span></code></pre></div><p><strong>机制</strong>:GitHub Actions / GitLab CI 都有&quot;PR 也能写缓存&quot;的设计,<strong>恶意 fork 可以 poison 主分支的 cache</strong>。<strong>修复</strong>:缓存 key 带分支名 / commit hash;<code>restore-keys</code> 谨慎用;不缓存 build 产物只缓存依赖(<code>.m2</code> / <code>node_modules</code>);PR cache 和 main cache 隔离。</p><blockquote><p>2024 年 GitHub 出过多起 Action Cache poisoning 相关 CVE。</p></blockquote><h3 id="_9-3-runner-单点" tabindex="-1">9.3 Runner 单点 <a class="header-anchor" href="#_9-3-runner-单点" aria-label="Permalink to &quot;9.3 Runner 单点&quot;">​</a></h3><p><strong>反模式</strong>:整个公司就一个自托管 runner——挂了全公司 CI 停;secrets 全集中一台,一旦被攻破全公司泄露;维护更新要&quot;停服窗口&quot;。<strong>修复</strong>:runner 池化(至少 3 台 N+1 容灾);按环境隔离(dev runner / prod runner secrets 不共享);ephemeral(<code>ephemeral: true</code> 每次起新容器);K8s 上用 Actions Runner Controller(ARC)自动扩缩容。</p><h3 id="_9-4-pr-time-跟-merge-time-没分" tabindex="-1">9.4 PR-time 跟 merge-time 没分 <a class="header-anchor" href="#_9-4-pr-time-跟-merge-time-没分" aria-label="Permalink to &quot;9.4 PR-time 跟 merge-time 没分&quot;">​</a></h3><p><strong>反例</strong>:所有 trigger 跑同一个 pipeline,PR 上跑了 15 分钟的 E2E + 镜像构建 + 推 registry,<strong>结果 PR 没 merge 就把镜像推上去</strong>,下游 GitOps 看到新 tag 直接部署 dev。<strong>修复</strong>:<strong>PR-time 不 push 镜像,不部署任何环境</strong>。前面 yaml 的 <code>if: github.ref == &#39;refs/heads/main&#39;</code> 就是这意思。</p><h3 id="_9-5-20-分钟没人审" tabindex="-1">9.5 &gt; 20 分钟没人审 <a class="header-anchor" href="#_9-5-20-分钟没人审" aria-label="Permalink to &quot;9.5 &gt; 20 分钟没人审&quot;">​</a></h3><p><strong>反模式</strong>:CI 自动 retry 大法——挂了 re-run、再挂 re-run、第三次过 merge,<strong>没人去看为什么挂了</strong>。<strong>修复</strong>:flaky test quarantine 制度;re-run &gt; 2 次必须人审;CI 失败 &gt; 20 分钟没人 ack 升级到团队 Slack。</p><h3 id="_9-6-无快速回滚路径" tabindex="-1">9.6 无快速回滚路径 <a class="header-anchor" href="#_9-6-无快速回滚路径" aria-label="Permalink to &quot;9.6 无快速回滚路径&quot;">​</a></h3><p><strong>反模式</strong>:CD 流水线 30 分钟,回滚也 30 分钟——改 image tag、跑 CI、build、push、deploy……用户骂街。<strong>正确</strong>:回滚 = 改 GitOps 仓库里的 image tag 回上一版本 + ArgoCD sync,<strong>3 分钟</strong>。因为镜像 Build once,旧版本镜像还在 registry,<strong>回滚不需要重新构建</strong>。</p><p><strong>精髓</strong>:<strong>回滚速度是发布速度的下限</strong>——不能比&quot;前向发布&quot;慢。下下篇 20 讲 GitOps 时会把这条落地。</p><h3 id="_9-7-把-ci-当成-运行环境" tabindex="-1">9.7 把 CI 当成&quot;运行环境&quot; <a class="header-anchor" href="#_9-7-把-ci-当成-运行环境" aria-label="Permalink to &quot;9.7 把 CI 当成&quot;运行环境&quot;&quot;">​</a></h3><p><strong>反例</strong>:在 CI 里跑生产数据库连接、跑监控数据查询——CI 跑得越来越慢,某天某个外部依赖挂了,<strong>CI 全挂</strong>。<strong>正确</strong>:CI 是&quot;代码验证&quot;环境,所有依赖可重现(testcontainers / mock);不依赖生产数据库 / 配置中心 / 监控;<strong>跑完不留状态,可重入</strong>。</p><hr><h2 id="十、何时不该用-以及-该用但要降级-的场景" tabindex="-1">十、何时不该用(以及&quot;该用但要降级&quot;的场景) <a class="header-anchor" href="#十、何时不该用-以及-该用但要降级-的场景" aria-label="Permalink to &quot;十、何时不该用(以及&quot;该用但要降级&quot;的场景)&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>不该上完整 CI/CD:</span></span>
<span class="line"><span>  - 单人项目 / 周末实验 → 一个 lint + format hook 够了</span></span>
<span class="line"><span>  - 短期 hackathon / POC → 最简单 GitHub Actions 跑测试就行</span></span>
<span class="line"><span>  - 客户端 / 嵌入式 / 编译型分发 → CD 需要完全不同的设计</span></span>
<span class="line"><span></span></span>
<span class="line"><span>该上但要降级:</span></span>
<span class="line"><span>  团队 1-3 人,&lt; 10 服务:</span></span>
<span class="line"><span>    - CI 只跑 lint + unit,手动 kubectl apply</span></span>
<span class="line"><span>    - 不分 PR-time / merge-time,不上 SBOM / 镜像签名</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  团队 3-10 人,10-50 服务:</span></span>
<span class="line"><span>    - 分层 CI(commit / PR / merge)</span></span>
<span class="line"><span>    - GitOps 起步,单仓库单环境</span></span>
<span class="line"><span>    - 镜像签名 + SBOM 起步,不上 OPA 拦截</span></span>
<span class="line"><span>    - 渐进发布从&quot;灰度 10%&quot;起步</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  团队 10-50 人,50-200 服务(本系列默认):</span></span>
<span class="line"><span>    - 完整 CI/CD 分层 + GitOps 多环境 promote</span></span>
<span class="line"><span>    - 镜像签名 + SBOM + 漏洞扫描 + 准入控制</span></span>
<span class="line"><span>    - 渐进发布 + 自动 rollback + Feature Flag</span></span></code></pre></div><p><strong>工具不是文化的替代品</strong>。反对的态度:&quot;我们上了 ArgoCD / GitHub Actions,CI/CD 就完事了。&quot;<strong>真相</strong>:CI 跑了 ≠ 测试有效(单测全是 <code>assert.True(true)</code> 也能 90% 覆盖率),CD 部署了 ≠ 发布稳(没有渐进发布的 CD 就是&quot;快速把 bug 推上 prod&quot;),GitOps 接了 ≠ 发布安全(Secret 明文进 Git,GitOps 持续同步它到所有集群)。<strong>工具是流程的骨架,流程是文化的载体</strong>。</p><hr><h2 id="十一、ci-cd-心智-checklist" tabindex="-1">十一、CI/CD 心智 checklist <a class="header-anchor" href="#十一、ci-cd-心智-checklist" aria-label="Permalink to &quot;十一、CI/CD 心智 checklist&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>CI 设计:</span></span>
<span class="line"><span>  - 总延迟 &lt; 10 分钟,PR-time &lt; 5 分钟</span></span>
<span class="line"><span>  - 分层 trigger:commit / PR / merge / release 各有边界</span></span>
<span class="line"><span>  - 缓存命中率 &gt; 80%,依赖 / build / layer 都缓存</span></span>
<span class="line"><span>  - 并行而不是串行(lint / test / build 同时跑)</span></span>
<span class="line"><span>  - 每个 job 设 timeout-minutes,permissions 最小化</span></span>
<span class="line"><span></span></span>
<span class="line"><span>CD 设计:</span></span>
<span class="line"><span>  - Build once, deploy many,镜像 hash 走完所有环境</span></span>
<span class="line"><span>  - 镜像 tag 用 sha 或 version,不用 latest / 浮动 tag</span></span>
<span class="line"><span>  - 环境差异在容器外(ConfigMap / Secret / env)</span></span>
<span class="line"><span>  - 回滚速度 ≤ 发布速度</span></span>
<span class="line"><span>  - PR 上不推 image,不部署任何环境</span></span>
<span class="line"><span>  - CD 触发由人审批或 GitOps reconcile,不要&quot;merge 即上 prod&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>测试:</span></span>
<span class="line"><span>  - 金字塔:单测 70% / 集成 20% / E2E 10%</span></span>
<span class="line"><span>  - 集成测试用 testcontainers,不起整个 K8s</span></span>
<span class="line"><span>  - E2E 不进 PR,挪到 merge-time 或 nightly</span></span>
<span class="line"><span>  - flaky test 有 quarantine 制度 + owner + deadline</span></span>
<span class="line"><span>  - re-run &gt; 2 次必须人审</span></span>
<span class="line"><span></span></span>
<span class="line"><span>分支策略:</span></span>
<span class="line"><span>  - trunk-based + short-lived branch</span></span>
<span class="line"><span>  - 未完成功能用 Feature Flag,不开 long-lived branch</span></span>
<span class="line"><span>  - main 始终可发布,PR &lt; 1 天周转</span></span>
<span class="line"><span></span></span>
<span class="line"><span>安全:</span></span>
<span class="line"><span>  - Secret 不进代码 / 镜像 / build log</span></span>
<span class="line"><span>  - pre-commit + CI 双层 gitleaks 扫描</span></span>
<span class="line"><span>  - runner 池化 + ephemeral</span></span>
<span class="line"><span>  - dev / staging / prod runner 隔离</span></span>
<span class="line"><span>  - PR cache 和 main cache 隔离</span></span></code></pre></div><hr><h2 id="十二、踩坑提醒" tabindex="-1">十二、踩坑提醒 <a class="header-anchor" href="#十二、踩坑提醒" aria-label="Permalink to &quot;十二、踩坑提醒&quot;">​</a></h2><ol><li><strong>CI 跑 &gt; 30 分钟</strong>——团队会本能绕过,CI 这层防线废</li><li><strong>PR-time 跟 merge-time 没分层</strong>——浪费时间 + PR 上误推镜像</li><li><strong>E2E 占测试 80%</strong>——慢 + flaky,把 CI 变成赌博</li><li><strong>flaky test 用 retry 大法</strong>——CFR 的最大隐性来源</li><li><strong>每个环境重新构建镜像</strong>——dev / staging / prod 跑的不是同一个二进制</li><li><strong>image tag 用 <code>latest</code></strong>——下次部署不知道部的是哪个版本,出事查不清</li><li><strong>环境差异烤进镜像</strong>(<code>ENV DB_HOST=...</code>)——Build once 立刻破功</li><li><strong>Secret 进 Dockerfile / CI log</strong>——一次泄露全盘皆输</li><li><strong>缓存 key 太宽</strong>——PR poisoning 主分支 cache</li><li><strong>runner 单点</strong>——挂了全公司停发布</li><li><strong>CI 依赖生产环境</strong>——生产抖 CI 挂,完全反了</li><li><strong>CD 自动上 prod 没有渐进发布</strong>——merge 即上 prod 等于赌博</li><li><strong>回滚需要重新构建</strong>——MTTR 拉长</li><li><strong><code>-target</code> / 局部 CI 在生产</strong>——状态失同步</li><li><strong>把 GitOps / 渐进发布 / Feature Flag 都当&quot;未来再说&quot;</strong>——这三个都是 CI/CD 的必要组件,不是 nice-to-have</li></ol><hr><h2 id="十三、小结" tabindex="-1">十三、小结 <a class="header-anchor" href="#十三、小结" aria-label="Permalink to &quot;十三、小结&quot;">​</a></h2><p>回到开篇的那句口诀——<strong>CI 的核心 KPI 不是覆盖率,是延迟</strong>。这一篇所有的工程结论都围绕这条线展开:</p><ol><li><strong>CI 和 CD 是两件事</strong>:一个判定&quot;能不能合&quot;,一个判定&quot;能不能发&quot;,<strong>用制品衔接,不要串成一根线</strong></li><li><strong>流水线分层</strong>:commit / PR / merge / release 四层,各有延迟预算</li><li><strong>Build once, deploy many</strong>:一个镜像 hash 走完所有环境,差异在容器外</li><li><strong>测试金字塔</strong>:单测 70% / 集成 20% / E2E 10%,E2E 不进 PR</li><li><strong>Flaky test 是 CFR 的主要隐性来源</strong>:不能用 re-run 大法,要有 quarantine 制度</li><li><strong>Trunk-based + short-lived branch + Feature Flag</strong>:中型团队的默认选择</li><li><strong>CI 必须 &lt; 10 分钟</strong>:这是工程纪律,不是品味</li></ol><p><strong>CI/CD 不是工具,是发布纪律</strong>。一支团队对发布的纪律,直接决定 Change Failure Rate / MTTR 这两个数字——而这两个数字,是这个系列贯穿全篇的暗线。</p><hr><p>下一篇:<strong><code>19-制品仓库与镜像供应链.md</code></strong>——讲完 CI 这条线,<strong>这一篇产出的&quot;镜像&quot;是个易碎品</strong>。SolarWinds / codecov / xz-utils 这些供应链投毒事件告诉我们,<strong>&quot;我构建的镜像&quot;和&quot;集群里真在跑的镜像&quot;中间还有几公里的路</strong>——Harbor / cosign / SBOM / Kyverno 准入控制,这条链路上的每一环都可能被打穿。<strong>这一篇专讲镜像维度的供应链安全</strong>。</p>`,157)])])}const d=a(l,[["render",t]]);export{c as __pageData,d as default};
