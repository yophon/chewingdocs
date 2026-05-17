import{_ as a,H as n,f as e,i as p}from"./chunks/framework.BHvCMIhP.js";const g=JSON.parse('{"title":"TLS 1.2 详解","description":"","frontmatter":{},"headers":[],"relativePath":"../networkLearning/18-TLS-1.2详解.md","filePath":"../networkLearning/18-TLS-1.2详解.md","lastUpdated":1778496697000}'),i={name:"../networkLearning/18-TLS-1.2详解.md"};function t(l,s,r,c,o,h){return n(),e("div",null,[...s[0]||(s[0]=[p(`<h1 id="tls-1-2-详解" tabindex="-1">TLS 1.2 详解 <a class="header-anchor" href="#tls-1-2-详解" aria-label="Permalink to &quot;TLS 1.2 详解&quot;">​</a></h1><p>上一篇 17 把密码学的五件原料(对称 / 非对称 / Hash / HMAC / 密钥交换)讲清了——这一篇把它们<strong>装配成 TLS 1.2 完整握手</strong>。TLS 1.2 是 2008 年的 RFC 5246,<strong>至今(2026)仍占公网流量约 20%</strong>(老客户端、嵌入式、银行网关都在用),理解它<strong>不是为了考古,而是因为 1.3 的设计就是&quot;针对 1.2 的所有缺陷动刀&quot;</strong>——不懂 1.2,看不出 1.3 改了什么。</p><blockquote><p>一句话先记住:<strong>TLS 1.2 的全握手是 2 RTT、4 个往返消息、7 种握手记录</strong>——核心就是&quot;双方协商一个密码套件,用非对称算法换出一对对称密钥,然后切换到对称信道继续传业务&quot;。<strong>握手里的每个消息都对应上一篇的某个原语</strong>——ServerHello 选套件、ServerKeyExchange 做 ECDHE、Certificate 走 RSA/ECDSA 签名验证、Finished 走 HMAC 校验。<strong>TLS 1.2 比 1.3 慢一个 RTT 的根本原因</strong>:它把&quot;协商参数&quot;和&quot;发密钥材料&quot;分成了两个往返,1.3 把它们合到了一个 ClientHello。</p></blockquote><hr><h2 id="一、tls-在协议栈里的位置" tabindex="-1">一、TLS 在协议栈里的位置 <a class="header-anchor" href="#一、tls-在协议栈里的位置" aria-label="Permalink to &quot;一、TLS 在协议栈里的位置&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>应用层      HTTP / SMTP / IMAP / gRPC ...</span></span>
<span class="line"><span>            ─────────────────────────────</span></span>
<span class="line"><span>TLS         (这一层&quot;上面像 TCP,下面像应用&quot;)</span></span>
<span class="line"><span>            ─────────────────────────────</span></span>
<span class="line"><span>传输层      TCP(必须可靠传输)</span></span>
<span class="line"><span>            ─────────────────────────────</span></span>
<span class="line"><span>网络层      IP</span></span></code></pre></div><p><strong>TLS 不是新协议层</strong>——它是&quot;夹在 TCP 和应用层之间的一个会话加密协议&quot;。<strong>对应用层来讲 TLS 透明</strong>:你 write/read 走的是 TLS 套接字,数据自动加密/解密;<strong>对 TCP 来讲 TLS 透明</strong>:它看到的就是字节流。</p><blockquote><p>经验法则:<strong>讨论网络架构时把 TLS 当成&quot;4.5 层&quot;</strong>——既不属于传输,也不属于应用,是横跨两者的&quot;信道层&quot;。</p></blockquote><hr><h2 id="二、tls-1-2-全握手-2-rtt-时序图" tabindex="-1">二、TLS 1.2 全握手:2 RTT 时序图 <a class="header-anchor" href="#二、tls-1-2-全握手-2-rtt-时序图" aria-label="Permalink to &quot;二、TLS 1.2 全握手:2 RTT 时序图&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Client                                          Server</span></span>
<span class="line"><span>  │                                               │</span></span>
<span class="line"><span>  │ ───────  TCP 三次握手(已完成)  ───────────  │</span></span>
<span class="line"><span>  │                                               │</span></span>
<span class="line"><span>  │  ClientHello                                  │</span></span>
<span class="line"><span>  │  ├─ legacy_version: TLS 1.2                   │</span></span>
<span class="line"><span>  │  ├─ random: 32 字节(前 4 时间戳 + 28 随机)   │</span></span>
<span class="line"><span>  │  ├─ session_id: &lt;空 / 上次 ID&gt;                 │</span></span>
<span class="line"><span>  │  ├─ cipher_suites: [套件1, 套件2, ...]         │  ← RTT 1</span></span>
<span class="line"><span>  │  ├─ extensions:                               │     去</span></span>
<span class="line"><span>  │  │   server_name (SNI)                        │</span></span>
<span class="line"><span>  │  │   supported_groups (曲线列表)               │</span></span>
<span class="line"><span>  │  │   signature_algorithms                     │</span></span>
<span class="line"><span>  │  └─ extensions: ec_point_formats              │</span></span>
<span class="line"><span>  │                                               │</span></span>
<span class="line"><span>  │ ─────────────────────────────────────────→   │</span></span>
<span class="line"><span>  │                                               │</span></span>
<span class="line"><span>  │                                       ServerHello</span></span>
<span class="line"><span>  │                                       ├─ version: TLS 1.2</span></span>
<span class="line"><span>  │                                       ├─ random: 32 字节</span></span>
<span class="line"><span>  │                                       ├─ session_id: &lt;分配 ID&gt;</span></span>
<span class="line"><span>  │                                       └─ cipher_suite: &lt;选定的一个&gt;</span></span>
<span class="line"><span>  │                                       │</span></span>
<span class="line"><span>  │                                       Certificate</span></span>
<span class="line"><span>  │                                       └─ &lt;X.509 链&gt;      ← RTT 1</span></span>
<span class="line"><span>  │                                       │                    回</span></span>
<span class="line"><span>  │                                       ServerKeyExchange</span></span>
<span class="line"><span>  │                                       ├─ EC params (曲线)</span></span>
<span class="line"><span>  │                                       ├─ ec_pub_key (服务端临时公钥)</span></span>
<span class="line"><span>  │                                       └─ signature (用证书私钥签前面所有)</span></span>
<span class="line"><span>  │                                       │</span></span>
<span class="line"><span>  │                                       ServerHelloDone</span></span>
<span class="line"><span>  │ ←─────────────────────────────────────────  │</span></span>
<span class="line"><span>  │                                               │</span></span>
<span class="line"><span>  │  (验证证书链 / 验证签名)                       │</span></span>
<span class="line"><span>  │  (生成自己的 ECDHE 临时私钥)                   │</span></span>
<span class="line"><span>  │                                               │</span></span>
<span class="line"><span>  │  ClientKeyExchange                            │</span></span>
<span class="line"><span>  │  └─ ec_pub_key (客户端临时公钥)                │  ← RTT 2</span></span>
<span class="line"><span>  │                                               │     去</span></span>
<span class="line"><span>  │  ChangeCipherSpec ←(从这里开始用对称密钥)    │</span></span>
<span class="line"><span>  │                                               │</span></span>
<span class="line"><span>  │  Finished                                     │</span></span>
<span class="line"><span>  │  └─ HMAC(handshake_messages, master_secret)   │</span></span>
<span class="line"><span>  │ ─────────────────────────────────────────→   │</span></span>
<span class="line"><span>  │                                               │</span></span>
<span class="line"><span>  │                                  ChangeCipherSpec</span></span>
<span class="line"><span>  │                                  Finished       ← RTT 2</span></span>
<span class="line"><span>  │ ←─────────────────────────────────────────  │      回</span></span>
<span class="line"><span>  │                                               │</span></span>
<span class="line"><span>  │ ═══════════ 应用数据(对称加密)══════════ │</span></span>
<span class="line"><span>  │                                               │</span></span></code></pre></div><p><strong>总耗时</strong>:<strong>TCP 1 RTT + TLS 2 RTT = 3 RTT 才能发第一个字节业务数据</strong>。如果 RTT 是 50ms,光握手就 150ms——这是 TLS 1.3 要解决的核心痛点。</p><hr><h2 id="三、clienthello-字段逐个看" tabindex="-1">三、ClientHello 字段逐个看 <a class="header-anchor" href="#三、clienthello-字段逐个看" aria-label="Permalink to &quot;三、ClientHello 字段逐个看&quot;">​</a></h2><h3 id="_3-1-字段表" tabindex="-1">3.1 字段表 <a class="header-anchor" href="#_3-1-字段表" aria-label="Permalink to &quot;3.1 字段表&quot;">​</a></h3><table tabindex="0"><thead><tr><th>字段</th><th>大小</th><th>作用</th></tr></thead><tbody><tr><td><code>legacy_version</code></td><td>2 字节</td><td>TLS 1.2 = 0x0303(历史包袱,见下)</td></tr><tr><td><code>random</code></td><td>32 字节</td><td>4 字节时间戳 + 28 字节随机,用于派生密钥</td></tr><tr><td><code>session_id</code></td><td>0-32 字节</td><td>复用旧 session 时填上次 ID</td></tr><tr><td><code>cipher_suites</code></td><td>变长</td><td>客户端支持的套件列表(按优先级排)</td></tr><tr><td><code>compression_methods</code></td><td>1 字节</td><td>历史字段,必须填 0(不压缩)</td></tr><tr><td><code>extensions</code></td><td>变长</td><td>后来扩展的字段都塞这里</td></tr></tbody></table><h3 id="_3-2-sni-扩展-为什么必须有" tabindex="-1">3.2 SNI 扩展:为什么必须有 <a class="header-anchor" href="#_3-2-sni-扩展-为什么必须有" aria-label="Permalink to &quot;3.2 SNI 扩展:为什么必须有&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>没 SNI 的世界:</span></span>
<span class="line"><span>  一个 IP 一个证书 ── 一台服务器 host 100 个 HTTPS 站要 100 个 IP</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>有 SNI:</span></span>
<span class="line"><span>  ClientHello 里告诉服务器 &quot;我要连 www.example.com&quot;</span></span>
<span class="line"><span>  服务器根据 SNI 选对应证书返回</span></span>
<span class="line"><span>  一个 IP 可以 host 任意多个 HTTPS 站</span></span></code></pre></div><p><strong>SNI 是明文的</strong>——TLS 1.2 / 1.3 都是。这就是中国 GFW 能按域名屏蔽 HTTPS 的原理。<strong>ECH(Encrypted Client Hello)</strong> 才能加密 SNI——见下一篇 19。</p><h3 id="_3-3-supported-groups-和-signature-algorithms" tabindex="-1">3.3 supported_groups 和 signature_algorithms <a class="header-anchor" href="#_3-3-supported-groups-和-signature-algorithms" aria-label="Permalink to &quot;3.3 supported_groups 和 signature_algorithms&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>supported_groups:        客户端能跑的椭圆曲线</span></span>
<span class="line"><span>                        secp256r1, secp384r1, x25519, ...</span></span>
<span class="line"><span></span></span>
<span class="line"><span>signature_algorithms:    客户端能验证的签名组合</span></span>
<span class="line"><span>                        ecdsa_secp256r1_sha256, rsa_pss_sha256, ed25519, ...</span></span></code></pre></div><p><strong>服务端从中选一个能用的</strong>——这是协商,不是强制。</p><hr><h2 id="四、套件命名-tls-ecdhe-rsa-with-aes-128-gcm-sha256-解读" tabindex="-1">四、套件命名:TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 解读 <a class="header-anchor" href="#四、套件命名-tls-ecdhe-rsa-with-aes-128-gcm-sha256-解读" aria-label="Permalink to &quot;四、套件命名:TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 解读&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>TLS _ ECDHE _ RSA _ WITH _ AES_128_GCM _ SHA256</span></span>
<span class="line"><span> │     │      │           │              │</span></span>
<span class="line"><span> │     │      │           │              └── HMAC 用的 PRF Hash</span></span>
<span class="line"><span> │     │      │           └── 对称加密算法 + 模式 + 密钥长度</span></span>
<span class="line"><span> │     │      └── 证书 / 签名算法(身份认证)</span></span>
<span class="line"><span> │     └── 密钥交换算法(协商 master secret)</span></span>
<span class="line"><span> └── 协议(固定)</span></span></code></pre></div><h3 id="_4-1-拆解四要素" tabindex="-1">4.1 拆解四要素 <a class="header-anchor" href="#_4-1-拆解四要素" aria-label="Permalink to &quot;4.1 拆解四要素&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>密钥交换:</span></span>
<span class="line"><span>  RSA       (静态 RSA,无 PFS,已废弃)</span></span>
<span class="line"><span>  DHE_RSA   (DH + RSA 签名)</span></span>
<span class="line"><span>  ECDHE_RSA (椭圆曲线 DHE + RSA 签名)  ← 主流</span></span>
<span class="line"><span>  ECDHE_ECDSA (椭圆曲线 DHE + ECDSA 签名)  ← 主流(ECC 证书)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>签名 / 认证算法:</span></span>
<span class="line"><span>  RSA</span></span>
<span class="line"><span>  ECDSA</span></span>
<span class="line"><span>  PSK   (预共享密钥,无证书)</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>对称加密 + 模式:</span></span>
<span class="line"><span>  AES_128_GCM       AEAD,主流</span></span>
<span class="line"><span>  AES_256_GCM       AEAD,高安全</span></span>
<span class="line"><span>  CHACHA20_POLY1305 AEAD,移动端友好</span></span>
<span class="line"><span>  AES_128_CBC       传统(已不推荐,padding oracle 风险)</span></span>
<span class="line"><span>  3DES_EDE_CBC      过时</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>HMAC PRF:</span></span>
<span class="line"><span>  SHA256 / SHA384  用于 Finished、密钥派生 PRF</span></span></code></pre></div><h3 id="_4-2-完整套件解读" tabindex="-1">4.2 完整套件解读 <a class="header-anchor" href="#_4-2-完整套件解读" aria-label="Permalink to &quot;4.2 完整套件解读&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384</span></span>
<span class="line"><span>└── 密钥交换 ECDHE   (X25519 或 P-256 椭圆曲线 DHE,有 PFS)</span></span>
<span class="line"><span>    签名 ECDSA       (用 P-384 ECDSA 证书签名,客户端验证)</span></span>
<span class="line"><span>    对称 AES-256-GCM (256 bit 密钥,GCM AEAD)</span></span>
<span class="line"><span>    PRF SHA-384      (Finished / 密钥派生用 SHA-384)</span></span></code></pre></div><blockquote><p>经验法则:<strong>生产环境只允许 ECDHE_xxx_WITH_AES_GCM 或 CHACHA20_POLY1305 套件</strong>——其他全禁。</p></blockquote><hr><h2 id="五、serverhello-certificate-serverkeyexchange-服务端的核心三件套" tabindex="-1">五、ServerHello + Certificate + ServerKeyExchange:服务端的核心三件套 <a class="header-anchor" href="#五、serverhello-certificate-serverkeyexchange-服务端的核心三件套" aria-label="Permalink to &quot;五、ServerHello + Certificate + ServerKeyExchange:服务端的核心三件套&quot;">​</a></h2><h3 id="_5-1-serverhello" tabindex="-1">5.1 ServerHello <a class="header-anchor" href="#_5-1-serverhello" aria-label="Permalink to &quot;5.1 ServerHello&quot;">​</a></h3><p>服务端从 ClientHello 的套件列表里<strong>挑一个</strong>——挑哪个由服务端配置决定。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>nginx 里的优先级:</span></span>
<span class="line"><span>  ssl_ciphers ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-GCM-SHA256:...</span></span>
<span class="line"><span>  ssl_prefer_server_ciphers on;   ← 服务端优先(推荐)</span></span></code></pre></div><p><strong>为什么服务端优先</strong>:防止客户端故意挑弱套件做降级攻击。</p><h3 id="_5-2-certificate-消息" tabindex="-1">5.2 Certificate 消息 <a class="header-anchor" href="#_5-2-certificate-消息" aria-label="Permalink to &quot;5.2 Certificate 消息&quot;">​</a></h3><p>服务端把整条证书链发回:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Certificate</span></span>
<span class="line"><span>├── 叶子证书(www.example.com,签发者:Let&#39;s Encrypt R3)</span></span>
<span class="line"><span>├── 中间证书(Let&#39;s Encrypt R3,签发者:ISRG Root X1)</span></span>
<span class="line"><span>└── (有时把根也发了,但客户端不用 — 根在本地信任库)</span></span></code></pre></div><p>客户端要做的事:</p><ol><li>验证证书签名(用上一级公钥验)</li><li>一直回溯到本地信任的根 CA</li><li>检查叶子证书 SAN 是否匹配 SNI 域名</li><li>检查证书有效期</li><li>检查 OCSP / CRL 吊销状态(可选)</li></ol><p><strong>完整的证书 / PKI 见 21 篇。</strong></p><h3 id="_5-3-serverkeyexchange-ecdhe-的核心" tabindex="-1">5.3 ServerKeyExchange:ECDHE 的核心 <a class="header-anchor" href="#_5-3-serverkeyexchange-ecdhe-的核心" aria-label="Permalink to &quot;5.3 ServerKeyExchange:ECDHE 的核心&quot;">​</a></h3><p>只有 <strong>DHE / ECDHE</strong> 套件才有这条消息(静态 RSA 没有)。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>ServerKeyExchange</span></span>
<span class="line"><span>├── 曲线类型(named_curve)+ 曲线 ID(如 x25519 = 0x001d)</span></span>
<span class="line"><span>├── 服务端临时公钥 ec_pub</span></span>
<span class="line"><span>└── 签名:sign(server_private_key,</span></span>
<span class="line"><span>                client_random || server_random || curve_params || ec_pub)</span></span></code></pre></div><p><strong>关键</strong>:<strong>签名用的是证书里的私钥(长期密钥),签的是临时 ECDHE 公钥</strong>——这就证明了&quot;这个临时公钥确实是有这张证书的服务器发的&quot;。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>为什么要这么签?</span></span>
<span class="line"><span>  防中间人:Mallory 截获 ServerHello,把 ec_pub 换成自己的</span></span>
<span class="line"><span>            但 Mallory 没有服务端私钥,签不出有效签名</span></span>
<span class="line"><span>            客户端验签失败 → 中止握手</span></span></code></pre></div><h3 id="_5-4-serverhellodone" tabindex="-1">5.4 ServerHelloDone <a class="header-anchor" href="#_5-4-serverhellodone" aria-label="Permalink to &quot;5.4 ServerHelloDone&quot;">​</a></h3><p>空消息,告诉客户端&quot;我说完了&quot;——没有别的内容,纯分隔符。</p><hr><h2 id="六、clientkeyexchange-finished-客户端发回密钥材料" tabindex="-1">六、ClientKeyExchange + Finished:客户端发回密钥材料 <a class="header-anchor" href="#六、clientkeyexchange-finished-客户端发回密钥材料" aria-label="Permalink to &quot;六、ClientKeyExchange + Finished:客户端发回密钥材料&quot;">​</a></h2><h3 id="_6-1-clientkeyexchange" tabindex="-1">6.1 ClientKeyExchange <a class="header-anchor" href="#_6-1-clientkeyexchange" aria-label="Permalink to &quot;6.1 ClientKeyExchange&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>ClientKeyExchange</span></span>
<span class="line"><span>└── ec_pub:客户端的 ECDHE 临时公钥</span></span></code></pre></div><p>到这里<strong>双方都有了对方的 ECDHE 公钥 + 自己的私钥</strong>——可以算出共享秘密 <code>pre_master_secret</code>。</p><h3 id="_6-2-派生-master-secret" tabindex="-1">6.2 派生 master_secret <a class="header-anchor" href="#_6-2-派生-master-secret" aria-label="Permalink to &quot;6.2 派生 master_secret&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>pre_master_secret = ECDHE(client_priv, server_pub)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>master_secret = PRF(pre_master_secret,</span></span>
<span class="line"><span>                    &quot;master secret&quot;,</span></span>
<span class="line"><span>                    client_random + server_random)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>// PRF = TLS 1.2 的伪随机函数,基于 HMAC-SHA256/384</span></span></code></pre></div><p><strong>42 字节 master_secret 是后续所有密钥的&quot;种子&quot;</strong>——派生出 6 个密钥:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>client_write_MAC_key   服务端验证客户端发的数据完整性</span></span>
<span class="line"><span>server_write_MAC_key   客户端验证服务端发的数据完整性</span></span>
<span class="line"><span>client_write_key       客户端发 → 服务端读 的对称密钥</span></span>
<span class="line"><span>server_write_key       服务端发 → 客户端读 的对称密钥</span></span>
<span class="line"><span>client_write_IV        客户端的初始向量</span></span>
<span class="line"><span>server_write_IV        服务端的初始向量</span></span></code></pre></div><p><strong>注意</strong>:用 AEAD(GCM)的话不需要 MAC key——AEAD 自带认证。</p><h3 id="_6-3-changecipherspec" tabindex="-1">6.3 ChangeCipherSpec <a class="header-anchor" href="#_6-3-changecipherspec" aria-label="Permalink to &quot;6.3 ChangeCipherSpec&quot;">​</a></h3><p><strong>1 字节的消息</strong>:<code>0x01</code>——告诉对方&quot;从下一个消息开始,我用对称密钥加密了&quot;。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>注意:这不是握手消息,是单独的 record 类型</span></span>
<span class="line"><span>TLS 1.3 把它删了——白费一个 RTT 字节</span></span></code></pre></div><h3 id="_6-4-finished" tabindex="-1">6.4 Finished <a class="header-anchor" href="#_6-4-finished" aria-label="Permalink to &quot;6.4 Finished&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Finished = PRF(master_secret,</span></span>
<span class="line"><span>               &quot;client finished&quot;,</span></span>
<span class="line"><span>               Hash(所有之前的握手消息))</span></span></code></pre></div><p><strong>作用</strong>:用刚协商出的 master_secret 计算一个 HMAC,<strong>校验前面所有握手数据没被中间人篡改</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>为什么不直接哈希?</span></span>
<span class="line"><span>  哈希谁都能算</span></span>
<span class="line"><span>  HMAC 需要 key,只有持 master_secret 的双方才能算</span></span>
<span class="line"><span></span></span>
<span class="line"><span>如果中间人改了 ClientHello 的 cipher_suites(降级攻击):</span></span>
<span class="line"><span>  服务端按改过的列表选了弱套件</span></span>
<span class="line"><span>  双方算 master_secret 都成功(ECDHE 通了)</span></span>
<span class="line"><span>  但 Client 算的 Finished 用的是原始 ClientHello hash</span></span>
<span class="line"><span>  Server 算的是被改过的 hash</span></span>
<span class="line"><span>  → 两边对不上 → 握手失败 → 降级攻击被识破</span></span></code></pre></div><p><strong>Finished 是 TLS 安全的最后一道闸</strong>。</p><hr><h2 id="七、session-复用-省一个-rtt" tabindex="-1">七、Session 复用:省一个 RTT <a class="header-anchor" href="#七、session-复用-省一个-rtt" aria-label="Permalink to &quot;七、Session 复用:省一个 RTT&quot;">​</a></h2><p>每次都跑 2 RTT 全握手太贵了——<strong>TLS 1.2 提供两种复用机制</strong>。</p><h3 id="_7-1-session-id" tabindex="-1">7.1 Session ID <a class="header-anchor" href="#_7-1-session-id" aria-label="Permalink to &quot;7.1 Session ID&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>首次握手:</span></span>
<span class="line"><span>  ServerHello.session_id = &quot;abc123&quot;</span></span>
<span class="line"><span>  服务端在内存里存 (abc123, master_secret, suite, ...)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>下次客户端来:</span></span>
<span class="line"><span>  ClientHello.session_id = &quot;abc123&quot;</span></span>
<span class="line"><span>  服务端查内存,找到了!</span></span>
<span class="line"><span>  直接用旧 master_secret,跳过 ECDHE</span></span>
<span class="line"><span>  返回:ServerHello + ChangeCipherSpec + Finished</span></span>
<span class="line"><span>  Client:ChangeCipherSpec + Finished</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  → 1 RTT,不需要证书 / ECDHE</span></span></code></pre></div><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>        ClientHello (含 session_id)</span></span>
<span class="line"><span>   ─────────────────────────→</span></span>
<span class="line"><span>                     ServerHello + CCS + Finished</span></span>
<span class="line"><span>   ←─────────────────────────</span></span>
<span class="line"><span>   CCS + Finished + 应用数据</span></span>
<span class="line"><span>   ─────────────────────────→</span></span></code></pre></div><p><strong>问题</strong>:服务端要存 session 状态,<strong>多机集群难做</strong>——每台机内存不共享,得放 Redis,运维负担大。</p><h3 id="_7-2-session-ticket-rfc-5077" tabindex="-1">7.2 Session Ticket(RFC 5077) <a class="header-anchor" href="#_7-2-session-ticket-rfc-5077" aria-label="Permalink to &quot;7.2 Session Ticket(RFC 5077)&quot;">​</a></h3><p><strong>思路</strong>:<strong>让客户端帮服务端存 session,但加密</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>首次握手末尾:</span></span>
<span class="line"><span>  服务端额外发一个 NewSessionTicket</span></span>
<span class="line"><span>  └── ticket = AES_encrypt(server_master_key,</span></span>
<span class="line"><span>                           {session_master_secret, suite, expiry})</span></span>
<span class="line"><span>  客户端存下这个 ticket(对它是不透明字节)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>下次客户端来:</span></span>
<span class="line"><span>  ClientHello + extension: SessionTicket = &lt;旧 ticket&gt;</span></span>
<span class="line"><span>  服务端用 server_master_key 解密 ticket → 拿到 master_secret</span></span>
<span class="line"><span>  → 1 RTT 复用</span></span></code></pre></div><p><strong>优势</strong>:<strong>服务端无状态</strong>——只要每台机用同一个 server_master_key,集群任意节点都能复用。</p><p><strong>Nginx 配置</strong>:</p><div class="language-nginx vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">nginx</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">ssl_session_tickets </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">on</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">ssl_session_ticket_key </span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">/etc/nginx/ssl_ticket.key;  </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 集群共享</span></span></code></pre></div><blockquote><p>踩坑提醒:<strong>ssl_session_ticket_key 要定期轮换</strong>——这把 key 一旦泄露,可以解密历史所有复用会话(违反 PFS)。<strong>生产建议每天轮换 + 旧 key 保留 24 小时</strong>。</p></blockquote><h3 id="_7-3-复用的-rtt-对比" tabindex="-1">7.3 复用的 RTT 对比 <a class="header-anchor" href="#_7-3-复用的-rtt-对比" aria-label="Permalink to &quot;7.3 复用的 RTT 对比&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>全握手:                  2 RTT</span></span>
<span class="line"><span>Session ID 复用:         1 RTT</span></span>
<span class="line"><span>Session Ticket 复用:     1 RTT</span></span>
<span class="line"><span>TLS 1.3 0-RTT(下篇讲): 0 RTT</span></span></code></pre></div><hr><h2 id="八、pfs-前向安全到底是什么" tabindex="-1">八、PFS:前向安全到底是什么 <a class="header-anchor" href="#八、pfs-前向安全到底是什么" aria-label="Permalink to &quot;八、PFS:前向安全到底是什么&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>没 PFS(静态 RSA 密钥交换):</span></span>
<span class="line"><span>  ClientKeyExchange 包含 RSA_encrypt(server_pub, pre_master_secret)</span></span>
<span class="line"><span>  攻击者抓了完整流量,3 年后偷到 server 私钥</span></span>
<span class="line"><span>  → 解出 pre_master_secret → 派生 master_secret → 解密所有历史会话</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>有 PFS(ECDHE):</span></span>
<span class="line"><span>  pre_master_secret = ECDHE(临时密钥)</span></span>
<span class="line"><span>  握手结束临时密钥就丢了</span></span>
<span class="line"><span>  即使长期私钥泄露,过去会话也无法解密</span></span></code></pre></div><p><strong>PFS 是 ECDHE 套件相对于静态 RSA 套件的根本优势</strong>——这就是为什么 TLS 1.3 直接禁掉了 RSA 密钥交换(只剩 ECDHE)。</p><blockquote><p>经验法则:<strong>配 TLS 1.2 时只允许 ECDHE_xxx 套件</strong>——把 <code>TLS_RSA_WITH_xxx</code> 全禁。这是 SSL Labs A+ 评分的硬门槛。</p></blockquote><hr><h2 id="九、openssl-s-client-实操抓握手" tabindex="-1">九、openssl s_client 实操抓握手 <a class="header-anchor" href="#九、openssl-s-client-实操抓握手" aria-label="Permalink to &quot;九、openssl s_client 实操抓握手&quot;">​</a></h2><h3 id="_9-1-最基本" tabindex="-1">9.1 最基本 <a class="header-anchor" href="#_9-1-最基本" aria-label="Permalink to &quot;9.1 最基本&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">openssl</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> s_client</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -connect</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> www.example.com:443</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -servername</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> www.example.com</span></span></code></pre></div><p><code>-servername</code> 是手动指定 SNI——<strong>不指定的话默认用 IP,大部分服务器返回错证书</strong>。</p><p>输出关键段:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>SSL handshake has read 5247 bytes and written 357 bytes</span></span>
<span class="line"><span>---</span></span>
<span class="line"><span>New, TLSv1.2, Cipher is ECDHE-RSA-AES256-GCM-SHA384</span></span>
<span class="line"><span>Server public key is 2048 bit</span></span>
<span class="line"><span>Secure Renegotiation IS supported</span></span>
<span class="line"><span>Compression: NONE</span></span>
<span class="line"><span>Expansion: NONE</span></span>
<span class="line"><span>No ALPN negotiated</span></span>
<span class="line"><span>SSL-Session:</span></span>
<span class="line"><span>    Protocol  : TLSv1.2</span></span>
<span class="line"><span>    Cipher    : ECDHE-RSA-AES256-GCM-SHA384</span></span>
<span class="line"><span>    Session-ID: 8A3B...</span></span>
<span class="line"><span>    Session-ID-ctx:</span></span>
<span class="line"><span>    Master-Key: F2E1...</span></span>
<span class="line"><span>    PSK identity: None</span></span>
<span class="line"><span>    Start Time: 1747000000</span></span>
<span class="line"><span>    Timeout   : 7200 (sec)</span></span></code></pre></div><p><strong>关注</strong>:</p><ul><li><code>Cipher</code>:实际选用的套件</li><li><code>Session-ID</code>:能复用就有</li><li><code>Master-Key</code>:派生出的 master_secret(调试用)</li></ul><h3 id="_9-2-强制-tls-1-2-对比-1-3" tabindex="-1">9.2 强制 TLS 1.2(对比 1.3) <a class="header-anchor" href="#_9-2-强制-tls-1-2-对比-1-3" aria-label="Permalink to &quot;9.2 强制 TLS 1.2(对比 1.3)&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">openssl</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> s_client</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -connect</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> www.example.com:443</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -tls1_2</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -servername</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> www.example.com</span></span></code></pre></div><p>加 <code>-tls1_2</code> / <code>-tls1_3</code> 强制版本。</p><h3 id="_9-3-列出对方支持的套件" tabindex="-1">9.3 列出对方支持的套件 <a class="header-anchor" href="#_9-3-列出对方支持的套件" aria-label="Permalink to &quot;9.3 列出对方支持的套件&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">nmap</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --script</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ssl-enum-ciphers</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -p</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 443</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> www.example.com</span></span></code></pre></div><p>输出每个版本各支持哪些套件,<strong>强度评级 A-F</strong>。</p><h3 id="_9-4-用-tcpdump-抓握手" tabindex="-1">9.4 用 tcpdump 抓握手 <a class="header-anchor" href="#_9-4-用-tcpdump-抓握手" aria-label="Permalink to &quot;9.4 用 tcpdump 抓握手&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> tcpdump</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -i</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> any</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -w</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> tls12.pcap</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -s</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 0</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;port 443 and host www.example.com&#39;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 另开终端</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">curl</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --tlsv1.2</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> https://www.example.com</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -o</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /dev/null</span></span></code></pre></div><p>把 <code>tls12.pcap</code> 拖进 Wireshark,过滤 <code>tls.handshake</code>——能看到 ClientHello / ServerHello / Certificate / ServerKeyExchange 整套消息。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>要看到加密内容,需要导出 SSLKEYLOGFILE:</span></span>
<span class="line"><span>  SSLKEYLOGFILE=/tmp/keys.log curl https://www.example.com</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>然后 Wireshark → Edit → Preferences → Protocols → TLS</span></span>
<span class="line"><span>设置 (Pre)-Master-Secret log filename = /tmp/keys.log</span></span></code></pre></div><p>之后 Wireshark 能解密所有 record,看到明文 HTTP——<strong>这是 TLS 调试最强武器</strong>。</p><blockquote><p>详细抓包技巧见 39 篇抓包高级。</p></blockquote><hr><h2 id="十、tls-1-2-的安全缺陷-为什么必须升-1-3" tabindex="-1">十、TLS 1.2 的安全缺陷:为什么必须升 1.3 <a class="header-anchor" href="#十、tls-1-2-的安全缺陷-为什么必须升-1-3" aria-label="Permalink to &quot;十、TLS 1.2 的安全缺陷:为什么必须升 1.3&quot;">​</a></h2><h3 id="_10-1-协议层缺陷" tabindex="-1">10.1 协议层缺陷 <a class="header-anchor" href="#_10-1-协议层缺陷" aria-label="Permalink to &quot;10.1 协议层缺陷&quot;">​</a></h3><table tabindex="0"><thead><tr><th>缺陷</th><th>描述</th><th>1.3 怎么修</th></tr></thead><tbody><tr><td>2 RTT 慢</td><td>全握手三个往返</td><td>合并到 1 RTT</td></tr><tr><td>套件爆炸</td><td>30+ 套件,搭配组合上百</td><td>只剩 5 个 AEAD 套件</td></tr><tr><td>静态 RSA 密钥交换</td><td>没 PFS</td><td>删了</td></tr><tr><td>CBC 模式</td><td>padding oracle</td><td>删了,只 AEAD</td></tr><tr><td>明文 ServerHello.cipher_suite</td><td>中间人能看到密码套件</td><td>加密</td></tr><tr><td>压缩开放</td><td>CRIME 攻击</td><td>禁压缩</td></tr><tr><td>重协商</td><td>DoS / 注入</td><td>删了</td></tr><tr><td>弱 PRF MD5/SHA-1 兼容</td><td>可降级</td><td>强制 SHA-256+</td></tr></tbody></table><h3 id="_10-2-实施层灾难史" tabindex="-1">10.2 实施层灾难史 <a class="header-anchor" href="#_10-2-实施层灾难史" aria-label="Permalink to &quot;10.2 实施层灾难史&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>2014 Heartbleed:  OpenSSL 心跳越界读,泄露密钥</span></span>
<span class="line"><span>2014 POODLE:      SSL 3.0 padding oracle</span></span>
<span class="line"><span>2015 FREAK:       RSA 密钥强度降级到 512 bit(出口管制遗产)</span></span>
<span class="line"><span>2015 Logjam:      DH 参数降级到 512 bit</span></span>
<span class="line"><span>2016 DROWN:       SSL 2.0 还活着的 OpenSSL 跨协议攻击</span></span>
<span class="line"><span>2018 ROBOT:       Bleichenbacher 攻击复活,RSA 密钥交换又中招</span></span></code></pre></div><p><strong>TLS 1.3 设计就是带着这些教训重新做的</strong>——下一篇详讲。</p><hr><h2 id="十一、生产-nginx-tls-1-2-配置参考" tabindex="-1">十一、生产 Nginx TLS 1.2 配置参考 <a class="header-anchor" href="#十一、生产-nginx-tls-1-2-配置参考" aria-label="Permalink to &quot;十一、生产 Nginx TLS 1.2 配置参考&quot;">​</a></h2><div class="language-nginx vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">nginx</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">ssl_protocols </span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">TLSv1.2 TLSv1.3;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 只允许这几个强套件(TLS 1.2 部分)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">ssl_ciphers </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    ECDHE-ECDSA-AES256-GCM-SHA384:</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    ECDHE-RSA-AES256-GCM-SHA384:</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    ECDHE-ECDSA-CHACHA20-POLY1305:</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    ECDHE-RSA-CHACHA20-POLY1305:</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    ECDHE-ECDSA-AES128-GCM-SHA256:</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    ECDHE-RSA-AES128-GCM-SHA256</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">ssl_prefer_server_ciphers </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">on</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 椭圆曲线优先 X25519</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">ssl_ecdh_curve </span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">X25519:secp384r1:secp256r1;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Session 复用</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">ssl_session_cache </span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">shared:SSL:50m;</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">ssl_session_timeout </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">1d</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">ssl_session_tickets </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">on</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">ssl_session_ticket_key </span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">/etc/nginx/ticket.key;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># OCSP Stapling(下下篇 21 详讲)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">ssl_stapling </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">on</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">ssl_stapling_verify </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">on</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span></code></pre></div><p><strong>测试</strong>:<code>curl https://www.ssllabs.com/ssltest/analyze.html?d=www.your.com</code> 看评分,目标 A+。</p><hr><h2 id="十二、tls-record-协议-握手完之后" tabindex="-1">十二、TLS Record 协议:握手完之后 <a class="header-anchor" href="#十二、tls-record-协议-握手完之后" aria-label="Permalink to &quot;十二、TLS Record 协议:握手完之后&quot;">​</a></h2><p>握手只是一次性的事,后续的应用数据走 <strong>Record 协议</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>TLS Record:</span></span>
<span class="line"><span>┌─────────────────────────────────────────────┐</span></span>
<span class="line"><span>│ ContentType   1 字节  (handshake / alert /   │</span></span>
<span class="line"><span>│                       application_data /     │</span></span>
<span class="line"><span>│                       change_cipher_spec)    │</span></span>
<span class="line"><span>├─────────────────────────────────────────────┤</span></span>
<span class="line"><span>│ Version       2 字节  (0x0303 for 1.2)       │</span></span>
<span class="line"><span>├─────────────────────────────────────────────┤</span></span>
<span class="line"><span>│ Length        2 字节  (≤ 16384 + 2048)       │</span></span>
<span class="line"><span>├─────────────────────────────────────────────┤</span></span>
<span class="line"><span>│ Encrypted     ≤ 16 KB 实际加密的应用数据      │</span></span>
<span class="line"><span>│ Payload                                      │</span></span>
<span class="line"><span>├─────────────────────────────────────────────┤</span></span>
<span class="line"><span>│ MAC(non-AEAD) 或 AEAD tag(GCM/Poly1305)     │</span></span>
<span class="line"><span>└─────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>最大 record 16 KB</strong>——大文件要拆成多个 record。</p><hr><h2 id="十三、踩坑提醒" tabindex="-1">十三、踩坑提醒 <a class="header-anchor" href="#十三、踩坑提醒" aria-label="Permalink to &quot;十三、踩坑提醒&quot;">​</a></h2><ol><li><strong>没配 SNI</strong>——同 IP 多站,curl 不带 <code>--resolve</code> 抓错证书</li><li><strong>服务端 cipher 列表里还留 RSA 密钥交换</strong>——SSL Labs 直接降到 B</li><li><strong>session_ticket_key 不轮换</strong>——一年没换,泄露了等于全裸</li><li><strong>集群内 ticket key 不一致</strong>——LB 转发到不同节点,复用全失败,RTT 飚高</li><li><strong>CBC 套件未禁</strong>——还可能踩 Lucky 13 / BEAST</li><li><strong>TLS 1.0 / 1.1 还开着</strong>——PCI DSS 早就禁了,合规审计直接 fail</li><li><strong>ssl_buffer_size 默认 16K</strong>——小响应等满 buffer 才发,延迟 +50ms,小 API 业务调到 4K</li><li><strong>不开 OCSP Stapling</strong>——客户端每次连接要自己查 OCSP,首屏延迟 +200ms</li><li><strong>证书链不全</strong>——只发叶子,Firefox / curl 报 &quot;unable to verify&quot;,见 21 篇</li><li><strong>以为 ECDHE 一定比 RSA 慢</strong>——服务端有 ECDSA 证书时反而 ECDHE_ECDSA 比 RSA_xx 都快</li><li><strong>抓包 Wireshark 看不到明文</strong>——没设 SSLKEYLOGFILE,纯密文文件</li><li><strong>以为 master_secret 是 32 字节</strong>——实际 48 字节(TLS 1.2 spec)</li></ol><hr><h2 id="十四、本章-checklist" tabindex="-1">十四、本章 Checklist <a class="header-anchor" href="#十四、本章-checklist" aria-label="Permalink to &quot;十四、本章 Checklist&quot;">​</a></h2><table tabindex="0"><thead><tr><th>项</th><th>说明</th></tr></thead><tbody><tr><td>✅ 能画 TLS 1.2 全握手 7 个消息时序图</td><td>必修</td></tr><tr><td>✅ 能解读 <code>TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256</code> 每个字段</td><td>必修</td></tr><tr><td>✅ 知道为什么 ECDHE 提供 PFS,静态 RSA 不提供</td><td>概念</td></tr><tr><td>✅ 能区分 Session ID 复用 vs Session Ticket 复用</td><td>实战</td></tr><tr><td>✅ 会用 <code>openssl s_client</code> 抓握手并读输出</td><td>工具</td></tr><tr><td>✅ 知道 SNI 是明文的,GFW 据此封域名</td><td>安全</td></tr><tr><td>✅ 会配 Nginx 只留 ECDHE_*_GCM 套件</td><td>配置</td></tr><tr><td>✅ 知道 Wireshark + SSLKEYLOGFILE 能解密</td><td>调试</td></tr></tbody></table><hr><h2 id="十五、小结" tabindex="-1">十五、小结 <a class="header-anchor" href="#十五、小结" aria-label="Permalink to &quot;十五、小结&quot;">​</a></h2><p>TLS 1.2 的核心架构总结:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 协商    ClientHello / ServerHello   交换随机数 + 选套件</span></span>
<span class="line"><span>2. 认证    Certificate                 服务端证明身份</span></span>
<span class="line"><span>3. 密钥    ServerKeyExchange / ClientKeyExchange  ECDHE 协商</span></span>
<span class="line"><span>4. 切换    ChangeCipherSpec            从这里开始对称加密</span></span>
<span class="line"><span>5. 校验    Finished                    HMAC 防降级</span></span></code></pre></div><p><strong>这五步贯穿了上一篇 17 讲的所有原语</strong>——非对称(证书签名)、密钥交换(ECDHE)、Hash(PRF)、HMAC(Finished)、对称加密(AES-GCM)五个一起出场。</p><p>记住三件事:</p><ol><li><strong>TLS 1.2 = 2 RTT 全握手 + 1 RTT 复用</strong>——慢就慢在这</li><li><strong>套件名解读四要素</strong>:密钥交换 + 签名 + 对称加密 + PRF Hash</li><li><strong>生产只允许 ECDHE_*_GCM 套件</strong>——PFS + AEAD 双保险</li></ol><p>下一篇:<code>19-TLS-1.3详解.md</code>——讲 TLS 1.3 是怎么把 2 RTT 变 1 RTT、复用变 0 RTT 的,<strong>核心思路是&quot;赌&quot;</strong>:<strong>ClientHello 直接带上 KeyShare(猜服务端会选什么曲线)</strong>,服务端如果接受就一来一回完事。还会讲 0-RTT 的重放风险代价、PSK 模式、Encrypted Client Hello(ECH)如何加密 SNI,以及怎么用 Wireshark 看 1.3 握手——你会看到几乎所有握手字段都被加密了。</p>`,139)])])}const k=a(i,[["render",t]]);export{g as __pageData,k as default};
