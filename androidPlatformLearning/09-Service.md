# Service:三种形态与后台限制收紧史

> 一句话:**Service 不是"后台线程",是一个跑在主线程、生命周期由 AMS 管理的组件**。Android 8.0 (API 26) 起后台 Service 被严格限制,WorkManager 替代了 99% 的 Service 用法,只剩"用户能看到的长任务"还得用前台服务。

---

## 一、Service 是什么(尤其不是什么)

新人第一个误解:**Service 是后台线程**。**不是**。

```kotlin
class MyService : Service() {
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // ⚠️ 这里跑在主线程!
        // 在这里写 while (true) { Thread.sleep(1000) } 会 ANR
        return START_STICKY
    }
}
```

**Service 跑在主线程**。它只是一个"在 App 后台时仍然可以存活的组件",生命周期与 Activity 解耦——Activity 销毁,Service 仍可在。但**Service 不是线程,Service 里要做后台任务还得自己开线程 / 协程**。

**那 Service 到底是什么**:**是一个组件契约**——你告诉 AMS"我有个 Service 需要长跑",AMS 给你一个比纯进程更稳的环境(不会因为没有可见 Activity 立刻被杀)。

---

## 二、三种 Service

| 形态 | 启动 | 寿命 | 用途 |
| --- | --- | --- | --- |
| **Started Service** | `startService()` | 直到 `stopSelf()` / `stopService()` | 后台任务 |
| **Bound Service** | `bindService()` | 跟随 binding 客户端 | IPC / 跨进程接口 |
| **Foreground Service** | `startForegroundService()` + 调用 `startForeground()` | 用户可见(有通知) | 长任务用户能感知 |

实际项目里:**Started 已被 WorkManager 替代,Bound 几乎不用,Foreground 是唯一还在大量使用的**。

---

## 三、Started Service

```kotlin
class SyncService : Service() {
    override fun onCreate() {
        super.onCreate()
        // 服务首次创建
    }
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // 每次 startService 都调,intent 是启动它的 Intent
        Thread {
            doSync()
            stopSelf(startId)               // 完成后自己关闭
        }.start()
        return START_STICKY                  // 被系统杀掉后自动重启
    }
    
    override fun onBind(intent: Intent): IBinder? = null    // Started Service 返回 null
    
    override fun onDestroy() {
        super.onDestroy()
    }
}

// 启动
ctx.startService(Intent(ctx, SyncService::class.java))
```

manifest:

```xml
<service android:name=".SyncService" android:exported="false" />
```

**`onStartCommand` 返回值**:

- `START_STICKY`——被系统杀,后续会重启,但 Intent 是 null
- `START_NOT_STICKY`——不重启
- `START_REDELIVER_INTENT`——重启时把原 Intent 重新派发

---

## 四、API 26 后台限制:Started Service 几乎不能用

Android 8.0(API 26)开始,**App 不在前台时 `startService` 直接抛 `IllegalStateException`**。原因:大量 App 滥用后台 Service 长跑,极度耗电。

**API 26+ 后,`startService` 唯一可靠的调用时机**:Activity 可见时。但你需要"用户切走 App 后任务继续"——这种场景:

- 改用 **`JobScheduler`**(API 21+ 原生)
- 改用 **WorkManager**(Jetpack 抽象,内部用 JobScheduler / AlarmManager / BroadcastReceiver,根据 API Level 选合适的)
- 用 **前台服务**——给用户显示通知,说明在做什么

**99% 数据同步 / 上传 / 周期任务都迁到 WorkManager**(现代版 16 篇)。Started Service **在新项目里几乎不该出现**。

---

## 五、Foreground Service:用户能看到的服务

```kotlin
class DownloadService : Service() {
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // 必须在 5 秒内调 startForeground
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_download)
            .setContentTitle("下载中")
            .setContentText("正在下载笔记附件")
            .setOngoing(true)
            .build()
        
        startForeground(
            NOTIFICATION_ID,
            notification,
            ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC   // API 34+ 必填
        )
        
        Thread { download(); stopForeground(STOP_FOREGROUND_REMOVE); stopSelf() }.start()
        return START_NOT_STICKY
    }
    
    override fun onBind(intent: Intent): IBinder? = null
}

// 启动(API 26+ 必须 startForegroundService)
ContextCompat.startForegroundService(ctx, Intent(ctx, DownloadService::class.java))
```

