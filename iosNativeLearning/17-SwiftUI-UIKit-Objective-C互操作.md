# 17 SwiftUI / UIKit / Objective-C 互操作

> 本系列唯一一篇直面 UIKit 与 Objective-C 主线讲法的篇目。基线 iOS 18 / Swift 6 / Xcode 16,涉及 iOS 19+ API 单独标注。**重点在"现代化互操作",不在"重学旧 iOS"**。

---

## 一、机制定位:声明式不是银弹,旧世界有真本事

到第 16 篇为止,NotesIsland 的 UI 全部在 SwiftUI 写。但写到这里很快会发现几类需求 SwiftUI 还覆盖不全:

1. **相机预览**:`AVCaptureSession` 的预览层 `AVCaptureVideoPreviewLayer` 是 `CALayer` 子类,SwiftUI 没有直接承载点;`PhotosPicker` 能选图但不能"实时取景 + 自定义滤镜"。
2. **复杂富文本输入**:`UITextView` 的 `textRange` / `markedText` / IME 半角候选区域,SwiftUI `TextEditor` 拿不到;中文 / 日文输入法的 attributed mark 也不暴露。
3. **WKWebView 注入 JS**:`WKWebView` 没有 SwiftUI 原生封装,要承接 `WKScriptMessageHandler` 必须包一层;`WKContentRuleListStore` 同理。
4. **KVO 与 NSNotification**:某些系统服务(老的 `AVPlayer.currentItem.status`、`UIDocumentInteractionController`)还在用 KVO 通知状态。Combine 的 `publisher(for:)` 能桥一部分,但回调时机和粒度有差异。
5. **旧公司内 SDK**:某些 .a / .framework 还是 Objective-C 头文件;要正确暴露给 Swift,nullability 与 generics 标注一步都不能少。Swift 6 严格并发更是把 OC 的"无 isolation"问题放大。
6. **NSException**:Swift `try/catch` 抓不到 `NSException`(它是 OC 异常,不走 Swift 错误模型),桥接逻辑里有可能踩到 `NSInvalidArgumentException`,需要在 OC 层用 `@try` 兜底。
7. **CALayer 高级合成**:`CAEmitterLayer` / `CAReplicatorLayer` / `CAGradientLayer` 等 Core Animation 类在 SwiftUI 里没有直接 wrapper;某些 Liquid Glass 之外的视觉效果还是要落到 CALayer。

UIKit 老教程的同类做法:整个 App 用 UIViewController + Storyboard,SwiftUI 当孤岛——成本太高,新项目没必要。本篇的思路是相反的:**SwiftUI 是主线,UIKit 和 OC 是补丁**,补丁通过五种官方桥接器精准嵌入,把"声明式的代码风格"贯彻到补丁外的所有地方。NotesIsland 真正用到 UIKit / OC 的地方控制在 5% 以内,且每一块都有清晰的边界文件。

---

## 二、Apple 平台心智

### 2.1 SwiftUI ↔ UIKit 的五种桥接器

| API | 用途 | 关键回调 |
| --- | --- | --- |
| `UIViewRepresentable` | 把单个 `UIView` 当 SwiftUI 视图用 | `makeUIView` / `updateUIView` / `dismantleUIView` / `Coordinator` / `sizeThatFits` |
| `UIViewControllerRepresentable` | 把 `UIViewController` 当 SwiftUI 视图用 | `makeUIViewController` / `updateUIViewController` / `Coordinator` |
| `UIHostingController` | 反过来,把 SwiftUI 视图塞进 UIKit 容器 | `init(rootView:)` / `sizingOptions`(iOS 16+) |
| `UIHostingConfiguration` | 在 `UICollectionView` cell / `UITableView` cell 里直接写 SwiftUI | iOS 16+,`cell.contentConfiguration = UIHostingConfiguration { ... }` |
| `UIViewRepresentableContext` / `UIViewControllerRepresentableContext` | 在 `update*` 里读 `environment` / `transaction` | `context.environment.colorScheme` |

