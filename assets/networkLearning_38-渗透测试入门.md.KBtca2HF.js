import{c as a,Q as n,j as p,m as i}from"./chunks/framework.CBiVa4O3.js";const d=JSON.parse('{"title":"渗透测试入门","description":"","frontmatter":{},"headers":[],"relativePath":"../networkLearning/38-渗透测试入门.md","filePath":"../networkLearning/38-渗透测试入门.md","lastUpdated":1778496697000}'),l={name:"../networkLearning/38-渗透测试入门.md"};function t(e,s,h,r,o,c){return n(),p("div",null,[...s[0]||(s[0]=[i(`<h1 id="渗透测试入门" tabindex="-1">渗透测试入门 <a class="header-anchor" href="#渗透测试入门" aria-label="Permalink to &quot;渗透测试入门&quot;">​</a></h1><p>「最好的防御工程师必须懂攻击」——但<strong>懂攻击 ≠ 实施攻击</strong>。这一章讲的是<strong>渗透测试的方法论和工具链</strong>,目标是让做防御的工程师<strong>理解攻击者怎么思考</strong>,从而能写出更有针对性的 WAF 规则、限流策略和监控指标。</p><blockquote><p>一句话先记住:<strong>渗透测试是有法律边界的工程行为</strong>——授权范围内、签署 SOW(工作说明书)/ROE(交战规则)、约定测试时间窗口、限定不影响生产 → 这才是渗透。<strong>没授权扫端口都是违法的</strong>:中国《刑法》285 条(非法侵入计算机信息系统罪)/286 条(破坏计算机信息系统罪)/253 条之一(侵犯公民个人信息罪),美国 CFAA、欧盟 NIS2 都明确入罪。<strong>本章只讲防御视角</strong>:攻击工具长什么样、入口在哪里、怎么从攻击日志反推防御策略——<strong>所有命令必须在你 100% 控制的资产上跑</strong>(自己的 VM / VPS / 测试网段 / 漏洞赏金授权范围)。</p></blockquote><hr><h2 id="一、合法授权-这一章读下去前必须想清楚" tabindex="-1">一、合法授权:这一章读下去前必须想清楚 <a class="header-anchor" href="#一、合法授权-这一章读下去前必须想清楚" aria-label="Permalink to &quot;一、合法授权:这一章读下去前必须想清楚&quot;">​</a></h2><h3 id="_1-1-什么叫-授权" tabindex="-1">1.1 什么叫&quot;授权&quot; <a class="header-anchor" href="#_1-1-什么叫-授权" aria-label="Permalink to &quot;1.1 什么叫&quot;授权&quot;&quot;">​</a></h3><p><strong>单纯口头同意 ≠ 合法授权</strong>。合规渗透测试至少有以下文档:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. SOW(Statement of Work,工作说明书)</span></span>
<span class="line"><span>   - 测试范围:具体的 IP 段 / 域名 / 应用 / API</span></span>
<span class="line"><span>   - 测试时间窗口:几点到几点</span></span>
<span class="line"><span>   - 不可触碰的资产:生产数据库 / 高 SLA 服务等</span></span>
<span class="line"><span>   - 测试方式:黑盒 / 灰盒 / 白盒</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>2. ROE(Rules of Engagement,交战规则)</span></span>
<span class="line"><span>   - 哪些攻击手法允许(SQLi / XSS / 端口扫描)</span></span>
<span class="line"><span>   - 哪些禁止(社工 / 物理 / DoS 演练)</span></span>
<span class="line"><span>   - 出现风险时如何中止</span></span>
<span class="line"><span>   - 应急联系人电话</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. 双方签字盖章的合同</span></span>
<span class="line"><span>4. 测试方人员名单 + 出发 IP 段</span></span>
<span class="line"><span></span></span>
<span class="line"><span>→ 三者全有 → 才算法律意义上的授权</span></span></code></pre></div><p><strong>漏洞赏金平台</strong>(HackerOne / Bugcrowd)是另一种合法授权——平台 + 厂商提前公告了&quot;开放测试范围&quot;,你按规则提交即可。</p><h3 id="_1-2-灰色-红色场景对照" tabindex="-1">1.2 灰色 / 红色场景对照 <a class="header-anchor" href="#_1-2-灰色-红色场景对照" aria-label="Permalink to &quot;1.2 灰色 / 红色场景对照&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>绿色(合法):</span></span>
<span class="line"><span>  - 自己的 VM / VPS / 家里路由器</span></span>
<span class="line"><span>  - 公司给你授权的测试环境(有 SOW)</span></span>
<span class="line"><span>  - HackerOne / Bugcrowd 项目内的资产</span></span>
<span class="line"><span>  - HTB / TryHackMe / VulnHub 等练习靶机</span></span>
<span class="line"><span>  - CTF 比赛指定的题目环境</span></span>
<span class="line"><span></span></span>
<span class="line"><span>灰色(高风险,别碰):</span></span>
<span class="line"><span>  - &quot;看起来公开&quot;的扫描:就算 nmap 一个公网 IP 也违法</span></span>
<span class="line"><span>  - &quot;看起来无害&quot;的探测:dig 没事,但目录爆破已是攻击行为</span></span>
<span class="line"><span>  - 自己注册的某个 SaaS 测试账号:多数 SaaS 服务条款明确禁止</span></span>
<span class="line"><span>  - 朋友说&quot;我同意你打&quot;——口头不算,要看公司是否授权他</span></span>
<span class="line"><span></span></span>
<span class="line"><span>红色(直接违法):</span></span>
<span class="line"><span>  - 任何未授权的端口扫描(中国《刑法》285)</span></span>
<span class="line"><span>  - 任何未授权的弱密码尝试(同上)</span></span>
<span class="line"><span>  - 抓别人的网络流量(《网络安全法》27 条)</span></span>
<span class="line"><span>  - 把测试结果发到网上炫耀(扩散事故,加重处罚)</span></span></code></pre></div><blockquote><p>经验法则:<strong>不能 100% 证明&quot;我有书面授权&quot;的资产,一律不动手</strong>。这一原则保护你的职业生涯。</p></blockquote><h3 id="_1-3-防御工程师为什么还要学" tabindex="-1">1.3 防御工程师为什么还要学 <a class="header-anchor" href="#_1-3-防御工程师为什么还要学" aria-label="Permalink to &quot;1.3 防御工程师为什么还要学&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>不懂攻击的防御 = 蒙眼挨打</span></span>
<span class="line"><span>  - 不知道 nmap 长什么样,看 IDS 日志一脸懵</span></span>
<span class="line"><span>  - 不知道 SQL 注入的真实 payload,WAF 规则写得稀</span></span>
<span class="line"><span>  - 不知道 mitmproxy 怎么抓 HTTPS,业务方说&quot;我们用了 SSL 不会被抓&quot;——你判断不出</span></span>
<span class="line"><span>  - 不知道证书钉扎能被绕,以为加 SSL Pinning 就万事大吉</span></span>
<span class="line"><span></span></span>
<span class="line"><span>懂攻击的防御 = 想敌之所想</span></span>
<span class="line"><span>  - 看到 SYN 扫描日志立刻分流到诱饵端口</span></span>
<span class="line"><span>  - WAF 规则按真实 payload 模式优化</span></span>
<span class="line"><span>  - 知道哪个层薄弱,加固方向有据</span></span></code></pre></div><p><strong>学攻击是手段,做防御是目的</strong>——本章自始至终是这个立场。</p><hr><h2 id="二、渗透测试五阶段" tabindex="-1">二、渗透测试五阶段 <a class="header-anchor" href="#二、渗透测试五阶段" aria-label="Permalink to &quot;二、渗透测试五阶段&quot;">​</a></h2><p>业界(NIST SP 800-115、PTES 标准)把渗透分为五个阶段,<strong>每一阶段都有对应的防御措施</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌─────────────────────────────────────────────┐</span></span>
<span class="line"><span>│ ① 信息收集 (Reconnaissance)                  │</span></span>
<span class="line"><span>│   攻方:nmap/dig/Shodan/whois/Google dorks    │</span></span>
<span class="line"><span>│   防方:最小暴露面、隐藏 banner、监控扫描行为   │</span></span>
<span class="line"><span>└─────────────────────────────────────────────┘</span></span>
<span class="line"><span>                    ↓</span></span>
<span class="line"><span>┌─────────────────────────────────────────────┐</span></span>
<span class="line"><span>│ ② 漏洞扫描 (Vulnerability Scanning)          │</span></span>
<span class="line"><span>│   攻方:Nessus/OpenVAS/Nuclei/dirsearch       │</span></span>
<span class="line"><span>│   防方:漏洞管理、补丁、WAF                    │</span></span>
<span class="line"><span>└─────────────────────────────────────────────┘</span></span>
<span class="line"><span>                    ↓</span></span>
<span class="line"><span>┌─────────────────────────────────────────────┐</span></span>
<span class="line"><span>│ ③ 漏洞利用 (Exploitation)                    │</span></span>
<span class="line"><span>│   攻方:Metasploit/sqlmap/手写 PoC             │</span></span>
<span class="line"><span>│   防方:WAF 阻断、运行时防护、最小权限          │</span></span>
<span class="line"><span>└─────────────────────────────────────────────┘</span></span>
<span class="line"><span>                    ↓</span></span>
<span class="line"><span>┌─────────────────────────────────────────────┐</span></span>
<span class="line"><span>│ ④ 后渗透 (Post-Exploitation)                 │</span></span>
<span class="line"><span>│   攻方:权限提升、横向移动、持久化、数据外带     │</span></span>
<span class="line"><span>│   防方:网络分段、EDR、出向监控、零信任         │</span></span>
<span class="line"><span>└─────────────────────────────────────────────┘</span></span>
<span class="line"><span>                    ↓</span></span>
<span class="line"><span>┌─────────────────────────────────────────────┐</span></span>
<span class="line"><span>│ ⑤ 报告 (Reporting)                          │</span></span>
<span class="line"><span>│   攻方:CVSS 评分 + PoC + 修复建议            │</span></span>
<span class="line"><span>│   防方:接报告、排期修、复测                  │</span></span>
<span class="line"><span>└─────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>关键洞察</strong>:<strong>最便宜的防御在最前段</strong>(阶段 ① 收紧暴露面),<strong>最贵的防御在最后段</strong>(阶段 ④ EDR + 零信任架构)。一个组织如果阶段 ① 都做得不好,后面投再多钱也是事倍功半。</p><hr><h2 id="三、信息收集-90-的工作在这里" tabindex="-1">三、信息收集:90% 的工作在这里 <a class="header-anchor" href="#三、信息收集-90-的工作在这里" aria-label="Permalink to &quot;三、信息收集:90% 的工作在这里&quot;">​</a></h2><p>资深红队的话:<strong>80% 时间用来侦察,20% 时间用来打</strong>。这话没夸张——攻击成功率几乎完全取决于侦察的细致度。</p><h3 id="_3-1-被动侦察-无包到目标" tabindex="-1">3.1 被动侦察(无包到目标) <a class="header-anchor" href="#_3-1-被动侦察-无包到目标" aria-label="Permalink to &quot;3.1 被动侦察(无包到目标)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>信源                获得什么</span></span>
<span class="line"><span>────────────────────────────────────────</span></span>
<span class="line"><span>whois              注册人 / 邮箱 / NS / 历史</span></span>
<span class="line"><span>DNS 历史(SecurityTrails)  老 IP / 老子域(常被遗忘)</span></span>
<span class="line"><span>证书透明日志(crt.sh)    所有签发过证书的子域</span></span>
<span class="line"><span>Shodan / Censys    历史 banner / 历史端口</span></span>
<span class="line"><span>GitHub 搜索        泄漏的 token / 密钥</span></span>
<span class="line"><span>Wayback Machine    历史页面、隐藏接口</span></span>
<span class="line"><span>LinkedIn / 招聘网站  技术栈 / 在岗工程师</span></span>
<span class="line"><span>搜索引擎 dorks      site:example.com filetype:env</span></span></code></pre></div><p><strong>防御视角</strong>:</p><table tabindex="0"><thead><tr><th>攻方做什么</th><th>防方应该做什么</th></tr></thead><tbody><tr><td>crt.sh 拉所有签过证书的子域</td><td>通配证书 + 内网域不要走公网 CA</td></tr><tr><td>Shodan 看你历史端口</td><td>关掉旧服务后,公网 IP 应短期回收</td></tr><tr><td>GitHub 搜 .env 密钥</td><td>gitleaks / trufflehog 入 CI</td></tr><tr><td>Wayback 拉老页面</td><td>上线前 robots.txt + 删除前 noindex</td></tr></tbody></table><h3 id="_3-2-主动侦察-nmap" tabindex="-1">3.2 主动侦察:nmap <a class="header-anchor" href="#_3-2-主动侦察-nmap" aria-label="Permalink to &quot;3.2 主动侦察:nmap&quot;">​</a></h3><p><strong>只在自己资产上跑</strong>。在工程师电脑上学 nmap 的合法做法:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 在自己 VM 上启个服务</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">docker</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> run</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -d</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -p</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 80:80</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> nginx</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 扫自己 (127.0.0.1)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">nmap</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 127.0.0.1</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 常用命令(全部针对自己的 IP)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">nmap</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -sS</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 192.168.1.10</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">        # SYN 扫(默认,半连接)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">nmap</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -sV</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 192.168.1.10</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">        # 探测服务版本</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">nmap</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -O</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 192.168.1.10</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">         # 操作系统识别</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">nmap</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -sC</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -sV</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 192.168.1.10</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # 默认脚本 + 版本</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">nmap</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -p-</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 192.168.1.10</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">        # 全 65535 端口(慢)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">nmap</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --top-ports</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 100</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">         # 最常见 100 端口(快)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">nmap</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -sU</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -p</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 53,123</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 1.2.3.4</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">   # UDP 扫描</span></span></code></pre></div><p><strong>防御视角:nmap 在网络层留下什么痕迹?</strong></p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>SYN 扫(-sS):</span></span>
<span class="line"><span>  发 SYN,收到 SYN+ACK 立刻发 RST(不完成握手)</span></span>
<span class="line"><span>  → 网卡上看:大量来自同一源 IP 的 SYN+RST 配对</span></span>
<span class="line"><span>  → IDS 信号:Suricata / Zeek 的 SCAN_SYN 规则秒触</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Connect 扫(-sT):</span></span>
<span class="line"><span>  完整三次握手再断</span></span>
<span class="line"><span>  → 服务端有完整连接日志,反而更明显</span></span>
<span class="line"><span></span></span>
<span class="line"><span>UDP 扫(-sU):</span></span>
<span class="line"><span>  慢、易丢、会触发 ICMP Port Unreachable</span></span>
<span class="line"><span>  → 防御:开启 ICMP 速率限制</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>版本探测(-sV):</span></span>
<span class="line"><span>  跟服务说话,触发应用日志(尤其 80/443)</span></span>
<span class="line"><span>  → Nginx access.log 出现一连串 GET / 异常 UA</span></span></code></pre></div><p><strong>防御加强</strong>:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 用 fail2ban 自动封扫描 IP</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># /etc/fail2ban/jail.local</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">[portscan]</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">enabled</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> =</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> true</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">filter</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> portscan</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">action</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> iptables-allports[name=portscan]</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">findtime</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> =</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 60</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">maxretry</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> =</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 5</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 用 nftables 限速 SYN</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">nft</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> add</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> rule</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> inet</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> filter</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> input</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  tcp</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> flags</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> syn</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> meter</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> syn_meter</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> {</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ip</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> saddr</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> limit</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> rate</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 10/second</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> }</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> accept</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">nft</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> add</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> rule</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> inet</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> filter</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> input</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> tcp</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> flags</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> syn</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> drop</span></span></code></pre></div><h3 id="_3-3-dns-枚举-dig-与子域发现" tabindex="-1">3.3 DNS 枚举:dig 与子域发现 <a class="header-anchor" href="#_3-3-dns-枚举-dig-与子域发现" aria-label="Permalink to &quot;3.3 DNS 枚举:dig 与子域发现&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 基本查询</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">dig</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> example.com</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">               # A 记录</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">dig</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> example.com</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> MX</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">            # 邮件</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">dig</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> example.com</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> NS</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">            # 权威 DNS</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">dig</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> example.com</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> TXT</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">           # SPF / DKIM / 验证记录</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">dig</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> +trace</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> example.com</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">        # 完整递归路径</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 反向查询</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">dig</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -x</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 1.2.3.4</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 子域枚举(在自己授权域上)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">amass</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> enum</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -d</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> example.com</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">         # 综合(crt.sh + DNS + Wayback)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">subfinder</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -d</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> example.com</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">          # 快、准</span></span></code></pre></div><p><strong>防御视角</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>攻方收集子域用来:</span></span>
<span class="line"><span>  - 找老的、被遗忘的应用(test.example.com / staging.example.com)</span></span>
<span class="line"><span>  - 这些子域常常没 WAF、没补丁、用旧框架</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>防方应该:</span></span>
<span class="line"><span>  - 子域上线必须走 CMDB 登记</span></span>
<span class="line"><span>  - 季度做&quot;幽灵子域审计&quot;:对照 crt.sh,找未在 CMDB 的子域</span></span>
<span class="line"><span>  - 测试 / staging 域不指公网,或必须 IP 白名单</span></span></code></pre></div><h3 id="_3-4-shodan-censys-搜索引擎里的-互联网" tabindex="-1">3.4 Shodan / Censys:搜索引擎里的&quot;互联网&quot; <a class="header-anchor" href="#_3-4-shodan-censys-搜索引擎里的-互联网" aria-label="Permalink to &quot;3.4 Shodan / Censys:搜索引擎里的&quot;互联网&quot;&quot;">​</a></h3><p><strong>Shodan</strong>(shodan.io)= 全互联网的端口 / banner 数据库,<strong>Censys</strong>(censys.io)是同类。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>搜索语法示例(防御侧自查用):</span></span>
<span class="line"><span>  org:&quot;Your Company&quot;            找贵司所有暴露资产</span></span>
<span class="line"><span>  ssl:&quot;Your Company&quot;            找证书写了你公司的资产</span></span>
<span class="line"><span>  product:nginx version:1.14    所有跑老版本 Nginx 的</span></span>
<span class="line"><span>  port:6379 -auth               无密码 Redis(全球估计有几万台)</span></span>
<span class="line"><span>  port:9200                     公网开放的 Elasticsearch</span></span>
<span class="line"><span>  http.title:&quot;Welcome to nginx&quot;  默认页(配置错的标志)</span></span></code></pre></div><p><strong>防御视角</strong>:<strong>每月用 Shodan 扫一次自己的 ASN/IP 段</strong> ——这是性价比最高的&quot;暴露面治理&quot;。很多事故的根因是&quot;忘了关的旧服务&quot;。</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 命令行 (要 API key)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">shodan</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> host</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 1.2.3.4</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">              # 看某 IP 历史</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">shodan</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> search</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;org:&quot;YourCorp&quot;&#39;</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # 搜你公司</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">shodan</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> stats</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;org:&quot;YourCorp&quot; port:6379&#39;</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">   # 统计</span></span></code></pre></div><hr><h2 id="四、常见漏洞类别-防御视角逐一拆解" tabindex="-1">四、常见漏洞类别:防御视角逐一拆解 <a class="header-anchor" href="#四、常见漏洞类别-防御视角逐一拆解" aria-label="Permalink to &quot;四、常见漏洞类别:防御视角逐一拆解&quot;">​</a></h2><p>PTES / OWASP Top 10 列了几十类漏洞。下面挑<strong>最常被发现的 6 类</strong>,每类讲&quot;攻方怎么找 + 防方怎么挡&quot;。</p><h3 id="_4-1-开放敏感端口-服务" tabindex="-1">4.1 开放敏感端口 / 服务 <a class="header-anchor" href="#_4-1-开放敏感端口-服务" aria-label="Permalink to &quot;4.1 开放敏感端口 / 服务&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>攻方信号:</span></span>
<span class="line"><span>  Shodan 一搜就有大量&quot;开放但不该开&quot;的:</span></span>
<span class="line"><span>    - 6379 Redis 无密码         国内一搜上千</span></span>
<span class="line"><span>    - 9200 ES 无认证            泄漏全文索引</span></span>
<span class="line"><span>    - 27017 MongoDB 无密码      经典勒索目标</span></span>
<span class="line"><span>    - 5432 PostgreSQL 公网      碰到弱密码就完</span></span>
<span class="line"><span>    - 22 SSH 公网 + 弱密码       撞库目标</span></span>
<span class="line"><span>    - 3306 MySQL 公网          同上</span></span>
<span class="line"><span>    - 8080 Tomcat manager      默认 admin/admin</span></span>
<span class="line"><span>    - 5601 Kibana 无密码       间接拿到 ES</span></span>
<span class="line"><span></span></span>
<span class="line"><span>防方治理:</span></span>
<span class="line"><span>  - 数据库 / 缓存全部内网,bind 0.0.0.0 → bind 127.0.0.1 + 内网</span></span>
<span class="line"><span>  - SSH 改非默认端口、禁密码、走跳板机</span></span>
<span class="line"><span>  - 强制每个端口对应一份&quot;暴露申请单&quot;</span></span>
<span class="line"><span>  - 周期性 Shodan 自检</span></span></code></pre></div><h3 id="_4-2-弱密码-默认密码" tabindex="-1">4.2 弱密码 / 默认密码 <a class="header-anchor" href="#_4-2-弱密码-默认密码" aria-label="Permalink to &quot;4.2 弱密码 / 默认密码&quot;">​</a></h3><p>OWASP 2024 Top 10 里 A07 标准——&quot;Identification and Authentication Failures&quot;。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>攻方常见做法:</span></span>
<span class="line"><span>  - 字典爆破(rockyou.txt 1400 万词)</span></span>
<span class="line"><span>  - 撞库(用泄漏密码库去试别处)</span></span>
<span class="line"><span>  - 默认密码(admin/admin / root/root / nginx/nginx)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>防方:</span></span>
<span class="line"><span>  - 强制密码强度 + 双因素</span></span>
<span class="line"><span>  - 登录失败 5 次锁 15 分钟</span></span>
<span class="line"><span>  - 撞库防御:设备指纹 + 风控</span></span>
<span class="line"><span>  - 默认凭证巡检(各组件初始化时强制改密码)</span></span>
<span class="line"><span>  - 关键账号上 FIDO2 / WebAuthn(物理密钥,无法钓鱼)</span></span></code></pre></div><h3 id="_4-3-未授权-api" tabindex="-1">4.3 未授权 API <a class="header-anchor" href="#_4-3-未授权-api" aria-label="Permalink to &quot;4.3 未授权 API&quot;">​</a></h3><p>近年事故大头。攻方根本不需要漏洞,直接调:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错误的设计:</span></span>
<span class="line"><span>  GET /api/v1/user/12345/orders    无鉴权,改 ID 拉别人订单</span></span>
<span class="line"><span>  GET /api/internal/config         &quot;internal&quot; 名字防不住攻击</span></span>
<span class="line"><span>  GET /api/admin/users             忘了加权限校验</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>攻方:</span></span>
<span class="line"><span>  - 看 JS bundle 找隐藏接口</span></span>
<span class="line"><span>  - Wayback / robots.txt 翻历史</span></span>
<span class="line"><span>  - Burp Intruder 改参数</span></span>
<span class="line"><span></span></span>
<span class="line"><span>防方:</span></span>
<span class="line"><span>  - 默认拒绝原则:每个路由必须显式声明权限</span></span>
<span class="line"><span>  - 权限框架统一:RBAC / ABAC,在网关而非业务代码做强校验</span></span>
<span class="line"><span>  - 关键接口必须看到 user_id 和 token user_id 是不是一致</span></span>
<span class="line"><span>  - 灰盒测试 / API 安全扫描:42Crunch / OWASP ZAP</span></span></code></pre></div><h3 id="_4-4-sql-注入" tabindex="-1">4.4 SQL 注入 <a class="header-anchor" href="#_4-4-sql-注入" aria-label="Permalink to &quot;4.4 SQL 注入&quot;">​</a></h3><p>经典中的经典。<strong>防御原则就一条:参数化查询(prepared statement)</strong>——其它都是补丁。</p><div class="language-python vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">python</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 错误(字符串拼接,可被注入)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">cursor.execute(</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">f</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;SELECT * FROM users WHERE name = &#39;</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">{</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">name</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">}</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 正确(参数化)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">cursor.execute(</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;SELECT * FROM users WHERE name = </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">%s</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, (name,))</span></span></code></pre></div><p><strong>防御视角下的攻方流程</strong>(只讲流程,不给 payload):</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 找输入点:URL 参数 / POST body / Cookie / Header</span></span>
<span class="line"><span>2. 探测点是否反射回 SQL 错误信息</span></span>
<span class="line"><span>3. 如果有错误回显 → 联合查询拿数据</span></span>
<span class="line"><span>4. 没回显 → 盲注(布尔 / 时间)</span></span>
<span class="line"><span>5. 自动化:sqlmap</span></span>
<span class="line"><span></span></span>
<span class="line"><span>→ WAF 规则要看:输入里的 &#39; &quot; ; -- /* union select 等</span></span>
<span class="line"><span>→ 但 WAF 是兜底,根本是参数化 + 最小权限的数据库账号</span></span></code></pre></div><p><strong>WAF 规则示例</strong>(OWASP CRS):</p><div class="language-apache vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">apache</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">SecRule ARGS|REQUEST_COOKIES &quot;@detectSQLi&quot; \\</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  &quot;id:</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">942100</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,phase:</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">2</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,block,msg:&#39;SQL Injection Attack&#39;,\\</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">   tag:&#39;sqli&#39;,severity:&#39;CRITICAL&#39;&quot;</span></span></code></pre></div><h3 id="_4-5-ssrf-server-side-request-forgery" tabindex="-1">4.5 SSRF(Server-Side Request Forgery) <a class="header-anchor" href="#_4-5-ssrf-server-side-request-forgery" aria-label="Permalink to &quot;4.5 SSRF(Server-Side Request Forgery)&quot;">​</a></h3><p>应用接受 URL 参数后<strong>用服务器去拉</strong>——攻方让服务器请求<strong>内网地址</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错误代码示例(防御警示):</span></span>
<span class="line"><span>  @app.get(&quot;/fetch&quot;)</span></span>
<span class="line"><span>  def fetch(url):</span></span>
<span class="line"><span>      return requests.get(url).text   # 任意 URL 都拉</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>攻方利用:</span></span>
<span class="line"><span>  /fetch?url=http://169.254.169.254/latest/meta-data/   云元数据</span></span>
<span class="line"><span>  /fetch?url=http://localhost:6379/                     内部 Redis</span></span>
<span class="line"><span>  /fetch?url=file:///etc/passwd                         本地文件协议</span></span>
<span class="line"><span></span></span>
<span class="line"><span>为什么 169.254.169.254 致命:</span></span>
<span class="line"><span>  AWS / 阿里云 / GCP 的元数据接口都在这</span></span>
<span class="line"><span>  能直接拿到 IAM 角色凭证 → 控制整个云账号</span></span></code></pre></div><p><strong>防御</strong>:</p><div class="language-python vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">python</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 1. 协议白名单</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">if</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> not</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> url.startswith((</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;http://&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;https://&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)):</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    abort(</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">400</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 2. 域名白名单(最强)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">if</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> urlparse(url).hostname </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">not</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> in</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> ALLOWED_HOSTS</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    abort(</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">400</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 3. 解析 IP 后检查不是内网段</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">ip </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> socket.gethostbyname(urlparse(url).hostname)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">if</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> ipaddress.ip_address(ip).is_private:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    abort(</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">400</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 注意:DNS Rebinding 攻击——解析时正常,实际请求时换内网 IP</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 必须自己解析 + 拿 IP 直接请求,且禁止 DNS 重解析</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 4. 出向网络隔离</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 业务容器禁止访问 169.254.169.254(iptables OUTPUT 规则)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">iptables </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">A </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">OUTPUT</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> -</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">d </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">169.254</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.169.254 </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">-</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">j </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">REJECT</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 5. 云上用 IMDSv2(强制 token 校验,挡 SSRF v1)</span></span></code></pre></div><h3 id="_4-6-rce-remote-code-execution" tabindex="-1">4.6 RCE(Remote Code Execution) <a class="header-anchor" href="#_4-6-rce-remote-code-execution" aria-label="Permalink to &quot;4.6 RCE(Remote Code Execution)&quot;">​</a></h3><p>最顶级危害。常见入口:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>- 反序列化(Java fastjson / Python pickle / PHP unserialize)</span></span>
<span class="line"><span>- 模板注入(Jinja2 / Freemarker / Velocity)</span></span>
<span class="line"><span>- 命令注入(把用户输入拼到 shell)</span></span>
<span class="line"><span>- 上传 webshell + 解析漏洞(老 IIS / Nginx 配错)</span></span>
<span class="line"><span>- 已知 CVE(Log4Shell / Spring4Shell / Struts2)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>防御:</span></span>
<span class="line"><span>  - 业务代码不主动用反序列化,必用就上 allowlist</span></span>
<span class="line"><span>  - 模板引擎 user input 永不进 template 字符串</span></span>
<span class="line"><span>  - 不用 system() / exec() 拼用户输入</span></span>
<span class="line"><span>  - 上传走对象存储,不在 web 根目录</span></span>
<span class="line"><span>  - 依赖 SCA(Snyk/Dependabot)+ CVE 监控,Log4Shell 级补丁 24h 内出</span></span>
<span class="line"><span>  - 运行时防护:RASP / Falco 监控可疑系统调用</span></span></code></pre></div><hr><h2 id="五、抓-token-与中间人-mitmproxy-实操" tabindex="-1">五、抓 token 与中间人:mitmproxy 实操 <a class="header-anchor" href="#五、抓-token-与中间人-mitmproxy-实操" aria-label="Permalink to &quot;五、抓 token 与中间人:mitmproxy 实操&quot;">​</a></h2><p><strong>只在自己环境</strong>——给自己的 App / 自己的 PC 做流量分析。</p><h3 id="_5-1-mitmproxy-是什么" tabindex="-1">5.1 mitmproxy 是什么 <a class="header-anchor" href="#_5-1-mitmproxy-是什么" aria-label="Permalink to &quot;5.1 mitmproxy 是什么&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>mitmproxy = 中间人代理 + 自签证书</span></span>
<span class="line"><span>  - 客户端把 mitmproxy 当 HTTP 代理</span></span>
<span class="line"><span>  - 客户端信任 mitmproxy 的根证书</span></span>
<span class="line"><span>  - mitmproxy 解开 HTTPS,你能看明文,再加密转发</span></span></code></pre></div><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>正常 HTTPS:</span></span>
<span class="line"><span>  Client ──TLS── Server     看不到明文</span></span>
<span class="line"><span></span></span>
<span class="line"><span>走 mitmproxy:</span></span>
<span class="line"><span>  Client ──TLS── mitmproxy ──TLS── Server</span></span>
<span class="line"><span>                  ↑</span></span>
<span class="line"><span>                  看到明文</span></span>
<span class="line"><span>                  </span></span>
<span class="line"><span>关键点:Client 必须信任 mitmproxy CA 证书</span></span>
<span class="line"><span>       否则 TLS 校验失败 → 抓不到</span></span></code></pre></div><h3 id="_5-2-自己电脑实操步骤" tabindex="-1">5.2 自己电脑实操步骤 <a class="header-anchor" href="#_5-2-自己电脑实操步骤" aria-label="Permalink to &quot;5.2 自己电脑实操步骤&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 1. 装 mitmproxy</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">brew</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> install</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> mitmproxy</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">        # macOS</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 或</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">pip</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> install</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> mitmproxy</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 2. 启动</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">mitmproxy</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                      # TUI</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 或 mitmweb(浏览器界面)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">mitmweb</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 默认监听 127.0.0.1:8080</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 3. 系统 / 浏览器代理设置 → http://127.0.0.1:8080</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 4. 访问 mitm.it(浏览器)→ 下载并安装 CA 证书</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#    (这一步是给&quot;自己的&quot;系统装的,不要给别人装)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 5. 现在所有 HTTPS 流量在 mitmproxy 里看得到明文</span></span></code></pre></div><h3 id="_5-3-拦截-重放-修改" tabindex="-1">5.3 拦截 / 重放 / 修改 <a class="header-anchor" href="#_5-3-拦截-重放-修改" aria-label="Permalink to &quot;5.3 拦截 / 重放 / 修改&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 拦截特定主机</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">mitmproxy</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --set</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> intercept=&quot;~d api.example.com&quot;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 在 TUI 里:</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#  按 i 切换拦截</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#  ↑↓ 选择请求</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#  Enter 查看</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#  e 编辑请求</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#  r 重放</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#  c -&gt; y 清空 flow</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 用脚本自动改请求(addon)</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># myaddon.py</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">def</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> request</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">flow</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">:</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    if</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> &quot;api.example.com&quot;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> in</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> flow.request.pretty_url:</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">        flow.request.headers[</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">&quot;X-Test&quot;</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">]</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> =</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;1&quot;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">mitmproxy</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -s</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> myaddon.py</span></span></code></pre></div><p><strong>防御视角</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>为什么 mitmproxy 能成功:</span></span>
<span class="line"><span>  客户端&quot;信任了&quot;mitm 证书 → TLS 校验通过</span></span>
<span class="line"><span></span></span>
<span class="line"><span>防御技术:证书钉扎(Certificate Pinning)</span></span>
<span class="line"><span>  App 里硬编码服务端证书指纹</span></span>
<span class="line"><span>  TLS 握手后比对指纹 → 不匹配直接断开</span></span>
<span class="line"><span>  → mitmproxy 抓不到(因为证书指纹对不上)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>各家 SDK 的钉扎:</span></span>
<span class="line"><span>  iOS:  NSPinnedDomains / TrustKit</span></span>
<span class="line"><span>  Android:Network Security Config &lt;pin-set&gt;</span></span>
<span class="line"><span>  OkHttp: CertificatePinner</span></span></code></pre></div><h3 id="_5-4-证书钉扎绕过-frida-hook" tabindex="-1">5.4 证书钉扎绕过:Frida hook <a class="header-anchor" href="#_5-4-证书钉扎绕过-frida-hook" aria-label="Permalink to &quot;5.4 证书钉扎绕过:Frida hook&quot;">​</a></h3><p>钉扎不是绝对安全——<strong>Frida 在 Root 设备上 hook SSL 校验函数,把校验返回值改成&quot;通过&quot;</strong>,钉扎就废了。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Frida 工作原理:</span></span>
<span class="line"><span>  Frida 把一段 JS 注入到目标进程</span></span>
<span class="line"><span>  JS 通过 Frida 提供的 API 改函数行为</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>绕钉扎的核心:hook checkServerTrusted / SSL_get_verify_result</span></span>
<span class="line"><span>  让它永远返回成功</span></span></code></pre></div><p><strong>防御视角</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>攻方要绕过钉扎需要:</span></span>
<span class="line"><span>  - root/越狱设备(普通用户没有)</span></span>
<span class="line"><span>  - 自己安装 Frida(需要 USB 调试)</span></span>
<span class="line"><span>  - 写 hook 脚本(技术门槛)</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>所以钉扎仍然有效——它把攻击门槛从&quot;装个 app&quot;提到了&quot;破解客户端&quot;</span></span>
<span class="line"><span>对企业 App 来说够了</span></span>
<span class="line"><span></span></span>
<span class="line"><span>进一步防御:</span></span>
<span class="line"><span>  - 检测 root / 越狱(SafetyNet / Play Integrity)</span></span>
<span class="line"><span>  - 检测调试器附加</span></span>
<span class="line"><span>  - 关键代码用 NDK 写 + 加固(360 加固 / 爱加密 / DexGuard)</span></span>
<span class="line"><span>  - 服务端再加风控(频率 + 设备指纹)</span></span></code></pre></div><h3 id="_5-5-wireshark-看-tls-流量-无法解密则只看到加密包" tabindex="-1">5.5 Wireshark 看 TLS 流量(无法解密则只看到加密包) <a class="header-anchor" href="#_5-5-wireshark-看-tls-流量-无法解密则只看到加密包" aria-label="Permalink to &quot;5.5 Wireshark 看 TLS 流量(无法解密则只看到加密包)&quot;">​</a></h3><p>mitmproxy 是&quot;代理式&quot;中间人。<strong>纯被动嗅探(Wireshark)看不到 HTTPS 明文</strong>——除非你拿到 TLS 会话密钥(<code>SSLKEYLOGFILE</code> 环境变量,Chrome / Firefox 支持)。</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 自己的浏览器:导出会话密钥</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">export</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> SSLKEYLOGFILE</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=~</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">/sslkeys.log</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">google-chrome</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> &amp;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 同时抓包</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> tshark</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -i</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> any</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -w</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ~/cap.pcap</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Wireshark 设置 -&gt; Protocols -&gt; TLS -&gt; (Pre)-Master-Secret log</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 指向 ~/sslkeys.log,就能解密</span></span></code></pre></div><p><strong>防御视角</strong>:<strong>SSLKEYLOGFILE 在生产环境永远不要设</strong>——一旦 key 文件落入攻方,所有 TLS 流量解密。这就是为什么&quot;内网 mTLS 服务器配置错误把私钥放在客户端&quot;是高危事件。</p><hr><h2 id="六、burp-suite-web-渗透的瑞士军刀" tabindex="-1">六、Burp Suite:Web 渗透的瑞士军刀 <a class="header-anchor" href="#六、burp-suite-web-渗透的瑞士军刀" aria-label="Permalink to &quot;六、Burp Suite:Web 渗透的瑞士军刀&quot;">​</a></h2><p><strong>Burp Suite</strong> 是 Web 渗透的事实标准。结构跟 mitmproxy 类似,但偏 Web 优化:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Proxy(代理 + 拦截)</span></span>
<span class="line"><span>  ─ 类似 mitmproxy 但有图形 UI</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Repeater(重放 + 改包)</span></span>
<span class="line"><span>  ─ 把一个请求扔进来反复改,最常用</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Intruder(参数爆破)</span></span>
<span class="line"><span>  ─ 字典批量替换某个参数,自动化爆破</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Scanner(漏洞扫描,Pro 版)</span></span>
<span class="line"><span>  ─ 自动跑 OWASP Top 10 检测</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Sequencer(随机性分析)</span></span>
<span class="line"><span>  ─ 分析 token / session ID 是否真随机</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Decoder(编码解码)</span></span>
<span class="line"><span>  ─ Base64 / URL / Hex / Hash</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Comparer(diff)</span></span>
<span class="line"><span>  ─ 两个 response 比对(找盲注信号)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Extender(插件)</span></span>
<span class="line"><span>  ─ BApp Store 几百插件</span></span></code></pre></div><p><strong>典型 Web 渗透 workflow</strong>(防御工程师可在自己环境 / 漏洞赏金范围内复现):</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 浏览器代理设到 Burp(8080)</span></span>
<span class="line"><span>2. Burp 装根证书到浏览器(同 mitmproxy 思路)</span></span>
<span class="line"><span>3. 正常浏览目标应用,Burp 自动记录所有请求(Proxy → HTTP history)</span></span>
<span class="line"><span>4. 找可疑接口 → 右键 Send to Repeater</span></span>
<span class="line"><span>5. Repeater 改参数测试不同输入(防御就能看到攻方思路)</span></span>
<span class="line"><span>6. 找重要接口 → Send to Intruder → 跑字典</span></span>
<span class="line"><span>7. 漏洞确认后,生成报告 + 修复建议</span></span></code></pre></div><p><strong>防御工程师怎么用 Burp 反过来加固</strong>:</p><ol><li><strong>审计自己的 API</strong>:把生产前端走一遍 Burp,看接口里有没有&quot;应该但没鉴权的&quot;</li><li><strong>压测 WAF</strong>:用 Burp Repeater 试各种 SQL/XSS payload,看 WAF 拦不拦</li><li><strong>校验 token 强度</strong>:用 Sequencer 分析自家 session ID,看是否真随机</li></ol><hr><h2 id="七、漏洞赏金-合法变现的渠道" tabindex="-1">七、漏洞赏金:合法变现的渠道 <a class="header-anchor" href="#七、漏洞赏金-合法变现的渠道" aria-label="Permalink to &quot;七、漏洞赏金:合法变现的渠道&quot;">​</a></h2><p><strong>漏洞赏金平台</strong>为研究者提供合法测试范围 + 报酬,是从&quot;想学攻击&quot;到&quot;职业化&quot;的安全过渡。</p><h3 id="_7-1-主流平台" tabindex="-1">7.1 主流平台 <a class="header-anchor" href="#_7-1-主流平台" aria-label="Permalink to &quot;7.1 主流平台&quot;">​</a></h3><table tabindex="0"><thead><tr><th>平台</th><th>强项</th><th>报酬范围</th></tr></thead><tbody><tr><td><strong>HackerOne</strong></td><td>国际、知名厂商多(Uber/Shopify/PayPal/政府)</td><td>$50 - $50,000+</td></tr><tr><td><strong>Bugcrowd</strong></td><td>国际、Atlassian/Tesla/Western Union</td><td>$50 - $30,000+</td></tr><tr><td><strong>Intigriti</strong></td><td>欧洲、隐私敏感企业</td><td>€50 - €30,000+</td></tr><tr><td><strong>Synack</strong></td><td>邀请制(精英)、政府国防</td><td>高</td></tr><tr><td><strong>补天 / 漏洞盒子</strong></td><td>国内,国内厂商</td><td>几百到几万 RMB</td></tr><tr><td><strong>奇安信 / 360 SRC</strong></td><td>国内大厂自建</td><td>视影响</td></tr></tbody></table><h3 id="_7-2-漏洞赏金的-游戏规则" tabindex="-1">7.2 漏洞赏金的&quot;游戏规则&quot; <a class="header-anchor" href="#_7-2-漏洞赏金的-游戏规则" aria-label="Permalink to &quot;7.2 漏洞赏金的&quot;游戏规则&quot;&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 看清 Scope(范围)——只测列出的资产</span></span>
<span class="line"><span>   &quot;out of scope&quot; 资产即使有漏洞,提交也不收 + 可能被警告</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. 遵守 Rules of Engagement</span></span>
<span class="line"><span>   不准 DoS、不准用真用户数据测试、不准社工</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. 找到漏洞 → 写报告</span></span>
<span class="line"><span>   - 漏洞类型 + CVSS</span></span>
<span class="line"><span>   - 复现步骤(详细到能 1:1 重现)</span></span>
<span class="line"><span>   - PoC(截图 / 录屏 / payload)</span></span>
<span class="line"><span>   - 影响范围</span></span>
<span class="line"><span>   - 修复建议</span></span>
<span class="line"><span></span></span>
<span class="line"><span>4. 平台仲裁</span></span>
<span class="line"><span>   厂商确认 → 评级 → 赏金</span></span>
<span class="line"><span></span></span>
<span class="line"><span>5. 发现后到公开披露通常 90 天禁言期</span></span></code></pre></div><h3 id="_7-3-防御视角-开-src-计划应该想清楚什么" tabindex="-1">7.3 防御视角:开 SRC 计划应该想清楚什么 <a class="header-anchor" href="#_7-3-防御视角-开-src-计划应该想清楚什么" aria-label="Permalink to &quot;7.3 防御视角:开 SRC 计划应该想清楚什么&quot;">​</a></h3><p>很多公司开 SRC(Security Response Center)/ 漏洞赏金,但准备不足踩坑:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>要想清楚:</span></span>
<span class="line"><span>  - 范围明确(资产清单 + 哪些禁测)</span></span>
<span class="line"><span>  - 处理时效(确认 / 修复 / 复测的 SLA)</span></span>
<span class="line"><span>  - 内部对接人(法务 + 运维 + 安全)</span></span>
<span class="line"><span>  - 赏金标准(透明 + 有竞争力)</span></span>
<span class="line"><span>  - 误报 / 重复 / 不收的判定流程</span></span>
<span class="line"><span></span></span>
<span class="line"><span>不开 SRC 的公司也要监控:</span></span>
<span class="line"><span>  - 互联网上是否有人提你公司漏洞(Twitter / GitHub / 暗网)</span></span>
<span class="line"><span>  - 漏洞披露邮箱(security@yourcorp.com)+ 24h 响应</span></span></code></pre></div><hr><h2 id="八、ctf-入门-在合法靶场学攻防" tabindex="-1">八、CTF 入门:在合法靶场学攻防 <a class="header-anchor" href="#八、ctf-入门-在合法靶场学攻防" aria-label="Permalink to &quot;八、CTF 入门:在合法靶场学攻防&quot;">​</a></h2><p><strong>CTF</strong>(Capture The Flag)是合法练习渠道——题目环境是平台搭的,你就是来打的。</p><h3 id="_8-1-ctf-类型" tabindex="-1">8.1 CTF 类型 <a class="header-anchor" href="#_8-1-ctf-类型" aria-label="Permalink to &quot;8.1 CTF 类型&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Jeopardy(知识答题型)</span></span>
<span class="line"><span>  Web / Crypto / Pwn / Reverse / Misc / Forensics</span></span>
<span class="line"><span>  每题独立,做完拿 flag 兑分</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>Attack-Defense(攻防型)</span></span>
<span class="line"><span>  每队有自己的服务,既要打别人也要补自己</span></span>
<span class="line"><span>  接近真实攻防</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Boot2Root(渗透型)</span></span>
<span class="line"><span>  给一台靶机,目标拿到 root 权限</span></span>
<span class="line"><span>  HTB / TryHackMe 主体</span></span></code></pre></div><h3 id="_8-2-入门资源-全部合法、合规" tabindex="-1">8.2 入门资源(全部合法、合规) <a class="header-anchor" href="#_8-2-入门资源-全部合法、合规" aria-label="Permalink to &quot;8.2 入门资源(全部合法、合规)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>靶场:</span></span>
<span class="line"><span>  HackTheBox          https://hackthebox.com    收费,质量高,业界招聘看 HTB 段位</span></span>
<span class="line"><span>  TryHackMe           https://tryhackme.com     有免费部分,新手友好</span></span>
<span class="line"><span>  PortSwigger Academy https://portswigger.net/web-security  Burp 官方教程,免费,Web 入门最佳</span></span>
<span class="line"><span>  VulnHub             https://vulnhub.com       下载靶机镜像,本地跑</span></span>
<span class="line"><span>  PicoCTF             https://picoctf.org       面向中学生 / 大学生,卡内基梅隆主办,免费</span></span>
<span class="line"><span></span></span>
<span class="line"><span>赛事:</span></span>
<span class="line"><span>  DEFCON CTF          世界顶级,8 月拉斯维加斯</span></span>
<span class="line"><span>  XCTF / 强网杯       国内顶级</span></span>
<span class="line"><span>  CTFtime.org         全球 CTF 排名 + 日程</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Web 安全学习路线:</span></span>
<span class="line"><span>  1. PortSwigger Academy 全跑一遍(免费 + 有靶场)</span></span>
<span class="line"><span>  2. OWASP Top 10 每条都能讲清原理</span></span>
<span class="line"><span>  3. 看几本基础书:Web Security Academy / Web Hacking 101</span></span>
<span class="line"><span>  4. HackTheBox 100 台机器</span></span>
<span class="line"><span>  5. 漏洞赏金试水</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Pwn(二进制)路线:</span></span>
<span class="line"><span>  1. PicoCTF Pwn 题</span></span>
<span class="line"><span>  2. pwn.college(俄亥俄州立)</span></span>
<span class="line"><span>  3. CTF Wiki</span></span>
<span class="line"><span>  4. 系统学一遍 ELF / 栈帧 / heap</span></span></code></pre></div><h3 id="_8-3-法律声明再次" tabindex="-1">8.3 法律声明再次 <a class="header-anchor" href="#_8-3-法律声明再次" aria-label="Permalink to &quot;8.3 法律声明再次&quot;">​</a></h3><p>CTF 平台的服务器是为了&quot;被打&quot;准备的,<strong>所以你打它合法</strong>。但:</p><ul><li><strong>CTF 题目里出现的&quot;看起来像真实公司&quot;的提示</strong>(域名 / IP)<strong>不要去访问真实地址</strong>——题目只是模拟</li><li><strong>学会的技术不能往未授权目标用</strong>——这是底线</li><li><strong>公开 writeup 时</strong>,只写 CTF 平台的题目,<strong>绝不</strong>针对真实生产系统</li></ul><hr><h2 id="九、攻击流量长什么样-防御工程师的肌肉记忆" tabindex="-1">九、攻击流量长什么样:防御工程师的肌肉记忆 <a class="header-anchor" href="#九、攻击流量长什么样-防御工程师的肌肉记忆" aria-label="Permalink to &quot;九、攻击流量长什么样:防御工程师的肌肉记忆&quot;">​</a></h2><p>防御工程师最该记住的:<strong>攻击流量在日志里有什么特征</strong>。下面是常见模式(便于在 SIEM / WAF 日志里识别):</p><h3 id="_9-1-端口扫描" tabindex="-1">9.1 端口扫描 <a class="header-anchor" href="#_9-1-端口扫描" aria-label="Permalink to &quot;9.1 端口扫描&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Suricata 日志:</span></span>
<span class="line"><span>  ET SCAN nmap NULL scan</span></span>
<span class="line"><span>  ET SCAN Suspicious inbound to mySQL port 3306</span></span>
<span class="line"><span>  ET SCAN Behavioral Unusual Port 80</span></span>
<span class="line"><span></span></span>
<span class="line"><span>netstat / ss 看到大量 TIME_WAIT 配对,源 IP 集中</span></span></code></pre></div><h3 id="_9-2-目录爆破" tabindex="-1">9.2 目录爆破 <a class="header-anchor" href="#_9-2-目录爆破" aria-label="Permalink to &quot;9.2 目录爆破&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Nginx access.log 在短时间内:</span></span>
<span class="line"><span>  GET /admin → 404</span></span>
<span class="line"><span>  GET /administrator → 404</span></span>
<span class="line"><span>  GET /backup → 404</span></span>
<span class="line"><span>  GET /backup.zip → 404</span></span>
<span class="line"><span>  GET /.git/config → 404</span></span>
<span class="line"><span>  GET /.env → 404</span></span>
<span class="line"><span>  ... 来自同一 IP 几百次</span></span>
<span class="line"><span></span></span>
<span class="line"><span>UA 多为:dirsearch / gobuster / wfuzz / ffuf</span></span></code></pre></div><h3 id="_9-3-sql-注入探测" tabindex="-1">9.3 SQL 注入探测 <a class="header-anchor" href="#_9-3-sql-注入探测" aria-label="Permalink to &quot;9.3 SQL 注入探测&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Nginx access.log:</span></span>
<span class="line"><span>  GET /api/user?id=1&#39;</span></span>
<span class="line"><span>  GET /api/user?id=1%20or%201=1</span></span>
<span class="line"><span>  GET /api/user?id=1%20union%20select%20null</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>UA 多为:sqlmap / 自定义脚本</span></span>
<span class="line"><span>ModSecurity 规则 942100 系列被频繁触发</span></span></code></pre></div><h3 id="_9-4-rce-尝试" tabindex="-1">9.4 RCE 尝试 <a class="header-anchor" href="#_9-4-rce-尝试" aria-label="Permalink to &quot;9.4 RCE 尝试&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>URL / body 出现:</span></span>
<span class="line"><span>  \${jndi:ldap://    ← Log4Shell</span></span>
<span class="line"><span>  /etc/passwd</span></span>
<span class="line"><span>  ;cat /etc/passwd</span></span>
<span class="line"><span>  | ls</span></span>
<span class="line"><span>  $(whoami)</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>应用日志可能突然出现 java.* / shell 异常调用</span></span></code></pre></div><h3 id="_9-5-凭证爆破" tabindex="-1">9.5 凭证爆破 <a class="header-anchor" href="#_9-5-凭证爆破" aria-label="Permalink to &quot;9.5 凭证爆破&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>登录接口短时间大量 401:</span></span>
<span class="line"><span>  POST /api/login - admin / 123456     → 401</span></span>
<span class="line"><span>  POST /api/login - admin / password   → 401</span></span>
<span class="line"><span>  POST /api/login - admin / admin123   → 401</span></span>
<span class="line"><span>  ...</span></span>
<span class="line"><span></span></span>
<span class="line"><span>监控:5 分钟内单 IP &gt; 50 次 401 → 自动封 1 小时</span></span></code></pre></div><p><strong>关键工具</strong>:</p><ul><li><strong>Suricata</strong> / <strong>Zeek</strong> / <strong>Snort</strong> —— 网络层 IDS</li><li><strong>Wazuh</strong> / <strong>OSSEC</strong> —— 主机层 HIDS</li><li><strong>ELK / Splunk / SIEM</strong> —— 日志聚合 + 关联分析</li><li><strong>Falco</strong> —— 容器运行时异常检测(Cloud Native)</li></ul><hr><h2 id="十、踩坑-误区-防御视角" tabindex="-1">十、踩坑 / 误区(防御视角) <a class="header-anchor" href="#十、踩坑-误区-防御视角" aria-label="Permalink to &quot;十、踩坑 / 误区(防御视角)&quot;">​</a></h2><ol><li><strong>以为渗透 = 黑客 = 不能学</strong>——错,渗透是合规流程,缺乏渗透思维的防御是裸奔</li><li><strong>以为有 WAF 就能不用防御写代码</strong>——WAF 只是层皮,根本要安全编码 + 参数化 + 最小权限</li><li><strong>以为内网就安全</strong>——真实事故 70% 由内网横向移动放大,零信任是趋势</li><li><strong>以为关掉公网端口就行</strong>——VPN 配置错、出向 SSRF、DNS rebinding 都能绕</li><li><strong>以为 HTTPS 就不会被中间人</strong>——证书钉扎 + 客户端校验缺一不可</li><li><strong>以为 root 设备少不会有人 hook</strong>——自动化攻击的成本越来越低</li><li><strong>以为漏洞赏金计划就能&quot;被动测试&quot;</strong>——SRC 不能替代主动 SDL(安全开发生命周期)</li><li><strong>以为 CVE 出来再修就行</strong>——Log4Shell 出来 6 小时全网就开始扫描,响应时间越来越短</li><li><strong>以为防御工程师不需要懂二进制 / 逆向</strong>——APT 类攻击和二进制漏洞高度相关,懂得越多防得越细</li><li><strong>私自扫描&quot;看似公开&quot;的资产</strong>——任何未授权扫描都是违法,最低限度也违反 ToS,职业生涯毁了</li></ol><hr><h2 id="十一、本章-checklist" tabindex="-1">十一、本章 Checklist <a class="header-anchor" href="#十一、本章-checklist" aria-label="Permalink to &quot;十一、本章 Checklist&quot;">​</a></h2><table tabindex="0"><thead><tr><th>项</th><th>说明</th></tr></thead><tbody><tr><td>能讲清&quot;合法授权&quot;的三要素(SOW + ROE + 合同)</td><td>法律底线</td></tr><tr><td>能列渗透五阶段及每阶段的防御对策</td><td>方法论</td></tr><tr><td>在自己 VM 上用 nmap 扫过几次,能解读输出</td><td>工具入门</td></tr><tr><td>知道 crt.sh / Shodan / Censys 怎么用,定期自查</td><td>暴露面治理</td></tr><tr><td>能区分 SQL 注入 / SSRF / RCE 的本质</td><td>漏洞认知</td></tr><tr><td>mitmproxy 自己装过 + 抓过自己 App 流量</td><td>中间人理解</td></tr><tr><td>知道证书钉扎是什么、能被 Frida 怎么绕</td><td>客户端安全</td></tr><tr><td>用过 Burp Repeater 改一次自己的请求</td><td>Web 渗透入门</td></tr><tr><td>在 PortSwigger Academy / TryHackMe 做完 5 题</td><td>实操起步</td></tr><tr><td>能在 Nginx / Suricata 日志里识别 5 类攻击模式</td><td>防御眼光</td></tr><tr><td>知道至少 3 个国内外漏洞赏金平台</td><td>合法变现渠道</td></tr></tbody></table><hr><h2 id="十二、小结" tabindex="-1">十二、小结 <a class="header-anchor" href="#十二、小结" aria-label="Permalink to &quot;十二、小结&quot;">​</a></h2><p>学渗透的最终目的是<strong>让你成为&quot;看得见攻击&quot;的防御工程师</strong>。这一章的核心立场重复一次:</p><ol><li><strong>合法授权是绝对底线</strong> —— 没有授权,任何扫描 / 探测都是犯罪。这条底线一旦破,职业生涯结束</li><li><strong>80% 攻击成功来自侦察</strong> —— 暴露面治理比 WAF 更重要。最便宜也最有效</li><li><strong>WAF 是兜底,代码是根本</strong> —— 参数化查询、最小权限、白名单输入,这些是 SQL 注入 / SSRF / RCE 的根治方法</li><li><strong>客户端永远不可信</strong> —— 钉扎能被绕、加固能被脱、Token 能被偷,所有关键校验必须在服务端</li><li><strong>零信任是趋势</strong> —— &quot;内网安全&quot;的假设已经破产,每个请求都要鉴权</li></ol><p><strong>最后一句话</strong>:<strong>做攻击是技能,做防御是责任</strong>——技能用错地方就是犯罪,用对地方才是工程师的价值。</p><hr><p>下一篇:<code>39-抓包高级与压测.md</code>,把 1-38 篇学到的协议 / 调优 / 防御全部串起来——讲 BPF 过滤语法(超出 <code>tcpdump host x</code> 的层次)、Wireshark 高级分析(I/O 图、TCP Stream Graph、Expert Info、Decryption 工作流)、tshark 自动化(脚本化提取字段、统计流量分布)、压测工具(wrk / wrk2 / h2load / hey / vegeta 选型与用法)、压测报告解读(P50/P95/P99/P99.9、Coordinated Omission 陷阱、长尾分析)、性能基线建立——<strong>会抓包 + 会压测,网络问题再没有&quot;玄学&quot;</strong>。</p>`,146)])])}const g=a(l,[["render",t]]);export{d as __pageData,g as default};
