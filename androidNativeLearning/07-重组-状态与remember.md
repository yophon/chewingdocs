# 07-重组、状态与 remember

> 一句话导读:Compose 不是"我改 UI",而是"我改 state,框架重画"。这一篇把 state 怎么被追踪、什么时候被丢、什么时候不会重画讲透,顺便交代 Compose 1.7 默认开启的 Strong Skipping 改变了哪些过去要写的注解。

第 06 篇把单 Activity + `setContent {}` 的入口跑通了,屏幕上有了第一个 Composable。但只要交互稍微多两步,新手立刻撞上同样的问题:点击按钮数字不变(忘了用 `mutableStateOf`)、旋转屏幕状态清零(没用 `rememberSaveable`)、性能 Profiler 一开发现整棵树每次都在重组。这一篇就是把这三个问题的根因——Compose 的 Snapshot 系统与重组范围——讲到能在脑子里画图的程度。

读者画像默认:你已经能在 Android Studio 里运行 `setContent { Greeting("World") }`,会读 `@Composable` 函数签名,但你不清楚 `remember { mutableStateOf(0) }` 这串符号背后引擎在做什么,也没听说过 2026 年大家在 Compose 1.7 之后默认就不用再写 `@Stable` 了的事。本篇要把这些都补齐。

## 1. 机制定位

### 1.1 命令式 UI 的根本困境

老 Android(Java + XML View)有一个不成文的"双向 ping-pong":XML 里写 `<TextView android:id="@+id/score" />`,Activity 里 `findViewById(R.id.score)` 拿引用,在 click listener 里手动 `textView.setText("score: $n")`。每多一个 UI 元素就多一对"持有引用 + 手动 setText"。问题不在写法长,而在**忘了同步**:数据改了 5 处,UI 只在 3 处 setText,剩下 2 处屏幕显示就跟内存对不上。Debug 这种问题没有套路,只能靠"想起来"。

SwiftUI、React、Flutter 与 Compose 选择的是声明式:**UI = f(state)**,UI 是状态的纯函数,框架负责对比上一帧的输出与这一帧的输出,把差异 patch 到屏幕。你只管改 state,UI 自动跟。这条心智的代价是:**你不能再像写 View 那样,"等 UI 长出来再去取它"。** Compose 里没有 "id" 也没有 `findViewById`,UI 树是每次重组重新表达的函数调用结果。

### 1.2 Compose 的三个不变量

理解后面所有 API 之前,先记住三条 Compose 的硬规矩:

1. **`@Composable` 函数只能被另一个 `@Composable` 调用**,因为它隐式接收一个 `Composer` 参数,这个参数由 Kotlin Compose Compiler 在编译期插入。
2. **`@Composable` 函数可能被调用任意多次、任意顺序、任意线程**——框架决定何时重新执行哪一段,你不能假设它"只跑一次"。
3. **重组的最小单位是 `@Composable` 函数的边界,不是文件、不是类**。函数内读了哪些 state,就只有读到这些 state 的"子树"会在 state 变化时重组。

这三条意味着:把网络请求、计时器、`println` 写在 `@Composable` 顶层是错的,它们会随重组次数线性放大。所有副作用要走 `LaunchedEffect` / `DisposableEffect` / `SideEffect`(本篇不展开,放第 10 篇)。

### 1.3 Compose 1.7 的一次"沉默的大变"

在 Compose 1.6 及之前,工程师要在自定义 data class 上手动写 `@Immutable` / `@Stable` 注解,Compose Compiler 才会判定它"稳定"并对持有它的 Composable 启用 skipping。没注解、字段含集合 / lambda 的类,只要其中任一字段变化甚至父级重组,持有它的整棵 UI 都会跟着重组——这就是过去 Compose 性能报告里 80% 的内容。

