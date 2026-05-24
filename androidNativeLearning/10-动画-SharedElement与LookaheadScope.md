## 10-动画、SharedElement 与 LookaheadScope

> 一句话导读:Compose 1.7 把"列表项展开成详情页"这种过去要靠 `Fragment` Shared Element + `MotionLayout` 才勉强能做的事情抬成了 GA;搞清楚 `SharedTransitionLayout` 与 `LookaheadScope` 的作用域,动画就只是布局的派生品,而不是又一套独立心智。

第 09 篇把 `Modifier` 与自适应布局摆平,NotedX 的列表、表单、Scaffold 在手机 / 折叠屏 / 平板上都不再错位。这一篇把"画面如何从一种状态平滑流到另一种状态"补上。Compose 的动画 API 表面上很碎(`animate*AsState`、`AnimatedVisibility`、`updateTransition`、`AnimatedContent`、`SharedTransitionLayout`、`LookaheadScope`),但底层只有一个心智:**一切动画都是 Snapshot 系统里某个 `State<T>` 在时间维度的插值**。理解这一点,就不会再写出"每帧手动 lerp 一遍 `position`"那种把 Compose 当 ImGui 用的代码。

旧 View 时代做这件事的成本不在 API,而在工程归属:`ObjectAnimator` 管属性插值、`Transition` 管 scene-to-scene、`MotionLayout` 管约束插值、Fragment Shared Element 管跨页面共享、`Animator` Listener 管回调,五套各自有生命周期。Compose 把它们折成一棵基于重组的派生关系:你只声明"现在状态是 A 还是 B",动画自动负责把 A 之间的视觉差值在时间维度上平滑出来。代价是必须接受"动画是布局的副产物"这种心智反转——这一篇要做的就是把它讲透。

## 1. 机制定位

### 1.1 旧时代为什么失控

写过 `ObjectAnimator.ofFloat(view, "translationX", 0f, 200f)` 的人都知道,问题不在 API,而在**状态归属**:动画跑到一半 Activity 被销毁,view 已经回收,动画还在更新 view 的字段,要么崩,要么内存泄露。`Animator` 的生命周期与 View / Activity / Fragment 都不绑,得自己写 `cancel()`。`Transition` 框架稍好,但跨 `Fragment` 共享元素时要 `setSharedElementEnterTransition` + `transitionName` + `FragmentTransaction.addSharedElement` 三处对齐,任何一处错就静默失败。

Compose 把"动画属于谁"这件事直接交给作用域:动画值是 `@Composable` 里 `remember` 出来的状态,组合离开 composition 就自动取消,不存在悬空动画。`AnimatedVisibility` 关闭后整个子树离开 composition,资源自动释放。这是把 RxJava 时代手动 `dispose()`、Animator 时代手动 `cancel()` 全部交给结构化作用域接管,与协程 `viewModelScope` 心智一脉相承(参见 [[androidNativeLearning 04-协程与结构化并发]])。

### 1.2 三个层次

| 层次 | 解决的问题 | 主要 API | 状态来源 |
| --- | --- | --- | --- |
| 单值插值 | 颜色、尺寸、偏移随状态变化 | `animateColorAsState` / `animateDpAsState` / `animateFloatAsState` | 调用处的 `State<T>` |
| 出现 / 消失 / 切换 | 节点从无到有、从一种内容切到另一种 | `AnimatedVisibility` / `AnimatedContent` / `Crossfade` | `MutableState<Boolean>` 或 key |
| 跨布局共享 / 容器形变 | 列表项展开成详情、抽屉拉开、卡片膨胀 | `SharedTransitionLayout` + `Modifier.sharedElement` / `sharedBounds`,`LookaheadScope` | `AnimatedContent` 的状态 + scope key |

新手最常犯的错是用错层次:用 `animateFloatAsState` 去实现"卡片从列表位置膨胀到全屏",硬手动算 `IntOffset`,代码堆成 200 行还做不出真实跨容器过渡。这种需求是层 3 的事,层 1 永远办不漂亮。

### 1.3 Compose 1.7 把哪些原型抬成了 GA

到 2026/05 时点,这些 API 已经从实验性升入主线:

