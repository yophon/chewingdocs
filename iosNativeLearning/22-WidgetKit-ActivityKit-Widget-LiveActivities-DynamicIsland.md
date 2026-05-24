# 22 WidgetKit + ActivityKit:Widget / Live Activities / Dynamic Island

> 系列基线:iOS 18 / Swift 6 / Xcode 16 / SwiftUI。文中代码均通过 Swift 6 严格并发模式编译,不使用 `@unchecked Sendable` 与 force unwrap。涉及 iOS 19+ 的新 API 单独标注。

iPhone 屏幕之外的「Apple 表面」愈来愈多:主屏 Widget、锁屏 Widget、StandBy 模式、Dynamic Island、灵动岛三态 UI、Smart Stack、CarPlay、watchOS 复杂功能。Apple 没有给它们各发一套 SDK,而是把所有「不在 App 内、但是 App 拥有」的 UI 统一抽象成 **WidgetKit** 与 **ActivityKit**。前者是「快照型 UI」,后者是「实时状态型 UI」。本篇围绕 NotesIsland 把这一层串完:首页 Widget 显示最近 3 条笔记,Live Activity 在录音过程中常驻 Dynamic Island,Interactive Widget 让用户在不打开 App 的情况下「完成今日打卡」。

学这一章之前请先暂时放下两个常见误解:第一,Widget 不是「迷你 App」,App 进程在 Widget 显示时通常不存在,所以你不能把任何 `Singleton` / `static var` 当跨界共享;第二,Live Activity 不是「常驻通知」,它是受 Apple 严格调度、有明确生命周期、可被系统随时降级或终止的「时态 UI」,与你写 App 内 SwiftUI 的心智完全不一样——后者你拥有像素,前者 Apple 拥有像素而你只是「提交描述」。这条边界贯穿全篇,后面任何 API 设计都能从这条边界倒推出动机。

工程目标层面也需要先对齐:本篇不教你做「Widget 控件展览」(常见教程的通病是把所有 family 都示范一遍),而是把 NotesIsland 的桌面 / 锁屏 / Dynamic Island 三个表面打通一次,让读者能直接照搬到自己的产品。除了主屏 Widget 与录音 Live Activity 外,锁屏 / StandBy / Smart Stack 的差异会在「调参与验收」段一次性给到清单。

---

## 一、机制定位

主线问题只有一个:**App 不在前台、甚至不在内存里时,如何展示并更新它自己的 UI**。

UIKit 时代的旧解法叫 `NSExtension`:一份 Today Widget(iOS 8-13),后来叫 Today Extension,运行在 App 自己的 extension 进程里,通过 IPC 拉数据。问题是:

- extension 进程随时被系统杀死,生命周期不可预期;
- 必须自己写 timer / NSURLSession 拉数据,系统不知道下一次要刷新什么;
- 渲染层是 UIKit,与主 App 双份代码;
- 没有锁屏 Widget、没有 Dynamic Island 概念;
- 用户可以「禁用 / 启用」extension,但「我家 App 的 Widget 多久刷一次」这个权力不在 App 手里,而 App 自己又不知道这一点,常常写出「打开就 timer fire」最后被系统杀掉的代码。

iOS 14 引入 WidgetKit 后心智彻底变了。Widget 不再是「extension 跑着的小 App」,而是 **App 提交一份「未来时间轴上的快照」(Timeline)给系统,系统挑时间渲染、缓存、显示**。这是一个 declarative + server-rendered 的模型:你的代码不在 Widget 显示时运行,而是在 Apple 决定「我下一次要这条 entry」时被唤醒一次,生成静态 SwiftUI 视图树,然后被序列化、上屏。从工程角度看,这是一次「把状态机的所有权从 App 上交给系统」的设计——App 描述「未来一段时间长什么样」,系统决定「什么时候真的去画」。

iOS 16.1 之后,这个心智被扩展到 **Live Activities**:把「一连串接下来的状态」交给 ActivityKit,系统负责在锁屏与 Dynamic Island 渲染。iOS 17 进一步开放 **Interactive Widget**,允许 Widget 上的按钮 / Toggle 通过 **App Intents** 触发后台执行,执行完再请求 reload。iOS 17.2 又加入 **Push to Start**,允许服务端在用户没有打开 App 的情况下,远程启动一条 Live Activity——这是「外卖配送类」App 用户体验跃迁的关键能力。

把这条心智路径反过来看更清晰。Apple 对「App 表面」的设计目标实际上有三段:

1. **iOS 14:把 App 缩成一张快照**(WidgetKit / TimelineProvider);
2. **iOS 16.1:让快照能跟着时间走**(ActivityKit / Live Activity);
3. **iOS 17:让快照能被点**(Interactive Widget / App Intents)。

