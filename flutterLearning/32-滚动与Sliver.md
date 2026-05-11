# Flutter 滚动与 Sliver

App 一半的页面都跟滚动有关——列表、Feed、详情页、长表单。

Flutter 的滚动系统分两层:

```
高层 API   :ListView / GridView / SingleChildScrollView   (90% 场景够用)
低层 Sliver:CustomScrollView + 各种 Sliver               (复杂滚动效果)
```

---

## 一、ListView:最常用

### 1. ListView(children: ...)

一次性构建所有 children,**只适合少量数据**:

```dart
ListView(
  children: [
    ListTile(title: Text('1')),
    ListTile(title: Text('2')),
    ListTile(title: Text('3')),
  ],
)
```

### 2. ListView.builder:大列表必用

懒加载,**滚到了才构建**:

```dart
ListView.builder(
  itemCount: items.length,
  itemBuilder: (context, index) => ListTile(
    key: ValueKey(items[index].id),
    title: Text(items[index].title),
  ),
)
```

回顾 18:列表必须用 builder,不然滚动卡。

### 3. ListView.separated:带分割线

```dart
ListView.separated(
  itemCount: items.length,
  separatorBuilder: (_, __) => const Divider(height: 1),
  itemBuilder: (_, i) => ListTile(...),
)
```

---

## 二、ListView 常用参数

```dart
ListView.builder(
  scrollDirection: Axis.vertical,        // .horizontal 横向
  reverse: false,                        // 反向(聊天列表)
  shrinkWrap: false,                     // ⚠️ true 性能差
  physics: const BouncingScrollPhysics(),// 滚动效果
  padding: const EdgeInsets.all(8),
  itemExtent: 60,                        // 高度固定时填,性能更好
  cacheExtent: 1000,                     // 屏幕外预构建 1000 像素
  controller: _scrollCtrl,
  itemCount: items.length,
  itemBuilder: ...,
)
```

### itemExtent 的提示

如果每项**高度固定**,设 `itemExtent` 让 Flutter 跳过测量,大列表性能提升明显。

### shrinkWrap 误用

`shrinkWrap: true` 让 ListView 按内容算高度。看起来方便,但 **每次都要遍历所有 child 测高,大列表卡死**。
**正确**:让 ListView 拿到无界高度(用 Expanded、SizedBox)。

---

## 三、GridView

```dart
GridView.builder(
  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
    crossAxisCount: 3,                  // 3 列
    mainAxisSpacing: 8,
    crossAxisSpacing: 8,
    childAspectRatio: 1,                // 每格宽高比
  ),
  itemCount: items.length,
  itemBuilder: (_, i) => Container(color: Colors.blue),
)
```

### 自适应列数

```dart
GridView.builder(
  gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
    maxCrossAxisExtent: 200,           // 每个 item 最大 200,自动算列数
    mainAxisSpacing: 8,
    crossAxisSpacing: 8,
  ),
  ...
)
```

屏幕宽 → 列多,屏幕窄 → 列少。响应式 UI 必备(回顾 22)。

---

## 四、SingleChildScrollView

不是列表,是"内容超出可视区时滚动"。适合**整页内容**:

```dart
SingleChildScrollView(
  child: Column(
    children: [
      const Header(),
      const ProfileCard(),
      const SettingsList(),
      const Footer(),
    ],
  ),
)
```

⚠️ **不要把大列表放进 SingleChildScrollView**,所有 child 都被一次性构建,跟 `ListView(children:)` 一样问题。

---

## 五、ScrollController:程序化控制

```dart
class _PageState extends State<MyPage> {
  final _ctrl = ScrollController();

  @override
  void dispose() {
    _ctrl.dispose();         // ⚠️ 必须释放
    super.dispose();
  }

  void _scrollToTop() {
    _ctrl.animateTo(0,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOut);
  }

  @override
  Widget build(_) => ListView.builder(
    controller: _ctrl,
    ...
  );
}
```

### 监听滚动位置

