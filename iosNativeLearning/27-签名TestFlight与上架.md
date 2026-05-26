# 签名、TestFlight 与上架

写完 App 不等于发布。**签名链 + Provisioning Profile + Entitlements + TestFlight + 审核 + 隐私问卷 + 加密合规** 这一整套是 iOS 开发者绕不开的"另一半工作"。这一篇讲透从开发证书到 App Store 上架的全流程,以及多平台延伸(macOS / iPadOS / visionOS / watchOS)。

> 一句话先记住:**iOS 上架 = 签名(Certificate + Profile)+ 元数据(隐私问卷、加密声明、版本截图)+ 审核(机审 + 人审)。从代码完成到上架,通常还要 1-3 周——签名链配错、隐私问卷不一致、内购合规疏忽都能让你卡住。本篇是上架最后清单。**

---

## 一、Apple Developer 账号与角色

Apple Developer Program $99/年,有两种:
- **Individual**:个人,App Store 显示"开发者:你的真名"
- **Organization**:公司(需要 D-U-N-S 编号 + 法人认证),显示公司名

公司账号有 team 概念,可以邀请成员:

| 角色 | 权限 |
| --- | --- |
| Account Holder | 全部 |
| Admin | 大部分,不能改 banking |
| App Manager | 上传 build / 管 App,不能改证书 |
| Developer | 真机调试 / 上传 build |
| Marketing | 只看 |

新人通常给 Developer 角色,Release 流程让 Admin 走。

---

## 二、签名链:Certificate + Profile + Entitlements

iOS 签名是为了**让系统确信"这个 App 来自合法开发者 + 用户授权"**。完整链条:

```
1. 开发者本机生成 CSR(Certificate Signing Request)
2. 上传到 Apple Developer,换取 Certificate(.cer 文件)
3. 在 Developer Portal 创建 App ID(对应 bundle id)+ 关联 Capabilities
4. 创建 Provisioning Profile,绑定 Certificate + App ID + 设备(开发)/所有人(发布)
5. Xcode 用 Cert + Profile 签 App,生成 .ipa
6. .ipa 上传 TestFlight / App Store
```

证书类型:
- **Apple Development**:开发期,装真机调试
- **Apple Distribution**:发布,上 TestFlight / App Store
- **Mac Development / Distribution**:macOS 对应

Provisioning Profile 类型:
- **Development**:绑特定设备 UDID,只能装那些设备
- **Ad Hoc**:绑设备但不需要 TestFlight,内部分发
- **App Store**:上架专用,无设备绑定
- **Enterprise**:企业账号(In-House Distribution),绕开 App Store(企业内部 App)

---

## 三、Automatic vs Manual Signing

```
Xcode → Signing & Capabilities

[v] Automatically manage signing
    Team: Your Team (xxxxxx)
    Bundle Identifier: com.example.NotesIsland
    Provisioning Profile: Xcode Managed Profile
    Signing Certificate: Apple Development: Your Name
```

**Automatic Signing**(推荐普通开发):Xcode 自动生成 / 续期证书与 profile,你只管选 Team 和 bundle id。

**Manual Signing**:在 Developer Portal 手动创建 / 下载证书与 profile,Xcode 选 file。**CI / 多人协作 / 复杂多 target 时需要**(自动签名在 CI 上不稳定)。

CI 用 manual,推荐配合 **Fastlane match** 或 **Xcode Cloud** 管理证书:

```bash
# fastlane match
fastlane match development
fastlane match appstore
```

`match` 把所有证书 + profile 存 git 仓库(加密),团队成员一起共享一份,**杜绝 "证书在某个同事电脑里"** 的问题。

---

## 四、Entitlements:声明能力

`<App>.entitlements` 文件声明 App 用了哪些 Apple capability:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
    <key>com.apple.developer.icloud-container-identifiers</key>
    <array>
        <string>iCloud.com.example.NotesIsland</string>
    </array>
    <key>com.apple.developer.icloud-services</key>
    <array>
        <string>CloudDocuments</string>
    </array>
    <key>com.apple.security.application-groups</key>
    <array>
        <string>group.com.example.NotesIsland</string>
    </array>
    <key>aps-environment</key>
    <string>production</string>
</dict>
</plist>
```

每个 entitlement 要在 Developer Portal 的 App ID 页面**勾选对应 Capability**,profile 才能签到这个 entitlement。**不一致就签名失败**。

Xcode 的 Signing & Capabilities tab 通过 + 号加 capability,Xcode 自动更新 entitlements 文件 + Developer Portal 配置(automatic signing 模式下)。

常见 entitlement:
- **iCloud**:CloudKit / Documents
- **App Groups**:跨 target 共享
- **Push Notifications**:推送
- **Keychain Sharing**:Keychain access group
- **Background Modes**:后台能力
- **Sign in with Apple**:登录
- **In-App Purchase**:内购
- **Sandbox**:macOS / Catalyst 沙盒
- **Family Controls / Screen Time API**:家长控制

---

## 五、Archive + 上传

1. Xcode → Product → Scheme → Edit → Run → Build Configuration = Release
2. Xcode → Product → Archive(选 "Any iOS Device" target,真机不能选模拟器)
3. Archive 完成后 Organizer 自动打开
4. 选 Archive → Distribute App → App Store Connect → Upload
5. 等几分钟 Apple 自动 process build(扫描 binary、生成 dSYM,可能要等 10-30 分钟)
6. App Store Connect → TestFlight 看到这个 build

CI 命令行:

```bash
xcodebuild archive \
  -workspace NotesIsland.xcworkspace \
  -scheme NotesIsland \
  -configuration Release \
  -archivePath build/NotesIsland.xcarchive

