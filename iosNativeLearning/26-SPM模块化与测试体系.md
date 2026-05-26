# SPM 模块化与测试体系

iOS 项目长大到一定规模(>30 屏幕、多人开发),单 target 编译时间 / 团队冲突会变成痛点。**Swift Package Manager**(SPM)是 Apple 内建的解决方案——用 `Package.swift` 把代码拆成多个本地 packages,共用一个 Xcode workspace。同时,**Swift Testing**(2024 新框架)替代了 XCTest 的大部分场景。这一篇讲透模块化 + 测试。

> 一句话先记住:**iOS 现代模块化的标准做法是"App target + 多个本地 SPM 包"——不是过去 CocoaPods 那种远程依赖,而是把项目里的代码拆成 `Packages/NotesCore`、`Packages/NotesUI` 等本地 package。测试用 Swift Testing(`@Test` + `#expect`)替代 XCTest,UI Testing 仍走 XCTest。**

---

## 一、Package.swift 基础

```swift
// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "NotesCore",
    platforms: [.iOS(.v18)],
    products: [
        .library(name: "NotesCore", targets: ["NotesCore"]),
    ],
    dependencies: [
        // 外部依赖
        // .package(url: "https://github.com/...", from: "1.0.0"),
    ],
    targets: [
        .target(
            name: "NotesCore",
            dependencies: [],
            swiftSettings: [
                .swiftLanguageMode(.v6),
                .enableUpcomingFeature("ExistentialAny"),
                .enableExperimentalFeature("StrictConcurrency"),
            ]
        ),
        .testTarget(
            name: "NotesCoreTests",
            dependencies: ["NotesCore"]
        ),
    ]
)
```

`Package.swift` 核心概念:
- **platforms**:支持的 OS 版本(可以与主 App 不同,但通常一致)
- **products**:对外暴露的 library / executable
- **targets**:源码模块(library / test / binaryTarget)
- **dependencies**:外部 SPM 包(GitHub URL)

`swiftSettings` 让你给这个 target 加专属编译选项——Swift 6 严格并发、宏 feature 开关等。

---

## 二、本地 SPM 包

把 `Packages/NotesCore/Package.swift` + `Packages/NotesCore/Sources/NotesCore/...` 拖进 Xcode 主项目侧栏,Xcode 自动识别为本地依赖。

```
NotesIsland/                    ← Xcode 项目根
├── NotesIsland.xcodeproj
├── NotesIsland/                ← 主 App target 代码
├── Packages/
│   ├── NotesCore/
│   │   ├── Package.swift
│   │   ├── Sources/NotesCore/
│   │   │   ├── Models/
│   │   │   ├── Store/
│   │   │   └── Networking/
│   │   └── Tests/NotesCoreTests/
│   ├── NotesUI/
│   │   ├── Package.swift
│   │   └── Sources/NotesUI/...
│   └── NotesShared/
│       ├── Package.swift
│       └── Sources/NotesShared/...
```

主 App target 在 General → Frameworks 里把这些 local packages 加为依赖。Xcode 编译时**先编 packages 再编 App target**,packages 单独缓存,改 App target 不重编 packages。

---

## 三、模块化原则

```
NotesShared       ← 纯 Swift,无 Apple SDK,被所有人依赖(模型 / 工具函数)
   ↑
NotesCore        ← 业务逻辑,持久化,网络;依赖 Shared
   ↑
NotesUI          ← 视图层;依赖 Core + Shared
   ↑
App target       ← Composition root,只组装,不放业务代码
```

**关键原则**:
1. **依赖单向**——下层不依赖上层。NotesCore 不能 import NotesUI。
2. **每层职责单一**——Models 在 Shared,业务在 Core,UI 在 UI。
3. **最小可见性**——package 间用 `public`,package 内默认 `internal`。
4. **避免循环依赖**——SPM 直接 build 失败。

**何时该拆模块**:
- 同一个文件被 5+ 个屏幕用,且每个屏幕改这文件
- 业务逻辑能"完全脱离 UI 单独测"
- 团队多人,merge conflict 多发生在 / 触发整个 App 重编

**何时不该拆**:
- App 不到 30 屏幕,单 target 编译时间 < 1 分钟
- 业务还在快速试错(模块边界不稳定)

---

## 四、Resource bundle 与 module map

SPM target 可以打包资源(图片 / json / xcstrings):

```swift
.target(
    name: "NotesUI",
    dependencies: ["NotesCore"],
    resources: [
        .process("Resources/Assets.xcassets"),
        .copy("Resources/sample-data.json"),     // 原样复制,不处理
    ]
)
```

