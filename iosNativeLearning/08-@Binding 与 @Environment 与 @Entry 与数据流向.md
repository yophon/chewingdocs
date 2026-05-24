# 08 @Binding / @Environment / @Entry 与数据流向

第 07 篇我们把 `@Observable` 与字段级追踪定下来了。一个 `NoteStore` 写好,放进 `@State` 里,列表视图就能用。但真正的 App 不止一个屏幕,数据流会沿着视图树横向流出去:

- 列表点进详情页,详情页需要**修改**这条笔记,改完列表要立刻看到——这是 **`@Binding`** 的舞台。
- App 里有"主题色"、"当前用户"、"是否启用 Markdown 渲染"这种横切关注点,不想从根视图一层一层 prop drilling 传到 30 层深的子视图——这是 **`@Environment`** 的舞台。
- 想在 `@Environment` 里塞自定义键(比如自己的 `currentNoteSyncing` 服务),iOS 17 之前要写 30 行 boilerplate;iOS 18 给了一个新宏 **`@Entry`**,一行搞定。

这一篇就把这三件武器讲清楚:它们是 SwiftUI 的"血管系统",决定数据从哪里来、到哪里去、谁能改、改了之后谁会被叫醒。

把这三件事想象成 App 数据流的三种"血管":`@Binding` 是毛细血管的双向通道,接子视图和父视图之间的直接体液交换;`@Environment` 是主动脉,从根部供血,沿途任何器官都能就近取血;`@Entry` 不是血管本身,而是"让你给主动脉加一条新通道"的简化语法。理解这个比喻你就明白为什么 SwiftUI 把它们设计成不同的属性包装器——它们针对的是不同物理位置、不同方向、不同生命周期的数据传输,**不是可互相替代的同义词**。

---

## 一、机制定位:三种数据流向

SwiftUI 的数据流可以分成三个方向,各自对应一个声明:

| 方向 | 声明 | 谁拥有 | 谁能改 | 适用场景 |
| --- | --- | --- | --- | --- |
| 自上而下 单向 | `let` 普通属性 | 父视图 | 父视图 | 静态展示,渲染数据 |
| 双向(子改父) | `@Binding` | 父视图 | 子也能写 | 表单 / 编辑控件 |
| 横切(任意层) | `@Environment` | 视图树 | 注入者 | 主题、Locale、依赖注入 |

`@Observable` 解决的是"**一个引用类型在多个视图间共享**",`@Binding` 解决的是"**一个值类型的字段需要被子视图修改**",`@Environment` 解决的是"**某个值需要跨越视图层级,不想沿路传**"。

这三件武器互不重叠,组合起来覆盖 SwiftUI 几乎所有数据流向。一个常见的工程模式:**根部用 `@Environment` 注入业务对象,中间层用 prop 传具体字段,叶子层用 `@Binding` 反向写回**。这套模式与 React 的"Context 注入 store + prop 传 data + callback 回写"在结构上同构,只是 SwiftUI 把"callback 回写"用 `@Binding` 替换得更干净——没有手写 onChange 闭包,所有写回都是值赋值。

但要注意一个反模式:**不要把 `@Environment(NoteStore.self)` 取出的 store 通过 prop 再传一层**。如果某个深层视图需要 store,直接在那里写 `@Environment(NoteStore.self)` 取,不要从父视图经过参数转手——这会让 environment 提供的"任意深度可读"优势消失,反而引入了显式依赖。Apple 在 SwiftUI 文档里反复强调这一点:`@Environment` 的真正价值不是"少写一次 init 参数",而是"中间任意 N 层视图都不知道这个依赖的存在"。

### 1. prop drilling 的代价

如果你在最深层视图里要读某个根状态,而中间有 20 层视图,用普通参数传:

```swift
RootView(theme: theme) →
  PageView(theme: theme) →
    SectionView(theme: theme) →
      RowView(theme: theme) →
        BadgeView(theme: theme)
```

每一层都要在初始化器里写 `theme`、要在自己的字段上挂一份、要在 body 里转发。**任何中间层多加一个状态,都要修改 20 个文件**。SwiftUI 给 `@Environment` 就是为了取消这种链条。

