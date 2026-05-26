# 后台任务:WorkManager 与前台服务

> 一句话:**Android 上做"系统可保证完成"的后台任务,只有一个答案——WorkManager**。`Service` / `JobScheduler` / `AlarmManager` 在现代 Android 都是 WorkManager 的实现细节,不该出现在业务代码里。

---

## 一、Android 后台执行的演化史

老 Android(2010-2017)做后台:

- `Service`——常驻进程,系统随时杀
- `AlarmManager`——定时唤醒,精度差且耗电
- `JobScheduler`(API 21+)——系统调度,但 API 难用
- `BroadcastReceiver` 监听各种事件触发——容易泄漏,API 26 起被限制

每代都有坑,且 API 26 起**后台执行严格收紧**:不可见时不能启动 `Service`、广播范围大幅缩窄、`AlarmManager` 精度被限。

**WorkManager(2018+)是 Google 的统一答案**——它内部根据 API Level 选最合适的底层(`JobScheduler` / `AlarmManager` / `BroadcastReceiver`),业务层只看 WorkManager。

---

## 二、WorkManager 适合什么场景

| 场景 | 是 / 否 |
| --- | --- |
| **必须执行**(网络同步、上传日志) | ✅ WorkManager |
| 周期性任务(每天同步) | ✅ WorkManager PeriodicWorkRequest |
| 在某种条件满足时执行(有网、充电) | ✅ Constraints |
| 用户能看见进度的任务(下载大文件) | ✅ WorkManager + Foreground 通知 |
| 立即响应用户交互(点保存立刻发请求) | ❌ `viewModelScope.launch` 就行 |
| 屏幕亮着时不停的事 | ❌ 协程或 Service |
| 精确到秒的定时(闹钟) | ❌ `AlarmManager`(`setExactAndAllowWhileIdle`) |
| 实时消息推送 | ❌ FCM / 长连接(17 篇) |

**判别标准**:任务**离开屏幕也要完成**,且**系统重启 / 进程被杀也不能丢**——这就是 WorkManager 的领地。

---

## 三、Worker 的最小定义

```kotlin
@HiltWorker
class SyncNotesWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val noteRepository: NoteRepository,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        return runCatching { noteRepository.refresh() }
            .map { Result.success() }
            .getOrElse { e ->
                if (runAttemptCount < 3) Result.retry() else Result.failure()
            }
    }
}
```

**几个关键认识**:

1. **`CoroutineWorker`**——`suspend fun doWork()` 直接挂起,不用回调。`Worker`(同步版本)在新代码里不该用。
2. **三种返回**:`success()` / `failure()`(不再重试)/ `retry()`(系统按退避策略重试)
3. **`runAttemptCount`**——已经重试过多少次,可以决定何时放弃
4. **`@HiltWorker` + `@AssistedInject`**——Hilt 12 篇展开,把 Repository / API 注入进来

---

## 四、入队:一次性任务

```kotlin
val request = OneTimeWorkRequestBuilder<SyncNotesWorker>()
    .setConstraints(Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .build())
    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
    .addTag("sync")
    .build()

WorkManager.getInstance(ctx).enqueueUniqueWork(
    "sync_notes",                       // 唯一名,避免重复入队
    ExistingWorkPolicy.KEEP,             // 已有同名,保留旧的
    request
)
```

**`ExistingWorkPolicy`**:
- `KEEP`——已有同名任务在等就保留,新的不入队
- `REPLACE`——取消旧的,入新的
- `APPEND`——排在旧的后面顺序执行
- `APPEND_OR_REPLACE`(API 31+)——APPEND 但旧的失败时用新的替换

**默认 `KEEP`**——避免用户连续点刷新触发 N 个任务。

---

## 五、周期任务

```kotlin
val periodic = PeriodicWorkRequestBuilder<SyncNotesWorker>(
    repeatInterval = 4, repeatIntervalTimeUnit = TimeUnit.HOURS,
    flexTimeInterval = 30, flexTimeIntervalUnit = TimeUnit.MINUTES,   // 可在最后 30 分钟内执行
)
    .setConstraints(Constraints.Builder()
        .setRequiredNetworkType(NetworkType.UNMETERED)               // 仅 WiFi
        .setRequiresBatteryNotLow(true)                              // 电量不低
        .build())
    .build()

WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(
    "periodic_sync",
    ExistingPeriodicWorkPolicy.KEEP,
    periodic
)
```

