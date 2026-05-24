# 26-Compose 测试与依赖隔离

> 一句话导读:Compose UI 不能再用 Espresso 老一套,但它给你的回礼是一个比 XML View 时代更干净的测试模型;只要把 Hilt 模块拆得能换、Repository 写得能 fake,UI 测试就能从"碰运气跑通"变成"PR 红绿一目了然"。

第 13 篇做完 Hilt 注入,你的 ViewModel 拿到的是真实 Repository;第 15 篇做完闭环,Repository 又依赖真实 Retrofit。这套真依赖跑业务没问题,但写测试时会出大问题——单元测试不应该真发 HTTP,UI 测试不应该真访问 SQLite。解法只有一个:依赖能被换掉。Hilt 给的工具是 `@HiltAndroidTest` + `@UninstallModules`,Compose 给的工具是 `createComposeRule`(纯组件)和 `createAndroidComposeRule`(带 Activity)。本篇把这两套工具拼起来,演示一个真实的"列表页测试":Fake Repository 注入 → Compose UI 渲染 → `onNodeWithTag` 找节点 → `performClick` 触发交互 → `waitUntil` 等待状态变化 → 断言。最后再讲 Robolectric 和 Instrumented Test 的选型——这两者在 Compose 时代不是对立而是互补。

测试这件事的隐性预算和启动优化一样硬:Compose UI 测试如果一个跑 8 秒,你 50 个测试就是 7 分钟,CI 会把每个 PR 都拖到不可忍受。所以工程目标不是"有测试就行",而是"每个测试 ≤ 1 秒、整套 UI 测试 ≤ 2 分钟"。这要求依赖隔离做得彻底,Fake 跑得快,Compose Rule 不真启 Activity 的能避免就避免。

## 1. 机制定位

旧 Android 测试的失控写法很有代表性:写一个 Espresso 测试,启动真 Activity,真去网络拉数据,然后 `onView(withId(R.id.list)).check(matches(hasItem(...)))`。这种测试有三个绝症:**慢**(每个 30+ 秒)、**flaky**(网络抖动直接红)、**强耦合**(改一个 layout id 就要改一打测试)。一旦项目里有 200 个这种测试,CI 单次跑 1 小时是常态,工程师就开始 disable 测试,然后测试就没了。

Compose 测试体系的设计目标是把这三个绝症一次性切掉:**快**(`createComposeRule` 不启真 Activity,纯组件渲染,每个测试 ~100ms);**稳**(`waitUntil` 把"等待状态变化"建模成显式 API,不是 `Thread.sleep`);**解耦**(`Modifier.testTag("foo")` 把测试标识从 layout id 里抽出来,组件签名不变测试不变)。

Hilt 测试体系的设计目标是回答一个问题:**ViewModel 在测试时拿到的依赖能不能是 Fake?** 答案是 `@HiltAndroidTest` 把测试类标记为 Hilt 测试,`@UninstallModules` 卸掉真模块,然后用 `@Module + @TestInstallIn` 注入 Fake。这套 API 看起来重(注解多),但底层逻辑直白:**测试运行时,Hilt 用另一张依赖图组装应用**。这跟 production code 一行都不需要改,Repository 仍然是 `@Inject constructor`,只是它注入的实现换了。

把这两套机制拼在一起就是本篇的核心:Compose Rule 提供 UI 渲染壳,Hilt 测试模块提供数据依赖替换,Fake Repository 提供可控数据。三者解耦,各管一段,共同支撑"一个测试只测一件事"。

Robolectric vs Instrumented 的选择不是"哪个对哪个错",而是"什么场景用哪个"。Robolectric 在 JVM 上模拟 Android 框架,跑得极快(无设备),适合纯 ViewModel 单测、Compose 纯组件测试。Instrumented(运行在真设备/模拟器)适合涉及真实 Activity 生命周期、真实 SQLite 查询、真实摄像头权限。生产项目两者都用,比例大致是 80% Robolectric + 20% Instrumented。

## 2. Android 心智

### Compose Test 关键类

