# Navigation Compose 路由

> 一句话:**单 Activity 应用里,"切换屏幕"等价于"NavHost 切换子 Composable"——`navigate(...)` 不启动 Activity,只在 NavHost 的 back stack 上压一个目的地**。Navigation 2.8+ 用类型安全的 `@Serializable` data class 当路由,告别字符串拼接。

---

## 一、Navigation 的心智:还是一棵 Composable 树

```kotlin
@Composable
fun NotedXApp() {
    val navController = rememberNavController()
    NavHost(navController = navController, startDestination = Route.Home) {
        composable<Route.Home> {
            HomeRoute(onNoteClick = { id -> navController.navigate(Route.Detail(id)) })
        }
        composable<Route.Detail> { backStackEntry ->
            val route: Route.Detail = backStackEntry.toRoute()
            DetailRoute(noteId = route.id, onBack = { navController.popBackStack() })
        }
    }
}

@Serializable
sealed interface Route {
    @Serializable
    data object Home : Route
    @Serializable
    data class Detail(val id: Long) : Route
    @Serializable
    data object Settings : Route
}
```

**关键认识**:这里没有任何 `Intent`,没有 `startActivity`,没有 `Fragment`。`NavHost` 就是一个 Composable,根据 `currentBackStackEntry` 决定显示哪个子 Composable。**导航 = 切换 Composable**。

```
NavHost(navController, startDestination = Home)
  └── currentBackStackEntry
       ├── Home(...)              ← 当前显示
       │
       (调 navigate(Detail(42)))
       │
       ↓
       ├── Home(...)              ← 仍在 back stack 但不显示
       └── Detail(42)             ← 现在显示
```

`navController.popBackStack()` 把栈顶弹掉,回到上一屏。Android 的物理"返回"键 / 手势自动调它。

---

## 二、类型安全路由(2.8+ 必学)

旧版 Navigation 用字符串模板:

```kotlin
// ❌ 旧版,字符串拼接,运行时才发现拼错
composable("detail/{id}") { backStackEntry ->
    val id = backStackEntry.arguments?.getString("id")?.toLong() ?: 0L
}
navController.navigate("detail/$noteId")
```

这种写法有四个问题:参数名打错运行时才挂、类型 always String 要手动 parse、改路由结构所有地方搜替换、IDE 不能跳转。

**Navigation Compose 2.8+ 引入类型安全路由**:

```kotlin
@Serializable
data class Detail(val id: Long, val mode: Mode = Mode.View) : Route

@Serializable
enum class Mode { View, Edit }
```

使用:

```kotlin
composable<Detail> { backStackEntry ->
    val route: Detail = backStackEntry.toRoute()
    DetailRoute(noteId = route.id, mode = route.mode)
}

navController.navigate(Detail(id = 42, mode = Mode.Edit))
```

**几个收益**:

1. 改路由结构,所有 `navigate` 调用点编译报错——不会跑到运行时
2. 路由参数有类型,不用手动 parse
3. 默认值 `mode: Mode = Mode.View` 直接生效
4. 嵌套对象 / sealed / enum 全部支持

实现原理:`@Serializable`(来自 kotlinx.serialization)把 data class 序列化进 backStackEntry 的 arguments,`toRoute()` 反序列化回来。所以 `Route` 的字段类型必须 `Serializable`(基础类型 / String / 其他 `@Serializable`)。

**这是 NotedX 唯一的路由风格**,下面所有代码都基于它。

---

## 三、路由组织:sealed interface 集中管理

```kotlin
@Serializable
sealed interface Route {
    @Serializable
    data object Home : Route

    @Serializable
    data class Detail(val id: Long, val mode: Mode = Mode.View) : Route

    @Serializable
    data object NoteEditor : Route       // 新建模式,不带 id

    @Serializable
    data object Settings : Route

    @Serializable
    data class Search(val initialQuery: String? = null) : Route
}
```

把整个 App 的路由集中在一个 `sealed interface` 下,IDE 自动补全所有目的地,新增路由就加一个子类。

---

## 四、参数传递的范围

类型安全路由能传:

- 基础类型(`Int` / `Long` / `String` / `Boolean` / `Float` / `Double`)
- `@Serializable` 的 data class / object / enum
- 集合(`List<T>` / `Set<T>`)、嵌套

**不能直接传**:

- `Bitmap` / `Parcelable`(老 API 兼容,可能下版本支持)
- 大对象(超过几 KB)

