# 应用架构:ViewModel、UDF 与 UIState

> 一句话:**ViewModel 持有屏幕级状态,UIState 是一个不可变 data class,事件通过方法调用回流——状态向下、事件向上,中间没有绑定回路**。这一篇钉死后面所有屏幕的写法。

---

## 一、状态放在哪:一道二选一题

写 Compose 三天就会撞上一个问题:**这个状态放在 Composable 里(`remember`),还是放在 ViewModel 里(`StateFlow`)?**

判别标准很简单:

**放 Composable 里**(`remember` / `rememberSaveable`):
- 纯 UI 状态:展开/收起、滚动位置、Dialog 显示/隐藏、字段焦点
- 屏幕关掉就该消失的状态
- 不需要业务逻辑响应的状态

**放 ViewModel 里**(`MutableStateFlow<UiState>`):
- 业务数据(笔记列表、用户信息、加载状态)
- 跨配置变化要保留(屏幕旋转、字体变大)
- 需要响应业务事件、调网络、调数据库的状态
- 多个 Composable 共享的状态

**默认放 ViewModel**——大部分状态是业务数据。Composable 里的状态应当少而轻。

---

## 二、UDF:单向数据流

UDF(Unidirectional Data Flow)是 Compose / React / Flutter 共享的核心架构原则:

```
   ┌──────────────┐
   │  ViewModel    │
   │  ├─ state    ────▼
   │  │  StateFlow  
   │  └─ events    ◀────▲
   └──────────────┘     │
                        │
                 (UI 调用 vm.method())
                        ▲
                        │
                 ┌──────┴──────┐
                 │  Composable  │
                 │  (订阅 state) │
                 │  (派发 event) │
                 └──────────────┘
```

**核心**:
- 状态**永远**从 ViewModel 流向 UI(单向)
- 用户操作产生事件,事件**永远**通过调用 ViewModel 的方法回去
- UI 不**反向**写 ViewModel 的状态字段

**反 UDF 的常见错误**:
```kotlin
// ❌
Composable() {
    val state = vm.state
    Button(onClick = { state.count++ }) { ... }   // UI 直接改 state
}

// ✅
Composable() {
    val state by vm.state.collectAsStateWithLifecycle()
    Button(onClick = vm::increment) { ... }       // UI 调 ViewModel 方法
}
```

UDF 的好处不在"写起来更短"——它在以下场景救你的命:

1. **测试**——ViewModel 是纯逻辑,直接单元测试
2. **状态保留**——配置变化时 ViewModel 不重建,状态自动保留
3. **多 UI 复用**——同一个 ViewModel 能给手机、平板、桌面三种 UI 用,状态同步零成本
4. **Time-travel debugging**——状态一坨,可以打日志、回放、对比

---

## 三、`UiState`:不可变 data class

UiState 是 ViewModel 暴露给 UI 的**唯一数据形态**。它是一个 `data class`,所有字段 `val`,集合用不可变接口:

```kotlin
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.persistentListOf

data class HomeUiState(
    val isLoading: Boolean = false,
    val notes: ImmutableList<NoteCard> = persistentListOf(),
    val errorMessage: String? = null,
    val isRefreshing: Boolean = false,
)

data class NoteCard(
    val id: Long,
    val title: String,
    val preview: String,
    val updatedAt: String,
)
```

**几条铁律**:

1. **`val` 全部**——一个字段都不能 `var`
2. **集合用不可变**——`ImmutableList<T>` 来自 `kotlinx.collections.immutable`(不是 `List<T>`,因为后者运行时可能是 MutableList,Compose 稳定性判断失败)
3. **每次更新通过 `copy()`** —— `state.copy(isLoading = true)`
4. **不嵌套 Domain 对象,而是嵌套"UI 模型"**——`NoteCard` 是给 UI 的视图模型,不是数据库里的 `NoteEntity`

为什么不直接暴露 `NoteEntity`?因为 entity 可能有字段 UI 不关心(`raw_html` / `sync_state`),也可能缺字段 UI 想要(`updatedAt` 已格式化的字符串)。把 entity 映射成 UiState 是 ViewModel 的职责之一。

---

## 四、ViewModel 的标准骨架

