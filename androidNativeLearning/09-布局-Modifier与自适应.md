# 09-布局、Modifier 与自适应

> 一句话导读:Compose 的布局不是"嵌套盒子",而是一条 Modifier 链的应用顺序;`Row` / `Column` / `Box` 给你方向,`Modifier` 给你约束(Constraints),`WindowSizeClass` 给你"这屏是手机、平板还是折叠屏"——三件事讲完,自适应就有了完整心智。

第 06 篇把 `setContent {}` 入口与 Android 15 edge-to-edge 跑通;第 07 篇把状态与重组讲清;第 08 篇把输入控件交付到表单级。这一篇是 UI 心智链的最后一块拼图——**当 UI 元素超过两个,你就要决定它们怎么排布、怎么让 Modifier 链按你预期工作、怎么在 6 寸手机和 12 寸折叠屏上都不丑**。Compose 把这件事变得简单了,但只在你理解了"Modifier 顺序不可换"和"Constraints 是单向往下传"这两条之后才简单。

读者画像默认:你已经能写出 `Column { Text(...); Button(...) }` 并跑起来,但只要把 `padding` 和 `background` 放反位置就开始迷惑,看到 `LazyColumn` 里嵌套 `Column` 直接报 IllegalStateException 不知道为什么,在平板上发现整屏内容只占了左侧 1/3。本篇要把这些情景的根因一次性讲透。

## 1. 机制定位

### 1.1 XML View 嵌套地狱的根因

老 Android 写布局,大体两条路:`LinearLayout` 嵌套 + `weight`,或 `RelativeLayout` / `ConstraintLayout` 写约束。两者都有同一个问题——**布局信息散在 XML 各处,运行时还要 inflate、measure 两遍**。

`LinearLayout` 的 `weight` 在嵌套时性能糟糕(每个 weight 都要 measure 两遍);`RelativeLayout` 在条目多时同样要 measure 两遍才能解决相互依赖。直到 `ConstraintLayout` 出现,通过约束求解器把"嵌套"压平,才让深嵌套布局有了可用的性能。代价是 `ConstraintLayout` 的语法本身复杂——chain、barrier、guideline、group,光是学完文档就得几个小时。

Compose 选了完全不同的路径:**布局是一棵函数调用树,每个 `@Composable` 收到 `Constraints` 并返回 `Placeable`**。父级给子级"宽高的最小/最大限制",子级测量自己并返回尺寸,父级决定放在哪个位置。这套契约用代码直接表达,不需要外部 XML。

### 1.2 Modifier 链:不是装饰,是"测量与绘制管线"

Compose 里很多新手把 `Modifier` 当成 CSS 的 class 那样的"装饰集合",写顺序好像无所谓。这是错的。**Modifier 链每一个调用都是管线里的一站,从外向内依次包裹原始 Composable**:

```kotlin
Box(
    Modifier
        .padding(16.dp)         // 第一站:在 Box 外加 16dp 留白
        .background(Color.Red)  // 第二站:再画红色背景(不含 padding 区域)
        .padding(8.dp)          // 第三站:再加 8dp 留白
)
```

实际效果:外面 16dp 透明留白 → 红色区域 → 内部 8dp 透明留白 → 原始 Box。`background` 只覆盖到它之前的 padding 之内,不含外层 padding。**调换 padding 和 background 的位置,视觉完全不同**。这条是新手在 Compose 里第一个"以为对了实际错了"的坑,§5 会专门拆。

### 1.3 自适应:从手机到折叠屏的尺寸抽象

2026 年的 Android 设备分布,以下三档已经无法回避:

| 形态 | 屏幕宽度 (dp,竖屏) | 典型 | 占比 |
| --- | --- | --- | --- |
| Compact | < 600 | 普通手机 | ~85% |
| Medium | 600-839 | 折叠屏展开,小平板,大屏手机横屏 | ~10% |
| Expanded | >= 840 | 平板,折叠屏内屏横屏,Chromebook | ~5% |

