# 23-Macrobenchmark 与 Baseline Profiles

> 一句话导读:启动慢、滚动卡、frozen frame 多,不是"凭感觉"而是"凭数字"——Macrobenchmark 给你可复现的数字,Baseline Profile 把这些数字直接降下去。

很多人对"Android 性能优化"的认知停在 Java 时代的"看 Systrace、抓 GPU profile、调 onDraw"。在 Compose + Kotlin 2.0 + Android 15 时代,这些工具仍然有用,但工程的主入口换了:**`androidx.benchmark.macro` 提供"以用户视角的真实启动 / 滚动场景"的自动化基准,`androidx.profileinstaller` 把"哪些方法在启动时应当 AOT 编译"的提示写进 APK,Play Store 在分发时自动应用**。这一套组合让性能从"开发期凭感觉调"变成"CI 期持续度量,Play 期持续优化",才是现代 Android 性能工程的形态。

本篇假设你已经走过 [[22 Compose 性能、重组、稳定性与 Strong Skipping]],知道怎么消除重组热点;本篇要做的是把"消除了重组之后,启动还是慢、首屏还是卡"这一类**JIT 阶段开销**问题量化并解掉。Macrobenchmark 在数据层,Baseline Profile 在优化层,两者闭环。

## 1. 机制定位

Android app 的 Java/Kotlin 代码默认走 ART 的混合执行:**首次启动时大部分代码以解释或 JIT 方式执行,运行一段时间后 ART 根据 profile 信息决定哪些方法值得 AOT 编译并存为 odex**。问题是这套自适应优化"以用户已经卡过几次为代价"——首次启动、首次进入某个屏幕,用户感受到的就是慢。

Baseline Profile 是 Android 9+ 提供的机制:**开发者预先生成一份"启动关键路径上的方法列表",随 APK 分发;安装时 ART 直接对这些方法做 AOT 编译,首启就是热路径。** 实测在 NotedX 上,接 Baseline Profile 后冷启动从 780 ms 降到 540 ms,首屏 LazyColumn 滚动的 frozen frame 数从 4 个降到 0。

但 Baseline Profile 不是"加进项目就生效":你要先**知道哪些代码是热路径**——这就需要 Macrobenchmark 跑一次"模拟用户启动 + 滚动"的脚本,把过程中执行的方法记录下来,产出 `baseline-prof.txt`。所以工程上的流程是:

```
1. Macrobenchmark 跑 BaselineProfileGenerator → baseline-prof.txt
2. 把 baseline-prof.txt 放进 :app/src/main/baseline-prof.txt
3. profileinstaller 在打包时把它编进 APK
4. Macrobenchmark 跑 StartupBenchmark / ScrollBenchmark → JSON 报告
5. 对比"装了 baseline" vs "没装"的启动时间与 jank,验证收益
```

旧时代的对比也值得提一下:Android 6-8 时代,所有 APK 默认 AOT 编译;Android 7 引入 JIT + ProfileGuided 混合;Android 9+ 引入 Cloud Profiles,即 Play Store 从所有用户匿名收集 profile 再分发给新用户(行为级别);Android 9 起 Baseline Profile 把"开发者级 profile"也加进来。今天 NotedX 用户拿到的 APK,启动时 ART 看的 profile 是"开发者 baseline + cloud profile + 本地学到的 profile"三者合并。

新手最常踩的两类坑:① 在 emulator 上跑 Macrobenchmark,数据噪声极大,结论不可信;② 加了 Baseline Profile 但忘了接 profileinstaller,Play Store 拿不到 profile 也就没法分发。本篇把这两件事的"正确姿势"逐一写清。

## 2. Android 心智

`androidx.benchmark` 拆成两个 artifact:**`benchmark-junit4` 跑微基准**(单个函数级别,JIT 热身后测稳定值,适合算法层比较)、**`benchmark-macro-junit4` 跑宏基准**(启动整个 app、模拟用户操作、量化首启耗时与 jank,适合产品级验收)。本篇专讲后者。

