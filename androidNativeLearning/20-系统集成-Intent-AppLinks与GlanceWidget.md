# 20-系统集成:Intent、App Links 与 Glance Widget

> 一句话导读:Android 系统集成的三大现代抓手——Intent + Activity Result API、App Links 域名验签、Glance 写桌面小部件——本质上都是"让你的 App 在系统进程里有一个可发现、可被信任、可被持续展示的入口"。

第 19 篇([[androidNativeLearning 19]])覆盖了相机与媒体输入。20 篇把目光从"App 内部"挪到"App 与系统的边界":NotedX 这款笔记应用要能被系统分享面板调用接收他人分享的文本、能让浏览器点击 `https://notedx.app/note/123` 直接打开对应笔记、能在桌面挂一个 Glance Widget 实时显示今日待办。这三件事在 Android 7 / 8 时代要写一堆 XML intent-filter、要在 Manifest 里塞一堆 `<data>` 子节点,还要担心 Notification Trampoline、`getIntent()` 在 `onCreate` / `onNewIntent` 各调一次等历史包袱。Android 12+ Activity Result API 普及、Android 13+ Per-App Language 与 Predictive Back、Android 14 Glance 1.0 GA 之后,这套体系才真正变得"现代 Android 友好"。

本篇要解决的核心问题:

- 旧 `startActivityForResult` 的回调模型为什么必须被 `ActivityResultContracts` 替代?Compose 里怎么 `rememberLauncherForActivityResult`?
- `Intent.ACTION_VIEW` 与 `Intent.ACTION_SEND` 在 Manifest 与代码两侧分别怎么声明 / 处理?
- App Links 的域名验签(Digital Asset Links / `assetlinks.json`)在 2026 年是上架前置条件吗?浏览器为什么不打开你的 App?
- Glance 是怎么把 Compose 心智复用到 `RemoteViews` 上的?它和传统 `AppWidgetProvider` 的边界在哪?
- Glance 不能干什么——动画、滚动列表、Compose Modifier 一一比对。

读完后,你应当能在 NotedX 主线里加上"分享文本到 NotedX 自动新建笔记"、"`https://notedx.app/note/123` 深链跳详情页"、"桌面挂今日待办 Widget" 三个能力,且都是 Android 13-15 现代正确做法。Share Sheet 在 Intent 段一笔带过,Quick Settings Tile 因为收益低不写,`MediaProjection` 录屏在末尾延伸 1-2 段。

## 1. 机制定位

### Intent 与 Activity Result API

Intent 是 Android 的"跨进程动作描述符"。它包含 action(动作名)、data(URI)、type(MIME)、extras(键值)、flags(行为标志)。系统的 PackageManager 维护着一张全局表——所有已安装 App 在 Manifest 里声明的 `intent-filter` 都在里面——`startActivity(intent)` 时根据 action + data + category 匹配能处理的 Activity 列表,弹 Chooser 或直接拉起唯一匹配。

旧 API `startActivityForResult` + `onActivityResult` 有几个无解的痛点:

- **状态丢失**:Activity 被回收重建后,旧的 requestCode 与回调对不上。
- **类型不安全**:回调里只能拿到 `Intent`,要自己 `getStringExtra` / `getParcelableExtra`,类型靠注释维护。
- **嵌套地狱**:Activity 里要发多种请求,`onActivityResult` 里 `switch(requestCode)` 一长串。
- **不可 Compose**:Compose 是函数式 / 单向数据流,把 Activity 级回调塞进去要拐 `LocalContext` + cast,丑且易错。

`ActivityResultContracts` 在 Activity 1.2(2020 年)引入,每个 Contract 是一个对象,知道自己输入什么、输出什么。`ActivityResultLauncher.launch(input)` + `ActivityResultCallback<O>` 拿到强类型结果,生命周期由 `ActivityResultRegistry` 持有,跨重建自动续上。Compose 1.0 起就有 `rememberLauncherForActivityResult`,直接把这套搬进 `@Composable`。

> 旧 `startActivityForResult` 在 AndroidX `ComponentActivity` 里被标记 `@Deprecated`,新代码**绝不**再用。

### App Links 域名验签

URI 深链有两层:

- **Custom Scheme**(`notedx://note/123`):任何 App 都能声明,无验证,容易被恶意 App 抢注。Android 12+ 浏览器**不会**直接跳转 custom scheme,要么提示用户、要么完全忽略。
- **HTTP(S) App Links**:用 `https://notedx.app/note/123` 这样的真实 URL 作为深链。要让浏览器点击直接进 App,必须做 **Digital Asset Links** 验签——服务器在 `https://notedx.app/.well-known/assetlinks.json` 公开声明"我授权这个签名指纹的 App 处理我域名下的 URL"。

`assetlinks.json` 是一个 JSON 数组,每项形如:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.example.notedx",
    "sha256_cert_fingerprints": [
      "FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:33:2A:A1:CA:54:73:7E"
    ]
  }
}]
```

Android 安装 / 更新时,PackageManager 会在后台请求所有 `autoVerify="true"` 的域名,拉回 JSON 校验。校验通过,系统记一个"已验证 App Link"标志位,浏览器跳此域名直接拉 App,不弹 disambiguator。校验失败,Android 12+ 会**永久禁用**该 App 的 App Links 自动跳转,且默认不再重试——只能用户手动到设置里点"打开支持的链接"。

这件事在 2026 年是上架前置条件,但**不是 Play Store 强制审核项**。它是用户体验的实质差异:做了,从微信 / Chrome 点链接秒进 App;没做,跳一个浏览器还要让用户选"哪个 App 打开"。NotedX 这种笔记类必须做。

### Glance 与桌面 Widget

Android 桌面 Widget 自 1.5 就有,实现机制是 `RemoteViews` —— App 把"要画什么 UI"序列化成命令,Launcher 进程反序列化后在自己的进程里渲染。这意味着:

- Widget 的 UI **不在 App 进程里运行**,你的 Compose / Activity / ViewModel 全部不可用。
- 可用的控件极其有限:`TextView` / `ImageView` / `LinearLayout` / `FrameLayout` / `ListView`(限制版本)等十几个。
- 交互只能走 `PendingIntent`,点击触发跨进程 Intent。
- 更新通过 `AppWidgetManager.updateAppWidget` 推送新 `RemoteViews`,频率受限于 `updatePeriodMillis`(最低 30 分钟)或用 WorkManager 主动 push。

Glance(`androidx.glance:glance-appwidget`)是 Jetpack 在 2022 起做的 Compose 风格 DSL,1.0 在 2023 stable,1.1 在 2024 增加新 Modifier 与 Material 3 风格集成。它的工作方式:

```
@Composable Glance UI  ->  Glance Runtime  ->  RemoteViews  ->  Launcher 渲染
```

你写的看起来是 Compose(`@GlanceComposable`),实际编译后由 Glance Runtime 翻译成 `RemoteViews`。能用的 API 是 Compose 心智 + Widget 能力的交集:不能用 `Modifier`(改用 `GlanceModifier`),不能用普通 `Text`(改用 `androidx.glance.text.Text`),不能跑动画(`RemoteViews` 不支持),但可以用 `Image` / `Row` / `Column` / `LazyColumn` / 状态 / `getAppWidgetState`。

> Glance **不是 Compose 在 Widget 里的真实运行时**,而是 Compose-style DSL 编译到 RemoteViews 的中间层。理解这一点才不会期待"Widget 里能做 Compose 动画"。

## 2. Android 心智

### Activity Result API 类层级

```
ActivityResultContract<I, O>   -> 输入 I,输出 O,持有 Intent 创建与结果解析逻辑
   ├── ActivityResultContracts.StartActivityForResult     -> 通用,I=Intent, O=ActivityResult
   ├── ActivityResultContracts.RequestPermission           -> I=String, O=Boolean
   ├── ActivityResultContracts.RequestMultiplePermissions  -> I=Array<String>, O=Map<String,Boolean>
   ├── ActivityResultContracts.PickVisualMedia             -> I=PickVisualMediaRequest, O=Uri?
   ├── ActivityResultContracts.PickMultipleVisualMedia     -> I=PickVisualMediaRequest, O=List<Uri>
   ├── ActivityResultContracts.CaptureVideo                -> I=Uri, O=Boolean
   ├── ActivityResultContracts.CreateDocument              -> I=String, O=Uri?
   └── 自定义:继承 ActivityResultContract,实现 createIntent + parseResult

