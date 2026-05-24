# 16-Android 权限模型与运行时申请

> 一句话导读:Android 权限不是"声明在 manifest 就拿到"的一次性勾选,而是一个由用户、系统、`targetSdk`、应用进程共同维护的状态机,你的每一个 `request()` 都只是请求把状态从 "未授权 / 已拒绝 / 拒绝过两次 / 永久拒绝" 中的某个节点推进一步。

前 15 篇把 NotedX 跑成了一款能登录、能列表、能详情、能本地缓存、能联网同步的 Compose 应用,但 16 篇之前它没动过用户的任何一根敏感神经:没读相册、没发通知、没用相机、没拿位置。这一节我们要进入第四层"系统能力",而通往任何一个系统能力的第一道闸口都是**权限**。把这一篇放在第四层开篇,是因为后面 17(WorkManager / ForegroundService)、18(通知)、19(CameraX / Photo Picker)、20(Intent / App Links)每一篇都会反复消费 16 篇里建立的心智:**Android 权限是一个状态机,不是一个布尔标志。**

## 1. 机制定位

### 权限要解决的问题

Android 是一个把每个 App 跑在独立 UID/沙箱里的多用户系统。系统资源(相机、麦克风、相册、定位、通讯录、通知通道)默认对你的进程不可见。权限就是"系统决定要不要把这扇门为你打开一秒钟"。把这件事单独抽象出来有两个原因:**用户控制力**(用户可以撤销已经授予的权限)和 **API level 演进**(同一个能力在不同 Android 版本下的可用接口与默认行为不同)。

如果你过去写过 Android 6 之前的代码,会记得当年权限模型简单到夸张:在 `AndroidManifest.xml` 里写一行 `<uses-permission android:name="android.permission.READ_CONTACTS" />`,装包时系统弹一个权限列表,用户点"安装"就视为全部授权,从此你的代码可以任意调用 `ContentResolver` 读通讯录,直到用户卸载。这套模型的失效模式很明显:用户没法对单项权限选择性拒绝、没法事后撤销、装包列表过长大家也不看。

Android 6 (API 23) 引入运行时权限,把 `dangerous` 级别的权限改成"安装时仅占位,运行时再申请",这是现代权限模型的起点。Android 10、11、12、13、14、15 持续在这个基础上做收敛:位置权限拆分前台 / 后台、媒体权限按图片 / 视频 / 音频拆开、Android 13 起新增 `POST_NOTIFICATIONS`、Android 14 起新增 "部分照片访问"。每一次收敛背后的逻辑都一样:**让用户能在更细的粒度上控制单项授权,让 App 的"知情范围"刚好等于业务必需**。

新手最常见的失控写法,是把权限当成"一行 `requestPermissions` 调用 + 一个回调",然后假设回调里 `granted = true` 永远等价于"我现在能用这个能力"。这条心智在以下几种场景下会全线崩盘:用户在系统设置里把权限改回 "Ask every time"(Android 11+ 单次授权)、用户在通知栏里给了 `READ_MEDIA_VISUAL_USER_SELECTED` 之后又重新点了一次 "Select more photos"(部分照片访问)、`targetSdk` 升到 33 之后老用户的应用没自动获得 `POST_NOTIFICATIONS`、Android 14 上你拿到了 `READ_MEDIA_IMAGES` 但用户其实只授权了三张照片。这些都不是 bug,都是权限作为状态机的必然行为。

### Android 13 / 14 / 15 的权限演进基线

本系列基线是 Android 15 / API 35,但 16~30 这部分逻辑要照顾从 minSdk 26 (Android 8.0) 一直到 API 35 的兼容矩阵。下表是和权限直接相关的关键演进,后续每一节都会引用其中某一条:

| API | 权限相关变更 | 本篇是否展开 |
| --- | --- | --- |
| 23 | 运行时权限模型(`dangerous` 改运行时) | 隐含前提,不展开 |
| 29 | 前台 / 后台位置分离 (`ACCESS_BACKGROUND_LOCATION`) | 简要点名 |
| 30 | 一次性权限 (One-time permission) / Package Visibility | 简要点名 |
| 31 | 蓝牙拆分为 `BLUETOOTH_SCAN/CONNECT/ADVERTISE` | 不展开 |
| 33 | 媒体权限拆分(`READ_MEDIA_IMAGES/VIDEO/AUDIO`)/ `POST_NOTIFICATIONS` 运行时申请 | 详细展开 |
| 34 | 部分照片访问 `READ_MEDIA_VISUAL_USER_SELECTED` / 前台服务必须声明 type | 详细展开;FGS 在 17 篇 |
| 35 | `FOREGROUND_SERVICE_*` 权限矩阵收紧 / 后台拉前台进一步限制 | 在 17 篇 |

注意 `targetSdk` 是关键变量。同样的代码,`targetSdk = 32` 时调 `READ_EXTERNAL_STORAGE` 仍能读完整相册,`targetSdk = 33` 时这个权限对图片完全失效,必须改用 `READ_MEDIA_IMAGES`;Android 14 设备上 `targetSdk = 34` 启用部分照片访问,`targetSdk = 33` 则按旧模型走。本系列固定 `targetSdk = 35`,你写的代码必须按 35 的行为基线写,但同时要在 manifest 里通过 `maxSdkVersion` / `usesPermissionFlags` 显式标注旧权限的退化路径。

## 2. Android 心智

### 权限保护级别与权限组

`AndroidManifest.xml` 里能声明的权限按 `protectionLevel` 分三档:

- `normal`(如 `INTERNET`、`ACCESS_NETWORK_STATE`、`VIBRATE`):安装时自动授予,运行时不弹框、不可撤销。`INTERNET` 是个特殊优待:谁都能联网,但谁都"被默认看见"是联网应用,这是 Android 早期为了让大家不重复弹框做的权衡。
- `dangerous`(如 `CAMERA`、`RECORD_AUDIO`、`READ_CONTACTS`、`READ_MEDIA_IMAGES`、`ACCESS_FINE_LOCATION`):运行时必须显式申请,用户可以在系统设置里随时撤回。本篇全部讨论这一档。
- `signature` / `signatureOrSystem`(如 `WRITE_SECURE_SETTINGS`、`BIND_DEVICE_ADMIN`):只有和系统签名一致的应用能拿到,普通应用不要去碰。

历史上还存在 "权限组"(`permission-group`)的概念,Android 12 之前是真正的分组授予(给了一个权限,等价于给了同组所有),Android 13 之后 Google 已经把权限组从授权层面降级为"UI 上的视觉聚合",运行时是否授予完全按单个 permission 计算。**写代码不要再依赖"申请了同组某个就视为同组其他都给了"这种假设。**这条心智过期是迁移老项目的常见返工点,2020 年前的 StackOverflow 答案里到处都还在写 `if (hasGroup(STORAGE))`。

### 权限的状态机

任何 `dangerous` 权限在某一个时刻只可能落在下面这些状态之一:

```
NOT_REQUESTED        # 从未申请过
GRANTED              # 已授予,持续有效
DENIED_ONCE          # 拒绝过 1 次,系统下次会再弹
DENIED_WITH_RATIONALE # 拒绝过,且 shouldShowRationale = true
DENIED_PERMANENTLY   # 用户勾了"不再询问",shouldShowRationale = false 且 PackageManager 不再弹
ONE_TIME_GRANTED     # 单次授权,进程死后失效(API 30+)
PARTIAL_GRANTED      # 部分授权,仅 READ_MEDIA_VISUAL_USER_SELECTED 适用
```

`shouldShowRequestPermissionRationale` 这个 API 名字非常误导:它返回的不是"该不该展示理由文案",而是"用户是否拒绝过、且没有勾选'不再问'"。它的真正用法是:**在调用 `request()` 之前**,如果它返回 true,意味着用户上一次拒绝了但保留了再次询问的可能,这时你应该先在自己的 UI 里给一段说明,告诉用户为什么需要这个权限,然后再调 `request()`;如果它返回 false,有两种含义需要区分:权限从未申请过(此时 `request()` 会弹框) 或 权限被永久拒绝(此时 `request()` 不会弹框,直接走 onDenied)。所以正确的判断顺序是:

```
权限当前是否 granted?  -> 是,直接用能力
否 -> shouldShowRationale?  -> 是,展示自己的解释 UI
                          -> 否,尝试 request();如果回调里仍是 denied,说明永久拒绝,引导去系统设置
```

Compose 里把这套状态机包成一个 `PermissionState`,后面工程实现里会给出。

### Activity Result API 取代旧 `onRequestPermissionsResult`

老教程会写一个 `requestPermissions(activity, arr, REQUEST_CODE)`,然后在 Activity 里 override `onRequestPermissionsResult`,根据 `requestCode` 分支判断。这套 API 在 AndroidX 1.3 (2020) 起被 `ActivityResultContracts` 体系取代,旧 API 在 Compose 单 Activity 架构下几乎无法使用(因为你没有"那个 Activity"),应当全量弃用。

`ActivityResultContracts.RequestPermission` / `RequestMultiplePermissions` 是 Jetpack 提供的标准合约。Compose 里通过 `rememberLauncherForActivityResult(contract) { result -> }` 把合约绑定到当前可组合作用域,返回一个 `ManagedActivityResultLauncher`,在事件回调里调 `launcher.launch("android.permission.CAMERA")` 即可触发系统对话框。这套 API 的好处:

- 不依赖 Activity 类型,不需要 `onRequestPermissionsResult` 这种 lifecycle 入侵;
- 单 Activity 架构下任何 `@Composable` 函数都能就近声明 launcher;
- 结果通过 lambda 回调,天然可以驱动 `MutableStateFlow` 或 `mutableStateOf` 让 UI 重组。

Google 一度推荐的 `accompanist-permissions` 库已于 2024 年底进入 deprecated 状态(详细见踩坑一节),新工程不要再加这个依赖。

### `READ_MEDIA_VISUAL_USER_SELECTED` 与 Photo Picker 的关系

Android 14 (API 34) 新增了"部分照片 / 视频访问"模式。当你声明了 `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO`,Android 14+ 的系统弹框会多出第三个选项 "Select photos and videos",用户选完后,你的进程只看得见用户选的那几张,且 `READ_MEDIA_VISUAL_USER_SELECTED` 这一项变为 `granted`,而 `READ_MEDIA_IMAGES` 仍是 `denied`。这意味着:

- 如果你的业务只需要让用户"挑几张",**优先使用 Photo Picker**(`ActivityResultContracts.PickMultipleVisualMedia`),Android 4.4 起就可用,无需任何媒体权限。这是第 19 篇的主线,不在本篇展开。
- 如果你的业务真需要"我自己管理一个媒体目录、给用户看缩略图、做整理",才用 `READ_MEDIA_IMAGES`,且必须同时声明 `READ_MEDIA_VISUAL_USER_SELECTED`,并处理部分授权的 UI(给一个"管理选择"的入口,调用 `ACTION_PICK_IMAGES` 让用户增减授权)。

POST_NOTIFICATIONS 和 Health Connect 的心智我们留到工程实现一节用代码展开。

## 3. 工程实现

### 文件:`app/src/main/AndroidManifest.xml`(权限声明片段)

NotedX 在本篇要用到的权限是相机(笔记拍照)、相册(选择附图)、通知(后台同步完成提醒)。完整的 manifest 片段:

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">

    <!-- 网络是 normal 级别,不需要运行时申请 -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <!-- 相机,运行时申请 -->
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-feature
        android:name="android.hardware.camera.any"
        android:required="false" />

    <!-- 媒体权限:Android 13+ 拆分;旧版退化到 READ_EXTERNAL_STORAGE -->
    <uses-permission
        android:name="android.permission.READ_EXTERNAL_STORAGE"
        android:maxSdkVersion="32" />
    <uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
    <uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />
    <!-- Android 14+ 部分授权,不写会失去"Select more"机会 -->
    <uses-permission
        android:name="android.permission.READ_MEDIA_VISUAL_USER_SELECTED" />

    <!-- Android 13+ 必须运行时申请通知权限 -->
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

    <application ...>
        ...
    </application>
