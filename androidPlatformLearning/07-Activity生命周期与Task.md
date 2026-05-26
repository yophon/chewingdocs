# Activity 生命周期与 Task / Back Stack

> 一句话:**Activity 不是"一个屏幕",是"一个与 AMS 协商生命周期的契约对象"——它在 Task 栈里被压入弹出,在 7 个回调里被通知何时该准备/暂停/释放资源**。即便 Compose 时代单 Activity,Activity 仍然是 Android 应用的"地基"。

---

## 一、Activity 是什么(不是什么)

**Activity 不是 UI**——它可以没有 UI(`android:theme="@android:style/Theme.NoDisplay"`,常用作"中转跳转")。

**Activity 不是线程**——它在主线程跑,但和"主线程"不是一对一关系(多个 Activity 共享主线程)。

**Activity 是**:与 AMS 协商生命周期的契约对象。AMS 在合适时机调你的 `onCreate / onStart / onResume / onPause / onStop / onDestroy`,你在这些回调里管资源。

```
Activity                  Window(WMS 管的窗口)
   ├─ has-a ─────────────►
   │
   ├─ contains ───────────► View 树(setContentView 挂上去)
   │
   └─ owns ───────────────► ViewModelStore(ViewModel 寄存处)
```

---

## 二、7 个生命周期回调

```
        ┌────────────────────┐
        │      onCreate()    │  ← Activity 实例刚被反射创建,初始化 UI / 数据
        └─────────┬──────────┘
                  │
        ┌─────────▼──────────┐
        │      onStart()     │  ← Activity 即将对用户可见
        └─────────┬──────────┘
                  │
        ┌─────────▼──────────┐
        │      onResume()    │  ← Activity 在前台,用户可以交互
        └─────────┬──────────┘
                  │
              用户交互
                  │
        ┌─────────▼──────────┐
        │      onPause()     │  ← Activity 失去焦点(被另一个半透明 Activity 覆盖)
        └─────────┬──────────┘
                  │
        ┌─────────▼──────────┐
        │      onStop()      │  ← Activity 完全不可见
        └─────────┬──────────┘
                  │
        ┌─────────▼──────────┐
        │      onDestroy()   │  ← Activity 被销毁(finish 或被系统回收)
        └────────────────────┘

        额外回调:
        onRestart()  ←  从 stop 回 start(用户回到此 Activity)
```

**关键认识**:**7 个回调不是"7 个时刻",是"7 个状态转换"**。`onCreate → onStart → onResume` 是连续的;`onPause → onStop → onDestroy` 也是连续的。

**对应业务行为**:

| 回调 | 适合做 | 不适合 |
| --- | --- | --- |
| `onCreate` | 初始化 UI、订阅 ViewModel、绑定 View | 网络请求(单纯用 LaunchedEffect / init) |
| `onStart` | 注册广播、订阅 Lifecycle 敏感的事件 | 启动 Activity 跳转 |
| `onResume` | 开始相机 / 传感器 / 动画 | 保存数据 |
| `onPause` | **保存关键状态(如绘图草稿)** | 重活,这里会阻塞下一个 Activity |
| `onStop` | 释放重资源(相机停、画面渲染暂停) | 必保数据(可能没机会调) |
| `onDestroy` | 清理引用、解注册 | 永久状态保存(已晚) |

**生命周期与 ViewModel 的关系**:ViewModel 在 Activity 销毁(配置变化重建)时**不重建**,在 Activity 真正 finish 时才销毁。所以"屏幕旋转保留数据"放 ViewModel,不放 Activity 字段。

---

## 三、Activity 创建的物理流程

```
用户点 Launcher 图标 / 当前 Activity 调 startActivity
   ↓
AMS 决定:目标 App 进程
   ↓ Binder
ActivityThread(在 App 进程主线程)收到"创建 X Activity"
   ↓
ClassLoader 加载 X 类
   ↓
Class.newInstance()  // 反射创建,要求 X 有无参构造函数!
   ↓
attach(context, ...)
   ↓
performCreate(savedInstanceState):
   onCreate()    // 你写的代码
   ↓
performStart():
   onStart()
   ↓
performResume():
   onResume()
   ↓
WMS 添加 Window,SurfaceFlinger 显示
```

**关键认识**:**Activity 是被反射创建的**——所以:

1. **无参构造函数**——Activity 不能有自定义构造参数,所有数据通过 `Intent` 传
2. **不能 `Activity(repo: Repository)` 这种构造注入**——Hilt 字段注入(`@AndroidEntryPoint`)就是补这个洞
3. **`Class.forName` 必须能找到**——R8 混淆时 Activity 类不能被去掉(默认 keep)

