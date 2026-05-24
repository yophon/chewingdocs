# 06-Compose 入口与单 Activity

> 一句话导读:`targetSdk = 35` 之后,Android 15 默认让你的 App 全屏到状态栏与导航栏之下;**这不是新特性,是默认行为变化**。如果你没主动处理 `WindowInsets`,顶部时间会盖住 TopAppBar,底部手势条会盖住按钮,IME 弹起会糊住输入框 —— 任何一个都足以让上架审核被拒。本篇第一件事就是讲清楚这件事。

第 05 篇把数据流交付到 Composable 边界。从本篇开始,视角转到"UI 从哪里开始"。在 Compose 时代,这个问题的答案极度简化:**整个 App 通常只有一个 `Activity`,内部一切都是 Composable**。但简化的代价是,过去散落在 XML、`AppCompatActivity`、Fragment、`Window` 中的"边角配置"被压缩成几行 `setContent { ... }` 入口代码,任何一行没写对,问题就放大到全局。

读者画像默认:你写过传统 `AppCompatActivity` + `setContentView(R.layout.activity_main)` + Fragment,被 Android 各版本的 Status Bar / Navigation Bar / Soft Keyboard 折磨过。本篇要让你建立"现代 Compose 入口"的完整心智,并把 Android 15 强制 edge-to-edge 这件事一次性吃透。

## 1. 机制定位

### 旧时代 UI 入口的三种心理负担

**第一种是多 Activity 时代遗民**。每个屏幕一个 `Activity`,Manifest 里几十行 `<activity>` 声明,Intent + Bundle 在屏幕之间传参,旋转屏幕要走 `onSaveInstanceState`,Activity 之间通讯靠 `startActivityForResult`(后被 `ActivityResultContracts` 替代)。这套模型在导航关系复杂时,生命周期回调矩阵会爆炸 —— 两个 Activity 之间的"暂停 / 恢复 / 销毁"顺序与是否透明、是否 singleTask、是否同 Task 都有关。

**第二种是 Fragment 中间态**。Single-Activity + Multi-Fragment 模式在 2015-2020 年是主流,试图用 `FragmentManager` 解决多 Activity 的导航痛点。结果是另一套生命周期(Fragment 自己的 `onAttach` / `onCreateView` / `onViewCreated` / `onDestroyView`)、`ViewModel` 的作用域选择(Activity 还是 Fragment 还是 NavGraph)、`childFragmentManager` 嵌套悬挂。

**第三种是 XML View + `findViewById`**。`activity_main.xml` 写布局,代码里 `findViewById` 取节点,改 UI 要双向更新。后期 DataBinding / ViewBinding 改善了类型安全,但本质仍是"声明式视图 + 命令式更新"的撕裂。

Compose 给出的答案是**用一个 Composable 函数树替代 XML 树,用 `State<T>` 替代 `findViewById + setText`,用单 Activity + Navigation Compose 替代多 Activity / Fragment**。整个 App 的 UI 入口被压缩成:

```kotlin
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()      // ← Android 15 关键
        setContent {
            NotedXTheme {
                NotedXApp()     // 内部是 Navigation + 所有 Composable
            }
        }
    }
}
```

四行代码替代过去几十个 Activity / Fragment 的入口代码。代价是:**这四行的每一行必须写对**,因为后面没有其他地方"补救"。

### Android 15 (API 35) Edge-to-Edge 强制:本篇必须先讲的事

Android 15 把 `targetSdk = 35` 的 App **默认改成 edge-to-edge**,也就是"App 内容延伸到状态栏与导航栏之下"。在 API 34 及之前,如果你不主动调 `WindowCompat.setDecorFitsSystemWindows(window, false)`,系统会自动给 App 预留 status bar 与 navigation bar 的留白。在 API 35,这条默认值翻转了:**App 默认占满整个屏幕,系统栏只是半透明蒙层叠在上面**。

后果有四条:

1. 你写的 TopAppBar 顶边会被状态栏(时间、信号、电量)覆盖。
2. 底部按钮 / FAB 会被导航栏(三大按钮或手势条)覆盖。
3. 软键盘弹起时,内容不会自动上推,输入框会被遮。
4. 横屏在带挖孔屏 / 异形屏的设备上,内容会进入挖孔区。

Google 官方的态度:**这是为了让 App 视觉上现代化,所有 App 都应该处理 `WindowInsets`**。Android 15 文档里这条标记为 "Behavior change that affects all apps targeting Android 15",不是 opt-in。如果你以前写过 `setDecorFitsSystemWindows(window, true)` 期望走旧行为,API 35 上这条 API 被 deprecated,**强行设 true 在某些场景会被忽略**(Google 留了向后兼容的逃生口,但官方明确说后续版本可能完全移除)。

工程上的正确姿势是:**主动接受这个默认,然后用 `WindowInsets` + `Scaffold` 把每个屏幕的内边距处理对**。本篇第 3 节会给出完整代码。

### Activity 仍然存在,但只剩"宿主"职责

Compose 没有"取消" Activity。一个 Compose 应用仍然需要至少一个 `Activity` 作为系统层入口 —— Manifest 里得有 `<activity android:name=".MainActivity">`,Android 进程启动时仍然走 `onCreate` -> `onStart` -> `onResume`。

但 `Activity` 在 Compose 时代的职责被压缩到:

1. 接收 Intent / 处理冷启动深链(由 Navigation Compose 进一步分发);
2. 调用 `enableEdgeToEdge()` 接受 Android 15 默认;
3. `setContent { ... }` 提供 Compose 入口;
4. 把进程级别的 `LocalContext` / `LocalLifecycleOwner` / `LocalConfiguration` 等 `CompositionLocal` 注入到 Compose 树。

剩下的所有 UI 逻辑(导航、参数传递、生命周期感知)都在 Composable 内完成。**这就是"单 Activity"架构的本质 —— 不是只允许一个 Activity,而是让 Activity 退化为系统层薄壳**。

## 2. Android 心智

### `ComponentActivity` 而不是 `AppCompatActivity`

Compose 时代的 Activity 基类是 `androidx.activity.ComponentActivity`,**不是** `AppCompatActivity`。

| 类 | 用途 |
| --- | --- |
| `androidx.activity.ComponentActivity` | Compose 应用标配,内置 `ViewModelStore` / `OnBackPressedDispatcher` / `ActivityResultRegistry` / `SavedStateRegistry` |
| `androidx.appcompat.app.AppCompatActivity` | 兼容旧 Material / Toolbar / Theme.AppCompat,继承自 `ComponentActivity` |
| `android.app.Activity` | 原生 Activity,不带 AndroidX 任何能力 |

`ComponentActivity` 本身就支持 Compose 所需的所有底层基础设施。**新项目应该直接继承 `ComponentActivity`,不再继承 `AppCompatActivity`**。后者依赖 AppCompat 主题(`Theme.AppCompat.*`)与 AppCompat 控件(`androidx.appcompat.widget.Toolbar`),纯 Compose 项目里这些都用不上,反而会引入 5MB+ 的 AppCompat 资源。

### `setContent` 的真实形态

```kotlin
public fun ComponentActivity.setContent(
    parent: CompositionContext? = null,
    content: @Composable () -> Unit
)
```

它做了三件事:

1. 创建或复用一个 `ComposeView` 作为根 View 挂到 Window 上;
2. 启动一个与 Activity 生命周期对齐的 `Recomposer`;
3. 把传入的 `content` lambda 作为 Compose 树的根。

`Recomposer` 在 Activity 进入 `STARTED` 时启动,离开 `STARTED` 时挂起,`DESTROYED` 时清理。这就是 `collectAsStateWithLifecycle`、`LaunchedEffect` 等所有生命周期感知 API 的实现根基。

### `MaterialTheme` 的三件套:Color / Typography / Shapes

