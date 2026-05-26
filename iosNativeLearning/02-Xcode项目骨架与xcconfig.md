# Xcode 项目骨架与 xcconfig

第一篇讲了"那棵树长什么样",这一篇讲"树长在什么样的土壤里"——Xcode 项目结构、Build Settings、xcconfig 分环境配置、Info.plist generated 模式、Asset Catalog、Workspace。

> 一句话先记住:**Xcode 项目不是一个目录,是一个 `.xcodeproj` bundle 里的 `project.pbxproj` 描述符 + 一堆引用关系**。所有"项目结构"问题最终都是 pbxproj 与 build settings 的问题——而 pbxproj 是个**容易冲突、不可读、改起来要点技巧**的文件。这就是 xcconfig 与 SPM 在现代 iOS 开发里地位上升的根本原因。

---

## 一、新建项目时不要勾的那几个框

Xcode 16 → File → New → Project → iOS App,模板默认勾选了一堆"贴心选项",**新人最常踩的坑是把每个都勾上**:

| 选项 | 该不该勾 | 原因 |
| --- | --- | --- |
| Interface = SwiftUI | ✅ 勾 | 唯一选择;不要选 Storyboard |
| Language = Swift | ✅ 勾 | OC 不在主线 |
| Storage = None | ✅ 选 None | 模板生成的 SwiftData / Core Data 是老样板,12 篇自己写更现代 |
| Include Tests | ❌ 不勾 | 测试到 26 篇统一加,提早勾会塞一堆空 boilerplate |
| Use Core Data | ❌ 不勾 | 现代 iOS 用 SwiftData,Core Data 只在必要时回落 |
| Host in CloudKit | ❌ 不勾 | 12 篇手动接 CloudKit |

勾选完只剩一个 `.xcodeproj` + 一个 `App` 入口文件 + `Assets.xcassets` + `Preview Content/`,这是最干净的起点。

> 创建完第一件事:**关掉 Xcode,用 VSCode 或者 finder 看一眼目录结构**。Xcode 的 Project Navigator 不是真实目录映射,它把所有文件按 pbxproj 的 group 摆,而 group 与磁盘目录可能不一致。学 iOS 必须建立"磁盘目录 ≠ Project Navigator"的心智,不然后面合并冲突会卡很久。

---

## 二、Xcode 项目的物理结构

```
NotesIsland/
├── NotesIsland.xcodeproj/         ← bundle,本质是目录
│   ├── project.pbxproj            ← 项目描述符,易冲突,改要小心
│   ├── xcshareddata/              ← 共享 scheme(进 git)
│   │   └── xcschemes/
│   │       └── NotesIsland.xcscheme
│   └── xcuserdata/                ← 用户私有(不进 git)
│       └── *.xcuserdatad/
│
├── NotesIsland/                   ← 主 target 目录
│   ├── App/
│   │   ├── NotesIslandApp.swift   ← @main App 入口
│   │   └── RootView.swift
│   ├── Features/                  ← 按特性分组
│   │   └── Notes/
│   │       ├── NoteListView.swift
│   │       └── NoteRow.swift
│   ├── Resources/
│   │   ├── Assets.xcassets/       ← 图片 / 颜色
│   │   └── Localizable.xcstrings  ← 翻译(23 篇)
│   ├── Config/
│   │   ├── Debug.xcconfig
│   │   ├── Release.xcconfig
│   │   └── Shared.xcconfig
│   └── Info.plist                 ← 大部分键由 build settings 生成(下面讲)
│
├── Packages/                      ← 本地 SPM 包(26 篇模块化时长出来)
│   ├── NotesCore/
│   └── NotesUI/
│
└── .gitignore                     ← 必含 xcuserdata、DerivedData、*.xcworkspace/xcuserdata
```

`.xcodeproj` 是 bundle,**直接 cd 进去能看到内部文件**。`project.pbxproj` 是 ASCII plist 格式,Xcode 自动维护——但它**保存了所有文件引用、build phase、build settings**,两个分支同时改 `pbxproj` 一定冲突。

