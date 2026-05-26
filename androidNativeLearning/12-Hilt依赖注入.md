# Hilt 依赖注入

> 一句话:**Hilt 在编译期生成一份"谁需要谁、谁负责造谁"的依赖图,运行时按图给每个组件自动装填依赖**。你只写 `@Inject` 标注,生成代码替你写所有 `new`。

---

## 一、为什么 Android 需要 DI

没有 DI 的世界长这样:

```kotlin
class HomeViewModel(
    val noteRepository: NoteRepository = NoteRepository(
        dao = NotedXDatabase.getInstance(ctx).noteDao(),
        api = NotedXApi.create(OkHttpClient.Builder()...),
    ),
) : ViewModel()
```

每个 ViewModel 自己 `new` Repository,Repository 内部 `new` 数据源,数据源内部 `new` 一堆配置——**所有连接关系散落在每个使用方**。改一个底层依赖(换 OkHttp 配置),全项目要搜替换。

DI 把这件事颠倒:**每个类只声明"我需要什么",由一个中心化的"图"决定"怎么给"**。一处定义 OkHttp 配置,所有用 OkHttp 的地方自动拿到同一份。

**Android 上 DI 的标准答案是 Hilt**——Google 维护,基于 Dagger,专门给 Android 生命周期(Application / Activity / ViewModel / Fragment)做了优化。

---

## 二、Hilt 的世界观:三种概念

理解 Hilt 只要三个概念:

1. **`@Inject` 标注**——"我这个类的构造函数应当由 Hilt 来填参数"
2. **`@Module` + `@Provides`**——"这种类型的实例怎么造,我手动告诉你"(用于第三方类,没法标 `@Inject`)
3. **Component / Scope**——"这个实例属于哪个生命周期范围"(Application / ViewModel / Activity)

---

## 三、最小工作链:Application + Activity + ViewModel

**1. Application 标注 `@HiltAndroidApp`** —— Hilt 的入口

```kotlin
@HiltAndroidApp
class NotedXApp : Application()
```

`@HiltAndroidApp` 触发 Hilt 在编译期生成 Application Component(整个进程级的依赖图根)。

**2. Activity 标注 `@AndroidEntryPoint`**

```kotlin
@AndroidEntryPoint
class MainActivity : ComponentActivity()
```

意思:"Hilt 来帮我把所有 `@Inject lateinit var` 字段填上"。Activity 本身不需要构造注入(系统拿不到 Activity 构造函数控制权),所以走字段注入。

**3. ViewModel 标注 `@HiltViewModel`**

```kotlin
@HiltViewModel
class HomeViewModel @Inject constructor(
    private val noteRepository: NoteRepository,
) : ViewModel()
```

Hilt 看到 `@HiltViewModel`,把它登记到 ViewModel 工厂。Composable 里 `hiltViewModel<HomeViewModel>()` 自动拿到注入好依赖的实例。

**4. 业务类标注 `@Inject` 构造函数**

```kotlin
@Singleton
class NoteRepository @Inject constructor(
    private val dao: NoteDao,
    private val api: NoteApi,
) { ... }
```

Hilt 看到 `@Inject constructor`,知道怎么造 NoteRepository——拿到 NoteDao 和 NoteApi 当参数。这两件事它怎么造?递归看它们的 `@Inject constructor` 或者去 Module 找 `@Provides`。

---

## 四、`@Module` + `@Provides`:第三方类的造法

Room 数据库、Retrofit、OkHttp 都不是你写的类,没法给它们加 `@Inject constructor`。这种情况用 `@Module` 显式告诉 Hilt 怎么造:

```kotlin
@Module
@InstallIn(SingletonComponent::class)    // 装到 Application 级别
object NetworkModule {
    
    @Provides
    @Singleton
    fun provideOkHttpClient(): OkHttpClient = OkHttpClient.Builder()
        .addInterceptor(HttpLoggingInterceptor().setLevel(HttpLoggingInterceptor.Level.BASIC))
        .build()
    
    @Provides
    @Singleton
    fun provideRetrofit(okHttpClient: OkHttpClient): Retrofit = Retrofit.Builder()
        .baseUrl("https://api.notedx.com/")
        .client(okHttpClient)
        .addConverterFactory(
            Json { ignoreUnknownKeys = true }
                .asConverterFactory("application/json".toMediaType())
        )
        .build()

    @Provides
    @Singleton
    fun provideNoteApi(retrofit: Retrofit): NoteApi = retrofit.create(NoteApi::class.java)
}
```

