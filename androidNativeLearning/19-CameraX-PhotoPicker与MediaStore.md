# 19-CameraX、Photo Picker 与 MediaStore

> 一句话导读:Android 拍照与媒体访问的现代答案是 CameraX 三件套 + Photo Picker + MediaStore Scoped Storage,工程师该关心的不是"怎么打开相机",而是"权限要不要、UseCase 怎么挂、写文件能不能落到相册"。

第 16 篇([[androidNativeLearning 16]])讲了权限模型,把 `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO` / `READ_MEDIA_VISUAL_USER_SELECTED` 三种"看相册"的姿势铺开;第 17 / 18 篇覆盖后台与通知。到了 19 篇,目标变成"让 NotedX 这个笔记应用能拍一张照片当附件、能让用户从相册里挑几张图、能把生成的图安全写回媒体库"。这件事在 Android 7-10 时代非常痛苦——Camera2 直接调要写几百行 `CameraCaptureSession`,文件路径要走 `getExternalStorageDirectory()`,Android 10 后 Scoped Storage 又把旧代码全部废掉。CameraX 1.4 + Photo Picker(Android 13+,Jetpack 兼容到 Android 4.4)+ MediaStore 的组合,把这件事压回到几十行 Compose 代码,且默认就符合最严的隐私基线。

本篇要解决的核心问题:

- CameraX 的 `Preview` / `ImageCapture` / `VideoCapture` / `ImageAnalysis` 四个 UseCase 在 Compose 里怎么挂、生命周期怎么绑?
- `PreviewView` 是个传统 `View`,在 Compose 里通过 `AndroidView` interop 怎么写不出 bug?
- Photo Picker 为什么是 Android 13+ 媒体选择的"新默认",和老的 `ACTION_PICK` 有什么本质差别?
- `READ_MEDIA_VISUAL_USER_SELECTED` 这个"部分授权"模型,工程上该怎么处理 UI 提示与重新进入选择器?
- 拍出来的图,怎么用 `MediaStore.Images` API 写到 `DCIM/NotedX/` 而不申请 `WRITE_EXTERNAL_STORAGE`?

读完后你应当能在 NotedX 主线工程里加一个"拍照 + 选图"附件功能,且这部分代码在 Android 8(API 26 minSdk)到 Android 15(API 35 targetSdk)全跨度上行为一致。ML Kit 端侧识别与 `MediaProjection` 录屏在本篇末尾只点一下入口,主线锁定 CameraX 三件套 + MediaStore + Photo Picker。

## 1. 机制定位

### CameraX 在解决什么

Android 的相机栈在 7.0 引入 Camera2 之后并没有变好——Camera2 是一套异步 callback 大杂烩,开发者要自己管理 `CameraDevice` / `CameraCaptureSession` / `CaptureRequest` / `ImageReader` / `Surface` 生命周期,稍微一处疏忽就会泄露相机句柄,导致系统拒绝再次打开。更糟的是设备碎片化:不同厂商 OEM 对 `LEGACY` / `LIMITED` / `FULL` / `LEVEL_3` 支持度天差地别,同一段 Camera2 代码在小米能跑、在三星黑屏的事屡见不鲜。

CameraX 是 Jetpack 在 2019 年起做的"相机使用层"封装,1.0 在 2021 进入 stable,1.4 是 2024 后期的主线版本。它的关键设计:

- **基于 UseCase 而非 Surface**。开发者声明 "我要预览 + 拍照 + 分析",CameraX 在内部分配 `Surface` 与 `CaptureRequest`,自动选择分辨率,自动处理设备兼容性矩阵(CameraX `CameraXConfig` 内置了 OEM 兼容补丁库)。
- **绑定到 `LifecycleOwner`**。`cameraProvider.bindToLifecycle(lifecycleOwner, selector, ...useCases)` 一行,相机会在 `onStart` 自动启动、`onStop` 自动释放,你不再需要手写 `onPause` 关相机。
- **配合协程**。`ProcessCameraProvider.getInstance(context)` 返回 `ListenableFuture`,可以 `.await()` 在协程里阻塞性等待;`takePicture` 也有协程友好的封装(后文给出)。
- **不强求自己写预览 View**。`PreviewView` 是一个传统 Android `View`,内部根据设备能力选 `SurfaceView` 或 `TextureView`,且默认处理好了缩放、旋转、deformation。

