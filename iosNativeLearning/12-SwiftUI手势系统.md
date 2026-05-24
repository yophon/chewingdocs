# 12 SwiftUI 手势系统

> 基线版本:iOS 18 / Swift 6 / Xcode 16 / SwiftUI。涉及 iOS 18+ 与 iOS 19+ 单独标注。

UI 框架里手势之难,99% 不在「识别一个单点」——`onTapGesture` 一行就够。难在两点:**多个手势相互覆盖时谁先赢**、**自定义手势与系统手势(滚动、滑动返回)如何共存**。UIKit 时代靠 `UIGestureRecognizerDelegate` 的 8 个回调互相博弈,而 SwiftUI 把这些博弈整合成三种组合算子(`SimultaneousGesture` / `ExclusiveGesture` / `Sequenced`)+ 三种优先级 modifier(`gesture` / `simultaneousGesture` / `highPriorityGesture`)。心智清晰了,但坑也变成「**为什么我加了 DragGesture,父级 ScrollView 就再也滚不动了**」这种典型。

这一篇围绕 NotesIsland 的「图片预览捏合缩放」「音频卡片的滑动归档」「列表项的拖拽重排」「滚动到顶部刷新」四个场景,把 SwiftUI 手势系统讲透。

## 1. 机制定位:手势是「带状态的事件流」,不是回调

UIKit 的手势识别器是状态机(`began` / `changed` / `ended` / `cancelled`),通过 delegate 互相协商。SwiftUI 沿用了状态机本质,但把它包装成**值类型 + 链式 modifier**:

- `Gesture` 是协议,所有具体手势(`TapGesture` / `DragGesture` / `LongPressGesture` / `MagnifyGesture` / `RotateGesture`)都是 `struct`,可以通过 `.onChanged` / `.onEnded` 添加回调,通过组合算子拼成新 gesture。
- 通过 `.gesture(_:)` modifier 挂到视图上,SwiftUI 内部维护当前 active gesture 的状态机。
- 优先级通过三个不同的 modifier 表达:`.gesture` 是默认(子视图优先)、`.simultaneousGesture` 是并发、`.highPriorityGesture` 是抢断(强制让自己赢)。

这个设计直接解决了 UIKit 时代两个痛点:

1. **不需要继承**——所有手势都是 struct,扩展靠组合而非 subclass。
2. **状态本地化**——`@GestureState` 是专为手势设计的属性包装器,**手势结束时自动归零**,你不必手动写「松手时把 dragOffset 设回 0」。

但也带来一个新问题:**手势是「视图自身的事件」,与「滚动、返回、Live Activity」这些系统手势在同一根 view hierarchy 上**,SwiftUI 没有 UIKit 那种 `gestureRecognizer(_:shouldRecognizeSimultaneouslyWith:)` 让你看到对方,你只能通过优先级与组合算子隐式表达意图。这也是这一篇大量篇幅要解决的问题。

## 2. Apple 平台心智:核心 API 全景

### 2.1 基础手势

| Gesture | 触发 | 典型用途 |
| --- | --- | --- |
| `TapGesture(count:)` | 单击 / 双击 | 选中、放大切换 |
| `LongPressGesture(minimumDuration:maximumDistance:)` | 长按 | 上下文菜单备选(优先用 `.contextMenu`) |
| `DragGesture(minimumDistance:coordinateSpace:)` | 拖动 | 滑动归档、可拖拽组件 |
| `MagnifyGesture` (iOS 17+) | 双指捏合 | 图片缩放 |
| `RotateGesture` (iOS 17+) | 双指旋转 | 图片旋转 |
| `SpatialTapGesture` | 带位置信息的 tap | 需要点击坐标的画板 |

> iOS 16 时代叫 `MagnificationGesture` / `RotationGesture`,iOS 17 起新名字 `MagnifyGesture` / `RotateGesture`,API 等价但更短。新工程直接用新名,但你看老代码不要疑惑。

