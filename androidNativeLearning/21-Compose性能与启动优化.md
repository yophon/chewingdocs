# Compose 性能与启动优化

> 一句话:**Compose 性能等于"少重组 + 重组快",启动优化等于"冷启动那几百毫秒到底花在哪"**。Strong Skipping、Baseline Profile、Macrobenchmark 是这一篇的三块底座。

---

## 一、Compose 性能的两个轴

| 维度 | 优化方向 | 工具 |
| --- | --- | --- |
| 重组次数 | **跳过不该重组的部分** | Composable 稳定性 / `derivedStateOf` / Strong Skipping |
| 重组速度 | **每次重组本身要快** | LazyColumn key / 避免重 Composable / Baseline Profile |

90% 的性能问题在第一类——**你以为 UI 只更新了一个数字,但 Compose 把整个屏幕都重组了**。

---

## 二、稳定性(stability)与重组跳过

Compose runtime 在重组时,对每个 Composable 检查"参数有没有变"。**没变就跳过**——这是 Compose 性能的基础。

**关键**:能跳过的前提是参数**稳定(stable)**——Compose 看得出"这次的参数和上次等价"。

稳定类型的判断:

- **基础类型**(`Int` / `String` / `Boolean` / `Float`):稳定
- **`@Stable` / `@Immutable` 注解的类**:稳定
- **`data class` 所有字段是稳定类型**:**Strong Skipping 之前不稳定,之后稳定**
- **`MutableState<T>` / `StateFlow<T>`**:稳定(虽然是可变,但 Compose 知道怎么追踪)
- **`List<T>` / `Map<K,V>`**:**不稳定**(可能是 MutableList,运行时没法判断)
- **lambda**:稳定与否取决于捕获

---

## 三、Strong Skipping(1.7+ 默认启用)

Kotlin Compose Compiler 1.5.4+ 引入 Strong Skipping,Compose 1.7+ 默认启用。它把"跳过"放宽了:

**之前**:参数类型不稳定 → 不能跳过
**Strong Skipping**:参数类型不稳定,但**引用没变(`===`)→ 仍然跳过**

```kotlin
@Composable
fun NoteRow(note: Note) {           // Note 是 data class,假设稳定
    // ...
}

@Composable
fun NoteList(notes: List<Note>) {   // List<Note> 不稳定
    notes.forEach { note ->
        NoteRow(note = note)         // Strong Skipping 之前:每次都重组;之后:只要 note 引用没变就跳过
    }
}
```

**实操影响**:Strong Skipping 让你**不用强迫所有参数都用 `ImmutableList`** 也能拿到大部分跳过收益。但**最佳实践仍然是用稳定类型**——Strong Skipping 是兜底。

---

## 四、`ImmutableList` / `PersistentList`

`List<T>` 不稳定。kotlinx.collections.immutable 提供:

```kotlin
implementation("org.jetbrains.kotlinx:kotlinx-collections-immutable:0.3.8")

import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.persistentListOf
import kotlinx.collections.immutable.toImmutableList

data class HomeUiState(
    val notes: ImmutableList<NoteCard> = persistentListOf()
)

val cards: ImmutableList<NoteCard> = entities.map { it.toCard() }.toImmutableList()
```

`ImmutableList<T>` 是只读接口,运行时也不可变——Compose 编译器把它标为稳定。

---

## 五、`@Stable` / `@Immutable` 注解

如果某个类**编译器看不出稳定但你知道它稳定**,显式标注:

```kotlin
@Immutable
data class FilterConfig(
    val keyword: String,
    val tags: ImmutableList<String>,
    val onlyArchived: Boolean,
)
```

`@Immutable` 比 `@Stable` 严格——它声明"这个对象创建后内容永不变"。`@Stable` 允许内部 mutable,但承诺"变化通过 Compose State 机制通知"。

**99% 用 `@Immutable`**——它能给 Compose 编译器最多的优化空间。

