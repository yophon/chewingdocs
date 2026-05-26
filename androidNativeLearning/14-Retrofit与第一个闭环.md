# Retrofit 与第一个端到端闭环

> 一句话:**网络拉到数据后,不要直接给 UI——写进 Room,UI 通过订阅 Room Flow 自动看到新数据**。这是 Android 现代客户端的"单一数据源"(SSoT)模式。本篇把这条链路全部钉死。

---

## 一、闭环的全貌

```
   ┌─────────────────────┐
   │      远端 API       │
   └──────────┬──────────┘
              │ Retrofit (suspend)
              ▼
   ┌─────────────────────┐
   │     Repository      │
   │  (协调远端 + 本地)   │
   └──────────┬──────────┘
              │ 写入
              ▼
   ┌─────────────────────┐
   │       Room DB       │ ← 单一数据源(SSoT)
   └──────────┬──────────┘
              │ Flow 订阅
              ▼
   ┌─────────────────────┐
   │     ViewModel       │
   │  (Flow → UiState)   │
   └──────────┬──────────┘
              │ StateFlow
              ▼
   ┌─────────────────────┐
   │     Composable      │
   └─────────────────────┘
```

**核心**:UI **永不直接读网络**。网络只负责"把数据塞进本地",UI 永远读本地。这套模式的红利:

- **离线可用**——没网仍能显示历史数据
- **响应即时**——本地写入触发 Flow,UI 不等网络
- **断网恢复**——重连后再 refresh,数据自动覆盖
- **状态一致**——多屏共享数据,通过 Room 一处写多处订阅

---

## 二、Retrofit + kotlinx.serialization

`libs.versions.toml`(02 篇已配):

```toml
retrofit = "2.11.0"
okhttp = "4.12.0"
kotlinx-serialization = "1.7.3"

retrofit = { module = "com.squareup.retrofit2:retrofit", version.ref = "retrofit" }
retrofit-kotlinx-serialization = { module = "com.squareup.retrofit2:converter-kotlinx-serialization", version.ref = "retrofit" }
okhttp = { module = "com.squareup.okhttp3:okhttp", version.ref = "okhttp" }
okhttp-logging = { module = "com.squareup.okhttp3:logging-interceptor", version.ref = "okhttp" }
kotlinx-serialization-json = { module = "org.jetbrains.kotlinx:kotlinx-serialization-json", version.ref = "kotlinx-serialization" }
```

`:app/build.gradle.kts`:

```kotlin
plugins {
    alias(libs.plugins.kotlin-serialization)
}
```

为什么 kotlinx.serialization 而不是 Moshi / Gson?
- **kotlinx.serialization** 是 Kotlin 官方,与 K2 编译器一体,KSP 走通
- **Moshi** 还行,但要 `@JsonClass`,迁移有成本
- **Gson** 是上一代答案,慢、不支持 Kotlin 默认值,新项目应当避开

---

## 三、API 定义

```kotlin
@Serializable
data class NoteDto(
    val id: Long,
    val title: String,
    val content: String,
    @SerialName("created_at") val createdAt: Long,
    @SerialName("updated_at") val updatedAt: Long,
    val archived: Boolean = false,
)

@Serializable
data class NotesResponse(
    val notes: List<NoteDto>,
    val cursor: String? = null,
)

interface NoteApi {
    @GET("notes")
    suspend fun fetchNotes(
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int = 50,
    ): NotesResponse

    @POST("notes")
    suspend fun createNote(@Body body: NoteCreateRequest): NoteDto

    @PUT("notes/{id}")
    suspend fun updateNote(@Path("id") id: Long, @Body body: NoteUpdateRequest): NoteDto

    @DELETE("notes/{id}")
    suspend fun deleteNote(@Path("id") id: Long)
}

@Serializable
data class NoteCreateRequest(val title: String, val content: String)

@Serializable
data class NoteUpdateRequest(val title: String? = null, val content: String? = null)
```

**几个关键认识**:

1. **DTO 与 Entity / Domain 分离**——`NoteDto` 是网络格式,`NoteEntity` 是数据库格式,`Note` 是业务对象。三者类似但**永远不要合并**。
2. **`suspend fun` 直接返回值**——Retrofit 2.6+ 原生支持。不用 `Call<T>` / `Single<T>` / `Response<T>`(除非要拿 HTTP 元信息)。
3. **`@SerialName`** 处理"JSON snake_case ↔ Kotlin camelCase"。
4. **可空字段给默认值**——`cursor: String? = null` 让旧版本 server 漏发字段也能解析。

---

## 四、OkHttp 配置

