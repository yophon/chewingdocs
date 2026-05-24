# 20 权限模型与 Privacy Manifest

`NotesIsland` 集齐了 Apple 平台上几乎所有敏感能力:相机、麦克风、相册写入、定位(给笔记打地点 tag)、推送、iCloud、HealthKit(早起读书计时)、网络。每一个能力背后都对应一段被审核员盯死的合规链路:Info.plist 文案、运行时弹窗、Privacy Manifest 声明、Required Reason API 选择、ATT 追踪同意。

这一篇要把 iOS 18 时代的权限合规心智整张图画清。这是过去两年最容易被旧教程坑的一篇:**2024 春 Apple 强制要求所有上架 App 与第三方 SDK 提供 `PrivacyInfo.xcprivacy`**,2024 秋随 iOS 18 把 Required Reason API 列表扩展到更多 system call。如果你的工程还停留在"只写 Info.plist 就够了"的 2022 心智,提包给 App Store 会立刻被自动校验拒掉。

---

## 一、机制定位

iOS 上"用户隐私"这件事被 Apple 拆成了**四个独立但互相补足**的机制,工程师必须四件都做对,否则要么编译过不了、要么上架审核挂、要么运行时直接 crash。

| 机制 | 检查时点 | 不合规后果 | 工程载体 |
| --- | --- | --- | --- |
| Info.plist usage description | 运行时 / 静态分析 | App 直接 crash(no description for X) | `Info.plist` 或 build settings 里 generated entries |
| 权限弹窗 lifecycle | 运行时 | App 拿不到能力但不 crash | `AV*requestAccess` / `CLLocationManager.requestWhenInUseAuthorization` |
| **Privacy Manifest** | App Store 上传时 | TestFlight 拒收 / 审核拒 | `PrivacyInfo.xcprivacy` |
| **Required Reason API** | App Store 上传时 + iOS 18+ 运行期日志 | 上传警告 / 审核拒 | `PrivacyInfo.xcprivacy` 的 `NSPrivacyAccessedAPITypes` |
| **App Tracking Transparency (ATT)** | 运行时,首次使用追踪前 | IDFA 拿不到、广告 SDK 收不到归因 | `AppTrackingTransparency.framework` |

把这五件事画成一条时间线就是:

```
Xcode build:
  └─ Info.plist 静态校验(缺失会编译警告,但能跑;运行时缺失会 crash)
  └─ Privacy Manifest 静态校验(本地 archive 时校验,缺失能跑但上传 ASC 时报错)

App 首启:
  └─ 进入需要能力的页面 → 系统弹权限 → 用户选择 → 回调
  └─ 进入需要追踪的能力 → 调 ATTrackingManager.requestTrackingAuthorization → 弹窗
  └─ 第三方 SDK 调 Required Reason API(file timestamp / disk space ...)
      └─ iOS 18+ 后台日志记录该调用,App Store 上传时校验 manifest 是否声明对应理由

App Store Connect 上传:
  └─ 校验主 App 的 PrivacyInfo.xcprivacy
  └─ 校验所有静态 / 动态依赖的第三方 SDK 都自带 PrivacyInfo.xcprivacy
  └─ 校验所有 commonly misused APIs 都已在 manifest 声明 reason code
  └─ 比对 App Store Connect 的"数据使用问询表"是否与 manifest 一致(矛盾会拒)
```

用 UIKit 老教程 / Flutter 跨端 / RN 同类做法会遇到的坑:Flutter 项目 2024 春集体被 Firebase / GoogleSignIn 老版本卡死,因为这些 plugin 没有自带 manifest;社区的临时解法是在主工程 `ios/Runner/PrivacyInfo.xcprivacy` 里"代为声明",但**这违反 Apple 的策略**——Privacy Manifest 必须由 SDK 自己分发,主 App 只能声明自己直接用的 API。`React Native` 阵营到 2024 下半年才陆续补齐,期间大量 App 上架被拒。

本系列要建立的心智是:**Info.plist + Privacy Manifest + ATT 是三件不能互相替代的事**,Privacy Manifest 是声明"我用了什么、用来干什么";Info.plist 是给用户在弹窗里看的"为什么我要用";ATT 是"我用得到的数据是否能跨 App 追踪"。

把它放到"App 生命周期"这条主线上,你会看到三件事在不同时间点起作用:

| 时间点 | 主要校验 | 失败表现 |
| --- | --- | --- |
| Xcode 编译期 | Info.plist generated entries 字段类型、`UIBackgroundModes` 拼写 | 编译 warning;运行调对应 API 时 crash |
| Xcode archive 期 | Privacy Manifest 主 App + 所有 embedded framework | Archive 成功,但上传 ASC 时报错 |
| App 安装后首次启动 | usage description 弹窗、APNs / ATT / 定位 等运行时权限 | 用户拒绝则功能可用性下降,不会 crash(除非缺少 Info.plist key) |
| App Store 审核 | 数据使用问询表 vs xcprivacy 字段一致性 | 元数据 reject,通常 1-2 个工作日内 |
| App 上线后 | iOS 18 后台日志:Required Reason API 调用是否在 manifest | 后续版本上传时收到 Apple 邮件警告 |

---

## 二、Apple 平台心智

### 1. Info.plist usage description 必填清单

Info.plist 里这些 key 的存在与否,直接决定 App 在调相应 API 时是否会立刻 crash。这是**运行时检查**,不是上架检查——意思是你不写都不能本地跑通。

| 能力 | Info.plist key | 弹窗文案要求 |
| --- | --- | --- |
| 相机 | `NSCameraUsageDescription` | 必须中文表述具体用途,不能"用于改善体验" |
| 麦克风 | `NSMicrophoneUsageDescription` | 同上 |
| 相册读 | `NSPhotoLibraryUsageDescription` | 仅在用 `PHPhotoLibrary` 主动扫描时需要 |
| 相册写 | `NSPhotoLibraryAddUsageDescription` | `addOnly` 场景 |
| 定位:使用时 | `NSLocationWhenInUseUsageDescription` | 90% 场景用这个 |
| 定位:始终 | `NSLocationAlwaysAndWhenInUseUsageDescription` | 后台持续定位才用 |
| 蓝牙 | `NSBluetoothAlwaysUsageDescription` | 任何 CBCentralManager 都触发 |
| FaceID | `NSFaceIDUsageDescription` | LocalAuthentication 触发 |
| 通讯录 / 日历 / 提醒事项 | `NS*UsageDescription` | 同名规则 |
| 健康数据 | `NSHealthShareUsageDescription` + `NSHealthUpdateUsageDescription` | 读写要分别声明 |
| 追踪(ATT) | `NSUserTrackingUsageDescription` | 仅当你调 `ATTrackingManager.requestTrackingAuthorization` |
| 本地网络 | `NSLocalNetworkUsageDescription` | mDNS / Bonjour |

**审核员的潜规则**:文案里如果出现"用于优化体验""提供更好服务"这种空话,有 30% 概率被 reject(在 Metadata Reject 类别下)。正确写法是"为了让你将笔记的封面更换为相机拍摄的照片,我们需要访问相机"这样具体到 use case 的句子。

文案上还有一条很多人不知道的细节:**iOS 18 起,系统会显示你声明的字符串外加一段 Apple 标准化的"提供方"信息**(如 "NotesIsland 想要访问相机")。所以你的字符串不需要再重复"NotesIsland 需要",直接写"以拍摄笔记封面"即可;重复 App 名反而显得啰嗦。多语言场景把文案丢进 `Localizable.xcstrings`(第 24 篇),不要写死中文。

另外一个隐性约定:**所有 usage description 必须用第二人称"你"**——这是 Apple HIG 在 2024 更新里加的指导。"用于读取你的相册"是对的,"用于读取用户的相册"是错的,会被审核员标"非用户友好措辞"。

### 2. 权限弹窗 lifecycle

每个 Apple 权限对应一个**三态枚举**,大多数现代 API 已经统一升级为 `async` 接口。

```
未请求 (.notDetermined)
       │  调 request → 弹窗
       ▼
   ┌── 用户选择 ──┐
   │                │
.authorized   .denied / .restricted
   │                │
后续调能力直接成功    再调 request 不再弹窗,直接回 denied
```

关键认知:**`.denied` 后,App 再调一次 `requestAccess` 不会弹窗,只会立刻 callback false**。所以"权限被拒后引导用户去设置"的 UX 必须自己写,跳转用 `UIApplication.shared.open(URL(string: UIApplication.openSettingsURLString)!)`(force unwrap 这里因为是常量 URL,Apple 文档显式承诺可解析,但严格风格仍可包一层 `if let`)。

