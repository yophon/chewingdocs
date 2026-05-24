# 06 SwiftUI View 协议、声明式渲染与 @State

> 系列基线:iOS 18 / Swift 6 / Xcode 16 / SwiftUI;贯穿项目 NotesIsland。
> 心智段(01-05)收尾,本篇起切到 SwiftUI 主线。05 篇我们把"数据竞争被编译器抓"讲完;本篇要回答:**声明式 UI 到底是什么意思,为什么 View 是 struct,`@State` 又凭什么能在每次 `body` 被重算时保留住状态**。

---

## 一、机制定位:声明式 UI 解决的不是"少写代码"

凡是从 React / Flutter / Compose 转过来的人,对"声明式 UI"都有第一感觉:不再 `self.label.text = "x"`,而是 `Text(model.text)`。问题是,**为什么 Apple 在 2019 年决定用 SwiftUI 替换 UIKit 的命令式范式**?把 UIKit 的痛点摆出来才看得清:

1. **状态与界面的双向同步靠手写**:`UILabel` 有 `text` 属性,model 变了得手动写一句 `label.text = newValue`。漏一个就是 stale UI;
2. **视图层级是引用类型 + 可变属性**:`addSubview`、`removeFromSuperview`、`isHidden = true` 同一个 view 在生命周期里被各种状态污染,Bug 难复现;
3. **DiffableDataSource 之前,UITableView 的"插入第 5 行"需要手算 IndexPath 和动画**;
4. **跨平台共用难**:同一份业务在 iOS / iPadOS / macOS / watchOS / tvOS 要分别画;
5. **Combine 与 KVO 弥合得不完整**:`bind(to:)` 永远在 UIKit 边缘磕磕绊绊。

声明式 UI 的核心承诺只有一句:

> **UI 是 state 的纯函数:`view = f(state)`。**

`state` 变了,你只管告诉框架"现在 state 是什么样",框架自己算出"屏幕该变成什么样"。所有"如何从旧界面变到新界面"的细节,由框架的 diff 算法负责。

SwiftUI 在 Apple 平台落地这套范式时,跟 React / Flutter 做了几个不同的选择:

- **View 是 struct 不是 class**:每一帧的 view 树是值类型快照,扔了重建几乎零成本(对照 React 的 VirtualDOM:也是不可变快照,但用对象 + 闭包模拟);
- **不显式提供 VirtualDOM,框架内部隐式 diff**:开发者看不到 fiber / element 这种中间层;
- **`body` 必须是 `some View`,而不是 `View`**:opaque return,编译期消除 type erasure 开销;
- **状态用 property wrapper**(`@State` / `@Binding` / `@Observable` 桥接)**而不是 hook**:不依赖调用顺序,但 SwiftUI 自己得维护"哪个属性属于哪个 view 实例"。

理解最后一条最关键,这是后面 `@State` 能跨 rebuild 存活的原因。

---

## 二、Apple 平台心智:View 协议四要素与重计算/重渲染

### 2.1 View 协议长什么样

```swift
@MainActor public protocol View {
    associatedtype Body : View
    @ViewBuilder @MainActor var body: Self.Body { get }
}
```

四个要点:

1. **`@MainActor` 协议**:所有 View 默认隔离在 MainActor 上,在 View 内部访问 `@MainActor` 类型不需要 await,但跨 actor 调用必须 await(配合 04-05 篇)。
2. **`associatedtype Body: View`**:body 也是 View,递归。叶子 View(`Text`、`Image`、`Color`)的 Body 是 `Never`,代表"不会再 build"。
3. **`@ViewBuilder` 修饰 body**:让你能在 body 里直接写 `if-else` / `switch` / 多子视图,而不需要数组包装。它在编译期把多个 child 组装成 `TupleView` / `_ConditionalContent`,**没有运行时 type erasure**。
4. **`some View`**:opaque return,编译器知道具体类型但调用方不知道,既保留了 diff 所需的静态类型信息,又让你不用手写 `TupleView<(Text, Image, ...)>` 这种鬼东西。

### 2.2 View 是值类型,意味着什么

```swift
struct NoteRow: View {
    let title: String
    var body: some View { Text(title) }
}
```

每次父视图 build,`NoteRow(title: ...)` 这个 struct 都会被**重新创建**。在 UIKit 思维里这是"销毁一个 view,创建一个 view",听起来昂贵。但在 SwiftUI 里:

- 创建 struct ≈ 几条赋值指令,几乎零成本;
- 创建出来的新 struct 与上一帧的 struct 由 SwiftUI 在内部做**结构相等**比较;
- 大部分情况下,只有数据变了的子树会进 diff,绝大多数子树连 `body` 都不被调用。

