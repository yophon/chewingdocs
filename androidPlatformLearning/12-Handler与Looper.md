# Handler / Looper / MessageQueue / Choreographer

> 一句话:**Android 主线程是一个 `Looper.loop()` 死循环——它从 `MessageQueue` 取消息派发给 `Handler` 处理,UI 绘制通过 `Choreographer` 与屏幕 VSync 对齐**。所有 Android 异步代码(包括协程、Compose 重组)最终都挂在这套机制上。

---

## 一、Android 主线程不是普通线程

```java
// ActivityThread.main
public static void main(String[] args) {
    Looper.prepareMainLooper();      // 给主线程准备一个 Looper
    ActivityThread thread = new ActivityThread();
    thread.attach(false);
    Looper.loop();                   // 主线程进入消息循环,永不返回
}
```

**主线程永远在 `Looper.loop()` 里循环**——你 App 的每一行 UI 代码,都是被 Looper 从 MessageQueue 取出一个 Message,派发到 Handler,在 Handler 里跑你的代码。

这意味着:

- **主线程不是"空闲就停"——它在循环,但循环里大部分时候 `MessageQueue.next()` 阻塞**(epoll_wait)
- **UI 事件、Activity 生命周期回调、动画帧、setText、findViewById,全部是 Message**
- **主线程的所有工作都串行执行**——一个 Message 没处理完,下一个等着

---

## 二、Looper / MessageQueue / Handler / Message 四件事

```
┌─────────────────┐
│   Handler       │  把 Message post 到 Looper 的 Queue;并在 Looper 派发时执行 handleMessage
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   MessageQueue  │  线程内单实例,FIFO + 按时间排序的消息队列
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│     Looper      │  循环 next() → dispatchMessage(),贯穿线程一生
└─────────────────┘
```

- **Looper**——线程的循环器。每个线程**最多一个** Looper(`prepare` 创建,`loop` 启动)。主线程的 Looper 由系统创建。
- **MessageQueue**——Looper 内部的队列。Message 按时间排序(`when`),到时间才取出。
- **Handler**——发送 Message 的客户端 + 处理 Message 的回调。Handler 必须绑定一个 Looper(默认绑定创建它的线程的 Looper)。
- **Message**——一个消息,包含 `what`(类型)、`obj`(数据)、`when`(目标时间)、`target`(目标 Handler)。

---

## 三、Handler 的用法

```kotlin
// 主线程上的 Handler(最常用)
val mainHandler = Handler(Looper.getMainLooper())

// 子线程上的 Handler
val thread = HandlerThread("worker").apply { start() }
val workerHandler = Handler(thread.looper)

// 发送消息
mainHandler.post { /* Runnable */ }                  // 立即派发
mainHandler.postDelayed({ /* ... */ }, 1000)         // 1 秒后
mainHandler.sendMessage(Message.obtain().apply {
    what = MSG_REFRESH
    obj = "data"
})

// 处理消息
val handler = object : Handler(Looper.getMainLooper()) {
    override fun handleMessage(msg: Message) {
        when (msg.what) {
            MSG_REFRESH -> handleRefresh(msg.obj as String)
        }
    }
}
```

**`Handler` 创建时绑定 Looper**——后续 `post` / `sendMessage` 都发到这个 Looper 的 MessageQueue。

**`Message.obtain()` 用对象池**——避免反复 new。Message 跑完后通过 `recycle()` 自动回池。

---

## 四、`Handler.post(runnable)` 实际上发生了什么

```kotlin
mainHandler.post { Log.d("X", "hello") }
```

内部:

```java
public final boolean post(Runnable r) {
    return sendMessageDelayed(getPostMessage(r), 0);
}

private static Message getPostMessage(Runnable r) {
    Message m = Message.obtain();
    m.callback = r;            // ← 把 Runnable 装进 Message
    return m;
}
```

**`Runnable` 被包装为 Message**,放进 MessageQueue。Looper 取出时:

```java
public void dispatchMessage(Message msg) {
    if (msg.callback != null) {
        msg.callback.run();              // ← Runnable.run() 直接调用
    } else {
        handleMessage(msg);
    }
}
```

