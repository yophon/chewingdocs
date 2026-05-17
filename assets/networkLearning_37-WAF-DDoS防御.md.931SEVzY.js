import{c as a,Q as n,j as i,m as p}from"./chunks/framework.CBiVa4O3.js";const c=JSON.parse('{"title":"WAF 与 DDoS 防御","description":"","frontmatter":{},"headers":[],"relativePath":"../networkLearning/37-WAF-DDoS防御.md","filePath":"../networkLearning/37-WAF-DDoS防御.md","lastUpdated":1778496697000}'),l={name:"../networkLearning/37-WAF-DDoS防御.md"};function t(e,s,h,k,d,r){return n(),i("div",null,[...s[0]||(s[0]=[p(`<h1 id="waf-与-ddos-防御" tabindex="-1">WAF 与 DDoS 防御 <a class="header-anchor" href="#waf-与-ddos-防御" aria-label="Permalink to &quot;WAF 与 DDoS 防御&quot;">​</a></h1><p>CDN 调度把&quot;正常流量&quot;分发到边缘——但<strong>互联网上 30% 以上的流量是恶意的</strong>:扫描、爬虫、撞库、CC、DDoS。一个未做防御的源站,公网 IP 暴露 24 小时内必被扫,72 小时内必被打。<strong>WAF 和 DDoS 防御是源站活下去的护城河</strong>——不是&quot;上线之后再做&quot;,而是&quot;上线之前必须做&quot;。</p><blockquote><p>一句话先记住:<strong>DDoS 拼带宽 + 算力,WAF 拼规则 + 行为</strong>。容量型攻击(SYN/UDP Flood、反射放大)只能在<strong>链路上游</strong>清洗——你自己机房带宽 10Gbps,被打 100Gbps 时光纤直接堵死,iptables 再快也救不了。<strong>所以现代防御链是分层的</strong>:运营商清洗(T级)→ Anycast/CDN(百G级)→ 自建 iptables/eBPF/XDP(十G级)→ 应用层限流(单机级)。<strong>WAF 是这条链最末端</strong>——专治应用层攻击(SQL 注入、CC、Bot),拦的是&quot;带语义的恶意&quot;,不是&quot;洪水&quot;。</p></blockquote><hr><h2 id="一、ddos-的三大类-容量型-协议型-应用型" tabindex="-1">一、DDoS 的三大类:容量型 / 协议型 / 应用型 <a class="header-anchor" href="#一、ddos-的三大类-容量型-协议型-应用型" aria-label="Permalink to &quot;一、DDoS 的三大类:容量型 / 协议型 / 应用型&quot;">​</a></h2><p>新手最大的误解是把&quot;DDoS&quot;当一种攻击——<strong>它是几十种攻击的统称</strong>,防御手段完全不同。按&quot;打哪一层&quot;分三类:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>攻击类型              打的资源            典型流量          防御层</span></span>
<span class="line"><span>─────────────────────────────────────────────────────────────</span></span>
<span class="line"><span>容量型(Volumetric)   带宽 / 链路        100Gbps - 数Tbps  必须上游清洗</span></span>
<span class="line"><span>  UDP Flood</span></span>
<span class="line"><span>  ICMP Flood</span></span>
<span class="line"><span>  反射放大(NTP/DNS/Memcached)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>协议型(Protocol)     状态表 / 半连接队列 几Mbps-几Gbps     iptables / 内核</span></span>
<span class="line"><span>  SYN Flood</span></span>
<span class="line"><span>  ACK Flood</span></span>
<span class="line"><span>  TCP 连接耗尽</span></span>
<span class="line"><span>  Slowloris(慢攻击)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>应用型(Application)  CPU / DB / 后端    几百-几千 RPS     WAF / 限流</span></span>
<span class="line"><span>  HTTP CC 攻击</span></span>
<span class="line"><span>  慢 POST</span></span>
<span class="line"><span>  恶意爬虫</span></span>
<span class="line"><span>  接口刷量(刷验证码 / 注册)</span></span></code></pre></div><p><strong>判断哪类的最快办法</strong>:看流量的 <strong>单位</strong>。</p><ul><li>报告&quot;打了 500Gbps&quot; → 容量型,你机房根本扛不住,只能找运营商或上 CDN</li><li>报告&quot;半连接队列爆了&quot; → 协议型 SYN Flood,sysctl + syncookies 救</li><li>报告&quot;QPS 突然涨到平时 100 倍但带宽不大&quot; → 应用型 CC 攻击,WAF + 限流救</li></ul><hr><h2 id="二、容量型-syn-flood-与反射放大" tabindex="-1">二、容量型:SYN Flood 与反射放大 <a class="header-anchor" href="#二、容量型-syn-flood-与反射放大" aria-label="Permalink to &quot;二、容量型:SYN Flood 与反射放大&quot;">​</a></h2><h3 id="_2-1-syn-flood-最经典的协议型-其实跨容量型" tabindex="-1">2.1 SYN Flood:最经典的协议型(其实跨容量型) <a class="header-anchor" href="#_2-1-syn-flood-最经典的协议型-其实跨容量型" aria-label="Permalink to &quot;2.1 SYN Flood:最经典的协议型(其实跨容量型)&quot;">​</a></h3><p>TCP 三次握手原理决定了一个根本缺陷:<strong>服务端在收到 SYN 后必须保留半连接状态</strong>(SYN_RECV),等客户端的 ACK。如果攻击方只发 SYN 不发 ACK,服务端的半连接队列会被填满,<strong>正常 SYN 进不来</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>正常握手:</span></span>
<span class="line"><span>  Client ── SYN ────────► Server   [半连接队列 +1]</span></span>
<span class="line"><span>  Client ◄── SYN+ACK ──── Server</span></span>
<span class="line"><span>  Client ── ACK ────────► Server   [半连接 → 全连接]</span></span>
<span class="line"><span></span></span>
<span class="line"><span>SYN Flood:</span></span>
<span class="line"><span>  攻击者 ── SYN ────────► Server   [+1]</span></span>
<span class="line"><span>  攻击者 ── SYN ────────► Server   [+2]</span></span>
<span class="line"><span>  攻击者 ── SYN ────────► Server   [+3]</span></span>
<span class="line"><span>  ... (源 IP 全是伪造的,SYN+ACK 发出去无人回)</span></span>
<span class="line"><span>  攻击者 ── SYN ────────► Server   [队列满,丢]</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  正常用户 ── SYN ─────► Server   [×丢弃,连不上]</span></span></code></pre></div><p><strong>关键数据</strong>:Linux 默认 <code>net.ipv4.tcp_max_syn_backlog=128</code>——攻击方一秒打几千 SYN 就能撑爆。</p><p><strong>防御四件套</strong>(全在 sysctl):</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 加大半连接队列(几千到几万)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">net.ipv4.tcp_max_syn_backlog</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">=8192</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 减少 SYN+ACK 重传次数(默认 5 次,共 31s,太长)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">net.ipv4.tcp_synack_retries</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">=2</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 开启 SYN Cookies——彻底解决:不分配半连接表项,</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 把状态信息编码进 SYN+ACK 的 seq 号,客户端 ACK 回来再校验</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">net.ipv4.tcp_syncookies</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">=1</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 减少 FIN_WAIT 时间,防止连接耗尽</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">net.ipv4.tcp_fin_timeout</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">=15</span></span></code></pre></div><p><strong>SYN Cookies 的精髓</strong>——<strong>用算力换内存</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>不开 SYN Cookies:  每个 SYN 占 ~256 字节内存 → 100k SYN = 25MB 半连接表</span></span>
<span class="line"><span>开 SYN Cookies:    SYN 不占内存,但每次 ACK 要算 hash 校验</span></span>
<span class="line"><span>                   攻击者发 ACK Flood 反过来打 CPU</span></span></code></pre></div><blockquote><p>所以<strong>不要全程开 SYN Cookies</strong>——内核默认是&quot;队列要满才启用&quot;,这是平衡。</p></blockquote><h3 id="_2-2-反射放大攻击-互联网最毒的设计缺陷" tabindex="-1">2.2 反射放大攻击:互联网最毒的设计缺陷 <a class="header-anchor" href="#_2-2-反射放大攻击-互联网最毒的设计缺陷" aria-label="Permalink to &quot;2.2 反射放大攻击:互联网最毒的设计缺陷&quot;">​</a></h3><p><strong>原理</strong>:找一种 UDP 协议,<strong>请求小、响应大</strong>,且<strong>不验证源 IP</strong>。攻击者伪造受害者 IP 发请求,响应全打到受害者。</p><p>经典放大倍数(请求 / 响应):</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>协议            放大倍数      说明</span></span>
<span class="line"><span>────────────────────────────────────────</span></span>
<span class="line"><span>DNS(开放递归)  ~50x        ANY 查询返回大量记录</span></span>
<span class="line"><span>NTP(monlist)   ~556x       一条 monlist 命令返回最多 600 条 IP</span></span>
<span class="line"><span>Memcached       ~50000x     UDP 缺省开放,STATS 返回巨量数据</span></span>
<span class="line"><span>SSDP            ~30x        UPnP 设备</span></span>
<span class="line"><span>LDAP            ~50x</span></span>
<span class="line"><span></span></span>
<span class="line"><span>(2018 年 GitHub 1.35Tbps 攻击 = Memcached 反射放大,攻击者只发了几 Gbps)</span></span></code></pre></div><p><strong>ASCII 攻击路径</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                 ┌──── 伪造源IP=Victim 的 UDP ────┐</span></span>
<span class="line"><span>                 │     (10字节请求)                │</span></span>
<span class="line"><span>                 ▼                                  │</span></span>
<span class="line"><span>       Attacker(肉鸡群) ◄────────────────────  反射服务器(开放 NTP/DNS/Memcached)</span></span>
<span class="line"><span>                                                    │ 巨大响应</span></span>
<span class="line"><span>                                                    │ (5KB)</span></span>
<span class="line"><span>                                                    ▼</span></span>
<span class="line"><span>                                                Victim ── 链路打爆</span></span>
<span class="line"><span></span></span>
<span class="line"><span>特征:</span></span>
<span class="line"><span>  Victim 收到大量 UDP 包,源 IP 全是合法的&quot;反射器&quot;(无法封)</span></span>
<span class="line"><span>  攻击者本人 0 流量进出</span></span>
<span class="line"><span>  追溯极难</span></span></code></pre></div><p><strong>防御</strong>(注意:<strong>反射攻击的根本防御不在受害者,而在反射器的所有者</strong>):</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>受害者侧:</span></span>
<span class="line"><span>  - 上 CDN/Anycast,把流量&quot;摊薄&quot;到几十个 PoP</span></span>
<span class="line"><span>  - 找上游 ISP 做&quot;目的 IP 黑洞路由&quot;(Blackhole)——把打你的流量在骨干网丢</span></span>
<span class="line"><span>  - iptables 直接 drop UDP(若你不用 UDP)</span></span>
<span class="line"><span>    iptables -I INPUT -p udp -j DROP</span></span>
<span class="line"><span></span></span>
<span class="line"><span>反射器所有者侧(社会责任):</span></span>
<span class="line"><span>  - 关闭 NTP monlist:disable monitor</span></span>
<span class="line"><span>  - 关闭开放 DNS 递归:只服务自己用户</span></span>
<span class="line"><span>  - Memcached 必须 bind 127.0.0.1 + 加防火墙</span></span>
<span class="line"><span>  - BCP 38(uRPF):ISP 在边界检查源 IP,伪造的包直接丢</span></span></code></pre></div><blockquote><p>经验法则:<strong>所有跑在公网的 UDP 服务,默认就是被滥用的反射器候选</strong>——除非你显式做了源 IP 校验或鉴权。</p></blockquote><hr><h2 id="三、应用型-cc-攻击与慢攻击" tabindex="-1">三、应用型:CC 攻击与慢攻击 <a class="header-anchor" href="#三、应用型-cc-攻击与慢攻击" aria-label="Permalink to &quot;三、应用型:CC 攻击与慢攻击&quot;">​</a></h2><h3 id="_3-1-cc-challenge-collapsar-攻击" tabindex="-1">3.1 CC(Challenge Collapsar)攻击 <a class="header-anchor" href="#_3-1-cc-challenge-collapsar-攻击" aria-label="Permalink to &quot;3.1 CC(Challenge Collapsar)攻击&quot;">​</a></h3><p>CC 起源是早期&quot;挑战黑洞&quot;产品被绕过——攻击者<strong>用真实 HTTP 请求</strong>打你的动态接口,流量小但<strong>每个请求都会触发数据库查询</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>特征:</span></span>
<span class="line"><span>  - 请求看起来&quot;完全合法&quot;:有 UA、有 Cookie、有 Referer</span></span>
<span class="line"><span>  - 通常打 /search?q=xxx /api/list 这种重接口</span></span>
<span class="line"><span>  - 1000 RPS 就能让数据库 CPU 100%</span></span>
<span class="line"><span>  - 带宽利用极低(10Mbps),传统流量监控发现不了</span></span>
<span class="line"><span></span></span>
<span class="line"><span>为什么难防:</span></span>
<span class="line"><span>  攻击包和正常包在 IP 层 / TCP 层完全一样</span></span>
<span class="line"><span>  必须看到 HTTP 层(应用层)才能识别</span></span>
<span class="line"><span>  → 必须在 7 层防御</span></span></code></pre></div><p><strong>防御链</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 速率限制(每 IP / 每 token / 每接口)</span></span>
<span class="line"><span>   nginx limit_req_zone</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>2. 行为分析</span></span>
<span class="line"><span>   &quot;这个 IP 5 秒打 1000 次 /search&quot;——正常用户不可能</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>3. 挑战式验证</span></span>
<span class="line"><span>   可疑流量 302 跳到 /captcha,过了才放行</span></span>
<span class="line"><span></span></span>
<span class="line"><span>4. 指纹识别</span></span>
<span class="line"><span>   正常浏览器有 TLS JA3 指纹、HTTP/2 SETTINGS 指纹</span></span>
<span class="line"><span>   攻击工具的指纹和真实浏览器不同 → 直接拦</span></span></code></pre></div><p>详见本章第七节 WAF + 引用 algorithmLearning/24 限流算法(令牌桶 / 漏桶 / 滑动窗口)。</p><h3 id="_3-2-slowloris-用-1-个-ip-打死服务器" tabindex="-1">3.2 Slowloris:用 1 个 IP 打死服务器 <a class="header-anchor" href="#_3-2-slowloris-用-1-个-ip-打死服务器" aria-label="Permalink to &quot;3.2 Slowloris:用 1 个 IP 打死服务器&quot;">​</a></h3><p>2009 年 Robert Hansen 发布,核心思路反直觉:<strong>攻击不是&quot;快&quot;,是&quot;慢&quot;</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>原理:</span></span>
<span class="line"><span>  1. 跟服务器建立 TCP + HTTP 连接</span></span>
<span class="line"><span>  2. 发 GET / HTTP/1.1\\r\\n</span></span>
<span class="line"><span>  3. 然后每隔 10 秒发 1 个无意义 header:</span></span>
<span class="line"><span>        X-a: 1\\r\\n</span></span>
<span class="line"><span>  4. 永远不发完整的请求(永远不发空行)</span></span>
<span class="line"><span>  5. 服务器一直等,连接挂死</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  开几千个这样的连接 → 把服务器的 worker 全占住</span></span>
<span class="line"><span>  Apache prefork 模式 256 worker,几千 IP 就打死</span></span></code></pre></div><p><strong>为什么 Apache 倒了 Nginx 没事</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Apache prefork:每连接一个进程,250 个进程上限 → Slowloris 杀手</span></span>
<span class="line"><span>Apache worker / event:线程,扛得住一些</span></span>
<span class="line"><span>Nginx event-driven:一个进程几万连接,Slowloris 影响小但不是免疫</span></span></code></pre></div><p><strong>防御</strong>:</p><div class="language-nginx vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">nginx</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 客户端发送请求体的最长时间</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">client_body_timeout </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">10s</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 客户端发送请求头的最长时间</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">client_header_timeout </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">10s</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 一次请求允许的最长时间</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">send_timeout </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">10s</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 单 IP 并发连接数限制</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">limit_conn_zone </span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$binary_remote_addr zone=conn_per_ip:10m;</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">limit_conn </span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">conn_per_ip </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">20</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span></code></pre></div><blockquote><p>Slowloris 现在很少独立用,但<strong>慢 POST</strong>(发 Content-Length: 1000000,但每秒发 1 字节)仍是 WAF 必须防的。</p></blockquote><hr><h2 id="四、防御层次-从-t-级到单机" tabindex="-1">四、防御层次:从 T 级到单机 <a class="header-anchor" href="#四、防御层次-从-t-级到单机" aria-label="Permalink to &quot;四、防御层次:从 T 级到单机&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                  攻击方</span></span>
<span class="line"><span>                    │</span></span>
<span class="line"><span>                    ▼</span></span>
<span class="line"><span>   ┌────────────────────────────────────┐</span></span>
<span class="line"><span>   │  ① 运营商清洗 / 骨干 BGP 黑洞       │  T 级</span></span>
<span class="line"><span>   │     (中国电信高防 / Akamai Prolexic) │</span></span>
<span class="line"><span>   └────────────────────────────────────┘</span></span>
<span class="line"><span>                    │ 留下 ~100Gbps</span></span>
<span class="line"><span>                    ▼</span></span>
<span class="line"><span>   ┌────────────────────────────────────┐</span></span>
<span class="line"><span>   │  ② Anycast + CDN 边缘吸收           │  百 G 级</span></span>
<span class="line"><span>   │     (Cloudflare / Akamai / 阿里高防) │</span></span>
<span class="line"><span>   └────────────────────────────────────┘</span></span>
<span class="line"><span>                    │ 留下 ~10Gbps</span></span>
<span class="line"><span>                    ▼</span></span>
<span class="line"><span>   ┌────────────────────────────────────┐</span></span>
<span class="line"><span>   │  ③ 自建机房:iptables / eBPF/XDP    │  十 G 级</span></span>
<span class="line"><span>   └────────────────────────────────────┘</span></span>
<span class="line"><span>                    │ 留下 ~1Gbps 真实流量</span></span>
<span class="line"><span>                    ▼</span></span>
<span class="line"><span>   ┌────────────────────────────────────┐</span></span>
<span class="line"><span>   │  ④ Nginx / WAF / 应用层限流          │  单机级</span></span>
<span class="line"><span>   └────────────────────────────────────┘</span></span>
<span class="line"><span>                    │</span></span>
<span class="line"><span>                    ▼</span></span>
<span class="line"><span>                  应用</span></span></code></pre></div><p>每一层都有&quot;价格&quot;和&quot;上限&quot;——<strong>没有任何一层能单独扛住一切</strong>。</p><h3 id="_4-1-1-运营商清洗" tabindex="-1">4.1 ① 运营商清洗 <a class="header-anchor" href="#_4-1-1-运营商清洗" aria-label="Permalink to &quot;4.1 ① 运营商清洗&quot;">​</a></h3><p>只有 T 级运营商能做。机制:<strong>BGP 路由把你的 IP 段引流到清洗中心</strong>,清洗后的&quot;干净流量&quot;通过专线回到你机房。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>流量路径(平时):</span></span>
<span class="line"><span>  攻击者 ──► 公网骨干 ──► 你的机房 IP</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>流量路径(被打,启用清洗):</span></span>
<span class="line"><span>  攻击者 ──► 公网骨干 ──► 清洗中心(吸收所有攻击)</span></span>
<span class="line"><span>                          │</span></span>
<span class="line"><span>                          └─► 干净流量 ──► 专线 ──► 你的机房 IP</span></span></code></pre></div><p><strong>月费用</strong>:几万到几十万人民币不等,按防御带宽计费。</p><h3 id="_4-2-2-cdn-anycast-吸收" tabindex="-1">4.2 ② CDN / Anycast 吸收 <a class="header-anchor" href="#_4-2-2-cdn-anycast-吸收" aria-label="Permalink to &quot;4.2 ② CDN / Anycast 吸收&quot;">​</a></h3><p>Anycast 让&quot;同一个 IP&quot;在全球几十个 PoP 同时响应。攻击流量被天然分散——单个 PoP 只承受几十 Gbps,加起来才是 T 级。</p><p>详见上一篇 36(LB / CDN 调度),核心机制不重复。</p><h3 id="_4-3-3-iptables-ebpf-xdp" tabindex="-1">4.3 ③ iptables / eBPF / XDP <a class="header-anchor" href="#_4-3-3-iptables-ebpf-xdp" aria-label="Permalink to &quot;4.3 ③ iptables / eBPF / XDP&quot;">​</a></h3><table tabindex="0"><thead><tr><th>工具</th><th>处理位置</th><th>速度</th></tr></thead><tbody><tr><td>iptables</td><td>netfilter 框架(内核)</td><td>~1M PPS / 核</td></tr><tr><td>nftables</td><td>同上,新一代</td><td>~2M PPS / 核</td></tr><tr><td>eBPF (TC)</td><td>流量控制层</td><td>~5M PPS / 核</td></tr><tr><td>XDP</td><td>网卡驱动层(更早)</td><td>~20M PPS / 核</td></tr><tr><td>DPDK</td><td>用户态绕过内核</td><td>~50M PPS / 核</td></tr></tbody></table><p><strong>XDP</strong> 是 DDoS 防御的核武器——在网络包<strong>进入内核协议栈之前</strong>就丢弃。Cloudflare 的 L4 防御就是 XDP + eBPF。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>传统 iptables 路径:</span></span>
<span class="line"><span>  网卡 → 驱动 → skb_alloc → netfilter → drop</span></span>
<span class="line"><span>  (即使 drop,也已经分配了 sk_buff,有内存压力)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>XDP 路径:</span></span>
<span class="line"><span>  网卡 → 驱动 → BPF 程序判断 → drop</span></span>
<span class="line"><span>  (在 sk_buff 之前 drop,几乎零开销)</span></span></code></pre></div><p>详见 33 篇 eBPF / XDP / DPDK。</p><h3 id="_4-4-4-应用层限流" tabindex="-1">4.4 ④ 应用层限流 <a class="header-anchor" href="#_4-4-4-应用层限流" aria-label="Permalink to &quot;4.4 ④ 应用层限流&quot;">​</a></h3><p>最后一道防线,在 Nginx / Envoy / 应用代码里实现。</p><div class="language-nginx vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">nginx</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 速率限制(令牌桶):每 IP 每秒 10 请求,burst 20</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">limit_req_zone </span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$binary_remote_addr zone=api_rate:10m rate=10r/s;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">server</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    location</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> /api/ </span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">{</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">        limit_req </span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">zone=api_rate burst=20 nodelay;</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">        # 超出直接 503</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    }</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span></code></pre></div><p>详见 algorithmLearning/24 限流算法——令牌桶 / 漏桶 / 滑动窗口对比、计数器单调性问题、分布式限流(Redis + Lua)。</p><hr><h2 id="五、iptables-防御实战-几条命令救一台机器" tabindex="-1">五、iptables 防御实战:几条命令救一台机器 <a class="header-anchor" href="#五、iptables-防御实战-几条命令救一台机器" aria-label="Permalink to &quot;五、iptables 防御实战:几条命令救一台机器&quot;">​</a></h2><p>下面这套规则适用于&quot;被小流量打但还没买高防&quot;的应急情景。<strong>生产环境必须先 iptables-save,否则改错锁外</strong>。</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 查现有规则</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">iptables</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -L</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> INPUT</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -n</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --line-numbers</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># ① 限制单 IP 同时连接数(防扫描 / 慢攻击)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">iptables</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -A</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> INPUT</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -p</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> tcp</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --syn</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --dport</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 80</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  -m</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> connlimit</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --connlimit-above</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 50</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -j</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> REJECT</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># ② 限制 SYN 速率(每 IP 每秒最多 10 SYN)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">iptables</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -A</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> INPUT</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -p</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> tcp</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --syn</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --dport</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 80</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  -m</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> hashlimit</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --hashlimit-name</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> syn-rate</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  --hashlimit-above</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 10/sec</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --hashlimit-mode</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> srcip</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  --hashlimit-burst</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 20</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -j</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> DROP</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># ③ 黑名单(挂上后不需要重启)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">ipset</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> create</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> blacklist</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> hash:ip</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">iptables</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -A</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> INPUT</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -m</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> set</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --match-set</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> blacklist</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> src</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -j</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> DROP</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">ipset</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> add</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> blacklist</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 1.2.3.4</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># ④ 限制 ICMP(防 Smurf)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">iptables</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -A</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> INPUT</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -p</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> icmp</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --icmp-type</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> echo-request</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  -m</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> limit</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --limit</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 1/s</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --limit-burst</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 5</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -j</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ACCEPT</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">iptables</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -A</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> INPUT</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -p</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> icmp</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -j</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> DROP</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># ⑤ 丢弃明显异常包</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">iptables</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -A</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> INPUT</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -p</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> tcp</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --tcp-flags</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ALL</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> NONE</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -j</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> DROP</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">   # NULL 扫描</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">iptables</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -A</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> INPUT</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -p</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> tcp</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --tcp-flags</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ALL</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ALL</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">  -j</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> DROP</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">   # XMAS 扫描</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">iptables</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -A</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> INPUT</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -p</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> tcp</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --tcp-flags</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> SYN,FIN</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> SYN,FIN</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -j</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> DROP</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 保存</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">iptables-save</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> &gt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /etc/iptables/rules.v4</span></span></code></pre></div><p><strong>经验值</strong>:<code>connlimit 50 / hashlimit 10</code> 是中等流量站点的安全水位——CDN 后的 Nginx 因为所有流量来自 CDN IP,这两个值要设得很大或基于 X-Forwarded-For 限。</p><blockquote><p>警告:<strong>iptables 规则越多越慢</strong>——每个包要顺序匹配。超过几千条规则就要换 ipset / nftables / eBPF。</p></blockquote><hr><h2 id="六、ebpf-xdp-一瞥-cloudflare-的-ddos-防御长这样" tabindex="-1">六、eBPF/XDP 一瞥:Cloudflare 的 DDoS 防御长这样 <a class="header-anchor" href="#六、ebpf-xdp-一瞥-cloudflare-的-ddos-防御长这样" aria-label="Permalink to &quot;六、eBPF/XDP 一瞥:Cloudflare 的 DDoS 防御长这样&quot;">​</a></h2><p>XDP 程序运行在网卡驱动里,可以在包进入协议栈之前 drop。下面是一个最小可读的&quot;丢 UDP 包&quot;示例(Cloudflare 真实代码复杂得多):</p><div class="language-c vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">c</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">// xdp_drop_udp.c (用 LLVM 编译成 BPF 字节码)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">#include</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &lt;linux/bpf.h&gt;</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">#include</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &lt;bpf/bpf_helpers.h&gt;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">SEC</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;xdp&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">int</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> xdp_drop_udp</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">struct</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> xdp_md </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">*</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">ctx</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">) {</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    void</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> *</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">data     </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">void</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> *</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)(</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">long</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)ctx-&gt;data;</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    void</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> *</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">data_end </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">void</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> *</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)(</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">long</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)ctx-&gt;data_end;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    struct</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> ethhdr </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">*</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">eth </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> data;</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    if</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> ((</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">void</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> *</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)(eth </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">+</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 1</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">) </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">&gt;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> data_end) </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">return</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> XDP_PASS;</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    if</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (eth-&gt;h_proto </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">!=</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> bpf_htons</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(ETH_P_IP)) </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">return</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> XDP_PASS;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    struct</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> iphdr </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">*</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">ip </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">void</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> *</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)(eth </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">+</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 1</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">);</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    if</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> ((</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">void</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> *</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)(ip </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">+</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 1</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">) </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">&gt;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> data_end) </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">return</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> XDP_PASS;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    if</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (ip-&gt;protocol </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">==</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> IPPROTO_UDP)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">        return</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> XDP_DROP;</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">     // ← 这里 drop,完全不进协议栈</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    return</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> XDP_PASS;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">char</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> _license</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">[]</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> SEC</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;license&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">) </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;GPL&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span></code></pre></div><p><strong>生产 DDoS XDP 防御的核心规则集</strong>(Cloudflare 公开过):</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 校验 IP / TCP / UDP header 长度(防奇形怪状)</span></span>
<span class="line"><span>2. 丢已知反射协议端口(NTP/DNS/Memcached/SSDP)</span></span>
<span class="line"><span>3. 速率限制(per-src-ip,bpf_map 维护)</span></span>
<span class="line"><span>4. 校验 TCP flags 合法性</span></span>
<span class="line"><span>5. 黑名单 lookup(LPM trie 实现 IP 段匹配)</span></span></code></pre></div><p>XDP 的处理速度是 iptables 的 10-20 倍,<strong>单核能扛 20M PPS</strong>——这是 T 级 DDoS 时代的硬通货。</p><hr><h2 id="七、waf-应用层的-第二层皮肤" tabindex="-1">七、WAF:应用层的&quot;第二层皮肤&quot; <a class="header-anchor" href="#七、waf-应用层的-第二层皮肤" aria-label="Permalink to &quot;七、WAF:应用层的&quot;第二层皮肤&quot;&quot;">​</a></h2><p><strong>WAF</strong>(Web Application Firewall)= 反向代理 + 规则引擎。所有 HTTP 请求过 WAF,<strong>符合规则的攻击模式被拦下</strong>。</p><h3 id="_7-1-工作原理-三种检测引擎" tabindex="-1">7.1 工作原理:三种检测引擎 <a class="header-anchor" href="#_7-1-工作原理-三种检测引擎" aria-label="Permalink to &quot;7.1 工作原理:三种检测引擎&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>请求进入 WAF</span></span>
<span class="line"><span>    │</span></span>
<span class="line"><span>    ▼</span></span>
<span class="line"><span>┌────────────────────────────────────┐</span></span>
<span class="line"><span>│ ① 规则匹配引擎(Signature)         │</span></span>
<span class="line"><span>│   正则匹配请求 URL/header/body      │</span></span>
<span class="line"><span>│   命中规则 → block                  │</span></span>
<span class="line"><span>│   优点:快、准、可解释               │</span></span>
<span class="line"><span>│   缺点:0day 攻击拦不住、规则要更新   │</span></span>
<span class="line"><span>└────────────────────────────────────┘</span></span>
<span class="line"><span>    │ 通过</span></span>
<span class="line"><span>    ▼</span></span>
<span class="line"><span>┌────────────────────────────────────┐</span></span>
<span class="line"><span>│ ② 行为分析(Behavior)              │</span></span>
<span class="line"><span>│   单 IP 频率 / Session 路径异常      │</span></span>
<span class="line"><span>│   &quot;正常用户不会 3 秒访问 50 个接口&quot;  │</span></span>
<span class="line"><span>└────────────────────────────────────┘</span></span>
<span class="line"><span>    │ 通过</span></span>
<span class="line"><span>    ▼</span></span>
<span class="line"><span>┌────────────────────────────────────┐</span></span>
<span class="line"><span>│ ③ 机器学习(ML)                    │</span></span>
<span class="line"><span>│   学正常请求分布,标记 outlier      │</span></span>
<span class="line"><span>│   优点:能发现未知攻击               │</span></span>
<span class="line"><span>│   缺点:误杀高、解释难               │</span></span>
<span class="line"><span>└────────────────────────────────────┘</span></span>
<span class="line"><span>    │ 通过</span></span>
<span class="line"><span>    ▼</span></span>
<span class="line"><span>转发到后端</span></span></code></pre></div><h3 id="_7-2-规则匹配-owasp-crs-是怎么写的" tabindex="-1">7.2 规则匹配:OWASP CRS 是怎么写的 <a class="header-anchor" href="#_7-2-规则匹配-owasp-crs-是怎么写的" aria-label="Permalink to &quot;7.2 规则匹配:OWASP CRS 是怎么写的&quot;">​</a></h3><p>OWASP <strong>Core Rule Set</strong>(CRS)是世界上最广用的 WAF 规则集——ModSecurity / Coraza / 多家云 WAF 都用它。看几条真实规则:</p><div class="language-apache vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">apache</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># REQUEST-942-APPLICATION-ATTACK-SQLI.conf 节选</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">SecRule REQUEST_COOKIES|ARGS|REQUEST_HEADERS \\</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  &quot;@detectSQLi&quot; \\</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  &quot;id:</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">942100</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,phase:</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">2</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,block,msg:&#39;SQL Injection Attack Detected&#39;,\\</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">   tag:&#39;attack-sqli&#39;,severity:&#39;CRITICAL&#39;&quot;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># REQUEST-941-APPLICATION-ATTACK-XSS.conf 节选</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">SecRule REQUEST_COOKIES|ARGS \\</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  &quot;@detectXSS&quot; \\</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  &quot;id:</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">941100</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,phase:</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">2</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,block,msg:&#39;XSS Attack Detected&#39;&quot;</span></span></code></pre></div><p><strong>Paranoia Level</strong>(PL)从 1 到 4——越高越激进:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>PL1:几乎不误杀,只拦明显攻击,适合电商 / 大众 SaaS</span></span>
<span class="line"><span>PL2:稍激进,适合企业 OA</span></span>
<span class="line"><span>PL3:很激进,适合内网 / 银行</span></span>
<span class="line"><span>PL4:近乎偏执,误杀率高,适合极敏感场景</span></span></code></pre></div><p><strong>新手最大的坑</strong>:<strong>直接上 PL3 → 业务全炸</strong>。正确姿势:<strong>先 detection-only 跑一周,看 false positive,逐条豁免后再切 block</strong>。</p><div class="language-apache vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">apache</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">SecDefaultAction &quot;phase:</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">2</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,log,auditlog,pass&quot;   # 先 pass(只记录)</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 跑一周,确认无误杀后改为:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">SecDefaultAction &quot;phase:</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">2</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,log,auditlog,deny,status:</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">403</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">&quot;</span></span></code></pre></div><h3 id="_7-3-主流-waf-产品对比" tabindex="-1">7.3 主流 WAF 产品对比 <a class="header-anchor" href="#_7-3-主流-waf-产品对比" aria-label="Permalink to &quot;7.3 主流 WAF 产品对比&quot;">​</a></h3><table tabindex="0"><thead><tr><th>产品</th><th>类型</th><th>部署方式</th><th>强项</th><th>弱项</th></tr></thead><tbody><tr><td><strong>ModSecurity</strong></td><td>开源(Apache 基金会)</td><td>Nginx/Apache 模块 / Coraza 独立</td><td>灵活、规则透明、免费</td><td>自维护、性能一般</td></tr><tr><td><strong>Coraza</strong></td><td>开源(Go 实现)</td><td>Envoy/Caddy 插件</td><td>现代、性能好、兼容 ModSec 规则</td><td>较新,生态在建</td></tr><tr><td><strong>Cloudflare WAF</strong></td><td>商业,边缘</td><td>DNS 切到 CF</td><td>全球 PoP、Bot Management 强</td><td>黑盒、依赖 CDN</td></tr><tr><td><strong>AWS WAF</strong></td><td>商业,云原生</td><td>ALB/CloudFront/API GW</td><td>集成度高、按请求计费</td><td>规则数量上限、贵</td></tr><tr><td><strong>阿里云 WAF</strong></td><td>商业</td><td>接入或反代</td><td>中文支持、国内合规、CC 强</td><td>国外节点弱</td></tr><tr><td><strong>F5 ASM / NGINX App Protect</strong></td><td>商业,本地</td><td>专门硬件或软件</td><td>企业级支持</td><td>贵</td></tr></tbody></table><p><strong>自建 vs 上云</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>自建 ModSecurity:</span></span>
<span class="line"><span>  优点:数据不出域、规则透明、零额外费用</span></span>
<span class="line"><span>  缺点:规则维护要人、突发流量挡不住(还是被打死)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>上云 WAF(Cloudflare / 阿里云):</span></span>
<span class="line"><span>  优点:开箱即用、有 Bot 数据库、能扛大流量</span></span>
<span class="line"><span>  缺点:数据出域(合规问题)、按 QPS 计费贵、黑盒</span></span></code></pre></div><h3 id="_7-4-nginx-modsecurity-安装一瞥" tabindex="-1">7.4 Nginx + ModSecurity 安装一瞥 <a class="header-anchor" href="#_7-4-nginx-modsecurity-安装一瞥" aria-label="Permalink to &quot;7.4 Nginx + ModSecurity 安装一瞥&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Ubuntu</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">apt</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> install</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> libmodsecurity3</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> libnginx-mod-http-modsecurity</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 下载 OWASP CRS</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">git</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> clone</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> https://github.com/coreruleset/coreruleset.git</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /etc/modsecurity/crs</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Nginx 配置</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">load_module</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> modules/ngx_http_modsecurity_module.so</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">http</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> {</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    modsecurity</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> on</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    modsecurity_rules_file</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /etc/modsecurity/main.conf</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># main.conf</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">Include</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /etc/modsecurity/modsecurity.conf</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">Include</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /etc/modsecurity/crs/crs-setup.conf</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">Include</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /etc/modsecurity/crs/rules/</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">*</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">.conf</span></span></code></pre></div><p><code>modsecurity.conf</code> 关键参数:</p><div class="language-apache vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">apache</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">SecRuleEngine </span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">On</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">                  # </span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">On</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> / </span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">Off</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> / DetectionOnly</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">SecRequestBodyAccess </span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">On</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">           # 检查 POST body</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">SecRequestBodyLimit </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">13107200</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      # </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">12</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">5</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> MB 上限</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">SecResponseBodyAccess </span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">Off</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">         # 一般关掉(性能 + 隐私)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">SecAuditEngine RelevantOnly       # 只审计被拦的</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">SecAuditLog /var/log/modsec_audit.log</span></span></code></pre></div><hr><h2 id="八、白名单-vs-黑名单-waf-的根本之争" tabindex="-1">八、白名单 vs 黑名单:WAF 的根本之争 <a class="header-anchor" href="#八、白名单-vs-黑名单-waf-的根本之争" aria-label="Permalink to &quot;八、白名单 vs 黑名单:WAF 的根本之争&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>黑名单(blocklist):允许默认,只挡已知坏的</span></span>
<span class="line"><span>  优点:不挡正常业务,部署快</span></span>
<span class="line"><span>  缺点:0day 攻击不挡,规则要不停更新</span></span>
<span class="line"><span>  适用:互联网公开服务、SaaS</span></span>
<span class="line"><span></span></span>
<span class="line"><span>白名单(allowlist):禁止默认,只放已知好的</span></span>
<span class="line"><span>  优点:0day 也挡(因为不在白名单里)</span></span>
<span class="line"><span>  缺点:业务变更就要改白名单,运维重</span></span>
<span class="line"><span>  适用:内网 API / 银行后台 / 特定接口</span></span></code></pre></div><p><strong>OWASP CRS 是黑名单</strong>——这是它好用的根本原因(易部署),也是它扛不住未知攻击的根本原因。</p><p><strong>两者结合</strong>才是企业级:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>黑名单层:OWASP CRS 拦 SQLi/XSS/RCE/LFI 等已知模式</span></span>
<span class="line"><span>+</span></span>
<span class="line"><span>白名单层:对 /admin/* /api/internal/* 强制源 IP 白名单</span></span>
<span class="line"><span>+</span></span>
<span class="line"><span>基于学习的白名单:WAF 学习正常请求结构,异常字段直接拦</span></span></code></pre></div><h3 id="_8-1-误杀-false-positive-排查" tabindex="-1">8.1 误杀(False Positive)排查 <a class="header-anchor" href="#_8-1-误杀-false-positive-排查" aria-label="Permalink to &quot;8.1 误杀(False Positive)排查&quot;">​</a></h3><p><strong>最常见的误杀</strong>:</p><table tabindex="0"><thead><tr><th>场景</th><th>误判规则</th><th>解决</th></tr></thead><tbody><tr><td>富文本编辑器提交 HTML</td><td>XSS</td><td>豁免 <code>/api/article/post</code></td></tr><tr><td>后端日志上报含 <code>&#39; &quot;</code></td><td>SQL 注入</td><td>豁免特定参数</td></tr><tr><td>文件上传 base64 含 <code>--</code></td><td>SQL 注释</td><td>豁免 <code>multipart/form-data</code></td></tr><tr><td>Markdown 链接 <code>[](javascript:...)</code></td><td>XSS payload</td><td>改业务前端预处理</td></tr><tr><td>用户名带 <code>&lt;script&gt;</code></td><td>XSS</td><td>业务侧拒绝即可</td></tr></tbody></table><p><strong>ModSec 豁免规则示例</strong>:</p><div class="language-apache vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">apache</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 在 location /api/article/post 里</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">SecRuleRemoveById </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">941100</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 941160</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 941170</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 或按参数豁免</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">SecRuleUpdateTargetById </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">941100</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> &quot;!ARGS:content&quot;</span></span></code></pre></div><blockquote><p>经验法则:<strong>WAF 上线第一个月主要工作 = 看 false positive 然后写豁免</strong>。准备好至少 3-5 个工时 / 周。</p></blockquote><hr><h2 id="九、挑战式防御-js-challenge-captcha" tabindex="-1">九、挑战式防御:JS Challenge / CAPTCHA <a class="header-anchor" href="#九、挑战式防御-js-challenge-captcha" aria-label="Permalink to &quot;九、挑战式防御:JS Challenge / CAPTCHA&quot;">​</a></h2><p>当 WAF 拿不准&quot;这个请求是不是真人&quot;时,<strong>让客户端&quot;证明自己是浏览器&quot;</strong>。这是 Cloudflare 5 秒盾的核心。</p><h3 id="_9-1-三种挑战强度" tabindex="-1">9.1 三种挑战强度 <a class="header-anchor" href="#_9-1-三种挑战强度" aria-label="Permalink to &quot;9.1 三种挑战强度&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>JS Challenge(无感)</span></span>
<span class="line"><span>  返回一段 JS,做一些计算 / 解一道小数学题 / 校验浏览器特性</span></span>
<span class="line"><span>  浏览器执行后带 token 重新请求 → 通过</span></span>
<span class="line"><span>  脚本工具(curl/wrk)无 JS 引擎 → 直接挂</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  代价:首次访问延迟 +200~500ms</span></span>
<span class="line"><span>  适合:可疑 IP、新 IP、低信誉 ASN</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Managed Challenge(轻交互)</span></span>
<span class="line"><span>  浏览器特性 + 可能弹出&quot;点这个方块&quot;</span></span>
<span class="line"><span>  hCaptcha / Cloudflare Turnstile</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  代价:用户体验稍差</span></span>
<span class="line"><span>  适合:登录 / 注册 / 评论提交</span></span>
<span class="line"><span></span></span>
<span class="line"><span>CAPTCHA / hCaptcha(强交互)</span></span>
<span class="line"><span>  让用户认图、点对话框</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  代价:转化率掉 10-20%(电商不能乱用)</span></span>
<span class="line"><span>  适合:高危操作、被打期间应急</span></span></code></pre></div><h3 id="_9-2-工作流-cloudflare-5-秒盾" tabindex="-1">9.2 工作流(Cloudflare 5 秒盾) <a class="header-anchor" href="#_9-2-工作流-cloudflare-5-秒盾" aria-label="Permalink to &quot;9.2 工作流(Cloudflare 5 秒盾)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Client ──── GET /any ─────► CDN</span></span>
<span class="line"><span>                              │</span></span>
<span class="line"><span>                              │ 判断:可疑</span></span>
<span class="line"><span>                              ▼</span></span>
<span class="line"><span>            ◄──── 200 OK + JS challenge ─── </span></span>
<span class="line"><span>            (页面只有一段 JS,跑 ~5 秒)</span></span>
<span class="line"><span>                              </span></span>
<span class="line"><span>浏览器执行 JS:</span></span>
<span class="line"><span>  - 收集 navigator.* 等指纹</span></span>
<span class="line"><span>  - 算一道数学题(慢 hash)</span></span>
<span class="line"><span>  - 写 cookie cf_clearance=xxx</span></span>
<span class="line"><span>  - 重定向回原页面</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Client ──── GET /any (带 cookie) ─────► CDN</span></span>
<span class="line"><span>                              │</span></span>
<span class="line"><span>                              │ 校验通过</span></span>
<span class="line"><span>                              ▼</span></span>
<span class="line"><span>            ◄──── 真实页面 ─── Origin</span></span></code></pre></div><p><strong>为什么有效</strong>:<strong>自动化攻击工具不跑 JS</strong>——Python requests / Go 的 net/http / curl 都不跑。要跑 JS 就得上 Selenium / Playwright,<strong>资源占用高 100 倍</strong>,攻击成本飙升 → 自动放弃。</p><h3 id="_9-3-反挑战-无头浏览器与对抗升级" tabindex="-1">9.3 反挑战:无头浏览器与对抗升级 <a class="header-anchor" href="#_9-3-反挑战-无头浏览器与对抗升级" aria-label="Permalink to &quot;9.3 反挑战:无头浏览器与对抗升级&quot;">​</a></h3><p>进攻方也在进化——Puppeteer / Playwright 用真实 Chromium,理论上能跑 JS。但留下 <strong>CDP(Chrome DevTools Protocol)指纹</strong>:</p><div class="language-js vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">js</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">navigator.webdriver </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">===</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> true</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">        // 自动化标志</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">window.chrome 缺少某些子对象        </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">// 真 Chrome 全有</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">WebGL renderer 是 </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;SwiftShader&quot;</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">     // 无 GPU 时</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">TLS</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> JA3</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 指纹与真实 Chrome 不一致     </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">// 库特征</span></span></code></pre></div><p>Cloudflare Bot Management 会综合 50+ 指纹判断。这是无止境的军备竞赛——<strong>所以&quot;挑战&quot;只能减缓,不能根除</strong>,核心还是<strong>让攻击成本 &gt; 攻击收益</strong>。</p><hr><h2 id="十、bot-流量识别-全网-30-流量的真相" tabindex="-1">十、Bot 流量识别:全网 30% 流量的真相 <a class="header-anchor" href="#十、bot-流量识别-全网-30-流量的真相" aria-label="Permalink to &quot;十、Bot 流量识别:全网 30% 流量的真相&quot;">​</a></h2><p>公开数据(Imperva 2024 Bad Bot Report):</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>全互联网流量构成:</span></span>
<span class="line"><span>  人类流量    51%</span></span>
<span class="line"><span>  好 Bot      17%   (Googlebot / Bingbot / 监控机器人)</span></span>
<span class="line"><span>  坏 Bot      32%   (爬虫 / 撞库 / 刷量 / 自动化攻击)</span></span>
<span class="line"><span>                    ↑</span></span>
<span class="line"><span>                    这是 WAF/Bot 防御的真正战场</span></span></code></pre></div><h3 id="_10-1-bot-识别四层信号" tabindex="-1">10.1 Bot 识别四层信号 <a class="header-anchor" href="#_10-1-bot-识别四层信号" aria-label="Permalink to &quot;10.1 Bot 识别四层信号&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>① IP 信誉</span></span>
<span class="line"><span>   - 是不是已知 IDC / VPS / 代理 / Tor 出口?</span></span>
<span class="line"><span>   - ASN 历史是不是常出问题?</span></span>
<span class="line"><span>   - 数据源:Spamhaus / IPinfo / MaxMind / 自建黑库</span></span>
<span class="line"><span></span></span>
<span class="line"><span>② 请求指纹</span></span>
<span class="line"><span>   - User-Agent 是不是真的常见?</span></span>
<span class="line"><span>   - HTTP/2 SETTINGS 帧顺序?</span></span>
<span class="line"><span>   - TLS JA3 / JA4 指纹?</span></span>
<span class="line"><span>   - 请求头大小写、顺序是不是符合主流浏览器?</span></span>
<span class="line"><span></span></span>
<span class="line"><span>③ 行为模式</span></span>
<span class="line"><span>   - 鼠标移动轨迹(前端埋点)</span></span>
<span class="line"><span>   - 页面停留时间</span></span>
<span class="line"><span>   - 点击 / 滚动事件分布</span></span>
<span class="line"><span>   - 跨页面访问图</span></span>
<span class="line"><span></span></span>
<span class="line"><span>④ 挑战响应</span></span>
<span class="line"><span>   - 跑得了 JS 吗?</span></span>
<span class="line"><span>   - 算得动 PoW(workload proof)吗?</span></span>
<span class="line"><span>   - 过得了 CAPTCHA 吗?</span></span></code></pre></div><h3 id="_10-2-ja3-ja4-指纹" tabindex="-1">10.2 JA3 / JA4 指纹 <a class="header-anchor" href="#_10-2-ja3-ja4-指纹" aria-label="Permalink to &quot;10.2 JA3 / JA4 指纹&quot;">​</a></h3><p><code>JA3</code> 是把 TLS ClientHello 里的字段(版本、加密套件、扩展、椭圆曲线、点格式)拼起来取 MD5——<strong>不同 TLS 库 / 浏览器版本指纹不同</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>真实 Chrome 120 (macOS):  769,4865-4866-4867-...   → JA3=cd08e31494f9531f560...</span></span>
<span class="line"><span>Python requests:            769,49195-49199-...     → JA3=c279b3b2810911ed3...</span></span>
<span class="line"><span>Go net/http:                772,4865-4866-...       → JA3=c45c2c2d6c40ee9eb...</span></span>
<span class="line"><span>curl:                        772,4866-4865-...      → JA3=51c64c77e60f3980a...</span></span></code></pre></div><p>WAF 维护一个&quot;已知库 / 攻击工具 JA3 黑名单&quot;——<strong>冒充 Chrome User-Agent 但 JA3 是 Python 的</strong>,就是典型的脚本攻击,直接拦。</p><p>JA4(2023 年新版)更细——把字段排序、加上 ALPN / SNI / 扩展数量,可读性更好。</p><h3 id="_10-3-bot-防御工程套路" tabindex="-1">10.3 Bot 防御工程套路 <a class="header-anchor" href="#_10-3-bot-防御工程套路" aria-label="Permalink to &quot;10.3 Bot 防御工程套路&quot;">​</a></h3><div class="language-nginx vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">nginx</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Nginx 简单防爬</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">map</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> $</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">http_user_agent</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> $bad_bot {</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    default</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 0</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    &quot;~*scrapy&quot;</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        1</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    &quot;~*python-requests&quot;</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 1</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    &quot;~*curl&quot;</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">          0</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;  </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># curl 是合法工具,不一刀切</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    &quot;~*libwww&quot;</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        1</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">server</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    if</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> ($bad_bot) { </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">return</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 403</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">; }</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span></code></pre></div><p><strong>生产级</strong>:用 Cloudflare Bot Management / DataDome / PerimeterX,因为单靠 UA / IP 已经远不够——这些产品维护几千万级别的 Bot 指纹库。</p><hr><h2 id="十一、限流策略-waf-最后一公里" tabindex="-1">十一、限流策略:WAF 最后一公里 <a class="header-anchor" href="#十一、限流策略-waf-最后一公里" aria-label="Permalink to &quot;十一、限流策略:WAF 最后一公里&quot;">​</a></h2><p>WAF 拦不住的&quot;看起来正常但量很大&quot;的请求,靠<strong>限流</strong>兜底。</p><h3 id="_11-1-三种主流算法" tabindex="-1">11.1 三种主流算法 <a class="header-anchor" href="#_11-1-三种主流算法" aria-label="Permalink to &quot;11.1 三种主流算法&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>算法           特点                          适用</span></span>
<span class="line"><span>────────────────────────────────────────────────────</span></span>
<span class="line"><span>计数器          固定窗口(1 分钟内不超 60)     简单接口</span></span>
<span class="line"><span>                临界点 burst 问题(0:59 + 1:00 双倍)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>滑动窗口        窗口连续移动                   API 网关</span></span>
<span class="line"><span>                精度高,内存稍多</span></span>
<span class="line"><span></span></span>
<span class="line"><span>漏桶            匀速输出                       视频上传 / 出口流控</span></span>
<span class="line"><span></span></span>
<span class="line"><span>令牌桶          匀速生成 token,可 burst       绝大多数业务</span></span>
<span class="line"><span>                Nginx limit_req 默认实现</span></span></code></pre></div><p>详见 algorithmLearning/24 限流算法。</p><h3 id="_11-2-nginx-限流完整示例" tabindex="-1">11.2 Nginx 限流完整示例 <a class="header-anchor" href="#_11-2-nginx-限流完整示例" aria-label="Permalink to &quot;11.2 Nginx 限流完整示例&quot;">​</a></h3><div class="language-nginx vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">nginx</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">http</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # 全局速率(IP 维度)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    limit_req_zone </span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$binary_remote_addr zone=ip_rl:10m rate=10r/s;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    </span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # 全局速率(用户 token 维度)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    limit_req_zone </span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$http_authorization zone=token_rl:10m rate=100r/s;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    </span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # 并发连接数限制</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    limit_conn_zone </span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">$binary_remote_addr zone=ip_conn:10m;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    server</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">        listen </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">443</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> ssl http2;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">        location</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> /api/ </span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">{</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">            limit_req </span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">zone=ip_rl burst=20 nodelay;</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">            limit_req </span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">zone=token_rl burst=200 nodelay;</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">            limit_conn </span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">ip_conn </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">50</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            </span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">            limit_req_status </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">429</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">            limit_req_log_level </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">warn</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            </span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">            proxy_pass </span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">http://backend;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        }</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        </span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">        # 高危接口更严格</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">        location</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> /api/login </span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">{</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">            limit_req </span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">zone=ip_rl burst=3 nodelay;</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">            proxy_pass </span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">http://backend;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        }</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    }</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span></code></pre></div><p><strong>经验值</strong>:</p><table tabindex="0"><thead><tr><th>接口类型</th><th>推荐速率</th><th>burst</th></tr></thead><tbody><tr><td>公开 GET API</td><td>100r/s</td><td>200</td></tr><tr><td>普通业务 API</td><td>10r/s</td><td>20</td></tr><tr><td>登录 / 注册</td><td>1r/s</td><td>3</td></tr><tr><td>密码重置 / 短信</td><td>1r/m</td><td>1</td></tr><tr><td>文件上传</td><td>5r/m</td><td>5</td></tr></tbody></table><h3 id="_11-3-分布式限流" tabindex="-1">11.3 分布式限流 <a class="header-anchor" href="#_11-3-分布式限流" aria-label="Permalink to &quot;11.3 分布式限流&quot;">​</a></h3><p>单机 Nginx 限流 = N 个机器各限 10 r/s = 总 10N r/s,失控。<strong>要全局限流,需要中心存储(Redis)</strong>。</p><div class="language-lua vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">lua</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">-- OpenResty + Redis 限流(令牌桶)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">local</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> key </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;rate:&quot; </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">..</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> ngx.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">var</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">remote_addr</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">local</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> count, err </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> red</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">incr</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(key)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">if</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> count </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">==</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 1</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> then</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    red</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">expire</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(key, </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">1</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">end</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">if</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> count </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">&gt;</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 10</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> then</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    return</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> ngx.</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">exit</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">429</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">end</span></span></code></pre></div><p>更工业化的做法:<strong>Sentinel / 阿里 AHAS / Envoy ratelimit service</strong>——支持滑动窗口、热点参数限流、集群限流。</p><hr><h2 id="十二、监控与应急-被打的时候怎么办" tabindex="-1">十二、监控与应急:被打的时候怎么办 <a class="header-anchor" href="#十二、监控与应急-被打的时候怎么办" aria-label="Permalink to &quot;十二、监控与应急:被打的时候怎么办&quot;">​</a></h2><h3 id="_12-1-必须有的监控指标" tabindex="-1">12.1 必须有的监控指标 <a class="header-anchor" href="#_12-1-必须有的监控指标" aria-label="Permalink to &quot;12.1 必须有的监控指标&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>网络层:</span></span>
<span class="line"><span>  入向带宽 / PPS                 → 容量型攻击早期信号</span></span>
<span class="line"><span>  TCP 连接数 / SYN_RECV 数      → SYN Flood 信号</span></span>
<span class="line"><span>  iptables drop 计数            → 防御命中</span></span>
<span class="line"><span></span></span>
<span class="line"><span>WAF 层:</span></span>
<span class="line"><span>  规则命中率                     → 攻击模式</span></span>
<span class="line"><span>  block / detection 比          → 误杀率</span></span>
<span class="line"><span>  challenge 通过率               → Bot 比例</span></span>
<span class="line"><span></span></span>
<span class="line"><span>应用层:</span></span>
<span class="line"><span>  QPS / 错误率 / P99            → 应用是否还活着</span></span>
<span class="line"><span>  上游 4xx/5xx                  → 后端是否被打挂</span></span>
<span class="line"><span>  慢日志 RT &gt; 1s                → CC 攻击信号</span></span></code></pre></div><h3 id="_12-2-被打时的应急-checklist" tabindex="-1">12.2 被打时的应急 Checklist <a class="header-anchor" href="#_12-2-被打时的应急-checklist" aria-label="Permalink to &quot;12.2 被打时的应急 Checklist&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>0. 不要 panic,先确认是不是攻击(可能就是流量上涨)</span></span>
<span class="line"><span>   → 看 PPS/带宽分布、源 IP 分布、UA 分布</span></span>
<span class="line"><span></span></span>
<span class="line"><span>1. 快速止血(5 分钟内)</span></span>
<span class="line"><span>   → CDN 切到&quot;我正在被攻击&quot;模式(高 challenge)</span></span>
<span class="line"><span>   → 黑名单批量加恶意 IP / ASN</span></span>
<span class="line"><span>   → 限流阈值收紧 50%</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. 分析(15 分钟)</span></span>
<span class="line"><span>   → 攻击是哪一类?容量型 / 协议型 / 应用型</span></span>
<span class="line"><span>   → 集中在哪个接口?哪个 IP 段?哪个国家?</span></span>
<span class="line"><span>   → 用什么工具?看 JA3 / UA</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. 定向防御(30 分钟)</span></span>
<span class="line"><span>   → 容量型:联系上游清洗</span></span>
<span class="line"><span>   → 应用型:WAF 加专项规则、提高挑战强度</span></span>
<span class="line"><span>   → 慢攻击:client_body_timeout 调小</span></span>
<span class="line"><span></span></span>
<span class="line"><span>4. 复盘(攻击后)</span></span>
<span class="line"><span>   → 哪些防御层起作用了</span></span>
<span class="line"><span>   → 哪些没起作用为什么</span></span>
<span class="line"><span>   → 是否要升级 CDN/WAF 套餐</span></span></code></pre></div><hr><h2 id="十三、踩坑提醒" tabindex="-1">十三、踩坑提醒 <a class="header-anchor" href="#十三、踩坑提醒" aria-label="Permalink to &quot;十三、踩坑提醒&quot;">​</a></h2><ol><li><strong>CDN 后 Nginx 限 IP</strong>——所有请求都来自 CDN IP,limit_req 全打到 CDN 上。要用 <code>$http_x_forwarded_for</code> 或 <code>$proxy_add_x_forwarded_for</code> 取真实 IP</li><li><strong>OWASP CRS 直接上 PL3</strong>——业务全炸,先 DetectionOnly 跑一周</li><li><strong>以为 WAF 能挡 DDoS</strong>——WAF 只挡应用层,容量型该被打还是被打</li><li><strong>iptables 规则上千条</strong>——每个包顺序匹配,延迟暴涨,要换 ipset / nftables / eBPF</li><li><strong>不开 SYN Cookies</strong>——一波 SYN Flood 就挂</li><li><strong>Memcached 公网开放无密码</strong>——百分之百会被当反射器,你成攻击源</li><li><strong>挑战强度全开</strong>——正常用户体验崩,转化率掉 30%</li><li><strong>WAF 不审计 audit log</strong>——出问题查不到什么被拦了</li><li><strong>JS Challenge 无超时</strong>——爬虫挂着不返回,反过来占满 worker</li><li><strong>限流粒度只有 IP</strong>——一个 NAT 出口几千用户,误杀严重,要按 token / session 限</li><li><strong>CC 攻击靠堆机器扛</strong>——加机器只是把&quot;被打死的时间&quot;延后 5 分钟,必须 WAF + 限流</li><li><strong>WAF 之后不做后端鉴权</strong>——WAF 一旦被绕,后端裸奔。<strong>WAF 是辅助,不是替代</strong></li></ol><hr><h2 id="十四、本章-checklist" tabindex="-1">十四、本章 Checklist <a class="header-anchor" href="#十四、本章-checklist" aria-label="Permalink to &quot;十四、本章 Checklist&quot;">​</a></h2><table tabindex="0"><thead><tr><th>项</th><th>说明</th></tr></thead><tbody><tr><td>能区分容量型 / 协议型 / 应用型</td><td>选对防御层</td></tr><tr><td>知道 SYN Cookies 是什么 / 什么时候启用</td><td>协议型必懂</td></tr><tr><td>听得懂&quot;反射放大攻击&quot; + 5 个常见反射协议</td><td>容量型必懂</td></tr><tr><td>装过 ModSecurity + OWASP CRS,能写一条豁免</td><td>WAF 入门</td></tr><tr><td>会写 Nginx limit_req 配置,知道 burst 含义</td><td>限流基本</td></tr><tr><td>知道 XDP / eBPF 比 iptables 快多少 / 为什么</td><td>大流量防御方向</td></tr><tr><td>区分 CAPTCHA / JS Challenge / Managed Challenge</td><td>防 Bot 工程</td></tr><tr><td>听说过 JA3 / JA4 指纹</td><td>Bot 识别核心</td></tr><tr><td>能列被打时的 5 步应急流程</td><td>实战经验</td></tr></tbody></table><hr><h2 id="十五、小结" tabindex="-1">十五、小结 <a class="header-anchor" href="#十五、小结" aria-label="Permalink to &quot;十五、小结&quot;">​</a></h2><p>防御互联网流量的本质是 <strong>三件事</strong>:</p><ol><li><strong>分层</strong> —— 没有任何单一手段能挡所有攻击。运营商清洗 + CDN + iptables/XDP + WAF + 限流,缺一环都有死角</li><li><strong>成本对抗</strong> —— 防御不是&quot;杜绝攻击&quot;,是&quot;让攻击成本 &gt; 攻击收益&quot;。Cloudflare Bot Management 抗不住国家级对抗,但抗得住 99% 的脚本小子</li><li><strong>可观测优先</strong> —— 没监控的防御等于裸奔。被打了不知道、知道了不会查、查到了不会复盘 → 永远在挨打</li></ol><p><strong>最重要的是动手做一次</strong>:起一个 Nginx + ModSecurity + OWASP CRS,自己写一段 Python 脚本&quot;攻击&quot;自己,看 WAF 怎么拦、log 怎么记。<strong>没拦下来过几次假攻击,永远不知道防御长什么样</strong>。</p><hr><p>下一篇:<code>38-渗透测试入门.md</code>,从<strong>进攻视角</strong>理解防御——但<strong>全程强调&quot;只在授权环境测试&quot;</strong>。讲信息收集(nmap / dig / Shodan)、常见漏洞类型(开放端口 / 弱密码 / SQL 注入 / SSRF / RCE)、抓 token 中间人(mitmproxy)、证书钉扎(Frida hook)、Burp Suite 工作流、漏洞赏金平台(HackerOne / Bugcrowd)、CTF 入门资源——<strong>懂攻才懂防,但永远在自己的盘子里玩</strong>。</p>`,169)])])}const g=a(l,[["render",t]]);export{c as __pageData,g as default};
