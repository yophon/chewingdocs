# Dart 语言基础

写好 Flutter 一半在于"Dart 用得好不好"。Dart 长得像 Java/JS/Kotlin/TypeScript 的混合体,有自己的脾气。

---

## 一、变量与类型

```dart
var name = '张三';                  // 类型推断:String
final age = 18;                    // 不可重新赋值,运行时确定
const PI = 3.14;                   // 编译期常量,更省

String city = '上海';
int count = 42;
double price = 9.99;
bool ok = true;
```

### `final` vs `const`

```dart
final now = DateTime.now();        // ✅ 运行时
// const now = DateTime.now();     // ❌ 不是编译期常量

const list1 = [1, 2, 3];           // 编译期常量
final list2 = [1, 2, 3];           // 运行时新建

print(identical(const [1,2,3], const [1,2,3]));   // true!同一实例
print(identical([1,2,3], [1,2,3]));               // false
```

回顾 18:**Widget 加 `const` 是免费性能优化**,因为编译期常量 Flutter 会跳过 update。

### 类型推断

```dart
var x = 1;          // int
x = 'hello';        // ❌ 类型已固定

dynamic y = 1;      // 动态类型,啥都能塞,但失去类型保护
y = 'hello';        // OK,但运行时才检查
```

`dynamic` 慎用,**等同于关掉类型保护**。

---

## 二、字符串

```dart
final name = '张三';
final age = 18;

// 模板字符串
print('我叫 $name,今年 $age 岁');
print('明年 ${age + 1} 岁');        // 表达式要 ${}

// 多行
final text = '''
第一行
第二行
''';

// 原始字符串(忽略转义)
final regex = r'\d+\s\w+';
```

### 常用方法

```dart
'Hello'.toLowerCase();
'  hi  '.trim();
'a,b,c'.split(',');                // ['a', 'b', 'c']
['a', 'b'].join('-');              // 'a-b'
'hello'.contains('ell');
'name'.padLeft(8, '0');            // '0000name'
'42'.padLeft(8, '0');              // '00000042'
'hello'.replaceAll('l', 'L');
```

---

## 三、集合(List / Set / Map)

```dart
// List
final list = [1, 2, 3];
list.add(4);
list.length;
list[0];
list.first; list.last;
list.contains(2);
list.indexOf(2);
list.removeAt(0);

// Set(去重 + 无序)
final set = {1, 2, 3};
set.add(1);                        // 已存在,无效

// Map
final map = {'a': 1, 'b': 2};
map['a'];                          // 1
map['c'] = 3;
map.containsKey('a');
map.keys; map.values;
```

### 常用高阶函数

```dart
final nums = [1, 2, 3, 4, 5];

nums.where((n) => n > 2).toList();           // [3, 4, 5]
nums.map((n) => n * 2).toList();             // [2, 4, 6, 8, 10]
nums.fold<int>(0, (acc, n) => acc + n);      // 15
nums.reduce((a, b) => a + b);                // 15
nums.any((n) => n > 4);                      // true
nums.every((n) => n > 0);                    // true
nums.firstWhere((n) => n > 3);               // 4(找不到抛异常)
nums.firstWhereOrNull((n) => n > 100);       // null(需 collection 包)
```

注意:**多数返回 Iterable,要 `.toList()` 才变 List**。

---

## 四、Spread / Collection-if / Collection-for

Dart 的 list 字面量直接支持表达式:

```dart
final extra = [4, 5];
final list = [1, 2, 3, ...extra];                 // [1,2,3,4,5]
final maybe = [1, 2, 3, ...?nullable];            // 容忍 null

// collection-if
final items = [
  Text('a'),
  if (showB) Text('b'),
  if (count > 0) ...List.generate(count, (i) => Text('$i')),
];

// collection-for
final squares = [for (var i = 0; i < 5; i++) i * i];   // [0,1,4,9,16]
```

写 Widget 树时这两个特性极其常用,**不要在 children 里写 if-else 三目套娃**。

---

## 五、函数

```dart
// 普通
int add(int a, int b) => a + b;

// 命名参数(用 {})
void greet({String? name, int age = 18}) {
  print('$name, $age');
}
greet(name: '张三', age: 20);

// 必填命名参数
void login({required String email, required String pwd}) { ... }

// 位置可选(用 [])
void log(String msg, [String? tag]) { ... }
log('hi');
log('hi', 'TAG');

// 函数作为值
final printer = (String s) => print(s);
[1,2,3].forEach(printer);
```

**Flutter 几乎全用命名参数 + required**,可读性比 Java 强:

```dart
ElevatedButton(
  onPressed: () {},
  child: const Text('OK'),
)
```