ActivityResultLauncher<I>      -> launch(input)
ActivityResultCallback<O>      -> onActivityResult(result: O)
ActivityResultRegistry         -> 持有所有 launcher,跨重建恢复
```

在 Compose 里只用一个入口:

```
@Composable
fun <I, O> rememberLauncherForActivityResult(
    contract: ActivityResultContract<I, O>,
    onResult: (O) -> Unit
): ManagedActivityResultLauncher<I, O>
```

### Intent-filter 与 App Link 验签关系

```
AndroidManifest 声明
   <activity ... android:exported="true">
     <intent-filter android:autoVerify="true">       <- 关键:声明要做验签
       <action android:name="android.intent.action.VIEW" />
       <category android:name="android.intent.category.DEFAULT" />
       <category android:name="android.intent.category.BROWSABLE" />
       <data
         android:scheme="https"
         android:host="notedx.app"
         android:pathPrefix="/note/" />
     </intent-filter>
   </activity>

服务器 https://notedx.app/.well-known/assetlinks.json
   返回 [{ relation, target.package_name, sha256_cert_fingerprints }]

PackageManager 后台验证
   验证通过 -> verifiedDomains 包含 notedx.app -> 浏览器直接拉 App
   验证失败 -> autoVerify 永久关闭 -> 用户手动在设置里启用
```

`autoVerify="true"` 必须在所有 https 域名的 intent-filter 上都写。一个 App 可以有多个 `intent-filter`(http / https / custom scheme),App Link 验签只对 http(s) 生效,custom scheme 永远不验签。

### Glance UI 树与状态

Glance App Widget 的运行时长这样:

```
AppWidgetManager 调度
       |
       v
GlanceAppWidgetReceiver (BroadcastReceiver,继承 GlanceAppWidgetReceiver)
       |
       v
GlanceAppWidget.provideGlance(context, id)
       |
   @Composable Content()   <-- 这里写 Glance 风格 UI
       |
       v
Glance Runtime -> RemoteViews
       |
       v
Launcher 进程 渲染
```

状态用 `GlanceStateDefinition`(默认 `PreferencesGlanceStateDefinition`),实质是 DataStore Preferences 持久化。读 / 写要在协程里,Glance 提供 `updateAppWidgetState` 修改后调用 `update()` 重新渲染。点击交互用 `actionStartActivity<Activity>()` / `actionRunCallback<Callback>()`,前者跳 Activity,后者执行一个 `ActionCallback`(挂起函数),适合做"勾选待办"这种 in-place 更新。

### Compose vs Glance API 对照

| Compose | Glance | 备注 |
| --- | --- | --- |
| `androidx.compose.material3.Text` | `androidx.glance.text.Text` | Glance Text 不支持 `selectable`、不支持复合 AnnotatedString 富文本 |
| `Modifier` | `GlanceModifier` | 顺序语义一致,但 Modifier 数量远少 |
| `Column` / `Row` / `Box` | 同名,但 in `androidx.glance.layout` | API 接近,缺 `Spacer` 替代品 |
| `LazyColumn` | `LazyColumn`(`androidx.glance.appwidget.lazy`) | 只支持有限 item 数(通常 < 100),不支持 `key` |
| `Image` | `Image(provider = ImageProvider(R.drawable.x))` | 只能用 `ImageProvider` 包装,不能直接传 Bitmap(可用 `ImageProvider(bitmap)`) |
| `Modifier.clickable` | `GlanceModifier.clickable(action = actionStartActivity<X>())` | 必须返回 Action,不能传 lambda |
| `animate*AsState` | 无 | RemoteViews 不支持动画,只能换帧 |
| `remember { mutableStateOf() }` | 无 | 状态走 `GlanceStateDefinition` 持久化,Widget 重组不保留瞬时态 |

## 3. 工程实现

### 1) 项目依赖

```kotlin
// gradle/libs.versions.toml(节选)
[versions]
activityCompose = "1.9.3"
glance = "1.1.1"

[libraries]
androidx-activity-compose       = { module = "androidx.activity:activity-compose", version.ref = "activityCompose" }
androidx-glance-appwidget       = { module = "androidx.glance:glance-appwidget",   version.ref = "glance" }
androidx-glance-material3       = { module = "androidx.glance:glance-material3",   version.ref = "glance" }
```

```kotlin
// app/build.gradle.kts(节选)
dependencies {
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.glance.appwidget)
    implementation(libs.androidx.glance.material3)
}
```

### 2) Activity Result API 通用封装

NotedX 的"分享文本进来新建笔记"流程,需要在 `MainActivity` 接收 `ACTION_SEND`,但很多场景是反向——主动跳系统设置、跳浏览器。封装一个 Compose 友好的 helper:

```kotlin
package com.example.notedx.intent

