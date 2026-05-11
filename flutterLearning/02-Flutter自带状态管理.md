# Flutter 自带的状态管理:从零开始

不依赖任何第三方库,Flutter 自身提供的工具就足够做出干净的中型项目。本篇从最基础讲起,循序渐进。

---

## 一、先理解:Widget 的两种类型

Flutter 里一切都是 Widget。但 Widget 分两种。

### 1. StatelessWidget(无状态)

一旦创建,内容不会变。就像一张贴在墙上的海报。

```dart
class Hello extends StatelessWidget {
  final String name;
  const Hello({required this.name});

  @override
  Widget build(BuildContext context) {
    return Text('你好,$name');
  }
}
```

只能通过外部传新参数(重新创建)来"改变"它,**自己内部没有可变数据**。

### 2. StatefulWidget(有状态)

自己持有可以变化的数据,变化时会自动重新构建 UI。

注意它的特殊结构 —— **两个类**:

```dart
// 第一个类:Widget 本身,不可变
class Counter extends StatefulWidget {
  @override
  State<Counter> createState() => _CounterState();
}

// 第二个类:State,持有真正的可变数据
class _CounterState extends State<Counter> {
  int _count = 0;  // 这才是状态

  @override
  Widget build(BuildContext context) {
    return Text('$_count');
  }
}
```

为什么要拆成两个?因为 Widget 在 Flutter 里是**频繁创建销毁**的(几乎每次刷新都重建),但 State 对象是**长期存活**的,数据存在 State 里才不会丢。

---

## 二、setState:最核心的 API

这是 Flutter 自带方案的灵魂。

```dart
class _CounterState extends State<Counter> {
  int _count = 0;

  void _increment() {
    setState(() {
      _count++;          // 修改数据
    });                  // setState 通知框架:我变了,请重建我
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text('当前:$_count'),
        ElevatedButton(
          onPressed: _increment,
          child: Text('加 1'),
        ),
      ],
    );
  }
}
```

### setState 到底做了什么?

1. 把当前 State 标记为"脏"(dirty)
2. 在下一帧告诉 Flutter:重新调用一次 `build()`
3. `build()` 返回新的 Widget 树,Flutter 对比差异,**只更新真正变化的部分**

### 几个容易踩的坑

```dart
// 错误 1:在 build 里调用 setState → 死循环
@override
Widget build(BuildContext context) {
  setState(() => _count++);  // 千万别这样
  ...
}

// 错误 2:在 setState 外修改数据
_count++;                    // UI 不会刷新!
setState(() {});             // 虽然能补救,但不规范

// 正确:把"修改"放进 setState 的回调里
setState(() => _count++);

// 错误 3:dispose 后还调用 setState(异步任务常见)
Future.delayed(Duration(seconds: 5), () {
  setState(() {});  // 如果用户已经退出页面,会报错
});
// 应该先判断:if (mounted) setState(...);
```

---

## 三、状态提升(Lifting State Up)

问题来了:如果两个**兄弟 Widget** 需要共享一个状态怎么办?

比如「按钮」和「显示数字」是两个独立的 Widget:

```
   Parent
   /    \
Button  Display
```

**解决办法**:把状态放到它俩共同的父亲那里,父亲传数据下去,也传修改方法下去。

```dart
class Parent extends StatefulWidget {
  @override
  State<Parent> createState() => _ParentState();
}

class _ParentState extends State<Parent> {
  int _count = 0;  // 状态提升到父级

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Display(count: _count),                       // 数据往下传
        MyButton(
          onTap: () => setState(() => _count++),     // 修改方法也往下传
        ),
      ],
    );
  }
}

class Display extends StatelessWidget {
  final int count;
  const Display({required this.count});

  @override
  Widget build(BuildContext context) => Text('$count');
}

class MyButton extends StatelessWidget {
  final VoidCallback onTap;
  const MyButton({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return ElevatedButton(onPressed: onTap, child: Text('+'));
  }
}
```

> **重要**:状态本身只在 Parent 里,子 Widget 都是 Stateless 的 —— 它们只是"展示"数据,不"拥有"数据。这是 Flutter(和 React)的核心思想。

---

## 四、新问题:层级太深怎么办?

假设结构是这样:

```
App
 └─ HomePage
     └─ Section
         └─ Card
             └─ Button   ← 这里要用 App 层的状态
```

如果一层层往下传参数(叫 **prop drilling**,一层层钻),非常痛苦,中间每一层都要写一遍这个参数,**即使它们自己根本用不上**。

这时候就需要 ——

---

## 五、InheritedWidget:跨层传递的基石

它是 Flutter 自带的"全局/共享数据"机制。子树里**任何深度**的 Widget 都能直接拿到祖先的数据,不用一层层传。

你平时用的 `Theme.of(context)`、`MediaQuery.of(context)` 全是基于它。

### 简单示例