老办法是把 `res/layout/` 拆成 `layout-sw600dp/`、`layout-sw840dp/` 多套 XML;Compose 时代不再拆资源,而是用 `WindowSizeClass`(`androidx.compose.material3.adaptive` 库)在运行时分流,**一段 Composable 代码自适应三档**。Compose 1.7+ 起的 `adaptive-navigation` / `adaptive-layout` 库进一步把"列表/详情双栏在 Medium/Expanded 自动并排,在 Compact 自动堆叠"这种模式封装,实现里仍是 WindowSizeClass + 普通 Modifier 组合。

## 2. Android 心智

### 2.1 三大基础容器:`Row` / `Column` / `Box`

```kotlin
// 横向排列,主轴 X
Row(
    horizontalArrangement = Arrangement.SpaceBetween,
    verticalAlignment = Alignment.CenterVertically,
) { /* children */ }

// 纵向排列,主轴 Y
Column(
    verticalArrangement = Arrangement.spacedBy(8.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
) { /* children */ }

// 层叠,后绘制的盖在前面之上
Box(
    contentAlignment = Alignment.Center,
) { /* children */ }
```

记忆要点:**Row / Column 的两个参数分别管"主轴" Arrangement 和"交叉轴" Alignment**;`Box` 把所有子级叠在一起,`contentAlignment` 控制默认对齐位置,子级可单独用 `Modifier.align(...)` 覆盖。

`Arrangement.spacedBy(8.dp)` 是 Compose 里"在每两个子级之间塞 8dp"的标准写法,不要写成给每个子级 `Modifier.padding(start = 8.dp)`——后者首尾会多一段 padding,而 spacedBy 只在中间。

### 2.2 `Modifier.weight`:仅在 Row / Column 的 RowScope / ColumnScope 内可用

```kotlin
Row {
    Box(Modifier.weight(1f))   // 占剩余空间的 1 份
    Box(Modifier.weight(2f))   // 占 2 份
    Box(Modifier.width(48.dp)) // 固定宽
}
```

`weight` 是 `RowScope` / `ColumnScope` 的扩展函数,**只能在 Row / Column 的 DSL 里直接用,出了 Row / Column 拿不到**。这条与 Flutter 的 `Expanded` 类似,但 Compose 是基于 Kotlin scope 上下文实现的,IDE 会直接补全。

`weight` 的语义:固定尺寸的子级先布局,剩余空间按 weight 比例分配。`weight(1f, fill = false)` 可以让子级"按需占用,不强制填满",但 90% 的用例 fill 都是 true。

### 2.3 `fillMaxWidth` / `fillMaxHeight` / `wrapContentSize`

```kotlin
Box(Modifier.fillMaxWidth())                // 宽度顶满父级 maxWidth 约束
Box(Modifier.fillMaxWidth(0.5f))            // 宽度占父级 50%
Box(Modifier.size(64.dp))                   // 固定宽高
Box(Modifier.wrapContentWidth())            // 不顶满,按子级内容包紧
```

注意:`fillMaxWidth()` 顶满的是**父级给的 maxWidth 约束**,不是屏幕。如果父级本身只占半屏,fillMaxWidth 也只是半屏。这是"父→子约束传递"的直接体现,§2.4 展开。

### 2.4 Constraints:布局测量的契约

Compose 的布局协议只有一行:**父级给子级 `Constraints(minW, maxW, minH, maxH)`,子级返回 `Placeable(width, height)`,父级决定放在哪**。

```kotlin
// 自定义 Layout 例子,理解契约本身
Layout(content = { /* children */ }) { measurables, constraints ->
    val placeables = measurables.map { it.measure(constraints) }
    val totalH = placeables.sumOf { it.height }
    val maxW = placeables.maxOf { it.width }
    layout(maxW, totalH) {
        var y = 0
        placeables.forEach { p -> p.placeRelative(0, y); y += p.height }
    }
}
```

`constraints.maxWidth` 是父级允许的最大宽度;子级 `measure(constraints)` 触发它自己的布局,返回的 Placeable 必须满足 `minW <= width <= maxW`。`layout(w, h)` 声明本节点最终尺寸。

99% 的 UI 不需要写 `Layout {}`,但这个契约决定了一切 Modifier 的行为:`Modifier.fillMaxWidth()` 实际上是"把父传的 constraints 改成 `minW = maxW`",`Modifier.width(64.dp)` 是"改成 `minW = maxW = 64.dp.toPx()`"。

