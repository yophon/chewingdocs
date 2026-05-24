# 13 NavigationStack 与类型化路由

> 基线:iOS 18 (最低部署目标) / Swift 6 严格并发 / Xcode 16 / SwiftUI。涉及 iOS 19+ 的 API 单独标注。

UI 已经搭好,数据闭环还没接,我们卡在中间这一关:**怎么从列表跳到详情,从详情跳到编辑,再被一个 universal link 直接弹到详情第三层?** 这一篇要解决的就是「页面之间怎么走」这个问题。

iOS 16 之前,SwiftUI 的导航是一坨能让人血压升高的东西:`NavigationView` + `NavigationLink(isActive:)` + `NavigationLink(tag:selection:)` 三种心智混着用,深链回不去、状态恢复不了、iPad 上和 iPhone 上行为完全两套。iOS 16 起 Apple 重写了一套:**`NavigationStack` + 类型化路由**。到 iOS 18 这一套已经完全稳定,可以 100% 替换旧 API。这一篇就把这套新心智彻底讲清。

---

## 一、机制定位

### 1.1 为什么 SwiftUI 必须有自己的导航 API

UIKit 的导航是命令式:`navigationController.pushViewController(detail, animated: true)`。这套心智在声明式 UI 里**根本跑不通**——SwiftUI 的 View 是值类型,每次重计算都会重新生成,你没法对一个值类型调用 push。

所以 SwiftUI 的导航必须是**数据驱动**:用一个可变的「路径数组」当 source of truth,UI 只是这个数组的纯函数渲染。你 append 一个值,就「pop 出了一个新页面」;你把数组截短,就「回退了若干层」。这跟 React Router、Flutter 的 Navigator 2.0 是同一套哲学。

### 1.2 旧 API 的三种血压

```swift
// ❌ NavigationView + isActive:第三方代码大量依赖,iOS 16 起 deprecated
NavigationView {
    NavigationLink(destination: DetailView(id: 1), isActive: $isActive) {
        Text("Open")
    }
}
```

旧路径的核心问题有三个:

1. **不能跳跃**:想从 A 直接跳到 C(跳过 B),要么 hack 一个隐藏的 `NavigationLink`,要么手动管理一堆 `isActive` 布尔值。
2. **不能恢复**:杀掉 App 重启后,SwiftUI 不知道你之前在哪一层,只能从根页面重来。
3. **iPad 上语义混乱**:`NavigationView` 在 iPad 上会自动变成 split view,但展开 / 折叠的状态没有稳定 API 控制。

`NavigationStack` 一次性解决这三个问题:**路径是 `[Hashable]` 数组**,你想跳几层就 append 几个,想恢复就把数组序列化进 SceneStorage,iPad 上的多列布局走 `NavigationSplitView`。

### 1.3 类型化路由是什么

「类型化路由」(typed navigation)的核心思想:

> 不再用「目的地是哪个 View」做 key,而是用「目的地承载什么数据」做 key。

旧 API 让你写 `NavigationLink(destination: DetailView(id: id))`——目的地的 View 类型直接出现在调用点,耦合死。新 API 让你写 `NavigationLink(value: noteID)`——只声明「我要跳到 noteID 对应的页面」,具体跳到哪个 View 由 `.navigationDestination(for: UUID.self) { id in ... }` 在栈的某个层级注册。

好处:跳转点和目的地解耦,**同一个 value 类型,可以在不同的 stack 里映射到不同的 View**(iPhone 上是全屏详情,iPad detail column 里是侧栏详情)。这才是「路由」该有的样子。

---

## 二、Apple 平台心智

### 2.1 三个核心 API

| API | framework | 角色 |
| --- | --- | --- |
| `NavigationStack` | SwiftUI | 容器,持有一个 `path` 数组 |
| `NavigationLink(value:)` | SwiftUI | 触发器,append 一个 value 到 path |
| `.navigationDestination(for:)` | SwiftUI | 注册「value 类型 → View」的映射 |
| `NavigationSplitView` | SwiftUI | 多列布局,iPad / Mac / visionOS 主用 |
| `onOpenURL` | SwiftUI (`Scene`) | Deep Link / Universal Link 入口 |

### 2.2 path 的两种形态

`NavigationStack` 的初始化器有两种:

```swift
// 同质栈:path 里所有元素都是同一个类型,可以静态检查
@State private var path: [NoteID] = []
NavigationStack(path: $path) { ... }

// 异质栈:path 里可以混不同类型(订单、设置、用户...),用 type-erased 容器
@State private var path = NavigationPath()
NavigationStack(path: $path) { ... }
```

**`NavigationPath`** 是 Apple 提供的 type-erased 容器,内部保存的是「类型名 + Codable 数据」。它能 append 任意 `Hashable & Codable` 值,代价是你拿不回具体的下标,只能 push / pop。

工程经验:**App 的主流程用 `NavigationPath`**(因为你迟早要混页面类型),小模块或者明确单类型的栈用 `[T]`。两种形态可以同 App 内并存——主流程一个 NavigationPath,某个隔离的子流程(比如登录注册)用同质 `[OnboardingStep]`,各自管理各自的栈。

### 2.3 隔离域

`NavigationStack` 是 SwiftUI View,所有交互都在 `@MainActor` 上。`path` 的 setter 必须在主线程触发。从后台 Task 里跳转,要么用 `@MainActor` 包一下,要么用 `await MainActor.run { path.append(...) }`。

Swift 6 严格并发下,你 push 进 path 的 value 必须是 `Sendable`(因为 SceneStorage 序列化恢复时会跨隔离)。`Hashable` + struct(只含 Sendable 字段)默认就符合 `Sendable`。

### 2.4 与 iPad 的关系

`NavigationStack` 是单列的栈,iPhone 主用。`NavigationSplitView` 是 2-3 列布局,iPad / Mac / visionOS 主用。Apple 推荐的做法是**根据 size class 切换**,但实际上更优雅的做法是:**让 `NavigationSplitView` 在 detail column 里再嵌一个 `NavigationStack`**——iPad 上侧栏选项 + detail 栈,iPhone 上 SwiftUI 会自动折叠成单栈,代码只写一份。

### 2.5 一次性把全栈语义讲清

把整个导航流的语义画出来:

```
用户操作                     path 数组变化              UI 表现
─────────                    ─────────────              ──────────────
点列表行                     [.note(id)]                 push 详情
点详情右上「编辑」            [.note(id), .editor(id)]   再 push 编辑
点系统返回                   [.note(id)]                 pop 编辑
左滑返回                     []                          pop 详情
点首页同 Tab                 NavigationPath()            清空回根
deep link                    新数组                      整栈 diff 重新渲染
```

关键心智:**path 的任何变化都是「整栈 diff」**。SwiftUI 比较新旧 path,推断该 push 几层、pop 几层,然后批量执行动画。这是它能用一个 `@State` 数组替代 UIKit 一堆 `pushViewController / popToRootViewController` 命令式调用的根本。

---

## 三、工程实现

下面给 NotesIsland 的导航骨架:列表 → 详情 → 编辑三层,支持 iPad split view,支持 deep link `notesisland://note/<uuid>`。

```swift
// File: Features/Routing/Route.swift

import Foundation

// MARK: - 类型化路由值
/// App 里所有可被 push 的目的地,Hashable + Codable + Sendable
/// 用 enum 收口避免 NavigationPath 里塞各种字符串导致字符串拼错
enum Route: Hashable, Codable, Sendable {
    case note(id: UUID)
    case editor(id: UUID)
    case tag(name: String)
    case settings
}
```

```swift
// File: Features/Routing/AppRouter.swift

import SwiftUI

// MARK: - 全局路由器,持有 path
/// 用 @Observable 让任意 View 能通过 @Environment 取到 router 并 push
/// 注意:NavigationPath 本身是值类型,这里包成引用类型方便跨视图共享
@Observable
@MainActor
final class AppRouter {
    var path = NavigationPath()

    func push(_ route: Route) {
        path.append(route)
    }

    func popToRoot() {
        path = NavigationPath()
    }

    func pop(_ count: Int = 1) {
        let target = max(0, path.count - count)
        while path.count > target { path.removeLast() }
    }
}
```

