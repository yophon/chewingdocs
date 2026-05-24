# 30 App Store Connect、TestFlight、签名链与审核 + 多平台延伸

NotesIsland 的代码、测试、模块化都已就绪,最后一步是让它过审上架。这一步把整条链路打通:**Apple Developer 角色 → Bundle ID / Certificate / Provisioning Profile → Xcode 签名 → Archive → ASC 上传 → TestFlight 内外测 → 提交审核 → 发布**。每一步都有一类常见 reject。最后用 Catalyst / SwiftUI Multiplatform / visionOS / watchOS 给本系列收个尾:这些「兄弟平台」不是另一门技术,而是同一套 SwiftUI 心智在不同尺寸 / 输入方式 / 系统能力上的延伸,理解了延伸边界,以后看 Apple 任何新平台都不会迷路。

---

## 一、机制定位

**签名链不是「能 build 就行」。** iOS App 的合法运行必须满足:可执行文件被合法证书签名 → 证书由 Apple 签发 → Provisioning Profile 把「设备 + entitlements + 证书 + Bundle ID」绑成一个允许运行的集合 → embedded.mobileprovision 嵌入 IPA。任何一环错位都会:Xcode 上能跑,真机闪退;TestFlight 安装失败;ASC 校验通过但审核被拒。这一篇要把这条链路在 Xcode 16 自动化模式与 CI 手动模式下分别走一遍。

**TestFlight 不是「私下分发渠道」。** 内部测试组(Internal Testing)限 100 个 ASC 用户、不需审核;外部测试组(External Testing)上限 10000 用户,**首个 build 需要 TestFlight Beta App Review**,与 App Store 审核团队不同,但同样可能 reject。把审核流程左移到 TestFlight 阶段,而不是上架日才发现 reject,是合理的发布心智。

**审核的统计模式。** 2024-2026 年 Apple 审核团队节奏稳定在「首次提交 24-48 小时初审 + 平均 95% 24 小时内出结果」。最常 reject 的类别集中在:权限文案不规范(Guideline 5.1.1)、缺失隐私政策 URL(5.1.1)、Sign in with Apple 缺失(4.8)、加密合规没声明(5.5)、IAP 绕过(3.1.1)、内容不当(1.x)、第三方 SDK 隐私清单缺失(5.1.2)。提前过 checklist 比改完再提交要省好几个迭代。

**多平台延伸的「同一根」是 SwiftUI + Swift Concurrency + SwiftData。** Mac Catalyst / 原生 macOS / iPadOS / visionOS / watchOS,代码共享率从 SwiftUI 视图层到 SwiftData 数据层基本可以做到 70-90%,差异主要在交互方式(指针 / 触控 / 凝视 + 捏合)、屏幕尺寸断点、平台独有能力(window scene / immersive space / WidgetKit complication)。本篇只讲心智延伸,不展开各平台细节。

**为什么本篇放在最后。** 第 01 到第 27 篇都假设「App 已经能在模拟器跑起来」,但真要把 NotesIsland 交到用户手上,过审与多平台分发才是「最后一公里」。开发者最容易低估这一公里的复杂度:Apple Developer 后台、Xcode 签名 GUI、xcodebuild 命令行、ASC API、Resolution Center 反馈,这套链路涉及的工具和角色比代码本身还多。先把这件事跑通一遍,后续每个版本的发布周期可以从 3 天压缩到 30 分钟。这一篇也是整个系列的收尾,把前 29 篇里散落的 capability、entitlement、privacy 串成一条完整的发布管线。

---

## 二、Apple 平台心智

### Apple Developer 角色

- **Account Holder**:每个组织 1 人,法定持有者,合同与税务签署。
- **Admin**:管理证书 / Bundle ID / 团队成员,日常发布常用角色。
- **App Manager**:管理特定 App 的元数据、TestFlight 与提交审核,不能管证书。
- **Developer**:能创建开发证书 + provisioning,不能创建分发证书。
- **Marketing / Customer Support / Sales / Finance**:对应模块只读或读写,与代码无关。

