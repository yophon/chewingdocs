# 19 AVFoundation 与 PhotoKit:相机、播放与相册访问

`NotesIsland` 想做的事很具体:用户掏出手机,拍一张当前在读那页书,顺手按住底部按钮录一段 30 秒的灵感口述,回到列表里点开能立刻播放,再把那张照片设为这条笔记的封面。这一连串动作背后,横跨了 Apple 平台四个 framework:相机走 **AVFoundation** 的 `AVCaptureSession`,播放走 **AVKit / AVFoundation** 的 `AVPlayer`,选已有相册图片走 **PhotosUI** 的 `PhotosPicker`,要把刚拍的照片写回系统相册才需要 **Photos** 的 `PHPhotoLibrary`。

这一篇要把这些零件之间的边界讲清,顺便回答一个绝大多数 iOS 16 旧教程没说清的问题:**什么时候你根本不需要请求相册权限**。

---

展开讲之前先做一个直觉训练:**Apple 媒体 API 的命名是有规律的**。所有"做底层音视频"的类都叫 `AV*`(AVFoundation),`AV` 是 audio-video;所有"操作系统相册"的类都叫 `PH*`(Photos / PhotoKit),`PH` 是 photo;所有"在 SwiftUI 里包好的高级控件"都在 `PhotosUI`(注意 UI 后缀)和 `AVKit` 里。看到 `AVPlayer` 就知道它是底层、可控、但要自己 wire UI;看到 `VideoPlayer` 就知道它是 SwiftUI 现成控件、省心但有黑盒。这条命名直觉能帮你在文档里少走 80% 的弯路。

---

## 一、机制定位

iOS 上"和媒体打交道"这件事,Apple 把它切成了四个心智层。把它们错搭一起,是新手最常见的工程灾难。

| 能力诉求 | framework | 关键类 | 隔离域 | 是否需弹权限 |
| --- | --- | --- | --- | --- |
| 我想自己开相机预览、自己控制曝光、自己拿原始帧 | AVFoundation | `AVCaptureSession` / `AVCaptureDevice` / `AVCapturePhotoOutput` | 后台串行队列 | 是,`NSCameraUsageDescription` |
| 我只想让用户拍一张照片,我接结果就行 | UIKit | `UIImagePickerController` | MainActor | 是,相机用途说明 |
| 我想播一段 mp4 / m4a / HLS | AVFoundation + AVKit | `AVPlayer` / `AVPlayerLayer` / `VideoPlayer` (SwiftUI) | MainActor + 内部 actor | 否(只读本地文件不需要) |
| 我想让用户从相册里挑几张图 | PhotosUI | `PhotosPicker` | MainActor | **否**(iOS 14+ 系统级选择器,App 拿不到 App 外的相册元数据) |
| 我想程序化扫描相册、按时间区段查所有照片 | Photos | `PHPhotoLibrary` / `PHAsset` / `PHFetchResult` | 任意 actor,但 changeRequest 要在 `performChanges` 闭包里 | 是,`readWrite` 或 `addOnly` |
| 我只想把刚拍的图片塞回系统相册 | Photos | `PHPhotoLibrary.shared().performChanges` | 任意 | 是,但 **`addOnly`** 足够,不用申请 `readWrite` |
| 我想自己录段音 | AVFAudio | `AVAudioRecorder` / `AVAudioSession` | MainActor | 是,`NSMicrophoneUsageDescription` |

UIKit / 老 SwiftUI / Flutter 跨端框架的同类做法会遇到的坑大致是这些:`image_picker` 之类的跨端插件常常默认申请 `readWrite` 全相册权限,iOS 14 后用户会看到"允许访问全部 / 选定照片 / 不允许"的三段式弹窗,被吐槽侵犯隐私;另一边,UIKit 时代写 `UIImagePickerController.sourceType = .camera` 拍照,要在 delegate 回调里手动拿 `info[.originalImage]`,如果你忘了在主线程切回 UI 就会 EXC_BAD_ACCESS——这是 GCD 残留心智的代价,Swift 6 严格并发会编译期挡掉。

本系列只采用 Apple 2024 之后强烈推荐的现代路径:**能用 `PhotosPicker` 就别申请相册权限,能用 `addOnly` 就别申请 `readWrite`,能用 `AVPlayer` 的 SwiftUI 封装 `VideoPlayer` 就别去搬 `AVPlayerLayer`,但需要原始相机帧时该用 `AVCaptureSession` 还是要用,不要被"高级 API 全能替代"的话术骗了。**

---

## 二、Apple 平台心智

### 1. AVCaptureSession 的三段式数据流

AVFoundation 的相机心智一句话:**Session 是一条传送带,你在传送带的入口接 Input(摄像头),在出口接 Output(拍照 / 录像 / 实时帧),中间有一个串行内部队列负责调度。**

```
┌────────────────┐    ┌─────────────────┐    ┌─────────────────────┐
│ AVCaptureDevice │───▶│ AVCaptureSession │───▶│ AVCapturePhotoOutput │
│   (后置广角)    │    │  (sessionQueue)  │    │ AVCaptureVideoData…  │
└────────────────┘    └─────────────────┘    └─────────────────────┘
                              │
                              ▼
                    AVCaptureVideoPreviewLayer
                       (UIView 上的预览)
```

注意两件事:

1. `AVCaptureSession.startRunning()` / `stopRunning()` 是**阻塞调用**,不允许在主线程跑。官方文档显式建议放到一条专用串行 `DispatchQueue` 上;Swift 6 写法里我们用 `actor` 把它隔离。
2. `AVCaptureVideoPreviewLayer` 是一个 **CALayer**,SwiftUI 没有原生 View 直接承载它。这就是为什么相机预览这件事在 SwiftUI 项目里,你**绕不开** `UIViewRepresentable`(详见第 17 篇)。

补充几个工程上常被忽略的细节:

- `AVCaptureSession` 是**进程级单例语义**——同一台手机上同一时刻只允许一个 App 占用后置广角镜头。意味着你的 App 进入相机页时,如果用户在后台开着微信视频通话,你的 session 会启动失败,你必须监听 `AVCaptureSession.wasInterruptedNotification` 与 `interruptionEndedNotification`,在视频通话挂断后重新 `startRunning`。
- `AVCaptureDevice` 是**只读属性 + 锁定后才能改**的双态对象。设置 `focusMode = .continuousAutoFocus`、`exposureMode`、`videoZoomFactor` 之前必须先 `try device.lockForConfiguration()`,改完 `device.unlockForConfiguration()`。忘了 lock 会运行时 crash(`NSGenericException`),Swift 6 编译期挡不住,只能靠你养成习惯。
- `AVCaptureVideoDataOutput` 把每一帧 `CMSampleBuffer` 喂给你做实时处理(Vision OCR / Core ML 推理),它的 delegate 跑在你指定的 **`DispatchQueue`** 上而不是 actor 上;在 Swift 6 严格并发下,处理函数里要把数据"复制成 `Sendable` 值"再投递到 actor,不能把 `CMSampleBuffer` 跨 actor 传。

### 2. AVPlayer 的三个层次

iOS 上播放视频/音频,从底到顶有三层抽象:

- `AVAsset`:**资源描述**,可以是本地 URL、HLS m3u8、AirPlay 上的远端流。
- `AVPlayerItem`:**一次播放会话的状态**,包含 currentTime、status、loadedTimeRanges。一个 Asset 可以被多个 PlayerItem 复用。
- `AVPlayer`:**控制器**,负责播放/暂停/速率/seek。一个 Player 同一时刻只播一个 PlayerItem,但可以替换。

视觉上呈现这一切的有两种方式:

| 方式 | 控件 | 适合场景 |
| --- | --- | --- |
| 纯 SwiftUI | `VideoPlayer(player:)` | 内嵌一个 16:9 视频,要 Apple 系统播放控件 |
| UIKit 封装 | `AVPlayerViewController` (via `UIViewControllerRepresentable`) | 要全屏沉浸、画中画 PiP、AirPlay 路由按钮 |
| 自绘 layer | `AVPlayerLayer` (via `UIViewRepresentable`) | 自定义播放器 UI,完全不要系统控件 |

`NotesIsland` 笔记内嵌一个小卡片样式的视频,直接用 `VideoPlayer` 已经够;但 PiP / 后台音频继续播放这种系统级能力,**只有 `AVPlayerViewController` 才内置**,自绘 layer 要自己接 `AVPictureInPictureController`,工作量天差地别。

`NotesIsland` 笔记内嵌一个小卡片样式的视频,直接用 `VideoPlayer` 已经够;但 PiP / 后台音频继续播放这种系统级能力,**只有 `AVPlayerViewController` 才内置**,自绘 layer 要自己接 `AVPictureInPictureController`,工作量天差地别。

iOS 18 还引入一个常被忽视的 API:`AVPlayerItem` 的 `preferredForwardBufferDuration`,可以告诉系统"我只想往后预加载 4 秒"。短视频流卡片场景这个值设得越小,流量越省,首帧越快,但 seek 体验越差。`NotesIsland` 这种短视频附件场景默认就好。

观察播放状态的现代写法是 **AsyncSequence**(`AVPlayer.currentItem` 的 `status` 借助 `KeyValueObservingPublisher` 也行,但 Swift 6 里更优雅的是用 iOS 18 新加的 `observe(for:)`):

```swift
for await status in player.currentItem!.statuses {
    switch status { case .readyToPlay: ...; case .failed: ... }
}
```

注意上面那个 `!` 在生产代码里要换成 `if let`,这里只是示意。iOS 16 旧教程里教的 `NSKeyValueObservation`(Combine 之前的回调式 KVO)在 Swift 6 严格并发下基本无法干净使用——`observe(_:options:changeHandler:)` 闭包是 `@Sendable` 但 SwiftUI 视图层不是,你需要一层 actor 桥接,反而不如直接迁移到 AsyncSequence。

**关于音视频流的进度**:`AVPlayer.addPeriodicTimeObserver(forInterval:queue:using:)` 是 iOS 上"播放进度回调"的标准做法,默认每秒回调几次。在 SwiftUI 里集成它的现代写法是把 closure 里的 `CMTime` 投递到 `@Observable` 模型,UI 层 `Slider` 直接绑定这个 currentSeconds。**不要把 observer 加到 `View.init` 里**,View 重建会泄漏多个 observer;正确做法是放在 `@Observable` 模型的初始化里,view dismantle 时 `removeTimeObserver`。

### 3. PhotoKit 权限分级:`addOnly` vs `readWrite`

iOS 14 起,`PHPhotoLibrary` 的授权分成了 5 种状态、2 种粒度。心智上记住一条原则:

> **如果你只是想"把一张刚拍的图存到系统相册",就申请 `.addOnly`;只有当你真的要"扫描用户全部照片"时,才申请 `.readWrite`。**

