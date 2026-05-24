import{c as a,Q as n,j as i,m as p}from"./chunks/framework.Bhbi9jCp.js";const d=JSON.parse('{"title":"tmux 心智:为什么这个 1990 年代的 daemon 你 2026 年还必须吃下","description":"","frontmatter":{},"headers":[],"relativePath":"terminalLearning/16-tmux心智.md","filePath":"terminalLearning/16-tmux心智.md","lastUpdated":1778574438000}'),e={name:"terminalLearning/16-tmux心智.md"};function l(t,s,h,o,k,r){return n(),i("div",null,[...s[0]||(s[0]=[p(`<h1 id="tmux-心智-为什么这个-1990-年代的-daemon-你-2026-年还必须吃下" tabindex="-1">tmux 心智:为什么这个 1990 年代的 daemon 你 2026 年还必须吃下 <a class="header-anchor" href="#tmux-心智-为什么这个-1990-年代的-daemon-你-2026-年还必须吃下" aria-label="Permalink to &quot;tmux 心智:为什么这个 1990 年代的 daemon 你 2026 年还必须吃下&quot;">​</a></h1><p>你打开 VS Code Remote SSH,代码补全、跳转、Git diff 全部就位;你打开 Cursor,Claude 在侧边栏帮你改代码,看起来&quot;远端开发已经够好了&quot;。<strong>所以为什么还要学 tmux?</strong> 这是 2026 年新一代工程师最普遍的反应——「<strong>那个布满奇怪快捷键的老古董,prefix C-b 还要双手按,session / window / pane 三个名字搞不清,我用 IDE 不就完了</strong>」。<strong>这种想法直接判你死刑</strong>:你一定会在某个深夜远端跑 Claude Code 长任务、ssh 断线、合盖出门、被传染的服务器需要 attach 看现场的时候,<strong>发现 IDE 在那一刻把你扔进沟里</strong>。tmux 这个 2007 年的 daemon——更早的祖宗 <code>screen</code> 是 1987 年的——<strong>之所以 20 年没死,是因为它解决的根本问题在 2026 年比 2007 年更严重,而不是更轻</strong>:<strong>任何长任务、任何远端 session、任何&quot;我电脑关了它还在跑&quot;的场景,IDE 都无能为力,只剩 tmux</strong>。</p><blockquote><p>一句话先记住:<strong>tmux 是一个 server,你的 ssh 会话只是&quot;瞥它一眼&quot;——这个根本设计让 tmux 不依赖你的终端连接,断网、关窗、合盖、SSH 客户端崩,除了机器 reboot 之外它都活着</strong>。这就是 tmux 跟&quot;分屏工具&quot;&quot;窗口管理器&quot;&quot;终端模拟器多 tab&quot;完全不在一个抽象层级的原因——<strong>它不在你的客户端这一侧,它在你的工作要跑下去的那一侧</strong>。学会 detach / attach,你的工作流从此跟&quot;你坐在哪台电脑前&quot;解耦——你今早在公司 ssh 进生产机起 <code>work</code> session,中午合盖出门,晚上家里 ssh 同一台机 <code>tmux attach -t work</code>,<strong>看到的是上午留下来的现场</strong>:窗格还在、tail 还在跑、Claude Code 还没退出、vim 里光标还在那一行。<strong>这种&quot;无缝接续&quot;和&quot;分屏&quot;完全不是同一件事</strong>。</p></blockquote><p>04 篇讲过 session / pty / 进程组 / SIGHUP 的内核底子——<strong>这一篇不再重复</strong>(没看的回头补,这一篇直接预设你懂)。这里只讲一个问题:<strong>tmux 这个抽象层为什么必须吃下,它的 server / session / window / pane 心智图怎么建,以及为什么&quot;用鼠标拖拽 iTerm 多窗口&quot;永远代替不了它</strong>。</p><hr><h2 id="一、开篇冲突-为什么-ide-remote-救不了你" tabindex="-1">一、开篇冲突:为什么 IDE Remote 救不了你 <a class="header-anchor" href="#一、开篇冲突-为什么-ide-remote-救不了你" aria-label="Permalink to &quot;一、开篇冲突:为什么 IDE Remote 救不了你&quot;">​</a></h2><h3 id="_1-1-ide-党的反驳" tabindex="-1">1.1 IDE 党的反驳 <a class="header-anchor" href="#_1-1-ide-党的反驳" aria-label="Permalink to &quot;1.1 IDE 党的反驳&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>&quot;我有 VS Code Remote SSH,远端开发已经够好&quot;</span></span>
<span class="line"><span>&quot;我有 Cursor,Claude 帮我写代码,我用 IDE 就行&quot;</span></span>
<span class="line"><span>&quot;分屏 iTerm2 / WezTerm / Ghostty 自带,装 tmux 干嘛&quot;</span></span>
<span class="line"><span>&quot;prefix key 反人类,我学不会&quot;</span></span>
<span class="line"><span>&quot;session / window / pane 三个词我都搞不清楚谁套谁&quot;</span></span></code></pre></div><p>每一条单独看都&quot;有道理&quot;,合起来就是&quot;为什么我还在 2026 年用一个 1990 年代的工具&quot;——<strong>正确答案是:你不是在用 1990 年代的工具,你是在用一个 1990 年代就把&quot;工作流不绑死在客户端&quot;这件事想清楚了的工程范式</strong>。这种范式在 IDE 时代被很多人遗忘,<strong>但 IDE 解不了的那一类问题正在变多,不是变少</strong>。</p><h3 id="_1-2-五个-ide-remote-救不了你的真实场景" tabindex="-1">1.2 五个 IDE Remote 救不了你的真实场景 <a class="header-anchor" href="#_1-2-五个-ide-remote-救不了你的真实场景" aria-label="Permalink to &quot;1.2 五个 IDE Remote 救不了你的真实场景&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>场景 1:你 ssh 进 GPU 机器跑训练,网络断了</span></span>
<span class="line"><span>  - IDE Remote:vscode-server 进程跟着 ssh 一起死</span></span>
<span class="line"><span>  - 训练进程是 vscode-server 的孙子,SIGHUP 传到 → 死</span></span>
<span class="line"><span>  - 你重连上去,训练没了,checkpoint 也没存</span></span>
<span class="line"><span>  - 解法只有:把训练放进 tmux</span></span>
<span class="line"><span></span></span>
<span class="line"><span>场景 2:你给 Claude Code 一个长任务,合盖回家</span></span>
<span class="line"><span>  - Claude 在 IDE 进程里跑,IDE 一关 Claude 一起死</span></span>
<span class="line"><span>  - 重启 IDE,Claude 不记得做到哪</span></span>
<span class="line"><span>  - 解法只有:Claude 在 tmux pane 里跑,合盖不影响</span></span>
<span class="line"><span></span></span>
<span class="line"><span>场景 3:你 ssh 进堡垒机 → 跳板 → 生产机,要看 4 个面板</span></span>
<span class="line"><span>  - VS Code Remote 不支持多跳(它就只支持一跳 ProxyJump 配好的)</span></span>
<span class="line"><span>  - 你只能开 4 个 iTerm 窗口分别 ssh</span></span>
<span class="line"><span>  - 4 个窗口里登的密码、跳的路径、跑的命令都互相不知道</span></span>
<span class="line"><span>  - 解法只有:远端开一个 tmux session,4 个 pane 各自登</span></span>
<span class="line"><span></span></span>
<span class="line"><span>场景 4:同事 ssh 进来跟你 pair debugging,但你已经登过了</span></span>
<span class="line"><span>  - 普通 ssh:两个独立 session,各看各的</span></span>
<span class="line"><span>  - 你说&quot;你看左边那个文件&quot;,他不知道是哪个</span></span>
<span class="line"><span>  - 解法只有:tmux attach -t shared,你们共享同一屏,我打你看,他打我看</span></span>
<span class="line"><span></span></span>
<span class="line"><span>场景 5:你跑了一晚上的脚本,中间出了点错,你不在</span></span>
<span class="line"><span>  - IDE 跑的脚本,中间报错 IDE 关了,日志没保存</span></span>
<span class="line"><span>  - 第二天回来看不到中间发生了什么</span></span>
<span class="line"><span>  - 解法只有:tmux + history-limit 100000,所有滚动历史都在</span></span></code></pre></div><p>这五个场景,<strong>任何一个你这辈子会撞上至少 10 次</strong>——你不学 tmux,每一次都要付一次&quot;工作丢失&quot;的代价。<strong>学 tmux 的成本:1 周肌肉记忆 + 1 小时配置;不学的代价:每年损失 50-200 小时</strong>。</p><h3 id="_1-3-tmux-解决的两件事-不是分屏" tabindex="-1">1.3 tmux 解决的两件事(不是分屏) <a class="header-anchor" href="#_1-3-tmux-解决的两件事-不是分屏" aria-label="Permalink to &quot;1.3 tmux 解决的两件事(不是分屏)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>分屏 tmux 顺手能做,但不是它的核心价值</span></span>
<span class="line"><span></span></span>
<span class="line"><span>tmux 的真正核心是两件事:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  ① 会话持久化(persistence)</span></span>
<span class="line"><span>     你的&quot;工作环境&quot;挂在 tmux server 上,不挂在你的终端</span></span>
<span class="line"><span>     你 ssh 进来 attach,看到上次离开的样子</span></span>
<span class="line"><span>     你 ssh 出去 detach,环境继续跑</span></span>
<span class="line"><span>     断网、关窗、合盖、IDE 崩——都不影响</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  ② 客户端-服务端解耦(decoupling)</span></span>
<span class="line"><span>     tmux server 跑在那台机器上(本机或远端)</span></span>
<span class="line"><span>     谁都能 attach,谁都能 detach,可以多人同时 attach</span></span>
<span class="line"><span>     &quot;工作环境&quot;和&quot;看工作环境的人&quot;分开</span></span>
<span class="line"><span>     不绑死在某个终端窗口、某条 ssh 连接、某台电脑</span></span>
<span class="line"><span></span></span>
<span class="line"><span>这两件事一组合,你的工作流就跟&quot;客户端&quot;解耦了</span></span>
<span class="line"><span>这就是 tmux 50 万 GitHub star 的真正原因</span></span></code></pre></div><p><strong>如果你装 tmux 只是为了分屏——别装,iTerm2 / Ghostty 内置的分屏对你够用</strong>。tmux 的钱花在 ① 和 ② 上才回本。</p><hr><h2 id="二、tmux-是个-server-你的-ssh-只是-client" tabindex="-1">二、tmux 是个 server,你的 ssh 只是 client <a class="header-anchor" href="#二、tmux-是个-server-你的-ssh-只是-client" aria-label="Permalink to &quot;二、tmux 是个 server,你的 ssh 只是 client&quot;">​</a></h2><h3 id="_2-1-那张救命架构图" tabindex="-1">2.1 那张救命架构图 <a class="header-anchor" href="#_2-1-那张救命架构图" aria-label="Permalink to &quot;2.1 那张救命架构图&quot;">​</a></h3><p>把 tmux 想成一个<strong>两层架构</strong>,跟你写 Web 应用是一模一样的:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                  ┌────────────────────────────────────┐</span></span>
<span class="line"><span>                  │           tmux server              │</span></span>
<span class="line"><span>                  │       (一个 daemon 进程)            │</span></span>
<span class="line"><span>                  │                                    │</span></span>
<span class="line"><span>                  │   ┌─────────┐  ┌─────────┐         │</span></span>
<span class="line"><span>                  │   │ session │  │ session │  ...    │</span></span>
<span class="line"><span>                  │   │  work   │  │  infra  │         │</span></span>
<span class="line"><span>                  │   └─────────┘  └─────────┘         │</span></span>
<span class="line"><span>                  │                                    │</span></span>
<span class="line"><span>                  │   socket: /tmp/tmux-$UID/default   │</span></span>
<span class="line"><span>                  └────────────────────────────────────┘</span></span>
<span class="line"><span>                              ▲     ▲</span></span>
<span class="line"><span>                              │     │</span></span>
<span class="line"><span>                  attach      │     │   attach</span></span>
<span class="line"><span>                              │     │</span></span>
<span class="line"><span>                  ┌───────────┘     └───────────┐</span></span>
<span class="line"><span>                  │                             │</span></span>
<span class="line"><span>            ┌──────────┐                  ┌──────────┐</span></span>
<span class="line"><span>            │ client A │                  │ client B │</span></span>
<span class="line"><span>            │ (你的    │                  │ (同事的  │</span></span>
<span class="line"><span>            │  iTerm)  │                  │  iTerm)  │</span></span>
<span class="line"><span>            └──────────┘                  └──────────┘</span></span>
<span class="line"><span>              一个 tmux                    一个 tmux</span></span>
<span class="line"><span>              进程                          进程</span></span></code></pre></div><p><strong>重点</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>tmux server:</span></span>
<span class="line"><span>   - 长期运行的 daemon 进程</span></span>
<span class="line"><span>   - 持有所有的 pty / 进程组 / window / pane</span></span>
<span class="line"><span>   - 通过本地 UNIX socket 跟 client 通信</span></span>
<span class="line"><span>   - 它死了所有 session 才死(默认就只有&quot;最后一个 client 退出后立刻死&quot;</span></span>
<span class="line"><span>     这一条政策,但通过 last-session 和长 attach 可以不死)</span></span>
<span class="line"><span>   - 实际死的时机:</span></span>
<span class="line"><span>     * 最后一个 session 被 kill</span></span>
<span class="line"><span>     * 系统重启</span></span>
<span class="line"><span>     * 主动 tmux kill-server</span></span>
<span class="line"><span></span></span>
<span class="line"><span>tmux client:</span></span>
<span class="line"><span>   - 你每次敲 tmux / tmux attach 时启动的进程</span></span>
<span class="line"><span>   - 是个&quot;瘦客户端&quot;:渲染界面 + 转发输入</span></span>
<span class="line"><span>   - 不持有任何 session / pane 状态</span></span>
<span class="line"><span>   - client 死了 server 不死</span></span></code></pre></div><p>这个架构跟 Chrome 是 <code>browser process + N renderer process</code>、Docker 是 <code>dockerd + docker CLI</code>、Kubernetes 是 <code>kube-apiserver + kubectl</code> 是同一类——<strong>control plane / data plane 分离</strong>。<strong>你 SSH 进去敲 <code>tmux</code> 时,你是 client,server 已经在那儿了</strong>。</p><h3 id="_2-2-一段实验-亲眼看-server-和-client" tabindex="-1">2.2 一段实验:亲眼看 server 和 client <a class="header-anchor" href="#_2-2-一段实验-亲眼看-server-和-client" aria-label="Permalink to &quot;2.2 一段实验:亲眼看 server 和 client&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ssh</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> server</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> tmux</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> new</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -s</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> work</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">               # 第一次 new,会自动 fork 一个 server</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ps</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> aux</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> |</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> grep</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> tmux</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">yophon</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  12300</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ...</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> tmux:</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> server</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (...)      ← server (</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">daemon</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">yophon</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  12350</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ...</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> tmux</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> new</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -s</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> work</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">        ←</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> client</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">你这个进程</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 现在你按 prefix + d (detach)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">[detached (from session work)]</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ps</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> aux</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> |</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> grep</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> tmux</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">yophon</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  12300</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ...</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> tmux:</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> server</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (...)      ← server 还在</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">!</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 注意 client 那条没了</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> tmux</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ls</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                         # 列所有 session</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">work:</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 1</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> windows</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (created </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">Mon</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> May</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 12</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 09:30:00</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 2026</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> tmux</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> attach</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -t</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> work</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">             # 重新 attach</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 进入 work session,看到上次离开的样子</span></span></code></pre></div><p>这段实验是 tmux 的全部魔法:<strong>你的工作环境(<code>work</code> 这个 session)挂在 server 进程里,跟你这个 client 进程没关系</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>关键事实:</span></span>
<span class="line"><span>  - 你 ssh 出去:server 不死,session 继续</span></span>
<span class="line"><span>  - 你电脑关掉:server 不死(在远端机上)</span></span>
<span class="line"><span>  - 远端机器没重启:你下次 ssh 进来,session 还在</span></span>
<span class="line"><span>  - 你 tmux kill-server:server 死,所有 session 一起死(全杀)</span></span>
<span class="line"><span>  - 远端机器重启:server 死,所有 session 一起死(系统级重启)</span></span></code></pre></div><h3 id="_2-3-session-数据流转的细节" tabindex="-1">2.3 session 数据流转的细节 <a class="header-anchor" href="#_2-3-session-数据流转的细节" aria-label="Permalink to &quot;2.3 session 数据流转的细节&quot;">​</a></h3><p>很多人到这一步还会问:&quot;那 server 死了我的工作不就没了?&quot;——<strong>对</strong>。tmux server 不持久化到磁盘,<strong>所有 session 状态都在内存</strong>。机器重启 = session 全没。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>持久化的层级(由低到高):</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  ①  tmux session 状态(window / pane 结构)</span></span>
<span class="line"><span>      → 默认不持久化,机器重启就没</span></span>
<span class="line"><span>      → 17 篇会讲 tmux-resurrect + tmux-continuum</span></span>
<span class="line"><span>        把&quot;窗格结构&quot;周期性保存到磁盘</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  ②  pane 内运行的进程</span></span>
<span class="line"><span>      → 完全不持久化(进程在 server 内存里)</span></span>
<span class="line"><span>      → tmux-resurrect 只能保存进程的命令行,</span></span>
<span class="line"><span>        重启后重新跑一遍命令(很多程序状态丢失)</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  ③  滚动历史(history-limit)</span></span>
<span class="line"><span>      → 默认 2000 行,17 篇会调到 100000</span></span>
<span class="line"><span>      → 这个也不持久化</span></span></code></pre></div><p><strong>tmux 的&quot;持久化&quot;承诺只到&quot;机器不重启&quot;这一层</strong>——server 进程不死的范围内,session 永远在。<strong>这跟数据库的持久化不是一码事</strong>——别拿生产数据塞 tmux pane 里跑然后期望它跨重启。</p><hr><h2 id="三、三层抽象-session-window-pane" tabindex="-1">三、三层抽象:Session / Window / Pane <a class="header-anchor" href="#三、三层抽象-session-window-pane" aria-label="Permalink to &quot;三、三层抽象:Session / Window / Pane&quot;">​</a></h2><p>新人最大的混乱点在这一层:<strong>session、window、pane 这三个英文名字到底谁套谁,谁是谁的父亲</strong>。把它一图打通:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌─────────────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│                       tmux server (一个进程)                         │</span></span>
<span class="line"><span>├─────────────────────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>│                                                                     │</span></span>
<span class="line"><span>│  ┌─────────────────────── Session: work ─────────────────────────┐  │</span></span>
<span class="line"><span>│  │ (这个 session 是一件事:写后端代码)                            │  │</span></span>
<span class="line"><span>│  │                                                               │  │</span></span>
<span class="line"><span>│  │  ┌── Window 1: editor ──┐  ┌── Window 2: server ──┐  ...     │  │</span></span>
<span class="line"><span>│  │  │                      │  │                      │           │  │</span></span>
<span class="line"><span>│  │  │  ┌────────────────┐  │  │  ┌────────────────┐  │           │  │</span></span>
<span class="line"><span>│  │  │  │   pane 0:vim   │  │  │  │ pane 0: server │  │           │  │</span></span>
<span class="line"><span>│  │  │  │   main.go      │  │  │  │ go run ...     │  │           │  │</span></span>
<span class="line"><span>│  │  │  │                │  │  │  └────────────────┘  │           │  │</span></span>
<span class="line"><span>│  │  │  ├────────────────┤  │  │  ┌────────────────┐  │           │  │</span></span>
<span class="line"><span>│  │  │  │   pane 1:term  │  │  │  │  pane 1: tail  │  │           │  │</span></span>
<span class="line"><span>│  │  │  │   $ tests      │  │  │  │  tail -f log   │  │           │  │</span></span>
<span class="line"><span>│  │  │  └────────────────┘  │  │  └────────────────┘  │           │  │</span></span>
<span class="line"><span>│  │  │ (此 window 2 pane)   │  │ (此 window 2 pane)   │           │  │</span></span>
<span class="line"><span>│  │  └──────────────────────┘  └──────────────────────┘           │  │</span></span>
<span class="line"><span>│  │                                                               │  │</span></span>
<span class="line"><span>│  └───────────────────────────────────────────────────────────────┘  │</span></span>
<span class="line"><span>│                                                                     │</span></span>
<span class="line"><span>│  ┌─────────────────────── Session: infra ────────────────────────┐  │</span></span>
<span class="line"><span>│  │ (这个 session 是另一件事:维护基础设施)                       │  │</span></span>
<span class="line"><span>│  │  ┌── Window 1: prod ─────┐  ┌── Window 2: staging ──┐         │  │</span></span>
<span class="line"><span>│  │  │  pane 0: kubectl ...  │  │  pane 0: ssh stage    │         │  │</span></span>
<span class="line"><span>│  │  │  pane 1: htop          │  │  ...                  │         │  │</span></span>
<span class="line"><span>│  │  └───────────────────────┘  └───────────────────────┘         │  │</span></span>
<span class="line"><span>│  └───────────────────────────────────────────────────────────────┘  │</span></span>
<span class="line"><span>│                                                                     │</span></span>
<span class="line"><span>└─────────────────────────────────────────────────────────────────────┘</span></span></code></pre></div><p>逐层解释:</p><h3 id="_3-1-session-会话-一件事" tabindex="-1">3.1 Session(会话):一件事 <a class="header-anchor" href="#_3-1-session-会话-一件事" aria-label="Permalink to &quot;3.1 Session(会话):一件事&quot;">​</a></h3><p><strong>Session 是顶层容器</strong>。它对应<strong>一件独立的工作流</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>你应该这样想 session:</span></span>
<span class="line"><span>  - work     一个 session = 我在写后端代码这件事</span></span>
<span class="line"><span>  - infra    一个 session = 我在维护生产环境这件事</span></span>
<span class="line"><span>  - notes    一个 session = 我在写技术博客这件事</span></span>
<span class="line"><span>  - claude   一个 session = 我跑 Claude Code 长任务这件事</span></span>
<span class="line"><span>  - sre      一个 session = 我做事故排查这件事</span></span>
<span class="line"><span></span></span>
<span class="line"><span>不应该这样想 session:</span></span>
<span class="line"><span>  ✗ &quot;我开一个新 terminal&quot; → 那是 window 干的事</span></span>
<span class="line"><span>  ✗ &quot;我开一个新 tab&quot;      → 那是 window 干的事</span></span>
<span class="line"><span>  ✗ &quot;我开一个分屏&quot;        → 那是 pane 干的事</span></span></code></pre></div><p><strong>核心判断</strong>:<strong>做完一件事之后,session 是不是可以整个砍掉?</strong> 如果是,这就是一个合理的 session;如果你在一个叫 <code>work</code> 的 session 里同时塞了&quot;写代码 + 维护生产 + 跑长任务&quot;,<strong>这不是 session,这是 session 大杂烩</strong>。</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> tmux</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> new</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -s</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> work</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">               # 新建一个名叫 work 的 session</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> tmux</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ls</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                        # 列所有 session</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">work:</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 1</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> windows</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ...</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">infra:</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 3</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> windows</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ...</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (attached)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> tmux</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> attach</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -t</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> work</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">            # attach 到指定 session</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> tmux</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> kill-session</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -t</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> old</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">       # 杀掉一个 session</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> tmux</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> rename-session</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> new</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">        # 给当前 session 重命名(prefix + $)</span></span></code></pre></div><h3 id="_3-2-window-窗口-一件事里的一个上下文" tabindex="-1">3.2 Window(窗口):一件事里的一个上下文 <a class="header-anchor" href="#_3-2-window-窗口-一件事里的一个上下文" aria-label="Permalink to &quot;3.2 Window(窗口):一件事里的一个上下文&quot;">​</a></h3><p>Window 是 session 内的次级容器,<strong>像浏览器的 tab</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>window 的合理用法:</span></span>
<span class="line"><span>  在 work session 里:</span></span>
<span class="line"><span>     window 1 = editor    (vim 在写代码)</span></span>
<span class="line"><span>     window 2 = server    (跑 dev server + tail 日志)</span></span>
<span class="line"><span>     window 3 = git       (lazygit / git log 等)</span></span>
<span class="line"><span>     window 4 = ai        (Claude Code 跑长任务)</span></span>
<span class="line"><span>     window 5 = notes     (临时写笔记)</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  在 infra session 里:</span></span>
<span class="line"><span>     window 1 = prod</span></span>
<span class="line"><span>     window 2 = staging  </span></span>
<span class="line"><span>     window 3 = monitoring   (htop / dstat / nload)</span></span></code></pre></div><p><strong>为什么不是 session?</strong> 因为这几件事<strong>是同一件大事(&quot;写后端&quot;)的不同上下文</strong>——你随时在它们之间切。<strong>为什么不是 pane?</strong> 因为它们各自占满整个屏幕更好用——vim 不想被挤到半屏。</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># window 操作(在 session 内):</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">prefix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> +</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> c</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">              新建</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> window</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">prefix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> +</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 1</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 2</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 3</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ...</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">      跳到第</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> N</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 个</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> window</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">prefix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> +</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> n</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> p</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          下一个</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 上一个</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">prefix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> +</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ,</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">              改</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> window</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 名</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">prefix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> +</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> &amp;              </span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">杀掉</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> window</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">会问</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">&quot;yes/no&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">prefix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> +</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> w</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">              列出所有</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> window</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 选择</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">像</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> fzf</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span></code></pre></div><h3 id="_3-3-pane-窗格-同一窗口的分屏" tabindex="-1">3.3 Pane(窗格):同一窗口的分屏 <a class="header-anchor" href="#_3-3-pane-窗格-同一窗口的分屏" aria-label="Permalink to &quot;3.3 Pane(窗格):同一窗口的分屏&quot;">​</a></h3><p>Pane 是 window 内的最细粒度——<strong>就是分屏</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>pane 的合理用法(同一 window 内):</span></span>
<span class="line"><span>  editor 这个 window:</span></span>
<span class="line"><span>     pane 0 = vim 写代码        (左)</span></span>
<span class="line"><span>     pane 1 = 跑测试 / REPL     (右)</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  server 这个 window:</span></span>
<span class="line"><span>     pane 0 = dev server (前台)  (上)</span></span>
<span class="line"><span>     pane 1 = tail -f log        (下)</span></span></code></pre></div><p><strong>Pane 是&quot;你想同时看两件事&quot;时才用</strong>——一个 pane 编辑 / 一个 pane 跑测试,左右对照。<strong>Pane 不是&quot;我开一个新 terminal&quot;</strong>——那是 window 干的。</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">prefix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> +</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> |</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  或</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> prefix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> +</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> %</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">       垂直分割</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">自定义</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> |</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">,默认</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> %</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">prefix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> +</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> -</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  或</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> prefix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> +</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;       水平分割(自定义 -,默认 &quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">prefix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> +</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> h</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> j</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> k</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> l</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          在</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> pane</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 间跳</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">vim</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 风格,需要自定义</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">prefix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> +</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 方向键</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">                  默认</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> pane</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 跳转</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">prefix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> +</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> z</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">                       zoom</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">把当前</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> pane</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 全屏</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 还原</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">prefix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> +</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> x</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">                       杀掉</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> pane</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">prefix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> +</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> q</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">                       显示每个</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> pane</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 的编号</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">短暂</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">prefix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> +</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> {</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  或</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> prefix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> +</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> }</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">       前后交换</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> pane</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">prefix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> +</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> Space</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">                   循环</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> layout</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">主-副</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 等分</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 等等</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span></code></pre></div><h3 id="_3-4-三层心智的-语义边界" tabindex="-1">3.4 三层心智的&quot;语义边界&quot; <a class="header-anchor" href="#_3-4-三层心智的-语义边界" aria-label="Permalink to &quot;3.4 三层心智的&quot;语义边界&quot;&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                  独立性               同屏可见性          频繁切换性</span></span>
<span class="line"><span>─────────────────────────────────────────────────────────────────────</span></span>
<span class="line"><span>Session         一件事(高)           不同屏(低)         不频繁(低)</span></span>
<span class="line"><span>                跨 session 切是&quot;换 hat&quot;</span></span>
<span class="line"><span>                </span></span>
<span class="line"><span>Window          同事不同上下文(中)   不同屏(低)         中等</span></span>
<span class="line"><span>                同 session 切 window 是&quot;在同一件事的不同部分跳&quot;</span></span>
<span class="line"><span>                </span></span>
<span class="line"><span>Pane            同上下文不同视角(低)  同屏(高)           频繁(高)</span></span>
<span class="line"><span>                pane 内切是&quot;我同时看两件事&quot;</span></span></code></pre></div><p><strong>判断准则</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>要不要新 session?   &quot;这是不是一件独立的事?如果 session 整个删了,我能不能接受?&quot;</span></span>
<span class="line"><span>要不要新 window?    &quot;这是不是同一件事的另一个上下文?需不需要满屏跑?&quot;</span></span>
<span class="line"><span>要不要新 pane?      &quot;我是不是要同时看这两个东西?&quot;</span></span></code></pre></div><p><strong>90% 的新人错误用法</strong>:<strong>所有东西都丢一个 session 里</strong>——work 里有 dev server、又有运维 SSH、又有 Claude 长任务、又有读邮件 —— <strong>这种 session 一旦挂了,5 件事一起死</strong>。<strong>正确做法是按&quot;事&quot;切 session</strong>:work / infra / claude / notes 分开,server 死的时候只死一件事,其他 session 不受牵连。</p><hr><h2 id="四、prefix-key-的设计哲学" tabindex="-1">四、prefix key 的设计哲学 <a class="header-anchor" href="#四、prefix-key-的设计哲学" aria-label="Permalink to &quot;四、prefix key 的设计哲学&quot;">​</a></h2><p>新人对 tmux 最大的抱怨:<strong>&quot;为什么要双键?直接按快捷键不行吗?&quot;</strong></p><h3 id="_4-1-为什么必须有-prefix" tabindex="-1">4.1 为什么必须有 prefix <a class="header-anchor" href="#_4-1-为什么必须有-prefix" aria-label="Permalink to &quot;4.1 为什么必须有 prefix&quot;">​</a></h3><p><strong>tmux 跑在终端里,终端里所有按键都要先经过 shell / 程序</strong>——如果 tmux 想要&quot;独占&quot;快捷键(比如直接按 Ctrl-T 切 window),<strong>那 vim 的 Ctrl-T(回到上一个 tag)就废了,Emacs 的 C-x 全废了,bash 的 C-r 也废了</strong>。终端按键空间是<strong>共享的</strong>,tmux 不能独占。</p><p><strong>prefix 的本质是&quot;模式切换&quot;</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>没有 prefix 时:</span></span>
<span class="line"><span>   你的按键 → 终端 → 当前前台进程(vim / shell / Claude / ...)</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>按了 prefix 之后(短暂的&quot;tmux 模式&quot;):</span></span>
<span class="line"><span>   你的按键 → 终端 → tmux 拦截这一个 key</span></span>
<span class="line"><span>   tmux 处理完一个 key 后,自动退出 &quot;tmux 模式&quot;</span></span>
<span class="line"><span>   下一个按键又回到正常流程</span></span></code></pre></div><p>这跟 vim 的 modal(normal / insert)是同一个心智——<strong>用一个前缀切到&quot;工具模式&quot;,做一件事,自动切回去</strong>。</p><h3 id="_4-2-默认-prefix-是-ctrl-b-为什么大家都改" tabindex="-1">4.2 默认 prefix 是 Ctrl-B,为什么大家都改 <a class="header-anchor" href="#_4-2-默认-prefix-是-ctrl-b-为什么大家都改" aria-label="Permalink to &quot;4.2 默认 prefix 是 Ctrl-B,为什么大家都改&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>默认:Ctrl-B</span></span>
<span class="line"><span>   - 食指要伸到键盘中央偏左</span></span>
<span class="line"><span>   - 跟 readline 的 Ctrl-B(光标左移一字符)冲突</span></span>
<span class="line"><span>   - 跟 emacs 的 Ctrl-B 冲突</span></span>
<span class="line"><span>   - 大拇指按 Ctrl + 食指按 B,手势别扭</span></span>
<span class="line"><span></span></span>
<span class="line"><span>常见改法:</span></span>
<span class="line"><span>   ① Ctrl-A     screen 的默认,跟 readline 的&quot;行首&quot;冲突</span></span>
<span class="line"><span>                但 readline Ctrl-A 用得少(Home 键够了)</span></span>
<span class="line"><span>                按起来最舒服:大拇指 Ctrl + 食指 A 自然落</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   ② Ctrl-Space 跟 IDE 的&quot;补全&quot;冲突(VS Code / IntelliJ 默认)</span></span>
<span class="line"><span>                如果你 IDE 党不要选</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   ③ \` (反引号)单键无 modifier,按起来最快</span></span>
<span class="line"><span>                但反引号在 shell 里是命令替换,经常误输入</span></span>
<span class="line"><span>                适合&quot;反引号已经不用&quot;的人</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   ④ 不改        坚持 Ctrl-B 也可以,熟了就熟了</span></span>
<span class="line"><span>                但 99% 的成熟用户都改了</span></span></code></pre></div><p><strong>强烈建议</strong>:<strong>Ctrl-A</strong>(除非你重度 emacs 用户)。<strong>Ctrl-A 是工程界的事实标准</strong>,几乎所有 tmux 教程、所有 dotfiles 仓库默认都是 Ctrl-A。<strong>学了 Ctrl-A 之后跨电脑切换,你在别人机器上也能用</strong>(很多人也是 Ctrl-A)。</p><h3 id="_4-3-双击-prefix-把-prefix-传给程序" tabindex="-1">4.3 双击 prefix 把 prefix 传给程序 <a class="header-anchor" href="#_4-3-双击-prefix-把-prefix-传给程序" aria-label="Permalink to &quot;4.3 双击 prefix 把 prefix 传给程序&quot;">​</a></h3><p>改完 prefix 之后,还要解决**&quot;我真的想给程序发 Ctrl-A 怎么办&quot;**(比如 bash 的&quot;光标移到行首&quot;或 vim 的某些插件)。</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 在 .tmux.conf 里:</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">set</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -g</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> prefix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> C-a</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">bind</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> C-a</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> send-prefix</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">       # 按两次 Ctrl-A 把 Ctrl-A 真的发出去</span></span></code></pre></div><p>这样:<strong>Ctrl-A 单独按 = 进入 tmux 模式</strong>,<strong>Ctrl-A 双击 = 把 Ctrl-A 发给当前程序</strong>。</p><h3 id="_4-4-prefix-是-安全门-不是-麻烦" tabindex="-1">4.4 prefix 是&quot;安全门&quot;,不是&quot;麻烦&quot; <a class="header-anchor" href="#_4-4-prefix-是-安全门-不是-麻烦" aria-label="Permalink to &quot;4.4 prefix 是&quot;安全门&quot;,不是&quot;麻烦&quot;&quot;">​</a></h3><p>新人嫌 prefix 麻烦是因为<strong>没体会过它防住的事故</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>没有 prefix(假设 tmux 直接绑 Ctrl-W 是关 pane):</span></span>
<span class="line"><span>   - 你在 vim 里按 Ctrl-W(切 window 子模式)</span></span>
<span class="line"><span>   - vim 看不到 Ctrl-W,因为 tmux 拦截了</span></span>
<span class="line"><span>   - 你的 pane 没了</span></span>
<span class="line"><span>   - vim 的快捷键全废</span></span>
<span class="line"><span>   - 装一个 emacs?Ctrl-X 也被 tmux 抢</span></span>
<span class="line"><span>   - 装 Claude Code?Ctrl-N(下一条消息)被 tmux 抢</span></span>
<span class="line"><span></span></span>
<span class="line"><span>有 prefix:</span></span>
<span class="line"><span>   - 你 vim 里按 Ctrl-W → 正常切 vim 子模式</span></span>
<span class="line"><span>   - 你想关 tmux pane → prefix + x</span></span>
<span class="line"><span>   - 所有终端程序的快捷键 100% 保留</span></span>
<span class="line"><span>   - tmux 跟程序&quot;不抢键&quot;</span></span></code></pre></div><p><strong>prefix 的本质是&quot;租用一个 key namespace&quot;</strong>——你借一个 key(C-a)给 tmux,作为回报,<strong>tmux 不抢任何其他 key</strong>。这笔交易非常划算。</p><hr><h2 id="五、基础操作的-语义分组" tabindex="-1">五、基础操作的&quot;语义分组&quot; <a class="header-anchor" href="#五、基础操作的-语义分组" aria-label="Permalink to &quot;五、基础操作的&quot;语义分组&quot;&quot;">​</a></h2><p><strong>不抄快捷键大全,讲心智</strong>。tmux 的快捷键看似乱(prefix 后面跟一堆字母),但分组后只有<strong>三类</strong>——session 操作 / window 操作 / pane 操作,加上 copy-mode 一类工具操作。</p><h3 id="_5-1-session-类" tabindex="-1">5.1 Session 类 <a class="header-anchor" href="#_5-1-session-类" aria-label="Permalink to &quot;5.1 Session 类&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Session 操作(整个工作流级别的事):</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  tmux new -s work                  # 命令行:新建一个叫 work 的 session</span></span>
<span class="line"><span>  tmux ls                           # 命令行:列所有 session</span></span>
<span class="line"><span>  tmux attach -t work               # 命令行:attach 到 work</span></span>
<span class="line"><span>  tmux kill-session -t work         # 命令行:杀掉 work</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  prefix + d                        # session 内:detach(干净退出但保活)</span></span>
<span class="line"><span>  prefix + s                        # session 内:交互式选 session 切换</span></span>
<span class="line"><span>  prefix + $                        # session 内:重命名当前 session</span></span>
<span class="line"><span>  prefix + (    prefix + )          # session 内:上/下一个 session</span></span></code></pre></div><p><strong>为什么这么分组?</strong> 因为 session 是&quot;件事的容器&quot;——<strong>你新建 / 列 / 切换 / 杀掉 session,本质上是在切换工作流</strong>,这跟 vim 的 buffer 切换、Chrome 的窗口切换是同一类操作。</p><h3 id="_5-2-window-类" tabindex="-1">5.2 Window 类 <a class="header-anchor" href="#_5-2-window-类" aria-label="Permalink to &quot;5.2 Window 类&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Window 操作(同一件事内的次级上下文):</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  prefix + c                        # 新建 window</span></span>
<span class="line"><span>  prefix + n   /   prefix + p       # 下一个 / 上一个 window</span></span>
<span class="line"><span>  prefix + 1   ... prefix + 9       # 跳到第 N 个 window</span></span>
<span class="line"><span>  prefix + ,                        # 给 window 改名</span></span>
<span class="line"><span>  prefix + &amp;                        # 杀掉 window(会问 y/n)</span></span>
<span class="line"><span>  prefix + w                        # 列出 window(交互式选)</span></span>
<span class="line"><span>  prefix + .                        # 把 window 移到另一个 index</span></span></code></pre></div><p><strong>为什么这么分组?</strong> 因为 window 像浏览器的 tab——<strong>你创建一个、跳来跳去、改名字、关掉</strong>,跟 browser tab 操作完全一对一映射。</p><h3 id="_5-3-pane-类" tabindex="-1">5.3 Pane 类 <a class="header-anchor" href="#_5-3-pane-类" aria-label="Permalink to &quot;5.3 Pane 类&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Pane 操作(同一 window 的分屏):</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  prefix + |        垂直分割(自定义,默认 %)</span></span>
<span class="line"><span>  prefix + -        水平分割(自定义,默认 &quot;)</span></span>
<span class="line"><span>  prefix + h/j/k/l  在 pane 间跳(自定义 vim 风格)</span></span>
<span class="line"><span>  prefix + 方向键   默认 pane 跳转</span></span>
<span class="line"><span>  prefix + z        zoom 当前 pane 到全屏(再按一次还原)</span></span>
<span class="line"><span>  prefix + x        杀掉 pane</span></span>
<span class="line"><span>  prefix + q        瞬间显示每个 pane 的编号</span></span>
<span class="line"><span>  prefix + {  / }   交换 pane 位置</span></span>
<span class="line"><span>  prefix + Space    循环切换 layout</span></span></code></pre></div><p><strong>为什么这么分组?</strong> 因为 pane 是&quot;屏幕上的一块&quot;——<strong>创建、移动、放大、关掉</strong>,这跟窗口管理器里的 split 操作一一对应。</p><h3 id="_5-4-工具类" tabindex="-1">5.4 工具类 <a class="header-anchor" href="#_5-4-工具类" aria-label="Permalink to &quot;5.4 工具类&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>copy-mode / 进入工具模式:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  prefix + [        进入 copy-mode(可以滚屏 / 选文本 / 搜索)</span></span>
<span class="line"><span>  prefix + ]        粘贴上次 copy-mode 选中的文本</span></span>
<span class="line"><span>  prefix + :        进入命令模式(直接敲 tmux 命令)</span></span>
<span class="line"><span>  prefix + ?        显示当前所有 keybindings</span></span>
<span class="line"><span>  prefix + t        显示一个全屏的时钟(无用但好玩)</span></span>
<span class="line"><span>  prefix + r        重新加载 .tmux.conf(自定义,默认无)</span></span></code></pre></div><p><strong>这一组是 tmux 的&quot;次级界面&quot;</strong>——copy-mode 是最重要的(下一节单独讲)。</p><h3 id="_5-5-三组速记表" tabindex="-1">5.5 三组速记表 <a class="header-anchor" href="#_5-5-三组速记表" aria-label="Permalink to &quot;5.5 三组速记表&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌─────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│                                                 │</span></span>
<span class="line"><span>│   &quot;$()&quot;  ←  session  (s 头 / $ 改名 / 括号切)  │</span></span>
<span class="line"><span>│       d, s, $, (, )                            │</span></span>
<span class="line"><span>│                                                 │</span></span>
<span class="line"><span>│   &quot;,cnw&amp;&quot;  ←  window  (c 创 / n 下 / ,改名)    │</span></span>
<span class="line"><span>│       c, n, p, 1-9, ,, &amp;, w                    │</span></span>
<span class="line"><span>│                                                 │</span></span>
<span class="line"><span>│   &quot;|-hjkl z x&quot; ← pane  (|分 / hjkl 跳 / z 缩)  │</span></span>
<span class="line"><span>│       |, -, h, j, k, l, z, x, q, Space         │</span></span>
<span class="line"><span>│                                                 │</span></span>
<span class="line"><span>└─────────────────────────────────────────────────┘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>15-20 个快捷键,就是 tmux 日常的全部</span></span></code></pre></div><p><strong>有人会贴一张 100 多个快捷键的表&quot;tmux 全键位&quot;——别背,90% 一辈子不用</strong>。日常就这 15-20 个,3 天内化,1 周熟练。</p><hr><h2 id="六、状态栏的语义" tabindex="-1">六、状态栏的语义 <a class="header-anchor" href="#六、状态栏的语义" aria-label="Permalink to &quot;六、状态栏的语义&quot;">​</a></h2><p>打开 tmux 之后底部那一条**状态栏(status line)**是 tmux 的&quot;仪表盘&quot;——很多人觉得它丑,但它的信息密度是设计过的:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌─────────────────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│                          [屏幕内容]                                      │</span></span>
<span class="line"><span>│                                                                         │</span></span>
<span class="line"><span>│                                                                         │</span></span>
<span class="line"><span>├─────────────────────────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>│ [work]  1:editor* 2:server- 3:git  4:claude         &quot;host&quot; 14:30 5月12  │</span></span>
<span class="line"><span>└─────────────────────────────────────────────────────────────────────────┘</span></span>
<span class="line"><span>   ↑       ↑       ↑                                   ↑</span></span>
<span class="line"><span>   ↑       ↑       ↑                                   右:hostname / 时间 / 日期</span></span>
<span class="line"><span>   ↑       ↑       window 列表(* = 当前,- = 上次)</span></span>
<span class="line"><span>   ↑       window 自动编号</span></span>
<span class="line"><span>   左:session 名([work])</span></span></code></pre></div><p><strong>关键字段</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>左侧(status-left):</span></span>
<span class="line"><span>   [work]    当前 session 名,告诉你&quot;现在在哪件事&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>中间(status-window-list):</span></span>
<span class="line"><span>   1:editor* 2:server- 3:git 4:claude</span></span>
<span class="line"><span>   - 数字是 window 的 index</span></span>
<span class="line"><span>   - 冒号后是 window 名(自动用当前命令名 / 你 prefix + , 改的名)</span></span>
<span class="line"><span>   - *  表示当前 window</span></span>
<span class="line"><span>   - -  表示上次访问的 window(prefix + l 跳回)</span></span>
<span class="line"><span>   - !  表示这个 window 有 activity(有输出,需要看)</span></span>
<span class="line"><span>   - #  表示这个 window 有 bell(很多人关掉了)</span></span>
<span class="line"><span>   - Z  表示当前 window 处于 zoom 状态(一个 pane 占满)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>右侧(status-right):</span></span>
<span class="line"><span>   &quot;host&quot; 14:30 5月12</span></span>
<span class="line"><span>   - 主机名(尤其重要:你不知道自己在哪台机器上)</span></span>
<span class="line"><span>   - 时间(很多人用 tmux 时全屏,屏幕上没系统时钟)</span></span>
<span class="line"><span>   - 日期(可选,不常用)</span></span></code></pre></div><p><strong>状态栏是 tmux 给你的&quot;我现在在哪&quot;提示</strong>——<code>[work]</code> 告诉你 session,<code>1:editor*</code> 告诉你 window,主机名告诉你机器。<strong>这三件事在你 attach / detach / ssh 多机时极其重要</strong>——不然你不知道自己刚按的命令到底打在哪里。</p><p><strong>状态栏可改</strong>——17 篇专讲怎么改(简化 / 加 cpu mem / 改颜色)。<strong>这一篇心智先建立:状态栏不是装饰,是仪表盘</strong>。</p><hr><h2 id="七、copy-mode-tmux-学习曲线最陡的一步" tabindex="-1">七、copy-mode:tmux 学习曲线最陡的一步 <a class="header-anchor" href="#七、copy-mode-tmux-学习曲线最陡的一步" aria-label="Permalink to &quot;七、copy-mode:tmux 学习曲线最陡的一步&quot;">​</a></h2><p>新人在 tmux 里最容易卡死的事:<strong>怎么向上滚屏看历史</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>你 ssh 进生产机,跑了一段 grep,输出 50 屏</span></span>
<span class="line"><span>你按 PageUp ... 没反应</span></span>
<span class="line"><span>你滚轮 ... 没反应(默认 mouse off)</span></span>
<span class="line"><span>你按 Ctrl-Up ... 没反应</span></span>
<span class="line"><span>你 Cmd + 向上 ... iTerm 自己滚了一下但 tmux 没动</span></span>
<span class="line"><span>你试图复制选中文本 ... 选不到</span></span></code></pre></div><p><strong>为什么这么折磨人?</strong> 因为 tmux 拦截了 pty 的输出——<strong>屏幕上你看到的所有内容,实际上是 tmux 的内部 buffer</strong>,你的终端模拟器看到的只是&quot;tmux 当前帧&quot;。你想滚屏,<strong>必须告诉 tmux &quot;我要看历史 buffer 了&quot;</strong>——这就是 copy-mode。</p><h3 id="_7-1-进入-copy-mode" tabindex="-1">7.1 进入 copy-mode <a class="header-anchor" href="#_7-1-进入-copy-mode" aria-label="Permalink to &quot;7.1 进入 copy-mode&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>prefix + [           进入 copy-mode</span></span>
<span class="line"><span></span></span>
<span class="line"><span>进入之后,左上角(或右上角,看版本)会显示 [copy]</span></span>
<span class="line"><span>   你的按键不再发给前台进程,而是给 tmux 内部的&quot;光标&quot;</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>此时你可以:</span></span>
<span class="line"><span>   k / j  或  方向键    上下移动(滚屏)</span></span>
<span class="line"><span>   h / l                左右移动</span></span>
<span class="line"><span>   PageUp / PageDown    翻页</span></span>
<span class="line"><span>   /  + 关键字 + Enter  向下搜索</span></span>
<span class="line"><span>   ?  + 关键字 + Enter  向上搜索</span></span>
<span class="line"><span>   n  / N                下一个 / 上一个匹配</span></span>
<span class="line"><span>   g  / G                跳到 buffer 顶 / 底</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>选取:</span></span>
<span class="line"><span>   v(vi 模式) 或 space(emacs 模式)   开始选取(进入 visual)</span></span>
<span class="line"><span>   移动光标选中文本</span></span>
<span class="line"><span>   y(vi 模式) 或 enter                复制选中文本到 tmux buffer</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>退出 copy-mode:</span></span>
<span class="line"><span>   q  或 esc                          回到正常模式</span></span></code></pre></div><h3 id="_7-2-emacs-vs-vi-默认" tabindex="-1">7.2 emacs vs vi 默认 <a class="header-anchor" href="#_7-2-emacs-vs-vi-默认" aria-label="Permalink to &quot;7.2 emacs vs vi 默认&quot;">​</a></h3><p><strong>tmux 默认 copy-mode 是 emacs 键位</strong>——<code>Ctrl-N</code> 下、<code>Ctrl-P</code> 上、<code>Ctrl-V</code> 翻页、<code>Ctrl-Space</code> 选取。<strong>大多数 vim 用户立刻改成 vi</strong>:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># .tmux.conf:</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">setw</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -g</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> mode-keys</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> vi</span></span></code></pre></div><p>改完之后:<code>h j k l</code> 移动、<code>v</code> 选取、<code>y</code> 复制——<strong>跟 vim 的视觉模式一模一样</strong>。</p><h3 id="_7-3-复制到系统剪贴板" tabindex="-1">7.3 复制到系统剪贴板 <a class="header-anchor" href="#_7-3-复制到系统剪贴板" aria-label="Permalink to &quot;7.3 复制到系统剪贴板&quot;">​</a></h3><p>tmux 默认的 <code>y</code>(yank)只复制到 <strong>tmux 自己的 buffer</strong>(<code>prefix + ]</code> 才能粘回 tmux)。<strong>真正有用的是复制到系统剪贴板</strong>(让你能 Cmd-V 粘到别的程序):</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># macOS:</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">bind-key</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -T</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> copy-mode-vi</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> y</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> send-keys</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -X</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> copy-pipe-and-cancel</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;pbcopy&quot;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Linux X11:</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">bind-key</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -T</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> copy-mode-vi</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> y</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> send-keys</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -X</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> copy-pipe-and-cancel</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;xclip -selection clipboard&quot;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Linux Wayland:</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">bind-key</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -T</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> copy-mode-vi</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> y</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> send-keys</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -X</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> copy-pipe-and-cancel</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;wl-copy&quot;</span></span></code></pre></div><p><strong>配置完之后,copy-mode 里 y 直接进系统剪贴板</strong>——你按 Cmd-V 就能在任何程序里粘贴。<strong>没这一行配置,90% 的 copy 操作都白做</strong>。</p><h3 id="_7-4-鼠标可不可以替代" tabindex="-1">7.4 鼠标可不可以替代 <a class="header-anchor" href="#_7-4-鼠标可不可以替代" aria-label="Permalink to &quot;7.4 鼠标可不可以替代&quot;">​</a></h3><p>很多人问:&quot;为什么不直接用鼠标选?&quot;——<strong>可以,但有大坑</strong>。</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># .tmux.conf:</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">set</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -g</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> mouse</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> on</span></span></code></pre></div><p>开启之后:<strong>滚轮直接进 copy-mode 滚动</strong>、<strong>鼠标可以拖动 pane 分界线</strong>、<strong>鼠标可以点击切 pane</strong>。</p><p><strong>但</strong>:<strong>鼠标选取的&quot;行为&quot;在 tmux 里和你想的不一样</strong>——</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>你在普通终端里:</span></span>
<span class="line"><span>   鼠标拖选 → 选中的文字进系统剪贴板(终端模拟器干的)</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>你在 tmux + mouse on:</span></span>
<span class="line"><span>   鼠标拖选 → 选中的文字进 tmux buffer(tmux 拦截了选取事件)</span></span>
<span class="line"><span>   选中之后,松开鼠标 → tmux 立刻退出 copy-mode → 选中的内容到 tmux 内部</span></span>
<span class="line"><span>   你 Cmd-V 粘不到别的程序!</span></span></code></pre></div><p><strong>解法</strong>:<strong>配置 copy-mode 的鼠标行为</strong>——松开鼠标时把内容 pipe 到 pbcopy:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">bind-key</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -T</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> copy-mode-vi</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> MouseDragEnd1Pane</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> send-keys</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -X</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> copy-pipe-and-cancel</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;pbcopy&quot;</span></span></code></pre></div><p><strong>没配这一行,mouse on 就是个坑——你看似选中了,实际没法复制出去</strong>。17 篇会一并贴出。</p><h3 id="_7-5-为什么这是-最陡的一步" tabindex="-1">7.5 为什么这是&quot;最陡的一步&quot; <a class="header-anchor" href="#_7-5-为什么这是-最陡的一步" aria-label="Permalink to &quot;7.5 为什么这是&quot;最陡的一步&quot;&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>copy-mode 不是&quot;功能&quot;,是&quot;模式切换&quot;——</span></span>
<span class="line"><span>   你必须意识到&quot;我现在在 copy 模式 / 我现在在正常模式&quot;</span></span>
<span class="line"><span>   一个模式下的按键,在另一个模式下完全不同</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>对从来没用过 vim / modal editor 的人,这就是认知门槛</span></span>
<span class="line"><span>   &quot;为什么我按 j 不是输入 j,而是光标下移?&quot;</span></span>
<span class="line"><span>   &quot;为什么我按 y 不是输入 y,而是复制?&quot;</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>扛过这一步,你就建立了&quot;modal 思维&quot;</span></span>
<span class="line"><span>   这套思维下一步可以扩展到 vim / Neovim / Helix(19-21 篇)</span></span>
<span class="line"><span>   tmux copy-mode 是你进入 modal 世界的入口</span></span></code></pre></div><p><strong>这个学习曲线值不值?</strong> 值——一旦你内化 copy-mode,<strong>你滚屏 / 搜索 / 复制的速度比鼠标快 5-10 倍</strong>,而且<strong>所有终端 + tmux + vim 共用同一套 hjkl + / 搜索心智</strong>。</p><hr><h2 id="八、session-的生命周期-命名工作流" tabindex="-1">八、session 的生命周期 / 命名工作流 <a class="header-anchor" href="#八、session-的生命周期-命名工作流" aria-label="Permalink to &quot;八、session 的生命周期 / 命名工作流&quot;">​</a></h2><p>把 session 当成&quot;长期挂载的工作流&quot;,<strong>命名很重要</strong>。</p><h3 id="_8-1-一个-session-一件事" tabindex="-1">8.1 一个 session 一件事 <a class="header-anchor" href="#_8-1-一个-session-一件事" aria-label="Permalink to &quot;8.1 一个 session 一件事&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>推荐的 session 列表:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  work       写后端代码这件事</span></span>
<span class="line"><span>  infra      维护生产基础设施</span></span>
<span class="line"><span>  notes      写文章 / 笔记</span></span>
<span class="line"><span>  claude     跑 Claude Code 长任务</span></span>
<span class="line"><span>  sre        事故排查</span></span>
<span class="line"><span>  dotfiles   配置自己的 dotfiles</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>不推荐:</span></span>
<span class="line"><span>  ✗ session 1, session 2, session 3 (无意义命名)</span></span>
<span class="line"><span>  ✗ ssh1, ssh2, ssh3 (按&quot;连了哪台机器&quot;分)</span></span>
<span class="line"><span>  ✗ tmp, test, foo (临时命名永久化)</span></span></code></pre></div><p><strong>判断准则</strong>:<strong>3 个月后你回来,看到这个 session 名,是不是马上知道里面在干什么?</strong> 是,合格;不是,改名。</p><h3 id="_8-2-session-的生命周期" tabindex="-1">8.2 session 的生命周期 <a class="header-anchor" href="#_8-2-session-的生命周期" aria-label="Permalink to &quot;8.2 session 的生命周期&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>出生:</span></span>
<span class="line"><span>   tmux new -s work</span></span>
<span class="line"><span>   或者用 tmuxinator / tmuxp / 自定义脚本一键起多窗格</span></span>
<span class="line"><span>   (17 篇会讲)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>attach / detach 循环:</span></span>
<span class="line"><span>   工作中:</span></span>
<span class="line"><span>      attach 进来 → 干活 → detach 出去(prefix + d)</span></span>
<span class="line"><span>      attach 进来 → 干活 → detach 出去</span></span>
<span class="line"><span>      ...</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   server 重启之间它一直在(可能几天到几周)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>死亡:</span></span>
<span class="line"><span>   ① 主动:tmux kill-session -t work</span></span>
<span class="line"><span>   ② 间接:整个 server 死(kill-server / 机器重启)</span></span>
<span class="line"><span>   ③ 进程级:session 里的所有 window 都 exit 之后,session 自动消失</span></span></code></pre></div><p><strong>session 不是越长寿越好</strong>——长期挂着的 session 会<strong>积累垃圾</strong>(没用的 window、僵尸进程、跑了 1000 行历史的临时命令)。<strong>每周一次 spring cleaning</strong>:看一眼 <code>tmux ls</code>,把不用的 session kill 掉。</p><h3 id="_8-3-屏幕共享-同一-session-多人-attach" tabindex="-1">8.3 &quot;屏幕共享&quot;:同一 session 多人 attach <a class="header-anchor" href="#_8-3-屏幕共享-同一-session-多人-attach" aria-label="Permalink to &quot;8.3 &quot;屏幕共享&quot;:同一 session 多人 attach&quot;">​</a></h3><p>tmux 的另一个被低估的能力:<strong>多 client 同时 attach 同一个 session</strong>——所有人看到的屏幕完全一致,<strong>所有人的键盘都能输入</strong>(协作模式)。</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 你 ssh 进 server,起一个 session:</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> tmux</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> new</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -s</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> pair</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 同事也 ssh 进同一台 server,attach:</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> tmux</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> attach</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -t</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> pair</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 现在你俩看的是同一个屏幕,你打的字他能看见,他打的字你能看见</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 这是天然的&quot;屏幕共享 + 协作编辑&quot;,不需要任何视频会议软件</span></span></code></pre></div><p><strong>真实用法</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>- 远程 pair programming (你写代码他看你写)</span></span>
<span class="line"><span>- 远程 debugging      (你出问题让 senior attach 来看)</span></span>
<span class="line"><span>- 远程教学           (你跑命令给学生看,学生也能跑给你看)</span></span>
<span class="line"><span>- 灾难应急           (事故时 SRE 多人共同登一台机器协作)</span></span></code></pre></div><p><strong>注意安全</strong>:<strong>多人 attach = 多人有完整的 shell 控制权</strong>——你能跑的命令他都能跑。<strong>不要在生产敏感机器上随便让人 attach</strong>。如果只想&quot;看不能操作&quot;,用 tmux 的 readonly 模式(<code>tmux attach -t pair -r</code>)。</p><h3 id="_8-4-把-开新机器-变成-attach" tabindex="-1">8.4 把&quot;开新机器&quot;变成&quot;attach&quot; <a class="header-anchor" href="#_8-4-把-开新机器-变成-attach" aria-label="Permalink to &quot;8.4 把&quot;开新机器&quot;变成&quot;attach&quot;&quot;">​</a></h3><p>这是 tmux 心智的最高境界:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>传统的 ssh 工作流:</span></span>
<span class="line"><span>   ssh server</span></span>
<span class="line"><span>   cd /work/project</span></span>
<span class="line"><span>   vim main.go</span></span>
<span class="line"><span>   # 工作中...</span></span>
<span class="line"><span>   ^D 退出 → 一切消失</span></span>
<span class="line"><span>   下次再 ssh,从头来:cd /work/project; vim main.go; ...</span></span>
<span class="line"><span></span></span>
<span class="line"><span>tmux 工作流:</span></span>
<span class="line"><span>   ssh server</span></span>
<span class="line"><span>   tmux attach -t work     # 直接 attach 上次留下的 work session</span></span>
<span class="line"><span>   # 看到 vim 还开着 main.go,光标还在那一行</span></span>
<span class="line"><span>   # tail 还在前台跑</span></span>
<span class="line"><span>   # Claude Code 还在等输入</span></span>
<span class="line"><span>   # 一切如初</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   &quot;工作&quot;不再有&quot;开始&quot;和&quot;结束&quot;,只有&quot;暂停&quot;和&quot;继续&quot;</span></span></code></pre></div><p><strong>这种工作流的核心</strong>:<strong>长期挂载的 session = 你的&quot;工作快照&quot;</strong>——你换电脑、换地点、换 IDE,只要远端机器没重启,你的 session 在那儿。<strong>这才是 tmux 的灵魂</strong>。</p><hr><h2 id="九、嵌套-tmux-常见痛点" tabindex="-1">九、嵌套 tmux:常见痛点 <a class="header-anchor" href="#九、嵌套-tmux-常见痛点" aria-label="Permalink to &quot;九、嵌套 tmux:常见痛点&quot;">​</a></h2><p><strong>90% 用 tmux 一年以上的人都遇到过嵌套问题</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>你在本地电脑跑 tmux(prefix C-a)</span></span>
<span class="line"><span>然后 ssh 进远端机器,远端也跑 tmux(prefix C-a)</span></span>
<span class="line"><span>现在你按 prefix:</span></span>
<span class="line"><span>   本地 tmux 拦截 → 你给远端的命令到不了</span></span>
<span class="line"><span>   你的 ssh 远端 tmux 根本收不到 prefix</span></span>
<span class="line"><span>   两套 tmux 抢同一个键</span></span></code></pre></div><h3 id="_9-1-嵌套的本质" tabindex="-1">9.1 嵌套的本质 <a class="header-anchor" href="#_9-1-嵌套的本质" aria-label="Permalink to &quot;9.1 嵌套的本质&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>本地 tmux client (你坐的 iTerm)</span></span>
<span class="line"><span>       ↓</span></span>
<span class="line"><span>本地 tmux server(本地 daemon)</span></span>
<span class="line"><span>       ↓ (其中一个 pane 跑着 ssh)</span></span>
<span class="line"><span>ssh 隧道</span></span>
<span class="line"><span>       ↓</span></span>
<span class="line"><span>远端 tmux client (ssh 隧道里跑的)</span></span>
<span class="line"><span>       ↓</span></span>
<span class="line"><span>远端 tmux server(远端 daemon)</span></span>
<span class="line"><span>       ↓</span></span>
<span class="line"><span>远端 vim / Claude / shell</span></span></code></pre></div><p><strong>问题</strong>:<strong>你的按键先到本地 tmux,被它拦截</strong>——它根本不知道你是要给&quot;我&quot;的命令还是要给&quot;远端的 tmux&quot;。</p><h3 id="_9-2-三种解法" tabindex="-1">9.2 三种解法 <a class="header-anchor" href="#_9-2-三种解法" aria-label="Permalink to &quot;9.2 三种解法&quot;">​</a></h3><p><strong>解法 1:本地不用 tmux,只远端用</strong></p><p>最干净。<strong>如果你 95% 的 tmux 工作都在远端,本地就别套一层</strong>。本地直接 iTerm 多 tab + 远端 tmux,完全够用。</p><p><strong>解法 2:远端用不同 prefix</strong></p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 远端机器的 ~/.tmux.conf:</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">set</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -g</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> prefix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> C-b</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">               # 远端用 Ctrl-B(默认)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">unbind</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> C-a</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                       # 解除 Ctrl-A</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">bind</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> C-b</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> send-prefix</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">             # 双击 C-b 把 C-b 发出去</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 本地:用 C-a(我们之前改的)</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 远端:用 C-b(回到默认)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 这样你按 C-a → 本地 tmux 接,按 C-b → 透传到远端 tmux 接</span></span></code></pre></div><p><strong>这是最实用的解法</strong>——本地远端各用一套,互不冲突。</p><p><strong>解法 3:本地把 prefix 透传</strong></p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 本地的 .tmux.conf:</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">bind-key</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -n</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> C-a</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> send-prefix</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">     # 单击 C-a 透传给远端</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">bind-key</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> C-a</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> send-prefix</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">         # prefix + C-a 也透传</span></span></code></pre></div><p>但这样<strong>本地 tmux 就用不了 prefix 了</strong>——只能远端用。这种解法很少用。</p><h3 id="_9-3-实际推荐" tabindex="-1">9.3 实际推荐 <a class="header-anchor" href="#_9-3-实际推荐" aria-label="Permalink to &quot;9.3 实际推荐&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>如果你 80% 时间在远端:</span></span>
<span class="line"><span>   本地不开 tmux,iTerm 多 tab 就好</span></span>
<span class="line"><span>   远端 tmux 用你最熟的 prefix(C-a)</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>如果你本地远端都重度用:</span></span>
<span class="line"><span>   本地 prefix C-a,远端 prefix C-b</span></span>
<span class="line"><span>   远端 .tmux.conf 重写 prefix</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>如果你经常多层 ssh:</span></span>
<span class="line"><span>   本地 C-a,第一跳 C-b,第二跳 \` (反引号)</span></span>
<span class="line"><span>   每多一层换一个 key,从外到里</span></span></code></pre></div><p><strong>记号</strong>:<strong>外层 tmux 总是&quot;先吃&quot;prefix,所以越外层的 prefix 越好按,越内层的越偏门</strong>——和你的&quot;日常按多少次&quot;成反比。</p><hr><h2 id="十、tmux-vs-screen-vs-zellij" tabindex="-1">十、tmux vs screen vs Zellij <a class="header-anchor" href="#十、tmux-vs-screen-vs-zellij" aria-label="Permalink to &quot;十、tmux vs screen vs Zellij&quot;">​</a></h2><p>简短对比,<strong>给选型一个清晰判断</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌──────────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  工具      │  年代   │  状态        │  默认装  │  设计哲学         │</span></span>
<span class="line"><span>├────────────┼─────────┼──────────────┼──────────┼──────────────────┤</span></span>
<span class="line"><span>│  screen    │  1987   │  几乎停更    │  几乎所有 │  能用就行         │</span></span>
<span class="line"><span>│            │         │              │  Linux   │                  │</span></span>
<span class="line"><span>│                                                                   │</span></span>
<span class="line"><span>│  tmux      │  2007   │  活跃        │  否(brew │  显式 server      │</span></span>
<span class="line"><span>│            │         │              │  install)│  / 现代键位       │</span></span>
<span class="line"><span>│                                                                   │</span></span>
<span class="line"><span>│  Zellij    │  2020   │  活跃        │  否       │  开箱即用 / 声明式│</span></span>
<span class="line"><span>│            │         │              │          │  layout / Rust   │</span></span>
<span class="line"><span>└──────────────────────────────────────────────────────────────────┘</span></span></code></pre></div><h3 id="_10-1-screen-应急用" tabindex="-1">10.1 screen:应急用 <a class="header-anchor" href="#_10-1-screen-应急用" aria-label="Permalink to &quot;10.1 screen:应急用&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>何时用 screen:</span></span>
<span class="line"><span>  - 你 ssh 进一台陌生 Linux,没装 tmux,也没法 sudo</span></span>
<span class="line"><span>  - 你只想 &quot;detach 一下&quot; 跑长任务,不需要分屏</span></span>
<span class="line"><span>  - 你修复一个 1995 年的服务器,只有 screen</span></span>
<span class="line"><span></span></span>
<span class="line"><span>screen 的优点:</span></span>
<span class="line"><span>  ✓ Linux 几乎默认装(/usr/bin/screen)</span></span>
<span class="line"><span>  ✓ 极简,几乎没配置成本</span></span>
<span class="line"><span>  ✓ 同样支持 detach / attach</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>screen 的缺点:</span></span>
<span class="line"><span>  ✗ 几乎停更</span></span>
<span class="line"><span>  ✗ 配置语法奇怪</span></span>
<span class="line"><span>  ✗ 分屏体验差</span></span>
<span class="line"><span>  ✗ 没有 copy-mode 的 vi 模式</span></span>
<span class="line"><span>  ✗ 状态栏定制能力弱</span></span>
<span class="line"><span>  ✗ 不支持现代键位</span></span>
<span class="line"><span>  ✗ 几乎没插件生态</span></span>
<span class="line"><span></span></span>
<span class="line"><span>实用建议:平时学 tmux,看见 screen 也认识</span></span>
<span class="line"><span>        生产机如果只有 screen,知道 detach 是 Ctrl-A + d</span></span>
<span class="line"><span>        长期 screen 用户应该迁到 tmux</span></span></code></pre></div><h3 id="_10-2-tmux-主流" tabindex="-1">10.2 tmux:主流 <a class="header-anchor" href="#_10-2-tmux-主流" aria-label="Permalink to &quot;10.2 tmux:主流&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>何时用 tmux(几乎所有现代场景):</span></span>
<span class="line"><span>  - 你需要 detach / attach</span></span>
<span class="line"><span>  - 你需要分屏</span></span>
<span class="line"><span>  - 你需要会话持久化</span></span>
<span class="line"><span>  - 你需要远端长任务</span></span>
<span class="line"><span>  - 你需要 pair programming / 屏幕共享</span></span>
<span class="line"><span>  - 你的 .tmux.conf 想 sync 到所有机器</span></span>
<span class="line"><span></span></span>
<span class="line"><span>tmux 的优点:</span></span>
<span class="line"><span>  ✓ 活跃维护(最近一次大版本 2024 还有)</span></span>
<span class="line"><span>  ✓ 配置文件清晰(.tmux.conf 语法直接)</span></span>
<span class="line"><span>  ✓ 插件生态成熟(TPM 一行安装)</span></span>
<span class="line"><span>  ✓ copy-mode 支持 vi 键位</span></span>
<span class="line"><span>  ✓ 状态栏高度可定制</span></span>
<span class="line"><span>  ✓ 现代键位友好</span></span>
<span class="line"><span>  ✓ 大部分 dotfiles 仓库以 tmux 为默认</span></span>
<span class="line"><span>  ✓ 文档 / Stack Overflow 答案极多</span></span>
<span class="line"><span></span></span>
<span class="line"><span>tmux 的缺点:</span></span>
<span class="line"><span>  ✗ 默认配置需要改(prefix C-b / 复制操作 / 分屏键)</span></span>
<span class="line"><span>  ✗ 学习曲线在 copy-mode / mouse on 的协调</span></span>
<span class="line"><span>  ✗ 嵌套时的 prefix 冲突</span></span>
<span class="line"><span>  ✗ 状态恢复需要插件(tmux-resurrect),且不能恢复进程内部状态</span></span>
<span class="line"><span></span></span>
<span class="line"><span>实用建议:2026 默认就是它,本系列也以它为例</span></span></code></pre></div><h3 id="_10-3-zellij-声明式新秀" tabindex="-1">10.3 Zellij:声明式新秀 <a class="header-anchor" href="#_10-3-zellij-声明式新秀" aria-label="Permalink to &quot;10.3 Zellij:声明式新秀&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>何时用 Zellij:</span></span>
<span class="line"><span>  - 你愿意&quot;花一个学习曲线换一个更好的默认&quot;</span></span>
<span class="line"><span>  - 你受不了 tmux 的 50 个 prefix 快捷键</span></span>
<span class="line"><span>  - 你喜欢声明式配置(KDL)</span></span>
<span class="line"><span>  - 你想要&quot;开箱即用&quot;的状态栏 / 浮动窗口</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>Zellij 的优点:</span></span>
<span class="line"><span>  ✓ 开箱即用(默认配置可用,几乎不用改)</span></span>
<span class="line"><span>  ✓ 状态栏 + 浮动窗口内置</span></span>
<span class="line"><span>  ✓ 声明式 layout(yaml/KDL 描述窗格结构)</span></span>
<span class="line"><span>  ✓ Rust 写的,性能好</span></span>
<span class="line"><span>  ✓ keybinding 提示常驻底部(对新人友好)</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>Zellij 的缺点:</span></span>
<span class="line"><span>  ✗ 生态远不如 tmux(2020 起步,生态薄)</span></span>
<span class="line"><span>  ✗ 不少高级场景缺失(SSH 共享 attach 不如 tmux 成熟)</span></span>
<span class="line"><span>  ✗ 自定义余地小(强约定的代价)</span></span>
<span class="line"><span>  ✗ 不少机器没装(brew install zellij 才有)</span></span>
<span class="line"><span>  ✗ 部分插件功能 tmux 已有的,Zellij 还在做</span></span>
<span class="line"><span></span></span>
<span class="line"><span>实用建议:Zellij 是潜力股,但 2026 还不到取代 tmux 的程度</span></span>
<span class="line"><span>        18 篇会专讲 Zellij vs tmux 怎么选</span></span>
<span class="line"><span>        如果你刚学 multiplexer,可以两个都试 1 周再选</span></span></code></pre></div><h3 id="_10-4-选型结论" tabindex="-1">10.4 选型结论 <a class="header-anchor" href="#_10-4-选型结论" aria-label="Permalink to &quot;10.4 选型结论&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>默认:tmux</span></span>
<span class="line"><span></span></span>
<span class="line"><span>例外:</span></span>
<span class="line"><span>  - 远端机器只有 screen,你只是临时 detach → screen</span></span>
<span class="line"><span>  - 你试过 tmux 想换 Zellij,有意识地评估 → Zellij(看 18 篇)</span></span>
<span class="line"><span>  - 你坚持只用终端模拟器的内置分屏 → 那就不学 tmux</span></span>
<span class="line"><span>    (但你失去了 detach / attach,长任务自己想办法)</span></span></code></pre></div><hr><h2 id="十一、反对的写法" tabindex="-1">十一、反对的写法 <a class="header-anchor" href="#十一、反对的写法" aria-label="Permalink to &quot;十一、反对的写法&quot;">​</a></h2><p>讲完正确的,<strong>列出几条常见错误</strong>——见到了就知道是错。</p><h3 id="_11-1-用-tmux-当窗口管理" tabindex="-1">11.1 用 tmux 当窗口管理 <a class="header-anchor" href="#_11-1-用-tmux-当窗口管理" aria-label="Permalink to &quot;11.1 用 tmux 当窗口管理&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错的:</span></span>
<span class="line"><span>  打开 tmux 就是为了&quot;分 4 个窗格,左上 vim,右上 server,左下 git,右下 tail&quot;</span></span>
<span class="line"><span>  用 tmux 替代 i3 / yabai / Hyprland 的窗口管理</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>错在哪:</span></span>
<span class="line"><span>  - tmux 是终端 multiplexer,不是 OS 窗口管理器</span></span>
<span class="line"><span>  - tmux 管的是&quot;终端里的窗格&quot;,不是&quot;屏幕上的窗口&quot;</span></span>
<span class="line"><span>  - 你的浏览器、Slack、Spotify 这些非终端程序,tmux 完全不管</span></span>
<span class="line"><span>  - 你想&quot;窗口管理&quot;,用 i3 / yabai(macOS)/ Hyprland(Wayland)</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>正确认知:</span></span>
<span class="line"><span>  - tmux 管终端窗格</span></span>
<span class="line"><span>  - i3 / yabai 管 OS 窗口</span></span>
<span class="line"><span>  - 这两个东西可以叠加,但功能不重叠</span></span></code></pre></div><h3 id="_11-2-鼠标-iterm-多-tab-替代-tmux" tabindex="-1">11.2 鼠标 + iTerm 多 tab 替代 tmux <a class="header-anchor" href="#_11-2-鼠标-iterm-多-tab-替代-tmux" aria-label="Permalink to &quot;11.2 鼠标 + iTerm 多 tab 替代 tmux&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错的:</span></span>
<span class="line"><span>  &quot;我有 iTerm,Cmd-T 开新 tab,Cmd-D 分屏,Cmd-1/2/3 切 tab,够用了&quot;</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>错在哪:</span></span>
<span class="line"><span>  - iTerm 的 tab / split 都跟&quot;客户端&quot;绑死</span></span>
<span class="line"><span>  - 关掉 iTerm 窗口 / 重启 Mac → 全没</span></span>
<span class="line"><span>  - 你 ssh 进远端,iTerm 的 tab 在远端没用(那是本地的)</span></span>
<span class="line"><span>  - 长任务跑在 iTerm tab 里,iTerm crash → 长任务死</span></span>
<span class="line"><span>  - 你想从家电脑接续公司电脑的 4 个 tab → 做不到</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>正确认知:</span></span>
<span class="line"><span>  - iTerm 的 tab / split = 视觉容器(本地)</span></span>
<span class="line"><span>  - tmux 的 window / pane = 工作流容器(可远端,可持久)</span></span>
<span class="line"><span>  - 两个层次,iTerm 是&quot;我看哪台机&quot;,tmux 是&quot;那台机上挂了什么&quot;</span></span></code></pre></div><h3 id="_11-3-不学-copy-mode-只用鼠标滚动" tabindex="-1">11.3 不学 copy-mode,只用鼠标滚动 <a class="header-anchor" href="#_11-3-不学-copy-mode-只用鼠标滚动" aria-label="Permalink to &quot;11.3 不学 copy-mode,只用鼠标滚动&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错的:</span></span>
<span class="line"><span>  装 tmux 之后开了 mouse on</span></span>
<span class="line"><span>  以为这样滚轮就能滚 buffer</span></span>
<span class="line"><span>  滚轮一滚发现自动进 copy-mode 了,但不会用 / / n</span></span>
<span class="line"><span>  搜索历史还是用 grep + 重新跑命令</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>错在哪:</span></span>
<span class="line"><span>  - mouse on 只是让你&quot;用鼠标进 copy-mode&quot;,不是&quot;用鼠标就行了&quot;</span></span>
<span class="line"><span>  - 真正的复制 / 搜索还是要用 hjkl + / 这套键位</span></span>
<span class="line"><span>  - 不学 copy-mode 等于失去 tmux 滚屏 / 搜索 / 复制能力的 80%</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>正确认知:</span></span>
<span class="line"><span>  - copy-mode 是 tmux 学习曲线的核心,扛过去就值</span></span>
<span class="line"><span>  - 一天用熟,一周内化</span></span>
<span class="line"><span>  - 不学的代价:每次想看上一屏都得 detach + scrollback,反人类</span></span></code></pre></div><h3 id="_11-4-一个-session-塞所有事" tabindex="-1">11.4 一个 session 塞所有事 <a class="header-anchor" href="#_11-4-一个-session-塞所有事" aria-label="Permalink to &quot;11.4 一个 session 塞所有事&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错的:</span></span>
<span class="line"><span>  打开 tmux 之后再也不开新 session</span></span>
<span class="line"><span>  所有 window 全在 &quot;0&quot; 这个默认 session 里</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>错在哪:</span></span>
<span class="line"><span>  - session 是&quot;件事的容器&quot;,一个 session 塞 5 件事 = 5 件事互相干扰</span></span>
<span class="line"><span>  - 一件事的 vim 崩了,所有 session 里其它的 window 跟着重排</span></span>
<span class="line"><span>  - 想关一件事,只能 kill window 一个个杀</span></span>
<span class="line"><span>  - prefix + s 切 session 体验完全用不上</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>正确认知:</span></span>
<span class="line"><span>  - 一件事一个 session,session 是&quot;工作流颗粒度&quot;</span></span>
<span class="line"><span>  - prefix + s / tmux ls / tmux attach -t X 之间的切换才是 tmux 的常态</span></span></code></pre></div><h3 id="_11-5-抄一长串-tmux-conf-不知道一半干嘛" tabindex="-1">11.5 抄一长串 .tmux.conf 不知道一半干嘛 <a class="header-anchor" href="#_11-5-抄一长串-tmux-conf-不知道一半干嘛" aria-label="Permalink to &quot;11.5 抄一长串 .tmux.conf 不知道一半干嘛&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错的:</span></span>
<span class="line"><span>  GitHub 搜 &quot;tmux config&quot;,找 star 多的,直接 cp 到自己的 ~/.tmux.conf</span></span>
<span class="line"><span>  200 行配置,自己看不懂一半</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>错在哪:</span></span>
<span class="line"><span>  - 别人的配置匹配别人的工作流,不匹配你</span></span>
<span class="line"><span>  - 你不知道哪一行干啥,出问题改不动</span></span>
<span class="line"><span>  - 200 行里 80% 你这辈子不会用(tmux-yank-buffer / tmux-fingers / ...)</span></span>
<span class="line"><span>  - 启动慢、维护痛、上手累</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>正确认知:</span></span>
<span class="line"><span>  - 17 篇会给一份 40-60 行的生产级配置,每行说清楚作用</span></span>
<span class="line"><span>  - 抄要抄到&quot;我能解释每一行&quot;,抄不动的删</span></span>
<span class="line"><span>  - 工作 1 个月以上之后再看要不要加复杂配置</span></span></code></pre></div><hr><h2 id="十二、看完这一篇你应该能" tabindex="-1">十二、看完这一篇你应该能 <a class="header-anchor" href="#十二、看完这一篇你应该能" aria-label="Permalink to &quot;十二、看完这一篇你应该能&quot;">​</a></h2><ul><li><strong>在白板上画出 tmux 的 server / client 架构图</strong>,讲清楚为什么 ssh 断了 server 不死</li><li><strong>区分 session / window / pane 三层抽象</strong>,讲清楚什么时候新建 session、什么时候新建 window、什么时候新建 pane</li><li><strong>解释 prefix key 的设计动机</strong>——为什么必须双键,为什么大家都改 Ctrl-A</li><li><strong>讲出 copy-mode 是什么、为什么必须学 hjkl + v + y</strong>,以及不学的代价是&quot;鼠标滚屏在 mouse on 下也不能复制到系统剪贴板&quot;</li><li><strong>用一句话说清楚 detach / attach 的工程意义</strong>:工作流和客户端解耦,断网 / 关窗 / 合盖不影响远端长任务</li><li><strong>判断 tmux vs screen vs Zellij 该选哪个</strong>——默认 tmux,应急 screen,潜力 Zellij(18 篇细讲)</li><li><strong>避开 5 个常见错误</strong>:把 tmux 当窗口管理 / 鼠标 + iTerm 多 tab 替代 / 不学 copy-mode 只用鼠标 / 一个 session 塞所有事 / 抄一长串 .tmux.conf</li></ul><p>如果上面这 7 条你都能做到,<strong>这一篇的心智图就建立了</strong>。</p><hr><h2 id="十三、下一篇预告" tabindex="-1">十三、下一篇预告 <a class="header-anchor" href="#十三、下一篇预告" aria-label="Permalink to &quot;十三、下一篇预告&quot;">​</a></h2><p>这一篇讲了 <strong>tmux 是什么(心智)</strong>——server / client 架构 / 三层抽象 / prefix / copy-mode。<strong>心智建好了,下一篇 17 讲&quot;工程化配置&quot;</strong>——把心智落到 <code>.tmux.conf</code> 文件里:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>17 篇:tmux 工作流配置</span></span>
<span class="line"><span>  - 一份 50 行的生产级 .tmux.conf,每行说清作用</span></span>
<span class="line"><span>  - prefix 改 Ctrl-A,base-index 改 1,history 改 100000</span></span>
<span class="line"><span>  - copy-mode 改 vi 模式 + 通系统剪贴板</span></span>
<span class="line"><span>  - 分屏 | / -,pane 跳 hjkl,继承 cwd</span></span>
<span class="line"><span>  - TPM 插件管理 + tmux-resurrect / tmux-continuum 持久化</span></span>
<span class="line"><span>  - 状态栏定制(极简风 / 加 cpu mem)</span></span>
<span class="line"><span>  - tmuxinator / tmuxp / smug 一键起 session</span></span>
<span class="line"><span>  - fzf + tmux 联动</span></span>
<span class="line"><span>  - 远端 + 本地嵌套工作流</span></span></code></pre></div><p>读完 17 篇,你能在一台干净的新机器上 <strong>30 分钟内</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>□ tmux 装好,prefix 改 Ctrl-A</span></span>
<span class="line"><span>□ .tmux.conf 50 行到位</span></span>
<span class="line"><span>□ TPM 装上,关键插件就绪</span></span>
<span class="line"><span>□ copy-mode 通系统剪贴板</span></span>
<span class="line"><span>□ tmux-resurrect 自动保存 / 恢复</span></span>
<span class="line"><span>□ tmuxinator 一行命令起 work session(3 窗格,自动 cd)</span></span></code></pre></div><p>这两篇是这套系列的<strong>生产力护城河</strong>——内化之后,你的&quot;工作流&quot;才真正脱离 IDE 和客户端,变成一套<strong>跨机器、跨时间、跨网络</strong>的工程能力。<strong>从下一篇开始动手</strong>。</p><hr><p><strong>附录:这一篇命令速查</strong></p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Session</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">tmux</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> new</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -s</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> work</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                  # 新建 session</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">tmux</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ls</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                           # 列所有 session</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">tmux</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> attach</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -t</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> work</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">               # attach</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">tmux</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> kill-session</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -t</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> work</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">         # 杀 session</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">tmux</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> kill-server</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                  # 全杀(慎用)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">prefix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> +</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> d</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                        # detach</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">prefix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> +</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> s</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                        # 选 session</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">prefix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> +</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> $                        </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 改 session 名</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">prefix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> +</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (  </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">/</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  )                  </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 上/下 session</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Window</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">prefix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> +</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> c</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                        # 新建 window</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">prefix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> +</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> n</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> p</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                    # 下/上 window</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">prefix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> +</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 1</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ...</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 9</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                  # 跳到第 N</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">prefix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> +</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ,</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                        # 改 window 名</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">prefix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> +</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> &amp;                        </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 杀 window</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">prefix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> +</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> w</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                        # 选 window</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Pane</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">prefix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> +</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> |</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                        # 垂直分(自定义)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">prefix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> +</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> -</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                        # 水平分(自定义)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">prefix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> +</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> h/j/k/l</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                  # 跳 pane(自定义)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">prefix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> +</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> z</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                        # zoom</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">prefix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> +</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> x</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                        # 杀 pane</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">prefix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> +</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> q</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                        # 显示编号</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">prefix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> +</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> Space</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                    # 切 layout</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># copy-mode</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">prefix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> +</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> [                        </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 进入</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">prefix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> +</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ]</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                        # 粘贴</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">hjkl</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 方向键</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                     # 移动</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">/</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  +</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> word</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                         # 向下搜</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">v</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                                 # 选(vi)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">y</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                                 # 复制(到 tmux buffer)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">q</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  /</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> esc</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                          # 退出</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 调试 / 一些有用的</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">tmux</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> list-keys</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                    # 看所有 keybinding</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">prefix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> +</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ?</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                        # 看所有 keybinding (交互)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">tmux</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> source</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ~/.tmux.conf</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">          # 重新加载配置</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">prefix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> +</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> :</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                        # 进命令模式</span></span></code></pre></div>`,205)])])}const g=a(e,[["render",l]]);export{d as __pageData,g as default};
