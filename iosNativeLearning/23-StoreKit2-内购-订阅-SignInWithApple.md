# 23 StoreKit 2:内购 / 订阅 / Sign in with Apple

> 系列基线:iOS 18 / Swift 6 / Xcode 16 / SwiftUI。本文代码全部通过 Swift 6 严格并发模式编译,不使用 `@unchecked Sendable` 与 force unwrap。涉及 iOS 19+ 的新 API 单独标注。

NotesIsland 准备开始赚钱:本地版免费,「NotesIsland Pro」按月或按年订阅,Pro 用户解锁 iCloud 高级容量(无限制大小、加密附件、多设备实时同步)。这一篇围绕 StoreKit 2 把内购、订阅、收据校验、Sign in with Apple 串完。StoreKit 2 是 iOS 15 起的 Swift 原生重写,把过去十年「单例 + delegate + receipt fetcher + base64 + Server-Side Verification」的散乱接口,折叠成大约五个核心 Swift 类型。这是 Apple SDK 中近年来最干净的一次模型重做,值得专门一篇。

---

## 一、机制定位

旧的 StoreKit 1 心智(2009-2020,以 `SKPaymentQueue` 为核心)解决的问题与今天完全一样:

1. 让用户用 Apple ID 完成一次支付;
2. 让 App 知道支付成功且收据有效,以解锁内容;
3. 让 App 持续判断「这个订阅当前还有效吗」;
4. 让 App 让用户「恢复购买」。

但 StoreKit 1 留下了一堆典型坑:`SKPaymentQueue` 是全局单例,事务到达时机不可控;收据 `appStoreReceiptURL` 是 base64 二进制,验证只能调 Apple 服务端 `verifyReceipt`(已弃用);Auto-renewable subscription 的当前状态需要根据收据 JSON 的 `expires_date` 自己算,跨时区、跨试用、跨家庭共享、跨退款经常算错。中型 App 的内购模块平均 1000+ 行 Objective-C 代码,bug 率高。

StoreKit 2 重新分层:

- **Product**:App Store Connect 上配置的产品,在 App 内是值类型,有 `id / displayName / displayPrice / subscription`;
- **Transaction**:一笔已完成事务,本身包含**经 Apple 私钥签名(JWS)**的有效负载,App 端可以**本地验签**,不再需要服务端往返;
- **Transaction.updates**:一个 `AsyncSequence`,所有事务以流的形式推到 App,可以在 App 启动时迭代,实现「补发」与「跨设备同步」;
- **Transaction.currentEntitlements**:一个 `AsyncSequence`,**当前还有效的所有事务**(一次性购买 + 订阅 + 家庭共享),应用层只需要遍历它判断「Pro 是否启用」即可。

它解决的核心问题:**把订阅状态变成「问 StoreKit 一次就知道」**,App 自己不再维护「expires_date / grace period / billing retry」这种心智模型。需要服务端的场景只剩下「跨设备恢复」与「订阅状态变更通知 App Store Server Notifications V2」。

Sign in with Apple 与内购在 NotesIsland 是一对配套:Pro 订阅绑定在 Apple ID 上,Sign in with Apple 提供「一个稳定、跨设备、且不要邮箱」的用户身份。两件事都依赖 Apple 平台已有的隐式信任(用户的 Apple ID),不需要 App 自己做密码管理。

---

## 二、Apple 平台心智

### 2.1 三类商品

App Store Connect 上的「In-App Purchase」分三类,StoreKit 2 用同一个 `Product` 抽象:

| 类型 | `Product.ProductType` | 心智 |
| --- | --- | --- |
| Consumable | `.consumable` | 一次性消耗品,如「100 颗钻石」,**不进入 currentEntitlements** |
| Non-consumable | `.nonConsumable` | 一次买断永久,如「去广告」 |
| Auto-renewable subscription | `.autoRenewable` | 自动续费订阅,**有订阅组、试用期、宽限期** |
| Non-renewing subscription | `.nonRenewing` | 非自动续费订阅,App 自己管周期(很少用) |