理解这三段,后面遇到任何「我能在 Widget / Live Activity 里做 X 吗」的问题,答案都会自然落到这条线上的某个点。比如「能不能在 Widget 里跑一个倒计时」——能,但不是 timer,而是用 `Text(timerInterval:)` 让系统在渲染层倒数;比如「能不能在 Live Activity 里弹个对话框」——不能,Live Activity 是只读卡片,要交互必须把用户拉回 App。

可以这样记心智差异:

| 形态 | 谁拥有像素 | 谁推数据 | 适合场景 |
| --- | --- | --- | --- |
| App 内 SwiftUI | App 进程 | App 内部 | 用户主动交互 |
| Widget | 系统进程渲染缓存 | App 提交 Timeline | 周期性快照,如「今日步数 / 最近笔记」 |
| Live Activity | 系统进程渲染缓存 | App / ActivityKit push | 有明确开始与结束的事件,如「外卖在送 / 录音中」 |
| Dynamic Island | 系统进程渲染 Live Activity | 同上 | 14 Pro 起的硬件特性,三态 UI |

跨端框架(Flutter / React Native)在这一层基本没有原生答案,因为它本质要求 Apple 平台风格的 SwiftUI 子集 + Apple 调度的进程模型。NotesIsland 这种本地优先的笔记 App 想做「桌面快捷查看 + 灵动岛录音指示器」必须直面 WidgetKit + ActivityKit。

---

## 二、Apple 平台心智

### 2.1 Widget 三件套

WidgetKit 的核心协议在 `WidgetKit` framework:

- `Widget` 协议:声明一个 Widget 的入口,通过 `WidgetBundle` 注册多个;
- `TimelineProvider` 协议:负责为系统提供 `TimelineEntry` 序列;
- `TimelineEntry` 协议:**一条快照的全部数据**,必须 `Sendable`;
- `WidgetConfiguration`:`StaticConfiguration`(无用户参数)或 `AppIntentConfiguration`(用 App Intent 让用户在长按编辑里挑参数)。

`Timeline` 的本质是一个 (date, entry, reloadPolicy) 序列。系统问 App 三件事:

1. `placeholder(in:)`:Widget gallery 占位,要求纯静态;
2. `snapshot(for:in:)`:Widget Gallery 预览 / Smart Stack 排序,可以读真数据但要快;
3. `timeline(for:in:)`:**真正的下一段时间轴**,返回 `Timeline(entries:policy:)`。

`TimelineReloadPolicy` 三种:`.atEnd`(消费完最后一条再叫我)、`.after(Date)`(到点再叫我)、`.never`(等我自己 `WidgetCenter.shared.reloadTimelines(ofKind:)`)。Apple 的预算:**iOS 每天总共大概给一个 Widget 40-70 次后台 timeline 刷新**,真实数字会随用户使用习惯波动。所以「每 30 秒刷一次」是错误心智。

实际工程中三种 reload policy 的选择标准是:

- 内容随**用户行为**变化(笔记、收藏、消息计数):用 `.never` + `reloadTimelines(ofKind:)`,由 App 在写入数据时主动推。NotesIsland 走这条路;
- 内容随**时间点**变化(日程提醒、倒计时):用 `.after(date)` 给到下一个边界时间;
- 内容**自然过期**(一日步数到日终归零):用 `.atEnd`,提交时把直到 23:59:59 的若干条 entries 一次性放进 Timeline,让系统自动按时间切换。

需要强调的是,`.atEnd` 不等于「无限调度」。Timeline 中提交超过 48 小时的 entry,系统通常只保留前 48 小时内的;超出的丢弃。

### 2.2 WidgetFamily 与尺寸

`WidgetFamily` 枚举决定容器尺寸:

- `systemSmall / systemMedium / systemLarge / systemExtraLarge`(iPad);
- 锁屏 `accessoryCircular / accessoryRectangular / accessoryInline`;
- StandBy 模式复用 `systemSmall` 与 `accessoryRectangular`。

`accessoryCircular` 适合「单一数值」:今日笔记数、电量、温度;`accessoryRectangular` 是锁屏上最常用的一档,允许两行文字 + 小图标;`accessoryInline` 显示在锁屏时间下方,只允许一行带 SF Symbol 的纯文本。NotesIsland 给锁屏只配 `accessoryRectangular`,显示「今天写了 N 条笔记 / 最新一条标题」,避免过度抢占锁屏面积。

不同尺寸的可用 SwiftUI API 是 **SwiftUI 的一个受限子集**:不能用 `ScrollView`、不能用 `TextField`、不能用 `Picker`(只有 iOS 17+ 的 Interactive Widget 支持有限的 `Button` / `Toggle`)。视图实际是被系统快照成 PNG 缓存的。

更细的限制:Widget 中的视图无法使用 `@State` 表达 UI 局部状态——每次渲染都是一次全新的 SwiftUI 调用,没有「下一帧」。所以倒计时不要用 `TimelineView { context in ... }` + `Date.now` 自己算,而要把目标时间塞进 `Text(timerInterval:countsDown:)` / `Text(_: Date.RelativeFormatStyle)`,让系统在渲染层自己计时。SwiftUI 在 Widget 中识别这两类「时间敏感」组件并由系统进行内部 tick,而不需要 App 重新 reload timeline。这一点是 Widget 性能预算的关键。