### 2.2 `UIViewRepresentable` 五要素

```text
1. associatedtype UIViewType
2. func makeUIView(context:) -> UIViewType        // 创建,只执行一次(每个 Element 实例)
3. func updateUIView(_:context:)                  // SwiftUI 重计算时驱动,把声明式状态推给命令式 UI
4. static func dismantleUIView(_:coordinator:)    // 销毁时清理 KVO / observer / timer
5. func makeCoordinator() -> Coordinator          // 桥接 delegate / target-action / KVO,持有副作用
```

`Coordinator` 是 delegate 桥接器的核心:UIKit 大量靠 delegate 模式回调,SwiftUI 的视图是 `struct`,生命周期是值类型,**不能**直接当 delegate。`Coordinator` 是一个 class,SwiftUI 通过 `makeCoordinator` 让它和 view 同生命周期,delegate 设到 `Coordinator` 上,Coordinator 再把事件通过 `@Binding` / 闭包推回 SwiftUI 世界。

把这五要素的执行时机串一下,会更直观:

```text
SwiftUI 第一次需要展示 → makeCoordinator → makeUIView(把 Coordinator 设为 delegate) → updateUIView
SwiftUI 状态变化 → 同一个 Coordinator → 同一个 UIView → updateUIView
SwiftUI 这个位置不再展示 → dismantleUIView(用 Coordinator 做清理)→ Coordinator 也被释放
```

关键认知:**`makeUIView` 只跑一次,`updateUIView` 跑无数次**。所以:

- 配置 AVCaptureSession、添加 sublayer、注册 KVO 这些"昂贵且只该做一次"的事,放在 `makeUIView`。
- 把 SwiftUI 的 `@Binding`、`@State`、`@Observable` 字段推到 UIKit 视图属性上,这个动作放在 `updateUIView`,要做到**幂等**——同样的输入跑十次和跑一次效果一样。
- 反向(UIKit → SwiftUI)用 `Coordinator` 持有的闭包或 `@Binding`,在 delegate 回调里 `parent.binding = newValue`。

`makeUIView` 的另一个细节是 sizing:返回的 UIView 默认 intrinsic content size 会被 SwiftUI 当成"我希望的大小",但很多 UIView(`UITextView`、`WKWebView`)没有有效的 intrinsicContentSize,需要在 `updateUIView` 里手工 `view.invalidateIntrinsicContentSize()`,或在 SwiftUI 外层加 `.frame(height:)` 约束。iOS 16+ 提供了 `sizeThatFits(_:uiView:context:)` 让 representable 主动告诉 SwiftUI 自己的尺寸,中等复杂度的视图(签名画布、富文本)推荐用它而不是 frame 硬钉。

### 2.3 `UIHostingController` 反向嵌入

老工程是 UIKit 主线时,新 feature 用 SwiftUI 写,然后 `present(UIHostingController(rootView: NoteEditorView()))`。注意 iOS 16+ 给了 `sizingOptions = [.intrinsicContentSize]`,可以让 SwiftUI 子树的 intrinsic size 反向传给 UIKit 父容器,做"卡片自动高度"。Swift 6 下 `UIHostingController` 是 `@MainActor` 隔离,跨 actor 构造时要在 `@MainActor` 上下文里 await。

### 2.4 Bridging Header、`@objc`、可空性

**Bridging Header**:Xcode 在创建第一个 OC 文件到 Swift target,或反过来时,会问你要不要生成。它本质是一个 `.h`,Swift 编译器读它把 OC API 暴露给 Swift。命名约定 `<TargetName>-Bridging-Header.h`,在 Build Settings 的 `SWIFT_OBJC_BRIDGING_HEADER` 配置。**SPM 模块不能用 Bridging Header**,要走 `target` + `cSettings`,这是 SPM 模块化 OC 老库时的隐藏成本。Xcode 16 提供了反向产物 `<TargetName>-Swift.h`(由 Swift 自动生成,供 OC 反向 `import`),它会把 `public` + `@objc` 的 Swift API 暴露给 OC。这两份头互为对偶:正向给 Swift 看 OC,反向给 OC 看 Swift。

