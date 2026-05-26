# CameraX、Photo Picker 与 MediaStore

> 一句话:**Android 现代媒体三件套——CameraX 拍、Photo Picker 选、MediaStore 写**,加在一起替代了上一代的 Camera2 + READ_EXTERNAL_STORAGE + 文件路径硬编码。

---

## 一、Android 媒体的现代选择

| 需求 | 现代答案 | 上代答案(避免) |
| --- | --- | --- |
| 拍照 / 录像 | **CameraX** | Camera2(代码量 5×)/ Camera(deprecated) |
| 选图 / 选视频 | **Photo Picker** | `READ_EXTERNAL_STORAGE` + `ACTION_PICK` |
| 写入相册 | **MediaStore** | `WRITE_EXTERNAL_STORAGE` + 路径硬编码 |
| 内部缓存图片 | 应用私有目录(`Context.filesDir`) | 同(没变) |

**Photo Picker** 是 Android 13+ 的"无权限选图器"——用户在系统选择器里挑哪张,你只能访问那一张,不需要任何媒体权限。这是当前**首选**。

**CameraX** 简化了 Camera2 的复杂度,把"管理 surface / 配置 capture session / 处理生命周期"这些苦力活封装掉。

---

## 二、Photo Picker:最简单的选图方式

```kotlin
@Composable
fun PhotoPickerButton(onSelected: (Uri) -> Unit) {
    val launcher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri ->
        if (uri != null) onSelected(uri)
    }

    Button(onClick = {
        launcher.launch(PickVisualMediaRequest(
            ActivityResultContracts.PickVisualMedia.ImageOnly
        ))
    }) { Text("选图") }
}
```

**就这么简单**——没有权限申请、没有 EXTERNAL_STORAGE、没有 MediaStore 查询。系统弹一个选择器,用户挑完返回 URI。

可选媒体类型:
- `ImageOnly` / `VideoOnly` / `ImageAndVideo` / `SingleMimeType("image/png")`

多选(API 30+):

```kotlin
val launcher = rememberLauncherForActivityResult(
    contract = ActivityResultContracts.PickMultipleVisualMedia(maxItems = 5),
) { uris -> /* List<Uri> */ }
```

**Photo Picker 对老版本兼容**——Android 11 以下用 Google Play 提供的兼容实现,Android 13+ 用系统原生。**永远首选 Photo Picker**,只有"需要从相册扫描所有图片做相册类 App"才用 `MediaStore` 查询。

---

## 三、保存图片到内部缓存

拿到 URI 后,你通常要把图片复制到 App 私有目录(URI 在 Photo Picker 给的是临时授权,App 重启可能失效):

```kotlin
suspend fun copyImageToInternal(ctx: Context, sourceUri: Uri): File =
    withContext(Dispatchers.IO) {
        val targetFile = File(ctx.filesDir, "images/${UUID.randomUUID()}.jpg").also {
            it.parentFile?.mkdirs()
        }
        ctx.contentResolver.openInputStream(sourceUri)?.use { input ->
            FileOutputStream(targetFile).use { output ->
                input.copyTo(output)
            }
        }
        targetFile
    }
```

应用私有目录(`Context.filesDir` / `Context.cacheDir`)**不需要任何权限**,App 卸载时自动清理。**适合存附件、缓存、内部资源**。

---

## 四、写入用户相册(MediaStore)

如果要让图片**对其他 App 可见**(出现在系统相册里),用 MediaStore:

```kotlin
suspend fun saveBitmapToGallery(ctx: Context, bitmap: Bitmap, displayName: String): Uri? =
    withContext(Dispatchers.IO) {
        val values = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, "$displayName.jpg")
            put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/NotedX")
                put(MediaStore.Images.Media.IS_PENDING, 1)
            }
        }

        val uri = ctx.contentResolver.insert(
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values
        ) ?: return@withContext null

        ctx.contentResolver.openOutputStream(uri)?.use { out ->
            bitmap.compress(Bitmap.CompressFormat.JPEG, 90, out)
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            values.clear()
            values.put(MediaStore.Images.Media.IS_PENDING, 0)
            ctx.contentResolver.update(uri, values, null, null)
        }
        uri
    }
```

**关键认识**:

1. **`IS_PENDING` 模式**——先标记 pending,写完再标记完成。中间崩了系统会清理半成品。
2. **`RELATIVE_PATH`**——指定保存到相册的子目录,默认全在 Pictures 根目录,体验差。
3. **不需要 WRITE_EXTERNAL_STORAGE**——API 29+ 起,自己 App 用 MediaStore 写入自己的内容不需要权限。

---

## 五、CameraX:相机的最小可用代码

CameraX 是 Jetpack 提供的相机封装。功能:**预览 + 拍照 + 录像 + 图像分析**(机器学习用)。

依赖(02 篇已配):

```kotlin
implementation(libs.androidx.camera.core)
implementation(libs.androidx.camera.camera2)
implementation(libs.androidx.camera.lifecycle)
implementation(libs.androidx.camera.view)
```

权限:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-feature android:name="android.hardware.camera" android:required="false" />
```

`required="false"` 让没相机的设备也能装 App,运行时检测有没有相机。

---

## 六、CameraX + Compose:预览 + 拍照

CameraX 的 `PreviewView` 是 View,Compose 里用 `AndroidView` 嵌入:

```kotlin
@Composable
fun CameraCapture(
    onPhotoTaken: (Uri) -> Unit,
    onError: (Throwable) -> Unit,
) {
    val ctx = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val executor = remember { ContextCompat.getMainExecutor(ctx) }
    val imageCapture = remember { ImageCapture.Builder().build() }

    Box(modifier = Modifier.fillMaxSize()) {
        AndroidView(
            factory = { previewCtx ->
                PreviewView(previewCtx).apply {
                    scaleType = PreviewView.ScaleType.FILL_CENTER
                }
            },
            modifier = Modifier.fillMaxSize(),
            update = { previewView ->
                val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)
                cameraProviderFuture.addListener({
                    val cameraProvider = cameraProviderFuture.get()
                    val preview = Preview.Builder().build().also {
                        it.surfaceProvider = previewView.surfaceProvider
                    }
                    val selector = CameraSelector.DEFAULT_BACK_CAMERA
                    try {
                        cameraProvider.unbindAll()
                        cameraProvider.bindToLifecycle(
                            lifecycleOwner, selector, preview, imageCapture
                        )
                    } catch (e: Exception) {
                        onError(e)
                    }
                }, executor)
            },
        )

        FloatingActionButton(
            onClick = { takePhoto(ctx, imageCapture, executor, onPhotoTaken, onError) },
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(32.dp),
        ) {
            Icon(Icons.Default.PhotoCamera, contentDescription = "拍照")
        }
    }
}

private fun takePhoto(
    ctx: Context,
    imageCapture: ImageCapture,
    executor: Executor,
    onSuccess: (Uri) -> Unit,
    onError: (Throwable) -> Unit,
) {
    val name = "NotedX_${System.currentTimeMillis()}.jpg"
    val values = ContentValues().apply {
        put(MediaStore.Images.Media.DISPLAY_NAME, name)
        put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/NotedX")
        }
    }
    val output = ImageCapture.OutputFileOptions.Builder(
        ctx.contentResolver,
        MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
        values
    ).build()

    imageCapture.takePicture(
        output, executor,
        object : ImageCapture.OnImageSavedCallback {
            override fun onImageSaved(results: ImageCapture.OutputFileResults) {
                results.savedUri?.let { onSuccess(it) }
            }
            override fun onError(e: ImageCaptureException) {
                onError(e)
            }
        }
    )
}
```

**几个关键点**:

1. **`bindToLifecycle(lifecycleOwner, ...)`**——CameraX 自动管理 onResume / onPause 时启停相机,**不用手写生命周期回调**
2. **`previewView.surfaceProvider`**——把 PreviewView 的 Surface 给 CameraX 渲染预览
3. **`takePicture` 直接写 MediaStore**——拍完照自动出现在相册

---

## 七、CameraX 录像

录像替换 `imageCapture` 为 `videoCapture`:

```kotlin
val recorder = Recorder.Builder()
    .setQualitySelector(QualitySelector.from(Quality.HD))
    .build()
val videoCapture = VideoCapture.withOutput(recorder)

cameraProvider.bindToLifecycle(lifecycleOwner, selector, preview, videoCapture)

// 开始录制
val outputOptions = MediaStoreOutputOptions.Builder(
    ctx.contentResolver,
    MediaStore.Video.Media.EXTERNAL_CONTENT_URI
).setContentValues(ContentValues().apply {
    put(MediaStore.Video.Media.DISPLAY_NAME, "NotedX_${System.currentTimeMillis()}.mp4")
}).build()

