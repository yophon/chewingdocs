# 22-Compose 性能、重组、稳定性与 Strong Skipping

> 一句话导读:Compose 1.7 默认开启的 Strong Skipping 让"不写 `@Stable`"也能跳过重组,但代价是把"不稳定 lambda"这一类隐性 bug 从地毯下面拽到了水面上;你必须看 Compiler Metrics Report,而不是看不见。

很多人对"Compose 性能优化"的第一印象是"加几个 `remember`、避免在 `@Composable` 里 `new` 对象"。这个直觉在 Compose 1.5 时代基本够用,但在 Compose 1.7+ 的 Strong Skipping 默认下,游戏规则变了:Compose 编译器现在会更激进地跳过函数,代价是它需要更精确地判断"参数变了没有";一旦你的参数里有"看上去稳定但其实每次都重建"的对象——典型代表就是 lambda——重组就会在你看不见的地方反复触发,Layout Inspector 才看得见,但开发的时候你不会主动去看 Layout Inspector。这一篇讲清现代 Compose 性能心智的三件事:Strong Skipping 改变了什么、Compiler Metrics Report 怎么生成与怎么读、不稳定 lambda 的典型形态与修法。

Kotlin 心智在 [[03 Kotlin 2.0 语言心智]] 已经讲过,重组与状态在 [[07 重组、状态与 remember]] 给了基础;本篇是性能与工程化层的"承接篇",目标是让你从"Compose 跑得起来"过渡到"Compose 跑得稳"——把每一次重组都变成可测量、可解释的事件,而不是黑盒。

## 1. 机制定位

Compose 的执行模型有一个核心契约:**`@Composable` 函数是"描述 UI 应该长什么样"的纯函数,运行时(Recomposer)在状态变化时决定重新调用哪些函数,生成一棵新的 LayoutNode 树并 diff 旧树**。理想情况下,只有依赖了变化状态的 Composable 才会被重新调用,其它一概跳过。这个"跳过"机制本身就是性能的一切——做得对,1000 行 UI 改一个字符串只跑十几行;做错,一个状态变化触发整棵树重组,FPS 直接断崖。

为什么这件事难?因为编译器要在编译期判断"一个函数如果参数没变,能不能跳过执行",而 Kotlin 是一门"任何对象的 `equals` 都可能被重写、任何属性都可能是 `var`"的语言。Compose 编译器为此引入"稳定性"概念:**只有所有参数都是稳定的,函数才能被标记为 `skippable`**;不稳定参数一旦出现,函数每次都得跑——即便参数值看上去没变。

Compose 1.7 之前(包括 1.5 / 1.6 大部分时代)采用**保守跳过**:任何一个参数是不稳定类型,整个函数就不能跳过。为了让函数变得 skippable,你要么把数据类标 `@Immutable`、要么把字段全改 `val`、要么用 `kotlin.collections.immutable` 的不可变集合。社区里大量"Compose 性能优化指南"都在教这件事。

Compose 1.7+(对应 Kotlin 2.0 内嵌的 Compose Compiler 2.0.20+)默认启用 **Strong Skipping**——规则改成"哪怕参数是不稳定类型,只要这一次调用的实例与上一次相同(用引用相等 `===` 判断),依然可以跳过"。这一改让你不再需要为每个 data class 都加 `@Immutable`,实测能减少 30%-50% 的"为加注解而加注解"的样板代码。

但 Strong Skipping 有一个永远无法解决的死角:**lambda**。lambda 在 Kotlin 里是匿名对象,每次创建都是新实例,`===` 判断必然失败——除非编译器能证明它"没有捕获外部可变状态",才会自动给它包一层 `remember`(也就是文档里说的 `@DontMemoize` 的反义)。Compose 1.7+ 大幅扩展了"自动 memoize lambda"的范围,但仍然有规则之外的 lambda 会逃过这一层,每帧重建,触发子 Composable 重组。本篇要回答的就是:**哪些 lambda 还会"不稳定",怎么用 Compiler Metrics Report 找出来,怎么修**。

