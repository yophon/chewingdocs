# AVFoundation 与 PhotoKit

相机、相册、播放、录音——iOS 上的多媒体能力全在 `AVFoundation` 和 `PhotoKit` 两个 framework 里。这一篇讲透:**`AVCaptureSession` 自定义相机、`AVPlayer` 播放、`PhotosPicker` 系统选择器(不要相册权限)、`PHPhotoLibrary` 权限分级、`AVAudioRecorder` 录音、`AVAudioSession` 类别**。

> 一句话先记住:**`PhotosPicker`(iOS 16+)是 2026 年获取用户照片的首选——它跑在系统进程里,不需要相册权限弹窗;只有当你真的要"扫描整个相册"或"读元数据"时,才用 `PHPhotoLibrary` 走权限申请。`AVCaptureSession` 用于自定义相机 UI,`AVPlayer` 用于视频音频播放。**

---

## 一、PhotosPicker:不要权限的相册选择器

```swift
import PhotosUI
import SwiftUI

struct PickPhotos: View {
    @State private var selection: [PhotosPickerItem] = []
    @State private var images: [UIImage] = []
    
    var body: some View {
        VStack {
            PhotosPicker(
                selection: $selection,
                maxSelectionCount: 5,
                matching: .images
            ) {
                Label("选择照片", systemImage: "photo.on.rectangle")
            }
            
            ScrollView(.horizontal) {
                HStack {
                    ForEach(images.indices, id: \.self) { i in
                        Image(uiImage: images[i])
                            .resizable()
                            .scaledToFit()
                            .frame(height: 100)
                    }
                }
            }
        }
        .onChange(of: selection) { _, newItems in
            Task {
                images = []
                for item in newItems {
                    if let data = try? await item.loadTransferable(type: Data.self),
                       let img = UIImage(data: data) {
                        images.append(img)
                    }
                }
            }
        }
    }
}
```

`PhotosPicker` 关键点:
- **不需要相册权限**——picker 跑在系统进程,App 只收到选中的图片数据
- **`matching:`** 过滤类型:`.images` / `.videos` / `.livePhotos` / `.any(of: [...])`
- **`maxSelectionCount:`** 选择数量上限
- **`loadTransferable(type:)`** 异步加载具体类型(`Data` / `UIImage` / `Movie` 自定义)

这是 2026 年的首选——iOS 14 时还得装 `PHPhotoLibrary` + 权限弹窗,现在系统弹窗都省了。**用户体验最好,审核风险最低**。

---

## 二、PHPhotoLibrary:确实需要相册权限的场景

只有这些场景才需要走 `PHPhotoLibrary` + 权限:
- **扫描整个相册做索引 / 备份**
- **读取照片的 EXIF 元数据(位置、拍摄时间、相机型号)**
- **App 内组织相册(创建 Album、整理照片)**
- **写入相册**(把 App 内拍的照片保存)

```swift
import Photos

// 请求权限
let status = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
switch status {
case .authorized: ...           // 全部相册
case .limited: ...              // 用户只授权了选定的照片(iOS 14+)
case .denied: ...
case .restricted: ...
case .notDetermined: break
@unknown default: break
}
```

`addOnly` vs `readWrite`:

| | `.addOnly` | `.readWrite` |
| --- | --- | --- |
| 弹窗文案 | "添加到相册" | "访问你的所有照片" |
| 权限 | 只能 PHAssetCreationRequest | 读 + 写 |
| 用户接受率 | 高 | 低 |

**如果只是把 App 内拍的照片保存到相册,选 `.addOnly`** — 弹窗温和,用户更愿意同意。

```swift
// 保存图片到相册
PHPhotoLibrary.shared().performChanges {
    PHAssetChangeRequest.creationRequestForAsset(from: image)
} completionHandler: { success, error in
    // ...
}
```

`Info.plist` 必须有对应 usage description:
- `NSPhotoLibraryUsageDescription` — readWrite 需要
- `NSPhotoLibraryAddUsageDescription` — addOnly 需要

---

## 三、AVCaptureSession 自定义相机

如果 `UIImagePickerController` / `PhotosPicker` 不够(要自定义对焦框、滤镜实时预览、连拍、QR 扫描),用 `AVCaptureSession`:

```swift
import AVFoundation
import SwiftUI

final class CameraController: NSObject, ObservableObject {
    let session = AVCaptureSession()
    private let photoOutput = AVCapturePhotoOutput()
    
    @MainActor
    func setup() async throws {
        // 权限
        guard await AVCaptureDevice.requestAccess(for: .video) else {
            throw CameraError.noPermission
        }
        
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
              let input = try? AVCaptureDeviceInput(device: device) else {
            throw CameraError.noCamera
        }
        
        session.beginConfiguration()
        if session.canAddInput(input) { session.addInput(input) }
        if session.canAddOutput(photoOutput) { session.addOutput(photoOutput) }
        session.commitConfiguration()
        
        // 启动在后台线程
        Task.detached { [session] in
            session.startRunning()
        }
    }
    
    func capturePhoto() {
        let settings = AVCapturePhotoSettings()
        photoOutput.capturePhoto(with: settings, delegate: self)
    }
}

extension CameraController: AVCapturePhotoCaptureDelegate {
    func photoOutput(_ output: AVCapturePhotoOutput,
                     didFinishProcessingPhoto photo: AVCapturePhoto,
                     error: Error?) {
        guard let data = photo.fileDataRepresentation(),
              let image = UIImage(data: data) else { return }
        // 用 image
    }
}
```

预览层在 SwiftUI 里嵌入(`AVCaptureVideoPreviewLayer` 是 `CALayer`,要 UIViewRepresentable):

```swift
struct CameraPreview: UIViewRepresentable {
    let session: AVCaptureSession
    
    func makeUIView(context: Context) -> UIView {
        let view = PreviewView()
        view.session = session
        return view
    }
    
    func updateUIView(_ uiView: UIView, context: Context) { }
    
    final class PreviewView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var videoPreviewLayer: AVCaptureVideoPreviewLayer {
            layer as! AVCaptureVideoPreviewLayer
        }
        var session: AVCaptureSession? {
            get { videoPreviewLayer.session }
            set { videoPreviewLayer.session = newValue }
        }
    }
}
```

`Info.plist` 加 `NSCameraUsageDescription`。

---

## 四、AVPlayer 播放

```swift
import AVKit
import SwiftUI

struct PlayerView: View {
    let url: URL
    @State private var player: AVPlayer?
    
    var body: some View {
        VideoPlayer(player: player)
            .onAppear {
                player = AVPlayer(url: url)
                player?.play()
            }
            .onDisappear {
                player?.pause()
                player = nil
            }
    }
}
```

`VideoPlayer` 是 SwiftUI 原生组件(iOS 14+),内部就是 `AVPlayer` + `AVPlayerViewController` 的桥。自带控制条。

无控制条的纯播放(背景视频、内嵌音频):直接用 `AVPlayer` + 自定义 UI。

```swift
let player = AVPlayer(url: url)
player.play()

// 观察播放状态
let observation = player.observe(\.timeControlStatus) { player, _ in
    // .paused / .waitingToPlayAtSpecifiedRate / .playing
}

// 观察播放结束
NotificationCenter.default.addObserver(
    forName: .AVPlayerItemDidPlayToEndTime,
    object: player.currentItem,
    queue: .main
) { _ in
    // 播放完了
}

// 现代:用 async sequence
for await _ in NotificationCenter.default.notifications(
    named: .AVPlayerItemDidPlayToEndTime,
    object: player.currentItem
) {
    handleEnd()
}
```

播放进度:

```swift
let interval = CMTime(seconds: 0.5, preferredTimescale: 600)
let token = player.addPeriodicTimeObserver(forInterval: interval, queue: .main) { time in
    progress = time.seconds / duration
}

// 别忘了在合适时机 removeTimeObserver
```

---

## 五、AVAudioSession:让录音 / 播放与系统协同

iOS 上的音频是系统级共享资源——电话、闹钟、其他 App 都竞争音频通道。`AVAudioSession` 是你声明"我要怎么用音频"的接口:

```swift
import AVFoundation

try AVAudioSession.sharedInstance().setCategory(
    .playAndRecord,
    mode: .default,
    options: [.allowBluetooth, .defaultToSpeaker]
)
try AVAudioSession.sharedInstance().setActive(true)
```

主要 category:
- **`.playback`** — 只播放,App 进后台继续播(音乐 App),会打断其他音频
- **`.record`** — 只录音
- **`.playAndRecord`** — 双向(语音通话、录音 + 监听)
- **`.ambient`** — 与其他音频混音(游戏背景音)
- **`.soloAmbient`** — 不与其他混(中断 Spotify)

**后台播放要 `Info.plist` 加 `UIBackgroundModes` 含 `audio`**。

中断处理(电话进来):

```swift
NotificationCenter.default.addObserver(
    forName: AVAudioSession.interruptionNotification,
    object: nil,
    queue: .main
) { notif in
    guard let info = notif.userInfo,
          let typeRaw = info[AVAudioSessionInterruptionTypeKey] as? UInt,
          let type = AVAudioSession.InterruptionType(rawValue: typeRaw) else { return }
    
    switch type {
    case .began: player.pause()
    case .ended:
        if let optionsRaw = info[AVAudioSessionInterruptionOptionKey] as? UInt,
           AVAudioSession.InterruptionOptions(rawValue: optionsRaw).contains(.shouldResume) {
            player.play()
        }
    @unknown default: break
    }
}
```

