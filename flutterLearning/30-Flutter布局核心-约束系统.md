# Flutter 布局核心:约束系统

Flutter 布局系统**只有一句话**:

> **Constraints go down. Sizes go up. Parent sets position.**
> 约束往下传,尺寸往上报,父级决定位置。

理解这一句,你就能看懂任何 Flutter 报错和布局诡异行为。

---

## 一、单次 Layout 的三步舞

每个 Widget 在布局时:

```
1. 父级把 Constraints(约束)传给子级
   └─ "你的尺寸必须在 minWidth~maxWidth、minHeight~maxHeight 之间"

2. 子级根据约束决定自己的 Size
   └─ "我决定我多大"

3. 父级根据子级 Size,决定子级的 Position
   └─ "把你放在 (x, y)"
```

每一帧都跑一遍这个过程(回顾 05 三棵树)。

---

## 二、什么是 Constraints

```dart
class BoxConstraints {
  final double minWidth, maxWidth;
  final double minHeight, maxHeight;
}
```

四个值描述"你的尺寸允许在哪个范围"。常见情况:

| 场景 | 约束 |
| --- | --- |
| **Tight(紧约束)** | min == max,尺寸固定 |
| **Loose(松约束)** | min == 0,max 是上限 |
| **Bounded(有界)** | max 是有限值 |
| **Unbounded(无界)** | max = `double.infinity` |

```dart
// 典型紧约束:你必须 100x50
const BoxConstraints.tightFor(width: 100, height: 50);

// 典型松约束:你最多 300x500,最小 0x0
const BoxConstraints.loose(Size(300, 500));

// 典型无界:你随便多大
const BoxConstraints(maxWidth: double.infinity, maxHeight: double.infinity);
```

---

## 三、不同父级传不同的约束

每种父级 Widget 传给子级的约束规则不同。这是 Flutter 布局**最容易踩坑**的地方。

### 1. SizedBox / ConstrainedBox

强制子级的尺寸范围:

```dart
SizedBox(
  width: 100,
  height: 50,
  child: Container(...),    // 子级必须 100x50
)
```

### 2. Container

如果只设 `child`,Container 把父级约束**透传给子**;如果设了尺寸,加约束:

```dart
Container(
  width: 100,                // 子级最大 100
  child: Text('hi'),
)
```

### 3. Center

把约束**变松**(min = 0),让子级自由决定大小:

```dart
Center(child: Text('hi'))    // Text 决定自己多大
```

### 4. Row / Column

把**主轴方向**变成无界(unbounded),子级在主轴上想多大都行:

```dart
Column(
  children: [
    Text('a'),     // 子级在垂直方向无界
    Text('b'),
  ],
)
```

这就是为什么 `Column 里嵌 ListView` 会爆——ListView 也要无界,但它需要"我多大"才能算滚动距离,无限循环 → 报错。

### 5. Stack

把约束变松,但子级 size 不会撑大父级:

```dart
Stack(
  children: [
    Container(color: Colors.blue),   // 充满
    Positioned(                       // 绝对定位
      top: 10, left: 10,
      child: Text('hi'),
    ),
  ],
)
```

### 6. Expanded / Flexible

只能在 Row / Column 里用,**强制接收无限大的主轴空间**:

```dart
Row(children: [
  Text('a'),
  Expanded(child: Container(color: Colors.red)),    // 占剩下所有
  Text('b'),
])
```

---

## 四、Sizes go up

子级根据约束决定 size,然后告诉父级。

```dart
// Container(child: Text('hi')):
// 1. 父给约束:max 200x100
// 2. Container 透传给 Text
// 3. Text 算字尺寸:50x20
// 4. Text 把 50x20 报给 Container
// 5. Container 自己也变 50x20
// 6. Container 把 50x20 报给爷爷
```

如果 Container 设了 `width:100`,Text 仍然报自己的 50x20,但 Container 强制为 100。

---

## 五、Parent sets position

子级**不知道**自己被放在哪。父级根据自己的逻辑(Stack 的 Positioned、Row 的对齐方式等)决定。

```dart
Center(child: Text('hi'))
// Text 自己只知道:我是 50x20
// Center 把它放到中间
```

---

## 六、典型布局错误

### 1. 无界宽度里放无界子(Row 嵌 ListView)

```dart
Row(children: [
  ListView(children: [...]),    // ❌ 无界 + 无界 = ListView 不知道多宽
])
```

报错:`RenderFlex children have non-zero flex but incoming width constraints are unbounded.`

**修复**:给 ListView 一个有限宽度:

```dart
Row(children: [
  Expanded(child: ListView(...)),    // ✅ Expanded 给了有限宽度
])

// 或
SizedBox(width: 200, child: ListView(...))
```

### 2. 无限高的 Column 里放 ListView

