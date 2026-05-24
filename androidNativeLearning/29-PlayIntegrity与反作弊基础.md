# 29-Play Integrity 与反作弊基础

> 一句话导读:Play Integrity 不是把"反外挂"做完,它只回答三句话——这台设备是 Google 认证过的吗、这个 App 包是 Play 分发的吗、这次调用是来自真用户而不是脚本吗——其它防御要在服务端拼装,客户端要做的只是按 nonce 协议把 verdict 拿到、原封不动转给后端验签。

到这一篇,NotedX 的功能闭环都接通了,但任何能联网的现代 App 都要面对一个老问题:**怎么判断"我服务端收到的这个请求,真的是来自我官方分发的、在一台干净设备上跑的、由真人触发的 App"?** 这个问题的边界非常清楚——客户端永远不能"自证清白",任何"客户端检测+客户端判定+继续走"的方案都是纸糊的,真人有 root 权限 + Frida + Magisk 一秒 bypass;唯一可行的链路是"客户端拿一份不可伪造的设备/App/请求证明 + 服务端验签 + 服务端拒绝"。

Google 给的这份证明就是 Play Integrity API。本篇拆解三件事:它要回答的三类 verdict 到底各自意味着什么、Standard 与 Classic 请求的边界、nonce 协议端到端怎么拼。最后用一节给出 Network Security Config 与证书钉扎的边界——它解决另一个独立的"中间人风险"问题,不能跟 Integrity 混。

Play Integrity 的设备地图覆盖度,前提是设备装了 Google Play Services。国内大量没 GMS 的设备(华为 HMS、磨叽改机型、某些 root 后的国行机)拿不到 Integrity verdict,这条链路天生跑不通。末尾会简短说明国内场景的工程取舍——不是"用 Play Integrity 就够",也不是"放弃反作弊",而是把"客户端身份证明"层换成多渠道方案,服务端的核心防御逻辑保持不变。

## 1. 机制定位

把"App 防被冒充"拆开,实际上是三个独立子问题:

- **设备完整性**:这台手机的系统是不是被改过(root、Magisk、自定义 ROM、模拟器),Android 内核与 OEM 启动链有没有被破坏。被 root 不一定就是坏人,但服务端可能想"对 root 设备拒绝高敏感操作"(支付、内购、登录)。
- **App 完整性**:跑这次请求的 App,APK 文件和 Play 上的官方 App 是同一份,还是被改过、被重打包、加了广告 SDK 的盗版。这一项 Play 用 app signing key 指纹 + package name 来判定。
- **账户完整性**:玩这个 App 的账号,在 Play Store 上有没有正常装记录,有没有被打过"机器人 / 滥用"标记。

旧时代这三件事是 SafetyNet Attestation 一个接口解决,客户端拿一份 JWS(JSON Web Signature),里面有 `ctsProfileMatch` / `basicIntegrity` 等字段,服务端验签后读字段判断。**SafetyNet Attestation 在 2024 年完成下线**,Google 把它替换成 Play Integrity API,语义更聚焦、能区分 Standard 与 Classic 两种请求模式、verdict 字段重新组织。任何还在用 `com.google.android.gms.safetynet.SafetyNet.getClient(...).attest(...)` 的代码,2024 后调用直接报 deprecated 或返回空,必须迁。

Play Integrity 的客户端调用极简——传一个 nonce(防重放用的一次性字符串)进去,异步拿回一个 token。token 本身是加密的,客户端看不出内容,只能转给你的后端;后端解密(用 Google 提供的密钥)或者通过 Google Play Integrity 服务端校验接口换出明文 verdict。verdict 长这样(简化):

