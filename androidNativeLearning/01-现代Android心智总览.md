# 01-现代 Android 心智总览

> 一句话导读:现代 Android 不是"Java + XML + 多 Activity"的渐进式升级版本,而是把语言、UI、生命周期、构建、发布五条主线一并替换成 Kotlin + Compose + 单 Activity + Jetpack + Play Console 的一套新范式。理解这个替换边界,才知道后续 29 篇要钉死什么、扔掉什么。

打开 Android Studio Koala 新建项目,一个写过几年后端或前端的工程师通常会立刻撞上三种困惑。第一,新建向导里 minSdk 默认填 24 还是 26,这一个数字到底是图省事就过、还是真的会决定后续一半 API 怎么写、能覆盖多少装机量、Play Console 会不会在某次提审时直接拒。第二,模板代码生成的 `MainActivity` 直接继承 `ComponentActivity` 并调用 `setContent { Greeting() }`,这和印象里"`Activity` 继承 `AppCompatActivity`、`setContentView(R.layout.activity_main)`"的旧 Android 是同一回事吗。第三,所谓 "Jetpack" 看起来无处不在,但既不是一个 SDK 安装包也不是一个 Gradle 插件,`ViewModel`、`Room`、`Navigation`、`Hilt`、`Compose` 又各自有独立版本号 —— 它到底是怎么组织的。

这些问题不在语言层,也不在 API 层,而在工程坐标系层。这一篇先把 2024-2026 这一代 Android 的坐标系钉死,后面 29 篇都在这套坐标系里展开,不再回头讨论"为什么不用 Java"或"为什么不写 XML"这种已经被工业实践淘汰的选项。

## 1. 机制定位

Android 在 2017 年以前的标准心智是:Java 写业务、XML 写界面、`Activity` 与 `Fragment` 组合生命周期、`AsyncTask` 跑后台。这一套到 2024-2026 已经基本不再是 Google 的推荐路径,但很多人对 Android 的印象仍然停留在那个时代。原因不在程序员"学习态度差",而在于 Android 平台演进的速度本身比绝大多数读者的学习节奏要快:

| 时间点 | 关键变化 | 对应淘汰 |
| --- | --- | --- |
| 2017 Google I/O | Kotlin 成为 first-class language | Java 主线地位动摇 |
| 2019 Google I/O | "Kotlin-first" 公开宣布,新 API 优先 Kotlin | Java 退居互操作角色 |
| 2021-07 | Jetpack Compose 1.0 稳定 | XML View 主线地位动摇 |
| 2022-2024 | Material 3 / Compose BOM / Navigation Compose 全面稳定 | XML View / `findViewById` 退居遗留 |
| 2024-05 | Kotlin 2.0 默认启用 K2 编译器 | Kotlin 1.x 编译器进入维护 |
| 2024-09 | Compose Compiler 自 Kotlin 2.0.20 起内嵌于 Kotlin | 独立追 Compose Compiler 版本结束 |
| 2024-10 | Android 15 (API 35) 进入 stable,edge-to-edge 强制 / FGS Type 强制 | targetSdk 34 进入两年宽限期 |

一句话:**今天写 Android 不再有 "Java + XML" 这条路径的实操理由**。Google 自己的 Codelab、Sample、Compose Catalog、Now in Android Sample 全部已经是 Kotlin + Compose;市面上还在用 Java + XML 写新项目的团队,几乎都是在维护已有屎山,而不是做最优解。本系列没有"为什么不选 Java"这一段争辩,直接从"Kotlin + Compose 已是事实标准"出发。

那真正值得讨论的是:**在这个事实标准之上,工程取舍仍然非常多**。同一个 Kotlin + Compose 项目,有人写得能打磨成 Play 商店明星应用,有人写得三个版本之后整个状态层都要重做。本系列要做的就是把这些取舍逐篇钉死:状态管理用 `ViewModel` + `StateFlow` 还是裸 `mutableStateOf`,导航用类型安全的 `Navigation Compose` 还是字符串模板,DI 用 Hilt 还是 Koin,持久化用 Room 还是 SQLDelight,推送用 FCM 还是统一推送联盟,等等。但要把这些取舍讲清楚,需要一个共同基线 —— 一个会被反复演进的目标应用,而不是 30 个孤立 demo。