---

## 四、`Intent`:Activity 之间的通信信封

```kotlin
val intent = Intent(this, DetailActivity::class.java).apply {
    putExtra("noteId", 42L)
    putExtra("editMode", true)
}
startActivity(intent)
```

`Intent` 是个 `Parcelable`,可被序列化通过 Binder 传给 AMS,再由 AMS 传给目标 Activity。

**Intent extra 的限制**:

- 必须能 Parcel 序列化(基础类型 / `Parcelable` / `Serializable` / 简单数组)
- 总大小 ≤ 1MB(整个 Intent + extras)——超过 `TransactionTooLargeException`
- **不要传大对象**(Bitmap / 大 List),传 ID

`getIntent()` 在 Activity 内拿启动用的 Intent;`onNewIntent(intent)` 在已存在的 Activity 被再次启动(`singleTop` 等模式)时调用,新 Intent 不替换旧的,要 `setIntent(intent)`。

---

## 五、Task 与 Back Stack

**Task** 是 Activity 的栈。每个 App 启动时默认创建一个 Task,后续 `startActivity` 默认压栈,`finish` / 按返回弹栈。

```
Task: com.notedx
└── stack
    ├── HomeActivity     ← 栈底,启动时压入
    ├── DetailActivity   ← 用户点了一张笔记
    └── EditorActivity   ← 当前栈顶,用户在编辑
```

按返回键 → EditorActivity 弹出 onDestroy → DetailActivity 重新 onResume。

**Task 的 affinity**:默认每个 App 一个 Task。可以让某些 Activity 跑在其他 Task(`taskAffinity`),但极少用。

**多 Task App**:一个 App 可以开多个 Task(如浏览器多标签页),但这是高级用法,新项目通常单 Task。

---

## 六、`launchMode`:启动模式

`<activity android:launchMode="...">` 控制 Activity 在 Task 栈里的行为:

| Mode | 行为 |
| --- | --- |
| **standard**(默认) | 每次 `startActivity` 都新建实例压栈 |
| **singleTop** | 如果栈顶已是同类 Activity,不新建,直接 `onNewIntent` |
| **singleTask** | 整个 App 范围内只有一份实例;再次启动时把这个实例上方的栈清空(`onNewIntent`) |
| **singleInstance** | 单独一个 Task,这个 Task 只能有这一个 Activity |

**用例**:

- **MainActivity** 通常 `singleTop`——从通知打开 App,如果已在栈顶就 onNewIntent
- **Login Activity** 通常 `singleTask`——任何地方需要登录都跳到它,不堆栈
- **支付 / 扫码 等独立流程** 偶尔 `singleInstance`——独立一个 Task,与主应用栈隔离

**`launchMode` 加在 manifest 里是默认值**——也可以在 `startActivity` 时通过 `Intent.FLAG_ACTIVITY_*` 临时改:

```kotlin
intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)        // 清掉上方栈
intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)        // 单顶
intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)          // 新 Task
intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TASK)        // 清空 Task(配合 NEW_TASK)
intent.addFlags(Intent.FLAG_ACTIVITY_NO_HISTORY)        // 这个 Activity 不入栈
```

---

## 七、`startActivityForResult` 与新 Activity Result API

**旧 API**(已 deprecated,但老代码大量存在):

```kotlin
// 启动方
startActivityForResult(intent, REQ_PICK_CONTACT)

// 接收结果
override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode == REQ_PICK_CONTACT && resultCode == RESULT_OK) {
        val uri = data?.data
    }
}
```

问题:requestCode 是 int 常量,容易冲突;onActivityResult 回调远离 startActivity,代码可读性差。

**新 API**(`androidx.activity.result`,2020+):

```kotlin
val launcher = registerForActivityResult(
    ActivityResultContracts.PickContact()
) { uri ->
    // 直接在 lambda 里处理结果
}

launcher.launch(null)
```

`ActivityResultContracts` 内置了:`PickContact` / `TakePicture` / `RequestPermission` / `StartActivityForResult` / ...

**新代码全部用新 API**(现代版 15 篇展开)。老代码迁移成本不高。

---

## 八、`onSaveInstanceState` / `onRestoreInstanceState`:进程级状态保存

**配置变化**(屏幕旋转、字体变大、深色模式切换):

```
旋转屏幕
   ↓
当前 Activity onPause → onStop → onSaveInstanceState(outState)
   ↓
Activity 实例销毁
   ↓
新的 Activity 实例创建
   ↓
onCreate(savedInstanceState) → onStart → onRestoreInstanceState(savedInstanceState) → onResume
```

