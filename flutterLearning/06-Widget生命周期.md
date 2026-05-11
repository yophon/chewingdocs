# Flutter Widget 生命周期

一个 Widget 从"出生"到"死亡"会经过哪些阶段?生命周期方法在何时被调用?这是开发中最常遇到的问题之一。

---

## 一、StatelessWidget:很简单

只有一个方法:

```dart
class Hello extends StatelessWidget {
  const Hello({super.key});

  @override
  Widget build(BuildContext context) {
    // 每次父级 rebuild、依赖的 InheritedWidget 变化时,这里都会被调用
    return Text('hi');
  }
}
```

**就这么简单**。它没有"我自己的生命周期",一切由父级控制。

---

## 二、StatefulWidget:核心七步

记住这张图,大部分场景都够用:

```
                createState()
                     ↓
                initState()           [一次]
                     ↓
            didChangeDependencies()   [可能多次]
                     ↓
                   build()            [可能多次]
                  ↗     ↘
        didUpdateWidget()  setState
              ↑
       (父级 rebuild 时)
                     ↓
              deactivate()            [可能多次]
                     ↓
                dispose()             [一次]
```

下面挨个讲。

---

### 1. createState()

```dart
class Counter extends StatefulWidget {
  @override
  State<Counter> createState() => _CounterState();   // 创建 State 对象
}
```

这是 Widget(蓝图)第一次插入树时,Flutter 调用一次,**创建一个 State 实例**。
后续即使 Widget 被频繁重建,只要 Element 复用,State 就**只创建这一次**。

---

### 2. initState()

```dart
@override
void initState() {
  super.initState();
  // ✅ 适合做的事:
  // - 初始化变量
  // - 订阅 Stream / 添加 Listener
  // - 启动一次性异步任务

  _controller = AnimationController(vsync: this);
  _subscription = stream.listen(_onData);
}
```

**整个 State 生命中只调用一次**。

⚠️ **不能做的事**:
- 不要用 `Theme.of(context)`、`Provider.of(context)` 等订阅型查找(此时依赖关系还没建好)
- 不要用 `MediaQuery.of(context)`,可能拿不到正确值

---

### 3. didChangeDependencies()

```dart
@override
void didChangeDependencies() {
  super.didChangeDependencies();
  // 第一次调用:initState 之后立刻
  // 后续调用:依赖的 InheritedWidget 变化时(如主题切换、语言切换)

  _theme = Theme.of(context);  // 这里用 .of(context) 才安全
}
```

**调用时机**:
- 第一次:在 `initState()` 之后立刻
- 后续:依赖的 InheritedWidget 变了(比如 Theme 切换、Locale 切换、Provider 数据变化等)

**典型用法**:把"依赖 context 的初始化"放这里,而不是 initState。

```dart
// ❌ 错
@override
void initState() {
  super.initState();
  final color = Theme.of(context).primaryColor;  // 拿不到正确值
}

// ✅ 对
@override
void didChangeDependencies() {
  super.didChangeDependencies();
  final color = Theme.of(context).primaryColor;
}
```

---

### 4. build()

```dart
@override
Widget build(BuildContext context) {
  return ...;
}
```

**调用频繁**。触发条件:
- `setState()` 被调用
- 父级重建,把新 Widget 传下来
- 依赖的 InheritedWidget 变化

⚠️ **必须保持纯函数**:不要在这里订阅、写文件、改全局状态。只描述"现在该长什么样"。

---

### 5. didUpdateWidget(oldWidget)

```dart
@override
void didUpdateWidget(covariant Counter oldWidget) {
  super.didUpdateWidget(oldWidget);
  // 父级传下来的参数变了
  if (oldWidget.value != widget.value) {
    _resetAnimation();
  }
}
```

**调用时机**:父级 rebuild,新 Widget 替换了旧 Widget,但 Element 复用。

**典型用法**:对比新旧参数,做对应处理。

```dart
class VideoPlayer extends StatefulWidget {
  final String url;
  ...
}

class _VideoPlayerState extends State<VideoPlayer> {
  late VideoController _controller;

  @override
  void initState() {
    super.initState();
    _controller = VideoController(widget.url);
  }

  @override
  void didUpdateWidget(VideoPlayer oldWidget) {
    super.didUpdateWidget(oldWidget);
    // URL 变了,要换视频
    if (oldWidget.url != widget.url) {
      _controller.dispose();
      _controller = VideoController(widget.url);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }
}
```

