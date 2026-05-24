# 18 推送:UNUserNotificationCenter 与 APNs

> 把 NotesIsland 的"提醒"、"远端同步"、"灵动岛 Live Activity 启动"三件事一次性串起来。基线 iOS 18 / Swift 6 / Xcode 16,涉及 iOS 17.2 / 19+ 的能力单独标注。

---

## 一、机制定位:本地 / 远程 / 静默 / Push-to-Start 是同一套 API 的四种姿势

iOS 上"通知"这个概念,在用户那里看起来是一回事(锁屏或通知中心一条),但在工程上是**四种完全不同**的触发路径:

| 类型 | 触发方 | 网络依赖 | 典型场景 | 在 NotesIsland 的意义 |
| --- | --- | --- | --- | --- |
| 本地通知(Local) | App 自己 schedule | 无 | 提醒今天写日记 | "晚上 22:00 提醒自己记一笔" |
| 远程通知(Remote / APNs) | 服务端通过 APNs 下行 | 有 | 协作邀请、新消息 | 多端同步时另一端有新笔记 |
| 静默推送(Silent / Background) | 服务端,`content-available: 1` | 有 | 后台拉数据 | 后台预拉新笔记,避免冷启动等 |
| Push to Start Live Activity (iOS 17.2+) | 服务端,带 `event: "start"` | 有 | 远程启动灵动岛 | 协作者开始编辑同一篇笔记,本机灵动岛展示"对方正在编辑" |

UIKit 老教程的同类做法:`UIApplication.registerUserNotificationSettings(_:)` + `UILocalNotification` + 手写 `application(_:didReceiveRemoteNotification:fetchCompletionHandler:)`。这一整套从 iOS 10 起就被 `UNUserNotificationCenter` 框架替代了,**新工程不要再用旧 API**。本篇只走 `UserNotifications` framework 的现代路径,并把容易踩坑的几个点(权限分级、APNs token 上行时机、Notification Service Extension 的修改窗口、Push to Start 的 token 生命周期)讲清楚。

---

## 二、Apple 平台心智

### 2.1 `UNUserNotificationCenter` 的角色分层

`UNUserNotificationCenter`(`UserNotifications` framework,iOS 10+)是 iOS 通知系统的**唯一入口**。一次完整的推送链路涉及四个角色:

```
[Server] --(JWT or .p8)--> [APNs] --(deviceToken 路由)--> [iOS] 
   ↓                                                         ↓
HTTP/2 POST                                  UNUserNotificationCenter
   ↓                                                         ↓
{aps: {...}, custom: {...}}              UNNotificationContent + UNNotificationTrigger
```

- **服务端**:用 `.p8` token 或 `.p12` 证书认证,HTTP/2 POST 到 `api.push.apple.com`(生产)或 `api.sandbox.push.apple.com`(开发)。
- **APNs**:Apple 自家路由层,设备每次连入 push gateway 后,知道把 payload 投递到哪台真机。开发环境的 token 与生产环境**不通用**,这点是踩坑常客。
- **iOS 端**:`UIApplication` 收到 `didRegisterForRemoteNotificationsWithDeviceToken:` 拿到 64 字符 hex(APNs token,32 字节 binary 转 hex),上传给业务后端。
- **App 表现层**:`UNUserNotificationCenter` 把通知统一交给 `UNUserNotificationCenterDelegate`。

### 2.2 权限分级

`UNUserNotificationCenter.current().requestAuthorization(options:)` 一次性请求,options 组合决定权限粒度:

| 选项 | 含义 | 何时用 |
| --- | --- | --- |
| `.alert` | 横幅 / 锁屏文字提示 | 99% 场景必给 |
| `.badge` | App 图标小红点 | 想要小红点就要 |
| `.sound` | 声音 | 看场景 |
| `.provisional` | 临时授权(iOS 12+):不弹窗,通知直接进通知中心"安静投递",用户在通知中心可一键升格或关闭 | 不打扰用户的预热路径 |
| `.criticalAlert` | 紧急通知(穿透静音 / 勿扰),需要 Apple 特批 entitlement | 医疗、安全告警类 App |
| `.providesAppNotificationSettings` | 系统设置里"App 通知"页加一个跳回 App 的入口 | 主动接管细分通知偏好 |
| `.timeSensitive`(iOS 15+) | 时效性通知,可穿透 Focus Mode | 重要提醒(限时投票、出行) |

