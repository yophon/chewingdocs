# 05 actor / Sendable / 严格并发

> 系列基线:iOS 18 / Swift 6 / Xcode 16 / SwiftUI;贯穿项目 NotesIsland。
> 上一篇讲完了 `async/await` / `Task` / 结构化并发。本篇收尾 Swift Concurrency 的另一半:**把数据竞争塞进编译器**。Swift 6 这一步的野心是 Rust 级别的——只是落地姿势完全不一样。

---

## 一、机制定位:数据竞争为什么必须从运行时移到编译期

iOS 历史上的崩溃大头里,有一类不会出现在测试报告里,只会随机出现在用户的 Crashlytics 上:**多线程同时改一个可变对象**。表现可能是 `EXC_BAD_ACCESS`、`malloc: pointer being freed was not allocated`,也可能只是数字莫名其妙变成了 0。Objective-C 时代靠 `@synchronized`、`NSLock`、`dispatch_barrier_async` 自己堵——堵漏一处是一处,堵不漏是常态。

Swift 5 时代加了 `async/await`,但并发安全仍然靠运行时纪律:`@MainActor` 是个属性宏,跑错了顶多 assertion failure,生产环境不抓。Swift 5.5 - 5.10 的"渐进式严格并发"用 `-strict-concurrency=complete` 把警告打开,但只是 warning,工程上几乎没人开。

**Swift 6 在 2024 把 strict concurrency 变成默认的 error**。把项目的 `SwiftSettings` 切到 `.swiftLanguageMode(.v6)`,任何一处跨隔离域传递非 Sendable 类型,就是编译失败。这不是新增 API,而是给已有的 `actor` / `Sendable` / `@MainActor` 三件套上了强制收紧。

它要解决的问题清单:

1. **可变共享状态访问没有同步** → `actor` 自动串行化访问。
2. **值在线程间逃逸时身份不清** → `Sendable` 协议在类型上标注"安全跨线程"。
3. **UI 状态被后台线程改** → `@MainActor` 在编译期挡住。
4. **第三方库的隔离信息缺失** → `@preconcurrency import Foo` 与 `@unchecked Sendable` 是逃生口,但每次使用都是技术债。

> 与 Rust 对照:Rust 用 `Send` + `Sync` + 借用检查器,把所有权和并发绑在一起;Swift 用 `Sendable` + actor 隔离 + ARC,放弃了所有权追踪,但保留了同等强度的"跨线程检查"。Swift 的代价是 actor 之间通信都得 `await`(运行时切上下文),Rust 的代价是写起来要和借用检查器搏斗。两者都比 Java / C# 的"加锁吧"模式高一个维度。

---

## 二、Apple 平台心智:三件套与四种隔离域

### 2.1 三件套

| 概念 | 角色 | 决定 |
| --- | --- | --- |
| `actor` | 一种引用类型,内部状态自动串行化 | 实例方法默认 isolated;跨实例调用必须 `await` |
| `Sendable` | 协议,值/对象"可以安全跨隔离域传递"的契约 | 编译期检查,Swift 6 严格模式下传不安全类型直接报错 |
| `@MainActor` | 一种全局 actor,绑定主线程 | 类型 / 方法 / 属性都能标,所有 UI 框架默认在它的隔离域 |

### 2.2 四种隔离域,按工程频率排开

- **`@MainActor` 域**:UI、ViewModel、`@Observable` 模型几乎都在这里。
- **自定义 `actor` 域**:缓存、计数器、连接池、上传队列。
- **`nonisolated` 域**:无任何隔离的纯函数 / 只读属性,可以从任意上下文同步调用。
- **顶层 / `Task.detached` 默认域**:不属于任何 actor,在 cooperative pool 上随便跑。

跨域调用 = 异步 = `await`。这是 Swift Concurrency 的总规律。

### 2.3 actor 不是"线程",是"队列"

很多人初见 actor 想成"一个 actor = 一个线程"。这是错的。actor 用的是 Apple 内部叫 **serial executor** 的机制:同一个 actor 实例的所有方法调用排在同一条 logical queue 上,运行时由 cooperative pool 借出空闲线程跑。**actor 切上下文不切线程**,所以创建一万个 actor 也不会爆线程。

