# 协程与 Flow:结构化并发

> 一句话:**协程是绑了生命周期的轻量级线程,Flow 是协程上的可观察数据序列**。Android 上所有异步代码——网络、数据库、定时器、传感器、UI 状态——都是这两件事的组合。

---

## 一、Android 异步的三代史

| 时代 | 主线方案 | 致命问题 |
| --- | --- | --- |
| 2010-2017 | `AsyncTask` + `Handler` | 内存泄漏(`Activity` 被持有);取消困难;主线程死锁 |
| 2015-2020 | RxJava 2/3 | 学习曲线极陡;调试栈深;操作符过多;取消需手动管 disposable |
| 2018- | **Kotlin 协程 + Flow** | (无,这是当前答案) |

**Android 官方钉死的姿态**:`AsyncTask` 在 Android 11 (API 30) 被 deprecated;RxJava 不再出现在 Google 官方教程;协程是 Jetpack Lifecycle / Room / Retrofit / WorkManager 的**默认 API 形态**——`suspend fun` 不再是"可选",是**默认就长这样**。

> 后续 18 篇里**没有一行 RxJava 代码**。`Handler` 仅在第 16 篇前台服务做一次反例。这是路线选择,不是个人偏好——Google 自己也这么走。

---

## 二、协程到底是什么

新人最容易把协程当成"线程"或"轻量级线程"。**协程不是线程**。

协程的本质:**一个可以被挂起、之后恢复的函数**。Kotlin 编译器把 `suspend fun` 编译成"带回调 + 状态机"的代码——函数遇到挂起点(`suspend` 调用),把当前状态保存,**释放线程**,等异步操作完成后再换一个线程恢复执行。

```
普通函数:                协程:
fun load():              suspend fun load():
  Thread 占着              Thread 干别的事
  ↓ 网络请求               ↓ 网络请求(挂起,释放 Thread)
  Thread 阻塞              ......(Thread 可以去跑别的协程)
  ↓ 返回                   ↓ 响应到了,从 Dispatcher 拿一个 Thread 恢复
  return                   return
```

所以协程的真正卖点不是"快",是**用很少的线程跑很多并发任务**。1000 个协程可以共享几个线程,因为协程在挂起点把线程让出去了。

**对比**:RxJava 也能做"少线程多任务",但它强迫你用操作符链式表达;协程让你用**看起来同步的写法**实现异步。

---

## 三、`suspend fun`:语法标记,不是关键字魔法

```kotlin
suspend fun fetchNotes(): List<Note> {
    val resp = api.getNotes()        // 挂起点
    return resp.toDomain()
}
```

读法:**`suspend` 告诉编译器:这个函数里可能有挂起点,所以它**只能从协程或另一个 `suspend fun` 里调用**。

```kotlin
fun onClick() {
    fetchNotes()    // ❌ 编译错:不能在非 suspend 上下文调
}

fun onClick() {
    viewModelScope.launch {
        val notes = fetchNotes()    // ✅ 协程里
    }
}
```

`suspend` 不会让函数自动跑在子线程!**默认线程由调用它的协程的 `Dispatcher` 决定**。

---

## 四、`CoroutineScope`:绑生命周期的容器

协程不能"裸 launch"。每个协程必须挂在某个 `CoroutineScope` 上,scope 决定:

- 这些协程在哪个线程跑(`Dispatcher`)
- 这些协程什么时候被取消(scope 取消时)
- 异常如何传播

Android 提供了三个开箱即用的 scope:

```kotlin
// 1. ViewModel 内:viewModelScope
class HomeViewModel : ViewModel() {
    init {
        viewModelScope.launch {       // ViewModel 销毁时自动取消
            val notes = repo.fetchNotes()
            _state.update { it.copy(notes = notes) }
        }
    }
}

// 2. LifecycleOwner(Activity / Fragment):lifecycleScope
class MainActivity : ComponentActivity() {
    override fun onCreate(...) {
        lifecycleScope.launch {       // Activity 销毁时自动取消
            // 一般不在 Composable 应用里用,放在 ViewModel 里更合适
        }
    }
}

// 3. Composable 内:rememberCoroutineScope()
@Composable
fun Screen() {
    val scope = rememberCoroutineScope()   // Composable 离开组合时取消
    Button(onClick = {
        scope.launch { ... }    // 事件触发的临时协程
    }) { ... }
}
```

