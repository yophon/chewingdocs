# Flutter 三棵树:Widget、Element、RenderObject

这是 Flutter 的核心架构。理解了它,你就理解了"为什么 Widget 能频繁重建却不卡顿""为什么 setState 不重建整个页面""Key 到底干嘛用的"。

---

## 一、为什么要三棵树?

如果只用一棵 Widget 树:每次刷新都要销毁所有 UI 重建,性能爆炸。
如果只用 RenderObject 树:开发体验差,每次都要手动改像素。

Flutter 的方案是**三层分工**:

| 树            | 角色        | 寿命               | 是否可变  |
| ------------ | --------- | ---------------- | ----- |
| Widget       | 配置蓝图      | 极短(每次 build 都重建) | 不可变   |
| Element      | 实际节点 + 桥梁 | 较长(只要类型不变就保留)    | 可变    |
| RenderObject | 布局 + 绘制   | 很长(尽量复用)         | 可变,昂贵 |

> **核心思想**:让"创建"廉价(Widget),让"复用"自动(Element diff),让"绘制"昂贵但稀少(RenderObject)。

---

## 二、三棵树的对应关系

```
Widget Tree            Element Tree           RenderObject Tree
─────────────          ─────────────          ─────────────────
MyApp                  StatelessElement
  │                      │
Container              SingleChildRenderObjectElement → RenderDecoratedBox
  │                      │                                │
  └─ Text                └─ LeafRenderObjectElement   →   RenderParagraph
```

注意:
- **不是每个 Widget 都对应一个 RenderObject**。`StatelessWidget`、`StatefulWidget`、`InheritedWidget` 这些"组合型"Widget 不绘制,它们只产生 Element,实际绘制由它们 build 出的子 Widget 完成
- 真正画东西的是 `RenderObjectWidget`(`RenderObjectElement`)的子类,比如 `Padding`、`DecoratedBox`、`Text` 内部的 `RichText`

---

## 三、Element 是如何"复用"的?

这是性能的关键。每次 `build()` 返回新 Widget 后,Flutter 会在**对应位置**做一次比较:

```
旧 Widget 类型 == 新 Widget 类型 && 旧 Key == 新 Key
  ├─ 是 → 复用旧 Element,只更新它持有的 Widget 引用(便宜)
  └─ 否 → 卸载旧 Element 整个子树,创建新 Element 子树(昂贵)
```

举个例子:

```dart
// 第一次 build
Column(
  children: [
    Text('A'),
    Text('B'),
  ],
)

// 第二次 build(setState 后)
Column(
  children: [
    Text('A'),
    Text('改了'),    // 类型相同,Element 复用,只是 Text Widget 的 data 变了
  ],
)
```

`Text('A')` 和 `Text('改了')` **类型相同**,所以 Element **复用**,只把里面的字符串换掉。这就是为什么 Widget 可以"频繁重建"——99% 的情况下,Element 和 RenderObject 都被复用。

---

## 四、Element 的两个分支

```
Element
 ├─ ComponentElement(组合型,不画东西)
 │   ├─ StatelessElement   → 对应 StatelessWidget
 │   └─ StatefulElement    → 对应 StatefulWidget,持有 State 对象
 │
 └─ RenderObjectElement(渲染型,真的画)
     ├─ LeafRenderObjectElement(叶子,如 Text 内部)
     ├─ SingleChildRenderObjectElement(单子,如 Padding)
     └─ MultiChildRenderObjectElement(多子,如 Row、Column)
```

### StatefulElement 的特殊性

它**持有 State 对象**,这就是为什么 State 能跨 rebuild 存活:

```
build() 返回新 Widget          每次都新建
       ↓
StatefulElement                复用!
       ↓
State 对象                     长期存活,数据保留
```

所以 `_count` 之类的字段定义在 `State` 里就不会丢。

---

## 五、什么时候 Element 不会被复用?

四种情况:

### 1. 类型变了

```dart
// before
return Container(child: Text('hi'));

// after
return SizedBox(child: Text('hi'));   // Container → SizedBox,整个子树重建
```

### 2. Key 不一致(后续单独讲)

### 3. 在 children 列表里换位置

