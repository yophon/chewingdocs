import{c as a,Q as n,j as p,m as i}from"./chunks/framework.CBiVa4O3.js";const k=JSON.parse('{"title":"NAT / 子网掩码 / CIDR","description":"","frontmatter":{},"headers":[],"relativePath":"../networkLearning/10-NAT-子网掩码-CIDR.md","filePath":"../networkLearning/10-NAT-子网掩码-CIDR.md","lastUpdated":1778496697000}'),t={name:"../networkLearning/10-NAT-子网掩码-CIDR.md"};function l(e,s,h,c,d,r){return n(),p("div",null,[...s[0]||(s[0]=[i(`<h1 id="nat-子网掩码-cidr" tabindex="-1">NAT / 子网掩码 / CIDR <a class="header-anchor" href="#nat-子网掩码-cidr" aria-label="Permalink to &quot;NAT / 子网掩码 / CIDR&quot;">​</a></h1><p>「子网掩码不就是 255.255.255.0 嘛」——是,但<strong>这背后是 1993 年挽救互联网的一次革命</strong>:<strong>抛弃僵化的 ABC 类划分,改成「随便切」的 CIDR</strong>。<strong>没这次革命,IPv4 1995 年就耗尽,现代互联网不存在</strong>。<strong>而 NAT 是另一次 IPv4 的&quot;续命术&quot;</strong>——<strong>1994 年提出的 RFC 1631,把&quot;全球 IP 不够&quot;的危机推迟了 25 年</strong>。<strong>今天 99% 的家庭 / 企业 / 容器网络都活在 NAT 之下</strong>——但 NAT 不是免费的:<strong>P2P 穿不过、协议头里塞 IP 的全崩、端口耗尽是隐形杀手、运营商级 CGN 把每个家用户挤成 1/100 个公网 IP</strong>。<strong>学完这章你能从容处理 K8s 网络、Docker 多层 NAT、VPN 路由复杂场景</strong>。</p><blockquote><p>一句话先记住:<strong>子网掩码 = 把 IP 切成「网络号 + 主机号」的分隔线</strong>。<strong>CIDR 用 <code>/24</code> 这种「前缀长度」表示,/24 = 255.255.255.0 = 256 个 IP(254 可用,扣广播 + 网络号)</strong>。<strong>NAT = 路由器把「内网 IP+端口」映射到「公网 IP+端口」的状态化转换</strong>——五种类型决定「是否能被外部主动连」(Full Cone 最宽、Symmetric 最严)。<strong>端口耗尽是 NAT 的&quot;硬伤&quot;</strong> —— 单 IP 65535 端口,P2P 上传 / 大量短连接秒打满。<strong>Docker / K8s 网络靠层层 iptables NAT 编织</strong>——<code>iptables -t nat -L</code> 看见百条规则别慌,那是常态。</p></blockquote><hr><h2 id="一、子网掩码-把-ip-一刀切" tabindex="-1">一、子网掩码:把 IP 一刀切 <a class="header-anchor" href="#一、子网掩码-把-ip-一刀切" aria-label="Permalink to &quot;一、子网掩码:把 IP 一刀切&quot;">​</a></h2><h3 id="_1-1-ip-的「网络号-主机号」结构" tabindex="-1">1.1 IP 的「网络号 + 主机号」结构 <a class="header-anchor" href="#_1-1-ip-的「网络号-主机号」结构" aria-label="Permalink to &quot;1.1 IP 的「网络号 + 主机号」结构&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>192.168.1.10 / 255.255.255.0</span></span>
<span class="line"><span>              ↑</span></span>
<span class="line"><span>         子网掩码</span></span>
<span class="line"><span>         </span></span>
<span class="line"><span>二进制:</span></span>
<span class="line"><span>   IP   11000000.10101000.00000001.00001010</span></span>
<span class="line"><span>   Mask 11111111.11111111.11111111.00000000</span></span>
<span class="line"><span>        ─────────────────────────  ────────</span></span>
<span class="line"><span>              网络号                  主机号</span></span>
<span class="line"><span>              192.168.1               .10</span></span></code></pre></div><p><strong>网络号相同的 IP 之间「同子网」</strong>:</p><ul><li>同子网通信:直接走链路层(05),ARP 找 MAC 后发</li><li>跨子网通信:走默认网关(09)</li></ul><h3 id="_1-2-怎么算「同子网」" tabindex="-1">1.2 怎么算「同子网」 <a class="header-anchor" href="#_1-2-怎么算「同子网」" aria-label="Permalink to &quot;1.2 怎么算「同子网」&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>A: 192.168.1.10 / 255.255.255.0</span></span>
<span class="line"><span>B: 192.168.1.50 / 255.255.255.0</span></span>
<span class="line"><span></span></span>
<span class="line"><span>A 的网络号:192.168.1.10 &amp; 255.255.255.0 = 192.168.1.0</span></span>
<span class="line"><span>B 的网络号:192.168.1.50 &amp; 255.255.255.0 = 192.168.1.0</span></span>
<span class="line"><span>→ 网络号相同 → 同子网 → 直连</span></span></code></pre></div><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>A: 192.168.1.10 / 255.255.255.0</span></span>
<span class="line"><span>C: 192.168.2.10 / 255.255.255.0</span></span>
<span class="line"><span></span></span>
<span class="line"><span>A 的网络号:192.168.1.0</span></span>
<span class="line"><span>C 的网络号:192.168.2.0</span></span>
<span class="line"><span>→ 不同子网 → 必须经过路由器(网关)</span></span></code></pre></div><p><strong>这是网络栈每次发包都要做的判断</strong>——决定下一步是 ARP 找目标 MAC,还是 ARP 找网关 MAC。</p><h3 id="_1-3-子网掩码的「连续-1」规则" tabindex="-1">1.3 子网掩码的「连续 1」规则 <a class="header-anchor" href="#_1-3-子网掩码的「连续-1」规则" aria-label="Permalink to &quot;1.3 子网掩码的「连续 1」规则&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>合法:255.255.255.0      (24 个 1 + 8 个 0)</span></span>
<span class="line"><span>合法:255.255.255.192    (26 个 1 + 6 个 0)</span></span>
<span class="line"><span>合法:255.0.0.0          (8 个 1 + 24 个 0)</span></span>
<span class="line"><span>非法:255.255.0.255      (1 不连续,大部分实现拒绝)</span></span></code></pre></div><p><strong>所有现代设备都要求子网掩码「前导 1 必须连续」</strong>——非连续掩码理论上 RFC 允许,但实际工程基本禁止。</p><hr><h2 id="二、cidr-1993-年的革命" tabindex="-1">二、CIDR:1993 年的革命 <a class="header-anchor" href="#二、cidr-1993-年的革命" aria-label="Permalink to &quot;二、CIDR:1993 年的革命&quot;">​</a></h2><h3 id="_2-1-历史背景-分类地址的悲剧" tabindex="-1">2.1 历史背景:分类地址的悲剧 <a class="header-anchor" href="#_2-1-历史背景-分类地址的悲剧" aria-label="Permalink to &quot;2.1 历史背景:分类地址的悲剧&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1981 年的 IPv4(RFC 791):</span></span>
<span class="line"><span>  地址按首字节分 ABC 类</span></span>
<span class="line"><span>  A 类:首位 0,网络号 8 位,主机号 24 位 → 1600 万个主机/网络</span></span>
<span class="line"><span>  B 类:首两位 10,网络号 16 位,主机号 16 位 → 65534 个主机/网络</span></span>
<span class="line"><span>  C 类:首三位 110,网络号 24 位,主机号 8 位 → 254 个主机/网络</span></span>
<span class="line"><span></span></span>
<span class="line"><span>问题:粒度粗暴</span></span>
<span class="line"><span>  - 大学申请 B 类(6.5 万 IP),实际只用几百个 → 浪费 99%</span></span>
<span class="line"><span>  - 中型企业 C 类(254 IP)不够,要再申一个 C 类 → 路由表爆炸</span></span>
<span class="line"><span>  - 1991-1993 年:B 类即将耗尽,公网路由表 7 万条增长不止</span></span></code></pre></div><h3 id="_2-2-cidr-怎么解" tabindex="-1">2.2 CIDR 怎么解 <a class="header-anchor" href="#_2-2-cidr-怎么解" aria-label="Permalink to &quot;2.2 CIDR 怎么解&quot;">​</a></h3><p><strong>CIDR(Classless Inter-Domain Routing,RFC 1518/1519,1993)</strong> 的核心:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 抛弃 ABC 类,改成「任意长度前缀」</span></span>
<span class="line"><span>   /20 = 4096 个 IP(给中型企业)</span></span>
<span class="line"><span>   /24 = 256 个 IP(给小公司)</span></span>
<span class="line"><span>   /28 = 16 个 IP(给 P2P 链路)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. 路由聚合(Aggregation)</span></span>
<span class="line"><span>   AS 内有 16 条 /24 路由 → 对外宣告 1 条 /20</span></span>
<span class="line"><span>   → 路由表压缩</span></span></code></pre></div><h3 id="_2-3-cidr-表示法速查" tabindex="-1">2.3 CIDR 表示法速查 <a class="header-anchor" href="#_2-3-cidr-表示法速查" aria-label="Permalink to &quot;2.3 CIDR 表示法速查&quot;">​</a></h3><table tabindex="0"><thead><tr><th>前缀</th><th>子网掩码</th><th>主机数</th><th>用途</th></tr></thead><tbody><tr><td>/8</td><td>255.0.0.0</td><td>16,777,214</td><td>大型 ISP / 整个 A 类</td></tr><tr><td>/16</td><td>255.255.0.0</td><td>65,534</td><td>大企业 / B 类</td></tr><tr><td>/20</td><td>255.255.240.0</td><td>4,094</td><td>中型企业</td></tr><tr><td>/22</td><td>255.255.252.0</td><td>1,022</td><td>小型企业</td></tr><tr><td>/24</td><td>255.255.255.0</td><td>254</td><td>小子网(最常见)</td></tr><tr><td>/25</td><td>255.255.255.128</td><td>126</td><td>切两半</td></tr><tr><td>/26</td><td>255.255.255.192</td><td>62</td><td>切四块</td></tr><tr><td>/27</td><td>255.255.255.224</td><td>30</td><td>小机房</td></tr><tr><td>/28</td><td>255.255.255.240</td><td>14</td><td>DMZ / 小段</td></tr><tr><td>/29</td><td>255.255.255.248</td><td>6</td><td>服务器小段</td></tr><tr><td>/30</td><td>255.255.255.252</td><td>2</td><td>P2P 链路(最经济)</td></tr><tr><td>/31</td><td>255.255.255.254</td><td>2</td><td>P2P(RFC 3021,无网络号 / 广播号)</td></tr><tr><td>/32</td><td>255.255.255.255</td><td>1</td><td>单 IP(loopback / VIP)</td></tr></tbody></table><p><strong>主机数 = 2^(32-prefix) - 2</strong>(扣去网络号 + 广播号),除了 /31 / /32 例外。</p><h3 id="_2-4-cidr-实战-切子网" tabindex="-1">2.4 CIDR 实战:切子网 <a class="header-anchor" href="#_2-4-cidr-实战-切子网" aria-label="Permalink to &quot;2.4 CIDR 实战:切子网&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>公司分到 192.168.0.0/24(256 个 IP)</span></span>
<span class="line"><span>要切 4 个部门各 64 个</span></span>
<span class="line"><span></span></span>
<span class="line"><span>192.168.0.0/26     (.0 - .63)    → 部门 A</span></span>
<span class="line"><span>192.168.0.64/26    (.64 - .127)  → 部门 B</span></span>
<span class="line"><span>192.168.0.128/26   (.128 - .191) → 部门 C</span></span>
<span class="line"><span>192.168.0.192/26   (.192 - .255) → 部门 D</span></span>
<span class="line"><span></span></span>
<span class="line"><span>每个部门:</span></span>
<span class="line"><span>  62 可用 IP(扣网络号 .X 和广播号 .X+63)</span></span>
<span class="line"><span>  默认网关通常用 .X+1 或 .X+62</span></span></code></pre></div><h3 id="_2-5-超网-聚合" tabindex="-1">2.5 超网:聚合 <a class="header-anchor" href="#_2-5-超网-聚合" aria-label="Permalink to &quot;2.5 超网:聚合&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>公司有 4 个 /24:</span></span>
<span class="line"><span>  10.1.0.0/24</span></span>
<span class="line"><span>  10.1.1.0/24</span></span>
<span class="line"><span>  10.1.2.0/24</span></span>
<span class="line"><span>  10.1.3.0/24</span></span>
<span class="line"><span></span></span>
<span class="line"><span>→ 对外宣告 10.1.0.0/22(包含全部 4 个 /24)</span></span>
<span class="line"><span>→ 路由表里 4 条变 1 条</span></span>
<span class="line"><span></span></span>
<span class="line"><span>这就是「路由聚合(Route Aggregation)」</span></span></code></pre></div><blockquote><p>经验法则:<strong>会算 CIDR 是网络工程师的入门关</strong>——闭着眼能算出 <code>10.20.30.0/27</code> 的范围(.0 - .31)、能从 4 个连续 /24 推出 /22。</p></blockquote><hr><h2 id="三、nat-把内网藏在公网-ip-后面" tabindex="-1">三、NAT:把内网藏在公网 IP 后面 <a class="header-anchor" href="#三、nat-把内网藏在公网-ip-后面" aria-label="Permalink to &quot;三、NAT:把内网藏在公网 IP 后面&quot;">​</a></h2><h3 id="_3-1-nat-解决什么" tabindex="-1">3.1 NAT 解决什么 <a class="header-anchor" href="#_3-1-nat-解决什么" aria-label="Permalink to &quot;3.1 NAT 解决什么&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>公司内网有 1000 台机器,用 192.168.1.0/24</span></span>
<span class="line"><span>公网 IP 只有 1 个:1.2.3.4</span></span>
<span class="line"><span></span></span>
<span class="line"><span>怎么让 1000 台机器都能访问公网?</span></span>
<span class="line"><span>→ NAT 路由器把 192.168.1.X:port 映射成 1.2.3.4:port&#39;</span></span>
<span class="line"><span>→ 共享 1 个公网 IP</span></span></code></pre></div><p><strong>NAT(Network Address Translation,RFC 1631,1994)</strong> 是 IPv4 续命的核心。</p><h3 id="_3-2-nat-工作流程-最简单的-snat" tabindex="-1">3.2 NAT 工作流程(最简单的 SNAT) <a class="header-anchor" href="#_3-2-nat-工作流程-最简单的-snat" aria-label="Permalink to &quot;3.2 NAT 工作流程(最简单的 SNAT)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>内网主机 A:192.168.1.10:54321 → 8.8.8.8:443</span></span>
<span class="line"><span></span></span>
<span class="line"><span>包到达 NAT 路由器:</span></span>
<span class="line"><span>  原:src = 192.168.1.10:54321, dst = 8.8.8.8:443</span></span>
<span class="line"><span>  改:src = 1.2.3.4:60000      dst = 8.8.8.8:443</span></span>
<span class="line"><span>                  ↑ 公网 IP</span></span>
<span class="line"><span>                       ↑ 路由器随机分配的端口</span></span>
<span class="line"><span></span></span>
<span class="line"><span>路由器在「NAT 表」里记一条:</span></span>
<span class="line"><span>  (1.2.3.4:60000) ↔ (192.168.1.10:54321)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>8.8.8.8 回包:</span></span>
<span class="line"><span>  src = 8.8.8.8:443, dst = 1.2.3.4:60000</span></span>
<span class="line"><span></span></span>
<span class="line"><span>路由器查 NAT 表:</span></span>
<span class="line"><span>  60000 → 192.168.1.10:54321</span></span>
<span class="line"><span>  改:src = 8.8.8.8:443, dst = 192.168.1.10:54321</span></span>
<span class="line"><span></span></span>
<span class="line"><span>发回 A</span></span></code></pre></div><h3 id="_3-3-snat-vs-dnat" tabindex="-1">3.3 SNAT vs DNAT <a class="header-anchor" href="#_3-3-snat-vs-dnat" aria-label="Permalink to &quot;3.3 SNAT vs DNAT&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>SNAT (Source NAT)</span></span>
<span class="line"><span>  改源地址,通常用于「内网出公网」</span></span>
<span class="line"><span>  路由器主动选公网端口</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>DNAT (Destination NAT)</span></span>
<span class="line"><span>  改目标地址,通常用于「公网访问内网服务」</span></span>
<span class="line"><span>  端口转发(把公网 8080 映射到内网某机的 80)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>MASQUERADE</span></span>
<span class="line"><span>  SNAT 的特例:出接口 IP 自动当公网 IP(适合动态 IP 环境)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>PAT (Port Address Translation)</span></span>
<span class="line"><span>  端口级 NAT(1 公网 IP 给多个内网 IP 共享)</span></span>
<span class="line"><span>  现代「NAT」基本都是 PAT</span></span></code></pre></div><hr><h2 id="四、nat-五种类型-决定-p2p-能不能穿" tabindex="-1">四、NAT 五种类型:决定 P2P 能不能穿 <a class="header-anchor" href="#四、nat-五种类型-决定-p2p-能不能穿" aria-label="Permalink to &quot;四、NAT 五种类型:决定 P2P 能不能穿&quot;">​</a></h2><p>不同的 NAT 设备对「外部能否主动连进来」有不同策略。STUN(RFC 3489)定义了 5 种:</p><h3 id="_4-1-full-cone-nat-锥形-全圆锥" tabindex="-1">4.1 Full Cone NAT(锥形 / 全圆锥) <a class="header-anchor" href="#_4-1-full-cone-nat-锥形-全圆锥" aria-label="Permalink to &quot;4.1 Full Cone NAT(锥形 / 全圆锥)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>内网 A:192.168.1.10:54321</span></span>
<span class="line"><span>打到公网映射:1.2.3.4:60000</span></span>
<span class="line"><span></span></span>
<span class="line"><span>任何外部主机:都能 1.2.3.4:60000 主动连进来</span></span>
<span class="line"><span>→ 外部把这个映射当「全开」</span></span>
<span class="line"><span>→ A 暴露在外网</span></span>
<span class="line"><span></span></span>
<span class="line"><span>最宽松,P2P 最友好</span></span>
<span class="line"><span>家用路由器很多是 Full Cone</span></span></code></pre></div><h3 id="_4-2-restricted-cone-nat-限制锥形" tabindex="-1">4.2 Restricted Cone NAT(限制锥形) <a class="header-anchor" href="#_4-2-restricted-cone-nat-限制锥形" aria-label="Permalink to &quot;4.2 Restricted Cone NAT(限制锥形)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>内网 A 必须先连过外部 B 的 IP</span></span>
<span class="line"><span>之后 B 才能从任意端口连回 1.2.3.4:60000</span></span>
<span class="line"><span></span></span>
<span class="line"><span>只过滤 IP,不过滤端口</span></span></code></pre></div><h3 id="_4-3-port-restricted-cone-nat-端口限制锥形" tabindex="-1">4.3 Port Restricted Cone NAT(端口限制锥形) <a class="header-anchor" href="#_4-3-port-restricted-cone-nat-端口限制锥形" aria-label="Permalink to &quot;4.3 Port Restricted Cone NAT(端口限制锥形)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>内网 A 必须先连过外部 B 的「具体 IP+端口」</span></span>
<span class="line"><span>之后 B 必须从「同一 IP+同一端口」连回</span></span>
<span class="line"><span></span></span>
<span class="line"><span>更严</span></span></code></pre></div><h3 id="_4-4-symmetric-nat-对称型" tabindex="-1">4.4 Symmetric NAT(对称型) <a class="header-anchor" href="#_4-4-symmetric-nat-对称型" aria-label="Permalink to &quot;4.4 Symmetric NAT(对称型)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>A → B1:1234,映射 1.2.3.4:60000</span></span>
<span class="line"><span>A → B2:5678,映射 1.2.3.4:60001</span></span>
<span class="line"><span>                          ↑ 不同目标 → 不同公网端口</span></span>
<span class="line"><span></span></span>
<span class="line"><span>外部任何主机连 1.2.3.4:60000:</span></span>
<span class="line"><span>  路由器查表:这个端口只对 B1:1234 有效</span></span>
<span class="line"><span>  其他来源全拒</span></span>
<span class="line"><span></span></span>
<span class="line"><span>最严,P2P 几乎打不穿</span></span>
<span class="line"><span>公司路由器、运营商 CGN 多是 Symmetric</span></span></code></pre></div><h3 id="_4-5-类型对比表" tabindex="-1">4.5 类型对比表 <a class="header-anchor" href="#_4-5-类型对比表" aria-label="Permalink to &quot;4.5 类型对比表&quot;">​</a></h3><table tabindex="0"><thead><tr><th>NAT 类型</th><th>端口映射规则</th><th>外部能否主动连</th><th>P2P 难度</th></tr></thead><tbody><tr><td>Full Cone</td><td>一个内网 IP+端口 → 一个公网端口</td><td>任何外部都能</td><td>容易</td></tr><tr><td>Restricted Cone</td><td>同上,但只接受发过的 IP</td><td>发过的 IP 才能</td><td>中</td></tr><tr><td>Port Restricted Cone</td><td>同上,但只接受发过的 IP+端口</td><td>发过的端口才能</td><td>中</td></tr><tr><td>Symmetric</td><td>不同目标 → 不同公网端口</td><td>几乎不可能</td><td>难(必须 TURN 中继)</td></tr></tbody></table><h3 id="_4-6-p2p-怎么穿-stun-turn-ice-webrtc-详见-26" tabindex="-1">4.6 P2P 怎么穿:STUN / TURN / ICE(WebRTC 详见 26) <a class="header-anchor" href="#_4-6-p2p-怎么穿-stun-turn-ice-webrtc-详见-26" aria-label="Permalink to &quot;4.6 P2P 怎么穿:STUN / TURN / ICE(WebRTC 详见 26)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>STUN:让客户端知道自己是哪种 NAT + 公网映射端口</span></span>
<span class="line"><span>TURN:中继(谁也连不上时,数据走中继服务器)</span></span>
<span class="line"><span>ICE:综合策略(优先 P2P,失败回退 TURN)</span></span></code></pre></div><blockquote><p>经验法则:<strong>家庭网络 ≈ Full Cone / Restricted,P2P 能打</strong>;<strong>写字楼 / 企业网 ≈ Symmetric,P2P 必须走 TURN 中继</strong>。<strong>WebRTC / 游戏 / VoIP 都得做这套</strong>。</p></blockquote><hr><h2 id="五、nat-状态表-内存炸点" tabindex="-1">五、NAT 状态表:内存炸点 <a class="header-anchor" href="#五、nat-状态表-内存炸点" aria-label="Permalink to &quot;五、NAT 状态表:内存炸点&quot;">​</a></h2><h3 id="_5-1-nat-表的样子" tabindex="-1">5.1 NAT 表的样子 <a class="header-anchor" href="#_5-1-nat-表的样子" aria-label="Permalink to &quot;5.1 NAT 表的样子&quot;">​</a></h3><p>每条 NAT 映射就是一条状态:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>内网 IP:Port  ↔  公网 IP:Port  +  目标 IP:Port  +  协议  +  超时</span></span>
<span class="line"><span>192.168.1.10:54321 ↔ 1.2.3.4:60000 → 8.8.8.8:443  TCP  300s</span></span>
<span class="line"><span>192.168.1.10:54322 ↔ 1.2.3.4:60001 → 1.1.1.1:443  TCP  300s</span></span>
<span class="line"><span>192.168.1.20:33333 ↔ 1.2.3.4:60002 → 8.8.8.8:53   UDP   30s</span></span>
<span class="line"><span>...</span></span></code></pre></div><h3 id="_5-2-状态超时" tabindex="-1">5.2 状态超时 <a class="header-anchor" href="#_5-2-状态超时" aria-label="Permalink to &quot;5.2 状态超时&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>TCP ESTABLISHED:    默认 5 天(为了长连接,但太长占内存)</span></span>
<span class="line"><span>TCP TIME_WAIT:      120 秒</span></span>
<span class="line"><span>TCP SYN_SENT:       60 秒</span></span>
<span class="line"><span>UDP:               30-180 秒(无连接,只能定时清)</span></span>
<span class="line"><span>ICMP:              30 秒</span></span></code></pre></div><p><code>/proc/sys/net/netfilter/nf_conntrack_tcp_timeout_*</code> 可以调。</p><h3 id="_5-3-状态表大小" tabindex="-1">5.3 状态表大小 <a class="header-anchor" href="#_5-3-状态表大小" aria-label="Permalink to &quot;5.3 状态表大小&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Linux 看</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sysctl</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> net.netfilter.nf_conntrack_max</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 默认 ~65k(小机器)~ 几十万(大机器)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 看当前条数</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">cat</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /proc/sys/net/netfilter/nf_conntrack_count</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 看到顶了 → 满了再来包就丢</span></span></code></pre></div><p><strong>生产事故 Top</strong>:<code>conntrack_max</code> 太小,某次大流量打到上限,新连接全部建不起。</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 调大</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> sysctl</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -w</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> net.netfilter.nf_conntrack_max=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">1048576</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> sysctl</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -w</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> net.netfilter.nf_conntrack_buckets=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">262144</span></span></code></pre></div><hr><h2 id="六、端口耗尽-nat-的硬伤" tabindex="-1">六、端口耗尽:NAT 的硬伤 <a class="header-anchor" href="#六、端口耗尽-nat-的硬伤" aria-label="Permalink to &quot;六、端口耗尽:NAT 的硬伤&quot;">​</a></h2><h3 id="_6-1-为什么会耗尽" tabindex="-1">6.1 为什么会耗尽 <a class="header-anchor" href="#_6-1-为什么会耗尽" aria-label="Permalink to &quot;6.1 为什么会耗尽&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>单个公网 IP,端口范围 1-65535</span></span>
<span class="line"><span>通常 1024 以下保留给系统</span></span>
<span class="line"><span>可用约 64512 个端口</span></span>
<span class="line"><span></span></span>
<span class="line"><span>每个内网→外网的连接占 1 个端口</span></span>
<span class="line"><span>1000 个内网用户,每人开 65 个长连接 = 65000 端口 → 打满</span></span></code></pre></div><h3 id="_6-2-真实场景" tabindex="-1">6.2 真实场景 <a class="header-anchor" href="#_6-2-真实场景" aria-label="Permalink to &quot;6.2 真实场景&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. P2P 上传(BT / 区块链)</span></span>
<span class="line"><span>   单机几千个并发连接,占满本机端口</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. 高频短连接(秒杀 / 爬虫)</span></span>
<span class="line"><span>   每秒几千连接,close 后还要等 TIME_WAIT(60 秒)</span></span>
<span class="line"><span>   累积端口占用快速</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. 微服务 + 服务网格</span></span>
<span class="line"><span>   一个服务到另一个的 1 万并发,出口 NAT 端口爆</span></span>
<span class="line"><span></span></span>
<span class="line"><span>4. 运营商 CGN</span></span>
<span class="line"><span>   1 个公网 IP 给 1000 个家庭,人均 65 个端口</span></span>
<span class="line"><span>   高峰期某些应用直接连不上</span></span></code></pre></div><h3 id="_6-3-怎么解" tabindex="-1">6.3 怎么解 <a class="header-anchor" href="#_6-3-怎么解" aria-label="Permalink to &quot;6.3 怎么解&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 调大端口范围</span></span>
<span class="line"><span>   sysctl net.ipv4.ip_local_port_range = &quot;1024 65535&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. 缩短 TIME_WAIT</span></span>
<span class="line"><span>   sysctl net.ipv4.tcp_tw_reuse = 1</span></span>
<span class="line"><span>   sysctl net.ipv4.tcp_tw_recycle = 1   # 注意:NAT 后慎用,见后</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. 增加公网 IP(NAT 池)</span></span>
<span class="line"><span>   多 IP 轮询出公网,扩展端口空间 N 倍</span></span>
<span class="line"><span></span></span>
<span class="line"><span>4. SNAT 池</span></span>
<span class="line"><span>   iptables -t nat -A POSTROUTING -j SNAT --to-source 1.2.3.4-1.2.3.10</span></span>
<span class="line"><span></span></span>
<span class="line"><span>5. 升级到 IPv6(根本解决)</span></span></code></pre></div><h3 id="_6-4-tcp-tw-recycle-大坑" tabindex="-1">6.4 tcp_tw_recycle 大坑 <a class="header-anchor" href="#_6-4-tcp-tw-recycle-大坑" aria-label="Permalink to &quot;6.4 tcp_tw_recycle 大坑&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>tcp_tw_recycle 利用「快速时间戳」复用 TIME_WAIT</span></span>
<span class="line"><span>但在 NAT 场景下:</span></span>
<span class="line"><span>  NAT 后多个内网客户端的时间戳不同步</span></span>
<span class="line"><span>  服务器看到「老时间戳」就拒绝新连接</span></span>
<span class="line"><span>  → 部分用户随机连不上</span></span></code></pre></div><p><strong>Linux 4.12 直接删除了这个选项</strong>——「不能用了」。</p><blockquote><p>经验法则:<strong>生产服务器 tcp_tw_recycle 永远关</strong>(默认就是关),<code>tcp_tw_reuse</code> 一般可以开,但<strong>别在 NAT 后的客户端开</strong>。</p></blockquote><hr><h2 id="七、cgn-运营商级-nat" tabindex="-1">七、CGN:运营商级 NAT <a class="header-anchor" href="#七、cgn-运营商级-nat" aria-label="Permalink to &quot;七、CGN:运营商级 NAT&quot;">​</a></h2><h3 id="_7-1-为什么有-cgn" tabindex="-1">7.1 为什么有 CGN <a class="header-anchor" href="#_7-1-为什么有-cgn" aria-label="Permalink to &quot;7.1 为什么有 CGN&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>普通家庭 NAT:</span></span>
<span class="line"><span>  1 个公网 IP → 1 个家庭(几台设备)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>但运营商公网 IP 也不够了</span></span>
<span class="line"><span>→ 把 N 个家庭 NAT 到 1 个公网 IP</span></span>
<span class="line"><span>→ Carrier-Grade NAT (CGN)</span></span></code></pre></div><h3 id="_7-2-cgn-用的私网段-100-64-0-0-10" tabindex="-1">7.2 CGN 用的私网段:100.64.0.0/10 <a class="header-anchor" href="#_7-2-cgn-用的私网段-100-64-0-0-10" aria-label="Permalink to &quot;7.2 CGN 用的私网段:100.64.0.0/10&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>RFC 6598 (2012) 定义专用段:</span></span>
<span class="line"><span>  100.64.0.0/10  ←  4M 个地址,专门给 CGN</span></span>
<span class="line"><span></span></span>
<span class="line"><span>为什么不用 192.168 / 10.x?</span></span>
<span class="line"><span>  → 用户家里就是 192.168.X</span></span>
<span class="line"><span>  → CGN 也用 192.168.X 会冲突</span></span>
<span class="line"><span>  → 单独搞一段 100.64.X</span></span></code></pre></div><p><strong>抓包看到 100.64.X.X 在 traceroute 第二跳</strong>——典型电信宽带 CGN。</p><h3 id="_7-3-cgn-的代价" tabindex="-1">7.3 CGN 的代价 <a class="header-anchor" href="#_7-3-cgn-的代价" aria-label="Permalink to &quot;7.3 CGN 的代价&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. P2P 几乎不能用(双重 NAT,STUN 也搞不定)</span></span>
<span class="line"><span>2. 端口超少(几千用户共享 1 IP,人均 &lt; 100 端口)</span></span>
<span class="line"><span>3. 应用兼容性差(SIP / FTP 等老协议崩)</span></span>
<span class="line"><span>4. 法律审计困难(同一公网 IP 同时几千用户)</span></span>
<span class="line"><span>5. PMTUD 经常失败(详见 06)</span></span></code></pre></div><h3 id="_7-4-哪些运营商在用" tabindex="-1">7.4 哪些运营商在用 <a class="header-anchor" href="#_7-4-哪些运营商在用" aria-label="Permalink to &quot;7.4 哪些运营商在用&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>中国:</span></span>
<span class="line"><span>  电信:部分省份家宽用 CGN(默认),企业宽带还有公网 IP</span></span>
<span class="line"><span>  联通:类似</span></span>
<span class="line"><span>  移动:几乎全 CGN</span></span>
<span class="line"><span></span></span>
<span class="line"><span>国外:</span></span>
<span class="line"><span>  T-Mobile US:CGN</span></span>
<span class="line"><span>  欧洲 Vodafone:部分 CGN</span></span>
<span class="line"><span>  日本 NTT 光纤:多数还有公网 IPv4</span></span></code></pre></div><blockquote><p>经验法则:<strong>家用宽带要做 P2P / 内网穿透 / 自建服务器,先确认有没有公网 IPv4</strong>——办宽带时单独给运营商打电话要「公网 IP」(可能加钱)。</p></blockquote><hr><h2 id="八、docker-k8s-网络的-nat-链" tabindex="-1">八、Docker / K8s 网络的 NAT 链 <a class="header-anchor" href="#八、docker-k8s-网络的-nat-链" aria-label="Permalink to &quot;八、Docker / K8s 网络的 NAT 链&quot;">​</a></h2><h3 id="_8-1-docker-默认网络" tabindex="-1">8.1 Docker 默认网络 <a class="header-anchor" href="#_8-1-docker-默认网络" aria-label="Permalink to &quot;8.1 Docker 默认网络&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Docker 起一个容器,默认用 bridge 网络</span></span>
<span class="line"><span>   宿主机:1.2.3.4</span></span>
<span class="line"><span>   docker0 网桥:172.17.0.1/16</span></span>
<span class="line"><span>   容器 A:172.17.0.2</span></span>
<span class="line"><span></span></span>
<span class="line"><span>容器 A 访问外网 8.8.8.8:</span></span>
<span class="line"><span>   1. 出 172.17.0.2 → docker0</span></span>
<span class="line"><span>   2. iptables MASQUERADE 改源 IP 为宿主机 1.2.3.4</span></span>
<span class="line"><span>   3. 走宿主机网卡出去</span></span>
<span class="line"><span></span></span>
<span class="line"><span>公网回包到 1.2.3.4 → 宿主机查 conntrack 表 → 还原成 172.17.0.2 → 进容器</span></span></code></pre></div><h3 id="_8-2-看-docker-的-nat-规则" tabindex="-1">8.2 看 Docker 的 NAT 规则 <a class="header-anchor" href="#_8-2-看-docker-的-nat-规则" aria-label="Permalink to &quot;8.2 看 Docker 的 NAT 规则&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> iptables</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -t</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> nat</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -L</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -n</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">Chain</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> POSTROUTING</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (policy </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">ACCEPT</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">target</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">     prot</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> opt</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> source</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">               destination</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">MASQUERADE</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  all</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  --</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  172.17.0.0/16</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">        0.0.0.0/0</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">                                              ↑</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">                              docker</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 自动加的</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> SNAT</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 规则</span></span></code></pre></div><h3 id="_8-3-docker-port-forward-dnat" tabindex="-1">8.3 Docker port-forward(DNAT) <a class="header-anchor" href="#_8-3-docker-port-forward-dnat" aria-label="Permalink to &quot;8.3 Docker port-forward(DNAT)&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">docker</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> run</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -p</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 8080:80</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> nginx</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 实际加了:</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> iptables</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -t</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> nat</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -L</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> PREROUTING</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -n</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">DNAT</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  tcp</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  --</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  0.0.0.0/0</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">   0.0.0.0/0</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">   tcp</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> dpt:8080</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  to:172.17.0.2:80</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">                                                          ↑</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">                                               目标</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> NAT</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 到容器</span></span></code></pre></div><h3 id="_8-4-k8s-的-nat-链" tabindex="-1">8.4 K8s 的 NAT 链 <a class="header-anchor" href="#_8-4-k8s-的-nat-链" aria-label="Permalink to &quot;8.4 K8s 的 NAT 链&quot;">​</a></h3><p>K8s 网络比 Docker 复杂多倍——每个 Service 都对应一组 iptables 规则:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> iptables</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -t</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> nat</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -L</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -n</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> |</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> wc</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -l</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 通常 几百到几千行</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Service 类型:</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">ClusterIP</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    内部服务,DNAT</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 到一组</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> Pod</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">NodePort</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">     宿主机端口,先</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> DNAT</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 到</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ClusterIP</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 再到</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> Pod</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">LoadBalancer</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 云厂商</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> LB</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> →</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> NodePort</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> →</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ClusterIP</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> →</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> Pod</span></span></code></pre></div><p>每跳都过一次 iptables 规则。<strong>这就是为什么 K8s 网络成为 CPU 瓶颈</strong>——大集群有几千 Service,每个包要遍历几千 iptables 规则。</p><h3 id="_8-5-替代方案-ipvs-ebpf" tabindex="-1">8.5 替代方案:IPVS / eBPF <a class="header-anchor" href="#_8-5-替代方案-ipvs-ebpf" aria-label="Permalink to &quot;8.5 替代方案:IPVS / eBPF&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>kube-proxy 模式:</span></span>
<span class="line"><span>  iptables:每个 Service 一组规则,O(N)</span></span>
<span class="line"><span>  IPVS:    哈希表 O(1),大集群必选</span></span>
<span class="line"><span>  eBPF (Cilium):内核插桩,跳过 iptables,最快</span></span>
<span class="line"><span></span></span>
<span class="line"><span>对比:</span></span>
<span class="line"><span>  1000 Service × 5 Pod 时:</span></span>
<span class="line"><span>  iptables 模式  延迟 ~50μs / 连接</span></span>
<span class="line"><span>  IPVS 模式      延迟 ~5μs / 连接</span></span>
<span class="line"><span>  Cilium         延迟 ~2μs / 连接</span></span></code></pre></div><p>详见 33 篇 eBPF / XDP。</p><hr><h2 id="九、抓-nat-包" tabindex="-1">九、抓 NAT 包 <a class="header-anchor" href="#九、抓-nat-包" aria-label="Permalink to &quot;九、抓 NAT 包&quot;">​</a></h2><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 看 conntrack 表</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> conntrack</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -L</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">tcp</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">      6</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 431999</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ESTABLISHED</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  src=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">192.168.1.10</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> dst=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">8.8.8.8</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> sport=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">54321</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> dport=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">443</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  src=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">8.8.8.8</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> dst=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">1.2.3.4</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> sport=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">443</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> dport=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">60000</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  [ASSURED] mark</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">0</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 看 NAT 表的统计</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> conntrack</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -S</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">cpu</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">0</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">   found</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">0</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> invalid</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">12</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> ignore</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">0</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> ...</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 看具体一条</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> conntrack</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -L</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -p</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> tcp</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --dport</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 443</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 实时观察 NAT 事件</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> conntrack</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -E</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 删某条(强制断开)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> conntrack</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -D</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -p</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> tcp</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --dport</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 443</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -d</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 8.8.8.8</span></span></code></pre></div><hr><h2 id="十、nat-引发的协议崩溃" tabindex="-1">十、NAT 引发的协议崩溃 <a class="header-anchor" href="#十、nat-引发的协议崩溃" aria-label="Permalink to &quot;十、NAT 引发的协议崩溃&quot;">​</a></h2><p>NAT 的设计前提是「IP+端口在传输层」,但有些应用层协议 <strong>把 IP 写在 payload 里</strong> —— NAT 改不到,直接崩。</p><h3 id="_10-1-ftp-主动模式" tabindex="-1">10.1 FTP(主动模式) <a class="header-anchor" href="#_10-1-ftp-主动模式" aria-label="Permalink to &quot;10.1 FTP(主动模式)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>客户端 → FTP 服务器:PORT 192,168,1,10,7,224</span></span>
<span class="line"><span>                               ↑</span></span>
<span class="line"><span>                  内网 IP 写在协议里(7×256+224 = 端口 2016)</span></span>
<span class="line"><span>服务器:好的,我从我这边主动连你 192.168.1.10:2016</span></span>
<span class="line"><span>但 192.168.1.10 是内网 IP,服务器连不到!</span></span>
<span class="line"><span></span></span>
<span class="line"><span>解决:NAT 路由器有「ALG (Application Layer Gateway)」</span></span>
<span class="line"><span>     专门解析 FTP 控制流,改 PORT 命令里的 IP</span></span></code></pre></div><p><strong>iptables 的 <code>nf_conntrack_ftp</code> 模块就是这个</strong>——但越来越多协议(SIP / H.323 / IRC DCC)需要 ALG,越来越脆弱。</p><h3 id="_10-2-sip-voip" tabindex="-1">10.2 SIP / VoIP <a class="header-anchor" href="#_10-2-sip-voip" aria-label="Permalink to &quot;10.2 SIP / VoIP&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>SIP INVITE:</span></span>
<span class="line"><span>  Contact: &lt;sip:user@192.168.1.10:5060&gt;</span></span>
<span class="line"><span>                       ↑ 内网 IP</span></span>
<span class="line"><span></span></span>
<span class="line"><span>服务器回 INVITE → 找不到 192.168.1.10</span></span>
<span class="line"><span>→ VoIP 通话无法建立</span></span>
<span class="line"><span></span></span>
<span class="line"><span>解决:SIP ALG / SBC 边界控制器 / 应用层 NAT 穿透</span></span></code></pre></div><h3 id="_10-3-ipsec-esp" tabindex="-1">10.3 IPSec (ESP) <a class="header-anchor" href="#_10-3-ipsec-esp" aria-label="Permalink to &quot;10.3 IPSec (ESP)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>ESP 协议号 50,没有端口</span></span>
<span class="line"><span>NAT 没法做端口映射</span></span>
<span class="line"><span>→ 单 IP 后只能一个 IPSec 隧道</span></span>
<span class="line"><span></span></span>
<span class="line"><span>解决:NAT-T (NAT Traversal),把 ESP 包封装在 UDP 4500</span></span></code></pre></div><blockquote><p>经验法则:<strong>「IP 写在 payload 里」的协议都跟 NAT 八字不合</strong>——这是 IPv6 想根本解决的问题。</p></blockquote><hr><h2 id="十一、综合案例-一个-k8s-pod-访问外网的完整链路" tabindex="-1">十一、综合案例:一个 K8s Pod 访问外网的完整链路 <a class="header-anchor" href="#十一、综合案例-一个-k8s-pod-访问外网的完整链路" aria-label="Permalink to &quot;十一、综合案例:一个 K8s Pod 访问外网的完整链路&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Pod (10.244.0.5) → curl https://api.example.com (1.2.3.4)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>1. Pod 内核解析 DNS</span></span>
<span class="line"><span>   → 查 CoreDNS Service ClusterIP (10.96.0.10)</span></span>
<span class="line"><span>   → conntrack 记录 + iptables DNAT 改成 CoreDNS Pod IP (10.244.1.20)</span></span>
<span class="line"><span>   → 包出 Pod veth pair → 节点 cni0 网桥</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. 节点路由表查 10.244.1.0/24</span></span>
<span class="line"><span>   → 走 flannel.1 / cilium / VXLAN 隧道</span></span>
<span class="line"><span>   → 封装 UDP/IP/Ethernet 头</span></span>
<span class="line"><span>   → 节点 eth0 出物理网卡</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. 物理网络送到对应 Worker 节点</span></span>
<span class="line"><span></span></span>
<span class="line"><span>4. CoreDNS 回 A 记录 1.2.3.4</span></span>
<span class="line"><span>   (整个过程反向走一遍)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>5. Pod 拿到 1.2.3.4,发 TCP SYN</span></span>
<span class="line"><span>   → conntrack 记录 + iptables MASQUERADE</span></span>
<span class="line"><span>   → 包源 IP 改成节点 eth0 IP (192.168.10.5)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>6. 出节点 eth0 → 进路由器</span></span>
<span class="line"><span>   → 路由器再 SNAT 改成公网 IP (203.0.113.1)</span></span>
<span class="line"><span>   → 出公网</span></span>
<span class="line"><span></span></span>
<span class="line"><span>7. 1.2.3.4 回 SYN-ACK 给 203.0.113.1</span></span>
<span class="line"><span>   → 路由器查 conntrack 还原成 192.168.10.5</span></span>
<span class="line"><span>   → 节点查 conntrack 还原成 10.244.0.5</span></span>
<span class="line"><span>   → 包回 Pod</span></span>
<span class="line"><span></span></span>
<span class="line"><span>总共 NAT/封装次数:</span></span>
<span class="line"><span>  - DNS 查 ClusterIP DNAT: 1</span></span>
<span class="line"><span>  - VXLAN 封装: 2(进出隧道)</span></span>
<span class="line"><span>  - Pod 出公网 SNAT(节点): 1</span></span>
<span class="line"><span>  - 节点出公网 SNAT(路由器): 1</span></span>
<span class="line"><span></span></span>
<span class="line"><span>→ 一次外网访问,5 次 NAT/封装!</span></span></code></pre></div><p><strong>K8s 工程师必须心算这个链路</strong> —— 出 bug 时知道找哪一段:<strong>Pod-to-Service iptables / VXLAN MTU / 节点 SNAT / 公网 SNAT</strong>。</p><hr><h2 id="十二、踩坑提醒" tabindex="-1">十二、踩坑提醒 <a class="header-anchor" href="#十二、踩坑提醒" aria-label="Permalink to &quot;十二、踩坑提醒&quot;">​</a></h2><ol><li><strong>以为子网掩码可以非连续 1</strong> —— 现代设备拒绝</li><li><strong>算 CIDR 不画二进制</strong> —— /27 / /28 心算容易出错</li><li><strong>私网段乱选</strong> —— 跟运营商 CGN(100.64/10)冲突,PMTUD 失败</li><li><strong>NAT 状态表满了不知道</strong> —— 新连接全部静默丢包</li><li><strong>tcp_tw_recycle 在 NAT 后开</strong> —— 部分用户随机断,排查 1 周</li><li><strong>以为 P2P 在 Symmetric NAT 下能直连</strong> —— 必须 TURN 中继,流量翻倍</li><li><strong>iptables NAT 规则不写 -m conntrack --ctstate ESTABLISHED</strong> —— 回包直接被防火墙挡</li><li><strong>K8s 大集群用 iptables 模式</strong> —— 几千 Service 时 CPU 占满,改 IPVS / Cilium</li><li><strong>以为 Docker MASQUERADE 改不了源 IP</strong> —— 直接出公网会因为「源是私网 IP」被丢</li><li><strong>抓包不看 conntrack</strong> —— 复杂 NAT 链下,必须 <code>conntrack -L</code> 看映射</li></ol><hr><h2 id="十三、本章-checklist" tabindex="-1">十三、本章 Checklist <a class="header-anchor" href="#十三、本章-checklist" aria-label="Permalink to &quot;十三、本章 Checklist&quot;">​</a></h2><table tabindex="0"><thead><tr><th>项</th><th>说明</th></tr></thead><tbody><tr><td>✅ 能心算 /20 / /24 / /27 / /30 的主机数</td><td>4094 / 254 / 30 / 2</td></tr><tr><td>✅ 解释 CIDR 1993 革命解决了什么</td><td>抛弃 ABC 类 + 路由聚合</td></tr><tr><td>✅ 区分 SNAT / DNAT / MASQUERADE</td><td>何时用哪个</td></tr><tr><td>✅ 默写 NAT 5 种类型 + P2P 兼容性</td><td>Full Cone / Symmetric 等</td></tr><tr><td>✅ 解释端口耗尽场景 + 缓解方案</td><td>SNAT 池 / 调大端口范围</td></tr><tr><td>✅ 知道 100.64.0.0/10 是 CGN 专用</td><td>不是常规私网段</td></tr><tr><td>✅ 看 K8s 节点 iptables NAT 链</td><td>几百行规则不慌</td></tr><tr><td>✅ 知道 IPVS / eBPF 比 iptables NAT 快</td><td>大集群必选</td></tr><tr><td>✅ 理解 IP-in-payload 协议跟 NAT 的冲突</td><td>FTP / SIP / IPSec</td></tr><tr><td>✅ 抓 conntrack 表诊断 NAT 问题</td><td>conntrack -L / -E / -D</td></tr></tbody></table><hr><p>下一篇:<code>11-UDP详解.md</code>,网络层(06-10)讲完——<strong>链路层让同子网两台机器通信(05),IP / 路由 / NAT(06-10)解决了跨网段全球可达,接下来传输层(11-16)解决「应用进程之间的通信」</strong>。<strong>11 篇先讲 UDP</strong>——<strong>最薄的传输层协议,8 字节头,无连接、无重传、无顺序</strong>——但<strong>正是这种「裸」让它成为现代高性能传输的基础</strong>:<strong>DNS / NTP / SNMP / VPN / 视频通话 / QUIC 全跑在 UDP 上</strong>,<strong>为什么 HTTP/3 反而把可靠传输从 TCP 搬到 UDP 上重做</strong>——这背后是网络协议设计的根本性反思。</p>`,133)])])}const g=a(t,[["render",l]]);export{k as __pageData,g as default};
