# GetX 详解:从入门到取舍

GetX(包名 `get`)是一个**全家桶式**的 Flutter 库,把状态管理、路由、依赖注入、国际化、主题、对话框、网络请求……全都打包了。一句话:**用最少的代码做最多的事**。

它在国内尤其流行,但社区争议也大。学完之后你自己判断要不要用。

---

## 一、安装与初始化

```yaml
# pubspec.yaml
dependencies:
  get: ^4.6.6
```

把 `MaterialApp` 换成 `GetMaterialApp`(只为了用路由和对话框,状态管理本身不强制):

```dart
void main() {
  runApp(GetMaterialApp(
    home: HomePage(),
  ));
}
```

---

## 二、GetX 的三大核心

```
GetX
 ├─ 状态管理(State Management)
 ├─ 路由管理(Route Management)
 └─ 依赖注入(Dependency Injection)
```

它最大的卖点是:**这三件事用同一套 API、互相打通**。

---

## 三、状态管理

GetX 提供两种风格,自己选。

### 风格 1:响应式(Reactive)—— 最常用

给变量加 `.obs` 后缀,它就变成"可观察的"。UI 用 `Obx(() => ...)` 包裹,变量变了 UI 自动刷新。

```dart
// 1. 控制器:业务逻辑写这里
class CounterController extends GetxController {
  var count = 0.obs;       // 加 .obs 就变成响应式
  var name = '游客'.obs;

  void increment() => count++;
  void rename(String n) => name.value = n;
}

// 2. 页面
class CounterPage extends StatelessWidget {
  // 注意:整个页面是 StatelessWidget!
  final c = Get.put(CounterController());  // 注入并获取实例

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          Text('这一行不会刷新'),  // 静态部分

          Obx(() => Text('${c.count}')),    // 只有这里随 count 刷新
          Obx(() => Text(c.name.value)),    // 这里随 name 刷新

          ElevatedButton(
            onPressed: c.increment,
            child: Text('+1'),
          ),
        ],
      ),
    );
  }
}
```

**关键点**:
- `int`、`String`、`bool` 加 `.obs` → 用 `c.count++` 或 `c.name.value = 'xx'` 修改
- 自定义对象加 `.obs` → 必须用 `.value` 访问
- `Obx` 自动收集闭包里用到的所有 `.obs` 变量,任意一个变都会重建

> 这个理念和你刚学的 `ValueNotifier + ValueListenableBuilder` **一模一样**,只是 API 更甜。

### 响应式列表/Map

```dart
var items = <String>[].obs;
items.add('apple');        // 自动通知
items.removeAt(0);         // 自动通知

var user = {'name': '张三'}.obs;
user['age'] = 18;          // 自动通知
```

### 风格 2:简单状态(GetBuilder)—— 手动通知

类似你学过的 `ChangeNotifier`,需要自己调 `update()`。

```dart
class CounterController extends GetxController {
  int count = 0;            // 不加 .obs

  void increment() {
    count++;
    update();               // 手动通知
  }
}

// 使用
GetBuilder<CounterController>(
  init: CounterController(),
  builder: (c) => Text('${c.count}'),
)
```

**对比**:`Obx` 性能更好(细粒度)、写得少;`GetBuilder` 内存占用更低(没有 Stream)、可控性强。

---

## 四、依赖注入

这是 GetX 最被低估的部分,但其实是它最优雅的设计。

```dart
// 注入(三种生命周期)
Get.put(CounterController());        // 立即创建,常驻内存
Get.lazyPut(() => UserController()); // 第一次用到才创建
Get.create(() => ItemController());  // 每次 Get.find 都新建一个

// 取出(任何地方都能拿,不需要 BuildContext!)
final c = Get.find<CounterController>();
```

### 这意味着什么?

```dart
// 在任何工具类、Service、甚至另一个 Controller 里
class ApiService {
  void onLoginSuccess(User u) {
    Get.find<UserController>().setUser(u);   // 直接拿,不用 context
    Get.find<CartController>().reload();
  }
}
```

**这是 GetX 让人上瘾的核心** —— 写起来像全局变量,但其实管理着生命周期。

> ⚠️ 同时也是它**最被批评**的点:Service Locator 模式让依赖关系变得隐式,大型项目里追溯困难、单元测试更复杂。

---

## 五、路由管理

不需要 `BuildContext`,在任何地方都能跳页面、弹窗、显示 SnackBar。

### 跳转

```dart
Get.to(NextPage());                    // 普通跳转
Get.toNamed('/detail');                // 命名路由
Get.off(NextPage());                   // 跳转并销毁当前
Get.offAll(LoginPage());               // 清空栈跳转(常用于登出)
Get.back();                            // 返回
Get.back(result: 'data');              // 带返回值
```

### 弹窗 / 提示

```dart
// SnackBar(顶部条)
Get.snackbar('标题', '内容');

// AlertDialog
Get.defaultDialog(
  title: '确认',
  middleText: '要删除吗?',
  onConfirm: () { ... },
);

// BottomSheet
Get.bottomSheet(Container(...));
```

**你看,完全没有 `context` 参数**。这就是 GetX 让代码变短的另一个原因。

### 命名路由 + 参数 + 中间件

```dart
GetMaterialApp(
  initialRoute: '/',
  getPages: [
    GetPage(name: '/', page: () => HomePage()),
    GetPage(
      name: '/user/:id',                   // 路径参数
      page: () => UserPage(),
      middlewares: [AuthMiddleware()],     // 路由守卫
    ),
  ],
)

// 跳转 + 传参
Get.toNamed('/user/42?from=home');

// 接收
final id = Get.parameters['id'];          // 路径参数
final from = Get.parameters['from'];      // query 参数
```

---

