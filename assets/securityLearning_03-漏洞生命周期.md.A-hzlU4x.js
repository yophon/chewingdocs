import{c as a,Q as n,j as t,m as p}from"./chunks/framework.CBiVa4O3.js";const h=JSON.parse('{"title":"漏洞生命周期:CVE / CVSS / 0day vs Nday / 披露 vs 隐藏","description":"","frontmatter":{},"headers":[],"relativePath":"../securityLearning/03-漏洞生命周期.md","filePath":"../securityLearning/03-漏洞生命周期.md","lastUpdated":1778496697000}'),e={name:"../securityLearning/03-漏洞生命周期.md"};function l(o,s,i,r,d,c){return n(),t("div",null,[...s[0]||(s[0]=[p(`<h1 id="漏洞生命周期-cve-cvss-0day-vs-nday-披露-vs-隐藏" tabindex="-1">漏洞生命周期:CVE / CVSS / 0day vs Nday / 披露 vs 隐藏 <a class="header-anchor" href="#漏洞生命周期-cve-cvss-0day-vs-nday-披露-vs-隐藏" aria-label="Permalink to &quot;漏洞生命周期:CVE / CVSS / 0day vs Nday / 披露 vs 隐藏&quot;">​</a></h1><p>新手工程师对漏洞的认知大概是:「<strong>有人发了 CVE,我升级一下包</strong>」。这个画面只对了 10%。一个漏洞从「研究员发现」到「全网修补完」中间至少跨了七八个角色——研究员、厂商 PSIRT、CNA、MITRE、NVD、SOC、运维、攻击者——每个角色的动机和时间表都不一样,<strong>这套博弈直接决定了你「看到 CVE 公告时手里有几天时间」</strong>。这一篇不教你挖漏洞,只把这个流程拆透:<strong>作为防御方,你得知道这场游戏在你看见公告之前已经打了多久,你看见公告之后大概还有多久能反应</strong>。</p><blockquote><p>一句话先记住:<strong>漏洞不是「被发现的瞬间出生」,而是从代码 commit 那一天就出生了</strong>——只是在等一个发现它的人。<strong>「0day」 不是漏洞的属性,是漏洞和厂商之间「时间差」的属性</strong>——同一个洞,卖给政府就是 0day,交给厂商就是责任披露,自己藏着等下次攻击就是「囤洞」。<strong>整套 CVE / CVSS 体系本质是给「这个时间差」打补丁——让防御方知道「有这么个洞、有多紧急、长什么样」,但这套系统天然滞后于攻击方</strong>。</p></blockquote><hr><h2 id="一、漏洞的真实时间线-从-commit-到全网修补" tabindex="-1">一、漏洞的真实时间线:从 commit 到全网修补 <a class="header-anchor" href="#一、漏洞的真实时间线-从-commit-到全网修补" aria-label="Permalink to &quot;一、漏洞的真实时间线:从 commit 到全网修补&quot;">​</a></h2><p>很多人以为漏洞流程是 <code>发现 → 公告 → 修复</code>,三步。<strong>真实流程至少是九步</strong>,而且每一步之间都可能隔几个月甚至几年。</p><h3 id="_1-1-完整时间线-以一个典型-rce-漏洞为例" tabindex="-1">1.1 完整时间线(以一个典型 RCE 漏洞为例) <a class="header-anchor" href="#_1-1-完整时间线-以一个典型-rce-漏洞为例" aria-label="Permalink to &quot;1.1 完整时间线(以一个典型 RCE 漏洞为例)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>T-N 年   有缺陷的代码被提交、合并、发版</span></span>
<span class="line"><span>         ↓ 几个月到几年(没人看)</span></span>
<span class="line"><span>T0       研究员发现漏洞(代码审计 / 模糊测试 / 偶然)</span></span>
<span class="line"><span>         ↓ 0 - 7 天</span></span>
<span class="line"><span>T1       研究员决定怎么处置:</span></span>
<span class="line"><span>           a) 报给厂商(责任披露)</span></span>
<span class="line"><span>           b) 投稿会议 / 卖给第三方</span></span>
<span class="line"><span>           c) 武器化自用 / 不报</span></span>
<span class="line"><span>         ↓ 1 - 90 天(协商窗口)</span></span>
<span class="line"><span>T2       厂商确认漏洞,开始修复</span></span>
<span class="line"><span>         ↓ 14 - 180 天</span></span>
<span class="line"><span>T3       补丁开发完成,内部测试</span></span>
<span class="line"><span>         ↓ Patch Tuesday / 定期发版</span></span>
<span class="line"><span>T4       补丁发布 + CVE 公告 + CVSS 评分</span></span>
<span class="line"><span>         ↓ 几小时到几天</span></span>
<span class="line"><span>T5       PoC 在 GitHub / Twitter 出现</span></span>
<span class="line"><span>         ↓ 几小时到几天</span></span>
<span class="line"><span>T6       公开扫描器(Nuclei / Metasploit)加入指纹</span></span>
<span class="line"><span>         ↓ 几天到几周</span></span>
<span class="line"><span>T7       全网大规模扫描 + 利用尝试</span></span>
<span class="line"><span>         ↓ 数月到数年</span></span>
<span class="line"><span>T8       「长尾」:仍然有人没打补丁,变成 Nday 攻击目标</span></span></code></pre></div><p><strong>关键观察</strong>:你作为应用工程师,<strong>最早看到漏洞的位置是 T4</strong>(公告发布)——但<strong>攻击者从 T0 就可能知道了</strong>。这个「T0 → T4」的窗口可能长达数月,这段时间叫<strong>漏洞的「暗物质期」</strong>——它存在,但只有少数人知道。</p><h3 id="_1-2-你看不见的「暗物质期」有多长" tabindex="-1">1.2 你看不见的「暗物质期」有多长 <a class="header-anchor" href="#_1-2-你看不见的「暗物质期」有多长" aria-label="Permalink to &quot;1.2 你看不见的「暗物质期」有多长&quot;">​</a></h3><table tabindex="0"><thead><tr><th>漏洞</th><th>代码引入(T-N)</th><th>被发现(T0)</th><th>公开披露(T4)</th><th>暗物质期</th></tr></thead><tbody><tr><td>Heartbleed(CVE-2014-0160)</td><td>2012-03</td><td>2014-03 中旬</td><td>2014-04-07</td><td><strong>2 年</strong></td></tr><tr><td>Log4Shell(CVE-2021-44228)</td><td>2013-07</td><td>2021-11-24(阿里云报给 Apache)</td><td>2021-12-09</td><td><strong>8 年</strong></td></tr><tr><td>Shellshock(CVE-2014-6271)</td><td>1989(bash 2.0)</td><td>2014-09-12</td><td>2014-09-24</td><td><strong>25 年</strong></td></tr><tr><td>Spectre / Meltdown</td><td>90 年代的 CPU</td><td>2017-06</td><td>2018-01-03</td><td><strong>20 年+</strong></td></tr></tbody></table><blockquote><p>「这个漏洞从今年才出现」——<strong>90% 是错的</strong>。绝大多数高危漏洞在代码里已经躺了好几年,只是没人查到。<strong>你的依赖里大概率也有几个这样的「化石」</strong>,只是还没到你头上。</p></blockquote><h3 id="_1-3-防御方的窗口-从「patch-available」到「被打」" tabindex="-1">1.3 防御方的窗口:从「Patch Available」到「被打」 <a class="header-anchor" href="#_1-3-防御方的窗口-从「patch-available」到「被打」" aria-label="Permalink to &quot;1.3 防御方的窗口:从「Patch Available」到「被打」&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>T4(公告)     T5(PoC)     T6(扫描器集成)    T7(批量利用)</span></span>
<span class="line"><span>   |             |              |                  |</span></span>
<span class="line"><span>   |   ≤24h      |   ≤48h       |     ≤72h         |</span></span>
<span class="line"><span>   ▼             ▼              ▼                  ▼</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   高危漏洞:**72 小时内全网开始被扫**</span></span>
<span class="line"><span>   你的 Patch SLA 必须比这个快</span></span></code></pre></div><p>Log4Shell 是极端例子:<strong>T4(2021-12-09) → T7 大规模利用(2021-12-10) ≈ 不到 24 小时</strong>。这是为什么后面要讲「30 分钟决策流程」——<strong>等不及周一开会</strong>。</p><hr><h2 id="二、cve-是怎么发出来的-mitre-cna-nvd" tabindex="-1">二、CVE 是怎么发出来的:MITRE / CNA / NVD <a class="header-anchor" href="#二、cve-是怎么发出来的-mitre-cna-nvd" aria-label="Permalink to &quot;二、CVE 是怎么发出来的:MITRE / CNA / NVD&quot;">​</a></h2><p>「CVE-2021-44228」这串编号看起来像政府发的,<strong>其实背后是一套相当 ad-hoc 的志愿组织</strong>。理解它怎么发,你才能理解为什么有些漏洞「拿到 CVE 之前已经被打了一个月」。</p><h3 id="_2-1-三个角色" tabindex="-1">2.1 三个角色 <a class="header-anchor" href="#_2-1-三个角色" aria-label="Permalink to &quot;2.1 三个角色&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌─────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  MITRE Corporation(美国非营利)             │</span></span>
<span class="line"><span>│   维护 CVE 编号注册表,「CVE Program」总管   │</span></span>
<span class="line"><span>│   官网:cve.org                              │</span></span>
<span class="line"><span>└──────────────────┬──────────────────────────┘</span></span>
<span class="line"><span>                   │ 授权</span></span>
<span class="line"><span>                   ▼</span></span>
<span class="line"><span>┌─────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  CNA(CVE Numbering Authority)              │</span></span>
<span class="line"><span>│   厂商 / 研究机构,**可以自己分配 CVE 编号**  │</span></span>
<span class="line"><span>│   例:Apache、GitHub、Red Hat、Google、阿里  │</span></span>
<span class="line"><span>│   全球 300+ 个 CNA(2025 年数据)             │</span></span>
<span class="line"><span>└──────────────────┬──────────────────────────┘</span></span>
<span class="line"><span>                   │ 公告</span></span>
<span class="line"><span>                   ▼</span></span>
<span class="line"><span>┌─────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  NVD(National Vulnerability Database)      │</span></span>
<span class="line"><span>│   NIST 维护,**给 CVE 加 CVSS 评分 + 元数据** │</span></span>
<span class="line"><span>│   官网:nvd.nist.gov                         │</span></span>
<span class="line"><span>│   是 MITRE 数据的「富化版本」                 │</span></span>
<span class="line"><span>└─────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>关键区分</strong>:<strong>MITRE 只管「分配编号」,NVD 才管「打分和归类」</strong>。所以你常看到「CVE 已发,但 NVD 还在 Awaiting Analysis」——这就是中间的时间差,<strong>这段时间你只有编号、没有评分,只能自己评估</strong>。</p><h3 id="_2-2-一个-cve-是怎么诞生的" tabindex="-1">2.2 一个 CVE 是怎么诞生的 <a class="header-anchor" href="#_2-2-一个-cve-是怎么诞生的" aria-label="Permalink to &quot;2.2 一个 CVE 是怎么诞生的&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 研究员发现漏洞</span></span>
<span class="line"><span>2. 报告给厂商(如果厂商是 CNA,跳过 3)</span></span>
<span class="line"><span>3. 厂商或研究员向 MITRE 申请编号</span></span>
<span class="line"><span>   - 填一个表(漏洞描述、影响产品、PoC 链接)</span></span>
<span class="line"><span>   - MITRE 审核(几天到几周)</span></span>
<span class="line"><span>4. 拿到编号(CVE-YYYY-NNNNN),但**暂不公开**(reserved 状态)</span></span>
<span class="line"><span>5. 厂商发补丁的同一天,CVE 公告同步公开</span></span>
<span class="line"><span>6. NVD 工程师介入,几天后补上 CVSS 评分和 CPE(受影响产品列表)</span></span></code></pre></div><blockquote><p>「reserved」 状态的 CVE <strong>已经分配但没公开内容</strong>——经常在补丁发布前几天就有了编号。<strong>所以你看到一个 reserved CVE,说明某个补丁马上要发了,可以提前盯</strong>。</p></blockquote><h3 id="_2-3-cna-制度的坑" tabindex="-1">2.3 CNA 制度的坑 <a class="header-anchor" href="#_2-3-cna-制度的坑" aria-label="Permalink to &quot;2.3 CNA 制度的坑&quot;">​</a></h3><p><strong>CNA 可以自行决定漏洞要不要发 CVE</strong>——这是一个<strong>结构性 bias</strong>:</p><ul><li>小厂商不想丢脸,<strong>能不发就不发</strong>(尤其内部发现的)</li><li>大厂商有自己的 PSIRT 流程,<strong>信息透明度参差不齐</strong></li><li>同一个漏洞可能拿到多个 CVE(不同产品分别申请)</li><li>同一个 CVE 在不同来源描述可能不一致</li></ul><blockquote><p>实战教训:<strong>不要只看 CVE 数量评估一个产品的「安全水平」</strong>。一个一年没 CVE 的开源库,可能是真没洞,<strong>也可能是没人查它</strong>。</p></blockquote><hr><h2 id="三、cvss-评分-逐位拆解" tabindex="-1">三、CVSS 评分:逐位拆解 <a class="header-anchor" href="#三、cvss-评分-逐位拆解" aria-label="Permalink to &quot;三、CVSS 评分:逐位拆解&quot;">​</a></h2><p>CVSS(Common Vulnerability Scoring System)是给 CVE 打分的标准。<strong>看到「CVSS 9.8」就着急,看到「3.2」就拖延——这个本能基本对,但理解每一位才能避免坑</strong>。</p><p>当前主流是 <strong>CVSS 3.1</strong>(2019 年发布),<strong>CVSS 4.0</strong> 在 2023 年发布、2024 - 2025 年逐步推广,但 NVD 等数据库目前仍以 3.1 为主。</p><h3 id="_3-1-cvss-3-1-的三组指标" tabindex="-1">3.1 CVSS 3.1 的三组指标 <a class="header-anchor" href="#_3-1-cvss-3-1-的三组指标" aria-label="Permalink to &quot;3.1 CVSS 3.1 的三组指标&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Base Score(基础分,8 维)        ← 漏洞本身的属性,不变</span></span>
<span class="line"><span>   │</span></span>
<span class="line"><span>   ├─ Exploitability(可利用性,4 维)</span></span>
<span class="line"><span>   │   AV  Attack Vector       攻击路径</span></span>
<span class="line"><span>   │   AC  Attack Complexity   攻击复杂度</span></span>
<span class="line"><span>   │   PR  Privileges Required 所需权限</span></span>
<span class="line"><span>   │   UI  User Interaction    用户交互</span></span>
<span class="line"><span>   │</span></span>
<span class="line"><span>   ├─ Scope(影响范围,1 维)</span></span>
<span class="line"><span>   │   S   Scope               是否跨越信任边界</span></span>
<span class="line"><span>   │</span></span>
<span class="line"><span>   └─ Impact(影响,3 维)</span></span>
<span class="line"><span>       C   Confidentiality     机密性</span></span>
<span class="line"><span>       I   Integrity           完整性</span></span>
<span class="line"><span>       A   Availability        可用性</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Temporal Score(时间分)         ← 随时间变化:有没有 exploit、有没有补丁</span></span>
<span class="line"><span>Environmental Score(环境分)    ← 你公司的环境:这个洞在你这儿到底多严重</span></span></code></pre></div><p><strong>90% 的人只看 Base Score</strong>。<strong>但真正决定「你要不要紧急修」的是 Environmental Score</strong>——同一个 CVSS 9.8 的洞,你内网管理后台没暴露 = 风险其实是 5,<strong>评分系统给你的是参考,不是判决</strong>。</p><h3 id="_3-2-八个维度逐个拆解" tabindex="-1">3.2 八个维度逐个拆解 <a class="header-anchor" href="#_3-2-八个维度逐个拆解" aria-label="Permalink to &quot;3.2 八个维度逐个拆解&quot;">​</a></h3><table tabindex="0"><thead><tr><th>维度</th><th>缩写</th><th>取值</th><th>含义</th><th>工程意义</th></tr></thead><tbody><tr><td>Attack Vector</td><td>AV</td><td>N / A / L / P</td><td>网络 / 邻近网络 / 本地 / 物理</td><td><strong>N(Network)最危险</strong>:互联网上任何人能打</td></tr><tr><td>Attack Complexity</td><td>AC</td><td>L / H</td><td>低 / 高</td><td><strong>L 比 H 危险</strong>:H 通常要满足额外条件(竞态、特定配置)</td></tr><tr><td>Privileges Required</td><td>PR</td><td>N / L / H</td><td>无 / 低 / 高权限</td><td><strong>N 最危险</strong>:不需要登录就能打</td></tr><tr><td>User Interaction</td><td>UI</td><td>N / R</td><td>不需要 / 需要</td><td><strong>N 最危险</strong>:不需要钓鱼用户点击</td></tr><tr><td>Scope</td><td>S</td><td>U / C</td><td>不变 / 改变</td><td><strong>C(Changed)危险</strong>:漏洞能跨越组件边界(如沙箱逃逸)</td></tr><tr><td>Confidentiality</td><td>C</td><td>N / L / H</td><td>无 / 低 / 高</td><td>信息泄漏程度</td></tr><tr><td>Integrity</td><td>I</td><td>N / L / H</td><td>无 / 低 / 高</td><td>数据被篡改程度</td></tr><tr><td>Availability</td><td>A</td><td>N / L / H</td><td>无 / 低 / 高</td><td>服务被打挂程度</td></tr></tbody></table><p><strong>记忆诀窍</strong>:<strong>AV:N + PR:N + UI:N + C:H/I:H/A:H = 末日级</strong>——网络可达、不要权限、不要用户交互、全 CIA 高影响,<strong>这就是 Log4Shell 那种 9.8 分的洞</strong>。</p><h3 id="_3-3-手算一个例子-log4shell" tabindex="-1">3.3 手算一个例子:Log4Shell <a class="header-anchor" href="#_3-3-手算一个例子-log4shell" aria-label="Permalink to &quot;3.3 手算一个例子:Log4Shell&quot;">​</a></h3><p>CVE-2021-44228 的官方向量字符串:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H</span></span></code></pre></div><p>逐位拆:</p><table tabindex="0"><thead><tr><th>维度</th><th>值</th><th>解释</th><th>数值</th></tr></thead><tbody><tr><td>AV</td><td>N</td><td>攻击者从互联网就能打到</td><td>0.85</td></tr><tr><td>AC</td><td>L</td><td>只要把 <code>\${jndi:...}</code> 字符串塞进任意会被 log 的字段</td><td>0.77</td></tr><tr><td>PR</td><td>N</td><td>不需要登录,匿名用户的输入也能触发</td><td>0.85</td></tr><tr><td>UI</td><td>N</td><td>不需要骗用户点链接,自动触发</td><td>0.85</td></tr><tr><td>S</td><td>U</td><td>攻击在 Java 进程内执行,<strong>没跨组件边界</strong>(所以这里是 U 不是 C)</td><td>(用 U 的公式)</td></tr><tr><td>C</td><td>H</td><td>能读所有进程能读的文件</td><td>0.56</td></tr><tr><td>I</td><td>H</td><td>能修改 / 写文件</td><td>0.56</td></tr><tr><td>A</td><td>H</td><td>能杀进程</td><td>0.56</td></tr></tbody></table><p>公式(Scope = U 的情况):</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Exploitability = 8.22 × AV × AC × PR × UI</span></span>
<span class="line"><span>               = 8.22 × 0.85 × 0.77 × 0.85 × 0.85</span></span>
<span class="line"><span>               ≈ 3.89</span></span>
<span class="line"><span></span></span>
<span class="line"><span>ISS  = 1 − (1 − C)(1 − I)(1 − A)</span></span>
<span class="line"><span>     = 1 − (1 − 0.56)³</span></span>
<span class="line"><span>     = 1 − 0.0852</span></span>
<span class="line"><span>     ≈ 0.9148</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Impact (S=U) = 6.42 × ISS</span></span>
<span class="line"><span>             ≈ 5.87</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Base = roundUp(min(Impact + Exploitability, 10))</span></span>
<span class="line"><span>     = roundUp(min(5.87 + 3.89, 10))</span></span>
<span class="line"><span>     = roundUp(9.76)</span></span>
<span class="line"><span>     = 9.8</span></span></code></pre></div><p><strong>得分:9.8 / 10</strong>。这就是 Log4Shell 当时全行业紧急加班的原因——<strong>这个评分体系下你只能更高没法更高了</strong>。</p><blockquote><p>实际工程中<strong>没人真的手算</strong>,直接用 <a href="https://nvd.nist.gov/vuln-metrics/cvss/v3-calculator" target="_blank" rel="noreferrer">NVD calculator</a>。但你<strong>至少要会读向量字符串</strong>——很多内部审计报告不给分数,只给向量。</p></blockquote><h3 id="_3-4-cvss-4-0-改了什么" tabindex="-1">3.4 CVSS 4.0 改了什么 <a class="header-anchor" href="#_3-4-cvss-4-0-改了什么" aria-label="Permalink to &quot;3.4 CVSS 4.0 改了什么&quot;">​</a></h3><p>CVSS 3.1 的核心吐槽:「<strong>所有 9.8 分的洞都一样紧急吗?显然不是</strong>」。SQL 注入和 RCE 都是 9.8,但严重程度差很多。</p><p>4.0 的改进:</p><ul><li><strong>更多维度</strong>:加入「Attack Requirements(AT)」「Automatable(自动化程度)」「Recovery(恢复难度)」「Value Density」等</li><li><strong>明确「Threat / Environmental」是必填</strong>:Base + Threat + Env 才有意义,不再放任只看 Base</li><li><strong>简化叙述</strong>:命名从「Base / Temporal / Environmental」改成「CVSS-B / CVSS-BT / CVSS-BTE / CVSS-BTE+S」</li></ul><p><strong>实战影响</strong>:<strong>未来 2 - 3 年还是 3.1 为主</strong>,4.0 渗透率上来还需要时间。<strong>你看到 4.0 分数时,要意识到它和 3.1 不能直接比</strong>。</p><hr><h2 id="四、0day-vs-nday-vs-foreverday-三个不一样的世界" tabindex="-1">四、0day vs Nday vs Foreverday:三个不一样的世界 <a class="header-anchor" href="#四、0day-vs-nday-vs-foreverday-三个不一样的世界" aria-label="Permalink to &quot;四、0day vs Nday vs Foreverday:三个不一样的世界&quot;">​</a></h2><p>这三个词被滥用很多,<strong>精确定义如下</strong>:</p><table tabindex="0"><thead><tr><th>概念</th><th>定义</th><th>防御方处境</th><th>攻击方价值</th></tr></thead><tbody><tr><td><strong>0day</strong></td><td>厂商<strong>还没有补丁</strong>的漏洞</td><td>没得修,只能靠 WAF / 网络隔离 / EDR</td><td><strong>最高</strong>(零售价数万到数百万美元)</td></tr><tr><td><strong>Nday</strong></td><td>已有补丁,但<strong>很多目标还没打</strong>的漏洞</td><td>打补丁是唯一正解</td><td>中等(批量扫互联网就行)</td></tr><tr><td><strong>Foreverday</strong></td><td>厂商<strong>永远不会修</strong>的漏洞(产品 EOL、上游不响应)</td><td>只能停用 / 隔离 / 替换</td><td>长期低成本(老设备多年不变)</td></tr></tbody></table><h3 id="_4-1-0day-的两种细分" tabindex="-1">4.1 0day 的两种细分 <a class="header-anchor" href="#_4-1-0day-的两种细分" aria-label="Permalink to &quot;4.1 0day 的两种细分&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>0day(俗称)</span></span>
<span class="line"><span>├── In-the-wild 0day:**已经被实战利用了**,厂商才知道有这个洞</span></span>
<span class="line"><span>│   例:Pegasus 用过的一系列 iMessage 0day</span></span>
<span class="line"><span>└── Vendor-known 0day:**厂商知道但还没出补丁**(在 90 天披露窗口里)</span></span></code></pre></div><p><strong>「In-the-wild 0day」是最恐怖的</strong>——你不知道你已经被打了几个月。Google Project Zero 每年发布的「In-the-Wild 0day 统计」基本是行业风向标。</p><h3 id="_4-2-nday-才是-99-的真实威胁" tabindex="-1">4.2 Nday 才是 99% 的真实威胁 <a class="header-anchor" href="#_4-2-nday-才是-99-的真实威胁" aria-label="Permalink to &quot;4.2 Nday 才是 99% 的真实威胁&quot;">​</a></h3><p>互联网上 99% 的「被入侵」<strong>不是被 0day 打的,是被几年前的 Nday 打的</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>2017 EternalBlue(MS17-010) → 2017 - 2025 一直有人在扫</span></span>
<span class="line"><span>2019 BlueKeep                → 至今仍在扫</span></span>
<span class="line"><span>2021 Log4Shell               → 2025 年仍能扫到没修的目标</span></span>
<span class="line"><span>2023 MOVEit                  → 长尾持续两年</span></span></code></pre></div><blockquote><p><strong>结论</strong>:大多数防御工作不是防 APT 0day,<strong>是「按时打补丁」</strong>。SOC 招人 80% 在做这事。</p></blockquote><h3 id="_4-3-foreverday-的灰色地带" tabindex="-1">4.3 Foreverday 的灰色地带 <a class="header-anchor" href="#_4-3-foreverday-的灰色地带" aria-label="Permalink to &quot;4.3 Foreverday 的灰色地带&quot;">​</a></h3><ul><li><strong>嵌入式设备</strong>:工控、路由器、监控摄像头——厂商倒闭 / 不维护</li><li><strong>EOL 软件</strong>:Windows XP、Python 2、CentOS 6</li><li><strong>闭源中间件</strong>:某些国产 OA / ERP,补丁要付费才出</li></ul><p><strong>应对</strong>:<strong>网络隔离 + 流量监控 + 长期替换计划</strong>——指望厂商修?不存在的。</p><hr><h2 id="五、披露-vs-隐藏-伦理与博弈" tabindex="-1">五、披露 vs 隐藏:伦理与博弈 <a class="header-anchor" href="#五、披露-vs-隐藏-伦理与博弈" aria-label="Permalink to &quot;五、披露 vs 隐藏:伦理与博弈&quot;">​</a></h2><p>研究员发现漏洞后,<strong>怎么处置是一个伦理 + 经济 + 法律的多重博弈</strong>。</p><h3 id="_5-1-三种主流披露模式" tabindex="-1">5.1 三种主流披露模式 <a class="header-anchor" href="#_5-1-三种主流披露模式" aria-label="Permalink to &quot;5.1 三种主流披露模式&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 责任披露(Responsible / Coordinated Disclosure)</span></span>
<span class="line"><span>   研究员私下报厂商 → 协商修复窗口 → 同步公开</span></span>
<span class="line"><span>   - Google Project Zero:**默认 90 天**,到期强制公开</span></span>
<span class="line"><span>   - 微软 / 苹果:常常协商 120-180 天</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. 全公开(Full Disclosure)</span></span>
<span class="line"><span>   研究员直接公开漏洞 + PoC,**不通知厂商或不等修复**</span></span>
<span class="line"><span>   - 早期黑客文化,90 年代主流</span></span>
<span class="line"><span>   - 现在少见,但仍有研究员用此抗议厂商不响应</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. 隐藏不报(Non-disclosure / 武器化)</span></span>
<span class="line"><span>   研究员卖给:</span></span>
<span class="line"><span>   - 国家级买家(Zerodium、政府)</span></span>
<span class="line"><span>   - 攻击组织</span></span>
<span class="line"><span>   - 自己留着</span></span></code></pre></div><h3 id="_5-2-为什么会有「全公开」" tabindex="-1">5.2 为什么会有「全公开」 <a class="header-anchor" href="#_5-2-为什么会有「全公开」" aria-label="Permalink to &quot;5.2 为什么会有「全公开」&quot;">​</a></h3><p>「不是给厂商通知吗,为什么有人要直接公开?」<strong>因为厂商有时不修</strong>:</p><ul><li>「这不是漏洞,是 feature」(经典推诿)</li><li>「补丁要等下个版本,大概 18 个月后」</li><li>「不影响主流用户,不修」</li><li>报告石沉大海,几个月没回复</li></ul><p><strong>全公开是研究员的「核选项」</strong>——「我公开了,你的用户都知道了,你不得不修」。<strong>Project Zero 的 90 天硬期限就是制度化的全公开</strong>,逼厂商不能拖。</p><h3 id="_5-3-漏洞市场-钱、政府、灰色地带" tabindex="-1">5.3 漏洞市场:钱、政府、灰色地带 <a class="header-anchor" href="#_5-3-漏洞市场-钱、政府、灰色地带" aria-label="Permalink to &quot;5.3 漏洞市场:钱、政府、灰色地带&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>合法白市场(漏洞奖金):</span></span>
<span class="line"><span>   HackerOne / Bugcrowd / 厂商自办 SRC</span></span>
<span class="line"><span>   单价:$100 - $250,000(顶级 0day)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>灰市:</span></span>
<span class="line"><span>   Zerodium、Crowdfense 等漏洞掮客</span></span>
<span class="line"><span>   报价:iOS 0-click RCE 可达 $2,500,000</span></span>
<span class="line"><span>   买家不公开,但「主要是西方政府」</span></span>
<span class="line"><span></span></span>
<span class="line"><span>黑市:</span></span>
<span class="line"><span>   勒索软件团伙、APT、CryptoDrainer 团伙</span></span>
<span class="line"><span>   匿名,无道德约束,但有「不要打医院 / 公共设施」的潜规则(有时)</span></span></code></pre></div><blockquote><p>研究员的选择:<strong>白市场赚 1 万,灰市场赚 100 万,但「卖给某政府用来抓异见者」的伦理代价你愿不愿付?</strong> 这是行业里真实存在的内心博弈。</p></blockquote><h3 id="_5-4-厂商的隐藏激励" tabindex="-1">5.4 厂商的隐藏激励 <a class="header-anchor" href="#_5-4-厂商的隐藏激励" aria-label="Permalink to &quot;5.4 厂商的隐藏激励&quot;">​</a></h3><p>厂商也有「隐藏不报」的诱因:</p><ul><li>内部审计发现的洞,<strong>默默修了,不发 CVE</strong>(「Silent Patch」)</li><li>法律部门压力,「公告可能触发集体诉讼」</li><li>公关压力,「连续 CVE 影响股价」</li></ul><p><strong>这就是为什么 Linus Torvalds 长期反对 Linux 单独发 CVE</strong>——他觉得「修就完了,贴 CVE 标签是浪费时间」。但这种做法<strong>苦了下游</strong>:运维不知道该不该急升级,因为没有评分。</p><p><strong>2024 年起 Linux 内核开始作为 CNA 大量发 CVE</strong>——结果是「每周 100+ 内核 CVE」,反而引发「CVE 通胀」的吐槽。<strong>评分系统也在被博弈</strong>。</p><hr><h2 id="六、工程师视角-看到-cve-后的-30-分钟决策流程" tabindex="-1">六、工程师视角:看到 CVE 后的 30 分钟决策流程 <a class="header-anchor" href="#六、工程师视角-看到-cve-后的-30-分钟决策流程" aria-label="Permalink to &quot;六、工程师视角:看到 CVE 后的 30 分钟决策流程&quot;">​</a></h2><p>这是这一篇最实用的部分。<strong>你周一早上看到一个新 CVE,Slack 群里有人 @你「这个我们受不受影响?」</strong>——在 30 分钟内你要给出明确答复。</p><h3 id="_6-1-30-分钟决策流程" tabindex="-1">6.1 30 分钟决策流程 <a class="header-anchor" href="#_6-1-30-分钟决策流程" aria-label="Permalink to &quot;6.1 30 分钟决策流程&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>T+0  ~  T+5min:**分诊**(Triage)</span></span>
<span class="line"><span>   1. 读 CVE 标题 + 受影响产品 + CVSS 分数 + Attack Vector</span></span>
<span class="line"><span>   2. 排除明显不相关:</span></span>
<span class="line"><span>      - 我们用这个产品 / 库吗?(grep 依赖文件)</span></span>
<span class="line"><span>      - AV 是 N 还是 L?(L 通常优先级低很多)</span></span>
<span class="line"><span>      - PR 是 N 还是 H?(H 已经登录的攻击者优先级低)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>T+5  ~  T+15min:**影响面排查**</span></span>
<span class="line"><span>   3. 在仓库 / 镜像里找受影响的版本:</span></span>
<span class="line"><span>      $ rg &quot;log4j-core&quot; --type pom</span></span>
<span class="line"><span>      $ trivy image our-service:latest</span></span>
<span class="line"><span>      $ syft / grype 跑 SBOM</span></span>
<span class="line"><span>   4. 在生产环境核对:</span></span>
<span class="line"><span>      - 公网暴露面有几个?</span></span>
<span class="line"><span>      - 内网调用链里谁会触发?</span></span>
<span class="line"><span>      - 用了易受影响的功能吗?(不是装了就一定中)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>T+15 ~  T+25min:**Exploitability 评估**</span></span>
<span class="line"><span>   5. 有公开 PoC 吗?(GitHub / Twitter / Exploit-DB)</span></span>
<span class="line"><span>   6. 默认配置受影响吗?还是需要特殊配置?</span></span>
<span class="line"><span>   7. 我们的环境里:</span></span>
<span class="line"><span>      - 这个进程能被互联网访问吗?(WAF / 网关在前)</span></span>
<span class="line"><span>      - 这个数据是用户可控的吗?</span></span>
<span class="line"><span>      - 我们的 EDR / IDS 有规则吗?</span></span>
<span class="line"><span></span></span>
<span class="line"><span>T+25 ~  T+30min:**响应决策**</span></span>
<span class="line"><span>   8. 三选一:</span></span>
<span class="line"><span>      a) **紧急修**(&lt;24h):AV:N + PR:N + 公开 PoC + 我们暴露公网 → 战备</span></span>
<span class="line"><span>      b) **常规修**(&lt;7d):有影响但难利用 / 不暴露公网 → 走正常发版</span></span>
<span class="line"><span>      c) **接受风险**(&gt;30d 或不修):无暴露面 / 影响极小 / 修复成本极高</span></span>
<span class="line"><span>   9. 写一份简短判定,放进事件单 / 工单系统</span></span></code></pre></div><h3 id="_6-2-决策矩阵-快速版" tabindex="-1">6.2 决策矩阵(快速版) <a class="header-anchor" href="#_6-2-决策矩阵-快速版" aria-label="Permalink to &quot;6.2 决策矩阵(快速版)&quot;">​</a></h3><table tabindex="0"><thead><tr><th>AV</th><th>PR</th><th>公网暴露</th><th>有公开 PoC</th><th>紧急程度</th></tr></thead><tbody><tr><td>N</td><td>N</td><td>是</td><td>是</td><td><strong>P0:小时级</strong></td></tr><tr><td>N</td><td>N</td><td>是</td><td>否</td><td>P1:24h 内</td></tr><tr><td>N</td><td>L</td><td>是</td><td>是</td><td>P1:24h 内</td></tr><tr><td>N</td><td>N</td><td>否</td><td>任意</td><td>P2:本周</td></tr><tr><td>L</td><td>任意</td><td>任意</td><td>任意</td><td>P3:正常发版</td></tr><tr><td>任意</td><td>H</td><td>任意</td><td>任意</td><td>P3:正常发版</td></tr></tbody></table><blockquote><p>注意:<strong>这只是默认值</strong>。Environmental Score 在你这儿可能完全不同——内部管理后台的「P3」可能比公网服务的「P1」更严重(如果它有最高权限)。</p></blockquote><h3 id="_6-3-一份「这个-cve-我们受不受影响」的回复模板" tabindex="-1">6.3 一份「这个 CVE 我们受不受影响」的回复模板 <a class="header-anchor" href="#_6-3-一份「这个-cve-我们受不受影响」的回复模板" aria-label="Permalink to &quot;6.3 一份「这个 CVE 我们受不受影响」的回复模板&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>受影响判定:[受影响 / 部分受影响 / 不受影响]</span></span>
<span class="line"><span>原因:</span></span>
<span class="line"><span>  - 我们使用 &lt;component&gt; &lt;version&gt;(在 &lt;受影响范围&gt;)</span></span>
<span class="line"><span>  - 暴露面:&lt;公网 / 内网 / 离线&gt;</span></span>
<span class="line"><span>  - 触发条件:&lt;默认配置 / 特定配置 / 需特定操作&gt;</span></span>
<span class="line"><span>  - 公开 PoC 状态:&lt;有 / 无&gt;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>环境分(我们这儿的真实严重程度):</span></span>
<span class="line"><span>  - 修正后 CVSS: &lt;值&gt; (说明)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>建议响应:</span></span>
<span class="line"><span>  - &lt;立即升级到 X.Y.Z / 应用临时缓解 / 跟踪观察&gt;</span></span>
<span class="line"><span>  - 完成时限:&lt;时间&gt;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>负责人:&lt;人 / 团队&gt;</span></span></code></pre></div><p><strong>这份模板可以打印贴墙上</strong>。每个 CVE 用 5 行回答完,<strong>比一句「我们应该没事吧」靠谱 100 倍</strong>。</p><hr><h2 id="七、真实案例-log4shell-和-heartbleed" tabindex="-1">七、真实案例:Log4Shell 和 Heartbleed <a class="header-anchor" href="#七、真实案例-log4shell-和-heartbleed" aria-label="Permalink to &quot;七、真实案例:Log4Shell 和 Heartbleed&quot;">​</a></h2><p>「为什么这两个洞值得每个工程师都看一遍」——<strong>它们都展示了「修一个 CVE 比想象中复杂得多」</strong>。</p><h3 id="_7-1-log4shell-cve-2021-44228-72-小时全行业被打" tabindex="-1">7.1 Log4Shell(CVE-2021-44228):72 小时全行业被打 <a class="header-anchor" href="#_7-1-log4shell-cve-2021-44228-72-小时全行业被打" aria-label="Permalink to &quot;7.1 Log4Shell(CVE-2021-44228):72 小时全行业被打&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>T-8 年   2013-07  Log4j 加入 JNDI lookup 特性(就是漏洞根因)</span></span>
<span class="line"><span>T0      2021-11-24  阿里云陈兆军报给 Apache</span></span>
<span class="line"><span>T+15d   2021-12-09  Apache 发布 2.15.0 + 公告 + PoC 已在 Twitter 流传</span></span>
<span class="line"><span>T+16d   2021-12-10  全网大规模扫描开始</span></span>
<span class="line"><span>T+17d   2021-12-11  发现 2.15.0 没修干净,出 2.16.0</span></span>
<span class="line"><span>T+24d   2021-12-18  发现 2.16.0 还有 DoS 漏洞,出 2.17.0</span></span>
<span class="line"><span>T+27d   2021-12-21  发现 2.17.0 也有问题(CVE-2021-44832),出 2.17.1</span></span></code></pre></div><p><strong>血泪教训</strong>:</p><ul><li><strong>「打了第一个补丁就完事了」是错的</strong>——三周内出了四个补丁版本</li><li><strong>「我们没直接用 Log4j」也可能中招</strong>——它在几百个 Java 框架的传递依赖里(Spring、Solr、Elasticsearch、Kafka 客户端……)</li><li><strong>临时缓解(<code>log4j2.formatMsgNoLookups=true</code>)在某些版本不生效</strong>——只靠环境变量缓解的人被打了第二次</li><li><strong>公网 + 内网都要修</strong>——攻击者拿到一个 SSRF 就能从内网利用</li></ul><h3 id="_7-2-heartbleed-cve-2014-0160-两年泄密窗口" tabindex="-1">7.2 Heartbleed(CVE-2014-0160):两年泄密窗口 <a class="header-anchor" href="#_7-2-heartbleed-cve-2014-0160-两年泄密窗口" aria-label="Permalink to &quot;7.2 Heartbleed(CVE-2014-0160):两年泄密窗口&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>T-2 年   2012-03   OpenSSL 1.0.1 引入 heartbeat 扩展(漏洞引入)</span></span>
<span class="line"><span>T0      2014-03 中旬  Google + Codenomicon 几乎同时发现</span></span>
<span class="line"><span>T+~3w   2014-04-07  OpenSSL 发补丁,heartbleed.com 同步公开,起了营销名 + logo</span></span>
<span class="line"><span>T+1d    2014-04-08  yahoo / OkCupid / Stripe 等主流站点 1 天内修完</span></span>
<span class="line"><span>T+1w    2014-04-15  大量证书因「私钥可能泄漏」紧急吊销 + 换发</span></span>
<span class="line"><span>T+months  2014 Q3   长尾 IoT / 路由器 / 嵌入式设备**至今没修**</span></span></code></pre></div><p><strong>Heartbleed 教会行业的事</strong>:</p><ul><li><strong>首个有「品牌名 + logo + 网站」的漏洞</strong>——披露的方式直接决定影响力,<strong>包装能让更多人重视</strong></li><li><strong>「证书私钥可能已泄漏」是噩梦</strong>——光打补丁不够,还得换私钥 + 换证书 + 吊销旧证书</li><li><strong>OpenSSL 这种「全行业地基」库的资金 / 人手严重不足</strong>——Heartbleed 之后才有了 Core Infrastructure Initiative,后来变成 OpenSSF</li><li><strong>memcpy 不检查长度的 C 代码是慢性病</strong>——这是后来 Rust / 内存安全运动的重要催化剂</li></ul><h3 id="_7-3-两个案例的共同点" tabindex="-1">7.3 两个案例的共同点 <a class="header-anchor" href="#_7-3-两个案例的共同点" aria-label="Permalink to &quot;7.3 两个案例的共同点&quot;">​</a></h3><ul><li><strong>漏洞代码躺了好几年没人发现</strong>——「眼睛多就 bug 少」(Linus&#39; Law)在加密 / 日志这种「看着 boring」的库里<strong>经常失效</strong></li><li><strong>修复不是「一次性」事件</strong>——补丁本身有 bug、传递依赖、配置缓解失效,<strong>一个洞要追三周</strong></li><li><strong>依赖图深度是真实风险</strong>——你的 <code>pom.xml</code> 只有 50 行,<strong>编译出来的 jar 包里有 500 个依赖</strong></li></ul><hr><h2 id="八、踩坑提醒-漏洞响应版" tabindex="-1">八、踩坑提醒(漏洞响应版) <a class="header-anchor" href="#八、踩坑提醒-漏洞响应版" aria-label="Permalink to &quot;八、踩坑提醒(漏洞响应版)&quot;">​</a></h2><ol><li><strong>看 CVSS 9.8 就当末日</strong>——可能你根本不暴露公网,环境分只有 3</li><li><strong>看 CVSS 5.0 就拖延</strong>——可能在你的内部场景下是 P0</li><li><strong>「我们没直接用」就以为安全</strong>——传递依赖比你想的深</li><li><strong>以为厂商发的补丁就修干净了</strong>——Log4j 修了 4 次</li><li><strong>以为「禁用配置」就缓解了</strong>——可能在某些版本不生效</li><li><strong>只看 CVE 标题不看 Vector</strong>——AV / PR / UI 是真正决定紧急程度的位</li><li><strong>忽略 reserved CVE</strong>——这是「补丁马上要发」的预警</li><li><strong>以为 0day 是主要威胁</strong>——99% 是 Nday,补丁打不齐才是真问题</li><li><strong>以为补丁打完就完事</strong>——证书 / 密钥 / 日志检查 / 后门排查,缺一不可</li><li><strong>没有事件回顾(post-mortem)</strong>——下次同样的洞还会卡在同一个地方</li></ol><hr><p>下一篇:<code>04-密码学心智.md</code>,从「随机数为什么这么难造」「哈希、MAC、签名到底有什么区别」「KDF 是什么,为什么 password hash 不是 SHA-256」开始,把密码学从「一堆缩写」变成「几条可推导的工程原则」——看完你就知道为什么「自己造密码原语」是工程灾难,以及怎么在 90% 的场景里不踩坑。</p>`,112)])])}const u=a(e,[["render",l]]);export{h as __pageData,u as default};
