# Keychain 与 App Group

业务数据可以放 SwiftData,但**敏感数据**(token、密码、设备绑定 secret)必须放 Keychain——它是 iOS 系统级的加密存储,有硬件安全模块(Secure Enclave)兜底。App Group 是另一回事:让主 App / Widget / Extension 共享同一个容器。这一篇讲透 Keychain Services API 的难用真相、`CryptoKit` 加密、`App Group` 跨 target 共享。

> 一句话先记住:**Keychain 是 C 风格的 `SecItemAdd/Copy/Update/Delete` 五要素 API,难用、文档差,但安全性是 iOS 之最——硬件加密 + 设备绑定 + 跨 App 锁定。App Group 给主 App / Widget / NotificationServiceExtension 共享 `UserDefaults(suiteName:)` 和文件容器,做"主 App 状态同步到 Widget" 必不可少。**

---

## 一、Keychain 不是 NSUserDefaults

```swift
// ❌ 把 token 放 UserDefaults
UserDefaults.standard.set(token, forKey: "auth_token")
// UserDefaults 是 plist 明文,iOS 越狱 / 备份提取直接看到
```

```swift
// ✅ 放 Keychain
try Keychain.save("auth_token", value: token)
```

Keychain 的特点:
- **硬件加密**:数据用 Secure Enclave 派生的 key 加密,key 不出芯片
- **设备绑定**:数据只在原设备能解,即使备份恢复到新设备某些项也读不出
- **App 隔离**:默认只有本 App 能读自己的 Keychain item
- **iCloud 同步**(可选):用户登录同一 Apple ID,Keychain 自动同步
- **状态绑定**:可以要求"屏幕已解锁时才能读"

代价是 **API 极其难用**——`SecItemAdd` 接 CFDictionary,返回 OSStatus,文档历来糟糕。封一层是必须的。

---

## 二、Keychain Services 五要素

```swift
import Security

enum Keychain {
    enum Error: Swift.Error {
        case unhandledError(OSStatus)
        case notFound
        case duplicate
    }
    
    static func save(_ key: String, value: String, service: String = Bundle.main.bundleIdentifier!) throws {
        let data = value.data(using: .utf8)!
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]
        
        // 先尝试更新
        let updateStatus = SecItemUpdate(
            query as CFDictionary,
            [kSecValueData as String: data] as CFDictionary
        )
        if updateStatus == errSecSuccess { return }
        if updateStatus != errSecItemNotFound {
            throw Error.unhandledError(updateStatus)
        }
        
        // 不存在则新建
        let addStatus = SecItemAdd(query as CFDictionary, nil)
        guard addStatus == errSecSuccess else { throw Error.unhandledError(addStatus) }
    }
    
    static func read(_ key: String, service: String = Bundle.main.bundleIdentifier!) throws -> String {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess else {
            if status == errSecItemNotFound { throw Error.notFound }
            throw Error.unhandledError(status)
        }
        guard let data = item as? Data,
              let str = String(data: data, encoding: .utf8) else {
            throw Error.unhandledError(errSecDecode)
        }
        return str
    }
    
    static func delete(_ key: String, service: String = Bundle.main.bundleIdentifier!) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw Error.unhandledError(status)
        }
    }
}
```

五个核心 API:
- `SecItemAdd`:增
- `SecItemCopyMatching`:查
- `SecItemUpdate`:改
- `SecItemDelete`:删
- 第五要素是查询字典——`kSecClass` 是必填,决定记录类型(`kSecClassGenericPassword` 用于自定义 key-value;`kSecClassInternetPassword` 用于网络凭据)。

---

## 三、kSecAttrAccessible:何时允许访问

Keychain 项可以指定"什么状态下能解密":

| 常量 | 含义 |
| --- | --- |
| `kSecAttrAccessibleWhenUnlocked` | 设备解锁时(默认推荐) |
| `kSecAttrAccessibleAfterFirstUnlock` | 开机后首次解锁,之后即使锁屏也能读(后台任务用) |
| `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` | 同上,但**禁止备份到新设备** |
| `kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly` | 用户必须设了密码,且本机 only |
| `kSecAttrAccessibleAlways` | iOS 9 起 deprecated,不要用 |

**推荐组合**:
- 普通敏感数据(token):`AfterFirstUnlockThisDeviceOnly`
- 极敏感数据(主密钥):`WhenPasscodeSetThisDeviceOnly`
- 后台任务需要(推送注册 token):`AfterFirstUnlock`

**加 `ThisDeviceOnly` 后缀**:iCloud Keychain 不同步,iTunes 备份恢复到新设备也不会带过去。**安全性最高,但用户换手机时这项数据丢**——是否能丢由业务决定。