### 2.5 Modifier 顺序的两条铁律

1. **从外向内依次应用**:链上越靠左的越外层,越靠右的越靠近原始 Composable。
2. **影响子约束的 Modifier 写在前面,影响绘制 / 装饰的 Modifier 写在后面**(或反过来,看视觉需求)。

```kotlin
// A. 整个区域(含 padding)有红色背景,内容内缩
Box(Modifier.background(Color.Red).padding(16.dp))

// B. padding 在外、background 在内:padding 区域透明,只内容区域红
Box(Modifier.padding(16.dp).background(Color.Red))
```

视觉效果对比:

```text
A. ┌─────────────────┐    B. ┌─────────────────┐
   │■■■■■■■■■■■■■■■■■│       │                 │
   │■  ■■■■■■■■■■■  ■│       │  ■■■■■■■■■■■■■  │
   │■  ■ content ■  ■│       │  ■ content    ■  │
   │■  ■■■■■■■■■■■  ■│       │  ■■■■■■■■■■■■■  │
   │■■■■■■■■■■■■■■■■■│       │                 │
   └─────────────────┘       └─────────────────┘
```

A 表现"卡片有 padding 内边距,卡片整个是红的";B 表现"红色块本身就有 padding 但块外面有透明留白"。设计稿里看哪个是哪个,代码就照写。

### 2.6 `LazyColumn` / `LazyVerticalGrid`:虚拟化列表

```kotlin
LazyColumn(
    contentPadding = PaddingValues(16.dp),
    verticalArrangement = Arrangement.spacedBy(8.dp),
) {
    items(notes, key = { it.id }, contentType = { "note" }) { note ->
        NoteCard(note)
    }
    item { Spacer(Modifier.height(80.dp)) }   // 底部加一段空间
}

LazyVerticalGrid(
    columns = GridCells.Adaptive(minSize = 160.dp),  // 自动按宽度算列数
    contentPadding = PaddingValues(16.dp),
) {
    items(images, key = { it.id }) { img -> ImageThumb(img) }
}
```

关键属性:

- **`key`**:稳定 id,让 Compose 在数据增删时只重组真正变化的项。第 07 篇有详细解释。
- **`contentType`**:同类型 item 复用同一组 Composition;混合列表(图文混排)显式分类型可提升复用率。
- **`contentPadding`**:Lazy 列表的"内边距",作用范围在列表内部、滚动条之内,不影响 Scaffold 留白。

`GridCells.Adaptive(minSize)` 让 Compose 自动算列数:屏幕宽 360dp、minSize=160dp、间距 8dp → 2 列;宽 600dp → 3 列;宽 840dp → 5 列。这是简单自适应的捷径,不写 WindowSizeClass 也能初步覆盖。

### 2.7 `WindowSizeClass`:自适应的标准化

```kotlin
import androidx.compose.material3.adaptive.currentWindowAdaptiveInfo
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass

@Composable
fun NotesScreen() {
    val widthClass = currentWindowAdaptiveInfo().windowSizeClass.windowWidthSizeClass
    when (widthClass) {
        WindowWidthSizeClass.COMPACT -> NotesListOnly()                   // 手机
        WindowWidthSizeClass.MEDIUM -> NotesListWithRail()                // 折叠屏 / 大屏手机横屏
        WindowWidthSizeClass.EXPANDED -> NotesListDetailPane()            // 平板 / 折叠屏内屏
    }
}
```

`WindowSizeClass` 在 `androidx.compose.material3.adaptive` 中(2024 后正式 GA),取代旧的 `androidx.compose.material3.windowsizeclass.calculateWindowSizeClass(activity)`。前者更通用,适合不依赖 Activity 的 Composable;后者仍可用。

### 2.8 与 Android 15 edge-to-edge 协作

第 06 篇讲过 `enableEdgeToEdge()` 之后内容延伸到状态栏 / 导航栏之下,你要主动消费 `WindowInsets`。屏幕级布局的标准模板:

```kotlin
Scaffold(
    contentWindowInsets = WindowInsets.safeDrawing,    // 1.7+ 推荐
) { paddingValues ->
    LazyColumn(
        contentPadding = paddingValues,                  // Scaffold 留出的内边距塞给 LazyColumn
        modifier = Modifier.fillMaxSize(),
    ) { /* items */ }
}
```

