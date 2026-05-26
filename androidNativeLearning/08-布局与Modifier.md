# 布局、Modifier 与自适应

> 一句话:**Compose 的布局只有三种容器(Row / Column / Box),其余一切都是 `Modifier` 的组合**。理解 Modifier 链的顺序与"测量协议",就理解了所有自适应、多语言、可访问性问题的根源。

---

## 一、三种容器:Row / Column / Box

Compose 没有 XML 时代那一堆 LinearLayout / RelativeLayout / FrameLayout。**只有三个容器**:

```kotlin
Row {        // 子元素横向排列
    Text("A"); Text("B")
}

Column {     // 子元素纵向排列
    Text("A"); Text("B")
}

Box {        // 子元素叠在一起,后画的盖前面
    Image(...)
    Text("水印", modifier = Modifier.align(Alignment.BottomEnd))
}
```

这三个对应 Web 的 flex row / flex column / absolute,基本覆盖 90% 布局需求。其他需求:`LazyColumn`(可滚动列表,本质是带虚拟化的 Column)、`LazyRow`、`LazyVerticalGrid`,以及更高级的 `ConstraintLayout`(后面讲)。

**关键**:Compose 没有"线性 vs 相对"的取舍——`Row` / `Column` 默认就是线性,要相对位置加 `Modifier.align(...)` 或用 `Box`。这比 XML 的多种 Layout 类型简单一个数量级。

---

## 二、`Modifier`:链式 + 顺序敏感

```kotlin
Text(
    text = "Hello",
    modifier = Modifier
        .fillMaxWidth()
        .padding(16.dp)
        .background(Color.Red)
        .clickable { ... }
)
```

`Modifier` 是 Compose 里最重要的抽象,再强调一次。它有两条铁律:

**铁律 1:链式调用,顺序决定语义**。

```kotlin
Modifier.padding(16.dp).background(Color.Red)
// padding 先应用,背景画在内部 → 红色不含 padding 区域

Modifier.background(Color.Red).padding(16.dp)
// 背景先应用,padding 在外 → 红色含 padding 区域
```

读法:**Modifier 从左到右,前面的"包"在外,后面的"被包"在内**。

**铁律 2:每个 Composable 应当接收 `modifier: Modifier = Modifier` 作为第一个可选参数**。

```kotlin
@Composable
fun MyButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,    // ← 永远在 onClick 之后,业务参数之前
) {
    Button(onClick = onClick, modifier = modifier) {
        Text(text)
    }
}
```

这样调用方能 `MyButton("x", {}, modifier = Modifier.padding(8.dp))` 从外部控制。不接受 modifier 的 Composable 是"封死"的,无法在不同上下文复用。

---

## 三、尺寸 Modifier:fillMaxX / wrapContent / size / requiredSize

```kotlin
Modifier.fillMaxWidth()       // 横向填满父级
Modifier.fillMaxHeight()      // 纵向填满父级
Modifier.fillMaxSize()        // 两个方向都填满
Modifier.size(48.dp)          // 固定大小
Modifier.size(width = 100.dp, height = 50.dp)
Modifier.width(100.dp).height(50.dp)
Modifier.wrapContentSize()    // 包裹内容(默认行为)
Modifier.requiredSize(48.dp)  // 强制大小,不接受父约束
```

**`size` vs `requiredSize`**:
- `size(48.dp)`——告诉父级"我希望 48dp",父级可以再约束(给你 30dp 你只能 30)
- `requiredSize(48.dp)`——硬要 48dp,父级给的约束被忽略

99% 用 `size`,只有少数固定图标 / 头像才用 `requiredSize`。

---

## 四、`weight`:行/列里按权重分配

```kotlin
Row(modifier = Modifier.fillMaxWidth()) {
    Text(text = "Title", modifier = Modifier.weight(1f))
    Text(text = "Detail", modifier = Modifier.weight(2f))
}
```

`weight(1f)` 和 `weight(2f)` 把"剩余空间"按 1:2 分配。这是 RowScope / ColumnScope 的扩展函数——**只能在 Row / Column 内用**,Box 里没有。

`weight(1f, fill = false)`——按权重排,但不强制填满。少见但偶尔有用。

---

## 五、对齐:`Alignment` / `Arrangement`

Row / Column 有两个对齐维度——**主轴**(arrangement)与**交叉轴**(alignment):