代码里访问:

```swift
let image = Image("Hero", bundle: .module)
let url = Bundle.module.url(forResource: "sample-data", withExtension: "json")
```

`Bundle.module` 是 SPM 自动生成的 wrapper,指向当前 target 的 resource bundle。

---

## 五、binaryTarget:xcframework

集成闭源 SDK(.xcframework 形式)用 `binaryTarget`:

```swift
.binaryTarget(
    name: "SomeSDK",
    path: "Frameworks/SomeSDK.xcframework"
),
.target(
    name: "NotesCore",
    dependencies: ["SomeSDK"]
)
```

或者远程 URL:

```swift
.binaryTarget(
    name: "SomeSDK",
    url: "https://example.com/SomeSDK-1.2.3.xcframework.zip",
    checksum: "abc123..."
)
```

xcframework 必须**多 architecture 支持**(arm64 真机、arm64 模拟器、x86_64 模拟器)。2026 年绝大多数 SDK 都是 xcframework 格式;老的 `.framework`(单 arch)已经淘汰。

---

## 六、Swift Testing:替代 XCTest

Apple 2024 推出的 `Testing` framework,Swift 原生 + macro 驱动:

```swift
import Testing
@testable import NotesCore

@Test func notesStartEmpty() {
    let store = NotesStore()
    #expect(store.notes.isEmpty)
}

@Test func canAddNote() async throws {
    let store = NotesStore()
    let note = Note(title: "test")
    try await store.add(note)
    
    #expect(store.notes.count == 1)
    #expect(store.notes.first?.title == "test")
}

@Test("空标题不允许")
func emptyTitleRejected() async {
    let store = NotesStore()
    await #expect(throws: ValidationError.self) {
        try await store.add(Note(title: ""))
    }
}
```

核心 API:
- `@Test` 标记测试函数(替代 XCTest 的 `test` 前缀约定)
- `#expect(condition)` 断言(替代 `XCTAssert*`)
- `#require(condition)` 失败即终止(替代 `XCTUnwrap`)

Swift Testing 优势:
- **async 测试是一等公民**,直接 `async throws`
- **参数化测试**比 XCTest 强
- **报错更精准**(显示具体哪个表达式)
- **Tag / suite 组织灵活**

---

## 七、参数化测试

```swift
@Test(arguments: [
    ("hello", 5),
    ("", 0),
    ("a", 1),
    ("中文", 2),
])
func stringLength(input: String, expected: Int) {
    #expect(input.count == expected)
}

@Test(arguments: zip(["a", "b", "c"], [1, 2, 3]))
func zipped(s: String, n: Int) {
    #expect(s.count == 1)
    #expect(n > 0)
}
```

每个 argument 跑一次,Xcode 显示每个 case 独立结果。

---

## 八、Trait:Tag / 条件 / serialization

```swift
@Test(.tags(.slow), .disabled("等 fix 后开启"))
func slowTest() { ... }

@Test(.enabled(if: ProcessInfo.processInfo.environment["CI"] != nil))
func onlyInCI() { ... }

@Suite(.serialized)
struct OrderedTests {
    @Test func first() { ... }
    @Test func second() { ... }    // 必在 first 之后跑
}
```

Tag 帮你给测试分类(`slow` / `flaky` / `integration`),Test Plan 里按 tag 启用 / 禁用。

---

## 九、测试 SwiftData 与 MainActor

```swift
@Test @MainActor
func canFetchNotes() async throws {
    let schema = Schema([Note.self])
    let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
    let container = try ModelContainer(for: schema, configurations: [config])
    let context = ModelContext(container)
    
    context.insert(Note(title: "a"))
    context.insert(Note(title: "b"))
    try context.save()
    
    let notes = try context.fetch(FetchDescriptor<Note>())
    #expect(notes.count == 2)
}
```

`isStoredInMemoryOnly: true` 让每个测试用独立内存数据库,**测试隔离 + 不污染**。

`@MainActor` 标在 @Test 上让该测试在主 actor 跑,适合 SwiftData / SwiftUI 相关测试。

---

## 十、UI Testing 仍走 XCTest

UI Testing 还得用 XCTest,因为它涉及 `XCUIApplication`(driver 模式):

