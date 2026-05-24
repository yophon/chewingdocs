# 02 Xcode 16 项目结构、Bundle、Info.plist 与 xcconfig

> 上一篇把 `@main App` 入口立起来了,这一篇把它「埋」进真正可以多人协作、多环境部署、能上架的工程结构里。讲清五件事:**Project 与 Workspace 的差别、Scheme 与 Build Configuration 各管什么、`Info.plist` 在 Xcode 13+ 之后已经不是你印象中那张老脸、`xcconfig` 怎么把环境配置从 GUI 里解放出来、Asset Catalog 与 SF Symbols 取代旧资源管理的正确姿势**。读完后 NotesIsland 工程会有 Debug / Beta / Release 三套构建配置、对应的 Bundle ID、对应的服务端域名,且**不在 Xcode GUI 里点任何东西就能切换**。

---

## 一、机制定位:为什么项目结构值得专门讲一篇

很多教程直接跳到「写 UI」,把项目结构当作 Xcode 默认模板。结果三个月后会撞上这些问题:

- 公司多人协作,`project.pbxproj` 文件每次 commit 都冲突;
- 想做「Beta 版指向 staging 服务器,Release 指向生产」,只能在代码里写 `#if DEBUG`,正式打包前还得手动改一遍;
- 想给 Beta 版换图标和 Bundle Display Name,翻 Xcode GUI 翻半天,最后还忘了 Localized name;
- 新人接手,改一个 capability(比如打开 Background Modes 的 Audio),想找它在 Info.plist 的对应位置——发现 Info.plist 文件根本不存在,但项目能跑;
- 第三方 SDK 要求加一段 `NSAppTransportSecurity`,加了之后 Debug 能跑,Archive 后审核被拒,因为它进了 Release。

这些坑全都不在「Swift 语言」层,全在「Xcode 工程化」层。这一层不打通,后面 28 篇写得再好,工程仍然是脆弱的。

**核心心智:把「代码」「资源」「构建配置」三件事彻底分开**。代码靠 Swift 编译;资源靠 Asset Catalog;构建配置靠 `xcconfig` + Scheme。三者各管各的,不互相染色。

只要这条分离做到位,后面的多人协作、多环境构建、CI 自动化全部水到渠成;做不到,那么每加一项需求都要在 Xcode GUI 里点几十下,且每次点完都怀疑自己点漏了什么。这一篇花的时间,会在后续 28 篇里以「不撞工程墙」的形式连本带利还回来。

---

## 二、Apple 平台心智

### 1. Project 与 Workspace

| 概念 | 文件后缀 | 内容 | 何时用 |
| --- | --- | --- | --- |
| Project | `.xcodeproj` | 一个或多个 target、build settings、文件引用 | 单一工程,无外部依赖或只用 SPM |
| Workspace | `.xcworkspace` | 一个或多个 Project + SPM packages | 多工程组合、CocoaPods 时代必备 |

**2026 年的实践:优先开 `.xcodeproj`,只在拆 SPM 子包后才升级到 `.xcworkspace`。** CocoaPods 已经退潮,Apple 官方推 SPM,SPM 直接在 Project 里用「File → Add Package Dependencies」就能加,不需要 Workspace 当壳。本系列只在第 28 篇拆 SPM 模块时引入 Workspace。

`.xcodeproj` 实际上是一个目录(包含 `project.pbxproj` 文本文件、`xcshareddata/` 共享数据、`xcuserdata/` 用户私有数据),`.xcworkspace` 也是目录(包含 `contents.xcworkspacedata` 与同样的 `xcshareddata`)。**`.xcuserdata` 目录里是用户的 IDE 状态(展开了哪些 group、断点在哪、用了哪个 Scheme),要加进 `.gitignore`**——多人协作时这个目录的差异是噪音,不应该被版本控制。Apple 官方 .gitignore 模板已经处理了这一项,但 Xcode 新建项目时只会生成基础的 .gitignore,需要手动补全;GitHub 的 swift 模板(`github/gitignore/Swift.gitignore`)是社区共识的较完整版本,可以直接抄。

### 2. Target、Scheme、Build Configuration 三个名词

新人最容易混的三个词,各管的事完全不同:

- **Target**:一个可构建产物,可以是 App、Extension、Framework、UI Test Bundle、Widget Extension。一个 Project 可以有多个 Target。
- **Build Configuration**:一组构建参数集合。默认两个:`Debug` 与 `Release`。可以自己加,比如 `Beta`。
- **Scheme**:把 Target + Build Configuration 绑成「一次可执行的构建任务」。比如「Scheme: NotesIsland-Beta」=「Target: NotesIsland + Build Configuration: Beta」。Scheme 也决定 Run / Test / Profile / Archive 分别用哪个 Configuration。

三者关系:

```
Project
 └── Target: NotesIsland
       └── Build Settings(每种 Configuration 一套)
             ├── Debug   ─┐
             ├── Beta    ─┼─→ 由 xcconfig 注入而不是 GUI 改
             └── Release ─┘

Scheme: NotesIsland (Run=Debug, Archive=Release)
Scheme: NotesIsland-Beta (Run=Beta, Archive=Beta)
```

**Scheme 是「跑哪个配置」的开关,Build Configuration 是「配置长什么样」的内容。** 后续 NotesIsland 会有 3 个 Scheme:`NotesIsland`(主线开发)、`NotesIsland-Beta`(TestFlight 内测)、`NotesIsland-Release`(上架)。

为什么不是「2 Scheme + 切 Configuration」而是「3 Scheme」?因为 Scheme 是 IDE 顶部那个下拉框点击切的,**Configuration 切换要走「Edit Scheme」对话框点 3 层**。3 个 Scheme 让常见操作变成「点一下下拉」,降低多人协作的认知摩擦——尤其是「这个人是设计师,他只会点下拉,不会进 Edit Scheme」的场景。这也对应 Apple 在 Xcode 16 里推的「Scheme 用来表达可执行任务,不用来表达环境维度」的取向。

**Extension target** 在 NotesIsland 后续会用到:Widget Extension(第 22 篇)、Notification Service Extension(第 18 篇)。每个 Extension 是独立的 Target,有独立的 Bundle ID(必须以主 App Bundle ID 为前缀,如 `com.example.notesisland.widget`),独立的 Info.plist key,但共享主 App 的代码模块(通过 SPM 或 Target Membership 勾选)。**Scheme 在 Run 主 App 时会顺带 build Extension**,所以一般不需要为 Extension 单建 Scheme。

### 3. Info.plist:从「巨型 XML」到「Generated 模式」

老 Xcode 项目根目录会躺着一个 `Info.plist` 文件,几百行 XML,加 capability、加 URL scheme、加权限描述全在这里改。Xcode 13 起 Apple 默默切换了默认模板——**新建项目不再产生 Info.plist 文件**,取而代之是「Generated Info.plist File」机制:

- Target → Build Settings → `Info.plist File` 字段**为空或指向自动生成路径**;
- 你想改 Info.plist 内容,**改 Build Settings 而不是改 plist 文件**;
- 编译时 Xcode 把 Build Settings 里 `INFOPLIST_KEY_*` 开头的 key 自动合成进最终 `Info.plist` 注入 `.app` Bundle。

举例,旧写法:

```xml
<!-- Info.plist (老) -->
<key>NSCameraUsageDescription</key>
<string>需要相机来扫描笔记中的二维码</string>
```

新写法,在 Build Settings 里加:

```
INFOPLIST_KEY_NSCameraUsageDescription = "需要相机来扫描笔记中的二维码"
```

或者更现代,在 `xcconfig` 文件里加(下文展开)。

**为什么 Apple 要这么改?** 因为多人协作时 `Info.plist` 是冲突重灾区,二进制 plist 与文本 plist 切换、key 顺序变动、Xcode 自动重排都会污染 diff。Generated 模式把这些 key 变成普通 Build Settings,Build Settings 又可以用 `xcconfig` 注入——整条链路彻底文本化。

**你仍然可以保留 `Info.plist` 文件**(老项目兼容、CocoaPods 时代留下的工程都还在用),但新工程默认用 Generated 模式。本系列采用 Generated 模式。

**App Bundle 的结构** 顺带要心里有数。Archive 之后的 `.app` 实际上是一个目录,展开后大致这样:

```
NotesIsland.app/
├── NotesIsland          (主可执行文件,Mach-O 格式)
├── Info.plist           (合成后的最终 plist)
├── PkgInfo              (老 Mac 时代遗物,固定 8 字节)
├── _CodeSignature/      (代码签名信息)
├── embedded.mobileprovision  (Provisioning Profile,只在真机包里有)
├── Assets.car           (Asset Catalog 编译后的二进制)
├── Base.lproj/          (默认语言资源)
├── zh-Hans.lproj/       (中文资源)
├── PrivacyInfo.xcprivacy(隐私清单,2024 起强制)
└── Frameworks/          (动态库,SPM / 三方框架)
```

`.app` 不是 zip,但 IPA(`.ipa` 文件)是把 `.app` 放进 `Payload/` 目录后再 zip,这就是 TestFlight / App Store 上传的格式。理解 Bundle 结构后,后续碰到「我加了一个 resource,但运行时找不到」的问题就有调试入口——`Bundle.main.bundlePath` 打印出来,Finder 进去看一眼资源到底有没有被打进去。

### 4. xcconfig:让构建配置离开 GUI

`.xcconfig` 是纯文本的构建配置文件,语法简单:

```
// MyApp.xcconfig
PRODUCT_NAME = NotesIsland
PRODUCT_BUNDLE_IDENTIFIER = com.example.notesisland
MARKETING_VERSION = 1.0.0
```

把它挂在某个 Build Configuration 下,这个 Configuration 的所有 Build Settings 就从这个文件来。**xcconfig 优先级低于 Xcode GUI 里手动设的值**——所以如果 GUI 里改过同名 key,xcconfig 就被吃掉了。**实践:在 xcconfig 接管的项里,把 GUI 那一格恢复成默认(右键 → Revert),让值完全由文件决定**。

xcconfig 支持 `#include`、变量引用 `$(VAR_NAME)`、条件表达式 `[sdk=iphoneos*]`。常见用法:

```
// Shared.xcconfig
SWIFT_VERSION = 6.0

// 引用其他变量
PRODUCT_NAME_PREFIX = NotesIsland
PRODUCT_NAME = $(PRODUCT_NAME_PREFIX)_$(CONFIGURATION)

// 按 SDK 条件区分
OTHER_LDFLAGS[sdk=iphoneos*] = -ObjC
OTHER_LDFLAGS[sdk=iphonesimulator*] =

// 包含其他 xcconfig
#include "Debug.xcconfig"
```

xcconfig 这套机制的真正威力是**Build Settings 也可以引用 xcconfig 变量,Info.plist key 也可以引用 xcconfig 变量,Asset Catalog 的 AppIcon 名也可以引用 xcconfig 变量**——一份 xcconfig 文件就能决定「这个 build 长什么样子」的所有维度。CI 上常见做法:`cp Beta.xcconfig.template Beta.xcconfig`,然后用 `sed` / `envsubst` 把环境变量填进去,再调 `xcodebuild` 构建——整条链路无 GUI 介入。

### 5. Asset Catalog 与 SF Symbols

资源管理 2026 年的标准做法:

- **`Assets.xcassets`** 管图片、颜色、AppIcon、AccentColor、Symbol 集合,所有资源走 `Image("foo")`、`Color("bar")` 名字索引,不再用 `UIImage(named:)` + 字符串硬编码;
- **`Localizable.xcstrings`(Xcode 15+)** 管字符串本地化,替代旧 `Localizable.strings`,翻译状态在 Xcode 里可视化,第 24 篇展开;
- **SF Symbols** 全部用 `Image(systemName: "doc.text")`,不再自己切图标 PNG。Apple 提供超过 5000 个图标,自动适配 Dark Mode、Dynamic Type、SF Symbols app 还能导出自定义变体。

Asset Catalog 这套系统的设计哲学值得多说两句:**「资源 = 命名引用 + 变体集合」**。一个 `AppIcon` 是一个 set,里面塞了 iPhone Notification / Settings / Spotlight / App、iPad 多尺寸、App Store Marketing 一整套 PNG;一个 `accent.background` Color 是一个 set,里面分 Any Appearance / Dark Appearance / High Contrast Any / High Contrast Dark 四个变体;一个 SF Symbol 自定义变体是一个 set,里面有 ultralight / thin / regular / semibold / bold / heavy / black 多种字重。**调用方只写名字,Apple 在编译期把对应变体合成进二进制并按运行时上下文自动选**。这就把「Dark Mode 适配」「Dynamic Type 适配」「不同设备类型适配」全部下沉到资源层,不再污染代码。

更新的能力:从 Xcode 15 起,Asset Catalog 引入了 **Symbol Image set** 与 **Catalog 化的 App Icon**(用 single image 加多种渲染规则生成所有尺寸)。NotesIsland 推荐用 single image AppIcon——一张 1024×1024 透明 PNG,Apple 自动生成 60×60 / 76×76 / 1024×1024 等所有目标尺寸,减少手动管理。

### 6. SPM 与 Build System 的边界

Swift Package Manager 在 Xcode 11 加入 IDE,2024 年到 2026 年逐步取代了 CocoaPods / Carthage,成为 Apple 平台事实标准。它和 Xcode 项目的关系大致是:

- **SPM 在 Project 内**:Project 菜单 → Package Dependencies → `+` 直接加 GitHub URL;包源码会被下载到 `~/Library/Developer/Xcode/DerivedData/.../SourcePackages/checkouts/`,**不入你的代码仓库**;
- **SPM 作为本地子目录**:`Package.swift` 放在工程子目录(如 `Modules/Core/Package.swift`),Xcode 可以同时打开 `xcodeproj` 与 SPM 模块,实现「本地源码模块化」;
- **Build System**:Xcode 16 默认 build system 是 `XCBuild`(也叫 New Build System),底层并发编译并按 target 拆 task;SPM 模块编译产物缓存在 DerivedData,SPM target 改动只会重编受影响的模块,不会重编整个 App。

