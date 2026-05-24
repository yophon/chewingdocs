# 21 后台模式、BGTaskScheduler 与 App Intents 入口

`NotesIsland` 写到这一篇已经能本地拍照、录音、加位置、登 iCloud 同步。下一步用户的合理期望是:**App 不开也要"活着"**——夜里 3 点自动把白天的笔记备份到 CloudKit,锁屏时按一下 Siri 说"开 NotesIsland 录段语音"就能立刻进录音,Spotlight 搜笔记标题能直达详情。

这三件事在 iOS 上分别落在三个不重叠、但容易被混在一起讲的机制:

- **后台模式 (Background Modes)**:UIApplication 在用户切走后能继续执行的 5 种"白名单"。
- **`BGTaskScheduler`**:把"我想在某个时机被系统唤醒一次"这件事注册给系统。
- **App Intents**:把 App 的能力以**结构化方式**暴露给 Siri / Shortcuts / Spotlight / Widget / Lock Screen。

iOS 12 旧教程里"`UIApplication.shared.beginBackgroundTask` + `performFetchWithCompletionHandler`"那一套基本可以扔掉了。Apple 从 iOS 13 开始用 `BGTaskScheduler` 全面替代;App Intents(iOS 16+ 引入,iOS 18 完善)直接替代了 SiriKit Intents 框架。这一篇就把现代心智一次性立起来。

---

## 一、机制定位

一个 App 在用户切走之后,iOS 给它的运行机会非常有限。把所有可能的"运行机会"列成一张图:

```
用户切走 App
   │
   ├─ App 处于 Suspended  ← 默认状态,完全冻结
   │
   ├─ Background Modes 白名单(声明在 Info.plist 的 UIBackgroundModes)
   │   ├─ audio                 → 后台播音乐(必须真在响)
   │   ├─ location              → 后台持续定位
   │   ├─ voip                  → VoIP 通话(CallKit 替代)
   │   ├─ external-accessory    → 外设
   │   └─ bluetooth-central / -peripheral → BLE
   │
   ├─ BGTaskScheduler           → 系统调度的"短期 / 长期"机会
   │   ├─ BGAppRefreshTask      → 约 30s 内的轻量数据刷新
   │   └─ BGProcessingTask      → 几分钟内的重活,可申请 NetworkConnectivity / ExternalPower
   │
   ├─ Remote Notification       → 静默推送唤醒(content-available: 1)
   │   └─ application(_:didReceiveRemoteNotification:)
   │
   ├─ Push to Start Live Activity (iOS 17.2+)  → 远端推送启动一条 Live Activity
   │
   └─ App Intents               → 用户主动触发(Siri / Shortcuts / Widget / Spotlight)
       └─ App 在后台被瞬时唤起执行某个 Intent
```

关键认知:**`BGTaskScheduler` 不保证执行时刻,只保证"在系统判断合适时给你 30s ~ 几分钟",而 App Intents 是用户主动唤起,执行时机是确定的。** 把它们当成同一类东西用,会让你写出"每隔 X 分钟自动同步一次"这种系统根本不答应的代码。

iOS 16 旧教程里常见的踩坑:

| 旧教程做法 | 现状 |
| --- | --- |
| `application(_:performFetchWithCompletionHandler:)` | iOS 13+ 已弃用,改 `BGAppRefreshTask` |
| `SiriKit` Intents Extension (`.intentdefinition` 文件) | iOS 16+ 推 App Intents,**不**再用 `.intentdefinition` |
| `UIApplication.shared.beginBackgroundTask` 续命 | 仅适用于"切走前最后 30 秒收尾",不适合"周期性后台" |
| 后台 `Timer.scheduledTimer` | 后台 RunLoop 被冻结,不会触发 |

---

## 二、Apple 平台心智

### 1. UIApplication 五种后台模式的精确边界

