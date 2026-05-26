# 权限与 Privacy Manifest

iOS 在隐私上的强硬态度是它区别于 Android 的核心阵地之一。每个权限弹窗、每个 `Info.plist` 字段、每个 API 调用都受 Apple 审核约束;2024 年起强制的 `PrivacyInfo.xcprivacy` 让"哪些 SDK 用了哪些敏感 API、收集了哪些数据"全部公开化。这一篇讲透:**权限弹窗 lifecycle、`Info.plist` usage description 必填项、Privacy Manifest、Required Reason API、ATT 弹窗时机**。

> 一句话先记住:**iOS 权限不只是"申请",还有"声明 + 审核 + 文档"——`Info.plist` 必填 usage description,`PrivacyInfo.xcprivacy` 必填用了哪些 Required Reason API,App Store Connect 还要单独勾"收集了哪些数据"。三处不一致,审核就拒。**

---

## 一、权限弹窗 lifecycle

iOS 上所有"敏感能力"的权限都有相同的状态机:

```
notDetermined ─── App 调 API ───→ 系统弹窗
                                     │
                                     ├─→ 用户允许 → authorized
                                     ├─→ 用户拒绝 → denied
                                     └─→ 限制(MDM/家长控制)→ restricted
```

**关键事实**:**`denied` 后,App 不能再次弹系统对话框**——你只能引导用户去系统设置:

```swift
if let url = URL(string: UIApplication.openSettingsURLString) {
    await UIApplication.shared.open(url)
}
```

所以**首次请求权限的 UX 至关重要**——拒绝一次,你就要让用户跳设置才能改。最佳实践:

1. **不要 App 启动就请求**——用户不知道为啥要,大概率拒
2. **在用户做关键操作时再请求**——比如点击"+ 添加照片"才请求相册
3. **请求前给 onboarding 提示**——自定义 UI 解释为什么需要,用户准备好了再点"继续"触发系统弹窗
4. **被拒后给清晰引导**——"未开启权限"的空状态视图 + 跳设置按钮

---

## 二、Info.plist usage description 清单

iOS 18 涉及的所有 usage description key,缺一项 crash:

| Key | 触发场景 |
| --- | --- |
| `NSCameraUsageDescription` | `AVCaptureDevice.requestAccess(for: .video)` |
| `NSMicrophoneUsageDescription` | `AVCaptureDevice.requestAccess(for: .audio)` / 录音 |
| `NSPhotoLibraryUsageDescription` | `PHPhotoLibrary.requestAuthorization(for: .readWrite)` |
| `NSPhotoLibraryAddUsageDescription` | `PHPhotoLibrary.requestAuthorization(for: .addOnly)` |
| `NSLocationWhenInUseUsageDescription` | `CLLocationManager.requestWhenInUseAuthorization()` |
| `NSLocationAlwaysAndWhenInUseUsageDescription` | `requestAlwaysAuthorization()` |
| `NSContactsUsageDescription` | `CNContactStore.requestAccess(for: .contacts)` |
| `NSCalendarsUsageDescription` | `EKEventStore.requestAccess(to: .event)` |
| `NSRemindersUsageDescription` | `EKEventStore.requestAccess(to: .reminder)` |
| `NSBluetoothAlwaysUsageDescription` | `CBCentralManager` 蓝牙 |
| `NSMotionUsageDescription` | `CMMotionManager` 运动传感器 |
| `NSSpeechRecognitionUsageDescription` | `SFSpeechRecognizer` |
| `NSFaceIDUsageDescription` | `LAContext` Face ID |
| `NSAppleMusicUsageDescription` | MusicKit |
| `NSHealthShareUsageDescription` | HealthKit 读 |
| `NSHealthUpdateUsageDescription` | HealthKit 写 |
| `NSHomeKitUsageDescription` | HomeKit |
| `NSUserTrackingUsageDescription` | `ATTrackingManager.requestTrackingAuthorization()` (iOS 14+) |

**Description 写法的几条规则**:
- **不要写"App 需要相机"** — 这是废话,系统已经知道
- **写"用相机拍摄你的笔记附图"** — 说清楚"用来做什么具体的事"
- **不要用"App"自称** — Apple 审核员被训练过看到这个会皱眉
- **支持多语言**(`.xcstrings` 里) — 中文 App 上架国际版必备

---

## 三、Privacy Manifest 强制要求

2024 年起,Apple 要求每个 App + 每个 SDK 都有 `PrivacyInfo.xcprivacy` 文件,声明:

1. **NSPrivacyTracking**:是否做用户追踪
2. **NSPrivacyTrackingDomains**:用于追踪的域名清单
3. **NSPrivacyCollectedDataTypes**:收集的数据类型清单
4. **NSPrivacyAccessedAPITypes**:用了哪些 Required Reason API