`getNotificationSettings(completionHandler:)` / `notificationSettings()` (async) 异步查询当前授权与偏好,**不要假设**用户给了就一直给——他在系统设置里可以随时改。

### 2.3 触发器与通知内容

`UNNotificationContent`(mutable: `UNMutableNotificationContent`)是通知的"载荷"(标题、副标题、正文、附件、声音、interruptionLevel、relevanceScore)。`UNNotificationTrigger` 决定何时触发:

| Trigger | 何时 |
| --- | --- |
| `UNTimeIntervalNotificationTrigger` | n 秒后,可 repeats |
| `UNCalendarNotificationTrigger` | 指定 `DateComponents`(每天 22:00) |
| `UNLocationNotificationTrigger` | 进入/离开地理围栏 |
| `UNPushNotificationTrigger` | 远程推送来时,系统内部使用,不需要你自己创建 |

`UNNotificationRequest(identifier:content:trigger:)` 包成一条请求,`add(_:withCompletionHandler:)` 提交。**identifier 要稳定**:同 identifier 再 add 会覆盖,避免堆积重复提醒。

### 2.4 远程推送 payload

APNs 的最小 payload:

```json
{
  "aps": {
    "alert": { "title": "新笔记", "body": "协作者 Alice 编辑了《周报》" },
    "sound": "default",
    "badge": 1,
    "interruption-level": "time-sensitive",
    "mutable-content": 1
  },
  "noteId": "8E2B...",
  "kind": "collab.update"
}
```

- `mutable-content: 1`:告知系统先把 payload 给 Notification Service Extension 处理(下一节)。
- `content-available: 1`:静默推送,iOS 不展示 UI,只把 payload 交给主 App `application(_:didReceiveRemoteNotification:fetchCompletionHandler:)`(或现代 `UNUserNotificationCenterDelegate` 的对应路径)。
- `interruption-level`:`passive` / `active` / `time-sensitive` / `critical`,对应 iOS 15+ 的 Focus Mode 行为。
- `relevance-score`:0~1,iOS 16+ 通知摘要(Notification Summary)排序权重。

### 2.5 Notification Service Extension(NSE)

NSE 是一个独立 target,主 App 收到带 `mutable-content: 1` 的推送时,系统在**展示前最多 30 秒**给 NSE 一个修改窗口:解密 payload、下载图片做富媒体附件、动态改 title。

```text
APNs payload (mutable-content:1)
      ↓
NotificationService.didReceive(_:withContentHandler:)  // 30s budget
      ↓
修改 UNMutableNotificationContent → contentHandler(modifiedContent)
      ↓
iOS 用修改后的内容投递
```

超时 / crash 都会回落到原始 payload。NSE **独立 sandbox**(但可以通过 App Group 共享 Keychain / 文件给主 App),它的 entitlement、Privacy Manifest 都要单独配。

### 2.6 Notification Content Extension(NCE)

NCE 决定**通知展开后**的自定义 UI(下拉横幅、3D Touch / 长按预览)。`UNNotificationCategory` + `UNNotificationAction` 注册后,通知带这个 category id,iOS 展示按钮;NCE 提供更丰富的视图(SwiftUI 也支持,但有 sandbox 限制——不能联网、不能用主 App 的某些 framework)。

### 2.7 静默推送与后台唤醒

- `content-available: 1` 必须放在 `aps` 字典里,且**不要带 alert/sound/badge**(带了就不再"静默"),否则系统不会按静默路径处理。
- 静默推送默认低优先级,iOS 会做投递节流(电量、网络、用户使用习惯),**不保证及时**。要可靠就用普通推送 + NSE 在后台处理。
- 静默推送唤醒主 App 后给约 30 秒后台执行时间,通常用来做"拉数据 → 写 SwiftData → reload Widget"。