### 2.3 Interactive Widget(iOS 17+)与 App Intent

iOS 17 引入「按钮可点」的 Widget:`Button(intent:)` / `Toggle(isOn:intent:)` 接受一个 `AppIntent`。点击后:

1. 系统在后台执行 `Intent.perform()`,可以 `async throws`;
2. 执行结束系统隐式调用 `WidgetCenter.shared.reloadTimelines`;
3. App 主进程不需要被唤醒;
4. 可用执行预算大约 100ms-数秒,**不要做长任务**。

NotesIsland 把「完成今日笔记」做成 Widget 上的 Button,点击后直接写 SwiftData,然后下一次 Timeline 显示一个对勾。这一段也明确了一条原则:**Interactive Widget 不是「在 Widget 里跑业务逻辑」,而是「让用户点一下,用户的意图作为 Intent 被发起,真正的业务由系统在后台跑,Widget 只显示结果」**。把它想成 Web 的「按钮提交 + 服务端处理 + 重新拉数据」的本地版,就不容易写错。

### 2.4 ActivityKit 与 Live Activity

ActivityKit framework 的两类核心类型:

- `ActivityAttributes`:**整段 Activity 不变的描述信息**(标题、笔记 ID),需符合 `Sendable & Codable`;
- 内嵌的 `ContentState`:**会随时间变化的状态**(录音秒数、音量电平),也要 `Sendable & Codable`。

`Activity<MyAttributes>.request(...)` 启动一条 Activity,返回的 `activity` 句柄可以 `await activity.update(content:)`,或者拿 `activity.pushToken` 上行给服务端做远程推送(Push to Update 与 Push to Start)。

「Attributes 不变 / ContentState 可变」这条边界很硬:你不能在录音过程中改 `noteTitle`(那是 Attributes 的字段),只能改 `elapsed` / `amplitude`(ContentState 的字段)。如果业务上「标题确实会变」,把它放到 ContentState 里。把不变量放 Attributes 的好处是系统可以基于它在 Smart Stack / Dynamic Island 排序去重,且远程推送的 payload 不需要每次都重传。

另一个易错点:`Activity` 的最大生命周期是 8 小时(iOS 17.2 起最长 12 小时,前提是用户在锁屏 / Dynamic Island 上长期可见),超时会被系统强制结束;`staleDate` 用于表达「再过多久,卡片上的信息就不可信」,系统会在到达 staleDate 后视觉上「灰化」,提示用户「这数据可能过期了」。NotesIsland 的录音 Live Activity 设 staleDate 为 `now + 60s`,每次 update 都把 staleDate 往后推一分钟,从而保证「只要还在录音,卡片就保持新鲜」。

### 2.5 Dynamic Island 四态

`DynamicIsland { ... }` builder 强制声明四个组成区域:

- `expanded`(长按展开):四个 `DynamicIslandExpandedRegion`:`leading / trailing / center / bottom`;
- `compactLeading`(默认收起左侧);
- `compactTrailing`(默认收起右侧);
- `minimal`(多 Activity 并存时被收为小圆点)。

锁屏卡片视图用顶层 `lockScreen:` 闭包描述。这是同一个 `ActivityConfiguration` 内的「多视图」声明,WidgetKit 决定渲染哪一个。

并发心智:Widget 的 `TimelineProvider` 默认是 nonisolated,但视图本身的渲染发生在主线程;ActivityKit 的 `Activity.update` 是 `async`,且其内部状态是 `Sendable`,所以 NotesIsland 的录音状态可以从一个 `actor RecordingEngine` 直接 push 进去而不必跳 `MainActor`。

### 2.6 数据共享:App Group 是地基

Widget Extension 与主 App 是**两个进程、两个 sandbox**,默认互相看不见对方的文件。这意味着无论用哪种持久化方式(UserDefaults、SwiftData、Core Data、SQLite、文件),都必须把容器放进 **App Group**。Xcode 中的步骤:

1. Project → Signing & Capabilities → 主 App target 与 Widget target 都加 `App Groups` capability;
2. 统一勾选同一个 group id(如 `group.com.notesisland.shared`);
3. 主 App 与 Widget 都通过 `FileManager.default.containerURL(forSecurityApplicationGroupIdentifier:)` 拿到共享目录,或 `UserDefaults(suiteName:)` 拿到共享 plist。

这一层做错,后果是「Widget 永远显示老数据」或「Interactive Widget 写入后主 App 看不到」。下面第三节的代码默认 App Group 已经配好。

### 2.7 Smart Stack 与 RelevanceKit