`onSaveInstanceState(Bundle outState)` 让你存"瞬时状态"——用户没提交、但应当跨重建保留(输入框文本、滚动位置、当前 Tab):

```kotlin
override fun onSaveInstanceState(outState: Bundle) {
    super.onSaveInstanceState(outState)
    outState.putString("draft_text", draft)
    outState.putInt("current_tab", currentTab)
}

override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    savedInstanceState?.let {
        draft = it.getString("draft_text") ?: ""
        currentTab = it.getInt("current_tab", 0)
    }
}
```

**关键**:`onSaveInstanceState` 在 **进程被杀**(系统因内存压力杀掉你 App)时也会被 AMS 持有——重新打开 App 时,即便进程都重建了,Bundle 还在。这是 ViewModel 的 `SavedStateHandle` 的底层。

**`onSaveInstanceState` 限制**:

- 大小限制(同 Intent,1MB 量级)
- 不能存 Activity 引用 / Context / View
- 只存原始数据,UI 状态不该全靠它

**与 ViewModel 的边界**:
- **ViewModel** 跨配置变化保留,**进程死了就没了**——业务状态
- **SavedStateHandle** 跨进程死亡,**用户切走 App / 系统重启都保留**——草稿、ID、当前页这类小数据

现代版 10 篇展开 ViewModel + SavedStateHandle 的协作。

---

## 九、配置变化:屏幕旋转的 3 种应对

1. **默认重建 Activity**(标准答案)——`onSaveInstanceState` + `onCreate(savedInstanceState)` 走完整流程
2. **声明自己处理**——manifest 里:
   ```xml
   <activity android:configChanges="orientation|screenSize|keyboardHidden">
   ```
   旋转时不重建,只调 `onConfigurationChanged`。**几乎不该用**——除非 Activity 内部有非常重的状态难以 SavedState 保存(比如视频播放器)。
3. **`fixedOrientation`**——锁死竖屏:`android:screenOrientation="portrait"`。简单但限制用户。

**默认就是 1**——重建是 Android 的标准方式,ViewModel + SavedStateHandle 设计就是为此。

---

## 十、`Lifecycle` API(LifecycleOwner 心智)

Jetpack `lifecycle` 库把 Activity 的 7 个回调抽象成 `Lifecycle.State` + `Lifecycle.Event`:

```
State 转换图:
INITIALIZED → CREATED → STARTED → RESUMED
                  ↑          ↑
                  ↓          ↓
              DESTROYED  ←  STARTED  ← RESUMED
```

每个 Activity / Fragment 都是 `LifecycleOwner`,可以订阅:

```kotlin
lifecycle.addObserver(object : DefaultLifecycleObserver {
    override fun onStart(owner: LifecycleOwner) { /* ... */ }
    override fun onStop(owner: LifecycleOwner) { /* ... */ }
})
```

**LifecycleScope**:

```kotlin
class MainActivity : ComponentActivity() {
    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                vm.events.collect { /* 只在 STARTED 时收 */ }
            }
        }
    }
}
```

`repeatOnLifecycle(STARTED)`——进 STARTED 启动,退出 STARTED(切到后台)取消。是订阅 Flow 的生产推荐写法。

---

## 十一、`finish()` / `finishAffinity()` / `finishAndRemoveTask()`

```kotlin
finish()                  // 关闭当前 Activity,回到上一个
finishAffinity()          // 关闭所有同 affinity 的 Activity(典型:退出整个 App)
finishAndRemoveTask()     // finish + 从最近任务列表移除(完全退出)
```

**心智**:
- 单 Activity 退出 App 用 `finish()`
- 多 Activity 想"按返回直接退出 App" 用 `finishAffinity()`
- 完全清除痕迹(隐私模式 / 安全 App)用 `finishAndRemoveTask()`

---

## 十二、`onBackPressed` 与 Predictive Back

旧 API:

```kotlin
override fun onBackPressed() {
    if (canCancel) {
        showCancelDialog()
    } else {
        super.onBackPressed()
    }
}
```

新 API(`androidx.activity:1.x` 起):

```kotlin
onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
    override fun handleOnBackPressed() {
        // 拦截返回
    }
})
```

`OnBackPressedDispatcher` 支持多个 callback 链式优先级。Compose 里用 `BackHandler` 包装(现代版 11 篇)。

**Predictive Back**(Android 14+):返回手势可以"预览"上一屏。Activity 之间默认有内建动画。Compose Navigation 自动支持。

---

## 十三、Activity 的几种特殊场景

**透明 Activity**:`android:theme="@android:style/Theme.Translucent.NoTitleBar"`——背景透明,看得到下层 Activity。常用作 dialog-like 入口(分享、登录引导)。

