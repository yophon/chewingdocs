# 11 SwiftUI 动画与转场

> 基线版本:iOS 18 / Swift 6 / Xcode 16 / SwiftUI。涉及 iOS 17+ 与 iOS 19+ 单独标注。

UI 框架的动画大致分两类思路。一类是 UIKit / Web 的「**命令式动画**」:你直接告诉系统「把这个属性从 A 改到 B,在 0.3 秒内」,系统启一个 timeline 帮你插值。另一类是 SwiftUI 选的「**声明式动画**」:你只声明「视图状态变了」,SwiftUI 自动比较前后两次的状态,决定哪些属性可以插值、按什么曲线、用什么 transition。

这一篇围绕 NotesIsland 的「列表项展开为详情」「同步状态指示器的呼吸效果」「波形录音条」「卡片间共享元素过渡」四个真实场景,把 `withAnimation` / `Animation` / `matchedGeometryEffect` / `TimelineView` / `PhaseAnimator`(iOS 17+)讲透。读完后你应该知道:**什么动画用隐式、什么必须用显式、什么时候动画反而带来重渲染成本、动画与 SwiftUI 的差分机制怎么交互**。

为什么单独把动画拎出来一篇?因为「**动画是 SwiftUI 心智的放大镜**」。在静止 UI 里,你写错了 modifier 顺序、用了不该用的 `id(_:)`、把状态放错了 actor,可能只是「看起来不对」却仍能跑;一旦加上动画,任何身份混乱、任何 diff 子树错位、任何状态变更的隔离问题,都会以「视图跳变」「中途回弹」「莫名闪烁」这样最显眼的方式暴露出来。把动画讲清楚,等于把 SwiftUI 数据流再走一遍——只是这次有视觉反馈做检查。

## 1. 机制定位:动画不是动作,而是「状态变化的视觉补间」

UIKit 里写动画是这样:

```swift
UIView.animate(withDuration: 0.3) {
    button.transform = CGAffineTransform(scaleX: 1.2, y: 1.2)
    button.backgroundColor = .systemRed
}
```

你告诉系统「在 0.3 秒里完成这一组属性的修改」。SwiftUI 不让你直接「改属性」,因为视图是值类型——重新计算 body、生成新的视图值,跟「动画」是两件事。SwiftUI 的解法是:

1. 你用 `@State` / `@Observable` 改了某个值,触发 body 重新计算。
2. SwiftUI 把新旧两次的视图树做 diff,挑出对应位置的视图。
3. 如果某个属性是 `Animatable`(`opacity`、`offset`、`scale`、自定义 `AnimatableData` 的属性),并且当前 transaction 带着 `Animation`,SwiftUI 就在中间插值,逐帧重画。
4. 如果当前没有动画(默认 `transaction.animation == nil`),就一帧切换。

这就解释了两个关键现象:

- **同一行 `state.toggle()`,有时候有动画有时候没有**——取决于这次状态变更是不是被 `withAnimation` 包起来,或者目标值上有没有挂 `.animation(_, value:)`。
- **动画并不让代码异步执行**——`withAnimation { state = true }` 这一行执行后,`state` 立刻是 `true`,只是「视觉」需要 0.3 秒才落位。

转场(`transition`)是动画的特例:它专门处理「视图出现 / 消失」(insertion / removal),因为这时一边的属性根本不存在,不能简单插值,需要约定「从哪进、往哪退」。

进一步追问「**SwiftUI 怎么知道哪些属性可以插值**」:答案是 `Animatable` 协议。所有自带 `AnimatableData` 的属性(`offset`、`scale`、`rotation`、`opacity`、`frame`、`Color`、自定义 `Shape` 的参数)在 transaction 带 animation 时自动插值;其他属性(`if/else` 切换的视图存在性、`.font` 大小、文字字符串)走 transition 或直接切换。理解这一点的实际收益是:**不要试图给「字符串变化」加动画**——`Text("100").animation(.spring, value: number)` 不会让数字滚动到 100,只会瞬间切换。要做数字滚动,得给 Text 包一个 `contentTransition(.numericText())`(iOS 16+),那是另一套机制。

## 2. Apple 平台心智:七个核心概念