---

## 四、Touch ID / Face ID 保护的 Keychain 项

```swift
import LocalAuthentication

let access = SecAccessControlCreateWithFlags(
    nil,
    kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
    .biometryCurrentSet,
    nil
)!

let query: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: "MasterKey",
    kSecValueData as String: secretData,
    kSecAttrAccessControl as String: access,
    kSecUseAuthenticationContext as String: LAContext()
]
SecItemAdd(query as CFDictionary, nil)
```

`.biometryCurrentSet` 标志:**当前注册的 Touch ID / Face ID 模板才能解锁**——用户新增指纹后,旧数据自动不可读。这是金融 App 常见的"换指纹要重登"行为。

读取时系统会自动弹 Face ID 提示:

```swift
let context = LAContext()
context.localizedReason = "解锁查看你的私密笔记"

let query: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: "MasterKey",
    kSecReturnData as String: true,
    kSecUseAuthenticationContext as String: context
]
var item: CFTypeRef?
SecItemCopyMatching(query as CFDictionary, &item)
// 系统弹出 Face ID,用户验证后才返回数据
```

---

## 五、iCloud Keychain 同步

加 `kSecAttrSynchronizable: true` 让该项跨用户所有 Apple 设备同步:

```swift
let query: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: "user_profile",
    kSecAttrAccount as String: "displayName",
    kSecValueData as String: data,
    kSecAttrSynchronizable as String: true,
    kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock  // 注意不加 ThisDeviceOnly
]
```

**注意**:
- 加了 Synchronizable 后,查询时也要 `kSecAttrSynchronizable: true`——否则查不到。要查"两种"用 `kSecAttrSynchronizableAny`。
- **不能加 ThisDeviceOnly** 后缀的 accessibility——会矛盾。
- 用户没开 iCloud Keychain 时,数据仍然在本机,只是不同步。

适用场景:用户偏好(可有可无的设置),不适用:token / 密钥(同步过去也没意义,因为绑定到不同设备的 Push token)。

---

## 六、CryptoKit:Swift 原生加密

`CryptoKit`(iOS 13+)替代了老 `CommonCrypto`,API 清爽得多:

```swift
import CryptoKit

// 哈希
let digest = SHA256.hash(data: Data("hello".utf8))
let hex = digest.map { String(format: "%02x", $0) }.joined()

// HMAC
let key = SymmetricKey(size: .bits256)
let mac = HMAC<SHA256>.authenticationCode(for: data, using: key)

// 对称加密(AES-GCM)
let key = SymmetricKey(size: .bits256)
let sealedBox = try AES.GCM.seal(plaintext, using: key)
let ciphertext = sealedBox.combined!         // 包含 IV + tag

let opened = try AES.GCM.open(.init(combined: ciphertext), using: key)
let plain = opened   // Data

// 非对称(Curve25519 / P256)
let privateKey = Curve25519.Signing.PrivateKey()
let publicKey = privateKey.publicKey
let signature = try privateKey.signature(for: message)
let valid = publicKey.isValidSignature(signature, for: message)

// ECDH 协商共享密钥
let aPriv = Curve25519.KeyAgreement.PrivateKey()
let aPub = aPriv.publicKey
let bPriv = Curve25519.KeyAgreement.PrivateKey()
let bPub = bPriv.publicKey

let aShared = try aPriv.sharedSecretFromKeyAgreement(with: bPub)
let bShared = try bPriv.sharedSecretFromKeyAgreement(with: aPub)
// aShared == bShared
```

**实战推荐**:
- 字段加密(笔记内容、用户隐私):AES-GCM,key 存 Keychain
- 签名 / 验签:Curve25519 或 P256(性能好,公钥短)
- 密码哈希:**不要用 SHA256 直接哈希密码**,用 Argon2 或 bcrypt(`CryptoKit` 没提供,但有 `PKCS5.PBKDF2`)

`CryptoKit` 还有 `SecureEnclave` 子模块,把密钥直接生成在 Secure Enclave 里——key 永远不出芯片,签名都在硬件里做:

```swift
let key = try SecureEnclave.P256.Signing.PrivateKey()
let signature = try key.signature(for: data)
// key 本身不能导出,只能用于签名
```

---

## 七、App Group:跨 target 共享

主 App + Widget Extension + Notification Service Extension 都是独立 target,各有沙盒。要共享数据(主 App 写,Widget 读),用 **App Group**:

1. **Xcode → Signing & Capabilities → 加 App Groups,新建一个 group**(命名 `group.com.example.NotesIsland`)
2. **每个需要共享的 target 都启用同一个 App Group**