把 `paddingValues` 写到 `LazyColumn.contentPadding` 而不是 `LazyColumn.padding`——前者让滚动条延伸到边缘但内容受 padding 限制,后者把整个 LazyColumn 内缩,顶部 / 底部内容滚动到边缘会被状态栏 / 导航栏盖住。第 06 篇详细对比过这两种写法,本篇不再展开。

## 3. 工程实现

下面给一个 NotedX 笔记列表页:Compact 单列 LazyColumn,Medium 双栏(列表 + 详情侧滑),Expanded 双栏并排。三档自动切换。

**第一步:UI State 与 ViewModel**

文件 `app/src/main/java/com/notedx/feature/notes/NotesUiState.kt`:

```kotlin
package com.notedx.feature.notes

import androidx.compose.runtime.Immutable
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.persistentListOf

@Immutable
data class NoteSummary(
    val id: String,
    val title: String,
    val preview: String,
    val updatedAt: Long,
)

@Immutable
data class NotesUiState(
    val notes: ImmutableList<NoteSummary> = persistentListOf(),
    val selectedId: String? = null,
    val isLoading: Boolean = false,
)
```

**第二步:列表项与详情卡片(Composable)**

文件 `app/src/main/java/com/notedx/feature/notes/NoteListItem.kt`:

```kotlin
package com.notedx.feature.notes

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp

@Composable
fun NoteListItem(
    note: NoteSummary,
    selected: Boolean,
    onClick: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    // 注意 Modifier 顺序:外层 clickable / 圆角裁剪,内层 background + padding
    Surface(
        onClick = { onClick(note.id) },
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp)),
        color = if (selected) MaterialTheme.colorScheme.secondaryContainer
                else MaterialTheme.colorScheme.surface,
    ) {
        Column(Modifier.padding(16.dp)) {                     // padding 在内,不影响 Surface 边界
            Text(note.title, style = MaterialTheme.typography.titleMedium)
            Text(
                note.preview,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 2,
            )
        }
    }
}
```

逐条对应 §2 的心智:

- `Surface` 自带 background + click + shape,但需要外层 `clip` 才能让点击水波纹也是圆角(`Modifier.clip` 应用在 `Surface` 外面,等于"把 Surface 包成圆角")。
- `padding(16.dp)` 写在 `Column` 上,在 Surface 内部,意为"内容相对 Surface 边缘内缩 16dp";如果写到 `Surface(modifier = modifier.padding(16.dp))` 上,Surface 整个外面有 16dp 留白,语义完全不同。

**第三步:三种布局模板**

文件 `app/src/main/java/com/notedx/feature/notes/NotesScreen.kt`:

```kotlin
package com.notedx.feature.notes

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.adaptive.currentWindowAdaptiveInfo
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle

@Composable
fun NotesScreen(viewModel: NotesViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val widthClass = currentWindowAdaptiveInfo().windowSizeClass.windowWidthSizeClass

    Scaffold(
        contentWindowInsets = WindowInsets.safeDrawing,
    ) { padding ->
        when (widthClass) {
            WindowWidthSizeClass.COMPACT ->
                NotesCompact(state = state, padding = padding, onClick = viewModel::select)
            WindowWidthSizeClass.MEDIUM ->
                NotesMedium(state = state, padding = padding, onClick = viewModel::select)
            else ->
                NotesExpanded(state = state, padding = padding, onClick = viewModel::select)
        }
    }
}

@Composable
private fun NotesCompact(
    state: NotesUiState,
    padding: PaddingValues,
    onClick: (String) -> Unit,
) {
    LazyColumn(
        contentPadding = padding,
        verticalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
    ) {
        items(state.notes, key = { it.id }, contentType = { "note" }) { note ->
            NoteListItem(note, selected = note.id == state.selectedId, onClick = onClick)
        }
    }
}

@Composable
private fun NotesMedium(
    state: NotesUiState,
    padding: PaddingValues,
    onClick: (String) -> Unit,
) {
    // 双列网格,minSize=240dp:Medium 通常 2 列,Expanded 3-4 列
    LazyVerticalGrid(
        columns = GridCells.Adaptive(minSize = 240.dp),
        contentPadding = padding,
        verticalArrangement = Arrangement.spacedBy(8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
    ) {
        items(state.notes, key = { it.id }, contentType = { "note" }) { note ->
            NoteListItem(note, selected = note.id == state.selectedId, onClick = onClick)
        }
    }
}

@Composable
private fun NotesExpanded(
    state: NotesUiState,
    padding: PaddingValues,
    onClick: (String) -> Unit,
) {
    Row(Modifier.fillMaxSize().padding(padding)) {
        // 左:列表
        LazyColumn(
            modifier = Modifier.weight(1f).padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(state.notes, key = { it.id }, contentType = { "note" }) { note ->
                NoteListItem(note, selected = note.id == state.selectedId, onClick = onClick)
            }
        }
        // 右:详情
        Box(
            modifier = Modifier.weight(2f).padding(16.dp),
            contentAlignment = Alignment.TopStart,
        ) {
            val selected = state.notes.firstOrNull { it.id == state.selectedId }
            if (selected == null) {
                Text("未选中笔记", style = MaterialTheme.typography.titleMedium)
            } else {
                NoteDetailPane(selected)
            }
        }
    }
}
```