---

## 六、`derivedStateOf`:不必要派生的扼制

```kotlin
@Composable
fun List(items: List<Item>, query: String) {
    val filtered = items.filter { it.matches(query) }    // ❌ 每次重组都过滤
    // ...
}
```

每次 `items` 或 `query` 变都重组——但即便 `items` 变了,如果"过滤结果"和上次相同,内部用 filtered 的子 Composable 不该重组。`derivedStateOf` 处理:

```kotlin
val filtered by remember(query) {
    derivedStateOf { items.filter { it.matches(query) } }
}
```

`derivedStateOf` 让 Compose 知道"filtered 只有真正变化时才通知下游"。

**坑**:`derivedStateOf` 自己有开销,**只在派生过程昂贵或读它的 Composable 多次时才用**。简单计算直接算就好。

---

## 七、`LazyColumn` 的关键优化

**1. 永远给 `key`**:

```kotlin
LazyColumn {
    items(notes, key = { it.id }) { note ->     // ✅ 有 key,列表项重排时正确复用
        NoteRow(note = note)
    }
}
```

不给 key:列表项重新排序 → Compose 把每个项的状态都错位地复用 → 滚动卡顿、动画错乱。

**2. `contentType`** 让多种类型的列表项各自池化:

```kotlin
LazyColumn {
    items(headers, key = { it.id }, contentType = { "header" }) { Header(it) }
    items(notes, key = { it.id }, contentType = { "note" }) { NoteRow(it) }
}
```

不加 contentType,Compose 把不同类型的项放同一个池,复用就用不上,等于每次新建。

**3. 避免每个 item 内部状态膨胀**:

```kotlin
items(notes) { note ->
    var expanded by remember { mutableStateOf(false) }     // ⚠️ 每个 item 都 remember 一个 State
    // ...
}
```

100 个 item 就有 100 个 State 对象。如果 expanded 是"屏幕级"状态(只有一个项能展开),提到 ViewModel 里。

---

## 八、`Modifier` 复用:不要每次重组都新建

```kotlin
@Composable
fun Bad() {
    Box(modifier = Modifier.padding(16.dp).background(Color.Red))    // 每次重组都新建 Modifier 链
}

@Composable
fun Better() {
    val modifier = remember { Modifier.padding(16.dp).background(Color.Red) }
    Box(modifier = modifier)
}
```

**但**——这种优化通常不必要,Modifier 创建很便宜。**只在 profile 显示 Modifier 创建是热点时才优化**。过早优化会让代码可读性变差。

---

## 九、Layout Inspector + Recomposition Counts

Android Studio Layout Inspector 在运行 Compose App 时显示**每个 Composable 的重组次数**:

```
HomeScreen        recompositions: 1, skipped: 0
  TopAppBar       recompositions: 1, skipped: 0
  NoteList        recompositions: 5, skipped: 0       ⚠️ 这里
    NoteRow#1     recompositions: 5, skipped: 0       ⚠️ 全跟着重组
    NoteRow#2     recompositions: 5, skipped: 0
```

**`skipped` 应当远多于 `recompositions`**——理想状态下,内层 Composable 几乎全跳过。

**`recompositions` 多 / `skipped` 少**通常是:
- 参数不稳定
- lambda 捕获了不稳定值
- 漏了 `@Immutable`

修复后再看,数字应该明显改善。

---

## 十、Strong Skipping 的副作用:lambda 稳定性

Strong Skipping 之后,lambda 的稳定性变得更重要:

```kotlin
@Composable
fun NoteList(notes: List<Note>, onClick: (Long) -> Unit) {
    notes.forEach { note ->
        NoteRow(
            note = note,
            onClick = { onClick(note.id) }    // ⚠️ 每次重组都新建 lambda
        )
    }
}
```

`{ onClick(note.id) }` 捕获了 `note.id`,每次重组都生成新 lambda → 即便 note 没变,lambda 引用变了 → `NoteRow` 重组。

