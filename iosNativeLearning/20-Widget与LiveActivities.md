# Widget 与 Live Activities

Widget(iOS 14+)、Live Activities(iOS 16.1+)、Dynamic Island(iOS 16+,iPhone 14 Pro+)是 iOS 区别于跨端的核心阵地。Widget 让 App 在主屏 / 锁屏外伸,Live Activity 让正在进行的任务(送货、比赛、计时器)持续展示。这一篇讲透 `WidgetKit` + `ActivityKit` 的完整心智。

> 一句话先记住:**Widget 是"时间线驱动的静态快照"——你给系统一组 `TimelineEntry`(每个含时间 + 渲染数据),系统按时间切换显示。Live Activity 是"App 主动推内容的动态卡片"——App 在前台 / 后台都能更新,锁屏 / 通知中心 / Dynamic Island 同时显示。两者都是 Widget Extension,共用 SwiftUI 的一个子集(限制更多)。**

---

## 一、Widget 是 Extension,不是主 App

Widget 是独立的 target(Widget Extension),与主 App 通过 App Group 共享数据(14 篇讲过)。**Widget 不能跑任意 UIKit / SwiftUI 代码**——只能用一个受限子集,因为它们由 WidgetKit 渲染进程托管,资源受限。

允许:
- `Text` / `Image` / `Color` / `Shape`
- `VStack` / `HStack` / `ZStack` / `Grid`
- `Link` / `Button`(只在 Interactive Widget 内)
- `AsyncImage`(iOS 17+ Widget)
- 基本 modifier(`padding` / `background` / `clipShape` / `foregroundStyle`)

不允许:
- `ScrollView` / `List`(Widget 不能滚动)
- `NavigationStack`
- `Sheet` / `Alert`
- 动画(只能简单 transition)
- `@State` 持久状态(每次 timeline 刷新都是新实例)
- 网络请求(必须在 TimelineProvider 内提前完成)

---

## 二、Widget 的三件套

```swift
import WidgetKit
import SwiftUI

// 1. TimelineEntry:某个时间点的数据快照
struct NoteEntry: TimelineEntry {
    let date: Date              // 显示时间
    let recentNotes: [NoteSummary]
    let configuration: ConfigurationAppIntent     // 用户配置
}

// 2. TimelineProvider:生成 entry 序列
struct NoteProvider: AppIntentTimelineProvider {
    // 预览(配置界面 / Widget gallery 显示)
    func placeholder(in context: Context) -> NoteEntry {
        NoteEntry(date: .now, recentNotes: NoteSummary.samples, configuration: ConfigurationAppIntent())
    }
    
    func snapshot(for configuration: ConfigurationAppIntent, in context: Context) async -> NoteEntry {
        await fetchEntry(date: .now, configuration: configuration)
    }
    
    func timeline(for configuration: ConfigurationAppIntent, in context: Context) async -> Timeline<NoteEntry> {
        let now = Date()
        var entries: [NoteEntry] = []
        
        // 生成接下来 5 小时,每小时一个 entry
        for hourOffset in 0..<5 {
            let entryDate = Calendar.current.date(byAdding: .hour, value: hourOffset, to: now)!
            let entry = await fetchEntry(date: entryDate, configuration: configuration)
            entries.append(entry)
        }
        
        return Timeline(entries: entries, policy: .atEnd)
    }
    
    private func fetchEntry(date: Date, configuration: ConfigurationAppIntent) async -> NoteEntry {
        let notes = await readSharedNotes()    // 从 App Group 读
        return NoteEntry(date: date, recentNotes: notes, configuration: configuration)
    }
}

// 3. Widget 视图
struct NoteWidgetView: View {
    let entry: NoteEntry
    
    var body: some View {
        VStack(alignment: .leading) {
            Text("最近笔记").font(.caption).foregroundStyle(.secondary)
            ForEach(entry.recentNotes.prefix(3)) { note in
                Text(note.title).font(.headline).lineLimit(1)
            }
        }
        .padding()
    }
}

// 4. Widget 入口
struct NoteWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(
            kind: "com.example.NotesIsland.NoteWidget",
            intent: ConfigurationAppIntent.self,
            provider: NoteProvider()
        ) { entry in
            NoteWidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("最近笔记")
        .description("显示最近创建的笔记")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

// 5. WidgetBundle:声明这个 extension 提供的 widgets
@main
struct NotesIslandWidgets: WidgetBundle {
    var body: some Widget {
        NoteWidget()
        // 可以有多个 widget
    }
}
```

---

## 三、Timeline reload policy

`Timeline(entries:policy:)` 的 policy 决定系统何时再问你要新 timeline:

- **`.atEnd`** — 最后一个 entry 显示完后再问
- **`.after(date)`** — 指定时间后再问
- **`.never`** — 永不自动 reload,只能 App 主动触发

主动触发 reload(从主 App 调用):

```swift
import WidgetCenter

WidgetCenter.shared.reloadTimelines(ofKind: "com.example.NotesIsland.NoteWidget")
// 或者重载所有 widget
WidgetCenter.shared.reloadAllTimelines()
```

