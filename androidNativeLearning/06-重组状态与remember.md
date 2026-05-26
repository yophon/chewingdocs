# 重组、状态与 remember

> 一句话:**Compose 的灵魂只有一件事——它会拿着最新的状态把 UI 函数重新跑一遍**。理解了"什么时候跑、跑哪些"以及"怎么把状态存到下次还在",所有 `remember` / `LaunchedEffect` / `derivedStateOf` 都自然了。

---

## 一、重组到底是什么

```kotlin
@Composable
fun Counter() {
    var count by remember { mutableStateOf(0) }
    Button(onClick = { count++ }) {
        Text(text = "Clicked $count times")
    }
}
```

按一下按钮,`count` 从 0 变 1。**Compose 怎么把 UI 更新过来的?** 答:它把 `Counter()` 这个函数**重新跑了一遍**。

这就是"重组"(recomposition):**Composable 函数是 UI 的纯函数描述,状态变了,Compose 重新调用它**。

但 Compose 不会蠢到每次都重跑整棵树——它精确知道**哪些 Composable 读了哪些 State**。`count` 变了,只有读了 `count` 的那部分(这里是 `Text`)被标记为"需要重组",其余原封不动。

这里有个反直觉的事:**`Counter()` 这个外层函数实际上不会重跑**——只有内部读 `count` 的 `Text(...)` 那个 lambda 会重跑。Compose 编译器插桩,把每个 Composable 调用都包成一个"可独立重组的范围"。

---

## 二、`State<T>` 与 `mutableStateOf`

```kotlin
val count: MutableState<Int> = mutableStateOf(0)   // 一个 State 对象
count.value = 1                                    // 写值
println(count.value)                               // 读值
```

`MutableState<T>` 是 Compose runtime **能监听的可变盒子**。读它的 Composable 被"订阅"到这个盒子上;写它会通知所有订阅者"该重组了"。

```kotlin
var count by remember { mutableStateOf(0) }    // by 是属性委托语法糖
// 等价于:
val countState = remember { mutableStateOf(0) }
val count: Int = countState.value             // 读
// countState.value = 1                       // 写
```

`by` 是 Kotlin 属性委托,让 `count` 看起来像普通变量,实际上读写都走 `countState.value`。这是 Compose 项目里最常见的写法,**不要被吓到**。

---

## 三、`remember`:把状态留到下次重组

```kotlin
@Composable
fun Counter() {
    var count by remember { mutableStateOf(0) }   // 不写 remember 会怎样?
    Button(onClick = { count++ }) { Text("$count") }
}
```

如果**不写 `remember`**:每次 Counter 重组,`mutableStateOf(0)` 都重新执行一次——`count` 永远是 0,点按钮没用。

`remember { ... }` 的语义是:**第一次进入组合时执行 lambda,把结果缓存,后续重组直接返回缓存值**。它是 Compose 提供给"在 Composable 函数里持有跨重组状态"的标准机制。

什么东西需要 `remember`?

- 任何 `mutableStateOf` / `MutableState`
- 创建昂贵的对象(`Paint` / `Canvas` 缓存等)
- 协程作用域(`rememberCoroutineScope()`)

什么东西不需要 `remember`?

- 从 ViewModel 拿来的 `StateFlow`——它本来就活在 ViewModel 里,寿命比 Composable 长
- 常量
- 不可变的派生值(`val name = "Mr. ${user.name}"`,直接算就行)

---

## 四、`remember(key)`:输入变了重新算

```kotlin
@Composable
fun UserCard(userId: String) {
    val avatar = remember(userId) {       // userId 变,重新计算 avatar
        loadAvatarFor(userId)
    }
    // ...
}
```

`remember(key)` 的语义:**当 key 变化时重新执行 lambda,否则保留缓存**。`key` 可以是多个值组合。

这是 Compose 里**类比 React 的 `useMemo`**——避免重复计算昂贵的派生值。

---

## 五、`rememberSaveable`:跨配置变化也存

`remember` 在屏幕旋转、字体变大这种**配置变化**时会丢——因为 Composable 整个组合被销毁重建。`rememberSaveable` 把状态额外存到 `SavedStateHandle`,旋转后还能恢复:

```kotlin
var query by rememberSaveable { mutableStateOf("") }   // 旋转后 query 还在
```

支持的类型:基础类型 / `Parcelable` / `Serializable`。复杂对象需要自定义 `Saver`。

**但**——通常的搜索关键词、输入框文本这些 UI 状态,**也可以放在 ViewModel 里**。ViewModel 会自动跨配置变化保留。**判断标准**:这个状态如果用户关掉 App 再打开,应当消失,就放 Composable + `rememberSaveable`;如果应当持久,放 ViewModel 或数据库。

---

## 六、`derivedStateOf`:派生状态

```kotlin
@Composable
fun Demo(items: List<Item>) {
    var query by remember { mutableStateOf("") }
    val filtered by remember {
        derivedStateOf { items.filter { it.name.contains(query) } }
    }
    // ...
}
```

为什么不直接 `val filtered = items.filter { ... }`?**因为这样每次重组都算**,而 `derivedStateOf` 让 Compose **跟踪 `query` / `items` 的变化,只在它们变时重算 filtered**。

但更关键的是:**`filtered` 本身是 `State`**,所以读它的 Composable 只在 filtered 真的变化时重组,而不是 query 每次更新都重组。

**典型用例**:计算"是否滚到底部":

```kotlin
val listState = rememberLazyListState()
val showFab by remember {
    derivedStateOf { listState.firstVisibleItemIndex > 5 }
}
```

每帧滚动,`listState.firstVisibleItemIndex` 变化几十次;但 `showFab` 只在跨过 5 这条线时变化一次。读 `showFab` 的 FAB 只重组两次(出现 / 隐藏),不会跟着滚动每帧重绘。

**`derivedStateOf` 是性能优化工具,不是必需品**。第一版写代码时不要预先优化——profile 发现重组过多再考虑加。

---

## 七、`LaunchedEffect`:在 Composable 里启协程

```kotlin
@Composable
fun Screen(userId: String) {
    LaunchedEffect(userId) {
        // userId 进入组合 / userId 变化时执行;离开组合自动取消
        val user = repo.fetchUser(userId)
        // ...
    }
}
```

为什么需要这个?因为 **Composable 函数体里直接写 `viewModelScope.launch { }` 是不对的**——Composable 会重组多次,每次重组都启动一个新协程,泄漏严重。

`LaunchedEffect(key)` 的语义:

- 进入组合时启动协程
- `key` 变化时取消旧协程、启动新协程
- 离开组合时自动取消

**用例**:订阅一次性事件(`SharedFlow`):

```kotlin
LaunchedEffect(Unit) {
    vm.events.collect { event ->
        when (event) {
            UiEvent.NavigateBack -> navController.popBackStack()
        }
    }
}
```

`key = Unit` 表示"只在进入组合时启动一次"。常见的还有 `key = userId`(用户变了重订阅)。

**坑**:`LaunchedEffect(state)` 里如果 state 经常变,会一直取消重启。这种情况通常你想要的是 `derivedStateOf` 或者把订阅留在 ViewModel。

---

## 八、`DisposableEffect`:有清理动作的副作用

`LaunchedEffect` 自动用协程的取消机制清理。如果你的副作用**不能用协程表达**(注册系统监听器、添加 View tree 观察者),用 `DisposableEffect`:

```kotlin
DisposableEffect(systemService) {
    val listener = MyListener()
    systemService.register(listener)
    onDispose {
        systemService.unregister(listener)
    }
}
```

`onDispose { }` 在 key 变化或 Composable 离开组合时调用。**任何注册到外部系统的资源都应当配 `DisposableEffect`,否则就是泄漏**。

---

## 九、`SideEffect`:每次成功重组后执行

```kotlin
SideEffect {
    analytics.logScreenView("home")   // 每次成功重组都执行
}
```

`SideEffect` 没有 key,**每次组合树成功提交后都执行**。用法极少——主要是给非 Compose 系统(analytics、日志)同步 Compose 状态。99% 场景用不到。

---

## 十、`produceState`:把非 Compose 数据源转成 State

