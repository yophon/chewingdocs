# 13-Hilt 依赖注入

> 一句话导读:Hilt 不是为了让你少写几个 `val repo = Repository(api, dao)`,而是为了让 ViewModel、Repository、OkHttpClient、Room Database 各自的生命周期和作用域在编译期就被锁死,运行期不再依赖一个写歪了就静默泄漏的手工容器。

后端工程师对依赖注入很熟。Spring 在 2003 年就用 `@Autowired` 把它推成 Java 主流;Go 圈 Wire / Fx 把"启动期把图建好"作为微服务的默认骨架。Android 这边路径不一样:Dagger 2 在 2015 年扛过最重的工程量,但 `@Component` 接口、`@Subcomponent` 嵌套、Builder 与 Module 的手工编排,让任何中型项目都会变成"DI 配置即代码"的副业。**Hilt 是 Dagger 团队亲手做的 Android 专用脚手架**:把 `Application` / `Activity` / `Fragment` / `ViewModel` / `Service` 这些 Android 容器与 Dagger 组件预绑好,工程师只剩下"声明绑定"而不是"组装容器"。

本系列从第 04 篇起就在用 `viewModelScope`、第 11 篇暴露 `StateFlow`,这些东西的生命周期都是 Android 给你定好的:ViewModel 死于 `onCleared`、Coroutine 跟着 scope 取消、OkHttp 连接池跟着 `Application` 走。Hilt 做的事就是把这些"已经定好的生命周期"暴露成 `SingletonComponent` / `ViewModelComponent` / `ActivityRetainedComponent` 几个 Scope,让你给 `@Inject` 加 `@Singleton` 或 `@ViewModelScoped`,而不用自己再写一套 `object NetworkContainer`。

## 1. 机制定位

在没有 DI 的 Android 工程里,典型的"手工容器"长这样:某个 `AppContainer` 类里 lazy 一个 `OkHttpClient`,再 lazy 一个 `Retrofit`,再 lazy 一个 `ApiService`,再 lazy 一个 `Room database`,再把这些拼装出 `UserRepository`。`Application.onCreate` 里 `container = AppContainer(this)`,Activity 里 `(application as MyApp).container.userRepository`,ViewModel 拿不到 Application 又得 `AndroidViewModel(app)`,然后 ViewModel 工厂类一写一大堆。

这条线在原型阶段没问题,跨过 5-10 个 Repository 之后开始出问题:

1. **生命周期靠注释维护**。`OkHttpClient` 应该全应用一个,`UserRepository` 也是一个,`SearchRepository` 跟着搜索界面活,`LoginViewModel.formValidator` 跟着 ViewModel 活。手工容器靠 `val xxx by lazy` + 注释告诉读者"这个是单例,那个是页面级",改起来全靠默契。
2. **测试要替换某个依赖,得手动改 container**。给 `UserRepository` 注入一个 fake `ApiService`,要么改 `AppContainer` 暴露 setter,要么再写一个 `TestAppContainer`,两份维护。
3. **跨模块拆分时 container 变成 god class**。多模块化(第 21 篇)之后,`:feature-login` 想拿 `UserRepository`,而 `UserRepository` 的实现住在 `:data`,`AppContainer` 要同时 import 所有 feature + data 模块,变成事实上的 monolith 入口。
4. **ViewModel Factory 是模板代码黑洞**。`ViewModelProvider.Factory` 每个 ViewModel 写一遍,要带 `SavedStateHandle` 还要再嵌一层 `AbstractSavedStateViewModelFactory`,新人能写炸 3 次。

Hilt 把这 4 个问题压到一行注解里:`@Singleton` / `@ViewModelScoped` / `@Inject constructor()` / `@HiltViewModel`。生成代码住在 `build/generated/ksp/`,运行期没有反射,启动期没有 ClassPath 扫描,**所有图都是编译期检查的**——一个 `@Inject` 找不到 provider,`./gradlew assembleDebug` 直接红;手工容器写漏一行,只能在崩溃栈里看见。