### 2.8 Push to Start Live Activity(iOS 17.2+)

iOS 17.2 之前,Live Activity 只能由主 App 在前台调 `Activity.request(...)` 启动。17.2 起:

1. 在 `ActivityAttributes` 上声明 `static func pushType() -> ActivityPushType { .token }`(默认就是 token push)。
2. 主 App 注册一次:`for try await pushToStartToken in Activity<MyAttributes>.pushToStartTokenUpdates { ... }`,拿到 push-to-start token 上报给服务端。
3. 服务端通过 APNs 把 `event: "start"` 的 payload 发到该 token,iOS 直接启动一个 Live Activity,完全不需要主 App 在前台。

> 这与"APNs deviceToken"是两套独立的 token——push-to-start 是**每个 ActivityAttributes 类型**绑定一个。

### 2.9 Swift 6 严格并发与通知

- `UNUserNotificationCenter.current()` 是 Sendable singleton,跨 actor 调用安全。
- `UNUserNotificationCenterDelegate` 的回调在 iOS 18 SDK 下大多已标 `@MainActor`(主 App 进程内),用 `@preconcurrency` 遵循时可避免噪声 warning。
- NSE 的 `didReceive(_:withContentHandler:)` **不在 main actor**,内部跑后台队列;调主 App 共享的 `actor` 要 await。
- 与 ActivityKit 的桥:`Activity` 是 `Sendable`,可跨 actor 持有,但其 `update(_:)` 是异步的,要 await。

---

## 三、工程实现

下面这段代码覆盖:首次请求权限、本地提醒、APNs 注册与 token 上行、远程通知前台展示、Notification Service Extension 解密富媒体、Push to Start Live Activity 注册。

### 3.1 主 App:权限、本地提醒、APNs 注册

```swift
// File: Features/Notifications/NotificationCoordinator.swift
import Foundation
import UserNotifications
import UIKit
import os

// MARK: - 通知协调器:单例,只跑在 main actor
@MainActor
final class NotificationCoordinator: NSObject {
    static let shared = NotificationCoordinator()

    private let center = UNUserNotificationCenter.current()
    private let log = Logger(subsystem: "com.yophon.notesisland", category: "push")

    // MARK: 启动入口
    func bootstrap() {
        center.delegate = self
    }

    // MARK: 请求权限
    func requestAuthorization() async throws {
        let granted = try await center.requestAuthorization(
            options: [.alert, .badge, .sound, .timeSensitive, .providesAppNotificationSettings]
        )
        log.info("notification granted=\(granted)")
        if granted {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }

    // MARK: 本地提醒:每天 22:00 写日记
    func scheduleDailyReminder() async throws {
        let content = UNMutableNotificationContent()
        content.title = "记一笔今天"
        content.body = "睡前两分钟,留下今天值得记得的事"
        content.sound = .default
        content.interruptionLevel = .timeSensitive
        content.relevanceScore = 0.6

        var when = DateComponents()
        when.hour = 22
        when.minute = 0
        let trigger = UNCalendarNotificationTrigger(dateMatching: when, repeats: true)
        let req = UNNotificationRequest(identifier: "daily.reminder", content: content, trigger: trigger)
        try await center.add(req)
    }

    func cancelDailyReminder() {
        center.removePendingNotificationRequests(withIdentifiers: ["daily.reminder"])
    }

    // MARK: APNs token 上行
    func didRegister(deviceToken: Data) async {
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        log.info("APNs token: \(hex, privacy: .public)")
        // TODO: 调 PushTokenAPI.upload(hex) — 走第 15 篇的 URLSession async 路径
    }

    func didFailToRegister(error: Error) {
        log.error("APNs register failed: \(error.localizedDescription, privacy: .public)")
    }
}

// MARK: - UNUserNotificationCenterDelegate(前台展示 / 静默处理 / Action 响应)
extension NotificationCoordinator: @preconcurrency UNUserNotificationCenterDelegate {

    // 前台收到通知:决定是否显示横幅(否则被前台 App "吃掉")
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        return [.banner, .sound, .list]
    }

    // 用户点击通知(或 action)
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        let userInfo = response.notification.request.content.userInfo
        if let noteId = userInfo["noteId"] as? String {
            await NoteRouter.shared.open(noteId: noteId)
        }
    }
}
```

