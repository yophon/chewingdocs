# 28 Swift Package Manager、模块化与 Xcode Build System

写到第 28 篇,NotesIsland 已经是一坨能跑的代码:列表、详情、SwiftData、CloudKit、Live Activity、StoreKit 2、Core ML 全都在同一个 App target 里。打开 Xcode 16,左侧 Project Navigator 像一棵越长越歪的树,任意一个文件改动都会触发整个 App target 重新编译,Swift 6 严格并发模式下连泛型推断都开始拖编译机。本篇做一次大手术:把 NotesIsland 拆成 SPM(Swift Package Manager)多模块、配上 `xcconfig` 多环境、把 Build System 的几个阶段讲清楚,让发布前的代码组织能撑住后续维护。

模块化在 iOS 项目里始终是个被低估的话题。很多团队把它和「上传到私有 Pod 仓库」绑在一起,理解成纯粹的二进制分发问题。其实模块化首先是一种心智约束:它强制你回答「这部分代码到底应该被谁看到」「跨边界传递的类型为什么必须是 `Sendable`」「为什么 UI 不能直接 import 数据层」。一旦把答案落到 `Package.swift` 的 `dependencies` 与 `public` 修饰符上,代码组织的纪律就从「全靠人盯」变成「靠编译器强制」。Xcode 16 + Swift 6 时代,这套纪律变得更必要,因为严格并发的扩散范围非常依赖模块边界。

---

## 一、机制定位

**问题一:单 target 编译扩散。** Xcode 的增量编译以 module 为粒度。一个 App target 就是一个 module,改一个 `String` 常量,Swift 编译器要重新跑整张依赖图的类型推断与并发隔离检查,首屏开发时 30 秒一次的编译会把人耗死。模块化的第一收益就是让 build cache 按模块切片。

**问题二:严格并发的隔离边界靠不住。** Swift 6 的 `Sendable` 与 actor 隔离是按 module 维度推断的。同一个 module 内部你能看到所有实现细节,Sendable 校验会被「凑合通过」。把 Core 数据模型拆到独立 module、明确 `public` 边界后,严格并发模式才能逼你显式标注每一个跨模块传递的类型,Swift 6 的红线才真正发挥作用。

**问题三:旧 Xcode 教程教你用 Workspace + Project subproject + Target dependency 的方式拆模块,在 Xcode 16 里基本被 SPM 取代。** SPM 从 Xcode 11 起内嵌,2024 年开始成为 Apple 推荐的默认依赖与模块化方式,Build System 也已经原生理解 `Package.swift`。这一篇不再讨论 CocoaPods、Carthage,也不讨论 sub-Xcode-project,只讲「主 App + 多个 local SPM package」这一种现代结构。

**问题四:发布通路。** 没有合理的 Build Configuration 和 `xcconfig`,Debug / Staging / Release 三套环境的 API base URL、Bundle ID、CloudKit container 就只能写 `#if DEBUG` 散布全代码。再加上 Archive 流程里 SwiftSettings、Linker、Strip Debug Symbols 这些参数没人维护,发布包尺寸和性能会一路滑坡。

**与 CocoaPods / Carthage 旧时代的差别。** 2014 到 2019 年是 CocoaPods 当道,2018 到 2020 年间 Carthage 一度成为「不愿意改工程文件」的替代,而 Swift Package Manager 从 Xcode 11 起原生内嵌,到 Xcode 16 已经是 Apple 唯一推荐的依赖管理与模块化方案。CocoaPods 的痛点 SPM 全部消除:不再修改 `.pbxproj`、不再生成 `.xcworkspace`、不再有 `Podfile.lock` 与 `Podfile` 双重源头、不再受 Ruby 环境拖累。剩下 CocoaPods 还有价值的场景只剩两类:**老 SDK 没出 SPM 版本**(主要是 OC 写的支付 / 推送 SDK),以及**需要 pre/post install hook 改 build setting**(SPM 故意不支持,设计上避免 pod 之间互相干预)。NotesIsland 上架前的依赖全部 SPM 化,这是一笔一次性投入但收益持续到项目生命周期结束的工作。

---

## 二、Apple 平台心智

### SPM 关键类型