> 处理 `pbxproj` 冲突的两种姿势:**手动解 + 在 Xcode 里重打开验证**(熟手),或者**抛弃冲突方,选一方完整版本,然后手动重做对方的改动**(新人)。git 系列的 [[gitLearning/07-merge合并与冲突]] 里说过"冲突就是看 diff 就懂",但 pbxproj 是个例外——它的 diff 难读,所以更鼓励"分支不要长时间偏离 main"。

---

## 三、xcconfig:把 Build Settings 从 Xcode 拽到 git 里

Xcode 的 Build Settings 默认存在 `project.pbxproj` 里,改一个值就触发 pbxproj diff,且**改完看不到改了哪里**。专业做法是把 build settings 移到 `.xcconfig` 文件:**纯文本,git 友好,review 时一目了然**。

```
// File: Config/Shared.xcconfig
// 所有 configuration 共享

PRODUCT_BUNDLE_IDENTIFIER = com.example.NotesIsland
PRODUCT_NAME = NotesIsland
MARKETING_VERSION = 1.0.0
CURRENT_PROJECT_VERSION = 1

IPHONEOS_DEPLOYMENT_TARGET = 18.0
TARGETED_DEVICE_FAMILY = 1,2  // 1=iPhone, 2=iPad

SWIFT_VERSION = 6.0
SWIFT_STRICT_CONCURRENCY = complete
SWIFT_UPCOMING_FEATURE_EXISTENTIAL_ANY = YES
SWIFT_UPCOMING_FEATURE_INTERNAL_IMPORTS_BY_DEFAULT = YES

ENABLE_USER_SCRIPT_SANDBOXING = YES
DEAD_CODE_STRIPPING = YES

// 资产目录
ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon
ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME = AccentColor
```

```
// File: Config/Debug.xcconfig
#include "Shared.xcconfig"

SWIFT_OPTIMIZATION_LEVEL = -Onone
SWIFT_ACTIVE_COMPILATION_CONDITIONS = DEBUG
GCC_PREPROCESSOR_DEFINITIONS = DEBUG=1 $(inherited)

// 区分 bundle id,Debug / Release 可以并存
PRODUCT_BUNDLE_IDENTIFIER = com.example.NotesIsland.debug
```

```
// File: Config/Release.xcconfig
#include "Shared.xcconfig"

SWIFT_OPTIMIZATION_LEVEL = -O
SWIFT_COMPILATION_MODE = wholemodule
ENABLE_BITCODE = NO  // iOS 14+ 已不要求
VALIDATE_PRODUCT = YES
```

在 Xcode 里把这两个 xcconfig 关联到对应的 Configuration:**Project → Info → Configurations**,Debug 行选 `Debug.xcconfig`,Release 选 `Release.xcconfig`。

**关联完之后,Build Settings 面板里那些值会带一个浅色背景**——表示来自 xcconfig 而不是 pbxproj。从此刻起,改 settings 直接改 xcconfig 文本文件,pbxproj 几乎不再动。

> 没有 xcconfig 的项目,review 一次 build settings 改动等于看一遍 pbxproj 的乱码 diff;有 xcconfig 的项目,settings 改动就是几行 KV 文本——这两件事的工程舒适度天差地别。**新项目第一周就该把 xcconfig 立起来,不要等改了 200 个 settings 之后再重构。**

---

## 四、Info.plist 的现代写法:generated + 部分裸键

Xcode 14 起,大部分 `Info.plist` 键不再需要写在文件里,而是**从 Build Settings 生成**。`Info.plist` 现在只保留两类内容:

1. **`xcconfig` / build settings 表达不了的复杂结构**(数组、嵌套字典)——比如 `NSAppTransportSecurity`、`UIBackgroundModes`、`NSUserActivityTypes`。
2. **权限 usage description**(`NSCameraUsageDescription` 等)——18 篇会详细讲。

