# Flutter JSON 序列化与 freezed

后端返回 JSON,前端转成 Dart 对象,这是最高频的操作之一。三种方式:

| 方式 | 工作量 | 推荐场景 |
| --- | --- | --- |
| **手写 fromJson/toJson** | 高 | 字段少、模型 < 5 个 |
| **json_serializable** | 注解 + 代码生成 | 中型项目 |
| **freezed** | 注解 + 代码生成,**全功能** | 中大型项目,**强烈推荐** |

---

## 一、手写 fromJson / toJson

```dart
class User {
  final int id;
  final String name;
  final int? age;

  User({required this.id, required this.name, this.age});

  factory User.fromJson(Map<String, dynamic> json) => User(
    id: json['id'] as int,
    name: json['name'] as String,
    age: json['age'] as int?,
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    if (age != null) 'age': age,
  };
}

// 用
final user = User.fromJson(jsonDecode(text));
final str = jsonEncode(user.toJson());
```

**痛点**:
- 字段一多就容易写错
- 类型转换繁琐
- 改一个字段两个地方都要改

字段超过 5 个就别手写了。

---

## 二、json_serializable:代码生成的 fromJson

```yaml
dependencies:
  json_annotation: ^4.9.0
dev_dependencies:
  build_runner: ^2.4.9
  json_serializable: ^6.8.0
```

```dart
// user.dart
import 'package:json_annotation/json_annotation.dart';

part 'user.g.dart';   // 必须

@JsonSerializable()
class User {
  final int id;
  final String name;

  @JsonKey(name: 'user_age')        // 后端字段名
  final int? age;

  @JsonKey(defaultValue: false)
  final bool active;

  @JsonKey(includeIfNull: false)
  final String? avatar;

  User({
    required this.id,
    required this.name,
    this.age,
    this.active = false,
    this.avatar,
  });

  factory User.fromJson(Map<String, dynamic> json) => _$UserFromJson(json);
  Map<String, dynamic> toJson() => _$UserToJson(this);
}
```

跑生成:

```bash
dart run build_runner build              # 一次
dart run build_runner watch              # 监听变化自动生成
dart run build_runner build --delete-conflicting-outputs   # 冲突时
```

---

## 三、嵌套对象

```dart
@JsonSerializable(explicitToJson: true)
class Order {
  final int id;
  final User user;            // 嵌套
  final List<Product> items;  // 嵌套列表
  final DateTime createdAt;

  Order({
    required this.id,
    required this.user,
    required this.items,
    required this.createdAt,
  });

  factory Order.fromJson(Map<String, dynamic> json) => _$OrderFromJson(json);
  Map<String, dynamic> toJson() => _$OrderToJson(this);
}
```

注意 **`explicitToJson: true`**:嵌套对象的 toJson 才会被调用。否则只会给你一个 `User` 实例,不是它的 JSON。

---

## 四、自定义类型转换

`DateTime` 默认就支持 ISO8601 字符串。其他类型需要自定义 converter:

```dart
class TimestampConverter implements JsonConverter<DateTime, int> {
  const TimestampConverter();

  @override
  DateTime fromJson(int json) => DateTime.fromMillisecondsSinceEpoch(json * 1000);
  @override
  int toJson(DateTime object) => object.millisecondsSinceEpoch ~/ 1000;
}

@JsonSerializable()
class Post {
  final int id;

  @TimestampConverter()
  final DateTime createdAt;
  ...
}
```

或全局应用:

```dart
@JsonSerializable(converters: [TimestampConverter()])
```

---

## 五、freezed:终极方案

freezed 一站式提供:
- ✅ 不可变(immutable)
- ✅ `copyWith`
- ✅ `==` / `hashCode`
- ✅ `toString`
- ✅ `fromJson` / `toJson`(配合 json_serializable)
- ✅ Union / sealed class

```yaml
dependencies:
  freezed_annotation: ^2.4.4
  json_annotation: ^4.9.0
dev_dependencies:
  build_runner: ^2.4.9
  freezed: ^2.5.7
  json_serializable: ^6.8.0
```

---

## 六、freezed 数据类

```dart
import 'package:freezed_annotation/freezed_annotation.dart';

part 'user.freezed.dart';
part 'user.g.dart';

@freezed
class User with _$User {
  const factory User({
    required int id,
    required String name,
    int? age,
    @Default(false) bool active,
    @JsonKey(name: 'created_at') DateTime? createdAt,
  }) = _User;

  factory User.fromJson(Map<String, dynamic> json) => _$UserFromJson(json);
}
```

跑 build_runner 后,你免费得到:

```dart
final u = User(id: 1, name: '张三');

// copyWith
final u2 = u.copyWith(name: '李四');

// 相等
print(User(id: 1, name: '张三') == User(id: 1, name: '张三'));   // true

// toString
print(u);    // User(id: 1, name: 张三, age: null, active: false, createdAt: null)

// JSON
final j = u.toJson();
final back = User.fromJson(j);
```

**所有数据类用 freezed 写,不要再手写 == / hashCode / copyWith**。

---

## 七、freezed 联合类型(sealed)

最杀手锏的功能。**Bloc 状态、Result 类型用它写得超级清爽**:

```dart
@freezed
class AuthState with _$AuthState {
  const factory AuthState.initial() = AuthInitial;
  const factory AuthState.loading() = AuthLoading;
  const factory AuthState.success(User user) = AuthSuccess;
  const factory AuthState.error(String message) = AuthError;
}
```

用法:

```dart
state.when(
  initial: () => const Text('请登录'),
  loading: () => const CircularProgressIndicator(),
  success: (user) => Text('欢迎,${user.name}'),
  error: (msg) => Text('错误:$msg'),
);
```

`when` 强制你处理所有分支,**漏一个编译失败**(回顾 28 sealed)。

也支持 `maybeWhen` / `map`:

```dart
state.maybeWhen(
  success: (u) => Text(u.name),
  orElse: () => const Text('其他'),
);
```

Bloc(回顾 10)+ freezed 是黄金组合:

```dart
class AuthCubit extends Cubit<AuthState> {
  AuthCubit() : super(const AuthState.initial());

  Future<void> login(String email, String pwd) async {
    emit(const AuthState.loading());
    try {
      final user = await api.login(email, pwd);
      emit(AuthState.success(user));
    } catch (e) {
      emit(AuthState.error(e.toString()));
    }
  }
}
```

---

## 八、freezed + JsonKey 高级

```dart
@freezed
class Config with _$Config {
  const factory Config({
    @JsonKey(name: 'api_url') required String apiUrl,
    @Default([]) List<String> tags,
    @TimestampConverter() DateTime? lastSync,
  }) = _Config;

  factory Config.fromJson(Map<String, dynamic> json) => _$ConfigFromJson(json);
}
```

`@Default(...)`:字段默认值
`@JsonKey(name:)`:JSON 字段名映射
`@TimestampConverter()`:类型转换

---

## 九、freezed 添加自定义方法

```dart
@freezed
class User with _$User {
  const User._();         // 私有构造,允许加方法

  const factory User({
    required int id,
    required String name,
    required int age,
  }) = _User;

  bool get isAdult => age >= 18;
  String get greeting => 'Hi, I am $name';

  factory User.fromJson(Map<String, dynamic> json) => _$UserFromJson(json);
}
```

注意要写 `const User._();` 这一行,freezed 才允许你加自定义方法。

---

## 十、freezed 选择性字段

只想要部分功能?可以选:

```dart
@Freezed(
  copyWith: true,
  equal: true,
  toStringOverride: true,
  toJson: false,    // 不要 JSON
)
class Internal with _$Internal {
  const factory Internal({required int id}) = _Internal;
}
```

---

## 十一、JSON 调试技巧

### 1. 大写 / 蛇形 vs 驼峰

```json
{
  "user_name": "张三",
  "Created_At": "2026-05-02"
}
```

```dart
@JsonSerializable(fieldRename: FieldRename.snake)   // 自动 user_name → userName
class User {
  final String userName;
  ...
}
```

`FieldRename`:`none / snake / kebab / pascal`

### 2. 服务端字段类型不一致

后端有时返回 `"id": "42"`(字符串),有时 `"id": 42`(数字)。最稳的:

```dart
factory User.fromJson(Map<String, dynamic> json) => User(
  id: int.parse(json['id'].toString()),
  ...
);
```

### 3. 缺字段

```dart
@JsonKey(defaultValue: '匿名')
final String name;

// 或
@Default('匿名') String name,    // freezed
```

### 4. List 嵌套

```dart
@freezed
class Page with _$Page {
  const factory Page({
    required int total,
    @Default([]) List<User> users,    // List<freezed 类> 自动处理
  }) = _Page;

  factory Page.fromJson(Map<String, dynamic> json) => _$PageFromJson(json);
}
```

---

## 十二、性能 tips

### 1. jsonDecode 大文件 → Isolate

```dart
final data = await compute(jsonDecode, jsonString);    // 后台解析
final user = User.fromJson(data);
```

回顾 18 / 37。

### 2. 避免重复反序列化

每次都 `User.fromJson(json)` 创建新对象,大量数据时可缓存。

### 3. freezed 不可变是个特性

不可变意味着改一个字段必须 copyWith,会创建新对象。**好处**:Bloc / Riverpod 的相等判断准确,不会"改了字段但没触发 rebuild"。

---

## 十三、对比总结

