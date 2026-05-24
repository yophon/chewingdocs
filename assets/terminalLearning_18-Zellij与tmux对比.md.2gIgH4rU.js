import{c as n,Q as a,j as p,m as l}from"./chunks/framework.Bhbi9jCp.js";const d=JSON.parse('{"title":"Zellij vs tmux:声明式 layout、内置 floating、该不该迁移","description":"","frontmatter":{},"headers":[],"relativePath":"terminalLearning/18-Zellij与tmux对比.md","filePath":"terminalLearning/18-Zellij与tmux对比.md","lastUpdated":1778574438000}'),e={name:"terminalLearning/18-Zellij与tmux对比.md"};function t(i,s,o,c,u,r){return a(),p("div",null,[...s[0]||(s[0]=[l(`<h1 id="zellij-vs-tmux-声明式-layout、内置-floating、该不该迁移" tabindex="-1">Zellij vs tmux:声明式 layout、内置 floating、该不该迁移 <a class="header-anchor" href="#zellij-vs-tmux-声明式-layout、内置-floating、该不该迁移" aria-label="Permalink to &quot;Zellij vs tmux:声明式 layout、内置 floating、该不该迁移&quot;">​</a></h1><p>tmux 是终端复用器的事实标准,这一点没人能否认——你 SSH 进 2026 年任何一台 Linux 服务器,<code>tmux --version</code> 大概率有;你打开 macOS 上的任何一个工程师的电脑,<code>brew list | grep tmux</code> 八成中招;你刷 GitHub「awesome-tmux」,star 5 万,plugin 上千。<strong>但「事实标准」不代表「好用」</strong>——tmux 的入门体验在 2026 年看是反人类的:prefix 默认是 Ctrl-B(食指够不到 B),<code>prefix + &quot;</code> 横切 <code>prefix + %</code> 竖切(看不出方向),状态栏默认是绿底黑字的 <code>[0] 0:bash*</code>(看着像 1995 年的产物),copy-mode 默认是 emacs 键位(vi 党愣住),复制完不通系统剪贴板(要 <code>prefix + ]</code> 才能粘 tmux 内)。<strong>新人第一次打开 tmux,30 秒内决定&quot;算了,我用 VS Code 内置 terminal 点窗格&quot;</strong>。</p><p>2021 年 Zellij 出现,Rust 写的现代 multiplexer,瞄准的就是这个空档:<strong>&quot;装完就有 hint 栏告诉你按键在哪、Ctrl-P 切 pane / Ctrl-T 切 tab 这种模态键代替 prefix、KDL 声明式 layout、Alt-f 一键 floating pane&quot;</strong>。<strong>第一次打开 Zellij,新人 30 秒上手;第一次打开 tmux,新人 30 秒放弃</strong>。这是 UX 上的代差,不是功能上的对垒。</p><p><strong>那 tmux 还该不该学</strong>?这一篇就是来回答这个问题的。结论先抛出来:<strong>Zellij 是给&quot;学不动 tmux 又需要 multiplexer&quot;的工程师准备的;tmux 仍然是生态最深、远端默认装、插件最齐的事实标准</strong>。<strong>两个都装 + 频繁切换 = 两边都不流畅</strong>——选一个,投入半年,内化成肌肉记忆,这才是 multiplexer 的正确姿势。</p><p>这一篇拆开讲:<strong>Zellij 是什么、Zellij 解决的真问题、两边在体验/性能/生态/远端/可读性 7 个维度的真实差异、Zellij 基础用法 + KDL 声明式 layout 的杀手特性、floating pane 这种 tmux 学不来的体验、session 模型差异、何时选 Zellij、何时继续 tmux、为什么&quot;混用最糟&quot;、WezTerm 的内置 multiplexer 是不是 multiplexer 的下一站、反对的写法</strong>。<strong>不抄 Zellij 官网</strong>——官网在那儿,这里只讲&quot;为什么&quot;和&quot;什么时候不要选 Zellij&quot;。</p><blockquote><p>一句话先记住:<strong>Zellij 是给&quot;学不动 tmux 又需要 multiplexer&quot;的工程师的;tmux 仍是生态最深的选择。混用没意义,选一个用到底——你的肌肉记忆值钱,别拿来给两套不兼容的键位分账</strong>。</p></blockquote><hr><h2 id="一、zellij-是什么-为什么它存在" tabindex="-1">一、Zellij 是什么,为什么它存在 <a class="header-anchor" href="#一、zellij-是什么-为什么它存在" aria-label="Permalink to &quot;一、Zellij 是什么,为什么它存在&quot;">​</a></h2><h3 id="_1-1-一句话定位" tabindex="-1">1.1 一句话定位 <a class="header-anchor" href="#_1-1-一句话定位" aria-label="Permalink to &quot;1.1 一句话定位&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Zellij = &quot;2021 年从零设计的 tmux&quot;——</span></span>
<span class="line"><span>        - Rust 写,没内存安全坑</span></span>
<span class="line"><span>        - 默认开 hint 栏,所有快捷键随时在屏幕底部可见</span></span>
<span class="line"><span>        - 模态键(Ctrl-P pane / Ctrl-T tab / Ctrl-S scroll)代替 prefix</span></span>
<span class="line"><span>        - KDL 声明式 layout,跟 docker-compose 之于 docker run 一样</span></span>
<span class="line"><span>        - 内置 floating pane,Alt-f 一键浮窗</span></span>
<span class="line"><span>        - WebAssembly 插件系统(Rust 写,编译成 WASM)</span></span>
<span class="line"><span>        - 默认行为对新人友好(zellij 命令直接 attach,而不是新建)</span></span></code></pre></div><p>它的&quot;心智模型&quot;和 tmux 一样:<strong>session → tab → pane</strong> 三层。<strong>但它在每一层都重新做了 UX</strong>——不是改进,是重做。<strong>Zellij 不是 tmux 的功能升级,是 tmux 的 UX 重写</strong>。</p><h3 id="_1-2-zellij-诞生背景-tmux-不改的代价" tabindex="-1">1.2 Zellij 诞生背景:tmux 不改的代价 <a class="header-anchor" href="#_1-2-zellij-诞生背景-tmux-不改的代价" aria-label="Permalink to &quot;1.2 Zellij 诞生背景:tmux 不改的代价&quot;">​</a></h3><p>tmux 是 2007 年开源的,作者 Nicholas Marriott 当时的目标是<strong>替代 GNU screen</strong>——所以它继承了 screen 的 prefix 模型(screen 的 prefix 是 Ctrl-A,tmux 改成 Ctrl-B 避开 GNU readline 的&quot;行首&quot;)、screen 的 session/window/pane 概念、screen 的 ASCII 状态栏。</p><p><strong>这个继承在 2007 年是对的</strong>——screen 用户能无痛切换。<strong>但 2026 年的工程师从来没用过 screen</strong>,对他们来说 prefix 是&quot;莫名其妙的两步操作&quot;,状态栏是&quot;丑陋的 1990s&quot;,window 和 tab 这种区分(tmux 叫 window,iTerm/VS Code 叫 tab)是&quot;概念冲突&quot;。</p><p><strong>tmux 18 年不改默认行为</strong>——因为它的所有用户都已经&quot;内化&quot;了这套配置,改默认就是背叛存量。这就是工具的&quot;路径依赖&quot;:<strong>新用户嫌弃,但老用户不让改</strong>。</p><p>Zellij 不背这个包袱:<strong>2021 年从零写,默认配置就是&quot;新用户最舒服&quot;</strong>——Ctrl-P 切 pane 用户一眼能看见,Alt-f 开浮窗不需要 prefix,状态栏自带颜色和图标。<strong>它的好用是&quot;装完即用&quot;,不是&quot;配 200 行 conf 之后才好用&quot;</strong>。这一点和 fish vs bash/zsh 的关系很像:fish 的卖点也是&quot;默认就好&quot;,和 bash 比是 UX 重做。</p><h3 id="_1-3-zellij-不是-tmux-的功能超集" tabindex="-1">1.3 Zellij 不是 tmux 的功能超集 <a class="header-anchor" href="#_1-3-zellij-不是-tmux-的功能超集" aria-label="Permalink to &quot;1.3 Zellij 不是 tmux 的功能超集&quot;">​</a></h3><p>很多新人以为 &quot;Zellij 比 tmux 新,所以功能多&quot;,<strong>这是错误的</strong>。Zellij 和 tmux 在功能上<strong>基本对等</strong>——session/tab/pane、detach/attach、scrollback、复制粘贴、自定义键位、插件系统,两边都有。<strong>Zellij 的差异不在功能,在 UX</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>功能              tmux        Zellij</span></span>
<span class="line"><span>─────────────────────────────────────────────</span></span>
<span class="line"><span>multiplexer       ✓           ✓</span></span>
<span class="line"><span>session detach    ✓           ✓</span></span>
<span class="line"><span>tab / window      ✓           ✓</span></span>
<span class="line"><span>pane split        ✓           ✓</span></span>
<span class="line"><span>copy mode         ✓           ✓</span></span>
<span class="line"><span>plugin system     ✓ (shell)   ✓ (WASM)</span></span>
<span class="line"><span>status bar        ✓ (手配)    ✓ (默认开)</span></span>
<span class="line"><span>hint bar          ✗           ✓ (核心特性)</span></span>
<span class="line"><span>floating pane     ✓ (popup)   ✓ (Alt-f 原生)</span></span>
<span class="line"><span>declarative cfg   ✗           ✓ (KDL)</span></span>
<span class="line"><span>remote shipping   ✓ (常装)    ✗ (服务器少)</span></span></code></pre></div><p><strong>功能没差多少,UX 差一代</strong>——这是评估 Zellij 的关键。如果你已经把 tmux 配舒服了,<strong>Zellij 给你的边际收益不大</strong>;如果你是 multiplexer 新人,<strong>Zellij 给你的体验差异是数量级的</strong>。</p><hr><h2 id="二、关键体验差异-7-个维度的对照" tabindex="-1">二、关键体验差异:7 个维度的对照 <a class="header-anchor" href="#二、关键体验差异-7-个维度的对照" aria-label="Permalink to &quot;二、关键体验差异:7 个维度的对照&quot;">​</a></h2><p>把两边的差异拆成 7 个维度,逐个对照——</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                 tmux                Zellij</span></span>
<span class="line"><span>─────────────────────────────────────────────────────</span></span>
<span class="line"><span>学习曲线          陡(prefix 心智)    缓(hint 栏可见)</span></span>
<span class="line"><span>性能              ★★★★★              ★★★★(略重)</span></span>
<span class="line"><span>生态(插件)      ★★★★★(TPM)        ★★(WASM,新)</span></span>
<span class="line"><span>声明式 layout     ★(脚本)            ★★★★★(KDL)</span></span>
<span class="line"><span>floating pane     prefix B-,简陋     内置体验好</span></span>
<span class="line"><span>ssh 远端 attach   ★★★★★ 经典         ★★★ 也支持</span></span>
<span class="line"><span>配置可读          ★★(纯命令)        ★★★★(KDL)</span></span></code></pre></div><h3 id="_2-1-学习曲线" tabindex="-1">2.1 学习曲线 <a class="header-anchor" href="#_2-1-学习曲线" aria-label="Permalink to &quot;2.1 学习曲线&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>              tmux                          Zellij</span></span>
<span class="line"><span>学习曲线      陡(prefix 心智)              缓(hint 栏可见)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>新人第一天    &quot;Ctrl-B 是啥,B 在哪&quot;          &quot;底部 status bar 写得很清楚&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>第一周        勉强记住 5 个 prefix 命令      已经能流畅切 pane / tab</span></span>
<span class="line"><span></span></span>
<span class="line"><span>第一个月      开始写 .tmux.conf,改 prefix    已经在写 KDL layout</span></span>
<span class="line"><span></span></span>
<span class="line"><span>半年          内化,反而觉得&quot;prefix 真香&quot;     用得很顺,但插件少有点空</span></span></code></pre></div><p><strong>核心差异在&quot;hint 栏&quot;</strong>——Zellij 默认底部一条状态栏,实时显示<strong>当前模式下所有可用快捷键</strong>。tmux 没有这个,你要么背快捷键、要么 <code>Ctrl-B ?</code> 查,<strong>前者要 1 个月、后者打断流</strong>。Zellij 的 hint 栏是 multiplexer UX 上&quot;最大的发明&quot;,<strong>这一项就能让上手成本降到 tmux 的 1/3</strong>。</p><h3 id="_2-2-性能" tabindex="-1">2.2 性能 <a class="header-anchor" href="#_2-2-性能" aria-label="Permalink to &quot;2.2 性能&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>              tmux              Zellij</span></span>
<span class="line"><span>内存(空 session) ~5 MB              ~30 MB</span></span>
<span class="line"><span>CPU(空闲)        极低              略高(Rust runtime)</span></span>
<span class="line"><span>启动速度          &lt; 100ms           ~300ms</span></span>
<span class="line"><span>渲染速度          原生 C            Rust + crossterm,略重</span></span></code></pre></div><p>tmux 是 C 写的,内存占用和 CPU 几乎可以忽略;Zellij 是 Rust 写的,<strong>略重</strong>但完全在可接受范围。<strong>对单机本地用户,这个差异无感</strong>;对资源极小的环境(ARM 嵌入式、Alpine 容器、内存只有 512MB 的小 VPS)tmux 仍是首选。<strong>绝大多数应用工程师不会被 30MB 内存差打到</strong>——你的 Slack 客户端吃 800MB,你 Chrome 一个 tab 200MB,Zellij 30MB 是噪音。</p><h3 id="_2-3-生态-插件" tabindex="-1">2.3 生态(插件) <a class="header-anchor" href="#_2-3-生态-插件" aria-label="Permalink to &quot;2.3 生态(插件)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>              tmux                              Zellij</span></span>
<span class="line"><span>插件管理器      TPM(tmux plugin manager)        zellij plugin(WASM)</span></span>
<span class="line"><span>官方插件数      200+                              ~20</span></span>
<span class="line"><span>社区插件数      上千                              50-100</span></span>
<span class="line"><span>主题数          150+(Catppuccin / Dracula 全有)  10-20</span></span>
<span class="line"><span>插件语言        shell script                      Rust + WASM</span></span>
<span class="line"><span>插件成熟度      高(2007 至今 18 年沉淀)          低(2021 起,4 年)</span></span></code></pre></div><p><strong>tmux 的生态比 Zellij 多 10 倍</strong>。tmux-resurrect(session 持久化)、tmux-continuum(自动保存)、Catppuccin tmux theme、tmuxinator(layout 启动)、vim-tmux-navigator(vim 和 tmux 切换无缝)——<strong>这些 tmux 用户视为日用的东西,Zellij 要么没有、要么刚起步</strong>。</p><p><strong>Zellij 的 WASM 插件系统在技术上更先进</strong>(类型安全、沙箱化、可分发),<strong>但成熟度差 5-10 年</strong>。你想要 tmux-resurrect 那种&quot;完美还原 session 状态(包括每个 pane 当前工作目录、当前进程、scrollback)&quot;的体验,Zellij 现在还做不到那么稳——它有 session resurrection,但范围更小、bug 更多。</p><p><strong>这是 Zellij 当前最大的&quot;软肋&quot;</strong>——技术上更先进,但生态还没养起来。</p><h3 id="_2-4-声明式-layout" tabindex="-1">2.4 声明式 layout <a class="header-anchor" href="#_2-4-声明式-layout" aria-label="Permalink to &quot;2.4 声明式 layout&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>              tmux                              Zellij</span></span>
<span class="line"><span>layout 表达    shell 脚本                       KDL 配置文件</span></span>
<span class="line"><span></span></span>
<span class="line"><span>例子:        tmux new -d -s dev               layout {</span></span>
<span class="line"><span>              tmux split-window -h               pane command=&quot;nvim&quot;</span></span>
<span class="line"><span>              tmux split-window -v               pane split_direction=&quot;horizontal&quot; {</span></span>
<span class="line"><span>              tmux send-keys &quot;nvim&quot; Enter        pane command=&quot;cargo&quot; args=&quot;run&quot;</span></span>
<span class="line"><span>              ...                                  pane</span></span>
<span class="line"><span>                                                 }</span></span>
<span class="line"><span>                                              }</span></span>
<span class="line"><span></span></span>
<span class="line"><span>可读性         ★(全是命令调用)                ★★★★★(声明式,一眼明白)</span></span>
<span class="line"><span>版本控制       ★(脚本里 hardcode 路径)        ★★★★(配置文件)</span></span>
<span class="line"><span>团队共享       难(每人改一遍)                  易(check in KDL,一致)</span></span></code></pre></div><p><strong>Zellij 的 KDL layout 是它最大的杀手特性</strong>——你把工作台描述成一份&quot;配置文件&quot;,而不是&quot;启动脚本&quot;。这跟 docker-compose vs <code>docker run --network ... --port ... --volume ...</code> 的差别一样:<strong>声明式 vs 命令式</strong>。</p><p><strong>tmux 不是不能做声明式 layout</strong>——你可以装 tmuxinator(Ruby 写,YAML 描述)或 tmuxp(Python 写)。<strong>但这些都是&quot;外挂&quot;,不是 tmux 原生</strong>;Zellij 的 KDL 是原生的、官方支持的、不需要额外装东西。</p><h3 id="_2-5-floating-pane" tabindex="-1">2.5 floating pane <a class="header-anchor" href="#_2-5-floating-pane" aria-label="Permalink to &quot;2.5 floating pane&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>              tmux                              Zellij</span></span>
<span class="line"><span>默认是否支持    ✗(3.2+ 有 popup,3.0 之前没)    ✓(Alt-f 内置)</span></span>
<span class="line"><span>配置代价        高(要写 display-popup 命令)     低(开箱即用)</span></span>
<span class="line"><span>体验            粗糙(popup 不带边框,可控性差)  舒适(浮窗带边框,可拖拽大小)</span></span></code></pre></div><p><strong>Zellij 的 floating 是 tmux 学不来的体验</strong>。tmux 的 popup 是 3.2 才加的(2021),功能上能用,但 UX 很粗糙——你 <code>tmux display-popup -E &quot;htop&quot;</code> 弹一个 htop 出来,<strong>没有边框、没有标题、退出就消失</strong>,基本就是&quot;在终端里嵌一个全屏窗口&quot;。</p><p>Zellij 的 floating 是<strong>原生 pane</strong>——你 Alt-f 把当前 pane 转成 floating,移动、resize、关闭都和普通 pane 一样,<strong>这才叫 floating pane</strong>。<strong>这一项 tmux 短期追不上</strong>——它的架构里 pane 是&quot;占满 split 区域的矩形&quot;,改成&quot;浮在上面&quot;要重做渲染。</p><h3 id="_2-6-ssh-远端-attach" tabindex="-1">2.6 ssh 远端 attach <a class="header-anchor" href="#_2-6-ssh-远端-attach" aria-label="Permalink to &quot;2.6 ssh 远端 attach&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>              tmux                              Zellij</span></span>
<span class="line"><span>远端支持       ★★★★★(几乎所有 Linux 默认装)    ★★★(要手装)</span></span>
<span class="line"><span>ssh 进堡垒机   \`tmux attach\` 一键               \`zellij\` 命令不一定有</span></span>
<span class="line"><span></span></span>
<span class="line"><span>容器 exec      \`tmux a -t work\`                 装不上(Alpine 的 musl 偶有问题)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>公司开发机     多人共享一个 session              可以但生态薄</span></span>
<span class="line"><span></span></span>
<span class="line"><span>mosh + tmux    经典组合                          mosh + zellij 可以但少见</span></span></code></pre></div><p><strong>这是 Zellij 最大的硬伤</strong>——服务器侧的事实标准是 tmux,不是 Zellij。<strong>你 SSH 进任何一台 Ubuntu/CentOS/Alpine,<code>tmux --version</code> 大概率有,<code>zellij --version</code> 大概率没</strong>。</p><p>要在远端用 Zellij,你要么:</p><ol><li>静态链接的 binary,scp 过去</li><li><code>cargo install zellij</code>(编译 5-10 分钟,Ubuntu 还要先装 build-essential)</li><li>用 <code>cargo binstall</code>(预编译 binary)</li></ol><p><strong>任何一条都比 <code>apt install tmux</code> 麻烦</strong>。如果你的工作 80% 在远端(SRE、AI infra、ML 训练),<strong>这条就足以让你选 tmux</strong>。</p><h3 id="_2-7-配置可读" tabindex="-1">2.7 配置可读 <a class="header-anchor" href="#_2-7-配置可读" aria-label="Permalink to &quot;2.7 配置可读&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>tmux .tmux.conf                       Zellij config.kdl</span></span>
<span class="line"><span>─────────────────────────────────────────────────────────</span></span>
<span class="line"><span>set -g prefix C-a                     keybinds {</span></span>
<span class="line"><span>unbind C-b                              normal {</span></span>
<span class="line"><span>bind C-a send-prefix                      bind &quot;Ctrl b&quot; { SwitchToMode &quot;pane&quot;; }</span></span>
<span class="line"><span>bind | split-window -h                  }</span></span>
<span class="line"><span>bind - split-window -v                  pane {</span></span>
<span class="line"><span>bind h select-pane -L                     bind &quot;h&quot; { MoveFocus &quot;Left&quot;; }</span></span>
<span class="line"><span>bind j select-pane -D                     bind &quot;l&quot; { MoveFocus &quot;Right&quot;; }</span></span>
<span class="line"><span>bind k select-pane -U                   }</span></span>
<span class="line"><span>bind l select-pane -R                 }</span></span>
<span class="line"><span></span></span>
<span class="line"><span>★★(纯命令,没结构)                   ★★★★(嵌套块,清晰)</span></span></code></pre></div><p><strong>KDL 比 tmux 的命令式配置可读性高一档</strong>——尤其是配置复杂之后,KDL 的嵌套结构让&quot;哪些 binding 属于哪个 mode&quot;一目了然;tmux 的 .tmux.conf 长到 200 行之后,就是一锅命令字面量,新人看不懂、自己半年后也看不懂。</p><hr><h2 id="三、zellij-基础用法-30-分钟从零到流畅" tabindex="-1">三、Zellij 基础用法:30 分钟从零到流畅 <a class="header-anchor" href="#三、zellij-基础用法-30-分钟从零到流畅" aria-label="Permalink to &quot;三、Zellij 基础用法:30 分钟从零到流畅&quot;">​</a></h2><h3 id="_3-1-装" tabindex="-1">3.1 装 <a class="header-anchor" href="#_3-1-装" aria-label="Permalink to &quot;3.1 装&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># macOS</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">brew</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> install</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> zellij</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Linux(预编译 binary)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">curl</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -L</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> https://github.com/zellij-org/zellij/releases/latest/download/zellij-x86_64-unknown-linux-musl.tar.gz</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> |</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> tar</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> xz</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> mv</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> zellij</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /usr/local/bin/</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 用 cargo(编译,慢)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">cargo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> install</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> zellij</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 检查</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">zellij</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --version</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># zellij 0.42.x</span></span></code></pre></div><h3 id="_3-2-启动-第一次跑" tabindex="-1">3.2 启动:第一次跑 <a class="header-anchor" href="#_3-2-启动-第一次跑" aria-label="Permalink to &quot;3.2 启动:第一次跑&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> zellij</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 自动开一个 default session</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 底部有 status bar 显示所有快捷键</span></span></code></pre></div><p><strong>第一次打开你会看到底部这条</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Ctrl + g  LOCK    p  PANE    t  TAB    n  RESIZE    s  SCROLL    o  SESSION    q  QUIT</span></span></code></pre></div><p><strong>这就是 hint 栏</strong>——每个字母对应一个&quot;模式&quot;,Ctrl + p 进入 pane 模式,<strong>进入后 hint 栏会变,显示 pane 模式下的所有快捷键</strong>。<strong>新人不需要查文档,屏幕就是文档</strong>。</p><h3 id="_3-3-模态切换-zellij-的核心交互" tabindex="-1">3.3 模态切换:Zellij 的核心交互 <a class="header-anchor" href="#_3-3-模态切换-zellij-的核心交互" aria-label="Permalink to &quot;3.3 模态切换:Zellij 的核心交互&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Zellij 不用 tmux 那种 &quot;prefix 然后字母&quot; 的两步操作,而是用&quot;模式&quot;:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Ctrl-p   →  进入 PANE 模式</span></span>
<span class="line"><span>   h / l / j / k  →  切 pane</span></span>
<span class="line"><span>   n              →  新 pane(竖切)</span></span>
<span class="line"><span>   d              →  新 pane(横切)</span></span>
<span class="line"><span>   x              →  关闭 pane</span></span>
<span class="line"><span>   ESC            →  退出 pane 模式</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Ctrl-t   →  进入 TAB 模式</span></span>
<span class="line"><span>   1-9            →  跳到 N 号 tab</span></span>
<span class="line"><span>   n              →  新 tab</span></span>
<span class="line"><span>   r              →  重命名 tab</span></span>
<span class="line"><span>   x              →  关闭 tab</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Ctrl-s   →  进入 SCROLL 模式</span></span>
<span class="line"><span>   j / k          →  上下滚动</span></span>
<span class="line"><span>   PgUp/PgDn      →  快速滚动</span></span>
<span class="line"><span>   /              →  搜索</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Ctrl-o   →  进入 SESSION 模式</span></span>
<span class="line"><span>   d              →  detach</span></span>
<span class="line"><span>   w              →  列出所有 session</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Ctrl-n   →  进入 RESIZE 模式</span></span>
<span class="line"><span>   h/j/k/l        →  调 pane 大小</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Alt-f    →  toggle floating(不需要进模式,直接切)</span></span></code></pre></div><p><strong>模式 vs prefix 的本质差异</strong>:</p><ul><li>tmux:<code>prefix + 字母</code> = 两次按键,<strong>每次都要重按 prefix</strong></li><li>Zellij:<strong>进入模式后停留</strong>,直到 ESC 退出,<strong>模式内连续操作只按一个字母</strong></li></ul><p><strong>适用场景的差异</strong>:</p><ul><li>你想切 1 个 pane:tmux 和 Zellij 都是 2 步,差不多</li><li>你想连续切 4 个 pane:tmux 是 <code>prefix h prefix h prefix h prefix h</code>(8 步),Zellij 是 <code>Ctrl-p h h h h ESC</code>(6 步)</li><li>你想 split + 切 + split:tmux 是 <code>prefix | prefix l prefix -</code>(6 步),Zellij 是 <code>Ctrl-p n l n ESC</code>(5 步)</li></ul><p><strong>模式的好处</strong>:连续操作时按键少;<strong>坏处</strong>:你要记得&quot;现在在哪个模式&quot;,ESC 漏按会按错键。<strong>两边各有取舍</strong>。</p><h3 id="_3-4-第一份-config-zellij-config-kdl" tabindex="-1">3.4 第一份 ~/.config/zellij/config.kdl <a class="header-anchor" href="#_3-4-第一份-config-zellij-config-kdl" aria-label="Permalink to &quot;3.4 第一份 ~/.config/zellij/config.kdl&quot;">​</a></h3><div class="language-kdl vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">kdl</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>// ~/.config/zellij/config.kdl</span></span>
<span class="line"><span></span></span>
<span class="line"><span>// 默认 shell</span></span>
<span class="line"><span>default_shell &quot;zsh&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>// 主题(内置十几个,Zellij 0.40+ 自带)</span></span>
<span class="line"><span>theme &quot;catppuccin-mocha&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>// 鼠标支持</span></span>
<span class="line"><span>mouse_mode true</span></span>
<span class="line"><span></span></span>
<span class="line"><span>// 自动复制到系统剪贴板(macOS / Linux 都自动适配)</span></span>
<span class="line"><span>copy_command &quot;pbcopy&quot;     // macOS</span></span>
<span class="line"><span>// copy_command &quot;xclip -selection clipboard&quot;</span><span>  // Linux X11</span></span>
<span class="line"><span>// copy_command &quot;wl-copy&quot;</span><span>                     // Linux Wayland</span></span>
<span class="line"><span></span></span>
<span class="line"><span>// 滚动历史</span></span>
<span class="line"><span>scroll_buffer_size 50000</span></span>
<span class="line"><span></span></span>
<span class="line"><span>// 默认 layout(启动时用)</span></span>
<span class="line"><span>default_layout &quot;compact&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>// 键位重定义(可选,大部分人用默认就行)</span></span>
<span class="line"><span>keybinds {</span></span>
<span class="line"><span>  normal {</span></span>
<span class="line"><span>    // 直接按 Ctrl-f 切 floating(不进模式)</span></span>
<span class="line"><span>    bind &quot;Ctrl f&quot; { ToggleFloatingPanes; }</span></span>
<span class="line"><span>  }</span></span>
<span class="line"><span>}</span></span></code></pre></div><p><strong>这一份配置 ~30 行</strong>,<strong>90% 的用户改不到 100 行</strong>——这是 KDL 相比 tmux 配置的另一个优势:<strong>默认就好用,改少量就够</strong>。<strong>不要抄网上 500 行的 zellij dotfiles,那等于把 Zellij 当 tmux 用</strong>。</p><hr><h2 id="四、kdl-声明式-layout-zellij-的杀手特性" tabindex="-1">四、KDL 声明式 layout:Zellij 的杀手特性 <a class="header-anchor" href="#四、kdl-声明式-layout-zellij-的杀手特性" aria-label="Permalink to &quot;四、KDL 声明式 layout:Zellij 的杀手特性&quot;">​</a></h2><p>这一节是这篇文章的&quot;重头戏&quot;——<strong>KDL layout 是选 Zellij 唯一最强的理由</strong>。</p><h3 id="_4-1-什么是-kdl" tabindex="-1">4.1 什么是 KDL <a class="header-anchor" href="#_4-1-什么是-kdl" aria-label="Permalink to &quot;4.1 什么是 KDL&quot;">​</a></h3><p>KDL(Cuddly Document Language,2021)是一个声明式配置语言,<strong>长得像 HTML / Lisp / Rust 的混血</strong>:</p><div class="language-kdl vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">kdl</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>person name=&quot;Alice&quot; age=30 {</span></span>
<span class="line"><span>  email &quot;alice@example.com&quot;</span></span>
<span class="line"><span>  email &quot;alice@work.com&quot;</span></span>
<span class="line"><span>  address {</span></span>
<span class="line"><span>    street &quot;123 Main St&quot;</span></span>
<span class="line"><span>    city &quot;Springfield&quot;</span></span>
<span class="line"><span>  }</span></span>
<span class="line"><span>}</span></span></code></pre></div><p><strong>比 JSON 多了注释和无引号字符串,比 YAML 多了结构化嵌套,比 TOML 多了表达力</strong>。Zellij 选 KDL 是有道理的:<strong>multiplexer 的配置本质上是嵌套结构(layout 嵌套 layout,pane 嵌套 pane),KDL 比 YAML 表达这种嵌套更清楚</strong>。</p><h3 id="_4-2-一份完整的-layout-文件" tabindex="-1">4.2 一份完整的 layout 文件 <a class="header-anchor" href="#_4-2-一份完整的-layout-文件" aria-label="Permalink to &quot;4.2 一份完整的 layout 文件&quot;">​</a></h3><p>把 nvim + cargo run + cargo watch test + Claude Code 跑在一个 layout 里:</p><div class="language-kdl vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">kdl</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>// ~/.config/zellij/layouts/dev.kdl</span></span>
<span class="line"><span></span></span>
<span class="line"><span>layout {</span></span>
<span class="line"><span>  // 顶部 tab 栏</span></span>
<span class="line"><span>  pane size=1 borderless=true {</span></span>
<span class="line"><span>    plugin location=&quot;zellij:tab-bar&quot;</span></span>
<span class="line"><span>  }</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  // 主工作区:左 nvim,右上 cargo run,右下 cargo watch test</span></span>
<span class="line"><span>  pane split_direction=&quot;vertical&quot; {</span></span>
<span class="line"><span>    // 左:nvim 占 60%</span></span>
<span class="line"><span>    pane size=&quot;60%&quot; {</span></span>
<span class="line"><span>      command &quot;nvim&quot;</span></span>
<span class="line"><span>      args &quot;.&quot;</span></span>
<span class="line"><span>    }</span></span>
<span class="line"><span>    // 右:占 40%,纵向再分</span></span>
<span class="line"><span>    pane split_direction=&quot;horizontal&quot; {</span></span>
<span class="line"><span>      pane {</span></span>
<span class="line"><span>        command &quot;cargo&quot;</span></span>
<span class="line"><span>        args &quot;run&quot;</span></span>
<span class="line"><span>      }</span></span>
<span class="line"><span>      pane {</span></span>
<span class="line"><span>        command &quot;cargo&quot;</span></span>
<span class="line"><span>        args &quot;watch&quot; &quot;-x&quot; &quot;test&quot;</span></span>
<span class="line"><span>      }</span></span>
<span class="line"><span>    }</span></span>
<span class="line"><span>  }</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  // 底部 status 栏</span></span>
<span class="line"><span>  pane size=2 borderless=true {</span></span>
<span class="line"><span>    plugin location=&quot;zellij:status-bar&quot;</span></span>
<span class="line"><span>  }</span></span>
<span class="line"><span>}</span></span></code></pre></div><p><strong>启动方式</strong>:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">zellij</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --layout</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> dev</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 或者</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">zellij</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --layout</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ~/.config/zellij/layouts/dev.kdl</span></span></code></pre></div><p><strong>一行命令,工作台就位</strong>——nvim 在左、cargo run 跑在右上、cargo watch test 跑在右下、顶部 tab 栏、底部 status 栏。<strong>这是 tmuxinator 在 tmux 里能勉强做到的事,但 Zellij 是原生</strong>。</p><h3 id="_4-3-这份-layout-的每段在做什么" tabindex="-1">4.3 这份 layout 的每段在做什么 <a class="header-anchor" href="#_4-3-这份-layout-的每段在做什么" aria-label="Permalink to &quot;4.3 这份 layout 的每段在做什么&quot;">​</a></h3><div class="language-kdl vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">kdl</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>layout {                              // 整个 layout 的根</span></span>
<span class="line"><span>  pane size=1 borderless=true {       // 第 1 个 pane:固定 1 行高,无边框</span></span>
<span class="line"><span>    plugin location=&quot;zellij:tab-bar&quot;  // 装 tab-bar 这个内置插件</span></span>
<span class="line"><span>  }</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  pane split_direction=&quot;vertical&quot; {   // 第 2 个 pane:垂直分割(左右)</span></span>
<span class="line"><span>    pane size=&quot;60%&quot; {                 // 左 pane,占 60% 宽</span></span>
<span class="line"><span>      command &quot;nvim&quot;                  // 启动命令</span></span>
<span class="line"><span>      args &quot;.&quot;                        // 命令参数(当前目录)</span></span>
<span class="line"><span>    }</span></span>
<span class="line"><span>    pane split_direction=&quot;horizontal&quot; { // 右 pane,水平分割(上下)</span></span>
<span class="line"><span>      pane { command &quot;cargo&quot;; args &quot;run&quot;; }</span></span>
<span class="line"><span>      pane { command &quot;cargo&quot;; args &quot;watch&quot; &quot;-x&quot; &quot;test&quot;; }</span></span>
<span class="line"><span>    }</span></span>
<span class="line"><span>  }</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  pane size=2 borderless=true {       // 第 3 个 pane:固定 2 行高,无边框</span></span>
<span class="line"><span>    plugin location=&quot;zellij:status-bar&quot;</span></span>
<span class="line"><span>  }</span></span>
<span class="line"><span>}</span></span></code></pre></div><p><strong>核心概念</strong>:</p><ul><li><code>pane</code> 是一个矩形区域,可以是终端(有 command)或插件(有 plugin)</li><li><code>split_direction=&quot;vertical&quot;</code> = 左右分;<code>&quot;horizontal&quot;</code> = 上下分</li><li><code>size</code> 可以是百分比(<code>&quot;60%&quot;</code>)或固定行数(<code>size=1</code>)</li><li><code>borderless=true</code> 表示这个 pane 不要边框(用于状态栏)</li><li>嵌套 pane 实现复杂 layout</li></ul><h3 id="_4-4-多个-tab-的-layout" tabindex="-1">4.4 多个 tab 的 layout <a class="header-anchor" href="#_4-4-多个-tab-的-layout" aria-label="Permalink to &quot;4.4 多个 tab 的 layout&quot;">​</a></h3><div class="language-kdl vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">kdl</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>// 三个 tab:dev / logs / db</span></span>
<span class="line"><span>layout {</span></span>
<span class="line"><span>  tab name=&quot;dev&quot; focus=true {</span></span>
<span class="line"><span>    pane split_direction=&quot;vertical&quot; {</span></span>
<span class="line"><span>      pane command=&quot;nvim&quot;</span></span>
<span class="line"><span>      pane command=&quot;bash&quot;</span></span>
<span class="line"><span>    }</span></span>
<span class="line"><span>  }</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  tab name=&quot;logs&quot; {</span></span>
<span class="line"><span>    pane command=&quot;tail&quot; args=&quot;-f&quot; &quot;/var/log/app.log&quot;</span></span>
<span class="line"><span>  }</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  tab name=&quot;db&quot; {</span></span>
<span class="line"><span>    pane command=&quot;psql&quot; args=&quot;-d&quot; &quot;myapp&quot;</span></span>
<span class="line"><span>  }</span></span>
<span class="line"><span>}</span></span></code></pre></div><p><strong>一键起 3 个 tab,各自有自己的 pane</strong>。这种&quot;项目工作台&quot;在 tmux 里需要写 50 行 shell 脚本,在 Zellij 里 15 行 KDL。</p><h3 id="_4-5-layout-的真实价值-团队共享" tabindex="-1">4.5 layout 的真实价值:团队共享 <a class="header-anchor" href="#_4-5-layout-的真实价值-团队共享" aria-label="Permalink to &quot;4.5 layout 的真实价值:团队共享&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>工程师 A 写的 layout            check in 到 repo</span></span>
<span class="line"><span>   ↓</span></span>
<span class="line"><span>工程师 B clone 仓库</span></span>
<span class="line"><span>   ↓</span></span>
<span class="line"><span>zellij --layout ./project.kdl</span></span>
<span class="line"><span>   ↓</span></span>
<span class="line"><span>B 的工作台和 A 一模一样</span></span></code></pre></div><p><strong>这是 tmux 永远做不到的事</strong>——tmux 的 layout 散在每个人的 .tmux.conf 里,<strong>每人都不一样</strong>。Zellij 的 layout 是&quot;项目级别&quot;的,<strong>可以 check in,团队共享</strong>。</p><p><strong>对 onboarding 新人</strong>:&quot;clone 这个 repo,运行 <code>zellij --layout ./onboarding.kdl</code>&quot;—— 30 秒后新人的屏幕就是和你一样的工作台。<em><em>这种 onboarding 体验,tmux 装 tmuxinator + 手抄 YAML + 改 ~/.tmuxinator/</em> 才能勉强做到</em>*。</p><h3 id="_4-6-当前目录-环境变量" tabindex="-1">4.6 当前目录 / 环境变量 <a class="header-anchor" href="#_4-6-当前目录-环境变量" aria-label="Permalink to &quot;4.6 当前目录 / 环境变量&quot;">​</a></h3><div class="language-kdl vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">kdl</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>layout {</span></span>
<span class="line"><span>  pane split_direction=&quot;vertical&quot; {</span></span>
<span class="line"><span>    pane {</span></span>
<span class="line"><span>      cwd &quot;src/api&quot;                    // 这个 pane 的工作目录</span></span>
<span class="line"><span>      command &quot;go&quot;</span></span>
<span class="line"><span>      args &quot;run&quot; &quot;main.go&quot;</span></span>
<span class="line"><span>    }</span></span>
<span class="line"><span>    pane {</span></span>
<span class="line"><span>      cwd &quot;src/web&quot;</span></span>
<span class="line"><span>      command &quot;npm&quot;</span></span>
<span class="line"><span>      args &quot;run&quot; &quot;dev&quot;</span></span>
<span class="line"><span>    }</span></span>
<span class="line"><span>  }</span></span>
<span class="line"><span>}</span></span></code></pre></div><p><strong>这就是 layout 真正吃香的地方</strong>——把&quot;启动一个项目所需的所有终端&quot;用一份文件描述,<strong>任何人 clone 后一行命令进入完整工作环境</strong>。</p><hr><h2 id="五、floating-pane-tmux-短期追不上的体验" tabindex="-1">五、floating pane:tmux 短期追不上的体验 <a class="header-anchor" href="#五、floating-pane-tmux-短期追不上的体验" aria-label="Permalink to &quot;五、floating pane:tmux 短期追不上的体验&quot;">​</a></h2><h3 id="_5-1-什么是-floating-pane" tabindex="-1">5.1 什么是 floating pane <a class="header-anchor" href="#_5-1-什么是-floating-pane" aria-label="Permalink to &quot;5.1 什么是 floating pane&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>普通 pane(tiled):</span></span>
<span class="line"><span>   ┌─────────┬─────────┐</span></span>
<span class="line"><span>   │         │         │</span></span>
<span class="line"><span>   │  pane 1 │  pane 2 │</span></span>
<span class="line"><span>   │         │         │</span></span>
<span class="line"><span>   └─────────┴─────────┘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>floating pane:</span></span>
<span class="line"><span>   ┌─────────────────────┐</span></span>
<span class="line"><span>   │  pane 1             │</span></span>
<span class="line"><span>   │      ┌──────────┐   │</span></span>
<span class="line"><span>   │      │ floating │   │   ← 浮在上面,可以拖拽 / resize</span></span>
<span class="line"><span>   │      │  pane    │   │</span></span>
<span class="line"><span>   │      └──────────┘   │</span></span>
<span class="line"><span>   └─────────────────────┘</span></span></code></pre></div><p><strong>Zellij 的 Alt-f 一键切换 floating</strong>——把当前 pane 转成 floating,或者从 floating 转回 tiled。</p><h3 id="_5-2-实际场景" tabindex="-1">5.2 实际场景 <a class="header-anchor" href="#_5-2-实际场景" aria-label="Permalink to &quot;5.2 实际场景&quot;">​</a></h3><p><strong>场景 1:跑临时命令不破坏 layout</strong></p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>你 zellij --layout dev 起来了一个 4-pane 的开发工作台</span></span>
<span class="line"><span>突然想跑一下 \`htop\` 看下资源占用</span></span>
<span class="line"><span></span></span>
<span class="line"><span>传统做法(tmux):</span></span>
<span class="line"><span>   - 在某个 pane 里 htop,看完关掉</span></span>
<span class="line"><span>   - 但那个 pane 的工作就被打断了</span></span>
<span class="line"><span>   - 或者 prefix + c 新开 window,看完关掉,工作台被切走</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Zellij 做法:</span></span>
<span class="line"><span>   - Alt-n 新开一个 pane,Alt-f 变成 floating</span></span>
<span class="line"><span>   - 在 floating pane 里跑 htop</span></span>
<span class="line"><span>   - 看完 Alt-w 关掉,工作台没动</span></span></code></pre></div><p><strong>场景 2:Claude Code 临时输入</strong></p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>你工作台 4 个 pane:nvim、test、logs、Claude Code</span></span>
<span class="line"><span>突然想问 Claude 一个问题,但又不想切到 Claude pane(切走 nvim 焦点)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Zellij:Alt-f 新开 floating,在里面 claude 起一个临时 chat</span></span>
<span class="line"><span>       问完关掉,nvim 焦点没动</span></span>
<span class="line"><span></span></span>
<span class="line"><span>tmux:  prefix + B 弹 popup(3.2+),功能上能用但 UX 粗糙</span></span>
<span class="line"><span>       popup 不带可拖拽边框,resize 麻烦</span></span></code></pre></div><p><strong>场景 3:debug 时看一下 git log</strong></p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>你在写代码,突然想确认上一个 commit 改了什么</span></span>
<span class="line"><span>不想切 pane,不想新开 tab</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Zellij:Alt-f → 进 floating → git log -p → 看完 Alt-w</span></span>
<span class="line"><span>       全程不影响主工作区</span></span></code></pre></div><h3 id="_5-3-tmux-的-display-popup" tabindex="-1">5.3 tmux 的 display-popup <a class="header-anchor" href="#_5-3-tmux-的-display-popup" aria-label="Permalink to &quot;5.3 tmux 的 display-popup&quot;">​</a></h3><p>tmux 3.2 加了 <code>display-popup -E</code>,<strong>功能上能开 popup</strong>,但和 Zellij 的 floating 有几个差异:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>tmux display-popup                       Zellij floating</span></span>
<span class="line"><span>─────────────────────────────────────────────────────────</span></span>
<span class="line"><span>启动                                     启动</span></span>
<span class="line"><span>  tmux display-popup -E &quot;htop&quot;             Alt-n + Alt-f</span></span>
<span class="line"><span></span></span>
<span class="line"><span>弹出位置                                 弹出位置</span></span>
<span class="line"><span>  屏幕中央(固定)                          最后位置(可记忆)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>resize                                   resize</span></span>
<span class="line"><span>  -w 80% -h 80%(启动时配)                 Alt-n + Alt-+/- 实时</span></span>
<span class="line"><span></span></span>
<span class="line"><span>多个 popup                               多个 floating</span></span>
<span class="line"><span>  ✗(同时只能一个)                         ✓(可以多个)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>边框                                     边框</span></span>
<span class="line"><span>  默认没有                                 默认有,有标题</span></span>
<span class="line"><span></span></span>
<span class="line"><span>转 tiled                                 转 tiled</span></span>
<span class="line"><span>  ✗(关掉就没了)                          Alt-f 切换</span></span></code></pre></div><p><strong>tmux 的 popup 是&quot;临时弹窗&quot;,Zellij 的 floating 是&quot;独立 pane&quot;</strong>——前者用完即抛,后者是工作台的一等公民。<strong>这一项 Zellij 短期内 tmux 追不上</strong>。</p><hr><h2 id="六、session-模型-zellij-默认更对新人友好" tabindex="-1">六、session 模型:Zellij 默认更对新人友好 <a class="header-anchor" href="#六、session-模型-zellij-默认更对新人友好" aria-label="Permalink to &quot;六、session 模型:Zellij 默认更对新人友好&quot;">​</a></h2><h3 id="_6-1-两边的-session-模型对比" tabindex="-1">6.1 两边的 session 模型对比 <a class="header-anchor" href="#_6-1-两边的-session-模型对比" aria-label="Permalink to &quot;6.1 两边的 session 模型对比&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>tmux                                  Zellij</span></span>
<span class="line"><span>─────────────────────────────────────────────────</span></span>
<span class="line"><span>daemon(tmux server)                   daemon(zellij server)</span></span>
<span class="line"><span>   ↓                                       ↓</span></span>
<span class="line"><span>session 1, 2, 3...                      session 1, 2, 3...</span></span>
<span class="line"><span>   ↓                                       ↓</span></span>
<span class="line"><span>window 1, 2, 3...                       tab 1, 2, 3...</span></span>
<span class="line"><span>   ↓                                       ↓</span></span>
<span class="line"><span>pane 1, 2, 3...                         pane 1, 2, 3...</span></span>
<span class="line"><span></span></span>
<span class="line"><span>attach 行为差异:</span></span>
<span class="line"><span>tmux                                  zellij</span></span>
<span class="line"><span>   tmux new -s work                        zellij -s work       (create or attach)</span></span>
<span class="line"><span>   tmux attach -t work                     zellij attach work</span></span>
<span class="line"><span>   tmux                                    zellij              (attach to last)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>默认 zellij 命令的语义:</span></span>
<span class="line"><span>   - 有 default session → attach 它</span></span>
<span class="line"><span>   - 没有 → 创建 default 并 attach</span></span>
<span class="line"><span></span></span>
<span class="line"><span>默认 tmux 命令的语义:</span></span>
<span class="line"><span>   - 总是新建(0, 1, 2...)</span></span>
<span class="line"><span>   - attach 要显式 \`tmux a -t name\`</span></span></code></pre></div><p><strong>Zellij 的默认更对新人友好</strong>:你 <code>zellij</code> 直接进了上次的工作,不用记 session 名;tmux 的默认是&quot;新开&quot;,新人很容易开 5 个空 session 都不知道。</p><h3 id="_6-2-detach-attach" tabindex="-1">6.2 detach / attach <a class="header-anchor" href="#_6-2-detach-attach" aria-label="Permalink to &quot;6.2 detach / attach&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># tmux</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">Ctrl-B</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> d</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">              # detach</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">tmux</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> attach</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -t</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> work</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">   # attach</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">tmux</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ls</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">               # list sessions</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Zellij</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">Ctrl-o</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> d</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">              # detach</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">zellij</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> attach</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> work</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # attach</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">zellij</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> list-sessions</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  # list</span></span></code></pre></div><p><strong>功能完全对等</strong>——这是 multiplexer 的核心,两边都做得很稳。</p><h3 id="_6-3-远端-attach-的差异" tabindex="-1">6.3 远端 attach 的差异 <a class="header-anchor" href="#_6-3-远端-attach-的差异" aria-label="Permalink to &quot;6.3 远端 attach 的差异&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>ssh user@server                          ssh user@server</span></span>
<span class="line"><span>tmux a -t work                           zellij attach work</span></span>
<span class="line"><span>   ↓                                        ↓</span></span>
<span class="line"><span>工作了 4 小时                             工作了 4 小时</span></span>
<span class="line"><span>   ↓                                        ↓</span></span>
<span class="line"><span>SSH 掉                                    SSH 掉</span></span>
<span class="line"><span>   ↓                                        ↓</span></span>
<span class="line"><span>重新 ssh user@server                      重新 ssh user@server</span></span>
<span class="line"><span>tmux a -t work                           zellij attach work</span></span>
<span class="line"><span>   ↓                                        ↓</span></span>
<span class="line"><span>原样恢复 ★★★★★                            原样恢复 ★★★★★</span></span></code></pre></div><p><strong>这一层两边完全对等</strong>——只要远端有 zellij/tmux daemon 在跑,attach 就是无缝的。<strong>唯一的差异</strong>:<strong>远端有没有装 Zellij</strong>——这就是上一节说的&quot;Zellij 最大的硬伤&quot;。</p><hr><h2 id="七、何时选-zellij-何时继续-tmux" tabindex="-1">七、何时选 Zellij,何时继续 tmux <a class="header-anchor" href="#七、何时选-zellij-何时继续-tmux" aria-label="Permalink to &quot;七、何时选 Zellij,何时继续 tmux&quot;">​</a></h2><h3 id="_7-1-选-zellij-的场景" tabindex="-1">7.1 选 Zellij 的场景 <a class="header-anchor" href="#_7-1-选-zellij-的场景" aria-label="Permalink to &quot;7.1 选 Zellij 的场景&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>□ 你从来没用过 multiplexer,2026 年从零开始</span></span>
<span class="line"><span>   - 上手成本是 tmux 的 1/3</span></span>
<span class="line"><span>   - 默认配置就好用</span></span>
<span class="line"><span>   - 不用花一周学 prefix 心智</span></span>
<span class="line"><span></span></span>
<span class="line"><span>□ 你培训团队新人 / onboarding</span></span>
<span class="line"><span>   - hint 栏让新人不用问&quot;按什么键&quot;</span></span>
<span class="line"><span>   - KDL layout 可以 check in,团队共享</span></span>
<span class="line"><span>   - 新人 30 分钟有完整工作台</span></span>
<span class="line"><span></span></span>
<span class="line"><span>□ 你喜欢声明式配置</span></span>
<span class="line"><span>   - KDL 比 .tmux.conf 可读 10 倍</span></span>
<span class="line"><span>   - 团队工作流可以版本化</span></span>
<span class="line"><span>   - 项目级 layout 是 docker-compose 之于 docker run</span></span>
<span class="line"><span></span></span>
<span class="line"><span>□ 你做本地开发为主,远端 SSH 少</span></span>
<span class="line"><span>   - 80% 时间在本地,Zellij 装一次就好</span></span>
<span class="line"><span>   - 不用担心&quot;远端没装&quot;的问题</span></span>
<span class="line"><span></span></span>
<span class="line"><span>□ 你重度依赖 floating pane</span></span>
<span class="line"><span>   - htop / 临时命令 / Claude chat 都用 floating</span></span>
<span class="line"><span>   - tmux 的 popup 体验差 5 倍</span></span></code></pre></div><h3 id="_7-2-选-tmux-的场景" tabindex="-1">7.2 选 tmux 的场景 <a class="header-anchor" href="#_7-2-选-tmux-的场景" aria-label="Permalink to &quot;7.2 选 tmux 的场景&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>□ 你已经会 tmux(沉没成本 + 生态)</span></span>
<span class="line"><span>   - 已经把 .tmux.conf 调舒服了</span></span>
<span class="line"><span>   - tmux-resurrect / Catppuccin theme 都装好了</span></span>
<span class="line"><span>   - 迁移到 Zellij 边际收益不大</span></span>
<span class="line"><span></span></span>
<span class="line"><span>□ 你做远端 SRE / AI infra</span></span>
<span class="line"><span>   - 80% 工作在远端,Zellij 装麻烦</span></span>
<span class="line"><span>   - 远端机器 tmux 默认装的概率高 20 倍</span></span>
<span class="line"><span>   - SSH 进堡垒机直接 \`tmux a\` 是肌肉记忆</span></span>
<span class="line"><span></span></span>
<span class="line"><span>□ 你重度依赖插件</span></span>
<span class="line"><span>   - tmuxinator(layout 启动)</span></span>
<span class="line"><span>   - tmux-resurrect / tmux-continuum(session 持久化)</span></span>
<span class="line"><span>   - vim-tmux-navigator(vim 和 tmux 切换)</span></span>
<span class="line"><span>   - Catppuccin / Dracula / Gruvbox 主题</span></span>
<span class="line"><span>   - 这些 Zellij 短期内补不齐</span></span>
<span class="line"><span></span></span>
<span class="line"><span>□ 你的团队已经在用 tmux</span></span>
<span class="line"><span>   - 团队 dotfiles 都是 .tmux.conf</span></span>
<span class="line"><span>   - 一起 onboarding 时用 tmux 一致</span></span>
<span class="line"><span>   - 迁移成本(每人重新学习)&gt; 切换收益</span></span>
<span class="line"><span></span></span>
<span class="line"><span>□ 你的环境资源极小</span></span>
<span class="line"><span>   - ARM 嵌入式 / Alpine 容器</span></span>
<span class="line"><span>   - tmux 5MB vs Zellij 30MB,差 6 倍</span></span>
<span class="line"><span>   - 资源紧张时 tmux 更友好</span></span></code></pre></div><h3 id="_7-3-决策树" tabindex="-1">7.3 决策树 <a class="header-anchor" href="#_7-3-决策树" aria-label="Permalink to &quot;7.3 决策树&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>你之前用过 tmux 吗?</span></span>
<span class="line"><span>   └─ 用过,且配舒服了</span></span>
<span class="line"><span>      └─ 你 80% 时间在远端吗?</span></span>
<span class="line"><span>         ├─ 是 → 继续 tmux</span></span>
<span class="line"><span>         └─ 否</span></span>
<span class="line"><span>            └─ 你想试 Zellij 吗?</span></span>
<span class="line"><span>               ├─ 想 → 试用 1 周,值得就切,否则回 tmux</span></span>
<span class="line"><span>               └─ 不想 → 继续 tmux,这条 Zellij 没必要</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   └─ 没用过,或没配明白</span></span>
<span class="line"><span>      └─ 你 80% 时间在远端吗?</span></span>
<span class="line"><span>         ├─ 是 → 学 tmux(远端的事实标准)</span></span>
<span class="line"><span>         └─ 否 → 学 Zellij(上手快 3 倍)</span></span></code></pre></div><p><strong>这个决策树回答了&quot;该不该迁移&quot;</strong>——大多数应用工程师本地为主,<strong>Zellij 是更合理的选择</strong>;SRE / AI infra 远端为主,<strong>tmux 仍是事实标准</strong>。<strong>两边都装 + 频繁切换,是最差的方案</strong>(下一节展开)。</p><hr><h2 id="八、混用问题-为什么-两个都装-反而最糟" tabindex="-1">八、混用问题:为什么&quot;两个都装&quot;反而最糟 <a class="header-anchor" href="#八、混用问题-为什么-两个都装-反而最糟" aria-label="Permalink to &quot;八、混用问题:为什么&quot;两个都装&quot;反而最糟&quot;">​</a></h2><h3 id="_8-1-肌肉记忆的成本" tabindex="-1">8.1 肌肉记忆的成本 <a class="header-anchor" href="#_8-1-肌肉记忆的成本" aria-label="Permalink to &quot;8.1 肌肉记忆的成本&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>学一个 multiplexer 到&quot;肌肉记忆&quot;流畅:</span></span>
<span class="line"><span>   - 第 1 周:勉强能用,要看 cheatsheet</span></span>
<span class="line"><span>   - 第 1 个月:基本流畅,常用操作不查</span></span>
<span class="line"><span>   - 第 3 个月:开始写自己的 layout,深度内化</span></span>
<span class="line"><span>   - 第 6 个月:操作快到自己都不知道按了什么键</span></span>
<span class="line"><span></span></span>
<span class="line"><span>两个 multiplexer 都学到这个程度:</span></span>
<span class="line"><span>   - 需要的时间不是 2x,是 4-5x</span></span>
<span class="line"><span>   - 因为两套键位会互相干扰</span></span>
<span class="line"><span>   - 你 tmux 用了 prefix + l,Zellij 用了 Ctrl-p l,半年后你想切 pane,手指先 prefix 后 Ctrl-p 都按</span></span>
<span class="line"><span>   - 关键时刻按错键 → 看屏幕反应 → 重按 → 失败 → 烦躁</span></span></code></pre></div><p><strong>肌肉记忆是个&quot;原子操作&quot;——它不会被切换得很好</strong>。学语言可以同时学两门(中文 + 英文 + 日文),<strong>因为它们之间没有键位冲突</strong>;但 vim vs emacs / tmux vs Zellij,<strong>键位是同一套键盘</strong>,<strong>冲突是不可避免的</strong>。</p><h3 id="_8-2-实际看到的-混用悲剧" tabindex="-1">8.2 实际看到的&quot;混用悲剧&quot; <a class="header-anchor" href="#_8-2-实际看到的-混用悲剧" aria-label="Permalink to &quot;8.2 实际看到的&quot;混用悲剧&quot;&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>工程师 X 的电脑:</span></span>
<span class="line"><span>   - 本地装了 Zellij(听说新潮)</span></span>
<span class="line"><span>   - 远端用 tmux(服务器默认装)</span></span>
<span class="line"><span>   - 本地 zellij 的 prefix 是 Ctrl-p</span></span>
<span class="line"><span>   - 远端 tmux 的 prefix 是 Ctrl-a</span></span>
<span class="line"><span></span></span>
<span class="line"><span>X 本地工作:</span></span>
<span class="line"><span>   想切 pane,按 Ctrl-p h</span></span>
<span class="line"><span>   - 在 Zellij 里:正确,切到左 pane</span></span>
<span class="line"><span>   - 在 tmux 里:Ctrl-p 是 readline 的&quot;上一个命令&quot;,h 是普通字符</span></span>
<span class="line"><span>   - X 经常忘了自己在哪边,按错键</span></span>
<span class="line"><span></span></span>
<span class="line"><span>X 远端工作:</span></span>
<span class="line"><span>   想 detach,按 Ctrl-o d</span></span>
<span class="line"><span>   - 在 Zellij 里:正确,detach</span></span>
<span class="line"><span>   - 在 tmux 里:Ctrl-o 没绑,d 不是 prefix 后的命令</span></span>
<span class="line"><span>   - X 又按错了</span></span>
<span class="line"><span></span></span>
<span class="line"><span>半年后:X 既没把 Zellij 学到流畅,也没把 tmux 学到流畅</span></span>
<span class="line"><span>       两边都是&quot;勉强能用&quot;,关键时刻还是要查 cheatsheet</span></span></code></pre></div><p><strong>这是混用最大的代价</strong>——<strong>两边都没到肌肉记忆</strong>。</p><h3 id="_8-3-那-本地-zellij-远端-tmux-行不行" tabindex="-1">8.3 那&quot;本地 Zellij + 远端 tmux&quot;行不行 <a class="header-anchor" href="#_8-3-那-本地-zellij-远端-tmux-行不行" aria-label="Permalink to &quot;8.3 那&quot;本地 Zellij + 远端 tmux&quot;行不行&quot;">​</a></h3><p>这是网上常见的建议——&quot;本地用 Zellij 体验好,远端用 tmux 因为装了&quot;。<strong>听起来合理,但实操不行</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>理论:本地 Zellij 满足 UX 需求,远端 tmux 满足兼容性</span></span>
<span class="line"><span>实操:</span></span>
<span class="line"><span>   - 你本地工作占 X%,远端工作占 (100-X)%</span></span>
<span class="line"><span>   - 如果 X = 50,你两边各练一半,都不流畅</span></span>
<span class="line"><span>   - 如果 X = 80,你远端 20% 时也别扭(因为远端键位没练熟)</span></span>
<span class="line"><span>   - 如果 X = 20,你本地 Zellij 也没用熟(每天就用 1-2 小时)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   要么你大部分时间都在一边,要么就别想&quot;混用各取所长&quot;</span></span></code></pre></div><p><strong>真相</strong>:<strong>多 multiplexer 就是失败方案</strong>。<strong>选一个,投入半年,内化成肌肉记忆</strong>。</p><h3 id="_8-4-我的建议-选一个用到底" tabindex="-1">8.4 我的建议:选一个用到底 <a class="header-anchor" href="#_8-4-我的建议-选一个用到底" aria-label="Permalink to &quot;8.4 我的建议:选一个用到底&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>推荐路径 1(80% 本地工程师):</span></span>
<span class="line"><span>   - 学 Zellij,本地为主</span></span>
<span class="line"><span>   - 远端机器临时用 tmux 时,只用最基本的 attach / detach,不深入</span></span>
<span class="line"><span>   - 接受&quot;远端体验差&quot;作为代价</span></span>
<span class="line"><span></span></span>
<span class="line"><span>推荐路径 2(80% 远端工程师 / SRE):</span></span>
<span class="line"><span>   - 学 tmux,远端为主</span></span>
<span class="line"><span>   - 本地也用 tmux,保持肌肉记忆一致</span></span>
<span class="line"><span>   - 接受&quot;本地 UX 不如 Zellij&quot;作为代价</span></span>
<span class="line"><span></span></span>
<span class="line"><span>推荐路径 3(已经会 tmux):</span></span>
<span class="line"><span>   - 继续 tmux,不要折腾</span></span>
<span class="line"><span>   - Zellij 的 KDL layout 值得羡慕,但不值得迁移</span></span>
<span class="line"><span>   - 沉没成本 + 生态优势,tmux 是稳的</span></span></code></pre></div><p><strong>关键判断</strong>:<strong>你 80% 时间在哪边,就选哪边的工具</strong>。本地为主选 Zellij(享 UX),远端为主选 tmux(享生态)。<strong>不要&quot;各取所长&quot;,会两边都差</strong>。</p><hr><h2 id="九、wezterm-的-multiplexer-模式-还要不要-tmux-zellij" tabindex="-1">九、WezTerm 的 multiplexer 模式:还要不要 tmux/Zellij <a class="header-anchor" href="#九、wezterm-的-multiplexer-模式-还要不要-tmux-zellij" aria-label="Permalink to &quot;九、WezTerm 的 multiplexer 模式:还要不要 tmux/Zellij&quot;">​</a></h2><p>2026 年新的变量:<strong>WezTerm 内置 multiplexer</strong>——它既是终端模拟器,又是 multiplexer,<strong>你装 WezTerm 之后理论上不需要 tmux/Zellij</strong>。</p><h3 id="_9-1-wezterm-的-multiplexer-长什么样" tabindex="-1">9.1 WezTerm 的 multiplexer 长什么样 <a class="header-anchor" href="#_9-1-wezterm-的-multiplexer-长什么样" aria-label="Permalink to &quot;9.1 WezTerm 的 multiplexer 长什么样&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>WezTerm</span></span>
<span class="line"><span>   ├─ Tab(类似 tmux window)</span></span>
<span class="line"><span>   │  └─ Pane(split 出来的窗格)</span></span>
<span class="line"><span>   │</span></span>
<span class="line"><span>   ├─ Domain(类似 multiplex server)</span></span>
<span class="line"><span>   │  ├─ Local domain(本机)</span></span>
<span class="line"><span>   │  └─ SSH domain(远端机器)</span></span>
<span class="line"><span>   │</span></span>
<span class="line"><span>   └─ Workspace(类似 tmux session)</span></span></code></pre></div><p><strong>WezTerm 自己就是 multiplexer</strong>——split 窗格、tab、workspace、远端 attach,全部内置。<strong>而且它的远端 multiplex 比 tmux 更进一步</strong>:你 SSH 到远端机器,<strong>远端不需要装 tmux</strong>,WezTerm 在远端跑一个 mux server,<strong>所有窗格管理在客户端</strong>。</p><h3 id="_9-2-wezterm-vs-tmux-的差异" tabindex="-1">9.2 WezTerm vs tmux 的差异 <a class="header-anchor" href="#_9-2-wezterm-vs-tmux-的差异" aria-label="Permalink to &quot;9.2 WezTerm vs tmux 的差异&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>              tmux                          WezTerm mux</span></span>
<span class="line"><span>─────────────────────────────────────────────────────────</span></span>
<span class="line"><span>窗格管理       tmux daemon                   WezTerm 客户端</span></span>
<span class="line"><span></span></span>
<span class="line"><span>远端依赖       远端要装 tmux                  远端只要 WezTerm mux server</span></span>
<span class="line"><span></span></span>
<span class="line"><span>配置           .tmux.conf                    Lua(wezterm.lua)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>图形           ASCII / Sixel                 GPU 渲染 + 图像协议</span></span>
<span class="line"><span></span></span>
<span class="line"><span>GUI / 字体     在终端模拟器                   自己就是终端模拟器</span></span>
<span class="line"><span></span></span>
<span class="line"><span>detach         ✓                             ✓</span></span></code></pre></div><p><strong>WezTerm 的卖点</strong>:<strong>字体 / 图形 / 主题 / multiplexer 全在一个程序里,不用 tmux</strong>。</p><h3 id="_9-3-那为什么-wezterm-没杀死-tmux" tabindex="-1">9.3 那为什么 WezTerm 没杀死 tmux <a class="header-anchor" href="#_9-3-那为什么-wezterm-没杀死-tmux" aria-label="Permalink to &quot;9.3 那为什么 WezTerm 没杀死 tmux&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>原因 1:WezTerm 远端 mux 体验还不够稳</span></span>
<span class="line"><span>   - tmux 的 detach/attach 稳了 18 年</span></span>
<span class="line"><span>   - WezTerm 的 mux 是 2021 后的功能,bug 还有</span></span>
<span class="line"><span></span></span>
<span class="line"><span>原因 2:WezTerm 锁定了终端模拟器</span></span>
<span class="line"><span>   - 你用 WezTerm mux,必须 WezTerm 客户端</span></span>
<span class="line"><span>   - 你想用 iTerm2 / Alacritty / Ghostty,WezTerm mux 不能用</span></span>
<span class="line"><span>   - 而 tmux 跟终端模拟器解耦,任何终端都能用</span></span>
<span class="line"><span></span></span>
<span class="line"><span>原因 3:服务器侧依然 tmux 是默认</span></span>
<span class="line"><span>   - 别人的机器你不能要求装 WezTerm mux</span></span>
<span class="line"><span>   - tmux 几乎所有 Linux 装好了</span></span>
<span class="line"><span></span></span>
<span class="line"><span>原因 4:配置门槛</span></span>
<span class="line"><span>   - tmux .conf 比 wezterm.lua 简单</span></span>
<span class="line"><span>   - 你想用 mux 还要写 Lua</span></span></code></pre></div><p><strong>结论</strong>:<strong>WezTerm mux 是&quot;备选项&quot;,不是&quot;主流方案&quot;</strong>。如果你已经选定 WezTerm 作为终端模拟器,<strong>可以试一下它的 mux 模式,看看够不够用</strong>;但<strong>不要因为 WezTerm 有 mux 就放弃 tmux/Zellij</strong>——前者绑定客户端,后者跨终端模拟器。</p><p><strong>简单粗暴的判断</strong>:<strong>WezTerm mux 适合&quot;我永远只用 WezTerm 一个终端&quot;的人</strong>——这种人比想象的少。</p><hr><h2 id="十、反对的写法" tabindex="-1">十、反对的写法 <a class="header-anchor" href="#十、反对的写法" aria-label="Permalink to &quot;十、反对的写法&quot;">​</a></h2><p>这一节列我看到的&quot;做错了&quot;的几种姿势——</p><h3 id="_10-1-看新就跳-tmux-→-zellij" tabindex="-1">10.1 看新就跳 tmux → Zellij <a class="header-anchor" href="#_10-1-看新就跳-tmux-→-zellij" aria-label="Permalink to &quot;10.1 看新就跳 tmux → Zellij&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>反面教材:</span></span>
<span class="line"><span>   工程师 A 用了 5 年 tmux,配置 200 行,所有插件齐全</span></span>
<span class="line"><span>   听说 Zellij 新,周末花了 4 小时迁移</span></span>
<span class="line"><span>   - .tmux.conf 200 行 → 重新写 KDL</span></span>
<span class="line"><span>   - tmux-resurrect → Zellij 没对应方案,session 持久化没了</span></span>
<span class="line"><span>   - Catppuccin theme → Zellij 内置的不太一样</span></span>
<span class="line"><span>   - vim-tmux-navigator → 没有对应 plugin</span></span>
<span class="line"><span>   - 团队其他人还在 tmux,共享 layout 用不上</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3 个月后,A 偷偷切回 tmux</span></span>
<span class="line"><span>   - Zellij 体验确实好,但生态短板让他无法工作</span></span>
<span class="line"><span>   - 沉没成本 + 团队不一致 = 切换的隐性代价远超预期</span></span></code></pre></div><p><strong>教训</strong>:<strong>已经会 tmux 的工程师,不要因为&quot;Zellij 看起来更现代&quot;就迁移</strong>——切换成本 = 200 行 conf 重写 + 5 年插件依赖重建 + 团队协作摩擦 + 3 个月不顺手。<strong>你节省的&quot;上手时间&quot;是 0(你已经会 tmux),你失去的是 5 年沉淀</strong>。</p><p><strong>只有一种情况你该迁移</strong>:<strong>你的工作模式发生根本变化</strong>——比如以前 80% 远端,现在 80% 本地。否则别动。</p><h3 id="_10-2-zellij-tmux-都装-频繁切换" tabindex="-1">10.2 Zellij + tmux 都装 + 频繁切换 <a class="header-anchor" href="#_10-2-zellij-tmux-都装-频繁切换" aria-label="Permalink to &quot;10.2 Zellij + tmux 都装 + 频繁切换&quot;">​</a></h3><p>(已在第八节展开,不再重复)</p><p><strong>核心</strong>:<strong>你的肌肉记忆是稀缺资源,不要分给两个工具</strong>。</p><h3 id="_10-3-在-server-上装-zellij-看新" tabindex="-1">10.3 在 server 上装 Zellij 看新 <a class="header-anchor" href="#_10-3-在-server-上装-zellij-看新" aria-label="Permalink to &quot;10.3 在 server 上装 Zellij 看新&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>反面教材:</span></span>
<span class="line"><span>   工程师 B 在公司开发机上装了 Zellij,觉得本地用着爽,远端也想要</span></span>
<span class="line"><span>   - cargo install zellij,编译 12 分钟</span></span>
<span class="line"><span>   - 装完一周,公司开发机重装(更新)</span></span>
<span class="line"><span>   - Zellij 又没了</span></span>
<span class="line"><span>   - B 重装,继续 12 分钟编译</span></span>
<span class="line"><span>   - 一个月内重装 3 次,B 烦了</span></span>
<span class="line"><span></span></span>
<span class="line"><span>教训:服务器上 tmux 仍然是默认</span></span>
<span class="line"><span>   - 你装 Zellij 在服务器,每次重装都要装一遍</span></span>
<span class="line"><span>   - 团队其他人 ssh 进同一台机器,tmux 用着,你 Zellij 用着,冲突</span></span>
<span class="line"><span>   - 服务器是&quot;共享的、临时的、被重置的&quot;,别投入个人偏好</span></span></code></pre></div><p><strong>服务器是公共空间,本地是私人空间</strong>——前者用最大公约数(tmux),后者可以装自己喜欢的(Zellij)。<strong>别用个人偏好污染服务器</strong>。</p><h3 id="_10-4-抄-我的-zellij-dotfiles-几百行" tabindex="-1">10.4 抄&quot;我的 Zellij dotfiles&quot;几百行 <a class="header-anchor" href="#_10-4-抄-我的-zellij-dotfiles-几百行" aria-label="Permalink to &quot;10.4 抄&quot;我的 Zellij dotfiles&quot;几百行&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>反面教材:</span></span>
<span class="line"><span>   工程师 C 装了 Zellij,觉得不爽,Google 搜 &quot;zellij dotfiles&quot;</span></span>
<span class="line"><span>   找到一份 500 行 KDL,抄回来</span></span>
<span class="line"><span>   - 主题被改了 → 看不懂自己的颜色</span></span>
<span class="line"><span>   - 键位被改了 → hint 栏说的和实际按的对不上</span></span>
<span class="line"><span>   - layout 不是自己工作流 → 启动出来不对劲</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2 周后,C 删了配置,回到默认</span></span></code></pre></div><p><strong>教训</strong>:<strong>Zellij 的卖点之一就是&quot;默认好用&quot;</strong>——你抄别人的 500 行配置,<strong>等于把 Zellij 当 tmux 用</strong>,失去 Zellij 自己的优势。<strong>Zellij 配置应该极简</strong>——30-50 行解决 80% 需求,<strong>改 100 行就是过度配置</strong>。</p><h3 id="_10-5-zellij-装上就完了不学心智" tabindex="-1">10.5 &quot;Zellij 装上就完了不学心智&quot; <a class="header-anchor" href="#_10-5-zellij-装上就完了不学心智" aria-label="Permalink to &quot;10.5 &quot;Zellij 装上就完了不学心智&quot;&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>反面教材:</span></span>
<span class="line"><span>   工程师 D 装了 Zellij,看 hint 栏按键就能用</span></span>
<span class="line"><span>   - 不知道有 KDL layout</span></span>
<span class="line"><span>   - 不知道 floating pane</span></span>
<span class="line"><span>   - 不知道 session 模型</span></span>
<span class="line"><span>   - 用了 1 年还是 &quot;Ctrl-p 切 pane,Ctrl-t 切 tab&quot;</span></span>
<span class="line"><span>   - 工作流和 tmux 没区别,Zellij 的优势没用上</span></span>
<span class="line"><span></span></span>
<span class="line"><span>教训:Zellij 的&quot;易用&quot;是入口低,不是终点低</span></span>
<span class="line"><span>   - 进门 30 秒,但要用好还是要学心智</span></span>
<span class="line"><span>   - 不学 layout / floating / 多 tab,Zellij 就是&quot;好看一点的 tmux&quot;</span></span></code></pre></div><p><strong>易用 ≠ 不学</strong>——所有工具都有上限,Zellij 的上限在 KDL layout 和 floating,<strong>不学这些等于浪费它的卖点</strong>。</p><h3 id="_10-6-用-tmux-但不写-tmux-conf" tabindex="-1">10.6 用 tmux 但不写 .tmux.conf <a class="header-anchor" href="#_10-6-用-tmux-但不写-tmux-conf" aria-label="Permalink to &quot;10.6 用 tmux 但不写 .tmux.conf&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>反面教材:</span></span>
<span class="line"><span>   工程师 E 装了 tmux,觉得 prefix Ctrl-B 不顺手</span></span>
<span class="line"><span>   但不写 .tmux.conf 改,而是&quot;忍着用&quot;</span></span>
<span class="line"><span>   - 每次按 Ctrl-B 食指都要抬一下,一天上百次</span></span>
<span class="line"><span>   - copy-mode 用 emacs 键位,vi 习惯的 E 总按错</span></span>
<span class="line"><span>   - 默认状态栏丑,但不改</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3 年后,E 仍然觉得 tmux 难用,迁去 Zellij</span></span>
<span class="line"><span></span></span>
<span class="line"><span>教训:tmux 默认配置是反人类的,不改你不知道它能多好</span></span>
<span class="line"><span>   - 改 prefix + 改 split 键 + 改 copy-mode + 改状态栏,1 小时</span></span>
<span class="line"><span>   - 这 1 小时让 tmux 从&quot;难用&quot;变成&quot;真香&quot;</span></span>
<span class="line"><span>   - 不改就放弃,等于没用过 tmux</span></span></code></pre></div><p><strong>tmux 必须改默认配置</strong>——这是它的&quot;原罪&quot;。不改你永远看不到 tmux 的好。<strong>这也是为什么 Zellij 一开始就好用,而 tmux 要花时间配置</strong>。</p><hr><h2 id="十一、看完这一篇你应该能" tabindex="-1">十一、看完这一篇你应该能 <a class="header-anchor" href="#十一、看完这一篇你应该能" aria-label="Permalink to &quot;十一、看完这一篇你应该能&quot;">​</a></h2><ul><li><strong>决定该不该从 tmux 迁移到 Zellij</strong>——给出明确的&quot;是 / 否&quot;,不再&quot;两个都想用&quot;</li><li><strong>画一张 Zellij vs tmux 的 7 维度对照表</strong>——学习曲线 / 性能 / 生态 / layout / floating / 远端 / 可读</li><li><strong>写一份 30 行的 Zellij KDL layout</strong>——nvim + watch test + logs 三 pane,启动一行命令</li><li><strong>解释为什么&quot;两个都装 + 切换&quot;是最差的方案</strong>——肌肉记忆冲突 / 半年都不流畅</li><li><strong>辨别&quot;看新就跳&quot;的成本</strong>——5 年 tmux 不要为 Zellij 重写</li><li><strong>判断服务器是否该装 Zellij</strong>——99% 的答案是不该(服务器是公共空间)</li><li><strong>看到 WezTerm mux 时知道它是备选不是主流</strong>——绑定客户端 + 远端不稳</li><li><strong>解释 tmux 配置必须改默认才好用</strong>——不改 .tmux.conf 等于没用过 tmux</li></ul><hr><h2 id="十二、下一篇预告" tabindex="-1">十二、下一篇预告 <a class="header-anchor" href="#十二、下一篇预告" aria-label="Permalink to &quot;十二、下一篇预告&quot;">​</a></h2><p>这一篇讲的是 multiplexer 的&quot;工具选择&quot;,<strong>下一篇 <code>19-modal-editing的本质.md</code> 进入编辑器层</strong> ——</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>vim 用户被嘲笑&quot;键盘玄学&quot;</span></span>
<span class="line"><span>真相是:modal editing 不是快捷键技巧</span></span>
<span class="line"><span>       是&quot;把编辑文本做成一种语言&quot;</span></span>
<span class="line"><span>       </span></span>
<span class="line"><span>你说&quot;删一个单词&quot;(dw)</span></span>
<span class="line"><span>而不是按&quot;鼠标选中单词 + 按 delete&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>下一篇你会学到:</span></span>
<span class="line"><span>   - 命令 = 动词 + 范围 的可组合语法</span></span>
<span class="line"><span>   - text object(iw / ip / i&quot; / it)是 modal editing 的&quot;名词&quot;</span></span>
<span class="line"><span>   - Helix 把&quot;范围 → 动作&quot;翻过来的反 vim 设计</span></span>
<span class="line"><span>   - modal editing 在 IDE / 浏览器 / Obsidian 里的渗透</span></span>
<span class="line"><span>   - 为什么&quot;学 vim 三天放弃&quot;是认知误区</span></span></code></pre></div><p><strong>这一篇 + 下一篇 + 20 (Neovim 配置) + 21 (Helix) = 编辑器层完整答案</strong>。Multiplexer 决定&quot;工作台&quot;,编辑器决定&quot;打字的速度上限&quot;——前者一周内化,后者一年内化,<strong>都是终端工程师的硬通货</strong>。</p>`,192)])])}const g=n(e,[["render",t]]);export{d as __pageData,g as default};
