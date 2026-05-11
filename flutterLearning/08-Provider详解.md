# Provider 详解

Provider 是 Flutter 官方曾经力推的状态管理库,作者是 Remi Rousselet(后来又写了 Riverpod)。它的本质很简单:**把 InheritedWidget + ChangeNotifier 包装得更好用**。

如果已经懂了 `InheritedWidget` 和 `ChangeNotifier`(02 那篇),Provider 不会有任何新概念,只是 API 更甜。

---

## 一、安装

```yaml
# pubspec.yaml
dependencies:
  provider: ^6.1.2
```

---

## 二、最小例子(对比着看 Flutter 原生)

### 原生写法(回顾)

```dart
// 1. 定义可监听对象
class Counter with ChangeNotifier {
  int _count = 0;
  int get count => _count;
  void increment() {
    _count++;
    notifyListeners();
  }
}

// 2. 还得自己写 InheritedWidget 把它注入树
// 3. 还得自己写 ListenableBuilder 监听刷新
// ……一堆模板
```

### Provider 写法

```dart
// 1. 定义还是一样的
class Counter with ChangeNotifier {
  int _count = 0;
  int get count => _count;
  void increment() {
    _count++;
    notifyListeners();
  }
}

// 2. 注入到树
ChangeNotifierProvider(
  create: (_) => Counter(),
  child: MyApp(),
)

// 3. 任何地方使用
context.watch<Counter>().count;        // 监听刷新
context.read<Counter>().increment();   // 只调方法
```

**省掉的就是 InheritedWidget 那一坨样板**。

---

## 三、Provider 家族:不只一个 Provider

Provider 是一个家族,根据数据形态选不同的:

| 类型 | 用途 | 数据特点 |
| --- | --- | --- |
| `Provider<T>` | 注入只读对象(不会变化) | 不会变 |
| `ChangeNotifierProvider<T>` | 注入 ChangeNotifier | 调 `notifyListeners()` 才更新 |
| `ValueListenableProvider<T>` | 注入 ValueNotifier | 值变化自动更新 |
| `StreamProvider<T>` | 注入一个 Stream 的最新值 | Stream 推一次就更新 |
| `FutureProvider<T>` | 注入一个 Future 的结果 | 加载完更新一次 |
| `ProxyProvider<T, R>` | 依赖其他 Provider 派生 | A 变 → B 重新计算 |

### 1. ChangeNotifierProvider(最常用)

上面写过。注意:**它会自动在 dispose 时调用 notifier 的 dispose**,内存安全。

### 2. Provider<T>(无监听)

只是把一个对象塞进树,不订阅:

```dart
Provider<ApiService>(
  create: (_) => ApiService(),
  child: MyApp(),
)

// 使用
context.read<ApiService>().fetch();
```

适合:Service、配置、不会变的对象。

### 3. FutureProvider / StreamProvider

```dart
// 把 Future 暴露成可监听的状态
FutureProvider<User?>(
  create: (_) => api.fetchUser(),
  initialData: null,
  child: MyApp(),
)

// 使用
final user = context.watch<User?>();   // 加载完之前是 null
```

```dart
// Stream 同理
StreamProvider<int>(
  create: (_) => Stream.periodic(Duration(seconds: 1), (i) => i),
  initialData: 0,
  child: MyApp(),
)
```

### 4. ProxyProvider(派生数据)

`B` 依赖 `A`,A 变了 B 跟着变:

```dart
MultiProvider(
  providers: [
    ChangeNotifierProvider(create: (_) => UserModel()),
    ProxyProvider<UserModel, Greeting>(
      update: (_, user, __) => Greeting(user.name),
      // user 变化时,自动重算 Greeting
    ),
  ],
  child: MyApp(),
)
```

实际项目里用得不多,大多数派生用 getter / 计算属性就够了。

---

## 四、MultiProvider:别嵌成俄罗斯套娃

错误写法:

```dart
ChangeNotifierProvider(
  create: (_) => UserModel(),
  child: ChangeNotifierProvider(
    create: (_) => CartModel(),
    child: ChangeNotifierProvider(
      create: (_) => ThemeModel(),
      child: MyApp(),
    ),
  ),
)
```

正确写法:

```dart
MultiProvider(
  providers: [
    ChangeNotifierProvider(create: (_) => UserModel()),
    ChangeNotifierProvider(create: (_) => CartModel()),
    ChangeNotifierProvider(create: (_) => ThemeModel()),
  ],
  child: MyApp(),
)
```

效果完全一样,但平铺看着舒服。

---

## 五、消费数据的三种方式