修法:

```kotlin
NoteRow(
    note = note,
    onClick = remember(note.id) { { onClick(note.id) } }
)
```

或者:

```kotlin
@Composable
fun NoteRow(note: Note, onClick: (Long) -> Unit) {     // 接收带 ID 的 callback
    Row(modifier = Modifier.clickable { onClick(note.id) }) { ... }
}
```

让 onClick 签名是 `(Long) -> Unit`,父级传 `vm::deleteNote` 这种方法引用——方法引用稳定。

---

## 十一、启动优化:cold / warm / hot

**Cold start**(冷启动)——App 进程不存在,从零创建:
```
进程创建 → Application.onCreate → Activity.onCreate → First Frame
```
通常 800-2000ms。这是用户最痛的等待。

**Warm start**(温启动)——App 进程还在但 Activity 销毁:
```
Activity.onCreate → First Frame
```
通常 200-500ms。

**Hot start**(热启动)——Activity 还在,从后台拉回:
```
Activity.onResume → First Frame
```
< 100ms。

**优化目标主要是 Cold start**。

---

## 十二、Application.onCreate 不做重活

```kotlin
@HiltAndroidApp
class NotedXApp : Application() {
    override fun onCreate() {
        super.onCreate()
        // ❌ 不要在这里做长任务
        // database.warmUp()
        // analytics.flush()
        // crashReporter.initSync()
        
        // ✅ 必要的进程级初始化(NotificationChannel、Hilt 自动 / WorkManager 周期任务调度)
        createNotificationChannels()
        SyncNotesWorker.schedulePeriodic(this)
    }
}
```

`Application.onCreate` 在 first frame 之前阻塞主线程,任何超过 50ms 的事都会显著拖慢启动。**昂贵初始化推迟到首次使用或后台**。

---

## 十三、App Startup:用懒初始化代替 ContentProvider 注入

很多 SDK(Firebase / WorkManager / Coil)通过隐藏的 `ContentProvider` 在 Application 启动前自动初始化——多了就拖慢启动。

**Jetpack App Startup**(`androidx.startup`)统一管这些初始化,且支持依赖排序、延迟初始化:

```kotlin
class WorkManagerInitializer : Initializer<WorkManager> {
    override fun create(context: Context): WorkManager {
        WorkManager.initialize(context, Configuration.Builder().build())
        return WorkManager.getInstance(context)
    }
    override fun dependencies() = emptyList<Class<out Initializer<*>>>()
}
```

manifest:

```xml
<provider
    android:name="androidx.startup.InitializationProvider"
    android:authorities="${applicationId}.androidx-startup">
    <meta-data
        android:name=".init.WorkManagerInitializer"
        android:value="androidx.startup" />
</provider>
```

---

## 十四、Baseline Profile:让 ART 提前编译热路径

Android 应用代码默认用 JIT 编译——首次运行时把字节码翻译成机器码,慢。**Baseline Profile** 让你预先告诉 ART:"启动时这些方法一定会被调用,提前 AOT 编译"。

效果:**冷启动 + 首屏渲染快 20-40%**。Compose / Material 3 / Navigation 这种 trampoline 多的栈尤其受益。

**生成 Baseline Profile**:

依赖:

```kotlin
// build-logic 或单独的 :baselineprofile 模块
plugins {
    alias(libs.plugins.android.test)
    alias(libs.plugins.androidx.baselineprofile)
}
```

写一个测试模拟"启动 + 滚动 + 切屏"路径:

```kotlin
@RunWith(AndroidJUnit4::class)
class NotedXBaselineProfile {
    @get:Rule val rule = BaselineProfileRule()

    @Test fun generate() = rule.collect(
        packageName = "com.notedx",
        maxIterations = 15,
        stableIterations = 3,
    ) {
        startActivityAndWait()
        device.findObject(By.res("note_list")).fling(Direction.DOWN)
        device.findObject(By.text("Sample")).click()
        device.pressBack()
    }
}
```