```kotlin
@Composable
fun NotedXTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colorScheme = if (darkTheme) darkColorScheme() else lightColorScheme()
    MaterialTheme(
        colorScheme = colorScheme,
        typography = NotedXTypography,
        shapes = NotedXShapes,
        content = content,
    )
}
```

`MaterialTheme` 是 `CompositionLocal` 的提供者,所有 Material 3 组件(`Button`、`Card`、`TextField`、`TopAppBar`)在内部都通过 `MaterialTheme.colorScheme.primary` 等 API 拿到主题。**子树内任何位置都可以用 `MaterialTheme.colorScheme` 读到,不需要参数传递**。

Material 3 与 Material 2 的最大差别是 **dynamic color**(API 31+ 从壁纸生成主题色)。Compose 项目通常在 `NotedXTheme` 里加一个 `if (Build.VERSION.SDK_INT >= 31 && useDynamic) dynamicLightColorScheme(context) else ...` 的开关,把品牌色和系统色统一在一处。

### `Scaffold`:屏幕级骨架

`Scaffold` 是 Material 3 提供的"标准屏幕骨架",内置插槽:

```kotlin
Scaffold(
    topBar = { TopAppBar(title = { Text("Notes") }) },
    bottomBar = { /* NavigationBar */ },
    floatingActionButton = { FloatingActionButton(...) },
    snackbarHost = { SnackbarHost(state) },
) { innerPadding ->
    Column(Modifier.padding(innerPadding)) {
        // 屏幕主内容
    }
}
```

`innerPadding` 这个 `PaddingValues` 是 Scaffold **替你算好的内容区内边距**,包括了 topBar 高度、bottomBar 高度、IME 高度、以及 system bar insets。

**Material 3 的 `Scaffold`(`androidx.compose.material3.Scaffold`)默认就消费 `WindowInsets`**,所以只要你把 `innerPadding` 应用到主内容上,edge-to-edge 下的内容区就正确避开了 system bar 与 IME。这是 Compose 在 Android 15 上能"省心"的核心组件。

### `Modifier`:顺序很重要

`Modifier` 是 Compose 里所有"布局 / 行为 / 装饰"的统一抽象。它的关键性质是**顺序敏感**:

```kotlin
Box(
    Modifier
        .padding(16.dp)         // 外边距
        .background(Color.Red)  // 红色不延伸到 padding 区域
        .padding(8.dp)          // 内边距
        .size(100.dp)           // 内容尺寸
)
```

```kotlin
Box(
    Modifier
        .size(100.dp)           // 内容尺寸
        .padding(8.dp)          // padding 会被 size 截断
        .background(Color.Red)  // 红色覆盖整个 100.dp
        .padding(16.dp)         // 外边距
)
```

两段代码看起来差不多,实际效果完全不同。第 09 篇会专门讲 Modifier 顺序的工程坑,本篇只用"按从外向内的顺序读"这条简化规则。

### `WindowInsets` 体系:本篇的核心

`WindowInsets` 在 Compose 里是一个表示"系统占位区域"的对象:

| Inset | 含义 |
| --- | --- |
| `WindowInsets.statusBars` | 顶部状态栏占用区域 |
| `WindowInsets.navigationBars` | 底部导航栏占用区域 |
| `WindowInsets.ime` | 软键盘占用区域 |
| `WindowInsets.systemBars` | `statusBars + navigationBars` |
| `WindowInsets.safeDrawing` | 系统决定的"安全绘制区"(挖孔屏、刘海屏、圆角) |
| `WindowInsets.safeContent` | `safeDrawing + ime`,推荐给"可滚动内容"用 |
| `WindowInsets.displayCutout` | 单独的挖孔区 |

它们都是 Composable scope 内可读的"动态值",IME 弹起 / 收起、横竖屏切换、折叠屏展开都会即时更新。

工程上的关键操作:

```kotlin
Box(Modifier.windowInsetsPadding(WindowInsets.safeDrawing)) { ... }     // 加 padding 避开
Box(Modifier.consumeWindowInsets(WindowInsets.statusBars)) { ... }      // 声明已经处理,子树不再算
Spacer(Modifier.windowInsetsTopHeight(WindowInsets.statusBars))         // 占位高度
```

`Scaffold` 内部已经做了 `safeDrawing` 的消费,**所以 Scaffold 之内通常不需要再手动算 inset**。需要手动算的场景:不用 Scaffold 的全屏 Composable(启动页、视频播放、全屏拍照)。

## 3. 工程实现

下面给 NotedX 应用的完整入口:`MainActivity`、`enableEdgeToEdge` 调用、`NotedXTheme`、`Scaffold` 内置 inset、IME 与底部按钮的 inset 处理。

**第一步:MainActivity 入口**

文件路径 `app/src/main/java/com/notedx/app/MainActivity.kt`:

```kotlin
package com.notedx.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.core.view.WindowCompat
import com.notedx.app.ui.NotedXApp
import com.notedx.app.ui.theme.NotedXTheme
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        // 必须在 setContent 之前调,API 35 默认行为已经是 edge-to-edge,
        // 但显式调用 enableEdgeToEdge() 保证 API 26-34 也用同一份行为。
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.auto(
                lightScrim = android.graphics.Color.TRANSPARENT,
                darkScrim = android.graphics.Color.TRANSPARENT,
            ),
            navigationBarStyle = SystemBarStyle.auto(
                lightScrim = android.graphics.Color.TRANSPARENT,
                darkScrim = android.graphics.Color.TRANSPARENT,
            ),
        )
        super.onCreate(savedInstanceState)

        setContent {
            NotedXTheme {
                NotedXApp()
            }
        }
    }
}
```

关键决策:

**1. `enableEdgeToEdge()` 必须在 `super.onCreate()` 之前调**。`androidx.activity:activity-ktx:1.9.0+` 提供的扩展,内部做了三件事:`WindowCompat.setDecorFitsSystemWindows(window, false)`、`window.statusBarColor = TRANSPARENT`、`window.navigationBarColor = TRANSPARENT`。

**2. `SystemBarStyle.auto` 是 API 23+ 才能做的"反色蒙层"自适应**。浅色背景下系统栏图标自动反成深色,深色背景下反成浅色。`lightScrim` 与 `darkScrim` 设为 `TRANSPARENT` 是当代设计偏好(完全透明,只靠 App 内容衬底)。如果你的内容会冲到状态栏区域(横向 banner、视频),应该传一个半透明的 scrim 颜色避免文字与状态栏图标重叠。

**3. `@AndroidEntryPoint` 是 Hilt 的入口注解**。第 13 篇会展开,本篇只放占位。

### 第二步:Theme + Scaffold 骨架

```kotlin
// app/src/main/java/com/notedx/app/ui/theme/Theme.kt
@Composable
fun NotedXTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    useDynamicColor: Boolean = true,
    content: @Composable () -> Unit,
) {
    val context = LocalContext.current
    val colorScheme = when {
        useDynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ->
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        darkTheme -> darkColorScheme(primary = Color(0xFF8AB4F8))
        else -> lightColorScheme(primary = Color(0xFF1A73E8))
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = NotedXTypography,
        shapes = NotedXShapes,
        content = content,
    )
}
```

```kotlin
// app/src/main/java/com/notedx/app/ui/NotedXApp.kt
@Composable
fun NotedXApp() {
    val navController = rememberNavController()
    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(
                title = { Text("NotedX") },
                // TopAppBar 默认消费了 statusBars inset,所以不需要再手动加
            )
        },
        bottomBar = { NotedXBottomBar(navController) },
        floatingActionButton = {
            FloatingActionButton(onClick = { /* navigate */ }) {
                Icon(Icons.Default.Add, contentDescription = "add note")
            }
        },
    ) { innerPadding ->
        // innerPadding 已经包含了 topBar / bottomBar / system bars 的所有留白
        NavHost(
            navController = navController,
            startDestination = NotesGraph,
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            notesGraph(navController)
            settingsGraph(navController)
        }
    }
}
```

