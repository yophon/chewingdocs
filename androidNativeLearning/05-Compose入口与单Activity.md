# Compose 入口与单 Activity 模型

> 一句话:**整个 App 只有一个 `ComponentActivity`,它调一次 `setContent { App() }`,从此 UI 是一棵 Composable 函数**。这一篇把这棵树的根扎进 Android 进程里。

---

## 一、为什么单 Activity

旧 Android 模型:**一屏一个 `Activity`**。详情屏一个 Activity、设置屏一个 Activity、关于屏一个 Activity——10 个屏幕 10 个 Activity,manifest 一长串,屏幕间用 `Intent` + extras 传数据,共享状态走单例 / `SharedPreferences`。

现代模型:**整个 App 只有一个 Activity**(通常叫 `MainActivity`)。所有屏幕是这个 Activity 的 Composable 子树,用 `NavHost` 切换。

为什么要这么转?三个原因:

1. **数据共享免费**——同一个 Activity 内,屏幕之间共享 ViewModel 不需要 `Intent` 序列化、不需要 `Parcelable`。
2. **生命周期心智从 5 段缩到 1 段**——只有一个 Activity,只有一份 `onCreate` / `onDestroy` 要懂。Composable 自己有"进入组合 / 离开组合"两个事件,远比 Activity 生命周期简单。
3. **过渡动画做得起来**——多 Activity 模型下,屏幕跳转是 Activity 间动画,定制极难;单 Activity + Compose 下,所有过渡都是 Composable 间动画,`SharedTransitionLayout` / `LookaheadScope` 这些高级动画才有发挥空间(09 篇)。

> 反过来,**什么时候才需要第二个 Activity**?答:几乎只在分享意图(`ACTION_SEND`)、外部 deep link、独立流程(支付、扫码)且不能和主流程共享 UI 时。一个产品级 App 通常有 1-3 个 Activity,99% 的功能在主 Activity 里。

---

## 二、`ComponentActivity`,不是 `AppCompatActivity`

Compose 项目用 **`ComponentActivity`** 作为基类,**不是** `AppCompatActivity`。

```kotlin
class MainActivity : ComponentActivity() { ... }
```

`AppCompatActivity` 来自 `androidx.appcompat` 包,主要为了让 XML View 在老 Android 上看起来一致(`AppCompatTextView` 在 API 21 也能显示 Material 主题)。**Compose 应用基本不需要它**——Material 主题来自 `androidx.compose.material3`,不来自 `appcompat`。

`ComponentActivity` 只做必要的事:Lifecycle、ViewModelStore、ActivityResult API 注册、OnBackPressedDispatcher——这些都是 Compose 项目需要的。

去掉 `appcompat` 依赖还能省 APK 体积(几百 KB)。

---

## 三、`setContent { }`:把 UI 树接到 Activity 上

```kotlin
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent {
            NotedXTheme {
                App()
            }
        }
    }
}
```

`setContent { ... }` 是 `androidx.activity:activity-compose` 提供的扩展函数。它做了三件事:

1. 创建一个 `ComposeView`(底层还是个 View),作为 Activity 的根 View。
2. 启动 Compose runtime,把 `{ ... }` 这段 lambda 作为根 Composable。
3. 把 lifecycle / savedStateRegistry / viewModelStore 通过 `CompositionLocal` 注入给整棵树。

**`setContent` 在 Activity 的整个生命周期里只调一次**。屏幕配置变化(旋转、字体变大、深色模式切换),Compose 内部自己会重组——Activity 不会重建(因为有 ViewModel 持有状态)。

---

## 四、Composable 函数到底是什么

```kotlin
@Composable
fun App() {
    Scaffold { inner ->
        Text(text = "NotedX online", modifier = Modifier.padding(inner))
    }
}
```

读法:

- `@Composable` 标注**这是一个可以被 Compose runtime 调用的函数**——只能在另一个 `@Composable` 函数里调用,或通过 `setContent { }` 从外部触发。
- 函数体里调用其他 `@Composable`(`Scaffold` / `Text`),这些子调用**构建出一棵 UI 描述树**——但**不是 View**,是数据结构。
- 函数会被反复调用("重组"),每次调用都生成最新版本的 UI 描述,Compose runtime 跟之前对比,只重绘变化的部分。