```swift
// File: Features/Routing/RootView.swift

import SwiftUI

// MARK: - 根视图,适配 iPhone / iPad
struct RootView: View {
    @State private var router = AppRouter()
    @State private var selectedTag: String? = nil

    var body: some View {
        NavigationSplitView {
            // 侧栏:tag 列表(iPad 左列,iPhone 折叠到栈顶)
            TagSidebarView(selection: $selectedTag)
        } detail: {
            // 主区:每个 detail column 里再嵌一个 NavigationStack
            NavigationStack(path: $router.path) {
                NoteListView(tagFilter: selectedTag)
                    .navigationDestination(for: Route.self) { route in
                        destination(for: route)
                    }
            }
        }
        .environment(router)
        // MARK: - Deep Link
        .onOpenURL { url in
            handleDeepLink(url)
        }
    }

    // MARK: - 路由解析(集中在一处,方便 Universal Link 复用)
    @ViewBuilder
    private func destination(for route: Route) -> some View {
        switch route {
        case .note(let id):       NoteDetailView(noteID: id)
        case .editor(let id):     NoteEditorView(noteID: id)
        case .tag(let name):      NoteListView(tagFilter: name)
        case .settings:           SettingsView()
        }
    }

    private func handleDeepLink(_ url: URL) {
        // notesisland://note/<uuid>
        guard url.scheme == "notesisland" else { return }
        let parts = url.pathComponents.filter { $0 != "/" }
        switch url.host {
        case "note":
            if let raw = parts.first, let id = UUID(uuidString: raw) {
                router.popToRoot()
                router.push(.note(id: id))
            }
        case "settings":
            router.popToRoot()
            router.push(.settings)
        default:
            break
        }
    }
}
```

```swift
// File: Features/Notes/NoteListView.swift

import SwiftUI

// MARK: - 列表页:用 NavigationLink(value:) 触发跳转
struct NoteListView: View {
    let tagFilter: String?
    @Environment(AppRouter.self) private var router
    // 实际项目这里走 @Query,这里先用 mock 列表
    private let notes: [NoteSummary] = NoteSummary.samples

    var body: some View {
        List(notes) { note in
            NavigationLink(value: Route.note(id: note.id)) {
                NoteRow(summary: note)
            }
        }
        .navigationTitle(tagFilter ?? "全部笔记")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("新建") {
                    let newID = UUID()
                    router.push(.editor(id: newID))
                }
            }
        }
    }
}
```

```swift
// File: Features/Notes/NoteDetailView.swift

import SwiftUI

// MARK: - 详情页:可以再 push 到编辑器
struct NoteDetailView: View {
    let noteID: UUID
    @Environment(AppRouter.self) private var router

    var body: some View {
        ScrollView {
            // 内容渲染...
            Text("笔记内容 \(noteID.uuidString.prefix(8))")
        }
        .navigationTitle("详情")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("编辑") {
                    router.push(.editor(id: noteID))
                }
            }
        }
    }
}
```

```swift
// File: Features/App/NotesIslandApp.swift

import SwiftUI

// MARK: - App 入口
@main
struct NotesIslandApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}
```

几个要点:

- `AppRouter` 用 `@Observable` + `@MainActor`,SwiftUI 视图通过 `@Environment(AppRouter.self)` 拿到。**不要把 router 写成全局单例**,会破坏 Preview 与测试。
- `destination(for:)` 用 `@ViewBuilder` 集中所有路由 → View 的映射,新增页面只需要在 `Route` enum 里加 case 并在 switch 补一个分支,编译器会强制你不漏。
- Deep link 走 `.onOpenURL`(挂在根 View 上,SwiftUI 会把 URL 投递给所有 scene)。**记得先 `popToRoot` 再 push**,否则跳进来会叠在用户当前栈顶上,体验古怪。

### 3.1 路由状态可恢复

SceneStorage 自动序列化 `NavigationPath`:

```swift
// File: Features/Routing/RootView.swift (片段)

import SwiftUI

struct RootView: View {
    @SceneStorage("router.path") private var pathData: Data?

    var body: some View {
        // ... 主要内容
            .task {
                // 启动时尝试恢复
                if let data = pathData,
                   let representation = try? JSONDecoder().decode(
                       NavigationPath.CodableRepresentation.self, from: data) {
                    router.path = NavigationPath(representation)
                }
            }
            .onChange(of: router.path) { _, newPath in
                // 任何 push / pop 后持久化
                if let representation = newPath.codable,
                   let data = try? JSONEncoder().encode(representation) {
                    pathData = data
                }
            }
    }
}
```

