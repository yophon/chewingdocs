# 进程、Sandbox 与 UID 模型

> 一句话:**每个 Android App 是一个独立 Linux 进程,有自己的 UID 沙箱;进程由 Zygote fork 出来,生死由 AMS 编排,系统内存压力下随时可能被 Low Memory Killer 杀掉**。理解进程模型,才能理解 Activity 生命周期、ViewModel 为什么需要 SavedStateHandle、为什么 Service 不是"线程"。

---

## 一、Linux 进程,但 Android 风格

每个 Android App **是一个 Linux 进程**——`ps -A` 能看到:

```bash
adb shell ps -A | grep notedx
# u0_a142  12345  789  4321432  234567 do_epoll_wait  0  S  com.notedx
```

- `u0_a142`——这是用户 0(主用户)下的 App 142(从 10000+142 算出 UID=10142)
- `12345`——PID(进程 ID)
- `789`——PPID(父进程 ID,通常是 Zygote)
- `com.notedx`——进程名(默认等于包名)

**关键认识**:Android App 进程**不是常规 Linux daemon**——它由系统的 AMS 控制启停,不是 systemd / init 启动,不是 shell `./myapp` 启动。

---

## 二、Zygote:所有 App 进程的妈妈

**Zygote** 是 Android 进程模型的核心设计。开机时:

```
内核启动
   ↓
init 进程(PID 1)
   ↓
init 启动 Zygote 进程
   ↓
Zygote 加载 ART runtime
Zygote 预加载 ~3000 个常用系统类(android.app.*, android.view.*, ...)
Zygote 预加载常用资源(系统图标、字符串)
   ↓
Zygote 在 socket 上 listen,等 AMS 命令
   ↓
用户点 App 图标
   ↓
AMS 通过 socket 发命令给 Zygote:"fork 一个进程,UID=10142,运行 com.notedx"
   ↓
Zygote.fork()
   ↓
子进程继承 Zygote 已经预加载的 ART + 系统类 + 资源(Copy-on-Write)
   ↓
子进程 setUid(10142),换身份
   ↓
子进程开始跑 ActivityThread.main() → Application.onCreate() → ...
```

**为什么这么设计**:

1. **启动快**——`fork()` 一个已经预加载的进程,远比"从零启动 JVM + 加载 class"快
2. **省内存**——预加载的内容在 fork 后通过 Copy-on-Write 共享,几十个 App 共用一份系统类内存

**`adb shell ps | grep zygote`** 能看到:

```
root  651  ...  zygote        # 32-bit Zygote
root  652  ...  zygote64      # 64-bit Zygote
```

64 位 / 32 位 Zygote 各一份(因为 App 可能是任一架构)。

**App 进程死了不会自动重启**——AMS 决定要不要重启。例如系统因内存压力杀了你的 App,用户再点图标会重新 fork。

---

## 三、UID 沙箱

Android 用 **Linux 的 UID 隔离机制** 做应用沙箱:

| UID 范围 | 用途 |
| --- | --- |
| 0 | root,Android 上几乎不可访问 |
| 1000-9999 | 系统服务(system_server / phone / surfaceflinger / ...) |
| **10000+** | **普通 App**(每个 App 一个唯一 UID) |
| 99000-99999 | Isolated 进程(WebView 的 sandbox 子进程) |

**安装 NotedX 时**:

1. PMS 从可用 UID 池里取一个,比如 10142
2. 创建 `/data/data/com.notedx/`,**属主 UID=10142,权限 700**
3. 把这个 UID 记到 `/data/system/packages.xml`

**App 启动时**:

1. Zygote fork 出新进程,初始 UID 是 root(继承自 Zygote)
2. **立刻 `setUid(10142)`**——把进程身份降到 NotedX 的 UID
3. 从此这个进程只能用 NotedX 的权限干事

**沙箱的物理表现**:

```bash
# 在 ADB shell 里(非 root)
adb shell
ls /data/data/com.notedx        # Permission denied(不是属主)

adb shell run-as com.notedx     # 切换到 NotedX 的 UID
ls /data/data/com.notedx        # OK,看到 files/ databases/ shared_prefs/
```

**`run-as` 只对 debuggable App 工作**(release 包不能 run-as)。

---

## 四、AndroidManifest 与 UID 共享

```xml
<!-- 同签名的两个 App 可以共享 UID -->
<manifest ...
    android:sharedUserId="com.mycompany.shared">
```

