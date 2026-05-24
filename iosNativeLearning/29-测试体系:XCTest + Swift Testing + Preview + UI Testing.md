# 29 测试体系:XCTest + Swift Testing + Preview + UI Testing

NotesIsland 拆完 SPM 模块后,跨模块边界变成 `NoteStore` 协议,Persistence 与 UI 终于可以单独测。本篇把 iOS 18 / Swift 6 / Xcode 16 时代的测试矩阵摆开:**Swift Testing**(新框架)拿走绝大多数业务单测,**XCTest** 仍然负责 UI Testing 与 Performance Test,**`#Preview` 宏**是写视图时的快反馈环,**XCUIApplication** 跑端到端 UI Test 但代价不小,自建 **snapshot test** 用第三方 `swift-snapshot-testing` 补 UI 回归。每种工具的边界、写法、和 CI 的成本曲线都要分得清楚,否则要么测得不够,要么测试堆积反噬迭代速度。

写到这里要先承认一件事:**iOS 项目的测试文化整体落后于 Web 与后端**。一方面是历史原因——XCTest 长期停留在 Objective-C 时代设计的 API 上,async 写法非常别扭;另一方面是工程现实——iOS App 的 UI 高度依赖系统(navigation transition、键盘、相机、Keychain 弹窗),模拟器只能覆盖一半,真机自动化又贵。Swift Testing 的发布是这种局面松动的开始:把单测从 XCTest 的 fixture 心智里彻底解放,鼓励测试代码用 Swift 6 的并发模型与值类型重新组织。本篇要传达的核心不是「Swift Testing 是个更漂亮的语法糖」,而是「单测、集成测、UI 测、视觉测、性能测各自有明确的边界,把每件事用最便宜的工具做完」。

---

## 一、机制定位

**Swift Testing 不是 XCTest 的语法糖。** 2024 年 WWDC 发布的 `import Testing` 框架在 Xcode 16 正式上线,基于 Swift macro 重写,关键差异:

- 用 `@Test` 函数取代 `XCTestCase` 子类 + `func test...` 命名约定。
- 用 `#expect(...)` / `#require(...)` 取代 `XCTAssert...` 系列;失败信息由 macro 在编译期捕获子表达式,比 `XCTAssertEqual` 更精准。
- 测试函数可以是 `async throws`,可以直接用 `await`、`#expect(throws:)`、参数化 `@Test(arguments: ...)`。
- 测试天然按 task 并行执行,默认 nonisolated,跨测试共享 actor 状态会直接被并发模型识别,**严格并发模式下你写不出共享可变全局变量这种老式 fixture**。

但 Swift Testing 不接管 UI Test、不接管 `XCUIApplication`、不接管 `measure { }` 性能测试。Apple 的官方界限是:**单元测试与集成测试用 Swift Testing,UI Test / Performance Test 继续 XCTest。** 一个 test target 里两个框架可以并存。

**`#Preview` 不是测试,但承担「视图迭代」的核心反馈环。** 它在 Xcode 16 里走的是独立的 preview compiler、独立的运行时(`XCPreviewAgent`),与真机 / 模拟器跑的 App 环境**不同**。预览能跑通不代表 App 跑得通,踩坑章节会展开。

**为什么不用一套 XCUITest 全覆盖?** UI Test 在 CI 上的成本是单测的 50-200 倍:每个 case 启动一次 simulator、`launch()` App、走 accessibility tree 查询、断言。一个 50 case 的 UI Test 套件在 CI 上跑 30 分钟很常见。教训:**业务逻辑下沉到 Swift Testing,UI Test 只覆盖关键路径的烟雾测试(smoke test),snapshot test 补视觉回归。**

**测试金字塔的 Apple 平台版本。** 经典的测试金字塔(单测多、集成测中、E2E 少)在 iOS 上同样适用,但层级名字要替换:**Swift Testing 单测占 70%(纯 Sendable 值类型与 actor)→ Swift Testing 集成测占 20%(SwiftData in-memory、URLSession 用 URLProtocol mock)→ XCUITest 端到端占 8%(关键 happy path)→ snapshot test 占 2%(视觉关键页面)**。这套配比在 NotesIsland 这种规模(30 个 SwiftUI 屏、5-8 个核心 use case)是经过验证的合理基线,过度倾斜到 UI Test 会让 CI 时间失控,过度倾斜到单测会漏掉真机才暴露的 SwiftData 迁移 / Keychain 权限 / Privacy Manifest 问题。