Hilt 不解决三类问题,这些得另寻方案:

- **运行期才知道的依赖**。例如"根据用户地区动态选 ApiHost",Hilt 的 `@Provides` 是启动期决议,要做"运行期切换"得靠 `Provider<T>` 或者 `Set<@JvmSuppressWildcards T>` 多绑定 + 选择逻辑,不是 Hilt 直接提供的能力。
- **跨进程依赖**。`Application` 在主进程和 `:remote` 进程都会启动,Hilt 在两个进程里是两份独立的 SingletonComponent,跨进程通信仍走 AIDL / ContentProvider。
- **多 Application 共存**。一些大厂壳工程跑动态加载子 App,Hilt 假设全局只一个 `@HiltAndroidApp`,这条路要走 Dagger 原生 `Component`,Hilt 帮不上忙。

## 2. Android 心智

### Hilt 的组件分层

Hilt 把 Dagger 的 `@Component` 体系预先配好,对应到 Android 自带的容器生命周期。每个 Scope 注解只能在对应 Component 里用,搞错了编译报错:

| Component | Scope 注解 | 生命周期 | 谁能注入到这里 |
| --- | --- | --- | --- |
| `SingletonComponent` | `@Singleton` | `Application` 全程 | 任何 `@AndroidEntryPoint` 标记的容器 |
| `ActivityRetainedComponent` | `@ActivityRetainedScoped` | 配置变更后存活,等于 `ViewModel` 父级 | `@HiltViewModel`、Activity、Fragment |
| `ViewModelComponent` | `@ViewModelScoped` | 单个 `ViewModel` 实例 | `@HiltViewModel` 内部 |
| `ActivityComponent` | `@ActivityScoped` | 单个 Activity 实例,配置变更销毁 | Activity、Fragment、View |
| `FragmentComponent` | `@FragmentScoped` | 单个 Fragment 实例 | Fragment、View |
| `ServiceComponent` | `@ServiceScoped` | 单个 Service 实例 | Service |
| `ViewComponent` | `@ViewScoped` | 单个 View 实例 | View |

实践里 90% 的依赖只用得着 `@Singleton`(`OkHttpClient`、`Retrofit`、`AppDatabase`、`UserRepository`)和 `@ViewModelScoped`(某个 ViewModel 独占的临时 cache、formValidator、流式分页器)。**`@ActivityScoped` 在单 Activity + Compose Navigation 模式下基本退化成"全局",和 `@Singleton` 区别只有"配置变更时重建"**,新项目可以基本不用。

### `@Inject` 的两种姿势

Hilt 提供两类注入入口:

1. **构造函数注入**:`class UserRepository @Inject constructor(api: ApiService, dao: UserDao)`。这是首选。
2. **字段注入**:`@AndroidEntryPoint class MainActivity : ComponentActivity() { @Inject lateinit var analytics: Analytics }`。仅当被注入对象自己不是你写的——比如 Android 容器(Activity / Fragment / Service / BroadcastReceiver)、Worker、ViewModel——才用字段注入。

为什么尽量走构造函数:构造函数注入的类**不需要任何 Hilt 注解**,纯 Kotlin。这意味着这个类可以脱离 Hilt 单独 new 出来用于单元测试,迁移到非 Hilt 项目也无须改源码。Hilt 只是"碰巧"知道怎么提供它的依赖。

### `@Module` 与 `@Provides` / `@Binds` 的取舍

第三方库给你的类(`OkHttpClient`、`Retrofit`、`Json` from kotlinx.serialization、`RoomDatabase`)没法加 `@Inject constructor`,需要在 `@Module` 里手工告诉 Hilt 怎么造。两种写法:

- `@Provides` 是"我自己 new 出来给你",方法体里写构造逻辑。适合第三方库、配置驱动、有副作用的初始化。
- `@Binds` 是"接口 → 实现的指向",抽象方法,Hilt 直接拿构造函数注入的实现填坑。比 `@Provides` 生成的代码更少、更快。

经验法则:**接口绑实现用 `@Binds`,所有其他用 `@Provides`**。`@Binds` 必须写在 `abstract class` 或 `interface` 里,这是 KSP 处理的硬要求。

### Hilt 走 KSP

Hilt 2.48 起正式支持 KSP,2.51+ 推荐全面切换。**KAPT 已进入维护模式**,Google 官方文档明确建议迁移。KSP 直接解析 Kotlin AST,跳过 Java stub 生成,Hilt + Room + Retrofit 混跑时增量构建从 30s+ 降到 8-12s 是常见数据。

K2 编译器与 Kotlin 2.0 出来之后,KAPT 已经不再获得新功能;`hilt-compiler` 自己也只在 KSP 通道发新行为。第 02 篇会把 KSP plugin 配置一次写好,这里只用确认 `kapt` 关键字在 `build.gradle.kts` 里**应该完全消失**——Hilt 走 `ksp("com.google.dagger:hilt-android-compiler:2.51.1")`,不是 `kapt`。

唯一会逼你保留 KAPT 的库目前只剩 Data Binding,而新项目用 Compose 根本不会引入 Data Binding,这条路就彻底关上了。

## 3. 工程实现

NotedX 应用现在要把网络、数据库、Repository、ViewModel 全部接上 Hilt。下面用最小可运行的 4 个文件展示完整拓扑。

### 步骤 1:Application 入口

文件位置 `app/src/main/java/com/example/notedx/NotedXApp.kt`:

```kotlin
package com.example.notedx

import android.app.Application
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class NotedXApp : Application()
```

`@HiltAndroidApp` 让 KSP 生成一个名为 `Hilt_NotedXApp` 的父类,Hilt 在运行期通过 ASM 将 `NotedXApp` 重写为继承这个生成类——这一步是 `hilt-android-gradle-plugin` 做的,所以 plugin 必须装。`AndroidManifest.xml` 里 `<application android:name=".NotedXApp">` 也要更新。

### 步骤 2:网络与序列化模块

文件位置 `app/src/main/java/com/example/notedx/di/NetworkModule.kt`:

```kotlin
package com.example.notedx.di

import com.example.notedx.data.remote.NotedApi
import com.example.notedx.data.remote.AuthInterceptor
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    fun provideJson(): Json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        encodeDefaults = true
    }

    @Provides
    @Singleton
    fun provideOkHttpClient(auth: AuthInterceptor): OkHttpClient =
        OkHttpClient.Builder()
            .addInterceptor(auth)
            .addInterceptor(HttpLoggingInterceptor().apply {
                level = HttpLoggingInterceptor.Level.BASIC
            })
            .build()

    @Provides
    @Singleton
    fun provideRetrofit(client: OkHttpClient, json: Json): Retrofit =
        Retrofit.Builder()
            .baseUrl("https://api.notedx.example/")
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()

    @Provides
    @Singleton
    fun provideNotedApi(retrofit: Retrofit): NotedApi =
        retrofit.create(NotedApi::class.java)
}
```

观察几个细节:

- 整个模块是 `object` 而不是 `class`。`@Provides` 方法没有内部状态,`object` 让 KSP 生成的代码少一层实例化,启动期开销几乎为零。
- `provideOkHttpClient` 把 `AuthInterceptor` 作为参数,Hilt 在编译期就把这条依赖链锁死。`AuthInterceptor` 自己是 `@Inject constructor`,完全不需要在 `NetworkModule` 里再 `@Provides`。
- `@InstallIn(SingletonComponent::class)` + `@Singleton` 配套使用。`@Singleton` 没有 `@InstallIn(SingletonComponent)` 的模块是不会生效的,这是新人最常踩的"绑了但好像没绑"的坑。