接入到 `App`:

```swift
// File: App/NotesIslandApp.swift
import SwiftUI

@main
struct NotesIslandApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            RootView()
                .task {
                    NotificationCoordinator.shared.bootstrap()
                    try? await NotificationCoordinator.shared.requestAuthorization()
                    try? await NotificationCoordinator.shared.scheduleDailyReminder()
                }
        }
    }
}

// MARK: - AppDelegate 仅为承接 APNs 注册回调(SwiftUI App 协议不直接提供这两个)
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        Task { await NotificationCoordinator.shared.didRegister(deviceToken: deviceToken) }
    }
    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        Task { await NotificationCoordinator.shared.didFailToRegister(error: error) }
    }
    // 静默推送(content-available:1):iOS 现代路径仍走 AppDelegate
    func application(
        _ application: UIApplication,
        didReceiveRemoteNotification userInfo: [AnyHashable : Any]
    ) async -> UIBackgroundFetchResult {
        let ok = await SilentPushHandler.shared.handle(userInfo)
        return ok ? .newData : .noData
    }
}
```

### 3.2 静默推送处理:后台拉笔记

```swift
// File: Features/Notifications/SilentPushHandler.swift
import Foundation
import WidgetKit

actor SilentPushHandler {
    static let shared = SilentPushHandler()

    func handle(_ userInfo: [AnyHashable: Any]) async -> Bool {
        guard let kind = userInfo["kind"] as? String, kind == "note.changed" else { return false }
        guard let noteId = userInfo["noteId"] as? String else { return false }

        do {
            try await NoteSyncService.shared.pull(noteId: noteId)
            // 同步完通知 Widget 刷新
            WidgetCenter.shared.reloadTimelines(ofKind: "LatestNoteWidget")
            return true
        } catch {
            return false
        }
    }
}
```

> 主 App 必须在 target 的 Capabilities 里勾上 **Background Modes → Remote notifications**,否则静默推送不会唤醒 App。

### 3.3 Notification Service Extension:解密富媒体

NSE 是独立 target(`File → New → Target → Notification Service Extension`),Xcode 会生成 `NotificationService.swift`。

```swift
// File: NotificationServiceExtension/NotificationService.swift
import UserNotifications
import CryptoKit

final class NotificationService: UNNotificationServiceExtension {

    private var contentHandler: ((UNNotificationContent) -> Void)?
    private var bestAttempt: UNMutableNotificationContent?

    override func didReceive(_ request: UNNotificationRequest,
                             withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        self.contentHandler = contentHandler
        self.bestAttempt = (request.content.mutableCopy() as? UNMutableNotificationContent)

        guard let bestAttempt else {
            contentHandler(request.content)
            return
        }

        Task {
            await modify(content: bestAttempt, userInfo: request.content.userInfo)
            contentHandler(bestAttempt)
        }
    }

    // MARK: - 服务端只在 payload 里给 cipher,这里用 App Group 共享的密钥解出标题
    private func modify(content: UNMutableNotificationContent, userInfo: [AnyHashable: Any]) async {
        guard
            let cipherHex = userInfo["titleCipher"] as? String,
            let cipherData = Data(hexString: cipherHex)
        else { return }

        do {
            let key = try await NoteCipherKeyStore.shared.loadOrCreate()  // 第 16 篇 actor,App Group 共享
            let box = try AES.GCM.SealedBox(combined: cipherData)
            let plain = try AES.GCM.open(box, using: key)
            if let title = String(data: plain, encoding: .utf8) {
                content.title = title
            }
        } catch {
            // 解密失败时保留原 content,不要让用户看到密文
            content.title = "新笔记"
        }
    }

    // 30s 即将超时,iOS 通知我们用当前 best attempt
    override func serviceExtensionTimeWillExpire() {
        if let bestAttempt, let contentHandler {
            contentHandler(bestAttempt)
        }
    }
}

// MARK: - 小工具
private extension Data {
    init?(hexString: String) {
        var data = Data(capacity: hexString.count / 2)
        var idx = hexString.startIndex
        while idx < hexString.endIndex {
            let next = hexString.index(idx, offsetBy: 2, limitedBy: hexString.endIndex) ?? hexString.endIndex
            guard let b = UInt8(hexString[idx..<next], radix: 16) else { return nil }
            data.append(b)
            idx = next
        }
        self = data
    }
}
```

