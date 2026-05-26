# Observation 与状态流向

上一篇讲了 `@State` 装"视图私有"状态。这一篇讲跨视图共享:`@Observable`(2023 年的新宏)、`@Bindable`(把对象字段当 Binding 用)、`@Environment`(依赖注入)、`@Entry`(iOS 18 简化自定义环境键)。最后讲清楚为什么 `ObservableObject + @Published` 在 2026 年已经是反模式。

> 一句话先记住:**`@Observable` 是 Apple 2023 用宏重写的 MVVM 根基——把 class 标了它,SwiftUI 就能"按字段"追踪依赖。视图读了哪个字段,只有那个字段改时才触发那个视图重算。`ObservableObject + @Published` 是"按对象"追踪,任一字段变整片视图刷新——这就是新旧两套方案的核心差别。**

---

## 一、为什么 @Observable 取代 ObservableObject

2019 年 SwiftUI 1.0 上线时,共享状态的标准做法是:

```swift
// 旧:Swift 5 / iOS 13-16
final class NotesViewModel: ObservableObject {
    @Published var notes: [Note] = []
    @Published var isLoading: Bool = false
    @Published var searchQuery: String = ""
    
    func reload() { ... }
}

struct NoteListView: View {
    @StateObject private var vm = NotesViewModel()
    
    var body: some View {
        VStack {
            SearchBar(query: $vm.searchQuery)   // 共享 vm.searchQuery
            if vm.isLoading {
                ProgressView()
            } else {
                List(vm.notes) { ... }
            }
        }
    }
}
```

问题在 `@Published` 的实现:**任何一个 `@Published` 字段变化,都会调用整个 `ObservableObject` 的 `objectWillChange.send()`**。SwiftUI 收到这个信号后**重算所有读过这个 vm 的 view body**。

这意味着:
- `searchQuery` 输入框敲一个字符 → `objectWillChange` 触发 → `NoteListView` 重算 body → `List(vm.notes)` 也参与 diff,虽然 `notes` 没变,但参与了对比。
- 如果有 10 个视图都读 `vm`,任意字段变,10 个视图全 body 重算一次。

字段级追踪解决这件事。`@Observable` 宏展开后,SwiftUI 在每次视图读字段时记录"我依赖了哪个字段",字段改时**只通知真正读过它的视图**:

```swift
// 新:Swift 5.9+ / iOS 17+
import Observation

@Observable
@MainActor
final class NotesStore {
    var notes: [Note] = []
    var isLoading: Bool = false
    var searchQuery: String = ""
    
    func reload() async { ... }
}

struct NoteListView: View {
    @State private var store = NotesStore()      // 注意:@State,不是 @StateObject
    
    var body: some View {
        VStack {
            SearchBar(query: $store.searchQuery)
            if store.isLoading {
                ProgressView()
            } else {
                List(store.notes) { ... }
            }
        }
    }
}
```

行为差异:`searchQuery` 改时,SwiftUI 只会让"读了 searchQuery"的子视图重算。`List` 那部分 body 不读 `searchQuery`(它只读 `notes`),完全不参与 diff。

> 这不是"性能优化技巧",是**SwiftUI 状态层的根本升级**。在 1000+ 个 view 的复杂界面里,`@Published` 是 N 个视图全刷新,`@Observable` 是只刷新依赖了那个字段的几个。

---

## 二、@Observable 的实现机制

`@Observable` 是宏(macro),不是协议。宏展开后,class 的每个 stored property 被改写:

```swift
// 你写
@Observable
class Store {
    var count: Int = 0
}

// 宏展开后(简化版)
class Store {
    @ObservationIgnored private var _count: Int = 0
    private let _$observationRegistrar = ObservationRegistrar()
    
    var count: Int {
        get {
            _$observationRegistrar.access(self, keyPath: \.count)
            return _count
        }
        set {
            _$observationRegistrar.willSet(self, keyPath: \.count)
            _count = newValue
            _$observationRegistrar.didSet(self, keyPath: \.count)
        }
    }
}
```

`access` / `willSet` / `didSet` 三件套是 Observation 框架的核心。每次 SwiftUI 在 view body 里读 `store.count`,会触发 `access`——这一刻 SwiftUI 把"当前正在重算的 view"与"被访问的 keyPath"建立依赖。下次 `count` 变化时,`willSet` 通过这个依赖表通知对应的视图。

