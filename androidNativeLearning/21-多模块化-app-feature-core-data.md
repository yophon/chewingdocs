# 21-多模块化:`:app` / `:feature-*` / `:core-*` / `:data`

> 一句话导读:多模块不是"把代码切成几块再说",它是用 Gradle 模块边界把"谁能看见谁、谁能改谁、谁的改动会让谁重新编译"显式化的工程手段——边界画对,增量构建快、循环依赖灭、团队协作清晰;画错,只是把单体代码搬进了几个文件夹而已。

第 16-20 篇([[androidNativeLearning 16]] - [[androidNativeLearning 20]])把 NotedX 从单 Activity 数据闭环扩展到了系统能力闭环。到第五层,问题从"能不能跑"切换成"能不能维护":一个团队 5 人协作时, `:app` 模块膨胀到 200+ Kotlin 文件、构建一次 90 秒、改个图标 30 个 feature 全编译——这是不分模块的代价。21 篇要回答的是工程师视角的多模块化:

- 按层(`presentation` / `domain` / `data`)切还是按 feature(`feature-note` / `feature-todo`)切?为什么必须**两者结合**而不是二选一?
- 模块依赖图怎么画才不死循环?`api` 和 `implementation` 在 `dependencies {}` 里到底差什么?
- `build-logic` 与 convention plugin 是什么?为什么 30 个模块需要它,5 个模块不需要?
- Version Catalogs(`libs.versions.toml`)在跨模块时怎么共享?
- DI(Hilt)在多模块里在哪一层注入?`@Module` 应不应该跨模块拆?

读完后你应当能把第 20 篇结束时仍然是单模块的 NotedX 重构为"`:app` + 3 个 `:feature-*` + 4 个 `:core-*` + `:data`"的多模块工程,且增量构建从 90s 降到 15s 量级。本篇是为第 22-25 篇(Compose 性能 / Macrobenchmark / R8 / 启动优化)做地基——后者所有"模块级测量与优化"都假定你已经把模块切对了。

## 1. 机制定位

### 单模块在什么时候必然崩

新工程头 3 个月,所有人都在 `:app` 里写代码非常爽——你 import 任何类都没限制,什么都能直接调。这种"无边界"的舒适感在两个维度同时反噬:

**编译速度**。Gradle 增量构建以 module 为粒度做缓存。改 `:app` 里任意一个 Kotlin 文件,整个 `:app` 模块都会重新过一遍 Kotlin 编译 + KSP + R8(release 时)。文件多到几百以后,IDE 改一行代码、点 Run、等 30 秒、模拟器才出来,迭代节奏完全垮掉。

**心智负担**。所有 ViewModel / Repository / API 都在同一 package 树下,新人接手要看完整本书才能改一个按钮。改一个底层 Repository 的方法签名会让一堆 ViewModel 飘红,你不知道该改哪几个。Java 时代 Eclipse Workspace 多 project + Maven 子模块是同样的痛——只是当时大家忍了。

**团队协作冲突**。两人改 `:app/build.gradle.kts` 同一个版本号,合并冲突一周一次很正常。Compose 的代码风格也会"染色"——一个人喜欢用 `LazyColumn`,一个人喜欢自定义 `Layout`,半年后代码风格灾难。

工程上的解法不是"代码写得整齐点",而是用模块边界把这件事**强制**化:

- 边界 = 编译单元 = Gradle module。
- 一个模块改了,只重新编译它**和依赖它的下游模块**,不依赖它的模块缓存命中。
- 模块对外暴露 = `api` 依赖的接口集合;`implementation` 的依赖不传递,改了不会让上游重新编译。
- 模块间循环依赖 Gradle 直接 fail,逼你设计清楚谁依赖谁。

### 按层 vs 按 feature 的二维切法

一种常见错误是只按层切:

```
:presentation    -- 所有 ViewModel / Compose UI
:domain          -- 所有 UseCase
:data            -- 所有 Repository / Room / Retrofit
```

短期看清爽,实际灾难。原因:每个 feature 横跨三层,改一个"待办列表的导出 CSV"功能,你要在 `:presentation` / `:domain` / `:data` 三个模块都改文件,跨模块跳转、提 PR 时审查者要在三个 review 里来回切。一个 feature 的"完整能力"无法被任何一个模块独立提供。**层不是模块边界,层是模块内部的代码组织手段**。

只按 feature 切也不行:

```
:feature-note
:feature-todo
:feature-attachment
```

会出现两个 feature 都想用"用户头像下载缓存"——重复实现两份;或者一个 feature 引用另一个 feature 的 ViewModel——耦合开始疯长。**feature 之间天然有共享内容,这些内容必须有归宿。**

工程实践的答案是**二维切法**:

- **横向按层**:`:core-*`(技术能力,跨 feature 通用)、`:data`(数据访问,跨 feature 共享 Repository)。
- **纵向按 feature**:`:feature-note` / `:feature-todo` 等(每个 feature 自包含 UI + ViewModel + Navigation 路由)。
- `:app` 在最上层,只做装配(注入 + Navigation 入口)。

依赖方向严格:`:app` → `:feature-*` → `:core-*` / `:data`,绝不反向。两个 `:feature-*` 之间**不直接互相依赖**(若要跨 feature 跳转,通过 `:core-navigation` 暴露的路由 API)。

### convention plugin:把"重复 build.gradle.kts"收敛

10 个模块各自一份 `build.gradle.kts`,每个都写 `android { compileSdk = 35; defaultConfig { ... } }`,改一次 compileSdk 要改 10 处。convention plugin 是 Gradle 把"build 脚本本身"模块化的方案——`build-logic` 是一个特殊的 included build,里面定义一组 plugin id(`notedx.android.application` / `notedx.android.library` / `notedx.android.library.compose`),模块只需要 `plugins { id("notedx.android.library.compose") }` 就继承所有规则。

这一招在 3-5 个模块时是 over-engineering,15+ 个模块时是救命稻草。NotedX 主线计划 9-11 个模块,刚好处在 convention plugin 收益开始大于成本的临界点。

### Version Catalogs 跨模块

`gradle/libs.versions.toml` 是 Gradle 7.4+ 推出的依赖版本中心化方案,每个模块写 `implementation(libs.androidx.compose.material3)` 而非 `"androidx.compose.material3:material3:1.3.0"`。Gradle 自动注入 `libs` 这个 Catalog 对象到每个模块的 `build.gradle.kts` 里(包括 `build-logic` 内部),无需任何额外配置。这是多模块工程升级依赖时最大的减负来源——升 Compose BOM 改一处 `.toml`,15 个模块同步生效。

## 2. Android 心智

### NotedX 模块依赖图

```
            +-----------------+
            |      :app       |   主线入口
            +--------+--------+
                     |
        +------------+------------+------------+
        |            |            |            |
        v            v            v            v
+--------------+ +--------------+ +-------------+ +---------------+
| :feature-note| | :feature-todo| | :feature-   | | :feature-     |
|              | |              | |  attachment | |  settings     |
+------+-------+ +------+-------+ +------+------+ +-------+-------+
       |                |                |                |
       |                |                |                |
       +------+---------+------+---------+------+---------+
              |                |                |
              v                v                v
       +-------------+  +-------------+  +-----------------+
       |   :data     |  |   :core-    |  |   :core-design  |
       |             |  |   common    |  |   (M3 Theme,   |
       +------+------+  +------+------+  |    Typography)  |
              |                |          +-----------------+
              v                v
       +-------------+  +------------------+
       | :core-      |  | :core-navigation |
       | network     |  +------------------+
       +-------------+
              |
              v
       (OkHttp + Retrofit
        + kotlinx.serialization)
```

层级与边界:

- **`:app`**:Hilt `@HiltAndroidApp` Application、`MainActivity`、根 `NavHost`、全局崩溃捕获。它依赖**所有**的 `:feature-*`,把它们装配成完整应用。
- **`:feature-*`**:一个完整业务能力。每个 feature 内部分 ViewModel / Compose Screen / 局部 UseCase。feature 之间**不直接依赖**,通过 `:core-navigation` 暴露的路由跳转。
- **`:data`**:Repository / Room Database / DataSource。所有 feature 共享。它依赖 `:core-network` 取 Retrofit,依赖 `:core-common` 取 model。
- **`:core-network`**:Retrofit / OkHttp / Interceptor / Auth Token 管理。被 `:data` 依赖。
- **`:core-common`**:`Result<T>` / Error 类型 / Dispatcher 抽象 / Logger / 通用扩展函数。被所有人依赖。
- **`:core-design`**:Material 3 主题、颜色、字体、自定义 Compose 组件库(`NotedXCard` / `NotedXButton`)。被所有 `:feature-*` 依赖。
- **`:core-navigation`**:`@Serializable` 路由定义(参考第 12 篇 [[androidNativeLearning 12]])。被 `:app` 和所有 `:feature-*` 依赖。
- **`:build-logic`**:included build,定义 convention plugin。不在 `settings.gradle.kts` 的 `include` 里,而是 `includeBuild("build-logic")`。

### `api` vs `implementation`

```kotlin
// :core-network/build.gradle.kts
dependencies {
    // 这条:Retrofit 的 Call/Response 类**会**对依赖 :core-network 的模块可见
    api(libs.retrofit.core)
    // 这条:OkHttp 是内部细节,:data 改不到 OkHttp 任何类
    implementation(libs.okhttp.client)
}
```

