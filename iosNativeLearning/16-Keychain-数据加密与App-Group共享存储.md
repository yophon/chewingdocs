# 16 Keychain、数据加密与 App Group 共享存储

> 数据层闭环的最后一公里:把"明文不该落盘"和"主 App 与 Widget / Extension 共享同一份数据"这两件事真正落定。本篇默认基线 iOS 18 / Swift 6 / Xcode 16,涉及 iOS 19+ 的 API 单独标注。

---

## 一、机制定位:Keychain、CryptoKit 与 App Group 各管一段

第 14 篇用 `@Model` 把笔记落进了 SwiftData;第 15 篇用 `URLSession.shared.data(for:)` 把云端拉了下来。从用户视角,本地数据已经能存能取了,但**从安全工程视角看,前面 15 篇还有三块结构性窟窿**:

- 用户登录后服务端给的 access token,**绝对不能**写进 `UserDefaults` 或 SwiftData 普通字段,否则越狱设备一份 `.plist` 就裸奔。`UserDefaults` 是明文 `.plist`、SwiftData 是明文 SQLite,两个都是 "App Sandbox 里的文件",对所有能拿到 sandbox 内容的攻击面(越狱、iTunes 备份解密、企业 MDM 抓取)都是透明的。
- 笔记里如果用户勾了"加密日记",`@Model` 持久化到磁盘的二进制必须是密文,不能依赖文件系统 `NSFileProtectionComplete`(那只在锁屏时有效,App 运行中文件是明文映射进内存的,且锁屏时如果 App 正持有打开的文件描述符,文件甚至不会被立即解除映射)。**文件系统加密是兜底,不是业务加密的替代品**。
- NotesIsland 要给 Widget 在桌面展示"最近一条笔记",Widget 本质上是另一个进程,不能跨进程读主 App 的 sandbox。同理 Notification Service Extension、Share Extension、Intents Extension 都是独立 sandbox,要共享数据必须显式声明 App Group。

iOS 的设计是把这三件事**职责切开**:

| 机制 | 解决什么 | 容量 / 性质 |
| --- | --- | --- |
| **Keychain Services** | 极小的高敏感凭据(token、密码、密钥),进程崩溃 / App 卸载 / 还原备份都能可控保留 | 单条目几 KB,数据库存放,系统加密 |
| **CryptoKit** | 对任意业务数据做加密 / 签名 / 哈希,密钥由 Keychain 托管 | 任意大小,API 来自 Apple Silicon Secure Enclave |
| **App Group + `UserDefaults(suiteName:)` / 共享容器** | 主 App ↔ Widget / Notification Service / Share Extension 共享小份配置或文件 | KB ~ MB,真正的"共享文件夹" |

用 UIKit 老 SDK 的同类做法常见的坑:

- 直接 `NSKeyedArchiver.archiveRootObject(_:toFile:)` 把 token 写到 Documents,卸载重装就丢了——其实 Keychain 默认行为是**卸载不清**,刚好相反。Documents 的 plist 不是更安全,只是更脆弱。
- 用第三方"加密 UserDefaults" 库,密钥又硬编码进二进制,等同于没加密。逆向工具 5 分钟就能 dump 出 `static let secret = "..."`,而 Keychain 的密钥永远在 SecureEnclave / 系统 keystore,本地代码层面拿不到。
- Widget 想读主 App 数据,跑去做 URL Scheme 唤起拷贝——iOS 14 之后 WidgetKit 已经给了 `App Group + 共享 ModelContainer` 的正解,主 App 不需要被唤起就能让 Widget 看到最新数据。
- 把 "加密" 等价于 "Base64 / XOR / RC4"——三者都不是加密。XOR 同 key 同明文输出可预测,RC4 早被 RFC 7465 禁用。NotesIsland 任何"我自己写一个加密"的诱惑都该被压住,直接走 CryptoKit。

本篇要把这三件事按 NotesIsland 的需要,**一个工程实现里**串起来:登录 token 进 Keychain;笔记草稿在 App Group 共享;敏感日记体用 CryptoKit AES-GCM 加密后落 SwiftData。底层目标是:**离开本机的任何拷贝(iCloud 备份、设备迁移、抓包导出 .sqlite)都是密文或受 Keychain 控制的句柄,而不是明文业务数据。**

---

## 二、Apple 平台心智

### 2.1 Keychain Services 的五要素

Keychain 不是文件,而是**系统级 SQLite-like 数据库**,落在 `/private/var/Keychains/`,App 通过 `Security` framework 的 C API 访问(Swift 里大量裸 `CFDictionary`,所以一般要封一层)。数据库本身由 securityd 守护进程托管,App 进程通过 XPC 询问 securityd,密钥材料根本不进入 App 进程地址空间——这是它与"把密文写到 sandbox 里的某个 plist"在威胁模型上的根本差别。

一条记录由 5 个核心 attribute 组成:

| 字段 | 含义 | 典型值 |
| --- | --- | --- |
| `kSecClass` | 条目类别 | `kSecClassGenericPassword`(通用)、`kSecClassInternetPassword`(网络)、`kSecClassKey`(对称/非对称密钥)、`kSecClassCertificate` |
| `kSecAttrService` | 命名空间,一般是反域名 | `"com.yophon.notesisland.auth"` |
| `kSecAttrAccount` | 同一个 service 下的唯一 key | `"accessToken"` |
| `kSecValueData` | 实际数据,`Data` 类型 | `Data(token.utf8)` |
| `kSecAttrAccessible` | 何时可读 | 见下表 |