这个应用就是后续每篇都会迭代的 **NotedX**(笔记 + 待办 + 图片附件 + 云同步)。它最终会有的能力清单:

- 单 Activity + Compose,Material 3 主题与 edge-to-edge 适配;
- 笔记 / 待办 / 标签三个核心实体,Room 持久化 + DataStore 偏好;
- Hilt 依赖注入,Retrofit + OkHttp 拉远端,kotlinx.serialization 解析;
- CameraX 拍照 + Photo Picker 选图 + MediaStore 写入图片附件;
- WorkManager 周期同步,FCM + 国内推送渠道兜底通知;
- App Bundle 签名上架 Play Internal Track,Baseline Profile 优化启动;
- Macrobenchmark 跑 startup / scroll 基准,R8 混淆瘦身。

之所以挑这一组功能,是因为它的复杂度恰好覆盖一个真实应用的所有关键面:UI 重组成本(列表 + 输入)、持久化与远程同步冲突、系统能力调用(相机 / 媒体 / 推送)、性能与发布通路。比 To-Do 应用更接近真实,比社交 App 又轻量到不会被业务细节带偏。

## 2. Android 心智

新读者最容易混淆的概念是 "Android SDK vs Android Jetpack vs Android Studio vs Kotlin",这四件事各自层级不同,缺一不可,但耦合远没有想象中紧。把它们的关系画清楚,后面就不会再被版本号绕晕:

- **Android SDK**:由 Google 维护、按 API Level 发布的平台 API 集合,装在 `~/Library/Android/sdk/platforms/android-35/` 之类的目录,核心是 `android.jar`。每个 Android 版本对应一个 API Level,Android 15 = API 35。SDK 由 SDK Manager 下载,跟着设备版本走,不能随便升降。
- **Jetpack**:Google 在 `androidx.*` 命名空间下维护的一组**官方库集合**,每个库各自有版本号(`androidx.compose.ui:1.7.4`、`androidx.lifecycle:2.8.7`、`androidx.room:2.6.1` 等)。它的核心承诺是"跨 Android 版本提供一致 API"—— 即便 minSdk 是 26,也能用 Jetpack 最新版的 `ViewModel` / `Navigation` / `Room`。Jetpack 不是一个安装包,是几十个独立库,按需挑。
- **Kotlin**:JetBrains 维护的 JVM 语言,2024-05 发布 2.0 默认启用 K2 编译器。版本和 Android SDK 是**正交**的:Kotlin 2.0 既能编译 minSdk 21 的项目,也能编译 minSdk 35 的项目;反过来 Android API 35 也能跑 Kotlin 1.9 编译出的字节码。
- **Android Studio**:Google 基于 IntelliJ IDEA 的 IDE,版本名沿用动物命名(Hedgehog / Iguana / Jellyfish / Koala / Ladybug / Meerkat 等),内嵌一个 Gradle / AGP 默认版本。**它只是一个 IDE,完全可以用纯命令行 `./gradlew assembleDebug` 跑构建,不开 Android Studio 也行**;但用它的最大价值是 SDK Manager、AVD Manager、APK Analyzer、Layout Inspector、Profiler、Compose Preview 这些不可替代的工具。

这四件事的关系是:**Android Studio 调用 AGP 调用 Gradle 调用 Kotlin 编译器,产出一份兼容某个 API Level 的 APK / AAB,里面打包了用到的所有 Jetpack 库与业务代码**。第 02 篇会展开 AGP × Kotlin × Compose Compiler 的版本对齐细节,这里先把概念分层。

Jetpack 既然是几十个独立库的集合,值得做一次分类盘点 —— 后面 29 篇会反复 import 这些库,先建立目录心智:

| 子领域 | 关键库 | 在 NotedX 里出现的位置 |
| --- | --- | --- |
| UI | `androidx.compose.ui` / `compose.material3` / `compose.foundation` | 第 06-10 篇 |
| 入口 | `androidx.activity.compose` / `androidx.core.splashscreen` | 第 06 / 25 篇 |
| 生命周期 | `androidx.lifecycle.viewmodel` / `lifecycle.runtime.compose` | 第 11 篇 |
| 导航 | `androidx.navigation.compose` | 第 12 篇 |
| DI | `com.google.dagger:hilt-android` + `androidx.hilt:hilt-navigation-compose` | 第 13 篇 |
| 数据库 | `androidx.room` + `room-ktx` | 第 14 篇 |
| 偏好 | `androidx.datastore.preferences` | 第 14 篇 |
| 网络 | `com.squareup.retrofit2` + `com.squareup.okhttp3` + `kotlinx.serialization` | 第 15 篇 |
| 权限 | `androidx.activity.compose.rememberLauncherForActivityResult` | 第 16 篇 |
| 后台 | `androidx.work.runtime-ktx` | 第 17 篇 |
| 相机 | `androidx.camera.camera2` / `camera.view` / `camera.lifecycle` | 第 19 篇 |
| 性能基准 | `androidx.benchmark.macro` + `androidx.profileinstaller` | 第 23 篇 |
| 测试 | `androidx.compose.ui:ui-test-junit4` + `androidx.test.ext` | 第 26 篇 |

这张表不必背,但要知道 Jetpack 不是单一安装,是一组按需引入的库。每个库版本号独立维护,Compose 子家族通过 `androidx.compose:compose-bom` BOM 文件统一管,第 02 篇会展开。

接下来谈三个会贯穿后续每一篇的"心智反转",老 Android 开发者最容易在这里栽:

**反转一:单 Activity + Compose Navigation 替代 多 Activity + Fragment**。旧 Android 模型里每个独立屏幕对应一个 `Activity`,屏幕之间用 `Intent` 加 `extras` 传数据,共享数据要么走 `SharedPreferences` 要么走单例,生命周期复杂到要专门学一张状态图。现代模型反过来:**整个 App 只有一个 `ComponentActivity`**,所有屏幕都是它内部 `setContent {}` 里的 Composable,`NavHost` + `composable` 路由切换,共享数据走 `ViewModel`(`SavedStateHandle` 持久化),进程被杀也能恢复。这意味着旧 Android 教程里 90% 关于 "Activity 之间通信" 的内容,在本系列里直接不出现 —— 因为没有第二个 Activity。第 06 / 12 篇展开。

**反转二:声明式 UI + 单向数据流替代 命令式 UI + findViewById**。XML View 模型下你写一份布局 XML,在 Activity 里 `findViewById(R.id.title)` 拿到 View 引用,然后命令式地 `title.text = "hello"`。Compose 模型下没有这些步骤:`@Composable fun Title(text: String) { Text(text) }`,声明的是"在某状态下 UI 应该长成什么样",状态变了 Compose runtime 负责重组对应部分。State → UI 单向流,业务事件 → State 也单向流,旧的"View 双向绑定"心智在 Compose 里没有对应物。第 07 / 11 篇展开。

**反转三:协程 + Flow 替代 AsyncTask + Handler + RxJava**。旧 Android 异步主线有三代:`AsyncTask`(2017 被 deprecate)、`Handler` / `Looper`(底层)、`RxJava`(2015-2020 流行)。Kotlin 协程在 2018 之后逐步成为标准答案,2021 后 `Flow` 进一步替代 Rx 在响应式场景的位置。本系列里**没有 RxJava 一行代码**;`AsyncTask` 不出现;`Handler` 只在第 17 篇前台服务一段以"为什么 WorkManager 优于 Handler"的反例形式提一次。第 04 / 05 篇展开协程与 Flow 心智。这套并发模型在 [[osLearning]] 里有底层视角,本系列只讲它在 Android 上的工程用法。

## 3. 工程实现

为了让"现代 Android 心智"不停留在抽象描述,这一节把 NotedX 的最小可运行入口建起来。后续 29 篇所有代码都基于这个工程演进,不会再让你新建项目。

打开 Android Studio Koala+ (2024.1.1 或更新) 新建项目,选择 **Empty Activity (Compose)** 模板,语言 Kotlin,minSdk 26 (Android 8.0),target/compile SDK 35 (Android 15)。模板会生成 `app/`、`build.gradle.kts`、`settings.gradle.kts`、`gradle/libs.versions.toml` 等文件。下面给出最小必要的入口三件套,**完整的 build 脚本与 Version Catalog 放在第 02 篇展开**,这里只展示运行时入口。