- `Package`:一个 `Package.swift` 文件定义一个 package,声明 `name` / `platforms` / `products` / `dependencies` / `targets`。
- `Product`:对外暴露的「可被别的 package 依赖的东西」,只有两种类型 `.library` 和 `.executable`(本系列不涉及 executable),`.library` 内部还能再选 `.static` / `.dynamic` / `.automatic`,默认 `.automatic` 由 SPM 决定。
- `Target`:实际编译单元,对应一个 Swift module。常见类型:`.target`(普通源码)、`.testTarget`(测试)、`.binaryTarget`(预编译 xcframework)、`.systemLibrary`(C 库桥接,基本用不上)。
- `Dependency`:模块间依赖在 `Target.Dependency` 里声明,跨 package 用 `.product(name:package:)`,同 package 内用 `.target(name:)`。
- `SwiftSetting` / `LinkerSetting` / `CSetting`:per-target 编译开关,Swift 6 的语言模式就在这里设。

### Apple Build System 阶段

打开 Xcode 16,Build 一次 NotesIsland,Report Navigator 里能看到这些阶段:

1. **Resolve Package Graph**:解析所有 `Package.swift`、下载 / 校验依赖、产出 `Package.resolved`。
2. **Compile Swift sources**:每个 target 走一次 `swift-frontend`,产物是 `.swiftmodule` + `.o`。Swift 6 严格并发的诊断都在这里跑。
3. **Compile Asset Catalog / Storyboard / xcstrings**:`actool` / `ibtool` / `xcstringstool`,产出 `Assets.car`、`.storyboardc`、`Localizable.xcstrings` 编译后的 `.lproj/.stringsdict`。
4. **Process Info.plist**:`xcconfig` 与 `INFOPLIST_KEY_*` Build Setting 注入合并。
5. **Link**:`ld64`(在 Xcode 15+ 默认是 `ld-prime`,Apple 自研更快的 linker)。
6. **Copy Bundle Resources / Embed Frameworks / Code Sign / Validate**:bundle 装配、签名、`codesign --verify`。

模块化的关键收益就在第 2 步:**没改的 SPM target 直接命中 build cache,只编译变化的 module**。

### `xcconfig` 与 User-Defined settings

`.xcconfig` 是纯文本 build setting 文件,语法是 `KEY = VALUE`,支持 `#include "Base.xcconfig"` 与条件 `KEY[sdk=iphoneos*][config=Release] = VALUE`。在 Project → Info → Configurations 里把每个 Build Configuration 指到对应 xcconfig 文件后,Xcode 16 的 Build Settings 面板里这些值会显示为 xcconfig 来源,不会被 GUI 静默覆盖,Git diff 友好,review 时直接读文本。

xcconfig 的设计哲学是「文本优先」。GUI 改 build setting 会直接写到 `.pbxproj`,而 `.pbxproj` 是一种 plist 格式、按 UUID 排序的二进制级文本,review 时几乎没人能看懂改了什么。xcconfig 走纯文本路线,每行一对 KEY = VALUE,合并冲突时用普通 diff 就能解决。NotesIsland 团队的规则:Build Settings 面板里看到的所有非默认值,必须能在 xcconfig 文件里找到来源;一旦发现 GUI 优先级覆盖了 xcconfig,立即修正,把 `.pbxproj` 中的覆盖值清掉。

xcconfig 的继承机制是叠加而非替换。`Debug.xcconfig` 通过 `#include "Base.xcconfig"` 引入基础设置后,可以再追加 Debug 专属值。同一 key 的多次赋值,后写覆盖先写,但配合 `$(inherited)` 可以拼接父级值,例如 `OTHER_SWIFT_FLAGS = $(inherited) -DDEBUG_VIEW_REWRITES`。这是 xcconfig 最容易踩坑的地方:漏写 `$(inherited)` 会覆盖整个 SDK 默认 flag,导致编译失败,且报错信息根本不指向 xcconfig 漏写。

`User-Defined` settings 是自定义 key,常见用法:`API_BASE_URL = https://api.notesisland.dev`,然后在 `Info.plist` 里写 `$(API_BASE_URL)`,运行时通过 `Bundle.main.object(forInfoDictionaryKey:)` 取出。`OTHER_SWIFT_FLAGS` 是注入 Swift 编译器 flag 的通用入口,比如 `-Xfrontend -warn-long-expression-type-checking=200` 用来揪类型推断慢的表达式。

### Build Configuration 与 Scheme 的分工

