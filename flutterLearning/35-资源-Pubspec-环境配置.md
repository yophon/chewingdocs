# Flutter 资源 / Pubspec / 环境配置

工程化基础三件套。`pubspec.yaml` 是 Flutter 项目的"心脏",资源 / 依赖 / 平台配置都在这。

---

## 一、pubspec.yaml 完整结构

```yaml
name: my_app                 # 包名,小写下划线
description: My Flutter app  # 描述
publish_to: 'none'           # 不发布到 pub.dev
version: 1.0.0+1             # 版本号 + build 号
homepage: https://...

environment:
  sdk: '>=3.4.0 <4.0.0'      # Dart SDK 版本约束
  flutter: '>=3.24.0'        # Flutter 版本约束

dependencies:
  flutter:
    sdk: flutter
  flutter_localizations:
    sdk: flutter
  cupertino_icons: ^1.0.8
  dio: ^5.7.0
  riverpod: ^2.5.1

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^4.0.0
  build_runner: ^2.4.9

flutter:
  uses-material-design: true
  generate: true             # 启用 l10n 代码生成

  assets:
    - assets/images/
    - assets/icons/
    - assets/data/config.json

  fonts:
    - family: Inter
      fonts:
        - asset: assets/fonts/Inter-Regular.ttf
        - asset: assets/fonts/Inter-Bold.ttf
          weight: 700
```

---

## 二、版本号规则(SemVer)

```
^1.2.3   ≥ 1.2.3, < 2.0.0    (最常用,大版本不变)
~1.2.3   ≥ 1.2.3, < 1.3.0    (小版本不变)
1.2.3    精确等于
>=1.2.3 <2.0.0  范围
any     任意版本(慎用)
```

`^` 是默认推荐:**自动接受小升级和补丁**,但不会跨大版本。

---

## 三、依赖类型

### 1. pub.dev 包

```yaml
dependencies:
  dio: ^5.7.0
```

### 2. Git 依赖

```yaml
dependencies:
  my_pkg:
    git:
      url: https://github.com/xxx/yyy.git
      ref: main              # 分支 / tag / commit
      path: packages/my_pkg  # monorepo 子目录
```

适合**还没发布的内部包**或 **fork 的修复版**。

### 3. 本地路径

```yaml
dependencies:
  shared_models:
    path: ../shared_models
```

适合 monorepo / 同事共享开发。

### 4. SDK 依赖

```yaml
dependencies:
  flutter:
    sdk: flutter
```

固定的 Flutter SDK 包,不写版本。

---

## 四、依赖覆盖(dependency_overrides)

某个 transitive 依赖版本冲突,强制用某版:

```yaml
dependencies:
  package_a: ^1.0.0    # 它依赖 some_pkg ^2.0
  package_b: ^1.0.0    # 它依赖 some_pkg ^3.0

dependency_overrides:
  some_pkg: ^3.0.0     # 强制用 3.0
```

⚠️ **临时方案**,可能造成不兼容。优先升级或换包。

---

## 五、常用命令

```bash
flutter pub get              # 装依赖
flutter pub upgrade          # 升级到最新允许版本
flutter pub outdated         # 看哪些可升级
flutter pub add dio          # 添加依赖
flutter pub remove dio       # 移除
flutter pub deps             # 显示依赖树
flutter pub publish --dry-run  # 检查发布前的问题

flutter pub cache clean      # 清缓存
```

`flutter pub get` 大部分时候**不需要手动跑**,IDE 会自动检测 pubspec 变化。

---

## 六、资源(Assets)配置

### 单个文件

```yaml
flutter:
  assets:
    - assets/data/config.json
    - assets/images/logo.png
```

### 整个目录(注意斜杠)

```yaml
flutter:
  assets:
    - assets/images/      # 目录
    - assets/icons/
```

⚠️ **不递归子目录**!子目录要单独列:

```yaml
assets:
  - assets/images/
  - assets/images/icons/
  - assets/images/avatars/
```

### 使用

```dart
Image.asset('assets/images/logo.png')
DefaultAssetBundle.of(context).loadString('assets/data/config.json')
```

### 多分辨率(自动选)

```
assets/images/logo.png       (1x)
assets/images/2.0x/logo.png  (2x for high-DPI)
assets/images/3.0x/logo.png  (3x for iPhone)
```

只在 pubspec 写 `assets/images/logo.png` 一行,Flutter 自动按设备 DPR 选最合适的。

---

## 七、字体配置

```yaml
flutter:
  fonts:
    - family: Inter
      fonts:
        - asset: assets/fonts/Inter-Regular.ttf
        - asset: assets/fonts/Inter-Bold.ttf
          weight: 700
        - asset: assets/fonts/Inter-Italic.ttf
          style: italic
```

```dart
Text('Hi', style: TextStyle(fontFamily: 'Inter'))
// 或全局 ThemeData(fontFamily: 'Inter')
```

回顾 17。

### 中英混排 fallback

```dart
TextStyle(
  fontFamily: 'Inter',
  fontFamilyFallback: ['黑体', 'PingFang SC'],
)
```

---

## 八、应用图标