### 1. context.watch / read / select(推荐)

```dart
// build 里:监听变化
final count = context.watch<Counter>().count;

// 事件回调里:只读
context.read<Counter>().increment();

// 精细订阅:只在某字段变化时 rebuild
final name = context.select<UserModel, String>((u) => u.name);
```

| 方法 | 触发 rebuild | 用在哪 |
| --- | --- | --- |
| `watch` | ✅ | `build` 里 |
| `read` | ❌ | onPressed、onTap 等回调 |
| `select` | ✅(只在选中字段变) | `build` 里做精细优化 |

### 2. Consumer<T>(老 API,但有用)

```dart
Consumer<Counter>(
  builder: (context, counter, child) {
    return Text('${counter.count}');
  },
  child: const Text('静态部分,不会重建'),  // 优化:静态部分传进来
)
```

**好处**:
- 精确控制哪一块 rebuild
- `child` 参数让你把不变的子树拿出来,避免重建

### 3. Selector<T, R>(精细化版)

```dart
Selector<UserModel, String>(
  selector: (_, user) => user.name,    // 只关心 name
  builder: (_, name, __) => Text(name),
)
```

只有 `name` 真变了才会 rebuild,即使 UserModel 其他字段(`age` 等)变化也不会触发。

---

## 六、什么时候用 Consumer / Selector,什么时候用 watch?

```dart
// ❌ 写法 1:整个页面都跟着 count 重建
@override
Widget build(BuildContext context) {
  final count = context.watch<Counter>().count;
  return Scaffold(
    appBar: AppBar(title: Text('Big page')),    // 这个不该重建
    body: Column(
      children: [
        ExpensiveChart(),                        // 这个也不该重建
        Text('$count'),                          // 只有它该重建
      ],
    ),
  );
}

// ✅ 写法 2:只有用 count 的地方重建
@override
Widget build(BuildContext context) {
  return Scaffold(
    appBar: AppBar(title: Text('Big page')),
    body: Column(
      children: [
        const ExpensiveChart(),
        Consumer<Counter>(
          builder: (_, c, __) => Text('${c.count}'),
        ),
      ],
    ),
  );
}
```

**经验**:大页面用 Consumer / Selector 圈出小区域;小页面随手用 `context.watch`。

---

## 七、完整示例:Todo App

```dart
// 1. Model
class Todo {
  final String id;
  final String title;
  bool done;
  Todo({required this.id, required this.title, this.done = false});
}

class TodoModel with ChangeNotifier {
  final List<Todo> _todos = [];
  List<Todo> get todos => List.unmodifiable(_todos);

  int get unfinishedCount => _todos.where((t) => !t.done).length;

  void add(String title) {
    _todos.add(Todo(id: DateTime.now().toString(), title: title));
    notifyListeners();
  }

  void toggle(String id) {
    final t = _todos.firstWhere((t) => t.id == id);
    t.done = !t.done;
    notifyListeners();
  }

  void remove(String id) {
    _todos.removeWhere((t) => t.id == id);
    notifyListeners();
  }
}

// 2. main 注入
void main() {
  runApp(
    ChangeNotifierProvider(
      create: (_) => TodoModel(),
      child: const MyApp(),
    ),
  );
}

// 3. 显示未完成数量(只关心数字)
class UnfinishedBadge extends StatelessWidget {
  const UnfinishedBadge({super.key});

  @override
  Widget build(BuildContext context) {
    // 用 Selector 精细化:只在数量变化时重建
    return Selector<TodoModel, int>(
      selector: (_, m) => m.unfinishedCount,
      builder: (_, count, __) => Text('未完成:$count'),
    );
  }
}

// 4. 列表(关心整个 todos 列表)
class TodoList extends StatelessWidget {
  const TodoList({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<TodoModel>(
      builder: (_, model, __) => ListView(
        children: model.todos.map((t) => CheckboxListTile(
          key: ValueKey(t.id),
          value: t.done,
          title: Text(t.title),
          onChanged: (_) => model.toggle(t.id),
        )).toList(),
      ),
    );
  }
}

// 5. 添加按钮(只调用,不订阅 → 用 read)
class AddButton extends StatelessWidget {
  const AddButton({super.key});

  @override
  Widget build(BuildContext context) {
    return FloatingActionButton(
      onPressed: () => context.read<TodoModel>().add('新待办'),
      child: const Icon(Icons.add),
    );
  }
}
```

注意几个**最佳实践**都用上了:
- 列表项加 `ValueKey`(回顾 07 那篇)
- 不变的部分用 `const`
- 局部刷新用 `Consumer` / `Selector`
- 事件回调用 `read` 不用 `watch`