**核心心智**:**协程的取消是自动的,你不该手动管 disposable**。这是和 RxJava 最大的差别。把 scope 选对,后续不用记得释放任何东西。

---

## 五、`Dispatchers`:协程跑在哪个线程

```kotlin
viewModelScope.launch {
    // 默认 Dispatchers.Main.immediate(主线程)
    val notes = withContext(Dispatchers.IO) {
        dao.queryAll()             // 切到 IO 线程池
    }
    _state.value = state.value.copy(notes = notes)  // 切回主线程
}
```

四个标准 Dispatcher:

| Dispatcher | 用途 | 线程数 |
| --- | --- | --- |
| `Dispatchers.Main` | UI 更新,Compose 重组 | 1(主线程) |
| `Dispatchers.Main.immediate` | 同 Main,但如果已在主线程则立即执行,不调度 | 1 |
| `Dispatchers.IO` | 文件 / 网络 / 数据库等 I/O 阻塞操作 | 默认 64 |
| `Dispatchers.Default` | CPU 密集型(图像处理 / JSON 解析 / 加密) | CPU 核数 |

**`withContext(Dispatchers.IO) { ... }`**——这是把代码块切到 IO 线程并等其结束的标准写法。`withContext` 是 `suspend`,不会阻塞,等子块返回后协程继续。

**Retrofit / Room 自己内部已经切到 IO 线程**——你调 `dao.queryAll()` / `api.getX()` 不需要再裹 `withContext(Dispatchers.IO)`。**反过来,自己写的同步 IO(比如 `File.readText()`)必须裹 `withContext(Dispatchers.IO)`**。

---

## 六、`launch` vs `async`:启动协程的两种方式

```kotlin
// launch:启动协程,返回 Job,不关心结果
viewModelScope.launch {
    repo.refresh()
}

// async:启动协程,返回 Deferred<T>,可以 await() 拿结果
viewModelScope.launch {
    val notes = async { repo.fetchNotes() }
    val tags = async { repo.fetchTags() }
    val combined = notes.await() to tags.await()    // 两个并行
}
```

**心智**:`launch` 是"启动一个后台任务",`async` 是"启动并最终取它的返回值"。日常 99% 用 `launch`,只有需要**并行多个独立请求**时才用 `async` + `await`。

---

## 七、结构化并发:`coroutineScope` / `supervisorScope`

```kotlin
suspend fun loadAll(): Pair<List<Note>, List<Tag>> = coroutineScope {
    val notes = async { fetchNotes() }
    val tags = async { fetchTags() }
    notes.await() to tags.await()
}
```

`coroutineScope { ... }` 创建一个**子 scope**,有两个关键性质:

1. **block 结束前,所有子协程必须完成**——`loadAll` 不会在子协程没跑完时返回。
2. **一个子失败,整个 scope 取消**——`fetchNotes()` 抛异常,`fetchTags()` 也会被取消。

如果不想"一个失败拖死全部",用 `supervisorScope`:

```kotlin
suspend fun loadAll() = supervisorScope {
    val notes = async { fetchNotes() }   // 失败不影响 tags
    val tags = async { fetchTags() }
    runCatching { notes.await() }.getOrNull() to
        runCatching { tags.await() }.getOrNull()
}
```

**这就是"结构化并发"的核心**——子协程的生命周期严格嵌套在父 scope 里,没有"游荡的协程"。Java 的 `ExecutorService` 没有这个保证,你可以提交一个任务然后 forget,这是泄漏的主要来源。

---

## 八、取消:协作式,不是抢占式

```kotlin
val job = viewModelScope.launch {
    while (isActive) {                    // 协作检查
        val data = fetchPage()
        delay(1000)                       // delay 是 suspend,会检查取消
    }
}
job.cancel()                              // 取消请求
```

协程取消**不是强杀线程**,是给协程"打个标记",协程在挂起点(`delay` / `withContext` / `await` / `suspend fun` 调用)主动检查,看到标记就抛 `CancellationException` 退出。

**`CancellationException` 是正常控制流,不是错误**——它会沿父子关系向上传播取消信号。所以:

```kotlin
viewModelScope.launch {
    try {
        repo.refresh()
    } catch (e: Exception) {
        // ❌ 这样写会吃掉取消异常,协程取消失败
    }
}

// 正确写法:
viewModelScope.launch {
    try {
        repo.refresh()
    } catch (e: CancellationException) {
        throw e                  // 一定要重抛
    } catch (e: Exception) {
        // 业务异常处理
    }
}

// 或者用 runCatching(它内部会处理 CancellationException):
val result = runCatching { repo.refresh() }
```

**协程里如果有"长时间运行不挂起"的代码**(比如纯 CPU 循环),需要主动 `yield()` 或 `ensureActive()`——否则取消信号过不去,scope 销毁了协程还在跑。

---

## 九、Flow:协程上的可观察序列

`suspend fun` 解决"异步返回单值"。**异步返回多值**(数据库变更通知、传感器数据、定时器 tick)用 `Flow`。

```kotlin
fun notesFlow(): Flow<List<Note>> = flow {
    emit(emptyList())           // 先发个空
    val notes = api.getNotes()
    emit(notes)                 // 再发实际数据
}
```

`Flow` 是**冷流**:有 collector 订阅时才开始执行 `flow { ... }`,每个 collector 独立执行一遍。

```kotlin
viewModelScope.launch {
    notesFlow().collect { notes ->     // 订阅
        _state.update { it.copy(notes = notes) }
    }
}
```

**Flow 的关键操作符**(只列在 Android 反复用的):

```kotlin
flow
    .map { it.filter { n -> !n.archived } }    // 转换
    .filter { it.isNotEmpty() }                // 过滤
    .distinctUntilChanged()                    // 去重连续相同
    .debounce(300)                             // 抖动(输入搜索常用)
    .flowOn(Dispatchers.IO)                    // 上游切到 IO 线程
    .catch { e -> emit(emptyList()) }          // 异常捕获
    .onEach { Log.d(TAG, it.toString()) }      // 副作用
    .collect { ... }
```

**关键约束**:`flowOn(Dispatchers.IO)` 只影响**它上游**的操作。这是"context preservation"——下游(包括 `collect`)默认跑在 collector 所在的协程上下文。

---

## 十、`StateFlow` / `SharedFlow`:热流

`Flow` 是冷的——每个 collector 都重新执行一遍源头。但 UI 状态需要**共享**——多个 collector 看的是同一个值,且后来的订阅者要能看到"当前值"。

这两件事用 **`StateFlow`** / **`SharedFlow`**——热流(hot flow)。

```kotlin
class HomeViewModel : ViewModel() {
    private val _state = MutableStateFlow(HomeUiState())     // 必须有初始值
    val state: StateFlow<HomeUiState> = _state.asStateFlow()

    fun load() {
        viewModelScope.launch {
            val notes = repo.fetchNotes()
            _state.update { it.copy(notes = notes) }
        }
    }
}

@Composable
fun HomeScreen(vm: HomeViewModel = viewModel()) {
    val uiState by vm.state.collectAsStateWithLifecycle()    // 订阅
    // ...
}
```

**`StateFlow` 与 `SharedFlow` 的区别**:

| 维度 | `StateFlow` | `SharedFlow` |
| --- | --- | --- |
| 必须有初始值 | ✅ | ❌ |
| 保留最后一个值 | ✅(永远有 .value) | 可配置(`replay = N`) |
| 去重相同值 | ✅(`distinctUntilChanged`) | ❌ |
| 用途 | **UI 状态** | **一次性事件**(导航、Toast、错误提示) |

**记忆心法**:**`StateFlow` 给 UI 状态,`SharedFlow` 给一次性事件**。状态是"现在是什么样",事件是"刚才发生了什么"——这两件事在数据模型上根本不同,不能用同一类型表达。10 篇会展开。

`SharedFlow` 用例:

```kotlin
private val _events = MutableSharedFlow<UiEvent>()
val events: SharedFlow<UiEvent> = _events.asSharedFlow()

fun saveNote() {
    viewModelScope.launch {
        repo.save(...)
        _events.emit(UiEvent.NavigateBack)    // 一次性事件
    }
}
```

UI 侧:

```kotlin
LaunchedEffect(Unit) {
    vm.events.collect { event ->
        when (event) {
            UiEvent.NavigateBack -> navController.popBackStack()
        }
    }
}
```

---