actor 的核心保证:

```text
对同一个 actor 实例的所有 isolated 方法调用,在物理上不会重叠执行。
所以 actor 内部的字段读写就像单线程代码一样不需要锁。
```

这一条让 NotesIsland 的"全局图片缓存"、"上传队列"、"标签索引"这类共享状态从此不再需要任何手动加锁。

### 2.4 Sendable:类型级别的"线程通行证"

一个值要跨 actor 边界传过去,它的类型必须 `: Sendable`。编译器自动给三类东西打 Sendable:

1. **不可变值类型**(`struct` 全字段都是 Sendable、`enum` 关联值都是 Sendable);
2. **`Copyable`+ frozen 的标准库类型**(`Int` / `String` / `URL` / `Date` / `UUID` 等);
3. **`final class` 且只有 `let` 不可变字段、字段也都 Sendable**。

工程里最常踩雷的几类:

- **闭包**:必须显式标 `@Sendable () -> Void` 才能逃过隔离域;
- **`class`**:除非 final + 全 let + 字段 Sendable,否则要么标 `: Sendable` + 自证(锁、actor 包),要么用 `@unchecked Sendable`;
- **泛型**:`Array<T>` 是 Sendable 当且仅当 `T: Sendable`,所以泛型函数经常需要 `where T: Sendable` 约束。

`@unchecked Sendable` 是**红线**:它告诉编译器"这个类型我自己保证线程安全,你别管"。一旦写下,出错就是运行时事故。下面会专门讲什么时候允许、什么时候是技术债。

### 2.5 nonisolated 与 nonisolated(unsafe)

`actor MyCache { nonisolated let identifier: String }` 让 `identifier` 从 actor 隔离里跳出来,可以在任意上下文同步访问——前提是它是 `let` 且类型 Sendable。这是 actor 暴露"只读 metadata"的标准姿势,比把所有 getter 都做成 async 高效得多。

iOS 17+ 引入 `nonisolated(unsafe)`,语义类似 `@unchecked Sendable` 但作用于属性级:你声称这个属性的访问由别的手段保护(底层锁、原子操作)。同样是红线,99% 的场景不需要它。

---

## 三、工程实现:NotesIsland 的缩略图缓存 actor

下面给 NotesIsland 的图片缩略图缓存一个完整的 Swift 6 严格并发实现:

- 多个视图并发请求同一张缩略图,只触发一次远端请求(去重);
- 缓存淘汰策略最近最少使用(LRU,容量上限 128);
- 提供同步可读的 metadata(命中率、容量),不阻塞缓存主流程。