旧时代的对比也值得一句话讲清:Android View 系统里的 RecyclerView ViewHolder 是"手动 diff"——你要写 `DiffUtil.ItemCallback`,要写 `notifyItemChanged`,要在 `onBindViewHolder` 里逐字段判断"这个字段变没变,变了就 `setText`"。这是把"跳过逻辑"全交给开发者,易错且写起来恶心。Compose 把这件事变成自动的,但代价是你必须信任(并验证)它的稳定性判断——这是从"显式悲观"到"隐式乐观"的范式转换。

## 2. Android 心智

理解 Compose 性能必须先建立四个心智锚点:**稳定性**、**Restartable**、**Skippable**、**Strong Skipping**。

| 概念 | 含义 | 编译期决定 |
| --- | --- | --- |
| Stable | 类型实例的 `equals` 与公开属性互相一致,公开属性变化时会通知 Compose | 是 |
| Restartable | 该 `@Composable` 函数可作为重组的"边界",状态变化时只重启它 | 是 |
| Skippable | 所有参数稳定,该函数被调用时可基于参数比对决定是否真正执行 | 是 |
| Strong Skipping | 1.7+ 默认行为:即便参数包含不稳定类型,只要实例引用相同也可跳过 | 编译器行为 |

Compose 编译器把这些信息写进**Compiler Metrics Report**——一组三份文本/JSON,描述每个文件、每个类、每个 Composable 的稳定性结论。你打开它能看到:

```text
restartable skippable scheme("[androidx.compose.ui.UiComposable]") fun NoteList(
  stable notes: ImmutableList<Note>
  stable onClick: Function1<Note, Unit>
)
```

`restartable skippable` 是好结果,`restartable` 但不 `skippable` 说明有不稳定参数,`stable` / `unstable` 标在每个参数前。这份报告是 Compose 性能优化的唯一权威来源——不看它就调,等于在 [[23 Macrobenchmark 与 Baseline Profiles]] 里盲跑数据。

`@Immutable` 与 `@Stable` 注解在 Strong Skipping 默认下仍然有用,但理由变了。Strong Skipping 之前的目的是"让函数变 skippable";之后的目的是**"让 Compose 知道这个类型的两个实例可以用 `equals` 比较,而不是 `===`"**。典型场景:从 Repository 来的 `data class`,字段相同但每次都是新实例;不加 `@Immutable`,Strong Skipping 用 `===` 判断必然失败,函数还是会跑;加了 `@Immutable`,Compose 用 `equals` 判断,值相同就跳过。所以**`@Immutable` 是"告诉 Compose 这类型可以按值比对"的契约**,不是"让函数 skippable 的咒语"。

`key()` 这个 Composable 在性能优化里专门解决一类问题:**Compose 默认按"调用位置"识别 Composable 实例**,同一位置的相邻调用会复用 slot table 的同一槽。但循环渲染列表时,如果列表中间插入/删除一项,所有后续项的"位置"都会错位,Compose 用旧 state 渲染新数据,典型表现是输入框光标跳位、动画状态错乱。`LazyColumn` / `LazyRow` 提供 `items(list, key = { it.id })` 参数把这件事自动化,但写普通 `for` 循环就要显式 `key(item.id) { ... }`。

`remember { mutableStateOf() }` 看上去基础,但有两类典型失效模式:① 在某个 lambda 里 `remember`,lambda 被销毁重建时 `remember` 也丢了;② `remember(key)` 的 key 选错,导致 state 在不该重置时重置。这俩坑详见第 5 节。

`derivedStateOf` 是一个被低估的工具。它把"从某些 state 派生的计算"包成一个 state,只在底层依赖真变化时才重新计算,并且**只在 `value` 真变化时才通知下游重组**。典型用法是 `val showFab by remember { derivedStateOf { scrollState.firstVisibleItemIndex == 0 } }`——上面那行如果不用 `derivedStateOf`,每次 `firstVisibleItemIndex` 变化(每帧)都会让 `showFab` 触发下游重组;包上之后,只在 `== 0` 真变化时才通知。这是 LazyColumn 滚动相关性能的标配。

