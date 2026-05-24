import{_ as a,H as n,f as i,i as p}from"./chunks/framework.BHvCMIhP.js";const o=JSON.parse('{"title":"bash / zsh / fish 选型:别问哪个最强,问哪个该哪里用","description":"","frontmatter":{},"headers":[],"relativePath":"terminalLearning/05-bash-zsh-fish选型.md","filePath":"terminalLearning/05-bash-zsh-fish选型.md","lastUpdated":1778574438000}'),l={name:"terminalLearning/05-bash-zsh-fish选型.md"};function h(e,s,t,k,c,r){return n(),i("div",null,[...s[0]||(s[0]=[p(`<h1 id="bash-zsh-fish-选型-别问哪个最强-问哪个该哪里用" tabindex="-1">bash / zsh / fish 选型:别问哪个最强,问哪个该哪里用 <a class="header-anchor" href="#bash-zsh-fish-选型-别问哪个最强-问哪个该哪里用" aria-label="Permalink to &quot;bash / zsh / fish 选型:别问哪个最强,问哪个该哪里用&quot;">​</a></h1><p>刚开始认真折腾终端的工程师,<strong>100% 都会问同一个问题</strong>:<strong>&quot;我应该用 zsh 还是 fish?&quot;</strong> 在 HN、知乎、推上每周都有人问,得到的标准答案永远是「看个人喜好」「装 oh-my-zsh 就完事」「fish 更现代」——<strong>这些答案全部是错的</strong>,准确说,<strong>它们回答的不是工程问题,是审美问题</strong>。三个 shell 不是同一道选择题里的三个选项,<strong>它们解决的是不同维度的问题</strong>:bash 是「<strong>脚本和兼容性的最大公约数</strong>」,zsh 是「<strong>POSIX 兼容前提下能玩花活的交互 shell</strong>」,fish 是「<strong>敢扔掉 POSIX 包袱的开箱即用 shell</strong>」。<strong>你不是在它们之间三选一,你是在「写脚本用哪个」「日常用哪个」两件事上各做选择</strong>。</p><blockquote><p>一句话先记住:<strong>用 fish 当日常,用 zsh 当 fish 学不动时的 fallback,用 bash 写所有「要给别人跑、要进 CI、要进 Docker」的脚本——三个 shell 各管一段,别试图统一</strong>。反过来也成立:<strong>zsh 是稳妥的个人首选,bash 是脚本的唯一答案,fish 是给不爱写脚本的人</strong>。看完这一篇你应该不再纠结「我换 fish 了原来的 bash 脚本怎么办」——<strong>根本不冲突,shebang 决定脚本由谁解释,SHELL 决定终端由谁解释,两件事不交叉</strong>。</p></blockquote><hr><h2 id="一、为什么这道题被问错了" tabindex="-1">一、为什么这道题被问错了 <a class="header-anchor" href="#一、为什么这道题被问错了" aria-label="Permalink to &quot;一、为什么这道题被问错了&quot;">​</a></h2><h3 id="_1-1-「shell」要拆成两件事" tabindex="-1">1.1 「shell」要拆成两件事 <a class="header-anchor" href="#_1-1-「shell」要拆成两件事" aria-label="Permalink to &quot;1.1 「shell」要拆成两件事&quot;">​</a></h3><p>新手版本的问题:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Q1:我该用 zsh 还是 fish?</span></span>
<span class="line"><span>Q2:bash 太老了对吧,直接上 fish?</span></span>
<span class="line"><span>Q3:Mac 装了 zsh 是不是就够了,fish 还有必要吗?</span></span>
<span class="line"><span>Q4:大家都说 fish 好用,但我看脚本都是 bash,我怎么办?</span></span></code></pre></div><p><strong>这 4 个问题共享同一个错误前提</strong>:<strong>「shell」是一个东西</strong>。事实是 shell 至少要拆成两件不同的事:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>角色 A:交互式 shell(interactive shell)</span></span>
<span class="line"><span>   你坐在终端前敲命令、看 prompt、按 Tab 补全、按 ↑ 翻历史</span></span>
<span class="line"><span>   核心指标:补全、提示符、语法高亮、历史搜索、易用性</span></span>
<span class="line"><span></span></span>
<span class="line"><span>角色 B:脚本解释器(script interpreter)</span></span>
<span class="line"><span>   你写 deploy.sh 给 CI 跑、写 Dockerfile 里的 RUN、</span></span>
<span class="line"><span>   写 systemd 的 ExecStart、写 cron 任务</span></span>
<span class="line"><span>   核心指标:兼容性、可移植性、POSIX 标准、可预测性</span></span></code></pre></div><p><strong>这两件事的 KPI 直接冲突</strong>——交互要的是「敢加新语法、敢破坏兼容」(fish 思路),脚本要的是「别动祖宗规矩、给 Alpine 也得跑」(bash 思路)。<strong>zsh 卡在中间</strong>:它是 bash 的超集 + 大量交互改进,牺牲了一点 POSIX 严谨度换交互体验,但没 fish 那么激进。</p><h3 id="_1-2-「三选一」的错误结论" tabindex="-1">1.2 「三选一」的错误结论 <a class="header-anchor" href="#_1-2-「三选一」的错误结论" aria-label="Permalink to &quot;1.2 「三选一」的错误结论&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错误 1:全部用 fish</span></span>
<span class="line"><span>  → ./deploy.sh 写成 fish 语法</span></span>
<span class="line"><span>  → 同事 git clone 下来跑炸了:他没装 fish</span></span>
<span class="line"><span>  → CI 镜像里没装 fish,流水线挂了</span></span>
<span class="line"><span>  → Dockerfile 里 RUN 用 fish 语法,镜像构建失败</span></span>
<span class="line"><span></span></span>
<span class="line"><span>错误 2:全部用 bash 当日常</span></span>
<span class="line"><span>  → 补全要手动装 bash-completion 包</span></span>
<span class="line"><span>  → 没有语法高亮,敲错命令到回车才知道</span></span>
<span class="line"><span>  → 历史搜索只有 Ctrl-R 单行,翻半天找不到</span></span>
<span class="line"><span></span></span>
<span class="line"><span>错误 3:fish 当日常 + 用 fish 写脚本</span></span>
<span class="line"><span>  → 个人脚本(自己机器跑)没问题</span></span>
<span class="line"><span>  → 一旦要分享出去就翻车</span></span></code></pre></div><p><strong>正确的拆解</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>交互 shell      用什么由 SHELL 环境变量 / chsh 决定</span></span>
<span class="line"><span>                  「你坐下来用什么」</span></span>
<span class="line"><span>                  </span></span>
<span class="line"><span>脚本由谁解释    由文件第一行 #!/usr/bin/env bash 决定  </span></span>
<span class="line"><span>                  「这个文件给谁解释」</span></span>
<span class="line"><span>                  </span></span>
<span class="line"><span>两件事完全独立,不冲突</span></span></code></pre></div><p>理解这一层,后面所有讨论才有意义。</p><hr><h2 id="二、三个-shell-的历史-短" tabindex="-1">二、三个 shell 的历史(短) <a class="header-anchor" href="#二、三个-shell-的历史-短" aria-label="Permalink to &quot;二、三个 shell 的历史(短)&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1979  Bourne shell (sh)        Stephen Bourne @ Bell Labs</span></span>
<span class="line"><span>                                Unix 标配,后来 POSIX 标准的祖宗</span></span>
<span class="line"><span></span></span>
<span class="line"><span>1989  bash                     Brian Fox @ GNU/FSF</span></span>
<span class="line"><span>                                Bourne-Again Shell,GNU 重写 sh</span></span>
<span class="line"><span>                                兼容 POSIX,加了 history / 补全雏形</span></span>
<span class="line"><span>                                → Linux 几乎所有发行版默认</span></span>
<span class="line"><span></span></span>
<span class="line"><span>1990  zsh                      Paul Falstad @ Princeton</span></span>
<span class="line"><span>                                参考 csh / tcsh / ksh / bash</span></span>
<span class="line"><span>                                目标:兼容 bash + 更强补全 + 更骚 globbing</span></span>
<span class="line"><span>                                → 2003 Mac OS X 起内置</span></span>
<span class="line"><span>                                → 2019 macOS Catalina 起默认登录 shell</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2005  fish                     Axel Liljencrantz</span></span>
<span class="line"><span>                                friendly interactive shell</span></span>
<span class="line"><span>                                明确放弃 POSIX,自己一套语法</span></span>
<span class="line"><span>                                → 2024 fish 4.0 全 Rust 重写</span></span></code></pre></div><p>时间线 ASCII:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1979 ─── sh ──────────────────────────────────────────────────</span></span>
<span class="line"><span>1989 ───────── bash ──────────────────────────────────────────</span></span>
<span class="line"><span>1990 ─────────── zsh ─────────────────────────────────────────</span></span>
<span class="line"><span>2005 ───────────────────── fish ──────────────────────────────</span></span>
<span class="line"><span>                                          ┌──── macOS 默认 ────┐</span></span>
<span class="line"><span>                                          │   bash 3.2 (2007)  │</span></span>
<span class="line"><span>                                          │   ↓ 2019 切 zsh    │</span></span>
<span class="line"><span>                                          └────────────────────┘</span></span></code></pre></div><p><strong>三个关键节点</strong>:</p><ol><li><strong>2007 年 bash 4.0 出来</strong>:Apple 因 GPLv3 拒绝升级,macOS 系统 bash 永远停在 3.2.57——<strong>你 Mac 上的 /bin/bash 是 19 年前的版本</strong></li><li><strong>2019 年 macOS Catalina 切默认 zsh</strong>:Apple 终于受不了 bash 3.2 的烂,换 zsh(MIT-ish 协议,Apple 可装新版)</li><li><strong>2024 年 fish 4.0 用 Rust 重写</strong>:启动更快、内存更省,跟 nushell 抢「下一代 shell」位置</li></ol><hr><h2 id="三、核心对比表" tabindex="-1">三、核心对比表 <a class="header-anchor" href="#三、核心对比表" aria-label="Permalink to &quot;三、核心对比表&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>维度              bash            zsh             fish</span></span>
<span class="line"><span>─────────────────────────────────────────────────────────────</span></span>
<span class="line"><span>POSIX 兼容        ★★★★★         ★★★★☆          ★(不兼容)</span></span>
<span class="line"><span>补全开箱          ★               ★★(要框架)     ★★★★★</span></span>
<span class="line"><span>补全质量          ★★              ★★★★★          ★★★★(自动)</span></span>
<span class="line"><span>语法直观度        ★★              ★★★             ★★★★★</span></span>
<span class="line"><span>启动速度          ★★★★★         ★★★             ★★★★</span></span>
<span class="line"><span>配置生态(框架)   ★★              ★★★★★          ★★(够用)</span></span>
<span class="line"><span>脚本可移植性      ★★★★★         ★★★★            ★(基本不可)</span></span>
<span class="line"><span>学习成本          ★★(POSIX 难)   ★★(兼 POSIX)    ★★★(新语法)</span></span>
<span class="line"><span>异步 prompt       ❌              ✅              ✅(默认)</span></span>
<span class="line"><span>内置语法高亮      ❌              ❌(要装插件)    ✅</span></span>
<span class="line"><span>内置自动建议      ❌              ❌(要装插件)    ✅</span></span>
<span class="line"><span>─────────────────────────────────────────────────────────────</span></span>
<span class="line"><span>默认在哪儿        Linux / WSL     macOS / Kali    没默认,得装</span></span>
<span class="line"><span>镜像里有没有      绝大多数都有    几乎没有         几乎没有</span></span></code></pre></div><p>读法:</p><ul><li><strong>bash 强在「无处不在」+「脚本可移植」</strong>——强项不是交互,是脚本和兼容</li><li><strong>zsh 强在「兼容 bash 还能玩花活」</strong>——交互体验上限高,但要配置</li><li><strong>fish 强在「开箱即用」+「补全和高亮内置」</strong>——但脚本完全不能移植</li></ul><p><strong>没有哪个 shell 全面胜出</strong>——任何一个都在某维度被另两个甩开。</p><hr><h2 id="四、5-个场景的代码对照" tabindex="-1">四、5 个场景的代码对照 <a class="header-anchor" href="#四、5-个场景的代码对照" aria-label="Permalink to &quot;四、5 个场景的代码对照&quot;">​</a></h2><p>抽象对比不够,直接看同一件事在三个 shell 怎么写。</p><h3 id="_4-1-场景-1-补全" tabindex="-1">4.1 场景 1:补全 <a class="header-anchor" href="#_4-1-场景-1-补全" aria-label="Permalink to &quot;4.1 场景 1:补全&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># bash:默认啥都没有</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">brew</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> install</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> bash-completion</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># .bashrc 里加:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">[[ </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">-r</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;/opt/homebrew/etc/profile.d/bash_completion.sh&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> ]] &amp;&amp; </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">\\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  .</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;/opt/homebrew/etc/profile.d/bash_completion.sh&quot;</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 只给「常见命令」补全,你自己写的 CLI 没补全</span></span></code></pre></div><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># zsh:自带 compinit 框架,但要手动启用</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">autoload</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -Uz</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> compinit</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">compinit</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 只对「装了 _commandname 补全文件的命令」有补全</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># brew install zsh-completions 一批,或 oh-my-zsh / zinit 一键开</span></span></code></pre></div><div class="language-fish vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">fish</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># fish:什么都不用做,启动就有:</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># - 从 man page 自动解析所有命令的 flag 生成补全</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># - 从历史命令推断参数偏好</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># - 文件名 / 目录名 fuzzy 匹配</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># - 按 Tab 弹菜单,按 → 接受灰色建议</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 装一个新 CLI,fish 立刻能补全 --help 列出的 flag</span></span></code></pre></div><p><strong>结论</strong>:补全这件事 fish 几乎不需要工程师介入。zsh 上限高但要配置,bash 是「装个 completion 包凑合用」。</p><h3 id="_4-2-场景-2-变量与数组" tabindex="-1">4.2 场景 2:变量与数组 <a class="header-anchor" href="#_4-2-场景-2-变量与数组" aria-label="Permalink to &quot;4.2 场景 2:变量与数组&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># bash</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">name</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;Alice&quot;</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">echo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;Hello, </span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$name</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">arr</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">apple</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> banana</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> cherry</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">echo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;\${</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">arr</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">[1]}&quot;</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">       # banana(bash 0-indexed)</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">echo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;\${</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">#</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">arr</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">[</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">@</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">]}&quot;</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">      # 长度</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">declare</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -A</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> m           </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 关联数组(bash 4+,Mac 系统 bash 没有)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">m[foo]</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">1</span></span></code></pre></div><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># zsh</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">name</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;Alice&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">arr</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">apple</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> banana</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> cherry</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">echo</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> $arr</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">[1]</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">           # apple(zsh 1-indexed,跟 bash 反过来)</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">echo</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> $</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">#arr</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">             # 长度</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">typeset</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -A</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> m           </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 关联数组</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">m[foo]</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">1</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 可 setopt KSH_ARRAYS 切到 0-indexed —— 这种「兼容开关」就是 zsh 的味道</span></span></code></pre></div><div class="language-fish vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">fish</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># fish:语法完全不同</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">set</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> name </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;Alice&quot;</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">echo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;Hello, </span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$name</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">set</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> arr apple banana cherry</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">echo</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> $arr[1]           </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># apple(fish 1-indexed)</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">echo</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">count</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> $arr)      </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 长度</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># fish 没有关联数组(直到 4.0 引入有限支持)</span></span></code></pre></div><p><strong>关键差异</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>变量赋值</span></span>
<span class="line"><span>  bash/zsh:  name=value      ← 中间不能有空格,经典翻车点</span></span>
<span class="line"><span>  fish:      set name value  ← 函数式,更清晰</span></span>
<span class="line"><span></span></span>
<span class="line"><span>数组下标</span></span>
<span class="line"><span>  bash:      0-indexed</span></span>
<span class="line"><span>  zsh:       1-indexed(可切)</span></span>
<span class="line"><span>  fish:      1-indexed</span></span>
<span class="line"><span></span></span>
<span class="line"><span>关联数组</span></span>
<span class="line"><span>  bash 4+:   ✅                bash 3.2(Mac):❌</span></span>
<span class="line"><span>  zsh:       ✅</span></span>
<span class="line"><span>  fish:      4.0 之前没有</span></span></code></pre></div><p><strong>这就是为什么 fish 写交互很爽,但脚本完全不能给别人跑</strong>——一个 <code>set name value</code> vs <code>name=value</code>,所有 bash 脚本搬过来都得改。</p><h3 id="_4-3-场景-3-历史命令搜索" tabindex="-1">4.3 场景 3:历史命令搜索 <a class="header-anchor" href="#_4-3-场景-3-历史命令搜索" aria-label="Permalink to &quot;4.3 场景 3:历史命令搜索&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># bash:Ctrl-R 反向搜索,只能单行匹配</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># (reverse-i-search)\`gi&#39;: git status</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 搜下一个匹配:再按 Ctrl-R</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 体验:勉强能用,跟 2005 年一样</span></span></code></pre></div><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># zsh:Ctrl-R 同 bash,但可装 history-substring-search:</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">zinit</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> light</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> zsh-users/zsh-history-substring-search</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">bindkey</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;^[[A&#39;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> history-substring-search-up</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # ↑ 按前缀过滤</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">bindkey</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;^[[B&#39;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> history-substring-search-down</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 加完后:敲 git 按 ↑,只翻 git 开头的历史</span></span></code></pre></div><div class="language-fish vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">fish</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># fish:默认就这样:</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 敲 git 按 ↑ → 自动按前缀过滤</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 边敲边看到灰色「自动建议」就是上次最近的匹配</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># → 接受建议,Ctrl-F 接受一个 word</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 不需要任何配置</span></span></code></pre></div><p><strong>这就是 fish 的核心卖点</strong>——很多 zsh 用户花一晚上装插件才达到的体验,fish 是默认。</p><h3 id="_4-4-场景-4-提示符-prompt" tabindex="-1">4.4 场景 4:提示符(prompt) <a class="header-anchor" href="#_4-4-场景-4-提示符-prompt" aria-label="Permalink to &quot;4.4 场景 4:提示符(prompt)&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># bash:PS1 是个魔法字符串,转义符晦涩</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">export</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> PS1</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;\\[\\033[01;32m\\]\\u@\\h\\[\\033[00m\\]:\\[\\033[01;34m\\]\\w\\[\\033[00m\\]\\$ &#39;</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># \\u 用户,\\h 主机,\\w cwd,\\$ 提示符</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># \\[ \\033[01;32m \\] 是 ANSI 颜色,要包在 \\[ \\] 里避免计算长度出错</span></span></code></pre></div><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># zsh:PROMPT 变量,转义符更人话</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">export</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> PROMPT</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;%F{green}%n@%m%f:%F{blue}%~%f$ &#39;</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># %n 用户,%m 主机,%~ cwd,%F{color}...%f 颜色,不用包 \\[ \\]</span></span></code></pre></div><div class="language-fish vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">fish</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># fish:用函数,不是字符串</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">function</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> fish_prompt</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    set_color</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> green</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    echo</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> -n (</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">whoami</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)@(</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">hostname</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    set_color</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> blue</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    echo</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> -n </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;:&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">prompt_pwd</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    set_color</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> normal</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    echo</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> -n </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;$ &#39;</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">end</span></span></code></pre></div><p><strong>现代做法</strong>:三个 shell 都用 Starship 或类似的「shell 无关 prompt 工具」——07 篇专讲。</p><h3 id="_4-5-场景-5-语法高亮" tabindex="-1">4.5 场景 5:语法高亮 <a class="header-anchor" href="#_4-5-场景-5-语法高亮" aria-label="Permalink to &quot;4.5 场景 5:语法高亮&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># bash:没有内置</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 你敲 gits status 之前不会有提示,Enter 之后才告诉你 command not found</span></span></code></pre></div><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># zsh:装 zsh-syntax-highlighting</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">zinit</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> light</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> zsh-users/zsh-syntax-highlighting</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 装完后:命令存在绿色 / 不存在红色 / 引号不闭合红色</span></span></code></pre></div><div class="language-fish vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">fish</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># fish:什么都不用装</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 命令存在蓝色 / 不存在红色 / 选项青色 / 字符串黄色</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 边敲边高亮,真错了一眼看出</span></span></code></pre></div><p><strong>fish 默认就把 zsh 装一晚上插件才能拼出来的体验给你了</strong>。代价 — 它不兼容 POSIX,脚本不能跨平台。</p><hr><h2 id="五、posix-兼容这件事到底重要在哪" tabindex="-1">五、POSIX 兼容这件事到底重要在哪 <a class="header-anchor" href="#五、posix-兼容这件事到底重要在哪" aria-label="Permalink to &quot;五、POSIX 兼容这件事到底重要在哪&quot;">​</a></h2><p>这一节是这一篇的核心。</p><h3 id="_5-1-bin-sh-是什么" tabindex="-1">5.1 /bin/sh 是什么 <a class="header-anchor" href="#_5-1-bin-sh-是什么" aria-label="Permalink to &quot;5.1 /bin/sh 是什么&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>/bin/sh 是符号链接,指向某个「实现 POSIX shell 标准」的程序</span></span>
<span class="line"><span></span></span>
<span class="line"><span>不同系统的 /bin/sh 指向:</span></span>
<span class="line"><span>   Ubuntu / Debian:  → dash      (轻量,严格 POSIX)</span></span>
<span class="line"><span>   Alpine / busybox: → ash        (busybox 的 sh,最小化)</span></span>
<span class="line"><span>   macOS:            → bash       (但以 sh 兼容模式运行)</span></span>
<span class="line"><span>   RHEL / CentOS:    → bash       (sh 兼容模式)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>所以 #!/bin/sh 不等于「跑 bash」</span></span>
<span class="line"><span>也不等于「跑 dash」</span></span>
<span class="line"><span>而是「跑这台机器上的 POSIX shell」</span></span></code></pre></div><p><strong>这一点是无数脚本 bug 的根源</strong>。你在 Mac 上用 <code>/bin/sh</code> 调试通过,部署到 Alpine 容器里炸了——<strong>因为 Mac 上 sh 是 bash 兼容模式,Alpine 上 sh 是 busybox ash</strong>。</p><h3 id="_5-2-bashism" tabindex="-1">5.2 bashism <a class="header-anchor" href="#_5-2-bashism" aria-label="Permalink to &quot;5.2 bashism&quot;">​</a></h3><p>bashism = 「bash 有但 POSIX sh 没有」的语法。常见的:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># bashism 1: 双方括号(zsh 也支持)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">[[ </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">-f</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> file </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">&amp;&amp;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> $x </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;y&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> ]]    </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># bash/zsh 行,sh 不行</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">[ </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">-f</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> file ] &amp;&amp; [ </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$x</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;y&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> ] </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># POSIX 写法</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># bashism 2: here-string</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">grep</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> foo</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> &lt;&lt;&lt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$content</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">      # bash/zsh 行,sh 不行</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">echo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$content</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> |</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> grep</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> foo</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">   # POSIX 写法</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># bashism 3: process substitution</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">diff</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &lt;(</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">ls</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> a)</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &lt;(</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">ls</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> b)</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">         # bash/zsh 行,sh 不行</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># bashism 4: 数组</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">arr</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">a</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> b</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> c</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)                  </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># POSIX sh 没有数组</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># bashism 5: function 关键字</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">function</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> foo</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">() { </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">echo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> hi</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">; }  </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># POSIX 不让用 function 关键字</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">foo</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">() { </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">echo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> hi</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">; }           </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># POSIX 写法</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># bashism 6: \${var,,}(转小写)</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">echo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;\${</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">VAR</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">,,}&quot;</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">              # bash 4+</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">echo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$VAR</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> |</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> tr</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;[:upper:]&#39;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;[:lower:]&#39;</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  # POSIX</span></span></code></pre></div><p><strong>反例 + 修正</strong>:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 反例:写了 #!/bin/sh 但用了 bashism</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#!/bin/sh</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">files</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">( </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">a.txt</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> b.txt</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> c.txt</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> )         </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># ← 数组,POSIX 没有</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">for</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> f </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">in</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;\${</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">files</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">[</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">@</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">]}&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">; </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">do</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    [[ </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">-f</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> $f ]] &amp;&amp; </span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">cat</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> &lt;&lt;&lt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$f</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">     # ← [[ ]] 和 &lt;&lt;&lt;,都是 bashism</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">done</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 在 macOS 上跑:OK(sh 是 bash 兼容模式)</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 在 Alpine 里跑:syntax error: unexpected &quot;(&quot;</span></span></code></pre></div><p>修复路径 1(改 shebang):</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#!/usr/bin/env bash</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># ↑ 显式声明用 bash,bashism 都合法</span></span></code></pre></div><p>修复路径 2(改语法):</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#!/bin/sh</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">files</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;a.txt b.txt c.txt&quot;</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">           # 空格分隔字符串</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">for</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> f </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">in</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> $files; </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">do</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                 # POSIX 词分割</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    [ </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">-f</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$f</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> ] &amp;&amp; </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">echo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$f</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">done</span></span></code></pre></div><p><strong>两条路径的取舍</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>显式用 bash      → 容器要装 bash(scratch / distroless 没有)</span></span>
<span class="line"><span>                 → 镜像变大几 MB</span></span>
<span class="line"><span>                 → 但脚本写起来更顺手</span></span>
<span class="line"><span></span></span>
<span class="line"><span>严格走 POSIX     → 任何 sh 都能跑(包括 Alpine ash / dash)</span></span>
<span class="line"><span>                 → 镜像不需要额外包</span></span>
<span class="line"><span>                 → 但写起来痛苦,数组都没有</span></span></code></pre></div><p><strong>实战经验</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 个人 / 团队脚本     → #!/usr/bin/env bash + set -euo pipefail</span></span>
<span class="line"><span>2. Debian 系镜像入口   → bash 自带,用 bash</span></span>
<span class="line"><span>3. Alpine / distroless → 严格 POSIX,或 RUN apk add bash</span></span>
<span class="line"><span>4. 嵌入式 / 救援系统   → 严格 POSIX</span></span>
<span class="line"><span>5. 给别人当 lib 的脚本 → 严格 POSIX</span></span></code></pre></div><h3 id="_5-3-fish-在这里的位置" tabindex="-1">5.3 fish 在这里的位置 <a class="header-anchor" href="#_5-3-fish-在这里的位置" aria-label="Permalink to &quot;5.3 fish 在这里的位置&quot;">​</a></h3><p><strong>fish 根本不兼容 POSIX</strong>——语法是另一套。</p><div class="language-fish vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">fish</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># fish 的 if</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">if</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> test</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">count</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> $argv</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">) -gt 0</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    echo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;Has args&quot;</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 对比 bash</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">if</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> [</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> $# -gt 0 ]; </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">then</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    echo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;Has args&quot;</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">fi</span></span></code></pre></div><p><strong>fish 团队明确说</strong>:「我们不打算兼容 POSIX,POSIX 是历史包袱」。这是一个工程立场,也是 fish 杀手锏(默认更现代)和阿喀琉斯之踵(脚本生态归零)的同一个根因。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>fish 脚本    几乎只能给「你自己机器」跑</span></span>
<span class="line"><span>fish 函数    定义在 ~/.config/fish/functions/*.fish,自动加载</span></span>
<span class="line"><span>fish 不能    放在 #!/usr/bin/env fish 然后让 CI 跑</span></span>
<span class="line"><span>            (除非 CI 镜像里装 fish,通常没人这么干)</span></span></code></pre></div><hr><h2 id="六、shebang-选择决策表" tabindex="-1">六、shebang 选择决策表 <a class="header-anchor" href="#六、shebang-选择决策表" aria-label="Permalink to &quot;六、shebang 选择决策表&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>shebang                       适用场景              不适用场景</span></span>
<span class="line"><span>─────────────────────────────────────────────────────────────</span></span>
<span class="line"><span>#!/bin/sh                     最大兼容               需要数组 / [[ ]]</span></span>
<span class="line"><span>                              Alpine / busybox       需要 process sub</span></span>
<span class="line"><span>                              救援 / 嵌入式系统       </span></span>
<span class="line"><span>                              </span></span>
<span class="line"><span>#!/bin/bash                   假设系统 bash 在        macOS bash 3.2</span></span>
<span class="line"><span>                              /bin/bash              (Apple 永不升)</span></span>
<span class="line"><span>                              Linux 服务器           </span></span>
<span class="line"><span>                              </span></span>
<span class="line"><span>#!/usr/bin/env bash           最常见的现代做法        scratch 镜像</span></span>
<span class="line"><span>                              找 PATH 里的 bash       (没 env / 没 bash)</span></span>
<span class="line"><span>                              macOS brew bash 也找到 </span></span>
<span class="line"><span>                              </span></span>
<span class="line"><span>#!/usr/bin/env zsh            个人脚本可以            别人机器可能没装</span></span>
<span class="line"><span>                              用 zsh 特性             给团队用别选这个</span></span>
<span class="line"><span>                              </span></span>
<span class="line"><span>#!/usr/bin/env fish           几乎只在自己机器        给同事就翻车</span></span>
<span class="line"><span>                              玩具 / 个人快脚本       任何要分享的场景</span></span></code></pre></div><p><strong>实战推荐</strong>:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 团队脚本 / CI / 部署脚本     默认这样开头:</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#!/usr/bin/env bash</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">set</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -euo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> pipefail</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">IFS</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">$&#39;</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">\\n\\t</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Alpine / scratch / busybox    默认这样:</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#!/bin/sh</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">set</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -eu</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">     # POSIX sh 不支持 -o pipefail,要小心</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 个人 ~/bin 下的小工具         可以任性:</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#!/usr/bin/env fish             # 反正自己机器</span></span></code></pre></div><p><strong>27 篇会专讲 set -euo pipefail / shellcheck / shfmt 这套工程化武器</strong>——这一节先记住 shebang 这个选择本身。</p><hr><h2 id="七、启动速度对比-实测" tabindex="-1">七、启动速度对比(实测) <a class="header-anchor" href="#七、启动速度对比-实测" aria-label="Permalink to &quot;七、启动速度对比(实测)&quot;">​</a></h2><p>这一节给的是 2024-2025 在 M2 Mac 上实测的数字,你自己机器跑出来量级一致。</p><h3 id="_7-1-裸-shell-启动-无任何配置" tabindex="-1">7.1 裸 shell 启动(无任何配置) <a class="header-anchor" href="#_7-1-裸-shell-启动-无任何配置" aria-label="Permalink to &quot;7.1 裸 shell 启动(无任何配置)&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 测裸启动:--noprofile / --norc 跳过任何配置文件</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">hyperfine</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --warmup</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 3</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  &#39;bash --noprofile --norc -c &quot;exit&quot;&#39;</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  &#39;zsh -f -c &quot;exit&quot;&#39;</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  &#39;fish --no-config -c &quot;exit&quot;&#39;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 典型结果:</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># bash --noprofile --norc -c &quot;exit&quot;   3.2 ms ± 0.4 ms</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># zsh -f -c &quot;exit&quot;                   10.8 ms ± 0.8 ms</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># fish --no-config -c &quot;exit&quot;         18.5 ms ± 1.1 ms</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># bash 比 zsh 快 3 倍,比 fish 快 6 倍</span></span></code></pre></div><p><strong>裸启动时,bash 远快于 zsh / fish</strong>。原因:bash 二进制小、初始化少;zsh 默认装一堆 module;fish 启动要做更多(check terminal、解析 universal vars)。</p><h3 id="_7-2-带配置的启动-真实使用" tabindex="-1">7.2 带配置的启动(真实使用) <a class="header-anchor" href="#_7-2-带配置的启动-真实使用" aria-label="Permalink to &quot;7.2 带配置的启动(真实使用)&quot;">​</a></h3><p><strong>实测一些典型组合的启动时间</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>配置                                启动时间(ms)</span></span>
<span class="line"><span>───────────────────────────────────────────────</span></span>
<span class="line"><span>bash + 简单 .bashrc                    5-10</span></span>
<span class="line"><span>bash + bash-completion 全开            30-50</span></span>
<span class="line"><span>                                       </span></span>
<span class="line"><span>zsh 裸 + .zshrc 简单 prompt           15-30</span></span>
<span class="line"><span>zsh + oh-my-zsh + 默认主题            250-400  ← 「卡顿可感」</span></span>
<span class="line"><span>zsh + oh-my-zsh + p10k 默认           350-600</span></span>
<span class="line"><span>zsh + zinit lazy + p10k 异步           40-80   ← 「秒开」</span></span>
<span class="line"><span>zsh + Starship                         50-100</span></span>
<span class="line"><span>                                       </span></span>
<span class="line"><span>fish 默认 + 简单 abbr                  30-50</span></span>
<span class="line"><span>fish + tide(异步 prompt)              40-70</span></span>
<span class="line"><span>fish + Starship                        50-100</span></span></code></pre></div><p><strong>几个关键现象</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 「oh-my-zsh 全家桶」启动 300ms+</span></span>
<span class="line"><span>   → 普遍但严重的问题,06 篇专讲怎么破</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. zinit lazy 能把 zsh 拉回 50ms 内</span></span>
<span class="line"><span>   → 等价于「装了一堆插件但启动时不加载,用到再加载」</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. fish 默认快于 oh-my-zsh 默认</span></span>
<span class="line"><span>   → fish 的设计选择把「该装的都内置了」</span></span>
<span class="line"><span>     不用堆插件就达到 oh-my-zsh 的体验</span></span>
<span class="line"><span></span></span>
<span class="line"><span>4. Starship 在三个 shell 上差不多</span></span>
<span class="line"><span>   → Starship 是异步的,主要开销是它自己的二进制启动</span></span></code></pre></div><h3 id="_7-3-启动-100ms-慢一点为什么有感" tabindex="-1">7.3 启动 100ms 慢一点为什么有感 <a class="header-anchor" href="#_7-3-启动-100ms-慢一点为什么有感" aria-label="Permalink to &quot;7.3 启动 100ms 慢一点为什么有感&quot;">​</a></h3><p><strong>单次开 shell 100ms 你感觉不到</strong>,但叠加起来:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>场景 1:tmux 10 个 pane                  10 * 0.3s = 3s</span></span>
<span class="line"><span>   → 笔记本盖子打开 attach tmux 到 last session</span></span>
<span class="line"><span>   → 看着 10 个 prompt 一个一个出来,有「电脑卡了」错觉</span></span>
<span class="line"><span></span></span>
<span class="line"><span>场景 2:VS Code 内置终端开新 tab         每次 0.3-0.6s</span></span>
<span class="line"><span>   → 一天开 30 次,白白耗 10-20s</span></span>
<span class="line"><span></span></span>
<span class="line"><span>场景 3:CI 里 bash -c &quot;...&quot; 调 100 次    100 * 0.3s = 30s</span></span>
<span class="line"><span>   → 浪费的 build 时间是真金白银</span></span>
<span class="line"><span>   → CI 一般用 bash,问题反而小一点</span></span>
<span class="line"><span></span></span>
<span class="line"><span>场景 4:tmux popup / lazygit shell out   每次 0.3s</span></span>
<span class="line"><span>   → 频繁操作时一卡一卡,体验直接崩</span></span></code></pre></div><p><strong>所以 06 篇会展开</strong>:zsh 不调优 vs 调优的差距是 5-10 倍,这是「你愿不愿意花一小时」的问题。</p><hr><h2 id="八、macos-上的特殊情况" tabindex="-1">八、macOS 上的特殊情况 <a class="header-anchor" href="#八、macos-上的特殊情况" aria-label="Permalink to &quot;八、macOS 上的特殊情况&quot;">​</a></h2><p>macOS 是工程师最大的一个客户群,值得单独一节。</p><h3 id="_8-1-系统-bash-永远是-3-2" tabindex="-1">8.1 系统 bash 永远是 3.2 <a class="header-anchor" href="#_8-1-系统-bash-永远是-3-2" aria-label="Permalink to &quot;8.1 系统 bash 永远是 3.2&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /bin/bash</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --version</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">GNU</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> bash,</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> version</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 3.2.57</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">1</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">-release</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (arm64-apple-darwin23)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">Copyright</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (C) 2007 Free Software Foundation, Inc.</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">                  ↑</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 2007</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 年</span></span></code></pre></div><p><strong>为什么 Apple 不升级</strong>:bash 4.0(2009)起切到 GPLv3,GPLv3 比 GPLv2 多了「专利授权 + 反 Tivo 化」条款,Apple 法务认为这些条款跟 Apple 商业模式冲突。所以系统 bash 永远锁在 3.2.57。</p><p><strong>影响</strong>:没有关联数组(<code>declare -A</code>)、没有 <code>\${var,,}</code>、没有 <code>mapfile</code> / <code>readarray</code>、<code>printf -v</code> 有 bug、大量「现代 bash 习惯」不能用。</p><p><strong>Mac 工程师的两种做法</strong>:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 做法 1:用 brew 装新 bash,但不替换系统 bash</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">brew</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> install</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> bash</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">which</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -a</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> bash</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># /opt/homebrew/bin/bash   ← brew 装的,bash 5.x</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># /bin/bash                ← 系统,3.2</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 脚本用 #!/usr/bin/env bash,会找到 brew 的</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 系统脚本继续用 /bin/bash,不受影响</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 做法 2:把 brew bash 加进 /etc/shells,然后 chsh</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">echo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /opt/homebrew/bin/bash</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> |</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> tee</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -a</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /etc/shells</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">chsh</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -s</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /opt/homebrew/bin/bash</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 大部分人不这么干 —— 装新 bash 是为了写脚本,</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 登录 shell 一般直接上 zsh / fish</span></span></code></pre></div><h3 id="_8-2-catalina-起默认-zsh" tabindex="-1">8.2 Catalina 起默认 zsh <a class="header-anchor" href="#_8-2-catalina-起默认-zsh" aria-label="Permalink to &quot;8.2 Catalina 起默认 zsh&quot;">​</a></h3><p>macOS Catalina(2019)起新用户默认 zsh,Apple 装的是 5.x 挺新,大部分人直接用系统 zsh,不再 brew install zsh。</p><h3 id="_8-3-fish-在-macos" tabindex="-1">8.3 fish 在 macOS <a class="header-anchor" href="#_8-3-fish-在-macos" aria-label="Permalink to &quot;8.3 fish 在 macOS&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">brew</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> install</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> fish</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">echo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /opt/homebrew/bin/fish</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> |</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> tee</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -a</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /etc/shells</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">chsh</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -s</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /opt/homebrew/bin/fish</span></span></code></pre></div><p>注意:macOS 上有些工具(<code>nvm</code>、某些 brew formula hook)假设你在 bash / zsh,装 fish 可能要额外配置。06-08 篇会讲怎么解决。</p><hr><h2 id="九、混合用法-本系列推荐" tabindex="-1">九、混合用法(本系列推荐) <a class="header-anchor" href="#九、混合用法-本系列推荐" aria-label="Permalink to &quot;九、混合用法(本系列推荐)&quot;">​</a></h2><h3 id="_9-1-文件分布" tabindex="-1">9.1 文件分布 <a class="header-anchor" href="#_9-1-文件分布" aria-label="Permalink to &quot;9.1 文件分布&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>~/.zshrc                    # 日常交互 shell 是 zsh</span></span>
<span class="line"><span>                            # PATH / alias / prompt / 补全等</span></span>
<span class="line"><span>~/.bashrc                   # 即使日常用 zsh,bash 也留一份</span></span>
<span class="line"><span>~/.bash_profile             # 偶尔用 bash -l 跑脚本时仍正常</span></span>
<span class="line"><span></span></span>
<span class="line"><span>~/Projects/repo1/scripts/   # 项目脚本一律 #!/usr/bin/env bash</span></span>
<span class="line"><span>   deploy.sh</span></span>
<span class="line"><span>   build.sh</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>~/.local/bin/               # 你自己的 ad-hoc 小工具</span></span>
<span class="line"><span>   gitsync       # #!/usr/bin/env bash</span></span>
<span class="line"><span></span></span>
<span class="line"><span>fish 用户额外:</span></span>
<span class="line"><span>~/.config/fish/</span></span>
<span class="line"><span>   config.fish              # 配置文件</span></span>
<span class="line"><span>   functions/               # 函数(类似 zsh 的 autoload)</span></span>
<span class="line"><span>      fish_prompt.fish</span></span>
<span class="line"><span>   conf.d/                  # 启动时 source 的片段</span></span></code></pre></div><p><strong>核心原则</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>SHELL 环境变量            决定「你登录时用的是什么」</span></span>
<span class="line"><span>shebang                   决定「这个脚本由谁解释」</span></span>
<span class="line"><span>       </span></span>
<span class="line"><span>两者完全独立。</span></span>
<span class="line"><span>你可以日常 fish,但所有脚本都跑 bash。</span></span>
<span class="line"><span>不冲突。</span></span></code></pre></div><h3 id="_9-2-切换-shell-的命令" tabindex="-1">9.2 切换 shell 的命令 <a class="header-anchor" href="#_9-2-切换-shell-的命令" aria-label="Permalink to &quot;9.2 切换 shell 的命令&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">echo</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> $SHELL                  </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 登录默认 shell</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">ps</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -p</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> $$</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                     # 当前实际在跑哪个 shell</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">chsh</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -s</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /bin/zsh</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">             # 改默认 shell</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">chsh</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -s</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /opt/homebrew/bin/fish</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">fish</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                         # 临时进 fish(不改默认),exit 退出</span></span></code></pre></div><h3 id="_9-3-「我已经在用-zsh-要不要切-fish」" tabindex="-1">9.3 「我已经在用 zsh,要不要切 fish」 <a class="header-anchor" href="#_9-3-「我已经在用-zsh-要不要切-fish」" aria-label="Permalink to &quot;9.3 「我已经在用 zsh,要不要切 fish」&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>不要为了切而切。</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>切 fish 的理由(有 1 条对你就值得试):</span></span>
<span class="line"><span>   ✓ 你被 zsh 启动慢困扰,试过调优但放弃了</span></span>
<span class="line"><span>   ✓ 你不想再花一晚上配补全 / 高亮 / 历史</span></span>
<span class="line"><span>   ✓ 你不写大量 shell 脚本</span></span>
<span class="line"><span>   ✓ 你被 zsh 配置的复杂度劝退过</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>留在 zsh 的理由:</span></span>
<span class="line"><span>   ✓ 你已经熟悉 zsh,切换有成本</span></span>
<span class="line"><span>   ✓ 你需要 bash 兼容(zsh 大部分 bash 脚本能直接跑)</span></span>
<span class="line"><span>   ✓ 你想在多平台用同一套 shell</span></span>
<span class="line"><span>       服务器一般装 bash / zsh,fish 要单独装</span></span>
<span class="line"><span>   ✓ 你的 dotfiles 已经投资在 zsh 上</span></span></code></pre></div><p><strong>两个都好,不要在这个问题上花一整个周末</strong>。</p><hr><h2 id="十、真实选型决策树" tabindex="-1">十、真实选型决策树 <a class="header-anchor" href="#十、真实选型决策树" aria-label="Permalink to &quot;十、真实选型决策树&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>你写大量 shell 脚本(devops / CI / 部署脚本)?</span></span>
<span class="line"><span>  → 是:bash 必须熟,脚本一律 #!/usr/bin/env bash</span></span>
<span class="line"><span>        交互可以叠 zsh / fish</span></span>
<span class="line"><span>  → 否:可以 fish 当日常</span></span>
<span class="line"><span></span></span>
<span class="line"><span>你需要丰富补全 + 提示符自定义?</span></span>
<span class="line"><span>  → 是:zsh + zinit / fish 二选一</span></span>
<span class="line"><span>  → 否:bash 也够</span></span>
<span class="line"><span></span></span>
<span class="line"><span>你要在多 OS 间无缝迁移?</span></span>
<span class="line"><span>  → 是:zsh(macOS / Linux 都好)</span></span>
<span class="line"><span>  → Windows-heavy:WSL + bash 优先(脚本统一)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>你做 SRE / DevOps / 经常进容器?</span></span>
<span class="line"><span>  → bash 必须熟,zsh 当个人 shell</span></span></code></pre></div><h3 id="_10-1-角色对照" tabindex="-1">10.1 角色对照 <a class="header-anchor" href="#_10-1-角色对照" aria-label="Permalink to &quot;10.1 角色对照&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>角色                  日常交互     脚本默认    说明</span></span>
<span class="line"><span>─────────────────────────────────────────────────────────────</span></span>
<span class="line"><span>应用开发(Web/App)    zsh / fish   bash       脚本不多,日常爽就好</span></span>
<span class="line"><span>DevOps / SRE         zsh         bash       脚本一天好几个,bash 熟透</span></span>
<span class="line"><span>平台工程              zsh         bash       同上,CI 镜像要熟</span></span>
<span class="line"><span>数据工程              zsh         bash       主力是 Python/SQL</span></span>
<span class="line"><span>AI / Agent 工程师     fish 或 zsh  bash       灵活,看个人</span></span>
<span class="line"><span>学生 / 新人(不写)    fish        bash       fish 上手最快</span></span>
<span class="line"><span>工程总监 / 架构师      zsh         bash       少自己跑命令,稳定就好</span></span>
<span class="line"><span>服务器运维 / 嵌入式    bash        sh (POSIX) 经常只装 bash</span></span></code></pre></div><hr><h2 id="十一、给「我不会写-shell-脚本」的人" tabindex="-1">十一、给「我不会写 shell 脚本」的人 <a class="header-anchor" href="#十一、给「我不会写-shell-脚本」的人" aria-label="Permalink to &quot;十一、给「我不会写 shell 脚本」的人&quot;">​</a></h2><p>这一类读者占很大一部分,值得单独讲。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>你的画像:</span></span>
<span class="line"><span>  - 写应用代码为主(Java/Python/JS/Go),不写 deploy.sh</span></span>
<span class="line"><span>  - 看见同事写的 set -euo pipefail 你会愣 1 秒</span></span>
<span class="line"><span>  - 你的「shell 使用」= cd / ls / git / npm / kubectl</span></span>
<span class="line"><span>  - 你想要「命令好用、补全好用、不卡」就够了</span></span></code></pre></div><p><strong>推荐路径</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>第一年:     fish 当日常,bash 偶尔接触</span></span>
<span class="line"><span>            ↓</span></span>
<span class="line"><span>            fish 的开箱即用让你「shell 不再是负担」</span></span>
<span class="line"><span>            把精力花在你的本业(写应用)</span></span>
<span class="line"><span>            </span></span>
<span class="line"><span>第二年:     发现要写脚本了(自动化某个流程)</span></span>
<span class="line"><span>            ↓</span></span>
<span class="line"><span>            学一点 bash(写脚本,不写 fish)</span></span>
<span class="line"><span>            shebang 用 #!/usr/bin/env bash</span></span>
<span class="line"><span>            交互照样 fish</span></span>
<span class="line"><span>            </span></span>
<span class="line"><span>第三年:     如果已经写很多脚本,可以考虑切 zsh</span></span>
<span class="line"><span>            ↓</span></span>
<span class="line"><span>            交互和脚本语法接近,不再两套语法</span></span>
<span class="line"><span>            (但其实留在 fish 也行)</span></span></code></pre></div><p><strong>不推荐新人入门直接学 zsh</strong>:zsh 是「兼容 POSIX 又有自己扩展」的奇怪定位,新人会迷糊「这个语法是 bash 还是 zsh」,迷糊到一定程度后开始抵触 shell。fish 反而清爽:语法是自己一套,见到 fish 语法就知道「这是 fish」。</p><hr><h2 id="十二、反对的写法" tabindex="-1">十二、反对的写法 <a class="header-anchor" href="#十二、反对的写法" aria-label="Permalink to &quot;十二、反对的写法&quot;">​</a></h2><h3 id="_12-1-反对-「全部-fish-化」" tabindex="-1">12.1 反对:「全部 fish 化」 <a class="header-anchor" href="#_12-1-反对-「全部-fish-化」" aria-label="Permalink to &quot;12.1 反对:「全部 fish 化」&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错误:    把 ~/Projects/scripts/deploy.sh 第一行改成 #!/usr/bin/env fish</span></span>
<span class="line"><span>         然后说「fish 比 bash 好读」</span></span>
<span class="line"><span>         </span></span>
<span class="line"><span>后果:    </span></span>
<span class="line"><span>   - CI 镜像没装 fish,流水线 fail</span></span>
<span class="line"><span>   - Dockerfile 里 RUN ... fish 语法,build fail</span></span>
<span class="line"><span>   - 同事 clone 下来,他没装 fish,跑炸了</span></span>
<span class="line"><span>   - 一年后维护的人看不懂 fish,骂你</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>正确:    </span></span>
<span class="line"><span>   - fish 当日常没问题</span></span>
<span class="line"><span>   - 脚本永远 #!/usr/bin/env bash</span></span>
<span class="line"><span>   - SHELL 和 shebang 是两件事</span></span></code></pre></div><h3 id="_12-2-反对-「oh-my-zsh-全家桶」" tabindex="-1">12.2 反对:「oh-my-zsh 全家桶」 <a class="header-anchor" href="#_12-2-反对-「oh-my-zsh-全家桶」" aria-label="Permalink to &quot;12.2 反对:「oh-my-zsh 全家桶」&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错误:    装 oh-my-zsh,把推荐的 50 个插件全开</span></span>
<span class="line"><span>         主题用 p10k 默认,加 git/k8s/aws/docker/time/battery 一堆段</span></span>
<span class="line"><span>         </span></span>
<span class="line"><span>后果:</span></span>
<span class="line"><span>   - 启动 300-600ms,tmux 10 个 pane 卡爆</span></span>
<span class="line"><span>   - 90% 插件你根本不用</span></span>
<span class="line"><span>   - 配置文件几千行,维护变成负担</span></span>
<span class="line"><span>   - 升级 oh-my-zsh 还可能破坏自定义</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>正确:</span></span>
<span class="line"><span>   - zsh + zinit + 5-10 个真在用的插件(lazy load)</span></span>
<span class="line"><span>   - 或者 zsh + Starship + 完全不装框架</span></span>
<span class="line"><span>   - 06 篇专门讲怎么做</span></span></code></pre></div><h3 id="_12-3-反对-「用-bash-当-zsh」" tabindex="-1">12.3 反对:「用 bash 当 zsh」 <a class="header-anchor" href="#_12-3-反对-「用-bash-当-zsh」" aria-label="Permalink to &quot;12.3 反对:「用 bash 当 zsh」&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错误:    把 zsh 的主题 / 插件 / 补全 copy 到 bash 里</span></span>
<span class="line"><span>         以为 bash 是 zsh 的弱化版</span></span>
<span class="line"><span>         </span></span>
<span class="line"><span>事实:    bash 不是 zsh 的弱化版,语法语义有差异</span></span>
<span class="line"><span>         bash 没有 zsh 的 hook、vcs_info、zle 编辑器</span></span>
<span class="line"><span>         硬移植出来的体验半残废</span></span>
<span class="line"><span>         </span></span>
<span class="line"><span>正确:    要 zsh 体验就直接装 zsh,bash 留给脚本</span></span></code></pre></div><h3 id="_12-4-反对-「shell-选型是宗教」" tabindex="-1">12.4 反对:「shell 选型是宗教」 <a class="header-anchor" href="#_12-4-反对-「shell-选型是宗教」" aria-label="Permalink to &quot;12.4 反对:「shell 选型是宗教」&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错误:    在 HN / 推 / 知乎上参与「fish 党 vs zsh 党」式口水战</span></span>
<span class="line"><span>         以为自己用的 shell 是「最优解」</span></span>
<span class="line"><span>         </span></span>
<span class="line"><span>事实:    三个 shell 各有定位,没有「最优」</span></span>
<span class="line"><span>         vim vs emacs / tabs vs spaces 式争论浪费时间</span></span>
<span class="line"><span>         </span></span>
<span class="line"><span>正确:    选适合你的场景,然后闭嘴干活</span></span>
<span class="line"><span>         别人选不一样的,大概率他的场景不一样</span></span></code></pre></div><h3 id="_12-5-反对-「不学-bash」" tabindex="-1">12.5 反对:「不学 bash」 <a class="header-anchor" href="#_12-5-反对-「不学-bash」" aria-label="Permalink to &quot;12.5 反对:「不学 bash」&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错误:    「我用 fish,不用学 bash」</span></span>
<span class="line"><span>         </span></span>
<span class="line"><span>事实:    你迟早要写 deploy.sh、Dockerfile RUN、CI workflow</span></span>
<span class="line"><span>         你迟早要看别人的 bash 脚本</span></span>
<span class="line"><span>         你迟早要在没有 fish 的服务器 / 容器里干活</span></span>
<span class="line"><span>         </span></span>
<span class="line"><span>正确:    交互可以 fish,但 bash 语法必须懂</span></span>
<span class="line"><span>         至少能读、能改简单脚本</span></span>
<span class="line"><span>         27 篇会讲脚本工程化最低门槛</span></span></code></pre></div><hr><h2 id="十三、看完这一篇-你应该能" tabindex="-1">十三、看完这一篇,你应该能 <a class="header-anchor" href="#十三、看完这一篇-你应该能" aria-label="Permalink to &quot;十三、看完这一篇,你应该能&quot;">​</a></h2><ol><li><strong>拒绝「我该用 zsh 还是 fish?」这道题</strong>——它问错了,正确拆解是「交互 shell 用什么 + 脚本由谁解释」</li><li><strong>解释为什么 bash 不能丢</strong>——脚本可移植性、CI/Docker/容器、POSIX 标准、shebang 选择</li><li><strong>解释 POSIX 兼容这件事重要在哪</strong>——<code>/bin/sh</code> 在不同系统指向不同实现,bashism 会在 Alpine 上炸</li><li><strong>看到 <code>#!/usr/bin/env bash</code> 和 <code>#!/bin/sh</code> 知道差别</strong>——前者用 PATH 里的 bash(可能 brew 装的),后者用系统 POSIX sh</li><li><strong>理解启动速度的工程意义</strong>——oh-my-zsh 默认 300ms vs zinit lazy 50ms,tmux 10 pane 直接卡 3 秒</li><li><strong>给团队新人推荐 shell 不再瞎给</strong>——写脚本多的给 zsh + bash,不写脚本的给 fish + bash,统一是错的</li></ol><p><strong>一个硬指标</strong>:看完这篇,你应该能在 30 秒内回答下面这个问题:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>「我刚换了新 Mac,装哪个 shell?」</span></span>
<span class="line"><span></span></span>
<span class="line"><span>→ 默认 zsh 已经在,先用着</span></span>
<span class="line"><span>→ brew install bash 装个新 bash(脚本能用 4+ 特性)</span></span>
<span class="line"><span>→ 如果你不写大量脚本 + 不爱配置,brew install fish 切过去</span></span>
<span class="line"><span>→ 不要装 oh-my-zsh —— 06 篇有更好的方案</span></span>
<span class="line"><span>→ Starship 跨 shell 通用,先不急装,07 篇细讲</span></span></code></pre></div><p>回答得出来这套,这篇就值了。</p><hr><h2 id="十四、下一篇预告" tabindex="-1">十四、下一篇预告 <a class="header-anchor" href="#十四、下一篇预告" aria-label="Permalink to &quot;十四、下一篇预告&quot;">​</a></h2><p>下一篇:<strong><code>06-zsh工程化配置.md</code></strong></p><p>讲完「为什么选 zsh」之后,下一篇就讲**「选了 zsh 怎么配才不蠢」**:</p><ul><li>zsh 的 5 类配置文件:<code>.zshenv</code> / <code>.zprofile</code> / <code>.zshrc</code> / <code>.zlogin</code> / <code>.zlogout</code>,<strong>90% 人写错</strong></li><li>框架对比:<strong>oh-my-zsh / prezto / zinit / 不用框架</strong>,什么场景选哪个</li><li>启动调优:zprof / 异步加载 / lazy load,从 600ms 降到 50ms 的工程路径</li><li>补全系统(compsys)心智:<code>autoload -Uz compinit</code> 后面发生了什么、<code>_command</code> 补全文件长什么样</li><li>不用框架的「最小可跑 .zshrc」——20 行包括 prompt、补全、历史、键位</li><li>反对:把 .zshrc 写到 3000 行的人是把它当 dotfile 博物馆,不是工程文件</li></ul><p>读完 06,你能在新机器上 10 分钟把 zsh 配到「<strong>和你现在用的一样快、一样好用,但启动 50ms 内</strong>」。<strong>这是 fish 一年试图劝你切过去的核心理由——配置的成本——一旦摆平,zsh 的上限是 fish 比不了的(因为 zsh 有 25 年的生态沉淀)</strong>。</p><p>但如果你看完 06 觉得「这套调优我不想搞」——<strong>那 fish 确实更适合你</strong>,这没什么丢人的。<strong>工具是工具,工具不是身份</strong>。</p>`,166)])])}const g=a(l,[["render",h]]);export{o as __pageData,g as default};
