import{_ as a,H as n,f as e,i as p}from"./chunks/framework.BHvCMIhP.js";const k=JSON.parse('{"title":"TLS 1.3 详解","description":"","frontmatter":{},"headers":[],"relativePath":"networkLearning/19-TLS-1.3详解.md","filePath":"networkLearning/19-TLS-1.3详解.md","lastUpdated":1778496697000}'),t={name:"networkLearning/19-TLS-1.3详解.md"};function i(l,s,r,o,h,c){return n(),e("div",null,[...s[0]||(s[0]=[p(`<h1 id="tls-1-3-详解" tabindex="-1">TLS 1.3 详解 <a class="header-anchor" href="#tls-1-3-详解" aria-label="Permalink to &quot;TLS 1.3 详解&quot;">​</a></h1><p>上一篇 18 把 TLS 1.2 的 2 RTT 全握手画完了——<strong>这一篇讲 TLS 1.3 是怎么把它砍成 1 RTT 的</strong>。RFC 8446 在 2018 年发布,设计耗时 4 年、改了 28 版草案、是 IETF 历史上<strong>讨论最激烈的协议之一</strong>——因为它<strong>砍掉了 TLS 1.2 一半以上的功能</strong>:静态 RSA 密钥交换、CBC 模式、压缩、重协商、不安全套件全删。<strong>TLS 1.3 不是 1.2 的小修小补,是推倒重来</strong>——不懂这层颠覆,看不出&quot;为什么 1.3 既快又安全&quot;。</p><blockquote><p>一句话先记住:<strong>TLS 1.3 = 1 RTT 全握手 + 0 RTT 复用</strong>——核心招数是**&quot;客户端在 ClientHello 里直接赌一个 ECDHE 公钥&quot;(KeyShare extension)**,服务端只要接受这个曲线就立刻能算 master_secret,<strong>握手第二个 flight 就开始加密</strong>。**0-RTT(早期数据)**是双刃剑:<strong>省一个 RTT 但有重放风险</strong>——只能用于幂等请求(GET)。<strong>TLS 1.3 把握手消息绝大部分都加密了</strong>——抓包只能看到 ClientHello 和 ServerHello 是明文,后面全是密文。</p></blockquote><hr><h2 id="一、为什么需要-tls-1-3" tabindex="-1">一、为什么需要 TLS 1.3 <a class="header-anchor" href="#一、为什么需要-tls-1-3" aria-label="Permalink to &quot;一、为什么需要 TLS 1.3&quot;">​</a></h2><h3 id="_1-1-1-2-的问题清单-承接上一篇" tabindex="-1">1.1 1.2 的问题清单(承接上一篇) <a class="header-anchor" href="#_1-1-1-2-的问题清单-承接上一篇" aria-label="Permalink to &quot;1.1 1.2 的问题清单(承接上一篇)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 2 RTT 慢                    → 移动网络 RTT 100ms 时握手 200ms</span></span>
<span class="line"><span>2. 套件爆炸 + 弱套件还没删    → 配错就降级,运维灾难</span></span>
<span class="line"><span>3. 静态 RSA 密钥交换           → 没 PFS</span></span>
<span class="line"><span>4. CBC 模式还在               → padding oracle 攻击源源不断</span></span>
<span class="line"><span>5. 中间盒(防火墙 / IDS)       → 看到加密内容做不到,反而拦截了升级</span></span>
<span class="line"><span>6. 握手字段大部分明文          → 元数据泄露(SNI / 证书)</span></span></code></pre></div><h3 id="_1-2-设计目标" tabindex="-1">1.2 设计目标 <a class="header-anchor" href="#_1-2-设计目标" aria-label="Permalink to &quot;1.2 设计目标&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 减少 RTT      ── 全握手 1 RTT,复用 0 RTT</span></span>
<span class="line"><span>2. 加密握手元数据 ── 除 ClientHello / ServerHello 外全加密</span></span>
<span class="line"><span>3. 删功能        ── 删除 1.2 所有&quot;看起来能用但不安全&quot;的特性</span></span>
<span class="line"><span>4. 抗中间盒      ── 把 ServerHello 之外的握手伪装成 1.2 的应用数据</span></span>
<span class="line"><span>                   骗过中间盒的&quot;看到 TLS 升级就拦&quot;</span></span>
<span class="line"><span>5. 抗量子(局部)── 引入 X25519 等抗量子准备的密钥交换设计</span></span></code></pre></div><blockquote><p>经验法则:<strong>TLS 1.3 的协议设计哲学是&quot;减法&quot;</strong>——能删则删,不允许&quot;可选的不安全&quot;。这就是为什么它套件只剩 5 个,而 1.2 有 30+。</p></blockquote><hr><h2 id="二、tls-1-3-全握手-1-rtt-时序图" tabindex="-1">二、TLS 1.3 全握手:1 RTT 时序图 <a class="header-anchor" href="#二、tls-1-3-全握手-1-rtt-时序图" aria-label="Permalink to &quot;二、TLS 1.3 全握手:1 RTT 时序图&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Client                                          Server</span></span>
<span class="line"><span>  │                                               │</span></span>
<span class="line"><span>  │ ───────  TCP 三次握手(已完成)  ───────────  │</span></span>
<span class="line"><span>  │                                               │</span></span>
<span class="line"><span>  │  ClientHello                                  │</span></span>
<span class="line"><span>  │  ├─ legacy_version: 0x0303(伪装成 1.2)      │</span></span>
<span class="line"><span>  │  ├─ random                                    │</span></span>
<span class="line"><span>  │  ├─ legacy_session_id: &lt;空 / 兼容性填充&gt;      │</span></span>
<span class="line"><span>  │  ├─ cipher_suites: [TLS_AES_128_GCM_SHA256,   │</span></span>
<span class="line"><span>  │  │                  TLS_CHACHA20_POLY1305_SHA256, ...]</span></span>
<span class="line"><span>  │  └─ extensions:                               │  ← RTT 1</span></span>
<span class="line"><span>  │     ├─ supported_versions: [0x0304] (TLS 1.3) │     去</span></span>
<span class="line"><span>  │     ├─ supported_groups:    [x25519, p256]    │</span></span>
<span class="line"><span>  │     ├─ key_share:                             │</span></span>
<span class="line"><span>  │     │  ├─ x25519: &lt;临时公钥 32B&gt;              │</span></span>
<span class="line"><span>  │     │  └─ (可选) p256: &lt;临时公钥 65B&gt;          │</span></span>
<span class="line"><span>  │     ├─ signature_algorithms                   │</span></span>
<span class="line"><span>  │     ├─ server_name (SNI)                      │</span></span>
<span class="line"><span>  │     └─ pre_shared_key (复用时才有)            │</span></span>
<span class="line"><span>  │                                               │</span></span>
<span class="line"><span>  │ ─────────────────────────────────────────→   │</span></span>
<span class="line"><span>  │                                               │</span></span>
<span class="line"><span>  │                                       ServerHello</span></span>
<span class="line"><span>  │                                       ├─ legacy_version: 0x0303</span></span>
<span class="line"><span>  │                                       ├─ random</span></span>
<span class="line"><span>  │                                       ├─ legacy_session_id: 回传</span></span>
<span class="line"><span>  │                                       ├─ cipher_suite: &lt;选定&gt;</span></span>
<span class="line"><span>  │                                       └─ extensions:</span></span>
<span class="line"><span>  │                                          ├─ supported_versions: 0x0304</span></span>
<span class="line"><span>  │                                          └─ key_share:</span></span>
<span class="line"><span>  │                                             └─ x25519: &lt;服务端临时公钥&gt;</span></span>
<span class="line"><span>  │                                       │</span></span>
<span class="line"><span>  │                                       ━━━ 从这里开始加密 ━━━</span></span>
<span class="line"><span>  │                                       │</span></span>
<span class="line"><span>  │                                       {EncryptedExtensions}      ← RTT 1</span></span>
<span class="line"><span>  │                                       {Certificate}                  回</span></span>
<span class="line"><span>  │                                       {CertificateVerify}</span></span>
<span class="line"><span>  │                                       {Finished}</span></span>
<span class="line"><span>  │ ←─────────────────────────────────────────  │</span></span>
<span class="line"><span>  │                                               │</span></span>
<span class="line"><span>  │  (验证证书 / 验证 CertificateVerify)            │</span></span>
<span class="line"><span>  │                                               │</span></span>
<span class="line"><span>  │  {Finished}                                    │</span></span>
<span class="line"><span>  │ ─────────────────────────────────────────→   │</span></span>
<span class="line"><span>  │                                               │</span></span>
<span class="line"><span>  │ ═══════════ 应用数据(对称加密)══════════ │</span></span>
<span class="line"><span>  │                                               │</span></span></code></pre></div><p><strong>对比 1.2</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>TLS 1.2:  Client → Server → Client → Server  (2 RTT)</span></span>
<span class="line"><span>TLS 1.3:  Client → Server → Client            (1 RTT)</span></span></code></pre></div><p><strong>少的那一个 RTT 怎么省的?</strong> 答案:<strong>ClientHello 直接带 KeyShare</strong>——服务端收到的瞬间就能算 master_secret。</p><hr><h2 id="三、keyshare-1-rtt-的核心机关" tabindex="-1">三、KeyShare:1 RTT 的核心机关 <a class="header-anchor" href="#三、keyshare-1-rtt-的核心机关" aria-label="Permalink to &quot;三、KeyShare:1 RTT 的核心机关&quot;">​</a></h2><h3 id="_3-1-关键差异" tabindex="-1">3.1 关键差异 <a class="header-anchor" href="#_3-1-关键差异" aria-label="Permalink to &quot;3.1 关键差异&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>TLS 1.2:</span></span>
<span class="line"><span>  ClientHello              说 &quot;我支持 x25519, p256, p384 这些曲线&quot;</span></span>
<span class="line"><span>  ServerHello              说 &quot;好,我们用 x25519&quot;</span></span>
<span class="line"><span>  ServerKeyExchange        服务端发 x25519 临时公钥</span></span>
<span class="line"><span>  ClientKeyExchange        客户端发 x25519 临时公钥</span></span>
<span class="line"><span>                           (要 4 个消息才完事)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>TLS 1.3:</span></span>
<span class="line"><span>  ClientHello + key_share  &quot;我猜你会选 x25519,公钥提前发了&quot;</span></span>
<span class="line"><span>  ServerHello + key_share  &quot;猜对了,这是我的公钥&quot;</span></span>
<span class="line"><span>                           (2 个消息搞定)</span></span></code></pre></div><h3 id="_3-2-猜错了怎么办-helloretryrequest" tabindex="-1">3.2 猜错了怎么办:HelloRetryRequest <a class="header-anchor" href="#_3-2-猜错了怎么办-helloretryrequest" aria-label="Permalink to &quot;3.2 猜错了怎么办:HelloRetryRequest&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Client:  ClientHello + key_share (x25519)</span></span>
<span class="line"><span>Server:  HelloRetryRequest &quot;我不支持 x25519,你重发,用 p256&quot;</span></span>
<span class="line"><span>Client:  ClientHello + key_share (p256)</span></span>
<span class="line"><span>Server:  ServerHello + key_share (p256)</span></span></code></pre></div><p><strong>变成 2 RTT</strong>——但这是少数情况,主流客户端默认就发 x25519,几乎所有现代服务器都支持。</p><blockquote><p>经验法则:<strong>ClientHello 的 key_share 默认带 x25519 即可</strong>——服务端 99% 接受。同时声明 supported_groups 包含 P-256 / P-384 做 fallback。</p></blockquote><h3 id="_3-3-为什么-1-2-不能这么干" tabindex="-1">3.3 为什么 1.2 不能这么干 <a class="header-anchor" href="#_3-3-为什么-1-2-不能这么干" aria-label="Permalink to &quot;3.3 为什么 1.2 不能这么干&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>TLS 1.2 套件名里就绑死了密钥交换算法:</span></span>
<span class="line"><span>  TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 → 密钥交换是 ECDHE</span></span>
<span class="line"><span>  但 ECDHE 用什么曲线、签名是 RSA 还是 ECDSA,要等 ServerHello 选了套件才知道</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>TLS 1.3 套件名只剩对称 + Hash:</span></span>
<span class="line"><span>  TLS_AES_128_GCM_SHA256</span></span>
<span class="line"><span>  密钥交换、签名都从 extensions 单独协商</span></span>
<span class="line"><span>  → 客户端可以&quot;提前发 KeyShare&quot;</span></span></code></pre></div><p><strong>TLS 1.3 的套件简化是 1 RTT 的前提</strong>。</p><hr><h2 id="四、tls-1-3-套件-就剩-5-个" tabindex="-1">四、TLS 1.3 套件:就剩 5 个 <a class="header-anchor" href="#四、tls-1-3-套件-就剩-5-个" aria-label="Permalink to &quot;四、TLS 1.3 套件:就剩 5 个&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>TLS_AES_128_GCM_SHA256           (强制必选,baseline)</span></span>
<span class="line"><span>TLS_AES_256_GCM_SHA384</span></span>
<span class="line"><span>TLS_CHACHA20_POLY1305_SHA256</span></span>
<span class="line"><span>TLS_AES_128_CCM_SHA256           (CCM 是 GCM 的&quot;轻量&quot;替代,IoT)</span></span>
<span class="line"><span>TLS_AES_128_CCM_8_SHA256         (CCM tag 8 字节,更轻)</span></span></code></pre></div><p><strong>没了</strong>:</p><ul><li>没有 RSA 密钥交换(签名时还能用 RSA,但密钥交换没了)</li><li>没有 CBC 模式</li><li>没有 RC4 / 3DES / DES / IDEA</li><li>没有 MD5 / SHA-1 PRF</li><li>没有 NULL 加密 / 匿名套件</li></ul><p><strong>结果</strong>:<strong>TLS 1.3 的所有套件都自动 PFS、自动 AEAD</strong>——配错的可能性接近 0。</p><hr><h2 id="五、握手消息加密-从-serverhello-之后全密文" tabindex="-1">五、握手消息加密:从 ServerHello 之后全密文 <a class="header-anchor" href="#五、握手消息加密-从-serverhello-之后全密文" aria-label="Permalink to &quot;五、握手消息加密:从 ServerHello 之后全密文&quot;">​</a></h2><h3 id="_5-1-三层密钥派生-hkdf" tabindex="-1">5.1 三层密钥派生(HKDF) <a class="header-anchor" href="#_5-1-三层密钥派生-hkdf" aria-label="Permalink to &quot;5.1 三层密钥派生(HKDF)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. early_secret      = HKDF-Extract(0, PSK 或 0)</span></span>
<span class="line"><span>2. handshake_secret  = HKDF-Extract(early_secret, ECDHE shared)</span></span>
<span class="line"><span>   ↓</span></span>
<span class="line"><span>   client_handshake_traffic_secret</span></span>
<span class="line"><span>   server_handshake_traffic_secret</span></span>
<span class="line"><span>   → 派生 client_hs_key / server_hs_key 用于加密握手后续消息</span></span>
<span class="line"><span>3. master_secret     = HKDF-Extract(handshake_secret, 0)</span></span>
<span class="line"><span>   ↓</span></span>
<span class="line"><span>   client_application_traffic_secret</span></span>
<span class="line"><span>   server_application_traffic_secret</span></span>
<span class="line"><span>   → 派生应用数据密钥</span></span></code></pre></div><p><strong>重点</strong>:<strong>ServerHello 一发完,双方就有了 handshake_secret</strong>——后续握手消息(EncryptedExtensions / Certificate / Finished)全部用握手密钥加密。</p><h3 id="_5-2-加密了哪些握手消息" tabindex="-1">5.2 加密了哪些握手消息 <a class="header-anchor" href="#_5-2-加密了哪些握手消息" aria-label="Permalink to &quot;5.2 加密了哪些握手消息&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>明文(被动监听能看到):</span></span>
<span class="line"><span>  ClientHello</span></span>
<span class="line"><span>  ServerHello</span></span>
<span class="line"><span></span></span>
<span class="line"><span>密文(被动监听看不到):</span></span>
<span class="line"><span>  EncryptedExtensions</span></span>
<span class="line"><span>  Certificate (!)            ← 1.2 是明文,1.3 加密了</span></span>
<span class="line"><span>  CertificateVerify</span></span>
<span class="line"><span>  Finished</span></span>
<span class="line"><span>  NewSessionTicket</span></span></code></pre></div><p><strong>Certificate 加密了</strong>——意味着抓包看不到对方用的什么证书。<strong>SNI 还是明文</strong>(在 ClientHello 里)——这要靠 ECH 解决,见下面。</p><hr><h2 id="六、certificateverify-替代-serverkeyexchange" tabindex="-1">六、CertificateVerify:替代 ServerKeyExchange <a class="header-anchor" href="#六、certificateverify-替代-serverkeyexchange" aria-label="Permalink to &quot;六、CertificateVerify:替代 ServerKeyExchange&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>TLS 1.2 ServerKeyExchange:</span></span>
<span class="line"><span>  signature = sign(server_priv_key,</span></span>
<span class="line"><span>                   client_random || server_random || ECDHE 公钥)</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>TLS 1.3 CertificateVerify:</span></span>
<span class="line"><span>  signature = sign(server_priv_key,</span></span>
<span class="line"><span>                   &quot;TLS 1.3, server CertificateVerify&quot; || transcript_hash)</span></span>
<span class="line"><span>  其中 transcript_hash = Hash(所有之前的握手消息)</span></span></code></pre></div><p><strong>作用一样</strong>:证明&quot;持有证书私钥的人确实在跟你握手,不是中间人转发&quot;。</p><p><strong>改进</strong>:</p><ul><li>签的不再是单一字段,而是完整 transcript hash → 防降级更彻底</li><li>强制使用现代签名算法(RSA-PSS / ECDSA / Ed25519),弃 RSA-PKCS#1 v1.5</li></ul><hr><h2 id="七、0-rtt-early-data-0-个-rtt-复用" tabindex="-1">七、0-RTT(Early Data):0 个 RTT 复用 <a class="header-anchor" href="#七、0-rtt-early-data-0-个-rtt-复用" aria-label="Permalink to &quot;七、0-RTT(Early Data):0 个 RTT 复用&quot;">​</a></h2><h3 id="_7-1-流程" tabindex="-1">7.1 流程 <a class="header-anchor" href="#_7-1-流程" aria-label="Permalink to &quot;7.1 流程&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>首次握手末尾:</span></span>
<span class="line"><span>  服务端发 NewSessionTicket</span></span>
<span class="line"><span>  └── ticket = 加密(PSK + 配置)</span></span>
<span class="line"><span>  客户端存 ticket</span></span>
<span class="line"><span></span></span>
<span class="line"><span>下次客户端来(0-RTT):</span></span>
<span class="line"><span>  ClientHello + extension: pre_shared_key + extension: early_data</span></span>
<span class="line"><span>                + 应用数据(用 PSK 派生的 early_secret 加密)</span></span>
<span class="line"><span>  ─────────────────────→</span></span>
<span class="line"><span>                      ServerHello + EncryptedExtensions + Finished</span></span>
<span class="line"><span>                      + (服务端可选回 early_data 应用数据)</span></span>
<span class="line"><span>  ←─────────────────────</span></span>
<span class="line"><span>  Finished + 后续应用数据</span></span>
<span class="line"><span>  ─────────────────────→</span></span></code></pre></div><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>RTT 0:  Client 在第一个包就带应用数据</span></span>
<span class="line"><span>RTT 0.5:Server 处理完返回响应</span></span>
<span class="line"><span>RTT 1:  Client 发完 Finished</span></span>
<span class="line"><span>        → 服务端可以回应用数据时就回了,延迟 0</span></span></code></pre></div><h3 id="_7-2-性能提升" tabindex="-1">7.2 性能提升 <a class="header-anchor" href="#_7-2-性能提升" aria-label="Permalink to &quot;7.2 性能提升&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>冷连接(全握手):  TCP 1 + TLS 1 = 2 RTT 才能发数据</span></span>
<span class="line"><span>暖连接(0-RTT):  TCP 1 + TLS 0 = 1 RTT 才能发数据(纯 TCP RTT)</span></span>
<span class="line"><span>TFO + 0-RTT:    TCP 0 + TLS 0 = 0 RTT 真的瞬间(实验)</span></span></code></pre></div><p><strong>移动场景 RTT 100ms,0-RTT 节省 200ms 首屏延迟</strong>——业务收益巨大。</p><h3 id="_7-3-重放风险-0-rtt-的代价" tabindex="-1">7.3 重放风险:0-RTT 的代价 <a class="header-anchor" href="#_7-3-重放风险-0-rtt-的代价" aria-label="Permalink to &quot;7.3 重放风险:0-RTT 的代价&quot;">​</a></h3><p><strong>致命问题</strong>:<strong>0-RTT 数据可被重放</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>攻击者抓到客户端的 0-RTT 数据(密文也行)</span></span>
<span class="line"><span>等几秒,把同一个包再发一次</span></span>
<span class="line"><span>服务端无法判断这是&quot;客户端原始请求&quot;还是&quot;攻击者重放&quot;</span></span>
<span class="line"><span>→ 同一个请求被处理两次</span></span></code></pre></div><p><strong>为什么不能防?</strong></p><ul><li>0-RTT 数据在服务端&quot;读到 ClientHello 之前&quot;就到了——服务端还没建立握手 nonce</li><li>不能用 nonce 防重放(还没握完手呢)</li><li>唯一防护是&quot;要求请求幂等 + 服务端记录最近 ticket 防重复使用&quot;——但都不完美</li></ul><h3 id="_7-4-实战规则-0-rtt-只用于幂等" tabindex="-1">7.4 实战规则:0-RTT 只用于幂等 <a class="header-anchor" href="#_7-4-实战规则-0-rtt-只用于幂等" aria-label="Permalink to &quot;7.4 实战规则:0-RTT 只用于幂等&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>✓ 安全:GET /api/products</span></span>
<span class="line"><span>        DNS lookup 之类查询型请求</span></span>
<span class="line"><span>        预读缓存数据</span></span>
<span class="line"><span></span></span>
<span class="line"><span>✗ 危险:POST /transfer  → 转账被重放,损失实金</span></span>
<span class="line"><span>        POST /like      → 点赞被重放,数据脏</span></span>
<span class="line"><span></span></span>
<span class="line"><span>✗ 不要带 cookie / token 的 0-RTT:</span></span>
<span class="line"><span>        token 被重放,服务端处理副作用</span></span></code></pre></div><p><strong>Nginx / Cloudflare 默认对 0-RTT 限定 GET,且只对特定路径开启</strong>。</p><blockquote><p>踩坑提醒:<strong>业务侧任何 POST / PUT / DELETE 都不应该走 0-RTT</strong>——服务端要在应用层显式拒绝(读 <code>early_data</code> 标志)。<strong>Nginx 配置 <code>ssl_early_data on</code> 时,务必同时设置 <code>proxy_set_header Early-Data $ssl_early_data;</code>,后端用这个 header 决定是否处理。</strong></p></blockquote><hr><h2 id="八、psk-模式-复用的统一抽象" tabindex="-1">八、PSK 模式:复用的统一抽象 <a class="header-anchor" href="#八、psk-模式-复用的统一抽象" aria-label="Permalink to &quot;八、PSK 模式:复用的统一抽象&quot;">​</a></h2><p>TLS 1.3 把&quot;复用&quot;和&quot;PSK 预共享密钥&quot;统一成同一个机制——<strong>PSK</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>来源 1:外部预共享密钥(IoT / 私有网络)</span></span>
<span class="line"><span>       客户端和服务端事先交换一个共享密钥</span></span>
<span class="line"><span>       根本不需要证书</span></span>
<span class="line"><span>       </span></span>
<span class="line"><span>来源 2:NewSessionTicket(从上次握手得到)</span></span>
<span class="line"><span>       服务端给的 ticket 解开后就是 PSK</span></span>
<span class="line"><span>       客户端下次带这个 PSK 就能复用</span></span></code></pre></div><p><strong>两种模式</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>psk_ke           纯 PSK 复用,没有 ECDHE</span></span>
<span class="line"><span>                 速度最快,但牺牲 PFS</span></span>
<span class="line"><span></span></span>
<span class="line"><span>psk_dhe_ke       PSK + (EC)DHE 一起</span></span>
<span class="line"><span>                 仍然有 PFS,推荐</span></span>
<span class="line"><span>                 多花一点 ECDHE 计算,但前向安全</span></span></code></pre></div><p><strong>TLS 1.3 默认 psk_dhe_ke</strong>——不为了 1ms 性能丢 PFS。</p><hr><h2 id="九、encrypted-client-hello-ech-加密-sni" tabindex="-1">九、Encrypted Client Hello(ECH):加密 SNI <a class="header-anchor" href="#九、encrypted-client-hello-ech-加密-sni" aria-label="Permalink to &quot;九、Encrypted Client Hello(ECH):加密 SNI&quot;">​</a></h2><h3 id="_9-1-sni-元数据泄露的问题" tabindex="-1">9.1 SNI 元数据泄露的问题 <a class="header-anchor" href="#_9-1-sni-元数据泄露的问题" aria-label="Permalink to &quot;9.1 SNI 元数据泄露的问题&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>普通 TLS 1.3:</span></span>
<span class="line"><span>  ClientHello 含 server_name = &quot;secret.example.com&quot;  ← 明文</span></span>
<span class="line"><span>  → 防火墙 / 运营商 / GFW 据此识别访问的域名</span></span>
<span class="line"><span>  → 域名级封锁可行</span></span></code></pre></div><p><strong>TLS 1.2 / 1.3 都有这个问题</strong>——HTTP/2 / HTTP/3 也都没解决。</p><h3 id="_9-2-ech-怎么做" tabindex="-1">9.2 ECH 怎么做 <a class="header-anchor" href="#_9-2-ech-怎么做" aria-label="Permalink to &quot;9.2 ECH 怎么做&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 服务端发布 HTTPS DNS 记录,包含 ECH 公钥:</span></span>
<span class="line"><span>   example.com. HTTPS 1 . alpn=h2,h3 ipv4hint=... ech=AEX...</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. 客户端查 DNS 拿到 ECH 公钥</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. 客户端构造两层 ClientHello:</span></span>
<span class="line"><span>   外层 ClientHello (明文):</span></span>
<span class="line"><span>     server_name = &quot;cloudflare-ech.com&quot;   ← 假的(共享前端域名)</span></span>
<span class="line"><span>     ech_extension = encrypt(ECH 公钥, 内层 ClientHello)</span></span>
<span class="line"><span>   内层 ClientHello (加密在 ech_extension 里):</span></span>
<span class="line"><span>     server_name = &quot;secret.example.com&quot;   ← 真实</span></span>
<span class="line"><span></span></span>
<span class="line"><span>4. 服务端解密内层,按真实 SNI 处理</span></span></code></pre></div><p><strong>效果</strong>:<strong>网络中间节点只能看到&quot;客户端访问 cloudflare-ech.com&quot;</strong>——隐藏了真实站点。</p><h3 id="_9-3-部署现状-2026" tabindex="-1">9.3 部署现状(2026) <a class="header-anchor" href="#_9-3-部署现状-2026" aria-label="Permalink to &quot;9.3 部署现状(2026)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Cloudflare:        ✓ 全网启用</span></span>
<span class="line"><span>Firefox:           ✓ 默认开</span></span>
<span class="line"><span>Chrome:            ✓ 默认开</span></span>
<span class="line"><span>其他 CDN:          部分开始支持</span></span>
<span class="line"><span>自建服务器:        需要 nginx/openssl 编译时启用,生态还在跟进</span></span></code></pre></div><p><strong>ECH 是反审查的最后一公里</strong>——但需要 DNS-over-HTTPS 配合(否则 DNS 查询本身泄露域名,见 28 篇 DoT/DoH)。</p><hr><h2 id="十、抗中间盒设计-为什么-clienthello-伪装成-1-2" tabindex="-1">十、抗中间盒设计:为什么 ClientHello 伪装成 1.2 <a class="header-anchor" href="#十、抗中间盒设计-为什么-clienthello-伪装成-1-2" aria-label="Permalink to &quot;十、抗中间盒设计:为什么 ClientHello 伪装成 1.2&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>ClientHello.legacy_version    = 0x0303 (TLS 1.2)</span></span>
<span class="line"><span>ClientHello.legacy_session_id = 32 字节(看起来像 1.2 的 session)</span></span>
<span class="line"><span>ServerHello.legacy_version    = 0x0303</span></span>
<span class="line"><span>ServerHello.legacy_session_id = 回填(看起来像 1.2 复用)</span></span>
<span class="line"><span>还有一个空的 ChangeCipherSpec record(纯凑数,1.3 不需要但发了)</span></span></code></pre></div><p><strong>为什么这么伪装?</strong></p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>原因:互联网上有大量&quot;协议僵化&quot;的中间盒</span></span>
<span class="line"><span>      防火墙、DPI、负载均衡看到 TLS 1.3 的新格式直接 reject</span></span>
<span class="line"><span>      这些设备 5-10 年不更新固件</span></span>
<span class="line"><span>      </span></span>
<span class="line"><span>方案:让 1.3 的握手包&quot;长得像 1.2 的复用握手&quot;</span></span>
<span class="line"><span>      中间盒以为是熟悉的 1.2 流量,放行</span></span>
<span class="line"><span>      实际版本号在 supported_versions extension 里</span></span></code></pre></div><p><strong>这是 IETF 历史上最大的妥协之一</strong>——为了部署成功率,把协议设计弄复杂了。</p><blockquote><p>经验法则:<strong>TLS 1.3 在 wireshark 里第一眼经常显示 &quot;TLS 1.2&quot;</strong>——别慌,看 ServerHello 的 supported_versions extension 才是真版本。</p></blockquote><hr><h2 id="十一、用-wireshark-看-tls-1-3-握手" tabindex="-1">十一、用 Wireshark 看 TLS 1.3 握手 <a class="header-anchor" href="#十一、用-wireshark-看-tls-1-3-握手" aria-label="Permalink to &quot;十一、用 Wireshark 看 TLS 1.3 握手&quot;">​</a></h2><h3 id="_11-1-抓包" tabindex="-1">11.1 抓包 <a class="header-anchor" href="#_11-1-抓包" aria-label="Permalink to &quot;11.1 抓包&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 1. 启动抓包</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> tcpdump</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -i</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> any</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -w</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> tls13.pcap</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -s</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 0</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;port 443 and host www.cloudflare.com&#39;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 2. 设置 SSLKEYLOGFILE 触发握手</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">SSLKEYLOGFILE</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">/tmp/keys.log</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> curl</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --tlsv1.3</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> https://www.cloudflare.com</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -o</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /dev/null</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 3. Wireshark 配置解密</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#    Edit → Preferences → Protocols → TLS</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#    (Pre)-Master-Secret log filename: /tmp/keys.log</span></span></code></pre></div><h3 id="_11-2-关键字段对照" tabindex="-1">11.2 关键字段对照 <a class="header-anchor" href="#_11-2-关键字段对照" aria-label="Permalink to &quot;11.2 关键字段对照&quot;">​</a></h3><table tabindex="0"><thead><tr><th>Wireshark 显示</th><th>含义</th><th>加密?</th></tr></thead><tbody><tr><td>Client Hello</td><td>包含 KeyShare、SNI、cipher_suites</td><td>明文</td></tr><tr><td>Server Hello</td><td>包含 KeyShare、选定套件</td><td>明文</td></tr><tr><td>Change Cipher Spec</td><td>兼容老中间盒,无实际作用</td><td>明文</td></tr><tr><td>Application Data (Encrypted Extensions)</td><td>EncryptedExtensions</td><td>密文</td></tr><tr><td>Application Data (Certificate)</td><td>Certificate</td><td>密文</td></tr><tr><td>Application Data (CertificateVerify)</td><td>CertificateVerify</td><td>密文</td></tr><tr><td>Application Data (Finished)</td><td>Finished</td><td>密文</td></tr><tr><td>Application Data</td><td>真实 HTTP 数据</td><td>密文</td></tr></tbody></table><p><strong>注意</strong>:<strong>所有&quot;Application Data&quot;在没解密时是密文</strong>——配上 keylog 文件 Wireshark 才能展开内容。</p><h3 id="_11-3-0-rtt-的标志" tabindex="-1">11.3 0-RTT 的标志 <a class="header-anchor" href="#_11-3-0-rtt-的标志" aria-label="Permalink to &quot;11.3 0-RTT 的标志&quot;">​</a></h3><p>ClientHello 里如果有 <code>early_data</code> extension + <code>pre_shared_key</code> extension,就是 0-RTT 尝试。 随后 ClientHello 之后立刻能看到 <code>Application Data</code>(early data),就是已经在发数据了——还没等 ServerHello。</p><hr><h2 id="十二、tls-1-3-vs-1-2-终极对比表" tabindex="-1">十二、TLS 1.3 vs 1.2 终极对比表 <a class="header-anchor" href="#十二、tls-1-3-vs-1-2-终极对比表" aria-label="Permalink to &quot;十二、TLS 1.3 vs 1.2 终极对比表&quot;">​</a></h2><table tabindex="0"><thead><tr><th>维度</th><th>TLS 1.2</th><th>TLS 1.3</th></tr></thead><tbody><tr><td>全握手</td><td>2 RTT</td><td>1 RTT</td></tr><tr><td>复用握手</td><td>1 RTT</td><td>0 RTT(危险)/ 1 RTT</td></tr><tr><td>套件数量</td><td>30+ 种</td><td>5 种</td></tr><tr><td>静态 RSA 密钥交换</td><td>允许</td><td>删除</td></tr><tr><td>CBC 模式</td><td>允许</td><td>删除</td></tr><tr><td>AEAD</td><td>部分套件</td><td>强制</td></tr><tr><td>压缩</td><td>允许</td><td>删除</td></tr><tr><td>重协商</td><td>允许</td><td>删除(KeyUpdate 替代)</td></tr><tr><td>Certificate 加密</td><td>否</td><td>是</td></tr><tr><td>ServerKeyExchange</td><td>有</td><td>删除(并入 ClientHello KeyShare)</td></tr><tr><td>ChangeCipherSpec</td><td>有功能</td><td>仅伪装</td></tr><tr><td>签名算法</td><td>RSA PKCS#1 v1.5 等</td><td>强制 RSA-PSS / ECDSA / Ed25519</td></tr><tr><td>PFS</td><td>可选(用 ECDHE 才有)</td><td>强制</td></tr><tr><td>0-RTT</td><td>不支持</td><td>支持(谨慎)</td></tr><tr><td>ECH 支持</td><td>不支持</td><td>支持(扩展)</td></tr></tbody></table><hr><h2 id="十三、性能实测-本地-vs-远程" tabindex="-1">十三、性能实测(本地 vs 远程) <a class="header-anchor" href="#十三、性能实测-本地-vs-远程" aria-label="Permalink to &quot;十三、性能实测(本地 vs 远程)&quot;">​</a></h2><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 本地测试 TLS 握手时间</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">curl</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -w</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;@-&quot;</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -o</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /dev/null</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -s</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> https://www.example.com</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> &lt;&lt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">EOF</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">DNS lookup:        %{time_namelookup}</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">TCP connect:       %{time_connect}</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">TLS handshake:     %{time_appconnect}</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">TTFB:              %{time_starttransfer}</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">Total:             %{time_total}</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">EOF</span></span></code></pre></div><p>典型输出(到 Cloudflare,RTT 30ms):</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>TLS 1.2:</span></span>
<span class="line"><span>  TCP connect:    0.030</span></span>
<span class="line"><span>  TLS handshake:  0.090   ← 加了 60ms (2 RTT)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>TLS 1.3:</span></span>
<span class="line"><span>  TCP connect:    0.030</span></span>
<span class="line"><span>  TLS handshake:  0.062   ← 加了 32ms (1 RTT)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>TLS 1.3 + Session Resumption:</span></span>
<span class="line"><span>  TCP connect:    0.030</span></span>
<span class="line"><span>  TLS handshake:  0.030   ← 0 RTT 复用,几乎不增加</span></span></code></pre></div><p><strong>收益</strong>:<strong>1 个 RTT 在跨洋链路是 50-200ms</strong>——量级很大。</p><hr><h2 id="十四、nginx-tls-1-3-配置" tabindex="-1">十四、Nginx TLS 1.3 配置 <a class="header-anchor" href="#十四、nginx-tls-1-3-配置" aria-label="Permalink to &quot;十四、Nginx TLS 1.3 配置&quot;">​</a></h2><div class="language-nginx vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">nginx</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">ssl_protocols </span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">TLSv1.2 TLSv1.3;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">ssl_conf_command </span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">Options PrioritizeChaCha;</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">ssl_ciphers </span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_128_GCM_SHA256;</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">ssl_prefer_server_ciphers </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">on</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 1.3 的曲线</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">ssl_ecdh_curve </span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">X25519:secp256r1:secp384r1;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 0-RTT(Early Data)— 默认关,要开就配</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">ssl_early_data </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">on</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 把 0-RTT 标志传给后端</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">location</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> / </span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">{</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    proxy_pass </span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">http://backend;</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    proxy_set_header </span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">Early-Data $ssl_early_data;  </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 1 = 0-RTT 请求</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 只有看到 Early-Data: 1 且确认是 GET 才安全处理</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 不安全请求要应用层显式 reject</span></span></code></pre></div><p>后端 Go 代码示例:</p><div class="language-go vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">go</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">if</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> r.Header.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">Get</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;Early-Data&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">) </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">==</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;1&quot;</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> &amp;&amp;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> r.Method </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">!=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;GET&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    http.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">Error</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(w, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;0-RTT not allowed for non-idempotent&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">425</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    return</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span></code></pre></div><p><strong>425 Too Early</strong> 是 RFC 8470 专门给 0-RTT 拒绝用的状态码。</p><hr><h2 id="十五、踩坑提醒" tabindex="-1">十五、踩坑提醒 <a class="header-anchor" href="#十五、踩坑提醒" aria-label="Permalink to &quot;十五、踩坑提醒&quot;">​</a></h2><ol><li><strong>0-RTT 默认开</strong> —— 任何 POST 都会被重放。要么关,要么应用层严防</li><li><strong>客户端 KeyShare 只发 P-256</strong> —— 服务端只支持 X25519 时触发 HelloRetryRequest,反而 2 RTT</li><li><strong>抓包看到 &quot;TLS 1.2&quot; 以为没升级</strong> —— 1.3 伪装成 1.2,看 supported_versions</li><li><strong>以为 TLS 1.3 不需要证书</strong> —— 仍然要,只是证书加密发了</li><li><strong>PSK 模式没用 psk_dhe_ke</strong> —— 丢了 PFS,生产场景一律用 psk_dhe_ke</li><li><strong>ECH 没配 DoH/DoT</strong> —— SNI 加密了但 DNS 还泄露域名,等于白做</li><li><strong>Nginx 没编译 TLS 1.3</strong> —— OpenSSL ≥ 1.1.1 才支持,老服务器编不出</li><li><strong>session ticket 跨集群不一致</strong> —— 复用率暴跌,RTT 涨上去</li><li><strong>以为 KeyUpdate 是重协商</strong> —— 1.3 的 KeyUpdate 只换密钥,不换证书 / 套件</li><li><strong>业务接口被列入 0-RTT 白名单时不审视幂等性</strong> —— &quot;GET /search&quot; 看似安全,但服务端写日志可能打两条</li><li><strong>客户端实现错误支持 RSA 密钥交换</strong> —— 老 Java / 嵌入式还在用,跟 1.3 服务器握不上</li><li><strong>CDN 不停&quot;中间人&quot;</strong> —— Cloudflare 终止 TLS 后回源 HTTP,你的 CDN 才是真正的&quot;端&quot;</li></ol><hr><h2 id="十六、tls-1-3-仍未解决的问题" tabindex="-1">十六、TLS 1.3 仍未解决的问题 <a class="header-anchor" href="#十六、tls-1-3-仍未解决的问题" aria-label="Permalink to &quot;十六、TLS 1.3 仍未解决的问题&quot;">​</a></h2><ol><li><strong>完全的元数据隐私</strong> —— ECH 解决 SNI,但 IP 还是泄露目标主机(指纹)</li><li><strong>量子计算威胁</strong> —— 当前 ECDHE / ECDSA 都不抗 Shor 算法,正在开发后量子套件(Kyber + Dilithium)</li><li><strong>TCP 头阻塞</strong> —— TLS 在 TCP 上跑,丢一个包整个流卡住 → QUIC 解决,见 24 篇</li><li><strong>中间盒静默不升级</strong> —— 部分企业网关至今阻断 TLS 1.3</li></ol><blockquote><p>经验法则:<strong>TLS 1.3 是 2026 年的&quot;必备&quot;,但不是终点</strong>——下一代是 QUIC + HTTP/3 把 TLS 1.3 嵌进 UDP,把 TCP 三次握手也省掉。</p></blockquote><hr><h2 id="十七、本章-checklist" tabindex="-1">十七、本章 Checklist <a class="header-anchor" href="#十七、本章-checklist" aria-label="Permalink to &quot;十七、本章 Checklist&quot;">​</a></h2><table tabindex="0"><thead><tr><th>项</th><th>说明</th></tr></thead><tbody><tr><td>✅ 能画 TLS 1.3 1 RTT 全握手时序图</td><td>必修</td></tr><tr><td>✅ 知道 KeyShare 是 1 RTT 的关键</td><td>概念</td></tr><tr><td>✅ 能解释为什么 ClientHello 伪装成 TLS 1.2</td><td>工程理解</td></tr><tr><td>✅ 知道 0-RTT 重放风险及限制条件</td><td>安全</td></tr><tr><td>✅ TLS 1.3 套件就 5 个能背出来</td><td>必修</td></tr><tr><td>✅ 理解 PSK psk_dhe_ke vs psk_ke 区别</td><td>概念</td></tr><tr><td>✅ 知道 ECH 在干什么、需要 DoH 配合</td><td>前沿</td></tr><tr><td>✅ 能用 wireshark + SSLKEYLOGFILE 解密 1.3 流量</td><td>工具</td></tr></tbody></table><hr><h2 id="十八、小结" tabindex="-1">十八、小结 <a class="header-anchor" href="#十八、小结" aria-label="Permalink to &quot;十八、小结&quot;">​</a></h2><p>TLS 1.3 vs 1.2 一图回顾:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>TLS 1.2 (2 RTT):</span></span>
<span class="line"><span>  ClientHello              ──→</span></span>
<span class="line"><span>                          ←──  ServerHello</span></span>
<span class="line"><span>                                Certificate</span></span>
<span class="line"><span>                                ServerKeyExchange</span></span>
<span class="line"><span>                                ServerHelloDone</span></span>
<span class="line"><span>  ClientKeyExchange       ──→</span></span>
<span class="line"><span>  ChangeCipherSpec</span></span>
<span class="line"><span>  Finished</span></span>
<span class="line"><span>                          ←──  ChangeCipherSpec</span></span>
<span class="line"><span>                                Finished</span></span>
<span class="line"><span>  Application Data        ──→</span></span>
<span class="line"><span></span></span>
<span class="line"><span>TLS 1.3 (1 RTT):</span></span>
<span class="line"><span>  ClientHello + KeyShare   ──→</span></span>
<span class="line"><span>                          ←──  ServerHello + KeyShare</span></span>
<span class="line"><span>                                {EncryptedExtensions}</span></span>
<span class="line"><span>                                {Certificate}</span></span>
<span class="line"><span>                                {CertificateVerify}</span></span>
<span class="line"><span>                                {Finished}</span></span>
<span class="line"><span>  {Finished}              ──→</span></span>
<span class="line"><span>  Application Data         ──→</span></span></code></pre></div><p><strong>省 1 RTT 的关键三招</strong>:</p><ol><li><strong>KeyShare 提前发</strong>(ClientHello 直接带 ECDHE 临时公钥)</li><li><strong>套件简化</strong>(只剩对称 + Hash,不绑死密钥交换)</li><li><strong>服务端 Finished 跟在 ServerHello 同一 flight</strong></li></ol><p>记住三件事:</p><ol><li><strong>TLS 1.3 是减法的胜利</strong>——删 50% 功能换来安全和性能</li><li><strong>0-RTT 不是免费午餐</strong>——重放风险逼业务必须区分幂等</li><li><strong>ClientHello / ServerHello 仍是明文</strong>——SNI 元数据泄露问题靠 ECH 解决</li></ol><p>下一篇:<code>20-mTLS-双向认证.md</code>——讲单向 TLS(只验服务端)和<strong>双向 TLS</strong>(双方都出证书)的区别,<strong>零信任网络架构</strong>的核心,<strong>SPIFFE / SPIRE 身份框架</strong>怎么给微服务自动签证书,<strong>Istio / Linkerd 服务网格</strong>的 mTLS 是怎么做&quot;零配置自动加密&quot;的,以及怎么用 <code>curl --cert --key</code> 和 <code>openssl s_client -cert -key</code> 调试 mTLS——你会发现 mTLS 的难点不在 TLS 本身,而在<strong>证书生命周期管理</strong>。</p>`,132)])])}const g=a(t,[["render",i]]);export{k as __pageData,g as default};
