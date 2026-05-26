# 动画、SharedElement 与 Lookahead

> 一句话:**Compose 动画的全部 API 都围绕一件事——让某个 State 不是瞬间变,而是按时间曲线过渡过去**。`animate*AsState` 是这件事的一行版本,`SharedTransitionLayout` 是它的跨屏版本。

---

## 一、动画的本质:State 插值

Compose 没有"动画对象 + 监听器 + start/stop"那一套。它只有一个想法:**给我一个目标 State,我帮你按曲线把当前值滑过去**。

```kotlin
var expanded by remember { mutableStateOf(false) }
val size by animateDpAsState(
    targetValue = if (expanded) 200.dp else 80.dp,
    label = "size"
)
Box(modifier = Modifier
    .size(size)
    .clickable { expanded = !expanded }
)
```

`animateDpAsState` 的语义:**给我一个 target,我返回一个会平滑过渡到 target 的 State**。`expanded` 改了,目标变了,Compose 每帧重组,size 慢慢从 80 涨到 200。

这就是 Compose 动画的所有秘密。剩下的 API 全部是这件事的变形。

---

## 二、`animate*AsState` 全家族

```kotlin
val color by animateColorAsState(if (selected) Color.Blue else Color.Gray, label = "color")
val alpha by animateFloatAsState(if (visible) 1f else 0f, label = "alpha")
val offset by animateIntOffsetAsState(targetOffset, label = "offset")
val rect by animateRectAsState(targetRect, label = "rect")
val padding by animateDpAsState(if (focused) 16.dp else 8.dp, label = "padding")
```

每种类型都有对应函数:Dp / Float / Color / IntOffset / Rect / Size / Int / Offset。**`label` 参数**——给动画起个名字,Android Studio 的 Animation Preview 工具会用它,日志也会用。**永远填一个**。

可以指定动画规格:

```kotlin
val size by animateDpAsState(
    targetValue = target,
    animationSpec = spring(            // 弹簧动画
        dampingRatio = Spring.DampingRatioMediumBouncy,
        stiffness = Spring.StiffnessMedium,
    ),
    label = "size",
)
// 或:
animationSpec = tween(durationMillis = 300, easing = FastOutSlowInEasing)
animationSpec = snap()                  // 瞬间跳过去(不动画)
animationSpec = keyframes {             // 关键帧
    durationMillis = 400
    0.5f at 100  with FastOutSlowInEasing
}
```

**默认 `spring`**——比 `tween` 更自然,Material 3 推荐。`tween` 适合需要精确时长的场景(过渡 + 其他时间同步)。

---

## 三、`AnimatedVisibility`:进入 / 退出

```kotlin
AnimatedVisibility(
    visible = showHint,
    enter = fadeIn() + slideInVertically(),
    exit = fadeOut() + slideOutVertically(),
) {
    HintCard()    // visible 时显示,带动画
}
```

**`AnimatedVisibility` 是显示 / 隐藏带动画的标准方式**——比手写 alpha 动画更省心,处理"动画完成前内容仍占空间"的边界情况。

进入 / 退出动画可以组合:`fadeIn() + slideInVertically()` 同时淡入和上推。

`AnimatedVisibility` 的子树**在 hidden 时不被组合**——重要的性能性质,意味着复杂子树在不可见时零成本。

---

## 四、`Crossfade`:状态切换交叉淡化

```kotlin
Crossfade(targetState = currentScreen, label = "screen") { screen ->
    when (screen) {
        Screen.Home -> HomeScreen()
        Screen.Detail -> DetailScreen()
    }
}
```

`Crossfade` 在两个 Composable 之间交叉淡化。适合"切换显示内容"——比如 Loading / Content / Error 三态。

```kotlin
Crossfade(targetState = uiState, label = "state") { state ->
    when (state) {
        is UiState.Loading -> LoadingIndicator()
        is UiState.Content -> NoteList(state.notes)
        is UiState.Error -> ErrorView(state.message)
    }
}
```

---

## 五、`AnimatedContent`:更通用的切换

`AnimatedContent` 是 `Crossfade` 的超集——允许根据"从什么状态到什么状态"决定不同的动画:

```kotlin
AnimatedContent(
    targetState = count,
    transitionSpec = {
        if (targetState > initialState) {
            slideInVertically { it } + fadeIn() togetherWith
                slideOutVertically { -it } + fadeOut()
        } else {
            slideInVertically { -it } + fadeIn() togetherWith
                slideOutVertically { it } + fadeOut()
        }
    },
    label = "count",
) { value ->
    Text(text = "$value", fontSize = 32.sp)
}
```

数字增加时往上滚,数字减少时往下滚。这种"基于变化方向不同动画"是 `AnimatedContent` 的招牌用例。

---

## 六、`Modifier.animateContentSize()`:容器自适应

```kotlin
Column(modifier = Modifier.animateContentSize()) {
    Text("Header")
    if (expanded) {
        DetailText(...)        // 展开时,Column 高度变化,自动动画
    }
}
```