另外几个状态值得专门记住:

- **`.restricted`**:这是"家长控制 / MDM 限制"导致的不可用,跟用户主动拒绝是不同语义。App 如果纯把它当成 `.denied` 处理也行,但提示文案要避免"前往设置开启",因为用户去了设置也开不了——更友好的写法是"该功能在你的账号下不可用"。
- **iOS 14+ 的相机"指示灯"**:用户在系统设置里可以看到 App 最近 7 天访问了哪些权限,任何"偷偷在后台开相机"的行为会被立刻发现。这不是 App 层能干预的,但意味着**你声明了相机就别让它常驻**;不用时 `stopRunning`。
- **iOS 17 新增的"应用隐私报告"全平台开启**:用户在"设置 → 隐私 → 应用隐私报告"能看到 7 天内 App 调过的传感器与网络域名。`NotesIsland` 的 Privacy Manifest `NSPrivacyTrackingDomains` 写哪些,这里就会清晰地呈现哪些;如果你声明了空数组但实际请求了某个第三方分析域名,用户能直接看到这条不一致。

### 3. Privacy Manifest 是什么

`PrivacyInfo.xcprivacy` 是一个 plist 文件,Apple 在 WWDC 2023 引入、2024 春正式强制。它里面声明四件事:

```xml
<plist version="1.0">
<dict>
  <key>NSPrivacyTracking</key>          <!-- 是否做跨 App 追踪 -->
  <false/>
  <key>NSPrivacyTrackingDomains</key>   <!-- 用于追踪的域名,会被 iOS 在 ATT 拒后自动屏蔽 -->
  <array/>
  <key>NSPrivacyCollectedDataTypes</key><!-- 收集了哪些数据类型(与 ASC 问询表对齐) -->
  <array>...</array>
  <key>NSPrivacyAccessedAPITypes</key>  <!-- Required Reason API 的使用声明 -->
  <array>...</array>
</dict>
</plist>
```

它和 Info.plist 的分工是:Info.plist 解释**给用户**,Privacy Manifest 声明**给 Apple 审核**。两者数据可能重叠(比如 "我用了相机"),但格式与受众完全不同。

`NSPrivacyCollectedDataTypes` 是 Privacy Manifest 里最容易被忽视、但审核打回率最高的一项。它是一个数组,每项描述"你 App 收集了哪种数据 + 是否与用户身份关联 + 是否用于追踪 + 收集目的"。Apple 把"数据类型"分成 14 大类(身份、联系方式、健康、位置、用户内容、浏览/搜索历史、识别符、购买、财务、诊断、其他用法、敏感信息……),每大类下有 30~40 个具体子项。**这张表必须与 App Store Connect 后台的"App Privacy"问询表逐条对齐**,否则 ASC 一边校验通不过。

举个 `NotesIsland` 的具体例子:你拍的照片属于 `NSPrivacyCollectedDataTypePhotosOrVideos`;录音是 `NSPrivacyCollectedDataTypeAudioData`;你给笔记打的位置 tag 是 `NSPrivacyCollectedDataTypeCoarseLocation`(只精确到城市)或 `NSPrivacyCollectedDataTypePreciseLocation`(精确到 100 米)——具体取决于你怎么处理 CoreLocation 返回的精度;iCloud 同步用的 Apple ID 属于 `NSPrivacyCollectedDataTypeUserID`,但因为这是 Apple 内部 ID、App 永远拿不到明文,**不需要**声明。这些细节没人会告诉你,只能靠每次 reject 后查 Apple 文档慢慢补全。

### 4. Required Reason API:不让你"偷偷用旧 API"

Apple 注意到一个现象:很多 SDK 用 `mach_absolute_time` / `kern.boottime` / `UserDefaults` 当指纹做跨 App 追踪。从 2024 春开始,Apple 列出一份 **"Commonly Misused APIs"** 清单,凡是调用这些 API 的代码必须在 Privacy Manifest 里声明**理由代码**。

iOS 18 时代主要 API 类别(每类有几个具体子项):