> 我们**绝不**讨论"如何直接调 Camera2"。Camera2 API 已不是 2026 年新代码的现实选择,只有在做 ProCamera 类专业 App、需要逐帧控制曝光时段时才考虑,而那种场景 CameraX 的 `Camera2Interop` 扩展点也足够覆盖。

### Photo Picker 与"选择性媒体访问"

Android 13(API 33)正式引入系统 Photo Picker:`ActivityResultContracts.PickVisualMedia()`(单选)与 `PickMultipleVisualMedia()`(多选)。它和老的 `Intent.ACTION_PICK` / `ACTION_GET_CONTENT` 有几个本质差别:

- **无需任何权限**。Photo Picker 由系统进程托管 UI,用户在 picker 里选什么、你的 App 才能拿到什么 URI,等同于"用户主动给"。`READ_MEDIA_IMAGES` 是访问"整个相册"的权限,Photo Picker 只授予所选项目的临时 grant。
- **OEM 一致体验**。Photo Picker 由系统提供 UI,所有厂商定制 ROM 看到的都是同一套布局,Google 也通过 Modular System Component(可独立更新)向 API 11+ 设备 backport。
- **隐私默认收紧**。Google 在 Play Console 中要求,如果你的 App 只是"让用户挑一张照片做附件",理论上**不应该**申请 `READ_MEDIA_IMAGES`——审核可能直接拒绝。Photo Picker 是合规的标准答案。

那 `READ_MEDIA_VISUAL_USER_SELECTED` 又是干什么?这是 Android 14(API 34)新增的"部分访问"模式:用户授予权限时可以选"只授权这几张照片",App 此后调用 `MediaStore` 查询时只能看到这几张。它的典型场景是社交类 App——用户想给头像换照片不需要给整个相册,但你又确实需要走 MediaStore 索引(比如要做"最近添加")。本系列定位是工程化:**优先用 Photo Picker;只有在你**真的**需要遍历 MediaStore(做画廊类 App、做相册分类)才考虑 `READ_MEDIA_IMAGES` + `READ_MEDIA_VISUAL_USER_SELECTED`。**

### MediaStore Scoped Storage 现状

Android 10(API 29)启用 Scoped Storage 后,App 不再有"看见整个 SD 卡"的权力。`MediaStore.Images.Media.EXTERNAL_CONTENT_URI` 是唯一允许写入相册的合规通道。Android 11 / 12 / 13 / 14 / 15 一路加强,2026 年的现状是:

- **写入自己 App 创建的 Media** 不需要任何权限。直接 `contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)` 即可,系统会把文件归在你的 App 名下。
- **修改 / 删除其他 App 创建的 Media** 需要发起 `MediaStore.createWriteRequest()` / `createDeleteRequest()`,系统弹一个对话框让用户确认。
- **`WRITE_EXTERNAL_STORAGE` 在 Android 10+ 已是 no-op**,Android 14+ targetSdk 34 起完全废弃。`MANAGE_EXTERNAL_STORAGE` 只允许文件管理器类 App,Play 上架审核非常严。

> 简单结论:NotedX 这种"写一张自己拍的图到相册 + 让用户选几张已有的图"的工作流,**一个运行时权限都不需要**——CameraX 自己处理 `CAMERA`,Photo Picker 不需要,MediaStore 写入自己的文件不需要。

## 2. Android 心智

### 类层级与依赖

CameraX 模块(`androidx.camera:camera-*`)分为多个 artifact,实际项目里需要按需引入:

```
androidx.camera.core      -> Preview / ImageCapture / VideoCapture / ImageAnalysis 等 UseCase 抽象
androidx.camera.camera2   -> Camera2 实现(必选)
androidx.camera.lifecycle -> ProcessCameraProvider / bindToLifecycle()
androidx.camera.view      -> PreviewView(基于 View)/ CameraController(可选简化路径)
androidx.camera.video     -> VideoCapture / Recorder / Quality
androidx.camera.extensions -> HDR / Night / Beauty / Bokeh 厂商扩展
androidx.camera.compose   -> CameraXViewfinder(可选,1.4+ 实验性 Compose 原生预览)
```