- **`SharedTransitionLayout` / `Modifier.sharedElement` / `Modifier.sharedBounds`**(BOM 1.7,`androidx.compose.animation:animation:1.7+`):跨 `AnimatedContent` 状态共享元素,告别 Fragment Shared Element 的字符串 transitionName 拼接。
- **`LookaheadScope`** + `Modifier.animateBounds`(BOM 1.7 GA):在测量阶段先跑一遍"目标布局",再插值过渡到目标尺寸 / 位置。Material 3 的 `ModalBottomSheet` 展开、`NavigationBar` 切换都在底层用它。
- **`Modifier.animateContentSize`**:容器尺寸跟随子节点变化平滑插值,常见于"折叠卡片展开"。
- **`Modifier.sharedBoundsTransform`** 系列:控制 enter / exit 阶段的 boundsTransform 函数(spring vs tween)。

这一篇主线讲层 3,因为层 1 / 2 在第 06 / 07 篇已经做过铺垫;真正决定 NotedX 的"详情打开有没有质感"的是 `SharedTransitionLayout`。

## 2. Android 心智

### 2.1 `State<T>` → 动画值的派生关系

所有 `animate*AsState` 都是同一种模式:

```kotlin
val expanded by remember { mutableStateOf(false) }
val height by animateDpAsState(
    targetValue = if (expanded) 240.dp else 80.dp,
    animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
    label = "card-height",
)
```

`expanded` 改变触发重组,`animateDpAsState` 内部启动一个 `Animatable<Dp>`,把当前值朝 `targetValue` 插值,并把每帧的新值发回 `State<Dp>`,这又触发了 `height` 的读者重组。这条链路里不需要 `LaunchedEffect`,因为 `animate*AsState` 自身就是一个被 `rememberUpdatedState` + `Animatable` 封装好的副作用容器。它的生命周期挂在组合上,组合销毁动画自动取消。

`label` 在 Compose 1.7+ 是 `Animation Inspector` 必填字段,debug 时能在 Layout Inspector 里看到这条动画的名字。生产代码全部都该填。

### 2.2 `updateTransition`:多个值同步流转

当一个状态变化要驱动多个值(背景色、圆角、宽度)同时插值,且必须严格同步,用 `updateTransition`:

```kotlin
val transition = updateTransition(targetState = expanded, label = "card")
val height by transition.animateDp(label = "h") { if (it) 240.dp else 80.dp }
val color by transition.animateColor(label = "c") { if (it) Pink40 else Surface }
```

`Transition` 内部只有一个时间游标,所有从它派生出的 `animate*` 共享同一个 spec 与同一个 elapsed,不会出现"颜色已经到位,高度还在动"。如果用三个独立的 `animateDpAsState`,它们各自有各自的 `Animatable`,spring 的物理参数细微差异就能让它们走错位。

### 2.3 `AnimatedVisibility` 的子树生命周期

```kotlin
AnimatedVisibility(
    visible = isShown,
    enter = slideInVertically { -it } + fadeIn(),
    exit = slideOutVertically { -it } + fadeOut(),
) {
    BannerContent()
}
```

`visible = false` 之后,出场动画跑完整个子树离开 composition,所有 `remember`、`LaunchedEffect`、`DisposableEffect` 全部 dispose。这点跟 `if (isShown) { BannerContent() }` 的区别在于,后者立刻销毁、没有出场过渡。两者背后都遵循"组合里没有的节点就没有副作用"。

### 2.4 `SharedTransitionLayout` 的作用域语义

`SharedTransitionLayout` 不是一个动画 API,它是一个**作用域提供器**。它的 lambda 接收一个 `SharedTransitionScope`,内部所有 `Modifier.sharedElement(...)` / `Modifier.sharedBounds(...)` 都要从这个 scope 调用。同时,这些 modifier 需要一个 `AnimatedVisibilityScope`(由 `AnimatedContent` / `AnimatedVisibility` 提供),用来知道"现在处于 enter 还是 exit 阶段"。