声明同样的 `sharedUserId` 且签名一致的两个 App,**会跑在同一个 UID 下**——它们能互相读取数据目录、共用网络配置。

**几乎不该用**:破坏沙箱,带来意外耦合。**新代码不要碰** `sharedUserId`,Google 已经在文档里标 deprecated 路径。

---

## 五、Application:进程的"入口对象"

每个 App 进程**只有一个 `Application` 实例**——在进程启动时第一个被创建。

```kotlin
class NotedXApp : Application() {
    override fun onCreate() {
        super.onCreate()
        // 进程级初始化:Hilt / WorkManager / NotificationChannel
    }

    override fun onTerminate() {
        // 几乎不会被调用——系统杀 App 是 kill -9,没机会清理
    }

    override fun onLowMemory() {
        // 系统内存压力时通知 App 释放缓存
    }
}
```

**`Application` 与进程同生共死**——进程被杀,Application 就没了;下次启动会重新创建。

**`Application` 不是单例,但实际行为像单例**——一个 App 进程内全局只有一份,你可以通过 `Context.applicationContext` 拿到。`Activity.application` 也指向同一对象。

**Hilt 通过 `@HiltAndroidApp` 注解给 Application 自动接管初始化**——`@AndroidEntryPoint` 的 Activity 在创建时被注入。这套机制的"入口"就是 Application。

---

## 六、`ActivityThread`:每个 App 进程的主线程入口

Zygote fork 出新进程后,跑的不是你的 `MainActivity`,而是 `android.app.ActivityThread.main()`——这是 Framework 提供的入口。

简化的 `ActivityThread.main()`:

```java
public static void main(String[] args) {
    Looper.prepareMainLooper();              // 给主线程准备 Looper
    ActivityThread thread = new ActivityThread();
    thread.attach(false);                    // 通知 AMS:这个 App 起来了
    Looper.loop();                           // 主线程进入消息循环,永不返回
}
```

**关键认识**:

- **主线程是一个 Looper 死循环**——12 篇会展开
- **App 进程的"事件来源"是 AMS**——AMS 通过 Binder 发消息给 ActivityThread:"创建 Activity X" / "暂停 Activity Y" / "销毁 Service Z"
- **ActivityThread 收到 Binder 消息后转化为对你 App 代码的回调**——`onCreate()` / `onPause()` / `onDestroy()`

这意味着**你写的 Activity 类不是被你 new 出来的**——是 AMS 通过 ActivityThread 反射创建的。所以 Activity 没有公开的构造函数参数,所有数据通过 `Intent` 传(因为 Intent 能被 AMS 持有 / 序列化)。

---

## 七、多进程:`android:process`

默认一个 App 一个进程,但 manifest 能配多进程:

```xml
<service
    android:name=".PushService"
    android:process=":push" />            <!-- 私有进程,进程名为 com.notedx:push -->

<service
    android:name=".AudioService"
    android:process=":audio" />

<service
    android:name=".SharedService"
    android:process="com.notedx.shared" />  <!-- 公共进程,可被同 UID 其他 App 共享 -->
```

**冒号开头**(`:push`):私有进程,只这个 App 用。
**全名(无冒号)**:可被同 `sharedUserId` 的其他 App 共享。

**多进程的代价**:

1. **每个进程独立的 Application 实例**——你 `NotedXApp.onCreate` 跑 N 次(每个进程一次)
2. **每个进程独立的内存空间**——一个进程的 `static` 字段在另一个进程看不到
3. **进程间通信只能 Binder**——`AIDL` / `Messenger` / `ContentProvider`

**何时多进程**:

- **WebView**——WebView 本身就跑在 isolated 进程,你不用配
- **推送 / 长连接进程**——主进程退到后台被杀时推送还活着(已被 FCM 推送替代,意义降低)
- **大内存 / 易崩溃组件**——把图像处理放独立进程,挂了不影响主进程

**99% App 单进程足够**。新项目不要主动多进程。

---

## 八、`ProcessLifecycleOwner`:进程级前后台

```kotlin
ProcessLifecycleOwner.get().lifecycle.addObserver(object : DefaultLifecycleObserver {
    override fun onStart(owner: LifecycleOwner) {
        // 整个 App 进入前台(任意 Activity 可见)
    }
    override fun onStop(owner: LifecycleOwner) {
        // 整个 App 退到后台(所有 Activity 不可见)
    }
})
```

