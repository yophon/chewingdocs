# 17-后台任务:WorkManager 与 ForegroundService

> 一句话导读:`WorkManager` 是"我有一个能容忍延迟的任务,交给系统挑时机";`ForegroundService` 是"我必须立刻、持续、用户看得见地占着 CPU"。Android 15 起这两者的边界被强制立法:`ForegroundService` 没有正确声明 type 就会上线即崩,且后台拉前台的逃生通道几乎被关死。

第 16 篇把权限当成状态机讲透。本篇把"后台执行"切清楚:`WorkManager` 是所有"延迟可执行"任务的官方抽象,`ForegroundService` 是 Android 14 / 15 收紧后剩下的合法窗口。两者经常被混用,而 Android 15 把混用代价从"省电下降"提升到"`SecurityException` 崩溃",所以用一篇的篇幅讲透边界。

## 1. 机制定位

### 后台执行的历史与今天

Android 1.x 时代,任何应用都能起 `Service` 长跑,代价是电池续航和后台流量不可控。Google 从 Android 6 (Doze)、7 (Background Limit)、8 (Background Service Limit)、9 (App Standby Buckets)、12 (`startForegroundService` 5s 上限)、13 (`POST_NOTIFICATIONS`)、14 (BG-to-FG 限制)、15 (FGS Type 强制) 一路收紧,核心策略是:**把"不需要立刻 + 用户不可见"的任务收编到 WorkManager / AlarmManager 这套系统调度框架;把"用户可见 + 必须持续"的任务要求显式声明 ForegroundService 并承担权限与可见性义务。**

按 Android 5 心智写代码的典型失败路径:在 onReceive 里 `startService`,期望后台跑 10 秒,实际 Android 8+ 直接 `IllegalStateException`,Android 12+ 切到 `startForegroundService` 必须 5 秒内调 `startForeground`,Android 14+ BG 启动场景要在豁免列表,Android 15+ 再加 type 必须声明且匹配权限。**单独抠"如何起一个后台服务"已经不是 2026 年应该问的问题**,正确问法是:任务需要"立刻 + 持续 + 用户感知"中的哪几条。

### `WorkManager` 与 `ForegroundService` 的边界

下面这张决策表是写代码前的第一关:

| 任务特征 | 选择 |
| --- | --- |
| 可延迟数分钟到数小时,联网 / 充电时才合理执行(同步、备份、上传) | `WorkManager` `OneTimeWorkRequest` + `Constraints` |
| 周期性,最短间隔 15 分钟(后台刷新、定时清理) | `WorkManager` `PeriodicWorkRequest` |
| 任务必须几秒内开始,但仍可在 10 分钟内结束(用户刚点了"立即同步") | `WorkManager` + `setExpedited(OUT_OF_QUOTA_RUN_AS_NON_EXPEDITED_WORK_REQUEST)` |
| 用户主动启动且必须持续可见(播放音乐、跑步轨迹记录、视频通话) | **ForegroundService** + 对应 type |
| 屏幕录制 / 投屏 | ForegroundService type = `mediaProjection`(无 type 直接崩) |
| 语音输入 / 录音 | ForegroundService type = `microphone` |
| 实时位置追踪 | ForegroundService type = `location` |
| 一次性闹钟 / 提醒 | `AlarmManager`(本篇延伸提及,不主讲) |
| 推送到达后做点事(网络请求、本地存) | FCM `onMessageReceived` 里直接做;耗时长则 enqueue WorkManager |

划清边界后,本篇 60% 在 WorkManager,40% 在 ForegroundService(因为 Android 15 type 强制是这一节最大的"上线即崩"风险)。

### `WorkManager` 在系统里的位置

`WorkManager` 不是另一个独立调度器,它是 **JetPack 提供的、对 `JobScheduler` / `AlarmManager` / `BroadcastReceiver` 的统一抽象**。运行时它根据 API level 挑底层实现:API 23+ 走 `JobScheduler`,旧设备走 `AlarmManager + Broadcast`。**绝不要在新工程里直接 `getSystemService(JobScheduler::class.java).schedule(...)`**,这相当于跳过抽象层,既要自己处理 API level 差异,又会和 WorkManager 抢调度窗口。本系列硬约束。