import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalContext

@Composable
fun rememberOpenUrl(): (String) -> Unit {
    val context = LocalContext.current
    val launcher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) { /* 浏览器返回无需处理 */ }
    return { url ->
        val intent = Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url)).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        runCatching { launcher.launch(intent) }
            .onFailure { context.toast("没有可用浏览器") }
    }
}

@Composable
fun rememberShareText(): (String) -> Unit {
    val launcher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) { }
    return { content ->
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, content)
        }
        launcher.launch(Intent.createChooser(send, null))
    }
}

private fun android.content.Context.toast(msg: String) =
    android.widget.Toast.makeText(this, msg, android.widget.Toast.LENGTH_SHORT).show()
```

`Intent.createChooser(send, null)` 是 Share Sheet 的入口。Android 13+ 加了 Direct Share Target,可以通过 `<service android:name=".SharingShortcutsService">` 在 Share Sheet 顶部显示"分享给最近联系人"——这是 Share Sheet 的延伸能力,本系列不展开,知道入口即可。

### 3) App Links 接收与解析

NotedX 的笔记详情页支持 `https://notedx.app/note/{noteId}` 深链。`MainActivity` 是单 Activity 模型(参考第 12 篇 [[androidNativeLearning 12]]),所有路由由 Navigation Compose 解析:

```xml
<!-- AndroidManifest.xml -->
<activity
    android:name=".MainActivity"
    android:exported="true"
    android:launchMode="singleTop">

    <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
    </intent-filter>

    <!-- 接收 ACTION_SEND 文本分享 -->
    <intent-filter>
        <action android:name="android.intent.action.SEND" />
        <category android:name="android.intent.category.DEFAULT" />
        <data android:mimeType="text/plain" />
    </intent-filter>

    <!-- App Links:https://notedx.app/note/{id} -->
    <intent-filter android:autoVerify="true">
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="https" />
        <data android:scheme="http" />
        <data android:host="notedx.app" />
        <data android:pathPrefix="/note/" />
    </intent-filter>
</activity>
```

Kotlin 侧统一接收(Compose Navigation 2.8+ 类型安全路由,参考第 12 篇):

```kotlin
package com.example.notedx

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.*
import androidx.navigation.compose.rememberNavController
import com.example.notedx.nav.NotedXNavGraph
import com.example.notedx.nav.Route

class MainActivity : ComponentActivity() {

    private val incomingIntent = mutableStateOf<Intent?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        incomingIntent.value = intent
        setContent {
            val navController = rememberNavController()
            NotedXNavGraph(navController = navController)
            LaunchedEffect(incomingIntent.value) {
                val i = incomingIntent.value ?: return@LaunchedEffect
                handle(i, onNavigate = { route -> navController.navigate(route) })
                incomingIntent.value = null
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        // singleTop 模式下,App 在前台被 deeplink 拉起会走这里,不走 onCreate
        incomingIntent.value = intent
    }

    private fun handle(intent: Intent, onNavigate: (Route) -> Unit) {
        when (intent.action) {
            Intent.ACTION_SEND -> {
                val text = intent.getStringExtra(Intent.EXTRA_TEXT).orEmpty()
                if (text.isNotBlank()) onNavigate(Route.NoteEditor(initialText = text))
            }
            Intent.ACTION_VIEW -> {
                val data = intent.data ?: return
                val noteId = data.lastPathSegment ?: return
                onNavigate(Route.NoteDetail(id = noteId))
            }
        }
    }
}
```

`launchMode="singleTop"` 不是 `singleTask`——前者保留导航返回栈,适合 App 内多任务;`singleTask` 会清栈,跳深链会丢失"返回上一笔记"的能力,**深链场景默认用 `singleTop`**。`onNewIntent` 与 `onCreate` 两路要分别处理,这是 deep link 调试时最容易遗漏的细节。

### 4) `assetlinks.json` 部署