---

## 八、常见坑

### 1. 在 initState 里用 context.watch

```dart
@override
void initState() {
  super.initState();
  final user = context.watch<UserModel>();   // ❌ 报错
}
```

**原因**:initState 时依赖关系还没建立。
**正确**:放 `didChangeDependencies` 或 `build`。

### 2. 在 build 里调用 read 然后调用方法

```dart
@override
Widget build(BuildContext context) {
  context.read<Counter>().increment();   // ❌ 死循环!
  return Text(...);
}
```

修改状态会触发 rebuild,rebuild 又修改状态 → 无限循环。
**正确**:修改状态只能在事件回调里。

### 3. 想监听但用了 read

```dart
return Text(context.read<Counter>().count.toString());  // ❌ 不会刷新
```

`read` 不订阅,数据变了不会重建。改成 `watch`。

### 4. ChangeNotifier 修改后忘记 notify

```dart
void increment() {
  _count++;
  // ❌ 忘了 notifyListeners()
}
```

UI 不会刷新。这是 Provider 模式最高频的 bug。

### 5. 嵌套页面找不到 Provider

```dart
// ❌ Navigator.push 后,新页面在 Provider 之外
Navigator.push(
  context,
  MaterialPageRoute(builder: (_) => DetailPage()),
);
// DetailPage 里 context.read<UserModel>() 报错
```

**原因**:Navigator 是顶层 Overlay,新路由不在原 Provider 子树中。
**正确**:把 Provider 提到 `MaterialApp` 之上,或用 `ChangeNotifierProvider.value` 转发:

```dart
final model = context.read<UserModel>();
Navigator.push(
  context,
  MaterialPageRoute(
    builder: (_) => ChangeNotifierProvider.value(
      value: model,                 // 注意是 .value,不要 create
      child: DetailPage(),
    ),
  ),
);
```

> `.value` 和 `create` 的区别:`create` 会在 dispose 时帮你 dispose 对象;`.value` 不会(因为对象不归它管)。**复用现有对象时一定用 `.value`**。

---

## 九、Provider vs Flutter 原生 vs GetX

把三种放一起:

| 概念 | Flutter 原生 | Provider | GetX |
| --- | --- | --- | --- |
| 数据载体 | `ChangeNotifier` | `ChangeNotifier`(沿用) | `GetxController + .obs` |
| 注入 | 自己写 InheritedWidget | `ChangeNotifierProvider` | `Get.put(...)` |
| 取出 | `Inherited.of(context)` | `context.watch<T>()` | `Get.find<T>()` |
| 局部刷新 | `ListenableBuilder` | `Consumer` / `Selector` | `Obx(() => ...)` |
| 是否需要 context | 是 | 是 | 否 |
| 跨页面共享 | InheritedWidget 提到 MaterialApp 之上 | Provider 提到上面 | 全局单例,任何地方拿 |

**Provider 的定位**:在"原汁原味的 Flutter 风格"和"GetX 的简化"之间。它**完全遵循 Widget 树的依赖传递**,代码偏多一点,但架构干净。

---

## 十、Provider 还是 Riverpod?

Provider 作者后来写了 Riverpod,基本是 Provider 的"重做版"。它解决了 Provider 的几个痛点:

| 问题 | Provider | Riverpod |
| --- | --- | --- |
| 找不到 Provider 时怎么办 | 运行时报错 | 编译期就发现 |
| 离开 Widget 树就没法用 | 是 | 否,不依赖 context |
| Provider 之间的依赖 | 用 ProxyProvider 绕 | 直接 ref.watch |
| 测试 | 需要包 ProviderScope | 直接覆盖 |

**结论**:
- 老项目维护 → Provider
- 新项目 → 直接 Riverpod
- 学习路径 → 先 Provider 理解概念,再上 Riverpod 享受体验

---

## 十一、什么时候选 Provider?

✅ 适合:
- 中小型项目
- 团队偏向"标准 Flutter 风格"
- 已经懂 ChangeNotifier
- 不想要太多新概念

⚠️ 不适合:
- 想要编译期类型安全 → Riverpod
- 大量异步状态 → Riverpod 或 Bloc
- 严格分层架构 + 强测试 → Bloc

---

## 十二、一句话记忆

```
Provider = ChangeNotifier(数据)
         + InheritedWidget(注入)
         + Consumer / context.watch(订阅)
         + dispose 自动管理
```

它没有发明任何新概念,只是把 Flutter 自带的能力**包装得不那么累**。