</manifest>
```

注意 `READ_EXTERNAL_STORAGE` 上的 `android:maxSdkVersion="32"`:`targetSdk = 33+` 后 Android 不会再为这个权限向用户弹框,但旧设备(Android 12L 及以下)还要靠它读相册,所以保留但限定上限。`READ_MEDIA_VISUAL_USER_SELECTED` 不在低版本存在,系统会自动忽略,不需要 `minSdkVersion` 限定。

### 文件:`core/permission/PermissionState.kt`

把状态机包成一个 Kotlin sealed 类型,放在 `:core-permission` 模块(我们到第 21 篇拆模块时再正式拆,本篇先以 package 形态出现)。

```kotlin
package app.notedx.core.permission

sealed interface PermissionState {
    data object NotRequested : PermissionState
    data object Granted : PermissionState
    data object DeniedTransient : PermissionState         // 拒绝过,还能再弹
    data object DeniedPermanently : PermissionState       // 永久拒绝,需要去系统设置
    data object PartiallyGranted : PermissionState        // Android 14+ 部分照片
}

data class PermissionRequest(
    val permission: String,
    val rationaleText: String,
    val deniedText: String,
)
```

### 文件:`core/permission/PermissionStateRemember.kt`

Compose 里把"当前权限状态 + launcher"打包成一个 `PermissionController`,业务方只关心三个动作:`requestIfNeeded()`、`openAppSettings()`、`state`。

```kotlin
package app.notedx.core.permission

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat

class PermissionController internal constructor(
    val state: PermissionState,
    val request: () -> Unit,
    val openSettings: () -> Unit,
)

@Composable
fun rememberPermissionController(
    permission: String,
    onResult: (PermissionState) -> Unit = {},
): PermissionController {
    val context = LocalContext.current
    var state by remember { mutableStateOf(currentState(context, permission)) }

    val launcher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted ->
        state = when {
            granted -> PermissionState.Granted
            // 拒绝后:Rationale 仍可见 -> 暂时拒绝;不可见 -> 永久拒绝
            (context as? Activity)?.shouldShowRationale(permission) == true ->
                PermissionState.DeniedTransient
            else -> PermissionState.DeniedPermanently
        }
        onResult(state)
    }

    return remember(state) {
        PermissionController(
            state = state,
            request = {
                if (state !is PermissionState.Granted) launcher.launch(permission)
            },
            openSettings = { context.openAppSettings() },
        )
    }
}

private fun currentState(context: Context, permission: String): PermissionState {
    val granted = ContextCompat.checkSelfPermission(context, permission) ==
        PackageManager.PERMISSION_GRANTED
    return if (granted) PermissionState.Granted else PermissionState.NotRequested
}

private fun Activity.shouldShowRationale(permission: String): Boolean =
    androidx.core.app.ActivityCompat.shouldShowRequestPermissionRationale(this, permission)

