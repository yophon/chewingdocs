# Riverpod 详解

Riverpod 是 Provider 作者(Remi Rousselet)的"重做版",名字其实是 **Provider 的字母重排**。它修复了 Provider 的几个根本痛点,目前是 Flutter 生态里最被推荐的状态管理方案。

如果你已经懂 Provider(08 那篇),Riverpod 很容易上手——**思想完全一样,API 更安全**。

---

## 一、为什么不直接用 Provider?

Provider 的几个痛点:

| 痛点 | 后果 |
| --- | --- |
| 找不到 Provider 时报 `ProviderNotFoundException` | 运行时才发现,容易上线翻车 |
| 必须依赖 BuildContext | 离开 Widget 树就用不了(后台任务、单元测试) |
| Provider 之间联动只能用 ProxyProvider | 写起来繁琐、嵌套深 |
| 类型可能出错 | 运行时才知道 |

Riverpod 的核心改进:

✅ **编译期类型安全**(找不到的话编译就报错)
✅ **不依赖 BuildContext**(任何地方都能用)
✅ **Provider 之间天然能联动**(`ref.watch` 一行搞定)
✅ **完美测试**(不用任何特殊设置就能 mock)

---

## 二、安装

```yaml
# pubspec.yaml
dependencies:
  flutter_riverpod: ^2.5.1
  # 如果用代码生成(强烈推荐)
  riverpod_annotation: ^2.3.5

dev_dependencies:
  build_runner: ^2.4.9
  riverpod_generator: ^2.4.0
```

包根目录加 `ProviderScope`:

```dart
void main() {
  runApp(
    ProviderScope(            // 整个 App 必须在它下面
      child: const MyApp(),
    ),
  );
}
```

---

## 三、核心概念

### 1. Provider:声明状态

Riverpod 的 "Provider" 是**全局变量**,声明在文件顶部,不是 Widget 树。

```dart
// 最简单的:只读值
final greetingProvider = Provider<String>((ref) => 'Hello');

// 可变状态(简单类型用 StateProvider)
final counterProvider = StateProvider<int>((ref) => 0);
```

### 2. WidgetRef / Ref:取数据的工具

不像 Provider 用 `context.watch`,Riverpod 用 `ref`:

```dart
class CounterPage extends ConsumerWidget {
  const CounterPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final count = ref.watch(counterProvider);

    return Column(
      children: [
        Text('$count'),
        ElevatedButton(
          onPressed: () => ref.read(counterProvider.notifier).state++,
          child: const Text('+1'),
        ),
      ],
    );
  }
}
```

注意:
- 把 `StatelessWidget` 换成 `ConsumerWidget`,多一个 `WidgetRef ref` 参数
- `ref.watch` = 监听刷新
- `ref.read` = 一次性读
- `ref.listen` = 监听副作用(显示 SnackBar 等)

---

## 四、Provider 类型(传统写法)

| 类型 | 用途 |
| --- | --- |
| `Provider<T>` | 只读、不变 |
| `StateProvider<T>` | 简单可变值(int、bool、String) |
| `FutureProvider<T>` | 异步加载,自动给你 loading/error/data 三态 |
| `StreamProvider<T>` | Stream 同理 |
| `NotifierProvider<N, T>` | 复杂可变状态(替代 ChangeNotifier) |
| `AsyncNotifierProvider<N, T>` | 异步初始化的复杂状态 |

### StateProvider:简单值

```dart
final isDarkProvider = StateProvider<bool>((ref) => false);

// 修改
ref.read(isDarkProvider.notifier).state = true;
// 或
ref.read(isDarkProvider.notifier).update((s) => !s);
```

### NotifierProvider:复杂逻辑(取代 ChangeNotifier)

```dart
class TodoListNotifier extends Notifier<List<Todo>> {
  @override
  List<Todo> build() => [];   // 初始状态

  void add(String title) {
    state = [...state, Todo(title: title)];   // 不可变更新
  }

  void toggle(int idx) {
    state = [
      for (var i = 0; i < state.length; i++)
        if (i == idx) state[i].copyWith(done: !state[i].done)
        else state[i],
    ];
  }
}

final todoListProvider = NotifierProvider<TodoListNotifier, List<Todo>>(
  TodoListNotifier.new,
);
```

注意 `state = newState` 而不是 `state.add(...)`。Riverpod 推崇**不可变更新**,这样能精确判断"变没变"。

