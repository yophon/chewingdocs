# 03-Kotlin 2.0 语言心智

> 一句话导读:Kotlin 不是"更现代的 Java",而是 JVM 上"类型安全 + 函数式 + Java 互操作"三件套的妥协答案。K2 编译器让 smart cast 更聪明、推断更宽容,但也让一些老姿势悄悄退出 —— 把"哪些是工程语法、哪些是过度炫技"分清楚,后面 27 篇代码才不会读到一半冒出陌生语法。

第 02 篇把构建栈钉死了,从这一篇开始有大量 Kotlin 代码。在写第一行业务逻辑前,先把 Kotlin 在 Android 上真正高频使用的语法子集与设计取舍讲透。Kotlin 是一门语法非常大的语言 —— 协程、序列、DSL、operator overload、reified 泛型、`infix`、`tailrec`、`inline` 一堆能力 —— 但实际在 Android 项目里,90% 的代码反复用到的只有十几个特性。把那十几个用得地道,比把全语法学一遍更重要。

熟悉 Java / Swift / TypeScript 的工程师对 Kotlin 上手通常很快,但常见三种"用力过猛":第一种把 `let` / `run` / `with` / `apply` / `also` 五个 scope function 全用上,代码读起来像绕口令;第二种把 `?.` `!!` 当成"看心情"决定,空安全形同虚设;第三种学了 `value class` / `inline class` 就到处包一层,反而引入互操作问题。这一篇把这些坑提前讲清,Kotlin 2.0 + K2 的几个新行为也一起钉死。

## 1. 机制定位

Kotlin 的设计目标在官方文档里有一句话:**"a modern, statically typed language for the JVM that interoperates seamlessly with Java"**。这三个限定词决定了 Kotlin 与 Swift / TypeScript / Scala 之间的所有差异:

- "for the JVM" —— Kotlin 编译产物是标准 JVM 字节码,与 Java 在二进制层互通。`Note.kt` 里写的 `data class` 编译出来就是 Java 里能看见 `Note` 类带 `getName()` / `equals()` / `hashCode()`,反过来 Java 写的库 Kotlin 也能 `import` 直接用。这条约束让 Kotlin 不可能引入"和 JVM 类型模型冲突"的特性 —— 比如不可能有真正的 union types,只能用 sealed class / interface 模拟。
- "interoperates seamlessly with Java" —— Kotlin 必须在与 Java 互调时表现自然。所以 Kotlin 有 `@JvmStatic` / `@JvmOverloads` / `@JvmField` 一组互操作注解,让 Kotlin 的语法糖在 Java 看来仍是熟悉的形态。
- "statically typed" —— 编译期类型检查,空安全是类型系统的一等公民。`String` 和 `String?` 是两个不同的类型,任何 `String?` 上的 `.length` 调用必须经过 `?.` 或 `!!`。

NotedX 是纯 Kotlin 项目,但**Android 平台 SDK 是 Java 写的**,所以即便不写一行 Java,Kotlin 也要时时处理"Java API 返回值可能为 null 但没标 `@Nullable`"这种边界。这是后面"`String!` 平台类型"问题的根源,第 5 节会展开。

Kotlin 1.x 到 2.0 的关键变化是 **K2 编译器默认启用**。K2 是 JetBrains 从 2020 年开始重写的下一代 Kotlin 编译器,2024-05 随 Kotlin 2.0 进入 stable 默认。对工程师而言,K2 带来三个直接感知:

- **编译速度提升**。同等代码量下,Clean Build 通常快 1.5-2 倍,Incremental Build 快 1.2-1.5 倍。Compose 项目尤其受益。
- **更宽容的 smart cast**。Kotlin 1.x 里 smart cast 有大量"逃逸限制"(例如开放属性、跨 lambda、跨成员函数都不能 smart cast),K2 把分析扩展到更多场景,2.0 里很多"以前必须显式 `as`"的代码现在能自动转。
- **统一前端**。K2 一次性把 Kotlin 的 IDE 静态分析、编译器、文档生成等共用一套前端,长期维护成本下降,意味着 Kotlin 后续语言特性能更快迭代。

K2 默认启用也意味着**一部分 Kotlin 1.x 时代被默认接受的写法会在 K2 下编译失败**,典型是某些类型推断更严格、某些隐式 `Nothing` 推断不再发生、某些 lambda 隐式 receiver 解析变了。第 5 节"踩坑"专门讲这一类迁移问题。