```dart
Column(
  mainAxisSize: MainAxisSize.min,
  children: [
    Text('header'),
    ListView(children: [...]),    // ❌ Column 主轴无界,ListView 也无界
  ],
)
```

**修复**:

```dart
// 方案 1:Expanded
Column(children: [
  Text('header'),
  Expanded(child: ListView(...)),
])

// 方案 2:shrinkWrap(性能差,慎用)
ListView(shrinkWrap: true, ...)

// 方案 3:固定高度
SizedBox(height: 200, child: ListView(...))
```

### 3. ListView 嵌套 ListView

```dart
ListView(
  children: [
    ListView(...),    // ❌ 内层无界 + 外层无界
  ],
)
```

**修复**:内层加 `shrinkWrap: true` 和 `physics: NeverScrollableScrollPhysics()`,或重构为 `CustomScrollView` + Slivers(回顾 32)。

---

## 七、Row / Column 的对齐

```dart
Row(
  mainAxisAlignment: MainAxisAlignment.spaceBetween,    // 主轴
  crossAxisAlignment: CrossAxisAlignment.center,        // 交叉轴
  mainAxisSize: MainAxisSize.max,    // 主轴占满 / .min 紧凑
  children: [...],
)
```

### MainAxisAlignment

```
start         |[A][B][C]    |
end           |    [A][B][C]|
center        |  [A][B][C]  |
spaceBetween  |[A]   [B] [C]|
spaceAround   | [A]  [B] [C]|
spaceEvenly   |  [A] [B] [C]|
```

### CrossAxisAlignment

```dart
CrossAxisAlignment.start       // 顶部对齐(Row 时)
CrossAxisAlignment.end
CrossAxisAlignment.center      // 默认
CrossAxisAlignment.stretch     // 拉伸到充满交叉轴
CrossAxisAlignment.baseline    // 文本基线对齐(Row 内不同字号文字)
```

---

## 八、Expanded vs Flexible vs Spacer

只在 Row/Column 内使用。

| Widget | 行为 |
| --- | --- |
| `Expanded` | 占据剩余空间,**强制充满** |
| `Flexible(fit: tight)` | 等同 Expanded |
| `Flexible(fit: loose)` | 占据剩余空间,但**子级可以小于** |
| `Spacer` | 等同空 Expanded,只占位 |

```dart
Row(children: [
  Text('左'),
  const Spacer(),        // 占满中间
  Text('右'),
])

Row(children: [
  Expanded(flex: 2, child: A()),   // 2/3
  Expanded(flex: 1, child: B()),   // 1/3
])

// flex 默认 1
Expanded(child: A())   // 等价 flex: 1
```

---

## 九、IntrinsicHeight / IntrinsicWidth(慎用)

让子级"按内容算"自己的尺寸,然后强制传给所有兄弟:

```dart
IntrinsicHeight(
  child: Row(children: [
    Container(color: Colors.red),
    VerticalDivider(),
    Container(color: Colors.blue),
  ]),
)
```

让两个 Container 等高(由内容决定)。

⚠️ **性能差**:每次都要预跑一遍 layout 算"intrinsic"尺寸,大列表里慎用。

---

## 十、AspectRatio:固定宽高比

```dart
AspectRatio(
  aspectRatio: 16 / 9,
  child: Container(color: Colors.black),
)
```

宽度由父级给,高度按 16:9 算。

---

## 十一、FittedBox:缩放内容

```dart
FittedBox(
  fit: BoxFit.scaleDown,
  child: Text('一段很长很长的标题'),    // 自动缩小到能容纳
)
```

`fit` 选项:`fill / contain / cover / fitWidth / fitHeight / scaleDown / none`,跟 `Image.fit` 一致。

---

## 十二、IntrinsicWidth 替代:LayoutBuilder

```dart
LayoutBuilder(builder: (_, constraints) {
  print('我得到的约束:$constraints');
  if (constraints.maxWidth < 600) return PhoneLayout();
  return TabletLayout();
})
```

LayoutBuilder 让你拿到父级传来的约束,**自己决定怎么布局**,常用于响应式 UI(回顾 22)。

---

## 十三、调试布局

### 1. 给 Container 一个边框

```dart
Container(
  decoration: BoxDecoration(border: Border.all(color: Colors.red)),
  child: ...,
)
```

肉眼看到尺寸。

### 2. debugPaintSizeEnabled

```dart
import 'package:flutter/rendering.dart';

void main() {
  debugPaintSizeEnabled = true;
  runApp(MyApp());
}
```

整个 App 所有 Widget 都画上边框 + padding。

### 3. Flutter Inspector(必学)

DevTools 里:
- 选中 Widget,看它的 Constraints / Size
- "Select Widget Mode" → 点击屏幕直接定位代码

### 4. RenderObject 断点

```dart
context.findRenderObject()
```