### 步骤 3:Repository 接口与绑定

文件位置 `app/src/main/java/com/example/notedx/data/UserRepository.kt`:

```kotlin
package com.example.notedx.data

import com.example.notedx.data.local.UserDao
import com.example.notedx.data.remote.NotedApi
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject
import javax.inject.Singleton

interface UserRepository {
    fun observeProfile(): Flow<UserProfile?>
    suspend fun refresh(): Result<UserProfile>
}

@Singleton
class DefaultUserRepository @Inject constructor(
    private val api: NotedApi,
    private val dao: UserDao,
) : UserRepository {
    override fun observeProfile(): Flow<UserProfile?> = dao.observeProfile()

    override suspend fun refresh(): Result<UserProfile> = runCatching {
        val remote = api.fetchProfile()
        dao.upsert(remote.toEntity())
        remote.toDomain()
    }
}
```

文件位置 `app/src/main/java/com/example/notedx/di/RepositoryModule.kt`:

```kotlin
package com.example.notedx.di

import com.example.notedx.data.DefaultUserRepository
import com.example.notedx.data.UserRepository
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {

    @Binds
    abstract fun bindUserRepository(impl: DefaultUserRepository): UserRepository
}
```

`@Binds` 比 `@Provides` 更省。它告诉 Hilt:"当有人要 `UserRepository`,把 `DefaultUserRepository` 这个 `@Inject` 的实现传过去"。KSP 生成的代码不会真的去调一个方法,只是在 component 图里加一条边。整张图依然全部编译期可见。

`abstract class` 上还能不能写 `@Provides`?能,但要混在一起时 `@Provides` 必须是 `companion object` 里的 `@JvmStatic` 函数。新人常踩这个坑——保持"接口绑定用 `abstract class`,普通 provider 用 `object`",两种模块物理分开,更易维护。

### 步骤 4:`@HiltViewModel` 与 Compose 入口

文件位置 `app/src/main/java/com/example/notedx/feature/profile/ProfileViewModel.kt`:

```kotlin
package com.example.notedx.feature.profile

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.notedx.data.UserRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val repo: UserRepository,
    private val savedStateHandle: SavedStateHandle,
) : ViewModel() {

    val uiState: StateFlow<ProfileUiState> = repo.observeProfile()
        .map { profile -> if (profile == null) ProfileUiState.Empty else ProfileUiState.Ready(profile) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ProfileUiState.Loading)

    private val _events = MutableStateFlow<ProfileEvent?>(null)
    val events: StateFlow<ProfileEvent?> = _events.asStateFlow()

    fun refresh() {
        viewModelScope.launch {
            repo.refresh().onFailure { _events.value = ProfileEvent.RefreshFailed(it.message) }
        }
    }
}
```

文件位置 `app/src/main/java/com/example/notedx/MainActivity.kt`:

```kotlin
package com.example.notedx

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.collectAsState
import androidx.hilt.navigation.compose.hiltViewModel
import com.example.notedx.feature.profile.ProfileScreen
import com.example.notedx.feature.profile.ProfileViewModel
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val vm: ProfileViewModel = hiltViewModel()
            val state by vm.uiState.collectAsState()
            ProfileScreen(state = state, onRefresh = vm::refresh)
        }
    }
}
```

关键链条:

- `@HiltViewModel` 让 Hilt 在 `ActivityRetainedComponent` 父级里登记一个 `ViewModelComponent`,工厂代码由 KSP 生成,你写不到也不需要写。
- `androidx.hilt:hilt-navigation-compose` 提供的 `hiltViewModel()` 是 Compose 唯一推荐入口。`viewModel()`(`androidx.lifecycle.viewmodel.compose`)默认走零参构造,会跳过 Hilt 的工厂,导致 `@Inject` 失败但运行期看似没事——是个真实存在的踩坑路径。
- `MainActivity` 上的 `@AndroidEntryPoint` 是 `hiltViewModel()` 能工作的前提。