### 2.2 状态包装器:`@GestureState`

```swift
@GestureState private var dragOffset: CGSize = .zero

var body: some View {
    Rectangle()
        .offset(dragOffset)
        .gesture(
            DragGesture()
                .updating($dragOffset) { value, state, _ in
                    state = value.translation
                }
        )
}
```

`@GestureState` 与 `@State` 的关键区别:**手势结束(end / cancel)时自动重置为初始值**。你不用写 `.onEnded { dragOffset = .zero }`,SwiftUI 会做。这正是「拖完手指后,卡片自动回弹到原位」的标准实现。

如果你**希望松手后保留状态**(比如缩放完后图片留在新大小),用 `@State` 自己管理,不用 `@GestureState`。

### 2.3 三种组合算子

| 算子 | 行为 |
| --- | --- |
| `SimultaneousGesture(a, b)` 或 `a.simultaneously(with: b)` | 两手势**同时**激活;两个回调都会被调用 |
| `ExclusiveGesture(a, b)` 或 `a.exclusively(before: b)` | 优先 a,若 a 不识别则 b;不会并发 |
| `SequenceGesture(a, b)` 或 `a.sequenced(before: b)` | 先 a 识别完成,b 才开始(典型:长按后拖动) |

### 2.4 三种优先级 modifier

| modifier | 行为 |
| --- | --- |
| `.gesture(_:)` | 默认:子视图先响应;若子视图不要,父级才识别 |
| `.simultaneousGesture(_:)` | 与子视图手势**并发**,两边都识别 |
| `.highPriorityGesture(_:)` | **抢断**:父级先识别,子视图手势若与之冲突会被取消 |

这三个 modifier 的常见用法记忆:**「我和子视图都需要」用 simultaneous;「我要硬抢」用 highPriority;「让子视图先,我兜底」用 gesture**。

### 2.5 与系统手势的冲突

SwiftUI 的视图里默认承载了几个系统手势,看不见但实实在在:

| 容器 | 系统手势 | 与自定义手势的关系 |
| --- | --- | --- |
| `ScrollView` | 垂直/水平滚动 | DragGesture 默认与滚动冲突 |
| `NavigationStack` | 屏幕左边缘滑动返回 | DragGesture 在左边缘需让位 |
| `TabView(.page)` | 水平翻页 | 水平 DragGesture 会被吞掉 |
| `List` | 行交换、滑动删除 | `.swipeActions` 优先于自定义 DragGesture |

SwiftUI 没有 UIKit 那种「告诉滚动视图我和你共存」的 API。你能做的是:

- **限制方向**:DragGesture 只识别水平拖动 → 让出垂直给 ScrollView。
- **降低优先级**:用 `.gesture`(默认)而不是 `.highPriorityGesture`。
- **iOS 18+** 引入了几个新 API 改善这个体验:
  - `.scrollDisabled(_:)`(iOS 16+,但 iOS 18 更稳)按需关闭滚动。
  - `onScrollGeometryChange(for:of:action:)`(iOS 18+)取代了过去自己用 `GeometryReader + PreferenceKey` 监听滚动位置的 hack。
  - `ScrollPhaseChangeContext`(iOS 18+)告诉你滚动正处于哪个阶段。

### 2.6 与 UIKit `UIGestureRecognizerDelegate` 的对照

| UIKit | SwiftUI |
| --- | --- |
| `gestureRecognizer(_:shouldRecognizeSimultaneouslyWith:)` | `.simultaneousGesture(_:)` |
| `gestureRecognizer(_:shouldBeRequiredToFailBy:)` | `.highPriorityGesture(_:)` 反向使用 |
| `requireGestureRecognizerToFail` 链 | `SequenceGesture` |
| `cancelsTouchesInView` | SwiftUI 默认就有 hit-test 隔离 |