```json
{
  "requestDetails": {
    "requestPackageName": "com.example.notedx",
    "nonce": "base64-nonce",
    "timestampMillis": 1716000000000
  },
  "appIntegrity": {
    "appRecognitionVerdict": "PLAY_RECOGNIZED",
    "packageName": "com.example.notedx",
    "certificateSha256Digest": ["..."],
    "versionCode": "10203"
  },
  "deviceIntegrity": {
    "deviceRecognitionVerdict": ["MEETS_DEVICE_INTEGRITY", "MEETS_STRONG_INTEGRITY"]
  },
  "accountDetails": {
    "appLicensingVerdict": "LICENSED"
  }
}
```

服务端拿到 verdict 之后,自己决定每个字段的政策:`PLAY_RECOGNIZED` 才允许内购、`MEETS_STRONG_INTEGRITY` 才允许敏感操作、`LICENSED` 才允许同步云端付费内容,等等。verdict 本身不"拒绝"任何东西,它只是把"是什么样的设备+App"诚实告诉你,后续政策永远是你自己的服务端决定。

新手最常见的失控写法,是把 verdict 拿到后**在客户端**判定再决定调不调后端:"如果 verdict 说 root,我就 toast 一下让用户卸载 root 工具。"——这是纸糊。攻击者直接 hook 你的客户端判定函数让它返回"未 root"即可。verdict 永远只能在服务端用,客户端只是不可见的传输管道。

## 2. Android 心智

**Standard request vs Classic request 是 2023 年新加的二分。** Standard 用 `requestIntegrityToken` (新 API),延迟低(< 50ms 第二次调用),配额高(每 App 每分钟 10K 次),适合"频繁的中低敏感操作",比如每次发请求都验一次。Classic 用 `requestIntegrityToken` (旧 API),延迟高(秒级),配额低(每 App 每天 10K 次默认),适合"低频高敏感操作",比如登录、付款、首次同步。两者的核心区别:

- Standard 在 App 启动时调一次 `prepareIntegrityToken` 预热(token provider),后续每次 `request(nonce)` 几乎瞬时返回,服务端拿到的 verdict 字段相对**精简**,不包含某些深度设备字段。
- Classic 每次调用都现场跟 Play Services 通信、拉一个完整 verdict,字段更全,但耗时和配额都贵。

工程上的策略基本是:**Standard 当默认,Classic 留给真正高价值的几个操作。** 不要每个 API 都 Classic,一天 10K 配额很快就用光。

**nonce 是反重放的关键。** 服务端为每次调用生成一个唯一的 nonce(推荐 16+ 字节随机 + base64 url-encode),客户端把它放进 Integrity 请求,verdict 里会原封不动包含 nonce。服务端验签时检查:nonce 是不是我刚才发出去的、是不是只用了一次、时间戳没超过几分钟。如果不带 nonce,攻击者拿一份合法 verdict 反复重放,服务端无法区分"新请求"还是"旧请求"。

`requestDetails.timestampMillis` 是 Play Services 生成 token 的时间。服务端验证时通常检查 `now - timestampMillis < 5 分钟`,过期就拒。这个时间是 Play Services 给的,客户端改不了系统时间来骗(verdict 在 Google 服务端组装时填好 timestamp,客户端只能 forward)。

**`requestDetails.requestPackageName` 必须等于服务端预期的包名。** 攻击者把 verdict 偷给另一个 App,服务端能立刻发现 package 不对。这是为什么 Play Integrity 的安全性强于"只依赖签名校验"。

**两条服务端验签路径。**

1. **Decrypt locally**:在 Play Console → Setup → App integrity 拿到 decryption key 和 verification key,服务端自己用 JWE / JWS 库解 token、验签。Google 推荐这条,延迟最低、不依赖 Google API 服务。
2. **Google-managed (Standard 默认)**:Standard 请求的 token 不能本地解,必须调 Google 的 Integrity API (`https://playintegrity.googleapis.com/v1/<pkg>:decodeIntegrityToken`),用 OAuth service account 凭证 +  token,服务端拿回 JSON verdict。这条好处是密钥永远不离开 Google,代价是每个请求多一跳。

**Classic 默认是 Decrypt locally;Standard 必须 Google-managed。** 这是新手最容易混的点。混了 Standard + 本地解会得到 "INVALID_TOKEN"。