| Mode (`UIBackgroundModes`) | 触发条件 | 系统会维持你活着多久 |
| --- | --- | --- |
| `audio` | `AVAudioSession.category = .playback` 且 `AVPlayer` 真有声音输出 | 只要在出声 |
| `location` | `CLLocationManager.allowsBackgroundLocationUpdates = true` 且持续定位 | 只要还在收 GPS |
| `voip` | 已被 `CallKit` 取代,新 App 不要用 | n/a |
| `external-accessory` | EAAccessoryManager 链接外设 | 链接期间 |
| `bluetooth-central` / `bluetooth-peripheral` | 与 BLE 设备保持连接 | 链接期间 |
| `fetch` (旧名) | 已被 BGAppRefreshTask 覆盖 | n/a |
| `processing` (旧名) | 已被 BGProcessingTask 覆盖 | n/a |
| `remote-notification` | 收到 `content-available: 1` 静默推送 | 30s 左右 |

`NotesIsland` 真正会用到的是 **`audio`(语音备忘后台播放)**、**`fetch`(注册 BGAppRefresh)**、**`processing`(后半夜上传到 CloudKit)**、**`remote-notification`(协作笔记被他人更新)** 共 4 个。

### 2. `BGTaskScheduler` 的两种任务

`BGTaskScheduler` 是 iOS 13 引入的现代后台调度入口,完全 async 友好(实际上是 closure-based,Swift 6 里我们手动桥接)。两种任务的差别要记牢:

| 维度 | `BGAppRefreshTask` | `BGProcessingTask` |
| --- | --- | --- |
| 时长上限 | ~30s | ~几分钟,理论上不硬限 |
| 调度频率 | 系统智能 ML 模型决定,平均几小时一次 | 通常凌晨用户睡觉时 |
| 可申请"需要联网" | 否(默认有网) | 是,`requiresNetworkConnectivity = true` 时只在有网时跑 |
| 可申请"需要充电" | 否 | 是,`requiresExternalPower = true` |
| 适合 | 拉新数据 / 更新 Widget | 备份 / 大文件加密 / SwiftData 重建索引 |

两种任务都需要在 **`Info.plist`** 里预声明 identifier(BGTaskSchedulerPermittedIdentifiers),**且 identifier 必须以 App 的 bundle id 作为前缀**(实践上),否则 register 会立刻 throw。

```xml
<key>BGTaskSchedulerPermittedIdentifiers</key>
<array>
  <string>com.yophon.notesisland.refresh</string>
  <string>com.yophon.notesisland.cloudsync</string>
</array>
```

并且必须在 `App.init`(或 `application(_:didFinishLaunchingWithOptions:)`)里**同步注册** handler,**不能延迟到 task 提交那一刻**,否则系统第一次回调时找不到 handler 会丢弃任务。

### 3. 静默推送的边界

静默推送 = APNs payload 里 `"content-available": 1` 且**不**带 alert/sound/badge。它会在 App 处于 Suspended 时被唤醒到 background 状态,有大约 30s 时间在 `didReceiveRemoteNotification` 完成处理。

但 Apple 文档明确写:**iOS 会基于电量、流量、用户的"低数据模式 / 低电量模式"等因素丢弃静默推送**;在用户睡眠或不活跃时段送达率显著下降。所以**静默推送不能当作"保证送达的同步机制",只能当作"机会型加速"**。真正的兜底必须是 BGAppRefreshTask 或 App 下次启动时拉取。

### 4. App Intents 心智

App Intents 是 iOS 16 引入、iOS 17/18 完善的一套**结构化 API 暴露**框架。一个 Intent = "App 能完成的一件具体的、可参数化的事"。一旦你声明,Apple 会自动把它接入:

- **Shortcuts App**:用户能拖拽组合
- **Spotlight**:搜索能直接调用,显示参数模板
- **Widget**:Interactive Widget(iOS 17+)用 Button 绑定 AppIntent
- **Siri**:语音说"嘿 Siri,在 NotesIsland 里录段语音"
- **锁屏 / Action Button / Apple Watch**:同一份 Intent 多处使用

核心三件套:

```
AppIntent (协议)
   ├─ static var title: LocalizedStringResource
   ├─ static var description: IntentDescription? { ... }
   ├─ @Parameter 修饰的输入
   └─ func perform() async throws -> some IntentResult

AppShortcut (结构)
   └─ 把 AppIntent + 语音短语 + 系统图标打包,供 Siri 调用

AppShortcutsProvider (协议)
   └─ 在一处集中暴露所有 AppShortcut
```

一个 Intent 不一定要 App 在前台执行;Apple 会按 `openAppWhenRun` 等参数决定是否切到前台。

### 5. App Intents 与 BGTaskScheduler 在心智上的互补

| 你想做的事 | 用哪个 |
| --- | --- |
| 用户主动喊"录段语音" | App Intent(语音入口) |
| 半夜把当天笔记备份到 CloudKit | BGProcessingTask |
| Widget 上的"+ 新笔记"按钮 | App Intent(Button 触发) |
| 拉一次最新协作更新到 SwiftData | BGAppRefreshTask + 静默推送加速 |
| Lock Screen Widget 显示最近一条笔记 | Widget + TimelineProvider(第 22 篇) |

---

## 三、工程实现

### 3.1 BGTaskScheduler 集中注册

```swift
// File: Core/Background/BackgroundScheduler.swift
import BackgroundTasks
import SwiftData
import os

// MARK: - 唯一职责:声明 / 注册 / 提交 / 处理后台任务
enum BackgroundScheduler {
    static let refreshID = "com.yophon.notesisland.refresh"
    static let cloudSyncID = "com.yophon.notesisland.cloudsync"

    private static let log = Logger(subsystem: "com.yophon.notesisland", category: "BG")

    // MARK: - 必须在 App.init 阶段 *同步* 调用,系统会校验时机
    @MainActor
    static func register() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: refreshID,
                                        using: nil) { task in
            guard let t = task as? BGAppRefreshTask else { return }
            handleRefresh(task: t)
        }
        BGTaskScheduler.shared.register(forTaskWithIdentifier: cloudSyncID,
                                        using: nil) { task in
            guard let t = task as? BGProcessingTask else { return }
            handleCloudSync(task: t)
        }
    }

    // MARK: - 提交:每次 App 进入后台时调一次,顶替老的
    static func scheduleAll() {
        scheduleRefresh()
        scheduleCloudSync()
    }

    static func scheduleRefresh() {
        let req = BGAppRefreshTaskRequest(identifier: refreshID)
        req.earliestBeginDate = Date(timeIntervalSinceNow: 60 * 60) // 1h 后
        do { try BGTaskScheduler.shared.submit(req) }
        catch { log.error("refresh submit failed: \(error)") }
    }

    static func scheduleCloudSync() {
        let req = BGProcessingTaskRequest(identifier: cloudSyncID)
        req.requiresNetworkConnectivity = true
        req.requiresExternalPower = true
        // 今晚 03:00
        var comp = Calendar.current.dateComponents([.year, .month, .day], from: .now)
        comp.hour = 3
        let begin = Calendar.current.date(from: comp).map { $0.addingTimeInterval(86_400) }
        req.earliestBeginDate = begin
        do { try BGTaskScheduler.shared.submit(req) }
        catch { log.error("cloudsync submit failed: \(error)") }
    }

    // MARK: - 处理 refresh:30s 内拉一次远端协作更新
    private static func handleRefresh(task: BGAppRefreshTask) {
        // 紧接下一次,无论本次成功与否
        scheduleRefresh()

        let work = Task<Void, Never> {
            await SyncService.shared.pullIncremental()
            task.setTaskCompleted(success: true)
        }
        task.expirationHandler = {
            work.cancel()
            task.setTaskCompleted(success: false)
        }
    }

    // MARK: - 处理 cloudsync:整库备份到 CloudKit
    private static func handleCloudSync(task: BGProcessingTask) {
        scheduleCloudSync()
        let work = Task<Void, Never> {
            await SyncService.shared.pushAllPendingToCloudKit()
            task.setTaskCompleted(success: true)
        }
        task.expirationHandler = {
            work.cancel()
            task.setTaskCompleted(success: false)
        }
    }
}

// MARK: - 同步服务的最小占位,真实实现走 SwiftData + CloudKit
actor SyncService {
    static let shared = SyncService()
    func pullIncremental() async { /* ... */ }
    func pushAllPendingToCloudKit() async { /* ... */ }
}
```