**`@objc`**:Swift 默认不向 OC runtime 暴露任何符号。要让 OC 调用 Swift class / method / property,加 `@objc`;要让整个 class 所有成员都自动 `@objc`,加 `@objcMembers`(老 KVO 通常配 `@objcMembers` + `dynamic var`)。Swift 6 默认是 strict concurrency,`@objc` 方法默认会被推断为 `@MainActor` 还是 `nonisolated`,要看其所在 class 的隔离域,不要漏标。常见踩坑是:`@objc` 标了但没标 `dynamic`,KVO 注册时 runtime 找不到 setter 替身,observer 永远不会触发。

`@objc` 还有一个 selector 形态的用法:`#selector(MyClass.method(_:))`,Swift 编译时 lookup OC runtime 的 selector。被引用的方法**必须**是 `@objc`,否则编译报错。这种 selector 仍出现在 `Timer.scheduledTimer(...)`、`NotificationCenter.addObserver(_:selector:...)`、`UIBarButtonItem(title:style:target:action:)` 等老 API 上,新代码尽量用 block / closure 版本(`Timer(timeInterval:repeats:block:)`)绕开。

**可空性(nullability)**:OC 头文件里的 `NSString *` 默认是 `String!`(隐式解包),这是 Swift 6 严格并发下的灾难源头——一个 `nil` 写过去,Swift 端读到的不是 `nil`,而是直接 trap。每个 OC 头文件应当包在 `NS_ASSUME_NONNULL_BEGIN` / `NS_ASSUME_NONNULL_END` 之间,确实可空的字段单独标 `nullable`。完成这一步后,Swift 看到的是清晰的 `String` / `String?`,而不是到处 `!`。Swift 6 的迁移工具会优先把没标 nullability 的 OC 头视为 `Optional`,但这会让所有引用点都要拆箱,体验更差。

**泛型与轻量化范型**:`NSArray<NSString *> *` 在 Swift 里变 `[String]`,而 `NSArray *` 变 `[Any]`,差距巨大。OC 头文件里所有集合都要写成轻量化范型(`NSArray<...> *` / `NSDictionary<K, V> *`),Swift 端体验立刻好十倍。另一个常被遗漏的是 `NS_REFINED_FOR_SWIFT` / `NS_SWIFT_NAME(...)`,前者让 Swift 端隐藏原始 OC 名字、改用 wrapper,后者直接重命名为 Swift 风格,**OC SDK 改造时这两个比改实现成本低得多**。

### 2.5 KVO 与 NSException 的兜底

- **KVO**:Swift 端用 `NSObject` 的 `observe(_:options:changeHandler:)` 拿到 `NSKeyValueObservation`,持有它就是订阅,引用销毁就反订阅。被观察的属性必须是 `@objc dynamic`。
- **NSException**:`@try / @catch` 是 OC 异常机制,**Swift 不支持**(Swift 的 `do/catch` 只抓 `Error`)。如果不可避免要兜底(三方 SDK 在错误参数下会 raise `NSInvalidArgumentException`),写一个薄薄的 OC wrapper:

```objc
// File: Bridging/NSExceptionBridge.h
NS_ASSUME_NONNULL_BEGIN
NSError * _Nullable RunOrCatch(NS_NOESCAPE void (^block)(void));
NS_ASSUME_NONNULL_END
```

```objc
// File: Bridging/NSExceptionBridge.m
NSError *RunOrCatch(void (^block)(void)) {
    @try { block(); return nil; }
    @catch (NSException *e) {
        return [NSError errorWithDomain:@"NSExceptionBridge"
                                   code:-1
                               userInfo:@{ NSLocalizedDescriptionKey: e.reason ?: @"unknown" }];
    }
}
```

