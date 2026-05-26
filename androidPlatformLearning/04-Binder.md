# Binder:Android IPC 的物理根

> 一句话:**Binder 是 Android 独有的进程间通信机制——你调用 `notificationManager.notify(...)` 这一行,实际跨了进程跑到 system_server。整个 Android Framework 是由几百个 Binder 接口编织起来的**。

---

## 一、为什么 Android 要自己造一个 IPC

Linux 已经有一堆 IPC:pipe / socket / shared memory / signal / System V IPC。**Android 为什么不直接用,而要造 Binder?**

三个理由:

1. **性能**——Binder 是 **一次内存拷贝**(发送进程 → 内核 → 接收进程)。socket / pipe 是两次拷贝。在每秒几千次 IPC 的场景下差距明显。
2. **身份验证**——Binder 自带"调用方 UID/PID",接收方能直接知道是谁在调,不用自己实现身份信息传输。
3. **面向对象**——Binder 把"远程方法调用"包装得像"调本地对象"。你拿到一个 `INotificationManager` 接口,调它的方法,跨进程对你透明。

第三点是 Binder 的核心 API 红利——所有 Android 系统服务、所有 `Manager` 类、所有 ContentProvider,**底下都是 Binder**。

---

## 二、Binder 的物理结构

```
┌──────────────────────────┐         ┌──────────────────────────┐
│   App 进程 (UID 10142)    │         │   system_server 进程     │
│                          │         │                          │
│  notificationManager     │         │  NotificationManager-     │
│  .notify(id, n)          │         │  Service (实际实现)        │
│       │                  │         │       ▲                  │
│       ▼                  │         │       │                  │
│  Stub.Proxy(代理对象)     │         │  Stub(服务端骨架)         │
│       │                  │         │       │                  │
└───────┼──────────────────┘         └───────┼──────────────────┘
        │ writeInterfaceToken                │
        │ writeInt(id)                        │
        │ writeParcelable(n)                  │
        │ transact()                          │
        ▼                                    ▲
   ┌─────────────────────────────────────────┐
   │      Binder Driver(Linux 内核模块)      │
   │      /dev/binder                         │
   │      负责跨进程拷贝 Parcel               │
   └─────────────────────────────────────────┘
```

**关键认识**:

1. **`Binder Driver` 在 Linux 内核**——`/dev/binder` 这个设备节点,App 通过 `ioctl()` 与它交互。
2. **每个进程有一个 Binder 线程池**——默认 16 个线程,接收别人发来的请求。
3. **跨进程的数据用 `Parcel` 容器**——所有参数必须能序列化进 Parcel(基础类型 / `Parcelable` / `Binder` 句柄)。
4. **客户端拿到的是代理对象**——`Stub.Proxy`,内部把方法调用打成 Parcel,通过 driver 发到服务端。

---

## 三、`IBinder` / `Stub` / `Proxy`

`IBinder` 是 Binder 对象的核心接口:

```java
public interface IBinder {
    boolean transact(int code, Parcel data, Parcel reply, int flags);
    // ...
}
```

`transact(code, data, reply, flags)` 是跨进程调用的统一入口——`code` 是方法编号,`data` 是参数包,`reply` 是结果包。

**AIDL 编译器**(`aidl` 命令)把接口描述生成两个类:

- **Stub**(服务端骨架)——服务端继承它,实现具体方法
- **Stub.Proxy**(客户端代理)——客户端拿到的对象,内部把方法调用转 transact

例子,AIDL 文件:

```aidl
// INoteService.aidl
interface INoteService {
    void save(in Note note);
    Note getById(long id);
}
```

`aidl` 编译生成 `INoteService.java`,里面有:

```java
public interface INoteService extends IInterface {
    void save(Note note) throws RemoteException;
    Note getById(long id) throws RemoteException;

    abstract static class Stub extends Binder implements INoteService {
        // 服务端继承这个,override save() / getById()
        public boolean onTransact(int code, Parcel data, Parcel reply, int flags) {
            switch (code) {
                case TRANSACTION_save:
                    Note note = data.readParcelable(...);
                    this.save(note);
                    return true;
                case TRANSACTION_getById:
                    long id = data.readLong();
                    Note result = this.getById(id);
                    reply.writeParcelable(result, 0);
                    return true;
            }
        }
        
        static class Proxy implements INoteService {
            // 客户端拿到的实现,内部走 transact
            public void save(Note note) throws RemoteException {
                Parcel data = Parcel.obtain();
                Parcel reply = Parcel.obtain();
                data.writeInterfaceToken(DESCRIPTOR);
                data.writeParcelable(note, 0);
                mRemote.transact(TRANSACTION_save, data, reply, 0);
                reply.recycle();
                data.recycle();
            }
        }
    }
}
```