**Compose 1.7(2024-09 GA)默认开启 Strong Skipping**(项目模板 `androidx.compose.compiler` 选项 `strongSkipping` 默认 true)。它的语义是:**没有 `@Stable` 注解的类,只要每次传入参数的引用相等(`===` 或 equals),也跳过该 Composable 的重组**。这一改动直接把过去 "data class 没 `@Stable` 就摆烂" 的反应模式翻篇了。

但 Strong Skipping 不是银弹,它把另一类问题暴露到了前台:**不稳定 lambda**。任何在 `@Composable` 体内现场写的 `{ ... }`,如果捕获了不稳定状态(例如不稳定的 ViewModel 引用、不稳定的 list),每次重组都会生成新实例,引用不相等,就会让子 Composable 重组。Compose 1.7 之前这条早就成立,只是被"data class 不稳定"的更大问题掩盖了;1.7 之后,它成了**最常见的剩余重组源**。本篇 §5 会演示并给修法。

### 1.4 什么时候仍要写 `@Stable` / `@Immutable`

Strong Skipping 默认开启不代表注解作废,以下三种情形仍然要显式标注:

1. **跨模块边界**:你的 `:core-domain` 模块导出一个 data class,被 `:feature-home` 引用。Strong Skipping 是 module-by-module 的编译期分析,跨模块时除非两边都开 strongSkipping 才生效;只要其中一端没开,显式 `@Stable` 是最稳的兜底。
2. **接口或 sealed 类型**:Strong Skipping 不会推断接口的稳定性;`Repository`、`UseCase` 这种被 Composable 当参数的接口,要么标 `@Stable` 要么改用 fun interface + Strong Skipping。
3. **持有可变集合或 `var` 的 data class**:Strong Skipping 看的是字段类型层面的稳定性,`var` 或 `MutableList` 会直接判定不稳定,即便实际运行时不变。这种类要么改成 `val` + `ImmutableList`(`kotlinx.collections.immutable`),要么标 `@Stable` 并自己保证不被外部改。

## 2. Android 心智

### 2.1 `State<T>` 与 `mutableStateOf`

`State<T>` 是 Compose 的最小可观察单位,只有两个方法:`getValue` 与(在 `MutableState<T>` 子接口里)`setValue`。Kotlin `operator fun` 加上 `import androidx.compose.runtime.getValue` / `setValue`,就能用 `by` 语法去掉 `.value`:

```kotlin
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue

var count by mutableStateOf(0)   // 不在 Composable 里,要包到 remember
```

`mutableStateOf` 返回的对象是一个 **Snapshot State**:它的读写经过 Compose 的 Snapshot 系统,读操作记录"谁读了我",写操作通知"所有读过我的人在下一次合适的时机重组"。这条单向追踪机制是 Compose 全部增量更新的发动机。

### 2.2 `remember` vs `rememberSaveable`

`@Composable` 函数会被多次调用,本地 `val x = SomeExpensiveThing()` 每次都重新算。`remember(key) { expr }` 把 expr 的结果存进 Composition 的内存中,只在 key 变化或当前 Composition 离场(dispose)时丢弃:

```kotlin
val counter = remember { mutableStateOf(0) }                 // 配置改变(旋屏)会丢
val counter2 = rememberSaveable { mutableStateOf(0) }        // 配置改变后从 Bundle 恢复
```

两者的边界:

| 维度 | `remember` | `rememberSaveable` |
| --- | --- | --- |
| 存放位置 | Composition 内存 | Bundle(由 ActivityOnSaveInstanceState 持久化) |
| 失效条件 | Composable 离场 / key 变化 | 进程被杀仍可恢复;Composable 离场失效 |
| 支持类型 | 任意 | Parcelable / Serializable / 自定义 Saver |
| 典型用途 | 缓存计算结果、UI 局部状态 | 表单输入、滚动位置、抽屉展开状态 |

`rememberSaveable` 不能直接保存任意类型——对于自定义 data class 必须提供 `Saver<T, Bundle>`,或者把 data class 标为 `@Parcelize`(用 `kotlin-parcelize` 插件)。

### 2.3 重组范围:谁读 state,谁重组