```swift
import XCTest

final class NotesUITests: XCTestCase {
    var app: XCUIApplication!
    
    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["-uiTesting"]    // 让主 App 知道这是 UI 测试
        app.launch()
    }
    
    func testAddNote() {
        let addButton = app.buttons["addNote"]    // 通过 accessibility identifier 找
        addButton.tap()
        
        let titleField = app.textFields["title"]
        titleField.tap()
        titleField.typeText("Test Note")
        
        app.buttons["save"].tap()
        
        XCTAssertTrue(app.staticTexts["Test Note"].exists)
    }
}
```

主 App 给元素加 `.accessibilityIdentifier(...)` 让 UI Test 能找到:

```swift
Button("保存") { ... }
    .accessibilityIdentifier("save")
```

UI Testing 慢、易 flaky,只覆盖**关键用户路径**(注册 / 登录 / 核心 CRUD),不要全覆盖。

---

## 十一、`#Preview` 宏与测试边界

Xcode 15+ 用 `#Preview` 替代旧 `PreviewProvider`:

```swift
#Preview("默认状态") {
    NoteListView()
        .modelContainer(for: Note.self, inMemory: true)
}

#Preview("加载中") {
    NoteListView(store: .init(state: .loading))
}
```

**Preview 不是测试**——它跑在 Xcode 进程里,行为与真机 / 模拟器都有差异(没有完整生命周期、推送、CloudKit)。Preview 用于"快速看视图长什么样",验证业务用真测试。

---

## 十二、Snapshot Testing

把视图渲染成 PNG 与预期对比——swift-snapshot-testing 是社区主流:

```swift
import SnapshotTesting
import Testing

@Test func noteRowAppearance() {
    let view = NoteRow(title: "test", date: Date(timeIntervalSince1970: 0))
    assertSnapshot(of: view, as: .image(layout: .fixed(width: 320, height: 60)))
}
```

第一次跑生成基准图(`__Snapshots__/...`),后续跑对比。**优点**:回归检测视觉变化;**缺点**:跨设备 / dark mode 各跑一遍,图片仓库膨胀。

适用:**核心 UI 组件**(主按钮、主卡片)。一般业务用 SwiftUI Preview + 人眼 review 即可。

---

## 十三、CI 流程

GitHub Actions / Xcode Cloud / Fastlane 跑测试:

```bash
xcodebuild test \
  -workspace NotesIsland.xcworkspace \
  -scheme NotesIslandTests \
  -destination 'platform=iOS Simulator,name=iPhone 15 Pro,OS=18.0'
```

或者通过 `xcodebuild test-without-building`(已 build,只跑测试)。

**UI Testing 在 CI 上要小心**:模拟器在 GitHub Actions 上启动慢、不稳定。建议:
- 单元测试在每个 PR 上跑(快)
- UI 测试只在 main 分支 / nightly 跑(慢 + flaky)

---

## 十四、踩坑

1. **本地 SPM 包改了主 App 不自动重编**——通常因为 derivedData 缓存。Cmd + Shift + K 清后重 build。
2. **`Bundle.module` 找不到**——SPM target 必须显式声明 `resources:` 才有 `.module`。
3. **本地 SPM 包跨依赖**——`A` 依赖 `B`,`B` 依赖 `A` → 循环,SPM 拒绝。
4. **Swift Testing 找不到**——iOS 18 / Xcode 16+ 才内置。老 Xcode 不支持。
5. **`@MainActor` 标在 XCTest test method 上**——XCTest 已经在 main thread,标了无害但多余。Swift Testing 标 `@MainActor` 才有意义。
6. **UI Test 找不到元素**——多数因为 accessibility identifier 没设,或者元素未渲染完。`waitForExistence(timeout:)` 加超时等待。
7. **Snapshot 测试在 CI vs 本地结果不一致**——字体渲染细微差异,通常因为 simulator iOS 版本不同。CI 锁版本。
8. **`Package.swift` 改了主 App 不知道**——Xcode 偶尔不刷新,Reset Package Caches 或重启 Xcode。
9. **`#expect` 报错信息看不懂**——Swift Testing 显示表达式 + 实际值,但复杂表达式可能很长。拆成中间变量。
10. **本地包发到 GitHub 后远程引用版本号不对**——SPM 需要 tag(`git tag 1.0.0 && git push --tags`),没 tag 远程引用拿不到。

---

下一篇 `27-签名TestFlight与上架.md`,讲签名链(Certificate + Provisioning Profile + Entitlements)、Automatic vs Manual signing、Xcode Cloud / Fastlane CI、TestFlight 内测 + 外测、Build 上传、App Store 审核常见 reject、隐私问卷、加密合规声明、多平台延伸(macOS / iPadOS / visionOS / watchOS)。
