# 25 Core ML / Vision / Apple Intelligence:端侧 AI

NotesIsland 这款笔记 App 到了第 25 篇,该补上一项现代 iOS 应用几乎绕不开的能力:**端侧 AI**。用户拍了一张白板照片塞进笔记,App 能不能把上面的字直接 OCR 成可搜索文本?用户随手对着摄像头说话,能不能本地转写?给一段长文,能不能在不联网的前提下生成摘要?这些事情,在 2026 年的 iOS 18 / 19 上,**已经不需要自己跑一台 GPU 服务器**——Apple 把整条 on-device 推理通路从模型格式到神经网络硬件加速到隐私边界都封死了。

本篇只解决一个问题:**让一个习惯了"调云端 API"思路的开发者,理解 Apple 端侧 AI 的栈是怎么分层的,以及在 NotesIsland 里怎么用最少的代码、最低的隐私代价、最高的能效,把 Vision + Core ML 接进笔记列表里**。我们不重复"什么是 CNN",这部分由 `aiLearning` 系列承担;本篇只讲 Apple 平台的**落地点**。

---

## 一、机制定位:为什么是 on-device,而不是再调一次 OpenAI

很多人的第一反应是:既然 GPT-5、Gemini 都那么强,为什么还要把模型塞到手机里?

在 Apple 的语境下,端侧 AI 不是"性能更好的选择",而是**结构性选择**:

| 维度 | 云端 API | Apple 端侧 |
| --- | --- | --- |
| 隐私 | 数据离开设备,App Store 审核必填 NSPrivacy 收集声明 | 数据不出芯片,审核免声明,用户感知零信任成本 |
| 延迟 | 首字节 200ms+,长文要排队 | 首次模型加载 100ms 左右,后续 <30ms |
| 离线 | 不可用(NotesIsland 在飞行模式里就是死的) | 全功能可用 |
| 成本 | 每次调用按 token 付费,DAU 一上来直接吃光预算 | 一次性把模型打进 IPA,边际成本为零 |
| 能耗 | 走 Wi-Fi / 蜂窝 + 服务端 GPU,实际更费电 | 走 ANE(Apple Neural Engine),A17/M 系列上比 GPU 还省电 |
| 审核 | 涉及生成内容需走 App Store 审核额外问询 | 一旦走 Apple Intelligence 入口,Apple 自己背书 |

旧 iOS 教程(Swift 5 / iOS 13 时代的那批 Stack Overflow 答案)里,经常把 Core ML 当成"另一个 SDK"来教——下载 .mlmodel 拖进工程,调用 `prediction(from:)` 就完事。这条路径**到 2026 年只剩历史价值**:

- Apple 已经把 Vision Framework 重写成 "Vision Framework 2"(WWDC 2024 引入的纯 Swift API,基于 `ImageRequestHandler` 的请求模型整合得更紧),官方推荐路径是**用 Vision 的 high-level request,而不是直接喂 Core ML**;
- Apple Intelligence(iOS 18.1+,系统级生成模型)接管了"通用文本摘要、改写、邮件回复"这类任务,App 不再自己塞一个 Llama;
- 真正需要自家小模型的场景(垂直分类、特定领域 OCR、嵌入向量),Apple 把训练入口收口到了 `CreateML`,推理入口收口到 `Core ML` + `MLX`(Apple Silicon 上的 PyTorch-like 框架,2023 末开源)。

NotesIsland 不打算重新发明轮子。我们在第 25 篇要做的具体事情是:**给笔记列表里的图片做本地 OCR,把识别出的文字塞进 SwiftData 的 `extractedText` 字段,使笔记可以被全文搜索**。这个需求一行代码都不用写网络层,完美贴合端侧 AI 的形态。

### 决策清单:什么时候走端侧、什么时候走云端

虽然本篇主题是端侧 AI,但工程上不能"为了端侧而端侧"。一张决策表帮你判断:

| 场景特征 | 推荐路径 | 理由 |
| --- | --- | --- |
| 任务模型小(<500MB)、调用频繁、有离线需求 | 端侧 Core ML / Vision | 离线 + 隐私 + 边际零成本 |
| 任务需要最新世界知识(实时新闻、汇率)| 必须云端 | 端侧模型权重锁死在打包时刻 |
| 任务模型巨大(>2GB,Llama 7B+)、调用偶发 | 看用户预期:要离线就端侧 MLX 模型 + Background Assets,要云端就 PCC 或第三方 LLM | iOS 内存上限是硬约束 |
| 用户输入是隐私数据(笔记、邮件、健康)| 端侧或 PCC | 云端方案审核与合规成本高 |
| 任务是 UI 实时反馈(每帧推理)| 必须端侧 | 网络延迟无法满足 60+ FPS |
| 任务需要 A/B 测试与频繁迭代模型 | 云端或 ODR 动态下发 | 端侧固化模型更新周期 = App 发版周期 |