**`app/src/main/AndroidManifest.xml`** —— 单 Activity 声明:

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">

    <application
        android:name=".NotedXApp"
        android:allowBackup="true"
        android:dataExtractionRules="@xml/data_extraction_rules"
        android:fullBackupContent="@xml/backup_rules"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/Theme.NotedX"
        tools:targetApi="35">

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:label="@string/app_name"
            android:theme="@style/Theme.NotedX">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
```

注意整份 manifest **只有一个 `<activity>`**。后续不管 NotedX 长出几个屏幕,都不再增加 Activity。`android:name=".NotedXApp"` 指向自定义 `Application` 子类,第 13 篇接入 Hilt 时会给它挂 `@HiltAndroidApp`。

**`app/src/main/java/com/notedx/NotedXApp.kt`** —— 自定义 Application:

```kotlin
package com.notedx

import android.app.Application
import android.util.Log

class NotedXApp : Application() {

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "NotedX process started, pid=${android.os.Process.myPid()}")
    }

    companion object {
        private const val TAG = "NotedXApp"
    }
}
```

这个类目前几乎是空壳,但本系列后续会反复用到它:第 13 篇挂 Hilt,第 14 篇初始化 Room,第 17 篇创建 `NotificationChannel`,第 25 篇启动 App Startup 初始化器。把 `Application` 想成"进程级生命周期入口"而不是"业务起点",它的存在就是为"全局只需初始化一次"的东西提供 hook。

**`app/src/main/java/com/notedx/MainActivity.kt`** —— 单 Activity 入口:

```kotlin
package com.notedx

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        // Android 15 (API 35) + targetSdk 35 起 edge-to-edge 默认启用,
        // 显式调一次让代码意图明确,且向后兼容 API 26-34 装机。
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                NotedXAppScaffold()
            }
        }
    }
}