manifest(API 28+ 起):

```xml
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />

<service
    android:name=".DownloadService"
    android:foregroundServiceType="dataSync"
    android:exported="false" />
```

**API 34+ 起 Foreground Service Type 强制**——必须声明 type + 对应权限:

| Type | 权限 | 用途 |
| --- | --- | --- |
| `dataSync` | `FOREGROUND_SERVICE_DATA_SYNC` | 数据同步、上传 |
| `mediaPlayback` | `FOREGROUND_SERVICE_MEDIA_PLAYBACK` | 音频播放 |
| `location` | `FOREGROUND_SERVICE_LOCATION` + 位置权限 | 实时定位 |
| `connectedDevice` | `FOREGROUND_SERVICE_CONNECTED_DEVICE` | 蓝牙 / 配件 |
| `mediaProjection` | `FOREGROUND_SERVICE_MEDIA_PROJECTION` | 录屏 |
| `phoneCall` | `FOREGROUND_SERVICE_PHONE_CALL` | 通话 |
| `camera` | `FOREGROUND_SERVICE_CAMERA` + 相机权限 | 相机后台使用 |
| `microphone` | `FOREGROUND_SERVICE_MICROPHONE` + 录音权限 | 麦克风 |
| `specialUse` | `FOREGROUND_SERVICE_SPECIAL_USE` | 上面都不匹配的特殊用途(需 Play 审核) |
| `systemExempted` | (受限) | 系统级豁免 |

**漏配 type**:API 34+ 启动前台服务直接抛 SecurityException。

---

## 六、Bound Service:IPC 接口

```kotlin
class NoteService : Service() {
    private val binder = object : INoteService.Stub() {
        override fun save(note: Note) { /* ... */ }
    }
    override fun onBind(intent: Intent): IBinder = binder
}

// 客户端
val conn = object : ServiceConnection {
    override fun onServiceConnected(name: ComponentName, b: IBinder) {
        val service = INoteService.Stub.asInterface(b)
        service.save(...)
    }
    override fun onServiceDisconnected(name: ComponentName) {}
}
ctx.bindService(Intent(ctx, NoteService::class.java), conn, BIND_AUTO_CREATE)
```

`onBind` 返回 `IBinder`,客户端 `bindService` 拿到后调 RPC。

**Bound Service 的寿命**:跟随 binding 客户端——所有绑定方都 `unbindService` 后,Service 被销毁。

**典型用例**:跨进程通信(自己 App 多进程 / 暴露给其他 App 的服务 SDK)。**单进程 App 内通常不用 Bound Service**——直接调单例类就行,何必走 IPC?

---

## 七、`IntentService`:已废弃

`IntentService` 是 2010 年提供的便利类——在工作线程跑 onHandleIntent,自动 stopSelf。

但 API 26 后台限制让 IntentService **几乎不可用**——你 startService 直接抛异常。Google 在 API 30 显式 deprecated 它。

**新代码不要用 IntentService**。后台任务用 WorkManager,前台任务用 Foreground Service + 自管线程 / 协程。

---

## 八、JobScheduler:系统级后台调度

```kotlin
val jobInfo = JobInfo.Builder(
    JOB_ID,
    ComponentName(ctx, SyncJobService::class.java)
)
    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_UNMETERED)
    .setPeriodic(TimeUnit.HOURS.toMillis(4))
    .setRequiresCharging(true)
    .build()

ctx.getSystemService<JobScheduler>()!!.schedule(jobInfo)

class SyncJobService : JobService() {
    override fun onStartJob(params: JobParameters): Boolean {
        // 跑工作,完成时调 jobFinished(params, false)
        return true        // true = 异步执行
    }
    override fun onStopJob(params: JobParameters): Boolean = true
}
```

**JobScheduler 是 API 21+ 原生 API**,系统根据约束(网络 / 电量 / 闲置 / 充电)统一调度,**比直接 startService 省电得多**。

