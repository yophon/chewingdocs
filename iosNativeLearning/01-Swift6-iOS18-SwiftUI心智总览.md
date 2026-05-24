# 01 Swift 6 / iOS 18 / SwiftUI 心智总览

> 系列开篇。本篇不写一行可上架的业务代码,只回答四个问题:**为什么 2026 年还要写原生 iOS、Apple 这套 SDK 到底分了几层、`@main` + `App` 协议如何取代旧 `AppDelegate`、本系列最终会做出什么样的应用**。读完后能在脑子里搭起一张 iOS 18 / Swift 6 的工程坐标系,知道后续 29 篇的每一篇插在坐标系的哪一格里。

---

## 一、机制定位:为什么 2026 年还要写「原生」

很多团队对「原生 iOS」的第一反应是:既然有 Flutter、React Native、Kotlin Multiplatform,为什么还要拿出半年时间去学一套只能在 Apple 设备上跑的语言、UI 框架、构建系统?这个问题在 2018 年答得含糊,在 2026 年其实已经很清楚。

**原生不是「另一种实现」,而是「全部能力的入口」。** Apple 每年 WWDC 推出的新能力——Live Activities、Dynamic Island、Interactive Widget、App Intents、StoreKit 2、Apple Intelligence、Translation Framework、ScreenCaptureKit、Spatial Audio、Vision Pro 的 Volumetric Window——首发都只在 Swift + Apple framework 上可用。跨端框架追平这些 API 的周期通常是 6 至 18 个月,部分能力(比如 Live Activities 的 push token 链路、App Intents 与 Siri 的语义参数、Sign in with Apple 的服务端 JWS 校验)在跨端层永远是「半残的桥」。如果你的产品要用「这台手机能做的全部事情」,原生没有替代品。

**原生不是「更难」,而是「难度分布不同」。** 写 Flutter 的人会感叹 Dart 的语法很轻,但跨端调试 Platform Channel、对接 iOS 推送、做 In-App Purchase、过 App Store 审核时的那种「明明 plugin 写对了,但 archive 之后 crash」的痛苦,只是把难度从语言层挪到了胶水层。Swift 6 + SwiftUI 把难度集中在「类型系统 + 并发模型」上,一旦越过这道坎,从 UI、网络、数据持久化、推送、Widget、上架,整条链路只用一种语言、一种构建系统、一个调试器。对个人开发者和小团队,这种「一杆子捅到底」的体感反而比跨端更轻。

**原生不是「老」,而是「迭代得最激进」。** 不要被 Objective-C 那张老脸骗到。Swift 6.0 在 2024 年随 Xcode 16 落地,strict concurrency 默认开启,数据竞争从「运行时偶发崩」变成「编译期就报错」;Observation 框架用宏重写了 MVVM 的根基;SwiftData 把 Core Data 三十年的样板压成几行 `@Model`;App Intents 把 Siri / Shortcuts / Widget / Spotlight 统一进同一套协议。这不是「老平台修修补补」,这是「Apple 把过去十年所有错路一次重走」。

**原生也不是「成本更高」**——前提是把项目周期拉长看。跨端的成本结构是「学习曲线低 + 长期维护高」:每次 iOS 大版本更新都有一波 plugin 需要等社区修,某些场景必须自己写 Native 桥再回到跨端,团队里实际还是得有原生工程师兜底。原生的成本结构相反:「学习曲线高 + 长期维护低」,Apple 每年的弃用与替代都有完整迁移指南,代码贬值的速度远低于跨端胶水层。对一个准备做 3 年以上的产品,原生在 18 个月之后开始反超。

**最后,原生也不是「孤岛」**。同一份 Swift 6 + SwiftUI 代码,在 iPhone、iPad、Mac(via Catalyst 或 native)、Apple Watch、Apple TV、Vision Pro 上可以高度复用——`Scene`、`WindowGroup`、`NavigationStack` 这套抽象就是为了多 form factor。「原生只覆盖一台 iPhone」是 2015 年的误解,2026 年的原生覆盖的是 Apple 整个生态闭环。本系列主线 iPhone,但第 30 篇会延伸到 macOS / iPadOS / visionOS / watchOS,看一份代码怎么跨平台。

