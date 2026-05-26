# Kotlin 2.0 语言心智

> 这篇不是 Kotlin 教程。它的目标是:**让一个写过 Java / Go / TS 的人,知道 Kotlin 在 Android 后续 19 篇里反复用的那十几个特性各自为什么存在**。教程网上一大把,本篇只讲心智。

---

## 一、Kotlin 不是"更优雅的 Java"

很多人对 Kotlin 的印象是"Java + 语法糖"。这是误导。Kotlin 的设计目标是**修两个 Java 顽疾**:`NullPointerException`、**样板代码**。这两件事在 Android 上格外致命:

- Android API 一半返回值可能为 `null`(`findViewById` 找不到、`getIntent().getExtras()` 没有)
- Android 数据类要写一堆 `getter` / `setter` / `equals` / `hashCode` / `toString`

Kotlin 在语言层就把这两件事解决了。**所有"Kotlin 比 Java 好"的论点最后都能还原成这两条**。

| 维度 | Java | Kotlin |
| --- | --- | --- |
| 空安全 | 无,只能靠 `@Nullable` 注解(运行期可能挂) | **类型系统强制**:`String` 不可空,`String?` 可空 |
| 数据类 | `class Note { ... }` 手写 50 行 | `data class Note(val title: String)` 一行 |
| 函数类型 | `Function<T, R>` 接口 | **一等公民**:`val f: (Int) -> String = { it.toString() }` |
| 扩展函数 | 无 | **`fun String.removeWhitespace() = ...`** 给老类型加方法 |
| 单例 | `Holder.INSTANCE` 模式 | `object Foo { ... }` |
| 协程 | 无,靠 RxJava / `CompletableFuture` | **`suspend fun`** 一等公民 |

---

## 二、空安全:`?` 与 `!!` 的契约

Kotlin 类型系统区分 `T` 与 `T?`:`T` 永远不可能是 `null`,`T?` 可能是 `null`。所有访问 `T?` 的代码必须显式处理可空情况,否则编译不过。

```kotlin
val name: String = "Alice"       // 不可空
val nickname: String? = null     // 可空

name.length          // OK
nickname.length      // 编译报错:nickname 可能为 null

nickname?.length     // OK,返回 Int?,nickname 是 null 就整体是 null
nickname?.length ?: 0    // Elvis 运算符:为 null 时取 0
nickname!!.length    // 强制非空,若实际是 null 直接抛 NPE
```

**`!!` 是 Kotlin 里最危险的运算符**——它是"我向编译器保证这一定不空,出问题我负责"。`!!` 在工程代码里出现就是 code smell:它意味着你**应当**用类型系统表达不可空,但用 `!!` 偷懒了。后续 19 篇里出现的 `!!` 数量,在十次以内。

**Platform Type**(Java 来的类型显示为 `String!`):Kotlin 不知道 Java 返回的 `String` 是否可空,所以给它一个"平台类型",你怎么用都不报错——这是空安全的破口,凡是从 Java API 拿到的值,**进入 Kotlin 边界时立即标注可空性**:

```kotlin
val intent = getIntent()                    // Intent! (platform type)
val data: String? = intent?.getStringExtra("k")   // 显式标 String?,边界收口
```

---

## 三、`val` vs `var`:默认不可变

Kotlin 用 `val` 声明"只读引用"(类似 Java `final`),用 `var` 声明可变引用。默认全部用 `val`,只有真正要改才用 `var`。

```kotlin
val notes: List<Note> = emptyList()    // notes 引用不可变;但 notes 本身是 List<T>,只读视图
var count: Int = 0                     // 可改
```

注意 `val` 只管"引用不变",不管"对象内容不变"。`val notes: MutableList<Note>` 仍然可以 `notes.add(...)`。所以要"既不能换引用、又不能改内容",需要**不可变集合**:`List<T>` / `Set<T>` / `Map<K, V>` 是接口,默认实现不可变;`MutableList<T>` 才是可变集合。

**Compose 强烈偏好不可变状态**——`UiState` 用 `data class` + `val` + `List<T>` 是默认形态,这一点 10 篇展开。

---

## 四、`data class`:Android 数据层的主力

```kotlin
data class Note(
    val id: Long,
    val title: String,
    val content: String,
    val createdAt: Long,
)
```

`data class` 自动生成 `equals` / `hashCode` / `toString` / `copy` / `componentN`。其中 **`copy` 是最重要的**——它实现"基于现有对象创建一个修改了某些字段的新对象",这是状态管理的核心模式:

```kotlin
val edited = note.copy(title = "New Title")    // 其他字段不变,只改 title
```

UDF(单向数据流)的核心操作就是 `state.copy(...)`——状态不可变,每次更新都生成新对象。10 篇展开。

**`data class` 不是免费的**:它生成的所有方法都在字节码里,大量 `data class` 会让 APK 体积稍涨。但工程上几乎从不为这个优化——直接用就是。

---

## 五、`object` / `companion object`:静态的两种形式

Kotlin 没有 `static` 关键字,要表达"静态成员"有两种方式:

```kotlin
// 1. 独立单例
object Logger {
    fun log(msg: String) { ... }
}
Logger.log("hi")    // 直接访问

// 2. 类的"伴生对象"——Kotlin 里"类的静态成员"实际上是这个伴生 object
class MainActivity : ComponentActivity() {
    companion object {
        private const val TAG = "MainActivity"
        fun newIntent(ctx: Context) = Intent(ctx, MainActivity::class.java)
    }
}
MainActivity.newIntent(ctx)
```

`object` 单例的初始化是**懒的、线程安全的**——首次访问时才创建,JVM 类加载机制保证只有一份实例。这是 Kotlin 替代 Java 单例双重检查锁的标准答案。

---

## 六、扩展函数:给"别人的类"加方法

```kotlin
fun String.removeAllWhitespace(): String = filter { !it.isWhitespace() }

"hello world".removeAllWhitespace()    // "helloworld"
```

扩展函数的本质是**静态函数 + 语法糖**:编译后变成 `StringExtensionsKt.removeAllWhitespace(s)`,**不修改 `String` 类本身**。所以扩展函数:

- 不能访问类的 `private` 成员
- 是静态分派的,不是多态的(`Animal::sound` 这种重写不会因扩展函数受影响)
- 可以加在 `null` 接收者上:`fun String?.orEmpty()`

Android 里到处是扩展函数:`Context.getSystemService<NotificationManager>()`、`Modifier.padding(8.dp)`、`Flow.collectAsStateWithLifecycle()`——它们让外部库能在不修改原类的前提下提供链式 API。

---

## 七、Lambda 与高阶函数:函数是值

Kotlin 函数是一等公民。函数类型写作 `(参数) -> 返回值`:

```kotlin
val isEven: (Int) -> Boolean = { it % 2 == 0 }
val process: (Int) -> Int = { x -> x * 2 }
listOf(1, 2, 3).filter(isEven)         // [2]
listOf(1, 2, 3).map(process)           // [2, 4, 6]
```

几个习惯:

- **`it` 是单参数 lambda 的隐含名字**——只有一个参数时不必写 `x ->`。
- **尾随 lambda(trailing lambda)**——如果函数最后一个参数是函数,可以把 lambda 提到括号外:
  ```kotlin
  list.filter { it > 0 }       // 等价于 list.filter({ it > 0 })
  ```
- **SAM 转换**——Java 单方法接口可以直接传 lambda:
  ```kotlin
  button.setOnClickListener { handleClick() }    // OnClickListener 是 SAM
  ```

Compose 里整个 UI 树都是 lambda 嵌 lambda——`Column { Row { Text(...) } }` 这种写法,本质是高阶函数把子 Composable 当作尾随 lambda 接收。05/06 篇展开。

---

## 八、`by lazy` 与 `lateinit`:延迟初始化

```kotlin
val expensiveThing: Engine by lazy {
    // 首次访问 expensiveThing 时才执行,且只执行一次
    Engine.create()
}

lateinit var prefs: SharedPreferences   // 声明时不初始化,后续某处赋值
override fun onCreate() {
    prefs = getSharedPreferences("x", MODE_PRIVATE)
}
```

两者的区别:

- `by lazy` 是 `val`,初始化在 lambda 里,**只跑一次,线程安全**。
- `lateinit` 是 `var`,只能用于非空引用类型(不能是 Int / Long 等原始类型),**必须**在使用前手动赋值,访问未初始化的 `lateinit` 会抛 `UninitializedPropertyAccessException`。

什么时候用哪个?

- 需要构造时就有依赖、但构造昂贵 → `by lazy`
- 在 `onCreate` / DI 注入之后才能拿到值 → `lateinit`