| 类/方法 | 作用 | 何时用 |
| --- | --- | --- |
| `createComposeRule()` | 纯组件 Test Rule,无 Activity | 测一个 `@Composable` 函数本身的行为 |
| `createAndroidComposeRule<T : ComponentActivity>()` | 启动一个真 Activity | 测涉及 Hilt 注入、ViewModel、Navigation 的整页 |
| `composeTestRule.setContent { ... }` | 用 `createComposeRule` 时手动设置内容 | 模块化测一个组件 |
| `onNodeWithTag("foo")` | 通过 `Modifier.testTag("foo")` 找节点 | 推荐查找方式,稳定不依赖文案 |
| `onNodeWithText("Login")` | 通过显示文本找节点 | 文本不会变的场景 |
| `onNodeWithContentDescription(...)` | 通过无障碍描述找节点 | 图标按钮 |
| `performClick()` | 点击 | 模拟用户点 |
| `performTextInput("hello")` | 文本输入 | 输入框测试 |
| `assertIsDisplayed()` / `assertExists()` | 断言可见性 | 状态断言 |
| `waitUntil { ... }` | 阻塞到 lambda 返回 true 或超时 | 等异步状态变化 |
| `mainClock.advanceTimeBy(1000)` | 推进 Compose 内部时钟 | 测动画或定时 |

`createComposeRule` 在 Robolectric 下跑,默认走 JUnit Test Runner,文件放 `app/src/test/`(unit test source set)。`createAndroidComposeRule` 必须跑在真设备/模拟器上,文件放 `app/src/androidTest/`(instrumented test source set)。Hilt 测试目前只支持 instrumented(`androidTest`)。

### Hilt Test 关键注解

- `@HiltAndroidTest`:标记测试类用 Hilt 注入。
- `@UninstallModules(RealModule::class)`:测试运行时不安装 `RealModule`。
- `@Module @TestInstallIn(components = [SingletonComponent::class], replaces = [RealModule::class])`:测试模块,替换被卸掉的真模块。
- `HiltAndroidRule(this)`:JUnit Rule,必须最先 `inject()`。
- `@BindValue` / `@BindValueIntoSet`:不写完整 Module,直接在测试类字段上声明替换值。

### Fake vs Mock 的工程边界

| 类型 | 长什么样 | 何时用 |
| --- | --- | --- |
| Fake | 一个**可工作的**简化实现(`FakeNoteRepository` 内部用 `MutableStateFlow<List<Note>>` 而不是 Room) | 重 IO / 重 DB / 重网络的依赖替换 |
| Mock | 工具生成的代理(MockK 的 `every { foo.bar() } returns ...`) | 简单接口验证调用次数与参数 |
| Stub | 返回固定值(`object : Foo { override fun bar() = "x" }`) | 测试只关心"调用过"不关心"调用细节" |
| Spy | 真实实现的代理,记录调用 | 极少用,通常说明设计有问题 |

本项目优先用 Fake,因为它最接近"真实但可控"的语义。Mock 只在"我要验证 ViewModel 调用了 Analytics 上报"这类场景用,避免把 Fake 写成几百行的迷你 DB。

### Robolectric 与 Instrumented 的选型矩阵

| 测试目标 | 选 | 原因 |
| --- | --- | --- |
| 纯 ViewModel 逻辑(无 Compose) | JUnit + coroutines-test | 最快,不需要 Android Framework |
| 单个 `@Composable` 渲染 + 交互 | Robolectric + `createComposeRule` | 不启 Activity,JVM 跑,毫秒级 |
| 整页(含 Hilt + Navigation + ViewModel) | Instrumented + `createAndroidComposeRule` | Hilt 必须在 instrumented |
| Room DAO | Instrumented(`androidx.room:testing`) | SQLite 实现差异在 Robolectric 上不可靠 |
| Network(Retrofit + OkHttp) | JUnit + `MockWebServer` | 不需要 Compose 也不需要 Android |
| 截图测试 | Roborazzi(Robolectric) | 比 Instrumented 截图测试快 100 倍 |

## 3. 工程实现