prop drilling 在 React / Vue 里也是同样问题,React 的解决方案是 `Context API`,Vue 的解决方案是 `provide / inject`。SwiftUI 的 `@Environment` 在心智上接近 React Context,但有两点关键差异:**一是它走的是值的"环境快照"语义,而不是引用订阅**;二是它的注入点必须在视图树上,不能像 Redux Provider 那样在树外注入。后者意味着你做单元测试时,环境注入必须模拟视图树的层级结构,这反过来鼓励你把依赖注入到 UI 层而不是底层 service——这种设计倾向与 React 的"Context 不是 DI 容器"是对齐的。

但 `@Environment` 不是银弹:它把数据传递变成"沉默的耦合",写一行 `@Environment(\.theme) var theme` 看不到来源,新人接手会问"theme 从哪儿来"。所以 SwiftUI 的设计原则是:**只对"横切关注点"用 environment;特定业务字段沿路传**。一个简单的判别标准:如果同一份数据要在 70% 以上的视图里被读到,放 environment;否则用 prop。前者的代表是主题、Locale、当前用户;后者的代表是某个具体笔记、某个表单的草稿。

### 2. `@Binding` 的本质

`@Binding<T>` 不是一份数据的拷贝,而是一对 `get / set` 函数的包装器。它的实现可以理解成:

```swift
@propertyWrapper
struct Binding<Value> {
    let get: () -> Value
    let set: (Value) -> Void
    var wrappedValue: Value {
        get { get() }
        nonmutating set { set(newValue) }
    }
}
```

`TextField("...", text: $note.title)` 不传 `note.title` 的字符串副本,而是传一个能读写 `note.title` 的引用。所以你在子视图里改 `$note.title.wrappedValue = "新标题"`,父视图的 `note` 也跟着变。

更精确地说,`Binding` 是 SwiftUI 给 Swift 值类型补的"可变引用"——Swift 本身没有 `&` 这样的内建可变引用语法在结构体字段上长存,而 `Binding` 通过两个闭包绕开了这个限制。这也是为什么 `Binding` 自带 `nonmutating set`:它本身是值类型(`struct`),但它持有的 setter 闭包能反向写到源头。理解了这一点,你会发现 SwiftUI 的双向绑定不是魔法,而是 **函数式 lens 模式的语法糖**。

对 lens 不熟悉的话,可以这么类比:`Binding<Note>` 就是一个"指向 Note 字段的可读可写镜片",`Binding<Note>` 经过 `\.title` keyPath 可以再聚焦成 `Binding<String>`。SwiftUI 的 `$note.title` 实际上做的就是 `note.$note.title`,即把 `Binding<Note>` 通过 `dynamicMemberLookup` 转成 `Binding<String>`。这种自动聚焦让你不需要手写中间步骤,但同时也意味着你在子视图改一个字段时,**通知的颗粒度仍然在 `Note` 这个值类型本身**——视图被叫醒是因为它持有的 `Note` 的快照变了,不是因为某个字段被字段级追踪。这与 `@Observable` 引用类型的字段级追踪在心智上是两套系统,千万不要混用。

### 3. `@Entry` 之前 vs `@Entry` 之后

iOS 17 之前要往 `EnvironmentValues` 里塞一个自定义键,需要这么写:

```swift
// 旧 iOS 16 / 17 写法,本系列禁用,这里只为对照
private struct CurrentSyncEngineKey: EnvironmentKey {
    static let defaultValue: any NoteSyncing = PreviewSyncEngine()
}

extension EnvironmentValues {
    var currentSyncEngine: any NoteSyncing {
        get { self[CurrentSyncEngineKey.self] }
        set { self[CurrentSyncEngineKey.self] = newValue }
    }
}
```

四行声明、一行变量。一个 App 有十几个自定义 environment 键时,这部分代码会膨胀到一个独立文件。

iOS 18 引入 `@Entry` 宏:

```swift
extension EnvironmentValues {
    @Entry var currentSyncEngine: any NoteSyncing = PreviewSyncEngine()
}
```

一行,自动生成 `EnvironmentKey`,自动绑定 `defaultValue`,自动注册 getter/setter。这是 Swift macro 第一次在 SwiftUI 公开 API 里真正减少 boilerplate。