NotesIsland Pro 用 auto-renewable subscription,两档:`com.notesisland.pro.monthly`(月)与 `com.notesisland.pro.yearly`(年),归属同一个 Subscription Group。同一个组内同一时间用户**只能有一个有效订阅**。

### 2.2 五个核心类型

StoreKit framework 在 `import StoreKit` 之后暴露:

- `Product`:`static func products(for ids: some Collection<String>) async throws -> [Product]`;
- `Product.purchase()`:发起购买;返回 `Product.PurchaseResult`(`.success(verification)` / `.userCancelled` / `.pending`);
- `VerificationResult<Transaction>`:JWS 验签结果,`.verified(transaction)` 或 `.unverified(transaction, error)`;
- `Transaction.updates`:**所有未来产生的事务流**,App 启动时就要监听,以免漏发;
- `Transaction.currentEntitlements`:**当前有效事务流**,问一次就能算 Pro 是否启用;
- `Transaction.finish()`:**必须显式调用**,否则 StoreKit 认为该事务未完成,会在下一次 App 启动时重新推。

### 2.3 JWS 与本地验签

`Transaction` 通过 `VerificationResult` 暴露:

```swift
public enum VerificationResult<T: Sendable>: Sendable {
    case unverified(T, VerificationResult<T>.VerificationError)
    case verified(T)
}
```

`StoreKit` 内部使用 Apple Root CA 签发的证书校验 JWS 签名。绝大多数客户端场景**直接信任 `.verified` 就够**,不需要再把签名转发给自家服务端校验。需要服务端校验的唯一理由是:**防止某个越狱设备伪造客户端逻辑直接走 `.unverified`**。如果产品价值高(订阅 / 数字商品),建议把 `Transaction.jsonRepresentation` 上行给服务端,服务端用 App Store Server API V2 拿到 `signedPayload` 二次验签,并写入服务端的「entitlement 状态」表。

### 2.4 订阅状态机心智

`Product.SubscriptionInfo` 暴露:`status` 是个 `AsyncSequence`,会推 `Product.SubscriptionInfo.Status`,内含:

- `state`:`.subscribed`、`.expired`、`.inBillingRetryPeriod`、`.inGracePeriod`、`.revoked`;
- `transaction`:对应事务的 JWS;
- `renewalInfo`:下次续费时间、是否自动续费。

App 端要做的「订阅是否有效」判定其实只需要:

```swift
for await result in Transaction.currentEntitlements {
    if case .verified(let t) = result, t.productType == .autoRenewable {
        // 用户当前有有效订阅
    }
}
```

`currentEntitlements` 已经处理掉了「过期」「退款」「家庭共享被收回」这些边界,你不再需要自己算 `expiresDate`。

### 2.5 沙盒 / TestFlight / 生产差异

| 环境 | 商品来源 | 续费节奏 | 收据签名 |
| --- | --- | --- | --- |
| Xcode StoreKit Configuration File | 本地 `.storekit` JSON | 5 秒 = 一个月 | 本地证书,验签 `.verified` |
| Sandbox(`sandbox.itunes.apple.com`) | ASC 商品 + sandbox account | 月订阅每 5 分钟续 / 年订阅每小时续 / 自动续 5 次后失败 | Apple sandbox 证书 |
| TestFlight | 真商品 | 真节奏 | Apple 生产证书 |
| App Store 生产 | 真商品 | 真节奏 | Apple 生产证书 |

`.storekit` 文件最适合**单元测试 + 预览**:不需要登录,不需要联网,所有事务可控。

### 2.6 Sign in with Apple

`AuthenticationServices` framework 的核心:

- `SignInWithAppleButton`:SwiftUI 提供的样式化按钮(iOS 14+);
- `ASAuthorizationAppleIDProvider`:发起请求与监听已存在凭证状态;
- `ASAuthorizationAppleIDCredential`:成功回调里的凭证,**首次登录会给 `email / fullName`,二次登录只给 `user`(Apple ID 的稳定哈希) + `identityToken` (JWT)**;
- 服务端用 Apple 的 JWKS 公钥校验 `identityToken`(`aud` = bundle id,`iss` = `https://appleid.apple.com`,`exp` 在 10 分钟内)。

---

## 三、工程实现

### 3.1 IAP Store 单例 actor

```swift
// File: Features/Pro/ProStore.swift

import Foundation
import StoreKit

// MARK: - 错误

enum ProStoreError: Error {
    case productNotFound
    case purchasePending
    case purchaseUnverified(VerificationResult<Transaction>.VerificationError)
    case userCancelled
}

// MARK: - Pro Store

@MainActor
@Observable
final class ProStore {
    static let shared = ProStore()

    private let productIDs: Set<String> = [
        "com.notesisland.pro.monthly",
        "com.notesisland.pro.yearly"
    ]

    private(set) var products: [Product] = []
    private(set) var isPro: Bool = false

    private var updatesTask: Task<Void, Never>?

    private init() {
        // 必须在 App 启动尽早调用一次,保证事务不会丢
        updatesTask = Task { [weak self] in
            for await update in Transaction.updates {
                await self?.handle(update)
            }
        }
    }

    deinit {
        updatesTask?.cancel()
    }

    // MARK: - 加载商品

    func loadProducts() async throws {
        let fetched = try await Product.products(for: productIDs)
        // 按价格升序
        self.products = fetched.sorted { $0.price < $1.price }
        await refreshEntitlements()
    }

    // MARK: - 购买

    @discardableResult
    func purchase(_ product: Product) async throws -> Transaction {
        let result = try await product.purchase()
        switch result {
        case .success(let verification):
            let transaction = try checkVerified(verification)
            await transaction.finish()
            await refreshEntitlements()
            return transaction
        case .userCancelled:
            throw ProStoreError.userCancelled
        case .pending:
            throw ProStoreError.purchasePending
        @unknown default:
            throw ProStoreError.purchasePending
        }
    }

    // MARK: - 恢复购买

    func restore() async throws {
        try await AppStore.sync()
        await refreshEntitlements()
    }

    // MARK: - Entitlements 当前状态

    func refreshEntitlements() async {
        var hasActive = false
        for await result in Transaction.currentEntitlements {
            guard case .verified(let t) = result else { continue }
            if t.productType == .autoRenewable, t.revocationDate == nil {
                hasActive = true
            }
        }
        self.isPro = hasActive
    }

    // MARK: - 私有辅助

    private func handle(_ result: VerificationResult<Transaction>) async {
        guard case .verified(let transaction) = result else { return }
        await transaction.finish()
        await refreshEntitlements()
    }

    private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified(_, let error):
            throw ProStoreError.purchaseUnverified(error)
        case .verified(let safe):
            return safe
        }
    }
}
```

几个 Swift 6 / iOS 18 关键点:

- 整个类 `@MainActor` + `@Observable`:SwiftUI 视图可以直接 `@Bindable var store = ProStore.shared` 读 `isPro` / `products`,字段级追踪自动生效;
- `Transaction.updates` 是 `Sendable` `AsyncSequence`,可以跨 actor 边界传递;
- `Task { [weak self] in ... }` 与 `weak self` 配合避免持有循环,`actor`-isolated 心智正确;
- 不写 `@unchecked Sendable`,因为 `Product` / `Transaction` 在 SDK 内部已经声明 `Sendable`。

### 3.2 SwiftUI 购买视图

