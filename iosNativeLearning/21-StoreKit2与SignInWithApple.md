# StoreKit 2 与 Sign in with Apple

iOS App 上的内购 / 订阅 / 用户登录,Apple 提供 **StoreKit 2**(iOS 15+ Swift 原生 API)和 **Sign in with Apple**(iOS 13+)。这一篇讲透:**`Product` / `Transaction.updates` / `Product.purchase()`、JWS 收据本地校验、沙盒测试、订阅状态续费心智、App Store Server Notifications V2、`SignInWithAppleButton` 流程、服务端 token 校验**。

> 一句话先记住:**StoreKit 2 用 async API + JWS 签名取代了 StoreKit 1 的 `SKPaymentQueue` callback 心智——产品列表、购买、退款、订阅状态都是 async 函数。`Transaction` 实例自带 JWS 签名,客户端本地就能校验,无需依赖收据上传到服务器。Sign in with Apple 是审核硬要求(用了第三方登录就必须提供)——`ASAuthorizationAppleIDCredential` 给你 identity token,服务端验签得到稳定用户 ID。**

---

## 一、StoreKit 2 基本流程

```swift
import StoreKit

// 1. 拿产品列表(配置在 App Store Connect)
let productIDs = ["com.example.NotesIsland.pro_monthly", "com.example.NotesIsland.pro_yearly"]
let products = try await Product.products(for: productIDs)

// 2. 显示给用户(SwiftUI)
ForEach(products, id: \.id) { product in
    Button {
        Task { try await purchase(product) }
    } label: {
        VStack {
            Text(product.displayName)
            Text(product.displayPrice)
        }
    }
}

// 3. 发起购买
func purchase(_ product: Product) async throws {
    let result = try await product.purchase()
    switch result {
    case .success(let verification):
        // verification 包含 JWS 签名的 Transaction
        switch verification {
        case .verified(let transaction):
            // 签名校验通过
            await deliverContent(for: transaction)
            await transaction.finish()    // ⚠️ 必须 finish,否则会反复送达
        case .unverified(let transaction, let error):
            // 签名校验失败,可能是篡改 / 越狱
            print("⚠️ 不可信交易:\(error)")
        }
    case .userCancelled:
        // 用户取消
        break
    case .pending:
        // 等待审批(家长批准的购买)
        break
    @unknown default:
        break
    }
}
```

四个核心 API:
- `Product.products(for: ids)` — 拿产品信息
- `product.purchase()` — 发起购买
- `transaction.finish()` — 必须调用,否则交易未完成系统会重发
- `Transaction.updates` — 监听外部交易(订阅续费、退款、家长审批通过等)

---

## 二、Transaction.updates:监听后续交易

订阅续费、退款、家庭共享购买,**不通过 `purchase()` 走**,而是后台异步到达。要在 App 启动时监听:

```swift
struct NotesIslandApp: App {
    init() {
        Task.detached {
            for await result in Transaction.updates {
                await handleTransactionUpdate(result)
            }
        }
    }
    
    var body: some Scene { ... }
}

func handleTransactionUpdate(_ result: VerificationResult<Transaction>) async {
    switch result {
    case .verified(let transaction):
        await deliverContent(for: transaction)
        await transaction.finish()
    case .unverified:
        break
    }
}
```

`Transaction.updates` 是 AsyncSequence,永远在跑,App 启动时启动一个 detached task 即可。

---

## 三、查询用户当前权限

不要持久化"用户买没买过"——直接问 StoreKit:

```swift
func isProUser() async -> Bool {
    for await result in Transaction.currentEntitlements {
        if case .verified(let transaction) = result {
            if transaction.productID.hasPrefix("com.example.NotesIsland.pro") {
                return true
            }
        }
    }
    return false
}
```

`Transaction.currentEntitlements` 返回**当前生效的所有交易**——一次性购买永远在,订阅在有效期内才在。这是检查"用户有没有 Pro 权限"的权威来源。

---

## 四、订阅特有的 API