核心保证是 **Guaranteed Execution**:即使进程被杀、设备重启,任务也会在条件再次满足时被恢复(状态存在 SQLite 中)。但"保证执行"不等于"立刻执行",WorkManager 给系统挑时机的余地从几秒到几小时不等,取决于设备 Doze、App Standby Bucket、Constraints 是否满足。

### Android 15 ForegroundService Type 强制是新基线

Android 14 起,`<service>` 必须声明 `android:foregroundServiceType`,且 `startForeground()` 必须传入与 manifest 一致(或子集)的 type bitmask。Android 15 把这条规则提升到 **运行时强制**:声明缺失、type 不匹配、对应权限未授予,任何一项不满足都直接 `MissingForegroundServiceTypeException` / `ForegroundServiceTypeNotAllowedException` 抛出,Crash。

这是 2026 年新 App 上线最常见的崩溃来源之一,沿用 Android 13 时代"声明 service + startForeground + 完事"的模板在 API 35 设备本地调试就会崩,无法回避。完整 type / 权限矩阵下面给。

## 2. Android 心智

### `WorkManager` 的核心对象

```
WorkRequest    : 任务定义(class、tag、constraints、initialDelay、retry policy)
   ├─ OneTimeWorkRequest
   └─ PeriodicWorkRequest

Worker         : 任务实现(继承 CoroutineWorker / RxWorker / Worker)
WorkManager    : 入口,enqueue / cancel / getWorkInfo
WorkInfo       : 任务状态(ENQUEUED / RUNNING / SUCCEEDED / FAILED / CANCELLED / BLOCKED)
Constraints    : 约束(网络、充电、电量、空闲、存储)
ExistingWorkPolicy / ExistingPeriodicWorkPolicy : 同名任务冲突策略
```

注意 `WorkManager` 自己不持有状态,所有任务和状态都在 `androidx.work.workdb` 的 SQLite 里。这是它能跨进程重启后继续执行的基础。

### `CoroutineWorker` 与 Hilt 集成

`Worker`(同步)和 `RxWorker` 在 2026 年的工程里都不再推荐。**新工程统一用 `CoroutineWorker`**:协程是 Kotlin 2.0 一等公民,`doWork()` 是 suspend,系统取消时自动触发协程取消(只要尊重 `coroutineContext.ensureActive()`)。

WorkManager 默认通过反射构造 `Worker`,Hilt 通过 `androidx.hilt:hilt-work` 桥接:Worker 用 `@HiltWorker` 标注,构造函数加 `@AssistedInject`,运行时由 `HiltWorkerFactory` 创建。Application 实现 `Configuration.Provider`,把 factory 接进去。

依赖在 Version Catalog 中:

```toml
[versions]
work = "2.10.0"
hilt-work = "1.2.0"

[libraries]
work-runtime = { module = "androidx.work:work-runtime-ktx", version.ref = "work" }
hilt-work = { module = "androidx.hilt:hilt-work", version.ref = "hilt-work" }
hilt-compiler = { module = "androidx.hilt:hilt-compiler", version.ref = "hilt-work" }
```

注意 `hilt-compiler` 必须走 **KSP** 不走 KAPT,本系列硬约束,见第 13 篇。

### ForegroundService 与 WorkManager 的两条胶水

WorkManager 给两条把 Worker 提升为前台运行的路径:

1. **Expedited Work**(优先执行,但仍受系统配额限制):`setExpedited(OUT_OF_QUOTA_RUN_AS_NON_EXPEDITED_WORK_REQUEST)`。Android 12+ 系统尽可能立即调度,每个 App 有配额(按 App Standby Bucket),超额自动降级为普通 Work。
2. **Long-running Worker**(任务 > 10 分钟):`doWork` 里调 `setForeground(getForegroundInfo())`,WorkManager 自动起前台服务并管生命周期。**Android 14+ 这里也要传 type,Android 15 强制 type 与权限对应**。