`NavigationPath.codable` 返回一个 `CodableRepresentation?`,**只要 path 里所有元素都是 `Hashable & Codable`,这个属性就非 nil**。这正是为什么我们要把 `Route` 标成 `Codable`——为了能被 NavigationPath 序列化。

iOS 18 这套 API 已经稳定。iOS 19+ 还能跟 `SceneStorage` 直接对接 `NavigationPath`(传闻中的简化 API),但当前主线 18 部署目标用上面这段就够。

---

## 四、调参与验收

### 4.1 关键参数

| 参数 | 影响 | 推荐值 |
| --- | --- | --- |
| `NavigationStack` 嵌套层数 | 内存与手势冲突 | 单 stack 不超过 5-6 层;再深考虑 sheet |
| `NavigationSplitView` 的 `columnVisibility` | iPad 上侧栏默认展开/折叠 | `.automatic` 让系统判断 |
| `.navigationDestination(for:)` 的注册位置 | **必须在 NavigationStack 内层** | 注册到 stack 的 root view 上 |
| `Route` enum 的 Codable | 影响 SceneStorage 能否恢复 | 永远加上 |

最容易踩错的是「**`.navigationDestination` 必须挂在 NavigationStack 的内容里**」。挂在 stack 外面或者 stack 的兄弟 view 上,SwiftUI 不会报错,但 push 时会 silently 失败,你会看到导航栏没动、链接没响应。

### 4.2 手动验证步骤

启动 App 后逐项检查:

1. **基础 push / pop**:列表点一行进详情,详情右上「编辑」进编辑器。返回时栈正确弹出。
2. **跳跃 push**:列表右上「新建」,直接进入编辑器(跳过详情)。返回应该回到列表,而非详情。
3. **iPad split view**:在 iPad 模拟器横屏运行,侧栏选 tag,主区只刷新主栏,侧栏不动。竖屏自动收起侧栏。
4. **状态恢复**:push 到第二层,按 Home 杀掉 App(模拟器走 device → erase 数据外的 quit),重新启动,栈应该停在第二层。
5. **Deep link**:终端执行 `xcrun simctl openurl booted "notesisland://note/<某个 UUID>"`,应该清空栈并直接跳到详情。
6. **iPhone / iPad 行为一致**:同一份代码 iPhone 上看到的是单栈,iPad 横屏看到的是双列,无需任何条件分支。

### 4.3 Universal Link(简提)

`notesisland://` 是 custom scheme,只能在已装 App 时用。要做真正可被微信 / Safari 识别的「网页点了就开 App」,需要 Universal Link:

1. App 开 Associated Domains capability,加 `applinks:notesisland.example.com`。
2. 域名上托管 `/.well-known/apple-app-site-association`(JSON,声明 path 模式)。
3. iOS 14+ 走同一个 `.onOpenURL`,URL 是 `https://...`,在 `handleDeepLink` 里按 host + path 路由就行。

App Store 审核会看 AASA 文件,**不要忘记把 https 证书配齐**。

---

## 五、踩坑

### 5.1 旧教程的常见误导

| 你会在旧文章看到 | 现在的正确写法 |
| --- | --- |
| `NavigationView { ... }` | `NavigationStack { ... }`(或 `NavigationSplitView`) |
| `NavigationLink(destination:)` | `NavigationLink(value:)` + `.navigationDestination(for:)` |
| `NavigationLink(isActive:)` | 改 `path` 数组,append 即 push |
| `NavigationLink(tag:selection:)` | 同上 |
| 在 sheet 里包 `NavigationView` 看起来好像 work | 改用 `NavigationStack`,sheet 是独立 scene 上下文 |

`NavigationView` 在 iOS 16 已 deprecated,iOS 18 仍能编译但**Xcode 16 会给 warning**,且在 iPad 上行为已经偏离设计本意。新项目直接禁用。

### 5.2 `.navigationDestination` 的位置

```swift
// ❌ 错:挂在 NavigationStack 外面
NavigationStack(path: $path) {
    NoteListView()
}
.navigationDestination(for: Route.self) { ... }  // 不生效

// ❌ 错:挂在和 NavigationLink 平级的兄弟节点上,但栈结构跨过 ScrollView
NavigationStack {
    ScrollView { NavigationLink(...) }
}

// ✅ 对:挂在 stack 的 root view 内部
NavigationStack(path: $path) {
    NoteListView()
        .navigationDestination(for: Route.self) { route in ... }
}
```