**周期任务限制**:
- 最小周期 15 分钟,小于会被强制成 15 分钟
- 系统会聚合多个任务的执行点,实际可能晚 15-30 分钟——不能用来做"精确到秒"
- 多个约束同时不满足,任务被无限延后

NotedX 的"每 4 小时拉一次新笔记"用周期任务,WiFi + 电量不低,**这是省电的关键**。

---

## 六、约束(Constraints)

```kotlin
Constraints.Builder()
    .setRequiredNetworkType(NetworkType.CONNECTED)   // 有网(任何类型)
    // 或 NetworkType.UNMETERED(WiFi)/ NotedX 用这个
    // 或 NetworkType.METERED(蜂窝)
    .setRequiresCharging(false)                      // 是否要求充电
    .setRequiresBatteryNotLow(true)                  // 电量 > 15%
    .setRequiresStorageNotLow(false)                 // 存储空间不低
    .setRequiresDeviceIdle(false)                    // 设备空闲
    .build()
```

**约束的语义**:**全部满足才执行**。约束越多任务越省电,但也越容易"永远不执行"——网络 + 充电 + WiFi + 闲置,可能一周都凑不齐。

实操推荐:
- **拉取轻量数据**:`CONNECTED` 即可
- **上传图片 / 大数据**:`UNMETERED`,避免吃流量
- **日志上报**:`CONNECTED + BatteryNotLow`
- **训练 / 大计算**:`UNMETERED + Charging + DeviceIdle`(等用户睡觉)

---

## 七、退避策略

任务失败 `Result.retry()` 后,系统按退避策略再跑:

```kotlin
.setBackoffCriteria(
    backoffPolicy = BackoffPolicy.EXPONENTIAL,   // 指数退避
    backoffDelay = 30, timeUnit = TimeUnit.SECONDS,
)
```

- `EXPONENTIAL`——30s, 60s, 120s, 240s, ...(最高 5 小时)
- `LINEAR`——30s, 60s, 90s, 120s, ...

**默认指数**——网络问题往往持续多次失败,指数退避避免对服务端造成压力。

---

## 八、链式任务

```kotlin
val downloadRequest = OneTimeWorkRequestBuilder<DownloadWorker>().build()
val parseRequest = OneTimeWorkRequestBuilder<ParseWorker>().build()
val saveRequest = OneTimeWorkRequestBuilder<SaveWorker>().build()

WorkManager.getInstance(ctx)
    .beginWith(downloadRequest)
    .then(parseRequest)
    .then(saveRequest)
    .enqueue()
```

链中任意一个失败,后续全部不执行。数据通过 `Data.Builder()` 在 Worker 间传递:

```kotlin
class DownloadWorker(...) : CoroutineWorker(...) {
    override suspend fun doWork(): Result {
        val path = download()
        return Result.success(workDataOf("path" to path))
    }
}

class ParseWorker(...) : CoroutineWorker(...) {
    override suspend fun doWork(): Result {
        val path = inputData.getString("path") ?: return Result.failure()
        // ...
    }
}
```

**`Data` 限制**:总大小 10 KB,只能存基础类型 / 数组。**大数据走文件 / Room**,Data 只传引用(ID / 路径)。

---

## 九、观察 Worker 状态

```kotlin
val state: Flow<WorkInfo> = WorkManager.getInstance(ctx)
    .getWorkInfosForUniqueWorkFlow("sync_notes")
    .map { infos -> infos.firstOrNull() ?: return@map WorkInfo.State.ENQUEUED }

state.collect { info ->
    when (info.state) {
        WorkInfo.State.ENQUEUED, WorkInfo.State.RUNNING -> showRefreshing()
        WorkInfo.State.SUCCEEDED -> hideRefreshing()
        WorkInfo.State.FAILED, WorkInfo.State.CANCELLED -> showError()
        WorkInfo.State.BLOCKED -> { /* 等约束满足 */ }
    }
}
```