`api` 的语义是"传递依赖":`:data` 依赖 `:core-network`,因为 `api(retrofit)`,`:data` 里可以直接 `import retrofit2.Response`。`implementation` 的语义是"内部依赖":`:data` 看不到 `okhttp3.OkHttpClient`,即使 `:core-network` 用了。

工程意义:**`api` 的依赖会传递性触发上游模块重新编译**。比如 `:core-network` 的 `api(retrofit)` 升级一个 patch 版本,`:data` 和所有 `:feature-*` 全部要重编。所以原则是:

- **能用 `implementation` 就用 `implementation`**,只有当模块对外公开的接口里出现了那个库的类型时,才升级到 `api`。
- Compose / Hilt / Coroutines 这种"模块对外接口签名里就有"的(`Flow<T>` / `@Inject` / `@Composable`)只能 `api`。

不写 `api` / `implementation` 直接 `dependencies { compile(...) }` 是 Gradle 3.x 的老语法,2026 年已完全弃用。

### Hilt 在多模块里的注入边界

Hilt 的 `@Module` 可以放在任何模块,只要被 `@HiltAndroidApp` 的 Application 在 ClassPath 上能找到。NotedX 的实践:

- **`:data` 模块** 定义 `@Module DataModule` `@Provides` `NoteRepository` / `Database`。
- **`:core-network` 模块** 定义 `@Module NetworkModule` `@Provides` `Retrofit` / `OkHttpClient`。
- **`:feature-note` 模块** 用 `@HiltViewModel` 注入 `NoteRepository`,不需要写 `@Module`(因为 ViewModel 直接 `@Inject` 构造,Hilt 自动 wire)。
- **`:app` 模块** 写 `@HiltAndroidApp`。整个 App 的注入图在 `:app` 编译期一次构建。

这种分布式 `@Module` 的好处:模块自包含自己的依赖图,移除一个 feature 时所有相关 `@Provides` 也跟着走。代价:Hilt 的注入图错误(circular / missing binding)只在 `:app` 编译期暴露,要看到完整错误信息得 build `:app`。

### convention plugin 的运行时机

```
项目根 settings.gradle.kts
   includeBuild("build-logic")   <-- 把 build-logic 当作独立 Gradle 项目
   include(":app", ":feature-note", ...)

build-logic/
   build.gradle.kts            <-- 声明 java-gradle-plugin
   src/main/kotlin/
      AndroidApplicationConventionPlugin.kt
      AndroidLibraryConventionPlugin.kt
      AndroidLibraryComposeConventionPlugin.kt
      ...

各模块 build.gradle.kts
   plugins {
       id("notedx.android.library.compose")    <-- 应用 convention plugin
   }
```

Gradle 启动时,先编译 `build-logic`,把它产出的 plugin 注册到 plugin classpath;然后各模块在 plugins block 里通过 id 引用。这是 Gradle 7.4+ 推荐的"composite build for build logic"模式,比老的 `buildSrc/` 方案更可靠(`buildSrc` 改动会导致所有模块全量重编,`includeBuild` 不会)。

## 3. 工程实现

### 1) `settings.gradle.kts`

```kotlin
// settings.gradle.kts
pluginManagement {
    includeBuild("build-logic")   // 关键:把 build-logic 注册为 included build
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode = RepositoriesMode.FAIL_ON_PROJECT_REPOS
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "notedx"

include(":app")
include(":feature-note", ":feature-todo", ":feature-attachment", ":feature-settings")
include(":data")
include(":core-network", ":core-common", ":core-design", ":core-navigation")
```

`FAIL_ON_PROJECT_REPOS` 是关键的工程约束——禁止任何模块单独 `repositories { ... }`,所有依赖源在 settings 里统一。否则一个新人在某个模块加 `maven { url = "..." }` 会让构建脚本难以审计。

### 2) `gradle/libs.versions.toml`

