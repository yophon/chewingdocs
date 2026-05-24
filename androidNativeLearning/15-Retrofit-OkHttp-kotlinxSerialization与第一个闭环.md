# 15-Retrofit + OkHttp + kotlinx.serialization 与第一个闭环

> 一句话导读:网络层最难的不是发请求,而是"请求失败、token 过期、设备离线、用户刷新太快"四件事同时发生时,UI 仍然能给出确定的状态;Retrofit + OkHttp + kotlinx.serialization 把这条路径压成三层注解 + 两个 Interceptor + 一个 Repository,刚好把第 11-14 篇都连起来。

NotedX 走到这一篇,已经有 `ViewModel` 暴露 `StateFlow<UiState>`、`NavHost` 把屏幕串成单 Activity 路由、`Hilt` 把图建好、`Room` 接住本地缓存、`DataStore` 装用户偏好。但目前所有数据都是测试假数据,没有真正连接服务器。这一篇要把网络层接进来,完成"登录 → 拿 token → 拉笔记列表 → 看详情 → 离线缓存 → 回到列表数据已就位"的完整闭环——也就是第三层(11-15 篇)的收尾。

后端工程师对 HTTP 客户端轻车熟路。`axios` / `fetch` / `OkHttp` / `WebClient` 都是同一套心智:URL、方法、headers、序列化、超时、拦截器、连接池。Android 这边用 Retrofit + OkHttp + kotlinx.serialization 三件套,差异主要在三处:**序列化走 KSP 编译期生成,反射零开销**;**所有调用是 `suspend` 函数,跟 Coroutine 取消传播挂钩**;**Cache-Control 配 OkHttp 持久缓存做"离线优先"非常顺手**。

## 1. 机制定位

网络层在 Android 工程里要解决六件事,缺一不可:

1. **方法与 URL 的声明式描述**:`POST /sessions` 带 `{email, password}`,返回 `{token, user}`,这条契约不应该靠字符串拼接。
2. **序列化与反序列化**:JSON ↔ Kotlin data class,要类型安全、要忽略未知字段、要处理可空。
3. **拦截器栈**:统一加 header(Authorization、User-Agent)、统一记日志、统一刷 token、统一兜底重试。
4. **缓存**:磁盘 HTTP 缓存(`Cache-Control: max-age`)+ 应用层数据缓存(Room)。两层缓存的语义不同。
5. **错误模型**:HTTP 4xx/5xx、网络断开、TLS 握手失败、JSON 解析失败,业务层只该看到 `Result.success(...)` 或 `Result.failure(...)`,不必感知 OkHttp 的 `IOException`。
6. **生命周期挂钩**:用户离开屏幕,请求自动取消,不浪费流量;ViewModel `onCleared` 时所有协程死亡,Retrofit call 也得跟着断。

每一件事都有它的旧时代解法和现代解法:

| 问题 | 旧时代 | 现代 |
| --- | --- | --- |
| 序列化 | `Gson` + 反射 | `kotlinx.serialization` + KSP 编译期 |
| 异步 | `Call.enqueue(Callback)` 回调 | `suspend fun` + Coroutine |
| 错误模型 | `Response<T>` + 手工 if | `Result<T>` + `runCatching` |
| 取消 | 手动 `call.cancel()` | `viewModelScope` 取消传播 |
| Token 刷新 | 自己写 Counter + 双 token Lock | OkHttp `Authenticator` |
| 离线 | 业务层 `if (online) ...` | OkHttp Cache + Room SSOT |

本系列锁定现代路径。**绝不**用 Gson(反射、KAPT、对可空字段不准、字段不在 JSON 时给 null 而不是默认值);**绝不**用 RxJava(本系列 Coroutine 一等公民);**绝不**用 Moshi 旧 reflective adapter(性能与 codegen 一致性都不如 kotlinx.serialization)。

kotlinx.serialization 1.7+ 是 Kotlin 团队亲手做的序列化框架,1.x 的 `@Serializable` 走 Kotlin Compiler Plugin 编译期生成 `KSerializer<T>`,运行期完全没有反射;Retrofit 2.11+ 内置 `kotlinx.serialization` Converter(`retrofit2-kotlinx-serialization-converter`)。三家都来自一线维护组,生命周期一致,这是 2025+ 的稳态组合。