服务端把以下文件部署到 `https://notedx.app/.well-known/assetlinks.json`,**必须** `Content-Type: application/json`,**不能**重定向(Android 12+ 不跟随 301/302):

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.example.notedx",
      "sha256_cert_fingerprints": [
        "FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:33:2A:A1:CA:54:73:7E"
      ]
    }
  }
]
```

SHA-256 指纹从 Play Console 的"应用完整性"页拿——**不要**用本地 debug keystore 的指纹,Play 上签的包用的是 Play App Signing 给的"应用签名密钥"。一个域名可以列多个指纹(debug + release 同时支持)。

调试命令:

```
# 触发 PackageManager 立即重新验证
adb shell pm verify-app-links --re-verify com.example.notedx
adb shell pm get-app-links com.example.notedx
# 输出 Domain verification state: verified  即通过
```

`get-app-links` 输出 `legacy_failure` 或 `none` 时,逐一检查:`assetlinks.json` 是否可被 HTTPS 公网访问、SHA-256 是否大写带冒号(必须)、Manifest 的 `host` 与 JSON 完全一致、`autoVerify="true"` 是否漏掉。

### 5) Glance Widget:今日待办

`GlanceAppWidget` 是 Widget 的核心抽象,生命周期由 Glance Runtime 管理:

```kotlin
package com.example.notedx.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.action.actionStartActivity
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.lazy.LazyColumn
import androidx.glance.appwidget.lazy.items
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.*
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import com.example.notedx.MainActivity
import com.example.notedx.R

class TodoGlanceWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val todos = TodoWidgetRepo.load(context)  // suspend 函数,DataStore 读
        provideContent {
            TodoWidgetContent(todos = todos)
        }
    }

    @Composable
    private fun TodoWidgetContent(todos: List<TodoItem>) {
        Column(
            modifier = GlanceModifier
                .fillMaxSize()
                .background(ColorProvider(android.graphics.Color.parseColor("#1F1F1F")))
                .padding(12.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Image(
                    provider = ImageProvider(R.drawable.ic_notedx_logo),
                    contentDescription = null,
                    modifier = GlanceModifier.size(20.dp)
                )
                Spacer(modifier = GlanceModifier.width(8.dp))
                Text(
                    text = "今日待办",
                    style = TextStyle(
                        color = ColorProvider(android.graphics.Color.WHITE),
                        fontWeight = FontWeight.Bold
                    ),
                    modifier = GlanceModifier.defaultWeight()
                )
                Text(
                    text = "${todos.count { !it.done }}/${todos.size}",
                    style = TextStyle(
                        color = ColorProvider(android.graphics.Color.LTGRAY)
                    )
                )
            }
            Spacer(modifier = GlanceModifier.height(8.dp))
            if (todos.isEmpty()) {
                Text(
                    text = "今天没有待办",
                    modifier = GlanceModifier
                        .fillMaxWidth()
                        .clickable(actionStartActivity<MainActivity>()),
                    style = TextStyle(color = ColorProvider(android.graphics.Color.GRAY))
                )
            } else {
                LazyColumn(modifier = GlanceModifier.fillMaxSize()) {
                    items(items = todos, itemId = { it.id.hashCode().toLong() }) { todo ->
                        TodoRow(todo)
                    }
                }
            }
        }
    }

    @Composable
    private fun TodoRow(todo: TodoItem) {
        Row(
            modifier = GlanceModifier
                .fillMaxWidth()
                .padding(vertical = 4.dp)
                .clickable(
                    actionRunCallback<ToggleTodoAction>(
                        parameters = androidx.glance.action.actionParametersOf(
                            ToggleTodoAction.KeyId to todo.id
                        )
                    )
                ),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Image(
                provider = ImageProvider(
                    if (todo.done) R.drawable.ic_check_filled
                    else R.drawable.ic_check_empty
                ),
                contentDescription = null,
                modifier = GlanceModifier.size(18.dp)
            )
            Spacer(modifier = GlanceModifier.width(8.dp))
            Text(
                text = todo.title,
                style = TextStyle(
                    color = ColorProvider(
                        if (todo.done) android.graphics.Color.GRAY
                        else android.graphics.Color.WHITE
                    )
                )
            )
        }
    }
}

class TodoGlanceWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget get() = TodoGlanceWidget()
}
```

勾选待办的 Action(in-place 更新,不跳 Activity):

```kotlin
package com.example.notedx.widget

import android.content.Context
import androidx.glance.GlanceId
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.appwidget.action.ActionCallback

class ToggleTodoAction : ActionCallback {