| API 类别 | 典型方法 | 常见合法理由 |
| --- | --- | --- |
| `NSPrivacyAccessedAPICategoryFileTimestamp` | `attributesOfItem(atPath:)` / `creationDate` | `C617.1` 在 App 内向用户显示文件信息 |
| `NSPrivacyAccessedAPICategorySystemBootTime` | `mach_absolute_time` / `kern.boottime` | `35F9.1` 测量 App 内事件之间的时间 |
| `NSPrivacyAccessedAPICategoryDiskSpace` | `volumeAvailableCapacity` | `E174.1` 在写入前检查空间 |
| `NSPrivacyAccessedAPICategoryActiveKeyboards` | `UITextInputMode.activeInputModes` | `54BD.1` 适配键盘语言 |
| `NSPrivacyAccessedAPICategoryUserDefaults` | `UserDefaults` 标准实例 | `CA92.1` 仅用于本 App 自身偏好 |

理由代码列表 Apple 维护在文档 *Describing use of required reason API*,**只能从清单里选,不能自己编**。审核员会把不在清单里的理由当作未声明处理。

特别值得一提的是 `NSPrivacyAccessedAPICategoryUserDefaults`。**几乎每个 App 都用 UserDefaults**(SwiftUI `@AppStorage` 底下就是它)。Apple 给的合规理由是 `CA92.1`("App 用 UserDefaults 仅用于自身偏好");如果你用 `UserDefaults(suiteName:)` 与 App Extension 共享数据,需要的是 `1C8F.1`;如果是第三方 SDK 把你的 UserDefaults 当 fingerprint 储存,**该 SDK 必须自报理由**,App 一侧不替它兜。

`NSPrivacyAccessedAPICategorySystemBootTime` 同样普遍——任何用 `ProcessInfo.systemUptime` 做性能监控的库都会触发。`35F9.1` 是合法理由,但前提是数据**不离开设备**;一旦上传到服务器,Apple 会判定为指纹追踪嫌疑,理由就要改成 `8FFB.1`(测量同一 App 的性能)。

### 5. ATT 与 IDFA

`AppTrackingTransparency` 是一个独立框架,与上述都不重叠。心智一句话:**只要你想跨 App 拼接用户身份(广告归因 / 跨产品画像 / 与第三方共享 user id),就必须先弹 ATT 弹窗并拿到 `.authorized`。**

- IDFA(`ASIdentifierManager.shared().advertisingIdentifier`):ATT 未授权时永远返回全 0 的 UUID。
- ATT 弹窗时机:Apple 强烈建议**不要在冷启动第一屏就弹**,审核员会以"未给用户做任何价值说明就索权"拒绝;正确做法是先在自己的 onboarding 页用一张图说清"为什么这对你有好处",再调 `requestTrackingAuthorization`。
- ATT 与系统权限有联动:`ATTrackingManager.trackingAuthorizationStatus == .authorized` 之外,**Settings → 隐私 → 跟踪 → 总开关**也必须开,否则你弹窗都弹不出来。

### 6. SKAdNetwork 与 ATT 的关系

很多团队搞不清 **SKAdNetwork (SKAN)** 和 ATT 的关系。一句话:**SKAN 是 Apple 给广告归因的替代方案,即使 ATT 拒绝你也能用**。它的原理是 Apple 在系统层做"延迟、聚合、加噪声"的归因回执,广告主收不到任何个体级数据。`NotesIsland` 如果不投广告就不用关心 SKAN;一旦做付费推广,工程要做的是在 ASC 配置 SKAdNetwork ID、在 Info.plist 加 `SKAdNetworkItems`,与 ATT 是**并行的两条路径**,不互相替代。

### 7. 第三方 SDK 的 Privacy Manifest 校验

Apple 2024 春发邮件给所有 App 开发者列出一份**"常用 SDK 清单"**(约 100 个),包括 Firebase / Adjust / AppsFlyer / Crashlytics / 微信 / 字节、阿里全家桶等。这份清单上的 SDK **必须有自带 PrivacyInfo.xcprivacy**,否则提包就拒。Apple 的官方表态是清单会持续扩展。

实操层面:每次升级 SDK 版本前,在它的 `.xcframework` 包里 `find . -name "PrivacyInfo.xcprivacy"`,看是否存在并且字段是否合理(理由代码是否声明、collected data 是否如实)。本系列在第 28 篇会专门讲 SPM 私有源,届时也会把"自动校验 manifest"加进 build phase。