private fun Context.openAppSettings() {
    val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
        data = Uri.fromParts("package", packageName, null)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    startActivity(intent)
}
```

几处取舍说明:

- 第一次 `currentState` 调用区分不开"从未申请"和"永久拒绝"。这是 Android API 的本质限制,`PackageManager` 不暴露"被永久拒绝"的查询。我们只能在 `launcher` 回调里通过 `shouldShowRationale` 反推。这个限制写代码时务必接受,不要尝试持久化"上次是否申请过"到 DataStore 来绕开——用户在系统设置里手动重置权限后你存的状态就是脏的。
- `request` lambda 在已授权时不再触发 launcher,避免无意义系统调用。
- `openSettings` 用 `ACTION_APPLICATION_DETAILS_SETTINGS` 跳到本应用详情页,这是引导用户解除"永久拒绝"的唯一标准入口。

### 文件:`feature/notes/AttachPhotoButton.kt`

把 Controller 用到一个真实场景里:笔记附图按钮,点了申请相册权限,Granted 后调 Photo Picker(Photo Picker 本身不需要权限,这里申请 `READ_MEDIA_IMAGES` 是为了"全相册浏览"二级流程,后面会展开)。

```kotlin
@Composable
fun AttachPhotoButton(
    modifier: Modifier = Modifier,
    onPicked: (List<Uri>) -> Unit,
) {
    val permission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        android.Manifest.permission.READ_MEDIA_IMAGES
    } else {
        android.Manifest.permission.READ_EXTERNAL_STORAGE
    }

    val controller = rememberPermissionController(permission)
    val pickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickMultipleVisualMedia(maxItems = 9),
    ) { uris -> onPicked(uris) }

    var showRationale by remember { mutableStateOf(false) }

    Column(modifier) {
        Button(onClick = {
            when (controller.state) {
                PermissionState.Granted, PermissionState.PartiallyGranted ->
                    pickerLauncher.launch(
                        PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                    )
                PermissionState.DeniedTransient -> showRationale = true
                PermissionState.DeniedPermanently -> showRationale = true
                PermissionState.NotRequested -> controller.request()
            }
        }) {
            Text("添加图片")
        }

        if (showRationale) {
            AlertDialog(
                onDismissRequest = { showRationale = false },
                title = { Text("需要相册权限") },
                text = {
                    Text(
                        if (controller.state is PermissionState.DeniedPermanently)
                            "你已永久拒绝相册权限,请到系统设置开启。"
                        else
                            "需要读取相册才能为笔记添加附图,仅在你主动添加时使用。"
                    )
                },
                confirmButton = {
                    TextButton(onClick = {
                        showRationale = false
                        if (controller.state is PermissionState.DeniedPermanently)
                            controller.openSettings()
                        else
                            controller.request()
                    }) { Text("继续") }
                },
                dismissButton = {
                    TextButton(onClick = { showRationale = false }) { Text("取消") }
                }
            )
        }
    }
}
```

业务方写起来很直白:点按钮 → 看状态 → 走分支。状态机的复杂度被 Controller 吃掉了,UI 层只关心五个枚举值。

### 文件:`feature/sync/PostNotificationPermissionGate.kt`(Android 13+ 通知权限)

NotedX 后台同步完成后需要发通知,Android 13+ 必须运行时申请。建议在"首次进入设置 → 启用同步开关"时申请,而不是 app 启动就弹,理由后面会说。

```kotlin
@Composable
fun PostNotificationPermissionGate(
    enabled: Boolean,
    onEnabled: () -> Unit,
) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
        // < Android 13 通知默认开,无需申请
        if (enabled) onEnabled()
        return
    }
    val controller = rememberPermissionController(
        android.Manifest.permission.POST_NOTIFICATIONS,
    ) { state -> if (state is PermissionState.Granted) onEnabled() }

    LaunchedEffect(enabled) {
        if (enabled && controller.state !is PermissionState.Granted) {
            controller.request()
        }
    }
}
```

`LaunchedEffect(enabled)` 保证用户在 Compose UI 里把同步开关拨到 ON 的瞬间触发申请,而不是在 App 启动时无理由弹框骚扰用户。

### 文件:`feature/health/HealthConnectAccess.kt`(Health Connect 简要心智)

Health Connect (Android 14 起内置,旧版本作为 SDK 安装) 不走标准的运行时权限,它是一套 **独立的权限授予流程**:你声明 `HealthPermission` 集合,通过 `PermissionController.createRequestPermissionResultContract()` 调出 Health Connect 自己的 UI(不是系统权限弹框),用户在那里勾选你能读 / 写的具体数据类型。

```kotlin
class HealthAccessViewModel @Inject constructor(
    private val healthClient: HealthConnectClient,
) : ViewModel() {

    val requiredPermissions = setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getWritePermission(WeightRecord::class),
    )

    suspend fun granted(): Boolean =
        healthClient.permissionController.getGrantedPermissions().containsAll(requiredPermissions)
}
```

这里只是给一个心智锚点:**Health Connect 不要走 `ActivityResultContracts.RequestPermission`,它有自己的 contract**。完整的 Health Connect 集成不在本篇,因为它的数据模型(`Record` / `TimeRangeFilter` / `AggregateRequest`)更适合在做健康类业务时单独成篇。当下你只需记住:**看到 `androidx.health.connect.*` 的权限,不要用本篇的 PermissionController**。

## 4. 调参与验收

### 申请时机的工程化建议

权限申请时机不是 API 问题,是 UX 问题,但它直接影响授权率。Google Play Store 的隐私评分、App Store 类比的 prompt fatigue 文献都给出大致一致的结论:

- **不要在 App 启动后立刻弹一串权限**,这是 2014 年 iOS / Android 6 早期最常见的反模式,弹完用户全拒。
- **绑定到首次使用的业务动作上**:用户点"添加图片"才申请相册,点"语音输入"才申请录音,打开同步开关才申请通知。这种"上下文相关"的申请,用户能立刻理解为什么。
- **拒绝后不要立刻再申请第二次**,等用户下一次主动触发同一动作再说。否则 `shouldShowRationale` 仍为 true,你重复弹框,用户第二次直接勾"不再询问",从此永久拒绝。
- **永久拒绝后唯一可用动作是引导去系统设置**,不要继续调 `launcher.launch()`,Android 12+ 不会弹框,但你的 UI 状态会迷惑业务方。

### 用 adb 查看与重置权限

调试期间最有用的几个 adb 命令:

```bash
# 看当前包对某权限的状态
adb shell dumpsys package app.notedx | grep permission

