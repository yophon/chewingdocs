# Swift 6 类型系统

写过 Java / Kotlin / TS 的人来看 Swift,第一反应通常是"哦,又一个面向对象 + 泛型 + 协议"。这种印象会让你**永远只用 Swift 的 30%**——把 Swift 当 Kotlin 写,然后被 `some View`、`any Error`、`Sendable`、`@Observable` 一通暴击。Swift 6 类型系统的核心不在语法,在**值语义 + 协议优先**这两件事——这一篇就讲透这两件事。

> 一句话先记住:**Swift 的类型分两条路——值类型(`struct` / `enum`)走"复制 + 不可变 + 编译期能 inline"路线;引用类型(`class` / `actor`)走"共享 + 身份 + 生命周期"路线。SwiftUI 的 View 都是 struct,SwiftData 的 `@Model` 都是 class,`@Observable` 是宏给 class 加字段追踪,`actor` 是给 class 加并发隔离。这条二分线索贯穿整个 Swift 6。**

---

## 一、struct vs class:不是"语法糖差异",是内存模型差异

```swift
struct Point { var x: Int; var y: Int }
class Vector { var dx: Int = 0; var dy: Int = 0 }
```

```swift
var p1 = Point(x: 1, y: 2)
var p2 = p1
p2.x = 99
print(p1.x)  // 1  ← p1 不受影响,复制

let v1 = Vector()
let v2 = v1
v2.dx = 99
print(v1.dx) // 99 ← v1 跟着变,共享引用
```

第二个 `let v1` 能改 `dx`,因为 `let` 锁的是**引用本身**(指针不变),指针指向的对象内容仍然可变。这是 Swift 类型系统的第一个分水岭——**值语义(value semantics)由编译器在赋值 / 传参时做 copy-on-write**,引用语义由内存里的指针共享达成。

| 维度 | struct(值类型) | class(引用类型) |
| --- | --- | --- |
| 赋值 | 复制(逻辑上;COW 真正写时才复制) | 引用共享 |
| 标识 | 无;两个相同字段的 struct 相等 | 有(每个实例独立 `===`) |
| 继承 | ❌ | ✅ |
| 协议默认实现 | ✅ | ✅ |
| `let` 含义 | 字段也不可变 | 字段仍可变,引用不可改 |
| 内存 | 栈 / 内联(由编译器决定) | 堆 + 引用计数 |
| 线程安全 | 天然(只要字段都 Sendable) | 自己负责 |
| 适用 | 数据、配置、SwiftUI View、Codable | 长寿对象、持久化、跨视图共享、`@Observable` Store |

**用 struct 还是 class,默认应该选 struct**。class 的合理场景只有四类:
1. 需要继承(SwiftUI 时代很少了)
2. 需要"身份"(同样字段也得算两个对象)
3. 跨多处共享可变状态(`@Observable` Store)
4. 持久化对象需要"managed lifecycle"(SwiftData `@Model`、Core Data NSManagedObject)

> 别学 Kotlin 那种"默认 `class`,需要不可变就 `data class`"的姿势。Swift 的默认是反过来的——**默认 `struct`,需要共享身份才 `class`**。这件事直接影响 SwiftUI 性能(View 是 struct 才便宜)、Sendable 推导(struct 字段全 Sendable 就自动 Sendable)。

---

## 二、enum 不是"C 风格枚举",是代数数据类型

Swift 的 `enum` 远不止"一组数字常量":

```swift
enum NetworkResult {
    case success(Data)              // associated value:Data
    case failure(URLError)          // associated value:Error
    case retry(after: TimeInterval) // 带标签的 associated
    case offline
}
```

这是**代数数据类型 / sum type**——一个值在某时刻只能是其中一种,且每种 case 可以携带数据。处理时配合 `switch` **必须穷举**:

```swift
switch result {
case .success(let data): handle(data)
case .failure(let err): show(err)
case .retry(let delay): schedule(delay)
case .offline: showOfflineBanner()
}
```

漏写一种,编译器报错。这点把"忘记处理某分支"的 bug 在编译期消灭。

`enum` 也可以有方法、computed property、协议遵循,几乎和 struct 同等待遇:

```swift
enum NetworkResult {
    case success(Data), failure(URLError), retry(after: TimeInterval), offline

    var isTerminal: Bool {
        switch self {
        case .success, .failure, .offline: return true
        case .retry: return false
        }
    }
}
```