`kSecAttrAccessible*` 决定数据**何时**能解密,关键差异:

| 常量 | 含义 | 备份后 restore 到新设备能读到吗 |
| --- | --- | --- |
| `kSecAttrAccessibleWhenUnlocked` | 解锁后可读(默认推荐) | 能 |
| `kSecAttrAccessibleAfterFirstUnlock` | 首次解锁后,即使再次锁屏也能读(后台任务、推送) | 能 |
| `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` | 解锁后可读,**不可迁移** | 不能 |
| `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` | 首次解锁后可读,不可迁移 | 不能 |
| `kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly` | 设备必须设了 passcode 才能写入,不可迁移 | 不能(且无 passcode 时连写都写不进) |

后台推送解密 token、APNs token 这种**要在锁屏时也能读**的,必须 `AfterFirstUnlock` 系列;用户主动登录的会话 token 用 `WhenUnlocked`。"ThisDeviceOnly" 后缀决定 iCloud 备份恢复或换机迁移时是否带过去——对于 Sign in with Apple 这类账号体系,**带过去**才符合用户预期;对于设备指纹一类纯本机派生的密钥,必须 `ThisDeviceOnly`。

一个细节常被忽视:这五个 `Accessible` 等级只决定**读时**机的下限,**写**永远要求设备至少首次解锁过一次(否则系统密钥袋 (keybag) 还没解开,任何写入都会失败)。表现就是:首次开机锁屏阶段,即使你的代码在 background URLSession 回调里跑,任何 `SecItemAdd` 都会拿到 `errSecInteractionNotAllowed`。让 token 入库这一步,**要么挪到用户解锁后,要么在 didFinishLaunching 后再触发**,不要塞到推送启动这种"首次解锁前"的入口。

还有一个 attribute 经常和 accessibility 搞混:`kSecUseDataProtectionKeychain`。在 macOS 上,如果不设这个 flag,Keychain 默认走 macOS 风格(file-based);iOS 上不需要,但写"macOS Catalyst 共用代码"时要显式 `true`,否则 token 会落到 macOS login keychain,语义完全不一样。

四个核心 C API:`SecItemAdd` / `SecItemCopyMatching` / `SecItemUpdate` / `SecItemDelete`。Swift 里调用都是 `(query: CFDictionary, ...) -> OSStatus`,返回 `errSecSuccess` (`0`) 才算成功,常见错误:

- `errSecDuplicateItem` (`-25299`):已存在,需要先 update 或 delete。
- `errSecItemNotFound` (`-25300`):查不到。
- `errSecAuthFailed` (`-25293`):未通过 LocalAuthentication(配了 `SecAccessControl`)。
- `errSecInteractionNotAllowed` (`-25308`):在 Accessible 设的不对的状态下读(比如锁屏读 `WhenUnlocked`)。

### 2.2 iCloud Keychain 同步

只需要在 query 里加 `kSecAttrSynchronizable: true`,系统会把这条记录同步到用户 Apple ID 下其他设备(前提:**accessible 不能带 ThisDeviceOnly**)。同步是端到端加密的,Apple 自己也看不到内容。NotesIsland 的"账号 token + 服务器侧 refresh token"放进去之后,用户换手机不用重新登录;但"本机派生的加密密钥"绝对不能同步——一旦换机后密钥跟着走,本机加密的 SwiftData 就成了密文垃圾(它的真实加解密路径在第三节展开)。

同步走的是端到端加密的 CKKS (CloudKit Keychain Sync),底层走 SEP 和 iCloud。它有几个性格特点要预先知道:

1. **不立即**。同步可能滞后几秒到几分钟,在线上做"登录后换机立刻能读"的体验承诺时要给降级方案(发现 Keychain 里没读到,提示用户重登一次)。
2. **批量行为**。一次写 100 条同步条目跟写 1 条延迟差不多,但**不要**为了"省同步带宽"把多个字段塞进一个 `kSecValueData` 里——后续要更新某一个字段会引发整条 re-sync,得不偿失。
3. **冲突解决是 last-write-wins**。两台设备同时改同一条 token,云端只保留时间戳更晚的;业务上 token 这种本来就要重新刷新的字段没影响,但如果硬塞业务数据进 Keychain 做"免费同步",会被坑。
4. **`synchronizable=true` 与 `synchronizable=false` 是两条记录**。同一个 service+account 下用不同 `synchronizable` 各存一份,SecItemCopyMatching 默认只查 `false`,要查同步那条要在 query 里显式加 `kSecAttrSynchronizable: kSecAttrSynchronizableAny` 或 `true`。

### 2.3 CryptoKit 心智

Swift 5.1 引入 `import CryptoKit`,iOS 13+。它把 BoringSSL 那一套裹成强类型 API,核心三类:

- **对称加密**:`SymmetricKey` + `AES.GCM.seal/open` / `ChaChaPoly.seal/open`。日常笔记加密就用 `AES.GCM`,自带 authentication tag,改一字节就解不开,免去手动配 HMAC。`AES.GCM.SealedBox` 提供 `combined`(`nonce || ciphertext || tag` 拼好的 `Data`)与拆分版,落盘存 `combined` 即可。
- **非对称**:`Curve25519.Signing.PrivateKey`(签名)、`Curve25519.KeyAgreement.PrivateKey`(密钥协商)、`P256.Signing.PrivateKey`(ECDSA on NIST P-256,**P256 可以放进 Secure Enclave**,Curve25519 不行)。NotesIsland 的"端到端共享笔记"功能未来要做,需要 ECDH 协商出对称密钥,这一段就用 `Curve25519.KeyAgreement`。Secure Enclave 派生的密钥永远不出芯片,签名 / 协商通过 SE 调用完成。
- **哈希**:`SHA256.hash(data:)` / `SHA384` / `SHA512`,签名时常和 `Curve25519.Signing` 配套(其内部已经 SHA-512 + EdDSA)。文件指纹、增量同步对账常用。Apple 同时提供了 `Insecure.MD5` / `Insecure.SHA1`,**只为兼容老协议**,真用到了一定不要做密码学决策。

`SymmetricKey` 本身不能直接落盘,它是不透明的 `ContiguousBytes`;真要持久化,提取 `.withUnsafeBytes { Data($0) }` 写进 Keychain 的 `kSecValueData`。生成 256-bit 随机密钥就是 `SymmetricKey(size: .bits256)`,内部走 `SecRandomCopyBytes`,熵质量由系统保证,不要拿 `arc4random` / `Int.random(in:)` 当密钥源。

为什么默认推 `AES.GCM` 而不是 `AES.CBC + HMAC`?

