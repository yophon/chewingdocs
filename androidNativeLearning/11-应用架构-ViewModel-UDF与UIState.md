## 11-应用架构:ViewModel、UDF 与 UI State

> 一句话导读:UDF 不是设计模式书里抄来的口号——它是 Compose 重组心智 + 协程结构化作用域 + Flow 冷热语义三件事在一个屏幕维度上的自然汇合,违反它就要为状态不一致与生命周期泄漏付双倍学费。

第 10 篇把动画 / 共享元素的视觉过渡做完,NotedX 的列表 → 详情已经像一款应用而不是一堆 demo。但屏幕上看到的数据还是 `sampleNotes` 这种硬编码常量。这一篇开始把"数据从哪儿来、状态由谁拥有、事件如何回到 UI"三件事按工程化方式摆开。这是数据闭环(11-15 篇)的第一块地基,后面的 Navigation、Hilt、Room、Retrofit 都要在它之上插桩。

Android 历史上回答这个问题的方案多到能写一本书:`Activity` 持有一切、`Presenter` 与 View 接口对打、`MVVM` + DataBinding + LiveData、Redux-style 单一 Store……每一代都解决了上一代的一个痛点又制造了新痛点。Compose 时代尘埃落定:**`ViewModel` 持有 `StateFlow<UiState>`,UI 通过 `collectAsStateWithLifecycle` 订阅,用户 Action 单向流回 ViewModel**——这套就是官方推荐(Now in Android、Architecture Guide 2025)的 UDF (Unidirectional Data Flow)。本篇要做的就是把它落到代码,并把"一次性事件"这种 UDF 不擅长的情况单独处理。

## 1. 机制定位

### 1.1 旧时代为什么失控

把状态散落在 `Activity` 字段里的代码,有两个会被反复打脸的坑:

```kotlin
// 反例 1:Activity 持有可变状态,旋转后丢失
class NoteListActivity : AppCompatActivity() {
    private var notes: MutableList<Note> = mutableListOf()
    private var loading: Boolean = false
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        loadNotes() // 旋转后再跑一遍,网络请求重复
    }
}
```

旋转 Activity 重建,`notes` 与 `loading` 归零,网络请求被发起两遍。靠 `onSaveInstanceState` 抢救只能塞少量 `Parcelable`,大列表没救;且 process death 后 `Activity` 实例都是新的,字段全空。

```kotlin
// 反例 2:Presenter 持有 View 接口,生命周期错位
interface NoteListView { fun showNotes(list: List<Note>) }
class NoteListPresenter(private val view: NoteListView) {
    fun load() { repo.fetch { view.showNotes(it) } } // Activity 销毁后回调还在跑,NPE
}
```

回调里持有 View 引用,Activity 销毁后回调还活着,要么 NPE 要么内存泄露;需要写一堆 `attachView` / `detachView` 样板,所有 Presenter 都长一样。

这两类问题的本质是:**状态生命周期与 UI 实例生命周期被绑死**。`ViewModel` 之所以是答案,是因为它的生命周期与 UI 实例**显式解耦**(随 `ViewModelStoreOwner` 走),旋转、配置变化、Compose 重组都不影响它;同时它持有的状态通过 `StateFlow` 暴露,UI 是被动订阅方,UI 销毁状态留着。

### 1.2 UDF 的三条规则

| 规则 | 含义 | 违反后会怎样 |
| --- | --- | --- |
| 状态单一来源 | 每个屏幕只有一个 `UiState`,所有派生数据从它算出 | 列表 loading / 错误状态散在多处,出现 "loading=false 但 list 是空" 的诡异组合 |
| 单向数据流 | UI 调用 ViewModel.onAction(),ViewModel 写 _uiState | UI 直接改 `_uiState`,绕过校验,状态机失效 |
| 不可变快照 | `UiState` 是 `data class`,新状态是 `copy()` 出来的新实例 | 持有旧引用的协程改字段,Compose 跳过重组 |

第三条最容易在新手手里走样:`MutableStateFlow(UiState(...))` 暴露成 `StateFlow` 是好习惯,但 `UiState` 里有 `MutableList<Note>`,在 ViewModel 里 `_uiState.value.notes.add(x)`,Flow 不会发新值(`value` 还是同一引用),Compose 不重组。`copy()` 是必须的,且内部集合用 `List<T>`(`kotlinx.collections.immutable` 更佳)。