Compose 重组的边界不是文件,不是 class,而是**调用站点**:任何 `@Composable` 函数体内读了某个 `State`,它就成为该 state 的订阅者,state 写入时只有这些订阅者会重组。

```kotlin
@Composable
fun CounterScreen(vm: CounterViewModel) {
    val count by vm.count.collectAsStateWithLifecycle()
    Column {
        Text("count = $count")           // 只读 count,count 变化时只重组这里
        ExpensiveChart()                 // 没读 count,理想情况下完全跳过
        Button(onClick = vm::increment) { Text("+1") }
    }
}
```

如果 `ExpensiveChart()` 在 count 变化时也被重组,问题不在它,而是它的**调用站点上方读了 count**。常见错位:

```kotlin
Column {
    val count by vm.count.collectAsStateWithLifecycle()  // 读在 Column 内
    Text("count = $count")
    ExpensiveChart()                                      // 同一个 scope,会跟着重组
}
```

把 `val count by ...` 下沉到只用它的子 Composable(或把读它的部分抽出来),`ExpensiveChart` 就能稳定跳过。这是 Compose 性能调优最常用的手法。

### 2.4 `derivedStateOf`:把"读多个 state、产物只一个"做成增量

```kotlin
val isLastItemVisible by remember {
    derivedStateOf {
        listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ==
            listState.layoutInfo.totalItemsCount - 1
    }
}
```

直接在 Composable 体里写 `if (cond1 && cond2 && cond3)`,每次任一条件变都会重新评估并触发依赖该结果的下游重组。`derivedStateOf` 把这个表达式包成"只在最终结果变化时通知",上面例子里玩家滑了一千行只要"是否到底"没翻转,就不会触发依赖该值的 Composable 重组。

经验:**派生出布尔 / 一两个简单字段、依赖多个 state、消费侧重组成本高**——这三条都符合时,用 `derivedStateOf`。一两次比较省不出什么,反而多一层 wrapper。

### 2.5 `key(...)`:强制重置子树状态

`key()` 是个特殊的 Composable,它告诉 Compose "下面这块用这个 key 标识,key 变化时整段 dispose 重建":

```kotlin
@Composable
fun MessageList(messages: List<Message>) {
    Column {
        for (m in messages) {
            key(m.id) {                  // 同一条消息保留状态,id 变化整段重建
                MessageItem(m)
            }
        }
    }
}
```

这等价于 `LazyColumn` 的 `items(messages, key = { it.id })` 的语义——稳定 key 让 Compose 在列表项被插入 / 移除 / 重排时只对真正变化的项做处理,而不是整列重组。

## 3. 工程实现

下面给一个"NotedX 笔记编辑器"里的小片段:一个标题输入、一个标签输入、一个保存按钮。涉及 `remember` / `rememberSaveable` / `derivedStateOf` / `key()` / Strong Skipping 的稳定 / 不稳定边界。

**第一步:定义稳定 UI State**

文件 `app/src/main/java/com/notedx/feature/note/NoteEditState.kt`:

```kotlin
package com.notedx.feature.note

import androidx.compose.runtime.Immutable
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.persistentListOf

@Immutable
data class NoteEditState(
    val title: String = "",
    val tags: ImmutableList<String> = persistentListOf(),
    val isSaving: Boolean = false,
) {
    val canSave: Boolean
        get() = title.isNotBlank() && !isSaving
}
```

关键点:

- `ImmutableList` 来自 `org.jetbrains.kotlinx:kotlinx-collections-immutable`,Compose Compiler 视为 stable;直接用 `List<String>` 会被判定不稳定,即便实际是 `listOf("a")`。
- 即便 Compose 1.7 Strong Skipping 默认开,跨模块时仍写 `@Immutable` 兜底,这是 §1.4 的第一条规则。
- `canSave` 是计算属性而不是字段,避免把"派生数据"塞进 State——派生应放在 UI 层的 `derivedStateOf`,或在这里以 `val` 计算。