ViewModel 订阅 WorkInfo Flow,UI 显示同步进度。**比手动维护"是否在同步"状态更精准**——崩溃 / 重启 / 系统调度延迟都自动反映。

---

## 十、Hilt 集成

12 篇配置过,这里只复习关键点。

`NotedXApp.kt`:

```kotlin
@HiltAndroidApp
class NotedXApp : Application(), Configuration.Provider {

    @Inject lateinit var workerFactory: HiltWorkerFactory

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .setMinimumLoggingLevel(if (BuildConfig.DEBUG) Log.DEBUG else Log.INFO)
            .build()
}
```

`AndroidManifest.xml` 禁用默认的 WorkManager 初始化(因为我们自定义了 Configuration):

```xml
<provider
    android:name="androidx.startup.InitializationProvider"
    android:authorities="${applicationId}.androidx-startup"
    tools:node="merge">
    <meta-data
        android:name="androidx.work.WorkManagerInitializer"
        android:value="androidx.startup"
        tools:node="remove" />
</provider>
```

依赖(02 篇已配):

```kotlin
implementation(libs.androidx.work.runtime.ktx)
implementation(libs.androidx.hilt.work)
ksp(libs.hilt.compiler)
```

---

## 十一、Foreground Service(前台服务)

WorkManager 任务通常不可见。但有些任务用户应当看到进度(下载大文件、音频播放、健身追踪)——这就是**前台服务**。

WorkManager 提供 `setForeground` 把 Worker 提升为前台服务:

```kotlin
class DownloadWorker(...) : CoroutineWorker(...) {
    override suspend fun doWork(): Result {
        setForeground(createForegroundInfo("正在下载..."))
        // 下载...
        return Result.success()
    }

    private fun createForegroundInfo(message: String): ForegroundInfo {
        val notification = NotificationCompat.Builder(applicationContext, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_download)
            .setContentTitle("NotedX 同步")
            .setContentText(message)
            .setOngoing(true)
            .build()
        return ForegroundInfo(
            NOTIFICATION_ID,
            notification,
            ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,    // API 34+ 必填
        )
    }
}
```

**关键约束**:

1. **manifest 声明**:
   ```xml
   <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
   <uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />
   <!-- 每种 type 一个权限 -->
   ```

2. **必须配通知**——前台服务必有可见通知,用户随时能感知到

3. **声明 Foreground Service Type**(API 29+,API 34+ 强制):
   - `dataSync`(同步)
   - `mediaPlayback`(音频播放)
   - `location`(实时定位)
   - `connectedDevice`(蓝牙连接)
   - `mediaProjection`(屏幕录制)
   - `phoneCall`(通话)
   - 等

   **必须用对应的 type 启动**,否则 API 34+ 直接抛 SecurityException。

---

## 十二、何时用 WorkManager + Foreground vs 普通 Service

| 需求 | 选择 |
| --- | --- |
| 数据同步、网络上传、批处理 | **WorkManager 普通 Worker** |
| 大文件下载(用户能看进度) | **WorkManager + setForeground** |
| 音频播放(锁屏控制) | `MediaSessionService`(特殊 Service) |
| 实时定位(导航 App) | Foreground Service `location` type |
| 蓝牙长连接 | Foreground Service `connectedDevice` type |
| 通话 | Foreground Service `phoneCall` type |

**99% 数据类应用只用 WorkManager**。NotedX 的同步走 WorkManager,不需要前台服务(同步轻量,不打扰用户)。

---

## 十三、NotedX 的完整同步流程

```kotlin
@HiltWorker
class SyncNotesWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val noteRepository: NoteRepository,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result = runCatching {
        noteRepository.refresh()
        noteRepository.uploadPending()           // 上传本地待同步的草稿
    }.map { Result.success() }
        .getOrElse { e ->
            when {
                e is IOException && runAttemptCount < 5 -> Result.retry()
                else -> Result.failure(workDataOf("error" to e.message))
            }
        }

    companion object {
        const val UNIQUE_NAME = "notedx_sync"

        fun schedulePeriodic(ctx: Context) {
            val periodic = PeriodicWorkRequestBuilder<SyncNotesWorker>(
                repeatInterval = 4, repeatIntervalTimeUnit = TimeUnit.HOURS,
            )
                .setConstraints(Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .setRequiresBatteryNotLow(true)
                    .build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()

            WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(
                UNIQUE_NAME, ExistingPeriodicWorkPolicy.KEEP, periodic
            )
        }

        fun runNow(ctx: Context) {
            val once = OneTimeWorkRequestBuilder<SyncNotesWorker>()
                .setConstraints(Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build())
                .build()
            WorkManager.getInstance(ctx).enqueueUniqueWork(
                "${UNIQUE_NAME}_now", ExistingWorkPolicy.KEEP, once
            )
        }
    }
}
```