`PreviewView` 是 1.4 时期最稳的预览组件——它**仍然是一个 View**,因为 Compose 里直接画相机帧到 Surface 需要 `AndroidExternalSurface` / `AndroidEmbeddedExternalSurface`(Compose 1.7 新增),官方虽给出 `camera-compose` artifact 但生态成熟度不如 `PreviewView`。本篇主线用 `AndroidView { PreviewView }` interop,末尾点一下 `CameraXViewfinder` 作为延伸。

### UseCase 心智图

CameraX 的核心抽象是 UseCase。一个 `CameraProvider` 同时只能绑定有限组合(典型设备允许 Preview + ImageCapture + ImageAnalysis 或 Preview + VideoCapture,不能 4 件全开):

```
       LifecycleOwner
            |
    bindToLifecycle()
            |
            v
      Camera (front / back)
      /    |    \    \
   Preview Capture Analysis Video
     |       |       |        |
PreviewView ImageProxy ImageProxy Recorder
```

四个 UseCase 的职责:

- **Preview**:把相机帧送到 `Preview.SurfaceProvider`,本篇里这个 provider 由 `PreviewView` 提供。
- **ImageCapture**:发起一次"高质量拍照",回调 `ImageCapture.OnImageCapturedCallback` 或 `ImageCapture.OnImageSavedCallback`。
- **VideoCapture**:绑定一个 `Recorder`,开始 / 暂停 / 停止录像。
- **ImageAnalysis**:每帧给你一个 `ImageProxy`,适合做 ML Kit 端侧识别、扫码、姿态估计。

绑定时不写 Preview 也能拍照(无预览的"哑相机"),但实际产品永远要预览。绑定一次后想换 UseCase 必须先 `cameraProvider.unbindAll()` 再 `bindToLifecycle()`,这一点和大多数响应式框架不同,容易踩。

### Compose 与 View interop 的边界

`AndroidView { factory = { PreviewView(it) } }` 是把 View 嵌进 Compose 的标准做法,但是有几个隐藏成本:

- **重组每次都会调 `update` lambda**,不会调 `factory`。所以"设置相机"的代码要写在 `LaunchedEffect` 里(由 key 控制何时重启),不要塞进 `update`。
- **View 不会跟着 Compose 的状态变化自动重组**,你要在 ViewModel 里持有 `cameraController` 或 `previewView` 的引用(用 `Ref<T>` 模式或 `remember { mutableStateOf<PreviewView?>(null) }`)。
- **`AndroidView` 占用整个测量空间**,默认 fill。如果你想要相机预览只占一半屏幕,把 `Modifier.fillMaxWidth().aspectRatio(3f / 4f)` 这种约束写在 `AndroidView` 上。

### 权限的临界点

CameraX 内部不申请权限——你必须自己用 `ActivityResultContracts.RequestPermission` 拿到 `Manifest.permission.CAMERA`。Photo Picker 不要权限。MediaStore 写自己创建的文件不要权限。所以 NotedX 拍照附件流程只有"开相机"这一处会弹权限对话框。如果只是选图,完全无权限。这件事直接影响 Play Data Safety 表单上你勾选的项,是合规上的实质差异。

## 3. 工程实现

### `build.gradle.kts` 与 `libs.versions.toml`

```kotlin
// gradle/libs.versions.toml(节选)
[versions]
camerax = "1.4.0"
activityCompose = "1.9.3"
lifecycleCompose = "2.8.7"

[libraries]
androidx-camera-core       = { module = "androidx.camera:camera-core",       version.ref = "camerax" }
androidx-camera-camera2    = { module = "androidx.camera:camera-camera2",    version.ref = "camerax" }
androidx-camera-lifecycle  = { module = "androidx.camera:camera-lifecycle",  version.ref = "camerax" }
androidx-camera-view       = { module = "androidx.camera:camera-view",       version.ref = "camerax" }
androidx-camera-video      = { module = "androidx.camera:camera-video",      version.ref = "camerax" }
androidx-activity-compose  = { module = "androidx.activity:activity-compose", version.ref = "activityCompose" }
androidx-lifecycle-runtime-compose = { module = "androidx.lifecycle:lifecycle-runtime-compose", version.ref = "lifecycleCompose" }
```