## 十一、`stateIn` / `shareIn`:Flow 转热流

经常你有一个冷的 `Flow<List<Note>>`(来自 Room 的 `dao.observeAll()`),想把它暴露成 `StateFlow<List<Note>>`:

```kotlin
val notes: StateFlow<List<Note>> = dao.observeAll()
    .stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = emptyList(),
    )
```

**`SharingStarted.WhileSubscribed(5_000)` 是 Android 的标准配方**:有订阅者时才订阅源 Flow,最后一个订阅者离开 5 秒后断开。屏幕旋转的瞬间订阅者短暂为 0,这 5 秒延迟保证不会重新拉一次。

`Eagerly`:立即开始,从不停止——会泄漏 Flow 源,**几乎不该用**。
`Lazily`:有第一个订阅者时开始,从不停止——后台仍持续,不省电。
`WhileSubscribed(5_000)`:默认推荐。

---

## 十二、`collectAsStateWithLifecycle`:Compose 侧的正确订阅

```kotlin
val uiState by vm.state.collectAsStateWithLifecycle()
```

**不要**用 `collectAsState()`(没有 Lifecycle)——它在屏幕熄屏 / 后台时仍然订阅,白白烧电。`collectAsStateWithLifecycle()` 在 `STARTED` 以下自动停止订阅。这是 `androidx.lifecycle:lifecycle-runtime-compose` 提供的扩展,**Compose Android 项目永远用这个**。

---

## 十三、踩坑

**坑 1:在 Activity / Composable 里用 `GlobalScope.launch`**。`GlobalScope` 没有生命周期,启动的协程会永远跑下去——内存泄漏 + 后台烧电。**项目里 `GlobalScope` 这个名字出现就是错的**,99% 应该是 `viewModelScope` / `lifecycleScope` / `rememberCoroutineScope()`。

**坑 2:`runBlocking` 在生产代码出现**。`runBlocking` 把协程**变回**阻塞调用,主线程跑会 ANR。它只应在测试或 `main` 函数顶层出现。

**坑 3:吃掉 `CancellationException`**。`catch (e: Exception)` 会把 `CancellationException` 也接住,然后协程"无法取消"。永远先 `catch (e: CancellationException) { throw e }` 或者用 `runCatching`(它内部正确处理)。

**坑 4:`Dispatchers.IO` 当 CPU 用**。IO 线程池(默认 64 线程)是给阻塞 IO 设计的。**纯计算(JSON 解析、图片处理)用 `Dispatchers.Default`**。混了会让 IO 线程池被 CPU 任务占满,真正的 IO 排队。

**坑 5:`Flow` 在 ViewModel 里多次 `collect` 同一个源**。每次 `collect` 都重新订阅冷流——意味着 Room 查询执行多次、网络请求重发。需要共享给多个观察者时用 `stateIn` / `shareIn` 转热流。

**坑 6:把 `SharedFlow` 用作状态**。`SharedFlow` 没有"当前值"概念,新订阅者只能拿到后续事件。如果你要的是"打开屏幕立即看到当前的笔记列表",用 `StateFlow`,不是 `SharedFlow`。

**坑 7:`StateFlow.update {}` 与 `.value = ...` 在并发下不一样**。
```kotlin
_state.value = _state.value.copy(count = _state.value.count + 1)  // ❌ 并发下丢更新
_state.update { it.copy(count = it.count + 1) }                    // ✅ CAS 循环,并发安全
```
ViewModel 多协程更新状态时,**永远用 `update {}`**,不要 `.value =`。

**坑 8:把网络请求写在 `init {}` 里**。`init {}` 在 ViewModel 创建时立即执行,但你这时 UI 还没就绪——更糟的是测试时 mock 装不上。**改用懒触发**:`init {}` 里只发起 `viewModelScope.launch { load() }`,真正的网络在 `suspend fun load()` 里;或在 UI 侧用 `LaunchedEffect(Unit) { vm.load() }` 显式触发。

---

下一篇 `05-Compose入口与单Activity.md`,正式打开"那棵 UI 树"。从单个 `ComponentActivity` 的 `setContent { }` 进入,讲清楚 Composable 函数到底是什么、Material 3 主题怎么生效、edge-to-edge 与 `Scaffold` 的内边距如何处理。从这一篇开始,NotedX 长出第一个真正的屏幕。
