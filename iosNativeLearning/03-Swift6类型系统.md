# 03 Swift 6 类型系统:值类型 / 引用类型 / 协议 / 泛型

> 第 01、02 篇把工程坐标系立起来,这一篇回到语言本身。Swift 的类型系统是 SwiftUI / SwiftData / Swift Concurrency 全部能成立的地基:**视图为什么能是 `struct`、`@Observable` 为什么必须 `class`、`some View` 与 `any View` 一字之差含义截然不同、protocol 带 `associatedtype` 之后为什么不能当变量类型用**——所有这些都不是 SwiftUI 设计师的随意选择,而是被类型系统逼出来的工程取舍。本篇用 NotesIsland 的真实场景把这副地基讲透,并与 Dart / Kotlin 做横向对照。

---

## 一、机制定位:为什么类型系统值得专门讲一篇

很多人写 SwiftUI 写了几个月,还会被这些问题卡住:

- 为什么把 `Note` 从 `struct` 改成 `class` 后,SwiftUI 列表突然不刷新了?
- 为什么 `protocol P { associatedtype T }` 不能 `let p: P = ...`,但 `let p: any P = ...` 可以,有什么区别?
- 为什么视图 body 返回类型一定要写 `some View`,不能写 `View`,也不能写 `AnyView`?
- 为什么我写的 `func make<T: View>() -> T` 编译器不让我返回 `Text("hi")` 也不让我返回 `Image(...)`?
- 为什么 `Sendable` 协议没有方法,但加上之后到处都不能编译了?

这些问题表面是「语法不熟」,本质是 Swift 的类型系统有几条**不可妥协的原则**——值语义、协议作为类型 vs 协议作为约束、opaque 与 existential、static dispatch 与 dynamic dispatch。理解这些原则,SwiftUI 与 SwiftData 的设计就从「魔法」变成「逻辑必然」。

**核心心智:** Swift 类型系统的几乎所有「奇怪规则」,都是为了**把性能成本明确化**——能在编译期决定的事不留到运行期,能 inline 的不要装箱,能不走虚表的不走虚表。SwiftUI 的高刷新率靠的就是这个。

---

## 二、Apple 平台心智

### 1. 值类型 vs 引用类型:两套内存语义

Swift 五大具体类型种类:`struct` / `enum` / `tuple`(值类型),`class` / `actor`(引用类型),`closure` / `function` 是另一档(本篇不展开)。两套语义的核心差别:

| 维度 | 值类型(struct / enum) | 引用类型(class / actor) |
| --- | --- | --- |
| 内存语义 | 赋值 / 传参 = **复制**(写时复制优化) | 赋值 / 传参 = **共享同一对象** |
| 标识 | 无;两个 struct 字段相等就相等 | 有;同一对象 `===` 真,字段相等的两个对象 `===` 假 |
| 继承 | 无,只能用协议组合 | `class` 有(但 SwiftUI 时代基本不用);`actor` 无 |
| 默认 Sendable | 字段全 Sendable 即自动 Sendable | 默认不 Sendable,需要显式 `final class ... : Sendable` 或 `actor` 隔离 |
| 装入 protocol | 拷贝进 existential 盒子 | 引用进 existential 盒子 |
| SwiftUI 视图 | View 协议要求 struct(实际 `body` 是值快照) | 不能用 class 当 View |
| SwiftData 模型 | 不行 | `@Model` 宏生成的就是 final class |

「值类型 = 复制」是 Swift 与 Java / Kotlin / Dart 最大的心智分歧。在 Dart 里 `final user2 = user1` 永远是引用同一对象;在 Swift 里 `let user2 = user1` 如果 `User` 是 struct,**user2 是一份独立拷贝**,改 user2 不会影响 user1。

**但 Swift 的「复制」实际上是 Copy-on-Write(COW)**:`String`、`Array`、`Dictionary`、`Set` 这些标准库类型都是 struct,但内部持有一个引用计数的 buffer,只有真正发生写入时才 deep copy。所以你不用担心「`let arr2 = arr1` 是不是把一百万元素复制一遍」——只要你不改 arr2,它和 arr1 共享同一段内存。

