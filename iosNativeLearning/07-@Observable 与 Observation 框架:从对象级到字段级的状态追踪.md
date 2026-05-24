# 07 @Observable 与 Observation 框架:从对象级到字段级的状态追踪

到这一篇,我们已经把 SwiftUI 的视图协议、`body: some View` 重计算、`@State` 私有可变状态都摸清楚了。但 `@State` 只能解决一个视图内部的状态;一旦同一份数据要被列表页和详情页共享、要被网络层异步写入、要被 SwiftData 持久化反向通知 UI——`@State` 就管不到了。

iOS 17 之前的答案是 `ObservableObject` + `@Published` + `@ObservedObject` / `@StateObject`。这条路在 Apple 自己看来是有缺陷的:**视图订阅的粒度是整个对象**,只要任何一个 `@Published` 字段变动,所有引用了这个对象的视图都会被标脏并重新计算 `body`。在大型笔记 App 里,这个开销会被 SwiftData / iCloud 同步的高频小写入放大,直接拖出可感知的卡顿。

iOS 17 起,Apple 把状态系统重写为 `Observation` 框架,语法入口是一个宏:`@Observable`。**它把"我订阅了哪个字段"这件事下放到字段级别**,视图只会在它"真的读过"的字段变化时重算。Swift 6 / iOS 18 把这套机制定为默认推荐路径,Apple 文档已经在所有 SwiftUI 状态共享样例里把 `ObservableObject` 替换为 `@Observable`。

本篇就把 `@Observable` 的机制、宏展开、字段级追踪原理、`@Bindable` 双向绑定、以及在 `NotesIsland` 里如何把 MVVM 落地讲透。

这一篇是整个第二层(SwiftUI 声明式 UI 与状态模型)的"承重梁"。前面第 06 篇讲 `@State`,把"视图私有可变状态"这一类钉死;第 08 篇讲 `@Binding` / `@Environment`,把"跨视图数据流"钉死;只有这中间一篇,把"对象级共享 + 字段级追踪 + ViewModel 分层"讲清楚,前后两篇才能严丝合缝地接上。如果你只读一篇,选这一篇。

---

## 一、机制定位:它到底解决什么问题

### 1. ObservableObject 的三个痛点

```swift
// 旧 iOS 16 / Swift 5 写法,本系列禁用,这里只为对照
final class NoteStore: ObservableObject {
    @Published var notes: [Note] = []
    @Published var searchText: String = ""
    @Published var isSyncing: Bool = false
}
```

**痛点一:粒度是对象级**。视图里只要写了 `@ObservedObject var store: NoteStore`,无论你 `body` 里读的是 `notes` 还是 `searchText`,只要 `isSyncing` 翻了一下,SwiftUI 就会让你重算 `body`。在一个 1000 行笔记列表的页面里,`isSyncing` 每秒翻几十次的话,你会看到 CPU 火焰图里 `body` 占满。Apple 自己在 WWDC 23 的 Demystifying SwiftUI Performance session 里把这种"伪订阅"列为 SwiftUI 性能的头号杀手——一个视图在它什么都不关心的字段变化时被叫醒,后果是连锁的:子视图、孙视图、它们关联的 diff、动画 transaction 都要陪着算一遍。

**痛点二:必须用 class**。`@Published` 是属性包装器,只能挂在 class 字段上,意味着你的状态层永远是引用类型,跟 Swift 偏好值语义的方向反着走。一旦你想把 ViewModel 上的某个字段提成"小型不可变数据",还要包一层 `struct` 再 `@Published`,层级冗余。

**痛点三:跨视图传值要在 `@StateObject` / `@ObservedObject` / `@EnvironmentObject` 之间反复选**。这三者的生命周期心智几乎是 SwiftUI 历史最大的劝退点之一:`@StateObject` 由视图自己创建并持有、`@ObservedObject` 由父视图传入、`@EnvironmentObject` 走环境。错用一个,视图就会在某次重建中把状态对象重新 new 一遍,数据丢失。WWDC 论坛与 Stack Overflow 上"为什么我的 ViewModel 数据丢了"的问题几乎全部归因到这三个名词被用错。

### 2. Observation 框架的新答案

`@Observable` 把整套机制重写为:

- **宏(macro)展开**,不再依赖属性包装器。`@Published` 这个壳不存在了,你的字段就是普通字段。
- **字段级追踪**。视图在 `body` 里读了哪些字段,Observation 会"录"下来;只有这些字段下次变了,这个视图才会被标脏。
- **同一个属性,只用一种声明**。共享状态在视图里只需要写 `let store: NoteStore`(常量,不带任何包装器),视图就会自动订阅。要让视图"拥有"状态对象、跨重建保留,用 `@State`;要让父视图给的引用拥有 `Binding`,用 `@Bindable`。三个生命周期角色合并为两个 SwiftUI 关键字。

Apple 在 WWDC 23 公开 Observation 框架时,把它定位为 Swift 标准库级别的开源工具(而不是只属于 SwiftUI 的内部机制)。这意味着 Observation 不止能服务 UI——任何想做"细粒度反应式"的工具链,都能直接 `import Observation`、用 `withObservationTracking` 写出自己的"重算调度器"。也正因为它被设计成通用基础设施,Observation 自己不假设是哪条线程在跑、不假设有没有 SwiftUI、不假设观察者是谁,它只负责"录依赖 + 触发回调"这一件事。SwiftUI 只是 Observation 的第一个、也是最大的消费者。

这种设计选择影响了我们写 ViewModel 的方式:你完全可以在没有 SwiftUI 的命令行工具、纯逻辑层的 framework 里用 `@Observable`,只要在恰当的地方手动调用 `withObservationTracking` 即可。第 14 篇 SwiftData 在内部就是这么用的——`@Model` 类的字段变更通过 Observation 推到 `@Query` 订阅,绕过 SwiftUI 也能工作。

### 3. 与跨端/前端的心智对照

- 类似 MobX 的 **observable + autorun**,但 Apple 把"录依赖"做成编译期宏 + 运行期 `withObservationTracking` 的组合,没有 MobX 那种 transaction / reaction 的运行时开销。
- 类似 Vue 3 / Solid 的 **细粒度响应式**,但 SwiftUI 视图本身仍然是值类型,重计算的对象是 `body`,不是 DOM。Vue 的 ref / reactive 会在运行时建立完整的依赖图,Observation 走的是"按需录、用完丢"的轻量路径。
- 与 React 的 `useState` / `useContext` 不同:Observation 不需要 selector,**读哪个字段就只订阅哪个字段**,不需要 `useMemo` 防过度渲染。React 心智里"父组件 re-render 全家"是默认行为,SwiftUI 心智里"父视图 body 重算不等于子视图 body 重算"才是默认行为,字段级追踪把这条规则进一步收紧到字段维度。
- 与 Flutter 的 `ChangeNotifier` / `ValueNotifier` 比:`ChangeNotifier.notifyListeners()` 仍然是对象级广播,粒度等同于 `ObservableObject`;Flutter 的细粒度方案 `signals_flutter` 在精神上才与 Observation 接近。
- 与 Compose 的 `mutableStateOf` 比:Compose 的"snapshot" 系统天生就是字段级追踪,Observation 的思路其实和它最像——一个读操作 + 一个写操作 + 一份记账,触发 recomposition 的精度对齐。

理解了这层对照,你会发现 Apple 不是在发明新概念,而是在用 Swift Macro 把"细粒度响应式 + 值语义友好"这套现代心智用最少的 ceremony 装进 SwiftUI——这也是它能把 `@StateObject` / `@ObservedObject` / `@EnvironmentObject` 三个名词合并成 `@State` / `@Bindable` 两个名词的底气。

---

## 二、Apple 平台心智

### 1. 核心类型与所属 framework

| 入口 | 所属 framework | 角色 |
| --- | --- | --- |
| `@Observable` 宏 | `Observation` | 把普通 class 变成可被字段级追踪的观察对象 |
| `@ObservationTracked` / `@ObservationIgnored` | `Observation` | 宏展开产物 / 显式排除某字段 |
| `withObservationTracking(_:onChange:)` | `Observation` | 底层"录依赖 + 回调"原语,SwiftUI 自己用 |
| `@State` | `SwiftUI` | 视图拥有一个 `@Observable` 实例并跨重建保留 |
| `@Bindable` | `SwiftUI` | 把传入的 `@Observable` 引用包装成可生成 `Binding` 的角色 |
| `@Environment(_:)` | `SwiftUI` | 沿视图树注入 `@Observable` 单例,详见第 08 篇 |

### 2. 宏到底展开成了什么

`@Observable` 是一个 attached macro。Swift 编译器在编译期把如下声明:

```swift
@Observable
final class NoteStore {
    var notes: [Note] = []
    var searchText: String = ""
}
```

展开为(简化后等价物):

```swift
final class NoteStore: Observable {
    @ObservationTracked
    var notes: [Note] {
        get { access(keyPath: \.notes); return _notes }
        set { withMutation(keyPath: \.notes) { _notes = newValue } }
    }
    @ObservationIgnored private var _notes: [Note] = []

    @ObservationTracked
    var searchText: String {
        get { access(keyPath: \.searchText); return _searchText }
        set { withMutation(keyPath: \.searchText) { _searchText = newValue } }
    }
    @ObservationIgnored private var _searchText: String = ""

    @ObservationIgnored
    private let _$observationRegistrar = ObservationRegistrar()

    internal func access<Member>(keyPath: KeyPath<NoteStore, Member>) {
        _$observationRegistrar.access(self, keyPath: keyPath)
    }
    internal func withMutation<Member, T>(
        keyPath: KeyPath<NoteStore, Member>,
        _ mutation: () throws -> T
    ) rethrows -> T {
        try _$observationRegistrar.withMutation(of: self, keyPath: keyPath, mutation)
    }
}
```

理解这一段是看懂全篇的关键。每次你读 `store.notes`,getter 里的 `access(keyPath:)` 会问"现在有没有人正在录依赖?"如果是 SwiftUI 在算 `body`,就把 `(store, \.notes)` 这对组合记进追踪表。每次你写 `store.notes = [...]`,setter 里的 `withMutation` 会查表,把所有依赖过这条 keyPath 的"观察者"叫醒。

注意三个细节:

- `ObservationRegistrar` 是 Apple 提供的一个轻量级、线程安全的"记账本"。它内部用弱引用持有观察者闭包,观察者(SwiftUI 视图)消失时记账自动收回,不会内存泄漏。
- `access(keyPath:)` 和 `withMutation(keyPath:)` 都是 `internal` 可见性,所以你**不能**手动调用它们——这套机制只能通过 `@Observable` 宏触发,Apple 通过封闭可见性把 API 表面控制得极小。
- `_$observationRegistrar` 字段加了 `@ObservationIgnored`,保证它自己的变化不会反过来触发追踪——否则会形成自反订阅,直接死循环。

SwiftUI 用 `withObservationTracking` 把上面这件事包了一层:

```swift
// 伪代码,展示 SwiftUI 内部干了什么
func computeBody() {
    withObservationTracking {
        view.body              // 读依赖时被 access(keyPath:) 录下
    } onChange: {
        scheduleRedraw(view)   // 任一被读字段变化,把视图标脏
    }
}
```

注意 `onChange` 是 **one-shot**:回调触发一次后,SwiftUI 必须再跑一次 `body`,才会重新"录"下一轮依赖。这也意味着如果你在某次 `body` 里因为分支跳过了对 `notes` 的读取,这一轮就不再追踪 `notes`,直到下次某个分支再读到它。这就是字段级追踪的精髓。

这个 one-shot 设计与 React 的 Fiber 调度逻辑完全相反——React 的 hooks 订阅是"按声明顺序持久订阅",而 SwiftUI + Observation 是"按 body 执行路径动态订阅"。前者的好处是顺序确定、易推理;后者的好处是真的精确到本轮 body 用了什么。代价是,你不能依赖"上一轮读过的字段下一轮也会被订阅",每次 body 都要把读取动作"自然地"嵌进当前 render 路径里。**这条心智差异是 React 转 SwiftUI 的隐形陷阱之一**:在 SwiftUI 里把字段读到一个 `if let value = store.optionalField` 的条件分支里,如果 value 为 nil 该分支没继续读其他字段,那 nil 转非 nil 时视图会被叫醒;但非 nil 转其他非 nil 时,如果你之后没有再读这个字段的子字段,反而不会被叫醒。理解这一点能避免一类"为什么数据变了视图不刷新"的诡异 bug。

### 3. 隔离域:`@Observable` 与 Swift 6 严格并发

`@Observable` 默认 **不带任何 actor 隔离**。这意味着:

- 如果你的状态对象只在主线程被读写(典型 UI 层),可以直接给 class 加 `@MainActor`。
- 如果你的状态对象会被后台 Task 写入(比如 iCloud 同步回调),那要么把写入 hop 到 `@MainActor`,要么把这个 class 标成 `actor`——但 `@Observable` 与 `actor` 组合受限,SwiftUI 视图必须在主线程订阅,因此推荐前者。