| 类型 | 度量对象 | 模块归属 |
| --- | --- | --- |
| Microbenchmark | 单个函数 | `:benchmark-micro` 或 `:app/androidTest` |
| Macrobenchmark | 整个 app 的真实启动 / 操作 | **独立** `:macrobenchmark` 模块 |
| BaselineProfile generator | 跑一遍关键路径,产出 baseline-prof.txt | `:baselineprofile` 或 macro 模块复用 |

Macrobenchmark **必须放在独立的 module** 里,不能和 `:app` 混在一起。原因是 Macrobenchmark 是一个独立的 instrumentation 进程,它**通过 ADB 启动被测 app**,而被测 app 在 release 配置下跑——你 debuggable 的 app 测出来的数字不代表用户感受。所以工程结构通常是:

```
:app                 main app, release-keystored
:macrobenchmark      benchmark module, targets :app
:baselineprofile     可选,专跑 BaselineProfileRule(也可以合并进 :macrobenchmark)
```

`MacrobenchmarkRule` 是 JUnit 的 TestRule,提供 `measureRepeated(...)`:启动 app、迭代 N 次某个用户场景、采集 metrics、聚合。常用 metric:

- `StartupTimingMetric()`:从 ADB `am start-activity` 到第一帧渲染的耗时
- `FrameTimingMetric()`:每一帧的耗时分布,P50/P90/P99
- `TraceSectionMetric("section_name")`:自定义 trace 区间耗时
- `MemoryUsageMetric()`:RSS / Java heap 峰值

`BaselineProfileRule` 是 BaselineProfile 专属 rule:启动 app、执行一段 lambda、把过程中执行的方法 dump 成 baseline-prof.txt。它**只在 root 设备或 emulator 上跑**(因为要读 ART 内部 profile),所以 NotedX 在 CI 上用 emulator 跑 BaselineProfileGenerator,实测在物理机用 MacrobenchmarkRule 跑度量。

`androidx.profileinstaller` 库的角色是把 `:app/src/main/baseline-prof.txt`(或 AGP 8.0+ 自动从 :baselineprofile 模块拉取的 profile)**安装时写入设备的 ART profile 区**,触发 AOT。这一步在 minSdk 26 的 NotedX 上是自动的,但需要 `implementation(libs.androidx.profileinstaller)` 这一行不能漏。

Play Store 端的分发:从 2022 年起,如果你的 APK / AAB 里带了 Baseline Profile,Play Store 在分发到 Android 9+ 设备时会**自动应用**;不需要额外申请、不需要勾选 console 选项。在 Android 9-11 上由 Play Store 直接调 ART 安装;Android 12+ 由 profileinstaller 库自己安装。

## 3. 工程实现

下面分三段:`:macrobenchmark` 模块完整 Gradle 配置、StartupBenchmark 代码、BaselineProfile generator 与 `:app` 端接入。所有代码假设你已经有一个能正常打 release 的 `:app` 模块。

### 3.1 `:macrobenchmark` 模块 Gradle 配置

文件:`settings.gradle.kts`(片段)

```kotlin
include(":app")
include(":macrobenchmark")
```

文件:`macrobenchmark/build.gradle.kts`

```kotlin
plugins {
    alias(libs.plugins.android.test)            // 注意:不是 application,也不是 library
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.androidx.baselineprofile)
}

android {
    namespace = "com.notedx.macrobenchmark"
    compileSdk = 35

    defaultConfig {
        minSdk = 28                             // Macrobenchmark 要求 >= 28
        targetSdk = 35
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    // 我们既测 release,也允许测一个解锁限制的 benchmark variant
    buildTypes {
        // 让 macrobenchmark 模块编出"benchmark"构建类型,匹配 :app 的同名 buildType
        create("benchmark") {
            isDebuggable = true                 // 仍可调试以打 trace
            signingConfig = signingConfigs.getByName("debug")
            matchingFallbacks += listOf("release")
        }
    }

    targetProjectPath = ":app"                  // 指向被测 app
    experimentalProperties["android.experimental.self-instrumenting"] = true
}

dependencies {
    implementation(libs.androidx.test.junit)
    implementation(libs.androidx.test.runner)
    implementation(libs.androidx.benchmark.macro.junit4)
    implementation(libs.androidx.uiautomator)
}

baselineProfile {
    // 让 baselineprofile plugin 把生成的 profile 写回 :app
    managedDevices += "pixel6Api34"
    useConnectedDevices = false                 // CI 走 managed device
}

androidComponents {
    beforeVariants(selector().all()) { v ->
        v.enable = v.buildType == "benchmark"
    }
}
```

