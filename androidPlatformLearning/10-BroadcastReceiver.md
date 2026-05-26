# BroadcastReceiver:显式、隐式与 API 26 之后

> 一句话:**BroadcastReceiver 是 Android 上的"事件总线"——系统状态变化(开机 / 电量低 / 网络变化)和 App 之间通信都靠它**。但 API 26 起大部分静态注册广播被禁,新代码用法已经大幅收紧。

---

## 一、Broadcast 是什么

Android 的"广播"是一种**进程间消息派发机制**。任何 App 或系统服务可以发广播(`sendBroadcast`),声明了对应 intent-filter 的 Receiver 都能收到。

```
某进程 sendBroadcast(Intent("MY_ACTION"))
   ↓
AMS 收到 Binder
   ↓
AMS 查 PMS,找出所有注册了 "MY_ACTION" intent-filter 的 Receiver
   ↓
逐个 Receiver(可能在不同进程):
   - 如果对应进程已启动 → 直接派发
   - 如果未启动 → 拉起进程(API 26 前)/ 跳过(API 26 后大多数情况)
   ↓
对应 BroadcastReceiver.onReceive(context, intent) 被调
```

**关键性质**:
- 广播是**异步的**——`sendBroadcast` 立即返回,接收方不阻塞发送方
- 广播**没有返回值**——单向通知
- 广播**可被拦截 / 中止**(有序广播)
- 广播**跨进程**——天然 IPC

---

## 二、系统广播:常见 Action 清单

```
android.intent.action.BOOT_COMPLETED          ← 开机完成
android.intent.action.SCREEN_ON / SCREEN_OFF  ← 屏幕开关
android.intent.action.AIRPLANE_MODE           ← 飞行模式切换
android.intent.action.BATTERY_LOW / OKAY      ← 电量过低 / 恢复
android.intent.action.PACKAGE_ADDED / REMOVED ← App 装 / 卸
android.intent.action.LOCALE_CHANGED          ← 系统语言改了
android.net.conn.CONNECTIVITY_CHANGE          ← 网络变化
android.intent.action.TIME_TICK               ← 每分钟一次
android.intent.action.TIMEZONE_CHANGED        ← 时区改了
android.intent.action.HEADSET_PLUG            ← 耳机插拔
android.bluetooth.adapter.action.STATE_CHANGED ← 蓝牙开关
```