    companion object {
        val KeyId = ActionParameters.Key<String>("todo_id")
    }

    override suspend fun onAction(
        context: Context,
        glanceId: GlanceId,
        parameters: ActionParameters,
    ) {
        val id = parameters[KeyId] ?: return
        TodoWidgetRepo.toggle(context, id)
        TodoGlanceWidget().update(context, glanceId)
    }
}
```

`TodoGlanceWidget().update(context, glanceId)` 会触发新一次 `provideGlance`,重新 `provideContent`,Glance Runtime 把新 UI 翻译成 `RemoteViews` 推给 Launcher。这一次端到端 100-300 ms,Widget 上肉眼可见的刷新。

### 6) Widget 元数据与注册

```xml
<!-- res/xml/todo_widget_info.xml -->
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="180dp"
    android:minHeight="180dp"
    android:targetCellWidth="3"
    android:targetCellHeight="3"
    android:updatePeriodMillis="0"
    android:initialLayout="@layout/glance_default_loading_layout"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen"
    android:previewLayout="@layout/todo_widget_preview"
    android:description="@string/todo_widget_description" />
```

```xml
<!-- AndroidManifest 注册 -->
<receiver
    android:name=".widget.TodoGlanceWidgetReceiver"
    android:exported="false">
    <intent-filter>
        <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
    </intent-filter>
    <meta-data
        android:name="android.appwidget.provider"
        android:resource="@xml/todo_widget_info" />
</receiver>
```

`updatePeriodMillis="0"` 是关键:**关掉系统级周期更新**(最小也只能 30 分钟,且不省电),改用 WorkManager(参考第 17 篇 [[androidNativeLearning 17]])在数据变更时主动 `TodoGlanceWidget().updateAll(context)`。`targetCellWidth/Height` 是 Android 12+ 新增的目标网格大小,Launcher 用它做最佳尺寸推荐。

### 7) 数据 → Widget 同步

```kotlin
package com.example.notedx.widget

import android.content.Context
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters

class TodoWidgetSyncWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val mgr = GlanceAppWidgetManager(applicationContext)
        val ids = mgr.getGlanceIds(TodoGlanceWidget::class.java)
        ids.forEach { TodoGlanceWidget().update(applicationContext, it) }
        return Result.success()
    }
}
```

NotedX 主线在用户增删待办时,`enqueueUniqueWork("widget_sync", REPLACE, OneTimeWorkRequestBuilder<TodoWidgetSyncWorker>().build())`,把 Widget 刷新挂到 WorkManager 调度上,既不堵塞主线程也尊重 Doze 模式。

## 4. 调参与验收

### Activity Result API

| 关键点 | 验收 |
| --- | --- |
| Compose 重组 | `rememberLauncherForActivityResult` 在重组时**不会**重新注册,key 是 contract 实例引用 |
| 跨重建 | 旋转屏幕 / 折叠展开后,result 仍能正常回调 |
| 多次 launch | 同一个 launcher 可重复 launch,callback 顺序对应 |

### App Links

| 命令 | 期望输出 |
| --- | --- |
| `adb shell pm verify-app-links --re-verify com.example.notedx` | 无报错,触发后台验证 |
| `adb shell pm get-app-links com.example.notedx` | `notedx.app: verified` |
| `adb shell am start -a android.intent.action.VIEW -d "https://notedx.app/note/123"` | 直接拉起 NotedX 详情页,不弹 chooser |

若验签失败,Android 12+ 默认**不重试**,要么修复后用 `pm verify-app-links --re-verify` 强制,要么提示用户进设置 → 应用 → NotedX → 默认打开 → 添加链接 手动启用。

### Share Sheet

| 验收 | 期望 |
| --- | --- |
| `Intent.createChooser(send, null)` 拉起的 Sheet | Android 13+ 顶部出现"在 NotedX 中打开" / "复制" / "保存为草稿"等系统智能建议 |
| NotedX 接收 `ACTION_SEND` | 自动跳到 NoteEditor,initialText 已填入分享内容 |

### Glance Widget

| 关键参数 | 影响 |
| --- | --- |
| `updatePeriodMillis` | 设 0 关闭系统轮询,改 WorkManager 主动 push |
| `targetCellWidth/Height` | Android 12+ Launcher 用它推荐最佳尺寸 |
| `previewLayout` | Widget 选择面板里的预览图,建议用静态 XML 而非真实数据 |
| `ImageProvider(bitmap)` | 用动态 Bitmap 时注意大小 < 30 KB,过大 RemoteViews 序列化失败 |
| `LazyColumn` item 数 | 实测 < 50 流畅,> 100 滚动会卡 |

### Widget 刷新延迟

WorkManager 主动 `update` 端到端约:
- 数据变更 → `enqueueUniqueWork` 入队:< 5 ms
- WorkManager 调度 → `doWork` 启动:10-100 ms(冷启动可能 200+)
- `TodoGlanceWidget().update` → Launcher 渲染:100-300 ms
- 用户感知:1 秒内可见,体验良好

如果延迟 > 3 秒,通常是 WorkManager 受 Doze 限制(设备闲置且未充电时调度被延后)。NotedX 不需要严格实时,允许;若做闹钟类必须实时刷新,改用 `setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)`。

## 5. 踩坑

### 坑 1:`startActivityForResult` 在新代码里还能编译

`ComponentActivity` 继承 `androidx.activity.ComponentActivity`,`startActivityForResult` 来自基类 `Activity`,**没有被删**,只是 `@Deprecated`。新员工接手老项目时可能从 IDE 自动补全里看到它就继续用,导致跨重建丢回调。代码审查务必查 `startActivityForResult` 出现就提 PR 改 Contract。

### 坑 2:Compose `rememberLauncherForActivityResult` 的 onResult 内不能直接读旧状态

`onResult` lambda 在 launch → result 这段时间内,Composable 可能已经被回收或重组,直接捕获的 `var` 可能是旧值。正确做法是把目标行为提到 `LaunchedEffect(result)` 里:

```kotlin
var result by remember { mutableStateOf<Boolean?>(null) }
val launcher = rememberLauncherForActivityResult(
    contract = ActivityResultContracts.RequestPermission()
) { granted -> result = granted }
LaunchedEffect(result) {
    if (result == true) navigateToCamera()
}
```

### 坑 3:`autoVerify="true"` 配错域名后,改完不生效

Android 12+ 对一个 App 的域名验签做了缓存,**一旦失败永久禁用**(称为 `STATE_NO_RESPONSE` / `STATE_DENIED`)。修复了 `assetlinks.json` 后必须手动 `adb shell pm verify-app-links --re-verify com.example.notedx` 触发,或卸载重装。线上玩家拿不到 adb,只能引导他们到"设置 → 应用 → NotedX → 默认打开 → 添加链接"。所以 App Link 上线前要在多个 Android 12 / 13 / 14 / 15 设备上反复验证。

### 坑 4:`assetlinks.json` 走 301/302 重定向

很多 CDN 默认把 `/.well-known/*` 重定向到带 `www` 前缀的域名。PackageManager 验签**不跟随重定向**,会判定验签失败。CDN 上单独给 `/.well-known/assetlinks.json` 配 200 直返。

### 坑 5:同一 host 多 `intent-filter` 各自的 `autoVerify` 必须一致

```xml
<intent-filter android:autoVerify="true">
    <data android:host="notedx.app" android:pathPrefix="/note/" />
</intent-filter>
<intent-filter>  <!-- 漏掉 autoVerify -->
    <data android:host="notedx.app" android:pathPrefix="/todo/" />
</intent-filter>
```

整个 App 对 `notedx.app` 的验签会被判定为"未声明",直接 deny。**所有同 host 的 intent-filter 都加 `autoVerify="true"`**,缺一不可。

### 坑 6:Glance Widget 里用 `Modifier` 而不是 `GlanceModifier`

Import 容易抄串导致编译过、运行抛 `ClassCastException`。Glance 的 Composable 接受 `GlanceModifier`(`androidx.glance.GlanceModifier`),与 `androidx.compose.ui.Modifier` 是两套独立类型。IDE 在 import 时可能自动给你 import Compose 的,务必检查。

### 坑 7:Glance 里用 `MaterialTheme.colorScheme.primary` 不工作

Glance 自带的 Material 3 集成是 `androidx.glance:glance-material3`,通过 `GlanceTheme { Content() }` 进入。**Compose 的 `MaterialTheme` 在 Glance 里完全不可用**(它依赖 Compose 运行时上下文,Glance 没有)。要用主题色,改用 `GlanceTheme.colors.primary` 或 `ColorProvider(R.color.x)`。

### 坑 8:`ImageProvider(bitmap)` 大图导致 Launcher OOM

RemoteViews 是序列化跨进程传输,Bitmap 通过 Parcel 拷贝。一张 1920×1080 ARGB_8888 是 8 MB,Parcel 上限大约 1 MB,超过直接抛 `TransactionTooLargeException`,Widget 渲染失败显示"无法加载"。给 Widget 用的图必须降到 < 300 KB(通常 200×200 已够),用 `Bitmap.createScaledBitmap` 显式缩小。

### 坑 9:WorkManager 刷 Widget 时 App 进程未起

WorkManager 启动 Worker 时如果 App 进程不在,会冷启动 Application,初始化 Hilt / DataStore / Room 全套,耗时 500-1500 ms。Widget 刷新就慢。优化:把 Widget 的数据存放在专属 DataStore(只装 Widget 关心的字段),冷启动只读这一个文件,不要 lazy 初始化整个数据库。

### 坑 10:Predictive Back Gesture 与 Activity Result 冲突

Android 14+ 默认 Predictive Back 全量开启,用户左滑边缘有"预览返回"动效。如果 Activity Result 启动的子 Activity(比如系统设置)没适配,从子页返回时动画会"跳一下"。解决:targetSdk 34+ 在 `<application>` 加 `android:enableOnBackInvokedCallback="true"`,主流路径自然过渡(参考第 12 篇)。

### 坑 11:Share Sheet 的"在 NotedX 中打开"建议没出现

Android 13+ 的 Share Sheet 会基于"App 接收 `ACTION_SEND text/plain` 历史"显示推荐。但需要 App 至少**被分享成功过一次**才进入推荐池。开发期反复重装会清缓存,首次分享时位置在最后。这不是 bug,是系统设计。生产环境用户用着用着会"浮上来"。

## 延伸:MediaProjection 录屏

`MediaProjection` 是录屏 / 投屏的入口。Android 15 新增 "Partial Screen Sharing",允许用户选"只共享单 App"而非整屏,系统对话框由 `MediaProjectionConfig.createConfigForUserChoice()` 控制。流程:

```
val mgr = getSystemService<MediaProjectionManager>()
val intent = mgr.createScreenCaptureIntent(MediaProjectionConfig.createConfigForUserChoice())
val launcher = rememberLauncherForActivityResult(StartActivityForResult()) { result ->
    val projection = mgr.getMediaProjection(result.resultCode, result.data!!)
    val virtualDisplay = projection.createVirtualDisplay(
        "NotedXCapture", width, height, density,
        DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
        surface, // 来自 MediaRecorder 或 ImageReader
        callback, handler
    )
    // 把 surface 喂给 MediaRecorder / MediaCodec 编码到文件
}
```

录屏期间必须运行 **`mediaProjection` 类型的前台服务**(Android 14+ 强制,参考第 17 篇),否则录制立即停止。完整录屏 demo 是单独的工程化主题,不在本系列展开,知道入口与限制即可。

## 手动验证

- [ ] 在浏览器(Chrome 或微信内置浏览器)打开 `https://notedx.app/note/test123`,直接拉起 NotedX 并停在该笔记详情页(`pm get-app-links` 显示 `verified`)。
- [ ] 在任意 App(系统短信、Twitter、记事本)选中文本点击"分享",在 Share Sheet 中能看到"NotedX",点击进入 NotedX 笔记编辑器,初始内容为所分享文本。
- [ ] App 内点击"分享笔记"按钮,弹出系统 Share Sheet,选择"复制"或其他 App,操作成功。
- [ ] 长按桌面 → 添加 Widget → 找到 NotedX → 拖出"今日待办"Widget,显示当前 todo 列表;点击 item 切换勾选状态,UI 在 1 秒内刷新。
- [ ] App 内增删 todo 后,Widget 在 5 秒内同步显示新内容(由 WorkManager 推送)。
- [ ] 旋转屏幕 / 折叠展开后,Activity Result 触发的子页面返回,callback 仍能正确收到结果。
- [ ] 卸载重装 NotedX 后,首次启动等 30 秒,`adb shell pm get-app-links com.example.notedx` 仍为 `verified`(App Links 验签自动完成)。
- [ ] 关掉 WiFi 与移动数据,浏览器仍能本地解析 `https://notedx.app/note/...` 跳转 App(验签结果已缓存,无需联网二次验证)。