SwiftUI 的代价是失去了「**手势之间可以指名道姓**」的能力。如果你的需求是「当且仅当滚动视图未在拖动时识别这个 DragGesture」,SwiftUI 没有直接 API,需要借助 `onScrollPhaseChange`(iOS 18+)间接表达,或者降级到 `UIViewRepresentable` 桥接 UIKit 手势识别器(第 17 篇会展开)。

## 3. 工程实现

### 3.1 图片预览:捏合 + 拖动 + 双击复位

```swift
// File: Features/Notes/UI/ImagePreviewView.swift
import SwiftUI

// MARK: - ImagePreviewView
struct ImagePreviewView: View {
    let image: Image

    @State private var committedScale: CGFloat = 1.0
    @State private var committedOffset: CGSize = .zero

    @GestureState private var liveScale: CGFloat = 1.0
    @GestureState private var liveOffset: CGSize = .zero

    var body: some View {
        GeometryReader { geo in
            image
                .resizable()
                .scaledToFit()
                .frame(width: geo.size.width, height: geo.size.height)
                .scaleEffect(committedScale * liveScale)
                .offset(
                    width: committedOffset.width + liveOffset.width,
                    height: committedOffset.height + liveOffset.height
                )
                .gesture(combinedGesture)
                .gesture(doubleTap)
                .animation(.spring(response: 0.35, dampingFraction: 0.85), value: committedScale)
        }
        .background(.black)
        .ignoresSafeArea()
    }

    // MARK: - 组合手势:捏合 + 拖动 并发
    private var combinedGesture: some Gesture {
        let pinch = MagnifyGesture()
            .updating($liveScale) { value, state, _ in
                state = value.magnification
            }
            .onEnded { value in
                let new = committedScale * value.magnification
                committedScale = min(max(new, 1.0), 4.0)
                if committedScale == 1.0 {
                    committedOffset = .zero
                }
            }

        let drag = DragGesture()
            .updating($liveOffset) { value, state, _ in
                state = value.translation
            }
            .onEnded { value in
                committedOffset.width += value.translation.width
                committedOffset.height += value.translation.height
            }

        return SimultaneousGesture(pinch, drag)
    }

    // MARK: - 双击复位
    private var doubleTap: some Gesture {
        TapGesture(count: 2)
            .onEnded {
                withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
                    committedScale = committedScale > 1.0 ? 1.0 : 2.0
                    committedOffset = .zero
                }
            }
    }
}
```

要点:

- **「live」手势状态**(`@GestureState`)与「committed」状态(`@State`)分开:手势进行中用 live,松手后把 live 累计到 committed,这样下一次手势从新基线开始而不是从 1.0 重新开始。
- `MagnifyGesture` 与 `DragGesture` 用 `SimultaneousGesture` 并发——一只手捏一只手滑是常见动作。
- 双击不用 `simultaneous` 与上面并发,因为 `TapGesture` 与 `DragGesture` 默认互斥,SwiftUI 通过 `minimumDistance` 判定。
- 范围用 `min(max())` 而不是 force unwrap,符合 Swift 6 风格。

### 3.2 卡片左滑归档:DragGesture 与 ScrollView 共存