Swift 6 严格并发下,**带状态的 ViewModel 一律标 `@MainActor`**,后台工作放到独立的 `actor` 或 `Task.detached`。这条规则的本质是:**UI 层是单线程心智的天堂,后台工作有自己的隔离域,二者通过 `async` / `await` 接缝**。`@Observable @MainActor` 让 ViewModel 显式声明"我只接受主线程读写",编译器替你把所有违反这条契约的代码标红。这与 iOS 16 之前"GCD 想跨线程就跨"的旧世界形成了鲜明对比:在新世界里,跨线程不是默认能力,是要明确"为什么"的工程决策。

另一个常被忽视的细节:`@Observable` 类如果**没有**标 `@MainActor`,但它的某个方法是 `async`,Swift 编译器在严格并发下会要求你证明这个方法可以从任意 actor 调用——这通常意味着你要把所有读写都拆成 `@MainActor` 闭包。**比起一遍遍写隔离,直接给类标 `@MainActor` 几乎总是更省事的选择**。只有当你确实在写一个跨 actor 共享的纯逻辑对象(没有 UI 关联),才考虑保持 nonisolated。

### 4. `@State` 与 `@Bindable` 的角色分工

- `@State var store = NoteStore()`:**视图拥有 store**,跨视图重建保留,整个视图层级里这是 store 的"家"。
- `let store: NoteStore`:**视图借用别人的 store**,父视图传入,自动订阅字段级变化。
- `@Bindable var store: NoteStore`:**借用 + 需要 Binding**,例如把 `store.searchText` 双向绑给 `TextField`。

这套规则比 `@StateObject` / `@ObservedObject` 简单太多。**写 ViewModel 不再纠结生命周期**。

之所以能简化,是因为 `@Observable` 把"被观察"这个性质内置在了对象的类型上,而 SwiftUI 视图的 `body` 重算路径自带 `withObservationTracking` 的拦截层。这两件事联手,使 SwiftUI 不再需要让程序员手工告诉它"我要观察这个对象"——只要你在 `body` 里读了它的字段,订阅就发生了。换句话说,**"观察"从一个动词变成了一个语义事实**。这也是为什么把状态对象作为普通 `let` 字段传进子视图就能工作:类型本身已经携带了"我可被字段级观察"的能力。

值得对照的还有 SwiftData 的 `@Model`:`@Model` 宏在内部其实也是 `@Observable` 宏的一个超集,只是额外加了持久化字段、关系追踪和 CloudKit 接入。所以你在第 14 篇看到 `@Model` 类用 `@Query` 注入到视图、视图里读模型字段时也会触发字段级追踪——这是同一套机制在数据层的延伸,不是另一套独立系统。

### 5. 与 MVVM 心智的落地

`@Observable` 让 MVVM 在 SwiftUI 里第一次落得稳:

- **Model**:值类型 `struct`(像 `Note`),不可变 / 可拷贝,负责"数据是什么"。
- **ViewModel**:`@Observable @MainActor final class`(像 `NoteStore`),负责"数据怎么变 + 业务规则",字段级被视图订阅。
- **View**:`struct ... : View`,负责"数据长什么样",通过 `@State` / `let` / `@Bindable` 读 ViewModel,不在 `body` 里做副作用。

这套分工与 Android 的 `ViewModel + StateFlow + Composable`、Flutter 的 `ViewModel + Riverpod + ConsumerWidget` 都几乎一一对应。差异在于 Apple 这边的 ViewModel 默认是 `MainActor` 隔离,后台并发完全靠 `actor` / `Task.detached` 切出去——你写的 ViewModel 是一个明确的主线程对象,这也是 Swift 6 严格并发模式的工程哲学。

---

## 三、工程实现

下面把 `NotesIsland` 的状态层落地一遍。目标:

1. 列表视图订阅 `notes` 与 `searchText`,**不**订阅 `isSyncing`。
2. 编辑视图通过 `@Bindable` 把 `Note` 字段双向绑到 `TextField`。
3. 同步状态用一个独立 `SyncStatusIndicator` 视图订阅,与列表完全解耦。
4. 所有写入 `NoteStore` 的 mutation 在 `@MainActor` 上,后台 Task 通过 `await` 切回主线程。