所以 `Handler.post { ... }` ≈ "把这个 lambda 排队到目标 Looper 执行"。

---

## 五、`HandlerThread`:有 Looper 的工作线程

```kotlin
val thread = HandlerThread("bg-worker")
thread.start()
val handler = Handler(thread.looper)

handler.post {
    // 在 bg-worker 线程跑
    val data = blockingNetworkCall()
    mainHandler.post {
        // 切回主线程
        updateUi(data)
    }
}

// 退出
thread.quitSafely()    // 处理完队列里的剩余消息再退出
```

**`HandlerThread` 是"带 Looper 的子线程"**——你可以往里 post 任务,所有任务在这个线程串行执行。

**用例**:

- 数据库写线程(串行避免并发问题)
- 文件 IO 队列
- 网络请求 worker(协程之前的写法)

**现代代替**:协程 + `Dispatchers.IO.limitedParallelism(1)`,或者 `Executors.newSingleThreadExecutor()`。

---

## 六、Looper 死锁与 ANR

```kotlin
mainHandler.post {
    val latch = CountDownLatch(1)
    mainHandler.post { latch.countDown() }    // ❌ 这个 post 在外层完成前不会被处理
    latch.await()                              // 永远阻塞 → ANR
}
```

**主线程 Looper 是串行的**——当前 Message 没跑完,后续 Message 不会被取。你 post 一个 Runnable 又同步等它,死锁。

**反模式**:`runOnUiThread { ... } .await()` / `Handler.post + synchronized + wait`——主线程上的同步等待几乎都错。

---

## 七、`Handler` 与 Activity 内存泄漏

```kotlin
class MainActivity : ComponentActivity() {
    private val handler = Handler(Looper.getMainLooper()) { msg ->
        // 隐式持有 Activity 引用!
        updateUi(msg.obj)
        true
    }

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        handler.postDelayed({ /* ... */ }, TimeUnit.MINUTES.toMillis(10))
        // Activity 销毁,但 Handler 仍在 MessageQueue 里,Activity 也跟着泄漏 10 分钟
    }
}
```

**经典 Handler 泄漏**——非静态匿名内部类持有外部 Activity,Message 在 MessageQueue 里 → Handler 没法 GC → Activity 没法 GC。

**修法**:

- `onDestroy` 调 `handler.removeCallbacksAndMessages(null)` 清空所有未处理消息
- 用 lifecycleScope.launch + delay 替代,生命周期自动管
- 静态 Handler + WeakReference 持有 Activity(老写法,丑)

**现代答案**:**完全不要在 Activity 里直接用 Handler**。用协程 + lifecycleScope.

---

## 八、`Choreographer`:与屏幕 VSync 对齐

```kotlin
Choreographer.getInstance().postFrameCallback { frameTimeNanos ->
    // 在下一个 VSync 时执行
}
```

**Choreographer** 是 Android 与显示子系统的桥——屏幕每 16.6ms(60Hz)/ 11.1ms(90Hz)/ 8.3ms(120Hz)一次 VSync,Choreographer 监听 VSync 信号,然后驱动:

1. **Input** 阶段——把待处理的触摸事件派发到 View
2. **Animation** 阶段——更新动画状态
3. **Traversal** 阶段——View measure / layout / draw

每一帧大约这样:

```
VSync 信号到达
   ↓
Choreographer.doFrame(frameTimeNanos)
   ↓
1. Input 回调
2. Animation 回调(ValueAnimator / Compose 动画)
3. Traversal 回调(ViewRootImpl.performTraversals)
   ↓
View 树 measure / layout / draw
   ↓
绘制完成,Surface 提交给 SurfaceFlinger
   ↓
SurfaceFlinger 合成,屏幕显示
```

**16.6ms 内必须完成**——超过就**丢帧**。Profile 里看到的"jank"就是某帧超时。

**Compose 在哪里**?Compose 的"重组"在 Animation 回调阶段触发,然后通过 Layout 协议参与 Traversal——所以 Compose 重组的"60 fps 目标"是和这套机制对齐的。