@Composable
private fun NotedXAppScaffold() {
    Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
        Box(modifier = Modifier.padding(innerPadding)) {
            Text(text = "NotedX online")
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun NotedXAppPreview() {
    MaterialTheme {
        NotedXAppScaffold()
    }
}
```

这不到 40 行代码已经覆盖了"现代 Android 心智"的所有关键元素:**`ComponentActivity`** 而不是 `AppCompatActivity`(后者由 `androidx.appcompat` 提供,Compose 应用通常不需要),**`enableEdgeToEdge()`** 显式启用 edge-to-edge,**`setContent {}`** 把 Activity 内容声明成一棵 Composable 树,**`MaterialTheme {}`** 提供 Material 3 颜色 / 排版,**`Scaffold`** 处理 status bar / navigation bar / IME 的内边距(通过 `innerPadding` 暴露给内层),**`@Preview`** 让 Android Studio 不开模拟器就能看到 UI。

整份代码里**没有 `findViewById`、没有 `setContentView`、没有 `R.layout.xxx`、没有 XML View** —— 这是后续 29 篇所有 UI 代码的默认形态。

NotedX 的最小目录在这一篇看起来还很简陋,但要意识到它会按这个骨架生长。给一个第 15 篇前后会稳定下来的目录预览:

```text
app/
├── build.gradle.kts
└── src/main/
    ├── AndroidManifest.xml
    ├── java/com/notedx/
    │   ├── NotedXApp.kt              # 进程入口、Hilt @HiltAndroidApp
    │   ├── MainActivity.kt           # 单 Activity
    │   ├── ui/
    │   │   ├── theme/                # Material 3 ColorScheme / Typography
    │   │   ├── home/                 # 首页 Composable + ViewModel
    │   │   ├── note/                 # 笔记列表与详情
    │   │   └── todo/                 # 待办相关
    │   ├── data/
    │   │   ├── note/                 # Room Dao / Entity / Repository
    │   │   ├── todo/
    │   │   └── remote/               # Retrofit Service / DTO
    │   ├── di/                       # Hilt Module
    │   └── nav/                      # Navigation Compose 路由表
    └── res/
        ├── values/                   # strings.xml / themes.xml
        ├── mipmap-*/                 # Adaptive Icons
        └── xml/                      # backup_rules / data_extraction_rules
```

这套目录是从中等规模 Compose 项目倒推出来的最小可扩展结构。第 21 篇会把它拆成多模块(`:app` / `:feature-note` / `:core-data` / ...),但前 20 篇都按单模块演进。

## 4. 调参与验收

这一篇的"调参"主要指三个项目级取舍,选对了后面 29 篇都不需要回头改:

**minSdk 取舍**。NotedX 选 **minSdk = 26 (Android 8.0)**。这个数字不是拍脑袋:

- 截至 2026-05 时点,Android distribution dashboard 上 API 26+ 覆盖率已经超过 95%。
- API 24-25 (Android 7) 只剩 < 4% 的尾部装机,且 Google Play Services 在 Android 7 上已经逐步退出主线支持。
- API 26+ 才能用 `NotificationChannel`、`JobScheduler` 现代化能力、Adaptive Icons、ART 2.0 优化。
- 大多数 Jetpack 库的最低 minSdk 要求是 21,选 26 不增加额外限制,但减少了 8.0 以下大量 if-else 适配代码。

如果做的是面向农村低端机或东南亚仍有大量 7.0 设备的市场,可以降到 21,但要接受"通知体验降级 + 后台限制更乱 + 部分 Jetpack API 退化"。

**targetSdk 取舍**。NotedX 必须 **targetSdk = 35 (Android 15)**:

- Play Console 自 2024-08 起要求新应用 targetSdk ≥ 34,2025-08 起要求 ≥ 35,2026-08 大概率会推到 36。
- 不升 targetSdk 意味着应用被视为"老应用",系统会给一些兼容降级(例如 edge-to-edge 不强制、后台限制宽松一档),短期省事,长期是给自己埋雷。
- 升到 35 必须主动处理:edge-to-edge enforcement(第 06 篇)、Foreground Service Type 强制(第 17 篇)、Photo Picker 与部分照片访问(第 19 篇)、Predictive Back Gesture(第 12 篇)。

**compileSdk** 跟 targetSdk 一致(都是 35)。compileSdk 决定源码里能引用到哪些 API,targetSdk 决定运行时系统会以哪个版本的行为对待你。两者一致是最简单的策略;只有在特定场景(例如想用 Android 16 的 API 但还不想被 16 的行为变更影响)才会分开。

为了让 minSdk 26 / targetSdk 35 这两个数字有具体感,看一张被读者经常忽略的"按 API Level 行为差异"表:

| 行为变更 | 触发 API | NotedX 影响 |
| --- | --- | --- |
| `NotificationChannel` 强制 | API 26+ | minSdk 26 起所有通知必须挂 channel,旧分组通知 API 一律不出现 |
| Background Execution Limits | API 26+ | 后台 Service 启动受限,推动 WorkManager 成为唯一答案(第 17 篇) |
| Scoped Storage 强制 | API 29+ | `MediaStore` / Photo Picker 替代直接路径访问(第 19 篇) |
| Foreground Service Type 声明 | API 29+ 起逐步收紧 | API 34 起未声明 type 直接抛 SecurityException |
| `POST_NOTIFICATIONS` 运行时申请 | API 33+ | 即便 minSdk 26 也要写运行时申请逻辑(第 16 / 18 篇) |
| Photo Picker 默认 | API 33+ | 取代权限 `READ_EXTERNAL_STORAGE` 的常见用法 |
| Predictive Back Gesture | API 33+ 可选 / 34+ opt-in / 35+ 默认 | 必须 `OnBackPressedCallback` / `PredictiveBackHandler`(第 12 篇) |
| Edge-to-edge enforcement | targetSdk 35+ | system bar 不再留白,必须显式处理 `WindowInsets`(第 06 篇) |
| 16 KB page size | targetSdk 35+ / 16 KB 强制 = API 36 起 | 第三方 `.so` 需重对齐;纯 Kotlin 项目零成本(第 24 / 28 篇) |

这张表的工程价值不在背诵,而在把"升 targetSdk 这件事意味着我要做什么"提前心里有个目录。每升一档 targetSdk,通常意味着 2-5 项行为变更落到你的代码里,大概一两天的工作。本系列把这些工作分散到具体篇目里逐项消化,避免读者攒到提审前一周才发现"原来要改这么多"。

**验收清单**:

- `./gradlew :app:assembleDebug` 跑通,生成的 APK 能在 Android 8.0+ 设备 / 模拟器上启动,显示 "NotedX online"。
- `adb shell dumpsys package com.notedx | grep -E "targetSdk|minSdk"` 能看到 `minSdk=26 targetSdk=35`。
- 在 Android Studio 里打开 `MainActivity.kt`,右侧 Preview 面板能直接渲染 `NotedXAppPreview`,不需要模拟器。
- `adb shell am start -n com.notedx/.MainActivity` 命令能从命令行拉起 App。

## 5. 踩坑

**坑 1:把 minSdk = 21 当成无脑安全选项**。21 (Lollipop) 在 2014 发布,2026 仍能跑,但选 21 意味着要为不到 1% 的尾部装机背一堆历史包袱:`NotificationChannel` 之前的通知系统、`JobScheduler` 之前的后台、Material You 之前的主题降级。最大的反直觉点是:**选 21 反而让你写更多代码**,因为很多 API 要写 `if (Build.VERSION.SDK_INT >= O) { ... } else { ... }`。选 26 让代码量净减,且 99%+ 用户仍然覆盖。

**坑 2:把 "升 targetSdk = UI 升级开关" 理解错**。升 targetSdk 不是 UI 升级开关,是**让你显式承担"按新行为运行"的责任**。不升 targetSdk 时,系统会为旧应用打开兼容垫片(例如 Android 12 之前的 `SplashScreen` 行为、Android 15 之前的 system bar 行为)。升上去之后这些垫片一并消失,必须把对应代码补全。短期想"先省事不升"的代价是,Play Console 一旦卡 targetSdk 截止日期,只剩几周时间把一年的债集中还,通常会引出严重发布事故。本系列从第一天就钉死 targetSdk 35,避免这种被动。

**坑 3:把 Jetpack Compose 与传统 Android View 系统误以为可以混着用**。技术上可以在 Compose 里嵌 View(`AndroidView`),也可以在 View 里嵌 Compose(`ComposeView`),但**新项目里 99% 不该这么做**。混用的代价是同时背两套状态管理、两套主题、两套生命周期与两套测试栈,工程上几乎没有收益,只有少数特殊场景(例如必须用某个还没 Compose 版本的第三方 SDK,典型是地图 SDK)才会被迫嵌入。本系列除了第 19 篇 CameraX Preview(`PreviewView`)需要 `AndroidView` 嵌入之外,不再出现 View 与 Compose 混用。

**坑 4:把 Java 互操作当成"还能写 Java"的退路**。Kotlin 与 Java 互操作是真正零成本的(都是 JVM 字节码),但"能互操作" ≠ "应该混用"。一个 Kotlin + Java 双语项目要承担:`null` 边界(Java 的 `String` 在 Kotlin 看是 `String!` 平台类型,空安全失效)、Lambda 转换(Kotlin lambda 默认非 SAM)、构造函数默认值(`@JvmOverloads` 必须显式加)、属性访问(Java 看是 `getXxx` / `setXxx`,需要 `@JvmField` 或 `@JvmStatic` 控制)等四类适配工作。NotedX 整个项目纯 Kotlin,Java 仅作为"第三方 SDK 互操作边界"在第 03 / 24 篇短暂出现。

**坑 5:用旧版 Android Studio 老模板新建项目**。模板代码会随着 Android Studio 版本演进:Hedgehog (2023.1) 的模板还没默认启用 edge-to-edge;Iguana / Jellyfish 才开始默认 `enableEdgeToEdge()`;Koala+ 默认用 Compose BOM 与 Version Catalog。**永远用最新 stable 版本的 Android Studio 新建项目**,然后把模板代码当成"对当前最佳实践的参考",而不是把几年前下载的 IDE 里的模板拿来用 —— 那个版本生成的代码可能已经过时半个世代。

**坑 6:相信"国内安卓"和"国际安卓"差异巨大需要分开学**。差异确实存在(主要在 Google Play Services 与各家应用市场的发布通路、推送通道、地图 SDK 选型),但**核心运行时与 Jetpack 库完全一致**。本系列把这些差异收口到具体篇目:推送在第 18 篇分一段讲 FCM 与国内厂商渠道;地图 / 定位作为可选延伸在第 19 / 20 篇提及;应用市场上架差异在第 28 篇与 Play 主线对照。其它 25 篇,无论在哪个市场发布,Kotlin / Compose / Hilt / Room 这套技术栈都是同一份。

**坑 7:试图同时学 Compose 与 KMP / Flutter 做"跨端方案选型"**。Compose Multiplatform 与 [[flutterLearning]] 都是跨端方向,但**本系列不在选型之列**。NotedX 是一个 Android 原生应用,Compose 在本系列里特指 "Jetpack Compose for Android";Compose Multiplatform 的桌面 / iOS / Web 目标如果未来想做,需要单独的工程决策(BOM 不同、生命周期不同、依赖图不同),不在本系列范围。把这件事提前说清楚,免得读到第 07 / 11 篇时纠结"我学的 Compose 能不能直接复用到 iOS"。

**坑 8:把"Now in Android"或单个官方 Sample 的代码风格当成绝对答案**。Google 维护的 [Now in Android](https://github.com/android/nowinandroid) 是高质量 sample,但它的目标是展示 Jetpack 与 Compose 高级用法(多模块 / Baseline Profile / Macrobenchmark / DI scoping 全开),对一个刚起步的项目而言是过度工程。本系列从单模块起步,到第 21 篇才切多模块,中间不强行套用 Now in Android 的目录骨架 —— 让结构跟着功能复杂度长出来,而不是反过来。这一点和后端从 Hello World 长成微服务的节奏一致。

**坑 9:把"全家桶"等同于"必须每个都用"**。Jetpack 几十个库,Room / DataStore / Navigation / WorkManager / Hilt / Lifecycle / ViewModel / Compose / Activity 这些是 NotedX 会全部用上的;但 `Paging 3`、`Camera2 Extensions`、`Tracing`、`Macrobenchmark`、`Glance Widget` 都是按需引入的,**没必要在第一天全装上**。Gradle 依赖每多一项,APK 体积、编译时间、潜在版本冲突都增加。每加一个 Jetpack 库前问一句"NotedX 当前阶段真的需要它吗",大概率发现可以晚一篇再加。本系列每一篇引入新库时都会显式说明理由,而不是堆砌依赖表。

---

下一篇 `02-项目骨架与构建工具链.md`,把这一篇里点到名字的 `build.gradle.kts`、`libs.versions.toml`、AGP × Kotlin 版本对齐、KSP / Compose Compiler 内嵌一并钉死,给出 NotedX 完整可复制的构建脚本。

## 手动验证

- [ ] 装好 Android Studio Koala (2024.1.1) 或更新版本;打开 SDK Manager 确认 Android 15 (API 35) Platform 与 Build-Tools 35.0.0+ 已下载。
- [ ] 用 "Empty Activity (Compose)" 模板新建 NotedX 项目,minSdk = 26,target/compile SDK = 35,语言 Kotlin。
- [ ] 把第 3 节的三段代码替换到模板生成的对应文件,`./gradlew :app:assembleDebug` 跑通,产物在 `app/build/outputs/apk/debug/app-debug.apk`。
- [ ] 启动一台 API 26+ 模拟器,`./gradlew :app:installDebug` 安装,Launcher 上看到 "NotedX" 图标,点开后显示 "NotedX online"。
- [ ] `adb shell dumpsys package com.notedx | grep -E "targetSdk|minSdk"` 输出包含 `minSdk=26 targetSdk=35`。
- [ ] 在 `MainActivity.kt` 里 Preview 面板能渲染 `NotedXAppPreview`,不需要启动模拟器。
- [ ] 阅读 Android 官方文档 *Behavior changes: Apps targeting Android 15* 全文一次,至少知道 edge-to-edge / FGS Type / 16 KB page size 三项标题。
