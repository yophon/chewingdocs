# Flutter 基础 Widget 全家桶

Flutter 自带几百个 Widget,但**实际写日常页面用到的不超过 30 个**。本篇按"最常用 → 偶尔用"的顺序给一遍,每个配最简代码。

---

## 一、文本

### Text

```dart
Text('hello')

Text(
  '这是很长的标题',
  style: TextStyle(
    fontSize: 16,
    fontWeight: FontWeight.bold,
    color: Colors.blue,
    decoration: TextDecoration.underline,
    height: 1.5,            // 行高
    letterSpacing: 0.5,
    fontFamily: 'Inter',
  ),
  maxLines: 2,
  overflow: TextOverflow.ellipsis,    // 超出省略
  textAlign: TextAlign.center,
  softWrap: true,
)
```

### RichText(混合样式)

```dart
RichText(text: TextSpan(
  text: '点击 ',
  style: const TextStyle(color: Colors.black),
  children: [
    TextSpan(
      text: '这里',
      style: const TextStyle(color: Colors.blue),
      recognizer: TapGestureRecognizer()..onTap = () => ...,
    ),
    const TextSpan(text: ' 查看更多'),
  ],
))
```

### Text.rich(更简洁)

```dart
Text.rich(TextSpan(
  text: '你好,',
  children: [
    TextSpan(text: '张三', style: TextStyle(fontWeight: FontWeight.bold)),
  ],
))
```

### SelectableText(可复制)

```dart
SelectableText('这段文字可以复制')
```

---

## 二、图标 Icon

```dart
const Icon(Icons.star, size: 24, color: Colors.amber)

// 自定义图标(本地 svg / png)
Image.asset('assets/icons/custom.png', width: 24)

// SVG
SvgPicture.asset('assets/icons/star.svg')
```

注意 Icons 有 `Icons` (Material) 和 `CupertinoIcons`(iOS 风格)。

---

## 三、图片 Image

```dart
Image.network('https://...')                  // 网络
Image.asset('assets/img.png')                 // 资源
Image.file(File('/path/to.jpg'))              // 本地文件
Image.memory(bytes)                           // 内存字节

// 自适应
Image.network(
  url,
  fit: BoxFit.cover,                          // 充满,可能裁剪
  width: 100,
  height: 100,
  loadingBuilder: (_, child, progress) {
    if (progress == null) return child;
    return CircularProgressIndicator(value: progress.cumulativeBytesLoaded / (progress.expectedTotalBytes ?? 1));
  },
  errorBuilder: (_, __, ___) => const Icon(Icons.error),
)
```

### BoxFit 选项

| Fit | 行为 |
| --- | --- |
| `fill` | 填满,可能拉伸 |
| `contain` | 完整显示,留白 |
| `cover` | 充满,可能裁剪 |
| `fitWidth` | 宽度撑满 |
| `fitHeight` | 高度撑满 |
| `none` | 原大小,可能溢出 |
| `scaleDown` | 太大缩小,小的不放大 |

### 推荐用 cached_network_image

```dart
CachedNetworkImage(
  imageUrl: url,
  placeholder: (_, __) => const SizedBox(),
  errorWidget: (_, __, ___) => const Icon(Icons.error),
)
```

回顾 14 / 18:磁盘 + 内存缓存,自动优化。

### CircleAvatar

```dart
CircleAvatar(
  radius: 24,
  backgroundImage: NetworkImage(url),
  child: Text('张'),         // 没图时显示文字
)
```

---

## 四、容器:Container

最杂的 Widget,**能用更轻的替代就用替代**:

```dart
Container(
  width: 200,
  height: 100,
  margin: const EdgeInsets.all(8),
  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
  alignment: Alignment.center,
  decoration: BoxDecoration(
    color: Colors.blue,
    borderRadius: BorderRadius.circular(8),
    border: Border.all(color: Colors.black, width: 1),
    boxShadow: const [BoxShadow(blurRadius: 4)],
    gradient: const LinearGradient(colors: [Colors.red, Colors.blue]),
  ),
  child: Text('hi'),
)
```