---

## 三、工程实现

### 3.1 集中式权限封装

```swift
// File: Core/Privacy/PermissionCenter.swift
import AVFoundation
import Photos
import CoreLocation
import UserNotifications
import AppTrackingTransparency
import UIKit

// MARK: - 抽象权限状态
enum PermissionState: Sendable {
    case notDetermined, authorized, denied, limited
}

// MARK: - 集中调度权限请求,所有调用都返回 async
@MainActor
enum PermissionCenter {

    static func camera() async -> PermissionState {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: return .authorized
        case .denied, .restricted: return .denied
        case .notDetermined:
            return await AVCaptureDevice.requestAccess(for: .video) ? .authorized : .denied
        @unknown default: return .denied
        }
    }

    static func microphone() async -> PermissionState {
        switch AVAudioApplication.shared.recordPermission {
        case .granted: return .authorized
        case .denied: return .denied
        case .undetermined:
            return await AVAudioApplication.requestRecordPermission() ? .authorized : .denied
        @unknown default: return .denied
        }
    }

    static func photoAddOnly() async -> PermissionState {
        let s = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
        return map(s)
    }

    static func locationWhenInUse(_ manager: CLLocationManager) async -> PermissionState {
        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse: return .authorized
        case .denied, .restricted: return .denied
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
            // CLLocationManager 没有 async API,需要等 delegate;
            // 这里做最朴素的轮询,生产代码用 CLLocationManagerDelegate 桥接 continuation。
            for _ in 0..<60 {
                try? await Task.sleep(for: .milliseconds(100))
                if manager.authorizationStatus != .notDetermined { break }
            }
            return manager.authorizationStatus == .authorizedWhenInUse ? .authorized : .denied
        @unknown default: return .denied
        }
    }

    static func push() async -> PermissionState {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral: return .authorized
        case .denied: return .denied
        case .notDetermined:
            let ok = (try? await center.requestAuthorization(options: [.alert, .badge, .sound])) ?? false
            return ok ? .authorized : .denied
        @unknown default: return .denied
        }
    }

    // 这里展示 ATT 应该 *先讲价值再弹窗*
    static func tracking() async -> PermissionState {
        switch ATTrackingManager.trackingAuthorizationStatus {
        case .authorized: return .authorized
        case .denied, .restricted: return .denied
        case .notDetermined:
            let s = await ATTrackingManager.requestTrackingAuthorization()
            return map(s)
        @unknown default: return .denied
        }
    }

    // MARK: - 引导被拒用户去系统设置
    static func openSettings() {
        if let url = URL(string: UIApplication.openSettingsURLString) {
            UIApplication.shared.open(url)
        }
    }

    private static func map(_ s: PHAuthorizationStatus) -> PermissionState {
        switch s {
        case .authorized: return .authorized
        case .limited: return .limited
        case .denied, .restricted: return .denied
        case .notDetermined: return .notDetermined
        @unknown default: return .denied
        }
    }
    private static func map(_ s: ATTrackingManager.AuthorizationStatus) -> PermissionState {
        switch s {
        case .authorized: return .authorized
        case .denied, .restricted: return .denied
        case .notDetermined: return .notDetermined
        @unknown default: return .denied
        }
    }
}
```

### 3.2 PrivacyInfo.xcprivacy(NotesIsland 主 App)

```xml
<!-- File: NotesIsland/PrivacyInfo.xcprivacy -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
"http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSPrivacyTracking</key>
  <false/>
  <key>NSPrivacyTrackingDomains</key>
  <array/>

  <key>NSPrivacyCollectedDataTypes</key>
  <array>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypePhotosOrVideos</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <true/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array>
        <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
      </array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypeAudioData</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <true/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array>
        <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
      </array>
    </dict>
  </array>

  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryFileTimestamp</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <string>C617.1</string>
      </array>
    </dict>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <string>CA92.1</string>
      </array>
    </dict>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryDiskSpace</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <string>E174.1</string>
      </array>
    </dict>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategorySystemBootTime</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <string>35F9.1</string>
      </array>
    </dict>
  </array>
</dict>
</plist>
```

> `NSPrivacyTracking` 必须显式写 `false`,**不写**会被审核员当成"未声明,默认按 true 处理"。