## 3. 工程实现

下面三段:启用 Compose Compiler Metrics Report 的完整 Gradle 配置、一个真实的不稳定 lambda 案例与修法、`LazyColumn` 稳定性的工程模板。所有代码假设你的项目已经按 [[02 项目骨架与构建工具链]] 用 Version Catalog 组织依赖,Kotlin 2.0+、Compose BOM 2024.10+ (Compose Compiler 内嵌于 Kotlin)、AGP 8.5+。

### 3.1 开启 Compose Compiler Metrics Report

Compose Compiler 自己就能产出 Metrics Report,但默认关闭。你要在 `:app` 模块的 `build.gradle.kts` 里通过 Compose Compiler Gradle Plugin 显式打开它。

文件:`app/build.gradle.kts`

```kotlin
import org.jetbrains.kotlin.compose.compiler.gradle.ComposeFeatureFlag

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)        // 2.0+ 内嵌 Compose Compiler
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

android {
    namespace = "com.notedx.app"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.notedx.app"
        minSdk = 26
        targetSdk = 35
    }
    buildFeatures { compose = true }
    kotlinOptions { jvmTarget = "17" }
}

composeCompiler {
    // 仅在显式启用时产出 report,默认 release 构建保持关闭以免拖慢 CI
    val enableMetrics = providers.gradleProperty("notedx.composeMetrics").orNull == "true"
    if (enableMetrics) {
        val outDir = layout.buildDirectory.dir("compose-reports")
        reportsDestination = outDir
        metricsDestination = outDir
    }
    // 1.7+ 默认就开 strong skipping,这里写出来是为了显式声明
    featureFlags.add(ComposeFeatureFlag.StrongSkipping)
}

dependencies {
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.activity.compose)
}
```

文件:`gradle.properties`

```properties
# 把这行加进 gradle.properties 后,只在需要看报告时跑
# ./gradlew :app:assembleRelease -Pnotedx.composeMetrics=true
notedx.composeMetrics=false
```

跑一次 release 构建后,产物会落在 `app/build/compose-reports/` 下,通常包含:

- `app_release-classes.txt`:每个类的稳定性结论
- `app_release-composables.txt`:每个 Composable 的 restartable / skippable / 参数稳定性
- `app_release-module.json`:模块级聚合,可被脚本消费
- `app_release-composables.csv`:CSV 版,适合扔进 spreadsheet diff

为什么强调"只在显式启用时打开":每次构建 metrics 会让 Kotlin 编译时间增加 10%-20%,CI 上常驻打开是浪费。推荐的工作流是:本地开发不开,准备发版前跑一次,把报告里的 `unstable` 与不 `skippable` 项列成清单逐个修;上线后每个迭代再扫一次。

### 3.2 一个真实的不稳定 lambda 案例

下面这段代码是 NotedX 早期版本的真实写法,看上去毫无问题——但 LazyColumn 滚动起来会显著掉帧,Layout Inspector 显示每个 NoteItem 每次滚到屏幕里都重组 5-10 次。

文件:`feature/notes/src/main/java/com/notedx/notes/NoteListScreen.kt`(问题版本)

```kotlin
package com.notedx.notes

import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

@Composable
fun NoteListScreen(
    state: NoteListState,
    onNoteClick: (Note) -> Unit,
    onArchive: (Note) -> Unit,
    onPin: (Note) -> Unit,
    analytics: Analytics,                       // 不稳定:Analytics 是 interface
) {
    LazyColumn {
        items(state.notes) { note ->
            // 问题 1:这是新建 lambda,每帧重建,触发 NoteItem 重组
            NoteItem(
                note = note,
                onClick = { onNoteClick(note); analytics.log("note_click", note.id) },
                onArchive = { onArchive(note) },
                onPin = { onPin(note) },
            )
        }
    }
}

@Composable
private fun NoteItem(
    note: Note,
    onClick: () -> Unit,
    onArchive: () -> Unit,
    onPin: () -> Unit,
) {
    Card { Text(note.title) }                   // 简化
}
```