### 可代替的轻量版

| 用途 | 用什么 |
| --- | --- |
| 只 padding | `Padding` |
| 只 margin | `Padding`(本质一样) |
| 只对齐 | `Center` / `Align` |
| 只 size | `SizedBox` |
| 只颜色 | `ColoredBox` |
| 只圆角 / 装饰 | `DecoratedBox` |

写小组件时**少用 Container**,用更明确的 Widget,可读性更好。

---

## 五、SizedBox / ColoredBox / Padding

```dart
const SizedBox(height: 16)              // 间距
const SizedBox.shrink()                  // 0x0,占位
const SizedBox.expand()                  // 充满父级
SizedBox.fromSize(size: const Size(100, 50))

const ColoredBox(color: Colors.red, child: ...)

const Padding(
  padding: EdgeInsets.all(8),
  child: ...,
)
```

---

## 六、Row / Column / Wrap / Stack

```dart
Row(
  mainAxisAlignment: MainAxisAlignment.spaceBetween,
  crossAxisAlignment: CrossAxisAlignment.center,
  children: [...],
)

Column(
  mainAxisSize: MainAxisSize.min,
  children: [...],
)

Wrap(
  spacing: 8,            // 横向间距
  runSpacing: 8,         // 换行间距
  children: tags.map((t) => Chip(label: Text(t))).toList(),
)

Stack(
  alignment: Alignment.center,
  children: [
    Container(color: Colors.blue),
    const Positioned(top: 0, right: 0, child: Icon(Icons.close)),
  ],
)
```

详细对齐规则回顾 30。

---

## 七、按钮

### Material 风格

```dart
ElevatedButton(
  onPressed: () {},
  child: const Text('确认'),
)

TextButton(
  onPressed: () {},
  child: const Text('取消'),
)

OutlinedButton(
  onPressed: () {},
  child: const Text('编辑'),
)

IconButton(
  icon: const Icon(Icons.menu),
  onPressed: () {},
)

FloatingActionButton(
  onPressed: () {},
  child: const Icon(Icons.add),
)
```

### onPressed: null 表示禁用

```dart
ElevatedButton(
  onPressed: _canSubmit ? _submit : null,    // null 时变灰
  child: const Text('提交'),
)
```

### 自定义样式

```dart
ElevatedButton(
  style: ElevatedButton.styleFrom(
    backgroundColor: Colors.red,
    foregroundColor: Colors.white,
    minimumSize: const Size.fromHeight(48),
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
  ),
  onPressed: () {},
  child: const Text('登录'),
)
```

或在 Theme 全局配置(回顾 17):

```dart
ThemeData(
  elevatedButtonTheme: ElevatedButtonThemeData(
    style: ElevatedButton.styleFrom(...),
  ),
)
```

### Cupertino 风格

```dart
CupertinoButton(
  onPressed: () {},
  child: const Text('确认'),
)
```

---

## 八、输入框

### TextField

```dart
TextField(
  decoration: const InputDecoration(
    labelText: '邮箱',
    hintText: '请输入邮箱',
    prefixIcon: Icon(Icons.email),
    border: OutlineInputBorder(),
  ),
  keyboardType: TextInputType.emailAddress,
  textInputAction: TextInputAction.next,    // 键盘"下一步"
  obscureText: false,                       // 密码输入框 true
  maxLength: 50,
  onChanged: (v) => print(v),
  onSubmitted: (v) => print('回车 $v'),
)
```

### TextEditingController

控制 / 读取输入值:

```dart
class _MyState extends State<MyForm> {
  final _ctrl = TextEditingController();

  @override
  void dispose() {
    _ctrl.dispose();        // ⚠️ 必须释放
    super.dispose();
  }

  @override
  Widget build(_) => Column(children: [
    TextField(controller: _ctrl),
    ElevatedButton(
      onPressed: () => print(_ctrl.text),
      child: const Text('提交'),
    ),
  ]);
}
```