> 心智口诀:**默认用 struct,只有「身份重要」或「跨 view 共享可变状态」时才用 class / actor**。「身份重要」典型例子是 SwiftData 的 `@Model`——两条 title 完全相同的笔记仍然是两条不同的笔记。

### 2. 协议:作为类型 vs 作为约束

这是 Swift 类型系统最容易被混淆的一对概念。看下面的代码:

```swift
protocol Persistable {
    func save() throws
}

// (A) 协议作为「类型」:存进变量、放进数组、做参数类型
let items: [any Persistable] = [...]
func process(_ p: any Persistable) { ... }

// (B) 协议作为「约束」:出现在泛型 where 子句
func process<P: Persistable>(_ p: P) { ... }
func process<P>(_ p: P) where P: Persistable { ... }

// (C) opaque return:出现在返回值,表示「具体类型但调用方不知道是哪个」
func makeP() -> some Persistable { ... }
```

三种用法编译器内部完全不同:

- **(A) `any Persistable`** 是 **existential type**(存在类型)。运行时是一个**装箱盒子**(existential container,iOS 上典型 5 个 word 大小,32 字节左右),装着「值 + 类型元信息 + 协议见证表(witness table)」,所有调用走**动态分发**(查表)。优点:可以同质化集合(数组里塞不同具体类型)。代价:每次调用一次间接、装箱可能堆分配、不能与 `associatedtype` 协议配合。
- **(B) `<P: Persistable>` 泛型约束** 是 **type parameter**。编译期 specialize(为每个具体 P 生成一份代码),调用走**静态分发**,零开销,但调用点必须能在编译期确定具体类型。
- **(C) `some Persistable`** 是 **opaque return type**(不透明返回类型)。本质是「具体类型在编译期已固定,只是函数签名向调用方隐藏」。调用方拿到的仍然是「某一个具体类型」,不是 existential,**没有装箱开销**。

> 心智口诀:**`any` = 「我不知道是什么类型,也不关心,运行时再说」;`some` = 「编译器知道是什么类型,我只是不告诉你」;泛型约束 = 「调用点告诉我是什么类型,我为每种生成一份代码」**。

### 3. 带 `associatedtype` 的协议:必须走泛型或 `any`

```swift
protocol Repository {
    associatedtype Item
    func fetchAll() async throws -> [Item]
}

// 错!associatedtype 让 Repository 不能直接当变量类型
let r: Repository = NoteRepository()  // ❌ Swift 5 直接拒;Swift 6 仍然要求显式 any

// 对法 1:用泛型把 Item 参数化
func print<R: Repository>(_ r: R) where R.Item: CustomStringConvertible { ... }

// 对法 2:用 any(Swift 5.7+ 起允许带 associatedtype 的协议存为 any,但有约束)
let r: any Repository = NoteRepository()
let items = try await r.fetchAll()
// items 的类型是 [any Repository.Item]——associatedtype 被 erase 成 any
```

为什么带 `associatedtype` 的协议特殊?因为协议见证表(witness table)是按「具体协议方法」分发的,而带 associatedtype 的方法返回 / 入参类型在协议层未定,只有具体实现才知道。**Swift 5.7 之前**这种协议根本不能存 existential(必须借助 type erasure 手撸 `AnyRepository`);**Swift 5.7+** 可以存 `any Repository`,但**调用 `fetchAll()` 拿到的是 `[any Item]`**,associatedtype 被擦掉。**Swift 6** 严格要求所有 existential 都显式写 `any`,且推荐使用 `SWIFT_UPCOMING_FEATURE_EXISTENTIAL_ANY = YES` 强制检查。

### 4. `some View`:SwiftUI 设计的关键

SwiftUI 的视图协议:

```swift
public protocol View {
    associatedtype Body: View
    var body: Body { get }
}
```

`Body` 是 associatedtype——意味着 `View` 不能直接当变量类型用。如果 SwiftUI 让你写 `var body: View`(协议作为类型),那么:

1. body 每次返回都是一个 existential 盒子,每次重计算都装箱;
2. SwiftUI 框架就拿不到具体 body 类型,做不了字段级 diff;
3. body 内的 modifier 链(`.padding().background(...).foregroundStyle(...)`)在类型层堆叠出来的具体类型信息会被擦掉,优化全部失效。