**关键事实**:`@Observable` 是 class,必须是 class——值类型的 struct 不可能在外部记录依赖,只有引用类型才有"同一个对象被多处持有"的语义。

---

## 三、怎么持有 @Observable Store

```swift
// 视图自己创建并持有(类似 @StateObject 的角色)
@State private var store = NotesStore()

// 父视图传进来 + 想读 + 想用 binding 改字段
@Bindable var store: NotesStore

// 父视图传进来 + 只读(不需要 binding)
let store: NotesStore

// 从 environment 取
@Environment(NotesStore.self) private var store
```

四种姿势,各有用途:

**`@State` 持有 Store**:store 的生命周期跟着视图 identity。视图首次出现时构造,视图永久离开时销毁。这是 `@StateObject` 的接班人。

**`@Bindable` 拿到外部 Store**:接收外部传入的 store,且能用 `$store.field` 取到字段的 Binding。

```swift
struct EditView: View {
    @Bindable var store: NotesStore  // 父传进来
    
    var body: some View {
        TextField("搜索", text: $store.searchQuery)  // 字段绑定
    }
}
```

`$store.searchQuery` 是 `Binding<String>`,这是 `@Bindable` 的魔法——把 `@Observable` 对象的字段变成可双向绑定的 Binding。`@Observable` 单独不能 `$`,必须 `@Bindable` 一下。

**普通 `let store`**:只读、不需要 binding 的简单场景。性能最优,但失去 binding 能力。

**`@Environment(Store.self)`**:跨多层视图共享,下面专门讲。

---

## 四、@Environment:依赖注入

UIKit 时代,跨多层视图共享数据靠"`UIViewController` 持有 store,层层 prop 传递"或者"全局单例"。SwiftUI 提供 `@Environment` 当依赖注入的官方答案:

```swift
@main
struct NotesIslandApp: App {
    @State private var store = NotesStore()
    
    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)        // 注入到整棵视图树
        }
    }
}

struct AnyDeepChildView: View {
    @Environment(NotesStore.self) private var store    // 任意深度取出
    
    var body: some View {
        Text("\(store.notes.count) 条")
    }
}
```

`@Environment` 还能配合 binding:

```swift
struct DeepChildEdit: View {
    @Environment(NotesStore.self) private var store
    
    var body: some View {
        @Bindable var store = store      // 局部绑定一下
        TextField("搜索", text: $store.searchQuery)
    }
}
```

`@Environment` 的查找规则:**从当前视图向父链查找**,找到最近的同类型 `@Observable`。所以你可以在不同子树里注入不同的 Store 实例,每个子树拿到自己的那个。

---

## 五、EnvironmentValues:系统提供的环境

`@Environment(\.colorScheme)` 这种用 keyPath 的形式,取的是**系统预定义的环境值**:

```swift
@Environment(\.colorScheme) private var colorScheme         // .light / .dark
@Environment(\.dismiss) private var dismiss                  // closure,触发返回上一级
@Environment(\.modelContext) private var modelContext        // SwiftData
@Environment(\.locale) private var locale                    // 当前 Locale
@Environment(\.dynamicTypeSize) private var dts              // 用户字号偏好
@Environment(\.scenePhase) private var scenePhase            // .active / .background / .inactive
```

这些是 `EnvironmentValues` 结构体的字段,Apple 预定义了一堆。你也能自定义,但 iOS 17 之前要写一堆样板:

```swift
// 旧:iOS 17 及之前
private struct ThemeKey: EnvironmentKey {
    static let defaultValue: Theme = .default
}

extension EnvironmentValues {
    var theme: Theme {
        get { self[ThemeKey.self] }
        set { self[ThemeKey.self] = newValue }
    }
}
```

iOS 18 用 `@Entry` 宏把这 11 行压成 1 行:

```swift
// 新:iOS 18+
extension EnvironmentValues {
    @Entry var theme: Theme = .default
}
```

`@Entry` 是 SwiftUI 状态层的小升级,看到立刻用,不要再写老样板。