`@Entry` 出现之前,自定义环境键的代码有 80% 是机械重复——程序员只在乎默认值和字段名,但被迫每次手写键类型 + key path + getter/setter。Apple 在 WWDC 24 给出 `@Entry` 的同时,把整个 SwiftUI 内部的 environment key 声明也全部迁移成 `@Entry` 写法,自身代码减少了上千行。这是 Swift Macro 自 2023 年发布以来,**在 Apple 一方框架里规模化使用的第一个案例**——它意味着接下来 SwiftUI / SwiftData / 其他 Apple framework 会越来越多地引入"减 boilerplate 宏",我们这些应用开发者要做好"看到 `@SomethingMagical` 就去 Xcode 右键 Expand Macro 看一眼"的习惯。

`@Entry` 不止用于 `EnvironmentValues`。iOS 18 它还能挂在 `Transaction`、`FocusedValues`、`ContainerValues` 上,后者是 SwiftUI 新的"自定义 Container"机制(让你的视图能像 `List` 那样接收 `ForEach` 的子元素)。这一系列扩展让"在 SwiftUI 视图树上传一个自定义值"从四种不同的样板写法收敛成一个 `@Entry` 关键字。

---

## 二、Apple 平台心智

### 1. 核心类型与所属 framework

| 入口 | 所属 framework | 角色 |
| --- | --- | --- |
| `@Binding` | `SwiftUI` | 子视图借用父视图的可写字段 |
| `Binding<Value>` | `SwiftUI` | get/set 函数对的包装 |
| `$value` 投影 | `SwiftUI` | 从 `@State` / `@Bindable` 取出 `Binding` |
| `@Environment(_:)` | `SwiftUI` | 在视图树里读取注入的值 |
| `EnvironmentValues` | `SwiftUI` | environment 的总命名空间 |
| `.environment(_:_:)` modifier | `SwiftUI` | 把值注入到子树 |
| `EnvironmentKey` | `SwiftUI` | 自定义环境键协议(iOS 17 及之前必须显式实现) |
| `@Entry` 宏 | `SwiftUI`(iOS 18+) | 一行声明自定义环境键 |

### 2. `@Binding` 的来源谱系

```
Binding<T>
 ├─ 由 @State 投影:$state
 ├─ 由 @Bindable 投影:$bindable.foo
 ├─ 由 @Binding 转发:$childBinding (传给孙视图)
 ├─ Binding(get:set:) 手写(测试 / 桥接 UIKit)
 └─ Binding.constant(value) 只读占位(预览 / 演示)
```

任何 `Binding` 都可以再往下传一层,所以两层、三层深的表单子视图都能改根状态。**这是 SwiftUI 设计的一项优雅之处:Binding 是值,可被传递,不是 React Context 那种隐式订阅。**

### 3. `@Environment` 的两种读法

iOS 17 把 `@Environment` 升级成可以读 `@Observable` 对象本身,不再只能读 keyPath:

```swift
// 读 EnvironmentValues 里的 keyPath
@Environment(\.colorScheme) var colorScheme

// iOS 17+ 直接读 @Observable 实例
@Environment(NoteStore.self) var store: NoteStore?
```

后者由 `.environment(store)` 注入(注意不带 keyPath),取出来是 **可选**——视图树里没有这个对象时不会崩溃。这条路径取代了 iOS 16 的 `@EnvironmentObject`,后者在缺失时会运行时 fatal。

这个 Optional 行为是 Apple 主动选择的"鲁棒性升级"。`@EnvironmentObject` 在缺失时 fatal 的设计被批评多年:Preview 模式下经常因为忘了注入而崩溃,生产环境则会被某些 SwiftUI 重建时机意外触发。新版的 Optional 返回让你能在视图层直接给出兜底 UI,**把异常路径变成一等公民**。这条改动看起来小,工程上影响极大——任何 SwiftUI 团队的崩溃率统计里,`EnvironmentObject` 缺失曾经稳坐前五,iOS 17 之后这条几乎消失。