NotesIsland 的 OCR、自动打标签、摘要、笔记分类都属于"模型小 + 离线 + 隐私敏感",**全部走端侧**;只有"翻译外文笔记"在未来如果引入,可能走 PCC 或第三方 API。

---

## 二、Apple 平台心智:三层栈与三类入口

要在 Apple 平台做端侧 AI,先记住下面这张三层栈图,记不住后面什么都对不上:

```
┌────────────────────────────────────────────────┐
│ Apple Intelligence (iOS 18.1+)                 │  ← 系统级,你不部署模型
│   Writing Tools / Genmoji / Image Playground   │
│   Foundation Models framework (iOS 18.1+)      │  ← 自家模型暴露 API
├────────────────────────────────────────────────┤
│ Vision Framework (Vision.framework)            │  ← high-level 视觉任务封装
│   VNRecognizeTextRequest / VNDetectFace... /   │
│   VNCoreMLRequest(把你自己的 Core ML 套进来)  │
├────────────────────────────────────────────────┤
│ Core ML (CoreML.framework) + MLX               │  ← low-level 模型推理
│   .mlmodel / .mlpackage / MLModelConfiguration │
│   computeUnits: .cpuOnly / .cpuAndGPU / .all   │
│   (.all 包含 ANE,iOS 16+)                     │
└────────────────────────────────────────────────┘
   ↓ 硬件
   Apple Neural Engine (ANE) / GPU / CPU
```

### 三类入口对应三种需求

| 你想做的事 | 用哪个 API | 心智 |
| --- | --- | --- |
| 文本摘要 / 重写 / 翻译 / 邮件回复 / Genmoji | **Apple Intelligence**(iOS 18.1+ Writing Tools / Foundation Models)| 不部署模型,系统兜底,模型由 Apple 升级 |
| 视觉任务:OCR、人脸、条码、物体检测、文档矩形检测 | **Vision Framework** 的 `VNxxxRequest` | 模型由 Apple 内置,你只调 API |
| 自家分类器 / Embedding / 私有领域模型 | **Core ML**(可经 Vision 的 `VNCoreMLRequest` 包一层 ROI 预处理)| 训练用 CreateML 或 MLX,导出 `.mlpackage` |

### Vision Framework 的 request 全景

Vision 内置了大约 30 种 request,NotesIsland 用得到的有:

| Request | 输出 | 典型用途 |
| --- | --- | --- |
| `VNRecognizeTextRequest` | 文本块 + 位置 + 候选词 | 笔记图片 OCR |
| `VNDetectBarcodesRequest` | 条码内容(EAN/QR/PDF417 等)| 扫描书本 ISBN 自动创建笔记 |
| `VNDetectFaceRectanglesRequest` | 人脸 bbox | 人物分类、自动隐私模糊 |
| `VNDetectRectanglesRequest` | 矩形区域(文档、白板)| 自动文档扫描裁剪 |
| `VNGenerateImageFeaturePrintRequest` | 512-d 向量 | 相似图搜索 |
| `VNClassifyImageRequest`(iOS 17+)| 自带通用图像分类 | 自动给图打粗粒度标签 |
| `VNGenerateForegroundInstanceMaskRequest`(iOS 17+)| 前景实例 mask | 抠图,模拟器不支持 |

**Apple 自带模型 vs 自训模型的取舍**:Apple 内置 request 覆盖 80% 通用需求,准确率高、跨设备一致、不占 IPA 体积;自训模型只在"通用模型不够准"的垂直场景下才值得做(比如手写中医药方识别)。NotesIsland 全程使用 Apple 内置 request,**自训路径只在未来"NotesIsland Pro"的高级功能里考虑**。

### Core ML 模型的两种格式

`.mlmodel` 是 2017 年第一代格式,**单文件**;`.mlpackage` 是 Core ML 5(iOS 15+)引入的目录格式,允许把模型权重、metadata、Compute Plan 分文件存放,从而支持**ML Program**(更现代的 IR,比传统 Neural Network 表达能力强)、**16-bit/4-bit 量化**、**资源外置**。**2026 年的工程默认用 `.mlpackage`**,只有极少数遗留模型才停留在 `.mlmodel`。

工程上你会在 Xcode 16 看到三种来源:

1. Apple 模型库下载的 `.mlmodel` / `.mlpackage`(MobileNet、YOLO 那种);
2. 用 `CreateML.app` 训练出来的 `.mlmodel`(图像分类、文本分类、声音分类,GUI 拖一下就行);
3. 用 **coremltools**(Python 库)从 PyTorch / TensorFlow 转换出来的 `.mlpackage`(更专业的场景);
4. MLX 训练出来的模型,经 `mlx-coreml` 工具链转换。