---

### 6. deactivate()

```dart
@override
void deactivate() {
  super.deactivate();
  // Widget 从树中移除时调用(可能还会被插回去)
}
```

**很少需要重写**。比如做"全局拖拽"这种 Widget 跨树移动的场景才会用。

---

### 7. dispose()

```dart
@override
void dispose() {
  // ✅ 必须做的清理:
  _controller.dispose();
  _subscription.cancel();
  _timer?.cancel();
  _focusNode.dispose();

  super.dispose();           // 注意:super.dispose 放最后
}
```

**整个 State 生命中只调用一次**,Widget 永久离开树时调用。
**所有需要释放的资源都在这里清理**,否则内存泄漏。

---

## 三、生命周期实战示例

```dart
class TimerPage extends StatefulWidget {
  final int seconds;
  const TimerPage({required this.seconds, super.key});

  @override
  State<TimerPage> createState() => _TimerPageState();
}

class _TimerPageState extends State<TimerPage> {
  late int _remaining;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _remaining = widget.seconds;
    _start();
  }

  @override
  void didUpdateWidget(TimerPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    // 父级把秒数改了,重新计时
    if (oldWidget.seconds != widget.seconds) {
      _timer?.cancel();
      _remaining = widget.seconds;
      _start();
    }
  }

  void _start() {
    _timer = Timer.periodic(Duration(seconds: 1), (_) {
      if (_remaining > 0) {
        setState(() => _remaining--);
      } else {
        _timer?.cancel();
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();   // 必须清理!否则页面销毁后定时器还在跑
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Text('剩余:$_remaining 秒');
  }
}
```

---

## 四、App 级生命周期(前后台)

上面讲的是 Widget 自己的生命周期。还有一类:**整个 App 进入后台/前台**,需要用 `WidgetsBindingObserver`:

```dart
class _MyAppState extends State<MyApp> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);  // 注册
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);  // 注销
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    switch (state) {
      case AppLifecycleState.resumed:    // 回到前台
        print('回来了');
        break;
      case AppLifecycleState.inactive:   // 非活跃(过渡态,如来电)
        break;
      case AppLifecycleState.paused:     // 进入后台
        print('进后台了,该暂停视频');
        break;
      case AppLifecycleState.detached:   // 引擎已分离
        break;
      case AppLifecycleState.hidden:     // 完全隐藏(Flutter 3.13+)
        break;
    }
  }
}
```

**典型应用**:进入后台时暂停视频/动画,回到前台时刷新数据。

---

## 五、容易忽略的细节

### 1. mounted 的作用

异步操作里必须先判断 `mounted`:

```dart
Future<void> _load() async {
  final data = await api.fetch();
  if (!mounted) return;          // ✅ 防止已 dispose 还 setState
  setState(() => _data = data);
}
```

### 2. setState 不能在 dispose 之后调用

否则报:`setState() called after dispose()`。

### 3. setState 不能在 build 期间调用

否则报:`setState() or markNeedsBuild() called during build`。

要在 build 后做事,用 `addPostFrameCallback`:

```dart
WidgetsBinding.instance.addPostFrameCallback((_) {
  // 这里在当前帧绘制完后执行
  setState(() => ...);
});
```

### 4. State 复用不等于 Widget 不变

哪怕 Widget 每次都是新对象,只要它的**位置和类型**没变,State 就复用。

---

## 六、什么放哪里:速查表

| 任务 | 放在哪里 |
| --- | --- |
| 初始化变量 | `initState` |
| 订阅 Stream / 添加 Listener | `initState` |
| 用 `Theme.of(context)` 等 | `didChangeDependencies` 或 `build` |
| 用 `MediaQuery.of(context)` | `didChangeDependencies` 或 `build` |
| 监听父级参数变化 | `didUpdateWidget` |
| 释放资源(controller、timer、subscription) | `dispose` |
| 异步加载数据 | `initState` 启动,但 setState 前判断 mounted |
| 监听前后台切换 | `WidgetsBindingObserver.didChangeAppLifecycleState` |

---

## 七、一句话记忆

```
出生 → initState
认亲 → didChangeDependencies
长相 → build
父亲改造 → didUpdateWidget
自我修整 → setState → build
搬家 → deactivate
死亡 → dispose
```