xcodebuild -exportArchive \
  -archivePath build/NotesIsland.xcarchive \
  -exportOptionsPlist ExportOptions.plist \
  -exportPath build/

# 上传
xcrun altool --upload-app -f build/NotesIsland.ipa -t ios -u xxx@xx.com -p $APP_PASSWORD
# 或更现代的 notarytool / Xcode Cloud
```

---

## 六、TestFlight 内部测试 + 外部测试

- **Internal Testing**:同 team 成员(最多 100 人),无需 Apple 审核,上传后立即可装
- **External Testing**:邀请外部用户(邮箱 / 公开链接,最多 10000 人),**首次 build 需要 Apple beta 审核**(通常 24 小时内)

TestFlight 安装:
1. 用户装 TestFlight App
2. 接受邀请链接
3. 装这个 build,有效期 90 天

**线上前最后一次集中测试**——把内测建到 5-10 人核心团队 + 0-30 人外测,跑两周,收集 bug 和反馈。

---

## 七、App Store 上架流程

App Store Connect 上每个 App 都要填:

1. **App 信息**:名称、副标题、Category、Content Rating
2. **价格 / Availability**:免费 / 付费、可用国家
3. **隐私 / Data Collection**:勾收集了哪些数据、用途、是否 tracking
4. **App Privacy Manifest**:已经在 18 篇讲过,审核会扫
5. **加密合规**:用了 HTTPS / 标准加密就声明 standard cryptography
6. **App Review Information**:Demo 账号、联系电话、提交备注
7. **Version Info**:版本号、本次更新内容、关键词、宣传图标、截图、predict 标记
8. **截图 / Preview**:多设备多 size(iPhone 6.7" / 6.5"、iPad 12.9"、Apple Watch、Mac)
9. **App Store Connect API token**(可选):用于 CI 自动化

**首次上架最容易卡的**:截图尺寸不对、隐私问卷与 Manifest 不一致、审核测试账号不可用。

---

## 八、审核常见 reject 类型

按 [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/):

| 类别 | 描述 |
| --- | --- |
| **2.1 - App Completeness** | crash / 占位内容 / 链接失效 |
| **3.1 - In-App Purchase** | 数字内容必须走 IAP,不能跳到外部支付 |
| **3.2 - Other Business Models** | 订阅描述不清晰 |
| **4.0 - Design** | 抄袭 Apple 设计 / 系统组件不规范 |
| **4.3 - Spam** | 跟其他 App 太像、模板化 App |
| **5.1.1 - Data Collection** | 隐私问卷与实际不符 / 强制收集不必要的数据 |
| **5.1.2 - Data Use** | 用户数据用于 tracking 但没 ATT |
| **5.1.7 - Sign in with Apple** | 用了第三方登录没提供 Sign in with Apple |
| **5.2 - Intellectual Property** | 用了别人商标 / 内容 |
| **5.6.1 - Account Sign-In** | 强制注册才能用基本功能 |

**遇到 reject**:Resolution Center 里 Apple 给具体条款 + 复现步骤,**先看清条款再回复**,不要急着辩。多数 reject 修一下就过,屡屡被同一条款卡的话开 Appeal 走 App Review Board。

---

## 九、加密合规声明

App 用了 HTTPS、Keychain、CryptoKit 等就涉及加密。每次上传 build,Apple 问"你的 App 是否使用加密":

- **No** — 完全不用加密
- **Yes, Standard Cryptography** — 只用 Apple 系统的(HTTPS、TLS、Keychain、CryptoKit)
- **Yes, Proprietary / Non-Standard** — 用了自己的加密(很少,通常金融 / 通讯 App)

Standard Cryptography 在 `Info.plist` 加:

```xml
<key>ITSAppUsesNonExemptEncryption</key>
<false/>
```

直接标 false 跳过每次上传时手动确认。

---

## 十、版本号策略

```
MARKETING_VERSION = 1.2.3        ← 用户看到的版本(CFBundleShortVersionString)
CURRENT_PROJECT_VERSION = 42     ← Build 号(CFBundleVersion),每次上传必须递增
```

**Build 号 unique** —— 同一 marketing version 可以多次上传,但 build 号必须每次 + 1。否则上传被拒绝。

CI 上自动递增:

```bash
agvtool next-version -all
```

或者用 git commit 数:

```bash
agvtool new-version -all $(git rev-list --count HEAD)
```

---

## 十一、多平台延伸:macOS / iPadOS / visionOS / watchOS

同一份 SwiftUI 代码可以高度复用到多个平台:

### macOS

两种方式:
1. **Catalyst**:iOS App 直接编译到 Mac,只需勾 Mac 复选框,~80% UI 自动适应
2. **Native macOS**:`Multiplatform App` 模板,SwiftUI 跨 iOS / macOS 共享 + 平台差异处理

Catalyst 快但有限,Native macOS 体验更好但要写更多平台分支:

```swift
#if os(macOS)
    Text("Hello, Mac")
