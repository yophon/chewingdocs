# 后台任务与 App Intents

iOS 对后台执行的限制比 Android 严苛得多——App 一旦进后台,大概率几秒内就被挂起。要在后台跑代码,只有几条窄路径:**`BGAppRefreshTask`(短任务)、`BGProcessingTask`(长任务,要求充电+wifi)、静默推送唤醒、`UIBackgroundModes`(音频/位置/VoIP)**。同时 iOS 16 起 `AppIntents` 提供了"让 App 能力被 Siri / Shortcuts / Spotlight / Widget 调用"的统一入口。

> 一句话先记住:**后台任务都是"机会性的"——系统按用户习惯、电量、网络情况决定何时跑你的代码,不保证准时。`BGAppRefreshTask` 是 30 秒以内的"刷个内容";`BGProcessingTask` 可以长到几分钟,但只在设备充电+wifi+空闲时执行。App Intents 是把"创建笔记"这种动作暴露给系统,让 Siri 直接调,不打开 App。**

---

## 一、UIBackgroundModes:声明后台能力

`Info.plist` 的 `UIBackgroundModes` 数组声明你需要哪些后台能力:

| Mode | 适用 |
| --- | --- |
| `audio` | 后台音乐 / 播客播放 |
| `location` | 后台位置追踪(运动 App) |
| `voip` | VoIP 通话保持 |
| `fetch` | 后台 fetch(已被 BGAppRefreshTask 替代) |
| `remote-notification` | 静默推送唤醒 |
| `processing` | BGProcessingTask 长任务 |
| `bluetooth-central` / `bluetooth-peripheral` | 蓝牙后台连接 |
| `external-accessory` | 外设连接 |
| `nearby-interaction` | UWB 精确定位 |

**审核严格**——加了 mode 后审核员会盯,问"你拿这个能力干什么"。普通业务通常只用 `remote-notification` 和 `processing`,音视频 App 加 `audio`。

---

## 二、BGAppRefreshTask:30 秒以内的刷新

替代旧 `application(_:performFetchWithCompletionHandler:)` 的现代 API。典型用途:"每隔几小时拉一次新内容,让用户打开 App 时已经有更新"。

```swift
import BackgroundTasks

// 1. 注册 task identifier(在 AppDelegate launching 里)
BGTaskScheduler.shared.register(
    forTaskWithIdentifier: "com.example.NotesIsland.refresh",
    using: nil
) { task in
    handleAppRefresh(task: task as! BGAppRefreshTask)
}

// 2. 调度
func scheduleAppRefresh() {
    let request = BGAppRefreshTaskRequest(identifier: "com.example.NotesIsland.refresh")
    request.earliestBeginDate = Date(timeIntervalSinceNow: 60 * 30)    // 至少 30 分钟后
    try? BGTaskScheduler.shared.submit(request)
}

// 3. 在 scenePhase .background 时调度
.onChange(of: scenePhase) { _, newPhase in
    if newPhase == .background {
        scheduleAppRefresh()
    }
}

// 4. 处理 task
func handleAppRefresh(task: BGAppRefreshTask) {
    let queue = OperationQueue()
    queue.maxConcurrentOperationCount = 1
    
    let operation = SyncOperation()
    task.expirationHandler = {
        // 任务即将超时(30 秒),赶紧清理
        operation.cancel()
    }
    operation.completionBlock = {
        task.setTaskCompleted(success: !operation.isCancelled)
        // 完成后再调度下一次
        scheduleAppRefresh()
    }
    queue.addOperation(operation)
}
```

或者用 async API:

```swift
func handleAppRefresh(task: BGAppRefreshTask) {
    let workTask = Task {
        do {
            try await syncFromServer()
            task.setTaskCompleted(success: true)
        } catch {
            task.setTaskCompleted(success: false)
        }
        scheduleAppRefresh()
    }
    task.expirationHandler = {
        workTask.cancel()
    }
}
```