NSE target 必须勾上同一个 App Group,且在 `Info.plist` 配置好 `NSExtensionAttributes`(模板自带)。**不要**在 NSE 里 `import SwiftUI`、`import SwiftData`——NSE 进程的 framework 限制比主 App 严格,链上没用到的 framework 会拉长冷启动。

### 3.4 Push to Start Live Activity(iOS 17.2+)

```swift
// File: Features/Notifications/LiveActivityStarter.swift
import ActivityKit
import Foundation

struct CollabAttributes: ActivityAttributes {
    public typealias ContentState = State

    public struct State: Codable, Hashable {
        var collaboratorName: String
        var noteTitle: String
        var lastEditAt: Date
    }

    var noteId: String
}

@MainActor
final class LiveActivityStarter {
    static let shared = LiveActivityStarter()

    func observePushToStart() {
        Task {
            for try await token in Activity<CollabAttributes>.pushToStartTokenUpdates {
                let hex = token.map { String(format: "%02x", $0) }.joined()
                // 上报给业务后端:它负责后续 push 来启动 Live Activity
                try? await PushTokenAPI.uploadPushToStart(hex: hex, type: "CollabAttributes")
            }
        }
    }

    func observeUpdateTokens(for activity: Activity<CollabAttributes>) {
        Task {
            for try await token in activity.pushTokenUpdates {
                let hex = token.map { String(format: "%02x", $0) }.joined()
                try? await PushTokenAPI.uploadActivityToken(hex: hex, activityId: activity.id)
            }
        }
    }
}
```

服务端 push payload 例(启动):

```json
{
  "aps": {
    "timestamp": 1716508800,
    "event": "start",
    "content-state": {
      "collaboratorName": "Alice",
      "noteTitle": "周报",
      "lastEditAt": 770234400
    },
    "attributes-type": "CollabAttributes",
    "attributes": { "noteId": "8E2B..." },
    "alert": { "title": "Alice 开始编辑《周报》" }
  }
}
```

Push 头要包含 `apns-push-type: liveactivity`、`apns-topic: <bundleId>.push-type.liveactivity`、`apns-priority: 10`。

---

## 四、调参与验收

### 4.1 关键参数

| 维度 | 取舍 |
| --- | --- |
| `requestAuthorization` options | 永远不要一次性请所有,把 `.criticalAlert` 留到产品确实需要;`.timeSensitive` 是 iOS 15+ 默认值得开 |
| 请求时机 | **不要在 App 启动第一秒弹**,在用户做了一个值得"提醒"的动作之后再请(例如新建一条带提醒的笔记),通过率高 3 倍以上 |
| `interruption-level` | 默认 `active`;真的紧迫且用户配过 → `time-sensitive`;`critical` 需要 Apple 特批 |
| `relevance-score` | 0~1,iOS 16+ Notification Summary 用它排序,不给默认 0,被汇总到最底 |
| NSE 时间预算 | 30 秒硬上限,实际给 ~25 秒规划;网络请求超时设 8s 内;失败回落原 content |
| 静默推送频率 | iOS 给的 budget 是动态的,日均别超过 2-3 次,否则被节流甚至 demote 到非静默 |
| Live Activity push 频率 | 单 activity 单小时建议 ≤ 几十次;超量 Apple 会限流(`429`)|

### 4.2 真机 vs 模拟器