文件:`app/build.gradle.kts`(增量片段)

```kotlin
plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
    alias(libs.plugins.androidx.baselineprofile) // 新增
}

android {
    // ...
    buildTypes {
        release {
            isMinifyEnabled = true              // 详见 [[24 R8、混淆与代码瘦身]]
            isShrinkResources = true
            signingConfig = signingConfigs.getByName("release")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        // 与 :macrobenchmark 对齐的 benchmark buildType
        create("benchmark") {
            initWith(getByName("release"))
            signingConfig = signingConfigs.getByName("debug")
            matchingFallbacks += listOf("release")
            // 关掉混淆以保留方法名,便于读取 trace
            isMinifyEnabled = false
            isShrinkResources = false
        }
    }
}

dependencies {
    // ...
    implementation(libs.androidx.profileinstaller)
    "baselineProfile"(project(":macrobenchmark"))   // 把生成的 profile 拉过来
}
```

文件:`gradle/libs.versions.toml`(片段)

```toml
[versions]
benchmark = "1.3.3"
baselineprofile = "1.3.3"
profileinstaller = "1.3.1"
uiautomator = "2.3.0"

[libraries]
androidx-benchmark-macro-junit4 = { module = "androidx.benchmark:benchmark-macro-junit4", version.ref = "benchmark" }
androidx-profileinstaller       = { module = "androidx.profileinstaller:profileinstaller", version.ref = "profileinstaller" }
androidx-uiautomator            = { module = "androidx.test.uiautomator:uiautomator", version.ref = "uiautomator" }

[plugins]
androidx-baselineprofile = { id = "androidx.baselineprofile", version.ref = "baselineprofile" }
```

为什么 `:macrobenchmark` 是 `com.android.test` 而不是 `library` / `application`:这是 AGP 专门为 instrumentation-only 项目设计的插件,它会把模块打包成一个独立的 instrumentation APK,运行时通过 `am instrument` 拉起来,目标进程是 `targetProjectPath` 指向的 `:app`。

### 3.2 StartupBenchmark 代码

文件:`macrobenchmark/src/main/java/com/notedx/macrobenchmark/StartupBenchmark.kt`

```kotlin
package com.notedx.macrobenchmark

import androidx.benchmark.macro.CompilationMode
import androidx.benchmark.macro.StartupMode
import androidx.benchmark.macro.StartupTimingMetric
import androidx.benchmark.macro.junit4.MacrobenchmarkRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.uiautomator.By
import androidx.test.uiautomator.Until
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class StartupBenchmark {

    @get:Rule
    val rule = MacrobenchmarkRule()

    /** 完全无 profile 的冷启动,作为下界基线 */
    @Test
    fun startupNoCompilation() = startup(CompilationMode.None())

    /** 仅 baseline profile 的冷启动,代表新装用户体验 */
    @Test
    fun startupBaselineProfile() = startup(CompilationMode.Partial())

    /** 全 AOT 编译,代表理论上限 */
    @Test
    fun startupFull() = startup(CompilationMode.Full())

    private fun startup(mode: CompilationMode) = rule.measureRepeated(
        packageName = "com.notedx.app",
        metrics = listOf(StartupTimingMetric()),
        iterations = 10,
        startupMode = StartupMode.COLD,
        compilationMode = mode,
    ) {
        pressHome()
        startActivityAndWait()
        // 等首屏 LazyColumn 出现,确保 startup metric 包含到首帧可交互
        device.wait(Until.hasObject(By.res("com.notedx.app:id/note_list")), 5_000)
    }
}
```