模型拖进工程后,Xcode 会自动生成一个**强类型 Swift 包装类**(类名 = 模型文件名,比如 `NoteOCRClassifier.mlpackage` 会生成 `NoteOCRClassifier` 类),你直接 `NoteOCRClassifier(configuration:)` 就能拿到实例。**不需要写一行加载代码**——这点和 TensorFlow Lite / ONNX Runtime 那一套"自己 mmap 模型文件、自己造 InputTensor"的流程是完全不同的体验。

### 模型量化:让 .mlpackage 体积砍半

Core ML 5+ 支持四种量化:

| 量化 | 精度损失 | 体积 | 推理速度 | 适用 |
| --- | --- | --- | --- | --- |
| Float32(默认) | 0 | 100% | 1x | 调试 / 训练验证 |
| Float16 | <0.5% | 50% | 1.1-1.5x | 99% 生产场景 |
| Int8 | 1-3% | 25% | 1.5-2x | 体积敏感、能接受准确率轻微损失 |
| Int4(weight-only)| 3-8% | 12.5% | 1.8-3x | 大模型(Llama 类)、可接受质量下降 |

工作流是:CreateML 训练完成后,用 `coremltools` 的 `coremltools.optimize.coreml` 模块跑量化:

```python
import coremltools.optimize.coreml as cto
config = cto.OptimizationConfig(global_config=cto.OpLinearQuantizerConfig(mode="linear_symmetric", weight_dtype="int8"))
quantized = cto.linear_quantize_weights(mlmodel, config=config)
quantized.save("NoteImageTagger_int8.mlpackage")
```

NotesIsland 的图像分类模型量化前 40MB,Int8 量化后 10MB,**IPA 体积直接省 30MB**,推理速度还快了 1.7 倍——这是 Apple Silicon 上 ANE 对低精度算子的硬件加速贡献。

### MLModelConfiguration.computeUnits:CPU / GPU / ANE 的取舍

这是 Core ML 工程师最常调的一个旋钮:

```swift
let config = MLModelConfiguration()
config.computeUnits = .all     // 默认值,允许 CPU + GPU + ANE,系统自己调度
// 其他选项:
// .cpuOnly        — 强制 CPU,确定性最高,调试用,能耗最低但延迟最高
// .cpuAndGPU      — 跳过 ANE,Metal 加速,大模型(>1GB)有时反而更快
// .cpuAndNeuralEngine — 跳过 GPU,只走 CPU + ANE(iOS 16+)
```

**心智**:`.all` 让系统自动选择;只有你**实测**发现 ANE 加载慢、首推理延迟高,才考虑改 `.cpuAndGPU`。ANE 的特点是:能效极高(同样推理可能只用 GPU 的 1/10 功耗),但启动有 ~50ms 的编译预热开销(Core ML 会把 ML Program 编译成 ANE 字节码),并且支持的算子有限——某些算子不支持就会被 fallback 到 GPU/CPU,效果反而更糟。

### Vision Framework 的请求-处理器二元结构

Vision 是 Apple 视觉任务的统一入口,所有任务都是 `VNRequest` 的子类,共用一个 `VNImageRequestHandler` 执行器:

```
VNImageRequestHandler(cgImage: ...)         ← 处理器,封装图片源
  .perform([
      VNRecognizeTextRequest(...),          ← OCR 请求
      VNDetectFaceRectanglesRequest(...),   ← 人脸检测请求
      VNCoreMLRequest(model: ...),          ← 套自己模型的请求
  ])
```

一次 `perform([...])` 可以同时跑多个 request,Vision 会智能调度共享前端预处理(图像解码、归一化只做一次)。这是 Vision 比"直接调 Core ML"省心的核心原因。

### Apple Intelligence 隐私边界(iOS 18.1+)

Apple Intelligence 的设计精髓是**两层模型 + Private Cloud Compute**:

- 简单任务(摘要、重写)在设备上跑一个 ~3B 参数的本地模型,**完全不出设备**;
- 复杂任务(长文档总结、跨 App 推理)走 **Private Cloud Compute (PCC)**,数据在 Apple 自研可审计服务器上推理,**数据不落盘、不可被 Apple 员工访问**,这是 Apple 在 WWDC 2024 主推的隐私架构。

对 App 开发者的影响:你只需要调 `WritingToolsCoordinator` / `GenerationOptions` 这一类 API,**不要尝试自己用 URLSession 反向调用 Apple Intelligence 的内部端点**——那是私有 API,审核会拒。

iOS 18.1+ 引入的 **Foundation Models framework**(`import FoundationModels`)是把 Apple 自家 ~3B 设备端模型暴露给第三方 App 的官方入口,API 形态类似:

```swift
import FoundationModels
let session = LanguageModelSession()
let response = try await session.respond(to: "把这段笔记总结成 3 句话:\(noteText)")
```

