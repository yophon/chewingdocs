# 26 SwiftUI 性能:重渲染追踪、`_printChanges` 与列表优化

NotesIsland 跑到第 26 篇时,SwiftData 里已经塞了上千条带图片、带 OCR 文本的笔记。在 iPhone 13 Pro 上滚动笔记列表,首屏还行,滚到第 300 条左右开始掉帧,FPS 从 120 掉到 70。打开 Instruments 一看,Time Profiler 火焰图最高的山头不在网络、不在解码,而是在 `View.body` 自己——这才是 SwiftUI 性能问题最典型的样子。

本篇只解决一个问题:**当 SwiftUI 视图重计算变成性能瓶颈时,如何在 Swift 6 / iOS 18 / `@Observable` 的新世界里,精确定位"是谁在让谁重算"**。我们不重复 React renderer 那套 diff 心智,SwiftUI 的重渲染模型和 React **本质不同**,本篇会一直提醒你这个差异。

---

## 一、机制定位:SwiftUI 重计算 ≠ UIKit 重渲染 ≠ React 重渲染

很多从 Web 转 iOS 的开发者,第一反应是把 SwiftUI 当 React 来理解:

> "组件 props 变了,组件重新渲染,虚拟 DOM diff,真实 DOM 局部更新。"

这个心智在 SwiftUI 里**部分对、部分严重错**。SwiftUI 的执行模型有三个核心阶段,缺一不可:

```
1. body 重计算 (View struct 重新生成)         ← 廉价,可频繁发生
2. View diff  (SwiftUI 比对新旧 View tree)    ← 框架内部,你看不见
3. 渲染层更新 (UIKit / RenderObject 实际刷新) ← 昂贵,SwiftUI 努力最小化
```

| 阶段 | UIKit 类比 | React 类比 | 性能成本 |
| --- | --- | --- | --- |
| body 重计算 | 不存在(UIKit 没有 body)| 等同 render() | 视 body 大小,通常 < 1ms |
| View diff | 不存在 | 虚拟 DOM diff | < 1ms,SwiftUI 走 PoT(Protocol of Type) reflection |
| 渲染层更新 | `setNeedsLayout` / `setNeedsDisplay` | DOM commit | ms 级,这才是真正的卡顿源 |

**关键事实**:SwiftUI 的 body **被频繁调用是正常的、设计上预期的**。一个 60 FPS 的滚动列表里,每一帧都可能有几十个 body 被调用,但只要 diff 出来"没变化",渲染层根本不会动。**性能问题不在 body 被调用,而在 body 被调用之后真的引起了渲染层变化**——或者 body 本身做了 O(n) 的脏活(比如循环、JSON 解析、磁盘 IO)。

旧 iOS 教程(SwiftUI 1.0 / iOS 13 时代)的优化建议常常南辕北辙:

- "用 `EquatableView` 包一切"——错,只在 body 真的很贵时才需要;
- "拆 ViewModel 减少订阅范围"——这是 `ObservableObject + @Published` 时代的优化,**到 `@Observable` 时代 SwiftUI 已经做了字段级追踪**,你拆了反而徒增 boilerplate;
- "用 `.id(_:)` 强制刷新"——这是性能杀手,会丢掉所有 Element 状态;
- "把 `@State` 放到顶层 ViewModel 集中管理"——错,`@State` 设计就是给视图私有的。

本篇我们要做的具体事情是:**给 NotesIsland 的笔记列表挖出真正的重渲染源,用 `Self._printChanges()` 看清谁在改谁,再针对性优化**。

### SwiftUI 重计算的传染规则

理解 SwiftUI 性能,核心是搞清楚"谁会让谁重算"。三条铁律:

1. **父视图重算 → 子视图重算(默认)**:除非子视图被 SwiftUI 识别为"输入未变",否则子也会跟着重算。但 SwiftUI 的输入比较是结构性的(View struct 字段逐个对比),**值类型小、易比较的视图,SwiftUI 自动跳过**。
2. **观察的状态变 → 所有观察者重算**:`@State` / `@Observable` / `@Environment` / `@AppStorage` 的任一变化,都会让"在 body 里读过这些值的视图"重算。注意是**读过**,不是**持有过**——这是字段级追踪的精髓。
3. **`@Environment` 改变 → 树内所有读取者重算**:`.environment(\.colorScheme, ...)` 这种变化会触发整棵子树扫描,因为不知道谁读了。**慎用大颗粒 environment**(比如把整个 user 对象塞进去),颗粒越大,触发面越大。