新人配置原则:**给开发者 Developer 角色 + 启用 Automatic signing**,证书与 profile 由 Xcode 自动管理;CI 用单独的 API Key(App Store Connect API)而不是分发个人证书。

### 签名链的五元组

```
Apple Root CA
    ↓ 签
Apple Worldwide Developer Relations CA (WWDR)
    ↓ 签
你的 Distribution Certificate(.cer + 私钥在 keychain)
    ↓ 配合
App ID(Bundle ID, 如 dev.notesisland.app, 带 entitlements 模板)
    ↓ 配合
Devices(开发证书才有,分发证书不绑设备)
    ↓ 打包
Provisioning Profile(.mobileprovision, 含证书 + Bundle ID + Devices + Entitlements + 过期日)
    ↓ 嵌入
.ipa(embedded.mobileprovision + CodeResources + _CodeSignature/CodeDirectory)
```

四种 profile:**iOS App Development** / **Ad Hoc**(分发到指定设备,内测预览用)/ **App Store**(上架与 TestFlight 用)/ **In-House**(企业证书,需 Apple Enterprise Developer Program,App Store 不收)。NotesIsland 上架走 App Store profile,本地真机 debug 走 Development profile。

### Bundle ID 与 Capability

Bundle ID 在 ASC 端创建后,**能勾选哪些 Capability** 就锁定了:Push Notifications、iCloud(CloudKit container)、Sign in with Apple、App Groups、HealthKit、HomeKit、In-App Purchase、Associated Domains、Background Modes…… 这些 Capability 在 Xcode → Signing & Capabilities 面板里勾选,会同步到 entitlements 与 provisioning profile。**勾错 Capability,profile 会重新生成,旧的失效**——这就是为什么共享同一个 Apple Developer Team 的同事突然反映「真机跑不起来」的常见原因。

### Automatic vs Manual signing

- **Automatic signing**:Xcode 持有 Apple ID,自动管证书与 profile。本地开发与小团队首选。
- **Manual signing**:CI 必选。配合 `xcodebuild -allowProvisioningUpdates NO` + `-exportOptionsPlist`,显式声明 `provisioningProfiles` 字典;证书通过 App Store Connect API Key (`.p8`) + `xcrun notarytool` / `altool` 走 CI 沙箱。Fastlane match 把证书与 profile 加密存到私有 Git 仓库,所有 CI 共享同一份,是 2026 仍然主流的做法;Xcode Cloud 把这件事托管掉,但牺牲一些定制能力。

### TestFlight 内外测

| 维度 | Internal Testing | External Testing |
| --- | --- | --- |
| 上限 | 100 ASC 用户 | 10000 邀请用户 |
| 审核 | 不需要 | 首个 build 需 Beta App Review |
| build 有效期 | 90 天 | 90 天 |
| 邀请方式 | 邮箱 + ASC 账号 | 邮箱 / 公开链接 |
| 反馈 | TestFlight App 内截图 + 注释 | 同左 |
| 适用场景 | 团队、产品、QA | 真实用户灰度 |

策略:每个新 build 先发 Internal,跑完一轮 smoke test 再 promote 到 External。Beta App Review 通过的版本号区间会继承,只有版本号大跨度跳跃或新增重要 Capability 才会触发二审。

### 加密合规与隐私问询

每次提交都会问 **App Uses Non-Exempt Encryption?** iOS App 默认链了 HTTPS、`CryptoKit`、`CommonCrypto`,严格意义上「使用了加密」,但 Apple 提供 ATS / HTTPS / Apple-provided crypto 的豁免。在 `Info.plist` 加一行 `ITSAppUsesNonExemptEncryption = NO` 即可跳过每次手动确认。如果用了自定义加密算法(比如 NotesIsland 用 `CryptoKit` 加密本地 Note),要在 Apple 官方 BIS 报告流程走一遍年度备案。

**隐私问询(App Privacy)** 是 ASC 端独立的表单,声明 App 收集的数据类型 / 用途 / 是否关联到用户 / 是否用于追踪。NotesIsland 的填写示例:

- 收集:用户内容(Note 正文与附件)、诊断(MetricKit)。
- 用途:App Functionality、Analytics。
- 关联到用户:用户内容关联(CloudKit 私有数据库),诊断不关联。
- 追踪:无。

### 审核常见 reject 类型与对策

Apple 公开的 App Store Review Guidelines 章节虽然庞杂,但 80% 的 reject 集中在不到 10 条规则上。以下是按概率排序的「常见 reject 清单」与对策,NotesIsland 这种本地优先类 App 上架前可以逐条对照:

| 规则 | 典型 reject 文案 | 对策 |
| --- | --- | --- |
| 2.1 App Completeness | "App crashed on launch on iPad Pro" | 真机走一遍 iPad / iPhone / 至少一个旧型号(iPhone XR);开 Crashlytics 监测 TestFlight 阶段 |
| 2.3 Accurate Metadata | "Screenshot 显示了下一个版本才有的功能" | 截图必须反映当前 build 的真实功能;不要 Photoshop 加 UI |
| 2.5.1 Software Requirements | "使用了非公开 API" | 第三方 SDK 检查,`grep -r "_private" Pods/` 自查 |
| 3.1.1 In-App Purchase | "在 App 内引导用户去网页订阅" | 数字商品必须 IAP;链接到外部购买页直接被拒 |
| 4.0 Design | "粗糙的 UI / 复制系统应用" | SwiftUI 默认设计很容易过这一关,但要避免 NavigationBar 风格混乱 |
| 4.8 Sign in with Apple | "提供 Google 登录但没提供 Sign in with Apple" | 配套实现 SIWA,或者完全自有账号体系不引入第三方 |
| 5.1.1 Privacy / Data Collection | "未明确告知数据收集用途" | `Info.plist` usage description 写实际原因,不写「For better experience」 |
| 5.1.2 Privacy / Data Use | "第三方 SDK 没有 Privacy Manifest" | 升级到 SDK 最新版,或换替代品 |
| 5.5 Encryption | "未提供加密合规证明" | `ITSAppUsesNonExemptEncryption = NO` 或 BIS 备案 |

Resolution Center 的回复机制要重视:**reject 后 24 小时内回复有助于走 fast-track 二审,超过 72 小时则进入正常队列重新排期**。回复内容要逐条对应审核员提到的 issue,附 build number 与具体修复 commit;不要发情绪化文字,Apple 审核员有自己的工作语言风格,简明的英文 bullet 是最高效的沟通方式。

---

## 三、工程实现

发布全流程示例,以 NotesIsland 1.0.0 build 1 走 TestFlight + 提交审核为例。先在仓库放发布配置与 CI 脚本(脚本只展示关键 step,不是完整 fastlane 文件)。

```ini
// File: Configurations/Release.xcconfig(承接第 28 篇)
#include "Base.xcconfig"

// MARK: - 版本号与构建号
MARKETING_VERSION = 1.0.0
CURRENT_PROJECT_VERSION = 1

// MARK: - 上架 Bundle ID
PRODUCT_BUNDLE_IDENTIFIER = dev.notesisland.app

// MARK: - Manual signing(CI 用)
CODE_SIGN_STYLE = Manual
DEVELOPMENT_TEAM = ABCD123456
CODE_SIGN_IDENTITY = Apple Distribution
PROVISIONING_PROFILE_SPECIFIER = NotesIsland App Store

// MARK: - 加密合规免备案
INFOPLIST_KEY_ITSAppUsesNonExemptEncryption = NO

// MARK: - 优化与符号
SWIFT_OPTIMIZATION_LEVEL = -O
SWIFT_COMPILATION_MODE = wholemodule
DEBUG_INFORMATION_FORMAT = dwarf-with-dsym
STRIP_INSTALLED_PRODUCT = YES
```

```xml
<!-- File: Configurations/ExportOptions.plist -->
<!-- Archive 导出 IPA 时给 xcodebuild -exportOptionsPlist 用 -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store-connect</string>
    <key>teamID</key>
    <string>ABCD123456</string>
    <key>signingStyle</key>
    <string>manual</string>
    <key>signingCertificate</key>
    <string>Apple Distribution</string>
    <key>provisioningProfiles</key>
    <dict>
        <key>dev.notesisland.app</key>
        <string>NotesIsland App Store</string>
        <key>dev.notesisland.app.widget</key>
        <string>NotesIsland Widget App Store</string>
    </dict>
    <key>uploadSymbols</key>
    <true/>
    <key>uploadBitcode</key>
    <false/>
</dict>
</plist>
```