```swift
// File: Features/Pro/ProPaywallView.swift

import SwiftUI
import StoreKit

struct ProPaywallView: View {
    @Bindable var store: ProStore = .shared
    @State private var isPurchasing = false
    @State private var error: String?

    var body: some View {
        VStack(spacing: 20) {
            Text("NotesIsland Pro")
                .font(.largeTitle.bold())
            Text("解锁无限 iCloud 容量、附件加密、多端实时同步")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)

            ForEach(store.products, id: \.id) { product in
                Button {
                    Task { await buy(product) }
                } label: {
                    VStack {
                        Text(product.displayName).font(.headline)
                        Text(product.displayPrice).font(.title3)
                    }
                    .frame(maxWidth: .infinity).padding()
                }
                .buttonStyle(.borderedProminent)
                .disabled(isPurchasing)
            }

            Button("恢复购买") {
                Task { try? await store.restore() }
            }

            if let error {
                Text(error).foregroundStyle(.red).font(.footnote)
            }
        }
        .padding()
        .task {
            do { try await store.loadProducts() }
            catch { self.error = error.localizedDescription }
        }
    }

    private func buy(_ product: Product) async {
        isPurchasing = true
        defer { isPurchasing = false }
        do {
            _ = try await store.purchase(product)
        } catch ProStoreError.userCancelled {
            // 静默
        } catch {
            self.error = error.localizedDescription
        }
    }
}
```

### 3.3 Sign in with Apple

```swift
// File: Features/Auth/SignInView.swift

import SwiftUI
import AuthenticationServices

struct SignInView: View {
    @State private var status: String = ""
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(spacing: 16) {
            SignInWithAppleButton(.signIn) { request in
                request.requestedScopes = [.fullName, .email]
                // 服务端校验时需要的随机 nonce
                request.nonce = AuthNonce.current.sha256
            } onCompletion: { result in
                handle(result)
            }
            .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
            .frame(height: 48)
            .padding(.horizontal)

            Text(status).font(.footnote).foregroundStyle(.secondary)
        }
    }

    private func handle(_ result: Result<ASAuthorization, Error>) {
        switch result {
        case .success(let auth):
            guard
                let cred = auth.credential as? ASAuthorizationAppleIDCredential,
                let tokenData = cred.identityToken,
                let token = String(data: tokenData, encoding: .utf8)
            else {
                status = "凭证缺失"
                return
            }
            Task { await sendToServer(userID: cred.user, identityToken: token) }
        case .failure(let error):
            status = "失败:\(error.localizedDescription)"
        }
    }

    private func sendToServer(userID: String, identityToken: String) async {
        // 这里把 identityToken 上行到自家服务端,服务端用 Apple JWKS 校验签名 + nonce 一致
        // 校验通过后,服务端签发自家 session token,客户端持有
        status = "已签名 user=\(userID.prefix(6))..."
    }
}

// MARK: - Nonce 工具

import CryptoKit

enum AuthNonce {
    static let current = Nonce()

    struct Nonce {
        let raw: String
        let sha256: String

        init() {
            let bytes = (0..<32).map { _ in UInt8.random(in: 0...255) }
            let raw = Data(bytes).base64EncodedString()
            self.raw = raw
            let hashed = SHA256.hash(data: Data(raw.utf8))
            self.sha256 = hashed.map { String(format: "%02x", $0) }.joined()
        }
    }
}
```

### 3.4 服务端 JWT 校验骨架(伪代码,以 Swift Vapor 为例)

```swift
// File: Server/AppleIdentityVerifier.swift
// 这是服务端代码示意,不打包到 iOS App。

import Foundation
import JWTKit

struct AppleIdentityToken: JWTPayload {
    let iss: IssuerClaim   // 必须是 https://appleid.apple.com
    let sub: SubjectClaim  // = userID
    let aud: AudienceClaim // = bundle id
    let exp: ExpirationClaim
    let nonce: String?

    func verify(using signer: JWTSigner) throws {
        try exp.verifyNotExpired()
        guard iss.value == "https://appleid.apple.com" else { throw Abort(.unauthorized) }
        guard aud.value.contains("com.notesisland") else { throw Abort(.unauthorized) }
    }
}

// 服务端启动时拉一次 https://appleid.apple.com/auth/keys 缓存 JWKS,
// 用 kid 找到对应公钥,然后:
// let payload = try signer.verify(identityToken, as: AppleIdentityToken.self)
// 比对 payload.nonce 与客户端 nonce 哈希一致,才算成功登录。
```