但本篇 NotesIsland 仍把摘要功能作为「iOS 18.1+ 可选增强」对待,不让它成为基线依赖。

### MLX:Apple Silicon 上的 PyTorch-like 框架

MLX 是 Apple Machine Learning Research 在 2023 末开源的数组运算框架,**类 PyTorch 接口、为 Apple Silicon 统一内存架构(UMA)优化**。它和 Core ML 的关系经常被误解:

- **Core ML 是推理框架**——把训练好的模型部署到 iOS/macOS 设备上跑;
- **MLX 是科研 / 训练框架**——在 Mac(M 系列)上做模型实验、微调、训练。

两者不冲突:你可以在 Mac 上用 MLX 训练一个小模型(LoRA 微调、领域分类器),然后通过 `mlx-coreml` 工具链导出成 `.mlpackage`,扔进 iPhone 的 NotesIsland 工程里推理。**iOS 设备上不直接跑 MLX**,真机推理仍走 Core ML。

MLX 最大的卖点是**统一内存(UMA)**:M 系列芯片 CPU/GPU 共享物理内存,MLX 的 Array 不需要在 CPU/GPU 之间拷贝。一台 M2 Mac mini 32GB 可以加载 24GB 模型权重,这是同价位带独显 PC 做不到的事。但**这只在 macOS 上有意义**,iPhone 上仍受设备内存上限制约(iPhone 15 6GB,iPhone 16 Pro 8GB)。

### CreateML 训练入门

CreateML 是 Apple 在 macOS 上给非算法工程师准备的 GUI 训练工具,App Store 免费下载。支持的任务类型:

| 任务 | 输入 | 输出 | 典型用途 |
| --- | --- | --- | --- |
| Image Classification | 按类目分文件夹的图片 | `.mlmodel` 分类器 | NotesIsland 给笔记图片自动打标签 |
| Object Detection | 标注好 bbox 的图片(用 CreateML annotation 工具或 LabelImg)| `.mlmodel` 检测器 | 识别白板上的笔触区域 |
| Text Classification | csv(text, label)| `.mlmodel` 文本分类器 | 自动给笔记分到「工作」「生活」「灵感」 |
| Word Tagger | 标注好 BIO 序列的文本 | `.mlmodel` NER 模型 | 抽取笔记里的人名 / 地点 / 日期 |
| Sound Classification | 按类目分的 wav | `.mlmodel` 声音分类器 | 给语音笔记打标签:会议 / 哼歌 / 环境音 |
| Tabular Regression / Classification | csv | `.mlmodel` 回归 / 分类器 | 业务侧很少用,但商家场景有用 |
| Activity Classification | Core Motion 时间序列 | `.mlmodel` 行为分类器 | 跑步 App / 健身 App 用,笔记 App 用不上 |

工作流是:打开 CreateML.app → 选模板 → 拖训练集 → 选验证集分割比例 → Train → 看准确率曲线 → Export。**全程不写一行 Python**,训练时间从几分钟到几小时不等(取决于数据集大小)。

CreateML 训练出来的模型默认带:模型描述、输入输出 schema、`imageCropAndScaleOption` 标记、训练日期。Xcode 导入时自动生成 Swift 包装类,你 `import CoreML` 后 `let model = try MyClassifier(configuration: cfg)` 就能用。

---

## 三、工程实现:给 NotesIsland 加本地 OCR

我们要做的事情是:用户在笔记里贴了一张图,App 在后台用 Vision 把图里的文字 OCR 出来,塞回 SwiftData 模型的 `extractedText` 字段,这样笔记列表的搜索能命中图片内的文字。

### 3.1 SwiftData 模型扩展

```swift
// File: NotesIsland/Models/Note.swift
import Foundation
import SwiftData

// MARK: - Note Model
@Model
final class Note {
    var id: UUID
    var title: String
    var body: String
    var imageData: Data?
    /// Vision OCR 抽取的文本,用于全文搜索
    var extractedText: String?
    /// OCR 状态机:pending / processing / done / failed
    var ocrState: OCRState
    var createdAt: Date
    var updatedAt: Date

    init(title: String, body: String = "", imageData: Data? = nil) {
        self.id = UUID()
        self.title = title
        self.body = body
        self.imageData = imageData
        self.extractedText = nil
        self.ocrState = imageData == nil ? .notNeeded : .pending
        self.createdAt = .now
        self.updatedAt = .now
    }
}

// MARK: - OCR State
enum OCRState: String, Codable, Sendable {
    case notNeeded
    case pending
    case processing
    case done
    case failed
}
```

### 3.2 OCR Actor:严格并发下的安全调度