**第二步:ViewModel 持有不可变 UI State,暴露 StateFlow**

文件 `app/src/main/java/com/notedx/feature/note/NoteEditViewModel.kt`:

```kotlin
package com.notedx.feature.note

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.collections.immutable.toPersistentList
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class NoteEditViewModel @Inject constructor(
    private val repository: NoteRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(NoteEditState())
    val state: StateFlow<NoteEditState> = _state.asStateFlow()

    fun onTitleChange(value: String) = _state.update { it.copy(title = value) }

    fun onTagsChange(tags: List<String>) = _state.update {
        it.copy(tags = tags.toPersistentList())
    }

    fun save() {
        if (!_state.value.canSave) return
        _state.update { it.copy(isSaving = true) }
        viewModelScope.launch {
            repository.save(_state.value)
            _state.update { it.copy(isSaving = false) }
        }
    }
}
```

`update { it.copy(...) }` 是 Kotlin Coroutines 1.7+ 的标准写法,原子地拿旧值生成新值,避免并发写覆盖。`StateFlow` 在第 05 篇详讲过,这里只用它的"可冷热观察"特性。

**第三步:Composable 屏幕**

文件 `app/src/main/java/com/notedx/feature/note/NoteEditScreen.kt`:

```kotlin
package com.notedx.feature.note

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle

@Composable
fun NoteEditScreen(
    onDone: () -> Unit,
    viewModel: NoteEditViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    NoteEditContent(
        state = state,
        onTitleChange = viewModel::onTitleChange,        // 方法引用,稳定
        onSave = {
            viewModel.save()
            onDone()
        },
    )
}

@Composable
private fun NoteEditContent(
    state: NoteEditState,
    onTitleChange: (String) -> Unit,
    onSave: () -> Unit,
) {
    // rememberSaveable:旋屏后草稿仍在
    var draftTag by rememberSaveable { mutableStateOf("") }

    // derivedStateOf:tag 至少 2 个字符才视为有效,合并到 enabled
    val isTagValid by remember {
        derivedStateOf { draftTag.length >= 2 }
    }

    Scaffold { padding ->
        Column(Modifier.padding(padding).padding(16.dp)) {
            OutlinedTextField(
                value = state.title,
                onValueChange = onTitleChange,
                label = { Text("标题") },
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = draftTag,
                onValueChange = { draftTag = it },
                label = { Text("标签草稿") },
                modifier = Modifier.fillMaxWidth(),
            )
            Button(
                onClick = onSave,
                enabled = state.canSave && isTagValid,
            ) {
                Text(if (state.isSaving) "保存中..." else "保存")
            }
        }
    }
}
```

设计要点逐条对应 §2:

- `viewModel::onTitleChange` 是**方法引用**,Compose Compiler 视为稳定;不是 `{ value -> viewModel.onTitleChange(value) }` 这种 lambda(后者每次重组都重新生成,会破坏 Strong Skipping)。
- `onSave` 不得不写成 lambda(因为里面要调两个方法),但它的捕获只有 `viewModel` 和 `onDone`,两者在 Composition 生命周期内引用稳定;Compose 1.7 Strong Skipping 会对它做引用相等比较,通常不触发额外重组。
- `draftTag` 这种"只在本屏使用、用户期望旋屏后还在"的本地状态,用 `rememberSaveable`;放进 ViewModel 反而是过度设计。
- `isTagValid` 用 `derivedStateOf`,即使将来加更多校验(长度、字符集、重复检查),消费侧重组不会被任一条件波动放大。

**第四步:列表里用 `key()` 防止整列重组**

文件 `app/src/main/java/com/notedx/feature/note/TagChips.kt`:

```kotlin
package com.notedx.feature.note

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import kotlinx.collections.immutable.ImmutableList

@Composable
fun TagChips(
    tags: ImmutableList<String>,
    onRemove: (String) -> Unit,
) {
    LazyRow {
        items(tags, key = { it }) { tag ->                // 稳定 key,避免重排时整列重组
            AssistChip(
                onClick = { onRemove(tag) },
                label = { Text(tag) },
                trailingIcon = { Text("x") },
                colors = AssistChipDefaults.assistChipColors(),
            )
        }
    }
}
```