```swift
// 注入
RootView()
    .environment(\.theme, .dark)

// 读取
struct SomeView: View {
    @Environment(\.theme) private var theme
    var body: some View { Text("Hi").foregroundStyle(theme.fg) }
}
```

---

## 六、Binding 不是字段,是"双向访问权"

`@Binding` 是把"某处的可变状态"传给子视图的桥:

```swift
struct ParentView: View {
    @State private var name = ""
    
    var body: some View {
        ChildEditor(name: $name)
    }
}

struct ChildEditor: View {
    @Binding var name: String          // 不是新的 @State,是父的 @State 的引用
    
    var body: some View {
        TextField("Name", text: $name)
    }
}
```

`$name` 在父视图里是 `Binding<String>`,传给子视图后 `_name` 字段持有这个 Binding。子视图改 `name`,实际改的是父视图 `@State` 的存储槽。

`@Binding` 与 `@Bindable` 的区别:

| | `@Binding` | `@Bindable` |
| --- | --- | --- |
| 接收什么 | `Binding<T>`(已经是 binding) | `@Observable` 对象 |
| 提供什么 | 一个值的双向绑定 | 对象字段都能取 binding |
| 用途 | 单字段双向同步 | 多字段共享 + 部分 binding |
| 何时用 | 父子视图传单一字段 | 父子视图共享整个 store |

**两者经常同时出现**——父用 `@State` 持有 store,子用 `@Bindable` 接收 store,孙用 `@Binding` 接收 store 某字段的 binding。

---

## 七、@Observable 与 actor 的关系

`@Observable` 类**默认隔离在调用方所在的 actor**,通常是 `@MainActor`(因为 SwiftUI View 都在 main actor)。给 store 加 `@MainActor` 是 2026 年的推荐做法:

```swift
@Observable
@MainActor
final class NotesStore {
    var notes: [Note] = []
    
    func reload() async {
        // 这里在 @MainActor 上
        do {
            let fetched = try await api.fetchNotes()   // api 是 actor,会跨域
            self.notes = fetched                       // 回到 @MainActor
        } catch {
            ...
        }
    }
}
```

`@MainActor` 标在 store 上,**保证 UI 读字段时不需要 await**——所有访问都在 main actor 上完成。重型计算应该派去后台 actor,完成后 `await MainActor.run { ... }` 或者让外层 store 方法本身是 `@MainActor async`,这样跨 actor 跳过去回来由编译器自动处理。

---

## 八、不要做的事

### 8.1 不要再写 `ObservableObject + @Published`

```swift
// ❌ 老方案,2026 反模式
final class Old: ObservableObject {
    @Published var x = 0
}

// ✅ 新方案
@Observable
final class New {
    var x = 0
}
```

迁移很简单:删 `ObservableObject` 继承、删每个字段的 `@Published`、加 `@Observable` 宏、把视图里的 `@StateObject` 改 `@State` / `@ObservedObject` 改 `@Bindable` 或 `let`。

### 8.2 不要"每个 View 配一个 ViewModel"

2020 年的 SwiftUI 教程很多教 "View + ViewModel" 一一对应,这是 React → Redux 时代的体感投影。**SwiftUI 的 View 本身已经是 V + VM 合并角色**,再硬塞 VM 等于多写一层。Apple 自己的 sample code 在 2024 年起几乎没有显式 ViewModel,而是"`@Observable` Store 一个或几个 + 视图直接调用"。

**Store 的合理粒度**:
- 一个屏幕复杂的话,可以有自己的 `@State private var ... = SomeStore()`,但通常不必。
- 跨屏幕共享的状态(用户、设置、笔记列表)集中到 1-3 个 root level store,通过 `@Environment` 注入。
- **不要每个 View 都配 Store**——大多数 View 用 `@State` 局部状态就够了。

### 8.3 不要在 SwiftUI 视图层用 Combine 当主轴

```swift
// ❌ 不要这样
final class Vm: ObservableObject {
    @Published var results: [Item] = []
    private var cancellables = Set<AnyCancellable>()
    
    init() {
        $query
            .debounce(for: 0.3, scheduler: DispatchQueue.main)
            .removeDuplicates()
            .flatMap { api.search($0) }
            .receive(on: DispatchQueue.main)
            .sink { self.results = $0 }
            .store(in: &cancellables)
    }
}
```