这两个 scope 必须从同一棵 `SharedTransitionLayout` 派生出来,否则 Compose 不知道这俩 element 应该被识别成"同一个"。识别的 key 是 `rememberSharedContentState(key)`,key 相同即为同一元素,在过渡时 Compose 会自动计算两边的 bounds 差值并插值。

### 2.5 `LookaheadScope`:测量两遍模型

`LookaheadScope` 给子树启用"双 pass 测量":第一遍按目标布局走,把每个子节点的"最终 size + position"测出来;第二遍按当前帧实际值走。把两者交给 `Modifier.animateBounds` 就能让节点平滑地从当前几何流到目标几何。

它与 `animateContentSize` 的区别是:`animateContentSize` 只能动当前节点的尺寸;`LookaheadScope` 能让"父容器改了布局策略(`Row` 变成 `Column`)"里的所有子节点都平滑过渡到新位置。Material 3 的 `NavigationRail` ↔ `NavigationBar` 切换、自适应详情面板的 list-detail ↔ stacked 转换,底层都靠这个机制。

### 2.6 动画与重组成本

每帧动画都是一次状态写入,触发读者重组。常见的反模式是:

```kotlin
// 反例:每帧重组整个屏幕
val offsetX by infiniteAnimateFloat()
Column { /* 100 个子节点 */ }
Box(modifier = Modifier.offset { IntOffset(offsetX.roundToInt(), 0) })
```

`offsetX` 在 `Box` 的 lambda 里读,本来重组范围只应该是 `Box`;但如果误把它写在 `Column` 外面、再传进去,整个 `Column` 都会跟着每帧重组。规则:**动画值要在使用它的最小作用域里读取**,通常用 `Modifier.offset { ... }`(lambda 是 graphicsLayer 阶段读,不触发重组,只触发重绘)而不是 `Modifier.offset(x.dp)`(组合阶段读)。这条边界第 22 篇会再深入,这里先建立认知。

## 3. 工程实现

下面三段示例分别覆盖单值动画、容器形变与跨页面共享元素。代码放在 `app/src/main/java/com/example/notedx/ui/animation/`,所有 import 显式列出,可直接复制运行。

### 3.1 单值与可见性:笔记卡片展开

文件位置:`app/src/main/java/com/example/notedx/ui/note/NoteCard.kt`。一个折叠 / 展开的笔记卡片,展开时高度增长、内容渐入。

```kotlin
package com.example.notedx.ui.note

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun NoteCard(
    title: String,
    body: String,
    modifier: Modifier = Modifier,
) {
    var expanded by rememberSaveable { mutableStateOf(false) }
    val collapsedHeight = 72.dp
    val targetMinHeight by animateDpAsState(
        targetValue = if (expanded) 0.dp else collapsedHeight,
        animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
        label = "note-min-height",
    )
    Card(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = targetMinHeight)
            .padding(horizontal = 16.dp, vertical = 8.dp),
        onClick = { expanded = !expanded },
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(text = title)
            AnimatedVisibility(
                visible = expanded,
                enter = slideInVertically { -it / 2 } + fadeIn(),
                exit = slideOutVertically { -it / 2 } + fadeOut(),
            ) {
                Text(text = body, modifier = Modifier.padding(top = 8.dp))
            }
        }
    }
}
```

设计要点:

- `rememberSaveable` 而非 `remember`:旋转 / 进程重建后保留展开状态。第 07 篇已铺垫,这里在动画上下文再强调一次。
- `heightIn(min = ...)` + 动画 dp:让卡片自然吃掉子内容的高度,而不是手算 `height = if (expanded) 240 else 80`,后者一旦字号换了就要重调。
- `AnimatedVisibility` 包住唯一会出现 / 消失的子树;它折叠后整个 `body` `Text` 离开 composition,如果 body 里有 `rememberCoroutineScope`、`LaunchedEffect`,会跟着自动取消。
- 单击切换通过 `Card(onClick = ...)`,自带 ripple 与无障碍 role(参见 [[androidNativeLearning 27-多语言与可访问性]])。

### 3.2 `SharedTransitionLayout`:列表 → 详情完整 demo

这是本篇的核心示例。同一个屏幕里维护"列表态"与"详情态",共享元素是笔记缩略卡片。点击列表项,封面图与标题平滑过渡到详情页布局。