val recording = videoCapture.output.prepareRecording(ctx, outputOptions)
    .apply { if (audioEnabled) withAudioEnabled() }     // 需要 RECORD_AUDIO 权限
    .start(executor) { event ->
        when (event) {
            is VideoRecordEvent.Finalize -> { /* 完成 */ }
        }
    }

// 停止
recording.stop()
```

**注意**:录像音频需要 `RECORD_AUDIO` 权限。

---

## 八、CameraX 高级特性

CameraX 还提供:

| 功能 | 用法 |
| --- | --- |
| 闪光灯 | `imageCapture.flashMode = ImageCapture.FLASH_MODE_ON` |
| 前后摄切换 | 重新 `bindToLifecycle` 传 `DEFAULT_FRONT_CAMERA` |
| 缩放 | `camera.cameraControl.setZoomRatio(2f)` |
| 焦距 | `camera.cameraControl.startFocusAndMetering(...)` |
| 图像分析(ML) | `ImageAnalysis` UseCase + 自定义 `Analyzer`,典型用于条码扫描 / 面部检测 |
| 拓展(Bokeh / HDR / Night) | `Camera2Extensions`(部分机型) |

```kotlin
val imageAnalysis = ImageAnalysis.Builder()
    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
    .build()
    .also { it.setAnalyzer(executor) { imageProxy ->
        // 分析 imageProxy(YUV/RGBA 图像)
        imageProxy.close()
    } }

cameraProvider.bindToLifecycle(lifecycleOwner, selector, preview, imageAnalysis)
```

---

## 九、`FileProvider`:把私有文件分享给其他 App

如果你要让用户"分享一张存在 App 私有目录的图给 WeChat",直接给路径不行——其他 App 没权访问你的私有目录。用 `FileProvider`:

`AndroidManifest.xml`:

```xml
<provider
    android:name="androidx.core.content.FileProvider"
    android:authorities="${applicationId}.fileprovider"
    android:exported="false"
    android:grantUriPermissions="true">
    <meta-data
        android:name="android.support.FILE_PROVIDER_PATHS"
        android:resource="@xml/file_paths" />
</provider>
```

`res/xml/file_paths.xml`:

```xml
<paths>
    <files-path name="images" path="images/" />
    <cache-path name="cache" path="/" />