跑:`./gradlew :app:generateBaselineProfile`,生成 `:app/src/main/baseline-prof.txt`(也可以是 Glob 格式 `baseline-prof.txt`)。

`:app/build.gradle.kts`:

```kotlin
android {
    defaultConfig {
        // Baseline Profile 自动打入 APK
    }
}

dependencies {
    implementation("androidx.profileinstaller:profileinstaller:1.4.0")
    "baselineProfile"(project(":baselineprofile"))
}
```

Profile 安装后,Play 商店发版第二次启动起就生效。

---

## 十五、Macrobenchmark:量化启动 / 滚动性能

Baseline Profile 是优化,Macrobenchmark 是测量。

依赖(独立的 `:macrobenchmark` 模块):

```kotlin
plugins {
    alias(libs.plugins.android.test)
}

android {
    defaultConfig {
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    targetProjectPath = ":app"
}

dependencies {
    implementation("androidx.benchmark:benchmark-macro-junit4:1.3.3")
}
```

启动 benchmark:

```kotlin
@RunWith(AndroidJUnit4::class)
class StartupBenchmark {
    @get:Rule val rule = MacrobenchmarkRule()

    @Test fun startupCold() = rule.measureRepeated(
        packageName = "com.notedx",
        metrics = listOf(StartupTimingMetric()),
        iterations = 5,
        startupMode = StartupMode.COLD,
    ) {
        startActivityAndWait()
    }
}
```

跑:`./gradlew :macrobenchmark:connectedReleaseAndroidTest`(必须真机或物理性能稳定的模拟器),输出:

```
StartupBenchmark_startupCold
  timeToInitialDisplayMs   min  450,   median  480,   max  520
  timeToFullDisplayMs      min  680,   median  720,   max  790
```

**`timeToInitialDisplayMs`**:进程启动到第一帧绘制。
**`timeToFullDisplayMs`**:进程启动到 App 调用 `reportFullyDrawn()`(完整内容渲染)的时间——这才是用户感知的"App 打开了"。

调 `reportFullyDrawn()`:

```kotlin
@Composable
fun HomeScreen(state: HomeUiState) {
    val activity = LocalContext.current as Activity
    LaunchedEffect(state.listState) {
        if (state.listState is NoteListState.Content) {
            activity.reportFullyDrawn()
        }
    }
    // ...
}
```

---

## 十六、Splash Screen API

API 31+ 提供官方 Splash Screen API,**用它而不是自己写**。

```kotlin
implementation(libs.androidx.core.splashscreen)
```

`MainActivity`:

```kotlin
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()                            // 必须在 super.onCreate 之前
        super.onCreate(savedInstanceState)
        // ...
    }
}
```

`res/values/themes.xml`:

```xml
<style name="Theme.NotedX.Splash" parent="Theme.SplashScreen">
    <item name="windowSplashScreenBackground">@color/notedx_blue</item>
    <item name="windowSplashScreenAnimatedIcon">@drawable/ic_splash</item>
    <item name="postSplashScreenTheme">@style/Theme.NotedX</item>
</style>
```

`AndroidManifest.xml` 把 Activity 的 theme 设为 `Theme.NotedX.Splash`。

**别自己做 Splash Activity**——空跑一个 Activity 只为显示 logo,纯增加启动时间。官方 API 是窗口动画,**零启动开销**。

---

## 十七、ANR 与卡顿

**ANR**(Application Not Responding):主线程 5 秒不响应或 BroadcastReceiver 10 秒不退出。系统弹"应用无响应"。

主要原因:
- 主线程做网络 / 数据库 / 文件 IO(全部应当走 `Dispatchers.IO`)
- 主线程死锁
- 主线程 CPU 密集运算(图像处理、加解密、JSON 大对象解析)

