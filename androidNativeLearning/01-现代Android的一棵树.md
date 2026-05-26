# 现代 Android 的一棵树

学 Android 的最大障碍不是"API 太多",是**心智模型没建起来**。一个写过几年 Java + XML 的人,如果还把 Android 当"多个 Activity 通过 Intent 互相调",那一打开 Compose 项目就会立刻懵——单 Activity?Composable?重组?状态怎么传?这一篇不教任何 API,只讲一件事:**现代 Android 到底长什么样**。

> 一句话先记住:**现代 Android 是一棵被状态驱动重组的 UI 树,挂在单个 Activity 上,被一组 ViewModel 持有状态,被协程驱动副作用。其余 Jetpack 库,都是这棵树的扩展或副作用边界。** 这句话听上去很抽象,但后面 21 篇都是它的推论。

---

## 一、忘掉 Java + XML 那一代 Android

很多人对 Android 的初始印象是"Java 写业务、XML 写界面、`Activity` 与 `Fragment` 组合生命周期、`AsyncTask` 跑后台"。这套心智在 2017 年之前是对的,在 2026 年是**陈旧的**。

| 维度 | 旧 Android(2010-2017) | 现代 Android(2021-) |
| --- | --- | --- |
| 语言 | Java | **Kotlin 2.0** |
| UI | XML View + `findViewById` | **Jetpack Compose**(声明式) |
| 屏幕 | 每屏一个 `Activity`,`Intent` 跳转 | **单 Activity** + Compose Navigation |
| 异步 | `AsyncTask` / `Handler` / RxJava | **协程 + Flow** |
| 状态 | View 双向绑定 | **State → UI 单向流** |
| DI | 手写 / Dagger 2 | **Hilt**(KSP) |
| 后台 | `Service` + `JobScheduler` | **WorkManager**(单一入口) |
| 构建 | Gradle Groovy + KAPT | **Gradle KTS + Version Catalog + KSP** |
| 发布 | APK 直传 | **App Bundle**(AAB)+ Play Console |

**最要命的差别不在 API 数量,而在心智方向**:旧 Android 是"命令式 + 多入口",你拿到 `Activity` 引用、`findViewById` 拿到 View、然后命令式地 `textView.setText("hello")`。现代 Android 是"声明式 + 状态驱动",你声明的是"当状态长这样时 UI 应该长这样",剩下的让 Compose runtime 自己重组。

> 如果你脑子里 Android 的心智还停留在"多个 Activity 互相跳",那看 Navigation Compose 时会一直问"这怎么 startActivity",看 ViewModel 时会一直问"它什么时候 onDestroy"——问题不在 API,在你以为 Android 还是 2015 年那一套。

---

## 二、那棵树长什么样

现代 Android 应用,**整个进程只有一个 Activity**。这个 Activity 调 `setContent { App() }`,从此整个 UI 是一棵 Composable 函数构成的树。

```
进程(Application)
└── ComponentActivity(唯一一个)
    └── setContent { ... }
        └── App()                  ← Composable 根节点
            ├── NavHost(...)       ← 路由,管"现在显示哪一屏"
            │   ├── HomeScreen()
            │   │   ├── TopBar()
            │   │   └── NoteList(notes: List<Note>)
            │   │       └── NoteRow(...) × N
            │   └── DetailScreen(...)
            └── BottomBar(...)
```

每个节点(`HomeScreen`、`NoteList`、`NoteRow`)都是一个普通的 Kotlin 函数,标注 `@Composable`。这些函数**只读状态、生成 UI 描述**,自己不持有任何字段、不订阅生命周期、不操作 View。

**这棵树的关键性质**:

1. **声明式**——你写"在某状态下 UI 长什么样",不写"如何把 UI 从 A 状态改成 B 状态"。
2. **可重新调用**——同一个 Composable 函数会被反复调用,每次叫一次"重组"(recomposition)。
3. **只读状态**——Composable 读 `State<T>`,状态变了 Compose 自动重组依赖它的节点。
4. **没有 View 引用**——你拿不到也不需要拿 `TextView` 这种对象,只描述输出。