```toml
[versions]
agp = "8.5.2"
kotlin = "2.0.21"
ksp = "2.0.21-1.0.28"
compose-bom = "2024.10.01"
hilt = "2.52"
room = "2.6.1"
retrofit = "2.11.0"
okhttp = "4.12.0"
serialization = "1.7.3"
coroutines = "1.9.0"
navigation = "2.8.4"
lifecycle = "2.8.7"
datastore = "1.1.1"
camerax = "1.4.0"

[libraries]
androidx-core-ktx = { module = "androidx.core:core-ktx", version = "1.13.1" }
androidx-activity-compose = { module = "androidx.activity:activity-compose", version = "1.9.3" }
androidx-compose-bom = { module = "androidx.compose:compose-bom", version.ref = "compose-bom" }
androidx-compose-ui = { module = "androidx.compose.ui:ui" }
androidx-compose-material3 = { module = "androidx.compose.material3:material3" }
androidx-compose-ui-tooling-preview = { module = "androidx.compose.ui:ui-tooling-preview" }
androidx-compose-ui-tooling = { module = "androidx.compose.ui:ui-tooling" }
androidx-lifecycle-runtime-compose = { module = "androidx.lifecycle:lifecycle-runtime-compose", version.ref = "lifecycle" }
androidx-navigation-compose = { module = "androidx.navigation:navigation-compose", version.ref = "navigation" }
androidx-datastore-preferences = { module = "androidx.datastore:datastore-preferences", version.ref = "datastore" }

hilt-android = { module = "com.google.dagger:hilt-android", version.ref = "hilt" }
hilt-compiler = { module = "com.google.dagger:hilt-compiler", version.ref = "hilt" }
hilt-navigation-compose = { module = "androidx.hilt:hilt-navigation-compose", version = "1.2.0" }

room-runtime = { module = "androidx.room:room-runtime", version.ref = "room" }
room-ktx = { module = "androidx.room:room-ktx", version.ref = "room" }
room-compiler = { module = "androidx.room:room-compiler", version.ref = "room" }

retrofit-core = { module = "com.squareup.retrofit2:retrofit", version.ref = "retrofit" }
retrofit-kotlinx-serialization = { module = "com.squareup.retrofit2:converter-kotlinx-serialization", version.ref = "retrofit" }
okhttp-client = { module = "com.squareup.okhttp3:okhttp", version.ref = "okhttp" }
okhttp-logging = { module = "com.squareup.okhttp3:logging-interceptor", version.ref = "okhttp" }

kotlinx-serialization-json = { module = "org.jetbrains.kotlinx:kotlinx-serialization-json", version.ref = "serialization" }
kotlinx-coroutines-core = { module = "org.jetbrains.kotlinx:kotlinx-coroutines-core", version.ref = "coroutines" }
kotlinx-coroutines-android = { module = "org.jetbrains.kotlinx:kotlinx-coroutines-android", version.ref = "coroutines" }

[plugins]
android-application = { id = "com.android.application", version.ref = "agp" }
android-library = { id = "com.android.library", version.ref = "agp" }
kotlin-android = { id = "org.jetbrains.kotlin.android", version.ref = "kotlin" }
kotlin-jvm = { id = "org.jetbrains.kotlin.jvm", version.ref = "kotlin" }
kotlin-serialization = { id = "org.jetbrains.kotlin.plugin.serialization", version.ref = "kotlin" }
compose-compiler = { id = "org.jetbrains.kotlin.plugin.compose", version.ref = "kotlin" }
ksp = { id = "com.google.devtools.ksp", version.ref = "ksp" }
hilt = { id = "com.google.dagger.hilt.android", version.ref = "hilt" }
```

### 3) `build-logic` 骨架

```kotlin
// build-logic/settings.gradle.kts
dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
    versionCatalogs {
        create("libs") {
            from(files("../gradle/libs.versions.toml"))  // 复用根 catalog
        }
    }
}
rootProject.name = "build-logic"
include(":convention")
```

```kotlin
// build-logic/convention/build.gradle.kts
plugins {
    `kotlin-dsl`
}

group = "com.example.notedx.buildlogic"

dependencies {
    compileOnly(libs.plugins.android.application.asProvider())
    compileOnly(libs.plugins.android.library.asProvider())
    compileOnly(libs.plugins.kotlin.android.asProvider())
    compileOnly(libs.plugins.compose.compiler.asProvider())
    // 把 catalog 中 plugin 注入为 implementation
    compileOnly("com.android.tools.build:gradle:${libs.versions.agp.get()}")
    compileOnly("org.jetbrains.kotlin:kotlin-gradle-plugin:${libs.versions.kotlin.get()}")
    compileOnly("org.jetbrains.kotlin:compose-compiler-gradle-plugin:${libs.versions.kotlin.get()}")
}

gradlePlugin {
    plugins {
        register("androidApplication") {
            id = "notedx.android.application"
            implementationClass = "AndroidApplicationConventionPlugin"
        }
        register("androidLibrary") {
            id = "notedx.android.library"
            implementationClass = "AndroidLibraryConventionPlugin"
        }
        register("androidLibraryCompose") {
            id = "notedx.android.library.compose"
            implementationClass = "AndroidLibraryComposeConventionPlugin"
        }
        register("androidFeature") {
            id = "notedx.android.feature"
            implementationClass = "AndroidFeatureConventionPlugin"
        }
        register("androidHilt") {
            id = "notedx.android.hilt"
            implementationClass = "AndroidHiltConventionPlugin"
        }
    }
}
```

