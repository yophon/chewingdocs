## 12-Navigation Compose 与单 Activity 路由

> 一句话导读:Navigation 2.8 的类型安全路由把"路由字符串拼接"这个十年老坑彻底关上;`@Serializable data class` 既是路由 key,也是参数容器,IDE 重命名、编译期校验、深链都跟着收敛到同一个声明里——再去手写 `"home/detail/{id}?from={src}"` 这种格式就是逆历史潮流。

第 11 篇把 ViewModel + UDF + UiState 的状态归属理顺,NotedX 的笔记列表已经能加载、能多选、能恢复状态。但它现在仍住在一个屏幕里;点击一条笔记跳到详情、再返回,以及编辑器、设置、登录页之间的串联,本篇要给出标准方案。

Android 历史上的导航心智改朝换代过太多次:多 Activity + `startActivityForResult`(Activity 重建,数据传递全靠 Intent extras)→ Fragment + `FragmentManager`(回退栈勉强,共享 ViewModel 要靠 `ViewModelProvider(parentActivity)`)→ Jetpack Navigation Component + XML graph(终于有"图"了,但参数还要 `safe-args` Gradle 插件生成)→ Navigation Compose(代码声明图,但路由字符串模板还是字符串)→ **Navigation 2.8 类型安全路由**(`@Serializable data class` 直接当 key,告别字符串)。

我们截稿时点是 2026/05,主流栈就是最后这一步。本篇全部用 `@Serializable` 路由,**不写一行字符串模板**——这不是激进选择,而是 Google 在 Now in Android 项目里 2024 Q4 已经全面切换的事实。

## 1. 机制定位

### 1.1 字符串路由为什么是坑

Compose 时代第一版 Navigation API 是这样的:

```kotlin
// 反例:字符串拼路由,IDE 无法跟踪、编译期不校验
NavHost(navController, startDestination = "home") {
    composable("home") { HomeScreen(onOpen = { id -> navController.navigate("note/$id?from=home") }) }
    composable(
        route = "note/{id}?from={from}",
        arguments = listOf(
            navArgument("id") { type = NavType.StringType },
            navArgument("from") { type = NavType.StringType; nullable = true },
        ),
    ) { backStackEntry ->
        val id = backStackEntry.arguments?.getString("id") ?: error("no id")
        val from = backStackEntry.arguments?.getString("from")
        NoteDetailScreen(id, from)
    }
}
```

四种翻车场景一字排开:

1. **`note/$id` 与 `note/{id}` 写错一个字**——运行期才 NPE,IDE 不报警。
2. **新增参数要改三处**:navigate 调用、composable route 模板、arguments 声明。漏一处,要么参数读不到要么深链失效。
3. **重命名 "note" 为 "noteDetail"**——全工程 grep 改字符串,容易漏。
4. **参数类型变更**(`id: String` → `id: Long`)需要改 `NavType` + 解析 + 类型转换,改不干净就 ClassCastException。

类型安全路由把这四件事压缩成"改 `@Serializable data class` 的一个字段"。改完编译期所有调用点跟着报错,IDE 重命名一键全跟。

### 1.2 单 Activity 的工程价值

抛开导航库本身,"为什么是单 Activity"这个心智值得明确:

| 维度 | 多 Activity / Fragment | 单 Activity + Compose Navigation |
| --- | --- | --- |
| 状态共享 | `Intent` extras + Parcelable;Fragment 间靠 `ViewModelProvider(activity)` | `NavBackStackEntry` 是 ViewModelStoreOwner,父路由 ViewModel 自然共享 |
| 转场动画 | Activity transition API + Shared Element transitionName | `composable(enterTransition = ...)` 一行;`SharedTransitionLayout` 跨页面共享(第 10 篇) |
| 启动开销 | Activity onCreate 完整走一遍(几十 ms) | Composable 重组,通常 < 5ms |
| 深链 | `<intent-filter>` 一堆,Manifest 改到吐 | `NavDeepLink` 在路由声明里 |
| 内存 | 多个 Activity 共存,易堆栈过深 | 单一 NavController,管控统一 |

代价是单 Activity 把 `WindowInsets`、IME、`OnBackPressedDispatcher`、`ActivityResult` 几样系统耦合点都集中到这一个 Activity,需要在它里面提供"全局协议"。Compose + Navigation 的现代写法已经把这些都用 `LocalActivity` / `LocalLifecycleOwner` / `rememberLauncherForActivityResult` 等 Composition Local 包装好,真正复杂度比多 Activity 时代低得多。