| 授权层级 | Info.plist key | 适用场景 |
| --- | --- | --- |
| 写入 | `NSPhotoLibraryAddUsageDescription` | 调用 `performChanges` 里的 `creationRequestForAsset(from:)` |
| 读写 | `NSPhotoLibraryUsageDescription` | 用 `PHFetchResult` 主动扫描相册 |
| 完全跳过 | 无 | 只用 `PhotosPicker` 让用户挑图 |

被很多人忽略的事实是:**`PhotosPicker` 是跑在另一个进程里的(就像 `UIDocumentPicker`),App 永远拿不到 picker 之外的相册数据,因此 Apple 显式承诺 `PhotosPicker` 不需要 `PHPhotoLibrary` 权限。** 你 Info.plist 里一行 usage description 都不写,`PhotosPicker` 照样能用。这是 2024 之后官方反复强调、但社区老答案没更新的点。

被很多人忽略的事实是:**`PhotosPicker` 是跑在另一个进程里的(就像 `UIDocumentPicker`),App 永远拿不到 picker 之外的相册数据,因此 Apple 显式承诺 `PhotosPicker` 不需要 `PHPhotoLibrary` 权限。** 你 Info.plist 里一行 usage description 都不写,`PhotosPicker` 照样能用。这是 2024 之后官方反复强调、但社区老答案没更新的点。

还有一个常被忽略的中间态:**`.limited`**——iOS 14+ 用户可以选"允许访问选定照片"。此时 `PHFetchResult.fetchAssets(with:)` 只能拿到用户授权的那批,数量与你 App 上次跑时不同;UI 必须为这一态准备"添加更多照片"按钮,调 `PHPhotoLibrary.shared().presentLimitedLibraryPicker(from:)`(iOS 15+ 的便捷 API,不需要任何 storyboard 跳转)。如果你忽略 `.limited`,用户的体验是"我授权了你怎么还看不到我新拍的图",会被打负分。

### 4. AVAudioRecorder 与 AVAudioSession 的耦合

录音这件事的隐藏复杂度,不在 `AVAudioRecorder` 本身,而在 **`AVAudioSession`**:它是一个全局单例,描述 "此时此刻 App 想以什么 category 使用音频"。同一台手机上,微信打字时候是 `.ambient`(可被静音键关掉);打电话时是 `.playAndRecord` + `.allowBluetooth`;播音乐时是 `.playback`(锁屏也响)。

录音前你必须做两件事:

1. 设 `AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetooth])`。
2. 调 `requestRecordPermission` 拿麦克风权限。

否则 `AVAudioRecorder.record()` 会静默失败、返回 false 但不抛错。

另一个常见但隐蔽的坑是 **interruption**。来电、Siri 唤起、闹钟都会以 `AVAudioSession.interruptionNotification` 的形式打断你正在做的录音。一个合格的语音备忘必须监听这个通知,在被打断时立刻调 `recorder.pause()`,在 interruption ended 时根据 `userInfo[AVAudioSessionInterruptionOptionKey]` 决定是否 `resume`。`NotesIsland` 因为是短录音(预期 ≤ 60s),实践上更简单粗暴:被打断直接 stop 并保存当前段,提示用户"录音被通话中断"。

录音文件格式上,iOS 推荐 **AAC in M4A 容器**(`kAudioFormatMPEG4AAC`,44.1 kHz 单声道,大约 16 kB/s),兼容性最好且系统 Quick Look 能直接预览。WAV 文件不压缩,30s 录音会到 5MB,不适合 iCloud 同步。

---

## 二、Apple 平台心智(补)

### 5. SwiftUI 承载 UIKit / CALayer 的统一模式

相机预览这种"必须用 CALayer"的场景之外,你在做媒体类 App 时会反复需要"把 UIKit 控件嵌进 SwiftUI"。Apple 给的官方协议是 `UIViewRepresentable`(裸 view)和 `UIViewControllerRepresentable`(view controller),两者都有五要素:

```
1. typealias UIViewType / UIViewControllerType
2. func makeUIView(context:) / makeUIViewController(context:)
3. func updateUIView(_:context:) / updateUIViewController(_:context:)
4. func makeCoordinator() -> Coordinator      (可选)
5. static func dismantleUIView(_:coordinator:) (可选)
```

`Coordinator` 是 UIKit delegate 模式与 SwiftUI 数据流的桥;比如 `AVCapturePhotoCaptureDelegate` 不能让 SwiftUI View 直接做(View 是 struct),必须放在 Coordinator(class)里。第 17 篇会专门讲这一套,本篇只用 makeUIView + updateUIView 这两个最朴素的方法。

### 6. PhotosPicker 的两种数据加载方式

`PhotosPickerItem` 有两个常用的加载方法:

- `loadTransferable(type: Data.self)`:拿到原始 `Data`,自己解码成 `UIImage` / `AVAsset`。适合需要保留 EXIF、需要本地落盘的场景。
- `loadTransferable(type: Image.self)`:拿到 SwiftUI `Image`,显示快但拿不到原始字节。适合只展示缩略图。

视频文件用 `loadTransferable(type: Movie.self)`(需要你定义 `Movie: Transferable`),拿到一个临时 URL,Apple 要求你在使用完后**主动复制到自己的沙盒**,因为系统给的 URL 在 picker 关闭后随时可能失效。

### 7. AVFoundation 与 Vision / Core ML 的交界