所以重要的不是"创建 View 贵不贵",而是 **`body` 被求值频率** 与 **底层 RenderObject(Apple 内部 `_GraphValue`)被重建频率** 的差异。

### 2.3 重计算 vs 重渲染:SwiftUI 的两层成本

| 层 | 触发 | 成本 |
| --- | --- | --- |
| **重计算 body**(recompute) | 任何 View 持有的 `@State` / `@Observable` 字段被读且变化 | 廉价:Swift 函数调用 + struct 构造 |
| **重渲染**(re-layout / re-draw) | body 输出的 View 树与上一帧 diff 后真的有差异 | 昂贵:Layout 协议参与、Metal 命令重录 |

记住这两层的区别。**body 频繁被调用是常态**,不要看到 `body` 重入就紧张;真正要警惕的是**底层 RenderObject 频繁重建**(比如把 `id(_:)` 滥用,导致整个子树每帧重建)。第 26 篇会用 `Self._printChanges()` 做演示。

### 2.4 `@State`:视图私有可变状态的"户口本"

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

- `@State` 实际是 `State<Int>` struct,里面有一个 `_location` 指针,指向 **SwiftUI 框架在外部维护的存储槽**;
- 这个存储槽的生命周期与"这一处 View 的 identity"绑定,而**不是**与 struct 实例绑定;
- 你写 `count = 1` 实际编译成 `_state.wrappedValue = 1`,即"通过那个外部指针写入存储槽";
- 写入后 SwiftUI 标记该 View 的 identity 为 dirty,下一帧调用一个新的 `CounterView()` struct,但**重新 attach 到同一个存储槽上**,读出来的 `count` 还是 1。

所以 `@State` 的核心三条:

1. **`@State` 只属于一个特定的 View identity**,在视图首次出现时由 SwiftUI 分配存储槽,在视图永久离开时(不是临时滚出可视区)回收;
2. **`@State` 必须是 `private`**(编译器在 Swift 6 严格并发下会 warn 非 private 的 `@State`),因为它代表的是"这个 View 自己的状态",外部根本拿不到这个存储槽;
3. **不要把 `@State` 用于跨视图共享**——共享是 `@Bindable` / `@Observable` / `@Environment` 的活,本篇结尾会埋下一篇钩子。

### 2.5 与 React `useState` 对照

| 维度 | React `useState` | SwiftUI `@State` |
| --- | --- | --- |
| 形态 | hook 函数,调用顺序敏感 | property wrapper,声明式 |
| 存储绑定 | 按调用顺序映射到 fiber 槽位 | 按 View 类型 + 父链位置 + identity 映射到存储槽 |
| 是否必须 private | 不强制 | 编译期推荐 / Swift 6 严格 |
| 跨组件共享 | Context / 状态库 | `@Bindable` / `@Observable` / `@Environment` |
| 重渲染粒度 | hook 所在组件函数全跑一遍 | View 的 body 全算一遍,但 diff 后大多数子树不动 |
| 异步初值 | `useState(() => heavy())` | `@State private var x = heavy()` 只在初始化时执行一次 |

最大差异:**React useState 依赖调用顺序**(所以有 hook rules);**SwiftUI @State 依赖类型 + 父链位置 + identity**(所以"条件渲染会丢状态"是另一类陷阱)。

---

## 三、工程实现:NotesIsland 的笔记列表与"草稿编辑器"

下面是一段完整、可运行、Swift 6 严格并发通过的代码。NotesIsland 的"新建笔记"页要:

1. 接收一个父传入的"分类",作为不可变 prop;
2. 在视图内部维护"标题"与"正文"草稿(典型的 `@State` 私有状态);
3. 提交时调用一个 `@Observable` 的 service(下一篇展开);
4. 计算字数 / 提交可用性,展示 `body` 被重算时的开销边界。