文件位置:`app/src/main/java/com/example/notedx/ui/note/NoteListDetailScreen.kt`。

```kotlin
package com.example.notedx.ui.note

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionLayout
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

data class NoteSummary(val id: String, val title: String, val accent: Color)

private val sampleNotes = listOf(
    NoteSummary("n1", "API 35 边到边", Color(0xFFB388FF)),
    NoteSummary("n2", "K2 smart cast", Color(0xFF82B1FF)),
    NoteSummary("n3", "LookaheadScope", Color(0xFFA7FFEB)),
)

@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
fun NoteListDetailScreen() {
    var selected: NoteSummary? by remember { mutableStateOf(null) }
    SharedTransitionLayout(modifier = Modifier.fillMaxSize()) {
        AnimatedContent(
            targetState = selected,
            transitionSpec = { fadeIn(spring()) togetherWith fadeOut(spring()) },
            label = "list-detail",
        ) { current ->
            if (current == null) {
                LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(sampleNotes, key = { it.id }) { note ->
                        Row(
                            note = note,
                            sharedScope = this@SharedTransitionLayout,
                            animatedScope = this@AnimatedContent,
                            onClick = { selected = note },
                        )
                    }
                }
            } else {
                DetailPane(
                    note = current,
                    sharedScope = this@SharedTransitionLayout,
                    animatedScope = this@AnimatedContent,
                    onBack = { selected = null },
                )
            }
        }
    }
}

@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
private fun Row(
    note: NoteSummary,
    sharedScope: androidx.compose.animation.SharedTransitionScope,
    animatedScope: androidx.compose.animation.AnimatedVisibilityScope,
    onClick: () -> Unit,
) = with(sharedScope) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .sharedBounds(
                sharedContentState = rememberSharedContentState(key = "card-${note.id}"),
                animatedVisibilityScope = animatedScope,
                boundsTransform = { _, _ -> spring(stiffness = Spring.StiffnessMediumLow) },
            )
            .clip(RoundedCornerShape(16.dp))
            .clickable(onClick = onClick),
    ) {
        Box(modifier = Modifier.fillMaxWidth().background(note.accent).padding(16.dp)) {
            Text(
                text = note.title,
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.sharedElement(
                    sharedContentState = rememberSharedContentState(key = "title-${note.id}"),
                    animatedVisibilityScope = animatedScope,
                ),
            )
        }
    }
}

@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
private fun DetailPane(
    note: NoteSummary,
    sharedScope: androidx.compose.animation.SharedTransitionScope,
    animatedScope: androidx.compose.animation.AnimatedVisibilityScope,
    onBack: () -> Unit,
) = with(sharedScope) {
    Column(modifier = Modifier.fillMaxSize().clickable(onClick = onBack)) {
        Box(
            modifier = Modifier
                .sharedBounds(
                    sharedContentState = rememberSharedContentState(key = "card-${note.id}"),
                    animatedVisibilityScope = animatedScope,
                    boundsTransform = { _, _ -> spring(stiffness = Spring.StiffnessMediumLow) },
                )
                .fillMaxWidth()
                .height(240.dp)
                .background(note.accent),
        ) {
            Text(
                text = note.title,
                style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier
                    .padding(24.dp)
                    .sharedElement(
                        sharedContentState = rememberSharedContentState(key = "title-${note.id}"),
                        animatedVisibilityScope = animatedScope,
                    ),
            )
        }
        Text(
            text = "正文占位:点击空白返回",
            modifier = Modifier.padding(24.dp),
        )
    }
}
```

设计要点:

- **`SharedTransitionLayout` 是最外层 scope**。所有共享元素必须挂在它的子孙树里;两个分支(列表 / 详情)都从这同一个 scope 取 `sharedElement` / `sharedBounds`。
- **`AnimatedContent` 提供 `AnimatedVisibilityScope`**:这是告诉 Compose"现在是 enter 还是 exit 阶段"的关键作用域。`with(sharedScope) { ... sharedElement(animatedVisibilityScope = animatedScope, ...) }` 这种 with-receiver 模式是把两个 scope 同时带进去的标准写法。
- **`rememberSharedContentState(key = "card-${note.id}")`**:key 是字符串,但**必须在两边一致**。这里用 noteId 拼装,典型实践是配合路由参数(第 12 篇)统一来源。
- **`sharedBounds` vs `sharedElement`**:`sharedBounds` 用于"两边都是不同的内容,但矩形边界一致"(如卡片背景);`sharedElement` 用于"内容完全相同,只是位置变了"(如标题文字)。把背景容器用 `sharedBounds`、内部文字用 `sharedElement`,是 Material 3 范式。
- **`boundsTransform`**:控制 bounds 插值的 spec,推荐 spring,出现"过山车"般的滞后感时改 `stiffness`。

### 3.3 `LookaheadScope`:容器布局变化的平滑过渡

第三段示例展示 `LookaheadScope` 让"标签从一行流到下一行"看起来不再瞬切。文件位置:`app/src/main/java/com/example/notedx/ui/note/TagFlow.kt`。

```kotlin
package com.example.notedx.ui.note

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.LookaheadScope
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TagFlow(tags: List<String>, modifier: Modifier = Modifier) {
    LookaheadScope {
        FlowRow(
            modifier = modifier.fillMaxWidth().padding(8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            tags.forEach { tag ->
                Text(
                    text = tag,
                    modifier = Modifier
                        .animateBounds(
                            lookaheadScope = this@LookaheadScope,
                            boundsTransform = { _, _ -> spring(stiffness = Spring.StiffnessMediumLow) },
                        )
                        .clip(RoundedCornerShape(8.dp))
                        .background(Color(0xFFE1F5FE))
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                )
            }
        }
    }
}
```

> `Modifier.animateBounds` 在 BOM 1.7 中位于 `androidx.compose.ui.layout` 包下,需要传入外层 `LookaheadScope`。它与 `Modifier.animateItemPlacement`(`LazyColumn` 专用)不是同一个东西,后者仅在 `LazyList` 的 item 流转时生效。

容器从 1 列变成 2 列(屏幕变宽)时,每个 tag 会从旧位置 "流" 到新位置,而不是瞬切。这就是 LookaheadScope 的核心价值:**布局策略变了,视觉过渡免费**。

## 4. 调参与验收

### 4.1 spec 选择

| 场景 | 推荐 spec | 理由 |
| --- | --- | --- |
| 用户点击触发(按钮 ripple、卡片展开) | `spring(stiffness = Spring.StiffnessMediumLow, dampingRatio = Spring.DampingRatioMediumBouncy)` | 物理感强,反馈"我点到了" |
| 状态切换非用户主动(列表后台刷新) | `tween(durationMillis = 220, easing = FastOutSlowInEasing)` | 时长可预测,不打扰阅读 |
| 共享元素跨页面 | `spring(stiffness = StiffnessMediumLow)` | bounds 插值要"质感",时长由距离决定 |
| 入场 / 出场 fadeIn/fadeOut | `tween(180)` | 透明度过长会拖沓 |

Material Motion 规范的"小元件 100-200ms、容器 250-300ms、跨页面 300-500ms"在 spring 心智里换成 stiffness:`StiffnessHigh = 10000` 对应小元件,`StiffnessMediumLow = 400` 对应容器,`StiffnessVeryLow = 50` 对应史诗级共享过渡(慎用,显得拖)。

### 4.2 验收清单

- 单击展开 / 折叠 `NoteCard`,卡片高度有弹性,但不应抖三下才停;`StiffnessMediumLow + DampingRatioNoBouncy` 是默认推荐。
- `NoteListDetailScreen` 从列表点击进入详情:卡片背景从列表位置膨胀到详情顶部 `240.dp`;标题字号从 `titleMedium` 过渡到 `headlineMedium`,且文字位置连续(没有瞬切)。
- 返回时,共享元素从详情位置缩回列表对应行,而不是瞬切消失。这要求列表 `LazyColumn` 的 `key = { it.id }` 必须设(否则 item 重新分配,bounds 找不到回归点)。
- `TagFlow` 添加 / 删除 tag 时,其余 tag 平滑流动到新位置,而不是直接跳。
- 在 Android Studio 的 Layout Inspector → "Compose" tab 里,能看到所有 `label` 标注的动画曲线,曲线尾部应该平滑收敛,不出现"高频振荡"。

