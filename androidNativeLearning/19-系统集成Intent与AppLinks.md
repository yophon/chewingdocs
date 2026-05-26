# 系统集成:Intent、AppLinks、Glance Widget

> 一句话:**让 App 不只是一个孤立的图标——通过 Intent 与其他 App 互调,通过 App Links 让 https 链接直达 App,通过 Glance 把信息推到桌面**。这一篇是 NotedX 融入系统生态的最后一步。

---

## 一、Intent 是 Android App 之间的通信协议

Intent 有两种:

- **显式 Intent**——指定目标 Activity/Service:`Intent(ctx, MainActivity::class.java)`。这是 App 内部跳转用的(虽然 NotedX 单 Activity 用得不多)
- **隐式 Intent**——指定 action + data,系统决定让谁处理:`Intent(ACTION_VIEW, uri)`。这是 **App 之间通信** 的标准方式

```kotlin
// 显式:打开自己的 Activity
ctx.startActivity(Intent(ctx, SettingsActivity::class.java))

// 隐式:让系统选一个 App 打开网页
ctx.startActivity(Intent(Intent.ACTION_VIEW, "https://example.com".toUri()))
```

---

## 二、分享:`ACTION_SEND`

```kotlin
fun shareNote(ctx: Context, note: Note) {
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, note.title)
        putExtra(Intent.EXTRA_TEXT, "${note.title}\n\n${note.content}")
    }
    ctx.startActivity(Intent.createChooser(intent, "分享笔记"))
}
```

`Intent.createChooser(intent, title)`**强制弹出选择器**,即便用户设了默认。这是分享的标准模式——用户每次能选不同 App。

分享图片:

```kotlin
val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.fileprovider", file)
val intent = Intent(Intent.ACTION_SEND).apply {
    type = "image/jpeg"
    putExtra(Intent.EXTRA_STREAM, uri)
    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
}
ctx.startActivity(Intent.createChooser(intent, "分享图片"))
```

`FileProvider` 配置见 18 篇。

分享多个:

```kotlin
Intent(Intent.ACTION_SEND_MULTIPLE).apply {
    type = "image/jpeg"
    putParcelableArrayListExtra(Intent.EXTRA_STREAM, ArrayList(uris))
    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
}
```

---

## 三、接收分享:让 NotedX 出现在分享菜单里

`AndroidManifest.xml` 给 MainActivity 加 intent-filter:

```xml
<activity android:name=".MainActivity" ...>
    <!-- 接收分享文本 -->
    <intent-filter>
        <action android:name="android.intent.action.SEND" />
        <category android:name="android.intent.category.DEFAULT" />
        <data android:mimeType="text/plain" />
    </intent-filter>
    <!-- 接收分享图片 -->
    <intent-filter>
        <action android:name="android.intent.action.SEND" />
        <category android:name="android.intent.category.DEFAULT" />
        <data android:mimeType="image/*" />
    </intent-filter>
</activity>
```

在 `MainActivity.onCreate` / `onNewIntent` 处理:

```kotlin
override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    enableEdgeToEdge()
    handleSharedIntent(intent)
    setContent { ... }
}

override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    handleSharedIntent(intent)
}

private fun handleSharedIntent(intent: Intent?) {
    if (intent?.action != Intent.ACTION_SEND) return
    when {
        intent.type?.startsWith("text/") == true -> {
            val text = intent.getStringExtra(Intent.EXTRA_TEXT) ?: return
            // 跳到 NoteEditor,标题/内容填上 text
        }
        intent.type?.startsWith("image/") == true -> {
            val uri: Uri? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
            } else {
                @Suppress("DEPRECATION") intent.getParcelableExtra(Intent.EXTRA_STREAM)
            }
            // ...
        }
    }
}
```

---

## 四、打开网页 / 拨号 / 邮件:系统 Intent

