# Android 安全模型:权限、签名、Sandbox 与 SELinux

> 一句话:**Android 的"应用安全"不是杀毒软件,是用 Linux UID 沙箱 + APK 签名 + 运行时权限 + SELinux 强制访问控制四层叠加,任何 App 默认啥也干不了,要做什么必须按规矩申请**。

---

## 一、Android 安全的四层防御

```
┌────────────────────────────────────────────────────────┐
│  1. 运行时权限(Runtime Permission)                     │  ← 危险权限用户必须主动同意
│     用户级:点击同意 / 拒绝                                  │
├────────────────────────────────────────────────────────┤
│  2. APK 签名(Signature)                                │  ← App 身份证,不可伪造
│     PKI:私钥签 + 公钥验                                   │
├────────────────────────────────────────────────────────┤
│  3. Linux UID 沙箱                                       │  ← 每 App 独立 UID,/data/data 隔离
│     内核级:fork + setUid 后无法跨边界                       │
├────────────────────────────────────────────────────────┤
│  4. SELinux MAC                                          │  ← 系统服务级别访问控制
│     内核 LSM:即便 root 也只能干 policy 允许的事             │
└────────────────────────────────────────────────────────┘
```

**任何一层都能挡住攻击**——多层叠加意味着突破一层不一定崩盘。

---

## 二、第一层:运行时权限

15 篇(现代版)详细讲过。这里复习:

**Normal**(普通)——manifest 声明即给,不弹窗(INTERNET / VIBRATE / WAKE_LOCK)。

**Dangerous**(危险)——必须运行时弹窗:
- CAMERA / RECORD_AUDIO
- READ_CONTACTS / READ_CALL_LOG / READ_SMS
- READ_MEDIA_IMAGES / READ_MEDIA_VIDEO / READ_MEDIA_AUDIO(API 33+)
- ACCESS_FINE_LOCATION / ACCESS_COARSE_LOCATION
- POST_NOTIFICATIONS(API 33+)

**Signature**(签名)——仅同签名 App 互访(`shareUserId` / 自定义 permission protectionLevel="signature")。

**Special**(特殊)——必须跳设置:
- SYSTEM_ALERT_WINDOW(悬浮窗)
- MANAGE_EXTERNAL_STORAGE(所有文件访问)
- REQUEST_INSTALL_PACKAGES(安装其他 APK)
- USAGE_STATS(看用户用 App 的时间)

**用户可随时撤销权限**——你的代码必须每次使用前 check,不能假设"昨天有权限今天就有"。

---

## 三、Android 13+ 的权限收紧

```
API 33:
  - POST_NOTIFICATIONS(发通知需运行时申请)
  - READ_EXTERNAL_STORAGE 拆为 READ_MEDIA_IMAGES / VIDEO / AUDIO
  - NEARBY_WIFI_DEVICES(扫描 WiFi 不再要位置权限)

API 34:
  - READ_MEDIA_VISUAL_USER_SELECTED(选择性照片授权)
  - 前台服务必须声明 type + type 对应权限
  - 限制后台 Activity 启动

API 35:
  - edge-to-edge 强制(物理 UI 边界变化,间接影响安全 UX)
```

**整体趋势:把"以前默认有的能力"逐步收回,逼 App 显式申请 + 用户显式同意**。

---

## 四、第二层:APK 签名

```
开发者私钥                              开发者公钥(嵌入 APK)
   │                                       ↑
   │ 用私钥签 SHA-256 哈希                  │
   ▼                                       │
APK 文件签名 ──────────────────────────────┘
   ↑
   │ 系统用嵌入的公钥验证签名
   │
PMS 安装时检查
```

**签名的三个作用**:

1. **身份认证**——同包名同签名才能更新;别人不能用 `com.notedx` 包名发新版本
2. **完整性**——任何文件被改动签名失败
3. **同 UID 共享**——同签名两 App 可声明 `sharedUserId` 共用 UID(几乎不用)

**签名方案**(02 篇详细讲):
- v1(JAR signature)—— Android 1.0,基于 META-INF/
- v2(API 24+)—— APK 整体哈希,更快验证
- v3(API 28+)—— 支持密钥轮换
- v4(API 30+)—— 增量更新

---

## 五、Play App Signing

```
开发者                Play Console               Play Store 用户
   │                      │                          │
   │ 上传 APK(上传密钥签) │                          │
   ▼                      │                          │
   ─────────────────────► │                          │
                          │                          │
                          │ Google 用发布密钥重签     │
                          │                          ▼
                          └─────────────────────►  下载已重签 APK
```

