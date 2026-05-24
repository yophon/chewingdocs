# 05-Flow、StateFlow 与 SharedFlow

> 一句话导读:`Flow` 是协程的"流式表达式",`StateFlow` 是"会记忆当前值的可观测状态",`SharedFlow` 是"可以广播给多个订阅者的事件总线"。三者的区别只有一个核心维度:**hot 还是 cold,有没有 replay**。

第 04 篇把"启动并取消一次性任务"讲透了。本篇要解决的是:**怎样让数据持续流向 UI,而不是每次 UI 想看就调用一次 `suspend` 函数**。这正是 Compose 单向数据流(UDF)的核心抽象 —— Composable 只订阅 `StateFlow`,不主动拉取。

读者画像默认:你写过 RxJava 的 `Observable` / `BehaviorSubject` / `PublishSubject`,或者 React 的 `useState`,或者 Vue 的 `ref / computed`。本篇会把这些类比一次性建立,然后讲清楚 Kotlin Flow 在 Android 上的工程边界。

## 1. 机制定位

LiveData 时代留下的工程债主要有三种:

**第一,生命周期与数据耦合**。`LiveData` 的生命周期感知是它的卖点,但反过来也成了枷锁 —— 它**只能在主线程发射**(`postValue` 是个补丁),且必须有一个 `LifecycleOwner` 才能 `observe`,这让"在 ViewModel 之外的纯业务层"几乎没法用 LiveData。Repository 暴露 `LiveData` 是个反模式,但很多老项目就是这么写的。

**第二,缺少操作符**。`LiveData` 的 `map` / `switchMap` 是后加的,且只有这两个核心。想做防抖(`debounce`)、节流(`throttle`)、合并(`combine`)、超时,要么手写 Handler,要么引入 RxJava 包一层。

**第三,没有"冷流"概念**。`LiveData` 本质是热的(有当前值,观察者可立刻拿到),所以它根本不适合表达"按需启动的数据源"。比如"打开搜索框时再开始监听键盘输入",用 LiveData 表达只能 `value = null` 兜底,语义混乱。

RxJava 解决了上面三条,但代价是另起炉灶的庞大 API(几百个操作符)+ `Disposable` 手动管理 + 与协程的双语言体系。

Kotlin Flow 给的答案是:**用 `suspend` 的语义包装一个"可挂起的迭代器"**。`Flow<T>` 本质是一个 `suspend fun collect(collector: FlowCollector<T>)` 接口,生产端写 `flow { emit(...) }`,消费端写 `flow.collect { ... }`,中间用 `map` / `filter` / `combine` 等操作符变换。所有变换都是**冷的、按需启动**,且**取消传播继承自协程**,所以前一篇讲的"作用域死,任务必死"自动延续过来。

但有些场景需要"热"语义 —— 多个 UI 订阅同一份数据、永远要记得当前值、Activity 旋转后立刻拿到最新值。这才是 `StateFlow` 与 `SharedFlow` 出现的理由。它们都是 Flow,但持有内部状态,行为类似 RxJava 的 `BehaviorSubject` / `PublishSubject`。

本篇要解决的具体问题是:**让你下笔写 Repository / ViewModel 时,知道每个地方暴露什么类型(`Flow` / `StateFlow` / `SharedFlow`),订阅端用哪个 API,以及 Compose 里要用 `collectAsStateWithLifecycle` 而不是 `collectAsState`**。

## 2. Android 心智

### Cold Flow:`flow { ... }` 的真实形态

```kotlin
val timer: Flow<Int> = flow {
    var i = 0
    while (true) {
        emit(i++)
        delay(1000)
    }
}
```

这段代码在定义时**什么都不发生**。`flow { ... }` 返回的是一个 `Flow<Int>` 对象,内部只是把那个 lambda 存起来。直到有人调 `timer.collect { ... }`,lambda 才被执行。