**用 enum 表达"互斥状态"是 Swift 的金科玉律**——`UIState = .loading | .loaded(items) | .error(msg)` 比 `class UIState { var isLoading; var items; var error }` 安全得多,后者总有不合法组合。06 / 11 篇会反复用到。

---

## 三、protocol:Swift 的"接口"远比 Java / Kotlin 强

Swift 协议表面像 Java interface,实际更接近 Rust trait:

```swift
protocol Cache {
    associatedtype Key: Hashable      // 关联类型
    associatedtype Value
    
    func get(_ key: Key) -> Value?
    mutating func set(_ key: Key, _ value: Value)
}
```

三个特色:

1. **`associatedtype` 关联类型**——协议自带泛型参数,实现时具体化。Java/Kotlin 要写 `interface Cache<K, V>`,Swift 直接 `protocol Cache { associatedtype Key; ... }`,更接近 Rust 的 `trait Cache { type Key; ... }`。
2. **协议扩展(`extension Cache where Value: Codable { ... }`)**——可以给协议加默认实现,只对某类型参数生效。
3. **`some` 与 `any`**——存在类型(any)与不透明类型(some)分开,下面细讲。

```swift
struct MemoryCache<Key: Hashable, Value>: Cache {
    private var storage: [Key: Value] = [:]
    func get(_ key: Key) -> Value? { storage[key] }
    mutating func set(_ key: Key, _ value: Value) { storage[key] = value }
}
```

注意 `MemoryCache` 用 generic 把 associatedtype 具化。Swift 编译器在调用方根据上下文自动**单态化**(monomorphize)——`MemoryCache<String, Int>` 和 `MemoryCache<UUID, Data>` 是两份独立的代码,**没有运行时类型擦除开销**。

---

## 四、some 与 any:Swift 5.7+ 的两条"协议类型"路径

这一对概念把很多人卡在 Swift 5.7 之前的"什么时候能用协议当类型"的迷雾里。Swift 5.7+ 把规则讲清楚了。

```swift
// some:不透明返回类型(opaque),编译期确定一个具体类型,调用方看不到
func makeView() -> some View {
    Text("hi")  // 具体类型是 Text,但调用方只知道"某个 View"
}

// any:存在类型(existential),运行时持一个 box 含具体类型信息,可以装任何 View
func makeViews() -> [any View] {
    [Text("a"), Image(systemName: "star")]  // 数组里类型不一样,只能 any
}
```

差异本质:

| 维度 | `some Protocol` | `any Protocol` |
| --- | --- | --- |
| 决议时机 | 编译期 | 运行时 |
| 开销 | 零(编译器知道具体类型) | 有 box / dynamic dispatch |
| 同一签名能装多种具体类型 | ❌ 不行 | ✅ 可以 |
| 关联类型 | 透明使用 | 受限(Swift 5.7+ 部分放开 `any P where P.A == Int`) |

**SwiftUI 的 `body: some View` 用的是 `some`**——每次 build 出来的 View 树类型都是编译期确定的 `TupleView<(Text, Image, ...)>`,所以 diff 算法能用静态类型信息。如果 `body: any View`,SwiftUI 就要 boxing,性能损失大。

**实战规则**:
- 函数返回值能用 `some` 就用 `some`(零成本)
- 集合元素 / 字段类型必须能装"异构具体类型"时才用 `any`(数组、字典)
- 协议 + `associatedtype` 在 `any` 下使用要带 `where` 约束

```swift
// ✅ 推荐
func first() -> some Sequence { [1, 2, 3] }

// ✅ 必要时
let errors: [any Error] = [URLError(.notConnectedToInternet), DecodingError.dataCorrupted(...)]

// ❌ 旧 Swift 5.6 写法(2026 已弃用)
let view: View = Text("hi")  // 报错:必须 `any View`
```

> "我什么时候该用 `some` 什么时候该用 `any`?" — 函数返回选 `some`,数组装异构选 `any`,字段类型默认选 `some`(只能装一种就行),需要替换不同实现类型时选 `any`。这条规则覆盖 95% 场景。

---

## 五、泛型与 where 子句

Swift 泛型在 95% 用法上跟 Kotlin / TS 一致:

```swift
func first<T>(_ items: [T]) -> T? { items.first }

struct Stack<Element> {
    private var items: [Element] = []
    mutating func push(_ item: Element) { items.append(item) }
    mutating func pop() -> Element? { items.popLast() }
}
```

差别在 `where`:Swift 用它附加类型约束,远比 Kotlin 的 `<T : Foo & Bar>` 灵活:

```swift
extension Array where Element: Numeric {
    func sum() -> Element {
        reduce(.zero, +)
    }
}

// 只在 Element 为 Codable + Identifiable 时启用
extension Cache where Value: Codable, Key: Hashable {
    func persist(to file: URL) throws { ... }
}
```

**`where` 是 Swift 类型系统的胶水**,它让你写"只有满足某些条件时这个方法 / 协议默认实现才存在"。这在 SwiftUI / SwiftData / Combine 里随处可见,理解它能读懂大部分系统 API 的真实约束。

---

## 六、内存语义:ARC、weak、unowned、值类型

Swift 用 **ARC(Automatic Reference Counting)** 管 class / actor 的生命周期——编译器在编译期插 `retain` / `release` 调用,运行时维护引用计数,计数归零 dealloc。**这不是 GC,没有 STW、没有循环检测**——所以引用循环需要你手动用 `weak` / `unowned` 打破。

```swift
class Node {
    var value: Int
    weak var parent: Node?       // 弱引用,parent 销毁时这里变 nil
    var children: [Node] = []    // 强引用,Node 持有 children
    
    init(_ value: Int) { self.value = value }
}
```

`weak` vs `unowned`:

| 关键字 | 引用计数 | 对方销毁后 | 适用 |
| --- | --- | --- | --- |
| `strong`(默认) | +1 | N/A | 大多数 |
| `weak` | 不增加 | 自动置 nil | 双向关系、`delegate`、observer |
| `unowned` | 不增加 | 仍指向已 dealloc 内存,访问 crash | 生命周期一定长于自己 |

**closure 捕获**也会引起循环:

```swift
class ViewModel {
    var onUpdate: (() -> Void)?
    func setup() {
        onUpdate = { [weak self] in       // 没 weak 就循环
            self?.process()
        }
    }
}
```

**值类型完全不需要这些**——struct / enum 没有引用计数,赋值是复制,生命周期跟着 scope 走。这又是"默认 struct"的理由。

> ARC 不是问题,**循环引用**才是问题。SwiftUI 时代 90% 的状态是 struct,循环引用机会本来就少;真正剩下的就是 `@Observable` Store、closure 捕获、`delegate` 模式三大场景。看到 class 持有 closure 捕获 class,就该想 `[weak self]`。

---

## 七、Result Builder 与 `@resultBuilder`

`@ViewBuilder` 这种东西不是魔法,是 Swift 5.4+ 的 `@resultBuilder` 功能。它让你写出"看起来是 DSL"的代码:

```swift
@ViewBuilder
var body: some View {
    Text("Hello")
    if isLoading {
        ProgressView()
    } else {
        ContentView()
    }
}
```

这段在编译时会被改写成:

```swift
var body: some View {
    ViewBuilder.buildBlock(
        Text("Hello"),
        isLoading
            ? ViewBuilder.buildEither(first: ProgressView())
            : ViewBuilder.buildEither(second: ContentView())
    )
}
```

`@resultBuilder` 在 Swift 标准库与 SwiftUI / SwiftData / Regex 里大量使用,你不需要自己写 builder,但**要知道这是编译期改写**——所以"我能在 ViewBuilder 里写 `for` 循环吗"这种问题答案是看 `buildArray` 实现了没。

---

## 八、Codable:Swift 序列化的统一答案

```swift
struct Note: Codable {
    let id: UUID
    var title: String
    var body: String
    var createdAt: Date
}

let data = try JSONEncoder().encode(note)
let decoded = try JSONDecoder().decode(Note.self, from: data)
```

`Codable = Encodable & Decodable`,编译器自动合成 `encode(to:)` / `init(from:)`。**所有字段是 Codable 就自动 Codable**;自定义 key 映射用 `CodingKeys` enum:

```swift
struct APINote: Codable {
    let id: UUID
    let title: String
    let createdAt: Date
    
    enum CodingKeys: String, CodingKey {
        case id
        case title
        case createdAt = "created_at"  // 后端是 snake_case
    }
}
```