设计要点:

- **`Scaffold(contentWindowInsets = WindowInsets.safeDrawing)`**:让 Scaffold 把状态栏 / 导航栏 / IME 的内边距以 `PaddingValues` 形式回传给 content lambda。`safeDrawing` 是 `systemBars + displayCutout + ime` 的并集,覆盖几乎所有"内容不该进入"的区域。
- **`contentPadding = padding`**:把 Scaffold 留出的内边距塞给 LazyColumn 的内边距,让列表在滚动时仍能填满屏幕,但内容不被系统栏遮挡。
- **三种模板差异**:Compact 单列 LazyColumn,Medium 走自适应网格 `LazyVerticalGrid(GridCells.Adaptive(240.dp))`,Expanded 走 `Row(weight 1:2)` 双栏。
- **`weight(1f)` / `weight(2f)`**:剩余空间 1:2 分配,左 1/3 右 2/3,这是 list-detail 模式的常见比例。

**第四步:折叠屏 hinge 区域适配**

折叠屏(Pixel Fold、Galaxy Z Fold)在展开状态下中间有 hinge(折痕),内容压在折痕上视觉很糟。Compose 提供 `WindowInfoTracker` + `FoldingFeature` 读折叠信息:

```kotlin
import androidx.compose.material3.adaptive.currentWindowAdaptiveInfo
import androidx.compose.material3.adaptive.Posture

@Composable
fun NotesAdaptiveLayout() {
    val info = currentWindowAdaptiveInfo()
    val isTabletop = info.windowPosture.isTabletop      // 半折叠
    val isBookPosture = info.windowPosture.isBookPosture
    val hingeBounds = info.windowPosture.allVerticalHingeBounds.firstOrNull()
    // ... 根据 hinge 位置决定双栏的分割线
}
```

`isTabletop` 是折叠屏"半立"姿势(像笔记本电脑屏幕和键盘的角度);`isBookPosture` 是"翻书"姿势(像书本)。简单做法:有 hinge 时让 `Row(weight 1f, 2f)` 的分割线对齐 hinge 位置,内容不压痕。这一块完整覆盖在 [[androidNative 第 21 篇 多模块化]] 之后的 adaptive 章节,本篇只展示心智入口。

## 4. 调参与验收

### 4.1 LazyColumn 性能调参

| 属性 | 推荐值 | 影响 |
| --- | --- | --- |
| `key` | 业务 id | 重排 / 增删时只重组真正变化项 |
| `contentType` | "note" / "header" / "footer" | 同类型复用 Composition,降低创建开销 |
| `contentPadding` | 与 Scaffold padding 一致 | 滚动时内容不被状态栏盖 |
| `Arrangement.spacedBy` | 8-16dp | 视觉节奏,代替每项手写 padding |
| `flingBehavior` | 默认即可 | 高端机用默认,低端机可调阻尼 |