## 2. Android 心智

### Retrofit + OkHttp 分层

Retrofit 自身只做三件事:**方法注解 → Call 工厂**(`@GET("notes")` 加在 `suspend fun listNotes()` 上,运行期动态代理拦截调用);**参数注解 → HTTP 字段**(`@Path` 路径、`@Query` 查询、`@Body` 请求体、`@Header` 头);**Converter → 字节流互转**(`retrofit2-kotlinx-serialization-converter` 桥接 KSerializer)。实际传输由 **OkHttp** 负责——连接池、HTTP/2、TLS、Cache、Interceptor、Authenticator 都是 OkHttp 在干活。

OkHttp 给了两个钩子,新人常分不清:**Interceptor** 每个请求 / 响应都过一遍,可读、可改、可短路(返回缓存),分 `addInterceptor`(应用层)和 `addNetworkInterceptor`(网络层,看真实包含重定向的网络包);**Authenticator** 只在收到 401 / 407 时被调用,语义是 RFC 7235 `WWW-Authenticate` challenge response。**Token 刷新走 Authenticator 比走 Interceptor 更正确**——Interceptor 不知道 401 一定是 token 过期。

典型链路:`viewModelScope.launch → Repository.refresh() → Retrofit → OkHttpClient → [AuthInterceptor → LoggingInterceptor → Cache → Connection (TCP+TLS+HTTP/2)] → Response → JSON → Kotlin`。401 在最外层 Interceptor 之前就被 Authenticator 抓住,刷 token 后重发,业务层只看到"成功"或"刷新失败"。

### Cache-Control 与 Room 是两层缓存

新人常混:HTTP cache 缓存的是**字节流的具体响应**(status code / headers / body),用 `Cache-Control: max-age=300` 控制;Room 缓存的是**业务实体**,可由网络结果回填、也可由本地编辑产生。两者职责完全不同——HTTP cache 适合"无认证的公共资源"或"短时间内重复请求同一 URL",Room 适合"用户私有数据,要离线读"。合在一起的强项是**离线优先**:Compose 立即从 Room 拿上次缓存,后台 `refresh()` 走 OkHttp,新数据写回 Room,Compose 跟着 emit 一次刷新。用户看到的是"立刻看见 + 偷偷更新",工程师写的是"两条不重叠的代码路径"。

### `Result<T>` 与协程取消

Kotlin 标准库的 `Result<T>` 是"成功值或异常"的密封类型,Repository 用它当返回类型,业务层 `result.onSuccess { } .onFailure { }`。**但 `Result` 有一条核心规则:不能吞 `CancellationException`**。如果 Repository 写 `runCatching { ... }`,默认会把 `CancellationException` 也包成 `Result.failure`,截断协程取消传播——用户切屏时未完成的请求被错认为"失败",弹个 toast,体验直接降级。正确写法:

```kotlin
suspend inline fun <T> safeCall(crossinline block: suspend () -> T): Result<T> = try {
    Result.success(block())
} catch (ce: CancellationException) { throw ce }   // 取消必须重新抛
catch (e: Throwable) { Result.failure(e) }
```

`runCatching` 至今(1.10+)仍吞 `CancellationException`(YouTrack KT-40198),**写网络层的人必须自己手工 try/catch 区分**。

### kotlinx.serialization 的编译期

`@Serializable` 是 Kotlin Compiler Plugin 在编译期识别的标记,会为 `NoteDto` 生成 `NoteDto.Companion : KSerializer<NoteDto>`。运行期反序列化 Retrofit 用这个 KSerializer,**没有反射、没有 Java stub、没有 KAPT**。`@SerialName` 映射 JSON 字段名 → Kotlin 属性名;有默认值的字段在 JSON 不存在时走默认值,不报错——这点比 Gson 干净。

## 3. 工程实现

### 步骤 1:Json 与 Retrofit 模块

第 13 篇已经有 `NetworkModule` 的骨架,这里把它完整化。文件位置 `app/src/main/java/com/example/notedx/di/NetworkModule.kt`:

```kotlin
package com.example.notedx.di

import com.example.notedx.BuildConfig
import com.example.notedx.data.remote.AuthInterceptor
import com.example.notedx.data.remote.NotedApi
import com.example.notedx.data.remote.SessionAuthenticator
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import android.content.Context
import kotlinx.serialization.json.Json
import okhttp3.Cache
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    private const val BASE_URL = "https://api.notedx.example/"

    @Provides @Singleton
    fun provideJson(): Json = Json {
        ignoreUnknownKeys = true       // 服务端加字段不让老客户端崩
        explicitNulls = false          // null 字段不发送,瘦请求体
        encodeDefaults = true
        coerceInputValues = true       // null + 有默认值 + 非空类型 → 走默认值
    }

    @Provides @Singleton
    fun provideCache(@ApplicationContext ctx: Context): Cache =
        Cache(directory = ctx.cacheDir.resolve("http_cache"), maxSize = 10L * 1024 * 1024)

    @Provides @Singleton
    fun provideOkHttpClient(
        cache: Cache, auth: AuthInterceptor, authenticator: SessionAuthenticator,
    ): OkHttpClient = OkHttpClient.Builder()
        .cache(cache)
        .addInterceptor(auth)
        .addInterceptor(HttpLoggingInterceptor().apply {
            level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BODY
                    else HttpLoggingInterceptor.Level.NONE
        })
        .authenticator(authenticator)
        .callTimeout(30, TimeUnit.SECONDS)      // 整次调用上限,兜底
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    @Provides @Singleton
    fun provideRetrofit(client: OkHttpClient, json: Json): Retrofit =
        Retrofit.Builder()
            .baseUrl(BASE_URL)
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()

    @Provides @Singleton
    fun provideNotedApi(retrofit: Retrofit): NotedApi = retrofit.create(NotedApi::class.java)
}
```

几个工程决策:`cache` 走 `cacheDir`(系统在存储紧张时可回收;不要写 `filesDir` 那是 user data 区会被全量备份);三套 timeout 中 `callTimeout` 是 OkHttp 3.12+ 的"上限"语义,无论建连慢还是响应慢都兜得住;Logging level 跟 BuildConfig 走,release 包不打 BODY 既泄漏敏感数据又烧 logcat。

### 步骤 2:API 接口声明

文件位置 `app/src/main/java/com/example/notedx/data/remote/NotedApi.kt`:

```kotlin
package com.example.notedx.data.remote

import retrofit2.http.*

interface NotedApi {
    @POST("sessions")
    suspend fun login(@Body credential: LoginRequest): SessionResponse

    @POST("sessions/refresh")
    suspend fun refresh(@Body refreshToken: RefreshRequest): SessionResponse

    @GET("notes")
    suspend fun listNotes(
        @Query("page") page: Int = 1,
        @Query("size") size: Int = 50,
        @Header("Cache-Control") cache: String = "max-age=60",
    ): List<NoteDto>

    @GET("notes/{id}")
    suspend fun fetchNote(@Path("id") id: String): NoteDto

    @POST("notes")
    suspend fun createNote(@Body note: NoteDto): NoteDto
}
```

接口本身**没有任何业务依赖**,纯 HTTP 描述。Retrofit 运行期用 `Proxy.newProxyInstance` 生成实现,`suspend fun` 由 `retrofit2.KotlinExtensions.await` 把回调转协程。

DTO 单独放,文件位置 `app/src/main/java/com/example/notedx/data/remote/Dto.kt`:

```kotlin
package com.example.notedx.data.remote

import com.example.notedx.data.local.NoteEntity
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable data class LoginRequest(val email: String, val password: String)
@Serializable data class RefreshRequest(@SerialName("refresh_token") val refreshToken: String)
@Serializable data class UserDto(val id: String, val email: String, val name: String)

@Serializable data class SessionResponse(
    @SerialName("access_token") val accessToken: String,
    @SerialName("refresh_token") val refreshToken: String,
    @SerialName("expires_at") val expiresAt: Long,
    val user: UserDto,
)

@Serializable data class NoteDto(
    val id: String, val title: String, val body: String,
    @SerialName("updated_at") val updatedAt: Long,
    val tag: String? = null,
)

fun NoteDto.toEntity() = NoteEntity(id, title, body, tag, updatedAt, archived = false)
fun NoteEntity.toDto() = NoteDto(id, title, body, updatedAt, tag)
```

DTO 与 Entity 物理分开。**永远不要让网络 DTO 直接进 Room、也不要让 Entity 直接出网络**——两者变化频率和职责完全不同,合在一起的代价是"接口加字段也要改数据库",反过来也成立。

