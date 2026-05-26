# UIKit 与 Objective-C 互操作

SwiftUI 在 2026 年覆盖了大多数 UI 场景,但**仍有 5%-10% 的能力 SwiftUI 不存在或不够好**——`UITextView` 的精细控制、`UIScrollView` 的某些手势、相机 / 视频自定义 UI、地图 / WebKit、某些三方 SDK 只暴露 UIKit。这一篇讲透 SwiftUI 与 UIKit / Objective-C 互操作:**`UIViewRepresentable` 五要素、`UIViewControllerRepresentable`、`Coordinator` 桥 delegate、`UIHostingController` 反向嵌入、SwiftUI 不存在的能力清单、Bridging Header / `@objc` / NS 类的可空性**。

> 一句话先记住:**`UIViewRepresentable` / `UIViewControllerRepresentable` 是 SwiftUI 包装 UIKit 视图的桥——实现 5 个方法把 UIKit View 暴露成 SwiftUI 视图;反向 `UIHostingController` 把 SwiftUI 嵌进 UIKit。Coordinator 是 SwiftUI 持有的 NSObject,做 UIKit delegate / target-action 的接收方,把 UIKit 事件桥回 SwiftUI 状态。**

---

## 一、UIViewRepresentable 五要素

最小可运行例子:用 `UIActivityIndicatorView`(SwiftUI 也有 `ProgressView`,这里只是演示):

```swift
import SwiftUI
import UIKit

struct ActivitySpinner: UIViewRepresentable {
    var style: UIActivityIndicatorView.Style = .medium
    @Binding var isAnimating: Bool
    
    // 1. makeUIView:创建一次 UIKit view
    func makeUIView(context: Context) -> UIActivityIndicatorView {
        let v = UIActivityIndicatorView(style: style)
        v.hidesWhenStopped = true
        return v
    }
    
    // 2. updateUIView:SwiftUI 状态变化时同步到 UIKit
    func updateUIView(_ uiView: UIActivityIndicatorView, context: Context) {
        if isAnimating {
            uiView.startAnimating()
        } else {
            uiView.stopAnimating()
        }
    }
    
    // 3. 可选:自定义 size(SwiftUI 默认按 intrinsic 算)
    func sizeThatFits(_ proposal: ProposedViewSize, uiView: UIActivityIndicatorView, context: Context) -> CGSize? {
        uiView.intrinsicContentSize
    }
    
    // 4. 可选:dismantleUIView(view 被销毁前清理)
    static func dismantleUIView(_ uiView: UIActivityIndicatorView, coordinator: ()) {
        uiView.stopAnimating()
    }
}
```

五个方法:
1. **`makeUIView(context:)`**——创建 UIKit view,只调用一次
2. **`updateUIView(_:context:)`**——SwiftUI 状态变化时调用,把新状态同步到 UIKit
3. **`makeCoordinator() -> Coordinator`**——可选,创建 NSObject 接收 UIKit 事件
4. **`sizeThatFits(_:uiView:context:)`**——可选,自定义尺寸
5. **`dismantleUIView(_:coordinator:)`**——可选,view 销毁前清理

最常用的就是 1 和 2。

---

## 二、Coordinator:UIKit 事件桥回 SwiftUI

复杂例子:封装 `UITextView`(SwiftUI 的 `TextEditor` 缺富文本 API):

```swift
struct RichTextView: UIViewRepresentable {
    @Binding var text: String
    var font: UIFont = .systemFont(ofSize: 17)
    
    func makeUIView(context: Context) -> UITextView {
        let tv = UITextView()
        tv.delegate = context.coordinator    // Coordinator 接 delegate
        tv.font = font
        tv.text = text
        return tv
    }
    
    func updateUIView(_ uiView: UITextView, context: Context) {
        if uiView.text != text {
            uiView.text = text
        }
    }
    
    // 创建 Coordinator
    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }
    
    // Coordinator 是 NSObject,可以做 delegate
    final class Coordinator: NSObject, UITextViewDelegate {
        var parent: RichTextView
        
        init(_ parent: RichTextView) {
            self.parent = parent
        }
        
        func textViewDidChange(_ textView: UITextView) {
            // UIKit 事件 → 改 SwiftUI 状态
            parent.text = textView.text
        }
    }
}
```

`Coordinator` 是 SwiftUI 持有的 NSObject:**长寿命**(跟着 UIViewRepresentable struct identity 走,不像 struct 每次 build 都重建)。它的工作:
- 做 UIKit 的 `delegate` / target-action
- UIKit 事件传过来时,改 SwiftUI 的 `@Binding` 状态

`Coordinator` 内的 `parent` 字段需要在 `updateUIView` 里同步(因为 struct 每次重建,parent 引用要更新):

```swift
func updateUIView(_ uiView: UITextView, context: Context) {
    context.coordinator.parent = self        // 保持 parent 最新
    if uiView.text != text {
        uiView.text = text
    }
}
```

