import{c as n,Q as a,j as p,m as i}from"./chunks/framework.CBiVa4O3.js";const k=JSON.parse('{"title":"Devcontainer 与 Remote dev:把\\"代码 / 运行时 / 文件系统 / IDE UI\\"四件事拆开来选","description":"","frontmatter":{},"headers":[],"relativePath":"../terminalLearning/26-Devcontainer与Remote-dev.md","filePath":"../terminalLearning/26-Devcontainer与Remote-dev.md","lastUpdated":1778574438000}'),e={name:"../terminalLearning/26-Devcontainer与Remote-dev.md"};function l(t,s,o,h,c,r){return a(),p("div",null,[...s[0]||(s[0]=[i(`<h1 id="devcontainer-与-remote-dev-把-代码-运行时-文件系统-ide-ui-四件事拆开来选" tabindex="-1">Devcontainer 与 Remote dev:把&quot;代码 / 运行时 / 文件系统 / IDE UI&quot;四件事拆开来选 <a class="header-anchor" href="#devcontainer-与-remote-dev-把-代码-运行时-文件系统-ide-ui-四件事拆开来选" aria-label="Permalink to &quot;Devcontainer 与 Remote dev:把&quot;代码 / 运行时 / 文件系统 / IDE UI&quot;四件事拆开来选&quot;">​</a></h1><p>工程师对「远程开发」最大的误解,是把它当成「<strong>是用云,还是用本地</strong>」这种二选一——以为「我有 MacBook M4 / 32G / 1TB,本地够用,远端开发是没钱买电脑的人才用的**」。<strong>这种想法在 2026 之前可能还成立,2026 之后已经过时</strong>。真相是:<strong>一线工程师每天的工作,早就横跨「本地、容器、远端 dev box、Codespaces、Claude Code 远端 sandbox」五种环境</strong>,问题从来不是「云 vs 本地」,而是「<strong>这次任务,我把代码、运行时、文件系统、IDE UI 这四件事分别放在哪</strong>」——这四个东西在哪儿,就是这次开发的&quot;形状&quot;。<strong>把这四件事拆开来选</strong>,你就不会再纠结「Devcontainer 好还是 Codespaces 好」这种伪问题,因为你知道它们的差别<strong>只在这四个变量的部署位置上</strong>。</p><blockquote><p>一句话先记住:<strong>远端开发不是&quot;我用云还是用本地&quot;,是&quot;代码、运行时、文件系统、IDE UI&quot;四件事的部署位置——选哪种远端,看你最关心这四件事的哪一项</strong>。SSH+tmux 把四件事全部留在远端,你只是个键盘;VS Code Remote SSH 把 UI 切回本地,其他三件留远端;Devcontainer 把运行时塞进容器,代码 / 文件系统 / UI 看你怎么 mount;Codespaces 全部上云,本地只剩浏览器或 thin client。<strong>这四件事的部署组合,决定了你的开发体验、性能、网络依赖、成本结构</strong>——这才是真问题。</p></blockquote><p>这一篇拆开来讲:<strong>本地开发的极限在哪 / 「四件事」框架 / 四种 remote dev 模式逐个走 / 文件系统差异表 / dotfiles 与 remote dev 联动 / 四个真实工作流 case / performance 考虑 / secret 处理 / Claude Code 在 remote dev 的位置 / 反对的写法</strong>。看完你能在 5 分钟内判断:今天这个任务该走哪条路,而不是默认所有事都开 VS Code。</p><hr><h2 id="一、为什么-2026-之后本地开发不够了" tabindex="-1">一、为什么 2026 之后本地开发不够了 <a class="header-anchor" href="#一、为什么-2026-之后本地开发不够了" aria-label="Permalink to &quot;一、为什么 2026 之后本地开发不够了&quot;">​</a></h2><h3 id="_1-1-本地开发的四种典型痛点" tabindex="-1">1.1 本地开发的四种典型痛点 <a class="header-anchor" href="#_1-1-本地开发的四种典型痛点" aria-label="Permalink to &quot;1.1 本地开发的四种典型痛点&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>痛点 1:跨语言 / 跨 OS 环境装麻烦</span></span>
<span class="line"><span>   ─ 项目 A:Node 20 + Python 3.11 + Postgres 16</span></span>
<span class="line"><span>   ─ 项目 B:Node 18 + Python 3.10 + Postgres 14</span></span>
<span class="line"><span>   ─ 项目 C:Go 1.22 + Redis 7</span></span>
<span class="line"><span>   ─ 同一台 mac 要装这三个组合,nvm / pyenv / brew formula 各种串戏</span></span>
<span class="line"><span>   ─ 24 篇讲的 mise 能解决语言版本,但解决不了「Postgres 16 和 14 都装」</span></span>
<span class="line"><span>   ─ 解决不了「macOS 没原生支持的 Linux 工具」</span></span>
<span class="line"><span>   ─ 现实:周一为 A 改环境,周二切去 B 项目,环境全错,再花 2 小时切回</span></span>
<span class="line"><span></span></span>
<span class="line"><span>痛点 2:笔记本算力跟不上</span></span>
<span class="line"><span>   ─ MacBook M4 32G 算&quot;高配&quot;,但你的同事的公司 dev box 是:</span></span>
<span class="line"><span>     ─ 256 GB RAM</span></span>
<span class="line"><span>     ─ 64 cores</span></span>
<span class="line"><span>     ─ 8 TB NVMe</span></span>
<span class="line"><span>     ─ 400 Gbps 内网</span></span>
<span class="line"><span>   ─ 编译一个 monorepo:笔记本 8 分钟,dev box 90 秒</span></span>
<span class="line"><span>   ─ 跑一次全量集成测试:笔记本 12 分钟,dev box 2 分钟</span></span>
<span class="line"><span>   ─ 一天编译 / 跑测试 10 次,笔记本累计浪费 1 小时,远端只浪费 8 分钟</span></span>
<span class="line"><span>   ─ 如果你每天 SSH 进 dev box 写代码,你比本地党快 1 小时</span></span>
<span class="line"><span></span></span>
<span class="line"><span>痛点 3:新员工 onboarding 一周配环境</span></span>
<span class="line"><span>   ─ &quot;请按 README 装环境&quot;:Xcode CLI / brew / mise / pgsql / redis / 1Password CLI / kubectl / kubeconfig / VPN / ...</span></span>
<span class="line"><span>   ─ 一周下来,新人还在装环境,没产出 1 行代码</span></span>
<span class="line"><span>   ─ &quot;我能不能直接用一个能跑的环境?&quot;——本地 setup 的根本性瓶颈</span></span>
<span class="line"><span>   ─ 这是 Devcontainer / Codespaces 主张要解决的核心问题</span></span>
<span class="line"><span></span></span>
<span class="line"><span>痛点 4:数据 / secret 不能落本地</span></span>
<span class="line"><span>   ─ 公司合规要求:客户数据不能下载到笔记本</span></span>
<span class="line"><span>   ─ 项目密钥不能存本地磁盘</span></span>
<span class="line"><span>   ─ 但你又要在 dev 环境跑接近真实的数据</span></span>
<span class="line"><span>   ─ 解法:dev 环境跑在公司 dev box / 公司云 / Codespaces,</span></span>
<span class="line"><span>          代码 / 数据都在公司网络内,本地只有 IDE UI</span></span></code></pre></div><p><strong>这四个痛点共同结论</strong>:<strong>「我用本地」的工作流,在 2026 已经只是一种选择,不再是默认选择</strong>——很多场景下,你<strong>应该</strong>把工作流的某一部分(或全部)放到远端去。问题只是放哪、怎么放。</p><h3 id="_1-2-一个反直觉-你早就在用-remote-dev-只是没意识到" tabindex="-1">1.2 一个反直觉:你早就在用 remote dev,只是没意识到 <a class="header-anchor" href="#_1-2-一个反直觉-你早就在用-remote-dev-只是没意识到" aria-label="Permalink to &quot;1.2 一个反直觉:你早就在用 remote dev,只是没意识到&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>你今天的工作流里,这些都属于 remote dev:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   ─ ssh 进堡垒机看日志           → SSH + tmux 模式</span></span>
<span class="line"><span>   ─ Cursor Remote SSH 连公司 dev → VS Code Remote SSH 模式</span></span>
<span class="line"><span>   ─ Codespaces 试用一下         → Codespaces 模式</span></span>
<span class="line"><span>   ─ docker-compose up + 本地 IDE → 半个 Devcontainer</span></span>
<span class="line"><span>   ─ Claude Code 远端 sandbox    → 极简 remote dev</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   你已经在用,只是没系统化思考&quot;我为什么这么用&quot;</span></span></code></pre></div><p><strong>这一篇就是把这些&quot;日常都在用、但从没系统化&quot;的姿势,理一遍——你才能开始优化它</strong>。</p><hr><h2 id="二、「四件事」框架-remote-dev-的根本变量" tabindex="-1">二、「四件事」框架:remote dev 的根本变量 <a class="header-anchor" href="#二、「四件事」框架-remote-dev-的根本变量" aria-label="Permalink to &quot;二、「四件事」框架:remote dev 的根本变量&quot;">​</a></h2><p>不去比较具体工具,先建一个心智框架——<strong>任何一种&quot;开发环境&quot;都可以被拆成四个独立变量</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌────────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  开发环境的四件事(部署位置可独立选)                              │</span></span>
<span class="line"><span>├────────────────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>│                                                                │</span></span>
<span class="line"><span>│  1. 代码(source files)                                       │</span></span>
<span class="line"><span>│     - 你正在编辑的 .py / .ts / .rs                             │</span></span>
<span class="line"><span>│     - 通常在 git working tree 里                              │</span></span>
<span class="line"><span>│                                                                │</span></span>
<span class="line"><span>│  2. 运行时(runtime)                                          │</span></span>
<span class="line"><span>│     - Node / Python / Postgres / Redis 这些进程               │</span></span>
<span class="line"><span>│     - 包括 linter / formatter / LSP server                    │</span></span>
<span class="line"><span>│                                                                │</span></span>
<span class="line"><span>│  3. 文件系统(filesystem)                                     │</span></span>
<span class="line"><span>│     - node_modules / .venv / target / build 这些产物           │</span></span>
<span class="line"><span>│     - 占磁盘 / IO 频繁                                         │</span></span>
<span class="line"><span>│                                                                │</span></span>
<span class="line"><span>│  4. IDE UI(界面 + 输入)                                      │</span></span>
<span class="line"><span>│     - 你看到的窗口 + 键盘 mapping                              │</span></span>
<span class="line"><span>│     - LSP 渲染 / debug UI / git GUI                           │</span></span>
<span class="line"><span>│                                                                │</span></span>
<span class="line"><span>└────────────────────────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>这四件事可以独立部署</strong>——这就是为什么 remote dev 有那么多变种。把它画成一张组合表:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌─────────────────┬────────┬──────────┬───────────┬───────────┐</span></span>
<span class="line"><span>│ 模式             │ 代码    │ 运行时    │ 文件系统    │ IDE UI    │</span></span>
<span class="line"><span>├─────────────────┼────────┼──────────┼───────────┼───────────┤</span></span>
<span class="line"><span>│ 纯本地           │ 本地    │ 本地     │ 本地       │ 本地       │</span></span>
<span class="line"><span>│ SSH + tmux       │ 远端    │ 远端     │ 远端       │ 远端(终端) │</span></span>
<span class="line"><span>│ VS Code Remote   │ 远端    │ 远端     │ 远端       │ 本地       │</span></span>
<span class="line"><span>│ Devcontainer 本地│ 本地    │ 容器     │ 本地 mount │ 本地       │</span></span>
<span class="line"><span>│ Devcontainer 远端│ 远端    │ 容器     │ 远端       │ 本地       │</span></span>
<span class="line"><span>│ Codespaces       │ 云      │ 云       │ 云         │ 本地 / 云  │</span></span>
<span class="line"><span>└─────────────────┴────────┴──────────┴───────────┴───────────┘</span></span></code></pre></div><p><strong>看着这张表你就懂了</strong>:</p><ul><li>VS Code Remote SSH 和 Codespaces 的差别,本质上只在「代码 / 运行时 / 文件系统」是在「你公司的 server」还是「GitHub 的云」——其他完全一样</li><li>本地 Devcontainer 和远端 Devcontainer 的差别,只在文件系统 mount 不同</li><li>SSH + tmux 和 VS Code Remote SSH 的差别,只在 IDE UI 在哪边渲染</li></ul><p><strong>选 remote dev 模式的本质,就是在这张表里挑一行</strong>。挑哪一行,看你最在乎四件事里的哪一个。</p><hr><h2 id="三、四种-remote-dev-模式逐个走" tabindex="-1">三、四种 Remote dev 模式逐个走 <a class="header-anchor" href="#三、四种-remote-dev-模式逐个走" aria-label="Permalink to &quot;三、四种 Remote dev 模式逐个走&quot;">​</a></h2><h3 id="_3-1-模式-1-ssh-tmux-neovim-经典" tabindex="-1">3.1 模式 1:SSH + tmux + Neovim(经典) <a class="header-anchor" href="#_3-1-模式-1-ssh-tmux-neovim-经典" aria-label="Permalink to &quot;3.1 模式 1:SSH + tmux + Neovim(经典)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌─────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  你的 Mac                                        │</span></span>
<span class="line"><span>│    ┌────────────────┐                           │</span></span>
<span class="line"><span>│    │  Terminal      │ ← 你看到的全部              │</span></span>
<span class="line"><span>│    │  (本地)        │                           │</span></span>
<span class="line"><span>│    └────────┬───────┘                           │</span></span>
<span class="line"><span>│             │ ssh                                │</span></span>
<span class="line"><span>└─────────────┼───────────────────────────────────┘</span></span>
<span class="line"><span>              │</span></span>
<span class="line"><span>              ▼</span></span>
<span class="line"><span>   ┌──────────────────────────────┐</span></span>
<span class="line"><span>   │  远端 Linux server            │</span></span>
<span class="line"><span>   │   ┌──────────────────────┐    │</span></span>
<span class="line"><span>   │   │  tmux session       │    │</span></span>
<span class="line"><span>   │   │   ┌──────────────┐  │    │</span></span>
<span class="line"><span>   │   │   │ Neovim       │  │    │</span></span>
<span class="line"><span>   │   │   │ ssh shell    │  │    │</span></span>
<span class="line"><span>   │   │   │ Claude Code  │  │    │</span></span>
<span class="line"><span>   │   │   └──────────────┘  │    │</span></span>
<span class="line"><span>   │   └──────────────────────┘    │</span></span>
<span class="line"><span>   │  (代码 + 运行时 + 文件系统 +  │</span></span>
<span class="line"><span>   │   IDE UI 全在这台机器上)      │</span></span>
<span class="line"><span>   └──────────────────────────────┘</span></span></code></pre></div><p><strong>特点</strong>:<strong>本地只是个键盘和屏幕</strong>——所有东西都在远端,本地只跑一个 SSH client。</p><p><strong>优点</strong>:</p><ul><li><strong>零依赖</strong>:任何远端 Linux 都能用,装个 ssh 就行,不需要 vscode-server</li><li><strong>网络延迟最低</strong>:只传字符,几百 bytes,200ms 延迟都能用</li><li><strong>关 IDE 不影响</strong>:tmux 持续运行,你电脑炸了远端任务还在跑</li><li><strong>远端配置完全在远端</strong>:不用同步,远端就是本体</li></ul><p><strong>缺点</strong>:</p><ul><li><strong>没有 IDE UX</strong>:Neovim 的 LSP 跟 VS Code 比有差距(20-21 篇细讲),跳定义 / refactor / debug 都更费手</li><li><strong>要求你会 tmux + Neovim / Helix</strong>:GUI 党直接拒接</li></ul><p><strong>真实场景</strong>:</p><ul><li>半夜服务器告警,SSH 进生产机查 / 改 / 重启</li><li>在公司 dev box 上跑长时间训练,自己关电脑下班</li><li>极简环境(distroless / Alpine / 没装 vscode-server 的 pod)</li><li>Claude Code 长任务挂在远端 tmux pane</li></ul><p><strong>这个模式是本系列前 25 篇默认的 mental model</strong>——01-21 篇你学的所有东西(zsh / fzf / tmux / Neovim / Helix / ssh)在这条路上最直接发挥。</p><h3 id="_3-2-模式-2-vs-code-remote-ssh-也含-cursor" tabindex="-1">3.2 模式 2:VS Code Remote SSH(也含 Cursor) <a class="header-anchor" href="#_3-2-模式-2-vs-code-remote-ssh-也含-cursor" aria-label="Permalink to &quot;3.2 模式 2:VS Code Remote SSH(也含 Cursor)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌──────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  你的 Mac                                                     │</span></span>
<span class="line"><span>│    ┌─────────────────┐                                       │</span></span>
<span class="line"><span>│    │  VS Code / Cursor│ ← UI 全在本地                         │</span></span>
<span class="line"><span>│    │  本地 UI 渲染    │                                       │</span></span>
<span class="line"><span>│    └────────┬────────┘                                       │</span></span>
<span class="line"><span>│             │ ssh(Remote SSH 扩展自动配的)                  │</span></span>
<span class="line"><span>└─────────────┼────────────────────────────────────────────────┘</span></span>
<span class="line"><span>              │</span></span>
<span class="line"><span>              ▼</span></span>
<span class="line"><span>   ┌──────────────────────────────────┐</span></span>
<span class="line"><span>   │  远端 Linux server                │</span></span>
<span class="line"><span>   │    ┌─────────────────────────┐    │</span></span>
<span class="line"><span>   │    │  vscode-server           │    │</span></span>
<span class="line"><span>   │    │  (Node 进程,本地启动时    │    │</span></span>
<span class="line"><span>   │    │   自动 scp 上去)         │    │</span></span>
<span class="line"><span>   │    └─────────────────────────┘    │</span></span>
<span class="line"><span>   │       │                          │</span></span>
<span class="line"><span>   │       │ 跑你的代码 + LSP + debug   │</span></span>
<span class="line"><span>   │       ▼                          │</span></span>
<span class="line"><span>   │    ┌─────────────────────────┐    │</span></span>
<span class="line"><span>   │    │  你的项目目录             │    │</span></span>
<span class="line"><span>   │    │  ~/projects/xxx          │    │</span></span>
<span class="line"><span>   │    └─────────────────────────┘    │</span></span>
<span class="line"><span>   └──────────────────────────────────┘</span></span></code></pre></div><p><strong>特点</strong>:<strong>UI 在本地,其他全在远端</strong>——VS Code 本体跑在你 mac 上,但通过一条 SSH 连接,把&quot;打开文件 / 改文件 / 跑 terminal / 装扩展 / debug&quot; 全部委托给远端的 <code>vscode-server</code>(一个 Node 进程,VS Code 自动 scp 到远端机器上跑)。</p><p><strong>配置只需要两步</strong>:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 1. 装扩展(VS Code Marketplace)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">&quot;Remote - SSH&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (ms-vscode-remote.remote-ssh)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 2. 配 ~/.ssh/config(15 篇讲过的)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">cat</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> &gt;&gt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ~/.ssh/config</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> &lt;&lt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">EOF</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">Host devbox</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  HostName 10.0.1.100</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  User ubuntu</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  IdentityFile ~/.ssh/id_ed25519</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  ForwardAgent yes</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">EOF</span></span></code></pre></div><p>打开 VS Code → Command Palette → <code>Remote-SSH: Connect to Host</code> → 选 <code>devbox</code> → 新窗口连上去 → 远端 host 在状态栏左下角显示。</p><p><strong>优点</strong>:</p><ul><li><strong>UI 体验 = 本地</strong>:键盘 mapping、主题、字体、所有 VS Code 体验都本地,只是文件树和 terminal 是远端的</li><li><strong>LSP / debug / refactor 全自动远端</strong>:你点跳定义,vscode-server 在远端跑 LSP,把结果传回本地渲染</li><li><strong>扩展可选「本地」或「远端」</strong>:Prettier 在远端跑(跑你远端的代码),Vim 模拟器在本地跑(只管 UI)</li><li><strong>支持 Cursor</strong>:Cursor 是 VS Code fork,Remote SSH 扩展完全继承,Cursor 自己的 AI 功能也能远端用</li></ul><p><strong>缺点</strong>:</p><ul><li><strong>VS Code 锁定</strong>:这是 VS Code Remote 协议,不是开放标准,JetBrains 有自己的(Gateway,做得没这个好),Vim 用不了</li><li><strong>关网就断</strong>:UI 在本地、状态在远端的连接,断网就要重连,有时候 vscode-server 会卡在「starting」</li><li><strong>vscode-server 吃远端内存</strong>:Node 进程跑 LSP,500MB-2GB,远端 server 内存小的话扛不住</li><li><strong>vscode-server 启动慢</strong>:第一次连一台新机器,要 scp + 安装,可能要 30-90 秒</li></ul><p><strong>Cursor 版本说明</strong>:Cursor 用同一套机制,但有自己的 cursor-server。装扩展时认准 <code>Remote - SSH</code>(同一个),Cursor 自动加载。</p><p><strong>真实场景</strong>:</p><ul><li>公司有 Linux dev box(高配),日常开发主战场</li><li>自己的代码 monorepo 太大,本地 build 慢,远端有 SSD + 64 核</li><li>远端 GPU(训模型),本地 IDE 改代码,远端跑 train</li></ul><h3 id="_3-3-模式-3-devcontainer-本地-docker-或远端" tabindex="-1">3.3 模式 3:Devcontainer(本地 Docker 或远端) <a class="header-anchor" href="#_3-3-模式-3-devcontainer-本地-docker-或远端" aria-label="Permalink to &quot;3.3 模式 3:Devcontainer(本地 Docker 或远端)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌──────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  你的 Mac                                                     │</span></span>
<span class="line"><span>│    ┌──────────────────┐                                      │</span></span>
<span class="line"><span>│    │  VS Code / Cursor │ ← UI 在本地                          │</span></span>
<span class="line"><span>│    └────────┬─────────┘                                      │</span></span>
<span class="line"><span>│             │                                                 │</span></span>
<span class="line"><span>│             ▼                                                 │</span></span>
<span class="line"><span>│    ┌──────────────────────────────┐                          │</span></span>
<span class="line"><span>│    │  Docker Desktop / Colima       │                          │</span></span>
<span class="line"><span>│    │    ┌───────────────────────┐   │                          │</span></span>
<span class="line"><span>│    │    │  devcontainer         │   │                          │</span></span>
<span class="line"><span>│    │    │   ┌─────────────────┐ │   │                          │</span></span>
<span class="line"><span>│    │    │   │ Python 3.12     │ │   │                          │</span></span>
<span class="line"><span>│    │    │   │ Node 20         │ │   │                          │</span></span>
<span class="line"><span>│    │    │   │ Postgres 16     │ │   │                          │</span></span>
<span class="line"><span>│    │    │   │ ─────────────── │ │   │                          │</span></span>
<span class="line"><span>│    │    │   │ /workspace ←── mount(host: ~/code/myapp)         │</span></span>
<span class="line"><span>│    │    │   │ /home/vscode    │ │   │                          │</span></span>
<span class="line"><span>│    │    │   └─────────────────┘ │   │                          │</span></span>
<span class="line"><span>│    │    └───────────────────────┘   │                          │</span></span>
<span class="line"><span>│    └──────────────────────────────┘                          │</span></span>
<span class="line"><span>└──────────────────────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>特点</strong>:<strong>运行时塞进 Docker 容器</strong>——代码可以本地(mount)或远端,文件系统通过 mount 映射,IDE UI 本地。容器内是干净的 Linux,装着这个项目所有需要的东西。</p><p><strong>核心文件:<code>.devcontainer/devcontainer.json</code></strong></p><p>一份真能跑的最小例子:</p><div class="language-jsonc vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">jsonc</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">{</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  &quot;name&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;Python Dev&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  // 用现成的 image,不写 Dockerfile</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  &quot;image&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;mcr.microsoft.com/devcontainers/python:3.12&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  // features 是 devcontainer 规范的&quot;插件&quot;:往 image 里加东西</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  &quot;features&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: {</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    &quot;ghcr.io/devcontainers/features/git:1&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: {},</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    &quot;ghcr.io/devcontainers/features/node:1&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: { </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">&quot;version&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;20&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> },</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    &quot;ghcr.io/devcontainers/features/docker-in-docker:2&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: {}</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  },</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  // 容器跑起来后自动装项目依赖</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  &quot;postCreateCommand&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;pip install -r requirements.txt &amp;&amp; pre-commit install&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  // VS Code 这个项目需要的扩展(进容器自动装)</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  &quot;customizations&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: {</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    &quot;vscode&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: {</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">      &quot;extensions&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">        &quot;ms-python.python&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">        &quot;charliermarsh.ruff&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">        &quot;tamasfe.even-better-toml&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      ],</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">      &quot;settings&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: {</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        &quot;editor.formatOnSave&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">true</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        &quot;[python]&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: {</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">          &quot;editor.defaultFormatter&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;charliermarsh.ruff&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        }</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      }</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    }</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  },</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  // 容器里跑的服务,自动把这些端口映射回本地</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  &quot;forwardPorts&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">8000</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">5432</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">],</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  // 远端用户名(避免容器内 root 写出来的文件本地 root 才能改)</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  &quot;remoteUser&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;vscode&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span></code></pre></div><p><strong>这个文件 commit 进 git 仓库</strong>——新人 <code>git clone</code> 之后,VS Code 弹窗:「Reopen in Container」,点一下,<strong>5 分钟后他的开发环境跟你完全一样</strong>。</p><p><strong>CLI 也能用</strong>(不一定要 VS Code):</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 装(Node 包)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">npm</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> install</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -g</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> @devcontainers/cli</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 在项目根目录跑</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">cd</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> myapp/</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">devcontainer</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> up</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --workspace-folder</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> .</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">         # 启动容器</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">devcontainer</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> exec</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --workspace-folder</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> .</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> bash</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  # 进容器</span></span></code></pre></div><p><strong>这套 CLI 是微软出的,跟 VS Code 用同一个 devcontainer.json 文件</strong>——意思是 Vim 用户也能用 Devcontainer,只是没自动 IDE 集成。</p><p><strong>优点</strong>:</p><ul><li><strong>项目 commit 进 git</strong>:<code>.devcontainer/</code> 跟代码同步,新人无配置</li><li><strong>环境跟生产一致</strong>:容器是 Linux,你 Mac 上跑出来的 build 行为跟 prod 一致(prod 也是 Linux)</li><li><strong>多项目隔离</strong>:项目 A 的容器跟项目 B 的容器完全独立,版本撞不到一起</li><li><strong>dotfiles 自动注入</strong>:devcontainer.json 可以指定你的 dotfiles repo,容器跑起来自动 clone + install</li><li><strong>跨平台</strong>:Mac / Windows / Linux 上的 Docker Desktop 行为一致(在 dev 环境里)</li></ul><p><strong>缺点</strong>:</p><ul><li><strong>Docker 加层</strong>:macOS 上 Docker Desktop 本身要 8GB+ 内存,Apple Silicon 上虽然原生但仍然有开销</li><li><strong>文件系统 IO 慢</strong>(macOS):mount 是 VirtioFS / gRPC FUSE,跨虚拟机边界读小文件比本地慢 3-10 倍(node_modules / .venv 撞到这一项,慢得明显)</li><li><strong>学习曲线</strong>:写 devcontainer.json 跟写 Dockerfile 不一样,有自己的规范</li><li><strong>不是所有工具都能容器化</strong>:GUI 工具、依赖 macOS Keychain 的工具进不去容器</li></ul><p><strong>性能优化(macOS)</strong>:</p><div class="language-jsonc vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">jsonc</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">// devcontainer.json 里</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">{</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  // 让 node_modules / .venv 这些&quot;产物&quot;不 mount,只在容器内</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  // 避免 IO 慢</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  &quot;mounts&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    &quot;source=myapp-node-modules,target=/workspace/node_modules,type=volume&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    &quot;source=myapp-venv,target=/workspace/.venv,type=volume&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  ]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span></code></pre></div><p>把高频 IO 的目录用 named volume 而不是 bind mount,<strong>编译 / install 时间能砍 60-80%</strong>。</p><h3 id="_3-4-模式-4-github-codespaces-gitpod-coder" tabindex="-1">3.4 模式 4:GitHub Codespaces / Gitpod / Coder <a class="header-anchor" href="#_3-4-模式-4-github-codespaces-gitpod-coder" aria-label="Permalink to &quot;3.4 模式 4:GitHub Codespaces / Gitpod / Coder&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌──────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  你的 Mac / iPad / Chromebook                                 │</span></span>
<span class="line"><span>│    ┌────────────────┐                                        │</span></span>
<span class="line"><span>│    │  浏览器          │ 或者本地 VS Code 客户端                  │</span></span>
<span class="line"><span>│    │  (Web IDE)      │ (Remote SSH-like, 但远端是 GitHub 云的) │</span></span>
<span class="line"><span>│    └────────┬───────┘                                        │</span></span>
<span class="line"><span>└─────────────┼────────────────────────────────────────────────┘</span></span>
<span class="line"><span>              │ HTTPS</span></span>
<span class="line"><span>              ▼</span></span>
<span class="line"><span>   ┌──────────────────────────────────┐</span></span>
<span class="line"><span>   │  GitHub Codespaces 云              │</span></span>
<span class="line"><span>   │    ┌──────────────────────┐       │</span></span>
<span class="line"><span>   │    │  你的代码 + 工具链      │       │</span></span>
<span class="line"><span>   │    │  (从你 repo + 你的     │       │</span></span>
<span class="line"><span>   │    │   devcontainer.json)  │       │</span></span>
<span class="line"><span>   │    │  跑在云上的容器          │       │</span></span>
<span class="line"><span>   │    └──────────────────────┘       │</span></span>
<span class="line"><span>   └──────────────────────────────────┘</span></span></code></pre></div><p><strong>特点</strong>:<strong>全部上云</strong>——本地只剩浏览器(或一个 thin 客户端),代码 / 运行时 / 文件系统 / 大部分 UI 都在云上。<strong>这是远端的极致版</strong>。</p><p><strong>两种主流选择</strong>:</p><table tabindex="0"><thead><tr><th>工具</th><th>谁的</th><th>特点</th><th>价格</th></tr></thead><tbody><tr><td><strong>GitHub Codespaces</strong></td><td>GitHub</td><td>跟 GitHub 一体化,SSO 直接通,认 devcontainer.json</td><td>每月 60-120 核小时免费(Pro);多余 $0.18/核小时</td></tr><tr><td><strong>Gitpod</strong></td><td>Gitpod</td><td>开源,自托管 / SaaS 两种</td><td>SaaS 每月 50 小时免费;Enterprise 自托管按 license</td></tr><tr><td><strong>Coder</strong></td><td>Coder</td><td>企业自建,无 SaaS</td><td>License 按工程师人数</td></tr></tbody></table><p><strong>GitHub Codespaces 启动一个 codespace 长这样</strong>:</p><ol><li>你的 repo 有 <code>.devcontainer/devcontainer.json</code></li><li>在 GitHub 网页或 VS Code 里点「Open in Codespace」</li><li>GitHub 后台:起一台云 VM → pull image → 跑你 devcontainer 配置</li><li>3-5 分钟后,VS Code 浏览器版打开,你在云上的容器里</li><li>关浏览器,容器自动 suspend(不收费 idle 时间)</li><li>30 天没用,自动删除</li></ol><p><strong>优点</strong>:</p><ul><li><strong>零本地依赖</strong>:iPad / Chromebook / 网吧机器都能用</li><li><strong>随时随地</strong>:出差 / 多设备 / 临时帮看一下 PR</li><li><strong>企业 SSO 自动通</strong>:公司 GitHub 账号通,云上 dev box 也通,<strong>离职第一天自动失效</strong></li><li><strong>资源弹性</strong>:云上能选 4 核 / 8 核 / 16 核 / 32 核,贵的项目临时升一档跑大编译</li><li><strong>跨地域</strong>:你飞到北美出差,选个就近 region 的 codespace,延迟比连国内 dev box 低</li></ul><p><strong>缺点</strong>:</p><ul><li><strong>贵</strong>:免费额度够小项目,大项目跑 24/7 一个月几百刀</li><li><strong>网速依赖</strong>:虽然只传 VS Code 协议(几十 KB/s 平时),但低延迟连接才舒服;200ms+ 难受</li><li><strong>代码上云</strong>:<strong>合规敏感的代码不能放 Codespaces</strong>(GitHub-managed),要的话选 Coder 自建</li><li><strong>长期方案得算成本</strong>:VS Code Remote SSH 公司 dev box 一次性投入服务器钱 + 电费,Codespaces 是 SaaS 月付,<strong>用得多比自建贵</strong></li></ul><p><strong>真实场景</strong>:</p><ul><li>数字游民 / 多设备党:Mac + iPad + 公司 Mac 三个设备,Codespaces 是同一个环境</li><li>出差 / 临时调试:酒店 wifi,直接浏览器开 codespace,5 分钟搞定</li><li>开源项目贡献:点「Open in Codespace」,马上就能改、跑测试,不用本地 clone + 装环境</li><li>教学 / 演示:发一个 codespace 链接,对方一键就在环境里</li></ul><h3 id="_3-5-一张图汇总四种模式" tabindex="-1">3.5 一张图汇总四种模式 <a class="header-anchor" href="#_3-5-一张图汇总四种模式" aria-label="Permalink to &quot;3.5 一张图汇总四种模式&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌─────────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│                                                                 │</span></span>
<span class="line"><span>│              代码         运行时        文件系统       IDE UI    │</span></span>
<span class="line"><span>│  ─────────────────────────────────────────────────────────────  │</span></span>
<span class="line"><span>│  SSH+tmux    远端         远端         远端          远端(终端) │</span></span>
<span class="line"><span>│              └─────────────┴────────────┴───────────┘           │</span></span>
<span class="line"><span>│              &quot;本地只是个键盘&quot;                                    │</span></span>
<span class="line"><span>│                                                                 │</span></span>
<span class="line"><span>│  VS Code     远端         远端         远端          本地        │</span></span>
<span class="line"><span>│  Remote SSH  └─────────────┴────────────┘           ┘           │</span></span>
<span class="line"><span>│              &quot;UI 在本地,其他在远端&quot;                             │</span></span>
<span class="line"><span>│                                                                 │</span></span>
<span class="line"><span>│  Devcontainer 本地  ─────  容器  ─── 本地 mount      本地        │</span></span>
<span class="line"><span>│  (local)                                                        │</span></span>
<span class="line"><span>│              &quot;运行时容器化,其他本地&quot;                            │</span></span>
<span class="line"><span>│                                                                 │</span></span>
<span class="line"><span>│  Devcontainer 远端  ───── 远端容器  ──── 远端         本地        │</span></span>
<span class="line"><span>│  (remote)                                                        │</span></span>
<span class="line"><span>│              &quot;运行时容器化 + 整个容器在远端&quot;                     │</span></span>
<span class="line"><span>│                                                                 │</span></span>
<span class="line"><span>│  Codespaces   云    ───── 云  ─── 云  ── 浏览器 / 本地          │</span></span>
<span class="line"><span>│              └─────────────┴────────────┘                       │</span></span>
<span class="line"><span>│              &quot;全部上云&quot;                                          │</span></span>
<span class="line"><span>│                                                                 │</span></span>
<span class="line"><span>└─────────────────────────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>这五行就是 remote dev 的&quot;全景&quot;</strong>——后面所有的选型,都是在这五行里挑一行。</p><hr><h2 id="四、文件系统差异-四种模式在「文件-io」上的真相" tabindex="-1">四、文件系统差异:四种模式在「文件 IO」上的真相 <a class="header-anchor" href="#四、文件系统差异-四种模式在「文件-io」上的真相" aria-label="Permalink to &quot;四、文件系统差异:四种模式在「文件 IO」上的真相&quot;">​</a></h2><p>文件系统是 remote dev 里最容易被忽视、但<strong>直接决定使用体验</strong>的一个维度。把四种模式的「文件 IO 路径」逐个画出来:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌──────────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  SSH(纯)                                                       │</span></span>
<span class="line"><span>│    本地终端  ──(只传字符)──→  远端文件                          │</span></span>
<span class="line"><span>│    特点:文件不动,你只是在远端编辑                                │</span></span>
<span class="line"><span>│    问题:本地编辑器要看远端文件?要 scp 一份回来,编完再传回去   │</span></span>
<span class="line"><span>│    适合:Neovim 直接在远端跑、tmux 包住一切                       │</span></span>
<span class="line"><span>└──────────────────────────────────────────────────────────────────┘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>┌──────────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  VS Code Remote SSH                                              │</span></span>
<span class="line"><span>│    本地 UI  ─(VS Code 协议)─→  远端文件系统                     │</span></span>
<span class="line"><span>│    特点:打开一个文件,VS Code 协议传过来一段 buffer,本地编辑     │</span></span>
<span class="line"><span>│         保存时传回去,LSP 跑在远端,跳定义结果传回                │</span></span>
<span class="line"><span>│    问题:网络抖动会卡(50ms 内顺,200ms+ 难受)                  │</span></span>
<span class="line"><span>│    适合:你想要 VS Code UI + 远端计算                            │</span></span>
<span class="line"><span>└──────────────────────────────────────────────────────────────────┘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>┌──────────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  Devcontainer(本地 Docker,bind mount)                          │</span></span>
<span class="line"><span>│    本地文件  ←(bind mount)→  容器内 /workspace                  │</span></span>
<span class="line"><span>│    特点:文件物理上在 mac 上,容器通过 mount 访问                 │</span></span>
<span class="line"><span>│    问题:macOS 上 IO 慢——mount 跨虚拟机边界                      │</span></span>
<span class="line"><span>│    举例:node_modules 装 5 分钟(本地 90 秒)                    │</span></span>
<span class="line"><span>│    缓解:high-IO 目录用 named volume,不 bind                    │</span></span>
<span class="line"><span>└──────────────────────────────────────────────────────────────────┘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>┌──────────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  Devcontainer(远端 server 上跑)                                │</span></span>
<span class="line"><span>│    远端文件  ←(原生 IO)→  容器                                │</span></span>
<span class="line"><span>│    特点:文件在远端 Linux 原生磁盘,容器在远端跑                  │</span></span>
<span class="line"><span>│    问题:你电脑跟远端的网络延迟(VS Code Remote 协议路径)        │</span></span>
<span class="line"><span>│    优势:文件 IO 跟 Linux 原生一样快                             │</span></span>
<span class="line"><span>└──────────────────────────────────────────────────────────────────┘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>┌──────────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  Codespaces                                                      │</span></span>
<span class="line"><span>│    云端文件  ←(原生 IO)→  云端容器                              │</span></span>
<span class="line"><span>│    UI                ─(浏览器 / VS Code 协议)→  云端           │</span></span>
<span class="line"><span>│    特点:文件在云端 NVMe,容器在云端,IO 原生                    │</span></span>
<span class="line"><span>│    问题:你的网到云端的延迟                                       │</span></span>
<span class="line"><span>└──────────────────────────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>结论</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>要 IO 快:</span></span>
<span class="line"><span>   - 远端 Linux / 云上原生最快</span></span>
<span class="line"><span>   - macOS Devcontainer bind mount 最慢</span></span>
<span class="line"><span>   - 用 named volume 缓解 macOS 慢</span></span>
<span class="line"><span></span></span>
<span class="line"><span>要编辑流畅:</span></span>
<span class="line"><span>   - 终端编辑:延迟 &lt; 200ms 都行</span></span>
<span class="line"><span>   - VS Code Remote 协议:延迟 &lt; 100ms 舒服</span></span>
<span class="line"><span>   - 浏览器 Codespaces:延迟 &lt; 100ms 舒服</span></span>
<span class="line"><span></span></span>
<span class="line"><span>要离线工作:</span></span>
<span class="line"><span>   - SSH+tmux / VS Code Remote / Codespaces 全部要联网</span></span>
<span class="line"><span>   - 本地 Devcontainer 是唯一能离线干活的远端形态</span></span></code></pre></div><p><strong>这是 remote dev 性能模型的最大单一变量</strong>。</p><hr><h2 id="五、dotfiles-与-remote-dev-让你的工作流跟随你过去" tabindex="-1">五、Dotfiles 与 Remote dev:让你的工作流跟随你过去 <a class="header-anchor" href="#五、dotfiles-与-remote-dev-让你的工作流跟随你过去" aria-label="Permalink to &quot;五、Dotfiles 与 Remote dev:让你的工作流跟随你过去&quot;">​</a></h2><p>22 篇讲了 dotfiles 心智。<strong>Remote dev 是 dotfiles 真正发挥威力的地方</strong>——因为每次新开一台远端 / 一个新容器,本质都是「一台新机器」。</p><h3 id="_5-1-vs-code-remote-ssh-的-dotfiles-同步" tabindex="-1">5.1 VS Code Remote SSH 的 dotfiles 同步 <a class="header-anchor" href="#_5-1-vs-code-remote-ssh-的-dotfiles-同步" aria-label="Permalink to &quot;5.1 VS Code Remote SSH 的 dotfiles 同步&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>VS Code Remote SSH 自动同步两件事:</span></span>
<span class="line"><span>   1. settings.json(用户级,你本地的)→ 自动应用到远端 vscode-server</span></span>
<span class="line"><span>   2. 扩展:选「Install in SSH: devbox」,远端装一份</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   不会自动:zsh / tmux / Neovim 配置(那是 shell 层,VS Code 不管)</span></span></code></pre></div><p><strong>手动同步 shell 层的 dotfiles</strong>:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 在远端跑一次</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">cd</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ~</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">git</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> clone</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> https://github.com/youname/dotfiles</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">cd</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> dotfiles</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">./install.sh</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">         # 你的 chezmoi / stow / 裸脚本(22 篇讲过)</span></span></code></pre></div><p>22 篇推荐过 chezmoi 的话,<strong>一行命令</strong>:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sh</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -c</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;$(</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">curl</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -fsLS</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> get.chezmoi.io)&quot;</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> init</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --apply</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> youname</span></span></code></pre></div><h3 id="_5-2-devcontainer-的-dotfiles-注入-规范化的" tabindex="-1">5.2 Devcontainer 的 dotfiles 注入(规范化的) <a class="header-anchor" href="#_5-2-devcontainer-的-dotfiles-注入-规范化的" aria-label="Permalink to &quot;5.2 Devcontainer 的 dotfiles 注入(规范化的)&quot;">​</a></h3><p>Devcontainer 规范支持「自动 clone + install dotfiles」——<strong>这是 Devcontainer 最被低估的功能之一</strong>。</p><p><strong>两种配置方式</strong>:</p><p><strong>方式 A:用户全局设置(VS Code)</strong></p><div class="language-jsonc vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">jsonc</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">// ~/.config/Code/User/settings.json</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">{</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  &quot;dotfiles.repository&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;https://github.com/youname/dotfiles&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  &quot;dotfiles.targetPath&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;~/dotfiles&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  &quot;dotfiles.installCommand&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;install.sh&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span></code></pre></div><p><strong>所有的</strong> devcontainer 跑起来都自动 clone 你 dotfiles → 跑 <code>install.sh</code>——<strong>你新进一个容器,30 秒后 zsh / tmux / Neovim 跟你家电脑一模一样</strong>。</p><p><strong>方式 B:项目级(devcontainer.json)</strong></p><div class="language-jsonc vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">jsonc</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">{</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  &quot;image&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;...&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  &quot;remoteUser&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;vscode&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  &quot;containerEnv&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: {</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    &quot;DOTFILES_REPO&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;https://github.com/youname/dotfiles&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  },</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  &quot;postCreateCommand&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;git clone $DOTFILES_REPO ~/dotfiles &amp;&amp; ~/dotfiles/install.sh&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span></code></pre></div><p><strong>注意</strong>:<strong>install.sh 必须做防御性编程</strong>——容器里很多工具不存在(brew、mac 专有的、不同 Linux 发行版的包名),你的 install.sh 在 mac 上跑得好好的,进容器一脚踩雷。</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#!/usr/bin/env bash</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># install.sh - 防御性写法</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">set</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -euo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> pipefail</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 检测 OS</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">case</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;$(</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">uname</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -s</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">)&quot;</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> in</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#DBEDFF;">  Darwin</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">*</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">)</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> os</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;mac&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> ;;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#DBEDFF;">  Linux</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">*</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">)</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  os</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;linux&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> ;;</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">  *)</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">       os</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;unknown&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> ;;</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">esac</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 检测包管理器</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">if</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> command</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -v</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> brew</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> &amp;</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">&gt;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">/dev/null; </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">then</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  pm</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;brew&quot;</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">elif</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> command</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -v</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> apt</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> &amp;</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">&gt;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">/dev/null; </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">then</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  pm</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;apt&quot;</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">elif</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> command</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -v</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> apk</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> &amp;</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">&gt;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">/dev/null; </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">then</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  pm</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;apk&quot;</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">   # Alpine</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">else</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  pm</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;none&quot;</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">fi</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 装东西时按可用性来</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">install_tool</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">() {</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">  local</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> tool</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">$1</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">  if</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> [ </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$pm</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;brew&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> ]; </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">then</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    brew</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> install</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$tool</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> 2&gt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">/dev/null</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> ||</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> echo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;skip </span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$tool</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">  elif</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> [ </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$pm</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;apt&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> ]; </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">then</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> apt</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> install</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -y</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$tool</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> 2&gt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">/dev/null</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> ||</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> echo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;skip </span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$tool</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">  fi</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 复制配置(这部分跨平台一致)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">ln</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -sf</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$PWD</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">/zsh/.zshrc&quot;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ~/.zshrc</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">ln</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -sf</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$PWD</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">/tmux/.tmux.conf&quot;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ~/.tmux.conf</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 装可选工具(容器里可能没,跳过即可)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">install_tool</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> fzf</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">install_tool</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ripgrep</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">install_tool</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> neovim</span></span></code></pre></div><p><strong>这种&quot;跨 mac / Linux / 容器&quot;的 install.sh 是 dotfiles 工程化的真正考验</strong>——本地能跑还不够,远端 dev box(可能 Ubuntu)、容器(可能 Alpine 或 Debian slim)都要能跑。</p><h3 id="_5-3-codespaces-的-dotfiles" tabindex="-1">5.3 Codespaces 的 dotfiles <a class="header-anchor" href="#_5-3-codespaces-的-dotfiles" aria-label="Permalink to &quot;5.3 Codespaces 的 dotfiles&quot;">​</a></h3><p>跟 Devcontainer 一样,<strong>走 GitHub 用户级 dotfiles 配置</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>GitHub.com → Settings → Codespaces → Automatically install dotfiles</span></span>
<span class="line"><span>   ✓ 启用</span></span>
<span class="line"><span>   Repository: youname/dotfiles</span></span></code></pre></div><p>之后,<strong>你创建的所有 Codespaces 都自动 clone + install</strong>。新人入职给他一个 codespace 链接,他第一次开,<strong>dotfiles 同时跟上来</strong>——这才叫真正的「一键复现」。</p><hr><h2 id="六、四个典型工作流-case" tabindex="-1">六、四个典型工作流 Case <a class="header-anchor" href="#六、四个典型工作流-case" aria-label="Permalink to &quot;六、四个典型工作流 Case&quot;">​</a></h2><p>不抽象讨论,拿四个真实场景说清楚「该用哪种模式」。</p><h3 id="_6-1-case-1-个人项目-mac-本地——devcontainer-在本地-docker" tabindex="-1">6.1 Case 1:个人项目,Mac 本地——Devcontainer 在本地 Docker <a class="header-anchor" href="#_6-1-case-1-个人项目-mac-本地——devcontainer-在本地-docker" aria-label="Permalink to &quot;6.1 Case 1:个人项目,Mac 本地——Devcontainer 在本地 Docker&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>背景:你周末搞个开源副业项目,Python + FastAPI + Postgres</span></span>
<span class="line"><span>机器:MacBook Pro M3, 24G</span></span>
<span class="line"><span>诉求:</span></span>
<span class="line"><span>   - 不想污染本地 Python(已经装了 3.11、3.12、3.13)</span></span>
<span class="line"><span>   - Postgres 容器一起开关,不用本地 brew 装</span></span>
<span class="line"><span>   - 想试 Python 3.13 但还在 3.12 项目上保留</span></span>
<span class="line"><span>   - 离线咖啡馆也能写代码</span></span>
<span class="line"><span></span></span>
<span class="line"><span>最佳形态:本地 Devcontainer</span></span></code></pre></div><p><strong>.devcontainer/devcontainer.json</strong>:</p><div class="language-jsonc vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">jsonc</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">{</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  &quot;name&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;fastapi-side&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  &quot;image&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;mcr.microsoft.com/devcontainers/python:3.13&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  &quot;features&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: {</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    &quot;ghcr.io/devcontainers/features/docker-in-docker:2&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: {}</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  },</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  &quot;postCreateCommand&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;pip install -e &#39;.[dev]&#39; &amp;&amp; pre-commit install&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  &quot;forwardPorts&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">8000</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">5432</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">],</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  &quot;remoteUser&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;vscode&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  &quot;customizations&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: {</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    &quot;vscode&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: {</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">      &quot;extensions&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;ms-python.python&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;charliermarsh.ruff&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    }</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  },</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  // 加速 IO</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  &quot;mounts&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    &quot;source=fastapi-side-venv,target=/workspace/.venv,type=volume&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  ]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span></code></pre></div><p>加一个 <code>docker-compose.yml</code>(配合 Postgres):</p><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">services</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  app</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    image</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">mcr.microsoft.com/devcontainers/python:3.13</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    volumes</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">..:/workspace:cached</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    command</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">sleep infinity</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    depends_on</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">db</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  db</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    image</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">postgres:16</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    environment</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      POSTGRES_PASSWORD</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">dev</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    ports</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;5432:5432&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span></code></pre></div><p><strong>workflow</strong>:VS Code 打开项目 → Reopen in Container → 容器跑起来,Postgres 也跑起来 → 写代码 → 关 VS Code,容器停。下次打开,2 秒恢复。</p><p><strong>好处</strong>:本地 Mac 干净,所有 Python / Postgres 在容器里,<strong>离线可用</strong>(本地 Docker 不需要网)。</p><h3 id="_6-2-case-2-公司有-dev-box-linux-高配-——vs-code-remote-ssh-tmux" tabindex="-1">6.2 Case 2:公司有 dev box(Linux 高配)——VS Code Remote SSH + tmux <a class="header-anchor" href="#_6-2-case-2-公司有-dev-box-linux-高配-——vs-code-remote-ssh-tmux" aria-label="Permalink to &quot;6.2 Case 2:公司有 dev box(Linux 高配)——VS Code Remote SSH + tmux&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>背景:公司给配了一台 Linux 高配 dev box(64 cores, 256G)</span></span>
<span class="line"><span>诉求:</span></span>
<span class="line"><span>   - 主战场就是这台,代码、build、跑测试都在这</span></span>
<span class="line"><span>   - 自己 Mac 只是个键盘 + 屏幕</span></span>
<span class="line"><span>   - 长任务(big build / training)挂在远端,自己下班不影响</span></span>
<span class="line"><span>   - 想用 VS Code 体验,但要保留 tmux 的 detach 能力</span></span>
<span class="line"><span></span></span>
<span class="line"><span>最佳形态:VS Code Remote SSH + tmux 并用</span></span></code></pre></div><p><strong>workflow</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>平时:</span></span>
<span class="line"><span>   ─ VS Code 启动 → Remote SSH 连 devbox → 写代码、跑测试</span></span>
<span class="line"><span>   ─ debugger / LSP / refactor 都在 VS Code 里点</span></span>
<span class="line"><span>   ─ 顺手要跑长任务 → 在 VS Code 的 terminal 里 tmux attach my-build</span></span>
<span class="line"><span>   ─ 看 tmux 里的输出</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>要下班 / 离开 / 关电脑:</span></span>
<span class="line"><span>   ─ tmux 里的长任务自动继续(detach 之后不死)</span></span>
<span class="line"><span>   ─ VS Code 关掉:vscode-server 自动 suspend,远端进程不影响</span></span>
<span class="line"><span>   ─ 长任务跑完,你电脑都不用开,只是远端日志在累积</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>明早 / 出差:</span></span>
<span class="line"><span>   ─ 任意 Mac 打开 → VS Code Remote SSH 连 devbox → 恢复</span></span>
<span class="line"><span>   ─ tmux attach 看昨晚的输出</span></span>
<span class="line"><span>   ─ 工作流连续性 100%</span></span></code></pre></div><p><strong>ssh config</strong>(15 篇讲过):</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Host devbox</span></span>
<span class="line"><span>  HostName 10.0.1.100</span></span>
<span class="line"><span>  User you</span></span>
<span class="line"><span>  IdentityFile ~/.ssh/id_ed25519</span></span>
<span class="line"><span>  ServerAliveInterval 60       # 防止网络空闲断连</span></span>
<span class="line"><span>  ServerAliveCountMax 3</span></span>
<span class="line"><span>  ControlMaster auto           # 复用连接,VS Code 多个 channel 共享一条 SSH</span></span>
<span class="line"><span>  ControlPath ~/.ssh/cm-%r@%h:%p</span></span>
<span class="line"><span>  ControlPersist 10m</span></span></code></pre></div><h3 id="_6-3-case-3-出差-ipad-多设备——codespaces" tabindex="-1">6.3 Case 3:出差 / iPad / 多设备——Codespaces <a class="header-anchor" href="#_6-3-case-3-出差-ipad-多设备——codespaces" aria-label="Permalink to &quot;6.3 Case 3:出差 / iPad / 多设备——Codespaces&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>背景:你出差 1 周,只带了 iPad + 蓝牙键盘</span></span>
<span class="line"><span>   或者:你有 Mac 公司 + Mac 家 + Linux 桌面三台机器,想要环境一致</span></span>
<span class="line"><span>诉求:</span></span>
<span class="line"><span>   - 不在乎本地算力</span></span>
<span class="line"><span>   - 网络稳定就行</span></span>
<span class="line"><span>   - 多设备同一份&quot;开发环境&quot;</span></span>
<span class="line"><span>   - 公司项目能走 SSO</span></span>
<span class="line"><span></span></span>
<span class="line"><span>最佳形态:GitHub Codespaces</span></span></code></pre></div><p><strong>workflow</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>iPad / 网吧机器 / 任何浏览器:</span></span>
<span class="line"><span>   ─ 打开 github.com/myorg/myrepo</span></span>
<span class="line"><span>   ─ 「Open in Codespace」(自动用你最近的 codespace,或者新开一个)</span></span>
<span class="line"><span>   ─ 几秒钟,VS Code Web 在浏览器里跑</span></span>
<span class="line"><span>   ─ 你公司 GitHub SSO 自动通,代码权限自动有</span></span>
<span class="line"><span>   ─ devcontainer.json + dotfiles 自动加载,环境跟你 Mac 上一样</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>关浏览器 / iPad 没电:</span></span>
<span class="line"><span>   ─ Codespace suspend,你的代码状态保留</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>明天去公司用 Mac:</span></span>
<span class="line"><span>   ─ VS Code 客户端版,Codespace 列表里点你昨天那个</span></span>
<span class="line"><span>   ─ 客户端版的 UI 比浏览器更顺(键盘 mapping、字体)</span></span>
<span class="line"><span>   ─ 同一个 codespace,所以代码状态完全一致</span></span></code></pre></div><p><strong>Codespaces 的成本算账</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>GitHub Pro 用户:每月 60 核小时免费(2 核机器 30 小时 / 4 核机器 15 小时)</span></span>
<span class="line"><span>   超出:$0.18/核小时</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   每天 4 小时用 4 核 codespace,一个月:</span></span>
<span class="line"><span>      4 * 22 * 4 = 352 核小时</span></span>
<span class="line"><span>      免费 60,付费 292,= $52.56/月</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   要长期当主力开发环境(每天 8 小时):</span></span>
<span class="line"><span>      8 * 22 * 4 = 704 核小时</span></span>
<span class="line"><span>      付费 644,= $115.92/月</span></span>
<span class="line"><span>      </span></span>
<span class="line"><span>   一年 $1391——快赶上一台 dev box 了,自建反而便宜</span></span></code></pre></div><p><strong>这就是 Codespaces 长期方案要算成本的原因</strong>——临时 / 出差 / 多设备超值,主力开发 24/7 跑就贵了。</p><h3 id="_6-4-case-4-服务器排错——ssh-tmux-neovim" tabindex="-1">6.4 Case 4:服务器排错——ssh + tmux + Neovim <a class="header-anchor" href="#_6-4-case-4-服务器排错——ssh-tmux-neovim" aria-label="Permalink to &quot;6.4 Case 4:服务器排错——ssh + tmux + Neovim&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>背景:凌晨告警,K8s pod 持续 OOM,要进生产机查</span></span>
<span class="line"><span>诉求:</span></span>
<span class="line"><span>   - 进 pod 看现场</span></span>
<span class="line"><span>   - pod 里没装 vscode-server(distroless)</span></span>
<span class="line"><span>   - 防火墙限制了奇怪的工具</span></span>
<span class="line"><span>   - 网络不稳定</span></span>
<span class="line"><span></span></span>
<span class="line"><span>最佳形态:SSH + tmux + Neovim</span></span></code></pre></div><p><strong>workflow</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>你电脑 → ssh 进堡垒机 → ssh 进 K8s node → kubectl exec 进 pod</span></span>
<span class="line"><span>   或者:本地 → ssh 远端 dev box → 跳板</span></span>
<span class="line"><span></span></span>
<span class="line"><span>在 dev box 上:</span></span>
<span class="line"><span>   ─ tmux new -s incident</span></span>
<span class="line"><span>   ─ window 1: ssh prod-node-3,跑 kubectl logs -f</span></span>
<span class="line"><span>   ─ window 2: kubectl exec into pod, top / pidof / strace</span></span>
<span class="line"><span>   ─ window 3: Neovim 改一个临时 patch,scp 进 pod</span></span>
<span class="line"><span>   ─ window 4: 跑监控 query 看趋势</span></span>
<span class="line"><span></span></span>
<span class="line"><span>关电脑:tmux session 保留,长 grep 一直跑</span></span>
<span class="line"><span>明早:tmux attach,继续昨晚的现场</span></span></code></pre></div><p><strong>这就是 VS Code Remote 救不了的场景</strong>:pod 里装不上 vscode-server,跳板多跳 VS Code 不支持。<strong>SSH + tmux 是这种场景的最后一道防线</strong>——也因此本系列 16-17 篇讲 tmux 那么细。</p><hr><h2 id="七、performance-考虑-不浪漫-但决定每天舒不舒服" tabindex="-1">七、Performance 考虑(不浪漫,但决定每天舒不舒服) <a class="header-anchor" href="#七、performance-考虑-不浪漫-但决定每天舒不舒服" aria-label="Permalink to &quot;七、Performance 考虑(不浪漫,但决定每天舒不舒服)&quot;">​</a></h2><h3 id="_7-1-三个性能维度" tabindex="-1">7.1 三个性能维度 <a class="header-anchor" href="#_7-1-三个性能维度" aria-label="Permalink to &quot;7.1 三个性能维度&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 网络延迟(对 VS Code Remote / Codespaces / SSH 终端)</span></span>
<span class="line"><span>   ─ &lt; 50ms:跟本地无感</span></span>
<span class="line"><span>   ─ 50-100ms:能用,偶尔卡</span></span>
<span class="line"><span>   ─ 100-200ms:难受,字符回显有迟滞感</span></span>
<span class="line"><span>   ─ &gt; 200ms:不能正经开发,只能跑命令看输出</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   小 trick:VS Code Remote 协议比 SSH 终端&quot;看起来&quot;延迟更高,</span></span>
<span class="line"><span>            因为它要把 LSP 结果传回来渲染,</span></span>
<span class="line"><span>            实际场景下 100ms 比 SSH 多 30% 难受感。</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. 文件 IO(对 Devcontainer / 容器化任何场景)</span></span>
<span class="line"><span>   ─ macOS bind mount:小文件读 1-5MB/s(极慢)</span></span>
<span class="line"><span>   ─ Linux 原生:几十 GB/s</span></span>
<span class="line"><span>   ─ 容器内 named volume:接近 Linux 原生</span></span>
<span class="line"><span>   ─ Codespaces NVMe:几个 GB/s</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   实际影响:</span></span>
<span class="line"><span>      ─ Mac Devcontainer 装 node_modules:5 min</span></span>
<span class="line"><span>      ─ Linux 原生:30 sec</span></span>
<span class="line"><span>      ─ Codespaces:30 sec</span></span>
<span class="line"><span>      </span></span>
<span class="line"><span>   差距 10 倍——直接决定&quot;我愿不愿意每天用&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. 计算资源(影响 build / test 时间)</span></span>
<span class="line"><span>   ─ MacBook M4 32G:够日常,大编译慢</span></span>
<span class="line"><span>   ─ 公司 dev box 64 核:大编译快 5-10×</span></span>
<span class="line"><span>   ─ Codespaces 大档(16 核):比 mac 快 2-3×,比 dev box 慢</span></span>
<span class="line"><span>   ─ AWS EC2 c7i.48xlarge:几乎随用随放,贵</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   你时间值钱的话,一天 10 次大 build,本地慢的累计成本就出来了</span></span></code></pre></div><h3 id="_7-2-macos-上-devcontainer-的-该用-不该用" tabindex="-1">7.2 macOS 上 Devcontainer 的&quot;该用 / 不该用&quot; <a class="header-anchor" href="#_7-2-macos-上-devcontainer-的-该用-不该用" aria-label="Permalink to &quot;7.2 macOS 上 Devcontainer 的&quot;该用 / 不该用&quot;&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>该用:</span></span>
<span class="line"><span>   ─ 项目本身 IO 不重(单文件代码、小 Python 项目)</span></span>
<span class="line"><span>   ─ 主要瓶颈是&quot;环境隔离&quot;,不是&quot;IO 速度&quot;</span></span>
<span class="line"><span>   ─ 你愿意用 named volume 处理高 IO 目录</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>不该用:</span></span>
<span class="line"><span>   ─ JS 大型 monorepo(node_modules 几 GB,bind mount 让你哭)</span></span>
<span class="line"><span>   ─ 媒体处理 / ML(本地 GPU 进不去容器,且 IO 是瓶颈)</span></span>
<span class="line"><span>   ─ 你 mac 内存 &lt; 16GB(Docker Desktop 自己就吃 8GB)</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>替代:</span></span>
<span class="line"><span>   ─ 远端 Devcontainer(放到 Linux dev box 上跑)</span></span>
<span class="line"><span>   ─ 或者 mise + brew 本地直跑(24 篇)</span></span>
<span class="line"><span>   ─ 或者 Codespaces</span></span></code></pre></div><h3 id="_7-3-网络延迟-vs-codespaces-选-region" tabindex="-1">7.3 网络延迟 vs Codespaces 选 region <a class="header-anchor" href="#_7-3-网络延迟-vs-codespaces-选-region" aria-label="Permalink to &quot;7.3 网络延迟 vs Codespaces 选 region&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>你在中国 → GitHub Codespaces region:</span></span>
<span class="line"><span>   ─ Southeast Asia (Singapore): 70-150ms</span></span>
<span class="line"><span>   ─ East Asia (Hong Kong): 50-100ms(挂梯子)</span></span>
<span class="line"><span>   ─ US West (Oregon): 200-300ms</span></span>
<span class="line"><span>   ─ US East: 250-400ms</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   选 SE Asia 或 East Asia,日常可用</span></span>
<span class="line"><span>   选 US,只适合跑命令看输出,不适合长时间 UI 操作</span></span></code></pre></div><p><strong>这就是 Codespaces 在国内&quot;不友好&quot;的根源</strong>——region 离得远,延迟不可接受。Coder 自建 / 国内云厂商的类似产品可以缓解,但 ecosystem 不一样。</p><hr><h2 id="八、secret-处理-不要把密钥进-image" tabindex="-1">八、Secret 处理:不要把密钥进 image <a class="header-anchor" href="#八、secret-处理-不要把密钥进-image" aria-label="Permalink to &quot;八、Secret 处理:不要把密钥进 image&quot;">​</a></h2><h3 id="_8-1-三种-secret-处理姿势" tabindex="-1">8.1 三种 secret 处理姿势 <a class="header-anchor" href="#_8-1-三种-secret-处理姿势" aria-label="Permalink to &quot;8.1 三种 secret 处理姿势&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>❌ 错误姿势 1:写进 Dockerfile / devcontainer.json</span></span>
<span class="line"><span>   ─ &quot;ENV API_KEY=xxx&quot;</span></span>
<span class="line"><span>   ─ 进 git,所有人能看</span></span>
<span class="line"><span>   ─ 进 image,凡是 docker pull 的人都有</span></span>
<span class="line"><span>   ─ image 上传到 registry,泄漏放大</span></span>
<span class="line"><span></span></span>
<span class="line"><span>❌ 错误姿势 2:postCreateCommand 里 curl 一份下来</span></span>
<span class="line"><span>   ─ &quot;postCreateCommand&quot;: &quot;curl -sSL https://internal/secrets &gt; .env&quot;</span></span>
<span class="line"><span>   ─ 看起来不进 image,但 .env 留在容器内</span></span>
<span class="line"><span>   ─ 跨 dev / 容器重建,你不记得这个 .env 哪来的</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>✓ 正确姿势 1:Devcontainer secrets(2024 新)</span></span>
<span class="line"><span>   ─ devcontainer.json 里:</span></span>
<span class="line"><span>     &quot;secrets&quot;: {</span></span>
<span class="line"><span>       &quot;OPENAI_API_KEY&quot;: {&quot;description&quot;: &quot;OpenAI 的 key&quot;}</span></span>
<span class="line"><span>     }</span></span>
<span class="line"><span>   ─ VS Code 启动容器时弹窗让你输,本地 keychain 加密存</span></span>
<span class="line"><span>   ─ 容器内作为 env 可用,但不进 git、不进 image</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>✓ 正确姿势 2:Codespaces secrets</span></span>
<span class="line"><span>   ─ GitHub.com → Settings → Codespaces → Secrets</span></span>
<span class="line"><span>   ─ 加 key/value,标记哪些 repo 可用</span></span>
<span class="line"><span>   ─ 自动作为 env 注入,不进 git</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>✓ 正确姿势 3:.env mount(不进 git)</span></span>
<span class="line"><span>   ─ 项目根:.env(in .gitignore)</span></span>
<span class="line"><span>   ─ devcontainer.json:</span></span>
<span class="line"><span>     &quot;mounts&quot;: [&quot;source=\${localWorkspaceFolder}/.env,target=/workspace/.env,type=bind&quot;]</span></span>
<span class="line"><span>   ─ 团队成员各自维护 .env(从 1Password / SSO secrets manager 拷)</span></span></code></pre></div><h3 id="_8-2-团队级-secret-流程" tabindex="-1">8.2 团队级 secret 流程 <a class="header-anchor" href="#_8-2-团队级-secret-流程" aria-label="Permalink to &quot;8.2 团队级 secret 流程&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>新人入职:</span></span>
<span class="line"><span>   1. SSO 进公司 1Password / Vault</span></span>
<span class="line"><span>   2. 拿到 &quot;myapp-dev-env&quot; 这份 secret</span></span>
<span class="line"><span>   3. 本地 .env 写好(或 1Password CLI 自动注入)</span></span>
<span class="line"><span>   4. .env 不进 git</span></span>
<span class="line"><span>   5. devcontainer.json mount 进去</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>.env 内容更新:</span></span>
<span class="line"><span>   ─ secret manager 更新 → 工程师重拉 → 重启容器</span></span>
<span class="line"><span>   ─ 不是 Docker image 更新,所以不影响 prod</span></span></code></pre></div><p><strong>核心原则</strong>:<strong>image 是公共制品,可以放在 git / registry;secret 是私人凭证,只在你本地 / 你的 secret manager 里</strong>。两者绝对不混。</p><hr><h2 id="九、claude-code-在-remote-dev-里的位置" tabindex="-1">九、Claude Code 在 Remote dev 里的位置 <a class="header-anchor" href="#九、claude-code-在-remote-dev-里的位置" aria-label="Permalink to &quot;九、Claude Code 在 Remote dev 里的位置&quot;">​</a></h2><p>29 篇会专讲「终端 + Claude Code 工作流」,但这里先把它跟 remote dev 的关系点一下——<strong>因为很多人对 Claude Code 在 remote dev 里&quot;该跑在哪&quot;完全没概念</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌─────────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  四种 remote dev 模式下,Claude Code 跑在哪                       │</span></span>
<span class="line"><span>├─────────────────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>│                                                                 │</span></span>
<span class="line"><span>│  SSH + tmux:                                                    │</span></span>
<span class="line"><span>│     ─ Claude Code 跑在远端 tmux 的一个 pane 里                   │</span></span>
<span class="line"><span>│     ─ 你在本地终端 attach,看输出                                │</span></span>
<span class="line"><span>│     ─ tmux detach 之后,Claude Code 继续跑                       │</span></span>
<span class="line"><span>│     ─ 你电脑炸了,Claude 还在远端干活                            │</span></span>
<span class="line"><span>│     ─ 这是&quot;长任务挂远端&quot;的最干净玩法                            │</span></span>
<span class="line"><span>│                                                                 │</span></span>
<span class="line"><span>│  VS Code Remote SSH:                                            │</span></span>
<span class="line"><span>│     ─ Claude Code VS Code 插件能跑在远端 vscode-server          │</span></span>
<span class="line"><span>│     ─ context 是远端代码                                         │</span></span>
<span class="line"><span>│     ─ 你 close VS Code,Claude 跟着挂                            │</span></span>
<span class="line"><span>│     ─ 想长跑还得自己开 tmux 包一层                              │</span></span>
<span class="line"><span>│                                                                 │</span></span>
<span class="line"><span>│  Devcontainer:                                                  │</span></span>
<span class="line"><span>│     ─ Claude Code 跑在容器内                                     │</span></span>
<span class="line"><span>│     ─ context = 容器内代码                                       │</span></span>
<span class="line"><span>│     ─ Claude 装的工具 = 容器内工具(不污染本地)                 │</span></span>
<span class="line"><span>│     ─ 这是&quot;项目隔离 Claude&quot; 的最干净玩法                         │</span></span>
<span class="line"><span>│                                                                 │</span></span>
<span class="line"><span>│  Codespaces:                                                    │</span></span>
<span class="line"><span>│     ─ Claude Code 跑在云容器内                                   │</span></span>
<span class="line"><span>│     ─ 你浏览器关掉,云容器 suspend,Claude 跟着 suspend          │</span></span>
<span class="line"><span>│     ─ 适合临时任务,不适合 24h 长跑                              │</span></span>
<span class="line"><span>│                                                                 │</span></span>
<span class="line"><span>└─────────────────────────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>最重要的认知</strong>:<strong>Claude Code 是一个进程,它跟着哪个父进程,父进程死它就死</strong>。</p><ul><li>VS Code 插件 → Claude 跟着 VS Code 死</li><li>tmux pane → Claude 跟着 tmux session 生死(tmux session detach 不死,kill server 才死)</li><li>Codespaces 浏览器 → Codespace suspend 时 Claude 也 suspend</li></ul><p><strong>所以&quot;Claude Code 长任务挂着自己下班&quot;的唯一正确解法是 tmux</strong>——这是 SSH + tmux 这种&quot;看起来 1990 年代&quot;的方案,在 2026 仍然不可替代的原因之一。29 篇会细讲。</p><hr><h2 id="十、反对的写法" tabindex="-1">十、反对的写法 <a class="header-anchor" href="#十、反对的写法" aria-label="Permalink to &quot;十、反对的写法&quot;">​</a></h2><p>这一篇结尾,把几种<strong>常见错误用法</strong>列出来——见到就是搞错了:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>❌ 强行所有项目上 Devcontainer</span></span>
<span class="line"><span>   ─ 本地能跑得好好的小项目,硬上 Devcontainer</span></span>
<span class="line"><span>   ─ 多一层 Docker,IO 变慢,Mac 内存吃光</span></span>
<span class="line"><span>   ─ 5 个本地 Python 包写个脚本,根本不需要容器</span></span>
<span class="line"><span>   ─ 原则:本地能搞定,别折腾;团队 onboarding 成本 &gt; 2 小时,才考虑</span></span>
<span class="line"><span></span></span>
<span class="line"><span>❌ 用 SSHFS / VS Code Remote 两种混合</span></span>
<span class="line"><span>   ─ 把远端文件 sshfs mount 到本地,然后本地 VS Code 编辑</span></span>
<span class="line"><span>   ─ 两个协议干扰:LSP 看的是本地文件(慢),实际改的是远端</span></span>
<span class="line"><span>   ─ 还不如直接 VS Code Remote SSH</span></span>
<span class="line"><span></span></span>
<span class="line"><span>❌ Devcontainer + 本地 IDE 同时编辑</span></span>
<span class="line"><span>   ─ Devcontainer 跑着,你又开本地 IDE 改同一个文件</span></span>
<span class="line"><span>   ─ 文件冲突,容器内 watcher 看不到,build 出问题</span></span>
<span class="line"><span>   ─ 选一个,要么进容器,要么不开</span></span>
<span class="line"><span></span></span>
<span class="line"><span>❌ Codespaces 24/7 跑</span></span>
<span class="line"><span>   ─ 把它当 dev box 用,每月 $200+</span></span>
<span class="line"><span>   ─ 公司发钱给你 dev box,不要钱;你自己跑 Codespaces 24/7,自掏 $2000/年</span></span>
<span class="line"><span>   ─ 临时用 / 出差 OK,主力开发不划算</span></span>
<span class="line"><span></span></span>
<span class="line"><span>❌ vscode-server 反复装在每个新远端</span></span>
<span class="line"><span>   ─ 同一个用户身份 / 同一个 vscode-server 版本就够了</span></span>
<span class="line"><span>   ─ 每次连不同 host 装一次,远端磁盘吃光</span></span>
<span class="line"><span></span></span>
<span class="line"><span>❌ Devcontainer 把 secret 写进 devcontainer.json</span></span>
<span class="line"><span>   ─ 进 git → 全公司能看 → 离职员工还有 key</span></span>
<span class="line"><span>   ─ 用 devcontainer secrets 或 .env mount</span></span>
<span class="line"><span></span></span>
<span class="line"><span>❌ 把 dotfiles install.sh 写得只能在 mac 上跑</span></span>
<span class="line"><span>   ─ 进容器一脚踩雷:brew 不存在 / mac-specific 工具 / Keychain 不在</span></span>
<span class="line"><span>   ─ 防御性编程:OS 检测、命令存在检测、可选工具跳过</span></span>
<span class="line"><span></span></span>
<span class="line"><span>❌ 远端 dev 但 git config 不在远端</span></span>
<span class="line"><span>   ─ 你在远端 commit,但 user.email 是 root@hostname</span></span>
<span class="line"><span>   ─ commit 历史脏了,GitHub commit 不显示头像</span></span>
<span class="line"><span>   ─ dotfiles 一定要把 git config 同步过去</span></span>
<span class="line"><span></span></span>
<span class="line"><span>❌ 期望 Devcontainer 解决&quot;复现到一模一样&quot;</span></span>
<span class="line"><span>   ─ Devcontainer 用 image tag,tag 同样 image 内容可能不同(latest 漂移)</span></span>
<span class="line"><span>   ─ &quot;绝对可复现&quot;是 Nix 的领域,Devcontainer 是&quot;差不多&quot;</span></span>
<span class="line"><span>   ─ 团队场景 Devcontainer 够,科学计算 / 合规追溯用 Nix</span></span>
<span class="line"><span></span></span>
<span class="line"><span>❌ ssh devbox 不用 ControlMaster</span></span>
<span class="line"><span>   ─ VS Code Remote 一会儿开一条 SSH,一会儿 LSP 又开一条</span></span>
<span class="line"><span>   ─ 每次握手 1-2 秒,体验差</span></span>
<span class="line"><span>   ─ 15 篇讲过的 ControlMaster + ControlPersist 必加</span></span></code></pre></div><p><strong>这十条踩坑你避开,team 里 remote dev 的 ROI 自然出来</strong>——避不开,工具再先进也救不了。</p><hr><h2 id="十一、看完应该能" tabindex="-1">十一、看完应该能 <a class="header-anchor" href="#十一、看完应该能" aria-label="Permalink to &quot;十一、看完应该能&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>□ 在白板上画出第二节那张「四件事拆开」的表</span></span>
<span class="line"><span>□ 不再纠结&quot;Devcontainer 好还是 Codespaces 好&quot;,而是问</span></span>
<span class="line"><span>   &quot;这次任务,这四件事我各放哪&quot;</span></span>
<span class="line"><span>□ 写一个能跑的 .devcontainer/devcontainer.json,包含 features +</span></span>
<span class="line"><span>   postCreateCommand + extensions + forwardPorts</span></span>
<span class="line"><span>□ 在 macOS 上把高 IO 目录改成 named volume,把 node_modules</span></span>
<span class="line"><span>   装速度从 5 分钟降到 30 秒</span></span>
<span class="line"><span>□ 写一个跨 mac / Linux / Alpine 都能跑的 dotfiles install.sh</span></span>
<span class="line"><span>□ 给团队新人能讲清楚:你这次选 Devcontainer 而不是 Codespaces,</span></span>
<span class="line"><span>   是为了什么(成本 / 网络 / 离线 / IO)</span></span>
<span class="line"><span>□ 知道 Claude Code 在四种模式下分别&quot;绑在哪个进程&quot;,</span></span>
<span class="line"><span>   挂的时候为什么挂、挂了怎么办</span></span>
<span class="line"><span>□ 知道 SSH + tmux 这种&quot;古老&quot;方案,在哪种场景仍然是最好选择</span></span>
<span class="line"><span>   (生产排错 / 长任务挂远端 / 极简环境)</span></span></code></pre></div><p>如果上面这 8 条你都做到,<strong>这一篇就值了</strong>。</p><hr><h2 id="十二、下一篇预告-27-shell-脚本工程化" tabindex="-1">十二、下一篇预告:27 - Shell 脚本工程化 <a class="header-anchor" href="#十二、下一篇预告-27-shell-脚本工程化" aria-label="Permalink to &quot;十二、下一篇预告:27 - Shell 脚本工程化&quot;">​</a></h2><p>26 讲了「<strong>远端开发的形态</strong>」——下一篇拐进「<strong>shell 脚本工程化</strong>」,看起来好像换了主题,但其实是同一条线:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>你已经会用 Devcontainer / Codespaces / dotfiles 让&quot;工作流&quot;可复现</span></span>
<span class="line"><span>   ─ install.sh 也是工作流的一部分</span></span>
<span class="line"><span>   ─ 你的 devcontainer postCreateCommand 也是脚本</span></span>
<span class="line"><span>   ─ 你跑 CI 也是 shell 脚本</span></span>
<span class="line"><span>   ─ 你的告警 runbook 也是 shell 脚本</span></span>
<span class="line"><span></span></span>
<span class="line"><span>但这些脚本,9 成是&quot;半坏&quot;的:</span></span>
<span class="line"><span>   ─ 没 set -euo pipefail</span></span>
<span class="line"><span>   ─ 没 shellcheck</span></span>
<span class="line"><span>   ─ rm -rf $VAR/foo 一抖就删 /</span></span>
<span class="line"><span>   ─ 没测试,不能放心改</span></span>
<span class="line"><span></span></span>
<span class="line"><span>27 篇讲:</span></span>
<span class="line"><span>   ─ set -euo pipefail / IFS 三件套(每条配真实事故)</span></span>
<span class="line"><span>   ─ shellcheck 静态分析</span></span>
<span class="line"><span>   ─ shfmt 格式化</span></span>
<span class="line"><span>   ─ bats 单元测试</span></span>
<span class="line"><span>   ─ trap 清理</span></span>
<span class="line"><span>   ─ 100 行边界:超过就该换 Python</span></span>
<span class="line"><span>   ─ 一份 30 行工程化模板</span></span></code></pre></div><p><strong>核心论断</strong>:<strong>shell 脚本是 dev workflow 里&quot;最常见但最被低估&quot;的工程产物</strong>——不工程化,你的 dotfiles / Devcontainer / CI 全是上面盖着一层&quot;半坏&quot;的脚本。这层不整,工作流就漂。</p>`,176)])])}const g=n(e,[["render",l]]);export{k as __pageData,g as default};
