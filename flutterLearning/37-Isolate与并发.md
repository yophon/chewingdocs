# Flutter Isolate 与并发

Dart 是**单线程模型**。所有代码默认跑在 main isolate(俗称 UI 线程)。重活(JSON 解析、加解密、图像处理、复杂计算)会卡 UI——掉帧、按钮无反应。

解决方案:**Isolate**。Dart 的"线程",但**不共享内存**,通过消息通信。

---

## 一、为什么不是 Thread

```
传统线程    : 共享内存,需要锁,容易死锁 / 数据竞争
Isolate    : 隔离堆,通过消息通信,无竞态
```

Isolate ≈ 进程级别的隔离 + 消息传递。**永远没有锁的概念**,代价是数据要拷贝。

---

## 二、最简单:compute()

最高频的用法。给一个函数和参数,在新 isolate 里跑,拿到结果:

```dart
import 'package:flutter/foundation.dart';

// 重活
int heavyWork(int n) {
  var sum = 0;
  for (var i = 0; i < n; i++) sum += i;
  return sum;
}

// 在 isolate 里跑,不卡 UI
final result = await compute(heavyWork, 1000000000);
```

### 典型场景:JSON 解析

```dart
final List<User> users = await compute(_parseUsers, jsonString);

List<User> _parseUsers(String jsonStr) {
  final list = jsonDecode(jsonStr) as List;
  return list.map((e) => User.fromJson(e)).toList();
}
```

---

## 三、Isolate.run(Dart 2.19+,推荐)

更现代的 API,**不需要 top-level 函数**:

```dart
final result = await Isolate.run(() => heavyWork(1000000000));

// 闭包也行(局部变量会被拷贝过去)
final n = 1000000000;
final result = await Isolate.run(() {
  var sum = 0;
  for (var i = 0; i < n; i++) sum += i;
  return sum;
});
```

`Isolate.run` 内部就是创建 isolate + 收消息的封装,API 比 `compute` 更友好。

---

## 四、compute / Isolate.run 的限制

### 1. 函数必须是 top-level 或 static

```dart
// ✅
int parse(String s) => int.parse(s);
await compute(parse, '42');

class Foo {
  static int parseStatic(String s) => int.parse(s);    // ✅
  int parseInstance(String s) => int.parse(s);          // ❌ 实例方法
}
```

`Isolate.run` 用闭包就没这个限制。

### 2. 参数必须是"可序列化"

Dart 把参数从 main isolate **复制**到新 isolate(深拷贝)。
能复制的类型:基本类型、List/Map/Set 嵌套、String、`SendPort`、`Uint8List`、freezed / 简单类。
**不能**:UI 对象(BuildContext / Widget)、原生 handle、StreamSubscription、Lambda 引用了 main isolate 的可变状态。

```dart
await compute((_) {
  print(context);    // ❌ context 不能跨 isolate
}, null);
```

### 3. 启动有开销

每次 `compute` ~ 几十毫秒启动新 isolate。**短任务不要用**(直接同步反而快)。

---

## 五、判断"该不该用 isolate"

```
任务时长          建议
< 16ms           别用 isolate(直接同步)
16ms ~ 100ms     看情况(掉一两帧用户感觉不到)
> 100ms          强烈建议 isolate
> 1s             必须用 isolate(否则用户觉得 App 死了)
```

实测:profile 模式下卡多少毫秒。

---

## 六、长期 Isolate:SendPort + ReceivePort

`compute` 是"一次性"。需要长期跑(如后台计算服务)用底层 API:

```dart
import 'dart:isolate';

void main() async {
  final receivePort = ReceivePort();

  // 启动 isolate
  await Isolate.spawn(_workerEntry, receivePort.sendPort);

  // 拿到对方的 sendPort
  final sendPort = await receivePort.first as SendPort;

  // 创建一个用来接对方回复的端口
  final responsePort = ReceivePort();
  sendPort.send([42, responsePort.sendPort]);

  final result = await responsePort.first;
  print(result);     // 84
}

// 在新 isolate 里跑
void _workerEntry(SendPort initialSendPort) {
  final receivePort = ReceivePort();
  initialSendPort.send(receivePort.sendPort);

  receivePort.listen((msg) {
    final value = msg[0] as int;
    final replyTo = msg[1] as SendPort;
    replyTo.send(value * 2);
  });
}
```