典型现代 `Info.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" ...>
<plist version="1.0">
<dict>
    <key>NSCameraUsageDescription</key>
    <string>需要相机权限以拍摄笔记附图</string>
    <key>NSMicrophoneUsageDescription</key>
    <string>需要麦克风权限以录制音频笔记</string>
    <key>NSPhotoLibraryAddUsageDescription</key>
    <string>需要相册权限以保存图片到相册</string>

    <key>UIBackgroundModes</key>
    <array>
        <string>remote-notification</string>
        <string>processing</string>
    </array>
</dict>
</plist>
```

`CFBundleIdentifier` / `CFBundleVersion` / `CFBundleShortVersionString` 这些**完全不要写在 plist 里**——它们由 `PRODUCT_BUNDLE_IDENTIFIER` / `CURRENT_PROJECT_VERSION` / `MARKETING_VERSION` 生成。**重复写会导致 build settings 改了但 plist 没改的诡异错位**。

`PrivacyInfo.xcprivacy`(Privacy Manifest)是 2024 年起 Apple 强制的另一个 plist,在 18 篇展开。

---

## 五、Asset Catalog 与 SF Symbols

`Assets.xcassets` 是 iOS 资源管理的**唯一推荐方式**:图标、颜色、数据、AR 模型都进 catalog,Xcode 帮你做 1x/2x/3x 选择、dark mode 变体、device 适配。

```
Assets.xcassets/
├── AppIcon.appiconset/        ← App 图标(1024×1024 一张,Xcode 自动切多 size)
├── AccentColor.colorset/      ← 全 App 主色,系统会自动应用
├── BrandPrimary.colorset/     ← 自定义颜色,带 light/dark 双变体
│   └── Contents.json
├── Hero.imageset/             ← 自定义图片
│   ├── hero@1x.png
│   ├── hero@2x.png
│   └── hero@3x.png
└── Contents.json
```

代码里这样用:

```swift
Image("Hero")               // 从 catalog 拿
Image(systemName: "trash")  // SF Symbols 系统符号
Color("BrandPrimary")       // 自定义颜色
Color.accentColor           // 主色,会自动响应 dark mode
```

**SF Symbols 是 Apple 出的系统级矢量图标库**(下载 SF Symbols 4 应用查),覆盖 6000+ 图标,统一颜色 / weight / 三种渲染模式(monochrome / hierarchical / palette / multicolor)。能用 SF Symbols 就不要切自己的 png——它**自动跟随 Dynamic Type、自动适配 dark mode、文字大小变它跟着变**,是 iOS 视觉一致性的关键。

```swift
Image(systemName: "heart.fill")
    .font(.title2)
    .symbolRenderingMode(.palette)
    .foregroundStyle(.red, .pink)
```

---

## 六、Workspace vs Project:什么时候需要 `.xcworkspace`

新建项目默认只产生 `.xcodeproj`。`.xcworkspace` 是**多 project 容器**,典型出现场景:

1. **用 CocoaPods**——它会生成 `Pods.xcodeproj` 并要求你打开 `.xcworkspace`。但 CocoaPods 在 2026 年已经不是主流,新项目首选 SPM。
2. **多 project 的 monorepo**——比如你的 App + 一个分发给客户的 SDK 框架 + 几个共享库,每个独立 `.xcodeproj`,用 workspace 串起来一起调试。

**只用 SPM 的单 App 项目根本不需要 workspace**——直接打开 `.xcodeproj`,SPM 依赖在 Xcode 里通过 File → Add Package Dependencies 添加,会写进 `project.pbxproj` 的 `XCRemoteSwiftPackageReference` 段。

> 多模块化(26 篇)在 iOS 的现代做法是 **App 工程 + 一组本地 SPM 包**,不是多 project + workspace。本地 SPM 包用 `Package.swift` 描述,远比额外开 project 轻。

---

## 七、Build Configuration / Scheme / Target 三件事

