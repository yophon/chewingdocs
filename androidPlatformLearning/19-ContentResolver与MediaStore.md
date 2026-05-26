# ContentResolver、MediaStore 与 FileProvider

> 一句话:**ContentResolver 是 App 跨进程读 / 写数据的入口,MediaStore 是 Android 公共媒体(图片/视频/音频)的 Provider,FileProvider 是把私有文件临时授权给其他 App 用的中介**。这一篇覆盖了 Android 11-15 分区存储改造的全部新旧 API。

---

## 一、ContentResolver 的角色

```
你的 App 进程
   ↓
ctx.contentResolver.query(uri, ...)
   ↓
ContentResolver 通过 uri.authority 找到对应 Provider
   ↓ Binder
对应 App 进程的 ContentProvider.query()
   ↓
返回 Cursor(通过 Binder + 共享内存)
   ↓
你的 App 进程拿到 Cursor
```

**ContentResolver 是 ContentProvider 的客户端**——你不直接知道某个 `content://` URI 由哪个进程实现,但 ContentResolver 帮你找到、跨进程调、把结果传回。

11 篇展开了 Provider 端。这一篇主要讲**客户端使用**。

---

## 二、查 Contacts(联系人)

```xml
<uses-permission android:name="android.permission.READ_CONTACTS" />
```

```kotlin
val cursor = ctx.contentResolver.query(
    ContactsContract.Contacts.CONTENT_URI,
    arrayOf(
        ContactsContract.Contacts._ID,
        ContactsContract.Contacts.DISPLAY_NAME,
    ),
    null, null,
    ContactsContract.Contacts.DISPLAY_NAME + " ASC"
)
cursor?.use {
    while (it.moveToNext()) {
        val id = it.getLong(0)
        val name = it.getString(1)
    }
}
```

**`ContactsContract`** 是系统给的常量集合——URI / 列名 / mime type。任何系统 Provider 都有对应的 Contract 类(`ContactsContract` / `CalendarContract` / `MediaStore` / `Telephony`)。

**用 Contract 常量,不要写裸字符串**——版本升级时字段名可能变。

---

## 三、MediaStore:图片、视频、音频

`MediaStore` 是 Android 上对**用户媒体文件**的统一访问入口——所有 App 写入的图片 / 视频 / 音频都登记在 MediaStore,任何 App 都能查(有权限的话)。

URI 结构:

```
content://media/external_primary/images/media       # 所有图片(API 29+)
content://media/external/images/media               # 旧路径(API 28-)
content://media/external_primary/video/media        # 视频
content://media/external_primary/audio/media        # 音频
content://media/external_primary/downloads          # API 29+ 下载
```

API 29 起,常量也有变化:

```kotlin
val collection = if (Build.VERSION.SDK_INT >= 29) {
    MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
} else {
    MediaStore.Images.Media.EXTERNAL_CONTENT_URI
}
```

---

## 四、API 28 之前:`READ_EXTERNAL_STORAGE` 全访问

```xml
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
```

```kotlin
val cursor = resolver.query(
    MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
    null, null, null, "${MediaStore.Images.Media.DATE_ADDED} DESC"
)
```

**API 28 及以下**:有 `READ_EXTERNAL_STORAGE` 就能读所有图片——这是不安全的(App 能扫描用户全部相册)。

**API 29 (Android 10) 分区存储**:
- 默认无权限读取媒体
- 申请 `READ_EXTERNAL_STORAGE` → 仍能读 MediaStore(过渡期)
- App 自己写的图片 → 不需要权限

**API 33 (Android 13)** 进一步细化:`READ_EXTERNAL_STORAGE` 失效,改:
- `READ_MEDIA_IMAGES`
- `READ_MEDIA_VIDEO`
- `READ_MEDIA_AUDIO`

每种类型独立权限。

**API 34 (Android 14)** 加 `READ_MEDIA_VISUAL_USER_SELECTED`——用户能"只授权部分照片",App 拿到的 cursor 只包含用户选的。

---

## 五、Photo Picker:无权限选图

**Android 13+ 起首推 Photo Picker**(也兼容到 11):