这是冷流的核心性质:**每个订阅者触发一次独立的执行**。两个不同的 Composable `collect` 同一个 `flow { }`,会有两个独立的循环、两份计数。这与 LiveData 不同,与 RxJava `Observable.create` 相同。

冷流的"取消"也是结构化的。`collect` 是 `suspend` 函数,它运行在某个协程里,该协程取消,`collect` 抛出 `CancellationException`,`flow { }` 内部正在 `emit` 或 `delay` 的挂起点立刻退出。所以**不需要"手动 unsubscribe"**,作用域结束所有订阅自动清理 —— 这是 Flow 相对 RxJava 的最大工程红利。

### 操作符:符合 Kotlin 习惯的链式表达

```kotlin
val searchResults: Flow<List<Note>> = searchInput
    .debounce(300.milliseconds)
    .distinctUntilChanged()
    .filter { it.length >= 2 }
    .mapLatest { query -> repo.search(query) }
    .flowOn(Dispatchers.Default)
    .catch { e -> emit(emptyList()) }
```

四类操作符是 Android 工程中最常用的:

| 类别 | 典型操作符 | 用途 |
| --- | --- | --- |
| 时序 | `debounce`、`sample`、`throttleLatest` | 用户输入防抖,避免每个按键都触发网络 |
| 转换 | `map`、`mapLatest`、`transformLatest` | `mapLatest` 在上游有新值时取消未完成的下游 |
| 合并 | `combine`、`zip`、`merge`、`flatMapLatest` | 多个数据源合成 UiState |
| 错误 | `catch`、`retryWhen`、`onCompletion` | `catch` 只捕获上游异常,不捕获下游 |
| 上下文 | `flowOn(Dispatchers.IO)` | **只影响其上游的执行 Dispatcher**,这条很反直觉 |

`flowOn` 的"上游"语义是 Flow 设计最初学者容易摔的地方:`flow { emit(...) }.map { ... }.flowOn(Dispatchers.Default).map { ... }` 中,**前两个块在 Default 上,第三个 map 在收集者的 Dispatcher 上**。所以**`flowOn` 应该尽可能靠近 source 端**,把"重活"圈定在它之前。

`mapLatest` 与 `flatMapLatest` 是搜索 / 自动补全等"上游变化要取消旧请求"场景的标配。它在新值到达时取消下游正在跑的协程,等价于 RxJava 的 `switchMap`。

### Hot Flow:`StateFlow` 与 `SharedFlow`

`StateFlow<T>` 的工程要素:

1. **有"当前值"**(`.value` 可同步读取),所以新订阅者**立刻**能拿到当前值。
2. **conflated(合并)**:订阅者来不及消费的中间值会被新值覆盖,只保证看到最新。
3. **distinctUntilChanged 默认开启**:相同的值不会触发重发(用 `equals` 比较)。
4. **只有 1 个 replay slot**,等价于 `SharedFlow(replay = 1)` + conflation。

这套语义刚好就是"UI 状态"的画像:UI 只关心"现在长什么样",中间过渡态可以丢,重复的状态不必重发。所以 `MutableStateFlow<UiState>` 是 Compose UDF 架构的标配数据类型。

`SharedFlow<T>` 是更通用的可配置广播流:

```kotlin
val events = MutableSharedFlow<UserEvent>(
    replay = 0,                                       // 新订阅者不重放历史
    extraBufferCapacity = 16,                         // 慢消费者的容忍窗口
    onBufferOverflow = BufferOverflow.DROP_OLDEST,    // 溢出策略
)
```

它的核心用途是**一次性事件**(navigation、toast、snackbar、震动反馈)—— 这类事件不是"状态",不能被合并、不能丢、消费一次后就不该再出现。`replay = 0` 保证旋转屏幕后不会重新弹一次 toast。

`replay > 0` 的 `SharedFlow` 等价于 RxJava 的 `ReplaySubject`,但很少在 UI 层用 —— 一旦你需要 replay,通常应该改用 `StateFlow`。