很啰嗦,**99% 的项目用 compute / Isolate.run 就够**。

---

## 七、Isolate 之间的数据共享(实验性)

Dart 3.5+ 引入 `Isolate.runSynchronously`(部分共享场景)和 `TransferableTypedData`(高效传二进制),但**绝大多数项目不需要**。

```dart
// 用 TransferableTypedData 零拷贝传 byte
final bytes = Uint8List(1024 * 1024);
final transferable = TransferableTypedData.fromList([bytes]);
sendPort.send(transferable);
// 接收方:
final data = transferable.materialize();
```

适合:大文件、图像数据传给后台处理。

---

## 八、Isolate 池:flutter_isolate

每次 `compute` 启动新 isolate 浪费,需要长期运行 / 多任务复用 isolate 用 **isolate 池**:

```yaml
dependencies:
  worker_manager: ^7.0.0
```

```dart
final result = await workerManager.execute<int>(
  () => heavyWork(),
  priority: WorkPriority.high,
);

// 取消任务
workerManager.cancel(taskId);
```

或自己用 `IsolateNameServer` + 长期 spawn,适合大型项目。

---

## 九、Flutter 包里的 isolate 用法

### 1. JSON 大文件解析

```dart
Future<List<User>> parseUsers(String json) async {
  if (json.length < 10000) {
    return _parse(json);            // 短直接同步
  }
  return await compute(_parse, json);
}

List<User> _parse(String json) =>
    (jsonDecode(json) as List).map((e) => User.fromJson(e)).toList();
```

### 2. 图像处理

```dart
Future<Uint8List> resize(Uint8List bytes, int width) async {
  return await compute(_resize, [bytes, width]);
}

Uint8List _resize(List args) {
  final img = decodeImage(args[0]);
  final resized = copyResize(img!, width: args[1]);
  return encodeJpg(resized);
}
```

### 3. 加解密

```dart
final cipherBytes = await compute(_encrypt, [plainBytes, key]);
```

### 4. 复杂搜索 / 排序

```dart
final filtered = await compute<_Args, List<Item>>(_filterAndSort, _Args(items, query));
```

---

## 十、平台通道与 Isolate

回顾 16:平台通道默认在 main isolate。如果你在 isolate 里调:

```dart
await Isolate.run(() async {
  await channel.invokeMethod('foo');   // ⚠️ Flutter 3.7+ 才支持后台 isolate 用 channel
});
```

Flutter 3.7+ 引入 `BackgroundIsolateBinaryMessenger`,可以在后台 isolate 调 channel。低于 3.7 必须回主 isolate。

---

## 十一、Stream 和 Isolate

`compute` 只返回一次结果。需要持续推送用 `Isolate` + `Stream`:

```dart
Stream<int> heavyStream(int n) async* {
  final port = ReceivePort();
  await Isolate.spawn((SendPort sp) {
    for (var i = 0; i < n; i++) {
      sp.send(i * i);
    }
    Isolate.exit(sp);
  }, port.sendPort);

  await for (final msg in port) {
    yield msg as int;
  }
}
```

---

## 十二、UI 与 Isolate 协同

典型模式:

```dart
class _PageState extends State<MyPage> {
  bool _loading = false;
  List<User>? _users;

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final json = await dio.get('/users');
      final users = await compute(_parse, json.data);     // 后台解析
      if (!mounted) return;
      setState(() {
        _users = users;
        _loading = false;
      });
    } catch (e, st) {
      Sentry.captureException(e, stackTrace: st);
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }
}
```

Bloc / Riverpod 同理:`emit(loading)` → `await compute(parse, data)` → `emit(success)`。

---

## 十三、性能测试技巧

### Stopwatch 测耗时

```dart
final sw = Stopwatch()..start();
await heavy();
sw.stop();
print('耗时:${sw.elapsedMilliseconds}ms');
```