```kotlin
@HiltViewModel
class HomeViewModel @Inject constructor(
    private val noteRepository: NoteRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(HomeUiState(isLoading = true))
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    private val _events = MutableSharedFlow<HomeEvent>()
    val events: SharedFlow<HomeEvent> = _events.asSharedFlow()

    init {
        viewModelScope.launch {
            noteRepository.observeAll()
                .map { notes -> notes.map { it.toCard() } }
                .catch { e ->
                    _uiState.update { it.copy(errorMessage = e.message, isLoading = false) }
                }
                .collect { cards ->
                    _uiState.update { it.copy(notes = cards.toImmutableList(), isLoading = false) }
                }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true) }
            runCatching { noteRepository.refresh() }
                .onFailure { _events.emit(HomeEvent.ShowError(it.message ?: "刷新失败")) }
            _uiState.update { it.copy(isRefreshing = false) }
        }
    }
    
    fun deleteNote(id: Long) {
        viewModelScope.launch {
            noteRepository.delete(id)
            _events.emit(HomeEvent.NoteDeleted)
        }
    }
}

sealed interface HomeEvent {
    data class ShowError(val message: String) : HomeEvent
    data object NoteDeleted : HomeEvent
}
```

**逐行解释关键点**:

- `MutableStateFlow` 私有 + `StateFlow` 暴露——外部只能读,只能通过 ViewModel 方法间接改
- `init` 块订阅 Repository 的 `Flow`,自动更新 UiState
- `refresh()` 是 UI 触发的方法,在 `viewModelScope` 里跑协程
- **`_events`** 是 `SharedFlow`,用于一次性事件(Toast、导航、关闭对话框)——不是状态

---

## 五、状态 vs 事件:为什么要两个 Flow

新人常问:既然有 UiState,为什么还要 events?

**状态**:屏幕"现在是什么样"。重复看不变。配置变化要保留。
**事件**:刚才发生了什么"一次性的事"。看完就该消失。

举例:
- `isLoading = true` 是状态——UI 持续显示 loading
- "导航到详情页 noteId=42" 是事件——做一次就完,不该重复

如果把事件塞 UiState 里:

```kotlin
data class UiState(
    val showToast: String? = null    // ❌
)
```

会出问题:
- 屏幕旋转,UiState 保留,Toast 又显示一次
- 用户已关 Toast,但 state 没清,下次重组又显示
- 你得手动 `state.copy(showToast = null)` 清除,极易忘

**正确做法**:Toast / 导航 / 错误这种用 SharedFlow,UI 用 `LaunchedEffect` 订阅:

```kotlin
@Composable
fun HomeScreen(vm: HomeViewModel) {
    val state by vm.uiState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(Unit) {
        vm.events.collect { event ->
            when (event) {
                is HomeEvent.ShowError -> {
                    snackbarHostState.showSnackbar(event.message)
                }
                HomeEvent.NoteDeleted -> { /* ... */ }
            }
        }
    }
    
    Scaffold(snackbarHost = { SnackbarHost(snackbarHostState) }) { ... }
}
```

**SharedFlow + LaunchedEffect 是"一次性事件"的标准答案**。

---

## 六、Loading / Error / Empty / Content:四态显式表达

```kotlin
sealed interface NoteListState {
    data object Loading : NoteListState
    data object Empty : NoteListState
    data class Content(val notes: ImmutableList<NoteCard>) : NoteListState
    data class Error(val message: String) : NoteListState
}

data class HomeUiState(
    val listState: NoteListState = NoteListState.Loading,
    val isRefreshing: Boolean = false,
)
```

把"加载中 / 空 / 有内容 / 错误"用 sealed interface 表达,UI 端 `when` 穷尽:

```kotlin
when (val s = state.listState) {
    NoteListState.Loading -> CircularProgressIndicator()
    NoteListState.Empty -> EmptyView()
    is NoteListState.Content -> NoteList(notes = s.notes)
    is NoteListState.Error -> ErrorView(s.message)
}
```

这比"用 `isLoading: Boolean` + `errorMessage: String?` + `notes: List<>` 四个字段相互组合判断"清晰一个数量级。**新项目一开始就用 sealed**,别从布尔标志位起步,后期重构成本极高。

---

## 七、Composable 屏幕的标准模式

每个屏幕**两个 Composable**:**stateful 包装** + **stateless 实现**。