> 一句心智:**原生 iOS 是「全部能力 + 单一工具链」,跨端是「最大公约数 + 多套工具链」。** 选谁取决于你做什么,但本系列默认你要做的就是「这台手机能做的全部事情」。

---

## 二、Apple 平台心智

要在脑子里建坐标系,先把 Apple SDK 的层次摆出来。下面这张分层不是 Apple 官方图(官方图历年都在变),而是一套**工程上够用的简化抽象**:

```
                  ┌────────────────────────────┐
   App 层          │ 你的 SwiftUI App / Scene   │
                  └─────────────┬──────────────┘
                                │ App 协议入口
                  ┌─────────────┴──────────────┐
   UI 框架        │ SwiftUI / UIKit / AppKit   │
                  └─────────────┬──────────────┘
                                │
                  ┌─────────────┴──────────────┐
   平台框架       │ SwiftData / WidgetKit /    │
                  │ ActivityKit / StoreKit 2 / │
                  │ App Intents / UserNotifi.. │
                  └─────────────┬──────────────┘
                                │
                  ┌─────────────┴──────────────┐
   能力框架       │ Foundation / Combine /     │
                  │ Observation / Network /    │
                  │ AVFoundation / Core ML /   │
                  │ Vision / CryptoKit / ...   │
                  └─────────────┬──────────────┘
                                │
                  ┌─────────────┴──────────────┐
   底层 + OS      │ Darwin / libdispatch /     │
                  │ Metal / Core Graphics /    │
                  │ kernel                     │
                  └────────────────────────────┘
```

几个观察:

1. **SwiftUI 不是 UIKit 的替代品,而是它的「声明式投影」**。SwiftUI 内部仍然会在某些场景(比如复杂滚动、相机、文本输入)桥接到 UIKit;反过来 UIKit 项目也能用 `UIHostingController` 承载 SwiftUI 视图。本系列主线是 SwiftUI,但第 17 篇会专门讲互操作。
2. **「平台框架」是 iOS 的真正护城河**。WidgetKit、ActivityKit、StoreKit 2、App Intents、UserNotifications,这些是跨端永远抄不齐的部分。
3. **Foundation 与 Combine、Observation 同层但分工不同**。Combine 在 2019 年作为 Apple 官方响应式框架推出,五年后 Observation 框架(`@Observable` 宏)在 SwiftUI 状态层把它替换大半;Combine 现在的工程位置降到「桥接 Notification、Timer、URLSession 老 API」的胶水层,不再是 MVVM 主轴。第 07、15 篇会讲清楚边界。
4. **Swift Concurrency(`async/await` / `actor` / `Sendable`)横穿所有层**。它不是某一个 framework,而是语言级特性 + 标准库 + 编译器隔离检查一起组成的体系。第 04、05 篇是它的主篇。
5. **这五层的「向下依赖」是单向的**,但「向上暴露」并不平均。Foundation 全平台共享,SwiftUI 接近全平台共享(watchOS 略缩水),WidgetKit / ActivityKit 主要在 iOS + iPadOS,StoreKit 2 在所有 Apple 平台。第 30 篇讲多平台延伸时,这种「分层 + 平台维度」的二维坐标系会再用一次。

### App 协议入口:从 `AppDelegate` 到 `@main App`

iOS 13 之前,App 的生命周期入口是 `AppDelegate`(`UIApplicationDelegate` 协议);iOS 13 引入 `SceneDelegate` 把窗口职责拆出来;iOS 14 起 SwiftUI 提供了 `App` 协议作为「真正的」入口。到 iOS 18,Swift 6 + SwiftUI 的标准启动姿势是:

```swift
// File: NotesIslandApp.swift
import SwiftUI
import SwiftData

@main
struct NotesIslandApp: App {
    // SwiftData 容器,后续第 14 篇展开
    let container: ModelContainer

    init() {
        do {
            container = try ModelContainer(for: Note.self)
        } catch {
            // 启动期失败按 fatalError 处理,而不是 try? 吞掉
            fatalError("ModelContainer init failed: \(error)")
        }
    }

    var body: some Scene {
        WindowGroup {
            RootView()
        }
        .modelContainer(container)
    }
}
```