Manifest 是 plist 格式,在 Xcode 里 File → New → File → Privacy Manifest:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
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
            <string>NSPrivacyCollectedDataTypeUserID</string>
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
            <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <string>CA92.1</string>
            </array>
        </dict>
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryFileTimestamp</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <string>C617.1</string>
            </array>
        </dict>
    </array>
</dict>
</plist>
```

**这个文件审核会自动扫描**,缺失或错误会直接 reject。Apple 还会扫**所有 SDK 的 PrivacyInfo**——SDK 没声明,你 App 直接背锅。

---

## 四、Required Reason API 清单

某些 API 即使是公开的,使用时也要在 Privacy Manifest 里声明"用它做什么"。Apple 把这些归为 5 大类(2026 年最新):

| Category | 触发示例 |
| --- | --- |
| `NSPrivacyAccessedAPICategoryFileTimestamp` | `creationDate` / `modificationDate` / `fileModificationDate` |
| `NSPrivacyAccessedAPICategorySystemBootTime` | `CACurrentMediaTime` / `mach_absolute_time` |
| `NSPrivacyAccessedAPICategoryDiskSpace` | `volumeAvailableCapacity*` |
| `NSPrivacyAccessedAPICategoryActiveKeyboard` | `UITextInputMode.activeInputModes` |
| `NSPrivacyAccessedAPICategoryUserDefaults` | `UserDefaults` 任何读写 |

每类都有一组合法 reason code(`CA92.1` = "App functionality 所需",`C617.1` = "Backup/sync to user's own storage" 等)。**用 API 必选其中一个 reason,不能 wild-card 全选**。

**SDK 也要遵守这个清单**——FCM、Bugly、各种统计 SDK 在 2024 年都更新了自己的 Manifest。**接入第三方 SDK 时,第一件事检查它有没有 PrivacyInfo**,没有的 SDK 会让你 App 被拒。

---

## 五、Tracking 与 IDFA

**Tracking** 在 Apple 定义里是"把用户行为关联到第三方数据集" — 比如把 App 内的购买行为发给广告平台用于 attribution。

要 tracking,需要 ATT(App Tracking Transparency):

```swift
import AppTrackingTransparency

let status = await ATTrackingManager.requestTrackingAuthorization()
switch status {
case .authorized:
    let idfa = ASIdentifierManager.shared().advertisingIdentifier
    // 现在你能拿到 IDFA,可以做 attribution
case .denied, .restricted, .notDetermined:
    // IDFA = "00000000-0000-0000-0000-000000000000"
    // 不能做 cross-app tracking
@unknown default: break
}
```

`Info.plist` 加 `NSUserTrackingUsageDescription`。

**ATT 的痛点**:
- iOS 14 起强制,用户拒绝率约 70-80%
- 大多数普通 App 根本不需要 tracking,直接 `NSPrivacyTracking = false` 跳过
- 广告变现 / attribution 重的 App 才会去争取这个权限

**只有 tracking 的 App 才需要 ATT**——单纯做"App 内分析"(看用户在 App 内行为)不算 tracking,不用 ATT。

---

## 六、收集数据类型清单

App Store Connect 的"隐私问题"问卷,与 Privacy Manifest 的 `NSPrivacyCollectedDataTypes` 必须一致。常见数据类型:

| Type | 例子 |
| --- | --- |
| `NSPrivacyCollectedDataTypeName` | 姓名 |
| `NSPrivacyCollectedDataTypeEmailAddress` | 邮箱 |
| `NSPrivacyCollectedDataTypePhoneNumber` | 手机号 |
| `NSPrivacyCollectedDataTypeAddress` | 地址 |
| `NSPrivacyCollectedDataTypeUserID` | App 内用户 ID |
| `NSPrivacyCollectedDataTypeDeviceID` | 设备 ID(IDFV、自定义 device id) |
| `NSPrivacyCollectedDataTypePreciseLocation` | 精确位置 |
| `NSPrivacyCollectedDataTypeCoarseLocation` | 大致位置 |
| `NSPrivacyCollectedDataTypePhotosOrVideos` | 用户的照片 / 视频 |
| `NSPrivacyCollectedDataTypeUserContent` | 用户输入的内容(笔记 / 消息) |
| `NSPrivacyCollectedDataTypeAudioData` | 录音 |
| `NSPrivacyCollectedDataTypeOtherUsageData` | 使用行为(点击 / 浏览) |
| `NSPrivacyCollectedDataTypeCrashData` | 崩溃数据 |
| `NSPrivacyCollectedDataTypePerformanceData` | 性能指标 |

每个类型还要指明:
- **`Linked`**:是否能关联到具体用户?(false 表示完全匿名)
- **`Tracking`**:是否用于 tracking?
- **`Purposes`**:用途(App 功能、分析、个性化、第三方广告、产品改进等)

---

## 七、Location 权限的细分

Location 比其他权限更复杂,因为有"使用时"和"始终"的区别:

```swift
let manager = CLLocationManager()