### 1.3 UDF 不擅长的事:一次性事件

UDF 适合"状态",不适合"事件"。"显示一个 Snackbar 说网络出错了"——这是事件:它只该播一次,旋转屏幕后不该再弹一遍。如果把它塞进 `UiState.errorMessage: String?`,旋转重建后 Compose 重新订阅 StateFlow,拿到这个非空 errorMessage,Snackbar 又弹一次。

解法是把事件单独走一条 `Channel<Event>`(或 `SharedFlow<Event>(replay = 0)`)通道。`Channel.receiveAsFlow()` 是热流,值消费即丢,旋转后不会重放;`SharedFlow(replay = 0)` 无新订阅者重放,也满足。两者都不是 `StateFlow`。本篇 §3.3 给出对照代码。

> Google 在 Now in Android 项目里曾把"事件应该建模成状态"作为推荐(把 errorMessage 放 UiState,UI 主动 ack 后置空)。这套是"纯 UDF"派的极简方案;但工程实际中 ack 协议又是一种状态机,复杂度未必比 Channel 低。本系列采用"状态走 StateFlow,一次性事件走 Channel"的两通道方案——这是 NIA 项目 2024 年后的默认范式。

### 1.4 与 Compose 重组的边界

`StateFlow.value` 在 Compose 里读取要走 `collectAsStateWithLifecycle()`,而不是 `collectAsState()`。区别:

| API | 行为 | 风险 |
| --- | --- | --- |
| `collectAsState()` | composition 在前台时收集 | App 进后台时仍持有订阅,可能在不可见时浪费 CPU |
| `collectAsStateWithLifecycle()` | 跟随 `LifecycleOwner` 在 `STARTED` 时收集,`STOPPED` 时取消 | 默认推荐;后台不收集 |

`collectAsStateWithLifecycle()` 来自 `androidx.lifecycle:lifecycle-runtime-compose`,这是 Android 团队 2023 年后的统一推荐。Compose 1.7 时代基本是默认选择,除非你确实需要后台持续收集(几乎没这场景)。

## 2. Android 心智

### 2.1 `ViewModel` 的生命周期与 `viewModelScope`

`ViewModel` 由 `ViewModelStoreOwner` 持有,默认 `ComponentActivity` 与 `NavBackStackEntry`(Navigation 场景)都是 owner。它的生命周期规则:

- 旋转 / 配置变化:owner 重建,`ViewModelStore` 保留,同一 `ViewModel` 实例继续用。
- Activity `finish()` / Navigation `popBackStack`:owner 销毁,`onCleared()` 触发,`viewModelScope` cancel。
- process death:进程被杀,`ViewModel` 实例丢失,重建后是新的。`SavedStateHandle` 是恢复用户输入与列表位置的唯一通道。

`viewModelScope` 是 `ViewModel` 自带的 `CoroutineScope`,绑定到 `onCleared()`。在它内部启动的协程会在 ViewModel 销毁时自动取消,无需手动 `cancel`。这是与"在 Activity 里启 GlobalScope.launch"心智完全相反的——后者要靠自觉 cancel,前者结构化自动管。第 04 篇已铺垫,此处只用。

### 2.2 `SavedStateHandle`:进程死亡的最后一道防线

`SavedStateHandle` 是 `ViewModel` 构造参数(Hilt 自动注入,见第 13 篇),`Bundle` 的 Map 化封装。两类用法:

```kotlin
class EditorViewModel(
    private val state: SavedStateHandle,
) : ViewModel() {
    // 1. 读路由参数(Navigation 自动塞入)
    val noteId: String = state["noteId"] ?: error("missing noteId")

    // 2. 暴露表单字段为 StateFlow,自动持久化
    val title: StateFlow<String> = state.getStateFlow("title", "")
    fun onTitleChange(text: String) { state["title"] = text }
}
```