```dart
@override
void initState() {
  super.initState();
  _ctrl.addListener(() {
    print('当前位置:${_ctrl.position.pixels}');
    if (_ctrl.position.pixels >= _ctrl.position.maxScrollExtent - 100) {
      _loadMore();              // 滚到底加载更多
    }
  });
}
```

### 跳转到指定位置 / item

```dart
_ctrl.jumpTo(500);                           // 立即
_ctrl.animateTo(500, duration: ..., curve: ...);

// 跳到第 N 项(配合 itemExtent)
_ctrl.jumpTo(60.0 * 10);                     // 第 10 项
```

复杂场景用 `scroll_to_index` 包(支持任意高度 item 跳转)。

---

## 六、ScrollPhysics:滚动效果

```dart
ListView(
  physics: const AlwaysScrollableScrollPhysics(),    // 总是可滚(下拉刷新)
  // physics: const NeverScrollableScrollPhysics(),  // 完全不可滚
  // physics: const BouncingScrollPhysics(),         // iOS 弹性
  // physics: const ClampingScrollPhysics(),         // Android 边缘吸附
  // physics: const PageScrollPhysics(),             // 像 PageView 一样翻页
  ...
)
```

iOS / Android 默认行为不同,Flutter 自动适配。要强制风格统一指定。

---

## 七、下拉刷新与上拉加载

### RefreshIndicator(下拉刷新)

```dart
RefreshIndicator(
  onRefresh: () async {
    await _refreshData();      // 必须返回 Future
  },
  child: ListView.builder(...),
)
```

### 上拉加载

监听 ScrollController,接近底部触发:

```dart
_ctrl.addListener(() {
  if (_ctrl.position.pixels >= _ctrl.position.maxScrollExtent - 200 && !_loading) {
    _loadMore();
  }
});
```

或用现成包 `infinite_scroll_pagination`:

```dart
PagedListView<int, Item>(
  pagingController: _pageCtrl,
  builderDelegate: PagedChildBuilderDelegate<Item>(
    itemBuilder: (_, item, __) => ItemTile(item),
  ),
)
```

---

## 八、CustomScrollView + Sliver:复杂滚动

普通 ListView 是"一根滚动条管全部"。**Sliver 是把页面拆成多段,每段用不同 Widget,共享一个滚动条**。

典型场景:
- 顶部大图,滚到一半变 AppBar
- 第一段网格,第二段列表,共享滚动
- 粘性 header(滚到顶部就吸住)

### 基础结构

```dart
CustomScrollView(
  slivers: [
    SliverAppBar(...),
    SliverToBoxAdapter(child: ProfileHeader()),    // 普通 Widget 包成 Sliver
    SliverList(delegate: SliverChildBuilderDelegate(
      (_, i) => ListTile(title: Text('Item $i')),
      childCount: 30,
    )),
    SliverGrid(
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2),
      delegate: SliverChildBuilderDelegate(
        (_, i) => Card(child: Text('Grid $i')),
        childCount: 20,
      ),
    ),
  ],
)
```

---

## 九、SliverAppBar:可折叠 AppBar

```dart
SliverAppBar(
  expandedHeight: 200,
  pinned: true,           // 滚到顶不消失
  floating: false,        // 一向下滑就出现
  snap: false,            // 配合 floating,直接弹出而不是渐显
  flexibleSpace: FlexibleSpaceBar(
    title: const Text('我的页面'),
    background: Image.network(url, fit: BoxFit.cover),
  ),
)
```

| 组合 | 效果 |
| --- | --- |
| `pinned: true` | 滚到顶后保留 AppBar |
| `floating: true` | 向下滑立刻显示(不用滚到顶) |
| `floating + snap: true` | 直接弹出 |
| 全 false | 滚走就没了 |

---

## 十、SliverPersistentHeader:粘性 Header