```swift
// File: Features/Notes/Note.swift
import Foundation

struct Note: Identifiable, Hashable, Sendable {
    let id: UUID
    var title: String
    var body: String
    var updatedAt: Date

    init(id: UUID = UUID(), title: String = "", body: String = "", updatedAt: Date = .now) {
        self.id = id
        self.title = title
        self.body = body
        self.updatedAt = updatedAt
    }
}
```

```swift
// File: Features/Notes/NoteStore.swift
import Foundation
import Observation

// MARK: - 状态对象
@Observable
@MainActor
final class NoteStore {
    // MARK: 字段级追踪的可变状态
    var notes: [Note] = []
    var searchText: String = ""
    var isSyncing: Bool = false

    // MARK: 计算属性也会被追踪(只要它读了被追踪字段)
    var filteredNotes: [Note] {
        guard !searchText.isEmpty else { return notes }
        let keyword = searchText.lowercased()
        return notes.filter {
            $0.title.lowercased().contains(keyword)
            || $0.body.lowercased().contains(keyword)
        }
    }

    // MARK: 不需要被追踪的依赖
    @ObservationIgnored
    private let syncEngine: any NoteSyncing

    init(syncEngine: any NoteSyncing) {
        self.syncEngine = syncEngine
    }

    // MARK: 业务动作
    func addEmptyNote() {
        let new = Note(title: "未命名笔记")
        notes.insert(new, at: 0)
    }

    func delete(_ note: Note) {
        notes.removeAll { $0.id == note.id }
    }

    func refreshFromCloud() async {
        isSyncing = true
        defer { isSyncing = false }
        do {
            let remote = try await syncEngine.fetchAll()
            merge(remote)
        } catch {
            // 真实工程里走第 27 篇的 MetricKit 上报
            print("sync failed: \(error)")
        }
    }

    private func merge(_ remote: [Note]) {
        // 以 updatedAt 为准的简化合并
        var dict = Dictionary(uniqueKeysWithValues: notes.map { ($0.id, $0) })
        for r in remote {
            if let local = dict[r.id], local.updatedAt >= r.updatedAt { continue }
            dict[r.id] = r
        }
        notes = dict.values.sorted { $0.updatedAt > $1.updatedAt }
    }
}

// MARK: - 同步引擎抽象,真实实现见第 14 篇 SwiftData + CloudKit
protocol NoteSyncing: Sendable {
    func fetchAll() async throws -> [Note]
}
```

```swift
// File: Features/Notes/NoteListView.swift
import SwiftUI

struct NoteListView: View {
    // MARK: 这个视图拥有 store
    @State private var store = NoteStore(syncEngine: PreviewSyncEngine())

    var body: some View {
        NavigationStack {
            List {
                // 仅订阅 filteredNotes(它读 notes + searchText)
                ForEach(store.filteredNotes) { note in
                    NavigationLink(value: note) {
                        NoteRow(note: note)
                    }
                }
                .onDelete { indexSet in
                    indexSet.map { store.filteredNotes[$0] }.forEach(store.delete)
                }
            }
            .searchable(text: $store.searchableTextBinding)
            .navigationTitle("笔记")
            .navigationDestination(for: Note.self) { note in
                if let index = store.notes.firstIndex(where: { $0.id == note.id }) {
                    NoteEditView(note: $store.notes[index])
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("新建", systemImage: "plus", action: store.addEmptyNote)
                }
                ToolbarItem(placement: .topBarLeading) {
                    SyncStatusIndicator(store: store)
                }
            }
            .task { await store.refreshFromCloud() }
        }
    }
}

// MARK: - 同步状态指示器,只订阅 isSyncing
private struct SyncStatusIndicator: View {
    // 不写 @State / @Bindable,只是借用
    let store: NoteStore

    var body: some View {
        if store.isSyncing {
            ProgressView()
                .controlSize(.small)
        } else {
            Image(systemName: "checkmark.icloud")
                .foregroundStyle(.secondary)
        }
    }
}

// MARK: - 行视图
private struct NoteRow: View {
    let note: Note
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(note.title).font(.headline)
            Text(note.body).font(.footnote)
                .foregroundStyle(.secondary)
                .lineLimit(2)
        }
    }
}
```

注意 `searchable(text:)` 需要一个 `Binding<String>`。`@State` 修饰的引用类型字段(`store`)可以通过 `$store.foo` 直接拿到 Binding——这是 SwiftUI 与 `@Observable` 默认配套的语法糖。如果你拿到的不是 `@State`(比如 store 是父视图传进来的),就要用 `@Bindable` 包一层,见下面的 `NoteEditView`。

