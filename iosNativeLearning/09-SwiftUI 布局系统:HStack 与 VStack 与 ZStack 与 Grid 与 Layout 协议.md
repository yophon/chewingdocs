# 09 SwiftUI 布局系统:HStack / VStack / ZStack / Grid 与 Layout 协议

前两篇我们把状态层(`@Observable`)和数据流向(`@Binding` / `@Environment` / `@Entry`)钉死了。但 SwiftUI 视图最后是要落到屏幕上一个个像素的——这就要进入它的布局系统。

布局是 SwiftUI 与 UIKit、Flutter、Web Flex 心智差异最大的部分。UIKit 的布局是命令式的(`frame` / `Auto Layout` 约束求解器),Flutter 的布局是 **constraint-down + size-up** 的单次遍历,Web Flex 的布局是浏览器排版引擎按规则解算。SwiftUI 走的是 **proposal-response** 模型:**父视图给子视图一个尺寸建议,子视图返回它真实要的尺寸,父视图再决定怎么放**。这一点跟 Flutter 几乎对偶,跟 UIKit 完全不同。

这一篇把 `HStack` / `VStack` / `ZStack` / `Grid` / `LazyVStack` 的心智、`Layout` 协议入门、与 Flutter Flex / Web Flex 的对照讲透,顺便在 `NotesIsland` 里做一个自定义 `WrapLayout`。

---

## 一、机制定位:布局系统要解决什么

### 1. 三种主流布局心智

| 系统 | 布局方式 | 谁决定尺寸 | 复杂度 |
| --- | --- | --- | --- |
| UIKit | Auto Layout 约束求解 | 求解器同时解所有约束 | O(n²) ~ O(n³),复杂场景慢 |
| Web Flex / Grid | 规则驱动的 reflow | 浏览器按 spec | reflow 易级联,DevTools 难追 |
| Flutter | 单次 constraint-down,size-up | 自上而下传 BoxConstraints,自下而上回 Size | O(n) 单次遍历 |
| SwiftUI | proposal-response | 父向子 `propose(_:)`,子回 `sizeThatFits(_:)`,父再 `place(_:)` | O(n) 单次,与 Flutter 同构但语义反 |

UIKit 的 Auto Layout 在大型列表里会出"墓碑"——所有 cell 在滚动时同时求解约束,CPU 顶到 100%。SwiftUI 直接抛弃了约束求解器,改成 **逐层协商**:每个父视图明确告诉子视图"我能给你多大",子视图明确回答"我想要多大",父视图最后明确放置。

### 2. proposal-response 模型

完整的三段式如下:

```
父 ─ ProposedViewSize ─▶ 子          (我建议你做这么大)
父 ◀─ CGSize sizeThatFits ─ 子        (我实际要这么大)
父 ─ place(at:anchor:proposal:) ─▶ 子 (现在请把你自己放到这里)
```

`ProposedViewSize` 不是硬约束,而是**建议**:子视图完全可以无视它(典型如 `Text` 在没有 `.lineLimit` 时按文字内容自己决定宽度)。`ProposedViewSize` 三种特殊值非常重要:

- `.zero`:父在问"你的最小尺寸是多少"。
- `.infinity`:父在问"你的最大尺寸是多少"。
- 普通有限值:父在问"按这个大小你会变多大"。

举例:`HStack` 在做"分蛋糕"时,会先问每个子视图 `.zero`(最小)和 `.infinity`(最大),知道每个子视图的弹性范围,再根据总宽度分配。

### 3. Stack 的 layout priority

`HStack` / `VStack` 默认按 **layout priority** 分配剩余空间:

```swift
HStack {
    Text("固定").layoutPriority(1)
    Text("弹性的非常长的描述").layoutPriority(0)
}
```

priority 高的先满足自己的最大需求;剩下的给 priority 低的。这是 SwiftUI 取代 Auto Layout `contentHuggingPriority` / `compressionResistance` 的等价物——但只有 **一个数字**,简化得多。

### 4. Lazy 与可见性