```swift
// File: Features/Notes/Image/ThumbnailCache.swift
// 基线:Swift 6 严格并发 / iOS 18

import Foundation
import UIKit

// MARK: - 领域模型:Sendable 由编译器自动综合

struct ThumbnailKey: Hashable, Sendable {
    let noteID: UUID
    let pixelSize: Int            // 200 / 400 / 800
}

/// UIImage 不是 Sendable,我们包一层"已渲染好的 PNG bytes",这个是 Sendable
struct ThumbnailPayload: Sendable {
    let pngData: Data
    let renderedAt: Date
}

// MARK: - 远端下载,签名是 Sendable closure

protocol ThumbnailDownloader: Sendable {
    func download(_ key: ThumbnailKey) async throws -> ThumbnailPayload
}

// MARK: - actor 隔离的 LRU 缓存

actor ThumbnailCache {

    // MARK: 配置:nonisolated let,任何上下文同步可读
    nonisolated let capacity: Int

    // MARK: 内部状态:只有 isolated 方法可触
    private var storage: [ThumbnailKey: ThumbnailPayload] = [:]
    private var lru: [ThumbnailKey] = []
    private var inflight: [ThumbnailKey: Task<ThumbnailPayload, Error>] = [:]

    // MARK: 统计:isolated 读,所以暴露 async getter
    private(set) var hits: Int = 0
    private(set) var misses: Int = 0

    private let downloader: ThumbnailDownloader

    init(capacity: Int = 128, downloader: ThumbnailDownloader) {
        self.capacity = capacity
        self.downloader = downloader
    }

    // MARK: 主流程:命中即返,未命中触发去重的远端拉取

    func thumbnail(for key: ThumbnailKey) async throws -> ThumbnailPayload {
        // 1) 命中:更新 LRU 顺序,直接返回
        if let cached = storage[key] {
            hits += 1
            touch(key)
            return cached
        }
        misses += 1

        // 2) 去重:有正在进行的请求,等同一个 Task
        if let inflightTask = inflight[key] {
            return try await inflightTask.value
        }

        // 3) 新建下载任务,挂在 inflight 里
        let task = Task<ThumbnailPayload, Error> { [downloader] in
            try await downloader.download(key)
        }
        inflight[key] = task

        defer { inflight[key] = nil }

        let payload = try await task.value
        insert(key: key, payload: payload)
        return payload
    }

    // MARK: LRU 内部维护:私有 isolated 函数,不需要 await

    private func touch(_ key: ThumbnailKey) {
        if let idx = lru.firstIndex(of: key) {
            lru.remove(at: idx)
        }
        lru.append(key)
    }

    private func insert(key: ThumbnailKey, payload: ThumbnailPayload) {
        storage[key] = payload
        touch(key)
        while lru.count > capacity {
            let evicted = lru.removeFirst()
            storage[evicted] = nil
        }
    }

    // MARK: 暴露给 UI 的快照:跨 actor 传出去的是值类型 + Sendable

    struct Stats: Sendable {
        let hits: Int
        let misses: Int
        let storedCount: Int
        var hitRate: Double {
            let total = hits + misses
            return total == 0 ? 0 : Double(hits) / Double(total)
        }
    }

    func stats() -> Stats {
        Stats(hits: hits, misses: misses, storedCount: storage.count)
    }
}

// MARK: - 视图模型:@MainActor 类型,显式声明 UI 隔离

// File: Features/Notes/Image/ThumbnailViewModel.swift
import SwiftUI

@MainActor
@Observable
final class ThumbnailViewModel {
    enum LoadState: Sendable {
        case idle, loading, loaded(UIImage), failed
    }

    private(set) var state: LoadState = .idle

    private let cache: ThumbnailCache
    private let key: ThumbnailKey

    init(cache: ThumbnailCache, key: ThumbnailKey) {
        self.cache = cache
        self.key = key
    }

    func load() async {
        state = .loading
        do {
            // 跨 actor 调用,Swift 6 编译期保证 ThumbnailPayload 是 Sendable
            let payload = try await cache.thumbnail(for: key)

            // payload.pngData 是 Sendable,在 MainActor 里安全解码成 UIImage
            if let image = UIImage(data: payload.pngData) {
                state = .loaded(image)
            } else {
                state = .failed
            }
        } catch {
            state = .failed
        }
    }
}

// MARK: - 视图

struct ThumbnailView: View {
    @State private var model: ThumbnailViewModel

    init(cache: ThumbnailCache, key: ThumbnailKey) {
        _model = State(wrappedValue: ThumbnailViewModel(cache: cache, key: key))
    }

    var body: some View {
        Group {
            switch model.state {
            case .idle, .loading:
                Color.gray.opacity(0.1)
            case .loaded(let image):
                Image(uiImage: image).resizable().scaledToFill()
            case .failed:
                Image(systemName: "photo")
            }
        }
        .task { await model.load() }
    }
}
```

代码点评:

- **`ThumbnailCache` 是一个 actor**。所有 `storage` / `lru` / `inflight` 字段不需要任何锁,语言级别保证同一时刻只有一个调用在执行。
- **去重靠 `inflight: [Key: Task]`**。两个视图同时请求同一张图,第二个会落到 `if let inflightTask = inflight[key]` 分支,等同一个 Task,远端只发一次。这个模式在 actor 之外极难写对,在 actor 里只是十行普通代码。
- **`UIImage` 不是 Sendable**(它内部缓存可变 backing store),所以缓存里**不能**存 `UIImage`,只存 `Data`。在视图层(MainActor 上下文)再 `UIImage(data:)` 解码,这次解码是在 MainActor 域内的局部变量,不存在跨域。
- **`Stats` 是 struct + 全 Sendable 字段**,可以从 actor 安全返回。任何"我想从 UI 看缓存命中率"这种需求都用这种"快照 struct" pattern。
- **`@MainActor @Observable final class`** 是 Swift 6 + SwiftUI 项目的视图模型标准三连。`@Observable` 在下一章节展开,这里只需要知道它产生一个 MainActor 限定的可观察类型,赋值 `state = ...` 自动触发视图重计算。
- **`Task<ThumbnailPayload, Error>` 自身是 Sendable**(标准库保证),所以把它放在 `inflight` 字典里、跨 await 边界传递都安全。

---

## 四、调参与验收

### 4.1 严格并发的开关位置

```swift
// File: Package.swift 或 Xcode Build Settings
.target(
    name: "NotesIsland",
    swiftSettings: [
        .swiftLanguageMode(.v6),                // 严格并发默认 = error
        .enableUpcomingFeature("ExistentialAny"),
        .enableUpcomingFeature("StrictConcurrency"), // 5.x 项目向 6 迁移用
    ]
)
```

Xcode 16 工程在 Build Settings → Swift Compiler - Language → **Swift Language Version** 选 `Swift 6`,等价。

### 4.2 手动验收清单

1. 把上面三段代码贴进项目,`SWIFT_VERSION = 6.0`,编译应当**零** warning 零 error。
2. 故意把 `ThumbnailPayload` 里的 `pngData` 类型改成 `UIImage`:编译器立即在 `func thumbnail(for:) async throws -> ThumbnailPayload` 这一行报错"non-Sendable"。**这就是 Swift 6 该做的工作**。
3. 把 `ThumbnailCache` 上的 `actor` 关键字去掉、改成 `final class`,字段访问立刻爆出一连串隔离错误。
4. 在 ThumbnailViewModel 里把 `@MainActor` 去掉:编译器报"property 'state' is mutated from non-MainActor context"。再加回去,绿。
5. 跑两次启动 App、连点同一行笔记触发缩略图;在调试器对 `cache.inflight` 设条件断点,确认两次请求合并成一次远端调用。
6. 在 Instruments 的 **Swift Concurrency** 模板里看 actor hop:visual 上会看到所有访问都走同一个 serial executor。

### 4.3 性能旋钮

- **粒度**:把"图片缓存"、"上传队列"、"草稿索引"做成三个独立 actor,而不是一个大 actor。actor 越大,串行化的瓶颈越宽。
- **不要把每个领域对象都包成 actor**。actor 适合"共享可变状态",不适合"每次创建一份新的"——后者用 struct 就够了。
- **重读为主的状态**:考虑 `nonisolated let` snapshot,而不是每次都 await。
- **避免 actor 之间互相 await**:容易构成环状依赖,虽然语言层不会死锁(actor 模型不死锁,只会延迟),但会拖慢响应。

### 4.4 与 Rust Send/Sync 对照

| 维度 | Rust | Swift |
| --- | --- | --- |
| "可安全跨线程发送"的标记 | `Send` | `Sendable` |
| "可安全跨线程共享引用"的标记 | `Sync` | (隐含,actor 内部串行化) |
| 检查时机 | 编译期 + 借用检查器 | 编译期 + actor 运行时 hop |
| 共享可变状态 | `Mutex<T>` / `RwLock<T>` | `actor` |
| 逃生口 | `unsafe impl Send` | `@unchecked Sendable` |
| 代价 | 学习借用 | actor 跨域要 await |

两者都把"运行时数据竞争"降级成"编译期 / 静态约束"。Swift 走得没 Rust 远(没有所有权),但在 Apple 平台业务代码密度下,这种"够用"的强度恰好。

---

## 五、踩坑:与 Swift 5 / iOS 16 旧教程的差异

### 5.1 `@unchecked Sendable` 是红线,只有三类场景允许