NotesIsland 里曾出现一个典型坑:把 `@Observable AppSettings` 全树注入,某个边角设置改一下,整棵 200 行视图都收到通知。修复方案是:**把 settings 切成"主题"、"账号"、"同步策略"三个 @Observable 子对象,各自独立注入**,这样改主题不会触发账号视图重算。这是"拆 ViewModel"在 `@Observable` 时代仍有价值的少数场景之一——**按 environment 注入颗粒拆**,不按"被谁观察"拆。

---

## 二、Apple 平台心智:Observation、依赖图与 `_printChanges`

### 2.1 Observation 框架的字段级追踪

iOS 17 引入的 `@Observable` 宏不是 `ObservableObject + @Published` 的语法糖,**它是另一套机制**。

`ObservableObject` 时代:

```
@Published var foo  →  整个 ObservableObject 发出 objectWillChange
                   →  所有 @ObservedObject 持有者重算 body
                   →  即使 body 里只读了 bar,没读 foo,也重算
```

`@Observable` 时代(iOS 17+):

```
@Observable class VM { var foo; var bar }
View body 里读了 vm.bar → 注册 bar 的依赖
View body 没读 vm.foo  → foo 改了视图不重算
```

字段级追踪的实现是基于 Swift 的 `Observation.withObservationTracking` API,SwiftUI 在每次 body 执行前后调用一次,**自动记录这次 body 读了哪些字段**;之后只要这些字段中任一改变,SwiftUI 才把这个视图标记为 dirty。

这意味着旧教程的"拆 ViewModel 优化"在 `@Observable` 时代是**反模式**——你拆得越细,SwiftUI 自动管理的依赖图反而越难看清。

### 2.2 SwiftUI 视图的标识(Identity)与 `id(_:)` 的代价

SwiftUI 用两件事识别一个视图实例:

1. **结构身份(Structural Identity)**:在父视图 body 里的"位置",由 ViewBuilder 的 conditional / ForEach 结构决定;
2. **显式身份(Explicit Identity)**:用 `.id(_:)` 或 `ForEach(_: id:)` 给定的 hashable。

`.id(_:)` 的语义是:**"这是一个新视图"**。

```swift
Text(note.title).id(note.title)   // 标题一变,SwiftUI 整个把这个 Text 删掉再建一个
```

这意味着所有 `@State`、`.transition`、`matchedGeometryEffect`、动画进度、scroll position 都被**重置**。在长列表里滥用 `.id(_:)` 是 SwiftUI 性能崩溃最常见的源头——你每改一次 title,SwiftUI 不止 diff,还把渲染层节点炸了重建。

### 2.3 `Self._printChanges()`:官方调试接口

SwiftUI 在 iOS 15 引入了一个**非公开但官方在 WWDC 演讲里多次使用**的诊断 API:

```swift
var body: some View {
    let _ = Self._printChanges()      // 在 body 第一行
    Text(note.title)
}
```

效果是每次这个 view 的 body 被 SwiftUI 调用时,在 console 打印**变化原因**,比如:

```
NoteRowView: @self changed.
NoteRowView: _note changed.
NoteRowView: @identity changed.
```

四种典型输出含义:

| 输出 | 含义 |
| --- | --- |
| `@self changed` | View struct 本身的某个字段(非 property wrapper)变了 |
| `_someProperty changed` | 名为 `someProperty` 的字段(通常是 `@State` / `@Binding` / `@Observable` 引用)变了 |
| `@identity changed` | 这个视图被识别成了"新视图"(`.id(_:)` 触发或结构变化)|
| 空输出 | body 被调用了,但 SwiftUI 也不知道为什么——通常意味着结构性 diff 触发 |

**注意**:`_printChanges()` 以下划线开头,是私有 API,不能上 App Store。**生产环境必须用 `#if DEBUG` 包起来**。

### 2.4 EquatableView 与 `.equatable()`

如果你的 View 实现了 `Equatable`,SwiftUI 在 diff 时会先调你的 `==`,相等就跳过 body 调用:

```swift
struct ExpensiveRow: View, Equatable {
    let note: Note
    static func == (l: Self, r: Self) -> Bool {
        l.note.id == r.note.id && l.note.updatedAt == r.note.updatedAt
    }
    var body: some View { /* 假设很贵 */ }
}
```

或者在使用处:

```swift
ExpensiveRow(note: n).equatable()
```

**什么时候用**:body 自身计算贵(O(n) 循环、大字符串拼接、复杂布局)且父视图频繁重算时。**反例**:对所有视图无脑套 `.equatable()`,反而让 SwiftUI 多跑一个 `==`,得不偿失。

### 2.5 `LazyVStack` vs `VStack`:列表的核心选择

```
VStack       → 所有子视图一次性进入视图树,body 都被调用,布局全算
LazyVStack   → 子视图按需创建,仅可见区域 + 缓冲区进入视图树
```

