# Bloc / Cubit 详解

Bloc(Business Logic Component)是企业级 Flutter 项目的首选状态管理方案。它**强制单向数据流**,事件→处理→状态,清晰且易测试。

Cubit 是 Bloc 的简化版,用方法直接发状态,不需要事件类。**新项目优先用 Cubit,需要事件溯源/中间件时再升级 Bloc**。

---

## 一、安装

```yaml
dependencies:
  flutter_bloc: ^8.1.6
  equatable: ^2.0.5      # 状态相等判断,推荐
```

---

## 二、Cubit:从这里开始

### 最简例子

```dart
// 1. 定义 Cubit
class CounterCubit extends Cubit<int> {
  CounterCubit() : super(0);                 // 初始状态

  void increment() => emit(state + 1);       // 发出新状态
  void decrement() => emit(state - 1);
}

// 2. 注入
BlocProvider(
  create: (_) => CounterCubit(),
  child: CounterPage(),
)

// 3. 使用
class CounterPage extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        BlocBuilder<CounterCubit, int>(
          builder: (_, count) => Text('$count'),
        ),
        ElevatedButton(
          onPressed: () => context.read<CounterCubit>().increment(),
          child: const Text('+'),
        ),
      ],
    );
  }
}
```

**对比 ChangeNotifier**:把 `notifyListeners()` 换成 `emit(newState)`,数据是**完整新状态**而不是修改字段。

### 复杂状态

```dart
// 状态类(不可变,推荐用 Equatable 或 freezed)
class CartState extends Equatable {
  final List<Product> items;
  final bool loading;

  const CartState({this.items = const [], this.loading = false});

  CartState copyWith({List<Product>? items, bool? loading}) =>
      CartState(items: items ?? this.items, loading: loading ?? this.loading);

  @override
  List<Object?> get props => [items, loading];   // 用于相等判断
}

class CartCubit extends Cubit<CartState> {
  final Api api;
  CartCubit(this.api) : super(const CartState());

  Future<void> load() async {
    emit(state.copyWith(loading: true));
    final items = await api.fetchCart();
    emit(state.copyWith(items: items, loading: false));
  }

  void add(Product p) {
    emit(state.copyWith(items: [...state.items, p]));
  }
}
```

---

## 三、Bloc:事件驱动版

Bloc 用 **Event → State** 模型。比 Cubit 多一层"事件"抽象。

```dart
// 1. 事件
sealed class CounterEvent {}
class Increment extends CounterEvent {}
class Decrement extends CounterEvent {}
class Reset extends CounterEvent {
  final int to;
  Reset(this.to);
}

// 2. Bloc
class CounterBloc extends Bloc<CounterEvent, int> {
  CounterBloc() : super(0) {
    on<Increment>((event, emit) => emit(state + 1));
    on<Decrement>((event, emit) => emit(state - 1));
    on<Reset>((event, emit) => emit(event.to));
  }
}

// 3. 触发
context.read<CounterBloc>().add(Increment());
context.read<CounterBloc>().add(Reset(100));
```

### Bloc vs Cubit 怎么选?

| 场景 | 推荐 |
| --- | --- |
| 简单 CRUD | Cubit |
| 复杂状态机、有多种事件 | Bloc |
| 需要事件溯源(知道哪个事件改了状态) | Bloc |
| 需要事件去抖、节流(`droppable`、`throttleTime`) | Bloc |
| 团队小,追求开发速度 | Cubit |

> 实战:90% 用 Cubit 就够;只有真正需要事件流处理时才升级到 Bloc。

---

## 四、消费数据的 Widget

### 1. BlocBuilder:订阅刷新

```dart
BlocBuilder<CartCubit, CartState>(
  builder: (context, state) {
    if (state.loading) return CircularProgressIndicator();
    return ListView(...);
  },
)
```

### 2. BlocListener:副作用(不重建 UI)

```dart
BlocListener<AuthCubit, AuthState>(
  listener: (context, state) {
    if (state is AuthSuccess) {
      Navigator.pushReplacementNamed(context, '/home');
    } else if (state is AuthError) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(state.message)),
      );
    }
  },
  child: LoginForm(),
)
```

### 3. BlocConsumer:Builder + Listener 二合一

```dart
BlocConsumer<AuthCubit, AuthState>(
  listener: (context, state) { /* 副作用 */ },
  builder: (context, state) { /* UI */ },
)
```

### 4. BlocSelector:精细订阅

```dart
BlocSelector<CartCubit, CartState, int>(
  selector: (state) => state.items.length,   // 只关心数量
  builder: (_, count) => Text('$count'),
)
```

只在 `items.length` 变化时重建,即使其他字段(loading 等)变了也不会触发。

---

## 五、context 扩展方法

跟 Provider 一样:

```dart
context.read<CartCubit>()           // 一次性读,事件回调用
context.watch<CartCubit>().state    // build 里订阅(等价 BlocBuilder)
context.select<CartCubit, int>((c) => c.state.items.length)  // 精细订阅
```

---

## 六、MultiBlocProvider

平铺多个 Bloc/Cubit:

```dart
MultiBlocProvider(
  providers: [
    BlocProvider(create: (_) => AuthCubit()),
    BlocProvider(create: (_) => CartCubit()),
    BlocProvider(create: (_) => ThemeCubit()),
  ],
  child: MyApp(),
)
```

---

## 七、Bloc 高级:并发处理

Bloc 默认事件**并发执行**。如果你想"同一时刻只有一个事件在跑"或"丢弃后续重复事件",用 transformer:

```dart
import 'package:bloc_concurrency/bloc_concurrency.dart';

class SearchBloc extends Bloc<SearchEvent, SearchState> {
  SearchBloc() : super(SearchState.initial()) {
    // 用户快速输入时,丢弃中间的请求,只跑最新的
    on<QueryChanged>(
      _onQueryChanged,
      transformer: restartable(),
    );
  }

  Future<void> _onQueryChanged(QueryChanged e, Emitter<SearchState> emit) async {
    emit(state.copyWith(loading: true));
    final results = await api.search(e.query);
    emit(state.copyWith(loading: false, results: results));
  }
}
```

四种 transformer:

| 名称 | 行为 |
| --- | --- |
| `concurrent`(默认) | 并发跑 |
| `sequential` | 排队跑 |
| `droppable` | 有事件在跑就丢弃新的(防重复点击) |
| `restartable` | 新事件取消旧的(搜索框最佳) |

这是 Bloc 在 Cubit 之上的杀手锏。

---

## 八、bloc_test:测试利器

```dart
blocTest<CounterCubit, int>(
  '初始状态是 0',
  build: () => CounterCubit(),
  expect: () => [],
);

blocTest<CounterCubit, int>(
  'increment 后变成 1',
  build: () => CounterCubit(),
  act: (cubit) => cubit.increment(),
  expect: () => [1],
);

blocTest<CartCubit, CartState>(
  'load 触发 loading → success',
  build: () => CartCubit(MockApi()..stubFetchCart([item1, item2])),
  act: (c) => c.load(),
  expect: () => [
    isA<CartState>().having((s) => s.loading, 'loading', true),
    isA<CartState>().having((s) => s.items.length, 'items', 2),
  ],
);
```

声明式描述"输入什么 → 输出什么状态序列",这是 Bloc 推崇可测试性的体现。

---

## 九、典型架构

Bloc 项目通常用**清晰分层**:

```
lib/
├── presentation/      ← UI 层(只看 Bloc,不直接调 API)
│   ├── pages/
│   ├── widgets/
│   └── bloc/          ← Cubit / Bloc 文件
├── domain/            ← 业务规则(Entity、UseCase)
│   ├── entities/
│   └── repositories/  ← 接口
└── data/              ← 数据层
    ├── models/
    ├── api/
    └── repositories/  ← 接口实现
```

数据流:

```
UI 触发事件 → Cubit/Bloc → Repository → API/DB → Repository 返回 → emit → UI 重建
```

UI 层**只跟 Cubit 对话**,不直接调网络/数据库,这是 Bloc 项目的核心优势。

---

## 十、完整示例:登录流程

```dart
// 状态
sealed class AuthState extends Equatable {
  const AuthState();
  @override List<Object?> get props => [];
}
class AuthInitial extends AuthState {}
class AuthLoading extends AuthState {}
class AuthSuccess extends AuthState {
  final User user;
  const AuthSuccess(this.user);
  @override List<Object?> get props => [user];
}
class AuthError extends AuthState {
  final String message;
  const AuthError(this.message);
  @override List<Object?> get props => [message];
}

// Cubit
class AuthCubit extends Cubit<AuthState> {
  final AuthRepo repo;
  AuthCubit(this.repo) : super(AuthInitial());

  Future<void> login(String email, String pwd) async {
    emit(AuthLoading());
    try {
      final user = await repo.login(email, pwd);
      emit(AuthSuccess(user));
    } catch (e) {
      emit(AuthError(e.toString()));
    }
  }
}

// 页面
class LoginPage extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return BlocConsumer<AuthCubit, AuthState>(
      listener: (context, state) {
        if (state is AuthSuccess) {
          Navigator.pushReplacementNamed(context, '/home');
        } else if (state is AuthError) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(state.message)),
          );
        }
      },
      builder: (context, state) {
        return Scaffold(
          body: Column(
            children: [
              if (state is AuthLoading) CircularProgressIndicator(),
              ElevatedButton(
                onPressed: state is AuthLoading
                    ? null
                    : () => context.read<AuthCubit>().login('a@b.com', '123'),
                child: const Text('登录'),
              ),
            ],
          ),
        );
      },
    );
  }
}
```

注意 `sealed class` + 模式匹配,Dart 3 之后写 Bloc 状态非常顺手。

---

## 十一、Bloc vs Riverpod vs GetX

| 维度 | Bloc/Cubit | Riverpod | GetX |
| --- | --- | --- | --- |
| 模板代码 | 多 | 中 | 少 |
| 学习曲线 | 陡 | 中 | 平 |
| 类型安全 | 强 | 强 | 弱 |
| 依赖 BuildContext | 是 | 否 | 否 |
| 测试友好度 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| 团队协作 | 优秀(强约束) | 优秀 | 注意争议 |
| 异步处理 | transformer | AsyncValue | 自己写 |
| 适合规模 | 大型 | 中大型 | 中小型 |

---

## 十二、什么时候用 Bloc?

✅ 强烈推荐:
- 大型项目、长期维护
- 强测试需求(单元测试 + 集成测试)
- 多人团队、需要架构约束
- 状态机式业务(订单状态、支付流程)
- 严格的"事件溯源"需求(审计、追溯哪个动作改了状态)

⚠️ 不必要:
- 小项目、原型(用 Cubit 就够,或者 Riverpod 更轻)
- 状态简单(Riverpod 的 NotifierProvider 写起来更短)

---

## 十三、心智模型

```
Cubit:
  state₀ → emit(state₁) → emit(state₂) → ...
  方法直接改

Bloc:
  Event → on<E> handler → emit(newState)
  事件先抽象,handler 处理

UI:
  BlocBuilder 订阅 → BlocListener 处理副作用 → context.read 触发动作
```

**Bloc 的灵魂是"输入输出可观察可测试"**——每个事件进去,出来一串状态,清清楚楚。