Combine 在 SwiftUI 状态层已经被 `@Observable` + async/await 替代:

```swift
@Observable
@MainActor
final class SearchStore {
    var query = ""
    var results: [Item] = []
    
    private var debounceTask: Task<Void, Never>?
    
    func search(_ newQuery: String) {
        query = newQuery
        debounceTask?.cancel()
        debounceTask = Task {
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            results = (try? await api.search(query)) ?? []
        }
    }
}
```

Combine 只在桥接老 API 时还有位置:`NotificationCenter.default.publisher(for:)`、`Timer.publish(every:)`、`KVO.publisher(for:)`。这种**桥接点**用 Combine 转 AsyncSequence,然后切到 async/await 主流程:

```swift
let stream = NotificationCenter.default.notifications(named: .didEnterBackground)
for await _ in stream {
    await store.persist()
}
```

---

## 九、@Observable 字段级追踪的"看不见的边界"

字段级追踪很强,但有几个边界要知道:

1. **依赖按 keyPath 跟踪**——`store.notes` 是一个依赖,`store.notes.first?.title` 也算依赖 `store.notes` 这个整体。改 `notes[0].title` 触发 `notes` 的 setter,所有读过 `notes` 的视图都收到通知。所以**读字段的粒度决定重渲染范围**。
2. **computed property 触发的是底层字段的依赖**——`var count: Int { notes.count }`,读 `count` 时 SwiftUI 注册的是对 `notes` 的依赖,改 `notes` 时 `count` 的读者全部重算。
3. **嵌套 `@Observable` 不自动追踪嵌套字段**——`store.subStore.x` 算两次访问:`subStore` keyPath + `x` keyPath。两个都需要 access,但 SwiftUI 会正确处理这种链式访问。
4. **数组 / 字典是值类型**——改数组元素等于换了整个数组,所有读这个数组的视图重算。这是值语义的特性,通常没问题(SwiftUI diff 后会发现大多数行没变,渲染层不会真重画)。

---

## 十、踩坑

1. **`@Observable` 类继承 `ObservableObject`**——两者不能混用,纯 `@Observable` class,删掉 `ObservableObject`。
2. **`@StateObject` 还在用**——`@Observable` 时代用 `@State` 持有 store,语义完全一致,但更通用。
3. **`@Published` 还留着**——`@Observable` 宏会替每个 stored property 加追踪,`@Published` 多余且会冲突。
4. **`@Observable` 类不标 `@MainActor`**——store 通常给 UI 用,标 `@MainActor` 让你不用每个方法都标。
5. **从 `@Environment` 取 store 后想直接 `$store.x`**——不行,要先在 body 里 `@Bindable var store = store` 一下。
6. **多个 `@Observable` Store 通过 `@Environment` 注入**——多个就要多个 `.environment(...)` 调用,每个对应一个类型。
7. **`@Observable` 实例放在 struct 字段里**——struct 是值类型,赋值是复制,内部 class 引用还是同一个,但 SwiftUI 不会重新建立依赖关系。`@Observable` 必须 class,且通常通过 `@State` / `@Environment` 持有。
8. **想用 `@Observable` 做"全局单例"**——技术上能做,但是反模式。SwiftUI 的设计是 `@Environment` 注入,作用域可控、测试可换。单例只在系统极底层(Keychain 包装、Logger)出现。
9. **用 `@Published` 计算属性触发刷新**——`@Published var x: Int` 是 stored property,computed property 不能加 `@Published`。`@Observable` 没这限制——computed 自动跟着底层 stored 走。
10. **`@Observable` Store 太大,所有视图都依赖一个 Store**——字段太多时拆成几个相关的小 Store,每个独立 `@Environment` 注入。比如 `UserStore`、`NotesStore`、`SettingsStore` 分开。

---

下一篇 `07-布局Stack与Grid.md`,讲 SwiftUI 的 Layout proposal-response 心智、`HStack` / `VStack` / `ZStack` / `Grid` / `LazyVStack` / `LazyHGrid` / 自定义 `Layout` 协议、`Spacer` 的真实行为、`fixedSize` / `frame` / `padding` 影响布局的方式、与 Flutter Flex / Web Flex 的对照。