看 size、constraints、parent。

---

## 十四、约束选择速查

```
父级想限定子级尺寸 → SizedBox / ConstrainedBox
子级居中           → Center
子级铺满父级       → 不需要任何 wrap(默认就是 tight)
按比例分            → Expanded / Flex
等高 / 等宽 兄弟    → IntrinsicHeight / IntrinsicWidth(慎)
固定宽高比         → AspectRatio
缩放至能容纳       → FittedBox
按内容自适应       → 别加约束,让子级自己算
```

---

## 十五、Padding / Margin

Flutter 没有"margin"概念,只有 padding,但 Container 上的 `margin` 实际是用 Padding 包了一层:

```dart
Container(margin: EdgeInsets.all(8), child: ...)
// 等价
Padding(padding: EdgeInsets.all(8), child: Container(child: ...))
```

`EdgeInsets`:

```dart
EdgeInsets.all(8)
EdgeInsets.symmetric(horizontal: 8, vertical: 4)
EdgeInsets.only(left: 8, top: 4)
EdgeInsets.fromLTRB(8, 4, 8, 4)

// 响应式(国际化时镜像)
EdgeInsetsDirectional.only(start: 8, top: 4)
```

---

## 十六、对齐:Align

```dart
Align(
  alignment: Alignment.bottomRight,
  child: Text('hi'),
)

Align(
  alignment: Alignment(0.5, -0.3),    // -1~1
  child: ...,
)
```

`Center` 是 `Align(alignment: Alignment.center)` 的简写。

---

## 十七、Stack:层叠布局

```dart
Stack(
  alignment: Alignment.center,    // 默认所有非 Positioned 子的对齐
  children: [
    Image.network('...'),         // 底层
    Positioned(
      bottom: 16, right: 16,
      child: FloatingActionButton(...),
    ),
  ],
)
```

`Positioned` 必须在 Stack 内,指定 left/top/right/bottom 任意几个。
`Positioned.fill(child: ...)` = 充满父 Stack。

---

## 十八、布局心智:无尺寸的 Widget 是绝大多数

很多 Widget(Text、Icon、Image)默认没尺寸,**它们的尺寸是父级让它们多大它们就多大,或者按内容**:

```dart
Text('hi')                    // 按字算尺寸
Icon(Icons.star)              // 24x24(默认)
Image.network(url)            // 按图片原尺寸,但被父约束

Container()                   // ⚠️ 没 child 时,撑满父级!
Container(width: 50)          // 50xMax
SizedBox.shrink()             // 0x0
SizedBox.expand()             // 充满父级
```

---

## 十九、常见误区

### 1. 想居中,不知道用什么

```dart
// ❌ 没用
Container(child: Text('hi'))

// ✅
Center(child: Text('hi'))
// 或
Container(alignment: Alignment.center, child: Text('hi'))
```

### 2. 想等宽,用百分比

Flutter 不支持百分比。用:

```dart
LayoutBuilder(builder: (_, c) =>
  Container(width: c.maxWidth * 0.5, ...)
)

// 或 FractionallySizedBox
FractionallySizedBox(
  widthFactor: 0.5,
  child: ...,
)
```

### 3. Container 不显示

```dart
Container(color: Colors.red)    // ❌ 没尺寸 + 在 Row 里 + 没父约束 = 0
```

→ 加尺寸或包 Expanded。

### 4. Text 溢出

```dart
Row(children: [
  Text('一段很长很长很长的文字...'),   // ❌ 溢出 Row 边界
])

// ✅
Row(children: [
  Expanded(child: Text('...', overflow: TextOverflow.ellipsis))
])
```

### 5. Wrap 子级过大

`Wrap` 在子级超过父级宽度时换行:

```dart
Wrap(spacing: 8, children: tags.map((t) => Chip(label: Text(t))).toList())
```

---

## 二十、和已学知识的串联

- 三棵树(05):布局过程是 Element → RenderObject 干的活
- 性能(18):IntrinsicHeight 慢、ListView builder 重要,都是布局相关
- 响应式 UI(22):LayoutBuilder + Constraints 是核心
- 滚动 / Sliver(32):滚动也是约束系统的扩展(SliverConstraints)

---

## 二十一、心智模型

```
布局 = "约束往下,尺寸往上"

看任何报错,先问三个问题:
  1. 父级给了什么约束?(unbounded?tight?)
  2. 子级想多大?
  3. 父级如何放置?
```

**99% 的布局困惑都来自不理解约束**。一旦你能在脑子里"看见"一棵树上每个节点接收的约束和返回的尺寸,Flutter 布局就再也不能困住你了。

DevTools 的 Layout Explorer 是个杀手工具:**选 Widget 直接看到它的约束、尺寸、padding,所有数字一目了然**。卡住的时候用它。