---

## 九、Looper 与 Binder 调用

主线程一个 Looper,Binder 线程池是**另一组线程**(默认 16 个)。

**App 收到 Binder 请求(被别的 App / 系统 调)** → Binder 线程跑你的代码。
**App 主动调 Binder(`startActivity` / `getSystemService`)** → 主线程上调用,**同步等回应**。

**结论**:**主线程上调 Binder 是阻塞**。`PackageManager.queryIntentActivities`、`WindowManager.getDefaultDisplay` 在主线程同步等 system_server 返回——慢的时候直接拖丢帧。

---

## 十、`MessageQueue.IdleHandler`:主线程空闲回调

```kotlin
Looper.myQueue().addIdleHandler {
    // 主线程没事干时跑
    doLowPriorityWork()
    false      // false = 跑完移除,true = 保留持续触发
}
```

**`IdleHandler` 在 MessageQueue 没有可执行消息时被调用**——典型用例:

- **启动优化**——一些次要初始化(预加载缓存、上报埋点)推到 IdleHandler,不阻塞首屏
- **延迟工作**——比 `postDelayed(0)` 更晚,但比"明显延迟"更及时

**注意**:IdleHandler 仍跑在主线程,超时仍 ANR。**放轻量任务**。

---

## 十一、协程与 Looper 的关系

```kotlin
viewModelScope.launch(Dispatchers.Main) {
    val data = withContext(Dispatchers.IO) {
        repository.load()
    }
    ui.update(data)
}
```

底层:

- `Dispatchers.Main` 内部是 **Handler-based**——`HandlerDispatcher` 把协程恢复点包装为 `Handler.post`
- `Dispatchers.IO` 用线程池
- 协程在 IO 线程暂停 → 完成 → 通过 `mainHandler.post` 回到主线程恢复

**协程不绕开 Looper,它构建在 Looper 之上**。

`Dispatchers.Main.immediate` 是个优化:如果**已经在主线程**,不再走 `Handler.post`,直接同步执行——避免无谓的一次消息派发。

---

## 十二、`Looper.loop()` 内部

简化版:

```java
public static void loop() {
    final MessageQueue queue = me.mQueue;
    for (;;) {
        Message msg = queue.next();          // 阻塞拿下一条
        if (msg == null) return;             // Looper 已 quit
        msg.target.dispatchMessage(msg);
        msg.recycleUnchecked();              // 回收到对象池
    }
}
```

**`queue.next()` 内部用 epoll**——没消息时阻塞,有消息或 timeout 时唤醒。这是 Android 主线程"看似永远在跑,实际大部分时间在睡"的原理。

---

## 十三、`postAtFrontOfQueue`:插队

```kotlin
mainHandler.postAtFrontOfQueue { /* 紧急任务 */ }
```

把 Message 放到队列**最前面**——下一帧立即处理。**慎用**——破坏 FIFO 公平性,只在系统级紧急场景(如 Activity 切换中的内部协调)使用。

---

## 十四、Async Message

`Message.setAsynchronous(true)` 让 Message 不被"同步屏障"(sync barrier)阻塞。**`Choreographer` 内部用这个 API 让 VSync 帧能优先处理**——避免普通 Message 阻塞动画。

`Handler.createAsync(Looper)` API 28+ 提供的工厂——你自己很少需要,但理解它存在能解释"为什么主线程偶尔有 `postDelayed(0)` 还是被某个高优先级消息插队"。

---

## 十五、自定义事件循环线程

```kotlin
class WorkerThread : Thread() {
    lateinit var handler: Handler
    
    override fun run() {
        Looper.prepare()
        handler = Handler(Looper.myLooper()!!) { msg ->
            // 处理消息
            true
        }
        Looper.loop()
    }
}

val thread = WorkerThread().apply { start() }
// 等 handler 初始化完成才能用
```

**实际上别这么做**——直接用 `HandlerThread` 类,内置 Looper 初始化、退出方法。

---