**警告**:`Modifier.verticalScroll(rememberScrollState())` 配 `Column` 不是 LazyColumn 的替代——它把所有子级一次性测量,500 行就明显卡。`Column + verticalScroll` 只适合 < 20 行的场景(设置页、表单)。列表数据用 `LazyColumn`。

### 4.2 WindowSizeClass 断点的实际意义

| 断点 | dp 范围 | 设备形态 | 推荐布局策略 |
| --- | --- | --- | --- |
| Compact | < 600 | 手机竖屏 | 单列 + 底部导航(NavigationBar) |
| Medium | 600-839 | 折叠屏内屏竖屏 / 大屏手机横屏 / 7 寸平板 | 单列 + 侧边导航(NavigationRail) |
| Expanded | >= 840 | 平板 / 折叠屏横屏 / Chromebook | 双栏(list-detail) + 永久抽屉(PermanentNavigationDrawer) |

Material3 的 `NavigationSuiteScaffold`(`androidx.compose.material3.adaptive.navigationsuite`)自动根据 WindowSizeClass 在 NavigationBar / NavigationRail / PermanentNavigationDrawer 之间切换,推荐用它取代手写三套导航。

### 4.3 调试工具

- **Layout Inspector**(Android Studio Hedgehog+):在 Composable 节点上看 Constraints、Recomposition Count、Skip Count。
- **`Modifier.layout {}` 手动 trace**:在调试时临时插入 `Modifier.layout { measurable, constraints -> println(constraints); val p = measurable.measure(constraints); layout(p.width, p.height) { p.place(0, 0) } }`,看每个 Composable 收到的 Constraints。
- **`adb shell wm size`** / `wm density`:模拟不同屏幕。
  - `adb shell wm size 1080x2400` 切换分辨率
  - `adb shell wm density 280` 切换 dpi
  - `adb shell wm size reset` 还原

### 4.4 验收清单

- [ ] 列表项的 `key` 全部用业务 id,屏蔽 `LazyColumn` 在数据增删时整列重组。
- [ ] 屏幕级 Composable 都用 `Scaffold(contentWindowInsets = WindowInsets.safeDrawing)`,且把 padding 转给 LazyColumn 的 `contentPadding`。
- [ ] 在 600dp / 840dp / 1280dp 三个宽度上分别运行,布局自动切换 Compact / Medium / Expanded。
- [ ] 折叠屏模拟器(Pixel Fold Emulator)上展开与折起,布局自动 reflow。
- [ ] 没有 `Column + verticalScroll` 包 100+ 行的写法;长列表全部 LazyColumn / LazyVerticalGrid。
- [ ] `Modifier.padding` 与 `Modifier.background` 的顺序与设计稿表达一致(背景含 padding vs 不含 padding)。

## 5. 踩坑

### 5.1 `Modifier.padding(8.dp).background(Red)` 与 `Modifier.background(Red).padding(8.dp)` 视觉相反

§2.5 已经讲过原理,这里给一个真实场景。给"红色错误提示框":

```kotlin
// 错:外层透明 padding 8dp,内部红色块紧贴 Text,看起来像一条狭长红条
Box(Modifier.padding(8.dp).background(Color.Red)) {
    Text("Error", Modifier.padding(8.dp))
}

// 对:红色块整体含 16dp 留白,内容居中
Box(Modifier.background(Color.Red).padding(16.dp)) {
    Text("Error")
}
```

直觉记法:**`background` 涂的是"它之前 Modifier 决定的区域"**,padding 写在 background 前面就被涂,写在后面就在涂色区域内当作内边距。

### 5.2 `weight` 必须直接在 Row / Column 子级

```kotlin
// 错:weight 在 Box 里,Box 不是 Row/Column 子级
Row {
    Box(Modifier.fillMaxHeight()) {
        Spacer(Modifier.weight(1f))    // 编译错:RowScope 不在这里
    }
}

// 对:weight 在 Row 的直接子级
Row {
    Box(Modifier.weight(1f).fillMaxHeight())
}
```

`weight` 在 `RowScope` / `ColumnScope` 上注册;一旦再嵌一层 Composable,scope 就失效了。修法是把要 weight 的 Modifier 提到最外层。

### 5.3 `LazyColumn` 内嵌 `LazyColumn` 直接 crash

