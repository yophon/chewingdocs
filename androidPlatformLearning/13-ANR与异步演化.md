# ANR、卡顿与 Java 时代异步演化

> 一句话:**Android 主线程超过 5 秒不响应就 ANR——这个简单约束逼出了过去 15 年 Android 异步编程的全部演化:`AsyncTask` 死了,`Loader` 死了,`Handler.post` 太脏,RxJava 太重,协程笑到最后**。

---

## 一、ANR:5 秒红线

**ANR**(Application Not Responding)——系统判定 App "卡死",弹窗让用户选"等等"或"关闭"。

**触发条件**:

| 组件 | ANR 阈值 |
| --- | --- |
| **Activity** 输入事件无响应 | **5 秒** |
| **BroadcastReceiver.onReceive** | **10 秒**(前台)/ 60 秒(后台) |
| **Service.onCreate / onStartCommand** | **20 秒**(前台)/ 200 秒(后台) |
| **ContentProvider** 操作 | 10 秒 |

**最常踩的是 Activity 输入事件 5 秒**——用户点了一下按钮,5 秒内主线程没把这个 Touch 事件处理完,直接 ANR。

---

## 二、ANR 的常见来源

主线程被堵 5 秒,可能因为:

1. **主线程做阻塞 IO**(网络、文件、数据库)——最经典
2. **主线程死锁**(`synchronized` + `wait`、跨线程 latch.await)
3. **主线程 CPU 密集**(图像处理、加解密、JSON 解析大对象)
4. **Binder 调用慢**——`PackageManager.queryIntentActivities` 在 system_server 紧张时几百毫秒
5. **GC 暂停**(大对象分配触发大型 STW)
6. **资源解码**——XML inflate、Bitmap decode、PNG 解压
7. **第三方 SDK 阻塞**(广告 SDK / 推送 SDK 同步 init)

---

## 三、`/data/anr/traces.txt`:ANR 现场

ANR 发生时,系统抓取所有线程的栈写到 `/data/anr/anr_<timestamp>.txt`(老版本是 `/data/anr/traces.txt`)。

```bash
adb shell ls /data/anr/
adb shell cat /data/anr/anr_2026-05-26-12-00-00-000
```

栈里关键看 **主线程**(name 通常是 `main` 或包名):

```
"main" prio=5 tid=1 Native
  at libc.read(Native method)
  at android.os.MessageQueue.nativePollOnce(Native method)
  at android.os.MessageQueue.next(MessageQueue.java:336)
  at android.os.Looper.loop(Looper.java:174)
  at android.app.ActivityThread.main(ActivityThread.java:7356)
```

如果主线程卡在 `nativePollOnce`——这是 Looper 空闲在等消息,**说明 ANR 不是因为主线程被堵**(可能是 InputDispatcher 派发不进来或者 Binder 阻塞)。

如果主线程卡在你自己的代码:

```
"main"
  at com.notedx.HomeActivity.processData(HomeActivity.kt:42)
  at android.view.View.performClick(...)
```

那就是你自己阻塞了——优化这段。

---

## 四、卡顿(Jank)与 ANR 的区别

| 维度 | Jank(卡顿) | ANR |
| --- | --- | --- |
| 时长 | 几十毫秒-几秒 | 5+ 秒 |
| 现象 | 帧丢失,动画顿挫 | 系统弹"应用无响应" |
| 用户感知 | 体验差 | 体验崩 |

**卡顿 → 累积 → ANR**——如果你每次都卡 2 秒不到 5 秒,用户感知是"超卡的 App",但不弹 ANR。这是更难发现的问题。

---

## 五、第一代异步:`Handler.post` + Thread

```kotlin
Thread {
    val data = blockingNetwork()
    handler.post { ui.update(data) }
}.start()
```

**第一代 Android 异步写法**:开线程做活,Handler post 回主线程。

**问题**:

- 每次新 Thread 浪费(应该用线程池)
- 取消困难——Thread 没有"标记取消"的优雅 API
- 错误处理散乱
- Activity 销毁后 Handler 还在 post,引用泄漏

但这是底层模式,后续所有 API 都是它的封装。

---

## 六、第二代:`AsyncTask`(2010-2017)