### 步骤 5:`build.gradle.kts` 关键片段

`app/build.gradle.kts`(只展示 Hilt + KSP 相关行):

```kotlin
plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

dependencies {
    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.hilt.navigation.compose)
}
```

`libs.versions.toml` 对应条目:

```toml
[versions]
kotlin = "2.0.21"
ksp = "2.0.21-1.0.28"
hilt = "2.51.1"
hilt-navigation-compose = "1.2.0"

[libraries]
hilt-android = { module = "com.google.dagger:hilt-android", version.ref = "hilt" }
hilt-compiler = { module = "com.google.dagger:hilt-android-compiler", version.ref = "hilt" }
hilt-navigation-compose = { module = "androidx.hilt:hilt-navigation-compose", version.ref = "hilt-navigation-compose" }

[plugins]
ksp = { id = "com.google.devtools.ksp", version.ref = "ksp" }
hilt = { id = "com.google.dagger.hilt.android", version.ref = "hilt" }
```

注意 `ksp` 版本号必须以 `kotlin` 版本号开头,否则 Gradle 同步会失败,这是 KSP 的硬要求。每次升 Kotlin,KSP 也要跟着升,这是 K2 时代必须背的 mapping。

## 4. 调参和验收

### Scope 选择

Scope 选错了,行为表现得"好像也行",问题在用户量起来之后才暴露。常见决策矩阵:

| 场景 | 选哪个 | 为什么 |
| --- | --- | --- |
| `OkHttpClient` / `Retrofit` / `Json` | `@Singleton` | 持有线程池、连接池,多实例会泄漏并增大冷启动 |
| `RoomDatabase` | `@Singleton` | 文件锁;多实例会导致 SQLite 写并发问题 |
| `Repository` | `@Singleton` | Flow 共享、缓存共享,业务上也应单例 |
| ViewModel 内部 paging cache | `@ViewModelScoped` | 离开界面时希望释放,但同界面内多 use case 共用 |
| 跟随登录态变化的 `SessionManager` | `@Singleton` + 内部 `MutableStateFlow` | 单例,但内部状态可变 |
| Activity 的 `WindowInsetsController` 包装 | `@ActivityScoped` | 跟 Activity 生命周期 |
| Worker 的 `WorkerParameters` 包装 | 不要塞 Hilt,直接走 `@HiltWorker` | 详见第 17 篇 |

经验法则:**默认 `@Singleton`**。除非依赖里持有真正只活在某个界面的资源(比如绑定某个 Activity 的 Camera Session),否则 `@Singleton` 是最不出问题的选择。Hilt 的 `@Singleton` 内存代价极小——一个对象引用而已。

### KSP 验收

KSP 生成的代码在 `app/build/generated/ksp/<variant>/kotlin/`,打开看一眼:

```text
app/build/generated/ksp/debug/kotlin/
├── com/example/notedx/
│   ├── Hilt_NotedXApp.java
│   ├── NotedXApp_HiltComponents.java
│   └── di/
│       ├── NetworkModule_ProvideOkHttpClientFactory.java
│       └── NetworkModule_ProvideRetrofitFactory.java
└── ...
```

每个 `@Provides` 方法都对应一个 `*_Factory.java`(其实是 Kotlin 生成成 Java 兼容形式),里面是 lazy 单例 / 多例的代码。如果你怀疑某个依赖"明明加了 @Inject 但没生效",来这里 grep,看看有没有 `*_Factory.java`——没有就是 KSP 没扫到,通常是模块包路径不在 `:app` 下而 `hilt-compiler` 没被加到对应模块。

构建期会顺手生成一份 `app/build/reports/hilt/` 下的图依赖报告。看完整个图,新人比看 README 直观 10 倍。

### 启动期成本