**主动 reload 也是机会性的**——系统会限流,你的 App 进后台后 reload 请求可能延迟到下次系统让你跑时。

iOS 限制 Widget 每天 timeline 刷新次数(大约 40-70 次),所以**不能依赖 widget 显示实时数据**。要"实时" 用 Live Activity,不用 Widget。

---

## 四、WidgetFamily:不同尺寸

```swift
.supportedFamilies([
    .systemSmall,      // 主屏 2×2
    .systemMedium,     // 4×2
    .systemLarge,      // 4×4
    .systemExtraLarge, // iPad 8×4
    .accessoryCircular, // 锁屏小圆(watchOS 也用)
    .accessoryRectangular, // 锁屏长条
    .accessoryInline   // 锁屏文字
])
```

不同 family 应该有不同布局——`.systemSmall` 只放 1-2 条信息,`.systemLarge` 能放 4-6 条。判断 family 在 view 内:

```swift
struct NoteWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: NoteEntry
    
    var body: some View {
        switch family {
        case .systemSmall: SmallView(entry: entry)
        case .systemMedium: MediumView(entry: entry)
        case .systemLarge: LargeView(entry: entry)
        case .accessoryCircular: CircularView(entry: entry)
        default: EmptyView()
        }
    }
}
```

---

## 五、Interactive Widget(iOS 17+)

iOS 17 起 Widget 内的按钮可以**直接触发 App Intent**,不打开主 App:

```swift
struct ToggleTodoIntent: AppIntent {
    static var title: LocalizedStringResource = "完成任务"
    
    @Parameter(title: "任务 ID")
    var todoID: String
    
    func perform() async throws -> some IntentResult {
        // 读 → 改 → 写回共享存储 → reload widget
        var todos = readSharedTodos()
        if let idx = todos.firstIndex(where: { $0.id == todoID }) {
            todos[idx].done.toggle()
            writeSharedTodos(todos)
        }
        WidgetCenter.shared.reloadTimelines(ofKind: "TodoWidget")
        return .result()
    }
}

// Widget 里
Button(intent: ToggleTodoIntent(todoID: todo.id)) {
    Image(systemName: todo.done ? "checkmark.circle.fill" : "circle")
}
```

`Button(intent:)` 是 iOS 17+ 新 API,Widget 内点击直接跑 intent 的 perform,不离开主屏。19 篇讲过 App Intents 的细节。

---

## 六、Deep Link:点击 Widget 进 App

非 Interactive 部分点击 Widget 默认是"打开 App",通过 `widgetURL` 携带参数:

```swift
NoteWidgetView(entry: entry)
    .widgetURL(URL(string: "notesisland://note/\(noteID)")!)
```

主 App 用 `.onOpenURL` 处理(11 篇讲过)。

整个 Widget 一个链接;部分区域不同链接,套 `Link`:

```swift
VStack {
    ForEach(entry.notes) { note in
        Link(destination: URL(string: "notesisland://note/\(note.id)")!) {
            NoteRowInWidget(note: note)
        }
    }
}
```

---

## 七、Live Activities:动态卡片

Live Activity 是"正在进行的任务",iOS 16.1+ 支持,iPhone 14 Pro+ 还显示在 Dynamic Island。典型场景:外卖配送、网约车、体育赛事、计时器。

```swift
import ActivityKit

struct DeliveryAttributes: ActivityAttributes {
    public typealias DeliveryStatus = ContentState   // 命名约定
    
    // 不可变属性(整个 activity 期间不变)
    let orderID: String
    let restaurantName: String
    
    // 可变状态(频繁更新)
    public struct ContentState: Codable, Hashable {
        let status: Status
        let progress: Double
        let etaMinutes: Int
        
        enum Status: String, Codable {
            case preparing, picking, delivering, delivered
        }
    }
}

// 启动 Activity(主 App 内)
func startDeliveryActivity(orderID: String, restaurant: String) async {
    let attributes = DeliveryAttributes(orderID: orderID, restaurantName: restaurant)
    let initialState = DeliveryAttributes.ContentState(
        status: .preparing,
        progress: 0,
        etaMinutes: 35
    )
    
    do {
        let activity = try Activity.request(
            attributes: attributes,
            content: .init(state: initialState, staleDate: nil),
            pushType: .token       // 后续可远程更新
        )
        
        // 拿到 push token,上传到服务器
        for await pushToken in activity.pushTokenUpdates {
            let token = pushToken.map { String(format: "%02x", $0) }.joined()
            await uploadActivityPushToken(token)
        }
    } catch {
        print("启动失败:\(error)")
    }
}

// 更新
func updateProgress(activity: Activity<DeliveryAttributes>, progress: Double, eta: Int) async {
    let newState = DeliveryAttributes.ContentState(
        status: progress < 0.5 ? .picking : .delivering,
        progress: progress,
        etaMinutes: eta
    )
    await activity.update(.init(state: newState, staleDate: nil))
}

// 结束
func endActivity(activity: Activity<DeliveryAttributes>) async {
    let finalState = DeliveryAttributes.ContentState(
        status: .delivered,
        progress: 1.0,
        etaMinutes: 0
    )
    await activity.end(.init(state: finalState, staleDate: nil), dismissalPolicy: .immediate)
}
```