---

## 六、类与构造函数

```dart
class User {
  final String name;
  final int age;

  // 主构造(支持参数初始化)
  User(this.name, this.age);

  // 命名构造
  User.guest() : name = '游客', age = 0;

  // 重定向构造
  User.named(String n) : this(n, 0);

  // 工厂构造(可以返回缓存 / 子类)
  factory User.fromJson(Map<String, dynamic> j) =>
      User(j['name'], j['age']);

  // 方法
  String greet() => 'Hi, I am $name';

  // getter
  bool get isAdult => age >= 18;

  // toString / == / hashCode
  @override
  String toString() => 'User($name, $age)';

  @override
  bool operator ==(Object o) =>
      o is User && o.name == name && o.age == age;

  @override
  int get hashCode => Object.hash(name, age);
}
```

### 私有

Dart 没有 `private` 关键字,**用下划线开头表示库内私有**:

```dart
class _Internal {}     // 同 .dart 文件 / library 内可见
String _name;          // 同上
```

`_` 是文件 / library 级别的私有,不是类内私有。

---

## 七、继承 / 抽象类 / 接口

```dart
abstract class Animal {
  String get name;
  void speak();         // 抽象方法

  void breathe() => print('呼吸');   // 具体方法
}

class Dog extends Animal {
  @override
  final String name;
  Dog(this.name);

  @override
  void speak() => print('汪汪');
}
```

Dart **每个类都隐式是接口**,任何类都能用 `implements`:

```dart
class Robot implements Animal {
  @override
  String get name => 'R2';

  @override
  void speak() => print('beep');

  @override
  void breathe() => throw 'I do not breathe';   // 必须实现所有方法
}
```

`extends` 复用父类实现;`implements` 完全自己实现。

---

## 八、mixin:横向复用

`extends` 是单继承,要复用多个能力用 `mixin`:

```dart
mixin Logger {
  void log(String msg) => print('[$runtimeType] $msg');
}

mixin Validator {
  bool valid(String s) => s.isNotEmpty;
}

class UserService with Logger, Validator {
  void save(String name) {
    if (!valid(name)) return;
    log('saving $name');
  }
}
```

Flutter 里典型 mixin:`SingleTickerProviderStateMixin`(动画 vsync),回顾 15。

### 限制 mixin 用在某些类

```dart
mixin OnState on State {       // 只能 mixin 到 State 子类
  void doSomething() => setState(() {});
}
```

---

## 九、enum(增强版)

Dart 3 的 enum 支持字段、方法、构造,几乎是个小类:

```dart
enum HttpStatus {
  ok(200, 'OK'),
  notFound(404, 'Not Found'),
  serverError(500, 'Internal Server Error');

  final int code;
  final String message;
  const HttpStatus(this.code, this.message);

  bool get isError => code >= 400;
}

print(HttpStatus.notFound.isError);   // true
print(HttpStatus.values);             // 所有成员
```

---

## 十、sealed:封闭类型(Dart 3+)

```dart
sealed class Result<T> {}
class Success<T> extends Result<T> { final T value; Success(this.value); }
class Failure<T> extends Result<T> { final String error; Failure(this.error); }

String describe(Result<int> r) => switch (r) {
  Success(:final value) => '成功:$value',
  Failure(:final error) => '失败:$error',
};
// switch 上没列全所有子类会编译报错
```

`sealed` 让编译器知道**所有子类**,switch 就能强制穷举。Bloc 状态(回顾 10)和 Result 类型(21)用得很多。

---

## 十一、模式匹配(Dart 3+)

### 解构

```dart
final user = ('张三', 18);
final (name, age) = user;
print(name);

final {'name': n, 'age': a} = json;

// 类解构
class Point { final double x, y; const Point(this.x, this.y); }
final Point(:x, :y) = p;
```

### switch 表达式

```dart
final desc = switch (status) {
  200 => 'OK',
  >= 400 && < 500 => '客户端错误',
  >= 500 => '服务器错误',
  _ => '其他',
};
```

模式匹配大幅提升代码表达力,**Bloc / Result / Tree 解析这种场景特别舒服**。

---

## 十二、record(轻量级元组)

```dart
// 不用专门定义类,临时聚合数据
({String name, int age}) makeUser() {
  return (name: '张三', age: 18);
}

final u = makeUser();
print(u.name);

// 匿名 record
(String, int) point() => ('xyz', 42);
final (s, i) = point();
```

适合"返回多个值"或临时数据,**不要替代正经类**。

---

## 十三、extension:给现有类型加方法

