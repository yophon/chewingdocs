# Flutter Key 详解

Key 看起来像个无关紧要的可选参数,但理解它能解决一类很诡异的 bug:**为什么我换了顺序数据丢了?为什么我加了一项动画乱了?**

---

## 一、为什么需要 Key?

回忆一下三棵树的复用规则:

```
旧 Widget 类型 == 新 Widget 类型 && 旧 Key == 新 Key
  → Element 复用
```

不写 Key 时,**Flutter 按"位置"匹配**。位置变了,数据就跟错对象了。

### 一个经典 bug

```dart
class _DemoState extends State<Demo> {
  List<Widget> tiles = [
    StatefulCounter(),
    StatefulCounter(),
  ];

  void swap() {
    setState(() {
      tiles = tiles.reversed.toList();    // 调换顺序
    });
  }
}
```

`StatefulCounter` 内部各自维护一个计数:

```dart
class StatefulCounter extends StatefulWidget {...}
class _StatefulCounterState extends State<StatefulCounter> {
  int count = 0;
  ...
}
```

如果先把第一个加到 5,第二个加到 3,然后 `swap()`:

**期望**:位置变了,但 5 跟着第一个,3 跟着第二个 → 显示 [3, 5]

**实际**:还是 [5, 3]!

**原因**:Flutter 按位置 diff,看到位置 0 还是 `StatefulCounter`,位置 1 还是 `StatefulCounter`,**类型相同就复用 Element**,但里面挂的 State 没有变,所以 5 还是在位置 0 的 State 里。

**解法**:加 Key!

```dart
List<Widget> tiles = [
  StatefulCounter(key: ValueKey('A')),
  StatefulCounter(key: ValueKey('B')),
];
```

加了 Key 后,Flutter 会按 Key 匹配:位置 0 想要 Key='B',就把原来位置 1 的 Element 整体搬过来。State(连同 count=3)就跟着搬过来了。

---

## 二、Key 的家族

```
Key
 ├─ LocalKey(只在兄弟节点间唯一)
 │   ├─ ValueKey<T>      用值区分:ValueKey('id123')
 │   ├─ ObjectKey        用对象身份区分:ObjectKey(myObject)
 │   └─ UniqueKey        每次创建都不同
 │
 └─ GlobalKey            全局唯一,跨整个 App 都能找到
     └─ GlobalObjectKey  GlobalKey 的对象版
```

---

### 1. ValueKey:最常用

```dart
ListView(
  children: items.map((item) => ListTile(
    key: ValueKey(item.id),     // 用业务 id 当 key
    title: Text(item.name),
  )).toList(),
)
```

**用法**:列表项有稳定 id 时,直接用 id。

---

### 2. ObjectKey

当多个对象 id 可能重复(比如 (姓, 名) 联合主键),用整个对象身份做 key:

```dart
ObjectKey(person)   // 比较的是对象引用 (==)
```

实际很少用,大多数场景 ValueKey 已经够。

---

### 3. UniqueKey

每次创建都生成新的 key,任意两个 UniqueKey 都不相等:

```dart
final k1 = UniqueKey();
final k2 = UniqueKey();
print(k1 == k2);  // false
```

**用法**:**强制让 Element 不要复用**。

```dart
// 想强制重置一个表单
Form(key: UniqueKey(), child: ...)
```

每次 build 都生成新 UniqueKey,Element 永远不复用,内部 State 永远是新的。

⚠️ 别滥用,代价是每次都重建子树。

---

### 4. GlobalKey:威力大,代价也大

GlobalKey 的两个超能力:

#### a) 跨树访问 State / RenderObject / context

```dart
final formKey = GlobalKey<FormState>();
final scaffoldKey = GlobalKey<ScaffoldState>();

// 在任何地方
formKey.currentState?.validate();
formKey.currentState?.save();

scaffoldKey.currentState?.openDrawer();
```

#### b) 跨位置移动 Widget,保留 State

```dart
final globalKey = GlobalKey();

bool atTop = true;

@override
Widget build(BuildContext context) {
  final video = VideoPlayer(key: globalKey, url: '...');
  // 注意是同一个 globalKey
  return atTop
    ? Column(children: [video, OtherStuff()])     // 在上面
    : Column(children: [OtherStuff(), video]);    // 在下面
}
```