### 3.3 Info.plist usage description(以 xcconfig 风格管理)

```swift
// File: BuildConfig/Shared.xcconfig
// MARK: - 用 xcconfig 集中管理用户可见文案,便于多语言与 environment 切换
INFOPLIST_KEY_NSCameraUsageDescription = 用于让你拍摄笔记的封面与附图
INFOPLIST_KEY_NSMicrophoneUsageDescription = 用于录制你随手记下的语音备忘
INFOPLIST_KEY_NSPhotoLibraryAddUsageDescription = 用于把刚拍的封面图保存到你的相册
INFOPLIST_KEY_NSLocationWhenInUseUsageDescription = 用于为这条笔记打上你当时所在地点的标签
INFOPLIST_KEY_NSUserTrackingUsageDescription = 用于在你授权后,将你的兴趣偏好用于推荐附近的书店
INFOPLIST_KEY_UIBackgroundModes = audio remote-notification fetch processing
```

Xcode 16 的"Generated Info.plist"模式直接读 build settings,不再硬编 plist 文件;`INFOPLIST_KEY_*` 这一组就是这套机制的关键(详见第 02 篇)。

### 3.4 ATT 入口:先讲价值,再弹窗

```swift
// File: Features/Onboarding/TrackingConsentView.swift
import SwiftUI
import AppTrackingTransparency

// MARK: - 这是 ATT 的 *预弹窗* 教学屏,审核员爱看
struct TrackingConsentView: View {
    let onDone: (PermissionState) -> Void

    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: "person.crop.circle.badge.questionmark")
                .font(.system(size: 56))
            Text("是否允许 NotesIsland 使用你的设备标识?")
                .font(.title2).bold().multilineTextAlignment(.center)
            Text("仅用于在你授权后,展示与本地书店、独立咖啡馆等线下空间相关的推荐内容,绝不与第三方共享你的笔记内容。")
                .font(.body).foregroundStyle(.secondary)
                .multilineTextAlignment(.center).padding(.horizontal, 16)

            Button("继续") {
                Task {
                    let result = await PermissionCenter.tracking()
                    onDone(result)
                }
            }
            .buttonStyle(.borderedProminent)

            Button("以后再说") { onDone(.notDetermined) }
                .buttonStyle(.plain)
        }
        .padding(32)
    }
}
```

注意:`requestTrackingAuthorization` 只能弹一次,**用户选过就再也弹不出**。所以"以后再说"按钮的语义不是"等会儿再弹",而是"我先不动,你想清楚再回来开"。

### 3.5 校验第三方 SDK 是否带 Privacy Manifest 的 CI 脚本

```bash
# File: scripts/check-sdk-privacy.sh
# MARK: - Archive 后扫描所有 framework / xcframework,确保都带 PrivacyInfo.xcprivacy
set -euo pipefail
ARCHIVE="$1"
APP_BUNDLE="$ARCHIVE/Products/Applications/NotesIsland.app"
MISSING=()
while IFS= read -r -d '' fw; do
  name=$(basename "$fw")
  if ! find "$fw" -name "PrivacyInfo.xcprivacy" -maxdepth 4 | grep -q .; then
    MISSING+=("$name")
  fi
done < <(find "$APP_BUNDLE/Frameworks" -maxdepth 1 -type d -name "*.framework" -print0)

if [ "${#MISSING[@]}" -gt 0 ]; then
  echo "[FAIL] 以下 framework 缺少 PrivacyInfo.xcprivacy:"
  printf '  - %s\n' "${MISSING[@]}"
  exit 1
fi
echo "[OK] 全部 framework 都带了 Privacy Manifest"
```

把这段放进 Xcode Cloud / fastlane post-archive hook,本地 archive 就能预判 ASC 那边的校验结果。

---

## 四、调参与验收