这一篇要建的核心心智是:**Kotlin 是一门"为高频代码模式提供语法糖"的语言**,每一个语法特性都对应一类工程问题。学语法不能只学"语法长什么样",要学"什么场景才该用这个语法",否则会让代码变成炫技。后面 4 节按"类型系统 / 表达性 / 互操作 / Kotlin 2.0 新行为"四个方向,把高频特性逐个钉死。

## 2. Kotlin 心智

把 Kotlin 2.0 在 Android 项目里高频使用的能力按四类整理:

**类型系统**(让 Bug 在编译期被发现):

- **空安全**:`?` 标记可空,`!!` 强解包(必然抛 `NullPointerException`),`?.` 安全调用,`?:` Elvis,`?.let { ... }` "非空则执行"。空安全是 Kotlin 类型系统的核心承诺,**项目里出现 `!!` 都应该被视为可疑代码**,review 时优先排查。
- **`sealed interface` / `sealed class`**:封闭类型,所有子类型必须在同文件(K2 起放宽到同一编译单元的同一包内)。配合 `when` 表达式可以做"穷尽性检查"—— 编译器知道你 cover 了所有情况,新增子类型时所有 `when` 都会被警告。**这是替代 enum 表达"既要枚举性又要带数据"的标准做法**,第 3 节会用 sealed interface 表达 NotedX 的事件类型。
- **`data class`**:Kotlin 编译器自动生成 `equals` / `hashCode` / `toString` / `componentN` / `copy`。任何"只是装数据的类"都应该是 data class。注意 `data class` 的 `equals` 是基于主构造函数声明的所有属性,**类成员里 `val` 但不在主构造的属性不参与 equals**,这一点跟 Java record 一致,但和很多人直觉不同。
- **`value class`**:JVM Project Valhalla 还没落地,Kotlin 通过编译期内联模拟"零成本包装"。典型场景是给"业务上有意义但物理上就是 String / Long"的类型一个名字,例如 `NoteId(value: Long)`,运行时仍然是 Long,但编译期严格区分。`value class` 必须只有一个主构造参数,且不能继承(只能实现接口)。

**表达性**(让"高频代码模式"语法上更短):

- **Scope Functions**:`let` / `run` / `with` / `apply` / `also` 五个函数,作用都是"对一个对象做一段操作"。它们的差异在于"以谁作 receiver"和"返回什么":

| 函数 | receiver | 返回值 | 典型用途 |
| --- | --- | --- | --- |
| `let` | `it` | lambda 结果 | 链式中转换或非空处理:`s?.let { upload(it) }` |
| `run` | `this` | lambda 结果 | 在某个对象上下文里做一组计算并取结果 |
| `with` | `this` | lambda 结果 | 同 `run` 但写法 `with(obj) { ... }`,适合外部对象 |
| `apply` | `this` | 对象本身 | 配置链式:`Builder().apply { setX(1); setY(2) }` |
| `also` | `it` | 对象本身 | "顺便干件事再传出去":`save(note).also { Log.i(TAG, "saved $it") }` |

记住一条原则:**返回值是 lambda 结果 vs 对象本身**,以及 **receiver 是 `it` 还是 `this`**。两两组合形成五种(`with` 与 `run` 实际是同一类的两种写法)。
- **Extension**(扩展函数 / 扩展属性):给已有类型加方法而不修改源码。`fun String.toNoteTitle(): String = trim().take(40)` 之后,任何 String 都能 `"raw".toNoteTitle()`。扩展函数在字节码里其实是静态函数,第一个参数是 receiver,**不参与多态**(如果 `Base` 和 `Derived` 都定义同名扩展,以静态类型决定调谁)。扩展属性必须显式定义 getter / setter,**不能持有 backing field**。
- **Delegation**:三种委托模式:`by lazy` 把属性求值推迟到首次访问;`Delegates.observable` / `Delegates.vetoable` 把"属性变化"包成回调;`by SomeInterface` 把整个接口实现委托给另一对象,免去 boilerplate。

**互操作**(与 Java 边界):