```kotlin
// app/build.gradle.kts(节选)
dependencies {
    implementation(libs.androidx.camera.core)
    implementation(libs.androidx.camera.camera2)
    implementation(libs.androidx.camera.lifecycle)
    implementation(libs.androidx.camera.view)
    implementation(libs.androidx.camera.video)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
}
```

### `AndroidManifest.xml` 声明

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.CAMERA" />
    <uses-feature
        android:name="android.hardware.camera.any"
        android:required="false" />

    <application
        android:name=".NotedXApp"
        android:label="@string/app_name"
        android:theme="@style/Theme.NotedX">
        <!-- Photo Picker / MediaStore 写入均不需要权限声明 -->
    </application>
</manifest>
```

`camera.any` 而不是 `camera` —— `camera` 历史含义是"后置相机",`camera.any` 包含前置、外接 USB 相机,平板与 ChromeOS 用户体验更友好。`required="false"` 让没相机的设备也能安装(只是不显示拍照功能)。

### 相机权限弹窗

Compose 化的权限请求,封装成可复用 Composable:

```kotlin
package com.example.notedx.camera

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.*
import androidx.core.content.ContextCompat
import androidx.compose.ui.platform.LocalContext

@Composable
fun rememberCameraPermissionState(): CameraPermissionState {
    val context = LocalContext.current
    var hasPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(
                context, Manifest.permission.CAMERA
            ) == android.content.pm.PackageManager.PERMISSION_GRANTED
        )
    }
    val launcher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted -> hasPermission = granted }

    return remember(hasPermission) {
        CameraPermissionState(
            hasPermission = hasPermission,
            request = { launcher.launch(Manifest.permission.CAMERA) }
        )
    }
}

@Stable
data class CameraPermissionState(
    val hasPermission: Boolean,
    val request: () -> Unit,
)
```

### CameraX 拍照核心

抽象一个 `CameraXController`,把 UseCase 创建、绑定、拍照、释放都封进来,Composable 只调状态:

```kotlin
package com.example.notedx.camera

import android.content.ContentValues
import android.content.Context
import android.provider.MediaStore
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import kotlinx.coroutines.suspendCancellableCoroutine
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class CameraXController(private val appContext: Context) {

    private var imageCapture: ImageCapture? = null
    private var cameraProvider: ProcessCameraProvider? = null

    suspend fun bind(
        lifecycleOwner: LifecycleOwner,
        previewView: PreviewView,
        facing: Int = CameraSelector.LENS_FACING_BACK,
    ) {
        val provider = ProcessCameraProvider.awaitInstance(appContext)
        val preview = Preview.Builder().build().apply {
            surfaceProvider = previewView.surfaceProvider
        }
        val capture = ImageCapture.Builder()
            .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
            .build()
        val selector = CameraSelector.Builder().requireLensFacing(facing).build()
        provider.unbindAll()
        provider.bindToLifecycle(lifecycleOwner, selector, preview, capture)
        cameraProvider = provider
        imageCapture = capture
    }

    suspend fun takePicture(): android.net.Uri = suspendCancellableCoroutine { cont ->
        val capture = imageCapture ?: return@suspendCancellableCoroutine cont.resumeWithException(
            IllegalStateException("ImageCapture not bound")
        )
        val name = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, "NotedX_$name.jpg")
            put(MediaStore.MediaColumns.MIME_TYPE, "image/jpeg")
            put(MediaStore.MediaColumns.RELATIVE_PATH, "DCIM/NotedX")
        }
        val options = ImageCapture.OutputFileOptions.Builder(
            appContext.contentResolver,
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
            values
        ).build()
        capture.takePicture(
            options,
            ContextCompat.getMainExecutor(appContext),
            object : ImageCapture.OnImageSavedCallback {
                override fun onImageSaved(output: ImageCapture.OutputFileResults) {
                    val uri = output.savedUri
                    if (uri != null) cont.resume(uri)
                    else cont.resumeWithException(IllegalStateException("No URI"))
                }
                override fun onError(exc: ImageCaptureException) {
                    cont.resumeWithException(exc)
                }
            }
        )
    }

    fun release() {
        cameraProvider?.unbindAll()
        cameraProvider = null
        imageCapture = null
    }
}
```

注意几处工程取舍:

- `ProcessCameraProvider.awaitInstance(context)` 是 1.4+ 的协程 KTX,内部用 `ListenableFuture` 转 suspend,避免老代码里 `Futures.addCallback` 的样板。
- `setCaptureMode(CAPTURE_MODE_MINIMIZE_LATENCY)` 比 `MAXIMIZE_QUALITY` 快很多,适合做笔记附件;旗舰机型才会真正用到 HDR 多帧合成。
- `OutputFileOptions` 用 `MediaStore` URI 而不是 `File`——这是 Scoped Storage 唯一合规通道。`RELATIVE_PATH = "DCIM/NotedX"` 会把图片放进相册的 NotedX 子目录,系统相册 App 默认能扫描到。

### Compose 屏幕组合

```kotlin
package com.example.notedx.camera.ui

