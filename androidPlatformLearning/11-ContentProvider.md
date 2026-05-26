# ContentProvider:URI 协议与跨进程数据共享

> 一句话:**ContentProvider 是 Android 唯一"按 URI 暴露 CRUD 接口"的组件——它把"我有一份数据,要让别的 App 读 / 写"包装成 `content://authority/path/id` 这种统一接口**。系统的 Contacts / Calendar / MediaStore / Telephony 都是 Provider,FileProvider 让你把私有文件分享给其他 App。

---

## 一、ContentProvider 是什么

旧 Android 时代,App 之间共享数据的两种方式:

1. **Bound Service + AIDL**——RPC 接口,客户端调具体方法
2. **ContentProvider**——按 URI + Cursor 协议查数据

ContentProvider 是第二种,**专门为"结构化数据查询"设计**——`query` / `insert` / `update` / `delete` 四个 CRUD 操作。底层通过 Binder + 共享内存,把 Cursor 跨进程传过来。

**典型用户**:Contacts(通讯录)、Calendar、MediaStore(照片视频)、Telephony(短信)。这些数据集都通过 Provider 提供给其他 App。

---

## 二、`content://` URI 协议

```
content://com.android.contacts/contacts/42
        └─────────┬─────────┘ └──┬──┘ └┬┘
              authority         path   id
```

- **authority**——Provider 的唯一标识(通常和包名一致,不一定)
- **path**——表示要查哪种数据(对应数据库表)
- **id**——可选,指定某条具体记录

**MediaStore 的典型 URI**:

```
content://media/external/images/media         ← 所有外部图片
content://media/external/images/media/12345   ← 指定图片
content://media/external_primary/images/media ← API 29+ Scoped Storage 路径
```

App 拿到这些 URI 后调:

```kotlin
val cursor = ctx.contentResolver.query(
    uri,
    arrayOf("display_name", "size"),       // 列名
    null, null, null                        // selection / selectionArgs / sortOrder
)
cursor?.use {
    while (it.moveToNext()) {
        val name = it.getString(it.getColumnIndexOrThrow("display_name"))
        val size = it.getLong(it.getColumnIndexOrThrow("size"))
    }
}
```

---

## 三、`ContentResolver`:Provider 的客户端

```kotlin
val resolver = ctx.contentResolver
```

`ContentResolver` 是统一入口——你不知道 `content://com.android.contacts/...` 这个 URI 由哪个进程的哪个 Provider 实现,但 ContentResolver 帮你找到。

底层:

```
ContentResolver.query(uri, ...)
   ↓
ContentResolver 通过 URI 的 authority 查 PMS
   ↓
PMS 返回:这个 authority 由 com.android.contacts 的 Provider 实现
   ↓
通过 Binder 调 com.android.contacts 进程的 Provider.query()
   ↓
Provider.query 内部查 SQLite,返回 Cursor
   ↓
Cursor 数据通过 Binder + 共享内存返回给调用方
```

---

## 四、`Cursor`:跨进程的查询结果

`Cursor` 是一个**类似 ResultSet 的接口**——按行迭代,每行可以取多个列的值。

```kotlin
val cursor: Cursor? = resolver.query(...)
cursor?.use {                     // .use { } 自动调 close,避免泄漏
    val nameCol = it.getColumnIndexOrThrow("display_name")
    val sizeCol = it.getColumnIndexOrThrow("size")
    while (it.moveToNext()) {
        val name = it.getString(nameCol)
        val size = it.getLong(sizeCol)
        // ...
    }
}
```

**Cursor 跨进程的物理实现**:

- 数据量小(< 1 MB)→ 直接通过 Binder 数据块拷贝
- 数据量大 → Provider 端把 Cursor 数据写入 ashmem(匿名共享内存),客户端 mmap 读取——**零拷贝**

**这是 Provider 高效的关键**:不用 Service 那种"一次 Binder 一个对象",一次性把整张结果集映射过来。

---

## 五、读取 MediaStore 图片