```kotlin
// build-logic/convention/src/main/kotlin/AndroidLibraryConventionPlugin.kt
import com.android.build.gradle.LibraryExtension
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.kotlin.dsl.configure

class AndroidLibraryConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) = with(target) {
        with(pluginManager) {
            apply("com.android.library")
            apply("org.jetbrains.kotlin.android")
        }
        extensions.configure<LibraryExtension> {
            compileSdk = 35
            defaultConfig {
                minSdk = 26
                consumerProguardFiles("consumer-rules.pro")
            }
            compileOptions {
                sourceCompatibility = org.gradle.api.JavaVersion.VERSION_17
                targetCompatibility = org.gradle.api.JavaVersion.VERSION_17
            }
        }
        configureKotlin()
    }
}

private fun Project.configureKotlin() {
    tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile>().configureEach {
        compilerOptions {
            jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
            freeCompilerArgs.addAll(
                "-Xexplicit-api=strict",       // 强制 lib 的 public API 显式声明
                "-opt-in=kotlin.RequiresOptIn"
            )
        }
    }
}
```

```kotlin
// build-logic/convention/src/main/kotlin/AndroidLibraryComposeConventionPlugin.kt
import com.android.build.gradle.LibraryExtension
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.api.artifacts.VersionCatalogsExtension
import org.gradle.kotlin.dsl.configure
import org.gradle.kotlin.dsl.getByType
import org.gradle.kotlin.dsl.dependencies

class AndroidLibraryComposeConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) = with(target) {
        pluginManager.apply("notedx.android.library")
        pluginManager.apply("org.jetbrains.kotlin.plugin.compose")
        val libs = extensions.getByType<VersionCatalogsExtension>().named("libs")
        extensions.configure<LibraryExtension> {
            buildFeatures { compose = true }
        }
        dependencies {
            add("implementation", platform(libs.findLibrary("androidx-compose-bom").get()))
            add("implementation", libs.findLibrary("androidx-compose-ui").get())
            add("implementation", libs.findLibrary("androidx-compose-material3").get())
            add("implementation", libs.findLibrary("androidx-compose-ui-tooling-preview").get())
            add("debugImplementation", libs.findLibrary("androidx-compose-ui-tooling").get())
        }
    }
}
```

```kotlin
// build-logic/convention/src/main/kotlin/AndroidHiltConventionPlugin.kt
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.api.artifacts.VersionCatalogsExtension
import org.gradle.kotlin.dsl.dependencies
import org.gradle.kotlin.dsl.getByType

class AndroidHiltConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) = with(target) {
        pluginManager.apply("com.google.devtools.ksp")
        pluginManager.apply("com.google.dagger.hilt.android")
        val libs = extensions.getByType<VersionCatalogsExtension>().named("libs")
        dependencies {
            add("implementation", libs.findLibrary("hilt-android").get())
            add("ksp", libs.findLibrary("hilt-compiler").get())
        }
    }
}
```

```kotlin
// build-logic/convention/src/main/kotlin/AndroidFeatureConventionPlugin.kt
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.api.artifacts.VersionCatalogsExtension
import org.gradle.kotlin.dsl.dependencies
import org.gradle.kotlin.dsl.getByType

class AndroidFeatureConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) = with(target) {
        // feature 模块通用规则 = Compose 库 + Hilt + Navigation + 路由模块依赖
        pluginManager.apply("notedx.android.library.compose")
        pluginManager.apply("notedx.android.hilt")
        val libs = extensions.getByType<VersionCatalogsExtension>().named("libs")
        dependencies {
            add("implementation", libs.findLibrary("androidx-navigation-compose").get())
            add("implementation", libs.findLibrary("hilt-navigation-compose").get())
            add("implementation", libs.findLibrary("androidx-lifecycle-runtime-compose").get())
            add("implementation", libs.findLibrary("kotlinx-coroutines-android").get())
            // 所有 feature 默认依赖 core 路由 / design / common
            add("implementation", project(":core-navigation"))
            add("implementation", project(":core-design"))
            add("implementation", project(":core-common"))
        }
    }
}
```

### 4) 各模块的 `build.gradle.kts`

```kotlin
// app/build.gradle.kts
plugins {
    id("notedx.android.application")
    id("notedx.android.hilt")
    alias(libs.plugins.compose.compiler)
}

android {
    namespace = "com.example.notedx"
    defaultConfig {
        applicationId = "com.example.notedx"
        versionCode = 1
        versionName = "1.0.0"
    }
    buildFeatures { compose = true }
}

dependencies {
    implementation(project(":feature-note"))
    implementation(project(":feature-todo"))
    implementation(project(":feature-attachment"))
    implementation(project(":feature-settings"))
    implementation(project(":data"))
    implementation(project(":core-navigation"))
    implementation(project(":core-design"))
    implementation(project(":core-common"))

    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.navigation.compose)
}
```