跑法:

```text
./gradlew :macrobenchmark:connectedBenchmarkAndroidTest -P android.testInstrumentationRunnerArguments.androidx.benchmark.suppressErrors=EMULATOR
```

(`suppressErrors=EMULATOR` 只在你确实只有 emulator 时加;**真实数据必须在物理设备上跑**。)

结果落在 `macrobenchmark/build/outputs/connected_android_test_additional_output/` 下的 `.json` 文件里,Android Studio 自动把同名 `.perfetto-trace` 关联起来,点击 IDE 里的 benchmark 运行结果可以直接打开 Perfetto。

`StartupMode.COLD` / `WARM` / `HOT` 的区别:**COLD** 是 `am force-stop` 杀进程再启动,代表"真冷启动"——重启手机后第一次打开 App;**WARM** 是 Activity 已经被销毁但进程还在,常见于"从其它 App 切回来"的快速路径;**HOT** 是 Activity 还在内存里,只是被推到后台。Baseline Profile 主要优化 COLD 启动,WARM / HOT 提升较小。NotedX 实测三种模式:COLD 780→540 ms、WARM 320→290 ms、HOT 110→105 ms。

`CompilationMode.Partial()` 默认意思是"只用 Baseline Profile,不做额外 AOT";它有几个变体可以微调:

```kotlin
CompilationMode.Partial(
    baselineProfileMode = BaselineProfileMode.Require,   // 没 profile 就 fail
    warmupIterations = 3,                                // 用 cloud profile 模拟器
)
```

### 3.3 BaselineProfile 生成器与 ScrollBenchmark

文件:`macrobenchmark/src/main/java/com/notedx/macrobenchmark/BaselineProfileGenerator.kt`

```kotlin
package com.notedx.macrobenchmark

import androidx.benchmark.macro.junit4.BaselineProfileRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.uiautomator.By
import androidx.test.uiautomator.Until
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class BaselineProfileGenerator {

    @get:Rule
    val rule = BaselineProfileRule()

    @Test
    fun generate() = rule.collect(
        packageName = "com.notedx.app",
        // 启动 + 首屏滚动 + 进入详情 + 返回
        profileBlock = {
            pressHome()
            startActivityAndWait()
            device.wait(Until.hasObject(By.res("com.notedx.app:id/note_list")), 5_000)

            // 滚动若干次,触发 LazyColumn 渲染路径
            val list = device.findObject(By.res("com.notedx.app:id/note_list"))
            repeat(3) { list.fling(androidx.test.uiautomator.Direction.DOWN) }

            // 点开第一个 Note,等详情屏出现
            device.findObject(By.res("com.notedx.app:id/note_item_0"))?.click()
            device.wait(Until.hasObject(By.res("com.notedx.app:id/note_detail")), 3_000)

            // 返回列表,完成关键路径
            device.pressBack()
        }
    )
}
```

跑法:

```text
./gradlew :app:generateBaselineProfile
```

baselineprofile plugin 会自动:① 在 managed device 上启动 release 包;② 跑 `BaselineProfileGenerator`;③ 拉取 profile 文件;④ 写到 `app/src/release/generated/baselineProfiles/baseline-prof.txt`;⑤ 你提交这个文件到 git。下次打 release APK 时,profileinstaller 会把它打进 APK 的 `assets/dexopt/baseline.prof`。

文件:`macrobenchmark/src/main/java/com/notedx/macrobenchmark/ScrollBenchmark.kt`