至于何时用 keyPath 何时用 type-self:Apple 的指导是"基础数据用 keyPath,业务对象用 type-self"。`\.colorScheme`、`\.locale`、`\.dismiss` 这些是平台基础,继续用 keyPath;`NoteStore`、`UserSession`、`FeatureFlagService` 这些业务对象,用 type-self。两条路径并存,因为它们对应的"值的提供方式"本来就不同——基础数据由系统自动注入,业务对象需要 App 显式 `.environment(store)`。

### 4. `@Entry` 的展开

`@Entry var currentSyncEngine: any NoteSyncing = PreviewSyncEngine()` 在 SwiftUI 编译期展开成:

```swift
private struct __Key_currentSyncEngine: EnvironmentKey {
    static var defaultValue: any NoteSyncing { PreviewSyncEngine() }
}

var currentSyncEngine: any NoteSyncing {
    get { self[__Key_currentSyncEngine.self] }
    set { self[__Key_currentSyncEngine.self] = newValue }
}
```

iOS 18 还把 `@Entry` 扩展到了 `Transaction`、`FocusedValues`、`ContainerValues`(后者用于自定义 `Container` API),都是同一个心智:**一行声明,宏生成键 + 默认值 + getter/setter**。

宏展开后的代码在 Xcode 16 里可以通过右键"Expand Macro"实时看到——这是评估宏是否安全可用的关键工具。展开后的 `EnvironmentKey` 类型自动加了 `private` 修饰,意味着它不会污染你的命名空间;`defaultValue` 用 computed property 实现而不是 stored property,所以默认值闭包**每次访问都会重新执行**。这一点要小心:如果你给 `@Entry` 配的默认值是一个看起来很轻的工厂函数,但实际上做了网络 / IO,每次任意视图读 environment 都会触发一次。

把默认值约束在"廉价、纯计算、可重复构造"是 `@Entry` 唯一的隐性 contract——`PreviewSyncEngine()`、`User.anonymous`、`Color.accentColor` 都符合;`URLSession.shared.makeSomething()`、`try! KeychainService().fetchToken()` 都不符合,要在 App 启动时显式注入,默认值给一个"安全占位"。

### 5. environment 与 Swift 6 并发

`EnvironmentValues` 在 SwiftUI 主线程语境里使用,Swift 6 严格并发下要求自定义键的值类型 **`Sendable`**。`any NoteSyncing` 要在协议上加 `Sendable` 约束。SwiftData 的 `ModelContainer` 已经是 `Sendable`,所以你常见的注入对象都没问题。

如果你要注入的对象本身是 `@MainActor`(比如 ViewModel),Swift 6 允许把它放进 environment——`@MainActor` 类型在 `MainActor` 隔离下天然安全,SwiftUI 视图读取 environment 也是在 `MainActor` 上发生。这条规则让"主线程单例放 environment"成为一条干净的工程模式,没有任何 actor hop 成本。但反过来,你**不能**把一个 `actor`(比如 `actor TokenStore`)直接塞进 environment——actor 的所有方法都需要 `await`,但 SwiftUI 视图里 environment 取出的值会被同步使用,编译器会要求你包一层 `@MainActor` 代理。常见做法是写一个 `@Observable @MainActor` 的 facade,内部组合一个 actor 做真正的并发安全工作。

至于 `@Entry` 的默认值:Swift 6 要求默认值闭包是 `Sendable`,所以默认值里不能捕获非 `Sendable` 的外部变量。一个简单的判别:如果默认值是 `let constant` 或 `nil` 或一个不带捕获的工厂构造,绝对安全;如果默认值闭包里读了某个外部 mutable 状态,基本会被编译器警告。

---

## 三、工程实现

我们继续 `NotesIsland`,这一篇要落地三件事:

1. 把笔记编辑视图与列表通过 `@Binding` 连起来,改完即时反映到列表。
2. 在 App 根部注入一个全局 `NoteStore`,用 `@Environment(NoteStore.self)` 在任意深度读取。
3. 用 `@Entry` 注入一个自定义 `NoteSyncing` 服务,方便预览与测试切换。

```swift
// File: App/NotesIslandApp.swift
import SwiftUI

@main
struct NotesIslandApp: App {
    // MARK: 根状态:整个 App 共享同一个 store
    @State private var store = NoteStore(syncEngine: CloudKitNoteSyncing())

    var body: some Scene {
        WindowGroup {
            RootContainerView()
                // 注入引用对象:取出时用 @Environment(NoteStore.self)
                .environment(store)
                // 注入自定义键:取出时用 @Environment(\.currentSyncEngine)
                .environment(\.currentSyncEngine, CloudKitNoteSyncing())
        }
    }
}
```