App 入口接入:

```swift
// File: NotesIslandApp.swift
import SwiftUI

@main
struct NotesIslandApp: App {
    init() {
        BackgroundScheduler.register()  // 必须在 init 里同步注册
    }

    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup { ContentView() }
        .onChange(of: scenePhase) { _, new in
            if new == .background { BackgroundScheduler.scheduleAll() }
        }
    }
}
```

### 3.2 App Intent:在 Siri / Shortcuts / Widget 里"开始录音"

```swift
// File: Features/Intents/StartRecordingIntent.swift
import AppIntents
import SwiftUI

// MARK: - 录音 Intent:用户说"在 NotesIsland 录段语音"会调到这里
struct StartRecordingIntent: AppIntent {
    static var title: LocalizedStringResource = "开始录音"
    static var description = IntentDescription(
        "立刻打开 NotesIsland 并开始一段新的语音笔记。",
        categoryName: "笔记"
    )

    // 让这个 Intent 一定把 App 带到前台
    static var openAppWhenRun: Bool { true }

    @Parameter(title: "标签", description: "为这段录音预先打上的标签", default: "灵感")
    var tag: String

    @MainActor
    func perform() async throws -> some IntentResult {
        // 通过 NotificationCenter 把意图广播给 UI 层,
        // UI 层在 root view 监听后路由到录音页
        NotificationCenter.default.post(name: .startRecordingRequested,
                                        object: nil,
                                        userInfo: ["tag": tag])
        return .result()
    }
}

extension Notification.Name {
    static let startRecordingRequested = Notification.Name("notesisland.startRecording")
}
```

### 3.3 App Intent:新建文字笔记(无需打开 App)

```swift
// File: Features/Intents/AddNoteIntent.swift
import AppIntents
import SwiftData

// MARK: - 后台静默写入一条笔记,完成后给系统返回一句话
struct AddNoteIntent: AppIntent {
    static var title: LocalizedStringResource = "添加一条笔记"

    // 这个 intent 不需要把 App 带到前台
    static var openAppWhenRun: Bool { false }

    @Parameter(title: "内容")
    var text: String

    @Dependency
    var container: ModelContainer

    func perform() async throws -> some ProvidesDialog {
        try await MainActor.run {
            let ctx = ModelContext(container)
            ctx.insert(Note(text: text, createdAt: .now))
            try ctx.save()
        }
        return .result(dialog: "已添加这条笔记")
    }
}

// MARK: - SwiftData 模型
@Model final class Note {
    var text: String
    var createdAt: Date
    init(text: String, createdAt: Date) {
        self.text = text
        self.createdAt = createdAt
    }
}
```

> `@Dependency` 是 iOS 17 引入的依赖注入机制,要在 App 入口处用 `AppDependencyManager.shared.add { container }` 注册 `ModelContainer`,Intent 执行时框架自动喂入。

### 3.4 AppShortcutsProvider:集中暴露给 Siri 与 Spotlight

```swift
// File: Features/Intents/NotesIslandShortcuts.swift
import AppIntents

// MARK: - 在 App 启动时被系统自动发现,把所有 shortcut 注册到 Shortcuts / Siri / Spotlight
struct NotesIslandShortcuts: AppShortcutsProvider {

    // 主色调,Siri 提示卡用
    static var shortcutTileColor: ShortcutTileColor { .grayBlue }

    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: StartRecordingIntent(),
            phrases: [
                "在 \(.applicationName) 里录段语音",
                "用 \(.applicationName) 录音",
                "Record a memo in \(.applicationName)"
            ],
            shortTitle: "录段语音",
            systemImageName: "mic.circle.fill"
        )
        AppShortcut(
            intent: AddNoteIntent(),
            phrases: [
                "在 \(.applicationName) 里加一条笔记",
                "Add a note to \(.applicationName)"
            ],
            shortTitle: "新建笔记",
            systemImageName: "square.and.pencil"
        )
    }
}
```