**WorkManager 内部用的就是 JobScheduler**(API 23+)/ AlarmManager(API < 23)。新代码用 WorkManager 抽象,不直接用 JobScheduler。

---

## 九、AlarmManager:精确定时

```kotlin
val pendingIntent = PendingIntent.getBroadcast(ctx, 0, Intent(ctx, MyReceiver::class.java),
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

val am = ctx.getSystemService<AlarmManager>()!!
am.setExactAndAllowWhileIdle(
    AlarmManager.RTC_WAKEUP,
    System.currentTimeMillis() + 60_000,    // 1 分钟后
    pendingIntent
)
```

`AlarmManager` 是 Android 上"精确定时"的唯一答案——闹钟、提醒、按时启动任务。**WorkManager 不能保证秒级精度**(15 分钟最小周期 + 系统聚合)。

**API 31+ 限制**:`setExactAndAllowWhileIdle` 需要 `SCHEDULE_EXACT_ALARM` 权限(用户可在系统设置撤销),否则降级为不精确(可能延迟几小时)。

**用例**:闹钟 App、笔记定时提醒(NotedX 的功能)。**不要用 AlarmManager 做"定时同步数据"**——这是 WorkManager 的活,AlarmManager 浪费电。

---

## 十、Service 的真实生死

```
startService → onCreate → onStartCommand → 运行
   ↓
后续 startService → onStartCommand(再次调用,onCreate 不重)
   ↓
stopSelf / stopService → onDestroy
```

**关键认识**:**多次 startService 只会 onCreate 一次**,但 onStartCommand 每次都调。Service 是单例(进程内)。

**进程死了 Service 也死**——Service 不能跨进程存活。

---

## 十一、Service 与协程:`LifecycleService`

老式 Service 自己开 Thread,管理复杂。Jetpack 提供 **`LifecycleService`**:

```kotlin
class SyncService : LifecycleService() {
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)
        lifecycleScope.launch {
            doSync()
            stopSelf(startId)
        }
        return START_NOT_STICKY
    }
}
```

`LifecycleService` 内置 `lifecycleScope`——Service 销毁时所有协程自动取消。**新 Service 代码用 LifecycleService,不要继承裸 Service**。

依赖:`androidx.lifecycle:lifecycle-service`。

---

## 十二、什么时候真的需要 Service

只在以下场景:

1. **WorkManager 不够用**:周期最小 15 分钟,精度不够;约束不灵活
2. **需要前台服务标识**:音乐播放、健身追踪、实时录音——用户必须能看到通知
3. **跨进程 / 跨 App 调用**:Bound Service + AIDL(自家多进程 App 或暴露 SDK)
4. **需要 `START_STICKY` 行为**:被系统杀后自动重启(罕见,且不可靠)

**99% App 不用 Service**——WorkManager 全覆盖。NotedX 的同步走 WorkManager,只有"下载大附件用户能看到进度"才用前台服务。

---

## 十三、Service 与 ANR

**Service 跑在主线程**——onStartCommand / onBind / onDestroy 阻塞超过 **20 秒** 触发 Service ANR(不是 5 秒)。

但 20 秒也短。Service 里:

```kotlin
override fun onStartCommand(...): Int {
    // ✅ 启动协程,立即返回
    serviceScope.launch { doWork() }
    return START_NOT_STICKY
}
```

**永远不要在 Service 主线程做阻塞 IO / 长计算**。

---

## 十四、API 26-34 的关键收紧

| API | 变化 | 影响 |
| --- | --- | --- |
| **26 (Android 8)** | 后台 startService 抛异常 | 推动 WorkManager 诞生 |
| **26** | NotificationChannel 强制 | 前台 Service 必须给 channel |
| **28 (Android 9)** | 前台服务需 `FOREGROUND_SERVICE` 权限 | manifest 必须声明 |
| **29 (Android 10)** | 部分场景拒绝后台启动 Activity | Service 拉起 Activity 受限 |
| **31 (Android 12)** | 后台启动前台服务严格限制 | 必须从前台启动 / 满足特定豁免 |
| **34 (Android 14)** | Foreground Service Type 强制 | 必须声明 type + 权限 |
| **35 (Android 15)** | 进一步加强 | 类型权限审查更严 |