### 3.1 依赖与配置

`libs.versions.toml`:

```toml
[versions]
junit = "4.13.2"
androidx-test-junit = "1.2.1"
compose-bom = "2024.10.00"
hilt = "2.52"
robolectric = "4.13"
coroutines = "1.9.0"
mockk = "1.13.13"

[libraries]
junit = { module = "junit:junit", version.ref = "junit" }
androidx-test-junit = { module = "androidx.test.ext:junit", version.ref = "androidx-test-junit" }
compose-bom = { module = "androidx.compose:compose-bom", version.ref = "compose-bom" }
compose-ui-test-junit4 = { module = "androidx.compose.ui:ui-test-junit4" }
compose-ui-test-manifest = { module = "androidx.compose.ui:ui-test-manifest" }
hilt-android = { module = "com.google.dagger:hilt-android", version.ref = "hilt" }
hilt-android-testing = { module = "com.google.dagger:hilt-android-testing", version.ref = "hilt" }
hilt-compiler = { module = "com.google.dagger:hilt-android-compiler", version.ref = "hilt" }
robolectric = { module = "org.robolectric:robolectric", version.ref = "robolectric" }
coroutines-test = { module = "org.jetbrains.kotlinx:kotlinx-coroutines-test", version.ref = "coroutines" }
mockk = { module = "io.mockk:mockk", version.ref = "mockk" }
```

`build.gradle.kts`(模块级)关键片段:

```kotlin
plugins {
    id("com.android.application")
    id("com.google.dagger.hilt.android")
    id("com.google.devtools.ksp")
}

android {
    defaultConfig {
        testInstrumentationRunner = "com.notedx.HiltTestRunner"
    }
    testOptions {
        unitTests {
            isIncludeAndroidResources = true
        }
    }
}

dependencies {
    val composeBom = platform(libs.compose.bom)
    androidTestImplementation(composeBom)
    debugImplementation(composeBom)

    testImplementation(libs.junit)
    testImplementation(libs.coroutines.test)
    testImplementation(libs.robolectric)
    testImplementation(libs.compose.ui.test.junit4)
    debugImplementation(libs.compose.ui.test.manifest)

    androidTestImplementation(libs.androidx.test.junit)
    androidTestImplementation(libs.compose.ui.test.junit4)
    androidTestImplementation(libs.hilt.android.testing)
    kspAndroidTest(libs.hilt.compiler)
    androidTestImplementation(libs.mockk)
}
```

自定义 `HiltTestRunner`(Hilt 测试必备),路径 `app/src/androidTest/java/com/notedx/HiltTestRunner.kt`:

```kotlin
package com.notedx

import android.app.Application
import android.content.Context
import androidx.test.runner.AndroidJUnitRunner
import dagger.hilt.android.testing.HiltTestApplication

class HiltTestRunner : AndroidJUnitRunner() {
    override fun newApplication(
        cl: ClassLoader?,
        name: String?,
        context: Context?,
    ): Application = super.newApplication(cl, HiltTestApplication::class.java.name, context)
}
```

`HiltTestApplication` 是 Hilt 提供的轻量 Application 替身,启用 `@HiltAndroidTest`。

### 3.2 业务侧:可注入的 Repository

`NoteRepository` 接口(本来就该这么写,测试只是兑现这份设计):

```kotlin
// app/src/main/java/com/notedx/data/NoteRepository.kt
package com.notedx.data

import kotlinx.coroutines.flow.Flow

interface NoteRepository {
    fun observeNotes(): Flow<List<Note>>
    suspend fun addNote(title: String)
    suspend fun deleteNote(id: Long)
}

data class Note(val id: Long, val title: String, val createdAt: Long)
```

真实实现(主程序用)`RealNoteRepository.kt` 略过,假设走 Room + Retrofit。

Hilt 的真模块:

```kotlin
// app/src/main/java/com/notedx/di/RepositoryModule.kt
package com.notedx.di

import com.notedx.data.NoteRepository
import com.notedx.data.RealNoteRepository
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {
    @Binds
    @Singleton
    abstract fun bindNoteRepository(impl: RealNoteRepository): NoteRepository
}
```

