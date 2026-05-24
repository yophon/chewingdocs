import{_ as a,H as n,f as p,i}from"./chunks/framework.BHvCMIhP.js";const g=JSON.parse('{"title":"ssh 深用:config / ProxyJump / 端口转发 / 密钥管理 / mosh","description":"","frontmatter":{},"headers":[],"relativePath":"terminalLearning/15-ssh深用.md","filePath":"terminalLearning/15-ssh深用.md","lastUpdated":1778574438000}'),e={name:"terminalLearning/15-ssh深用.md"};function l(t,s,o,h,c,r){return n(),p("div",null,[...s[0]||(s[0]=[i(`<h1 id="ssh-深用-config-proxyjump-端口转发-密钥管理-mosh" tabindex="-1">ssh 深用:config / ProxyJump / 端口转发 / 密钥管理 / mosh <a class="header-anchor" href="#ssh-深用-config-proxyjump-端口转发-密钥管理-mosh" aria-label="Permalink to &quot;ssh 深用:config / ProxyJump / 端口转发 / 密钥管理 / mosh&quot;">​</a></h1><p>90% 的工程师每天都在用 <code>ssh</code>,但<strong>这 90% 的人对 ssh 的全部认知就一句</strong>:<code>ssh user@host</code>。<strong>这是行业里最普遍、也最容易被忽视的「技能债」</strong>——你每天敲 50 次 ssh,但你从来没读过自己的 <code>~/.ssh/config</code>,你的 key 散在 <code>~/.ssh/</code> 下叫 <code>id_rsa</code> / <code>id_rsa_old</code> / <code>prod.pem</code> / <code>aws.pem</code>,你连 prod 要先 <code>ssh bastion</code>、再 <code>ssh -i ~/.ssh/prod.pem ubuntu@10.0.x.x</code>,本地连云上 RDS 要打开 4 个终端跳着开,key 文件直接放在硬盘上(没 passphrase、没 agent、没 Keychain),网络一断 vim 半天的工作就丢。<strong>这套日常你已经习惯了</strong>,但稍微深一点的工程师看你这么用 ssh,<strong>就像看一个写代码不用 IDE 跳转、全靠 <code>grep</code> 找定义的人</strong>。</p><blockquote><p>一句话先记住:<strong>ssh 的生产力不在命令行,在 <code>~/.ssh/config</code>——一份好 config 能让所有跳板、端口转发、密钥都变成 <code>ssh prod-db</code> 一行</strong>。命令行那些 <code>-i</code>、<code>-p</code>、<code>-J</code>、<code>-L</code>、<code>-D</code>、<code>-o ...</code> 不是日常用法,是 config 写不下时才用的逃生口。<strong>还在每次 <code>ssh -i ~/.ssh/key.pem -p 2222 ubuntu@xxx.xxx.xxx.xxx</code> 敲完整串的人,默认就把生产力打了 5 折</strong>。</p></blockquote><p>这一篇把 ssh 拆成 6 件事讲透:<code>~/.ssh/config</code> 的工程化、ProxyJump 跳板、三种端口转发(<code>-L</code> / <code>-R</code> / <code>-D</code>)、密钥管理(从 ed25519 到 1Password agent)、known_hosts 工程、mosh 替代——再加上<strong>替代 ssh 的现代方案</strong>(Tailscale / Session Manager / Cloudflare Tunnel / Teleport)的选型,和一组<strong>反对的写法</strong>。看完你应该能写出一份<strong>生产可用的 70 行 config</strong>,并把团队新人的&quot;上手 ssh&quot;从 3 天压到 30 分钟。</p><hr><h2 id="一、为什么-ssh-必须工程化" tabindex="-1">一、为什么 ssh 必须工程化 <a class="header-anchor" href="#一、为什么-ssh-必须工程化" aria-label="Permalink to &quot;一、为什么 ssh 必须工程化&quot;">​</a></h2><h3 id="_1-1-三个让命令行党破防的真实场景" tabindex="-1">1.1 三个让命令行党破防的真实场景 <a class="header-anchor" href="#_1-1-三个让命令行党破防的真实场景" aria-label="Permalink to &quot;1.1 三个让命令行党破防的真实场景&quot;">​</a></h3><p><strong>场景 1:凌晨告警,你要进堡垒机后面的 prod DB,翻 4 个备忘录</strong></p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>02:30  告警:某个微服务 5xx 飙升</span></span>
<span class="line"><span>02:31  你打开终端,要 SSH 进堡垒,再跳到 db 机器看连接池</span></span>
<span class="line"><span>       但你不记得:</span></span>
<span class="line"><span>         - 堡垒机 IP(翻 Notion)</span></span>
<span class="line"><span>         - 堡垒机用户名(查公司 wiki)</span></span>
<span class="line"><span>         - 堡垒机端口是不是 22(被改成 2222 你忘了)</span></span>
<span class="line"><span>         - 用哪把 key(\`id_rsa_company\` 还是 \`id_ed25519_prod\`?)</span></span>
<span class="line"><span>         - DB 机器的内网 IP(翻 Confluence)</span></span>
<span class="line"><span>         - DB 机器的用户名(\`dba\` 还是 \`root\`?)</span></span>
<span class="line"><span>       </span></span>
<span class="line"><span>02:38  花 8 分钟翻完资料,开始连</span></span>
<span class="line"><span>02:39  ssh -i ~/.ssh/id_ed25519_company -p 2222 ops@bastion.company.com</span></span>
<span class="line"><span>       Enter passphrase: ...   ← 你 passphrase 又输错一次</span></span>
<span class="line"><span>02:40  连进堡垒,然后:</span></span>
<span class="line"><span>       ssh -i ~/.ssh/prod_db.pem dba@10.20.30.40</span></span>
<span class="line"><span>       Permission denied (publickey)   ← key 没在堡垒上,只在本地</span></span>
<span class="line"><span>02:41  你想起来应该 ssh -A 转发 agent,Ctrl+D 退出重连</span></span>
<span class="line"><span>02:43  终于进去了</span></span>
<span class="line"><span>02:44  开始查问题</span></span></code></pre></div><p><strong>这场景的核心不是「你网络不熟」</strong>——是<strong>你的 ssh 没有工程化</strong>,所以每次都要重新拼一遍。这种事故里 14 分钟全部在和 ssh 搏斗,不是和故障搏斗。<strong>对照组</strong>:同事一行 <code>ssh prod-db</code>,直接进。差别不是技能,是<strong>有没有写过 config</strong>。</p><p><strong>场景 2:本地连云上 RDS 调一个 ORM 问题,翻了 4 个 GUI 工具</strong></p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>你要本地拿 DBeaver 连云上 PostgreSQL 看一条慢查询</span></span>
<span class="line"><span>但 RDS 只在 VPC 内部可达,不能从公网直连</span></span>
<span class="line"><span>你的方案:</span></span>
<span class="line"><span>  - 打开 DBeaver,新建连接</span></span>
<span class="line"><span>  - 翻文档:DBeaver 怎么配 SSH Tunnel?</span></span>
<span class="line"><span>  - 跟着教程点开 SSH 选项卡,填 bastion 信息</span></span>
<span class="line"><span>  - 填错了几次,DBeaver 还卡死了一次</span></span>
<span class="line"><span>  - 30 分钟后终于连上</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  下次换 IDEA 的 DataGrip,你又得重做一次</span></span>
<span class="line"><span>  下次换 TablePlus,你又得重做一次</span></span>
<span class="line"><span>  每个 GUI 都自己实现一套 ssh tunnel UI,各做各的烂</span></span></code></pre></div><p><strong>这是典型的「在 GUI 里重新发明 ssh」</strong>。<strong>真正的工程师姿势</strong>:在 <code>~/.ssh/config</code> 写一行 <code>LocalForward 5432 db.internal:5432</code>,后台一个 <code>ssh -fN bastion</code>,<strong>任何</strong>桌面工具(DBeaver / DataGrip / TablePlus / psql / 你写的 Python 脚本)都通过 <code>localhost:5432</code> 连,<strong>统一一次,跨工具复用</strong>。</p><p><strong>场景 3:火车上调代码,过隧道一断,vim 进度全没</strong></p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>高铁上,你 ssh 进开发机写代码,vim 编辑了 30 分钟</span></span>
<span class="line"><span>进隧道:连接断了 30 秒</span></span>
<span class="line"><span>出隧道:vim 进程已经被 sshd 杀掉,文件没保存的部分全丢</span></span>
<span class="line"><span>你重连,只能从上次 :w 开始</span></span></code></pre></div><p><strong>这个问题 1990 年代就有人解决了</strong>——<strong>mosh</strong>(MIT 2012 年开源)就是为弱网设计:UDP + 本地回显 + 漫游,<strong>断网 30 秒、切 WiFi、过隧道都不掉</strong>。但 95% 的工程师没装,因为「我没遇到这个问题啊」——<strong>实际上你天天遇到,只是你已经习惯了</strong>(每次断了重连一遍,觉得是常态)。</p><h3 id="_1-2-这三个场景的共同点" tabindex="-1">1.2 这三个场景的共同点 <a class="header-anchor" href="#_1-2-这三个场景的共同点" aria-label="Permalink to &quot;1.2 这三个场景的共同点&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>不是&quot;ssh 命令不够强&quot;          —— ssh 本身的能力 20 年前就够</span></span>
<span class="line"><span>不是&quot;你不会用 ssh&quot;             —— 你天天用</span></span>
<span class="line"><span>不是&quot;没有替代方案&quot;             —— 全部都是 ssh 一行 config 的事</span></span>
<span class="line"><span></span></span>
<span class="line"><span>是&quot;你的 ssh 没有工程化&quot;:</span></span>
<span class="line"><span>   —— 没写 config,每次重新拼</span></span>
<span class="line"><span>   —— 不用 agent / 不用 Keychain,密钥管理全靠肉记</span></span>
<span class="line"><span>   —— 不知道有端口转发,只会开终端</span></span>
<span class="line"><span>   —— 不知道有 ControlMaster,连接复用没开</span></span>
<span class="line"><span>   —— 不知道有 mosh,弱网就重连</span></span></code></pre></div><p><strong>ssh 工程化的本质</strong>:<strong>让&quot;我和远端机器的关系&quot;从&quot;每次重新建立&quot;变成&quot;一行 config 维护&quot;</strong>。和 dotfiles 一样——<strong>把一次性的人力劳动,变成可声明、可复用、可传承的配置</strong>。</p><hr><h2 id="二、-ssh-config-的心智-声明式主机簿" tabindex="-1">二、<code>~/.ssh/config</code> 的心智:声明式主机簿 <a class="header-anchor" href="#二、-ssh-config-的心智-声明式主机簿" aria-label="Permalink to &quot;二、\`~/.ssh/config\` 的心智:声明式主机簿&quot;">​</a></h2><h3 id="_2-1-这个文件到底是什么" tabindex="-1">2.1 这个文件到底是什么 <a class="header-anchor" href="#_2-1-这个文件到底是什么" aria-label="Permalink to &quot;2.1 这个文件到底是什么&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>~/.ssh/config 不是&quot;一堆 flag 缩写&quot;,它是&quot;声明式的主机簿&quot;:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   每个 Host 块声明一台机器的&quot;身份&quot;:</span></span>
<span class="line"><span>      - 它的真实地址、端口、用户、key 在哪</span></span>
<span class="line"><span>      - 怎么去(直连?跳板?)</span></span>
<span class="line"><span>      - 连上之后做什么(端口转发?保活?)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   声明完之后,ssh xxx / scp / rsync / git / 任何 ssh 客户端</span></span>
<span class="line"><span>   都通过这个 Host 名字调用,不再写完整 IP / port / key</span></span></code></pre></div><p><strong>和「shell 别名」的关键差别</strong>:</p><ul><li>alias 只是字符串替换,<strong>只对 <code>ssh</code> 命令本身有效</strong></li><li><code>~/.ssh/config</code> 是 ssh 协议的一部分,<strong>所有用 libssh 的程序都尊重它</strong>(rsync、scp、git、vscode-remote、ansible)</li></ul><p><strong>这是一份 config 能值回票价的根本原因</strong>:<strong>写一次,全工具栈生效</strong>。</p><h3 id="_2-2-匹配规则-顺序-通配符" tabindex="-1">2.2 匹配规则:顺序 + 通配符 <a class="header-anchor" href="#_2-2-匹配规则-顺序-通配符" aria-label="Permalink to &quot;2.2 匹配规则:顺序 + 通配符&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Host 段从上到下顺序匹配:</span></span>
<span class="line"><span>   - 第一个匹配上的设置生效</span></span>
<span class="line"><span>   - 之后匹配上的同名设置被忽略</span></span>
<span class="line"><span>   - 不同名的设置叠加</span></span>
<span class="line"><span></span></span>
<span class="line"><span>通配符:</span></span>
<span class="line"><span>   *        匹配任意字符</span></span>
<span class="line"><span>   ?        匹配单个字符  </span></span>
<span class="line"><span>   !pattern 排除模式(只能和别的模式一起用)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>例子:</span></span>
<span class="line"><span>   Host *.prod              ← 任何 *.prod 都匹配</span></span>
<span class="line"><span>   Host !bastion *          ← 除了 bastion 之外的所有 host</span></span>
<span class="line"><span>   Host db1 db2 db3         ← 三个名字共用一组设置</span></span></code></pre></div><p><strong>关键心智</strong>:<strong>特殊配置写在前,兜底通配符写在后</strong>——这样特殊的会被先匹配上,不会被通配兜底覆盖。</p><h3 id="_2-3-一份生产可用的-70-行-config" tabindex="-1">2.3 一份生产可用的 70 行 config <a class="header-anchor" href="#_2-3-一份生产可用的-70-行-config" aria-label="Permalink to &quot;2.3 一份生产可用的 70 行 config&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># ~/.ssh/config</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 顺序:特殊 host &gt; 跳板 &gt; 跨跳板 &gt; git remote &gt; 通配兜底</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># ============ 1. 跳板机(单独声明,后面跨机引用) ============</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">Host</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> bastion</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    HostName</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">        bastion.company.com</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    User</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            ops</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    Port</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">            22</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    IdentityFile</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    ~/.ssh/id_ed25519_company</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    IdentitiesOnly</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  yes</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                        # 只用这一把 key,不用 agent 里其它的</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># ============ 2. 通过 bastion 跳的 prod 机器 ============</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">Host</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> prod-</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">*</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    ProxyJump</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">       bastion</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                    # 自动走 bastion,无感</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    User</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            ops</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    IdentityFile</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    ~/.ssh/id_ed25519_company</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    IdentitiesOnly</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  yes</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">Host</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> prod-web1</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    HostName</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        10.20.1.11</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">Host</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> prod-web2</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    HostName</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        10.20.1.12</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">Host</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> prod-db</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    HostName</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        10.20.2.10</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    User</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            dba</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                         # 覆盖上面 prod-* 的 ops</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    LocalForward</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    5432</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> localhost:5432</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">         # 顺便把 DB 端口拉本地</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># ============ 3. 开发机(直连,有端口转发) ============</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">Host</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> devbox</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    HostName</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">        dev.company.com</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    User</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            myname</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    IdentityFile</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    ~/.ssh/id_ed25519_company</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    IdentitiesOnly</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  yes</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    LocalForward</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    8080</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> localhost:8080</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">         # 跑在 devbox 的 web 服务拉本地看</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    LocalForward</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    9090</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> localhost:9090</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">         # Prometheus</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    RemoteForward</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">   2222</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> localhost:22</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">           # 把本地 22 反向暴露给 devbox</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># ============ 4. GitHub / GitLab 分账户 ============</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">Host</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> github.com</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    HostName</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">        github.com</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    User</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            git</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    IdentityFile</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    ~/.ssh/id_ed25519_personal</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  # 个人账户</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">Host</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> github-work</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    HostName</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">        github.com</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                  # 也是 github.com,但用不同 key</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    User</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            git</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    IdentityFile</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    ~/.ssh/id_ed25519_company</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">   # 公司账户</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># git remote set-url origin git@github-work:company/repo.git</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">Host</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> gitlab.internal.company.com</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    HostName</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">        gitlab.internal.company.com</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    User</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            git</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    IdentityFile</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    ~/.ssh/id_ed25519_company</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    ProxyJump</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">       bastion</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                     # 内网 GitLab 走 bastion</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># ============ 5. 临时 / 一次性 host(EC2 短期机器) ============</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">Host</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> scratch</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    HostName</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        1.2.3.4</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                     # 临时 EC2,IP 换了就改这一行</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    User</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            ec2-user</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    IdentityFile</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    ~/.ssh/aws-scratch.pem</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    StrictHostKeyChecking</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> accept-new</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">            # 反正每次 IP 不一样,自动接受</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># ============ 6. 全局兜底(放最后!) ============</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">Host</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> *</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # 身份与安全</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    AddKeysToAgent</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">       yes</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                    # ssh 连接时自动把 key 加到 agent</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    UseKeychain</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          yes</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                    # macOS:passphrase 存 Keychain(Linux 无效)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    HashKnownHosts</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">       yes</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                    # known_hosts 里的 hostname 哈希化</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    StrictHostKeyChecking</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> accept-new</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">            # 默认:第一次见自动接受,改了仍拒绝</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    VisualHostKey</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">        yes</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                    # 第一次连接时画 ASCII 指纹图</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # 保活与重连</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    ServerAliveInterval</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  60</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                     # 每 60 秒发一次 keepalive</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    ServerAliveCountMax</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  3</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                      # 连续 3 次无响应(180 秒)再断开</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # 连接复用(同一台 host 第二次连接秒开)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    ControlMaster</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">        auto</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    ControlPath</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          ~/.ssh/cm/%r@%h:%p</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    ControlPersist</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">       10m</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                    # 最后一个连接断后,主连接再保持 10 分钟</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # TERM 与 locale(防止远端 vim 颜色坏、locale 错乱)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    SetEnv</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">               LC_ALL=en_US.UTF-8</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # 安全:默认禁用 agent 转发(需要时单独 host 段开)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    ForwardAgent</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">         no</span></span></code></pre></div><p><strong>这份 config 完整可用,带注释 70 行</strong>。<strong>每一行如果删掉会怎样</strong>,逐段说:</p><table tabindex="0"><thead><tr><th>行</th><th>删掉后果</th></tr></thead><tbody><tr><td><code>IdentitiesOnly yes</code></td><td>agent 里所有 key 都被尝试,服务器配 <code>MaxAuthTries 3</code> 时会被锁</td></tr><tr><td><code>ProxyJump bastion</code></td><td>退化成「先 ssh bastion 再 ssh target」两步</td></tr><tr><td><code>ControlMaster + ControlPath + ControlPersist</code></td><td>同一台 host 每次都重新握手(1-2 秒),开 5 个 pane 就是 5 次握手</td></tr><tr><td><code>ServerAliveInterval / CountMax</code></td><td>网络抖一下连接就死,vim 半天的工作丢</td></tr><tr><td><code>AddKeysToAgent yes</code></td><td>每次输 passphrase</td></tr><tr><td><code>UseKeychain yes</code>(macOS)</td><td>macOS 上 passphrase 不存 Keychain,每次重启都要重新输</td></tr><tr><td><code>HashKnownHosts yes</code></td><td>known_hosts 明文,泄露后等于公开主机列表</td></tr><tr><td><code>StrictHostKeyChecking accept-new</code></td><td>默认是 <code>ask</code>,每次新 host 弹「yes/no」交互</td></tr></tbody></table><p><strong>这一段一旦内化,你看任何 ssh config 都像看 Go 函数签名一样,一眼能读懂在声明什么</strong>。</p><h3 id="_2-4-controlmaster-单独说" tabindex="-1">2.4 ControlMaster 单独说 <a class="header-anchor" href="#_2-4-controlmaster-单独说" aria-label="Permalink to &quot;2.4 ControlMaster 单独说&quot;">​</a></h3><p>这个开关 90% 的人没开,但<strong>它是 ssh 体验的&quot;前后差距最大&quot;开关</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>没开 ControlMaster:</span></span>
<span class="line"><span>   $ tmux 6 个 pane,每个都 ssh devbox</span></span>
<span class="line"><span>   每个 pane: TCP 握手 + KEX + 认证 = 1-2 秒</span></span>
<span class="line"><span>   6 个 pane 同时建立 = 6-10 秒抖动</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>开了 ControlMaster auto + ControlPersist 10m:</span></span>
<span class="line"><span>   第一个 ssh devbox: 正常握手 1-2 秒,主连接建立</span></span>
<span class="line"><span>   后续 ssh devbox: 复用主连接,瞬间 (~50ms)</span></span>
<span class="line"><span>   ControlPath socket 文件维持 10 分钟</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   附赠效果:scp / rsync / git push 同主机时也复用,不重新握手</span></span></code></pre></div><p><strong>注意</strong>:<code>ControlPath</code> 路径里要有 <code>%r@%h:%p</code>(user/host/port),不然不同 user 会被错误复用。<strong>而且 <code>~/.ssh/cm/</code> 这个目录要自己 <code>mkdir -p</code></strong>,ssh 不会自动建。</p><hr><h2 id="三、proxyjump-替代-proxycommand-的现代写法" tabindex="-1">三、ProxyJump:替代 ProxyCommand 的现代写法 <a class="header-anchor" href="#三、proxyjump-替代-proxycommand-的现代写法" aria-label="Permalink to &quot;三、ProxyJump:替代 ProxyCommand 的现代写法&quot;">​</a></h2><h3 id="_3-1-老写法-vs-新写法" tabindex="-1">3.1 老写法 vs 新写法 <a class="header-anchor" href="#_3-1-老写法-vs-新写法" aria-label="Permalink to &quot;3.1 老写法 vs 新写法&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>老写法(OpenSSH &lt; 7.3,2016 年之前):</span></span>
<span class="line"><span>   ssh -o &quot;ProxyCommand=ssh -W %h:%p bastion&quot; target</span></span>
<span class="line"><span>   或 config 里:</span></span>
<span class="line"><span>      Host target</span></span>
<span class="line"><span>          ProxyCommand ssh -W %h:%p bastion</span></span>
<span class="line"><span></span></span>
<span class="line"><span>新写法(OpenSSH ≥ 7.3,2025 默认):</span></span>
<span class="line"><span>   ssh -J bastion target</span></span>
<span class="line"><span>   或 config 里:</span></span>
<span class="line"><span>      Host target</span></span>
<span class="line"><span>          ProxyJump bastion</span></span></code></pre></div><p><strong>为什么换</strong>:</p><ul><li><code>ProxyJump</code> 是 ssh <strong>协议级别</strong>支持,bastion 上<strong>不需要装 nc</strong>(老 ProxyCommand 用 <code>-W</code> 时已经不需要,但更早的 <code>nc %h %p</code> 写法需要)</li><li>ProxyJump 走的是 <strong>direct-tcpip channel</strong>(协议内通道),比 ProxyCommand 起一个 ssh 子进程更轻</li><li>语法更短,易读</li></ul><h3 id="_3-2-多跳-j-host1-host2" tabindex="-1">3.2 多跳:<code>-J host1,host2</code> <a class="header-anchor" href="#_3-2-多跳-j-host1-host2" aria-label="Permalink to &quot;3.2 多跳:\`-J host1,host2\`&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>本地 → bastion-外网 → bastion-内网 → 目标</span></span>
<span class="line"><span></span></span>
<span class="line"><span>ssh -J bastion-public,bastion-internal target-host</span></span>
<span class="line"><span></span></span>
<span class="line"><span>config:</span></span>
<span class="line"><span>   Host target-host</span></span>
<span class="line"><span>       ProxyJump bastion-public,bastion-internal</span></span></code></pre></div><p><strong>多跳的代价</strong>:每跳一次都要握手 + 认证,延迟叠加。<strong>3 跳以上你应该考虑 Tailscale 之类的 mesh 网络</strong>(后面第十节)。</p><h3 id="_3-3-proxycommand-仍然有用的场景" tabindex="-1">3.3 ProxyCommand 仍然有用的场景 <a class="header-anchor" href="#_3-3-proxycommand-仍然有用的场景" aria-label="Permalink to &quot;3.3 ProxyCommand 仍然有用的场景&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 走非 ssh 的 transport</span></span>
<span class="line"><span>   - Cloudflare Access:cloudflared 起一个本地 socket,ssh ProxyCommand 走它</span></span>
<span class="line"><span>   - AWS SSM:走 Session Manager(后面第十节)</span></span>
<span class="line"><span>   ProxyCommand sh -c &quot;cloudflared access ssh --hostname %h&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. 自定义 nc-like 工具(老的、特殊网络)</span></span>
<span class="line"><span>   ProxyCommand nc -X 5 -x proxy.company.com:1080 %h %p   # 走 SOCKS5</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. 一次性脚本拼接,不想用 -J</span></span>
<span class="line"><span>   ProxyCommand ssh user@gateway &#39;socat - TCP:%h:%p&#39;</span></span></code></pre></div><p><strong>90% 场景用 <code>ProxyJump</code>,10% 用 <code>ProxyCommand</code></strong>——记住这个比例就够。</p><hr><h2 id="四、端口转发-三种各管一摊" tabindex="-1">四、端口转发:三种各管一摊 <a class="header-anchor" href="#四、端口转发-三种各管一摊" aria-label="Permalink to &quot;四、端口转发:三种各管一摊&quot;">​</a></h2><p>ssh 的端口转发是<strong>最被低估的功能之一</strong>——它让你不需要 VPN 也能临时把任何机器变成&quot;本地的一部分&quot;。三种各管一摊,<strong>这一节的 ASCII 图你要能在白板上默写</strong>。</p><h3 id="_4-1-本地转发-l-把远端服务拉到本地" tabindex="-1">4.1 本地转发 <code>-L</code>:把远端服务拉到本地 <a class="header-anchor" href="#_4-1-本地转发-l-把远端服务拉到本地" aria-label="Permalink to &quot;4.1 本地转发 \`-L\`:把远端服务拉到本地&quot;">​</a></h3><p><strong>场景</strong>:你想从笔记本连云上 RDS,但 RDS 只允许 VPC 内访问。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>本地  ←→  ssh tunnel  ←→  bastion  ←→  RDS</span></span>
<span class="line"><span></span></span>
<span class="line"><span>$ ssh -L 5432:db.internal:5432 bastion</span></span>
<span class="line"><span>            ↑    ↑           ↑     ↑</span></span>
<span class="line"><span>            │    │           │     └─ 远端目标的端口</span></span>
<span class="line"><span>            │    │           └─────── 远端目标的 host(从 bastion 看出去)</span></span>
<span class="line"><span>            │    └─────────────────── 远端目标在本地映射到的 port</span></span>
<span class="line"><span>            └──────────────────────── 本地监听的 port</span></span>
<span class="line"><span></span></span>
<span class="line"><span>然后本地:</span></span>
<span class="line"><span>   $ psql -h localhost -p 5432 -U dba mydb</span></span>
<span class="line"><span>   实际请求路径:</span></span>
<span class="line"><span>   localhost:5432 → ssh → bastion → db.internal:5432</span></span>
<span class="line"><span></span></span>
<span class="line"><span>ASCII 图:</span></span>
<span class="line"><span>   ┌──────────────┐                           ┌──────────────┐</span></span>
<span class="line"><span>   │  你的笔记本  │                           │   bastion    │</span></span>
<span class="line"><span>   │              │   加密 ssh 隧道           │              │</span></span>
<span class="line"><span>   │ localhost:   │  ◀────────────────────▶  │              │</span></span>
<span class="line"><span>   │   5432       │                           │              │</span></span>
<span class="line"><span>   └──────┬───────┘                           └──────┬───────┘</span></span>
<span class="line"><span>          │                                          │</span></span>
<span class="line"><span>          │  psql 连 localhost:5432                  │</span></span>
<span class="line"><span>          │                                          ▼</span></span>
<span class="line"><span>          ▼                                  ┌──────────────┐</span></span>
<span class="line"><span>        进入                                 │ db.internal  │</span></span>
<span class="line"><span>        ssh tunnel                            │     :5432    │</span></span>
<span class="line"><span>                                              └──────────────┘</span></span></code></pre></div><p><strong>config 写法</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Host bastion</span></span>
<span class="line"><span>    HostName        bastion.company.com</span></span>
<span class="line"><span>    LocalForward    5432 db.internal:5432</span></span>
<span class="line"><span>    LocalForward    6379 cache.internal:6379    # 顺便 Redis 也拉</span></span></code></pre></div><p>之后 <code>ssh bastion</code> 自动开转发,<strong>所有桌面工具都可以连 <code>localhost:5432</code></strong>。</p><p><strong>后台跑不开 shell</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>ssh -fN -L 5432:db.internal:5432 bastion</span></span>
<span class="line"><span>   -f  fork 到后台</span></span>
<span class="line"><span>   -N  不开远端 shell(只做转发,纯隧道)</span></span></code></pre></div><h3 id="_4-2-远程转发-r-把本地服务暴露到远端" tabindex="-1">4.2 远程转发 <code>-R</code>:把本地服务暴露到远端 <a class="header-anchor" href="#_4-2-远程转发-r-把本地服务暴露到远端" aria-label="Permalink to &quot;4.2 远程转发 \`-R\`:把本地服务暴露到远端&quot;">​</a></h3><p><strong>场景</strong>:你笔记本上跑了个 demo(<code>localhost:3000</code>),想让公司服务器上的同事能访问。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>本地  ←→  ssh tunnel  ←→  server  ←→  同事 curl server:8080</span></span>
<span class="line"><span></span></span>
<span class="line"><span>$ ssh -R 8080:localhost:3000 server</span></span>
<span class="line"><span>            ↑    ↑          ↑</span></span>
<span class="line"><span>            │    │          └── 本地的 host:port(从你机器看)</span></span>
<span class="line"><span>            │    └───────────── 本地的 port  </span></span>
<span class="line"><span>            └────────────────── 远端监听的 port(server 上的 8080)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>ASCII 图:</span></span>
<span class="line"><span>   ┌──────────────┐                           ┌──────────────┐</span></span>
<span class="line"><span>   │  你的笔记本  │                           │   server     │</span></span>
<span class="line"><span>   │              │   加密 ssh 隧道           │              │</span></span>
<span class="line"><span>   │ localhost:   │  ◀────────────────────▶  │ 0.0.0.0:8080 │</span></span>
<span class="line"><span>   │   3000       │                           │ (公开监听)   │</span></span>
<span class="line"><span>   └──────────────┘                           └──────┬───────┘</span></span>
<span class="line"><span>                                                     │</span></span>
<span class="line"><span>                                                     │ 同事 curl</span></span>
<span class="line"><span>                                                     ▼</span></span>
<span class="line"><span>                                              ┌──────────────┐</span></span>
<span class="line"><span>                                              │ 同事的电脑   │</span></span>
<span class="line"><span>                                              └──────────────┘</span></span></code></pre></div><p><strong>坑</strong>:默认情况下,server 上的 <code>-R 8080</code> 只监听在 <code>127.0.0.1</code>,<strong>同事访问不到</strong>。要在 server 的 <code>/etc/ssh/sshd_config</code> 里加:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>GatewayPorts yes        # 允许 -R 监听到 0.0.0.0</span></span></code></pre></div><p><strong>替代方案 ngrok / Cloudflare Tunnel</strong>:不想动 sshd 配置时,用这俩更方便——但本质是同一个东西的 SaaS 版。</p><h3 id="_4-3-动态转发-d-起一个-socks5-代理" tabindex="-1">4.3 动态转发 <code>-D</code>:起一个 SOCKS5 代理 <a class="header-anchor" href="#_4-3-动态转发-d-起一个-socks5-代理" aria-label="Permalink to &quot;4.3 动态转发 \`-D\`:起一个 SOCKS5 代理&quot;">​</a></h3><p><strong>场景</strong>:你出差,要&quot;假装&quot;自己在公司内网,临时用浏览器访问内网管理后台。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>$ ssh -D 1080 bastion</span></span>
<span class="line"><span>         ↑</span></span>
<span class="line"><span>         本地起的 SOCKS5 proxy port</span></span>
<span class="line"><span></span></span>
<span class="line"><span>然后浏览器(或任何应用)设 SOCKS5 proxy = localhost:1080</span></span>
<span class="line"><span>所有流量经过 ssh tunnel 出去,从 bastion 出网</span></span>
<span class="line"><span></span></span>
<span class="line"><span>ASCII 图:</span></span>
<span class="line"><span>   ┌──────────────┐                           ┌──────────────┐</span></span>
<span class="line"><span>   │  你的笔记本  │                           │   bastion    │</span></span>
<span class="line"><span>   │              │                           │              │</span></span>
<span class="line"><span>   │  浏览器      │   ssh tunnel(SOCKS5)    │   出口        │</span></span>
<span class="line"><span>   │   ↓          │  ◀────────────────────▶  │   → 内网     │</span></span>
<span class="line"><span>   │ localhost:   │                           │   → 互联网   │</span></span>
<span class="line"><span>   │   1080       │                           │              │</span></span>
<span class="line"><span>   │  (SOCKS5)    │                           │              │</span></span>
<span class="line"><span>   └──────────────┘                           └──────────────┘</span></span></code></pre></div><p><strong>chrome 配 SOCKS5 启动</strong>:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">google-chrome</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --proxy-server=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;socks5://localhost:1080&quot;</span></span></code></pre></div><p><strong><code>-D</code> 和 VPN 的差别</strong>:</p><ul><li><code>-D</code> 走 ssh,只在你显式开 ssh 连接时有,断开就没</li><li><code>-D</code> 不影响系统的默认路由,只有用了 proxy 的应用才走</li><li>VPN 是系统级,所有流量都走,即使你不想</li></ul><p><strong>临时翻墙 / 临时进内网</strong>,<code>-D</code> 是最轻量级方案。</p><h3 id="_4-4-三种对照表-必背" tabindex="-1">4.4 三种对照表(必背) <a class="header-anchor" href="#_4-4-三种对照表-必背" aria-label="Permalink to &quot;4.4 三种对照表(必背)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌─────────┬─────────────────────┬──────────────────────────────────┐</span></span>
<span class="line"><span>│  flag   │  方向                │  典型场景                          │</span></span>
<span class="line"><span>├─────────┼─────────────────────┼──────────────────────────────────┤</span></span>
<span class="line"><span>│  -L     │  远端服务 → 本地     │  本地连云上 DB / Redis            │</span></span>
<span class="line"><span>│  -R     │  本地服务 → 远端     │  把本地 demo 暴露给同事 / 内网回连 │</span></span>
<span class="line"><span>│  -D     │  本地 SOCKS5 → 远端  │  临时翻墙 / 临时进内网            │</span></span>
<span class="line"><span>└─────────┴─────────────────────┴──────────────────────────────────┘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>记忆法:</span></span>
<span class="line"><span>   L = Local 监听一个 port(把远端服务拉过来)</span></span>
<span class="line"><span>   R = Remote 监听一个 port(把本地服务推过去)</span></span>
<span class="line"><span>   D = Dynamic 万能 SOCKS5(我不知道要访问哪些 IP)</span></span></code></pre></div><hr><h2 id="五、密钥管理-从-ed25519-到-1password" tabindex="-1">五、密钥管理:从 ed25519 到 1Password <a class="header-anchor" href="#五、密钥管理-从-ed25519-到-1password" aria-label="Permalink to &quot;五、密钥管理:从 ed25519 到 1Password&quot;">​</a></h2><h3 id="_5-1-算法选型-2026-默认-ed25519" tabindex="-1">5.1 算法选型(2026 默认 ed25519) <a class="header-anchor" href="#_5-1-算法选型-2026-默认-ed25519" aria-label="Permalink to &quot;5.1 算法选型(2026 默认 ed25519)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>RSA 2048    ─→ 已弱,不要再用(NIST 已不推荐)</span></span>
<span class="line"><span>RSA 3072    ─→ 兼容性最好,但慢、密钥长</span></span>
<span class="line"><span>RSA 4096    ─→ 反向更慢,没解决根本问题(同算法)</span></span>
<span class="line"><span>ECDSA       ─→ 历史上曾推荐,因 P-256 曲线被 NSA 后门质疑,现冷</span></span>
<span class="line"><span>ed25519     ─→ ★ 默认 ★</span></span>
<span class="line"><span>              短(秘钥 ~70 字节)、快、安全模型干净</span></span>
<span class="line"><span>              OpenSSH 6.5+(2014)就有,2026 兼容性已无问题</span></span>
<span class="line"><span>sk-ed25519  ─→ 硬件 key 版(YubiKey / FIDO2),需要物理设备触摸</span></span></code></pre></div><p><strong>生成</strong>:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">ssh-keygen</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -t</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ed25519</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -C</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;you@host&quot;</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -f</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ~/.ssh/id_ed25519_company</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">   -t</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  算法</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">   -C</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  comment</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">随便写,通常是邮箱或用途</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">   -f</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  输出路径</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">   提示输</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> passphrase:输!不要空</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> passphrase</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">ssh-keygen</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -t</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ed25519-sk</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -O</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> resident</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -O</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> application=ssh:github</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">   YubiKey</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 版:私钥不能从设备导出,每次签名要按键</span></span></code></pre></div><p><strong>永远不要</strong>:</p><ul><li>不输 passphrase(私钥落盘 = 私钥被窃 = 玩完)</li><li>多机共用同一把私钥(丢一把全军覆没)</li><li>把 <code>id_rsa</code> 这个名字当工厂默认,不分用途</li></ul><h3 id="_5-2-命名约定" tabindex="-1">5.2 命名约定 <a class="header-anchor" href="#_5-2-命名约定" aria-label="Permalink to &quot;5.2 命名约定&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>~/.ssh/</span></span>
<span class="line"><span>├── config</span></span>
<span class="line"><span>├── known_hosts</span></span>
<span class="line"><span>├── id_ed25519_personal       ← 个人 GitHub</span></span>
<span class="line"><span>├── id_ed25519_personal.pub</span></span>
<span class="line"><span>├── id_ed25519_company        ← 公司账户</span></span>
<span class="line"><span>├── id_ed25519_company.pub</span></span>
<span class="line"><span>├── id_ed25519_aws_prod       ← AWS prod 账户</span></span>
<span class="line"><span>├── id_ed25519_aws_prod.pub</span></span>
<span class="line"><span>└── cm/                       ← ControlMaster sockets</span></span></code></pre></div><p><strong>命名规则</strong>:<code>id_&lt;算法&gt;_&lt;用途/账户&gt;</code>。<strong>一个 key 一个用途</strong>——丢一把不慌,只换那一份。</p><h3 id="_5-3-ssh-agent-passphrase-只输一次" tabindex="-1">5.3 ssh-agent:passphrase 只输一次 <a class="header-anchor" href="#_5-3-ssh-agent-passphrase-只输一次" aria-label="Permalink to &quot;5.3 ssh-agent:passphrase 只输一次&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>没 agent:</span></span>
<span class="line"><span>   每次 ssh 都要 passphrase。开 6 个 tmux pane = 输 6 次。</span></span>
<span class="line"><span>   你忍不住,就开始用空 passphrase。然后私钥裸奔。</span></span>
<span class="line"><span></span></span>
<span class="line"><span>用 agent:</span></span>
<span class="line"><span>   $ eval $(ssh-agent)</span></span>
<span class="line"><span>   $ ssh-add ~/.ssh/id_ed25519_company</span></span>
<span class="line"><span>   Enter passphrase: ...   ← 只输一次</span></span>
<span class="line"><span>   Identity added: ~/.ssh/id_ed25519_company</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   之后这台机器上所有 ssh 都从 agent 拿解密好的 key</span></span>
<span class="line"><span>   关机或 agent 进程退出就清空(更安全)</span></span></code></pre></div><p><strong>Agent 工作机制</strong>:agent 是个常驻进程,持有&quot;已解密&quot;的私钥,ssh 客户端通过 <code>$SSH_AUTH_SOCK</code> 这个 socket 文件向 agent 请求签名(私钥本体不离开 agent)。</p><h3 id="_5-4-macos-keychain-集成" tabindex="-1">5.4 macOS Keychain 集成 <a class="header-anchor" href="#_5-4-macos-keychain-集成" aria-label="Permalink to &quot;5.4 macOS Keychain 集成&quot;">​</a></h3><p>macOS 默认就有 ssh-agent 启动(<code>ssh-agent</code> 自动跑),但 passphrase 重启就忘——<strong>让 Keychain 替你记住</strong>:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 加密钥时一并存到 Keychain</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">ssh-add</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --apple-use-keychain</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ~/.ssh/id_ed25519_company</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 重启后,~/.ssh/config 的全局兜底已经有:</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#   UseKeychain yes</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#   AddKeysToAgent yes</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 第一次 ssh 时自动从 Keychain 取 passphrase,无感</span></span></code></pre></div><p><strong>注意</strong>:<code>UseKeychain</code> 这个选项 <strong>只 macOS 有</strong>,Linux 上写了被 ssh 忽略(不报错,但也没用),所以 dotfiles 跨平台同步无问题。</p><h3 id="_5-5-1password-bitwarden-ssh-agent-2026-推荐" tabindex="-1">5.5 1Password / Bitwarden SSH Agent(2026 推荐) <a class="header-anchor" href="#_5-5-1password-bitwarden-ssh-agent-2026-推荐" aria-label="Permalink to &quot;5.5 1Password / Bitwarden SSH Agent(2026 推荐)&quot;">​</a></h3><p><strong>这是 2022 年才出现的、改变密钥管理范式的方案</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>传统:</span></span>
<span class="line"><span>   私钥文件存 ~/.ssh/,passphrase 存 Keychain</span></span>
<span class="line"><span>   私钥本体还在硬盘上,被偷盘 = 被偷 key</span></span>
<span class="line"><span></span></span>
<span class="line"><span>1Password SSH Agent:</span></span>
<span class="line"><span>   私钥存在 1Password vault(加密 + 同步)</span></span>
<span class="line"><span>   1Password 本身充当 ssh-agent</span></span>
<span class="line"><span>   ssh 通过 ~/.1password/agent.sock 向它请求签名</span></span>
<span class="line"><span>   私钥永远不落盘,且 Touch ID / 主密码守门</span></span></code></pre></div><p><strong>config</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Host *</span></span>
<span class="line"><span>    IdentityAgent ~/.1password/agent.sock</span></span></code></pre></div><p><strong>好处</strong>:</p><ul><li>私钥不在硬盘上,被 malware 偷盘也偷不到</li><li>跨机器同步靠 1Password 自己,新机器登录 1Password 就有所有 key</li><li>Touch ID 解锁,每次 ssh 触一下指纹(轻度)或直接复用解锁状态</li><li>团队场景:1Password Business 共享 vault,新人入职拉一个 vault 就有所有 key</li></ul><p><strong>坏处</strong>:</p><ul><li>锁在 1Password 生态(切走得迁)</li><li>1Password 没启动 = 没 key 用</li><li>服务器端不变(还是公钥认证),只是客户端密钥管理换了</li></ul><p>Bitwarden / 内置工具基本同理,<strong>2026 默认推荐就是这套</strong>——尤其团队场景。</p><h3 id="_5-6-ssh-copy-id-把公钥推到服务器" tabindex="-1">5.6 ssh-copy-id:把公钥推到服务器 <a class="header-anchor" href="#_5-6-ssh-copy-id-把公钥推到服务器" aria-label="Permalink to &quot;5.6 ssh-copy-id:把公钥推到服务器&quot;">​</a></h3><p>新机器,要把你的公钥加到远端 <code>authorized_keys</code>:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">ssh-copy-id</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -i</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ~/.ssh/id_ed25519_company.pub</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> user@host</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">   # 这一步等价于:</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">   #   cat ~/.ssh/id_ed25519_company.pub | ssh user@host \\</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">   #     &quot;mkdir -p ~/.ssh &amp;&amp; chmod 700 ~/.ssh &amp;&amp; \\</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">   #      cat &gt;&gt; ~/.ssh/authorized_keys &amp;&amp; chmod 600 ~/.ssh/authorized_keys&quot;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 推完测试一下能不能 key 登录:</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">ssh</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -o</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> PasswordAuthentication=no</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> user@host</span></span></code></pre></div><hr><h2 id="六、known-hosts-工程" tabindex="-1">六、known_hosts 工程 <a class="header-anchor" href="#六、known-hosts-工程" aria-label="Permalink to &quot;六、known_hosts 工程&quot;">​</a></h2><p><code>~/.ssh/known_hosts</code> 是 ssh 防 <strong>MITM(中间人攻击)</strong> 的核心——但 99% 的工程师对它的态度是「弹了警告就 <code>ssh-keygen -R</code> 删了」。<strong>这一节讲怎么把它用对</strong>。</p><h3 id="_6-1-它是怎么工作的" tabindex="-1">6.1 它是怎么工作的 <a class="header-anchor" href="#_6-1-它是怎么工作的" aria-label="Permalink to &quot;6.1 它是怎么工作的&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>第一次 ssh new-host:</span></span>
<span class="line"><span>   server 发它的 host key</span></span>
<span class="line"><span>   client 检查 ~/.ssh/known_hosts 里有没有这台 host 的记录</span></span>
<span class="line"><span>   没有 → 提示 yes/no 或自动接受(看 StrictHostKeyChecking)</span></span>
<span class="line"><span>   接受后写入 known_hosts</span></span>
<span class="line"><span></span></span>
<span class="line"><span>之后每次 ssh new-host:</span></span>
<span class="line"><span>   server 发的 host key 必须匹配 known_hosts 里的记录</span></span>
<span class="line"><span>   不匹配 → REMOTE HOST IDENTIFICATION HAS CHANGED! → 拒绝连接</span></span></code></pre></div><h3 id="_6-2-hashknownhosts-hostname-哈希化" tabindex="-1">6.2 HashKnownHosts:hostname 哈希化 <a class="header-anchor" href="#_6-2-hashknownhosts-hostname-哈希化" aria-label="Permalink to &quot;6.2 HashKnownHosts:hostname 哈希化&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>未哈希(默认 OpenSSH 在某些发行版上):</span></span>
<span class="line"><span>   bastion.company.com,1.2.3.4 ssh-ed25519 AAAA...</span></span>
<span class="line"><span>   github.com ssh-ed25519 AAAA...</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   ↑ 谁拿到这个文件 = 拿到你所有机器列表</span></span>
<span class="line"><span></span></span>
<span class="line"><span>哈希(HashKnownHosts yes):</span></span>
<span class="line"><span>   |1|abc123def...|xyz456ghi...= ssh-ed25519 AAAA...</span></span>
<span class="line"><span>   |1|qrs789tuv...|mno012pqr...= ssh-ed25519 AAAA...</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   ↑ 单向哈希,谁拿到也看不出 hostname</span></span></code></pre></div><p><strong>为什么这事重要</strong>:malware 拿到你笔记本 = 拿到 known_hosts = 拿到你的&quot;机器簿&quot;+&quot;key 列表&quot;——<strong>横向移动地图直接送给攻击者</strong>。哈希了至少这一步要 brute-force。</p><h3 id="_6-3-三档严格性" tabindex="-1">6.3 三档严格性 <a class="header-anchor" href="#_6-3-三档严格性" aria-label="Permalink to &quot;6.3 三档严格性&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>StrictHostKeyChecking yes</span></span>
<span class="line"><span>   ★ 最严:host key 不在 known_hosts 直接拒绝</span></span>
<span class="line"><span>   不允许&quot;第一次见就接受&quot;</span></span>
<span class="line"><span>   适合:CI、自动化(预先 ssh-keyscan 灌入)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>StrictHostKeyChecking accept-new  ← 推荐</span></span>
<span class="line"><span>   第一次自动接受并写入,之后必须匹配</span></span>
<span class="line"><span>   OpenSSH 7.6+(2017)才有这一档</span></span>
<span class="line"><span>   适合:个人交互场景</span></span>
<span class="line"><span></span></span>
<span class="line"><span>StrictHostKeyChecking ask         ← 旧默认</span></span>
<span class="line"><span>   第一次弹&quot;yes/no&quot;问</span></span>
<span class="line"><span></span></span>
<span class="line"><span>StrictHostKeyChecking no</span></span>
<span class="line"><span>   ★ 不要用 ★</span></span>
<span class="line"><span>   第一次自动接受,即使后续不匹配也只警告不拒绝</span></span>
<span class="line"><span>   实质上等于关掉 MITM 防御</span></span></code></pre></div><p><strong>永远不要在生产或个人配置写 <code>no</code></strong>——这是把 ssh 加密协议最关键的一层防御扔掉。</p><h3 id="_6-4-ci-脚本里的-首次连接弹-yes-no-怎么破" tabindex="-1">6.4 CI / 脚本里的&quot;首次连接弹 yes/no&quot; 怎么破 <a class="header-anchor" href="#_6-4-ci-脚本里的-首次连接弹-yes-no-怎么破" aria-label="Permalink to &quot;6.4 CI / 脚本里的&quot;首次连接弹 yes/no&quot; 怎么破&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>CI 里要 ssh,但 known_hosts 是空的,弹 yes/no 阻塞构建。</span></span>
<span class="line"><span>错的解法:</span></span>
<span class="line"><span>   StrictHostKeyChecking no   ← 把 MITM 防御关了</span></span>
<span class="line"><span></span></span>
<span class="line"><span>对的解法:</span></span>
<span class="line"><span>   1. ssh-keyscan 提前抓 host key,塞进 image / CI 缓存</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   $ ssh-keyscan -t ed25519 github.com &gt;&gt; ~/.ssh/known_hosts</span></span>
<span class="line"><span>   $ ssh-keyscan -t ed25519 bastion.company.com &gt;&gt; ~/.ssh/known_hosts</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   2. 或把已知的 known_hosts 文件作为 secret / config 注入到 CI</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   3. CI 里:StrictHostKeyChecking yes(因为已经预填)</span></span></code></pre></div><p><strong>GitHub Actions 的官方推荐</strong>就是这套(<code>webfactory/ssh-agent</code> action 内部就是 ssh-keyscan)。</p><h3 id="_6-5-服务器换-host-key-怎么处理" tabindex="-1">6.5 服务器换 host key,怎么处理 <a class="header-anchor" href="#_6-5-服务器换-host-key-怎么处理" aria-label="Permalink to &quot;6.5 服务器换 host key,怎么处理&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>服务器重装系统,host key 重新生成。</span></span>
<span class="line"><span>你 ssh 连过去:</span></span>
<span class="line"><span>   @@@@@ REMOTE HOST IDENTIFICATION HAS CHANGED! @@@@@</span></span>
<span class="line"><span></span></span>
<span class="line"><span>正确处理:</span></span>
<span class="line"><span>   1. 先确认是不是合法重装(问运维 / 看 ticket)</span></span>
<span class="line"><span>   2. 拿到新 fingerprint 的独立来源(运维公示 / wiki)</span></span>
<span class="line"><span>   3. 比对客户端看到的 fingerprint 和官方公示</span></span>
<span class="line"><span>   4. 一致才删旧记录、接受新 host key:</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>      $ ssh-keygen -R old-host         # 删旧记录</span></span>
<span class="line"><span>      $ ssh-keyscan old-host &gt;&gt; ~/.ssh/known_hosts   # 加新记录</span></span>
<span class="line"><span>      或直接 ssh,新 host key 自动接受(走 accept-new)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>错误处理:</span></span>
<span class="line"><span>   ssh-keygen -R old-host;ssh old-host   ← 不核 fingerprint 就接受</span></span>
<span class="line"><span>   = 把&quot;REMOTE HOST IDENTIFICATION HAS CHANGED&quot;的警告当噪音</span></span>
<span class="line"><span>   = 真有 MITM 时也会被忽略</span></span></code></pre></div><hr><h2 id="七、mosh-网络不稳的救星" tabindex="-1">七、mosh:网络不稳的救星 <a class="header-anchor" href="#七、mosh-网络不稳的救星" aria-label="Permalink to &quot;七、mosh:网络不稳的救星&quot;">​</a></h2><h3 id="_7-1-mosh-的设计" tabindex="-1">7.1 mosh 的设计 <a class="header-anchor" href="#_7-1-mosh-的设计" aria-label="Permalink to &quot;7.1 mosh 的设计&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>ssh 的本质                          mosh 的本质</span></span>
<span class="line"><span>─────────────────────────          ──────────────────────────</span></span>
<span class="line"><span>TCP 连接,字符流转发                UDP + SSP(State Synchronization Protocol)</span></span>
<span class="line"><span>每个字符往返一次才显示              本地预测显示,服务端最终确认</span></span>
<span class="line"><span>连接断 = session 死                 客户端 IP 变了 = 漫游,session 不死</span></span>
<span class="line"><span>高延迟 = 卡顿打字                   高延迟 = 本地立刻显示,后台同步</span></span>
<span class="line"><span>不能跨 NAT 重连                     UDP + 滚动 session,Wi-Fi 切了不掉</span></span></code></pre></div><p><strong>两个杀手特性</strong>:</p><ol><li><strong>断网重连不死</strong>:UDP 没有&quot;连接&quot;概念,只要 session token 在,你切 WiFi、过隧道、笔记本合盖再开,session 都活着</li><li><strong>本地回显</strong>:每打一个字立刻显示在本地(预测),服务端确认后修正——<strong>100ms 延迟的链路上,体感和 0 延迟差不多</strong></li></ol><h3 id="_7-2-装法" tabindex="-1">7.2 装法 <a class="header-anchor" href="#_7-2-装法" aria-label="Permalink to &quot;7.2 装法&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>两边都要装(server + client):</span></span>
<span class="line"><span>   server: brew install mosh / apt install mosh</span></span>
<span class="line"><span>   client: brew install mosh / apt install mosh</span></span>
<span class="line"><span></span></span>
<span class="line"><span>server 要开放 UDP 60000-61000(每个 session 用一个 port)</span></span>
<span class="line"><span>   AWS / GCP security group 加规则:UDP 60000-61000</span></span>
<span class="line"><span></span></span>
<span class="line"><span>mosh 内部还是用 ssh 做认证 + 启动 mosh-server:</span></span>
<span class="line"><span>   $ mosh user@host</span></span>
<span class="line"><span>   实际发生:</span></span>
<span class="line"><span>     1. ssh user@host 启动 mosh-server,拿到 token + UDP port</span></span>
<span class="line"><span>     2. ssh 断开</span></span>
<span class="line"><span>     3. 本地 mosh-client 用 UDP + token 和 mosh-server 通信</span></span></code></pre></div><h3 id="_7-3-mosh-的局限" tabindex="-1">7.3 mosh 的局限 <a class="header-anchor" href="#_7-3-mosh-的局限" aria-label="Permalink to &quot;7.3 mosh 的局限&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>不支持:</span></span>
<span class="line"><span>   - 端口转发(-L / -R / -D 全部不支持)</span></span>
<span class="line"><span>   - scp / rsync(它们走 ssh,mosh 不参与)</span></span>
<span class="line"><span>   - X11 forwarding</span></span>
<span class="line"><span>   - ControlMaster</span></span>
<span class="line"><span></span></span>
<span class="line"><span>不支持的原因:mosh 协议是为&quot;交互式终端&quot;设计,不是通用 transport</span></span>
<span class="line"><span></span></span>
<span class="line"><span>所以工作流变成:</span></span>
<span class="line"><span>   - 长时间交互:mosh prod-web</span></span>
<span class="line"><span>   - 端口转发:ssh -fN -L ... (后台跑一个 ssh,只为转发)</span></span>
<span class="line"><span>   - scp / rsync:ssh 跑</span></span></code></pre></div><h3 id="_7-4-什么时候用-mosh" tabindex="-1">7.4 什么时候用 mosh <a class="header-anchor" href="#_7-4-什么时候用-mosh" aria-label="Permalink to &quot;7.4 什么时候用 mosh&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>✓ 火车 / 飞机 / 弱网(机场 4G 抖动)</span></span>
<span class="line"><span>✓ 远程工作 / 笔记本带着走,合盖再开</span></span>
<span class="line"><span>✓ 高延迟链路(中国 → 美国 200ms,本地回显救命)</span></span>
<span class="line"><span>✓ 服务器 ssh 端口经常被防火墙杀连接(UDP 不容易被发现)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>✗ 你公司服务器 sshd 配置不让装第三方 / UDP 不通</span></span>
<span class="line"><span>✗ 严重审计场景(mosh 不被某些堡垒机集成)</span></span>
<span class="line"><span>✗ 一次性短任务(开 mosh-server 比 ssh 重)</span></span></code></pre></div><h3 id="_7-5-sshfs-挂载远端文件-顺带提" tabindex="-1">7.5 sshfs:挂载远端文件(顺带提) <a class="header-anchor" href="#_7-5-sshfs-挂载远端文件-顺带提" aria-label="Permalink to &quot;7.5 sshfs:挂载远端文件(顺带提)&quot;">​</a></h3><p><strong>sshfs = ssh + FUSE filesystem</strong>——把远端目录挂成本地目录,本地 <code>ls</code> / <code>vim</code> 看起来在本地,实际所有读写都通过 ssh。</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> apt</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> install</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> sshfs</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                              # Linux 装</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">mkdir</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ~/remote-server</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sshfs</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> user@host:/var/log</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ~/remote-server</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">            # 挂载</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">ls</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ~/remote-server</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                                  # 实际读远端 /var/log</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">vim</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ~/remote-server/app.log</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                         # 实际编辑远端</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">fusermount</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -u</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ~/remote-server</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                       # Linux 卸载</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">umount</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ~/remote-server</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                              # macOS 卸载</span></span></code></pre></div><p><strong>macOS 的痛</strong>:sshfs 依赖 FUSE,macOS 没自带要装 macFUSE。<strong>macFUSE 需要 kernel extension</strong>——Apple 自 macOS 11+ 加大 kext 限制,装要 Recovery 模式放开签名验证,M 系列 Mac 要把 kext 信任改成 &quot;Reduced Security&quot; <strong>降级整机安全等级</strong>。<strong>99% 工程师装一次就放弃</strong>。</p><p><strong>性能局限</strong>:适合<strong>偶尔编辑几个配置 / 浏览目录</strong>,不适合<strong>IDE 索引</strong>(每个文件 stat 一次,RTT 累计成几分钟)、<strong>大目录 ls</strong>、<strong>写入密集型</strong>。</p><p><strong>替代方案</strong>(都比 sshfs 强):</p><ul><li><strong>VS Code Remote / Cursor Remote</strong>——通过 ssh 直接编辑远端,有 indexer 协议,<strong>性能好一个量级</strong></li><li><strong>rsync 双向同步</strong>(见 11 节)——本地编辑 rsync 推上去</li><li><strong>JetBrains Gateway</strong>——JetBrains 的 Remote 方案</li></ul><p><strong>结论</strong>:Linux 上还能用 sshfs 凑合,<strong>macOS 上建议跳过</strong>直接上 VS Code Remote。</p><hr><h2 id="八、跳板机模式工程" tabindex="-1">八、跳板机模式工程 <a class="header-anchor" href="#八、跳板机模式工程" aria-label="Permalink to &quot;八、跳板机模式工程&quot;">​</a></h2><h3 id="_8-1-标准跳板机架构" tabindex="-1">8.1 标准跳板机架构 <a class="header-anchor" href="#_8-1-标准跳板机架构" aria-label="Permalink to &quot;8.1 标准跳板机架构&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌─────────────┐</span></span>
<span class="line"><span>│  你的笔记本  │</span></span>
<span class="line"><span>│ + 公司 SSO   │</span></span>
<span class="line"><span>└──────┬──────┘</span></span>
<span class="line"><span>       │ ssh + SSO 双因素(或 hardware key)</span></span>
<span class="line"><span>       ▼</span></span>
<span class="line"><span>┌─────────────────────────────────────┐</span></span>
<span class="line"><span>│         bastion(跳板机)            │</span></span>
<span class="line"><span>│  - 唯一公网入口                      │</span></span>
<span class="line"><span>│  - SSO 强制(LDAP / Okta / Google)  │</span></span>
<span class="line"><span>│  - 所有 session 录像(asciinema)    │</span></span>
<span class="line"><span>│  - 短时凭证(每 8 小时刷新)         │</span></span>
<span class="line"><span>└──────┬──────────────────────────────┘</span></span>
<span class="line"><span>       │ 内网,key 认证</span></span>
<span class="line"><span>       ▼</span></span>
<span class="line"><span>┌─────────────────────────────────────┐</span></span>
<span class="line"><span>│        prod-web / prod-db / ...      │</span></span>
<span class="line"><span>│  - 只允许 from bastion 的内网 IP    │</span></span>
<span class="line"><span>│  - 不开公网                          │</span></span>
<span class="line"><span>└─────────────────────────────────────┘</span></span></code></pre></div><h3 id="_8-2-client-侧-一行-proxyjump-覆盖" tabindex="-1">8.2 client 侧:一行 <code>ProxyJump</code> 覆盖 <a class="header-anchor" href="#_8-2-client-侧-一行-proxyjump-覆盖" aria-label="Permalink to &quot;8.2 client 侧:一行 \`ProxyJump\` 覆盖&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Host bastion</span></span>
<span class="line"><span>    HostName    bastion.company.com</span></span>
<span class="line"><span>    User        ops</span></span>
<span class="line"><span>    IdentityFile ~/.ssh/id_ed25519_company</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Host prod-*</span></span>
<span class="line"><span>    ProxyJump   bastion</span></span>
<span class="line"><span>    User        ops</span></span>
<span class="line"><span>    IdentityFile ~/.ssh/id_ed25519_company</span></span></code></pre></div><p>新机器加入,只加一行 <code>Host prod-newbox / HostName 10.x.x.x</code>——<strong>ProxyJump 自动继承</strong>。</p><h3 id="_8-3-server-侧-bastion-的硬性约束" tabindex="-1">8.3 server 侧:bastion 的硬性约束 <a class="header-anchor" href="#_8-3-server-侧-bastion-的硬性约束" aria-label="Permalink to &quot;8.3 server 侧:bastion 的硬性约束&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>/etc/ssh/sshd_config:</span></span>
<span class="line"><span>   PermitRootLogin            no</span></span>
<span class="line"><span>   PasswordAuthentication     no               # 强制 key</span></span>
<span class="line"><span>   PubkeyAuthentication       yes</span></span>
<span class="line"><span>   AuthorizedKeysFile         /etc/ssh/authorized_keys/%u   # 集中管理,不放用户 home</span></span>
<span class="line"><span>   AllowAgentForwarding       no               # 禁止 agent 转发(避免 key 链式攻击)</span></span>
<span class="line"><span>   MaxSessions                10</span></span>
<span class="line"><span>   MaxAuthTries               3</span></span>
<span class="line"><span>   LoginGraceTime             30</span></span>
<span class="line"><span>   ClientAliveInterval        300</span></span>
<span class="line"><span>   AllowUsers                 ops</span></span></code></pre></div><p><strong>bastion 的核心是&quot;不让 key 沉淀在它身上&quot;</strong>——</p><ul><li>用户 key 通过 ProxyJump 协议通道转发(不在 bastion 落地)</li><li>用户在 bastion 上不能开 agent 转发</li><li>用户在 bastion 上不能存自己的 private key</li></ul><h3 id="_8-4-审计-session-录像" tabindex="-1">8.4 审计:session 录像 <a class="header-anchor" href="#_8-4-审计-session-录像" aria-label="Permalink to &quot;8.4 审计:session 录像&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>bastion 上每个 session 启动时自动录制:</span></span>
<span class="line"><span>   - asciinema rec /var/log/sessions/$(date +%s)_$USER.cast</span></span>
<span class="line"><span>   - 或商业方案:Teleport / Boundary</span></span>
<span class="line"><span></span></span>
<span class="line"><span>回放:</span></span>
<span class="line"><span>   $ asciinema play /var/log/sessions/xxx.cast</span></span>
<span class="line"><span></span></span>
<span class="line"><span>事故复盘 / 合规审计的硬通货——&quot;你 02:30 进了 prod-db,做了什么&quot;。</span></span></code></pre></div><hr><h2 id="九、agent-forwarding-的安全坑" tabindex="-1">九、agent forwarding 的安全坑 <a class="header-anchor" href="#九、agent-forwarding-的安全坑" aria-label="Permalink to &quot;九、agent forwarding 的安全坑&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>ForwardAgent yes 看起来很方便:</span></span>
<span class="line"><span>   你 ssh bastion,然后在 bastion 上 git clone(用你的 key)</span></span>
<span class="line"><span>   不用再把 key 放到 bastion 上</span></span>
<span class="line"><span></span></span>
<span class="line"><span>实际上:</span></span>
<span class="line"><span>   你 ssh bastion 时,bastion 上的 sshd 进程能通过 $SSH_AUTH_SOCK</span></span>
<span class="line"><span>   反过来访问你本地的 agent,签任何东西</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   如果 bastion 被入侵 → 攻击者拿你的 agent 签名 → 横向打到所有 host</span></span>
<span class="line"><span></span></span>
<span class="line"><span>正确做法:</span></span>
<span class="line"><span>   1. 默认 ForwardAgent no(本文 §2.3 兜底已经写了)</span></span>
<span class="line"><span>   2. 真要在 bastion 上用 git,改用 ProxyJump:</span></span>
<span class="line"><span>      git clone git@github-via-bastion:org/repo.git</span></span>
<span class="line"><span>      其中 Host github-via-bastion 走 ProxyJump bastion</span></span>
<span class="line"><span>      认证用本地 agent,bastion 只做 transport</span></span>
<span class="line"><span>   3. 如必须 -A,只对特定可信 host 段开</span></span></code></pre></div><p><strong>ProxyJump 出现之后,90% 的 agent forwarding 场景都被替代了</strong>——它是更安全的方案。</p><hr><h2 id="十、替代-ssh-的现代方案" tabindex="-1">十、替代 ssh 的现代方案 <a class="header-anchor" href="#十、替代-ssh-的现代方案" aria-label="Permalink to &quot;十、替代 ssh 的现代方案&quot;">​</a></h2><p>ssh 35 岁了。在云原生 / 零信任时代,一些场景出现了更好的方案——不是说 ssh 该死,而是<strong>在某些子场景里,新工具能省掉你写 ssh config 的 80% 工作</strong>。</p><h3 id="_10-1-选型对照表" tabindex="-1">10.1 选型对照表 <a class="header-anchor" href="#_10-1-选型对照表" aria-label="Permalink to &quot;10.1 选型对照表&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌────────────────────┬─────────────────┬──────────────────────┐</span></span>
<span class="line"><span>│      方案          │     强在哪      │     弱在哪 / 不适合   │</span></span>
<span class="line"><span>├────────────────────┼─────────────────┼──────────────────────┤</span></span>
<span class="line"><span>│ ssh + bastion      │ 任何平台 / 通用 │ 配置 / 跳板心智成本   │</span></span>
<span class="line"><span>│  (本文核心)        │ Linux 原生支持   │ key 管理重           │</span></span>
<span class="line"><span>├────────────────────┼─────────────────┼──────────────────────┤</span></span>
<span class="line"><span>│ Tailscale SSH      │ 基于 WireGuard   │ 锁 Tailscale 生态    │</span></span>
<span class="line"><span>│                    │ 零 key 管理      │ 控制平面是 Tailscale │</span></span>
<span class="line"><span>│                    │ 跨子网穿透       │  (虽然有 Headscale)  │</span></span>
<span class="line"><span>├────────────────────┼─────────────────┼──────────────────────┤</span></span>
<span class="line"><span>│ AWS SSM Session    │ 完全无 SSH 端口  │ 只 AWS 内             │</span></span>
<span class="line"><span>│  Manager           │ IAM 控权 + 审计   │ 体验比 ssh 慢        │</span></span>
<span class="line"><span>│                    │ Bastion 都不需   │ 转发功能弱            │</span></span>
<span class="line"><span>├────────────────────┼─────────────────┼──────────────────────┤</span></span>
<span class="line"><span>│ Cloudflare Tunnel  │ 内网不开公网口   │ 锁 Cloudflare        │</span></span>
<span class="line"><span>│  + Access          │ 零信任策略       │ 走 cloudflared 代理  │</span></span>
<span class="line"><span>├────────────────────┼─────────────────┼──────────────────────┤</span></span>
<span class="line"><span>│ Teleport           │ 企业级审计       │ 重,自部署 / 商业版   │</span></span>
<span class="line"><span>│                    │ 多协议(ssh /    │ 团队 &lt; 30 人不划算    │</span></span>
<span class="line"><span>│                    │  k8s / db)       │                       │</span></span>
<span class="line"><span>└────────────────────┴─────────────────┴──────────────────────┘</span></span></code></pre></div><h3 id="_10-2-tailscale-ssh-wireguard-mesh" tabindex="-1">10.2 Tailscale SSH(WireGuard mesh) <a class="header-anchor" href="#_10-2-tailscale-ssh-wireguard-mesh" aria-label="Permalink to &quot;10.2 Tailscale SSH(WireGuard mesh)&quot;">​</a></h3><p><strong>核心点子</strong>:每台机器装 Tailscale,自动组成 mesh 网络,所有机器互相直连(用 WireGuard 协议),<strong>用 Tailscale 的身份(基于 SSO)替代 ssh key</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>传统:</span></span>
<span class="line"><span>   key 管理 + bastion + ProxyJump = 一套复杂工程</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Tailscale SSH:</span></span>
<span class="line"><span>   tailscale up         # 每台机器装,SSO 登录</span></span>
<span class="line"><span>   tailscale ssh prod   # 直接连,身份是 SSO 用户</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   - 不需要 key</span></span>
<span class="line"><span>   - 不需要公网入口</span></span>
<span class="line"><span>   - SSO 撤销 = 立刻断</span></span>
<span class="line"><span>   - WireGuard 比 ssh 加密快</span></span></code></pre></div><p><strong>适合</strong>:小团队、AI 公司、远程团队、不想自建 bastion。</p><p><strong>不适合</strong>:大企业(合规要求自控控制平面,虽然 Headscale 可以自部署)、跨多个云的复杂网络。</p><h3 id="_10-3-aws-ssm-session-manager" tabindex="-1">10.3 AWS SSM Session Manager <a class="header-anchor" href="#_10-3-aws-ssm-session-manager" aria-label="Permalink to &quot;10.3 AWS SSM Session Manager&quot;">​</a></h3><p><strong>核心点子</strong>:EC2 不开 22 端口,通过 AWS API + IAM 来连——<strong>纯走 AWS 控制平面,EC2 完全私有</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>$ aws ssm start-session --target i-0123456789abcdef</span></span>
<span class="line"><span>进入 EC2 shell。</span></span>
<span class="line"><span>没有 ssh,没有 key,没有 port 22。</span></span>
<span class="line"><span>IAM policy 控制谁能连哪台,审计走 CloudTrail。</span></span></code></pre></div><p><strong>ssh config 集成</strong>(让 <code>ssh i-0123456789abcdef</code> 走 SSM):</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Host i-* mi-*</span></span>
<span class="line"><span>    ProxyCommand sh -c &quot;aws ssm start-session --target %h \\</span></span>
<span class="line"><span>        --document-name AWS-StartSSHSession --parameters portNumber=%p&quot;</span></span></code></pre></div><p><strong>适合</strong>:全 AWS、合规严格、不想暴露 22 端口。 <strong>不适合</strong>:多云、需要复杂端口转发(SSM 的转发体验不如 ssh)。</p><h3 id="_10-4-cloudflare-tunnel-cloudflare-access" tabindex="-1">10.4 Cloudflare Tunnel + Cloudflare Access <a class="header-anchor" href="#_10-4-cloudflare-tunnel-cloudflare-access" aria-label="Permalink to &quot;10.4 Cloudflare Tunnel + Cloudflare Access&quot;">​</a></h3><p><strong>核心点子</strong>:内网服务用 cloudflared 主动出网到 Cloudflare,<strong>不开任何入网口</strong>;用户连接走 Cloudflare(认证 + 零信任策略),Cloudflare 把流量转给隧道。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>内网机器:</span></span>
<span class="line"><span>   cloudflared tunnel run mytunnel</span></span>
<span class="line"><span></span></span>
<span class="line"><span>用户:</span></span>
<span class="line"><span>   cloudflared access ssh --hostname server.example.com</span></span>
<span class="line"><span>   或:ssh ProxyCommand 调 cloudflared</span></span>
<span class="line"><span></span></span>
<span class="line"><span>特点:</span></span>
<span class="line"><span>   - 内网零入网口(纯出网)</span></span>
<span class="line"><span>   - Cloudflare Access 集成 Okta / Google SSO</span></span>
<span class="line"><span>   - 无固定 IP 也能暴露服务</span></span></code></pre></div><p><strong>适合</strong>:动态 IP / 家庭服务器 / 没固定网关、需要零信任。</p><h3 id="_10-5-teleport" tabindex="-1">10.5 Teleport <a class="header-anchor" href="#_10-5-teleport" aria-label="Permalink to &quot;10.5 Teleport&quot;">​</a></h3><p>企业级 ssh + database access + Kubernetes + audit 的统一方案。<strong>小团队不划算</strong>(部署复杂、运维重),<strong>大企业值得</strong>(把&quot;跳板机 + 审计&quot;做成一个产品)。</p><h3 id="_10-6-怎么选" tabindex="-1">10.6 怎么选 <a class="header-anchor" href="#_10-6-怎么选" aria-label="Permalink to &quot;10.6 怎么选&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1-3 人小团队 / 个人项目        → ssh + 一行 Tailscale</span></span>
<span class="line"><span>                                  (Tailscale 比 bastion 便宜得多)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>10-30 人,中型团队             → ssh + bastion + ProxyJump</span></span>
<span class="line"><span>                                  (本文模式,可控、便宜)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>全 AWS / 严格合规              → ssh + SSM Session Manager</span></span>
<span class="line"><span>                                  (干掉 22 端口的烦恼)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>需要内网零入网口              → Cloudflare Tunnel + Access</span></span>
<span class="line"><span>                                  (尤其家庭 lab / 动态 IP)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>50+ 人企业 / 合规重            → Teleport</span></span>
<span class="line"><span>                                  (一套统一审计 / 凭证管理)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>跨多个云                       → ssh + bastion(基础设施中立)</span></span>
<span class="line"><span>                                  + Tailscale(机器互通)</span></span></code></pre></div><p><strong>这一节的核心</strong>:<strong>ssh 不是非用不可,但放弃 ssh 之前要清楚自己换到了什么</strong>——多数替代品是把&quot;自己写 config&quot;换成了&quot;绑定某个供应商的 SaaS&quot;,代价不同。</p><hr><h2 id="十一、scp-sftp-rsync-文件传输三件套" tabindex="-1">十一、scp / sftp / rsync:文件传输三件套 <a class="header-anchor" href="#十一、scp-sftp-rsync-文件传输三件套" aria-label="Permalink to &quot;十一、scp / sftp / rsync:文件传输三件套&quot;">​</a></h2><h3 id="_11-1-scp-已过时-但仍在用" tabindex="-1">11.1 scp 已过时,但仍在用 <a class="header-anchor" href="#_11-1-scp-已过时-但仍在用" aria-label="Permalink to &quot;11.1 scp 已过时,但仍在用&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>传统:</span></span>
<span class="line"><span>   $ scp file user@host:/path/</span></span>
<span class="line"><span>   $ scp -r dir user@host:/path/</span></span>
<span class="line"><span>   $ scp user@host:/remote/file ./</span></span>
<span class="line"><span></span></span>
<span class="line"><span>为什么过时:</span></span>
<span class="line"><span>   - OpenSSH 8.0(2019)文档明确说 scp 协议陈旧、易出非预期行为</span></span>
<span class="line"><span>   - 不支持增量传输(改动一个字节也全文重传)</span></span>
<span class="line"><span>   - 不支持 resume(传到一半断 = 重头来)</span></span>
<span class="line"><span>   - 通配符行为反直觉</span></span>
<span class="line"><span></span></span>
<span class="line"><span>但还活着:</span></span>
<span class="line"><span>   - 简单一次性传:还用</span></span>
<span class="line"><span>   - OpenSSH 9.0+ 已经把 scp 底层换成 sftp 协议(scp -O 用旧协议)</span></span></code></pre></div><h3 id="_11-2-sftp-交互式-脚本化" tabindex="-1">11.2 sftp:交互式 + 脚本化 <a class="header-anchor" href="#_11-2-sftp-交互式-脚本化" aria-label="Permalink to &quot;11.2 sftp:交互式 + 脚本化&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>$ sftp user@host</span></span>
<span class="line"><span>sftp&gt; ls</span></span>
<span class="line"><span>sftp&gt; get file</span></span>
<span class="line"><span>sftp&gt; put localfile</span></span>
<span class="line"><span>sftp&gt; mkdir new</span></span>
<span class="line"><span>sftp&gt; exit</span></span>
<span class="line"><span></span></span>
<span class="line"><span>或脚本化:</span></span>
<span class="line"><span>$ sftp user@host &lt;&lt;EOF</span></span>
<span class="line"><span>   put file</span></span>
<span class="line"><span>   ls /remote/</span></span>
<span class="line"><span>EOF</span></span>
<span class="line"><span></span></span>
<span class="line"><span>GUI 客户端(Cyberduck / Transmit)走的也是 sftp 协议</span></span></code></pre></div><h3 id="_11-3-rsync-over-ssh-推荐默认" tabindex="-1">11.3 rsync over ssh:推荐默认 <a class="header-anchor" href="#_11-3-rsync-over-ssh-推荐默认" aria-label="Permalink to &quot;11.3 rsync over ssh:推荐默认&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>$ rsync -av --progress src/ user@host:/dest/</span></span>
<span class="line"><span>     ↑       ↑</span></span>
<span class="line"><span>     │       进度条</span></span>
<span class="line"><span>     archive 模式:递归 + 保留权限 / 时间 / 链接</span></span>
<span class="line"><span></span></span>
<span class="line"><span>特性:</span></span>
<span class="line"><span>   - 增量传输(只传变化的部分)</span></span>
<span class="line"><span>   - 断点续传(--partial)</span></span>
<span class="line"><span>   - 删除目标侧不存在于源的文件(--delete,慎用)</span></span>
<span class="line"><span>   - 排除模式(--exclude=&#39;*.pyc&#39;)</span></span>
<span class="line"><span>   - 走 ssh,自动用你 ~/.ssh/config 的 host 名</span></span>
<span class="line"><span></span></span>
<span class="line"><span>实战:</span></span>
<span class="line"><span>   # 本地同步到 prod</span></span>
<span class="line"><span>   rsync -avh --progress --delete \\</span></span>
<span class="line"><span>         --exclude=&#39;node_modules/&#39; --exclude=&#39;.git/&#39; \\</span></span>
<span class="line"><span>         ./build/ prod-web:/var/www/site/</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   # 大目录 + 网络抖,加 partial + resume</span></span>
<span class="line"><span>   rsync -avh --partial --progress \\</span></span>
<span class="line"><span>         /local/huge/ devbox:/data/huge/</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   # 拷完删源(典型 dump 上传场景)</span></span>
<span class="line"><span>   rsync -avh --remove-source-files /tmp/dump/ archive:/backup/</span></span></code></pre></div><p><strong>经验法则</strong>:<strong>任何 <code>scp -r</code> 的场景换成 <code>rsync -avh</code>,只赚不亏</strong>——多打 5 个字符,换增量 + 进度 + 续传。</p><hr><h2 id="十二、常见陷阱速查" tabindex="-1">十二、常见陷阱速查 <a class="header-anchor" href="#十二、常见陷阱速查" aria-label="Permalink to &quot;十二、常见陷阱速查&quot;">​</a></h2><h3 id="_12-1-文件权限" tabindex="-1">12.1 文件权限 <a class="header-anchor" href="#_12-1-文件权限" aria-label="Permalink to &quot;12.1 文件权限&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>$ ssh devbox</span></span>
<span class="line"><span>@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@</span></span>
<span class="line"><span>@         WARNING: UNPROTECTED PRIVATE KEY FILE!          @</span></span>
<span class="line"><span>@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@</span></span>
<span class="line"><span>Permissions 0644 for &#39;~/.ssh/id_ed25519&#39; are too open.</span></span>
<span class="line"><span></span></span>
<span class="line"><span>修复:</span></span>
<span class="line"><span>   chmod 700 ~/.ssh</span></span>
<span class="line"><span>   chmod 600 ~/.ssh/id_ed25519</span></span>
<span class="line"><span>   chmod 644 ~/.ssh/id_ed25519.pub</span></span>
<span class="line"><span>   chmod 600 ~/.ssh/config</span></span>
<span class="line"><span>   chmod 600 ~/.ssh/known_hosts</span></span></code></pre></div><h3 id="_12-2-term-不对-vim-颜色坏" tabindex="-1">12.2 TERM 不对,vim 颜色坏 <a class="header-anchor" href="#_12-2-term-不对-vim-颜色坏" aria-label="Permalink to &quot;12.2 TERM 不对,vim 颜色坏&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>$ ssh devbox</span></span>
<span class="line"><span>$ vim file.py</span></span>
<span class="line"><span>   颜色全错,Tab 显示成奇怪字符</span></span>
<span class="line"><span></span></span>
<span class="line"><span>原因:终端模拟器 TERM=xterm-256color,但 ssh 传到远端</span></span>
<span class="line"><span>      远端没这个 terminfo 条目,降级到 vt100</span></span>
<span class="line"><span></span></span>
<span class="line"><span>修复:</span></span>
<span class="line"><span>   ~/.ssh/config 加:SetEnv TERM=xterm-256color</span></span>
<span class="line"><span>   或 server 上:tic -x &lt;terminfo&gt;(安装缺的 terminfo)</span></span>
<span class="line"><span>   或本地终端模拟器换 TERM=screen-256color(更兼容)</span></span></code></pre></div><h3 id="_12-3-agent-里-key-太多-服务器拒绝" tabindex="-1">12.3 agent 里 key 太多,服务器拒绝 <a class="header-anchor" href="#_12-3-agent-里-key-太多-服务器拒绝" aria-label="Permalink to &quot;12.3 agent 里 key 太多,服务器拒绝&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>$ ssh prod-host</span></span>
<span class="line"><span>Received disconnect: Too many authentication failures</span></span>
<span class="line"><span></span></span>
<span class="line"><span>原因:agent 有 10 把 key,ssh 默认全部尝试</span></span>
<span class="line"><span>      服务器 MaxAuthTries 3,前 3 把不对就被踢</span></span>
<span class="line"><span></span></span>
<span class="line"><span>修复:</span></span>
<span class="line"><span>   IdentitiesOnly yes(配合 IdentityFile 指定那一把)</span></span></code></pre></div><h3 id="_12-4-网络中断后僵尸-session" tabindex="-1">12.4 网络中断后僵尸 session <a class="header-anchor" href="#_12-4-网络中断后僵尸-session" aria-label="Permalink to &quot;12.4 网络中断后僵尸 session&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>你 ssh 进 devbox,合上笔记本走了</span></span>
<span class="line"><span>打开笔记本:ssh 还卡在那,但其实早断了</span></span>
<span class="line"><span>半小时后才显示&quot;Connection closed&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>修复:全局兜底加:</span></span>
<span class="line"><span>   ServerAliveInterval 60         # 每 60 秒探活一次</span></span>
<span class="line"><span>   ServerAliveCountMax 3          # 3 次失败(180 秒)主动断开</span></span></code></pre></div><h3 id="_12-5-ssh-启动慢-gssapi-拖时间" tabindex="-1">12.5 ssh 启动慢(GSSAPI 拖时间) <a class="header-anchor" href="#_12-5-ssh-启动慢-gssapi-拖时间" aria-label="Permalink to &quot;12.5 ssh 启动慢(GSSAPI 拖时间)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>$ ssh user@host</span></span>
<span class="line"><span>... 5 秒后才看到密码提示 ...</span></span>
<span class="line"><span></span></span>
<span class="line"><span>原因:client 尝试 GSSAPI / Kerberos,DNS 反查超时</span></span>
<span class="line"><span></span></span>
<span class="line"><span>修复:</span></span>
<span class="line"><span>   GSSAPIAuthentication no</span></span>
<span class="line"><span>   或服务器侧 sshd_config:UseDNS no</span></span></code></pre></div><h3 id="_12-6-sshd-config-改了不生效" tabindex="-1">12.6 sshd_config 改了不生效 <a class="header-anchor" href="#_12-6-sshd-config-改了不生效" aria-label="Permalink to &quot;12.6 sshd_config 改了不生效&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>你改了 sshd_config,但 sshd 还是旧行为。</span></span>
<span class="line"><span></span></span>
<span class="line"><span>原因:没重启 sshd 或没 reload</span></span>
<span class="line"><span></span></span>
<span class="line"><span>修复:</span></span>
<span class="line"><span>   sudo systemctl reload sshd</span></span>
<span class="line"><span>   或:sudo systemctl restart sshd</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   ★ 重启前先开第二个 ssh 连接备份 ★</span></span>
<span class="line"><span>   万一新配置打错,你还有一条活的连接能修</span></span></code></pre></div><h3 id="_12-7-proxyjump-走不通" tabindex="-1">12.7 ProxyJump 走不通 <a class="header-anchor" href="#_12-7-proxyjump-走不通" aria-label="Permalink to &quot;12.7 ProxyJump 走不通&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>$ ssh -J bastion target</span></span>
<span class="line"><span>target: Host key verification failed for &quot;target&quot; via jumphost.</span></span>
<span class="line"><span></span></span>
<span class="line"><span>原因:client 没见过 target 的 host key</span></span>
<span class="line"><span>      ProxyJump 模式下,host key 验证还是 client ↔ target 直接做</span></span>
<span class="line"><span>      不会通过 bastion 代理</span></span>
<span class="line"><span></span></span>
<span class="line"><span>修复:</span></span>
<span class="line"><span>   ssh-keyscan target &gt;&gt; ~/.ssh/known_hosts(本地预灌)</span></span>
<span class="line"><span>   或第一次连接走 accept-new(全局兜底已经写了)</span></span></code></pre></div><hr><h2 id="十三、反对的写法" tabindex="-1">十三、反对的写法 <a class="header-anchor" href="#十三、反对的写法" aria-label="Permalink to &quot;十三、反对的写法&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>✗ 同一个私钥跑遍所有服务</span></span>
<span class="line"><span>  → 每个用途一把 key,丢一把不慌</span></span>
<span class="line"><span>  → ~/.ssh/id_ed25519_personal / _company / _aws_prod / _aws_test</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>✗ 私钥进 git 仓库</span></span>
<span class="line"><span>  → 私钥永远不进任何仓库,包括 private repo</span></span>
<span class="line"><span>  → 公钥(.pub)可以进</span></span>
<span class="line"><span>  → 团队共享私钥 = 没有共享,等于公开</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>✗ 用 password authentication</span></span>
<span class="line"><span>  → 永远禁用,改用 key</span></span>
<span class="line"><span>  → /etc/ssh/sshd_config: PasswordAuthentication no</span></span>
<span class="line"><span>  → 即使你觉得密码 24 位也够强,brute force 会让你成为日志噪音源</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>✗ StrictHostKeyChecking no</span></span>
<span class="line"><span>  → 中间人攻击门户大开</span></span>
<span class="line"><span>  → CI 里改用 ssh-keyscan 预填 known_hosts + StrictHostKeyChecking yes</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>✗ 把 22 端口暴露公网</span></span>
<span class="line"><span>  → bastion 之外的机器不要开 22 给公网</span></span>
<span class="line"><span>  → 哪怕暴露,也加 fail2ban / sshguard 防暴力扫描</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>✗ root 直接登录</span></span>
<span class="line"><span>  → PermitRootLogin no</span></span>
<span class="line"><span>  → 用普通账户 + sudo,审计日志能区分谁干的</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>✗ 不用 ssh-agent / 不用 Keychain</span></span>
<span class="line"><span>  → 要么没 passphrase(私钥裸奔),要么每次输(被迫用空 passphrase)</span></span>
<span class="line"><span>  → 必装 agent + Keychain / 1Password,passphrase 输一次</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>✗ ssh -A 默认开</span></span>
<span class="line"><span>  → ForwardAgent yes 全局默认 = bastion 入侵就横扫</span></span>
<span class="line"><span>  → 默认 no,只对可信 host 段单独开</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>✗ 把 ssh key 拷到每台机器的 ~/.ssh/</span></span>
<span class="line"><span>  → 你以为你在&quot;省事&quot;,实际在散布私钥</span></span>
<span class="line"><span>  → 永远只在你笔记本上有私钥,远端通过 ProxyJump 代理签名</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>✗ 用 scp 同步大目录</span></span>
<span class="line"><span>  → 改 rsync -avh --progress,增量 + 续传 + 进度,只赚不亏</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>✗ 在远端机器上 git clone(把 key 落到远端)</span></span>
<span class="line"><span>  → 永远在本地 git clone,然后 rsync 同步过去</span></span>
<span class="line"><span>  → 或用 ProxyJump 让远端的 git 走本地 agent 签名</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>✗ 把 ~/.ssh/config 当随便丢的草稿,不纳入 dotfiles</span></span>
<span class="line"><span>  → 这份文件每行都是你的工程资产</span></span>
<span class="line"><span>  → chezmoi / yadm 纳管,新机器一行同步</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>✗ 不设 ServerAliveInterval</span></span>
<span class="line"><span>  → 网络一抖就丢 session,vim 半小时白干</span></span>
<span class="line"><span>  → 60 / 3 是 2026 的默认配置</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>✗ 不用 ControlMaster</span></span>
<span class="line"><span>  → tmux 6 个 pane 同时 ssh = 6 次完整握手 = 10 秒抖动</span></span>
<span class="line"><span>  → ControlMaster auto + ControlPersist 10m 是 2026 默认</span></span></code></pre></div><hr><h2 id="十四、看完这一篇你应该能" tabindex="-1">十四、看完这一篇你应该能 <a class="header-anchor" href="#十四、看完这一篇你应该能" aria-label="Permalink to &quot;十四、看完这一篇你应该能&quot;">​</a></h2><ul><li><strong>写出一份生产可用的 70 行 <code>~/.ssh/config</code></strong>——带 ControlMaster、AddKeysToAgent、UseKeychain(macOS)、HashKnownHosts、accept-new、ProxyJump、SetEnv,每一行都讲得清楚为什么</li><li><strong>解释 ssh 三种端口转发(<code>-L</code> / <code>-R</code> / <code>-D</code>)的方向和典型场景</strong>——能在白板上画 ASCII 图,不查文档</li><li><strong>设计一个 bastion 模式</strong>——client 侧一行 <code>ProxyJump bastion</code> 覆盖所有 prod-*;server 侧 sshd_config 的硬性约束(禁 root、禁密码、禁 agent forward、强制 key、session 录像)</li><li><strong>完成一次密钥管理改造</strong>——把 RSA 2048 换成 ed25519,按用途拆 key,接上 ssh-agent + Keychain 或 1Password,做到&quot;私钥不裸奔、新机器迁移有路径&quot;</li><li><strong>判断什么时候用 ssh、什么时候用 Tailscale / SSM / Cloudflare / Teleport</strong>——用第十节的选型表能给团队定一份&quot;远程访问标准&quot;</li><li><strong>用 rsync 替换 scp</strong>,理解为什么 <code>rsync -avh --progress --partial</code> 是默认姿势</li><li><strong>避开本文第十三节的 14 条反对写法</strong>——这些每条都是事故源</li><li><strong>给团队新人写一份「ssh 上手 checklist」</strong>:5 分钟生 key、10 分钟改 config、5 分钟测 ProxyJump、5 分钟测 LocalForward,30 分钟内能 <code>ssh prod-db</code> 干活</li></ul><hr><h2 id="十五、下一篇预告" tabindex="-1">十五、下一篇预告 <a class="header-anchor" href="#十五、下一篇预告" aria-label="Permalink to &quot;十五、下一篇预告&quot;">​</a></h2><p>下一篇:<strong><code>16-tmux心智.md</code></strong>——进入 multiplexer 层。这一篇讲了「<strong>你和远端的关系</strong>」,下一篇讲「<strong>你在远端的工作台</strong>」。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>ssh 进去之后,你下一个问题就是:</span></span>
<span class="line"><span>   - 任务跑一半,我要离开,session 怎么不死?</span></span>
<span class="line"><span>   - 我要同时开 5 个 shell 看不同的东西,怎么不开 5 个 ssh?</span></span>
<span class="line"><span>   - Claude Code 跑 4 小时长任务,我电脑炸了它还在吗?</span></span>
<span class="line"><span>   - 一台 devbox 上,我和同事能不能共享一个 session?</span></span>
<span class="line"><span></span></span>
<span class="line"><span>tmux 就是回答这一切的工具——session / window / pane 三层心智,</span></span>
<span class="line"><span>detach / attach 解决&quot;任务挂在远端&quot;的问题,</span></span>
<span class="line"><span>和 ssh 配起来:ssh devbox 进去,tmux a 接上你昨天没干完的活,</span></span>
<span class="line"><span>笔记本合盖、网络断、电脑炸都不影响——</span></span>
<span class="line"><span>这就是&quot;工作流和单台机器解耦&quot;的工程实现。</span></span></code></pre></div><p>看完 16-17 两篇,你的工作模式会发生质变——<strong>你不再是&quot;ssh 进去敲命令的人&quot;,你是&quot;长期挂在远端的工作台,本地只是接入终端&quot;</strong>。配合本文的 ssh 工程化,<strong>你换机器、换网络、换地点都不影响你的工作流</strong>。</p><p><code>ssh</code> 是&quot;跨过去&quot;,<code>tmux</code> 是&quot;过去之后住下来&quot;——这两个加起来,才是远程工作的最小可行基建。</p>`,223)])])}const k=a(e,[["render",l]]);export{g as __pageData,k as default};