`AVCaptureVideoDataOutput` 把每帧 `CMSampleBuffer` 喂给 delegate 之后,常见两条下游路径:**Vision Framework**(OCR / 人脸 / 矩形检测,iOS 内置模型)和 **Core ML**(自训练模型)。这两条路径在 `NotesIsland` 里有具体用途:扫一页书的封面,自动识别书名 + 作者填到笔记标题;扫名片,识别公司 + 电话写进备注。

工程模板是固定的:

```
AVCaptureVideoDataOutputSampleBufferDelegate
   └─ captureOutput(_:didOutput sampleBuffer:from:)
       │   (运行在你 setSampleBufferDelegate 时指定的 DispatchQueue)
       │
       ▼
   提取 CVPixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer)
       │
       ▼
   构造 VNImageRequestHandler(cvPixelBuffer:) 
       │
       ▼
   perform([VNRecognizeTextRequest(...)])
       │
       ▼
   在 completionHandler 里跨 actor 投递 results 到 MainActor
```

详细实现留到第 25 篇(Core ML / Vision / Apple Intelligence),本篇只为读者建立一个心智:**AVFoundation 不只是"拍照录像",它是 iOS 上所有视觉智能管线的入口**。

### 8. Deferred Photo Processing(iOS 17+)

iPhone 14 Pro 起,系统相机有一个叫"延迟照片处理"的能力——按下快门那一刻只存 raw,实际的 HDR / 降噪 / 风格化处理在后台慢慢做,几秒后才在相册里"变好看"。`AVCapturePhotoOutput.isAutoDeferredPhotoDeliveryEnabled` 控制是否启用。`NotesIsland` 这种"拍完立刻要展示给用户看"的场景**应该关掉**,否则你拿到的 `fileDataRepresentation` 是原始未处理图,显示出来用户会觉得"为什么我手机自带相机的同一张图好看多了"。

---



整个 `Features/Camera/` 文件夹的依赖关系是:

```
CameraService(actor)            ← 持有 AVCaptureSession,做配置、启停、拍照
   ▲
   │ nonisolated session
   │
CameraPreviewView(SwiftUI)      ← 把 session 装进 AVCaptureVideoPreviewLayer
   ▲
   │ session 实例 props
   │
CameraCaptureView(SwiftUI)      ← UI:预览 + 快门按钮 + 错误提示
   ▲
   │ @State
   │
CameraViewModel(@Observable)    ← 协调权限、配置、拍完后存到相册
```

下面给三块代码:相机预览 + 拍照、`VideoPlayer` 卡片、`PhotosPicker` 选图、`AVAudioRecorder` 录音。全部在 Swift 6 严格并发模式下编译通过,无 `@unchecked Sendable`,无 force unwrap。

### 3.1 相机会话:用 actor 隔离 `AVCaptureSession`

```swift
// File: Features/Camera/CameraService.swift
import AVFoundation
import UIKit

// MARK: - 相机错误模型
enum CameraError: Error {
    case notAuthorized
    case configurationFailed
    case captureFailed(any Error)
}

// MARK: - 相机服务:用 actor 把 AVCaptureSession 锁在自己的隔离域里
actor CameraService {
    private let session = AVCaptureSession()
    private let photoOutput = AVCapturePhotoOutput()
    private var isConfigured = false

    // 让 UIKit 预览层能在 MainActor 读到 session;
    // session 本身是 thread-safe 但 layer 必须 MainActor 持有。
    nonisolated var captureSession: AVCaptureSession { session }

    // MARK: - 权限
    func requestAuthorization() async -> Bool {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: return true
        case .notDetermined:
            return await AVCaptureDevice.requestAccess(for: .video)
        default: return false
        }
    }

    // MARK: - 配置 input / output
    func configure() throws {
        guard !isConfigured else { return }
        session.beginConfiguration()
        defer { session.commitConfiguration() }

        session.sessionPreset = .photo

        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera,
                                                   for: .video,
                                                   position: .back),
              let input = try? AVCaptureDeviceInput(device: device),
              session.canAddInput(input) else {
            throw CameraError.configurationFailed
        }
        session.addInput(input)

        guard session.canAddOutput(photoOutput) else {
            throw CameraError.configurationFailed
        }
        session.addOutput(photoOutput)
        photoOutput.maxPhotoQualityPrioritization = .quality
        isConfigured = true
    }

    // MARK: - 启停
    func start() { if !session.isRunning { session.startRunning() } }
    func stop()  { if session.isRunning { session.stopRunning() } }

    // MARK: - 拍照:用 continuation 把 delegate 回调桥接成 async
    func capturePhoto() async throws -> Data {
        let settings = AVCapturePhotoSettings()
        settings.photoQualityPrioritization = .quality
        let delegate = PhotoCaptureDelegate()
        photoOutput.capturePhoto(with: settings, delegate: delegate)
        return try await delegate.data
    }
}

// MARK: - 一次性 delegate,符合 NSObject 协议要求
private final class PhotoCaptureDelegate: NSObject, AVCapturePhotoCaptureDelegate, Sendable {
    private let box = AsyncBox<Data>()
    var data: Data { get async throws { try await box.value } }

    func photoOutput(_ output: AVCapturePhotoOutput,
                     didFinishProcessingPhoto photo: AVCapturePhoto,
                     error: (any Error)?) {
        if let error { Task { await box.fail(error) }; return }
        guard let data = photo.fileDataRepresentation() else {
            Task { await box.fail(CameraError.configurationFailed) }
            return
        }
        Task { await box.succeed(data) }
    }
}

// MARK: - 桥接 continuation 的 actor 容器,避免裸 unsafe pointer
actor AsyncBox<T: Sendable> {
    private var continuation: CheckedContinuation<T, any Error>?
    private var pending: Result<T, any Error>?

    var value: T {
        get async throws {
            if let pending { return try pending.get() }
            return try await withCheckedThrowingContinuation { c in
                self.continuation = c
            }
        }
    }
    func succeed(_ v: T) { resume(.success(v)) }
    func fail(_ e: any Error) { resume(.failure(e)) }
    private func resume(_ r: Result<T, any Error>) {
        if let c = continuation { continuation = nil; c.resume(with: r) }
        else { pending = r }
    }
}
```