### 3.3 完整 @HiltAndroidTest + @UninstallModules 测试用例

这是本篇的核心硬约束:一个端到端的 Compose 列表页测试,Hilt 注入 Fake Repository,Compose 渲染 ViewModel 状态,断言交互结果。

#### Step 1:Fake Repository(可控数据源)

```kotlin
// app/src/androidTest/java/com/notedx/fakes/FakeNoteRepository.kt
package com.notedx.fakes

import com.notedx.data.Note
import com.notedx.data.NoteRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class FakeNoteRepository @Inject constructor() : NoteRepository {

    private val _notes = MutableStateFlow<List<Note>>(emptyList())

    override fun observeNotes(): Flow<List<Note>> = _notes.asStateFlow()

    override suspend fun addNote(title: String) {
        val newId = (_notes.value.maxOfOrNull { it.id } ?: 0L) + 1
        _notes.value = _notes.value + Note(newId, title, System.currentTimeMillis())
    }

    override suspend fun deleteNote(id: Long) {
        _notes.value = _notes.value.filterNot { it.id == id }
    }

    // 测试辅助:直接 seed 初始数据
    fun seed(notes: List<Note>) {
        _notes.value = notes
    }
}
```

#### Step 2:测试模块替换

```kotlin
// app/src/androidTest/java/com/notedx/di/TestRepositoryModule.kt
package com.notedx.di

import com.notedx.data.NoteRepository
import com.notedx.fakes.FakeNoteRepository
import dagger.Binds
import dagger.Module
import dagger.hilt.components.SingletonComponent
import dagger.hilt.testing.TestInstallIn
import javax.inject.Singleton

@Module
@TestInstallIn(
    components = [SingletonComponent::class],
    replaces = [RepositoryModule::class],
)
abstract class TestRepositoryModule {
    @Binds
    @Singleton
    abstract fun bindFakeRepository(impl: FakeNoteRepository): NoteRepository
}
```

`@TestInstallIn(replaces = [...])` 是关键——它告诉 Hilt:测试运行时,卸掉 `RepositoryModule`,装这个。这样不需要在每个测试上手写 `@UninstallModules`(`@UninstallModules` 适合"我这个测试要换得跟其他测试不一样"的场景)。

#### Step 3:被测的 Composable 与 ViewModel

```kotlin
// app/src/main/java/com/notedx/ui/notes/NotesViewModel.kt
package com.notedx.ui.notes

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.notedx.data.NoteRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class NotesViewModel @Inject constructor(
    private val repo: NoteRepository,
) : ViewModel() {

    val notes = repo.observeNotes()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun add(title: String) {
        viewModelScope.launch { repo.addNote(title) }
    }

    fun delete(id: Long) {
        viewModelScope.launch { repo.deleteNote(id) }
    }
}
```

```kotlin
// app/src/main/java/com/notedx/ui/notes/NotesScreen.kt
package com.notedx.ui.notes

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotesScreen(vm: NotesViewModel = hiltViewModel()) {
    val notes by vm.notes.collectAsStateWithLifecycle()
    var input by remember { mutableStateOf("") }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Row {
            OutlinedTextField(
                value = input,
                onValueChange = { input = it },
                label = { Text("New note") },
                modifier = Modifier.weight(1f).testTag("input"),
            )
            Spacer(Modifier.width(8.dp))
            Button(
                onClick = { vm.add(input); input = "" },
                enabled = input.isNotBlank(),
                modifier = Modifier.testTag("add"),
            ) { Text("Add") }
        }
        Spacer(Modifier.height(16.dp))
        LazyColumn(Modifier.testTag("notes-list")) {
            items(notes, key = { it.id }) { note ->
                ListItem(
                    headlineContent = { Text(note.title) },
                    modifier = Modifier.testTag("note-${note.id}"),
                )
            }
        }
    }
}
```