---

## 三、UIViewControllerRepresentable:整个 ViewController

跟 `UIViewRepresentable` 一模一样,只是包的是 `UIViewController`:

```swift
struct CameraView: UIViewControllerRepresentable {
    @Binding var capturedImage: UIImage?
    @Environment(\.dismiss) var dismiss
    
    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }
    
    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) { }
    
    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }
    
    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        var parent: CameraView
        init(_ parent: CameraView) { self.parent = parent }
        
        func imagePickerController(
            _ picker: UIImagePickerController,
            didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
        ) {
            if let image = info[.originalImage] as? UIImage {
                parent.capturedImage = image
            }
            parent.dismiss()
        }
        
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.dismiss()
        }
    }
}
```

用 sheet 弹出:

```swift
.sheet(isPresented: $showCamera) {
    CameraView(capturedImage: $image)
}
```

> 这个例子在 2026 年其实应该用 `PhotosPicker`(SwiftUI 原生)替代——`UIImagePickerController` 是为了演示桥接。17 篇会讲 `PhotosPicker` / `AVCaptureSession`。

---

## 四、SwiftUI 不存在的能力清单

到 iOS 18,以下场景 SwiftUI **没有等价 API,必须桥 UIKit**:

| 场景 | UIKit 方案 |
| --- | --- |
| `UITextView` 富文本编辑 | UITextView + NSAttributedString |
| `UIScrollView` 精细控制(zoom delegate / scroll insets) | UIScrollView |
| `UIPageViewController` 分页 | UIPageViewController |
| `UIVisualEffectView` 高级 blur | UIVisualEffectView |
| `MKMapView` 自定义 annotation rendering | MKMapView |
| `WKWebView` 浏览器嵌入 | WKWebView |
| `AVCaptureSession` 自定义相机 UI | AVCaptureVideoPreviewLayer |
| 某些 `UICollectionView` 自定义 layout | UICollectionView |
| Watch 上的 `WKExtendedRuntimeSession` | UIKit on watchOS |

随着 iOS 版本演进,这个清单在缩短——`MapKit` 在 iOS 17+ 有了 SwiftUI 版,`Charts` 完全 SwiftUI。**新项目尽量找 SwiftUI 替代,实在没有才桥**。

---

## 五、UIHostingController:把 SwiftUI 嵌入 UIKit

反方向:UIKit 项目要嵌入一段 SwiftUI:

```swift
import UIKit
import SwiftUI

class MainViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        
        let swiftUIView = NoteListView()
        let hostingController = UIHostingController(rootView: swiftUIView)
        
        addChild(hostingController)
        view.addSubview(hostingController.view)
        hostingController.view.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            hostingController.view.topAnchor.constraint(equalTo: view.topAnchor),
            hostingController.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            hostingController.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            hostingController.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        hostingController.didMove(toParent: self)
    }
}
```

`UIHostingController<RootView>` 是个 `UIViewController`,把 SwiftUI 视图作为 root view 渲染。**老项目逐步替换 UIKit 为 SwiftUI 的标准做法**——每替换一个屏幕,UIKit 容器里嵌入一个 UIHostingController。

---

## 六、Objective-C 互操作

新项目几乎不写 OC,但 **OC 三方 SDK 与 OC 类库仍然要用**。Swift / OC 互调有几个关键概念:

### 6.1 Swift 调 OC

Apple 的 framework(`UIKit` / `Foundation`)Swift 编译器自动桥,直接 import 即可:

```swift
import UIKit          // 全是 OC 类,但 Swift 用起来无感
let view = UIView()
view.backgroundColor = .red
```

调三方 OC 库:

1. **OC framework / xcframework**:Xcode 自动桥,正常 import 使用。
2. **OC 源码混编**:加一个 `<Project>-Bridging-Header.h`,把要暴露的 OC 头 `#import` 进去:

```objc
// NotesIsland-Bridging-Header.h
#import <SomeOldLib/SomeOldLib.h>
#import "MyLegacyHelper.h"
```

然后 Swift 直接用:

```swift
let helper = MyLegacyHelper()
helper.doStuff()
```

### 6.2 OC 调 Swift

Swift 类要被 OC 调用,加 `@objc`:

```swift
@objc
final class SwiftAnalytics: NSObject {       // 必须继承 NSObject
    @objc func track(_ event: String) {
        // ...
    }
}
```

`NSObject` 继承是 OC 看见 Swift 类的前提。然后 OC import 自动生成的 header(`<Project>-Swift.h`)就能用。

### 6.3 可空性标注

OC 没有 Optional 概念,但 Swift 有。OC 头文件要标 `nonnull` / `nullable`:

```objc
@interface MyHelper : NSObject
- (NSString *)nonNullString;          // Swift 看见 String,会被推 nullable!
- (NSString * _Nonnull)alsoNonNull;   // Swift 看见 String
- (NSString * _Nullable)maybeNil;     // Swift 看见 String?
@end
```