所以 SwiftUI 选择了 `some View`:**body 返回的是某一个具体类型,只是这个类型对调用方隐藏**。编译期 SwiftUI 仍然知道它是 `ModifiedContent<HStack<...>, _PaddingLayout>` 之类的精确类型,可以做 diff、做布局优化、做零成本的视图组合。`some View` 不是「省字母」,是 SwiftUI 性能模型的命门。

`AnyView` 是退路:**它确实是一个 existential 装箱**,通常用在「条件返回不同视图、编译器推断不出统一类型」的边缘场景。每个 `AnyView` 都是一次类型擦除,SwiftUI 在 `AnyView` 边界无法做 diff,只能整片替换——所以**滥用 `AnyView` 会让 SwiftUI 性能塌方**。第 26 篇会展开。

### 5. 与 Dart / Kotlin 的对照

|  | Swift 6 | Dart 3 | Kotlin |
| --- | --- | --- | --- |
| 值类型 | `struct` / `enum`(广泛) | 仅 `int` / `double` / `bool`(本质对象) | `data class`(仍是对象,但有解构);`value class` 实验性 |
| 引用类型 | `class` / `actor` | `class`(全部) | `class` / `object` |
| 默认共享语义 | 值 = 拷贝;引用 = 共享 | 全部对象共享 | 全部对象共享 |
| 协议 / interface | `protocol`(可带 `associatedtype` 和默认实现) | `abstract class` + `interface`(2.15+);`mixin` | `interface`(可有默认实现) |
| 泛型 | 静态 specialize,`some` opaque,`any` existential | 类型参数泛型(运行时类型擦除) | 类型参数泛型(运行时擦除,`reified` 在 inline 函数有) |
| 不可变性 | `let` / `var`,struct + let 真不可变 | `final` + `const` | `val` / `var` |
| 数据模型 | `struct Note { ... }` | `class Note { final ... ; const Note(...) }` | `data class Note(val ... : ...)` |

**关键差异:** Dart / Kotlin 里所有类型都是引用对象,泛型在运行时被擦除。Swift 把「值 vs 引用」「泛型 specialize vs erasure」做成了**程序员可选**的两套维度,代价是要在脑子里区分四种组合:值类型 + 静态泛型(高频)、值类型 + existential(偶尔)、引用类型 + 静态泛型(常见)、引用类型 + existential(协议作为接口)。SwiftUI 高度依赖第一种,SwiftData 依赖第三种,网络层依赖第四种。

「擦除」与「specialize」的差别在跨语言对照里很值得多说两句。Java / Kotlin / Dart 这种「类型擦除式泛型」,编译产物里 `List<String>` 和 `List<Int>` 是同一份字节码,运行时拿到 `list.get(0)` 必须经过装箱(`Integer` 对象包裹 int);Swift 的 specialize 是为每个具体类型生成一份机器码,`Array<Int>` 直接在栈上连续存 `Int64`,零装箱。**这是 Swift 在数值密集场景能逼近 C 性能的根本原因**——SwiftUI 重计算上百万次也不慢,因为热点路径里没有装箱。

代价是编译时间。Swift 项目编译慢,很大一部分原因是泛型 specialize 在编译期展开,模板组合越多,编译器要做的「单态化」工作就越多。社区有一个口号「不要在 SwiftUI 里写超过 10 层 modifier」,部分原因是类型推断负担——modifier 链每多一层,编译器要推的具体类型就多一层嵌套。`some View` 在这里也起到「短路类型推断」的作用:body 返回类型对调用方隐藏,调用方就不需要把整棵 modifier 树的类型推一遍。

---

## 三、工程实现:NotesIsland 的类型系统落地

下面用 NotesIsland 的真实场景演示四件事:**struct 值语义在 SwiftUI 里如何工作、`@Model` class 在 SwiftData 里为什么必须用 class、`protocol Repository` 用泛型约束写仓储层、`some View` 与 `any View` 的边界**。