- 桥接一个由 C / Objective-C 实现、内部用锁保护的类(比如 Apple 自家某些 framework 没标 Sendable);
- 自己实现了 `os_unfair_lock` / `DispatchQueue` 串行化的类,有完整测试覆盖;
- 临时迁移用,**必须**配 TODO + Sentry 监控。

**禁止**:看到 Sendable 报错就 `@unchecked` 关掉。这会把数据竞争从"编译期 100% 抓住"退化到"运行时 0% 抓住",倒退到 Swift 5。

### 5.2 `ObservableObject` + `@Published` 已被淘汰

Swift 5 教程满屏 `class VM: ObservableObject { @Published var x: Int }`。Swift 6 + iOS 17+ 推荐 `@Observable` 宏:

```swift
@Observable
@MainActor
final class VM { var x: Int = 0 }
```

`@Observable` 字段级追踪、不基于 Combine、与严格并发协同更顺。`@Published` 走 Combine,Combine `Publisher` 默认不是 Sendable,跨 actor 时一堆兼容问题。本系列从 07 篇开始全部用 `@Observable`。

### 5.3 不要给 SwiftUI View 加 `@MainActor`

View 协议本身已经 `@MainActor`,再标一遍是冗余的,有时还会触发编译器歧义。**只在 View 之外的类**(ViewModel、Coordinator)上标 `@MainActor`。

### 5.4 `Task.detached` 不要用来"跳出 MainActor"

旧教程的标准写法:`Task.detached { let x = await heavyWork() }`。Swift 6 里更干净的写法:把 `heavyWork()` 放在一个**不是** MainActor 的类型上(普通 actor 或 nonisolated 函数),从 MainActor 调用它的时候自动 hop。**让类型决定隔离,而不是让调用点决定**。

### 5.5 `nonisolated(unsafe)` 不是 `nonisolated`

`nonisolated let identifier: String`:安全,因为 let + Sendable。
`nonisolated(unsafe) var counter: Int`:**不安全**,告诉编译器闭嘴。除非你已经在外部做了同步,否则别用。

### 5.6 闭包的 `@Sendable` 标注

Swift 6 严格并发下,逃逸闭包要跨 actor 必须 `@Sendable`:

```swift
func observe(_ handler: @Sendable @escaping (Event) -> Void) { ... }
```

handler 内不能捕获非 Sendable 的 `self`、不能改外部可变变量。这是为什么 Swift 6 项目里大量 callback 都被改写成 AsyncSequence。

### 5.7 第三方库迁移期:`@preconcurrency import`

很多第三方库没赶上 Swift 6:

```swift
@preconcurrency import LegacyAnalytics
```

`@preconcurrency` 告诉编译器"这个 import 的所有类型按 Swift 5 模式宽松处理,不要因为它没标 Sendable 就报错"。这是合法的过渡手段,不算技术债。等库升级后摘掉。

### 5.8 全局变量是 Swift 6 最大的存量地雷

```swift
var globalCounter = 0     // Swift 6 报错:全局可变变量必须隔离
```

要么 `let` 改成不可变,要么放进 `actor`,要么标 `@MainActor` 让它跑在主线程。**没有第四个选项**。这一条是把大量旧项目挡在 Swift 6 之外的主要原因。

### 5.9 iOS 19+ 标注:`isolated` 参数公开化

iOS 19 / Swift 6.x 里,`func work(on actor: isolated MyActor)` 这种"接收 actor 实例,函数体在它的隔离域里跑"成为推荐 API 形式,可以省去内部一次 `await`。本系列正篇主线仍按 iOS 18 写,涉及到时单独标注。

---

## 六、一句话总结

```text
actor      = 一种串行化的引用类型,内部状态自动安全
Sendable   = 一种类型契约,"我能跨隔离域被传递"
@MainActor = 一种全局 actor,UI 的家
strict     = Swift 6 把上面三条从警告升成编译错误
```

下一篇起,我们从 Swift 心智段切到 SwiftUI 声明式渲染。先从 `View` 协议、`body: some View`、`@State` 开始,把"视图是值类型"这一条理顺。