**笔记列表必须用 LazyVStack 或 List**,VStack 一次性 1000 行内存就炸了。但 LazyVStack 也有代价:每次行进出可视区,SwiftUI 都会做一次 onAppear / onDisappear / 视图状态析构与重建,**所以行内的 `@State` 不能假设跨滚动周期保留**。

### 2.6 List、ScrollView+LazyVStack、ForEach 的隐性差异

很多 SwiftUI 教程把这三者当成可互换的列表方案,实际差异非常大:

| 容器 | 底层实现 | 内置能力 | 性能 | 适用场景 |
| --- | --- | --- | --- | --- |
| `List` | 包装 UIKit `UITableView` / `UICollectionView` | 自带分组 / 滑动删除 / 编辑模式 / Section 头脚 | 1000+ 行最稳 | 设置页、长数据列表、需要系统手势 |
| `ScrollView + LazyVStack` | 纯 SwiftUI 自绘 | 完全自定义布局 | 100-500 行性能优于 List | 自定义视觉、卡片流 |
| `ForEach`(裸用)| 不是容器,只是视图 builder | 无 lazy | 子视图全部实例化 | 仅在 100 行以下的小列表使用 |

NotesIsland 的笔记列表用 `List`,因为我们需要侧滑删除、置顶、系统级 swipe action;但如果是首屏的"最近笔记卡片流",用 `ScrollView + LazyHGrid` 更合适——你需要自定义卡片宽高比。

### 2.7 ViewBuilder 中的隐式条件代价

```swift
var body: some View {
    VStack {
        Text(title)
        if showDetail {
            Text(detail)
        }
    }
}
```

`if showDetail` 在 SwiftUI 里是**结构性的**:它把 VStack 的 children 类型从 `(Text)` 变成 `(Text, _ConditionalContent<Text, EmptyView>)`。每次 `showDetail` 切换,**SwiftUI 视为这两个分支结构身份不同**——切到 true 时新建 Text,切到 false 时销毁 Text。如果 detail 里包含 `@State` 或 ScrollView,这些状态都丢。

**对比**:用 `opacity` / `.frame(height:)` 改可见性,视图实例保留,只是不显示;状态不丢。心智:**条件用于"完全替换"语义,opacity / frame 用于"显隐"语义**。

### 2.8 修饰符顺序的隐性性能影响

SwiftUI 修饰符顺序敏感,这是 UI 视觉问题,但**有时也是性能问题**:

```swift
// 写法 A
Image("noteCover")
    .resizable()
    .frame(width: 56, height: 56)
    .clipShape(Circle())

// 写法 B
Image("noteCover")
    .clipShape(Circle())
    .resizable()
    .frame(width: 56, height: 56)
```

A 是先把图片缩到 56x56,再裁圆,只画 56x56 范围的圆;B 是先把原图(可能 1024x1024)裁成 1024x1024 大小的圆形 mask,**画的是一个巨大的圆**,再缩到 56x56——光栅化成本相差几十倍。Time Profiler 会看到 B 写法在 `CGContextDrawImage` 上消耗显著更多时间。

**心智**:**先缩放、再裁剪、最后视觉效果(阴影、模糊)**。NotesIsland 列表里的笔记缩略图必须遵守这个顺序,否则滚动 100 行就开始掉帧。

### 2.9 `drawingGroup()` 与离屏渲染

如果某个视图层级深、包含阴影/模糊/渐变,**单帧绘制 cost 高**,可以加 `.drawingGroup()` 让 Metal 把它栅格化成 bitmap 缓存:

```swift
ComplexBadgeView(note: note)
    .drawingGroup()      // 整块栅格化到一张 bitmap,后续直接贴
```

代价:`.drawingGroup()` 会**断掉一些 SwiftUI 特性**——子视图的动画、accessibility 子元素都不再单独工作。**只在静态、视觉密集的视图上用**。NotesIsland 的笔记封面卡片(包含图片、毛玻璃、标签 chip)适合;笔记 row 这种简单文本布局不需要。

---

## 三、工程实现:给 NotesIsland 笔记列表挖坑、填坑

我们从一个**故意写坏的**笔记列表开始,逐步用 `_printChanges` 找出问题。

### 3.1 反例:一个会卡的笔记列表