读 SwiftUI 动画文档时最容易迷失方向——一会儿是 `Animation`,一会儿是 `Transaction`,一会儿是 `transition`,一会儿是 `contentTransition`,再夹一个 `phaseAnimator`、`keyframeAnimator`、`symbolEffect`。其实它们围绕的是同一个核心概念图谱,只是各自负责不同维度。下面 7 个概念覆盖了 95% 真实场景,记住它们的边界比记住每个 API 的参数表更有用。

### 2.1 隐式动画 vs 显式动画

**隐式动画**用 `.animation(_:value:)` modifier 挂在视图上,**只在指定 value 变化时**激活,只影响这个 modifier 上方的视图。

```swift
Circle()
    .scaleEffect(isPulsing ? 1.2 : 1.0)
    .animation(.easeInOut(duration: 0.6), value: isPulsing)
```

**显式动画**用 `withAnimation(_:_:)`,**只对这个闭包内部触发的状态变化**生效,跨视图、跨 modifier。

```swift
withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) {
    selectedNoteID = note.id   // 多处依赖 selectedNoteID 的视图同步动画
}
```

经验法则:**「这个视图自己的属性变化」用隐式,「一次点击牵一发动全身」用显式**。

第三种很少提但很有用:**指定单个属性的动画**。比如 `.animation(.spring, value: isExpanded)` 挂在视图链中段,只对它上方的 modifier 生效——这给了你「**给某个区域单独配置动画**」的能力,可以做到「同一次状态变更下,卡片 spring 弹一下,旁边的小角标线性淡入」。Apple 用这种细粒度配置,让 iOS 18 的动画总体上更「灵」而不是齐刷刷一起飞。

### 2.2 `Animation` 曲线选型

| 曲线 | 用途 |
| --- | --- |
| `.linear` | 进度条、滚动条等线性映射 |
| `.easeInOut` | 默认 UI 过渡,自然且不抢戏 |
| `.spring(response:dampingFraction:blendDuration:)` | 用户拖拽后的回弹、按钮按下反馈 |
| `.interpolatingSpring(stiffness:damping:)` | 物理风格,常用于手势驱动的连续动画 |
| `.smooth` / `.snappy` / `.bouncy`(iOS 17+) | Apple 标准的语义化弹簧,推荐优先选 |

iOS 17 起的 `.smooth` / `.snappy` / `.bouncy` 是「**预调好的 spring**」,默认参数贴合 Apple 系统级动画(Dynamic Island 收起、控制中心展开),无脑用一般不出错。

### 2.3 `Transaction`

每一次 SwiftUI 状态变更都会创建一个 `Transaction`,里面携带 `animation` / `disablesAnimations` 等元数据。`withAnimation` 实际上是「**给本次 transaction 设置 animation**」。你可以更精细地控制:

```swift
var tx = Transaction(animation: .spring)
tx.disablesAnimations = false
withTransaction(tx) {
    state = newValue
}
```

`.transaction { $0.animation = ... }` modifier 还能在视图侧拦截改写——子视图可以选择性「降级」父级传下来的动画,这在「父级用大幅动画,子级想保持静默」时有用。

### 2.4 `matchedGeometryEffect`:共享元素

SwiftUI 的「相同元素从一个位置飞到另一个位置」不是手算坐标。你给两个不同位置的视图标上相同 `id`,同时只让其中一个存在,SwiftUI 自动把出现的那一个从消失的那一个的位置上插值飞过来。

```swift
@Namespace private var noteAnimation

if expanded {
    DetailView()
        .matchedGeometryEffect(id: note.id, in: noteAnimation)
} else {
    RowView()
        .matchedGeometryEffect(id: note.id, in: noteAnimation)
}
```

这是 iOS 14+ API,完全替代了 UIKit 时代手写 `UIViewControllerAnimatedTransitioning` 的复杂度。

但请注意几个隐性约束:

- 两个挂载点必须**同时只存在一个**;同一帧里同时存在会出现两份并存,SwiftUI 不会自动「合并」。
- `@Namespace` 必须是**两个挂载点的公共祖先**持有,如果各自放在不同祖先,系统找不到对应的 namespace。
- `properties:` 默认是 `.frame`(位置 + 尺寸),还有 `.position` / `.size` 等更细粒度组合。`.frame` 对 99% 场景够用,但偶尔你只想要尺寸过渡、位置瞬切,可以用 `.size`。
- `isSource:` 参数决定「以哪一边的 frame 为锚」,默认两边都是 source,SwiftUI 自己挑;复杂场景下你可能要显式指定。