关键决策:

**1. `innerPadding` 必须应用到主内容**。这是 Scaffold 与 edge-to-edge 协作的唯一接口。漏掉这一行,内容会冲到 TopAppBar 之下;`padding(innerPadding)` 之后,内容区域刚好对齐到 TopAppBar 底部与 BottomBar 顶部之间。

**2. `Scaffold` 不要再嵌套 `Scaffold`**。子屏幕想要自己的 TopBar,应该用 `Column { TopAppBar; rest }`,不是再开一个 Scaffold。多 Scaffold 嵌套的 inset 计算会重复加,留白翻倍。

### 第三步:处理 IME(软键盘)的内边距

输入界面是 edge-to-edge 后最容易翻车的场景。错的写法:

```kotlin
// 错:键盘弹起会盖住 TextField
Column {
    LazyColumn(Modifier.weight(1f)) { ... }
    OutlinedTextField(value = text, onValueChange = { text = it })
}
```

对的写法之一(IME 在 Scaffold 之外手动算):

```kotlin
@Composable
fun ChatLikeScreen(
    messages: List<Message>,
    onSend: (String) -> Unit,
) {
    var input by rememberSaveable { mutableStateOf("") }
    Column(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.ime), // 整列向上让出 IME 高度
    ) {
        LazyColumn(Modifier.weight(1f)) {
            items(messages, key = Message::id) { MessageBubble(it) }
        }
        Row(Modifier.fillMaxWidth().padding(8.dp)) {
            OutlinedTextField(
                value = input,
                onValueChange = { input = it },
                modifier = Modifier.weight(1f),
            )
            IconButton(onClick = { onSend(input); input = "" }) {
                Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "send")
            }
        }
    }
}
```

对的写法之二(在 Activity Manifest 上声明 + Scaffold 内置):

```xml
<!-- AndroidManifest.xml -->
<activity
    android:name=".MainActivity"
    android:windowSoftInputMode="adjustResize">
</activity>
```

`adjustResize` 是关键 —— 让 IME 弹起时 Window 高度自动缩短,Scaffold 的 `innerPadding` 会包含 IME 区域,主内容自然向上让位。这是最省心的做法,但要注意:**`adjustResize` 在 edge-to-edge 下需要配合 `WindowCompat.setDecorFitsSystemWindows(window, false)`(已由 `enableEdgeToEdge` 设)才有正确效果**;旧组合 `adjustNothing` + 手动算 inset 会 Wrong-bar。

第 08 篇会专讲 TextField2 与表单状态,本篇先把 IME inset 这条解决。

### 第四步:启动页 / 全屏 Composable(不用 Scaffold)

```kotlin
@Composable
fun SplashScreen(onReady: () -> Unit) {
    LaunchedEffect(Unit) {
        delay(800)
        onReady()
    }
    Box(
        Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing),
        contentAlignment = Alignment.Center,
    ) {
        Image(
            painter = painterResource(R.drawable.notedx_logo),
            contentDescription = "NotedX",
        )
    }
}
```

`windowInsetsPadding(WindowInsets.safeDrawing)` 把 logo 圈在挖孔屏 / 状态栏 / 导航栏之外的安全区。不写这行,某些异形屏上 logo 会被挖孔遮一角。

**真正全屏的视频 / 拍照场景**反而要主动**不**避让 inset,但要给 UI 按钮单独算:

```kotlin
Box(Modifier.fillMaxSize()) {
    // 视频铺满,包括状态栏导航栏之下
    VideoSurface(Modifier.fillMaxSize())
    // 关闭按钮单独算 inset
    IconButton(
        onClick = { ... },
        modifier = Modifier
            .align(Alignment.TopStart)
            .windowInsetsPadding(WindowInsets.systemBars)
            .padding(8.dp),
    ) {
        Icon(Icons.Default.Close, contentDescription = "close")
    }
}
```