iOS 17 起的 Smart Stack 会根据时间、地点、用户习惯主动从「同一组 Widget」中挑一个置顶。WidgetKit 提供了 `TimelineEntryRelevance(score:duration:)` 让 App 标注「这一刻这一条 entry 多重要」。NotesIsland 在用户打开 App 写完一条新笔记时,把对应 entry 的 `relevance.score` 拉到 0.9 持续 30 分钟;闲置时降到 0.1。这是「主动竞争桌面位置」的唯一杠杆,不写 relevance 的 Widget 在 Smart Stack 里几乎不会冒头。

### 2.8 Live Activity 的远程推送形态

ActivityKit 的远程推送分两种:

- **Push to Update**:Activity 已经在跑(由本地或 push to start 发起),服务端通过 APNs 推 `event=update` 的 payload,系统在客户端解 JSON 写进 `ContentState`,然后重渲染锁屏 / Dynamic Island。
- **Push to Start**(iOS 17.2+):用户没有打开 App、Activity 也没在跑,服务端推 `event=start`,系统在客户端**冷启动一条 Live Activity**,不需要主 App 进程被拉起。这是「外卖在送 / 行程开始 / 直播开始」类场景的关键。

两种推送都使用 `liveactivity` push type,priority 必须 `10`(immediate)且包含 `apns-topic: <bundle-id>.push-type.liveactivity`。Payload 结构示意:

```json
{
  "aps": {
    "timestamp": 1716508800,
    "event": "update",
    "content-state": { "elapsed": 73, "amplitude": 0.42 },
    "stale-date": 1716508860,
    "dismissal-date": 1716509200
  }
}
```

NotesIsland 录音是纯本地场景,不依赖远程推送;但「与朋友合写笔记 / 服务端同步进度」场景就要走 push to update。把 push token 上行写在 `Activity.pushTokenUpdates` 的 `for await` 里,服务端按 Activity id 维护 token 池,Activity 一结束就清掉对应 token。

---

## 三、工程实现

NotesIsland 的目标:

1. 主屏 Widget(systemMedium):显示最近 3 条笔记标题,底部一个「+ 今日笔记」按钮(Interactive);
2. 录音 Live Activity:开始录音时启动,显示 Dynamic Island 三态(秒数 + 红点);停止时结束。

### 3.1 共享数据层

```swift
// File: Shared/NotesIslandShared.swift
// Target Membership: App + Widget Extension

import Foundation
import AppIntents

// MARK: - 共享笔记模型(Widget 与 App 共用,通过 App Group 读)

public struct NoteSnapshot: Codable, Hashable, Sendable {
    public let id: UUID
    public let title: String
    public let updatedAt: Date

    public init(id: UUID, title: String, updatedAt: Date) {
        self.id = id
        self.title = title
        self.updatedAt = updatedAt
    }
}

// MARK: - App Group 共享存储

public enum NotesSharedStore {
    public static let appGroup = "group.com.notesisland.shared"
    public static let snapshotsKey = "recent-notes"

    public static func load() -> [NoteSnapshot] {
        guard
            let defaults = UserDefaults(suiteName: appGroup),
            let data = defaults.data(forKey: snapshotsKey),
            let value = try? JSONDecoder().decode([NoteSnapshot].self, from: data)
        else { return [] }
        return value
    }

    public static func save(_ snapshots: [NoteSnapshot]) {
        guard
            let defaults = UserDefaults(suiteName: appGroup),
            let data = try? JSONEncoder().encode(snapshots)
        else { return }
        defaults.set(data, forKey: snapshotsKey)
    }
}
```

`NoteSnapshot` 之所以重新定义,而不是直接共享 SwiftData `@Model`,是因为 Widget Extension 与主 App 是两个进程,SwiftData 容器跨进程访问需要走 App Group + 共享 `ModelContainer`,这条路线在第 14 篇展开;Widget 只需要轻量快照,用 App Group `UserDefaults` 是性价比最高的做法。

### 3.2 Widget 主体