**总趋势**:**Android 在系统层逼应用减少后台执行**。这是好事——用户电池更省,但 Service 编程越来越受限。

---

## 十五、`stopForeground` 的几种模式

```kotlin
stopForeground(STOP_FOREGROUND_REMOVE)      // 移除通知,Service 仍跑(但失去前台保护,容易被杀)
stopForeground(STOP_FOREGROUND_DETACH)      // 通知留着,Service 退到后台
stopSelf()                                  // 关闭 Service
```

`stopForeground` 后 Service **不自动关闭**——还需 `stopSelf`。

**典型流程**:`startForeground` → 做事 → `stopForeground(STOP_FOREGROUND_REMOVE)` + `stopSelf()`。

---

## 十六、Service 与 Notification 的绑定

Foreground Service 的通知**不可被划走**——必须 ongoing,且不能被用户手动 dismiss(直到 Service 退出前台)。

```kotlin
NotificationCompat.Builder(this, CHANNEL_ID)
    .setSmallIcon(...)
    .setContentTitle(...)
    .setOngoing(true)               // 用户不能划掉
    .setPriority(NotificationCompat.PRIORITY_LOW)   // 不打扰
    .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
    .build()
```

**Android 12+ 前台服务有 10 秒延迟**——通知默认 10 秒后才显示,避免短任务"闪一下"通知。`FOREGROUND_SERVICE_IMMEDIATE` 让它立即显示(适合用户能感知的任务)。

---

## 十七、调试

```bash
# 查看当前 Service
adb shell dumpsys activity services com.notedx

# 停 Service
adb shell am stopservice com.notedx/.SyncService

# 看前台服务列表
adb shell dumpsys activity processes | grep -A 5 "Foreground services"
```

---

## 十八、踩坑

**坑 1:`startService` 后台调用直接崩(API 26+)**。新代码不要 startService 启动后台任务;用 WorkManager 或 startForegroundService。

**坑 2:`startForegroundService` 后忘记调 `startForeground`**。**5 秒内必须调,否则系统抛 ANR + RemoteServiceException**。常见原因:onStartCommand 里先做了别的事再调 startForeground。

**坑 3:Service 写阻塞代码**。Service 主线程,阻塞导致 ANR。永远用协程 / 线程做长任务。

**坑 4:`stopService` 后立即 startService**。`stopService` 是异步的,onDestroy 还没跑完你又启动——可能出现"老 instance 还在销毁中,新 instance 已创建" 的诡异状态。

**坑 5:多次 `startService` 期望多次 onCreate**。Service 是单例,onCreate 只一次。多次 startService 触发多次 onStartCommand。

**坑 6:`onBind` 返回 null 是 Bound Service 错误**。Started Service `onBind` 返回 null 是正确的;Bound Service 必须返回真的 IBinder。

**坑 7:`onUnbind` 不返回 true 期望 `onRebind`**。`onUnbind` 默认返回 false,系统认为 Service 完全结束;返回 true 才会在下次 bindService 时调 onRebind 而不是 onBind。

**坑 8:不声明 Foreground Service Type(API 34+)**。直接 SecurityException。每种 type 都要在 manifest + 启动代码声明。

**坑 9:Foreground Service 持有 Activity 引用**。Service 寿命比 Activity 长——持有 Activity 字段会泄漏。用 ApplicationContext。

**坑 10:用 Service 做"用户切走应用后定时弹窗"**。这是被系统严厉打击的反模式——Android 一定会杀掉这种 Service。提醒 / 闹钟用 AlarmManager + Notification 才是正路。

---

下一篇 `10-BroadcastReceiver 显式 隐式 API26 之后.md`,讲 Android 的"事件总线":系统广播(`BOOT_COMPLETED` / `BATTERY_LOW` / `CONNECTIVITY_CHANGE`)、自定义广播、动态 / 静态注册的区别、API 26 起为什么大部分静态注册广播被禁用、`LocalBroadcastManager` 为什么也被 deprecated。