**Play App Signing**:你只持有"上传密钥"(发给 Google),Google 用真正的"发布密钥"重签后分发。

**好处**:

- **上传密钥丢失可恢复**——Play Console 让你撤销旧上传密钥,签新的
- **发布密钥永不离开 Google**——更难泄漏
- **支持 ABI / 资源拆分**——Google 重签每个 split APK

**实操**:新项目上 Play 时强烈推荐启用 Play App Signing。Play Console 创建应用时默认就是这个流程。

---

## 六、`signature` protectionLevel:自定义权限

你 App 可以定义自己的权限,**只允许同签名 App 调你的组件**:

```xml
<permission
    android:name="com.notedx.permission.READ_NOTES"
    android:protectionLevel="signature" />

<provider
    android:name=".NoteProvider"
    android:authorities="com.notedx.provider"
    android:exported="true"
    android:readPermission="com.notedx.permission.READ_NOTES" />
```

调用 App 必须:

```xml
<uses-permission android:name="com.notedx.permission.READ_NOTES" />
```

+ 与 NotedX **同签名**(用同一份 keystore)。

**用例**:你 App 套件多个 App(NotedX + NotedX Pro + NotedX Widget)——只允许"自家"App 互访数据。

---

## 七、第三层:Linux UID Sandbox

每个 App 安装时分配独立 UID(10000+),进程 setUid 后只能访问自己 UID 拥有的资源。

**物理隔离**:

```bash
$ ls -la /data/data/
drwx------ 7 u0_a142 u0_a142 com.notedx
drwx------ 8 u0_a143 u0_a143 com.example
# 权限 700,只有属主能进
```

**就算 root**(用户层面):普通 ADB 不能 cd 到别 App 的 data 目录。**只有真正 root 过的设备才能突破**——但 root 设备本身就放弃了 Android 安全模型。

**Sandbox 阻挡的攻击**:

- A App 偷看 B App 的数据库 ✗(/data/data/B/ 不可访问)
- A App 杀 B App 进程 ✗(B 的 UID 不归 A 管)
- A App 监听 B App 网络 ✗(socket 按 UID 隔离)

**Sandbox 不阻挡**:
- A App 访问公共目录(/sdcard,有权限的话)——分区存储补这个洞
- A App 通过 IPC 调 B App 暴露的接口——是 B 的责任检查
- 通过 Binder 调系统服务——系统服务的权限检查负责

---

## 八、第四层:SELinux 强制访问控制(MAC)

Linux 标准权限是 DAC(Discretionary Access Control)——文件属主决定。**SELinux** 加 MAC(Mandatory Access Control)——系统策略决定,即便 root 也得遵守。

Android 5.0+ 强制启用 SELinux Enforcing 模式。

**SELinux 给每个进程 / 文件打标签**:

```bash
# 看进程 SELinux context
adb shell ps -A -Z | grep notedx
# u:r:untrusted_app:s0:c142,c256 u0_a142 12345 ... com.notedx
```

`untrusted_app` 是普通 App 的 domain。系统策略明确允许 `untrusted_app` 能做什么、不能做什么——即便你 App 是 root,也只能干这个 domain 允许的事。

**SELinux 是系统级护栏**——攻击者拿到一个普通 App 的代码执行,无法直接读 system_server 的内存 / 修改系统服务文件,因为 SELinux policy 不允许 `untrusted_app` 访问 `system_server` 的资源。

普通 App 开发者**不直接接触 SELinux**——但要知道:

- 你写的 App 总是 `untrusted_app` domain,任何系统级动作受限
- 个别"系统级 App"(车载 / 厂商定制)有更高 domain,但需 ROM 签名

---

## 九、Binder 调用的权限检查

```java
// 系统服务实现
public void someApi() {
    int callingUid = Binder.getCallingUid();
    int callingPid = Binder.getCallingPid();
    if (checkPermission("com.android.permission.X", callingPid, callingUid) != PERMISSION_GRANTED) {
        throw new SecurityException("Missing permission");
    }
    // ...
}
```

**系统服务里 `Binder.getCallingUid()` 拿到调用方真实 UID**——不可伪造(Binder driver 在内核里填,App 无法篡改)。

服务自己检查"调用方 App 是否有所需权限",没就抛 SecurityException——这是 Android 跨进程权限模型的物理实现。

---

## 十、`exported` 与 Intent 安全