注意几件事:

- `@main` 是编译器约定:整个 target 里**有且只能有一个** `@main` 类型;Swift 6 下编译器会强制检查,多于一个直接报错。
- `App` 协议要求实现 `var body: some Scene`,`Scene` 是 iPad 多窗口、Mac Catalyst、visionOS 多 Volume 的统一抽象。在 iPhone 上你通常只有一个 `WindowGroup`,但同样的代码在 iPad 上自动支持多窗并排,在 visionOS 上自动支持多 Volume 并存,这不是「框架兼容」,是「同一份代码在不同 form factor 上展开」。
- 没有 `AppDelegate` 不代表没有生命周期。iOS 18 仍然存在 `UIApplication` 与 push、background fetch、URL scheme 等回调;需要时通过 `@UIApplicationDelegateAdaptor` 把一个轻量 `AppDelegate` 挂上去即可,不必把整个工程退化到旧模板。第 18 篇会展开。
- `body: some Scene` 与 `body: some View` 是同一套 opaque return type 心智在不同协议上的应用;第 03 篇会从类型系统层把这件事讲透。

`Scene` 这层抽象在 iPhone 上常被忽视,但它是 SwiftUI 跨平台能力的关键。一个 `WindowGroup` 在 iPhone 上是「全屏单窗口」,在 iPad 上是「可拖出多个独立窗口的窗口组」,在 macOS 上是「可平铺多个窗口的 Document Group」,在 visionOS 上是「可推到不同空间位置的 Volume」。**你写一份 `WindowGroup { RootView() }`,Apple 在每个 form factor 上自动选择合适的承载形式**——这是 SwiftUI 与 UIKit 的核心差别之一。UIKit 的 `UIWindow` + `UIScene` 是「一个 UIWindow 一个屏」的物理模型;SwiftUI 的 `Scene` 是「一组同源窗口可以被系统按需展开」的逻辑模型。

### 部署目标:iOS 18 vs iOS 19

本系列把**最低部署目标定在 iOS 18**,理由有三:

1. **装机量**。截至 2026 年 5 月,iOS 18 + iOS 19 合计覆盖了 App Store 主流设备约 85% 的占比,iOS 18 是「再降一档就开始丢相当一部分用户」的拐点。
2. **API 现代化的「最后一公里」**。`@Entry` 宏、`@Observable` 字段级追踪 diff、SwiftData CloudKit 自动同步、Interactive Widget(`AppIntent` 直接挂在 Widget 上)、Translation Framework,这些 2024 年随 iOS 18 全面稳定的 API,把上一代「能用但需要兜底」的实践改成「直接就是标准做法」。
3. **iOS 19 的新东西可以「单独标注」上**。Liquid Glass 视觉系统、iOS 19 新增的 Foundation Model on-device 接口、`@available(iOS 19, *)` 圈出来的部分,本系列会在涉及具体 API 时单独标注「iOS 19+」并给出 iOS 18 降级方案;但**主线代码必须在 iOS 18 上编译并运行**,这是一个硬约束。

「最低部署目标」这个选择对工程的影响远超新人想象。每往上提一档:能用的 API 多一批,但失去的装机量也一批;每往下降一档:覆盖的用户多,但代码里 `if #available` 的分支数指数级膨胀。**iOS 18 是 2026-05 时点的「甜点」**——往下降到 iOS 17 几乎不增加用户(iOS 17 用户数已经低于 5%),往上提到 iOS 19 会丢掉相当一部分 iPhone 11 / 12 老机型用户。这种「甜点位置」每年都会随装机量曲线移动,不是 18 永远是甜点;选基线时记得查最新数据(Apple 在 developer.apple.com/support/app-store/ 公布),不要照搬旧教程。

