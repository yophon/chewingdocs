# Flutter Web 与桌面端

Flutter 的卖点是"一份代码六端跑",但默认你只关心 iOS / Android。Web 和 Desktop 真正能用,需要踩一遍坑。

---

## 一、能不能上生产?

| 端 | 成熟度 | 适合场景 | 坑 |
| --- | --- | --- | --- |
| **iOS / Android** | 🟢 稳定 | 全部场景 | — |
| **Web** | 🟡 可用 | 内部工具 / 后台 / 营销页 / 小游戏 | 首屏大、SEO 差、文本性能 |
| **macOS** | 🟢 稳定 | 工具类 / 团队内部 App | 公证流程 |
| **Windows** | 🟢 稳定 | 工具类 | 缺少原生控件味 |
| **Linux** | 🟡 可用 | 极客 / 内部 | 发行版兼容 |

**判定原则**:面向公众 + SEO 重要的网页 → 不要选 Flutter Web;后台 / 工具 / 内嵌 → 完全可以。

---

## 二、Flutter Web

### 1. 两种渲染器

```
HTML renderer        : 用 DOM + Canvas 混合,体积小,文字效果差
CanvasKit renderer   : WASM 版 Skia,效果好,首包 ~2MB
auto                 : 移动端用 HTML,桌面用 CanvasKit(默认)
```

```bash
flutter build web --release                          # auto
flutter build web --web-renderer=html
flutter build web --web-renderer=canvaskit
```

Flutter 3.10+ 引入 **Skwasm**(WebAssembly Skia,真正零 JS),启用:

```bash
flutter build web --wasm
```

体积更大但渲染更接近原生。3.27+ 默认尝试 wasm,fallback 到 canvaskit。

### 2. 路由 / URL 策略

```dart
import 'package:flutter_web_plugins/url_strategy.dart';

void main() {
  usePathUrlStrategy();      // 去掉 URL 中的 /#/
  runApp(MyApp());
}
```

服务端要 SPA fallback(回顾 19):

```nginx
try_files $uri $uri/ /index.html;
```

### 3. 不能用的 API

```dart
import 'dart:io';            // ❌ Web 没 dart:io

// 用条件导入隔离
import 'platform_io.dart' if (dart.library.html) 'platform_web.dart';
```

或 `kIsWeb` 判断:

```dart
if (kIsWeb) {
  // 走 web 实现
} else {
  await File(path).writeAsString(data);
}
```

### 4. Web 专属包

```yaml
dependencies:
  universal_html: ^2.2.4         # dom 操作跨端 stub
  url_launcher: ^6.3.0           # 打开新标签页
  web: ^1.1.0                    # 官方新 web 包(替代 dart:html)
```

```dart
import 'package:web/web.dart' as web;

web.window.open('https://example.com', '_blank');
web.document.title = '新标题';
```

### 5. SEO 与首屏

Flutter Web **几乎没有 SEO**:Googlebot 看到的是空 div + 一堆 JS。改善方案:

| 方案 | 做法 |
| --- | --- |
| **不上 Flutter** | 营销页 / 博客用 Next.js,App 用 Flutter |
| **Server-side render Flutter** | 不存在(社区有 hack 不实用) |
| **App Shell** | index.html 写关键 meta + skeleton,首屏体验改善 |
| **Pre-render** | `puppeteer` 抓 HTML 留给爬虫 |

### 6. 首包优化

```bash
flutter build web --release --tree-shake-icons \
  --dart-define=FLUTTER_WEB_USE_SKIA=true
```

- 字体子集化:`flutter_web_optimizer` / 自己抽常用字
- 拆 deferred:`deferred as` 加 `await Loader.loadLibrary()`
- 静态资源 CDN + 长缓存
- 启动 splash 占位图(`web/index.html` 自己加 loader)

```dart
// 延迟加载大模块
import 'package:my_app/heavy.dart' deferred as heavy;

await heavy.loadLibrary();
heavy.runHeavy();
```

### 7. PWA

```bash
# 默认就生成 manifest.json + service worker
flutter create --platforms=web my_app
```

`web/manifest.json` 配 icon、name、display(`standalone` 让"加到主屏"像 App)。

iOS Safari 加到主屏后注意:**没有推送、没有后台**,功能受限。

### 8. 鼠标 / 键盘事件

Flutter Web 默认就支持鼠标 hover、滚轮、键盘焦点。复用 `MouseRegion`、`Focus`、`Shortcuts`、`Actions`:

```dart
MouseRegion(
  onEnter: (_) => setState(() => _hover = true),
  onExit: (_) => setState(() => _hover = false),
  cursor: SystemMouseCursors.click,
  child: ...,
)

Shortcuts(
  shortcuts: {
    LogicalKeySet(LogicalKeyboardKey.control, LogicalKeyboardKey.keyS): SaveIntent(),
  },
  child: Actions(
    actions: {SaveIntent: CallbackAction(onInvoke: (_) => save())},
    child: Focus(autofocus: true, child: ...),
  ),
)
```

### 9. 文本可选 / 复制

```dart
SelectionArea(
  child: Column(children: [
    Text('这段可选'),
    Text('这段也可选'),
  ]),
)
```

整页可选用 `SelectionArea` 包根。

### 10. 调试 Web

```bash
flutter run -d chrome --web-port 5000
```

Chrome DevTools 看 network、console。Flutter DevTools 仍然能用(Performance / Inspector)。

---

## 三、Flutter Desktop

### 1. 启用平台

```bash
flutter config --enable-macos-desktop
flutter config --enable-windows-desktop
flutter config --enable-linux-desktop
```

老项目补充平台代码:

```bash
flutter create --platforms=macos,windows,linux .
```

### 2. 窗口管理

`window_manager` 是事实标准:

```yaml
dependencies:
  window_manager: ^0.4.2
```

```dart
void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await windowManager.ensureInitialized();

  await windowManager.waitUntilReadyToShow(WindowOptions(
    size: Size(1200, 800),
    minimumSize: Size(800, 600),
    center: true,
    backgroundColor: Colors.transparent,
    titleBarStyle: TitleBarStyle.hidden,        // 自定义标题栏
  ), () async {
    await windowManager.show();
    await windowManager.focus();
  });

  runApp(MyApp());
}
```

### 3. 多窗口

`desktop_multi_window` / `multi_window_ref` 等。原生支持有限,**复杂多窗口建议拆进程**。

### 4. 系统托盘

```yaml
dependencies:
  tray_manager: ^0.2.4
```

```dart
await trayManager.setIcon('assets/tray.png');
await trayManager.setContextMenu(Menu(items: [
  MenuItem(label: '显示', key: 'show'),
  MenuItem.separator(),
  MenuItem(label: '退出', key: 'quit'),
]));
```

### 5. 菜单栏

macOS / Linux 顶部菜单:

```dart
PlatformMenuBar(
  menus: [
    PlatformMenu(label: 'App', menus: [
      PlatformMenuItem(
        label: '关于',
        onSelected: () => showAboutDialog(...),
      ),
      PlatformMenuItem(
        label: '退出',
        shortcut: SingleActivator(LogicalKeyboardKey.keyQ, meta: true),
        onSelected: () => SystemNavigator.pop(),
      ),
    ]),
  ],
  child: MaterialApp(...),
)
```

### 6. 文件系统

桌面随便读写:

```dart
final dir = await getApplicationDocumentsDirectory();
final file = File('${dir.path}/data.json');
await file.writeAsString(jsonEncode(data));
```

文件选择 `file_picker`、拖放 `desktop_drop`:

```dart
DropTarget(
  onDragDone: (detail) {
    for (final file in detail.files) {
      print('拖入:${file.path}');
    }
  },
  child: ...,
)
```

### 7. 键盘 / 鼠标

复用 Web 那套 `Shortcuts` + `Actions`。桌面常用快捷键:

```dart
LogicalKeySet(LogicalKeyboardKey.meta, LogicalKeyboardKey.keyN)    // ⌘N
LogicalKeySet(LogicalKeyboardKey.control, LogicalKeyboardKey.keyN) // Ctrl+N
```

跨平台简化用 `SingleActivator(..., meta: true, control: true)` —— 在 Mac 走 meta,在 Win/Linux 走 control。

### 8. 原生交互

桌面平台通道 = `MethodChannel`(回顾 16),写 Swift / Kotlin / C++。
社区现成包能省事:

| 需求 | 包 |
| --- | --- |
| 通知 | `local_notifier` |
| 自启动 | `launch_at_startup` |
| 屏幕保护 | `screen_retriever` |
| 全局快捷键 | `hotkey_manager` |
| 系统主题 | `dynamic_color`(macOS 11+) |

### 9. 打包

回顾 19:
- macOS:`flutter build macos` → `.app` → 公证
- Windows:`flutter build windows` → `.exe` + DLL → MSIX 打包
- Linux:`flutter build linux` → 二进制 → flatpak / snap / .deb

### 10. macOS 公证

```bash
xcrun notarytool submit MyApp.zip \
  --apple-id you@example.com \
  --team-id TEAM123ABC \
  --password APP_SPECIFIC_PWD \
  --wait

xcrun stapler staple MyApp.app
```