注意三个 `testTag`:`input`(输入框)、`add`(按钮)、`notes-list`(列表容器),以及每个列表项 `note-${id}`。这些 tag 是测试断言的锚点,生产 release 默认会被剥(Compose Compiler `mergeDescendants` 行为)。

#### Step 4:完整端到端测试

```kotlin
// app/src/androidTest/java/com/notedx/ui/notes/NotesScreenTest.kt
package com.notedx.ui.notes

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import com.notedx.data.Note
import com.notedx.data.NoteRepository
import com.notedx.di.RepositoryModule
import com.notedx.fakes.FakeNoteRepository
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import dagger.hilt.android.testing.UninstallModules
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import javax.inject.Inject

@HiltAndroidTest
@UninstallModules(RepositoryModule::class)
class NotesScreenTest {

    @get:Rule(order = 0)
    val hiltRule = HiltAndroidRule(this)

    @get:Rule(order = 1)
    val composeRule = createAndroidComposeRule<ComponentActivity>()

    @Inject lateinit var repo: NoteRepository

    @Before
    fun setup() {
        hiltRule.inject()
        composeRule.activity.setContent { NotesScreen() }
    }

    @Test
    fun emptyState_showsNoItems() {
        composeRule.onNodeWithTag("notes-list").onChildren().assertCountEquals(0)
    }

    @Test
    fun seededNotes_areRendered() {
        (repo as FakeNoteRepository).seed(
            listOf(
                Note(1L, "Buy milk", 0L),
                Note(2L, "Walk dog", 0L),
            )
        )
        composeRule.waitUntil(timeoutMillis = 2_000) {
            composeRule.onAllNodesWithTag("note-1").fetchSemanticsNodes().isNotEmpty()
        }
        composeRule.onNodeWithText("Buy milk").assertIsDisplayed()
        composeRule.onNodeWithText("Walk dog").assertIsDisplayed()
    }

    @Test
    fun addNote_throughUI_appendsToList() {
        composeRule.onNodeWithTag("input").performTextInput("Pay rent")
        composeRule.onNodeWithTag("add").performClick()
        composeRule.waitUntil(timeoutMillis = 2_000) {
            composeRule.onAllNodesWithText("Pay rent").fetchSemanticsNodes().isNotEmpty()
        }
        composeRule.onNodeWithText("Pay rent").assertIsDisplayed()
        composeRule.onNodeWithTag("input").assertTextEquals("")
    }

    @Test
    fun addButton_isDisabled_whenInputBlank() {
        composeRule.onNodeWithTag("add").assertIsNotEnabled()
        composeRule.onNodeWithTag("input").performTextInput("x")
        composeRule.onNodeWithTag("add").assertIsEnabled()
    }
}
```

这个测试有几个值得拆解的点。第一,`@UninstallModules(RepositoryModule::class)` 在类级,告诉 Hilt 本测试要卸掉这个真模块——配合上面的 `TestRepositoryModule` 自动接管(也可以不写 `@TestInstallIn`,改在 `@HiltAndroidTest` 类内部用 `@BindValue` 直接 bind 字段)。第二,`@get:Rule(order = 0)` 让 HiltAndroidRule 先跑,Compose Rule 后跑——顺序错了 Hilt 注入会在 Activity 启动之后,`@Inject lateinit var` 还是 null。第三,`waitUntil` 不是死等而是带超时 + 条件 lambda,Compose 测试任何"等异步状态"都用它,绝对不用 `Thread.sleep`。

### 3.4 ViewModel 单元测试(不用 Compose 不用 Hilt)

不是所有逻辑都要走 UI 测试。ViewModel 的纯逻辑用 JUnit + coroutines-test 更快:

```kotlin
// app/src/test/java/com/notedx/ui/notes/NotesViewModelTest.kt
package com.notedx.ui.notes

import com.notedx.data.Note
import com.notedx.fakes.FakeNoteRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.*
import org.junit.After
import org.junit.Before
import org.junit.Test
import kotlin.test.assertEquals

@OptIn(ExperimentalCoroutinesApi::class)
class NotesViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before fun setup() { Dispatchers.setMain(dispatcher) }
    @After fun tearDown() { Dispatchers.resetMain() }

    @Test
    fun add_appendsToFlow() = runTest(dispatcher) {
        val repo = FakeNoteRepository()
        val vm = NotesViewModel(repo)

        vm.add("hello")
        advanceUntilIdle()

        val list = vm.notes.value
        assertEquals(1, list.size)
        assertEquals("hello", list[0].title)
    }
}
```