### Timeline.startSync(看 DevTools)

```dart
import 'dart:developer';

Timeline.startSync('parse JSON');
final result = parse(json);
Timeline.finishSync();
```

DevTools Performance 看到 'parse JSON' 这一段标记。

---

## 十四、并发陷阱

### 1. 共享可变状态

```dart
List<int> _shared = [];

void main() async {
  Isolate.spawn((_) async {
    _shared.add(1);    // ❌ 不会真的改 main 的列表
  }, null);
}
```

不同 isolate 各自有副本,**修改不互通**。

### 2. 闭包捕获 Future / Stream

```dart
final stream = controller.stream;
await Isolate.run(() {
  stream.listen(...);    // ❌ stream 不能跨 isolate
});
```

### 3. 在 isolate 里用 path_provider 等需要原生

Flutter 3.7- 平台通道只能在 main isolate。Plugin 默认假设主 isolate,在子 isolate 里可能 hang。

### 4. compute 启动慢

短任务(< 50ms)别用 compute,纯粹浪费。

---

## 十五、async vs Isolate 的区分

很多新人混淆:`async` 不是多线程,**只是事件循环上的异步**。

```dart
Future<void> doMany() async {
  await wait1();        // 让出 event loop,等回调
  await wait2();
  await wait3();
}
```

`await wait1()` 让出 main isolate,让其他事件先跑(包括 UI 重绘)。**它没开新线程**。

CPU 密集任务 `async` 救不了——你写 `for` 循环再 `await`,循环本身仍然在 main isolate 跑,UI 还是卡。

```dart
// ❌ 仍然卡 UI
Future<int> sum(int n) async {
  var s = 0;
  for (var i = 0; i < n; i++) s += i;    // 同步循环,即使在 async 里
  return s;
}

// ✅
Future<int> sum(int n) => Isolate.run(() {
  var s = 0;
  for (var i = 0; i < n; i++) s += i;
  return s;
});
```

**记住**:`async` 是协作式调度,`Isolate` 是真正的并发。

---

## 十六、Isolate vs Web Worker(Web 平台)

Flutter Web 上的 Isolate 实际是 Web Worker。功能受限:
- 不能用 dart:io
- 不能直接传 DOM 对象
- 部分 plugin 不工作

`compute` 在 Web 上仍可用,但要测试。

---

## 十七、推荐使用建议

```
日常 99% 场景
  ├─ 大 JSON 解析 → compute
  ├─ 图像处理     → compute
  ├─ 加解密       → compute
  └─ 复杂运算     → Isolate.run

需要长期任务 / 多任务复用 isolate
  ├─ 自己写 spawn + ReceivePort(灵活)
  └─ worker_manager(简洁)

完全不需要 isolate
  ├─ 网络请求(底层已经异步)
  ├─ 数据库读写(Drift / Hive 内部已异步)
  └─ 普通业务逻辑
```

---

## 十八、和已学知识的串联

- 性能优化(18)的核心建议之一就是"重活进 isolate"
- 测试(20)里 `compute` 的函数容易单测
- 错误处理(36):isolate 里抛错会传到 await 处
- JSON freezed(34)+ compute = 最佳解析体验
- Dio 大数据 + compute 解析(13)

---

## 十九、心智模型

```
Dart 并发模型:
  一个 main isolate 跑 UI + 业务
  其他 isolate 跑重活
  通信只能用消息(send / receive)
  数据自动深拷贝,无共享内存

判断要不要 isolate:
  ├─ 任务 > 100ms?
  ├─ 任务跑 main 时 UI 会卡吗?
  └─ 是 → isolate;否 → 直接同步
```

**Flutter 卡顿的常见原因:在 main isolate 跑了不该跑的重活**。`compute` / `Isolate.run` 是大杀器,平时记着这个工具,需要时一行就解决。

到这里,Flutter 的"基础底盘"也补完整了——从 Dart 语言到布局原理到工程化全套。配合前 27 篇,任何 Flutter 项目你都能从无到有搭起来。