---

## 八、Live Activity UI:锁屏 + Dynamic Island

UI 在 Widget Extension 里写:

```swift
import WidgetKit
import SwiftUI
import ActivityKit

struct DeliveryActivityView: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: DeliveryAttributes.self) { context in
            // 锁屏 / 通知中心 显示
            VStack(alignment: .leading) {
                Text(context.attributes.restaurantName).font(.headline)
                ProgressView(value: context.state.progress)
                HStack {
                    Image(systemName: iconFor(context.state.status))
                    Text(statusLabel(context.state.status))
                    Spacer()
                    Text("\(context.state.etaMinutes) 分钟")
                }
            }
            .padding()
            .activityBackgroundTint(.orange)
        } dynamicIsland: { context in
            // Dynamic Island 三态
            DynamicIsland {
                // expanded(下拉展开)
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: "bag.fill")
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("\(context.state.etaMinutes) 分钟")
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.attributes.restaurantName)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    ProgressView(value: context.state.progress)
                }
            } compactLeading: {
                Image(systemName: "bag.fill")
            } compactTrailing: {
                Text("\(context.state.etaMinutes)m")
            } minimal: {
                Image(systemName: "bag.fill")
            }
            .keylineTint(.orange)
        }
    }
}
```

Dynamic Island 四态:
- **`compactLeading`** — 左边小图标(默认 Compact 状态)
- **`compactTrailing`** — 右边短文字
- **`expanded`** — 用户长按后展开的大区域(`leading` / `trailing` / `center` / `bottom` 四区域)
- **`minimal`** — 多个 Activity 共存时极简显示

---

## 九、Push to Update / Push to Start Live Activity

服务器推送更新 Live Activity(不需要 App 在前台):

```json
{
  "aps": {
    "timestamp": 1700000000,
    "event": "update",
    "content-state": {
      "progress": 0.7,
      "etaMinutes": 10,
      "status": "delivering"
    }
  }
}
```

`event` 可选 `start` / `update` / `end`。**iOS 17.2+ 支持 Push to Start**——服务器直接推启动 Activity(不需要 App 启动过)。16 篇讲过 Push to Start 的 token 拿取。

```json
{
  "aps": {
    "timestamp": 1700000000,
    "event": "start",
    "attributes-type": "DeliveryAttributes",
    "attributes": {
      "orderID": "order-123",
      "restaurantName": "麦当劳"
    },
    "content-state": {
      "status": "preparing",
      "progress": 0,
      "etaMinutes": 35
    },
    "alert": { "title": "订单已确认" }
  }
}
```

---

## 十、Live Activity 限制

- **最长 8 小时活跃**,之后系统自动 end
- **每分钟最多更新 4 次**(超出会被丢弃)
- **每条 content-state ≤ 4KB**
- **同一 attribute 类型一次只能存在 1 个 Activity**(不能同时多个外卖)
- **iPhone 14 Pro+ 才有 Dynamic Island**——其他设备只显示锁屏卡片

---

## 十一、踩坑

1. **Widget 里调网络**——Widget Extension 进程时间短(几秒),网络不一定能完成。所有数据应该在主 App 算好写共享存储,Widget 只读取。
2. **Timeline 一次返回太多 entry**——太多没意义,iOS 限刷新次数。返回 3-10 个够了。
3. **`.containerBackground` 没写**——iOS 17+ Widget 必须显式声明背景,否则可能渲染异常。
4. **Widget 改 SwiftData 数据**——技术能(共享 container),但 Widget Extension 写入后主 App 可能不知道。让主 App 写,Widget 只读。
5. **Live Activity push token 不上传**——只能本地更新,失去远程推送能力。
6. **Activity attribute 改了字段没升级**——`attributes-type` 在 push 推送时要严格匹配,新版本部署时考虑兼容。
7. **Dynamic Island compact 显示挤**——空间极小,只放 1-2 个字符或 1 个图标。
8. **Interactive Widget 期望立即看到结果**——Intent perform 完后,要 `WidgetCenter.shared.reloadTimelines(...)` 触发刷新。
9. **Widget 用 `@StateObject` / `@Observable`**——Widget 不支持持久状态,每次 timeline 刷新都是全新实例。所有状态走 entry 传入。
10. **测试 Live Activity 在模拟器**——Live Activity 在 iOS 16+ 模拟器支持,但 Dynamic Island 渲染要 iPhone 14 Pro 系列的模拟器。

---

下一篇 `21-StoreKit2与SignInWithApple.md`,讲 StoreKit 2 现代 API、`Product.products(for:)` / `Product.purchase()` / `Transaction.updates`、JWS 收据本地校验、沙盒测试、订阅状态、App Store Server Notifications V2、`SignInWithAppleButton` + `ASAuthorizationAppleIDCredential`、服务端 token 校验。