本系列直到第 28 篇前都用「Project + 极少 SPM 远程依赖(暂时无)」的形态;第 28 篇会把 NotesIsland 拆成 `Core` / `Sync` / `UI` 三个本地 SPM 模块。**别在 01 篇就用 SPM 模块拆,模块化是后期的优化,不是起点**。

下一节看完整工程示例。

---

## 三、工程实现:NotesIsland 的三环境工程结构

下面给出 NotesIsland 工程的完整目录与三个 xcconfig 文件,可以直接抄。

### 目录约定

```
NotesIsland/
├── NotesIsland.xcodeproj
├── NotesIsland/
│   ├── App/
│   │   ├── NotesIslandApp.swift
│   │   └── RootView.swift
│   ├── Features/
│   │   └── Notes/
│   │       ├── Note.swift
│   │       └── NoteListView.swift
│   ├── Resources/
│   │   ├── Assets.xcassets
│   │   └── Localizable.xcstrings
│   └── Supporting/
│       └── (空,需要时放 AppDelegate / Bridging Header)
├── Config/
│   ├── Shared.xcconfig
│   ├── Debug.xcconfig
│   ├── Beta.xcconfig
│   └── Release.xcconfig
└── NotesIslandTests/  (可选,第 29 篇加)
```

`App/`、`Features/`、`Resources/`、`Supporting/` 这套分层不是 Apple 官方约定,但在 2024 年后逐渐成为社区共识。`Features/` 按业务域(Notes、Sync、Settings 等)分包,**不**按文件类型(Views/Models/ViewModels)分包——SwiftUI 时代 View 和 Model 距离很近,按业务分包比按类型分包好维护。

「按业务分包」(feature-based)与「按类型分包」(layer-based)的争论在前端社区由来已久。Java / Spring 时代习惯 `controllers/` `services/` `repositories/` 三层目录,因为框架强制了 MVC 分层;React / Vue / SwiftUI 这种「组件即一切」的声明式框架下,功能内聚高于类型内聚——一个 `Features/Notes/` 文件夹里塞 `Note.swift` `NoteListView.swift` `NoteEditView.swift` `NoteRepository.swift`,改一个需求只动一个文件夹,远比「模型在 Models/,视图在 Views/,仓储在 Repositories/,改一个需求要切三个目录」高效。NotesIsland 严格按 feature-based 组织,这条会贯穿后续 28 篇。

### Config/Shared.xcconfig

```
// MARK: - File: Config/Shared.xcconfig
// 所有 Configuration 共用的设置

// 编译期开关
SWIFT_VERSION = 6.0
SWIFT_STRICT_CONCURRENCY = complete
IPHONEOS_DEPLOYMENT_TARGET = 18.0
SWIFT_UPCOMING_FEATURE_EXISTENTIAL_ANY = YES

// 产品基础信息
PRODUCT_NAME = NotesIsland
MARKETING_VERSION = 1.0.0
CURRENT_PROJECT_VERSION = 1

// Generated Info.plist
INFOPLIST_FILE =
GENERATE_INFOPLIST_FILE = YES
INFOPLIST_KEY_UIApplicationSceneManifest_Generation = YES
INFOPLIST_KEY_UILaunchScreen_Generation = YES
INFOPLIST_KEY_CFBundleDisplayName = NotesIsland
INFOPLIST_KEY_NSCameraUsageDescription = NotesIsland 需要相机来拍摄笔记照片
INFOPLIST_KEY_NSMicrophoneUsageDescription = NotesIsland 需要麦克风来录制音频笔记
INFOPLIST_KEY_NSPhotoLibraryAddUsageDescription = NotesIsland 需要将照片保存到相册

// 团队 / 签名(占位,真实项目要填 Apple Developer Team ID)
DEVELOPMENT_TEAM = ABCDEF1234

// SwiftUI 主线不需要 Storyboard
INFOPLIST_KEY_UIMainStoryboardFile =
```

### Config/Debug.xcconfig

```
// MARK: - File: Config/Debug.xcconfig
#include "Shared.xcconfig"

PRODUCT_BUNDLE_IDENTIFIER = com.example.notesisland.dev
INFOPLIST_KEY_CFBundleDisplayName = NotesIsland Dev

SWIFT_ACTIVE_COMPILATION_CONDITIONS = DEBUG ENV_DEV
GCC_PREPROCESSOR_DEFINITIONS = $(inherited) DEBUG=1

// Asset Catalog 里的 AppIcon-Dev / AccentColor-Dev
ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon-Dev
ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME = AccentColor

// 服务器域名通过 INFOPLIST_KEY 注入 Info.plist,运行时再读出来
INFOPLIST_KEY_NotesIslandAPIBaseURL = https://api.dev.notesisland.example.com
```

### Config/Beta.xcconfig