`items(tags, key = { it })` 用 tag 字符串本身做 key,前提是同一时刻不会重复。换成 `items(tags.withIndex().toList(), key = { it.index })` 是反例:索引随插入 / 删除变化,key 不稳定,Compose 会以为整列变了。

## 4. 调参与验收

### 4.1 用 Compose Compiler Metrics 量化稳定性

在 `app/build.gradle.kts` 里启用编译期报告,把不稳定参数的位置打到磁盘:

```kotlin
composeCompiler {
    reportsDestination.set(layout.buildDirectory.dir("compose_compiler"))
    metricsDestination.set(layout.buildDirectory.dir("compose_compiler"))
}
```

(Kotlin 2.0.20+ 内嵌 Compose Compiler 后,DSL 从 `composeOptions { ... }` 迁到顶层 `composeCompiler { ... }`。)

运行 `./gradlew :app:assembleRelease`,然后在 `app/build/compose_compiler/` 下找:

- `*-classes.txt`:每个类的稳定性判定。能看到 `stable class NoteEditState`、`unstable class FormRow`(因为持有 lambda 字段)。
- `*-composables.txt`:每个 Composable 的 skippability。`restartable skippable fun NoteEditScreen` 是理想形态;`restartable fun NoteEditScreen`(没 skippable)说明它的某个参数不稳定。
- `*-module.json`:整模块汇总,可以脚本化报警 "unstable 数量回归"。

### 4.2 Layout Inspector 看重组计数

Android Studio Hedgehog+ 的 Layout Inspector(`View → Tool Windows → Layout Inspector`)在 Composable 节点上能直接显示 **Recomposition count** 与 **Skip count**。理想状态:静止 UI 不应有 recomposition;交互后只有真正变化的子树计数 +1。如果你看到根 Composable 计数随便就到 100+,十有八九是 §5.2 的不稳定 lambda 问题。

### 4.3 验收清单

- [ ] 项目里所有 UiState 都是 data class + `val` 字段,集合用 `ImmutableList`。
- [ ] 跨模块导出的 data class / sealed type 显式标 `@Immutable` 或 `@Stable`。
- [ ] Compose Compiler Metrics 报告里,屏幕级 Composable 全部是 `restartable skippable`。
- [ ] 把 ViewModel 方法传给 Composable 时用 `viewModel::methodName`,不是 `{ viewModel.methodName(it) }`。
- [ ] `LazyColumn` / `LazyRow` 都给 `items(list, key = { ... })`,key 是稳定唯一的业务 id。
- [ ] 表单的"草稿态"(用户输了一半但还没提交)用 `rememberSaveable`,旋屏后不丢。
- [ ] 至少有一处 `derivedStateOf` 把多个 state 合成一个布尔,且它的依赖里有"高频但产物稳定"的源(例如滚动位置)。

## 5. 踩坑

### 5.1 `remember { mutableStateOf(...) }` 写成 `remember { MutableStateFlow(...) }`

```kotlin
// 错:Flow 不是 Compose State,Composable 不会订阅
val state = remember { MutableStateFlow(0) }
Text("$state")        // 永远打 "MutableStateFlow(value=0)"

// 对:用 collectAsStateWithLifecycle 桥接
val v by state.collectAsStateWithLifecycle()
Text("$v")
```

这条最容易在"从 ViewModel 抄了一段 MutableStateFlow 到 Composable"时犯,根因是没区分 Flow 与 State 两个概念。Compose 只追踪 `SnapshotState` 的读写,Flow 必须经过 `collectAsStateWithLifecycle` / `collectAsState` 才能产生 State。

### 5.2 不稳定 lambda 是 Compose 1.7 之后第一性能问题