## 4. 调参与验收

### Edge-to-Edge 决策表

| 场景 | 处理 |
| --- | --- |
| 普通业务屏幕 | `Scaffold` 包,`innerPadding` 应用到主内容 |
| 启动页 / 引导页 | 自己用 `Box` + `windowInsetsPadding(safeDrawing)` |
| 视频 / 全屏拍照 | 内容铺满,UI 按钮单独 `windowInsetsPadding(systemBars)` |
| 输入界面 | `Manifest android:windowSoftInputMode="adjustResize"`,Scaffold 自动处理 |
| 自定义 BottomSheet / Dialog | 用 `ModalBottomSheet` / `Dialog`(M3 自带 inset);自己写要手动 `imePadding()` |
| 横屏 / 大屏 | 同样的 `safeDrawing` 不够,加 `displayCutout` |

### 验证 edge-to-edge 是否正确生效的工具

**1. Layout Inspector 截图**。Android Studio 的 Layout Inspector 能显示当前 Compose 树的 bounds 与 inset。看 root Composable 的 bounds,如果它从 (0, 0) 开始到 `displaySize`(包含状态栏与导航栏),说明 edge-to-edge 生效。

**2. 真机或模拟器多设备验证**。至少在以下三类设备分别测一次:

- Pixel 6+(手势导航,挖孔屏)
- 三星 / 小米(三按钮导航 + 状态栏图标)
- 折叠屏(展开 / 折叠时 inset 切换)

**3. 输入法切换**。试 Gboard、搜狗、讯飞,IME 高度不同,验证 `Scaffold` 是否正确响应 `WindowInsets.ime` 变化。

**4. adb 命令**:

```bash
# 强制开/关三按钮导航栏,验证你的 BottomBar 在两种模式下都正确
adb shell settings put secure navigation_mode 0   # 三按钮
adb shell settings put secure navigation_mode 2   # 手势
```

### 验收清单

- [ ] `MainActivity` 继承 `ComponentActivity`,**不是** `AppCompatActivity`。
- [ ] `enableEdgeToEdge()` 在 `super.onCreate()` 之前调,**没有** `setDecorFitsSystemWindows(window, true)` 的残留。
- [ ] 所有屏幕用 `Scaffold` 包,主内容应用了 `innerPadding`。
- [ ] 状态栏图标在浅色背景下是深色,深色背景下是浅色(`SystemBarStyle.auto` 验证)。
- [ ] 软键盘弹起时,输入框上推,**不被键盘遮住**。
- [ ] 在挖孔屏设备(Pixel 6 Pro 模拟器)上,内容不进入挖孔区(`safeDrawing` 生效)。
- [ ] 在三按钮导航与手势导航两种模式下,底部 FAB / BottomBar 都正确避让导航区。
- [ ] **没有任何** `setContentView(R.layout.*)` 调用(说明已经全 Compose 化)。

## 5. 踩坑

**坑 1:`enableEdgeToEdge()` 调在 `super.onCreate()` 之后无效**

```kotlin
override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    enableEdgeToEdge()  // ← 太晚了,Window 已经按默认主题装配
    setContent { ... }
}
```

`super.onCreate()` 会按 Manifest 的 theme 完成 Window 装配,之后再改 `decorFitsSystemWindows` 会出现"内容已经按预留 inset 布局"的混合态。**必须调在 super.onCreate() 之前**,API 文档明确写了这一点。

**坑 2:Theme XML 里写 `windowTranslucentStatus="true"` / `windowTranslucentNavigation="true"`**

老教程教过这两个属性,在 edge-to-edge 默认开启的 API 35 上是冗余且错误的 —— 它们设置的是"半透明 + 内容延伸",而 `enableEdgeToEdge` 已经做了"完全透明 + 内容延伸"。两者叠加在某些机型会出现一层奇怪的灰底。**API 35 项目的 themes.xml 不应该有这两个属性**。