```swift
// File: Features/Compose/ComposeNoteView.swift
// 基线:Swift 6 严格并发 / iOS 18

import SwiftUI

// MARK: - 不可变 prop:struct 字段,父传子

struct Category: Hashable, Sendable {
    let id: UUID
    let name: String
}

// MARK: - 视图私有状态全部用 @State

struct ComposeNoteView: View {
    let category: Category
    let onSubmit: (Draft) -> Void

    // 视图私有,严格 private
    @State private var title: String = ""
    @State private var body_: String = ""
    @State private var includesAudio: Bool = false
    @State private var presentingDiscardAlert: Bool = false

    var body: some View {
        // 演示:body 被重算时打印一行,Xcode Preview 里能直接看到频率
        let _ = Self._printChanges()

        Form {
            Section("分类") {
                Text(category.name).foregroundStyle(.secondary)
            }

            Section("标题") {
                TextField("写点什么", text: $title)
                    .textInputAutocapitalization(.sentences)
            }

            Section("正文") {
                TextEditor(text: $body_)
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
                    onSubmit(Draft(
                        category: category,
                        title: title,
                        body: body_,
                        hasAudio: includesAudio
                    ))
                }
                .disabled(!canSubmit)
            }
        }
        .alert("放弃这条笔记?", isPresented: $presentingDiscardAlert) {
            Button("放弃", role: .destructive) {
                title = ""
                body_ = ""
                includesAudio = false
            }
            Button("继续编辑", role: .cancel) { }
        }
    }

    // MARK: - 派生:不是 @State,纯计算属性,每次 body 重算时跟着算

    private var charCount: Int {
        body_.count
    }

    private var hasUnsavedDraft: Bool {
        !title.isEmpty || !body_.isEmpty || includesAudio
    }

    private var canSubmit: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

// MARK: - 提交载荷:struct + Sendable,跨 actor 安全

struct Draft: Sendable {
    let category: Category
    let title: String
    let body: String
    let hasAudio: Bool
}

// MARK: - Preview:#Preview 宏取代 PreviewProvider

#Preview("空草稿") {
    NavigationStack {
        ComposeNoteView(
            category: Category(id: UUID(), name: "日常"),
            onSubmit: { draft in
                print("save:", draft.title)
            }
        )
    }
}
```

这段代码里值得逐条留意的点:

- **`let _ = Self._printChanges()` 写在 body 顶部**:SwiftUI 私有调试 API,会在 body 每次被重算时把"哪个属性变了"打印到 Console。**只在 debug 用**,上线前删掉。这是观察重计算频率最直接的工具,第 26 篇会扩展讲。
- **`onSubmit: (Draft) -> Void`**:父传子的回调,**没有** `@escaping`(SwiftUI struct 持有的 closure 默认逃逸),Swift 6 严格并发下推荐让回调走 MainActor 闭包,避免 Sendable 困扰。
- **`@State private var body_`**:为了避开 Swift 关键字 `body` 改名;通常笔记内容字段叫 `content` 更妥当,这里只是示范。
- **`charCount` / `canSubmit` 是 computed property**:不是 `@State`,所以**不参与存储**,只在 body 重算时跟着算一遍。把"派生数据"塞进 `@State` 是最常见的初学者反模式。
- **`presentingDiscardAlert` 也是 `@State`**:`alert(isPresented:)` 需要双向绑定,所以这里给一个本地 `@State` Bool;`$presentingDiscardAlert` 是 `Binding<Bool>`,这是下一篇 `@Binding` 的入门姿势。
- **`Draft` 是 Sendable struct**:回调把它扔到上层后,上层完全可以 `Task { await store.save(draft) }`,值类型 + Sendable 让跨 actor 边界安全无成本。

---

## 四、调参与验收

### 4.1 怎么"看见"重计算

```swift
var body: some View {
    let _ = Self._printChanges()    // 控制台输出 @State / @Observable 哪个变了
    ...
}
```

跑起来在文本框里输入 "你好",Console 会打:

```
ComposeNoteView: _title changed.
ComposeNoteView: _title changed.
```

如果你看到 `@self changed` 或 `@identity changed`,说明视图被整个销毁重建——这就是性能信号,需要排查是不是父级用错了 `id(_:)`、或者把 `ComposeNoteView` 包在了某个会频繁变 identity 的容器里。

### 4.2 验收清单

1. Xcode 16 打开,工程是 `SWIFT_VERSION = 6.0`,文件粘进去零 warning 零 error。
2. 在 Preview 跑起来,输入文本,字数统计实时变化,"保存"按钮在标题为空时灰、有字时亮。
3. 旋转模拟器(或在 Preview 切 Portrait/Landscape):**`@State` 中的草稿内容不应丢**,这验证了 State 与 View identity 绑定。
4. 把 `ComposeNoteView(category: ...)` 包在 `if showCompose { ComposeNoteView(...) }` 里,toggle `showCompose`:**草稿会被清空**,因为视图离场,State 存储槽被回收。这是预期行为。
5. 用 Xcode 16 的 **View Hierarchy Debugger** 或 Instruments 的 **SwiftUI** 模板看 ComposeNoteView 的 update 帧数,在输入文本时只对应文本字段子树重建。

### 4.3 性能旋钮

- **拆分子视图**:把 `Form` 里每个 `Section` 抽成独立的 `private struct SomeSection: View`,SwiftUI diff 时可以只重算变化的 Section。
- **`Equatable` View**:对昂贵 View 实现 `Equatable`,SwiftUI 会用 `==` 跳过未变化的子树重计算。
- **避免 `.id(UUID())` 滥用**:每次 body 重算都生成新 UUID,等于告诉 SwiftUI "这是新视图,整个子树丢掉重建"。这是初学者最容易踩的性能炸弹。

