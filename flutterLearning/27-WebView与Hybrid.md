# Flutter WebView 与 Hybrid

WebView 让 Flutter 嵌入 H5。理由:

1. **第三方 H5 内容**(广告、活动页、文档)
2. **多端复用**(运营 / 活动用 H5 写,App / Web / 小程序都能用)
3. **快速更新**(改 H5 不发版)

但 WebView 性能成本高,**能纯 Flutter 写就别用 WebView**。

两个主流插件:

| 库 | 特点 |
| --- | --- |
| `webview_flutter` | 官方,API 简洁,功能基础 |
| `flutter_inappwebview` | 社区,功能最全(Cookie、JS 桥、文件下载、Local server) |

---

## 一、webview_flutter:基础场景够用

```yaml
dependencies:
  webview_flutter: ^4.10.0
```

### Android 配置

`android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.INTERNET"/>
<application
  android:usesCleartextTraffic="true">    <!-- 允许 HTTP -->
```

### iOS 配置

`Info.plist`(允许 HTTP 加载):

```xml
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSAllowsArbitraryLoads</key>
  <true/>
</dict>
```

### 用法

```dart
class WebPage extends StatefulWidget {
  final String url;
  const WebPage({required this.url, super.key});

  @override State<WebPage> createState() => _S();
}

class _S extends State<WebPage> {
  late final WebViewController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.white)
      ..setNavigationDelegate(NavigationDelegate(
        onPageStarted: (url) => print('开始加载 $url'),
        onPageFinished: (url) => print('加载完 $url'),
        onProgress: (p) => print('进度 $p'),
        onWebResourceError: (e) => print('错误 ${e.description}'),
        onNavigationRequest: (req) {
          // 拦截某些 URL
          if (req.url.startsWith('myapp://')) {
            // 自己处理
            return NavigationDecision.prevent;
          }
          return NavigationDecision.navigate;
        },
      ))
      ..loadRequest(Uri.parse(widget.url));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('网页')),
      body: WebViewWidget(controller: _ctrl),
    );
  }
}
```

### 控制

```dart
_ctrl.reload();
_ctrl.canGoBack().then((b) => b && _ctrl.goBack());
_ctrl.canGoForward();
_ctrl.runJavaScript('alert("hi")');
final result = await _ctrl.runJavaScriptReturningResult('1+1');   // 2
```

### 加载本地 HTML / String

```dart
_ctrl.loadHtmlString('<h1>Hello</h1>');
_ctrl.loadFlutterAsset('assets/page.html');
_ctrl.loadFile('/local/path/file.html');
```

---

## 二、JS Bridge:Flutter ↔ JavaScript 互调

### Flutter 调 JS

```dart
final r = await _ctrl.runJavaScriptReturningResult(
  'window.someFunc("hello")',
);
```

JS 端:

```javascript
window.someFunc = function(arg) {
  return JSON.stringify({ ok: true, arg });
};
```

### JS 调 Flutter

```dart
_ctrl.addJavaScriptChannel(
  'AppBridge',
  onMessageReceived: (msg) {
    print('JS 调过来:${msg.message}');
    final data = jsonDecode(msg.message);
    // 处理
  },
);
```

JS 端:

```javascript
window.AppBridge.postMessage(JSON.stringify({
  action: 'closePage',
  data: { reason: 'done' }
}));
```

### 双向调用封装

通用做法:JS 通过 channel 发 `{id, method, params}`,Flutter 处理后再 `runJavaScript` 回写 `{id, result}`。

```dart
class JsBridge {
  final WebViewController ctrl;
  final _pending = <String, Completer>{};

  JsBridge(this.ctrl) {
    ctrl.addJavaScriptChannel('AppBridge', onMessageReceived: _onMessage);
  }

  void _onMessage(JavaScriptMessage msg) async {
    final m = jsonDecode(msg.message);
    final id = m['id'];
    final method = m['method'];
    final params = m['params'];

    try {
      final result = await _handle(method, params);
      _reply(id, result, null);
    } catch (e) {
      _reply(id, null, e.toString());
    }
  }

  Future<dynamic> _handle(String method, dynamic params) async {
    switch (method) {
      case 'getUserInfo': return {'name': '张三'};
      case 'closePage': return null;     // 父级看到这个跳转
      default: throw 'unknown method';
    }
  }

  void _reply(String id, dynamic result, String? error) {
    final js = "window.AppBridge.callback('$id', "
               "${jsonEncode({'result': result, 'error': error})})";
    ctrl.runJavaScript(js);
  }
}
```

JS 端:

```javascript
window.AppBridge._cbs = {};
window.AppBridge.callback = function(id, payload) {
  const cb = AppBridge._cbs[id];
  if (cb) {
    cb(payload);
    delete AppBridge._cbs[id];
  }
};

window.AppBridge.call = function(method, params) {
  return new Promise((resolve, reject) => {
    const id = Date.now() + Math.random();
    AppBridge._cbs[id] = (payload) => {
      if (payload.error) reject(payload.error);
      else resolve(payload.result);
    };
    AppBridge.postMessage(JSON.stringify({ id, method, params }));
  });
};

// 用
const user = await AppBridge.call('getUserInfo');
```

