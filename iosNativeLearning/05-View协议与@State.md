# View 协议、声明式与 @State

第一篇说过"现代 iOS 是一棵 SwiftUI 视图树",这一篇要拆开这棵树:**`View` 协议长什么样、为什么是 `struct`、`body` 被反复重算时 `@State` 凭什么能保留状态、视图 identity 是什么、什么时候重算便宜什么时候重渲染贵**。

> 一句话先记住:**View 是值类型快照,每次重算 `body` 几乎零成本;`@State` 不存在 struct 里,存在 SwiftUI 框架管理的"存储槽"里,跟着视图的 identity 走。声明式 UI 是 `view = f(state)` 这个等式的工程化——你给 `f`,SwiftUI 替你算 diff。**

---

## 一、声明式 UI 解决的不是"少写代码"

凡是从 React / Flutter / Compose 转过来的人,对"声明式 UI"都有第一感觉:不再 `self.label.text = "x"`,而是 `Text(model.text)`。问题是,**为什么 Apple 在 2019 年决定用 SwiftUI 替换 UIKit 的命令式范式**?把 UIKit 的痛点摆出来才看得清:

1. **状态与界面的双向同步靠手写**:`UILabel` 有 `text` 属性,model 变了得手动写一句 `label.text = newValue`,漏一个就是 stale UI。
2. **视图层级是可变引用**:`addSubview` / `removeFromSuperview` / `isHidden = true`,同一个 view 在生命周期里被各处状态污染,bug 难复现。
3. **DiffableDataSource 之前,`UITableView` "插入第 5 行" 要手算 IndexPath 和动画**。
4. **跨平台共用难**:同一份业务在 iOS / iPadOS / macOS / watchOS / tvOS 要分别画。
5. **KVO / NotificationCenter / delegate 三套订阅模型互不兼容**——状态变更通知没统一抽象。

声明式 UI 的核心承诺只有一句:

> **UI 是 state 的纯函数:`view = f(state)`。**

`state` 变了,你只管告诉框架"现在 state 是什么样",框架自己算出"屏幕该变成什么样"。所有"如何从旧界面变到新界面"的细节,由框架的 diff 算法负责。

SwiftUI 在 Apple 平台落地这套范式时,跟 React / Flutter 做了几个不同的选择:

- **View 是 struct 不是 class**——每帧的视图树是值类型快照,扔了重建几乎零成本。
- **不暴露 VirtualDOM**——框架内部 diff,你看不到 fiber / element 这种中间层。
- **`body` 必须 `some View`,不是 `View`**——opaque return,编译期消除 type erasure 开销。
- **状态用 property wrapper**(`@State` / `@Observable`),不依赖调用顺序——React hooks 那套调用顺序约束在 SwiftUI 不存在。

理解最后一条最关键,这是 `@State` 能跨重建存活的根本。

---

## 二、View 协议四要素

```swift
@MainActor public protocol View {
    associatedtype Body: View
    @ViewBuilder @MainActor var body: Self.Body { get }
}
```

四个要点:

1. **`@MainActor` 协议**——所有 View 默认隔离在 MainActor,view body 里访问 `@MainActor` 类型不需要 await。
2. **`associatedtype Body: View`**——body 也是 View,**递归定义**。叶子 View(`Text`、`Image`、`Color`)的 Body 是 `Never`,代表"不会再 build"。
3. **`@ViewBuilder` 修饰 body**——让你在 body 里直接写 `if-else` / `switch` / 多子视图,编译器在编译期把多个 child 组装成 `TupleView` / `_ConditionalContent`,**没有运行时 type erasure**。
4. **`some View`**——opaque return,调用方只知道"某个 View",编译器知道具体类型。既保留 diff 所需的静态类型信息,又让你不用手写 `TupleView<(Text, Image, ...)>` 这种鬼东西。

```swift
struct WelcomeView: View {
    let name: String
    
    var body: some View {
        VStack(spacing: 12) {
            Text("欢迎,\(name)")
                .font(.title)
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(.green)
        }
    }
}
```

`body` 的真实类型是 `VStack<TupleView<(Text, Image)>>`,但 `some View` 把它对调用方隐藏。SwiftUI 在 diff 时仍然能拿到这个静态类型,从而决定"父视图变化时这个子树要不要重算"。