`getStateFlow(key, initial)` 是 Compose 时代的关键便利:它把 SavedStateHandle 里某个 key 包装成 `StateFlow`,任何 `state[key] = ...` 写入都会触发 Flow 发射。process death 后 `Bundle` 恢复,这条 Flow 自动从恢复值起步。**这才是"表单输入不丢"的现代写法**,不是 `rememberSaveable` 配 `mutableStateOf`(那只能撑住配置变化,撑不住 process death 的复杂状态)。

### 2.3 `MutableStateFlow` / `StateFlow` / `SharedFlow` 的分工

| 类型 | 是 hot 还是 cold | replay 行为 | 用途 |
| --- | --- | --- | --- |
| `Flow<T>` | cold | 每次 collect 从头跑 | 描述数据流转换,如 `Repository.fetchNotes()` |
| `StateFlow<T>` | hot | 总是有一个当前值,新订阅者立刻收到 | 屏幕状态 `UiState` |
| `MutableStateFlow<T>` | hot | 同上,可写 | ViewModel 内部持有 |
| `SharedFlow<T>(replay)` | hot | 可配 replay,默认 0 | 事件总线,可控历史 |
| `MutableSharedFlow<T>` | hot | 同上,可写 + `tryEmit` | 一次性事件通道(也可选 `Channel`) |

ViewModel 的暴露面只暴露**只读类型**(`StateFlow` / `SharedFlow`),不暴露 `Mutable*`。这一规矩通过 Kotlin 的 backing property + 显式 `asStateFlow()` 实现:

```kotlin
private val _uiState = MutableStateFlow(UiState())
val uiState: StateFlow<UiState> = _uiState.asStateFlow()
```

`asStateFlow()` 不是 cast,它返回一个无法被向下 cast 回 mutable 的代理对象。UI 想改状态只能调 `onAction(action)`,这是 UDF 的入口物理保证。

### 2.4 `collectAsStateWithLifecycle` 与 Compose 的桥

```kotlin
@Composable
fun NoteListRoute(viewModel: NoteListViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    NoteListScreen(state = state, onAction = viewModel::onAction)
}
```

这是 NotedX 里每个屏幕的标准入口模板。`Route` Composable 只做"取 ViewModel + 收集 state + 转 action",真正的视图 `NoteListScreen` 是无状态的(stateless),传入 state 与回调即可。这一拆分让 `NoteListScreen` 可以单独被 Preview / UI Test 运行(第 26 篇),不需要 Hilt 环境。

### 2.5 Action 与 Event 的方向

```text
            ┌─────────────────────────────────┐
            │           UI (Compose)           │
            └──────────────┬──────────────────┘
                           │ Action(用户操作:点击、输入)
                           ▼
            ┌─────────────────────────────────┐
            │            ViewModel             │
            │  - _uiState: MutableStateFlow    │
            │  - _events:  Channel<Event>      │
            └──────────────┬──────────────────┘
                           │ Repository.suspend
                           ▼
            ┌─────────────────────────────────┐
            │   Repository / DataSource        │
            └─────────────────────────────────┘

            ▲                          ▲
            │ StateFlow<UiState>       │ Channel.receiveAsFlow()
            │ (持续订阅,有当前值)      │ (一次性事件)
```

UI 永远是被动渲染方;ViewModel 永远是状态唯一可变源;Repository 不知道 UI 与 ViewModel 的存在(参见 [[androidNativeLearning 15-Retrofit闭环]])。

## 3. 工程实现

下面以 NotedX 的"笔记列表 + 详情编辑"为例,给出完整的 ViewModel + UiState + Action + Event 落地。所有代码在 `app/src/main/java/com/example/notedx/ui/note/list/`。Repository 与 Hilt 注入留到第 13-15 篇,这里用 fake 替身保证可运行。

### 3.1 UiState 与 Action 的密封建模

文件位置:`NoteListUiState.kt`。