`VStack` 是 **eager** 的:1000 个子视图一开始就全部计算 `body` + 布局 + 创建 RenderObject 对等物。`LazyVStack` / `LazyHStack` / `LazyVGrid` 只在子视图进入可见区域时才实例化它的 `body`,**这是大列表性能的硬门槛**。第 26 篇会展开,这里先记规则:

- 列表(可滚动、行数 > 30)用 `LazyVStack` / `List`。
- 表单(固定布局、行数 < 20)用 `VStack` / `Form`。
- 无须可见时按需创建,就别 lazy(会引入懒加载开销)。

### 5. 与 Flutter / Web Flex 对照

| 概念 | SwiftUI | Flutter | Web Flex |
| --- | --- | --- | --- |
| 主轴排列 | `HStack` / `VStack` | `Row` / `Column` | `flex-direction` |
| 交叉轴对齐 | `alignment:` | `crossAxisAlignment` | `align-items` |
| 主轴对齐 | `Spacer` / `.spacing` | `mainAxisAlignment` | `justify-content` |
| 弹性比例 | `.layoutPriority(_:)` | `Expanded(flex:)` | `flex-grow` |
| 自定义布局 | `Layout` 协议 | `MultiChildRenderObjectWidget` | CSS Grid |
| 重叠 | `ZStack(alignment:)` | `Stack(alignment:)` | `position: absolute` |
| 不规则网格 | `Grid` / 自定义 `Layout` | `Wrap` / `CustomMultiChildLayout` | `flex-wrap` / `display: grid` |

**最大差异**:SwiftUI 没有 Flutter 的 `Expanded(flex: 2)` 直接比例分配,要么用 `frame(maxWidth: .infinity)` 让它撑满,要么用 layoutPriority。**这是从 Flutter 转 SwiftUI 最常踩的坑**。

---

## 二、Apple 平台心智

### 1. 核心类型与所属 framework

| 入口 | 所属 framework | 角色 |
| --- | --- | --- |
| `HStack` / `VStack` / `ZStack` | `SwiftUI` | 内建 Stack,基础布局原语 |
| `Grid` / `GridRow` | `SwiftUI`(iOS 16+) | 二维对齐网格,精度高于 LazyVGrid |
| `LazyVStack` / `LazyHStack` | `SwiftUI` | 滚动场景的延迟布局 Stack |
| `LazyVGrid` / `LazyHGrid` | `SwiftUI` | 基于 `GridItem` 数组的网格 |
| `Layout` 协议 | `SwiftUI`(iOS 16+) | 自定义布局容器的标准入口 |
| `ProposedViewSize` | `SwiftUI` | 父视图给的尺寸建议 |
| `ViewThatFits` | `SwiftUI`(iOS 16+) | 多候选布局,选第一个能放下的 |
| `ScrollView` + `.scrollTargetBehavior(.paging)` | `SwiftUI`(iOS 17+) | 分页滚动,内部仍用 Lazy |

### 2. `Layout` 协议的最小契约

`Layout` 是 iOS 16 新增的协议,让你自定义任意布局容器。最小要实现两个方法:

```swift
public protocol Layout: Animatable {
    func sizeThatFits(
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout Cache
    ) -> CGSize

    func placeSubviews(
        in bounds: CGRect,
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout Cache
    )

    // 可选:Cache 用来跨多次 layout pass 复用计算
    associatedtype Cache = ()
    func makeCache(subviews: Subviews) -> Cache
}
```

理解 `Layout` 协议是吃透 SwiftUI 布局的最快路径——**你写一遍自定义 `Layout`,就懂了 `HStack` / `VStack` 在干什么**。

### 3. `Subviews` 是什么

`Subviews` 不是真的子视图实例,而是一个 **代理集合**:`subviews[i].sizeThatFits(.zero)` 才会真正去问那个子视图它的最小尺寸。你可以反复问,但要注意:**问一次代价不小**,在 `placeSubviews` 里别 N² 地遍历。

`subviews[i]` 还可以读 `LayoutPriority`、`LayoutValueKey`(自定义元数据)等属性。后者是把"业务字段"挂到子视图、让父布局读取的标准机制。

### 4. 隔离域:布局是 main actor