```dart
class _StickyHeader extends SliverPersistentHeaderDelegate {
  @override
  Widget build(_, double shrinkOffset, bool overlaps) {
    return Container(
      color: Colors.white,
      child: const Center(child: Text('粘性 Header')),
    );
  }
  @override double get minExtent => 50;
  @override double get maxExtent => 50;
  @override
  bool shouldRebuild(_) => false;
}

CustomScrollView(slivers: [
  SliverPersistentHeader(
    pinned: true,
    delegate: _StickyHeader(),
  ),
  SliverList(...),
])
```

适合"分组列表":每个分组的头滚到顶吸住。

---

## 十一、SliverList vs SliverChildListDelegate vs SliverChildBuilderDelegate

```dart
// 已知 children list(少量)
SliverList(delegate: SliverChildListDelegate([
  Text('a'),
  Text('b'),
]))

// 大量 / 懒加载
SliverList(delegate: SliverChildBuilderDelegate(
  (_, i) => Text('$i'),
  childCount: 1000,
))
```

记忆:**`Builder` 是 builder,`List` 是已有 list**。

---

## 十二、SliverFillRemaining

填满剩余空间:

```dart
CustomScrollView(slivers: [
  SliverAppBar(...),
  SliverList(delegate: SliverChildBuilderDelegate(...)),
  SliverFillRemaining(           // 列表后剩余空间塞个东西
    hasScrollBody: false,
    child: const Center(child: Text('没有更多了')),
  ),
])
```

---

## 十三、嵌套滚动:NestedScrollView

页面顶部一个可折叠 Header,下方是 TabBarView,每个 Tab 是 ListView——共享一个滚动:

```dart
NestedScrollView(
  headerSliverBuilder: (_, __) => [
    const SliverAppBar(
      expandedHeight: 200,
      pinned: true,
      flexibleSpace: FlexibleSpaceBar(title: Text('Profile')),
    ),
    const SliverPersistentHeader(...),     // TabBar
  ],
  body: TabBarView(children: [
    ListView.builder(...),
    ListView.builder(...),
  ]),
)
```

实际项目里也很常用,但**实现细节复杂**(TabBarView 每个 Tab 要单独管 controller)。

---

## 十四、PageView:翻页滚动

```dart
PageView(
  controller: _pageCtrl,
  scrollDirection: Axis.horizontal,
  children: [
    Page1(),
    Page2(),
    Page3(),
  ],
)

// 或 builder
PageView.builder(
  itemCount: 100,
  itemBuilder: (_, i) => Page(i),
)
```

横向轮播、抖音式上下滑都用它。

### 控制

```dart
_pageCtrl.animateToPage(2, duration: ..., curve: ...);
_pageCtrl.jumpToPage(2);
```

### 监听当前页

```dart
PageView(
  onPageChanged: (i) => print('当前 $i'),
)
```

---

## 十五、Dismissible:左右滑删除

```dart
Dismissible(
  key: ValueKey(item.id),
  background: Container(color: Colors.red, child: const Icon(Icons.delete)),
  onDismissed: (direction) {
    setState(() => items.removeAt(index));
  },
  child: ListTile(...),
)
```

回顾 07:**必须有 Key**。

---

## 十六、ReorderableListView:拖拽排序

```dart
ReorderableListView(
  children: items.map((it) => ListTile(
    key: ValueKey(it.id),
    title: Text(it.title),
  )).toList(),
  onReorder: (oldIdx, newIdx) {
    setState(() {
      if (newIdx > oldIdx) newIdx -= 1;
      final item = items.removeAt(oldIdx);
      items.insert(newIdx, item);
    });
  },
)
```

每个 child 必须有 Key,**自动加拖拽手柄**(右侧)。

---

## 十七、Scrollbar:滚动条

桌面 / 大屏需要可见的滚动条:

```dart
Scrollbar(
  thumbVisibility: true,        // 始终显示
  trackVisibility: true,        // 显示轨道
  child: ListView.builder(...),
)
```

回顾 22。

---

## 十八、性能 tips