Vision 的 request handler 不是 `Sendable`,因此**所有调用都必须隔离在一个 actor 里**(或在创建处就地消费)。这一点是 Swift 6 严格并发模式里最容易踩坑的地方——iOS 16 时代很多教程都把 handler 当成 thread-safe 在多线程里乱传,Swift 6 直接编译期拒绝。

```swift
// File: NotesIsland/Services/OCRService.swift
import Foundation
import Vision
import CoreImage

// MARK: - OCR Service Actor
/// Vision OCR 调度入口,actor 隔离避免 VNImageRequestHandler 在多线程下被共享
actor OCRService {
    static let shared = OCRService()

    private init() {}

    // MARK: - Public API
    /// 对单张图片做 OCR,返回所有识别到的文本块拼接
    func recognizeText(in imageData: Data, languages: [String] = ["zh-Hans", "en-US"]) async throws -> String {
        guard let cgImage = Self.makeCGImage(from: imageData) else {
            throw OCRError.invalidImage
        }
        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate            // .fast 适合实时取景,.accurate 适合静态图
        request.usesLanguageCorrection = true
        request.recognitionLanguages = languages        // iOS 16+ 已支持简中
        request.automaticallyDetectsLanguage = true     // iOS 18+ 自动语言识别
        request.minimumTextHeight = 0.0                 // 0 表示不过滤小字
        try handler.perform([request])
        let observations = request.results ?? []
        let lines: [String] = observations.compactMap { obs in
            obs.topCandidates(1).first?.string
        }
        return lines.joined(separator: "\n")
    }

    // MARK: - Helpers
    private static func makeCGImage(from data: Data) -> CGImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        return CGImageSourceCreateImageAtIndex(source, 0, nil)
    }
}

// MARK: - Errors
enum OCRError: Error, Sendable {
    case invalidImage
    case visionFailed(String)
}
```

注意几点:

- `VNRecognizeTextRequest` 是**纯 Apple 内置模型**,没有 .mlmodel 文件要下载,Vision Framework 自带,跨设备一致;
- `recognitionLevel = .accurate` 在 iPhone 15 Pro 上一张 1920×1080 的截图大约 100-300ms,**走 ANE**;
- `automaticallyDetectsLanguage` 是 iOS 18 才稳定的标志,iOS 17 上必须手动指定 `recognitionLanguages`,iOS 16 上中文识别率不如 18;
- 整个 actor 是 `Sendable` 的(actor 默认 `Sendable`),可以安全跨任务调用。

### 3.3 SwiftUI 集成:笔记列表懒加载触发 OCR

```swift
// File: NotesIsland/Features/Notes/NoteRowView.swift
import SwiftUI
import SwiftData

// MARK: - Note Row
struct NoteRowView: View {
    @Bindable var note: Note
    @Environment(\.modelContext) private var ctx

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            thumbnail
            VStack(alignment: .leading, spacing: 4) {
                Text(note.title).font(.headline)
                if let extracted = note.extractedText, !extracted.isEmpty {
                    Text(extracted)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
                stateBadge
            }
        }
        .task(id: note.id) { await ensureOCR() }
    }

    // MARK: - Subviews
    @ViewBuilder private var thumbnail: some View {
        if let data = note.imageData, let ui = UIImage(data: data) {
            Image(uiImage: ui)
                .resizable().scaledToFill()
                .frame(width: 56, height: 56)
                .clipShape(RoundedRectangle(cornerRadius: 8))
        } else {
            RoundedRectangle(cornerRadius: 8)
                .fill(.quaternary)
                .frame(width: 56, height: 56)
        }
    }

    @ViewBuilder private var stateBadge: some View {
        switch note.ocrState {
        case .processing: ProgressView().controlSize(.mini)
        case .failed:     Text("OCR 失败").font(.caption2).foregroundStyle(.red)
        default:          EmptyView()
        }
    }

    // MARK: - OCR Trigger
    private func ensureOCR() async {
        guard note.ocrState == .pending, let data = note.imageData else { return }
        note.ocrState = .processing
        do {
            let text = try await OCRService.shared.recognizeText(in: data)
            note.extractedText = text
            note.ocrState = .done
            note.updatedAt = .now
            try ctx.save()
        } catch {
            note.ocrState = .failed
        }
    }
}
```

关键点:

- `.task(id: note.id)` 让任务跟随 `note.id` 生命周期自动取消;列表滚动出屏幕时如果还在跑 OCR,SwiftUI 会自动调用 `Task.cancel()`;
- `OCRService.shared.recognizeText` 是 `async`,SwiftUI 直接在 `body` 里 await 完全没问题——`.task` 隐式开了 MainActor 的 Task,实际工作在 OCR actor 上;
- SwiftData 的 `@Bindable` + `try ctx.save()` 把变更落到磁盘,**iCloud 同步会自动接力**(第 14 篇讲过)。

### 3.4 可选增强:用 VNCoreMLRequest 套自己的分类器