**Network Security Config 是另一回事。** 它管的是 App 在网络层信任哪些证书 / 是否允许明文 HTTP / 哪些域名做证书钉扎。Play Integrity 解决"是不是我的合法 App",NSC 解决"我的合法 App 在发 HTTPS 请求时,中间人能不能伪造证书冒充我的后端"。两条防御并行,缺一不可:有 Integrity 但没钉扎,中间人可以 MITM 你的明文响应;有钉扎但没 Integrity,被改过的 App 直接绕过钉扎(它自己代码不调你后端,而是上传给攻击者的服务器)。

## 3. 工程实现

### 3.1 客户端集成(Standard 模式)

`libs.versions.toml` 加:

```toml
[versions]
playIntegrity = "1.4.0"

[libraries]
play-integrity = { module = "com.google.android.play:integrity", version.ref = "playIntegrity" }
```

`app/build.gradle.kts`:

```kotlin
dependencies {
    implementation(libs.play.integrity)
}
```

`AndroidManifest.xml` 不需要权限(走 Play Services 内部通道,不直接网络)。

封装一个 `IntegrityRepository`,App 启动时预热,业务调用按需要 nonce 取 token:

```kotlin
// data/src/main/java/com/example/notedx/integrity/IntegrityRepository.kt
package com.example.notedx.integrity

import android.content.Context
import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.google.android.play.core.integrity.StandardIntegrityManager
import com.google.android.play.core.integrity.StandardIntegrityManager.PrepareIntegrityTokenRequest
import com.google.android.play.core.integrity.StandardIntegrityManager.StandardIntegrityTokenRequest
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.suspendCancellableCoroutine
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

@Singleton
class IntegrityRepository @Inject constructor(
    @ApplicationContext context: Context,
) {
    // cloudProjectNumber 来自 Google Cloud 项目,Play Console → App integrity 关联
    private val cloudProjectNumber: Long = 1234567890L

    private val standardManager: StandardIntegrityManager =
        IntegrityManagerFactory.createStandard(context)

    @Volatile
    private var tokenProvider: StandardIntegrityManager.StandardIntegrityTokenProvider? = null

    /** App 启动时调一次,后续每次 request 复用 */
    suspend fun warmUp() = suspendCancellableCoroutine<Unit> { cont ->
        val request = PrepareIntegrityTokenRequest.builder()
            .setCloudProjectNumber(cloudProjectNumber)
            .build()
        standardManager.prepareIntegrityToken(request)
            .addOnSuccessListener { provider ->
                tokenProvider = provider
                cont.resume(Unit)
            }
            .addOnFailureListener { cont.resumeWithException(it) }
    }

    /**
     * @param nonceHash 服务端发过来的 nonce 已做 SHA-256,这里再 base64.
     *                   Play Integrity 限制 nonce ≤ 500 字节、URL-safe base64
     */
    suspend fun fetchToken(nonceHash: String): String =
        suspendCancellableCoroutine { cont ->
            val provider = tokenProvider
                ?: return@suspendCancellableCoroutine cont.resumeWithException(
                    IllegalStateException("call warmUp() first"),
                )
            val request = StandardIntegrityTokenRequest.builder()
                .setRequestHash(nonceHash)
                .build()
            provider.request(request)
                .addOnSuccessListener { response ->
                    cont.resume(response.token())
                }
                .addOnFailureListener { cont.resumeWithException(it) }
        }
}
```

业务侧用法,以"提交一次敏感同步"为例:

```kotlin
// data/src/main/java/com/example/notedx/sync/SyncRepository.kt
package com.example.notedx.sync

import com.example.notedx.integrity.IntegrityRepository
import com.example.notedx.net.SyncApi
import com.example.notedx.net.NonceRequest
import com.example.notedx.net.AttestedSyncRequest
import java.security.MessageDigest
import javax.inject.Inject

class SyncRepository @Inject constructor(
    private val integrity: IntegrityRepository,
    private val api: SyncApi,
) {
    suspend fun pushNotes(notes: List<NoteDto>) {
        // 1. 找服务端要一个 nonce
        val nonce = api.fetchNonce(NonceRequest(action = "pushNotes")).nonce
        // 2. nonce + 业务参数摘要,做 SHA-256 作为 Integrity 的 requestHash
        val payloadHash = sha256(nonce + serializeStable(notes))
        // 3. 走 Integrity 拿 token
        val token = integrity.fetchToken(payloadHash)
        // 4. 把 token 与业务参数一起发给服务端
        api.pushNotes(AttestedSyncRequest(notes = notes, integrityToken = token, nonce = nonce))
    }

    private fun sha256(input: String): String {
        val bytes = MessageDigest.getInstance("SHA-256").digest(input.toByteArray())
        return android.util.Base64.encodeToString(
            bytes,
            android.util.Base64.URL_SAFE or android.util.Base64.NO_WRAP or android.util.Base64.NO_PADDING,
        )
    }

    private fun serializeStable(notes: List<NoteDto>): String =
        notes.joinToString(separator = "|") { "${it.id}:${it.updatedAt}" }
}
```

App 启动时一次预热(放在 `Application.onCreate` 或第一次进入需要 Integrity 的页面):

```kotlin
// app/src/main/java/com/example/notedx/NotedxApp.kt
package com.example.notedx

import android.app.Application
import com.example.notedx.integrity.IntegrityRepository
import dagger.hilt.android.HiltAndroidApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltAndroidApp
class NotedxApp : Application() {
    @Inject lateinit var integrity: IntegrityRepository

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onCreate() {
        super.onCreate()
        scope.launch {
            runCatching { integrity.warmUp() }
                .onFailure { android.util.Log.w("Integrity", "warmUp failed", it) }
        }
    }
}
```

预热失败不应当阻塞 App 启动——可能是 Play Services 暂时不可用,业务可以选择"degrade":敏感操作走重 verify(Classic),非敏感操作放过。

### 3.2 服务端验签(Kotlin / Ktor 伪代码)

```kotlin
// server-side pseudo-code
@Serializable
data class NonceResponse(val nonce: String, val expiresAt: Long)

@Serializable
data class AttestedRequest(val notes: List<NoteDto>, val integrityToken: String, val nonce: String)

class IntegrityVerifier(
    private val googleApi: GoogleIntegrityApi,  // Google REST client wrapper
    private val nonceStore: NonceStore,         // Redis: key=nonce, value=action+issuedAt
    private val expectedPackage: String = "com.example.notedx",
    private val expectedSignatureSha256: String = "AB:CD:EF:...:99", // app signing key
) {
    suspend fun issueNonce(action: String): NonceResponse {
        val bytes = ByteArray(16).also { SecureRandom().nextBytes(it) }
        val nonce = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
        nonceStore.put(nonce, action, ttlSeconds = 300)
        return NonceResponse(nonce, expiresAt = System.currentTimeMillis() + 300_000)
    }

    suspend fun verify(req: AttestedRequest, expectedAction: String) {
        // 1. nonce 必须是我们刚发出去的,且未使用过
        val info = nonceStore.consume(req.nonce)
            ?: throw IntegrityException("unknown or replayed nonce")
        require(info.action == expectedAction) { "nonce/action mismatch" }

        // 2. 走 Google Integrity API 解 token
        val verdict = googleApi.decodeIntegrityToken(expectedPackage, req.integrityToken)

        // 3. requestDetails 校验
        val rd = verdict.requestDetails
        require(rd.requestPackageName == expectedPackage) { "package mismatch" }
        require(rd.nonce == sha256Base64(req.nonce + serializeStable(req.notes))) { "hash mismatch" }
        require(System.currentTimeMillis() - rd.timestampMillis < 300_000) { "token too old" }

        // 4. appIntegrity 校验
        val ai = verdict.appIntegrity
        require(ai.appRecognitionVerdict == "PLAY_RECOGNIZED") { "not from Play" }
        require(expectedSignatureSha256 in ai.certificateSha256Digest) { "signature mismatch" }

        // 5. deviceIntegrity 政策(可调)
        val di = verdict.deviceIntegrity.deviceRecognitionVerdict
        // 高敏感:仅 STRONG;普通敏感:MEETS_DEVICE_INTEGRITY 即可;开发期:允许空
        require("MEETS_DEVICE_INTEGRITY" in di) {
            "device fails integrity: $di"
        }

        // 6. accountDetails 政策(看是否要求购买记录)
        val licensed = verdict.accountDetails.appLicensingVerdict
        require(licensed == "LICENSED" || licensed == "UNEVALUATED") {
            "account not licensed: $licensed"
        }
    }
}
```