**注意**:
- `earliestBeginDate` 只是**最早时间**,系统决定何时实际跑(可能几小时后,也可能不跑)
- 调度 task 在 `scenePhase == .background` 时,确保下次后台能跑
- task identifier 要在 Info.plist 的 `BGTaskSchedulerPermittedIdentifiers` 里声明

```xml
<key>BGTaskSchedulerPermittedIdentifiers</key>
<array>
    <string>com.example.NotesIsland.refresh</string>
    <string>com.example.NotesIsland.cleanup</string>
</array>
```

---

## 三、BGProcessingTask:长任务

`BGProcessingTask` 比 refresh 长得多——可能几分钟,但要求:
- **充电 + wifi + 设备空闲**(可在 request 上设置要求)
- 调度更不可控(可能 24 小时才跑一次)
- 适用 ML 模型训练、批量数据清理、本地索引重建

```swift
BGTaskScheduler.shared.register(
    forTaskWithIdentifier: "com.example.NotesIsland.cleanup",
    using: nil
) { task in
    handleCleanup(task: task as! BGProcessingTask)
}

func scheduleCleanup() {
    let request = BGProcessingTaskRequest(identifier: "com.example.NotesIsland.cleanup")
    request.requiresNetworkConnectivity = true
    request.requiresExternalPower = true       // 要求充电
    try? BGTaskScheduler.shared.submit(request)
}

func handleCleanup(task: BGProcessingTask) {
    let workTask = Task {
        await runHeavyMaintenance()
        task.setTaskCompleted(success: true)
    }
    task.expirationHandler = { workTask.cancel() }
}
```

---

## 四、静默推送唤醒

之前 16 篇讲过 `content-available: 1`。**它是另一种"被动唤醒"的机制**——服务端有事件时主动推一下,App 在后台醒来跑一段代码。

与 `BGAppRefreshTask` 的对比:

| | BGAppRefreshTask | 静默推送 |
| --- | --- | --- |
| 触发 | 系统调度(机会性) | 服务器主动推 |
| 频率 | 几小时一次 | 系统限流(也机会性) |
| 适用 | 定时拉新闻 / 定时同步 | 事件驱动(消息到了同步) |
| 后端要求 | 无 | 要后端实现 APNs 推送 |

**两者互补**——重要的 App 通常都用:静默推送负责"事件触发",`BGAppRefreshTask` 负责"周期保底"。

---

## 五、scenePhase 与 App 生命周期

```swift
struct MyApp: App {
    @Environment(\.scenePhase) private var scenePhase
    
    var body: some Scene {
        WindowGroup { RootView() }
            .onChange(of: scenePhase) { oldPhase, newPhase in
                switch newPhase {
                case .active: handleActive()
                case .inactive: handleInactive()
                case .background: handleBackground()
                @unknown default: break
                }
            }
    }
}
```

`scenePhase` 三态:
- **`.active`** — App 在前台,可交互
- **`.inactive`** — 短暂中断(下拉控制中心、收到电话、切换 App 一瞬间)
- **`.background`** — 完全进后台

`scenePhase` 是 SwiftUI 时代替代 `UIApplicationDelegate` 老回调(`applicationWillResignActive` / `applicationDidEnterBackground` 等)的现代方式。

**进 .background 时该做的事**:
- 保存未持久化数据(`modelContext.save()`)
- 调度下一次 `BGAppRefreshTask`
- 暂停定时器、停止昂贵动画
- 取消不需要的 Task

---

## 六、UIBackgroundTask:前台延伸

某些场景:App 即将进后台,但有个上传 / 操作还没完。`UIApplication.beginBackgroundTask` 给你**30 秒左右**继续执行:

```swift
@MainActor
func finishUploadInBackground() async {
    var taskID = UIBackgroundTaskIdentifier.invalid
    taskID = UIApplication.shared.beginBackgroundTask(withName: "FinishUpload") {
        // 30 秒到了,系统会调这个 expiration handler
        UIApplication.shared.endBackgroundTask(taskID)
        taskID = .invalid
    }
    
    do {
        try await uploader.completeUpload()
    } catch { }
    
    UIApplication.shared.endBackgroundTask(taskID)
    taskID = .invalid
}
```

这是"延后被挂起"的策略,30 秒后强制挂起。**比 BGAppRefreshTask 更可靠但更短**(必跑,但只 30 秒)。

---

## 七、App Intents:让 Siri / Shortcuts 调用 App 功能

iOS 16 引入的 `App Intents` 是 Apple 把 Siri Intents / Shortcuts Intents / Widget Intents 统一的新协议:

```swift
import AppIntents

struct CreateNoteIntent: AppIntent {
    static var title: LocalizedStringResource = "新建笔记"
    static var description = IntentDescription("快速创建一条笔记")
    
    @Parameter(title: "标题")
    var noteTitle: String
    
    @Parameter(title: "正文")
    var noteBody: String?
    
    @Parameter(title: "标签")
    var tags: [String]?
    
    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<String> {
        let note = Note(title: noteTitle, body: noteBody ?? "")
        // 保存到 SwiftData
        // ...
        return .result(value: "已创建笔记:\(noteTitle)")
    }
}
```

定义完之后,这个 Intent 自动出现在:
- **Shortcuts App** 用户可以拖来组装 workflow
- **Siri** 用户说"嘿 Siri,在 NotesIsland 新建笔记说今晚加班",参数会自动解析
- **Spotlight** 搜索 App 时显示快捷动作
- **App Shortcuts** App 图标长按显示菜单

```swift
struct NotesIslandShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: CreateNoteIntent(),
            phrases: [
                "在 \(.applicationName) 新建笔记",
                "用 \(.applicationName) 记一条"
            ],
            shortTitle: "新建笔记",
            systemImageName: "note.text.badge.plus"
        )
    }
}
```

`AppShortcut` 是"App 自带的快捷指令",iOS 自动暴露给系统,用户不需要去 Shortcuts App 手动添加。

---

## 八、App Intents 参数类型

```swift
@Parameter(title: "标题") var title: String                // 字符串
@Parameter(title: "数量") var count: Int                   // 整数
@Parameter(title: "金额") var amount: Double               // 浮点
@Parameter(title: "启用") var enabled: Bool               // 布尔
@Parameter(title: "日期") var date: Date                  // 日期
@Parameter(title: "URL") var url: URL                     // URL
@Parameter(title: "图片") var image: IntentFile            // 文件 / 图片
@Parameter(title: "标签") var tag: TagEntity              // 自定义实体(需要 AppEntity)

// 数组
@Parameter(title: "标签") var tags: [String]

// 可选
@Parameter(title: "备注") var note: String?

// 枚举
@Parameter(title: "优先级") var priority: PriorityOption

enum PriorityOption: String, AppEnum {
    case low, normal, high
    
    static var typeDisplayRepresentation: TypeDisplayRepresentation { "优先级" }
    static var caseDisplayRepresentations: [PriorityOption: DisplayRepresentation] {
        [
            .low: "低",
            .normal: "中",
            .high: "高"
        ]
    }
}
```

---

## 九、AppEntity:让 App 数据被 Intent 引用

让"笔记"成为 Shortcuts / Siri 可识别的实体:

```swift
struct NoteEntity: AppEntity, Identifiable {
    static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "笔记")
    
    let id: UUID
    let title: String
    
    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(title)")
    }
    
    static var defaultQuery = NoteQuery()
}

struct NoteQuery: EntityQuery {
    @MainActor
    func entities(for identifiers: [UUID]) async throws -> [NoteEntity] {
        // 从 SwiftData fetch 这些 ID 的笔记
        let context = ModelContext(container)
        let descriptor = FetchDescriptor<Note>(predicate: #Predicate { identifiers.contains($0.id) })
        let notes = try context.fetch(descriptor)
        return notes.map { NoteEntity(id: $0.id, title: $0.title) }
    }
    
    @MainActor
    func suggestedEntities() async throws -> [NoteEntity] {
        // 显示给用户挑选时的默认列表
        let context = ModelContext(container)
        let descriptor = FetchDescriptor<Note>(sortBy: [SortDescriptor(\.createdAt, order: .reverse)])
        descriptor.fetchLimit = 10
        let notes = try context.fetch(descriptor)
        return notes.map { NoteEntity(id: $0.id, title: $0.title) }
    }
}

struct OpenNoteIntent: AppIntent {
    static var title: LocalizedStringResource = "打开笔记"
    
    @Parameter(title: "笔记")
    var note: NoteEntity
    
    func perform() async throws -> some IntentResult {
        // 处理打开逻辑(deep link / NavigationStack push)
        return .result()
    }
}
```

这样在 Shortcuts 里"打开笔记" 这个 action,用户可以选择哪一条笔记——`NoteEntity` 让笔记成为可被引用的对象。

---

## 十、Interactive Widget(iOS 17+)与 App Intent

Widget 内的按钮可以直接绑定 AppIntent:

```swift
struct CheckTodoIntent: AppIntent {
    static var title: LocalizedStringResource = "标记完成"
    
    @Parameter(title: "任务")
    var todo: TodoEntity
    
    func perform() async throws -> some IntentResult {
        // 标记 todo 为完成
        return .result()
    }
}

// Widget 视图中
Button(intent: CheckTodoIntent(todo: TodoEntity(id: todo.id))) {
    Image(systemName: todo.done ? "checkmark.circle.fill" : "circle")
}
```

iOS 17+ Widget 可以**不打开 App** 直接执行 intent。20 篇展开 Interactive Widget。

---

## 十一、踩坑

1. **`BGTaskScheduler.register` 没在 `didFinishLaunching` 里**——iOS 启动时会立刻分发 pending tasks,注册晚了会错过。
2. **`earliestBeginDate` 设得太近**——`Date(timeIntervalSinceNow: 5)` 系统几乎肯定不会跑。设几小时后才合理。
3. **task identifier 不在 Info.plist `BGTaskSchedulerPermittedIdentifiers` 里**——submit 直接抛错。
4. **Debug 模式 task 不触发**——Xcode debug 模式系统不调度后台 task。要在 Xcode 控制台模拟:`e -l objc -- (void)[[BGTaskScheduler sharedScheduler] _simulateLaunchForTaskWithIdentifier:@"..."]`。
5. **`expirationHandler` 不调 `setTaskCompleted`**——task 会被强制 kill 且记一次失败,下次调度更难。
6. **后台任务里调 UI 代码**——SwiftUI 在后台 not active,改 UI 通常无害但徒劳。重点放数据持久化。
7. **AppIntent `perform()` 不标 `@MainActor` 又访问 SwiftData**——SwiftData main context 是 `@MainActor`,perform 要么标 `@MainActor`,要么 await 切换。
8. **AppEntity 没实现 `EntityQuery`**——Shortcuts 里选实体时空列表。`defaultQuery` 是必需的。
9. **静默推送依赖业务实时同步**——iOS 限流严,实时性差。重要消息要走"用户可见的推送"。
10. **`UIBackgroundTask` 不调 `endBackgroundTask`**——iOS 5+ 会强制 kill App 作为惩罚。`begin` 必须配 `end`。

---

下一篇 `20-Widget与LiveActivities.md`,讲 `Widget` 协议、`TimelineProvider` / `TimelineEntry` / Reload 策略、`WidgetFamily` 尺寸、Interactive Widget 通过 App Intent、`ActivityAttributes` + `ActivityKit`、Dynamic Island 三态 UI(`compactLeading` / `compactTrailing` / `expanded` / `minimal`)、ActivityKit push token 与远程更新。