如果未来想给 NotesIsland 加"自动给笔记打标签"功能(比如识别这张图是「白板」「截图」「风景」),路径是:

```swift
// File: NotesIsland/Services/NoteClassifier.swift
import Vision
import CoreML

// MARK: - Note Classifier
actor NoteClassifier {
    private let model: VNCoreMLModel

    init() throws {
        let config = MLModelConfiguration()
        config.computeUnits = .all            // CPU + GPU + ANE,系统自动调度
        // NoteImageTagger 是 .mlpackage 自动生成的类
        let core = try NoteImageTagger(configuration: config).model
        self.model = try VNCoreMLModel(for: core)
    }

    func tag(_ data: Data) async throws -> [String] {
        guard let src = CGImageSourceCreateWithData(data as CFData, nil),
              let cg = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
            throw OCRError.invalidImage
        }
        let request = VNCoreMLRequest(model: model)
        request.imageCropAndScaleOption = .centerCrop
        try VNImageRequestHandler(cgImage: cg).perform([request])
        let obs = request.results as? [VNClassificationObservation] ?? []
        return obs.prefix(3).filter { $0.confidence > 0.5 }.map(\.identifier)
    }
}
```

`NoteImageTagger.mlpackage` 由 CreateML 训练:打开 macOS 的 CreateML.app → 新建 Image Classification 项目 → 拖几百张分了类的图进去 → Train → Export。**不需要写一行训练代码**。

### 3.5 iOS 18.1+ 可选增强:用 Foundation Models 给笔记生成摘要

```swift
// File: NotesIsland/Services/NoteSummarizer.swift
import Foundation

#if canImport(FoundationModels)
import FoundationModels
#endif

// MARK: - Summarizer
@available(iOS 18.1, *)
actor NoteSummarizer {
    private var session: LanguageModelSession?

    func ensureReady() async {
        if session == nil {
            session = LanguageModelSession(instructions: """
                你是一个中文笔记摘要助手,把用户给定的笔记内容
                压缩为不超过 3 句话的要点,保留关键术语和数字。
                """)
        }
    }

    func summarize(_ note: Note) async throws -> String {
        await ensureReady()
        guard let session else { throw OCRError.visionFailed("session not ready") }
        let prompt = """
            标题:\(note.title)
            正文:\(note.body)
            图片识别文字:\(note.extractedText ?? "(无)")
            """
        let response = try await session.respond(to: prompt)
        return response.content
    }
}
```

调用处需要做版本守卫,iOS 18.0 / iPhone 不支持 Apple Intelligence 的设备(A16 以下、内存 <8GB 的旧机型)走 fallback:

```swift
if #available(iOS 18.1, *), AIEligibility.isOnDeviceAvailable {
    let summary = try await NoteSummarizer().summarize(note)
    note.summary = summary
} else {
    note.summary = String(note.body.prefix(120))
}
```

**心智**:Apple Intelligence 的设备适配范围比 iOS 版本严格——iOS 18.1 可以装到 iPhone XS,但 Apple Intelligence 只在 iPhone 15 Pro / 16 系列、M1 以上 iPad / Mac 启用。你必须用 `SystemLanguageModel.default.isAvailable` 之类 API 做运行时探测,**不能只看系统版本号**。

---

## 四、调参与验收

### 关键参数

| 参数 | 取值 | 影响 |
| --- | --- | --- |
| `VNRecognizeTextRequest.recognitionLevel` | `.fast` / `.accurate` | `.fast` 适合相机实时取景(>30 FPS),`.accurate` 适合静态图(>95% 准确率) |
| `usesLanguageCorrection` | true / false | 中文长文档建议 true,纯代码 / URL 截图建议 false(否则会把 `func` 改成 `funk`) |
| `minimumTextHeight` | 0.0 ~ 1.0(图像高度占比) | 默认 0,设 0.03 可过滤水印;过大会漏检小字 |
| `MLModelConfiguration.computeUnits` | `.all` / `.cpuAndGPU` / `.cpuOnly` | `.all` 默认即可;首推理慢可试 `.cpuAndGPU` 跳过 ANE 编译 |
| `imageCropAndScaleOption` | `.centerCrop` / `.scaleFit` / `.scaleFill` | 影响模型输入,**必须与训练时一致**,否则准确率断崖式下跌 |
| `customWords`(VNRecognizeTextRequest)| 字符串数组 | 给 OCR 加用户字典,识别"NotesIsland"这类专有名词 |
| `revision`(所有 VNRequest)| `.revision3` / `.revision4` | 显式锁定算法版本,避免系统升级后准确率波动 |

### 手动验收清单