跑一次 Metrics Report,你会在 `app_release-composables.txt` 里看到:

```text
restartable scheme("[androidx.compose.ui.UiComposable]") fun NoteListScreen(
  stable state: NoteListState
  stable onNoteClick: Function1<Note, Unit>
  stable onArchive: Function1<Note, Unit>
  stable onPin: Function1<Note, Unit>
  unstable analytics: Analytics
)
```

`NoteListScreen` 是 `restartable` 但不 `skippable`(因为 `analytics` 是接口,默认不稳定)。更严重的问题是子 Composable `NoteItem` 的 lambda 参数——每次重组都新建,Compose 1.7 的自动 memoize 救不了"在调用方现场组合多个外部回调"的 lambda。

修法分三步:

文件:`feature/notes/src/main/java/com/notedx/notes/NoteListScreen.kt`(修复版本)

```kotlin
package com.notedx.notes

import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import kotlinx.collections.immutable.ImmutableList

// 修法 1:把不稳定接口包成"动作集合",一次注入,引用稳定
@Immutable
data class NoteActions(
    val onClick: (Note) -> Unit,
    val onArchive: (Note) -> Unit,
    val onPin: (Note) -> Unit,
)

@Composable
fun NoteListScreen(
    notes: ImmutableList<Note>,                 // 修法 2:用不可变集合,而不是 List<Note>
    actions: NoteActions,
) {
    LazyColumn {
        // 修法 3:items 提供 key,让滚动时 slot 复用基于 id 而不是位置
        items(items = notes, key = { it.id }) { note ->
            NoteItem(note = note, actions = actions)
        }
    }
}

@Composable
private fun NoteItem(note: Note, actions: NoteActions) {
    // 修法 4:把"绑定到 note 的回调"在子函数里 remember,而不是父函数现场新建
    val onClick = remember(note.id, actions) { { actions.onClick(note) } }
    val onArchive = remember(note.id, actions) { { actions.onArchive(note) } }
    val onPin = remember(note.id, actions) { { actions.onPin(note) } }
    NoteItemContent(note = note, onClick = onClick, onArchive = onArchive, onPin = onPin)
}

@Composable
private fun NoteItemContent(
    note: Note,
    onClick: () -> Unit,
    onArchive: () -> Unit,
    onPin: () -> Unit,
) {
    Card { Text(note.title) }
}
```

修完再跑 Metrics:

```text
restartable skippable scheme("[androidx.compose.ui.UiComposable]") fun NoteListScreen(
  stable notes: ImmutableList<Note>
  stable actions: NoteActions
)

restartable skippable scheme("[androidx.compose.ui.UiComposable]") fun NoteItem(
  stable note: Note
  stable actions: NoteActions
)
```

`restartable skippable` 全绿,Layout Inspector 显示滚动时每个 `NoteItemContent` 重组 0 次(已经在屏幕上的)或 1 次(刚滑入的)。NotedX 的滚动 FPS 从 45 涨到稳定 60,这是 [[23 Macrobenchmark 与 Baseline Profiles]] 里用 ScrollBenchmark 量化出来的。

### 3.3 `derivedStateOf` 与 LazyColumn 派生状态

LazyColumn 滚动时,任何依赖 `firstVisibleItemIndex` / `firstVisibleItemScrollOffset` 的 UI 元素都是性能热点。下面是一个"滚到顶时显示返回顶部 FAB"的最小实现,展示 `derivedStateOf` 的标准用法。

```kotlin
@Composable
fun ScrollToTopFab(listState: LazyListState, onClick: () -> Unit) {
    // 不写 derivedStateOf 的话,firstVisibleItemIndex 每帧变,FAB 每帧重组
    val showFab by remember(listState) {
        derivedStateOf { listState.firstVisibleItemIndex > 0 }
    }
    AnimatedVisibility(visible = showFab) {
        FloatingActionButton(onClick = onClick) {
            Icon(Icons.Default.KeyboardArrowUp, contentDescription = "Scroll to top")
        }
    }
}
```