为了演示纯粹的字段绑定,这里给一个独立编辑视图:

```swift
// File: Features/Notes/NoteEditView.swift
import SwiftUI

struct NoteEditView: View {
    // MARK: 直接对 Note 值类型做绑定
    @Binding var note: Note

    // MARK: 真正的 @Bindable 演示:借用一个 @Observable 引用类型
    @State private var draft = NoteDraft()

    var body: some View {
        Form {
            Section("标题") {
                TextField("标题", text: $note.title)
            }
            Section("正文") {
                TextEditor(text: $note.body)
                    .frame(minHeight: 200)
            }
            Section("草稿计数(演示 @Bindable)") {
                DraftCounter(draft: draft)
            }
        }
        .navigationTitle("编辑笔记")
        .onChange(of: note) { _, _ in
            note.updatedAt = .now
        }
    }
}

// MARK: - 借用引用类型的编辑子视图
private struct DraftCounter: View {
    // 父视图给的引用,需要 Binding 时必须 @Bindable
    @Bindable var draft: NoteDraft

    var body: some View {
        Stepper(value: $draft.count, in: 0...99) {
            Text("草稿数:\(draft.count)")
        }
    }
}

@Observable
@MainActor
final class NoteDraft {
    var count: Int = 0
}
```

最后给 `NoteStore` 补一个 `searchableTextBinding` 的小辅助(因为 `searchable` 想要 `Binding<String>`,而我们的 store 是 `@State` 持有的引用,直接 `$store.searchText` 就能拿到,这里只是为可读性命个名):

```swift
// File: Features/Notes/NoteStore+Binding.swift
import SwiftUI

extension NoteStore {
    // MARK: 仅为 .searchable 调用点命名清晰
    var searchableTextBinding: String {
        get { searchText }
        set { searchText = newValue }
    }
}
```

整段代码加起来 ~150 行,Swift 6 严格并发模式下可直接通过编译,无 `@unchecked Sendable`、无 force unwrap、无 `DispatchQueue`。

---

## 四、调参与验收

### 1. 验证字段级追踪真的生效

在 `NoteListView.body` 的开头加一行:

```swift
let _ = Self._printChanges()
```

(详见第 26 篇 SwiftUI 性能。)然后跑模拟器,做三件事:

| 操作 | 期望日志 | 含义 |
| --- | --- | --- |
| 点 `+` 新建笔记 | `NoteListView: @self, _store changed` 一次 | `notes` 变化,列表订阅了它 |
| 搜索框输入 `a` | `NoteListView: @self, _store changed` 一次 | `searchText` 变化,`filteredNotes` 跟着变 |
| 同步开关翻转(模拟 `store.isSyncing.toggle()`) | `NoteListView` **不输出**;`SyncStatusIndicator` 输出 | **字段级追踪成功**:列表没读 `isSyncing` 就不会被叫醒 |

如果第三条你也看到了 `NoteListView` 被叫醒,99% 是你在 `body` 某处读了 `isSyncing`(比如 `if store.isSyncing { ... }` 写在了列表条件里)。这是 `@Observable` 自我审计的最直接手段。

`_printChanges()` 的输出格式是:`@self`、`@identity`、`_field_name` 三类标记。`@self` 表示视图的值类型发生了改变(父视图传进来的不同了);`@identity` 表示视图被卸载重建,而不是更新;`_field_name` 表示字段级追踪触发。把这三种 case 区分开,你就能精确判断"我为什么被叫醒":参数变了、整棵子树重建了、还是 Observation 追踪到字段变化。在调试性能问题时,这是比 Instruments 火焰图更先发现问题的工具——火焰图告诉你"贵",`_printChanges` 告诉你"贵的原因"。

### 2. 验证 Swift 6 严格并发通过

`Package.swift` 或 target 配置:

```swift
.target(
    name: "NotesIsland",
    swiftSettings: [
        .swiftLanguageMode(.v6)
    ]
)
```

跑 `swift build`(或 Xcode 16 Build):

- 如果 `NoteStore` 没标 `@MainActor`,而 `refreshFromCloud` 是 `async`,编译器会要求 `NoteSyncing` 是 `Sendable` 且 `merge` 必须 hop 到主线程。
- 给 `NoteStore` 加 `@MainActor` 后,`refreshFromCloud` 内部所有 `await syncEngine.fetchAll()` 之后的代码自动回到主线程,Swift 编译期校验通过。