```kotlin
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides @Singleton
    fun provideOkHttpClient(): OkHttpClient {
        val logging = HttpLoggingInterceptor().apply {
            level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BODY else HttpLoggingInterceptor.Level.NONE
        }
        return OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .addInterceptor(logging)
            .addInterceptor(AuthInterceptor())     // 自定义鉴权
            .build()
    }

    @Provides @Singleton
    fun provideJson(): Json = Json {
        ignoreUnknownKeys = true       // server 加字段时客户端不挂
        coerceInputValues = true       // null/类型不符时用默认值
        explicitNulls = false          // 不显式写 null 字段
    }

    @Provides @Singleton
    fun provideRetrofit(client: OkHttpClient, json: Json): Retrofit = Retrofit.Builder()
        .baseUrl("https://api.notedx.com/v1/")
        .client(client)
        .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
        .build()

    @Provides @Singleton
    fun provideNoteApi(retrofit: Retrofit): NoteApi = retrofit.create(NoteApi::class.java)
}
```

**`Json { ignoreUnknownKeys = true }`** 几乎必备——服务端加新字段不应该让旧客户端崩。

**`AuthInterceptor`**:

```kotlin
class AuthInterceptor @Inject constructor(
    private val tokenProvider: AuthTokenProvider,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = runBlocking { tokenProvider.currentToken() }   // 同步取(在 OkHttp 线程)
        val request = if (token != null) {
            chain.request().newBuilder()
                .addHeader("Authorization", "Bearer $token")
                .build()
        } else chain.request()
        return chain.proceed(request)
    }
}
```

注意 `runBlocking`——在 Interceptor 里只能这样,因为 OkHttp 不是 suspend 上下文。OkHttp 把 Interceptor 跑在工作线程,所以 `runBlocking` 不影响主线程,但要保证 `tokenProvider.currentToken()` 快(从 DataStore 取就是几毫秒)。

---

## 五、Repository:协调远端与本地

```kotlin
interface NoteRepository {
    fun observeAll(): Flow<List<Note>>
    fun observeOne(id: Long): Flow<Note?>
    suspend fun refresh(): Result<Unit>
    suspend fun save(note: Note): Long
    suspend fun delete(id: Long)
}

class NoteRepositoryImpl @Inject constructor(
    private val dao: NoteDao,
    private val api: NoteApi,
) : NoteRepository {

    override fun observeAll(): Flow<List<Note>> = dao.observeAll()
        .map { entities -> entities.map { it.toDomain() } }

    override fun observeOne(id: Long): Flow<Note?> = dao.observeOne(id)
        .map { it?.toDomain() }

    override suspend fun refresh(): Result<Unit> = runCatching {
        val response = api.fetchNotes()
        dao.upsertAll(response.notes.map { it.toEntity() })
    }

    override suspend fun save(note: Note): Long {
        // 1. 先写本地(乐观更新),UI 立即看到
        val localId = dao.upsert(note.toEntity())
        // 2. 异步同步到远端
        try {
            if (note.id == 0L) {
                val remote = api.createNote(NoteCreateRequest(note.title, note.content))
                // 用远端返回的真实 id 更新本地
                dao.upsert(remote.toEntity())
            } else {
                api.updateNote(note.id, NoteUpdateRequest(note.title, note.content))
            }
        } catch (e: Exception) {
            // 远端失败:可选择标记为 pending 后台重试,或回滚本地
            // 16 篇 WorkManager 展开
        }
        return localId
    }

    override suspend fun delete(id: Long) {
        dao.delete(id)
        runCatching { api.deleteNote(id) }    // 远端失败先不管,后台重试
    }
}
```

**几个心智**:

1. **UI 永远读 `observeAll()`**(本地 Room Flow)——这是 SSoT
2. **`refresh()` 写本地**,UI 自动通过 Flow 看到更新——不用手动通知 UI
3. **`save()` 乐观更新**——先写本地立即响应 UI,再异步同步远端
4. **远端失败不立即崩**——记录待同步状态,后台 Worker 重试(16 篇)

---

## 六、Mapper 集中管理

```kotlin
// data/mapper/NoteMapper.kt
fun NoteEntity.toDomain() = Note(id, title, content, createdAt, updatedAt, archived)
fun Note.toEntity() = NoteEntity(id, title, content, createdAt, updatedAt, archived)
fun NoteDto.toEntity() = NoteEntity(id, title, content, createdAt, updatedAt, archived)
fun NoteDto.toDomain() = Note(id, title, content, createdAt, updatedAt, archived)
```

把所有 mapper 放在一个文件,方便修改。**不要把 mapper 写成 Entity / DTO 的成员**——这会让数据层互相依赖,破坏分层。

---

## 七、ViewModel 用 Repository