```kotlin
val projection = arrayOf(
    MediaStore.Images.Media._ID,
    MediaStore.Images.Media.DISPLAY_NAME,
    MediaStore.Images.Media.DATE_ADDED,
    MediaStore.Images.Media.SIZE,
)
val selection = "${MediaStore.Images.Media.SIZE} > ?"
val selectionArgs = arrayOf("1048576")        // 大于 1MB 的图

val cursor = resolver.query(
    MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
    projection,
    selection,
    selectionArgs,
    "${MediaStore.Images.Media.DATE_ADDED} DESC"
)

cursor?.use {
    val idCol = it.getColumnIndexOrThrow(MediaStore.Images.Media._ID)
    while (it.moveToNext()) {
        val id = it.getLong(idCol)
        val uri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id)
        // 用 uri 加载图片
    }
}
```

权限(API 33+):

```xml
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
```

**但首选 Photo Picker**(现代版 18 篇)——无权限,用户选哪张你只能访问哪张,体验和隐私都好。直接查 MediaStore 是相册类 App 才需要。

---

## 六、`FileProvider`:把私有文件分享给其他 App

App 的私有目录(`/data/data/com.notedx/files/`)其他 App 无权访问。但你想"用微信发送一张存在私有目录的图"——必须通过 FileProvider 包装:

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
<paths>
    <files-path name="images" path="images/" />
    <cache-path name="cache" path="/" />
    <external-files-path name="external_files" path="exported/" />
</paths>
```

代码:

```kotlin
val file = File(ctx.filesDir, "images/note42.jpg")
val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.fileprovider", file)
// uri 形如 content://com.notedx.fileprovider/images/note42.jpg

val intent = Intent(Intent.ACTION_SEND).apply {
    type = "image/jpeg"
    putExtra(Intent.EXTRA_STREAM, uri)
    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)   // 临时把读权限给目标 App
}
ctx.startActivity(Intent.createChooser(intent, "分享"))
```

**`FLAG_GRANT_READ_URI_PERMISSION`** 把这个 URI 的临时访问权给目标 Activity(微信)——目标关闭后权限自动失效。

**FileProvider 是 Android 7.0(API 24)起强制的——直接传 `file://` URI 会抛 `FileUriExposedException`**。

---

## 七、自定义 ContentProvider

```kotlin
class NoteProvider : ContentProvider() {
    private lateinit var dbHelper: NoteDbHelper

    override fun onCreate(): Boolean {
        dbHelper = NoteDbHelper(context!!)
        return true
    }
    
    override fun query(
        uri: Uri, projection: Array<String>?,
        selection: String?, selectionArgs: Array<String>?, sortOrder: String?
    ): Cursor? {
        val db = dbHelper.readableDatabase
        return when (uriMatcher.match(uri)) {
            CODE_NOTES -> db.query("notes", projection, selection, selectionArgs, null, null, sortOrder)
            CODE_NOTE_ID -> db.query("notes", projection, "id = ?", arrayOf(uri.lastPathSegment), null, null, null)
            else -> null
        }
    }
    
    override fun insert(uri: Uri, values: ContentValues?): Uri? { /* ... */ return null }
    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<String>?): Int { /* ... */ return 0 }
    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<String>?): Int { /* ... */ return 0 }
    
    override fun getType(uri: Uri): String? = when (uriMatcher.match(uri)) {
        CODE_NOTES -> "vnd.android.cursor.dir/vnd.notedx.note"
        CODE_NOTE_ID -> "vnd.android.cursor.item/vnd.notedx.note"
        else -> null
    }

    companion object {
        private const val AUTHORITY = "com.notedx.provider"
        private const val CODE_NOTES = 1
        private const val CODE_NOTE_ID = 2

        private val uriMatcher = UriMatcher(UriMatcher.NO_MATCH).apply {
            addURI(AUTHORITY, "notes", CODE_NOTES)
            addURI(AUTHORITY, "notes/#", CODE_NOTE_ID)
        }
    }
}
```

manifest:

```xml
<provider
    android:name=".NoteProvider"
    android:authorities="com.notedx.provider"
    android:exported="true"            <!-- 让其他 App 能用,看清楚 -->
    android:readPermission="com.notedx.permission.READ_NOTES"
    android:writePermission="com.notedx.permission.WRITE_NOTES" />
```

**关键认识**:

- **`onCreate` 在 Application.onCreate 之前调**——Provider 是进程启动早期被创建的,这时候很多服务还没就绪
- **CRUD 跑在 Binder 线程池**——并发安全是你的责任
- **`getType` 返回 MIME 类型**——`/dir/` 是多条结果,`/item/` 是单条
- **UriMatcher** 是把 URI 路径解析成 code 的工具,标准用法

---

## 八、何时该自定义 Provider

自定义 Provider 的真实用例:

1. **暴露数据给其他 App**——如笔记 App 让其他 App 读取笔记内容(Spotlight / 系统搜索 / Tasker)
2. **跨进程数据同步**——自己 App 多进程,Provider 是天然桥梁(WorkManager 内部就这么干)
3. **`FileProvider`**——必须,分享文件的标准
4. **`@HiltAndroidApp` 自动添加的 Hilt InitializerProvider**——Hilt 用它作为初始化触发(不写代码)
5. **`androidx.startup.InitializationProvider`**——App Startup 库的初始化入口

**99% 单 App 单进程的项目不需要自定义 Provider**——内部数据用 Room / Repository 即可。

---

## 九、`ContentObserver`:订阅数据变化

```kotlin
val observer = object : ContentObserver(Handler(Looper.getMainLooper())) {
    override fun onChange(selfChange: Boolean, uri: Uri?) {
        // 数据变了
    }
}

resolver.registerContentObserver(
    MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
    true,        // notifyForDescendants
    observer
)

// 必须解注册
resolver.unregisterContentObserver(observer)
```

Provider 端通知:

```kotlin
override fun insert(uri: Uri, values: ContentValues?): Uri? {
    val id = db.insert(...)
    context?.contentResolver?.notifyChange(uri, null)    // 通知 observer
    return ContentUris.withAppendedId(uri, id)
}
```

**这是跨进程数据变化通知的官方机制**——MediaStore 自带 Observer 通知,你拍照后系统会通知所有订阅了 EXTERNAL_CONTENT_URI 的 App。

**Room 数据库改动**:Room 内部自动维护 InvalidationTracker,通过 ContentObserver 也好、内部观察者也好,触发 Flow 重新查询。**你写 Room 不用手动调 notifyChange**——但**Room 的 Observer 不跨进程**。要跨进程同步必须自己挂 ContentProvider。

---

## 十、Cursor 的常见操作

```kotlin
cursor.use {
    if (it.moveToFirst()) {                       // 移到第一行
        val col = it.getColumnIndex("name")        // 取列索引
        do {
            val name = it.getString(col)
        } while (it.moveToNext())                  // 下一行
    }
}

// 取列时类型很重要
it.getString(idx)
it.getInt(idx)
it.getLong(idx)
it.getBlob(idx)        // ByteArray
it.getType(idx)        // FIELD_TYPE_INTEGER / STRING / BLOB / FLOAT / NULL
```

**铁律**:

- **`.use {}` 自动 close**——Cursor 不 close 会泄漏文件描述符 + 内存
- **`getColumnIndexOrThrow` 而不是 `getColumnIndex`**——前者找不到抛异常,后者返回 -1 让你后面 crash 时分不清错在哪
- **Cursor 必须在调用线程**——不能跨线程传递 Cursor

---

## 十一、Cursor 与 Room 的对比

```kotlin
// 旧方式:Cursor
val cursor = db.query("SELECT * FROM note WHERE id = ?", arrayOf("42"))
cursor.use {
    if (it.moveToFirst()) {
        val title = it.getString(it.getColumnIndexOrThrow("title"))
    }
}

// Room:类型安全
@Query("SELECT * FROM note WHERE id = :id")
suspend fun getById(id: Long): NoteEntity?
val note = dao.getById(42)
note?.title
```