这里有两个细节常被忽略:`remember(listState)` 的 key 给的是 `listState` 本身——LazyListState 在重组中是稳定的,但如果你把 ScrollToTopFab 用在多个不同列表,Compose 需要知道"换列表时重置 derivedState";不传 key 就只在第一次 composition 算一次,后面换 listState 也不刷新。

## 4. 调参与验收

性能验收的硬指标只有三个,其它都是过程指标:

- **稳定性**:Metrics Report 里所有项目代码自定义的 Composable 都应当 `restartable skippable`,所有自己定义的 `data class` 都应当 `stable`(默认就是,只要字段全 `val` 且都是基础类型或稳定类型)。
- **重组次数**:Layout Inspector → Composition Counts(Android Studio Iguana+ 内置面板),滚动一屏 LazyColumn,屏幕上每项重组次数应当 ≤ 1。
- **滚动 fps**:Macrobenchmark ScrollBenchmark 实测应稳定在目标设备的刷新率(60 / 90 / 120 Hz)上下浮动 < 5%。详见 [[23 Macrobenchmark 与 Baseline Profiles]]。

读 Metrics Report 的清单(从严重到不重要):

1. **`restartable` 但不 `skippable`**:最高优先级,意味着每次父 Composable 重组,这个函数必跑。
2. **`unstable` 参数**:看类型,如果是自家 `data class`,优先改成 `val` 字段或加 `@Immutable`;如果是接口/抽象类,考虑包成"动作集合"或者标 `@Stable`(只有当你能保证 `equals` 一致才行)。
3. **`Function1`、`Function2` 等 lambda 参数被标 `unstable`**:意味着这个 lambda 在调用现场新建,且 Compose 没自动 memoize;在调用方用 `remember { { ... } }` 包一层。
4. **第三方库的不稳定类型**:`java.util.List` / `java.util.Map` / `kotlin.collections.List` 默认不稳定;迁移到 `kotlinx.collections.immutable.ImmutableList` / `PersistentList`。

`@Stable` 与 `@Immutable` 的取舍:

| 注解 | 语义 | 用在哪里 |
| --- | --- | --- |
| `@Immutable` | 实例字段永不变 (deeply immutable),`equals` 可信 | data class with all `val` and immutable fields |
| `@Stable` | 实例字段可变,但变化时会通知 Compose;`equals` 与公开属性一致 | 持有 `MutableState` 的 Holder / StateFlow wrapper |
| 不标 | 默认推断 | 优先让编译器推断,推断不出来再标 |

实测经验:**90% 情况下不需要主动加注解**,编译器对纯 Kotlin `data class` + `val` + 基础类型字段的推断是准确的。需要主动加的常见三种:① data class 里有 `List` / `Map` 字段;② 类实现了某个接口而你只暴露接口;③ 跨模块的类型,编译器看不到完整定义。

Layout Inspector 的 Composition Count 是验收最直观的工具。打开方式:Android Studio 运行 app → Tool Windows → Layout Inspector → 进入 Compose 屏幕后右上角的"Show recomposition counts"按钮。每个 Composable 节点会显示一个数字,数字旁边的小箭头(↑)表示"跳过",数字本身是"真正重组"的次数。理想结果是大部分节点显示"1↑n"(初始 1 次,后续 n 次跳过),而不是"5 0↑"(5 次重组、0 次跳过)。

## 5. 踩坑

**坑 1:`@Stable` 与 `@Immutable` 的契约违约,后果是诡异的"UI 不更新"**。`@Immutable` 是给 Compose 编译器的"我承诺这个类的所有字段永不变"的契约,如果你给一个 data class 加了 `@Immutable` 但其中一个字段是 `var`,Compose 会基于这个错误前提做激进跳过,字段真的变了 UI 也不刷新——而且没有任何编译期警告。修法:`@Immutable` 只用于"所有字段 val、所有字段类型也是 immutable"的 data class;有任何怀疑就先不加,让编译器自动判断。