```kotlin
@HiltViewModel
class HomeViewModel @Inject constructor(
    private val noteRepository: NoteRepository,
) : ViewModel() {

    private val _isRefreshing = MutableStateFlow(false)
    private val _errorMessage = MutableStateFlow<String?>(null)

    val uiState: StateFlow<HomeUiState> = combine(
        noteRepository.observeAll(),
        _isRefreshing,
        _errorMessage,
    ) { notes, isRefreshing, error ->
        HomeUiState(
            listState = when {
                notes.isEmpty() && !isRefreshing -> NoteListState.Empty
                else -> NoteListState.Content(notes.map { it.toCard() }.toImmutableList())
            },
            isRefreshing = isRefreshing,
            errorMessage = error,
        )
    }.stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5000),
        HomeUiState(listState = NoteListState.Loading),
    )

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _isRefreshing.value = true
            noteRepository.refresh()
                .onFailure { _errorMessage.value = it.message ?: "刷新失败" }
            _isRefreshing.value = false
        }
    }

    fun dismissError() { _errorMessage.value = null }
}
```

**心智**:
- `noteRepository.observeAll()` 是数据源(SSoT),`_isRefreshing` 和 `_errorMessage` 是临时 UI 状态
- `combine` 把多个 Flow 合并成一个 UiState
- `refresh()` 不直接更新 UiState——它写 Room,UI 通过 Flow 自动看到

---

## 八、Compose 屏幕

```kotlin
@Composable
fun HomeRoute(
    onNoteClick: (Long) -> Unit,
    vm: HomeViewModel = hiltViewModel(),
) {
    val state by vm.uiState.collectAsStateWithLifecycle()
    HomeScreen(
        state = state,
        onRefresh = vm::refresh,
        onNoteClick = onNoteClick,
        onDismissError = vm::dismissError,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun HomeScreen(
    state: HomeUiState,
    onRefresh: () -> Unit,
    onNoteClick: (Long) -> Unit,
    onDismissError: () -> Unit,
) {
    val pullState = rememberPullToRefreshState()
    LaunchedEffect(pullState.isRefreshing) {
        if (pullState.isRefreshing) {
            onRefresh()
        }
    }
    LaunchedEffect(state.isRefreshing) {
        if (!state.isRefreshing) pullState.endRefresh()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .nestedScroll(pullState.nestedScrollConnection),
    ) {
        when (val s = state.listState) {
            NoteListState.Loading -> CircularProgressIndicator(
                modifier = Modifier.align(Alignment.Center)
            )
            NoteListState.Empty -> EmptyView(modifier = Modifier.align(Alignment.Center))
            is NoteListState.Content -> LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(s.notes, key = { it.id }) { card ->
                    NoteRow(card = card, onClick = { onNoteClick(card.id) })
                }
            }
        }

        PullToRefreshContainer(
            state = pullState,
            modifier = Modifier.align(Alignment.TopCenter),
        )

        state.errorMessage?.let { msg ->
            Snackbar(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(16.dp),
                action = {
                    TextButton(onClick = onDismissError) { Text("关闭") }
                },
            ) { Text(msg) }
        }
    }
}
```

---

## 九、错误处理:在哪一层捕获

错误能在四层捕获:OkHttp / Repository / ViewModel / UI。**默认在 Repository 层**:

```kotlin
override suspend fun refresh(): Result<Unit> = runCatching {
    api.fetchNotes()
}.mapCatching { response ->
    dao.upsertAll(response.notes.map { it.toEntity() })
}.recoverCatching { e ->
    when (e) {
        is HttpException -> when (e.code()) {
            401 -> throw AuthRequiredException()
            in 500..599 -> throw ServerException()
            else -> throw UnknownNetworkException(e)
        }
        is IOException -> throw OfflineException()
        else -> throw e
    }
}
```

`HttpException` / `IOException` 是 Retrofit / OkHttp 抛的"技术异常"。Repository 应当转成**业务异常**(`OfflineException` / `ServerException` / `AuthRequiredException`),ViewModel 拿到就知道怎么向 UI 展示。

不要把 HttpException 直接给 UI——`HttpException(401)` 让 UI 自己判断状态码是"业务逻辑漏出技术细节",分层就废了。

---

## 十、缓存策略:OkHttp Cache vs Room Cache

OkHttp 自带磁盘缓存(`Cache(file, size)`)。需要它吗?**通常不要**。

为什么:OkHttp Cache 基于 HTTP 缓存语义(`Cache-Control` / `ETag`),响应原样保存。**这件事 Room 已经做了,而且 Room 是结构化的**——可以查询、可以索引、可以变换。

Room 当离线缓存的好处:

- 客户端有完整的查询能力(按时间排序、按标签筛选)
- 离线时仍能正常显示
- 不依赖 server 的缓存头配置

**OkHttp Cache 只在以下少数场景配**:

- 静态资源(图片、字体、CDN 下发)——但图片通常用 Coil/Glide,它们有自己缓存
- 完全只读的 API,数据完全不变

NotedX 不开 OkHttp Cache,所有数据走 Room。

---

## 十一、网络状态:简单的"是否有网"

```kotlin
@Singleton
class NetworkMonitor @Inject constructor(@ApplicationContext ctx: Context) {

    val isOnline: Flow<Boolean> = callbackFlow {
        val cm = ctx.getSystemService<ConnectivityManager>()!!
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) { trySend(true) }
            override fun onLost(network: Network) { trySend(false) }
        }
        cm.registerDefaultNetworkCallback(callback)
        trySend(cm.activeNetwork != null)         // 初始值
        awaitClose { cm.unregisterNetworkCallback(callback) }
    }.distinctUntilChanged()
}
```

ViewModel 订阅,显示"无网络"提示。**不要用它阻止网络调用**——OkHttp 自己会失败重试,提示 UI 即可。

---

## 十二、NotedX 闭环完成

到这一篇为止,NotedX 已经具备:

- **UI**:Compose + Material 3,单 Activity + Navigation 类型安全路由
- **架构**:ViewModel + UDF + UiState + sealed 状态
- **存储**:Room(结构化数据)+ DataStore(用户偏好)
- **网络**:Retrofit + OkHttp + kotlinx.serialization
- **依赖**:Hilt 全栈注入
- **数据流**:网络 → Room → Flow → UiState → UI 单向

**一个完整的、能联网能存储能离线响应的 App**。剩下的篇(15-22)是给它加系统能力(权限 / 后台 / 通知 / 相机)、上架(签名 / 性能 / 测试),都是这个底座的扩展。

---

## 十三、踩坑

**坑 1:UI 直接调 Repository / API**。`Composable` 里 `val notes = repo.fetchNotes()`——破坏所有分层。Composable 只通过 ViewModel 访问数据。

**坑 2:UI 接收 DTO 类型**。`Composable(dto: NoteDto)` ——把网络层细节漏到 UI。UI 永远只看 Domain / UI Model。

**坑 3:`refresh()` 直接 emit 到 StateFlow**。
```kotlin
fun refresh() = viewModelScope.launch {
    val notes = api.fetchNotes()
    _state.update { it.copy(notes = notes) }    // ❌ 没经过 Room
}
```
绕开 Room → 另一个屏幕看到的还是旧数据 → 状态不一致。**永远先写 Room,UI 通过 Flow 看到**。

**坑 4:`runBlocking` 包 suspend fun**。生产代码出现 `runBlocking { api.x() }` 是 ANR 风险。除了 OkHttp Interceptor 这种"必须同步"的边界,其他场景都用 `viewModelScope.launch { }`。

**坑 5:网络异常没分类**。catch HttpException 然后向 UI 直接展示英文 `Bad Request`——用户懵。**Repository 层把异常翻译成业务语义**,UI 拿到能直接显示中文。

**坑 6:OkHttp `HttpLoggingInterceptor.Level.BODY` 上 release**。生产 release 打全量 body 日志泄漏用户数据,且影响性能。**永远基于 `BuildConfig.DEBUG` 切换**。

**坑 7:Retrofit 接口写 `Call<T>` 而不是 `suspend fun`**。这是 RxJava 时代的旧模型,新代码应当 `suspend fun T`,直接拿值。

**坑 8:`baseUrl` 不以 `/` 结尾**。Retrofit 要求 baseUrl 必须以 `/` 结尾,否则会抛 IllegalArgumentException。这是最常见的"第一次跑就崩"原因。

**坑 9:`@Query` 用 nullable 但 server 不接受 `null` 参数**。Retrofit 默认会把 `null` Query 参数省略,所以这种通常没事;但如果 server 期望某个参数存在(即便为空),需要传 `""` 而非 `null`。

**坑 10:多次 `refresh()` 并发**。用户连续下拉,触发多次 refresh,网络请求叠加。Repository 内部用 `Mutex` 串行:
```kotlin
private val refreshMutex = Mutex()
override suspend fun refresh() = refreshMutex.withLock { ... }
```

---

下一篇 `15-权限模型与运行时申请.md`,讲 Android 权限系统:安装时权限 vs 运行时权限、危险权限分组、用户拒绝后的引导、Compose 里申请权限的标准写法(`rememberLauncherForActivityResult`)。这是后面几篇相机 / 通知 / 后台都要先过的关。