1. GCM 自带 authentication tag,密文一旦被篡改解密直接失败,不需要再额外 HMAC。
2. GCM 使用 12-byte nonce,**绝对不能重用**,但 CryptoKit 默认每次 `seal` 自动生成随机 nonce,工程上不出错。
3. CBC 需要 padding(PKCS#7),padding oracle 类攻击历史悠久,GCM 没有这个面。

什么时候会反过来选 `ChaChaPoly`?旧设备(无 AES 硬件)或纯软件实现性能场景。iOS 设备从 iPhone 5s 起所有 SoC 都有 AES 硬件加速,**默认选 AES-GCM 就对**。

### 2.4 App Group

在 Apple Developer 后台勾上 App Group identifier(必须以 `group.` 开头,例如 `group.com.yophon.notesisland`),然后在主 App、Widget Extension、Notification Service Extension 三个 target 的 Signing & Capabilities 都勾上同一个 group。**别忘了在 Provisioning Profile 里也开**,否则真机一跑 `FileManager.default.containerURL(forSecurityApplicationGroupIdentifier:)` 返回 `nil`。Xcode 16 的 automatic signing 通常会自动 regenerate provisioning profile,但 CI 上的 manual signing 一定要手工 refresh,**不少线上事故就是 CI 出的包 App Group 没开**。

三种共享路径:

1. **`UserDefaults(suiteName: "group.com.yophon.notesisland")`**:小份键值对(用户偏好、最近一次同步时间)。读写都是 atomic plist,跨进程一致性靠 KVO 通知。
2. **共享容器目录** `FileManager.default.containerURL(forSecurityApplicationGroupIdentifier:)`:可以放整个文件夹,SwiftData 的 `ModelContainer` 也能配置成共享 store。注意 App Store 审核会看共享容器里有没有放敏感数据未加密——一切笔记体仍然要走 CryptoKit 加密。
3. **共享 SwiftData 容器**:`ModelContainer(for:..., configurations: ModelConfiguration(url: groupURL.appending(path: "Notes.store")))`,主 App 写、Widget 读同一份 `.store`。**共享 Keychain Access Group** 也是一种共享:`kSecAttrAccessGroup` 设成 `"$(AppIdentifierPrefix)group.com.yophon.notesisland"`(注意要带 team prefix),Widget 和主 App 就能读到同一条 Keychain 记录,而不是各存各的。

跨进程并发写需要小心:WidgetKit 在 timeline 触发时是只读访问,主 App 写完应当 `WidgetCenter.shared.reloadAllTimelines()`,而不是让 Widget 反过来写。如果两个 Extension(NSE 与主 App)都要写,优先按"主 App 是唯一写者,Extension 通过 App Intent 反向触发主 App 操作"的架构走,工程复杂度比 `NSFileCoordinator` 加各种文件锁低一个数量级。

### 2.5 Keychain 与 Swift 6 严格并发

`Security` framework 的 `SecItemAdd` 等是线程安全的(底层走 securityd XPC),所以包装类不需要 actor。但凭据这种状态在多入口被读取(应用启动、推送 service、Widget timeline),封一个 `actor TokenStore` 防止"读到一半被覆盖"是合理的取舍。`SecAccessControl` 涉及 `LAContext`,LAContext **不是 Sendable**,所以认证路径要在调用点局部构造,不要跨 actor 传。

把封装设计成 `actor` 还有一个额外好处:Swift 6 的严格并发会要求 `TokenVault` 内部所有方法必须 `await`,这反过来在调用方留下了"现在我在做 IO,不要在 UI 主路径上同步阻塞"的代码记号——读者一眼能看到 `try await TokenVault.shared.current()` 与一个普通的 `defaults.string(forKey:)` 的语义差别。这种"通过类型系统传递工程意图"是 Swift 6 严格并发最具价值的副产物之一。

如果某些路径(比如纯本机 logger 上下文)真的不想 await,可以再封一个 `nonisolated func currentHexFingerprint() -> String?`,只读一个不敏感的字段(比如 token 的 SHA256 前 8 字节),内部走 Keychain 同步 API。要点是:**默认走 actor,例外走 nonisolated 并且名字带语义**,不要反过来。

---

## 三、工程实现

下面这段代码在 Xcode 16、Swift 6 严格并发(`SwiftSettings.swiftLanguageMode(.v6)`)下可以直接编过,无 `@unchecked Sendable`,无 force unwrap。

### 3.1 Keychain 封装

```swift
// File: Core/Security/KeychainStore.swift
import Foundation
import Security

// MARK: - 错误模型
enum KeychainError: Error, Equatable, Sendable {
    case unhandled(OSStatus)
    case decodeFailed
}

// MARK: - 访问级别(对外只暴露语义,不让调用方自己拼 CFString)
enum KeychainAccessibility: Sendable {
    case whenUnlocked
    case afterFirstUnlock
    case whenUnlockedThisDeviceOnly
    case afterFirstUnlockThisDeviceOnly

    var rawValue: CFString {
        switch self {
        case .whenUnlocked:                     return kSecAttrAccessibleWhenUnlocked
        case .afterFirstUnlock:                 return kSecAttrAccessibleAfterFirstUnlock
        case .whenUnlockedThisDeviceOnly:       return kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        case .afterFirstUnlockThisDeviceOnly:   return kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        }
    }
}

// MARK: - Keychain 通用密码条目
struct KeychainItem: Sendable {
    let service: String
    let account: String
    let accessGroup: String?         // App Group 共享 Keychain 时填 "$(AppIdentifierPrefix)group.com.yophon.notesisland"
    let accessibility: KeychainAccessibility
    let synchronizable: Bool         // 是否同步到 iCloud Keychain
}

// MARK: - 仓库
actor KeychainStore {
    static let shared = KeychainStore()

    func save(_ data: Data, for item: KeychainItem) throws {
        var query = baseQuery(for: item)
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = item.accessibility.rawValue
        query[kSecAttrSynchronizable as String] = item.synchronizable

        let status = SecItemAdd(query as CFDictionary, nil)
        switch status {
        case errSecSuccess:
            return
        case errSecDuplicateItem:
            try update(data, for: item)
        default:
            throw KeychainError.unhandled(status)
        }
    }

    func read(for item: KeychainItem) throws -> Data {
        var query = baseQuery(for: item)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var ref: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &ref)
        guard status == errSecSuccess else { throw KeychainError.unhandled(status) }
        guard let data = ref as? Data else { throw KeychainError.decodeFailed }
        return data
    }

    func delete(for item: KeychainItem) throws {
        let status = SecItemDelete(baseQuery(for: item) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.unhandled(status)
        }
    }

    // MARK: - 私有
    private func update(_ data: Data, for item: KeychainItem) throws {
        let query = baseQuery(for: item)
        let attrs: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: item.accessibility.rawValue
        ]
        let status = SecItemUpdate(query as CFDictionary, attrs as CFDictionary)
        guard status == errSecSuccess else { throw KeychainError.unhandled(status) }
    }

    private func baseQuery(for item: KeychainItem) -> [String: Any] {
        var q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: item.service,
            kSecAttrAccount as String: item.account
        ]
        if let group = item.accessGroup {
            q[kSecAttrAccessGroup as String] = group
        }
        return q
    }
}
```

### 3.2 业务层:Token 与笔记密钥

```swift
// File: Features/Auth/TokenVault.swift
import Foundation

// MARK: - 凭据语义层
struct AuthToken: Sendable, Codable {
    let accessToken: String
    let refreshToken: String
    let expiresAt: Date
}

actor TokenVault {
    static let shared = TokenVault()

    private let item = KeychainItem(
        service: "com.yophon.notesisland.auth",
        account: "session",
        accessGroup: nil,                    // session 不需要共享给 Widget
        accessibility: .afterFirstUnlock,    // 后台推送也要能读
        synchronizable: true                 // 换机后免重登
    )

    func save(_ token: AuthToken) async throws {
        let data = try JSONEncoder().encode(token)
        try await KeychainStore.shared.save(data, for: item)
    }

    func current() async throws -> AuthToken {
        let data = try await KeychainStore.shared.read(for: item)
        return try JSONDecoder().decode(AuthToken.self, from: data)
    }

    func clear() async throws {
        try await KeychainStore.shared.delete(for: item)
    }
}
```

```swift
// File: Features/Notes/NoteCipherKeyStore.swift
import Foundation
import CryptoKit

// MARK: - 本机派生的笔记主密钥(绝不上 iCloud)
actor NoteCipherKeyStore {
    static let shared = NoteCipherKeyStore()

    private let item = KeychainItem(
        service: "com.yophon.notesisland.cipher",
        account: "noteMasterKey.v1",
        accessGroup: "group.com.yophon.notesisland",  // Widget 也要解密展示
        accessibility: .afterFirstUnlockThisDeviceOnly,
        synchronizable: false
    )

    func loadOrCreate() async throws -> SymmetricKey {
        do {
            let raw = try await KeychainStore.shared.read(for: item)
            return SymmetricKey(data: raw)
        } catch KeychainError.unhandled(let status) where status == errSecItemNotFound {
            let key = SymmetricKey(size: .bits256)
            let raw = key.withUnsafeBytes { Data($0) }
            try await KeychainStore.shared.save(raw, for: item)
            return key
        }
    }
}
```

### 3.3 CryptoKit:AES-GCM 加密笔记体

```swift
// File: Core/Security/NoteCipher.swift
import Foundation
import CryptoKit

// MARK: - 笔记加密体:落盘的是 sealed.combined,内含 nonce + ciphertext + tag
struct NoteCipher: Sendable {
    let key: SymmetricKey

    func seal(_ plaintext: String) throws -> Data {
        let box = try AES.GCM.seal(Data(plaintext.utf8), using: key)
        // combined: nonce(12) || ciphertext || tag(16)
        guard let combined = box.combined else { throw CryptoKitError.underlyingCoreCryptoError(error: -1) }
        return combined
    }

    func open(_ ciphertext: Data) throws -> String {
        let box = try AES.GCM.SealedBox(combined: ciphertext)
        let data = try AES.GCM.open(box, using: key)
        guard let text = String(data: data, encoding: .utf8) else {
            throw CryptoKitError.authenticationFailure
        }
        return text
    }
}
```

### 3.4 与 SwiftData 集成

```swift
// File: Features/Notes/SecureNote.swift
import Foundation
import SwiftData
import CryptoKit

@Model
final class SecureNote {
    var id: UUID
    var createdAt: Date
    /// 永远是密文;明文只在 view model 临时缓存
    var ciphertext: Data

    init(id: UUID = UUID(), createdAt: Date = .now, ciphertext: Data) {
        self.id = id
        self.createdAt = createdAt
        self.ciphertext = ciphertext
    }
}

// MARK: - View model:统一拿主密钥,统一加解密
@MainActor
@Observable
final class SecureNoteEditor {
    var plaintext: String = ""
    private var cipher: NoteCipher?

    func bootstrap() async throws {
        let key = try await NoteCipherKeyStore.shared.loadOrCreate()
        self.cipher = NoteCipher(key: key)
    }

    func makeModel() throws -> SecureNote {
        guard let cipher else { fatalError("call bootstrap() first") }
        let cipherData = try cipher.seal(plaintext)
        return SecureNote(ciphertext: cipherData)
    }

    func load(_ note: SecureNote) throws {
        guard let cipher else { return }
        plaintext = try cipher.open(note.ciphertext)
    }
}
```

### 3.5 App Group:共享给 Widget 的"最近一条"

```swift
// File: Core/Sharing/SharedStore.swift
import Foundation
import WidgetKit

// MARK: - 共享状态:小份摘要,放进 App Group 的 UserDefaults
struct LatestNoteSummary: Codable, Sendable {
    let id: UUID
    let title: String
    let updatedAt: Date
}

enum SharedStore {
    static let appGroup = "group.com.yophon.notesisland"
    static let key = "latestNoteSummary"

    static var defaults: UserDefaults {
        // Swift 6 下 force unwrap 是红线,这里走显式失败路径
        guard let d = UserDefaults(suiteName: appGroup) else {
            preconditionFailure("App Group 未配置或 entitlement 未启用: \(appGroup)")
        }
        return d
    }

    static func publish(_ summary: LatestNoteSummary) {
        if let data = try? JSONEncoder().encode(summary) {
            defaults.set(data, forKey: key)
            WidgetCenter.shared.reloadTimelines(ofKind: "LatestNoteWidget")
        }
    }

    static func read() -> LatestNoteSummary? {
        guard let data = defaults.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(LatestNoteSummary.self, from: data)
    }
}
```

```swift
// File: Widgets/LatestNoteWidget.swift
import WidgetKit
import SwiftUI

struct LatestNoteEntry: TimelineEntry {
    let date: Date
    let summary: LatestNoteSummary?
}

struct LatestNoteProvider: TimelineProvider {
    func placeholder(in context: Context) -> LatestNoteEntry {
        LatestNoteEntry(date: .now, summary: nil)
    }
    func getSnapshot(in context: Context, completion: @escaping (LatestNoteEntry) -> Void) {
        completion(LatestNoteEntry(date: .now, summary: SharedStore.read()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<LatestNoteEntry>) -> Void) {
        let entry = LatestNoteEntry(date: .now, summary: SharedStore.read())
        completion(Timeline(entries: [entry], policy: .never))
    }
}
```

主 App 里在 `SwiftData` 的 `@Model` 写入完成之后调用 `SharedStore.publish(...)`,Widget 在下次刷新时就能看到。注意 Widget 这里读的是**摘要**(标题、更新时间),笔记**密文**不会进 Widget——Widget 不需要展示明文,真要展示也应该走和主 App 同一份 `NoteCipherKeyStore`(已经通过 `accessGroup` 共享)。

为什么把摘要存进 `UserDefaults` 而不是直接让 Widget 读 SwiftData?两个原因:

1. **冷启动成本**:Widget timeline 刷新对 CPU / 内存非常敏感(系统给 Widget 的预算只有几秒、几十 MB),启动一整个 `ModelContainer` 是"重型操作",而读一份 plist 是 microsecond 级。
2. **依赖最小化**:Widget 进程不需要 link 全套 SwiftData / NoteCipher / 业务层 framework,链得越多冷启动越慢。摘要走值类型 + Codable,Widget target 只需要 link Foundation 与 WidgetKit。

如果就是要在 Widget 里展示笔记完整内容(比如"今天的日记"),才会让 Widget link `NoteCipher` + `NoteCipherKeyStore`,通过 App Group 共享的 Keychain Access Group 读到主密钥,再解密 SwiftData 里的密文 —— 此时摘要里只需要存 `noteId`,真正的解密发生在 Widget 端。这个路径上严格并发要求 `NoteCipherKeyStore` 的 actor 隔离能跨进程"重新实例化"(它本身就是 stateless 的,只是封装了 Keychain 访问,所以没问题)。

---

## 四、调参与验收

### 4.1 关键参数怎么选

| 取舍点 | 默认推荐 | 何时换 |
| --- | --- | --- |
| `kSecAttrAccessible` | `WhenUnlocked` | 后台推送/Notification Service 解密 → `AfterFirstUnlock`;本机派生密钥 → 加 `ThisDeviceOnly` |
| `kSecAttrSynchronizable` | 跟随账号(`true`) | 设备绑定密钥(SecureEnclave 派生、本机数据加密) → `false` |
| AES 算法 | `AES.GCM`(128/192/**256-bit**) | 与既有 OpenSSL 协议互通 → `AES.GCM` 用 12-byte nonce;只签不加密 → `HMAC<SHA256>` |
| 非对称密钥保存 | `SecKey` + Secure Enclave(P256) | 需要跨设备 → Curve25519 + Keychain `synchronizable` |
| App Group key | `group.<reverse-domain>` | iOS 真机必须在 Provisioning Profile 同步开启 |
| Keychain Access Group | 仅主 App | Widget / NSE 也要解密 → `"$(AppIdentifierPrefix)group.<domain>"` |
| 笔记 ciphertext 落 SwiftData | `Data` 字段 + AES-GCM combined | 大附件 → 单独文件落 App Group 容器,字段只存路径 + tag |
| 密钥旋转 | `account` 加 `.v1` 后缀 | 旋转时 `account = .v2`,ciphertext 头插一个 version byte |

特别想强调"密钥旋转"这件事:NotesIsland 是本地优先 + iCloud 同步,真出了 token 泄露或主密钥泄露,**不能**就地覆盖旧密钥——旧密文还在云端 / 备份 / iCloud Keychain,你需要的是新密钥并存,后台逐步把旧密文解开后用新密钥重封,迁移完毕再回收旧密钥。所以从工程第一天起就把 `account` 命名带版本号,并预留 ciphertext 头部 1 字节存版本——这是廉价的、未来一定会感谢现在的设计。

### 4.2 真机 vs 模拟器

- 模拟器上 Keychain **共享给同一个 macOS 用户**下所有模拟器实例,而不是 sandbox 严格隔离。所以在模拟器看到"卸载重装数据还在",别得意,真机才是 sandbox。
- 模拟器的 iCloud Keychain 同步通常拿不到结果,要测同步必须在两台真机或两个 Apple ID 已配对的 sandbox 账户里验。
- `Secure Enclave` 在模拟器上是**模拟**实现,密钥实际落在文件里,不能用作"真机才能解密"的产品承诺(比如设备绑定的 license);上线前必须真机验。
- 模拟器对 `kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly` 的支持依赖宿主 Mac 的"是否设了 macOS 密码",这点跟真机的"iOS 用户是否设了锁屏密码"语义不同,验收要在真机重做。
- 模拟器的 `App Group` 容器路径形如 `~/Library/Developer/CoreSimulator/Devices/<UUID>/data/Containers/Shared/AppGroup/<GroupUUID>`,可以直接 `cd` 进去看文件;真机上拿不到 sandbox 路径(除非用 `Devices and Simulators → Download Container`)。

### 4.3 验收步骤

1. **TokenVault 落地**:登录后调用 `TokenVault.shared.save(token)`,杀进程重启,`current()` 仍返回原 token。
2. **AfterFirstUnlock 验证**:把 token accessibility 改回 `whenUnlocked`,设备锁屏后让推送 Notification Service Extension 读 token,会拿到 `errSecInteractionNotAllowed`。改回 `afterFirstUnlock` 后正常。
3. **AES-GCM 改一字节**:在 `SecureNote.ciphertext` 里手工把第 20 字节翻一位(可在 Xcode debugger 里改),`NoteCipher.open` 应抛 `CryptoKitError.authenticationFailure`,这就是 GCM 的 tag 校验在生效。
4. **App Group 验收**:主 App 新建一条笔记,Widget 在 10s 内刷新展示最新标题;再把 Provisioning Profile 里 App Group 取消勾选,跑真机看 `containerURL(...)` 返回 `nil` 复现失败路径。
5. **iCloud Keychain 同步**:同一个 Apple ID 的两台 iPhone,设备 A 登录后,设备 B 启动 NotesIsland 应能直接拿到 token(等待 1~5 分钟)。

### 4.4 单元测试小贴士

Swift Testing(`import Testing`)对 Keychain 不太友好——CI 容器里的 securityd 不一定可用。把 `KeychainStore` 抽出一个 `protocol KeychainStoring`,测试时注入内存版,真实环境用 `KeychainStore.shared`;`NoteCipher` 单元测试可以完全离线,直接对 `SymmetricKey(size: .bits256)` 做 `seal/open` 回路。

更细的几个测试角度:

1. **AES-GCM 反向验证**:`seal` 出来的密文给同一个 key 能解,给一个新 key 必须抛 `authenticationFailure`;改第 5 字节也必须抛。这两条覆盖到了 GCM 的 confidentiality 与 integrity。
2. **Nonce 唯一性**:不需要写测试,CryptoKit 默认随机 nonce;但可以加一条覆盖率测试:连续 seal 同一明文 N 次,得到的密文两两不同。
3. **Keychain 内存版的语义**:不只是 add/read/delete,还要覆盖 `errSecDuplicateItem` 的 add → update fallback 路径,以及 `errSecItemNotFound` 的 delete 不抛 path。这两个分支线上最容易踩。
4. **App Group 测试**:Xcode 单元测试 host 通常没有完整 entitlement,`UserDefaults(suiteName:)` 会返回一个临时实例。要测真实跨进程,做集成测试:用 `XCUITest` 走主 App + Widget,观察 Widget 显示是否在主 App 写入后变化。

---

## 五、踩坑

### 5.1 Swift 5 / iOS 16 旧教程会教你的几件错事

1. **"用 `NSUserDefaults` 加密字符串就行"**:错。`UserDefaults` 没有任何加密,它就是 `.plist`。Token 永远走 Keychain。即使 plist 文件本身在 Data Protection 之下,也保护不住"App 进程地址空间内的明文"——任何能附加 lldb 的攻击者瞬间 dump。
2. **"`SecItemAdd` 失败就 retry 三次"**:错。`errSecDuplicateItem` 要走 `SecItemUpdate`,不是 retry;`errSecAuthFailed` 是 `SecAccessControl` 设了 biometry 但用户取消,需要 UI 提示重试,不能静默循环。`errSecMissingEntitlement` (`-34018`) 不是网络问题,是 entitlement 没配,retry 一万次也不会变好。
3. **"自己拼 AES 加 HMAC"**:不要再写了。`AES.GCM` 一次性解决 confidentiality + integrity;手写 AES-CBC + HMAC-SHA256 的方式在 CryptoKit 时代纯属增加被审计的攻击面。Apple 公司内部代码审计、App Store Review 都会对"自卷加密"打回。
4. **`kSecAttrAccessibleAlways`**:已废弃,Xcode 16 编译会给 deprecated warning。用 `AfterFirstUnlock` 替代。
5. **"Keychain 卸载 App 会清空"**:**不会**,默认 keep。iOS 10.3 起官方明确卸载不清,如果你确实希望卸载清空,需要在 App 首次启动时检测安装标志(用 `UserDefaults` 写个标志位,首次启动若读不到就把 Keychain 主动清掉)。
6. **"密码哈希用 MD5 / SHA1 加盐就够"**:错。`CryptoKit` 没有把 MD5/SHA1 列入 `Insecure` 之外是有原因的——它们能算 hash 但不该用于密码学决策。**密码哈希**走 `Argon2id` / `bcrypt` / `scrypt`(CryptoKit 还没原生提供,需要走 CryptoSwift 或 CommonCrypto 的 `CCKeyDerivationPBKDF`);**数据完整性**才用 SHA256。
7. **"`CC_SHA256` 比 `SHA256.hash(data:)` 快"**:工程上无可感知差别,但 CommonCrypto API 不是 Sendable-friendly,Swift 6 严格并发下不要再用。

### 5.2 Swift 6 严格并发踩坑

- `LAContext`、`SecKey`、`CFTypeRef` 都不是 `Sendable`。**不要**把它们存进 `actor` 的存储属性,只在方法局部作用域里用,用完即丢。Xcode 16 严格并发模式下会在编译期给出 `'XXX' is non-Sendable type and cannot be sent across actor boundaries` 错误,不会被漏掉。
- `SecItemCopyMatching` 是同步阻塞调用,如果在 `@MainActor` 上直接 await 会阻主线程?其实它本身不慢(Keychain 是本地 XPC,亚毫秒),但把它放进 `actor` 之外的非 isolated 函数里更稳妥;放 `actor KeychainStore` 是为了**写顺序**,不是为了把它推下主线程。
- `SymmetricKey` 在 CryptoKit 里是 `Sendable`,可以安全传递;但提取出 `Data` 后再传,要避免明文密钥跨 actor 留痕,**用完即销毁引用**。Swift 没有显式的"zeroize",但避免把密钥 `Data` 放进 `@Observable` / `@State` / 长生命周期 actor 字段是基本卫生。
- `actor TokenVault` 在登录路径上常被多入口并发调用(主 App 启动后取 token、Notification Service Extension 解密时也要 token、Widget 刷新时也要 token)。`actor` 串行化保证不会读到半成品,但**也意味着延迟会被排队**——如果某次调用网络重试 30 秒,后面所有 `current()` 都被卡住。NotesIsland 的修法是把"网络刷新 token"挪出 actor,只保留 Keychain 读写在 actor 内。

### 5.3 iOS 18 / iOS 19+ 差异

- iOS 18 起,`@AppStorage("xxx", store: UserDefaults(suiteName:))` 已经完全支持 App Group 自动跨进程刷新,主 App 改完 Widget 不必额外 reload(WidgetKit 的 timeline 还是要 reload,但 SwiftUI 视图层会跟着 KVO 走)。
- **iOS 19+** 推出的"Secure Enclave 永久密钥句柄"(`SecKey` + `kSecAttrTokenID` 改进路径)能让对称密钥 wrap 在 SE 里再落 Keychain,本质上密钥永远不出 SE。降级方案:在 iOS 18 上还是 256-bit 随机对称密钥进 Keychain,牺牲一点"密钥不离开 SE"的硬保证。
- **iOS 17.2+** 的 Push to Start Live Activity 用到的 token,本质上和 APNs token 是同一套,放 Keychain 的 accessibility 必须是 `AfterFirstUnlock`,否则锁屏来的远程 push 会因为没法读到 token 而启动失败(下一篇推送会展开)。
- **iOS 18 SDK** 给 `SwiftData` 的 `ModelConfiguration` 加了 `groupAppContainerIdentifier:` 便利初始化,可以一行拼好共享 store 的 URL,不用再手工 `containerURL(...).appending(path:)`。如果工程已经升到 iOS 18 SDK,优先用新构造器,语义更清晰、跨 target 不容易拼错路径。
- **iOS 19+** 计划进一步限制 App Group 容器的大小阈值(超阈值会触发系统级告警),NotesIsland 的"完整笔记附件"不要丢到 App Group 容器里,而是放主 App 的 Documents 下,Widget 需要展示缩略图时通过共享缓存目录单独投递。

### 5.4 与 Stack Overflow 老答案的差异

- 老答案常推 `KeychainAccess`、`Locksmith`、`SwiftKeychainWrapper` 等三方库。2026 年的 NotesIsland 工程没必要——本篇 80 行已经包住核心 CRUD,引入三方还得对它们做 Privacy Manifest 校验(第 20 篇会展开),性价比下降。
- 老答案教 "App Group 共享 SwiftData",经常给的是 Core Data 写法(`NSPersistentContainer(name:)` + `appendingPathComponent(...)`)。iOS 17+ 直接用 `ModelConfiguration(url:)` 一行搞定,**别再去自己拼 `.sqlite` 路径**。
- 老答案"用 App Group + `NSFileCoordinator` 做并发写入"。WidgetKit 时代主 App 是唯一写者,Widget 只读,**不需要** `NSFileCoordinator`;真要双写,优先升级架构(把 Widget 的写入需求挪到 App Intent 反向触发主 App 写),而不是引入文件锁。
- 老答案用 `kSecAttrAccessibleAlwaysThisDeviceOnly`,xcode 16 编译会 deprecated;替代是 `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`,语义上"首次解锁后可用,锁屏不影响",对推送场景刚刚好。
- 老答案让你"自己实现密钥旋转",示例代码把旧密钥保留然后某个 flag 决定用哪个。**密钥旋转应当版本化**:Keychain 里 account 用 `noteMasterKey.v1` / `.v2`;加密后的 `SecureNote` 在 ciphertext 头里多一个 1-byte version,解密时按版本号选对应密钥。CryptoKit 给的 sealed box `combined` 字段是固定 `nonce || ct || tag`,自己加 version byte 时记得把它从 ciphertext 外面包一层。

---

## 六、本篇位置回顾

把 NotesIsland 的安全闭环画一下:

```
[UI 输入明文笔记]
   ↓ SecureNoteEditor.bootstrap()
[NoteCipherKeyStore]  ← Keychain (AfterFirstUnlockThisDeviceOnly, App Group)
   ↓ SymmetricKey
[NoteCipher (AES-GCM)]
   ↓ ciphertext: Data
[@Model SecureNote]    ← SwiftData (本地优先 + iCloud 同步)
   ↓ 摘要 publish
[App Group UserDefaults]
   ↓
[Widget TimelineProvider 读取]   ← 解密用同一份 NoteCipherKeyStore
```

服务端鉴权这条线:

```
[Sign in 完成]
   ↓
[TokenVault (Keychain, AfterFirstUnlock, synchronizable=true)]
   ↓
[URLSession adapter 注入 Authorization header]
   ↓
[换机 / 重装] → iCloud Keychain 同步 → 新机直接登录态
```

到这一篇,NotesIsland 的"凭据安全 + 业务数据加密 + 跨进程共享"三块已经齐了。下一篇进入第五层:UIKit / Objective-C 互操作,把 SwiftUI 还覆盖不到的能力(KVO、AVCaptureSession 的某些回调、旧 SDK)桥接进来。