```kotlin
val price: State<Double> = produceState(initialValue = 0.0, key1 = symbol) {
    val socket = openStockSocket(symbol)
    socket.collect { value = it }     // 内部用普通变量 value 写
    awaitDispose { socket.close() }   // 离开组合时清理
}
```

`produceState` 等于 `remember { mutableStateOf(...) } + LaunchedEffect + DisposableEffect`,把"启动数据源 → 写入 State → 清理"封装到一个 API。

---

## 十一、状态提升(state hoisting):谁拥有状态

```kotlin
// ❌ 状态藏在内部,父级无法控制
@Composable
fun Counter() {
    var count by remember { mutableStateOf(0) }
    Button(onClick = { count++ }) { Text("$count") }
}

// ✅ 状态提升到父级,Counter 变成纯 UI
@Composable
fun Counter(count: Int, onIncrement: () -> Unit) {
    Button(onClick = onIncrement) { Text("$count") }
}

@Composable
fun Parent() {
    var count by remember { mutableStateOf(0) }
    Counter(count = count, onIncrement = { count++ })
}
```

**Compose 的核心模式**:Composable 默认**无状态**(stateless),接收 `state` 与 `onEvent` 两类参数。需要"自己管状态"时,把同名 Composable 拆成两个:

```kotlin
@Composable
fun Counter(count: Int, onIncrement: () -> Unit) { ... }   // stateless,可单元测试

@Composable
fun Counter() {                                            // stateful,默认便利版本
    var count by remember { mutableStateOf(0) }
    Counter(count = count, onIncrement = { count++ })
}
```

**为什么这么做**:

1. **复用性**——stateless 版本可以在不同状态来源(ViewModel / 父 Composable / 测试)下复用
2. **可测试性**——纯函数易测
3. **状态归位**——状态的"真理源"集中在少数地方(通常 ViewModel),不分散在 Composable 树各处

10 篇会展开:状态究竟应该放在 Composable 里(本地 UI 状态)、ViewModel 里(屏幕级业务状态)、还是数据库里(跨屏幕持久状态)。

---

## 十二、什么会触发重组

只有读 `State` 的 Composable 会随该 State 变化重组。**读普通字段、读 Java POJO、读 `MutableList` 都不会触发重组**。

```kotlin
val items = mutableListOf<Note>()     // 普通 List
items.add(Note(...))                   // ❌ Compose 不知道发生了变化

val items by remember { mutableStateOf(emptyList<Note>()) }
items = items + Note(...)              // ✅ 替换了 State 的 value,触发重组
```

注意 `var items by mutableStateOf(emptyList<Note>())`——这里 `items` 是 `List<Note>`(不可变接口),每次更新都生成新 List 赋给 State。**不要用 `MutableList`**——Compose 看不到内部变化。

**`mutableStateListOf`**:可变 List 但带 Compose 监听:

```kotlin
val items = remember { mutableStateListOf<Note>() }
items.add(Note(...))    // OK,内部用 SnapshotStateList 实现,变化会被监听
```

但用 `mutableStateListOf` 比"`State<List>` + 每次替换"性能略好(只有变化的 index 重组)。日常用哪个看习惯,差异通常可忽略。

---

## 十三、稳定性(stability)与跳过重组

```kotlin
@Composable
fun NoteRow(note: Note) {
    Row { Text(note.title); Text(note.content) }
}
```

如果父组合重组时 `note` **没变**,Compose 能跳过 `NoteRow`——这叫"重组跳过"(skipping)。能跳过的前提是参数**类型稳定**:Compose 看得出"这个对象等价于上次"。

稳定类型的判断:

- **基础类型**(`Int` / `String` / `Boolean`):稳定
- **`data class` 全 `val` 且字段都稳定**:稳定
- **`List<T>` / `Map<K,V>`**:**不稳定**(因为运行时拿到的可能是可变 List,Compose 没法判断)
- **lambda**:稳定与否取决于捕获的变量

Compose 1.7+ 的 **Strong Skipping** 默认启用——即使参数不稳定,只要引用没变(`==`)也跳过。这让 Compose 容忍更多"非稳定参数",但**最佳实践仍然是用稳定类型**,Strong Skipping 是兜底。

实操上,UiState **用 `data class` + `val` + 不可变集合包装**:

```kotlin
data class HomeUiState(
    val isLoading: Boolean = false,
    val notes: ImmutableList<Note> = persistentListOf(),    // kotlinx.collections.immutable
    val error: String? = null,
)
```

20 篇会专门讲性能与稳定性。

---

## 十四、第一个真正的有状态屏幕

```kotlin
@Composable
fun NoteScreen(
    uiState: NoteUiState,
    onTitleChange: (String) -> Unit,
    onSave: () -> Unit,
) {
    Column(modifier = Modifier.padding(16.dp)) {
        TextField(
            value = uiState.title,
            onValueChange = onTitleChange,
            label = { Text("标题") },
        )
        Spacer(Modifier.height(8.dp))
        Button(onClick = onSave, enabled = uiState.title.isNotBlank()) {
            Text("保存")
        }
    }
}

data class NoteUiState(
    val title: String = "",
    val isSaving: Boolean = false,
)

// stateful 包装
@Composable
fun NoteScreen(vm: NoteViewModel = viewModel()) {
    val uiState by vm.state.collectAsStateWithLifecycle()
    NoteScreen(
        uiState = uiState,
        onTitleChange = vm::onTitleChange,
        onSave = vm::save,
    )
}
```

这就是 Compose 项目的**标准屏幕模式**:**一个无状态 Composable(可 Preview / 可测) + 一个 stateful 包装从 ViewModel 取状态**。后面所有屏幕都长这样。

---

## 十五、踩坑

**坑 1:`remember` 套在 lambda 外面**。
```kotlin
val items = remember { someExpensiveComputation() }    // 只算一次,但参数变化也不重算
val items = remember(key) { someExpensiveComputation(key) }    // key 变重算
```
取决于语义,但通常你想要 key 变化触发重算。

**坑 2:在 Composable 里直接 `viewModelScope.launch { }`**。Composable 每次重组都跑一遍函数体,这种 launch 会泄漏成百上千个协程。用 `LaunchedEffect`。

**坑 3:把 ViewModel 拿到 `remember` 里**。
```kotlin
val vm = remember { HomeViewModel() }    // ❌ 屏幕旋转后丢失,ViewModel 应当由 ViewModelStore 管理
val vm: HomeViewModel = viewModel()      // ✅ 用 androidx.lifecycle.viewmodel.compose
```

**坑 4:`derivedStateOf` 当成 `useMemo` 滥用**。`derivedStateOf` 只对**包含其它 State 的派生**有意义。
```kotlin
val foo by remember { derivedStateOf { x.toLowerCase() } }    // ❌ x 不是 State,浪费
val foo = remember(x) { x.toLowerCase() }                     // ✅
```

**坑 5:`LaunchedEffect(items) { ... }`,items 是 `List`**。每次组合 List 都是"新对象",`LaunchedEffect` 会一直取消重启。改用 `LaunchedEffect(items.size)` 或者把订阅放 ViewModel。

**坑 6:`MutableState<T>.value` 当成线程安全用**。`MutableState` 本身不是同步原语,从协程改它需要切到主线程或者用 `Dispatchers.Main.immediate`。不过常见模式是"ViewModel 里改 StateFlow,Compose 订阅 StateFlow",这条路本来就主线程派发,不用担心。

**坑 7:Composable 里读 `LocalContext.current` 然后调网络**。Composable 函数应当是幂等的。所有副作用走 `LaunchedEffect` / `DisposableEffect` / `SideEffect`。

**坑 8:把状态放在 Composable 而不是 ViewModel**。一个常见错误是用 `rememberSaveable` 存所有屏幕状态,然后业务逻辑写在 Composable 函数体里。短期看起来简洁,中期会变成"屏幕之间无法共享状态、单元测试做不起来、Preview 一团乱"。**业务状态默认放 ViewModel,UI 临时状态(展开/收起、滚动位置)才放 Composable**。

---

下一篇 `07-输入控件与 TextField2.md`,讲 Compose 1.7+ 新引入的 `BasicTextField`(俗称 TextField2):为什么旧的 `TextField` 在 IME / 组合文本场景下漏洞百出,新的 `TextFieldState` 模型怎么 hoist 输入状态,表单怎么写才不破坏 UDF。