SwiftUI 所有布局协议都在 **MainActor** 上跑(`Layout` 协议本身没有显式标注,但其调用上下文必然是主线程的 view tree)。这意味着你的自定义布局 **不能跑重 IO**,要算复杂的可放置区域,缓存在 `Cache` 里、用 `makeCache` 预算好。

---

## 三、工程实现

我们给 `NotesIsland` 落地三个布局案例:

1. **笔记元信息行**:用 `HStack` + `layoutPriority` 让"日期"先满足、"标签"被压缩。
2. **附件缩略图网格**:用 `Grid` 做对齐严格的 3 列网格(用于显示笔记里的图片附件)。
3. **自定义 `WrapLayout`**:做一个能换行的"标签云",这是 SwiftUI 内建没提供、`Layout` 协议大显身手的场景。

```swift
// File: Features/Notes/NoteMetaRow.swift
import SwiftUI

struct NoteMetaRow: View {
    let note: Note
    let tags: [String]

    var body: some View {
        // MARK: HStack 的 spacing 控制子视图间距,alignment 控制交叉轴
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Label(
                note.updatedAt.formatted(date: .abbreviated, time: .shortened),
                systemImage: "clock"
            )
            .font(.footnote)
            .foregroundStyle(.secondary)
            .layoutPriority(1)        // 日期不可压缩

            Divider().frame(height: 12)

            // 标签横向滚不下时被压缩 / 省略号
            Text(tags.joined(separator: " · "))
                .font(.footnote)
                .foregroundStyle(.tertiary)
                .lineLimit(1)
                .truncationMode(.tail)
                .layoutPriority(0)     // 优先牺牲

            Spacer(minLength: 0)        // 把剩余空间吃掉
        }
    }
}
```

```swift
// File: Features/Notes/AttachmentGrid.swift
import SwiftUI

struct AttachmentGrid: View {
    let imageURLs: [URL]

    var body: some View {
        // MARK: iOS 16+ Grid:对齐精度比 LazyVGrid 高,适合小批量(< 100)
        Grid(horizontalSpacing: 8, verticalSpacing: 8) {
            ForEach(Array(imageURLs.chunked(into: 3).enumerated()), id: \.offset) { _, row in
                GridRow {
                    ForEach(row, id: \.self) { url in
                        AsyncImage(url: url) { phase in
                            switch phase {
                            case .empty: Color.gray.opacity(0.1)
                            case .success(let img): img.resizable().scaledToFill()
                            case .failure: Image(systemName: "photo")
                            @unknown default: EmptyView()
                            }
                        }
                        .aspectRatio(1, contentMode: .fit)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    // 补齐空格以保持 3 列对齐
                    if row.count < 3 {
                        ForEach(0..<(3 - row.count), id: \.self) { _ in Color.clear }
                    }
                }
            }
        }
    }
}

// MARK: - 工具
private extension Array {
    func chunked(into size: Int) -> [[Element]] {
        stride(from: 0, to: count, by: size).map { Array(self[$0..<Swift.min($0 + size, count)]) }
    }
}
```

如果附件量上千、需要懒加载,把 `Grid` 换成 `LazyVGrid`;但 `LazyVGrid` 的列对齐不如 `Grid` 严格,跨行不会对齐。这是设计权衡。

下面是最有教学价值的一段:自定义 `WrapLayout` 让标签自动换行。

