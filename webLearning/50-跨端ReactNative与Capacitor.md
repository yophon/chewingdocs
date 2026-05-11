# 跨端:React Native 与 Capacitor

跨端 = **一份代码跑 iOS / Android / Web**。

```
两条主流路径:

1. 渲染原生组件(性能更好,体验更原生)
   React Native(Meta)
   Flutter(Google,但用 Dart)
   .NET MAUI(Microsoft)

2. WebView 套壳(Web 复用,迭代快)
   Capacitor(Ionic)
   Cordova(老,Capacitor 取代它)
   Tauri Mobile(2024+ 新出)
```

这一篇详讲 **React Native** 和 **Capacitor**——Web 工程师最容易接的两条路。Flutter 在 [`flutterLearning/`](../flutterLearning/) 有专门系列。

---

## 一、选哪条路

```
判断           | RN(原生组件)          | Capacitor(WebView)
体验需求       | 接近原生              | "网页装进 App"
性能           | 高(原生组件)         | 中(WebView 限制)
学习成本       | 高(新组件 / 调试 / 原生) | 低(就是 Web + 几个 API)
迭代速度       | 中(改原生要重 build)   | 快(改 Web 即可)
跨 Web 复用    | 较难(组件不一样)      | 完美(同一套代码)
团队          | 有 RN 经验或愿意学      | Web 团队直接上手

适合 RN:
  Instagram / Discord / Shopify / Coinbase
  需要"看起来像原生 App"

适合 Capacitor:
  内部工具 / SaaS 移动端 / MVP
  已有响应式 Web 想快速发 App
```

**一句话**:**复用 Web 代码 → Capacitor;追求原生体验 → RN(或 Flutter)**。

---

## 二、React Native:渲染原生组件

### 1. 心智

```
React 写组件 → React Native 桥接 → 渲染成原生 UIView / Android View

不是 WebView!不是 Canvas!是真原生组件。
```

```jsx
// React Native
import { View, Text, Button } from 'react-native';

function App() {
  return (
    <View>
      <Text>Hello</Text>
      <Button title="Click" onPress={() => ...} />
    </View>
  );
}
```

`<View>` 编译时变成 iOS 的 `UIView` / Android 的 `ViewGroup`。**不是 `<div>`**。

### 2. 跟 React Web 的差异

```
React Web                  React Native
<div>                       <View>
<span> / <p>                <Text>(必须用 Text 包文字)
<button>                    <Pressable> / <Button> / <TouchableOpacity>
<input>                     <TextInput>
<img>                       <Image>
<a href>                    <Pressable> + Linking.openURL
<select>                    <Picker>
ScrollView / Flatlist       (不像 Web 的 div + overflow)

CSS                         StyleSheet(子集)
                            display: flex 默认
                            没有 inline / block 概念,都是 flex
                            没有 grid
                            colors 通常用对象 { color: '#fff' }
                            尺寸用数字(unitless,代表 dp)

react-router                react-navigation
useState / useEffect         一样
fetch                       一样
DOM API                     没有(无 document / window)
```

### 3. 第一个 RN App

#### Expo(推荐,新人友好)

```bash
pnpm dlx create-expo-app my-app
cd my-app
pnpm start
```

下载 Expo Go App 扫码,**手机上立刻看到**。改代码自动 reload。

#### React Native CLI(完整原生工程)

```bash
pnpm dlx @react-native-community/cli init MyApp
cd MyApp
pnpm ios       # 需要 Xcode
pnpm android    # 需要 Android Studio
```

更接近原生开发流程,**能加任何原生模块**。

### 4. 样式

```jsx
import { StyleSheet, View, Text } from 'react-native';

function Card() {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Hello</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,           // Android 阴影
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
});
```