- `@JvmStatic`:让 companion object 里的方法在 Java 看是真正的 `static`,而不是 `Foo.Companion.bar()`。
- `@JvmOverloads`:让带默认参数的 Kotlin 函数在 Java 看时生成多个重载,而不是必须传所有参数。
- `@JvmField`:让 Kotlin 属性在 Java 看是 public field 而不是 `getX()` / `setX()`。
- `@file:JvmName("NoteUtils")`:让顶层函数所在的 `Note.kt` 在 Java 看是 `NoteUtils` 类而不是默认的 `NoteKt`。

NotedX 是纯 Kotlin 项目,这四个注解短期内不会用到。但任何写给 Java 库使用、或被 Android 系统反射调用的代码(例如自定义 Notification Action、`BroadcastReceiver`、`ContentProvider`),都要考虑这些注解。

**Kotlin 2.0 / K2 新行为**:

- Smart cast 范围扩大,跨 `&&` / `||` 短路、跨 try-catch、跨局部 lambda 都能 smart cast。
- 类型推断更激进,某些场景需要显式给类型避免推成 `Any`。
- 旧的 `kotlinx.coroutines.ObsoleteCoroutinesApi` 一组 API 在 K2 下彻底移除,某些过时第三方库可能直接编译失败。

第 5 节"踩坑"会展开 K2 迁移期的具体案例。

## 3. 工程实现

把上面这些能力落到 NotedX 一段真实代码 —— 笔记领域模型。这段代码会被后续第 11-15 篇反复扩展,这里给出第一版,演示 Kotlin 2.0 在工程上的地道用法。

**`app/src/main/java/com/notedx/data/note/Note.kt`** —— 笔记模型与事件:

```kotlin
package com.notedx.data.note

import kotlinx.serialization.Serializable
import java.util.UUID

/**
 * NotedX 笔记 ID。
 *
 * value class 让它在运行时与 String 同形(零包装),
 * 但编译期与普通 String 严格区分,防止把"用户输入"误传成"笔记 ID"。
 */
@JvmInline
@Serializable
value class NoteId(val raw: String) {
    init {
        require(raw.isNotBlank()) { "NoteId must not be blank" }
    }

    companion object {
        fun new(): NoteId = NoteId(UUID.randomUUID().toString())
    }
}

/**
 * 笔记主结构。
 *
 * data class 自动生成 equals/hashCode/copy/toString。
 * 注意:equals 是基于主构造参数,extras 这种成员字段不参与。
 */
@Serializable
data class Note(
    val id: NoteId,
    val title: String,
    val body: String,
    val createdAt: Long,
    val updatedAt: Long,
    val tags: List<String> = emptyList(),
) {
    val isEmpty: Boolean
        get() = title.isBlank() && body.isBlank()

    /** 派生属性:不存,按需算 */
    val excerpt: String
        get() = body.lineSequence().firstOrNull { it.isNotBlank() }?.take(80).orEmpty()
}

/**
 * 笔记领域事件。
 *
 * sealed interface 让 when 在所有情况都 cover 后,编译器不需要 else,
 * 后续新增子类型时所有 when 表达式都会被警告补全。
 */
sealed interface NoteEvent {
    val noteId: NoteId

    data class Created(override val noteId: NoteId, val title: String) : NoteEvent
    data class Updated(override val noteId: NoteId, val changedFields: Set<String>) : NoteEvent
    data class Deleted(override val noteId: NoteId, val softDelete: Boolean) : NoteEvent

    /** "归档"动作没有额外字段,但用 data class 也合理(将来可能加字段) */
    data class Archived(override val noteId: NoteId) : NoteEvent
}
```

这一段已经覆盖了类型系统三件套:`NoteId` 是 value class(`@JvmInline` 注解在 Kotlin 2.0 是必须的,否则会被当成普通 inline class 给警告),`Note` 是 data class,`NoteEvent` 是 sealed interface。`@Serializable` 来自 kotlinx.serialization,第 15 篇会展开。

`require(raw.isNotBlank())` 这类前置条件检查是 Kotlin 标准库提供的工具,失败抛 `IllegalArgumentException`。还有 `check { ... }`(失败抛 `IllegalStateException`)与 `error("msg")`(直接抛 `IllegalStateException`)。**不要写裸 `throw Exception("...")`**,用这三个把意图表达清楚。

**`app/src/main/java/com/notedx/data/note/NoteFactory.kt`** —— 演示 scope functions、extension、delegation:

```kotlin
package com.notedx.data.note

import kotlin.properties.Delegates
import kotlin.time.Duration.Companion.milliseconds

/** 顶层扩展函数:给 String 加业务相关方法。仅在本模块导出。 */
fun String.toNoteTitle(maxLen: Int = 40): String =
    trim().take(maxLen).ifBlank { "Untitled" }

/** 扩展属性:不持有 backing field,只是 getter */
val String.firstParagraph: String
    get() = lineSequence().firstOrNull { it.isNotBlank() }.orEmpty()

/**
 * 笔记构造工厂。演示:
 * - apply 用于配置链
 * - run 用于"做一段计算并取结果"
 * - let 用于"非空处理"
 * - also 用于"顺带打点"
 */
class NoteFactory(private val now: () -> Long = System::currentTimeMillis) {

    /** 创建空笔记 */
    fun draft(): Note = Note(
        id = NoteId.new(),
        title = "",
        body = "",
        createdAt = now(),
        updatedAt = now(),
    ).also { check(it.isEmpty) { "draft must be empty" } }

    /** 创建带初始内容的笔记,演示 apply / data class copy 协作 */
    fun fromInput(rawTitle: String, rawBody: String): Note = draft().run {
        // run 的 receiver 是 draft 返回的 Note,可直接访问其属性
        copy(
            title = rawTitle.toNoteTitle(),
            body = rawBody.trim(),
            updatedAt = now(),
        )
    }

    /**
     * 更新笔记,演示 let 与 apply 的差异。
     * 想"链式取值":let。想"链式配置":apply。
     */
    fun touch(note: Note, newBody: String? = null): Note = note.copy(
        body = newBody?.let { it.trim() } ?: note.body,
        updatedAt = now(),
    )
}

/**
 * 演示 delegation。
 *
 * by lazy:首次访问才求值,默认是 SYNCHRONIZED(线程安全),
 * 在已知单线程访问(典型如 Compose 里的 @Composable 局部)可以用 NONE 省锁。
 *
 * Delegates.observable:属性被赋值时回调,适合"属性变化要通知"。
 */
class NoteDraftHolder {
    val expensiveTemplate: String by lazy {
        // 这段只会跑一次,且线程安全
        loadHugeTemplate()
    }

    var currentDraft: Note? by Delegates.observable(initialValue = null) { _, old, new ->
        if (old?.id != new?.id) {
            // 笔记切换时回调,可以挂上 dirty check / autosave 逻辑
            println("draft switched: ${old?.id} -> ${new?.id}")
        }
    }

    private fun loadHugeTemplate(): String = """
        # Untitled

        - [ ] todo

    """.trimIndent()
}
```

逐点解读:

- **`by lazy`** 默认 `LazyThreadSafetyMode.SYNCHRONIZED`,首次访问做双重检查锁;Compose 局部状态等已知单线程的场景,可用 `by lazy(LazyThreadSafetyMode.NONE)` 省掉锁开销。
- **`Delegates.observable`** 的回调签名是 `(property, oldValue, newValue) -> Unit`,适合做"字段变化触发副作用",但**不要用它做复杂业务**,会让数据流不可追踪。Compose 项目里更推荐 `StateFlow` 暴露不可变只读流,第 11 篇展开。
- **`run` vs `let`**:`run` 把 receiver 当 `this`(可省略),`let` 把 receiver 当 `it`(显式);两者都返回 lambda 结果。规则:**链式调用时 `let` 让代码更容易读**(`xxx?.let { ... }`),**对象内部操作时 `run` 让代码更简洁**(`xxx.run { copy(...) }`)。
- **`apply` 用于配置**:典型场景是 Builder 模式,`StringBuilder().apply { append("a"); append("b") }.toString()`。NotedX 业务代码里其实很少 apply,因为 data class + copy 比 apply 更地道;apply 多见于和 Java Builder API 互操作。

**`app/src/main/java/com/notedx/data/note/NoteValidator.kt`** —— 演示空安全、smart cast 与 when 穷尽:

```kotlin
package com.notedx.data.note

/**
 * 校验结果,sealed interface + data class。
 * when (result) 时编译器要求 cover 所有子类型。
 */
sealed interface ValidationResult {
    data object Valid : ValidationResult
    data class Invalid(val reasons: List<String>) : ValidationResult
}

class NoteValidator {

    /** 入参 Note?,显式处理 null 与各种空场景 */
    fun validate(note: Note?): ValidationResult {
        if (note == null) return ValidationResult.Invalid(listOf("note is null"))
        // K2 smart cast:经过 null 检查后,note 在此分支被自动 cast 为非空 Note
        // 在 1.x 里也支持,但若 note 是 var 且来自其他线程则失效;K2 把分析做得更宽
        val reasons = buildList {
            if (note.title.isBlank()) add("title is blank")
            if (note.body.length > MAX_BODY_LEN) add("body exceeds $MAX_BODY_LEN chars")
            if (note.tags.size > MAX_TAGS) add("tags exceed $MAX_TAGS")
        }
        return if (reasons.isEmpty()) ValidationResult.Valid else ValidationResult.Invalid(reasons)
    }

    /** 演示 when 表达式的穷尽性 */
    fun describe(result: ValidationResult): String = when (result) {
        ValidationResult.Valid -> "ok"
        is ValidationResult.Invalid -> "invalid: ${result.reasons.joinToString()}"
        // 若 ValidationResult 加新子类型,这里会被编译警告
    }

    companion object {
        const val MAX_BODY_LEN = 10_000
        const val MAX_TAGS = 10
    }
}
```

`data object Valid` 是 Kotlin 1.9 引入的 "data object":会自动生成 `toString` / `equals` / `hashCode`(等价于 `object Valid { override fun toString() = "Valid" }` + 单例 equals),日志友好。**sealed 层级里所有"无字段"分支都应该用 data object 而不是 `data class XxxImpl()`**。

## 4. 调参与验收

Kotlin 没有"调参",但有"用得地道与否"。给出 NotedX 整套项目的几条工程公约,这些会贯穿后续每一段代码:

**空安全**:

- 业务代码里出现 `!!` 一律走 PR review。除非"调用 Android 平台 API 且文档明确保证非空但签名是 `String!` 平台类型",否则用 `requireNotNull(x) { "msg" }` 或 `checkNotNull(x) { "msg" }` 代替,能多一个错误信息。
- `?.let { ... }` 是"非空则执行",优先级最高。`?: someDefault` 是"为空则用默认值"。两者组合 `x?.foo() ?: defaultFoo()` 是 Kotlin 里非常常见的"安全调用 + 默认值"组合,值得形成肌肉记忆。
- 平台类型(Java 返回的 `String!`)在 Kotlin 里**默认按非空处理**,但运行时可能是 null。所有调 Android Framework / 第三方 Java SDK 的代码,都要主动给类型显式 `?` 或 `!!`,**让意图在代码上明示**。

**scope functions 选用**:

| 想表达 | 选用 |
| --- | --- |
| "如果非空,做点事并返回结果" | `x?.let { ... }` |
| "对这个对象做配置,返回它自己" | `x.apply { ... }` |
| "顺手做件事但保持值不变" | `x.also { ... }` |
| "在这个对象上下文里做计算,返回结果" | `x.run { ... }` 或 `with(x) { ... }` |

`with` 和 `run` 在功能上几乎等价,`with(x) { ... }` 把对象写在前面、lambda 在后,适合 receiver 是外部对象;`x.run { ... }` 链式更自然。**同一项目里建议两者只用一种**,本系列统一用 `run`,`with` 不出现。

**data class vs class vs object**:

- 只装数据 → `data class`;
- 装数据但有少量行为(非纯函数) → 普通 `class`;
- 全局唯一无状态 → `object`;
- sealed 层级里无字段子类 → `data object`。

**value class 何时用**:

- 一种类型在业务上"有意义",但物理上就是 String / Long / Int 的包装(典型:`NoteId`、`UserId`、`Email`)。
- 不要为"只在一个文件里用"的临时类型加 value class —— 收益不抵阅读成本。
- 不要为可空类型加 value class —— `value class Nullable<T>(val v: T?)` 这种写法没意义。

**Extension 何时用**:

- 给"自己不能修改"的类型加方法(Android 框架类、第三方库类)。
- 把"看起来像方法,但本质是顶层函数"的代码组织得更顺手。
- **不要把 extension 用作"工具类大杂烩"**(`StringUtils`、`DateUtils`)—— 那会让代码搜索 `xxx.foo()` 时找不到定义点。Extension 应该贴近它服务的类型组织,而不是按"功能类型"集中。

**K2 编译速度验证**:

```bash
./gradlew clean :app:compileDebugKotlin --info | grep -E "Total Kotlin|kotlin-compiler-embeddable"
```