```swift
// 检查某个订阅当前状态
if let product = try await Product.products(for: ["com.example.pro_monthly"]).first {
    let statuses = try await product.subscription?.status
    for status in statuses ?? [] {
        switch status.state {
        case .subscribed: ...           // 订阅中
        case .expired: ...               // 已过期
        case .inBillingRetryPeriod: ...  // 续费失败,系统重试中
        case .inGracePeriod: ...         // 宽限期(续费失败但仍享有服务)
        case .revoked: ...               // 退款撤销
        @unknown default: break
        }
    }
}

// 订阅组(同一组内只能有一个生效)
let group = product.subscription!
let groupID = group.subscriptionGroupID
let renewalInfo = status.renewalInfo    // 续费策略、优惠等
```

---

## 五、JWS 签名校验

`Transaction` 实例本身就是 JWS 签名过的 — 客户端本地能校验:

```swift
switch result {
case .verified(let transaction):
    // 已经在 StoreKit 内部校验通过
    // 你可以再上传到自己服务器做二次校验
case .unverified(let transaction, let error):
    // 签名没过(伪造 / 越狱),拒绝送达
}
```

**StoreKit 2 校验逻辑内置**——你不需要写 OpenSSL 代码,但**仍然推荐服务端二次校验**(防客户端被改、防离线时延)。服务端拿 `transaction.jsonRepresentation` 上传后,用 Apple 的公钥校验。

---

## 六、App Store Server Notifications V2

订阅续费 / 退款不一定经过 App。**服务端要订阅 ASN V2 webhook**:

- App Store Connect → 配置 Server URL
- Apple 在交易事件发生时 POST 一个 JWS 到你的 URL
- 服务端解 JWS,更新用户订阅状态

事件类型:`SUBSCRIBED` / `DID_RENEW` / `DID_CHANGE_RENEWAL_PREF` / `DID_FAIL_TO_RENEW` / `EXPIRED` / `REFUND` / `REVOKE` 等十几种。

**ASN V2 是订阅 App 服务端架构的基石**——不订阅就只能靠 App 端 `Transaction.updates`,但 App 没开就拿不到事件,服务端用户状态会延迟。

---

## 七、沙盒测试

iOS 12 起,App Store Connect 创建沙盒账号,在真机 / 模拟器登录沙盒账号后,App 内购买走沙盒环境(免费 / 加速时间)。

```
真机 / 模拟器 → 设置 → App Store → 沙盒账号 → 登录
然后 Xcode Run,购买流程走沙盒
```

**沙盒环境的特殊性**:
- 订阅"加速"(1 月 → 3 分钟,1 年 → 1 小时)
- 不真正扣钱
- 可重置购买(在 ASC 沙盒账号 → 编辑订阅状态)

Xcode 还有 `.storekit` 配置文件用于测试无网或自定义产品:

- File → New → File → StoreKit Configuration File
- Scheme → Edit → Run → Options → StoreKit Configuration

`.storekit` 文件让你完全离线测试购买流程,模拟各种异常(支付失败、家长审批等)。

---

## 八、Sign in with Apple

iOS 13 起,**App 用了第三方登录(Google / Facebook 等)就必须提供 Sign in with Apple**(审核硬要求)。

```swift
import AuthenticationServices

struct LoginView: View {
    @State private var errorMessage: String?
    
    var body: some View {
        SignInWithAppleButton(
            onRequest: { request in
                request.requestedScopes = [.fullName, .email]
                request.nonce = sha256(currentNonce)    // 防重放
            },
            onCompletion: { result in
                switch result {
                case .success(let authResults):
                    handleSuccess(authResults)
                case .failure(let error):
                    errorMessage = error.localizedDescription
                }
            }
        )
        .signInWithAppleButtonStyle(.black)
        .frame(height: 50)
    }
    
    private func handleSuccess(_ auth: ASAuthorization) {
        guard let credential = auth.credential as? ASAuthorizationAppleIDCredential else { return }
        
        let userID = credential.user                      // 稳定 ID(此 Apple ID 此 App 唯一)
        let identityToken = credential.identityToken      // JWT,要上传服务器验签
        let authorizationCode = credential.authorizationCode  // 一次性,服务器换 refresh token
        let email = credential.email                       // 可能为 nil(用户隐藏邮箱)
        let fullName = credential.fullName                  // 可能为 nil(第二次登录之后)
        
        Task {
            try? await uploadToServer(
                identityToken: identityToken,
                authorizationCode: authorizationCode,
                userID: userID,
                email: email,
                name: fullName
            )
        }
    }
}
```