很多人会把 Build Configuration 和 Scheme 混淆。前者是「一组编译参数的集合」,默认有 Debug 和 Release,你可以再加 Staging、Beta 等;后者是「一次 Run / Test / Profile / Analyze / Archive 操作的入口」,每个 Scheme 里六个 Action 都可以挑选不同的 Configuration。NotesIsland 的典型组织是:**三套 Configuration(Debug / Staging / Release),两个 Scheme(NotesIsland 用于日常开发,NotesIsland-Release 用于上架)**。日常开发的 Scheme 把 Run 指到 Debug、Archive 指到 Release;上架专用 Scheme 强制全部 Action 走 Release,避免在 CI 上误用 Debug 二进制 Archive。

### Linker 与符号 strip

Apple 在 Xcode 15 引入了自家 `ld-prime` 替代 `ld64`,Xcode 16 已经是默认,链接速度对大型项目快 2-5 倍。`DEAD_CODE_STRIPPING = YES`(默认开)让 Linker 移除未引用的符号;`STRIP_INSTALLED_PRODUCT = YES` 在 Release 配置里把 debug 符号从可执行文件里剥离,产物体积可以减半;`DEBUG_INFORMATION_FORMAT = dwarf-with-dsym` 在 Archive 时同步产出 `.dSYM`,这是后面线上 crash 符号化的唯一依据。

---

## 三、工程实现

NotesIsland 的目标模块结构:

```
NotesIsland.xcodeproj          ← App target (壳)
└── Packages/
    ├── NotesCore              ← Sendable 数据模型 + 协议
    ├── NotesPersistence       ← SwiftData + CloudKit
    ├── NotesNetworking        ← URLSession async 封装
    ├── NotesAudio             ← AVFoundation 录音
    └── NotesUI                ← SwiftUI 视图组件
```

App target 自己只剩 `NotesIslandApp.swift` 与 `ContentView.swift`,把上述 5 个 local package 加到 `Frameworks, Libraries, and Embedded Content`,模块化拆分完成。下面是核心 `Package.swift` 与 xcconfig。

```swift
// File: Packages/NotesCore/Package.swift
// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "NotesCore",
    platforms: [
        .iOS(.v18),
        .macOS(.v15),
        .visionOS(.v2)
    ],
    products: [
        // MARK: - 对外暴露的 library
        .library(
            name: "NotesCore",
            targets: ["NotesCore"]
        )
    ],
    targets: [
        // MARK: - 主 target,启用 Swift 6 严格并发
        .target(
            name: "NotesCore",
            path: "Sources/NotesCore",
            swiftSettings: swiftSettings
        ),
        // MARK: - 单元测试
        .testTarget(
            name: "NotesCoreTests",
            dependencies: ["NotesCore"],
            path: "Tests/NotesCoreTests",
            swiftSettings: swiftSettings
        )
    ]
)

// MARK: - 共享 SwiftSetting:严格并发 + 诊断 flag
var swiftSettings: [SwiftSetting] {
    [
        .swiftLanguageMode(.v6),
        .enableUpcomingFeature("ExistentialAny"),
        .enableUpcomingFeature("InternalImportsByDefault"),
        .unsafeFlags(
            ["-warn-long-function-bodies=200",
             "-warn-long-expression-type-checking=200"],
            .when(configuration: .debug)
        )
    ]
}
```

```swift
// File: Packages/NotesCore/Sources/NotesCore/Note.swift
// MARK: - 跨模块流通的不可变值类型,显式 Sendable
import Foundation

public struct NoteID: Hashable, Sendable, Codable {
    public let rawValue: UUID
    public init(_ rawValue: UUID = UUID()) {
        self.rawValue = rawValue
    }
}

public struct NoteSnapshot: Sendable, Codable, Identifiable {
    public let id: NoteID
    public let title: String
    public let body: String
    public let updatedAt: Date
    public let attachmentCount: Int

    public init(
        id: NoteID,
        title: String,
        body: String,
        updatedAt: Date,
        attachmentCount: Int
    ) {
        self.id = id
        self.title = title
        self.body = body
        self.updatedAt = updatedAt
        self.attachmentCount = attachmentCount
    }
}

// MARK: - 跨模块协议,作为持久层与 UI 层的契约
public protocol NoteReadStore: Sendable {
    func recentNotes(limit: Int) async throws -> [NoteSnapshot]
    func note(id: NoteID) async throws -> NoteSnapshot?
}

public protocol NoteWriteStore: Sendable {
    func upsert(_ snapshot: NoteSnapshot) async throws
    func delete(id: NoteID) async throws
}

public typealias NoteStore = NoteReadStore & NoteWriteStore
```