```swift
// File: NotesIsland/Features/Notes/NoteListView.swift (BAD version)
import SwiftUI
import SwiftData

// MARK: - Bad List
struct NoteListViewBad: View {
    @Query(sort: \Note.updatedAt, order: .reverse) private var notes: [Note]
    @State private var search = ""
    @State private var selectedID: UUID?

    var body: some View {
        let _ = Self._printChanges()
        ScrollView {
            LazyVStack(spacing: 8) {
                ForEach(filtered) { note in
                    NoteRowBad(
                        note: note,
                        formatter: makeFormatter(),   // ⚠ 每次 body 调用都新建
                        isSelected: selectedID == note.id
                    )
                    .id(UUID())                       // ⚠ 致命:每次都新 identity
                    .onTapGesture { selectedID = note.id }
                }
            }
        }
        .searchable(text: $search)
    }

    private var filtered: [Note] {
        guard !search.isEmpty else { return notes }
        return notes.filter {
            $0.title.localizedCaseInsensitiveContains(search)
            || ($0.extractedText ?? "").localizedCaseInsensitiveContains(search)
        }
    }

    private func makeFormatter() -> DateFormatter {
        let f = DateFormatter()
        f.dateStyle = .medium
        return f
    }
}

// MARK: - Bad Row
struct NoteRowBad: View {
    let note: Note
    let formatter: DateFormatter
    let isSelected: Bool

    var body: some View {
        let _ = Self._printChanges()
        HStack {
            Text(note.title).font(.headline)
            Spacer()
            Text(formatter.string(from: note.updatedAt))
                .font(.caption).foregroundStyle(.secondary)
        }
        .padding(8)
        .background(isSelected ? .blue.opacity(0.1) : .clear)
    }
}
```

跑起来在 console 里你会看到 **滚动一下,console 刷 200 行**:

```
NoteListViewBad: @self changed.
NoteRowBad: @identity changed.
NoteRowBad: @identity changed.
NoteRowBad: @identity changed.
...
```

每个 row 每次都 `@identity changed`,因为 `.id(UUID())` 把它们标记成新视图。Profiler 一跑能看到 60% CPU 都在 SwiftUI 内部布局。

### 3.2 修复版:正确的笔记列表

```swift
// File: NotesIsland/Features/Notes/NoteListView.swift
import SwiftUI
import SwiftData

// MARK: - Good List
struct NoteListView: View {
    @Query(
        sort: \Note.updatedAt,
        order: .reverse
    ) private var notes: [Note]
    @State private var search = ""
    @State private var selectedID: UUID?

    /// formatter 提到 View 外部,避免 body 重算时重建
    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .medium
        return f
    }()

    var body: some View {
        #if DEBUG
        let _ = Self._printChanges()
        #endif
        ScrollView {
            LazyVStack(spacing: 8) {
                ForEach(filtered) { note in
                    // 用 note.id 作 ForEach identity(Note 实现 Identifiable)
                    NoteRow(
                        note: note,
                        formatter: Self.dateFormatter,
                        isSelected: selectedID == note.id
                    )
                    .equatable()
                    .contentShape(Rectangle())
                    .onTapGesture { selectedID = note.id }
                }
            }
        }
        .searchable(text: $search)
    }

    private var filtered: [Note] {
        guard !search.isEmpty else { return notes }
        return notes.filter {
            $0.title.localizedCaseInsensitiveContains(search)
            || ($0.extractedText ?? "").localizedCaseInsensitiveContains(search)
        }
    }
}

// MARK: - Equatable Row
struct NoteRow: View, Equatable {
    let note: Note
    let formatter: DateFormatter
    let isSelected: Bool

    static func == (l: Self, r: Self) -> Bool {
        l.note.id == r.note.id
            && l.note.updatedAt == r.note.updatedAt
            && l.note.title == r.note.title
            && l.isSelected == r.isSelected
    }

    var body: some View {
        #if DEBUG
        let _ = Self._printChanges()
        #endif
        HStack {
            Text(note.title).font(.headline)
            Spacer()
            Text(formatter.string(from: note.updatedAt))
                .font(.caption).foregroundStyle(.secondary)
        }
        .padding(8)
        .background(isSelected ? Color.accentColor.opacity(0.1) : .clear)
    }
}
```

修复了三件事:

1. **去掉 `.id(UUID())`**:`ForEach(filtered)` 用了 `Identifiable` 的 `id`,SwiftUI 自动识别行的稳定身份;
2. **formatter 提到 static**:避免每次 body 调用都 alloc;
3. **NoteRow 实现 Equatable + `.equatable()`**:相同 note + 相同 isSelected 时跳过 body。

现在滚动 console 几乎没输出——`@Observable` 的 Note 字段没变,Equatable 也拦住了不必要的重算。

### 3.3 检测重渲染源:`@Observable` 字段级追踪示例