K2 启用(Kotlin 2.0+ 默认)与 K1(`-Xuse-k2=false`)在中等项目能看到 30-100% 速度差。Compose 项目尤其明显。

**验收清单**:

- 把第 3 节三段代码加入 `app/src/main/java/com/notedx/data/note/`,`./gradlew :app:compileDebugKotlin` 跑通。
- 在 `NoteValidator.describe` 的 when 表达式里删掉 `is ValidationResult.Invalid -> ...` 这一支,编译应当报错 "when expression must be exhaustive" —— 验证 sealed 的穷尽性检查。
- 在 `NoteValidator.validate` 里把 `note == null` 那一行删掉,编译应当报错 "Only safe (?.) or non-null asserted (!!.) calls are allowed on a nullable receiver of type Note?"。
- 把 `NoteId.new()` 的返回值直接传给一个声明为 `String` 参数的函数,编译应当报错(value class 编译期严格区分)。
- 用 Java 写一段调用 `NoteId.new()` 的代码(只为做实验),应当看到 `NoteId.Companion.new()` 而不是 `NoteId.new()` —— 这是 companion object 在 Java 视角的形态,加 `@JvmStatic` 会变成 `NoteId.new()`。

## 5. 踩坑

**坑 1:`!!` 滥用**。`!!` 表达的是"我向编译器保证此处非空",失败抛 `NullPointerException`。**真实工程里几乎没有"必然非空"的场景**,除了 Android 框架某些已知签名(`requireActivity()`、`requireContext()`)。常见误用:`view!!.findViewById(...)`、`intent!!.getStringExtra("key")`,这两者实际可能为 null,应当用 `?.let { ... }` 或 `requireNotNull`。

**坑 2:`lateinit var` 用在不该用的地方**。`lateinit` 是为 "已知会赋值但不能在构造时赋值" 的场景准备的(典型:`@Inject` 注入、`@BeforeEach` 测试初始化)。**不要用 `lateinit` 替代 nullable**。错误用法:`lateinit var currentUser: User`,初始化前访问抛 `UninitializedPropertyAccessException`,这与 `!!` 没有本质区别,只是把空安全失败的位置藏得更深。

**坑 3:K2 smart cast 在某些场景仍失效**。虽然 K2 把 smart cast 做得更宽,但**开放属性(`open val`)与跨进程边界的属性仍然不能 smart cast**,因为编译器无法证明"两次访问之间不会被改"。典型反例:

```kotlin
class Holder { open var name: String? = null }

val h: Holder = ...
if (h.name != null) {
    // K2 仍然不能 smart cast h.name 为非空,因为 name 是 open var,
    // 子类可能 override 成"每次读返回不同值"。
    h.name.length  // 编译错
}
```

修法:`val local = h.name ?: return; local.length`,先拷到 local val 再用。这是 K2 仍然保留的合理限制。

**坑 4:`data class` equals 不参与非主构造字段**。`data class Foo(val a: Int) { var b: Int = 0 }` 里,`Foo(1).also { it.b = 100 }` 与 `Foo(1).also { it.b = 200 }` `equals` 是 `true`,因为 `b` 不在主构造里。这导致 `Set<Foo>` 去重时 `b` 不同的实例会被合并。修法:**所有应当参与相等性的字段都放主构造**,需要 mutable 状态的对象不要用 data class。

**坑 5:`sealed class` vs `sealed interface` 误选**。Kotlin 1.5 引入 `sealed interface`,2.0 已稳定。差异:`sealed interface` 可以多继承(一个子类可以同时实现多个 sealed interface),`sealed class` 只能单继承;`sealed class` 可以有主构造,`sealed interface` 不能。**默认用 `sealed interface`**,只有明确需要"所有子类共享某些 state / 行为"才用 `sealed class`。NotedX 里 `NoteEvent` / `ValidationResult` 都是 sealed interface。

**坑 6:scope functions 写成嵌套绕口令**。

```kotlin
// 反例:连嵌四层 scope function,可读性归零
note.let { it.copy(title = "x") }.also { Log.i("a", it.toString()) }
    .apply { check(title.isNotBlank()) }.run { upload(this) }
```

修法:把链拆开成 local val,每个 val 做一件事。**当你发现自己在写超过两层 scope function 嵌套时,先停下来重构**。

**坑 7:扩展函数与成员函数同名,以静态类型决定调谁**。