Swift 端就能 `if let err = RunOrCatch({ ... }) { ... }`。这是真到不得已才用的兜底,**不要**用它来吞掉所有 OC 异常,会掩盖真实 bug。

### 2.6 Swift 6 严格并发下的桥接

- `UIView` / `UIViewController` 是 `@MainActor` 隔离的 class,`UIViewRepresentable` 的 `makeUIView` / `updateUIView` 默认就在 main actor。
- Coordinator 自己也通常是 `@MainActor`(UIKit delegate 回调都跑主线程),不需要 `nonisolated`。
- 如果 Coordinator 内部要 hold 一个 `Task`,捕获 self 时要 `weak self`,Swift 6 会要求显式标注。
- OC class 桥进来后默认是 `nonisolated`,跨入 SwiftUI 主线程时仍要走 `MainActor.run { ... }` 或确保入口标 `@MainActor`。
- `@preconcurrency`:Swift 6 引入的"兼容性遵循"声明,在 `extension UIViewController: @preconcurrency SomeDelegate { ... }` 中告诉编译器"这个 OC delegate 我相信它会在 main thread 调用,降级 isolation 检查为 warning"。这是把老 SDK 接入 Swift 6 工程的核心润滑剂——比 `@unchecked Sendable` 安全得多,因为它仍然保留了"如果实际在非 main thread 调,我们能看到 warning"的反馈面。
- `@MainActor` 与 `nonisolated`:OC 协议本身没有 isolation 概念,Swift 端遵循时要按"这个回调实际跑在哪条 queue"决定。`AVCaptureSession` 的 delegate 回调跑在你传给 `setDelegate(_:queue:)` 的 queue 上,默认主 queue;如果你给的是后台 queue,Swift 端 delegate 实现就必须 `nonisolated` 或显式跳回 `MainActor.run { ... }` 再更新 UI。这种"OC API 自己决定 queue,Swift 端只能配合"的不对称,正是为什么互操作篇需要单开一篇。

---

## 三、工程实现

下面三段代码覆盖三种最常见的桥接场景:相机预览(`UIViewControllerRepresentable` + Coordinator + AVFoundation delegate)、SwiftUI 嵌入 UIKit 容器(`UIHostingController`)、OC 旧 SDK 的 nullability + KVO 桥接。

### 3.1 相机预览:UIViewControllerRepresentable 完整路径