```swift
// File: WidgetExtension/RecentNotesWidget.swift

import WidgetKit
import SwiftUI
import AppIntents

// MARK: - Timeline Entry

struct RecentNotesEntry: TimelineEntry, Sendable {
    let date: Date
    let snapshots: [NoteSnapshot]
}

// MARK: - Timeline Provider

struct RecentNotesProvider: TimelineProvider {
    func placeholder(in context: Context) -> RecentNotesEntry {
        RecentNotesEntry(date: .now, snapshots: [
            .init(id: UUID(), title: "占位标题", updatedAt: .now)
        ])
    }

    func getSnapshot(in context: Context, completion: @escaping @Sendable (RecentNotesEntry) -> Void) {
        let entry = RecentNotesEntry(date: .now, snapshots: NotesSharedStore.load())
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping @Sendable (Timeline<RecentNotesEntry>) -> Void) {
        let snapshots = NotesSharedStore.load()
        let entry = RecentNotesEntry(date: .now, snapshots: Array(snapshots.prefix(3)))
        // 半小时后让系统再问一次;真正的实时更新依赖 App 主动 reloadTimelines
        let next = Date.now.addingTimeInterval(30 * 60)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

// MARK: - Widget View

struct RecentNotesView: View {
    let entry: RecentNotesEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("最近笔记")
                .font(.caption).foregroundStyle(.secondary)
            ForEach(entry.snapshots.prefix(3), id: \.id) { note in
                Text(note.title)
                    .font(.subheadline)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
            Button(intent: AddTodayNoteIntent()) {
                Label("今日笔记", systemImage: "plus.circle.fill")
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.small)
        }
        .padding(12)
        .containerBackground(.fill.tertiary, for: .widget)
    }
}

// MARK: - Widget Configuration

struct RecentNotesWidget: Widget {
    let kind = "RecentNotesWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: RecentNotesProvider()) { entry in
            RecentNotesView(entry: entry)
        }
        .configurationDisplayName("最近笔记")
        .description("显示最近 3 条笔记,支持一键创建今日笔记。")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
```

注意几个 Swift 6 细节:

- `TimelineEntry` 在 iOS 18 SDK 中并未要求 `Sendable`,但我们显式声明 `Sendable` 让闭包跨隔离域时编译期检查通过;
- `getTimeline` 闭包参数标 `@Sendable`,这是 Swift 6 严格并发下避免 `Sending '...' risks causing data races` 警告的必备写法;
- `.containerBackground(for: .widget)` 是 iOS 17 起的强制要求,缺它在 iOS 17+ 会留白。

### 3.3 Interactive Widget 用的 App Intent

```swift
// File: Shared/AddTodayNoteIntent.swift
// Target Membership: App + Widget Extension

import AppIntents
import WidgetKit

struct AddTodayNoteIntent: AppIntent {
    static let title: LocalizedStringResource = "添加今日笔记"
    static let description = IntentDescription("在 NotesIsland 中追加一条今日笔记")

    func perform() async throws -> some IntentResult {
        var snapshots = NotesSharedStore.load()
        let new = NoteSnapshot(
            id: UUID(),
            title: "今日笔记 \(Date.now.formatted(date: .abbreviated, time: .shortened))",
            updatedAt: .now
        )
        snapshots.insert(new, at: 0)
        NotesSharedStore.save(Array(snapshots.prefix(10)))
        // 让 Widget 立刻拿到新数据
        WidgetCenter.shared.reloadTimelines(ofKind: "RecentNotesWidget")
        return .result()
    }
}
```

`perform` 本身就是 `async throws`,Apple 推荐它本质做轻量写入(SwiftData / UserDefaults),不要发网络请求。

### 3.4 录音 Live Activity 与 Dynamic Island

```swift
// File: Shared/RecordingAttributes.swift
// Target Membership: App + Widget Extension

import ActivityKit
import Foundation

struct RecordingAttributes: ActivityAttributes, Sendable {
    public struct ContentState: Codable, Hashable, Sendable {
        var elapsed: TimeInterval
        var amplitude: Double // 0-1
    }
    var noteTitle: String
}
```

```swift
// File: WidgetExtension/RecordingLiveActivity.swift

import WidgetKit
import SwiftUI
import ActivityKit

// MARK: - Live Activity 配置

struct RecordingLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RecordingAttributes.self) { context in
            // 锁屏 / 通知中心展示卡片
            LockScreenView(context: context)
                .activityBackgroundTint(.black.opacity(0.6))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label(context.attributes.noteTitle, systemImage: "mic.fill")
                        .foregroundStyle(.red)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(context.state.elapsed.formattedMMSS)
                        .monospacedDigit()
                }
                DynamicIslandExpandedRegion(.bottom) {
                    AmplitudeBar(value: context.state.amplitude)
                }
            } compactLeading: {
                Image(systemName: "mic.fill").foregroundStyle(.red)
            } compactTrailing: {
                Text(context.state.elapsed.formattedMMSS)
                    .monospacedDigit()
            } minimal: {
                Image(systemName: "mic.fill").foregroundStyle(.red)
            }
        }
    }
}

// MARK: - 锁屏视图

private struct LockScreenView: View {
    let context: ActivityViewContext<RecordingAttributes>

    var body: some View {
        HStack {
            Label(context.attributes.noteTitle, systemImage: "mic.fill")
                .font(.headline)
            Spacer()
            Text(context.state.elapsed.formattedMMSS).monospacedDigit()
        }
        .padding()
    }
}

// MARK: - 振幅可视化

private struct AmplitudeBar: View {
    let value: Double
    var body: some View {
        GeometryReader { geo in
            Capsule()
                .fill(.red.gradient)
                .frame(width: geo.size.width * value, height: 6)
        }
        .frame(height: 6)
    }
}

private extension TimeInterval {
    var formattedMMSS: String {
        let total = Int(self)
        return String(format: "%02d:%02d", total / 60, total % 60)
    }
}
```