```kotlin
// 反例:每次重组 lambda 引用都新生成,子 Composable 跟着重组
ExpensiveItem(
    item = item,
    onClick = { viewModel.handle(item.id) },   // 捕获 item,引用每次变
)

// 修法 1:用方法引用 + bind 通过参数传递
ExpensiveItem(item = item, onClick = onClickById, id = item.id)

// 修法 2:在 ViewModel 暴露一个 (Int) -> Unit 单例
ExpensiveItem(item = item, onClick = viewModel.onClick)
```

Strong Skipping 比对的是引用相等;lambda 在 Composable 体内现场写就是不相等。修法不是"少写 lambda",而是把 lambda **上抬到不会被频繁重组的位置**(屏幕顶层、ViewModel 字段),或把它捕获的可变量改通过参数传递。

### 5.3 `rememberSaveable` 直接保存自定义类型会运行时崩

```kotlin
data class Cart(val items: List<String>)

// 错:Bundle 不知道怎么序列化 Cart
var cart by rememberSaveable { mutableStateOf(Cart(emptyList())) }
```

修法二选一:用 `kotlin-parcelize` 把 Cart 标 `@Parcelize`;或者写 Saver。

```kotlin
val cartSaver = Saver<Cart, List<String>>(
    save = { it.items },
    restore = { Cart(it) },
)
var cart by rememberSaveable(stateSaver = cartSaver) { mutableStateOf(Cart(emptyList())) }
```

### 5.4 在 Composable 顶层算重型派生

```kotlin
// 错:每次重组都扫一遍 list
@Composable
fun Page(items: List<Note>) {
    val total = items.sumOf { it.attachments.size }    // 在重组热路径
    Text("total=$total")
}

// 对:把派生包进 derivedStateOf,并先用 remember(items)
@Composable
fun Page(items: List<Note>) {
    val total by remember(items) {
        derivedStateOf { items.sumOf { it.attachments.size } }
    }
    Text("total=$total")
}
```

`remember(items)` 的 key 用 `items` 引用本身,只在引用变化时重算。

### 5.5 `key()` 用错位置会把状态全部 dispose

```kotlin
// 错:每次 page 变化,整个 Composable 被销毁重建,内部 remember 全丢
key(page) {
    val draft = remember { mutableStateOf("") }   // 永远是 ""
    Editor(draft)
}
```

`key()` 是"故意 reset 一切"。如果你的目的只是"让数据驱动 UI 重画",根本不需要 `key()`——直接把数据传进去就行。`key()` 只在"明确要复位子树状态"(例如不同用户切换、不同笔记切换)时用。

### 5.6 Strong Skipping 不是 "data class 不用 `@Stable` 了"

Strong Skipping 默认开启的是 **runtime 引用相等比较**,不是"把所有类视为稳定"。两个区别:

- Skippable 仍然要求函数所有参数都能做相等比较;有 lambda 参数时,这条仍然受 §5.2 影响。
- 跨模块时,被依赖侧的模块没开启 Strong Skipping 选项,使用侧得不到收益(`@Stable` 标注仍生效)。检查方法:`compose_compiler` 报告里看类是不是 `stable class ...`,不是的话补 `@Stable`。

### 5.7 `LaunchedEffect` 的 key 用错会让协程一直重启

虽然本篇不展开副作用,但提一句相关坑——把 `state` 整个传给 `LaunchedEffect` 的 key:

```kotlin
// 错:state.copy(...) 每次都是新引用,协程被反复 cancel + restart
LaunchedEffect(state) { sendAnalytics(state.title) }

// 对:只用真正需要重启的字段做 key
LaunchedEffect(state.title) { sendAnalytics(state.title) }
```

这条与 Strong Skipping 无关,但常见。第 10 篇会全面讲 effect 的 key 选择。

### 5.8 `mutableStateListOf` vs `mutableStateOf(listOf())`