---

## 二、Apple 平台心智

### Swift Testing 关键 API

- `@Test`:把一个函数标记为测试,可以是 `func`、`static func`、可以挂在 `struct` / `actor` / `class` 上。
- `@Suite`:把一组测试组织成一个 namespace,可以加 trait(`.serialized` 让组内串行)。
- `#expect(条件, "失败描述")`:软断言,失败后测试继续跑,把所有失败一次性报出来。
- `#require(条件)`:硬断言,失败立刻抛 `ExpectationFailedError`,中断当前测试。
- `@Test(arguments: [...])`:参数化测试,等价于 XCTest 时代要手动写循环 + `XCTContext.runActivity`。
- `confirmation(expectedCount:)`:replacement for `XCTestExpectation`,等待异步事件用。
- Trait:`.tags(.fast / .slow)` / `.disabled(if:)` / `.bug(...)`,在 Xcode 16 Test Navigator 可按 tag 过滤。

### Preview 心智

`#Preview("display name", traits: ...)` 是 Xcode 15+ 的宏,在 Swift 6 + Xcode 16 下:

- Preview 进程 `XCPreviewAgent` 单独启动,默认**不调用** App 的 `@main` 入口,SwiftData 的 `ModelContainer`、`UIApplicationDelegate`、`AppDelegate` 注册的所有副作用都不会执行。
- Preview 默认在 MainActor 上跑,SwiftUI body 的 `@MainActor` 隔离能直接用。
- 注入依赖必须显式:Preview 里要么用 in-memory `ModelContainer(... isStoredInMemoryOnly: true)`,要么用 mock `NoteStore`。
- Preview Variants(动态字体、深浅色、不同语言)用 `traits: .sizeThatFitsLayout` 或 `.previewDisplayName` 区分。

### UI Test 心智

`XCUIApplication` / `XCUIElement` / `XCUIElementQuery` 三件套基于 Accessibility tree,**不是直接操作 view**,这是与 RN / Web 测试框架最大的差别:

- 通过 `accessibilityIdentifier`(SwiftUI 用 `.accessibilityIdentifier("noteRow_\(id)")`)定位,**不要用 label**,label 一国际化就崩。
- `app.launchArguments` / `app.launchEnvironment` 是测试和被测 App 之间唯一的进程边界通信通道,App 启动时读这些值决定走 mock 还是真实环境。
- UI Test target 与 App target 是**两个进程**,你不能在 UI Test 里直接 `import` App 的 Swift 模型,只能通过 accessibility tree 黑盒交互。

### Snapshot Test

`swift-snapshot-testing`(pointfreeco/swift-snapshot-testing,1.x 版本支持 SwiftUI / iOS 18)的核心思想:第一次 record 把 View 渲染成 PNG / 文本快照存到 disk,后续每次 test 把当前渲染与磁盘对比,不一致就 fail。**它不替代 XCUITest 的端到端,只补视觉回归。** CI 上跑 snapshot test 要锁定 simulator 型号、iOS 版本、Locale、Dynamic Type 尺寸,否则 1px 渲染差异就 false positive。

### Test Plan 的多 Configuration 矩阵

Xcode 11+ 引入的 Test Plan(`.xctestplan`)在 Xcode 16 已经是测试组织的官方推荐方式。一个 Test Plan 可以同时跑多套 Configuration:**Default Configuration 锁定基础语言与设备,再加一组 Configuration 覆盖中文 + 大字号 + 暗色模式 + Reduce Motion**。每个 Configuration 都会跑同一组测试,结果分组显示。这相当于把 Accessibility 与本地化的回归测试自动化掉,而不是发布前找 QA 手测一遍。Test Plan 还支持 random test order(防止隐式依赖)、按 tag 过滤(配合 Swift Testing 的 `.tags()`)、Code Coverage 开关,CI 上一行命令跑完。

### 测试目录与生产代码的依赖方向

