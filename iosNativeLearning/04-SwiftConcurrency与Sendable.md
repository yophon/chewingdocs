# Swift Concurrency 与 Sendable

Swift 6 严格并发模式开启后,数据竞争从"运行时偶发崩"变成"编译期就报错"。这件事是 Swift 6 区别于 Swift 5.x 最大的工程改变,也是新人最容易被"五十个 Sendable 警告"劝退的地方。这一篇讲 Swift Concurrency 的完整心智:**async/await 的结构化并发、Task 与取消、actor 隔离、Sendable 协议、@MainActor 的真实含义**——以及 GCD 在 2026 年还剩什么位置。

> 一句话先记住:**Swift Concurrency 是"语言级 + 运行时 + 编译期 + 标准库"四位一体的并发模型——`async` 函数描述结构化的异步调用、`Task` 管 scope 与取消、`actor` 把共享状态封装成串行访问、`Sendable` 标记"可以安全跨 actor 传递的数据"。Swift 6 严格并发开启后,编译器替你把所有跨 actor 的不安全访问都拒掉,代价是你必须把"哪些数据在哪个隔离域"想清楚。**

---

## 一、async/await 不是"语法糖",是结构化并发

```swift
// 旧:GCD callback 地狱
URLSession.shared.dataTask(with: url1) { data1, _, err in
    guard err == nil, let data1 else { return showError() }
    URLSession.shared.dataTask(with: url2) { data2, _, err in
        guard err == nil, let data2 else { return showError() }
        DispatchQueue.main.async {
            self.show(parse(data1), parse(data2))
        }
    }.resume()
}.resume()
```

```swift
// 新:async/await 顺序结构
func reload() async throws {
    let data1 = try await URLSession.shared.data(from: url1).0
    let data2 = try await URLSession.shared.data(from: url2).0
    show(try parse(data1), try parse(data2))   // 自动在原 actor 上回到主线程
}
```

表面看是"嵌套变线性",**真正改变的是错误传播 + 取消传播**:`throws` 让错误顺调用栈往上抛,`Task` 取消时所有 await 点会抛 `CancellationError`,中间的资源自动释放。GCD 时代你得自己在每个 callback 里检查取消、传错误、清理资源,**90% 内存泄漏来自漏写其中一步**。

`async` 函数有两个关键约束:

1. **只能从另一个 `async` 函数或 `Task { ... }` 里调用**——不能在同步代码里直接 `await`。
2. **调用它会"挂起"当前任务**——编译器在 await 处插入挂起点,运行时把这个任务从一个线程移到另一个(也可能是同一个)。

`await` 不是"线程切换",是"控制权让出 + 调度器决定下次在哪儿继续"。它跟 GCD 的 `dispatch_async` 完全是两套抽象——后者是"提交一个 block 到队列",前者是"暂停我自己,等结果"。

---

## 二、Task:结构化并发的边界

`Task` 是"一段 async 工作的执行单位",有 scope、有优先级、可取消。

```swift
Task {
    let notes = try await api.fetchNotes()
    await MainActor.run { store.notes = notes }
}
```

`Task { ... }` 在调用处创建一个新顶级任务,**与父任务结构无关**。这种叫**非结构化任务**(unstructured),没人管它的生命周期——你 launch 完就管不到了,除非自己存住 `Task` 引用再 `task.cancel()`。

更推荐的是**结构化并发**:

```swift
// async let:并发跑两个,join 时取结果
func reload() async throws {
    async let notes = api.fetchNotes()
    async let tags = api.fetchTags()
    let (n, t) = try await (notes, tags)
    show(n, t)
}

// TaskGroup:动态数量并行
func fetchAll(ids: [UUID]) async throws -> [Note] {
    try await withThrowingTaskGroup(of: Note.self) { group in
        for id in ids {
            group.addTask { try await api.fetchNote(id) }
        }
        var results: [Note] = []
        for try await note in group { results.append(note) }
        return results
    }
}
```

**结构化任务的核心承诺**:父任务结束(正常或取消)前,所有子任务必须结束。`withThrowingTaskGroup` 退出时如果有任务还在跑,Swift 会自动等它们结束(throws 时取消所有未完成)。