```kotlin
class LoadTask : AsyncTask<Void, Int, List<Note>>() {
    override fun doInBackground(vararg p: Void?): List<Note> {
        return repo.loadAll()       // 在子线程
    }
    override fun onPostExecute(result: List<Note>) {
        ui.update(result)            // 在主线程
    }
    override fun onProgressUpdate(vararg values: Int?) {
        // 主线程,通过 publishProgress() 触发
    }
}

LoadTask().execute()
```

**`AsyncTask` 把 Thread + Handler 封装成"三阶段"模板**——doInBackground 子线程,onPostExecute 主线程。

**致命问题**:

1. **持有 Activity 引用**——`AsyncTask` 是非 static 内部类,Activity 销毁后 AsyncTask 还在跑,引用泄漏
2. **取消困难**——`cancel()` 只设标志位,doInBackground 不自己检查就停不下
3. **错误处理糟糕**——异常没回调,doInBackground 抛异常等于静默失败
4. **默认串行执行**(API 11+ 默认 serial executor,多个 AsyncTask 排队跑,慢)
5. **不能多 listener**——`execute()` 后只有 `onPostExecute` 一个出口

**Android 11(API 30)正式 deprecated AsyncTask**。**新代码绝对不要用**,老代码迁移协程。

---

## 七、`Loader` / `CursorLoader`(2011-2018,已 deprecated)

`Loader` 是 Honeycomb 引入的"异步数据加载器",和 LoaderManager 配合:

```kotlin
loaderManager.initLoader(0, null, object : LoaderManager.LoaderCallbacks<Cursor> {
    override fun onCreateLoader(id: Int, args: Bundle?): Loader<Cursor> = CursorLoader(...)
    override fun onLoadFinished(loader: Loader<Cursor>, data: Cursor?) { /* 主线程 */ }
    override fun onLoaderReset(loader: Loader<Cursor>) { /* 释放 */ }
})
```

意图:解决 AsyncTask 与 Activity 生命周期不对齐的问题——Loader 跟 LoaderManager 走,屏幕旋转时 Loader 不重新加载。

**问题**:API 极复杂、跨进程 Cursor 难用、和 Architecture Components 不搭。

**API 28(Android 9)deprecated**——Google 推荐用 **ViewModel + LiveData + Repository** 替代。

---

## 八、`HandlerThread` 系列:工业级方案

```kotlin
val workerThread = HandlerThread("bg-work").apply { start() }
val workerHandler = Handler(workerThread.looper)

workerHandler.post {
    val data = repo.load()
    mainHandler.post { ui.update(data) }
}
```

**HandlerThread 是"线程池前"的标准模式**——长跑的工作线程 + 一个队列。

**缺点**:仍然手动管理回主线程、错误处理、生命周期。

---

## 九、第三代:`Executors` + `Future`

```kotlin
val executor = Executors.newFixedThreadPool(4)
val future = executor.submit<List<Note>> {
    repo.load()
}
mainHandler.post {
    val result = future.get()      // 阻塞等结果——但这又回到主线程阻塞
    ui.update(result)
}
```

Java 标准的 Executor + Future 模型。**问题同样在 `future.get()` 是阻塞**——你要么主线程阻塞,要么再开线程等结果,代码膨胀。

`CompletableFuture`(Java 8)能链式 callback,但**Android API 24+ 才支持**——错过了 Android 的主流期。

---

## 十、第四代:RxJava(2015-2020 流行)

```kotlin
Observable.fromCallable { repo.load() }
    .subscribeOn(Schedulers.io())
    .observeOn(AndroidSchedulers.mainThread())
    .subscribe(
        { notes -> ui.update(notes) },
        { error -> ui.showError(error) }
    )
```

**RxJava 把"异步序列 + 错误传播 + 取消"统一**——一时席卷 Android 社区。

**RxJava 的核心红利**:

1. **链式声明,可读性比回调好**
2. **错误统一**——一个 onError 接管所有上游异常
3. **取消**——`Disposable.dispose()` 取消整条链
4. **背压 / 操作符丰富**——`debounce` / `throttle` / `combineLatest` / `switchMap` ...

**致命问题**:

1. **学习曲线极陡**——操作符 200+,弄错"发布 / 订阅时机"是常态
2. **栈深**——出错时栈几十层 Rx 内部代码,定位困难
3. **disposable 管理**——必须每个订阅都加到 CompositeDisposable 在 onDestroy 清理,遗漏就泄漏
4. **不是 Kotlin 原生**——和协程冲突

**结局**:**Kotlin 协程 + Flow 在 2019-2021 完成对 RxJava 的替代**。Google 官方教程不再用 RxJava。本系列没有一行 RxJava 代码。

---

## 十一、第五代:Kotlin 协程(2018+)

```kotlin
viewModelScope.launch {
    val notes = withContext(Dispatchers.IO) { repo.load() }
    _state.value = state.value.copy(notes = notes)
}
```

**协程笑到最后**的原因:

1. **语言原生**——`suspend` 是关键字,IDE 自动检测错误
2. **看起来同步**——可读性好,栈浅
3. **取消是协作的**——结构化并发,scope 死自动取消
4. **错误就是异常**——`try/catch` 处理,和普通 Kotlin 代码一致
5. **`Flow` 替代 RxJava 在响应式场景**——更简单,更 Kotlin

现代版 04 篇展开协程。**这是 Android 异步的最终答案**——直到出现新一代语言级机制为止。

---

## 十二、不同时代异步框架的并存

老项目里可能同时存在:

```kotlin
// 主流程:协程(新代码)
viewModelScope.launch { ... }

// 老 Activity:AsyncTask(2015 留下)
class LoadTask : AsyncTask<...>() { ... }

// 某个 SDK:RxJava(2018 引入,还在用)
sdkApi.fetchAsync()
    .subscribeOn(Schedulers.io())
    .subscribe(...)

// 某个 Service:HandlerThread(2012 写的)
val handler = Handler(workerThread.looper)
```

**实际维护策略**:

- **不要 rewrite 一切**——AsyncTask / Loader 一行 if 不出错,留着
- **新功能用协程**——不再用旧框架
- **跨框架边界用 callback / Flow 桥**:
  ```kotlin
  suspend fun rxToCoroutine(): T = suspendCancellableCoroutine { cont ->
      val d = observable.subscribe(
          { cont.resume(it) },
          { cont.resumeWithException(it) },
      )
      cont.invokeOnCancellation { d.dispose() }
  }
  ```

逐步把热点路径从老框架迁出来。

---

## 十三、Strict Mode:检测主线程违规

```kotlin
StrictMode.setThreadPolicy(
    StrictMode.ThreadPolicy.Builder()
        .detectAll()             // 检测所有违规
        .penaltyLog()            // 打日志
        .penaltyDeath()          // debug 模式直接崩(暴力但管用)
        .build()
)
```

**StrictMode 是开发时检测主线程做磁盘 / 网络 IO 的工具**——`penaltyDeath` 让你"主线程读了一次文件就 crash",逼你立刻修复。

**只在 debug build 用 `penaltyDeath`**,release 用 `penaltyLog`(或者干脆不开)。

---

## 十四、Watchdog:监控主线程

```kotlin
// 自己写一个简单 watchdog
val handler = Handler(Looper.getMainLooper())

Thread {
    while (true) {
        val latch = CountDownLatch(1)
        handler.post { latch.countDown() }
        if (!latch.await(3, TimeUnit.SECONDS)) {
            // 主线程 3 秒没响应,记录栈
            val mainStack = Looper.getMainLooper().thread.stackTrace
            uploadStackToAnalytics(mainStack)
        }
        Thread.sleep(5000)
    }
}.start()
```

**主线程 watchdog**——在子线程定期 post 一个 ping 给主线程,如果回不来说明主线程卡了,记下当时栈。

生产工具:**Matrix**(微信)、**BlockCanary**(开源,有点老)。**ANR 预警比 ANR 后的 traces 价值高**——能在用户感知之前发现卡顿热点。

---

## 十五、Compose 主线程卡顿来源

Compose 应用的"卡顿"通常来自:

1. **重组太多**——参数不稳定,大范围重组(现代版 21 篇)
2. **Composable 内部做重活**——`fun List(items: ...) { items.filter { ... } }` 每帧过滤
3. **LazyColumn item 内 remember 重对象**——每个 item 创建复杂状态
4. **Modifier 链过长** + **没有 stable lambda**——重组成本高
5. **同步加载数据**——`val data = repo.load()` 在 Composable 里