测试 target 可以 `@testable import` 同名 module 拿到 internal 符号,但**不能** `@testable` 拿到 `package` 与 `public` 之外的符号。Swift 6 + Xcode 16 引入的 `package` 访问级别在跨 SPM target 测试时非常合用:`NotesCore` 里把测试 fixture 工厂标 `package`,`NotesCoreTests` 与 `NotesPersistenceTests` 都能用到,而对外的 App target 不可见。这种「半公开」是模块化项目里非常常见的需求,Swift 5 时代只能靠 `@_spi` 这种带下划线前缀的非正式 API 走捷径,现在终于有正式语法支撑。

---

## 三、工程实现

NotesIsland 的测试 target 结构(基于第 28 篇拆出的 SPM):

```
Packages/
├── NotesCore/Tests/NotesCoreTests/          ← Swift Testing,纯值类型
├── NotesPersistence/Tests/NotesPersistenceTests/  ← Swift Testing,async + actor
└── NotesUI/Tests/NotesUITests/              ← snapshot test
NotesIsland/
└── NotesIslandUITests/                       ← XCTest + XCUIApplication
```

```swift
// File: Packages/NotesCore/Tests/NotesCoreTests/NoteSnapshotTests.swift
// MARK: - Swift Testing:纯值类型,默认并行执行
import Testing
import Foundation
@testable import NotesCore

@Suite("NoteSnapshot 值语义")
struct NoteSnapshotTests {

    @Test("ID 相等性走 UUID")
    func idEquality() {
        let uuid = UUID()
        let a = NoteID(uuid)
        let b = NoteID(uuid)
        #expect(a == b)
        #expect(a.hashValue == b.hashValue)
    }

    // MARK: - 参数化测试:取代 XCTest 手写 for-in
    @Test(
        "title 截断保留 1-40 字符",
        arguments: [
            ("", 0),
            ("Hi", 2),
            (String(repeating: "字", count: 100), 40)
        ]
    )
    func titleClamped(input: String, expected: Int) {
        let title = NoteSnapshot.clampTitle(input)
        #expect(title.count == expected)
    }

    @Test("Codable round-trip 不丢字段")
    func codableRoundTrip() throws {
        let snapshot = NoteSnapshot(
            id: NoteID(),
            title: "Hello",
            body: "World",
            updatedAt: Date(timeIntervalSince1970: 1_700_000_000),
            attachmentCount: 3
        )
        let data = try JSONEncoder().encode(snapshot)
        let decoded = try JSONDecoder().decode(NoteSnapshot.self, from: data)
        #expect(decoded == snapshot)
    }
}
```

```swift
// File: Packages/NotesPersistence/Tests/NotesPersistenceTests/SwiftDataNoteStoreTests.swift
import Testing
import Foundation
import SwiftData
import NotesCore
@testable import NotesPersistence

// MARK: - 测试 SwiftData 与 @ModelActor:每个 case 独立 in-memory container
@Suite("SwiftDataNoteStore")
struct SwiftDataNoteStoreTests {

    // MARK: - 工厂:每个测试都拿到全新的容器,避免跨 case 状态污染
    private func makeStore() throws -> SwiftDataNoteStore {
        let config = ModelConfiguration(isStoredInMemoryOnly: true)
        let container = try ModelContainer(
            for: NoteRecord.self,
            configurations: config
        )
        return SwiftDataNoteStore(modelContainer: container)
    }

    @Test("upsert 后能按 ID 读回")
    func upsertThenRead() async throws {
        let store = try makeStore()
        let snapshot = NoteSnapshot.fixture(title: "First note")
        try await store.upsert(snapshot)

        let fetched = try await store.note(id: snapshot.id)
        let unwrapped = try #require(fetched)
        #expect(unwrapped.title == "First note")
        #expect(unwrapped.id == snapshot.id)
    }

    @Test("recentNotes 按 updatedAt 倒序")
    func recentOrdering() async throws {
        let store = try makeStore()
        let older = NoteSnapshot.fixture(
            title: "Older",
            updatedAt: Date(timeIntervalSince1970: 1)
        )
        let newer = NoteSnapshot.fixture(
            title: "Newer",
            updatedAt: Date(timeIntervalSince1970: 2)
        )
        try await store.upsert(older)
        try await store.upsert(newer)

        let recent = try await store.recentNotes(limit: 10)
        #expect(recent.map(\.title) == ["Newer", "Older"])
    }

    @Test("delete 后查不到")
    func deleteRemovesRecord() async throws {
        let store = try makeStore()
        let snapshot = NoteSnapshot.fixture(title: "To delete")
        try await store.upsert(snapshot)
        try await store.delete(id: snapshot.id)

        let fetched = try await store.note(id: snapshot.id)
        #expect(fetched == nil)
    }

    // MARK: - 校验 throws:Swift Testing 的 #expect(throws:) 替代 XCTAssertThrowsError
    @Test("非法 ID 不会抛")
    func nonexistentIDReturnsNil() async throws {
        let store = try makeStore()
        let result = try await store.note(id: NoteID())
        #expect(result == nil)
    }
}

// MARK: - 测试 fixture 工厂,放在 test target 内部,不污染产品代码
extension NoteSnapshot {
    static func fixture(
        id: NoteID = NoteID(),
        title: String = "Sample",
        body: String = "",
        updatedAt: Date = .now,
        attachmentCount: Int = 0
    ) -> NoteSnapshot {
        NoteSnapshot(
            id: id,
            title: title,
            body: body,
            updatedAt: updatedAt,
            attachmentCount: attachmentCount
        )
    }
}
```