```
// MARK: - File: Config/Beta.xcconfig
#include "Shared.xcconfig"

PRODUCT_BUNDLE_IDENTIFIER = com.example.notesisland.beta
INFOPLIST_KEY_CFBundleDisplayName = NotesIsland Beta

SWIFT_ACTIVE_COMPILATION_CONDITIONS = ENV_BETA

ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon-Beta
ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME = AccentColor

INFOPLIST_KEY_NotesIslandAPIBaseURL = https://api.staging.notesisland.example.com
```

### Config/Release.xcconfig

```
// MARK: - File: Config/Release.xcconfig
#include "Shared.xcconfig"

PRODUCT_BUNDLE_IDENTIFIER = com.example.notesisland
INFOPLIST_KEY_CFBundleDisplayName = NotesIsland

SWIFT_ACTIVE_COMPILATION_CONDITIONS = ENV_PROD

ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon
ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME = AccentColor

INFOPLIST_KEY_NotesIslandAPIBaseURL = https://api.notesisland.example.com
```

### 在 Xcode 里挂接 xcconfig

1. 拖 `Config/` 目录到 Project Navigator(选「Create folder references」不要 group);
2. 在 Project(注意是 Project 不是 Target)→ Info → Configurations 下:
   - 在 `+` 里加一个新的 `Beta` Configuration(默认只有 Debug / Release);
   - 给每个 Configuration 的 `Based on Configuration File` 列选对应文件;
3. Target 级别保留为「Use Project Settings」,不要在 Target 上再叠 xcconfig(会覆盖 Project 级);
4. 复制现有 Scheme,改名为 `NotesIsland-Beta`,在 Manage Schemes 里把它的 Run / Archive 都指向 `Beta` Configuration。

操作完成后,Project Navigator 里 `Config/` 下三个 xcconfig 文件每一个都会显示「Configuration: Debug/Beta/Release」的标签,Build Settings 切到 `Levels` 模式会看到一列「Configuration File (Xxx)」介于「iOS Default」与「Project」之间——这表示 xcconfig 已经生效。所有由 xcconfig 决定的 setting 在 GUI 里会显示一个绿色小图标(代表「来自 xcconfig」),手动改过则变成蓝色粗体(代表「GUI 覆盖,xcconfig 失效」)。**目标是让 Levels 列里 Target 列尽可能为空,所有值都从 Project Configuration File 来**。

### 运行时读取 Bundle 配置

```swift
// MARK: - File: App/AppConfig.swift
import Foundation

enum AppConfig {
    /// 服务端基础域名,值来自当前 Configuration 的 xcconfig 注入到 Info.plist 的 key
    static var apiBaseURL: URL {
        guard
            let raw = Bundle.main.object(forInfoDictionaryKey: "NotesIslandAPIBaseURL") as? String,
            let url = URL(string: raw)
        else {
            // 启动期配置缺失走 fatalError,而不是 try? 吞掉
            fatalError("Missing or invalid NotesIslandAPIBaseURL in Info.plist")
        }
        return url
    }

    /// 由 SWIFT_ACTIVE_COMPILATION_CONDITIONS 注入的编译期环境标识
    static var environment: Environment {
        #if ENV_DEV
        return .dev
        #elseif ENV_BETA
        return .beta
        #elseif ENV_PROD
        return .prod
        #else
        return .dev
        #endif
    }

    enum Environment: String, Sendable { case dev, beta, prod }
}
```

这段代码的设计值得多说几句。`AppConfig` 用 `enum`(没有 case 的 enum)而不是 `struct` 或 `class`——Swift 的惯用法,表达「这是一个静态命名空间,不应该有实例」。`static var apiBaseURL` 用计算属性而不是存储属性,每次访问都从 Bundle 读一次;Bundle 读取本身有缓存,频次不高时性能可忽略,但**逻辑上保证了不会因为加载顺序导致取到 nil**。`fatalError` 处理「配置缺失」这种**启动期不应该发生的错误**——如果上架了一个没有 `NotesIslandAPIBaseURL` 的 Release 包,App 启动就崩,远比静默 fallback 到 dev 域名导致用户数据泄露到 staging 服务器要好。

`Environment` 用 `String` raw value + `Sendable`,可以直接打印、可以跨 actor 传、可以塞进 Set / Dictionary。这种「小型不可变值」是 Swift 类型系统的甜区,struct 还是 enum 选择哪个由「数据有没有有限可数的取值」决定——三个环境是有限可数的,所以 enum;Bundle ID 是无穷字符串,所以 String。

```swift
// MARK: - File: Features/Notes/NoteListView.swift(片段,新增 footer 展示环境)
import SwiftUI
import SwiftData

extension NoteListView {
    /// 列表底部展示当前环境,便于内测时一眼看清是哪个包
    @ViewBuilder
    var environmentBadge: some View {
        if AppConfig.environment != .prod {
            Text("ENV: \(AppConfig.environment.rawValue.uppercased())")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(.thinMaterial, in: .capsule)
        }
    }
}
```