### `stateIn` / `shareIn`:把冷流变热

最常见的 Repository 暴露姿势:

```kotlin
@Singleton
class NoteRepository @Inject constructor(
    private val dao: NoteDao,
    @ApplicationScope private val scope: CoroutineScope,
) {
    val notes: StateFlow<List<Note>> = dao.observeAll()
        .map { entities -> entities.map(NoteEntity::toDomain) }
        .stateIn(
            scope = scope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = emptyList(),
        )
}
```

`stateIn` 做了三件事:

1. 把 cold `Flow` 在指定 scope 里 `launch` 一次收集协程;
2. 把所有 emit 转成内部 `MutableStateFlow.value =` 写入;
3. 返回一个对外只读的 `StateFlow`,可供多方订阅,**只跑一份上游**。

`SharingStarted.WhileSubscribed(5_000)` 是关键参数:**当订阅者数量降到 0 时,等 5 秒,如果仍然没有新订阅者,停止上游;有订阅者时立刻恢复**。5 秒钟刚好覆盖 Activity 旋转 / 暂时不可见的中间窗口,既避免"屏幕一锁后 Room 还在跑"的浪费,也避免"旋转后立刻重新跑一遍上游"的代价。这个参数是 Google 官方架构示例反复推荐的默认值。

其他可选 `SharingStarted`:

- `SharingStarted.Eagerly`:scope 创建时立刻订阅,直到 scope 结束。适合"必须一直跟"的数据(比如全局登录状态)。
- `SharingStarted.Lazily`:第一次订阅时启动,**之后永不停止**,直到 scope 结束。慎用,内存泄露隐患。

### `collectAsStateWithLifecycle` vs `collectAsState`

```kotlin
@Composable
fun NotesScreen(viewModel: NotesViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    // ...
}
```

`collectAsState` 来自 `androidx.compose.runtime`,它本质是 `LaunchedEffect` 里 `collect { value = it }`,只要 Composable 还在组合树里就一直收集。问题:**Activity 进入后台(`onStop`)时,Composable 没退出组合树,所以还在收集**。如果上游是无限循环 Flow,这会导致后台仍在计算 / 计费 / 烧 CPU。

`collectAsStateWithLifecycle` 来自 `androidx.lifecycle:lifecycle-runtime-compose`,内部用 `repeatOnLifecycle(STARTED)` 包了一层,Lifecycle 离开 `STARTED` 时停止收集,回到 `STARTED` 时重新收集。**这是当代 Android 工程的标准姿势,新代码一律用这个**。

唯一的例外:**Repository / Domain 层之间不用 `collectAsStateWithLifecycle`**(它们不在 Composable 里),直接 `Flow<T>` 链式组合即可。

## 3. 工程实现

下面给 NotedX 应用里的两条完整数据流,展示 Repository 暴露 `Flow` 与 `StateFlow` 的边界、ViewModel 把多个 Flow 合成 UiState、Composable 订阅状态、事件流用 `SharedFlow` 单独传递。

**第一步:Repository 同时暴露持续流与一次性操作**

```kotlin
// data/src/main/java/com/notedx/data/note/NoteRepository.kt
package com.notedx.data.note

import com.notedx.data.di.ApplicationScope
import com.notedx.data.note.local.NoteDao
import com.notedx.data.note.local.NoteEntity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.Dispatchers
import javax.inject.Inject
import javax.inject.Singleton

@OptIn(ExperimentalCoroutinesApi::class)
@Singleton
class NoteRepository @Inject constructor(
    private val dao: NoteDao,
    @ApplicationScope private val externalScope: CoroutineScope,
) {

    /**
     * 全量笔记的"主流"。Room 的 Flow DAO 是冷流,
     * 用 stateIn 包成热流后,多个订阅者共享单次查询。
     */
    val notes: StateFlow<List<Note>> = dao.observeAll()
        .map { list -> list.map(NoteEntity::toDomain) }
        .flowOn(Dispatchers.Default) // 域转换在 Default,IO 已由 Room 处理
        .stateIn(
            scope = externalScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = emptyList(),
        )

    /**
     * 单笔记详情。这里有意保留 cold 形态:
     * 每个详情页订阅自己的 id,不共享。
     */
    fun observe(id: String): Flow<Note?> =
        dao.observeById(id)
            .map { it?.toDomain() }
            .flowOn(Dispatchers.Default)

    /**
     * 一次性操作仍然是 suspend,而不是 Flow。
     * "动作"与"流"在签名上严格分开。
     */
    suspend fun upsert(note: Note) {
        dao.upsert(note.toEntity())
    }
}
```