```swift
// File: Features/Notes/UI/SwipeArchiveRow.swift
import SwiftUI

// MARK: - SwipeArchiveRow
struct SwipeArchiveRow<Content: View>: View {
    @ViewBuilder var content: () -> Content
    var onArchive: () -> Void

    @State private var committedX: CGFloat = 0
    @GestureState private var dragX: CGFloat = 0

    private let archiveThreshold: CGFloat = -100

    var body: some View {
        ZStack(alignment: .trailing) {
            // 背景:归档动作
            HStack {
                Spacer()
                Label("归档", systemImage: "archivebox.fill")
                    .foregroundStyle(.white)
                    .padding(.horizontal, 24)
            }
            .background(.orange)
            .opacity(min(1.0, abs((committedX + dragX) / archiveThreshold)))

            // 前景内容
            content()
                .background(.background)
                .offset(x: committedX + dragX)
                .gesture(swipeGesture, including: .all)
        }
        .clipped()
        .animation(.spring(response: 0.35, dampingFraction: 0.85), value: committedX)
    }

    // MARK: - 只识别水平拖动,把垂直方向让给 ScrollView
    private var swipeGesture: some Gesture {
        DragGesture(minimumDistance: 16, coordinateSpace: .local)
            .updating($dragX) { value, state, _ in
                let dx = value.translation.width
                let dy = value.translation.height
                // 主方向判定:水平为主才识别
                guard abs(dx) > abs(dy) else { return }
                state = min(0, dx)  // 只接受左滑
            }
            .onEnded { value in
                let dx = value.translation.width
                let dy = value.translation.height
                guard abs(dx) > abs(dy) else { return }
                let total = committedX + dx
                if total < archiveThreshold {
                    onArchive()
                    committedX = -200  // 飞出去
                } else {
                    committedX = 0
                }
            }
    }
}
```

关键决策:

- 用 `.gesture(_:)`(默认优先级),**不要**用 `.highPriorityGesture`。后者会抢断 ScrollView 滚动。
- 在 `updating` 里检查 `abs(dx) > abs(dy)`,只有主方向是水平时才设置 state。否则 SwiftUI 默认会把所有方向的拖动都识别为这个 gesture,从而吞掉滚动。
- `minimumDistance: 16` 让用户必须明确拖动一段距离才触发,避免点击时误触发。
- 不要用 `List + .swipeActions`?当你需要进度条式归档(滑得越远归档动作越突出)时,`.swipeActions` 不够灵活。常规归档/删除仍优先 `.swipeActions`。

### 3.3 列表拖拽重排:SequenceGesture(长按 → 拖)

`List` 提供 `.onMove`,但有时我们要 `LazyVStack` 自定义视觉时不得不自己写。

```swift
// File: Features/Notes/UI/ReorderableVStack.swift
import SwiftUI

// MARK: - ReorderableItem
struct ReorderableItem<Content: View>: View {
    @ViewBuilder var content: () -> Content
    var onActivate: () -> Void
    var onMove: (CGSize) -> Void
    var onCommit: () -> Void

    @GestureState private var isActive: Bool = false
    @GestureState private var dragOffset: CGSize = .zero

    var body: some View {
        content()
            .scaleEffect(isActive ? 1.05 : 1.0)
            .shadow(radius: isActive ? 12 : 0)
            .offset(dragOffset)
            .animation(.spring(response: 0.3, dampingFraction: 0.85), value: isActive)
            .gesture(reorderGesture)
    }

    private var reorderGesture: some Gesture {
        LongPressGesture(minimumDuration: 0.4)
            .sequenced(before: DragGesture(minimumDistance: 0))
            .updating($isActive) { value, state, _ in
                switch value {
                case .first(true): state = true
                case .second(true, _): state = true
                default: state = false
                }
            }
            .updating($dragOffset) { value, state, _ in
                if case .second(true, let drag?) = value {
                    state = drag.translation
                }
            }
            .onChanged { value in
                if case .first(true) = value { onActivate() }
                if case .second(true, let drag?) = value { onMove(drag.translation) }
            }
            .onEnded { _ in onCommit() }
    }
}
```

要点:

- `SequenceGesture`(写成 `a.sequenced(before: b)`)的语义:**先 a 完成,才会触发 b**。这里 `LongPressGesture(0.4)` 完成后才允许 `DragGesture` 开始,完美模拟 iOS 系统 Home Screen 的「长按再拖」交互。
- `value` 是个 enum:`.first(完成?)` / `.second(完成?, second 的值?)`,需要 pattern match。
- `onActivate` 通常做触觉反馈:`UIImpactFeedbackGenerator(style: .medium).impactOccurred()`(MainActor 上调用)。