```kotlin
// 打开网页
ctx.startActivity(Intent(Intent.ACTION_VIEW, "https://notedx.app".toUri()))

// 拨号(无需权限,只是打开拨号器)
ctx.startActivity(Intent(Intent.ACTION_DIAL, "tel:13800138000".toUri()))

// 直接打电话(需要 CALL_PHONE 权限,不推荐)
// 用 ACTION_DIAL 让用户确认

// 邮件
ctx.startActivity(Intent(Intent.ACTION_SENDTO, "mailto:support@notedx.app".toUri()).apply {
    putExtra(Intent.EXTRA_SUBJECT, "反馈")
    putExtra(Intent.EXTRA_TEXT, "正文...")
})

// 跳到 App 设置页(15 篇)
ctx.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
    data = "package:${ctx.packageName}".toUri()
})
```

这些 Intent **如果没有 App 能处理会抛 ActivityNotFoundException**。生产代码:

```kotlin
fun safeStartActivity(ctx: Context, intent: Intent) {
    runCatching { ctx.startActivity(intent) }
        .onFailure { Toast.makeText(ctx, "无可用应用", Toast.LENGTH_SHORT).show() }
}
```

---

## 五、App Links:让 https 链接直达 App

用户在浏览器、社交媒体里看到 `https://notedx.app/notes/42`——希望点击直接打开你的 App,而不是浏览器。这就是 **Android App Links**。

**Deep Link**(自定义 scheme `notedx://`)和 **App Links**(https 验证)的区别:
- Deep Link:任何 App 都能伪造 scheme,不安全;**只能从你 App 内部 / 通知发出**
- App Links:Google 通过 `assetlinks.json` 验证你拥有这个域名;**浏览器看到这个域名时直接跳到你 App**

**接入步骤**:

1. **manifest 给 Activity 加 intent-filter**:

```xml
<activity android:name=".MainActivity" ...>
    <intent-filter android:autoVerify="true">
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="https" />
        <data android:scheme="http" />
        <data android:host="notedx.app" />
        <data android:pathPrefix="/notes" />
    </intent-filter>
</activity>
```

`autoVerify="true"` 让系统自动去 `https://notedx.app/.well-known/assetlinks.json` 验证。

2. **在你域名的 `/.well-known/assetlinks.json` 放验证文件**:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.notedx",
    "sha256_cert_fingerprints": ["XX:YY:..."]
  }
}]
```

`sha256_cert_fingerprints` 是 release 签名证书的 SHA-256(`./gradlew signingReport` 能拿到)。

3. **在 Navigation 给目的地加 deep link**(11 篇):

```kotlin
composable<Route.Detail>(
    deepLinks = listOf(
        navDeepLink<Route.Detail>(basePath = "https://notedx.app/notes"),
        navDeepLink<Route.Detail>(basePath = "notedx://detail"),
    )
) { ... }
```

4. **MainActivity 处理 deep link**(11 篇,Navigation Compose 自动解析)。

---

## 六、验证 App Links 是否生效

```bash
# 检查 manifest 配置
adb shell pm get-app-links com.notedx

# 输出应包含:
# notedx.app verified
# ...

# 测试触发
adb shell am start -a android.intent.action.VIEW -d "https://notedx.app/notes/42"
# 应当直接打开 NotedX 详情页 42
```

**常见失败**:
- `assetlinks.json` 没在精确路径 `/.well-known/assetlinks.json`
- HTTP 重定向到 HTTPS(系统不跟随,直接放 HTTPS)
- 证书 SHA 与 release 签名不匹配
- 服务器响应 `Content-Type` 不是 `application/json`

---

## 七、Glance:Jetpack Compose 风格的桌面小组件

桌面 Widget(小组件)旧 API 极难用(RemoteViews + XML)。Jetpack **Glance**(2024+ 稳定)提供 Compose 风格的 Widget DSL:

依赖:

```kotlin
implementation("androidx.glance:glance-appwidget:1.1.0")
implementation("androidx.glance:glance-material3:1.1.0")
```

定义一个 widget:

```kotlin
class NotedXWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val notes = getRecentNotes(context)
        provideContent {
            GlanceTheme {
                WidgetContent(notes = notes)
            }
        }
    }

    @Composable
    private fun WidgetContent(notes: List<NoteCard>) {
        Column(
            modifier = GlanceModifier
                .fillMaxSize()
                .background(GlanceTheme.colors.background)
                .padding(8.dp),
        ) {
            Text("NotedX 最近", style = TextStyle(fontWeight = FontWeight.Bold))
            Spacer(modifier = GlanceModifier.height(8.dp))
            LazyColumn {
                items(notes) { card ->
                    Row(
                        modifier = GlanceModifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp)
                            .clickable(actionStartActivity(
                                Intent(context, MainActivity::class.java).apply {
                                    data = "notedx://detail/${card.id}".toUri()
                                }
                            )),
                    ) {
                        Text(text = card.title)
                    }
                }
            }
        }
    }
}

class NotedXWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = NotedXWidget()
}
```

**注意**:Glance API 看起来像 Compose,但**它不是 Compose**——它内部生成 RemoteViews。能用的 API 是 Compose 的子集:`Column` / `Row` / `Box` / `Text` / `Image` / `LazyColumn`,**没有自定义 Composable**(Compose runtime 不能跑在 Widget host 进程里)。

manifest 注册:

```xml
<receiver android:name=".widget.NotedXWidgetReceiver" android:exported="true">
    <intent-filter>
        <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
    </intent-filter>
    <meta-data
        android:name="android.appwidget.provider"
        android:resource="@xml/notedx_widget_info" />
</receiver>
```

`res/xml/notedx_widget_info.xml`:

```xml
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="180dp"
    android:minHeight="180dp"
    android:resizeMode="horizontal|vertical"
    android:targetCellWidth="3"
    android:targetCellHeight="3"
    android:widgetCategory="home_screen"
    android:updatePeriodMillis="86400000"
    android:initialLayout="@layout/glance_default_loading_layout" />
```

---

## 八、Widget 状态更新

Widget 的状态怎么更新?三种触发:

1. **`updatePeriodMillis`**——manifest 配的周期(最小 30 分钟),系统自动调用 `provideGlance`
2. **代码主动触发**——`NotedXWidget().update(context, glanceId)`(数据库变化时调用)
3. **点击 Action**——Glance 的 `actionRunCallback<Callback>()`

代码主动触发(在 ViewModel / Worker 里):

```kotlin
class WidgetRefresher @Inject constructor(@ApplicationContext private val ctx: Context) {
    suspend fun refresh() {
        val manager = GlanceAppWidgetManager(ctx)
        val ids = manager.getGlanceIds(NotedXWidget::class.java)
        ids.forEach { id ->
            NotedXWidget().update(ctx, id)
        }
    }
}
```

笔记数据库变更时调一次 `refresh()`,Widget 自动重新拉数据重绘。

---

## 九、Launcher Shortcut:桌面长按图标的快捷方式

```xml
<!-- AndroidManifest.xml -->
<activity android:name=".MainActivity" ...>
    <meta-data
        android:name="android.app.shortcuts"
        android:resource="@xml/shortcuts" />
</activity>
```

`res/xml/shortcuts.xml`:

```xml
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
    <shortcut
        android:shortcutId="new_note"
        android:enabled="true"
        android:icon="@drawable/ic_new_note"
        android:shortcutShortLabel="@string/new_note"
        android:shortcutLongLabel="@string/new_note_long">
        <intent
            android:action="android.intent.action.VIEW"
            android:targetPackage="com.notedx"
            android:targetClass="com.notedx.MainActivity"
            android:data="notedx://new" />
    </shortcut>
</shortcuts>
```

用户长按桌面 NotedX 图标,弹出"新建笔记"快捷方式。

动态 shortcut(代码加):

```kotlin
val shortcut = ShortcutInfoCompat.Builder(ctx, "note_$id")
    .setShortLabel(note.title)
    .setLongLabel(note.title)
    .setIcon(IconCompat.createWithResource(ctx, R.drawable.ic_note))
    .setIntent(Intent(Intent.ACTION_VIEW, "notedx://detail/$id".toUri()))
    .build()