```kotlin
Column(
    modifier = Modifier.fillMaxSize(),
    verticalArrangement = Arrangement.spacedBy(8.dp),    // 主轴:子元素间距
    horizontalAlignment = Alignment.CenterHorizontally,   // 交叉轴:横向居中
) { ... }

Row(
    horizontalArrangement = Arrangement.SpaceBetween,    // 主轴:两端对齐 / SpaceAround / SpaceEvenly / Center / End / Start
    verticalAlignment = Alignment.CenterVertically,
) { ... }
```

Box 里子元素用 `Modifier.align(Alignment.TopEnd)` 单独定位。`Alignment.TopStart / TopCenter / TopEnd / CenterStart / Center / CenterEnd / BottomStart / BottomCenter / BottomEnd` 九个常量。

---

## 六、`Spacer`:间距占位

```kotlin
Column {
    Text("A")
    Spacer(modifier = Modifier.height(8.dp))    // 8dp 间隙
    Text("B")
}
```

`Spacer` 就是一个不画任何东西的占位容器。短间隙也可以用 `Arrangement.spacedBy(8.dp)` 让 Column 自动加,**更清爽**:

```kotlin
Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
    Text("A")
    Text("B")
    Text("C")    // 每两个之间都 8dp,不用一个个 Spacer
}
```

---

## 七、`LazyColumn` / `LazyRow`:虚拟化列表

```kotlin
LazyColumn(
    modifier = Modifier.fillMaxSize(),
    contentPadding = PaddingValues(16.dp),
    verticalArrangement = Arrangement.spacedBy(8.dp),
) {
    items(notes, key = { it.id }) { note ->
        NoteRow(note = note)
    }
    item {
        // 单独一项
        Text("到底了")
    }
}
```

**关键**:用 `items(list, key = { ... })` 而不是 `forEach`。`key` 让 Compose 知道列表项的身份,即便顺序变了也能复用对应的 Composable 状态。**不给 key 等于"每次重组都从零开始",滚动卡顿、动画错乱**。

`LazyColumn` 的 DSL 跟 `Column` 长得不一样——前者是 `LazyListScope`(`item { }` / `items { }`),后者是 `ColumnScope`(直接调用 Composable)。区别:LazyColumn **只组合视口内的项**,List 长度 10 万也不卡。

---

## 八、`LazyVerticalGrid`:网格

```kotlin
LazyVerticalGrid(
    columns = GridCells.Fixed(2),        // 固定 2 列
    // 或 GridCells.Adaptive(minSize = 100.dp) 自适应
    modifier = Modifier.fillMaxSize(),
    verticalArrangement = Arrangement.spacedBy(8.dp),
    horizontalArrangement = Arrangement.spacedBy(8.dp),
) {
    items(items, key = { it.id }) { item ->
        ItemCard(item = item)
    }
}
```

`GridCells.Fixed(N)`——固定 N 列。`GridCells.Adaptive(minSize)`——每列至少 minSize,屏幕宽就放更多列。**自适应在大屏 / 平板 / 折叠屏自动多列,默认推荐**。

---

## 九、`ConstraintLayout`:谨慎使用

```kotlin
ConstraintLayout(modifier = Modifier.fillMaxSize()) {
    val (title, content) = createRefs()
    Text("Title", modifier = Modifier.constrainAs(title) {
        top.linkTo(parent.top)
        start.linkTo(parent.start)
    })
    Text("Content", modifier = Modifier.constrainAs(content) {
        top.linkTo(title.bottom, margin = 8.dp)
    })
}
```

Compose 给了 `ConstraintLayout`(来自 `androidx.constraintlayout:constraintlayout-compose`),**但日常应当少用**。原因:

- 同样的布局用 Row / Column 嵌套通常更短、更可读
- ConstraintLayout 的"引用 + constrainAs"模型在 Compose 里反直觉(它是为 XML 设计的)
- 嵌套深时性能不如 Row / Column

**真正需要 ConstraintLayout 的场景**:多个元素之间存在复杂的相对约束(链、引导线、屏障),且 Row/Column 嵌套会超过 4 层。这种情况不多。

---

## 十、`BoxWithConstraints`:响应父尺寸

```kotlin
BoxWithConstraints {
    if (maxWidth < 600.dp) {
        PhoneLayout()
    } else {
        TabletLayout()
    }
}
```

`BoxWithConstraints` 把"父级约束"暴露给 lambda(`maxWidth` / `maxHeight` / `minWidth` / `minHeight`),让子树根据可用空间分支。**这是 Compose 做响应式布局的本地工具**,不用 media query 也不用屏幕尺寸 qualifier。