实际经验:**注册到 stack root 的第一个 view 的 modifier 上**,最稳。多个 destination 类型可以叠多个 `.navigationDestination(for:)`。

### 5.3 路径里的 value 必须 Hashable

```swift
// ❌ 编译报错:Note 没实现 Hashable
struct Note { var title: String }
NavigationLink(value: someNote) { ... }
```

push 的 value 必须 `Hashable`(NavigationPath 内部要算 hash 来 dedupe / 比较)。**而且尽量传 ID 不传整个对象**——传整个 Note 进去,后台改了 Note 字段,navigation path 里那份是快照,会错位。永远传 `note.id`,目标 View 内部用 `@Query` / `model.fetch` 再去拿最新数据。

### 5.4 Swift 6 严格并发下的 Sendable

```swift
// ❌ Note 含 NSManagedObject(引用类型,跨 actor 不安全)就不能直接 push
enum Route: Hashable {
    case note(Note)  // 编译会要求 Note: Sendable
}

// ✅ 永远 push 值类型 ID
enum Route: Hashable, Codable, Sendable {
    case note(id: UUID)
}
```

Swift 6 会在 `path.append` 时检查 Sendable,把 SwiftData 的 `@Model` 类实例直接 push 进 path 会报错(它们是引用类型,跨 MainActor 与持久化层时不 Sendable)。永远把 ID 作为路由载荷。

### 5.5 `popToRoot` 的写法

很多旧文章告诉你 `path.removeAll()`,但 `NavigationPath` 没有 `removeAll`,只有 `removeLast(_:)`。最干净的写法是:

```swift
router.path = NavigationPath()  // 直接换成空 path
```

替换值类型而非清空,SwiftUI 收到新 path 一次性 diff 出栈。

### 5.6 sheet / fullScreenCover 是独立 stack

```swift
// 在 sheet 里要导航,需要在 sheet 内部再开一个 NavigationStack
.sheet(isPresented: $showEditor) {
    NavigationStack {
        NoteEditorView()
    }
}
```

sheet 不共享外层 stack 的 path。这是设计如此(模态本来就该是独立流程),记牢就行。`fullScreenCover`、`popover` 同理。

### 5.7 `@Environment(AppRouter.self)` 的 Preview 问题

Preview 里如果你写 `NoteDetailView(...)` 但没注入 router,运行时会 crash。Preview 一定要补:

```swift
#Preview {
    NoteDetailView(noteID: UUID())
        .environment(AppRouter())
}
```

把 router 注入 Environment 是 Swift 6 + `@Observable` 的标准做法,不要回退到 `@EnvironmentObject` + `ObservableObject` 的老写法。

### 5.8 NavigationSplitView 的三栏模式

iPad / Mac 上做「邮件 App」式三栏布局,`NavigationSplitView` 提供三参数版本:

```swift
NavigationSplitView {
    SidebarView()                  // 左栏:收件箱列表
} content: {
    MessageListView(folder: folder) // 中栏:邮件列表
} detail: {
    NavigationStack(path: $router.path) {
        MessageDetail(...)         // 右栏:邮件详情
            .navigationDestination(for: Route.self) { ... }
    }
}
```

三栏布局在 iPhone 上会自动折叠成单栈(竖屏)或二栏(横屏 Pro Max),代码完全不需要分支判断。但**只能让最深的 `detail` 栏里放 NavigationStack**——`sidebar` / `content` 栏放 stack 会把 split view 整个语义打乱。

### 5.9 TabView + NavigationStack 的组合

很多 App 是「Tab + 每个 Tab 内有自己的栈」。正确写法:

```swift
TabView {
    Tab("笔记", systemImage: "note.text") {
        NavigationStack(path: $notesPath) {
            NoteListView()
                .navigationDestination(for: Route.self) { destination(for: $0) }
        }
    }
    Tab("设置", systemImage: "gear") {
        NavigationStack(path: $settingsPath) {
            SettingsView()
        }
    }
}
```

每个 Tab 各自一个 NavigationStack,各自维护 path。Tab 切换时栈不会重置,**点同一个 Tab 第二次可以做「pop to root」**——iOS 18 默认提供这个 UX,但你的 path 需要监听 tab selection 二次点击事件手动 reset(`onChange(of: tabSelection)` 配 timestamp 判断)。