### TextFormField + Form(表单验证)

```dart
final _formKey = GlobalKey<FormState>();

Form(
  key: _formKey,
  child: Column(children: [
    TextFormField(
      validator: (v) => (v == null || v.isEmpty) ? '不能为空' : null,
    ),
    ElevatedButton(
      onPressed: () {
        if (_formKey.currentState!.validate()) {
          // 通过验证
        }
      },
      child: const Text('提交'),
    ),
  ]),
)
```

回顾 07:GlobalKey 在这里的典型用法。

---

## 九、选择类

### Switch / Checkbox / Radio

```dart
Switch(value: _on, onChanged: (v) => setState(() => _on = v))
Checkbox(value: _checked, onChanged: (v) => setState(() => _checked = v!))

Radio<int>(value: 1, groupValue: _selected, onChanged: ...)
```

### CheckboxListTile / SwitchListTile(带文字)

```dart
CheckboxListTile(
  title: const Text('记住我'),
  value: _remember,
  onChanged: (v) => setState(() => _remember = v ?? false),
)

SwitchListTile(
  title: const Text('深色模式'),
  value: _dark,
  onChanged: ...,
)
```

### Slider

```dart
Slider(
  value: _value,
  min: 0, max: 100,
  divisions: 10,            // 分段
  label: _value.toStringAsFixed(0),
  onChanged: (v) => setState(() => _value = v),
)
```

### DropdownButton

```dart
DropdownButton<String>(
  value: _selected,
  items: const [
    DropdownMenuItem(value: 'a', child: Text('A')),
    DropdownMenuItem(value: 'b', child: Text('B')),
  ],
  onChanged: (v) => setState(() => _selected = v),
)
```

---

## 十、列表项 ListTile

```dart
ListTile(
  leading: const Icon(Icons.person),
  title: const Text('张三'),
  subtitle: const Text('zhang3@example.com'),
  trailing: const Icon(Icons.chevron_right),
  onTap: () {},
)
```

---

## 十一、卡片 Card

```dart
Card(
  elevation: 2,
  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
  child: Padding(
    padding: const EdgeInsets.all(16),
    child: Column(...),
  ),
)
```

---

## 十二、Chip

```dart
Chip(label: Text('Flutter'))

ActionChip(label: Text('删除'), onPressed: () {})

InputChip(
  label: Text('张三'),
  onDeleted: () {},
  avatar: const CircleAvatar(child: Text('张')),
)

FilterChip(
  label: Text('选项'),
  selected: _selected,
  onSelected: (v) => setState(() => _selected = v),
)
```

---

## 十三、Tab

```dart
DefaultTabController(
  length: 3,
  child: Scaffold(
    appBar: AppBar(
      bottom: const TabBar(tabs: [
        Tab(text: '推荐'),
        Tab(text: '关注'),
        Tab(text: '热门'),
      ]),
    ),
    body: const TabBarView(children: [
      Center(child: Text('推荐')),
      Center(child: Text('关注')),
      Center(child: Text('热门')),
    ]),
  ),
)
```

或自己管 `TabController`,跨页面共享。

---

## 十四、AppBar

```dart
AppBar(
  title: const Text('首页'),
  centerTitle: true,
  leading: IconButton(icon: const Icon(Icons.menu), onPressed: () {}),
  actions: [
    IconButton(icon: const Icon(Icons.search), onPressed: () {}),
    IconButton(icon: const Icon(Icons.more_vert), onPressed: () {}),
  ],
  bottom: const TabBar(...),
  flexibleSpace: ...,    // 折叠时显示的内容
)
```

### Sliver 版

```dart
SliverAppBar(
  expandedHeight: 200,
  pinned: true,            // 折叠后是否保留
  flexibleSpace: const FlexibleSpaceBar(
    title: Text('详情'),
    background: Image.network('...'),
  ),
)
```