```swift
// File: Packages/NotesUI/Sources/NotesUI/NoteListView.swift
// MARK: - 视图依赖 NoteStore 协议,Preview / Test 可注入 mock
import SwiftUI
import NotesCore

public struct NoteListView: View {
    let store: any NoteStore
    @State private var snapshots: [NoteSnapshot] = []
    @State private var loadError: String?

    public init(store: any NoteStore) {
        self.store = store
    }

    public var body: some View {
        List {
            if let loadError {
                Text(loadError).foregroundStyle(.red)
            }
            ForEach(snapshots) { snapshot in
                NoteRow(snapshot: snapshot)
                    .accessibilityIdentifier("noteRow_\(snapshot.id.rawValue)")
            }
        }
        .accessibilityIdentifier("noteList")
        .task { await reload() }
    }

    private func reload() async {
        do {
            snapshots = try await store.recentNotes(limit: 50)
        } catch {
            loadError = error.localizedDescription
        }
    }
}

// MARK: - Preview 用纯内存 mock,绕开 SwiftData / CloudKit
#Preview("Three notes") {
    NoteListView(store: InMemoryNoteStore(seed: [
        .fixture(title: "Coffee with Alex"),
        .fixture(title: "Reading list"),
        .fixture(title: "Vision OS notes")
    ]))
}

#Preview("Empty state") {
    NoteListView(store: InMemoryNoteStore(seed: []))
}
```

```swift
// File: NotesIsland/NotesIslandUITests/NoteListUITests.swift
// MARK: - XCUIApplication:整个 App 黑盒,通过 launchEnvironment 注入 mock 模式
import XCTest

final class NoteListUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUp() {
        continueAfterFailure = false
        app = XCUIApplication()
        // MARK: - App 启动时读 NOTESISLAND_UI_TEST_MODE,切到 InMemoryNoteStore
        app.launchEnvironment["NOTESISLAND_UI_TEST_MODE"] = "seeded"
        app.launch()
    }

    func testNoteListShowsSeededRows() throws {
        let list = app.collectionViews["noteList"]
        XCTAssertTrue(list.waitForExistence(timeout: 5))
        let firstRow = list.cells.firstMatch
        XCTAssertTrue(firstRow.exists)
        firstRow.tap()

        let detailTitle = app.staticTexts["noteDetail_title"]
        XCTAssertTrue(detailTitle.waitForExistence(timeout: 2))
    }

    // MARK: - Performance Test:仍然是 XCTest measure 块,Swift Testing 不接管
    func testLaunchPerformance() {
        measure(metrics: [XCTApplicationLaunchMetric()]) {
            XCUIApplication().launch()
        }
    }
}
```

---

## 四、调参与验收

### Swift Testing 与 MainActor

测试函数默认 nonisolated,如果要测的代码是 `@MainActor`,有两种写法:

```swift
@Test @MainActor
func mainActorIsolated() async {
    let view = MyView()
    #expect(view.title == "Hi")
}
```

或者把整个 `@Suite` 标记成 `@MainActor`。`@ModelActor` 的测试不需要 MainActor 标注,但要 `await` 调用,Swift Testing 的 async 支持是天然的,不像 XCTest 还要 `XCTestExpectation` + `wait(for:)`。

### `#expect(throws:)` 与 `#require`