### 4.4 真机 vs Preview

- **Preview** 在 Xcode 内的运行环境是隔离的,某些 Apple 内部状态(系统主题、动态字体)与真机不同。验收 Dynamic Type / 暗色模式时切到真机或模拟器。
- **`#Preview` 宏是 Xcode 15+ 的入门姿势**,替代 Swift 5 时代的 `PreviewProvider`;一个文件可以有多个 `#Preview("name") { ... }`,各自带不同初值。

---

## 五、踩坑:与 Swift 5 / iOS 16 旧教程的差异

### 5.1 `body` 里不要做 I/O / 重计算

`body` 是 SwiftUI 的"纯函数",在每一帧、每一次 state 变化时都可能被调用。在里面写 `try Data(contentsOf:)`、`Date()`、`UUID()` 都是味道不对——这些副作用应当在 `@State` 初值、`.task`、`.onAppear` 里。

### 5.2 `@State` 不要给非私有可见性

```swift
@State var title: String = ""    // Swift 6 警告
@State private var title: String = ""    // 正确
```

`@State` 代表"视图自己的状态",外部能改的话语义已经错了。要跨视图共享请用 `@Binding`(下一篇)或 `@Observable`(07 篇)。

### 5.3 `@State` 的初值必须是字面量或者纯计算

```swift
@State private var items: [Item] = loadFromDisk()  // 反模式
```

这一行不会在每次进入视图时都执行,只在 SwiftUI 首次给该 View identity 分配存储槽时执行**一次**。这意味着:
- `loadFromDisk()` 调用时机不可控;
- 同一个 View 被 SwiftUI 内部复用时,初值不会重跑。

需要在视图出现时拉数据,放进 `.task { }`,把结果赋给 `@State`。

### 5.4 不再用 `NavigationView`、不再用 `PreviewProvider`

- `NavigationView` 在 iOS 16+ 被弃用,**所有新代码必须用 `NavigationStack`**(第 13 篇主篇);
- `PreviewProvider` 是 Swift 5 形态,Xcode 15+ 用 `#Preview` 宏;
- `ObservableObject + @Published` 是 Swift 5 形态,Swift 6 + iOS 17+ 用 `@Observable`(07 篇);
- `ForEach(items, id: \.self)` 一般写成 `ForEach(items)`(items 元素 `Identifiable`),节省心智。

### 5.5 不要在 View 上额外加 `@MainActor`

```swift
@MainActor                    // 多余:View 协议已经 @MainActor
struct MyView: View { ... }
```

这是从其他语言带过来的强迫症行为,Swift 6 编译器看到时不会报错,但会触发隐微的歧义警告。把 `@MainActor` 留给 ViewModel / Service / Manager 这一类非 View 的类。

### 5.6 `body: some View` 不要写成 `body: AnyView`

`AnyView` 是 type erasure,**会丢失 SwiftUI diff 的静态类型信息**,导致整个子树每次都被当做"全新"处理,性能塌方。只有在**真的**返回类型每次不同(比如根据后端动态切组件)时才用 `AnyView`。99% 的条件渲染用 `@ViewBuilder` + `if-else` 就够了。

### 5.7 `@State` + struct 的 mutating 陷阱

```swift
@State private var draft = Draft(title: "", body: "")
Button("加字") { draft.title += "!" }     // 工作
```

这是合法的,因为 `@State` 的 setter 会把"赋一个新 struct"翻译成"写存储槽"。但**不要**在 ViewModel 类型里这么写——值类型 mutating 跨 actor 是另一个坑,留给 07 篇 `@Observable` 时讲。

### 5.8 SwiftUI 在 iOS 19+ 的小变化

iOS 19 给 SwiftUI 引入了一组新的视觉系统(Liquid Glass)和组件,以及部分 Layout 协议的扩展。本篇主线代码不依赖任何 iOS 19+ API,所有示例在 iOS 18 真机 + 模拟器都通过。涉及 iOS 19+ 的新组件留到第 11(动画)/ 22(Widget)篇单独标注。

---

## 六、一句话总结

```text
View          = 描述"这一帧屏幕该长什么样"的不可变值类型
body          = 纯函数,被频繁调用,要廉价、无副作用
@State        = 视图私有可变状态的存储槽,生命周期跟 View identity 走,而不是跟 struct 实例走
重计算 vs 重渲染 = body 被算很正常,Layout/Paint 才是真的成本
```

下一篇,跨视图共享状态的两条主线 —— `@Binding` 的双向绑定与 `@Observable` 的字段级追踪 —— 把 SwiftUI 数据流的另一半补完。
