import{_ as a,H as n,f as p,i}from"./chunks/framework.BHvCMIhP.js";const d=JSON.parse('{"title":"Helix:开箱即用的 modal editor / 0 配置但生态弱","description":"","frontmatter":{},"headers":[],"relativePath":"../terminalLearning/21-Helix开箱即用.md","filePath":"../terminalLearning/21-Helix开箱即用.md","lastUpdated":1778574438000}'),l={name:"../terminalLearning/21-Helix开箱即用.md"};function e(t,s,h,o,c,r){return n(),p("div",null,[...s[0]||(s[0]=[i(`<h1 id="helix-开箱即用的-modal-editor-0-配置但生态弱" tabindex="-1">Helix:开箱即用的 modal editor / 0 配置但生态弱 <a class="header-anchor" href="#helix-开箱即用的-modal-editor-0-配置但生态弱" aria-label="Permalink to &quot;Helix:开箱即用的 modal editor / 0 配置但生态弱&quot;">​</a></h1><p>20 篇讲完 Neovim,问题是:<strong>Neovim 装 LazyVim 再配齐 LSP,最少也要 1-2 小时;真要会改 plugin spec,至少一周</strong>。这对很多人是劝退点——<strong>我只是想要个能写代码的 modal editor,为什么要学 Lua / lazy.nvim 的 ice 修饰符 / Tree-sitter parser 安装顺序?</strong></p><p><strong>Helix 是另一条路</strong>——2021 年出现,Rust 写,<strong>0 配置开箱</strong>:装上就有 LSP、Tree-sitter、多光标、完整快捷键提示、fuzzy file picker、git gutter、status line——<strong>所有 Neovim 要装 50 个 plugin 才有的东西,Helix 默认全有</strong>。配置文件就 20 行 TOML,<strong>从 Mac 复制到 Linux 表现完全一样</strong>。</p><p><strong>代价</strong>:<strong>没有 plugin 生态</strong>。你想加一个 AI 集成、想加一个 markdown preview、想加一个 vim-fugitive 那种 git 整合——<strong>目前 Helix 都没有</strong>。<strong>这不是&quot;Helix 没人用&quot;,是 Helix 设计哲学的主动选择</strong>——把&quot;插件能力&quot;收进编辑器内核,<strong>不开放 plugin API</strong>(2026 Steel / Scheme 方案还在做)。<strong>生态弱不是 bug 是 feature</strong>。</p><blockquote><p>一句话先记住:<strong>Helix 是&quot;我要 modal editor 但不想花周末配 Neovim&quot;的工程师的选择 — 0 配置开箱、内置 LSP / Tree-sitter,代价是 plugin 生态弱、不能往 IDE 方向无限扩</strong>。</p></blockquote><p>这一篇拆开讲:<strong>Helix 是什么 / Kakoune 这位祖师、selection-first 心智为什么反过来更好、30 个够日常用的基础操作、picker 一站式搜索、LSP 开箱、多光标实操、20 行 TOML 配置全说明、Helix vs Neovim 对比表、谁该用 Helix 谁仍该 Neovim、能不能混用、2026 Helix 在 modal editor 阵营的位置、反对的写法</strong>——读完你能在 30 分钟内判断:<strong>Helix 是不是你的选择,还是该回头继续投入 Neovim</strong>。</p><hr><h2 id="一、helix-是什么" tabindex="-1">一、Helix 是什么 <a class="header-anchor" href="#一、helix-是什么" aria-label="Permalink to &quot;一、Helix 是什么&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Helix:</span></span>
<span class="line"><span>   - 2021 年第一次 release,Rust 写</span></span>
<span class="line"><span>   - 受 Kakoune 启发(selection-first 范式)</span></span>
<span class="line"><span>   - 内置 LSP client、Tree-sitter、多光标、quickfix、picker</span></span>
<span class="line"><span>   - 不打算抄 vim:语法、快捷键、心智都不同</span></span>
<span class="line"><span>   - 一个二进制文件 25MB,启动 30ms</span></span>
<span class="line"><span>   - 2026 GitHub 32k+ star,活跃但比 Neovim 小一截</span></span></code></pre></div><h3 id="_1-1-时间线" tabindex="-1">1.1 时间线 <a class="header-anchor" href="#_1-1-时间线" aria-label="Permalink to &quot;1.1 时间线&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>2011  Kakoune  ← 法国人 Maxime Coste 写的&quot;selection-first&quot;编辑器</span></span>
<span class="line"><span>                  modal editing 但反 vim 来:范围 → 动词</span></span>
<span class="line"><span>                  小众但理念被一群人接受</span></span>
<span class="line"><span>2021  Helix    ← Rust 重写 Kakoune 思想 + 加 LSP + Tree-sitter</span></span>
<span class="line"><span>                  发布两年内 30k+ star</span></span>
<span class="line"><span>2023  Helix 23.03  ← config reload、debugger 集成开始</span></span>
<span class="line"><span>2024  Helix 24.07  ← 内置 inline diagnostics</span></span>
<span class="line"><span>2025  Helix 25.01  ← Steel plugin 系统开始实验性合并</span></span>
<span class="line"><span>                     (但 2026 仍未稳定,仍以&quot;零插件&quot;为主)</span></span></code></pre></div><p><strong>Helix 不是凭空出现的</strong>——它是 Kakoune 思想的工程化复活。Kakoune 火不起来的原因不是理念有问题,是<strong>工程实现不够现代</strong>(没 LSP、没 Tree-sitter、配置麻烦)。<strong>Helix 用 Rust + 现代工程把这套理念重新打了一次</strong>,这次 30k+ star 接住了。</p><h3 id="_1-2-与-vim-neovim-一句话区分" tabindex="-1">1.2 与 vim / Neovim 一句话区分 <a class="header-anchor" href="#_1-2-与-vim-neovim-一句话区分" aria-label="Permalink to &quot;1.2 与 vim / Neovim 一句话区分&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>vim:       modal editing 鼻祖,1991。配置语言 VimScript。</span></span>
<span class="line"><span>Neovim:    vim 的 Lua 化重写,LSP / Tree-sitter 内置,plugin 生态最强。</span></span>
<span class="line"><span>Helix:     另一支 modal 路线(selection-first),0 配置开箱。</span></span></code></pre></div><p><strong>核心差别</strong>:<strong>vim / Neovim 是&quot;动词在前&quot;</strong>(<code>dw</code> = delete word),<strong>Helix 是&quot;范围在前&quot;</strong>(<code>wd</code> = 选词然后 delete)。<strong>这个反转不是细节,是范式差</strong>——下一节展开。</p><h3 id="_1-3-安装" tabindex="-1">1.3 安装 <a class="header-anchor" href="#_1-3-安装" aria-label="Permalink to &quot;1.3 安装&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># macOS</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">brew</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> install</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> helix</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Linux (Arch)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">pacman</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -S</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> helix</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Linux (其他)</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 去 https://github.com/helix-editor/helix/releases 下二进制</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 启动命令是 hx,不是 helix</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">hx</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> file.py</span></span></code></pre></div><p><strong>首次启动你已经有</strong>:</p><ul><li>LSP(自动检测 PATH 里的 server)</li><li>Tree-sitter 高亮(预编译进二进制,80+ 种语言)</li><li>多光标</li><li>fuzzy file picker(<code>Space + f</code>)</li><li>git gutter</li><li>status line</li><li>which-key 风格的快捷键提示</li></ul><p><strong>没装任何 plugin</strong>。<strong>这就是 Helix 的卖点</strong>。</p><hr><h2 id="二、selection-first-心智-为什么反过来更好" tabindex="-1">二、selection-first 心智:为什么反过来更好 <a class="header-anchor" href="#二、selection-first-心智-为什么反过来更好" aria-label="Permalink to &quot;二、selection-first 心智:为什么反过来更好&quot;">​</a></h2><p>这一节是 Helix 跟 vim 心智最大的差别——<strong>讲不清楚这一点,你用 Helix 永远不顺手</strong>。</p><h3 id="_2-1-vim-的命令分发-动词-名词-动词在前" tabindex="-1">2.1 vim 的命令分发:动词 + 名词(动词在前) <a class="header-anchor" href="#_2-1-vim-的命令分发-动词-名词-动词在前" aria-label="Permalink to &quot;2.1 vim 的命令分发:动词 + 名词(动词在前)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>vim 里你打 \`dw\`:</span></span>
<span class="line"><span>   d     ← 动词:delete</span></span>
<span class="line"><span>   w     ← 范围:一个 word</span></span>
<span class="line"><span></span></span>
<span class="line"><span>时序:</span></span>
<span class="line"><span>   1. 你按 d           ← 进入 operator-pending 模式</span></span>
<span class="line"><span>   2. vim 等你输入范围  ← 屏幕上看不出来 d 已按</span></span>
<span class="line"><span>   3. 你按 w           ← 范围确定</span></span>
<span class="line"><span>   4. 立即执行 delete   ← 一个 word 没了</span></span>
<span class="line"><span></span></span>
<span class="line"><span>类似:</span></span>
<span class="line"><span>   cw  =  change word</span></span>
<span class="line"><span>   yw  =  yank word</span></span>
<span class="line"><span>   d3j =  delete 3 lines down</span></span>
<span class="line"><span>   ci( =  change inside parens</span></span></code></pre></div><p><strong>vim 的心智</strong>:<strong>&quot;我要做什么&quot;先想,然后&quot;对什么做&quot;</strong>——动词驱动。</p><p><strong>问题</strong>:<strong>按下 <code>d</code> 之后到按下 <code>w</code> 之前,屏幕没有反馈</strong>——你看不到 vim 现在想&quot;删什么&quot;。新手经常按了 <code>d</code> 然后停下来想&quot;我要删到哪&quot;,这中间是黑盒。</p><h3 id="_2-2-helix-的命令分发-名词-动词-范围在前" tabindex="-1">2.2 Helix 的命令分发:名词 + 动词(范围在前) <a class="header-anchor" href="#_2-2-helix-的命令分发-名词-动词-范围在前" aria-label="Permalink to &quot;2.2 Helix 的命令分发:名词 + 动词(范围在前)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Helix 里你打 \`wd\`:</span></span>
<span class="line"><span>   w     ← 范围:选中从当前到 word 末尾</span></span>
<span class="line"><span>   d     ← 动词:delete 选中的内容</span></span>
<span class="line"><span></span></span>
<span class="line"><span>时序:</span></span>
<span class="line"><span>   1. 你按 w           ← 屏幕立即出现&quot;从光标到 word 末尾&quot;的高亮选区</span></span>
<span class="line"><span>   2. 你看到选了什么   ← 视觉反馈!</span></span>
<span class="line"><span>   3. 你按 d           ← 选区被删除</span></span>
<span class="line"><span></span></span>
<span class="line"><span>类似:</span></span>
<span class="line"><span>   wc  =  选 word 然后 change(同 vim cw)</span></span>
<span class="line"><span>   wy  =  选 word 然后 yank(同 vim yw)</span></span>
<span class="line"><span>   3jd =  向下选 3 行然后 delete</span></span>
<span class="line"><span>   mi( + d  = match inside parens 然后 delete</span></span></code></pre></div><p><strong>Helix 的心智</strong>:<strong>先选,再操作</strong>——选区驱动。</p><p><strong>好处</strong>:<strong>每一步都有视觉反馈</strong>。你按 <code>w</code> 屏幕立刻高亮一段——选错了?改;选对了再按 <code>d</code>。<strong>所见即所删</strong>,不像 vim 是&quot;按完才知道&quot;。</p><h3 id="_2-3-一张对比图" tabindex="-1">2.3 一张对比图 <a class="header-anchor" href="#_2-3-一张对比图" aria-label="Permalink to &quot;2.3 一张对比图&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>任务:删一个 word</span></span>
<span class="line"><span></span></span>
<span class="line"><span>vim:</span></span>
<span class="line"><span>   光标在 |hello world</span></span>
<span class="line"><span>   按 d         ← 进入 operator-pending(屏幕无变化)</span></span>
<span class="line"><span>   按 w         ← word 范围确定 + 立即删除</span></span>
<span class="line"><span>              → world      ← hello 没了</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Helix:</span></span>
<span class="line"><span>   光标在 |hello world</span></span>
<span class="line"><span>   按 w         ← 选区出现:[hello] world(hello 高亮)</span></span>
<span class="line"><span>   你看到选了 hello,确认要删</span></span>
<span class="line"><span>   按 d         ← 删选区</span></span>
<span class="line"><span>              → world      ← hello 没了</span></span>
<span class="line"><span></span></span>
<span class="line"><span></span></span>
<span class="line"><span>任务:改括号内内容</span></span>
<span class="line"><span></span></span>
<span class="line"><span>vim:</span></span>
<span class="line"><span>   光标在 fn(arg|s)</span></span>
<span class="line"><span>   按 c         ← 进入 operator-pending</span></span>
<span class="line"><span>   按 i         ← inside 修饰符</span></span>
<span class="line"><span>   按 (         ← parens 范围</span></span>
<span class="line"><span>              → fn(|)  进入 insert,光标在括号内</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Helix:</span></span>
<span class="line"><span>   光标在 fn(arg|s)</span></span>
<span class="line"><span>   按 m i (     ← match inside parens</span></span>
<span class="line"><span>              → fn([args])  args 被选中</span></span>
<span class="line"><span>   按 c         ← 删选区进入 insert</span></span>
<span class="line"><span>              → fn(|)</span></span></code></pre></div><p><strong>Helix 的工作流多一个视觉确认步骤</strong>——<strong>操作可逆</strong>(选错了重新选),vim 是&quot;按 u 撤销才能改&quot;。</p><h3 id="_2-4-反过来的好处和坏处" tabindex="-1">2.4 反过来的好处和坏处 <a class="header-anchor" href="#_2-4-反过来的好处和坏处" aria-label="Permalink to &quot;2.4 反过来的好处和坏处&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>selection-first(Helix)的好处:</span></span>
<span class="line"><span>   ✓ 每步有视觉反馈,新手友好</span></span>
<span class="line"><span>   ✓ 多光标天然——选多个就同时操作</span></span>
<span class="line"><span>   ✓ 命令可组合性更直观(选好范围再换不同动词)</span></span>
<span class="line"><span>   ✓ Lisp / Scheme 风格(数据先于操作)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>selection-first 的坏处:</span></span>
<span class="line"><span>   ✗ 跟 vim 不兼容,muscle memory 全错</span></span>
<span class="line"><span>   ✗ 老 vim 用户切过来要重学(1-2 周)</span></span>
<span class="line"><span>   ✗ 复杂操作步骤数比 vim 多一两步</span></span>
<span class="line"><span>   ✗ &quot;选完再删&quot; 比 &quot;直接 dw&quot; 多按一个键</span></span></code></pre></div><p><strong>关键判断</strong>:你<strong>从来没学过 vim,Helix 的 selection-first 更直观</strong>;你<strong>学过 vim,Helix 让你 muscle memory 错乱</strong>——这是 Helix 阵营的核心矛盾。</p><hr><h2 id="三、helix-30-个基础操作-够日常用的子集" tabindex="-1">三、Helix 30 个基础操作:够日常用的子集 <a class="header-anchor" href="#三、helix-30-个基础操作-够日常用的子集" aria-label="Permalink to &quot;三、Helix 30 个基础操作:够日常用的子集&quot;">​</a></h2><p>不打算把整个 cheatsheet 抄一遍——<code>hx --tutor</code> 自带教程,<strong>这里只给&quot;日常 80% 操作用的 30 个键&quot;</strong>,记住这些 Helix 就能写代码了。</p><h3 id="_3-1-移动" tabindex="-1">3.1 移动 <a class="header-anchor" href="#_3-1-移动" aria-label="Permalink to &quot;3.1 移动&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>h j k l         上下左右(跟 vim 一致)</span></span>
<span class="line"><span>w b             向前 / 向后一个 word(并选中)</span></span>
<span class="line"><span>e               向前一个 word 末尾(并选中)</span></span>
<span class="line"><span>gg              文件开头</span></span>
<span class="line"><span>ge              文件末尾</span></span>
<span class="line"><span>0               行首</span></span>
<span class="line"><span>$               行尾</span></span>
<span class="line"><span>{ }             上 / 下一段</span></span>
<span class="line"><span>G               (用法和 vim 略不同,直接 跳行号 G)</span></span>
<span class="line"><span>:               进入 command mode</span></span></code></pre></div><h3 id="_3-2-选择" tabindex="-1">3.2 选择 <a class="header-anchor" href="#_3-2-选择" aria-label="Permalink to &quot;3.2 选择&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>w               选当前到 word 末尾</span></span>
<span class="line"><span>b               选当前到 word 开头(反向)</span></span>
<span class="line"><span>x               选当前整行</span></span>
<span class="line"><span>X               选当前行 + 向下扩展</span></span>
<span class="line"><span>%               选整个文件</span></span>
<span class="line"><span>;               缩到光标位置(取消选区)</span></span>
<span class="line"><span>,               合并所有选区为一个</span></span>
<span class="line"><span></span></span>
<span class="line"><span>mi w            match inside word(选词)</span></span>
<span class="line"><span>mi (            match inside parens</span></span>
<span class="line"><span>ma (            match around parens(包含括号本身)</span></span>
<span class="line"><span>mi &quot;            match inside double-quotes</span></span>
<span class="line"><span>mi t            match inside HTML tag</span></span>
<span class="line"><span></span></span>
<span class="line"><span>f x             find 字符 x(找下一个 x,光标停在 x 上)</span></span>
<span class="line"><span>t x             till 字符 x(找下一个 x,光标停在 x 前一位)</span></span>
<span class="line"><span>F x             同 f 反向</span></span>
<span class="line"><span>T x             同 t 反向</span></span></code></pre></div><h3 id="_3-3-操作-动词" tabindex="-1">3.3 操作(动词) <a class="header-anchor" href="#_3-3-操作-动词" aria-label="Permalink to &quot;3.3 操作(动词)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>d               删除选区(同 vim 的 d)</span></span>
<span class="line"><span>c               change 选区(删 + 进入 insert)</span></span>
<span class="line"><span>y               yank(复制)选区</span></span>
<span class="line"><span>p               paste 选区(在选区之后)</span></span>
<span class="line"><span>P               paste 选区(在选区之前)</span></span>
<span class="line"><span>u               undo</span></span>
<span class="line"><span>U               redo</span></span>
<span class="line"><span></span></span>
<span class="line"><span>i               进入 insert 模式(光标在选区开头)</span></span>
<span class="line"><span>a               进入 insert 模式(光标在选区末尾)</span></span>
<span class="line"><span>o               下方新行 + insert</span></span>
<span class="line"><span>O               上方新行 + insert</span></span>
<span class="line"><span></span></span>
<span class="line"><span>&gt;               缩进选区</span></span>
<span class="line"><span>&lt;               反缩进选区</span></span>
<span class="line"><span>=               自动格式化选区(LSP formatter)</span></span>
<span class="line"><span>~               切换大小写</span></span></code></pre></div><h3 id="_3-4-多光标" tabindex="-1">3.4 多光标 <a class="header-anchor" href="#_3-4-多光标" aria-label="Permalink to &quot;3.4 多光标&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>C               下一行同位置加一个光标</span></span>
<span class="line"><span>A-C             上一行同位置加一个光标(Alt + C)</span></span>
<span class="line"><span>*               把当前选区设为搜索 pattern</span></span>
<span class="line"><span>s               selection 内子选择</span></span>
<span class="line"><span>,               把多光标合并回一个</span></span>
<span class="line"><span></span></span>
<span class="line"><span>实操:批量改变量名</span></span>
<span class="line"><span>   1. 把光标停在变量名上</span></span>
<span class="line"><span>   2. 按 mi w 选中这个词</span></span>
<span class="line"><span>   3. 按 *  把它设为搜索 pattern</span></span>
<span class="line"><span>   4. 按 n  下一处(选中下一个相同的词)</span></span>
<span class="line"><span>   5. 重复 n 直到选够 / 按 A 选完所有匹配</span></span>
<span class="line"><span>   6. c 改名,所有选区同步改</span></span></code></pre></div><h3 id="_3-5-查找与命令" tabindex="-1">3.5 查找与命令 <a class="header-anchor" href="#_3-5-查找与命令" aria-label="Permalink to &quot;3.5 查找与命令&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>/               向下搜索</span></span>
<span class="line"><span>?               向上搜索</span></span>
<span class="line"><span>n               下一个匹配</span></span>
<span class="line"><span>N               上一个匹配</span></span>
<span class="line"><span>*               把当前选区作为搜索 pattern</span></span>
<span class="line"><span></span></span>
<span class="line"><span>:               进入 command mode</span></span>
<span class="line"><span>:w              保存</span></span>
<span class="line"><span>:q              退出</span></span>
<span class="line"><span>:w!             强制保存</span></span>
<span class="line"><span>:wq             保存并退出</span></span>
<span class="line"><span>:vsp            垂直分屏</span></span>
<span class="line"><span>:hsp            水平分屏</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Space           进入 picker(下节专讲)</span></span></code></pre></div><h3 id="_3-6-一张速查图" tabindex="-1">3.6 一张速查图 <a class="header-anchor" href="#_3-6-一张速查图" aria-label="Permalink to &quot;3.6 一张速查图&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌─────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│         Helix 30 键速查(够日常用)                      │</span></span>
<span class="line"><span>├─────────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>│ 移动:     h j k l   w b e   gg ge   0 $   { }          │</span></span>
<span class="line"><span>│ 选择:     w b e(选词) x(选行) mi/ma + ( [ { &quot; &#39;   │</span></span>
<span class="line"><span>│ 查找:     f F t T   /  ?   n N   *                     │</span></span>
<span class="line"><span>│ 动词:     d  c  y  p  u  U  ~  &gt;  &lt;  =                 │</span></span>
<span class="line"><span>│ 模式:     i  a  o  O  Esc                              │</span></span>
<span class="line"><span>│ 多光标:   C  AC  *  ,(合并)                          │</span></span>
<span class="line"><span>│ 命令:     :w  :q  :vsp                                  │</span></span>
<span class="line"><span>│ Picker:   Space + f / s / b / d / h                    │</span></span>
<span class="line"><span>└─────────────────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>这 30 个键</strong> + Helix 自带的 <code>hx --tutor</code> 30 分钟,你能写代码。<strong>比 vim 的入门门槛低很多</strong>——因为每步都有视觉反馈,你按错了立刻知道。</p><hr><h2 id="四、picker-fzf-telescope-在-helix-里内置" tabindex="-1">四、picker:fzf / Telescope 在 Helix 里内置 <a class="header-anchor" href="#四、picker-fzf-telescope-在-helix-里内置" aria-label="Permalink to &quot;四、picker:fzf / Telescope 在 Helix 里内置&quot;">​</a></h2><p><strong>picker</strong> 是 Helix 给你的&quot;fuzzy 找一切&quot;工具——按 <code>Space</code> 进入 prefix 菜单,然后选要找什么。</p><h3 id="_4-1-picker-列表" tabindex="-1">4.1 picker 列表 <a class="header-anchor" href="#_4-1-picker-列表" aria-label="Permalink to &quot;4.1 picker 列表&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Space + f       Find files       项目内文件</span></span>
<span class="line"><span>Space + s       Search           项目内 grep(全文搜索)</span></span>
<span class="line"><span>Space + b       Buffers          已打开的 buffer</span></span>
<span class="line"><span>Space + d       Diagnostics      LSP 错误 / 警告列表</span></span>
<span class="line"><span>Space + j       Jumplist         跳转历史</span></span>
<span class="line"><span>Space + ?       Commands         所有 :command 列表</span></span>
<span class="line"><span>Space + a       Code actions     LSP code action(refactor)</span></span>
<span class="line"><span>Space + r       Rename symbol    LSP rename</span></span>
<span class="line"><span>Space + h       Help / docs</span></span>
<span class="line"><span>Space + c       Comment toggle</span></span>
<span class="line"><span>Space + y       Yank             从剪贴板历史选</span></span>
<span class="line"><span>Space + R       Replace          替换</span></span></code></pre></div><h3 id="_4-2-picker-长什么样" tabindex="-1">4.2 picker 长什么样 <a class="header-anchor" href="#_4-2-picker-长什么样" aria-label="Permalink to &quot;4.2 picker 长什么样&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>按 Space + f:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>┌── Find File ─────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  &gt; foo                                                   │</span></span>
<span class="line"><span>├──────────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>│  src/foo.rs                                              │</span></span>
<span class="line"><span>│  src/foobar.rs                                           │</span></span>
<span class="line"><span>│  tests/test_foo.py                                       │</span></span>
<span class="line"><span>│  docs/foo-design.md                                      │</span></span>
<span class="line"><span>│  README.md                                               │</span></span>
<span class="line"><span>├──────────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>│  Preview ──────────────────────────────────────────────  │</span></span>
<span class="line"><span>│  1  use std::collections::HashMap;                       │</span></span>
<span class="line"><span>│  2                                                       │</span></span>
<span class="line"><span>│  3  pub struct Foo {                                     │</span></span>
<span class="line"><span>│  4      pub name: String,                                │</span></span>
<span class="line"><span>│  5      pub items: HashMap&lt;String, i32&gt;,                 │</span></span>
<span class="line"><span>│  6  }                                                    │</span></span>
<span class="line"><span>│  ...                                                     │</span></span>
<span class="line"><span>└──────────────────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>特点</strong>:<strong>fuzzy 匹配 + 实时 preview + 上下方向键选 + Enter 打开</strong>。<strong>和 Telescope 几乎一样的体验,但 0 配置 0 plugin</strong>。</p><h3 id="_4-3-picker-vs-命令的取舍" tabindex="-1">4.3 picker vs 命令的取舍 <a class="header-anchor" href="#_4-3-picker-vs-命令的取舍" aria-label="Permalink to &quot;4.3 picker vs 命令的取舍&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>你要做什么                    用什么</span></span>
<span class="line"><span>─────────────────────────────────────────────────────</span></span>
<span class="line"><span>打开当前目录已经知道的文件   :open path/to/file</span></span>
<span class="line"><span>找一个文件但不确定路径       Space + f(picker)</span></span>
<span class="line"><span>搜整个项目里某个字符串       Space + s(全文 picker)</span></span>
<span class="line"><span>跳到 LSP 跳转点              gd(直接跳)</span></span>
<span class="line"><span>找所有 references            Space + s(配合 LSP)</span></span>
<span class="line"><span>切换最近的 buffer            Space + b</span></span>
<span class="line"><span>看所有错误                   Space + d</span></span></code></pre></div><p><strong>心智</strong>:<strong>Space 是&quot;我不确定要什么,先列出来选&quot;</strong>——picker 替代了 vim 那种&quot;先 :find 配 wildmenu&quot; 的流程。</p><hr><h2 id="五、lsp-开箱-把-server-放进-path-就行" tabindex="-1">五、LSP 开箱:把 server 放进 PATH 就行 <a class="header-anchor" href="#五、lsp-开箱-把-server-放进-path-就行" aria-label="Permalink to &quot;五、LSP 开箱:把 server 放进 PATH 就行&quot;">​</a></h2><p>Helix 不需要你&quot;配 LSP&quot;——<strong>只要 PATH 里有 LSP server,Helix 自动检测并连接</strong>。</p><h3 id="_5-1-装-server" tabindex="-1">5.1 装 server <a class="header-anchor" href="#_5-1-装-server" aria-label="Permalink to &quot;5.1 装 server&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Python</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">pip</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> install</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> pyright</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 或 npm install -g pyright</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Go</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">go</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> install</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> golang.org/x/tools/gopls@latest</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Rust(rustup 装的就自带 rust-analyzer)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">rustup</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> component</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> add</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> rust-analyzer</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># TypeScript / JavaScript</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">npm</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> install</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -g</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> typescript</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> typescript-language-server</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Lua</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">brew</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> install</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> lua-language-server</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 看 Helix 知道哪些 server:</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">hx</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --health</span></span></code></pre></div><p><strong><code>hx --health</code> 输出</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Helix 24.07</span></span>
<span class="line"><span>Default config path: ~/.config/helix</span></span>
<span class="line"><span>Runtime: ~/.config/helix/runtime → installed</span></span>
<span class="line"><span>Clipboard provider: pbcopy</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Languages</span></span>
<span class="line"><span>  rust         lsp: rust-analyzer    ✓</span></span>
<span class="line"><span>               formatter: rustfmt    ✓</span></span>
<span class="line"><span>  python       lsp: pyright          ✓</span></span>
<span class="line"><span>               formatter: black      ✗(not in PATH)</span></span>
<span class="line"><span>  go           lsp: gopls            ✓</span></span>
<span class="line"><span>               formatter: gofmt      ✓</span></span>
<span class="line"><span>  typescript   lsp: typescript-langu ✓</span></span>
<span class="line"><span>  lua          lsp: lua-language-ser ✓</span></span>
<span class="line"><span>  markdown     lsp: marksman         ✗</span></span></code></pre></div><p><strong>绿色勾</strong>表示装好;<strong>红色 ✗</strong> 你想用就装。<strong>就这么简单——没有 mason、没有 lspconfig setup,装到 PATH 就完事</strong>。</p><h3 id="_5-2-lsp-基础操作" tabindex="-1">5.2 LSP 基础操作 <a class="header-anchor" href="#_5-2-lsp-基础操作" aria-label="Permalink to &quot;5.2 LSP 基础操作&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>gd              go to definition</span></span>
<span class="line"><span>gr              go to references(在 picker 里列出来)</span></span>
<span class="line"><span>gt              go to type definition</span></span>
<span class="line"><span>gi              go to implementation</span></span>
<span class="line"><span></span></span>
<span class="line"><span>K               hover(显示 docstring / 类型)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Space + r       rename symbol</span></span>
<span class="line"><span>Space + a       code action</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Space + d       project diagnostics(全项目错误列表)</span></span>
<span class="line"><span>] d  / [ d      下一个 / 上一个 diagnostic</span></span></code></pre></div><p><strong>这些键位都是 Helix 默认绑的,你不用配</strong>——按下就 work。</p><h3 id="_5-3-改-lsp-行为-可选" tabindex="-1">5.3 改 LSP 行为(可选) <a class="header-anchor" href="#_5-3-改-lsp-行为-可选" aria-label="Permalink to &quot;5.3 改 LSP 行为(可选)&quot;">​</a></h3><p>如果某种语言的 LSP 你想传参数,<strong>配置在 <code>~/.config/helix/languages.toml</code></strong>:</p><div class="language-toml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">toml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># ~/.config/helix/languages.toml</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">[[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">language</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">name = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;python&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">language-servers = [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;pyright&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;ruff&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">formatter = { command = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;black&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, args = [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;-&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;--quiet&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">] }</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">auto-format = </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">true</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">language-server</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">pyright</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">config</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">python</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">analysis</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">typeCheckingMode = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;strict&quot;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">[[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">language</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">name = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;rust&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">language-servers = [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;rust-analyzer&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">auto-format = </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">true</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">language-server</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">rust-analyzer</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">config</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">check.command = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;clippy&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">cargo.features = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;all&quot;</span></span></code></pre></div><p><strong>Helix 的语言配置走 TOML,不是 Lua 函数</strong>——比 Neovim 的 lspconfig setup 简单一截,<strong>代价是灵活度低</strong>。</p><hr><h2 id="六、多光标-批量操作的核心" tabindex="-1">六、多光标:批量操作的核心 <a class="header-anchor" href="#六、多光标-批量操作的核心" aria-label="Permalink to &quot;六、多光标:批量操作的核心&quot;">​</a></h2><p><strong>Helix 的多光标是 selection-first 范式的最大红利</strong>——比 vim 的 <code>:%s/foo/bar/g</code> 或 Neovim 的 <code>Substitute</code> 直观得多。</p><h3 id="_6-1-加光标的方法" tabindex="-1">6.1 加光标的方法 <a class="header-anchor" href="#_6-1-加光标的方法" aria-label="Permalink to &quot;6.1 加光标的方法&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>C               下一行同位置加光标</span></span>
<span class="line"><span>A-C             上一行同位置加光标(Alt + C)</span></span>
<span class="line"><span>,               合并所有光标为一个</span></span>
<span class="line"><span>*               把当前选区设为搜索 pattern</span></span>
<span class="line"><span>n               下一个匹配(选中)</span></span>
<span class="line"><span>A               把所有匹配都选中(*  之后按 A)</span></span></code></pre></div><h3 id="_6-2-实操-1-批量改变量名" tabindex="-1">6.2 实操 1:批量改变量名 <a class="header-anchor" href="#_6-2-实操-1-批量改变量名" aria-label="Permalink to &quot;6.2 实操 1:批量改变量名&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>代码:</span></span>
<span class="line"><span>   user_id = 1</span></span>
<span class="line"><span>   if user_id &gt; 0:</span></span>
<span class="line"><span>       print(user_id)</span></span>
<span class="line"><span>       return user_id</span></span>
<span class="line"><span></span></span>
<span class="line"><span>操作:</span></span>
<span class="line"><span>   1. 把光标停在第一个 user_id 上</span></span>
<span class="line"><span>   2. 按 mi w          选中这个词</span></span>
<span class="line"><span>                       屏幕:[user_id] = 1</span></span>
<span class="line"><span>   3. 按 *             把它设为搜索 pattern</span></span>
<span class="line"><span>                       屏幕底部:/user_id/</span></span>
<span class="line"><span>   4. 按 A             选中所有匹配</span></span>
<span class="line"><span>                       屏幕:四处 [user_id] 同时高亮</span></span>
<span class="line"><span>   5. 按 c             删并进入 insert</span></span>
<span class="line"><span>   6. 输入 userId      所有四处同步改</span></span>
<span class="line"><span>   7. 按 Esc           回 normal</span></span>
<span class="line"><span></span></span>
<span class="line"><span>结果:</span></span>
<span class="line"><span>   userId = 1</span></span>
<span class="line"><span>   if userId &gt; 0:</span></span>
<span class="line"><span>       print(userId)</span></span>
<span class="line"><span>       return userId</span></span></code></pre></div><p><strong>vs vim 同样操作</strong>:<code>:%s/user_id/userId/g</code> + 回车。<strong>vim 那条更简洁</strong>——这是 Helix 的劣势:<strong>简单的 sed 风格替换,Helix 不如 vim 简洁</strong>。<strong>Helix 的优势在多光标不是搜索替换,在那种&quot;我要选这几处然后同步改&quot;的复杂场景</strong>。</p><h3 id="_6-3-实操-2-同时给多行加分号" tabindex="-1">6.3 实操 2:同时给多行加分号 <a class="header-anchor" href="#_6-3-实操-2-同时给多行加分号" aria-label="Permalink to &quot;6.3 实操 2:同时给多行加分号&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>代码:</span></span>
<span class="line"><span>   let x = 1</span></span>
<span class="line"><span>   let y = 2</span></span>
<span class="line"><span>   let z = 3</span></span>
<span class="line"><span></span></span>
<span class="line"><span>操作:</span></span>
<span class="line"><span>   1. 光标在 let x 那行第一个字符</span></span>
<span class="line"><span>   2. 按 x             选中整行</span></span>
<span class="line"><span>   3. 按 X             选区向下扩展到下一行</span></span>
<span class="line"><span>   4. 按 X             再扩展(现在选了三行)</span></span>
<span class="line"><span>   5. 按 s             &quot;在选区内子选择&quot;,输入 $</span></span>
<span class="line"><span>                       (或者用 / 后 $ 也行)</span></span>
<span class="line"><span>   → 三行每行末尾各加一个光标</span></span>
<span class="line"><span>   6. 按 a             insert 模式(光标在每个选区末尾)</span></span>
<span class="line"><span>   7. 输入 ;</span></span>
<span class="line"><span>   8. Esc</span></span>
<span class="line"><span></span></span>
<span class="line"><span>结果:</span></span>
<span class="line"><span>   let x = 1;</span></span>
<span class="line"><span>   let y = 2;</span></span>
<span class="line"><span>   let z = 3;</span></span></code></pre></div><p><strong>这套操作 vim 也能做(配合 visual block + I / A)</strong>,但 Helix 的&quot;先选再操作&quot;心智更线性,<strong>新人更易上手</strong>。</p><h3 id="_6-4-实操-3-批量补-console-log" tabindex="-1">6.4 实操 3:批量补 console.log <a class="header-anchor" href="#_6-4-实操-3-批量补-console-log" aria-label="Permalink to &quot;6.4 实操 3:批量补 console.log&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>要给一段 JS 代码每一行变量后面加 console.log(变量):</span></span>
<span class="line"><span></span></span>
<span class="line"><span>const a = getA();</span></span>
<span class="line"><span>const b = getB();</span></span>
<span class="line"><span>const c = getC();</span></span>
<span class="line"><span></span></span>
<span class="line"><span>操作:</span></span>
<span class="line"><span>   1. 选第一行整行(x)</span></span>
<span class="line"><span>   2. 扩展到三行(XX)</span></span>
<span class="line"><span>   3. s + 输入 const (\\w+)        ← 正则选所有 const 后的变量名</span></span>
<span class="line"><span>   4. y                            yank 选区</span></span>
<span class="line"><span>   5. p                            paste</span></span>
<span class="line"><span>   6. ...(用 multiline 模式编辑同步插 console.log)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>—— 这种复杂场景 Helix 的多光标比 vim 强很多</span></span></code></pre></div><p><strong>Helix 的多光标是&quot;一等公民&quot;</strong>——你 day 1 就用,而不是 vim 那样到第三个月才偶尔 <code>:%s</code> 一下。</p><hr><h2 id="七、配置文件-20-行-toml-全说明" tabindex="-1">七、配置文件:20 行 TOML 全说明 <a class="header-anchor" href="#七、配置文件-20-行-toml-全说明" aria-label="Permalink to &quot;七、配置文件:20 行 TOML 全说明&quot;">​</a></h2><p>Helix 的配置主入口是 <code>~/.config/helix/config.toml</code>——<strong>20 行就够日常</strong>。</p><h3 id="_7-1-完整-minimal-配置" tabindex="-1">7.1 完整 minimal 配置 <a class="header-anchor" href="#_7-1-完整-minimal-配置" aria-label="Permalink to &quot;7.1 完整 minimal 配置&quot;">​</a></h3><div class="language-toml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">toml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># ~/.config/helix/config.toml</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">theme = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;catppuccin_mocha&quot;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">editor</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">line-number = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;relative&quot;</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">       # 相对行号(配合 5j / 3k 跳)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">mouse = </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">false</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                  # 关鼠标,纯键盘党</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">bufferline = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;multiple&quot;</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">        # 多 buffer 时显示 tab 栏</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">true-color = </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">true</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">              # 启用 24-bit 颜色</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">shell = [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;zsh&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;-c&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]          </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 内嵌命令用什么 shell</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">editor</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">cursor-shape</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">insert = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;bar&quot;</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                 # insert 模式光标是竖线</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">normal = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;block&quot;</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">               # normal 模式光标是方块</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">select = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;underline&quot;</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">           # select 模式光标是下划线</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">editor</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">statusline</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">left  = [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;mode&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;spinner&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;file-name&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;file-modification-indicator&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">right = [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;diagnostics&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;selections&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;position&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;file-encoding&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;file-type&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">editor</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">lsp</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">display-messages = </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">true</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">        # 状态栏显示 LSP 启动 / 错误信息</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">display-inlay-hints = </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">true</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">     # 显示 inlay hints(参数名、类型)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">editor</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">indent-guides</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">render = </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">true</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                  # 显示缩进辅助线</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">character = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;┊&quot;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">editor</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">whitespace</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">render</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">space = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;none&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">tab = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;all&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">newline = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;none&quot;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">keys</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">normal</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">&quot;C-s&quot; = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;:w&quot;</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                   # Ctrl+S 保存</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">&quot;C-q&quot; = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;:q&quot;</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                   # Ctrl+Q 退出</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">&quot;C-h&quot; = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;jump_view_left&quot;</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">       # Ctrl+H 跳左窗口</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">&quot;C-l&quot; = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;jump_view_right&quot;</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">      # Ctrl+L 跳右窗口</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">&quot;esc&quot; = [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;collapse_selection&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;keep_primary_selection&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                               # esc 收缩选区到主光标(双重操作)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">keys</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">insert</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">&quot;j j&quot; = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;normal_mode&quot;</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">          # 在 insert 里 jj 回 normal(像 vim 的 imap jj &lt;esc&gt;)</span></span></code></pre></div><h3 id="_7-2-每段说明" tabindex="-1">7.2 每段说明 <a class="header-anchor" href="#_7-2-每段说明" aria-label="Permalink to &quot;7.2 每段说明&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>theme = &quot;catppuccin_mocha&quot;</span></span>
<span class="line"><span>   主题。Helix 自带 100+ 个,hx --health 看完整列表。</span></span>
<span class="line"><span>   常用:gruvbox / tokyonight_storm / monokai_pro / catppuccin_*</span></span>
<span class="line"><span></span></span>
<span class="line"><span>[editor]</span></span>
<span class="line"><span>   全局编辑器设置</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   line-number = &quot;relative&quot;</span></span>
<span class="line"><span>      &quot;absolute&quot;(绝对)/ &quot;relative&quot;(相对当前行)</span></span>
<span class="line"><span>      &quot;relative&quot; 配合 5j / 3k 这种&quot;跳 N 行&quot;操作更直观</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   mouse = false</span></span>
<span class="line"><span>      关鼠标。modal editor 党通常关掉,纯键盘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   bufferline = &quot;multiple&quot;</span></span>
<span class="line"><span>      &quot;never&quot;(不显示)/ &quot;multiple&quot;(多 buffer 时显)/ &quot;always&quot;(永远显)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   true-color = true</span></span>
<span class="line"><span>      启用 24-bit 颜色。现代终端都支持</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   shell = [&quot;zsh&quot;, &quot;-c&quot;]</span></span>
<span class="line"><span>      :sh 之类的命令用什么 shell 跑</span></span>
<span class="line"><span></span></span>
<span class="line"><span>[editor.cursor-shape]</span></span>
<span class="line"><span>   不同模式下光标形状。block / bar / underline 三选一</span></span>
<span class="line"><span>   关键:让你一眼看出当前在 normal / insert / select</span></span>
<span class="line"><span></span></span>
<span class="line"><span>[editor.statusline]</span></span>
<span class="line"><span>   底部状态栏。每个元素的可选值在 Helix doc 里有列表</span></span>
<span class="line"><span></span></span>
<span class="line"><span>[editor.lsp]</span></span>
<span class="line"><span>   LSP 行为</span></span>
<span class="line"><span>   display-inlay-hints = true:显示类型 hint(像 Rust 的 let x: i32)</span></span>
<span class="line"><span>                                 不要的话设 false</span></span>
<span class="line"><span></span></span>
<span class="line"><span>[editor.indent-guides]</span></span>
<span class="line"><span>   缩进辅助线。╎┊┃ 这种竖线</span></span>
<span class="line"><span>   编辑深嵌套代码很有用</span></span>
<span class="line"><span></span></span>
<span class="line"><span>[keys.normal] / [keys.insert] / [keys.select]</span></span>
<span class="line"><span>   keymap 重定义</span></span>
<span class="line"><span>   key 写法:</span></span>
<span class="line"><span>      &quot;C-s&quot;   = Ctrl + S</span></span>
<span class="line"><span>      &quot;A-x&quot;   = Alt + X</span></span>
<span class="line"><span>      &quot;S-tab&quot; = Shift + Tab</span></span>
<span class="line"><span>      &quot;space&quot; = Space</span></span>
<span class="line"><span>      &quot;j j&quot;   = 连按 j j(用空格分隔表示序列)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   value 是 Helix 命令名或命令数组(多个命令依次执行)</span></span></code></pre></div><h3 id="_7-3-language-config-单独文件" tabindex="-1">7.3 language config(单独文件) <a class="header-anchor" href="#_7-3-language-config-单独文件" aria-label="Permalink to &quot;7.3 language config(单独文件)&quot;">​</a></h3><div class="language-toml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">toml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># ~/.config/helix/languages.toml</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">[[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">language</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">name = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;python&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">auto-format = </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">true</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">language-servers = [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;pyright&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;ruff&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">language-server</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">pyright</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">config</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">python</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">analysis</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">typeCheckingMode = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;basic&quot;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">[[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">language</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">name = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;go&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">auto-format = </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">true</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">formatter = { command = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;goimports&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> }</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">[[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">language</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">name = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;rust&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">auto-format = </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">true</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">language-server</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">rust-analyzer</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">config = { check.command = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;clippy&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> }</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">[[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">language</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">name = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;markdown&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">soft-wrap = { enable = </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">true</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, max-wrap = </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">25</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> }</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">language-servers = [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;marksman&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span></code></pre></div><p><strong><code>languages.toml</code> 是给&quot;我要改某种语言的 LSP / formatter 默认行为&quot;用的</strong>——不需要就别建,默认行为已经够。</p><h3 id="_7-4-主题自定义" tabindex="-1">7.4 主题自定义 <a class="header-anchor" href="#_7-4-主题自定义" aria-label="Permalink to &quot;7.4 主题自定义&quot;">​</a></h3><p><code>~/.config/helix/themes/my-theme.toml</code>:</p><div class="language-toml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">toml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">inherits = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;catppuccin_mocha&quot;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">&quot;ui.background&quot; = { bg = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;#000000&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> }</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">&quot;comment&quot; = { fg = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;#7f849c&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, modifiers = [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;italic&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">] }</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">&quot;keyword&quot; = { fg = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;#cba6f7&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, modifiers = [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;bold&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">] }</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">&quot;string&quot;  = { fg = </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;#a6e3a1&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> }</span></span></code></pre></div><p><strong><code>inherits = &quot;...&quot;</code> 表示基于现有主题改</strong>——大部分配色继承,你只改你想改的部分。</p><hr><h2 id="八、helix-vs-neovim-决策对比表" tabindex="-1">八、Helix vs Neovim:决策对比表 <a class="header-anchor" href="#八、helix-vs-neovim-决策对比表" aria-label="Permalink to &quot;八、Helix vs Neovim:决策对比表&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                              Neovim             Helix</span></span>
<span class="line"><span>─────────────────────────────────────────────────────────────────</span></span>
<span class="line"><span>上手时间                      1-2 周(配置)     20 分钟(开箱)</span></span>
<span class="line"><span>心智一致                      vim(熟悉)        selection-first(新)</span></span>
<span class="line"><span>LSP                           plugin(LazyVim)   内置</span></span>
<span class="line"><span>Tree-sitter                   plugin             内置</span></span>
<span class="line"><span>多光标                        plugin(visual-multi) 内置</span></span>
<span class="line"><span>fuzzy finder                  plugin(telescope) 内置(picker)</span></span>
<span class="line"><span>补全 UI                       plugin(nvim-cmp)  内置(LSP completion)</span></span>
<span class="line"><span>file tree                     plugin(nvim-tree) 内置(picker 替代)</span></span>
<span class="line"><span>git gutter                    plugin(gitsigns)  内置</span></span>
<span class="line"><span>status line                   plugin(lualine)   内置</span></span>
<span class="line"><span>debugger                      plugin(nvim-dap)  内置(DAP)</span></span>
<span class="line"><span>plugin 生态                   ★★★★★              ★★(刚起步)</span></span>
<span class="line"><span>                                                  Steel 系统 2026 试验中</span></span>
<span class="line"><span>自定义上限                    ★★★★★              ★★★</span></span>
<span class="line"><span>远端 attach 工作流            ★★★★               ★(暂无)</span></span>
<span class="line"><span>社区                          巨大,数百 contributor 活跃但小,几十核心</span></span>
<span class="line"><span>启动速度                      30-100ms(配过)   30ms(开箱)</span></span>
<span class="line"><span>二进制大小                    20MB + plugin(100MB+) 单个 25MB</span></span>
<span class="line"><span>配置文件                      Lua,几百行         TOML,20 行</span></span>
<span class="line"><span>跨机器一致性                  靠 lazy-lock.json + dotfiles 默认就一致</span></span>
<span class="line"><span>学 vim 之后切换难度           N/A                难(肌肉记忆全错)</span></span>
<span class="line"><span>2026 主流地位                 主流                 上升</span></span>
<span class="line"><span>出门工具(SSH / 容器)        vim 兜底             Helix 装一份就能用</span></span>
<span class="line"><span>                                                  (但远端常没装)</span></span></code></pre></div><h3 id="_8-1-怎么读这张表" tabindex="-1">8.1 怎么读这张表 <a class="header-anchor" href="#_8-1-怎么读这张表" aria-label="Permalink to &quot;8.1 怎么读这张表&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>你已经会 vim + Neovim 配得不错:</span></span>
<span class="line"><span>   不建议切 Helix —— sunk cost / muscle memory / plugin 工作流都在 Neovim</span></span>
<span class="line"><span>   除非你受够了 Lua + lazy.nvim debug,确实想&quot;少操心&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>你从来没学过 modal editor,想开始:</span></span>
<span class="line"><span>   推荐 Helix —— 20 分钟开箱,先学 modal 的本质</span></span>
<span class="line"><span>   学完 Helix 一年后想要更多自定义,再考虑切 Neovim</span></span>
<span class="line"><span>   反过来不行(从 vim 切 Helix 是肌肉记忆灾难)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>你只在远端 / 容器 / CI runner 用:</span></span>
<span class="line"><span>   仍然推荐 vim —— Helix 装不上(远端没 brew、Alpine 没 helix 包)</span></span>
<span class="line"><span>   Neovim 也勉强 —— vim 是最小公分母</span></span>
<span class="line"><span></span></span>
<span class="line"><span>你写非主流语言 / 写论文 / 用 org-mode:</span></span>
<span class="line"><span>   Neovim —— 因为 plugin 生态有 orgmode.nvim / obsidian.nvim 这种</span></span>
<span class="line"><span>   Helix 没有,等 Steel 系统稳定才有可能</span></span>
<span class="line"><span></span></span>
<span class="line"><span>你的工作 80% 是写代码,20% 是简单浏览:</span></span>
<span class="line"><span>   两个都行 —— Helix 更省心,Neovim 更可调</span></span></code></pre></div><h3 id="_8-2-一张图判断" tabindex="-1">8.2 一张图判断 <a class="header-anchor" href="#_8-2-一张图判断" aria-label="Permalink to &quot;8.2 一张图判断&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                  你已经学过 vim 吗?</span></span>
<span class="line"><span>                       │</span></span>
<span class="line"><span>        ┌──────────────┴──────────────┐</span></span>
<span class="line"><span>       否                              是</span></span>
<span class="line"><span>        │                              │</span></span>
<span class="line"><span>你想配 Neovim 还是                你的 Neovim 配置满意吗?</span></span>
<span class="line"><span>开箱即用?                              │</span></span>
<span class="line"><span>        │                       ┌──────┴──────┐</span></span>
<span class="line"><span>   ┌────┴────┐                  是           否</span></span>
<span class="line"><span>开箱即用      自配                │             │</span></span>
<span class="line"><span>   │          │                  继续用         你受够了 Lua 配置?</span></span>
<span class="line"><span> Helix     Neovim                Neovim         │</span></span>
<span class="line"><span>                                            ┌───┴───┐</span></span>
<span class="line"><span>                                            是      否</span></span>
<span class="line"><span>                                            │       │</span></span>
<span class="line"><span>                                          Helix    继续用</span></span>
<span class="line"><span>                                          (但接受 Neovim,</span></span>
<span class="line"><span>                                           muscle      调一调</span></span>
<span class="line"><span>                                           memory      就好</span></span>
<span class="line"><span>                                           会乱 1-2 周)</span></span></code></pre></div><hr><h2 id="九、谁适合-helix" tabindex="-1">九、谁适合 Helix <a class="header-anchor" href="#九、谁适合-helix" aria-label="Permalink to &quot;九、谁适合 Helix&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>✓ 从来没学过 vim,2026 新人入门 modal editor</span></span>
<span class="line"><span>   - Helix 心智更线性,视觉反馈即时,学得快</span></span>
<span class="line"><span>   - 20 分钟跑通 \`hx --tutor\` 你就基本会了</span></span>
<span class="line"><span></span></span>
<span class="line"><span>✓ 学过 vim 但配 Neovim 配不下去</span></span>
<span class="line"><span>   - 你想要 modal,但 Lua 配置的复杂度劝退你</span></span>
<span class="line"><span>   - 你愿意把 muscle memory 重学(范式不同)</span></span>
<span class="line"><span>   - 接受 1-2 周不适期换长期&quot;少操心&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>✓ 重视&quot;跨机器一致&quot;</span></span>
<span class="line"><span>   - 复制 ~/.config/helix/ 到 Mac / Linux,体验完全一样</span></span>
<span class="line"><span>   - 不用担心 plugin 版本不一致 / lazy-lock.json 不同步</span></span>
<span class="line"><span></span></span>
<span class="line"><span>✓ 主写代码,不写论文 / 不当 IDE 重度定制</span></span>
<span class="line"><span>   - 你的工作是编辑代码 + LSP + git,这些 Helix 都齐</span></span>
<span class="line"><span>   - 你不需要 obsidian.nvim / orgmode / DAP 之类的 IDE 化插件</span></span>
<span class="line"><span></span></span>
<span class="line"><span>✓ Rust 工程师</span></span>
<span class="line"><span>   - Helix 自己是 Rust 写的,装好 rustup 就有 rust-analyzer</span></span>
<span class="line"><span>   - 跟 Rust 生态体感一致</span></span></code></pre></div><hr><h2 id="十、谁仍然该用-neovim" tabindex="-1">十、谁仍然该用 Neovim <a class="header-anchor" href="#十、谁仍然该用-neovim" aria-label="Permalink to &quot;十、谁仍然该用 Neovim&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>✗ 你已经会 vim,有几年肌肉记忆</span></span>
<span class="line"><span>   - 切 Helix = 你的快捷反射 80% 错位</span></span>
<span class="line"><span>   - sunk cost 太大,不值得换</span></span>
<span class="line"><span></span></span>
<span class="line"><span>✗ 你需要 plugin 生态</span></span>
<span class="line"><span>   - orgmode / obsidian / specific filetype / markdown preview</span></span>
<span class="line"><span>   - 这些 Helix 都没有(2026 仍是)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>✗ 你想自定义到 IDE 程度</span></span>
<span class="line"><span>   - 自己写 plugin、自己写 keymap chain、自己接 DAP</span></span>
<span class="line"><span>   - Neovim 的可编程性是 Helix 的 10 倍</span></span>
<span class="line"><span></span></span>
<span class="line"><span>✗ 你的工作流需要远端 attach</span></span>
<span class="line"><span>   - Neovim 在 remote-nvim.nvim / kickstart-modular.nvim 之类有 plugin</span></span>
<span class="line"><span>   - Helix 远端 attach 工作流 2026 仍然缺位</span></span>
<span class="line"><span></span></span>
<span class="line"><span>✗ 你团队全部用 Neovim</span></span>
<span class="line"><span>   - 协作 / pair / share screen 跟着主流走</span></span>
<span class="line"><span></span></span>
<span class="line"><span>✗ 你写非主流 filetype(LaTex 论文 / org / 古老语言)</span></span>
<span class="line"><span>   - Neovim 总能找到一个 plugin</span></span>
<span class="line"><span>   - Helix 默认 Tree-sitter parser 80+,但偏门语言 LSP 不一定有</span></span>
<span class="line"><span></span></span>
<span class="line"><span>✗ 你重度用 AI 集成(Copilot / Codeium / Avante)</span></span>
<span class="line"><span>   - Neovim 这边 plugin 都成熟</span></span>
<span class="line"><span>   - Helix 这边在做但不稳</span></span></code></pre></div><hr><h2 id="十一、能不能-helix-neovim-混用" tabindex="-1">十一、能不能 Helix + Neovim 混用 <a class="header-anchor" href="#十一、能不能-helix-neovim-混用" aria-label="Permalink to &quot;十一、能不能 Helix + Neovim 混用&quot;">​</a></h2><p><strong>短期可以,长期不建议</strong>——</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>混用的代价:</span></span>
<span class="line"><span>   - 范式不同(动词在前 vs 范围在前)</span></span>
<span class="line"><span>   - 你打 dw 时大脑要切换&quot;现在是哪个编辑器&quot;</span></span>
<span class="line"><span>   - 肌肉记忆错乱,两个都用不熟</span></span>
<span class="line"><span></span></span>
<span class="line"><span>混用的合理场景:</span></span>
<span class="line"><span>   - 远端 SSH 上去发现没装 Helix,只能用 vim/Neovim 改两行</span></span>
<span class="line"><span>   - 这种&quot;偶尔切&quot;可以,但你的主力应该选一个</span></span>
<span class="line"><span></span></span>
<span class="line"><span>如果你必须长期混用:</span></span>
<span class="line"><span>   - 让 Helix 用 vim keymap(Helix 有实验性 vim mode 但不完整)</span></span>
<span class="line"><span>   - 或者让 Neovim 切到 selection-first(有 cute-selectable.nvim 这种 plugin)</span></span>
<span class="line"><span>   - 但这两种&quot;中间态&quot;都不如直接选一个深入</span></span></code></pre></div><p><strong>推荐</strong>:<strong>Choose one,投入半年</strong>。半年后你才真正知道这个选择对不对——给自己个时间窗。</p><hr><h2 id="十二、helix-在-2026-的位置" tabindex="-1">十二、Helix 在 2026 的位置 <a class="header-anchor" href="#十二、helix-在-2026-的位置" aria-label="Permalink to &quot;十二、Helix 在 2026 的位置&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>2026 modal editor 阵营:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   ★★★★★  Neovim</span></span>
<span class="line"><span>          - 80% modal editor 用户在用</span></span>
<span class="line"><span>          - plugin 生态最强</span></span>
<span class="line"><span>          - LazyVim 让入门门槛降低</span></span>
<span class="line"><span>          - 老 vim 用户的&quot;自然升级&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   ★★★    Helix</span></span>
<span class="line"><span>          - 上升中,30k → 50k+ star 三年内</span></span>
<span class="line"><span>          - 完全不抄 vim 的另一条路</span></span>
<span class="line"><span>          - 适合&quot;我不要折腾&quot;的工程师</span></span>
<span class="line"><span>          - plugin 系统 Steel/Scheme 在做,2026 仍试验</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   ★★     vim(系统 vim)</span></span>
<span class="line"><span>          - 最小公分母,远端 / 容器都有</span></span>
<span class="line"><span>          - 新功能基本不再加,维护节奏放缓</span></span>
<span class="line"><span>          - 大家保留它的 muscle memory 是&quot;出门工具&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   ★      Kakoune</span></span>
<span class="line"><span>          - Helix 的祖师</span></span>
<span class="line"><span>          - 小众但有信徒</span></span>
<span class="line"><span>          - 中文资料少,生态比 Helix 还小</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   ★      emacs + evil-mode</span></span>
<span class="line"><span>          - 还有用户,但 modal 圈子越来越偏 Helix / Neovim</span></span></code></pre></div><h3 id="_12-1-helix-的两个未解决问题" tabindex="-1">12.1 Helix 的两个未解决问题 <a class="header-anchor" href="#_12-1-helix-的两个未解决问题" aria-label="Permalink to &quot;12.1 Helix 的两个未解决问题&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>问题 1:plugin 系统</span></span>
<span class="line"><span>   - 设计已经讨论 3 年,Steel(Scheme 方言)是当前候选</span></span>
<span class="line"><span>   - 但 2026 仍然不稳定,默认 release 不带</span></span>
<span class="line"><span>   - 实际效果:你想加任何&quot;core 没有的能力&quot;,得等</span></span>
<span class="line"><span></span></span>
<span class="line"><span>问题 2:远端 attach</span></span>
<span class="line"><span>   - vim/Neovim 这边有 \`:sshfs\` / nvim-remote / kickstart-modular</span></span>
<span class="line"><span>   - Helix 这边几乎没有,只能 SSH 进去本地跑</span></span>
<span class="line"><span>   - 跨机器 session 持久化没有</span></span>
<span class="line"><span></span></span>
<span class="line"><span>这两个问题决定了 Helix 2026 还做不了 Neovim 那种&quot;瑞士军刀&quot;</span></span>
<span class="line"><span>   它是另一条路,不是 Neovim 的减法版</span></span></code></pre></div><h3 id="_12-2-helix-内置功能-vs-neovim-的追赶" tabindex="-1">12.2 Helix 内置功能 vs Neovim 的追赶 <a class="header-anchor" href="#_12-2-helix-内置功能-vs-neovim-的追赶" aria-label="Permalink to &quot;12.2 Helix 内置功能 vs Neovim 的追赶&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>2024 后 Helix 增加的:</span></span>
<span class="line"><span>   - inline diagnostics</span></span>
<span class="line"><span>   - debugger (DAP) 实验性</span></span>
<span class="line"><span>   - soft-wrap 完善</span></span>
<span class="line"><span>   - 改进的 fuzzy 匹配</span></span>
<span class="line"><span>   - sticky context(光标所在函数浮在顶部)</span></span>
<span class="line"><span>   - language injection(SQL 在 Python 字符串里也能高亮)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Neovim 这一边的回应:</span></span>
<span class="line"><span>   - LazyVim 把&quot;开箱即用&quot;做到接近 Helix 水平</span></span>
<span class="line"><span>   - kickstart.nvim 让起步配置变简单</span></span>
<span class="line"><span>   - blink.cmp 用 Rust 写,跟 Helix 性能比拟</span></span>
<span class="line"><span></span></span>
<span class="line"><span>两边互相 push,modal editor 整体在进化</span></span></code></pre></div><hr><h2 id="十三、反对的写法" tabindex="-1">十三、反对的写法 <a class="header-anchor" href="#十三、反对的写法" aria-label="Permalink to &quot;十三、反对的写法&quot;">​</a></h2><p>这一节列我<strong>反复见过</strong>的反模式——你或多或少都会踩:</p><h3 id="_13-1-学-vim-多年又-switch-到-helix" tabindex="-1">13.1 学 vim 多年又 switch 到 Helix <a class="header-anchor" href="#_13-1-学-vim-多年又-switch-到-helix" aria-label="Permalink to &quot;13.1 学 vim 多年又 switch 到 Helix&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>你用了 vim 5 年,你的反应:</span></span>
<span class="line"><span>   - 看到 hello world,本能按 dw 删词</span></span>
<span class="line"><span>   - 在 Helix 里 dw 是&quot;delete 选区 + write&quot;</span></span>
<span class="line"><span>   - 报错 / 完全错位</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   你 muscle memory 80% 失效</span></span>
<span class="line"><span>   你 1-2 周写代码效率掉一半</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>最后:你回去 Neovim,Helix 卸了</span></span></code></pre></div><p><strong>解法</strong>:<strong>已经会 vim 就别切</strong>——除非你真的受够了 Neovim 的 plugin 折腾。<strong>sunk cost 是真的 cost</strong>。</p><h3 id="_13-2-期待-helix-装-1000-个-plugin-像-neovim" tabindex="-1">13.2 期待 Helix 装 1000 个 plugin 像 Neovim <a class="header-anchor" href="#_13-2-期待-helix-装-1000-个-plugin-像-neovim" aria-label="Permalink to &quot;13.2 期待 Helix 装 1000 个 plugin 像 Neovim&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>&quot;我装上 Helix,加个 markdown preview plugin&quot;</span></span>
<span class="line"><span>&quot;我装上 Helix,加个 AI Copilot plugin&quot;</span></span>
<span class="line"><span>&quot;我装上 Helix,加个 git fugitive plugin&quot;</span></span>
<span class="line"><span>↓</span></span>
<span class="line"><span>全部:不存在</span></span>
<span class="line"><span>↓</span></span>
<span class="line"><span>你抱怨&quot;Helix 太弱&quot;</span></span></code></pre></div><p><strong>解法</strong>:<strong>Helix 不是 Neovim 的替代品,是另一条路</strong>——你选 Helix 是因为<strong>接受</strong>&quot;没 plugin 生态&quot;。要 plugin 生态请回 Neovim。</p><h3 id="_13-3-在-helix-硬装-vim-心智" tabindex="-1">13.3 在 Helix 硬装 vim 心智 <a class="header-anchor" href="#_13-3-在-helix-硬装-vim-心智" aria-label="Permalink to &quot;13.3 在 Helix 硬装 vim 心智&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>有人写了 &quot;vim keymap for Helix&quot; 的配置块,</span></span>
<span class="line"><span>你抄过去,以为可以让 Helix 用 dw 删词</span></span>
<span class="line"><span>↓</span></span>
<span class="line"><span>结果:hjkl 顺序保留,但其他全反</span></span>
<span class="line"><span>你脑子里同时有&quot;范围在前&quot;和&quot;动词在前&quot;两套心智在打架</span></span>
<span class="line"><span>↓</span></span>
<span class="line"><span>两套都用不熟</span></span></code></pre></div><p><strong>解法</strong>:<strong>接受 selection-first 范式,重学键位</strong>——不要把 Helix 强行调成 vim 风格。<strong>这个选择从一开始就要做</strong>。</p><h3 id="_13-4-抱怨-helix-没有-plugin-我装个-x-都不行" tabindex="-1">13.4 抱怨&quot;Helix 没有 plugin 我装个 X 都不行&quot; <a class="header-anchor" href="#_13-4-抱怨-helix-没有-plugin-我装个-x-都不行" aria-label="Permalink to &quot;13.4 抱怨&quot;Helix 没有 plugin 我装个 X 都不行&quot;&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>&quot;Helix 没法装 Copilot 真不行&quot;</span></span>
<span class="line"><span>&quot;Helix 没法装 vim-fugitive 真不行&quot;</span></span>
<span class="line"><span>&quot;Helix 没法 attach 远端 真不行&quot;</span></span>
<span class="line"><span>↓</span></span>
<span class="line"><span>你的反应应该是:那我用 Neovim</span></span>
<span class="line"><span>而不是:抱怨 Helix 跟 Neovim 不一样</span></span></code></pre></div><p><strong>解法</strong>:<strong>两个工具是不同范式,不要把&quot;我用 A 但 A 不像 B&quot;当成 A 的错</strong>。Helix 就是&quot;开箱即用 + plugin 弱&quot;,这两件事是一体的——<strong>没有&quot;开箱即用 + plugin 强&quot;的选项</strong>(那就是 Neovim,但要花时间配)。</p><h3 id="_13-5-跟着-youtube-教程抄-helix-高级配置" tabindex="-1">13.5 跟着 YouTube 教程抄 Helix 高级配置 <a class="header-anchor" href="#_13-5-跟着-youtube-教程抄-helix-高级配置" aria-label="Permalink to &quot;13.5 跟着 YouTube 教程抄 Helix 高级配置&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>YouTube 上有人教&quot;how to make Helix like an IDE&quot;</span></span>
<span class="line"><span>你按教程抄一堆 keymap、改 statusline 模板、写 100 行 TOML</span></span>
<span class="line"><span>↓</span></span>
<span class="line"><span>半年后你都忘了哪些是默认哪些是你加的</span></span>
<span class="line"><span>新机器一同步,某些 keymap 自己都不记得为什么这么绑</span></span>
<span class="line"><span>↓</span></span>
<span class="line"><span>失去了 Helix 最大的优势:简单</span></span></code></pre></div><p><strong>解法</strong>:<strong>Helix 配置不要超过 50 行</strong>——超了就是过度配置,<strong>保持简单本身是 Helix 的价值</strong>。</p><h3 id="_13-6-在-helix-里假装写-1000-行-init-lua" tabindex="-1">13.6 在 Helix 里假装写 1000 行 init.lua <a class="header-anchor" href="#_13-6-在-helix-里假装写-1000-行-init-lua" aria-label="Permalink to &quot;13.6 在 Helix 里假装写 1000 行 init.lua&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>&quot;我要让 Helix 完美适配我所有需求&quot;</span></span>
<span class="line"><span>&quot;我要给每种语言写一段 languages.toml&quot;</span></span>
<span class="line"><span>&quot;我要给每个动作绑自定义快捷键&quot;</span></span>
<span class="line"><span>↓</span></span>
<span class="line"><span>languages.toml 200 行,config.toml 300 行</span></span>
<span class="line"><span>↓</span></span>
<span class="line"><span>你和 Neovim 折腾派的人没区别,只是工具换了</span></span></code></pre></div><p><strong>解法</strong>:<strong>Helix 哲学是&quot;配置极简&quot;</strong>——20 行 config + 10 行 languages 已经覆盖 80% 需求。<strong>还想配更多,要么你需要 Neovim,要么你在过度配置</strong>。</p><h3 id="_13-7-期待-plugin-系统-steel-2026-大爆发" tabindex="-1">13.7 期待 plugin 系统(Steel)2026 大爆发 <a class="header-anchor" href="#_13-7-期待-plugin-系统-steel-2026-大爆发" aria-label="Permalink to &quot;13.7 期待 plugin 系统(Steel)2026 大爆发&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>&quot;Steel 出来 Helix 就能装一切了&quot;</span></span>
<span class="line"><span>&quot;我等 Steel 稳定再深入&quot;</span></span>
<span class="line"><span>↓</span></span>
<span class="line"><span>2026 Steel 仍然实验性,生态零起步</span></span>
<span class="line"><span>2027? 2028? 真正能用要再等几年</span></span>
<span class="line"><span>↓</span></span>
<span class="line"><span>你为一个&quot;未来 feature&quot;投入,实际生产用不到</span></span></code></pre></div><p><strong>解法</strong>:<strong>Helix 用 2026 的现状评估</strong>,不是用&quot;3 年后可能怎样&quot;——<strong>今天的 Helix 是&quot;无 plugin,内置功能强&quot;</strong>,这是你的选择基础。<strong>Steel 出来之前,Helix 就是这个样子</strong>。</p><h3 id="_13-8-helix-当-neovim-减法版用" tabindex="-1">13.8 Helix 当 Neovim 减法版用 <a class="header-anchor" href="#_13-8-helix-当-neovim-减法版用" aria-label="Permalink to &quot;13.8 Helix 当 Neovim 减法版用&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>&quot;Helix 太简单了,加点东西&quot;</span></span>
<span class="line"><span>&quot;加 file explorer plugin (没有)&quot;</span></span>
<span class="line"><span>&quot;加 git plugin(没有)&quot;</span></span>
<span class="line"><span>&quot;加 LSP UI plugin(没有)&quot;</span></span>
<span class="line"><span>↓</span></span>
<span class="line"><span>你以为 Helix 是&quot;轻量 Neovim&quot;——错!</span></span>
<span class="line"><span>Helix 是&quot;另一种 modal editor&quot;——它的简单是设计选择</span></span></code></pre></div><p><strong>解法</strong>:<strong>Helix 的简单是 feature,不是 bug</strong>。把 Helix 当 Neovim 减法版用,你永远会失望。<strong>它是另一条路,要么接受要么走人</strong>。</p><hr><h2 id="十四、helix-真实工作日-30-分钟体验" tabindex="-1">十四、Helix 真实工作日:30 分钟体验 <a class="header-anchor" href="#十四、helix-真实工作日-30-分钟体验" aria-label="Permalink to &quot;十四、Helix 真实工作日:30 分钟体验&quot;">​</a></h2><p>如果你看到这里还没决定要不要试,<strong>30 分钟的体验流程</strong>:</p><h3 id="_14-1-装-tutor-15-分钟" tabindex="-1">14.1 装 + tutor(15 分钟) <a class="header-anchor" href="#_14-1-装-tutor-15-分钟" aria-label="Permalink to &quot;14.1 装 + tutor(15 分钟)&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 1. 装</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">brew</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> install</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> helix</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">          # 或 pacman -S helix</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 2. 跑教程</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">hx</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --tutor</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># tutor 是 Helix 自带的交互教程,15 分钟跑完</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 跑完你已经会基础移动 / 选择 / 编辑 / 多光标</span></span></code></pre></div><h3 id="_14-2-写一段代码-10-分钟" tabindex="-1">14.2 写一段代码(10 分钟) <a class="header-anchor" href="#_14-2-写一段代码-10-分钟" aria-label="Permalink to &quot;14.2 写一段代码(10 分钟)&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">cd</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ~/projects/somewhere</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">hx</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> main.py</span></span></code></pre></div><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>做这些事:</span></span>
<span class="line"><span>   - Space + f       打开另一个文件</span></span>
<span class="line"><span>   - Space + s       搜索项目里的某个字符串</span></span>
<span class="line"><span>   - gd              跳定义</span></span>
<span class="line"><span>   - Space + r       rename 一个变量</span></span>
<span class="line"><span>   - mi w / *  / A   选所有相同变量然后批量改</span></span>
<span class="line"><span>   - :w / :q</span></span></code></pre></div><h3 id="_14-3-评估-5-分钟" tabindex="-1">14.3 评估(5 分钟) <a class="header-anchor" href="#_14-3-评估-5-分钟" aria-label="Permalink to &quot;14.3 评估(5 分钟)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>问自己:</span></span>
<span class="line"><span>   □ 这 30 分钟跟 vim / Neovim 比,你舒服吗?</span></span>
<span class="line"><span>   □ 没 plugin 生态你受得了吗?</span></span>
<span class="line"><span>   □ 你愿意 1-2 周 muscle memory 重塑期吗?</span></span>
<span class="line"><span>   □ 你工作场景能脱离 plugin 吗?</span></span>
<span class="line"><span></span></span>
<span class="line"><span>回答 4 个&quot;是&quot; → 切 Helix,投入半年</span></span>
<span class="line"><span>有任何&quot;否&quot;  → 继续 Neovim</span></span></code></pre></div><p><strong>不要&quot;用一周就觉得行/不行&quot;——给自己 1 个月</strong>。modal editor 的判断不是一周能下的。</p><hr><h2 id="十五、看完这一篇你应该能" tabindex="-1">十五、看完这一篇你应该能 <a class="header-anchor" href="#十五、看完这一篇你应该能" aria-label="Permalink to &quot;十五、看完这一篇你应该能&quot;">​</a></h2><ul><li><strong>20 分钟开箱跑出能写代码的 Helix</strong>——<code>hx --tutor</code> 30 分钟会基础,装好 LSP server 就有现代 IDE 体验</li><li><strong>解释 selection-first 范式跟 vim 的根本差异</strong>——范围在前 vs 动词在前,不是细节是范式</li><li><strong>判断 Helix 适不适合你</strong>——根据 vim 经验、plugin 需求、远端工作流场景做选择</li><li><strong>配 Helix 的 config.toml + languages.toml</strong>——20 + 10 行覆盖 80% 需求</li><li><strong>使用 picker + 多光标</strong>——Space + f / s / b 找一切,* / A 批量改</li><li><strong>看到&quot;Helix 没有 plugin&quot;的抱怨</strong>,<strong>第一反应是&quot;那你需要 Neovim&quot;</strong>——而不是&quot;Helix 弱&quot;</li><li><strong>解释 Helix vs Neovim 的工程权衡</strong>——开箱即用 vs 可编程瑞士军刀,是范式选择不是优劣</li></ul><h3 id="_15-1-自查清单" tabindex="-1">15.1 自查清单 <a class="header-anchor" href="#_15-1-自查清单" aria-label="Permalink to &quot;15.1 自查清单&quot;">​</a></h3><p>读完这一篇,做一遍这些事:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>□ 装 Helix,跑 hx --tutor 一遍</span></span>
<span class="line"><span>□ hx --health 检查 LSP server 状态,把你常用语言的 server 装齐</span></span>
<span class="line"><span>□ 打开你日常工作的项目,试着用 Helix 写 30 分钟代码</span></span>
<span class="line"><span>□ 用 picker(Space + f / s / b)替代你 vim 里 :find / :grep / :ls</span></span>
<span class="line"><span>□ 用一次多光标场景:批量改变量名 / 批量加分号</span></span>
<span class="line"><span>□ 写一份 20 行的 config.toml,弄清每段在控制什么</span></span>
<span class="line"><span>□ 决定:Helix 还是 Neovim 当主力,做一个明确选择</span></span>
<span class="line"><span>□ 别混用 —— 否则两边肌肉记忆都不熟</span></span></code></pre></div><p><strong>做完这 8 条,你能下&quot;我用哪个 modal editor 当主力&quot;的决定</strong>——不是看口碑 / 看 GitHub star,<strong>是基于自己实际工作流的工程判断</strong>。</p><hr><h2 id="十六、下一篇预告" tabindex="-1">十六、下一篇预告 <a class="header-anchor" href="#十六、下一篇预告" aria-label="Permalink to &quot;十六、下一篇预告&quot;">​</a></h2><p>下一篇:<strong><code>22-Dotfiles心智与方案选型.md</code></strong>——讲一个看似简单实际反复让人吃亏的问题:<strong>你的 .zshrc / .config/nvim / .config/helix / .tmux.conf 这一堆配置文件,怎么管才能跨机器一致 + 可演进 + 可传承</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>- dotfiles 工程化的 ROI 计算:5 年换 10 台机器,手动配 vs 自动同步</span></span>
<span class="line"><span>- 4 种方案对比:裸 git(stow / yadm)/ chezmoi / Nix home-manager / 啥也不用</span></span>
<span class="line"><span>- 哪种适合你:小团队 vs 大团队 / 单机 vs 跨平台</span></span>
<span class="line"><span>- 私密文件怎么处理(API key / SSH key)—— age 加密 / 1Password CLI</span></span>
<span class="line"><span>- onboarding 新人:一行命令把工作流装好</span></span></code></pre></div><p><strong>这一篇配完,你的 Neovim / Helix / tmux / zsh 配置就有了&quot;工程化的载体&quot;</strong>——不再是散落在 home 目录里的孤儿文件,<strong>而是一个可声明、可复现、可演进的工程产品</strong>。<strong>dotfiles 是终端工程的&quot;组织层&quot;</strong>——前 21 篇你建了所有工具,22 篇开始把它们装订成册。</p>`,182)])])}const g=a(l,[["render",e]]);export{d as __pageData,g as default};