```xml
<activity android:name=".MainActivity" android:exported="true">
    <intent-filter>
        <action android:name="android.intent.action.VIEW" />
    </intent-filter>
</activity>

<activity android:name=".internal.Internal" android:exported="false" />
```

**`exported="true"`**——其他 App 能调你这个组件。
**`exported="false"`**——只能同 App / 同 UID 调。

**API 31+ 起,有 intent-filter 的组件必须显式声明 `exported`**——漏写编译报错(避免开发者忘了导致组件意外公开)。

**默认应当 `false`**——除非你真的需要对外。开放接口必须在内部做输入验证。

---

## 十一、`PendingIntent` 的 IMMUTABLE

```kotlin
val pi = PendingIntent.getActivity(
    ctx, 0, intent,
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
)
```

**API 31+ 强制 IMMUTABLE**——一旦创建,`PendingIntent` 携带的 Intent 不可被修改。

**为什么强制**:`PendingIntent` 是"代表你 App 身份"的对象——给了别人,别人能用你的身份做事。如果别人能改 Intent 内容,可能让你 App 做你不想干的事(打开你的 Activity 但 extras 是攻击者塞的)。

**漏写 IMMUTABLE 直接抛异常**——发通知、AlarmManager、Glance Widget 时都要带这个 flag。

---

## 十二、Network Security Configuration

```xml
<!-- AndroidManifest.xml -->
<application
    android:networkSecurityConfig="@xml/network_security_config" />

<!-- res/xml/network_security_config.xml -->
<network-security-config>
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">localhost</domain>
        <domain includeSubdomains="true">10.0.2.2</domain>     <!-- 模拟器调本机 -->
    </domain-config>
</network-security-config>
```

**`cleartextTrafficPermitted="false"`**:不允许 HTTP(只 HTTPS)——**API 28+ 默认 false**。任何 `http://` 请求直接挂。

`<domain-config>` 给特定域名开 HTTP(开发联调用)。

**生产代码**:**默认关 HTTP**,只 HTTPS。证书校验默认走系统信任的 CA。

---

## 十三、Certificate Pinning:防中间人

```xml
<network-security-config>
    <domain-config>
        <domain includeSubdomains="true">api.notedx.app</domain>
        <pin-set expiration="2027-01-01">
            <pin digest="SHA-256">AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=</pin>
            <pin digest="SHA-256">BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=</pin>  <!-- 备份 pin -->
        </pin-set>
    </domain-config>
</network-security-config>
```

**Certificate Pinning**:除了系统 CA 信任,还要求证书匹配你预指定的指纹。即便攻击者拿到合法 CA 签的证书(企业根 CA / WiFi MITM),也对不上指纹。

**适用**:金融 App、医疗 App、需要严格防中间人攻击的场景。

**风险**:CA 证书过期 / 轮换时 App 立刻失效。所以一定要写多个 pin(主 + 备),且 `expiration` 提前 schedule 升级。

---

## 十四、`debuggable` 与 release

```xml
<application android:debuggable="false">
```

`debuggable="true"`:

- ADB `run-as` 能切到 App UID 访问数据
- Stetho / Chrome DevTools 能连接
- `Log.d` 显示完整(release 时 R8 默认 strip)
- 性能 profile / 内存 dump 可用

**release 包必须 `false`**(其实编辑 AGP `buildTypes.release` 时默认就是 false)。

**绝对不能**给生产 release 设 `debuggable=true`——攻击者能直接读你的代码、内存、数据库。

---

## 十五、`Application.isDebuggerConnected` 检测

```kotlin
if (Debug.isDebuggerConnected()) {
    // 不允许执行敏感操作
}
```

**反调试基础**:debug build 拒绝处理用户敏感数据(支付、私钥)。

**不是真正的安全机制**——逆向工程师有办法绕。只能挡掉 99% 的脚本小子。

---

## 十六、Play Protect / Play Integrity

**Play Protect**:Google 给 Android 设备的内置反恶意软件——扫描已安装 App,识别恶意行为。**用户层面,你 App 不直接接触**。

**Play Integrity API**:你的 server 想知道"这次 API 调用是不是来自真实设备上未被改的 App"——客户端调 Play Integrity 拿 token,server 用 Google API 验证 token,得到:

- **MEETS_DEVICE_INTEGRITY** / 不通过——设备没被 root / 没被改的内核
- **MEETS_STRONG_INTEGRITY** ——硬件认证保护
- **PLAY_RECOGNIZED**——这个 App 包名 + 签名是 Play Store 认识的版本