虽然位置变了,但因为是同一个 GlobalKey,**Element 和 State 整体被搬过去**——视频不会重新播放、不会卡顿。

---

### GlobalKey 的代价

它不是免费的,主要有三点:

1. **必须全局唯一**:同一时刻树里有两个相同 GlobalKey 会直接报错
2. **更慢**:Flutter 要在全局表里查这个 key
3. **容易内存泄漏**:GlobalKey 持有 Element/State 引用,如果你拿着它不放,GC 回收不了

**只在真的需要"跨树访问 State"或"跨位置保留 State"时才用。**
日常 99% 的场景用 ValueKey 就够了。

---

## 三、什么时候必须加 Key?

### 1. 列表中的 StatefulWidget,会改变顺序/增删

```dart
// ✅ 必须加
ListView(
  children: items.map((item) => MyStatefulItem(
    key: ValueKey(item.id),
    data: item,
  )).toList(),
)
```

如果列表项是 StatelessWidget,影响小一些(没有 State 会跟错),但**仍然推荐加**——因为 RenderObject 也复用了,Flutter 会跳过不必要的重绘。

### 2. ReorderableListView、AnimatedList、Dismissible

这些 Widget **必须**给 children 加 Key,否则直接报错:

```dart
ReorderableListView(
  children: items.map((item) => ListTile(
    key: ValueKey(item.id),     // 必须!
    title: Text(item.name),
  )).toList(),
  onReorder: (oldIdx, newIdx) {...},
)
```

### 3. AnimatedSwitcher

切换不同的子时,加 Key 才能识别"这是新的子",触发动画:

```dart
AnimatedSwitcher(
  duration: Duration(milliseconds: 300),
  child: Text(
    '$count',
    key: ValueKey(count),   // count 变 → key 变 → 触发切换动画
  ),
)
```

不加 Key,Flutter 看到都是 Text 类型,会复用 Element,只是改字 → 没有切换动画。

### 4. PageView / TabBarView 想保持滚动位置

`PageStorageKey` 自动帮你存滚动位置:

```dart
PageView(
  children: [
    ListView(key: PageStorageKey('list1'), ...),
    ListView(key: PageStorageKey('list2'), ...),
  ],
)
```

切回来时,滚动位置还在。

---

## 四、什么时候不需要 Key?

- 没有 State 的简单 Widget
- 不会重新排序的固定结构
- 一对一传递的纯展示

```dart
// 这种完全不需要
Column(children: [
  Text('标题'),
  Text('副标题'),
])
```

---

## 五、Key 应该写在哪一层?

**写在保留 State 那一层**,而不是它的父级。

```dart
// ❌ 错:Key 在父级,Tile 内部 State 还是会丢
Container(
  key: ValueKey(item.id),
  child: StatefulTile(),
)

// ✅ 对:Key 在直接持有 State 的 Widget 上
Container(
  child: StatefulTile(key: ValueKey(item.id)),
)
```

理由:Element diff 是在**当前层级**比对,Key 加在哪一层,哪一层的 Element 才会按 Key 匹配。

---

## 六、Key 速查表

| 场景 | 用什么 Key |
| --- | --- |
| 列表项有稳定 id | `ValueKey(item.id)` |
| 列表项没 id,用对象本身 | `ObjectKey(item)` |
| 强制每次都重建 | `UniqueKey()` |
| 跨位置移动还想保留 State | `GlobalKey()` |
| 操作 Form/Scaffold 内部状态 | `GlobalKey<FormState>()` |
| 保存 ListView 滚动位置 | `PageStorageKey('id')` |
| 不需要区分 / 静态结构 | 不加 |

---

## 七、心智模型

```
Key 回答的问题是:
  "新 Widget 和旧 Widget,是同一个吗?"

不加 Key  → Flutter 用"位置 + 类型"判断
加了 Key  → Flutter 用"Key + 类型"判断(更精确)
GlobalKey → "我能跨整棵树找到我"
```

什么时候要 Key,记一句话:**只要你关心"这一个 Widget 是不是上次那个",就加 Key**。