1. **大列表必用 builder**(回顾 18)
2. **每项加 ValueKey**(回顾 07)
3. **复杂 item 包 RepaintBoundary**
4. **固定高度设 itemExtent**
5. **图片用 cached_network_image + memCacheWidth**
6. **避免 itemBuilder 里做重计算**
7. **滚动监听用 NotificationListener<ScrollNotification> 替代 controller.addListener** 在某些场景更轻

```dart
NotificationListener<ScrollNotification>(
  onNotification: (n) {
    if (n is ScrollEndNotification && n.metrics.atEdge && n.metrics.pixels > 0) {
      _loadMore();
    }
    return false;
  },
  child: ListView.builder(...),
)
```

---

## 十九、常见坑

### 1. ListView 在 Column 里报错

```dart
Column(children: [
  Header(),
  ListView(children: [...]),   // ❌ 高度无界
])
```

→ 用 `Expanded`(回顾 30)。

### 2. shrinkWrap + ListView 嵌 ListView 卡死

→ 重构为 `CustomScrollView` + 多个 Sliver。

### 3. ScrollController 多个 ListView 共用

```dart
final ctrl = ScrollController();
ListView(controller: ctrl, ...);
ListView(controller: ctrl, ...);   // ❌ 一个 controller 只能配一个 Scrollable
```

→ 用两个 controller,或用 `LinkedScrollControllerGroup`。

### 4. PageView 子页 State 丢失

切换 PageView 子页,默认 State 销毁重建。要保留:

```dart
class _Page1State extends State<Page1> with AutomaticKeepAliveClientMixin {
  @override bool get wantKeepAlive => true;

  @override
  Widget build(BuildContext context) {
    super.build(context);   // ⚠️ 必须调
    return ...;
  }
}
```

或外层用 `IndexedStack`(同时构建,只显示一个,所有 State 都活着)。

### 5. ListView builder 里 itemCount 漏 +1

加载更多场景,要在底部显示 loading:

```dart
ListView.builder(
  itemCount: items.length + 1,    // +1 给 loading
  itemBuilder: (_, i) {
    if (i == items.length) return const Center(child: CircularProgressIndicator());
    return ItemTile(items[i]);
  },
)
```

### 6. SliverAppBar pinned 但 expandedHeight 比 toolbar 还小

→ `expandedHeight` 必须 >= `kToolbarHeight`(56),否则布局错乱。

---

## 二十、Sliver 速查

| Sliver | 用途 |
| --- | --- |
| `SliverAppBar` | 可折叠 AppBar |
| `SliverList` | 列表(等同 ListView) |
| `SliverGrid` | 网格 |
| `SliverFixedExtentList` | 固定高度列表(更快) |
| `SliverToBoxAdapter` | 普通 Widget 包成 Sliver |
| `SliverPersistentHeader` | 粘性 / 浮动 Header |
| `SliverFillRemaining` | 填满剩余 |
| `SliverPadding` | 给 Sliver 加 padding |
| `SliverAnimatedList` | 增删动画的列表 |

---

## 二十一、和已学知识的串联

- 列表项加 Key 才能正确复用 Element(05 / 07)
- 列表性能优化全套(18)
- 配合 Bloc / Riverpod 做无限滚动 + 分页(09 / 10)
- 配合下拉刷新调 Dio(13)
- 列表项点击跳详情用 go_router(12)
- 复杂滚动效果在响应式 UI 里大屏适配(22)

---

## 二十二、心智模型

```
"普通"列表 → ListView.builder + Controller + RefreshIndicator
"折叠"头  → CustomScrollView + SliverAppBar
"粘性"头  → SliverPersistentHeader
"翻页"    → PageView
"嵌套"    → NestedScrollView(慎用)
"网格"    → GridView 或 SliverGrid
"重排"    → ReorderableListView
"滑删"    → Dismissible
```

ListView 解决 80%,Sliver 解决剩下 20%。**先学 ListView,遇到普通 ListView 干不了的复杂效果,再上 Sliver**。

> **滚动出问题,90% 是约束没传对**。先回 30 那篇看约束系统,再看具体 Widget 用法。