### 3.5 主 App 端启动与更新 Live Activity

```swift
// File: Features/Recording/RecordingActivityController.swift

import ActivityKit
import Foundation

actor RecordingActivityController {
    private var activity: Activity<RecordingAttributes>?

    func start(title: String) async throws {
        let attributes = RecordingAttributes(noteTitle: title)
        let initial = RecordingAttributes.ContentState(elapsed: 0, amplitude: 0)
        let content = ActivityContent(state: initial, staleDate: nil)
        activity = try Activity.request(
            attributes: attributes,
            content: content,
            pushType: .token // 同时拿 push token,可用于远程更新
        )
    }

    func update(elapsed: TimeInterval, amplitude: Double) async {
        guard let activity else { return }
        let state = RecordingAttributes.ContentState(elapsed: elapsed, amplitude: amplitude)
        await activity.update(ActivityContent(state: state, staleDate: nil))
    }

    func stop() async {
        guard let activity else { return }
        await activity.end(nil, dismissalPolicy: .immediate)
        self.activity = nil
    }
}
```

把它放在 `actor` 里,让录音引擎 (`AVAudioRecorder` 的 wrapper) 每 0.2 秒 `await controller.update(...)`,严格并发模式下完全编译过。

### 3.6 Widget Bundle 注册

最后一步,把所有 Widget 与 Live Activity 串进 `WidgetBundle`:

```swift
// File: WidgetExtension/NotesIslandWidgetBundle.swift

import WidgetKit
import SwiftUI

@main
struct NotesIslandWidgetBundle: WidgetBundle {
    var body: some Widget {
        RecentNotesWidget()
        RecordingLiveActivity()
    }
}
```

`@main` 修饰的 `WidgetBundle` 是 Widget Extension 的入口,替代旧的 `principalClass`。一个 extension 可以挂多个 Widget / LiveActivity,但仍只算一个 extension target;你不需要为「最近笔记 Widget」与「录音 Live Activity」分别创建两个 target。

---

## 四、调参与验收

### 4.1 关键参数与代价

| 参数 | 影响 | 推荐 |
| --- | --- | --- |
| `TimelineReloadPolicy` | 系统下次问 timeline 的时间 | 静态内容 `.after(30min~2h)`;主动驱动 `.never` + `reloadTimelines(ofKind:)` |
| `Timeline.entries` 数量 | 一次提交的快照数 | 状态稳定的展示型 Widget 提交 1-5 条即可;别尝试一次提交 24 小时切片来「省后台预算」 |
| `Activity.request(pushType:)` | 是否生成 push token | 需要服务端远程更新填 `.token`,纯本地填 `nil` |
| `staleDate` | 系统判定 Activity 状态过期阈值 | 录音类 30s-1min;长生命周期(配送)给到 1h |
| `dismissalPolicy` | 结束后的留存时间 | 默认 4 小时;`.immediate` 立刻消失;`.after(.now.addingTimeInterval(60))` 给用户一分钟看结果 |
| `supportedFamilies` | 显示的尺寸 | 列表型 Widget 至少 `systemMedium`,小尺寸放不下三条标题 |
| `TimelineEntryRelevance.score` | Smart Stack 抢位 | 用户「刚操作过」的场景临时拉高;闲置降低 |
| `containerBackground` 形式 | 锁屏 / StandBy 渲染 | 锁屏 Widget 用 `Color.clear`,主屏用 `.fill.tertiary` 即可

### 4.2 手动验证清单

1. 在 Xcode 16 中创建 Widget Extension target,确保 `Info.plist` 里 `NSExtensionPointIdentifier = com.apple.widgetkit-extension`;Activity attributes 文件 Target Membership 同时勾选 App 与 Widget Extension。
2. 真机或模拟器(iOS 18.0+)运行 App,主 App 写入几条 `NoteSnapshot` 到 App Group,然后退到桌面,长按 → 编辑桌面 → 添加 NotesIsland 「最近笔记」 Widget。
3. 期望:Widget 显示三条标题与「今日笔记」按钮;点击按钮 0.5-2 秒后列表顶部出现一条新笔记。
4. 验证 Interactive Widget 的关键:**点击按钮后 App 不需要前台启动**。在 Xcode 的 Devices and Simulators 看不到主 App 进程被拉起。
5. 在 App 内点击「开始录音」,锁屏后应在 Dynamic Island compact 状态看到红色麦克风 + `00:01` 持续累加;长按 Dynamic Island 应展开 leading / trailing / bottom 三区。
6. Live Activity 显示数据延迟应稳定在 100ms-300ms 之间。若超过 1 秒,检查是不是把 `update` 放到了 `MainActor` 串行队列里被阻塞。
7. **预算压力测试**:在 App 内连续创建 100 条笔记,每条都调一次 `WidgetCenter.shared.reloadTimelines`;打开 Console.app 过滤 `widgetkit`,确认系统只挑了几次真实执行 timeline。若发现 `reloadTimelines` 直接吞下 100 次回调,说明 App 把心智搞错了——`reloadTimelines` 是「告诉系统状态可能变了」,系统决定何时实际调 timeline 函数,**不应**假设 1:1 对应。
8. **冷启动 Live Activity**:把 App 完全杀掉,通过推送 Push to Start 一条 Activity(iOS 17.2+),验证锁屏卡片出现而 App 进程没被拉起。
9. **多 Activity 共存**:启动两条 Live Activity(录音 + 计时),Dynamic Island 会自动把第二条收到 minimal 圆点形态;切换前台 App 时 compact 与 minimal 应稳定显示。