读法:
- `@Module`——这是个 DI 配置模块
- `@InstallIn(SingletonComponent::class)`——装到 Application Component(Hilt 的最大 scope)
- `@Provides`——"这个函数返回的实例就是 Hilt 提供 X 类型的方式"
- `@Singleton`——这个 scope 内只造一次(Application 进程内 OkHttp 只一份)

Hilt 看到 `provideRetrofit(okHttpClient: OkHttpClient)`——它知道这个函数需要 OkHttpClient,自动调上面的 `provideOkHttpClient()` 拿到。这就是依赖图的"递归填参"。

---

## 五、Database Module

```kotlin
@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext ctx: Context): NotedXDatabase =
        Room.databaseBuilder(ctx, NotedXDatabase::class.java, "notedx.db")
            .build()

    @Provides
    fun provideNoteDao(db: NotedXDatabase): NoteDao = db.noteDao()
}
```

**`@ApplicationContext`** 是 Hilt 内置的 qualifier——告诉 Hilt 我要 Application Context(不是 Activity Context)。Application Context 寿命跟进程相同,Singleton 对象不该持有 Activity Context(会泄漏)。

---

## 六、Scope:谁的依赖图

Hilt 提供几个 Component,对应 Android 不同生命周期:

| Component | Scope 注解 | 寿命 |
| --- | --- | --- |
| `SingletonComponent` | `@Singleton` | 整个 Application 进程 |
| `ActivityRetainedComponent` | `@ActivityRetainedScoped` | Activity + 配置变化保留 |
| `ViewModelComponent` | `@ViewModelScoped` | ViewModel 寿命 |
| `ActivityComponent` | `@ActivityScoped` | 一次 Activity 创建 |

99% 场景只用 `@Singleton`。其他 scope 是高级用法:`@ViewModelScoped` 用于"在 ViewModel 内多个类共享一个实例,但不要跨 ViewModel"——少见。

**心智**:
- 数据库 / OkHttp / Repository → `@Singleton`(进程内单例)
- 临时 use case / 业务逻辑类 → 不加 scope(每次注入新实例)
- ViewModel → `@HiltViewModel`(自动用 ViewModelComponent)

---

## 七、`@Binds`:接口绑定到实现

Repository 经常是接口 + 实现:

```kotlin
interface NoteRepository {
    fun observeAll(): Flow<List<Note>>
    suspend fun refresh()
}

class NoteRepositoryImpl @Inject constructor(
    private val dao: NoteDao,
    private val api: NoteApi,
) : NoteRepository { ... }
```

Hilt 不知道 `NoteRepository` 该用哪个实现。用 `@Binds` 绑定:

```kotlin
@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {
    @Binds
    @Singleton
    abstract fun bindNoteRepository(impl: NoteRepositoryImpl): NoteRepository
}
```

`@Binds` 比 `@Provides` 高效——Hilt 直接生成 `(NoteRepository) impl`,没有运行时函数调用。**接口绑定永远用 `@Binds`,不用 `@Provides`**。

注意:`@Binds` 的 Module 必须是 `abstract class`,方法必须是 `abstract`。

---

## 八、Qualifier:同一类型多个来源

如果你有两个 `OkHttpClient`(一个走代理、一个不走),Hilt 不知道该注入哪个。自定义 Qualifier:

```kotlin
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class ApiClient

@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class ImageClient

@Provides @Singleton @ApiClient
fun provideApiClient(): OkHttpClient = ...

@Provides @Singleton @ImageClient
fun provideImageClient(): OkHttpClient = ...

class NoteApi @Inject constructor(@ApiClient private val client: OkHttpClient)
class ImageLoader @Inject constructor(@ImageClient private val client: OkHttpClient)
```

Qualifier 也是 Hilt 内置一些:`@ApplicationContext` / `@ActivityContext`。

---

## 九、构造注入 vs 字段注入