这测试 100ms 内跑完,没启动 Compose,没启动 Hilt。`StandardTestDispatcher` + `advanceUntilIdle` 是协程测试的标准模式,要熟。

### 3.5 Robolectric 跑 Compose(无设备纯 JVM)

`app/src/test/java/com/notedx/ui/notes/NotesScreenRobolectricTest.kt`:

```kotlin
package com.notedx.ui.notes

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performTextInput
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class NotesScreenRobolectricTest {

    @get:Rule val composeRule = createComposeRule()

    @Test
    fun addNote_smoke() {
        val repo = com.notedx.fakes.FakeNoteRepository()
        val vm = NotesViewModel(repo)
        composeRule.setContent { NotesScreen(vm) }

        composeRule.onNodeWithTag("input").performTextInput("hi")
        composeRule.onNodeWithTag("add").performClick()
        composeRule.waitForIdle()
        composeRule.onNodeWithText("hi").assertExists()
    }
}
```

Robolectric 跑 Compose 的关键是 `createComposeRule()`(不是 `createAndroidComposeRule`)+ `RobolectricTestRunner`。注意 `NotesScreen(vm)` 直接传 ViewModel——绕过 `hiltViewModel()`,因为 Hilt 在 Robolectric 模式下不可用(Hilt 必须 instrumented)。这是 Robolectric 模式的代价:不能用 Hilt,但跑得快。

## 4. 调参与验收

**Test Tag 命名规范。** `testTag` 用 kebab-case 或 dash-case 都行,避免汉字和空格。命名应描述"角色"而不是"实现"——`add-button` 优于 `green-button`;`note-${id}` 优于 `item-${index}`(index 会随删改变,id 稳定)。Tag 不要重用,Compose 树里同名 tag 会让 `onNodeWithTag` 报"more than one node"。

**`waitUntil` 超时设置。** 默认 1 秒,大多数 UI 测试够;涉及网络(尽量不要在 UI 测试里)或动画过长可上调到 3-5 秒。绝对不要给 0 或负数,等于直接断言"现在就成立",会让本来应该过的测试因为状态机还没流转完而 flake。

**Robolectric vs Instrumented 选择标准。** 优先 Robolectric(快、本地能跑、CI 不需要模拟器);只有以下场景必须 Instrumented:用了 Hilt、需要真 Activity 生命周期、Room DAO 测试、涉及系统服务(LocationManager 等)、需要 Camera/Bluetooth 硬件。比例 80/20 是健康的;如果你的项目 50% 是 Instrumented,说明依赖隔离没做好,该把更多组件抽成纯 Kotlin。

**Compose Compiler Metrics 与测试稳定性。** Compose 1.7 Strong Skipping 默认开启,如果你的 `@Composable` 接收不稳定参数(比如 `List<T>` 而不是 `ImmutableList<T>`),每次状态变化都会重组。测试不会因此失败,但会因为 `waitForIdle()` 等更多帧而变慢。审计 Compose Metrics(参见 [[androidNativeLearning]] 第 22 篇)能让测试间接受益。

**测试运行时间硬预算。**

| 测试类型 | 单测目标 | 整套上限 |
| --- | --- | --- |
| ViewModel JUnit | ≤ 50ms | ≤ 30s |
| Robolectric Compose | ≤ 500ms | ≤ 2min |
| Instrumented Hilt + Compose | ≤ 3s | ≤ 5min |
| Macrobenchmark | ≤ 30s | ≤ 10min |

超出就触发"该不该写这测试"的复审。