`nonceStore.consume` 一定要"原子取出 + 删除",否则同一个 nonce 在并发下能被用两次。Redis 用 `GETDEL` 一条命令搞定。

把上面这一段直接放在 sync handler 入口:

```kotlin
post("/sync/notes") {
    val req = call.receive<AttestedRequest>()
    integrityVerifier.verify(req, expectedAction = "pushNotes")
    syncService.apply(req.notes)
    call.respond(HttpStatusCode.OK)
}
```

### 3.3 Network Security Config 与证书钉扎

`AndroidManifest.xml`:

```xml
<application
    android:name=".NotedxApp"
    android:networkSecurityConfig="@xml/network_security_config"
    ...>
</application>
```

`app/src/main/res/xml/network_security_config.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!-- 全局基线:不允许明文 HTTP -->
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>

    <!-- 生产 API 域名:钉到我们自己的证书公钥 (SPKI SHA-256) -->
    <domain-config>
        <domain includeSubdomains="true">api.notedx.example.com</domain>
        <pin-set expiration="2027-01-01">
            <!-- 当前 leaf -->
            <pin digest="SHA-256">AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=</pin>
            <!-- backup pin:换证书前先把新证的 pin 加进来 ship 一版 -->
            <pin digest="SHA-256">BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=</pin>
        </pin-set>
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </domain-config>

    <!-- debug build 临时放开,允许本地 mock server 跑明文 -->
    <debug-overrides>
        <trust-anchors>
            <certificates src="system" />
            <certificates src="user" />   <!-- 允许 Charles / mitmproxy 安装的 user CA -->
        </trust-anchors>
    </debug-overrides>
</network-security-config>
```

生成 pin 的命令:

```bash
# 从证书 PEM 取 Subject Public Key Info,做 SHA-256 然后 base64
openssl x509 -in api.notedx.crt -pubkey -noout |
    openssl pkey -pubin -outform der |
    openssl dgst -sha256 -binary |
    openssl enc -base64
```

钉扎逻辑由 OkHttp 自动按 NSC 执行,代码侧不需要写 CertificatePinner。但要在 OkHttp Client 里**不要**手动设 `hostnameVerifier = HostnameVerifier { _, _ -> true }`(经常在 demo 里见到),会直接打穿钉扎与系统证书校验。

## 4. 调参与验收

**Standard 调用频率与配额。** Standard 默认 10K/分钟/App,够 1000 个并发用户每分钟 10 次调用。如果你的业务是每个写请求都校验,平均用户 1 分钟一次写,大概能撑 10K MAU 平稳。要更高配额可在 Play Console 申请。Classic 默认 10K/天/App,只够"登录 + 付款"级别的低频调用,不能给每个请求用。

**predicate `MEETS_DEVICE_INTEGRITY` vs `MEETS_STRONG_INTEGRITY`。** 前者是"系统未被严重修改、Play Services 可用",约 99% 的正常 Android 设备能过。后者额外要求 hardware-backed key attestation,排除掉部分老设备 / 模拟器 / 厂商定制 ROM,大概排除 5-10%。普通业务走前者就够;只有支付、内购、防外挂这种场景用后者。