### 步骤 3:Token 管理与拦截器

文件位置 `app/src/main/java/com/example/notedx/data/remote/SessionStore.kt`:

```kotlin
package com.example.notedx.data.remote

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.sessionStore by preferencesDataStore(name = "session")

@Singleton
class SessionStore @Inject constructor(private val ctx: Context) {
    private object K {
        val ACCESS = stringPreferencesKey("access_token")
        val REFRESH = stringPreferencesKey("refresh_token")
        val EXPIRES = longPreferencesKey("expires_at")
    }

    suspend fun current(): Session? = ctx.sessionStore.data.map { p ->
        val a = p[K.ACCESS]; val r = p[K.REFRESH]; val e = p[K.EXPIRES]
        if (a != null && r != null && e != null) Session(a, r, e) else null
    }.first()

    suspend fun save(s: Session) = ctx.sessionStore.edit {
        it[K.ACCESS] = s.accessToken; it[K.REFRESH] = s.refreshToken; it[K.EXPIRES] = s.expiresAt
    }

    suspend fun clear() = ctx.sessionStore.edit { it.clear() }
}

data class Session(val accessToken: String, val refreshToken: String, val expiresAt: Long)
```

这里 token 用了明文 Preferences DataStore,**生产里应该走 Tink Aead 加密**——key 由 AndroidKeyStore 派生,详见 [[securityLearning]]。第 28 / 29 篇展开,这里先保留明文聚焦"网络层闭环"主题。

`AuthInterceptor` 在每个非登录类请求上挂 `Authorization: Bearer ...`:

```kotlin
class AuthInterceptor @Inject constructor(private val store: SessionStore) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val req = chain.request()
        if (req.url.encodedPath in SKIP) return chain.proceed(req)
        // OkHttp Interceptor 是同步 API,这里只能 runBlocking 一次拿 token;
        // 跑在 OkHttp dispatcher 线程,非主线程,且 DataStore 读是内存命中
        val token = runBlocking { store.current()?.accessToken } ?: return chain.proceed(req)
        return chain.proceed(req.newBuilder().header("Authorization", "Bearer $token").build())
    }
    companion object { private val SKIP = setOf("/sessions", "/sessions/refresh") }
}
```

`SessionAuthenticator` 处理 401:

```kotlin
class SessionAuthenticator @Inject constructor(
    private val store: SessionStore,
    // Provider 打破"NotedApi 依赖 OkHttp 依赖 Authenticator 依赖 NotedApi"的循环
    private val api: Provider<NotedApi>,
) : Authenticator {

    override fun authenticate(route: Route?, response: Response): Request? {
        if (response.priorResponse != null) return null              // 重试过一次还 401,放弃
        val current = runBlocking { store.current() } ?: return null
        val refreshed = runBlocking {
            runCatching { api.get().refresh(RefreshRequest(current.refreshToken)) }.getOrNull()
        } ?: run {
            runBlocking { store.clear() }
            return null                                              // 刷新失败,业务层会看到 401 跳登录
        }
        runBlocking { store.save(Session(refreshed.accessToken, refreshed.refreshToken, refreshed.expiresAt)) }
        return response.request.newBuilder()
            .header("Authorization", "Bearer ${refreshed.accessToken}")
            .build()
    }
}
```

`Provider<NotedApi>` 是 §13 坑 4 提到的 escape hatch:Hilt 延迟到第一次 `.get()` 才解析,此时 NotedApi 已 build 完成。`runBlocking` 在 Interceptor / Authenticator 里是必要之恶——两者都是阻塞 API,跑在 OkHttp dispatcher 线程而非主线程,**全应用其余地方不应再出现 `runBlocking`**。

### 步骤 4:Repository 把所有东西拼起来

文件位置 `app/src/main/java/com/example/notedx/data/NoteRepository.kt`:

```kotlin
package com.example.notedx.data

import com.example.notedx.data.local.NoteDao
import com.example.notedx.data.remote.NotedApi
import com.example.notedx.data.remote.toEntity
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

interface NoteRepository {
    fun observeNotes(): Flow<List<Note>>
    suspend fun refresh(): Result<Unit>
    suspend fun fetchOne(id: String): Result<Note>
}

@Singleton
class DefaultNoteRepository @Inject constructor(
    private val api: NotedApi,
    private val dao: NoteDao,
) : NoteRepository {

    override fun observeNotes(): Flow<List<Note>> =
        dao.observeActive().map { list -> list.map { it.toDomain() } }

    override suspend fun refresh(): Result<Unit> = safeCall {
        val remote = withContext(Dispatchers.IO) { api.listNotes() }
        dao.replaceAll(remote.map { it.toEntity() })
    }

    override suspend fun fetchOne(id: String): Result<Note> = safeCall {
        val cached = dao.findById(id)
        if (cached != null) return@safeCall cached.toDomain()
        val remote = withContext(Dispatchers.IO) { api.fetchNote(id) }
        dao.upsert(remote.toEntity())
        remote.toEntity().toDomain()
    }
}

private suspend inline fun <T> safeCall(crossinline block: suspend () -> T): Result<T> =
    try { Result.success(block()) }
    catch (ce: CancellationException) { throw ce }
    catch (t: Throwable) { Result.failure(t) }
```

关键设计:

- **单一可信来源(SSOT)是 Room**。`observeNotes()` 永远返回 `dao.observeActive()` 的 Flow,UI 订阅的就是它。`refresh()` 是后台 side effect——拿网络数据写回 Room,Room 自动 emit,UI 自动更新。**业务层和 UI 层永远不直接调网络**。
- **`safeCall` 显式 try / catch CancellationException**,避免 §2 提到的取消传播被截断。
- **`withContext(Dispatchers.IO)` 包网络调用**:Retrofit 自己已经走 OkHttp 的 dispatcher 线程,严格说 `withContext` 不必要,但加上明确语义,让代码不依赖"Retrofit 内部线程模型"这个隐含约定。

### 步骤 5:ViewModel + Compose 闭环

文件位置 `app/src/main/java/com/example/notedx/feature/notes/NotesViewModel.kt`:

```kotlin
package com.example.notedx.feature.notes

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.notedx.data.Note
import com.example.notedx.data.NoteRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class NotesViewModel @Inject constructor(
    private val repo: NoteRepository,
) : ViewModel() {

    private val _isRefreshing = MutableStateFlow(false)
    private val _error = MutableStateFlow<String?>(null)

    val uiState: StateFlow<NotesUiState> = combine(
        repo.observeNotes(), _isRefreshing, _error,
    ) { notes, refreshing, error ->
        NotesUiState(notes, refreshing, error)
    }.stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(5_000),
        NotesUiState(emptyList(), false, null),
    )

    init { refresh() }

    fun refresh() = viewModelScope.launch {
        _isRefreshing.value = true; _error.value = null
        repo.refresh().onFailure { _error.value = it.userMessage() }
        _isRefreshing.value = false
    }

    fun ackError() { _error.value = null }
}

data class NotesUiState(val notes: List<Note>, val isRefreshing: Boolean, val error: String?)

private fun Throwable.userMessage(): String = when (this) {
    is java.io.IOException -> "网络不可用"
    is retrofit2.HttpException -> when (code()) {
        401 -> "登录已过期,请重新登录"
        in 500..599 -> "服务器开小差,稍后再试"
        else -> "请求失败 ($code)"
    }
    else -> "未知错误:${message ?: javaClass.simpleName}"
}
```

Compose 屏幕(简化):

```kotlin
@Composable
fun NotesScreen(vm: NotesViewModel = hiltViewModel(), onOpenNote: (String) -> Unit) {
    val state by vm.uiState.collectAsStateWithLifecycle()
    PullToRefreshBox(state.isRefreshing, vm::refresh, rememberPullToRefreshState()) {
        LazyColumn(Modifier.fillMaxSize()) {
            items(state.notes, key = { it.id }) { NoteCard(it, onClick = { onOpenNote(it.id) }) }
        }
    }
    state.error?.let { msg ->
        LaunchedEffect(msg) { /* SnackbarHostState 展示 */ vm.ackError() }
    }
}
```