### 3.2 SwiftUI 里承载相机预览:UIViewRepresentable

读者画书页这种近距离拍摄场景,焦点选取至关重要。给 `CameraService` 加一个"点击对焦"的小补丁,演示 `lockForConfiguration` 的正确用法:

```swift
// File: Features/Camera/CameraService+Focus.swift
import AVFoundation

extension CameraService {
    // MARK: - 点击屏幕某点对焦 + 测光
    func focus(at point: CGPoint) async throws {
        guard let device = (session.inputs.first as? AVCaptureDeviceInput)?.device else { return }
        try device.lockForConfiguration()
        defer { device.unlockForConfiguration() }

        if device.isFocusPointOfInterestSupported {
            device.focusPointOfInterest = point
            device.focusMode = .autoFocus
        }
        if device.isExposurePointOfInterestSupported {
            device.exposurePointOfInterest = point
            device.exposureMode = .autoExpose
        }
    }
}
```

注意三件事:`point` 是**归一化坐标系**(0...1,左上为 0,0),不是 UIView 的 pixel 坐标;你需要用 `AVCaptureVideoPreviewLayer.captureDevicePointConverted(fromLayerPoint:)` 做转换。`lockForConfiguration` 失败会抛错,不能吞掉。`defer` 保证一定 unlock,即便中间出错,这是 Swift 6 严格并发下唯一干净的写法。



```swift
// File: Features/Camera/CameraPreviewView.swift
import SwiftUI
import AVFoundation

// MARK: - 把 AVCaptureVideoPreviewLayer 装进一个 UIView
struct CameraPreviewView: UIViewRepresentable {
    let session: AVCaptureSession

    func makeUIView(context: Context) -> PreviewUIView {
        let v = PreviewUIView()
        v.previewLayer.session = session
        v.previewLayer.videoGravity = .resizeAspectFill
        return v
    }
    func updateUIView(_ uiView: PreviewUIView, context: Context) {}

    final class PreviewUIView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var previewLayer: AVCaptureVideoPreviewLayer {
            // 类内的 layerClass 已经保证类型,这里安全转
            layer as! AVCaptureVideoPreviewLayer
        }
    }
}
```

> 这里的 `as!` 是 Apple 官方示例里同样使用的"由 `layerClass` 静态约束保证"的模式,**不是** force unwrap;Swift 6 编译期对这种 layer 类型契约没有更优雅的写法,可视为合理例外。

### 3.3 拍照页:Swift 6 严格并发完整 View

```swift
// File: Features/Camera/CameraCaptureView.swift
import SwiftUI
import Photos

// MARK: - @Observable 模型,持有 CameraService 和最近一张照片
@Observable @MainActor
final class CameraViewModel {
    let service = CameraService()
    var latestPhotoData: Data?
    var errorText: String?

    func onAppear() async {
        guard await service.requestAuthorization() else {
            errorText = "未授权使用相机"
            return
        }
        do {
            try await service.configure()
            await service.start()
        } catch { errorText = String(describing: error) }
    }
    func onDisappear() async { await service.stop() }

    func snap() async {
        do {
            let data = try await service.capturePhoto()
            latestPhotoData = data
            try await saveToPhotos(data: data)
        } catch { errorText = String(describing: error) }
    }

    // 用 addOnly 权限把图片塞回系统相册
    private func saveToPhotos(data: Data) async throws {
        let status = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
        guard status == .authorized || status == .limited else { return }
        try await PHPhotoLibrary.shared().performChanges {
            let req = PHAssetCreationRequest.forAsset()
            req.addResource(with: .photo, data: data, options: nil)
        }
    }
}

// MARK: - View
struct CameraCaptureView: View {
    @State private var vm = CameraViewModel()

    var body: some View {
        ZStack(alignment: .bottom) {
            CameraPreviewView(session: vm.service.captureSession)
                .ignoresSafeArea()
            Button {
                Task { await vm.snap() }
            } label: {
                Circle().fill(.white).frame(width: 72, height: 72)
                    .overlay(Circle().stroke(.white.opacity(0.6), lineWidth: 4).padding(-6))
            }
            .padding(.bottom, 40)
        }
        .task { await vm.onAppear() }
        .onDisappear { Task { await vm.onDisappear() } }
        .alert("出错", isPresented: .constant(vm.errorText != nil), actions: {
            Button("好") { vm.errorText = nil }
        }, message: { Text(vm.errorText ?? "") })
    }
}
```

### 3.4 PhotosPicker 选图:不要权限的相册选择器

如果你的"附件"想包括视频,要再定义一个轻量 `Transferable`:

```swift
// File: Features/Notes/MovieTransferable.swift
import SwiftUI
import CoreTransferable

// MARK: - 给 PhotosPicker 提取本地视频文件
struct MovieFile: Transferable {
    let url: URL
    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(contentType: .movie) { movie in
            SentTransferredFile(movie.url)
        } importing: { received in
            // 必须立刻拷贝到沙盒,received.file 在 picker 关闭后失效
            let copy = URL.documentsDirectory.appending(path: "video-\(UUID().uuidString).mov")
            try FileManager.default.copyItem(at: received.file, to: copy)
            return MovieFile(url: copy)
        }
    }
}
```

这是 iOS 16+ 引入的 `Transferable` 协议、`PhotosPicker.loadTransferable(type:)` 的现代写法,完全替代了老的 `NSItemProvider` 桥接。



```swift
// File: Features/Notes/NotePhotoPicker.swift
import SwiftUI
import PhotosUI

// MARK: - 让用户选最多 4 张图作为笔记附件
struct NotePhotoPicker: View {
    @State private var items: [PhotosPickerItem] = []
    @State private var images: [Image] = []

    var body: some View {
        VStack {
            PhotosPicker(selection: $items, maxSelectionCount: 4,
                         matching: .images, photoLibrary: .shared()) {
                Label("从相册添加", systemImage: "photo.on.rectangle.angled")
            }
            // iOS 17+:.task(id:) 可监听 items 变化
            .task(id: items) { await loadImages() }

            ScrollView(.horizontal) {
                HStack { ForEach(0..<images.count, id: \.self) { i in
                    images[i].resizable().scaledToFill()
                        .frame(width: 96, height: 96).clipped().cornerRadius(8)
                }}
            }
        }
    }

    private func loadImages() async {
        var loaded: [Image] = []
        for item in items {
            if let data = try? await item.loadTransferable(type: Data.self),
               let ui = UIImage(data: data) {
                loaded.append(Image(uiImage: ui))
            }
        }
        images = loaded
    }
}
```

注意上面这个组件**没有 Info.plist 权限声明**,跑起来也不会弹窗。这就是 `PhotosPicker` 相对老 `UIImagePickerController` 的最大工程红利。

### 3.5 VideoPlayer 卡片与录音器

录音器代码里我特地补一段**音量计**(metering),做一个"麦克风音量条"在 UI 上反馈用户当前是否被收到了声音——这是把录音体验从"60 分"提到"85 分"的关键细节,几乎所有大厂语音输入都做了。

```swift
// File: Features/Notes/NoteMediaView.swift
import SwiftUI
import AVKit
import AVFAudio

// MARK: - 内嵌视频卡片
struct NoteVideoCard: View {
    let url: URL
    @State private var player: AVPlayer?

    var body: some View {
        VideoPlayer(player: player)
            .aspectRatio(16.0 / 9.0, contentMode: .fit)
            .onAppear { if player == nil { player = AVPlayer(url: url) } }
            .onDisappear { player?.pause() }
    }
}

// MARK: - 录音器
@Observable @MainActor
final class AudioRecorderModel {
    private var recorder: AVAudioRecorder?
    private var meterTimer: Timer?
    var isRecording = false
    var lastURL: URL?
    var meterLevel: Float = 0   // 0...1,给波形条

    func start() async {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playAndRecord, mode: .default,
                                    options: [.defaultToSpeaker, .allowBluetooth])
            try session.setActive(true)
            let granted = await AVAudioApplication.requestRecordPermission()
            guard granted else { return }
            let url = URL.documentsDirectory.appending(path: "memo-\(Date().timeIntervalSince1970).m4a")
            let settings: [String: Any] = [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: 44_100,
                AVNumberOfChannelsKey: 1,
                AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
            ]
            let r = try AVAudioRecorder(url: url, settings: settings)
            r.isMeteringEnabled = true
            r.record()
            recorder = r
            lastURL = url
            isRecording = true
            startMetering()
        } catch { isRecording = false }
    }

    func stop() {
        meterTimer?.invalidate()
        meterTimer = nil
        recorder?.stop()
        recorder = nil
        isRecording = false
        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
    }

    // MARK: - 音量计:把 dB 折成 0...1
    private func startMetering() {
        meterTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let r = self?.recorder else { return }
                r.updateMeters()
                let db = r.averagePower(forChannel: 0)         // -160...0
                let norm = max(0, (db + 60) / 60)               // 简化:只关心 -60dB 以上
                self?.meterLevel = norm
            }
        }
    }
}
```

`Timer.scheduledTimer` 在 Swift 6 严格并发下能用,前提是 closure 内显式跳进 `MainActor`(上面已经做了)。如果对性能特别敏感,可换成 `DisplayLink` 或 `AsyncStream`,但 50ms 一次的 timer 对录音页是足够便宜的。

---

## 四、调参与验收

| 维度 | 关键参数 | 建议值 / 心智 |
| --- | --- | --- |
| 相机预览质量 | `AVCaptureSession.sessionPreset` | 静态拍照选 `.photo`,实时视频识别用 `.hd1920x1080` 或 `.vga640x480` |
| 拍照画质优先级 | `AVCapturePhotoSettings.photoQualityPrioritization` | `.quality` 比 `.balanced` 多约 200ms 但出片明显更清晰 |
| 启停时机 | `session.startRunning()` 的位置 | 必须放在专用队列;直接放主线程会卡 200~600ms |
| 视频播放器内存 | 多个 `AVPlayer` 共存数量 | iOS 上同时存在的 `AVPlayer` 超过 8 个会触发 `AVFoundationErrorDomain -11839 (tooManyOpenFiles)`,列表场景必须复用 |
| 音频会话类别 | `AVAudioSession.Category` | 录音页 `.playAndRecord`,播放页 `.playback`(锁屏继续响) |
| 写入相册权限 | `PHAccessLevel` | 默认全部用 `.addOnly`,只有相册管理类 App 才用 `.readWrite` |
| PhotosPicker 多选 | `maxSelectionCount` | 设上限,避免用户一次选 200 张图把内存打爆 |