```swift
// File: NotesIsland/Features/Notes/EditorView.swift
import SwiftUI

// MARK: - View Model
@Observable
final class NoteEditorViewModel {
    var title: String = ""
    var body: String = ""
    var isDirty: Bool = false

    func reset() { title = ""; body = ""; isDirty = false }
}

// MARK: - Title-Only View
/// 只读取 vm.title,vm.body 改动不会触发它重算
struct TitleHeader: View {
    let vm: NoteEditorViewModel
    var body: some View {
        #if DEBUG
        let _ = Self._printChanges()
        #endif
        Text(vm.title.isEmpty ? "未命名" : vm.title).font(.title2)
    }
}

// MARK: - Body-Only View
struct BodyEditor: View {
    @Bindable var vm: NoteEditorViewModel
    var body: some View {
        #if DEBUG
        let _ = Self._printChanges()
        #endif
        TextEditor(text: $vm.body)
    }
}

// MARK: - Composite View
struct EditorView: View {
    @State private var vm = NoteEditorViewModel()
    var body: some View {
        VStack(alignment: .leading) {
            TitleHeader(vm: vm)
            BodyEditor(vm: vm)
        }
    }
}
```

**关键测试**:在 `BodyEditor` 里疯狂打字,console 里 `BodyEditor: _vm changed` 频频出现,**但 `TitleHeader: ...` 完全沉默**。这就是 `@Observable` 字段级追踪的赢面:不用拆 ViewModel,不用写 `Equatable`,框架自动只重算真正读了 `body` 字段的视图。

### 3.4 把昂贵 body 改造成 task

如果你的 row 里真的有重计算(比如要把笔记内容做 Markdown 渲染),不要在 body 里同步算:

```swift
// File: NotesIsland/Features/Notes/RichNoteRow.swift
import SwiftUI

struct RichNoteRow: View {
    let note: Note
    @State private var renderedAttributed: AttributedString?

    var body: some View {
        HStack {
            if let attr = renderedAttributed {
                Text(attr).lineLimit(2)
            } else {
                Text(note.body).lineLimit(2).redacted(reason: .placeholder)
            }
        }
        .task(id: note.body) {
            renderedAttributed = await Self.renderMarkdown(note.body)
        }
    }

    static func renderMarkdown(_ source: String) async -> AttributedString {
        // 在 detached task 或 actor 里跑,别阻塞主线程
        (try? AttributedString(markdown: source)) ?? AttributedString(source)
    }
}
```

`.task(id: note.body)` 让任务跟随 `note.body` 自动重启与取消,body 本身保持轻量。

### 3.5 用 NSCache 做行渲染缓存

如果 row 的渲染依赖一个**确定 input → 确定 output 的纯函数**(比如把日期格式化、把 Markdown 解析、把 Color 计算),可以用 NSCache 全局缓存,避免每次重算:

```swift
// File: NotesIsland/Utilities/RenderCache.swift
import Foundation
import UIKit

// MARK: - Render Cache
final class RenderCache: @unchecked Sendable {
    static let attributed = NSCache<NSString, NSAttributedString>()

    static func attributedString(for source: String) -> AttributedString {
        let key = source as NSString
        if let cached = attributed.object(forKey: key) {
            return AttributedString(cached)
        }
        let attr = (try? NSAttributedString(
            markdown: source,
            options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        )) ?? NSAttributedString(string: source)
        attributed.setObject(attr, forKey: key)
        return AttributedString(attr)
    }
}
```

NSCache 在内存压力时自动淘汰,**不需要你手动 LRU**。这里出现的 `@unchecked Sendable` 是 NSCache 本身就是线程安全的 Foundation 类,做出的合法标注,**不属于"绕过严格并发"反模式**——它是 Apple 文档明确写的 thread-safe 类。注意:**整个 NotesIsland 工程里允许 `@unchecked Sendable` 出现的场景只有这种"老 Foundation 类已经线程安全但缺 Sendable 标注"的桥接,业务代码不允许**。

### 3.6 给列表行加 transaction 控制

SwiftUI 列表的隐式动画经常带来意外性能开销:每次数据微变(比如 OCR 状态从 pending 切到 done),整列都隐式 fade。可以用 `.transaction` 关闭非必要动画:

```swift
NoteRow(note: note, ...)
    .transaction { txn in
        if note.ocrState == .processing {
            txn.animation = nil   // OCR 中不做动画
        }
    }
```

这个技巧在 SwiftUI Instruments 里能看到效果:Core Animation commits 数显著下降。

---

## 四、调参与验收

### 调参清单