### 3.4 滚动到顶部:onScrollGeometryChange(iOS 18+)

NotesIsland 的列表希望「下拉超过 80pt 触发刷新」,过去要 GeometryReader + PreferenceKey 来回传递,iOS 18 直接给 API。

```swift
// File: Features/Notes/NoteListScrollView.swift
import SwiftUI

// MARK: - NoteListScrollView (iOS 18+)
struct NoteListScrollView: View {
    @State private var notes: [String] = (0..<50).map { "笔记 \($0)" }
    @State private var pullDistance: CGFloat = 0
    @State private var isRefreshing = false

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                refreshHeader
                ForEach(notes, id: \.self) { title in
                    Text(title)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding()
                        .background(.background.secondary)
                        .padding(.horizontal)
                        .padding(.vertical, 4)
                }
            }
        }
        .onScrollGeometryChange(for: CGFloat.self) { geo in
            // contentOffset.y:负值表示下拉超过顶部
            -geo.contentOffset.y - geo.contentInsets.top
        } action: { _, newValue in
            pullDistance = max(0, newValue)
            if newValue > 80, !isRefreshing {
                triggerRefresh()
            }
        }
    }

    private var refreshHeader: some View {
        HStack {
            if isRefreshing {
                ProgressView()
            } else {
                Image(systemName: "arrow.down")
                    .rotationEffect(.degrees(pullDistance > 80 ? 180 : 0))
                    .animation(.easeInOut(duration: 0.2), value: pullDistance > 80)
            }
        }
        .frame(height: max(0, pullDistance))
        .frame(maxWidth: .infinity)
    }

    private func triggerRefresh() {
        isRefreshing = true
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(1.0))
            isRefreshing = false
        }
    }
}
```

要点:

- `onScrollGeometryChange(for:of:action:)` 的回调在主 actor 上,直接改 `@State` 安全。
- 注意 `for: CGFloat.self` 的「为派生值去抖」——只有 closure 返回的值发生变化才触发 action,避免每帧调用。
- iOS 17 及以下用 `.refreshable { ... }` 的系统刷新仍是最稳的兜底,但样式不可定制。

## 4. 调参与验收

### 4.1 关键参数

| 参数 | 推荐 | 失败模式 |
| --- | --- | --- |
| `DragGesture.minimumDistance` | 10-20 | 0 时点击都会被识别为拖动 |
| `LongPressGesture.minimumDuration` | 0.3-0.5 | <0.2 会被滚动误触 |
| `LongPressGesture.maximumDistance` | 默认 10 | 想容忍轻微手抖可放到 20 |
| `MagnifyGesture` 范围 | 1.0-4.0 | 上限 >5.0 会让用户失去缩放方向感 |
| swipe 归档阈值 | 屏宽的 20-30% | <15% 易误触,>40% 太累 |

### 4.2 验收步骤

1. 真机进入 ImagePreviewView,双指捏合放大到 3x,确认双击复位回到 1x;再双击放大到 2x,松手不会弹回。
2. 在 SwipeArchiveRow 里上下滑动列表,确认 ScrollView 仍能正常垂直滚动;左滑超过 100pt 后松手,触发归档动画。
3. 在 ReorderableItem 上短按(<0.4s)松手,**不应该触发**任何动作;长按 0.5s 后开始拖动,卡片放大并跟随手指。
4. 在 NoteListScrollView 下拉超过 80pt,触发刷新指示器;松手后 1 秒内复位。
5. 从屏幕**最左边缘**右滑——这是 NavigationStack 的 pop 手势,必须仍然能返回上一页(即我们的 SwipeArchiveRow 没误吞)。
6. VoiceOver 开启时,所有手势都应该有等价的「Accessibility Action」:`accessibilityAction(.escape) { ... }` 处理归档、`accessibilityAction(named:)` 处理重排。否则视障用户无法使用核心功能。
7. iOS 18 真机:Instruments → SwiftUI 模板,确认 `onScrollGeometryChange` 的 action 调用频率 ≈ 60-120 次/秒,且不引发 body 重算(因为我们只更新 `@State`,SwiftUI 只重算依赖它的子树)。