`ProcessLifecycleOwner` 是 Jetpack 提供的"进程级 LifecycleOwner"——它聚合 App 内所有 Activity 的生命周期,推断进程是否前台。

**用途**:统计 App 使用时长、前台时 polling 、后台时停止订阅、应用切到后台时上报埋点。

注意它**有 700ms 延迟**——Activity 切换瞬间会有"老 Activity stop → 新 Activity start"的过渡,中间 700ms 内不发"进入后台"信号,避免误判。

---

## 九、进程被杀的常见原因

| 原因 | 触发 | App 表现 |
| --- | --- | --- |
| **内存压力(LMK)** | 系统 RAM 不够 | App 进程被 `kill -9`,无 onDestroy |
| **用户在"最近任务"上滑** | 用户主动 | App 进程被杀 |
| **`force stop`** | 设置 / `am force-stop` | 同上,但 Receiver 也被禁(除非用户再启动) |
| **崩溃** | 未捕获异常 | 系统弹"应用崩溃",进程退出 |
| **Android 14+ 后台过久** | 后台多个小时无 foreground service | 系统主动清理 |
| **厂商电池优化** | 国内手机激进策略 | App 在后台无前台 service 时被杀 |

**LMK(Low Memory Killer)**:Android 自己的内存管理。系统给每个进程一个 `oom_score`,内存紧张时**按 oom_score 从高到低杀进程**。

```bash
# 查看进程的 oom_score(数字越大越容易被杀)
adb shell cat /proc/<pid>/oom_score
```

进程"重要性"由 AMS 算法决定:
- 当前前台 Activity 的进程:最低 oom_score(几乎不杀)
- 可见 Activity 的进程(被另一个 Activity 部分遮挡):次低
- 有 Foreground Service 的进程:较低
- 后台 Activity 的进程:中等
- 空进程(没活跃组件):最高(最先被杀)

这就是为什么 **Foreground Service 是 Android 上"防止被杀"的唯一可靠方案**——它把进程提到"可见"级别。

---

## 十、Application 类何时被反复创建

Application 实例与进程同生命周期:

- App 第一次启动 → 创建 Application
- 用户切走 App,Application 还在(进程还在)
- 系统因内存压力杀进程 → Application 销毁
- 用户再回来 → **创建新进程 + 新 Application** + AMS 帮你恢复 Activity 栈(SavedState)
- 多进程 App → 每个进程一份 Application

**心智**:**Application.onCreate 可能跑很多次**(每次进程重启)。不要假设"只跑一次"。把昂贵初始化做幂等。

---

## 十一、`isMainProcess` 判断

多进程下,经常要"仅在主进程做初始化":

```kotlin
class NotedXApp : Application() {
    override fun onCreate() {
        super.onCreate()
        if (isMainProcess()) {
            Hilt.init(this)
            Analytics.init(this)
        }
        // 所有进程都做的事:Crashlytics
        Crashlytics.init(this)
    }
}

private fun Application.isMainProcess(): Boolean {
    val pid = Process.myPid()
    val am = getSystemService(ActivityManager::class.java)
    val processName = am.runningAppProcesses?.find { it.pid == pid }?.processName
    return processName == packageName
}
```

API 28+ 更简洁:

```kotlin
private fun isMainProcess(): Boolean = Application.getProcessName() == packageName
```

---

## 十二、`Context`:几种来源不同

| 来源 | 类型 | 寿命 | 用途 |
| --- | --- | --- | --- |
| `Activity` | ActivityContext | Activity 寿命 | UI、对话框、获取 Theme |
| `Service` | ServiceContext | Service 寿命 | 后台任务 |
| `Application` | ApplicationContext | 进程寿命 | 全局缓存、Hilt singleton 注入 |
| `ContentProvider.getContext()` | Application(实际) | 进程寿命 | 几乎只用作内部访问 |
| `BroadcastReceiver.onReceive(ctx)` | ReceiverContext | 仅 onReceive 范围 | 短暂 |

**心智**:**长期持有 Context 一定要用 ApplicationContext**——持有 Activity Context 会泄漏 Activity(Activity 关了但被你的对象持有,无法 GC)。

```kotlin
// ❌ 泄漏 Activity
class MySingleton(private val context: Context)
MySingleton(activity)

// ✅
class MySingleton(private val context: Context) {
    // 内部用 application context
}
MySingleton(activity.applicationContext)
```

或者用 Hilt 注入 `@ApplicationContext Context`(12 篇 / 现代版)。

---