**`animateContentSize()` 是布局变化时容器自身大小过渡的标准答案**——添加 / 移除子元素时不用手写大小动画。

---

## 七、`rememberInfiniteTransition`:无限循环动画

```kotlin
val transition = rememberInfiniteTransition(label = "loading")
val rotation by transition.animateFloat(
    initialValue = 0f,
    targetValue = 360f,
    animationSpec = infiniteRepeatable(
        animation = tween(1000, easing = LinearEasing),
    ),
    label = "rotation",
)
Icon(
    Icons.Default.Refresh,
    contentDescription = null,
    modifier = Modifier.rotate(rotation),
)
```

无限循环动画(加载指示、心跳、呼吸效果)。**消耗 CPU 持续重组**,屏幕不可见时记得用 `LaunchedEffect` + 显示判断暂停。

---

## 八、`SharedTransitionLayout`:Compose 1.7 的杀手锏

这是 Compose 1.7 的最大新特性——**两个屏幕之间,同一个元素能 morph 过渡**:列表里点一张图,图无缝放大成详情页大图。

```kotlin
SharedTransitionLayout {
    AnimatedContent(
        targetState = currentScreen,
        label = "screen",
    ) { screen ->
        when (screen) {
            is Screen.List -> NoteListScreen(
                animatedVisibilityScope = this@AnimatedContent,
                sharedTransitionScope = this@SharedTransitionLayout,
                onNoteClick = { currentScreen = Screen.Detail(it) },
            )
            is Screen.Detail -> NoteDetailScreen(
                noteId = screen.id,
                animatedVisibilityScope = this@AnimatedContent,
                sharedTransitionScope = this@SharedTransitionLayout,
            )
        }
    }
}
```

两个屏幕里用 `sharedElement` 标记"同一个东西":

```kotlin
@Composable
fun NoteCard(
    note: Note,
    sharedTransitionScope: SharedTransitionScope,
    animatedVisibilityScope: AnimatedVisibilityScope,
) = with(sharedTransitionScope) {
    Row(
        modifier = Modifier
            .sharedElement(
                state = rememberSharedContentState(key = "note-${note.id}"),
                animatedVisibilityScope = animatedVisibilityScope,
            )
    ) {
        AsyncImage(model = note.imageUrl, ...)
        Text(note.title)
    }
}

@Composable
fun NoteDetailScreen(
    noteId: Long,
    sharedTransitionScope: SharedTransitionScope,
    animatedVisibilityScope: AnimatedVisibilityScope,
) = with(sharedTransitionScope) {
    Column(
        modifier = Modifier
            .sharedElement(
                state = rememberSharedContentState(key = "note-$noteId"),
                animatedVisibilityScope = animatedVisibilityScope,
            )
    ) {
        AsyncImage(...)
        Text(...)
    }
}
```

**关键**:`key` 必须**完全相同**,Compose 才能识别"这是同一个元素"。`note-${id}` 是常见 pattern。

**`sharedElement` vs `sharedBounds`**:
- `sharedElement` 强保留同一个 Composable 在两屏的位置 / 大小
- `sharedBounds` 允许两屏的 Composable 内容不同但占据"同一个边界",content 自己淡入淡出

实操上,详情页与列表项内容总是不一样,**`sharedBounds` 用得更多**。

---

## 九、`LookaheadScope`:预测布局

`LookaheadScope` 是 Compose 1.7 的另一个新底座——它让 Compose 测量阶段"预先知道"未来的目标布局,从而对中间过渡做更精细的动画。

```kotlin
LookaheadScope {
    if (expanded) {
        Row { ... }      // 横排
    } else {
        Column { ... }   // 竖排
    }
    // Row ↔ Column 切换时,LookaheadScope 提供平滑过渡
}
```

`LookaheadScope` 本身不会自动动画——它是底座,实际动画走 `Modifier.animateBounds(lookaheadScope = this@LookaheadScope)` 这种。日常用得不多,**主要是动画库的实现底座**。

`SharedTransitionLayout` 内部就是 LookaheadScope + 一套共享元素 API。

---

## 十、何时不要动画

动画不是越多越好。**以下场景不应动画**:

- **快速点击的高频操作**——计数器加 1,数字"滑过去"的动画反而让用户看不清
- **数据列表的加载完成**——突然出现一堆东西的渐入会拖慢"感知速度"
- **错误状态切换**——错误信息要立刻显示,不要慢慢淡入
- **可访问性敏感场景**——TalkBack 用户感知不到动画,过长的动画反而让操作变慢

Compose 默认动画时长 ~300ms,**用户能感知到的"立即"是 100ms 以内**。除非有过渡感的明确需求,否则不要加动画。

---

## 十一、Predictive Back Gesture(Android 14+)

Android 14 起,**返回手势可以"预览返回到上一屏"**。Compose 1.7+ 提供 `PredictiveBackHandler`:

```kotlin
PredictiveBackHandler(enabled = canGoBack) { progress ->
    try {
        progress.collect { backEvent ->
            // backEvent.progress 0..1,你可以用它驱动当前屏幕的"被推开"动画
        }
        // collect 完成 = 用户完成返回
        navController.popBackStack()
    } catch (e: CancellationException) {
        // 用户中途松手取消
    }
}
```