**Composable 函数的关键约束**:

1. **必须是幂等的**——同样的输入,任意次调用结果一致。
2. **不能有可观察副作用**——里面不能写日志、不能改全局变量、不能发网络。副作用只能在 `LaunchedEffect` / `DisposableEffect` / `SideEffect` 里(06 篇展开)。
3. **任意线程都能跑**——Compose runtime 可以把它放在主线程也可以放任意工作线程。
4. **顺序可能变化**——Compose 可以重排重组顺序,所以兄弟 Composable 不能假设彼此的调用顺序。

这四条约束是 Compose 性能和正确性的根基。06 / 20 篇会反复回到这里。

**为什么 `Text` / `Scaffold` 大写开头?** Composable 函数的命名约定是**首字母大写**(像类),理由是它"产生 UI",区别于普通函数。这是 Google 的 lint 规则,违反会有黄色警告。

---

## 五、Material 3 主题:`NotedXTheme`

```kotlin
@Composable
fun NotedXTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = true,
    content: @Composable () -> Unit,
) {
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val ctx = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(ctx) else dynamicLightColorScheme(ctx)
        }
        darkTheme -> darkColorScheme(primary = Color(0xFFB7DCFF), ...)
        else -> lightColorScheme(primary = Color(0xFF005AC1), ...)
    }
    MaterialTheme(
        colorScheme = colorScheme,
        typography = NotedXTypography,
        content = content,
    )
}
```

几个关键决策:

- **Dynamic Color**(Material You)——Android 12+ 自动从系统壁纸取色。NotedX 默认开,API 31 以下退化到静态 `lightColorScheme` / `darkColorScheme`。
- **Typography** 单独定义一份 `NotedXTypography`,放在 `ui/theme/Type.kt`。
- **不写 XML themes.xml 颜色**——`themes.xml` 里只保留 `Theme.NotedX` 这个最小骨架(给 status bar / splash 用),业务颜色全在 Compose 里。

`MaterialTheme { content() }` 通过 `CompositionLocal` 把 colorScheme / typography 注入子树,后续任意 Composable 用 `MaterialTheme.colorScheme.primary` 拿到当前值。

---

## 六、edge-to-edge:Android 15 起强制

`enableEdgeToEdge()` 是 `androidx.activity:1.8+` 提供的扩展函数:**让 App 内容延伸到 system bar 下面**,status bar / navigation bar 区域变透明。

```kotlin
override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()        // 必须在 super.onCreate 之前调
    super.onCreate(savedInstanceState)
    setContent { ... }
}
```

API 35(targetSdk 35)起,**edge-to-edge 是强制的**——不开也会被系统强制开,但你的代码可能没准备好处理 system bar 区域,导致 UI 被遮挡。**主动调 `enableEdgeToEdge()` 让代码意图明确,且兼容 API 26-34**。

开了之后,UI 顶部和底部会被 status bar / navigation bar 盖住——必须主动避让。`Scaffold` 是标准答案:

```kotlin
Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
    LazyColumn(
        contentPadding = innerPadding,    // 顶/底/左/右系统栏内边距
    ) { ... }
}
```

**`Scaffold` 自动处理 system bar / IME 内边距**,把它当 `innerPadding` 暴露给内层。`LazyColumn` 用 `contentPadding` 而不是 `padding`——前者把 padding 应用到列表内容,但**滚动时背景仍能延伸到 status bar 下面**(列表项有滑过模糊感),后者会把整个 LazyColumn 限制在系统栏内。

如果不用 `Scaffold`(纯自定义布局),手动取 inset:

```kotlin
Box(modifier = Modifier.windowInsetsPadding(WindowInsets.systemBars)) { ... }
```

---

## 七、`CompositionLocal`:把上下文传给整棵树

Composable 函数之间传参靠参数,但有些东西不想每层都写——主题、Lifecycle、Context、ViewModelStore。这些用 `CompositionLocal` 隐式向下传:

```kotlin
val ctx = LocalContext.current
val lifecycleOwner = LocalLifecycleOwner.current
val view = LocalView.current
val density = LocalDensity.current      // dp ↔ px 转换
```

`Local*.current` 在任意 Composable 里都可读,因为 `setContent { }` 的根部 Compose runtime 注入了一套默认值。

**何时自定义 `CompositionLocal`**?当某个"上下文性"对象需要在子树内任意层级访问,但没有自然的参数传递路径时。**默认应当通过参数传值**,只有当参数链超过 3-4 层、且参数是"跨切面"性质时(主题、配置、用户身份)才考虑用 CompositionLocal。否则它就是"披着 Compose 外衣的全局变量"。

---

## 八、`Scaffold`:Material 标准骨架

```kotlin
Scaffold(
    topBar = {
        TopAppBar(
            title = { Text("NotedX") },
            actions = {
                IconButton(onClick = { ... }) {
                    Icon(Icons.Default.Add, contentDescription = "Add")
                }
            },
        )
    },
    bottomBar = { /* NavigationBar 之类 */ },
    floatingActionButton = {
        FloatingActionButton(onClick = { ... }) {
            Icon(Icons.Default.Edit, contentDescription = "Edit")
        }
    },
    snackbarHost = { SnackbarHost(snackbarHostState) },
    modifier = Modifier.fillMaxSize(),
) { innerPadding ->
    // 主体内容,用 innerPadding 避让 top / bottom bar
    LazyColumn(contentPadding = innerPadding) { ... }
}
```

`Scaffold` 是 Material 3 给的标准容器,处理:

- top bar / bottom bar / FAB / snackbar 位置
- system bar / IME 内边距
- 主题色背景

**新人最常见的错误是把 `innerPadding` 忘了**——结果列表第一项被 top bar 盖住。

---

## 九、`Modifier`:Compose 的"链式样式"

```kotlin
Text(
    text = "Hello",
    modifier = Modifier
        .fillMaxWidth()
        .padding(16.dp)
        .background(Color.Red)
        .clickable { onClick() }
)
```

`Modifier` 是 Compose 里**最重要的一个抽象**(强重复一次:最重要)。它是一条**有序**的修饰链——背景、边距、点击、大小、对齐——按顺序应用。

**顺序敏感**:

```kotlin
Modifier.padding(16.dp).background(Color.Red)   // padding 在外,背景不含 padding 区域
Modifier.background(Color.Red).padding(16.dp)   // 背景在外,padding 也是红色
```

Modifier 的所有方法都返回新的 `Modifier`,这是不可变链式 API,熟悉 Java 8 Stream 的人一秒就懂。

**Modifier 必须用 `modifier: Modifier = Modifier` 作为参数往下传**——这是 Compose API 约定:每个 Composable 的第一个可选参数都是 `modifier`,让调用方可以从外部控制大小 / 位置 / 行为。

08 篇专门讲 Modifier。

---

## 十、第一个完整入口

```kotlin
package com.notedx

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.notedx.ui.theme.NotedXTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent {
            NotedXTheme {
                NotedXApp()
            }
        }
    }
}

@Composable
private fun NotedXApp() {
    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(title = { Text("NotedX") })
        },
        floatingActionButton = {
            FloatingActionButton(onClick = { /* 跳详情 */ }) {
                Icon(Icons.Default.Edit, contentDescription = "New note")
            }
        },
        modifier = Modifier.fillMaxSize(),
    ) { innerPadding ->
        NoteListPlaceholder(modifier = Modifier.padding(innerPadding))
    }
}

@Composable
private fun NoteListPlaceholder(modifier: Modifier = Modifier) {
    Text(text = "暂无笔记", modifier = modifier)
}
```

`NotedXTheme.kt`:

```kotlin
package com.notedx.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext

@Composable
fun NotedXTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = true,
    content: @Composable () -> Unit,
) {
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val ctx = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(ctx) else dynamicLightColorScheme(ctx)
        }
        darkTheme -> darkColorScheme()
        else -> lightColorScheme()
    }
    MaterialTheme(colorScheme = colorScheme, content = content)
}
```