`@available` 与 `if #available` 的区别也常被混淆。`@available(iOS 19, *)` 标注在类型/函数/属性上,表示**这个符号只在 iOS 19 之后存在**;调用方必须用 `if #available(iOS 19, *) { ... }` 包起来。两者必须配套——只标 `@available` 不写 `if #available` 调用方会编译报错;反过来不标 `@available` 直接用 iOS 19 API,iOS 18 设备运行时 crash。**本系列里所有 iOS 19+ 的代码都会带这两件套**,不偷懒。

> 心智口诀:**主线 iOS 18,新 API 单点 iOS 19+**。不要为了追新 API,把整篇代码加上 `if #available(iOS 19, *)` 嵌套——那样的代码维护两年就废了。

### NotesIsland 最终会做出什么

把上面五层、`App` 入口、部署目标放在一起,本系列结束时 NotesIsland 应该长成下面这样——这是一份**反推回去用来组织文章顺序的成品规格**,你读完 30 篇后会发现每一个能力都对应一篇文章。

**核心数据**:笔记由「标题 + 富文本正文 + 多张图片 + 一段录音 + 标签数组 + 创建时间 + 地理位置可选」组成,本地 SwiftData 持久化,通过 CloudKit 跨设备同步。第 14 篇主线。

**UI 主线**:`NavigationStack` 类型化路由,首页是按日期分组的笔记瀑布流,详情页支持编辑模式与查看模式切换,新增页是表单,设置页包含 iCloud 同步状态、订阅信息、隐私选项。第 06 至 13 篇支撑。

**系统能力**:支持 `PhotosPicker` 选图、`AVAudioRecorder` 录音、`UNUserNotificationCenter` 本地提醒、`BGTaskScheduler` 周期清理缓存、`App Intents` 让用户从 Siri / Shortcuts / Spotlight 直接「新建一条笔记」。第 17 至 21 篇。

**平台特色**:首页 Widget 展示最近 3 条笔记,支持 Interactive Widget(直接在桌面打勾标记完成);录音中触发 Live Activity 与 Dynamic Island,实时显示录制时长;StoreKit 2 提供高级版订阅(更多图片、无限录音时长),Sign in with Apple 一键登录。第 22 至 23 篇。

**端侧智能**:Vision Framework 自动识别图片里的文字提取为标签;Core ML 模型对录音做关键词提取;iOS 19+ 用 Apple Intelligence 做笔记摘要(降级方案:云端调用)。第 25 篇。

**质量保障**:Localizable.xcstrings 支持中文 / 英文 / 日文三语;VoiceOver 全程可用,Dynamic Type 适配;Swift Testing 覆盖核心仓储 + UI Testing 覆盖主流程;Instruments + MetricKit 持续测帧率与 Hang Rate。第 24、26、27、29 篇。

**发布通路**:SPM 拆分 Core / Sync / UI 三个模块;TestFlight 内外测;PrivacyManifest 通过审核;最终上架 App Store,并衍生 macOS / iPadOS / visionOS 版本。第 28、30 篇。

下面这张表把上面的能力对回 30 篇的层级,可以打印贴在墙上对着写:

| 阶段 | NotesIsland 长出的能力 | 对应篇 |
| --- | --- | --- |
| 心智 + 骨架 | 项目跑起来,空列表能加减条目 | 01-05 |
| 声明式 UI | 列表、详情、表单、状态闭环 | 06-10 |
| 交互 | 动画、共享元素过渡、手势、深链 | 11-13 |
| 数据闭环 | SwiftData 持久化 + iCloud 同步 + 网络拉取 + Keychain | 14-16 |
| 系统能力 | 拍照 / 录音 / 推送 / 权限 / 后台 / App Intents | 17-21 |
| 平台特色 | Widget / Live Activities / 订阅 / 端侧 AI / 多语言 | 22-25 |
| 发布 | 性能调优 / 模块化 / 测试 / 上架 / 多平台延伸 | 26-30 |

> 把这张表理解透,你就知道为什么 NotesIsland 这个主题被选中——它**正好覆盖了 iOS 平台所有「跨端框架抄不齐」的能力点**:本地持久化 + 云同步、录音 + 录像、Widget + Live Activities、订阅、Siri 集成、Core ML。一个 todo list 或者天气 App 是不够的;一个聊天 App 又太聚焦于 IM 协议;NotesIsland 这种「内容创建 + 多媒体 + 端云协同」的形态,刚好是 iOS 平台原生能力的最大公约数。