Android 里 Hilt 注入字段就用 `lateinit`:`@Inject lateinit var repo: NoteRepository`——因为 Hilt 在 Activity 创建后才注入。13 篇展开。

---

## 九、`sealed`:有限继承的代数数据类型

```kotlin
sealed interface UiState {
    data object Loading : UiState
    data class Success(val notes: List<Note>) : UiState
    data class Error(val message: String) : UiState
}
```

`sealed` 的关键约束:**子类必须和父类在同一文件 / 同一模块**。这意味着编译器知道**全部子类有哪些**,`when` 表达式可以做穷尽性检查:

```kotlin
val state: UiState = ...
val message = when (state) {
    UiState.Loading -> "Loading"
    is UiState.Success -> "${state.notes.size} notes"
    is UiState.Error -> state.message
    // 不写 else 也可以,编译器知道穷尽
}
```

这就是函数式语言里的**代数数据类型(ADT)**。UDF 的 `UiState` 几乎都用 sealed 表达。比 Java 的"标志位 + 多个字段"模型清晰一个数量级。

`sealed class` 与 `sealed interface` 的差别:`interface` 子类可以同时继承多个 sealed 接口(组合);`class` 单继承。**默认偏好 `sealed interface`**,扩展性更好。

---

## 十、`inline` / `reified`:在编译期消解泛型擦除

JVM 泛型在运行时**擦除**——`List<String>` 和 `List<Int>` 在运行时都是 `List`,你拿不到 `T` 的 `Class`。Kotlin 用 `inline` + `reified` 在编译期把泛型实参展开:

```kotlin
inline fun <reified T : Activity> Context.start() {
    startActivity(Intent(this, T::class.java))
}

ctx.start<DetailActivity>()    // 编译后变成 startActivity(Intent(ctx, DetailActivity.class))
```

`inline` 把函数体在调用点展开,`reified` 让你能在函数体里写 `T::class`。**Android 里到处是这种 API**:`viewModel<HomeViewModel>()`、`getSystemService<NotificationManager>()`、`navController.navigate<Route.Detail>()`(Navigation Compose 2.8+ 类型安全路由)。

不要用 `inline` 来"性能优化普通函数"——它的真正用途是 `reified` + 高阶函数(避免 lambda 装箱)。

---

## 十一、作用域函数:`let` / `apply` / `run` / `also` / `with`

```kotlin
note?.let { saveToDb(it) }              // 非空时执行,it 是 note
Note(title = "x").apply { id = 1 }      // 构造后初始化,返回原对象
val s = StringBuilder().run { ... }     // 在对象上执行 block,返回 block 结果
list.also { Log.d("notes", it.toString()) } // 副作用打日志,返回原对象
with(canvas) { drawX(); drawY() }       // 在对象上做多次调用
```

记忆心法(只记这两条):

- **返回原对象**:`apply`(this 是接收者)、`also`(it 是接收者)
- **返回 block 结果**:`let`(it 是接收者)、`run`(this 是接收者)、`with`(this 是接收者)

**别滥用**——一连串 `let { apply { also { run { ... } } } }` 是 Kotlin 代码里最常见的可读性灾难。99% 场景只用两个:`?.let { ... }`(非空时执行)、`.apply { ... }`(构造后初始化)。

---

## 十二、`suspend`:协程的语法标记

```kotlin
suspend fun fetchNotes(): List<Note> {
    val resp = api.getNotes()       // 这一行会挂起当前协程,等响应
    return resp.body() ?: emptyList()
}
```

**`suspend` 是关键字,但本质是语法糖**——编译器把 `suspend fun` 变成"带回调的状态机"。从调用者视角,`suspend fun` 看起来同步,实际异步;从语言视角,`suspend fun` **只能在协程或另一个 `suspend fun` 里调用**。

```kotlin
fun onClick() {
    fetchNotes()    // 编译报错:不能在非 suspend 上下文调 suspend
}

fun onClick() {
    viewModelScope.launch {       // 启动一个协程
        val notes = fetchNotes()  // OK,在协程里
        _state.value = state.value.copy(notes = notes)
    }
}
```

04 篇会把协程的心智彻底展开。

---

## 十三、K2 编译器带来了什么

Kotlin 2.0 默认启用 K2 编译器,工程上能感知的变化:

1. **编译速度显著提升**——K2 内部重写了类型推断,大型项目增量编译能快 30-50%。
2. **smart cast 范围扩大**——以下代码 K1 报错、K2 通过:
   ```kotlin
   sealed interface Result { ... }
   fun handle(r: Result) {
       if (r is Result.Success) {
           // K2 在分支闭包里也保留 smart cast,K1 不行
           lambda { use(r.data) }    // r 被 smart-cast 到 Result.Success
       }
   }
   ```
3. **更严格的类型检查**——一些 K1 放行的隐式转换、平台类型边界在 K2 下报错。升级到 2.0 时常见的迁移工作就是把这些显式标好。

**Kotlin 2.0.20+ 的 Compose Compiler 内嵌**——上一篇讲过,不再追单独版本号,这是 K2 最大的工程红利之一。

---

## 十四、Android 里 Kotlin 与 Java 互操作

Android 项目里你大概率不会写 Java,但**会引用 Java 库**(老 SDK / 第三方)。Kotlin ↔ Java 互操作是双向、零开销的,但有四类边界:

1. **空安全失效**——Java `String` 在 Kotlin 看是 `String!`,平台类型。**进入 Kotlin 边界立即收口**:`val s: String? = javaObj.maybeGetName()`。
2. **属性 vs `getX/setX`**——Java 的 `getName()` / `setName(...)` 在 Kotlin 里可以写作 `obj.name = "x"`(属性形式);反过来 Kotlin 的 `val name` 在 Java 里看是 `getName()`。
3. **默认参数**——Kotlin `fun f(x: Int = 0)` 在 Java 里看不到默认参数,需加 `@JvmOverloads` 生成重载。
4. **lambda vs SAM**——Kotlin lambda 默认不实现 SAM 接口,要传给 Java API 时偶尔需要显式 `OnClickListener { ... }`。

NotedX 全 Kotlin 写,Java 互操作仅在第 13 / 22 篇短暂出现(三方 SDK 边界)。

---

## 十五、踩坑

**坑 1:把 `!!` 当成"反正没问题"**。每一个 `!!` 都是一颗潜在 NPE 炸弹,而且 Crashlytics 报错时只会告诉你"NullPointerException at line X",根本没有上下文。**用 `?:` / `let` / `requireNotNull(..., "为什么不该为空")` 替代**——后者至少崩的时候有解释。

**坑 2:把 `data class` 用来做 entity 兼业务模型**。`data class` 自动生成 `equals` / `hashCode` 是基于**所有 `val` / `var` 字段**的——如果你给 Room entity 加一个 `@Ignore` 的运行时字段,`equals` 会把这个字段也算进去,导致缓存判等行为出错。**数据库 entity 与 UI 模型分开**,通过 mapper 转换,13 篇展开。

**坑 3:`object` 用作"全局状态容器"**。`object` 是单例,生命周期与进程相同。**不要在 `object` 里放可变状态**——它没有 scope、不会随 ViewModel 销毁,你写的就是一个全局变量。

**坑 4:扩展函数定义在错的地方**。扩展函数应当定义在**最能描述其归属的文件**里,而不是塞进 `Utils.kt`。`fun Modifier.shimmer(): Modifier` 应放在 `ui/Modifier+Shimmer.kt`,不是 `ui/Utils.kt`。

**坑 5:把 Java 的 NPE 风险带过来**。`val name = intent.getStringExtra("name")` 返回 `String?`,但很多人写 `val name = intent.getStringExtra("name")!!`——一旦上游漏传就直接崩。**Android API 的 `String?` 几乎都应该 `?.` / Elvis 处理,而不是 `!!`**。

**坑 6:协程里裸用 `runBlocking`**。`runBlocking` 把协程**变回**阻塞调用,在主线程跑会 ANR。`runBlocking` 只应在测试或 `main` 函数顶层出现,不应进入 Android 业务代码。04 篇展开。

**坑 7:`lateinit` 滥用**。`lateinit` 的本质是"我承诺会先赋值再访问"。如果这个承诺难以保证(比如某些路径下 `onCreate` 不会被调到),应该改用 `by lazy` 或可空 `var`。

---

下一篇 `04-协程与 Flow:结构化并发.md`,把 Android 上唯一的并发答案讲清楚:`suspend fun` 的本质、`CoroutineScope` 的生命周期绑定、`Dispatchers` 主线程 / IO / Default、取消传播、`Flow` 冷流与 `StateFlow` / `SharedFlow` 热流的区别。这是后面 18 篇异步代码的统一底座。