---

## 三、flutter_inappwebview:功能更全

```yaml
dependencies:
  flutter_inappwebview: ^6.1.5
```

提供的额外能力:
- **Cookie 管理**(读写、清空)
- **下载文件**
- **Pull-to-refresh**
- **本地服务器**(InAppLocalhostServer)
- **Chrome DevTools 调试**
- **Service Worker / PWA**

```dart
InAppWebView(
  initialUrlRequest: URLRequest(url: WebUri('https://...')),
  initialSettings: InAppWebViewSettings(
    javaScriptEnabled: true,
    useShouldOverrideUrlLoading: true,
    mediaPlaybackRequiresUserGesture: false,
    allowsInlineMediaPlayback: true,
  ),
  onWebViewCreated: (ctrl) {
    _ctrl = ctrl;
    ctrl.addJavaScriptHandler(handlerName: 'foo', callback: (args) {
      return {'echo': args};
    });
  },
  shouldOverrideUrlLoading: (ctrl, action) async {
    final url = action.request.url.toString();
    if (url.startsWith('weixin://')) {
      // 唤起微信
      return NavigationActionPolicy.CANCEL;
    }
    return NavigationActionPolicy.ALLOW;
  },
  onLoadStop: (ctrl, url) async {
    print('done $url');
  },
)
```

### Cookie

```dart
final cookieMgr = CookieManager.instance();

await cookieMgr.setCookie(
  url: WebUri('https://example.com'),
  name: 'token',
  value: 'abc',
  domain: '.example.com',
  isSecure: true,
);

final cookies = await cookieMgr.getCookies(url: WebUri('https://example.com'));
await cookieMgr.deleteAllCookies();
```

App 登录后把 token 写到 WebView Cookie,H5 直接拿到无需重新登录,**实现 SSO**。

### 文件下载

```dart
InAppWebView(
  onDownloadStartRequest: (ctrl, req) async {
    // 调 dio 下载到本地
    await dio.download(req.url.toString(), '/path/${req.suggestedFilename}');
  },
)
```

---

## 四、混合栈:WebView 嵌在 ListView 里

`列表 + H5 卡片`这种需求,直接放 WebView 性能差(整个 WebView 高度计算难)。

方案:
1. **整页 WebView**:H5 自己做长列表(简单)
2. **Native ListView + WebView 单元素**:每个 cell 一个 WebView(性能差,慎用)
3. **混合栈**(美团 / 微信):用 PlatformView 嵌一个长 ScrollView,Native cell 和 H5 cell 共一个滚动容器

实战 90% 选 1。复杂混合栈是大厂级方案,自己实现成本极高。

---

## 五、登录态共享

App 已登录,WebView 里也想已登录。两种方式:

### Cookie

```dart
// 登录成功后
await cookieMgr.setCookie(
  url: WebUri('https://m.example.com'),
  name: 'session',
  value: token,
);
```

打开 H5 → Cookie 自动带上 → 服务端识别为已登录。

### URL 拼参数 / Header

```dart
_ctrl.loadRequest(
  Uri.parse('https://m.example.com/page'),
  headers: {'Authorization': 'Bearer $token'},
);
```

注意:**header 只对首次加载有效**,后续页面跳转不会带。Cookie 是持久的,推荐。

---

## 六、深度链接(Deep Link)

H5 里点链接,跳到 App 原生页:

```html
<a href="myapp://product/42">查看商品</a>
```

WebView 拦截:

```dart
NavigationDelegate(
  onNavigationRequest: (req) {
    if (req.url.startsWith('myapp://')) {
      handleDeepLink(req.url);
      return NavigationDecision.prevent;
    }
    return NavigationDecision.navigate;
  },
)
```

---

## 七、调用第三方 SDK 链接(微信、支付宝)

H5 调微信支付时,会跳 `weixin://...`,WebView 不会主动唤起。需要拦截后用 url_launcher:

```yaml
dependencies:
  url_launcher: ^6.3.1
```

```dart
NavigationDelegate(
  onNavigationRequest: (req) async {
    if (req.url.startsWith('weixin://') ||
        req.url.startsWith('alipays://')) {
      if (await canLaunchUrl(Uri.parse(req.url))) {
        await launchUrl(Uri.parse(req.url));
      }
      return NavigationDecision.prevent;
    }
    return NavigationDecision.navigate;
  },
)
```

---

## 八、性能优化

### 1. 预热 WebView

App 启动后偷偷创建一个 WebView 加载 about:blank,后续打开 H5 速度快很多。

### 2. 离线包

把 H5 资源打包到 App,首次直接加载本地,后台静默更新。
`InAppLocalhostServer` 可以跑本地 HTTP server 解决相对路径问题。

### 3. 缓存策略

```dart
WebViewSettings(
  cacheMode: AndroidCacheMode.LOAD_CACHE_ELSE_NETWORK,   // 离线优先
  // 或 LOAD_DEFAULT(默认 HTTP 缓存)
)
```