---

## 三、View 是值类型,意味着什么

```swift
struct NoteRow: View {
    let title: String
    var body: some View { Text(title) }
}
```

每次父视图 build,`NoteRow(title: ...)` 这个 struct 都会**被重新创建**。在 UIKit 思维里这是"销毁一个 view,创建一个 view",听起来昂贵。但在 SwiftUI 里:

- **创建 struct ≈ 几条赋值指令,几乎零成本**;
- 创建出来的新 struct 与上一帧的 struct,**SwiftUI 在内部做结构相等比较**;
- 大部分情况下,只有数据变了的子树会进 diff,绝大多数子树连 `body` 都不被调用。

所以**重要的不是"创建 View 贵不贵",而是 `body` 被求值频率,以及底层渲染对象被重建频率**。

---

## 四、重计算 vs 重渲染:SwiftUI 的两层成本

| 层 | 触发 | 成本 |
| --- | --- | --- |
| **重计算 body**(recompute) | 任何 View 持有的 `@State` / `@Observable` 字段被读且变化 | 廉价:几条赋值 + struct 构造 |
| **重渲染**(re-layout / re-draw) | body 输出的 View 树与上一帧 diff 后真的有差异 | 昂贵:Layout 协议参与 + Metal 命令重录 |

**body 频繁被调用是常态,不要看到 body 重入就紧张**。真正要警惕的是底层渲染对象频繁重建——比如把 `id(_:)` 滥用,导致整个子树每帧被 SwiftUI 认作"不同 identity",从而完全重建。24 篇会用 `_printChanges()` 演示。

> 这一点和 React 的"重渲染优化"思路有微妙差异。React 的 reconciliation 要做完整 VDOM diff;SwiftUI 的 diff 配合 struct 的内存布局做"identity 比较 + 字段比较",快得多。所以**SwiftUI 的优化策略不是"避免 body 调用"(没意义),而是"避免视图 identity 变化"**。

---

## 五、@State:视图私有可变状态的"户口本"

```swift
struct CounterView: View {
    @State private var count = 0
    
    var body: some View {
        Button("\(count)") { count += 1 }
    }
}
```

这一段在初学者眼里像魔法:`CounterView` 是 struct,struct 不可变,`count += 1` 怎么能改自己?

魔法在 `@State` 这个 property wrapper 上:

- `@State` 实际是 `State<Int>` struct,**里面有一个指向 SwiftUI 框架外部存储槽的指针**;
- 这个存储槽的生命周期**与"这一处 View 的 identity"绑定**,而不是与 struct 实例绑定;
- 你写 `count = 1` 实际编译成 `_count.wrappedValue = 1`,即"通过那个外部指针写入存储槽";
- 写入后 SwiftUI 标记该 View 的 identity 为 dirty,下一帧重新调用 `CounterView()` 构造,**但重新 attach 到同一个存储槽上**,读出来还是 1。

所以 `@State` 的核心三条:

1. **`@State` 只属于一个特定的 View identity**,视图首次出现时分配存储槽,视图永久离开时回收(不是临时滚出可视区);
2. **`@State` 必须 `private`**(编译器在 Swift 6 严格模式下会 warn 非 private),因为它代表"这个 View 自己的状态",外部根本拿不到这个存储槽;
3. **不要把 `@State` 用于跨视图共享**——跨视图共享是 `@Bindable` / `@Observable` / `@Environment` 的活,06 篇展开。

---

## 六、视图 identity:决定状态生死的看不见的线

SwiftUI 的"视图 identity"不是简单的"它在树里的位置",而是**类型 + 父链 + 显式 id**的组合。

```swift
// 例 1:两个 View 类型不同,identity 不同
if isLoading {
    ProgressView()
} else {
    NoteListView()
}
// isLoading 切换时,SwiftUI 销毁 ProgressView 创建 NoteListView,
// NoteListView 内的 @State 是新分配的存储槽
```

```swift
// 例 2:类型相同但 id 不同,identity 也不同
ForEach(notes) { note in
    NoteRowView(note: note)
        .id(note.id)
}
// notes 增删时,SwiftUI 按 id 对齐;
// 同一个 id 跨帧存在 → identity 保持,内部 @State 保留
// id 不再出现 → identity 销毁,@State 回收
```