**Stub.Proxy.save() 把参数打包成 Parcel,通过 mRemote.transact() 进内核,内核把 Parcel 拷贝到服务端进程,Stub.onTransact() 解包后调用真正的 save 实现**。这就是 Binder 完整的 RPC 流程。

---

## 四、`Parcel`:Binder 的数据容器

`Parcel` 是序列化容器,跟 Java `Serializable` 类似但**专为 Binder 设计,极快**:

```java
Parcel p = Parcel.obtain();
p.writeInt(42);
p.writeString("hello");
p.writeParcelable(myObject, 0);
// 发送给另一端

// 接收端
int i = p.readInt();
String s = p.readString();
MyObject obj = p.readParcelable(MyObject.class.getClassLoader());
p.recycle();
```

**关键约束**:

1. **必须按写入顺序读取**——Parcel 内部是个顺序流,乱序读出来是垃圾。
2. **只能装基础类型 / `Parcelable` / `IBinder` 句柄 / 文件描述符**——不能直接装 Java 任意对象。
3. **Parcel 的对象不应序列化到磁盘**——格式可能跨版本变,持久化用 `Serializable` 或 JSON。

**`Parcelable` 接口**:让你的类能写入 Parcel:

```kotlin
@Parcelize
data class Note(val id: Long, val title: String, val content: String) : Parcelable
```

`@Parcelize` 来自 `kotlin-parcelize` 插件,**自动生成 `writeToParcel` / `Creator`**——Kotlin 项目永远用它,不要手写 Parcelable。

---

## 五、`ServiceManager`:Binder 服务的命名注册

App 怎么找到 system_server 里某个服务?**ServiceManager**——所有 Binder 服务都在它那里注册名字:

```
ServiceManager(本身也是一个 Binder)
├── "activity"       → ActivityManagerService(AMS)
├── "package"        → PackageManagerService(PMS)
├── "window"         → WindowManagerService(WMS)
├── "notification"   → NotificationManagerService
├── "power"          → PowerManagerService
├── "input"          → InputManagerService
├── "battery"        → BatteryService
└── ...几十个
```

App 拿系统服务的标准流程:

```java
IBinder b = ServiceManager.getService("notification");
INotificationManager nm = INotificationManager.Stub.asInterface(b);
nm.enqueueNotification(...);
```

但**业务代码不直接用 `ServiceManager`**——SDK 包装了 Manager 类:

```kotlin
val nm = ctx.getSystemService(NotificationManager::class.java)
nm.notify(id, notification)
```

`getSystemService` 内部就是上面的 `ServiceManager.getService` + `Stub.asInterface`。

---

## 六、`bindService` 与 AIDL:做自己的 Binder 服务

App 之间(或 App 与自己的多进程之间)做 IPC 用 `bindService`:

**服务端**(独立进程的 Service):

```kotlin
class NoteService : Service() {
    private val binder = object : INoteService.Stub() {
        override fun save(note: Note) { /* ... */ }
        override fun getById(id: Long): Note? { /* ... */ }
    }
    override fun onBind(intent: Intent): IBinder = binder
}
```

manifest:

```xml
<service android:name=".NoteService" android:exported="true" android:process=":notes" />
```

**客户端**:

```kotlin
val connection = object : ServiceConnection {
    override fun onServiceConnected(name: ComponentName, binder: IBinder) {
        val service = INoteService.Stub.asInterface(binder)
        service.save(...)
    }
    override fun onServiceDisconnected(name: ComponentName) { }
}

ctx.bindService(
    Intent(ctx, NoteService::class.java),
    connection,
    Context.BIND_AUTO_CREATE
)
```

**这是 Android 上正经做 IPC 的标准模式**。WhatsApp 多进程、华为 Push SDK、各种 SDK 服务化通信都用这个。

---

## 七、`Messenger`:简化版 IPC

如果不需要双向方法调用,只需要"发消息"——用 **`Messenger`** 替代 AIDL:

```kotlin
// 服务端
class HelloService : Service() {
    private val handler = Handler(Looper.getMainLooper()) { msg ->
        // 处理消息
        true
    }
    private val messenger = Messenger(handler)
    override fun onBind(intent: Intent): IBinder = messenger.binder
}

// 客户端
val messenger = Messenger(binder)
val msg = Message.obtain(null, MSG_HELLO).apply {
    data = bundleOf("text" to "hi")
}
messenger.send(msg)
```