**坑 2:`remember { mutableStateOf() }` 在 lambda 里,key 缺失导致重置**。

```kotlin
// 反模式:每次外部状态变化,内部 expanded 都重置
@Composable
fun Expandable(content: @Composable () -> Unit) {
    val expanded = remember { mutableStateOf(false) }  // 看着对,实际有坑
    if (expanded.value) content()
    Button(onClick = { expanded.value = !expanded.value }) { Text("Toggle") }
}
```

这段代码本身没问题,但如果 `Expandable` 被放进 LazyColumn 没给 key,滚出屏幕再滚回来,`expanded` 会被重置——因为 LazyColumn 默认按位置识别项,滚出屏幕的项会被销毁。修法:给 LazyColumn 的 `items` 加 `key = { it.id }`,或者把状态提到外面变成 `rememberSaveable` / 由 ViewModel 持有。

**坑 3:在 `@Composable` 里 `new` 集合或对象,每次都是新实例**。

```kotlin
// 反模式
@Composable
fun BadList(items: List<String>) {
    val sortedItems = items.sortedBy { it.length }       // 每次重组都重新排
    val handler = MyHandler()                            // 每次都新 handler
    LazyColumn { items(sortedItems) { Text(it) } }
}
```

修法:`val sortedItems = remember(items) { items.sortedBy { it.length } }`、`val handler = remember { MyHandler() }`。注意 `remember` 的 key:依赖输入变化的计算用 `remember(input)`,完全不依赖输入的用 `remember { ... }`。

**坑 4:Strong Skipping 不能救"在 Composable 里访问 ViewModel 暴露的 StateFlow"**。

```kotlin
// 反模式:在 Composable 内多次 collectAsStateWithLifecycle 同一个 StateFlow
@Composable
fun Screen(vm: NotesViewModel = hiltViewModel()) {
    val state by vm.uiState.collectAsStateWithLifecycle()
    val isLoading by vm.isLoading.collectAsStateWithLifecycle()  // 单独的 StateFlow
    // ...
}
```

每个 `collectAsStateWithLifecycle` 都是独立的订阅,各自会触发重组。正确做法是 ViewModel 暴露**单个 `UiState` 数据类**包含所有字段,Compose 一次 collect、按字段读取,UI 重组只在真正使用到的字段变化时发生。这条契约是 [[11 应用架构:ViewModel、UDF 与 UI State]] 的核心。

**坑 5:`MutableState<List<T>>` vs `mutableStateListOf()`**。

```kotlin
// 反模式:每次操作都新建整个 List
val items by remember { mutableStateOf(emptyList<Note>()) }
items += newNote                              // 整个 list 替换,所有项重组

// 正确:增量更新
val items = remember { mutableStateListOf<Note>() }
items.add(newNote)                            // 只触发 LazyColumn 增量更新
```

`mutableStateListOf` 是专门设计来跟 Compose 配合的可观察 List,内部用快照系统精确追踪"哪一项变了"。NotedX 列表场景全部用 `mutableStateListOf` / `mutableStateMapOf`,不要用 `MutableState<List<T>>`。

**坑 6:跨模块类型默认不稳定**。如果你把 `data class Note` 放在 `:data` 模块,在 `:feature-notes` 模块的 `@Composable` 里用它,Compose Compiler 编译 `:feature-notes` 时**看不到** `Note` 的定义,只能保守认为它不稳定。两种修法:① 给所有公开 data class 显式加 `@Immutable`;② 在 `composeCompiler` 里配置 `stabilityConfigurationFile` 指向一份显式的稳定类列表。NotedX 选 ①,因为列表难维护。

```kotlin
// data/src/main/java/com/notedx/data/model/Note.kt
@Immutable
data class Note(
    val id: String,
    val title: String,
    val body: String,
    val updatedAt: Long,
)
```

**坑 7:`@Composable` lambda 捕获 `var` 局部变量**。