```dart
// before: [A, B]
// after:  [B, A]
// 没有 Key 时,Flutter 按位置比较:
//   位置 0:旧 A vs 新 B → 类型相同(都是 Widget),Element 复用,但内容被替换
//   这通常不是你想要的!
```

加 Key 才能正确"跟踪"它们:

```dart
children: [
  Text('A', key: ValueKey('a')),
  Text('B', key: ValueKey('b')),
]
```

### 4. 父级被拆掉

```dart
// before
if (showA) Container(child: child) else child

// 切换 showA 时,child 的祖先变了,Element 整体重建
```

---

## 六、构建流程(build → mount)

第一次启动:

```
runApp(MyApp())
   ↓
1. 创建 Widget(MyApp)
   ↓
2. Widget.createElement() → 生成 Element
   ↓
3. Element.mount() → 插入树
   ↓
4. ComponentElement 调用 build() → 返回子 Widget
   RenderObjectElement 调用 createRenderObject() → 生成 RenderObject
   ↓
5. 递归处理子 Widget
   ↓
6. 整棵 Element 树和 RenderObject 树就建好了
```

后续 setState 触发的更新:

```
setState(() { ... })
   ↓
对应 Element 标记为 dirty
   ↓
下一帧:Element.rebuild()
   ↓
build() 返回新 Widget
   ↓
对每个子位置:旧 Widget 和新 Widget 比较类型 & Key
   ├─ 一样 → updateChild:Element 留下,RenderObject 留下,只更新数据
   └─ 不一样 → 卸载旧子树,创建新子树
```

---

## 七、RenderObject:真正的"画师"

RenderObject 负责三件事:**Layout(布局)、Paint(绘制)、Hit Test(点击测试)**。

```
父级给我一个约束(constraints)→ 我决定自己的尺寸(size)→ 决定子的位置 → 画自己 → 画子级
```

举个例子:`Padding` 对应 `RenderPadding`:

1. 父级:你最多 300×500
2. RenderPadding:padding 是 16,所以子级最多 268×468
3. 子级算出自己 200×100
4. RenderPadding 自己变成 232×132
5. 父级用这个尺寸继续布局

> **Flutter 布局是单次遍历(O(n))**,不像 Web 的 reflow 那样复杂。这是 Flutter 性能的另一个秘密。

---

## 八、调试三棵树的方法

### Flutter Inspector(必学)

VSCode / Android Studio 都自带,运行 App 后:
- **Widget 树视图**:看到完整的 Widget 嵌套
- **选中 Widget**:能看到它对应的 Element 和 RenderObject
- **重建高亮**(Highlight Repaints):哪个区域在频繁重绘一目了然

### 代码里调试

```dart
// 把 Widget 树打印出来
debugDumpApp();

// 把 RenderObject 树打印出来
debugDumpRenderTree();

// 看具体 Element 的依赖
context.visitAncestorElements((e) {
  print(e.widget);
  return true;
});
```

---

## 九、一些常见疑问

### Q1:每次 setState 都重建,不会卡吗?

不会。因为:
1. Widget 是轻量级 Dart 对象,GC 友好
2. Element/RenderObject 大概率被复用,真正昂贵的 Layout/Paint 只在数据变化时发生
3. RenderObject 自己有"是否需要重新布局/绘制"的标记位,小改动只触发局部刷新

### Q2:为什么 const 构造很重要?

```dart
const Text('hello')   // 编译期常量,多次 build 引用同一个对象
```

Flutter 会跳过 `identical(oldWidget, newWidget)` 时的 update 流程。所以**能加 `const` 的 Widget 一定加上**,这是免费的性能优化。

### Q3:Hot Reload 是怎么做到的?

Hot Reload 改了代码后:
1. Dart 把改动编译成增量代码,推到 VM
2. Flutter 调用 `reassemble`,把整棵 Element 树标记为 dirty
3. 重新跑一遍 build → diff → 复用 Element/RenderObject 的流程
4. State 对象**全程存活**,所以你的计数器还停在 5

这就是为什么 Hot Reload 比"重启"快得多——本质是利用三棵树的复用机制。

---

## 十、一句话总结

```
Widget    = 蓝图(廉价、易丢弃)
Element   = 实例(被珍惜地复用)
RenderObject = 画师(昂贵但稀少地工作)
```

理解了这个,你看任何 Flutter 源码都不会迷路。