```swift
// MARK: - File: Features/Notes/NoteDraft.swift
import Foundation

/// 编辑中的笔记草稿——值类型,适合作为 SwiftUI 表单的临时状态
/// 不直接持久化(持久化用 @Model Note,见下一段)
struct NoteDraft: Sendable, Hashable {
    var title: String
    var body: String
    var tags: [String]

    init(title: String = "", body: String = "", tags: [String] = []) {
        self.title = title
        self.body = body
        self.tags = tags
    }

    /// 草稿 → 持久化模型的工厂方法
    func makeNote() -> Note {
        Note(title: title, body: body, tags: tags, createdAt: .now)
    }

    var isValid: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}
```

`NoteDraft` 是 struct,字段都 Sendable,编译器自动推导 `NoteDraft` 也 Sendable。它可以放进 `@State`、`@Binding`,可以跨 actor 安全传递,可以 hash 进 `Set`——零样板。这就是「默认 struct」的红利。

```swift
// MARK: - File: Features/Notes/Note.swift
import Foundation
import SwiftData

/// 持久化笔记——SwiftData @Model 宏要求 class,因为持久化对象需要「身份」
/// final 是 SwiftData 要求(不允许继承),自动 Observable(SwiftData 的 @Model 会注入 Observation)
@Model
final class Note {
    @Attribute(.unique) var id: UUID
    var title: String
    var body: String
    var tags: [String]
    var createdAt: Date

    init(id: UUID = UUID(),
         title: String,
         body: String = "",
         tags: [String] = [],
         createdAt: Date = .now) {
        self.id = id
        self.title = title
        self.body = body
        self.tags = tags
        self.createdAt = createdAt
    }
}
```

`Note` 是 class——SwiftData 必须用 class,因为「数据库里的同一行,在内存里应是同一个对象」。两条 title 都为「读书」的笔记,如果是 struct,它们字段相等就被视为相等;但作为持久化记录,它们是两条独立行,**身份不可省略**。

```swift
// MARK: - File: Features/Notes/Repository.swift
import Foundation
import SwiftData

/// 仓储协议:用 associatedtype 表达「每个 Repository 处理一种 Item」
/// 因为带 associatedtype,这个协议不能直接当变量类型,只能走泛型约束
protocol Repository<Item>: Sendable {
    associatedtype Item: Sendable
    func fetchAll() async throws -> [Item]
    func insert(_ item: Item) async throws
    func delete(id: PersistentIdentifier) async throws
}

/// Swift 5.7+ 主关联类型语法 `Repository<Item>`,让 `any Repository<NoteDraft>` 这种约束 existential 可写
/// 没有它就只能写 `any Repository where .Item == NoteDraft`(早年丑陋的写法)

/// SwiftData 仓储实现:actor 隔离,所有读写都序列化,天然消除数据竞争
actor NoteRepository: Repository {
    typealias Item = NoteDraft

    private let container: ModelContainer
    private var context: ModelContext { ModelContext(container) }

    init(container: ModelContainer) {
        self.container = container
    }

    func fetchAll() async throws -> [NoteDraft] {
        let descriptor = FetchDescriptor<Note>(sortBy: [SortDescriptor(\.createdAt, order: .reverse)])
        let notes = try context.fetch(descriptor)
        // 持久化 class → 不可变 struct,跨 actor 边界安全
        return notes.map { NoteDraft(title: $0.title, body: $0.body, tags: $0.tags) }
    }

    func insert(_ draft: NoteDraft) async throws {
        let note = draft.makeNote()
        context.insert(note)
        try context.save()
    }

    func delete(id: PersistentIdentifier) async throws {
        if let note = context.model(for: id) as? Note {
            context.delete(note)
            try context.save()
        }
    }
}
```

注意几个类型系统细节:

1. **`protocol Repository<Item>`** 是 Swift 5.7 引入的「主关联类型(primary associated type)」语法,允许在协议名后面用尖括号约束 associatedtype。这让 `any Repository<NoteDraft>` 这种写法可写,把「这是个仓储,处理 NoteDraft」写在类型签名里而不是 where 子句里。
2. **`actor NoteRepository`** 用 actor 而不是 class,所有方法自动是 actor-isolated,跨任务调用要 `await`,内部数据竞争编译期消除。第 05 篇展开。
3. **跨 actor 边界返回 `[NoteDraft]` 而不是 `[Note]`**——`Note` 是 `@Model` class,不是 Sendable;`NoteDraft` 是 struct,Sendable 自动推导。这种「持久化 class + 跨界 struct」是 Swift Concurrency 下的常见模式。