| 维度 | 关键参数 | 建议值 / 心智 |
| --- | --- | --- |
| Info.plist 文案 | usage description 字符串 | 必须中文且具体到 use case;包含"用于…为…"的句式 |
| ATT 弹窗时机 | `requestTrackingAuthorization` 调用点 | onboarding 第 2~3 屏,讲完价值后;**不要**在 didFinishLaunching 内 |
| 定位策略 | `WhenInUse` vs `Always` | 默认全部 `WhenInUse`;申请 `Always` 必须有真实后台 use case,审核会盯 |
| Privacy Manifest 完整性 | `NSPrivacyAccessedAPITypes` | 主 App + 每个内嵌 framework 都自带 |
| 静态库 SDK 处理 | `.a` 文件无法内嵌 manifest | 必须升级到 `.xcframework` 版本,否则上架会拒 |
| 数据使用声明一致性 | ASC 问询表 vs xcprivacy | 必须字面一致;一边写"无追踪"另一边收 IDFA 一定挂 |
| `limited` 相册 | `PHPhotoLibrary.shared().presentLimitedLibraryPicker` | iOS 17+ 用 `presentLimitedLibraryPicker(from:)` 在 limited 状态下让用户追加图 |
| 推送 provisional | `requestAuthorization(options: [.provisional])` | 不弹窗静默授权,只能进通知中心、不弹横幅。给"试用通知"做软启发用 |

### 手动验证清单

**Privacy Manifest 静态验证(Xcode 16):**

打开 Xcode → Product → Archive → Distribute App → "Validate App",ASC 服务端会扫整包 Privacy Manifest。这一步**完全本地化在 Apple 服务器侧**,所以 dev sandbox 没问题不代表 release 也没问题——必须 archive 走一次。`xcodebuild -exportArchive` 在 CI 上也能触发同样的校验,失败时 stderr 里会列具体缺失的 framework。

**Privacy Report 用户视角验证:**

模拟器无法生成 App Privacy Report;需要真机,且在"设置 → 隐私与安全性 → 应用隐私报告"打开开关。打开后用 App 几天,设置里能看到一张时间线:几点几分访问了相机、几点几分定位、向哪些域名发了请求。如果某条记录与你 `NSPrivacyTrackingDomains` 不符,该域名会被自动标红。



1. 初次安装、首启 `NotesIsland`,在进入相机页时弹相机权限,文案是 Info.plist 里那句具体的中文。
2. 进入"语音备忘",弹麦克风权限。
3. 进入"位置标签",弹定位权限,只有 `When In Use` 选项,**没有** `Always`(因为只声明了 `WhenInUseUsageDescription`)。
4. 完成 onboarding 进入 ATT 教学屏,点继续后才弹系统 ATT 弹窗。
5. 拒绝所有权限,杀进程,再次启动,**不再弹窗**,功能区显示"前往设置开启…"按钮,点击跳转 Settings App 对应页面。
6. `xcodebuild archive` 后跑 `scripts/check-sdk-privacy.sh`,如果引入了某个老版本 SDK 无 manifest,脚本应 exit 1。
7. 用 Xcode Organizer 上传到 ASC,**没有** Privacy Manifest 相关警告邮件。
8. ASC 后台填"App Privacy"问询表,填的数据类型应与 `NSPrivacyCollectedDataTypes` 一一对应。

---

## 五、踩坑

**1. "Required Reason API" 是按 framework 维度逐一检查,不是按 App 整体**。即便你主 App 没用 `creationDate`,如果你引入的 Firebase Analytics 用了但它自己 manifest 没声明,Apple 邮件警告依然会发到你。解决路径:升级到带 manifest 的 SDK 版本;无法升级时只能换库。

**2. 不要把通用理由 `35F9.1` 当万能挡箭牌**。审核员现在会人工抽查 Reason Code 与代码实际行为是否一致。比如声明了 `35F9.1`("测量 App 内事件时间")但 SDK 实际把 `mach_absolute_time` 上传到了服务器做指纹,会被以"虚假 manifest"拒。

**3. Swift 5 老教程里的 `AVAudioSession.sharedInstance().requestRecordPermission { granted in ... }` 在 Swift 6 严格并发下会编译警告**:closure 跨 actor 边界。正确写法是用 iOS 17 新加的 `AVAudioApplication.requestRecordPermission()` async 版本(代码 3.1 已演示)。`AVAudioSession.recordPermission` 同样被弃用,改用 `AVAudioApplication.shared.recordPermission`。

**4. `CLLocationManager` 是 iOS 平台里**最后一个**没有 async API 的核心权限**。社区方案是用 `AsyncStream` 桥接 delegate(代码 3.1 给的轮询是教学简化),生产代码请封装一个 `LocationAuthBridge: NSObject, CLLocationManagerDelegate` actor。