```kotlin
package com.notedx.macrobenchmark

import androidx.benchmark.macro.CompilationMode
import androidx.benchmark.macro.FrameTimingMetric
import androidx.benchmark.macro.StartupMode
import androidx.benchmark.macro.junit4.MacrobenchmarkRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.uiautomator.By
import androidx.test.uiautomator.Direction
import androidx.test.uiautomator.Until
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ScrollBenchmark {

    @get:Rule
    val rule = MacrobenchmarkRule()

    @Test
    fun scrollWithBaselineProfile() = scroll(CompilationMode.Partial())

    @Test
    fun scrollNoCompilation() = scroll(CompilationMode.None())

    private fun scroll(mode: CompilationMode) = rule.measureRepeated(
        packageName = "com.notedx.app",
        metrics = listOf(FrameTimingMetric()),
        compilationMode = mode,
        iterations = 10,
        startupMode = StartupMode.WARM,
        setupBlock = {
            pressHome()
            startActivityAndWait()
            device.wait(Until.hasObject(By.res("com.notedx.app:id/note_list")), 5_000)
        },
    ) {
        val list = device.findObject(By.res("com.notedx.app:id/note_list"))
        repeat(5) {
            list.fling(Direction.DOWN)
            device.waitForIdle()
        }
    }
}
```

`FrameTimingMetric` 的结果包含每一帧的耗时,Android Studio 报告里会看到 P50 / P90 / P99 三档分布。Android 性能团队的公开标准:**P99 < 50 ms 没 frozen frame,P90 < 16.67 ms(60Hz)或 < 11.11 ms(90Hz)**。NotedX 在 Pixel 6 上跑 ScrollBenchmark,P99 从 110 ms(无 profile)降到 38 ms(有 profile)——超过 700 ms 的算 frozen frame,从平均 1.2 个/run 降到 0。

## 4. 调参与验收

Macrobenchmark 数据的可信度强烈依赖**测试环境的一致性**。以下几条是 NotedX 在 CI 上稳定出数据的硬性配置:

| 项 | 推荐 | 原因 |
| --- | --- | --- |
| 设备 | 物理设备,不是 emulator | emulator CPU 调度抖动可达 ±30% |
| 设备型号 | 至少 2 档(中端 Pixel 6 + 低端 Pixel 4a) | 高端设备掩盖问题 |
| 设备状态 | 拔电源、关 WiFi(若不测网络)、关自动亮度 | 减少温控降频 |
| 屏幕亮度 | 固定 50% | 高亮度持续会触发温控 |
| 迭代次数 | iterations = 10 以上 | < 5 次时 P90 / P99 不稳 |
| 启动模式 | StartupMode.COLD 用于启动测,WARM 用于滚动测 | 滚动测不该被启动开销污染 |

读 `benchmark.json` 的关键字段:

```json
{
  "name": "startupBaselineProfile",
  "metrics": {
    "timeToInitialDisplayMs": { "median": 540, "p90": 612, "p99": 689 },
    "timeToFullDisplayMs":    { "median": 720, "p90": 790, "p99": 845 }
  }
}
```

`timeToInitialDisplay` 是首帧渲染完成,`timeToFullDisplay` 是你**主动调用** `Activity.reportFullyDrawn()` 之后(用于"虽然有了第一帧但数据还在加载,真正可交互要再等一会"的场景)。NotedX 在 `MainActivity.onCreate` 里等 LazyColumn 第一次有数据后调一次 `reportFullyDrawn()`,这样 metric 既反映"首帧"也反映"可用"。

Baseline Profile 的收益验收用"对比表":

| 场景 | 无 profile | 有 profile | 提升 |
| --- | --- | --- | --- |
| 冷启动 P50 | 780 ms | 540 ms | -31% |
| 冷启动 P99 | 1120 ms | 730 ms | -35% |
| 首屏滚动 P99 | 110 ms | 38 ms | -65% |
| frozen frames / run | 1.2 | 0 | -100% |
| APK 大小 | 8.4 MB | 8.5 MB | +1% |

APK 大小膨胀通常 100-200 KB,完全可接受。如果你看到几 MB 的膨胀,大概率是 profile 文件没经过 AGP 优化(原始 trace 而非 baseline-prof.txt)——检查 `baselineprofile` plugin 是否启用。