```kotlin
@Composable
fun HomeRoute(
    onNoteClick: (Long) -> Unit,
    vm: HomeViewModel = hiltViewModel(),
) {
    val state by vm.uiState.collectAsStateWithLifecycle()
    
    LaunchedEffect(Unit) {
        vm.events.collect { event ->
            // 处理事件
        }
    }

    HomeScreen(
        state = state,
        onRefresh = vm::refresh,
        onNoteClick = onNoteClick,
        onDelete = vm::deleteNote,
    )
}

@Composable
private fun HomeScreen(
    state: HomeUiState,
    onRefresh: () -> Unit,
    onNoteClick: (Long) -> Unit,
    onDelete: (Long) -> Unit,
) {
    // 纯 UI,可单元测试,可 Preview
}

@Preview
@Composable
private fun HomeScreenPreview() {
    NotedXTheme {
        HomeScreen(
            state = HomeUiState(
                listState = NoteListState.Content(
                    persistentListOf(
                        NoteCard(1, "First note", "...", "今天")
                    )
                )
            ),
            onRefresh = {},
            onNoteClick = {},
            onDelete = {},
        )
    }
}
```

**两个层的职责**:

- `HomeRoute`(stateful):从 Hilt 拿 ViewModel,订阅 state / events,把数据和回调传给 stateless 屏幕。**有副作用,不可 Preview**。
- `HomeScreen`(stateless):接收数据,渲染 UI,通过 callback 派发事件。**纯函数,可 Preview**。

这套写法让你能用假数据 Preview 屏幕、能写 Compose UI 测试不启 ViewModel、能换不同 state 来源给不同 UI 用。**写多了你会发现这是 React/Vue 容器组件 + 展示组件的 Compose 翻版**。

---

## 八、屏幕之间共享状态:三种方法

**方法 A:Navigation 参数传值**(适合简单数据 / ID)

```kotlin
navController.navigate("detail/$noteId")
// 详情屏自己用 noteId 去数据库取详情
```

**方法 B:共享 ViewModel 在 NavGraph scope**(适合多屏共享同一份数据)

```kotlin
val parentEntry = remember(navBackStackEntry) {
    navController.getBackStackEntry("home_graph")
}
val sharedVm: SharedViewModel = hiltViewModel(parentEntry)
```

**方法 C:Repository 单例 + 各自 ViewModel 订阅**(最干净,适合"几乎所有跨屏共享")

```kotlin
class HomeViewModel @Inject constructor(repo: NoteRepository) : ViewModel() {
    val notes = repo.observeAll()  // Repository 是 @Singleton,所有 ViewModel 共享同一份 Flow
}
class DetailViewModel @Inject constructor(repo: NoteRepository, ...) : ViewModel() {
    val note = repo.observeOne(id)
}
```

**默认选 C**——通过 Repository 共享单一数据源,不同屏幕各自订阅。这是 Single Source of Truth(SSoT)原则的体现:数据只有一份,在数据库 / 内存 / Repository 缓存里;任何屏幕的"显示"都是这份数据的视图。

A 与 B 是补充——简单参数走 A,真要"屏幕之间多步交互(向导 / 表单提交流程)"走 B。

---

## 九、`SavedStateHandle`:进程被杀也能恢复

```kotlin
@HiltViewModel
class DetailViewModel @Inject constructor(
    private val savedStateHandle: SavedStateHandle,
    private val repo: NoteRepository,
) : ViewModel() {

    private val noteId: Long = checkNotNull(savedStateHandle["noteId"])
    
    val uiState: StateFlow<DetailUiState> = repo.observeOne(noteId)
        .map { DetailUiState.Content(it) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), DetailUiState.Loading)

    var draftTitle: String
        get() = savedStateHandle.get<String>(KEY_DRAFT) ?: ""
        set(value) { savedStateHandle[KEY_DRAFT] = value }

    companion object { private const val KEY_DRAFT = "draft_title" }
}
```

`SavedStateHandle` 是**进程级**状态保存——比 `rememberSaveable` 寿命还长。系统因内存压力杀进程后,用户回到 App,Activity 重建、ViewModel 重建,但 SavedStateHandle 还在。

**Navigation Compose 2.8+ 类型安全路由会自动把路由参数注入到 SavedStateHandle**,你直接 `savedStateHandle["noteId"]` 就能拿到 navigate 时传的参数。11 篇展开。

**重要状态(草稿、未提交输入)放 SavedStateHandle;临时状态(loading / scroll)放 StateFlow 即可,被杀重建也无所谓**。

---

## 十、`stateIn` 配置的细节

```kotlin
val uiState: StateFlow<UiState> = combine(
    repo.observeNotes(),
    repo.observeTags(),
) { notes, tags -> UiState(notes, tags) }
    .stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = UiState(),
    )
```

`SharingStarted.WhileSubscribed(5_000)` 的意思:**有订阅者时启动上游,最后一个订阅者离开 5 秒后停止**。

