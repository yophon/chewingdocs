import{c as a,Q as n,j as i,m as p}from"./chunks/framework.CBiVa4O3.js";const o=JSON.parse('{"title":"任务运行器选型:make build make test 是 50 年错位的肌肉记忆","description":"","frontmatter":{},"headers":[],"relativePath":"../terminalLearning/28-任务运行器选型.md","filePath":"../terminalLearning/28-任务运行器选型.md","lastUpdated":1778574438000}'),l={name:"../terminalLearning/28-任务运行器选型.md"};function e(t,s,h,k,c,d){return n(),i("div",null,[...s[0]||(s[0]=[p(`<h1 id="任务运行器选型-make-build-make-test-是-50-年错位的肌肉记忆" tabindex="-1">任务运行器选型:<code>make build</code> <code>make test</code> 是 50 年错位的肌肉记忆 <a class="header-anchor" href="#任务运行器选型-make-build-make-test-是-50-年错位的肌肉记忆" aria-label="Permalink to &quot;任务运行器选型:\`make build\` \`make test\` 是 50 年错位的肌肉记忆&quot;">​</a></h1><p>打开任意一个 2026 年的开源项目根目录,十有八九有一个 <code>Makefile</code>,里面长这样:</p><div class="language-makefile vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">makefile</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">.PHONY</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: build test lint deploy clean</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">build</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">	go build -o bin/app</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">test</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">	go test ./...</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">lint</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">	golangci-lint run</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">deploy</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">	./scripts/deploy.sh</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">clean</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">	rm -rf bin/</span></span></code></pre></div><p><strong>「程序员的肌肉记忆」</strong>——你 clone 项目,先敲一个 <code>make test</code> 看能不能跑;部署上 prod,敲 <code>make deploy</code>;清理本地缓存,敲 <code>make clean</code>。这套姿势从你第一份工作传到现在,十年没换过。</p><p><strong>真相是</strong>:<strong>Make 是 1977 年 Stuart Feldman 在贝尔实验室为 C 编译设计的「依赖驱动增量构建工具」</strong>——它的核心能力是「<strong>源文件比目标文件新就重编,否则跳过</strong>」,这套机制是用来管 <code>.c → .o → .a → 可执行文件</code> 的依赖图。<strong>你写的 <code>make deploy</code>、<code>make test</code>、<code>make clean</code> 这些 target,既不是构建,也不依赖时间戳,本质上是</strong>「<strong>给一个 shell 脚本起个短名字</strong>」——但你借了 Make 这个工具来管它,<strong>只是因为整个行业的肌肉记忆停留在 1977 年没人换</strong>。</p><p><strong>这是「任务运行器」和「构建工具」被混淆了 50 年的产物</strong>。Make 同时干这两件事(增量构建 + 命令快捷方式),用户分不清,大家用 Make 写 <code>make deploy</code> 也不觉得有问题——直到你想给 deploy 加一个参数(<code>make deploy ENV=prod</code> 这种 <code>VAR=val</code> 语法奇怪)、想列出所有可跑的命令(<code>make --help</code> 不会列你的 target,要自己写 awk 解析 Makefile)、想跨平台(GNU make 和 BSD make 行为不一致)、想在命令前面写一段非 shell 脚本(<code>#!/usr/bin/env python</code> 在 Makefile 里要 tab 缩进还要转义),才发现这工具不是给&quot;任务&quot;设计的。</p><blockquote><p>一句话先记住:<strong>Make 不是任务运行器,是依赖驱动的增量构建工具——用 Make 写 <code>make deploy</code> 是 50 年错位的产物,在 2026 年应该停止</strong>。<strong>2026 年的标配</strong>:<strong>任务</strong>(<code>just test</code> / <code>just deploy</code> / <code>just bench</code>)用 <strong>just</strong>(主推)或 <strong>mise tasks</strong>(已有 mise 时顺带),<strong>构建</strong>(<code>.c → .o</code>、<code>.tex → .pdf</code>、文档生成依赖图)继续用 <strong>make</strong> 或语言原生(<code>cargo build</code> / <code>go build</code> / <code>bazel build</code>)。<strong>两件事分清楚,工具各司其职</strong>——你不会在 2026 年继续用 <code>sed</code> 当 JSON 编辑器,但 80% 的项目还在用 Make 当任务运行器。</p></blockquote><p>这一篇拆开讲:<strong>任务运行器 vs 构建工具的本质差别、五个候选(Make / Just / Task / mise / npm)的对比矩阵、Just 深度教程(主推)、Make 仍然不可替代的场景、Task(YAML 派)、mise tasks(已有 mise 时顺带)、npm scripts 的局限、按项目类型选型、50 行生产级 Justfile 模板、从 Makefile 迁 Justfile 的五步法、TUI 集成(just --choose + fzf)、反对的写法、看完应该能</strong>。<strong>这是 2026 年「项目根有一个能用 5 年的任务清单」的最少工程量</strong>。</p><hr><h2 id="一、任务运行器-vs-构建工具-50-年没分清的两件事" tabindex="-1">一、任务运行器 vs 构建工具:50 年没分清的两件事 <a class="header-anchor" href="#一、任务运行器-vs-构建工具-50-年没分清的两件事" aria-label="Permalink to &quot;一、任务运行器 vs 构建工具:50 年没分清的两件事&quot;">​</a></h2><h3 id="_1-1-两件事到底差在哪" tabindex="-1">1.1 两件事到底差在哪 <a class="header-anchor" href="#_1-1-两件事到底差在哪" aria-label="Permalink to &quot;1.1 两件事到底差在哪&quot;">​</a></h3><p>把 Make 这一个工具同时干的两件事拆开:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌──────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  构建工具(Build Tool)                                       │</span></span>
<span class="line"><span>├──────────────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>│  核心问题:  从「源」到「产物」要怎么编译                      │</span></span>
<span class="line"><span>│  核心机制:  依赖图 + 时间戳 + 增量重建                        │</span></span>
<span class="line"><span>│  典型操作:  比 .c 和 .o 的 mtime,新的就重编                  │</span></span>
<span class="line"><span>│  典型工具:  make / bazel / ninja / cargo / go build / esbuild │</span></span>
<span class="line"><span>│  典型用例:  C/C++ 编译、Rust crate、文档 → PDF、ML 数据 pipeline │</span></span>
<span class="line"><span>│                                                              │</span></span>
<span class="line"><span>│  关键判据:  是不是「同样的输入 → 跳过」的语义?               │</span></span>
<span class="line"><span>│           如果是,你需要构建工具                            │</span></span>
<span class="line"><span>└──────────────────────────────────────────────────────────────┘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>┌──────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  任务运行器(Task Runner)                                    │</span></span>
<span class="line"><span>├──────────────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>│  核心问题:  项目里能做哪些事,怎么一行命令跑起来              │</span></span>
<span class="line"><span>│  核心机制:  字符串名 → 一段 shell / 脚本                      │</span></span>
<span class="line"><span>│  典型操作:  \`just deploy\` 跑 ./scripts/deploy.sh             │</span></span>
<span class="line"><span>│  典型工具:  just / task / mise tasks / npm scripts          │</span></span>
<span class="line"><span>│  典型用例:  跑测试、部署、清理、起 dev server、跑 lint        │</span></span>
<span class="line"><span>│                                                              │</span></span>
<span class="line"><span>│  关键判据:  是不是「每次都从头跑一遍,不在乎重复」?           │</span></span>
<span class="line"><span>│           如果是,你需要任务运行器                          │</span></span>
<span class="line"><span>└──────────────────────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>这两件事在 1977 年的 C 项目里是合体的</strong>——你的&quot;任务&quot;就是&quot;编译&quot;,编译又需要依赖图,Make 一个工具搞定。<strong>但 2026 年的项目里,99% 的&quot;任务&quot;和&quot;编译&quot;是分开的</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>现代项目的任务清单(以 Rust web 服务为例):</span></span>
<span class="line"><span>   ┌─────────────────────────────────────────────────┐</span></span>
<span class="line"><span>   │ test       cargo test                ← 构建?算半个,cargo 自己管 │</span></span>
<span class="line"><span>   │ build      cargo build --release     ← 构建,但 cargo 全管了      │</span></span>
<span class="line"><span>   │ run        cargo run                 ← 任务                       │</span></span>
<span class="line"><span>   │ migrate    sqlx migrate run          ← 任务                       │</span></span>
<span class="line"><span>   │ docker     docker build -t app .     ← 任务                       │</span></span>
<span class="line"><span>   │ deploy     ./scripts/deploy.sh prod  ← 任务                       │</span></span>
<span class="line"><span>   │ bench      hyperfine &#39;./target/...&#39;  ← 任务                       │</span></span>
<span class="line"><span>   │ clean      cargo clean &amp;&amp; rm -rf ... ← 任务                       │</span></span>
<span class="line"><span>   │ logs-prod  kubectl logs ...          ← 任务                       │</span></span>
<span class="line"><span>   │ db-shell   psql $DATABASE_URL        ← 任务                       │</span></span>
<span class="line"><span>   └─────────────────────────────────────────────────┘</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   10 条命令,9 条是「任务」(每次从头跑),1 条 cargo 自己管增量</span></span>
<span class="line"><span>   你需要的是任务运行器,不是构建工具</span></span></code></pre></div><p><strong>结论</strong>:<strong>用 Make 来管这 10 条命令,你完全没用上 Make 的核心能力(依赖图增量)</strong>,反而被 Make 的语法负担(Tab 缩进、<code>.PHONY</code>、<code>$@</code>、变量诡异)压得很难受。<strong>这就是错位的本质</strong>。</p><h3 id="_1-2-这种错位带来的具体痛点" tabindex="-1">1.2 这种错位带来的具体痛点 <a class="header-anchor" href="#_1-2-这种错位带来的具体痛点" aria-label="Permalink to &quot;1.2 这种错位带来的具体痛点&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. .PHONY 心智负担</span></span>
<span class="line"><span>   ─────────────────────────────────</span></span>
<span class="line"><span>   Makefile 默认认为 target 是一个文件名,会去查时间戳。</span></span>
<span class="line"><span>   你写 \`make deploy\`,Make 想:&quot;deploy 这个文件存在吗?</span></span>
<span class="line"><span>   存在的话,看看它比依赖新不新,新就跳过。&quot;</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   所以你必须在每个&quot;任务&quot;target 前加 \`.PHONY: deploy\` 声明:</span></span>
<span class="line"><span>   &quot;这不是文件,每次都跑&quot;。</span></span>
<span class="line"><span>   忘了标 .PHONY,某天恰好目录下出现一个叫 deploy 的文件夹,</span></span>
<span class="line"><span>   \`make deploy\` 就神秘地说 &quot;deploy is up to date.&quot;</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   这是 Make 把构建语义强行套在任务语义上的代价。</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. Tab 缩进</span></span>
<span class="line"><span>   ─────────────────────────────────</span></span>
<span class="line"><span>   命令行前必须是 Tab,不能是空格,这是 1977 年的语法决定。</span></span>
<span class="line"><span>   现代编辑器默认空格缩进 → 复制粘贴 Makefile 必坏。</span></span>
<span class="line"><span>   报错信息:&quot;missing separator. Stop.&quot; 完全猜不到是 tab 问题。</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. 参数语法奇怪</span></span>
<span class="line"><span>   ─────────────────────────────────</span></span>
<span class="line"><span>   想给 deploy 传环境:</span></span>
<span class="line"><span>     make deploy ENV=prod          ← 这是 Make 的语法,不直观</span></span>
<span class="line"><span>     make deploy prod              ← 不行,prod 被当成另一个 target</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   想用位置参数?没有,只能 ENV=prod。</span></span>
<span class="line"><span>   想给参数加默认值?要 \`ENV ?= staging\` 这种诡异语法。</span></span>
<span class="line"><span></span></span>
<span class="line"><span>4. --list 没有</span></span>
<span class="line"><span>   ─────────────────────────────────</span></span>
<span class="line"><span>   \`make --help\` 列的是 make 这个工具的 flag,不是你的 target。</span></span>
<span class="line"><span>   想让新人看到&quot;这个项目能跑什么&quot;,要自己写一段 awk:</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>     help:</span></span>
<span class="line"><span>         @awk &#39;BEGIN {FS = &quot;:.*## &quot;} /^[a-zA-Z_-]+:.*## / \\</span></span>
<span class="line"><span>           { printf &quot;  %-20s %s\\n&quot;, $$1, $$2 }&#39; $(MAKEFILE_LIST)</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   每个项目都要抄这段 awk → 工具没设计好的最直接证据。</span></span>
<span class="line"><span></span></span>
<span class="line"><span>5. GNU vs BSD</span></span>
<span class="line"><span>   ─────────────────────────────────</span></span>
<span class="line"><span>   Linux 系统自带 GNU make,macOS 系统自带 BSD make。</span></span>
<span class="line"><span>   \`$(shell ...)\`、\`:=\`、\`?=\` 在两边行为不一致。</span></span>
<span class="line"><span>   团队跨 Linux / macOS 必踩,某天 CI 跑 GNU 没事,本地 BSD 炸。</span></span>
<span class="line"><span></span></span>
<span class="line"><span>6. 命令前不能写非 shell 脚本</span></span>
<span class="line"><span>   ─────────────────────────────────</span></span>
<span class="line"><span>   想在某个 recipe 里跑一段 Python:</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>     analyze:</span></span>
<span class="line"><span>         #!/usr/bin/env python  ← 不行,Make 把每行当独立 shell 命令</span></span>
<span class="line"><span>         import json</span></span>
<span class="line"><span>         ...</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   要写 shebang 必须用 ONESHELL 这种黑魔法,跨版本不一致。</span></span></code></pre></div><p><strong>这 6 个痛点每一个都是「构建工具的语义被错位到任务场景」的结果</strong>——Make 没做错,是你用错了。</p><hr><h2 id="二、五个候选-对比矩阵" tabindex="-1">二、五个候选:对比矩阵 <a class="header-anchor" href="#二、五个候选-对比矩阵" aria-label="Permalink to &quot;二、五个候选:对比矩阵&quot;">​</a></h2><h3 id="_2-1-五大候选概览" tabindex="-1">2.1 五大候选概览 <a class="header-anchor" href="#_2-1-五大候选概览" aria-label="Permalink to &quot;2.1 五大候选概览&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>工具         发明年   语言       配置文件          核心定位            适合</span></span>
<span class="line"><span>─────────────────────────────────────────────────────────────────────────</span></span>
<span class="line"><span>Make         1977    C         Makefile         依赖驱动增量构建      C/C++、真增量</span></span>
<span class="line"><span>Just         2016    Rust      Justfile         运行任务              通用任务 ✅ 主推</span></span>
<span class="line"><span>Task         2017    Go        Taskfile.yml     声明式 YAML 任务      爱 YAML / k8s 风</span></span>
<span class="line"><span>mise tasks   2023    Rust      .mise.toml       已用 mise 顺带         已用 mise(看 24 篇)</span></span>
<span class="line"><span>npm scripts  2010    JS        package.json     Node 项目命令         纯 JS 简单场景</span></span></code></pre></div><h3 id="_2-2-八维评分" tabindex="-1">2.2 八维评分 <a class="header-anchor" href="#_2-2-八维评分" aria-label="Permalink to &quot;2.2 八维评分&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                 Make     Just     Task     mise tasks  npm scripts</span></span>
<span class="line"><span>──────────────────────────────────────────────────────────────────</span></span>
<span class="line"><span>语法             1977     现代      YAML     TOML        JSON</span></span>
<span class="line"><span>增量构建         ★★★★★    无        无       无          无</span></span>
<span class="line"><span>跨平台           ★★★      ★★★★★   ★★★★    ★★★★       ★★★(node)</span></span>
<span class="line"><span>学习曲线         陡       缓        缓       低          低</span></span>
<span class="line"><span>shell 嵌入       原生     原生      原生     原生        受限</span></span>
<span class="line"><span>依赖管理         原生     pre/dep   deps     deps        无</span></span>
<span class="line"><span>并行             -j       parallel  parallel parallel    npm-run-all</span></span>
<span class="line"><span>适合             构建      任务      任务     任务+env    JS 任务</span></span>
<span class="line"><span>──────────────────────────────────────────────────────────────────</span></span></code></pre></div><p><strong>读法</strong>:</p><ul><li><strong>Make</strong>:增量构建王者,但任务运行场景全是负担</li><li><strong>Just</strong>:任务运行的现代答案,语法清晰、参数干净、<code>--list</code> 内置</li><li><strong>Task</strong>:YAML 派的选择,跨平台好,但 YAML 一长就难维护</li><li><strong>mise tasks</strong>:已经用 mise 管语言版本,顺带管任务,不用多装一个工具</li><li><strong>npm scripts</strong>:Node 项目原生,但只服务 Node,字符串拼接超过 30 字就反斜杠地狱</li></ul><h3 id="_2-3-三句话决策" tabindex="-1">2.3 三句话决策 <a class="header-anchor" href="#_2-3-三句话决策" aria-label="Permalink to &quot;2.3 三句话决策&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>你项目主要做 C/C++/LaTeX 编译                    → Make(用它真正擅长的)</span></span>
<span class="line"><span>你项目是单一 Node 项目,任务 5 条以内              → npm scripts</span></span>
<span class="line"><span>你项目是 Rust/Go/Python/多语言/任何其他场景        → Just(主推)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>加分项:已经在用 mise 管多语言版本 → mise tasks 顺带,不必再装 just</span></span></code></pre></div><hr><h2 id="三、just-主推的现代答案" tabindex="-1">三、Just:主推的现代答案 <a class="header-anchor" href="#三、just-主推的现代答案" aria-label="Permalink to &quot;三、Just:主推的现代答案&quot;">​</a></h2><h3 id="_3-1-是什么-怎么装" tabindex="-1">3.1 是什么 / 怎么装 <a class="header-anchor" href="#_3-1-是什么-怎么装" aria-label="Permalink to &quot;3.1 是什么 / 怎么装&quot;">​</a></h3><p><strong>Just</strong> 是 Casey Rodarmor 2016 年发起的 Rust 项目,目标明确:<strong>&quot;Make for command runners&quot;</strong> —— 把&quot;任务运行&quot;这一面从 Make 里抽出来,<strong>不管&quot;依赖图增量构建&quot;那一面</strong>。</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># macOS</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">brew</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> install</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> just</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Ubuntu 24.04+</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">apt</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> install</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> just</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Rust 工具链</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">cargo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> install</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> just</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Nix</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">nix-shell</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -p</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> just</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 任何系统(从 release 下 binary)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">curl</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --proto</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;=https&#39;</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --tlsv1.2</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -sSf</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> https://just.systems/install.sh</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> |</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> bash</span></span></code></pre></div><p><strong>装好之后</strong>:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> just</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --version</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">just</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 1.36.0</span></span></code></pre></div><h3 id="_3-2-第一个-justfile" tabindex="-1">3.2 第一个 Justfile <a class="header-anchor" href="#_3-2-第一个-justfile" aria-label="Permalink to &quot;3.2 第一个 Justfile&quot;">​</a></h3><p>项目根目录新建一个文件 <code>Justfile</code>(或小写 <code>justfile</code>,都可以):</p><div class="language-just vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">just</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># Justfile</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 默认 recipe:不带参数时跑 just,等于 just --list</span></span>
<span class="line"><span>default:</span></span>
<span class="line"><span>    @just --list</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 跑全部测试</span></span>
<span class="line"><span>test:</span></span>
<span class="line"><span>    cargo test</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 构建 release 版本(可传 profile 参数)</span></span>
<span class="line"><span>build profile=&quot;release&quot;:</span></span>
<span class="line"><span>    cargo build --profile {{profile}}</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 部署:先跑 test 和 build,再 deploy 脚本</span></span>
<span class="line"><span>deploy: test build</span></span>
<span class="line"><span>    ./scripts/deploy.sh</span></span></code></pre></div><p><strong>跑起来</strong>:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> just</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                    # 跑 default,列出所有 recipe</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">Available</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> recipes:</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    build</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> profile=&quot;release&quot;</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  # 构建 release 版本(可传 profile 参数)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    default</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                  # 默认 recipe...</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    deploy</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                   # 部署...</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    test</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                     # 跑全部测试</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> just</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> test</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">               # 跑 test</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> just</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> build</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">              # 跑 build,profile=release</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> just</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> build</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> debug</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">        # 跑 build,profile=debug</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> just</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> deploy</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">             # 先 test,再 build,最后 deploy</span></span></code></pre></div><p><strong>关键体验</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>□ \`# 注释\` 自动变成 --list 的描述         ← 零配置 self-doc</span></span>
<span class="line"><span>□ 参数 + 默认值原生支持                    ← \`build profile=&quot;release&quot;\`</span></span>
<span class="line"><span>□ 依赖直接写在冒号后面                     ← \`deploy: test build\`</span></span>
<span class="line"><span>□ 不用 .PHONY,recipe 默认就是命令         ← 心智负担为零</span></span>
<span class="line"><span>□ 命令行前 4 个空格或 Tab 都可以           ← Tab 教徒终于解放</span></span></code></pre></div><h3 id="_3-3-关键特性-1-参数和默认值" tabindex="-1">3.3 关键特性 1:参数和默认值 <a class="header-anchor" href="#_3-3-关键特性-1-参数和默认值" aria-label="Permalink to &quot;3.3 关键特性 1:参数和默认值&quot;">​</a></h3><div class="language-just vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">just</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># 单参数,无默认值</span></span>
<span class="line"><span>greet name:</span></span>
<span class="line"><span>    echo &quot;Hello, {{name}}&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 单参数,带默认值</span></span>
<span class="line"><span>greet2 name=&quot;world&quot;:</span></span>
<span class="line"><span>    echo &quot;Hello, {{name}}&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 多参数</span></span>
<span class="line"><span>deploy env version:</span></span>
<span class="line"><span>    ./deploy.sh {{env}} {{version}}</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 多参数 + 默认值</span></span>
<span class="line"><span>deploy2 env=&quot;staging&quot; version=&quot;latest&quot;:</span></span>
<span class="line"><span>    ./deploy.sh {{env}} {{version}}</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 变长参数(收集为字符串列表)</span></span>
<span class="line"><span>test +args:</span></span>
<span class="line"><span>    cargo test {{args}}</span></span></code></pre></div><p><strong>用法</strong>:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> just</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> greet</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> Alice</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">              # Hello, Alice</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> just</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> greet2</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                   # Hello, world</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> just</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> greet2</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> Alice</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">             # Hello, Alice</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> just</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> deploy</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> prod</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> v1.2.3</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> just</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> deploy2</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> staging</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">          # version 用默认 latest</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> just</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> test</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --release</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --nocapture</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">   # +args 收集所有后续参数</span></span></code></pre></div><p><strong>对比 Make</strong>:同样的功能,Make 要 <code>make deploy ENV=prod VERSION=v1.2.3</code>,变量语法,参数不直观。</p><h3 id="_3-4-关键特性-2-依赖与并行" tabindex="-1">3.4 关键特性 2:依赖与并行 <a class="header-anchor" href="#_3-4-关键特性-2-依赖与并行" aria-label="Permalink to &quot;3.4 关键特性 2:依赖与并行&quot;">​</a></h3><div class="language-just vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">just</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># 串行依赖:先 test,再 build,再 deploy</span></span>
<span class="line"><span>deploy: test build</span></span>
<span class="line"><span>    ./scripts/deploy.sh</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 并行依赖(多个前置 recipe 可并行跑)</span></span>
<span class="line"><span>ci: lint test</span></span>
<span class="line"><span>    echo &quot;CI passed&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span># just --jobs N 并行跑独立 recipe</span></span>
<span class="line"><span># $ just --jobs 4 lint test</span></span></code></pre></div><div class="language-just vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">just</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># 链式 recipe 调用(在 recipe 体内调用其他 recipe)</span></span>
<span class="line"><span>release version:</span></span>
<span class="line"><span>    just bump-version {{version}}</span></span>
<span class="line"><span>    just changelog</span></span>
<span class="line"><span>    just tag {{version}}</span></span>
<span class="line"><span>    just publish</span></span>
<span class="line"><span></span></span>
<span class="line"><span>bump-version v:</span></span>
<span class="line"><span>    sed -i &#39;s/version = .*/version = &quot;{{v}}&quot;/&#39; Cargo.toml</span></span>
<span class="line"><span></span></span>
<span class="line"><span>changelog:</span></span>
<span class="line"><span>    git-cliff -o CHANGELOG.md</span></span>
<span class="line"><span></span></span>
<span class="line"><span>tag v:</span></span>
<span class="line"><span>    git tag -a &quot;v{{v}}&quot; -m &quot;Release v{{v}}&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>publish:</span></span>
<span class="line"><span>    cargo publish</span></span></code></pre></div><h3 id="_3-5-关键特性-3-shell-嵌入-用任何解释器" tabindex="-1">3.5 关键特性 3:shell 嵌入(用任何解释器) <a class="header-anchor" href="#_3-5-关键特性-3-shell-嵌入-用任何解释器" aria-label="Permalink to &quot;3.5 关键特性 3:shell 嵌入(用任何解释器)&quot;">​</a></h3><div class="language-just vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">just</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># 默认是 sh / bash(每行独立)</span></span>
<span class="line"><span>test:</span></span>
<span class="line"><span>    cargo test</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 用 #! shebang 切语言:整个 recipe 当一段脚本</span></span>
<span class="line"><span>lint:</span></span>
<span class="line"><span>    #!/usr/bin/env bash</span></span>
<span class="line"><span>    set -euo pipefail</span></span>
<span class="line"><span>    cargo clippy -- -D warnings</span></span>
<span class="line"><span>    cargo fmt --check</span></span>
<span class="line"><span>    echo &quot;Lint passed&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 整段 Python</span></span>
<span class="line"><span>analyze:</span></span>
<span class="line"><span>    #!/usr/bin/env python3</span></span>
<span class="line"><span>    import json</span></span>
<span class="line"><span>    import subprocess</span></span>
<span class="line"><span>    </span></span>
<span class="line"><span>    result = subprocess.run([&quot;cargo&quot;, &quot;test&quot;, &quot;--no-run&quot;, &quot;--message-format=json&quot;],</span></span>
<span class="line"><span>                            capture_output=True, text=True)</span></span>
<span class="line"><span>    for line in result.stdout.splitlines():</span></span>
<span class="line"><span>        msg = json.loads(line)</span></span>
<span class="line"><span>        if msg.get(&quot;reason&quot;) == &quot;compiler-artifact&quot;:</span></span>
<span class="line"><span>            print(msg[&quot;target&quot;][&quot;name&quot;])</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 整段 Node</span></span>
<span class="line"><span>build-frontend:</span></span>
<span class="line"><span>    #!/usr/bin/env node</span></span>
<span class="line"><span>    const { build } = require(&quot;esbuild&quot;);</span></span>
<span class="line"><span>    build({ entryPoints: [&quot;src/main.ts&quot;], bundle: true, outfile: &quot;dist/main.js&quot; });</span></span></code></pre></div><p><strong>这是 just 比 Make 强很多的地方</strong>——一个项目可能同时用 bash、python、node 写不同任务,<strong>just 让每个 recipe 自己选解释器,不用学 Make 的 ONESHELL 黑魔法</strong>。</p><h3 id="_3-6-关键特性-4-平台分支" tabindex="-1">3.6 关键特性 4:平台分支 <a class="header-anchor" href="#_3-6-关键特性-4-平台分支" aria-label="Permalink to &quot;3.6 关键特性 4:平台分支&quot;">​</a></h3><div class="language-just vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">just</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># macOS 专用</span></span>
<span class="line"><span>[macos]</span></span>
<span class="line"><span>install:</span></span>
<span class="line"><span>    brew install foo bar baz</span></span>
<span class="line"><span></span></span>
<span class="line"><span># Linux 专用</span></span>
<span class="line"><span>[linux]</span></span>
<span class="line"><span>install:</span></span>
<span class="line"><span>    sudo apt install -y foo bar baz</span></span>
<span class="line"><span></span></span>
<span class="line"><span># Windows 专用</span></span>
<span class="line"><span>[windows]</span></span>
<span class="line"><span>install:</span></span>
<span class="line"><span>    winget install foo</span></span>
<span class="line"><span>    winget install bar</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 多平台合并写:同一个 recipe 名,平台属性自动分发</span></span>
<span class="line"><span>[macos]</span></span>
<span class="line"><span>open-config:</span></span>
<span class="line"><span>    open ~/.config/foo.toml</span></span>
<span class="line"><span></span></span>
<span class="line"><span>[linux]</span></span>
<span class="line"><span>open-config:</span></span>
<span class="line"><span>    xdg-open ~/.config/foo.toml</span></span></code></pre></div><p><strong><code>just install</code> 在 macOS 跑 brew,在 Linux 跑 apt</strong>——一个 Justfile 团队全平台用,这是 Make 做不到的。</p><h3 id="_3-7-关键特性-5-变量与环境" tabindex="-1">3.7 关键特性 5:变量与环境 <a class="header-anchor" href="#_3-7-关键特性-5-变量与环境" aria-label="Permalink to &quot;3.7 关键特性 5:变量与环境&quot;">​</a></h3><div class="language-just vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">just</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># 顶级变量</span></span>
<span class="line"><span>version := &quot;1.2.3&quot;</span></span>
<span class="line"><span>target := &quot;x86_64-unknown-linux-musl&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 用环境变量,带默认值</span></span>
<span class="line"><span>deploy_env := env_var_or_default(&quot;DEPLOY_ENV&quot;, &quot;staging&quot;)</span></span>
<span class="line"><span></span></span>
<span class="line"><span># recipe 里引用</span></span>
<span class="line"><span>build:</span></span>
<span class="line"><span>    cargo build --target {{target}}</span></span>
<span class="line"><span></span></span>
<span class="line"><span>show-version:</span></span>
<span class="line"><span>    echo &quot;Version: {{version}}, Target: {{target}}&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 加载 .env 文件(开头一行)</span></span>
<span class="line"><span>set dotenv-load</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 从 .env 自动读 DATABASE_URL 之类</span></span>
<span class="line"><span>migrate:</span></span>
<span class="line"><span>    sqlx migrate run</span></span></code></pre></div><h3 id="_3-8-关键特性-6-私有-recipe" tabindex="-1">3.8 关键特性 6:私有 recipe <a class="header-anchor" href="#_3-8-关键特性-6-私有-recipe" aria-label="Permalink to &quot;3.8 关键特性 6:私有 recipe&quot;">​</a></h3><div class="language-just vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">just</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># 下划线开头的 recipe 不出现在 --list</span></span>
<span class="line"><span>_internal-helper:</span></span>
<span class="line"><span>    echo &quot;this is internal&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 也可以用属性显式标</span></span>
<span class="line"><span>[private]</span></span>
<span class="line"><span>my-helper:</span></span>
<span class="line"><span>    echo &quot;helper&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 但 just _internal-helper 还是能调</span></span>
<span class="line"><span>deploy: _internal-helper</span></span>
<span class="line"><span>    ./deploy.sh</span></span></code></pre></div><p><strong>这让你把 Justfile 拆成&quot;公开 API&quot;和&quot;内部辅助&quot;</strong>——<code>just --list</code> 只显示公开的,新人看到的就是干净的目录。</p><h3 id="_3-9-关键特性-7-choose-fzf" tabindex="-1">3.9 关键特性 7:choose + fzf <a class="header-anchor" href="#_3-9-关键特性-7-choose-fzf" aria-label="Permalink to &quot;3.9 关键特性 7:choose + fzf&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 内置 fuzzy 选择 recipe</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> just</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --choose</span></span></code></pre></div><p><strong>这会调用 fzf / sk / 任何 picker 给你选 recipe</strong>——如果你已经看过 12 篇 fzf 心智,这个直接就拿过来用了。</p><p><strong>配 alias 让它更顺手</strong>:</p><div class="language-zsh vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">zsh</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># ~/.zshrc</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">alias</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> jc</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;just --choose&#39;</span></span></code></pre></div><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> jc</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                       # fzf 选 recipe,Enter 跑</span></span></code></pre></div><p><strong>自定义选择器</strong>:</p><div class="language-just vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">just</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># Justfile 顶部</span></span>
<span class="line"><span>set fallback              # 找不到 recipe 时往上一级目录找</span></span></code></pre></div><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 用 sk 替代 fzf</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> just</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --choose</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --chooser=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;sk --preview &quot;just --show {}&quot;&#39;</span></span></code></pre></div><p><strong>预览 recipe 内容再选</strong>——这套体验 Make 是 0%,just 是 100%。</p><h3 id="_3-10-文档自动生成" tabindex="-1">3.10 文档自动生成 <a class="header-anchor" href="#_3-10-文档自动生成" aria-label="Permalink to &quot;3.10 文档自动生成&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> just</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --list</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                  # 列出所有公开 recipe</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> just</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --list</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --list-heading</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;Project tasks:&quot;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> just</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --summary</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">               # 简短列表(空格分隔)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> just</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --show</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> test</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">             # 看某 recipe 的源码</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> just</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --evaluate</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">              # 列出所有变量当前值</span></span></code></pre></div><p><strong>这套自检命令让 Justfile 自带文档,不用单独维护 CONTRIBUTING.md</strong>——新人 clone,<code>just --list</code> 就完事。</p><hr><h2 id="四、make-不是错-只是不该当主任务运行器" tabindex="-1">四、Make:不是错,只是不该当主任务运行器 <a class="header-anchor" href="#四、make-不是错-只是不该当主任务运行器" aria-label="Permalink to &quot;四、Make:不是错,只是不该当主任务运行器&quot;">​</a></h2><h3 id="_4-1-make-真正不可替代的场景" tabindex="-1">4.1 Make 真正不可替代的场景 <a class="header-anchor" href="#_4-1-make-真正不可替代的场景" aria-label="Permalink to &quot;4.1 Make 真正不可替代的场景&quot;">​</a></h3><p><strong>Make 是 1977 年发明的,但「依赖驱动 + 增量重建」这件事到今天没有更好的替代品(在 C/C++ 生态里)</strong>。Make 该用的场景:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>✓ C / C++ 项目的实际编译(不是 cmake 之上的封装)</span></span>
<span class="line"><span>✓ LaTeX → PDF 增量构建(.tex 改了重编,.bib 没改不重编)</span></span>
<span class="line"><span>✓ Sphinx 文档生成(改了一个 .rst 只重渲染那个 page)</span></span>
<span class="line"><span>✓ 数据 pipeline 的&quot;前置数据没变就跳过当前步骤&quot;</span></span>
<span class="line"><span>✓ 团队 100% 都熟悉,没人想学新东西(社会成本)</span></span>
<span class="line"><span>✓ 极简 Linux 镜像 / Docker scratch(make 系统自带,不必装)</span></span>
<span class="line"><span>✓ Kernel / glibc / coreutils 这种历史悠久的项目</span></span></code></pre></div><h3 id="_4-2-make-真正擅长的-makefile-看起来什么样" tabindex="-1">4.2 Make 真正擅长的 Makefile 看起来什么样 <a class="header-anchor" href="#_4-2-make-真正擅长的-makefile-看起来什么样" aria-label="Permalink to &quot;4.2 Make 真正擅长的 Makefile 看起来什么样&quot;">​</a></h3><div class="language-makefile vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">makefile</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 真增量构建的 Makefile,Make 的本职工作</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">CC := gcc</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">CFLAGS := -Wall -O2</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">SOURCES := </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">$(</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">wildcard</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> src/</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">*</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">.c)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">OBJECTS := </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">$(</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">SOURCES:src/%.c=build/%.o</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">TARGET := build/app</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">$(</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">TARGET</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">)</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">$(</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">OBJECTS</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">)</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">	$(</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">CC</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">)</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> $(</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">CFLAGS</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">)</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> -o </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">$@</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> $^</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">build/</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">%</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">.o</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: src/</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">%</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.c | build</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">	$(</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">CC</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">)</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> $(</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">CFLAGS</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">)</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> -c </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">$&lt;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> -o </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">$@</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">build</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">	mkdir -p build</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">clean</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">	rm -rf build</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">.PHONY</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: clean</span></span></code></pre></div><p><strong>这个 Makefile 的核心是「依赖图」</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>build/app  ←──  build/main.o</span></span>
<span class="line"><span>                build/util.o</span></span>
<span class="line"><span>                build/io.o</span></span>
<span class="line"><span>                  ↑</span></span>
<span class="line"><span>                  └─  src/main.c (源)</span></span>
<span class="line"><span>                      src/util.c</span></span>
<span class="line"><span>                      src/io.c</span></span></code></pre></div><p>改一个 <code>src/util.c</code>,只重编 <code>build/util.o</code> 和最终 link;<strong>这是 Make 的核心价值,而且没有第二个工具能在 C 生态里替代它</strong>(bazel 太重、cmake 是生成器、ninja 是 cmake 的后端)。</p><h3 id="_4-3-简单任务运行的-makefile-可以这样写-但应该迁-just" tabindex="-1">4.3 简单任务运行的 Makefile(可以这样写,但应该迁 just) <a class="header-anchor" href="#_4-3-简单任务运行的-makefile-可以这样写-但应该迁-just" aria-label="Permalink to &quot;4.3 简单任务运行的 Makefile(可以这样写,但应该迁 just)&quot;">​</a></h3><div class="language-makefile vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">makefile</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">.PHONY</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: build test lint deploy clean</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">build</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">	go build -o bin/app</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">test</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">	go test ./...</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">lint</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">	golangci-lint run</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">deploy</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: build</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">	./scripts/deploy.sh</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">clean</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">	rm -rf bin/</span></span></code></pre></div><p><strong>这种 Makefile 没有用上 Make 的核心能力</strong>——没有源文件 / 目标文件的依赖图,所有 target 都是 <code>.PHONY</code>(每次重跑)。<strong>这就是错位</strong>:你借用了 Make 的「target 语法」,但实际你写的是任务清单。<strong>这种 Makefile 在 2026 年应该迁 Justfile</strong>。</p><h3 id="_4-4-一个判断-看你的-makefile-有没有真依赖" tabindex="-1">4.4 一个判断:看你的 Makefile 有没有真依赖 <a class="header-anchor" href="#_4-4-一个判断-看你的-makefile-有没有真依赖" aria-label="Permalink to &quot;4.4 一个判断:看你的 Makefile 有没有真依赖&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>打开你的 Makefile,数一下:</span></span>
<span class="line"><span>   - 有多少 target 是 .PHONY?                __ 个</span></span>
<span class="line"><span>   - 有多少 target 真的有&quot;源文件 → 产物&quot;的依赖关系?  __ 个</span></span>
<span class="line"><span></span></span>
<span class="line"><span>如果 .PHONY 占比 &gt; 70% → 这是任务清单,不是构建,该迁 Justfile</span></span>
<span class="line"><span>如果真依赖占比 &gt; 30% → 是真 Makefile,继续用</span></span>
<span class="line"><span>混合场景 → 可以拆:Makefile 留构建,Justfile 加任务</span></span></code></pre></div><hr><h2 id="五、task-yaml-派的选择" tabindex="-1">五、Task:YAML 派的选择 <a class="header-anchor" href="#五、task-yaml-派的选择" aria-label="Permalink to &quot;五、Task:YAML 派的选择&quot;">​</a></h2><h3 id="_5-1-是什么" tabindex="-1">5.1 是什么 <a class="header-anchor" href="#_5-1-是什么" aria-label="Permalink to &quot;5.1 是什么&quot;">​</a></h3><p><strong>Task 是 2017 年的 Go 项目,目标和 just 类似</strong>——但配置用 YAML,语法对喜欢声明式的人更友好。</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 装</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">brew</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> install</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> go-task/tap/go-task</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 或</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sh</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -c</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;$(</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">curl</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --location</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> https://taskfile.dev/install.sh)&quot;</span></span></code></pre></div><h3 id="_5-2-taskfile-yml-示例" tabindex="-1">5.2 Taskfile.yml 示例 <a class="header-anchor" href="#_5-2-taskfile-yml-示例" aria-label="Permalink to &quot;5.2 Taskfile.yml 示例&quot;">​</a></h3><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Taskfile.yml</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">version</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;3&#39;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">tasks</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  default</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    desc</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">List all tasks</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    cmd</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">task --list</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  test</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    desc</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">Run all tests</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    cmd</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">cargo test</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  build</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    desc</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">Build release</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    cmd</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">cargo build --release</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    sources</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;src/**/*.rs&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">Cargo.toml</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    generates</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">target/release/app</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  deploy</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    desc</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">Deploy to production</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    deps</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">test</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">build</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    cmd</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">./scripts/deploy.sh</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  bench</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    desc</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">Run benchmarks</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    cmd</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">hyperfine --warmup 3 ./target/release/app</span></span></code></pre></div><p><strong>用法</strong>:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> task</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --list</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> task</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> test</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> task</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> deploy</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">             # 先 test 和 build,再 deploy</span></span></code></pre></div><h3 id="_5-3-task-比-just-多-少什么" tabindex="-1">5.3 Task 比 Just 多/少什么 <a class="header-anchor" href="#_5-3-task-比-just-多-少什么" aria-label="Permalink to &quot;5.3 Task 比 Just 多/少什么&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Task 多的:</span></span>
<span class="line"><span>   ✓ sources/generates 字段 → 半个增量构建(检查文件时间戳)</span></span>
<span class="line"><span>   ✓ YAML 对 IDE 补全友好(yaml-language-server)</span></span>
<span class="line"><span>   ✓ k8s 生态的人看 YAML 熟悉</span></span>
<span class="line"><span>   ✓ 内置 watch 模式(--watch)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Task 少的:</span></span>
<span class="line"><span>   ✗ 平台分支不如 just 直观</span></span>
<span class="line"><span>   ✗ shebang 切语言不如 just 自然</span></span>
<span class="line"><span>   ✗ YAML 缩进容易错,Justfile 是 Tab/空格都行</span></span>
<span class="line"><span>   ✗ 50 行以上的 Taskfile 可读性下降</span></span></code></pre></div><p><strong>判断</strong>:<strong>如果你团队 90% 是 k8s 工程师,Taskfile 读起来更亲切;否则选 just</strong>。</p><hr><h2 id="六、mise-tasks-已经用-mise-时的顺带选择" tabindex="-1">六、mise tasks:已经用 mise 时的顺带选择 <a class="header-anchor" href="#六、mise-tasks-已经用-mise-时的顺带选择" aria-label="Permalink to &quot;六、mise tasks:已经用 mise 时的顺带选择&quot;">​</a></h2><p>24 篇讲过 mise 是多语言版本管理(替代 nvm + pyenv + rbenv)。<strong>mise 2023 年加了 tasks 功能</strong>——已经用 mise 的项目,<strong>不需要再装 just</strong>。</p><h3 id="_6-1-mise-toml-示例" tabindex="-1">6.1 .mise.toml 示例 <a class="header-anchor" href="#_6-1-mise-toml-示例" aria-label="Permalink to &quot;6.1 .mise.toml 示例&quot;">​</a></h3><div class="language-toml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">toml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># .mise.toml</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">tools</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">node = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;20&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">python = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;3.12&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">rust = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;1.75&quot;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">env</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">DATABASE_URL = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;postgres://localhost/myapp&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">RUST_LOG = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;info&quot;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">tasks</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">test</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">description = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;Run all tests&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">run = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;cargo test&quot;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">tasks</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">build</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">description = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;Build release&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">run = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;cargo build --release&quot;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">tasks</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">deploy</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">description = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;Deploy to production&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">depends = [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;test&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;build&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">run = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;./scripts/deploy.sh&quot;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 多行脚本</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">tasks</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">lint</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">description = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;Run linters&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">run = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;&quot;&quot;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">cargo clippy -- -D warnings</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">cargo fmt --check</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;&quot;&quot;</span></span></code></pre></div><p><strong>用法</strong>:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> mise</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> tasks</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                  # 列出所有任务</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> mise</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> run</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> test</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">               # 跑 test(等价 mise t test)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> mise</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> t</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> deploy</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">               # 跑 deploy</span></span></code></pre></div><h3 id="_6-2-mise-tasks-的甜头" tabindex="-1">6.2 mise tasks 的甜头 <a class="header-anchor" href="#_6-2-mise-tasks-的甜头" aria-label="Permalink to &quot;6.2 mise tasks 的甜头&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>✓ 一个文件管 env + 版本 + 任务,不必三个文件三套工具</span></span>
<span class="line"><span>✓ mise 自动注入 PATH(node、python、rust),recipe 里直接调</span></span>
<span class="line"><span>✓ 已用 mise 就不必再装 just(少一个工具)</span></span>
<span class="line"><span>✓ TOML 比 YAML 不容易出缩进错误</span></span></code></pre></div><h3 id="_6-3-缺点" tabindex="-1">6.3 缺点 <a class="header-anchor" href="#_6-3-缺点" aria-label="Permalink to &quot;6.3 缺点&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>✗ 社区比 just 小一截,文档和插件少</span></span>
<span class="line"><span>✗ 复杂 recipe(参数、平台分支)语法不如 just 表达力强</span></span>
<span class="line"><span>✗ 不在用 mise 的话,为了 tasks 装 mise 不值</span></span></code></pre></div><p><strong>判断</strong>:<strong>你已经用 mise → 用 mise tasks;没用 mise → 用 just</strong>。</p><hr><h2 id="七、npm-scripts-js-项目的原生选择" tabindex="-1">七、npm scripts:JS 项目的原生选择 <a class="header-anchor" href="#七、npm-scripts-js-项目的原生选择" aria-label="Permalink to &quot;七、npm scripts:JS 项目的原生选择&quot;">​</a></h2><h3 id="_7-1-package-json-例子" tabindex="-1">7.1 package.json 例子 <a class="header-anchor" href="#_7-1-package-json-例子" aria-label="Permalink to &quot;7.1 package.json 例子&quot;">​</a></h3><div class="language-json vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">json</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">{</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  &quot;name&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;my-app&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  &quot;scripts&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: {</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    &quot;dev&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;vite&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    &quot;build&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;vite build&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    &quot;test&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;vitest run&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    &quot;test:watch&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;vitest&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    &quot;lint&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;eslint . &amp;&amp; prettier --check .&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    &quot;format&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;prettier --write .&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    &quot;deploy&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;npm run build &amp;&amp; wrangler deploy&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  }</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span></code></pre></div><p><strong>用法</strong>:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> npm</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> run</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> dev</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> npm</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> test</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                # test 是 npm 内置别名,不必 run</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> pnpm</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> dev</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                # pnpm / bun / yarn 都兼容这套</span></span></code></pre></div><h3 id="_7-2-npm-scripts-的甜头" tabindex="-1">7.2 npm scripts 的甜头 <a class="header-anchor" href="#_7-2-npm-scripts-的甜头" aria-label="Permalink to &quot;7.2 npm scripts 的甜头&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>✓ Node 项目原生,不必装额外工具</span></span>
<span class="line"><span>✓ pnpm / bun / yarn / npm 都认这套,通用度高</span></span>
<span class="line"><span>✓ 简单场景几乎为零学习成本</span></span>
<span class="line"><span>✓ npm-run-all 提供 run-p / run-s 跑并行/串行</span></span></code></pre></div><h3 id="_7-3-局限" tabindex="-1">7.3 局限 <a class="header-anchor" href="#_7-3-局限" aria-label="Permalink to &quot;7.3 局限&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>✗ JSON 不能写多行命令,长命令必反斜杠转义,可读性归零</span></span>
<span class="line"><span>✗ 跨语言项目(node + python + rust)用不了</span></span>
<span class="line"><span>✗ 复杂依赖(deploy 先 build 先 test)只能字符串拼接 &amp;&amp;</span></span>
<span class="line"><span>✗ 不能用 #! shebang 切解释器</span></span>
<span class="line"><span>✗ &quot;scripts&quot;: { &quot;test:unit:fast&quot;: &quot;...&quot; } 嵌套命名靠字符串,易混</span></span></code></pre></div><h3 id="_7-4-何时仍然合理用-npm-scripts" tabindex="-1">7.4 何时仍然合理用 npm scripts <a class="header-anchor" href="#_7-4-何时仍然合理用-npm-scripts" aria-label="Permalink to &quot;7.4 何时仍然合理用 npm scripts&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>✓ 纯 JS 项目,任务总数 &lt; 10</span></span>
<span class="line"><span>✓ 每个命令短(&lt; 30 字符)</span></span>
<span class="line"><span>✓ 没有跨语言、跨平台分支需求</span></span>
<span class="line"><span>✓ 团队只用 Node 工具链</span></span>
<span class="line"><span></span></span>
<span class="line"><span>否则:在 package.json 之外再加一个 Justfile,共存,</span></span>
<span class="line"><span>     Justfile 调 npm run xxx,公共逻辑(deploy / db 等)走 just</span></span></code></pre></div><hr><h2 id="八、按项目类型选型" tabindex="-1">八、按项目类型选型 <a class="header-anchor" href="#八、按项目类型选型" aria-label="Permalink to &quot;八、按项目类型选型&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>项目类型                      推荐</span></span>
<span class="line"><span>─────────────────────────────────────────────────────────────</span></span>
<span class="line"><span>个人 dotfiles / 工作流脚本     just(简单几个任务)</span></span>
<span class="line"><span>Rust 项目                     just(cargo 管构建,just 管任务)</span></span>
<span class="line"><span>Go 项目                       just(go build 管构建,just 管任务)</span></span>
<span class="line"><span>Python 项目(uv / poetry)     just / mise tasks</span></span>
<span class="line"><span>Node 项目(纯 JS / TS)        npm scripts(简单) 或 just(复杂)</span></span>
<span class="line"><span>多语言 monorepo               just / mise tasks(可叠加 turbo)</span></span>
<span class="line"><span>C / C++ / Rust mixed C        Makefile + Justfile 共存</span></span>
<span class="line"><span>LaTeX / 学术文档              Makefile(真增量重编)</span></span>
<span class="line"><span>ML 数据 pipeline              Snakemake / DVC / Airflow(在 dataEng)</span></span>
<span class="line"><span>K8s 应用(部署密集)            just / Taskfile.yml</span></span>
<span class="line"><span>JS monorepo(Turborepo / Nx)  turbo + just(更长任务)</span></span>
<span class="line"><span>─────────────────────────────────────────────────────────────</span></span></code></pre></div><p><strong>经验法则</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>任务 &lt; 5,纯 JS              → package.json scripts</span></span>
<span class="line"><span>任务 5-30,任何语言           → Justfile</span></span>
<span class="line"><span>任务 30+ 且依赖关系复杂       → Justfile 拆成 sub-justfile / 转 Python click / typer</span></span>
<span class="line"><span>真增量构建(.c / .tex)        → Makefile(只管构建那部分)</span></span></code></pre></div><hr><h2 id="九、50-行生产级-justfile-模板" tabindex="-1">九、50 行生产级 Justfile 模板 <a class="header-anchor" href="#九、50-行生产级-justfile-模板" aria-label="Permalink to &quot;九、50 行生产级 Justfile 模板&quot;">​</a></h2><p>下面这份 Justfile 是任意中型项目可以直接 fork 改的——<strong>50 行覆盖 90% 场景</strong>:</p><div class="language-just vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">just</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># Justfile - production-ready template</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 顶级变量</span></span>
<span class="line"><span>project := &quot;myapp&quot;</span></span>
<span class="line"><span>version := \`cat VERSION 2&gt;/dev/null || echo &quot;0.1.0&quot;\`</span></span>
<span class="line"><span>docker_image := &quot;registry.example.com/&quot; + project</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 加载 .env(开发环境用)</span></span>
<span class="line"><span>set dotenv-load</span></span>
<span class="line"><span>set positional-arguments</span></span>
<span class="line"><span></span></span>
<span class="line"><span># ============ 默认 ============</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 不带参数时:列出所有 recipe</span></span>
<span class="line"><span>default:</span></span>
<span class="line"><span>    @just --list --unsorted</span></span>
<span class="line"><span></span></span>
<span class="line"><span># ============ 开发 ============</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 启动 dev 服务(热重载)</span></span>
<span class="line"><span>dev:</span></span>
<span class="line"><span>    cargo watch -x run</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 跑测试(可选传 filter)</span></span>
<span class="line"><span>test *filter=&#39;&#39;:</span></span>
<span class="line"><span>    cargo test {{filter}}</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 跑测试并显示输出</span></span>
<span class="line"><span>test-verbose *filter=&#39;&#39;:</span></span>
<span class="line"><span>    cargo test {{filter}} -- --nocapture</span></span>
<span class="line"><span></span></span>
<span class="line"><span># Lint(clippy + fmt 检查)</span></span>
<span class="line"><span>lint:</span></span>
<span class="line"><span>    #!/usr/bin/env bash</span></span>
<span class="line"><span>    set -euo pipefail</span></span>
<span class="line"><span>    cargo clippy --all-targets -- -D warnings</span></span>
<span class="line"><span>    cargo fmt --check</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 自动 fix(fmt + clippy --fix)</span></span>
<span class="line"><span>fix:</span></span>
<span class="line"><span>    cargo fmt</span></span>
<span class="line"><span>    cargo clippy --fix --allow-dirty --allow-staged</span></span>
<span class="line"><span></span></span>
<span class="line"><span># ============ 构建 ============</span></span>
<span class="line"><span></span></span>
<span class="line"><span># Build(可选 profile)</span></span>
<span class="line"><span>build profile=&quot;release&quot;:</span></span>
<span class="line"><span>    cargo build --profile {{profile}}</span></span>
<span class="line"><span></span></span>
<span class="line"><span># Docker 镜像</span></span>
<span class="line"><span>docker-build:</span></span>
<span class="line"><span>    docker build -t {{docker_image}}:{{version}} -t {{docker_image}}:latest .</span></span>
<span class="line"><span></span></span>
<span class="line"><span>docker-push: docker-build</span></span>
<span class="line"><span>    docker push {{docker_image}}:{{version}}</span></span>
<span class="line"><span>    docker push {{docker_image}}:latest</span></span>
<span class="line"><span></span></span>
<span class="line"><span># ============ 部署 ============</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 部署到指定环境(staging / prod)</span></span>
<span class="line"><span>deploy env=&quot;staging&quot;: test lint</span></span>
<span class="line"><span>    #!/usr/bin/env bash</span></span>
<span class="line"><span>    set -euo pipefail</span></span>
<span class="line"><span>    if [ &quot;{{env}}&quot; = &quot;prod&quot; ]; then</span></span>
<span class="line"><span>        echo &quot;Deploying to PRODUCTION. Continue? (y/N)&quot;</span></span>
<span class="line"><span>        read -r confirm</span></span>
<span class="line"><span>        [ &quot;$confirm&quot; = &quot;y&quot; ] || exit 1</span></span>
<span class="line"><span>    fi</span></span>
<span class="line"><span>    ./scripts/deploy.sh {{env}} {{version}}</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 回滚到上一版本</span></span>
<span class="line"><span>rollback env=&quot;staging&quot;:</span></span>
<span class="line"><span>    ./scripts/rollback.sh {{env}}</span></span>
<span class="line"><span></span></span>
<span class="line"><span># ============ 数据库 ============</span></span>
<span class="line"><span></span></span>
<span class="line"><span>[group(&#39;db&#39;)]</span></span>
<span class="line"><span>migrate:</span></span>
<span class="line"><span>    sqlx migrate run</span></span>
<span class="line"><span></span></span>
<span class="line"><span>[group(&#39;db&#39;)]</span></span>
<span class="line"><span>migrate-revert:</span></span>
<span class="line"><span>    sqlx migrate revert</span></span>
<span class="line"><span></span></span>
<span class="line"><span>[group(&#39;db&#39;)]</span></span>
<span class="line"><span>db-shell:</span></span>
<span class="line"><span>    psql &quot;$DATABASE_URL&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span># ============ 调试 / 运维 ============</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 看 prod 日志(需要 kubectl 配好 context)</span></span>
<span class="line"><span>logs env=&quot;prod&quot;:</span></span>
<span class="line"><span>    kubectl logs -n {{project}}-{{env}} -l app={{project}} --tail=200 -f</span></span>
<span class="line"><span></span></span>
<span class="line"><span># attach 一个 prod pod 的 shell</span></span>
<span class="line"><span>shell env=&quot;prod&quot;:</span></span>
<span class="line"><span>    kubectl exec -it -n {{project}}-{{env}} \\</span></span>
<span class="line"><span>        deploy/{{project}} -- /bin/sh</span></span>
<span class="line"><span></span></span>
<span class="line"><span># ============ 清理 ============</span></span>
<span class="line"><span></span></span>
<span class="line"><span>clean:</span></span>
<span class="line"><span>    cargo clean</span></span>
<span class="line"><span>    rm -rf node_modules dist target/release</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 平台特定</span></span>
<span class="line"><span>[macos]</span></span>
<span class="line"><span>install-deps:</span></span>
<span class="line"><span>    brew install postgresql redis</span></span>
<span class="line"><span></span></span>
<span class="line"><span>[linux]</span></span>
<span class="line"><span>install-deps:</span></span>
<span class="line"><span>    sudo apt install -y postgresql redis-server</span></span>
<span class="line"><span></span></span>
<span class="line"><span># ============ 私有(不显示在 --list) ============</span></span>
<span class="line"><span></span></span>
<span class="line"><span>_check-env:</span></span>
<span class="line"><span>    @[ -f .env ] || (echo &quot;.env not found&quot;; exit 1)</span></span>
<span class="line"><span></span></span>
<span class="line"><span># CI 入口</span></span>
<span class="line"><span>ci: lint test build</span></span>
<span class="line"><span>    @echo &quot;CI passed&quot;</span></span></code></pre></div><p><strong>这份模板的特点</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>□ 用 [group(&#39;db&#39;)] 分组,--list 会自动分类</span></span>
<span class="line"><span>□ 默认 recipe 是 --list,新人 just 一下看全貌</span></span>
<span class="line"><span>□ 关键任务(deploy prod)带二次确认</span></span>
<span class="line"><span>□ Lint / fix 是配对的(你违反 lint,跑 fix 自动修)</span></span>
<span class="line"><span>□ 平台分支用 [macos] / [linux] 属性</span></span>
<span class="line"><span>□ 私有 recipe 用下划线开头</span></span>
<span class="line"><span>□ 版本号从 VERSION 文件读,改一次全文同步</span></span>
<span class="line"><span>□ CI 入口是一个 recipe,本地能跑 just ci 复现 CI</span></span></code></pre></div><p><strong>这一份 Justfile 在中型项目可以撑 3-5 年</strong>——加新任务往里加 recipe 就行。</p><hr><h2 id="十、从-makefile-迁-justfile-的五步法" tabindex="-1">十、从 Makefile 迁 Justfile 的五步法 <a class="header-anchor" href="#十、从-makefile-迁-justfile-的五步法" aria-label="Permalink to &quot;十、从 Makefile 迁 Justfile 的五步法&quot;">​</a></h2><p>如果你项目已经有 Makefile,迁 Justfile 不必一夜全换。<strong>五步法</strong>:</p><h3 id="步骤-1-盘点-makefile-里的-target" tabindex="-1">步骤 1:盘点 Makefile 里的 target <a class="header-anchor" href="#步骤-1-盘点-makefile-里的-target" aria-label="Permalink to &quot;步骤 1:盘点 Makefile 里的 target&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> grep</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -E</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;^[a-zA-Z_-]+:&#39;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> Makefile</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">test</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">:</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">build:</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">deploy:</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">lint:</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">clean:</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">docker-build:</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">release:</span></span></code></pre></div><p>把 target 分两类:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>A. 真增量构建(有源文件依赖)→ 留在 Makefile</span></span>
<span class="line"><span>B. 任务(.PHONY)→ 准备迁 just</span></span></code></pre></div><h3 id="步骤-2-在项目根新建-justfile-逐个迁" tabindex="-1">步骤 2:在项目根新建 Justfile,逐个迁 <a class="header-anchor" href="#步骤-2-在项目根新建-justfile-逐个迁" aria-label="Permalink to &quot;步骤 2:在项目根新建 Justfile,逐个迁&quot;">​</a></h3><div class="language-just vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">just</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># Justfile,逐个对照 Makefile 的 .PHONY target</span></span>
<span class="line"><span></span></span>
<span class="line"><span>test:</span></span>
<span class="line"><span>    cargo test</span></span>
<span class="line"><span></span></span>
<span class="line"><span>build:</span></span>
<span class="line"><span>    cargo build --release</span></span>
<span class="line"><span></span></span>
<span class="line"><span>deploy: build</span></span>
<span class="line"><span>    ./scripts/deploy.sh</span></span></code></pre></div><p><strong>一次迁一两个,立刻 <code>just test</code> 验证跟原来 <code>make test</code> 行为一致</strong>。</p><h3 id="步骤-3-测试一遍-确认输出-退出码一致" tabindex="-1">步骤 3:测试一遍,确认输出 / 退出码一致 <a class="header-anchor" href="#步骤-3-测试一遍-确认输出-退出码一致" aria-label="Permalink to &quot;步骤 3:测试一遍,确认输出 / 退出码一致&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> make</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> test</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">; </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">echo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;Exit: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">$?</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> just</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> test</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">; </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">echo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;Exit: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">$?</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 两者退出码 / 输出应一致</span></span></code></pre></div><h3 id="步骤-4-ci-同步切换" tabindex="-1">步骤 4:CI 同步切换 <a class="header-anchor" href="#步骤-4-ci-同步切换" aria-label="Permalink to &quot;步骤 4:CI 同步切换&quot;">​</a></h3><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># .github/workflows/ci.yml</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">- </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">Test</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  run</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">just test</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">       # 原来是 make test</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">- </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">Build</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  run</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">just build</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">      # 原来是 make build</span></span></code></pre></div><p><strong>注意</strong>:<strong>CI runner 要装 just</strong>。GitHub Actions 上可以用 <code>extractions/setup-just@v1</code>,或 Docker 镜像里 <code>RUN apt install -y just</code>。</p><h3 id="步骤-5-删-makefile-里迁走的部分-写一段-contributing" tabindex="-1">步骤 5:删 Makefile 里迁走的部分,写一段 CONTRIBUTING <a class="header-anchor" href="#步骤-5-删-makefile-里迁走的部分-写一段-contributing" aria-label="Permalink to &quot;步骤 5:删 Makefile 里迁走的部分,写一段 CONTRIBUTING&quot;">​</a></h3><div class="language-makefile vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">makefile</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Makefile - 只保留真增量构建部分</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">build/app</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">$(</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">wildcard</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> src/</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">*</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">.c)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">	gcc -O2 -o </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">$@</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> $^</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">clean-build</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">	rm -rf build/</span></span></code></pre></div><div class="language-markdown vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">markdown</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">&lt;!-- CONTRIBUTING.md --&gt;</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">## Development</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">Tasks are managed by [</span><span style="--shiki-light:#032F62;--shiki-light-text-decoration:underline;--shiki-dark:#DBEDFF;--shiki-dark-text-decoration:underline;">just</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">](</span><span style="--shiki-light:#24292E;--shiki-light-text-decoration:underline;--shiki-dark:#E1E4E8;--shiki-dark-text-decoration:underline;">https://just.systems/</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">). Run </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">\`just --list\`</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> to see all tasks.</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \`just test\`</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> - Run tests</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \`just build\`</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> - Build release</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \`just deploy &lt;env&gt;\`</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> - Deploy to env</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">The Makefile only handles native C compilation. Don&#39;t add new </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">\`.PHONY\`</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> targets to it.</span></span></code></pre></div><p><strong>这一段 CONTRIBUTING 防止团队成员&quot;习惯性&quot;地往 Makefile 加 target</strong>——分工写清楚,新人也按这套来。</p><hr><h2 id="十一、tui-集成-just-choose-fzf" tabindex="-1">十一、TUI 集成:<code>just --choose</code> + fzf <a class="header-anchor" href="#十一、tui-集成-just-choose-fzf" aria-label="Permalink to &quot;十一、TUI 集成:\`just --choose\` + fzf&quot;">​</a></h2><p>如果你 Justfile 里 recipe 数量 &gt; 10,<strong>记不住具体名字</strong>。<strong><code>just --choose</code> 调起 fzf 让你 fuzzy 选</strong>:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> just</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --choose</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">&gt;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> dep</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">|</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  deploy</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  deploy-rollback</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  deploy-staging</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  ...</span></span></code></pre></div><h3 id="_11-1-配置" tabindex="-1">11.1 配置 <a class="header-anchor" href="#_11-1-配置" aria-label="Permalink to &quot;11.1 配置&quot;">​</a></h3><div class="language-just vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">just</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># Justfile 顶部</span></span>
<span class="line"><span>set fallback              # 找不到 recipe 时往上一级目录找</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 让 --choose 用 sk 而不是 fzf,带预览</span></span>
<span class="line"><span># 命令行参数也可以</span></span></code></pre></div><div class="language-zsh vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">zsh</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># ~/.zshrc - 长 alias 短</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">alias</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> j</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;just&#39;</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">alias</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> jc</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;just --choose&#39;</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">alias</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> jl</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;just --list&#39;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># fzf 预览 recipe 内容</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">export</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> JUST_CHOOSER</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;fzf --preview &#39;just --show {}&#39;&quot;</span></span></code></pre></div><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> jc</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                       # 直接 fuzzy 选</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> jl</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> |</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> grep</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> deploy</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">         # 也可以这样过滤</span></span></code></pre></div><h3 id="_11-2-加-zsh-fish-补全" tabindex="-1">11.2 加 zsh / fish 补全 <a class="header-anchor" href="#_11-2-加-zsh-fish-补全" aria-label="Permalink to &quot;11.2 加 zsh / fish 补全&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># zsh</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">mkdir</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -p</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ~/.zfunc</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">just</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --completions</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> zsh</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> &gt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ~/.zfunc/_just</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># fish</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">just</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --completions</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> fish</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> &gt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ~/.config/fish/completions/just.fish</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># bash</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">just</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --completions</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> bash</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> &gt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ~/.bash_completion.d/just</span></span></code></pre></div><p><strong>这之后 <code>just &lt;Tab&gt;</code> 会列出当前 Justfile 的所有 recipe</strong>——和 fzf history 配合,基本不用记长名字。</p><hr><h2 id="十二、反对的写法" tabindex="-1">十二、反对的写法 <a class="header-anchor" href="#十二、反对的写法" aria-label="Permalink to &quot;十二、反对的写法&quot;">​</a></h2><h3 id="_12-1-反对-1-make-当任务运行器" tabindex="-1">12.1 反对 1:Make 当任务运行器 <a class="header-anchor" href="#_12-1-反对-1-make-当任务运行器" aria-label="Permalink to &quot;12.1 反对 1:Make 当任务运行器&quot;">​</a></h3><div class="language-makefile vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">makefile</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 反例:这是任务清单,不是构建</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">.PHONY</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: dev test lint deploy clean docker-build docker-push</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">.PHONY</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: db-migrate db-rollback db-seed</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">.PHONY</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: logs-prod logs-staging shell-prod</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">.PHONY</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: release-patch release-minor release-major</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 全是 .PHONY,一个真依赖图都没有 → 该用 just</span></span></code></pre></div><p><strong>判断</strong>:<strong>你 Makefile 里 <code>.PHONY</code> 出现的次数 &gt;= 5,迁 Justfile</strong>。</p><h3 id="_12-2-反对-2-任务运行器-npm-scripts-shell-别名-三套并存" tabindex="-1">12.2 反对 2:任务运行器 + npm scripts + shell 别名 三套并存 <a class="header-anchor" href="#_12-2-反对-2-任务运行器-npm-scripts-shell-别名-三套并存" aria-label="Permalink to &quot;12.2 反对 2:任务运行器 + npm scripts + shell 别名 三套并存&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>你的项目同时有:</span></span>
<span class="line"><span>   - Justfile        (just test, just deploy)</span></span>
<span class="line"><span>   - package.json    (npm run test, npm run dev)</span></span>
<span class="line"><span>   - scripts/dev.sh  (./scripts/dev.sh)</span></span>
<span class="line"><span>   - shell alias     (alias dt=&#39;just test&#39;)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>新人入职 → 不知道该用哪个 → 抄一个,工作出问题</span></span>
<span class="line"><span></span></span>
<span class="line"><span>正解:统一一个入口(just),其他都从 just 调</span></span>
<span class="line"><span>   Justfile:</span></span>
<span class="line"><span>       test:</span></span>
<span class="line"><span>           pnpm test          # 从 just 调 npm</span></span>
<span class="line"><span>       dev:</span></span>
<span class="line"><span>           ./scripts/dev.sh   # 从 just 调脚本</span></span></code></pre></div><h3 id="_12-3-反对-3-justfile-200-行" tabindex="-1">12.3 反对 3:Justfile 200 行 <a class="header-anchor" href="#_12-3-反对-3-justfile-200-行" aria-label="Permalink to &quot;12.3 反对 3:Justfile 200 行&quot;">​</a></h3><p><strong>任务数超过 30 个,Justfile 开始难维护</strong>——这时三个出路:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>出路 A:按职责拆分 sub-justfile</span></span>
<span class="line"><span>   .</span></span>
<span class="line"><span>   ├── Justfile           ← 顶级,引用 sub</span></span>
<span class="line"><span>   ├── db/Justfile        ← 数据库相关</span></span>
<span class="line"><span>   └── deploy/Justfile    ← 部署相关</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   顶级 Justfile:</span></span>
<span class="line"><span>       db cmd:</span></span>
<span class="line"><span>           cd db &amp;&amp; just {{cmd}}</span></span>
<span class="line"><span>       deploy cmd:</span></span>
<span class="line"><span>           cd deploy &amp;&amp; just {{cmd}}</span></span>
<span class="line"><span></span></span>
<span class="line"><span>出路 B:复杂逻辑迁 Python(click / typer)</span></span>
<span class="line"><span>   ./bin/myproj test</span></span>
<span class="line"><span>   ./bin/myproj deploy prod</span></span>
<span class="line"><span>   Justfile 调:</span></span>
<span class="line"><span>       test:</span></span>
<span class="line"><span>           ./bin/myproj test</span></span>
<span class="line"><span></span></span>
<span class="line"><span>出路 C:转 mise tasks(TOML 结构化,长了好读一点)</span></span></code></pre></div><p><strong>Justfile 200 行就是设计信号,该重构了</strong>——和 Bash 脚本 500 行该转 Python 是一个道理。</p><h3 id="_12-4-反对-4-yaml-缩进-makefile-tab-一晚上调试" tabindex="-1">12.4 反对 4:YAML 缩进 / Makefile Tab 一晚上调试 <a class="header-anchor" href="#_12-4-反对-4-yaml-缩进-makefile-tab-一晚上调试" aria-label="Permalink to &quot;12.4 反对 4:YAML 缩进 / Makefile Tab 一晚上调试&quot;">​</a></h3><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Taskfile.yml - 缩进错一个空格,全错</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">tasks</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  test</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    cmd</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">cargo test</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">   deploy</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:        </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">← 这一行少了一个空格</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">     cmd</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">./deploy.sh</span></span></code></pre></div><div class="language-makefile vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">makefile</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Makefile - 第二行命令前是空格不是 Tab,炸</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">test</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    cargo test</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">                ↑ Make 报错 &quot;missing separator. Stop.&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">                  新人完全猜不到是 tab 问题</span></span></code></pre></div><p><strong>这种坑就是工具语法的设计税</strong>——<strong>Just 用 4 个空格或 Tab 都接受</strong>,直接消除这类问题。<strong>如果你和团队还在为 Tab/空格争执,迁 Just 立刻解决</strong>。</p><h3 id="_12-5-反对-5-把-justfile-写得像-make-的味儿" tabindex="-1">12.5 反对 5:把 Justfile 写得像 Make 的味儿 <a class="header-anchor" href="#_12-5-反对-5-把-justfile-写得像-make-的味儿" aria-label="Permalink to &quot;12.5 反对 5:把 Justfile 写得像 Make 的味儿&quot;">​</a></h3><div class="language-just vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">just</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># 反例:写出 Makefile 的味</span></span>
<span class="line"><span>.PHONY: test              ← 不需要,just 没这语义</span></span>
<span class="line"><span>test:                     ← 这没问题</span></span>
<span class="line"><span>    @cargo test            ← @ 是 Make 的&quot;不回显命令&quot;,just 用 @recipe 而不是 @line</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 正解</span></span>
<span class="line"><span>test:</span></span>
<span class="line"><span>    cargo test            ← just 默认就回显,不喜欢回显在 recipe 头加 @</span></span>
<span class="line"><span></span></span>
<span class="line"><span>[private]</span></span>
<span class="line"><span>@silent-recipe:           ← @recipe 不回显命令</span></span>
<span class="line"><span>    do_stuff</span></span></code></pre></div><p><strong>别把 Make 的肌肉记忆带进 Just</strong>,学一次新语法,然后写出干净的 Justfile。</p><h3 id="_12-6-反对-6-justfile-写一堆只跑一次的命令" tabindex="-1">12.6 反对 6:Justfile 写一堆只跑一次的命令 <a class="header-anchor" href="#_12-6-反对-6-justfile-写一堆只跑一次的命令" aria-label="Permalink to &quot;12.6 反对 6:Justfile 写一堆只跑一次的命令&quot;">​</a></h3><div class="language-just vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">just</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># 反例:这是一次性脚本不是任务</span></span>
<span class="line"><span>init-project-2024-q3:</span></span>
<span class="line"><span>    mkdir -p data/2024/q3</span></span>
<span class="line"><span>    cp -r template/ data/2024/q3/</span></span>
<span class="line"><span>    echo &quot;Project 2024 Q3 initialized&quot; &gt;&gt; log.txt</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 正解:一次性脚本就让它是脚本,don&#39;t pollute Justfile</span></span>
<span class="line"><span># ./scripts/init-2024-q3.sh</span></span></code></pre></div><p><strong>Justfile 是「项目能持续做的事」的清单</strong>——一次性命令进 <code>scripts/</code> 目录,不进 Justfile。</p><hr><h2 id="十三、ci-怎么配-just" tabindex="-1">十三、CI 怎么配 Just <a class="header-anchor" href="#十三、ci-怎么配-just" aria-label="Permalink to &quot;十三、CI 怎么配 Just&quot;">​</a></h2><h3 id="_13-1-github-actions" tabindex="-1">13.1 GitHub Actions <a class="header-anchor" href="#_13-1-github-actions" aria-label="Permalink to &quot;13.1 GitHub Actions&quot;">​</a></h3><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># .github/workflows/ci.yml</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">CI</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">on</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">push</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">pull_request</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">jobs</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  test</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    runs-on</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">ubuntu-latest</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    steps</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">uses</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">actions/checkout@v4</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      </span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">Install just</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        uses</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">extractions/setup-just@v2</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      </span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">Setup Rust</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        uses</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">dtolnay/rust-toolchain@stable</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      </span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">Run lint</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        run</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">just lint</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      </span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">Run tests</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        run</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">just test</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      </span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">Build</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        run</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">just build</span></span></code></pre></div><h3 id="_13-2-docker-镜像里装-just" tabindex="-1">13.2 Docker 镜像里装 just <a class="header-anchor" href="#_13-2-docker-镜像里装-just" aria-label="Permalink to &quot;13.2 Docker 镜像里装 just&quot;">​</a></h3><div class="language-dockerfile vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">dockerfile</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Dockerfile</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">FROM</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> rust:1.75-slim </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">as</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> builder</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 装 just</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">RUN</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> cargo install just</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">WORKDIR</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> /app</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">COPY</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> . .</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">RUN</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> just build</span></span></code></pre></div><p>或更轻量(不需要 Rust 工具链):</p><div class="language-dockerfile vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">dockerfile</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">RUN</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> curl --proto </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;=https&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> --tlsv1.2 -sSf https://just.systems/install.sh \\</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    | bash -s -- --to /usr/local/bin</span></span></code></pre></div><h3 id="_13-3-gitlab-ci" tabindex="-1">13.3 GitLab CI <a class="header-anchor" href="#_13-3-gitlab-ci" aria-label="Permalink to &quot;13.3 GitLab CI&quot;">​</a></h3><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># .gitlab-ci.yml</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">image</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">rust:1.75</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">before_script</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  - </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">curl --proto &#39;=https&#39; --tlsv1.2 -sSf https://just.systems/install.sh | bash -s -- --to /usr/local/bin</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">test</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  script</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">just test</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">build</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  script</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">just build</span></span></code></pre></div><p><strong>关键点</strong>:<strong>本地 <code>just test</code> 和 CI <code>just test</code> 是同一行命令</strong>——这是 just 的最大价值之一,<strong>你本地能跑的,CI 也能跑</strong>。<strong>CI 失败时,本地先 <code>just &lt;failed-recipe&gt;</code> 复现</strong>,不必反复 push 看 CI。</p><hr><h2 id="十四、社区案例-just-在哪些项目里跑" tabindex="-1">十四、社区案例:<code>just</code> 在哪些项目里跑 <a class="header-anchor" href="#十四、社区案例-just-在哪些项目里跑" aria-label="Permalink to &quot;十四、社区案例:\`just\` 在哪些项目里跑&quot;">​</a></h2><p>挑几个能见度高的:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>- bevy(Rust 游戏引擎)        — Justfile 几十个 recipe,管 examples / 测试 / publish</span></span>
<span class="line"><span>- nushell(现代 shell)        — 部分场景用 just 跑跨平台脚本</span></span>
<span class="line"><span>- helm                       — 部分子模块用 just(社区贡献)</span></span>
<span class="line"><span>- 大量 Rust 项目             — cargo 管构建,just 管编排</span></span>
<span class="line"><span>- chezmoi 用户 dotfiles      — 个人 dotfiles 用 just 跑同步 / 安装</span></span>
<span class="line"><span>- Astro / SvelteKit 项目     — package.json 之上加 Justfile 做 deploy 等</span></span></code></pre></div><p><strong>看 just 的官方 README 末尾「Projects using just」</strong>——可以看到从单人项目到大型开源都在用。</p><hr><h2 id="十五、看完应该能" tabindex="-1">十五、看完应该能 <a class="header-anchor" href="#十五、看完应该能" aria-label="Permalink to &quot;十五、看完应该能&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>□ 能讲清楚「任务运行器」和「构建工具」的本质区别,并指出</span></span>
<span class="line"><span>  自己 Makefile 里哪些 target 是错位的</span></span>
<span class="line"><span></span></span>
<span class="line"><span>□ 能用 just 写一个 Justfile,包含参数 / 默认值 / 依赖 / 平台分支 /</span></span>
<span class="line"><span>  shebang 切语言 / 私有 recipe</span></span>
<span class="line"><span></span></span>
<span class="line"><span>□ 知道 Make 在 2026 年仍然该用的 3 个场景(C/C++ 编译、LaTeX、</span></span>
<span class="line"><span>  团队都熟悉)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>□ 能在 5 分钟内把一个 Makefile 的 .PHONY 部分迁到 Justfile</span></span>
<span class="line"><span></span></span>
<span class="line"><span>□ 知道 Task 和 mise tasks 各自的甜头场景</span></span>
<span class="line"><span></span></span>
<span class="line"><span>□ 能给团队一份 50 行的 Justfile 模板,新人 clone 之后 \`just --list\`</span></span>
<span class="line"><span>  3 分钟看懂能跑什么</span></span>
<span class="line"><span></span></span>
<span class="line"><span>□ 知道 \`just --choose\` + fzf 怎么配,长 Justfile 也不必记名字</span></span>
<span class="line"><span></span></span>
<span class="line"><span>□ 反对的写法你都能 3 秒认出来:Make 当任务用 / 三套并存 /</span></span>
<span class="line"><span>  Justfile 200 行 / 一次性命令进 Justfile</span></span></code></pre></div><p>如果上面这 8 条你都能做到,这一篇就值了。</p><hr><h2 id="十六、节奏建议-今天就动一下" tabindex="-1">十六、节奏建议:今天就动一下 <a class="header-anchor" href="#十六、节奏建议-今天就动一下" aria-label="Permalink to &quot;十六、节奏建议:今天就动一下&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>第一步(10 分钟):看你最近一个项目的 Makefile</span></span>
<span class="line"><span>                  数 .PHONY 的数量,决定要不要迁</span></span>
<span class="line"><span></span></span>
<span class="line"><span>第二步(30 分钟):brew install just,在项目根写一个最小 Justfile</span></span>
<span class="line"><span>                  test / build / dev 三条 recipe,先跑通</span></span>
<span class="line"><span></span></span>
<span class="line"><span>第三步(1 小时):  把 Makefile 里 .PHONY 部分逐个迁 just,</span></span>
<span class="line"><span>                  老 Makefile 留构建那部分(或直接删)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>第四步(30 分钟):改 CI:make → just,push 验证</span></span>
<span class="line"><span></span></span>
<span class="line"><span>第五步(15 分钟):写 CONTRIBUTING 段:&quot;Tasks run via just,</span></span>
<span class="line"><span>                  run \`just --list\`&quot;,告诉团队</span></span>
<span class="line"><span></span></span>
<span class="line"><span>总耗时:&lt; 3 小时,长期受益每个新人 onboard 节省 1 天</span></span></code></pre></div><hr><h2 id="十七、踩坑提醒-总结" tabindex="-1">十七、踩坑提醒(总结) <a class="header-anchor" href="#十七、踩坑提醒-总结" aria-label="Permalink to &quot;十七、踩坑提醒(总结)&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 不要把 Makefile 当任务运行器写              → 错位 50 年,2026 该改</span></span>
<span class="line"><span>2. 不要装一堆任务运行器并存                   → just 一个就够</span></span>
<span class="line"><span>3. 不要在 Justfile 里写一次性命令              → 进 scripts/ 目录</span></span>
<span class="line"><span>4. 不要 Justfile 写 200 行不重构              → 拆 sub-justfile 或转 Python</span></span>
<span class="line"><span>5. 不要忘记 CI 里装 just                       → setup-just@v2 或 install.sh</span></span>
<span class="line"><span>6. 不要团队不告诉新人迁了 just                → 改 CONTRIBUTING + README</span></span>
<span class="line"><span>7. 不要 Makefile 和 Justfile 都写 deploy      → 重复定义,新人懵</span></span>
<span class="line"><span>8. 不要 npm scripts 复杂到反斜杠地狱          → 抽到 Justfile</span></span>
<span class="line"><span>9. 不要 task 数 &lt; 5 还配 Justfile             → 太小,直接 README 列即可</span></span>
<span class="line"><span>10. 不要 Justfile 用 .PHONY                   → just 没这语义,删掉</span></span></code></pre></div><hr><h2 id="十八、下一篇预告" tabindex="-1">十八、下一篇预告 <a class="header-anchor" href="#十八、下一篇预告" aria-label="Permalink to &quot;十八、下一篇预告&quot;">​</a></h2><p>下一篇:<strong><code>29-终端与Claude-Code工作流.md</code></strong>——这一篇讲了「任务运行器」是 2026 的项目入口,<strong>下一篇讲「Claude Code 怎么嵌进你的终端工作流」</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>你装上 Claude Code 之后,&quot;用得好&quot;和&quot;用得烂&quot;差距在工作流。</span></span>
<span class="line"><span>   - 你是&quot;在 VS Code 里偶尔点 Claude&quot; 还是 </span></span>
<span class="line"><span>     &quot;tmux + Claude Code + fzf 联动出击&quot;?</span></span>
<span class="line"><span>   - 长任务 6 小时怎么跑(IDE 死了 Claude 也死)?</span></span>
<span class="line"><span>   - 远端 dev box + 本地 attach 的姿势</span></span>
<span class="line"><span>   - fzf 选文件给 Claude 看</span></span>
<span class="line"><span>   - 多 instance 并行 / git worktree 工作流</span></span>
<span class="line"><span>   - CLAUDE.md / hooks / slash commands 怎么编排</span></span>
<span class="line"><span>   - 真实工程师一天的 Claude + tmux 使用录</span></span>
<span class="line"><span></span></span>
<span class="line"><span>这一篇是「终端工程」和「AI 工程」的接合点——</span></span>
<span class="line"><span>读完它你才能把 27 / 28 篇的工作流(脚本工程化 + 任务运行器)</span></span>
<span class="line"><span>和 Claude Code 真正连起来。</span></span></code></pre></div><p><strong>29 篇之后是 30 篇——「现代终端的未来」</strong>(Warp / WezTerm / Ghostty / Kitty / AI 原生终端走向),整个 terminalLearning 系列收尾。<strong>看完整套</strong>:<strong>你建立的就不再是&quot;我会用终端&quot;,而是&quot;我能把工作流系统化,并接入 AI 时代&quot;</strong>。</p>`,220)])])}const g=a(l,[["render",e]]);export{o as __pageData,g as default};