**坑出现在这里**:如果用 `.id(UUID())` 这种**每帧都不同的 id**:

```swift
// ❌ 每次 body 重算都是新 UUID,identity 每帧重置,@State 永远初始值
ProfileView().id(UUID())
```

这会导致 `ProfileView` 内的 `@State` 永远是初始值,因为每帧 identity 都变了。改成稳定的 id(比如对象的真实 id)就对了。

> `id(_:)` 是把双刃剑——正确用能精确控制"什么时候认为这是同一个视图";滥用就把所有重渲染优化全打掉。24 篇会再讲。

---

## 七、@State 的初始化时机

`@State private var count = 0` 这个初始值**只在 View identity 首次出现时使用一次**。后续重建 struct,SwiftUI 看到存储槽里已有值,**不会**用初始值覆盖。

这导致一个常见误解:

```swift
struct DetailView: View {
    let note: Note
    @State var draft: String = ""
    
    var body: some View {
        TextEditor(text: $draft)
            .onAppear { draft = note.body }   // ❌ 第二次进来才同步,首次为空
    }
}
```

如果 `DetailView` 在父视图里通过 NavigationStack push,首次进入时 `draft` 是空字符串,然后 `onAppear` 才把 `note.body` 抄过去——用户能看到一闪而过的空 editor。

正确写法用 `init`:

```swift
struct DetailView: View {
    let note: Note
    @State private var draft: String
    
    init(note: Note) {
        self.note = note
        self._draft = State(initialValue: note.body)
    }
    
    var body: some View { TextEditor(text: $draft) }
}
```

或者用 `@Bindable` + 父视图持有的状态(更推荐,06 篇展开)。

---

## 八、@State 不是状态共享方案

```swift
// ❌ 把 @State 当跨视图共享
struct App: View {
    @State var user: User = User()   // 父
    
    var body: some View {
        VStack {
            HeaderView(user: user)
            ProfileEdit(user: $user)  // 用 Binding 传下去
        }
    }
}
```

技术上能跑,但**违反"@State 只装视图私有状态"的约定**。当 `User` 字段多、改动频繁时,父视图的 body 会跟着 `User` 每次改动重算,整棵子树进 diff(虽然便宜,但浪费)。

正确做法是把"业务状态"提到 `@Observable` 类里:

```swift
@Observable
@MainActor
final class AppStore {
    var user = User()
}

struct App: View {
    @State private var store = AppStore()     // store 本身用 @State 持有
    
    var body: some View {
        VStack {
            HeaderView()       // 通过 environment 拿
            ProfileEdit()
        }
        .environment(store)
    }
}

struct HeaderView: View {
    @Environment(AppStore.self) private var store
    var body: some View { Text(store.user.name) }
}
```

这是 06 篇要展开的"`@Observable` 字段级追踪"。本篇只要记住:**`@State` 是视图自己的状态;一旦需要共享,升级到 `@Observable`**。

---

## 九、与 React useState 对照

| 维度 | React `useState` | SwiftUI `@State` |
| --- | --- | --- |
| 形态 | hook 函数,调用顺序敏感 | property wrapper,声明式 |
| 存储绑定 | 按调用顺序映射到 fiber 槽位 | 按 View 类型 + 父链位置 + identity 映射到存储槽 |
| 是否必须 private | 不强制 | Swift 6 强烈推荐 |
| 跨组件共享 | Context / 状态库 | `@Bindable` / `@Observable` / `@Environment` |
| 重渲染粒度 | hook 所在组件函数全跑一遍 | View 的 body 全算一遍,但 diff 后大多数子树不动 |
| 异步初值 | `useState(() => heavy())` | `@State private var x = heavy()` 只在初始化时执行一次 |
| 条件渲染 | 状态保留(只要 hook 顺序不变) | 类型变 → 状态丢 |

**最大差异**:React useState 依赖**调用顺序**(所以有 hook rules);SwiftUI `@State` 依赖**类型 + 父链位置 + identity**(所以条件渲染会触发"状态丢"是另一类陷阱)。

---

## 十、一个完整例子:草稿编辑器