### 3.5 把 Intent 与 UI 层桥接

```swift
// File: Features/Root/ContentView.swift
import SwiftUI

struct ContentView: View {
    @State private var path = NavigationPath()
    @State private var pendingTag: String?

    var body: some View {
        NavigationStack(path: $path) {
            NoteListView()
                .navigationDestination(for: Route.self) { route in
                    switch route {
                    case .recorder(let tag): RecorderView(initialTag: tag)
                    }
                }
        }
        .onReceive(NotificationCenter.default.publisher(for: .startRecordingRequested)) { note in
            let tag = (note.userInfo?["tag"] as? String) ?? ""
            path.append(Route.recorder(tag: tag))
        }
    }

    enum Route: Hashable { case recorder(tag: String) }
}
```

### 3.6 静默推送处理

```swift
// File: Core/Push/RemoteNotificationHandler.swift
import UIKit
import UserNotifications

// MARK: - 静默推送入口:30 秒内拉一次增量
@MainActor
final class RemoteNotificationHandler: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     didReceiveRemoteNotification userInfo: [AnyHashable: Any]) async
    -> UIBackgroundFetchResult {
        guard userInfo["aps"] is [String: Any] else { return .noData }
        await SyncService.shared.pullIncremental()
        // 顺手把 BG refresh 重新排上,系统会取较近的那一次
        BackgroundScheduler.scheduleRefresh()
        return .newData
    }
}
```

App 入口处用 `@UIApplicationDelegateAdaptor(RemoteNotificationHandler.self)` 注入。

---

## 四、调参与验收

| 维度 | 关键参数 | 建议值 / 心智 |
| --- | --- | --- |
| BGAppRefresh 周期 | `earliestBeginDate` | ≥1h,设小于 15 分钟系统会忽略 |
| BGProcessing 触发条件 | `requiresNetworkConnectivity`/`requiresExternalPower` | 大任务都置 true,显著提升执行成功率 |
| Identifier 数量上限 | 同 App 内 BGTaskRequest 数 | 同 identifier 同时最多一个,提交新的会覆盖旧的 |
| 静默推送 priority | APNs `apns-priority: 5` | 静默推送必须用 5,用 10 会被 APNs 拒 |
| 静默推送 push-type | `apns-push-type: background` | iOS 13+ 起强制,缺失直接被丢 |
| App Intent 后台 / 前台 | `openAppWhenRun` | 默认 false;写入类用 false,UI 类用 true |
| Spotlight 索引 | `AppShortcut.phrases` 第一条 | 必须出现 `.applicationName` 占位符,否则上架被警告 |
| Live Activity Push to Start | `apns-push-type: liveactivity` | iOS 17.2+;`NotesIsland` 不一定用,但要知道边界 |

### 手动验证清单

**BGTaskScheduler 验证(只能用真机,模拟器永远不会自动触发):**

1. 真机连 Xcode,Debug 模式跑 App。
2. 在 App 进入后台后,从 Xcode 的 Debug → Simulate Background App Refresh,触发 `BGAppRefreshTask`,断点应命中 `handleRefresh`。
3. 在 LLDB 里手动触发 BGProcessingTask:
   ```
   e -l objc -- (void)[[BGTaskScheduler sharedScheduler] _simulateLaunchForTaskWithIdentifier:@"com.yophon.notesisland.cloudsync"]
   ```
   断点应命中 `handleCloudSync`。

**App Intents 验证:**

4. 构建并安装一次,**完全杀进程**,等待 30 秒(系统发现新 shortcuts 有延迟)。
5. 打开 Shortcuts App,顶部"建议",能看到 NotesIsland 的"录段语音"和"新建笔记"。
6. 对 Siri 说"在 NotesIsland 里录段语音",App 自动启动并跳到录音页。
7. 下拉 Spotlight 搜 "录段",出现"录段语音"行,点击直接执行,不打开 App。
8. 在系统设置 → Siri 与搜索 → NotesIsland,看到两条 shortcut,可点击改触发语句。