**Profile**:Android Studio CPU Profiler / Macrobenchmark Frame Timing。

```kotlin
metrics = listOf(FrameTimingMetric(), StartupTimingMetric())
```

输出 `frameDurationCpuMs` / `frameOverrunMs`——超过 16ms(60Hz)就是丢帧。

---

## 十八、Compose Compiler Metrics

Compose Compiler 能输出"哪些 Composable 重组、为什么 / 为什么没跳过"的报告。

`:app/build.gradle.kts`:

```kotlin
tasks.withType<KotlinCompile>().configureEach {
    compilerOptions {
        if (project.findProperty("composeCompilerReports") == "true") {
            freeCompilerArgs.addAll(
                "-P", "plugin:androidx.compose.compiler.plugins.kotlin:reportsDestination=${rootProject.layout.buildDirectory.asFile.get()}/compose_compiler"
            )
        }
    }
}
```

跑 `./gradlew :app:compileReleaseKotlin -PcomposeCompilerReports=true`,看 `build/compose_compiler/app_release-classes.txt`,找出标 "unstable" 的类,加 `@Immutable` 或换 ImmutableList。

---

## 十九、踩坑

**坑 1:认为 Compose 自动很快**。Compose runtime 帮你了很多,但**你写糟代码它救不了**——不稳定参数、漏 key、ViewModel 滥用 `LaunchedEffect` 都会拖慢。Profile 是工程化的一部分。

**坑 2:`mutableStateListOf` 当 `List<T>` 类型暴露**。`SnapshotStateList<T>` 在 Compose 里被认为可变,**不稳定**。要么用 `ImmutableList`,要么显式 `@Stable` 注解告诉编译器。

**坑 3:`StateFlow<T>` collect 后 + filter / map**。
```kotlin
val filtered = vm.notes.collectAsStateWithLifecycle().value.filter { ... }   // 每次重组都过滤
```
filter / map 应当在 ViewModel 端做完,UI 只展示。

**坑 4:Composable 函数太大**。`fun HomeScreen(...) { /* 500 行 */ }` 内部任何 State 变都重组整个 500 行。**按"独立变化"边界拆分**——一个 Composable 一件事。

**坑 5:Baseline Profile 没有 install 检查**。Profile 安装异步,首次启动可能没生效。Play Store 第二次起一定生效。`adb shell cmd package compile -m speed-profile com.notedx` 手动触发 AOT 编译验证。

**坑 6:Macrobenchmark 在模拟器跑**。模拟器性能波动巨大,数字不可比。**永远真机**,且电池电量充电状态一致。

**坑 7:`reportFullyDrawn()` 漏调**。`timeToFullDisplayMs` 等于"启动到 5 秒超时"——指标完全无意义。**首屏内容就绪时必须调一次**。

**坑 8:启动时 `Hilt @Inject` 注入了 `@Singleton` 重对象**。Hilt 在 Application 创建时初始化所有 `@Singleton`——如果某个 Repository 在构造时连接数据库 / 加载几兆配置,启动直接慢一秒。**Singleton 内部初始化也应当 lazy**。

**坑 9:动画用 `Dispatchers.Main` 跑长任务**。Compose 动画通过 frame 回调,**任何阻塞主线程的操作都会丢帧**。即便是 `Log.d()` 长字符串也能拉低 60fps。

**坑 10:Strong Skipping 关了不知道**。某些三方库可能传 `compose.suppressKotlinVersionCompatibilityCheck` 或者用旧版本 Compose Compiler——Strong Skipping 不生效。检查 `:app/build/compose_compiler/` 报告是否启用。

---

下一篇 `22-测试、打包与发布.md`,讲 NotedX 上架前的最后一步:Compose UI Test、ViewModel 单元测试、R8 混淆、AppBundle、签名密钥管理、Play Console 内测 / 正式发布、Play Integrity 反作弊基础、长期维护检查表。读完整本系列完结。