**用例**:金融 / 游戏防作弊。普通笔记类 App 不需要(增加复杂度,且国内设备无 GMS 不可用)。

---

## 十七、Android Keystore:硬件级密钥保护

```kotlin
val keyAlias = "notedx_master_key"
val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

if (!ks.containsAlias(keyAlias)) {
    val kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    kg.init(KeyGenParameterSpec.Builder(keyAlias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setUserAuthenticationRequired(true)        // 要求生物识别 / PIN
        .build())
    kg.generateKey()
}

val key = ks.getKey(keyAlias, null) as SecretKey
```

**Android Keystore**:密钥**永远不出硬件 Secure Enclave(TEE)**——你拿到的是 KeyStore 句柄,实际加密 / 解密在 TEE 内进行,内存里看不到密钥字节。

**用例**:加密用户数据、保护 Token、生物识别保护的支付。

`EncryptedSharedPreferences` / `EncryptedFile` 内部就用 Keystore 保护 master key(18 篇)。

---

## 十八、Biometric Authentication

```kotlin
implementation("androidx.biometric:biometric:1.2.0")
```

```kotlin
val executor = ContextCompat.getMainExecutor(ctx)
val prompt = BiometricPrompt(activity, executor, object : BiometricPrompt.AuthenticationCallback() {
    override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
        // 通过
    }
})

val info = BiometricPrompt.PromptInfo.Builder()
    .setTitle("解锁笔记")
    .setSubtitle("用指纹解锁")
    .setNegativeButtonText("取消")
    .build()

prompt.authenticate(info)
```

**统一的指纹 / 面部 / PIN UI**——你不直接读指纹 / 面部数据(那是系统服务的事),只拿"用户认证成功"的结果。

可以组合 Keystore——`setUserAuthenticationRequired(true)` 的 key 必须先生物识别才能用。

---

## 十九、漏洞披露与安全更新

Android 每月发安全公告:[https://source.android.com/security/bulletin](https://source.android.com/security/bulletin)。

**作为应用开发者关心**:

- **JNI 边界漏洞**——你用的 native 库有 CVE 时升级
- **WebView 漏洞**——通过 Play Store 自动更新,但你 manifest 要允许
- **Manifest 配置错误导致组件公开**——`exported=true` 漏检查
- **HTTP 明文传输被 MITM**——`cleartextTrafficPermitted=false` 默认即可

---

## 二十、踩坑

**坑 1:`debuggable=true` 上线**。release 包 debuggable —— Play 审核会拒,且攻击者轻易拿到代码与数据。

**坑 2:`exported=true` 但不验证输入**。开放组件接收任意 Intent,attacker 构造特殊 extra 让你 App 做意外事。**永远验证 extras**。

**坑 3:`PendingIntent` 不加 IMMUTABLE**。API 31+ 直接崩;早期版本则可能被 hijack。

**坑 4:HTTP 明文传输**。API 28+ 默认拒,但有些 SDK 偷偷开 cleartext。检查 `networkSecurityConfig`。

**坑 5:把 Token / 密码塞 SharedPreferences**。明文存储,任何拿到设备 root 的人都能读。**敏感数据用 EncryptedSharedPreferences / Keystore**。

**坑 6:`allowBackup=true` 加敏感数据**。系统自动备份到云,用户换设备恢复 → token 跨设备。**`<exclude>` 排除敏感目录**。

**坑 7:WebView 加载用户输入的 URL**。XSS / 钓鱼。**白名单检查 + `setJavaScriptEnabled(false)` 默认**。

**坑 8:Intent extras 信任未校验**。`val noteId = intent.getLongExtra("id", 0)` —— attacker 传 -1,你直接 `db.query("WHERE id = $noteId")` —— 至少要数据验证。

**坑 9:动态注册 BroadcastReceiver 默认 exported**。API 34+ 必须显式 `RECEIVER_NOT_EXPORTED`(10 篇)。

**坑 10:`shareUserId` 与同签名 App 不当共享**。一个 App 漏洞影响同 UID 全部 App。**`sharedUserId` 已 deprecated,新代码不要用**。

---

下一篇 `21-内存与泄漏:Java 引用模型 + LeakCanary 心智.md`,讲 Android App 内存的全部:Java 引用类型(强 / 软 / 弱 / 虚)、GC 模型、典型泄漏模式、LeakCanary 工作原理、`MAT` / `Profiler` 怎么定位泄漏点。