### Asset Catalog 与 SF Symbols 使用约定

```swift
// MARK: - File: Features/Notes/NoteRowView.swift
import SwiftUI

struct NoteRowView: View {
    let title: String

    var body: some View {
        HStack(spacing: 12) {
            // SF Symbols:直接 systemName,免切图
            Image(systemName: "note.text")
                .font(.title2)
                .foregroundStyle(.tint)        // tint 自动取 AccentColor

            Text(title)
                .font(.body)
                .foregroundStyle(.primary)

            Spacer()
        }
        .padding(.vertical, 4)
    }
}
```

Asset Catalog 里需要的资源:

- `AppIcon`、`AppIcon-Dev`、`AppIcon-Beta` 三套图标集(`+` → iOS App Icon);
- `AccentColor`(Any Appearance / Dark Appearance 两栏分别配色),`xcconfig` 里用 `ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME` 引用;
- 自定义图片(笔记封面占位等)以业务名命名,如 `note.placeholder`、`note.placeholder.dark`,Xcode 会自动按外观选;
- **不要**手动塞 `Image-1x.png` / `Image-2x.png` / `Image-3x.png` 进 bundle 根目录,所有图片都进 `xcassets`。

SF Symbols 在 SwiftUI 里有额外的红利:**modifier 链可以直接配置 symbol 的渲染模式**。`Image(systemName: "note.text").symbolRenderingMode(.hierarchical)` 可以让 symbol 自动根据 tint 做层级着色;`.symbolEffect(.bounce, value: trigger)` 可以触发内置动画(iOS 17+);`.symbolVariant(.fill)` 取 fill 变体而不必写 `note.text.fill`。这些能力 UIKit 时代要写一堆 `UIImage.SymbolConfiguration`,SwiftUI 里几个 modifier 解决。

---

## 四、调参与验收

### 手动验证清单

切换三个 Scheme 都构建运行一次,期望结果:

1. **`NotesIsland`** Scheme,模拟器主屏图标应该是 `AppIcon-Dev`(Dev 字样的图标),显示名为「NotesIsland Dev」;列表底部应出现 `ENV: DEV` 胶囊。
2. **`NotesIsland-Beta`** Scheme,主屏图标为 `AppIcon-Beta`,显示名「NotesIsland Beta」,列表底部 `ENV: BETA`,且 Bundle ID 为 `com.example.notesisland.beta`(可在 Settings → 通用 → 关于本机查看,或 `Bundle.main.bundleIdentifier` 打印)。
3. **`NotesIsland-Release`** Scheme,主屏图标为 `AppIcon`,显示名「NotesIsland」,无环境胶囊(只在非 prod 显示)。
4. 三个版本可以**并存**在同一台模拟器上(不同 Bundle ID),数据互不污染,这是内测时区分版本的关键能力。
5. Archive `NotesIsland-Release` Scheme,在 Xcode Organizer 里看到 build,**版本号 1.0.0(1)**(`MARKETING_VERSION` + `CURRENT_PROJECT_VERSION`)。
6. 用 Finder 找到 archive 包,右键 Show Package Contents → Products → Applications → NotesIsland.app → Show Package Contents,看 `Info.plist`(用 `plutil -p Info.plist` 在终端展开),确认 `NSCameraUsageDescription`、`NotesIslandAPIBaseURL`、`CFBundleDisplayName` 都已被注入。

### 调参点

| 项 | 作用 | 注意 |
| --- | --- | --- |
| `SWIFT_STRICT_CONCURRENCY` | `minimal` / `targeted` / `complete` | 本系列固定 `complete`;旧工程过渡期可用 `targeted` |
| `IPHONEOS_DEPLOYMENT_TARGET` | 最低部署目标 | 本系列固定 18.0;改成 17.0 会丢失 `@Entry` 宏等;改 19.0 会切掉 iOS 18 装机量 |
| `SWIFT_UPCOMING_FEATURE_EXISTENTIAL_ANY` | 强制 existential 类型必须写 `any` | 推荐 YES,语义更清楚,第 03 篇展开 |
| `CURRENT_PROJECT_VERSION` | build number | TestFlight 每次上传必须 `+1`,CI 通常用 `git rev-list HEAD --count` 自动生成 |
| `MARKETING_VERSION` | 用户可见版本号 | App Store 同一个版本号只能审一次,小修补常用 1.0.0 → 1.0.1 |

### 真机 vs 模拟器

- 模拟器**不会**真正写入 Keychain(写入了但权限模型不同),CloudKit 同步只在登录了 iCloud 账号的真机/模拟器上才会发生;
- `DEVELOPMENT_TEAM` 字段在模拟器上可以填占位,Archive 到 TestFlight 必须填真实 Apple Developer Team ID;
- 真机第一次 Run 前要在 Xcode → Settings → Accounts 登录账号,并在 Signing & Capabilities 勾 Automatically manage signing,Xcode 才会自动生成 Provisioning Profile。