**CI 三层测试组织。** Unit(`./gradlew test`) → Instrumented(`./gradlew connectedDebugAndroidTest`,需模拟器)→ Macrobenchmark(独立 module,`./gradlew :macrobenchmark:connectedReleaseAndroidTest`)。PR 至少跑 Unit;merge 到 main 跑 Unit + Instrumented;nightly 跑全部含 Macrobenchmark。每层的失败必须 block 下一层。

**验收清单。**

1. `./gradlew test` 全绿,退出码 0;
2. `./gradlew connectedDebugAndroidTest` 全绿(需启动模拟器);
3. 故意把 `FakeNoteRepository.addNote` 改成 no-op,`addNote_throughUI_appendsToList` 必须红——验证测试真在测,不是空过;
4. 测试 tag 在 release 构建里被剥(`assembleRelease` 后用 `apkanalyzer` 看不到 testTag 字符串残留);
5. CI 单 PR 总时长 ≤ 5 分钟;
6. Crashlytics 后台没有"test 残留代码触发的 RuntimeException"——意味着没把测试代码漏进 release。

## 5. 踩坑

**`@get:Rule(order = 0)` 必须给 HiltAndroidRule,Compose Rule 给 order = 1。** Rule 顺序决定执行顺序,Hilt 先跑才能给 `@Inject lateinit var` 赋值,否则 `inject()` 调用前字段是 null。这个错最常见的表现是 `kotlin.UninitializedPropertyAccessException: lateinit property repo has not been initialized`。

**`@HiltAndroidTest` 测试必须用 `HiltTestRunner`。** 没自定义 Runner 就用默认 `AndroidJUnitRunner`,Hilt 起不来,所有 `@Inject` 字段都拿不到。`testInstrumentationRunner = "com.notedx.HiltTestRunner"` 必须写在 `defaultConfig` 里。

**`@TestInstallIn` 与 `@UninstallModules` 不要同时用同一个模块。** 二选一。`@TestInstallIn(replaces = [RepositoryModule::class])` 是"全局测试时都替换",`@UninstallModules` 是"这个测试类卸掉它"。两个一起写 Hilt 会报 duplicate binding。简单规则:全测试通用的 Fake 用 `@TestInstallIn`;某个测试类要个性化的用 `@UninstallModules` + `@BindValue`。

**`FakeNoteRepository` 必须 `@Singleton` 或测试里手动控制单例。** 不加 Singleton,Hilt 每次注入都新建一个,你 `seed` 完的实例和 Activity 注入的不是同一个,断言全是空列表。Hilt 测试默认走 ApplicationComponent 寿命,标注 Singleton 是最直接的方式。

**`composeRule.activity.setContent { ... }` 与 `createComposeRule().setContent { ... }` 不要混。** `createAndroidComposeRule` 已经启了 Activity,要从 `composeRule.activity.setContent` 设内容;`createComposeRule` 没有 Activity,直接 `composeRule.setContent` 设。混用要么内容显示不出来,要么直接抛 IllegalState。

**`onNodeWithText("...")` 在 i18n 场景脆弱。** App 改了文案或切语言,测试就红。生产用 `testTag` 找节点,文本断言只用于"验证显示的就是这个文本"。测试代码里写中文字符串的少用,英文 testTag 永远稳。

**Compose `Modifier.testTag` 默认不参与 merge。** 父节点没 `Modifier.semantics(mergeDescendants = true)` 的话,父子节点的 testTag 是独立的;一旦 merge,父节点会"吞掉"子节点的 testTag。这是 `onNodeWithTag` 找不到节点最常见的原因之一。解法:要么父节点 `clearAndSetSemantics`,要么测试用 `onAllNodesWithTag(...).onLast()` 取叶子。

**`waitUntil` 默认超时只有 1 秒,慢测试会 flake。** 显式给超时:`waitUntil(timeoutMillis = 3_000) { ... }`。lambda 内不要有副作用(只读断言条件),否则会被 polling 反复触发。

**`MockK` 在 Android Test 上要用 `mockk-android` artifact。** 普通 `mockk` 依赖只在 JVM unit test 工作,instrumented test 要 `androidTestImplementation("io.mockk:mockk-android:...")`。这个错的表现是测试在本地跑通但 CI instrumented 阶段 ClassNotFound。