import androidx.activity.compose.BackHandler
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.unit.dp
import com.example.notedx.camera.CameraXController
import com.example.notedx.camera.rememberCameraPermissionState
import kotlinx.coroutines.launch

@Composable
fun CameraCaptureScreen(onCaptured: (android.net.Uri) -> Unit, onBack: () -> Unit) {
    val context = LocalContext.current
    val owner = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()
    val perm = rememberCameraPermissionState()
    val controller = remember { CameraXController(context.applicationContext) }
    var isBusy by remember { mutableStateOf(false) }

    DisposableEffect(Unit) { onDispose { controller.release() } }
    BackHandler(onBack = onBack)

    Box(Modifier.fillMaxSize()) {
        if (!perm.hasPermission) {
            Column(
                modifier = Modifier.fillMaxSize(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Text("需要相机权限才能拍照")
                Spacer(Modifier.height(12.dp))
                Button(onClick = perm.request) { Text("授予相机权限") }
            }
        } else {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { ctx ->
                    PreviewView(ctx).also { pv ->
                        pv.implementationMode =
                            PreviewView.ImplementationMode.PERFORMANCE
                        pv.scaleType = PreviewView.ScaleType.FILL_CENTER
                        scope.launch { controller.bind(owner, pv) }
                    }
                }
            )
            FloatingActionButton(
                onClick = {
                    if (isBusy) return@FloatingActionButton
                    scope.launch {
                        isBusy = true
                        runCatching { controller.takePicture() }
                            .onSuccess(onCaptured)
                        isBusy = false
                    }
                },
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 32.dp)
            ) { Text(if (isBusy) "..." else "拍照") }
        }
    }
}
```

### Photo Picker:无权限选图

Photo Picker 是一个 `ActivityResultContract`,不需要任何权限:

```kotlin
package com.example.notedx.media

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable

@Composable
fun rememberPhotoPicker(
    maxItems: Int = 9,
    onPicked: (List<Uri>) -> Unit,
): () -> Unit {
    val launcher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickMultipleVisualMedia(maxItems)
    ) { uris -> onPicked(uris) }
    return {
        launcher.launch(
            PickVisualMediaRequest(
                ActivityResultContracts.PickVisualMedia.ImageAndVideo
            )
        )
    }
}
```

调用方一行:

```kotlin
val pickPhotos = rememberPhotoPicker(maxItems = 5) { uris ->
    // uris 是 content:// URI 列表,直接 contentResolver.openInputStream(uri) 读字节
}
Button(onClick = pickPhotos) { Text("从相册选图") }
```

Photo Picker 在 Android 11+ 走 Google Play Services Modular System Component,Android 13+ 走系统进程,两者 API 一致。`PickVisualMedia.ImageAndVideo` 是 `VisualMediaType` 枚举,可换 `ImageOnly` / `VideoOnly` / 自定义 `SingleMimeType("image/png")`。

### `READ_MEDIA_VISUAL_USER_SELECTED` 部分访问

只有需要遍历整个相册时才走这条路。Manifest:

```xml
<!-- Android 13+ -->
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
<uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />
<!-- Android 14+,声明这个权限后系统才会显示"仅这些" / "全部" 三选一对话框 -->
<uses-permission android:name="android.permission.READ_MEDIA_VISUAL_USER_SELECTED" />
```

请求逻辑:

```kotlin
suspend fun requestMediaAccess(activity: ComponentActivity): MediaAccessLevel {
    val perms = mutableListOf(Manifest.permission.READ_MEDIA_IMAGES)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        perms += Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED
    }
    val results = activity.requestPermissionsAsync(perms.toTypedArray())
    return when {
        results[Manifest.permission.READ_MEDIA_IMAGES] == true -> MediaAccessLevel.FULL
        results[Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED] == true ->
            MediaAccessLevel.PARTIAL
        else -> MediaAccessLevel.NONE
    }
}