**5. `NSPhotoLibraryUsageDescription` 不要乱填**。只要这个 key 存在,审核员就会认为 App 会扫描全相册,会要求 demo 视频展示对应能力;只用 `PhotosPicker` 的项目应**只填** `NSPhotoLibraryAddUsageDescription`,或者两个都不填(纯 picker 场景)。

**6. iOS 19 引入更严的 Privacy Manifest 校验**:动态加载的 framework(`dlopen`)、Plug-in、App Extension 都必须各自带 manifest。iOS 18 部署目标下不强制,但 archive 阶段就提示警告;为安全起见,把这条加入第 30 篇"发布前清单"里。

**7. ATT 弹窗 + Notification 弹窗**短时间叠加会被 iOS 自动延迟,且 `requestTrackingAuthorization` 文档里有一句"App must be in active state",意味着如果你在 `applicationDidFinishLaunching` 里立刻调,可能根本不会弹——它会被静默丢弃且 status 仍是 `.notDetermined`。正确做法是在 `scenePhase == .active` 后再调。

**8. 千万不要为了"看起来合规"而 over-declare**。声明了 `NSPrivacyTracking = true` 但代码里其实没追踪,审核员同样会按 "你声明了,但 ATT 流程里没引导用户" 拒掉。**声明应忠实反映代码事实**,过保守与过激进都会出事。

**9. Privacy Manifest 与 App Privacy Report**(iOS 15.2+)的差异:Privacy Manifest 是声明式的,给审核看;App Privacy Report 是运行时记录的,给用户在系统设置里看。两者不一致时,**用户能直接通过 Settings 看到你 App 实际访问了哪些域名**,被吐槽几率极高。

**10. `@AppStorage` 等价于 UserDefaults**,意味着只要 App 用了 `@AppStorage`,就触发 Required Reason API。Apple 没有给"`@AppStorage` 例外条款",必须在 manifest 里声明 `CA92.1`。新手用 SwiftUI 时容易以为这是"语言糖",其实底下就是 `UserDefaults.standard`,合规义务一致。

**11. iCloud Drive 容器、App Group、Keychain 都不是"独立权限"**——它们是 entitlement(签名时打到 provisioning profile 上的),不出现在 Info.plist 也不弹运行时窗口,但**会在审核时审查"是否过度索权"**。`NotesIsland` 只需 `iCloud Container` + `CloudKit` 两个 entitlement,不要顺手勾上 `HealthKit` / `HomeKit`,否则审核员会问"你 App 跟健康数据有什么关系"。

**12. Sign in with Apple 是另一个软强制**:如果你 App 支持任意第三方登录(微信、Google、Facebook),Apple 强制要求你**同时**支持 Sign in with Apple,且不能放在不显眼的角落。这是合规清单里最容易被遗漏的一条,不在 Privacy Manifest 里,但属于 App Review Guidelines 4.8。详见第 23 篇 StoreKit 2 + Sign in with Apple。

**13. 关于"功能性 Cookie / 数据"豁免**:不是所有数据收集都要在 ASC "数据使用问询表"里声明。Apple 给的豁免条款是:**单次使用、不离开设备、不和用户身份关联**的数据可以不声明(例如崩溃捕获时的栈帧)。`NotesIsland` 录的音频是要写入 iCloud 的、与用户身份关联,所以**必须声明**;而你为了排版临时计算的 SwiftUI layout 缓存,不需要。

**14. 提交版本号差异**:每次提交新 App 版本,Apple 都会把当前版本的 Privacy Manifest 与上一版本比对,**新增字段**会被特别提示审核员关注。所以"在 1.0.5 突然加上 `NSPrivacyCollectedDataTypePreciseLocation`"几乎一定会引发人工 review;合理做法是在新增能力时同步在版本说明里向 Apple 解释(ASC 后台有 "App Review Information → Notes" 字段)。

**15. iOS 19+ 引入"会话级权限"**(预告 API,具体命名可能调整):一些低敏感能力将允许"仅本次会话授权,杀进程后回到未授权"。这会让"按需弹窗 / 按需销毁"成为新规范,本系列基线 iOS 18 暂不展开,但工程结构应避免把权限状态在 UserDefaults 里缓存太久,以便未来兼容。