- **模拟器可以模拟远程推送**:Xcode 14+ 起,把 `.apns` 文件拖到模拟器即可触发(`Window → Devices and Simulators`)。但**拿不到真实 deviceToken**,`didRegisterForRemoteNotificationsWithDeviceToken` 给的是模拟值。
- 模拟器跑 NSE 也可以(选 NSE scheme + 模拟器 + 拖 `.apns`),Xcode 16 起断点能命中。
- Push to Start Live Activity 在模拟器有限支持,**iOS 17.2 模拟器以上**才行;真机上要 iPhone 14 Pro 及以上(灵动岛硬件)。
- 真机要测 `.p8` token 直发 APNs,推荐 `apns-tool` / `aps-go`,本地起一个 curl 就能打。

### 4.3 验收清单

1. **权限弹窗**:首次启动,在用户做某个动作后调 `requestAuthorization`,出现系统弹窗;用户拒绝后,`getNotificationSettings().authorizationStatus == .denied`。
2. **本地通知**:把 `daily.reminder` 改成 5 秒后触发,锁屏看到。
3. **APNs token 上行**:真机运行,Logger 打印 64 字符 hex,后端服务收到。
4. **远程推送**:用 `.p8` token 给该 deviceToken 发一条 alert,锁屏 / 前台 / 通知中心都能看到。
5. **NSE 解密**:发一条带 `mutable-content:1` + `titleCipher` 的 payload,看到的 title 是密文解密后的中文。
6. **静默推送**:发 `content-available:1` 仅 alert 字段为空的 payload,App 在后台,`SilentPushHandler.handle` 被调,Widget 时间线刷新。
7. **Push to Start Live Activity**(iOS 17.2+):主 App 不启动,服务端发 `event:"start"`,灵动岛出现新的 Live Activity。

### 4.4 排障路径

- 看不到推送:第一步看 `Settings → Notifications → NotesIsland` 是否打开;第二步检查 deviceToken 是发到 sandbox 还是 production(开发证书 + 生产 APNs gateway 是 invalid token)。
- NSE 不被调:确认 payload 里 `mutable-content:1`,确认 NSE target 已嵌入到主 App(Embed App Extensions),确认 NSE bundleId 是 `<MainBundle>.NotificationService`。
- Console.app 真机日志:筛选 `subsystem:com.apple.usernotifications`,能看到 APNs 投递、NSE 调度的全量日志。

---

## 五、踩坑

### 5.1 与 Swift 5 / iOS 16 旧教程的差异

1. **`UIUserNotificationSettings` / `UILocalNotification`**:iOS 10 起已废弃,Xcode 16 直接报 deprecated。新代码统一 `UNUserNotificationCenter`。
2. **`application(_:didReceiveRemoteNotification:)`(无 fetch completion)**:这个老回调只用于前台时收到的展示型推送,**不再**作为静默推送入口。静默推送走 `application(_:didReceiveRemoteNotification:fetchCompletionHandler:)`,且这是少数 SwiftUI App 仍需 `UIApplicationDelegateAdaptor` 的场景之一。
3. **"在 `application(_:didFinishLaunchingWithOptions:)` 里就 `requestAuthorization`"**:旧教程通病。iOS 12+ 推荐 `.provisional` 静默注册,或者**延后到用户场景**再弹,通过率天差地别。
4. **"`registerForRemoteNotifications` 必须先 `requestAuthorization`"**:**不**必须。`.provisional` 路径下可以直接 `registerForRemoteNotifications`,APNs 也会给 token,通知静默投递。
5. **手写 `presentationOption = []` 让通知不在前台展示**:旧的 "前台不弹横幅" 写法。iOS 14+ 起前台展示横幅是好体验,默认 `[.banner, .list, .sound]`;真要不展示,UI 内再做处理,而不是把通知吞掉。

### 5.2 Swift 6 严格并发踩坑