---

## 六、AVAudioRecorder:录音

```swift
final class Recorder: NSObject, ObservableObject {
    private var recorder: AVAudioRecorder?
    
    func start() throws -> URL {
        try AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .default)
        try AVAudioSession.sharedInstance().setActive(true)
        
        let url = FileManager.default
            .urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appending(component: "recording-\(UUID()).m4a")
        
        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: 44100,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
        ]
        
        recorder = try AVAudioRecorder(url: url, settings: settings)
        recorder?.delegate = self
        recorder?.isMeteringEnabled = true
        recorder?.record()
        return url
    }
    
    func stop() {
        recorder?.stop()
        recorder = nil
        try? AVAudioSession.sharedInstance().setActive(false)
    }
    
    func currentLevel() -> Float {
        recorder?.updateMeters()
        return recorder?.averagePower(forChannel: 0) ?? -160
    }
}
```

iOS 17+ 推荐用 `AVAudioEngine` + `AVAudioInputNode` 做更精细的录音(实时取 buffer、做转码、做识别),`AVAudioRecorder` 适用"录完整段音频存文件"。

`Info.plist` 必须有 `NSMicrophoneUsageDescription`。

---

## 七、ScreenCaptureKit(iOS / macOS)

iOS 没有 ScreenCaptureKit,屏幕共享在 iOS 上是 `ReplayKit`(系统 broadcast extension):

```swift
import ReplayKit

RPScreenRecorder.shared().startRecording { error in
    // 开始录屏
}

// 录完
RPScreenRecorder.shared().stopRecording { previewVC, error in
    // previewVC 是带预览 + 分享按钮的系统 VC
}
```

适用游戏录屏、直播。需要用户每次手动同意,审核敏感。

---

## 八、AVAssetExportSession 导出 / 转码

录完音视频后要压缩 / 转格式:

```swift
let asset = AVAsset(url: sourceURL)
let exporter = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetMediumQuality)!
exporter.outputURL = destURL
exporter.outputFileType = .mp4

// async API(iOS 18+)
try await exporter.export()

// 老回调 API
exporter.exportAsynchronously {
    switch exporter.status {
    case .completed: ...
    case .failed: ...
    default: break
    }
}
```

视频压缩 preset:`AVAssetExportPresetLowQuality` / `MediumQuality` / `HighestQuality` / `HEVCHighestQuality`(H.265,iOS 11+)。

---

## 九、AVAssetWriter / AVAssetReader:精细控制

要做"按帧处理 + 编码回视频"(如滤镜实时合成),用 `AVAssetReader` 读帧 + `AVAssetWriter` 写帧。代码量大,只在重型视频处理 App 才用。普通业务不到这层。

---

## 十、踩坑

1. **`PhotosPicker` 没装 `import PhotosUI`**——找不到符号。`PhotosPicker` 在 PhotosUI 而不是 SwiftUI。
2. **`PHPhotoLibrary.requestAuthorization(for: .readWrite)` 没在 Info.plist 加 description**——直接 crash,iOS 强制要求 usage description。
3. **`AVCaptureSession.startRunning()` 在主线程**——卡 UI 100-500ms。一定要 detached task / 后台线程。
4. **`session.beginConfiguration() ... commitConfiguration()` 没成对**——可能 crash 或者配置丢失。
5. **`AVPlayer` 不释放**——播放完后 `player = nil` 才会真正释放 buffer。否则内存累积。
6. **后台播放音频没加 `UIBackgroundModes`**——App 进后台立刻被系统暂停。
7. **`AVAudioSession.setCategory(.playback)` 但同时想用麦克风**——`.playback` 不含输入,要 `.playAndRecord`。
8. **录音文件路径用 NSTemporaryDirectory**——临时目录可能被系统清理。重要录音放 documents。
9. **`AVCaptureDevice.default(...)` 返回 nil**——模拟器没有相机,真机才有。代码要 fallback 显示提示。
10. **AVAssetExportSession preset 太高,文件巨大**——上传 / 存储成本爆炸。多数场景用 `MediumQuality` 即可,HD 视频用 `HEVCHighestQuality`(H.265 比 H.264 小 30%)。

---

下一篇 `18-权限与PrivacyManifest.md`,讲权限弹窗 lifecycle、`Info.plist` usage description 必填项、2024 起 Apple 强制的 `PrivacyInfo.xcprivacy`、第三方 SDK Privacy Manifest 校验、Required Reason API 清单、Tracking 与 IDFA、ATT 弹窗时机。