## 十三、`/data/data/<package>/` 结构

App 的私有数据目录:

```
/data/data/com.notedx/
├── files/                # Context.filesDir,持久文件
├── cache/                # Context.cacheDir,系统紧张时可能清掉
├── databases/            # SQLite / Room 数据库
├── shared_prefs/         # SharedPreferences XML
├── code_cache/           # Context.codeCacheDir,DEX 解压缓存
└── no_backup/            # 不参与自动备份的文件
```

**外部存储**(API 29+ 分区存储模式):

```
/storage/emulated/0/Android/data/com.notedx/files/     # Context.getExternalFilesDir(null)
```

**应用私有 vs 用户可见**:私有目录用户在文件管理器看不到;外部目录用户能看到。**不太敏感的下载文件(图片缓存、字幕)放外部,数据库 / 用户凭证放内部**。

---

## 十四、`adb shell` 实操

```bash
# 启动 App
adb shell am start -n com.notedx/.MainActivity

# 杀进程
adb shell am force-stop com.notedx
adb shell am kill com.notedx                     # 比 force-stop 轻,仅杀进程不禁组件

# 列出活的进程
adb shell ps -A | grep notedx

# 查内存用量
adb shell dumpsys meminfo com.notedx

# 查 Activity 栈
adb shell dumpsys activity activities | grep -A 5 notedx

# 模拟内存紧张
adb shell am send-trim-memory com.notedx COMPLETE

# 看 oom_score
adb shell cat /proc/$(adb shell pidof com.notedx)/oom_score
```

这套命令是排查"App 为什么被杀 / 启动慢 / 后台行为异常"的标配。22 篇会展开。

---

## 十五、踩坑

**坑 1:把 `Application` 当全局变量容器**。`object Singleton { var user: User? = null }` 这种代码——进程被杀重启,内存清空,但你的代码以为还有。**任何"必须保留"的状态都要持久化(SharedPreferences / Room / DataStore)**。

**坑 2:`onTerminate()` 写清理逻辑**。这方法**几乎从不被调用**——系统杀 App 是 SIGKILL,没机会执行 onTerminate。所以不要把"清理资源"写在这里。

**坑 3:多进程 Application 跑 N 次,初始化重复**。Hilt 在每个进程独立初始化,但你自己的 `Analytics.init` 可能在每个进程都跑——`isMainProcess()` 守护。

**坑 4:Activity 静态字段持有 Context**。
```kotlin
companion object { lateinit var instance: MainActivity }
```
这是经典 Activity 泄漏写法——Activity 销毁后引用还在,GC 不掉。**永远不要 static 持有 Activity**。

**坑 5:认为 `force-stop` 后 BroadcastReceiver 还能收**。被 force-stop 的 App,所有 Receiver / Service 都被禁,直到用户主动启动 App 才解禁。`PACKAGE_REPLACED` / 自动启动等"系统广播"也收不到。

**坑 6:多进程下 Singleton 不共享**。`object Repository` 在每个进程独立一份,改了 A 进程的不影响 B 进程。要跨进程必须 ContentProvider / AIDL / 数据库。

**坑 7:`Process.killProcess(Process.myPid())` 主动自杀**。这是反模式——杀完进程,AMS 不知道是异常还是正常,可能不重启,可能不响应组件。**唯一合法用法**:监控到自身严重错误的兜底("应用崩溃了请重启")。

**坑 8:用 `Application` 当 ViewModel**。把业务状态塞 Application,等于全局可变状态——多 Activity 之间没有边界,改起来牵一发动全身。**业务状态用 ViewModel,Application 只放进程级初始化**。

**坑 9:`Context.startActivity` 在 Application Context 里调失败**。`startActivity` 默认要求 Activity Context;用 Application Context 调必须加 `Intent.FLAG_ACTIVITY_NEW_TASK`,否则 IllegalStateException。

**坑 10:`onLowMemory()` 释放数据库连接**。`onLowMemory` 在系统紧张时调用,但 Room / SQLite 自己已经管连接池——你强行释放反而出问题。**90% 项目不需要重写 onLowMemory**,Coil 这种图片库自己管。

---

下一篇 `04-Binder Android IPC 的物理根.md`,把 Android 进程间通信的核心机制讲透:为什么不是普通 socket / pipe,Binder driver 在内核怎么工作,`IBinder` / `Parcel` / `AIDL` 全套用法,以及 system_server 与 App 进程之间天天发生的几千次 Binder 调用。