enum class MediaAccessLevel { FULL, PARTIAL, NONE }
```

当 App 进入"PARTIAL"状态,UI 需要给用户一个"再选几张"按钮(系统不会自动持续提示)。点击后再次 `requestPermissions` 系统会重新弹选择器,允许用户追加或更换授权项。**不要写成"如果不是 FULL 就跳设置"——这违反 Google 的隐私设计指南,Play 审核可能拒绝。**

## 4. 调参与验收

### 关键参数对照

| 参数 | 默认 | 建议 | 影响 |
| --- | --- | --- | --- |
| `ImageCapture.setCaptureMode()` | `MINIMIZE_LATENCY` | 笔记类用默认;影像类用 `MAXIMIZE_QUALITY` | 后者会启用多帧 HDR,延迟翻倍 |
| `PreviewView.ImplementationMode` | `PERFORMANCE` | 大多数用默认 | 选 `COMPATIBLE` 时改用 `TextureView`,旧机型预览不闪烁但耗电略高 |
| `PreviewView.ScaleType` | `FILL_CENTER` | 视产品 | `FIT_CENTER` 保留全帧但有黑边 |
| `CameraSelector.LENS_FACING_*` | `BACK` | 笔记 OCR 用 `BACK`,自拍用 `FRONT` | 切换需 `unbindAll()` 重新绑 |
| `ImageCapture.targetRotation` | 跟随 `PreviewView` | 大多数无需手动设置 | 关掉自动旋转时,JPEG EXIF 不对齐 |
| Photo Picker `maxItems` | 系统默认 | 一般 5-10 | >限额自动截断 |

### 启动延迟验收

CameraX 1.4 在 Pixel 7 上 cold-bind 到第一帧预览大约 300-500 ms;低端机(Helio G35 这类)能到 1.2 s。验收方法:

```kotlin
val t0 = SystemClock.elapsedRealtime()
controller.bind(owner, previewView)
previewView.previewStreamState.observe(owner) { state ->
    if (state == PreviewView.StreamState.STREAMING) {
        Log.d("CameraX", "bind -> first frame: ${SystemClock.elapsedRealtime() - t0} ms")
    }
}
```

如果首帧 > 2 s,通常是 OEM 厂商兼容补丁缺失,或 `ImplementationMode.COMPATIBLE` 被强制启用。改用 `PERFORMANCE` 模式可降一半。

### 拍照延迟验收

`MINIMIZE_LATENCY` 在中端机上 takePicture 端到端 200-400 ms;`MAXIMIZE_QUALITY` 500-1500 ms。验收:在 `takePicture` 前后各打 `SystemClock.elapsedRealtime()`,对比写入 MediaStore 的延迟。如果 > 1.5 s,通常是 ContentResolver 在主线程写大 JPEG,把 `ContextCompat.getMainExecutor` 换成 `Dispatchers.IO` 对应的 `Executor` 试试(注意 CameraX 1.4 大部分 callback 已经在工作线程)。

### 写入 MediaStore 验收

```
adb shell content query --uri content://media/external/images/media \
    --projection _id:_display_name:relative_path \
    --where "relative_path LIKE 'DCIM/NotedX%'"