```kotlin
// feature-note/build.gradle.kts —— 享受 convention plugin 后只剩 5 行
plugins {
    id("notedx.android.feature")
    alias(libs.plugins.kotlin.serialization)
}
android { namespace = "com.example.notedx.feature.note" }
dependencies {
    implementation(project(":data"))   // feature 需要数据层
}
```

```kotlin
// data/build.gradle.kts
plugins {
    id("notedx.android.library")
    id("notedx.android.hilt")
    alias(libs.plugins.ksp)
}
android { namespace = "com.example.notedx.data" }
dependencies {
    api(project(":core-common"))       // model / Result 类型对外暴露 -> api
    implementation(project(":core-network"))
    implementation(libs.room.runtime)
    implementation(libs.room.ktx)
    ksp(libs.room.compiler)
    implementation(libs.kotlinx.coroutines.core)
}
```

```kotlin
// core-network/build.gradle.kts
plugins {
    id("notedx.android.library")
    id("notedx.android.hilt")
    alias(libs.plugins.kotlin.serialization)
}
android { namespace = "com.example.notedx.core.network" }
dependencies {
    api(libs.retrofit.core)                       // :data 要 import Response<T>
    api(libs.kotlinx.coroutines.core)             // :data 要 import Flow
    implementation(libs.retrofit.kotlinx.serialization)
    implementation(libs.okhttp.client)
    implementation(libs.okhttp.logging)
    implementation(libs.kotlinx.serialization.json)
}
```

```kotlin
// core-common/build.gradle.kts —— 纯 JVM 库,不依赖 Android Framework
plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.serialization)
}
dependencies {
    api(libs.kotlinx.coroutines.core)
    api(libs.kotlinx.serialization.json)
}
```

`:core-common` 用 `kotlin-jvm` 而非 `kotlin-android`,因为它没有 Android Framework 依赖(纯 model / Result / Dispatcher 抽象)。这一招的好处:跑单元测试无需 Robolectric,直接 JUnit 启动毫秒级。

### 5) 模块对外接口示例

```kotlin
// core-navigation/src/main/kotlin/com/example/notedx/core/navigation/Route.kt
package com.example.notedx.core.navigation

import kotlinx.serialization.Serializable

@Serializable
sealed interface Route {
    @Serializable data object NoteList : Route
    @Serializable data class NoteDetail(val id: String) : Route
    @Serializable data class NoteEditor(val initialText: String = "") : Route
    @Serializable data object TodoList : Route
    @Serializable data object Settings : Route
}
```

```kotlin
// data/src/main/kotlin/com/example/notedx/data/NoteRepository.kt
package com.example.notedx.data

import com.example.notedx.core.common.Note
import com.example.notedx.core.common.Result
import kotlinx.coroutines.flow.Flow

interface NoteRepository {
    fun observeAll(): Flow<List<Note>>
    suspend fun get(id: String): Result<Note>
    suspend fun save(note: Note): Result<Unit>
    suspend fun delete(id: String): Result<Unit>
}
```

```kotlin
// data/src/main/kotlin/com/example/notedx/data/di/DataModule.kt
package com.example.notedx.data.di

import com.example.notedx.data.NoteRepository
import com.example.notedx.data.impl.OfflineFirstNoteRepository
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class DataModule {
    @Binds
    @Singleton
    abstract fun bindNoteRepository(impl: OfflineFirstNoteRepository): NoteRepository
}
```

```kotlin
// feature-note/src/main/kotlin/com/example/notedx/feature/note/NoteListViewModel.kt
package com.example.notedx.feature.note

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.notedx.data.NoteRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

@HiltViewModel
class NoteListViewModel @Inject constructor(
    repo: NoteRepository,
) : ViewModel() {
    val notes = repo.observeAll().stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = emptyList()
    )
}
```

`feature-note` 模块只需要在 `dependencies` 加 `implementation(project(":data"))`,然后 Hilt 会自动 wire `OfflineFirstNoteRepository`。这个 ViewModel 不需要知道 Room / Retrofit / OkHttp 任何细节。

## 4. 调参与验收

### 增量构建速度

`./gradlew :app:assembleDebug --profile` 会生成 `build/reports/profile/profile-*.html`,可视化每个模块每个 task 的耗时。验收基线:

| 场景 | 单模块时 | 多模块后 |
| --- | --- | --- |
| 全量 clean build(冷) | 90-150 s | 60-100 s(模块并行编译) |
| 改 `:feature-note` 一行(暖) | 30-60 s(重编 :app) | 8-15 s(只重编 :feature-note + :app) |
| 改 `:core-design` 一行(暖) | 30-60 s | 25-40 s(下游 feature 全部受影响,因为 :core-design 多为 api 暴露) |
| 改 `:data` 一行(暖) | 30-60 s | 15-25 s(只 :data + :feature-* + :app) |