```swift
// File: Features/Capture/CameraPreviewView.swift
import SwiftUI
import AVFoundation

// MARK: - SwiftUI 入口
struct CameraPreviewView: UIViewControllerRepresentable {
    @Binding var lastCapturedImageData: Data?

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    func makeUIViewController(context: Context) -> CameraViewController {
        let vc = CameraViewController()
        vc.delegate = context.coordinator
        return vc
    }

    func updateUIViewController(_ uiViewController: CameraViewController, context: Context) {
        // SwiftUI 状态推给 UIKit:这里没有需要推的可变状态,留空
    }

    static func dismantleUIViewController(_ uiViewController: CameraViewController, coordinator: Coordinator) {
        uiViewController.stop()
    }

    // MARK: - Coordinator 充当 delegate
    @MainActor
    final class Coordinator: NSObject, CameraViewControllerDelegate {
        let parent: CameraPreviewView
        init(parent: CameraPreviewView) { self.parent = parent }

        func cameraDidCapture(_ data: Data) {
            parent.lastCapturedImageData = data
        }
    }
}

// MARK: - UIKit 端:命令式的 AVCaptureSession 装配
@MainActor
protocol CameraViewControllerDelegate: AnyObject {
    func cameraDidCapture(_ data: Data)
}

final class CameraViewController: UIViewController {
    weak var delegate: CameraViewControllerDelegate?

    private let session = AVCaptureSession()
    private let photoOutput = AVCapturePhotoOutput()
    private lazy var previewLayer = AVCaptureVideoPreviewLayer(session: session)

    override func viewDidLoad() {
        super.viewDidLoad()
        configureSession()
        previewLayer.videoGravity = .resizeAspectFill
        view.layer.addSublayer(previewLayer)
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer.frame = view.bounds
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        Task.detached(priority: .userInitiated) { [session] in
            session.startRunning()
        }
    }

    func stop() {
        session.stopRunning()
    }

    private func configureSession() {
        session.beginConfiguration()
        defer { session.commitConfiguration() }

        guard
            let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
            let input = try? AVCaptureDeviceInput(device: device),
            session.canAddInput(input),
            session.canAddOutput(photoOutput)
        else { return }

        session.addInput(input)
        session.addOutput(photoOutput)
    }

    // MARK: - 拍照入口由 SwiftUI 按钮触发
    func capture() {
        let settings = AVCapturePhotoSettings()
        photoOutput.capturePhoto(with: settings, delegate: self)
    }
}

// MARK: - 拍照 delegate
extension CameraViewController: @preconcurrency AVCapturePhotoCaptureDelegate {
    func photoOutput(_ output: AVCapturePhotoOutput,
                     didFinishProcessingPhoto photo: AVCapturePhoto,
                     error: Error?) {
        guard error == nil, let data = photo.fileDataRepresentation() else { return }
        delegate?.cameraDidCapture(data)
    }
}
```

外层 SwiftUI 使用:

```swift
// File: Features/Capture/CapturePane.swift
import SwiftUI

struct CapturePane: View {
    @State private var imageData: Data?

    var body: some View {
        ZStack(alignment: .bottom) {
            CameraPreviewView(lastCapturedImageData: $imageData)
                .ignoresSafeArea()
            Button("拍照") {
                // 直接驱动 UIKit 命令式 API:在 Coordinator 里做更合适,这里演示桥接思路
            }
            .buttonStyle(.borderedProminent)
            .padding()
        }
    }
}
```

> 真实场景里,把 `capture()` 也通过 Coordinator 暴露出来,SwiftUI 端给一个 `CaptureTrigger`(`@Observable`),Coordinator 监听到状态变化就调命令式 API,这才是声明式 ↔ 命令式互通的工程范式。

### 3.2 SwiftUI 嵌入 UIKit 容器

老工程是 UIKit 主线,要把 NotesIsland 的"新建笔记"页用 SwiftUI 写,然后从 UIKit 入口推出来:

```swift
// File: Legacy/NoteEntryRouter.swift
import UIKit
import SwiftUI

@MainActor
enum NoteEntryRouter {
    static func presentNewNote(on parent: UIViewController) {
        let host = UIHostingController(rootView: SecureNoteEditorView())
        host.sizingOptions = [.intrinsicContentSize]    // iOS 16+
        host.modalPresentationStyle = .formSheet
        parent.present(host, animated: true)
    }
}

// MARK: - 新写的 SwiftUI 屏幕
struct SecureNoteEditorView: View {
    @State private var text: String = ""
    var body: some View {
        NavigationStack {
            TextEditor(text: $text)
                .padding()
                .navigationTitle("新建笔记")
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("保存") { /* 调用第 16 篇的 NoteCipher / SwiftData */ }
                    }
                }
        }
    }
}
```

### 3.3 OC 旧 SDK:nullability、KVO、`@objcMembers`

假设公司有一个老 OC 上传 SDK `NIUploader`,现在要在 Swift 6 工程里规范地用上。

**OC 头文件**(在调用方工程里 audit,而不是真的去改 SDK 源码):