```kotlin
LazyColumn {
    item {
        LazyColumn {              // IllegalStateException
            items(subList) { ... }
        }
    }
}
```

Compose 拒绝"同方向 Lazy 容器嵌套",因为外层无法决定内层尺寸(都想"无限滚动")。修法:

- 把内层换成 `Column { for (x in subList) ... }`(数据不大);
- 或者把内外合成一个 LazyColumn,用 `items { it.subList }.flatMap` 之类把数据扁平化;
- 或外层用 `Column + verticalScroll`,内层 LazyColumn 套 fixed height(罕见)。

横向 LazyRow 嵌在 LazyColumn item 里是允许的——方向不同,不冲突。

### 5.4 `items(list)` 不给 key,数据顺序变化整列重组

```kotlin
items(notes) { note -> NoteCard(note) }                    // 反例:无 key
items(notes, key = { it.id }) { note -> NoteCard(note) }   // 正:稳定 key
```

不给 key,Compose 用"位置 index"作 key——插入 / 删除中间项时所有后续项都会"换位置",每个都会被重组,且各 item 内部的 `remember` 状态也丢。**100 行列表,无 key,新增一项导致 100 个 Composable 全部重组**;有 key 只有新插入项算变化。

### 5.5 Edge-to-edge 后内容被系统栏遮挡

第 06 篇详讲过,这里再点一次最高频写法:

```kotlin
// 反例:Scaffold 不传 contentWindowInsets,LazyColumn 顶部被状态栏盖
Scaffold { padding ->
    LazyColumn(modifier = Modifier.padding(padding)) { ... }
}

// 对:Scaffold 主动消费 safeDrawing,LazyColumn 内边距承接
Scaffold(contentWindowInsets = WindowInsets.safeDrawing) { padding ->
    LazyColumn(contentPadding = padding) { ... }
}
```

`Modifier.padding(padding)` 和 `contentPadding = padding` 对 LazyColumn 是两件事:前者把整个 LazyColumn(包括滚动区域)内缩,内容滚到顶部不会贴边;后者只是内容内缩但滚动区域延伸到屏幕边缘,视觉上更现代。

### 5.6 `BoxWithConstraints` 是惰性测量,慎用

`BoxWithConstraints { val w = maxWidth; ... }` 让你在 Composable 里读父 Constraints 做条件渲染。但它会让本节点变成"测量在 composition phase"——首屏渲染要等 measure 再决定 composition,理论开销略高。**如果只是想"宽度大于 600dp 时显示两栏"**,优先用 WindowSizeClass(全屏级判断,无重复测量);BoxWithConstraints 留给"某 Composable 自身在不同 size 下需要不同实现"(例如卡片尺寸超过 200dp 时显示头像)。

### 5.7 `Dialog` 在平板上铺满 80% 宽

Material3 的 `Dialog` 在平板默认拉伸到屏幕的大部分宽度,通常不是设计想要的。修法:

```kotlin
import androidx.compose.ui.window.DialogProperties

AlertDialog(
    onDismissRequest = {},
    title = { Text("...") },
    text = { Text("...") },
    confirmButton = { TextButton(onClick = {}) { Text("OK") } },
    properties = DialogProperties(usePlatformDefaultWidth = false),
    modifier = Modifier.width(360.dp),       // 自定义宽度
)
```

`usePlatformDefaultWidth = false` 解除平台默认宽度限制,然后 `Modifier.width(...)` 手动指定。

### 5.8 `Modifier.size(64.dp)` 不一定 64dp

```kotlin
// 父级强约束 minWidth = 100.dp,子级 size(64.dp) 也会被拉到 100.dp
Box(Modifier.requiredWidth(100.dp)) {
    Box(Modifier.size(64.dp))     // 实际 100.dp
}
```

`Modifier.size(64.dp)` 的语义是"在父约束允许范围内最接近 64dp",父级 `requiredWidth(100.dp)` 会强行覆盖。要强制 64dp:`Modifier.requiredSize(64.dp)`(子级不再受父约束,可能被裁剪 / 溢出)。生产里 `requiredSize` 极少需要,出现这种问题通常是父子约束意图冲突,要重新设计。

### 5.9 `LazyColumn` 不报错但永远只显示一项