```bash
# File: scripts/release.sh
# MARK: - 一键 Archive + Validate + Upload,本地或 CI 都能跑
set -euo pipefail

WORKSPACE="NotesIsland.xcworkspace"
SCHEME="NotesIsland"
CONFIGURATION="Release"
ARCHIVE_PATH="build/NotesIsland.xcarchive"
IPA_DIR="build/ipa"
EXPORT_PLIST="Configurations/ExportOptions.plist"

# MARK: - ASC API Key(放 CI secret,不要进 git)
ASC_KEY_ID="${ASC_KEY_ID:?missing}"
ASC_ISSUER_ID="${ASC_ISSUER_ID:?missing}"
ASC_KEY_PATH="${ASC_KEY_PATH:?missing}"

# 1) Resolve packages(命中第 28 篇缓存)
xcodebuild -resolvePackageDependencies -workspace "$WORKSPACE"

# 2) Archive
xcodebuild archive \
    -workspace "$WORKSPACE" \
    -scheme "$SCHEME" \
    -configuration "$CONFIGURATION" \
    -destination 'generic/platform=iOS' \
    -archivePath "$ARCHIVE_PATH" \
    CODE_SIGN_STYLE=Manual \
    -allowProvisioningUpdates NO

# 3) Export IPA
xcodebuild -exportArchive \
    -archivePath "$ARCHIVE_PATH" \
    -exportPath "$IPA_DIR" \
    -exportOptionsPlist "$EXPORT_PLIST" \
    -allowProvisioningUpdates NO

# 4) Validate(ASC 校验,失败直接退出,不浪费上传时间)
xcrun altool --validate-app \
    -f "$IPA_DIR/NotesIsland.ipa" \
    -t ios \
    --apiKey "$ASC_KEY_ID" \
    --apiIssuer "$ASC_ISSUER_ID"

# 5) Upload
xcrun altool --upload-app \
    -f "$IPA_DIR/NotesIsland.ipa" \
    -t ios \
    --apiKey "$ASC_KEY_ID" \
    --apiIssuer "$ASC_ISSUER_ID"

echo "Uploaded. Check App Store Connect → TestFlight in ~5-15 min."
```

多平台共享代码示例,展示 SwiftUI 同一份 View 在不同设备的断点适配:

```swift
// File: Packages/NotesUI/Sources/NotesUI/AdaptiveNoteScene.swift
// MARK: - 同一份 SwiftUI 视图,适配 iPhone / iPad / Mac / visionOS
import SwiftUI
import NotesCore

public struct AdaptiveNoteScene: View {
    let store: any NoteStore
    @Environment(\.horizontalSizeClass) private var hSize

    public init(store: any NoteStore) {
        self.store = store
    }

    public var body: some View {
        #if os(visionOS)
        NavigationSplitView {
            NoteListView(store: store)
        } detail: {
            Text("Select a note").font(.extraLargeTitle)
        }
        .ornament(attachmentAnchor: .scene(.bottom)) {
            CaptureToolbar(store: store)
        }
        #else
        if hSize == .regular {
            NavigationSplitView {
                NoteListView(store: store)
            } detail: {
                Text("Select a note")
            }
        } else {
            NavigationStack {
                NoteListView(store: store)
            }
        }
        #endif
    }
}

// MARK: - 平台相关 Toolbar 在 visionOS 用 ornament,在其他平台用普通 Toolbar
struct CaptureToolbar: View {
    let store: any NoteStore
    var body: some View {
        HStack {
            Button("New Note", systemImage: "square.and.pencil") {}
            #if os(iOS) || os(visionOS)
            Button("Record", systemImage: "mic.fill") {}
            #endif
            #if os(macOS)
            Button("Import…", systemImage: "tray.and.arrow.down") {}
            #endif
        }
        .padding()
        .glassBackgroundEffect()
    }
}
```