**坑 3:Scaffold 内的内容忘了 `padding(innerPadding)`**

```kotlin
Scaffold(topBar = { TopAppBar(title = { Text("X") }) }) { _ ->
    LazyColumn { ... }   // ← _ 丢掉了 innerPadding
}
```

最常见的"为什么 TopAppBar 盖住内容第一行"。永远不要丢 innerPadding。

**坑 4:`Modifier.systemBarsPadding()` 在 Material 3 Scaffold 内重复加 inset**

```kotlin
Scaffold { padding ->
    Box(Modifier.padding(padding).systemBarsPadding()) { ... }  // 重复
}
```

Scaffold 已经包了 system bars,再加一遍会出现"双倍状态栏留白"。`systemBarsPadding` 适合**不**用 Scaffold 的全屏场景。

**坑 5:横屏时挖孔屏内容被吞**

仅写 `safeDrawing` 不够,某些横屏挖孔屏设备需要单独叠 `displayCutout`:

```kotlin
Box(Modifier.windowInsetsPadding(WindowInsets.safeDrawing.union(WindowInsets.displayCutout))) { ... }
```

或者更简单:用 `WindowInsets.safeContent`,它已经合并了 ime + safeDrawing + displayCutout。

**坑 6:`adjustPan` 仍是默认值,但与 edge-to-edge 冲突**

老项目 Manifest 里如果有 `android:windowSoftInputMode="adjustPan"`,IME 弹起时会"整个 Window 上推",**不是**缩短 Window 高度。在 edge-to-edge 下,上推后顶部空出来的区域会露出黑色,体验崩坏。**纯 Compose 项目用 `adjustResize`**。

**坑 7:`LocalDensity` 与硬编码 px**

```kotlin
val px = 16   // ← 像素
Modifier.padding(px.dp)  // ← 这里是 dp,不是 px
```

Compose 里所有尺寸 API 都接受 `Dp`,不接受 `Int` 像素。这是 Compose 设计上的好事(不会再误把 px 当 dp 写),但要适应。`16.dp` 表示 "16 density-independent pixels",在不同密度的设备上换算成不同 px。

**坑 8:`isSystemInDarkTheme()` 与 dynamic color 不一致**

```kotlin
val darkTheme = isSystemInDarkTheme()
val colors = dynamicLightColorScheme(context)   // ← 写死了 light
```

dynamic color 也要按 darkTheme 选,不然系统切到深色后 App 仍然是浅色。修法:

```kotlin
val colors = if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
```

**坑 9:`@Preview` 里看不到 system bars,容易低估问题**

Android Studio 的 `@Preview` 默认渲染一个矩形画布,**没有 status bar / navigation bar**。所以一个 Preview 里看着正常的屏幕,装到设备上立刻被状态栏遮。建议:加 `@Preview(showSystemUi = true)` 强制画系统 UI;CI 里跑 Compose Test 时用 `setContent` + Robolectric / Compose UI Test。

**坑 10:`Modifier.imePadding()` 与 `WindowInsets.ime` 的关系**

`Modifier.imePadding()` 是 `Modifier.windowInsetsPadding(WindowInsets.ime)` 的简写,效果一样。但 `imePadding` 经常和 Scaffold 嵌套时引起重复:Scaffold 已经在 `innerPadding` 里算了 ime(配合 `adjustResize`),子内容再 `imePadding()` 会让位双倍。规则:**Scaffold 内只用 `innerPadding`,不再单独 `imePadding`**。

**坑 11:`AppCompatActivity` + Compose 的临时兼容,迁移期容易混乱**

```kotlin
class MainActivity : AppCompatActivity() {  // ← 老项目还没换
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent { ... }                  // 也能跑
    }
}
```

`enableEdgeToEdge` 与 `setContent` 在 `AppCompatActivity` 上也能用,但 AppCompat 主题(`Theme.AppCompat.*`)与 `MaterialTheme` 的颜色体系会冲突 —— 比如 status bar 颜色可能被 AppCompat 主题强制覆盖。新项目应该直接 `ComponentActivity` + `Theme.Material3.Light.NoActionBar`,避免双套主题打架。