// 第一阶段:请求 "When In Use"
manager.requestWhenInUseAuthorization()
// 此时弹窗,用户可选 "允许使用 App 时" / "仅一次" / "不允许"

// 第二阶段:在用户开启 When In Use 后,可申请 "Always"
// 注意:不能跳过第一步直接请求 Always
manager.requestAlwaysAuthorization()
```

iOS 14+ 还增加了"**精确位置**"开关——用户可以授权大致位置(几公里精度)而不是精确位置(米级):

```swift
let accuracy = manager.accuracyAuthorization
switch accuracy {
case .fullAccuracy: ...        // 精确位置
case .reducedAccuracy: ...     // 大致位置(用户主动降级了)
@unknown default: break
}

// 临时请求一次精确(比如导航 App 启动时)
manager.requestTemporaryFullAccuracyAuthorization(withPurposeKey: "Navigation")
```

`Info.plist` 加 `NSLocationTemporaryUsageDescriptionDictionary`:

```xml
<key>NSLocationTemporaryUsageDescriptionDictionary</key>
<dict>
    <key>Navigation</key>
    <string>导航需要精确位置才能给出路线指引</string>
</dict>
```

---

## 八、本地网络权限

iOS 14 起,扫描局域网(Bonjour / 自定义 multicast)需要权限:

```swift
// Info.plist
// NSLocalNetworkUsageDescription = "搜索局域网内的同步设备"
// NSBonjourServices 列出 service type
```

权限弹窗在你**首次调网络相关 API** 时自动出现,不需要手动请求。

不需要这个权限的:
- 普通 HTTP / HTTPS 请求(经路由器出去)
- 标准 cellular 数据

需要的:
- AirDrop 风格的同 wifi 互联
- 局域网设备发现(打印机、智能家居)

---

## 九、Privacy Manifest 的实践工作流

1. **Xcode 16 → File → New File → Privacy Manifest**(默认放 App target)
2. 用 Xcode 的可视化编辑器添加项
3. 三方 SDK 集成时,**确认每个 SDK 都附了自己的 PrivacyInfo.xcprivacy**——没有的 SDK 谨慎用
4. 构建后,`Reports → Privacy Report` 能生成本 App 的合规报告
5. App Store Connect "隐私问卷" 填的数据类型必须与 Privacy Manifest 一致
6. Apple 还会扫**第三方 SDK 是否签名**(2024 起强制),未签名 SDK 也会拒

---

## 十、踩坑

1. **`Info.plist` 缺 usage description**——直接 crash,不是弹窗失败。开发期就 crash 容易发现,但偶尔某个 SDK 内部调权限 API,只在用户走到那个分支才崩。
2. **首次 App 启动就请求所有权限**——拒绝率最高的反模式。按需请求。
3. **被拒绝后又调权限请求 API 期望弹窗**——iOS 不再弹,只能跳设置。
4. **Privacy Manifest 缺失**——审核拒,2024-05 起严格执行。
5. **三方 SDK 没 Privacy Manifest**——它的责任,但你的 App 被拒。换 SDK 或者推动 SDK 作者更新。
6. **Privacy Manifest 与 ASC 隐私问卷不一致**——审核员会发现,refuse。两边数据要对得上。
7. **ATT 弹窗在没必要时弹**——不做 cross-app tracking 不需要 ATT。乱弹会被审核员问"你为什么需要 tracking"。
8. **CollectedDataType 缺 user content**——你 App 让用户写笔记,理论上"User Content" 是收集了(即使只在用户设备本地)。Apple 认定即使本地存储也算"collected",尽管 functionality 用途 ok。
9. **测试时 `UserDefaults` 没在 PrivacyInfo 声明**——`UserDefaults` 是 Required Reason API,即使是 App 配置也要声明。`CA92.1` 是最常用的 reason。
10. **`NSLocationAlwaysAndWhenInUseUsageDescription` 与 `NSLocationWhenInUseUsageDescription` 写一样**——审核员会注意到,且系统弹窗显示不同文案。两个区分写。

---

下一篇 `19-后台任务与AppIntents.md`,讲 `UIApplication` 五种后台模式、`BGAppRefreshTask` / `BGProcessingTask` 调度策略、静默推送唤醒边界、App Intents 完整心智(`AppIntent` 协议 / `AppShortcut` / `IntentParameter`)、与 Shortcuts / Spotlight / Widget / Siri 的统一入口。