```kotlin
@Composable
fun Counter() {
    var count = 0                                                // 普通 var,不是 State
    Button(onClick = { count++; println(count) }) { Text("$count") }  // 永远显示 0
}
```

普通 `var` 不是 Compose 状态,改它不触发重组,UI 永远停在初始值。修法用 `var count by remember { mutableStateOf(0) }`。这个错最常发生在从其它 UI 框架迁移过来的人身上,Compose 的 State 是显式契约,不是隐式响应式。

**坑 8:`LaunchedEffect(Unit)` 的 key 选错**。`LaunchedEffect(Unit)` 只在第一次进入时跑一次;`LaunchedEffect(someState)` 在 someState 变化时取消旧的、起新的。常见错误是想"组件销毁时清理"却用 `LaunchedEffect(Unit)`,应该用 `DisposableEffect(Unit) { onDispose { ... } }`。LaunchedEffect 在父函数离开 composition 时也会自动取消协程,但不能在协程取消之外做"销毁清理"动作。

**坑 9:`CompositionLocal` 的滥用**。把"主题色"、"当前用户"、"语言"放进 `CompositionLocalProvider` 没问题,但把"全局 ViewModel"、"Repository"塞进去是反模式——这会绕过 Hilt 的依赖图、绕过测试时的 Fake 替换,最关键的是 CompositionLocal 变化会触发所有读取它的 Composable 重组,粒度很粗。原则:CompositionLocal 只放"几乎不变的环境量",其它用 Hilt + ViewModel 注入。

**坑 10:Layout Inspector 的"Composition Counts"在 release 构建关掉**。Compose 的运行时跟踪有开销,正式 release 包默认关闭重组计数。开发期看是没问题,但不要在 release 包上验证;验证用 Macrobenchmark 跑 FrameTimingMetric 与 TraceSectionMetric,详见 [[23 Macrobenchmark 与 Baseline Profiles]]。

**坑 11:`@Stable` 给一个会变的类是 UB**。`@Stable` 的契约要求"实例可变但变化时通过 Compose 已知机制(`MutableState` / 快照系统)通知"。如果你给一个普通 `class Holder { var x = 0 }` 加 `@Stable`,Compose 会用 `equals` 跳过,但你改 `x` 没有通知,UI 不刷新——而且没有警告。`@Stable` 只用在确实持有 `MutableState` 字段的 Holder 类。NotedX 几乎不主动加 `@Stable`,Holder 模式直接持 `MutableStateFlow` + 暴露 `StateFlow`。

**坑 12:`LazyColumn` 的 contentType 没设**。`items(list, key = { ... }, contentType = { it.kind })` 第三个参数让 LazyColumn 知道"项目类型"以复用 ViewHolder——是的,LazyColumn 内部也有 ViewHolder 池。混排不同类型的项(章节标题 + 笔记 + 广告)不设 contentType,池失效,每次滑入都要重建整个子树。设了之后,同类型项之间复用 slot,只是数据替换。

## 手动验证

- [ ] `./gradlew :app:assembleRelease -Pnotedx.composeMetrics=true` 产出 `app/build/compose-reports/` 三个文件。
- [ ] `app_release-composables.txt` 里所有自定义 Composable 标 `restartable skippable`,没有 `unstable` 参数。
- [ ] Android Studio Layout Inspector 打开 Composition Counts,滚动 LazyColumn 一屏,各项重组次数 ≤ 1。
- [ ] 故意把一个 data class 字段从 `val` 改成 `var`,重跑 metrics,该类型变成 `unstable`,引用它的 Composable 不再 `skippable`,确认能定位到位置。
- [ ] 在 NoteItem 上加一行 `SideEffect { Log.d("recomp", "NoteItem ${'$'}{note.id}") }`,滚动 LazyColumn,只在新滑入的项打印,屏幕上滚出再滚回来同一项不重复打印(因为 LazyListState 复用 slot)。
- [ ] 把 `items(notes)` 的 `key` 参数移除,在列表中间插入一项,观察输入框焦点 / 已展开折叠状态错位,验证 key 的必要性。