---

## 四、调参与验收

### 发售前最后清单(Pre-flight Checklist)

| 类别 | 检查项 |
| --- | --- |
| 元数据 | App 名称、Subtitle、关键词、描述无 Apple 商标侵权;支持语言与实际本地化覆盖一致 |
| 截图 | 6.7" iPhone(必填)+ iPad 13" + visionOS(若上架) 三套尺寸都备齐;不出现状态栏假信息 |
| 隐私 | App Privacy 表单与实际数据流一致;隐私政策 URL 可访问;`PrivacyInfo.xcprivacy` 包含所有 Required Reason API |
| 权限文案 | `Info.plist` 中 `NSCameraUsageDescription` / `NSMicrophoneUsageDescription` / `NSPhotoLibraryAddUsageDescription` 等文案与实际用途一致,不写「For full functionality」这种被拒套话 |
| Sign in with Apple | 若提供第三方登录,必须同时提供 Sign in with Apple(Guideline 4.8) |
| IAP | 数字商品必须走 IAP,不能用任何外部支付链接(Guideline 3.1.1);实物商品反之不能用 IAP |
| 加密合规 | `ITSAppUsesNonExemptEncryption = NO` 或完成 BIS 备案 |
| 第三方 SDK | 所有第三方 SDK 提供自己的 `PrivacyInfo.xcprivacy`,且签名 |
| 测试账号 | 提交审核时填写 Demo 账号(若需登录),否则审核第一步就被卡 |
| 备份审核回复 | 准备 Resolution Center 回复模板;reject 时 24 小时内回复,问题清单一一对应 |
| 版本号 | Marketing Version 与 Build Number 严格递增;同一 marketing version 下 build 可以累加 |
| dSYM | 上传 IPA 包含 dSYM,Xcode Organizer 能看到 Crashes(Symbolicated)而不是 raw addresses |

### Sandboxing(macOS 与 Catalyst)

- iOS 自带 App Sandbox,无需开关;macOS 上架必须勾 App Sandbox(Capabilities → App Sandbox),并按需勾文件、网络、硬件类别。
- Catalyst App 自动继承 macOS sandbox,iOS 上写的「随便读 Documents」在 macOS 上会被限制,需要 `com.apple.security.files.user-selected.read-write` 等 entitlement。
- macOS 通过非 App Store 通道分发还要 Notarization (`notarytool submit`) + Stapling (`stapler staple`),否则用户首次打开会被 Gatekeeper 拦。

### 多设备适配清单

| 维度 | 关键点 |
| --- | --- |
| 屏幕断点 | iPhone Compact width / iPad / Mac;用 `horizontalSizeClass` + `verticalSizeClass` 而不是设备型号判断 |
| 输入方式 | 触控 / 鼠标 / 键盘 / Apple Pencil / 凝视;用 `hoverEffect()`、`keyboardShortcut()`、`focusable()` 适配 |
| Dynamic Island | iPhone 15 Pro 及以上设备,Widget 与 Live Activity 同源 SwiftUI 子集 |
| 暗色模式 | 所有 Asset 配 dark variant;`accentColor` 在两种模式都有对比度 |
| Dynamic Type | 文本可放大到 XXXLarge 不截断 |
| 横竖屏 | iPad / Mac 必须支持横屏;iPhone 仅必要时支持横屏 |
| visionOS | `glassBackgroundEffect()`、`ornament`、空间音频、`PresentationDetents`;不要假设触控存在 |
| watchOS | 心智完全不同,UI 由 `WKApplicationMain` / 现在的 `App` 协议承载,但仅子集 SwiftUI 可用 |

### Catalyst vs 原生 macOS