```dart
// 1. 定义一个 InheritedWidget
class CounterScope extends InheritedWidget {
  final int count;
  final VoidCallback increment;

  const CounterScope({
    required this.count,
    required this.increment,
    required Widget child,
  }) : super(child: child);

  // 提供静态方法,方便子 Widget 获取
  static CounterScope of(BuildContext context) {
    return context.dependOnInheritedWidgetOfExactType<CounterScope>()!;
  }

  // 告诉 Flutter:数据变了,要不要通知监听者?
  @override
  bool updateShouldNotify(CounterScope oldWidget) => count != oldWidget.count;
}

// 2. 在外层包装
class App extends StatefulWidget {
  @override
  State<App> createState() => _AppState();
}

class _AppState extends State<App> {
  int _count = 0;

  @override
  Widget build(BuildContext context) {
    return CounterScope(
      count: _count,
      increment: () => setState(() => _count++),
      child: HomePage(),  // 子树任何地方都能访问
    );
  }
}

// 3. 深层子 Widget 直接使用
class DeepButton extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final scope = CounterScope.of(context);
    return ElevatedButton(
      onPressed: scope.increment,
      child: Text('${scope.count}'),
    );
  }
}
```

调用 `CounterScope.of(context)` 时,Flutter 会自动**订阅**这个 Widget —— 只要 count 变了,用了它的子 Widget 就会自动 rebuild。

> 第三方库 Provider 本质上就是把 InheritedWidget 包了一层,让你少写模板代码。

---

## 六、ChangeNotifier 和 ValueNotifier

这俩也是 Flutter 自带的(在 `foundation` 包),配合 InheritedWidget 用,或者直接用都行。它们解决一个问题:**让某个对象变成"可被监听"的**。

### ValueNotifier(简单版)

只持有一个值,变化时通知监听者。

```dart
final counter = ValueNotifier<int>(0);

// 改值(自动通知)
counter.value++;

// 监听
counter.addListener(() => print('变成了 ${counter.value}'));
```

### ValueListenableBuilder(精准刷新)

这是 Flutter 自带的、配合 ValueNotifier 用的 Widget。**只重建包裹的那一小块**,不重建整个页面。

```dart
class CounterPage extends StatelessWidget {
  // 注意:整个页面是 Stateless 的!
  final ValueNotifier<int> _count = ValueNotifier(0);

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text('这一行不会刷新'),  // 静态部分

        ValueListenableBuilder<int>(
          valueListenable: _count,
          builder: (context, value, child) {
            return Text('$value');  // 只有这里刷新
          },
        ),

        ElevatedButton(
          onPressed: () => _count.value++,
          child: Text('+1'),
        ),
      ],
    );
  }
}
```

这就是**性能优化的关键**:相比 setState 重建整个 Widget,ValueListenableBuilder 只重建必要的那一小块。

### ChangeNotifier(复杂版)

可以持有多个字段,手动调 `notifyListeners()` 通知。

```dart
class UserModel extends ChangeNotifier {
  String _name = '游客';
  int _age = 0;

  String get name => _name;
  int get age => _age;

  void updateName(String newName) {
    _name = newName;
    notifyListeners();   // 手动通知
  }
}
```

配合 `AnimatedBuilder` 或 `ListenableBuilder`(Flutter 3.10+ 自带)使用:

```dart
ListenableBuilder(
  listenable: userModel,
  builder: (context, child) {
    return Text(userModel.name);
  },
)
```

---

## 七、Flutter 自带方案的「武功秘籍」

到这里,Flutter 自带的状态管理你已经全部掌握了。实战中怎么选?

| 场景 | 用什么 |
| --- | --- |
| 单个 Widget 内部数据(输入框、Tab 切换) | `setState` |
| 父子之间传数据 | 状态提升 + 回调函数 |
| 跨多层传递只读数据 | `InheritedWidget` |
| 需要细粒度刷新、避免大面积 rebuild | `ValueNotifier` + `ValueListenableBuilder` |
| 复杂对象、多字段联动 | `ChangeNotifier` + `ListenableBuilder` |

### 一个真实的「Flutter 原生」最佳实践

很多人不知道:**只用 Flutter 自带的工具,完全可以做出干净的中型项目**。组合起来就是:

```
ChangeNotifier(数据 + 业务逻辑)
   ↓ 通过
InheritedWidget(注入到 Widget 树)
   ↓ 子组件用
ListenableBuilder / context.dependOnInheritedWidgetOfExactType(订阅)
```

这就是 **Provider 库的全部秘密** —— 它只是帮你少写了上面的模板代码。所以学好原生,后面看任何状态管理库都会觉得「啊,原来如此」。

---

## 建议这样练习

1. 先写一个计数器,只用 `setState`
2. 加一个「重置按钮」放在另一个 Widget 里,练习**状态提升**
3. 把数据用 `ValueNotifier` 重写,体会**精准刷新**
4. 再用 `InheritedWidget` 把数据共享到深层子 Widget

这四步走完,你对 Flutter 状态的「数据流向」就有感觉了。之后再去看 Provider、Riverpod,就是降维打击。