### 4.3 真机 vs 模拟器差异

- Dynamic Island 必须 iPhone 14 Pro / 15 / 16 系列(Pro 与非 Pro 都有,iPhone 15 起统一)真机;模拟器只在 iPhone 14/15/16 Pro 模板里渲染。
- StandBy 模式只在横屏 + 充电状态下展示,模拟器测不了。
- 锁屏 Widget 在低电量模式下会被系统降低刷新频率,真机测试需要排除这一项。
- Interactive Widget 的按钮点击在模拟器上几乎是同步反馈,真机上会有 200-500ms 的 spinner;评估用户感知必须以真机为准。
- Push to Start 在模拟器上不可用(模拟器无 APNs 通路),只能通过 Xcode 16 的「Simulator → Features → Trigger Live Activity」菜单手动模拟,真实联调需要真机 + APNs Push Notifications Console。
- ActivityKit 在低电量模式下会自动停止远程推送的 update,只接受本地 `update`,设计推送策略时要把这个降级路径考虑进去。

### 4.4 性能 / 电量 / 内存

WidgetKit / ActivityKit 的执行有严格预算,工程上需要把以下数字记到肌肉记忆里:

- Widget Timeline 函数:总耗时上限 **5 秒**,超时直接被 kill,UI 显示「Widget 无法加载」;
- AppIntent.perform:上限 **30 秒**,但建议 1 秒内完成,长任务用 `BGTaskScheduler` 或推到 App 内;
- Live Activity 单次 update payload 上限 **4KB**(本地 update 与远程 push 都是这个数);
- Widget extension 进程内存上限 **30MB**,加载大图务必先 downsample 到容器尺寸(SwiftUI 的 `Image(decorative:)` 不会自动下采样)。

不在边界内,系统不会报错,只会静默丢弃后续 reload 请求,排查起来非常痛。监控这些指标最直接的工具是 Console.app + 设备端 `os_log`:Widget extension 进程的日志带 subsystem `com.apple.widgetkit` 与 `com.apple.activitykit`,在筛选框输入这两个 subsystem 就能看到「timeline 被调度 / Activity update 被合并 / push payload 解析失败」等关键事件。

---

## 五、踩坑

### 5.1 与 Swift 5 / iOS 16 教程的差异

- **不要再写 `IntentTimelineProvider`**:那是 iOS 14 SiriKit Intents UI 路线,iOS 17 起推荐 `AppIntentTimelineProvider`(配合 `AppIntent`,不是 `INIntent`)。
- **`.background(...)` 在 Widget 里弃用**:iOS 17 起必须用 `.containerBackground(for: .widget)`,否则 lockscreen 与 StandBy 渲染会出错。
- **`Color` 在 Widget 里不能用任意自定义 `Color(uiColor:)`**:Widget 渲染进程访问不到 App 的资源域,要么放 Asset Catalog 的 Color set 并把 Asset 加到 Widget target,要么用系统 Material。
- **iOS 16 教程的 `NSPersistentContainer` 跨进程**:不要照搬,SwiftData 的 `ModelContainer` 跨进程需要 App Group 容器 + 共享 store URL,在第 14 篇展开,这一篇用 `UserDefaults(suiteName:)` 是有意为之。
- **`Bundle.main` 在 Widget extension 里指向的是 extension bundle**,不是主 App bundle。读资源要用 `Bundle(for: SomeClassInTarget.self)` 或显式给 bundle id;否则会拿到错的资源或返回空。
- **`UIApplication` 在 Widget extension 不可用**:不要写 `UIApplication.shared.beginBackgroundTask`,extension 没有 UIApplication 单例;后台任务由系统控制,App 端不需要参与。

### 5.2 Swift 6 严格并发常见报错