### 5.10 与 sheet / fullScreenCover 的协同

模态展示和 NavigationStack 是两套独立的栈语义,有些场景需要它们配合:

| 场景 | 推荐 |
| --- | --- |
| 临时表单(添加 / 编辑) | sheet,内嵌 NavigationStack |
| 全屏体验(相册查看、视频播放) | fullScreenCover |
| 引导 / Onboarding | fullScreenCover |
| 设置类深层级 | NavigationStack push,**不**用 sheet |

sheet 里嵌 NavigationStack 时,记得给 sheet 自己的 `@State path`,不要复用主栈的 router——它们生命周期不同,模态关闭后栈应清空,主栈的 path 不该被影响。

### 5.11 toolbar 与 back button 的自定义

`NavigationStack` 的 toolbar 用 `.toolbar { }` 声明,placement 决定位置:

```swift
.toolbar {
    ToolbarItem(placement: .topBarLeading) { Button("取消") { ... } }
    ToolbarItem(placement: .topBarTrailing) { Button("保存") { ... } }
    ToolbarItem(placement: .principal) { /* 中间标题 */ }
}
```

想隐藏默认的 back button,用 `.navigationBarBackButtonHidden(true)` 配合自己的 leading item。但**别滥用**——iOS 用户习惯左上角返回手势,自定义返回流程的 App 容易被审核员吐槽。

### 5.12 deep link 落地的几种姿势

实际线上 App 的 deep link 三种入口要全部覆盖:

1. **Custom Scheme**:`notesisland://...`,只能装了 App 后打开,主要用于自己 App 内跳转或开发调试。
2. **Universal Link**:`https://notesisland.example.com/...`,Safari / 微信 / 邮件里点击直接开 App;装 App 用浏览器降级。配置 AASA 文件 + Associated Domains capability。
3. **Spotlight 搜索**:`NSUserActivity` 注册 searchable item,Spotlight 命中后回调到 `onContinueUserActivity`。

三者最终都在 SwiftUI 里走 `onOpenURL` 或 `onContinueUserActivity`,**把路由解析逻辑统一抽成一个 `DeepLinkResolver`**,三个入口都调用它,避免分散维护。

```swift
struct DeepLinkResolver {
    static func resolve(_ url: URL) -> Route? {
        // 统一处理 custom scheme 和 https
        let host = url.host
        let parts = url.pathComponents.filter { $0 != "/" }
        switch host {
        case "note", "notesisland.example.com" where parts.first == "note":
            let idStr = host == "note" ? parts.first : parts[safe: 1]
            return idStr.flatMap(UUID.init).map(Route.note)
        default:
            return nil
        }
    }
}
```

AASA 文件示意(放服务器 `/.well-known/apple-app-site-association`,**Content-Type 必须是 `application/json`,不带 `.json` 扩展名**):

```json
{
  "applinks": {
    "details": [{
      "appIDs": ["TEAMID.com.example.NotesIsland"],
      "components": [
        { "/": "/note/*", "comment": "笔记详情页" },
        { "/": "/settings", "comment": "设置页" }
      ]
    }]
  }
}
```

### 5.13 路由动画与过渡

`NavigationStack` 的默认过渡是系统标准 push 动画,无法直接改成 fade / cross-dissolve(不像 UIKit 那样可以塞 `UIViewControllerTransitioningDelegate`)。如果想做共享元素过渡,iOS 18 提供 `matchedTransitionSource(id:in:)` + `.navigationTransition(.zoom(...))`:

```swift
@Namespace var ns

NavigationLink(value: Route.note(id: id)) {
    NoteRow(...)
        .matchedTransitionSource(id: id, in: ns)
}

// 详情页
.navigationTransition(.zoom(sourceID: id, in: ns))
```

iPhone 上从列表行「放大」进详情,iOS 18 系统级 zoom 转场,体验和 App Store / Photos 一致。**这是 iOS 18 才加的 API**,降级到 iOS 17 / 16 直接 fall back 默认 push 即可,这个 modifier 在旧系统会被忽略。

---

写到这里,NotesIsland 的「列表 → 详情 → 编辑」三层导航已经能跑通,iPad 三栏布局可用,深链可达,共享元素转场也有了。下一篇我们就给这套 UI 接上真实数据 —— SwiftData 全景。