```kotlin
package com.example.notedx.ui.note.list

import kotlinx.collections.immutable.PersistentList
import kotlinx.collections.immutable.persistentListOf

data class NoteListUiState(
    val notes: PersistentList<NoteItem> = persistentListOf(),
    val isLoading: Boolean = false,
    val selectedIds: PersistentList<String> = persistentListOf(),
    val errorBanner: String? = null,
) {
    val isSelectionMode: Boolean get() = selectedIds.isNotEmpty()
}

data class NoteItem(
    val id: String,
    val title: String,
    val updatedAt: Long,
)

sealed interface NoteListAction {
    data object Refresh : NoteListAction
    data class OpenNote(val id: String) : NoteListAction
    data class ToggleSelect(val id: String) : NoteListAction
    data object DeleteSelected : NoteListAction
    data object DismissBanner : NoteListAction
}

sealed interface NoteListEvent {
    data class NavigateToDetail(val id: String) : NoteListEvent
    data class ShowSnackbar(val message: String) : NoteListEvent
}
```

设计要点:

- `PersistentList`(`kotlinx.collections.immutable`)而不是 `List`:它的 `add` / `remove` 返回新实例,符合不可变心智,且性能比每次 `toMutableList().apply { ... }.toList()` 好。Compose Compiler 把它识别为 stable,不破坏 Strong Skipping(参见 [[androidNativeLearning 22-Compose性能]])。
- `sealed interface NoteListAction`:K2 编译器对 `sealed interface` 的 `when` 穷尽性检查比 `sealed class` 更彻底,且允许跨模块继承。所有用户意图都收敛在这里;ViewModel 的 `onAction` 是一个巨大 `when` 表达式,看上去很 Redux 但实质就是 UDF。
- `selectedIds` 而不是给每个 `NoteItem` 加 `isSelected`:让模型与状态分离,`NoteItem` 是数据快照,选中状态是 UI 的事。这让同一份 `NoteItem` 可以被多个屏幕共享。
- `errorBanner: String?` 是"持久性错误"(网络不可达,需要用户看到直到他手动 dismiss);一次性提示走 `NoteListEvent.ShowSnackbar`。区分这两类是 UDF 工程化的关键。

### 3.2 ViewModel:状态机的实现

文件位置:`NoteListViewModel.kt`。

```kotlin
package com.example.notedx.ui.note.list

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.notedx.data.NoteRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.collections.immutable.toPersistentList
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

@HiltViewModel
class NoteListViewModel @Inject constructor(
    private val repo: NoteRepository,
    private val savedState: SavedStateHandle,
) : ViewModel() {

    private val _uiState = MutableStateFlow(NoteListUiState(isLoading = true))
    val uiState: StateFlow<NoteListUiState> = _uiState.asStateFlow()

    private val _events = Channel<NoteListEvent>(
        capacity = Channel.BUFFERED,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )
    val events = _events.receiveAsFlow()

    init {
        // 进程恢复后,把上次的选中态从 SavedStateHandle 恢复
        val restored: List<String> = savedState["selected"] ?: emptyList()
        _uiState.update { it.copy(selectedIds = restored.toPersistentList()) }
        load()
    }

    fun onAction(action: NoteListAction) {
        when (action) {
            NoteListAction.Refresh -> load()
            is NoteListAction.OpenNote -> openNote(action.id)
            is NoteListAction.ToggleSelect -> toggleSelect(action.id)
            NoteListAction.DeleteSelected -> deleteSelected()
            NoteListAction.DismissBanner -> _uiState.update { it.copy(errorBanner = null) }
        }
    }

    private fun load() {
        _uiState.update { it.copy(isLoading = true, errorBanner = null) }
        viewModelScope.launch {
            runCatching { repo.fetchAll() }
                .onSuccess { list ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            notes = list.map { n -> NoteItem(n.id, n.title, n.updatedAt) }
                                .toPersistentList(),
                        )
                    }
                }
                .onFailure { e ->
                    _uiState.update {
                        it.copy(isLoading = false, errorBanner = e.message ?: "未知错误")
                    }
                }
        }
    }

    private fun openNote(id: String) {
        viewModelScope.launch { _events.send(NoteListEvent.NavigateToDetail(id)) }
    }

    private fun toggleSelect(id: String) {
        _uiState.update { current ->
            val next = if (id in current.selectedIds) {
                current.selectedIds.remove(id)
            } else {
                current.selectedIds.add(id)
            }
            savedState["selected"] = next.toList()
            current.copy(selectedIds = next)
        }
    }

    private fun deleteSelected() {
        val ids = _uiState.value.selectedIds
        if (ids.isEmpty()) return
        viewModelScope.launch {
            runCatching { repo.deleteAll(ids) }
                .onSuccess {
                    _uiState.update {
                        it.copy(
                            notes = it.notes.removeAll { n -> n.id in ids },
                            selectedIds = persistentListOf(),
                        )
                    }
                    savedState["selected"] = emptyList<String>()
                    _events.send(NoteListEvent.ShowSnackbar("已删除 ${ids.size} 条"))
                }
                .onFailure { e ->
                    _uiState.update { it.copy(errorBanner = e.message ?: "删除失败") }
                }
        }
    }
}
```