## 十六、Compose 重组与 Looper

```kotlin
val state = mutableStateOf(0)
// 在协程里改 state
viewModelScope.launch {
    state.value = 1     // 触发 Compose 重组
}
```

Compose 重组的派发链:

```
mutableStateOf.value = X
   ↓
Snapshot 系统标记"X 被修改"
   ↓
通知所有读 X 的 Composable 重组
   ↓
Compose Recomposer 把重组工作通过 Choreographer.postFrameCallback 调度
   ↓
下一帧 Choreographer 触发 Recomposer
   ↓
Recomposer 在主线程重新跑相关 Composable
   ↓
生成新 LayoutNode 树
   ↓
Compose UI 完成 measure / layout / draw
```

**结论**:Compose 不是"魔法",它是 **Looper + Choreographer + Snapshot 系统** 上层的库。Compose 重组的实际执行时机由 Choreographer 决定。

---

## 十七、调试

```bash
# 看主线程当前在干嘛(thread dump)
adb shell ps -A -T | grep notedx              # 找主线程 TID
adb shell debuggerd -b <pid>                    # 抓 stack(release 包不行,debuggable 可)

# 看每帧耗时
adb shell setprop debug.choreographer.skipwarning 1
# 然后 logcat 会打 "Skipped X frames!" 警告

# 系统跟踪(看 Choreographer 帧)
adb shell perfetto -o /sdcard/trace.pftrace -t 10s -c - <<EOF
buffers: { size_kb: 65536 }
data_sources: { config { name: "linux.ftrace" ftrace_config { ftrace_events: "sched/sched_switch" } } }
EOF
```

22 篇会专门讲 Profiler / Systrace / Perfetto。

---

## 十八、踩坑

**坑 1:`Handler.post` 在主线程做阻塞工作**。post 到主线程的 Runnable 仍然在主线程跑——里面 sleep / IO 一样 ANR。

**坑 2:Handler 持有 Activity → 泄漏**。非 static 内部 Handler 隐式持有外部类。**Compose 项目用 lifecycleScope 不写 Handler 是最干净的**。

**坑 3:`Looper.prepare` 调两次**。每个线程最多一个 Looper,二次 prepare 抛 RuntimeException。

**坑 4:子线程不 prepare 就用 Handler**。`Handler()`(无参,看具体重载)内部默认 `Looper.myLooper()`——子线程没 prepare 就拿到 null,抛异常。

**坑 5:`postDelayed` 漏 `removeCallbacks`**。注册了延迟任务,Activity 销毁后任务还在 queue 里,跑起来引用旧对象崩溃。

**坑 6:在 Binder 线程调用 Handler 不指定 Looper**。Binder 线程没 Looper,默认 Handler 报错。**指定 `Handler(Looper.getMainLooper())`**。

**坑 7:`Looper.quitSafely` vs `quit`**。`quit` 立即停,队列里没跑的 Message 丢失;`quitSafely` 处理完已入队的再停。**默认 quitSafely**。

**坑 8:Choreographer.doFrame 慢导致丢帧**。某帧某个 Composable 测量 5ms、绘制 8ms、再加输入 3ms = 16ms 边缘,稍有压力就丢。**Profile 看每个阶段时间**。

**坑 9:`runOnUiThread` 重复**。`runOnUiThread { runOnUiThread { ... } }` 在已经主线程里嵌套调用,内层立即执行(看源码,前面讲过)——不是 bug 但 confusing。

**坑 10:主线程 Looper 上调 `MessageQueue.next` 同步等子线程**。任何"主线程同步等子线程"的写法都是 ANR 隐患。让子线程结果通过 Handler.post 回主线程,主线程从不阻塞等。

---

下一篇 `13-ANR 卡顿与 Java 时代异步演化.md`,讲 Android 主线程"娇贵"的代价——5 秒 ANR 阈值、卡顿来源(主线程阻塞 / Binder 慢 / GC 暂停)、`AsyncTask` / `Loader` / RxJava / 协程的演化史:为什么前三者死了,协程为什么活下来。