- **Mac Catalyst**:在 Xcode 的 General → Supported Destinations 加 `Mac Catalyst`,iPad App 直接跑在 Mac 上,需要适配菜单栏、窗口尺寸、文件访问。优势:90% 代码零改动;劣势:UI 风格更像 iPad,Mac 用户能看出来。
- **原生 macOS**(SwiftUI Multiplatform):同一 SwiftUI 工程加 macOS destination,用 `#if os(macOS)` 分歧关键控件(`Menu`、`Form` 样式、窗口管理)。优势:真正原生体验;劣势:工作量比 Catalyst 大。
- NotesIsland 推荐:**先 Catalyst 出 MVP,根据 Mac 用户反馈再决定是否做原生**。这是 2026 年仍然成立的取舍。

### visionOS / watchOS 心智延伸

- **visionOS**:SwiftUI 是默认 UI,新增三种「scene 类型」: `WindowGroup`(2D 窗口)、`ImmersiveSpace`(沉浸场景,RealityKit)、`Volume`(3D 内容容器)。手势:`SpatialEventGesture`、凝视 + 捏合;`hover` 等价于「凝视到」。空间音频用 `PHASE` framework。NotesIsland 在 visionOS 上的合理形态是 `WindowGroup` + 全屏写作模式,不需要 ImmersiveSpace。
- **watchOS**:UI 由极简的 SwiftUI 子集组成,Apple Watch 上的 NotesIsland 合理形态是 Complication(锁屏快捷信息)+ 录音入口,Complication 用 WidgetKit + ClockKit,代码与 iOS Widget 共享 ~70%。
- **共同心智**:SwiftUI + Swift Concurrency 是跨 Apple 平台的「最大公约数」,SwiftData 在 visionOS / macOS / iPadOS 上 API 一致(watchOS 也支持但容量受限),CloudKit 私有数据库跨设备同步免费。任何「Apple 出了个新平台」的新闻,你都可以按这个心智去映射,不会从零学起。

### 手动验收清单

1. 本地 Archive(Product → Archive),Organizer 显示成功,Validate App 全绿。
2. Upload 到 ASC,~15 分钟后 TestFlight 标签页出现 build,状态 `Ready to Test`(Internal)/ `Waiting for Review`(External)。
3. 用 TestFlight App 真机安装,App 启动正常,Crashes 标签页空。
4. 提交审核(App Store → New Submission),48 小时内 ASC 通知出结果。
5. 通过后 Manual release / Automatic release,App Store 全球分发生效约 4-24 小时。

---

## 五、踩坑

**坑 1:Xcode 16 Automatic signing 与 CI Manual signing 冲突。** 本地用 Automatic、CI 用 Manual,`.pbxproj` 里会有 `ProvisioningStyle = Automatic` 与 xcconfig 里的 `CODE_SIGN_STYLE = Manual` 打架,GUI 配置优先级反而高,CI 仍走 Automatic 失败。解决:**`.pbxproj` 删除 `ProvisioningStyle` 字段,完全交给 xcconfig 控制**;每次 Xcode GUI 改动 Signing & Capabilities 后 review `.pbxproj` diff,把多写出来的字段清掉。

**坑 2:Bundle ID 大小写不一致。** ASC 端的 Bundle ID 与 Xcode 中的 PRODUCT_BUNDLE_IDENTIFIER 大小写必须**完全**匹配,Apple 后端对此区分大小写,但错误信息只说「No matching provisioning profile」,新人会反复重建 profile,治不了根。

**坑 3:CloudKit container ID 与 Bundle ID 同形不同源。** Capability 勾 iCloud 后,默认 container ID 是 `iCloud.dev.notesisland.app`,**iCloud. 前缀必须保留**。Debug Bundle ID 用 `dev.notesisland.app.debug` 时,容易把 container 改成 `iCloud.dev.notesisland.app.debug` 来匹配,结果 Debug 与 Release 共用一个 CloudKit 容器的数据没了。规范:Debug 与 Release 用同一个 container ID,Bundle ID 区分,Container 不区分。

**坑 4:Privacy Manifest 缺失被静默拒。** 2024-Q2 起,使用了 Required Reason API(`UserDefaults`、`Date`、`FileManager.creationDate` 等)的 App 必须在 `PrivacyInfo.xcprivacy` 声明 reason code,缺失会在上传 ASC 时给一封邮件,不在 Xcode 报错里。第三方 SDK(如 Firebase、Sentry)必须各自带签名的 `PrivacyInfo.xcprivacy`,2024 年起 SPM 已支持把它打包进 module bundle。第 20 篇详细列了 Required Reason 清单,这里只提醒:Archive 前用 `xcrun privacymanifests` 工具自查。