</paths>
```

代码:

```kotlin
fun shareImage(ctx: Context, file: File) {
    val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.fileprovider", file)
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "image/jpeg"
        putExtra(Intent.EXTRA_STREAM, uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    ctx.startActivity(Intent.createChooser(intent, "分享图片"))
}
```

`FLAG_GRANT_READ_URI_PERMISSION` 把 URI 的读取权限临时授给目标 App,目标关闭后权限失效。

---

## 十、图片加载:Coil

UI 显示图片用 [Coil](https://coil-kt.github.io/coil/)——Compose 一等公民,kotlinx coroutines based。

```kotlin
implementation("io.coil-kt.coil3:coil-compose:3.0.0")
implementation("io.coil-kt.coil3:coil-network-okhttp:3.0.0")

@Composable
fun NoteThumbnail(uri: Uri) {
    AsyncImage(
        model = uri,
        contentDescription = null,
        modifier = Modifier.size(80.dp).clip(RoundedCornerShape(8.dp)),
        contentScale = ContentScale.Crop,
    )
}
```

Coil 自动处理:磁盘缓存、内存缓存、placeholder、错误图、crossfade 动画。**比 Glide / Picasso 现代化**,新项目应当选 Coil。

---

## 十一、NotedX 的"加图片附件"完整流程

```kotlin
@HiltViewModel
class NoteEditorViewModel @Inject constructor(
    private val noteRepository: NoteRepository,
    private val imageRepository: ImageRepository,
) : ViewModel() {

    private val _attachments = MutableStateFlow<List<File>>(emptyList())
    val attachments = _attachments.asStateFlow()

    fun onImagePicked(uri: Uri) {
        viewModelScope.launch {
            val file = imageRepository.savePickedImage(uri)
            _attachments.update { it + file }
        }
    }

    fun onPhotoTaken(uri: Uri) {
        viewModelScope.launch {
            val file = imageRepository.savePickedImage(uri)
            _attachments.update { it + file }
        }
    }
}

@Singleton
class ImageRepository @Inject constructor(@ApplicationContext private val ctx: Context) {

    suspend fun savePickedImage(uri: Uri): File = withContext(Dispatchers.IO) {
        val target = File(ctx.filesDir, "images/${UUID.randomUUID()}.jpg").apply {
            parentFile?.mkdirs()
        }
        ctx.contentResolver.openInputStream(uri)?.use { input ->
            FileOutputStream(target).use { output -> input.copyTo(output) }
        }
        target
    }
}

@Composable
fun NoteEditorScreen(vm: NoteEditorViewModel = hiltViewModel()) {
    val attachments by vm.attachments.collectAsStateWithLifecycle()
    val picker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia()
    ) { uri -> if (uri != null) vm.onImagePicked(uri) }

    var showCamera by remember { mutableStateOf(false) }

    Column {
        // ... 表单
        Row {
            IconButton(onClick = { picker.launch(PickVisualMediaRequest(ImageOnly)) }) {
                Icon(Icons.Default.Image, contentDescription = "从相册")
            }
            IconButton(onClick = { showCamera = true }) {
                Icon(Icons.Default.CameraAlt, contentDescription = "拍照")
            }
        }
        LazyRow {
            items(attachments) { file ->
                AsyncImage(model = file, contentDescription = null,
                    modifier = Modifier.size(80.dp))
            }
        }
    }

    if (showCamera) {
        // 跳到 CameraCapture screen,完成后 vm.onPhotoTaken(uri); showCamera = false
    }
}
```

---

## 十二、踩坑

**坑 1:用 `ACTION_PICK` / `ACTION_GET_CONTENT` 而不是 Photo Picker**。前者要求 `READ_EXTERNAL_STORAGE`,且 API 30+ 已经被分区存储淘汰。**新代码必须用 Photo Picker**。

**坑 2:Photo Picker URI 当成持久 URI 用**。Photo Picker 给的是临时授权 URI,**App 重启可能失效**。需要长期保留必须 `copyTo` 到自己的私有目录。

**坑 3:CameraX 不绑定 Lifecycle**。直接 `bindToLifecycle(activity, ...)` 是对的;在 ViewModel 里 `bindToLifecycle(this, ...)` 编译过不了(ViewModel 不是 LifecycleOwner)。CameraX 的整个 API 是为 UI 层设计的,**ViewModel 不持有 CameraX 引用**。

**坑 4:`PreviewView` 用 `Modifier.size(...)`**。CameraX Preview 需要 surface,size 固定可能导致比例不匹配出现黑边。用 `Modifier.fillMaxSize()` + `scaleType = FILL_CENTER`。

**坑 5:拍照后立即用 URI 读 Bitmap**。MediaStore 写入是异步的,`takePicture` 回调里 URI 已 ready 但 Bitmap 可能没就绪。**永远从 URI 读 Stream**,不要假设文件在某个路径。

**坑 6:用 `Camera2` 自己手写相机**。Camera2 代码量是 CameraX 的 5-10 倍,生命周期 / 错误处理 / 配置都极复杂。**只有 CameraX 实在不支持的高级特性才用 Camera2**(99% 场景用不到)。

**坑 7:不释放相机资源**。CameraX 自动管理生命周期没事,但用 Camera2 / 长时间 ImageAnalysis 不调 `cameraProvider.unbindAll()`,屏幕休眠后相机可能被锁,其他 App 无法用。

**坑 8:MediaStore 写入忘了 `IS_PENDING`**。中途崩了 / 用户切应用,半成品文件留在相册里,体验差。**写大文件全程用 IS_PENDING 模式**。

**坑 9:在主线程 `bitmap.compress`**。JPEG 压缩是 CPU 密集 + 可能几百 ms。必须 `Dispatchers.Default` 或 `IO`。

**坑 10:大图直接装入 Bitmap**。手机相机一张照片 10MP+,Bitmap 占用几十 MB——OOM。**用 Coil 加载并缩放**,自己处理时用 `BitmapFactory.Options.inSampleSize` 降采样。

---

下一篇 `19-系统集成:Intent、AppLinks、Glance Widget.md`,讲 App 与系统 / 其他 App 的边界:`Intent` 隐式调用(分享、打开链接)、`App Links`(https 链接直达 App)、`Glance Widget`(桌面小组件)。这是让 App "融入系统"的最后一步。