### 4.3 性能基线

打开 Android Studio Profiler 的 GPU 渲染面板,在共享元素过渡 300ms 内观察每帧耗时。健康基线:

- 每帧 < 16.6ms(60Hz)或 < 8.3ms(120Hz),不出现红色 jank bar。
- 重组次数(开启 `Layout Inspector → Show Recomposition Counts`)在过渡期间集中在共享元素子树内,周围 `Scaffold` / `LazyColumn` 头不应跟着每帧重组。
- 启动 Macrobenchmark 跑 `ScrollBenchmarks`,FrameTimingMetric 的 frameDurationCpuMs P95 < 16ms;详细方法见 [[androidNativeLearning 23-Macrobenchmark]]。

如果 P95 超标,大概率是 `Modifier.sharedElement` 内部有 unstable lambda 触发跨边界重组,把 capture 改为 `remember` 或拆出 `key { }` 重读。

## 5. 踩坑

### 5.1 `sharedElement` / `sharedBounds` 的 scope 必须一致

最容易遇到的"动画没生效":在两个独立的 `SharedTransitionLayout` 里用了同一个 key,Compose 不会跨 scope 配对。整个屏幕只放一个 `SharedTransitionLayout`,把所有 `AnimatedContent` / `AnimatedVisibility` 都置于其子树。跨页面共享元素必须等 Navigation Compose 2.8 的 `composable` 暴露同一个 scope —— 这点第 12 篇会说明。

### 5.2 `rememberSharedContentState` key 写错不报错

key 用字符串拼接的 noteId 时,任何一边写错(`"crd-${id}"` vs `"card-${id}"`)都不会报错,只是过渡静默退化为 `togetherWith` 默认 fade。把 key 抽到常量或扩展函数生成,IDE 重命名能批量跟。

### 5.3 `AnimatedVisibility` 子树的 modifier 顺序

```kotlin
// 反例:visible 切到 true 后,刚出现就被 padding 抢走 bounds
AnimatedVisibility(visible, modifier = Modifier.padding(16.dp).fillMaxWidth())

// 正例:padding 在外层 Container,visibility 决定内容生死
Box(Modifier.padding(16.dp)) {
    AnimatedVisibility(visible, modifier = Modifier.fillMaxWidth()) { ... }
}
```

`AnimatedVisibility` 自身的 modifier 链会参与 enter/exit 的 bounds 计算,padding 在内、外效果差很多。结合 Compose 1.7 的 Strong Skipping(参见 [[androidNativeLearning 22-Compose性能]]),把外层 modifier 抽到 `remember` 否则每次重组都重建,可能击穿 skipping。

### 5.4 `LookaheadScope` 嵌套有代价

`LookaheadScope` 双 pass 测量,本身有约 1.6 倍 layout 开销。一个屏幕里**只在外层包一次**,内部 `FlowRow` / `Row` 共享 scope,不要每个 `Card` 内部都套一个。Material 3 的 `BottomSheetScaffold` 内部已经包了 `LookaheadScope`,在它里面再嵌一层是负优化。

### 5.5 共享元素与 list-key 错位

`LazyColumn` 不显式给 `items(... key = { it.id })`,滚动重用 + key 缺失会让 sharedBounds 找错节点。详情返回列表时,bounds 会从一个错位的列表项膨胀回去——典型症状是"飞向屏幕外又弹回来"。**所有参与共享元素的 LazyList 必须给稳定 key**,且 key 类型保持 `String` / `Int`,不要传 lambda 或 data class(后者每次 List 重建 hashCode 不一致)。

### 5.6 `animate*AsState` 在循环 `LazyColumn` item 里失效

`items` 里直接 `animateColorAsState` 看似合理,但 LazyColumn 子节点滚动出屏幕时离开 composition,动画状态被销毁;滚回来重新进入 composition 时 `Animatable` 重建,看起来"动画从头来一遍"。要让滚动期间状态稳定,用 `key(itemId) { ... }` 包裹,并把动画值挂在更高的 `viewModel` 层。