**对话框 Activity**:`android:theme="@android:style/Theme.Dialog"`——尺寸不撑满屏幕,系统认为它是 dialog 而不是 fullscreen Activity。

**`NoDisplay` Activity**:`android:theme="@android:style/Theme.NoDisplay"`——完全无 UI,**必须在 onCreate 里调 `finish()`**,只用作"跳板"(接收 Intent,分发到下一个 Activity)。

---

## 十四、Compose 时代的 Activity:还在什么时候用

现代单 Activity App 几乎只有一个 `MainActivity`。仍然要懂 Activity 是因为:

1. **MainActivity 仍然需要正确处理生命周期**——`enableEdgeToEdge` 在 super.onCreate 前调、`onNewIntent` 处理深链
2. **接收外部 Intent**(分享、ACTION_VIEW)的入口 Activity
3. **支付 / 扫码 / 第三方 SDK 经常需要它们自己的 Activity**(微信支付 / 扫脸 / OAuth)——这些是黑盒,但流程涉及 startActivity / onActivityResult
4. **Widget / Notification 点击 → Activity** 是唯一可靠路径

读完本系列你应当能解释:Compose `setContent` 是什么时机、为什么 Activity 必须有无参构造、`@AndroidEntryPoint` 为什么是字段注入。

---

## 十五、debug 命令

```bash
# 查看当前 Activity 栈
adb shell dumpsys activity activities | head -50

# 启动指定 Activity
adb shell am start -n com.notedx/.MainActivity

# 启动并 finish-after(测试 transparent)
adb shell am start --user 0 -n com.notedx/.SomeActivity

# 把当前 Activity 切到后台(home)
adb shell input keyevent KEYCODE_HOME

# 模拟返回
adb shell input keyevent KEYCODE_BACK

# 关闭 App(类似最近任务上滑)
adb shell am force-stop com.notedx
```

---

## 十六、踩坑

**坑 1:Activity 持有 Context 单例字段**。
```kotlin
companion object { lateinit var instance: MainActivity }
```
经典 Activity 泄漏——配置变化后旧 Activity 被引用住,GC 不掉。**static 永远不要持有 Activity / View / Fragment**。

**坑 2:`onPause` 里做重活**。`onPause` **阻塞下一个 Activity 的启动**——你写数据库 / 网络在这里,用户切屏会卡。重活放 `onStop` 或后台线程。

**坑 3:`onCreate` 里 `findViewById` 慢**。复杂 XML 布局 inflate + findViewById 几十次,启动慢。Compose 不存在这个问题,旧 XML 项目用 ViewBinding 一次拿全部(15 篇)。

**坑 4:`startActivity` 后立即用结果**。`startActivity` 是异步的,不会等新 Activity 启动完。要等结果用 ActivityResult API,不要靠"`startActivity` 后 sleep"。

**坑 5:`onNewIntent` 不 `setIntent(intent)`**。`onNewIntent` 给的是新 Intent,但 `getIntent()` 默认仍返回旧的——必须 `setIntent(intent)` 才同步。

**坑 6:`launchMode` 与 Intent flags 互相冲突**。manifest 配 `singleTask`,代码又 `FLAG_ACTIVITY_NEW_TASK`——行为难预测。**统一一种方式**(优先 manifest)。

**坑 7:`onSaveInstanceState` 存大对象**。Bundle 上限同 Binder,大对象抛 `TransactionTooLargeException`。**只存 ID / 少量基础类型**,数据本身在 Room 或缓存。

**坑 8:在 onCreate 里 `startActivity(targetClass)` 再 `finish()`**——预期"快速跳转"。但有些场景这个跳转 UI 会闪一下旧画面。如果是纯跳转,用 `Theme.NoDisplay` 让自己不显示。

**坑 9:多 Activity 之间通信用 static**。两个 Activity 跑在同一进程,共享 static 看似可行,但配置变化 / 进程被杀都会出问题。**Repository / ViewModel / Room 是跨 Activity 共享数据的正经渠道**。

**坑 10:`finish` 后又访问 Activity 字段**。`finish` 是异步的——调完它,Activity 不会立即销毁,但 onDestroy 后任何字段都可能 null。`isFinishing` / `isDestroyed` 检查。

---

下一篇 `08-Fragment 历史 问题与心智.md`,讲 Fragment——它为什么被发明、它的诡异之处(嵌套 Fragment / FragmentManager 状态 / `findFragmentById` 时机)、它的现代替代(Compose Navigation 直接挂 Composable),以及为什么读老代码必须懂它,但新代码尽量不用。
