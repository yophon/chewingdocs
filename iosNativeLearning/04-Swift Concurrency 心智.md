# 04 Swift Concurrency 心智

> 系列基线:iOS 18 / Swift 6 / Xcode 16 / SwiftUI;贯穿项目 NotesIsland(本地优先 + iCloud 同步 + 图片音频笔记)。
> 本篇只讲 Swift Concurrency 自己。`actor / Sendable` 单独留给下一篇,数据竞争编译期消除是 05 篇主题。

---

## 一、机制定位:Apple 为什么要在 Swift 5.5 之后强行重写异步模型

iOS 应用里的异步密度比任何前端框架都高:本地磁盘、SwiftData、`URLSession`、相机帧回调、推送、Core ML 推理、Live Activity 更新,几乎没有一个核心模块能跑在主线程。在 Swift 5.5 之前,这一切由 GCD(`DispatchQueue`)+ closure 嵌套承担,留下了几个无法靠库去封掉的硬伤:

1. **闭包嵌套地狱**:三层网络请求 + 一次写库,大括号往右堆 6 层是常态;错误处理用 `Result` 自己分发,失败分支永远写不全。
2. **没有取消**:`DispatchQueue.async` 派出去的 block,业务上想撤回只能塞 `isCancelled` 标志位,语言层不感知。屏幕一旦滑走,异步还在继续算缩略图、烧电、占内存。
3. **没有结构**:并发是"扔出去"的;父任务结束了,子任务还在跑;一个失败,其他子任务不会停。线程泄漏、僵尸网络请求都来自这里。
4. **隔离靠纪律**:线程切换全靠 `DispatchQueue.main.async { }`,主线程读 UI 状态、子线程改 UI 控件,编译器不会拦。Crash 概率随项目年龄线性增长。
5. **Combine 不是解药**:Combine 用 `Publisher` 把回调包装成流,但 `sink` 仍然要 `store(in:)`、`receive(on:)`、`subscribe(on:)`,心智负担没有降低,只是变了一种形态。

Swift Concurrency 在 Swift 5.5(2021)落地,在 Swift 6(2024)进入严格并发模式后才真正稳定。它要解决的不是"让异步更短",而是把异步从"运行时纪律"提升到"类型系统约束":错误能 `throw`、任务有父子结构、取消能从根传到叶、隔离域由编译器检查。GCD 不会消失(`DispatchSource` 处理文件描述符、`DispatchQueue` 给 C 库桥接、`Timer` / `OSLog` 内部仍依赖),但**业务代码已经不再需要 `DispatchQueue.global().async`**,这是 2026 年 iOS 项目模板的默认假设。

> 与 Flutter / Kotlin 对照:Dart `async/await` + `Future` 是单线程事件循环里的协程,没有真正的并行;Kotlin `suspend` + coroutineScope 模型最接近 Swift,但 Swift 把 actor 隔离也焊进了语言。

---

## 二、Apple 平台心智:四个概念按使用频率排开

Swift Concurrency 在工程上只有四个高频概念,按一周写 5 次的密度排序:

| 概念 | 解决什么 | 所属 framework |
| --- | --- | --- |
| `async` / `await` | 让一个函数声明"我会挂起" | Swift 标准库 |
| `Task { }` | 在同步上下文里启动一个异步任务 | `_Concurrency` |
| `TaskGroup` / `async let` | 在异步上下文里并行子任务,等汇总 | `_Concurrency` |
| `@MainActor` | 标注"只能在主线程跑" | Swift 标准库 |

### 2.1 `async` 函数本质是状态机

`func loadNotes() async throws -> [Note]` 在编译后被拆成一个状态机,挂起点(`await`)是状态转移边界。它不占用线程:挂起时调度器把线程释放给别的任务,恢复时由 Cooperative Thread Pool 找一个新线程继续跑。所以**主线程只有一个,但能跑成百上千个 async 任务**,前提是每个挂起点都把线程让出去。

这也是为什么 Apple 在文档里反复强调"不要在 async 函数里 `Thread.sleep`":那会霸占线程,把整个 cooperative pool 堵死。要等就 `try await Task.sleep(for: .seconds(1))`,它是真正的挂起。

### 2.2 `Task { }` 是"非结构化"入口,但仍然有父子关系

```swift
Task {
    let notes = try await store.loadNotes()
}
```

这是从同步上下文(比如 `Button` 的 `action:`)进入异步世界的**唯一**正确入口。它返回一个 `Task<Success, Failure>` 句柄,可以 `await task.value`、`task.cancel()`、`task.result`。

`Task { }` 有两种形态:

- **顶层 Task**:在同步函数里写 `Task { }`,继承当前 actor 上下文(`@MainActor` 上下文里写就跑在主线程)、不继承优先级。这是 SwiftUI 里点按钮、`onAppear`、`task` modifier 的默认形态。
- **`Task.detached { }`**:**不**继承上下文。它常被滥用——大多数时候你需要的不是 detached,而是 `nonisolated`(05 篇会讲)。这是 Swift 5 教程留下的最大坑之一:遇到隔离报错就 `.detached`,会把取消传播一起切掉。

### 2.3 结构化并发:`async let` 与 `TaskGroup`

只要写在 async 函数体里,父子结构由语言自动维护:

- **`async let`**:并行启动一个固定数量(2-3 个)的子任务,父任务在 `await` 时收割。父函数返回前所有 `async let` 必须收割,否则编译器报错。
- **`TaskGroup`**:并行启动一个动态数量(N 个)的子任务,用 for-await 流式收结果。父任务退出 `withTaskGroup` 时所有子任务自动等齐,**或者取消时一并停**。

结构化的核心承诺是:**父任务结束 → 所有子任务必定结束**(被收割或被取消)。这一条把"僵尸任务"从语言层清掉,是 Combine 永远做不到的。

### 2.4 取消(cancellation)是协作式的

Swift Concurrency 的 cancel **不是**强制中断:调用 `task.cancel()` 只是把任务的 `isCancelled` 标志位拨为 `true`,任务自己必须配合检查:

```swift
try Task.checkCancellation()   // 抛 CancellationError
guard !Task.isCancelled else { return }
```

大多数 Apple 系统 API 已经内建检查:`URLSession.data(for:)` 在取消时会抛 `URLError(.cancelled)`,`Task.sleep` 抛 `CancellationError`,SwiftData 的 fetch 也响应取消。**你自己写的循环必须自检**,尤其是图片缩略图、Core ML 批量推理这种长跑任务。

取消从父向子传播:父 Task 取消,所有 `async let` 与 TaskGroup 子任务的 `isCancelled` 同步置位。这是 SwiftUI 的 `.task { }` modifier 能做到"视图消失自动停异步"的根本原因——SwiftUI 在视图离场时调用了那个 Task 的 cancel。

### 2.5 `@MainActor`:UI 的隔离边界

SwiftUI 几乎所有视图相关协议(`View`、`App`、`ObservableObject` 旧路径、`@Observable` 内部)都默认在 `@MainActor` 上跑。这意味着:

- 你在 `body` 里调用一个普通 `async` 函数,需要 `await`,不需要手动 `DispatchQueue.main.async` 切回来。
- 你在后台 actor 里算完结果,要更新 UI,只需 `await MainActor.run { ... }` 或调用一个 `@MainActor` 函数。
- `Task { @MainActor in ... }` 显式声明任务跑在主线程,是从非主上下文回主线程最干净的写法。

> 与 GCD 对照:`DispatchQueue.main.async { }` 是运行时切线程、编译器不感知;`@MainActor` 是类型级别的标注,编译器看到跨界就报错。后者把"忘记切回主线程导致 UI 闪烁"这类 bug 直接清零。

---

## 三、工程实现:NotesIsland 的"加载笔记 + 并发拉缩略图"

下面给一段可运行的 Swift 6 严格并发代码。NotesIsland 启动时要做三件事:
1. 从本地 SwiftData 读最近 50 条笔记元数据;
2. 并行从 iCloud 拉每条笔记的预览缩略图 URL(每条独立请求);
3. 主线程合并到视图状态。