**何时用**:
- 一个 Composable 在不同上下文宽度下有完全不同的内部布局
- 大屏 / 小屏走不同分支

**不要用作**:简单的 padding / 字号调整,那些用 `WindowSizeClass` 在屏幕级判断更合适。

---

## 十一、`WindowSizeClass`:屏幕级响应式

```kotlin
val windowSizeClass = calculateWindowSizeClass(activity)

when (windowSizeClass.widthSizeClass) {
    WindowWidthSizeClass.Compact -> PhoneScaffold()      // < 600dp
    WindowWidthSizeClass.Medium -> TabletPortraitScaffold()  // 600-840dp
    WindowWidthSizeClass.Expanded -> TabletLandscapeScaffold() // > 840dp
}
```

来自 `androidx.compose.material3:material3-window-size-class`。屏幕级响应式的标准 API。**推荐用法**:NavHost 内的"顶层屏幕"根据 WindowSizeClass 选不同 Scaffold;具体小组件用 `BoxWithConstraints` 局部响应。

---

## 十二、`Modifier.padding`:WindowInsets / Safe Area

```kotlin
Box(modifier = Modifier
    .windowInsetsPadding(WindowInsets.systemBars)    // 避让 status / nav bar
)
Box(modifier = Modifier
    .windowInsetsPadding(WindowInsets.ime)           // 避让键盘
)
Box(modifier = Modifier.safeDrawingPadding())        // 避让所有"系统装饰"
```

edge-to-edge 模式下,**任何在系统栏区域显示的内容都要主动避让**。`Scaffold` 自动处理,但自定义布局需要手动加。

`safeDrawingPadding()` 是最稳的——避让 status bar / nav bar / IME / display cutout(刘海)。新项目默认用它。

---

## 十三、多语言:LTR / RTL 与字符串资源

多语言不是给字符串翻译这么简单——阿拉伯语、希伯来语是从右向左排版(RTL),整个布局方向都要镜像。**Compose 默认自动镜像 Row 顺序**,但有几条要注意:

```kotlin
Row { Text("A"); Text("B") }   // LTR: A B    RTL: B A(自动镜像)
```

**陷阱**:用 `Modifier.padding(start = ...)` 而不是 `padding(left = ...)`——`start`/`end` 跟着方向走,RTL 下自动翻;`left`/`right` 是绝对方向,RTL 下不翻。

字符串放 `res/values/strings.xml`,翻译放 `res/values-zh/strings.xml`、`res/values-ar/strings.xml`、`res/values-ja/strings.xml`。Compose 里:

```kotlin
Text(text = stringResource(R.string.greeting))
Text(text = stringResource(R.string.welcome_user, userName))    // 带参数
```

Android 13+ **Per-App Language**:用户可以在系统设置里给单个 App 设语言。需要 `LocaleConfig`:

`AndroidManifest.xml`:
```xml
<application
    android:localeConfig="@xml/locales_config">
```

`res/xml/locales_config.xml`:
```xml
<locale-config xmlns:android="http://schemas.android.com/apk/res/android">
    <locale android:name="en" />
    <locale android:name="zh" />
    <locale android:name="ja" />
</locale-config>
```

用户改语言后 Activity 重建,Compose 自动加载新 locale 字符串——不需要写代码。

---

## 十四、字体:`Typography` 与可下载字体

`Typography` 在 `NotedXTheme` 里定义:

```kotlin
val NotedXTypography = Typography(
    displayLarge = TextStyle(
        fontFamily = NotedXFontFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 57.sp,
    ),
    // ... Material 3 提供 15 种角色
)
```

字体文件放在 `res/font/`,声明:

```kotlin
val NotedXFontFamily = FontFamily(
    Font(R.font.inter_regular, FontWeight.Normal),
    Font(R.font.inter_bold, FontWeight.Bold),
)
```

**可下载字体**(`Downloadable Fonts`)——用 Google Fonts 不打包到 APK,首次启动从 Play Services 下载:

```kotlin
val provider = GoogleFont.Provider(
    providerAuthority = "com.google.android.gms.fonts",
    providerPackage = "com.google.android.gms",
    certificates = R.array.com_google_android_gms_fonts_certs
)
val NotedXFontFamily = FontFamily(
    Font(googleFont = GoogleFont("Inter"), fontProvider = provider, weight = FontWeight.Normal),
    Font(googleFont = GoogleFont("Inter"), fontProvider = provider, weight = FontWeight.Bold),
)
```

