import{c as a,Q as n,j as i,m as p}from"./chunks/framework.Bhbi9jCp.js";const r=JSON.parse('{"title":"终端 + Claude Code 工作流:用得好和用得烂差 5 倍生产力","description":"","frontmatter":{},"headers":[],"relativePath":"terminalLearning/29-终端与Claude-Code工作流.md","filePath":"terminalLearning/29-终端与Claude-Code工作流.md","lastUpdated":1779604575000}'),e={name:"terminalLearning/29-终端与Claude-Code工作流.md"};function l(t,s,h,d,o,k){return n(),i("div",null,[...s[0]||(s[0]=[p(`<h1 id="终端-claude-code-工作流-用得好和用得烂差-5-倍生产力" tabindex="-1">终端 + Claude Code 工作流:用得好和用得烂差 5 倍生产力 <a class="header-anchor" href="#终端-claude-code-工作流-用得好和用得烂差-5-倍生产力" aria-label="Permalink to &quot;终端 + Claude Code 工作流:用得好和用得烂差 5 倍生产力&quot;">​</a></h1><p>打开你身边任何一个用 Claude Code 的同事,看他怎么用的。<strong>九成是这样</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>他打开 VS Code,在底部 Terminal 里跑一个 claude</span></span>
<span class="line"><span>界面就停在那个 terminal 标签页里</span></span>
<span class="line"><span>他切到代码 tab 看文件 → 切回 terminal 给 Claude 指令 → 切到代码看改动</span></span>
<span class="line"><span>Claude 跑长任务时,他盯着进度条等 5 分钟</span></span>
<span class="line"><span>任务跑了 20 分钟,他不小心关了 VS Code → Claude 没了 → 任务报废</span></span>
<span class="line"><span>他重新开 Claude,从头描述刚才的任务 → 又是 20 分钟</span></span>
<span class="line"><span>晚上下班,Claude 跑着 refactor,他犹豫:要不要让它继续跑?关了它就死了</span></span>
<span class="line"><span>最后:关电脑,Claude 死,明早重来</span></span></code></pre></div><p><strong>另一个同事完全不同</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>她在 tmux 一个名为 &quot;claude&quot; 的 session 里跑 Claude</span></span>
<span class="line"><span>左 pane 是 Claude,右 pane 是她自己的 shell(git / 跑测试 / 看日志)</span></span>
<span class="line"><span>她用 fzf 选一批文件,xargs 喂给 Claude:&quot;重构这些 controller 的错误处理&quot;</span></span>
<span class="line"><span>Claude 跑起来,她切到另一个 pane 看 git log</span></span>
<span class="line"><span>6 点下班,Claude 跑到一半 → 她笔记本合盖 → Claude 跑在远端 dev box 的 tmux 里</span></span>
<span class="line"><span>明早 8 点 ssh 进去 tmux attach,看 Claude 跑完了 280 个文件</span></span>
<span class="line"><span>她 review diff,过的 commit,不过的让 Claude 重做</span></span>
<span class="line"><span>中午前完成的工作量,昨天前一个同事一整天做不完</span></span></code></pre></div><p><strong>这两个人用的同一个 Claude Code</strong>——区别不在 Claude,<strong>在他们怎么把 Claude 嵌进自己的终端工作流</strong>。这个差距通常是 3-5 倍生产力,而且会因为 AI 工具能力越强而越大——<strong>前者只能拿到 Claude 能力的 30%,后者拿到 90%</strong>。</p><blockquote><p>一句话先记住:<strong>Claude Code 不是 VS Code 插件,是一个终端原生的工具——它的最佳搭档是 tmux(管会话)+ fzf(选输入)+ 远端机器(跑长任务),不是 IDE 集成</strong>。<strong>你越懂终端,Claude 越像一个会写代码的同事;你越不懂,Claude 就只是一个高级聊天框</strong>。</p></blockquote><p>这一篇拆开讲:<strong>Claude Code 的&quot;形态&quot;和心智(它是个 CLI、它有 session、它会跑很久)、tmux + Claude 的五种工作流方案、fzf 喂文件给 Claude、多 instance 并行、git worktree + Claude、长任务的完成信号、CLAUDE.md 示例(40-60 行)、slash/hooks/agents 在工作流里的位置、跟 IDE 怎么混合、真实工程师一天、跨机器(本地 + dev box)的工作流、反对的写法、看完应该能、下一篇预告</strong>。<strong>这是 terminalLearning 系列的工作流总成</strong>——把前面所有篇(tmux / fzf / ssh / Justfile)的能力,全部串起来接到 Claude 上。</p><hr><h2 id="一、claude-code-的-形态-它到底是个什么" tabindex="-1">一、Claude Code 的&quot;形态&quot;:它到底是个什么 <a class="header-anchor" href="#一、claude-code-的-形态-它到底是个什么" aria-label="Permalink to &quot;一、Claude Code 的&quot;形态&quot;:它到底是个什么&quot;">​</a></h2><p>要把 Claude Code 接好,先理清它是个什么东西。<strong>它不是 IDE 插件</strong>,也<strong>不是网页聊天框</strong>——它是一个<strong>跑在你 shell 里的 CLI 程序</strong>。</p><h3 id="_1-1-几个事实" tabindex="-1">1.1 几个事实 <a class="header-anchor" href="#_1-1-几个事实" aria-label="Permalink to &quot;1.1 几个事实&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>□ Claude Code 是一个 Node.js 程序,名字叫 \`claude\`</span></span>
<span class="line"><span>□ 它跑在你的 shell 里,接 stdin/stdout,raw mode 接管 tty</span></span>
<span class="line"><span>□ 它读你的环境变量(ANTHROPIC_API_KEY、PATH、HOME、CWD)</span></span>
<span class="line"><span>□ 它读 ~/.claude/settings.json 和 ./.claude/settings.json</span></span>
<span class="line"><span>□ 它在当前目录开一个 &quot;session&quot; — 这次对话的记忆</span></span>
<span class="line"><span>□ 它通过工具(Bash / Edit / Read / WebFetch / MCP)动手做事</span></span>
<span class="line"><span>□ 它的输出是流式的(token by token),不是一次性返回</span></span>
<span class="line"><span>□ 你可以同时跑多个 instance(不同终端 pane 不同目录)</span></span>
<span class="line"><span>□ 长任务(refactor / 大批量改 / 跑测试)可能跑几分钟到几小时</span></span></code></pre></div><h3 id="_1-2-一张图-claude-在你机器上的位置" tabindex="-1">1.2 一张图:Claude 在你机器上的位置 <a class="header-anchor" href="#_1-2-一张图-claude-在你机器上的位置" aria-label="Permalink to &quot;1.2 一张图:Claude 在你机器上的位置&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌──────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│                  你的笔记本 / 远端 dev box                │</span></span>
<span class="line"><span>│                                                          │</span></span>
<span class="line"><span>│   ┌───────────────────────────────────────────────┐     │</span></span>
<span class="line"><span>│   │ tmux session &quot;dev&quot;                            │     │</span></span>
<span class="line"><span>│   │                                               │     │</span></span>
<span class="line"><span>│   │   ┌─────────────────┐   ┌─────────────────┐  │     │</span></span>
<span class="line"><span>│   │   │ pane 1: claude  │   │ pane 2: shell   │  │     │</span></span>
<span class="line"><span>│   │   │                 │   │                 │  │     │</span></span>
<span class="line"><span>│   │   │ &gt; refactor 200  │   │ $ git status    │  │     │</span></span>
<span class="line"><span>│   │   │   files...      │   │ $ rg &quot;TODO&quot;     │  │     │</span></span>
<span class="line"><span>│   │   │ Working...      │   │ $ just test     │  │     │</span></span>
<span class="line"><span>│   │   │                 │   │                 │  │     │</span></span>
<span class="line"><span>│   │   └────────┬────────┘   └─────────────────┘  │     │</span></span>
<span class="line"><span>│   │            │                                  │     │</span></span>
<span class="line"><span>│   │            │ 调工具                            │     │</span></span>
<span class="line"><span>│   │            ↓                                  │     │</span></span>
<span class="line"><span>│   │   ┌─────────────────────────────────────────┐│     │</span></span>
<span class="line"><span>│   │   │ Bash / Read / Edit / WebFetch / MCP    ││     │</span></span>
<span class="line"><span>│   │   └─────────────────────────────────────────┘│     │</span></span>
<span class="line"><span>│   └───────────────────────────────────────────────┘     │</span></span>
<span class="line"><span>│            ↑                                             │</span></span>
<span class="line"><span>│            │ ssh / detach 任何时间                       │</span></span>
<span class="line"><span>└────────────│─────────────────────────────────────────────┘</span></span>
<span class="line"><span>             │</span></span>
<span class="line"><span>             │</span></span>
<span class="line"><span>        ┌────┴────┐</span></span>
<span class="line"><span>        │ 你 在哪 │  ← 笔记本合盖 / SSH 进来 / 换一台机器</span></span>
<span class="line"><span>        └─────────┘  Claude 不在乎,它在 tmux 里继续跑</span></span></code></pre></div><p><strong>关键观察</strong>:<strong>Claude Code 是一个进程,这个进程跑在哪、活多久,完全是你的安排</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>你把它跑在 VS Code Terminal 里 → VS Code 一关,Claude 死</span></span>
<span class="line"><span>你把它跑在 SSH 直连终端里      → SSH 断,Claude 死</span></span>
<span class="line"><span>你把它跑在 tmux pane 里        → detach 也活着,attach 回来继续看</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  ★ 第三种是唯一适合长任务的方式</span></span></code></pre></div><h3 id="_1-3-三种生命周期的对照" tabindex="-1">1.3 三种生命周期的对照 <a class="header-anchor" href="#_1-3-三种生命周期的对照" aria-label="Permalink to &quot;1.3 三种生命周期的对照&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌──────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│            &quot;5 分钟任务&quot;   &quot;30 分钟任务&quot;   &quot;一晚上任务&quot;      │</span></span>
<span class="line"><span>├──────────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>│ VS Code 内      OK        勉强            完全不行         │</span></span>
<span class="line"><span>│ 直连 SSH        OK        勉强(怕断)    完全不行         │</span></span>
<span class="line"><span>│ tmux + 本地     OK        OK              OK(本地不死)   │</span></span>
<span class="line"><span>│ tmux + 远端     OK        OK              OK ★最稳        │</span></span>
<span class="line"><span>└──────────────────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>结论</strong>:<strong>任务时长 &gt; 15 分钟,必须 tmux</strong>。任务时长 &gt; 1 小时且你笔记本要合盖,<strong>必须远端 tmux</strong>。</p><hr><h2 id="二、心智-把-claude-code-当一个团队成员" tabindex="-1">二、心智:把 Claude Code 当一个团队成员 <a class="header-anchor" href="#二、心智-把-claude-code-当一个团队成员" aria-label="Permalink to &quot;二、心智:把 Claude Code 当一个团队成员&quot;">​</a></h2><p><strong>不要把 Claude Code 当工具</strong>——把它当一个<strong>已经入职、需要交接、能自己干活但需要上下文</strong>的同事。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>工具的特征:</span></span>
<span class="line"><span>   - 你输入 → 它输出</span></span>
<span class="line"><span>   - 你不操作,它什么都不做</span></span>
<span class="line"><span>   - 它没有状态,每次重新开始</span></span>
<span class="line"><span></span></span>
<span class="line"><span>同事的特征:</span></span>
<span class="line"><span>   - 你给目标 → 它自己拆任务</span></span>
<span class="line"><span>   - 你不在,它可以继续干</span></span>
<span class="line"><span>   - 它有记忆(这个项目、这次对话)</span></span>
<span class="line"><span>   - 它会问你不清楚的问题</span></span>
<span class="line"><span>   - 它会主动汇报进度</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  Claude Code 在第二类</span></span></code></pre></div><h3 id="_2-1-这种心智下的工作流原则" tabindex="-1">2.1 这种心智下的工作流原则 <a class="header-anchor" href="#_2-1-这种心智下的工作流原则" aria-label="Permalink to &quot;2.1 这种心智下的工作流原则&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>原则 1:它能独立工作时,不打扰你</span></span>
<span class="line"><span>   ── 你让它 refactor 200 个文件,它不必每改一个问你</span></span>
<span class="line"><span>   ── 你的工作流要支持&quot;它在跑、你在别的事&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>原则 2:你可以随时回头看进度</span></span>
<span class="line"><span>   ── 不能&quot;丢出去就丢了&quot;,要能 attach 回来</span></span>
<span class="line"><span>   ── tmux + 流式输出 + 可滚动 buffer</span></span>
<span class="line"><span></span></span>
<span class="line"><span>原则 3:它需要明确的目标和约束</span></span>
<span class="line"><span>   ── 不是&quot;帮我搞一下&quot; → 是 &quot;把这 50 个 controller 的错误处理</span></span>
<span class="line"><span>     从 try-catch + console.log 改成 Result&lt;T, E&gt; 模式,</span></span>
<span class="line"><span>     带单元测试,不破坏现有 API&quot;</span></span>
<span class="line"><span>   ── 这种交接质量决定 Claude 能不能独立干</span></span>
<span class="line"><span></span></span>
<span class="line"><span>原则 4:你要 review 它的产出</span></span>
<span class="line"><span>   ── 它是同事,不是上司,它的 PR 你要看</span></span>
<span class="line"><span>   ── 不要 &quot;Claude 改完直接 commit&quot;</span></span></code></pre></div><p><strong>这四条是 Claude Code 在终端里的工作流地基</strong>。后面的五种方案都是在这套心智上展开的。</p><hr><h2 id="三、方案-1-tmux-一个-session-claude-在一个-pane-里跑" tabindex="-1">三、方案 1:tmux 一个 session,Claude 在一个 pane 里跑 <a class="header-anchor" href="#三、方案-1-tmux-一个-session-claude-在一个-pane-里跑" aria-label="Permalink to &quot;三、方案 1:tmux 一个 session,Claude 在一个 pane 里跑&quot;">​</a></h2><p>最基础的姿势,<strong>也是日常 80% 场景</strong>。</p><h3 id="_3-1-起一个-dev-session" tabindex="-1">3.1 起一个 dev session <a class="header-anchor" href="#_3-1-起一个-dev-session" aria-label="Permalink to &quot;3.1 起一个 dev session&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 进入项目根</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">cd</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ~/code/myapp</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 起 tmux session,起名为 dev(用项目名也行)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">tmux</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> new-session</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -s</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> myapp</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 在 session 里,水平 split:左 60% 给 claude,右 40% 给 shell</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># C-b %         (vertical split,Ctrl-B 然后 %)</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># C-b ←/→       切 pane</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 左 pane:</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">claude</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 切到右 pane:</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># C-b →</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 然后正常 git / rg / just test</span></span></code></pre></div><p><strong>结果</strong>:你在一个 tmux 里同时看 Claude 和自己的 shell,<strong>Claude 跑长任务时你切右 pane 干别的事</strong>。</p><h3 id="_3-2-justfile-一键起-dev-环境" tabindex="-1">3.2 Justfile 一键起 dev 环境 <a class="header-anchor" href="#_3-2-justfile-一键起-dev-环境" aria-label="Permalink to &quot;3.2 Justfile 一键起 dev 环境&quot;">​</a></h3><p>把 27 / 28 篇的 Justfile 接进来。在项目根加一段 recipe:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># Justfile</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 起开发 session:tmux + claude + 你的 shell</span></span>
<span class="line"><span>dev:</span></span>
<span class="line"><span>    #!/usr/bin/env bash</span></span>
<span class="line"><span>    set -e</span></span>
<span class="line"><span>    </span></span>
<span class="line"><span>    SESSION=&quot;dev-$(basename $(pwd))&quot;</span></span>
<span class="line"><span>    </span></span>
<span class="line"><span>    if tmux has-session -t &quot;$SESSION&quot; 2&gt;/dev/null; then</span></span>
<span class="line"><span>        echo &quot;Session $SESSION exists, attaching...&quot;</span></span>
<span class="line"><span>        tmux attach -t &quot;$SESSION&quot;</span></span>
<span class="line"><span>        exit 0</span></span>
<span class="line"><span>    fi</span></span>
<span class="line"><span>    </span></span>
<span class="line"><span>    tmux new-session -d -s &quot;$SESSION&quot; -c &quot;$(pwd)&quot;</span></span>
<span class="line"><span>    tmux split-window -h -t &quot;$SESSION&quot; -c &quot;$(pwd)&quot;</span></span>
<span class="line"><span>    tmux select-pane -t &quot;$SESSION&quot;:0.0</span></span>
<span class="line"><span>    tmux send-keys -t &quot;$SESSION&quot;:0.0 &quot;claude&quot; C-m</span></span>
<span class="line"><span>    tmux attach -t &quot;$SESSION&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 关掉这个项目的 session</span></span>
<span class="line"><span>dev-kill:</span></span>
<span class="line"><span>    tmux kill-session -t &quot;dev-$(basename $(pwd))&quot; 2&gt;/dev/null || true</span></span></code></pre></div><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> just</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> dev</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">               # 起一个新 session 或 attach 已有的</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> just</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> dev-kill</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">          # 关掉</span></span></code></pre></div><p><strong>这一段 recipe 让&quot;开始工作&quot;变成 <code>just dev</code></strong>——3 秒进入&quot;Claude + 你的 shell + tmux&quot;全套配置。</p><h3 id="_3-3-配-tmux-resurrect-重启后恢复" tabindex="-1">3.3 配 tmux-resurrect:重启后恢复 <a class="header-anchor" href="#_3-3-配-tmux-resurrect-重启后恢复" aria-label="Permalink to &quot;3.3 配 tmux-resurrect:重启后恢复&quot;">​</a></h3><p>如果你 17 篇看过 tmux 工作流配置,会装 tmux-resurrect / tmux-continuum:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># ~/.tmux.conf 片段</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">set</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -g</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> @plugin</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;tmux-plugins/tmux-resurrect&#39;</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">set</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -g</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> @plugin</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;tmux-plugins/tmux-continuum&#39;</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">set</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -g</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> @continuum-restore</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;on&#39;</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">set</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -g</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> @continuum-save-interval</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;15&#39;</span></span></code></pre></div><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>笔记本重启 / tmux 进程死后:</span></span>
<span class="line"><span>   tmux 自动重建上次的 session 布局</span></span>
<span class="line"><span>   pane 数量、位置都恢复</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>注意:resurrect 不能恢复 pane 里跑的进程的状态</span></span>
<span class="line"><span>   Claude 的 session 内存会丢(因为 claude 进程是新的)</span></span>
<span class="line"><span>   但你的 tmux 布局 / 路径 / 历史 / 在哪个 pane 都恢复</span></span></code></pre></div><p><strong>最佳实践</strong>:<strong>笔记本日常重启 OK,但「Claude 长任务」要么本地不关机,要么放远端</strong>。</p><hr><h2 id="四、方案-2-claude-code-跑远端-dev-box-本地-attach" tabindex="-1">四、方案 2:Claude Code 跑远端 dev box + 本地 attach <a class="header-anchor" href="#四、方案-2-claude-code-跑远端-dev-box-本地-attach" aria-label="Permalink to &quot;四、方案 2:Claude Code 跑远端 dev box + 本地 attach&quot;">​</a></h2><p><strong>真正的杀手锏</strong>——这是让笔记本合盖、Claude 跑一晚上的姿势。</p><h3 id="_4-1-远端-dev-box-架构" tabindex="-1">4.1 远端 dev box 架构 <a class="header-anchor" href="#_4-1-远端-dev-box-架构" aria-label="Permalink to &quot;4.1 远端 dev box 架构&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌──────────────────────────────┐         ┌──────────────────────────────┐</span></span>
<span class="line"><span>│  你的笔记本                  │   ssh   │  远端 dev box / cloud VM     │</span></span>
<span class="line"><span>│  (合盖也无所谓)              │ ───────▶│                              │</span></span>
<span class="line"><span>│                              │         │  ┌────────────────────────┐  │</span></span>
<span class="line"><span>│  iTerm / Ghostty             │         │  │ tmux session &quot;claude&quot;  │  │</span></span>
<span class="line"><span>│   ↓                          │         │  │                        │  │</span></span>
<span class="line"><span>│   ssh dev                    │         │  │  &gt; claude              │  │</span></span>
<span class="line"><span>│   ↓                          │         │  │    Working on refactor │  │</span></span>
<span class="line"><span>│   tmux attach -t claude      │         │  │    140/200 files done  │  │</span></span>
<span class="line"><span>│                              │         │  │    ...                 │  │</span></span>
<span class="line"><span>│                              │         │  └────────────────────────┘  │</span></span>
<span class="line"><span>└──────────────────────────────┘         └──────────────────────────────┘</span></span>
<span class="line"><span>                                                ↑</span></span>
<span class="line"><span>                                                │ Claude 跑一晚上</span></span>
<span class="line"><span>                                                │ 你不在也活着</span></span>
<span class="line"><span>                                                └ 远端机不睡觉</span></span></code></pre></div><h3 id="_4-2-一次性配置-ssh-tmux" tabindex="-1">4.2 一次性配置 ssh + tmux <a class="header-anchor" href="#_4-2-一次性配置-ssh-tmux" aria-label="Permalink to &quot;4.2 一次性配置 ssh + tmux&quot;">​</a></h3><p>15 篇 ssh 深用 + 16/17 篇 tmux 配过的话,这一步就是几行:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># ~/.ssh/config</span></span>
<span class="line"><span>Host dev</span></span>
<span class="line"><span>    HostName dev-box.example.com</span></span>
<span class="line"><span>    User work</span></span>
<span class="line"><span>    IdentityFile ~/.ssh/id_ed25519</span></span>
<span class="line"><span>    ForwardAgent yes</span></span>
<span class="line"><span>    ServerAliveInterval 60</span></span>
<span class="line"><span>    ServerAliveCountMax 3</span></span></code></pre></div><p>然后:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 在远端启动一个永久 tmux session</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ssh</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> dev</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">[dev]$ tmux new-session -s claude -d -c </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">~</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">/code/myapp</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">[dev]$ tmux send-keys -t claude </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;claude&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> C-m</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">[dev]$ exit</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 本地一行 attach</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ssh</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> dev</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -t</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;tmux attach -t claude&quot;</span></span></code></pre></div><p><strong>做成 alias</strong> 更顺手:</p><div class="language-zsh vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">zsh</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># ~/.zshrc</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">alias</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> claude-remote</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;ssh dev -t &quot;tmux attach -t claude || tmux new -s claude -c ~/code/myapp&quot;&#39;</span></span></code></pre></div><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> claude-remote</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">          # 一键进远端 Claude</span></span></code></pre></div><h3 id="_4-3-真实场景-让-claude-跑一晚上" tabindex="-1">4.3 真实场景:让 Claude 跑一晚上 <a class="header-anchor" href="#_4-3-真实场景-让-claude-跑一晚上" aria-label="Permalink to &quot;4.3 真实场景:让 Claude 跑一晚上&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>17:30  下班前你在远端 tmux 里给 Claude 一个任务:</span></span>
<span class="line"><span>       &quot;把 src/ 下所有 controller 的错误处理重构成 Result 模式,</span></span>
<span class="line"><span>        每改一个跑该模块测试,失败立刻停,把 progress 记到</span></span>
<span class="line"><span>        REFACTOR_LOG.md&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>17:35  Claude 开始读代码、做 plan、改文件</span></span>
<span class="line"><span>       你在远端 tmux 看了 5 分钟,确认 plan 合理</span></span>
<span class="line"><span>       Ctrl-B D detach,关掉本地 SSH,笔记本合盖,走人</span></span>
<span class="line"><span></span></span>
<span class="line"><span>晚上    Claude 在远端跑了 6 小时,改了 180 个文件</span></span>
<span class="line"><span>       每改一个跑测试,失败的 3 个回滚</span></span>
<span class="line"><span>       REFACTOR_LOG.md 累计 200 行</span></span>
<span class="line"><span></span></span>
<span class="line"><span>次日 09:00  ssh dev -t &quot;tmux attach -t claude&quot;</span></span>
<span class="line"><span>            Claude 输出:&quot;Done. 180/183 successful. See REFACTOR_LOG.md&quot;</span></span>
<span class="line"><span>            你 cat REFACTOR_LOG.md 看哪些回滚了</span></span>
<span class="line"><span>            review diff,commit 通过的,让 Claude 重做失败的 3 个</span></span>
<span class="line"><span></span></span>
<span class="line"><span>整夜睡觉 = 一个工作日的工作量</span></span>
<span class="line"><span>   ── 这是 Claude Code + 远端 tmux 的真正威力</span></span></code></pre></div><p><strong>关键点</strong>:<strong>这个工作流的所有&quot;魔法&quot;都来自 tmux + ssh,而不是 Claude 本身的某个特性</strong>——Claude 在哪个 shell 里都一样,但你的 shell 在哪、活多久,决定了 Claude 能干多大的事。</p><h3 id="_4-4-注意事项" tabindex="-1">4.4 注意事项 <a class="header-anchor" href="#_4-4-注意事项" aria-label="Permalink to &quot;4.4 注意事项&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>□ 远端机要够大:Claude refactor 时 Node 进程 + 跑测试 + grep </span></span>
<span class="line"><span>  大批文件可能 4-8GB 内存</span></span>
<span class="line"><span>□ 远端机不要 idle shutdown:云厂商有&quot;X 小时无活动自动关机&quot;功能,</span></span>
<span class="line"><span>  Claude 跑测试有 CPU 但 SSH 无人 attach,要确认这种判定不会触发</span></span>
<span class="line"><span>□ API key 要在远端的 ~/.zshrc(或 ~/.claude/settings.json)里</span></span>
<span class="line"><span>  不要 forward 本地 env(SSH 不 forward 这个)</span></span>
<span class="line"><span>□ ssh agent forwarding 共享 GitHub key,Claude 远端能 git push</span></span>
<span class="line"><span>  ssh -A 或 config 里 ForwardAgent yes</span></span>
<span class="line"><span>□ tmux session 长时间运行,buffer 会涨大,有时要 clear-history</span></span>
<span class="line"><span>  C-b :clear-history</span></span></code></pre></div><hr><h2 id="五、方案-3-fzf-选文件喂给-claude" tabindex="-1">五、方案 3:fzf 选文件喂给 Claude <a class="header-anchor" href="#五、方案-3-fzf-选文件喂给-claude" aria-label="Permalink to &quot;五、方案 3:fzf 选文件喂给 Claude&quot;">​</a></h2><p>12 篇讲了 fzf 心智——把它嵌进 Claude 的工作流,<strong>选文件给 Claude 看比手敲路径快 10 倍</strong>。</p><h3 id="_5-1-一个函数-claude-this" tabindex="-1">5.1 一个函数 <code>claude-this</code> <a class="header-anchor" href="#_5-1-一个函数-claude-this" aria-label="Permalink to &quot;5.1 一个函数 \`claude-this\`&quot;">​</a></h3><div class="language-zsh vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">zsh</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># ~/.zshrc</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 用 fzf 选多个文件,把路径列表喂给 claude</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">claude-this</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">() {</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    local</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> files</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    files</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$(</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">fd</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --type</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> f</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --hidden</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --exclude</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> .git</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">        |</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> fzf</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --multi</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">              --height</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 60%</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">              --preview</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;bat --color=always --line-range :100 {}&#39;</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">              --prompt</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;Send files to Claude &gt; &#39;</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">              --header</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;TAB to mark, ENTER to send&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    </span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    [ </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">-z</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$files</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> ] &amp;&amp; </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">return</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    </span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # 把选中文件的路径喂给 Claude 当 prompt</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    local</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> prompt</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    prompt</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$(</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">echo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$files</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> |</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> sed</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;s/^/- /&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    prompt</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;Read these files and explain the architecture:</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$prompt</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    </span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    echo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$prompt</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> |</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> claude</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span></code></pre></div><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> claude-this</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 弹出 fzf,Tab 标记多个文件,Enter</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Claude 拿到一个 prompt:</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#   Read these files and explain the architecture:</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#   - src/auth/login.ts</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#   - src/auth/session.ts</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#   - src/auth/middleware.ts</span></span></code></pre></div><p><strong>这套姿势比&quot;手敲 @ 文件名&quot;快 10 倍</strong>。</p><h3 id="_5-2-进阶变种-按-prompt-模板组合" tabindex="-1">5.2 进阶变种:按 prompt 模板组合 <a class="header-anchor" href="#_5-2-进阶变种-按-prompt-模板组合" aria-label="Permalink to &quot;5.2 进阶变种:按 prompt 模板组合&quot;">​</a></h3><div class="language-zsh vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">zsh</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">claude-refactor</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">() {</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    local</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> files</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    files</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$(</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">fd</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --type</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> f</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -e</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ts</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -e</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> tsx</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">        |</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> fzf</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --multi</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --prompt</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;Files to refactor &gt; &#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    [ </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">-z</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$files</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> ] &amp;&amp; </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">return</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    </span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    local</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> task</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    task</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$(</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">gum</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> input</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --placeholder</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;What refactoring?&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    [ </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">-z</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$task</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> ] &amp;&amp; </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">return</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    </span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    local</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> prompt</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    prompt</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;Refactor the following files:</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">$(</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">echo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$files</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot; </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">|</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> sed</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;s/^/- /&#39;)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">Task: </span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$task</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">Requirements:</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">- Don&#39;t break existing tests</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">- Keep public API stable</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">- Add a one-line commit message at the end&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    </span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    echo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$prompt</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> |</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> claude</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span></code></pre></div><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> claude-refactor</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># fzf 选文件 → gum input 输入任务 → 组装 prompt 喂给 Claude</span></span></code></pre></div><p><strong>这是&quot;半结构化任务&quot;的 1 秒起步姿势</strong>——选文件 + 一句任务,Claude 就拿到完整 prompt。</p><h3 id="_5-3-把-fzf-嵌进-claude-自己" tabindex="-1">5.3 把 fzf 嵌进 Claude 自己 <a class="header-anchor" href="#_5-3-把-fzf-嵌进-claude-自己" aria-label="Permalink to &quot;5.3 把 fzf 嵌进 Claude 自己&quot;">​</a></h3><p>也可以反过来:<strong>Claude 在跑过程中,通过 hook 或 slash command 调 fzf 让你选</strong>:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># .claude/commands/pick-files.sh</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#!/usr/bin/env bash</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">fd</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --type</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> f</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> |</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> fzf</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --multi</span></span></code></pre></div><div class="language-markdown vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">markdown</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;"># .claude/commands/pick-files.md</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">---</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">description: Pick files via fzf and pass to next prompt</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">---</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">Run </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">\`bash .claude/commands/pick-files.sh\`</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> and use the output as targets for the next task.</span></span></code></pre></div><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>你在 Claude 里输入:</span></span>
<span class="line"><span>   /pick-files</span></span>
<span class="line"><span>   接下来对这些文件做 X</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Claude 调 fzf → 你选 → Claude 拿到列表</span></span></code></pre></div><p><strong>这种集成是 Claude Code 在 IDE 里做不到的</strong>——VS Code 嵌入式 Claude 没法调系统 fzf。</p><hr><h2 id="六、方案-4-多-instance-并行" tabindex="-1">六、方案 4:多 instance 并行 <a class="header-anchor" href="#六、方案-4-多-instance-并行" aria-label="Permalink to &quot;六、方案 4:多 instance 并行&quot;">​</a></h2><p>Claude Code 可以跑多个 instance —— 不同 tmux session 跑不同项目的 Claude,或者同一项目的不同任务。</p><h3 id="_6-1-典型场景-三-instance" tabindex="-1">6.1 典型场景:三 instance <a class="header-anchor" href="#_6-1-典型场景-三-instance" aria-label="Permalink to &quot;6.1 典型场景:三 instance&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌──────────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│ tmux session: project-a                                          │</span></span>
<span class="line"><span>│   pane 1: claude (refactoring branch)                            │</span></span>
<span class="line"><span>│   pane 2: shell (git, tests)                                     │</span></span>
<span class="line"><span>└──────────────────────────────────────────────────────────────────┘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>┌──────────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│ tmux session: project-a-review                                   │</span></span>
<span class="line"><span>│   pane 1: claude --resume &lt;session-id&gt;                           │</span></span>
<span class="line"><span>│           ── 让 Claude 在另一个分支 review 上面那个 Claude 的产出 │</span></span>
<span class="line"><span>│   pane 2: shell                                                  │</span></span>
<span class="line"><span>└──────────────────────────────────────────────────────────────────┘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>┌──────────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│ tmux session: project-b                                          │</span></span>
<span class="line"><span>│   pane 1: claude (写文档)                                        │</span></span>
<span class="line"><span>│   pane 2: shell                                                  │</span></span>
<span class="line"><span>└──────────────────────────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>心智</strong>:<strong>一个 instance 写代码 + 一个 instance review + 一个 instance 写文档</strong>——三个 Claude 在不同上下文同时干。</p><h3 id="_6-2-切换-tmux-switch-client" tabindex="-1">6.2 切换:<code>tmux switch-client</code> <a class="header-anchor" href="#_6-2-切换-tmux-switch-client" aria-label="Permalink to &quot;6.2 切换:\`tmux switch-client\`&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 列所有 session</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">C-b</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> s</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 直接切到某个 session</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> tmux</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> switch-client</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -t</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> project-b</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 配 prefix + 数字直接切</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># .tmux.conf</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">bind</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 1</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> switch-client</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -t</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> project-a</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">bind</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 2</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> switch-client</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -t</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> project-a-review</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">bind</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 3</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> switch-client</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -t</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> project-b</span></span></code></pre></div><h3 id="_6-3-重要-不要在同一个项目同时改" tabindex="-1">6.3 重要:不要在同一个项目同时改 <a class="header-anchor" href="#_6-3-重要-不要在同一个项目同时改" aria-label="Permalink to &quot;6.3 重要:不要在同一个项目同时改&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>危险姿势:同一个 git repo 两个 Claude instance 同时改文件</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  instance 1: 改 src/auth.ts</span></span>
<span class="line"><span>  instance 2: 改 src/auth.ts(同时)</span></span>
<span class="line"><span>  → 冲突 / 互相覆盖 / 一个的改动被另一个吃掉</span></span>
<span class="line"><span></span></span>
<span class="line"><span>正解:</span></span>
<span class="line"><span>  □ 不同项目:OK</span></span>
<span class="line"><span>  □ 同项目读不同子目录:OK(但你心里要清楚)</span></span>
<span class="line"><span>  □ 同项目改同子目录:坚决不要,或用 git worktree(下一节)</span></span></code></pre></div><hr><h2 id="七、方案-5-claude-git-worktree" tabindex="-1">七、方案 5:Claude + git worktree <a class="header-anchor" href="#七、方案-5-claude-git-worktree" aria-label="Permalink to &quot;七、方案 5:Claude + git worktree&quot;">​</a></h2><p><strong>让 Claude 在 git worktree(平行分支)里干活,不污染主工作目录</strong>——这是高级姿势,适合&quot;大重构&quot;或&quot;试验性改动&quot;。</p><h3 id="_7-1-git-worktree-速成" tabindex="-1">7.1 git worktree 速成 <a class="header-anchor" href="#_7-1-git-worktree-速成" aria-label="Permalink to &quot;7.1 git worktree 速成&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 在主 repo 里创建一个 worktree,放在 ../myapp-refactor</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> cd</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ~/code/myapp</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                   # 主工作目录</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> git</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> worktree</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> add</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ../myapp-refactor</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> refactor-branch</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 现在两个目录同时存在</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">~</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">/code/myapp              </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># main 分支</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">~</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">/code/myapp-refactor     </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># refactor 分支(同一个 .git)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 两边可以独立编辑,不互相影响</span></span></code></pre></div><h3 id="_7-2-在-worktree-里跑-claude" tabindex="-1">7.2 在 worktree 里跑 Claude <a class="header-anchor" href="#_7-2-在-worktree-里跑-claude" aria-label="Permalink to &quot;7.2 在 worktree 里跑 Claude&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> cd</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ~/code/myapp-refactor</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> claude</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">&gt;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> refactor src/auth/</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">*</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> to use Result</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">&lt;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">T, E</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">&gt;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> pattern</span></span></code></pre></div><p><strong>Claude 改的是 refactor 分支的文件</strong>,你主工作目录的 main 分支不受影响。</p><h3 id="_7-3-完事-merge-丢弃" tabindex="-1">7.3 完事 merge / 丢弃 <a class="header-anchor" href="#_7-3-完事-merge-丢弃" aria-label="Permalink to &quot;7.3 完事 merge / 丢弃&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 进 worktree 看 Claude 改了什么</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> cd</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ~/code/myapp-refactor</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> git</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> log</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --oneline</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> git</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> diff</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> main</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 满意:merge 回 main</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> cd</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ~/code/myapp</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> git</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> merge</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> refactor-branch</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 不满意:丢弃整个 worktree</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> git</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> worktree</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> remove</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ../myapp-refactor</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> git</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> branch</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -D</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> refactor-branch</span></span></code></pre></div><p><strong>这套姿势让 Claude 大改不必担心污染主工作目录</strong>——你 main 分支随时能 <code>pnpm dev</code> 验证,Claude 的实验在另一个目录里独立进行。</p><h3 id="_7-4-配-justfile-一键-worktree" tabindex="-1">7.4 配 Justfile 一键 worktree <a class="header-anchor" href="#_7-4-配-justfile-一键-worktree" aria-label="Permalink to &quot;7.4 配 Justfile 一键 worktree&quot;">​</a></h3><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># Justfile</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 在 ../&lt;project&gt;-&lt;branch&gt; 创建 worktree 并起 Claude</span></span>
<span class="line"><span>worktree branch:</span></span>
<span class="line"><span>    #!/usr/bin/env bash</span></span>
<span class="line"><span>    set -e</span></span>
<span class="line"><span>    project=$(basename &quot;$(pwd)&quot;)</span></span>
<span class="line"><span>    target=&quot;../\${project}-{{branch}}&quot;</span></span>
<span class="line"><span>    </span></span>
<span class="line"><span>    if [ -d &quot;$target&quot; ]; then</span></span>
<span class="line"><span>        echo &quot;Worktree $target exists&quot;</span></span>
<span class="line"><span>    else</span></span>
<span class="line"><span>        git worktree add &quot;$target&quot; -b &quot;{{branch}}&quot;</span></span>
<span class="line"><span>    fi</span></span>
<span class="line"><span>    </span></span>
<span class="line"><span>    # 在新 worktree 里起 tmux + claude</span></span>
<span class="line"><span>    SESSION=&quot;\${project}-{{branch}}&quot;</span></span>
<span class="line"><span>    tmux new-session -d -s &quot;$SESSION&quot; -c &quot;$target&quot;</span></span>
<span class="line"><span>    tmux send-keys -t &quot;$SESSION&quot; &quot;claude&quot; C-m</span></span>
<span class="line"><span>    tmux attach -t &quot;$SESSION&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>worktree-remove branch:</span></span>
<span class="line"><span>    #!/usr/bin/env bash</span></span>
<span class="line"><span>    project=$(basename &quot;$(pwd)&quot;)</span></span>
<span class="line"><span>    tmux kill-session -t &quot;\${project}-{{branch}}&quot; 2&gt;/dev/null || true</span></span>
<span class="line"><span>    git worktree remove &quot;../\${project}-{{branch}}&quot;</span></span>
<span class="line"><span>    git branch -D &quot;{{branch}}&quot; || true</span></span></code></pre></div><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> just</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> worktree</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> refactor-auth</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">         # 一键开 worktree + Claude</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> just</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> worktree-remove</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> refactor-auth</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  # 一键清理</span></span></code></pre></div><hr><h2 id="八、长任务的完成-信号" tabindex="-1">八、长任务的完成&quot;信号&quot; <a class="header-anchor" href="#八、长任务的完成-信号" aria-label="Permalink to &quot;八、长任务的完成&quot;信号&quot;&quot;">​</a></h2><p>Claude 跑 30 分钟的任务,你不会盯屏幕。<strong>你需要&quot;完成通知&quot;</strong>。</p><h3 id="_8-1-hook-stop-事件发通知" tabindex="-1">8.1 hook:Stop 事件发通知 <a class="header-anchor" href="#_8-1-hook-stop-事件发通知" aria-label="Permalink to &quot;8.1 hook:Stop 事件发通知&quot;">​</a></h3><p><code>~/.claude/settings.json</code>:</p><div class="language-json vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">json</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">{</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  &quot;hooks&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: {</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    &quot;Stop&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      {</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        &quot;matcher&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;*&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        &quot;hooks&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">          {</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">            &quot;type&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;command&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">            &quot;command&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;~/.claude/hooks/notify.sh&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">          }</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        ]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      }</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    ]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  }</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span></code></pre></div><p><code>~/.claude/hooks/notify.sh</code>:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#!/usr/bin/env bash</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># macOS 桌面通知</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">osascript</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -e</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;display notification &quot;Claude finished a task&quot; with title &quot;Claude Code&quot; sound name &quot;Glass&quot;&#39;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Linux:</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># notify-send &quot;Claude Code&quot; &quot;Finished a task&quot;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 远端机:用 ntfy.sh 推到手机</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># curl -d &quot;Claude finished refactor&quot; ntfy.sh/your-topic-name</span></span></code></pre></div><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> chmod</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> +x</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ~/.claude/hooks/notify.sh</span></span></code></pre></div><p><strong>Claude 每次完成一轮响应,你的桌面 / 手机弹个通知</strong>——不必盯屏幕。</p><h3 id="_8-2-推手机-ntfy-sh" tabindex="-1">8.2 推手机:ntfy.sh <a class="header-anchor" href="#_8-2-推手机-ntfy-sh" aria-label="Permalink to &quot;8.2 推手机:ntfy.sh&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#!/usr/bin/env bash</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># ~/.claude/hooks/notify.sh</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 推到 ntfy.sh,手机装 ntfy app 订阅 your-topic 就能收到</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">curl</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -d</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;Claude task done&quot;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;https://ntfy.sh/claude-&lt;your-name&gt;&quot;</span></span></code></pre></div><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>你在远端 dev box 让 Claude 跑一晚上</span></span>
<span class="line"><span>手机睡前 mute,设了&quot;Claude&quot; 这个 topic 允许通知</span></span>
<span class="line"><span>凌晨 3 点 Claude 完成 → 推送但不响铃</span></span>
<span class="line"><span>明早起来看一眼:&quot;哦,跑完了&quot;</span></span>
<span class="line"><span>8 点 ssh attach 看结果</span></span></code></pre></div><h3 id="_8-3-监控-watch-tmux-capture-pane" tabindex="-1">8.3 监控:watch + tmux capture-pane <a class="header-anchor" href="#_8-3-监控-watch-tmux-capture-pane" aria-label="Permalink to &quot;8.3 监控:watch + tmux capture-pane&quot;">​</a></h3><p>如果你不想用 hook,<strong>远程 watch 一个 tmux pane 的输出</strong>:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 每 30 秒抓一次 pane 内容,grep 是否出现完成关键词</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">watch</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -n</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 30</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;ssh dev &quot;tmux capture-pane -p -t claude&quot; | tail -20&#39;</span></span></code></pre></div><p>或写到日志,本地 tail -f:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ssh</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> dev</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;tmux capture-pane -p -t claude&quot;</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> &gt;&gt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ~/claude-log.txt</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> tail</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -f</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ~/claude-log.txt</span></span></code></pre></div><hr><h2 id="九、claude-md-项目记忆" tabindex="-1">九、CLAUDE.md:项目记忆 <a class="header-anchor" href="#九、claude-md-项目记忆" aria-label="Permalink to &quot;九、CLAUDE.md:项目记忆&quot;">​</a></h2><p><strong>项目根放一个 CLAUDE.md,Claude 启动时自动读</strong>——这是&quot;项目说明书 + 风格规范 + 禁忌&quot;。</p><h3 id="_9-1-一份-50-行模板" tabindex="-1">9.1 一份 50 行模板 <a class="header-anchor" href="#_9-1-一份-50-行模板" aria-label="Permalink to &quot;9.1 一份 50 行模板&quot;">​</a></h3><div class="language-markdown vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">markdown</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;"># 项目说明</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">## 项目是什么</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 内部 CRM 系统,服务销售 + 售后 ~200 人 DAU</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 后端 monorepo(本仓库),前端在 myapp-frontend</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">## 技术栈</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 语言:TypeScript strict、Python 3.12</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 后端:NestJS + Postgres 16 + Redis + RabbitMQ</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 部署:K8s on EKS,镜像走 GHCR</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 监控:Datadog + Sentry</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">## 目录结构</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> apps/api/     主后端 API</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> apps/worker/  消费 MQ 的 worker</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> packages/db/  Drizzle schema(改这里 = 改数据库)</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> packages/shared/  跨服务共享类型</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> scripts/      ops 脚本(不要往这堆任务,任务用 Justfile)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">## 约定</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> commit message:conventional commits(feat: / fix: / refactor:)</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 数据库改动一律走 migration</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 新 API 走 tRPC,不要再写 REST</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 测试用 vitest,不要 jest</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> Python 部分用 ruff + pytest,不要 black + unittest</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">## 命令(用 just)</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> just dev          起 tmux + claude + 你的 shell</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> just test         跑测试</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> just lint         lint 检查</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> just migrate      跑数据库 migration</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> just deploy &lt;</span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">env</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">&gt; 部署</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">## 地雷区</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> apps/api/src/auth/        鉴权,改前先 plan</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> packages/db/schema/       schema 改 = migration,慎重</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> apps/worker/src/billing/  付费,合规要 review</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">## 不在本项目处理</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 用户认证:走 Okta SSO</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 邮件:走 notification-service</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 支付:Stripe webhook 在 apps/api/src/webhooks/stripe.ts</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;">## Claude 行为偏好</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 改 schema 必须先 plan</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 不要主动 commit,改完让我 review</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 生成的 commit message 不要带 Co-Authored-By</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 测试要写到 *.spec.ts,放在被测文件同目录</span></span></code></pre></div><h3 id="_9-2-用户级-vs-项目级" tabindex="-1">9.2 用户级 vs 项目级 <a class="header-anchor" href="#_9-2-用户级-vs-项目级" aria-label="Permalink to &quot;9.2 用户级 vs 项目级&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>~/.claude/CLAUDE.md            个人偏好(语气、习惯、跨项目通用)</span></span>
<span class="line"><span>./CLAUDE.md                    项目级(技术栈、约定、地雷)</span></span></code></pre></div><p><strong>优先级</strong>:<strong>项目级胜出</strong>——LLM 距离任务更近的指令更可信。</p><h3 id="_9-3-反面教材-claude-md-写法" tabindex="-1">9.3 反面教材:CLAUDE.md 写法 <a class="header-anchor" href="#_9-3-反面教材-claude-md-写法" aria-label="Permalink to &quot;9.3 反面教材:CLAUDE.md 写法&quot;">​</a></h3><div class="language-markdown vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">markdown</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;"># ❌ 反例 1:空泛</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">我们用 TypeScript,请帮我写好代码,谢谢。</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">   → 没信息量,Claude 仍要靠 grep 猜约定</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;"># ❌ 反例 2:堆个人喜好</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">请用驼峰命名,函数名用动词开头,行尾不要分号,</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">我喜欢用 const 不喜欢 let,请永远不要用 var,</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">还有我个人喜欢这样写 if 语句...</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">   → 这些是 linter 的活,不是 CLAUDE.md 的活</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-light-font-weight:bold;--shiki-dark:#79B8FF;--shiki-dark-font-weight:bold;"># ✅ 正例:事实 + 约束 + 禁区</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 技术栈用什么(事实)</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 命令怎么跑(约束)</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 哪里改不得(禁区)</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 不在本项目做的(边界)</span></span></code></pre></div><p><strong>CLAUDE.md 是「让 Claude 跳过盲目 grep」的捷径</strong>——写事实,不写偏好。</p><hr><h2 id="十、slash-命令-hooks-agents-工作流意义点名" tabindex="-1">十、slash 命令 / hooks / agents:工作流意义点名 <a class="header-anchor" href="#十、slash-命令-hooks-agents-工作流意义点名" aria-label="Permalink to &quot;十、slash 命令 / hooks / agents:工作流意义点名&quot;">​</a></h2><p>这些 claudeLearning 系列有详细文档,这里只点<strong>工作流里它们的位置</strong>。</p><h3 id="_10-1-slash-commands" tabindex="-1">10.1 slash commands <a class="header-anchor" href="#_10-1-slash-commands" aria-label="Permalink to &quot;10.1 slash commands&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>/clear           清当前 session 上下文(任务切换时用)</span></span>
<span class="line"><span>/init            读项目结构,生成 CLAUDE.md 初稿</span></span>
<span class="line"><span>/&lt;custom&gt;        你的自定义 prompt 模板</span></span></code></pre></div><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>工作流意义:</span></span>
<span class="line"><span>   把 &quot;frequent prompt&quot; 模板化</span></span>
<span class="line"><span>   &quot;review 这次改动 + 跑测试 + 写 commit message&quot; → /review</span></span>
<span class="line"><span>   &quot;审一下这个 PR 的安全&quot; → /security-review</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   你重复输入 5 次以上的 prompt,做成 slash command</span></span></code></pre></div><h3 id="_10-2-hooks" tabindex="-1">10.2 hooks <a class="header-anchor" href="#_10-2-hooks" aria-label="Permalink to &quot;10.2 hooks&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>PreToolUse / PostToolUse 等  生命周期事件,自动跑脚本</span></span>
<span class="line"><span></span></span>
<span class="line"><span>工作流意义:</span></span>
<span class="line"><span>   &quot;Edit 文件后自动跑 prettier&quot;      → PostToolUse hook</span></span>
<span class="line"><span>   &quot;Claude 完成响应桌面通知&quot;          → Stop hook</span></span>
<span class="line"><span>   &quot;禁止读 .env 文件&quot;                  → PreToolUse hook + 拒绝</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   任何 &quot;每次 X 一定要 Y&quot; 的诉求,用 hook</span></span></code></pre></div><h3 id="_10-3-sub-agents" tabindex="-1">10.3 sub-agents <a class="header-anchor" href="#_10-3-sub-agents" aria-label="Permalink to &quot;10.3 sub-agents&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>让 Claude 在子上下文派发任务给另一个 Claude</span></span>
<span class="line"><span></span></span>
<span class="line"><span>工作流意义:</span></span>
<span class="line"><span>   主 Claude 负责 high-level 计划</span></span>
<span class="line"><span>   子 Claude 负责具体执行(read code、改文件)</span></span>
<span class="line"><span>   主 Claude 不被子任务的 context 噪音污染</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   适合:大重构 / 多步骤研究任务</span></span></code></pre></div><p><strong>这三件事在 claudeLearning 04-08 篇详细讲,这里只让你知道工作流里它们的位置</strong>——你<strong>不需要</strong>为了用 Claude Code 立刻全部上,但<strong>你应该知道遇到什么场景去查哪一篇</strong>。</p><hr><h2 id="十一、和-ide-怎么混合" tabindex="-1">十一、和 IDE 怎么混合 <a class="header-anchor" href="#十一、和-ide-怎么混合" aria-label="Permalink to &quot;十一、和 IDE 怎么混合&quot;">​</a></h2><p>不是非此即彼——<strong>混合模式</strong>才是大多数人的姿势。</p><h3 id="_11-1-三种典型混合" tabindex="-1">11.1 三种典型混合 <a class="header-anchor" href="#_11-1-三种典型混合" aria-label="Permalink to &quot;11.1 三种典型混合&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>模式 A:VS Code 主 + 终端 Claude 辅</span></span>
<span class="line"><span>   ── 你 90% 时间在 VS Code 看代码</span></span>
<span class="line"><span>   ── tmux 里另起 Claude 跑长任务</span></span>
<span class="line"><span>   ── 写代码: VS Code;让 Claude 干: tmux Claude</span></span>
<span class="line"><span>   适合:从 IDE 党温和过渡</span></span>
<span class="line"><span></span></span>
<span class="line"><span>模式 B:本地 VS Code 看 + 远端 Claude 跑</span></span>
<span class="line"><span>   ── VS Code 本地打开项目,看代码、debug</span></span>
<span class="line"><span>   ── ssh dev,远端 tmux 跑 Claude</span></span>
<span class="line"><span>   ── Claude 改完 push,本地 git pull 看 diff</span></span>
<span class="line"><span>   适合:跑 GPU / 长任务 / 跨机器</span></span>
<span class="line"><span></span></span>
<span class="line"><span>模式 C:终端原生,Claude + Neovim</span></span>
<span class="line"><span>   ── tmux 一个 session,Neovim + Claude pane</span></span>
<span class="line"><span>   ── 全程不打开 VS Code</span></span>
<span class="line"><span>   ── 远端机器同样无缝</span></span>
<span class="line"><span>   适合:深度终端工作流,通常 SRE / 远程工程师</span></span></code></pre></div><h3 id="_11-2-vs-code-集成-claude-code-的限制" tabindex="-1">11.2 VS Code 集成 Claude Code 的限制 <a class="header-anchor" href="#_11-2-vs-code-集成-claude-code-的限制" aria-label="Permalink to &quot;11.2 VS Code 集成 Claude Code 的限制&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>VS Code 里嵌入 Claude 的姿势:</span></span>
<span class="line"><span>   - 装 VS Code 扩展 (Anthropic 官方或 Cline 之类)</span></span>
<span class="line"><span>   - 或在底部 Terminal 直接跑 claude</span></span>
<span class="line"><span></span></span>
<span class="line"><span>限制:</span></span>
<span class="line"><span>   ✗ VS Code 一关,嵌入式 Claude 死,长任务报废</span></span>
<span class="line"><span>   ✗ 远端 VS Code Remote 在堡垒机 / 容器后失效</span></span>
<span class="line"><span>   ✗ 多窗口并行差(VS Code 是单一窗口体验)</span></span>
<span class="line"><span>   ✗ 跨机器同步配置麻烦(VS Code settings 本地化重)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>适合:</span></span>
<span class="line"><span>   ✓ 单机本地编辑场景</span></span>
<span class="line"><span>   ✓ 重 IDE 功能(debug UI / refactor UI)的场景</span></span>
<span class="line"><span>   ✓ 不需要长任务的&quot;对话式&quot;使用</span></span></code></pre></div><h3 id="_11-3-一个推荐姿势" tabindex="-1">11.3 一个推荐姿势 <a class="header-anchor" href="#_11-3-一个推荐姿势" aria-label="Permalink to &quot;11.3 一个推荐姿势&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>日常 dev:</span></span>
<span class="line"><span>   - 本地 Neovim / VS Code 编辑代码</span></span>
<span class="line"><span>   - 本地 tmux 一个 session,Claude 在 pane 里</span></span>
<span class="line"><span>   - 长任务(refactor / 数据处理):远端 tmux</span></span>
<span class="line"><span></span></span>
<span class="line"><span>CI / batch:</span></span>
<span class="line"><span>   - GitHub Actions 里跑 claude -p &quot;审一下这次 PR&quot;</span></span>
<span class="line"><span>   - cron 里跑 claude 做定期任务</span></span>
<span class="line"><span></span></span>
<span class="line"><span>调研 / 探索:</span></span>
<span class="line"><span>   - 本地 tmux + Claude,fzf 选文件喂</span></span></code></pre></div><p><strong>不要把 Claude 锁在一个使用姿势里</strong>——它是一个 CLI,<strong>适合什么姿势就用什么姿势</strong>。</p><hr><h2 id="十二、真实工程师一天" tabindex="-1">十二、真实工程师一天 <a class="header-anchor" href="#十二、真实工程师一天" aria-label="Permalink to &quot;十二、真实工程师一天&quot;">​</a></h2><p>把上面所有东西串起来,<strong>一个使用 Claude + tmux + fzf + 远端的真实工程师一天</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>09:00  到公司,打开笔记本</span></span>
<span class="line"><span>       $ just dev</span></span>
<span class="line"><span>       → tmux session 起来,左 pane Claude,右 pane 你的 shell</span></span>
<span class="line"><span>       → /clear,告诉 Claude 今天要做什么</span></span>
<span class="line"><span>       → Claude:&quot;读 spec.md 和 src/auth/*,理解现状&quot;</span></span>
<span class="line"><span>       → 它读了 20 分钟</span></span>
<span class="line"><span></span></span>
<span class="line"><span>10:00  Claude 提出 plan(slash plan-mode):</span></span>
<span class="line"><span>       &quot;重构 auth 模块,3 个 phase,各 phase 后跑测试&quot;</span></span>
<span class="line"><span>       你看 plan,改了两处,确认。</span></span>
<span class="line"><span>       Claude 开始 phase 1,改了 30 个文件,跑测试,过了。</span></span>
<span class="line"><span>       你在右 pane 跑 git log 看 diff,review,OK。</span></span>
<span class="line"><span></span></span>
<span class="line"><span>12:00  Claude 启动 phase 2(大改,可能 1 小时)</span></span>
<span class="line"><span>       你 detach tmux,去吃饭</span></span>
<span class="line"><span></span></span>
<span class="line"><span>13:00  回来 \`just dev\` attach,看 Claude 跑到一半</span></span>
<span class="line"><span>       通知:phase 2 完成,但 3 个测试失败</span></span>
<span class="line"><span>       你看失败的测试:Claude 改了一个 API signature,old callsite 没改完</span></span>
<span class="line"><span>       你和 Claude 说:&quot;修一下 callsites&quot;</span></span>
<span class="line"><span>       Claude 用 rg 找 callsite,改了,过</span></span>
<span class="line"><span></span></span>
<span class="line"><span>14:00  Claude phase 3 启动,你切右 pane,刷 Slack、看 PR</span></span>
<span class="line"><span>       Claude 在左 pane 默默改</span></span>
<span class="line"><span></span></span>
<span class="line"><span>15:30  Claude 完成所有 phase</span></span>
<span class="line"><span>       你 review 完整 diff,过的 commit,不过的 ask Claude 改</span></span>
<span class="line"><span></span></span>
<span class="line"><span>17:00  下班前:让 Claude 跑一个 batch 任务</span></span>
<span class="line"><span>       &quot;把 200 个 controller 加 OpenTelemetry tracing,</span></span>
<span class="line"><span>        每改一个跑 lint + 测试,失败回滚,日志写 OTEL_LOG.md&quot;</span></span>
<span class="line"><span>       </span></span>
<span class="line"><span>       这个任务 Claude 估计要 4-6 小时。</span></span>
<span class="line"><span>       你 ssh dev,把任务搬到远端 tmux(同样的 prompt),</span></span>
<span class="line"><span>       detach,关本地 tmux,合电脑,走人。</span></span>
<span class="line"><span></span></span>
<span class="line"><span>21:00  在家吃完饭看了眼手机:ntfy 推送说 Claude 完成</span></span>
<span class="line"><span>       打开笔记本,$ ssh dev -t &quot;tmux attach -t claude&quot;</span></span>
<span class="line"><span>       看到 OTEL_LOG.md 累计 200 行,180 成功,20 回滚</span></span>
<span class="line"><span>       你今天就到这,明早 review 详细日志</span></span>
<span class="line"><span></span></span>
<span class="line"><span>次日 09:00  ssh attach,看回滚的 20 个为什么失败</span></span>
<span class="line"><span>            Claude 解释:&quot;这 20 个用了非标准 error 包装&quot;</span></span>
<span class="line"><span>            你说:&quot;按非标准包装的姿势加 OTEL&quot;</span></span>
<span class="line"><span>            Claude 重做,过 18 个,2 个手动改</span></span>
<span class="line"><span>            10:00 完成,commit,push</span></span>
<span class="line"><span></span></span>
<span class="line"><span>总产出:</span></span>
<span class="line"><span>   一个 controller refactor + 一个 200 文件 OTEL 批量任务</span></span>
<span class="line"><span>   你的&quot;在场&quot;时间:5 小时(plan、review、决策、修复)</span></span>
<span class="line"><span>   你的&quot;不在场&quot; Claude 跑:11 小时</span></span>
<span class="line"><span>   ── 这就是终端 + Claude Code 的真实威力</span></span></code></pre></div><p><strong>这一天的核心</strong>:<strong>Claude 在跑的时候你不被绑住</strong>——能去吃饭、能下班、能睡觉,<strong>Claude 在远端 tmux 里继续干</strong>。</p><hr><h2 id="十三、反对的写法" tabindex="-1">十三、反对的写法 <a class="header-anchor" href="#十三、反对的写法" aria-label="Permalink to &quot;十三、反对的写法&quot;">​</a></h2><h3 id="_13-1-反对-1-把-claude-code-当-ide-插件" tabindex="-1">13.1 反对 1:把 Claude Code 当 IDE 插件 <a class="header-anchor" href="#_13-1-反对-1-把-claude-code-当-ide-插件" aria-label="Permalink to &quot;13.1 反对 1:把 Claude Code 当 IDE 插件&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>✗ 永远只在 VS Code 底部 Terminal 跑 claude</span></span>
<span class="line"><span>✗ 离开 VS Code 就不会用 Claude</span></span>
<span class="line"><span>✗ Claude 长任务要靠&quot;不要关 VS Code&quot;维持</span></span>
<span class="line"><span></span></span>
<span class="line"><span>→ 你的 Claude 能力被 VS Code 的进程模型绑住</span></span>
<span class="line"><span>→ 离开 VS Code = 离开 Claude</span></span></code></pre></div><p><strong>改</strong>:<strong>至少会一种 tmux + claude 的姿势,知道 detach / attach</strong>。</p><h3 id="_13-2-反对-2-同一项目多-instance-并发改" tabindex="-1">13.2 反对 2:同一项目多 instance 并发改 <a class="header-anchor" href="#_13-2-反对-2-同一项目多-instance-并发改" aria-label="Permalink to &quot;13.2 反对 2:同一项目多 instance 并发改&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>✗ 一个 Claude 改 src/auth.ts,另一个 Claude 同时改 src/auth.ts</span></span>
<span class="line"><span>✗ 一个 Claude 改 main,另一个 Claude 改 main(不在 worktree)</span></span>
<span class="line"><span>   → 改动互相覆盖 / 冲突 / 一个吃掉另一个</span></span>
<span class="line"><span></span></span>
<span class="line"><span>→ 不知道哪个改动是哪个的</span></span>
<span class="line"><span>→ 你 review diff 时看到自己也搞不清楚的状态</span></span></code></pre></div><p><strong>改</strong>:<strong>同项目同时改一定用 git worktree 隔离;不用 worktree 就别开两个 Claude</strong>。</p><h3 id="_13-3-反对-3-长任务不-attach-不看" tabindex="-1">13.3 反对 3:长任务不 attach 不看 <a class="header-anchor" href="#_13-3-反对-3-长任务不-attach-不看" aria-label="Permalink to &quot;13.3 反对 3:长任务不 attach 不看&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>✗ 让 Claude 跑一晚上,完全不看进度</span></span>
<span class="line"><span>✗ 8 小时后回来发现 Claude 第一小时就卡住了,白等 7 小时</span></span>
<span class="line"><span></span></span>
<span class="line"><span>→ Claude 是同事,不是黑盒</span></span>
<span class="line"><span>→ 它会问问题、会遇到错误、会卡住</span></span></code></pre></div><p><strong>改</strong>:<strong>长任务每 1-2 小时 attach 一次,或配 hook 桌面通知 + 中间状态写 log</strong>。</p><h3 id="_13-4-反对-4-claude-md-不写-写得乱" tabindex="-1">13.4 反对 4:CLAUDE.md 不写 / 写得乱 <a class="header-anchor" href="#_13-4-反对-4-claude-md-不写-写得乱" aria-label="Permalink to &quot;13.4 反对 4:CLAUDE.md 不写 / 写得乱&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>✗ 没 CLAUDE.md → Claude 每次都 grep 猜约定,慢</span></span>
<span class="line"><span>✗ CLAUDE.md 200 行 → Claude context 被吃太多 token</span></span>
<span class="line"><span></span></span>
<span class="line"><span>→ 中间状态:50 行,事实 + 约束 + 禁区,够了</span></span></code></pre></div><p><strong>改</strong>:<strong>50-100 行,写本节模板的内容,半年回头修一次</strong>。</p><h3 id="_13-5-反对-5-claude-改完不-review-直接-commit" tabindex="-1">13.5 反对 5:Claude 改完不 review 直接 commit <a class="header-anchor" href="#_13-5-反对-5-claude-改完不-review-直接-commit" aria-label="Permalink to &quot;13.5 反对 5:Claude 改完不 review 直接 commit&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>✗ Claude 写了一段代码 → 直接 commit</span></span>
<span class="line"><span>✗ 没人看 diff</span></span>
<span class="line"><span>✗ 上 prod 才发现 Claude 改了一个不该改的地方</span></span>
<span class="line"><span></span></span>
<span class="line"><span>→ Claude 是同事,你是 reviewer</span></span>
<span class="line"><span>→ 同事的 PR 你不看,出事谁负责?</span></span></code></pre></div><p><strong>改</strong>:<strong>Claude 写完一定 <code>git diff</code> 看;大改一定本地跑 test;别让 Claude 直接 push main</strong>。</p><h3 id="_13-6-反对-6-hook-slash-agents-一个不用" tabindex="-1">13.6 反对 6:hook / slash / agents 一个不用 <a class="header-anchor" href="#_13-6-反对-6-hook-slash-agents-一个不用" aria-label="Permalink to &quot;13.6 反对 6:hook / slash / agents 一个不用&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>✗ 重复输入 &quot;review this PR&quot; 10 次 → 没做 /review slash</span></span>
<span class="line"><span>✗ Claude 改文件后忘了跑 prettier 5 次 → 没做 PostToolUse hook</span></span>
<span class="line"><span>✗ 大重构丢一个 Claude 上下文炸了 → 没用 sub-agents</span></span>
<span class="line"><span></span></span>
<span class="line"><span>→ Claude Code 的&quot;工程化&quot;层全部没用</span></span>
<span class="line"><span>→ 你用 Claude 的姿势停留在&quot;对话框&quot;</span></span></code></pre></div><p><strong>改</strong>:<strong>每写 5 次同样的 prompt,做成 slash;每错过 3 次自动化,加 hook</strong>。</p><h3 id="_13-7-反对-7-不知道远端-dev-box-这套姿势" tabindex="-1">13.7 反对 7:不知道远端 dev box 这套姿势 <a class="header-anchor" href="#_13-7-反对-7-不知道远端-dev-box-这套姿势" aria-label="Permalink to &quot;13.7 反对 7:不知道远端 dev box 这套姿势&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>✗ 大任务都跑本地,笔记本不敢关</span></span>
<span class="line"><span>✗ 跨机器迁移 dotfiles 都没,远端没 claude / tmux 配置</span></span>
<span class="line"><span>✗ ssh 进去就是裸的 bash,没 zsh / 别名 / fzf</span></span>
<span class="line"><span></span></span>
<span class="line"><span>→ 你被&quot;必须本地&quot;框住了</span></span>
<span class="line"><span>→ Claude 的可调度时间 = 你笔记本开机时间</span></span></code></pre></div><p><strong>改</strong>:<strong>配一台远端 dev box(EC2 / 自家小机器都行),dotfiles 同步,tmux + claude 长驻</strong>。</p><h3 id="_13-8-反对-8-claude-改一会儿-context-没清" tabindex="-1">13.8 反对 8:Claude 改一会儿 / context 没清 <a class="header-anchor" href="#_13-8-反对-8-claude-改一会儿-context-没清" aria-label="Permalink to &quot;13.8 反对 8:Claude 改一会儿 / context 没清&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>✗ 一个 session 跑了 8 小时,从 &quot;refactor auth&quot; 到 &quot;改 deploy 脚本&quot;</span></span>
<span class="line"><span>✗ 中间没 /clear,context 累计 200K token</span></span>
<span class="line"><span>✗ Claude 越来越慢,越来越糊涂</span></span>
<span class="line"><span></span></span>
<span class="line"><span>→ Claude 的&quot;短期记忆&quot;是它的工作内存,糊了它就糊</span></span></code></pre></div><p><strong>改</strong>:<strong>任务切换时 /clear;一个大任务做完 /clear;不要一个 session 跑一整天混合任务</strong>。</p><hr><h2 id="十四、跨机器-claude-工作流-本地-dev-box" tabindex="-1">十四、跨机器 Claude 工作流:本地 + dev box <a class="header-anchor" href="#十四、跨机器-claude-工作流-本地-dev-box" aria-label="Permalink to &quot;十四、跨机器 Claude 工作流:本地 + dev box&quot;">​</a></h2><p>把&quot;本地适合什么、远端适合什么&quot;分清楚。</p><h3 id="_14-1-分工表" tabindex="-1">14.1 分工表 <a class="header-anchor" href="#_14-1-分工表" aria-label="Permalink to &quot;14.1 分工表&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌─────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  本地笔记本 适合                                              │</span></span>
<span class="line"><span>├─────────────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>│  ✓ 小改、单文件修改、看代码                                   │</span></span>
<span class="line"><span>│  ✓ 写代码思路、写 plan、review diff                          │</span></span>
<span class="line"><span>│  ✓ 跑 IDE 看完整代码                                          │</span></span>
<span class="line"><span>│  ✓ 短任务(&lt; 10 分钟)                                         │</span></span>
<span class="line"><span>│  ✓ 演示给同事看                                               │</span></span>
<span class="line"><span>└─────────────────────────────────────────────────────────────┘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>┌─────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  远端 dev box 适合                                            │</span></span>
<span class="line"><span>├─────────────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>│  ✓ 长任务(refactor、批量改 200 个文件)                      │</span></span>
<span class="line"><span>│  ✓ 跑全套测试(本地 5 分钟,大机 1 分钟)                     │</span></span>
<span class="line"><span>│  ✓ 笔记本合盖也要继续跑                                       │</span></span>
<span class="line"><span>│  ✓ 训练 / 大数据处理(GPU / 大内存)                          │</span></span>
<span class="line"><span>│  ✓ 跨地点工作(在咖啡馆笔记本,主力 dev box 在公司)            │</span></span>
<span class="line"><span>│  ✓ 团队共享(同事可以 attach 同一 tmux)                      │</span></span>
<span class="line"><span>└─────────────────────────────────────────────────────────────┘</span></span></code></pre></div><h3 id="_14-2-ssh-agent-forwarding-共享-github-key" tabindex="-1">14.2 ssh agent forwarding:共享 GitHub key <a class="header-anchor" href="#_14-2-ssh-agent-forwarding-共享-github-key" aria-label="Permalink to &quot;14.2 ssh agent forwarding:共享 GitHub key&quot;">​</a></h3><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># ~/.ssh/config</span></span>
<span class="line"><span>Host dev</span></span>
<span class="line"><span>    HostName dev.example.com</span></span>
<span class="line"><span>    User work</span></span>
<span class="line"><span>    ForwardAgent yes      # ← 远端 git 操作复用本地 key</span></span></code></pre></div><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 本地</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ssh-add</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ~/.ssh/id_ed25519</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 远端</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">[dev]$ git push           </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 复用了本地的 GitHub key,不用远端再配</span></span></code></pre></div><h3 id="_14-3-api-key-共享" tabindex="-1">14.3 API key 共享 <a class="header-anchor" href="#_14-3-api-key-共享" aria-label="Permalink to &quot;14.3 API key 共享&quot;">​</a></h3><p><strong>Anthropic API key 不能 forward</strong>(SSH 不 forward env),要么写远端 <code>.zshrc</code>,要么用 1Password CLI / pass / 各种密钥管理工具:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 远端 ~/.zshrc</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">export</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> ANTHROPIC_API_KEY</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$(</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">op</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> read</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;op://Work/Anthropic/api_key&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span></code></pre></div><p><strong>注意安全</strong>:远端机如果是公司共享的,API key 写明文 .zshrc 风险高。<strong>最好用密钥管理工具按需读取</strong>。</p><h3 id="_14-4-dotfiles-跨机一致" tabindex="-1">14.4 dotfiles 跨机一致 <a class="header-anchor" href="#_14-4-dotfiles-跨机一致" aria-label="Permalink to &quot;14.4 dotfiles 跨机一致&quot;">​</a></h3><p>22 篇讲过 chezmoi / Nix。<strong>远端机一行命令拉下你本地的全套配置</strong>:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">[dev]$ sh -c </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;$(</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">curl</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -fsLS</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> get.chezmoi.io)&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> -- init --apply your-github/dotfiles</span></span></code></pre></div><p>这之后远端机的 <code>.zshrc</code> / <code>.tmux.conf</code> / <code>.config/nvim</code> / <code>.claude/settings.json</code> 跟本地一致——<strong>Claude Code 在远端的&quot;体验&quot;和本地一样</strong>。</p><hr><h2 id="十五、看完应该能" tabindex="-1">十五、看完应该能 <a class="header-anchor" href="#十五、看完应该能" aria-label="Permalink to &quot;十五、看完应该能&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>□ 能解释为什么 Claude Code 不适合永远跑在 VS Code Terminal 里</span></span>
<span class="line"><span>  (举得出 3 个场景)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>□ 能用 just + tmux 一行命令起 &quot;Claude + 你的 shell&quot; 工作 session</span></span>
<span class="line"><span></span></span>
<span class="line"><span>□ 能在远端 dev box 上让 Claude 跑一晚上,笔记本合盖也活着</span></span>
<span class="line"><span></span></span>
<span class="line"><span>□ 能用 fzf 选一批文件喂给 Claude,带 prompt 模板</span></span>
<span class="line"><span></span></span>
<span class="line"><span>□ 知道什么时候用 git worktree 隔离 Claude 的改动</span></span>
<span class="line"><span></span></span>
<span class="line"><span>□ 配过 Stop hook 发桌面通知 / 推手机(完成信号)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>□ 写过一份 50 行的 CLAUDE.md,事实 + 约束 + 禁区</span></span>
<span class="line"><span></span></span>
<span class="line"><span>□ 能给团队一份&quot;混合 IDE + 终端 Claude&quot;的姿势建议</span></span>
<span class="line"><span></span></span>
<span class="line"><span>□ 反对的写法你都能 3 秒认出来:</span></span>
<span class="line"><span>  ── IDE 党、并发改、长任务不看、不写 CLAUDE.md、改完不 review</span></span></code></pre></div><p>如果上面这 9 条你都能做到,<strong>这一篇就值了</strong>——你就完成了从「会用 Claude Code」到「把 Claude Code 嵌进工程能力」的转型。</p><hr><h2 id="十六、节奏建议-今天就动一下" tabindex="-1">十六、节奏建议:今天就动一下 <a class="header-anchor" href="#十六、节奏建议-今天就动一下" aria-label="Permalink to &quot;十六、节奏建议:今天就动一下&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>第一步(15 分钟):写一个 just dev recipe,起 tmux + claude + 你的 shell</span></span>
<span class="line"><span>                  (本篇方案 1)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>第二步(30 分钟):写一个 claude-this fzf 函数,选文件喂 prompt</span></span>
<span class="line"><span>                  (本篇方案 3)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>第三步(1 小时):  配 Stop hook 桌面通知(本篇第八节)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>第四步(30 分钟):写一份项目 CLAUDE.md(本篇第九节)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>第五步(2 小时):  配一台远端 dev box(云 VM 或公司开发机),</span></span>
<span class="line"><span>                  dotfiles 拉下,验证 ssh attach 远端 claude 流畅</span></span>
<span class="line"><span></span></span>
<span class="line"><span>第六步:           接下来一周,所有 &gt; 15 分钟的 Claude 任务</span></span>
<span class="line"><span>                  全部走远端 tmux,本地只做 review</span></span>
<span class="line"><span></span></span>
<span class="line"><span>总耗时:首次配置 &lt; 4 小时,长期受益每天 1-2 小时</span></span></code></pre></div><hr><h2 id="十七、踩坑提醒-总结-30-篇前瞻" tabindex="-1">十七、踩坑提醒(总结 + 30 篇前瞻) <a class="header-anchor" href="#十七、踩坑提醒-总结-30-篇前瞻" aria-label="Permalink to &quot;十七、踩坑提醒(总结 + 30 篇前瞻)&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 把 Claude Code 当 IDE 插件用                → 改 tmux 用</span></span>
<span class="line"><span>2. 长任务跑本地不 detach                       → 上远端 tmux</span></span>
<span class="line"><span>3. 同项目并发两个 Claude 改同文件              → 用 worktree</span></span>
<span class="line"><span>4. 没 CLAUDE.md / CLAUDE.md 200 行             → 50 行刚好</span></span>
<span class="line"><span>5. 改完不 review 直接 commit                   → 永远 git diff</span></span>
<span class="line"><span>6. 没用 hook / slash / agents                  → 重复 5 次就做成自动化</span></span>
<span class="line"><span>7. ssh 没配,每次都打长命令                    → 15 篇 ssh config</span></span>
<span class="line"><span>8. 远端没 dotfiles 同步                        → 22 篇 chezmoi</span></span>
<span class="line"><span>9. session context 永不清                      → 任务切换 /clear</span></span>
<span class="line"><span>10. API key 写明文 + 共享机器                  → 用密钥管理工具</span></span>
<span class="line"><span>11. 一个 instance 干所有事(refactor + 文档)  → 多 instance 多 session</span></span>
<span class="line"><span>12. 桌面通知没配,盯屏幕等                     → Stop hook</span></span></code></pre></div><p><strong>这 12 条是本系列从 01 到 29 篇沉淀下来的&quot;Claude + 终端&quot;工作流要点</strong>——做到一半就比同行强。</p><hr><h2 id="十八、下一篇预告" tabindex="-1">十八、下一篇预告 <a class="header-anchor" href="#十八、下一篇预告" aria-label="Permalink to &quot;十八、下一篇预告&quot;">​</a></h2><p>下一篇:<strong><code>30-现代终端的未来.md</code></strong>——这一篇讲了「Claude Code 怎么嵌进终端工作流」,<strong>下一篇讲整套终端工程的未来</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>2026 年的现代终端模拟器战国:</span></span>
<span class="line"><span>   - Warp:Rust + GPU + AI 集成,赌的是&quot;重新发明终端 UX&quot;</span></span>
<span class="line"><span>   - Ghostty:Mitchell Hashimoto(Hashicorp 创始人)亲手做,</span></span>
<span class="line"><span>     赌的是&quot;GPU + 极简快&quot;</span></span>
<span class="line"><span>   - WezTerm:Lua 可编程,赌的是&quot;可扩展的 cross-platform&quot;</span></span>
<span class="line"><span>   - Kitty:Python 配置,GPU 加速,赌的是&quot;老派 Unix 风的现代化&quot;</span></span>
<span class="line"><span>   - iTerm2 / Alacritty:老牌选手,各有受众</span></span>
<span class="line"><span></span></span>
<span class="line"><span>各自赌的是哪条路?</span></span>
<span class="line"><span>   - GPU 渲染是不是分水岭?</span></span>
<span class="line"><span>   - AI 集成进终端 vs Claude Code 这种 CLI 工具,哪个赢?</span></span>
<span class="line"><span>   - tmux 在新一代终端的 floating / panes 内置后还有意义吗?</span></span>
<span class="line"><span>   - 选型该看什么?</span></span>
<span class="line"><span></span></span>
<span class="line"><span>读完这一篇,你对&quot;未来 5 年的终端长什么样&quot;有判断力。</span></span>
<span class="line"><span>然后整套 terminalLearning 30 篇收尾——</span></span>
<span class="line"><span>你建立的就不再是&quot;我会用终端&quot;,而是</span></span>
<span class="line"><span>&quot;我能把工作流系统化、可复现、跨机迁移、并接入 AI 时代&quot;。</span></span></code></pre></div><p><strong>这是 terminalLearning 系列的倒数第二篇,29 篇的尽头是接到 AI 时代,30 篇的尽头是看到终端的下一站</strong>。看完整套你就完成了从 GUI 党 / IDE 党到「<strong>终端工作流工程师</strong>」的整体转型。</p>`,215)])])}const u=a(e,[["render",l]]);export{r as __pageData,u as default};