或者用 audit:

```objc
NS_ASSUME_NONNULL_BEGIN
@interface MyHelper : NSObject
- (NSString *)defaultNonNull;            // 默认非空
- (NSString * _Nullable)explicitNull;
@end
NS_ASSUME_NONNULL_END
```

**老 OC 代码没标 nullability,Swift 看到的全是隐式可选(`String!`)——用起来 crash 概率高**。接 OC 库时第一件事是看头文件有没有 nullability,没有就推动加,或者自己 Swift 侧封一层。

---

## 七、@objc 暴露的方法 / 属性

```swift
final class TouchHelper: NSObject {
    @objc dynamic var isLoading: Bool = false     // KVO 可观察
    
    @objc func handleTap(_ sender: UITapGestureRecognizer) {
        // target-action 接收方
    }
}

let tap = UITapGestureRecognizer(target: helper, action: #selector(TouchHelper.handleTap(_:)))
```

`@objc` 让方法 / 属性被 OC runtime 看见;`dynamic` 让属性参与 KVO。**SwiftUI 时代 90% 不需要这俩**——target-action / KVO 是 UIKit 老模式,SwiftUI 用 Observation。**只在桥接 UIKit 时偶尔用**。

`#selector` 是类型安全的 selector 引用,编译期检查方法存在。

---

## 八、NSException 不能 catch

Swift 的 `do-catch` **只 catch `Error`(包括 Swift error 和 OC `NSError`),不 catch `NSException`**。OC 的 `@try @catch @finally` 在 Swift 里不可用——遇到 NSException 直接 crash。

实战中:
- **大多数现代 Apple API 不抛 NSException**——错误用 `NSError` / Swift Error
- 老 OC 库可能抛 NSException(`NSInvalidArgumentException` 等),只能改用前置校验避免
- 接 OC 库时,在 OC 端封一层 `@try @catch` 转 NSError 返回 Swift

---

## 九、Bridging Header vs Module

| | Bridging Header | Module |
| --- | --- | --- |
| 谁用 | App target 混编 OC | 框架(framework / SPM) |
| 配置 | `SWIFT_OBJC_BRIDGING_HEADER` 指向一个 .h | 提供 `.modulemap` |
| 复杂度 | 简单 | 复杂 |
| 适用 | App 工程引用本地 OC 类 | 制作可复用 framework |

新项目几乎都用 SPM,SPM 包内部 OC + Swift 混编要写 modulemap,但 App target 自己有 OC 源码时仍然是 bridging header。

---

## 十、踩坑

1. **`UIViewRepresentable` 的 `updateUIView` 里又 set state**——会触发无限循环。改用 if-条件判断"真的变了再 set"。
2. **`Coordinator.parent` 不在 `updateUIView` 里同步**——父 struct 重建后,Coordinator 拿的还是老 parent,@Binding 改的是已经废弃的实例。
3. **`UIViewRepresentable` 包的 view 不显示 / 没尺寸**——多数因为 `intrinsicContentSize` 是 zero(比如 UIView 默认),要实现 `sizeThatFits` 或在 UIView 里设 frame。
4. **`@objc dynamic var` 加在 struct 字段**——struct 不能 @objc,只 class 可以。
5. **OC 类没 `NS_ASSUME_NONNULL_BEGIN`**——Swift 看到全是 `Type!`,用起来 crash 风险高。封一层。
6. **桥接老 SDK 的 callback 用 GCD 切回主线程**——可以直接在 callback 里 `Task { await MainActor.run { ... } }` 现代化,但更彻底的做法是用 `withCheckedContinuation` 把 callback 包成 async 函数。
7. **`UIHostingController` 嵌入 UIKit 之后,SwiftUI 内的 `@Environment(\.dismiss)` 无效**——因为 dismiss 是 SwiftUI sheet/NavigationStack 的概念,UIKit 容器 dismiss 要调 host VC 的方法。
8. **NSException crash 找不到原因**——Xcode 控制台只显示崩溃栈,没 backtrace 到抛点。开 Exception Breakpoint:Debugger → Breakpoint → All Objective-C Exceptions。
9. **桥接 OC 单例(`+ sharedInstance`)Swift 端拿到不是同一个**——OC 单例方法在 Swift 中调用没问题,只要 OC 端写对了。注意 Swift 不要自己 new 实例。
10. **`UIImage` <-> `Image`**——`Image(uiImage: UIImage)` 是常见桥;反向 `Image` 没有 `UIImage` 转换,要从原始数据走。

---

下一篇 `16-推送与APNs.md`,讲 `UNUserNotificationCenter` 权限请求、`UNNotificationContent` 与 schedule 本地通知、APNs token 上行流程、Notification Service Extension 修改通知内容、静默推送与后台唤醒、Push to Start Live Activity (iOS 17.2+)、与 FCM 桥接。