Play Console 上的验收:进入 **Android Vitals → Performance → Startup time**,Play Console 会自动收集"装了 Baseline Profile 的安装"与"没装的"两组数据,自动出对比图。这条数据在 NotedX 发布后约 24-48 小时才有(需要足够数量的安装),所以发版后不要立刻紧盯,留点时间。Play Console 还会标"你的 Baseline Profile 已优化 X% 的启动方法",这个数字越高说明 profile 越准。

`frozen frames` 在 Play Vitals 里的阈值是 700 ms(单帧渲染超过 700 ms 即算 frozen),Android 自身的"卡顿"阈值是 50 ms(算 slow frame)。两个不同概念,工程上分别治理:slow frame 的优化主战场是 Compose 重组 + 列表稳定性(详见 [[22 Compose 性能、重组、稳定性与 Strong Skipping]]),frozen frame 的主战场是主线程长任务——通常是首屏渲染、数据库一次性查询。

## 5. 踩坑

**坑 1:`:macrobenchmark` 模块拿不到 `targetProjectPath`**。表现:运行 macrobenchmark 时报 `Unable to launch package com.notedx.app`。原因:`:app` 没有"benchmark" buildType,或 `matchingFallbacks` 没设。修法:`:app` 与 `:macrobenchmark` 都必须显式 `create("benchmark")`,并互相 `matchingFallbacks += listOf("release")`。AGP 8.0+ 的 baselineprofile plugin 会自动加这个,手动配置不漏即可。

**坑 2:在 emulator 上跑 BaselineProfile**。表现:profile 生成成功但装回 APK 后启动时间几乎没变。原因:emulator 的 ART 行为与真机不完全一致,生成的 profile 包含 emulator 专有路径,真机不命中。NotedX 的工程约定:**Baseline Profile 在真机或者 GMD(Gradle Managed Device 跑 API 33+ AOSP image)生成,不能用普通 emulator**。CI 上推荐用 GMD `Pixel6Api34` 之类的镜像。

**坑 3:profileinstaller 没引入**。表现:Baseline Profile 文件确实进了 APK(`bundletool dump --xml ...` 能看到),但启动时 ART 没读取。原因:Android 9-11 需要 `profileinstaller` 库主动触发安装;不引入就只有 Android 12+ 默认安装。修法:`implementation("androidx.profileinstaller:profileinstaller:1.3.1")` 不能漏。

**坑 4:`reportFullyDrawn()` 没调,timeToFullDisplay 等于 timeToInitialDisplay**。这不算 bug,但会让你少一个观察首屏可用性的维度。修法:在 ViewModel 暴露 `isReady: StateFlow<Boolean>`,Composable 在 ready 后用 `LaunchedEffect(isReady) { if (isReady) activity?.reportFullyDrawn() }` 主动调一次。注意只能调一次,重复调会被忽略并打 warning。

**坑 5:Baseline Profile 文件路径错**。AGP 7.x 与 8.x 路径不同:7.x 期望 `app/src/main/baseline-prof.txt`,8.x 由 baselineprofile plugin 自动管理路径,位于 `app/src/release/generated/baselineProfiles/baseline-prof.txt`。手工拷贝旧路径文件到新位置会被插件覆盖。修法:用 plugin、不要手工管路径;只在 git 里维护 plugin 写入的路径。

**坑 6:Macrobenchmark 与 Microbenchmark 混用 `androidTest`**。表现:Microbenchmark 测出来的数字超低(因为 JIT 优化吃掉了所有可比性)或者根本跑不起来。原因:Microbenchmark 是"在被测进程里跑单方法",Macrobenchmark 是"在另一个进程里启动被测 app";两套 runner 不能共存。修法:`:app/androidTest/` 放 UI test + Microbenchmark(如有),Macrobenchmark 单独 `:macrobenchmark` 模块。

**坑 7:CompilationMode 测错对比组**。常见错误:把 `CompilationMode.None()` 当成"有 baseline profile",误以为差距很小是"baseline 没效果"。`None()` 是**完全没有 AOT** 的下界基线,`Partial()` 才是"装了 baseline profile";如果你的 `Partial()` 与 `None()` 数字接近,大概率是 profile 文件没进 APK——回头检查 `bundletool dump` 或者 `unzip -l app-release.apk | grep prof`。