`NotedXApp.onCreate` 启动周期任务:

```kotlin
override fun onCreate() {
    super.onCreate()
    SyncNotesWorker.schedulePeriodic(this)
}
```

用户下拉刷新:

```kotlin
fun refresh() {
    SyncNotesWorker.runNow(ctx)
}
```

ViewModel 订阅 WorkInfo 显示进度状态。

---

## 十四、调试 / 测试

`adb` 命令:

```bash
# 查看 WorkManager 任务列表
adb shell dumpsys jobscheduler | grep com.notedx

# 强制立即执行(忽略约束)
adb shell cmd jobscheduler run -f com.notedx <jobId>
```

测试:

```kotlin
@HiltAndroidTest
class SyncNotesWorkerTest {
    @get:Rule val hiltRule = HiltAndroidRule(this)
    @Inject lateinit var noteRepository: NoteRepository

    @Test fun syncSuccess() = runTest {
        val ctx = ApplicationProvider.getApplicationContext<Context>()
        val worker = TestListenableWorkerBuilder<SyncNotesWorker>(ctx)
            .setWorkerFactory(...)
            .build()
        val result = worker.startWork().get()
        assertEquals(ListenableWorker.Result.success(), result)
    }
}
```

`TestListenableWorkerBuilder` 在测试里直接跑 Worker,**不需要真起 WorkManager**。

---

## 十五、踩坑

**坑 1:用 `Worker` 而不是 `CoroutineWorker`**。前者是同步阻塞模型,新代码用后者——`suspend fun doWork()` 配合协程。

**坑 2:`Result.failure()` 后还期望重试**。`failure()` 等于"放弃,不再重试"。要重试用 `Result.retry()`。

**坑 3:超过 10 分钟的 Worker**。系统强制 10 分钟超时,超过会被杀。长任务必须拆分,或者用 Foreground Service。

**坑 4:在 Worker 里直接用 `Dispatchers.Main`**。Worker 已经在 IO 线程跑,`Dispatchers.Main` 没意义而且可能在没有主线程的进程出错。

**坑 5:`getInstance(ctx)` 不传 application context**。`WorkManager.getInstance(this)`,this 是 Activity,Worker 拿到的 ctx 是 Activity → 内存泄漏(Worker 可能比 Activity 活得久)。用 `applicationContext`。

**坑 6:多个 Worker 并发改同一份本地数据**。WorkManager 默认并发执行多个 Worker(只要约束都满足)。需要排它执行用 `ExistingWorkPolicy.APPEND` 或 `Mutex`。

**坑 7:Foreground Service Type 漏声明**。API 34+ 启动前台服务必须 type + 对应权限 + 代码里 `setForeground(ForegroundInfo(..., type))`,三者缺一 SecurityException。

**坑 8:`PeriodicWork` 想要 5 分钟一次**。最小 15 分钟,小了会被限制。需要更频繁的"准实时"用长连接 / push 替代。

**坑 9:WorkManager 初始化冲突**。如果用 Hilt 自定义 Configuration,**必须**在 manifest 禁用默认 Initializer(见第 10 节);否则会有两个 WorkManager 实例。

**坑 10:用户卸载 App 不清后台**。WorkManager 任务跟着 App 走,卸载就清。但同一台设备重装 App,周期任务**不会自动恢复**——重新 enqueue。

---

下一篇 `17-通知与推送通道.md`,讲 Android 通知的完整链路:`NotificationChannel`(API 26+ 强制)、本地通知、FCM 推送集成、国内推送通道(华米 OV)、通知与导航的深链。这是消息类 App 的必经之路。