**坑 5:加密合规 ASC 端反复问。** 即使 `Info.plist` 设了 `ITSAppUsesNonExemptEncryption = NO`,某些 Xcode 16 早期版本仍会让你在 ASC 端再确认一次。解决:在 Info.plist 写明确,且首次提交时手动确认一次,之后所有 build 不再问。

**坑 6:TestFlight Beta App Review 与 App Store Review 标准不同。** Beta 审核相对宽松,主要看是否能跑、是否有明显隐私违规;App Store 审核会细查每个 UI 文案、每个权限弹窗、IAP 流程。**不要因为 TestFlight 过了就认为 App Store 一定过**,我见过 Beta 通过、App Store 因为「应用图标使用了 Apple 设备形状」(Guideline 5.2.5)被拒。

**坑 7:dSYM 没上传导致线上 Crash 看不懂。** 默认 Archive 包含 dSYM,但启用了 Bitcode(虽然 Xcode 14 起 Bitcode 已 deprecated)或 SPM `.binaryTarget` xcframework 不带 dSYM 时,Crashes 标签页只显示 raw 地址。规则:`uploadSymbols = true` 在 ExportOptions.plist 永远开;第三方 xcframework 让作者提供 dSYM;接 MetricKit / Crashlytics 时上传 dSYM 到对应平台。

**坑 8:`@available(iOS 19, *)` 在 iOS 18 上没降级被拒。** 系列基线是 iOS 18,涉及 iOS 19+ API 必须用 `if #available(iOS 19, *) { ... } else { ... }` 二分支,**else 分支必须有功能可用**,不能直接 `return`,否则审核员在 iOS 18 设备上发现「这个按钮点了没反应」会按 2.1 Performance reject。

**坑 9:Catalyst App 文件读写权限。** iOS 代码里直接读 `FileManager.default.urls(for: .documentDirectory)` 在 Catalyst 上仍然能跑,但 sandbox 后只能访问 App container 内的 Documents。**不要假设 macOS 用户能从 Catalyst App 访问 ~/Documents**,需要文件访问就用 `NSOpenPanel` / `fileImporter`,并在 entitlements 勾 user-selected file。

**坑 10:visionOS 上 `UIDevice.current.userInterfaceIdiom` 不返回 `.vision`,旧分支判断失效。** Apple 在 visionOS 上把 idiom 设为 `.pad` 以兼容大量 iPad App,但**真正判断 visionOS 要用 `#if os(visionOS)` 编译期**。运行时也别写 `userInterfaceIdiom == .pad ? iPadLayout : iPhoneLayout`,visionOS 上会跑进 iPad 分支但缺手势支持。

**坑 11:watchOS App 共享 SwiftData container 失败。** SwiftData 跨 watchOS / iOS 同步要 CloudKit,**不能用本地 sqlite + App Group 简单共享**(沙箱不通)。心智:watchOS 与 iOS 是两个 sandbox,WatchConnectivity 框架做小数据点对点,大数据走 CloudKit。

**坑 12:首次发布 24 小时仍未审核。** Apple 节假日(美西 Christmas、Thanksgiving)审核会延迟 2-5 天;开发者节假日(WWDC 前后)队列也会变长。重大版本提交前查一次 Apple System Status,避开节假日,关键版本预留 72 小时缓冲。

---

至此本系列 30 篇完。从 Swift 6 心智到 SwiftUI 闭环、从系统能力到性能与发布,NotesIsland 走完了一款本地优先 + iCloud 同步的 iOS App 全生命周期。下一步要么深耕单一垂直(visionOS 空间应用、Core ML on-device 模型、Live Activity / Dynamic Island 创意),要么把这套心智复制到自己的产品。Apple 平台的核心不在 API 数量,而在「Apple 这样设计的理由」,这是本系列从第 01 篇到第 30 篇始终在打的一根桩。
