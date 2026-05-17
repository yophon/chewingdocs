import{_ as a,H as n,f as p,i as l}from"./chunks/framework.BHvCMIhP.js";const h=JSON.parse('{"title":"Modal Editing 的本质:命令是语法不是快捷键","description":"","frontmatter":{},"headers":[],"relativePath":"../terminalLearning/19-modal-editing的本质.md","filePath":"../terminalLearning/19-modal-editing的本质.md","lastUpdated":1778574438000}'),e={name:"../terminalLearning/19-modal-editing的本质.md"};function i(t,s,o,c,d,r){return n(),p("div",null,[...s[0]||(s[0]=[l(`<h1 id="modal-editing-的本质-命令是语法不是快捷键" tabindex="-1">Modal Editing 的本质:命令是语法不是快捷键 <a class="header-anchor" href="#modal-editing-的本质-命令是语法不是快捷键" aria-label="Permalink to &quot;Modal Editing 的本质:命令是语法不是快捷键&quot;">​</a></h1><p>vim 用户被嘲笑&quot;键盘玄学&quot;——非 vim 用户看到 <code>dw / ciw / yi&quot; / &gt;ip / :%s/foo/bar/g</code> 这种命令,脑子里第一反应是&quot;这是什么外星文字&quot;,随后默认这套东西是&quot;老古董秘籍&quot;,和现代 IDE 的鼠标 + 菜单 + 快捷键比是落后的。<strong>这是 2026 年最大的认知误区之一</strong>。<strong>真相</strong>:<strong>modal editing 不是快捷键技巧,是把&quot;编辑文本&quot;做成一种语言</strong>——你说&quot;删一个单词&quot;(<code>dw</code>),而不是按&quot;鼠标选中单词 + 按 delete&quot;。<strong>前者是说话,后者是操作</strong>。</p><p>这个差异看起来微妙,<strong>实际是数量级的差异</strong>:<strong>说话是一种&quot;组合性极强的输出方式&quot;</strong>——你脑子里想&quot;删 3 行&quot;,<code>d3j</code>;你想&quot;复制这个单词到剪贴板&quot;,<code>yiw</code>;你想&quot;把这段缩进&quot;,<code>&gt;ip</code>。<strong>每一条命令都是&quot;动词 + 范围&quot;的组合,可以无穷造句</strong>。鼠标 + 菜单不是这样,<strong>它的每一步都是&quot;选 → 点 → 选 → 点&quot;的离散操作,无法组合</strong>。</p><p><strong>vim 50 年没死、Helix 2024 重新崛起、Neovim 成为 GitHub 第二多 star 的编辑器、几乎所有 IDE 都有 vim 模式——这种&quot;反潮流&quot;不是怀旧,是 modal editing 这套范式本身赢了</strong>。<strong>这一篇不教你 vim 命令</strong>——20 篇 Neovim、21 篇 Helix 那边教具体配置,<strong>这一篇讲 modal editing 的&quot;哲学&quot;</strong>:为什么命令变语法是核心、text object 是修饰这门语言的关键、Helix 怎么把范式翻过来、modal editing 在哪些地方&quot;渗透&quot;了你日常的工具、谁该学谁不该学。</p><blockquote><p>一句话先记住:<strong>modal editing 的核心不是 hjkl,是「命令 = 动词 + 范围」的可组合语法 — 这种语法让你脑子里想什么,手指打什么,中间没有&quot;鼠标拖选&quot;这个步骤。所有的 vim/Helix/Kakoune 都是这套语法的不同方言,学会一种,迁移到另一种是几天的事;不学,你的编辑速度上限就在那里</strong>。</p></blockquote><hr><h2 id="一、modal-是什么-三种命令分发哲学" tabindex="-1">一、modal 是什么:三种命令分发哲学 <a class="header-anchor" href="#一、modal-是什么-三种命令分发哲学" aria-label="Permalink to &quot;一、modal 是什么:三种命令分发哲学&quot;">​</a></h2><p>要理解 modal editing,先看它的&quot;对手们&quot;长什么样——所有编辑器都要解决一个问题:<strong>用户怎么把&quot;命令&quot;告诉编辑器</strong>。这个问题有三种主要解法。</p><h3 id="_1-1-修饰键编辑器-vs-code-emacs-sublime-默认行为" tabindex="-1">1.1 修饰键编辑器(VS Code / Emacs / Sublime 默认行为) <a class="header-anchor" href="#_1-1-修饰键编辑器-vs-code-emacs-sublime-默认行为" aria-label="Permalink to &quot;1.1 修饰键编辑器(VS Code / Emacs / Sublime 默认行为)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>范式:用户按 Ctrl/Cmd/Alt + 字母,组成命令</span></span>
<span class="line"><span></span></span>
<span class="line"><span>例子:</span></span>
<span class="line"><span>   VS Code: Ctrl-S(保存)Ctrl-X(剪切)Ctrl-V(粘贴)</span></span>
<span class="line"><span>            Ctrl-F(查找)Ctrl-Shift-P(命令面板)</span></span>
<span class="line"><span>   Emacs:  C-x C-s(保存)C-y(yank)C-k(kill line)</span></span>
<span class="line"><span>            M-x replace-string(命令)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>心智:键盘上的每个字母默认是&quot;字符的输入&quot;,</span></span>
<span class="line"><span>     按 Ctrl/Alt 修饰才变成&quot;命令&quot;</span></span></code></pre></div><p><strong>优点</strong>:</p><ul><li>学习曲线缓,常用命令(Ctrl-S/C/V)所有人都会</li><li>命令是&quot;原子&quot;的,一次按键就发出来</li><li>不需要切换状态</li></ul><p><strong>缺点</strong>:</p><ul><li>命令空间有限(只有 26 个字母 × 几个修饰键 = 100 多个组合)</li><li>复合命令困难(VS Code 的 Ctrl-K Ctrl-S 这种 chord 反人类)</li><li>一次只能发一个命令(无法组合&quot;删 3 个单词&quot;)</li><li>长期用伤手(小指反复按 Ctrl/Cmd,即&quot;Emacs 小拇指&quot;)</li></ul><h3 id="_1-2-命令面板编辑器-vs-code-sublime-现代-ide" tabindex="-1">1.2 命令面板编辑器(VS Code / Sublime / 现代 IDE) <a class="header-anchor" href="#_1-2-命令面板编辑器-vs-code-sublime-现代-ide" aria-label="Permalink to &quot;1.2 命令面板编辑器(VS Code / Sublime / 现代 IDE)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>范式:用户按一个快捷键(Ctrl-Shift-P),弹一个 fuzzy 搜索框,</span></span>
<span class="line"><span>     输入命令名,选中,执行</span></span>
<span class="line"><span></span></span>
<span class="line"><span>例子:</span></span>
<span class="line"><span>   &quot;Format Document&quot;</span></span>
<span class="line"><span>   &quot;Rename Symbol&quot;</span></span>
<span class="line"><span>   &quot;Go to Definition&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>心智:把命令做成&quot;应用程序的菜单&quot;,用搜索代替记忆</span></span></code></pre></div><p><strong>优点</strong>:</p><ul><li>命令空间无限(可以有 1000 个命令)</li><li>不需要记快捷键</li><li>命令自带描述,新人友好</li></ul><p><strong>缺点</strong>:</p><ul><li>慢(打开面板 → 输入 → 选 → enter,4 步)</li><li>不适合频繁操作</li><li>没法组合(每条命令是独立的)</li></ul><p><strong>结论</strong>:命令面板适合&quot;低频但要发现&quot;的命令(rename / format / refactor),不适合&quot;高频且要快速&quot;的操作(删单词 / 改括号内 / 缩进段落)。</p><h3 id="_1-3-modal-编辑器-vim-helix-kakoune" tabindex="-1">1.3 modal 编辑器(vim / Helix / Kakoune) <a class="header-anchor" href="#_1-3-modal-编辑器-vim-helix-kakoune" aria-label="Permalink to &quot;1.3 modal 编辑器(vim / Helix / Kakoune)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>范式:用户在 normal 模式下,键盘的每个字母都是&quot;命令的一部分&quot;,</span></span>
<span class="line"><span>     按 i 进入 insert 模式才是&quot;输入文字&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>例子:</span></span>
<span class="line"><span>   dw      删一个单词</span></span>
<span class="line"><span>   ciw     change inside word(改当前单词)</span></span>
<span class="line"><span>   yi&quot;     yank inside quotes(复制引号内的内容)</span></span>
<span class="line"><span>   d3j     向下删 3 行</span></span>
<span class="line"><span>   &gt;ip     缩进当前段落</span></span>
<span class="line"><span></span></span>
<span class="line"><span>心智:把整个键盘变成命令面板,字母 = 命令,</span></span>
<span class="line"><span>     输入文字是&quot;特殊模式&quot;,不是默认模式</span></span></code></pre></div><p><strong>优点</strong>:</p><ul><li><strong>命令可以组合</strong>——<code>d3w</code> = 删 3 个单词,<code>y2j</code> = yank 当前和下两行,<strong>几乎无穷的组合</strong></li><li>命令短,所有手指都在 home row(j k l 😉</li><li>不抬手,左右手不离键盘中央</li><li>速度上限远高于鼠标</li><li>没有&quot;小指综合症&quot;(不需要反复按 Ctrl)</li></ul><p><strong>缺点</strong>:</p><ul><li>学习曲线陡(初期 1-3 个月)</li><li>切换模式有心智负担(忘了在哪个模式就乱按)</li><li>不直觉(新手不知道 <code>d</code> 是 delete)</li></ul><p><strong>真正的差异在&quot;组合性&quot;</strong>——前两种范式的命令是离散的、孤立的,modal 的命令是<strong>可造句的语法</strong>。<strong>这就是这一篇要讲的本质</strong>。</p><hr><h2 id="二、命令-动词-范围-这门语言的语法" tabindex="-1">二、命令 = 动词 + 范围:这门语言的语法 <a class="header-anchor" href="#二、命令-动词-范围-这门语言的语法" aria-label="Permalink to &quot;二、命令 = 动词 + 范围:这门语言的语法&quot;">​</a></h2><h3 id="_2-1-vim-命令的完整语法" tabindex="-1">2.1 vim 命令的完整语法 <a class="header-anchor" href="#_2-1-vim-命令的完整语法" aria-label="Permalink to &quot;2.1 vim 命令的完整语法&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>命令 = [数字] 动词 [数字] 范围</span></span>
<span class="line"><span></span></span>
<span class="line"><span>动词(operator):</span></span>
<span class="line"><span>   d  delete(删)</span></span>
<span class="line"><span>   c  change(删 + 进入 insert)</span></span>
<span class="line"><span>   y  yank(复制)</span></span>
<span class="line"><span>   p  put(粘贴)</span></span>
<span class="line"><span>   &gt;  缩进右</span></span>
<span class="line"><span>   &lt;  缩进左</span></span>
<span class="line"><span>   gu  小写</span></span>
<span class="line"><span>   gU  大写</span></span>
<span class="line"><span>   ~  反转大小写</span></span>
<span class="line"><span>   gq  reformat(自动换行)</span></span>
<span class="line"><span>   =  缩进对齐</span></span>
<span class="line"><span></span></span>
<span class="line"><span>范围(motion):</span></span>
<span class="line"><span>   w / b              向后/前一个单词</span></span>
<span class="line"><span>   W / B              向后/前一个 WORD(空格分隔的更大单位)</span></span>
<span class="line"><span>   e                  到下一个单词的末尾</span></span>
<span class="line"><span>   $                  到行尾</span></span>
<span class="line"><span>   0 / ^              到行首 / 第一个非空字符</span></span>
<span class="line"><span>   G / gg             到文件末尾 / 文件开头</span></span>
<span class="line"><span>   {  /  }            上一段 / 下一段</span></span>
<span class="line"><span>   f&lt;char&gt; / F&lt;char&gt;  到下一个 / 上一个出现的字符</span></span>
<span class="line"><span>   t&lt;char&gt; / T&lt;char&gt;  到下一个字符前 / 上一个字符后</span></span>
<span class="line"><span>   /pattern           向后查找</span></span>
<span class="line"><span>   ?pattern           向前查找</span></span>
<span class="line"><span>   i&lt;x&gt;               inside x(单词 / 引号 / 括号 / 段落 / 句子)</span></span>
<span class="line"><span>   a&lt;x&gt;               around x</span></span>
<span class="line"><span></span></span>
<span class="line"><span>例子:</span></span>
<span class="line"><span>   dw    = 删一个 word                 d  + w(单词)</span></span>
<span class="line"><span>   d2w   = 删两个 word                 d  + 2  + w</span></span>
<span class="line"><span>   ciw   = change inside word          c  + iw(inside word)</span></span>
<span class="line"><span>   dap   = delete around paragraph     d  + ap(around paragraph)</span></span>
<span class="line"><span>   y$    = yank 到行尾                 y  + $(到行尾)</span></span>
<span class="line"><span>   &gt;ip   = inside paragraph 缩进       &gt;  + ip(inside paragraph)</span></span>
<span class="line"><span>   df,   = delete until ,(含逗号)    d  + f,(找到下一个逗号)</span></span>
<span class="line"><span>   dt)   = delete until )(不含括号)  d  + t)(到下一个括号前)</span></span></code></pre></div><p><strong>这就是一门语言</strong>——动词决定&quot;做什么&quot;,范围决定&quot;对谁做&quot;,<strong>两者组合产生无穷的句子</strong>。</p><h3 id="_2-2-几个真实例子-每天都在用" tabindex="-1">2.2 几个真实例子:每天都在用 <a class="header-anchor" href="#_2-2-几个真实例子-每天都在用" aria-label="Permalink to &quot;2.2 几个真实例子:每天都在用&quot;">​</a></h3><p>把这门语言用在真实编辑场景:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>场景 1:你在写函数,想改函数名</span></span>
<span class="line"><span>   1. 把光标移到函数名上(任何位置都行)</span></span>
<span class="line"><span>   2. 按 ciw → 删除当前单词,进入 insert 模式</span></span>
<span class="line"><span>   3. 输入新名字</span></span>
<span class="line"><span>   4. ESC → 回到 normal 模式</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   总按键:ciw 新名字 ESC</span></span>
<span class="line"><span>   传统(鼠标):双击单词(选中) → 按 delete → 输入新名字</span></span>
<span class="line"><span>   modal 节省:省掉&quot;双击 + 找到鼠标 + 移动鼠标&quot;的时间</span></span>
<span class="line"><span></span></span>
<span class="line"><span>场景 2:你看到一个 JSON 字符串,想改 value</span></span>
<span class="line"><span>   &quot;name&quot;: &quot;old_name&quot;</span></span>
<span class="line"><span>                ^^^^^^^^                想改这个</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   1. 移到引号内任何位置</span></span>
<span class="line"><span>   2. 按 ci&quot; → change inside quotes</span></span>
<span class="line"><span>   3. 输入新内容</span></span>
<span class="line"><span>   4. ESC</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   总按键:ci&quot; 新内容 ESC</span></span>
<span class="line"><span>   传统:鼠标拖选(精确选中引号内,不选引号) → 删除 → 输入</span></span>
<span class="line"><span></span></span>
<span class="line"><span>场景 3:你想删整个函数(假设是单一段落)</span></span>
<span class="line"><span>   def foo():</span></span>
<span class="line"><span>       a = 1</span></span>
<span class="line"><span>       b = 2</span></span>
<span class="line"><span>       return a + b</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   1. 移到函数内任何位置</span></span>
<span class="line"><span>   2. 按 dap → delete around paragraph</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   总按键:dap(3 个键)</span></span>
<span class="line"><span>   传统:鼠标拖选(精确从 def 拖到 return 行末) → 删除</span></span>
<span class="line"><span></span></span>
<span class="line"><span>场景 4:把光标到下一个 ; 之前的内容删掉</span></span>
<span class="line"><span>   var x = foo(a, b);</span></span>
<span class="line"><span>                ^</span></span>
<span class="line"><span>                这里光标</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   1. 按 dt;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   总按键:dt;(3 个键)</span></span>
<span class="line"><span>   传统:鼠标拖选 → 删除</span></span></code></pre></div><p><strong>这就是 modal editing 的&quot;价值&quot;</strong>——<strong>你大脑里&quot;想做什么&quot;和&quot;手指敲什么&quot;之间没有&quot;鼠标&quot;这个中间层</strong>。</p><h3 id="_2-3-范围的层次-粒度从细到粗" tabindex="-1">2.3 范围的层次:粒度从细到粗 <a class="header-anchor" href="#_2-3-范围的层次-粒度从细到粗" aria-label="Permalink to &quot;2.3 范围的层次:粒度从细到粗&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>最细                                                          最粗</span></span>
<span class="line"><span>字符  ──  词内  ──  单词  ──  句子  ──  段落  ──  函数  ──  文件</span></span>
<span class="line"><span> h        i_w      w/b      i_s     i_p     i_f      gg/G</span></span>
<span class="line"><span> l                          a_s     a_p     a_f</span></span></code></pre></div><p><strong>vim 的 motion 覆盖了从&quot;字符&quot;到&quot;文件&quot;的全粒度</strong>——你想精确改一个字符,<code>r&lt;char&gt;</code>;想改半个单词,<code>f&lt;char&gt;</code> 移到目标;想改整个函数,<code>daf</code>(需要 treesitter 或 LSP 支持的 text object)。</p><p><strong>这种粒度选择是 modal editing 的另一项核心优势</strong>——你可以&quot;快进&quot;到粗粒度操作,<strong>几个按键解决一大段编辑</strong>;鼠标只能一格一格拖,粒度不能调。</p><h3 id="_2-4-数字前缀-量词" tabindex="-1">2.4 数字前缀:量词 <a class="header-anchor" href="#_2-4-数字前缀-量词" aria-label="Permalink to &quot;2.4 数字前缀:量词&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>3dw    删 3 个单词</span></span>
<span class="line"><span>5j     下移 5 行</span></span>
<span class="line"><span>2dd    删 2 行</span></span>
<span class="line"><span>7yy    yank 7 行</span></span>
<span class="line"><span>.      重复上一个命令(这个不是数字,但配合数字常用)</span></span></code></pre></div><p><strong>vim 命令的完整语法</strong>:<code>[数字] 动词 [数字] 范围</code> ——量词可以放在动词前、动词后,<strong>结果一样</strong>(<code>3dw == d3w</code>)。</p><hr><h2 id="三、text-object-这门语言的-名词" tabindex="-1">三、text object:这门语言的&quot;名词&quot; <a class="header-anchor" href="#三、text-object-这门语言的-名词" aria-label="Permalink to &quot;三、text object:这门语言的&quot;名词&quot;&quot;">​</a></h2><h3 id="_3-1-i-和-a-的区别" tabindex="-1">3.1 i 和 a 的区别 <a class="header-anchor" href="#_3-1-i-和-a-的区别" aria-label="Permalink to &quot;3.1 i 和 a 的区别&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>inside(i):不包括边界</span></span>
<span class="line"><span>around(a):包括边界</span></span>
<span class="line"><span></span></span>
<span class="line"><span>例子:    &quot;hello world&quot;</span></span>
<span class="line"><span>             ^</span></span>
<span class="line"><span>             光标在这里</span></span>
<span class="line"><span></span></span>
<span class="line"><span>ci&quot;  → &quot;_&quot;          删除引号内的内容,进入 insert(引号还在,内容空了)</span></span>
<span class="line"><span>ca&quot;  →              删除整个 &quot;hello world&quot;(引号也删了)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>例子:    (a, b, c)</span></span>
<span class="line"><span>              ^</span></span>
<span class="line"><span></span></span>
<span class="line"><span>ci(  → &quot;(  )&quot;       内容删了,括号还在</span></span>
<span class="line"><span>ca(  →              括号也删了</span></span></code></pre></div><h3 id="_3-2-vim-内置的-text-object" tabindex="-1">3.2 vim 内置的 text object <a class="header-anchor" href="#_3-2-vim-内置的-text-object" aria-label="Permalink to &quot;3.2 vim 内置的 text object&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>i_w / a_w     word                  i_W / a_W   WORD(空格分隔)</span></span>
<span class="line"><span>i_s / a_s     sentence              i_p / a_p   paragraph</span></span>
<span class="line"><span>i&quot; / a&quot;       双引号                i&#39; / a&#39;     单引号</span></span>
<span class="line"><span>i\` / a\`       反引号</span></span>
<span class="line"><span>i( / a(       括号                  i[ / a[     方括号</span></span>
<span class="line"><span>i{ / a{       大括号                i&lt; / a&lt;     尖括号</span></span>
<span class="line"><span>it / at       HTML/XML tag</span></span>
<span class="line"><span>i_t           inside tag(只删 tag 之间的内容)</span></span></code></pre></div><h3 id="_3-3-真实场景-每天都用的几个" tabindex="-1">3.3 真实场景:每天都用的几个 <a class="header-anchor" href="#_3-3-真实场景-每天都用的几个" aria-label="Permalink to &quot;3.3 真实场景:每天都用的几个&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>场景:改 Markdown 链接的文本</span></span>
<span class="line"><span>   [click here](https://example.com)</span></span>
<span class="line"><span>        ^        光标在这里</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   ci[ → 删掉 &quot;click here&quot;,进入 insert</span></span>
<span class="line"><span>   ci( → 删掉 URL,进入 insert</span></span>
<span class="line"><span></span></span>
<span class="line"><span>场景:改 HTML 标签的属性</span></span>
<span class="line"><span>   &lt;div class=&quot;container&quot;&gt;</span></span>
<span class="line"><span>                  ^</span></span>
<span class="line"><span>   ci&quot;  → 删掉 &quot;container&quot;,改属性值</span></span>
<span class="line"><span>   cit  → 删掉 tag 之间的内容</span></span>
<span class="line"><span>   cat  → 删掉整个 div tag</span></span>
<span class="line"><span></span></span>
<span class="line"><span>场景:改函数参数</span></span>
<span class="line"><span>   def foo(a, b, c):</span></span>
<span class="line"><span>              ^</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   ci( → 删掉 &quot;a, b, c&quot;,进入 insert,重写参数</span></span>
<span class="line"><span></span></span>
<span class="line"><span>场景:改 Python 字典 value</span></span>
<span class="line"><span>   {&quot;name&quot;: &quot;Alice&quot;, &quot;age&quot;: 30}</span></span>
<span class="line"><span>                ^</span></span>
<span class="line"><span>   ci&quot; → 删掉 &quot;Alice&quot;</span></span></code></pre></div><p><strong>这就是 text object 的威力</strong>——你不需要精确选中括号内、引号内、tag 内,<strong>vim 自己知道边界</strong>。</p><h3 id="_3-4-现代扩展-lsp-treesitter-的-text-object" tabindex="-1">3.4 现代扩展:LSP / treesitter 的 text object <a class="header-anchor" href="#_3-4-现代扩展-lsp-treesitter-的-text-object" aria-label="Permalink to &quot;3.4 现代扩展:LSP / treesitter 的 text object&quot;">​</a></h3><p>vim 内置的 text object 是基于&quot;字符模式&quot;的(引号、括号),<strong>Neovim + treesitter / LSP 让 text object 扩展到&quot;语义层&quot;</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>i_f / a_f      function(treesitter / LSP 提供)</span></span>
<span class="line"><span>i_c / a_c      class</span></span>
<span class="line"><span>i_l / a_l      loop</span></span>
<span class="line"><span>i_i / a_i      if-block</span></span>
<span class="line"><span>i_a / a_a      argument(参数)</span></span></code></pre></div><p><strong>例子</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>def calculate(x, y, z):</span></span>
<span class="line"><span>    result = (x + y) * z</span></span>
<span class="line"><span>              ^</span></span>
<span class="line"><span></span></span>
<span class="line"><span>i_f → 选 def 到 return 之间(函数体)</span></span>
<span class="line"><span>a_f → 选整个 def + 函数体</span></span>
<span class="line"><span>i_a → 选当前光标所在的参数 &quot;x&quot;</span></span></code></pre></div><p><strong>这是 2024-2026 modal editing 的&quot;现代复兴&quot;</strong>——通过 treesitter,<strong>text object 从&quot;字符&quot;升级到&quot;语法&quot;</strong>。你说&quot;删整个函数&quot;,<code>daf</code> 一气呵成,<strong>这是 IDE 用鼠标实现不了的速度</strong>。</p><h3 id="_3-5-text-object-的真正优势-不需要瞄准" tabindex="-1">3.5 text object 的真正优势:不需要瞄准 <a class="header-anchor" href="#_3-5-text-object-的真正优势-不需要瞄准" aria-label="Permalink to &quot;3.5 text object 的真正优势:不需要瞄准&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>鼠标精确选中&quot;引号内&quot;(不含引号):</span></span>
<span class="line"><span>   - 拖选起点必须在第一个字符上</span></span>
<span class="line"><span>   - 拖选终点必须在最后一个字符上</span></span>
<span class="line"><span>   - 多 1 像素就选错了</span></span>
<span class="line"><span>   - 一天上百次,微妙的&quot;瞄准疲劳&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>ci&quot;</span></span>
<span class="line"><span>   - 光标只要在引号之间任何位置</span></span>
<span class="line"><span>   - vim 自己找到引号边界</span></span>
<span class="line"><span>   - 不需要瞄准</span></span></code></pre></div><p><strong>这就是 text object 比鼠标&quot;高一档&quot;的本质</strong>——<strong>vim 替你计算了边界</strong>。你只需要表达&quot;我要改引号内的东西&quot;,<strong>怎么找边界是 vim 的事</strong>。</p><hr><h2 id="四、modal-三个核心模式" tabindex="-1">四、modal 三个核心模式 <a class="header-anchor" href="#四、modal-三个核心模式" aria-label="Permalink to &quot;四、modal 三个核心模式&quot;">​</a></h2><p>vim 有 4-5 个模式,<strong>但实际工作里 90% 时间在 3 个</strong>:</p><h3 id="_4-1-normal-模式-默认" tabindex="-1">4.1 Normal 模式(默认) <a class="header-anchor" href="#_4-1-normal-模式-默认" aria-label="Permalink to &quot;4.1 Normal 模式(默认)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>特征:</span></span>
<span class="line"><span>   - 光标在文本上,但你不能&quot;打字&quot;(按字母不是输入,是命令)</span></span>
<span class="line"><span>   - 所有命令在这里发(d, c, y, p, w, b, $, 0, ...)</span></span>
<span class="line"><span>   - 大部分时间应该在这个模式</span></span>
<span class="line"><span></span></span>
<span class="line"><span>反直觉点:</span></span>
<span class="line"><span>   - vim 启动时默认在 normal 模式,新手会卡(我按 a 没反应)</span></span>
<span class="line"><span>   - 这是设计,不是 bug</span></span></code></pre></div><h3 id="_4-2-insert-模式" tabindex="-1">4.2 Insert 模式 <a class="header-anchor" href="#_4-2-insert-模式" aria-label="Permalink to &quot;4.2 Insert 模式&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>特征:</span></span>
<span class="line"><span>   - 按字母就是输入字符(和 VS Code 一样)</span></span>
<span class="line"><span>   - 按 ESC 回到 normal</span></span>
<span class="line"><span>   - 只在&quot;实际打字&quot;的短暂时间停留</span></span>
<span class="line"><span></span></span>
<span class="line"><span>进入方式:</span></span>
<span class="line"><span>   i      在光标前进入 insert</span></span>
<span class="line"><span>   a      在光标后进入 insert</span></span>
<span class="line"><span>   I      在行首进入 insert</span></span>
<span class="line"><span>   A      在行末进入 insert</span></span>
<span class="line"><span>   o      下面开一新行进入 insert</span></span>
<span class="line"><span>   O      上面开一新行进入 insert</span></span></code></pre></div><p><strong>核心心智</strong>:<strong>Insert 模式是&quot;短暂的&quot;——只在你输入新内容时停留,输完立刻 ESC 回 normal</strong>。<strong>新人最大的错误是&quot;长期待在 insert 模式,什么都用鼠标 / 方向键操作&quot;</strong>——这等于把 vim 当 Notepad 用,没用上 modal 的任何优势。</p><h3 id="_4-3-visual-模式" tabindex="-1">4.3 Visual 模式 <a class="header-anchor" href="#_4-3-visual-模式" aria-label="Permalink to &quot;4.3 Visual 模式&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>特征:</span></span>
<span class="line"><span>   - 选区模式,按 j / k 扩展选区</span></span>
<span class="line"><span>   - 选完后按动词(d / c / y)对选区操作</span></span>
<span class="line"><span>   - 类似鼠标拖选,但用键盘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>进入方式:</span></span>
<span class="line"><span>   v       字符级 visual</span></span>
<span class="line"><span>   V       行级 visual</span></span>
<span class="line"><span>   Ctrl-v  块级 visual(列选)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>例子:</span></span>
<span class="line"><span>   v3w → 选当前到向后 3 个单词</span></span>
<span class="line"><span>   V → 选当前整行,V5j → 扩展选 6 行</span></span></code></pre></div><p><strong>Visual 模式的角色</strong>:<strong>当你不确定要选多少时,先 visual 看一眼再发命令</strong>。<strong>老手用 Visual 比新人想象的少</strong>——老手知道 motion / text object,<strong>直接 <code>d3w</code> / <code>daf</code> 而不是先 V 选再 d</strong>。</p><h3 id="_4-4-其他模式-用得少" tabindex="-1">4.4 其他模式(用得少) <a class="header-anchor" href="#_4-4-其他模式-用得少" aria-label="Permalink to &quot;4.4 其他模式(用得少)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Replace 模式 (R):  覆盖输入(按一个字符替换一个)</span></span>
<span class="line"><span>Command-line 模式 (:): 输入 ex 命令(:w, :q, :%s/foo/bar/g, ...)</span></span></code></pre></div><p><strong>90% 时间在 normal,8% 在 insert,2% 在 visual</strong>——这是熟练 vim 用户的真实分布。新人正好相反(80% 在 insert,因为他们不会用 normal 的命令)。<strong>这是 vim 熟练度的最简单度量</strong>:<strong>你在 normal 模式的时间占比越高,你越熟练</strong>。</p><h3 id="_4-5-状态机视图" tabindex="-1">4.5 状态机视图 <a class="header-anchor" href="#_4-5-状态机视图" aria-label="Permalink to &quot;4.5 状态机视图&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>              ┌───────── ESC ─────────┐</span></span>
<span class="line"><span>              ↓                       │</span></span>
<span class="line"><span>       ┌─────────────┐                │</span></span>
<span class="line"><span>       │   Normal    │                │</span></span>
<span class="line"><span>       │  (default)  │                │</span></span>
<span class="line"><span>       └─────────────┘                │</span></span>
<span class="line"><span>       │  │  │  │                     │</span></span>
<span class="line"><span>       i  v  V  Ctrl-v                │</span></span>
<span class="line"><span>       │  │  │  │                     │</span></span>
<span class="line"><span>       ↓  ↓  ↓  ↓                     │</span></span>
<span class="line"><span>   ┌─────────┐ ┌─────────────┐        │</span></span>
<span class="line"><span>   │ Insert  │ │   Visual    │────────┘</span></span>
<span class="line"><span>   └─────────┘ └─────────────┘</span></span>
<span class="line"><span>                d/c/y 等动作 → 回到 Normal</span></span></code></pre></div><p><strong>modal editing 的&quot;心智负担&quot;主要在这个状态机</strong>——新人会忘记自己在哪个模式,按错键。<strong>老手不思考状态机,光看光标形状就知道</strong>:normal 是块状,insert 是竖线,visual 高亮选区。</p><hr><h2 id="五、为什么不是只学-hjkl" tabindex="-1">五、为什么不是只学 hjkl <a class="header-anchor" href="#五、为什么不是只学-hjkl" aria-label="Permalink to &quot;五、为什么不是只学 hjkl&quot;">​</a></h2><h3 id="_5-1-hjkl-是误导新人的-vim-入门陷阱" tabindex="-1">5.1 hjkl 是误导新人的&quot;vim 入门陷阱&quot; <a class="header-anchor" href="#_5-1-hjkl-是误导新人的-vim-入门陷阱" aria-label="Permalink to &quot;5.1 hjkl 是误导新人的&quot;vim 入门陷阱&quot;&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>误导:</span></span>
<span class="line"><span>   - 网上所有 &quot;vim 入门&quot; 都讲 hjkl</span></span>
<span class="line"><span>   - 新人记住 hjkl,以为学会了 vim 的精髓</span></span>
<span class="line"><span>   - 实际工作里 hjkl 用得很少,因为太慢</span></span>
<span class="line"><span></span></span>
<span class="line"><span>真相:</span></span>
<span class="line"><span>   - hjkl 是&quot;逐字符&quot;移动,粒度太细</span></span>
<span class="line"><span>   - 实际编辑大部分用 w / b(单词)、$ / 0(行首尾)、{ / }(段落)、/(搜索)、f / t(到字符)、gg / G(文件)</span></span>
<span class="line"><span>   - hjkl 主要在&quot;小范围微调光标&quot;时用</span></span></code></pre></div><h3 id="_5-2-真正的-motion-词汇" tabindex="-1">5.2 真正的 motion 词汇 <a class="header-anchor" href="#_5-2-真正的-motion-词汇" aria-label="Permalink to &quot;5.2 真正的 motion 词汇&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>日常 80% 用的 motion:</span></span>
<span class="line"><span>   w / b           移动单词(向后 / 向前)</span></span>
<span class="line"><span>   $ / ^           行尾 / 行首</span></span>
<span class="line"><span>   gg / G          文件首 / 末</span></span>
<span class="line"><span>   { / }           上一段 / 下一段</span></span>
<span class="line"><span>   /pattern        搜索向后</span></span>
<span class="line"><span>   n / N           搜索下一个 / 上一个</span></span>
<span class="line"><span>   f&lt;c&gt; / t&lt;c&gt;     到 / 到字符之前</span></span>
<span class="line"><span>   *               搜索当前 word</span></span>
<span class="line"><span>   %               跳到匹配的括号</span></span>
<span class="line"><span></span></span>
<span class="line"><span>偶尔 15% 用:</span></span>
<span class="line"><span>   hjkl            微调光标</span></span>
<span class="line"><span>   e / ge          单词末尾</span></span>
<span class="line"><span>   H / M / L       屏幕上 / 中 / 下</span></span>
<span class="line"><span>   Ctrl-d / Ctrl-u 半屏滚动</span></span>
<span class="line"><span></span></span>
<span class="line"><span>text object(组合用):</span></span>
<span class="line"><span>   iw / aw / i&quot; / a&quot; / i( / a( / ip / ap</span></span></code></pre></div><p><strong>真正掌握 vim = 掌握 motion 词汇 + operator 词汇 + text object 词汇</strong>。学 hjkl 半小时,<strong>vim 真功夫在 motion</strong>。</p><h3 id="_5-3-motion-的-速度上限" tabindex="-1">5.3 motion 的&quot;速度上限&quot; <a class="header-anchor" href="#_5-3-motion-的-速度上限" aria-label="Permalink to &quot;5.3 motion 的&quot;速度上限&quot;&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>要把光标从函数开头移到第 200 行的某个变量:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>传统(鼠标):</span></span>
<span class="line"><span>   - 找鼠标 → 滚动条 → 找到大概位置 → 点击</span></span>
<span class="line"><span>   - 5-10 秒</span></span>
<span class="line"><span></span></span>
<span class="line"><span>vim:</span></span>
<span class="line"><span>   - 200gg(直接跳第 200 行) → /var_name(搜索变量) → 0.5 秒</span></span></code></pre></div><p><strong>vim 的&quot;快&quot;主要快在 motion</strong>——快速跳到目标位置,<strong>比鼠标快 5-10 倍</strong>。</p><h3 id="_5-4-为什么是-hjkl" tabindex="-1">5.4 为什么是 hjkl <a class="header-anchor" href="#_5-4-为什么是-hjkl" aria-label="Permalink to &quot;5.4 为什么是 hjkl&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>hjkl 在键盘上的位置:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   q w e r t y u i o p</span></span>
<span class="line"><span>    a s d f g h j k l ;</span></span>
<span class="line"><span>     z x c v b n m</span></span>
<span class="line"><span>              ^ ^ ^ ^</span></span>
<span class="line"><span>              h j k l</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   h(食指,左): 左</span></span>
<span class="line"><span>   j(食指,下): 下</span></span>
<span class="line"><span>   k(中指,上): 上</span></span>
<span class="line"><span>   l(无名指,右): 右</span></span>
<span class="line"><span></span></span>
<span class="line"><span>为什么不是方向键:</span></span>
<span class="line"><span>   - 方向键在 home row 右下,要抬手</span></span>
<span class="line"><span>   - hjkl 全在 home row,不抬手</span></span>
<span class="line"><span>   - 1976 年 Bill Joy 写 vi 时键盘只有 ASCII 字符,</span></span>
<span class="line"><span>     甚至没有方向键</span></span></code></pre></div><p><strong>hjkl 的本质</strong>:<strong>让光标移动&quot;不抬手&quot;</strong>——这才是它的设计意图,而不是&quot;hjkl 比方向键好&quot;。<strong>老手手指基本不离 home row</strong>,这才是 vim 物理设计的核心。</p><hr><h2 id="六、helix-把-modal-范式翻过来" tabindex="-1">六、Helix:把 modal 范式翻过来 <a class="header-anchor" href="#六、helix-把-modal-范式翻过来" aria-label="Permalink to &quot;六、Helix:把 modal 范式翻过来&quot;">​</a></h2><h3 id="_6-1-vim-是-动词-→-范围-helix-是-范围-→-动词" tabindex="-1">6.1 vim 是 &quot;动词 → 范围&quot;,Helix 是 &quot;范围 → 动词&quot; <a class="header-anchor" href="#_6-1-vim-是-动词-→-范围-helix-是-范围-→-动词" aria-label="Permalink to &quot;6.1 vim 是 &quot;动词 → 范围&quot;,Helix 是 &quot;范围 → 动词&quot;&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>vim 的命令顺序:</span></span>
<span class="line"><span>   d w      先按 d(动词),然后 w(范围)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   问题:按 d 之后,你看不到 &quot;要删什么&quot;,</span></span>
<span class="line"><span>        直到按 w 才知道范围</span></span>
<span class="line"><span>        新手经常 d 完不知道接什么</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Helix 的命令顺序:</span></span>
<span class="line"><span>   w d      先按 w(选中下一个单词),然后 d(删除)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   优势:按 w 时,屏幕上&quot;高亮&quot;出当前选区</span></span>
<span class="line"><span>        视觉反馈即时</span></span>
<span class="line"><span>        更接近&quot;现代 IDE 的选择 → 操作&quot;心智</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Helix 的核心设计:selection-first</span></span></code></pre></div><h3 id="_6-2-helix-的-selection-first-心智" tabindex="-1">6.2 Helix 的&quot;selection-first&quot; 心智 <a class="header-anchor" href="#_6-2-helix-的-selection-first-心智" aria-label="Permalink to &quot;6.2 Helix 的&quot;selection-first&quot; 心智&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>vim:                                  Helix:</span></span>
<span class="line"><span>   光标(无选区)                       默认就有选区(光标 = 1 字符选区)</span></span>
<span class="line"><span>   动词作用于&quot;接下来的范围&quot;            动词作用于&quot;当前选区&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>&quot;删一个单词&quot;:                         &quot;删一个单词&quot;:</span></span>
<span class="line"><span>   dw                                  wd</span></span>
<span class="line"><span>   (按 d → 按 w → 删)                  (按 w 选中下个单词,屏幕高亮 → 按 d 删)</span></span></code></pre></div><p><strong>Helix 的设计哲学</strong>:<strong>所有动作都是&quot;在已有选区上执行&quot;</strong>。这跟 Kakoune(Helix 的祖师爷)和现代 IDE 的&quot;选择 → 操作&quot;心智一致。</p><h3 id="_6-3-为什么-helix-对新人更友好" tabindex="-1">6.3 为什么 Helix 对新人更友好 <a class="header-anchor" href="#_6-3-为什么-helix-对新人更友好" aria-label="Permalink to &quot;6.3 为什么 Helix 对新人更友好&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>vim 的学习障碍:</span></span>
<span class="line"><span>   - 你按 d,屏幕没反应,要继续按</span></span>
<span class="line"><span>   - 新人不知道按什么,卡住</span></span>
<span class="line"><span>   - 看着像&quot;无反馈&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Helix 的学习路径:</span></span>
<span class="line"><span>   - 你按 w,屏幕高亮单词,即时反馈</span></span>
<span class="line"><span>   - 看到高亮后才按 d</span></span>
<span class="line"><span>   - 类似&quot;select then delete&quot;的现代 IDE 心智</span></span></code></pre></div><p><strong>Helix 把 modal editing 的&quot;反馈&quot;做出来了</strong>——这是它对 vim 最大的改进。<strong>对从 VS Code 转过来的新人,Helix 学习曲线比 vim 缓 30%</strong>。</p><h3 id="_6-4-vim-vs-helix-谁更对" tabindex="-1">6.4 vim vs Helix:谁更对 <a class="header-anchor" href="#_6-4-vim-vs-helix-谁更对" aria-label="Permalink to &quot;6.4 vim vs Helix:谁更对&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>vim 的优势:</span></span>
<span class="line"><span>   - 50 年存量,IDE 全装 vim mode</span></span>
<span class="line"><span>   - 生态深(Neovim plugin &gt; 5000)</span></span>
<span class="line"><span>   - 远端机器默认装</span></span>
<span class="line"><span>   - 已有几千万用户的肌肉记忆</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Helix 的优势:</span></span>
<span class="line"><span>   - 学习曲线缓 30%(视觉反馈即时)</span></span>
<span class="line"><span>   - selection-first 更接近现代心智</span></span>
<span class="line"><span>   - 内置 LSP,不用配</span></span>
<span class="line"><span>   - 新人不需要 vimtutor</span></span></code></pre></div><p><strong>实际选择</strong>:</p><ul><li>你 0 基础新人 → <strong>学 Helix,上手快</strong></li><li>你已经会 vim → <strong>继续 vim,Helix 别扭</strong></li><li>你重度需要插件 / dotfiles 复杂 → <strong>Neovim</strong></li><li>你只想开箱即用 → <strong>Helix</strong></li></ul><h3 id="_6-5-别在-vim-和-helix-之间来回切" tabindex="-1">6.5 别在 vim 和 Helix 之间来回切 <a class="header-anchor" href="#_6-5-别在-vim-和-helix-之间来回切" aria-label="Permalink to &quot;6.5 别在 vim 和 Helix 之间来回切&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>学 vim 久了切 Helix 别扭(按 d 在 Helix 里没用,要先选)</span></span>
<span class="line"><span>学 Helix 久了切 vim 别扭(按 w 在 vim 里只是移动,不是选)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>两边都不要练熟 = 都不熟</span></span>
<span class="line"><span>练熟一个 = 另一个几天能上手</span></span></code></pre></div><p><strong>选一个,投入 3 个月,内化</strong>——这跟上一篇 tmux/Zellij 的结论一样:<strong>modal editing 的肌肉记忆不可两边练</strong>。</p><h3 id="_6-6-kakoune-helix-的祖师爷" tabindex="-1">6.6 Kakoune:Helix 的祖师爷 <a class="header-anchor" href="#_6-6-kakoune-helix-的祖师爷" aria-label="Permalink to &quot;6.6 Kakoune:Helix 的祖师爷&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Kakoune(2011)是 Helix(2021)的灵感来源</span></span>
<span class="line"><span>   - Kakoune 是第一个 &quot;selection-first&quot; modal editor</span></span>
<span class="line"><span>   - Helix 借鉴 Kakoune 的范式,但重写得更现代</span></span>
<span class="line"><span>   - Kakoune 用户极少,Helix 用户在涨</span></span>
<span class="line"><span></span></span>
<span class="line"><span>提一句是因为有时候你看到&quot;Kakoune-like editor&quot;</span></span>
<span class="line"><span>其实就是 selection-first modal</span></span></code></pre></div><hr><h2 id="七、modal-editing-的认知收益" tabindex="-1">七、modal editing 的认知收益 <a class="header-anchor" href="#七、modal-editing-的认知收益" aria-label="Permalink to &quot;七、modal editing 的认知收益&quot;">​</a></h2><h3 id="_7-1-想什么-打什么" tabindex="-1">7.1 &quot;想什么 = 打什么&quot; <a class="header-anchor" href="#_7-1-想什么-打什么" aria-label="Permalink to &quot;7.1 &quot;想什么 = 打什么&quot;&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>思维过程             vim 操作            鼠标操作</span></span>
<span class="line"><span>─────────────────────────────────────────────────</span></span>
<span class="line"><span>&quot;删这个单词&quot;         ciw                双击单词 → delete</span></span>
<span class="line"><span>&quot;删这个函数&quot;         daf                选中函数 → delete(滚动到函数头尾)</span></span>
<span class="line"><span>&quot;复制引号内&quot;         yi&quot;                精确拖选(避开引号)→ Ctrl-C</span></span>
<span class="line"><span>&quot;缩进这段&quot;           &gt;ip                选中段落 → 缩进按钮</span></span>
<span class="line"><span>&quot;改括号内&quot;           ci(                精确拖选(括号内,不含括号)→ delete</span></span>
<span class="line"><span></span></span>
<span class="line"><span>modal 的&quot;快&quot;不是按键少,是&quot;思维到动作的距离短&quot;</span></span>
<span class="line"><span>鼠标的&quot;慢&quot;不是按键多,是要&quot;精确瞄准&quot;</span></span></code></pre></div><p><strong>这就是 modal editing 的真正收益</strong>:<strong>思维到动作的距离最短</strong>。你不用花时间&quot;瞄准&quot;,vim 自己知道边界(text object 是怎么定义的)。</p><h3 id="_7-2-不抬手" tabindex="-1">7.2 不抬手 <a class="header-anchor" href="#_7-2-不抬手" aria-label="Permalink to &quot;7.2 不抬手&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>鼠标用户的真实操作流:</span></span>
<span class="line"><span>   1. 手在键盘上打字</span></span>
<span class="line"><span>   2. 想选中某段 → 抬手 → 找鼠标 → 移到目标 → 拖选 → 操作</span></span>
<span class="line"><span>   3. 手回键盘 → 继续打字</span></span>
<span class="line"><span>   4. 一天上百次,手腕和注意力都被磨损</span></span>
<span class="line"><span></span></span>
<span class="line"><span>vim 用户:</span></span>
<span class="line"><span>   1. 手永远在键盘 home row</span></span>
<span class="line"><span>   2. 想选中 → 几个键</span></span>
<span class="line"><span>   3. 想移动 → 几个键</span></span>
<span class="line"><span>   4. 一天上百次都在键盘上,手腕轻松,注意力不切走</span></span></code></pre></div><p><strong>长期收益</strong>:<strong>手腕健康 + 注意力连续</strong>。我见过 30 年 vim 用户,60 岁没腱鞘炎;我见过 5 年纯鼠标用户,35 岁手腕开始酸。<strong>这不是玄学,是物理</strong>。</p><h3 id="_7-3-速度上限远超鼠标" tabindex="-1">7.3 速度上限远超鼠标 <a class="header-anchor" href="#_7-3-速度上限远超鼠标" aria-label="Permalink to &quot;7.3 速度上限远超鼠标&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>3 秒能做多少事:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>鼠标:选中一段,删掉,可能再点一下 paste 按钮 → 3 个操作</span></span>
<span class="line"><span></span></span>
<span class="line"><span>vim:</span></span>
<span class="line"><span>   ya{ → 复制整个大括号块</span></span>
<span class="line"><span>   gg → 跳文件首</span></span>
<span class="line"><span>   p → 粘贴</span></span>
<span class="line"><span>   /pattern&lt;CR&gt; → 搜索 + 跳</span></span>
<span class="line"><span>   ciw → 改单词</span></span>
<span class="line"><span>   ESC → 回 normal</span></span>
<span class="line"><span>   :w → 保存</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   一个熟练 vim 用户 3 秒能做 7-10 个操作</span></span></code></pre></div><p><strong>这就是 vim &quot;快&quot;的实质</strong>——<strong>单位时间能完成的操作数 5-10 倍</strong>。</p><h3 id="_7-4-命令是可组合的" tabindex="-1">7.4 命令是可组合的 <a class="header-anchor" href="#_7-4-命令是可组合的" aria-label="Permalink to &quot;7.4 命令是可组合的&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>你学了 d(删) + w(单词)</span></span>
<span class="line"><span>   → 自动学会 d3w(删 3 个单词)</span></span>
<span class="line"><span>   → 自动学会 d10w(删 10 个单词)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>你学了 y(复制) + iw(inside word)</span></span>
<span class="line"><span>   → 自动学会 y3w(复制 3 个单词)</span></span>
<span class="line"><span>   → 自动学会 yt;(复制到下一个分号前)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>你学了 &gt; (缩进) + ip(段落)</span></span>
<span class="line"><span>   → 自动学会 &gt;5j(缩进当前到下面 5 行)</span></span>
<span class="line"><span>   → 自动学会 &gt;}(缩进到下一段)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>学 10 个动词 + 20 个范围 = 200 个组合</span></span>
<span class="line"><span>不需要记 200 个快捷键</span></span></code></pre></div><p><strong>这是 modal editing 的&quot;语言性&quot;</strong>——<strong>词汇量小,但组合无限</strong>。<strong>鼠标 + 菜单做不到这点</strong>——它没有&quot;组合性&quot;,每条命令是独立的菜单项。</p><hr><h2 id="八、modal-editing-的认知代价" tabindex="-1">八、modal editing 的认知代价 <a class="header-anchor" href="#八、modal-editing-的认知代价" aria-label="Permalink to &quot;八、modal editing 的认知代价&quot;">​</a></h2><h3 id="_8-1-学习曲线陡-1-3-个月" tabindex="-1">8.1 学习曲线陡(1-3 个月) <a class="header-anchor" href="#_8-1-学习曲线陡-1-3-个月" aria-label="Permalink to &quot;8.1 学习曲线陡(1-3 个月)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>第 1 天:vimtutor 学完,知道 hjkl / iAo / dw / :wq</span></span>
<span class="line"><span>第 1 周:能用 vim 写代码,但比 VS Code 慢 50%</span></span>
<span class="line"><span>第 1 个月:开始用 motion(w / $ / /),速度追平 VS Code</span></span>
<span class="line"><span>第 3 个月:开始用 text object(ciw / dap),开始超过 VS Code</span></span>
<span class="line"><span>第 6 个月:内化,速度是 VS Code 的 2-3 倍</span></span>
<span class="line"><span>第 1 年:已经回不去 VS Code 了</span></span></code></pre></div><p><strong>前 3 个月你会觉得&quot;我是不是装逼,这玩意儿明明慢&quot;</strong>——<strong>这是过渡期,绝大多数人在这里放弃</strong>。挺过 3 个月,你才会看到 modal 的真正回报。</p><h3 id="_8-2-中途比-ide-慢" tabindex="-1">8.2 中途比 IDE 慢 <a class="header-anchor" href="#_8-2-中途比-ide-慢" aria-label="Permalink to &quot;8.2 中途比 IDE 慢&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>新手 vim 的真实体验:</span></span>
<span class="line"><span>   想删一段代码 → 不会 dap → 用 dd 一行一行删</span></span>
<span class="line"><span>   想复制 → 不会 yi&quot; → 用 V 选完再 y</span></span>
<span class="line"><span>   想搜索 → 不会 / → 滚动条找</span></span>
<span class="line"><span>   想跳到行末 → 不会 $ → 按 l l l l l...</span></span>
<span class="line"><span></span></span>
<span class="line"><span>结果:vim 比 VS Code 慢 50%,新手怀疑人生</span></span></code></pre></div><p><strong>这是必然的过渡</strong>——你不可能第一周就快过 5 年 VS Code 经验。<strong>关键是不放弃</strong>。</p><h3 id="_8-3-离开-vim-后手会乱按" tabindex="-1">8.3 离开 vim 后手会乱按 <a class="header-anchor" href="#_8-3-离开-vim-后手会乱按" aria-label="Permalink to &quot;8.3 离开 vim 后手会乱按&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>你用 vim 久了:</span></span>
<span class="line"><span>   - 在浏览器里打字,想删一行,按 dd → 出 &quot;dd&quot; 两个字符</span></span>
<span class="line"><span>   - 在 Slack 里聊天,想保存,按 :w → 屏幕出 &quot;:w&quot;</span></span>
<span class="line"><span>   - 在 Word 里编辑,按 ESC → Word 不会动</span></span>
<span class="line"><span>   - 在 Email 里写,按 ciw → 出 &quot;ciw&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>解决:</span></span>
<span class="line"><span>   - VS Code 装 Vim 扩展</span></span>
<span class="line"><span>   - JetBrains 装 IdeaVim</span></span>
<span class="line"><span>   - Obsidian / Logseq 都有 vim mode</span></span>
<span class="line"><span>   - 浏览器装 Vimium / Tridactyl(浏览器里也用 vim 键位)</span></span></code></pre></div><p><strong>这不是 vim 的&quot;缺陷&quot;,是 vim 内化太深的&quot;副作用&quot;</strong>——你的肌肉记忆变了。<strong>解决方法是&quot;哪里能装 vim mode 就装&quot;</strong>——让所有工具都接受 vim 键位,减少切换成本。</p><h3 id="_8-4-配置陷阱" tabindex="-1">8.4 配置陷阱 <a class="header-anchor" href="#_8-4-配置陷阱" aria-label="Permalink to &quot;8.4 配置陷阱&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>vim / Neovim 的另一个代价是配置</span></span>
<span class="line"><span>   - 老 vim 用 .vimrc(VimScript)</span></span>
<span class="line"><span>   - Neovim 用 init.lua(Lua)</span></span>
<span class="line"><span>   - 配置不当 → 慢、bug、不可移植</span></span>
<span class="line"><span>   - 抄网上 dotfiles → 不懂自己装了什么</span></span>
<span class="line"><span></span></span>
<span class="line"><span>解决:</span></span>
<span class="line"><span>   - 用现成的 distribution(LazyVim / AstroNvim)</span></span>
<span class="line"><span>   - 极简起步,慢慢加</span></span>
<span class="line"><span>   - 不要 day 1 就写 1000 行 init.lua</span></span>
<span class="line"><span></span></span>
<span class="line"><span>(详见 20 篇)</span></span></code></pre></div><hr><h2 id="九、怎么入门" tabindex="-1">九、怎么入门 <a class="header-anchor" href="#九、怎么入门" aria-label="Permalink to &quot;九、怎么入门&quot;">​</a></h2><h3 id="_9-1-路径-按时间" tabindex="-1">9.1 路径(按时间) <a class="header-anchor" href="#_9-1-路径-按时间" aria-label="Permalink to &quot;9.1 路径(按时间)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>第 1 天(30 分钟):</span></span>
<span class="line"><span>   - 在终端跑 vimtutor</span></span>
<span class="line"><span>   - 跟着练 7 个 lesson,大致知道 modal 是什么</span></span>
<span class="line"><span>   - 不要装任何 plugin,不要改任何 config</span></span>
<span class="line"><span></span></span>
<span class="line"><span>第 1-2 周:</span></span>
<span class="line"><span>   - 在 VS Code 装 Vim 扩展(VsCodeVim)</span></span>
<span class="line"><span>   - 继续用 VS Code 的 90% 功能,但模式切到 vim</span></span>
<span class="line"><span>   - 每天用 vim 命令做 10-20 次小编辑</span></span>
<span class="line"><span>   - 不熟悉时按 ESC + 鼠标补救,不丢工作</span></span>
<span class="line"><span></span></span>
<span class="line"><span>第 3-4 周:</span></span>
<span class="line"><span>   - 强迫自己不用方向键,用 hjkl + w/b/$/^/G/gg</span></span>
<span class="line"><span>   - 强迫自己不用鼠标,用 / 搜索 / f / t 跳字符</span></span>
<span class="line"><span>   - 这一周很难受,但是关键</span></span>
<span class="line"><span></span></span>
<span class="line"><span>第 2 个月:</span></span>
<span class="line"><span>   - 开始用 text object(ciw / dap / yi&quot;)</span></span>
<span class="line"><span>   - 速度开始接近 VS Code</span></span>
<span class="line"><span>   - 尝试独立 Neovim(在终端,不在 VS Code)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>第 3 个月:</span></span>
<span class="line"><span>   - Neovim + 极简 init.lua(50-100 行)</span></span>
<span class="line"><span>   - 装 lazy.nvim + LSP + telescope + treesitter</span></span>
<span class="line"><span>   - 速度超过 VS Code 时期</span></span></code></pre></div><h3 id="_9-2-vimtutor-30-分钟的精华" tabindex="-1">9.2 vimtutor:30 分钟的精华 <a class="header-anchor" href="#_9-2-vimtutor-30-分钟的精华" aria-label="Permalink to &quot;9.2 vimtutor:30 分钟的精华&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> vimtutor</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 是 Vim 自带的交互式教程</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 7 个 lesson,每个 5-10 分钟</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 教完你能用 vim 做基本编辑</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 这是 modal editing 入门最权威的资料</span></span></code></pre></div><p><strong>所有 vim 学习路径的起点都应该是 vimtutor</strong>——比任何网上的 cheatsheet / 视频教程都靠谱。</p><h3 id="_9-3-vs-code-vim-过渡期的最佳选择" tabindex="-1">9.3 VS Code Vim:过渡期的最佳选择 <a class="header-anchor" href="#_9-3-vs-code-vim-过渡期的最佳选择" aria-label="Permalink to &quot;9.3 VS Code Vim:过渡期的最佳选择&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>为什么过渡期不要直接上 Neovim:</span></span>
<span class="line"><span>   - Neovim 配置复杂(LSP / Plugin / Theme)</span></span>
<span class="line"><span>   - 你的项目要 IDE 的功能(debug / refactor / test runner)</span></span>
<span class="line"><span>   - 一开始就上 Neovim,你会因为&quot;配置不完整&quot;放弃</span></span>
<span class="line"><span></span></span>
<span class="line"><span>VS Code 装 Vim 扩展的好处:</span></span>
<span class="line"><span>   - 保留 VS Code 所有功能(debug / Git / Extension)</span></span>
<span class="line"><span>   - 只是把&quot;编辑&quot;模式切到 vim</span></span>
<span class="line"><span>   - 不熟悉时 ESC + 鼠标可以兜底</span></span>
<span class="line"><span>   - 一周后 vim 命令熟练了再考虑 Neovim</span></span></code></pre></div><p><strong>这是 90% vim 学习者的最优路径</strong>——<strong>先在 VS Code 里学 vim,再考虑 Neovim</strong>。</p><h3 id="_9-4-不要一上来就配-1000-行-init-lua" tabindex="-1">9.4 不要一上来就配 1000 行 init.lua <a class="header-anchor" href="#_9-4-不要一上来就配-1000-行-init-lua" aria-label="Permalink to &quot;9.4 不要一上来就配 1000 行 init.lua&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>反面教材:</span></span>
<span class="line"><span>   工程师 A 看到网上某大佬的 init.lua(1500 行)</span></span>
<span class="line"><span>   抄下来,装了 30 个 plugin</span></span>
<span class="line"><span>   - 启动 3 秒</span></span>
<span class="line"><span>   - 一半 plugin 不会用</span></span>
<span class="line"><span>   - 配置出 bug 找不到原因</span></span>
<span class="line"><span>   - 学的不是 vim,是别人的 dotfiles</span></span>
<span class="line"><span>   - 2 周后 A 放弃,回到 VS Code</span></span>
<span class="line"><span></span></span>
<span class="line"><span>正确路径:</span></span>
<span class="line"><span>   - 第 1 个月:不配 init.lua,用 vim / VS Code Vim 扩展</span></span>
<span class="line"><span>   - 第 2 个月:50 行 init.lua,装 LSP / treesitter</span></span>
<span class="line"><span>   - 第 3 个月:加 telescope / fugitive / nvim-cmp</span></span>
<span class="line"><span>   - 半年:100-200 行,自己写,知道每行干啥</span></span></code></pre></div><p><strong>&quot;我的 init.lua 比你长&quot;是装逼,不是水平</strong>——<strong>最好的 init.lua 是你写的、你看得懂的、能解释每一行的</strong>。</p><h3 id="_9-5-不要在过渡期-disable-鼠标" tabindex="-1">9.5 不要在过渡期 disable 鼠标 <a class="header-anchor" href="#_9-5-不要在过渡期-disable-鼠标" aria-label="Permalink to &quot;9.5 不要在过渡期 disable 鼠标&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>有些 vim 教程会说&quot;完全 disable 鼠标 / 方向键,逼自己学 vim&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>这是对的方向,但不是新手的姿势:</span></span>
<span class="line"><span>   - 新手 disable 鼠标 → 一上午做不完一个简单编辑 → 放弃</span></span>
<span class="line"><span>   - 应该的姿势:鼠标可用作 fallback,但优先用 vim 命令</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3 个月后再 disable 鼠标 / 方向键,那时你已经会了</span></span></code></pre></div><hr><h2 id="十、反对的写法" tabindex="-1">十、反对的写法 <a class="header-anchor" href="#十、反对的写法" aria-label="Permalink to &quot;十、反对的写法&quot;">​</a></h2><h3 id="_10-1-学-vim-又装-图形化-keymap-覆盖原-vim-键位" tabindex="-1">10.1 学 vim 又装&quot;图形化 keymap&quot;覆盖原 vim 键位 <a class="header-anchor" href="#_10-1-学-vim-又装-图形化-keymap-覆盖原-vim-键位" aria-label="Permalink to &quot;10.1 学 vim 又装&quot;图形化 keymap&quot;覆盖原 vim 键位&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>反面教材:</span></span>
<span class="line"><span>   工程师 B 装了 vim,觉得 hjkl 不直觉</span></span>
<span class="line"><span>   找 plugin 重定义:i = up, k = down, j = left, l = right</span></span>
<span class="line"><span>   或者强制 normal 模式可以用方向键</span></span>
<span class="line"><span></span></span>
<span class="line"><span>为什么错:</span></span>
<span class="line"><span>   - vim 的 hjkl 是 motion 词汇的基础</span></span>
<span class="line"><span>   - 改了之后,所有教程 / cheatsheet / 文档都对不上</span></span>
<span class="line"><span>   - 你团队的人 vim 不一样,co-pilot 时崩溃</span></span>
<span class="line"><span>   - 失去了 modal 的&quot;标准化优势&quot;</span></span></code></pre></div><p><strong>vim 的键位是 50 年沉淀下来的&quot;事实标准&quot;</strong>——改默认键位等于放弃 vim 生态。<strong>真要改,只改极少数个人偏好(比如 leader key,或 ; 和 : 互换)</strong>,不要动 motion 和 operator。</p><h3 id="_10-2-一上来就抄网上-init-lua-千行-已在第-9-4-节展开" tabindex="-1">10.2 一上来就抄网上 init.lua 千行(已在第 9.4 节展开) <a class="header-anchor" href="#_10-2-一上来就抄网上-init-lua-千行-已在第-9-4-节展开" aria-label="Permalink to &quot;10.2 一上来就抄网上 init.lua 千行(已在第 9.4 节展开)&quot;">​</a></h3><h3 id="_10-3-vim-better-than-emacs-玄学" tabindex="-1">10.3 &quot;vim better than emacs&quot; 玄学 <a class="header-anchor" href="#_10-3-vim-better-than-emacs-玄学" aria-label="Permalink to &quot;10.3 &quot;vim better than emacs&quot; 玄学&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>反面教材:</span></span>
<span class="line"><span>   工程师 C 听了&quot;vim 党&quot;和&quot;emacs 党&quot;的口水战</span></span>
<span class="line"><span>   觉得 vim 是&quot;真男人编辑器&quot;,emacs 是&quot;操作系统&quot;</span></span>
<span class="line"><span>   然后试图说服所有人用 vim</span></span>
<span class="line"><span></span></span>
<span class="line"><span>真相:</span></span>
<span class="line"><span>   - vim / emacs / Helix / Kakoune 都是 modal(或部分 modal)</span></span>
<span class="line"><span>   - 真正赢的是 modal 范式,不是某个工具</span></span>
<span class="line"><span>   - emacs 有 evil-mode(模仿 vim 键位),用 emacs 写代码 + vim 键位是合法选择</span></span>
<span class="line"><span>   - 选哪个是个人偏好,不是工程优劣</span></span></code></pre></div><p><strong>modal editing 是哲学,vim / Helix / Emacs evil 是实现</strong>——<strong>别为某个具体工具上头</strong>。</p><h3 id="_10-4-拒绝学-modal-继续鼠标-方向键" tabindex="-1">10.4 拒绝学 modal,继续鼠标 + 方向键 <a class="header-anchor" href="#_10-4-拒绝学-modal-继续鼠标-方向键" aria-label="Permalink to &quot;10.4 拒绝学 modal,继续鼠标 + 方向键&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>反面教材:</span></span>
<span class="line"><span>   工程师 D 听说 vim 难学,觉得&quot;我用 VS Code 也能完成工作&quot;</span></span>
<span class="line"><span>   坚持鼠标 + 方向键 5 年</span></span>
<span class="line"><span></span></span>
<span class="line"><span>真相:</span></span>
<span class="line"><span>   - 他能完成工作,确实</span></span>
<span class="line"><span>   - 但他的速度上限被工具压低 3-5 倍</span></span>
<span class="line"><span>   - 他的手腕磨损是其他人的 5 倍</span></span>
<span class="line"><span>   - 他离开 VS Code 就死(SSH 进服务器一脸懵)</span></span>
<span class="line"><span>   - 他用 Claude Code / AI 工具时也吃亏(AI 给的建议是 vim 键位的:&quot;按 ciw 改单词&quot;)</span></span></code></pre></div><p><strong>这是 2026 年最大的认知误区</strong>——<strong>&quot;我用工具完成工作&quot;和&quot;我用工具完成得快/稳/可迁移&quot;是两回事</strong>。前者 50 万工程师都能做到,后者只有少数。<strong>modal editing 是后者的入门票</strong>。</p><h3 id="_10-5-装-vim-但还是用鼠标" tabindex="-1">10.5 装 vim 但还是用鼠标 <a class="header-anchor" href="#_10-5-装-vim-但还是用鼠标" aria-label="Permalink to &quot;10.5 装 vim 但还是用鼠标&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>反面教材:</span></span>
<span class="line"><span>   工程师 E 装了 vim,但还是:</span></span>
<span class="line"><span>   - 用鼠标点击移动光标</span></span>
<span class="line"><span>   - 用鼠标拖选</span></span>
<span class="line"><span>   - 用菜单复制粘贴</span></span>
<span class="line"><span></span></span>
<span class="line"><span>为什么错:</span></span>
<span class="line"><span>   - 装了 vim ≠ 用了 vim</span></span>
<span class="line"><span>   - 用 vim 的核心是用 keyboard-only 完成所有操作</span></span>
<span class="line"><span>   - 用鼠标的 vim = &quot;丑陋的 Notepad&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>解决:</span></span>
<span class="line"><span>   - 强迫自己 disable 鼠标(set mouse=)</span></span>
<span class="line"><span>   - 学 motion(w / b / $ / 0 / / / f)</span></span>
<span class="line"><span>   - 这一周很难受,但是过渡期</span></span></code></pre></div><p><strong>装 vim 是 5 分钟,用 vim 是 3 个月</strong>——前者是 brew install,后者是肌肉重塑。</p><h3 id="_10-6-不学就否定" tabindex="-1">10.6 不学就否定 <a class="header-anchor" href="#_10-6-不学就否定" aria-label="Permalink to &quot;10.6 不学就否定&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>反面教材:</span></span>
<span class="line"><span>   工程师 F 试了 vim 一天,觉得难用,从此到处说 &quot;vim 是玄学&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>真相:</span></span>
<span class="line"><span>   - 一天的体验不足以评估 modal editing</span></span>
<span class="line"><span>   - 任何技能 1 天都难用,但 modal 的&quot;难&quot;集中在前 3 个月</span></span>
<span class="line"><span>   - 你试了 3 个月还觉得难,可以否定;1 天否定不算数</span></span></code></pre></div><p><strong>评估学习曲线陡的工具,至少要 3 个月</strong>——这是公平的&quot;试用期&quot;。</p><hr><h2 id="十一、modal-editing-在哪些地方-渗透-了" tabindex="-1">十一、modal editing 在哪些地方&quot;渗透&quot;了 <a class="header-anchor" href="#十一、modal-editing-在哪些地方-渗透-了" aria-label="Permalink to &quot;十一、modal editing 在哪些地方&quot;渗透&quot;了&quot;">​</a></h2><p>modal editing 已经不是 vim 一家的事了——<strong>它渗透进 2026 年几乎所有主流编辑/笔记/浏览工具</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>原生 modal 编辑器:</span></span>
<span class="line"><span>   ✓ Vim                  事实标准,2026 仍是最大的 modal 生态</span></span>
<span class="line"><span>   ✓ Neovim               vim 现代分叉,LSP / Lua / plugin 革命</span></span>
<span class="line"><span>   ✓ Helix                selection-first,2024+ 崛起</span></span>
<span class="line"><span>   ✓ Kakoune              Helix 的祖师爷,极小众但概念纯粹</span></span>
<span class="line"><span></span></span>
<span class="line"><span>主流 IDE 的 vim mode:</span></span>
<span class="line"><span>   ✓ VS Code              VsCodeVim(2 万 star,几乎完美)</span></span>
<span class="line"><span>   ✓ JetBrains 全家桶     IdeaVim(官方支持,IDE 内集成)</span></span>
<span class="line"><span>   ✓ Sublime Text         Vintage(内置)</span></span>
<span class="line"><span>   ✓ Cursor               基于 VS Code,VsCodeVim 直接能用</span></span>
<span class="line"><span>   ✓ Windsurf             同上</span></span>
<span class="line"><span>   ✓ Zed                  内置 Vim mode</span></span>
<span class="line"><span></span></span>
<span class="line"><span>笔记 / 知识管理:</span></span>
<span class="line"><span>   ✓ Obsidian             Vim Editor Commands(内置 + plugin)</span></span>
<span class="line"><span>   ✓ Logseq               vim 键位支持</span></span>
<span class="line"><span>   ✗ Notion               (不支持,这是个缺陷)</span></span>
<span class="line"><span>   ✗ Roam Research        (不支持)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>浏览器 vim 键位:</span></span>
<span class="line"><span>   ✓ Vimium               Chrome / Edge,千万级用户</span></span>
<span class="line"><span>   ✓ Vimari               Safari</span></span>
<span class="line"><span>   ✓ Tridactyl            Firefox(深度集成)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>shell / 终端:</span></span>
<span class="line"><span>   ✓ bash / zsh           set -o vi(vi 编辑模式)</span></span>
<span class="line"><span>   ✓ fish                 fish_vi_key_bindings</span></span>
<span class="line"><span>   ✓ readline             ~/.inputrc 设 set editing-mode vi</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Claude Code:</span></span>
<span class="line"><span>   ✓ 2025+ 支持 vim mode  在 Claude Code 的 prompt 编辑区按 vim 键位</span></span>
<span class="line"><span></span></span>
<span class="line"><span>OS 级:</span></span>
<span class="line"><span>   ✓ macOS                Karabiner 配 system-wide vim 键位</span></span>
<span class="line"><span>   ✓ Linux                xremap 实现 OS 级 vim</span></span></code></pre></div><p><strong>模态编辑已经从 vim 独家发明,变成了 2026 年&quot;高生产力工具&quot;的事实标配</strong>。</p><h3 id="_11-1-浏览器里用-vim-键位-vimium" tabindex="-1">11.1 浏览器里用 vim 键位:Vimium <a class="header-anchor" href="#_11-1-浏览器里用-vim-键位-vimium" aria-label="Permalink to &quot;11.1 浏览器里用 vim 键位:Vimium&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Vimium / Tridactyl 让你在浏览器里:</span></span>
<span class="line"><span>   - h/j/k/l 滚动</span></span>
<span class="line"><span>   - / 搜索页面</span></span>
<span class="line"><span>   - f 显示所有链接的字母提示,按字母直接跳</span></span>
<span class="line"><span>   - gg / G 跳页面首尾</span></span>
<span class="line"><span>   - d / u 半屏滚动</span></span>
<span class="line"><span>   - t 新 tab(类似 :tabnew)</span></span>
<span class="line"><span>   - x 关闭 tab</span></span>
<span class="line"><span></span></span>
<span class="line"><span>习惯了 vim 之后,所有键盘上的操作都用 vim 键位</span></span>
<span class="line"><span>鼠标使用频率降到原来的 10%</span></span></code></pre></div><h3 id="_11-2-shell-的-vi-mode" tabindex="-1">11.2 shell 的 vi mode <a class="header-anchor" href="#_11-2-shell-的-vi-mode" aria-label="Permalink to &quot;11.2 shell 的 vi mode&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># bash / zsh 用 vi 编辑模式</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">echo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;set -o vi&#39;</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> &gt;&gt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ~/.zshrc</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 然后在命令行:</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># ESC 进入 normal 模式</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># h / j / k / l 移动光标</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># w / b 跳单词</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># dd 删整行</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 0 / $ 行首尾</span></span></code></pre></div><p><strong>shell 里也能用 vim 键位</strong>——你写命令行参数时,<strong>可以用 vim 命令编辑</strong>。这对工程师太友好了——一致性。</p><h3 id="_11-3-claude-code-的-vim-mode" tabindex="-1">11.3 Claude Code 的 vim mode <a class="header-anchor" href="#_11-3-claude-code-的-vim-mode" aria-label="Permalink to &quot;11.3 Claude Code 的 vim mode&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Claude Code 2025+ 在 prompt 编辑区支持 vim mode</span></span>
<span class="line"><span></span></span>
<span class="line"><span>启用:</span></span>
<span class="line"><span>   设置 → editor mode → vim</span></span>
<span class="line"><span></span></span>
<span class="line"><span>启用后,你在 Claude 输入 prompt 时:</span></span>
<span class="line"><span>   - ESC 进 normal 模式</span></span>
<span class="line"><span>   - 用 ciw 改单词</span></span>
<span class="line"><span>   - 用 dap 删段落</span></span>
<span class="line"><span>   - 用 :w 提交 prompt</span></span></code></pre></div><p><strong>这就是 vim 学不会的人放不下的原因</strong>——一旦你学会 modal editing,<strong>你能在任何地方启用 vim mode,你的肌肉记忆跨越所有工具</strong>。这是&quot;vim 学一次,用一辈子&quot;的实质。</p><hr><h2 id="十二、看完这一篇你应该能" tabindex="-1">十二、看完这一篇你应该能 <a class="header-anchor" href="#十二、看完这一篇你应该能" aria-label="Permalink to &quot;十二、看完这一篇你应该能&quot;">​</a></h2><ul><li><strong>解释 modal editing 的核心</strong>——不是 hjkl,是&quot;动词 + 范围&quot;的可组合语法</li><li><strong>画出 vim 命令的语法表</strong>——动词(d/c/y/&gt;) × 范围(w/$/iw/ip)的笛卡尔积</li><li><strong>列出 5 个常用 text object</strong>——ciw / dap / yi&quot; / ci( / cat</li><li><strong>解释 vim 三个核心模式</strong>——Normal(默认)/ Insert(短暂)/ Visual(选区辅助)</li><li><strong>对比 vim 和 Helix 的范式差异</strong>——动词在前 vs 范围在前</li><li><strong>说出 modal editing 的 3 个认知收益</strong>——思维到动作距离短 / 不抬手 / 速度上限高</li><li><strong>说出 3 个认知代价</strong>——学习曲线陡 / 中途比 IDE 慢 / 离开 vim 手乱按</li><li><strong>判断该不该学 vim</strong>——大多数工程师该学,因为 IDE / 浏览器 / Obsidian / Claude Code 都有 vim mode</li><li><strong>设计一份合理的学习路径</strong>——vimtutor → VS Code Vim 1-2 个月 → Neovim 3 个月内化</li><li><strong>避开&quot;装了 vim 还用鼠标&quot;的最大陷阱</strong>——装 vim 是 5 分钟,用 vim 是 3 个月</li></ul><hr><h2 id="十三、下一篇预告" tabindex="-1">十三、下一篇预告 <a class="header-anchor" href="#十三、下一篇预告" aria-label="Permalink to &quot;十三、下一篇预告&quot;">​</a></h2><p>这一篇讲 modal editing 的&quot;哲学&quot;,<strong>下一篇 <code>20-Neovim 现代配置.md</code> 进入工程层</strong>——</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>modal editing 的&quot;哲学&quot;懂了,具体怎么&quot;用 Neovim 写代码&quot;?</span></span>
<span class="line"><span></span></span>
<span class="line"><span>下一篇你会学到:</span></span>
<span class="line"><span>   - LazyVim:最快的 Neovim distribution(2024+ 的事实选择)</span></span>
<span class="line"><span>   - 不抄 init.lua 千行,从 50 行起步,知道每行干啥</span></span>
<span class="line"><span>   - LSP / treesitter / DAP / which-key 各自解决什么</span></span>
<span class="line"><span>   - 字体 / 主题 / 性能调优(启动 &lt; 100ms)</span></span>
<span class="line"><span>   - Neovim vs VS Code 的真实速度对比(哪些场景 Neovim 真快)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>21 篇会讲 Helix,作为 Neovim 的&quot;竞争者&quot;</span></span>
<span class="line"><span>   - 默认带 LSP / 不需要配</span></span>
<span class="line"><span>   - 谁该上 Neovim,谁该上 Helix</span></span></code></pre></div><p><strong>这一篇 + 20 + 21 = modal editing 完整路径</strong>:<strong>哲学(本篇)→ Neovim 工程(20)→ Helix 选型(21)</strong>。看完三篇,你应该能在自己机器上 1 小时内搭出&quot;能写代码的 modal 编辑器&quot;。</p>`,192)])])}const g=a(e,[["render",i]]);export{h as __pageData,g as default};