---

## 四、调参与验收

### 4.1 关键参数

| 参数 | 影响 | 推荐 |
| --- | --- | --- |
| Subscription Group 内的等级 | 升级 / 降级时机 | 月 = 1 级,年 = 2 级,Apple 自动算 prorated 退款 |
| Introductory Offer | 试用 / 优惠首期 | 首单试用 7 天;`Transaction` 上会有 `offer` 字段标识 |
| Promo Offer | 召回流失用户 | 服务端用 `App Store Server API` 生成签名,客户端用 `Product.PurchaseOption.promotionalOffer` 应用 |
| `.storekit` 配置文件 | 单元测试与预览 | Renewal 速度调成 `realtime`(秒级);测出 `revocation` 路径 |
| `request.nonce` | Sign in with Apple 防重放 | 客户端生成 raw + SHA256,raw 留本地,SHA256 给 Apple,服务端校验时再比对 |
| Server Notifications V2 endpoint | 实时收到退款 / 续费失败 | 必填 HTTPS,要返回 200;签名校验同 JWS |

### 4.2 手动验证清单

1. Xcode 16 项目 → File → New → File... → StoreKit Configuration File,加入 monthly + yearly 两个订阅,Subscription Group `notes_island_pro`。
2. Scheme → Run → Options → StoreKit Configuration 选中上一步的文件;Renewal Rate 设为 `Real Time`(默认 1 秒 = 1 天)。
3. 模拟器中跑 App,进入 Paywall:
   - 期望:列出两档商品 + 本地化价格(模拟器 region 设为中国大陆显示 ¥);
   - 点月订阅:弹出系统购买确认,完成后 `store.isPro` 立刻翻 true,UI 上 Pro 标识出现;
   - 等 60 秒(realtime 模式下相当于过完一个月),`Transaction.updates` 推一条续费事务,App 不应有任何前台代码侵入;
   - 在 Xcode → Debug → StoreKit → Manage Transactions 中点 Refund Pending Transaction,`refreshEntitlements()` 应把 `isPro` 翻 false。
4. 真机沙盒验证:Settings → App Store → Sandbox Account 登入测试账号,App 跑 release-mode,验证 `restore()`:删除 App 重装,登录同一 Apple ID,Paywall 自动检测到已订阅,UI 应跳过付款页。
5. Sign in with Apple:Capabilities 中勾上 `Sign In with Apple` entitlement;真机跑 App,点按钮 → 完成 Face ID,确认服务端收到 `identityToken` 解码 `payload.sub` 与客户端 `cred.user` 一致。
6. 收据本地校验:故意把 `.storekit` 文件中的 receipt 篡改,App 端 `purchase()` 应抛 `ProStoreError.purchaseUnverified`。

### 4.3 真机 vs 模拟器差异

- 模拟器跑 Sign in with Apple **要求已登录 iCloud**,否则 SDK 弹出「你需要登录 iCloud」;
- 模拟器无法测试 Family Sharing 场景;
- 模拟器订阅恢复在 `AppStore.sync()` 后立即生效,真机沙盒可能延迟 1-30 秒。

---

## 五、踩坑

### 5.1 与 iOS 14 / Swift 5 旧教程的差异