```kotlin
// 构造注入(推荐)
class HomeViewModel @Inject constructor(private val repo: NoteRepository) : ViewModel()

// 字段注入(只在 Hilt 控制不了构造的地方用)
@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    @Inject lateinit var analytics: Analytics    // Hilt 在 onCreate 之前填好
}
```

**永远首选构造注入**——它让依赖在编译期可见、不可变、不需要 `lateinit`。字段注入只用于 Activity / Fragment / Service 这种"系统替你 new"的类。

---

## 十、与 Navigation Compose 集成

```kotlin
composable<Route.Detail> {
    val vm: DetailViewModel = hiltViewModel()
    DetailRoute(vm = vm)
}
```

`hiltViewModel()` 是 `androidx.hilt:hilt-navigation-compose` 提供的。它:
1. 用当前 NavBackStackEntry 作为 ViewModelStoreOwner——离开屏幕,ViewModel 销毁
2. 用 Hilt 注入 ViewModel 的构造参数

**默认就用 `hiltViewModel()`,不要用 `viewModel()`**(后者只在非 Hilt 项目用)。

---

## 十一、WorkManager 集成

WorkManager 的 `Worker` 也支持 Hilt:

```kotlin
@HiltWorker
class SyncWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted workerParams: WorkerParameters,
    private val repo: NoteRepository,
) : CoroutineWorker(appContext, workerParams) {
    override suspend fun doWork(): Result {
        return runCatching { repo.refresh() }
            .map { Result.success() }
            .getOrElse { Result.retry() }
    }
}
```

**`@AssistedInject`** 用于"部分参数 Hilt 注入、部分参数 WorkManager 运行时传入"。`@Assisted` 标注的参数由 WorkManager 提供(Context 和 WorkerParameters),其他参数 Hilt 注入。

需要在 `NotedXApp` 配置:

```kotlin
@HiltAndroidApp
class NotedXApp : Application(), Configuration.Provider {
    @Inject lateinit var workerFactory: HiltWorkerFactory
    
    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .build()
}
```

16 篇展开 WorkManager。

---

## 十二、完整 NotedX DI 图

```kotlin
// NotedXApp.kt
@HiltAndroidApp
class NotedXApp : Application()

// MainActivity.kt
@AndroidEntryPoint
class MainActivity : ComponentActivity() { ... }

// data/NoteRepository.kt
interface NoteRepository {
    fun observeAll(): Flow<List<Note>>
    suspend fun refresh()
}

class NoteRepositoryImpl @Inject constructor(
    private val dao: NoteDao,
    private val api: NoteApi,
) : NoteRepository

// di/RepositoryModule.kt
@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {
    @Binds @Singleton
    abstract fun bindNoteRepository(impl: NoteRepositoryImpl): NoteRepository
}

// di/NetworkModule.kt
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {
    @Provides @Singleton
    fun provideOkHttpClient(): OkHttpClient = ...

    @Provides @Singleton
    fun provideRetrofit(client: OkHttpClient): Retrofit = ...

    @Provides @Singleton
    fun provideNoteApi(retrofit: Retrofit): NoteApi = retrofit.create(NoteApi::class.java)
}

// di/DatabaseModule.kt
@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {
    @Provides @Singleton
    fun provideDatabase(@ApplicationContext ctx: Context): NotedXDatabase = Room.databaseBuilder(...).build()

    @Provides
    fun provideNoteDao(db: NotedXDatabase): NoteDao = db.noteDao()
}

// ui/home/HomeViewModel.kt
@HiltViewModel
class HomeViewModel @Inject constructor(
    private val noteRepository: NoteRepository,
) : ViewModel() { ... }
```

Application 启动时,Hilt 看到整张图,生成所有工厂代码。任何一个 ViewModel 通过 `hiltViewModel()` 都能拿到注入好的实例。

---

## 十三、`@EntryPoint`:在 Hilt 管不到的地方拿依赖

少数情况你需要在 Hilt 还没接管的地方(自定义 `ContentProvider` / 普通 `BroadcastReceiver` / 三方库回调)拿依赖。用 `@EntryPoint`:

```kotlin
@EntryPoint
@InstallIn(SingletonComponent::class)
interface AnalyticsEntryPoint {
    fun analytics(): Analytics
}

// 使用:
val entryPoint = EntryPointAccessors.fromApplication(ctx, AnalyticsEntryPoint::class.java)
val analytics = entryPoint.analytics()
```

99% 项目用不到——`@AndroidEntryPoint` 已经覆盖 Activity / Fragment / Service / BroadcastReceiver。

---

## 十四、KSP:Hilt 注解处理的现代化

Hilt 默认还在用 KAPT(老的 Kotlin 注解处理器)。**Hilt 2.48+ 支持 KSP**——KSP 更快、对 K2 更友好。

`gradle/libs.versions.toml`:
```toml
[plugins]
hilt = { id = "com.google.dagger.hilt.android", version.ref = "hilt" }
ksp = { id = "com.google.devtools.ksp", version.ref = "ksp" }
```

`:app/build.gradle.kts`:
```kotlin
plugins {
    alias(libs.plugins.hilt)
    alias(libs.plugins.ksp)
}

dependencies {
    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)              // ← ksp,不是 kapt!
}
```

NotedX 的 02 篇已经按这个配。**项目里不应出现一行 `kapt(...)`**——KSP 是现在和未来。

---

## 十五、测试中的 Hilt

```kotlin
@HiltAndroidTest
@UninstallModules(NetworkModule::class)        // 卸掉生产 Module
@AndroidEntryPoint                              // 装上测试 Module
class HomeFeatureTest {
    @get:Rule val hiltRule = HiltAndroidRule(this)

    @Inject lateinit var noteApi: NoteApi      // 注入测试 fake

    @Test fun ...() { ... }
}

@Module
@InstallIn(SingletonComponent::class)
object FakeNetworkModule {
    @Provides @Singleton
    fun provideFakeApi(): NoteApi = FakeNoteApi()
}
```

`@UninstallModules` 卸掉生产 Module,测试自己提供一份 fake。22 篇展开测试。

---

## 十六、踩坑

**坑 1:`@HiltAndroidApp` 漏标**。**没有这一行,Hilt 整个体系不工作**——所有 `@Inject` 报"Hilt 找不到依赖"。新项目第一件事就是给 Application 加上这个注解。

**坑 2:Manifest 里 Application 类名漏写**。
```xml
<application android:name=".NotedXApp" ... >    <!-- 必须 -->
```
忘了写 `android:name`,Hilt 入口找不到。

**坑 3:`@AndroidEntryPoint` 漏给 Activity**。Activity 没加这个,里面的 `@Inject` 字段拿不到值,运行时 NullPointerException。

**坑 4:用 `viewModel()` 而不是 `hiltViewModel()`**。前者用 Activity 默认工厂,拿不到 Hilt 依赖。注入失败,运行时崩。

**坑 5:Hilt Module 装到错的 Component**。`@InstallIn(SingletonComponent::class)` 是 99% 选择;装到 `ActivityComponent` 的话,ViewModel 拿不到(因为 ViewModel 是 ActivityRetainedComponent,看不到 ActivityComponent)。

**坑 6:`@Singleton` 加在 ViewModel 上**。ViewModel 本来就有自己 scope(ViewModelComponent),不能再标 `@Singleton`(会冲突)。**ViewModel 只标 `@HiltViewModel`**,不标其他 scope。

**坑 7:在 Composable 里 `@Inject` 字段**。Composable 是函数,Hilt 不接管。要在 Composable 里拿依赖,通过 ViewModel 中转,或用 `LocalContext.current.applicationContext as NotedXApp` 然后 `@EntryPoint`。

**坑 8:循环依赖**。`A 需要 B,B 需要 A`——Hilt 编译报错。常见原因是 Repository 之间互相调,需要拆出"被共享的依赖"放到第三个类。

**坑 9:用 `kapt` 而不是 `ksp`**。新项目永远用 KSP,KAPT 在 Kotlin 2.0 + Compose 的组合下经常出诡异错误。

---

下一篇 `13-Room 与 DataStore 持久化.md`,把 NotedX 的数据存储层搭起来——Room 怎么定义 Entity / Dao / Database,如何用 Flow 暴露查询、用 `suspend` 做插入更新,DataStore 怎么存"用户偏好"。读完这一篇,NotedX 就能持久化笔记。