关键决策:

**1. "状态用 Flow,动作用 suspend"**。这条划分是 UDF 架构的核心 —— 暴露状态的是 `Flow` / `StateFlow`,触发变更的是 `suspend fun`。不要写 `fun save(): Flow<Result>` —— 这种"一次性操作伪装成 Flow"会让上层混乱。

**2. `stateIn(WhileSubscribed(5_000))` 是 99% 场景的默认值**。旋转屏幕窗口期内不重启上游,Activity 真正不可见超过 5 秒才停。

**3. 详情页保留 cold**。每个详情页订阅的 id 不同,共享一份热流没意义;让它保留 cold,生命周期跟 Composable 走。

**第二步:ViewModel 合成 UiState + 事件流**

```kotlin
// feature/notes/src/main/java/com/notedx/feature/notes/NotesViewModel.kt
package com.notedx.feature.notes

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.notedx.data.note.NoteRepository
import com.notedx.data.search.SearchRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@OptIn(FlowPreview::class, ExperimentalCoroutinesApi::class)
@HiltViewModel
class NotesViewModel @Inject constructor(
    private val notes: NoteRepository,
    private val search: SearchRepository,
) : ViewModel() {

    private val query = MutableStateFlow("")
    private val isLoading = MutableStateFlow(false)

    /**
     * UiState 由两个 Flow 合成:
     * - notes.notes:全量笔记的热流
     * - query + search 结果(只有非空 query 时才走搜索)
     */
    val uiState: StateFlow<NotesUiState> = combine(
        notes.notes,
        query.debounce(250L).flatMapLatest { q ->
            if (q.isBlank()) notes.notes else search.search(q)
        },
        isLoading,
    ) { all, filtered, loading ->
        NotesUiState(
            allCount = all.size,
            visible = filtered,
            isLoading = loading,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = NotesUiState(),
    )

    /**
     * 一次性事件:Toast / Navigation / Snackbar。
     * replay = 0 防止旋转屏幕后重弹;extraBufferCapacity = 1 容忍快产生慢消费。
     */
    private val _events = MutableSharedFlow<NotesEvent>(
        replay = 0,
        extraBufferCapacity = 1,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )
    val events: SharedFlow<NotesEvent> = _events.asSharedFlow()

    fun onQueryChanged(text: String) {
        query.value = text
    }

    fun save(note: Note) {
        viewModelScope.launch {
            isLoading.value = true
            runCatching { notes.upsert(note) }
                .onSuccess { _events.tryEmit(NotesEvent.Saved(note.id)) }
                .onFailure { e ->
                    if (e is kotlinx.coroutines.CancellationException) throw e
                    _events.tryEmit(NotesEvent.Error(e.message ?: "save failed"))
                }
            isLoading.value = false
        }
    }
}

data class NotesUiState(
    val allCount: Int = 0,
    val visible: List<Note> = emptyList(),
    val isLoading: Boolean = false,
)

sealed interface NotesEvent {
    data class Saved(val id: String) : NotesEvent
    data class Error(val message: String) : NotesEvent
}
```

关键决策:

**1. `combine` 是合成 UiState 的标准操作符**。任一上游 emit,combine 重新触发 transform,产出新 UiState。`debounce + flatMapLatest` 把搜索的"输入抖动 + 旧请求取消"两件事一起处理。

**2. 状态(`StateFlow<NotesUiState>`)和事件(`SharedFlow<NotesEvent>`)分开暴露**。这条边界一旦混淆,UI 层就会出现"旋转后又弹了一次 toast"的 bug。状态可以重放、可以等幂;事件只允许消费一次。

**3. `runCatching` + 显式 rethrow `CancellationException`**。这是第 04 篇坑 4 的延续,本篇所有 try/catch / runCatching 都要这样写。

**4. `tryEmit` vs `emit`**。`tryEmit` 是非挂起版本,bufferCapacity 满了返回 `false`(可静默丢);`emit` 在 bufferCapacity 满时挂起。事件流推荐 `tryEmit` + `DROP_OLDEST`,理由:一次性事件不该阻塞业务流。

**第三步:Composable 订阅状态与事件**

```kotlin
// feature/notes/src/main/java/com/notedx/feature/notes/NotesScreen.kt
@Composable
fun NotesScreen(viewModel: NotesViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    // 事件流:LaunchedEffect 内用 repeatOnLifecycle 包一层,
    // 与 collectAsStateWithLifecycle 保持一致的可见性语义。
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(viewModel, lifecycle) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            viewModel.events.collect { event ->
                when (event) {
                    is NotesEvent.Saved -> snackbarHostState.showSnackbar("saved")
                    is NotesEvent.Error -> snackbarHostState.showSnackbar(event.message)
                }
            }
        }
    }

    Scaffold(snackbarHost = { SnackbarHost(snackbarHostState) }) { padding ->
        Column(Modifier.padding(padding)) {
            if (state.isLoading) LinearProgressIndicator()
            LazyColumn {
                items(state.visible, key = Note::id) { NoteCard(it) }
            }
        }
    }
}
```

关键决策:

**1. UiState 用 `collectAsStateWithLifecycle`,事件用 `repeatOnLifecycle(STARTED) { collect }`**。两者的生命周期语义是一致的:`STARTED` 以下不收集。`collectAsStateWithLifecycle` 内部就是这个实现,只是对 `StateFlow` 做了 `by State` 桥接。

**2. 事件不该用 `collectAsState` / `collectAsStateWithLifecycle`**。事件不是状态,把它包成 `State<T>` 就会引入"重复消费"的可能(重组时再读到同一个事件)。`SharedFlow + collect` 是一次性消费,确保 toast 只弹一次。

## 4. 调参与验收

### 类型选择决策表

| 场景 | 类型 | 原因 |
| --- | --- | --- |
| UI 状态(可重放、有当前值、合并重复) | `StateFlow<UiState>` | conflated + replay=1 + distinctUntilChanged 默认 |
| 一次性事件(navigation / toast / snackbar) | `SharedFlow(replay = 0)` | 旋转屏幕不重放,扣减误触概率 |
| 持续数据源(Room、定时器、传感器) | `Flow<T>` cold,Repository 用 `stateIn` 转热 | 上游单跑,多订阅者共享 |
| 一次性操作(save、login) | `suspend fun` | 不是流,不该套 Flow |
| 多个上游合成 UiState | `combine(a, b, c) { ... }.stateIn(...)` | 任一变化就重算 |
| 用户输入 + 远程搜索 | `query.debounce.flatMapLatest { remote.search(it) }` | 自带防抖与旧请求取消 |

### `SharingStarted` 选项对比

| 策略 | 行为 | 适用场景 |
| --- | --- | --- |
| `Eagerly` | scope 创建立刻启动,直到 scope 结束 | 全局必须实时跟随的状态(登录态、远程配置) |
| `Lazily` | 首次订阅启动,**永不停止** | 慎用,几乎不该选 |
| `WhileSubscribed(0)` | 订阅数变 0 立刻停止 | 严格按需的场景,但配置变更会导致重启 |
| `WhileSubscribed(5_000)` | 订阅数 0 后等 5 秒停止 | **99% Android UI 场景的默认值** |