如果你想在 CI 上"零警告"地构建,可以在 `swiftSettings` 里加一行 `.enableUpgradeFeature("StrictConcurrency")` 把所有 Swift 5 兼容模式下还被降级为 warning 的检查拉成 error。这是 2026 年新 iOS 项目的推荐配置,**Swift 6 + 严格并发 + 升级特性全开**是当前最安全的工程基线。

### 3. 真机 vs 模拟器

- 模拟器在主线程任务调度上**比真机激进**,有时模拟器看不到的字段误订阅,在 iPhone 13 mini 真机能用 Instruments → SwiftUI 模板看见 `body` 重算频率。
- 真机上 60Hz / 120Hz ProMotion 的差异不会改变追踪逻辑,但 ProMotion 设备上多余的 `body` 重算更容易被肉眼感知(锯齿 / 滑动卡顿)。

### 4. 验收清单

- [ ] `NoteStore` 没有 `ObservableObject` 与 `@Published`。
- [ ] 所有视图层级里没有 `@StateObject` / `@ObservedObject` / `@EnvironmentObject`。
- [ ] `_printChanges` 显示 `SyncStatusIndicator` 的同步翻转不会叫醒列表。
- [ ] `searchable` 输入 / 新建 / 编辑笔记三条主路径都能响应。
- [ ] `swift build` 或 Xcode 16 Build 在 Swift 6 模式下零警告。

---

## 五、踩坑

### 坑 1:还在 import Combine

旧教程里 `ObservableObject` 来自 `Combine`。新代码 **不需要** `import Combine`。一旦你在 `NoteStore` 文件里看到 `import Combine`,八成是 Xcode 模板的残留,删掉即可——除非你在第 15 篇里桥接 `Notification` / `Timer` 这种老 API。

### 坑 2:把 `@Observable` 当属性包装器写

```swift
// 错误:@Observable 是 attached macro,不是 property wrapper
@Observable var store = NoteStore()
```

正确写法:`@Observable` 放在 **class 声明** 上,不是字段上。视图里用 `@State` / `@Bindable` / 普通 `let` 持有它。

### 坑 3:`let store` 不订阅?

如果你写了 `let store: NoteStore` 但视图在数据变化时不刷新,99% 是因为 **`body` 里没真的读这个字段**。例如:

```swift
var body: some View {
    if Bool.random() { Text("hi") }   // 没读 store 任何字段
    else { Text(store.notes.first?.title ?? "") }
}
```

第一个分支这一轮不会订阅 `notes`,直到下一次 `body` 落到第二个分支才会。字段级追踪是**逐次重新录依赖**的,不是一次性订阅。

### 坑 4:把 `@Bindable` 当 `@StateObject` 用

```swift
// 错误
@Bindable var store = NoteStore()   // 编译器会建议你改成 @State
```

`@Bindable` **不持有** state,只是把已有引用包装出 Binding 能力。要在视图里"创建"一个 `@Observable` 实例,用 `@State`。

### 坑 5:在 `@Observable` class 里写 `@Published`

```swift
@Observable
final class NoteStore {
    @Published var notes: [Note] = []   // 编译器警告
}
```

`@Published` 与 `@Observable` 是两套系统,混用会导致字段既不会被宏改写,也不会被 Combine 推流——也就是说,**完全失去观察能力**。把 `@Published` 删掉即可。

### 坑 6:在后台线程直接写状态

```swift
Task.detached {
    store.notes.append(Note())   // ❌ Swift 6 编译失败
}
```

`NoteStore` 标了 `@MainActor`,Swift 6 严格并发会拒绝这种写法。改成:

```swift
Task { @MainActor in
    store.notes.append(Note())
}
```

或在 `NoteStore` 内部封装异步方法(像我们 `refreshFromCloud` 的做法)。

### 坑 7:跨 iOS 版本兼容

`@Observable` 要求 iOS 17+。本系列基线是 iOS 18,默认放心用。如果你要兼容 iOS 16 的老项目:

```swift
@available(iOS 17.0, *)
@Observable
final class NoteStore { ... }
```

并在更低版本提供 `ObservableObject` 备用实现。但 **不要** 在同一个项目里两套并存,这会让团队心智彻底崩溃——升基线到 iOS 17+ 再讨论使用 Observation。