Room 本质就是"Cursor 的注解 + 代码生成"——开发体验提升一个数量级。**新代码应当用 Room**,Cursor 主要用在:

- 跨进程查询(ContentResolver.query)
- 极少数性能极致场景(自己控制 cursor 流式读取)

---

## 十二、`CursorLoader`:已淘汰

`CursorLoader` 是 Android 3.0 引入的"异步 + 自动观察变化"的 Cursor 加载器——但它建立在 `LoaderManager` 之上,API 设计糟糕。

API 28(Android 9)起 Loader API 整体 deprecated,被 `ViewModel + LiveData/Flow` 取代。**新代码完全不要用 Loader / CursorLoader**。

---

## 十三、调试 Provider

```bash
# 查看注册的所有 Provider
adb shell dumpsys package providers | head -50

# 看特定 authority 是哪个 App 提供
adb shell dumpsys package | grep -B 2 "com.android.contacts"

# 命令行 query(测试 Provider)
adb shell content query --uri content://media/external/images/media --projection display_name:size

# insert(测试 Provider 写入)
adb shell content insert --uri content://com.notedx.provider/notes --bind title:s:hello
```

`adb shell content` 是 Provider 调试的瑞士军刀。

---

## 十四、踩坑

**坑 1:Cursor 不 `close()`**。Java 文件句柄泄漏 → 系统 ULIMIT 用完 → 任何 IO 失败。**`.use {}` 是标配**。

**坑 2:在 Provider 的 `onCreate` 里访问数据库做长操作**。Provider.onCreate 在 Application.onCreate 之前调,你 IO 阻塞主线程,App 启动慢。**只做轻量初始化**,数据库初始化 lazy。

**坑 3:跨进程传 Cursor 当本地对象用**。Cursor 跨进程后,**关掉一端另一端就废了**——你不能"在 Activity 拿 Cursor,传给 Service 用"。Service 自己重新 query。

**坑 4:`FileUriExposedException` 在 Android 7+ 发**。直接 `Intent.setData(Uri.fromFile(file))` 在 API 24+ 直接崩。**永远 FileProvider**。

**坑 5:FileProvider 配错 paths**。XML 里写 `<files-path path="images/" />`,但代码里用 `File(ctx.cacheDir, "images/x.jpg")`——不在 files-path 范围内,getUriForFile 抛 IllegalArgumentException。**`<files-path>` 对应 `Context.filesDir`,`<cache-path>` 对应 `Context.cacheDir`,`<external-files-path>` 对应 `Context.getExternalFilesDir(null)`**。

**坑 6:`grantUriPermissions` 漏开**。manifest 里 `android:grantUriPermissions="true"` 没设,你 `FLAG_GRANT_READ_URI_PERMISSION` 也没用——其他 App 拿不到读权限。

**坑 7:Provider 自己内部访问数据库不调 notifyChange**。改了数据但订阅 Observer 的 App 不知道——通知断链。**写入后必须 `notifyChange(uri, null)`**。

**坑 8:Provider 跨进程线程安全**。Binder 线程池并发调你的 query / insert——内部用 SQLite (Room) 自己有锁,但你的内存 cache / 字段必须线程安全。

**坑 9:多进程 App 的 Provider 起多次**。`android:multiprocess="true"` 会让每个进程一份 Provider 实例,`onCreate` 在每个进程跑一次——内存浪费。**默认 false** 即可,Provider 跑在 manifest 声明的特定进程。

**坑 10:authority 命名冲突**。两个 App 都用 `com.example.provider` 作 authority,后装的覆盖先装的——前面装的 App 用 Provider 报错。**永远用 `${applicationId}.xxx` 这种独有的前缀**。

---

第二篇结束(07-11)。下一篇 `12-Handler Looper MessageQueue Choreographer.md`,把 Android 主线程的事件循环讲透:`Looper.loop()` 是什么、`Handler.post()` 怎么把工作排队、Message 池怎么避免对象分配、`Choreographer` 怎么和 VSync 对齐、Compose 重组是怎么挂在这套机制上的。