### FutureProvider:异步数据,自动管 loading/error

```dart
final userProvider = FutureProvider<User>((ref) async {
  return await api.fetchUser();
});

// UI 里
final asyncUser = ref.watch(userProvider);

return asyncUser.when(
  data: (user) => Text(user.name),
  loading: () => const CircularProgressIndicator(),
  error: (e, st) => Text('错误:$e'),
);
```

`AsyncValue`(`when` 包裹的)自动帮你处理三态,**不用自己写 isLoading 标志位**。这是 Riverpod 最让人爽的设计之一。

---

## 五、代码生成版(2.0 推荐写法)

加注解 `@riverpod`,自动生成 Provider:

```dart
// counter.dart
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'counter.g.dart';

@riverpod
class Counter extends _$Counter {
  @override
  int build() => 0;

  void increment() => state++;
}
```

跑一下 `dart run build_runner build`,自动生成 `counterProvider`。

使用:

```dart
ref.watch(counterProvider);                  // 读
ref.read(counterProvider.notifier).increment();  // 调方法
```

异步版:

```dart
@riverpod
Future<User> user(UserRef ref, String id) async {
  return await api.fetchUser(id);
}

// 使用(自动支持参数 = family)
ref.watch(userProvider('user-123'));
```

**好处**:不用记一堆 Provider 类型,统一一个注解。

---

## 六、Provider 之间联动

这是 Riverpod 的**最大杀器**。

```dart
final authProvider = StateProvider<User?>((ref) => null);

final cartProvider = Provider<Cart>((ref) {
  final user = ref.watch(authProvider);   // 监听 auth
  if (user == null) return Cart.empty();
  return Cart.forUser(user.id);
});
```

`ref.watch` 不止能在 Widget 里用,**Provider 内部也能用**。当 `authProvider` 变化,`cartProvider` 自动重算。

> 这就是 Provider 时代要写一堆 `ProxyProvider` 才能搞定的事。

---

## 七、ref.watch / read / listen 的区别

| 方法 | 触发 rebuild | 适用 |
| --- | --- | --- |
| `ref.watch(p)` | ✅ | `build` 里、`Notifier.build` 里 |
| `ref.read(p)` | ❌ | 事件回调里(onPressed 等) |
| `ref.listen(p, fn)` | ❌(回调外部副作用) | 弹 SnackBar、跳转页面、对话框 |

### listen 的典型用法

```dart
@override
Widget build(BuildContext context, WidgetRef ref) {
  ref.listen<AsyncValue<User>>(userProvider, (prev, next) {
    next.whenOrNull(
      error: (e, _) => ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('加载失败:$e')),
      ),
    );
  });

  return ...;
}
```

`listen` 不会触发 rebuild,适合"值变了就做一件事"的场景。

---

## 八、autoDispose:用完就扔

默认 Provider 一旦创建就常驻内存。加 `.autoDispose` 之后,**没有人监听时自动销毁**:

```dart
final searchProvider = FutureProvider.autoDispose<List<Item>>((ref) async {
  return await api.search();
});
```

代码生成版:`@riverpod` 默认就是 autoDispose,要常驻得加 `keepAlive: true`:

```dart
@Riverpod(keepAlive: true)
Future<User> currentUser(CurrentUserRef ref) async => api.fetchMe();
```

**经验**:**搜索结果、详情页数据、临时计算**都用 autoDispose,**全局用户/配置**用 keepAlive。

### 配合 ref.keepAlive() 做缓存

```dart
@riverpod
Future<User> user(UserRef ref, String id) async {
  final link = ref.keepAlive();         // 数据来了之后,即使没人监听也保留
  Timer(Duration(minutes: 5), link.close);  // 5 分钟后再清掉
  return await api.fetchUser(id);
}
```

---

## 九、family:带参数的 Provider

同一个 Provider 给不同参数,自动生成不同实例:

```dart
@riverpod
Future<Article> article(ArticleRef ref, String id) async {
  return await api.fetchArticle(id);
}

// 使用
ref.watch(articleProvider('id-1'));
ref.watch(articleProvider('id-2'));   // 互不干扰,各自缓存
```

传统写法用 `.family`:

```dart
final articleProvider = FutureProvider.family<Article, String>((ref, id) async {
  return await api.fetchArticle(id);
});
```

---