```kotlin
val picker = registerForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
    if (uri != null) {
        // 拿到 URI,有读权限(临时授权)
        copyUriToFile(uri)
    }
}

picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
```

**无任何权限**——系统弹一个选择器,用户挑哪张你只能访问哪张,选完关闭就失效。

**Photo Picker 是 Android 13+ 最佳实践**。除非你做相册类 App(必须扫描全部图片),都用 Picker。

---

## 六、写入图片到相册

```kotlin
suspend fun saveImageToGallery(bitmap: Bitmap, name: String): Uri? = withContext(Dispatchers.IO) {
    val values = ContentValues().apply {
        put(MediaStore.Images.Media.DISPLAY_NAME, "$name.jpg")
        put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
        if (Build.VERSION.SDK_INT >= 29) {
            put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/NotedX")
            put(MediaStore.Images.Media.IS_PENDING, 1)
        }
    }
    
    val collection = if (Build.VERSION.SDK_INT >= 29) {
        MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
    } else {
        MediaStore.Images.Media.EXTERNAL_CONTENT_URI
    }
    
    val uri = resolver.insert(collection, values) ?: return@withContext null
    
    resolver.openOutputStream(uri)?.use { out ->
        bitmap.compress(Bitmap.CompressFormat.JPEG, 90, out)
    }
    
    if (Build.VERSION.SDK_INT >= 29) {
        values.clear()
        values.put(MediaStore.Images.Media.IS_PENDING, 0)
        resolver.update(uri, values, null, null)
    }
    
    uri
}
```

**关键认识**:

1. **`IS_PENDING` 模式**——先标记"未完成",写完再标记"完成"。中间崩了系统清理半成品。
2. **`RELATIVE_PATH`**——指定保存到相册的子目录(Pictures/NotedX 而不是根)
3. **API 29+ 写自己 App 的图不需要权限**——分区存储的红利
4. **`compress` 在 Dispatchers.IO**——JPEG 压缩是 CPU + IO,主线程慢

---

## 七、写入到下载目录

```kotlin
val values = ContentValues().apply {
    put(MediaStore.Downloads.DISPLAY_NAME, "data.csv")
    put(MediaStore.Downloads.MIME_TYPE, "text/csv")
    put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
}

val uri = resolver.insert(
    MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY),
    values
)
```

文件出现在 `/sdcard/Download/` 用户可见。**用户文件管理器能直接打开**。

**API 29+ 的下载目录是 MediaStore 的一部分**——用户卸载 App 时**下载目录的文件保留**(不被清理),而应用专属目录的文件被清掉。

---

## 八、查询自己写入的图片

```kotlin
val projection = arrayOf(
    MediaStore.Images.Media._ID,
    MediaStore.Images.Media.DISPLAY_NAME,
    MediaStore.Images.Media.DATE_ADDED,
)
val selection = "${MediaStore.Images.Media.RELATIVE_PATH} LIKE ?"
val selectionArgs = arrayOf("Pictures/NotedX%")

val cursor = resolver.query(
    MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
    projection, selection, selectionArgs,
    "${MediaStore.Images.Media.DATE_ADDED} DESC"
)
```

**App 自己写的 MediaStore 图片随时能查,不需要权限**。其他 App 的图片需要 `READ_MEDIA_IMAGES`(API 33+)。

---

## 九、`openInputStream` / `openOutputStream`

```kotlin
// 读
val input = resolver.openInputStream(uri)
input?.use { stream -> stream.readBytes() }

// 写
val output = resolver.openOutputStream(uri)
output?.use { stream -> stream.write(bytes) }

// 拿 ParcelFileDescriptor(更底层)
val pfd = resolver.openFileDescriptor(uri, "r")    // "r" / "w" / "rw"
pfd?.use { /* 用 fd 做 NIO */ }
```

`URI → InputStream/OutputStream` 是统一抽象——不管 URI 后面是 MediaStore 还是 FileProvider 还是 Internet,你都通过这个接口读写。

---

## 十、FileProvider:授权私有文件

App 的私有文件其他 App 无权访问。**FileProvider 把私有文件包装成 `content://` URI**,临时授权给目标 App:

manifest:

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
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <files-path name="images" path="images/" />
    <cache-path name="cache" path="/" />
    <external-files-path name="external" path="exported/" />
    <external-cache-path name="external_cache" path="/" />
    <root-path name="root" path="/" />          <!-- 慎用 -->
</paths>
```

| 标签 | 物理路径 |
| --- | --- |
| `<files-path>` | `Context.filesDir` |
| `<cache-path>` | `Context.cacheDir` |
| `<external-files-path>` | `Context.getExternalFilesDir(null)` |
| `<external-cache-path>` | `Context.getExternalCacheDir()` |
| `<root-path>` | `Environment.getRootDirectory()` |
| `<external-path>` | `Environment.getExternalStorageDirectory()` |

代码:

```kotlin
val file = File(ctx.filesDir, "images/note42.jpg")
val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.fileprovider", file)
// uri: content://com.notedx.fileprovider/images/note42.jpg

val intent = Intent(Intent.ACTION_SEND).apply {
    type = "image/jpeg"
    putExtra(Intent.EXTRA_STREAM, uri)
    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
}
ctx.startActivity(Intent.createChooser(intent, "分享"))
```

**`FLAG_GRANT_READ_URI_PERMISSION`** 把 URI 的读权限临时给目标 App——目标 Activity 关闭后失效。

**Android 7.0(API 24)起强制 FileProvider**——直接传 `file://` 抛 `FileUriExposedException`。

---

## 十一、Scoped Storage 史

```
Android 9 (API 28)-:    全开放,READ/WRITE_EXTERNAL_STORAGE 看遍所有文件
Android 10 (API 29):    分区存储引入,App 默认只能读自己写的,需 requestLegacyExternalStorage 临时关
Android 11 (API 30):    强制分区存储,requestLegacyExternalStorage 失效
                        MANAGE_EXTERNAL_STORAGE 权限(全文件访问)需特殊审核
Android 13 (API 33):    READ_EXTERNAL_STORAGE 拆为 READ_MEDIA_IMAGES/VIDEO/AUDIO
Android 14 (API 34):    READ_MEDIA_VISUAL_USER_SELECTED 选择性授权
Android 15 (API 35):    继续收紧
```

**实操指南**:

- **App 自己写自己用** → `Context.filesDir` / `Context.getExternalFilesDir`(无权限)
- **选用户的图** → Photo Picker(无权限)
- **写到相册** → MediaStore.Images(无权限,如果是自己 App 写)
- **写到下载** → MediaStore.Downloads(无权限,且用户卸载保留)
- **读所有文件** → 几乎不可能,Play 审核拒(MANAGE_EXTERNAL_STORAGE 极难过审)

---

## 十二、Storage Access Framework(SAF)

```kotlin
val launcher = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
    if (uri != null) {
        // 拿到 URI,有持久权限(下次启动还能用)
        ctx.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
}

launcher.launch(arrayOf("*/*"))    // 类型筛选
```

**SAF**(`ACTION_OPEN_DOCUMENT` / `ACTION_CREATE_DOCUMENT`)让用户从**系统文件选择器**选文件——可以是相册 / 文件管理器 / Google Drive / OneDrive 任何 ContentProvider。

**取得持久权限**:`takePersistableUriPermission` 让权限跨进程重启保留,适合需要长期访问的文件(用户选了一个文档,下次启动还能继续编辑)。

**对比**:
- **Photo Picker**——专选媒体,无权限,临时
- **SAF**——通用文档,可持久,需要保存 URI

---

## 十三、`DocumentsProvider`(自定义文档来源)

如果你的 App 是云存储(Dropbox / OneDrive),可以实现 DocumentsProvider 让其他 App 通过 SAF 访问你的存储:

```kotlin
class MyDocumentsProvider : DocumentsProvider() {
    override fun queryRoots(projection: Array<String>?): Cursor { /* ... */ }
    override fun queryDocument(documentId: String?, projection: Array<String>?): Cursor { /* ... */ }
    override fun queryChildDocuments(parent: String?, ...): Cursor { /* ... */ }
    override fun openDocument(documentId: String?, mode: String?, ...): ParcelFileDescriptor { /* ... */ }
}
```

manifest:

```xml
<provider
    android:name=".MyDocumentsProvider"
    android:authorities="com.notedx.docprovider"
    android:exported="true"
    android:grantUriPermissions="true"
    android:permission="android.permission.MANAGE_DOCUMENTS">
    <intent-filter>
        <action android:name="android.content.action.DOCUMENTS_PROVIDER" />
    </intent-filter>
</provider>
```

**普通 App 不需要**——只在你做云存储 / 文件管理器 / 浏览器扩展时考虑。

---

## 十四、Cursor 的列索引性能

```kotlin
cursor.use {
    // ❌ 每行 getColumnIndex
    while (it.moveToNext()) {
        val name = it.getString(it.getColumnIndexOrThrow("display_name"))
    }
    
    // ✅ 提前取索引
    val nameCol = it.getColumnIndexOrThrow("display_name")
    while (it.moveToNext()) {
        val name = it.getString(nameCol)
    }
}
```

`getColumnIndex` 是字符串查找——大量行迭代时把它提前到循环外。

---

## 十五、Cursor 与 RecyclerView 的旧绑定

```kotlin
class CursorAdapter(var cursor: Cursor?) : RecyclerView.Adapter<...>() {
    override fun getItemCount() = cursor?.count ?: 0
    override fun onBindViewHolder(holder: VH, position: Int) {
        cursor?.moveToPosition(position)
        // 读 cursor 当前行
    }
}
```

**已经被 Paging 3 替代**——`PagingDataAdapter` 处理 cursor / network 分页加载。新代码不写裸 CursorAdapter。

---

## 十六、调试 ContentResolver

```bash
# 列出所有 Provider
adb shell dumpsys package providers

# 命令行 query
adb shell content query --uri content://media/external/images/media \
    --projection _display_name:_size

# 命令行 insert
adb shell content insert --uri content://com.notedx.provider/notes \
    --bind title:s:Test

# 看 MediaStore 数据库直接
adb shell sqlite3 /data/data/com.android.providers.media.module/databases/external.db ".tables"
```

22 篇会更系统讲 ADB。

---

## 十七、踩坑

**坑 1:Cursor 跨进程后关掉一端**。MediaStore Cursor 是跨进程的,close 后另一端就废了。**永远在拿 Cursor 的进程内用完**。

**坑 2:FileProvider 路径配错**。XML 里 `<files-path path="images/" />`,但代码 `File(cacheDir, "images/x.jpg")`——cache 不对应 files-path,getUriForFile 直接抛 IllegalArgumentException。

**坑 3:`grantUriPermissions=false`**。FileProvider manifest 漏写或写错,接收 App 拿到 URI 但读不到——`FLAG_GRANT_READ_URI_PERMISSION` 也救不了。

**坑 4:用 file:// URI 给其他 App**。API 24+ 直接 FileUriExposedException。**永远 FileProvider**。

**坑 5:`MediaStore.Images.Media.DATA` 在 API 29+ 失效**。这是文件绝对路径列,API 29+ 起为安全已弃用。用 URI + openInputStream 替代。

**坑 6:`READ_EXTERNAL_STORAGE` 在 API 33+ 没用**。Android 13+ 改 `READ_MEDIA_IMAGES` 等细分权限。

**坑 7:写大文件主线程**。`bitmap.compress` JPEG 几百毫秒,文件 IO 几百毫秒。**永远 Dispatchers.IO**。

**坑 8:`IS_PENDING` 模式忘清**。写完没 update IS_PENDING=0,文件在相册不可见。

**坑 9:SAF 的 URI 重启失效**。用户选了一个文档,App 重启后用同 URI 报 SecurityException——必须用 `takePersistableUriPermission` 持久化权限。

**坑 10:`takePersistableUriPermission` 数量上限**。Android 限制 App 持久 URI 权限数(几百个)。**不要无限累积**,旧 URI 用 `releasePersistableUriPermission` 释放。

---

下一篇 `20-Android 安全模型:权限 / 签名 / Sandbox / SELinux.md`,把"为什么 Android 比 Linux 桌面安全得多"讲透——UID Sandbox 怎么隔离、APK 签名怎么验证身份、SELinux 怎么限制系统服务、SDK 隔离、Play Protect 扫描机制。