```dart
extension StringX on String {
  bool get isEmail => contains('@');
  String capitalize() => isEmpty ? this : '${this[0].toUpperCase()}${substring(1)}';
}

print('a@b.com'.isEmail);          // true
print('hello'.capitalize());        // Hello
```

Flutter 里常见的:

```dart
extension on BuildContext {
  ThemeData get theme => Theme.of(this);
  Size get screenSize => MediaQuery.sizeOf(this);
}

context.theme.colorScheme.primary
```

**别滥用**——给 String 加 50 个 extension 反而难找。

---

## 十四、泛型

```dart
class Stack<T> {
  final _items = <T>[];
  void push(T item) => _items.add(item);
  T pop() => _items.removeLast();
}

final s = Stack<int>();
s.push(1);
```

### 泛型方法

```dart
T firstOrDefault<T>(List<T> list, T def) => list.isEmpty ? def : list.first;
```

### 类型约束

```dart
class Repository<T extends Entity> {
  Future<T> get(String id);
}
```

`T extends Entity` 表示 T 必须是 Entity 或其子类。

---

## 十五、async / await / Future / Stream(简介)

```dart
Future<User> fetch() async {
  final r = await dio.get('/me');
  return User.fromJson(r.data);
}

Stream<int> counter() async* {
  for (var i = 0; i < 5; i++) {
    await Future.delayed(const Duration(seconds: 1));
    yield i;
  }
}

await for (final i in counter()) print(i);
```

详细写法在 29 那篇。

---

## 十六、操作符重载

```dart
class Vector {
  final double x, y;
  const Vector(this.x, this.y);

  Vector operator +(Vector o) => Vector(x + o.x, y + o.y);
  Vector operator *(double k) => Vector(x * k, y * k);

  @override
  bool operator ==(Object o) => o is Vector && o.x == x && o.y == y;
  @override
  int get hashCode => Object.hash(x, y);
}

print(Vector(1,2) + Vector(3,4));    // Vector(4,6)
```

---

## 十七、异常

```dart
try {
  doSomething();
} on FormatException catch (e) {
  // 特定类型
  print(e.message);
} on Exception catch (e, st) {
  // 任何 Exception,带堆栈
  print('$e\n$st');
} catch (e) {
  // 任何 throw
} finally {
  cleanup();
}

throw ArgumentError('invalid');
throw 'just a string';      // ⚠️ 不推荐,但合法
```

Dart 不强制 checked exception,**自由但容易漏掉错误处理**。

---

## 十八、空安全(简介)

```dart
String name = '张三';        // 不能为 null
String? maybeName;          // 可以为 null

print(name.length);
print(maybeName.length);    // ❌ 编译错
print(maybeName?.length);   // null 安全
print(maybeName!.length);   // 强制非 null,如果是 null 就崩
```

详细在 29 那篇。

---

## 十九、库与 import

```dart
// my_lib.dart
library my_lib;

export 'src/foo.dart';        // 暴露给外部

// user.dart
import 'package:my_app/models/user.dart';
import 'package:my_app/api.dart' as api;     // 重命名
import 'dart:async';
import 'dart:io' show File;                  // 只导入 File
import 'utils.dart' hide debug;              // 隐藏 debug
```

---

## 二十、常用工具

```dart
// 类型转换
int.parse('42');
int.tryParse('xyz');         // null
double.parse('3.14');
'42'.padLeft(5, '0');

// 时间
DateTime.now();
DateTime.parse('2026-05-02');
duration.inSeconds;
Stopwatch().start();

// 比较
[1, 2, 3].sort((a, b) => a.compareTo(b));

// 同步迭代
for (final (i, v) in list.indexed) print('$i: $v');
```

---

## 二十一、和已学知识的串联

- `const` Widget 性能(05、18)
- mixin 在 SingleTickerProviderStateMixin(15)
- sealed + switch 写 Bloc 状态(10)
- record 适合 Bloc 简单返回值
- extension on BuildContext 简化访问
- 泛型给 Repository / Cubit 带类型(21)

---

## 二十二、心智模型

```
Dart 是
  Java 的类系统
+ JS 的类型推断
+ TS 的可选类型
+ Kotlin 的简洁
+ async/await
+ 模式匹配 + sealed
```

学 Dart 不需要花太多时间,但**这些细节(const / mixin / sealed / record / extension)用熟之后,Flutter 代码会从"能跑"变成"舒服"**。

写每个 Widget 都问问自己:
1. 这里能 const 吗?
2. 这里 List 字面量 + spread 是不是更简洁?
3. 这个数据用 record 够不够,要不要类?
4. 这个状态用 sealed 是不是更安全?

慢慢就建立起 Dart 的"语感"。