## 十、完整示例:Todo App

```dart
// todo.dart
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'todo.g.dart';

class Todo {
  final String id;
  final String title;
  final bool done;
  Todo({required this.id, required this.title, this.done = false});

  Todo copyWith({String? title, bool? done}) =>
      Todo(id: id, title: title ?? this.title, done: done ?? this.done);
}

@riverpod
class TodoList extends _$TodoList {
  @override
  List<Todo> build() => [];

  void add(String title) {
    state = [...state, Todo(id: DateTime.now().toString(), title: title)];
  }

  void toggle(String id) {
    state = [
      for (final t in state)
        if (t.id == id) t.copyWith(done: !t.done) else t,
    ];
  }
}

// 派生:未完成数量(自动跟着 todos 变)
@riverpod
int unfinishedCount(UnfinishedCountRef ref) {
  return ref.watch(todoListProvider).where((t) => !t.done).length;
}
```

UI:

```dart
class TodoPage extends ConsumerWidget {
  const TodoPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final todos = ref.watch(todoListProvider);
    final unfinished = ref.watch(unfinishedCountProvider);

    return Scaffold(
      appBar: AppBar(title: Text('未完成:$unfinished')),
      body: ListView(
        children: todos.map((t) => CheckboxListTile(
          key: ValueKey(t.id),
          value: t.done,
          title: Text(t.title),
          onChanged: (_) =>
              ref.read(todoListProvider.notifier).toggle(t.id),
        )).toList(),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => ref.read(todoListProvider.notifier).add('新待办'),
        child: const Icon(Icons.add),
      ),
    );
  }
}
```

注意 `unfinishedCount` 这种**派生数据**写起来多自然——这是 Riverpod 的灵魂之一。

---

## 十一、测试

Riverpod 测试是它的另一大卖点。**任何 Provider 都能在测试里覆盖**:

```dart
test('toggle works', () {
  final container = ProviderContainer();          // 测试用容器
  addTearDown(container.dispose);

  final notifier = container.read(todoListProvider.notifier);
  notifier.add('hello');
  notifier.toggle(container.read(todoListProvider).first.id);

  expect(container.read(todoListProvider).first.done, true);
});
```

Mock 依赖:

```dart
ProviderContainer(
  overrides: [
    apiProvider.overrideWithValue(MockApi()),     // 一行替换
  ],
)
```

不需要任何 setup magic,这是 Provider 时代很难做到的。

---

## 十二、Riverpod vs Provider 速查

| 操作 | Provider | Riverpod |
| --- | --- | --- |
| 注入 | `ChangeNotifierProvider(create: ..., child: app)` | `ProviderScope(child: app)` |
| 取值(订阅) | `context.watch<T>()` | `ref.watch(provider)` |
| 取值(只读) | `context.read<T>()` | `ref.read(provider)` |
| 副作用 | `Consumer + Listener` | `ref.listen(provider, fn)` |
| 派生 | `ProxyProvider` | 直接在 Provider 里 `ref.watch` |
| 异步状态 | 自己写 isLoading | `AsyncValue.when` |
| 测试 | 包 ProviderScope + override | `ProviderContainer + overrides` |

---

## 十三、常见坑

### 1. 忘了 ProviderScope

```
ProviderScope was not found above this widget
```

main 里第一行就要包。

### 2. 在 build 里 ref.read 然后修改 → 死循环

跟 Provider 一样,build 里只 watch,不在 build 里改状态。

### 3. ConsumerWidget vs ConsumerStatefulWidget

要写 initState 等生命周期就用 `ConsumerStatefulWidget`,在 `ConsumerState` 里 `ref` 直接用:

```dart
class _MyState extends ConsumerState<MyPage> {
  @override
  void initState() {
    super.initState();
    ref.read(...);   // ✅ 这里也能用
  }
}
```

### 4. 滥用 ref.read 在 build 里

只在事件回调里 read,build 里永远 watch。

---

## 十四、心智模型

```
ProviderScope          ← 一个全局容器,管理所有 Provider
   │
   └─ Provider         ← 全局变量,但每个 ProviderScope 里独立
        │
       ref             ← 工具:watch / read / listen / invalidate
```

**Riverpod = Provider + 编译期安全 + 不依赖 context + 内置异步状态 + 内置缓存**

理解了 Provider,Riverpod 就是它的"无痛升级版"。