### 录音文件大小估算

| 格式 | 30s 大约体积 | 适合 |
| --- | --- | --- |
| WAV PCM 16bit 44.1kHz mono | ~2.5 MB | 专业录音 / 后期处理 |
| AAC 64 kbps mono | ~240 KB | 语音备忘 / iCloud 同步友好 |
| Opus 24 kbps | ~90 KB | iOS 18+ 才能解码,跨端不通用,不推荐 |

`NotesIsland` 走 AAC,30s 录音不到 256 KB,CloudKit 同步几乎零代价。

### 手动验证清单
2. 点白色快门按钮,屏幕短暂闪一下,系统相册里出现这张新照片(因为是 `.addOnly`,App 应该并没有被列入"完整访问"列表)。
3. 打开 `NotePhotoPicker`,**不**编辑 Info.plist,选 4 张图,横向缩略图正常显示。
4. `NoteVideoCard` 注入一个本地 m4v URL,正常播放,退出页面再回来不会出现"两个声音同时在响"(`onDisappear` 调了 `pause`)。
5. 启动 `AudioRecorderModel`,首启弹麦克风权限,允许后调 `start()`,数秒后 `stop()`,在 `URL.documentsDirectory` 找到 `.m4a` 文件,系统音乐 App 打开能播放。
6. **审核合规检查**:Info.plist 同时存在 `NSCameraUsageDescription`、`NSMicrophoneUsageDescription`、`NSPhotoLibraryAddUsageDescription`,**不应该有** `NSPhotoLibraryUsageDescription`,除非你真的扫了相册。

---

## 五、踩坑

**关于 HDR**:从 iPhone 12 起,系统相机默认拍 HDR(HEIC + gain map),`AVCapturePhotoOutput` 在 iOS 17+ 也是默认开 HDR 的。如果你用 `photo.fileDataRepresentation()` 拿到的就是 HEIC 字节流;**绝大多数后端 / 跨平台都不认 HEIC**(Android、Web 浏览器、老 Windows 都要等系统升级)。所以做"上传到自家服务器"的笔记 App,要么在客户端转 JPEG(`UIImage(data:).jpegData(compressionQuality:0.85)`,会丢 HDR gain map),要么用 `AVCapturePhotoOutput.setPreparedPhotoSettingsArray` 显式声明 `[.jpg]` 编码。`NotesIsland` 走 iCloud 同步,Apple 全平台都认 HEIC,直接存原始数据最省。

**关于 HEIF / Live Photo / Spatial Photo 的取舍**:对应到 PhotoKit 是 `PHAssetResource` 的 `type` 字段(`.photo` / `.adjustmentData` / `.alternatePhoto` / `.fullSizePhoto` / `.pairedVideo` 等)。普通笔记 App 不需要保留 Live Photo 的视频片段;只取 `.photo` 就够。

**1. 在 main thread 调 `session.startRunning` 会被 Xcode 16 直接 Thread Sanitizer 警告**。Swift 5 旧教程里随手写 `Task { try await service.configure() ; await service.start() }` 看似没事,但如果 `service` 不是 actor,实际调用栈还是落在 MainActor,Instrument 一抓就翻车。本系列的写法是把 `service` 声明为 `actor`,`start()` 自动在 actor executor 上执行,**编译期就避免了**。

**2. `AVCapturePhotoCaptureDelegate` 必须是 `NSObject` 子类**。这是 Objective-C 时代留下的运行时要求。Swift 6 严格并发下,delegate 类自己要标 `Sendable`(因为 Apple 的 protocol 没有标 isolated 时,会要求实现者自证是 Sendable);上面的 `PhotoCaptureDelegate` 就显式标了。

**3. `UIImagePickerController` 已被 Apple 列入"软弃用"**——文档没删,但 WWDC 反复推 `PhotosPicker`。你看到的"先申请 `NSPhotoLibraryUsageDescription` 再 picker"的教程基本都是 iOS 13 时代的;**iOS 14+ `PhotosPicker` 完全不需要这个 key**。审核侧也开始更严:申请 `readWrite` 但 App 实际只挑图,会被怀疑过度采集。

**4. `PhotosPicker` 的 `loadTransferable` 默认会触发原图下载**(若用户开了 iCloud Photo Library 的"优化设备存储"),网不好时会卡几秒。生产代码要包装超时或者在 UI 上加个 progress。

**5. `AVAudioSession` 设错 category 是录音"明明 record 返回 true 但文件 0 字节"的最常见原因**。iOS 16 旧教程里给的 `.record` 在 iOS 18 已经不能在不开扬声器路由的状态下工作,正确的现代默认是 `.playAndRecord` + `.defaultToSpeaker`。

**6. `AVPlayer` 在后台**:只有当 Info.plist 里勾选 `Audio, AirPlay, and Picture in Picture` 后台模式、并且 `AVAudioSession` 是 `.playback` category 时,**才会**在 App 退到后台后继续出声。这点会在下一篇"权限模型与 Privacy Manifest"和第 21 篇"后台模式"里再详谈。