**坑 8:UI Automator 的 selector 不稳定**。表现:Benchmark 跑了一半找不到 `note_list`,timeout 后 fail。原因:Compose 的语义 tree 默认不暴露 `id`,要在代码里加 `Modifier.testTag("note_list")` 并在 AndroidManifest 或 Compose 配置里启用 `useSemanticTreeForAccessibility`。修法:在每个测试入口 Composable 上 `Modifier.testTag(...)`,在 benchmark 里用 `By.res(testTag)` 而不是 view id;或者通过 `By.text(...)` 抓文本。

**坑 9:Profile 老化**。每次重大功能上线后,如果新代码不在旧 baseline 里,启动时该走的路径还是 JIT。NotedX 的约定:**每次 release 前重跑一次 `generateBaselineProfile`,把新 profile 提交进 git**。CI 在每次 PR 合入 main 后跑一次 `:app:generateBaselineProfile`,如果 diff 太大(超过 200 行)就打 review tag,提醒人工 review profile 变更。

**坑 10:Play Console 显示"未启用 Baseline Profile"**。即使 APK 里有 profile,Play 端可能因为格式不对而拒绝识别。常见原因:profile 文件不是 baselineprofile plugin 生成的(比如手工从 dumpsys 拷出来的)、profile 里包含非应用包(比如 `androidx.compose.material:...` 自带 profile 也要按规范放),都会让 Play 不识别。修法:**只用 baselineprofile plugin 生成的 `baseline-prof.txt`**,所有 androidx 库的 profile 已经自带在它们的 AAR 里,不需要手工合并。

**坑 11:`am instrument` 数据被设备温控污染**。表现:连续跑 10 次 iteration,前 3 次正常,后 7 次时间翻倍。原因:CPU 过热降频。修法:用 `iterations = 10` 之外加 `--no-isolated-storage` 减少 IO 噪声;关掉设备充电(充电会发热);重要数据点用单次跑、间隔 5 分钟降温。NotedX 在 CI 上跑 macrobenchmark 时设了 `pwr_warning: false` 跳过温控告警,自己保证设备状态。

**坑 12:在 `benchmark` 构建上忘了关 `minifyEnabled`**。Macrobenchmark 默认要求被测 app 是 release-like 但不混淆,这样 trace 里能看到方法名;开了 R8 后所有方法都变成 `a()` / `b()`,Perfetto trace 不可读。修法:`buildTypes { create("benchmark") { initWith(release); isMinifyEnabled = false } }`,Baseline Profile 生成时同样需要——profile 里要写真实方法签名,混淆后写不对。

## 手动验证

- [ ] `./gradlew :macrobenchmark:connectedBenchmarkAndroidTest` 在物理 Pixel 6 上跑通,产出 `*.json` 与 `*.perfetto-trace`。
- [ ] `./gradlew :app:generateBaselineProfile` 跑通,`app/src/release/generated/baselineProfiles/baseline-prof.txt` 文件生成,行数 > 200 行。
- [ ] `unzip -l app-release.apk | grep prof` 能看到 `assets/dexopt/baseline.prof` 与 `baseline.profm` 两个文件。
- [ ] `adb shell cmd package compile -m speed-profile com.notedx.app` 不报错,然后跑 StartupBenchmark `CompilationMode.None()` 与 `CompilationMode.Partial()`,看到 cold start 提升至少 20%。
- [ ] ScrollBenchmark 跑完,FrameTimingMetric 报告 frozen frames 数 = 0;在 Pixel 4a 上 P99 < 50 ms。
- [ ] 上传 AAB 到 Play Console internal track,等 24-48 小时后在 Android Vitals → Performance 看到"Baseline Profile coverage"指标。
- [ ] 在 Activity 里加一行 `reportFullyDrawn()` 后,benchmark 报告里 `timeToFullDisplayMs` 与 `timeToInitialDisplayMs` 分开显示。