# 手动授予 / 撤销(仅 dangerous 级别)
adb shell pm grant app.notedx android.permission.CAMERA
adb shell pm revoke app.notedx android.permission.CAMERA

# 重置整个 app 的所有权限状态,模拟"全新安装首次启动"
adb shell pm reset-permissions

# 查看部分照片授权了哪些 URI(Android 14+)
adb shell content query --uri content://media/external/images/media \
    --projection _id,_data
```

`reset-permissions` 是单元测试和手动验收里最被低估的命令。每次跑权限流程前 reset 一次,能消除"上一次拒绝过"造成的状态污染,确保测试可重复。

### Compose UI Test 配合 GrantPermissionRule

Instrumented test 里用 `GrantPermissionRule.grant(...)` 在 setUp 阶段直接授予,这样你测的是"已授权后的业务流",不必反复点系统弹框。系统弹框本身属于平台 UI,UiAutomator 可以触它,但不在 Compose UI Test 的范围,实践中授予分两路走比较干净。

```kotlin
class AttachPhotoTest {
    @get:Rule val composeRule = createAndroidComposeRule<MainActivity>()

    @get:Rule
    val permissionRule: GrantPermissionRule = GrantPermissionRule.grant(
        android.Manifest.permission.READ_MEDIA_IMAGES,
    )