```

应能看到刚写入的 JPEG 文件。如果没有,检查:
- `RELATIVE_PATH` 是否拼写正确(`DCIM/NotedX` 而非 `DCIM/NotedX/`,尾斜杠会让某些机型扫描失败)。
- `MIME_TYPE` 是否填了(不填会被识别成 `application/octet-stream`,不进入图库索引)。
- targetSdk 是否 ≥ 29,Android 10 以下 Scoped Storage 不生效,需走传统 `getExternalStoragePublicDirectory()`(本系列 minSdk 26 默认进 Scoped 路径)。

### Photo Picker 验收

Photo Picker 没有"权限是否被拒"这件事,只有"用户是否选了"。验收方式:
- 选 1 张:`onPicked` 收到 1 个 URI。
- 关闭 picker 不选:`onPicked` 收到空列表(不是 null)。
- `contentResolver.openInputStream(uri)` 能读出有效 JPEG header(前两字节 `FF D8`)。

## 5. 踩坑

### 坑 1:在 `AndroidView` 的 `update` 里写相机绑定

新手最常见错误。`update` 每次重组都会触发,会导致 CameraProvider 被反复绑定,出现"预览闪烁 / 帧率掉到 5 fps / 闪退"。正确做法:**`factory` 里只创建 PreviewView,bind 写在 `LaunchedEffect`** 或 `factory` 的 lambda 里执行一次。

### 坑 2:忘记 `DisposableEffect` 释放控制器

`CameraXController` 持有 `ProcessCameraProvider`,后者持有 `LifecycleObserver` 与 `Camera2` 句柄。Composable 离开屏幕后如果不 `release()`,小米机型会拒绝下一次打开相机("Camera is being used by another process"),用户必须杀掉 App 才能恢复。务必写 `DisposableEffect(Unit) { onDispose { controller.release() } }`。

### 坑 3:`PreviewView` 在折叠屏旋转时画面撕裂

Android 15 折叠屏 fold/unfold 时,Configuration changes 会触发 `Activity` 重建,`PreviewView` 重新创建。如果你没在 ViewModel 持有 controller 状态,会出现"展开后预览黑屏"。两种修法:
- AndroidManifest 给 Activity 加 `android:configChanges="orientation|screenSize|screenLayout|smallestScreenSize"`,自己处理布局变化。
- 或保留 ViewModel,通过 `rememberSaveable` + `SavedStateHandle` 让 Compose 状态跨重建。

第二种更现代,推荐用。

### 坑 4:用 `File` API 写 `DCIM` 在 Android 11+ 失败

老教程残留 `File(Environment.getExternalStoragePublicDirectory(DIRECTORY_DCIM), "x.jpg")` 的写法,在 Android 11(API 30)以上对**非 Media 类型文件**完全失效,即使是 JPEG,也只在 App 私有 `getExternalFilesDir(DIRECTORY_DCIM)` 下可写,而那个路径不进图库。正确做法只有一个:`MediaStore.Images.Media.EXTERNAL_CONTENT_URI` + `contentResolver.insert`。

### 坑 5:Photo Picker 与老的 `ACTION_GET_CONTENT` 混用

老代码经常写 `Intent(Intent.ACTION_GET_CONTENT).setType("image/*")`,看起来"也能选图"。问题:
- Android 13+ 这个 Intent 弹出的是 SAF(Storage Access Framework)文件选择器,UI 与 Photo Picker 不同。
- Google Play 政策要求"如只是选媒体,应使用 Photo Picker"。审核会标黄。
- SAF 返回的 URI 长期可读取权限要 `takePersistableUriPermission`,Photo Picker 是临时 grant,边界完全不同。

**新代码一律走 Photo Picker(`PickVisualMedia` 系列 Contract)。** SAF 留给"选 PDF / Word 文档"这种非媒体场景。

### 坑 6:`READ_MEDIA_VISUAL_USER_SELECTED` 拿到部分访问后不重新查 MediaStore

部分访问下,`MediaStore` 查询返回的列表只包含用户授权的项目。如果你的 UI 还显示"上次缓存的全相册列表",玩家选完之后看到的还是旧数据。每次回到画廊页都要重新 `query`,且加一个"再选几张"按钮调用 `requestPermissions` 让用户追加授权。

### 坑 7:`VideoCapture` 与 `ImageCapture` 不能同时启用

CameraX 1.4 在大多数设备上仍然不允许 Preview + VideoCapture + ImageCapture 同时绑定,因为底层 Camera2 的 surface 数量受限。要"边录像边截图",必须用 `VideoCapture` + `ImageAnalysis`(从分析帧里取 YUV → 转 JPEG 自己存)。文档明确写了 `bindToLifecycle` 抛 `IllegalArgumentException` 是 API 契约,不要 catch 后假装没事。

### 坑 8:`ImageAnalysis` 帧不释放导致背压

`ImageAnalysis` 默认 `STRATEGY_KEEP_ONLY_LATEST`,只保留最新一帧。如果你的 analyzer 在 `analyze(image: ImageProxy)` 里做了耗时操作(比如同步调用 ML Kit),没有 `image.close()`,CameraX 会停止送帧。正确写法:

```kotlin
imageAnalysis.setAnalyzer(Executors.newSingleThreadExecutor()) { proxy ->
    try {
        // do work
    } finally {
        proxy.close()
    }
}
```

每一次 analyze 必须配对 close,这是 ImageAnalysis 的生命周期契约。

### 坑 9:`ImageCapture.OutputFileOptions` 没写 `MIME_TYPE`

不填 `MIME_TYPE`,某些机型(尤其早期小米)会把文件存为 `application/octet-stream`,系统图库不识别。务必填 `image/jpeg`(或 `image/heic` 若你启用了 HEIF 输出)。

### 坑 10:`previewStreamState` 未观察就以为预览启动了

`previewView.previewStreamState` 是 LiveData,有 `IDLE` / `STREAMING` 两态。`bindToLifecycle` 返回不代表已经有第一帧,这之间往往 300-500 ms 是黑屏。UI 上需要在这段时间显示 loading 状态,否则用户以为相机崩了。Compose 友好的写法:

```kotlin
val streamState by previewView.previewStreamState.observeAsState(PreviewView.StreamState.IDLE)
if (streamState == PreviewView.StreamState.IDLE) {
    CircularProgressIndicator()
}
```

## 延伸:ML Kit 与 MediaProjection

ML Kit 端侧识别(条码、文字、姿态)通常和 `ImageAnalysis` 配合:每帧 `ImageProxy.image` 转 `InputImage.fromMediaImage(it, rotation)`,送入 `BarcodeScanning.getClient().process()`。这部分属于 [[aiLearning]] 端侧推理边界,本系列只给出集成入口:`com.google.mlkit:barcode-scanning` 等 artifact 已对 KSP 兼容,不要再用 Firebase ML(已退役)。

`MediaProjection` 是录屏 / 投屏的入口,Android 15 加了 "Partial Screen Sharing" 让用户只共享单 App 而不是整屏。流程是 `Intent` 拿 token → `MediaProjectionManager.getMediaProjection` → `createVirtualDisplay` 把 Surface 喂给 `MediaRecorder` 或 `MediaCodec`。这部分属于第 20 篇([[androidNativeLearning 20]])"系统集成"的延伸,本篇不展开。

## 手动验证

- [ ] 安装 NotedX,首次点击"拍照附件",弹出系统相机权限对话框,选"允许"后 1 秒内预览出图。
- [ ] 拒绝权限后回到入口,UI 显示"需要相机权限"按钮,点击重新唤起权限对话框(若用户选了"不再询问"则跳系统设置)。
- [ ] 按拍照键,500 ms 内回到笔记编辑页,附件缩略图出现且文件可在系统相册 `DCIM/NotedX` 下看到。
- [ ] 在系统设置 → 应用 → NotedX → 权限 → 媒体 选择"仅选择的内容",回到 App 点"从相册选图",picker 中只显示授权的若干张。
- [ ] 点击"从相册选图",picker 直接弹出,**不弹任何权限对话框**,选 3 张图,回调收到 3 个 URI 且 `openInputStream` 能读出有效 JPEG。
- [ ] 后台运行 `adb shell content query --uri content://media/external/images/media --where "relative_path LIKE 'DCIM/NotedX%'"`,看到 NotedX 写入的所有图片。
- [ ] 折叠屏展开后,预览不黑屏,拍照仍可用。
- [ ] 退出拍照页,`adb shell dumpsys media.camera` 中 NotedX 不应继续持有相机句柄。