### 1.3 Navigation 2.8 类型安全路由的本质

`Navigation 2.8`(2024-09 进入稳定)的类型安全路由不是"在字符串模板基础上加一层",而是**重新设计了路由 key 的表示**:

- 路由 key 是一个 KClass(任何 Kotlin 类)。
- 路由参数从 `data class` 字段读取,由 `kotlinx.serialization` 序列化进 `Bundle`。
- 深链 URI 与路由 KClass 的映射由 `navDeepLink<RouteType>(uriPattern)` 声明,uri 里的 `{param}` 通过 serializer 自动反序列化到 `data class` 字段。
- 起点(`startDestination`)直接传 `data class` 实例。

它要求 `kotlinx.serialization` plugin、`@Serializable` 注解,以及 `androidx.navigation:navigation-compose:2.8+`。

### 1.4 Predictive Back Gesture:Android 15 的硬性要求

Android 15 (API 35) 把预测式返回手势 (Predictive Back) 从 "选择性接入" 变成默认行为。用户从屏幕边缘开始滑动,系统希望应用能渲染出"返回到上一页"的预览动画;松手则真正返回,中途取消则平滑回滚。

Compose 侧的协议是 `PredictiveBackHandler { progress -> ... }`:它是 `BackHandler` 的进度感知版本,接收一个 `Flow<BackEventCompat>`,每个事件包含 progress (0.0 → 1.0)、touchX/Y、swipeEdge。Navigation 2.8 在 `composable()` 已内建对预测返回的支持——只要 `popEnterTransition` 用支持进度参数的 spec,Material 3 的 `Scaffold` 与 `SharedTransitionLayout` 都会自动跟随。但任何"自定义返回拦截"(确认对话框、表单未保存提醒)都必须用 `PredictiveBackHandler` 而非旧的 `BackHandler`,否则手势预览会闪烁。

## 2. Android 心智

### 2.1 `NavHost` 与 `NavController`

```kotlin
val navController = rememberNavController()
NavHost(navController = navController, startDestination = Home) {
    composable<Home> { HomeRoute(...) }
    composable<NoteDetail> { backStackEntry ->
        val route: NoteDetail = backStackEntry.toRoute()
        NoteDetailRoute(noteId = route.id)
    }
}
```

`NavController` 是导航状态的拥有者,持有 `NavBackStack`(一个 `List<NavBackStackEntry>`)。每个 `NavBackStackEntry` 是:

- 自身的 `LifecycleOwner`(STARTED 当前 / STOPPED 在栈中但被覆盖 / DESTROYED 出栈)。
- 自身的 `ViewModelStoreOwner`(同一路由实例共享同一组 ViewModel)。
- 自身的 `SavedStateRegistryOwner`(参与 process death 恢复)。