```kotlin
// 错:items() 是 lambda 里的扩展,但被错误展开成 List<...>
LazyColumn {
    items(notes.map { NoteCard(it) })       // 已经渲染成 Composable 列表
}
```

`items()` 的 lambda 期望"item 数据"而不是"item Composable"。上面写法把 `notes` 提前 map 成 NoteCard 列表,而 NoteCard 还没在 LazyColumn 上下文里调用,实际行为是 0 项渲染或 crash。**`items` 内部才能 emit Composable,不要在外面提前生成**。

### 5.10 跨进程截图 / 录屏的 `WindowInsets` 误差

`adb shell screenrecord` 录制时,系统栏的 inset 计算与正常显示有 1-2 像素差异;Layout Inspector 截图可能与实机不完全一致。这是 framework 已知行为,排查布局问题时以实机为准,不以录屏 / 截图判定。

### 5.11 `wrapContentSize` 与 `fillMaxSize` 联用导致溢出

```kotlin
// 反例:fillMaxSize 后又 wrapContentSize,行为不可预期
Box(Modifier.fillMaxSize().wrapContentSize(Alignment.Center)) { ... }
```

`fillMaxSize()` 把 Box 撑满,`wrapContentSize()` 又让 Box 按内容包紧——两个语义直接冲突。Compose 不会报错,具体表现取决于 modifier 顺序与 Box 内容尺寸。**要"内容居中"就用 `Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center)`**,不要混用 fill + wrap。

### 5.12 平板 / 大屏的 `Scaffold` topBar 视觉违和

平板宽度 1280dp,TopAppBar 全宽拉满左上角一个 Title,中间一大段空白,视觉松散。Material3 解决:用 `CenterAlignedTopAppBar`(标题居中)或 `LargeTopAppBar`(大字体标题),或者在 Expanded 时换成 NavigationRail + 内容自身的 Header。`NavigationSuiteScaffold` 自动处理这件事。

---

`Row` / `Column` / `Box` 给方向,`Modifier` 链给约束,`WindowSizeClass` 给屏幕形态——三件事一起决定了 Compose 屏幕的"骨架"。把 Modifier 顺序坑、LazyColumn key、edge-to-edge insets、WindowSizeClass 这四件事守好,90% 的 UI 布局问题就不会出现。下一篇 [[10 动画-SharedElement 与 LookaheadScope]] 把"屏幕之间过渡 / 列表展开为详情"的动画一次讲透,Compose 1.7 GA 的 `SharedTransitionLayout` 与 `LookaheadScope` 是主线。

## 手动验证

- [ ] 运行 NotesScreen,在 6.5 寸手机模拟器(Pixel 8)上看到单列 LazyColumn。
- [ ] 切到 8 寸平板模拟器(Pixel Tablet),自动变成自适应网格(2 列以上)。
- [ ] 切到 13 寸平板模拟器或 Pixel Fold 展开,自动变成"左列表 + 右详情"双栏。
- [ ] 用 `adb shell wm size 1280x800` 把手机临时改成大屏尺寸,布局自动 reflow 到 Expanded 模板。
- [ ] 用 Layout Inspector 看 `NoteListItem` 的 Constraints,确认在不同尺寸下父级传下的 maxWidth 符合预期。
- [ ] 在 Compact 屏幕上调出系统手势导航,内容不被底部手势条遮挡(safeDrawing 生效)。
- [ ] 弹出 IME 输入,LazyColumn 自动上推,最后一项不被键盘盖住。
- [ ] 把 `items(notes, key = { it.id })` 改成 `items(notes)`,Layout Inspector 显示数据增删时整列 Recomposition Count 爆涨;改回 key 后恢复正常。
- [ ] 把 `Modifier.background(Red).padding(16.dp)` 与 `Modifier.padding(16.dp).background(Red)` 在调试 Box 上切换,直观看到红色区域范围差异。

---

**下一篇:** `10-动画-SharedElement与LookaheadScope.md`,把 Compose 1.7 GA 的 `SharedTransitionLayout` / `sharedBoundsTransform` 与 `LookaheadScope` 预测布局两件事讲透,完成第二层 Compose UI 心智的最后一块拼图。