```swift
// File: Packages/NotesPersistence/Package.swift
// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "NotesPersistence",
    platforms: [.iOS(.v18), .macOS(.v15)],
    products: [
        .library(name: "NotesPersistence", targets: ["NotesPersistence"])
    ],
    dependencies: [
        // MARK: - 本地 package 用 path 依赖
        .package(path: "../NotesCore")
    ],
    targets: [
        .target(
            name: "NotesPersistence",
            dependencies: [
                .product(name: "NotesCore", package: "NotesCore")
            ],
            resources: [
                // MARK: - Resource bundle,SPM 会自动生成 Bundle.module 访问器
                .process("Resources/seed.json")
            ],
            swiftSettings: [.swiftLanguageMode(.v6)]
        )
    ]
)
```

```swift
// File: Packages/NotesPersistence/Sources/NotesPersistence/SwiftDataNoteStore.swift
import Foundation
import SwiftData
import NotesCore

// MARK: - SwiftData 模型,Persistence 内部实现细节,不对外暴露
@Model
final class NoteRecord {
    @Attribute(.unique) var id: UUID
    var title: String
    var body: String
    var updatedAt: Date
    var attachmentCount: Int

    init(snapshot: NoteSnapshot) {
        self.id = snapshot.id.rawValue
        self.title = snapshot.title
        self.body = snapshot.body
        self.updatedAt = snapshot.updatedAt
        self.attachmentCount = snapshot.attachmentCount
    }

    func toSnapshot() -> NoteSnapshot {
        NoteSnapshot(
            id: NoteID(id),
            title: title,
            body: body,
            updatedAt: updatedAt,
            attachmentCount: attachmentCount
        )
    }
}

// MARK: - 对外类型,所有跨 actor 调用都用 NoteSnapshot 值类型流通
@ModelActor
public actor SwiftDataNoteStore: NoteStore {
    public func recentNotes(limit: Int) async throws -> [NoteSnapshot] {
        var descriptor = FetchDescriptor<NoteRecord>(
            sortBy: [SortDescriptor(\.updatedAt, order: .reverse)]
        )
        descriptor.fetchLimit = limit
        return try modelContext.fetch(descriptor).map { $0.toSnapshot() }
    }

    public func note(id: NoteID) async throws -> NoteSnapshot? {
        let raw = id.rawValue
        let descriptor = FetchDescriptor<NoteRecord>(
            predicate: #Predicate { $0.id == raw }
        )
        return try modelContext.fetch(descriptor).first?.toSnapshot()
    }

    public func upsert(_ snapshot: NoteSnapshot) async throws {
        let raw = snapshot.id.rawValue
        let existing = try modelContext.fetch(
            FetchDescriptor<NoteRecord>(predicate: #Predicate { $0.id == raw })
        ).first
        if let existing {
            existing.title = snapshot.title
            existing.body = snapshot.body
            existing.updatedAt = snapshot.updatedAt
            existing.attachmentCount = snapshot.attachmentCount
        } else {
            modelContext.insert(NoteRecord(snapshot: snapshot))
        }
        try modelContext.save()
    }

    public func delete(id: NoteID) async throws {
        let raw = id.rawValue
        let descriptor = FetchDescriptor<NoteRecord>(
            predicate: #Predicate { $0.id == raw }
        )
        for record in try modelContext.fetch(descriptor) {
            modelContext.delete(record)
        }
        try modelContext.save()
    }

    // MARK: - SPM Resource bundle 访问示例
    public static func bundledSeedURL() -> URL? {
        Bundle.module.url(forResource: "seed", withExtension: "json")
    }
}
```

最后是 `xcconfig` 多环境模板:

```ini
// File: Configurations/Base.xcconfig
// MARK: - 三套环境共享的部分
IPHONEOS_DEPLOYMENT_TARGET = 18.0
SWIFT_VERSION = 6.0
SWIFT_STRICT_CONCURRENCY = complete
ENABLE_USER_SCRIPT_SANDBOXING = YES
OTHER_SWIFT_FLAGS = $(inherited) -enable-bare-slash-regex
DEVELOPMENT_TEAM = ABCD123456

// File: Configurations/Debug.xcconfig
#include "Base.xcconfig"
SWIFT_ACTIVE_COMPILATION_CONDITIONS = $(inherited) DEBUG STAGING_API
SWIFT_OPTIMIZATION_LEVEL = -Onone
GCC_OPTIMIZATION_LEVEL = 0
API_BASE_URL = https:/$()/api.staging.notesisland.dev
PRODUCT_BUNDLE_IDENTIFIER = dev.notesisland.app.debug
INFOPLIST_KEY_CFBundleDisplayName = Notes (Dev)

// File: Configurations/Release.xcconfig
#include "Base.xcconfig"
SWIFT_OPTIMIZATION_LEVEL = -O
SWIFT_COMPILATION_MODE = wholemodule
GCC_OPTIMIZATION_LEVEL = s
DEPLOYMENT_POSTPROCESSING = YES
STRIP_INSTALLED_PRODUCT = YES
COPY_PHASE_STRIP = YES
API_BASE_URL = https:/$()/api.notesisland.dev
PRODUCT_BUNDLE_IDENTIFIER = dev.notesisland.app
INFOPLIST_KEY_CFBundleDisplayName = Notes
```

注:`https:/$()/...` 的 `$()` 是绕开 xcconfig 把 `//` 当注释起始的官方 workaround。

---

## 四、调参与验收

### 模块化拆分原则

1. **Core 模块零依赖**:`NotesCore` 只 `import Foundation`,不能依赖 SwiftData、SwiftUI、UIKit。所有跨模块传递的类型放这里,且必须 `Sendable + Codable`。这一步做对,后面所有 actor 边界都不会再为 Sendable 警告烦恼。
2. **UI 模块不直接依赖 Persistence**:`NotesUI` 依赖 `NotesCore` 的 `NoteStore` 协议,运行时由 App target 把 `SwiftDataNoteStore` 注入。这是依赖倒置,也是后面第 29 篇能用 mock store 跑 Swift Testing 的前提。
3. **`.dynamic` library 慎用**:SPM 默认 `.automatic` 通常会被 Xcode build 为 static linking,启动更快。只有 App Extension(Widget / Live Activity)和主 App 都要用到同一份代码时才显式 `.dynamic`,否则会出现「同一份代码被静态打包两次」的 binary 膨胀。
4. **粒度的下限**:别拆到一个 module 一两个文件,Swift 6 跨 module 的 `public` 边界、`@_spi` 半公开 API、文档注释维护都不便宜。我的经验是 200-2000 行代码、能独立编译且至少能被两个上层模块复用,才值得独立成 module。
5. **平台共享的模块要在 `platforms` 里声明全平台**:NotesCore 同时跑在 iOS、macOS、visionOS 上,`platforms` 数组要把目标平台都写齐,且每个平台的最低版本要选项目能接受的最低值。漏写平台,SPM 会用一个隐式默认值,Xcode 切换 destination 时会出现「module not found」的诡异错误。
6. **私有仓库 SPM 的鉴权**:把内部抽象的 `NotesAnalytics`、`NotesAuth` 放到组织私有 Git 仓库,用 `.package(url: "git@github.com:org/notes-analytics.git", from: "1.0.0")` 引用。开发者本地 ssh key 自动鉴权;CI 上配置 deploy key 或使用 Apple 推出的 GitHub App Token,而不是把 PAT 直接写入仓库。私有源的版本号必须遵守 SemVer,否则下游 `from:` 锁定语义会失效。

### `OTHER_SWIFT_FLAGS` 实用 flag

| Flag | 用途 |
| --- | --- |
| `-warn-long-function-bodies=200` | 函数体编译超过 200ms 报警告,SwiftUI 长 body 拆分依据 |
| `-warn-long-expression-type-checking=200` | 单个表达式类型推断 >200ms 警告,逼你显式标类型 |
| `-Xfrontend -enable-actor-data-race-checks` | 运行时额外校验 actor 隔离(Debug 用) |
| `-strict-concurrency=complete` | 等价于 `SWIFT_STRICT_CONCURRENCY=complete`,Swift 6 默认开启 |

### Build for testing 与 Archive 流程