```objc
// File: Bridging/NIUploader.h
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

typedef NS_ENUM(NSInteger, NIUploadState) {
    NIUploadStatePending,
    NIUploadStateRunning,
    NIUploadStateFinished,
    NIUploadStateFailed
};

@interface NIUploadTask : NSObject
@property (nonatomic, readonly, copy) NSString *taskId;
/// 可空:还没开始时 nil
@property (nonatomic, readonly, copy, nullable) NSString *remoteURL;
/// KVO 可观察
@property (nonatomic, readonly, assign) NIUploadState state;
@end

@interface NIUploader : NSObject
+ (instancetype)shared;
- (NIUploadTask *)enqueueData:(NSData *)data
                     filename:(NSString *)filename;
@end

NS_ASSUME_NONNULL_END
```

**OC 实现**关键点:`state` 必须 `@objc dynamic` 才能被 KVO 观察,但因为 OC class 默认是 `@objcMembers` 行为,且 NSObject 派生的属性都默认 `dynamic`,通常不需要额外标注。

**Bridging Header**:

```objc
// File: NotesIsland-Bridging-Header.h
#import "NIUploader.h"
#import "NSExceptionBridge.h"
```

**Swift 端封装**:

```swift
// File: Bridging/UploaderBridge.swift
import Foundation

// MARK: - 把 OC API 包成 Swift 风格(Sendable / async / typed enum)
enum UploadState: Sendable {
    case pending, running, finished, failed
    init(_ raw: NIUploadState) {
        switch raw {
        case .pending: self = .pending
        case .running: self = .running
        case .finished: self = .finished
        case .failed: self = .failed
        @unknown default: self = .failed
        }
    }
}

@MainActor
final class UploaderBridge {
    static let shared = UploaderBridge()

    private var observations: [String: NSKeyValueObservation] = [:]

    func upload(_ data: Data, filename: String) async throws -> URL {
        let task = NIUploader.shared().enqueueData(data, filename: filename)

        return try await withCheckedThrowingContinuation { (cont: CheckedContinuation<URL, Error>) in
            // OC 的 KVO,在 Swift 里就是 observe(...)
            let obs = task.observe(\.state, options: [.new]) { task, _ in
                switch UploadState(task.state) {
                case .finished:
                    if let remote = task.remoteURL, let url = URL(string: remote) {
                        cont.resume(returning: url)
                    } else {
                        cont.resume(throwing: URLError(.badServerResponse))
                    }
                    self.observations[task.taskId] = nil
                case .failed:
                    cont.resume(throwing: URLError(.unknown))
                    self.observations[task.taskId] = nil
                default:
                    break
                }
            }
            self.observations[task.taskId] = obs
        }
    }

    // MARK: - NSException 兜底:某些 SDK 给空参数会 raise
    func uploadSafely(_ data: Data, filename: String) async -> Result<URL, Error> {
        var ocError: NSError?
        let captured = RunOrCatch {
            _ = NIUploader.shared().enqueueData(data, filename: filename)
        }
        if let e = captured { ocError = e }
        if let ocError { return .failure(ocError) }
        do {
            let url = try await upload(data, filename: filename)
            return .success(url)
        } catch {
            return .failure(error)
        }
    }
}
```

几个互操作的关键细节:

- `task.observe(\.state, ...)`:`\.state` 是 Swift KVO key path,要求 OC 端 `state` 是 `@objc dynamic`(`NSObject` 派生 + ARC 属性默认就是)。
- `NSKeyValueObservation` 一旦被持有就在订阅;放进字典里以 `taskId` 为 key,完成/失败时主动置 `nil` 才能反订阅,否则会泄漏。
- `withCheckedThrowingContinuation` 是 Swift Concurrency 桥接命令式回调的标准路径,**不要**再写老的 `DispatchSemaphore.wait()`。
- `RunOrCatch` 是 NSException 兜底,只在"知道这个 SDK 历史上会 raise"时用,平时不要包。

---

## 四、调参与验收

### 4.1 性能与体验调参