完整清单在 [`Intent` 文档](https://developer.android.com/reference/android/content/Intent),几百个。

---

## 三、静态注册:manifest 里声明

```xml
<receiver android:name=".BootReceiver" android:exported="true">
    <intent-filter>
        <action android:name="android.intent.action.BOOT_COMPLETED" />
    </intent-filter>
</receiver>
```

```kotlin
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            // 开机后自启动:启动一个 WorkManager 任务做周期同步
            SyncWorker.schedulePeriodic(context.applicationContext)
        }
    }
}
```

manifest 还需要权限:

```xml
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
```

**API 26+ 限制**:**绝大多数隐式广播禁止静态注册**(不能让睡眠中的 App 因为收到广播而被唤醒)。

允许静态注册的广播只剩**少数白名单**(Android 文档 [Implicit Broadcast Exceptions](https://developer.android.com/guide/components/broadcast-exceptions)):

- `BOOT_COMPLETED`
- `LOCKED_BOOT_COMPLETED`
- `LOCALE_CHANGED`
- `PACKAGE_ADDED` / `REMOVED`(只针对自己)
- `TIMEZONE_CHANGED`
- `HEADSET_PLUG`(USB / 蓝牙类硬件)
- 还有一些低级别系统事件

**不在白名单的隐式广播**(`CONNECTIVITY_CHANGE` / `SCREEN_ON` 等)静态注册收不到——必须用**动态注册**(下一节)或者**JobScheduler 的网络约束**。

---

## 四、动态注册:代码里 `registerReceiver`

```kotlin
class MainActivity : ComponentActivity() {
    private val networkReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            // 网络变化
        }
    }

    override fun onStart() {
        super.onStart()
        registerReceiver(
            networkReceiver,
            IntentFilter(ConnectivityManager.CONNECTIVITY_ACTION),
            ContextCompat.RECEIVER_NOT_EXPORTED      // API 34+ 必须显式声明
        )
    }

    override fun onStop() {
        super.onStop()
        unregisterReceiver(networkReceiver)         // 必须解注册
    }
}
```

**动态注册的关键约束**:

1. **必须配对 unregister**——漏掉就泄漏 Activity
2. **生命周期与注册的 Context 绑定**——Activity 销毁后 Receiver 失效
3. **API 34+ 必须显式声明 `RECEIVER_NOT_EXPORTED` / `RECEIVER_EXPORTED`**

**`RECEIVER_NOT_EXPORTED`** 表示只接收自己 App 的广播,其他 App 发的同 action 不收(安全防御)。99% 用 NOT_EXPORTED。

**动态注册不受 API 26 限制**——因为它和 App 进程一起死,不会唤醒睡眠 App。

---

## 五、`LocalBroadcastManager`:已 deprecated

历史上 `LocalBroadcastManager`(`androidx.localbroadcastmanager`)做"进程内广播"——比 `sendBroadcast` 快(不走 AMS),只本进程可见。

```kotlin
LocalBroadcastManager.getInstance(ctx).registerReceiver(receiver, filter)
LocalBroadcastManager.getInstance(ctx).sendBroadcast(intent)
```

**API 33 起官方明确 deprecated**——理由:本质上是给"App 内事件总线"用的,但远不如:
- `Flow` / `LiveData`(共享数据)
- `EventBus` / 自定义 `SharedFlow`(事件)
- ViewModel 之间通过 Repository 共享

**新代码完全不要用 LocalBroadcastManager**。老代码迁移到 Flow / LiveData。

---

## 六、发广播

```kotlin
// 隐式广播(谁注册了对应 filter 谁收)
val intent = Intent("com.notedx.SYNC_COMPLETE").apply {
    `package` = ctx.packageName            // ← API 26+ 必须显式限制 package,否则被丢
    putExtra("count", 42)
}
ctx.sendBroadcast(intent)

// 显式广播(指定接收方组件)
val intent = Intent(ctx, MyReceiver::class.java).apply {
    putExtra("count", 42)
}
ctx.sendBroadcast(intent)
```

**API 26+ 隐式广播必须给 `package`**——否则 AMS 会拒绝派发(防止 App 监听任意广播)。

**有序广播**(`sendOrderedBroadcast`):接收方按优先级顺序收,前一个可以阻断(`abortBroadcast()`)。**几乎不用**。

**Sticky broadcast**:发完留在系统里,后续注册的 Receiver 也能收到——已 deprecated,不要用。

---

## 七、`onReceive` 的执行约束

```kotlin
class MyReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        // ⚠️ 跑在主线程
        // ⚠️ 最多 10 秒执行时间
        // ⚠️ 这之后 Receiver 实例会被销毁,不能持有 async callback
    }
}
```

**铁律**:

1. **`onReceive` 跑在主线程**——不能阻塞,不能做 IO
2. **10 秒超时**——超过会 ANR(Broadcast ANR)
3. **执行完 Receiver 实例就销毁**——不能在 onReceive 里启动异步任务期待回调

如果要做长任务,在 `onReceive` 里:

```kotlin
override fun onReceive(context: Context, intent: Intent) {
    // 把工作交给 WorkManager,onReceive 立即返回
    SyncWorker.runNow(context)
}
```

或用 `goAsync()`(让 Receiver 延后销毁):

```kotlin
override fun onReceive(context: Context, intent: Intent) {
    val pendingResult = goAsync()
    CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
        try {
            doWork()
        } finally {
            pendingResult.finish()
        }
    }
}
```

`goAsync` 让 Receiver 最多额外存活 10 秒(总 20 秒)——超时仍然 ANR。

---

## 八、`PendingIntent`:跨进程的"延迟 Intent"

```kotlin
val intent = Intent(ctx, MyReceiver::class.java).apply {
    action = "com.notedx.RING"
}
val pi = PendingIntent.getBroadcast(
    ctx, 0, intent,
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
)

// 把 pi 交给 AlarmManager,1 分钟后系统帮你发出
alarmManager.setExactAndAllowWhileIdle(
    AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + 60_000, pi
)
```

**`PendingIntent` 是"Intent + 你的 App 身份"**——系统持有它,在合适时刻代表你发出广播 / 启动 Activity / 启动 Service。

`FLAG_IMMUTABLE`(API 31+ 强制)——`PendingIntent` 不可被修改。漏写直接抛异常。

**用例**:
- **AlarmManager**:定时触发 Receiver
- **Notification**:用户点击通知触发 Activity / Receiver
- **WidgetProvider**:Widget 上点击触发 Action

---

## 九、`Activity.startActivity` vs `BroadcastReceiver` 派发

A 进程发广播 → AMS → B 进程对应 Receiver。中间走 Binder 至少两跳。**性能上不该用广播代替函数调用**——同进程内组件间通信用 Flow / LiveData / Repository 远胜广播。

**广播真正的用途**:
- 跨进程通信(自己 App 多进程 / 跟其他 App 通信)
- 系统事件订阅(BOOT_COMPLETED / 充电 / 网络变化)
- 异构组件松散耦合(Widget + 主 App)

---

## 十、App 间广播(已大幅受限)

**给特定 App 发广播**:

```kotlin
val intent = Intent("com.partner.ACTION_PAY").apply {
    `package` = "com.partner.app"
    putExtra("orderId", "12345")
}
ctx.sendBroadcast(intent)
```

接收方 App 需要在 manifest 声明对应 intent-filter + `exported="true"` + 可能需要权限保护:

```xml
<receiver android:name=".PartnerReceiver" android:exported="true" android:permission="com.partner.PAY_PERMISSION">
    <intent-filter>
        <action android:name="com.partner.ACTION_PAY" />
    </intent-filter>
</receiver>
```

**带权限保护**:发送方必须声明 `<uses-permission android:name="com.partner.PAY_PERMISSION" />`——否则发不出去。

**App 间广播在现代 Android 几乎不用**——首选 Deep Link / Intent Action 启动 Activity,或者各家自己的 SDK API。

---

## 十一、`registerReceiver` 接收无 filter 的全部广播

```kotlin
registerReceiver(receiver, IntentFilter().apply {
    addAction("com.notedx.X")
    addAction("com.notedx.Y")
    addCategory(Intent.CATEGORY_DEFAULT)
    addDataScheme("file")
    // ...
})
```

`IntentFilter` 支持 action / category / scheme / mimetype / path 等多维过滤。

**`addAction` 必须至少一个**——空 filter 收不到任何广播。

---

## 十二、Receiver 与 Hilt

```kotlin
@AndroidEntryPoint
class BootReceiver : BroadcastReceiver() {
    @Inject lateinit var syncScheduler: SyncScheduler
    
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            syncScheduler.schedule()
        }
    }
}
```

`@AndroidEntryPoint` 让 Receiver 享受 Hilt 字段注入——`@Inject lateinit var` 在 `onReceive` 调用前被填好。**官方推荐写法**,12 篇展开。

---

## 十三、`am broadcast`:用 ADB 触发广播

```bash
# 模拟系统启动
adb shell am broadcast -a android.intent.action.BOOT_COMPLETED

# 给自己 App 发自定义广播
adb shell am broadcast -a com.notedx.SYNC_NOW -n com.notedx/.SyncReceiver

# 带 extra
adb shell am broadcast -a com.notedx.SYNC --es key value --ei count 42
```

**调试 Receiver 时极常用**——不用真重启手机就能测 BOOT_COMPLETED 逻辑。

---

## 十四、Broadcast 的现代替代

**90% 的"广播"用法在现代项目应当被以下方案替代**:

| 旧用法 | 现代替代 |
| --- | --- |
| App 内事件总线(LocalBroadcastManager) | `SharedFlow` / `EventBus` |
| 监听网络变化 | `ConnectivityManager.registerDefaultNetworkCallback` |
| 监听位置变化 | `FusedLocationProviderClient.requestLocationUpdates` |
| 监听电量变化 | `BatteryManager` + 协程订阅 |
| `BOOT_COMPLETED` 重启周期任务 | WorkManager(`KEEP` 策略,自动跨重启保持) |
| Widget 点击触发 Action | `actionRunCallback`(Glance)/ PendingIntent.getActivity |

**真正还在用的场景**:开机自启动、推送 SDK 内部、与系统硬件事件(蓝牙 / 耳机插拔)。

---

## 十五、调试

```bash
# 查看进程的 Receiver 列表
adb shell dumpsys activity broadcasts

# 看 manifest 注册的 Receiver
adb shell dumpsys package com.notedx | grep -A 5 "Receivers"

# 触发系统广播测试
adb shell am broadcast -a android.intent.action.ACTION_POWER_CONNECTED
```

---

## 十六、踩坑

**坑 1:静态注册隐式广播,API 26+ 收不到**。最常见:`CONNECTIVITY_CHANGE` 静态注册——以为开机自启自带网络监听,实际从 API 26 起白白浪费配置。**改动态注册或者用 ConnectivityManager 回调**。

**坑 2:`registerReceiver` 没配对 `unregisterReceiver`**。Activity 销毁但 Receiver 还在,系统报 leak。**onStart/onResume + onStop/onPause 配对**。

**坑 3:`onReceive` 写阻塞代码**。10 秒就 ANR。**Receiver 里只做轻量调度,真活交给 WorkManager**。

**坑 4:`goAsync` 不调 `pendingResult.finish()`**。Receiver 进程被系统保活 20 秒,资源浪费。永远 try/finally 调 finish。

**坑 5:`PendingIntent` 缺 `FLAG_IMMUTABLE`**。API 31+ 直接崩。**永远写**:`FLAG_UPDATE_CURRENT or FLAG_IMMUTABLE`。

**坑 6:发隐式广播不写 `package`**。API 26+ 直接被丢弃,什么效果都没有,但不报错——开发者 confused。

**坑 7:Receiver 持有外部对象引用**。Receiver 实例每次 onReceive 后被销毁,你 在 onReceive 里赋值 static 字段持有 Context → 泄漏。

**坑 8:动态注册 + 静态注册同一个 Receiver**。两份都生效,onReceive 跑两次。一个 App 一个 Action 选一种注册方式。

**坑 9:用广播做高频通知**。每秒 N 次广播会让 AMS 不堪重负。**进程内事件用 Flow,跨进程才用广播**。

**坑 10:LocalBroadcastManager 新代码还在用**。已废弃,且性能 + 内存比 SharedFlow 差。**全面迁移**。

---

下一篇 `11-ContentProvider URI 协议与跨进程数据共享.md`,讲 Android 唯一"按 URL 风格查数据"的组件——ContentProvider:为什么 Contacts / Calendar / MediaStore 都暴露为 Provider、`content://` URI 怎么解析、Cursor 怎么跨进程传、FileProvider 怎么分享私有文件给其他 App。