两条路径都不需要自己写 `Service` 子类,优先用 WorkManager 封装。**只有当任务的核心心智不是"执行完成就退出",而是"持续占用某种用户可见资源(摄像头取景、麦克风录音、屏幕录制、媒体播放)"时,才需要自己写 `Service`**。

### ForegroundService Type 与权限矩阵

Android 15 强制下,每一类前台服务 type 对应的 manifest 声明、权限要求、典型场景如下(本篇用得到的 5 种,其余在附录可查 [官方 docs](https://developer.android.com/about/versions/14/changes/fgs-types-required)):

| Type | manifest 权限(必须声明并运行时申请) | manifest 额外的 FGS 权限(install-time) | 典型场景 |
| --- | --- | --- | --- |
| `dataSync` | 无(普通联网即可) | `FOREGROUND_SERVICE_DATA_SYNC` | 大文件上传 / 下载、备份 |
| `mediaPlayback` | 无 | `FOREGROUND_SERVICE_MEDIA_PLAYBACK` | 音乐 / 播客 / 视频后台播放 |
| `location` | `ACCESS_FINE_LOCATION` 或 `ACCESS_COARSE_LOCATION` | `FOREGROUND_SERVICE_LOCATION` | 跑步轨迹、外卖配送 |
| `microphone` | `RECORD_AUDIO` | `FOREGROUND_SERVICE_MICROPHONE` | 录音、语音转文字 |
| `camera` | `CAMERA` | `FOREGROUND_SERVICE_CAMERA` | 后台取景(配合 CameraX) |
| `mediaProjection` | 无(运行时通过 MediaProjection token 获权) | `FOREGROUND_SERVICE_MEDIA_PROJECTION` | 录屏 / 投屏 |
| `phoneCall` | `MANAGE_OWN_CALLS` 或 `READ_PHONE_STATE` | `FOREGROUND_SERVICE_PHONE_CALL` | VOIP |
| `connectedDevice` | `BLUETOOTH_CONNECT` 之一 | `FOREGROUND_SERVICE_CONNECTED_DEVICE` | 蓝牙耳机、手表 |
| `health` | `BODY_SENSORS` / `ACTIVITY_RECOGNITION` | `FOREGROUND_SERVICE_HEALTH` | 心率监测、计步 |
| `remoteMessaging` | 无 | `FOREGROUND_SERVICE_REMOTE_MESSAGING` | 跨设备消息中继 |
| `shortService` | 无 | 无(< 3 分钟自动结束) | 收到推送后立即处理(替代旧 expedited) |
| `specialUse` | 无 | `FOREGROUND_SERVICE_SPECIAL_USE` | 上述都不沾边,提交 Play Console 解释 |
| `systemExempted` | 仅系统应用 | `FOREGROUND_SERVICE_SYSTEM_EXEMPTED` | 普通应用拿不到 |

**关键点**:第二列是 dangerous 权限(运行时申请),第三列是 install-time 权限(manifest 一声明就有,但 type 与之必须配对)。type 矩阵和第 16 篇的权限模型直接挂钩——前台服务运行时 type 对应的 dangerous 权限必须是 granted 状态,否则 `startForeground` 抛 `SecurityException`。

### Android 14+ 后台拉起前台服务的限制

这是另一个 Android 15 上线即崩的常见来源。Android 12 之前,你可以在 BroadcastReceiver 里直接 `startForegroundService()`,Android 12 起要求 5 秒内必须调 `startForeground`,Android 14 起进一步要求:**只有处于以下豁免情形的 App 才允许从后台启动前台服务**:用户当前正在与 App 交互(可见 Activity)、`USE_EXACT_ALARM` 触发的精确闹钟、CompanionDevice、Picture-in-Picture、系统应用、通过 `setExpedited` 让 WorkManager 接管。

**绝大多数普通业务场景**(收到推送后想起一个后台同步服务、定时任务到点了想跑一段长逻辑)**不能**再走"BroadcastReceiver + startForegroundService"路径。**正确替代是 WorkManager:enqueue 一个 expedited OneTimeWorkRequest,把任务包成 CoroutineWorker**。WorkManager 自己有 Foreground 提升机制,属于 Google 优化过的豁免链路。Android 16 还会进一步收紧,迁移没有退路。

## 3. 工程实现

### 文件:`core/work/WorkManagerModule.kt`(Hilt 配置)

```kotlin
package app.notedx.core.work

import android.content.Context
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import androidx.work.WorkManager
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object WorkManagerModule {
    @Provides @Singleton
    fun provideWorkConfiguration(factory: HiltWorkerFactory): Configuration =
        Configuration.Builder()
            .setWorkerFactory(factory)
            .setMinimumLoggingLevel(android.util.Log.INFO)
            .build()

    @Provides @Singleton
    fun provideWorkManager(@ApplicationContext context: Context): WorkManager =
        WorkManager.getInstance(context)
}
```

### 文件:`app/NotedXApp.kt`(Application 关闭默认初始化)

```kotlin
@HiltAndroidApp
class NotedXApp : Application(), Configuration.Provider {
    @Inject lateinit var workConfiguration: Configuration
    override val workManagerConfiguration: Configuration get() = workConfiguration
}
```

**关键**:必须在 `AndroidManifest.xml` 里关闭 WorkManager 的默认初始化,否则 Hilt 未就绪时它就先 init 了,自定义 factory 不会生效:

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

漏写 manifest 段会导致 "WorkerFactory returned a null Worker" 运行时错误。

### 文件:`feature/sync/SyncWorker.kt`(同步任务)

NotedX 的"把本地未同步的笔记上传到服务端"是典型的 dataSync 类后台任务:可延迟、有网才执行、值得保证最终一致性。用 `OneTimeWorkRequest + Constraints` 实现:

```kotlin
package app.notedx.feature.sync

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import kotlinx.coroutines.CancellationException

@HiltWorker
class SyncWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val syncRepository: SyncRepository,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        return try {
            val dirty = syncRepository.dirtyNotes()
            if (dirty.isEmpty()) return Result.success()

            dirty.forEach { note ->
                ensureActive()  // 系统取消时尽快退出
                syncRepository.push(note)
            }
            Result.success()
        } catch (e: CancellationException) {
            throw e   // 不能吞掉,WorkManager 需要看到取消信号
        } catch (e: Exception) {
            if (runAttemptCount < MAX_RETRIES) Result.retry() else Result.failure()
        }
    }

    private fun ensureActive() {
        if (isStopped) throw CancellationException("WorkManager stopped this worker")
    }

    companion object {
        const val MAX_RETRIES = 5
        const val UNIQUE_NAME = "notedx-sync"
    }
}
```

`Result.retry()` 配合下面 `setBackoffCriteria` 用,WorkManager 会按指数退避自动重排;`Result.failure()` 是终结状态,不再重试,前置业务需自行决定后续路径(比如下次 App 启动再 enqueue)。

### 文件:`feature/sync/SyncScheduler.kt`(任务编排入口)

```kotlin
@Singleton
class SyncScheduler @Inject constructor(private val workManager: WorkManager) {

    /** 用户手动触发的"立即同步":expedited,几秒内开始。 */
    fun syncNow() {
        val request = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(networkConstraints())
            .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
            .addTag(TAG_MANUAL).build()
        workManager.enqueueUniqueWork(SyncWorker.UNIQUE_NAME, ExistingWorkPolicy.KEEP, request)
    }

    /** 自动后台同步:每 6 小时一次,联网 + 电量充足。 */
    fun schedulePeriodicSync() {
        val request = PeriodicWorkRequestBuilder<SyncWorker>(
            repeatInterval = 6, repeatIntervalTimeUnit = TimeUnit.HOURS,
            flexTimeInterval = 30, flexTimeIntervalUnit = TimeUnit.MINUTES,
        ).setConstraints(networkConstraints(requireBatteryNotLow = true))
            .addTag(TAG_PERIODIC).build()
        workManager.enqueueUniquePeriodicWork(
            "notedx-sync-periodic", ExistingPeriodicWorkPolicy.UPDATE, request)
    }

    private fun networkConstraints(requireBatteryNotLow: Boolean = false): Constraints =
        Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .setRequiresBatteryNotLow(requireBatteryNotLow).build()

    companion object {
        const val TAG_MANUAL = "sync-manual"
        const val TAG_PERIODIC = "sync-periodic"
    }
}
```

UI 层只需要:

```kotlin
class SyncViewModel @Inject constructor(
    private val scheduler: SyncScheduler, workManager: WorkManager,
) : ViewModel() {
    val syncState: StateFlow<List<WorkInfo>> = workManager
        .getWorkInfosByTagFlow(SyncScheduler.TAG_MANUAL)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
    fun onSyncClicked() = scheduler.syncNow()
}
```

`getWorkInfosByTagFlow` 是 2.7+ 的 `Flow<List<WorkInfo>>` 接口,Compose 里用 `collectAsStateWithLifecycle` 直接接进 UI,任务状态变化驱动 UI 重组,符合本系列单向数据流约束。

### 文件:`feature/voice/VoiceRecordingService.kt`(ForegroundService 模板)

NotedX 的语音备忘录(后台持续录音直到用户主动停止)WorkManager 不适用,必须裸写 ForegroundService。Android 15 强制 type 的标准模板:

```kotlin
package app.notedx.feature.voice

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class VoiceRecordingService : Service() {
    @Inject lateinit var recorder: VoiceRecorder

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_mic)
            .setContentTitle("正在录制语音笔记")
            .setOngoing(true)
            .build()

        // Android 14+ 必须传 type;Android 15 强制 type 与 manifest 一致
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(
                NOTIFICATION_ID, notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE,
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
        recorder.start()
        return START_STICKY
    }

    override fun onDestroy() { recorder.stop(); super.onDestroy() }
    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        private const val CHANNEL_ID = "voice-recording"
        private const val NOTIFICATION_ID = 1001
        fun start(context: Context) = context.startForegroundService(
            Intent(context, VoiceRecordingService::class.java))
        fun stop(context: Context) = context.stopService(
            Intent(context, VoiceRecordingService::class.java))
    }
}
```

`CHANNEL_ID` 对应的 Channel 在 Application onCreate 提前创建,见第 18 篇的 `NotificationChannels.ensureCreated`。对应 `AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE" />

<application ...>
    <service
        android:name=".feature.voice.VoiceRecordingService"
        android:exported="false"
        android:foregroundServiceType="microphone" />
</application>
```

**触发点**(必须从用户可见 UI 触发,不能在 BroadcastReceiver 里):

```kotlin
@Composable
fun VoiceRecordButton() {
    val context = LocalContext.current
    val micPermission = rememberPermissionController(
        android.Manifest.permission.RECORD_AUDIO,
    )
    Button(onClick = {
        when (micPermission.state) {
            PermissionState.Granted -> VoiceRecordingService.start(context)
            else -> micPermission.request()
        }
    }) { Text("开始录音") }
}
```

权限授予前不要去 `startForegroundService`,否则 `startForeground` 内部检查 `RECORD_AUDIO` 失败,直接 `SecurityException` 崩溃。这是第 16 篇权限状态机和本篇 type 矩阵在 Android 15 设备上必须串联起来的硬约束。

## 4. 调参与验收

### Expedited Work 配额心智

`setExpedited` 不是"无限优先",每个 App 在系统层有配额,按 App Standby Bucket 区分:

| Bucket | 每日 expedited 配额 | 触发条件 |
| --- | --- | --- |
| Active | ~10 分钟 | 当前正在使用 |
| Working set / Frequent | 中等 | 经常使用 |
| Rare / Restricted | 几乎为 0 | 一周一次或用户手动限制 |

配额耗尽后 `OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST` 自动降级为普通 work。**不要把 expedited 当普通任务用**,否则关键的"用户刚点了立即同步"会因为前面一堆 expedited 把配额耗光。

### 调试命令

```bash
# 看当前所有任务及状态
adb shell dumpsys jobscheduler | grep -A 20 app.notedx

# WorkManager 状态查询(在 logcat 看 "WM-DiagnosticsWrkr" 输出)
adb shell am broadcast -a "androidx.work.diagnostics.REQUEST_DIAGNOSTICS" -p app.notedx

# Doze 验证
adb shell dumpsys deviceidle force-idle    # 推入
adb shell dumpsys deviceidle unforce       # 解除
adb shell dumpsys battery reset

# 看进程占用的 FGS type
adb shell cmd activity foreground-service-types -p app.notedx
```

如果 `foreground-service-types` 显示 `none` 而 manifest 写了 `microphone`,意味着 `startForeground` 未带 type 参数,Android 15 会抛 `MissingForegroundServiceTypeException`。

### 验收清单

- [ ] WorkManager 默认 Initializer 已在 manifest 移除,Application 实现 `Configuration.Provider`,Hilt 注入的 Worker 能成功执行。
- [ ] `SyncWorker` 没网时 enqueue 进入 ENQUEUED,网络恢复后自动跑。
- [ ] `setExpedited` 的 Worker 在 Android 12+ 几秒内开始,无 OutOfQuota 警告。
- [ ] `PeriodicWorkRequest` 每 6 小时执行一次,Doze 期间不执行,退出 Doze 后立即 catch up。
- [ ] `VoiceRecordingService` 在 Android 15 真机上启动全流程通过,不抛 SecurityException;停止后 dumpsys 前台服务列表清空。
- [ ] 关闭 `RECORD_AUDIO` 后点录音按钮,UI 走"先申请权限"分支,不崩溃。
- [ ] 旋转屏幕 / 进程被杀 / 设备重启后,正在跑的 PeriodicWork 在条件再次满足时恢复执行。

## 5. 踩坑

**坑 1(Android 15 上线即崩):`startForeground` 不传 type 或 type 与 dangerous 权限不匹配。** Android 14 起 manifest 必须声明 type,Android 15 起 `startForeground` 调用必须传 type bitmask 且与 manifest 一致。漏写直接抛 `MissingForegroundServiceTypeException`;type 对应的 dangerous 权限未授予就启动抛 `SecurityException`。补救:`startForeground(id, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_*)` 三参版 + 启动前用 PermissionController 检查权限。**这是新 App 最高频崩溃源,必须在 API 35 设备上跑通完整路径**。

**坑 2:从 BroadcastReceiver 里 `startForegroundService`。** Android 14+ 后台拉前台已被收紧,99% 会失败(`ForegroundServiceStartNotAllowedException`)。补救:换成 enqueue 一个 expedited OneTimeWorkRequest,让 WorkManager 接管。

**坑 3:`Configuration.Provider` 没生效时 inject Worker。** 表现是运行时 "Could not instantiate ..." 异常。原因:WorkManager 默认 Initializer 仍在,先于 Hilt 拿到了配置。补救:manifest 里通过 `androidx.startup` `tools:node="remove"` 关闭默认 Initializer。

**坑 4:用 `Worker`(同步)或 `IntentService` 而不是 `CoroutineWorker`。** 前者无法响应取消、无法切线程;`IntentService` 在 API 30 弃用。新工程一律 `CoroutineWorker`。

**坑 5:任务里吞掉 `CancellationException`。** `try-catch (Exception)` 把 `CancellationException` 也吃了,WorkManager 看不到取消信号,任务状态被错误标记。补救:`catch (CancellationException)` 时显式 `throw`。

**坑 6:`PeriodicWorkRequest` 间隔小于 15 分钟。** 不报错,但被静默拉到 15 分钟,这是硬限制。真需要更高频率只能在 `doWork` 里 `delay` 循环,但相当于自己跑 ForegroundService,违背设计初衷。

**坑 7:`setExpedited` 当普通任务用,配额耗尽后反而比普通任务慢。** 配额耗尽后 expedited 按 `OutOfQuotaPolicy` 降级,普通任务有时还能优先调度。Expedited 留给"用户刚触发的、必须几秒内开始"的少数任务。

**坑 8:同名 unique work 用 `KEEP` 策略,新任务被丢。** 期望覆盖必须显式 `REPLACE`。命名清晰,避免业务误解。

**坑 9:`Result.retry()` 无 backoff 配置形成死循环。** 默认 30 秒重试,极端情况下 1 小时跑 100 次。补救:`BackoffPolicy.EXPONENTIAL`,设 `runAttemptCount` 上限,达到后 `Result.failure()` 终结。

**坑 10:测试时 WorkManager 不执行。** Instrumented test 里默认 Initializer 没起,需要 `WorkManagerTestInitHelper.initializeTestWorkManager(context, config)`,然后 `getTestDriver(context)?.setAllConstraintsMet(workId)` 强制满足约束。第 26 篇展开。

**坑 11:`Application.onCreate` 里 enqueue Periodic Work 用 `KEEP`。** 每次启动都 enqueue,旧的不被替换。要更新间隔用 `ExistingPeriodicWorkPolicy.UPDATE`(2.9+ 不会重置 backoff)。

**坑 12:`doWork` 里访问 UI / `Toast.makeText` / `Activity` 引用。** Worker 跑在系统调度的进程里没有 Activity,UI 操作直接崩。Worker 只做 Repo / 网络,UI 通讯走 `setProgress(Data)` + `getWorkInfoByIdFlow`。

**坑 13:`setForeground` 没 override `getForegroundInfo()` 或不传 type。** 漏写抛 `IllegalStateException` 或 `MissingForegroundServiceTypeException`。`ForegroundInfo` 第三个参数必须传 ServiceInfo type bitmask。

**坑 14:ForegroundService Notification importance 设成 NONE。** NONE 等价于隐藏,系统视为"不构成前台服务"可能被杀。要让通知不响铃用 `IMPORTANCE_LOW`(可见无声)。

**坑 15:ForegroundService 里 `withContext(Dispatchers.IO)` 跑长任务不管生命周期。** Service 已 `stopSelf`,协程还在跑。补救:Service 持有 `serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)`,`onDestroy` 调 `serviceScope.cancel()`。

**坑 16:期待 `WorkManager` 在 OEM 杀进程后仍立刻执行。** 国内 MIUI / HyperOS / ColorOS / Funtouch 对后台任务额外加省电策略,任务可能被显著推迟甚至跳过,Android API 无解。补救:让用户加"自启动"白名单;App 内提供"立即同步"按钮兜底;关键通知用 FCM(见第 18 篇)。和 16 篇坑 14 同源,设计时就把"任务最终一致而不保证及时"作为公开承诺。

## 手动验证

- [ ] Settings 打开"自动同步",`adb shell dumpsys jobscheduler` 出现 NotedX 相关 PeriodicWork。
- [ ] 关网点"立即同步",WorkInfo 进入 ENQUEUED;打开网络 30 秒内变为 RUNNING → SUCCEEDED。
- [ ] `force-idle` 推 Doze,Periodic 不执行;`unforce` 后 1 分钟内 catch up。
- [ ] Android 15 真机授予录音权限,点"开始录音",通知栏出现持续通知,`adb shell cmd activity foreground-service-types -p app.notedx` 显示 `microphone`。
- [ ] 拒绝录音权限再点录音按钮,弹权限对话框,无 Service 启动崩溃。
- [ ] 同步任务故意 `Result.retry()`,验证 backoff 指数增长,达到 `MAX_RETRIES` 后状态变 FAILED。

> 下一篇 [[18 篇:通知系统与推送通道]] 会接续 NotificationChannel / POST_NOTIFICATIONS 这条线,把"FGS 用到的持续通知"和"FCM 推送通知"、"国内推送渠道"放在同一个心智框架里讲。