**静默推送验证:**

9. 发一个 `{"aps":{"content-available":1}}` payload 给设备(可用 Apple Push Notification Console 或 Apple Configurator)。
10. App 在后台,断点能命中 `didReceiveRemoteNotification`,30s 内完成 `pullIncremental`。

---

## 五、踩坑

**1. `BGTaskScheduler.register` 必须在 App 启动**的同步阶段**完成**。如果你把它放到 `body` 的 `task` 里、或放到 SwiftUI View 的 `onAppear` 里,系统第一次回调时找不到 handler,任务会被静默丢弃且**整张 identifier 注册表会失效**直到下次冷启动。Swift 5 旧教程把它写在 `application(_:didFinishLaunchingWithOptions:)`,在 SwiftUI 项目里要改成 `App.init()` 或 `@UIApplicationDelegateAdaptor`。

**2. `BGTaskScheduler` 在模拟器上永远不会被系统自动触发**——必须用 Xcode 的 Debug 菜单或 LLDB 命令手动模拟。生产环境靠"机器学习预测"的触发时机,**新装 App 第一周触发频次几乎为零**;统计 BG 执行次数时要注意这个冷启动期。

**3. `expirationHandler` 不写就是 crash**。系统给你 30s,30s 一到你还没调 `setTaskCompleted` 就会触发 expirationHandler;如果你没注册它,系统会按"违约"处理,**未来一段时间**减少给你的 BG 配额。所有 task handler 必须配一对 `setTaskCompleted` + `expirationHandler`。

**4. `BGProcessingTask` 在 iOS 18 上不再保证"凌晨被调度"**——Apple 已转向"按用户充电 + WiFi + 锁屏时间窗口"的综合模型。设 `requiresExternalPower = true` 仍然显著提升被调度概率,但**不要假设"我设了 03:00 就一定 03:00 跑"**。

**5. App Intents 的 `@Parameter` 默认会要求用户在 Shortcuts 里手动填**。如果你想让 Siri 直接执行不再问,需要给参数 `default:` 或 implement `ParameterSummary` 提供智能默认值。

**6. `AppShortcutsProvider` 必须是 `struct` 不能是 `class`**,且**必须有一个空 `init`**(默认合成即可)。这个限制 Xcode 报错信息很模糊,常见踩坑。

**7. App Intents 在 Widget 里被点击执行时,App 不会被启动**。这意味着 Intent 里访问 `ModelContainer` 必须靠 `@Dependency`(代码 3.3 写法),**不能** assume `UIApplication.shared.delegate` 存在。

**8. Siri 触发 phrase 必须包含 `\(.applicationName)`**。Apple 在 iOS 17 加了这条强制要求:不带 `\(.applicationName)` 的 phrase 在 ASC 上传时会被警告。原因是 Siri 全局对话框里"录段语音"会跟一堆其他 App 撞车,带上 App 名才能消歧。

**9. 静默推送不能用作"协作笔记实时同步"的兜底**。Apple 多次申明 silent push 是 *best-effort*,在低电量、低数据、用户睡眠时段都会被丢。真实时同步要靠 CloudKit subscription 或 WebSocket 长连接(但长连接在后台会被 30s 内 socket 关闭)。

**10. 五种后台模式不要乱开**。每多开一个,App 提交审核时审核员就会要求你**在 App 描述里说明**这个能力对应的具体功能,且**在 Demo 视频里展示出来**。无用的 background mode 是审核拒掉的常见 reason。

**11. iOS 19+ 引入 `BGContinuedProcessingTask`**(假定命名),用于跨"应用切走 → 锁屏 → 充电连接"的连续长任务。当前 iOS 18 部署目标下用不上,但写代码时要把 BGTaskScheduler 的注册逻辑抽出来,未来加新类型只改一处。