```dart
// 手写
class User {
  final int id; final String name;
  User({required this.id, required this.name});
  factory User.fromJson(Map j) => User(id: j['id'], name: j['name']);
  Map toJson() => {'id': id, 'name': name};
  // ❌ 没 ==,没 hashCode,没 toString,没 copyWith
}

// json_serializable
@JsonSerializable()
class User {
  final int id; final String name;
  User({required this.id, required this.name});
  factory User.fromJson(Map<String, dynamic> j) => _$UserFromJson(j);
  Map<String, dynamic> toJson() => _$UserToJson(this);
  // ⚠️ 还要自己写 ==,toString
}

// freezed
@freezed
class User with _$User {
  const factory User({required int id, required String name}) = _User;
  factory User.fromJson(Map<String, dynamic> j) => _$UserFromJson(j);
  // ✅ 全有了
}
```

代码量 / 功能比:**freezed > json_serializable > 手写**。
学习曲线:freezed 多花 30 分钟,后面节省无数小时。

---

## 十四、生成代码的注意

### 1. 别提交 .g.dart / .freezed.dart 到 git

`.gitignore`:

```
*.g.dart
*.freezed.dart
```

让 CI / 队友本地跑 `build_runner` 生成。

### 2. CI 里跑生成

```yaml
# GitHub Actions
- run: dart run build_runner build --delete-conflicting-outputs
- run: flutter analyze
- run: flutter test
```

### 3. 监听模式

开发时:

```bash
dart run build_runner watch --delete-conflicting-outputs
```

改文件自动重新生成。

### 4. 报错"part not found"

→ 没跑 build_runner。

### 5. 报错"already exists"

→ 加 `--delete-conflicting-outputs`。

---

## 十五、和其他工具组合

### Dio + freezed

```dart
final r = await dio.get('/users/1');
final user = User.fromJson(r.data);    // r.data 已经是 Map
```

或封装 Repo:

```dart
class UserRepo {
  Future<User> getUser(int id) async {
    final r = await dio.get('/users/$id');
    return User.fromJson(r.data);
  }
}
```

回顾 13 / 21。

### Retrofit + freezed

```dart
@RestApi()
abstract class Api {
  factory Api(Dio dio) = _Api;

  @GET('/users/{id}')
  Future<User> getUser(@Path('id') int id);    // 自动 fromJson
}
```

retrofit_generator 知道 freezed 类有 fromJson,自动调用。

### Hive + freezed

需要给 freezed 类配 HiveAdapter,稍微复杂,见 hive_generator + freezed 的官方示例。

---

## 十六、常见坑

### 1. part 路径错

```dart
part 'user.g.dart';     // 文件名必须跟当前文件一致
```

文件叫 `user.dart` → part `user.g.dart` / `user.freezed.dart`。

### 2. 嵌套对象忘了 explicitToJson

```dart
@JsonSerializable()    // ❌ toJson() 出来的嵌套是对象不是 Map
@JsonSerializable(explicitToJson: true)    // ✅
```

freezed 默认就处理好了,只有用纯 json_serializable 时要注意。

### 3. const factory 的限制

freezed 主构造是 `const factory`,所有参数必须是 final。**不能写可变字段**。
要可变就别用 freezed,用普通 class。

### 4. fromJson 抛异常

后端字段不一致 → 解析时崩。**最外层 try-catch**:

```dart
try {
  final user = User.fromJson(json);
} catch (e, st) {
  Sentry.captureException(e, stackTrace: st);
  // 显示友好错误
}
```

### 5. List<dynamic> → List<User>

直接 cast 会爆:

```dart
final users = data['users'] as List<User>;   // ❌
```

→ 显式转换:

```dart
final users = (data['users'] as List).map((e) => User.fromJson(e)).toList();
```

freezed / json_serializable 自动处理。

---

## 十七、和已学知识的串联

- Dart 类与构造(28)是 freezed 的基础
- freezed 的 sealed union 配合模式匹配(28)和 Bloc 状态(10)极爽
- Repository 层(13 / 21)的 model 全用 freezed
- 测试(20)freezed 的 == 帮你 expect 简单写
- 数据模型不变性 = 性能稳定(18)

---

## 十八、心智模型

```
"模型类有三种身份:数据 / 复制 / 区分"

手写         : 自己一个个写,易错
json_serializable: JSON 自动,其他还得写
freezed      : 全自动 + 不可变 + sealed union
                ↑ 推荐选这个,不要犹豫

业务实体 → freezed(全部默认上)
状态     → freezed sealed(Loading / Success / Error)
DTO      → freezed,跟实体分离
```

freezed 的学习成本一次性,**收益持续整个项目**。装一次 build_runner,后面每个数据类只写一遍声明,所有方法自动生成——这是 Flutter 工程化最重要的工具之一。