**心智**:路由参数只放"标识 + 简单意图",**不是数据传递通道**。需要传"一个完整的笔记对象",传 `id`,详情屏自己去 Repository 拿。

---

## 五、`hiltViewModel()`:每个目的地一个 ViewModel

```kotlin
composable<Detail> { backStackEntry ->
    val vm: DetailViewModel = hiltViewModel()
    DetailRoute(vm = vm)
}
```

`hiltViewModel()`(来自 `androidx.hilt:hilt-navigation-compose`)做两件事:
1. 用当前 NavBackStackEntry 作为 ViewModelStoreOwner——意味着这个 ViewModel 跟着这个目的地存活,目的地被弹出栈时 ViewModel 自动销毁
2. Hilt 自动注入它的依赖

`DetailViewModel` 通过 `SavedStateHandle` 拿路由参数:

```kotlin
@HiltViewModel
class DetailViewModel @Inject constructor(
    private val savedStateHandle: SavedStateHandle,
    private val repo: NoteRepository,
) : ViewModel() {
    // 路由 Route.Detail 的字段自动出现在 SavedStateHandle 里
    private val args: Detail = savedStateHandle.toRoute<Detail>()
    private val noteId: Long = args.id
    
    val uiState = repo.observeOne(noteId).map { ... }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), ...)
}
```

**`SavedStateHandle.toRoute<T>()`** 是 2.8 给的扩展,把保存的路由参数还原成 data class。比手动一个个 `savedStateHandle["id"]` 安全得多。

---

## 六、共享 ViewModel:NavGraph scope

有时候多个屏幕需要共享同一个 ViewModel(向导流程、表单分步)。把它们包在嵌套 graph 里:

```kotlin
NavHost(...) {
    navigation<Route.Wizard>(startDestination = Route.WizardStep1) {
        composable<Route.WizardStep1> { entry ->
            val parentEntry = remember(entry) { navController.getBackStackEntry<Route.Wizard>() }
            val vm: WizardViewModel = hiltViewModel(parentEntry)
            WizardStep1Route(vm = vm)
        }
        composable<Route.WizardStep2> { entry ->
            val parentEntry = remember(entry) { navController.getBackStackEntry<Route.Wizard>() }
            val vm: WizardViewModel = hiltViewModel(parentEntry)
            WizardStep2Route(vm = vm)
        }
    }
}
```

`getBackStackEntry<Route.Wizard>()` 找到嵌套 graph 的 entry,把它当 ViewModelStoreOwner。两个 step 拿到同一个 `WizardViewModel` 实例。

---

## 七、`popBackStack` / `popUpTo` / `launchSingleTop`

```kotlin
navController.popBackStack()                              // 弹一层
navController.popBackStack(route = Route.Home, inclusive = false)  // 弹到 Home(不包括)
navController.navigate(Route.Login) {
    popUpTo<Route.Home> { inclusive = true }              // 进 Login,把 Home 也弹掉(登录成功后回主屏不能再返回登录页)
    launchSingleTop = true                                 // 如果栈顶已经是 Login 不再压入
}
```

`popUpTo` / `launchSingleTop` 是 NavOptions 配置,用 `navigate(Route) { ... }` 的尾随 lambda 设置。

**经典用例**:

- 登录成功后回主屏,清掉登录页:`popUpTo<Login> { inclusive = true }`
- 底部 Tab 切换不要重复入栈:`launchSingleTop = true`
- 注销返回登录页,清空整个栈:`popUpTo(navController.graph.findStartDestination().id) { inclusive = true }`

---

## 八、底部导航:`NavigationBar` + Navigation 集成

```kotlin
sealed class TopLevelDestination(val route: Route, val icon: ImageVector, val label: String) {
    data object Home : TopLevelDestination(Route.Home, Icons.Default.Home, "首页")
    data object Search : TopLevelDestination(Route.Search(), Icons.Default.Search, "搜索")
    data object Settings : TopLevelDestination(Route.Settings, Icons.Default.Settings, "设置")
}

val topDestinations = listOf(
    TopLevelDestination.Home,
    TopLevelDestination.Search,
    TopLevelDestination.Settings,
)

@Composable
fun NotedXApp() {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = navBackStackEntry?.destination

    Scaffold(
        bottomBar = {
            NavigationBar {
                topDestinations.forEach { dest ->
                    NavigationBarItem(
                        icon = { Icon(dest.icon, contentDescription = null) },
                        label = { Text(dest.label) },
                        selected = currentDestination?.hierarchy?.any {
                            it.hasRoute(dest.route::class)
                        } == true,
                        onClick = {
                            navController.navigate(dest.route) {
                                popUpTo(navController.graph.findStartDestination().id) {
                                    saveState = true
                                }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                    )
                }
            }
        },
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = Route.Home,
            modifier = Modifier.padding(innerPadding),
        ) {
            // ...
        }
    }
}
```