设计要点:

- `_uiState.update { it.copy(...) }`:`MutableStateFlow.update` 是原子的 CAS,比 `_uiState.value = _uiState.value.copy(...)` 在并发写时不丢失变更。多个协程同时 update 不会互相覆盖。
- `Channel(capacity = BUFFERED, onBufferOverflow = DROP_OLDEST)`:一次性事件的标准配置。`BUFFERED` 表示按需扩容,`DROP_OLDEST` 防止 UI 离开订阅(进后台)时事件堆积无上限。
- `events = _events.receiveAsFlow()`:暴露成 cold-ish Flow,每次 collect 拿后续事件,不重放。
- `SavedStateHandle` 用作 `selectedIds` 的持久化:进程死亡后选中状态保留,符合 Android 系统级 UX 期待。
- `runCatching` 而不是 try/catch:Kotlin idiom,与 `Result<T>` 配套,后续 §3.4 还能进一步包装。

### 3.3 UI 侧:Route 与 Screen 的拆分

文件位置:`NoteListRoute.kt` 与 `NoteListScreen.kt`。

```kotlin
// NoteListRoute.kt
package com.example.notedx.ui.note.list

import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.compose.LifecycleResumeEffect
import kotlinx.coroutines.flow.flowWithLifecycle
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner

@Composable
fun NoteListRoute(
    onOpenDetail: (String) -> Unit,
    viewModel: NoteListViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbarHost = remember { SnackbarHostState() }
    val lifecycleOwner = LocalLifecycleOwner.current

    LaunchedEffect(viewModel, lifecycleOwner) {
        viewModel.events
            .flowWithLifecycle(lifecycleOwner.lifecycle, Lifecycle.State.STARTED)
            .collect { event ->
                when (event) {
                    is NoteListEvent.NavigateToDetail -> onOpenDetail(event.id)
                    is NoteListEvent.ShowSnackbar -> snackbarHost.showSnackbar(event.message)
                }
            }
    }

    NoteListScreen(
        state = state,
        snackbarHost = snackbarHost,
        onAction = viewModel::onAction,
    )
}
```

```kotlin
// NoteListScreen.kt
package com.example.notedx.ui.note.list

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Banner
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ListItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier

@Composable
fun NoteListScreen(
    state: NoteListUiState,
    snackbarHost: SnackbarHostState,
    onAction: (NoteListAction) -> Unit,
    modifier: Modifier = Modifier,
) {
    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(title = { Text(if (state.isSelectionMode) "${state.selectedIds.size} 项" else "笔记") })
        },
        snackbarHost = { SnackbarHost(hostState = snackbarHost) },
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
            when {
                state.isLoading -> CircularProgressIndicator()
                state.notes.isEmpty() -> Text("空空如也")
                else -> LazyColumn(modifier = Modifier.fillMaxSize()) {
                    state.errorBanner?.let { msg ->
                        item {
                            Banner(
                                title = { Text(msg) },
                                actions = { Button(onClick = { onAction(NoteListAction.DismissBanner) }) { Text("关闭") } },
                            )
                        }
                    }
                    items(items = state.notes, key = { it.id }) { note ->
                        ListItem(
                            headlineContent = { Text(note.title) },
                            modifier = Modifier.clickable { onAction(NoteListAction.OpenNote(note.id)) },
                        )
                    }
                }
            }
        }
    }
}
```

设计要点:

- `flowWithLifecycle(STARTED)`:事件流跟随生命周期,App 进后台时事件挂起(被 Channel 缓冲),回到前台再消费。这就是为什么 `Channel` 要配 `BUFFERED` + `DROP_OLDEST`。
- `Route` 持有 ViewModel,`Screen` 完全无状态:`Screen` 可以丢进 `@Preview` 直接跑(传 mock state),也可以丢进 Compose UI Test(传 fake onAction)。这是测试金字塔 [[androidNativeLearning 26-Compose测试]] 的关键拆分。
- `NoteListEvent.NavigateToDetail` 不直接调 `NavHostController.navigate`:导航是 UI 框架的事,ViewModel 不该认识 `NavController`。Route 拿到事件后转给上游 lambda(`onOpenDetail`),路由配线集中在 `NavHost` 里(第 12 篇)。

### 3.4 表单场景:SavedStateHandle 暴露 StateFlow

文件位置:`NoteEditorViewModel.kt`。展示 §2.2 提到的"用户输入文本随时持久化"。

```kotlin
package com.example.notedx.ui.note.editor

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.notedx.data.NoteRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class EditorUiState(
    val title: String = "",
    val body: String = "",
    val isSaving: Boolean = false,
    val canSave: Boolean = false,
)

@HiltViewModel
class NoteEditorViewModel @Inject constructor(
    private val repo: NoteRepository,
    private val savedState: SavedStateHandle,
) : ViewModel() {

    private val noteId: String? = savedState["noteId"]
    private val title = savedState.getStateFlow("title", "")
    private val body = savedState.getStateFlow("body", "")
    private val isSaving = MutableStateFlow(false)

    val uiState: StateFlow<EditorUiState> = combine(title, body, isSaving) { t, b, s ->
        EditorUiState(
            title = t,
            body = b,
            isSaving = s,
            canSave = t.isNotBlank() && !s,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = EditorUiState(),
    )

    fun onTitleChange(text: String) { savedState["title"] = text }
    fun onBodyChange(text: String) { savedState["body"] = text }

    fun save() {
        if (!uiState.value.canSave) return
        isSaving.value = true
        viewModelScope.launch {
            runCatching { repo.upsert(noteId, title.value, body.value) }
                .also { isSaving.value = false }
        }
    }
}
```

设计要点:

- **`title` / `body` 直接走 `SavedStateHandle.getStateFlow`**:用户输入文本进程死亡也能恢复,免去单独写 `onSaveInstanceState`。
- **`combine` + `stateIn`**:把多个独立 Flow 派生成单一 `UiState`。`SharingStarted.WhileSubscribed(5_000)` 表示"没有订阅者后 5 秒停止上游收集",避免短暂跳转时频繁重启 combine。
- **`canSave` 是派生状态**,不是 ViewModel 显式持有的字段。这就是"派生从 UiState 算"的实质:任何能从 title/body/isSaving 推出的判断都不该单独存。
- `onTitleChange` 不动 `uiState`,只写 `savedState["title"]`:因为 `savedState.getStateFlow` 已经把它包成 Flow,combine 会自动重算 uiState。这是 UDF 的优雅之处:写入入口与状态推导分离。

## 4. 调参与验收

### 4.1 影响心智清晰度的几个参数

| 参数 | 位置 | 典型值 | 影响 |
| --- | --- | --- | --- |
| `SharingStarted.WhileSubscribed(timeoutMillis)` | `stateIn` | 5_000 | 屏幕切换间隔短时复用上游,过大浪费内存,过小频繁重订阅 |
| `Channel.capacity` | 事件通道 | `BUFFERED` | 决定后台积压策略 |
| `Channel.onBufferOverflow` | 事件通道 | `DROP_OLDEST` | 防止内存膨胀;也可 `SUSPEND` 让生产者等 |
| `Lifecycle.State` | `flowWithLifecycle` | `STARTED` | `STARTED` 平衡前台与后台耗电;`RESUMED` 仅在最顶层 Activity |

### 4.2 验收清单