**Profile 工具**:Android Studio Layout Inspector(显示重组次数)、Macrobenchmark(帧时长统计)。

---

## 十六、协程下的"主线程"

```kotlin
viewModelScope.launch {        // 默认 Dispatchers.Main.immediate
    withContext(Dispatchers.IO) {
        val data = blockingCall()
    }
    updateUi(data)              // 自动切回主线程
}
```

协程下,`Dispatchers.Main` 就是把任务发到主线程 Looper。**协程 + 主线程不会 ANR 是因为**:`suspend fun` 在挂起点不占线程,主线程释放出来跑别的;`Dispatchers.IO.withContext` 把阻塞工作切到 IO 池,主线程不阻塞。

**但!`viewModelScope.launch(Dispatchers.Main) { blockingCall() }`** 仍然 ANR——`blockingCall` 是同步阻塞,协程帮不了你。

---

## 十七、Java/Kotlin 异步演化总结

```
2010-2014  Handler + Thread / AsyncTask
2014-2018  Handler + Executor / HandlerThread / Loader
2015-2020  RxJava 大流行
2018-     Kotlin 协程 + Flow,主流
```

各时代的核心问题相同——**主线程不能阻塞**。各框架是不同的解决方式,但目标一致:**让"看起来直接"的代码安全异步执行**。

读老代码你会看到所有这些时代的痕迹。理解它们的演化,你能判断哪些代码该 rewrite,哪些先留着。

---

## 十八、Activity Result API + Activity Lifecycle 的关系

为什么 `onActivityResult` 被新 API(`registerForActivityResult`)替代?——和异步框架演化是同一逻辑:

- 老 API:回调远离启动,requestCode 易冲突,生命周期不清
- 新 API:Lambda 内联,LifecycleOwner 管生命周期,**也用了类似协程"结构化"的思想**

整个 Android API 在朝"声明式 + 生命周期感知 + 结构化"方向走。Compose 是同一波运动里的 UI 部分。

---

## 十九、踩坑

**坑 1:主线程做 SharedPreferences.commit**。`commit` 是同步阻塞磁盘 IO,主线程上稳定 100ms+。改 `apply()`(异步)或者迁 DataStore。

**坑 2:Application.onCreate 做长任务**。Application 早于 first frame,这里阻塞直接拖慢启动。**懒初始化**——SDK 在首次使用时才 init。

**坑 3:广告 SDK / 推送 SDK 在主线程同步 init**。第三方 SDK 一坨同步阻塞——能异步就异步(`Thread { sdk.init() }`),不能就放 IdleHandler 推到首屏后。

**坑 4:`gson.fromJson` 大 JSON 主线程**。10MB JSON 解析半秒以上。**永远放 Dispatchers.Default**。

**坑 5:Bitmap 解码主线程**。`BitmapFactory.decodeStream` 大图轻松 200ms。**用 Coil 等库自动后台**。

**坑 6:`runBlocking` 出现在主线程业务代码**。`runBlocking` 阻塞当前线程,主线程上直接 ANR 隐患。`runBlocking` 只该在测试 / `main` 函数顶层。

**坑 7:WebView 在主线程加载 URL**。WebView 自己内部异步,但很多代码 `webView.loadUrl(...)` 后再同步等结果——错。监听 `WebViewClient.onPageFinished`。

**坑 8:5 秒 ANR 不只是单次操作**。**累积主线程繁忙** 也能 ANR——你的 InputDispatcher 派发不进来,5 秒后系统判断你"不响应"。所以"几个 1 秒的小操作堆在主线程"也会触发。

**坑 9:Strict Mode penaltyDeath 上 release**。release 里崩等于线上炸——只 debug 用。

**坑 10:多协程并发改主线程 State**。`viewModelScope.launch { state.value = a; delay(1) }` × N 个并发——最后 state 值不确定。用 `StateFlow.update {}` 或 `Mutex`。

---

第三篇结束(12-13)。下一篇 `14-View ViewGroup 与绘制三阶段.md`,从主线程的事件循环进入 UI 系统的核心——View 树是怎么 measure / layout / draw 的、`ViewGroup` 如何排子 View、Choreographer 如何驱动每一帧、`invalidate` / `requestLayout` 触发什么。