若改 `:feature-note` 后 IDE 还是慢,常见原因:
- `:feature-note` 的某个 `api(libs.x)` 用错了 `api`,改成 `implementation` 减少传递。
- Gradle daemon 未启用(`org.gradle.daemon=true`)。
- KSP 增量未开(KSP 2.0+ 默认开,1.x 需要 `ksp.incremental=true`)。
- `org.gradle.parallel=true` 没开,模块未并行。

### 模块依赖图可视化

```
./gradlew :app:projectReport
# 输出 build/reports/project/dependencies/index.html

./gradlew --console=plain :app:dependencies > deps.txt
# 文本格式,可 grep
```

或更直观:

```
./gradlew projectHealth   # 用 dependency-analysis-gradle-plugin
```

`dependency-analysis-gradle-plugin`(开源)会自动检查"声明了但没用的依赖"、"该 api 却用了 implementation"等问题,出报告。强烈推荐放进 CI 阻断 PR。

### Hilt 注入图验收

`@HiltAndroidApp` 在 `:app` 编译时,Hilt 编译器会构建完整依赖图。如果某个 `@Inject` 找不到 `@Provides`,会在 `:app:kspDebugKotlin` 阶段报错:

```
error: [Dagger/MissingBinding] com.example.notedx.data.NoteRepository cannot be provided without an @Provides-annotated method.
```

此时检查:
- `DataModule` 是否在 `:data` 下且加了 `@InstallIn(SingletonComponent::class)`。
- `:app` 是否 `implementation(project(":data"))`(没依赖就找不到 Module)。
- ViewModel 所在 feature 是否应用了 `notedx.android.hilt` convention plugin。

### `api` vs `implementation` 验收

在 `:data/build.gradle.kts` 把某条 `api(libs.x)` 临时改成 `implementation(libs.x)`,build,如果 `:feature-*` 飘红说"找不到 com.x.Y",说明这个 Y 是跨模块接口的一部分,该用 `api`。反之改 `api` → `implementation` build 仍通过,说明是过度暴露,应保持 `implementation`。

### 启动耗时

第 25 篇([[androidNativeLearning 25]])会详细讲 Macrobenchmark。多模块化对启动耗时通常**无负面影响**——Kotlin 模块在 dex 合并后运行时是同一个 ClassLoader,跨模块调用零开销。但要注意:Hilt 的 component 初始化在 `Application.onCreate` 完成,模块越多,Hilt 注入图构建越久(冷启动 +30-100 ms)。这个代价远小于多模块带来的开发效率收益,可忽略。

## 5. 踩坑

### 坑 1:循环依赖

`:feature-note` 依赖 `:feature-todo`(因为 NoteEditor 里想插入 todo);`:feature-todo` 依赖 `:feature-note`(因为 TodoDetail 里想引用源 Note)。Gradle 直接 fail。解法:**把"两个 feature 都需要"的接口下沉到 `:core-navigation` 或 `:data`**。比如把"通过 id 跳到任意 feature"的能力收敛到 `:core-navigation` 的 `Route` sealed interface,两个 feature 都 `navigate(Route.X(...))` 而不互相 import 对方。

### 坑 2:`api` 滥用导致"小改全编"

新人写 `:core-common` 时把所有依赖都 `api`,半年后任何一处 `:core-common` 修改触发整个项目 1 分钟重编。补救:`./gradlew projectHealth`(`dependency-analysis-gradle-plugin`)定期扫,自动建议哪些 `api` 应降级为 `implementation`。

### 坑 3:`build-logic` 内部的 plugin 没法用 catalog 的 plugin 别名

`build-logic` 的 `dependencies` 里如果想引用 `libs.plugins.android.application`,要写成 `libs.plugins.android.application.asProvider().get().pluginId` —— 这是 Gradle 7-8 的已知坑。变通做法是用 `"com.android.tools.build:gradle:..."` 直接拼版本号(从 `libs.versions.agp.get()` 拿)。代码看起来丑,但稳。

### 坑 4:Hilt `@Module` 跨模块互相引用

`@Module` 间通过 `dependencies = [...]` 注解互相引用是支持的,但跨模块时编译期错误信息会非常长(全是生成的类名)。最佳实践:**每个模块的 `@Module` 自包含,不引用别的 module 的 `@Module`**。跨模块依赖通过 `@Inject` 构造函数自动 wire,Hilt 会找到上游 module 的 `@Provides`。

### 坑 5:`:core-common` 用 kotlin-jvm 但意外加了 Android 类型

`:core-common` 是纯 JVM 库,加了 `android.util.Log` 这种类型会编不过(找不到类)。一种常见误用是想在 Result 里携带 throwable,用了 `android.os.Bundle` 序列化——纯 JVM 库不能用 Android 类型。要么把这个类挪到 `:core-android` 子模块,要么改用 `kotlinx.serialization` 跨平台序列化。**写 `:core-common` 时尽量克制,只放 pure Kotlin model / interface,Android 相关单独开 `:core-android`**。