APK 不变大,字体来自 Google CDN。**生产推荐**——前提是用户机型有 Play Services(国际版可,国内市场要兜底)。

---

## 十五、字号:`sp` 跟随用户缩放

Compose 里距离 / 大小用 `dp`,**字号用 `sp`**——`sp` 跟着系统"字体大小"设置缩放。

```kotlin
Text(text = "Hello", fontSize = 16.sp)
```

如果某些场景**不希望字体缩放**(图标里的字、容器内必须固定的标签),改用 `dp`:

```kotlin
Text(text = "1", fontSize = 16.dp.value.sp,
     // 或者用 nonScaledSp 扩展,自定义实现
)
```

**默认永远用 `sp`**——不缩放是给可访问性帮倒忙。

---

## 十六、可访问性:`contentDescription` 与语义

```kotlin
Icon(
    Icons.Default.Edit,
    contentDescription = "编辑笔记",     // 屏幕阅读器念给视障用户
)

Image(
    painter = painterResource(R.drawable.banner),
    contentDescription = null,           // 装饰性图片,显式 null 告诉系统跳过
)
```

**所有图标 / 图片必须显式设置 `contentDescription`**(可以是 `null`,但不能漏)——Android Lint 会报警告。

更高级的语义控制用 `Modifier.semantics { }`:

```kotlin
Box(modifier = Modifier.semantics {
    contentDescription = "未读消息 5 条"
    role = Role.Button
}) { ... }
```

可访问性测试:打开设备 TalkBack,从屏幕顶部双指划下,听屏幕阅读器念出的内容是否合理。

---

## 十七、踩坑

**坑 1:Row 里子元素超出宽度也不报错,被截掉**。Row 默认不滚动,子元素超宽就被裁切。需要滚动加 `Modifier.horizontalScroll(rememberScrollState())` 或换 `LazyRow`。

**坑 2:`LazyColumn` 嵌套在 `Column { verticalScroll }` 里**。两个滚动容器嵌套,Compose 直接抛 IllegalStateException——"Vertically scrollable component was measured with an infinity maximum height constraints"。**LazyColumn 自己已经可滚动,不要再套 Column + verticalScroll**。

**坑 3:用 `Modifier.padding(left/right)` 而不是 `start/end`**。RTL 语言下不会自动镜像,阿拉伯用户看到的就是错位布局。

**坑 4:列表项不给 `key`**。`items(list) { ... }` 没有 key,列表项重新排序后状态(展开/收起、动画进度)全错乱。**永远给 key**,id 是最常见的 key 选择。

**坑 5:`weight` 在 Box 里用**。`weight` 是 RowScope / ColumnScope 的扩展,Box 里没有。编译报错:`Unresolved reference: weight`。

**坑 6:嵌套 ConstraintLayout 做简单布局**。一个 ConstraintLayout 里嵌一个 ConstraintLayout 嵌一个 ConstraintLayout——这种是上一代 Android 思维残留。改 Row / Column 嵌套通常代码减半、性能更好。

**坑 7:固定 `width` / `height` 写 `0.dp` 试图"不占空间"**。`Modifier.size(0.dp)` 在某些 measure 里会出问题。要"暂时不显示"用 `if (visible) { Composable() }`,要"占位但不可见"用 `Modifier.alpha(0f)`。

**坑 8:`stringResource` 在非 Composable 里调**。`stringResource` 是 Composable,只能在 Composable 里用。要在 ViewModel 取字符串,**通常不要**——错误消息应当作为 enum / sealed 暴露给 UI,UI 再用 `stringResource` 渲染。ViewModel 不该依赖 R.string,因为这破坏可测试性。

**坑 9:忘了给装饰性图片 `contentDescription = null`**。Lint 警告不致命,但提交到 Play Store 的可访问性审核会扣分。

---

下一篇 `09-动画 SharedElement 与 Lookahead.md`,讲 Compose 的动画系统:`animate*AsState` 一行动画、`Crossfade` / `AnimatedVisibility` 切换动画、Compose 1.7 的 `SharedTransitionLayout`(屏幕间元素 morphing)与 `LookaheadScope`(预测布局)。这一篇之后,你能写出抖音 / Twitter 那种"图片放大到详情页"的过渡。