不要手写各分辨率,用 `flutter_launcher_icons`:

```yaml
dev_dependencies:
  flutter_launcher_icons: ^0.13.1

flutter_launcher_icons:
  android: true
  ios: true
  image_path: assets/icon/icon.png        # 1024x1024
  adaptive_icon_background: '#FFFFFF'
  adaptive_icon_foreground: assets/icon/icon_fg.png
  web:
    generate: true
    image_path: assets/icon/icon.png
  windows:
    generate: true
  macos:
    generate: true
```

```bash
dart run flutter_launcher_icons
```

回顾 19。

---

## 九、启动屏

```yaml
dev_dependencies:
  flutter_native_splash: ^2.4.1

flutter_native_splash:
  color: '#FFFFFF'
  image: assets/splash.png
  android_12:
    image: assets/splash_android12.png
    color: '#FFFFFF'
  ios_content_mode: center
```

```bash
dart run flutter_native_splash:create
```

---

## 十、环境变量:--dart-define

编译时注入,不是运行时配置:

```bash
flutter run --dart-define=API_URL=https://api.dev.com
flutter build apk --dart-define=API_URL=https://api.prod.com
```

代码读:

```dart
const apiUrl = String.fromEnvironment('API_URL', defaultValue: 'https://api.test.com');
const debugMode = bool.fromEnvironment('DEBUG_MODE', defaultValue: false);
const port = int.fromEnvironment('PORT', defaultValue: 8080);
```

⚠️ **`String.fromEnvironment` 必须用 `const`**,否则永远是默认值。

### --dart-define-from-file(推荐)

把所有环境变量放一个 JSON,免得命令行长一公里:

```json
// env/dev.json
{
  "API_URL": "https://api.dev.com",
  "DEBUG_MODE": true,
  "SENTRY_DSN": ""
}
```

```bash
flutter run --dart-define-from-file=env/dev.json
flutter build apk --dart-define-from-file=env/prod.json
```

不同环境用不同 json,git 里**只提交模板,真值用 .env.local 之类**。

---

## 十一、flavor:多变体打包

flavor = "同一份代码,不同应用 ID / 名称 / 图标 / 配置"。常见:

- `dev` / `staging` / `prod` 三套
- 同一套代码出 "客户 A 版" 和 "客户 B 版"(白标 App)

### Android flavor

`android/app/build.gradle`:

```gradle
android {
    flavorDimensions "default"

    productFlavors {
        dev {
            dimension "default"
            applicationIdSuffix ".dev"
            versionNameSuffix "-dev"
            resValue "string", "app_name", "MyApp Dev"
        }
        prod {
            dimension "default"
            resValue "string", "app_name", "MyApp"
        }
    }
}
```

### iOS flavor

Xcode 里复制 Configuration → 改 PRODUCT_BUNDLE_IDENTIFIER,流程比 Android 麻烦,详见 Flutter 官方 flavor 文档。

### 命令

```bash
flutter run --flavor dev -t lib/main_dev.dart
flutter build apk --flavor prod -t lib/main_prod.dart
```

`-t` 指定入口文件,通常每个 flavor 一个:

```dart
// lib/main_dev.dart
void main() {
  Env.config = DevConfig();
  runApp(MyApp());
}

// lib/main_prod.dart
void main() {
  Env.config = ProdConfig();
  runApp(MyApp());
}
```

回顾 19。

---

## 十二、配置策略对比

```
方案                  优点                缺点
------------         ----------          ----------
const fromEnvironment  编译时确定,快       改要重编
.env 文件 + flutter_dotenv  运行时改       性能稍弱,需读文件
flavor                  完整应用变体         配置最重
后端配置 + 缓存          完全动态             首次依赖网络
```

实战推荐:

- 服务端 URL、构建号 → `--dart-define`
- 应用名 / 图标 / Bundle ID → flavor
- 运营开关、A/B 测试 → 后端配置 + Firebase Remote Config

---

## 十三、Lint 配置:analysis_options.yaml

代码质量基础:

```yaml
include: package:flutter_lints/flutter.yaml

analyzer:
  language:
    strict-casts: true
    strict-inference: true
    strict-raw-types: true
  errors:
    invalid_annotation_target: ignore
  exclude:
    - lib/generated/**
    - "**/*.g.dart"
    - "**/*.freezed.dart"

linter:
  rules:
    - prefer_const_constructors
    - prefer_const_literals_to_create_immutables
    - avoid_print
    - require_trailing_commas
    - prefer_single_quotes
    - sort_constructors_first
    - use_super_parameters
```

`flutter_lints` 是官方推荐基础,在它之上加自己团队的偏好。

```bash
flutter analyze       # 跑一遍 lint
dart fix --apply      # 自动修
```

---

## 十四、平台特定配置

### Android

`android/app/build.gradle`:

```gradle
android {
    namespace "com.example.myapp"
    compileSdkVersion 34

    defaultConfig {
        applicationId "com.example.myapp"
        minSdkVersion 21
        targetSdkVersion 34
        versionCode flutterVersionCode.toInteger()
        versionName flutterVersionName
    }
}
```

`AndroidManifest.xml`:

```xml
<application
  android:label="MyApp"
  android:icon="@mipmap/ic_launcher"
  android:networkSecurityConfig="@xml/network_security_config">

  <activity android:name=".MainActivity" ...>
    ...
  </activity>
</application>
```

权限 / Intent Filter / 文件提供者等。

### iOS

`ios/Runner/Info.plist`:

```xml
<key>CFBundleName</key>           <!-- 应用名 -->
<string>MyApp</string>

<key>NSCameraUsageDescription</key>     <!-- 权限说明 -->
<string>用于拍照</string>

<key>UIApplicationSceneManifest</key>
<dict>...</dict>

<key>FlutterDeepLinkingEnabled</key>
<true/>
```

---

## 十五、.gitignore 必备

```
# Flutter
.dart_tool/
.flutter-plugins
.flutter-plugins-dependencies
.packages
.pub-cache/
.pub/
build/

# Generated
**/*.g.dart
**/*.freezed.dart
**/*.mocks.dart
**/generated_plugin_registrant.dart

# IDE
.idea/
.vscode/
*.iml

# Android
android/app/google-services.json    # 看团队约定
android/key.properties              # ⚠️ 永远不进 git
*.jks
*.keystore

# iOS
ios/Runner/GoogleService-Info.plist  # 看团队约定
ios/Pods/
ios/.symlinks/

# Env
.env
.env.local
*.local.json
```

---

## 十六、推荐目录结构

```
my_app/
├── android/
├── ios/
├── web/
├── windows/
├── macos/
├── linux/
├── lib/
│   ├── main.dart
│   ├── main_dev.dart
│   ├── main_prod.dart
│   ├── app.dart
│   ├── core/             # 通用基础
│   │   ├── env/
│   │   ├── network/
│   │   ├── error/
│   │   └── utils/
│   ├── features/         # feature-first(回顾 21)
│   │   ├── auth/
│   │   ├── home/
│   │   └── profile/
│   ├── l10n/             # 国际化 ARB
│   │   ├── app_zh.arb
│   │   └── app_en.arb
│   ├── routing/          # 路由
│   └── injection.dart    # DI 注册
├── assets/
│   ├── images/
│   ├── icons/
│   └── fonts/
├── env/
│   ├── dev.json
│   ├── staging.json
│   └── prod.json
├── test/
├── integration_test/
├── pubspec.yaml
├── analysis_options.yaml
└── README.md
```

---

## 十七、常见坑

### 1. assets 配置了但找不到

```yaml
assets:
  - assets/images/logo.png
```

→ 检查文件路径大小写、缩进必须用空格(不能 tab)。

### 2. 子目录不递归

```yaml
assets:
  - assets/    # ❌ 不会包含 assets/images/
```

→ 每层目录单独写。

### 3. flutter_lints 报红一片

新项目 `flutter_lints` 默认很严,**别全 ignore**。逐个修(IDE 多数能一键修)。

### 4. dart-define 不生效

```dart
final url = String.fromEnvironment('API_URL');   // ❌ 没 const,运行时空
const url = String.fromEnvironment('API_URL');   // ✅
```

### 5. iOS 改了 Info.plist 不生效

→ Pod install 之后 Xcode 还要 Clean Build Folder(`Cmd+Shift+K`)。

### 6. Android 改包名

`android/app/build.gradle` 改 `applicationId` 和 `namespace`,然后 Kotlin 文件夹也要重命名,**漏一处就崩**。
**最稳**:用 `change_app_package_name` 包自动改。

### 7. 多平台资源不一致

iOS 用 `assets/`,Android 用 `mipmap` / `drawable`。**应用图标 / 启动屏走原生**,业务图标走 Flutter assets。

---

## 十八、依赖管理建议

1. **不要随便加包**:每加一个评估必要性,大包(graphql_flutter、firebase)体积惊人
2. **定期 pub outdated** 看升级,但不轻易升大版本
3. **lock 文件提交 git**(`pubspec.lock`):保证团队 / CI 用相同版本
4. **分类**:
   - 真依赖 → `dependencies`
   - 工具(lint / build_runner)→ `dev_dependencies`
5. **少用 git 依赖**:CI 不稳定,优先 fork 后发布到 pub.dev

---

## 十九、和已学知识的串联

- l10n 的 ARB 文件(17)放 `lib/l10n/`
- 字体配置(17)在 fonts 区
- 应用图标 / Splash(19)用 dev 包生成
- env JSON 喂 const fromEnvironment(36 / 19)
- 每个 feature 的依赖按需导入,monorepo 用 path 依赖(21)

---

## 二十、心智模型

```
pubspec.yaml = 项目身份证 + 依赖清单 + 资源清单

资源        :assets / fonts(子目录不递归)
依赖        :dependencies / dev_dependencies / overrides
应用变体    :flavor + main_xxx.dart
环境配置    :--dart-define-from-file
代码质量    :analysis_options.yaml + flutter_lints
版本号      :version: 1.2.3+45(后面的是 build 号)
```

`pubspec` 看着简单,**但是项目工程化的入口**。每次新项目花 30 分钟把这些配好,后期省下来的时间是几倍。