### 坑 8:`@Observable` + `Codable` 自动合成失败

宏会改写存储,导致 Swift 编译器无法自动合成 `Codable`。解决方式:**让 `@Observable` 类只承载内存状态,持久化用值类型 `struct`**(像本文的 `Note`),这也是 SwiftData 推荐的姿势。Apple 在 iOS 18 给 SwiftData `@Model` 单独留了序列化路径,不需要 `@Observable` 来背这个锅。

### 坑 9:在 `@Observable` 类里写计算属性,却忘了它会被追踪

```swift
@Observable
final class NoteStore {
    var notes: [Note] = []
    var formattedCount: String { "共 \(notes.count) 条" }   // 也会被追踪
}
```

只要计算属性内部读了被追踪字段,视图里读 `store.formattedCount` 就等于订阅 `notes`。**这通常是你想要的**,但如果你定义了一个看似"派生"的属性、却在内部读了一些频繁变化的字段(例如时间戳),视图会被高频叫醒。诊断方法:把计算属性拆成"只读必要字段"和"只读高频字段"两个,看哪一个把视图叫醒了。

### 坑 10:在 `@Observable` 类里持有 `Combine` 订阅

旧代码常见:

```swift
@Observable
final class NoteStore {
    private var cancellables = Set<AnyCancellable>()   // 来自 Combine
}
```

`AnyCancellable` 在 Swift 6 严格并发下不是 `Sendable`,会污染整个 `NoteStore` 的 `Sendable` 推导。如果实在需要桥接 Combine(`NotificationCenter.Publisher` 之类),把订阅装进一个独立的 `actor` 或 `@MainActor` 子对象里持有,不要放在状态对象顶层。第 15 篇会专门讲 `URLSession async` 与 Combine 何时还胜出。

### 坑 11:把 `@Observable` 实例作为 `Sendable` 跨 actor 传

```swift
let store: NoteStore = ...
Task.detached {
    await someActor.handle(store)   // ❌ NoteStore 不 Sendable
}
```

`@Observable` 类默认不是 `Sendable`(类型本身就不安全跨线程)。如果你需要在 actor 之间传"数据快照",传值类型(`struct Note`、`struct NoteSnapshot`),不要传 `NoteStore`。这与 React / Redux 里"传数据不传 store"是同一种工程纪律。

### 坑 12:在预览里反复 new ViewModel

```swift
#Preview {
    NoteListView(store: NoteStore(syncEngine: PreviewSyncEngine()))
}
```

预览每次刷新都 new 一个 store,数据无法跨预览保留——这是 SwiftUI Preview 的正常行为,**不是 bug**。如果你要在预览里看到稳定的初始数据,在 `init` 里塞一份固定 stub 数据,或用 `static let preview = NoteStore.makePreviewSample()` 这种工厂。把 Preview 当玩具用,而不是当 dev server。

---

到这里,你已经知道怎么用 `@Observable` 把 ViewModel 写成"字段级追踪 + Swift 6 严格并发 + 没有 `ObservableObject`"的现代形态。下一篇我们把焦点从单视图共享,扩展到**跨视图树共享**——也就是 `@Binding`、`@Environment` 与 iOS 18 新出的 `@Entry` 宏。

### 一份给 code reviewer 的速查清单

当你 review 一个新人写的 `@Observable` 代码,按下面六条扫一眼通常能挑出 90% 的问题:

1. 状态对象的 `class` 是不是 `final`?Observation 宏不依赖继承,`final` 让编译器进一步优化访问器内联。
2. 状态对象是不是显式 `@MainActor`?如果不是,任何后台 Task 写入都会引发 Swift 6 严格并发警告。
3. 视图持有状态对象用的是 `@State` 还是 `let`?二选一,不能既 `@State` 又作为参数传进来——那是两份不同的 store。
4. `body` 里有没有读不必要的字段?字段级追踪只在"真的读过"才生效,多读一个字段就多一个被叫醒的理由。
5. `@ObservationIgnored` 是不是用在了"不希望视图重算"的依赖上(比如注入的服务、缓存的 Logger)?忘了加,服务对象的内部状态变化会引发整个视图层级的重算。
6. 视图层有没有混进 `@Published` / `ObservableObject` / `@StateObject` 的残留?这三个名词在 iOS 17+ 的工程里就是技术债的标记物。

把这六条贴在团队的 PR 模板里,基本就告别 Observation 的姿势问题。