```swift
import SwiftUI

struct ComposeNoteView: View {
    // 不可变 prop:父传子
    let onSubmit: (Draft) -> Void
    
    // 视图私有状态全部用 @State
    @State private var title: String = ""
    @State private var bodyText: String = ""
    @State private var includesAudio: Bool = false
    @State private var presentingDiscardAlert: Bool = false
    
    private var charCount: Int { bodyText.count }
    private var canSubmit: Bool { !title.isEmpty }
    private var hasUnsavedDraft: Bool { !title.isEmpty || !bodyText.isEmpty }
    
    var body: some View {
        Form {
            Section("标题") {
                TextField("写点什么", text: $title)
                    .textInputAutocapitalization(.sentences)
            }
            
            Section("正文") {
                TextEditor(text: $bodyText)
                    .frame(minHeight: 160)
                Text("\(charCount) 字")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            
            Section {
                Toggle("附加录音", isOn: $includesAudio)
            }
        }
        .navigationTitle("新建笔记")
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("取消") {
                    if hasUnsavedDraft {
                        presentingDiscardAlert = true
                    }
                }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("保存") {
                    onSubmit(Draft(title: title, body: bodyText, hasAudio: includesAudio))
                }
                .disabled(!canSubmit)
            }
        }
        .alert("放弃编辑?", isPresented: $presentingDiscardAlert) {
            Button("放弃", role: .destructive) { /* dismiss */ }
            Button("继续编辑", role: .cancel) { }
        }
    }
}

struct Draft {
    let title: String
    let body: String
    let hasAudio: Bool
}
```

观察几件事:

1. **所有 `@State` 都标 `private`**——视图私有,外面拿不到。
2. **派生值(`charCount` / `canSubmit`)是 computed property,不是 `@State`**——它们是状态的函数,不需要单独存。
3. **`$title` 是 `Binding<String>`**——`$` 是 property wrapper 的 projected value,把 `@State` 的读写能力打包成一个引用。子视图(`TextField`)拿到 binding 后可以反向修改父视图的状态。
4. **`onSubmit` 是 closure prop**——子视图不直接调用父视图的 Store,而是把"想做什么"作为回调暴露出去。这让 `ComposeNoteView` 不依赖任何外部状态层,容易测、容易在 Preview 里 mock。

---

## 十一、踩坑

1. **`@State` 不标 private**——会被 Swift 6 warn,也违反"视图私有"约定。
2. **用 `@State` 持有可变 class 引用**——`@State` 不会追踪 class 内部字段变化(class 引用没变,SwiftUI 觉得状态没变)。可变 class 应该 `@Observable` 包起来。
3. **`@State` 初始值放在 `onAppear` 里赋**——会有"先空再填"的闪烁,改 init 或者用 `@Bindable`。
4. **`if-else` 切两种不同类型 View 期望保留状态**——类型不同 identity 不同,内部 `@State` 一定丢。要保留状态用 `.opacity` / `.hidden()` 不要 `if`。
5. **`.id(UUID())` 强制重建**——会把内部所有 `@State` 全部重置,通常不是你想要的。用稳定 id。
6. **`@State` 在 init 里直接赋值**——会报错。必须用 `_state = State(initialValue:)`。
7. **`$state` 当作普通绑定到任何子视图**——只有接收 `Binding<T>` 参数的子视图才能用。普通函数参数传 `state` 而不是 `$state`。
8. **认为 `body` 调用频繁就是性能问题**——绝大多数 body 调用之后,SwiftUI diff 发现没差异,什么都不会重渲染。真正的问题是无意义的 identity 变化。
9. **`@State` 用在大对象上**——大 struct 每次改字段都触发整体复制(虽然 COW,但触发分配)。大对象搬到 `@Observable` 类里。
10. **`@MainActor` 的 View 里 `Task { ... }` 内访问字段忘了 `await`**——Task body 默认继承调用方 actor,在 view body 里启动的 Task 自动 `@MainActor`,直接访问字段没问题;但 `Task.detached` 就不在 main actor 上,要 `await`。

---

下一篇 `06-Observation与状态流向.md`,讲 `@Observable` 宏的字段级追踪、`@Bindable` 把对象内字段变成 Binding、`@Environment` 的依赖注入、`@Entry` 简化自定义 EnvironmentValues、从 `ObservableObject` 迁移过来的工程取舍。