    @Test fun pickFlow_opensPhotoPicker_whenPermissionGranted() {
        composeRule.onNodeWithText("添加图片").performClick()
        // 这里只验证 Picker Intent 被触发,具体 Picker UI 测试在第 19 篇
    }
}
```

### 验收清单

- [ ] manifest 中所有 `dangerous` 权限都有 `uses-permission`,且媒体权限同时声明了 `READ_EXTERNAL_STORAGE`(`maxSdkVersion=32`)、`READ_MEDIA_IMAGES`、`READ_MEDIA_VISUAL_USER_SELECTED`。
- [ ] `targetSdk = 33+` 时,`POST_NOTIFICATIONS` 在用户首次启用通知相关业务时弹框,启动时不弹。
- [ ] 在 Android 14 真机或模拟器上,选择"Select photos and videos"后,App 仍能读到那几张图,且 UI 提供"管理选择"入口。
- [ ] 永久拒绝任一权限后,业务路径上的 UI 给出"去系统设置"按钮,跳转到本 App 详情页。
- [ ] `adb shell pm reset-permissions` 后,所有权限回到 `NotRequested`,首次走流程能正常弹框。
- [ ] 横竖屏切换、进程被杀重启,`PermissionController` 重新计算的 `state` 与系统真实状态一致(`Granted` / `NotRequested`)。

## 5. 踩坑

**坑 1:把 `shouldShowRequestPermissionRationale` 当成"该不该展示文案"的布尔。** 它的真正语义是"用户拒绝过、但还允许再问"。所以它在"从未申请"和"永久拒绝"两种情况下都是 false,你不能根据它一个值判断该不该走 rationale 流程,必须配合"是否已 granted"和"是否调过 request"才能定位状态。Compose 里把这套判断包成 PermissionController,业务层就不会踩。

**坑 2:Accompanist Permissions 还在用。** `com.google.accompanist:accompanist-permissions` 库自 2024-09 起进入 deprecated 阶段(Google 推荐回归 `ActivityResultContracts`),新工程不要再引用它。已有项目可以平滑迁移,本篇给的 `rememberPermissionController` 就是对它的等价替代;迁移路径:删除 dependency,替换 `rememberPermissionState` 调用为本篇的 controller,绝大多数 API 形态对得上。

**坑 3:targetSdk 升到 33 之后通知不响。** Android 13+ 升级后,旧用户的 `POST_NOTIFICATIONS` 默认是未授权状态,你以前没申请过,通知 channel 创建成功但发不出来,且不抛任何异常。修复:在用户主动启用通知相关业务时调 `controller.request()`;不要在 App 启动时全量申请。

**坑 4:`READ_MEDIA_IMAGES` 申请到了,部分照片访问没处理。** Android 14 + targetSdk 34,用户选了"Select more photos" 后,你拿到的是 `READ_MEDIA_VISUAL_USER_SELECTED = granted` 而 `READ_MEDIA_IMAGES = denied`。如果你的代码只检查 `READ_MEDIA_IMAGES`,会误以为权限被拒绝,业务直接走"去设置"分支。修复:同时检查两个权限,任一 granted 就视为"可访问图片"。Compose 中把两个 controller 组合即可。

**坑 5:用 `onRequestPermissionsResult` override 而不是 Activity Result API。** 单 Activity 架构下,你的所有 UI 都在 Compose 里,Activity 没有可写代码的入口。即使你硬塞 override,回调里的 `requestCode` 没有标准来源,容易和导航的其他逻辑冲突。把所有权限申请都走 `rememberLauncherForActivityResult` 是唯一干净的路。

**坑 6:权限状态被持久化到 DataStore。** 看似"避免每次启动重新查询",实际是把状态机污染源直接搬到了 App 里。用户在系统设置撤销权限,你的 DataStore 还是 granted,业务路径直接 IllegalStateException。**永远不要持久化权限状态**,每次进入相关 UI 时通过 `ContextCompat.checkSelfPermission` 查一遍才是正确做法。

**坑 7:在 ViewModel 里调权限申请。** ViewModel 没有 Activity / Context,且生命周期长于 Compose UI,你无法注册 Activity Result launcher。权限申请的发起点必须在 Composable 里(通过 launcher),ViewModel 只负责承接"已授权 / 未授权 / 已请求"的结果状态。这是 Compose 单向数据流在权限场景的具体落地。

**坑 8:`READ_EXTERNAL_STORAGE` 没加 `maxSdkVersion=32`。** Android 13+ 设备上这个权限对图片完全失效,但 PackageManager 仍能"承认"它的存在,造成 Play Console 隐私审核时被警告"申请了不必要的权限",影响 Data Safety 表单审批。`maxSdkVersion` 是给系统看的硬声明,必须加。

**坑 9:Health Connect 权限走标准 Activity Result。** Health Connect 用 `PermissionController.createRequestPermissionResultContract()`,弹的是 Health Connect 自己的 UI 而不是系统权限弹框。如果你硬走 `RequestPermission`,系统会因为 manifest 里没有对应 dangerous permission 名直接 deny,且不解释原因。Health Connect 权限名是 `android.permission.health.READ_STEPS` 这种带 `.health.` 前缀的私有命名空间。

**坑 10:把 `ACCESS_FINE_LOCATION` 和 `ACCESS_BACKGROUND_LOCATION` 一起申请。** Android 11+ 起,后台位置权限必须单独申请,且必须先拥有前台位置权限。把两个一起塞进 `RequestMultiplePermissions`,后台位置那一项会被静默 deny。流程必须是:先申前台,拿到后再申后台,且 Android 11+ 后台位置弹的是"前往设置"对话框,而不是系统标准弹框,体验上不可直接用 launcher。位置权限有自己的细化心智,在本篇不展开,但写位置相关业务时一定先单独读一遍 [Android Location Updates](https://developer.android.com/training/location)。

**坑 11:在 Application 的 `onCreate` 里查权限然后初始化 SDK。** 比如 Crashlytics 想读 `READ_PHONE_STATE`(早期版本),你在 Application onCreate 直接调它的 init,如果权限还没给,SDK 默默降级,你也没机会重试。正确做法:任何依赖权限的 SDK 初始化都延迟到权限授予回调里。这条心智对 17 篇的 ForegroundService 同样适用——前台服务有自己的权限矩阵,Application onCreate 不要直接 startForegroundService。

**坑 12:`POST_NOTIFICATIONS` 写在 `<uses-permission>` 但 minSdk < 33,真机上 Android 12 没有这个权限。** 不是坑,但要清楚:Android 12 及以下,这个权限不存在,系统会忽略你的声明,通知默认开。代码里查这个权限的状态时记得用 `Build.VERSION.SDK_INT >= 33` 兜底,否则旧设备上 `checkSelfPermission` 永远返回 `PERMISSION_DENIED`,你的业务会误判为"用户拒绝了通知"而走限流分支。

**坑 13:用同一个 launcher 申请多个权限,但不知道哪个被拒。** 用 `RequestMultiplePermissions` 时回调是 `Map<String, Boolean>`,顺序不一定和你传入的列表一致。判断"哪些被拒、需要 rationale"时,务必按 key 名而不是位置遍历;另外这个 contract 也不返回部分授权,需要的话仍要靠 `READ_MEDIA_VISUAL_USER_SELECTED` 的单独检查。

**坑 14:权限弹框被设备厂商定制后行为微妙不一致。** 国内一些厂商(MIUI、ColorOS、HyperOS)在 dangerous 权限上额外加了一层"应用权限管理"系统弹框,有时会出现"用户在 Google 弹框点了允许,但厂商管理层默认拒绝"的双层状态。`checkSelfPermission` 仍返回 granted,但实际能力受厂商管控失败。这不是 Android API 能解决的问题,典型补救是:在权限授予后,实际调用能力(open camera / read mediastore)时再用一次 try-catch 兜底,失败时引导用户去厂商权限管理。这条只在国内市场上反复出现,海外用户基本无感。跨系列链接:[[安全合规系列]] 会专门讨论国内合规渠道与厂商权限管控的差异。

## 手动验证

- [ ] 全新安装 NotedX,首次启动不出现任何权限弹框。
- [ ] 点"添加图片"按钮,系统弹相册权限对话框;允许 → 直接打开 Photo Picker;拒绝 → 再点一次按钮先看到 rationale 对话框。
- [ ] 永久拒绝相册权限后,点按钮看到"前往系统设置"按钮,跳转到本 App 详情页。
- [ ] 打开设置里"通知同步"开关,弹通知权限对话框;拒绝后开关自动回弹到 OFF。
- [ ] Android 14 真机:相册权限选"Select photos and videos",授权三张图后,App 仍能列出这三张缩略图,且 UI 显示"管理选择的图片"按钮。
- [ ] `adb shell pm reset-permissions` 后,所有上述流程行为与全新安装一致。

> 下一篇 [[17 篇:WorkManager 与 Foreground Service]] 会接续这条心智:Android 15 把"声明前台服务"和"运行时权限"联结成新的矩阵,FGS type 和对应 dangerous 权限必须配对,否则上线即崩。