### CI / 命令行构建预演

虽然本篇还不展开 Xcode Cloud / Fastlane(第 30 篇),但 xcconfig 化的工程已经具备命令行构建能力。可以试一下:

```bash
# 列出所有 Scheme,确认 NotesIsland / NotesIsland-Beta / NotesIsland-Release 都在
xcodebuild -list -project NotesIsland.xcodeproj

# 用 Beta Scheme + Beta Configuration 构建一次
xcodebuild build \
    -project NotesIsland.xcodeproj \
    -scheme NotesIsland-Beta \
    -configuration Beta \
    -destination 'platform=iOS Simulator,name=iPhone 16 Pro'

# Archive 一次(需要真实 DEVELOPMENT_TEAM)
xcodebuild archive \
    -project NotesIsland.xcodeproj \
    -scheme NotesIsland-Release \
    -archivePath build/NotesIsland.xcarchive
```

xcconfig 把所有配置文本化的好处此刻显现:**CI 不需要点 Xcode GUI 就能跑出三个环境的包**。第 30 篇会基于这套命令行接 TestFlight 自动分发。

---

## 五、踩坑

### 1. 在 GUI 改了一项 Build Setting,xcconfig 失效

这是 xcconfig 新手最常见的困惑:明明 xcconfig 里写了 `PRODUCT_BUNDLE_IDENTIFIER = com.example.notesisland.beta`,运行起来却仍然是 `com.example.notesisland.dev`。原因:Xcode GUI 里这个值之前手工改过,GUI 优先级高于 xcconfig。**解决:**在 Target → Build Settings → 该项右键 → Revert to default,让它回到「由 xcconfig 决定」的状态。

如何快速识别哪些值被 GUI 「污染」了?在 Build Settings 顶部把展示模式从 `Combined` 切到 `Levels`,会看到「Resolved / Target / Project / iOS Default」四列,被 Target 列覆盖的值会被高亮——这些就是污染源。

### 2. Generated Info.plist 与文件版 Info.plist 共存

如果项目是从老模板升级来的,`INFOPLIST_FILE` 可能仍然指向 `NotesIsland/Info.plist`,同时 `GENERATE_INFOPLIST_FILE` 又设为 YES——这种「双轨」状态会让 `INFOPLIST_KEY_*` 与文件里的 key 互相冲突。**解决:**二选一。要么用 Generated 模式(`INFOPLIST_FILE =` 留空,删掉 plist 文件),要么用文件模式(所有 key 写进 plist,删掉 `INFOPLIST_KEY_*`)。本系列推荐 Generated。

### 3. Asset Catalog 里 AccentColor 没改 SwiftUI 仍是蓝色

SwiftUI 通过 `ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME` 自动取 tint,但如果 Asset Catalog 里没有名为 `AccentColor` 的 Color Set,或者 xcconfig 里的名字拼错(本应 `AccentColor` 写成了 `Accent_Color`),都会 fallback 到系统蓝。**解决:**Asset Catalog 新建一个 Color Set,命名严格匹配 xcconfig 的值;在 Inspector 里给 Any Appearance + Dark Appearance 各填色;构建后用 `.tint` 或 `.foregroundStyle(.tint)` 即可生效。

### 4. `SWIFT_ACTIVE_COMPILATION_CONDITIONS` 与 `GCC_PREPROCESSOR_DEFINITIONS` 不是一回事

新人常把两者混用。`SWIFT_ACTIVE_COMPILATION_CONDITIONS` 是 Swift 用的(影响 `#if FOO`),`GCC_PREPROCESSOR_DEFINITIONS` 是 Objective-C / C 用的(影响 `#ifdef FOO`)。**纯 Swift 工程只用前者**,后者只在桥接 ObjC 代码、或者有 `.m`/`.c` 文件时才需要。Swift `#if DEBUG` 这种约定俗成的 `DEBUG` 旗也是来自 `SWIFT_ACTIVE_COMPILATION_CONDITIONS = DEBUG`,而不是预处理器宏。

### 5. xcconfig 注释只能用 `//` 不能用 `#`

`#` 在 xcconfig 里是 `#include` 关键字的开头,不是注释符号。注释必须用 `// 这是注释`,行尾注释也用 `//`。`#` 开头但不是 `#include` 的行直接编译报错。

### 6. PRODUCT_BUNDLE_IDENTIFIER 不能含中文或下划线下划线