```kotlin
// A:list 引用不变,Snapshot 不通知,UI 不更新
val items = remember { mutableStateOf(mutableListOf<String>()) }
Button(onClick = { items.value.add("x") }) { Text("add") }

// B:用 SnapshotStateList,add 内部触发通知
val items = remember { mutableStateListOf<String>() }
Button(onClick = { items.add("x") }) { Text("add") }
```

`mutableStateListOf` 返回 `SnapshotStateList`,内部对 add / remove 都做 Snapshot 写入;`mutableStateOf(mutableListOf())` 只追踪 `value =` 这一次替换,内部修改不通知。在 ViewModel 里用 `StateFlow<ImmutableList<T>>` + `update { it.copy() }` 是另一种正确做法;在 Composable 本地 state 里要列表,用 `mutableStateListOf`。

### 5.9 `produceState` 与 `LaunchedEffect` 混用

`produceState { ... }` 把 effect 与 state 合一,常被新手写成既 `produceState` 又 `LaunchedEffect` 同时副作用,两套都在跑。规则:同一份外部数据来源,只用一种桥接方式——通常 ViewModel + `collectAsStateWithLifecycle` 已经足够,`produceState` 留给"非 ViewModel 数据,例如 Activity Intent 解析"这种场景。

### 5.10 移植旧 LiveData 的两种姿势

Kotlin 2.0 / Compose 1.7 时代,LiveData 已经只是兼容层。在 Composable 里:

```kotlin
// A:用 androidx.compose.runtime.livedata.observeAsState
val name by viewModel.userName.observeAsState("")

// B(推荐):在 ViewModel 把 LiveData 转 StateFlow
val userNameFlow = userName.asFlow().stateIn(viewModelScope, SharingStarted.Eagerly, "")
// Composable:
val name by viewModel.userNameFlow.collectAsStateWithLifecycle()
```

新项目直接用 StateFlow,不再引 `compose-runtime-livedata`。LiveData 唯一仍优于 StateFlow 的点是"自动感知 Activity / Fragment 生命周期",但 `collectAsStateWithLifecycle`(`androidx.lifecycle:lifecycle-runtime-compose`)已经把这条补齐。

---

State、`remember`、Snapshot 与 Strong Skipping 这四件事一起决定了"Compose 是不是真的省事"。把它们守好,屏幕级 Composable 在 Layout Inspector 里就只有"该重组的地方在重组",剩下大半棵树静默跳过。下一篇把这套心智落到输入控件:`BasicTextField` (TextField2) 与 `TextFieldState` 怎么把"中文 IME 在旧 TextField 上一输入光标就跳"的老 bug 彻底解决。

## 手动验证

- [ ] 用 `./gradlew assembleDebug` 跑通项目,`build/compose_compiler/*-composables.txt` 里能看到 `NoteEditContent` 标 `restartable skippable`。
- [ ] 用 Layout Inspector 打开 `NoteEditScreen`,在标题里连续输入 10 个字符,Recomposition Count 应集中在 `OutlinedTextField` 与 `Text("保存")` 上,Column 与 Scaffold 应保持 0 或固定值。
- [ ] 在标签草稿里输入 1 字符,保存按钮 enabled 状态不变;输到 2 字符,按钮变为可用——验证 `derivedStateOf` 工作。
- [ ] 旋转屏幕(`adb shell settings put system accelerometer_rotation 1` 然后转屏),标签草稿仍在——验证 `rememberSaveable`。
- [ ] 在 `TagChips` 的 `items(...)` 里把 `key = { it }` 删掉,反复增删 tag,Recomposition Count 全列暴涨;加回 key,只有真正变化的 chip 计数 +1。
- [ ] 把 `onClick = viewModel::handle` 改成 `onClick = { viewModel.handle(item.id) }`,Compose Compiler 报告中 `ExpensiveItem` 失去 skippable;改回方法引用恢复。

---

**下一篇:** `08-输入控件-TextField2与表单状态.md`,把 Compose 1.7 GA 的 `BasicTextField` + `TextFieldState` 讲透,顺便给出旧 TextField 的迁移路径。