```swift
// File: Features/Notes/WrapLayout.swift
import SwiftUI

// MARK: - 自定义 Layout:水平排列,放不下就换行
struct WrapLayout: Layout {
    var spacing: CGFloat = 8
    var lineSpacing: CGFloat = 8

    // 跨 sizeThatFits / placeSubviews 复用的缓存
    struct Cache {
        var rows: [[Int]] = []            // 每行的 subview 索引
        var rowSizes: [CGSize] = []       // 每行的总尺寸
        var totalSize: CGSize = .zero
    }

    func makeCache(subviews: Subviews) -> Cache { Cache() }

    func sizeThatFits(
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout Cache
    ) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        layoutRows(maxWidth: maxWidth, subviews: subviews, into: &cache)
        return cache.totalSize
    }

    func placeSubviews(
        in bounds: CGRect,
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout Cache
    ) {
        // 如果 bounds.width 与上次计算不一致,要重新分行
        if cache.totalSize.width != bounds.width {
            layoutRows(maxWidth: bounds.width, subviews: subviews, into: &cache)
        }

        var y = bounds.minY
        for (rowIndex, row) in cache.rows.enumerated() {
            var x = bounds.minX
            let rowHeight = cache.rowSizes[rowIndex].height
            for index in row {
                let size = subviews[index].sizeThatFits(.unspecified)
                subviews[index].place(
                    at: CGPoint(x: x, y: y + (rowHeight - size.height) / 2),
                    anchor: .topLeading,
                    proposal: ProposedViewSize(size)
                )
                x += size.width + spacing
            }
            y += rowHeight + lineSpacing
        }
    }

    // MARK: 把子视图分行
    private func layoutRows(
        maxWidth: CGFloat,
        subviews: Subviews,
        into cache: inout Cache
    ) {
        cache.rows.removeAll(keepingCapacity: true)
        cache.rowSizes.removeAll(keepingCapacity: true)

        var currentRow: [Int] = []
        var currentRowWidth: CGFloat = 0
        var currentRowHeight: CGFloat = 0
        var totalHeight: CGFloat = 0
        var maxLineWidth: CGFloat = 0

        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.unspecified)
            let needed = currentRow.isEmpty ? size.width : currentRowWidth + spacing + size.width

            if needed > maxWidth, !currentRow.isEmpty {
                // 换行
                cache.rows.append(currentRow)
                cache.rowSizes.append(CGSize(width: currentRowWidth, height: currentRowHeight))
                totalHeight += currentRowHeight + lineSpacing
                maxLineWidth = max(maxLineWidth, currentRowWidth)
                currentRow = [index]
                currentRowWidth = size.width
                currentRowHeight = size.height
            } else {
                currentRow.append(index)
                currentRowWidth = needed
                currentRowHeight = max(currentRowHeight, size.height)
            }
        }

        if !currentRow.isEmpty {
            cache.rows.append(currentRow)
            cache.rowSizes.append(CGSize(width: currentRowWidth, height: currentRowHeight))
            totalHeight += currentRowHeight
            maxLineWidth = max(maxLineWidth, currentRowWidth)
        }

        cache.totalSize = CGSize(width: maxLineWidth, height: totalHeight)
    }
}
```

调用点:

```swift
// File: Features/Notes/TagCloudView.swift
import SwiftUI

struct TagCloudView: View {
    let tags: [String]

    var body: some View {
        WrapLayout(spacing: 6, lineSpacing: 6) {
            ForEach(tags, id: \.self) { tag in
                Text("#\(tag)")
                    .font(.caption)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(Color.accentColor.opacity(0.12), in: Capsule())
                    .foregroundStyle(Color.accentColor)
            }
        }
        .padding()
    }
}

#Preview {
    TagCloudView(tags: [
        "Swift", "SwiftUI", "iOS 18", "Observation",
        "NotesIsland", "本地优先", "CloudKit", "Layout 协议",
        "WrapLayout", "ProposedViewSize"
    ])
}
```

整段代码加起来 ~140 行,Swift 6 严格并发模式下零警告。`WrapLayout` 是一个值类型(`struct`),`Cache` 也是值类型,完美契合 Swift 偏好值语义的方向。

最后给一个分支布局案例:`ViewThatFits` 是布局系统的"if-else",它会按子视图顺序问每一个"在这个 proposal 下你放得下吗?",选第一个 yes 的渲染:

```swift
// File: Features/Notes/NoteSummary.swift
import SwiftUI

struct NoteSummary: View {
    let note: Note

    var body: some View {
        ViewThatFits(in: .horizontal) {
            // 候选 1:完整版,带图标 + 标题 + 副标题
            HStack(spacing: 8) {
                Image(systemName: "note.text")
                VStack(alignment: .leading) {
                    Text(note.title).font(.headline)
                    Text(note.body).font(.caption).lineLimit(1)
                }
            }
            // 候选 2:中等版,只标题
            HStack(spacing: 4) {
                Image(systemName: "note.text")
                Text(note.title).font(.subheadline).lineLimit(1)
            }
            // 候选 3:最窄,只图标
            Image(systemName: "note.text")
        }
    }
}
```