`navigation-compose` 2.8+ **默认集成 Predictive Back**——你只要正常用 NavHost,系统会自动给 Composable 切换加上预览动画,不需要额外代码。手写 PredictiveBackHandler 只在特殊场景(自定义返回逻辑)用。

---

## 十二、Material Motion:实际项目的动画清单

不是每个动画都要从零设计。Material 3 给的"动作"分类:

| 模式 | 时长 | 用途 | Compose 体现 |
| --- | --- | --- | --- |
| Container Transform | 300-500ms | 列表项展开为详情屏 | `SharedTransitionLayout` + `sharedBounds` |
| Shared Axis | 300ms | 同级别屏幕间切换 | `AnimatedContent` + slide |
| Fade Through | 150-200ms | 强切换(主屏 tab) | `Crossfade` |
| Fade | 75-150ms | 微调状态(button press) | `animateColorAsState` |

**记一件事**:动画时长**越短越好**。Material 3 默认偏短,不要随便延长。

---

## 十三、第一个完整的列表 → 详情动画

```kotlin
sealed interface Screen {
    data object List : Screen
    data class Detail(val noteId: Long) : Screen
}

@Composable
fun NoteFlow() {
    var currentScreen by remember { mutableStateOf<Screen>(Screen.List) }
    
    SharedTransitionLayout {
        AnimatedContent(
            targetState = currentScreen,
            transitionSpec = {
                fadeIn() togetherWith fadeOut()
            },
            label = "screen",
        ) { screen ->
            when (screen) {
                Screen.List -> NoteList(
                    sharedTransitionScope = this@SharedTransitionLayout,
                    animatedVisibilityScope = this@AnimatedContent,
                    onClick = { currentScreen = Screen.Detail(it) },
                )
                is Screen.Detail -> NoteDetail(
                    noteId = screen.noteId,
                    sharedTransitionScope = this@SharedTransitionLayout,
                    animatedVisibilityScope = this@AnimatedContent,
                    onBack = { currentScreen = Screen.List },
                )
            }
        }
    }
}
```

里面每个 Composable 用 `Modifier.sharedBounds(state = rememberSharedContentState(key = "note-$id"), ...)` 标记跨屏共享。点列表项,**整张卡片**(图片 + 文字)无缝放大成详情。这是 Twitter / Instagram / 抖音那种过渡的 Compose 实现,**且只要十几行代码**。

11 篇会把它接入真正的 Navigation Compose,不是用 sealed state 切换。

---

## 十四、踩坑

**坑 1:`animate*AsState` 不填 `label`**。Animation Preview 工具看不到这个动画,调试时一团乱麻。**永远填 label**。

**坑 2:`AnimatedVisibility` 里放重的 Composable**。`AnimatedVisibility` 在 visible 时才组合子树,但**进入动画期间组合是马上发生的**——重的初始化(数据库读取、图像解析)会让动画卡帧。把昂贵工作放 LaunchedEffect,Composable 本身保持轻。

**坑 3:无限动画在屏幕不可见时还在跑**。`rememberInfiniteTransition` 不会自动暂停。用 `LaunchedEffect(visibility)` 配合判断。

**坑 4:`SharedTransitionLayout` 里 key 不匹配**。两屏的 key 必须**字面完全相同**——`"note-${note.id}"` vs `"note-$noteId"` 也行,但要保证生成出来的字符串一致。打错一个字,动画无效但不报错。

**坑 5:动画里用 `LaunchedEffect` 同步两个状态**。这是反 Compose 模式。一个状态变 → 另一个状态自动跟着变,应当用 `derivedStateOf` 或者直接在动画里读源 State,不要"用副作用同步"。

**坑 6:`animationSpec` 复制粘贴 `tween(500)` 到处用**。各种动画时长不一致会让 UI 感觉"乱"。**统一一份动画 token**:`object Motion { val Short = 150; val Medium = 300; val Long = 500 }`,所有动画引用它。

**坑 7:动画完成后状态不一致**。比如 `var expanded by mutableStateOf(false)`,动画把高度从 200 滑到 80 期间,如果用户中途又点了,状态切回 true 但 size 还在 80 → 200 的路上——这是正常的(Compose 会从当前值继续插值到新 target),但 dev 经常误以为是 bug。理解它不是 bug 就行。

**坑 8:列表项加入 / 移除没动画**。`LazyColumn` 默认不给 item 加入 / 移除动画。要加:`items(notes, key = { it.id }) { note -> NoteRow(note = note, modifier = Modifier.animateItem()) }`。Compose 1.7+ 提供 `animateItem`,1.6 之前叫 `animateItemPlacement`。

---

下一篇 `10-应用架构 ViewModel UDF 与 UIState.md`,把"状态从哪来、事件去哪、屏幕之间怎么共享"系统讲清楚。Hilt 注入、Navigation 路由、Room 持久化都在这一篇之后才有意义——没有架构,所有功能堆在 Composable 里就是新版屎山。