```swift
@Test("非法 JSON 解码报错")
func decodeError() {
    let bad = Data("not json".utf8)
    #expect(throws: DecodingError.self) {
        try JSONDecoder().decode(NoteSnapshot.self, from: bad)
    }
}
```

`#require` 在拆 optional 时取代旧 `XCTUnwrap`:

```swift
let snapshot = try #require(await store.note(id: id))
#expect(snapshot.title == "Hello")
```

`#require` 失败抛 `ExpectationFailedError`,后续代码不执行,这就是「硬断言」。能用 `#expect` 就用 `#expect`,只在「断言失败后续逻辑就没意义」时用 `#require`。

### CI 跑 UI Test 的成本控制

| 策略 | 说明 |
| --- | --- |
| Smoke test only | UI Test 只覆盖启动、登录、核心 happy path,3-5 个 case |
| `xcodebuild test-without-building` | 用第 28 篇讲的 `build-for-testing` 预编译,CI 只执行 |
| `-parallel-testing-enabled YES` | 多 simulator 并行,但要注意 SwiftData 共享文件 |
| `-maximum-parallel-testing-workers 4` | M 系列 CI runner 上 4 个 worker 是性价比拐点 |
| Snapshot test 不跑在 PR | 锁 device + iOS 版本不容易,放在 release 分支单独跑 |

### Preview 与真机的差异验证

- Preview 里 SwiftData fetch 用 in-memory,真机用磁盘容器:**两者 schema 不一致时,Preview 通过 / 真机崩**。
- Preview 不触发 `applicationDidBecomeActive`,App lifecycle hook 都跑不到。
- Preview 不走 App Transport Security,Preview 里能请求的 http URL 真机会被拦。
- Preview 不持有 `UIApplication`,任何依赖 `UIApplication.shared.open(...)` 的代码 Preview 直接 crash。

### Code Coverage 的合理目标

Xcode 16 在 Edit Scheme → Test → Options 里勾上 Gather coverage,跑完测试就能在 Report Navigator 看到逐行覆盖率。Apple 平台项目的合理目标:**Core / Persistence / Networking 这类纯逻辑模块 80% 以上,UI 模块 40-60%,App target 30-50%**。不要追求 90% 全局覆盖率,SwiftUI 视图的覆盖率统计会因为 `body` 的 result builder 展开方式而失真,且为了覆盖一些边界写 mock 视图的成本远高于收益。优先把覆盖率投到 SwiftData 迁移代码、URLSession 错误分支、Keychain 失败路径这些线上 bug 的高发区。

### Mock 与 Fake 的选择

依赖注入的实现方式有 mock 和 fake 两种:**mock 是「记录调用 + 预设返回值」**,常用 SwiftMock / Mockingbird;**fake 是「写一个最简实现」**,比如 `InMemoryNoteStore` 就是 fake。Swift 6 严格并发下,mock 框架普遍卡在 `Sendable` 与 macro 兼容,不如 fake 干净。NotesIsland 的策略:**所有跨模块的协议都顺便写一个 `In<Name>` fake 实现放在 module 里**(不带 test 后缀,Preview 与 test 共用),把 mock 框架的复杂度省掉。

### 手动验收清单

1. `xcodebuild test -scheme NotesCore -destination 'platform=iOS Simulator,name=iPhone 16'`,Swift Testing 测试全绿。
2. 在 Xcode 打开 `NoteListView`,左侧 Preview 显示 3 个 seeded note。
3. 把 `Persistence` 中 `recentNotes` 故意改为 `fetchLimit = 0`,Persistence 测试套件应失败,Preview 不受影响(Preview 用的是 in-memory mock)。
4. Run UI Test scheme,5 秒内启动 simulator,3 秒内首个测试用例完成。
5. 在 Xcode 16 Test Navigator 用 tag 过滤 `.slow`,跑一次只看慢测试。

---

## 五、踩坑

**坑 1:Swift Testing 和 XCTest 在同一个 target 共存时,默认 scheme 只跑 XCTest。** Xcode 16 在 test target 的 Build Settings 里默认 `ENABLE_TESTING_SEARCH_PATHS` 已经包含 Swift Testing,但**scheme 的 Test Action 里要确认两个框架都勾上**。如果发现 Swift Testing 的 `@Test` 函数被识别但不跑,90% 是 scheme 的 Test Plan 漏配。