```swift
// File: Features/Notes/NoteFeedLoader.swift
// 基线:Swift 6 严格并发 / iOS 18 / Xcode 16

import Foundation
import SwiftData

// MARK: - 领域模型(Sendable 在 05 篇讲,这里先用 struct + 值类型)

struct NoteSummary: Sendable, Identifiable {
    let id: UUID
    let title: String
    let updatedAt: Date
    var thumbnailURL: URL?
}

enum FeedError: Error {
    case offline
    case decoding
}

// MARK: - 本地读取(假装 SwiftData,实际签名一致)

protocol LocalNoteStore: Sendable {
    func recentSummaries(limit: Int) async throws -> [NoteSummary]
}

// MARK: - 远端缩略图

protocol ThumbnailService: Sendable {
    func thumbnailURL(for noteID: UUID) async throws -> URL
}

// MARK: - 组合器:结构化并发的主战场

struct NoteFeedLoader {
    let local: LocalNoteStore
    let thumbnails: ThumbnailService

    /// 拉本地 50 条 + 并行补缩略图,任何一条缩略图失败不影响其它。
    func loadFeed(limit: Int = 50) async throws -> [NoteSummary] {
        // 1) 本地先到,这里 await 一次,失败直接抛
        let base = try await local.recentSummaries(limit: limit)

        // 2) 用 TaskGroup 并行拉缩略图;子任务数量是动态的(= base.count)
        return try await withThrowingTaskGroup(of: (UUID, URL?).self) { group in
            for summary in base {
                group.addTask {
                    // 每次循环先看父任务是否被取消
                    try Task.checkCancellation()
                    do {
                        let url = try await thumbnails.thumbnailURL(for: summary.id)
                        return (summary.id, url)
                    } catch is CancellationError {
                        throw CancellationError()
                    } catch {
                        // 单条失败不抛出去,父收集时填 nil
                        return (summary.id, nil)
                    }
                }
            }

            var byID: [UUID: URL?] = [:]
            for try await (id, url) in group {
                byID[id] = url
            }

            return base.map { summary in
                var copy = summary
                copy.thumbnailURL = byID[summary.id] ?? nil
                return copy
            }
        }
    }
}

// MARK: - 视图模型:跑在 @MainActor,直接持有视图状态

// File: Features/Notes/NoteFeedViewModel.swift
@MainActor
@Observable
final class NoteFeedViewModel {
    enum Phase: Sendable {
        case idle, loading, ready([NoteSummary]), failed(FeedError)
    }

    private(set) var phase: Phase = .idle
    private var currentTask: Task<Void, Never>?

    private let loader: NoteFeedLoader

    init(loader: NoteFeedLoader) {
        self.loader = loader
    }

    /// 视图 .task { } 调用;视图消失会自动 cancel,所以不需要在这里写 cancel 逻辑
    func refresh() async {
        currentTask?.cancel()                    // 防抖:旧任务先停
        phase = .loading

        let task = Task { [loader] in
            try await loader.loadFeed()
        }
        currentTask = task

        do {
            let feed = try await task.value
            guard !Task.isCancelled else { return }
            phase = .ready(feed)
        } catch is CancellationError {
            // 视图主动取消,不当错误
        } catch let err as FeedError {
            phase = .failed(err)
        } catch {
            phase = .failed(.offline)
        }
    }
}

// MARK: - 视图:.task modifier 才是 SwiftUI 里启动异步的正确入口

// File: Features/Notes/NoteFeedView.swift
import SwiftUI

struct NoteFeedView: View {
    @State private var model: NoteFeedViewModel

    init(loader: NoteFeedLoader) {
        _model = State(wrappedValue: NoteFeedViewModel(loader: loader))
    }

    var body: some View {
        content
            .task { await model.refresh() }      // 视图离场时自动 cancel
            .refreshable { await model.refresh() }
    }

    @ViewBuilder
    private var content: some View {
        switch model.phase {
        case .idle, .loading:
            ProgressView()
        case .ready(let notes):
            List(notes) { note in
                NoteRow(summary: note)
            }
        case .failed:
            ContentUnavailableView("加载失败", systemImage: "icloud.slash")
        }
    }
}

private struct NoteRow: View {
    let summary: NoteSummary
    var body: some View {
        Text(summary.title)
    }
}
```

代码点评:

- `withThrowingTaskGroup` 是 N 个并行子任务、其中任何一个抛错会自动取消其它兄弟、父函数把错往上抛的标准结构。这里用 `do { } catch { return nil }` 把"单条缩略图 404"降级成 nil,不让一条坏数据废掉整张 feed。
- `loadFeed` 没有任何线程切换,**因为没必要**。SwiftUI 的 `.task` 默认继承 `@MainActor`,但 `NoteFeedLoader` 不是 `@MainActor`,Swift 编译器自动把里面的 `await` 当成 hop 到 cooperative pool。要回主线程更新状态时,因为 `NoteFeedViewModel` 是 `@MainActor`,赋值 `phase = ...` 又自动 hop 回主线程。整个过程零 `DispatchQueue`。
- `refresh()` 里手动维护 `currentTask`,是为了"用户连续下拉刷新时,旧请求自动作废"。这是结构化并发覆盖不到的少数场景之一——跨函数调用边界的"任务防抖"必须自己维护句柄。

---

## 四、调参与验收

### 4.1 可调的几个旋钮

- **优先级**:`Task(priority: .userInitiated) { }` 默认 `.userInitiated`(SwiftUI 顶层一般足够),后台索引可以用 `.utility` 或 `.background`,避免抢占动画帧。
- **`Task.yield()`**:长跑循环每隔几百次手动让出一次,让滚动/动画有机会插队。Core ML 批推理、文件批量扫描里值得加。
- **`Task.sleep(for: .seconds(_:))`**:替代 `Thread.sleep`,在 retry/backoff 里使用。
- **`.task(id:)` modifier**:`.task(id: searchText) { ... }` 在 id 变化时自动 cancel 旧 task 启动新的,等价于上面手写 `currentTask?.cancel()`,SwiftUI 自带的更干净。

### 4.2 手动验收清单