---

## 三、工程实现:NotesIsland 的最小启动骨架

本系列贯穿项目叫 `NotesIsland`——「一款本地优先 + iCloud 同步 + 可推送 + 能录入图片与音频笔记的个人记录类 App」。本篇只搭出最小骨架:`@main App` 入口、一个空的 `RootView`、一个占位的 `Note` 模型,后续每篇在这棵骨架上长枝叶。

下面是 7 个文件、共 90 余行 Swift 6 严格并发代码。可以直接复制到一个 Xcode 16 新建项目里(Swift Language Mode 设为 6,Strict Concurrency Checking 设为 Complete),编译能过。

```swift
// MARK: - File: App/NotesIslandApp.swift
import SwiftUI
import SwiftData

@main
struct NotesIslandApp: App {
    // 整个 App 只持有一个 ModelContainer
    @State private var container: ModelContainer = {
        do {
            let schema = Schema([Note.self])
            let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: false)
            return try ModelContainer(for: schema, configurations: [config])
        } catch {
            fatalError("ModelContainer init failed: \(error)")
        }
    }()

    var body: some Scene {
        WindowGroup {
            RootView()
        }
        .modelContainer(container)
    }
}
```

```swift
// MARK: - File: App/RootView.swift
import SwiftUI

struct RootView: View {
    var body: some View {
        // 后续会替换为 NavigationStack + 类型化路由(第 13 篇)
        NoteListView()
    }
}
```

```swift
// MARK: - File: Features/Notes/Note.swift
import Foundation
import SwiftData

@Model
final class Note {
    // SwiftData 自动生成 PersistentIdentifier
    var title: String
    var body: String
    var createdAt: Date

    init(title: String, body: String = "", createdAt: Date = .now) {
        self.title = title
        self.body = body
        self.createdAt = createdAt
    }
}
```

```swift
// MARK: - File: Features/Notes/NoteListView.swift
import SwiftUI
import SwiftData

struct NoteListView: View {
    // @Query 是 SwiftData 在 SwiftUI 视图里订阅数据的标准做法
    @Query(sort: \Note.createdAt, order: .reverse)
    private var notes: [Note]

    @Environment(\.modelContext) private var context

    var body: some View {
        List {
            ForEach(notes) { note in
                VStack(alignment: .leading) {
                    Text(note.title).font(.headline)
                    Text(note.body).font(.subheadline).foregroundStyle(.secondary)
                }
            }
            .onDelete { offsets in
                for index in offsets {
                    context.delete(notes[index])
                }
            }
        }
        .overlay {
            if notes.isEmpty {
                ContentUnavailableView(
                    "还没有笔记",
                    systemImage: "note.text",
                    description: Text("点右上角加一条")
                )
            }
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    let note = Note(title: "未命名笔记 \(Date.now.formatted(date: .omitted, time: .shortened))")
                    context.insert(note)
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .navigationTitle("NotesIsland")
    }
}
```

```swift
// MARK: - File: App/Previews.swift
#if DEBUG
import SwiftUI
import SwiftData

#Preview("空列表") {
    NoteListView()
        .modelContainer(for: Note.self, inMemory: true)
}

#Preview("含数据") {
    let container = try! ModelContainer(
        for: Note.self,
        configurations: ModelConfiguration(isStoredInMemoryOnly: true)
    )
    let ctx = container.mainContext
    ctx.insert(Note(title: "iOS 18 的 @Entry 宏"))
    ctx.insert(Note(title: "iCloud 同步要打开 CloudKit capability"))
    return NoteListView()
        .modelContainer(container)
}
#endif
```

这 90 行里值得圈出来的心智:

1. **`@main` 不和 `AppDelegate` 共存**。如果将来要接 push、URL scheme,我们会用 `@UIApplicationDelegateAdaptor` 挂一个最小 `AppDelegate`,但**入口仍然是 `NotesIslandApp`**,不是 `AppDelegate`。
2. **`ModelContainer` 全局唯一**,在 `App` 里建一次,通过 `.modelContainer(_:)` modifier 注入整棵视图树,子视图用 `@Environment(\.modelContext)` 拿到 `ModelContext`。这是 iOS 17+ SwiftData 的标准姿势,**不要**在每个视图里 new 一个 container。
3. **`@Query` 替代你想象中的「ViewModel + repository + fetch」**。在 SwiftUI 视图里直接订阅持久化集合;数据变动时,SwiftUI 用 Observation 框架做字段级 diff,只有真正受影响的 row 重渲染。第 07 / 14 / 26 篇会展开。
4. **`ContentUnavailableView`(iOS 17+)是「空态」的官方组件**,不要再自己手撸「居中一张图 + 一行字」的占位。
5. **`#Preview` 宏(Xcode 15+)替代了旧 `PreviewProvider` 协议**,可以在一个文件里写多个命名预览,且 preview 里用 `inMemory: true` 的容器就不会污染真机数据。
6. **`final class Note` 与 `struct NoteDraft` 的分工**:持久化对象必须 class(有身份),临时草稿状态用 struct(值语义,Sendable 自动推导)。这条心智第 03 篇会展开,这里先埋个伏笔。
7. **`fatalError` 而不是 `try?` 吞掉**:启动期的容器创建若失败,App 无法运行,直接崩比静默吞错好——`try?` 在这种关键路径上是反模式。这与 Java / Kotlin 习惯的「先 catch 再说」是相反的工程哲学;Swift 推崇「失败要么可恢复要么立即崩」,不留半死不活的状态。

---

## 四、调参与验收

本篇没有运行期可调的「参数」,但有几条工程取舍要在动手前定下来——这些选择会影响后续 29 篇能不能直接复用同一个工程。

### 工程级开关

打开 Xcode 16,新建项目时选 `App` 模板,**不要勾** `Use Storyboards`、**不要勾** `Include Tests`(测试在第 29 篇统一加,避免 boilerplate 太早),Interface 选 `SwiftUI`,Storage 暂时选 `None`(本系列用 SwiftData 但不通过模板生成)。然后在 Target → Build Settings 里:

| 项 | 取值 | 原因 |
| --- | --- | --- |
| iOS Deployment Target | `18.0` | 主线基线 |
| Swift Language Version | `Swift 6` | 严格并发默认开启 |
| Strict Concurrency Checking | `Complete` | 编译期消灭数据竞争 |
| Build Libraries for Distribution | `No`(应用工程默认即此) | 仅在做 SPM 二进制分发时改 |
| Other Swift Flags | 空 | 不要随手加 `-suppress-warnings` |

### 手动验收清单

把上面 7 个文件粘到工程里之后,按下 `⌘R`,在模拟器上完成下面 6 步,缺一项都说明骨架没立住:

1. App 启动后**不闪退**,屏幕上看到 `NotesIsland` 标题与「还没有笔记」空态视图。
2. 点右上角 `+`,生成一条「未命名笔记 + 当前时间」的记录,空态视图立即消失,列表出现一行。
3. 连续点 5 次 `+`,列表按时间倒序排列,**最新一条在最上**(验证 `@Query(sort:order:)`)。
4. 左滑任意一行,出现删除按钮,点击后该行消失(验证 `onDelete` + `context.delete`)。
5. 关闭 App 进程(模拟器 → Device → Restart),重开,**之前的笔记仍在**(验证 SwiftData 已经落盘,不是 in-memory)。
6. 打开 Xcode 左下角的 Canvas,展开 `#Preview("含数据")`,看到预编排的两条假数据,且**修改预览不会影响真机数据**(验证 `inMemory: true`)。

### 真机 vs 模拟器差异

本篇还不会出现真机才有的问题(推送、相机、Keychain 沙盒、CloudKit 都没接),但提前知道:**模拟器跑得通的 SwiftData,在真机 + iCloud 同步开启后,首次同步可能要几秒到几十秒**;`@Query` 自动订阅,无需手动 reload,但**第一次空白窗口**是正常的——这部分坑在第 14 篇展开。

---