```swift
// MARK: - File: Features/Notes/NoteEditView.swift
import SwiftUI

struct NoteEditView: View {
    /// @State 持有 struct,SwiftUI 自动感知字段级变化
    @State private var draft = NoteDraft()

    let repository: any Repository<NoteDraft>
    let onSaved: () -> Void

    var body: some View {
        Form {
            Section("基本信息") {
                TextField("标题", text: $draft.title)
                TextField("正文", text: $draft.body, axis: .vertical)
                    .lineLimit(3...10)
            }
            Section {
                Button("保存") {
                    Task {
                        do {
                            try await repository.insert(draft)
                            onSaved()
                        } catch {
                            // 错误处理留到第 15 篇
                        }
                    }
                }
                .disabled(!draft.isValid)
            }
        }
    }
}
```

这里 `repository: any Repository<NoteDraft>` 用 existential,**接受任何 Item == NoteDraft 的 Repository 实现**——测试时可以传一个 `MockRepository`,生产时传 `NoteRepository`。这就是 existential 的正确使用场景:**调用方不关心具体类型,只关心协议契约**。

如果改成泛型约束:

```swift
struct NoteEditView<R: Repository>: View where R.Item == NoteDraft {
    let repository: R
    // ...
}
```

也能工作,且**调用走静态分发更快**。代价是 `NoteEditView` 本身变成泛型,使用方每个具体 R 会被编译器 specialize 一份代码。对于「这个视图全 App 只用一种 Repository」的场景,泛型版本性能更好;对于「需要在多个具体 Repository 间运行时切换、或者收集异构 Repository」,existential 更合适。NotesIsland 选 existential,理由是 View 边界用 existential 更常见,且仓储调用频率远低于视图重算,几条 witness 表查询的开销可以忽略。

```swift
// MARK: - File: Features/Common/AnyViewTrap.swift
import SwiftUI

/// 演示一个 some View / any View / AnyView 的边界:条件返回不同视图
struct ConditionalView: View {
    let isLoggedIn: Bool

    // 错法:返回类型不一致编译不过
    // var body: some View {
    //     if isLoggedIn { Text("Welcome") } else { Image(systemName: "lock") }
    // }
    // 错误信息:Function declares an opaque return type, but the return statements
    //          in its body do not have matching underlying types

    // 对法 1:用 ViewBuilder,SwiftUI 自动包装成 _ConditionalContent
    var body: some View {
        if isLoggedIn {
            Text("Welcome")
        } else {
            Image(systemName: "lock")
        }
        // body 这里的实际类型是 _ConditionalContent<Text, Image>,SwiftUI 编译期已知
    }

    // 对法 2(不推荐,只在不得已时用):AnyView 类型擦除
    // var body: AnyView {
    //     isLoggedIn ? AnyView(Text("Welcome")) : AnyView(Image(systemName: "lock"))
    // }
}
```

`@ViewBuilder` 是一个 result builder,把 if/else 分支编译成 `_ConditionalContent<TrueBranch, FalseBranch>` 这种和类型,**保留具体类型信息**,SwiftUI 可以做 diff。`AnyView` 是装箱,擦掉具体类型,SwiftUI 在 AnyView 边界只能做整片替换。**90% 场景用 ViewBuilder 解决,只在「数组里塞不同类型视图、且无法用 ForEach + 同一类型重写」时才用 AnyView**。

---

## 四、调参与验收

### 手动验证清单

把上面文件加入 NotesIsland 工程,完成下面验证:

1. **结构体值语义**:在某处写 `var d1 = NoteDraft(title: "A"); var d2 = d1; d2.title = "B"; print(d1.title)`——输出应为 `"A"`(d1 没被影响)。
2. **@Model 引用语义**:写 `let n1 = Note(title: "A"); let n2 = n1; n2.title = "B"; print(n1.title)`——输出 `"B"`(同一对象)。
3. **NoteEditView 编译通过**,且类型不需要标注 `R`——证明 `any Repository<NoteDraft>` 这种主关联类型写法在 Swift 6 / iOS 18 下正常工作。
4. **AnyViewTrap.ConditionalView 切换 `isLoggedIn` 真假,视图正确切换**,且 Xcode Inspector 看到的视图层级是 `_ConditionalContent`,不是 `AnyView`(证明 ViewBuilder 走的是和类型,不是装箱)。
5. **Swift 6 严格并发开启时**,`actor NoteRepository` 的方法在 `NoteEditView` 里调用必须加 `await`,且 `draft` 跨进 `Task` 闭包不报警告(因为 `NoteDraft: Sendable`)——这一条编译通过即验收通过。
6. **泛型 specialize 验证**(可选):在 `NoteRepository` 的 `insert` 方法里加 `print(type(of: self))`,运行后控制台应输出 `NoteRepository`——证明在调用点已经是具体类型,没有装箱。

### 调参点

| 项 | 选择 | 取舍 |
| --- | --- | --- |
| View 接口用 `any Repository<Item>` vs 泛型 `R: Repository` | existential 灵活,泛型快 | NotesIsland 选 existential,牺牲极小性能换简单 |
| `Note` 用 struct vs `@Model` class | struct 无法持久化,class 有身份 | 凡是持久化数据走 class,临时状态走 struct |
| protocol 加 `associatedtype` vs 加 `<T>` 主关联类型 | 主关联类型让 existential 写法简洁 | 协议如果有典型「一个 Item 类型」语义,加主关联类型 |
| `SWIFT_UPCOMING_FEATURE_EXISTENTIAL_ANY` | YES / NO | 推荐 YES,强制写 `any`,避免无意中走 existential |
| 用 `AnyView` 兜底 vs 改组件结构 | AnyView 简单但慢 | 视图层级里 AnyView 总数应 ≤ 个位数,超过就重构 |

### 真机 vs 模拟器

类型系统本身没有真机 / 模拟器差异,但有几个相关注意点:

- 模拟器跑 `@Model` 类的标识 `===` 比较和真机一致(SwiftData 的对象同一性由 ModelContext 保证,不受平台影响);
- `actor` 在模拟器和真机上的隔离行为完全一致,但**性能**有差异——actor 跳转有固定开销(suspend / resume),模拟器上挂起开销低于真机,所以模拟器测出来的「actor 性能很快」不要直接外推。

---

## 五、踩坑

### 1. 把 SwiftUI 视图改成 class 后视图不刷新

```swift
// 错
final class MyView: View {
    @State var count = 0
    var body: some View { Text("\(count)") }
}
```

SwiftUI 协议 View 没有强制要求 struct(理论上 class 也能 conform),但 `@State`、`@Binding`、`@Environment` 这些 property wrapper 都假设宿主是 struct(基于 `inout self` 写回的语义)。把 View 写成 class 会让 SwiftUI 的状态系统失灵——`@State` 不会触发 invalidate,视图不刷新。**SwiftUI 视图永远写 struct**,无一例外。

### 2. 在 `@Observable` 类里用 struct 字段后改字段视图不刷新

```swift
@Observable
final class Settings {
    var theme = Theme(name: "light")
}

struct Theme { var name: String }

// 视图里:
settings.theme.name = "dark"  // ← 触发刷新?会
settings.theme = Theme(name: "dark")  // ← 触发刷新?会
```

`@Observable` 宏对每个存储属性插入 getter/setter,赋整个 `theme` 字段会触发;**修改 `theme.name` 也会触发**,因为 struct 字段的子属性修改在 Swift 里等价于「读出 theme → 改 name → 写回 theme」,setter 仍然被调用。这与 ObservableObject + @Published 时代的体感不同(那时候你必须手写 didSet 或者把 Theme 拆成 @Published 子对象)。

陷阱在于:**如果你把 Theme 改成 class 共享对象**,改 `theme.name` 不会触发 setter(因为 theme 本身没变,只是内部状态变),视图不刷新。这种情况下要么 Theme 也 `@Observable`,要么手动赋整个 theme 字段。

### 3. `any Repository = NoteRepository()` 编译报错

Swift 6 严格要求 existential 显式写 `any`:

```swift
// 错(Swift 6 报错,Swift 5 警告)
let r: Repository = NoteRepository()

// 对
let r: any Repository<NoteDraft> = NoteRepository()
```