回顾 32。

---

## 十五、Scaffold

```dart
Scaffold(
  appBar: AppBar(...),
  body: ...,
  drawer: Drawer(child: ...),                       // 左侧抽屉
  endDrawer: Drawer(child: ...),                    // 右侧
  bottomNavigationBar: BottomNavigationBar(...),
  floatingActionButton: FloatingActionButton(...),
  floatingActionButtonLocation: FloatingActionButtonLocation.centerDocked,
  bottomSheet: ...,                                  // 永久底栏
  resizeToAvoidBottomInset: true,                   // 键盘弹起时调整
)
```

---

## 十六、底部导航 BottomNavigationBar / NavigationBar

### Material 2 旧版

```dart
BottomNavigationBar(
  currentIndex: _idx,
  onTap: (i) => setState(() => _idx = i),
  items: const [
    BottomNavigationBarItem(icon: Icon(Icons.home), label: '首页'),
    BottomNavigationBarItem(icon: Icon(Icons.person), label: '我的'),
  ],
)
```

### Material 3 新版

```dart
NavigationBar(
  selectedIndex: _idx,
  onDestinationSelected: (i) => setState(() => _idx = i),
  destinations: const [
    NavigationDestination(icon: Icon(Icons.home), label: '首页'),
    NavigationDestination(icon: Icon(Icons.person), label: '我的'),
  ],
)
```

回顾 17:M3 推荐用 NavigationBar。

---

## 十七、Dialog / Sheet

### AlertDialog

```dart
showDialog(
  context: context,
  builder: (_) => AlertDialog(
    title: const Text('确认'),
    content: const Text('要删除吗?'),
    actions: [
      TextButton(child: const Text('取消'), onPressed: () => Navigator.pop(context)),
      ElevatedButton(child: const Text('确定'), onPressed: () => Navigator.pop(context, true)),
    ],
  ),
);

// 等返回值
final result = await showDialog<bool>(...);
if (result == true) ...
```

### ModalBottomSheet

```dart
showModalBottomSheet(
  context: context,
  builder: (_) => Container(
    padding: const EdgeInsets.all(16),
    child: const Text('底部内容'),
  ),
);
```

### SnackBar

```dart
ScaffoldMessenger.of(context).showSnackBar(
  const SnackBar(content: Text('已保存')),
);

// 带操作
ScaffoldMessenger.of(context).showSnackBar(
  SnackBar(
    content: const Text('已删除'),
    action: SnackBarAction(label: '撤销', onPressed: () {}),
  ),
);
```

---

## 十八、加载指示器

```dart
const CircularProgressIndicator()                  // 圈
const LinearProgressIndicator()                    // 条

// 带进度
CircularProgressIndicator(value: 0.5)              // 50%

// iOS 风格
const CupertinoActivityIndicator()
```

---

## 十九、视觉装饰

### Divider

```dart
const Divider(thickness: 1, color: Colors.grey)
const VerticalDivider(width: 1)        // 在 Row 里
```

### Badge

```dart
const Badge(
  label: Text('3'),
  child: Icon(Icons.notifications),
)
```

### Tooltip

```dart
const Tooltip(
  message: '设置',
  child: Icon(Icons.settings),
)
```

---

## 二十、Visibility / Offstage

```dart
Visibility(
  visible: _show,
  child: Text('hi'),
)

// 不占空间
Visibility(
  visible: _show,
  maintainSize: false,
  child: Text('hi'),
)

// 完全脱离布局,但保留 State
Offstage(offstage: !_show, child: Text('hi'))
```

---

## 二十一、SafeArea

```dart
SafeArea(
  child: Scaffold(...),
)
```

避开刘海、状态栏、底部 home 条。Scaffold 默认已经处理一部分,但顶部 / 底部自定义内容时手动包。

---

## 二十二、ClipRRect / ClipOval / ClipPath