**几个细节**:

- **`destination.hierarchy.any { it.hasRoute(...) }`**——判断当前栈是否在某个 top-level 下(嵌套深也算)
- **`saveState = true` / `restoreState = true`**——Tab 切换时保留每个 Tab 的滚动位置和状态。**不加这两个的 Tab 切换会丢状态,这是体验差距巨大的一点**
- **`launchSingleTop = true`**——同一个 Tab 反复点不会重复入栈

---

## 九、Deep Link:外部链接打开应用

```kotlin
composable<Detail>(
    deepLinks = listOf(navDeepLink<Detail>(basePath = "notedx://detail")),
) { entry ->
    val args: Detail = entry.toRoute()
    DetailRoute(noteId = args.id)
}
```

并在 `AndroidManifest.xml` 给 MainActivity 注册:

```xml
<activity android:name=".MainActivity" ...>
    <intent-filter>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="notedx" android:host="detail" />
    </intent-filter>
</activity>
```

外部触发:

```
adb shell am start -a android.intent.action.VIEW -d "notedx://detail?id=42"
```

应用未启动:启动应用,直接打开 Detail(42),back 一次回到 Home。
应用已运行:在现有栈上 navigate 到 Detail(42)。

**App Links**(https:// 域名,Google 验证过):配置 `assetlinks.json`,用户点浏览器里 https://notedx.app/detail/42 直接进 App。19 篇展开。

---

## 十、Predictive Back Gesture

Android 14+ 起,**返回手势可以预览到上一屏**。Navigation Compose 2.8+ 自动支持——你**什么都不用做**,系统会在用户开始返回手势时把当前 Composable 推开、上一个 Composable 露出来。

需要禁用预测返回的场景(如未保存表单确认对话框):

```kotlin
BackHandler(enabled = hasUnsavedChanges) {
    showDiscardDialog = true
}
```

`BackHandler` 拦截返回事件,enabled=true 时系统返回触发 lambda,**不会真返回**。表单页常见用法。

---

## 十一、嵌套图与模块化

```kotlin
NavHost(navController, startDestination = Route.Home) {
    homeGraph(navController)
    searchGraph(navController)
    settingsGraph(navController)
}

fun NavGraphBuilder.homeGraph(navController: NavController) {
    composable<Route.Home> { HomeRoute(...) }
    composable<Route.Detail> { ... }
    composable<Route.NoteEditor> { ... }
}
```

把路由按功能拆成不同的 `NavGraphBuilder` 扩展函数,每个 feature 模块管自己的 graph。20 篇切多模块后,每个 `:feature-note` 模块自带一个 `noteGraph` 扩展函数。

---

## 十二、跨屏共享数据:Result API

A 屏弹出选择器 → B 屏选完返回 → A 屏拿到结果。Navigation 提供 `currentBackStackEntry.savedStateHandle`:

```kotlin
// A 屏跳到 B,等结果
composable<Route.A> { entry ->
    val result = entry.savedStateHandle.get<String>("picked_id")
    LaunchedEffect(result) {
        if (result != null) {
            // 处理 picked_id
            entry.savedStateHandle.remove<String>("picked_id")
        }
    }
}

// B 屏选完返回 A
composable<Route.B> {
    Button(onClick = {
        navController.previousBackStackEntry?.savedStateHandle?.set("picked_id", "x")
        navController.popBackStack()
    }) { ... }
}
```

`savedStateHandle` 写值 → 返回 → 上一屏读 → 删。这是"返回值"的标准模式,**比 Activity 时代的 `startActivityForResult` 干净一个数量级**。

---

## 十三、完整 NotedX 路由示例

```kotlin
@Serializable
sealed interface Route {
    @Serializable data object Home : Route
    @Serializable data class Detail(val id: Long) : Route
    @Serializable data object NoteEditor : Route        // 新建笔记
    @Serializable data class NoteEditorEdit(val id: Long) : Route  // 编辑现有笔记
    @Serializable data object Settings : Route
    @Serializable data class Search(val initial: String? = null) : Route
}

@Composable
fun NotedXNavHost(navController: NavHostController) {
    NavHost(navController = navController, startDestination = Route.Home) {
        composable<Route.Home> {
            HomeRoute(
                onNoteClick = { id -> navController.navigate(Route.Detail(id)) },
                onEditNote = { id -> navController.navigate(Route.NoteEditorEdit(id)) },
                onNewNote = { navController.navigate(Route.NoteEditor) },
                onSearch = { navController.navigate(Route.Search()) },
                onSettings = { navController.navigate(Route.Settings) },
            )
        }
        composable<Route.Detail> {
            DetailRoute(
                onBack = { navController.popBackStack() },
                onEdit = { id -> navController.navigate(Route.NoteEditorEdit(id)) },
            )
        }
        composable<Route.NoteEditor> {
            NoteEditorRoute(onSaved = { navController.popBackStack() })
        }
        composable<Route.NoteEditorEdit> {
            NoteEditorRoute(onSaved = { navController.popBackStack() })
        }
        composable<Route.Search> {
            SearchRoute(
                onNoteClick = { id -> navController.navigate(Route.Detail(id)) },
                onBack = { navController.popBackStack() },
            )
        }
        composable<Route.Settings> {
            SettingsRoute(onBack = { navController.popBackStack() })
        }
    }
}
```

每个屏幕的 stateful 包装(`HomeRoute` / `DetailRoute` / ...)接收**导航回调**作为参数——而不是直接拿 `navController`。这让屏幕本身可单元测试,导航是宿主的责任。

---

## 十四、踩坑

**坑 1:把 `NavController` 传给非顶层 Composable**。`NavController` 应当只在 `NavHost` 这一层握有,子屏幕通过 callback(`onNoteClick: (Long) -> Unit`)派发导航意图。把 `NavController` 传得到处都是 → 屏幕和导航逻辑耦合 → 单元测试做不起来。

**坑 2:`navigate` 不加 `launchSingleTop`,导致重复入栈**。用户连续点同一个按钮,栈里堆了三个相同屏幕。修:`navigate(Route) { launchSingleTop = true }`。

**坑 3:底部 Tab 切换没 `saveState/restoreState`**。从 Home tab 滚到底,切到 Search,再切回 Home——回到顶部、状态全丢。加上 saveState/restoreState 就保留。

**坑 4:把大对象作为路由参数**。哪怕 `@Serializable` 能传,Backstack entry 序列化也吃不消。**路由只传 ID,详情自己取**。

**坑 5:`popBackStack()` 在 NavHost 启动屏调用**。栈底弹光了,NavHost 显示空白。需要"按返回退出 App"的话用 Activity 的 `finish()`:

```kotlin
BackHandler(enabled = navController.previousBackStackEntry == null) {
    (context as? Activity)?.finish()
}
```

**坑 6:`hiltViewModel()` 在错的 owner 上**。在 NavHost 外面调 `hiltViewModel<DetailViewModel>()` 会用 Activity 作为 owner,意味着 ViewModel 跟 Activity 走、不跟着屏幕销毁——内存泄漏 + 路由参数错位。**永远在 `composable { }` 块里调 `hiltViewModel()`**。

**坑 7:深链 / 通知点击进入应用,但 back stack 不对**。直接 `navigate(Route.Detail(42))` 时,back 一次直接退出 App。修:在打开深链时构造完整栈:
```kotlin
navController.navigate(Route.Detail(42)) {
    // 先确保 Home 在底
    popUpTo<Route.Home>()
}
```

**坑 8:`@Serializable` 字段忘了加导致序列化失败**。Navigation 2.8 用 kotlinx.serialization,所有路由字段必须是可序列化类型。运行时报 `SerializationException`,一查就是某个新加的字段没标 `@Serializable`。

---

下一篇 `12-Hilt 依赖注入.md`,把 NotedX 的依赖图搭起来——`@HiltAndroidApp` / `@HiltViewModel` / `@Module` / `@Provides` / `@Inject` 的全套用法,以及 KSP 编译期生成的工作机制。一个完整 App 没有 DI,所有依赖都要手动 `Repository(api, dao, ...)`,每加一个屏幕都是字段写一长串——DI 是工程化的最低成本工具。