| 形式 | 何时用 |
| --- | --- |
| `async let` | 固定数量的并行(2-3 个),并发跑然后 join |
| `TaskGroup` | 动态数量、循环里加任务 |
| `Task { ... }` | 顶级入口(SwiftUI `.task` modifier 内、`button` 点击事件里) |
| `Task.detached` | 完全脱离当前隔离 / 优先级,极少用,有泄漏风险 |

> **能用 `async let` 就别用 `TaskGroup`,能用结构化就别用 `Task { ... }` 顶级任务**。结构化是 Swift Concurrency 的核心承诺,失去结构化就回到 GCD 时代的悲剧。

---

## 三、Task 取消是"协作式"的,不是"抢占式"

`task.cancel()` 不会立刻杀任务,只是设了一个标志。任务里所有 `await` 点会自动检查这个标志,如果取消了,`await` 会抛 `CancellationError`。所以**长循环里要手动检查**:

```swift
func bigJob() async throws {
    for item in hugeList {
        try Task.checkCancellation()   // 不写这行,取消信号传不进来
        process(item)
    }
}
```

SwiftUI 的 `.task { ... }` modifier **会在视图离开屏幕时自动取消任务**,这是声明式 UI + 结构化并发的最大组合优势——你不再需要在 `viewWillDisappear` 里手动停止网络请求。

```swift
struct NoteListView: View {
    @State private var store = NotesStore()
    
    var body: some View {
        List(store.notes) { ... }
            .task {
                await store.reload()    // 视图消失时自动取消
            }
    }
}
```

写过 RxSwift / Combine 的人会发现这相当于自动 `dispose`——再不用 `DisposeBag` / `AnyCancellable` 满地塞。

---

## 四、actor:把"共享可变状态"封装成串行访问

并发的根本问题不是"线程多",是**多个线程同时改同一个状态**。传统方案是加锁(`NSLock` / `os_unfair_lock`),问题是锁是约定式的——你忘了加就死锁或竞争。

`actor` 把锁变成语言原语:

```swift
actor CacheStore {
    private var cache: [String: Data] = [:]
    
    func get(_ key: String) -> Data? { cache[key] }
    func set(_ key: String, _ data: Data) { cache[key] = data }
}

let store = CacheStore()
// 调用 actor 方法必须 await
let data = await store.get("k1")
await store.set("k2", payload)
```

actor 的内部状态**只能通过 actor 自己的方法访问**,这些方法在执行时被串行调度——同一时刻只有一个方法在跑。**编译器替你做了锁**。从外部访问 actor 必须 `await`,因为可能要排队。

`actor` 与 `class` 的差异:

| | class | actor |
| --- | --- | --- |
| 引用类型 | ✅ | ✅(就是带隔离的 class) |
| 多线程访问字段 | 自己负责锁 | 编译器禁止直接访问 |
| 外部调用方法 | 普通调用 | `await` |
| 继承 | 支持 | 不支持 |
| 适用 | 单线程上下文 | 共享可变状态 |

**actor 的典型场景**:网络请求队列、缓存、文件 IO 池、协议状态机。

---

## 五、MainActor:UI 这条线只有一个 actor

`@MainActor` 是 Swift 标准库提供的特殊 actor,**对应主线程**。SwiftUI 的 `View` 协议、`@Observable` 类(默认)都隔离在 `@MainActor`,所以你在 view body 里直接读写 store 字段不需要 await——它们都在主 actor 上。

```swift
@MainActor
@Observable
final class NotesStore {
    var notes: [Note] = []
    
    func reload() async {
        let fetched = try? await api.fetchNotes()  // api 可能在另一个 actor
        // 这一行回到 MainActor 上(因为方法本身 @MainActor)
        self.notes = fetched ?? []
    }
}
```

跨 actor 调用:

```swift
actor API {
    func fetchNotes() async throws -> [Note] { ... }
}

// 在 @MainActor 类里
let api = API()
let notes = try await api.fetchNotes()  // await 跨 actor 跳过去再回来
```

`@MainActor` 可以标在类、方法、属性、整个文件、整个模块上。**标在类上最常见**——`@Observable` Store 几乎都该 `@MainActor`,因为它们是给 UI 用的。

要把一段代码强制丢到 main actor 上跑,用 `MainActor.run`:

```swift
nonisolated func backgroundWork() async {
    let result = expensiveCompute()
    await MainActor.run {
        self.uiField = result
    }
}
```