### 验收工具

第一,**`debug-coroutines` 的 dump**。在 `Application.onCreate` 里:

```kotlin
if (BuildConfig.DEBUG) {
    System.setProperty(DEBUG_PROPERTY_NAME, DEBUG_PROPERTY_VALUE_ON)
}
```

然后在某一时刻 `DebugProbes.dumpCoroutines()`,可以看到当前所有活跃协程的栈,**包括正在 `Flow.collect` 挂起的位置**。配合 `adb shell am dumpheap` 排查"Flow 收集泄露"。

第二,**Layout Inspector + Logcat**。Compose 的重组日志可通过 `Recomposer.runtimeConfig` 启用。如果你发现某个 Composable 频繁重组,大概率是 `StateFlow` 的 `distinctUntilChanged` 没生效(typically because UiState 的 `equals` 用的是默认引用相等),应该用 `data class`,K2 的 smart cast 在 `data class` 上更稳。

第三,**单测用 `Turbine`**。`app.cash.turbine:turbine` 是测 Flow 的事实标准:

```kotlin
@Test fun `combine emits when any upstream changes`() = runTest {
    viewModel.uiState.test {
        assertThat(awaitItem()).isEqualTo(NotesUiState())
        viewModel.onQueryChanged("foo")
        // debounce 250ms 后才触发
        advanceTimeBy(300)
        assertThat(awaitItem().visible).isNotEmpty()
    }
}
```

### 验收清单

- [ ] Repository 暴露的状态都是 `Flow` / `StateFlow`,**没有 `LiveData`**;一次性操作都是 `suspend fun`。
- [ ] ViewModel 内的 `MutableStateFlow` 没有 `public`,只暴露 `val state: StateFlow<...>`。
- [ ] 所有 `stateIn` 都指定了 `SharingStarted.WhileSubscribed(5_000)`(或有意识地选了别的)。
- [ ] Composable 中收集 `StateFlow` 用 `collectAsStateWithLifecycle`,**不是 `collectAsState`**。
- [ ] Composable 中收集 `SharedFlow` 事件用 `repeatOnLifecycle(STARTED) { collect }`。
- [ ] 旋转屏幕不会重新弹一次 Snackbar / Toast(事件流的 `replay = 0` 验证)。
- [ ] 搜索框快速键入 10 个字符,**只发出 1 次网络请求**(debounce + flatMapLatest 验证)。

## 5. 踩坑

**坑 1:`StateFlow` 不会 emit 相同的值**

`StateFlow` 内置 `distinctUntilChanged`,用 `equals` 比较。如果你的 UiState 是 `data class`,两个内容相同的实例 `equals` 为 true,所以**不会触发新 emit**,UI 也不会重组。这通常是想要的;但如果你的 UiState 里持有的对象重写了 `equals` 出错,会出现"我明明 update 了,UI 没反应"的 bug。修法:确保 UiState 是 `data class`,且其字段都是值语义类型。

**坑 2:`collectAsState` 在后台仍然收集**

```kotlin
val state by viewModel.uiState.collectAsState()  // ← 错
```

Activity onStop 后,Composable 还在组合树里(没销毁),`collectAsState` 还在收集,后台仍消耗 CPU / 内存。换成 `collectAsStateWithLifecycle()`。`androidx.lifecycle:lifecycle-runtime-compose` 依赖里。

**坑 3:`flowOn` 的"上游"语义**

```kotlin
flow { /* A */ }
    .map { /* B */ }
    .flowOn(Dispatchers.Default)
    .map { /* C */ }
    .collect { /* D */ }
```

`A` 和 `B` 在 `Default`,`C` 和 `D` 在 collect 协程的 Dispatcher。把 `flowOn` 写在链尾,只影响整条上游;写在中间,只影响它之前。**重活尽量放到 source 一侧,把 flowOn 紧贴 source**。