### 坑 6:Compose 模块用了不一致的 BOM 版本

`:feature-note` 写 `implementation(libs.androidx.compose.material3)` 不加 `platform(libs.androidx.compose.bom)`,而 `:feature-todo` 加了 BOM。两个模块的 Material3 解析到的版本不同,运行时随机崩。convention plugin 的 `AndroidLibraryComposeConventionPlugin` 里**统一**加 BOM,所有 Compose 模块只能通过这个 plugin 进入,杜绝此问题。

### 坑 7:模块 namespace 不写或写错

AGP 8+ 强制每个模块声明 `android { namespace = "..." }`。不写会编译失败。写错(两个模块同 namespace)会导致 R.java 合并冲突。命名约定:`com.example.notedx.<module-name>`,与 directory 一一对应。

### 坑 8:`-Xexplicit-api=strict` 把 internal 全部暴露成 public

convention plugin 加了 `freeCompilerArgs.add("-Xexplicit-api=strict")` 后,所有 public class 必须显式声明可见性(否则编译失败)。这是好习惯,但对老代码要逐步迁移。临时关闭:`freeCompilerArgs.add("-Xexplicit-api=warning")` 先警告不失败。

### 坑 9:`:app` 模块意外被其他模块依赖

`:app` 是顶层装配,**不能被任何其他模块依赖**。但 Gradle 不会主动阻止你 `implementation(project(":app"))`。一旦发生(通常是新人误操作),Hilt 注入图崩溃 + 循环依赖死锁。在 CI 加一条 lint:

```kotlin
// build-logic 里追加 task
tasks.register("checkAppNotDepended") {
    rootProject.subprojects.filter { it.name != "app" }.forEach { sub ->
        sub.configurations.forEach { conf ->
            conf.dependencies.filterIsInstance<ProjectDependency>().forEach { dep ->
                require(dep.dependencyProject.name != "app") {
                    ":${sub.name} depends on :app (forbidden)"
                }
            }
        }
    }
}
```

### 坑 10:Version Catalog 中 `version.ref` 拼写错误不会 fail

`gradle/libs.versions.toml` 里 `[versions]` 写 `hilit = "2.52"`(typo),后面 `version.ref = "hilt"` 会拿到空值,依赖解析时报"找不到 ...:" 错误。先 `./gradlew help` 单独验证 catalog 加载;CI 加一个简单 task `tasks.register("validateCatalog") { ... }` 遍历检查所有 ref 能解析。

### 坑 11:模块切完后第一次 sync 慢得不像话

模块从 1 个变 10 个,Gradle Sync 第一次冷启动 2-5 分钟(每个模块都要 resolve 依赖)。这是一次性成本,后续 sync 用增量缓存只需 10-30 秒。期间不要中断,中断会导致 Gradle 缓存损坏,要 `./gradlew --stop && rm -rf .gradle/`。

### 坑 12:用 `includeBuild("build-logic")` 后 `buildSrc/` 不再生效

如果项目里同时有老的 `buildSrc/` 和新的 `build-logic/`,Gradle 优先 `buildSrc/` 但实际行为不定。**二选一**,不要并存。NotedX 主线只用 `build-logic`,迁移老项目时整体替换。

## 手动验证

- [ ] `./gradlew :app:assembleDebug` 全量构建成功。
- [ ] 改 `:feature-note/src/.../NoteListViewModel.kt` 任意一行,`./gradlew :app:assembleDebug --rerun-tasks=false` 在 20 秒内完成(只重编 :feature-note + :app)。
- [ ] 改 `:core-network/src/.../AuthInterceptor.kt`,build 时**只有** `:core-network` / `:data` / `:feature-*` / `:app` 重编,`:core-design` / `:core-navigation` 命中缓存。
- [ ] `./gradlew :feature-note:dependencies` 输出不包含 `:feature-todo`(feature 之间隔离)。
- [ ] `./gradlew :app:dependencies` 包含全部 `:feature-*` / `:core-*` / `:data` 项目依赖。
- [ ] 在 `:feature-todo` 里尝试 `import com.example.notedx.feature.note.NoteListViewModel`,IDE 飘红 + build 失败,验证模块边界生效。
- [ ] `./gradlew projectHealth`(若装了 `dependency-analysis-gradle-plugin`)输出"All projects healthy"。
- [ ] 在新建一个空模块 `:feature-x` 时,只需写 `plugins { id("notedx.android.feature") }` + `android { namespace = "..." }`,无需重复 SDK 配置 / Compose 启用 / Hilt 依赖。
- [ ] `adb install` 安装后 cold-start NotedX,与单模块版本相比启动时长差异 < 100 ms(Macrobenchmark 在第 23 篇验证)。