后面 5-9 篇全在讲这棵树:怎么搭、怎么重组、怎么布局、怎么动画。

---

## 三、谁持有状态:ViewModel

Composable 函数是"纯函数",每次重组都会重跑——所以它**不能自己存状态**。状态必须存在比 Composable 寿命更长的地方,这个地方叫 `ViewModel`。

```
ComponentActivity ─── ViewModelStoreOwner ─── 一组 ViewModel
                                              ├── HomeViewModel
                                              ├── NoteDetailViewModel
                                              └── ...
                                                   ↓ uiState: StateFlow<UiState>
                                                   ↓ (collect)
                                              Composable 读 → 重组
                                                   ↑
                                                   ↑ 事件向上
                                              用户操作(点击 / 输入)
```

`ViewModel` 是一个**"比 UI 寿命长、被进程级别管理"的对象**:屏幕旋转、配置变更、用户回到这一屏,`ViewModel` 都不重建。Composable 通过 `viewModel()` 拿到它,读它暴露的 `StateFlow<UiState>`,把 UI 事件传回它的方法。

> 这就是 **UDF(Unidirectional Data Flow,单向数据流)**:**状态从 ViewModel 流到 UI,事件从 UI 流回 ViewModel,中间没有反向数据绑定**。10 篇会专门讲。

---

## 四、副作用从哪里出去:协程

UI 树是纯的,ViewModel 也只是个状态容器,真正"做事"的是**协程**——读数据库、发网络、写文件、调系统服务。所有这些操作在 ViewModel 里启动,绑定到 `viewModelScope`,ViewModel 被销毁时**自动取消所有未完成的协程**。

```
ViewModel.viewModelScope
   ├── launch { repository.fetchNotes() }        ← 网络请求
   ├── launch { dao.observeAll().collect { ... } } ← 数据库观察
   └── launch { workManager.enqueue(...) }       ← 后台任务
```

这就是**结构化并发**:协程的生命周期挂在某个 scope 上,scope 死了协程自动死,没有"孤儿协程"在后台烧 CPU。04 篇展开。

---

## 五、Jetpack 是几十个独立库,不是一个 SDK

很多人以为 "Jetpack" 是个安装包,装上就有所有功能。**不是**。Jetpack 是 Google 在 `androidx.*` 命名空间下维护的**一组独立库**,每个库各自版本号:

```
androidx.compose.ui:1.7.4         ← UI
androidx.lifecycle:2.8.7          ← ViewModel
androidx.navigation.compose:2.8.4 ← 路由
androidx.room:2.6.1               ← 数据库
androidx.work.runtime-ktx:2.10.0  ← 后台任务
androidx.activity.compose:1.9.3   ← Activity-Compose 桥
com.google.dagger:hilt-android:2.52 ← DI(不在 androidx 但属于 Jetpack 推荐)
```

**这些库没有强绑定**,你按需引入。一个最小 Compose App 只需要 5-6 个库就能跑;一个完整产品大概 15-20 个。每多一个库,APK 体积、编译时间、潜在版本冲突都增加——所以**Jetpack 全家桶不等于"必须每个都用"**。

> Compose 子家族通过 `androidx.compose:compose-bom` 这个 BOM(Bill of Materials)统一管理版本,只指定 BOM 版本,内部库的版本自动对齐。02 篇展开。

---

## 六、Android SDK / Jetpack / Kotlin / Android Studio:四件事的关系

新读者最容易混淆这四个名词,实际上它们各自层级不同:

- **Android SDK**——Google 按 API Level 发布的平台 API,装在 `~/Library/Android/sdk/platforms/android-35/`。Android 15 = API 35。
- **Jetpack**——上面说过,几十个 `androidx.*` 库。**与 Android SDK 版本正交**——即便你 minSdk 26,也能用 Jetpack 最新版的 ViewModel / Navigation / Room,因为 Jetpack 库自己内部兼容老 API Level。
- **Kotlin**——JetBrains 维护的 JVM 语言,2024-05 发布 2.0 默认启用 K2 编译器。与 SDK / Jetpack 都正交。
- **Android Studio**——基于 IntelliJ 的 IDE,版本叫 Hedgehog / Iguana / Koala 等。它**只是 IDE**,完全可以用纯命令行 `./gradlew assembleDebug` 跑构建。