| 关键参数 / 决策 | 推荐做法 |
| --- | --- |
| ForEach identity | 用 `Identifiable` 模型(SwiftData 模型默认 Identifiable);**禁止 `.id(UUID())`** |
| Equatable | 只在 body 内有循环 / 大字符串 / 嵌套布局时用;简单 View 不要套 |
| formatter / 颜色 / 复杂 closure | 提到 static 或 module-level,避免 body 重算时重 alloc |
| `@Observable` 类 | 单一类承载相关字段即可,**不要拆 5 个 ViewModel** |
| List vs ScrollView+LazyVStack | 短列表 ScrollView 更可控;>100 行优先用 `List`(系统优化更深) |
| `_printChanges` | 仅 `#if DEBUG`,**不准上 App Store** |
| 列表行内 `@State` | 假设跨滚动会被销毁;持久状态放 `@Observable` ViewModel |

### 手动验收(NotesIsland 列表)

1. **冷启动滚动**:笔记数据库塞 1000 条,滚到列表底部,iPhone 13 上 FPS 应保持 110+(ProMotion);
2. **打印日志验证**:开启 `_printChanges` 后滚动,**稳定状态下日志应几乎不刷**;
3. **搜索响应**:在 search 框输入字符,只有命中过滤变化的行重算,未命中的行无日志;
4. **选中态切换**:点击一行,**只有旧选中行和新选中行打印 `_isSelected changed`**,其他行沉默;
5. **Instruments 验证**:Instruments → SwiftUI 模板 → "View Body Updates" 列,稳定滚动时每帧不超过 5-10 个 update。

### 真机 vs 模拟器

- 模拟器跑 SwiftUI Instruments 模板**不准**——模拟器本质是 macOS 应用,没有真机的 GPU/CPU 调度模型;
- 性能问题必须**真机 + Release 模式**(`-O` 优化)下测;Debug 包(`-Onone`)上 SwiftUI 慢 5-10 倍是正常的;
- `_printChanges` 在 Release 包会被编译器优化掉(`#if DEBUG` 拦截),不会影响线上性能。

### Instruments SwiftUI 模板的关键列

iOS 16+ 引入了专门的 **SwiftUI Instruments 模板**,关键指标:

- **View Body**:每个 View 的 body 调用次数 / 总耗时 — 找出"被重算最多"的视图;
- **View Properties**:property 变化触发的源头 — 与 `_printChanges` 互补,可视化;
- **Core Animation Commits**:实际提交到渲染层的次数 — body 调用 ≠ 渲染层更新,这个数字才是真卡顿源。

### 性能优化的实战流程

NotesIsland 团队定下的"性能问题诊断 SOP",任何掉帧 issue 走以下五步:

1. **复现并量化**:在真机 + Release 包上稳定复现,用 `OSSignpost` 或秒表量化(比如"从 search 输入到列表更新平均 80ms");
2. **加 `_printChanges` 排查 body 频率**:DEBUG 包下观察 console,如果某个 row 在稳定状态仍刷日志,定位到具体属性来源;
3. **Instruments SwiftUI 模板验证**:Record 录制可复现路径,看 View Body / Core Animation 两个 track;
4. **Time Profiler 找耗时函数**:如果 body 调用频率合理但仍慢,说明 body 内有同步重计算,Time Profiler 找出真正占 CPU 的函数;
5. **修复后回归量化**:再录一次,确认指标降到目标值,**用 OSSignpost 标记里 begin/end 的时间戳做对比**。

这个 SOP 比"凭感觉优化"高效得多——很多人在"是不是要拆 ViewModel"、"要不要套 Equatable"上纠结半天,实际跑一次 Instruments 就知道根因在哪里。

### 性能预算的设定

成熟工程会给关键路径设定**性能预算**(performance budget):

| 路径 | 预算 | 不达标处理 |
| --- | --- | --- |
| 冷启动到首屏可交互 | < 300ms(iPhone 13+)| 阻止合并 |
| 列表滚动 Scroll Hitch | < 1% | 必须修复 |
| 笔记详情进入动画 | < 16ms 单帧 | warn,允许合并但要 tracking |
| 搜索框输入到列表更新 | < 50ms | warn |
| OCR 完成到 row 状态更新 | < 100ms | info |

CI 跑 UI Test 时用 `XCTOSSignpostMetric` 自动量化这些指标,**回归超过 10% 就让 PR 失败**。这是把"性能"从"凭感觉"变成"可测试"的关键工程实践。

---

## 五、踩坑:与 Swift 5 / iOS 16 旧教程的差异

### 坑 1:把 `ObservableObject + @Published` 心智搬过来

旧教程:"用一个大 ViewModel 撑全 App,所有视图 `@ObservedObject` 进来。"

到 `@Observable` 时代仍然这么写不会报错,但**性能模型完全错了**:

- `ObservableObject` 改任意 @Published 会触发所有 `@ObservedObject` 持有者重算;
- 旧教程的"拆 ViewModel"是为了规避这个粗粒度,但在 `@Observable` 下框架已经字段级追踪,**你拆 ViewModel 反而把简单逻辑切碎,可读性下降**。

**正确做法**:`@Observable` 模型组织按业务领域,不按"被谁观察"来拆。

### 坑 2:无脑套 `EquatableView`

旧 SwiftUI 1.0 教程里有"所有视图都用 EquatableView 包一层"的偏方。这在 SwiftUI 2.0+ 已经过时:

- SwiftUI 内部 diff 已经做了大量优化,普通视图 `==` 几乎免费;
- 你写 Equatable 的 `==` 实现错(漏字段)反而引入 UI 不更新的隐蔽 bug;
- **只在 body 自身贵时才用**。

### 坑 3:`.id(_:)` 当成"强制刷新"按钮

最常见的反模式是:

```swift
ForEach(items) { item in
    Row(item: item).id(item.updatedAt)   // ⚠
}
```

意图是"updatedAt 变了刷新一下",实际效果是**每次 updatedAt 变化,Row 整个被销毁重建**,内部 `@State`、动画、scroll 位置全丢。

正确做法:用稳定的 `item.id`,让数据驱动 body 自身的内容变化。

### 坑 4:在 body 里 print 调试

```swift
var body: some View {
    print("rendering \(note.id)")        // ⚠
    return HStack { ... }
}
```

iOS 18 的 ViewBuilder 不接受顶层 statement,会编译报错。要用:

```swift
var body: some View {
    let _ = print("rendering \(note.id)")
    HStack { ... }
}
```

或者直接用 `Self._printChanges()`,**官方手段且更准**。

### 坑 5:认为 `LazyVStack` 万灵药

`LazyVStack` 只解决"屏外视图不创建"的问题,但屏内还是按 body 重算正常算。如果你的 row body 本身慢(比如里面跑 Markdown 解析、JSON decode),`LazyVStack` 帮不上忙——还是要把慢操作搬到 `.task` / actor。

另外 `LazyVStack` 与 `ScrollView` 配合时,**不会复用 row 实例**,只是延迟创建。一旦滚出屏幕,row 会真的析构;再滚回来,会重新创建一个新 row + 新 `@State`。如果 row 里有需要跨滚动保留的状态,**放到 ViewModel,别放到行内 `@State`**。

### 坑 6:把 Combine 混进来

旧 SwiftUI 教程把 Combine `@Published` 链 + `onReceive` 作为"标准做法":

```swift
.onReceive(vm.$count) { c in ... }
```

到 `@Observable` 时代,Combine 不必要——直接在 body 里读 `vm.count` 即可,SwiftUI 自动追踪。混用 Combine 反而会引入两套订阅机制,debug 时痛苦。**Combine 仅在 Foundation 桥接处(Timer / Notification / URLSession publisher 等)保留**,业务层不用。

### 坑 7:iOS 18+ `onScrollGeometryChange` 与 `_printChanges` 互相干扰

iOS 18 引入的 `onScrollGeometryChange(for:of:action:)` 在滚动时高频触发回调。如果你在回调里改了 `@State`,会触发 body 重算 → `_printChanges` 在滚动时刷屏 → 误以为有性能问题。

**正确做法**:`onScrollGeometryChange` 的 action 里把高频值丢进一个 actor 或 throttle 一下,**不要直接写 `@State`**。

### 坑 8:把 `body` 内的局部变量当性能开销

新人看到 body 里写:

```swift
var body: some View {
    let title = note.title.uppercased()       // 这里会不会卡?
    let subtitle = formatter.string(from: note.date)
    return VStack {
        Text(title)
        Text(subtitle)
    }
}
```

担心 `uppercased()` 每次 body 都跑。**实际**:body 本身就是廉价计算入口,微小的字符串处理基本没成本,**不要为了"优化"把它们提到 `@State` 缓存**,反而引入状态同步问题。**真正的优化点是**:body 里循环 1000 次、调用网络、解 JSON、渲染 Markdown,这些才该提到 task 或 actor。区分原则:**body 内的同步代码总耗时 < 1ms 不必管,> 5ms 必须挪走**。

### 坑 9:`@State` 用错引用类型

```swift
@State private var heavyObject = HeavyImageProcessor()   // ⚠
```

`@State` 设计用于值类型;放一个引用类型进去,SwiftUI 不会重建它(因为它的"地址"不变),但会让 SwiftUI 的 diff 逻辑陷入混乱——什么时候这个 `heavyObject` 算"变了"?Swift 6 严格并发模式还会因为 `HeavyImageProcessor` 不是 `Sendable` 而拒绝编译。