- `Capture of 'self' in a closure that outlives the function` 出现在 `getTimeline` 里:`TimelineProvider` 是 struct,不存在生命周期问题,但闭包参数若没标 `@Sendable` 会让编译器误判。修法是给 `completion` 形参标 `@Sendable @escaping`,如 3.2 节示例。
- `Static property 'X' is not concurrency-safe`:`NotesSharedStore.appGroup` 用 `let` 而不是 `var`,且类型 `String` 是 `Sendable`,默认就过;若你不慎写成 `static var`,Swift 6 会拒编译。
- `ActivityContent` 的 `state` 必须 `Sendable & Codable`,定义 `ContentState` 时记得同时 conform 这两个协议。
- `RecordingActivityController` 是 `actor`,从 SwiftUI 视图调用其方法要用 `await`,且 `start(title:)` 中抛错路径必须被 `try` 包住;不要在 `Task { try await ... }` 里漏 `try`。
- ActivityKit 的 `Activity.activityUpdates` / `pushTokenUpdates` 都是 `AsyncSequence`,迭代时务必把 `for await` 放在一个独立 `Task`,并在 Activity 结束时 `cancel()` 该 Task,避免泄漏。

### 5.3 用户感知层踩坑

- Widget Gallery 中的预览(`snapshot`)与首次添加上屏的真实 entry **不是同一个调用**。如果你只在 `snapshot` 里返回真实数据,但 `timeline` 里返回 placeholder,会导致用户拖到桌面后内容瞬间「变空」。两个方法都要给真实数据。
- `reloadTimelines(ofKind:)` 不是同步刷新,它是「请求系统在合适的时机再问一次 timeline」。所以你不能假设 `reloadTimelines` 调用完之后 100ms 内 Widget 一定刷新到新内容,典型延迟 1-5 秒。
- Live Activity 的 push token 在 `Activity.request(pushType: .token)` 之后,需要 `for await pushToken in activity.pushTokenUpdates` 才能拿到,iOS 17.2+ 还支持 Push to Start(`Activity.push.startTokens`),把上行到服务端的逻辑放进一个独立 `Task`,绑定 Activity 生命周期。
- `dismissalPolicy: .immediate` 会让 Live Activity 立刻消失,**包括锁屏卡片**,如果你想让用户看到「录音已保存」的结果摘要,改用 `.after(date)` 给 30-60 秒。
- iOS 18 起 Apple 把 Widget 上的 `Image` 自动渲染为 placeholder 时使用了更激进的 redaction 策略,如果你 Widget 里依赖 `Image(uiImage:)` 显示笔记封面,需要给 fallback 否则 placeholder 状态下整片空白。
- **Widget 渲染进程访问不到主 App 的内存**:不要尝试在 `TimelineProvider` 里读取一个由主 App `@MainActor` 维护的全局变量;那个变量在 Widget 进程里是空的或不存在。所有数据都必须经过 App Group(UserDefaults / 文件 / 共享 SQLite)。
- **deep link 路径**:Widget / Live Activity 都不能直接调 `UIApplication.shared.open`,改用 SwiftUI 的 `widgetURL(_:)` 与 `Link`,系统会自动 launch App。NotesIsland 笔记行点击应跳转到对应详情页,实现:`widgetURL(URL(string: "notesisland://note/\(id)"))`,然后主 App 用 `onOpenURL` 路由到详情。
- **AppIntent 在 Widget extension 里执行,但访问的资源也是 extension 进程的资源**:不能依赖 App 的 keychain item(除非配置 keychain access group)、不能依赖 App 启动时挂载的资源。如果 Intent 需要登录态,把 token 放进 App Group 共享 Keychain。
- iOS 19+(标注:仅适用于 iOS 19 SDK):Apple 进一步扩展了 Live Activity 在 CarPlay 上的呈现,接口与 iOS 18 兼容,但 `supportedFamilies` 需要补 `.carPlay`,降级方案是 `if #available(iOS 19, *)` 包裹该 family,主线保持 iOS 18 形态。
- **审核要求**:Apple Review 2.5.18 要求 Live Activity「有明确的开始与结束」,长期挂载、用于广告 / 通知滚动条的 Live Activity 会被拒。NotesIsland 录音 Activity 的开始 = 用户按下录音键,结束 = 用户按停止键,边界明确。
- **频率上限**:ActivityKit `update` 没有硬上限,但系统会按 throttle 折叠超高频更新。NotesIsland 录音振幅可视化建议 5Hz-10Hz 即可(每 100-200ms 一次),20Hz 以上会被折叠,且耗电明显。
- **「锁屏看不到 Live Activity」自查路径**:Settings → Face ID & Passcode → 关闭「Allow Access When Locked → Live Activities」会导致全局不可见;开发期测试问题前请先确认这一项打开。
- **Mac Catalyst / iPad**:Widget 在 iPad 有 `systemExtraLarge`,Mac Catalyst 上不支持 Live Activity;跨平台代码用 `#if os(iOS)` 把 Live Activity 那块圈起来,避免 mac 编译失败。

把这三块装进 NotesIsland,你会得到一个「不在前台也能感知」的 App 形态:桌面有它的最近笔记摘要,灵动岛有录音指示,锁屏有 Live Activity 卡片。再往后两篇,我们继续把 NotesIsland 变成一个能赚钱、能被全世界使用、能让视障用户也能用的真应用。