**坑 4:`MutableSharedFlow.emit` 在 buffer 满时会挂起**

```kotlin
private val _events = MutableSharedFlow<Event>(replay = 0, extraBufferCapacity = 0)

fun onClick() {
    viewModelScope.launch {
        _events.emit(Event.Clicked)  // 没人订阅时挂起永远
    }
}
```

`replay = 0 + extraBufferCapacity = 0` 且没有订阅者时,`emit` 会挂起等订阅者出现。配置变更 / 后台时,UI 没订阅 -> 事件挂起 -> ViewModel 协程一直占着。修法:`extraBufferCapacity` 设 1 以上,或用 `tryEmit` 配 `DROP_OLDEST`。

**坑 5:`Flow.first()` / `Flow.toList()` 不会自动取消上游**

```kotlin
suspend fun firstNote(): Note = repo.notes.first { it.isNotEmpty() }.first()
```

第一个 `first` 是 Flow 操作符,取得第一个值后**会**取消上游(对于 cold flow 是 cancel collect 协程;对于 `StateFlow`,因为是热流,只是取消自己的 collect 协程)。但如果上游是不可取消的循环(看坑 5 of 第 04 篇),会一直跑。**确保上游有协作取消点**。

**坑 6:`combine` 等待所有源至少 emit 一次才首次触发**

```kotlin
combine(flowA, flowB) { a, b -> ... }
```

如果 `flowB` 永远没 emit,这个 combine 也永远不会输出。这与"我以为 a 来了就该输出"的直觉冲突。修法:给慢源一个 `.onStart { emit(default) }`,或者直接用 `flowB.stateIn(..., initialValue = ...)` 让它有"初始值"。

**坑 7:`stateIn` 必须给 `initialValue`,但很多场景写不出来**

```kotlin
val uiState = combine(...).stateIn(scope, WhileSubscribed(5_000), initialValue = ???)
```

如果 UiState 是个复杂结构,"初始值"很难定义。两种做法:**(a)** UiState 加一个 `Loading` 状态(`sealed interface UiState { object Loading; data class Loaded(...) }`),initialValue = Loading;**(b)** UiState 是 `data class` 默认全 0 / 空,UI 自己处理空态。Google 官方示例倾向 (a)。

**坑 8:`flatMapLatest` 与 `mapLatest` 的区别**

`mapLatest { value -> transform }` 中,`transform` 是普通块,可挂起,返回 `Result`。
`flatMapLatest { value -> anotherFlow }` 中,要返回另一个 `Flow`,会自动展开。

错用:

```kotlin
query.flatMapLatest { q -> repo.search(q) }   // 正确:repo.search 返回 Flow
query.mapLatest { q -> repo.search(q) }       // 错:返回 Flow<Flow<List>>
```

**坑 9:`Channel` 是另一种工具,不要拿来当 `SharedFlow` 用**

老代码里有 `Channel<Event>` + `receiveAsFlow()` 的事件总线写法,在 `SharedFlow` 出现前是主流。今天 `MutableSharedFlow(replay = 0, extraBufferCapacity = 1, onBufferOverflow = DROP_OLDEST)` 是更标准的事件总线。`Channel` 还有用场,但仅限于"严格 1:1 生产消费"的场景。

**坑 10:`Flow.asLiveData()` 是迁移期临时桥,新代码不要用**

```kotlin
val notesLiveData = repo.notes.asLiveData()   // 不应在新代码里出现
```

`LiveData` 在 Compose 项目里没有任何独立价值。`Flow.asLiveData()` 是给老 XML View 体系做兼容的,纯 Compose 项目里这条 API 应该是 0 次出现。第 03 篇互操作章节会再讲一次"和 LiveData 的边界"。

**坑 11:Compose `collectAsStateWithLifecycle` 第二个参数 `minActiveState` 默认 `STARTED`,够用但要知道**