### 4. 减少 JS 桥调用

每次 JS 调 Native 都有 IPC 开销,**批量发**比频繁发好。

### 5. 释放 WebView

```dart
@override
void dispose() {
  // webview_flutter 自动 dispose
  // inappwebview 需要手动:_ctrl?.dispose();
  super.dispose();
}
```

不释放 → 内存泄漏明显(每个 WebView 占 50~100MB)。

---

## 九、调试

### Android 远程调试

```dart
WebView.setWebContentsDebuggingEnabled(true);    // webview_flutter
// 或
PlatformInAppWebViewController.debugLoggingSettings.enabled = true;
```

Chrome 浏览器 → `chrome://inspect/#devices` → 看到设备的 WebView,直接调试 H5(就像调 Chrome 网页)。

### iOS 远程调试

设置 → Safari → 高级 → 启用 Web 检查器
Mac Safari → 开发 → 设备 → 找到 WebView → 调试

---

## 十、常见坑

### 1. 白屏

- URL 不对(打错字、没 https)
- 跨域 / CORS 被拦
- iOS 用了 HTTP 没改 ATS
- Android 用了 HTTP 没开 cleartextTraffic
- JS 错了页面没渲染

→ 打开 Web 检查器看 Console。

### 2. 视频不能播

iOS WebView 默认要求 user gesture 才能自动播放视频:

```dart
WebViewSettings(
  mediaPlaybackRequiresUserGesture: false,
)
```

### 3. 文件上传 input 不弹选择器

需要在原生层注入文件 chooser handler。webview_flutter 不支持,**用 inappwebview**。

### 4. 弹窗 alert / confirm 不显示

需要监听:

```dart
InAppWebView(
  onJsAlert: (ctrl, req) async {
    await showDialog(...);
    return JsAlertResponse(handledByClient: true);
  },
  onJsConfirm: ...,
)
```

### 5. 安全:JS 桥被恶意 H5 调

如果加载第三方 H5,**别注入业务敏感的桥**(如 `getUserToken`)。即使是自家 H5,也要加 origin 白名单:

```dart
onMessageReceived: (msg) {
  // ⚠️ 检查来源
  if (!_isTrustedOrigin(currentUrl)) return;
  ...
}
```

### 6. WebView 不能复制粘贴

某些版本设置 `allowFileAccess: false` 会影响 selection。一般用默认就好。

### 7. 内存爆炸

多个 WebView 同时存在 → iOS 直接崩。**控制同时打开数量**,不用就 dispose。

---

## 十一、原生混合(Add-to-App)

反过来——**原生 App 里嵌一块 Flutter UI**,叫 Add-to-App。

适合:
- 老 App 想试用 Flutter 但不全重写
- 团队主力 iOS / Android,想加几个 Flutter 页

```bash
flutter create --template module my_flutter_module
```

iOS:CocoaPods 引入,SwiftUI / UIKit 里 `FlutterViewController(engine: ...)`。
Android:gradle 引入 module,Activity 里 `FlutterActivity.NewEngineIntentBuilder`。

适合大型项目分阶段迁移。

---

## 十二、推荐选型

```
简单展示页(协议、活动)
  → webview_flutter

需要 Cookie / 下载 / 复杂 JS 桥
  → flutter_inappwebview

App 核心页大量 H5(运营页 / 商品详情)
  → inappwebview + 离线包 + 预热

要嵌 Flutter 到老 App
  → Add-to-App
```

---

## 十三、和已学知识的串联

- WebView 的 token 同步:登录后从 secure_storage(14)取 token,写 Cookie
- JS 桥调用业务方法 → 走 UseCase / Repository(21),不直接接业务代码
- 唤起原生支付:跟支付集成(25)结合,WebView 拦截 `weixin://` `alipays://`
- 路由跳转用 go_router(12),H5 里 deep link 拦截后调 `context.go(...)`
- 性能优化(18):WebView 是 PlatformView,放在 ListView 里慎重
- 调试 H5 用 Chrome DevTools,跟前端开发体验一致

---

## 十四、心智模型

```
WebView 是"App 里的浏览器"
  ├─ Flutter 调 JS:runJavaScript / runJavaScriptReturningResult
  ├─ JS 调 Flutter:addJavaScriptChannel
  └─ 桥协议建议:{id, method, params} + callback

何时用 WebView?
  ✅ 内容由运营 / 第三方提供
  ✅ 跨端复用 H5
  ✅ 频繁更新(改 H5 不发版)
  ❌ 性能敏感页面
  ❌ 需要复杂手势 / 动画
  ❌ 想用 Flutter 状态管理
```

WebView 是 Hybrid 开发的核心工具,但**它是"补充",不是"替代"**——主流 App 的关键页用 Flutter 写,运营 / 边缘 / 第三方页才用 WebView。

到这里 Flutter 学习包基础、状态、工程、特性、发布、扩展全部覆盖完。配合实际项目跑一遍,你就是合格的 Flutter 工程师了。