- **不要再写 `SKPaymentQueue.default().add(self)`**:StoreKit 1 路线在 Swift 6 严格并发下基本无法干净落地(delegate 回调在 background queue,需要大量 `Task { @MainActor in ... }` 包裹)。新项目直接 StoreKit 2。
- **不要再调 `verifyReceipt` 接口**:Apple 已弃用,转用 App Store Server API V2(JWS / signedTransactionInfo)。客户端绝大多数场景靠 `VerificationResult.verified` 就足够,服务端有需求时用 V2 接口。
- **`SKReceiptRefreshRequest` 也别再写**:`AppStore.sync()` 替代,它会触发 Apple ID 输密码弹窗,只在用户点「恢复购买」时调用,不要在 App 启动时跑。
- **不要在 `init` 里 `try await Product.products(for:)`**:`init` 是同步的;改在 `App.task { await store.loadProducts() }` 或 SwiftUI `.task`。

### 5.2 Swift 6 严格并发常见报错

- `Sending 'self' risks causing data races`:`for await update in Transaction.updates` 写在非 `Sendable` 类中。修法是把整个类标 `@MainActor` 或把 sequence 监听放进单独 `actor`。
- `Static property 'shared' is not concurrency-safe`:`static let shared = ProStore()` 在 `@MainActor` 类型上必须满足初始化在 main actor,Swift 6 默认允许,因为整个 `ProStore` 已经 `@MainActor`,`shared` 隐式继承隔离。
- 不要写 `Task.detached { ... }` 去监听 `Transaction.updates`,会丢失 main actor 隔离,导致 `refreshEntitlements` 触发主线程 UI 报错;直接用 `Task { @MainActor in ... }` 或继承类的隔离。

### 5.3 业务层踩坑

- **`transaction.finish()` 必须显式调用**。StoreKit 2 不像 StoreKit 1 的 `finishTransaction(_:)` 那样可以放后面慢慢调,跳过 `finish()` 会让事务在每次启动都重新推一遍 `Transaction.updates`。
- **不要把 `isPro` 写进 `UserDefaults` 当 source of truth**:`UserDefaults` 可被用户清除、可被 backup 恢复造成时间错位,真值永远是 `Transaction.currentEntitlements`。`UserDefaults` 只做「冷启动到第一次 entitlement 读取完成之间的乐观渲染」缓存。
- **试用期判定**:`product.subscription?.introductoryOffer` 不一定代表「**这个用户**可享受试用」,需要 `await product.subscription?.isEligibleForIntroOffer` 异步查询;Apple 根据用户在该 Subscription Group 的历史决定,不是产品配置。
- **家庭共享**:`Transaction.ownershipType` 区分 `.purchased` 与 `.familyShared`,如果你的 Pro 内容对家庭分享用户启用,要在 UI 上明示「家庭共享激活」否则审核可能拒。
- **退款**:Apple 在退款发生后会通过 `Transaction.updates` 推一条 `revocationDate != nil` 的事务,App 端必须及时收回权益(把 `isPro` 翻 false 并清掉本地缓存内容);忽略退款是 Apple 主动审核扣分项。
- **Sign in with Apple 邮箱**:首次登录时返回真实邮箱或 Apple 私密中继邮箱(`xxxx@privaterelay.appleid.com`),**只有首次**会返回 `fullName` / `email`,二次登录只给 `user`。所以服务端必须在首次登录时持久化邮箱与 `sub`,后续不再请求。
- **`nonce` 必须用一次性随机值**,服务端在 verify 时核对 `payload.nonce == SHA256(client_raw_nonce)`,这样可以阻止重放攻击;光靠 `identityToken.exp` 不够。
- **iOS 19+(标注:仅适用于 iOS 19 SDK)**:Apple 在 iOS 19 引入 `Transaction.allTransactionsForUser` 把 StoreKit 2 与 Server Notifications V2 进一步打通,允许在 App 端用一次 async 调用拉到完整事务历史。降级方案:在 iOS 18 仍走 `Transaction.all` + 自行去重。本系列正篇以 iOS 18 为基线。

到这一步,NotesIsland 已经能让用户用 Apple ID 登录、用 Apple ID 付款、跨设备恢复订阅、被 Apple 自动管理续费与退款。下一篇我们让它对**所有人**可用 —— 视障用户、不识中文的用户、需要大字号的用户、关闭动画的用户。