Hilt 整体走编译期生成,运行期只有"按 component 实例化对象图"这一份开销,几个毫秒级别。但有一类隐藏成本:`@Singleton` 的 provider 默认是 lazy 的,**只有第一次 inject 才真正构造**。意思是把 `RoomDatabase` 放进 `@Singleton`,只要第一个 ViewModel 在主线程 `inject` 它,SQLite 文件打开就发生在主线程。第 25 篇启动优化里会专门讲怎么把这种"被动初始化"挪到后台线程,这里只记一句:**把启动期会被 inject 的 @Singleton 上加 IO 操作要警觉**。

### 测试替换

Hilt 给测试提供 `@UninstallModules` + `@HiltAndroidTest`(详见第 26 篇),Instrumented Test 里可以替换整个 `NetworkModule` 为 `TestNetworkModule`,fake 一个 `ApiService`。这套替换路径是 Hilt 相比手工容器最大的工程优势——手工容器要在 `Application` 级别开一个测试开关,Hilt 全靠注解。

## 5. 踩坑

### 坑 1:`hiltViewModel()` vs `viewModel()`

Compose 里有两个长得几乎一样的扩展函数:

```kotlin
import androidx.hilt.navigation.compose.hiltViewModel       // 走 Hilt 工厂
import androidx.lifecycle.viewmodel.compose.viewModel       // 走 NewInstanceFactory
```

后者不会过 Hilt,会直接走 `ViewModel` 的零参构造。如果你的 ViewModel 有 `@Inject constructor(api: ApiService)`,`viewModel()` 路径会运行期抛 `InstantiationException`,因为没零参构造;或者更糟——你恰好留了零参构造做兜底,运行期拿到的就是一个 `api` 为 null 的"假"ViewModel,排查极困难。

**记住:被 `@HiltViewModel` 标记的类,Compose 里只能用 `hiltViewModel()`**。代码评审时直接 grep 仓库,凡是 ViewModel 带 `@Inject` 的地方,Compose 调用必须是 `hiltViewModel`。

### 坑 2:`@Singleton` 和 `@InstallIn` 错位

```kotlin
@Module
@InstallIn(ActivityComponent::class)   // 错:模块装在 Activity 层
object NetworkModule {
    @Provides
    @Singleton                          // 但 @Singleton 是 SingletonComponent 的 Scope
    fun provideOkHttp(): OkHttpClient = ...
}
```

编译报错信息会写 `@Singleton may only be used with @InstallIn(SingletonComponent.class)`。每个 Scope 注解都和 Component 一一对应,记不住的时候就翻 §2 那张表。

### 坑 3:`@Binds` 写在 `object` 里

```kotlin
@Module
@InstallIn(SingletonComponent::class)
object RepositoryModule {              // 错:object 不能写 @Binds
    @Binds
    abstract fun bindUserRepository(impl: DefaultUserRepository): UserRepository
}
```

`@Binds` 必须 `abstract`,而 `object` 不允许 `abstract`。Hilt 给的报错很直白,但新人常把 `@Provides` 和 `@Binds` 写在同一个文件里,然后被 KSP 抓住。**`@Binds` 模块一律用 `abstract class`,`@Provides` 模块一律用 `object`,物理分开两个文件**,日后维护省一倍心智。

### 坑 4:循环依赖

```kotlin
class Foo @Inject constructor(val bar: Bar)
class Bar @Inject constructor(val foo: Foo)
```

KSP 编译期直接报 `Dependency cycle`。不要去找"运行期"的 hack,这是设计问题。常见的错误源:Repository A 注入 Repository B 来调一个工具函数,而 B 又依赖 A 的某个公共字段。正解是把那个工具函数抽到一个无依赖的纯 Kotlin 文件里,两个 Repository 各自 import,而不是互相注入。

如果业务上真的需要"循环引用"(很少见,通常是设计味道不对),`Lazy<T>` 或 `Provider<T>` 能打破环:

```kotlin
class Foo @Inject constructor(val bar: Lazy<Bar>) {
    fun something() { bar.get().doIt() }
}
```