- `xcodebuild build-for-testing -scheme NotesIsland -destination 'generic/platform=iOS Simulator'` 会产物到 `.xctestrun`,CI 上配合 `test-without-building` 能省一次编译。本系列后面 CI 全部走这条路径。
- Archive 流程从 Product → Archive 触发,实际执行的是 `xcodebuild archive`,会强制走 Release Configuration、`SWIFT_COMPILATION_MODE=wholemodule`、写 dSYM。Organizer 看到 Archive 后,选 Distribute App → App Store Connect → Upload,Xcode 调用 `altool` / `notarytool` 上传,后续在 ASC 端做 ITMS 校验。
- Archive 前的自检:Edit Scheme → Archive → Build Configuration 必须是 Release,Pre/Post-actions 里别留 `echo` 之类容易让脚本沙箱报错的命令。

### 模块化对编译时间的具体影响

NotesIsland 拆分前后的实际数据可以作为参考:**全量 cold build 从 86 秒降到 64 秒**(收益主要来自 wholemodule 优化能够独立应用于每个 module),**改一行 UI 代码的增量 build 从 14 秒降到 2.8 秒**(因为只重编 `NotesUI`),**改一行 Core 类型定义的增量 build 仍然是 11 秒**(Core 是依赖根,所有上游都要重编)。结论:**模块拆分对「上游叶子模块迭代」收益巨大,对「底层 Core 模块迭代」收益有限**。所以反过来要求把 Core 的接口尽量稳定化,频繁变动的实现细节下沉到上层模块。

### Resource bundle 的多形态

SPM target 里的 resource 有四种处理方式:`.process(_:)` 走 Apple 的资源编译管线(Asset Catalog、Storyboard、xcstrings 都属于这一类,会被 actool/ibtool 处理);`.copy(_:)` 原样拷贝,适合配置 JSON、模型文件;`.embedInCode(_:)` 直接把二进制塞入生成的 Swift 代码,适合极小的 seed 数据;不声明任何处理则在 Xcode 16 下会以警告告诉你「这个文件被忽略了」。NotesIsland 的 `seed.json` 用 `.process()` 即可,因为不需要被特殊处理,SPM 会按 process 默认行为复制到 `<Bundle>/Resources/`。

### 手动验收清单

1. 在 Xcode 项目根目录运行 `xcodebuild -resolvePackageDependencies`,确认 `Package.resolved` 生成,版本号锁住。
2. 修改 `NotesCore/Note.swift` 中一个属性注释,Cmd+B,观察 Report Navigator:只有 `NotesCore` 被重新编译,`NotesPersistence` / `NotesUI` 命中 cache。
3. 修改 `NotesUI` 中一个 View 文本,Cmd+B,只有 `NotesUI` 被重新编译。
4. Edit Scheme → Run → Build Configuration 切到 Release,Cmd+R,观察启动后读取 `API_BASE_URL` 应为生产 URL;切回 Debug,应为 staging。
5. Product → Archive → Distribute App → Validate App,审核 Pre-flight 通过。

---

## 五、踩坑

**坑 1:把 SwiftData 模型放进 Core 模块。** SwiftData 的 `@Model` 宏会展开成 `class` + Objective-C runtime 注册,会把整个 Core 模块拖入 Foundation 之外的依赖,且 `@Model` 类是引用类型、隔离域不清,跨 actor 传不动。教训就是上面 NotesCore / NotesPersistence 的拆分:Core 只放 `Sendable` 值类型 + 协议,SwiftData 模型放 Persistence 内部不 `public`,跨模块只流通 `NoteSnapshot`。

**坑 2:`Bundle.main` 在 SPM target 里取不到资源。** SPM target 里的资源会被打包到一个名叫 `<PackageName>_<TargetName>.bundle` 的独立 bundle,要用 `Bundle.module` 访问,这个变量由 SPM 自动生成。直接 `Bundle.main.url(forResource:)` 在 App target 里能跑,放到 SPM 里就 nil,且不会编译报错,只在运行时安静失败。

**坑 3:SPM target 里写 `import UIKit` 后,macOS / visionOS build 直接失败。** Apple 平台共享代码时,跨平台 import 用 `#if canImport(UIKit)` / `#if canImport(AppKit)` 包起来,在 `Package.swift` 的 `platforms` 里也要显式声明 `.iOS(.v18)` 之外的目标平台,否则 Xcode 16 会在 SwiftUI Preview 跨 destination 切换时编译失败,且报错信息只说「no such module 'UIKit'」,不会指向 platforms 声明。