这意味着每个屏幕的 `hiltViewModel()` 取出来的实例都跟该 `NavBackStackEntry` 绑定;同一路由二次入栈(典型场景:从 A → B → A')会得到不同 ViewModel 实例。要在父子路由共享 ViewModel(如多步骤表单的"父级 wizard ViewModel"),用 `navController.getBackStackEntry<ParentRoute>()` 显式取父 entry,再 `hiltViewModel(viewModelStoreOwner = parentEntry)`。

### 2.2 `@Serializable` 路由的工作流

```kotlin
@Serializable
data object Home

@Serializable
data class NoteDetail(val id: String, val from: NavSource = NavSource.List)

@Serializable
enum class NavSource { List, Search, Widget }
```

- `data object` 用于无参数路由(首页、设置入口),它在序列化层是单例,效率比 `class Home : Unit` 高。
- `data class` 用于带参数路由,字段是参数,默认值是"不传时的回退"。
- 嵌套类型(枚举、List)只要也是 `@Serializable` 或 Kotlin 基础类型即可。

调用方:

```kotlin
navController.navigate(NoteDetail(id = "n1"))
navController.navigate(NoteDetail(id = "n2", from = NavSource.Widget))
```

读取方:

```kotlin
composable<NoteDetail> { backStackEntry ->
    val route: NoteDetail = backStackEntry.toRoute()
    NoteDetailRoute(id = route.id, source = route.from)
}
```

`backStackEntry.toRoute()` 是 `androidx.navigation.toRoute<T>()` 扩展,内部用 kotlinx.serialization 把 Bundle 解回 `data class` 实例。所有参数类型由序列化器处理,你不再需要 `NavType` 注册自定义类型(过去枚举要写 `NavType.EnumType(NavSource::class.java)`,现在不用了)。

### 2.3 深链:URI 模式 + 路由类型

```kotlin
composable<NoteDetail>(
    deepLinks = listOf(
        navDeepLink<NoteDetail>(basePath = "https://notedx.app/note"),
        navDeepLink<NoteDetail>(basePath = "notedx://note"),
    ),
) { ... }
```

`navDeepLink<NoteDetail>(basePath)` 自动把 `NoteDetail` 的字段映射成 URI query / path 参数:`https://notedx.app/note?id=n1&from=Widget` 自动反序列化。配合 `AndroidManifest.xml` 里的 `<intent-filter>` 声明域名,系统把 deep link Intent 投递给 `MainActivity`,`NavController.handleDeepLink(intent)` 自动找到对应路由。

App Links 域名验签(`assetlinks.json`)、`autoVerify="true"` 等配置参见 [[androidNativeLearning 20-Intent与AppLinks]]。

### 2.4 返回栈与 popBackStack

```kotlin
// 弹一层
navController.popBackStack()

// 弹到某个路由(包含 / 不包含)
navController.popBackStack<Home>(inclusive = false)

// 导航并清栈(登录成功后跳首页,不留登录页)
navController.navigate(Home) {
    popUpTo<Login> { inclusive = true }
    launchSingleTop = true
}
```

`navigate { popUpTo<Login> { inclusive = true } }` 是登录 / 引导流的标准范式:登录成功跳首页,且把登录页与其前面的引导页全部从栈中清除,用户按返回直接退出应用而非回到登录。`launchSingleTop = true` 防止同一路由被重复入栈(从通知栏跳详情,详情已经在栈顶就复用)。

### 2.5 `SavedStateHandle` 跨屏返回值

A 屏导航到 B 屏,B 屏选完结果要回写给 A——这是经典需求(选择联系人、地址簿、图片裁剪)。Navigation Compose 的标准做法:

```kotlin
// B 屏:把结果写到上一个 BackStackEntry 的 SavedStateHandle
val previous = navController.previousBackStackEntry
previous?.savedStateHandle?.set("picked_note_id", id)
navController.popBackStack()

// A 屏:订阅自己的 SavedStateHandle
val current = navController.currentBackStackEntry
LaunchedEffect(current) {
    current?.savedStateHandle?.getStateFlow<String?>("picked_note_id", null)
        ?.collect { id -> if (id != null) viewModel.onNotePicked(id) }
}
```

`getStateFlow` 把 SavedStateHandle 的 key 变成 Flow,B 屏写入立即触发 A 屏 collect。这条机制比 `setFragmentResultListener` 时代干净得多——没有"结果 key 是字符串、漏一个字就丢"的脆性。但仍要把 key 抽成常量。

### 2.6 Predictive Back 的 Compose 协议

```kotlin
PredictiveBackHandler(enabled = hasUnsavedChanges) { progress: Flow<BackEventCompat> ->
    try {
        progress.collect { event -> animateConfirmDialog(event.progress) }
        // 用户松手且 progress 到 1.0 —— 真正触发返回
        showUnsavedDialog()
    } catch (e: CancellationException) {
        // 用户取消手势 —— 回滚动画
        animateConfirmDialog(0f)
    }
}
```

`PredictiveBackHandler` 接收一个 lambda,lambda 拿到 `Flow<BackEventCompat>`:用户从边缘滑动时,progress 从 0 一路到 1,且 `flow` 是热的;松手且 progress 达阈值,collect 正常结束(走到 lambda 末尾);松手过早或取消,会抛 `CancellationException`。

`enabled = hasUnsavedChanges`:仅在有未保存修改时拦截返回,平时让系统默认行为接管(更省心 + 转场动画更标准)。

## 3. 工程实现

下面给出 NotedX 的完整路由配置:Login → Home → NoteList → NoteDetail → Editor 五个屏幕,带嵌套图、深链、跨屏返回值、Predictive Back。代码放在 `app/src/main/java/com/example/notedx/navigation/`。

### 3.1 路由定义:`NotedxRoutes.kt`

```kotlin
package com.example.notedx.navigation

import kotlinx.serialization.Serializable

@Serializable
data object Login

@Serializable
data object Home

@Serializable
data class NoteList(val folderId: String? = null)

@Serializable
data class NoteDetail(val id: String, val from: NavSource = NavSource.List)

@Serializable
data class NoteEditor(val id: String? = null)

@Serializable
data object Settings

@Serializable
enum class NavSource { List, Search, Widget, DeepLink }

/** 嵌套图:登录流 */
@Serializable
data object AuthGraph

/** 嵌套图:主体应用 */
@Serializable
data object MainGraph
```

设计要点:

- **`data object` vs `data class`**:无参数路由全部用 `data object`,既零分配也避免误传参数。
- **嵌套图也是 `@Serializable` 类型**:`AuthGraph` 与 `MainGraph` 作为 navigation graph 标识。`navigation<AuthGraph>(startDestination = Login) { ... }` 这种写法把"登录页 + 注册页 + 忘记密码"打包成一个子图,跳转、共享 ViewModel 都以 graph 为单位。
- **可空参数 + 默认值**:`NoteEditor(id = null)` 表示新建,`NoteEditor(id = "n3")` 表示编辑。一处声明,IDE 永远知道这是 nullable。
- **枚举直接当字段**:`NavSource` 是 `@Serializable` 枚举,Navigation 2.8 自动支持序列化,不需要 `NavType.EnumType`。

### 3.2 NavHost 与图结构:`NotedxNavHost.kt`

```kotlin
package com.example.notedx.navigation

import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.navigation.NavController
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.navigation
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navDeepLink
import androidx.navigation.toRoute
import com.example.notedx.ui.auth.LoginRoute
import com.example.notedx.ui.editor.NoteEditorRoute
import com.example.notedx.ui.home.HomeRoute
import com.example.notedx.ui.note.detail.NoteDetailRoute
import com.example.notedx.ui.note.list.NoteListRoute
import com.example.notedx.ui.settings.SettingsRoute

private const val DEEP_LINK_HOST = "notedx.app"
private const val WEB_SCHEME = "https"
private const val APP_SCHEME = "notedx"

@Composable
fun NotedxNavHost(
    isLoggedIn: Boolean,
    navController: NavHostController = rememberNavController(),
) {
    NavHost(
        navController = navController,
        startDestination = if (isLoggedIn) MainGraph else AuthGraph,
    ) {
        // ── 登录子图 ──────────────────────────────────────
        navigation<AuthGraph>(startDestination = Login) {
            composable<Login> {
                LoginRoute(onLoggedIn = {
                    navController.navigate(MainGraph) {
                        popUpTo<AuthGraph> { inclusive = true }
                        launchSingleTop = true
                    }
                })
            }
        }

        // ── 主体子图 ──────────────────────────────────────
        navigation<MainGraph>(startDestination = Home) {
            composable<Home>(
                enterTransition = { fadeIn() },
                exitTransition = { fadeOut() },
            ) {
                HomeRoute(
                    onOpenList = { folderId -> navController.navigate(NoteList(folderId)) },
                    onOpenSettings = { navController.navigate(Settings) },
                )
            }

            composable<NoteList> { entry ->
                val route: NoteList = entry.toRoute()
                NoteListRoute(
                    folderId = route.folderId,
                    onOpenDetail = { id ->
                        navController.navigate(NoteDetail(id = id, from = NavSource.List))
                    },
                    onCreateNew = { navController.navigate(NoteEditor()) },
                )
            }

            composable<NoteDetail>(
                deepLinks = listOf(
                    navDeepLink<NoteDetail>(basePath = "$WEB_SCHEME://$DEEP_LINK_HOST/note"),
                    navDeepLink<NoteDetail>(basePath = "$APP_SCHEME://note"),
                ),
            ) { entry ->
                val route: NoteDetail = entry.toRoute()
                NoteDetailRoute(
                    noteId = route.id,
                    source = route.from,
                    onEdit = { navController.navigate(NoteEditor(id = route.id)) },
                    onBack = { navController.popBackStack() },
                )
            }

            composable<NoteEditor> { entry ->
                val route: NoteEditor = entry.toRoute()
                NoteEditorRoute(
                    noteId = route.id,
                    onSaved = { savedId ->
                        navController.previousBackStackEntry
                            ?.savedStateHandle?.set(KEY_LAST_SAVED_NOTE, savedId)
                        navController.popBackStack()
                    },
                    onDiscard = { navController.popBackStack() },
                )
            }

            composable<Settings> {
                SettingsRoute(onBack = { navController.popBackStack() })
            }
        }
    }
}

const val KEY_LAST_SAVED_NOTE = "last_saved_note_id"
```

设计要点:

- **`navigation<AuthGraph>` 与 `navigation<MainGraph>`**:把整个应用切成"未登录区"和"已登录区",登录成功后用 `popUpTo<AuthGraph> { inclusive = true }` 把整个登录子图清空,用户返回不会回到登录页。
- **`enterTransition` / `exitTransition`**:Navigation 2.8 在每个 `composable` 单独配置,Compose 1.7 的 `SharedTransitionLayout` 可以跨 `composable` 工作(详见第 10 篇),但需要把 `SharedTransitionLayout` 提到 `NavHost` 外层并通过 `LocalSharedTransitionScope` 传入。
- **深链声明跟随路由**:`navDeepLink<NoteDetail>(basePath = ...)` 一行搞定,URI 里 `?id=xxx&from=Widget` 自动反序列化到 `NoteDetail` 实例。
- **`KEY_LAST_SAVED_NOTE` 是常量**:跨屏返回值的 key 永远不要散落在调用点。

### 3.3 跨屏返回值:NoteList 接收编辑器保存结果

文件位置:`app/src/main/java/com/example/notedx/ui/note/list/NoteListRoute.kt` 的补丁部分。

```kotlin
@Composable
fun NoteListRoute(
    folderId: String?,
    onOpenDetail: (String) -> Unit,
    onCreateNew: () -> Unit,
    viewModel: NoteListViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val navBackStackEntry = LocalNavBackStackEntry.current

    // 监听编辑器返回的 savedNoteId,触发刷新
    LaunchedEffect(navBackStackEntry) {
        navBackStackEntry?.savedStateHandle
            ?.getStateFlow<String?>(KEY_LAST_SAVED_NOTE, null)
            ?.collect { savedId ->
                if (savedId != null) {
                    viewModel.onAction(NoteListAction.Refresh)
                    navBackStackEntry.savedStateHandle[KEY_LAST_SAVED_NOTE] = null
                }
            }
    }
    // ... 其余 Snackbar 与 NoteListScreen 调用同第 11 篇
}
```

> `LocalNavBackStackEntry` 是 NotedX 项目里自定义的 `CompositionLocal`,由 `NavHost` 外层 `CompositionLocalProvider(LocalNavBackStackEntry provides currentEntry)` 注入。这避免每个 Route 都依赖 `NavController`,符合"Route 只关心自己的 ViewModel + 上行回调"。

设计要点:

- 收到 savedId 后立刻 `set(KEY, null)` 是关键:否则旋转 / 重组后 `getStateFlow` 重新触发 collect,刷新被重放。
- `viewModel.onAction(Refresh)` 而非"直接把 savedId 拼进 UiState":让 ViewModel 自己重新去 Repository 拉,UI 不假设"返回的就是最新数据"。

### 3.4 Predictive Back:编辑器未保存提醒

文件位置:`NoteEditorRoute.kt`。

```kotlin
package com.example.notedx.ui.editor

import androidx.activity.compose.PredictiveBackHandler
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.collect

@Composable
fun NoteEditorRoute(
    noteId: String?,
    onSaved: (String) -> Unit,
    onDiscard: () -> Unit,
    viewModel: NoteEditorViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var showDiscardDialog by remember { mutableStateOf(false) }
    var backProgress by remember { mutableFloatStateOf(0f) }
    val isDirty = state.title.isNotBlank() || state.body.isNotBlank()

    PredictiveBackHandler(enabled = isDirty) { progress ->
        try {
            progress.collect { event -> backProgress = event.progress }
            // 用户松手且 progress 达阈值 —— 弹确认框
            showDiscardDialog = true
            backProgress = 0f
        } catch (e: CancellationException) {
            backProgress = 0f
            throw e
        }
    }

    if (showDiscardDialog) {
        AlertDialog(
            onDismissRequest = { showDiscardDialog = false },
            confirmButton = {
                Button(onClick = { showDiscardDialog = false; onDiscard() }) { Text("放弃") }
            },
            dismissButton = {
                Button(onClick = { showDiscardDialog = false }) { Text("继续编辑") }
            },
            title = { Text("放弃未保存内容?") },
        )
    }

    NoteEditorScreen(
        state = state,
        backProgress = backProgress,
        onTitleChange = viewModel::onTitleChange,
        onBodyChange = viewModel::onBodyChange,
        onSave = { viewModel.save(onSaved) },
    )
}
```

设计要点:

- `PredictiveBackHandler(enabled = isDirty)`:只在有未保存修改时拦截,否则放给系统(系统的返回 + 转场动画更标准)。
- `backProgress` 传给 `NoteEditorScreen`:屏幕上可以根据进度做"卡片轻微缩小、底色变暗"的预览效果,与系统的预测式动画呼应。
- `catch (CancellationException)`:用户取消手势(向反方向滑回去 / 抬手过早),回滚状态后**必须 re-throw**,这是结构化并发的协议,否则父 scope 不知道这次 collect 是被取消而非完成。
- 弹框不直接 `popBackStack`,而是回调 `onDiscard()`,让 NavHost 层决定如何返回(可能是 popBackStack,也可能是导航到草稿箱)。

### 3.5 共享 ViewModel:多步骤表单

NotedX 的"新建笔记 wizard"有三步:基本信息 → 选择标签 → 预览。三个屏幕共享同一个 `NewNoteWizardViewModel`。

```kotlin
@Serializable data object NewNoteWizard
@Serializable data object WizardStep1
@Serializable data object WizardStep2
@Serializable data object WizardStep3

// 在 NavHost 里嵌套图
navigation<NewNoteWizard>(startDestination = WizardStep1) {
    composable<WizardStep1> { entry ->
        val parentEntry = remember(entry) { navController.getBackStackEntry<NewNoteWizard>() }
        val wizardVm: NewNoteWizardViewModel = hiltViewModel(parentEntry)
        WizardStep1Route(wizardVm, onNext = { navController.navigate(WizardStep2) })
    }
    composable<WizardStep2> { entry ->
        val parentEntry = remember(entry) { navController.getBackStackEntry<NewNoteWizard>() }
        val wizardVm: NewNoteWizardViewModel = hiltViewModel(parentEntry)
        WizardStep2Route(wizardVm, onNext = { navController.navigate(WizardStep3) })
    }
    composable<WizardStep3> { entry ->
        val parentEntry = remember(entry) { navController.getBackStackEntry<NewNoteWizard>() }
        val wizardVm: NewNoteWizardViewModel = hiltViewModel(parentEntry)
        WizardStep3Route(wizardVm, onFinish = {
            navController.popBackStack<NewNoteWizard>(inclusive = true)
        })
    }
}
```

`getBackStackEntry<NewNoteWizard>()` 取到嵌套图本身的 entry,它的 `ViewModelStoreOwner` 比单个 step 屏幕的生命周期长——三个 step 走完都共享同一个 `wizardVm`。当从 wizard 整体 popBackStack 时,wizard 的 entry 销毁,wizardVm `onCleared()` 触发,中间状态自动释放。

## 4. 调参与验收

### 4.1 几个关键参数

| 参数 | 位置 | 典型值 | 影响 |
| --- | --- | --- | --- |
| `launchSingleTop` | `navigate { }` block | `true` for 通知 / 深链触发的页面 | 防止同一路由被重复入栈 |
| `popUpTo<T> { inclusive }` | `navigate { }` block | true 表示连 T 一起出栈 | 登录流 / 主流程切换的标准用法 |
| `enterTransition` / `popEnterTransition` | `composable()` | `fadeIn()` 或 `slideInHorizontally()` | 决定页面切入动画;`popEnter` 是返回时的"上一页入场" |
| `enabled` | `PredictiveBackHandler` | 仅在拦截需求成立时 `true` | 不拦截时让系统默认行为接管 |
| `deepLinks` | `composable()` | `navDeepLink<T>(basePath)` | 深链入口;必须配合 Manifest `<intent-filter>` |

### 4.2 验收清单

- **类型安全**:`navigate(NoteDetail(id = ""))` 改成 `navigate(NoteDetail(id = "x", from = NavSource.Widget))`,编译期通过;改 `NoteDetail` 字段名,所有调用点编译报错。
- **登录跳首页清栈**:登录成功后按返回,直接退出应用而非回到登录页。
- **深链**:`adb shell am start -W -a android.intent.action.VIEW -d "https://notedx.app/note?id=n3&from=Widget" com.example.notedx`,应用启动并直接打开 `NoteDetail(n3, Widget)`,返回 `Home` 而非 `NoteList`(因为深链直接 push 而没经过列表)。
- **跨屏返回值**:从列表进入编辑器新建笔记,保存后回到列表,列表自动刷新出现新笔记;旋转屏幕过程中不重复触发刷新。
- **共享 ViewModel**:wizard 三步表单跨步骤共享数据,从第 3 步回到第 1 步,数据仍在;wizard 整体退出后,再次进入数据归零(因为 wizard graph 重新创建)。
- **Predictive Back**:编辑器输入文本后,从屏幕边缘缓慢拖动返回手势,屏幕会以拖动进度渐隐;松手出现"放弃未保存"对话框;取消手势(向反方向滑回去)对话框不弹,编辑器状态完整保留。
- **`getStateFlow` 与 `set(null)` 配对**:旋转屏幕过程中,SavedStateHandle 的跨屏返回值不被重复消费。

### 4.3 性能与诊断

- `adb shell dumpsys activity activities`:确认整个 App 只有 1 个 Activity 实例,不论导航多深;栈深度由 `NavController.currentBackStack.size` 决定。
- Compose Profiler `Show Recomposition Counts`:导航过程中 `NavHost` 不应该把所有 composable 都重组,只有当前 entry 与离开 entry 的转场区域重组。
- `Layout Inspector → Compose tab → 节点列表`:导航后旧屏幕仍存在于 composition 一小段时间(出场动画),动画结束后离开 composition;搬迁 `LaunchedEffect`、协程都跟随取消。
- Macrobenchmark `StartupBenchmarks`:从冷启动 + 深链跳到详情页,时间应在 < 1.0s P95(中端设备),否则 Baseline Profile 需补 NavHost 相关类(第 23 篇展开)。

## 5. 踩坑

### 5.1 忘了 `kotlinx.serialization` plugin

```kotlin
// build.gradle.kts
plugins {
    alias(libs.plugins.kotlin.serialization)
}
dependencies {
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.androidx.navigation.compose) // 2.8+
}
```

`@Serializable` 不加 plugin 编译不通过;运行时报"missing serializer for class X"通常是 plugin 没启用,或者 `data class` 字段类型没 `@Serializable`。检查 `build.gradle.kts` 的 plugins 块。

### 5.2 路由 `data class` 字段不能有 lambda

`@Serializable data class NoteDetail(val id: String, val onClick: () -> Unit)` 直接编译错。路由参数序列化进 Bundle,lambda 不可序列化。回调要么通过 NavBackStackEntry savedStateHandle 写返回值,要么用更高层 CompositionLocal 暴露事件总线。这与第 11 篇的"`UiState` 不要塞 lambda"一脉相承。

### 5.3 嵌套图的 startDestination 必须是 graph 内成员

```kotlin
navigation<AuthGraph>(startDestination = Login) { // ✅ Login 是 AuthGraph 子节点
    composable<Login> { ... }
}

navigation<AuthGraph>(startDestination = Home) {  // ❌ Home 不在 AuthGraph 内,运行时崩
    composable<Login> { ... }
}
```

嵌套图的 startDestination 必须由 graph 内的 `composable<T>()` 声明过,否则启动时 `IllegalArgumentException`。这是 2.8 类型安全带来的强校验之一(字符串路由时代是字符串模糊匹配,可能静默失败)。

### 5.4 同一路由被 navigate 两次,堆出两个 entry

```kotlin
// 反例:用户连点两次,详情页被入栈两次
button.onClick = { navController.navigate(NoteDetail(id = "n1")) }
```

防御:`launchSingleTop = true` 或者在调用方做点击节流(`remember { mutableStateOf(false) }` 一个 isNavigating 标志,navigate 后置 true,onResume 时回置)。生产代码统一加 singleTop。

### 5.5 `popBackStack<Home>()` 路由不存在不报错只返 false

`navController.popBackStack<UnknownRoute>()` 如果栈里没有 `UnknownRoute`,返回 `false` 而不抛异常。调用方要检查返回值,否则会出现"按钮没反应"。一种健壮写法:

```kotlin
if (!navController.popBackStack<NoteList>(inclusive = false)) {
    navController.navigate(NoteList()) {
        popUpTo<Home>()
        launchSingleTop = true
    }
}
```

意思是"尝试回到 NoteList;如果它不在栈中(用户从深链直接进 NoteDetail),改为正常导航过去"。这是深链场景里"合理回退"的标准范式。

### 5.6 `BackHandler` 与 `PredictiveBackHandler` 不要同时挂

在同一个 Composable 里同时 `BackHandler { ... }` 与 `PredictiveBackHandler { ... }`,两者都注册 `OnBackPressedCallback`,后注册的覆盖前者,但具体顺序依赖 composition 顺序,难以预测。规则:**有进度需求用 `PredictiveBackHandler`,无需进度用 `BackHandler`**,不混用。

### 5.7 `enterTransition` 在 `SharedTransitionLayout` 场景被覆盖

如果 `NavHost` 外层包了 `SharedTransitionLayout`,`composable(enterTransition = ...)` 的常规 fadeIn / slideIn 会与共享元素的 bounds 过渡叠加,出现"卡片在膨胀的同时整页 fade",视觉混乱。规范做法:**有共享元素的路由把 `enterTransition` / `exitTransition` 设为 `EnterTransition.None` / `ExitTransition.None`**,让共享元素自己负责视觉过渡。第 10 篇的 demo 与本篇的 NavHost 都该这样组合。

### 5.8 类型安全路由的"参数过多"陷阱

```kotlin
@Serializable
data class Search(
    val query: String,
    val filters: List<String> = emptyList(),
    val sort: SortOrder = SortOrder.Relevance,
    val page: Int = 0,
)
```

路由参数全塞进 Bundle 没问题,但 deep link URI 会被这些字段塞得很长:`https://notedx.app/search?query=foo&filters=a&filters=b&sort=Relevance&page=0`,且 `List<String>` 序列化成 URI 时各家解析器表现不一致。**复杂搜索参数应该走 SavedStateHandle 而不是路由参数**:导航过去时只传 `Search(savedQueryId = "q123")`,服务端 / 本地缓存查 q123 拿完整搜索。路由参数保持轻量。

### 5.9 `previousBackStackEntry` 在嵌套图边界为 null

从嵌套图 A 的内部屏幕 X navigate 到嵌套图 B 的内部屏幕 Y,Y 的 `previousBackStackEntry` 可能指向 B 的 graph 节点而非 X。要拿到"真正的上一个屏幕"用 `navController.currentBackStack.value` 自己遍历。跨图跨屏写返回值是反模式,真要这么做改成"通过 Repository 或事件总线传递"。

### 5.10 进程死亡后 NavBackStack 恢复要注意 `@Serializable`

process death 恢复时,Navigation 把整个 back stack 用 kotlinx.serialization 序列化进 SavedInstanceState。**所有路由 `data class` 字段必须可序列化**,否则恢复时崩。注意:第三方库的 model 类(如 `OkHttpClient`、`File`)绝不能直接当字段。路由参数只放 String / Int / Long / Boolean / 枚举 / 嵌套 `@Serializable` 类型。

### 5.11 字符串路由依然能编译

`composable("legacy/{id}") { ... }` 仍然合法 —— Navigation 2.8 没有移除旧 API。这给"渐进迁移"留了路,但混合使用时类型安全保证就破了。NotedX 项目里规定**新代码一律用类型安全路由,老代码迁移前在 lint 里禁掉 `composable(String)` 重载**。

### 5.12 `hiltViewModel()` 不接 owner 在嵌套图共享会拿到错实例

```kotlin
// 反例:这里拿到的是当前 entry 的 VM,不是父图的
val vm: WizardVm = hiltViewModel()

// 正例:显式取父图 entry
val parentEntry = remember(entry) { navController.getBackStackEntry<NewNoteWizard>() }
val vm: WizardVm = hiltViewModel(parentEntry)
```

新手最容易在 wizard / 共享 ViewModel 场景翻车。把 "取 parent entry + hiltViewModel(entry)" 封成扩展函数 `navController.parentGraphViewModel<T>()` 可减少样板。

---

## 手动验证

- [ ] 编译期类型安全:把 `NoteDetail(id = "x")` 的 id 字段重命名为 noteId,所有 navigate / toRoute 调用编译报错并能 IDE 一键修复。
- [ ] 登录清栈:登录成功后按返回,直接退出应用,不回到登录页。
- [ ] 深链跳转:`adb shell am start -W -a android.intent.action.VIEW -d "https://notedx.app/note?id=n3&from=Widget" com.example.notedx`,应用启动直接展示 `NoteDetail` 屏幕,栈深度为 2(Home → NoteDetail)。
- [ ] 跨屏返回值:从列表进编辑器新建笔记,保存后返回,列表刷新出现新条目;旋转屏幕过程中不重复触发刷新。
- [ ] Predictive Back 取消:编辑器有未保存内容时,从边缘缓慢拖返回手势,屏幕跟随渐隐;反向滑回取消,对话框不弹,文本保留。
- [ ] Predictive Back 完成:同上,但松手让进度达阈值,弹出"放弃未保存"对话框;点放弃返回上一页,点继续编辑停留当前页。
- [ ] 共享 ViewModel:wizard 三步表单跨步骤数据共享;从 step 3 回到 step 1 数据仍在;整体退出 wizard 后再次进入,数据归零。
- [ ] 单 Activity 验证:`adb shell dumpsys activity activities`,App 进程内 Activity 数量始终为 1,不论导航多深。
- [ ] 重组成本:Layout Inspector 启用重组计数,导航过程中 `NavHost` 外层 `Scaffold` 重组次数不增长。