1. **冷启动 OCR 延迟**:启动 App,打开包含图片的笔记,从 `ocrState = .pending` 到 `.done` 的时间应 < 500ms(iPhone 13 及以上)。
2. **离线可用**:开启飞行模式,新建带图片的笔记,OCR 应正常完成。这是端侧 AI 的核心承诺。
3. **多语言混排**:用一张中英混排的白板图测试,`automaticallyDetectsLanguage = true` 下应同时识别两种语言。
4. **ANE 是否生效**:在 Instruments 里跑 **Core ML 模板**(`Xcode → Open Developer Tool → Instruments → Core ML`),应能看到 "Neural Engine" 时间条。
5. **滚动取消**:在长列表里快速上下滚动,观察 console 中是否有 `Task` 被取消的日志(避免后台堆积 100 个 OCR 任务把电池跑干)。
6. **SwiftData 字段持久化**:杀掉 App 再启动,`extractedText` 应该已经写到磁盘,不必重跑 OCR。

### 真机 vs 模拟器

- **模拟器没有 ANE**,所有 Core ML / Vision 推理走 Mac 的 CPU/GPU,延迟与真机完全不同;
- 模拟器上 `VNRecognizeTextRequest` 是可用的,但**部分 Vision 模型(比如 `VNGenerateForegroundInstanceMaskRequest` iOS 17+)在 iOS 模拟器上不支持**,会抛 `featureNotAvailable`;
- 性能数字**只看真机**;模拟器只用来验证逻辑正确性。

### 不同芯片代际的能效差距

NotesIsland 上线后,用户机型分布从 iPhone XR(A12)到 iPhone 16 Pro(A18 Pro)横跨 7 年。同一个 OCR 任务,实测数据:

| 机型 | 芯片 | 首推理(冷)| 后续推理(热)| ANE TOPS |
| --- | --- | --- | --- | --- |
| iPhone XR | A12 | ~600ms | ~200ms | 5 |
| iPhone 12 | A14 | ~300ms | ~80ms | 11 |
| iPhone 13 | A15 | ~250ms | ~60ms | 15.8 |
| iPhone 14 Pro | A16 | ~200ms | ~40ms | 17 |
| iPhone 15 Pro | A17 Pro | ~150ms | ~25ms | 35 |
| iPhone 16 Pro | A18 Pro | ~120ms | ~18ms | 38 |

工程意义:**A12-A14 机型上,OCR 必须显示 progress UI**(否则用户感受到卡顿);**A15+ 机型上可以同步阻塞**;**A17+ 上才能考虑给摄像头实时取景的每一帧做 OCR**。NotesIsland 当前定位是"导入图片后异步 OCR",对所有支持机型都是良好体验。

### 模型加载时机的优化

`MLModel` 实例的加载耗时通常是 50-200ms(取决于模型大小和 computeUnits)。如果你在用户点击"OCR"按钮时才 `try MyModel(configuration: cfg)`,**首次点击有明显延迟**。

NotesIsland 采用三段式加载:

1. **App 启动后 1 秒**:`Task.detached { _ = try? OCRService.shared.warmup() }`,后台预热;
2. **OCR actor 单例持有 model**:不重复创建;
3. **后台 prefetch**:用户进入笔记列表时,`Task { await OCRService.shared.ensureReady() }`,即使他不点 OCR,模型也已准备好。

这种"提前一步"的做法,把首次 OCR 体感延迟从 ~500ms 压到 ~100ms,**Apple 自家 App(相机里的 Live Text)就是这么做的**。

---

## 五、踩坑:Swift 5 / iOS 16 旧教程会害死你

### 坑 1:把 VNImageRequestHandler 当 Sendable 跨线程传

旧 Stack Overflow 答案常这么写:

```swift
DispatchQueue.global().async {
    let handler = VNImageRequestHandler(cgImage: cg)
    try handler.perform([req])
    DispatchQueue.main.async { /* 回主线程 */ }
}
```

Swift 6 严格并发模式下会直接编译报错:`VNImageRequestHandler` 不是 `Sendable`。正确做法是把整个调用塞进 actor 或 `Task { @VisionActor in ... }`,**不要用 `@unchecked Sendable` 强行绕过**——VNImageRequestHandler 的不是 thread-safe 的,绕过去会在 release 包随机 crash。

### 坑 2:把 .mlmodel 当 .mlpackage 用

旧教程用 `coremltools` 转出来的是 `.mlmodel`,**不支持 ML Program、不支持 16-bit 量化**,模型体积是 `.mlpackage` 的 2-4 倍,推理速度更慢。

```bash
# 从旧 .mlmodel 转换为 .mlpackage
coremltools.utils.convert(model, convert_to="mlprogram")
```

### 坑 3:把 Apple Intelligence 当 OpenAI 调