## 5. 踩坑:Swift 6 / iOS 18 与旧教程的差异

### 5.1 `MagnificationGesture` / `RotationGesture` 旧名仍可用但要迁移

iOS 17 起改名为 `MagnifyGesture` / `RotateGesture`,新名字的 `value.magnification` 与老名字的 `value`(`CGFloat`)接口略不同。新工程用新名,Stack Overflow 老答案如果用 `.onChanged { value in ... }` 直接当数字用,要警惕。

### 5.2 `@GestureState` 不能在闭包外读

```swift
// 错:在 onEnded 里读 dragOffset 是 .zero,因为 @GestureState 在 ended 时已重置
.gesture(
    DragGesture()
        .updating($dragOffset) { v, s, _ in s = v.translation }
        .onEnded { _ in
            commit(dragOffset)  // 永远是 .zero
        }
)

// 对:用 onEnded 的 value
.onEnded { value in commit(value.translation) }
```

### 5.3 `.simultaneousGesture` 不等于 `SimultaneousGesture(a, b)`

前者是 **modifier**,把这个手势挂到视图上、与视图既有手势并发;后者是 **组合算子**,把两个手势组合成一个新手势。混用会得到「为什么没识别」的玄学。

### 5.4 不要在手势回调里直接做 I/O

```swift
// 错:在 onChanged 里写文件,Swift 6 会报隔离警告
.onChanged { value in
    try? saveSnapshot(at: value.location)
}

// 对:启 Task,且让 I/O 在合适的 actor 上
.onChanged { value in
    Task { await store.savePosition(value.location) }
}
```

`onChanged` 每帧调用,IO 也每帧执行,既慢又错。

### 5.5 与 NavigationStack 边缘返回的妥协

NavigationStack 的左边缘 pop 手势优先级**高于**任何自定义 DragGesture。如果你的页面需要「从左边缘往右拖触发自定义动作」,几乎肯定要冲突,**建议改设计**(从右边缘、从顶部下拉等)。iOS 18 没提供 API 直接关掉这个手势,在导航层级里做这种交互是反平台习惯的。

### 5.6 `Button` 内部嵌套 `onTapGesture` 是无效叠加

```swift
// 错
Button { save() } label: {
    Text("保存")
        .onTapGesture { print("内层") }  // 不会触发
}
```

`Button` 已经接管了 hit area,内部子视图的 `onTapGesture` 会被吞。如果你需要「按钮内部某区域有独立动作」,改用 ZStack 平铺并各挂 gesture,或者用更上层的 `Menu` / 自定义 `PrimitiveButtonStyle`。

### 5.7 `onScrollGeometryChange` 是 iOS 18+

iOS 17 兜底是 `scrollPosition(id:)`(iOS 17+) 或自己用 `GeometryReader + PreferenceKey`。**不要**沿用 iOS 14 时代的 `UIScrollView` 桥接,这会绕回 UIKit + Coordinator,徒增复杂度。

### 5.8 `RotateGesture` 在小屏上几乎没用

双指旋转在 iPhone 上需要手指张得足够开,且 hitArea 必须够大。NotesIsland 里如果你的图片预览框 < 200pt 宽,RotateGesture 体验差到不如做一个「90° 旋转按钮」。手势设计要看交付介质,这是 UI 决策而非 API 决策。

---

至此 NotesIsland 的交互层已经完整:**布局 → 样式 → 动画 → 手势**。所有用户能看见、能动手的环节都有了。下一篇我们进到导航层,把多个 view 串成可深链、可恢复、可类型化路由的 NavigationStack——把这一切组合成一个真正的「App」。