——这是 iOS 16+ 自带的"响应式布局"原语,在 Dynamic Island、Widget 多 family 适配里极常用。

---

## 四、调参与验收

### 1. 检查布局协商真的只跑一次

在 `WrapLayout.sizeThatFits` 与 `placeSubviews` 里各加一个 `print`,跑一个 100 个标签的页面,期望:

- 初次渲染:`sizeThatFits` 一次、`placeSubviews` 一次。
- 旋转 / Dynamic Type 改变:再各一次。
- 滚动列表中静态标签云:**不再触发**——因为 proposal 没变。

如果你看到反复 10+ 次,通常是父视图链上某个 `frame(maxWidth: .infinity).fixedSize()` 引发了协商死循环。

### 2. 性能基准

- 100 个标签 + `WrapLayout`:60Hz 真机 < 1ms 单次布局。
- 1000 个标签 + `WrapLayout`:开始可感知卡顿,要换成虚拟化策略(把 `WrapLayout` 装进 `ScrollView` + 分页加载)。
- 1000 行笔记 + `List`:本身就是 lazy 的,稳定 60/120Hz。
- 同样 1000 行用 `VStack` 套 `ScrollView`:**首屏 800ms+,卡到不能用**。这是 lazy 的硬规则。

### 3. ViewThatFits 验收

把模拟器尺寸从 6.7" iPhone 切到 5.4" mini,期望 `NoteSummary` 自动从完整版降级到中等版。VoiceOver 应仍能读到选中的版本的文本(`ViewThatFits` 不会"画"被弃选的候选)。

### 4. 验收清单

- [ ] `HStack` / `VStack` 都用了 `spacing:` 与 `alignment:` 显式参数,不靠默认值。
- [ ] 大列表(> 30 行)都用 `LazyVStack` / `List`,不用 `VStack` 套 `ScrollView`。
- [ ] 自定义 `Layout` 全部实现了 `Cache`,且 `sizeThatFits` 与 `placeSubviews` 没有重复算行数。
- [ ] 需要响应宽度的布局用了 `ViewThatFits` 或 `Layout` 协议,不用 `GeometryReader` 嵌套(后者会让父视图布局协商失效)。
- [ ] `Grid` 与 `LazyVGrid` 按场景选对:固定 < 100 用 `Grid`,大量滚动用 `LazyVGrid`。
- [ ] Swift 6 严格并发模式构建零警告(`Layout` 协议天然在主线程)。

---

## 五、踩坑

### 坑 1:`GeometryReader` 占满父视图

```swift
GeometryReader { geo in
    Text("hello")
}
```

`GeometryReader` 会 **接受父视图给的所有提议尺寸并占满**,导致 Text 居左上、外层尺寸不可控。这是 SwiftUI 初学最坑的一个 API。**iOS 16+ 优先用 `Layout` 协议或 `ViewThatFits`**,只在确实需要读父视图尺寸时用 `GeometryReader`,并把它包在 `.frame(...)` 里限定尺寸。

### 坑 2:从 Flutter 迁来,期待 `Expanded(flex: 2)`

```swift
HStack {
    Color.red.frame(maxWidth: .infinity)       // 等价 Expanded(flex: 1)
    Color.blue.frame(maxWidth: .infinity)      // 等价 Expanded(flex: 1)
}
```

`.frame(maxWidth: .infinity)` 让子视图"抢"剩余空间。**但没有内建的 `flex: 2`**。要 2:1 比例,可以这么做:

```swift
HStack {
    Color.red.frame(maxWidth: .infinity).layoutPriority(2)
    Color.blue.frame(maxWidth: .infinity).layoutPriority(1)
}
```

——但要注意 `layoutPriority` 不是严格的比例,而是 **抢的顺序**。严格比例需要自定义 `Layout` 协议。

### 坑 3:`Spacer()` 在 ZStack 里没用