### 2.5 `TimelineView`:时间驱动而非状态驱动

有些动画不依赖任何 `@State`——比如时钟、加载呼吸灯、波形采样——它们的核心是「**到了下一个时间点就重新计算一次**」。`TimelineView` 给你一个时间调度器,你只在 body 里读 `context.date`:

```swift
TimelineView(.animation) { context in
    Wave(progress: context.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 2) / 2)
}
```

`schedule` 有 `.animation`(每帧)、`.periodic(from:by:)`(定时)、`.explicit([Date])`(指定时刻)三种,后两种省电。

### 2.6 `PhaseAnimator`(iOS 17+):多阶段动画

需要「先放大,再变红,再回到原位」这种**多步骤序列**时,以前需要嵌套 `withAnimation` + `delay`,极易写错。iOS 17 起的 `PhaseAnimator` 让你声明阶段列表,SwiftUI 自动跑完:

```swift
.phaseAnimator([0, 1, 2]) { content, phase in
    content
        .scaleEffect(phase == 1 ? 1.3 : 1.0)
        .opacity(phase == 2 ? 0.5 : 1.0)
} animation: { phase in
    .easeInOut(duration: 0.3)
}
```

`KeyframeAnimator`(iOS 17+)更进一步,允许每个属性独立的关键帧轨道,适合复杂关键帧。两者的分工是:**`PhaseAnimator` 是「步骤」,`KeyframeAnimator` 是「轨道」**。步骤之间是顺序关系,每一步可以独立选 spring/easeInOut;轨道之间是并行关系,每条轨道独立给关键帧时间戳。一个心跳按钮(放大→缩小→放大)用 PhaseAnimator;一段「同时 X 轴抖、Y 轴弹、颜色渐变」的复合动画用 KeyframeAnimator。

### 2.7 与 UIKit `UIView.animate` 的心智对照

| 维度 | UIKit | SwiftUI |
| --- | --- | --- |
| 触发方式 | 直接修改属性 | 修改 state,由 diff 推动 |
| 可中断性 | `.allowUserInteraction` 标志位 | 默认可中断,新的 transaction 会接管 |
| 共享元素 | 自己写 `transitioningDelegate` | `matchedGeometryEffect` 一行 |
| 时间驱动 | `CADisplayLink` 手写 | `TimelineView(.animation)` |
| 物理 spring | `UIViewPropertyAnimator` + `UISpringTimingParameters` | `.spring` / `.bouncy` / `.interpolatingSpring` |
| 序列编排 | 嵌套 completion 或 `UIViewPropertyAnimator` | `PhaseAnimator` / `KeyframeAnimator` |

SwiftUI 的优势是「**默认正确**」——动画能从中途的当前值继续插值到新目标,无需你手动取当前值。代价是必须先理解 state-diff 心智,否则会写出「为什么我加了 withAnimation 还是没动画」的困惑代码,这种困惑 99% 是「state 和被动画的属性不在同一棵 diff 子树里」。

### 2.8 `transition`、`contentTransition`、`animation` 三者各管什么

新人最容易混淆这三个。一句话区分:

- **`animation(_, value:)`**:管「**视图存在且属性在变**」的插值。
- **`transition(_:)`**:管「**视图从无到有 / 从有到无**」的进出场。要配合 `withAnimation` 或父级 animation 才会被触发。
- **`contentTransition(_:)`**(iOS 16+):管「**视图本身不变,但内容变了**」(数字滚动、SF Symbol 切换、Text 改字)。`contentTransition(.numericText())` 让 Text 在数字变更时有翻页效果;`contentTransition(.symbolEffect(.replace))`(iOS 17+)让 SF Symbol 切换时有形态过渡。

记忆口诀:**属性改了用 animation,视图来去用 transition,内容换了用 contentTransition**。

## 3. 工程实现

NotesIsland 在「动画」这一篇要落四个有代表性的场景。它们刻意覆盖了不同动画原语,目的是让你在自己写 UI 时能从「场景 → 选哪种 API」直接对号入座,而不是每次都把所有 API 试一遍。