如果工程里开了 `SWIFT_UPCOMING_FEATURE_EXISTENTIAL_ANY = YES`,所有遗漏 `any` 的地方一律编译失败,**这是好事**——逼你显式表达 existential 的开销。

### 4. `some View` 多个分支返回不同类型报错

```swift
// 错
var body: some View {
    if condition {
        return Text("A")   // 类型 Text
    } else {
        return Image(...)  // 类型 Image,与 Text 不一致
    }
}
```

`some` 要求所有 return 必须**同一个具体类型**。两种解决:

- 删掉 `return`,让 SwiftUI ViewBuilder 帮你包成 `_ConditionalContent<Text, Image>`(推荐);
- 用 `Group { ... }` 把两个分支包起来——Group 是一个 wrapper view,内部 ViewBuilder 处理。

「写 `return` 触发显式返回 = 失去 ViewBuilder = some 报错」是新人最常见的坑。**SwiftUI body 里不要写 `return`**(单语句除外)。

### 5. 在主关联类型协议上 `some` 不带尖括号

```swift
protocol Repository<Item>: Sendable {
    associatedtype Item
}

// 错(Swift 6 严格模式)
func makeRepo() -> some Repository { NoteRepository() }
// 报错或警告:Use of protocol 'Repository' as a type must be written 'any Repository'

// 对:补上主关联类型
func makeRepo() -> some Repository<NoteDraft> { NoteRepository() }
```

主关联类型让 `some` 和 `any` 都能携带 associatedtype 约束。**有就一定要写**,否则编译器把 `Repository` 当 existential 候选,触发严格模式报错。

### 6. struct 在闭包里捕获后改不了

```swift
struct Counter { var n = 0 }
var c = Counter()

let close = {
    c.n += 1  // ❌ 报错:cannot assign to value: 'c' is a 'let' constant in the closure
}
```

闭包捕获值类型时默认拷贝并以 `let` 捕获。要可修改:

- 改 c 为 class(简单但失去值语义);
- 用 `capture list`:`{ [c] in /* ... */ }`——但这是只读拷贝,仍然不能改;
- 用闭包接收 `inout` 参数:`func work(_ c: inout Counter) { ... }`,然后 `work(&c)`。

Dart / Kotlin 转过来的人最容易在这里栽——它们语言里所有变量都是引用,闭包改外部变量天经地义。

### 7. `Sendable` 协议没有方法,但加上之后到处报错

```swift
struct User: Sendable {
    let name: String
    var tags: [String]
}
```

`Sendable` 是 marker protocol,没有要求方法,但有**结构约束**:struct 的所有字段必须也是 Sendable(`String` 是,`[String]` 是,`var` 也 OK 因为是值字段);class 必须是 `final class` 且所有字段 `let` 且字段类型 Sendable,或者 `@MainActor` 隔离。一旦某字段不满足,编译器报「Stored property 'foo' of 'Sendable'-conforming struct/class has non-sendable type X」。

**绝对不要写 `final class User: @unchecked Sendable`** 来绕过——本系列红线。第 05 篇会展开正确解法。

### 8. 把 SwiftData `@Model` 类传过 actor 边界

```swift
actor BadRepo {
    func badReturn() -> Note { Note(title: "X") }  // ❌ Note 不是 Sendable
}

// 调用方
let n = await BadRepo().badReturn()  // 编译报警:Non-sendable type 'Note' returned from actor-isolated function
```

SwiftData `@Model` class 默认不 Sendable(因为它有可变字段且不可继承约束加在 marker 上不简单)。**跨 actor 边界要传值类型快照**(像 `NoteDraft` 那样),不要传 `@Model` 对象本体。这也是 SwiftData + Swift 6 严格并发的核心工程模式。

### 9. 泛型 `<T: View>` 函数想返回不同 View

```swift
// 想做:根据 condition 返回不同 View
func makeView<T: View>(condition: Bool) -> T {
    if condition {
        return Text("A") as! T   // ❌ 类型不可推断 + 强转
    } else {
        return Image(...) as! T
    }
}
```