`ZStack` 是叠层,没有主轴,`Spacer` 无意义。`ZStack` 想要把子视图推到某个角落,用 `alignment:` 参数 + 子视图自己的 `.frame(maxWidth/Height: .infinity, alignment: .topTrailing)`。

### 坑 4:Stack 默认间距与 spacing: 0

`VStack` 默认 spacing 是平台决定的(通常 8pt),不是 0。如果你想做"零间距粘连"布局,**必须显式 `VStack(spacing: 0)`**。这是设计语言级的取舍,不要默默接受默认值,会让你的 UI 在 iPad / macOS Catalyst 下抽风。

### 坑 5:`LazyVStack` 在不可滚动的容器里没意义

```swift
VStack {
    LazyVStack {        // ❌ 父视图非 scroll,lazy 没机会生效
        ForEach(...) { ... }
    }
}
```

`LazyVStack` 的"懒"是基于父视图 `ScrollView` 的可见区域,如果它不在 `ScrollView` 里,所有子视图都会立即计算,与 `VStack` 等价。

### 坑 6:`ForEach` 没给稳定 id 导致动画错乱

```swift
ForEach(notes.indices, id: \.self) { i in    // ❌ 索引不是稳定身份
    NoteRow(note: notes[i])
}
```

数组删除 / 重排后,索引被复用为另一个数据,SwiftUI 会复用错位的视图,导致动画"飘"。要么 `ForEach(notes) { ... }`(`Note: Identifiable`),要么 `id: \.id`。**iOS 18 严格并发模式下 `Hashable + Identifiable` 是最稳的组合**。

### 坑 7:把布局逻辑写在 `.onAppear` 里

```swift
.onAppear { recomputeWrap() }   // ❌
```

布局应该在 `Layout` 协议或 `body` 计算里完成,**不要**用 `onAppear` 触发副作用调整布局。这种写法在 SwiftData 数据回填、动画转场时会出"两帧错位"。

### 坑 8:`Grid` vs `LazyVGrid` 用反

| 场景 | 用 |
| --- | --- |
| 表单字段对齐("标签 + 输入框"两列) | `Grid` |
| 设置面板的"label : value"成行 | `Grid` |
| 相册缩略图、无限滚动 | `LazyVGrid` |
| 一次性 < 50 个 item 的网格 | `Grid` |
| 跨行跨列对齐严格 | `Grid` |

`LazyVGrid` 不保证跨行对齐,`Grid` 不做 lazy。**这是 iOS 16 增加 `Grid` 的核心动机**——填补 `LazyVGrid` 不能严格对齐的空缺。

### 坑 9:Swift 5 老教程里 `HStack { ForEach(0..<n) { ... } }`

Swift 5 / iOS 14 教程喜欢:

```swift
ForEach(0..<note.tags.count) { i in
    Text(note.tags[i])
}
```

Swift 6 会要求 `Range<Int>` 是常量(否则会报 `non-constant range`)。改成:

```swift
ForEach(Array(note.tags.enumerated()), id: \.offset) { _, tag in
    Text(tag)
}
```

或者直接 `ForEach(note.tags, id: \.self) { ... }`。

### 坑 10:把 `Layout` 协议当成 `UIViewController`

`Layout` 协议是 **值类型 + 纯函数**:相同输入必须给出相同输出,不能在里面打开数据库、读 `UserDefaults`、改 `@State`。SwiftUI 会任意多次调用 `sizeThatFits`,有副作用的话整个 App 会进入抖动状态。**Layout 必须是纯计算**,业务数据通过 `LayoutValueKey` 走子视图元数据通道传入。

### 坑 11:iOS 18 → iOS 19 的兼容标注

`Layout` 协议、`Grid`、`ViewThatFits` 都是 iOS 16+,本系列基线 iOS 18 没问题。iOS 19+ 引入的 Liquid Glass 视觉系统会影响 stack 的 padding 默认值——本系列在第 11 / 24 篇会单独标注,这里只用 iOS 18 的稳定行为。

---

至此 SwiftUI 状态层(07)、数据流向(08)、布局系统(09)三件套配齐了。下一篇我们走 Modifier 链、`ViewModifier` 自定义与样式系统,把"视觉一致性"这一层封掉。
