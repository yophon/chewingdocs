import{_ as n,H as a,f as p,i as e}from"./chunks/framework.BHvCMIhP.js";const g=JSON.parse('{"title":"数字签名与证书","description":"","frontmatter":{},"headers":[],"relativePath":"securityLearning/07-数字签名与证书.md","filePath":"securityLearning/07-数字签名与证书.md","lastUpdated":1778496697000}'),t={name:"securityLearning/07-数字签名与证书.md"};function l(i,s,o,c,r,d){return a(),p("div",null,[...s[0]||(s[0]=[e(`<h1 id="数字签名与证书" tabindex="-1">数字签名与证书 <a class="header-anchor" href="#数字签名与证书" aria-label="Permalink to &quot;数字签名与证书&quot;">​</a></h1><p>学密码学的人,常把「加密」和「签名」搅成一团——「不都是非对称密钥那一套吗?」<strong>这是新手最容易出的概念错位</strong>。加密保护的是<strong>机密性</strong>——别人看不到内容;签名保护的是<strong>完整性 + 不可否认</strong>——别人改不动、签名人赖不掉。<strong>这两件事用的数学很像,但工程目标完全相反</strong>:加密是「我把东西藏起来,只有你能打开」,签名是「我把东西摆在台上,任何人都能验证是我盖的章」。这一篇不重复 networkLearning/21 讲过的「怎么自建 CA」,只讲清楚签名机制本身、X.509 证书为什么长成那副复杂样、证书链是怎么一节一节连起来的、以及 DigiNotar 这种「CA 被攻破」的事故是怎么改变整个 PKI 生态的。</p><blockquote><p>一句话先记住:<strong>签名 = 哈希 + 私钥;证书 = 公钥 + 身份 + CA 的签名;PKI = 一棵被全世界默认信任的&quot;签名树&quot;</strong>。所有 HTTPS、代码签名、容器签名、JWT 验证最终都落到这三句话上。<strong>而 CT(证书透明度)是为了解决&quot;这棵树有腐烂枝条该怎么办&quot;——把所有签发的证书都摊到阳光下,让你自己能发现谁错签了你的域名</strong>。</p></blockquote><hr><h2 id="一、签名-vs-加密-同一套数学-完全相反的工程目标" tabindex="-1">一、签名 vs 加密:同一套数学,完全相反的工程目标 <a class="header-anchor" href="#一、签名-vs-加密-同一套数学-完全相反的工程目标" aria-label="Permalink to &quot;一、签名 vs 加密:同一套数学,完全相反的工程目标&quot;">​</a></h2><p>很多人看 RSA 的时候有过这个困惑:「公钥加密 / 私钥解密」和「私钥签名 / 公钥验证」长得几乎一样,<strong>到底有啥区别</strong>?</p><h3 id="_1-1-目标完全不同" tabindex="-1">1.1 目标完全不同 <a class="header-anchor" href="#_1-1-目标完全不同" aria-label="Permalink to &quot;1.1 目标完全不同&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>加密(Encryption)</span></span>
<span class="line"><span>   目标:机密性(confidentiality)</span></span>
<span class="line"><span>   &quot;只有持有私钥的人能看到内容&quot;</span></span>
<span class="line"><span>   公钥广播 → 任何人可以加密 → 只有你能解密</span></span>
<span class="line"><span></span></span>
<span class="line"><span>签名(Signature)</span></span>
<span class="line"><span>   目标:完整性 + 认证 + 不可否认</span></span>
<span class="line"><span>   &quot;任何人都能验证这东西确实是你发的,且没被改过&quot;</span></span>
<span class="line"><span>   私钥独占 → 只有你能签 → 任何人可以验证</span></span></code></pre></div><table tabindex="0"><thead><tr><th>维度</th><th>加密</th><th>签名</th></tr></thead><tbody><tr><td>谁用公钥</td><td>发送方(对外加密)</td><td>验证方(验签)</td></tr><tr><td>谁用私钥</td><td>接收方(解密)</td><td>签名方(签名)</td></tr><tr><td>解决什么</td><td>机密性</td><td>完整性 + 不可否认</td></tr><tr><td>传播方向</td><td>多人 → 一人</td><td>一人 → 多人</td></tr></tbody></table><h3 id="_1-2-为什么不能直接「用私钥加密-签名」" tabindex="-1">1.2 为什么不能直接「用私钥加密 = 签名」 <a class="header-anchor" href="#_1-2-为什么不能直接「用私钥加密-签名」" aria-label="Permalink to &quot;1.2 为什么不能直接「用私钥加密 = 签名」&quot;">​</a></h3><p>教科书喜欢这么讲:<strong>「签名就是用私钥加密哈希」</strong>。这种说法在 1990 年代的 RSA 文章里成立,<strong>今天看就是错的</strong>——它会引导你写出不安全的代码。</p><p><strong>真实的签名长这样</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>签名 = Sign(私钥, Hash(消息))</span></span>
<span class="line"><span>       不是简单的 &quot;RSA加密(Hash(消息))&quot;</span></span>
<span class="line"><span>       而是带专门的填充、随机数、椭圆曲线运算</span></span>
<span class="line"><span>       具体方案:RSA-PSS / ECDSA / EdDSA</span></span></code></pre></div><p>「用私钥加密」这套话术埋了三个雷:</p><ul><li>RSA 原始模运算不带填充,直接拿来签名能被伪造(选择消息攻击)</li><li>ECC / EdDSA 根本就没有「加密 / 解密」操作,只有「签 / 验」</li><li>不可否认性要靠协议保证(签了什么、何时签、用什么算法),不是数学层面自动给你的</li></ul><blockquote><p>所以从这一篇开始,<strong>「签名」和「加密」就是两个完全独立的原语</strong>,别再用「私钥加密」这套说法了。</p></blockquote><h3 id="_1-3-签名要解决的三件事" tabindex="-1">1.3 签名要解决的三件事 <a class="header-anchor" href="#_1-3-签名要解决的三件事" aria-label="Permalink to &quot;1.3 签名要解决的三件事&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 完整性(Integrity)</span></span>
<span class="line"><span>   你下载了 ubuntu.iso,怎么确定没被中间人改过?</span></span>
<span class="line"><span>   → 校验签名,签名变了就拒绝</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. 认证(Authentication)</span></span>
<span class="line"><span>   这个补丁包,真的是 Microsoft 发的吗?</span></span>
<span class="line"><span>   → 签名是 Microsoft 私钥签的,公钥早就内置在系统里</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. 不可否认(Non-repudiation)</span></span>
<span class="line"><span>   你签了合同,后来反悔说&quot;那不是我签的&quot;</span></span>
<span class="line"><span>   → 只有你的私钥能产生这个签名,你赖不掉</span></span></code></pre></div><p><strong>第三点是签名比 MAC(消息认证码)多出来的关键能力</strong>。HMAC 也能做完整性 + 认证,但通信双方共享密钥——出了事<strong>双方都有嫌疑</strong>,没法仲裁。签名因为私钥唯一,<strong>法律上可以被采信</strong>(中国《电子签名法》、欧盟 eIDAS 都承认)。</p><hr><h2 id="二、rsa-pss-ecdsa-eddsa-今天该选哪个" tabindex="-1">二、RSA-PSS / ECDSA / EdDSA:今天该选哪个 <a class="header-anchor" href="#二、rsa-pss-ecdsa-eddsa-今天该选哪个" aria-label="Permalink to &quot;二、RSA-PSS / ECDSA / EdDSA:今天该选哪个&quot;">​</a></h2><p>签名算法过去 30 年的演化,基本是三代:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>第一代:RSA (PKCS#1 v1.5)</span></span>
<span class="line"><span>   1991 年,工程上能用,但填充方案有缺陷,</span></span>
<span class="line"><span>   能被多种攻击(Bleichenbacher / 故障注入)绕过</span></span>
<span class="line"><span></span></span>
<span class="line"><span>第二代:RSA-PSS / ECDSA</span></span>
<span class="line"><span>   2000 年代,RSA 换成概率填充(PSS);</span></span>
<span class="line"><span>   椭圆曲线签名(ECDSA)出来,密钥短得多</span></span>
<span class="line"><span></span></span>
<span class="line"><span>第三代:EdDSA(Ed25519 / Ed448)</span></span>
<span class="line"><span>   2011 年,DJB 设计,确定性签名 + 防侧信道 + 高性能</span></span>
<span class="line"><span>   今天的&quot;默认选择&quot;</span></span></code></pre></div><h3 id="_2-1-三者对比" tabindex="-1">2.1 三者对比 <a class="header-anchor" href="#_2-1-三者对比" aria-label="Permalink to &quot;2.1 三者对比&quot;">​</a></h3><table tabindex="0"><thead><tr><th>算法</th><th>密钥长度</th><th>签名长度</th><th>安全等级</th><th>性能</th><th>工程坑</th></tr></thead><tbody><tr><td>RSA-2048</td><td>2048 bit</td><td>256 byte</td><td>112 bit</td><td>签慢、验快</td><td>必须用 PSS 不能用 v1.5</td></tr><tr><td>ECDSA P-256</td><td>256 bit</td><td>64 byte</td><td>128 bit</td><td>中等</td><td><strong>随机数复用秒级别泄密</strong></td></tr><tr><td>Ed25519</td><td>256 bit</td><td>64 byte</td><td>128 bit</td><td>最快</td><td><strong>确定性签名,没有随机数坑</strong></td></tr></tbody></table><h3 id="_2-2-ecdsa-的「随机数地狱」" tabindex="-1">2.2 ECDSA 的「随机数地狱」 <a class="header-anchor" href="#_2-2-ecdsa-的「随机数地狱」" aria-label="Permalink to &quot;2.2 ECDSA 的「随机数地狱」&quot;">​</a></h3><p>ECDSA 签名里有个随机数 <code>k</code>,<strong>两次签名复用同一个 <code>k</code>,私钥可以纯算术地被反推出来</strong>。两个真实事故:<strong>2010 年索尼 PS3 把 <code>k</code> 硬编码成常数</strong>,社区从两个签名相减直接解出私钥,任意代码可以签到 PS3 上跑;<strong>2013 年某些 Android 比特币钱包</strong>因为 <code>SecureRandom</code> 有 bug,不同钱包签出相同 <code>k</code>,攻击者从链上扫到这种签名直接偷光私钥。<strong>ECDSA 要求每次签名的随机数都是密码学安全、唯一、保密的</strong>——任何一条破了,私钥就泄了。</p><h3 id="_2-3-eddsa-为什么是默认推荐" tabindex="-1">2.3 EdDSA 为什么是默认推荐 <a class="header-anchor" href="#_2-3-eddsa-为什么是默认推荐" aria-label="Permalink to &quot;2.3 EdDSA 为什么是默认推荐&quot;">​</a></h3><p>EdDSA 把 <code>k</code> 换成了 <code>HMAC(私钥, 消息)</code>——<strong>确定性签名</strong>:同一个私钥 + 同一个消息永远生成同一个签名,<strong>不依赖运行时 RNG,从源头消灭了「随机数泄密」</strong>。加上 Ed25519 签名快、长度只有 64 字节,<strong>新系统首选</strong>——SSH、Tailscale、age、Sigstore、Tor 都已默认或主推它。</p><blockquote><p>例外:<strong>老系统不支持。</strong> TLS 1.3 直到 2020 年才广泛支持 Ed25519 证书,某些云厂商的 CA / HSM 至今只签 RSA / ECDSA。新系统选 Ed25519,兼容老系统选 ECDSA P-256,合规场景被迫用 RSA-PSS。</p></blockquote><h3 id="_2-4-一个选择速查表" tabindex="-1">2.4 一个选择速查表 <a class="header-anchor" href="#_2-4-一个选择速查表" aria-label="Permalink to &quot;2.4 一个选择速查表&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>要签 git commit / SSH key?</span></span>
<span class="line"><span>   → Ed25519,没别的选</span></span>
<span class="line"><span></span></span>
<span class="line"><span>要发 HTTPS 证书?</span></span>
<span class="line"><span>   → ECDSA P-256(性能好,所有现代浏览器支持)</span></span>
<span class="line"><span>   → 或 RSA-2048(兼容性最好,但慢)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>要签 JWT?</span></span>
<span class="line"><span>   → EdDSA(alg=EdDSA),次选 ES256(ECDSA P-256)</span></span>
<span class="line"><span>   → 千万别用 HS256(那是 HMAC,密钥泄露后果不一样)</span></span>
<span class="line"><span>   → 千万别忘了拒绝 alg=none</span></span>
<span class="line"><span></span></span>
<span class="line"><span>要签代码包(npm / PyPI / 容器)?</span></span>
<span class="line"><span>   → Sigstore 默认 ECDSA P-256</span></span>
<span class="line"><span>   → Authenticode 还是 RSA(微软生态,改不动)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>合规场景(FIPS 140-2 / 国密)?</span></span>
<span class="line"><span>   → 被迫用 RSA-PSS 或 SM2,选不了 Ed25519</span></span></code></pre></div><hr><h2 id="三、x-509-证书-为什么这么复杂" tabindex="-1">三、X.509 证书:为什么这么复杂 <a class="header-anchor" href="#三、x-509-证书-为什么这么复杂" aria-label="Permalink to &quot;三、X.509 证书:为什么这么复杂&quot;">​</a></h2><p>「证书」听起来很高级,其实<strong>就是一段被 CA 签名的、结构化的元数据</strong>,核心内容就两个:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 这把公钥是谁的(身份)</span></span>
<span class="line"><span>2. 这把公钥能干什么、用到什么时候(用途 + 有效期)</span></span>
<span class="line"><span>3. CA 的签名(证明前两条的可信度)</span></span></code></pre></div><p><strong>但 X.509 的实际结构里塞了 30+ 个字段</strong>——为什么?</p><h3 id="_3-1-x-509-v3-的字段全景" tabindex="-1">3.1 X.509 v3 的字段全景 <a class="header-anchor" href="#_3-1-x-509-v3-的字段全景" aria-label="Permalink to &quot;3.1 X.509 v3 的字段全景&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Certificate (v3)</span></span>
<span class="line"><span>├── Version                      v1 / v2 / v3</span></span>
<span class="line"><span>├── Serial Number                这个 CA 签的第几张</span></span>
<span class="line"><span>├── Signature Algorithm          签名用什么算法(冗余,防 downgrade)</span></span>
<span class="line"><span>├── Issuer                       签发方(CA)的 DN</span></span>
<span class="line"><span>├── Validity</span></span>
<span class="line"><span>│   ├── Not Before               生效时间</span></span>
<span class="line"><span>│   └── Not After                过期时间</span></span>
<span class="line"><span>├── Subject                      持有人 DN(域名往这放)</span></span>
<span class="line"><span>├── Subject Public Key Info      持有人公钥 + 算法标识</span></span>
<span class="line"><span>├── Extensions                   v3 扩展(关键!)</span></span>
<span class="line"><span>│   ├── Subject Alt Name (SAN)   多域名(*.example.com、IP)</span></span>
<span class="line"><span>│   ├── Key Usage                这把密钥能签 / 加密 / 协商</span></span>
<span class="line"><span>│   ├── Extended Key Usage       服务器认证 / 客户端认证 / 代码签名</span></span>
<span class="line"><span>│   ├── Basic Constraints        是不是 CA(能不能再签别人)</span></span>
<span class="line"><span>│   ├── Authority Key Identifier 上级 CA 用哪把密钥</span></span>
<span class="line"><span>│   ├── Subject Key Identifier   自己的公钥指纹</span></span>
<span class="line"><span>│   ├── CRL Distribution Points  撤销列表去哪查</span></span>
<span class="line"><span>│   ├── Authority Info Access    OCSP 服务器地址</span></span>
<span class="line"><span>│   ├── SCT List                 证书透明度证据(嵌入式)</span></span>
<span class="line"><span>│   └── Certificate Policies     合规策略 OID</span></span>
<span class="line"><span>└── Signature                    CA 用私钥对前面所有字段的签名</span></span></code></pre></div><h3 id="_3-2-为什么这么复杂" tabindex="-1">3.2 为什么这么复杂 <a class="header-anchor" href="#_3-2-为什么这么复杂" aria-label="Permalink to &quot;3.2 为什么这么复杂&quot;">​</a></h3><p><strong>因为 X.509 不是&quot;一次设计成功&quot;的协议</strong>——1988 年最早是给 X.500 目录服务用的,根本不是为互联网设计的。后来 SSL / TLS 想要个证书格式,就硬把 X.509 拉过来,<strong>所有不合时宜的地方都靠 v3 扩展打补丁</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1988  X.509 v1     诞生于 OSI 目录服务(基本没人用)</span></span>
<span class="line"><span>1993  X.509 v2     加 unique identifier</span></span>
<span class="line"><span>1996  X.509 v3     加 extensions —— 这是工程上唯一能用的版本</span></span>
<span class="line"><span>2008  RFC 5280     现代规则全在这</span></span></code></pre></div><p><strong>几条「这字段为什么这么别扭」的工程史</strong>:</p><ul><li><code>Common Name</code> 字段:最早把域名放这,后来发现一张证书一个 CN 没法处理多域名(www.example.com vs example.com),才补了 <code>Subject Alt Name</code>(SAN)扩展。<strong>Chrome 58+(2017)直接停止读 CN,只看 SAN</strong>——你今天签证书必须填 SAN,否则浏览器报错。</li><li><code>Basic Constraints: CA=TRUE</code>:如果忘了关这个,叶子证书也能签别的证书——<strong>Comodo 在 2008 年签过一张 <code>CN=Mozilla</code> 的证书,导致中间人攻击可能</strong>。后来浏览器强制要求叶子证书必须 <code>CA=FALSE</code>。</li><li><code>Extended Key Usage</code>:一张证书能不能同时给 HTTPS 用 + 给代码签名用?能,但浏览器 / OS 会严格匹配 EKU。<strong>写错一个 OID 就报错</strong>,例如 <code>1.3.6.1.5.5.7.3.1</code>(服务器认证)和 <code>1.3.6.1.5.5.7.3.3</code>(代码签名)是两回事。</li></ul><h3 id="_3-3-pem-和-der-同一个证书的两种编码" tabindex="-1">3.3 PEM 和 DER:同一个证书的两种编码 <a class="header-anchor" href="#_3-3-pem-和-der-同一个证书的两种编码" aria-label="Permalink to &quot;3.3 PEM 和 DER:同一个证书的两种编码&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>DER:   二进制,紧凑</span></span>
<span class="line"><span>PEM:   Base64 文本 + ----- BEGIN CERTIFICATE ----- 头尾</span></span>
<span class="line"><span>       就是 DER 的文本化包装,方便邮件 / 配置文件传</span></span></code></pre></div><p><code>openssl x509 -in cert.pem -text -noout</code> 可以人类可读地展开 PEM——<strong>调试 TLS 问题时,99% 时间花在这一句上</strong>。</p><hr><h2 id="四、证书链验证-信任锚-中间证书-撤销" tabindex="-1">四、证书链验证:信任锚 + 中间证书 + 撤销 <a class="header-anchor" href="#四、证书链验证-信任锚-中间证书-撤销" aria-label="Permalink to &quot;四、证书链验证:信任锚 + 中间证书 + 撤销&quot;">​</a></h2><p>浏览器看到你的证书,<strong>怎么决定信不信</strong>?这是 PKI 最核心的算法。</p><h3 id="_4-1-一张图说清楚" tabindex="-1">4.1 一张图说清楚 <a class="header-anchor" href="#_4-1-一张图说清楚" aria-label="Permalink to &quot;4.1 一张图说清楚&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                  [Root CA]   &lt;-- 浏览器 / OS 自带 (信任锚, 自签名)</span></span>
<span class="line"><span>                  公钥 R, 私钥 r</span></span>
<span class="line"><span>                       │</span></span>
<span class="line"><span>                       │ 用 r 签</span></span>
<span class="line"><span>                       ▼</span></span>
<span class="line"><span>                  [Intermediate CA]   &lt;-- 服务端在握手时发给你</span></span>
<span class="line"><span>                  公钥 I, 私钥 i</span></span>
<span class="line"><span>                       │</span></span>
<span class="line"><span>                       │ 用 i 签</span></span>
<span class="line"><span>                       ▼</span></span>
<span class="line"><span>                  [Leaf Cert]   &lt;-- 你的网站证书</span></span>
<span class="line"><span>                  公钥 L</span></span>
<span class="line"><span>                  Subject: example.com</span></span>
<span class="line"><span>                       │</span></span>
<span class="line"><span>                       │ 服务端用 L 对应的私钥 l</span></span>
<span class="line"><span>                       │ 证明自己持有 l(TLS 握手)</span></span>
<span class="line"><span>                       ▼</span></span>
<span class="line"><span>                  浏览器验证完成 → 绿锁 ✓</span></span>
<span class="line"><span></span></span>
<span class="line"><span></span></span>
<span class="line"><span>验证流程(自下而上):</span></span>
<span class="line"><span>   1. Leaf.Signature 用 Intermediate.PublicKey 验证 → 通过</span></span>
<span class="line"><span>   2. Intermediate.Signature 用 Root.PublicKey 验证 → 通过</span></span>
<span class="line"><span>   3. Root 在浏览器信任库里 → 信任锚命中 → 整链可信</span></span>
<span class="line"><span>   4. 同时检查:</span></span>
<span class="line"><span>      ├─ 时间在 NotBefore / NotAfter 之间</span></span>
<span class="line"><span>      ├─ Subject (或 SAN) 匹配访问的域名</span></span>
<span class="line"><span>      ├─ EKU 包含 serverAuth</span></span>
<span class="line"><span>      ├─ Basic Constraints 在中间节点为 CA=TRUE</span></span>
<span class="line"><span>      ├─ 路径长度限制 (pathLenConstraint) 没越界</span></span>
<span class="line"><span>      └─ 证书没被撤销(CRL / OCSP)</span></span>
<span class="line"><span>   任何一步失败 → 浏览器报 NET::ERR_CERT_xxx</span></span></code></pre></div><h3 id="_4-2-为什么要有中间证书" tabindex="-1">4.2 为什么要有中间证书 <a class="header-anchor" href="#_4-2-为什么要有中间证书" aria-label="Permalink to &quot;4.2 为什么要有中间证书&quot;">​</a></h3><p><strong>根证书极其值钱</strong>——一旦私钥泄漏,全世界所有用它签的证书都得作废,所有浏览器要紧急推送更新拔掉它。为了把根证书私钥保护好:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Root CA 私钥:  锁在离线 HSM 里,放在物理隔离的金库</span></span>
<span class="line"><span>                 每年只开机一两次,签下一级 CA</span></span>
<span class="line"><span>                 平时根本不在线</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Intermediate:  online,真正签发用户证书</span></span>
<span class="line"><span>                 出事了 → 撤销这张中间证书 → 不动 Root</span></span>
<span class="line"><span>                 损失局限在「这张中间签过的所有叶子」</span></span></code></pre></div><p><strong>这种结构是事故隔离设计</strong>——和 OS 的「特权环」一样,把高权限资源藏到最底层。</p><h3 id="_4-3-服务端容易踩的坑-中间证书没发全" tabindex="-1">4.3 服务端容易踩的坑:中间证书没发全 <a class="header-anchor" href="#_4-3-服务端容易踩的坑-中间证书没发全" aria-label="Permalink to &quot;4.3 服务端容易踩的坑:中间证书没发全&quot;">​</a></h3><p>TLS 握手时,<strong>服务端必须把整条链(除根)一起发给客户端</strong>——浏览器只内置 Root,中间证书要服务端提供。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错误配置:</span></span>
<span class="line"><span>   服务端只发 leaf.pem</span></span>
<span class="line"><span>   → 客户端缺中间证书 → 验证断链 → 报错</span></span>
<span class="line"><span>   → 浏览器还能凑活(AIA Fetch),但 curl / java / mTLS 一律失败</span></span>
<span class="line"><span></span></span>
<span class="line"><span>正确配置:</span></span>
<span class="line"><span>   fullchain.pem = leaf + intermediate(s)</span></span>
<span class="line"><span>   按&quot;从叶到根&quot;的顺序拼起来发</span></span></code></pre></div><p><strong>这是 Let&#39;s Encrypt 上线初期最高频的客诉</strong>——<code>certbot</code> 后来直接默认装 <code>fullchain.pem</code>,问题才少了一半。</p><hr><h2 id="五、证书撤销-crl-ocsp-ocsp-stapling" tabindex="-1">五、证书撤销:CRL / OCSP / OCSP Stapling <a class="header-anchor" href="#五、证书撤销-crl-ocsp-ocsp-stapling" aria-label="Permalink to &quot;五、证书撤销:CRL / OCSP / OCSP Stapling&quot;">​</a></h2><p>证书签出去了,<strong>有效期内出事了(私钥泄漏 / 公司倒闭 / 域名转手)怎么办</strong>?需要一个「这张证书提前作废了」的机制。</p><h3 id="_5-1-三种方案的演化" tabindex="-1">5.1 三种方案的演化 <a class="header-anchor" href="#_5-1-三种方案的演化" aria-label="Permalink to &quot;5.1 三种方案的演化&quot;">​</a></h3><p><strong>CRL(Certificate Revocation List)</strong>——1990 年代方案。CA 定期发布一个「被撤销证书的列表」,客户端定期下载。问题:列表越来越长(几 MB),更新不及时(几天一次),今天浏览器基本不直接用了。</p><p><strong>OCSP(Online Certificate Status Protocol)</strong>——2000 年代。客户端在握手时实时去 CA 查「这张证书还有效吗」,返回 good / revoked / unknown。三个致命问题:① 每次握手多一次 HTTP 请求(慢);② CA 知道你访问了哪些网站(隐私差);③ OCSP 服务器挂了浏览器选择 soft-fail(查不到就放过 = 撤销机制等于没有)。</p><p><strong>OCSP Stapling</strong>——现代方案。服务端定期去 CA 拉一份「我这张证书还有效」的签名声明,握手时一起发给客户端,客户端验证签名,不用自己去查 CA。解决了 OCSP 的三个问题。配合 <code>Must-Staple</code> 扩展:证书要求必须 stapled,否则拒绝。</p><h3 id="_5-2-工程上的现实" tabindex="-1">5.2 工程上的现实 <a class="header-anchor" href="#_5-2-工程上的现实" aria-label="Permalink to &quot;5.2 工程上的现实&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Chrome 用 CRLSets:Google 主动维护一份&quot;高优先级撤销&quot;列表,</span></span>
<span class="line"><span>                  推送给浏览器(类似 OS 的安全补丁)</span></span>
<span class="line"><span>Firefox 用 OneCRL:类似机制,只覆盖中间证书</span></span>
<span class="line"><span>                  叶子证书用 OCSP Stapling</span></span>
<span class="line"><span>苹果 Safari:Valid + OCSP Stapling</span></span></code></pre></div><p><strong>真相是:撤销机制在 Web 上一直是半残的</strong>——除了主动作恶的 CA / 中间证书会被浏览器写入硬编码黑名单,普通叶子证书撤销了能不能&quot;立刻生效&quot;是没保证的。这也是为什么 Let&#39;s Encrypt 把证书有效期砍到 90 天(后来又规划砍到 7 天)——<strong>有效期短 = 出事影响窗口小</strong>,撤销不撤销就没那么关键了。</p><hr><h2 id="六、证书透明度-ct-把所有签发摊到阳光下" tabindex="-1">六、证书透明度(CT):把所有签发摊到阳光下 <a class="header-anchor" href="#六、证书透明度-ct-把所有签发摊到阳光下" aria-label="Permalink to &quot;六、证书透明度(CT):把所有签发摊到阳光下&quot;">​</a></h2><p>证书撤销解决的是「事后追责」,<strong>证书透明度解决的是「事前发现」</strong>。</p><h3 id="_6-1-要解决的问题" tabindex="-1">6.1 要解决的问题 <a class="header-anchor" href="#_6-1-要解决的问题" aria-label="Permalink to &quot;6.1 要解决的问题&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>问题:你怎么知道有没有 CA 给攻击者签了一张 google.com 的证书?</span></span>
<span class="line"><span></span></span>
<span class="line"><span>传统答案:</span></span>
<span class="line"><span>   &quot;你不会知道,直到攻击发生在你身上,你才能从浏览器警告里看到&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>CT 的答案:</span></span>
<span class="line"><span>   &quot;所有 CA 签的证书,都必须公开提交到 append-only 日志,</span></span>
<span class="line"><span>    你可以主动监控自己域名有没有被错签&quot;</span></span></code></pre></div><h3 id="_6-2-ct-的核心机制" tabindex="-1">6.2 CT 的核心机制 <a class="header-anchor" href="#_6-2-ct-的核心机制" aria-label="Permalink to &quot;6.2 CT 的核心机制&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. CA 签完证书 → 必须提交到至少 2 个 CT Log</span></span>
<span class="line"><span>2. Log 返回 SCT (Signed Certificate Timestamp) —— &quot;我已记录&quot;</span></span>
<span class="line"><span>3. CA 把 SCT 嵌入到证书的扩展字段里</span></span>
<span class="line"><span>4. 浏览器握手时:</span></span>
<span class="line"><span>   - 看到 SCT → 验证 SCT 签名 → 确认证书已公开</span></span>
<span class="line"><span>   - 没有 SCT → Chrome 直接拒绝(2018 年起)</span></span>
<span class="line"><span>5. 任何人都能爬 CT Log,看到全世界今天签了哪些证书</span></span></code></pre></div><h3 id="_6-3-谁在用-ct" tabindex="-1">6.3 谁在用 CT <a class="header-anchor" href="#_6-3-谁在用-ct" aria-label="Permalink to &quot;6.3 谁在用 CT&quot;">​</a></h3><ul><li><strong>crt.sh</strong>(Sectigo 运营):公开网站,可以搜索任何域名签过的所有证书</li><li><strong>Cloudflare Merkle Town / Google Argon</strong>:CT 日志运营方</li><li><strong>Facebook / Cloudflare 都做了监控服务</strong>:每签一张涉及你域名的证书,给你发邮件</li></ul><blockquote><p>如果你管一个域名,<strong>今天就该去 crt.sh 搜一下自己的域名</strong>——看看历史上签过几张证书,有没有你不认识的 CA / 不认识的子域。这是 CT 给防御方的最大红利。</p></blockquote><hr><h2 id="七、代码签名-不仅仅是-web-证书" tabindex="-1">七、代码签名:不仅仅是 Web 证书 <a class="header-anchor" href="#七、代码签名-不仅仅是-web-证书" aria-label="Permalink to &quot;七、代码签名:不仅仅是 Web 证书&quot;">​</a></h2><p>证书生态远不止 HTTPS,<strong>代码签名</strong>是另一个超级场景。</p><h3 id="_7-1-几种代码签名生态" tabindex="-1">7.1 几种代码签名生态 <a class="header-anchor" href="#_7-1-几种代码签名生态" aria-label="Permalink to &quot;7.1 几种代码签名生态&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Authenticode(Windows)</span></span>
<span class="line"><span>   1996 年微软搞的,签 .exe / .msi / 驱动</span></span>
<span class="line"><span>   证书要从受微软信任的 CA 买(EV 证书几千美元 / 年)</span></span>
<span class="line"><span>   驱动签名 + Secure Boot 是 Windows 内核安全的基石</span></span>
<span class="line"><span></span></span>
<span class="line"><span>macOS Codesign + Notarization</span></span>
<span class="line"><span>   开发者从 Apple 拿 Developer ID 证书</span></span>
<span class="line"><span>   编译完用 codesign 签名</span></span>
<span class="line"><span>   然后上传给 Apple &quot;公证&quot;(自动扫描恶意代码,通过后给个票据)</span></span>
<span class="line"><span>   Gatekeeper 检查签名 + 公证票据,否则用户看到&quot;无法打开&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Linux 包签名(apt / yum / pacman)</span></span>
<span class="line"><span>   传统是 GPG 签名,每个发行版有自己的密钥</span></span>
<span class="line"><span>   apt-key / rpm --import 加信任</span></span>
<span class="line"><span>   新趋势:Sigstore(下面专门讲)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>容器 / npm / PyPI 签名 —— Sigstore</span></span>
<span class="line"><span>   2021 年 Linux 基金会项目,现在已成事实标准</span></span>
<span class="line"><span>   核心思想:keyless 签名 —— 签的时候用短期证书(10 分钟过期)</span></span>
<span class="line"><span>   证书绑定到你的 OIDC 身份(GitHub / Google / 公司 SSO)</span></span>
<span class="line"><span>   签名 + 证书 + 透明日志都进 Rekor</span></span>
<span class="line"><span>   你不用管理&quot;长期签名密钥&quot;,签完即弃</span></span></code></pre></div><h3 id="_7-2-sigstore-为什么重要" tabindex="-1">7.2 Sigstore 为什么重要 <a class="header-anchor" href="#_7-2-sigstore-为什么重要" aria-label="Permalink to &quot;7.2 Sigstore 为什么重要&quot;">​</a></h3><p><strong>传统代码签名最大的痛点是「密钥管理」</strong>——开发者必须保管签名私钥几年,丢了 / 泄了 / 离职带走了都是大事故。Sigstore 的革命:开发者用 OIDC 登录(GitHub Actions 已集成)→ Fulcio CA 颁发一张 10 分钟有效的证书(Subject = GitHub 仓库)→ 用这张证书签包 → 签完证书也过期了 → 签名 + 证书 + 时间戳全提交到 Rekor 透明日志。验证时:看签名 + 看证书是不是 Sigstore 的根 + 看 Rekor 日志,<strong>「这个 npm 包是哪个 GitHub 仓库的哪条 CI 流水线发的」全可查</strong>。</p><p><strong>这是 X.509 + CT + OIDC 的工程组合拳</strong>——把 PKI 当工具用,但是密钥短命化、身份联邦化、记录透明化。</p><hr><h2 id="八、真实事故-diginotar-与-let-s-encrypt-的革命" tabindex="-1">八、真实事故:DigiNotar 与 Let&#39;s Encrypt 的革命 <a class="header-anchor" href="#八、真实事故-diginotar-与-let-s-encrypt-的革命" aria-label="Permalink to &quot;八、真实事故:DigiNotar 与 Let&#39;s Encrypt 的革命&quot;">​</a></h2><p>理论讲完了,看两个真实事件——它们彻底重塑了 PKI 生态。</p><h3 id="_8-1-diginotar-倒闭-2011" tabindex="-1">8.1 DigiNotar 倒闭(2011) <a class="header-anchor" href="#_8-1-diginotar-倒闭-2011" aria-label="Permalink to &quot;8.1 DigiNotar 倒闭(2011)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>2011 年 6 月:</span></span>
<span class="line"><span>   荷兰 CA DigiNotar 被攻陷,攻击者(后来归因于伊朗政府)</span></span>
<span class="line"><span>   签了 500+ 张假证书,包括 *.google.com / *.skype.com /</span></span>
<span class="line"><span>   *.cia.gov / *.mossad.gov.il</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>2011 年 7 月:</span></span>
<span class="line"><span>   伊朗 30 万 Gmail 用户被中间人攻击,凭证泄漏</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2011 年 8 月:</span></span>
<span class="line"><span>   一个伊朗用户的 Chrome 突然警告 *.google.com 证书异常</span></span>
<span class="line"><span>   (Chrome 当时已经 pin 了 Google 自己的 CA,DigiNotar 触发了 pin 报错)</span></span>
<span class="line"><span>   → 事件曝光</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2011 年 9 月:</span></span>
<span class="line"><span>   微软 / 苹果 / 火狐 / 谷歌联合从信任库里拔掉 DigiNotar</span></span>
<span class="line"><span>   DigiNotar 当月破产清算</span></span></code></pre></div><p><strong>这个事件改变了什么</strong>:</p><ul><li>浏览器开始引入 <strong>HPKP(HTTP Public Key Pinning)</strong> —— 后来被 CT 取代,因为 pin 错了能把网站搞挂</li><li><strong>Certificate Transparency</strong> 项目立项,目标就是让「假证书签出来 1 小时内全世界都能看到」</li><li>「CA 是绝对可信的」这个假设彻底破产,<strong>整个 Web PKI 的安全模型从「信任 CA」变成「监督 CA」</strong></li></ul><h3 id="_8-2-let-s-encrypt-的革命-2015" tabindex="-1">8.2 Let&#39;s Encrypt 的革命(2015) <a class="header-anchor" href="#_8-2-let-s-encrypt-的革命-2015" aria-label="Permalink to &quot;8.2 Let&#39;s Encrypt 的革命(2015)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>2015 年之前:</span></span>
<span class="line"><span>   买证书要钱(便宜的几十美元 / 年,EV 几千)</span></span>
<span class="line"><span>   申请流程繁琐(填表 → 电话核实 → 邮件确认)</span></span>
<span class="line"><span>   90% 的网站还跑 HTTP,因为 HTTPS 太麻烦</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>2015 年:</span></span>
<span class="line"><span>   Mozilla / EFF / Linux 基金会推出 Let&#39;s Encrypt</span></span>
<span class="line"><span>   特点:</span></span>
<span class="line"><span>     1. 完全免费</span></span>
<span class="line"><span>     2. ACME 协议自动化(certbot 一行命令)</span></span>
<span class="line"><span>     3. 证书有效期只有 90 天(强制自动续期)</span></span>
<span class="line"><span>     4. 域名验证(DV)证书,没有 OV / EV 那套审计</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>2024 年:</span></span>
<span class="line"><span>   Let&#39;s Encrypt 已签发 50+ 亿张证书</span></span>
<span class="line"><span>   全球 HTTPS 普及率从 30% → 85%</span></span>
<span class="line"><span>   &quot;无 HTTPS 不上网&quot; 成为浏览器默认假设(Chrome / Firefox 全面标红 HTTP)</span></span></code></pre></div><p><strong>为什么 90 天</strong>:</p><ul><li>撤销机制半残,<strong>有效期短就是天然的撤销</strong></li><li>强制自动化(没人手动 90 天换一次证书)→ ACME 协议普及</li><li>算法迁移更快(签错 SHA-1 的话 90 天就过期)</li></ul><blockquote><p>2025 年起,行业目标是把 DV 证书有效期降到 <strong>47 天</strong>,远期 7 天。<strong>长期证书在未来 5 年会逐步消失。</strong></p></blockquote><hr><h2 id="九、工程师该知道的几条线" tabindex="-1">九、工程师该知道的几条线 <a class="header-anchor" href="#九、工程师该知道的几条线" aria-label="Permalink to &quot;九、工程师该知道的几条线&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 私钥泄漏是最严重的事故 —— 比代码漏洞还严重</span></span>
<span class="line"><span>   一把签名私钥 = 一个域名的&quot;身份&quot; / 一个 npm 包的&quot;作者权&quot;</span></span>
<span class="line"><span>   → 必须放 HSM / KMS / 至少 PKCS#11</span></span>
<span class="line"><span>   → 永远不要把 .pem / .key 提交到 Git</span></span>
<span class="line"><span>   → CI 用短期密钥(Sigstore / OIDC keyless)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. 算法用默认最新的,别自己选</span></span>
<span class="line"><span>   - TLS / mTLS:Ed25519(新),次 ECDSA P-256</span></span>
<span class="line"><span>   - JWT:EdDSA / ES256,永远拒绝 alg=none、永远不混淆 HS / RS</span></span>
<span class="line"><span>   - 代码签名:Sigstore(开源生态),Authenticode(Windows)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. 证书有效期越短越好</span></span>
<span class="line"><span>   90 天甚至 7 天,强制自动化,出事影响小</span></span>
<span class="line"><span></span></span>
<span class="line"><span>4. 必须监控自己域名的 CT 日志</span></span>
<span class="line"><span>   crt.sh 订阅 + 邮件告警</span></span>
<span class="line"><span>   突然多一张你不认识的证书 → 立刻报警 + 找 CA 撤销</span></span>
<span class="line"><span></span></span>
<span class="line"><span>5. 服务端配置三件套</span></span>
<span class="line"><span>   - 用 fullchain.pem,不要只发 leaf</span></span>
<span class="line"><span>   - 启用 OCSP Stapling</span></span>
<span class="line"><span>   - 启用 HSTS(强制 HTTPS,防 SSL Strip)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>6. 不要自己实现签名 / 验签</span></span>
<span class="line"><span>   &quot;我用 openssl rsautl 加密哈希&quot; —— 90% 概率写错</span></span>
<span class="line"><span>   用 libsodium / Go crypto / Rust ring,API 都防呆了</span></span></code></pre></div><hr><h2 id="十、踩坑提醒" tabindex="-1">十、踩坑提醒 <a class="header-anchor" href="#十、踩坑提醒" aria-label="Permalink to &quot;十、踩坑提醒&quot;">​</a></h2><ol><li><strong>「私钥加密」这种说法在签名场景已经不准确</strong>——RSA-PSS / ECDSA / EdDSA 都不是直接加密哈希</li><li><strong>ECDSA 的随机数 k 不能复用</strong>——索尼 PS3 / Android 比特币钱包都翻车在这</li><li><strong>Ed25519 是确定性签名</strong>,同样输入永远同样输出,这不是 bug 是 feature</li><li><strong>CN 字段已经被现代浏览器抛弃了</strong>,必须填 SAN</li><li><strong><code>Basic Constraints: CA=TRUE</code> 在叶子证书上是灾难</strong>——能签别的证书</li><li><strong>TLS 握手必须发完整链</strong> —— 只发 leaf 是初学者最常见配置错误</li><li><strong>CRL 已经死了,OCSP soft-fail 也半残</strong>,真正能用的是 OCSP Stapling + CT</li><li><strong>CT 日志是防御方的红利</strong>,有域名就要去 crt.sh 订阅</li><li><strong>Sigstore 是软件供应链的未来</strong>,npm / PyPI / 容器镜像都该用上(详见 26 篇供应链)</li><li><strong>公开 CA 永远不要用于内网 mTLS</strong>——内网自建 CA,见 networkLearning/21</li><li><strong>JWT 的 <code>alg=none</code> 必须拒绝</strong>,<code>alg</code> 字段必须服务端硬编码白名单,见 15 篇认证</li><li><strong>证书过期是真实事故源</strong>——监控告警必须覆盖所有证书,自动续期是基本盘</li></ol><hr><p>下一篇:<code>08-密码学工程陷阱.md</code>,讲清楚为什么密码学的工程错误<strong>几乎都不在算法本身,而在使用方式</strong>——时序攻击怎么从字符串比较里偷出来 admin token、Padding Oracle 怎么让你只看错误码就能解密整个密文、为什么 <code>Math.random()</code> 不能用在 token 生成里、KMS / HSM 在生产里到底怎么用、AWS KMS 的 envelope encryption 模式为什么是事实标准——这一篇是密码学篇的收尾,看完你应该有「<strong>自己绝不写一个字密码学原语</strong>」的肌肉记忆。</p>`,108)])])}const u=n(t,[["render",l]]);export{g as __pageData,u as default};