> SwiftUI 把 main thread 等价于 `@MainActor`,意味着:**所有 View body / Modifier / `@State` 改动都在 main actor 上**。你不再需要 `DispatchQueue.main.async` 切回主线程,只要标 `@MainActor` 或 await 一个 `@MainActor` 函数。

---

## 六、Sendable:跨 actor 传递的"安全护照"

`actor` 解决了"共享可变状态被多线程改"的问题,但**值从一个 actor 传到另一个 actor 时,内容会不会被两边同时改?** 这是 `Sendable` 协议要回答的:

```swift
protocol Sendable { }   // 空协议,只是标记
```

凡是标了 `Sendable` 的类型,编译器保证它"可以安全跨 actor 传递":要么是值类型且字段都 Sendable,要么是 actor 本身(天然隔离),要么是不可变 class,要么是你自己负责的 `@unchecked Sendable`。

**Swift 自动推导 Sendable**:

```swift
struct Note: Sendable {  // 全字段 Sendable,struct 自动 Sendable
    let id: UUID
    let title: String
    let createdAt: Date
}

// enum 自动 Sendable
enum NoteState: Sendable {
    case loading, loaded([Note]), error(String)
}

// final class with 不可变字段 → 自动 Sendable
final class Config: Sendable {
    let endpoint: URL
    let timeout: TimeInterval
    init(...) { ... }
}
```

**不能自动 Sendable 的**:可变 class、含可变字段的 struct(理论上能,实际编译器保守)、闭包(除非显式 `@Sendable` 标注)。

跨 actor 传一个非 Sendable 值,Swift 6 严格并发会编译报错。例子:

```swift
final class Mutable {
    var x = 0
}

actor Foo {
    func consume(_ m: Mutable) { ... }
}

// ❌ Swift 6 严格并发报错:Mutable 不是 Sendable
let m = Mutable()
await Foo().consume(m)
```

解决方法两条路:
1. **改 struct**:把 Mutable 改成值类型,全字段 Sendable,自动满足
2. **改成 actor 或不可变 final class**:用语言原语保证安全

---

## 七、@unchecked Sendable:红线,不是后门

被警告淹没时,最容易的反应是:

```swift
final class Cache: @unchecked Sendable {
    var dict: [String: Data] = [:]  // ❌ 完全不安全
}
```

**`@unchecked Sendable` 等于你向编译器签字"我保证这玩意儿线程安全,出问题我背锅"**。编译器不再检查,警告消失。但实际上你刚标的 `Cache` 是个有可变字典的 class,跨 actor 传过去两边同时改 → 数据竞争,运行时偶发崩。

`@unchecked Sendable` 唯一合理场景:

1. 你**确实**用了 `NSLock` / `DispatchQueue` 等手动同步,且确信正确
2. 桥接 Objective-C SDK 的不可变对象,但 Swift 推导不出来
3. 测试代码

**业务代码遇到 Sendable 警告,正确做法是**:
- 改 struct
- 改 actor
- 改 final class + 全不可变字段

绝不是 `@unchecked Sendable`。这是本系列的红线。

---

## 八、nonisolated:打破 actor 隔离的合法出口

有时候 actor 里的某个方法不访问可变状态,纯计算,本不需要排队:

```swift
actor TokenStore {
    private var tokens: [Token] = []
    
    nonisolated func validate(_ raw: String) -> Bool {
        // 纯函数,不读 tokens,不需要 actor 隔离
        return raw.count == 64 && raw.allSatisfy(\.isHexDigit)
    }
    
    func add(_ token: Token) {
        tokens.append(token)
    }
}

// 调用 validate 不需要 await(因为 nonisolated)
let ok = TokenStore().validate("...")
```

**`nonisolated` 让该方法/属性脱离 actor 隔离**,外部直接同步调用,但代价是它**不能读写 actor 的可变字段**(编译器会检查)。

`nonisolated` 也常用于让 actor 满足某个协议(协议方法没法标 isolated):

```swift
extension TokenStore: CustomStringConvertible {
    nonisolated var description: String {
        "TokenStore"   // 不能读 tokens
    }
}
```

---

## 九、严格并发模式开启后的真实工作量