Hilt 会生成一个延迟的 wrapper,运行期第一次 `.get()` 才解析另一边。这是 escape hatch,不要变成默认手段。

### 坑 5:`@AndroidEntryPoint` 漏掉父类

Activity 加了 `@AndroidEntryPoint`,Fragment 用了 `hiltViewModel`,但 Fragment 自己没加 `@AndroidEntryPoint`,运行期会抛 `Hilt Fragments must be attached to an @AndroidEntryPoint Activity`。这是 Hilt 的"传染性":凡是要被 Hilt 注入的 Android 容器,自己得贴 `@AndroidEntryPoint`,父级也得贴。

单 Activity + Compose 模式下没有 Fragment,这个坑只在拖了老代码做迁移时出现,但出现一次就够卡半小时。

### 坑 6:`@Inject` 字段是 `val`

```kotlin
@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    @Inject val analytics: Analytics  // 错:字段注入必须 var 或 lateinit var
}
```

字段注入要求字段在构造之后被赋值,Kotlin 的 `val` 是构造期常量,不允许后赋值。`lateinit var` 是标准写法。同理 `val` + `@Inject` 在构造器参数上是合法的(`@Inject constructor(val api: ApiService)`),那不是字段注入。

### 坑 7:`SavedStateHandle` 在 `@ViewModelScoped` 类里拿不到

```kotlin
@ViewModelScoped
class FormValidator @Inject constructor(
    private val handle: SavedStateHandle  // 工作但行为反直觉
) { ... }
```

`SavedStateHandle` 在 `ViewModelComponent` 里被 Hilt 预绑,任何 `@ViewModelScoped` 类拿都拿得到——**但每个 ViewModel 拿到的是同一个 handle**,不是每个 `FormValidator` 自己一份。要拆分作用域时,优先把 `SavedStateHandle` 限定在 `@HiltViewModel` 类里直接持有,业务子组件用普通参数传过去。

### 坑 8:KAPT 残留

迁移到 KSP 后,`build.gradle.kts` 里如果还残留一行 `kapt("com.google.dagger:hilt-android-compiler:...")`,KAPT 会被一并触发——增量构建退化到 stub 生成的速度,而且会和 KSP 生成的 factory 冲突。**搜全工程,确保 `kapt(` 字样为零**,这是从 KAPT 切到 KSP 后第一次 clean build 必做的健康检查。

### 坑 9:多模块场景的 `@InstallIn` 跨模块边界

```kotlin
// :feature-login 模块
@Module
@InstallIn(SingletonComponent::class)
object LoginModule {
    @Provides
    fun provideValidator(): LoginValidator = LoginValidator()
}
```

`:feature-login` 模块自己用,这没问题。但 `:app` 模块如果想注入 `LoginValidator`,**`:app` 必须依赖 `:feature-login`**,否则 KSP 在 `:app` 编译时看不见这个 Module 的存在,报 `MissingBinding`。多模块化(第 21 篇)的核心难点之一就是 DI 边界:把 `@Module` 放在 `:data`、`:domain`、`:feature-*` 里,谁 import 谁能看见。

### 坑 10:把业务逻辑塞进 `@Provides`

```kotlin
@Provides
@Singleton
fun provideUserRepository(api: NotedApi, dao: UserDao): UserRepository {
    val repo = DefaultUserRepository(api, dao)
    repo.preloadIfFirstLaunch()        // 错:启动期副作用
    return repo
}
```

`@Provides` 应该只做构造,不做业务初始化。`preloadIfFirstLaunch` 这种"启动期触发一次"逻辑应该挪到 `App Startup` 库或者由具体 ViewModel 在合适时机调用。`@Provides` 一旦带副作用,启动顺序会变成隐式依赖,后期排查启动慢全靠盲猜。

## 6. Koin 对比与取舍