```swift
// File: App/EnvironmentValues+Notes.swift
import SwiftUI

// MARK: - iOS 18 @Entry 一行声明
extension EnvironmentValues {
    // 默认值用 PreviewSyncEngine,预览不需要真 iCloud
    @Entry var currentSyncEngine: any NoteSyncing = PreviewSyncEngine()

    // 还可以塞设计 token,横切关注点
    @Entry var noteAccentColor: Color = .accentColor
    @Entry var prefersMarkdownRendering: Bool = true
}
```

```swift
// File: Features/Root/RootContainerView.swift
import SwiftUI

struct RootContainerView: View {
    var body: some View {
        TabView {
            NoteListContainer()
                .tabItem { Label("笔记", systemImage: "note.text") }

            SettingsView()
                .tabItem { Label("设置", systemImage: "gearshape") }
        }
    }
}
```

```swift
// File: Features/Notes/NoteListContainer.swift
import SwiftUI

struct NoteListContainer: View {
    // MARK: 从环境里读 @Observable 引用对象(iOS 17+ 写法)
    @Environment(NoteStore.self) private var store: NoteStore?

    // MARK: 顺手读自定义键,演示 @Entry 注入的值
    @Environment(\.noteAccentColor) private var accent: Color

    var body: some View {
        if let store {
            NoteListView(store: store)
                .tint(accent)
        } else {
            ContentUnavailableView("未注入 NoteStore", systemImage: "exclamationmark.triangle")
        }
    }
}
```

```swift
// File: Features/Notes/NoteListView.swift
import SwiftUI

struct NoteListView: View {
    // MARK: 这里不是 @State,store 由父视图传入,需要 Binding 时用 @Bindable
    @Bindable var store: NoteStore

    var body: some View {
        NavigationStack {
            List {
                ForEach(store.filteredNotes) { note in
                    NavigationLink(value: note.id) {
                        NoteRow(note: note)
                    }
                }
                .onDelete { indexSet in
                    indexSet.map { store.filteredNotes[$0] }.forEach(store.delete)
                }
            }
            // @Bindable 投影出 Binding<String>
            .searchable(text: $store.searchText)
            .navigationTitle("笔记")
            .navigationDestination(for: UUID.self) { id in
                if let index = store.notes.firstIndex(where: { $0.id == id }) {
                    // 把数组元素的 Binding 传下去,详情页改完列表立即更新
                    NoteEditView(note: $store.notes[index])
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("新建", systemImage: "plus", action: store.addEmptyNote)
                }
            }
        }
    }
}
```

```swift
// File: Features/Notes/NoteEditView.swift
import SwiftUI

struct NoteEditView: View {
    // MARK: 父视图传 Binding<Note> 进来,子里能改
    @Binding var note: Note

    // MARK: 演示横切读取:无需父视图传任何依赖
    @Environment(\.currentSyncEngine) private var sync
    @Environment(\.prefersMarkdownRendering) private var markdown

    @State private var isSavingDraft = false

    var body: some View {
        Form {
            Section("标题") {
                TextField("标题", text: $note.title)
            }
            Section("正文") {
                TextEditor(text: $note.body)
                    .frame(minHeight: 200)
            }
            Section("元信息") {
                LabeledContent("更新时间", value: note.updatedAt.formatted(date: .abbreviated, time: .shortened))
                LabeledContent("Markdown 渲染", value: markdown ? "开" : "关")
            }
            Section {
                Button {
                    Task { await uploadDraft() }
                } label: {
                    if isSavingDraft {
                        ProgressView()
                    } else {
                        Text("立即同步这条笔记")
                    }
                }
            }
        }
        .onChange(of: note) { _, _ in
            note.updatedAt = .now
        }
        .navigationTitle("编辑笔记")
    }

    private func uploadDraft() async {
        isSavingDraft = true
        defer { isSavingDraft = false }
        do {
            try await sync.upload(note)
        } catch {
            print("upload failed: \(error)")
        }
    }
}
```