**正确做法**:引用类型用 `@Observable` 包装,持有用 `@State private var vm = ViewModel()`(`@Observable` 类配合 `@State` 是官方推荐的视图本地引用持有方式),共享用 `@Environment`。

### 坑 10:把 `@Observable` 类型当 struct 传递

`@Observable` 宏只能用于 class。如果你把它修饰在 struct 上,编译报错。心智上要明白:**字段级追踪的实现依赖引用语义**(在 setter 里通知观察者),值类型做不到。

反过来,**model 数据**(SwiftData 的 `@Model` 类)虽然是 class,但因为它本身就实现了 Observation,**直接在 View 里读写就能字段级追踪**,不需要再包一层 `@Observable`。NotesIsland 里 `Note` 类就是这样,View 直接 `note.title = "..."` 即可。

### 坑 11:盲目相信 `@Observable` 自动追踪一切

`@Observable` 的字段级追踪基于 Swift 的属性观察机制。**只追踪 `var` 属性,不追踪 `let`、`computed property`(不带显式存储)、`static`、`lazy`**。如果你定义:

```swift
@Observable
final class Vm {
    var raw: [Int] = []
    var sorted: [Int] { raw.sorted() }    // computed,不存储
}
```

View 读 `vm.sorted` 时,Observation 会自动追踪到底层 `vm.raw`(因为 computed 内部读了 raw)。但如果是更复杂的 lazy 缓存:

```swift
@Observable
final class Vm {
    var raw: [Int] = []
    @ObservationIgnored private var _cache: [Int]?
    var sorted: [Int] {
        if let c = _cache { return c }
        _cache = raw.sorted()
        return _cache!
    }
}
```

`@ObservationIgnored` 这层缓存不会触发 View 更新,**但 raw 改了 View 仍能拿到新 sorted**——因为 SwiftUI 追踪的是 raw。如果你需要某些字段对 View 透明,**用 `@ObservationIgnored`**,不要靠"反正它不是 var"想糊弄过去。

### 坑 12:Geometry Effect 与 matchedGeometryEffect 的代价

`matchedGeometryEffect`(共享元素动画)虽然是 SwiftUI 的高光功能,但**滥用会导致整棵子树重渲染**:

- 共享元素的"源"和"目标"必须在同一 GeometryGroup / View 内才工作;
- SwiftUI 需要在每一帧计算源和目标的几何信息,**这是真实的 layout 工作**;
- 列表里每行都给 `matchedGeometryEffect` 是性能杀手,只在"详情进入"那一帧生效即可。

NotesIsland 笔记列表的封面图过渡到详情时用了 matchedGeometryEffect,但只在被点击的那一行启用,**其他行不参与**——这是通过 `if let selected, note.id == selected.id` 条件控制实现的。

### 坑 13:错把 `body` 计算性能问题归因到 SwiftData `@Query`

SwiftData 的 `@Query` 默认在每次 SwiftData 上下文变化时自动重新查询,**这个查询本身是异步的、SwiftData 内部缓存的,几乎没成本**。新人看到笔记列表卡顿,第一反应是"是不是 Query 跑得慢",其实 99% 不是——是 row 内部做了贵活。

排查顺序:**先看 row body 是否被重复调用** → **如被重复调用就找触发源** → **如未重复调用但 row body 内部慢就剖析慢函数** → **以上都不是再怀疑 Query 自身**。Query 自身慢的情况只在数据量 >10000 条 + 复杂 predicate 时才需要警惕,改用 `FetchDescriptor` 手写或者 `@Query(filter:sort:)` 加 NSPredicate 优化。

### 坑 14:误用 `Task` 在 body 内 detached

```swift
var body: some View {
    VStack { ... }
        .onAppear {
            Task.detached {                    // ⚠
                let data = await loadData()
                ...
            }
        }
}
```

`Task.detached` 脱离了视图生命周期管理,**视图消失 task 不会自动取消**。如果视图重建几次,你就有几个孤儿 task 在跑。

**正确做法**:用 `.task { }` modifier 而不是 `.onAppear` + `Task`。`.task` 自动跟随视图生命周期,出屏自动取消。除非你真的需要"视图消失后任务也要继续"(比如后台保存),否则**永远用 `.task`**。

---

到这里 NotesIsland 的笔记列表已经能在 1000 条数据下保持 120 FPS,搜索过滤、选中态、详情进入都不掉帧。但用户线上反馈"偶发卡顿、闪退",这些是**录制不到日志、复现不了步骤**的问题,只能靠 Instruments + MetricKit + Crash 符号化来定位——这就是第 27 篇的事了。