## 五、踩坑:别把 Swift 5 / iOS 16 的旧心智搬进来

互联网上 2020 至 2022 年的 SwiftUI 教程,有相当一部分在 2026 年已经是**反模式**。下面这些是本篇阶段就要避开的:

### 1. 别再写 `class ViewModel: ObservableObject` + `@Published`

```swift
// 旧:Swift 5 / iOS 16 的标准 MVVM(2026 年禁用)
final class NoteListViewModel: ObservableObject {
    @Published var notes: [Note] = []
    func load() { /* ... */ }
}
```

这套写法在 iOS 17 之后被 `@Observable` 宏 + Observation 框架完全替代。`@Published` 只能做「对象级 diff」(整个对象变就整片视图刷新),而 `@Observable` 是「字段级 diff」(只有真正被读到的字段变,才触发依赖它的视图重算)。第 07 篇会展开;**本篇阶段你只要记住:看到老教程用 `@Published` 写 MVVM,默认它过时**。

更进一步的反模式是「ViewModel-per-View」狂热——给每个视图都配一个 ViewModel,把 SwiftUI 写成隐藏的 UIKit。Apple 自己的 Sample Code 在 2024 年之后基本都没有显式的 ViewModel 类,而是「`@Observable` Store 注入 + 视图直接调用」。这不是「Apple 放弃 MVVM」,是 SwiftUI 的视图本身就已经承担了 V + VM 的合并角色,再硬塞一个 ViewModel 是 React → Redux 时代的旧体感投影,在 SwiftUI 下徒增样板。

### 2. 别再写 `NavigationView`

```swift
// 旧
NavigationView { NoteListView() }
// 新(本系列默认)
NavigationStack { NoteListView() }
```

`NavigationView` 在 iOS 16 已被弃用,iOS 18 仍能编译但行为不一致,iPad / Mac Catalyst 下分屏行为更是混乱。统一用 `NavigationStack`(详见第 13 篇),iPad 双栏布局用 `NavigationSplitView`。

### 3. 别用 `DispatchQueue.main.async` 切回主线程

```swift
// 旧
URLSession.shared.dataTask(with: url) { data, _, _ in
    DispatchQueue.main.async {
        self.notes = parse(data)
    }
}.resume()

// 新(本系列默认)
@MainActor
func reload() async throws {
    let (data, _) = try await URLSession.shared.data(from: url)
    self.notes = try JSONDecoder().decode([Note].self, from: data)
}
```

GCD 教学被 Swift Concurrency 完全取代。本系列**不**讲 `DispatchQueue.async` / `DispatchSemaphore` / `DispatchGroup` 的用法(只在第 04 篇作为对比心智简提)。

### 4. 别为了拿到 `AppDelegate` 而退回旧模板

很多旧教程写「想接推送/URL scheme/三方 SDK 初始化,就只能用 `AppDelegate` 入口」。这在 2026 年是错的:

```swift
// 推荐做法
@main
struct NotesIslandApp: App {
    @UIApplicationDelegateAdaptor private var appDelegate: AppDelegate
    var body: some Scene { WindowGroup { RootView() } }
}

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_: UIApplication,
                     didFinishLaunchingWithOptions _: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // 三方 SDK 初始化 / push 注册放这里
        return true
    }
}
```

`@UIApplicationDelegateAdaptor` 是 SwiftUI 提供的「保留生命周期回调,但入口仍然是 `App`」的标准桥。第 18 篇会展开 push 链路。

### 5. 别用 `@unchecked Sendable` 「绕过」并发警告

Swift 6 严格并发开启后,新人最常见的反应是被一堆 `Type 'X' does not conform to the 'Sendable' protocol` 警告淹没,然后把所有类型都标 `@unchecked Sendable` 让它们「编译过去」。这是本系列的**红线**——`@unchecked Sendable` 本质是你向编译器签字「我保证这玩意儿线程安全,出问题我背锅」,绕过的不是警告,是编译器的安全网。第 05 篇会用一整篇讲怎么用 `actor` / `nonisolated` / `MainActor` 正面解决,**不**用 `@unchecked` 蒙混。

### 6. 别假设 `Preview` 等于真机环境