或用 [NativeWind](https://www.nativewind.dev)(Tailwind for RN):

```jsx
<View className="p-4 bg-white rounded-lg shadow">
  <Text className="text-lg font-bold">Hello</Text>
</View>
```

**NativeWind 是 RN 的 Tailwind**,2024+ 新项目首选。

### 5. 路由(react-navigation)

```bash
pnpm add @react-navigation/native @react-navigation/native-stack
pnpm add react-native-screens react-native-safe-area-context
```

```jsx
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

const Stack = createNativeStackNavigator();

function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Detail" component={DetailScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function HomeScreen({ navigation }) {
  return <Button title="Go" onPress={() => navigation.navigate('Detail', { id: 1 })} />;
}

function DetailScreen({ route }) {
  return <Text>{route.params.id}</Text>;
}
```

或用 **Expo Router**(2023+,文件系统路由,像 Next.js):

```
app/
├── _layout.tsx
├── index.tsx           /
├── about.tsx            /about
└── posts/
    └── [id].tsx         /posts/:id
```

```tsx
import { Link } from 'expo-router';
<Link href="/about">About</Link>
```

### 6. 列表(Flatlist)

```jsx
<FlatList
  data={items}
  keyExtractor={(item) => item.id}
  renderItem={({ item }) => <Text>{item.name}</Text>}
  onEndReached={loadMore}
  refreshing={refreshing}
  onRefresh={refresh}
/>
```

**Flatlist 自带虚拟化**,大数据列表流畅。新项目可以用更快的 [FlashList](https://shopify.github.io/flash-list/)(Shopify 出品)。

### 7. 平台特定代码

```jsx
import { Platform } from 'react-native';

const padding = Platform.OS === 'ios' ? 20 : 16;
const Header = Platform.select({
  ios: IOSHeader,
  android: AndroidHeader,
});
```

或文件名后缀:

```
Button.ios.tsx
Button.android.tsx
Button.tsx        // 默认
```

构建时自动选对的。

### 8. 调用原生 API

```jsx
// 内置(Expo / RN 都有大量包)
import * as Location from 'expo-location';
import { Camera } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';

const loc = await Location.getCurrentPositionAsync();
const { uri } = await ImagePicker.launchImageLibraryAsync();
```

### 9. 写自己的原生模块

JS 调不到的原生功能,自己写:

```swift
// iOS:Swift
@objc(MyModule)
class MyModule: NSObject {
  @objc func doStuff(_ name: String) -> String { return "hi \(name)" }
}
```

```kotlin
// Android:Kotlin
class MyModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "MyModule"
  @ReactMethod fun doStuff(name: String, promise: Promise) { promise.resolve("hi $name") }
}
```

JS 端:

```js
import { NativeModules } from 'react-native';
const r = await NativeModules.MyModule.doStuff('Alice');
```

**新架构(Fabric / TurboModules)**写法不同,详见官方迁移指南。

### 10. 调试

```bash
# Metro bundler 日志
pnpm start

# 设备上摇一摇 → 开发菜单
# 或 Cmd+D(iOS) / Cmd+M(Android emulator)
# Reload / Element Inspector / Performance Monitor

# Flipper(Meta 出品的 RN 调试工具,2024 改用 React Native DevTools)
# Chrome DevTools 也能连
```

### 11. 状态 / 数据获取

跟 React Web 一样:Zustand / Jotai / Redux Toolkit / TanStack Query。

```ts
// AsyncStorage 替代 localStorage(异步)
import AsyncStorage from '@react-native-async-storage/async-storage';

await AsyncStorage.setItem('user', JSON.stringify(user));
const u = JSON.parse(await AsyncStorage.getItem('user') ?? 'null');
```

### 12. 发布

#### iOS

```bash
# 用 EAS Build(Expo)
eas build --platform ios

# 或本地 Xcode build
```

需要:
- Apple Developer 账号($99/年)
- 推到 App Store Connect
- TestFlight 内测
- 提交审核(1~3 天)

#### Android

```bash
eas build --platform android
# 或 ./gradlew assembleRelease
```

签名后上传到 Google Play Console。

#### EAS(Expo Application Services)

```bash
eas init
eas build           # 云端 build,免本地装 Xcode/Android Studio
eas submit          # 提交到商店
eas update          # OTA 更新(JS bundle 不用过审)
```

**EAS update**:改 JS 不用重新发版,推送给所有用户。**RN 杀手锏**(原生只有重发包)。

### 13. RN 跟 React Web 共享代码

```
共享:
  hooks(useUser / useAuth)
  状态(zustand stores)
  数据获取(query)
  工具函数
  类型

不共享:
  组件(View vs div)
  路由
  样式

实战:monorepo + packages/shared(纯逻辑) + apps/web + apps/native
```

或用 [**Tamagui**](https://tamagui.dev)(同一套组件代码 web + native 都能跑)、[**Solito**](https://solito.dev)(Next.js + Expo 路由共享)等工具。

---

## 三、Capacitor:WebView 套壳(Ionic)

### 1. 心智

```
你的现有 Web 应用(React/Vue/Angular/Svelte/Vanilla)
+ 一个 iOS/Android 原生工程
= Capacitor

WebView 加载你的 Web 资源,用 plugin 桥接原生 API。
```

跟 Cordova 类似,但 API 现代、原生工程在你仓库里(不是黑盒)。

### 2. 第一步

已有 Vue / React / Angular Web 项目:

```bash
pnpm add @capacitor/core
pnpm add -D @capacitor/cli
pnpm cap init "MyApp" "com.example.myapp"
```

```bash
pnpm cap add ios
pnpm cap add android
```

每次改 web 后:

```bash
pnpm build              # 你的 Web build
pnpm cap copy           # 把 dist/ 拷到 native 工程
pnpm cap open ios       # 打开 Xcode
pnpm cap open android   # 打开 Android Studio
```

或直接:

```bash
pnpm cap run ios        # build + 跑模拟器
```

### 3. 调用原生 API

```bash
pnpm add @capacitor/camera @capacitor/geolocation @capacitor/preferences
```

```ts
import { Camera, CameraResultType } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';
import { Preferences } from '@capacitor/preferences';

const photo = await Camera.getPhoto({ resultType: CameraResultType.Uri });
const loc = await Geolocation.getCurrentPosition();

await Preferences.set({ key: 'user', value: JSON.stringify(u) });
const { value } = await Preferences.get({ key: 'user' });
```

官方插件:Camera / Filesystem / Geolocation / Network / Push Notifications / Share / SplashScreen / StatusBar 等。

### 4. 自定义原生模块

```ts
// my-plugin/src/web.ts
import { WebPlugin } from '@capacitor/core';
export class MyPluginWeb extends WebPlugin { /* web 实现(可省略) */ }

// my-plugin/ios/Plugin/Plugin.swift
@objc(MyPlugin)
public class MyPlugin: CAPPlugin {
  @objc func doStuff(_ call: CAPPluginCall) {
    call.resolve(["result": "hi"])
  }
}

// my-plugin/android/.../MyPlugin.java
@CapacitorPlugin(name = "MyPlugin")
public class MyPlugin extends Plugin {
  @PluginMethod
  public void doStuff(PluginCall call) {
    JSObject ret = new JSObject();
    ret.put("result", "hi");
    call.resolve(ret);
  }
}
```

```ts
import { registerPlugin } from '@capacitor/core';
const MyPlugin = registerPlugin<{ doStuff(): Promise<{ result: string }> }>('MyPlugin');

const r = await MyPlugin.doStuff();
```

### 5. UI 框架

Capacitor 不强制 UI,你用 React/Vue/任何 Web UI。但要"看起来像原生":

- **Ionic Framework**:Capacitor 的兄弟项目,提供 iOS / Material Design 风格组件
- **Konsta UI**:Tailwind 风格的移动 UI 库
- **Framework7**:类似 Ionic 的 Web 移动 UI

或用 Tailwind 自己设计,**移动 SaaS 完全没问题**。

### 6. PWA + Capacitor

Capacitor 项目天然能同时是 PWA(41 篇)。**一份代码 → Web / iOS / Android 全发**。

### 7. 性能

- WebView 性能比原生组件差(滚动 / 动画明显)
- iOS WKWebView / Android WebView 已经很好了,普通 SaaS 用户感知不强
- 复杂动画 / 列表用 transform、IntersectionObserver、虚拟滚动(39 / 42 篇)

### 8. 调试

```bash
# Safari Web Inspector(连 iOS 设备)
# Chrome chrome://inspect(连 Android)
# 跟普通 Web 一样调试
```

---

## 四、Capacitor vs RN 对比

| 维度 | Capacitor | React Native |
| --- | --- | --- |
| 上手 | ⭐⭐⭐⭐⭐(就是 Web) | ⭐⭐(要学新组件) |
| 性能 | ⭐⭐⭐(WebView) | ⭐⭐⭐⭐⭐(原生组件) |
| 体验"原生" | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| Web 复用 | ⭐⭐⭐⭐⭐(就是 Web) | ⭐⭐⭐(逻辑可,UI 不) |
| 迭代速度 | ⭐⭐⭐⭐⭐(改 Web 即可) | ⭐⭐⭐⭐(EAS update OTA) |
| 包体积 | 小 | 中 |
| 生态 | 中(共用 Web 生态) | 大(Meta + Expo) |
| 调试 | 跟 Web 一样 | 自己一套 |

---

## 五、其他方案速览

### Flutter(Google)

```
Dart 语言,Skia 自己绘制 UI
跨平台:iOS / Android / Web / 桌面
体验最接近原生,性能极好

缺点:Dart 学习曲线,跟 Web 生态隔离
```

详见你的 [`flutterLearning/`](../flutterLearning/) 系列。

### Expo

```
RN 的"全家桶":Build + 路由 + Push + OTA + UI 库
新人最友好
```

### NativeScript

```
也是渲染原生组件,但用 Vue / Angular / Svelte
比 RN 小众,2024 仍维护
```

### .NET MAUI / Xamarin

```
微软系,C# 写跨端
适合 .NET 团队
```

### Kotlin Multiplatform Mobile(KMM)

```
共享业务逻辑,UI 用 Swift / Kotlin / Compose Multiplatform
2024 增长很快(Google 推)
```

### Tauri Mobile(2024+)

```
Tauri 进军移动端,用系统 WebView
还在 alpha,关注不必上车
```

---

## 六、跨端的现实

```
理想:一份代码,所有平台完美。
现实:

1. UI 要做平台适配
   iOS / Android 设计语言不同(Apple HIG / Material)
   "iOS 风格在 Android 上看着别扭" / 反之亦然
   Tab 在哪儿、字体大小、动效都不一样

2. 平台 API 差异
   推送(APNS vs FCM)
   后台权限(iOS 严)
   分享 / 支付 / 应用内购买 不一样
   生物认证 API 形状不一样

3. 商店审核
   Apple 审核严(2025 仍然),会因为"用 WebView 太多" / "提供外部支付链接"被拒
   Google 较松但有自己规矩
   每次发版要审核

4. 用户期望
   iPhone 用户期望 iOS 风格
   Android 用户期望 Material Design
   一份 UI 两边都不爽?

应对:
  - 用 react-navigation / Expo router 自动适配 header / 转场
  - 用 NativeWind / Tamagui 写一套但能切换风格
  - 关键交互按平台 fork(用 Platform.OS / 文件后缀)
  - 测试在两个平台都跑
```

---

## 七、AsyncStorage / 安全存储

```ts
// 普通存储(不加密)
import AsyncStorage from '@react-native-async-storage/async-storage';

// 敏感信息(token / 密码)
import * as SecureStore from 'expo-secure-store';      // Expo
// 或 react-native-keychain                              // RN CLI
await SecureStore.setItemAsync('token', token);
const t = await SecureStore.getItemAsync('token');
```

**永远不要把 token 存普通 AsyncStorage**,放 Keychain / Keystore。

---

## 八、推送通知

```bash
pnpm add expo-notifications
```

```ts
import * as Notifications from 'expo-notifications';

const { status } = await Notifications.requestPermissionsAsync();
const token = (await Notifications.getExpoPushTokenAsync()).data;
// 把 token 发给后端

// 监听
Notifications.addNotificationReceivedListener(n => console.log(n));
```

后端用 [Expo Push API](https://docs.expo.dev/push-notifications/sending-notifications/) 推送,**iOS / Android 一个 API 搞定**。

或自己接 APNS / FCM 也行,但麻烦。

---

## 九、深链接 / Universal Links

```
普通:myapp://product/123       (要装 App 才能开)
Universal Link:https://myapp.com/product/123
                装了 App → App 打开
                没装 → 网页打开
```

需要在 Apple / Google 后台配 + 网站根目录放 `apple-app-site-association` / `assetlinks.json`。

```ts
// Linking
import { Linking } from 'react-native';
const url = await Linking.getInitialURL();    // App 启动是被链接打开?
Linking.addEventListener('url', ({ url }) => { /* 处理 */ });
```

Expo Router 内置支持,URL 直接对应路由。

---

## 十、商店上架 checklist

### iOS App Store

- [ ] Apple Developer 账号
- [ ] App Store Connect 创建 App
- [ ] Bundle ID / 证书 / Provisioning Profile
- [ ] App 图标(1024x1024)+ 各种尺寸
- [ ] 截图(iPhone / iPad 不同尺寸)
- [ ] 隐私政策 URL(必填)
- [ ] App 跟踪透明度(ATT)合规
- [ ] 不准提"按钮跳转外部支付"
- [ ] TestFlight 内测
- [ ] 提交审核(1~3 天)

### Google Play

- [ ] Google Play Console 账号($25 一次性)
- [ ] 签名 keystore(妥善保管,丢了完蛋)
- [ ] App 信息 + 截图
- [ ] 隐私政策 + 数据安全声明(2024 严格)
- [ ] 内测 / 公开测试
- [ ] 上线(几小时~几天)

---

## 十一、心智模型

```
跨端三条路:
  WebView 套壳     Capacitor / Tauri Mobile     Web 团队最简,体验中
  渲染原生组件     RN(JS)/ Flutter(Dart)        体验好,要学新东西
  纯原生         Swift / Kotlin                体验最好,代码两份

选型:
  既要 Web 又要 App + 中等体验   →  Capacitor + 一套 Web 代码
  追求原生体验 + Web 团队        →  React Native(+ Expo)
  追求最佳性能 + UI 一致性       →  Flutter(详见 flutterLearning/)
  完全独立的高端 App             →  原生

通用关键:
  - UI 适配 iOS / Android 设计语言
  - 商店审核要预留时间
  - 推送 / 深链 / 支付 平台差异
  - 敏感数据 Keychain / Keystore
  - OTA 更新(EAS update / CodePush)能省很多时间
```

---

## 十二、推荐学习路径

如果你想入门 RN:
1. **跑 Expo Tutorial**:https://docs.expo.dev/tutorial/(2 天)
2. 写一个 Todo / Notes app(3 天)
3. 加 react-navigation + AsyncStorage + 推送
4. 用 EAS build + 真机跑
5. 选做:发到 TestFlight 给朋友测

如果你想入门 Capacitor:
1. 已有 Web 项目,30 分钟跟官方 quickstart
2. 加几个 plugin(Camera / Geolocation)
3. 在 Xcode / Android Studio 跑
4. 真机调试 + 解决兼容问题
5. 上架(过审节奏会教育你 i18n / 隐私 / 设计)

---

## 十三、参考资源

- React Native:https://reactnative.dev
- Expo:https://expo.dev
- React Navigation:https://reactnavigation.org
- NativeWind:https://www.nativewind.dev
- Tamagui:https://tamagui.dev
- Capacitor:https://capacitorjs.com
- Ionic Framework:https://ionicframework.com
- EAS:https://expo.dev/eas
- 移动 UI 设计:Apple HIG / Material Design 3

---

## 全 50 篇完结

恭喜!Web Learning 系列**全部 50 篇**完工,覆盖一个 2025 现代 Web 工程师的完整知识图:

```
01-10  React 系列
11-17  Vue 系列
18-24  Angular 系列
25-28  SolidJS 系列
29-32  基础(CSS / TS / JS 异步)
33-38  工程化(构建 / 测试 / 安全 / 后端 / 数据库 / 部署)
39-42  进阶(性能 / 实时 / PWA / 渲染原理)
43-50  专题(Wasm / Web Components / 微前端 / 图形 / a11y / i18n / 桌面 / 跨端)
```

下一步还是那句话:**做项目 > 看文档**。这套笔记是你随时回来翻的字典,真正的成长来自动手。

如果按主题做项目,推荐路线:
1. 用 React + Tailwind + TanStack Query 做一个全栈 SaaS(覆盖 React/CSS/数据/路由/认证)
2. 加 Vite monorepo 拆出移动端(用 Expo / Capacitor)
3. 加性能优化 + i18n + a11y
4. 部署 + CI/CD + 监控
5. 选个进阶专题深挖(Wasm / 3D / 微前端)

每完成一步,你都比 90% 的前端"知道得多"。

祝学习愉快。