#else
    Text("Hello, iOS")
#endif
```

### iPadOS

iPadOS 已经默认包含——iOS App 自动 universal(iPhone + iPad)。优化点:
- 用 `NavigationSplitView` 利用大屏(11 篇讲过)
- 适配 `UIKeyCommand` 键盘快捷键
- iPad Pencil 输入(`PencilKit`)

### visionOS

Vision Pro,Apple 2024 上的空间计算平台。SwiftUI 写法相通,但加几个空间专属概念:
- **WindowGroup** → 2D 窗口
- **ImmersiveSpace** → 沉浸式空间
- **Volume** → 3D 模型悬空展示

```swift
WindowGroup { ContentView() }

ImmersiveSpace(id: "myWorld") {
    Reality3DContent()
}

WindowGroup(id: "volume") {
    My3DModel()
}.windowStyle(.volumetric)
```

### watchOS

watchOS 用 WatchKit + SwiftUI,但 SwiftUI 是有限子集(没 NavigationStack、有 `NavigationLink` 旧版、限 ScrollView 行数等)。**主线项目可以加一个 Watch App target**,展示主 App 内容的极简视图。

---

## 十二、发布前最后清单

✅ Bundle ID、版本号、build 号正确
✅ Provisioning Profile 是 App Store distribution,且匹配 entitlements
✅ Privacy Manifest 完整,与 App Store Connect 隐私问卷一致
✅ 所有第三方 SDK 都有 PrivacyInfo + 签名
✅ Info.plist 所有 usage description 完整
✅ ATT 弹窗(如果用 tracking)
✅ 加密合规声明
✅ Sign in with Apple(如果有其他第三方登录)
✅ Demo 账号能登录,审核员能跑通核心流程
✅ 截图 / Preview 视频按设备 size 准备齐全
✅ 在 iPhone SE(小屏)、Pro Max(大屏)、iPad 全跑一遍
✅ 在 deployment target 最低 iOS 真机上跑过
✅ Dynamic Type 最大值下界面没破
✅ VoiceOver 能用基本流程
✅ Privacy Report(Xcode 16+ Reports → Privacy Report)看一遍
✅ TestFlight 内测 + 外测至少 1 周
✅ MetricKit + Crash 后台监控启用
✅ App Store Server Notifications V2 webhook 配好(如果有订阅)

---

## 十三、踩坑

1. **签名失败 "no matching profile"**——Bundle ID / Team / Entitlements 不一致。Automatic Signing 通常会自动修;Manual Signing 要手动对齐。
2. **CI 上签名失败**——Manual Signing + match,把 cert 和 profile 装进 CI keychain。
3. **TestFlight 用户看不到 Build**——首次 external testing 要等 Beta 审核(24h)。
4. **`agvtool` 不增 build 号**——必须在工程根目录跑,且工程里 Versioning System 选 Apple Generic。
5. **加密合规反复问**——`Info.plist` 加 `ITSAppUsesNonExemptEncryption = false`,跳过。
6. **审核员问"什么用途"**——隐私问卷与 Privacy Manifest 不一致,先把两边对齐。
7. **使用了 ATT 但没声明**——审核 reject。要么不收集 tracking 数据,要么完整声明 + ATT 弹窗。
8. **截图带 mock 数据,审核员认为是误导**——截图必须代表 App 实际功能。
9. **App Store Connect 删除 build**——build 上传后不能撤回,只能用新 build 替换。
10. **多平台 target 之间共用 Info.plist**——iOS / macOS / visionOS Info.plist 要分开,因为某些 key 平台特定。

---

## 系列收尾

27 篇写完。从"原生 iOS 的一张地图"到"签名、TestFlight 与上架",这套体系覆盖了 2026 年做一款能上 App Store 的 iOS 应用所需的全部心智:

- **01-04**:Swift 6 心智 + 工具链
- **05-10**:SwiftUI 视图层完整体系
- **11-14**:导航、SwiftData、网络、Keychain
- **15-19**:UIKit 互操作、推送、媒体、权限、后台
- **20-23**:Widget / 内购 / 端侧 AI / 无障碍
- **24-27**:性能 / Instruments / SPM 模块化 / 签名上架

把这套用到一个真实项目里,你会发现:**写代码只占 60% 时间,剩下是签名、Privacy、审核、性能调优、上架文案**。这一面之前没人系统讲过,本系列把它讲齐了。