```kotlin
class A {
    fun foo() = "member"
}
fun A.foo() = "extension"

val a: A = A()
a.foo()  // "member" —— 成员函数优先
```

如果 `A` 定义在第三方库,你写了 `fun A.foo()` 想"覆盖",一旦库升级在 A 里加了真的 `foo()` 成员,你的代码会**默默切换到成员实现**,行为变了但没报错。**不要给第三方类型加同名扩展**。

**坑 8:`@JvmStatic` 与 `@JvmOverloads` 在 Android 反射场景必须**。`BroadcastReceiver` / `ContentProvider` / `Service` 这些被系统反射创建的类,如果用 Kotlin 写,companion object 的方法在 Java / 反射看来是 `Companion.foo()`,不是 `Foo.foo()`。Notification Action 用反射拿构造函数时,带默认参数的 Kotlin 构造在 Java 看来只有一个全参版本。这两种场景都要显式加 `@JvmStatic` / `@JvmOverloads`。NotedX 第 18 篇会专门展开 BroadcastReceiver 与互操作。

**坑 9:`by lazy` 在 Compose 里用错**。Compose 函数会被重组,`@Composable fun X() { val cached by lazy { compute() } }` 这种写法在每次重组都会创建一个新的 lazy,根本起不到缓存作用。Compose 里"按需缓存"应该用 `remember { compute() }`,第 07 篇展开。**`by lazy` 只在普通类成员上使用**,Compose 内一律 `remember`。

**坑 10:K2 类型推断更激进,某些 `var x = mutableListOf()` 推成 `MutableList<Any>`**。Kotlin 1.x 里编译器有时会根据后续使用推断回具体类型,K2 把这条边界收紧。修法:写明确类型 `val x: MutableList<Note> = mutableListOf()` 或 `val x = mutableListOf<Note>()`。**所有 mutable 集合都建议显式标元素类型**。

**坑 11:`Sequence` 与 `List` 混用导致性能误判**。`list.map { ... }.filter { ... }.first()` 会先建中间 list 再 filter。改 `list.asSequence().map { ... }.filter { ... }.first()` 是惰性求值,只算到 first 满足。**对长 list 且只取少量元素时用 sequence**;短 list 直接 list,sequence 反而有额外开销。

**坑 12:K2 + `kotlinx.coroutines` 旧 API 编译失败**。一些 2020 年之前的 `@ExperimentalCoroutinesApi` 或 `@ObsoleteCoroutinesApi` 标记的 API 在 Kotlin 2.0 + 协程 1.9.x 已经被删除。表现:升级 Kotlin 后某些第三方库直接编译失败。修法:升级依赖到与 Kotlin 2.0 兼容的最新版,无法升级的第三方库要么换、要么 fork patch。

---

下一篇 `04-协程与结构化并发.md`,把这一篇里只提了一句的协程展开,讲清 `CoroutineScope` / `Job` / `Dispatchers` / `viewModelScope` 与结构化并发的边界,以及为什么 NotedX 全栈协程不再有 RxJava 与 AsyncTask。

## 手动验证

- [ ] 把第 3 节三段 Kotlin 代码加入 NotedX 项目,`./gradlew :app:compileDebugKotlin` 跑通,无 warning。
- [ ] 写一个 main 函数(或 unit test)实例化 `NoteFactory`、`NoteValidator`,创建一篇 Note、跑一次 validate,断言 `Valid` 与 `Invalid` 路径都符合预期。
- [ ] 故意把 `NoteValidator.describe` 的 when 改成不完整(去掉 `is ValidationResult.Invalid` 分支),编译应当报错。
- [ ] 故意把 `NoteId(value: String)` 传给一个声明为 `String` 的函数,编译应当报错。
- [ ] 写一段反例:连嵌三层 scope function,然后重构成 local val 链,体会可读性差异。
- [ ] 在 Android Studio 里开 Tools → Kotlin → Show Kotlin Bytecode → Decompile,看 `Note.kt` 反编译成 Java 后的形态,确认 `data class` 生成了 `getId()` / `equals()` / `hashCode()` / `copy()` / `componentN()` 等方法,`value class` 在 Java 看是 `NoteId__JvmInline` 风格的 inline 包装。
- [ ] 阅读 Kotlin 官方文档 *What's new in Kotlin 2.0.0* 中 K2 小节一次,知道 K2 在 smart cast、null analysis、type inference 三方面的边界变化。