**坑 4:`.binaryTarget` xcframework 与 Swift 6 严格并发。** 引入第三方提供的 `.xcframework` 时,如果 framework 内部还停留在 Swift 5,严格并发模式下会把对外类型推断为非 Sendable,你在调用处只能 `@preconcurrency import XYZFramework` 临时降级,且要在 ChangeLog 写明依赖升级条件。不要图方便加 `@unchecked Sendable`,Swift 6 的红线一旦松开就回不来。

**坑 5:`xcconfig` 被 Xcode GUI 静默覆盖。** Xcode 16 仍然保留在 Build Settings 面板里直接编辑值的能力,GUI 编辑会写到 `.pbxproj`,优先级高于 `xcconfig`。一旦发生覆盖,后续改 xcconfig 没有任何效果。规则:**只在 xcconfig 里改 build setting,Build Settings 面板只用来查看不用来改。** review `.pbxproj` diff 时看到 build setting 行,立刻反推到 xcconfig。

**坑 6:`OTHER_SWIFT_FLAGS` 漏 `$(inherited)`。** 写 `OTHER_SWIFT_FLAGS = -enable-bare-slash-regex` 会覆盖父级、SDK 默认、Xcode 内置的所有 flag,导致 SwiftUI Preview 或 macro 展开莫名其妙报错。正确写法永远是 `OTHER_SWIFT_FLAGS = $(inherited) -enable-bare-slash-regex`。这条踩过的人不在少数,Apple 的 build setting 继承链不会主动 merge。

**坑 7:旧教程用 Xcode 子项目(`.xcodeproj` 嵌套)做模块化。** Xcode 11 之前的主流做法,但 Xcode 16 + SPM 时代,子项目的优势(资源 bundle、跨配置)已经被 SPM 完全覆盖,反而带来 scheme 管理、Derived Data 共享、CI 缓存的额外复杂度。新项目直接 local SPM,不要再走子项目老路。

**坑 8:Archive 在 CI 上报 `code signing` 失败,本地却能过。** 默认 Automatic signing 依赖本地 Xcode 登录的 Apple ID,CI 无法访问 keychain。CI 上必须改 Manual signing + `xcodebuild -exportOptionsPlist` 显式 provisioning profile,或者使用 Xcode Cloud / Fastlane match 管理证书。这件事会在第 30 篇讲签名链时再展开。

**坑 9:SPM 引用本地路径用 `path:` 而不是 `url:`。** 本地 package 一定要用 `.package(path: "../NotesCore")`,如果误写成 `.package(url: "../NotesCore", from: "1.0.0")`,SPM 会把它当成 remote 仓库尝试 clone,报错信息含糊不清。NotesIsland 的根 `Project.xcodeproj` 通过 「File → Add Package Dependencies → Add Local…」加载本地 SPM 是最稳的方式,Xcode 会自动维护 `.pbxproj` 中的本地引用,不会污染 `Package.resolved`。

**坑 10:模块拆分后 SwiftUI Preview 找不到资源。** 第 28 篇之前,`Image("hero")` 直接读 App target 的 Asset Catalog;模块化以后,把 Asset 放进 SPM target 时,需要写成 `Image("hero", bundle: .module)`,否则 Preview 与运行时都拿不到图片。`Bundle.module` 是 SPM 在每个 target 内部自动注入的常量,无需声明。

**坑 11:`Swift Package Index` 上的版本号与 Apple 平台兼容性。** 评估第三方 SPM 时不要只看 GitHub Star 数,要去 swiftpackageindex.com 查 build status,确认它能在 iOS 18 + Swift 6 strict concurrency 下成功 build。许多在 iOS 16 时代流行的 SPM 包还没完成 Sendable 标注,在 Swift 6 模式下会冒出几十个并发警告。

**坑 12:严格并发模式下 `@MainActor` 在跨 module 边界传染。** Core 模块里把一个 protocol 标 `@MainActor` 后,所有依赖该 protocol 的 UI 模块代码都会被强制 MainActor,触发大量警告。规则:**只在 UI 层标 `@MainActor`,Core / Persistence 层用 `Sendable` 与 `actor` 表达隔离**,避免主线程隔离从内往外溢。这是模块化后 Swift 6 并发模型最容易踩的隐性约束。