| 名词 | 是什么 | 改什么 |
| --- | --- | --- |
| **Configuration** | 构建配置(Debug / Release / Staging) | 编译开关、宏、优化级别、bundle id 后缀 |
| **Scheme** | 一组运行 / 测试 / 归档动作的组合 | 选哪个 target / 哪个 configuration / 哪些 test |
| **Target** | 一个可独立产物的单位(App、Widget、Test、Framework) | 文件归属、capabilities、entitlements |

一个**典型多环境**项目长这样:

```
Targets:
  - NotesIsland       (主 App)
  - NotesIslandTests  (单元测试)
  - NotesIslandUITests(UI 测试)
  - NotesWidget       (Widget Extension,20 篇展开)
  - NotesNotificationService (Notification Service Extension,16 篇)

Configurations:
  - Debug    → 连 staging API,bundle id = .debug
  - Staging  → 连 staging API,bundle id = .staging,用 ad-hoc 证书
  - Release  → 连生产 API,bundle id = 正式,用 distribution 证书

Schemes:
  - NotesIsland (Debug)        → 日常开发
  - NotesIsland (Staging)      → 内测包
  - NotesIsland (Release)      → 上架
```

`Staging` 这种自定义 configuration **不是新建一个分支**,而是在 Project → Info → Configurations 加一行,然后给它指定 xcconfig。多出来的好处是 TestFlight 上能装多套 build 共存——bundle id 不同,系统当三个不同 App。

---

## 八、踩坑

1. **改 build settings 不走 xcconfig**——一时改得快,一周后 review 时 pbxproj 全是脏 diff,谁改了什么没人能说清。第一周就立 xcconfig。
2. **`CFBundleVersion` 既在 plist 又在 build settings**——Xcode 会优先 build settings 但 plist 里的版本号肉眼可见,review 时容易看错,真正发包时也容易卡在审核(版本号未递增)。一律删掉 plist 里的版本号字段,只在 xcconfig 里维护。
3. **prefix header / bridging header / module map 都加上**——OC 时代的产物,纯 Swift 工程不需要。模板里如果有,删掉。
4. **`.xcuserdata` / `DerivedData` 进了 git**——会带来大量无意义 diff。`.gitignore` 第一行就要排除 `xcuserdata/`、`DerivedData/`、`*.xcworkspace/xcuserdata/`、`build/`。
5. **`Storage = SwiftData` 模板直接用**——生成的 `Item.swift` + `ContentView.swift` 把 model 和 view 揉在 70 行里,远比手写差。新建项目时永远选 `Storage = None`。
6. **Workspace 跟 CocoaPods 一起拖进新项目**——2026 年新项目不要用 CocoaPods,SPM 已经在 Xcode 原生集成,无需 workspace。
7. **deployment target 选最低版本兼容老用户**——别为了 2% 的 iOS 16 用户,把整个工程绑死在没有 `@Observable` / `@Entry` / 现代 SwiftData 的版本上。iOS 18 是 2026 的甜点。
8. **多环境靠 `#if DEBUG` 满天飞**——更现代的做法是 xcconfig + `SWIFT_ACTIVE_COMPILATION_CONDITIONS` 一处定义,代码里 `#if STAGING` 这种就少得多。
9. **手动维护 build version**——CI 上传 build 时容易撞已用版本号被拒。在 CI 脚本里 `agvtool next-version -all` 自增,或者用 `$(GIT_COMMIT_COUNT)` 之类的 build phase script。
10. **不写 `xcshareddata/xcschemes/`**——scheme 默认存在 `xcuserdata/`,不进 git,新人 clone 仓库后没有任何 scheme 可用。每次新增 scheme 一定要勾"Shared"。

---

下一篇 `03-Swift6类型系统.md`,讲值类型与引用类型、`struct` vs `class` 内存语义、`protocol` + `associatedtype`、opaque return (`some View`) 与 existential (`any Error`)、`@frozen` 与 `@inlinable` 的工程意义、与 Kotlin / Rust / TS 类型系统的对照。