```swift
// File: Features/Sync/NoteSyncing.swift
import Foundation

// MARK: - 同步抽象:Swift 6 要求 Sendable
protocol NoteSyncing: Sendable {
    func fetchAll() async throws -> [Note]
    func upload(_ note: Note) async throws
}

// MARK: - 预览 / 单测用的实现
struct PreviewSyncEngine: NoteSyncing {
    func fetchAll() async throws -> [Note] { [] }
    func upload(_ note: Note) async throws { }
}

// MARK: - 真实实现(第 14 / 18 篇会展开 CloudKit 与推送)
struct CloudKitNoteSyncing: NoteSyncing {
    func fetchAll() async throws -> [Note] {
        // 第 14 篇 SwiftData + CloudKit 自动同步会替换这里
        []
    }
    func upload(_ note: Note) async throws { }
}
```

预览时切换同步引擎只需一行:

```swift
// File: Features/Notes/NoteEditView+Preview.swift
import SwiftUI

#Preview("默认同步") {
    NoteEditView(note: .constant(Note(title: "Hello", body: "world")))
        .environment(\.currentSyncEngine, PreviewSyncEngine())
}

#Preview("故意失败同步") {
    struct FailingSync: NoteSyncing {
        func fetchAll() async throws -> [Note] { [] }
        func upload(_ note: Note) async throws { throw URLError(.notConnectedToInternet) }
    }
    return NoteEditView(note: .constant(Note(title: "Demo", body: "Test")))
        .environment(\.currentSyncEngine, FailingSync())
}
```

这是 `@Entry` + `@Environment` 组合的最大工程红利:**预览、单测、Debug 菜单切换实现,不改业务代码**。

---

## 四、调参与验收

### 1. 验证 `@Binding` 真的是引用语义

在 `NoteListView` 内打一行:

```swift
let _ = print("list re-eval")
```

再在 `NoteEditView` 改标题。期望日志:

- 改一个字符,`NoteEditView` 重算一次。
- `NoteListView` **不会** 在每次按键时重算,只有 `note.updatedAt` 通过 `onChange` 写回数组时触发列表中那一行的 row 重算。这是 `@Observable` 字段级追踪 + `@Binding` 不通知整对象的合力效果。

这里有一个反直觉的细节:`note` 是 `Note` 值类型,你在编辑视图里改 `note.title`,理论上每个字符都触发一次 `notes` 数组的写入。但因为 SwiftUI 在 `NoteListView` 里只读了 `store.filteredNotes`,而 `filteredNotes` 是基于 `notes` 的计算属性,SwiftUI 会用 `Equatable` 比较新旧 `filteredNotes`——如果某一行的 `Note.title` 真的变了,只有展示这一行的 row 视图会被重算,周围的不动。所以即使从字段级追踪角度 `notes` 变了,从视图级渲染角度看,只有真正显示这条 note 的那一行被重新画。这是 SwiftUI diff 系统与 Observation 协同的最大红利。

如果你想进一步压榨性能,可以给 `NoteRow` 加 `Equatable` 约束并用 `.equatable()` 修饰符——SwiftUI 会跳过未变 row 的 body 重算。这一招在长列表里效果显著,第 26 篇会展开。

### 2. 验证 `@Environment(NoteStore.self)` 缺失时不崩

在 `RootContainerView` 临时去掉 `.environment(store)`:

- iOS 16 时代 `@EnvironmentObject` 在 `body` 里会 **fatal crash**。
- iOS 17+ `@Environment(NoteStore.self)` 返回 `nil`,你能用 `ContentUnavailableView` 兜底——线上鲁棒性显著提升。

### 3. 验证 `@Entry` 一行展开

在 `EnvironmentValues+Notes.swift` 上点宏的 **Expand Macro**(Xcode 16 右键菜单):你会看到 Apple 帮你生成的 `EnvironmentKey` 类型。这是宏可读性的核心检查手段,如果展开内容报红,说明默认值类型不是 `Sendable` 或不可表达 `defaultValue`。

### 4. 验收清单