四件事的关系:**Android Studio 调 AGP 调 Gradle 调 Kotlin 编译器,产出兼容某个 API Level 的 APK / AAB,里面打包了用到的 Jetpack 库与业务代码**。

---

## 七、targetSdk 与 minSdk:不是版本号,是契约

`minSdk` / `targetSdk` 是两个经常被误解的数字:

- **minSdk = 26**——意思是"这个 App 不允许装在 Android 8.0 以下的设备上"。选 26 覆盖 95%+ 装机,且能用 `NotificationChannel`、Adaptive Icons 这些现代能力。
- **targetSdk = 35**——意思是"我声明:我的代码已经按 Android 15 的行为写过、测过"。Play Console 强制要求 targetSdk ≥ 34(2024-08 起)、≥ 35(2025-08 起)。

`targetSdk` 不是 UI 开关,是**契约**。不升 targetSdk 时,系统会给一堆兼容垫片(edge-to-edge 不强制、后台限制放宽);升上去后这些垫片消失,你必须主动处理新行为(`WindowInsets`、Foreground Service Type、Predictive Back Gesture)。

NotedX 这个系列样例应用钉死 **minSdk = 26 / targetSdk = 35**。

---

## 八、本系列的整体地图

```
01     心智总览(这篇)
02-04  地基:构建 → Kotlin → 协程与 Flow
       这一段是"会写 Android" 的前提,顺序不能跳

05-09  UI 一族:Compose 入口 / 重组 / 输入 / 布局 / 动画
       这一段是"会写界面" 的核心,占整本最大篇幅

10-14  架构与闭环:ViewModel / Navigation / Hilt / Room / Retrofit
       这一段读完,你能从零搭一个能联网能存数据的 App

15-19  系统能力:权限 / 后台 / 推送 / 相机 / 系统集成
       按需看,做什么功能看什么

20-22  工程化与发布:多模块 / 性能 / 测试与上架
       上架前必看
```

**优先级**:01-14 每篇都建议看;15-19 按需;20-22 真上架前再回头读。

---

## 九、踩坑提醒(总览版,后面每篇细讲)

1. **把 Compose 当 React 用**——Compose 不是 React 的 Kotlin 版,重组成本完全不一样,06 / 21 篇讲清楚。
2. **多 Activity + Fragment 心智迁移过来**——Fragment 在现代 Android 几乎没有位置,99% 场景都用 Composable + Navigation 代替,11 篇展开。
3. **ViewModel 当单例用**——`ViewModel` 是和 UI 绑定的,有 scope,过期就回收,18 / 11 / 10 篇会反复提。
4. **协程在 Activity / Composable 里裸 launch**——不绑 scope 的协程是孤儿,泄漏隐患极大,04 篇讲。
5. **不升 targetSdk**——Play Console 一旦卡截止日期,你只剩几周时间还一整年的债,通常会引出发布事故。
6. **以为 RxJava 还有用**——本系列没有一行 RxJava,Flow 完全替代它在 Android 的位置,04 篇展开。
7. **Compose 与 XML View 混用**——`AndroidView` / `ComposeView` 互嵌技术上可以,但新项目 99% 不该做,代价是双状态管理 + 双主题 + 双测试栈。
8. **认为单 Activity 难写**——单 Activity 不是"更难",是"更简单":没有 Activity 之间的数据传递,没有 `onActivityResult`,生命周期心智从 5 段缩到 1 段。
9. **过早多模块**——单模块能写到第 15 篇,提前拆模块只是给自己制造痛苦,20 篇展开。
10. **沉迷"全家桶"**——Jetpack 几十个库,你的 App 大概率只需要其中 15 个,不要把"用得多"当成"工程好"。

---

下一篇 `02-项目骨架与 Gradle 构建工具链.md`,把 `build.gradle.kts`、`libs.versions.toml`、AGP × Kotlin × Compose Compiler 版本对齐、KSP 全套钉死,给出可直接复制的 NotedX 完整构建脚本。