共享 UserDefaults:

```swift
let defaults = UserDefaults(suiteName: "group.com.example.NotesIsland")!
defaults.set(latestNoteTitle, forKey: "lastNote")

// Widget 端
let defaults = UserDefaults(suiteName: "group.com.example.NotesIsland")!
let title = defaults.string(forKey: "lastNote") ?? ""
```

共享文件:

```swift
let groupURL = FileManager.default.containerURL(
    forSecurityApplicationGroupIdentifier: "group.com.example.NotesIsland"
)!
let dataURL = groupURL.appending(path: "shared.json")
try data.write(to: dataURL)

// Widget 端
let groupURL = FileManager.default.containerURL(
    forSecurityApplicationGroupIdentifier: "group.com.example.NotesIsland"
)!
let data = try Data(contentsOf: groupURL.appending(path: "shared.json"))
```

共享 SwiftData 容器:

```swift
let url = groupURL.appending(path: "NotesIsland.sqlite")
let config = ModelConfiguration(schema: schema, url: url)
let container = try ModelContainer(for: schema, configurations: [config])
```

主 App / Widget 用同一份配置,**SwiftData 自动在两边同步**(主 App 改完 Widget 下次刷新就看到)。这是 Widget 实时数据的标准做法,20 篇展开。

---

## 八、Keychain 也能跨 App Group

```swift
// 主 App 写
let query: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: "shared_token",
    kSecAttrAccessGroup as String: "group.com.example.NotesIsland",  // 关键
    kSecValueData as String: tokenData,
    kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock
]
SecItemAdd(query as CFDictionary, nil)

// Widget 端读(同一个 access group)
let readQuery: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: "shared_token",
    kSecAttrAccessGroup as String: "group.com.example.NotesIsland",
    kSecReturnData as String: true
]
SecItemCopyMatching(readQuery as CFDictionary, &item)
```

`kSecAttrAccessGroup` 让 keychain item 属于一个共享组。**前提**:两个 target 的 `Keychain Access Groups` entitlement 都包含这个组(Xcode 自动加,但要 Apple Developer 账号生成的 provisioning profile)。

---

## 九、Sensitive Content Analysis(iOS 17+)

iOS 17 起,App 可以让系统帮你扫描图像 / 视频是否包含敏感内容(裸露 / 暴力):

```swift
import SensitiveContentAnalysis

let analyzer = SCSensitivityAnalyzer()
let result = try await analyzer.analyzeImage(at: url)
if result.isSensitive {
    showBlurredVersion()
}
```

**Apple 端侧扫描**,内容不离开设备。这是 23 篇 Accessibility 章节的延伸,主要在用户上传 / 接收他人图片场景。

---

## 十、踩坑

1. **token 放 UserDefaults**——明文,iTunes 备份能读,iOS 越狱直接拿。Keychain。
2. **`kSecAttrAccessibleAlways`**——iOS 9 起 deprecated,审核会被警告。用 `AfterFirstUnlock`。
3. **`kSecAttrSynchronizable: true` 没在查询时也带**——查不到。Synchronizable 是匹配条件之一。
4. **Keychain duplicate 反复 add 失败**——用 `SecItemUpdate` 先试,失败再 add。
5. **App 重装后 Keychain 数据还在**——是的,Keychain 项默认不随 App 卸载删除。需要清理时显式 delete。
6. **真机调试 Keychain 偶尔 -34018**——签名 / entitlement 配置问题,clean build + 重 install。模拟器更宽松。
7. **App Group 加了但读不到**——通常是 entitlement 没配对,或者两个 target 用了不同 group ID。
8. **共享 `UserDefaults(suiteName:)` 写完 Widget 立即没看到**——`UserDefaults` 缓存,改完调用 `synchronize()`(虽然 deprecated,有时仍有用),或者用 Darwin notification 通知 Widget reload。
9. **CryptoKit 用 SHA256 哈希密码**——SHA256 不是密码哈希函数,彩虹表能秒拆。密码用 PBKDF2 + salt,或者 Argon2(三方库)。
10. **Secure Enclave key 用于加密**——SE key 只能签名/验签,不能直接加密大数据。用 SE key 派生对称 key,再用对称 key 加密内容。

---

下一篇 `15-UIKit与OC互操作.md`,讲 `UIViewRepresentable` 五要素、`UIViewControllerRepresentable`、`Coordinator` 桥 delegate、`UIHostingController` 把 SwiftUI 嵌入 UIKit、SwiftUI 不存在的能力清单、Bridging Header / `@objc` / NS 类暴露给 Swift 的可空性。