1. 在 Xcode 16 把项目 SwiftSettings 切到 `.swiftLanguageMode(.v6)`,代码必须零 warning 零 error。
2. 启动 App,触发 `NoteFeedView`,在 Instruments 用 **Swift Concurrency** 模板看任务图:应当有 1 个父任务 + 多个子任务,所有子任务都挂在父任务下,而不是平铺。
3. 在加载未完成时立刻退到上一页:Console 不应再打印缩略图请求的日志(取消已传播到 group)。
4. 把网络拔掉:`.failed(.offline)` 状态展示在 `ContentUnavailableView`,不是闪退。
5. 在 `loader.loadFeed` 里手动塞 `try Task.checkCancellation()`,再触发取消,验证父子取消链路。
6. Time Profiler 主线程火焰图里,`NoteFeedLoader.loadFeed` **不应出现**——所有真实工作在 cooperative pool。

### 4.3 真机 vs 模拟器

- 模拟器的 cooperative pool 大小受 host Mac CPU 影响,实际并行度可能比真机更高。压力测试看真机。
- iOS 18 真机上 cooperative thread 数 ≈ 系统活动核数;**不要**手动开几百个 `Task`,会饱和到 thread starvation,反而比 5 个并行慢。

---

## 五、踩坑:与 Swift 5 / iOS 16 旧教程的差异清单

### 5.1 不再写 `DispatchQueue.main.async`

老教程里"网络回来切主线程"的写法,在 Swift 6 项目里出现就是味道不对。正确做法:
- 视图模型类型上加 `@MainActor`,所有方法默认主线程;
- 跨 actor 调用时直接 `await`,编译器自动 hop。

### 5.2 `Task.detached` 是反模式(99% 的情况下)

Swift 5 时代很多教程教"用 `.detached` 跳出 MainActor"。Swift 6 严格并发里这通常意味着你**绕过了取消传播**(detached 任务不继承父 task)。正确的方式:把那个工作交给一个独立的 `actor` 或 `nonisolated` 函数(下一篇详谈),`Task { }` 仍然继承上下文,所有取消、优先级都正常传递。

### 5.3 `@escaping` closure 里捕获 `self`

`URLSession.shared.dataTask(with:) { data, _, _ in self.handle(data) }` 这种写法在 Swift 6 严格并发下会出 Sendable 报错(closure 可能跨线程,`self` 不 Sendable)。直接迁到 `let (data, _) = try await URLSession.shared.data(from: url)`,没有逃逸 closure 就没有 Sendable 问题。

### 5.4 `withCheckedContinuation` 是桥接 API,不是常规手段

旧 delegate 风格 SDK(`CLLocationManager`、`AVAudioSession`)只能 callback,需要用 `withCheckedThrowingContinuation { cont in ... cont.resume(...) }` 包装。注意:**`resume` 必须且只能调用一次**,多次会 trap,零次会泄漏。Swift 6 给了 `withCheckedContinuation` 在 debug 下的运行时检查,但 release 不查,自己保证。

### 5.5 `for await` 必须看清楚是 AsyncSequence 还是 AsyncStream

- `URLSession.bytes(for:)` 返回 `AsyncBytes`,一边收一边解码;
- `NotificationCenter.default.notifications(named:)` 返回 AsyncSequence;
- 自己造的回调流要用 `AsyncStream.makeStream(of:)`,在 iOS 17+ 引入,比手写 `AsyncStream { continuation in ... }` 更安全(continuation 不会泄漏)。

### 5.6 SwiftUI `.task { }` ≠ `Task { }`

`.task { ... }` 是 view modifier,**视图离开时自动 cancel**;`Task { ... }` 是非结构化,生命周期独立,需要你自己 cancel。视图里能用 `.task` 就别用 `Task`。

### 5.7 不要用 `Task { @MainActor in ... }` 包整段同步代码

很多 Swift 5 教程在 `viewDidLoad` 里写 `Task { @MainActor in self.label.text = ... }`,这是绕弯子。`viewDidLoad` 本身就在主线程,直接写 `self.label.text = ...` 即可。`Task { @MainActor in }` 只在从非主线程(如 delegate 回调)回主线程时使用。

### 5.8 iOS 19+ 新 API 简记

iOS 19 在 Concurrency 上的主要补强是 **isolated parameter** 与 **custom executor** 的工程化,前者让"传一个 actor 进来,函数体在它的隔离域里跑"成为公开特性。本篇仍以 iOS 18 为基线,涉及到时单独标注。

---

## 六、一句话总结

```text
async/await   = 把回调嵌套压平成线性,挂起点是状态转移
Task          = 同步进异步的唯一入口,继承上下文与取消
TaskGroup     = 动态 N 个子任务的容器,父退则子停
@MainActor    = UI 的隔离域,编译期检查,不再 DispatchQueue.main.async
```

下一篇,`actor` / `Sendable` / `@unchecked Sendable` 红线、Swift 6 严格并发如何把数据竞争塞进编译器去抓。