**`coroutines-test` 1.6+ 的 `runTest` 替代了 `runBlockingTest`。** 老教程里 `runBlockingTest { ... }` 在 1.6+ 已废弃。新写法 `runTest(dispatcher) { ... }` + 显式 `StandardTestDispatcher` 或 `UnconfinedTestDispatcher`。`advanceUntilIdle()` 推进虚拟时间,`advanceTimeBy(1000)` 走指定毫秒。

**Compose 测试启动 Activity 时,主题必须可解析。** 如果你的 App 主题继承 `Theme.MaterialComponents.*`(老 Material),Compose 测试用 `ComponentActivity` 启动时找不到这个主题就崩。临时方案:`androidTest` 下加一个 `themes.xml` 声明一个最简 `Theme.Test`,Activity 走这个。或者干脆把生产代码迁移到 `Theme.Material3.*`(Compose 默认)。

**`Roborazzi` 截图测试需要把 baseline 提交 git。** 第一次跑生成的截图是"标准",此后每次跑对比是否一致。CI 上不要让"截图差异"自动通过,但允许 PR 里更新 baseline——加一行 `./gradlew recordRoborazziDebug` 在 PR 模板里。否则 baseline 跟代码漂移就失去意义。

**Compose `BasicTextField` (TextField2) 在测试里要用 `performTextInput`,不要用 `performKeyInput`。** TextField2 内部是 `TextFieldState`,直接 keyInput 不通过 IME 流走,可能不更新状态。`performTextInput("foo")` 走的是 IME 路径,稳。

**Hilt 测试 `@BindValue` 字段不能在 setup 后修改。** Hilt 在 `inject()` 时把值定死,之后改字段不影响已注入的组件。如果要换值,要么用可变的容器(`@BindValue val state: MutableStateFlow<...> = ...`,改 `state.value`),要么开多个测试类。

**`createAndroidComposeRule` 内的 Activity 默认是 ComponentActivity。** 不是你的真 `MainActivity`。`hiltViewModel()` 仍然能工作因为它走的是 Hilt 注入,但如果你的 Composable 依赖 `LocalContext.current as MainActivity`,会 ClassCast。强类型从 `createAndroidComposeRule<MainActivity>()` 进,但前提是 MainActivity 在 androidTest 上能被启动(需要 `<activity>` 在 manifest 里有 `android.intent.category.LAUNCHER` 或测试 manifest 单独声明)。

## 手动验证

- [ ] `./gradlew test` 跑通 `NotesViewModelTest` 与 `NotesScreenRobolectricTest`,所有测试 pass,耗时 ≤ 30s。
- [ ] `./gradlew connectedDebugAndroidTest` 启动模拟器后跑 `NotesScreenTest`,4 个测试全绿,Hilt 注入正常,Logcat 无 ClassCast / Uninitialized 报错。
- [ ] 把 `FakeNoteRepository.addNote` 改成空实现,`addNote_throughUI_appendsToList` 红;改回来再绿。
- [ ] 把 `Modifier.testTag("add")` 改成 `Modifier.testTag("submit")`,`addNote_throughUI_appendsToList` 红 in `onNodeWithTag("add")` not found;改回再绿。
- [ ] 删掉 `HiltTestRunner` 的 `testInstrumentationRunner` 配置,instrumented 测试启动时报 "HiltAndroidApp not found";改回再绿。
- [ ] 删掉 `@UninstallModules(RepositoryModule::class)` 和 `TestRepositoryModule`,instrumented 测试用真实 Repository,断言失败(因为没 seed);加回再绿。
- [ ] 把 `@get:Rule(order = 0)` 与 `order = 1` 对调,instrumented 测试启动报 `lateinit property repo has not been initialized`;改回再绿。
- [ ] `apkanalyzer` 看 release apk,搜 `notes-list` 字符串,确认 testTag 被 R8 剥掉或 obfuscate(参见 [[androidNativeLearning]] 第 24 篇)。