或者直接告诉 decoder 用 snake_case 策略:

```swift
let decoder = JSONDecoder()
decoder.keyDecodingStrategy = .convertFromSnakeCase
decoder.dateDecodingStrategy = .iso8601
```

**Codable 是 13 篇网络层的核心**,所有 API 数据进出都是 `JSONDecoder().decode(T.self, from: data)`,不要装 SwiftyJSON / ObjectMapper。

---

## 九、与其他语言类型系统对照

| 概念 | Swift | Kotlin | Rust | TypeScript |
| --- | --- | --- | --- | --- |
| 值类型 | `struct` / `enum` | `data class`(语义不同) | struct / enum | object 字面量 |
| 引用类型 | `class` / `actor` | `class` | `Rc<T>` / `Arc<T>` | object |
| 协议关联类型 | `associatedtype` | 无,用泛型 | `trait` + `type` | infer keyword |
| 不透明类型 | `some P` | 无 | `impl Trait` | 无 |
| 存在类型 | `any P` | `out P` 协变 | `dyn Trait` | union |
| 代数数据 | `enum` + associated | `sealed class` | `enum` | discriminated union |
| 内存管理 | ARC | GC | ownership | GC |
| 不可变 | `let` | `val` | 默认不可变 + `mut` | `const` / `readonly` |
| 错误 | `throws` + `Result` | 异常 / `Result` | `Result<T,E>` + `?` | exception / Result-like |

**Swift 最像 Rust**——值语义优先、`some`/`any` 对应 `impl Trait`/`dyn Trait`、协议关联类型对应 trait associated type、`enum` 代数数据类型。差别是 Swift 用 ARC 而不是 ownership,所以心智负担轻一些,但失去了 zero-cost 的所有权检查。

---

## 十、踩坑

1. **默认写 class 而不是 struct**——Java / Kotlin 习惯带过来的人最常犯。改习惯:新增类型先想"我需要身份吗?需要共享吗?需要继承吗?"三个 No 就 struct。
2. **滥用继承**——Swift 鼓励"协议 + 默认实现"而非"基类 + 子类"。SwiftUI 全靠协议组合,几乎没有继承层级。
3. **`weak self` 满天飞**——值类型场景根本不需要;closure 不外逃的场景也不需要。只在"闭包跨生命周期保留 + 闭包内访问 self 的 class"时才需要。
4. **`some View` 想装多种返回类型**——`some` 是单一具体类型,`if isA { return A } else { return B }` 这种返回不同类型的代码编译就报错。要么统一用 `AnyView`,要么 `@ViewBuilder` 用 conditional content。
5. **`AnyView` 包一切**——`AnyView` 是 boxing,会丢类型信息让 SwiftUI diff 失效。**真正异构容器才用 `AnyView`**,99% 场景用 `@ViewBuilder` 就够了。
6. **`enum` 加 case 后忘记改 switch**——这个其实是好事,编译器会逼你处理新 case。把 switch 写穷举(不写 `default`),让编译器替你提醒。
7. **`Codable` 字段不可选导致解码挂掉**——后端某字段缺失,整个 decode 失败。解决:把可选字段标 `?`,或者在 `init(from:)` 自定义。
8. **`@frozen` 无脑加**——`@frozen` 标记 enum / struct 字段不再变化,允许编译器更激进 inline,但**库版本演进时不能加新 case**。只在 SDK 设计时用,业务代码别加。
9. **混淆 `Equatable` 与 `Identifiable`**——`Equatable` 是"两个实例是否相等",`Identifiable` 是"这个实例有没有跨时间稳定的 id"。SwiftUI 的 `ForEach` 要 Identifiable,不是 Equatable。
10. **协议方法没标 `mutating`,struct 实现报错**——struct 的方法默认不可变,改字段的方法要标 `mutating`。协议方法也要写 `mutating func` 才允许 struct 实现里改字段。class 实现忽略 mutating。

---

下一篇 `04-SwiftConcurrency与Sendable.md`,讲 `async/await` 的结构化并发模型、`Task` / `TaskGroup` / `async let`、`actor` 与隔离域、`Sendable` 协议、`@MainActor` 与跨 actor 调用、Swift 6 严格并发开启后的工程取舍,以及 GCD 现在还剩什么位置。