**坑 12:同一个 NavHost 在多个 Composable 实例化**

```kotlin
@Composable
fun ScreenA() {
    val navController = rememberNavController()  // ← A 自己的
    NavHost(navController, startDestination = ...)
}

@Composable
fun ScreenB() {
    val navController = rememberNavController()  // ← B 自己的,独立 backstack
    NavHost(navController, startDestination = ...)
}
```

NavHost 是有状态的,**整个 App 应该只有一个顶层 NavHost**。多个 NavHost 适合"嵌套导航"(tab 内独立栈),但要明白每个有独立的 backstack。第 12 篇会详细讲。

**坑 13:`CompositionLocalProvider` 提供的值在 `Scaffold` 之外才生效?**

`CompositionLocalProvider` 提供的值在它的子树内有效,Scaffold 内的 topBar / bottomBar / content slot 都是子树。但有一个细节:Scaffold 内部用了 `SubcomposeLayout`,所以 `LocalDensity` / `LocalContext` 是正确传递的,但**与 measurement 强绑定的状态(比如 `MutableState<Int>` 的实时更新)在 subcompose slot 内可能延迟一帧**。这属于第 22 篇的性能话题,本篇先打住。

**坑 14:`MaterialTheme.colorScheme.background` vs Activity Window 背景**

App 启动到 setContent 之间,Window 仍然显示主题的 `windowBackground`。如果主题 `windowBackground` 是白色,而你的 Compose 在 dark 主题下,启动会闪一下白屏。解决方法:`themes.xml` 里 `<item name="android:windowBackground">@android:color/transparent</item>`,配合 SplashScreen API(第 25 篇主题)避免闪屏。

---

`ComponentActivity` + `setContent` + `MaterialTheme` + `Scaffold` 这四件套构成了 Compose 时代的 UI 入口最小集合。Android 15 默认 edge-to-edge 不是可选项,而是基线;把 `enableEdgeToEdge()` + `Scaffold(innerPadding)` + `adjustResize` 三件事内化,后面 30 个屏幕都不必再为 system bars / IME 折腾。下一篇切到"屏幕内部",讲清 Compose 重组与状态心智 —— `State<T>`、`remember`、`derivedStateOf`,以及 Compose 1.7 Strong Skipping 给项目带来的连锁影响。

## 手动验证

- [ ] 在 Pixel 6 Pro 模拟器(挖孔屏)和三星 S22 模拟器(无挖孔)分别启动 App,顶部时间、信号、电量都**清晰可见**,不被 TopAppBar 内容覆盖。
- [ ] 在手势导航模式下,底部 BottomBar 完整可见,手势条不与按钮重叠;切到三按钮模式,导航栏不挡 BottomBar。
- [ ] 打开一个含 `OutlinedTextField` 的屏幕,点击输入框,IME 弹起,**输入框完整可见**,不被遮。
- [ ] 临时把 `enableEdgeToEdge()` 注释掉,运行,顶部 TopAppBar **应该正常**(API 35 默认 edge-to-edge),但状态栏图标可能颜色不对(没有 SystemBarStyle.auto);重新加上,验证图标自动反色。
- [ ] 把 `padding(innerPadding)` 故意删掉,运行,TopAppBar 会盖住主内容第一行。再加回去验证修复。
- [ ] 横屏一次,在带挖孔屏的模拟器上观察,内容不进挖孔区。
- [ ] `adb shell settings put secure navigation_mode 0`(三按钮)与 `2`(手势)切换,BottomBar 与 FAB 在两种模式都正确避让。

---

**下一篇:** `07-重组、状态与remember.md`,把"屏幕入口"延伸到"屏幕内部状态",讲清 Compose 1.7 Strong Skipping 默认开启后的重组心智与 `@Stable` 注解的工程意义。