ShortcutManagerCompat.pushDynamicShortcut(ctx, shortcut)
```

---

## 十、文件预览:让其他 App 打开你的文件

```kotlin
fun openFileWithOtherApp(ctx: Context, file: File, mimeType: String) {
    val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.fileprovider", file)
    val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, mimeType)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    ctx.startActivity(Intent.createChooser(intent, "用其他应用打开"))
}
```

---

## 十一、Intent Action 速查

| Action | 干嘛 |
| --- | --- |
| `ACTION_VIEW` | 通用"查看"(网页 / 文件 / 联系人) |
| `ACTION_SEND` / `ACTION_SEND_MULTIPLE` | 分享 |
| `ACTION_DIAL` / `ACTION_CALL` | 拨号 |
| `ACTION_SENDTO` | 邮件 / 短信 |
| `ACTION_PICK` | 选(联系人 / 图片) |
| `ACTION_GET_CONTENT` | 获取内容 |
| `ACTION_INSERT` | 插入新数据(日历事件 / 联系人) |
| `ACTION_MAIN` + `category.LAUNCHER` | 应用启动入口 |
| `ACTION_BOOT_COMPLETED` | 开机广播(API 26+ 受限) |

---

## 十二、Intent 安全:exported / 输入验证

```xml
<activity
    android:name=".internal.InternalActivity"
    android:exported="false" />        <!-- 只允许同 App 调 -->

<activity
    android:name=".MainActivity"
    android:exported="true">           <!-- 允许外部调,必须显式声明 -->
    <intent-filter>...</intent-filter>
</activity>
```

API 31+ 起,**有 intent-filter 的 Activity 必须显式 `android:exported`**——漏写直接编译报错。

接收外部 Intent 的 Activity **必须验证输入**——别人能传任意数据:

```kotlin
private fun handleDeepLink(intent: Intent) {
    val noteId = intent.data?.lastPathSegment?.toLongOrNull()
    if (noteId == null || noteId <= 0) {
        // 验证失败,跳到首页
        navController.navigate(Route.Home)
        return
    }
    navController.navigate(Route.Detail(noteId))
}
```

不验证的话,攻击者构造 `notedx://detail/-1` 之类的数据可能让 App 崩或者出现意外行为。

---

## 十三、踩坑

**坑 1:用旧 scheme deep link 当 App Links**。`notedx://detail/42` 在 App 外部不可点——浏览器 / 微信看不到。App Links(https://)才能从外部链接直达。

**坑 2:App Links 验证失败默默 fallback 到浏览器**。`assetlinks.json` 配错,用户点链接是浏览器打开网页,**App 不会启动**也不会报错。一定要 `adb shell pm get-app-links com.notedx` 验证。

**坑 3:`createChooser` 不传 title**。Android 12+ 起对话框样式有变化,不传 title 显示默认"分享方式",看着像系统错误。

**坑 4:接收分享后不验证 mime / 内容**。攻击者构造特殊 Intent 可能让 App 处理意外类型。永远先 `intent.type` 判断,再读 EXTRA。

**坑 5:`FileProvider` 配置漏 `grantUriPermissions`**。manifest 写了但忘记 `android:grantUriPermissions="true"`,临时授权不生效,目标 App 拿到 URI 但读不到。

**坑 6:Glance 用了不支持的 Composable**。Glance 是 RemoteViews 的封装,**不能用** `androidx.compose.material3.Button` / 自定义 Composable / 复杂动画。出现 ClassCastException 或者 Widget 直接显示"Loading..."不动。

**坑 7:Widget 主动 update 在主线程做长操作**。Widget 数据库查询走 `Dispatchers.IO`,完成后再 `update`——不要在主线程 await。

**坑 8:Shortcut 用 `notedx://` scheme**。Shortcut 是 Launcher 触发的,作为 Activity Intent 跑得通,但**接收时要保证 MainActivity 配了对应 intent-filter**。

**坑 9:App Links 改证书没更新 `assetlinks.json`**。换签名时(很少但有)`sha256_cert_fingerprints` 要同步更新到服务器,否则用户更新后 App Links 失效。

**坑 10:autoVerify 没生效**。`autoVerify="true"` 需要至少一个 host(`<data android:host="..."/>`),且 host 是 https / http,scheme 不对系统跳过验证。

---

下一篇 `20-多模块化:app / feature / core / data.md`,讲什么时候该拆模块、怎么拆、Hilt 与 Compose 在多模块下的配置。**前 19 篇所有代码都在单模块**——这一篇之后 NotedX 才真正进入"团队工程"模式。