**nonce + payload hash 的拼法。** 服务端验签时检查 `verdict.requestDetails.nonce` 等于 `sha256(nonce || payload)`,这样可以同时绑定"一次性"和"参数不可篡改"。如果你只发 nonce 不绑 payload,攻击者可以拿到一个合法 token 后,把 payload 改成"给我自己加 1000 金币" 再 forward 到服务端——服务端因为 nonce 对、token 对,会放过这个请求。绑 payload hash 是"零成本但很多人忘了"的关键防御。

**token 时效。** Google 的 token timestamp 早于"请求到服务端的当前时间" 5 分钟内是安全窗口。超过 5 分钟有可能是合法但慢的网络,也可能是攻击者攒了一批 token 等会儿重放。生产推荐 2-3 分钟拒。

**verify 失败后怎么响应。** 不要返回 "integrity failed" 之类明确错误,攻击者能据此调试绕过路径。建议返回与正常 server error 一样的 5xx,在内部日志里记录详细原因。客户端拿到 5xx 只做"重试一次 → 再失败提示稍后再试"。

**verdict:这一篇完成的标志。**

- 客户端能在 App 启动 5 秒内成功 warmUp,后续 fetchToken 平均 < 100ms。
- 服务端按 nonce + payload hash 协议正确解 token,verdict 三段(request / app / device)都校验。
- nonce 在 Redis 上是 "consume" 语义,同一个 nonce 第二次提交直接拒。
- NSC 在 release 不允许 cleartext,钉扎对生产域名生效;debug 允许 user CA(本地 Charles 抓包能工作)。
- 故意用一个旧 token 重放,服务端返回错误;故意改 payload,服务端返回错误。

## 5. 踩坑

**SafetyNet Attestation 还在文档里搜得到。** Google 官方文档把它标了 deprecated,但旧博客和 StackOverflow 答案一大堆。**2024 起 SafetyNet Attestation 调用直接失败**,任何带 `import com.google.android.gms.safetynet.*` 的代码都必须迁。`SafetyNet.getClient(...).attest(...)` 一行不能留。

**Standard token 想本地解。** 试了一通报 `INVALID_TOKEN`,根本原因是 Standard 模式的密钥不下发到开发者,必须走 Google API。Classic 才能本地解。两条路是分叉的,不能交叉用。

**Cloud project number 写成 project ID。** Standard `setCloudProjectNumber(...)` 收的是数字 ID(像 1234567890),不是 string project ID(像 `my-notedx-prod`)。写错调用会失败,且错误信息很不友好。在 Google Cloud Console 顶部能看到数字。

**nonce 太长。** Play Integrity 限制 nonce ≤ 500 字节、URL-safe base64。原始 nonce 16 字节足够,但有人把"nonce + 全部 payload 文本"都塞进去,几 KB 直接挂。规范做法是 hash 后 32 字节再 base64,稳稳在 50 字节内。

**`requestHash` 与服务端校验对不上,以为是 bug,实际是字符串顺序不一致。** 服务端和客户端都做 `sha256(nonce + payload)` 时,payload 的序列化必须**字典序稳定**——不能用 `JSONObject.toString()`(无序),要么手写"按 key 排序后拼字符串",要么用稳定的 JSON 序列化器。新手最痛一坑:本地测能过,上线随机失败。

**`MEETS_DEVICE_INTEGRITY` 在某些华为 / 三星 / 小米 ROM 上不稳定。** 不是设备坏,是 OEM 改了某些系统签名校验路径,Play Integrity 判定为 unverified。如果你的目标用户里这类设备比例高,要把 device verdict 政策放宽到"verdict 不存在也允许"(对应 verdict 字段为空数组),只在显式存在 negative 时拒。