### 3.1 同步状态指示器:隐式动画 + TimelineView 呼吸

```swift
// File: Features/Sync/UI/SyncIndicator.swift
import SwiftUI

// MARK: - SyncIndicator
struct SyncIndicator: View {
    enum SyncState { case idle, syncing, success, failed }
    var state: SyncState

    var body: some View {
        ZStack {
            Circle()
                .fill(color)
                .frame(width: 10, height: 10)
                .scaleEffect(scale)
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: state)
    }

    private var color: Color {
        switch state {
        case .idle: .secondary
        case .syncing: .accentColor
        case .success: .green
        case .failed: .red
        }
    }

    @ViewBuilder
    private var scale: some View {
        EmptyView()
    }
}

// MARK: - 呼吸版本:syncing 时持续脉动
struct PulsingSyncDot: View {
    var isActive: Bool
    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: !isActive)) { ctx in
            let t = ctx.date.timeIntervalSinceReferenceDate
            let phase = (sin(t * 2 * .pi / 1.2) + 1) / 2  // 1.2 秒周期
            Circle()
                .fill(Color.accentColor.opacity(0.4 + 0.4 * phase))
                .frame(width: 10 + 4 * phase, height: 10 + 4 * phase)
        }
        .frame(width: 20, height: 20)
        .animation(.easeInOut, value: isActive)
    }
}
```

要点:

- `TimelineView` 的 `paused: !isActive` 是关键——同步停止时,我们让 timeline 完全暂停,GPU 才不会一直被唤醒。否则就算视图不可见也会刷新。
- 整个动画无 `@State`,完全由时间驱动。这意味着即使在背景下被回收,恢复后立刻在正确的相位上继续,不需要持久化 timer。

### 3.2 列表项展开:matchedGeometryEffect 共享元素

```swift
// File: Features/Notes/NoteListExpandView.swift
import SwiftUI

// MARK: - NoteListExpandView
struct NoteListExpandView: View {
    @State private var notes: [NoteSummary] = NoteSummary.samples
    @State private var expandedID: NoteSummary.ID?
    @Namespace private var noteNS

    var body: some View {
        ZStack {
            if let id = expandedID, let note = notes.first(where: { $0.id == id }) {
                detail(note)
            } else {
                list
            }
        }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                ForEach(notes) { note in
                    NoteRow(note: note)
                        .matchedGeometryEffect(id: note.id, in: noteNS, properties: .frame)
                        .onTapGesture {
                            withAnimation(.spring(response: 0.45, dampingFraction: 0.82)) {
                                expandedID = note.id
                            }
                        }
                }
            }
            .padding()
        }
        .transition(.opacity)
    }

    private func detail(_ note: NoteSummary) -> some View {
        NoteDetail(note: note)
            .matchedGeometryEffect(id: note.id, in: noteNS, properties: .frame)
            .onTapGesture {
                withAnimation(.spring(response: 0.45, dampingFraction: 0.82)) {
                    expandedID = nil
                }
            }
            .transition(.opacity)
    }
}

// MARK: - 子视图(略,仅给签名)
private struct NoteRow: View {
    let note: NoteSummary
    var body: some View {
        HStack { Text(note.title); Spacer() }
            .padding()
            .background(.background.secondary, in: .rect(cornerRadius: 16))
    }
}

private struct NoteDetail: View {
    let note: NoteSummary
    var body: some View {
        VStack(alignment: .leading) {
            Text(note.title).font(.largeTitle.bold())
            Text(note.body).foregroundStyle(.secondary)
            Spacer()
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(.background.secondary, in: .rect(cornerRadius: 24))
        .padding()
    }
}

struct NoteSummary: Identifiable, Sendable {
    let id: UUID
    let title: String
    let body: String
    static let samples: [NoteSummary] = [
        .init(id: UUID(), title: "周会纪要", body: "下周要发版,优先级 P0..."),
        .init(id: UUID(), title: "灵感", body: "做一个动态壁纸 App,让背景随心率呼吸。")
    ]
}
```

要点:

- `@Namespace` 必须**写在共同父视图**里。如果你把它放在 List 内的 row 里,每行各自一个 namespace,就匹配不上。
- `properties: .frame` 只匹配尺寸 + 位置,内容自身的过渡(文字、颜色)走默认 transition。如果你要包括 alpha 等,用 `.frame` 之外可以叠加多个 modifier。
- 两个分支都必须挂同一个 `id`,否则 SwiftUI 不知道是同一元素。

### 3.3 录音条:KeyframeAnimator(iOS 17+)波形序列

```swift
// File: Features/AudioNote/UI/RecordingWave.swift
import SwiftUI

// MARK: - RecordingWave
struct RecordingWave: View {
    var isRecording: Bool

    var body: some View {
        HStack(spacing: 3) {
            ForEach(0..<7, id: \.self) { i in
                bar(index: i)
            }
        }
        .frame(height: 24)
    }

    private func bar(index: Int) -> some View {
        RoundedRectangle(cornerRadius: 1.5, style: .continuous)
            .fill(Color.accentColor)
            .frame(width: 3, height: 24)
            .keyframeAnimator(
                initialValue: WaveKeyframes(),
                repeating: isRecording
            ) { content, value in
                content.scaleEffect(y: value.scaleY, anchor: .center)
            } keyframes: { _ in
                KeyframeTrack(\.scaleY) {
                    LinearKeyframe(0.3, duration: 0.0)
                    SpringKeyframe(1.0, duration: 0.4 + Double(index) * 0.05)
                    SpringKeyframe(0.5, duration: 0.4)
                    LinearKeyframe(0.3, duration: 0.2)
                }
            }
    }
}

private struct WaveKeyframes {
    var scaleY: CGFloat = 0.3
}
```

7 根 bar 每根的 keyframe 都有 5ms 偏移,形成自然的「**波**」错位感。`repeating: isRecording` 让动画在停止时优雅落到 initialValue。

### 3.4 心跳状态:PhaseAnimator 多阶段(iOS 17+)

NotesIsland「同步失败」时,顶部图标先抖动、再变红、再回正。这是典型的多阶段。

```swift
// File: Features/Sync/UI/FailureShake.swift
import SwiftUI

// MARK: - FailureShake
struct FailureShake: View {
    var trigger: Int  // 每次 +1 触发一轮抖动

    var body: some View {
        Image(systemName: "exclamationmark.icloud.fill")
            .font(.title)
            .foregroundStyle(.red)
            .phaseAnimator([0, 1, 2, 3], trigger: trigger) { content, phase in
                content
                    .rotationEffect(.degrees(rotation(for: phase)))
                    .scaleEffect(phase == 3 ? 0.9 : 1.0)
            } animation: { phase in
                switch phase {
                case 0, 3: .easeOut(duration: 0.15)
                default: .easeInOut(duration: 0.08)
                }
            }
    }

    private func rotation(for phase: Int) -> Double {
        switch phase {
        case 1: -10
        case 2: 10
        default: 0
        }
    }
}
```

`trigger: trigger` 决定何时重启序列——每当 `trigger` 值变化,SwiftUI 重新从 phase 0 开始。这比 `withAnimation { ... }` + `DispatchQueue.main.asyncAfter` 嵌套清爽得多。

## 4. 调参与验收

视觉效果的好坏比业务逻辑更难量化:一个 0.05 秒的 spring 改动可能让按钮从「干脆」变成「抽搐」。这一节把关键参数的合理区间与失败模式列清楚,顺便给出验收时必须真机走一遍的路径,因为模拟器的动画曲线在低端机型上常常没有真机准确(尤其涉及帧率限流时)。

### 4.1 关键参数边界

| 项 | 推荐 | 失败模式 |
| --- | --- | --- |
| `spring(response:)` | 0.2-0.5 | 太低会显得脆,太高显得迟钝 |
| `spring(dampingFraction:)` | 0.7-0.9 | <0.6 弹得过头,>0.95 几乎没弹性 |
| 转场 duration | 0.25-0.45 | >0.6 让 UI 看起来卡顿 |
| TimelineView `minimumInterval` | `1/30` 或更低 | 设过低会被系统限流;呼吸灯 1/30 够用 |
| matchedGeometryEffect 同时存在两个 view | 必须互斥 | 同时存在会出现两份并存 |
| Reduce Motion 适配 | `@Environment(\.accessibilityReduceMotion)` | 不处理会被无障碍审查 reject |