**Messenger 内部就是用一个 Binder + Handler 处理消息队列**——比 AIDL 简单,但只能单向发消息,做不了"调函数取返回值"。

---

## 八、ContentProvider:Binder 的数据查询封装

ContentProvider 是 Binder 的"数据查询接口"包装——把 SQL CRUD 用 URI + cursor 跨进程暴露。11 篇展开。

```kotlin
val cursor = ctx.contentResolver.query(
    Uri.parse("content://com.android.contacts/contacts"),
    arrayOf("display_name"), null, null, null
)
```

这一行调用,**底层走 Binder 跨进程到 Contacts App**——Binder driver 把 query 参数打包传过去,Cursor 通过共享内存返回。

---

## 九、`oneway` 调用

默认 Binder 调用是**同步阻塞**——客户端等服务端处理完返回。`oneway` 让调用变异步:

```aidl
interface ILogger {
    oneway void log(String msg);
}
```

`oneway` 方法不能有返回值,客户端不等服务端,直接返回。**用途**:推送、日志、事件通知——不需要等结果的场景。

---

## 十、`linkToDeath`:监听对端进程死亡

```kotlin
val deathRecipient = IBinder.DeathRecipient {
    Log.w("App", "Remote service died")
    // 清理 / 重连
}
binder.linkToDeath(deathRecipient, 0)
```

跨进程持有的 Binder 引用,**对端进程被杀**时本端通过 `DeathRecipient` 收到通知。这是 system_server 监控 App 进程死亡的机制——App 死了,AMS 自动清理它持有的所有 Binder 引用。

---

## 十一、`/dev/binder` 内部

```
App 进程                    Binder Driver(内核)              system_server
   │                              │                                │
   │  ioctl(fd, BINDER_WRITE_READ,│                                │
   │         &write_data)          │                                │
   │ ───────────────────────────► │                                │
   │                              │ 把 Parcel 拷贝到接收方         │
   │                              │ ───────────────────────────► │
   │                              │                                │ Stub.onTransact()
   │                              │                                │   ↓
   │                              │                                │ 处理...
   │                              │ ◄─────────────────────────── │ ioctl 写回结果
   │ ◄─────────────────────────── │                                │
   │  ioctl 唤醒                  │                                │
```

**Binder 优于 socket 的关键**:

- **一次拷贝**——Binder driver 通过 `mmap` 在内核与接收方之间共享内存,Parcel 只在"发送方 → 内核"拷贝一次
- **轻量唤醒**——内核可以精准唤醒接收方进程的某个 Binder 线程,无需轮询
- **内置鉴权**——driver 知道调用方的真实 UID/PID(`Binder.getCallingUid()` / `getCallingPid()`)

`Binder.getCallingUid()` 是系统服务的"防伪"标准 API——服务端用它判断"是哪个 App 在调我",决定是否允许。

---

## 十二、Binder 容量限制

每个 Binder 事务的 Parcel **最大 1MB**(整个 App 进程共享,不是每次 1MB)。超过会抛 `TransactionTooLargeException`。

**常见踩坑**:

- `startActivity(intent)` 传一个大 `Parcelable` extra(比如整张 Bitmap)→ `TransactionTooLargeException`
- `Bundle` 里塞了一个大 List(几千个对象)
- `Intent.EXTRA_STREAM` 传 Bitmap 直接 byte 数组而不是 URI

**修法**:大对象用 URI / 数据库 / 文件传递,Binder 只传"引用"(ID / 路径)。

---

## 十三、Service Connection 的生命周期

```kotlin
class MyActivity : ComponentActivity() {
    private lateinit var service: INoteService
    
    private val conn = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName, binder: IBinder) {
            service = INoteService.Stub.asInterface(binder)
        }
        override fun onServiceDisconnected(name: ComponentName) {
            // 服务端进程意外死亡
        }
        override fun onBindingDied(name: ComponentName) {
            // Binding 被系统永久断开,需要重新 bind
        }
    }

    override fun onStart() {
        super.onStart()
        bindService(Intent(this, NoteService::class.java), conn, BIND_AUTO_CREATE)
    }

    override fun onStop() {
        super.onStop()
        unbindService(conn)         // 必须解绑!否则泄漏
    }
}
```

**铁律**:`bindService` 必须配对 `unbindService`。漏掉 unbind 会泄漏——Binding 持有 ServiceConnection,ServiceConnection 持有 Activity。