- 旋转屏幕:列表内容、loading 状态、selectedIds 全部保留;不重新发起网络请求。
- 杀进程恢复(开发者选项 "不保留活动"):打开编辑器输入标题 → 杀进程 → 重新打开应用,标题文本仍在,且 `noteId` 路由参数恢复。
- 网络错误:errorBanner 显示在列表顶部,用户点关闭后消失;再下拉刷新 banner 不再自动出现(因为是一次性 dismiss 状态)。
- 删除成功后 Snackbar 弹一次:把应用切到后台再切回来,Snackbar 不应该再弹一次。
- Compose 重组次数:在 Layout Inspector 启用 `Show Recomposition Counts`,滚动列表时只有可见的 `ListItem` 重组,头部 `TopAppBar` 不增长。
- 单元测试:`NoteListViewModel` 接受 fake `NoteRepository`,在没有 Android 框架(纯 JVM)下能跑;`onAction` → 状态变化 → 断言 `uiState.value` 是单元测试主线。

### 4.3 性能与诊断

- Android Studio Profiler → CPU 视图,可见 `viewModelScope` 启动的协程归属在 ViewModel 上,Activity 销毁后协程立即结束。
- `adb shell dumpsys activity activities` 查看 Activity 栈,旋转前后 task id 不变但 instance id 变,ViewModel 实例(可在日志看 hashCode)保持一致。
- Process death 模拟:`adb shell am kill com.example.notedx`,重新启动后状态恢复检查;若 `SavedStateHandle` 里没存的字段全部归零,核对哪些应该走 `getStateFlow`。

## 5. 踩坑

### 5.1 `_uiState.value.copy()` 与 `update` 的并发差异

```kotlin
// 反例:两个协程同时跑,第二个的更新可能丢失
_uiState.value = _uiState.value.copy(isLoading = true)
_uiState.value = _uiState.value.copy(errorBanner = null)

// 正例:CAS 原子,无丢失
_uiState.update { it.copy(isLoading = true, errorBanner = null) }
```

`update` 内部用 `compareAndSet` 循环,任何冲突都会重试。开发期单线程看不出差异,真实 IO 协程并行写时单测才能复现。NotedX 项目里规定:`MutableStateFlow` 写入只走 `update`,把这条规则放进 ktlint 自定义检查。

### 5.2 `UiState` 持有不稳定字段击穿 Strong Skipping

```kotlin
// 反例:lambda 不是 stable,持有它的 ViewModel 也被识别为 unstable
data class UiState(val onClick: () -> Unit, val items: List<X>)
```

Compose 1.7 Strong Skipping 默认会跳过参数没变的 composable;但 `UiState` 里塞一个 lambda 字段,每次重建实例 lambda 引用都不同,UI 永远不被 skip。规则:**`UiState` 只放数据快照,所有 lambda 通过单独的 `onAction` 参数传递**。第 22 篇会量化这部分性能差距。

### 5.3 `Channel` 没人收时事件丢失

```kotlin
// 反例:onCreate 立刻 send,UI 还没开始 collect
init {
    viewModelScope.launch { _events.send(NoteListEvent.ShowSnackbar("欢迎")) }
}
```

`Channel` 是 hot 的,`send` 之后如果还没有 `receive`,数据进缓冲;但如果 UI 进 `STARTED` 之前事件已经被 `DROP_OLDEST` 挤掉,就丢了。对于"打开屏幕立即触发"的事件,改用 `UiState` 一次性字段(然后 UI 消费后 ack),或者 `SharedFlow(replay = 1)`。

### 5.4 `collectAsState` 与 `collectAsStateWithLifecycle` 混用

老教程满网都是 `collectAsState`。它在 App 进后台时仍然在收集,如果 ViewModel 上游是个不停发数据的 Flow(WebSocket、传感器),后台白白耗电。**统一用 `collectAsStateWithLifecycle()`**,Lint 规则可加 `KotlinComposeRule.collectAsStateInsteadOfCollectAsStateWithLifecycle`。

### 5.5 `SavedStateHandle` 不能存大对象

`SavedStateHandle` 底层是 `Bundle`,系统对 Bundle 大小有约 1MB 软上限(Android 13+ TransactionTooLargeException)。把整个 `List<Note>`(数百条)塞进去会崩。规则:`SavedStateHandle` 只存"用户输入"(标题、表单字段、选中 id 列表)、"导航参数"(路由 id)与"轻量 UI 状态"(展开 / 折叠 bool);列表数据从 Repository 重拉,Repository 自己负责缓存(第 14 篇 Room)。