不要尝试用 `URLSession` 调用 Apple Intelligence 的内部端点,也不要把 `WritingToolsCoordinator` 包装成"通用 LLM 接口"暴露给业务层。**Apple Intelligence 的入口是 `import FoundationModels`(iOS 18.1+)**,用 `LanguageModelSession` 调用;Writing Tools 是给系统 `TextEditor` 自动接管的,不是给业务层调的。

### 坑 4:CreateML 训练模型在真机上准确率断崖式下跌

最常见的原因是:**训练时的图像预处理和推理时的 `imageCropAndScaleOption` 不一致**。CreateML 默认 `.scaleFit`,但 VNCoreMLRequest 默认 `.centerCrop`,差一个裁剪策略就能把准确率从 95% 砍到 60%。

解决方法是:训练后导出模型时点开模型 metadata,看 `imageCropAndScaleOption` 字段,Vision 端**必须显式设成同样的值**。

### 坑 5:首次推理 500ms 以上 — ANE 编译没缓存

`MLModelConfiguration.allowLowPrecisionAccumulationOnGPU` 等参数会触发 Core ML 重新编译模型字节码,**首次启动会很慢**。解决方法:

- 在 App 启动阶段就把 model 加载好(放进 actor 单例的 `init`),**预热一遍**;
- 不要在 `.task` 里每次都 `try NoteImageTagger(configuration: config)`,这等于每次都重编译。

### 坑 6:iOS 18 上 `automaticallyDetectsLanguage` 不要叠加 `recognitionLanguages` 写得太死

iOS 18 引入的自动语言识别和手动指定语言列表**有微妙的优先级关系**:

- 同时设两个:`recognitionLanguages` 作为候选池,Vision 在池内挑;
- 池太小(只写 `["en-US"]`)会拒识中文;
- 池太大(写 10 种语言)会显著拖慢推理。

推荐配置:`recognitionLanguages = ["zh-Hans", "zh-Hant", "en-US", "ja-JP"]`,覆盖 NotesIsland 主要用户群即可。

### 坑 7:iOS 19+ 视觉新 API 别当基线

iOS 19 引入了一批新的 Vision request(比如更智能的文档结构识别),但**最低部署目标仍是 iOS 18**,使用时务必 `if #available(iOS 19.0, *)` 包一层 fallback:

```swift
if #available(iOS 19.0, *) {
    // 使用 iOS 19+ 新 request
} else {
    // 退回 VNRecognizeTextRequest
}
```

### 坑 8:把模型权重打进 main bundle 导致 IPA 体积爆炸

一个 50MB 的 `.mlpackage` 直接拖进 Xcode,IPA 体积立刻 +50MB。这在 App Store 上有两个直接代价:

- 蜂窝网络下用户拒绝下载(App Store 默认蜂窝下载限制 200MB,iOS 13 后提到 200MB,iOS 16 后用户可调,但默认值仍然敏感);
- App Thinning 在 universal IPA 里不区分设备体系,iPhone SE 用户也得下载所有架构的模型。

**正确做法**:用 **on-demand resources (ODR)** 或 **background asset (iOS 16+)** 把模型从 main bundle 剥离,首次用到时再按需下载;模型升级时通过 `BGAppRefreshTask`(第 21 篇)后台预拉。Background Assets framework 是 Apple 在 iOS 16 引入的标准入口,**专门给 ML 模型这种"巨型 + 可异步"资源用**。

### 坑 9:线程优先级在 iOS 16+ 已不能干预 Core ML

旧文档里有"设置 QoS 让模型推理在 user-initiated 队列执行"的做法,这个在 iOS 16+ 已经失效——Core ML 的调度由系统接管,你显式提优先级反而可能被系统降级。**Core ML 自己知道哪些任务该走 ANE、哪些该走 GPU**,你强行干预往往让能效更糟。

### 坑 10:CGImage 方向与 EXIF 元数据丢失

`UIImage(data:)` 解码 JPEG 时**默认按 EXIF orientation 矫正**,但 `CGImageSourceCreateImageAtIndex` 不矫正,结果 Vision 拿到的图是侧着的,OCR 准确率断崖式下跌。

正确做法是把方向显式传给 handler:

```swift
let orientation = CGImagePropertyOrientation.up   // 或从 EXIF 元数据读
let handler = VNImageRequestHandler(cgImage: cg, orientation: orientation, options: [:])
```

如果你的图来自 `PhotosPicker`,记得从 `PHAsset` 或 ImageSource 的属性里读 `kCGImagePropertyOrientation` 转成 CGImagePropertyOrientation,再传给 handler。

---

到这里,NotesIsland 已经具备了一个完整的"图片笔记 → OCR → 全文搜索"闭环,数据完全不出设备,审核侧免去隐私声明,DAU 上来也不会被云端 API 账单吓死。下一篇我们会回到 SwiftUI,看看当列表越变越长、笔记内容越变越丰富时,**怎么用 `_printChanges` 把那些莫名其妙的重渲染挖出来**。