`SWIFT_STRICT_CONCURRENCY = complete` 打开后,一个 Swift 5 项目升上来,**典型会看到 50-300 个新警告**。处理顺序:

1. **先处理 `@MainActor` 标注**——`@Observable` 类、UI 相关类都标 `@MainActor`,警告大部分会消失。
2. **闭包加 `@Sendable`**——`Task { ... }` 内捕获的非 Sendable 值会报警告,值改 struct 或闭包标 `@Sendable`。
3. **跨 actor 的 closure 参数**——`URLSession.shared.dataTask` 的 completionHandler 之类,新代码全部换 async API。
4. **桥接 OC 的代理类**——可能要 `@preconcurrency import SomeFramework` 临时降级,然后逐步收紧。
5. **最后才考虑 `@unchecked Sendable`**——确实没办法的少数情况。

**典型项目升 Swift 6 严格并发的成本是 1-3 周**,看代码体量。这个迁移**值得做**,因为它把你之前"靠运气"的数据竞争代码全暴露了。Apple 自己的 sample code 也都升级了。

---

## 十、GCD 在 2026 还剩什么位置

GCD(`DispatchQueue`)不会消失,但在 2026 年 SwiftUI + Swift Concurrency 新代码里**几乎不直接出现**。剩余使用场景:

1. **桥接老 SDK**:某个 OC framework 的 callback 派发到自定义队列,这种代码改不动,继续用 GCD。
2. **`DispatchSourceTimer` 高精度定时器**:`Task.sleep(for: .seconds(1))` 在某些精度场景不够,极少。
3. **`DispatchData` / `DispatchIO`**:低级别 IO API,几乎只在 Network framework 内部。
4. **`DispatchQoS` 设置 Task 优先级**:`Task(priority: .background)` 会映射到 GCD 的 QoS。

**新代码绝不要写 `DispatchQueue.main.async`**——这是 Swift 5 时代的标志。`await MainActor.run { ... }` 或者把外层函数标 `@MainActor` 是正解。

---

## 十一、踩坑

1. **`Task { ... }` 满地飞**——非结构化 Task 没人管,view 销毁了它还在跑。SwiftUI 用 `.task { ... }` modifier,事件回调里用结构化 `async let` / `TaskGroup`。
2. **`Task { ... }` 内 `[weak self]` 又来了**——`Task` 闭包会捕获 self 强引用,长跑任务有泄漏风险。视图层用 `.task` 不用担心;Store 内启动的 task 需要存引用并在 deinit cancel。
3. **`Task.checkCancellation()` 忘记写**——长循环不主动检查,取消信号传不进来,任务白跑。
4. **`MainActor.run` 套娃**——在 `@MainActor` 函数里又 `MainActor.run { ... }`,纯属冗余。
5. **`@MainActor` 标在了 actor 上**——actor 已经有自己的隔离,再标 `@MainActor` 等于回到主线程,失去 actor 的并发好处。两者二选一。
6. **跨 actor 传 `Note` 自动失败,然后 `@unchecked Sendable`**——本来 `Note` 应该是 struct,改 struct 自动 Sendable。`@unchecked Sendable` 是绝路。
7. **认为 `await` 是"切线程"**——`await` 是"挂起并交还控制权",运行时可能在同一个线程上 resume。线程切换是运行时调度细节,你管不着,也不该假设。
8. **`Task.sleep` 写成 `Thread.sleep`**——`Thread.sleep` 阻塞当前线程,在 Swift Concurrency 下会饿死 actor。`Task.sleep` 才是非阻塞的协作式挂起。
9. **expecting `Sendable` warning to "go away"**——把 class 改 struct 才是根治,标 `@unchecked Sendable` 是把炸药埋深一点。
10. **`actor` 里持有 `@Observable` Store 的引用 + 在 actor 方法里直接读 store 字段**——store 是 `@MainActor`,actor 不是,跨域读字段会编译报错。要么 `await` 调用 store 的方法,要么让 store 也搬到 actor 里(但 SwiftUI 不能直接绑定非 main actor 的 store)。

---

下一篇 `05-View协议与@State.md`,讲 SwiftUI 的 `View` 协议四要素、为什么 View 是 struct、`body` 重计算与底层重渲染的两层成本、`@State` 的存储槽心智、视图 identity 与 `@State` 生命周期的关系、与 React useState 的对照。