Hilt 是绝对主线,本节只用来回答一个频繁出现的问题:"为什么不用 Koin?"

Koin 是 Kotlin DSL 写的运行期 DI 容器,用 `module { single { Repo(get(), get()) } }` 这种语法在启动时把图建好。它的卖点:**零注解、零代码生成、纯 Kotlin**。对学习成本极敏感、需要 KMP 多平台共享、或者项目规模本身很小的团队,Koin 是合理选择。

差异在几个工程维度上很明确:

- **编译期 vs 运行期**。Hilt 编译期建图,缺一个绑定 build 红;Koin 运行期建图,缺绑定时 app 起来再崩。中大型项目里"编译期一次性发现所有 missing binding"的价值远大于"零注解"。
- **构建速度**。Hilt + KSP 的代价是 KSP 那一份额外编译耗时,典型 500-行项目里 2-5 秒;Koin 零代码生成,这部分省下来。但 Koin 自己需要在 `startKoin {}` 启动期跑一次反射 / 类型解析,冷启动反而慢一点。
- **作用域表达力**。Hilt 的 Scope 注解和 Android 容器一一映射,清晰但不灵活;Koin 的 `scoped` 自定义性更强,但很容易写出"scope 关闭时机不明"的代码——这恰好是 DI 容器最容易出 bug 的地方。
- **测试替换**。Hilt 的 `@UninstallModules` 用注解明示要替换的边界;Koin 的 `loadKoinModules` + `declare` 在运行期替换,灵活但容易留下"测试间残留"的副作用。
- **KMP 多平台**。Koin 是 KMP 一等公民;Hilt 仅限 Android 端。如果项目以后要把 Repository 层共享到 iOS,Koin 路径更顺(但本系列明确不覆盖 KMP)。
- **生态绑定**。`androidx.hilt:hilt-navigation-compose`、`androidx.hilt:hilt-work`、`androidx.hilt:hilt-navigation-fragment`、`androidx.hilt:hilt-common` 这些 Google 一方扩展只针对 Hilt,Koin 要用类似能力得自己手写 `ViewModelStoreOwner` 集成。

结论:**Android 单端、Compose + Jetpack 全家桶、团队规模 3 人以上、项目预期生命周期 1 年以上,选 Hilt**。其他情况下 Koin 可以是选项。本系列 NotedX 落在前一种,所有后续章节都默认 Hilt 在场。`[[kmpLearning]]`(若以后开)会回头处理 Koin 在多平台共享层的角色。

## 手动验证

- [ ] `./gradlew assembleDebug` 通过,`app/build/generated/ksp/debug/kotlin/` 下能看到 `NetworkModule_ProvideOkHttpClientFactory.java` 等生成文件。
- [ ] 在 `MainActivity` 用 `hiltViewModel<ProfileViewModel>()` 拿到 ViewModel,断点确认构造函数里 `repo` 不为 null。
- [ ] 把 `NetworkModule` 上的 `@InstallIn(SingletonComponent::class)` 改成 `@InstallIn(ActivityComponent::class)`,确认 `assembleDebug` 立刻红出 `@Singleton may only be used with @InstallIn(SingletonComponent.class)`,验证编译期检查在工作。
- [ ] `grep -r "kapt(" app/` 输出为空,确认 KAPT 已彻底退出。
- [ ] 在 `ProfileViewModel` 加一个 `@Inject lateinit var foo: Foo` 而项目里没有 `Foo` 的 provider,`assembleDebug` 应直接报 `MissingBinding`,而不是运行期崩溃。
- [ ] 在 `DefaultUserRepository` 里加个 `init { println("repo created at ${System.currentTimeMillis()}") }`,反复进出 `ProfileScreen`,日志应只打印一次(`@Singleton` 生效验证)。
- [ ] 旋转屏幕一次,`ProfileViewModel` 的实例 id(`println("vm=$this")`)应保持不变(`ActivityRetainedComponent` 跨配置变更存活验证)。