完整闭环跑起来的行为:**冷启动**触发 `init { refresh() }`,UI 立刻显示空列表 + `isRefreshing = true`;**网络回来**写回 Room,Flow 自动 emit,`combine` 重算 UiState;**离线启动**网络失败但 `observeNotes()` 仍从 Room 拿到上次缓存,UI 显示缓存 + 错误 toast;**进详情**先看 Room cache,没命中再走网络;**杀进程重启**Room 数据仍在,冷启动看到的就是上次的列表 + 后台拉新。整条链不需要任何"if online"判断,不需要 RxJava 的 `merge` / `switchMap`,不需要手动写 retry。**每个组件只做一件事**,组合起来就是离线优先。

## 4. 调参和验收

### Timeout 与 Cache-Control

| 参数 | 推荐 | 理由 |
| --- | --- | --- |
| `connectTimeout` | 10s | 移动网络握手慢;首次 TLS 1.3 几百毫秒 |
| `readTimeout` | 15s | 单个 HTTP 包响应;超过这个值用户会觉得"卡" |
| `callTimeout` | 30s | 整次调用上限,弱网下别调更大——用户进度条转 30 秒比 toast"网络不可用"更差 |

`@Header("Cache-Control") cache: String = "max-age=60"` 让 OkHttp 在 60 秒内直接命中磁盘缓存,配合服务端响应头 `Cache-Control: public, max-age=60` 体验是"60 秒内重复进列表瞬开"。下拉刷新走 `"no-cache"`(条件请求 `If-Modified-Since` / `If-None-Match`,服务端 304 时仍用缓存)。注意:**OkHttp 缓存对 `Authorization` 默认视为 `private`,只缓存当前用户**;多用户共享 cache 要服务端配合 `Cache-Control: public`。

### 重试策略

**永远不要无脑全局重试**。常见反模式:OkHttp `addInterceptor` 里检测 5xx 就 sleep 后重发——业务层根本不知道重试在发生,UI 看起来"卡了 10 秒突然又好了"。正解:网络层重试只针对**幂等且短暂**的失败(503、connection reset),最多 1 次,backoff < 1 秒;业务层重试由用户触发(下拉刷新、点"重试"按钮);**POST 类写请求绝不自动重试**,可能产生重复订单。最小实现:

```kotlin
class RetryInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val req = chain.request()
        if (req.method != "GET") return chain.proceed(req)
        var attempt = 0
        while (true) {
            val resp = chain.proceed(req)
            if (resp.code !in 500..599 || attempt >= 1) return resp
            resp.close()
            attempt++
            Thread.sleep(300L)
        }
    }
}
```

### kotlinx.serialization 验收

写一个 round-trip 单元测试:

```kotlin
@Test
fun noteDto_roundtrip_preservesFields() {
    val json = Json { ignoreUnknownKeys = true }
    val original = NoteDto("n1", "hello", "world", 1_700_000_000L, "todo")
    val text = json.encodeToString(NoteDto.serializer(), original)
    val back = json.decodeFromString(NoteDto.serializer(), text)
    check(back == original)
}
```

每个 DTO 都加一份。Pull Request 时只看 diff,这种测试能立刻揪出"序号弄错了"、"`@SerialName` 漏了"、"默认值不一致"。

### 验收清单

- 安装新 APK,点登录,断网后再杀进程重启,**列表仍能看到上次缓存的笔记**,顶部显示"网络不可用"。
- 网络恢复,下拉刷新,列表更新,toast 消失。
- 故意把 access token 改坏(在 DataStore 里),触发任意 GET,确认 OkHttp 走 401 → Authenticator → 刷新 → 重发,业务层透明。
- 把服务端关停,POST 创建笔记,应在 30 秒内失败而不是无限等待。
- `chuck` 或 `mitmproxy` 拦截一次请求,确认 `Authorization: Bearer ...` header 存在。
- `cat app/build/generated/ksp/debug/.../NoteDto$$serializer.kt`(若有)或 `javap -c NoteDto$$serializer`,确认 KSerializer 是编译期生成,不是运行期反射。

## 5. 踩坑

### 坑 1:`runCatching` 吞 CancellationException

```kotlin
suspend fun refresh(): Result<Unit> = runCatching {     // 反例
    api.listNotes()
}
```

ViewModel 取消(用户切屏)→ 协程取消 → `api.listNotes()` 抛 `CancellationException` → `runCatching` 把它包成 `Result.failure` → 业务层弹"网络失败"。用户切了一下屏就被骂网络差。

**永远用自己写的 `safeCall`**,显式 `catch (ce: CancellationException) { throw ce }`。