- [ ] App 根部 `.environment(store)` 注入引用,任意深度可读取。
- [ ] `@Entry` 在 `EnvironmentValues` 扩展上声明自定义键,没有手写 `EnvironmentKey`。
- [ ] `NoteEditView` 改字段,列表立即看到新值,但全屏没有重算。
- [ ] 子视图修改父视图的 `note` 通过 `@Binding`,**没有** `note: Note` 的副本传递。
- [ ] 预览里通过 `.environment(\.currentSyncEngine, ...)` 注入测试桩,**没有**改业务代码。
- [ ] Swift 6 严格并发模式构建零警告(自定义 environment 值类型都是 `Sendable`)。

---

## 五、踩坑

### 坑 1:`@EnvironmentObject` 与 `@Environment(...)` 混用

旧教程里大量使用:

```swift
@EnvironmentObject var store: NoteStore   // 旧,iOS 16 心智
```

iOS 17+ 不再推荐。`@EnvironmentObject` 配的是 `ObservableObject`,与 `@Observable` 不兼容;且缺失时崩溃,不像新写法返回 `Optional`。**整个项目要么全部用 `@Environment(SomeObservable.self)`,要么继续用 `@EnvironmentObject`,不要混。**

### 坑 2:`@Environment(\.dismiss)` 不要写成 `@State`

```swift
@State var dismiss   // 错
@Environment(\.dismiss) var dismiss   // 对
```

`dismiss`、`openURL`、`requestReview`、`scenePhase` 都是 `EnvironmentValues` 提供的内建键,只能用 `@Environment(\.dismiss)` 读取。

### 坑 3:在 `body` 外用 `dismiss()`

```swift
@Environment(\.dismiss) var dismiss

func someMethod() {
    dismiss()   // ⚠️ 看场景:dismiss 是 @MainActor,且 environment 只在 body 路径里有效
}
```

`dismiss` / `openURL` 这类 environment-provided action 在 `body` 重计算外的生命周期里可能拿到的是 noop。**用法是在 `body` 里调用,或在 `.task { @MainActor in dismiss() }` 等明确主线程闭包里**。

### 坑 4:`@Entry` 缺省值要可在编译期表达

```swift
extension EnvironmentValues {
    @Entry var currentUser: User = User.fetchSync()   // ❌ 可能阻塞主线程
}
```

`@Entry` 的 `defaultValue` 是闭包,每次访问都会算。**给一个真便宜的常量**(`User.anonymous`、`nil`、`.constant`),需要重的初始化在 App 启动时注入。

### 坑 5:把 `@Binding` 当数据传递

```swift
// 反例:子视图不会改它,却写了 @Binding
struct BadgeView: View {
    @Binding var count: Int   // 子里只读
}
```

只读传 `let count: Int` 就够,`@Binding` 暗示"子要写"。错用会让代码 review 时误判数据流向。

### 坑 6:`Binding<Element>` 通过 `$array[i]` 拿不到?

```swift
ForEach(store.notes) { note in
    NoteRowEditable(note: $store.notes[i])   // ❌ ForEach 里没有 i
}
```

正确做法是 `ForEach($store.notes) { $note in ... }`,把数组本身作为 Binding 传入,SwiftUI 在迭代里自动给每个元素 Binding;或者像本文那样用 `firstIndex(where:)` 取出 index。**iOS 15 起 `ForEach` 已经支持 binding 的 `$collection` 写法**,旧教程里手写 index 的代码可以重构。

### 坑 7:Swift 5 老教程里 `EnvironmentKey` 写 `static var`

```swift
private struct ThemeKey: EnvironmentKey {
    static var defaultValue: Theme = .system   // Swift 6 警告
}
```

Swift 6 严格并发要求静态属性 `Sendable` 或常量,改 `static let`。`@Entry` 宏生成的代码已经满足,这条只在你看老代码时碰到。

### 坑 8:`.environment(\.locale, .init(...))` 改完没生效

`.environment(\.locale, ...)` 只影响 **modifier 之下的子树**,挂错位置会无效。常见错位是挂在 `WindowGroup` 之外或某个 `View` 的兄弟节点上。规则:**modifier 链上的 `environment` 注入,从该 `View` 开始向下传播,不会回溯影响兄弟节点**。

### 坑 9:`@Bindable` 与 `@State` 同时存在