不公证 macOS 用户双击 = "无法验证开发者"弹窗。

### 11. Windows 自动更新

`auto_updater` 包 + 自建服务端 / Squirrel.Windows:

```dart
await autoUpdater.setFeedURL('https://your-server/appcast.xml');
await autoUpdater.checkForUpdates();
```

服务端返回 RSS 格式 appcast,客户端比对版本下载。

---

## 四、跨端布局策略

回顾 22(响应式 UI)。再加一层"端选择":

```dart
Widget _build(BuildContext context) {
  final width = MediaQuery.sizeOf(context).width;

  if (kIsWeb && width > 1200)            return DesktopWebLayout();
  if (Platform.isMacOS || Platform.isWindows || Platform.isLinux) {
    return DesktopLayout();
  }
  if (width > 600)                       return TabletLayout();
  return MobileLayout();
}
```

**重点**:同一个业务组件抽到 `widgets/`,各端布局只决定"组装方式"。

---

## 五、共享代码 / 端特异代码

```
lib/
├── core/                  # 业务、模型、API:全平台
├── features/
│   └── home/
│       ├── home_page.dart            # 共用入口
│       ├── home_page_mobile.dart
│       ├── home_page_desktop.dart
│       └── home_page_web.dart
└── platform/
    ├── share.dart                    # 抽象
    ├── share_io.dart                 # 移动 / 桌面
    └── share_web.dart                # web
```

条件导入选实现:

```dart
// share.dart
export 'share_io.dart' if (dart.library.html) 'share_web.dart';
```

---

## 六、常见坑

### 1. Web hot reload 不全

- 修改 `main.dart` 等时常需要 hot restart
- 服务端代码、isolate 入口必须 restart

### 2. macOS 编译 pod 报错

```bash
cd macos && pod install --repo-update
```

App Sandbox 默认开,要联网得在 `Runner.entitlements` 加 `com.apple.security.network.client`。

### 3. Windows VS 工具链

需要 Visual Studio 2022,勾选 "Desktop development with C++"。`flutter doctor` 会提示。

### 4. Web 上传文件

`File` 不存在,用 `XFile` / `image_picker_web`:

```dart
final picker = ImagePicker();
final picked = await picker.pickImage(source: ImageSource.gallery);
final bytes = await picked!.readAsBytes();
```

### 5. Web canvasKit 字体加载慢

```html
<!-- web/index.html -->
<link rel="preload" href="canvaskit/canvaskit.wasm" as="fetch" crossorigin>
```

或自部署 canvaskit:

```bash
flutter build web --release --web-renderer canvaskit \
  --dart-define=FLUTTER_WEB_CANVASKIT_URL=/canvaskit/
```

---

## 七、当前限制速查

| 功能 | Web | Desktop |
| --- | --- | --- |
| 推送 | ⚠️ 仅 PWA(无 iOS) | ⚠️ 桌面通知 |
| 文件系统 | ❌(沙箱) | ✅ |
| 蓝牙 / 串口 | ❌ | ⚠️ 需 plugin |
| 摄像头 / 麦克风 | ✅ | ✅ |
| 后台运行 | ❌ | ✅ |
| 多窗口 | ❌ | ⚠️ |
| WebView | ⚠️ iframe | ✅ webview_windows / desktop_webview_window |

---

## 八、心智模型

```
Flutter 多端代码组织
├── 共享:模型 / 业务 / 网络 / 状态(95%)
├── 适配:布局根据屏幕 + 端选择
└── 平台特异:
     ├── 文件系统  → io / web 条件导入
     ├── 推送      → FCM(移动)、Web Push、桌面 toast
     ├── 窗口管理  → 仅桌面
     └── 系统集成  → 各端单独 plugin

Web 适合:后台、表单工具、协作工具、营销页轻应用
Desktop 适合:开发工具、设计工具、IM 客户端、内部工具
```

**一句话**:Flutter 不是要替代所有端,而是让"一个产品多端覆盖"成本低 80%。**Web 不要碰 SEO 大型网站,Desktop 不要碰系统级深集成**,其他都行。

---

## 九、和已学知识的串联

- 22(响应式 UI):跨端布局基础,直接用
- 16(平台通道):桌面写原生 UI 控件靠它
- 19(打包发布):Web / 桌面打包流程
- 14(本地存储):桌面随便用文件,Web 走 IndexedDB
- 27(WebView):桌面有 webview_windows / webview_cocoa,Web 用 iframe
- 26(推送):Web Push 走 service worker,桌面走系统通知
- 17(主题):多端 brightness / 字体差异处理