跑 `./gradlew :app:installDebug`,装上后能看到:Material 3 顶栏写着 "NotedX",右下角一个铅笔 FAB,中间显示"暂无笔记"。**没有 `findViewById`、没有 XML 布局、没有 Activity 跳转**——这就是单 Activity Compose 的样子。

---

## 十一、`@Preview`:Android Studio 不开模拟器就能看 UI

```kotlin
@Preview(showBackground = true)
@Composable
private fun NotedXAppPreview() {
    NotedXTheme {
        NotedXApp()
    }
}
```

打开 `MainActivity.kt`,Android Studio 右侧 Preview 面板渲染这个 Composable——**不需要启动模拟器**。这是 Compose 最大的开发体验红利之一,XML View 时代你必须真机跑或用过时的 Layout Editor。

Preview 支持多变体一次预览:

```kotlin
@Preview(name = "Light", uiMode = Configuration.UI_MODE_NIGHT_NO)
@Preview(name = "Dark", uiMode = Configuration.UI_MODE_NIGHT_YES)
@Preview(name = "Large Font", fontScale = 1.5f)
@Composable
private fun NotedXAppPreview() { ... }
```

Preview 不能跑网络 / 数据库——它在 IDE 进程里跑,不带 Android 运行时。所以**Preview 永远应当传假数据**:

```kotlin
@Preview
@Composable
private fun NoteRowPreview() {
    NotedXTheme {
        NoteRow(note = Note(id = 1, title = "Sample", content = "..."))
    }
}
```

为此你需要把 ViewModel 从 Preview 里解耦——10 篇展开。

---

## 十二、踩坑

**坑 1:把 `enableEdgeToEdge()` 写在 `super.onCreate` 之后**。`enableEdgeToEdge()` 改的是 Window flag,必须在 `super.onCreate` 之前调,否则部分场景失效。

**坑 2:`setContent` 调多次**。`setContent` 只应在 `onCreate` 里调一次。重复调没用,只是浪费——Compose runtime 已经在监听状态变化,重组是自动的。

**坑 3:在 Composable 里直接读外部可变变量**。
```kotlin
var counter = 0    // 外部变量
@Composable
fun Bad() {
    counter++          // ❌ 副作用!Compose 不知道 counter 变了
    Text("$counter")
}
```
状态必须用 `remember { mutableStateOf(0) }`(06 篇)。

**坑 4:Composable 函数名小写**。`@Composable fun text() { ... }` 编译能过但 lint 警告。Composable 函数首字母大写是约定,因为它"产生 UI",和 React 组件命名约定一致。

**坑 5:把 Activity 当 ViewModel 用**。`MainActivity` 不应持有业务状态(笔记列表、用户信息)。它的职责只是"宿主 + 入口"。所有状态在 ViewModel 里,10 篇展开。

**坑 6:`Scaffold` 内的内容忽略 `innerPadding`**。
```kotlin
Scaffold { innerPadding ->
    LazyColumn { ... }    // ❌ innerPadding 没用,内容被 top bar 盖住
}
```
必须 `LazyColumn(contentPadding = innerPadding)` 或者 `Modifier.padding(innerPadding)`。

**坑 7:Material 主题在 themes.xml 里写一份、在 Compose 里又写一份**。两套是会冲突的——splash / 状态栏可能用 XML 那份,Compose 内容用 Compose 那份,颜色不一致。**单一来源**:XML themes.xml 只保留 `<style name="Theme.NotedX" parent="Theme.Material3.DayNight.NoActionBar" />` 这种最小骨架,业务颜色只在 Compose `NotedXTheme` 里定义。

---

下一篇 `06-重组、状态与 remember.md`,把 Compose 的灵魂——重组(recomposition)讲透。`remember` / `mutableStateOf` / `derivedStateOf` / `LaunchedEffect` / `DisposableEffect` 各自为什么存在,什么时候用哪个。这一篇没读懂,后面所有 Compose 代码都是抄写。