| 维度 | 取舍 |
| --- | --- |
| `UIViewRepresentable.updateUIView` | SwiftUI 重计算每次都会调,**昂贵的 UIKit 操作**(layer 重建、AVCaptureSession 重启)只能放 `makeUIView`,不要放 update |
| `UIHostingController.sizingOptions` | iOS 16+:`.intrinsicContentSize` / `.preferredContentSize`;不开会拿到一个固定大小,卡片高度不会自适应 |
| `UIHostingConfiguration` | iOS 16+ 在 `UICollectionView` cell 内嵌 SwiftUI,自带 reuse 与 sizing。**别**再用 `UIHostingController` 当 cell.contentView 子视图,会留 ViewController 不释放 |
| Coordinator 持有循环 | Coordinator 强持有 view 的 `@Binding`,view struct 本身被 SwiftUI 持有;Coordinator 内部 Task 捕获 self 必须 `[weak self]` |
| OC bridging 编译耗时 | Bridging Header 改一行,Swift 全模块重编。把稳定的 OC 类拆到单独的 SPM target(Objective-C target),Bridging Header 只放真正需要 mix 的入口 |

### 4.2 真机 vs 模拟器

- 模拟器**没有相机硬件**,`AVCaptureSession` 在模拟器上会拿不到任何 device,`AVCaptureDevice.default(.builtInWideAngleCamera, ...)` 直接返回 `nil`。`CameraPreviewView` 的 demo 必须真机验。
- 模拟器对老 OC SDK 通常能跑,但 `arm64` 模拟器 slice 的旧 `.a` 静态库可能不带,Xcode 16 提示 `Undefined symbol`。要么找带 simulator slice 的版本,要么用 `xcrun lipo` 自己 thin。
- `UIHostingController.sizingOptions` 的高度回传在模拟器上有时会落后一帧,真机更稳。

### 4.3 验收清单

1. **桥接相机**:真机运行 `CapturePane`,看到画面;拍照按钮按下后 `imageData` 不为空。
2. **dismantle 清理**:在 `CapturePane` 外套一个 `if showCamera`,切换显示与隐藏,`AVCaptureSession.stopRunning()` 应被调用(看 Console 日志或断点)。
3. **UIHostingController 嵌入**:在一个示例 UIKit Demo 工程里调 `NoteEntryRouter.presentNewNote(...)`,SwiftUI 视图能正确弹出,toolbar 保存按钮可用。
4. **KVO 桥接**:模拟 `NIUploadTask` 状态从 `.pending` → `.running` → `.finished`,`await upload(...)` 正确返回 URL;模拟 `.failed`,Swift 端抛出 `URLError`。
5. **nullability 验证**:在 Swift 端故意写 `let s: String = task.remoteURL` 应当编译报错(因为标 `nullable`);改成 `task.remoteURL ?? ""` 才编过。

### 4.4 工程化建议

- 用 `// File:` 注释统一标注桥接代码所在文件,审阅时一眼看到 UIKit / SwiftUI 边界。
- 把所有 `UIViewRepresentable` / `UIViewControllerRepresentable` 集中在 `Bridging/UIKitInSwiftUI/` 一个文件夹,反向(SwiftUI in UIKit)在 `Bridging/SwiftUIInUIKit/`,方便后续清理。
- OC bridging 代码放单独的 SPM target,避免污染主模块编译图。

---

## 五、踩坑

### 5.1 Swift 5 / iOS 16 旧教程的差异