---

## 十四、`AIDL` 与 `oneway` 与线程

服务端 `Stub.onTransact()` **跑在 Binder 线程池**(不是主线程)——多个客户端并发调用时,Binder 线程池里多个线程并发跑你的 `onTransact()`。

**结论**:**Binder 服务端的实现必须线程安全**。如果业务逻辑必须主线程跑,用 Handler 派发:

```kotlin
private val binder = object : INoteService.Stub() {
    override fun save(note: Note) {
        mainHandler.post { actualSave(note) }       // 切到主线程
    }
}
```

或者用协程 + Dispatcher。

---

## 十五、调试 Binder

```bash
# 查看进程的 Binder 线程数 / 待处理事务
adb shell cat /sys/kernel/debug/binder/proc/<pid>

# 查看所有 Binder 事务统计
adb shell dumpsys binder

# 看进程持有的 Binder 引用数(检测泄漏)
adb shell dumpsys meminfo com.notedx | grep -A 5 "Other Objects"
```

**Binder 泄漏**:你 App 持有了大量远程 Binder 但忘了释放,system_server 那边对应对象也没法 GC——这是 system_server 内存涨的常见原因。

---

## 十六、为什么 Hilt / WorkManager 内部少不了 Binder

- **Hilt 的 `@HiltAndroidApp`**——Hilt 通过反射 / 注解处理生成代码,运行时本身不用 Binder
- **WorkManager**——内部用 ContentProvider 与 system_server 通信(JobScheduler 是系统服务,需要 Binder 调用)
- **`getSystemService`**——返回的所有 `Manager` 类都是 Binder 代理
- **Notification / Toast / startActivity**——全部跨进程到 system_server

读完本篇你应当能"画出"任何 SDK 调用的 Binder 路径——这是排查 ANR / 性能问题的基础(很多 ANR 是 Binder 调用阻塞导致)。

---

## 十七、踩坑

**坑 1:在主线程做大量 Binder 调用**。每次 Binder 都有几十微秒到几毫秒开销,1000 次主线程 Binder 就能丢帧。**`PackageManager.queryIntentActivities` / `WindowManager` 不要在主线程循环调用**。

**坑 2:Binder 调用阻塞死锁**。A 进程同步调 B 进程方法,B 进程的 Binder 线程又试图同步调 A 进程——A 的 Binder 线程都在等 B,B 又在等 A 的 Binder 线程,死锁。避免方法:`oneway` 或者拆同步调用。

**坑 3:`Parcel` 读写不对称**。写顺序 int, String, long,读必须 int, String, long。漏一个字段读出来全错。这是写 AIDL 自定义 Parcelable 时最常见错误。

**坑 4:大 Bundle 传 Intent extras**。`startActivity(intent.putExtra("data", largeBitmap))` 超过 1MB 抛 `TransactionTooLargeException`。**Bitmap 传 URI,大列表传 ID**。

**坑 5:`bindService` 没配对 `unbindService`**。Activity 销毁但 binding 还在,系统提示 "ServiceConnection leaked"。

**坑 6:多进程 Singleton "应该共享"**。每个进程一份内存,Singleton 不跨进程。要跨进程共享数据,用 ContentProvider / AIDL,或者数据库 / 文件。

**坑 7:`getCallingUid()` 没在 onTransact 里调,而在 onBind 后业务方法里调**。`Binder.getCallingUid()` 只在 Binder 调用栈内有效——`onBind()` 后的延迟回调里调,返回的可能是你自己 UID,鉴权失效。

**坑 8:服务端 Binder 实现非线程安全**。Binder 线程池并发调你的方法,内部用了非线程安全的 HashMap → 偶发崩溃。**同步原语必备**。

**坑 9:用 Binder 做高频小数据传输**。每秒几千次的 Binder 调用 → CPU 飙。这种场景用共享内存 / ashmem / Pipe 更合适。

**坑 10:跨进程对象引用泄漏**。客户端持有服务端 Binder 引用,服务端持有客户端 Binder 回调引用——双向引用 + 进程死亡监听不完整 → 内存涨。`linkToDeath` 必须配 `unlinkToDeath`。

---

下一篇 `05-系统服务架构.md`,展开 system_server 进程里跑的几十个服务:ActivityManagerService(AMS)如何编排 Activity 生命周期、WindowManagerService(WMS)如何管理窗口、PackageManagerService(PMS)的安装解析、InputManagerService 如何派发触摸事件,以及它们之间怎么协作。