### 坑 2:Gson + kotlinx.serialization 混用

```kotlin
@Serializable
data class NoteDto(val id: String, val title: String)

// 同一份代码里有人用 Gson:
val gson = Gson()
val note = gson.fromJson(text, NoteDto::class.java)
```

Gson 反射不认识 `@Serializable`,但能解析 data class 字段名;kotlinx.serialization 走 `@SerialName`。两套并存的项目里同一个 JSON 用 Gson 和 kotlinx.serialization 解析出的结果可能字段名不一致,排查极难。

**项目里只允许一套 JSON 库**。新代码全走 kotlinx.serialization,删 Gson 和 Moshi 依赖。

### 坑 3:Authenticator 在 Token 失效死循环

```kotlin
override fun authenticate(route: Route?, response: Response): Request? {
    val refreshed = runBlocking { api.refresh(...) }     // 反例:不检查 priorResponse
    // ...
    return response.request.newBuilder().header("Authorization", "Bearer ${refreshed.accessToken}").build()
}
```

如果服务端 refresh 接口也返回 401(refresh token 也过期了),OkHttp 会一直循环:401 → authenticator → refresh 401 → authenticator → ...

**必检 `response.priorResponse`**:不为 null 说明已经重试过,放弃。同时 `runCatching` 包 refresh,失败时 `store.clear()` + 返回 null,让业务层看到 401,导航到登录页。

### 坑 4:OkHttp Cache 与 Room SSOT 双 source 冲突

```kotlin
// 反例:既走 OkHttp Cache 又用 Room
val cached = json.decodeFromString<List<NoteDto>>(httpCachedBody)
val roomList = dao.observeActive().first()
return if (cached.isNotEmpty()) cached else roomList    // 哪个是真相?
```

混合用 OkHttp Cache + Room 作为双 source,UI 看到的数据由谁说了算变成 race condition。**Room 才是 SSOT**——OkHttp Cache 仅用于"短期内重复 GET 不打网络"的优化,不参与业务数据流。`observeNotes()` 永远从 Room 拿。

### 坑 5:Interceptor 复用 chain.proceed / `BASE_URL` 不规范

两条短规则放一起:`chain.proceed` 一次 chain 只能调一次,调两次直接抛 `IllegalStateException`;重试要在外层 `while` 自己组织。Retrofit 的 `baseUrl` 必须以 `/` 结尾,`@GET("notes")` 是追加,`@GET("/notes")` 以 `/` 开头会替换掉 baseUrl 的 path——两条都是启动期就崩,但语义需要记。

### 坑 6:`suspend fun` 接口同时返回 `Response<T>`

```kotlin
@GET("notes")
suspend fun listNotes(): Response<List<NoteDto>>     // 慎用
```

`Response<T>` 强迫业务层处理 `isSuccessful` / `code()` / `errorBody()`。Repository 层用 `Result<T>` 已经把成败抽象掉了,**业务接口直接返回 `List<NoteDto>` 更简洁**——失败时 `HttpException` 自然抛出,被 `safeCall` 抓住。只在需要看 response header(分页 link 头、ETag)时才用 `Response<T>`,这种调用 contained 在 Repository 内部。

### 坑 7:HttpLoggingInterceptor 上生产

`Level.BODY` 把每个请求和响应的 body 全打 logcat。Release 包带这条会**日志泄漏 token / 用户隐私 / 服务端结构**,且日志巨慢。`level = if (BuildConfig.DEBUG) Level.BODY else Level.NONE` 是最低底线;更严做法是整个 `HttpLoggingInterceptor` 都用 `if (BuildConfig.DEBUG)` 包起来,release 包根本不进 lib。

### 坑 8:Authenticator 并发刷新

Authenticator 自身天然被 OkHttp 序列化(同一 host 的失败响应排队进 authenticator),但不能假设跨 host 也安全。两个请求同时 401 时,第二次可能读到的还是旧 token(写未提交),又触发一次 refresh——服务端可能拒。**生产中给 refresh 加 `Mutex`**:

```kotlin
private val refreshMutex = Mutex()

override fun authenticate(...): Request? = runBlocking {
    refreshMutex.withLock {
        val latest = store.current()
        // 别人已经刷过了,直接用最新 token
        if (latest?.accessToken != response.request.header("Authorization")?.removePrefix("Bearer ")) {
            return@withLock response.request.newBuilder()
                .header("Authorization", "Bearer ${latest?.accessToken}").build()
        }
        val refreshed = api.get().refresh(RefreshRequest(latest.refreshToken))
        store.save(Session(refreshed.accessToken, refreshed.refreshToken, refreshed.expiresAt))
        response.request.newBuilder().header("Authorization", "Bearer ${refreshed.accessToken}").build()
    }
}
```

### 坑 9:kotlinx.serialization 的 null / 默认值 / `@Query` null

三条边界容易混:

- `@Query("tag") tag: String?` 为 null 时 Retrofit **直接忽略**这个参数,URL 里不出现 `tag=`。若服务端要求"必须传 tag = 空串拉所有",得显式传 `""`。
- DTO 字段类型是非空 `String`,服务端响应 `"title": null` 时 kotlinx.serialization 默认抛 `MissingFieldException`,即便字段有默认值 `= ""`。**`Json { coerceInputValues = true }` 把"null + 有默认值"自动按默认值走**,生产里强烈建议开。
- 字段在 JSON 完全省略时(不是 null,是没这个 key),只要 Kotlin 端有默认值就用默认值,不需要 `coerceInputValues`。

三条逻辑都体现在 `provideJson()` 的几个 flag 上,启动期检查一遍配置,运行期再不出意外。

### 坑 10:Multipart 上传读全文件到内存

```kotlin
@Multipart
@POST("notes/{id}/attachments")
suspend fun upload(@Path("id") id: String, @Part file: MultipartBody.Part)
```

上传时**不要 `file.readBytes()` 进内存**,会 OOM。要用 `file.asRequestBody(MEDIA_TYPE)` 让 OkHttp stream 读。CameraX 拍的视频经常几十 MB,这条踩一次就够。第 19 篇会回到 CameraX / MediaStore 集成。

## 第三层闭环回顾

到第 15 篇,NotedX 已经具备:

- **第 11 篇**给的 ViewModel + UDF + UiState 套路,网络数据通过 `NotesUiState` 暴露。
- **第 12 篇**给的 Navigation Compose 类型安全路由,`onOpenNote(id)` 跨屏传 id。
- **第 13 篇**给的 Hilt + KSP,所有依赖编译期建图。
- **第 14 篇**给的 Room + DataStore,本地是 SSOT,偏好是 DataStore。
- **第 15 篇**(本篇)的 Retrofit + OkHttp + kotlinx.serialization,网络只回填 Room。

跑起来就是"启动 → 登录 → 列表 → 详情 → 离线缓存"的完整闭环。第四层(16-20)接系统能力(权限、相机、推送、后台)时,会发现"图已经建好,加一个能力只是再加一个 ViewModel / Repository 节点"——这就是第三层在做的事:**把脚手架搭稳,后面所有功能都长在同一根藤上**。

## 手动验证

- [ ] 在线状态下登录,看到笔记列表;杀进程重启,断网,**列表仍然可见**(Room 缓存),顶栏显示"网络不可用"。
- [ ] 进笔记详情,杀进程重启进同一条详情,先看到缓存,后台不应该再发请求(`fetchOne` cache hit 路径)。
- [ ] 手动篡改 DataStore 里的 access token 让它失效,触发一次刷新,用 mitmproxy 看到:`GET /notes` 返回 401 → `POST /sessions/refresh` 200 → `GET /notes` 重试 200,业务层 UI 无感知。
- [ ] refresh token 也过期(把 DataStore 两个 token 都改坏),触发刷新,确认 Authenticator 返回 null,Repository 拿到 401,UI 跳登录页。
- [ ] `./gradlew assembleRelease` 后用 `grep -r "HttpLoggingInterceptor" app/build/intermediates/apk/release/` 找不到任何 BODY 级日志输出。
- [ ] 弱网模拟(`adb shell svc data disable`),`api.listNotes()` 在 30 秒内失败返回 `Result.failure(IOException)`,不出现"无限转圈"。
- [ ] 用 Charles / mitmproxy 抓包,`Authorization: Bearer xxx` header 存在;login / refresh 请求不带这个 header(`AuthInterceptor.skipPaths` 验证)。
- [ ] `./gradlew :app:test` 全部通过,包括每个 DTO 的 round-trip 序列化测试。