---

## 九、Sign in with Apple:服务端验签

`identityToken` 是一个 JWT(JSON Web Token),服务端校验流程:

1. 解 JWT header,拿 kid
2. 从 `https://appleid.apple.com/auth/keys` 拿公钥 list
3. 用对应 kid 的公钥校验 JWT 签名
4. 校验 payload:
   - `iss` == `https://appleid.apple.com`
   - `aud` == 你的 bundle ID
   - `exp` > 当前时间
   - `sub` == 用户唯一 ID(与 `credential.user` 一致)
5. 用 `sub` 作为用户 ID,创建 / 关联本地账户

**注意**:`credential.user` 在客户端就能拿,但**不能**信任客户端传过来的 ID(可能伪造)。服务端必须自己从 identityToken 里取 `sub`。

`authorizationCode` 可以换 `refresh_token`,让服务端拿到长期访问能力:

```
POST https://appleid.apple.com/auth/token
client_id=your.bundle.id
client_secret=<JWT signed with your private key>
code=<authorization_code>
grant_type=authorization_code
```

返回 `access_token` + `refresh_token`。后续用 refresh_token 拿新 access_token。

---

## 十、用户隐藏邮箱

Sign in with Apple 让用户选"隐藏邮箱"(`xxx@privaterelay.appleid.com`),Apple 中转邮件到用户真邮箱。这是 Apple 隐私设计的一部分。

**结果**:你拿到的 email 可能是中转地址,**邮件能发但用户真实邮箱不知道**。这是审核可能"测"的点——你不能强求用户提供真实邮箱。

`name` 字段只在**首次登录**返回:

```swift
let fullName = credential.fullName    // PersonNameComponents,首次有,之后是 nil
let displayName = PersonNameComponentsFormatter().string(from: fullName ?? PersonNameComponents())
```

服务端首次拿到要存,后续用户重登只有 token + userID。

---

## 十一、StoreKit 1 已废弃

`SKPaymentQueue` / `SKProductsRequest` / `SKReceiptRefreshRequest` 这套是 StoreKit 1,从 iOS 15+ 起 deprecated,2026 年新 App 不该再用。**唯一保留场景**:支持 iOS 14 及以下(deployment target < 15),那时只能用 StoreKit 1 fallback。本系列 deployment target 是 iOS 18,完全用 StoreKit 2。

---

## 十二、踩坑

1. **`transaction.finish()` 没调**——交易未完成,系统下次 App 启动时会通过 `Transaction.updates` 再发一次,可能导致重复发货。
2. **客户端校验通过就发权益,不做服务端校验**——越狱 / 中间人能伪造 verification。重要权益(虚拟物品、虚拟币)必须服务端二次校验。
3. **检查权益用本地 `UserDefaults` 缓存**——退款 / 订阅过期后 UserDefaults 不会自动改。每次启动 `Transaction.currentEntitlements` 重查。
4. **`Transaction.updates` 没在 App 启动时监听**——错过订阅续费 / 退款事件。第一时间启动监听 task。
5. **沙盒账号和正式 Apple ID 用同一台设备登错**——沙盒账号必须从"设置 → App Store → 沙盒账号"登录,不能登顶层 Apple ID 处。
6. **Sign in with Apple 没在服务端验签**——客户端传的 userID 可被伪造。必须服务端从 identityToken 解出 sub。
7. **`identityToken` 当作长期登录态**——它会过期。要么短期内用,要么用 `authorizationCode` 换 refresh_token 走长期。
8. **第二次登录 fullName 为 nil 当 bug**——这是设计,首次记录后端,后续重登不再返回。
9. **隐藏邮箱地址当无效**——它是有效的中转邮箱,真能收信。
10. **不订阅 ASN V2 webhook**——续费 / 退款不一定经 App,服务端可能不知道用户当前状态。订阅 webhook 后服务端能权威跟进。

---

下一篇 `22-端侧AI.md`,讲 Vision Framework 文字 / 人脸 / 物体识别、Core ML 模型导入、Core ML 加速(ANE / Neural Engine)、MLX 框架(Apple Silicon 上的 PyTorch-like)、Apple Intelligence 入口(iOS 19+)、Foundation Model 端侧推理。