泛型函数的 `T` 在调用点被调用方决定,**函数体内部不能「自己挑」一个 T**。要这种「根据条件返回不同视图」,正确做法是返回 `some View` + ViewBuilder,或者(实在不行)`AnyView`。泛型 `<T: View>` 通常出现在「调用方提供 view 类型,函数包装它」的场景,比如:

```swift
func boxed<T: View>(@ViewBuilder _ content: () -> T) -> some View {
    content()
        .padding()
        .background(.thinMaterial, in: .rect(cornerRadius: 12))
}

// 使用
boxed { Text("Hi") }
boxed { Image(systemName: "star") }
```

这才是 `<T: View>` 的正确用法——调用方决定 T 是 Text 还是 Image,函数只负责通用包装。

### 10. enum 不只是「带值的常量」,它是 Swift 类型系统的另一根支柱

很多从 Java / Dart / Kotlin 转来的人把 enum 当作「一组命名常量」,在 Swift 里这是巨大的低估。Swift 的 enum 是**和类型(sum type)**,可以带 associated value,可以递归(`indirect case`),可以泛型化,可以遵循协议。这让它在数据建模上能做到 Dart sealed class 或 Kotlin sealed interface 才能做的事。

NotesIsland 里典型的 enum 用法:

```swift
// MARK: - File: Features/Sync/SyncStatus.swift
enum SyncStatus: Sendable, Equatable {
    case idle
    case syncing(progress: Double)
    case failed(error: SyncError)
    case succeeded(at: Date)
}

enum SyncError: Error, Sendable {
    case networkUnavailable
    case quotaExceeded
    case conflict(localVersion: Int, remoteVersion: Int)
}
```

视图里 switch 这个 enum:

```swift
switch syncStatus {
case .idle:
    EmptyView()
case .syncing(let progress):
    ProgressView(value: progress)
case .failed(.conflict(let local, let remote)):
    Text("冲突:本地 v\(local),云端 v\(remote)")
case .failed(let error):
    Text("同步失败:\(String(describing: error))")
case .succeeded(let at):
    Text("已同步 \(at.formatted(.relative(presentation: .named)))")
}
```

注意几个细节:

- **enum 的 exhaustiveness check**——少一个 case 编译报错,这是 sum type 的核心红利,比「if-else 树 + default 兜底」安全得多;
- **嵌套 pattern match**:`case .failed(.conflict(let local, let remote))` 一次匹配两层,这种能力在 Java enum 上没有,在 Kotlin sealed class 上要写 `when` 嵌套;
- **associated value 可以是任意类型**,包括 struct、class、closure、其他 enum——enum 在 Swift 里就是「类型版的可识别联合(tagged union)」。

理解了这一点,SwiftUI 的 `ContentUnavailableView.search` / `Result<Success, Failure>` / `AsyncImagePhase` / `RedactionReasons` 这些 API 的设计就不再神秘——它们全是带 associated value 的 enum,用 sum type 表达「这个值要么是这个,要么是那个」的工程心智。Swift 类型系统的两大支柱:struct 表达「积类型(product type)」,enum 表达「和类型(sum type)」,二者组合可以建模几乎所有数据形状。

---

## 本篇收尾

读完这一篇,你应该:

- 能在 30 秒内说清楚 `struct` / `class` / `actor` 三者的内存语义差别;
- 知道为什么 SwiftUI View 必须是 struct、为什么 SwiftData `@Model` 必须是 class;
- 能区分协议的三种用法(`any` existential / `some` opaque / 泛型约束),并能解释它们各自的运行时代价;
- 理解 `some View` 与 `any View` 的差别,以及为什么 SwiftUI body 用 `some`;
- 知道带 `associatedtype` 的协议为什么不能直接当变量类型,主关联类型语法解决了什么;
- 能在 NotesIsland 工程里写出一个 `actor Repository`,跨 actor 边界传值类型快照而不是 `@Model` 引用;
- 知道哪些类型系统的「奇怪规则」其实是把性能开销显式化,而不是设计师的洁癖。

第一层「Swift 心智与项目骨架」还剩 04(`async/await` / `Task` / 结构化并发)、05(`actor` / `Sendable` / 严格并发)两篇,把并发模型与类型系统结合起来,本系列的语言层基础就完整了。从第 06 篇起进入 SwiftUI 主线。