1. **"`makeCoordinator` 是可选的"**:语法上是,但实战里只要用 delegate / target-action / KVO,都必须有 Coordinator,否则 SwiftUI struct 没法当 delegate target。
2. **"Coordinator 用 `weak var parent`"**:错。Coordinator 由 SwiftUI 强持有,parent (view) 是 struct,根本不能 `weak`。新写法是 `let parent: ParentRepresentable`,值类型拷贝代价可以忽略。
3. **"`updateUIView` 里重新 add subview"**:典型反模式。每次 SwiftUI 重计算就重建一遍 UIKit 视图,性能塌方。`makeUIView` 只调一次,`updateUIView` 只推可变状态。
4. **"`UIHostingController` 内嵌 cell"**:iOS 13~15 的老技巧,iOS 16+ 起用 `UIHostingConfiguration`,自动处理 reuse 和 sizing,不再需要把 `UIHostingController` 加到 cell.contentView。
5. **"`NotificationCenter.default.addObserver(forName:...)` 闭包里直接 `self.xxx`"**:Swift 6 严格并发会把 `NotificationCenter` 闭包视作 `@Sendable`,捕获 `self` 必须显式 `weak`,且 `self.xxx` 要走 `MainActor.run { ... }` 或在 `@MainActor` 上下文里 await。

### 5.2 Swift 6 严格并发踩坑

- **`AVCapturePhotoCaptureDelegate`** 等 `AVFoundation` delegate 协议尚未全面标注 `@MainActor`(它们的回调实际上在哪条 queue 调要看 `AVCaptureSession.setDelegate(_:queue:)`)。Swift 6 下 `extension Conformance` 会报 isolation 不匹配,解法是用 `@preconcurrency` 协议遵循(本文示例第 3.1 节已用),让编译器对这部分做 "信任 + warning" 而不是 hard error。
- **`NSKeyValueObservation`** 是 Sendable-friendly,但闭包内捕获的状态要自己保证线程安全。
- **`UIViewControllerRepresentable.dismantleUIViewController`** 是 `static func`,**不能**在里面捕获 view 的状态;清理逻辑要在 `Coordinator` 上,通过 `coordinator` 参数传入。
- 把 `@objc` 方法加在 `actor` 上是**非法**的:`@objc` 要求方法可以在 OC runtime 任意线程调,`actor` 隔离与之冲突。需要 OC 互通的类应该是 `NSObject` 派生 + `@MainActor`(或显式 nonisolated)。

### 5.3 OC bridging 的常见暗坑

- **`NS_ASSUME_NONNULL_BEGIN` 漏写**:Swift 端看到一堆 `String!`,引用一个 `nil` 直接 crash。审视任何接入的 OC 头文件,**第一件事**就是把这对宏加上。
- **集合不写轻量化范型**:`NSDictionary *` 在 Swift 里是 `[AnyHashable: Any]`,业务层只能到处 `as? String`。整改成 `NSDictionary<NSString *, NSNumber *> *` 一次性收益最大。
- **`@property (nonatomic, strong) NSArray *items;` 但实际可能被 KVC 设成 `nil`**:Swift 端如果声明为 `[Item]` 会在第一次 nil 写入时 trap。要么标 `nullable`,要么强约束 OC 端永远赋空数组。
- **`@objc enum` 必须 `Int` rawValue**:Swift 端定义的 enum 想被 OC 用,要 `@objc enum X: Int { case ... }`,其他 raw 类型 OC 看不到。
- **Bridging Header 放进 SPM 的尝试**:Xcode 16 仍不支持。要在 SPM 里 mix Swift + OC,得用两个 target,OC target 暴露 `module.modulemap`(或 SPM 自动生成),Swift target `import OCModule`。

### 5.4 iOS 19+ 相关

- iOS 19+ 的 Liquid Glass 视觉系统下,`UIViewRepresentable` 出来的 UIKit 视图如果不接受 `colorScheme` / `traitCollection` 变化,在背景模糊层下表现会突兀。`updateUIView` 里读 `context.environment.colorScheme`,主动 `applyAppearance(...)`。
- iOS 19+ 的 `UIHostingConfiguration` 支持更细的 background drawing,主线工程没切到 19 之前不依赖。

---

第 17 篇到此打通了 SwiftUI ↔ UIKit ↔ OC 的所有官方桥接路径。下一篇进入**推送**:`UNUserNotificationCenter` + APNs + Notification Service Extension + Push to Start Live Activity。