- `UNUserNotificationCenterDelegate` 的 sync 版回调(`willPresent:withCompletionHandler:` / `didReceive:withCompletionHandler:`)在 Swift 6 SDK 下已替换为 `async` 版,但旧代码混用 completion handler 会让编译器把它视作 `@Sendable` 闭包,**捕获 self 必须显式**。新代码直接用 `async` 版,本文示例已采用。
- NSE 的 `didReceive(_:withContentHandler:)` **不能** await 一个 `@MainActor` actor 直接返回,会跨 actor;封一个 `nonisolated` 的入口或在 NSE 内自己复制一份 `NoteCipherKeyStore` 实现(更安全)。
- `UIApplication.shared.registerForRemoteNotifications()` 是 `@MainActor` 的,在 `Task { ... }` 里调要 `await MainActor.run`。
- `pushToStartTokenUpdates` / `pushTokenUpdates` 是 `AsyncSequence`,`for try await` 是结构化并发的标准消费方式;**不要**把它扔进 `Task.detached` 然后忘了取消,主 App 退出时这些 task 应当随 `@MainActor` 持有者一起销毁。

### 5.3 NSE / NCE 工程边界

- NSE 进程**有最大内存限制**(约 24 MB),解密 + 下载附件大图很容易爆。富媒体附件解码要走流式 `URLSession`,不要一次性 `Data(contentsOf:)`。
- NSE 不能用主 App 进程独有的 framework(比如 `SwiftData`、某些 `SwiftUI`),链入会冷启动慢甚至 OOM。
- NSE 写文件要用 App Group 共享容器,**不要**写 NSE 自己的 sandbox(NSE 进程下次启动是另一份)。
- NCE 在 iOS 17 起支持 SwiftUI,但**没有网络权限**;数据要么走 payload 自带,要么从 App Group 共享容器读。

### 5.4 APNs 与证书

- `.p8` token-based 认证比 `.p12` 证书简单且永久:一个 team 对应一个 `.p8`,在 App Store Connect 下载一次,服务端做 JWT 签发。Xcode 16 起 push 调试推荐这个路径。
- **开发/生产 token 不通用**。Xcode debug 编出来的 build 用的是 sandbox APNs;TestFlight / App Store build 用 production。两边 token 互发 `BadDeviceToken`。
- HTTP/2 的 `apns-priority`:5(节能)或 10(立即);静默推送用 5,普通推送用 10。
- HTTP/2 的 `apns-push-type` 必填:`alert` / `background` / `voip` / `complication` / `fileprovider` / `mdm` / `liveactivity`。iOS 13+ 起 `background` 类型必填,否则会被忽略。

### 5.5 iOS 19+ 相关

- iOS 19+ 进一步收紧"通知摘要(Notification Summary)",AI 会把重复结构的通知合并展示,`relevance-score` 与 `thread-identifier` 的影响放大;同主题通知尽量用一致的 `thread-identifier`。
- iOS 19+ 灵动岛 Live Activity 的 push 上限调整,长时驻留(>8 小时)更严格,长任务要用 `staleDate` 主动告知系统过期。
- iOS 18 上 `.provisional` + `.timeSensitive` 仍是性价比最高的"不打扰但及时"组合;iOS 19+ 强化了 Focus Mode 的允许列表,产品决策上要做好对应的 Settings 引导。

### 5.6 与 Stack Overflow 老答案的差异

- 老答案告诉你 `UIApplication.shared.applicationIconBadgeNumber = 0`。iOS 17+ 起这个 API 已 deprecated,推荐 `UNUserNotificationCenter.current().setBadgeCount(0)`。
- 老答案让你"在 `didReceiveRemoteNotification` 里调 `completionHandler(.newData)`"。SwiftUI App + Swift Concurrency 时代,直接写 async 版 `func application(_:didReceiveRemoteNotification:) async -> UIBackgroundFetchResult`,系统会自动桥接。
- 老答案推荐用第三方 `Pushwoosh` / `OneSignal` 等 SaaS。**没有错**,但他们 SDK 全都要 Privacy Manifest(第 20 篇),不要为了便利忘了合规。

---

至此第五层"系统能力"打开了头(互操作 + 推送)。下一篇进入 **AVFoundation 与 PhotoKit**:相机预览 / 录音 / `PhotosPicker` / 权限分级 —— 把 NotesIsland 的"图片 + 音频笔记"形态做完。