### 4.2 验收清单

1. **真机** Reduce Motion 开启(设置 → 辅助功能 → 动态效果),进入 NoteListExpandView,确认共享元素切换降级为淡入淡出(由我们读取环境变量后简化动画实现)。
2. SyncIndicator 切换状态时无闪烁;`PulsingSyncDot` 在 `isActive = false` 时**完全静止**,Instruments → Energy Log 不出现持续 GPU 唤醒。
3. NoteListExpandView 列表中长按 row 滚动列表,确认 `onTapGesture` 不会误触发(下一篇 12 会专门讲手势优先级)。
4. 录音条:点击录音按钮 → 7 根 bar 错位起波;点击停止 → 平滑收回到初始高度。
5. FailureShake:连续点 5 次「重试」按钮(`trigger += 1`),5 次抖动都完整且无叠加(`PhaseAnimator` 每次重启)。
6. Xcode → Debug → View Hierarchy 中,展开时 `RowView` 与 `DetailView` 在树里**没有同时存在**——这是 matchedGeometryEffect 工作的前提。
7. Instruments → SwiftUI 模板,展开列表项时确认主 view 上 body 调用次数 < 5 次;若超出,说明 `expandedID` 引发了不必要的祖先 rebuild,需要把状态下沉(参考第 26 篇)。

### 4.3 性能边界

- **`TimelineView(.animation)` 每帧重算 body**——内部要尽可能轻。复杂视图层级请把昂贵子树挪到 TimelineView 外面,只在内部留差异部分。
- **`withAnimation` 包大块状态变更会拉长 diff 时间**。如果一次切换让 200 个 row 都重算 frame,SwiftUI 必须每帧重新计算它们的中间帧位置,即使你眼睛只看其中 3 个。解决方案:只对受影响的状态用 `withAnimation`,其他状态分离。
- **`matchedGeometryEffect` 在 ScrollView 内有边界**——如果 row 还没滚到屏幕里,LazyVStack 没创建它的视图,共享元素就匹配不上。展开动作发起前请确认 row 已 visible,或者用普通 transition fallback。
- **避免「随便加 `.animation(_)` 单参数版」**——iOS 15 起已弃用,新写法必须带 `value:`。无 value 的版本会把整棵子树「**任何状态变化都动画**」,常导致键盘弹起、Dynamic Type 切换时一堆视图同时飞。
- **`drawingGroup()` 不是动画万灵药**——它会强制把子树离屏到 Metal 纹理,适合一次性渲染密集场景(如几百个 shape 同时缩放),但会破坏 `matchedGeometryEffect` 的跨边界识别,且打断常规 modifier(`shadow`、`blur`)的合成路径。只在 Instruments 看到 layout 阶段成瓶颈时再开。
- **ProMotion 屏(iPhone 13 Pro 起)默认 120Hz**——一帧只有 8.3ms。如果你的动画在 60Hz 模拟器看着流畅但真机卡,通常是某层 modifier 触发了 layout 重算。Instruments 的 「Hitches」 metric 能直接量化掉帧数。

## 5. 踩坑:Swift 6 / iOS 18 与旧教程的差异

### 5.1 不要再写 `animation(_:)` 单参数版

iOS 15 起 `animation(_:)`(无 value 参数)被弃用——它会把整棵子树标记为「随便什么变化都动画」,常常出现「**误动画**」(比如键盘弹起把整个布局重算,所有 view 都开始飞)。新写法必须指定 `value:`:

```swift
// 错(已弃用)
.animation(.spring())

// 对
.animation(.spring, value: expandedID)
```

### 5.2 `withAnimation` 的尾闭包返回值不再忽略(Swift 6)

Swift 6 起 `withAnimation` 的闭包返回值会被传递,如果你忘了用闭包结果会得到编译警告。一般写法是确保闭包只做赋值,不返回需要捕获的值:

```swift
withAnimation(.spring) {
    expandedID = note.id
}
```

### 5.3 `@State` 跨 actor 的隐患

如果你在后台 Task 里直接给 `@State` 赋值,Swift 6 会报 `MainActor isolation`。常见场景是网络回调:

```swift
// 错
Task.detached {
    let data = await fetch()
    self.notes = data  // 编译错误
}

// 对
Task { @MainActor in
    let data = await fetch()
    notes = data
    withAnimation { isLoading = false }
}
```

### 5.4 `matchedGeometryEffect` 与 `id(_:)` 不要同时滥用

`id(_:)` 会让视图丢失身份并强制重建,这会把刚要插值的中间状态打断。如果你给 row 同时挂了 `.id(viewMode)`,且 `viewMode` 在动画过程中变更,SwiftUI 会以为这是一个全新视图,matchedGeometryEffect 就匹配失败。规则是:**让 SwiftUI 自己用结构 + Identifiable 推断身份,只在不得已时用 `id(_:)`**。

### 5.5 Reduce Motion 的合规

iOS 18 起 App Store 审核对「全屏视差动画」「快速闪烁」越来越敏感。每个抢戏的动画都应该读:

```swift
@Environment(\.accessibilityReduceMotion) private var reduceMotion

// 使用:
withAnimation(reduceMotion ? .linear(duration: 0.1) : .spring) { ... }
```

更彻底的做法是为「重要动画」(全屏过渡、卡片展开)统一定义一个 `Animation.primary` 与 `Animation.primaryReduced`,在 reduceMotion 为 true 时切到后者(无 spring、缩短到 0.1s、去掉 scale 变化只保留 opacity)。这不是「让动画消失」,而是「降级到不引发眩晕的等价反馈」——视障与前庭敏感用户能感知到操作完成,但不会被大幅运动诱发不适。

### 5.6 旧的 `UIView.animate(withDuration:)` 心智「同时改多个属性」并不直接搬过来

UIKit 习惯在闭包里同时改几个属性。SwiftUI 的对应物是「在 withAnimation 里同时改多个 state」,但**这些 state 必须都驱动了 Animatable 属性的视图**。如果你 `withAnimation { isExpanded = true }`,但视图里只用 `isExpanded` 切换 `if` 分支,SwiftUI 会走 transition(出现/消失),不是 animation——这时需要给两个分支 `.transition(...)` 或用 matchedGeometryEffect 联通。

### 5.7 `PhaseAnimator` / `KeyframeAnimator` 是 iOS 17+

落到 iOS 16 上需要降级方案。最稳的兜底是「**用 Task + Task.sleep 串多个 withAnimation**」,但这会导致 cancel 时的中断处理变复杂。建议直接在 `Package.swift` / target 的 deployment target 上拉到 iOS 17,把支持成本花在更核心的地方。

### 5.8 `Animation.spring` 的两组参数不要混

iOS 17 起 `Animation.spring` 有两组重载:

```swift
.spring(response: 0.4, dampingFraction: 0.85, blendDuration: 0)  // 旧重载,直观调时长与阻尼
.spring(duration: 0.5, bounce: 0.3)                                // 新重载,直观调总时长与弹性
```

两者参数不可直接换算。新代码推荐 `duration + bounce`(`bounce: 0` 等价 critically damped 无弹,`bounce: 0.5` 中等弹),老代码维持 `response + dampingFraction` 不要混。文档检查时认准重载名,不要凭参数名瞎填。

### 5.9 不要在 `body` 内每次都生成新的 `Animation` 对象

```swift
// 不必要的开销:body 每次重算都创建一个新的 spring,SwiftUI 会以为动画参数变了
.animation(.spring(response: 0.4, dampingFraction: 0.85), value: x)

// 推荐:抽到 static let,SwiftUI 走身份对比更快
static let cardSpring: Animation = .spring(response: 0.4, dampingFraction: 0.85)
.animation(Self.cardSpring, value: x)
```

这是一个小但有效的优化,尤其在频繁重算的列表 row 里。Instruments → SwiftUI 模板能看到 animation 对象创建次数,如果某个 view 每秒生成几百个 Animation 实例,八成是这个原因。

---

SwiftUI 的动画体系给的是「**写得少、表达多、错得早**」。你不会再为了一个共享元素过渡写 200 行 `UIViewControllerAnimatedTransitioning`,代价是:必须先把「state-diff 推动渲染」这一基本心智嵌进肌肉记忆。下一篇我们补上手势——动画的另一半,因为大部分有趣的动画来自手指的拖、捏、按、滑。
