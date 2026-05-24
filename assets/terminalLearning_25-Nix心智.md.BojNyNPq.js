import{c as a,Q as n,j as i,m as p}from"./chunks/framework.Bhbi9jCp.js";const o=JSON.parse('{"title":"Nix 心智:可复现的尽头,代价是一门新语言","description":"","frontmatter":{},"headers":[],"relativePath":"terminalLearning/25-Nix心智.md","filePath":"terminalLearning/25-Nix心智.md","lastUpdated":1778574438000}'),l={name:"terminalLearning/25-Nix心智.md"};function t(h,s,e,k,r,g){return n(),i("div",null,[...s[0]||(s[0]=[p(`<h1 id="nix-心智-可复现的尽头-代价是一门新语言" tabindex="-1">Nix 心智:可复现的尽头,代价是一门新语言 <a class="header-anchor" href="#nix-心智-可复现的尽头-代价是一门新语言" aria-label="Permalink to &quot;Nix 心智:可复现的尽头,代价是一门新语言&quot;">​</a></h1><p>每年都有几个时刻,你在 HN / Reddit 看到这样的标题:<strong>「Why I switched my whole dev setup to Nix」</strong>、<strong>「我用 NixOS 五年,机器从未重装过」</strong>、<strong>「Nix flake 让我的同事十分钟搭好开发环境」</strong>。你心想,<strong>&quot;该试试了&quot;</strong>——结果打开 Nix 官方文档,第一页就被术语炸开:<strong>Nix / NixOS / Nixpkgs / Flakes / Channels / Home Manager / nix-darwin / nix-shell / nix develop / experimental-features</strong>……翻了三遍,你不知道**「我作为 macOS / Linux 用户,到底装什么、用什么、忽略什么」**。</p><p><strong>两周后,80% 的工程师退回 brew + mise</strong>——不是他们没毅力,<strong>是 Nix 这套生态的&quot;入门曲线&quot;实在反人类</strong>。</p><p>但与此同时,<strong>另外 20% 真正坚持下来的人,五年后没换过工作流</strong>——他们的 dotfiles 是一份 <code>flake.nix</code>,新机器装 Nix → <code>nix run</code> 一行,<strong>5 年前的环境分毫不差地复活</strong>。他们看你还在重装 nvm / pyenv,<strong>就像 2010 年还在自己编译 nginx 的人看用 Docker 的人</strong>——<strong>&quot;这件事我十年前就解决了&quot;</strong>。</p><p>这一篇要回答的核心问题:<strong>Nix 这个坑,你 / 你团队 该不该入</strong>?</p><blockquote><p>一句话先记住:<strong>Nix 是 2026 年最强的可复现工具——函数式 + 声明式 + 内容寻址 + 不可变,装的东西就是一棵纯函数树,新机器装出的版本和你一模一样。代价是学一门 DSL + 换一套心智 + 接受文档烂——80% 工程师两周后放弃,这不是你的错</strong>。</p></blockquote><p>24 篇讲了 mise 解决「项目级版本管理」<strong>——一个 <code>.mise.toml</code> 让团队 Node / Python 版本对齐</strong>。但 mise 不解决「<strong>这台机器的系统包是什么、跨 OS 装的版本是否一致、5 年后能不能复刻</strong>」。<strong>Nix 解决这一切</strong>——代价是把&quot;装东西&quot;这件 30 年的老事重做一遍。</p><p>这一篇拆开讲:<strong>Nix 想解决的 5 个问题</strong>、<strong>4 个核心概念</strong>(不可变 store / 配置即代码 / 原子升级 / 声明式)、<strong>三种用法</strong>(只 Nix / NixOS / nix-darwin)、<strong>Nix DSL 速通</strong>、<strong>flakes 速通</strong>、<strong>home-manager + nix-darwin 各一份配置</strong>、<strong>Nix vs mise + chezmoi 全方位对比</strong>、<strong>入门路径</strong>(怎么不踩坑)、<strong>Nix 在 2026 的现实</strong>(优缺点)、<strong>该不该学 Nix 的判定</strong>、<strong>替代方案</strong>、<strong>反对的写法</strong>——读完你能判断:<strong>Nix 这门手艺,你这两个月该不该投入</strong>。</p><hr><h2 id="一、nix-想解决的-5-个问题" tabindex="-1">一、Nix 想解决的 5 个问题 <a class="header-anchor" href="#一、nix-想解决的-5-个问题" aria-label="Permalink to &quot;一、Nix 想解决的 5 个问题&quot;">​</a></h2><p>理解 Nix 之前,先理解它要替代的世界——<strong>brew / apt / pip / npm 这些&quot;传统包管理器&quot;留给我们 30 年的 5 个老问题</strong>。</p><h3 id="_1-1-问题-1-同一个-brew-install-python-装出不同版本" tabindex="-1">1.1 问题 1:同一个 <code>brew install python</code> 装出不同版本 <a class="header-anchor" href="#_1-1-问题-1-同一个-brew-install-python-装出不同版本" aria-label="Permalink to &quot;1.1 问题 1:同一个 \`brew install python\` 装出不同版本&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>你 2024 年 1 月在 Mac 上跑:</span></span>
<span class="line"><span>   brew install python</span></span>
<span class="line"><span>   ──&gt; 装到 Python 3.12.1</span></span>
<span class="line"><span>   写好一段脚本,跑通,commit</span></span>
<span class="line"><span></span></span>
<span class="line"><span>同事 2024 年 6 月在他 Mac 上跑:</span></span>
<span class="line"><span>   brew install python</span></span>
<span class="line"><span>   ──&gt; 装到 Python 3.12.4</span></span>
<span class="line"><span>   跑你的脚本,某个 typing 行为变了,挂</span></span>
<span class="line"><span></span></span>
<span class="line"><span>你 2024 年 12 月新买 Mac,brew install python:</span></span>
<span class="line"><span>   ──&gt; 装到 Python 3.13.1</span></span>
<span class="line"><span>   跑同一段脚本,某个 stdlib 内容删了,挂</span></span></code></pre></div><p><strong>问题根因</strong>:<strong>brew 仓库的&quot;当前版本&quot;是动态的</strong>——同样的 <code>brew install python</code> 命令,<strong>在不同时间、不同机器装出的版本不一样</strong>。<strong>这就是&quot;在我电脑能跑&quot;的根源</strong>——你的电脑装的不是 Python,是「这一刻 brew 仓库里的 Python」。</p><p><strong>Nix 的反应</strong>:<strong>版本由 <code>flake.lock</code> 写死</strong>,任何时间任何机器跑 <code>nix build</code>,<strong>装出来的 Python 二进制一字节都不差</strong>——因为 lock 文件里记录的是「这个 Python 派生(derivation)的内容寻址哈希」,<strong>全球唯一</strong>。</p><h3 id="_1-2-问题-2-跨-os-不一致" tabindex="-1">1.2 问题 2:跨 OS 不一致 <a class="header-anchor" href="#_1-2-问题-2-跨-os-不一致" aria-label="Permalink to &quot;1.2 问题 2:跨 OS 不一致&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>你的团队:</span></span>
<span class="line"><span>   - macOS 用 brew(包名 postgresql 是版本 16)</span></span>
<span class="line"><span>   - Ubuntu 用 apt(包名 postgresql 是版本 14)</span></span>
<span class="line"><span>   - Alpine 用 apk(包名 postgresql 是版本 15)</span></span>
<span class="line"><span>   - Arch 用 pacman(包名 postgresql 是版本 17)</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>四套发行版,四套版本,四套包名,四套配置目录</span></span>
<span class="line"><span>你写文档:&quot;装 Postgres 14&quot;,4 个工程师装出 4 个版本</span></span></code></pre></div><p><strong>Nix 的反应</strong>:<strong>Nixpkgs 是一个统一仓库</strong>,在 macOS / Linux 上跑同一份 <code>nix run nixpkgs#postgresql_16</code>,<strong>装的二进制是同一个</strong>(都是 Nix 从源码编译或预编译的二进制),不依赖 OS 包管理器。</p><h3 id="_1-3-问题-3-依赖冲突-多版本共存" tabindex="-1">1.3 问题 3:依赖冲突 + 多版本共存 <a class="header-anchor" href="#_1-3-问题-3-依赖冲突-多版本共存" aria-label="Permalink to &quot;1.3 问题 3:依赖冲突 + 多版本共存&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>你同时要:</span></span>
<span class="line"><span>   - 项目 A:需要 Python 3.10(因为 TensorFlow 1.x 只支持 3.10)</span></span>
<span class="line"><span>   - 项目 B:需要 Python 3.12(因为新特性 generic)</span></span>
<span class="line"><span>   - 项目 C:Node 14 + 一个 Postgres 12 CLI</span></span>
<span class="line"><span>   - 全局工具:某个 CLI 用 Python 3.13 写的</span></span>
<span class="line"><span></span></span>
<span class="line"><span>5 个 Python 版本想同时装,brew 怎么办?</span></span>
<span class="line"><span>   brew install python@3.10  python@3.11  python@3.12  python@3.13</span></span>
<span class="line"><span>   ──&gt; 装是装上了,但只有一个能&quot;link&quot;成 /opt/homebrew/bin/python</span></span>
<span class="line"><span>   ──&gt; 其他要 brew link --force,改 .zshrc PATH,手忙脚乱</span></span></code></pre></div><p><strong>Nix 的反应</strong>:<strong>所有版本天然共存</strong>——每个版本住在 <code>/nix/store/HASH-python-3.10.14/</code>、<code>/nix/store/HASH-python-3.12.7/</code>,<strong>用 hash 区分,没有&quot;link 冲突&quot;这个概念</strong>。要哪个版本,<strong>直接引用对应 hash</strong>。</p><h3 id="_1-4-问题-4-rollback-困难" tabindex="-1">1.4 问题 4:rollback 困难 <a class="header-anchor" href="#_1-4-问题-4-rollback-困难" aria-label="Permalink to &quot;1.4 问题 4:rollback 困难&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>某天你 brew upgrade,把 PostgreSQL 14 升到 16</span></span>
<span class="line"><span>PostgreSQL 16 的初始化方式变了,你的本地数据库挂</span></span>
<span class="line"><span>你想回 14:</span></span>
<span class="line"><span>   brew uninstall postgresql</span></span>
<span class="line"><span>   brew install postgresql@14</span></span>
<span class="line"><span>   ──&gt; 这是一个全新装,数据库目录可能丢</span></span>
<span class="line"><span>   ──&gt; 之前的版本痕迹被删了,你回不到&quot;升级前那个状态&quot;</span></span></code></pre></div><p><strong>Nix 的反应</strong>:<strong>每次系统改动都生成一个新 generation</strong>(代际),<strong>旧 generation 完全保留</strong>。回滚就是切到上一个 generation:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 看历史</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">nix-env</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --list-generations</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 1   2024-10-15 10:23:11</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 2   2024-11-02 14:55:01</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 3   2024-12-08 09:42:30   (current)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 回到 2</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">nix-env</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --switch-generation</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 2</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 一行,系统瞬间回到那个时刻的状态</span></span></code></pre></div><p><strong>这是 Nix 最让人破防的设计</strong>——<strong>整台机器都有版本控制,像 git 一样</strong>。</p><h3 id="_1-5-问题-5-环境污染" tabindex="-1">1.5 问题 5:环境污染 <a class="header-anchor" href="#_1-5-问题-5-环境污染" aria-label="Permalink to &quot;1.5 问题 5:环境污染&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>brew install something</span></span>
<span class="line"><span>   ──&gt; 把 something 装到 /opt/homebrew/Cellar/something/X.Y.Z/</span></span>
<span class="line"><span>   ──&gt; 软链到 /opt/homebrew/bin/something</span></span>
<span class="line"><span>   ──&gt; 但 something 又装了 5 个依赖到 /opt/homebrew/Cellar/...</span></span>
<span class="line"><span>   ──&gt; 这些依赖被全局用了,卸 something 不会卸它们</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>半年后 brew list:</span></span>
<span class="line"><span>   500 个包,你不知道有 200 个是&quot;过时但没被卸的依赖&quot;</span></span>
<span class="line"><span>   brew cleanup 清半天,还是不干净</span></span>
<span class="line"><span></span></span>
<span class="line"><span>pip install:</span></span>
<span class="line"><span>   全局 site-packages 满是过期的 lib</span></span>
<span class="line"><span>   卸了又怕影响别人</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>现状:你的 ~ 目录 / /usr/local / /opt 是一个&quot;积累了 5 年灰尘的房间&quot;</span></span></code></pre></div><p><strong>Nix 的反应</strong>:<strong>整个 store 是不可变的</strong>,删一个包就是删 <code>/nix/store/HASH-name/</code> 这个目录,<strong>精确、彻底、原子</strong>。<strong>Nix 的 garbage collector 知道&quot;什么不再被任何 generation 引用&quot;,一行 <code>nix-collect-garbage -d</code> 清干净</strong>。</p><hr><h2 id="二、nix-的-4-个核心概念" tabindex="-1">二、Nix 的 4 个核心概念 <a class="header-anchor" href="#二、nix-的-4-个核心概念" aria-label="Permalink to &quot;二、Nix 的 4 个核心概念&quot;">​</a></h2><p>理解了&quot;它要解决什么&quot;,接下来理解&quot;它怎么解决的&quot;——<strong>4 个核心心智</strong>。</p><h3 id="_2-1-概念-1-不可变-store-内容寻址" tabindex="-1">2.1 概念 1:不可变 store(内容寻址) <a class="header-anchor" href="#_2-1-概念-1-不可变-store-内容寻址" aria-label="Permalink to &quot;2.1 概念 1:不可变 store(内容寻址)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>传统 brew / apt:</span></span>
<span class="line"><span>   /opt/homebrew/bin/python    ──&gt; 一个符号链接,指向当前版本</span></span>
<span class="line"><span>   升级 = 替换这个链接的目标</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>Nix:</span></span>
<span class="line"><span>   /nix/store/3v8x...-python-3.12.7/bin/python    ← 32 字符哈希</span></span>
<span class="line"><span>   /nix/store/m4qz...-python-3.10.14/bin/python   ← 另一个哈希</span></span>
<span class="line"><span>   /nix/store/k1ya...-python-3.13.0/bin/python    ← 又一个</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   每个版本独占一个目录,目录名包含:</span></span>
<span class="line"><span>      - 内容 hash(根据这个包的所有 input 算出来,任何依赖变了 hash 就变)</span></span>
<span class="line"><span>      - 包名 + 版本</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   /nix/store 是只读的、不可变的、内容寻址的</span></span></code></pre></div><p><strong>为什么这样设计</strong>:<strong>让&quot;同一个 hash = 同一个二进制&quot;这个等式始终成立</strong>。两台机器上,只要 hash 相同,<strong>字节级完全一致</strong>。<strong>这就是&quot;可复现&quot;的物理基础</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>传统升级 = 覆盖文件,旧的消失</span></span>
<span class="line"><span>Nix 升级 = 新装一个 hash 目录,旧的还在,只是软链不指向它了</span></span>
<span class="line"><span>        = &quot;升级&quot;和&quot;安装&quot;是同一件事</span></span>
<span class="line"><span>        = &quot;卸载&quot;是&quot;软链不再指向 + 没有 generation 引用它&quot;</span></span>
<span class="line"><span>        = &quot;回滚&quot;是&quot;软链指向旧 hash&quot;</span></span>
<span class="line"><span>        = &quot;GC&quot;是&quot;没有 generation 引用的 hash 目录被删&quot;</span></span></code></pre></div><p><strong>这套机制干净、对称、纯函数式</strong>——每一步操作都是「<strong>只增不改</strong>」。</p><h3 id="_2-2-概念-2-配置即代码-declarative" tabindex="-1">2.2 概念 2:配置即代码(declarative) <a class="header-anchor" href="#_2-2-概念-2-配置即代码-declarative" aria-label="Permalink to &quot;2.2 概念 2:配置即代码(declarative)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>传统 brew + dotfiles:</span></span>
<span class="line"><span>   &quot;我装了什么&quot;分散在:</span></span>
<span class="line"><span>      - brew list   (实际装了什么)</span></span>
<span class="line"><span>      - Brewfile    (我希望装什么)</span></span>
<span class="line"><span>      - ~/.gitconfig (一个手写文件)</span></span>
<span class="line"><span>      - ~/.zshrc    (一个手写文件)</span></span>
<span class="line"><span>      - ~/.config/nvim/* (一堆 lua)</span></span>
<span class="line"><span>      - cron / launchd 服务</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   总之&quot;机器当前状态&quot;和&quot;我希望的状态&quot;是两件事</span></span>
<span class="line"><span>   靠 Brewfile + chezmoi + 手动维护勉强对齐</span></span></code></pre></div><p><strong>Nix 的做法</strong>:<strong>一份 <code>configuration.nix</code> / <code>flake.nix</code> 描述「我希望机器是什么样的」</strong>,系统按这份描述配置:</p><div class="language-nix vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">nix</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># flake.nix(简化)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">{</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  description</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;My machine&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  inputs</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">nixpkgs</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">url</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;github:NixOS/nixpkgs/nixos-24.05&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  outputs</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> { self</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">,</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> nixpkgs }: {</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # 这里声明 &quot;我希望系统是这样的&quot;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    homeConfigurations</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">me</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">      packages</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> with</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;"> nixpkgs</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">; [</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">        git</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">        neovim</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">        ripgrep</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">        fd</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">        fzf</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">        bat</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">        zsh</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      ];</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      </span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">      programs</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">git</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">        enable</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> true</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">        userName</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;Me&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">        userEmail</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;me@example.com&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      };</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      </span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">      programs</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">zsh</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">enable</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> true</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    };</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  };</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span></code></pre></div><p><strong>一行 <code>nix run home-manager -- switch</code>,系统对齐</strong>——装上 7 个包、改 ~/.gitconfig、改 ~/.zshrc,全部按声明执行。<strong>改一行声明,再 switch,系统就变了</strong>。</p><p><strong>这跟 Ansible / Terraform / Kubernetes 是一个范式</strong>——<strong>声明式而非命令式</strong>。你说&quot;我要这个状态&quot;,工具负责&quot;怎么从当前到这个状态&quot;。</p><h3 id="_2-3-概念-3-原子更新-rollback" tabindex="-1">2.3 概念 3:原子更新 + rollback <a class="header-anchor" href="#_2-3-概念-3-原子更新-rollback" aria-label="Permalink to &quot;2.3 概念 3:原子更新 + rollback&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>你改 flake.nix,加了一个包,跑 nix run home-manager -- switch:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   生成 generation 5(在新位置准备好新状态)</span></span>
<span class="line"><span>        ↓</span></span>
<span class="line"><span>   原子切换 symlink(/run/current-system 指向 generation 5)</span></span>
<span class="line"><span>        ↓</span></span>
<span class="line"><span>   旧的 generation 4 还在,没动</span></span>
<span class="line"><span>        </span></span>
<span class="line"><span>现在你出问题:</span></span>
<span class="line"><span>   nix-env --switch-generation 4</span></span>
<span class="line"><span>   ──&gt; 软链切回去,旧状态瞬间复活</span></span>
<span class="line"><span>   ──&gt; 不是&quot;卸载新包再装旧包&quot;,是&quot;切指针&quot;</span></span></code></pre></div><p><strong>这就是&quot;代际(generation)&quot;</strong>——<strong>整台机器是不可变的版本控制对象</strong>。</p><p>NixOS 启动菜单(Linux):</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>GRUB:</span></span>
<span class="line"><span>   ▸ NixOS - Generation 47   (latest)</span></span>
<span class="line"><span>     NixOS - Generation 46</span></span>
<span class="line"><span>     NixOS - Generation 45</span></span>
<span class="line"><span>     ...</span></span>
<span class="line"><span>     NixOS - Generation 1    (initial install)</span></span></code></pre></div><p><strong>Boot 的时候你能直接选老 generation</strong>——升级搞挂内核?<strong>重启选上一代,系统活回来</strong>。</p><h3 id="_2-4-概念-4-声明式-vs-命令式" tabindex="-1">2.4 概念 4:声明式 vs 命令式 <a class="header-anchor" href="#_2-4-概念-4-声明式-vs-命令式" aria-label="Permalink to &quot;2.4 概念 4:声明式 vs 命令式&quot;">​</a></h3><p>这是最大的心智冲击,<strong>单独讲清楚</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>命令式包管理(brew / apt):</span></span>
<span class="line"><span>   &quot;我做这些动作来改变系统&quot;</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   brew install neovim           ← 动作</span></span>
<span class="line"><span>   brew install --cask ghostty   ← 动作</span></span>
<span class="line"><span>   echo &quot;alias g=git&quot; &gt;&gt; ~/.zshrc ← 动作</span></span>
<span class="line"><span>   defaults write com.apple.dock orientation right  ← 动作</span></span>
<span class="line"><span>   ...</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   动作的累积 = 当前系统状态</span></span>
<span class="line"><span>   &quot;系统现在是什么样&quot;取决于&quot;过去 N 次动作的累加&quot;</span></span>
<span class="line"><span>   永远不知道现在的状态是怎么来的(动作的历史在 shell history 里)</span></span>
<span class="line"><span></span></span>
<span class="line"><span></span></span>
<span class="line"><span>声明式包管理(Nix / NixOS):</span></span>
<span class="line"><span>   &quot;我描述我希望系统是什么样的&quot;</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   programs.neovim.enable = true;          ← 描述</span></span>
<span class="line"><span>   programs.ghostty.enable = true;         ← 描述</span></span>
<span class="line"><span>   programs.zsh.shellAliases.g = &quot;git&quot;;    ← 描述</span></span>
<span class="line"><span>   targets.darwin.defaults.&quot;com.apple.dock&quot;.orientation = &quot;right&quot;;  ← 描述</span></span>
<span class="line"><span>   ...</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   描述 = 当前系统状态</span></span>
<span class="line"><span>   &quot;系统现在是什么样&quot; = 描述文件直接告诉你</span></span>
<span class="line"><span>   &quot;怎么来的&quot; = git log</span></span></code></pre></div><p><strong>命令式是过程,声明式是状态</strong>。<strong>Nix 是这两个范式的差别</strong>——一旦理解,你看 brew 就像在看「忘记动作就找不回来的状态」。</p><hr><h2 id="三、nix-的三种用法" tabindex="-1">三、Nix 的三种用法 <a class="header-anchor" href="#三、nix-的三种用法" aria-label="Permalink to &quot;三、Nix 的三种用法&quot;">​</a></h2><p>Nix 有 3 个层级,<strong>入坑前一定要分清,选最浅的开始</strong>。</p><h3 id="_3-1-层级-1-只装-nix-macos-linux-用户" tabindex="-1">3.1 层级 1:只装 Nix(macOS / Linux 用户) <a class="header-anchor" href="#_3-1-层级-1-只装-nix-macos-linux-用户" aria-label="Permalink to &quot;3.1 层级 1:只装 Nix(macOS / Linux 用户)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>在你现有的 OS 上,只装 Nix 这个包管理器。</span></span>
<span class="line"><span>   不动你的 macOS / Ubuntu / Arch</span></span>
<span class="line"><span>   不动你的 brew / apt</span></span>
<span class="line"><span>   只在 /nix/store 多一个目录,$PATH 里多一段</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   能用 Nix 做的:</span></span>
<span class="line"><span>      - nix run nixpkgs#hello       (跑某个包,不装)</span></span>
<span class="line"><span>      - nix profile install nixpkgs#ripgrep   (装到用户 profile)</span></span>
<span class="line"><span>      - nix develop                 (进入项目专属 devShell)</span></span>
<span class="line"><span>      - flake.nix 给项目定义可复现环境</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   入门门槛:★★(装 Nix + 学几个命令)</span></span></code></pre></div><p><strong>适合</strong>:<strong>90% 想试 Nix 的工程师</strong>。<strong>就这个层级</strong>。不要往下跳。</p><h3 id="_3-2-层级-2-nix-home-manager-管-dotfiles-用户包" tabindex="-1">3.2 层级 2:Nix + home-manager(管 dotfiles + 用户包) <a class="header-anchor" href="#_3-2-层级-2-nix-home-manager-管-dotfiles-用户包" aria-label="Permalink to &quot;3.2 层级 2:Nix + home-manager(管 dotfiles + 用户包)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>在层级 1 之上,装 home-manager。</span></span>
<span class="line"><span>   home-manager 是一个 Nix 模块,管:</span></span>
<span class="line"><span>      - 你的用户级 dotfiles(.zshrc / .gitconfig / .config/nvim)</span></span>
<span class="line"><span>      - 你的用户级包(per-user 装包)</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   你写一份 home.nix,描述&quot;我的用户环境长什么样&quot;</span></span>
<span class="line"><span>   home-manager switch 一行,环境对齐</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   入门门槛:★★★(学 Nix DSL + home-manager 模块)</span></span></code></pre></div><p><strong>适合</strong>:<strong>已经在层级 1 玩 1-2 个月,想把 dotfiles 也用 Nix 管的人</strong>。</p><h3 id="_3-3-层级-3-nixos-整盘装-nixos-nix-darwin-管-macos-系统" tabindex="-1">3.3 层级 3:NixOS(整盘装 NixOS)/ nix-darwin(管 macOS 系统) <a class="header-anchor" href="#_3-3-层级-3-nixos-整盘装-nixos-nix-darwin-管-macos-系统" aria-label="Permalink to &quot;3.3 层级 3:NixOS(整盘装 NixOS)/ nix-darwin(管 macOS 系统)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>NixOS (Linux):</span></span>
<span class="line"><span>   整个 OS 都用 Nix 描述</span></span>
<span class="line"><span>   /etc/nixos/configuration.nix 是这台机器的&quot;定义&quot;</span></span>
<span class="line"><span>   重装就是装 NixOS + 拷贝这个文件 + 一行 nixos-rebuild switch</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>nix-darwin (macOS):</span></span>
<span class="line"><span>   把 macOS 的系统级配置也用 Nix 描述</span></span>
<span class="line"><span>   ~/.config/nix-darwin/darwin-configuration.nix</span></span>
<span class="line"><span>   darwin-rebuild switch 应用配置</span></span>
<span class="line"><span>   能改 macOS 默认设置(defaults write)、装 brew cask、设服务</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   入门门槛:★★★★★(NixOS 是&quot;换 OS&quot;,nix-darwin 是&quot;接管 macOS 系统设置&quot;)</span></span></code></pre></div><p><strong>适合</strong>:<strong>已经在层级 2 玩半年以上、想&quot;整台机器声明式&quot;的极客</strong>。<strong>绝大多数人不需要走到这里</strong>。</p><h3 id="_3-4-这一篇的主推路径" tabindex="-1">3.4 这一篇的主推路径 <a class="header-anchor" href="#_3-4-这一篇的主推路径" aria-label="Permalink to &quot;3.4 这一篇的主推路径&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>本篇主推:</span></span>
<span class="line"><span>   层级 1:Nix(包管理器,装在 macOS / Linux 上)</span></span>
<span class="line"><span>        ↓</span></span>
<span class="line"><span>   层级 2:home-manager(管 dotfiles)</span></span>
<span class="line"><span>        ↓ (可选,半年后)</span></span>
<span class="line"><span>   层级 3:nix-darwin(macOS 系统级)</span></span>
<span class="line"><span>        或 NixOS(Linux 整盘装)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>不推荐:</span></span>
<span class="line"><span>   ✗ 上来直接装 NixOS(陡 + 全 OS 一起换)</span></span>
<span class="line"><span>   ✗ 用 macOS,把所有东西丢给 nix-darwin(GUI 应用不好管)</span></span>
<span class="line"><span>   ✗ 在团队里强推 Nix(没人 review 你的 nix 配置)</span></span></code></pre></div><hr><h2 id="四、nix-dsl-速通" tabindex="-1">四、Nix DSL 速通 <a class="header-anchor" href="#四、nix-dsl-速通" aria-label="Permalink to &quot;四、Nix DSL 速通&quot;">​</a></h2><p>Nix 是<strong>函数式表达式语言</strong>,语法陌生但概念简单。<strong>6 个语法点搞定</strong>:</p><h3 id="_4-1-字面量" tabindex="-1">4.1 字面量 <a class="header-anchor" href="#_4-1-字面量" aria-label="Permalink to &quot;4.1 字面量&quot;">​</a></h3><div class="language-nix vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">nix</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 字符串</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;hello&quot;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;&#39;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  multi-line</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  string</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;&#39;</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">   # 双单引号</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 数字</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">42</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">3</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">.</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">14</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 布尔</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">true</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">false</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># null</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">null</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 列表(空格分隔)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">[ </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">1</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 2</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 3</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> ]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">[ </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;a&quot;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;b&quot;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;c&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> ]</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 属性集(类似 JS object)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">{</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  name</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;alice&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  age</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 30</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span></code></pre></div><h3 id="_4-2-函数-单参数-curry" tabindex="-1">4.2 函数(单参数,curry) <a class="header-anchor" href="#_4-2-函数-单参数-curry" aria-label="Permalink to &quot;4.2 函数(单参数,curry)&quot;">​</a></h3><div class="language-nix vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">nix</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 一元函数</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">x: </span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">x</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> +</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 1</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 多元函数(其实是 curry)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">x: y: </span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">x</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> +</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;"> y</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 调用</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(x: </span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">x</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> +</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 1</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">) </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">5</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # = 6</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 命名参数(属性集解构)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">{ name</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">,</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> age }: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">\${</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">name</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">}</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> is </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">\${</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">toString</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> age</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">}</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 调用</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">({ name</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">,</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> age }: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">\${</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">name</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">}</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> is </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">\${</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">toString</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> age</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">}</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">) { </span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">name</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;alice&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">; </span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">age</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 30</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">; }</span></span></code></pre></div><h3 id="_4-3-let-in-局部变量" tabindex="-1">4.3 let / in 局部变量 <a class="header-anchor" href="#_4-3-let-in-局部变量" aria-label="Permalink to &quot;4.3 let / in 局部变量&quot;">​</a></h3><div class="language-nix vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">nix</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">let</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  x</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 1</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  y</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 2</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">in</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">  x</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> +</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;"> y</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">     # = 3</span></span></code></pre></div><h3 id="_4-4-with-类似-javascript-的-with-作用域注入" tabindex="-1">4.4 with(类似 JavaScript 的 with,作用域注入) <a class="header-anchor" href="#_4-4-with-类似-javascript-的-with-作用域注入" aria-label="Permalink to &quot;4.4 with(类似 JavaScript 的 with,作用域注入)&quot;">​</a></h3><div class="language-nix vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">nix</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">let</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  pkgs</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> { </span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">hello</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;world&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">; </span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">foo</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;bar&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">; };</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">in</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">  with</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;"> pkgs</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">; [ </span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">hello</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;"> foo</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> ]    </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># = [ &quot;world&quot; &quot;bar&quot; ]</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  # 等同于 [ pkgs.hello pkgs.foo ]</span></span></code></pre></div><p><strong>在 Nix 配置里经常看到 <code>with pkgs; [...]</code></strong>,意思是「打开 <code>pkgs</code> 这个属性集的命名空间」,<strong>写包名不用 <code>pkgs.</code> 前缀</strong>。</p><h3 id="_4-5-import-函数即文件" tabindex="-1">4.5 import / 函数即文件 <a class="header-anchor" href="#_4-5-import-函数即文件" aria-label="Permalink to &quot;4.5 import / 函数即文件&quot;">​</a></h3><div class="language-nix vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">nix</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 一个 .nix 文件就是一个表达式,可以 import</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">let</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  helpers</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> import</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ./helpers.nix</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">in</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">  helpers</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">.</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">someFunction</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;arg&quot;</span></span></code></pre></div><h3 id="_4-6-mkshell-mkderivation-实际写-flake-用到的" tabindex="-1">4.6 mkShell / mkDerivation(实际写 flake 用到的) <a class="header-anchor" href="#_4-6-mkshell-mkderivation-实际写-flake-用到的" aria-label="Permalink to &quot;4.6 mkShell / mkDerivation(实际写 flake 用到的)&quot;">​</a></h3><div class="language-nix vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">nix</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 一份 shell.nix(项目专属开发环境)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">{ pkgs </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">?</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> import</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &lt;nixpkgs&gt;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {} }:</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">pkgs</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">.</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">mkShell</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  buildInputs</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> with</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;"> pkgs</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">; [</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    nodejs_22</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    python312</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    rust-bin</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">.</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">stable</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">.</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">latest</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">.</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">default</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    postgresql_16</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  ];</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  </span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  shellHook</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;&#39;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    echo &quot;Welcome to dev environment&quot;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    export DATABASE_URL=&quot;postgres://localhost/dev&quot;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  &#39;&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span></code></pre></div><p><strong>解释</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>{ pkgs ? import &lt;nixpkgs&gt; {} }: ...</span></span>
<span class="line"><span>   这是一个函数:</span></span>
<span class="line"><span>   - 参数 pkgs,默认值是 &quot;import &lt;nixpkgs&gt; {}&quot;(取 nixpkgs 仓库)</span></span>
<span class="line"><span>   - 函数体是 pkgs.mkShell { ... }</span></span>
<span class="line"><span></span></span>
<span class="line"><span>mkShell { buildInputs = ...; shellHook = ...; }</span></span>
<span class="line"><span>   调用 mkShell 函数,传一个属性集:</span></span>
<span class="line"><span>   - buildInputs:这个 shell 里要可用的包</span></span>
<span class="line"><span>   - shellHook:进入 shell 时跑的 bash 脚本</span></span></code></pre></div><p><strong>用法</strong>:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">nix-shell</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">      # 进入这个 shell(老姿势)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">nix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> develop</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # 用 flake 时(新姿势)</span></span></code></pre></div><p><strong>至此你看 Nix 表达式不再陌生了</strong>——<code>{ ... }</code> 是属性集,<code>x: ...</code> 是函数,<code>with ...</code> 是命名空间。</p><hr><h2 id="五、flakes-速通" tabindex="-1">五、flakes 速通 <a class="header-anchor" href="#五、flakes-速通" aria-label="Permalink to &quot;五、flakes 速通&quot;">​</a></h2><p>flakes 是 Nix 2021 加的实验功能,<strong>2026 已经事实标准</strong>。<strong>新项目无脑用 flake</strong>。</p><h3 id="_5-1-为什么要-flakes" tabindex="-1">5.1 为什么要 flakes <a class="header-anchor" href="#_5-1-为什么要-flakes" aria-label="Permalink to &quot;5.1 为什么要 flakes&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>传统 nix-shell:</span></span>
<span class="line"><span>   shell.nix 依赖 &lt;nixpkgs&gt;,这是个 channel(滚动更新)</span></span>
<span class="line"><span>   ──&gt; 你的 shell.nix 今天跑出 Python 3.12.4</span></span>
<span class="line"><span>   ──&gt; 半年后再跑,可能是 3.12.7</span></span>
<span class="line"><span>   ──&gt; 跟 brew install python 一样不可复现</span></span>
<span class="line"><span></span></span>
<span class="line"><span>flakes:</span></span>
<span class="line"><span>   flake.nix + flake.lock</span></span>
<span class="line"><span>   ──&gt; flake.lock 锁定具体的 nixpkgs 版本(到 commit 级)</span></span>
<span class="line"><span>   ──&gt; 任何机器、任何时间跑同一个 flake,产出完全相同</span></span></code></pre></div><p><strong>flake = Nix 的 package.json + lock 文件</strong>。</p><h3 id="_5-2-最小-flake-nix" tabindex="-1">5.2 最小 flake.nix <a class="header-anchor" href="#_5-2-最小-flake-nix" aria-label="Permalink to &quot;5.2 最小 flake.nix&quot;">​</a></h3><div class="language-nix vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">nix</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">{</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  description</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;My dev environment&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  inputs</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    nixpkgs</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">url</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;github:NixOS/nixpkgs/nixos-24.05&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    flake-utils</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">url</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;github:numtide/flake-utils&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  };</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  outputs</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> { self</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">,</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> nixpkgs</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">,</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> flake-utils }:</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    flake-utils</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">.</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">lib</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">.</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">eachDefaultSystem</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (system:</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">      let</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">        pkgs</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;"> nixpkgs</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">.</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">legacyPackages</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">.</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">\${</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">system</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">};</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">      in</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">        devShells</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">default</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;"> pkgs</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">.</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">mkShell</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">          buildInputs</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> with</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;"> pkgs</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">; [</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">            nodejs_22</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">            python312</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">            postgresql_16</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">            ripgrep</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">            fzf</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">          ];</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">          </span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">          shellHook</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;&#39;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            echo &quot;Dev shell ready (Node $(node --version), Python $(python --version))&quot;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          &#39;&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        };</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      });</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span></code></pre></div><p><strong>用法</strong>:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 项目根</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">cd</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ~/my-project</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 写 flake.nix(上面那段)</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 进入 dev shell</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">nix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> develop</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 现在 PATH 里有 node 22 / python 3.12 / postgres 16 / rg / fzf</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 退出</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">exit</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 改 flake 后,生成 lock 文件</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">nix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> flake</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> lock</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">git</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> add</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> flake.nix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> flake.lock</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">git</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> commit</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -m</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;feat: add nix dev shell&quot;</span></span></code></pre></div><h3 id="_5-3-flake-lock-锁文件" tabindex="-1">5.3 flake.lock 锁文件 <a class="header-anchor" href="#_5-3-flake-lock-锁文件" aria-label="Permalink to &quot;5.3 flake.lock 锁文件&quot;">​</a></h3><div class="language-json vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">json</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">{</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  &quot;nodes&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: {</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    &quot;nixpkgs&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: {</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">      &quot;locked&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: {</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        &quot;lastModified&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">1719842600</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        &quot;rev&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;abc123...def789&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        &quot;type&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;github&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        &quot;owner&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;NixOS&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        &quot;repo&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;nixpkgs&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        &quot;ref&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;nixos-24.05&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      }</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    },</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    &quot;flake-utils&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: { </span><span style="--shiki-light:#B31D28;--shiki-light-font-style:italic;--shiki-dark:#FDAEB7;--shiki-dark-font-style:italic;">...</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> }</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  },</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  &quot;version&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">7</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span></code></pre></div><p><strong>所有 input(nixpkgs / flake-utils)都锁到具体 commit hash</strong>。<strong>5 年后跑同一个 flake,装出的 Node 22 是同一个二进制</strong>。</p><h3 id="_5-4-升级-input" tabindex="-1">5.4 升级 input <a class="header-anchor" href="#_5-4-升级-input" aria-label="Permalink to &quot;5.4 升级 input&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 升级所有 input 到最新</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">nix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> flake</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> update</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 只升级 nixpkgs</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">nix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> flake</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> lock</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --update-input</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> nixpkgs</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 看 input 状态</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">nix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> flake</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> metadata</span></span></code></pre></div><h3 id="_5-5-nix-develop-是-dev-container-替代" tabindex="-1">5.5 nix develop 是 dev container 替代 <a class="header-anchor" href="#_5-5-nix-develop-是-dev-container-替代" aria-label="Permalink to &quot;5.5 nix develop 是 dev container 替代&quot;">​</a></h3><p><strong>24 篇看了 mise [tasks] 是轻量任务运行器</strong>。<strong>flake 的 <code>devShells</code> 是轻量 dev container</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>传统 dev container(VS Code):</span></span>
<span class="line"><span>   .devcontainer/devcontainer.json + Dockerfile</span></span>
<span class="line"><span>   一个 Docker 镜像,几 GB,启动慢</span></span>
<span class="line"><span>   要装 Docker</span></span>
<span class="line"><span>   只在 VS Code 里方便</span></span>
<span class="line"><span></span></span>
<span class="line"><span>nix develop:</span></span>
<span class="line"><span>   flake.nix(几十行)</span></span>
<span class="line"><span>   不要 Docker,直接在 host 上跑</span></span>
<span class="line"><span>   启动毫秒级(Nix store 内容已经装好)</span></span>
<span class="line"><span>   任何编辑器都行(终端、Vim、Cursor)</span></span>
<span class="line"><span>   跨平台:Linux + macOS 同一份 flake</span></span></code></pre></div><p><strong>26 篇会专讲 Devcontainer</strong>,这里只点:<strong>Nix devShell 是&quot;轻量 + 跨编辑器&quot;的 dev 环境替代品</strong>。</p><hr><h2 id="六、home-manager-声明式-dotfiles" tabindex="-1">六、home-manager:声明式 dotfiles <a class="header-anchor" href="#六、home-manager-声明式-dotfiles" aria-label="Permalink to &quot;六、home-manager:声明式 dotfiles&quot;">​</a></h2><p>home-manager 是 Nix 生态里<strong>最实用的工具之一</strong>——<strong>用 Nix 描述你的 dotfiles</strong>。</p><h3 id="_6-1-home-manager-解决什么" tabindex="-1">6.1 home-manager 解决什么 <a class="header-anchor" href="#_6-1-home-manager-解决什么" aria-label="Permalink to &quot;6.1 home-manager 解决什么&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>传统 dotfiles 仓库:</span></span>
<span class="line"><span>   ~/.zshrc           (一份手写的 bash 脚本)</span></span>
<span class="line"><span>   ~/.gitconfig       (一份手写的 ini)</span></span>
<span class="line"><span>   ~/.tmux.conf       (一份手写的 tmux 配置)</span></span>
<span class="line"><span>   ~/.config/nvim/init.lua (lua 配置)</span></span>
<span class="line"><span>   ~/.config/starship.toml</span></span>
<span class="line"><span>   ...</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   用 chezmoi / stow / 裸 git 把这些同步到多台机器</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>痛点:</span></span>
<span class="line"><span>   - 这些是&quot;被部署的产物&quot;,不是&quot;我希望的描述&quot;</span></span>
<span class="line"><span>   - .zshrc 里抄 oh-my-zsh 一段 + 自己写的 + 临时改的,混在一起</span></span>
<span class="line"><span>   - 改完不知道改对了没,要 source 一次试</span></span>
<span class="line"><span>   - 新机器装完,可能某个 brew install 没装,某个 alias 没生效</span></span></code></pre></div><p><strong>home-manager 的做法</strong>:<strong>用 Nix 描述每个工具的配置,生成对应的 dotfile</strong>:</p><div class="language-nix vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">nix</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># home.nix</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">{ config</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">,</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> pkgs</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">,</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> ... </span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}:</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">{</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  home</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">username</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;me&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  home</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">homeDirectory</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;/Users/me&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  home</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">stateVersion</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;24.05&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  # 装这些包到用户级</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  home</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">packages</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> with</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;"> pkgs</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">; [</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    ripgrep</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    fd</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    bat</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    eza</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    fzf</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    jq</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    httpie</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    tmux</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    neovim</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    starship</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  ];</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  # 配置 git</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  programs</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">git</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    enable</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> true</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    userName</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;Me&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    userEmail</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;me@example.com&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    aliases</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">      st</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;status&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">      ci</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;commit&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">      co</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;checkout&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    };</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    extraConfig</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">      core</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">editor</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;nvim&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">      pull</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">rebase</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> true</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">      init</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">defaultBranch</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;main&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    };</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  };</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  # 配置 zsh</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  programs</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">zsh</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    enable</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> true</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    enableCompletion</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> true</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    autosuggestion</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">enable</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> true</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    syntaxHighlighting</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">enable</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> true</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    </span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    shellAliases</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">      ll</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;eza -la&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">      g</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;git&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">      v</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;nvim&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">      cat</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;bat&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    };</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    </span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    history</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">      size</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 100000</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">      path</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">\${</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">config</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">.</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">xdg</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">.</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">dataHome</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">}</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">/zsh/history&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    };</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    </span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    initContent</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;&#39;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">      eval &quot;$(mise activate zsh)&quot;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    &#39;&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  };</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  # 配置 starship 提示符</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  programs</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">starship</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    enable</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> true</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    settings</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">      add_newline</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> false</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">      character</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">        success_symbol</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;[➜](bold green)&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">        error_symbol</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;[➜](bold red)&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      };</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    };</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  };</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  # 配置 tmux</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  programs</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">tmux</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    enable</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> true</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    prefix</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;C-a&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    mouse</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> true</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    keyMode</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;vi&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    extraConfig</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;&#39;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">      set -g default-terminal &quot;screen-256color&quot;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">      bind | split-window -h</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">      bind - split-window -v</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    &#39;&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  };</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span></code></pre></div><p><strong>用法</strong>:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 装 home-manager(一行)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">nix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> run</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> home-manager</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> init</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --switch</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 改了 home.nix 之后</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">home-manager</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> switch</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 一行生效:</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#   - 装/卸包(包列表对齐)</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#   - 改 ~/.zshrc / ~/.gitconfig / ~/.tmux.conf (内容对齐)</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#   - 服务启动/停止(launchd / systemd)</span></span></code></pre></div><h3 id="_6-2-home-manager-的杀手特性" tabindex="-1">6.2 home-manager 的杀手特性 <a class="header-anchor" href="#_6-2-home-manager-的杀手特性" aria-label="Permalink to &quot;6.2 home-manager 的杀手特性&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 每次 switch 生成一个 generation</span></span>
<span class="line"><span>   home-manager generations</span></span>
<span class="line"><span>   ──&gt; 看历史 + 切回去</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>2. 包和配置原子化</span></span>
<span class="line"><span>   要么全装好,要么不变</span></span>
<span class="line"><span>   ──&gt; 不会出现 &quot;包装了但配置没改&quot; 的中间状态</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. 跨平台</span></span>
<span class="line"><span>   同一份 home.nix 在 macOS / Linux 都跑</span></span>
<span class="line"><span></span></span>
<span class="line"><span>4. 模块化</span></span>
<span class="line"><span>   imports = [ ./modules/zsh.nix ./modules/git.nix ];</span></span>
<span class="line"><span>   ──&gt; 拆成多个文件维护</span></span>
<span class="line"><span></span></span>
<span class="line"><span>5. 跟 nix-darwin / NixOS 无缝集成</span></span>
<span class="line"><span>   把 home-manager 嵌入到 system config 里</span></span></code></pre></div><h3 id="_6-3-chezmoi-vs-home-manager" tabindex="-1">6.3 chezmoi vs home-manager <a class="header-anchor" href="#_6-3-chezmoi-vs-home-manager" aria-label="Permalink to &quot;6.3 chezmoi vs home-manager&quot;">​</a></h3><p><strong>22 篇讲了 chezmoi</strong>(dotfiles 模板工具)。<strong>home-manager 是更激进的替代</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                    chezmoi              home-manager</span></span>
<span class="line"><span>心智                  模板渲染 + 文件部署    声明式 + Nix 表达式</span></span>
<span class="line"><span>描述能力              字符串模板            完整函数式语言</span></span>
<span class="line"><span>管包                  无(配合 brew)        有(Nix 装包)</span></span>
<span class="line"><span>跨平台                ★★★★(挺好)         ★★★★★(完美)</span></span>
<span class="line"><span>学习曲线              ★★(简单)            ★★★★★(陡)</span></span>
<span class="line"><span>启动慢                无                    无</span></span>
<span class="line"><span>社区生态              新                    完整</span></span>
<span class="line"><span>GUI 友好              一般                  差(主要是 CLI 包)</span></span>
<span class="line"><span>适用场景              个人 dotfiles + brew   团队 + 跨 OS + 全声明</span></span></code></pre></div><p><strong>结论</strong>:<strong>chezmoi 是 70 分方案,够大多数人</strong>;<strong>home-manager 是 95 分方案,陡,但是真终极</strong>。</p><hr><h2 id="七、nix-darwin-管-macos-系统级" tabindex="-1">七、nix-darwin:管 macOS 系统级 <a class="header-anchor" href="#七、nix-darwin-管-macos-系统级" aria-label="Permalink to &quot;七、nix-darwin:管 macOS 系统级&quot;">​</a></h2><p>如果你只用 macOS、想&quot;系统级也声明式&quot;,<strong>nix-darwin</strong> 是答案。</p><h3 id="_7-1-nix-darwin-能管什么" tabindex="-1">7.1 nix-darwin 能管什么 <a class="header-anchor" href="#_7-1-nix-darwin-能管什么" aria-label="Permalink to &quot;7.1 nix-darwin 能管什么&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>- 系统级包(/run/current-system/sw/bin/)</span></span>
<span class="line"><span>- 系统级服务(launchd)</span></span>
<span class="line"><span>- macOS defaults(defaults write 一类)</span></span>
<span class="line"><span>- 字体(系统级字体)</span></span>
<span class="line"><span>- 用户(/etc/passwd)</span></span>
<span class="line"><span>- shells(/etc/shells)</span></span>
<span class="line"><span>- brew bundle(让 Nix 调用 brew 装 cask)</span></span>
<span class="line"><span>- home-manager(嵌入)</span></span></code></pre></div><h3 id="_7-2-最小-darwin-configuration-nix" tabindex="-1">7.2 最小 darwin-configuration.nix <a class="header-anchor" href="#_7-2-最小-darwin-configuration-nix" aria-label="Permalink to &quot;7.2 最小 darwin-configuration.nix&quot;">​</a></h3><div class="language-nix vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">nix</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># ~/.config/nix-darwin/flake.nix</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">{</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  description</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;My macOS&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  inputs</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    nixpkgs</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">url</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;github:NixOS/nixpkgs/nixpkgs-unstable&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    nix-darwin</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">url</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;github:LnL7/nix-darwin&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    nix-darwin</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">inputs</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">nixpkgs</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">follows</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;nixpkgs&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    home-manager</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">url</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;github:nix-community/home-manager&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    home-manager</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">inputs</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">nixpkgs</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">follows</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;nixpkgs&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  };</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  outputs</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> inputs@{ self</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">,</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> nix-darwin</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">,</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> nixpkgs</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">,</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> home-manager }: {</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    darwinConfigurations</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;my-mac&quot;</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;"> nix-darwin</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">.</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">lib</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">.</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">darwinSystem</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">      system</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;aarch64-darwin&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">      modules</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> [</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        ({ pkgs</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">,</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> ... </span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}: {</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">          # 系统级包</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">          environment</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">systemPackages</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> with</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;"> pkgs</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">; [</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">            git</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">            vim</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">            curl</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">          ];</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">          # 让 nix-darwin 管 brew cask</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">          homebrew</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">            enable</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> true</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">            brews</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> [ ];</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">            casks</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> [</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">              &quot;ghostty&quot;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">              &quot;raycast&quot;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">              &quot;slack&quot;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">              &quot;1password&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            ];</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">            onActivation</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">cleanup</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;uninstall&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;  </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 不在列表里的 cask 自动卸</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">          };</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">          # macOS 系统默认设置</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">          system</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">defaults</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">            dock</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">              autohide</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> true</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">              orientation</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;right&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">              show-recents</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> false</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            };</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">            finder</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">              AppleShowAllExtensions</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> true</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">              ShowPathbar</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> true</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            };</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">            NSGlobalDomain</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">              AppleShowAllExtensions</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> true</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">              InitialKeyRepeat</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 14</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">              KeyRepeat</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 1</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">              &quot;com.apple.keyboard.fnState&quot;</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> true</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            };</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">          };</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">          # 字体</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">          fonts</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">packages</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> with</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;"> pkgs</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">; [</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            (</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">nerdfonts</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">.</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">override</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> { </span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">fonts</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> [ </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;JetBrainsMono&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> ]; })</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">          ];</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">          # zsh 全局开启</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">          programs</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">zsh</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">enable</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> true</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">          # 用户</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">          users</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">users</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">me</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">            name</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;me&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">            home</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;/Users/me&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">          };</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">          # state version(锁)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">          system</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">stateVersion</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 5</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        })</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">        # 把 home-manager 也挂进来</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">        home-manager</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">.</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">darwinModules</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">.</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">home-manager</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        {</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">          home-manager</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">useGlobalPkgs</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> true</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">          home-manager</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">useUserPackages</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> true</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">          home-manager</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">users</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">me</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> import</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ./home.nix</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        }</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      ];</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    };</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  };</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span></code></pre></div><p><strong>用法</strong>:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 第一次装</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">nix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> run</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> nix-darwin</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> switch</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --flake</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ~/.config/nix-darwin#my-mac</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 之后改了 flake.nix 或 home.nix</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">darwin-rebuild</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> switch</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --flake</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ~/.config/nix-darwin#my-mac</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 一行:</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#   - 装/卸系统包</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#   - 装/卸 brew cask</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#   - 应用 macOS defaults</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#   - 装字体</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#   - home-manager 也一并 switch</span></span></code></pre></div><p><strong>重装 Mac 的步骤</strong>:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 新 Mac 到手,装完系统后:</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 1. 装 Nix</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sh</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &lt;(</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">curl</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -L</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> https://nixos.org/nix/install)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 2. 拉 dotfiles repo</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">git</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> clone</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> git@github.com:me/dotfiles.git</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ~/.config/nix-darwin</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 3. 一行复刻</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">nix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> run</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> nix-darwin</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> switch</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --flake</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ~/.config/nix-darwin#my-mac</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 等 5-15 分钟,机器变回你的样子</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># - 所有包装好</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># - 所有 cask 装好</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># - 所有系统设置改好</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># - 所有 dotfiles 部署</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># - 字体装好</span></span></code></pre></div><p><strong>这才是&quot;换机不换工作流&quot;的真正终点</strong>。</p><hr><h2 id="八、nix-vs-mise-brew-chezmoi-全方位对比" tabindex="-1">八、Nix vs mise / brew + chezmoi 全方位对比 <a class="header-anchor" href="#八、nix-vs-mise-brew-chezmoi-全方位对比" aria-label="Permalink to &quot;八、Nix vs mise / brew + chezmoi 全方位对比&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌─────────────────────┬─────────┬──────────────────────┐</span></span>
<span class="line"><span>│                     │   Nix   │   brew + chezmoi+mise │</span></span>
<span class="line"><span>├─────────────────────┼─────────┼──────────────────────┤</span></span>
<span class="line"><span>│ 可复现度             │   ★★★★★ │   ★★★(取决于 brew    │</span></span>
<span class="line"><span>│                     │         │   当前仓库状态)      │</span></span>
<span class="line"><span>│ 跨平台一致           │   ★★★★★ │   ★★★(macOS-centric, │</span></span>
<span class="line"><span>│                     │         │   Linux 用 apt)      │</span></span>
<span class="line"><span>│ rollback             │   ★★★★★ │   ★(brew 没有,      │</span></span>
<span class="line"><span>│                     │         │   chezmoi 用 git)    │</span></span>
<span class="line"><span>│ 学习曲线             │   ★★★★★ │   ★★(普通)         │</span></span>
<span class="line"><span>│   (陡)             │         │                      │</span></span>
<span class="line"><span>│ 社区 / 文档          │   ★★(零散  │   ★★★★(主流)      │</span></span>
<span class="line"><span>│                     │   + 双轨)│                      │</span></span>
<span class="line"><span>│ GUI 应用生态         │   ★(差)│   ★★★★(brew cask)   │</span></span>
<span class="line"><span>│ 启动延迟             │   ★★(eval│   ★★★★★(快)        │</span></span>
<span class="line"><span>│                     │   慢)   │                      │</span></span>
<span class="line"><span>│ secret 管理         │   ★★★(sops│   ★★★★(用 mise)    │</span></span>
<span class="line"><span>│                     │   -nix)  │                      │</span></span>
<span class="line"><span>│ 团队推广难度          │   ★★★★★ │   ★★(易)           │</span></span>
<span class="line"><span>│   (难)             │         │                      │</span></span>
<span class="line"><span>│ 长期复利              │   ★★★★★ │   ★★★(中)          │</span></span>
<span class="line"><span>│                     │         │                      │</span></span>
<span class="line"><span>│ &quot;新机器复刻&quot;时间      │   10-30  │   1-3 小时           │</span></span>
<span class="line"><span>│                     │   分钟   │                      │</span></span>
<span class="line"><span>│ 5 年后还能跑同结果   │   ✓       │   ✗(brew 不锁版本)  │</span></span>
<span class="line"><span>└─────────────────────┴─────────┴──────────────────────┘</span></span></code></pre></div><p><strong>翻译这张表</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>你是不是这样:</span></span>
<span class="line"><span>   ✓ 一台 Mac 用 5 年,不换 OS</span></span>
<span class="line"><span>   ✓ 个人开发,没团队</span></span>
<span class="line"><span>   ✓ 不要 patch 级可复现</span></span>
<span class="line"><span>   ✓ 想要 GUI 应用、cask 生态</span></span>
<span class="line"><span>   ──&gt; brew + chezmoi + mise 完全够</span></span>
<span class="line"><span></span></span>
<span class="line"><span>你是不是这样:</span></span>
<span class="line"><span>   ✓ 团队跨 macOS + Linux 开发</span></span>
<span class="line"><span>   ✓ 每年换 2-3 次机器(公司发的 / 跳槽 / 远端机)</span></span>
<span class="line"><span>   ✓ 要&quot;5 年后还能复刻今天环境&quot;</span></span>
<span class="line"><span>   ✓ 能接受 2-4 周陡坡</span></span>
<span class="line"><span>   ✓ 函数式心智不排斥</span></span>
<span class="line"><span>   ──&gt; Nix 是值的</span></span></code></pre></div><hr><h2 id="九、入门路径-不踩坑的-5-步" tabindex="-1">九、入门路径:不踩坑的 5 步 <a class="header-anchor" href="#九、入门路径-不踩坑的-5-步" aria-label="Permalink to &quot;九、入门路径:不踩坑的 5 步&quot;">​</a></h2><p><strong>绝大多数失败案例都是「一上来就 NixOS / 一上来就 flake-parts 全家桶」</strong>。<strong>正确路径如下</strong>:</p><h3 id="_9-1-步骤-1-在-macos-linux-装-nix-无-nixos" tabindex="-1">9.1 步骤 1:在 macOS / Linux 装 Nix(无 NixOS) <a class="header-anchor" href="#_9-1-步骤-1-在-macos-linux-装-nix-无-nixos" aria-label="Permalink to &quot;9.1 步骤 1:在 macOS / Linux 装 Nix(无 NixOS)&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 用 Determinate Systems 的安装器(比官方好,带 flakes 默认开)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">curl</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --proto</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;=https&#39;</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --tlsv1.2</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -sSf</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -L</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  https://install.determinate.systems/nix</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> |</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> sh</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -s</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> install</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 验证</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">nix</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --version</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># nix (Nix) 2.24.x</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 试一下 nix run</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">nix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> run</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> nixpkgs#hello</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Hello, world!</span></span></code></pre></div><p><strong>这一步</strong>:<strong>只装 Nix,不动其他</strong>。<strong>用 1-2 周熟悉 <code>nix run</code> / <code>nix profile</code> / <code>nix search</code></strong>。</p><h3 id="_9-2-步骤-2-给一个项目写-flake-nix" tabindex="-1">9.2 步骤 2:给一个项目写 flake.nix <a class="header-anchor" href="#_9-2-步骤-2-给一个项目写-flake-nix" aria-label="Permalink to &quot;9.2 步骤 2:给一个项目写 flake.nix&quot;">​</a></h3><p>挑你常用的一个项目,<strong>写 flake.nix 当 devShell</strong>:</p><div class="language-nix vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">nix</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># flake.nix</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">{</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  inputs</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    nixpkgs</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">url</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;github:NixOS/nixpkgs/nixos-24.05&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    flake-utils</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">url</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;github:numtide/flake-utils&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  };</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  outputs</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> { self</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">,</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> nixpkgs</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">,</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> flake-utils }:</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    flake-utils</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">.</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">lib</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">.</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">eachDefaultSystem</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (system:</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">      let</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">        pkgs</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;"> nixpkgs</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">.</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">legacyPackages</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">.</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">\${</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">system</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">};</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">      in</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">        devShells</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">default</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;"> pkgs</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">.</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">mkShell</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">          buildInputs</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> with</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;"> pkgs</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">; [</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">            nodejs_22</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">            python312</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">            postgresql_16</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">          ];</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        };</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      });</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span></code></pre></div><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">nix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> flake</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> lock</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">     # 生成 lock</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">git</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> add</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> flake.nix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> flake.lock</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">git</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> commit</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -m</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;feat: add nix dev shell&quot;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 进入 dev shell</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">nix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> develop</span></span></code></pre></div><p><strong>这一步</strong>:<strong>flake 当项目工具(替代部分 mise)</strong>。<strong>用 1 个月感受&quot;5 年后还能跑出同一个 Python&quot;</strong>。</p><h3 id="_9-3-步骤-3-加-home-manager-管-dotfiles" tabindex="-1">9.3 步骤 3:加 home-manager(管 dotfiles) <a class="header-anchor" href="#_9-3-步骤-3-加-home-manager-管-dotfiles" aria-label="Permalink to &quot;9.3 步骤 3:加 home-manager(管 dotfiles)&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 装 home-manager</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">nix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> run</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> home-manager</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> init</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --switch</span></span></code></pre></div><p>写最小的 <code>~/.config/home-manager/home.nix</code>:</p><div class="language-nix vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">nix</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">{ config</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">,</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> pkgs</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">,</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> ... </span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">{</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  home</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">username</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;me&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  home</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">homeDirectory</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;/Users/me&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  home</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">stateVersion</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;24.05&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  home</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">packages</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> with</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;"> pkgs</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">; [</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    ripgrep</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    fd</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    fzf</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    bat</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  ];</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  programs</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">git</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    enable</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> true</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    userName</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;Me&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    userEmail</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;me@example.com&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  };</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span></code></pre></div><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">home-manager</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> switch</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># rg / fd / fzf / bat 装好</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># ~/.gitconfig 生成</span></span></code></pre></div><p><strong>这一步</strong>:<strong>dotfiles 用 home-manager 管</strong>。<strong>用 2 个月把 zsh / tmux / nvim / starship 都迁过来</strong>。</p><h3 id="_9-4-步骤-4-可选-nix-darwin-nixos" tabindex="-1">9.4 步骤 4(可选):nix-darwin / NixOS <a class="header-anchor" href="#_9-4-步骤-4-可选-nix-darwin-nixos" aria-label="Permalink to &quot;9.4 步骤 4(可选):nix-darwin / NixOS&quot;">​</a></h3><p><strong>只有当步骤 3 跑了 3-6 个月、彻底理解 Nix 心智后,再考虑这一步</strong>。</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># macOS:</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">nix</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> run</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> nix-darwin</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> switch</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --flake</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ~/.config/nix-darwin</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Linux:</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 整盘装 NixOS,/etc/nixos/configuration.nix</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> nixos-rebuild</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> switch</span></span></code></pre></div><p><strong>这一步</strong>:<strong>整机声明式,新机器 30 分钟复刻</strong>。</p><h3 id="_9-5-步骤-5-可选-团队推广" tabindex="-1">9.5 步骤 5(可选):团队推广 <a class="header-anchor" href="#_9-5-步骤-5-可选-团队推广" aria-label="Permalink to &quot;9.5 步骤 5(可选):团队推广&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>注意:</span></span>
<span class="line"><span>   团队推广 Nix 比个人难 10 倍</span></span>
<span class="line"><span>   一定要有 1-2 个 nix 老手帮做 review / 救火</span></span>
<span class="line"><span>   否则团队每个人陷&quot;Nix DSL 不会写&quot;的泥潭</span></span>
<span class="line"><span></span></span>
<span class="line"><span>推广策略:</span></span>
<span class="line"><span>   1. 先内部出一份 flake.nix 模板(devShell)</span></span>
<span class="line"><span>   2. 让 1-2 个项目先用,看反馈</span></span>
<span class="line"><span>   3. CI 用 cachix(避免每次重 build)</span></span>
<span class="line"><span>   4. 半年后再讨论 home-manager / nix-darwin</span></span></code></pre></div><hr><h2 id="十、nix-在-2026-的现实" tabindex="-1">十、Nix 在 2026 的现实 <a class="header-anchor" href="#十、nix-在-2026-的现实" aria-label="Permalink to &quot;十、Nix 在 2026 的现实&quot;">​</a></h2><p><strong>优点已经讲了</strong>。<strong>缺点必须讲清楚</strong>——这是 80% 工程师两周后退回 brew 的原因。</p><h3 id="_10-1-文档烂-双轨混乱" tabindex="-1">10.1 文档烂(双轨混乱) <a class="header-anchor" href="#_10-1-文档烂-双轨混乱" aria-label="Permalink to &quot;10.1 文档烂(双轨混乱)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Nix 文档的现状:</span></span>
<span class="line"><span>   - 老姿势:nix-env / nix-channel / configuration.nix(2010+ 老资料)</span></span>
<span class="line"><span>   - 新姿势:nix profile / flakes(2021+,事实标准)</span></span>
<span class="line"><span>   - 官方文档同时有两套,新人懵</span></span>
<span class="line"><span>   - 第三方教程也是两套混着</span></span>
<span class="line"><span></span></span>
<span class="line"><span>你 Google &quot;nix shell.nix tutorial&quot;:</span></span>
<span class="line"><span>   ──&gt; 一半教 shell.nix(老)</span></span>
<span class="line"><span>   ──&gt; 一半教 flake.nix(新)</span></span>
<span class="line"><span>   ──&gt; 两者并不兼容</span></span>
<span class="line"><span>   ──&gt; 你不知道 2026 该信哪个</span></span></code></pre></div><p><strong>经验</strong>:<strong>只学 flakes,不学 channels / nix-env</strong>——<strong>老姿势在死,别浪费时间</strong>。</p><h3 id="_10-2-dsl-错误信息差" tabindex="-1">10.2 DSL 错误信息差 <a class="header-anchor" href="#_10-2-dsl-错误信息差" aria-label="Permalink to &quot;10.2 DSL 错误信息差&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Nix 表达式语言的错误:</span></span>
<span class="line"><span>   error: cannot coerce a function to a string</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   at /nix/store/.../source/flake.nix:42:7:</span></span>
<span class="line"><span>            41|   </span></span>
<span class="line"><span>            42|       hello;</span></span>
<span class="line"><span>              |       ^</span></span>
<span class="line"><span>            43|     ];</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   ──&gt; 这条错误对新人毫无意义</span></span>
<span class="line"><span>       要么去 Discord 问,要么读 nix 源码,要么放弃</span></span></code></pre></div><p><strong>社区在改善</strong>:Nix Language Server (nil / nixd) 渐渐成熟,<strong>配 Neovim / VS Code 能有补全 + 跳转</strong>。但<strong>错误信息这一关至少要 1-2 年</strong>。</p><h3 id="_10-3-启动慢-eval-慢" tabindex="-1">10.3 启动慢(eval 慢) <a class="header-anchor" href="#_10-3-启动慢-eval-慢" aria-label="Permalink to &quot;10.3 启动慢(eval 慢)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>nix flake show</span></span>
<span class="line"><span>   ──&gt; 第一次:nix 解析 nixpkgs 全部表达式</span></span>
<span class="line"><span>   ──&gt; 5-30 秒(取决于机器)</span></span>
<span class="line"><span>   ──&gt; 解析后缓存,后续快</span></span>
<span class="line"><span></span></span>
<span class="line"><span>nix build:</span></span>
<span class="line"><span>   ──&gt; eval(算 hash)+ fetch + build</span></span>
<span class="line"><span>   ──&gt; 复杂 flake 第一次构建 1-5 分钟</span></span></code></pre></div><p><strong>经验</strong>:<strong>配 cachix 共享 binary cache</strong>——团队第一次 build,后续机器拉 cache,<strong>秒级</strong>。</p><h3 id="_10-4-包不在-nixpkgs-怎么办" tabindex="-1">10.4 包不在 nixpkgs 怎么办 <a class="header-anchor" href="#_10-4-包不在-nixpkgs-怎么办" aria-label="Permalink to &quot;10.4 包不在 nixpkgs 怎么办&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>brew 用户习惯:brew install something,99% 能装到</span></span>
<span class="line"><span>nix 用户现实:nix profile install nixpkgs#something</span></span>
<span class="line"><span>   ──&gt; 70% 能装到</span></span>
<span class="line"><span>   ──&gt; 不在 nixpkgs 的:</span></span>
<span class="line"><span>        a. 你自己写一个 derivation(packaging,门槛高)</span></span>
<span class="line"><span>        b. 找社区 overlay(碰运气)</span></span>
<span class="line"><span>        c. 用 nix-shell -p 偷懒(临时)</span></span></code></pre></div><p><strong>经验</strong>:<strong>90% 主流包都在 nixpkgs</strong>。<strong>真正缺包的工程师 packaging 一两次就会</strong>。</p><h3 id="_10-5-gui-应用生态差" tabindex="-1">10.5 GUI 应用生态差 <a class="header-anchor" href="#_10-5-gui-应用生态差" aria-label="Permalink to &quot;10.5 GUI 应用生态差&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Nix 的强项是 CLI 工具</span></span>
<span class="line"><span>   ──&gt; ripgrep / fd / fzf / neovim / git 等,完美</span></span>
<span class="line"><span>GUI 应用是弱项</span></span>
<span class="line"><span>   ──&gt; Slack / Chrome / Spotify 等,nixpkgs 有,但不如 brew cask 主流</span></span>
<span class="line"><span>   ──&gt; macOS 上推荐 nix-darwin 用 homebrew 模块装 cask</span></span></code></pre></div><p><strong>经验</strong>:<strong>Nix 装 CLI,brew cask 装 GUI</strong>(nix-darwin 帮你统一调度)。</p><h3 id="_10-6-谁在用-nix-2026-现状" tabindex="-1">10.6 谁在用 Nix(2026 现状) <a class="header-anchor" href="#_10-6-谁在用-nix-2026-现状" aria-label="Permalink to &quot;10.6 谁在用 Nix(2026 现状)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>认真在用 Nix 的:</span></span>
<span class="line"><span>   ✓ Determinate Systems(出 Nix 商业化的公司)</span></span>
<span class="line"><span>   ✓ Anthropic / OpenAI 部分团队</span></span>
<span class="line"><span>   ✓ Cachix</span></span>
<span class="line"><span>   ✓ Garnix.io</span></span>
<span class="line"><span>   ✓ tweag(Modus 子公司)</span></span>
<span class="line"><span>   ✓ 几个游戏公司(Risk of Rain 2 的工作室)</span></span>
<span class="line"><span>   ✓ 学术界(可复现的实验)</span></span>
<span class="line"><span>   ✓ Haskell / Rust 社区高比例</span></span>
<span class="line"><span></span></span>
<span class="line"><span>主流互联网公司:</span></span>
<span class="line"><span>   ✗ 不流行(brew + Docker 路线更省心)</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>大厂中:</span></span>
<span class="line"><span>   ✓ Shopify 内部用 Nix(部分)</span></span>
<span class="line"><span>   ✓ Replit(部分)</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>个人开发者:</span></span>
<span class="line"><span>   增长快,但绝对数量小</span></span></code></pre></div><hr><h2 id="十一、谁该学-nix" tabindex="-1">十一、谁该学 Nix <a class="header-anchor" href="#十一、谁该学-nix" aria-label="Permalink to &quot;十一、谁该学 Nix&quot;">​</a></h2><p><strong>判定</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>该学 Nix 的人:</span></span>
<span class="line"><span>   ✓ 团队跨 OS(Linux + macOS)开发</span></span>
<span class="line"><span>        ──&gt; 跨平台一致是刚需,Nix 是唯一答案</span></span>
<span class="line"><span>   ✓ 极度看重可复现(科研 / 学术 / SRE)</span></span>
<span class="line"><span>        ──&gt; 5 年后还要跑同一个实验</span></span>
<span class="line"><span>   ✓ 喜欢函数式心智</span></span>
<span class="line"><span>        ──&gt; Haskell / Rust 用户更容易上</span></span>
<span class="line"><span>   ✓ 不怕 2-4 周陡坡</span></span>
<span class="line"><span>        ──&gt; 学习曲线接受</span></span>
<span class="line"><span>   ✓ 有 1-2 个老手帮 review 配置</span></span>
<span class="line"><span>        ──&gt; 团队推广必备</span></span>
<span class="line"><span>   ✓ 自己机器要&quot;一行命令复刻&quot;</span></span>
<span class="line"><span>        ──&gt; nix-darwin / NixOS 给最高境界</span></span>
<span class="line"><span></span></span>
<span class="line"><span>不该学 Nix 的人(现阶段):</span></span>
<span class="line"><span>   ✗ 一台机器自用 + 不换 OS</span></span>
<span class="line"><span>        ──&gt; brew + chezmoi 完全够</span></span>
<span class="line"><span>   ✗ 时间紧 + 需要立刻产出</span></span>
<span class="line"><span>        ──&gt; 学 Nix 浪费 2-4 周</span></span>
<span class="line"><span>   ✗ 团队没人懂 Nix</span></span>
<span class="line"><span>        ──&gt; 没人 review,你写的 nix 是单点</span></span>
<span class="line"><span>   ✗ 主要在写 GUI 应用 / 前端</span></span>
<span class="line"><span>        ──&gt; Nix 强项是 CLI,前端用 mise 就够</span></span>
<span class="line"><span>   ✗ 学 Haskell / 函数式抽象会反感</span></span>
<span class="line"><span>        ──&gt; Nix DSL 是函数式,排斥就是排斥</span></span>
<span class="line"><span>   ✗ 团队是 Windows / WSL2 主力</span></span>
<span class="line"><span>        ──&gt; WSL2 上跑 Nix 别扭</span></span></code></pre></div><p><strong>最直白的建议</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>个人 + macOS:    用 brew + mise + chezmoi(够)</span></span>
<span class="line"><span>个人 + 跨平台:   学 Nix(投入 1 个月)</span></span>
<span class="line"><span>团队 + 跨平台:   团队领导推 Nix(投入 3-6 个月,先试点)</span></span>
<span class="line"><span>团队 + 单平台:   brew + mise + chezmoi(性价比高)</span></span>
<span class="line"><span>科研 / 学术:     学 Nix(可复现是刚需)</span></span>
<span class="line"><span>SRE / Infra:     学 Nix devShell(项目级,值)</span></span></code></pre></div><hr><h2 id="十二、替代方案速对" tabindex="-1">十二、替代方案速对 <a class="header-anchor" href="#十二、替代方案速对" aria-label="Permalink to &quot;十二、替代方案速对&quot;">​</a></h2><p>如果你看完不想学 Nix,<strong>这些是替代方案</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>解决 &quot;可复现 dev env&quot;:</span></span>
<span class="line"><span>   ✓ Docker / Devcontainer(26 篇)</span></span>
<span class="line"><span>     - 优:主流,任何团队都能上</span></span>
<span class="line"><span>     - 劣:启动慢,内存大,只在容器里&quot;复现&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   ✓ Nix flake devShell</span></span>
<span class="line"><span>     - 优:轻量,跨编辑器,5 年后还能复刻</span></span>
<span class="line"><span>     - 劣:陡坡</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   ✓ Vagrant(过时,VM 太重)</span></span>
<span class="line"><span>     - 不推荐</span></span>
<span class="line"><span></span></span>
<span class="line"><span>解决 &quot;多版本工具&quot;:</span></span>
<span class="line"><span>   ✓ mise(24 篇)</span></span>
<span class="line"><span>     - 90% 工程师够</span></span>
<span class="line"><span>   ✓ Nix</span></span>
<span class="line"><span>     - 跨平台一致 + patch 级</span></span>
<span class="line"><span>   ✗ 单独的 nvm / pyenv / rbenv</span></span>
<span class="line"><span>     - 应该死了</span></span>
<span class="line"><span></span></span>
<span class="line"><span>解决 &quot;声明式 dotfiles&quot;:</span></span>
<span class="line"><span>   ✓ chezmoi(22 篇)</span></span>
<span class="line"><span>     - 模板 + git,够大多数人</span></span>
<span class="line"><span>   ✓ home-manager(Nix)</span></span>
<span class="line"><span>     - 终极方案</span></span>
<span class="line"><span>   ✓ stow / 裸 git</span></span>
<span class="line"><span>     - 轻量,不模板化</span></span>
<span class="line"><span></span></span>
<span class="line"><span>解决 &quot;secret 管理&quot;:</span></span>
<span class="line"><span>   ✓ mise + 1Password / vault(24 篇)</span></span>
<span class="line"><span>     - 简单</span></span>
<span class="line"><span>   ✓ sops-nix(Nix 生态)</span></span>
<span class="line"><span>     - 复杂但完整</span></span>
<span class="line"><span>   ✗ .env + git-crypt</span></span>
<span class="line"><span>     - 老姿势,不推荐</span></span></code></pre></div><hr><h2 id="十三、反对的写法" tabindex="-1">十三、反对的写法 <a class="header-anchor" href="#十三、反对的写法" aria-label="Permalink to &quot;十三、反对的写法&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 还没装就抄 awesome-nix 一千行 flake</span></span>
<span class="line"><span>   ──&gt; 那些配置是别人三年沉淀,你拿来用全是坑</span></span>
<span class="line"><span>   ──&gt; 从最小 flake.nix 起步,逐行加自己懂的</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. 上来就 NixOS</span></span>
<span class="line"><span>   ──&gt; 陡坡 + 全 OS 一起换</span></span>
<span class="line"><span>   ──&gt; 失败率 95%,先 Nix → home-manager → 再看</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. 旧 nix-channels + flakes 混着用</span></span>
<span class="line"><span>   ──&gt; 双轨混乱,问题难定位</span></span>
<span class="line"><span>   ──&gt; 只用 flakes(把 nix-channels 删干净)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>4. 用 nix profile install 装所有东西</span></span>
<span class="line"><span>   ──&gt; 这是命令式,违背 Nix 哲学</span></span>
<span class="line"><span>   ──&gt; 装包应该写进 home.nix / flake.nix,然后 switch</span></span>
<span class="line"><span></span></span>
<span class="line"><span>5. 期待 Nix 处理 GUI 应用像 brew cask 一样顺</span></span>
<span class="line"><span>   ──&gt; Nix 强项是 CLI,GUI 用 brew cask 配合(nix-darwin 调度)</span></span>
<span class="line"><span>   ──&gt; 不要逼 Nix 装 Photoshop</span></span>
<span class="line"><span></span></span>
<span class="line"><span>6. 不锁 nixpkgs 版本</span></span>
<span class="line"><span>   ──&gt; flake.lock 必须 commit 进 git</span></span>
<span class="line"><span>   ──&gt; 不锁就是&quot;在我电脑能跑&quot;重演</span></span>
<span class="line"><span></span></span>
<span class="line"><span>7. 团队没人懂 Nix 就硬上</span></span>
<span class="line"><span>   ──&gt; 一个人维护的 Nix 配置 = 单点</span></span>
<span class="line"><span>   ──&gt; 这个人离职,配置变天书</span></span>
<span class="line"><span>   ──&gt; 至少 2 个人懂才推</span></span>
<span class="line"><span></span></span>
<span class="line"><span>8. 一上来就 flake-parts / devshell / nci / 全套</span></span>
<span class="line"><span>   ──&gt; 这些是 Nix 生态的&quot;高级语法糖&quot;</span></span>
<span class="line"><span>   ──&gt; 还没掌握基础 flake 就上 flake-parts,跌跌撞撞</span></span>
<span class="line"><span>   ──&gt; 先纯 flake-utils,等心智牢了再上 flake-parts</span></span>
<span class="line"><span></span></span>
<span class="line"><span>9. 没装 Cachix 就 build 大项目</span></span>
<span class="line"><span>   ──&gt; 没 cache 的 nix build 极慢(从源码编译)</span></span>
<span class="line"><span>   ──&gt; 公司团队必装 Cachix</span></span>
<span class="line"><span></span></span>
<span class="line"><span>10. 学 Nix 不看官方 nix.dev</span></span>
<span class="line"><span>    ──&gt; nix.dev 是 2024+ 的正版文档,只学 flakes</span></span>
<span class="line"><span>    ──&gt; 老资料(nixos.org/manual 老版)害人</span></span>
<span class="line"><span></span></span>
<span class="line"><span>11. 装 Nix 装错(用 SCM 安装)</span></span>
<span class="line"><span>    ──&gt; 官方安装器(尤其旧版)在 macOS 上很容易出问题</span></span>
<span class="line"><span>    ──&gt; 用 Determinate Systems 的安装器,稳</span></span>
<span class="line"><span></span></span>
<span class="line"><span>12. 期望 nix shell -p 替代日常 brew install</span></span>
<span class="line"><span>    ──&gt; -p 是临时,关掉就没</span></span>
<span class="line"><span>    ──&gt; 装包要进 home.nix 然后 switch</span></span>
<span class="line"><span></span></span>
<span class="line"><span>13. flake.nix 写 1000 行不拆模块</span></span>
<span class="line"><span>    ──&gt; 维护噩梦</span></span>
<span class="line"><span>    ──&gt; 拆 modules/zsh.nix / modules/git.nix / modules/dev/python.nix</span></span></code></pre></div><hr><h2 id="十四、看完这一篇你应该能" tabindex="-1">十四、看完这一篇你应该能 <a class="header-anchor" href="#十四、看完这一篇你应该能" aria-label="Permalink to &quot;十四、看完这一篇你应该能&quot;">​</a></h2><ul><li><strong>在白板上画 brew / mise / Nix 三者的对比图</strong>,讲清楚为什么 Nix 才叫&quot;可复现&quot;</li><li><strong>写一份最小的 <code>flake.nix</code></strong>(项目 devShell),<code>nix develop</code> 跑通</li><li><strong>解释 generation / rollback / 内容寻址三个概念</strong>,讲清楚 Nix 为什么能做到这些</li><li><strong>判断&quot;我团队 / 我自己该不该上 Nix&quot;</strong>——用第十一节那 6+6 条对照</li><li><strong>理解 Nix 在 2026 的真实位置</strong>:粉丝多 / 主流不流行 / 增长稳 / 文档差</li><li><strong>挑选入门路径</strong>(只 Nix → 加 home-manager →(可选)nix-darwin / NixOS),不一上来就 NixOS</li><li><strong>避开 13 条反对的写法</strong>,不掉坑</li></ul><p>如果上面 7 条你都能做到,<strong>这一篇就值了</strong>——<strong>而且你已经比 90% 听过 Nix 但没真装过的工程师懂得多</strong>。</p><hr><h2 id="十五、下一篇预告" tabindex="-1">十五、下一篇预告 <a class="header-anchor" href="#十五、下一篇预告" aria-label="Permalink to &quot;十五、下一篇预告&quot;">​</a></h2><p><strong><code>26-Devcontainer与Remote-dev.md</code></strong>——这一篇讲了「<strong>Nix:把环境装在 host</strong>」,<strong>下一篇讲「Devcontainer:把环境装在容器</strong>」。两条路解决同一问题,<strong>取舍点不同</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Nix 路线:</span></span>
<span class="line"><span>   - host 上跑,毫秒级启动</span></span>
<span class="line"><span>   - 跨 OS 一致</span></span>
<span class="line"><span>   - 学曲线陡(2-4 周)</span></span>
<span class="line"><span>   - 适合: 个人 / 跨平台团队 / 极致可复现</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Devcontainer 路线:</span></span>
<span class="line"><span>   - Docker 容器里跑</span></span>
<span class="line"><span>   - 跨平台靠 Docker 抽象</span></span>
<span class="line"><span>   - 学曲线缓(VS Code Remote 一键)</span></span>
<span class="line"><span>   - 适合: 团队 / Windows + Mac 混合 / 主流姿势</span></span></code></pre></div><p>下一篇讲清楚:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>- Devcontainer 是什么(VS Code 的 .devcontainer/ 怎么用)</span></span>
<span class="line"><span>- 一份完整的 devcontainer.json + Dockerfile</span></span>
<span class="line"><span>- VS Code Remote / Cursor Remote / Codespaces 三件套</span></span>
<span class="line"><span>- SSH Remote 替代:在远端机器开发,本地编辑器只是 UI</span></span>
<span class="line"><span>- 为什么 Devcontainer 是企业团队的主流(GitHub Codespaces 推动)</span></span>
<span class="line"><span>- Devcontainer vs Nix devShell 的取舍</span></span>
<span class="line"><span>- 在公司里推 Devcontainer 怎么做</span></span>
<span class="line"><span>- 跟 Claude Code 的接合(容器内跑 Claude / 容器外跑 Claude)</span></span></code></pre></div><p>读完 22-26 这五篇,<strong>你对&quot;可复现开发环境&quot;的所有主流方案都建立了判断</strong>——chezmoi / brew / mise / Nix / Devcontainer 各自的位置、什么时候选谁。<strong>新机器 30 分钟复刻不再是口号,是你能写到 PR 模板里的一行命令</strong>。</p>`,206)])])}const c=a(l,[["render",t]]);export{o as __pageData,c as default};