**7. `if #available(iOS 19, *)`** 部分:iOS 19+ 新增 `CapturePreview` 的 SwiftUI 原生封装(取代上面 `UIViewRepresentable` 那段);但 iOS 18 部署目标下仍需保留旧路径,本系列保持 18 路径为主、19+ 仅在注释里提一句。

**8. 不要把 `AVPlayer` 实例放在 `@State`**。`AVPlayer` 不是值类型也不是 `Equatable`,SwiftUI 重计算时偶发会创建出多个实例。要么用 `@State` + 懒初始化(`onAppear` 里 `if player == nil`),要么放进 `@Observable` 模型里。

**9. iPhone 15 Pro 以上的"接连四款机型"开始用 LiDAR / Spatial Video**。你正常调 `AVCaptureSession` 只会拿到主摄数据;要拿空间视频或深度图,需要使用 `AVCaptureMultiCamSession` 并配 `AVCaptureDepthDataOutput`,这是另一个能写满一篇的话题,本系列不展开,只提醒读者:**普通 `AVCaptureSession` 拿不到深度图**,看到旧博客把它们混着写的,直接划掉。

**10. 拍照时如果系统正好在做后台 iCloud 上传**,`AVCapturePhotoSettings.photoQualityPrioritization = .quality` 的耗时会显著拉长(在 6s 起步)。这是 iOS 平台上"性能抖动"的典型来源,商业相机类 App 通常会 fallback 到 `.balanced` 或 `.speed`,并把"拍下去那一刻"的视觉反馈(快门动画 + 缩略图占位)做得很重,以掩盖实际成像延迟。

**11. `PhotosPicker` 在 iOS 18 上引入了 `selectionBehavior: .ordered`**,选择顺序会被保留,这对"封面图必须是第一张"这种 UX 至关重要。iOS 17 上选 4 张图的顺序是按相册时间倒序,不是按用户点击顺序。

**12. `PHFetchResult` 是 NSObject 子类,不是 `Sendable`**。你不能跨 actor 直接传一个 fetchResult,要先把它转成 `[String]` 之类的 PHAsset.localIdentifier 数组再传。Swift 6 严格并发会给你显式报错,新写代码的人比老项目维护者反而少踩这个坑。

**13. iOS 18 上 `AVCaptureSession` 的 sessionPreset 行为有微妙变化**——当你在配置阶段同时 add 一个 `AVCapturePhotoOutput` 和一个 `AVCaptureVideoDataOutput` 时,iOS 18 会把 preset 自动降到两者都支持的最大档,iOS 17 则会让你 commit 失败。如果你的项目从 iOS 17 升过来,要重新过一遍配置流程的错误处理。

**14. SwiftUI `VideoPlayer` 在 iOS 18 上修复了一个长期 bug**:之前从详情页返回时偶尔会保留音频"播放"状态(虽然画面没了),要手动 `player.replaceCurrentItem(with: nil)` 才能彻底释放;iOS 18 之后 `VideoPlayer` 的 `onDisappear` 内部会 pause + nil。你的 `.onDisappear { player?.pause() }` 仍然有效,只是不再是必需的——不过为了向后兼容 iOS 17(尽管本系列基线是 18),建议保留。

**15. iCloud 同步与 PhotoKit 的微妙互动**:`PHAsset` 的 `.cloudIdentifier`(iOS 16+)是跨设备稳定的;而 `.localIdentifier` 是设备本地的、重装 App 后会变。`NotesIsland` 这种本地优先 + iCloud 同步的 App,如果你把"附件 = 一张相册图片"的引用存 SwiftData 里,**应该存 `cloudIdentifier`**,否则用户重装 App 后所有图片附件全部失联。

**16. AVCaptureSession 在多 App 切换时的 interruption**:用户在录音过程中接到电话,iOS 会主动暂停你的 session;电话挂断后**不会自动恢复**,你必须监听 `AVCaptureSession.interruptionEndedNotification` 后调 `startRunning`。iOS 16 旧教程里教的"`AVAudioSessionInterruptionTypeEnded` 收到后自动恢复"是音频领域的,对相机不适用。

**17. 为什么不要在 SwiftUI 的 `init` 里创建 `AVCaptureSession`**:SwiftUI View 的 init 会被反复调用(每次重渲染),如果你在 init 里 `AVCaptureSession()` + `startRunning`,会瞬间创建几十个 session 全部被丢弃,真机会被 thermal 标记限速。本篇的 `CameraViewModel` 模式是把 session 持有放到 `@Observable` 模型里,View 重渲染不会影响。这是 SwiftUI / `@Observable` 心智的延伸应用。

**18. `AVAudioApplication` 是 iOS 17 才引入的类**——`AVAudioSession.requestRecordPermission(_:)` 与 `AVAudioSession.recordPermission` 在 iOS 17 起被官方 deprecated,替代者是 `AVAudioApplication.shared.recordPermission` 与 `AVAudioApplication.requestRecordPermission()`。本系列基线 iOS 18,直接用新 API,但你看 GitHub 上 2023 之前的开源项目几乎全是老 API,迁移时要做 search/replace + 改 import。

**19. 一个常被遗忘的合规细节**:`AVAudioSession` 的 `mode` 选 `.spokenAudio` 会让 iOS 在播放语音备忘时**自动暂停**用户在听的音乐或播客,这是 Apple 平台习惯;而你录音时若 mode 选 `.measurement`,系统不会再做任何回声消除 / 增益调整,适合"测量类"App,不适合做语音备忘。`NotesIsland` 录音用 `.default`,播放回放用 `.spokenAudio`,这是体验最自然的组合。