Apple 规定 Bundle ID 必须满足 reverse-DNS 格式,字符集只能是 `[A-Za-z0-9.-]`。**不能用下划线**(早年文档没写死,但 2020 年后 TestFlight 提交会被自动拒)、**不能含中文**(本地能跑,Archive 上传报错)、**不能以数字开头每一段**。本系列约定 `com.example.notesisland[.beta|.dev]`,新人最常踩的是 `com.example.notes_island` 这种下划线写法,记得避开。

### 7. xcconfig 里 `$(inherited)` 必须显式写

```
GCC_PREPROCESSOR_DEFINITIONS = $(inherited) DEBUG=1
```

不写 `$(inherited)` 会**完全覆盖**上层 Configuration / 默认 / SDK 注入的值,导致项目跑起来一堆奇怪的链接错误(比如 framework 找不到 `__OBJC` 宏)。这是 Xcode 与其他 Make-like 构建系统的明显差异:别的系统默认追加,Xcode 默认覆盖。涉及列表型 setting(预处理器宏、Search Paths、Frameworks Search Paths、Other Linker Flags、Other Swift Flags)一律加 `$(inherited)`。

### 8. SF Symbols 不能 `UIImage(named:)` 取

```swift
// 错
let img = UIImage(named: "doc.text")        // nil

// 对
let img = UIImage(systemName: "doc.text")    // ✓
// SwiftUI
Image(systemName: "doc.text")
```

`UIImage(named:)` 只查 Asset Catalog 与 Bundle 资源,**不**查 SF Symbols 全集。SwiftUI 的 `Image(systemName:)` 与 UIKit 的 `UIImage(systemName:)` 才走 Symbol。新人常见错误是用 SF Symbols app 复制了一个名字粘进 `Image("foo.bar")`,运行时空白——`Image(_:)` 默认查 Asset Catalog,改成 `Image(systemName:)` 即可。

### 9. Localizable.strings vs Localizable.xcstrings

老工程往往两者并存,Xcode 16 默认推 `.xcstrings`(String Catalog)。**不要在同一个 target 里两个都放**,Xcode 会随机挑一个生效,造成翻译丢失。迁移路径:右键老 `.strings` 文件 → Migrate to String Catalog,Xcode 会生成 `.xcstrings` 并删旧文件,提交两次 commit(一次添加 .xcstrings,一次删除 .strings)便于回滚。第 24 篇会展开。

### 10. project.pbxproj 冲突频繁的根源

很多人把 `project.pbxproj` 文件冲突归咎于「Xcode 的格式」,其实根源是**这个文件同时记录了三类信息**:文件引用(代码、资源、Asset Catalog)、Build Settings、Scheme。三类信息任何一项变化都改这一个文件,多人协作冲突几乎不可避免。

减少冲突的几条实践:

1. **新增文件按目录引用**(folder reference,蓝色文件夹图标),而不是按 group(黄色文件夹)。folder reference 让 Xcode 自动跟踪目录内所有文件,不需要每加一个文件都改 `pbxproj`;
2. **Build Settings 全部走 xcconfig**(本篇主线),`pbxproj` 里只剩极少的 Build Settings 记录;
3. **Scheme 设为 Shared**(Manage Schemes 里勾 Shared),Scheme 信息存到 `xcshareddata/xcschemes/*.xcscheme`,单独一个文件,不再混进 `pbxproj`;
4. **`.gitattributes` 里给 `pbxproj` 标记 merge driver**:`*.pbxproj merge=union` 让 git 用「联合并集」策略合并,降低冲突;
5. **CI 上跑 `xcodeproj` Ruby gem 或 `tuist`** 把 pbxproj 生成化——更激进的方案,本系列不主推但提一句以备需要。

---

## 本篇收尾

读完这一篇,你应该:

- 能区分 Project / Workspace / Target / Scheme / Build Configuration 五个概念,知道它们各管什么;
- 理解 Generated Info.plist 模式,知道为什么 Xcode 13 之后新工程没有 Info.plist 文件也能跑;
- 能用 `xcconfig` 把 Bundle ID、显示名、服务端域名按 Debug / Beta / Release 分离,且**只改文本文件不点 GUI**;
- 知道 Asset Catalog + SF Symbols 是 2026 年资源管理的标准,不再用 `.png` 切图或 `UIImage(named:)` 字符串;
- 能在同一台模拟器上并存 NotesIsland、NotesIsland-Beta、NotesIsland-Dev 三个版本,数据互不污染;
- 知道 `$(inherited)`、xcconfig 与 GUI 优先级、`SWIFT_ACTIVE_COMPILATION_CONDITIONS` 与预处理器宏的区别,这些坑 90% 的人都踩过。

下一篇 `03 Swift 6 类型系统:值类型 / 引用类型 / 协议 / 泛型` 会回到语言层——struct 与 class 的内存语义、protocol + associatedtype 的展开心智、`some View` opaque return 与 `any View` existential 的差别、以及 Swift 类型系统与 Dart / Kotlin 的横向对照。