### 5.6 `viewModelScope.launch { repo.x }` 异常未捕获导致 crash

`viewModelScope` 是 `SupervisorScope`,子协程异常不向父传播——但**未捕获的异常会经默认 `CoroutineExceptionHandler` 走 logcat**,在 release 模式下表现为静默吞掉。所有 launch 都该用 `runCatching` 或 try/catch,不要让异常飘到 handler。

### 5.7 `hiltViewModel()` 的作用域陷阱

`hiltViewModel()` 默认绑定到最近的 `ViewModelStoreOwner`。Navigation Compose 里每个 `composable` 路由都是一个独立 owner,所以两个屏幕拿到的是不同 ViewModel 实例。要在父子路由间共享 ViewModel,显式指定 `viewModelStoreOwner = navController.getBackStackEntry("parent-route")`,这是第 12 篇会展开的话题。

### 5.8 `combine` 多个 `StateFlow` 的初始触发

`combine` 必须等所有上游都发出至少一个值才会下发第一个组合值。`SavedStateHandle.getStateFlow(key, initial)` 自带初始值所以没问题;但如果上游是 `MutableSharedFlow(replay=0)`,combine 一直等不到,UI 看到的是 `initialValue`(stateIn 给的默认),迷惑半天。**确保 combine 的所有上游要么是 `StateFlow`,要么用 `onStart { emit(initial) }` 兜底**。

### 5.9 `data class` 自动生成 `equals` 的开销

`UiState` 里塞了一个上万条的 `List<NoteItem>`,每次 `update` 后 `MutableStateFlow` 会 `equals` 比较新旧值——`List.equals` 是 O(n)。`PersistentList` 也是 O(n)(虽然内部有结构共享 hashCode),但 `compareReference` 优化让"未变"路径是 O(1)。规则:大列表用 `PersistentList`,且 update 时尽量复用引用(`current.copy(notes = current.notes)` 不要无意义重建)。

### 5.10 K2 编译器 `sealed interface` 的彻底性检查

Kotlin 2.0 (K2) 对 `when (action: NoteListAction)` 的彻底性检查更严:新增一个 `Action` case 后,所有 `when` 都会编译错。这是好事,但如果你在 ViewModel 之外的代码(分析 / 日志)里也写了 `when (action)` 又没加 `else`,会跟着报错。把 sealed interface 的消费收敛到 ViewModel 的 `onAction`,其他地方一律 `else -> { /* no-op */ }` 或者干脆不消费。

### 5.11 一次性事件用 LiveData 是上代教程的死灰复燃

仍有 2020 年 SingleLiveEvent 教程的余孽,把事件用 `LiveData` + `Event<T>` wrapper 实现。Compose 时代 LiveData 已被官方在 `lifecycle-livedata-ktx` 标记为"互操作用,不推荐新代码"。本系列禁用 LiveData,新代码统一 `StateFlow` + `Channel`/`SharedFlow`,与协程心智一致。

---

## 手动验证

- [ ] 列表加载:首次打开 `NoteListRoute`,显示 loading 指示器,数据回来后切换为列表;旋转屏幕过程中 loading 状态不闪烁,网络请求不重发。
- [ ] 选中态持久化:多选几条笔记后旋转屏幕,选中数量保留;`adb shell am kill com.example.notedx` 杀进程后重新打开,选中态仍恢复。
- [ ] 一次性事件:删除选中项后 Snackbar 弹一次,把 App 切到后台再切回来,Snackbar 不再次弹出。
- [ ] 错误 banner:断网下拉刷新,banner 显示 "未知错误",点关闭后消失;再次刷新成功后 banner 不出现。
- [ ] 表单恢复:打开 `NoteEditorViewModel` 对应屏幕,输入标题,杀进程,重新打开,标题文本仍在。
- [ ] Compose 重组:Layout Inspector 启用重组计数,只有可见 `ListItem` 跟随滚动重组,`TopAppBar` 重组计数保持 1。
- [ ] 单元测试:`NoteListViewModel` 用 `runTest { ... }` + Fake `NoteRepository` 跑,断言 `onAction(Refresh)` 后 `uiState.value.notes` 包含预期数据,断言 `events` 收到预期事件。