`#Preview` 内的代码运行在 Xcode 进程里,环境与真机/模拟器都有差异:不会触发某些系统弹窗、`UIApplication.shared` 行为受限、推送 token 拿不到、CloudKit 同步不会真发生。Preview 用来「快速看视图长什么样」,**不要**用来验证业务正确性——验收始终在模拟器或真机上跑。

### 7. 别一上来就装一堆三方依赖

2020 年 SwiftUI 还不完整时,大家习惯装 Kingfisher 加载图片、装 SwiftyJSON 解 JSON、装 Alamofire 发请求、装 SnapKit 写布局。到 2026 年:`AsyncImage` 原生加载、`Codable` + `JSONDecoder` 原生 JSON、`URLSession` async 原生请求、SwiftUI 原生布局——本系列**全程零三方依赖,只在第 28 篇讲 SPM 时按需引入**。空工程更容易长寿。

### 8. 别假设 `iOS 18` 已经是「所有用户的设备」

主线选 iOS 18 不等于忽略低版本对你的影响。`@available(iOS 18, *)` / `if #available(iOS 18, *)` 这套语法在本系列里几乎用不到(我们 deployment target 就是 18,默认全可用),但**接触 iOS 19+ 新 API 时一定要写**。错误示范:

```swift
// 错:iOS 18 的工程里直接用了 iOS 19+ API
import FoundationModels  // iOS 19+
let model = SystemLanguageModel.default
```

iOS 18 设备上这段代码运行时会直接 crash(framework 加载失败)。正确做法:

```swift
if #available(iOS 19, *) {
    // 用 iOS 19+ API,如端侧 Foundation Model
} else {
    // 降级方案:云端调用 / 本地 Core ML 模型
}
```

本系列每次引入 iOS 19+ API 都会显式标注,且必给降级方案。**任何只在 iOS 19+ 工作的代码,如果没有降级路径,就是工程债**。

### 9. 别迷信「Xcode 模板」是金科玉律

每年 WWDC 之后 Xcode 模板都会变,但**新模板不代表 Apple 推荐做法**——它只是「Apple 觉得对 99% 的新人最不容易出错的起点」。比如 Xcode 16 模板默认勾「Use Core Data」会生成一套老的 Persistence.swift,而 2026 年的推荐做法早就是 SwiftData 了。模板只是模板,真正的「最佳实践」要看每年 WWDC 的 Apple Sample Code 与 Human Interface Guidelines,而不是 Xcode 新建项目时勾的那几个框。

### 10. 别把「会写代码」和「会上架」混为一谈

很多人写完 App 才发现「上架」是另外一门学问:Apple Developer Program $99/年、Bundle ID 申请、Distribution Certificate、Provisioning Profile、Capability 与 Entitlements、Privacy Manifest、App Store 审核条款 4.3「Spam」与 5.1.1「数据收集与存储」、App Tracking Transparency 弹窗时机、加密合规声明……这部分占独立开发者总时间的 20%-30%,本系列第 30 篇会专门展开。**心智上提前接受这一点**:写代码只是一半,过审与运营是另一半。

---

## 本篇收尾

读完这一篇,你应该:

- 能解释「为什么 2026 年还要写原生 iOS」,而不仅仅是「因为习惯」;
- 能在脑子里画出 Apple SDK 的五层结构,知道 SwiftUI、Observation、Combine 各自的工程位置;
- 能写出一个 `@main App` 入口,不掉回 `AppDelegate` 模板;
- 知道 iOS 18 是本系列的最低部署目标,iOS 19+ 的新 API 会被单独标注;
- 在 Xcode 16 里把 NotesIsland 的最小骨架跑起来,完成 6 步手动验收;
- 知道哪些 2020 年的旧写法在 2026 年是**反模式**,以后看到不要直接抄。

下一篇 `02 Xcode 16 项目结构、Bundle、Info.plist 与 xcconfig` 会把这副骨架的工程化部分讲深——项目 / workspace / scheme / build configuration / Info.plist 的现代化 generated 模式、xcconfig 分环境配置、Asset Catalog 与 SF Symbols。