```dart
// 圆角裁剪
ClipRRect(
  borderRadius: BorderRadius.circular(12),
  child: Image.network(url),
)

// 圆形
ClipOval(child: Image.network(url))

// 自定义路径
ClipPath(
  clipper: MyClipper(),
  child: ...,
)
```

注:Container 用 `decoration: BoxDecoration(borderRadius: ...)` 加圆角时,**子级图片不会跟着圆角**(会溢出)。需要 ClipRRect 包裹。

---

## 二十三、Hero(共享元素)

```dart
// 列表页
Hero(tag: 'photo-1', child: Image.network(thumbUrl))

// 详情页
Hero(tag: 'photo-1', child: Image.network(fullUrl))
```

回顾 15。

---

## 二十四、ConstrainedBox / FractionallySizedBox / AspectRatio

```dart
ConstrainedBox(
  constraints: const BoxConstraints(maxWidth: 600),
  child: ...,
)

FractionallySizedBox(
  widthFactor: 0.8,         // 80% 宽
  child: ...,
)

AspectRatio(
  aspectRatio: 16 / 9,
  child: Image.network(url),
)
```

回顾 30。

---

## 二十五、Builder / StatefulBuilder

```dart
Builder(builder: (context) {
  // 这个 context 比外层深一层
  return Text('${Theme.of(context).colorScheme.primary}');
})

// 局部 StatefulWidget
StatefulBuilder(builder: (_, setLocalState) {
  return Switch(
    value: _v,
    onChanged: (n) => setLocalState(() => _v = n),
  );
})
```

回顾 04:Builder 是 context 的"瑞士军刀"。

---

## 二十六、AnimatedXxx / Transition(回顾 15)

```dart
AnimatedContainer(...)
AnimatedOpacity(...)
AnimatedSwitcher(...)
FadeTransition(...)
SlideTransition(...)
```

---

## 二十七、推荐熟练顺序

```
第 1 周  Text / Icon / Image / Container
        Row / Column / SizedBox / Padding / Center
        ElevatedButton / TextField / Scaffold / AppBar

第 2 周  ListView / ListTile / Card / Chip
        Stack / Positioned / Wrap
        Switch / Checkbox / Slider / DropdownButton

第 3 周  Dialog / SnackBar / BottomSheet
        Tab / NavigationBar / Drawer
        Form + TextFormField

第 4 周  Hero / AnimatedXxx / Sliver
        ClipRRect / Builder / StatefulBuilder
        各种 Constraint / IntrinsicXxx
```

四周后基础 Widget 你就熟透了,做日常页面随手就来。

---

## 二十八、查 Widget 的方式

不知道有没有现成的 Widget 实现某需求?
- **官方文档**:https://docs.flutter.dev/reference/widgets
- **Flutter Catalog App**(开源 App,展示所有 Widget)
- **DevTools Widget Inspector** 看现成 Flutter App 怎么搭
- **直接在 IDE 用 `Type.subclasses`** 看 `StatelessWidget` 的子类

---

## 二十九、和已学知识的串联

- 这些 Widget 的渲染本质都是三棵树(05)
- 有状态的(TextField、Switch)需要 dispose Controller(06)
- 列表项加 Key(07)
- ConstrainedBox / Padding 等都是约束系统(30)的具象化
- 性能(18):能 const 全 const,大列表用 builder
- 主题(17)管控所有 Widget 风格

---

## 三十、心智模型

```
学 Widget 不是背 API,是建立"看到需求 → 想到什么 Widget 组合"的反射

UI 描述                    工具
─────────                 ────────────
横向排几个东西              Row + 间距
纵向                       Column
重叠                       Stack + Positioned
留间距                     Padding / SizedBox
点击                       InkWell / GestureDetector
列表                       ListView.builder
跳页                       Navigator / go_router(12)
弹窗                       showDialog / Modal
表单                       Form + TextFormField
主题色 / 字体              Theme.of(context)(17)
```

写多了形成肌肉记忆。任何 UI 需求,在脑子里**先用积木拼出来**,再去查 API 细节。