为什么是 5 秒?屏幕配置变化(旋转、字体变大)期间订阅者短暂为 0,Compose 重建后又会订阅——5 秒延迟避免"上游 Flow 反复重连数据库 / 网络"。

**`Eagerly` 几乎从不用**——它从 ViewModel 创建就开始订阅,即使 UI 不在前台也跑,浪费电。`Lazily` 也不用——它有第一个订阅就启动且永不停止,会浪费同样的资源。`WhileSubscribed(5_000)` 是默认正确答案。

---

## 十一、Repository 层的责任

ViewModel 不应直接调网络 / 数据库。中间隔一个 Repository:

```kotlin
@Singleton
class NoteRepository @Inject constructor(
    private val dao: NoteDao,                // Room
    private val api: NoteApi,                // Retrofit
) {
    fun observeAll(): Flow<List<Note>> = dao.observeAll()    // 数据库订阅,自动响应变化

    suspend fun refresh() {
        val remote = api.fetchNotes()
        dao.insertAll(remote.map { it.toEntity() })   // 写入数据库,触发 observeAll 的 Flow
    }
    
    suspend fun delete(id: Long) {
        dao.delete(id)
        api.delete(id)
    }
}
```

**Repository 的职责**:

1. **数据来源屏蔽**——ViewModel 不关心数据来自数据库还是网络
2. **缓存策略**——网络拉到的写本地,UI 永远读本地(SSoT)
3. **错误转换**——把 HttpException / IOException 转成业务异常

13 / 14 / 15 篇会展开 Room / DataStore / Retrofit 在 Repository 里的具体实现。

---

## 十二、踩坑

**坑 1:UiState 包含 ViewModel 引用 / 不可序列化对象**。UiState 应当是"纯数据"——没有引用、没有函数、能 toString 干净。
```kotlin
data class UiState(val onClick: () -> Unit)    // ❌
data class UiState(val title: String)         // ✅,onClick 通过 Composable 参数传
```

**坑 2:`viewModelScope.launch` 在屏幕函数体里**。
```kotlin
@Composable
fun Screen(vm: HomeViewModel) {
    vm.viewModelScope.launch { ... }    // ❌
    LaunchedEffect(Unit) { ... }        // ✅ Composable 侧用 LaunchedEffect
}
```
ViewModel 内部协程在 `init` 或 ViewModel 方法里启动,**不在 Composable 里**。

**坑 3:多个 `_uiState.value = ...` 并发**。
```kotlin
viewModelScope.launch {
    _uiState.value = _uiState.value.copy(isLoading = true)    // ❌ 多协程下会丢更新
}
viewModelScope.launch {
    _uiState.update { it.copy(error = ...) }                  // ✅ CAS 安全
}
```
**永远用 `update {}`**,不要 `.value = ... .copy(...)`。

**坑 4:把所有事件塞 UiState**。Toast / 导航 / 一次性提示放 SharedFlow,不要塞 UiState。

**坑 5:ViewModel 持有 Activity / Context 引用**。ViewModel 寿命比 Activity 长(配置变化时 Activity 销毁但 ViewModel 还在),持有 Activity 引用 → 内存泄漏。需要 Context 时用 Hilt 注入 `@ApplicationContext`(进程级,不会泄漏)。

**坑 6:订阅 ViewModel 用 `collectAsState()`(没有 Lifecycle)**。屏幕熄屏 / 后台时仍订阅,白白烧电。**永远用 `collectAsStateWithLifecycle()`**(来自 `lifecycle-runtime-compose`)。

**坑 7:Domain Model 直接当 UiState 用**。Domain Model 是数据库 / 网络的表达;UiState 是 UI 的表达。**两者应当分离**——ViewModel 做映射。短期看似多写代码,长期省下大量重构。

**坑 8:把 ViewModel 写成"被 UI 操控的提线木偶"**。
```kotlin
fun setLoading(b: Boolean) { _state.update { it.copy(isLoading = b) } }
fun setError(s: String?) { _state.update { it.copy(errorMessage = s) } }
```
这种"setter 风格"的 ViewModel 把状态管理责任又推给 UI——破坏 UDF。ViewModel 应当暴露**业务操作**(`refresh()` / `delete(id)`),不是字段 setter。

---

下一篇 `11-NavigationCompose 路由.md`,把"单 Activity 怎么显示多个屏幕"讲清楚。`NavHost` / `composable` / 类型安全路由 / 嵌套图 / Predictive Back / Deep Link 一并钉死。读完之后 NotedX 就有真正的列表 / 详情 / 设置三屏。