## 六、Bindings:把"路由 → 依赖"绑在一起

这是 GetX 推崇的"工程化"模式。每个页面对应一个 Binding,声明这个页面需要哪些 Controller。

```dart
class HomeBinding extends Bindings {
  @override
  void dependencies() {
    Get.lazyPut(() => HomeController());
    Get.lazyPut(() => UserController());
  }
}

GetPage(
  name: '/home',
  page: () => HomePage(),
  binding: HomeBinding(),     // 进入页面时自动注入,离开时自动销毁
)
```

**好处**:Controller 跟着页面活,不会泄漏内存;不用手动 `dispose`。

---

## 七、其他常用工具

| 功能 | API |
| --- | --- |
| 主题 | `Get.changeTheme(ThemeData.dark())` |
| 国际化 | `'hello'.tr`、`Get.updateLocale(Locale('en'))` |
| 屏幕信息 | `Get.width`、`Get.height`、`Get.context` |
| 平台判断 | `GetPlatform.isAndroid` |
| 网络请求 | `GetConnect`(自带 HTTP 客户端) |
| 本地存储 | `GetStorage`(独立包,基于内存映射) |

---

## 八、完整示例:一个购物车

```dart
// 1. 商品 Model
class Product {
  final String name;
  final double price;
  Product(this.name, this.price);
}

// 2. Controller
class CartController extends GetxController {
  var items = <Product>[].obs;

  double get total => items.fold(0, (sum, p) => sum + p.price);

  void add(Product p) {
    items.add(p);
    Get.snackbar('已加入', p.name);     // 任何地方都能弹提示
  }

  void remove(Product p) => items.remove(p);
}

// 3. 商品列表页
class ShopPage extends StatelessWidget {
  final cart = Get.put(CartController());

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        actions: [
          // 购物车小红点
          Obx(() => Badge(
            label: Text('${cart.items.length}'),
            child: IconButton(
              icon: Icon(Icons.shopping_cart),
              onPressed: () => Get.to(CartPage()),
            ),
          )),
        ],
      ),
      body: ListView(
        children: [
          ListTile(
            title: Text('苹果 ¥5'),
            onTap: () => cart.add(Product('苹果', 5)),
          ),
          ListTile(
            title: Text('香蕉 ¥3'),
            onTap: () => cart.add(Product('香蕉', 3)),
          ),
        ],
      ),
    );
  }
}

// 4. 购物车页(注意它没 put,直接 find)
class CartPage extends StatelessWidget {
  final cart = Get.find<CartController>();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('购物车')),
      body: Column(
        children: [
          Expanded(
            child: Obx(() => ListView(
              children: cart.items
                  .map((p) => ListTile(
                        title: Text(p.name),
                        trailing: IconButton(
                          icon: Icon(Icons.delete),
                          onPressed: () => cart.remove(p),
                        ),
                      ))
                  .toList(),
            )),
          ),
          Obx(() => Text('总计:¥${cart.total}')),
        ],
      ),
    );
  }
}
```

注意几个细节:
- 整个 App **没有一个 StatefulWidget**
- 跨页面共享数据靠 `Get.put` / `Get.find`,没有 Provider 层级嵌套
- 跳转、弹窗都不用 `context`

---

## 九、GetX 的优势 vs 争议

### ✅ 优势

1. **代码量少**:一个项目能少写 30%~50% 的样板
2. **学习曲线平缓**:不用懂 InheritedWidget、Stream、依赖注入容器
3. **不用 context**:写工具类、跨层调用很爽
4. **生态完整**:状态、路由、网络、存储、国际化全包了

### ⚠️ 争议(必须知道)

1. **违反 Flutter 设计哲学**
   `Get.find` 本质是全局 Service Locator,绕过了 Widget 树的依赖传递,这跟 Flutter 提倡的 "Widget 树即依赖图" 是冲突的。

2. **隐式依赖,大型项目难维护**
   你看一个 Controller,不知道它从哪里被注入、被谁用,只能靠搜索 `Get.find`。

3. **测试相对困难**
   全局单例难 mock,集成测试需要小心管理 `Get.reset()`。

4. **作者风格强势**
   PR 流程不规范,曾发生过把社区贡献吞掉的争议,部分核心开发者退出。这影响了它在国际社区的口碑。

5. **过度封装**
   `Get.snackbar`、`Get.dialog` 用起来爽,但定制起来不如原生 API 灵活。

---

## 十、什么时候用 / 不用

| 场景 | 建议 |
| --- | --- |
| 个人项目、原型、学习 | ✅ 可以用,效率高 |
| 中小型商业 App、单人/小团队 | ✅ 适合,产出快 |
| 大型项目、长期维护、多人协作 | ⚠️ 谨慎,推荐 Riverpod 或 Bloc |
| 开源库 / SDK | ❌ 不要用,会污染下游用户 |
| 注重测试、严格分层架构 | ❌ Bloc 更合适 |

---

## 十一、和 Flutter 原生的对比

| 概念 | Flutter 原生 | GetX |
| --- | --- | --- |
| 可观察变量 | `ValueNotifier<int>` | `0.obs` |
| 监听刷新 | `ValueListenableBuilder` | `Obx(() => ...)` |
| 复杂模型 | `ChangeNotifier` + `notifyListeners()` | `GetxController` + `update()` |
| 跨层共享 | `InheritedWidget` | `Get.put` / `Get.find` |
| 跳转页面 | `Navigator.push(context, ...)` | `Get.to(...)` |
| 弹 SnackBar | 需要 `ScaffoldMessenger.of(context)` | `Get.snackbar(...)` |

**本质上 GetX 没有发明新东西**,它只是把 Flutter 已有的能力包装得"看起来更简单"。理解了原生,你就理解了 GetX 的全部魔法。