**坑 2:`@Test` 函数在并行执行时共享了全局状态。** Swift Testing 默认并行,如果你的测试用例隐式共享了 `UserDefaults.standard`、单例、文件系统路径,会随机失败。解决:用 `@Suite(.serialized)` 强制串行,或者每个 case 用独立 sandbox(in-memory `ModelContainer`、临时目录 `FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)`)。

**坑 3:`XCTestExpectation` 在 Swift Testing 里不能用。** 旧教程的 `let expectation = expectation(description: ...)` + `wait(for: [expectation])` 模式要改写为 `confirmation(expectedCount:)`:

```swift
@Test func notificationFires() async {
    await confirmation(expectedCount: 1) { fulfilled in
        center.observe(...) { fulfilled() }
        triggerEvent()
    }
}
```

**坑 4:Preview 里 `@Environment(\.modelContext)` 取不到值导致 crash。** 视图依赖 `modelContext` 时,Preview 必须用 `.modelContainer(...)` 修饰符注入 in-memory 容器:

```swift
#Preview {
    NoteListView()
        .modelContainer(for: NoteRecord.self, inMemory: true)
}
```

漏掉这一行,Preview 启动就 crash,且报错信息 `Fatal error: No modelContext in environment` 在 Preview 控制台才看得到,新人常以为 SwiftUI 本身有问题。

**坑 5:`#Preview` 闭包里写了 `Task { ... }`,Preview 不会跑。** Preview 默认只渲染一帧,异步 `Task` 经常被 Preview 主循环直接 cancel。要测 async 数据流的视图,在 Preview 里用 `.task { ... }` 修饰符,或者把数据直接同步预填到 `@State`。

**坑 6:`accessibilityLabel` 而不是 `accessibilityIdentifier`。** UI Test 要稳定定位元素,必须用 `accessibilityIdentifier`,因为 `accessibilityLabel` 是给 VoiceOver 读的、会被 Localizable.xcstrings 翻译。中文环境下 `app.buttons["Save"]` 找不到,改成 `app.buttons["saveButton"]` 永远跨语言可用。

**坑 7:snapshot test 在 M 系列与 Intel Mac 渲染出微小差异。** `swift-snapshot-testing` 的图像快照对 1px 的反走样都敏感,M 芯片与 Intel 芯片的 Core Graphics 路径不完全一致。CI 必须固定 runner 型号,本地 record 与 CI run 同一型号,否则 PR 一开 CI 就红。文本快照(`as: .description` / `as: .dump`)对这类问题免疫,优先用文本快照,只在真要锁视觉时才用图像快照。

**坑 8:UI Test 启动 App 没读到 launchEnvironment。** Swift 6 严格并发下,`@main` 入口里读环境变量要 `@MainActor`,且必须在 `ModelContainer` 初始化之前完成。常见错误是先创建 container,再判断 launchEnvironment,导致 UI Test 仍然用了 production 容器。正确做法:

```swift
@main
struct NotesIslandApp: App {
    let container: ModelContainer

    init() {
        let isUITest = ProcessInfo.processInfo
            .environment["NOTESISLAND_UI_TEST_MODE"] == "seeded"
        let config = ModelConfiguration(isStoredInMemoryOnly: isUITest)
        container = try! ModelContainer(for: NoteRecord.self, configurations: config)
        // 注意:这里的 try! 仅在 init 失败即 App 启动失败的场景可接受,
        // 实际项目用 Result 包裹 + 显示错误屏更稳妥
    }

    var body: some Scene {
        WindowGroup { ContentView() }
            .modelContainer(container)
    }
}
```

**坑 9:Performance Test 在 Swift Testing 里没对应物。** `measure { }` 与 `XCTMetric` 体系仍然是 XCTest 独占,Swift Testing 不接管。Apple 官方姿态是「未来再说」,2026 年的版本仍然如此。Performance Test 留在 XCTest target 里,业务逻辑测试都搬到 Swift Testing。

**坑 10:`@testable import` 在 Swift Testing 里语义不变,但 SPM target 的 `internal` 默认对测试可见需要 `Package.swift` 配合。** 第 28 篇 `enableUpcomingFeature("InternalImportsByDefault")` 开启后,`@testable import` 看到的 internal 符号清单会收缩,新增的 `package` 访问级别(Swift 5.9+)在跨 SPM target 测试时反而更合用,介于 `internal` 与 `public` 之间。