### 5.7 `Modifier.offset(x.dp)` vs `Modifier.offset { IntOffset(...) }`

```kotlin
val x by animateFloatAsState(targetValue = if (open) 200f else 0f, label = "x")

// 反例:每帧触发 measure + layout
Modifier.offset(x = x.dp)

// 正例:只触发 placement(graphicsLayer 阶段)
Modifier.offset { IntOffset(x.roundToInt(), 0) }
```

带 lambda 的 offset 是 `LayoutModifier` 的 placement-only 路径,只在 layout phase 读取值,不会触发 composition 重组。动画频繁更新时差异明显:前者每帧重组,后者每帧只 placement。这是 Compose 1.7 后官方推荐的范式,所有 frame-rate 级别的动画 modifier(`offset` / `graphicsLayer` / `drawWithContent`)都有 lambda 版本。

### 5.8 共享元素 z-order 错位

`SharedTransitionLayout` 默认让出场元素 z-order 在底、入场元素在上;某些情况(详情页关闭时希望列表项盖住详情的内容)需要反转。在 `sharedBounds` 上配 `zIndexInOverlay = 1f` 控制覆盖关系。Compose 1.7 默认行为对 95% 场景适用,但用 Material 3 的 `Surface` 自带 elevation 时容易看错,逐个 case 试一下就好。

### 5.9 Predictive Back Gesture 中断的过渡

Android 15 全量启用预测式返回,用户按下返回手势但没松手时,系统会让你的页面"半透明拖到一半"。共享元素必须在这个中间态保持 bounds 正确——这要求 `NavHost`(第 12 篇)在 `popBackStack` 之前调用 `PredictiveBackHandler`,把进度参数喂给 `AnimatedContent` 的 spec。本篇 demo 用了 `Box(clickable onBack)` 简化,真实工程要靠 12 篇的路由集成。

### 5.10 Compose Compiler 报 `sharedTransitionLayout` 未稳定

`SharedTransitionScope` 这类作用域接口在 Compose 1.7 早期 build(`1.7.0-alpha`)上还有 stability inference 残留,会导致父 composable 不被 skip。BOM 1.7.0 正式版起已修复,但仍有第三方库在 lib 里固定老版本拖累。报警时升 BOM 到 1.7.3+。

### 5.11 `animateContentSize` 与 `AnimatedVisibility` 冲突

把 `Modifier.animateContentSize()` 加在 `AnimatedVisibility` 的外层 `Box` 上,容器尺寸过渡与可见性 enter / exit 会"打架",可能出现"刚展开就被 contentSize 又压扁一次"。规则:同一节点只用一种尺寸动画,要么 `animateContentSize`,要么 `AnimatedVisibility`(enter 自带高度变化),不要叠加。

---

## 手动验证

- [ ] `NoteCard` 单击展开:高度从 72dp 平滑过渡到内容高度,正文文字 fadeIn + slideIn,无瞬切。
- [ ] `NoteListDetailScreen` 点击列表项:背景色块从行内位置平滑膨胀到详情顶部矩形,标题文字从 `titleMedium` 字号过渡到 `headlineMedium`,且位置连续。
- [ ] 详情页点击空白返回:共享元素正确缩回列表对应行(不要飞到屏幕外或错位)。
- [ ] `TagFlow` 在 `tags` 列表新增 / 删除元素时,其余 tag 在 FlowRow 内平滑流动到新位置,而不是瞬切。
- [ ] 在 Android Studio Layout Inspector 启用 `Show Recomposition Counts`,共享元素过渡期间外层 `Scaffold` 重组次数不增长(只在共享元素子树内增长)。
- [ ] Profiler GPU 渲染面板里,过渡期间无红色 jank bar;Macrobenchmark `ScrollBenchmarks` 的 `frameDurationCpuMs` P95 < 16ms。
- [ ] 把 Android 15 设备的预测式返回手势打开(开发者选项),从详情页慢拖返回,共享元素跟随手势进度反向插值,不会"瞬间复位"。