`collectAsStateWithLifecycle(minActiveState = Lifecycle.State.RESUMED)` 可以更严格,只在 RESUMED 时收集。但 RESUMED 切到 STARTED 时(被遮挡、对话框出现)就停,通常不是想要的。**默认 STARTED 适用 99% 场景**,改之前想清楚。

**坑 12:`SharedFlow` 没有 `.value`**

`SharedFlow` 没有"当前值"概念,只有 `replayCache`(replay > 0 时)和 `subscriptionCount`。要从 SharedFlow 拿"最后一个值",要么转 `StateFlow`(`shareIn` + `replay = 1` + `WhileSubscribed`),要么自己缓存。

**坑 13:Composable 内 `remember { flow {} }` 是个反模式**

`flow {}` 不要 `remember`。每次重组 lambda 都生成一个新 Flow 对象,但 `collect` 仍然引用旧的;真正用 `remember` 的目的是"避免重组时重新启动 collect",而那应该是 `LaunchedEffect(key)` 的 key 来控制。Flow 本身不该 remember;Flow 暴露在 ViewModel 上即可。

**坑 14:`Flow` 内部捕获了外部可变变量,会有"看似无意"的逻辑漏洞**

```kotlin
var counter = 0
val f = flow {
    while (true) {
        emit(counter++)
        delay(1000)
    }
}
```

cold flow 每次订阅都执行一次 lambda,这里 `counter` 是外部状态,**所有订阅者共享同一个 `counter`**。两个订阅者同时跑,值会交错。修法:把状态移到 flow 内部 `flow { var i = 0; while (true) { emit(i++); ... } }`。

---

`Flow` / `StateFlow` / `SharedFlow` 三件套不是"Reactive 框架",而是 Kotlin 协程为持续数据流准备的语言级表达。在 Android 工程里,它们刚好与 Compose 的 UDF / Lifecycle 形成铁三角:Repository 暴露 `Flow`,ViewModel `stateIn` 成 `StateFlow`,Composable `collectAsStateWithLifecycle` 收。事件流单独用 `SharedFlow(replay = 0)` 传递。这套组合是当代 Android 架构的最大公约数。下一篇从数据层切到 UI 入口,讲清 Compose 的 `setContent`、`Scaffold` 与 Android 15 强制 edge-to-edge 后必须正确处理的 `WindowInsets`。

## 手动验证

- [ ] 在 `ViewModel.init` 里 `Log.d` 一行,然后旋转屏幕 5 次,日志只出现 1 次(说明 ViewModel 没被重建)。
- [ ] 把 `collectAsStateWithLifecycle` 改成 `collectAsState`,前台跑一会儿,按 Home,用 `adb shell dumpsys cpuinfo | grep <app>` 看到后台仍有 CPU 消耗;改回 `collectAsStateWithLifecycle` 重测,后台 CPU 降到 0。
- [ ] 故意让 Repository 的 `notes` 用 `SharingStarted.Lazily`,前台进入 -> 后台 -> 销毁 Activity -> 重启,观察后台仍有 Room 查询;改成 `WhileSubscribed(5_000)` 后正常。
- [ ] `query.debounce(250)` 与 `flatMapLatest`,在搜索框 1 秒内输入 10 个字符,网络层只看到 1 次请求(可在 Retrofit OkHttp `HttpLoggingInterceptor` 验证)。
- [ ] 事件流 `replay = 0`:触发 Snackbar 后立刻旋转屏幕,**不会再次出现** Snackbar。
- [ ] 把上面改成 `replay = 1`,旋转屏幕后**会再次出现** Snackbar(说明误用 replay 的代价)。

---

**下一篇:** `06-Compose入口与单Activity.md`,把"状态流向 UI"延伸到"UI 从哪里开始",讲清 Android 15 edge-to-edge 强制下的 `setContent` 与 `WindowInsets` 处理。