```swift
@State private var store: NoteStore     // 视图拥有
@Bindable var store: NoteStore          // 父视图传入
```

二选一。`@State` 拥有 + 投影自动有 Binding;`@Bindable` 不拥有但获得 Binding 能力。一旦在同个视图里写了两个,**Xcode 会编译失败**,不会让你两边都来。

### 坑 10:iOS 17/18 跨版本兼容

`@Entry`、`@Environment(SomeObservable.self)` 都要 iOS 17+,基线 iOS 18 没问题。若要兼容 iOS 16:

```swift
if #available(iOS 17.0, *) {
    Text("modern")
        .environment(\.newKey, value)
} else {
    Text("legacy")
}
```

但本系列默认 iOS 18 最低部署目标,**不为旧版本写双套数据流代码**。这是为了避免设计被向下兼容拖回 2022 年的心智。

### 坑 11:把 `Binding` 存到 `@State` 字段里

```swift
struct EditorView: View {
    @Binding var note: Note
    @State private var cachedBinding: Binding<String>?    // ❌

    var body: some View {
        TextField("title", text: $note.title)
            .onAppear { cachedBinding = $note.title }
    }
}
```

`Binding` 是临时投影,**不可跨视图重建持有**。视图重建时新的 `Binding` 会取代旧的,你存的那份会指向无效闭包。结果是改了 `cachedBinding.wrappedValue` 不会被父视图看到。如果真的需要"延后写入",写一个 `@State private var pending: String`,在 `.onChange(of: pending)` 里再写回 `$note.title`。

### 坑 12:`@Environment(\.scenePhase)` 在 Widget Extension 里行为不同

`scenePhase` 在主 App 是 `.active` / `.inactive` / `.background` 三态,但在 Widget Extension 里**只读得到 `.active` / `.background` 两态**(Widget 没有 `.inactive`)。如果你写跨 target 的视图,这一条会让你的状态机漏一条分支。第 22 篇 WidgetKit 会展开,这里只提醒一句。

### 坑 13:`@Environment` 读出的值在 init 里访问会崩

```swift
struct MyView: View {
    @Environment(\.colorScheme) var scheme

    init() {
        print(scheme)   // ❌ 此时 environment 还没注入
    }
}
```

`@Environment` 的值在视图被 mount 进树之后才注入,`init` 阶段是空的。要在创建期决定 UI,通过 `init` 参数显式传;要响应 environment,在 `body` 里读、在 `.onChange` 里反应。**这条规则适用于所有 `@Environment`、`@State`、`@Bindable`、`@Query`**——SwiftUI 的属性包装器在 init 之外才完整。

---

数据流向至此清晰:`@Binding` 走"子改父"的双向血管,`@Environment` 走横切的"主动脉",`@Entry` 让自定义环境键从样板代码缩成一行。下一篇我们离开状态,进入 SwiftUI 的布局系统——`HStack` / `VStack` / `Grid` / `Layout` 协议背后的 **proposal-response** 心智。

### 一份给 code reviewer 的速查清单

- 子视图只读不写的属性,**只能** `let`,不能 `@Binding`。`@Binding` 暗示子要写,review 时按这条强制。
- 同一份数据在 70% 以上的视图里被读到才放 environment,否则继续 prop drilling——避免"环境垃圾袋"。
- 自定义 environment 键一律 `@Entry` 写法,不写 `EnvironmentKey` 老样板;旧代码看到老样板就重构掉。
- `@Environment(SomeType.self)` 一定带 `?`,在视图层用 `if let` 兜底,不允许 `!` 强制解包。
- 注入业务对象时,`.environment(store)` 挂在尽可能高的视图(`@main` App 入口或顶层 Scene),不要散在中间层。
- 测试 / Preview 通过 `.environment(\.someKey, mock)` 切换实现,业务代码里不出现"if isPreview { ... } else { ... }" 这种环境判断。
- Swift 6 严格并发模式下,所有自定义 environment 值的类型必须 `Sendable`——`any SomeProtocol` 必须在协议里加 `Sendable` 约束,或者用 `@MainActor` 单例。

这七条贴在 PR 模板里,基本能挡住所有"数据流向"维度的设计问题。