**Debug build 直接调 Play Integrity 总返回 token,但服务端解出来 verdict 是 `UNRECOGNIZED_VERSION`。** 因为 Debug APK 没经过 Play 分发,Play 不认。开发期不要把 Integrity 加进必须通过的链路,要么 mock 一份 verdict、要么对 debug build 直接 short-circuit 通过。

**钉扎用了 leaf cert 的 pin,证书 90 天过期后整个 App 失联。** Let's Encrypt 之类短证书更新频繁,钉 leaf 会让证书每次轮换都要 ship 一个新 App 版本。规范做法是**钉 intermediate CA 或者 root CA 的 SPKI**,这些几年不变;或者在 NSC 里同时配置当前 + 下一证书两个 pin(backup pin),证书轮换前先 ship 带 backup 的版本,验证新 pin 生效,再换证书。

**`<debug-overrides>` 把 user CA 放进生产构建。** NSC 的 `debug-overrides` 块在 `android:debuggable="true"` 时才生效,正常 release 构建不会启用——但如果某次出 release 时 manifest 被错改 `debuggable="true"`,user CA 就被允许了,Charles 能抓你的生产流量。CI 加一条 check:release `AndroidManifest.xml` `android:debuggable` 必须不存在或为 false。

**`cleartextTrafficPermitted="false"` 之后,内嵌 WebView 加载 http:// 链接全部白屏。** WebView 也走 NSC,但行为有微妙差异——它会按页面发起的 request 域名查 NSC,而不是 host App 的某个全局策略。要在 WebView 加载明文页面,要么改 https,要么针对那个域名单独开 `cleartextTrafficPermitted="true"`,不要全局开。

**OkHttp 自己加一个 CertificatePinner 与 NSC 重复。** 不会报错,但两套规则要保持同步,容易漏一个。推荐统一走 NSC,代码侧不要手动 pin。

**国内场景没有 Play Integrity 怎么办(简要)。** 没装 GMS 的设备拿不到 Integrity token,这是物理事实。工程上的取舍:

- **业务允许就降级**:对国内分发渠道(华为应用市场、小米、OPPO/vivo)走"渠道+包名+签名指纹"的弱校验组合——服务端识别请求 ID 的 channel 字段,该 channel 不要求 Integrity verdict,只要求其它信号(IP 频次、设备指纹、行为模式)做风控。
- **接厂商替代**:华为有 HMS Safety Detect(类似 SafetyNet),小米 / OPPO / vivo 也各自有设备完整性检测 SDK,但都是渠道绑定的,不通用,集成成本高且彼此互不兼容。
- **服务端兜底**:无论客户端能不能提供 Integrity,服务端的核心防御逻辑(速率限制、风控规则、订单一致性校验)都不能撤——客户端证明是"加分项",不是唯一防线。

这个边界本身可以单独写一篇,本系列不展开。

## 手动验证

- [ ] App 启动后用 `adb logcat | grep Integrity`,看到 warmUp 成功日志。
- [ ] 在敏感操作页面触发请求,服务端日志显示完整 verdict(三段都不为空),verify 通过。
- [ ] 把同一个 nonce 复制到 Postman 重发,服务端返回错误并日志显示 "unknown or replayed nonce"。
- [ ] 把 payload 中任意字段改一位再发,服务端报 "hash mismatch"。
- [ ] 故意把 `expectedSignatureSha256` 设错值,重启服务端,客户端正常请求被拒 "signature mismatch"。
- [ ] release 构建用 Charles 抓 `https://api.notedx.example.com/sync/notes`,Charles 显示 "SSL handshake failure"(钉扎生效)。
- [ ] debug 构建用 Charles 抓同一域名,允许 user CA 后能看到明文请求(`<debug-overrides>` 生效)。
- [ ] 把 release `AndroidManifest.xml` 的 `android:debuggable` 故意打开,CI 报错并阻止打包。
- [ ] 一台被 Magisk root 的设备调用,verdict `deviceRecognitionVerdict` 不包含 `MEETS_DEVICE_INTEGRITY`,服务端按政策拒绝。
