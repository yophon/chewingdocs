# 27 Instruments 实战 + MetricKit + Crash 线上诊断

NotesIsland 第 26 篇刚把列表打磨到 120 FPS,App Store 上线两周后,Crashlytics 类的平台(或者 Apple 自家的 Xcode Organizer)就开始堆积报告:某个用户的 iPhone XR 上滚动列表偶发卡顿,某个 iPad 上添加图片笔记后秒级闪退,某个 iOS 17.4 用户反映 OCR 完成后内存暴涨。这些问题的共同特征是:**你本地复现不出来,但线上确实在发生**。

本篇只解决一个问题:**当 SwiftUI App 已经上线、你既看不到用户屏幕又拿不到稳定复现路径时,如何借助 Apple 官方的三件套——Instruments(本地深挖)、MetricKit(线上自动指标)、Crash 符号化(Organizer + dSYM)——把问题从"反馈邮件里的一句话"还原成"代码里的一行 bug"**。

---

## 一、机制定位:线上诊断的三条信息通道

发现性能/稳定性问题有三条信息通道,**缺一不可**:

```
┌──────────────────────────────────────────────────────────┐
│ 通道 A:本地深挖 (开发期)                                 │
│   Instruments → Time Profiler / Allocations / Leaks /    │
│                 SwiftUI / Network / Energy Log           │
│   场景:你能本地复现,需要找根因                          │
├──────────────────────────────────────────────────────────┤
│ 通道 B:线上自动指标 (无侵入)                             │
│   MetricKit (MXMetricPayload / MXDiagnosticPayload)      │
│   场景:用户每天用着你的 App,系统每 24h 给你一份指标包   │
│   含:CPU/内存/电量/启动时间/挂起/Crash/MetricsKit Hang  │
├──────────────────────────────────────────────────────────┤
│ 通道 C:用户报告 + Crash 符号化                           │
│   Xcode Organizer / TestFlight Crash / 自有上报通道      │
│   .ips / .crash + dSYM → 还原成可读 stack trace          │
│   场景:用户主动反馈或系统采集到的 Crash                  │
└──────────────────────────────────────────────────────────┘
```

旧 iOS 教程(Swift 5 / iOS 13 时代)的诊断流程,**通常只讲通道 A**——Instruments 怎么用,Time Profiler 怎么看。但到 2026 年的 iOS 18,**通道 B + C 才是真正决定线上质量的关键**:

- MetricKit 在 iOS 14 引入,iOS 16 加了 Hang 检测,iOS 17 加了 launch event,**已经成为线上无侵入指标的标配**,你不接,等于自愿放弃 Apple 帮你白送的数据;
- 自从 .crash 在 iOS 15 后被 `.ips` 格式取代,符号化流程也变了——很多旧教程教你用 `symbolicatecrash` 命令,**这个工具到 Xcode 14 后已经默认隐藏**,符号化路径整体转向 Xcode Organizer + `atos` 直接调。

本篇我们要做的具体事情是:**给 NotesIsland 集成 MetricKit 自动上报,演示如何用 Instruments 五个核心模板排查典型场景(滚动卡顿、内存泄漏、SwiftUI 重渲染、电量异常),最后讲清 `.ips` Crash 报告怎么手动符号化**。

### 性能与稳定性的四个量化指标

在动手前,先建立目标。Apple 在 App Analytics 与 App Store Connect 里跟踪以下四个面向用户体验的指标,**它们也是审核侧关注的红线**:

| 指标 | 来源 | 阈值(Apple 建议)| 不达标的后果 |
| --- | --- | --- | --- |
| **Hang Rate**(每小时主线程卡顿次数)| MetricKit MXHangDiagnostic | < 1 次 / 小时 | App Analytics 红色警告,用户卸载 |
| **Crash Rate**(崩溃用户占比)| Xcode Organizer / MXCrashDiagnostic | < 1% | App Store 评分下降 |
| **Scroll Hitch Time Ratio** | MXAnimationMetric | < 1% | 滚动体验差,用户感受到掉帧 |
| **Cold Launch Time**(冷启动到首屏可交互)| MXAppLaunchMetric | < 400ms(iPhone 13 及以上) | iOS 自动 watchdog,>20s 直接 kill |

NotesIsland 的目标是:Hang Rate < 0.5/h,Crash Rate < 0.3%,Scroll Hitch < 0.5%,Cold Launch < 300ms。第 26 篇优化好的 SwiftUI 列表 Scroll Hitch 基本可控,本篇主要拉低 Hang Rate 与 Crash Rate。

---

## 二、Apple 平台心智:Instruments 模板、MetricKit Payload 与符号化链

### 2.1 Instruments 模板选型对照

打开 Xcode → Open Developer Tool → Instruments,你会看到二十多个模板。NotesIsland 工程里最常用的是这五个:

| 模板 | 解决什么 | 火焰图读法 |
| --- | --- | --- |
| **Time Profiler** | CPU 热点函数 / 主线程卡顿 / 长任务 | 自顶向下看 Heaviest Stack Trace,从顶层 `start_wqthread` 往下展开 |
| **Allocations** | 内存分配峰值 / retain cycle / 持续增长 | Generation 截图对比 + Mark Generation 操作 |
| **Leaks** | 真正"被遗弃"的对象 | 红 X 标记 leak 实例,**但 retain cycle 它经常看不出来** |
| **SwiftUI** (iOS 16+) | View body 调用次数 / Core Animation commit | 第 26 篇用过,稳定状态 body 几乎不刷 |
| **Energy Log** | 电量贡献:CPU/GPU/Display/Network | 配合真机连线,无线测量电量贡献 |

### 2.2 Time Profiler 火焰图读法

Time Profiler 默认是 **inverted call tree**(自底向上)+ **heaviest stack trace** 模式。读图的关键技巧:

1. **先按 thread 过滤,只看 Main Thread**:UI 卡顿一定在主线程,worker 慢用 actor 就行;
2. **`Hide System Libraries` 开启**:把 UIKit/SwiftUI 内部调用折叠,只看你自己的代码;
3. **从最深的红块往上读**:红色越深表示 self time 越长,真正卡的是那段;
4. **关注 `Specific Data Mining`**:右键热点函数 → "Focus on Subtree",只看这个函数及其调用栈。

NotesIsland 的典型场景:列表滚动卡顿。Time Profiler 跑 5 秒滚动,过滤 Main Thread → 折叠系统库 → 看到栈顶是 `NoteRow.body` → 展开发现 `DateFormatter.string(from:)` 占了 30% time → 第 26 篇说过,把 formatter 提到 static 即可。

### 2.2.1 火焰图的两种视角:Heavy vs Tree

Time Profiler 提供两种视图,**新人最容易混淆**:

- **Call Tree(默认)**:自顶向下,从 `main` / `start_wqthread` 这种顶层函数往下展开。适合看"整个程序时间分布",但不适合找局部热点。
- **Inverted Call Tree(Cmd+Option+T 切换)**:自底向上,从耗时最多的叶子函数开始。**适合定位"是谁在反复调用这个慢函数"**。

实际工作流通常是:Inverted Tree 找到慢叶子 → 右键 Focus on Caller → 看是谁在调它 → 改这个调用点。比如 NotesIsland 看到 `Calendar.dateComponents(_:from:)` 占 15% time → 看到 caller 是 `NoteRow.body` → 改方案:把 Calendar 实例提到 static,或者把日期格式化挪到 SwiftData computed property 一次性算好。

### 2.2.2 抓取持续时间的取舍

Time Profiler 默认采样间隔 1ms。Record 时间越长,样本越准,但火焰图越乱:

- **< 5 秒**:适合定位"已知能复现的瞬时卡顿"(点一次按钮立即卡);
- **5-30 秒**:适合定位"渐进式卡顿"(列表滚 10 秒后开始掉帧);
- **> 60 秒**:适合定位"长时间内存泄漏 + GC 风暴";时间长后 trace 文件能到 GB 级,**Mac 内存压力大**。

NotesIsland 排查列表卡顿统一录 10 秒,边滚边录,**Stop 之前最后 3 秒做"刻意慢速滚动"**,这样最后 3 秒的样本会突出真正的耗时函数。

### 2.3 Allocations 与 retain cycle

`Allocations` 模板的核心操作是 **Generation**:

```
启动 App → 进入到稳定状态 → 点 "Mark Generation"
执行一个怀疑泄漏的操作(如"打开 100 个笔记后退出")
回到稳定状态 → 再 "Mark Generation"
对比两个 generation,看哪些对象本应释放却没释放
```

Leaks 模板只能检测"完全不可达的孤立对象",**它检测不到 retain cycle**(循环引用对象彼此还可达,Leaks 不报警)。Allocations 才是发现 retain cycle 的工具。

Swift 6 严格并发模式下,actor 与 Task 的循环引用是新坑:

```swift
class NoteSearchEngine {
    var task: Task<Void, Never>?
    func start() {
        task = Task { [weak self] in           // ✓ 必须 weak self
            while !Task.isCancelled {
                await self?.refresh()
            }
        }
    }
}
```

如果忘了 `[weak self]`,`Task` 强持有 `self`,`self` 持有 `task`,经典 retain cycle。Allocations 里会看到 `NoteSearchEngine` 的实例数随时间单调上升。

### 2.3.1 持久内存增长 vs 瞬时峰值

iOS 给单 App 的内存配额是动态的(iPhone 15 Pro 大约 ~3GB,iPhone XR 大约 ~1.4GB),**超出就被 jetsam 杀掉**。Allocations 里关注两个不同的曲线:

- **All Heap Allocations**:堆上活对象总量,长期单调上升就是泄漏;
- **Persistent Bytes**:扣除已释放的、当前还存活的字节;
- **Transient Bytes**:已分配但已释放的累积;

工程上的判定:**Persistent 长期单调上升 = 真泄漏**;**Persistent 振荡但峰值高 = 短期分配过大,需要 reduce churn**(比如把图片解码挪到后台,不要在主线程一次性 decode 5MB JPEG)。

NotesIsland 曾遇到的典型问题:用户连续打开 50 个图片笔记后,Persistent Bytes 从 100MB 涨到 800MB,iPhone XR 上必崩。Allocations Generation 对比发现 `UIImage` 实例数与浏览次数完全成正比——根因是 `NoteRow` 持有 `UIImage(data:)` 解码后的全分辨率图,虽然 row 出屏后 SwiftUI 析构了视图,但 `@State private var image: UIImage?` 被某个引用泄漏出去了。修复:**改用 `Image(uiImage:)` 配合系统的 ImageDownsample,或者用 `AsyncImage` + SwiftUI 自带缓存**,不要在 `@State` 里持有大对象。

### 2.4 SwiftUI Instruments 模板

iOS 16 之后 Apple 提供了专门的 SwiftUI Instruments 模板。三个关键 track:

- **View Body**:body 调用频率 / 总耗时;
- **View Properties**:property 触发源(对应 `_printChanges` 但可视化);
- **Core Animation Commits**:真正提交到渲染层的次数。

第 26 篇的优化效果**这里能量化看到**:稳定滚动状态下 body 调用数应在低位,Core Animation commits 与 body 数解耦。

### 2.5 `.crash` vs `.ips` 符号化

iOS 15 之前 Crash 报告是 `.crash` 文本文件;iOS 15+ 改成了 `.ips`(JSON 格式)。两种文件都需要 **dSYM**(Debug Symbols)才能从 `0x102a3b4c` 这种地址映射回函数名 + 行号。

dSYM 来源:

- **Archive 时自动生成**:Xcode → Product → Archive,**dSYM 在 Organizer 里随归档保存**;
- 上传到 App Store Connect 时如果开启 bitcode(2024 后已废除),dSYM 在 ASC 自动生成;否则**dSYM 在你自己的 Archive 里**;
- 第三方 Crash 平台需要你**手动上传 dSYM**。

符号化命令:

```bash
# 1. 找到 dSYM 中的对应 UUID
dwarfdump --uuid NotesIsland.app.dSYM/Contents/Resources/DWARF/NotesIsland
# 输出:UUID: ABCD1234-... (arm64) NotesIsland

# 2. 验证 Crash 报告里的 UUID 匹配
grep -i uuid CrashReport.ips

# 3. 直接 atos 符号化某个地址
atos -arch arm64 -o NotesIsland.app.dSYM/Contents/Resources/DWARF/NotesIsland \
     -l 0x102a00000 0x102a3b4c
# 输出:NoteListView.body() (in NotesIsland) (NoteListView.swift:42)
```

**Xcode Organizer 在 iOS 15+ 已经自动符号化**——你打开 Window → Organizer → Crashes,Apple 自动从 TestFlight / App Store 上报的 Crash 里聚合好,并配上你 Archive 里的 dSYM 显示成可读栈。**线上 Crash 优先看 Organizer**,只有 Organizer 看不到的、自有渠道收集的 Crash 才手动 atos。

### 2.5.1 `.ips` 报告的结构

打开一个 .ips 文件,它实际是两段 JSON 拼接:第一段是元数据(bundle ID、版本、设备、OS),第二段是 Crash payload(线程、异常类型、寄存器、binary images)。重点字段:

| 字段 | 含义 |
| --- | --- |
| `bug_type` | Crash 类型(`309` = NSException,`109` = signal,`210` = jetsam OOM) |
| `exception` | `type`(EXC_BAD_ACCESS / EXC_CRASH 等)+ `subtype`(KERN_INVALID_ADDRESS 等)|
| `threads` | 所有线程栈,`triggered: true` 的是崩溃源 |
| `usedImages` | 加载的所有库 + 地址 + UUID,**符号化时按地址区间匹配** |
| `lastExceptionBacktrace` | Objective-C NSException 抛出栈,Swift trap 时为空 |

排查 NotesIsland 一次线上 Crash 的真实例子:bug_type=309,exception type=NSInvalidArgumentException,subtype=`-[__NSDictionaryM setObject:forKey:]: key cannot be nil`。**Swift 代码里 nil key 怎么会进 NSDictionary?**——往栈下方看,触发点是某个 Combine 的桥接代码把 Swift Optional<String> 不检查就传给了一个 OC API。修复:在桥接层加 nil guard。

### 2.6 MetricKit:`MXMetricPayload` 与 `MXDiagnosticPayload`

MetricKit 是 iOS 13 引入的**系统级**性能 / 诊断数据上报机制。系统每 24 小时把过去一天的数据打包成 payload,通过你实现的 delegate 回调。**完全无侵入,不需要埋点**。

两类 payload:

| Payload | 包含 | 用途 |
| --- | --- | --- |
| `MXMetricPayload` | 启动时间、CPU 时间、内存峰值、磁盘 IO、网络流量、电量贡献、Hang(iOS 16+)、ScrollHitch(iOS 14+) | 长期质量指标趋势 |
| `MXDiagnosticPayload` | Crash 诊断、CPU exception、disk write exception、hang diagnostic(iOS 14+) | 单次异常事件的详细栈 |

接入只需要实现 `MXMetricManagerSubscriber` 协议并在 App 启动时 `add(self)`。

### 2.7 `os_log` / `OSLogStore`

`os_log`(`OSLog` framework)是 Apple 推荐的**统一日志**入口,iOS 14 后整合到 `Logger` Swift API:

```swift
import OSLog
let logger = Logger(subsystem: "com.notesisland.app", category: "ocr")
logger.info("OCR completed for \(note.id, privacy: .public) in \(elapsed)ms")
```

特点:

- **结构化**:subsystem / category 分类,Console.app 可过滤;
- **隐私分级**:`privacy: .private` 默认隐藏,`.public` 显式公开,**符合 GDPR / App Store 审核要求**;
- **OSLogStore**(iOS 15+):可在 App 内反向检索系统日志,用户报障时可附带最近 24h 日志。

```swift
import OSLog
let store = try OSLogStore(scope: .currentProcessIdentifier)
let position = store.position(date: Date().addingTimeInterval(-3600))
let entries = try store.getEntries(at: position).compactMap { $0 as? OSLogEntryLog }
    .filter { $0.subsystem == "com.notesisland.app" }
```

### 2.8 Signposts:把业务逻辑标记进 Instruments 时间轴

`os_signpost` 是 OSLog 的兄弟 API,用来在 Instruments 时间轴上打**业务标记**。比如你想知道"用户点击新建笔记到 SwiftData 落盘"全链路耗时:

```swift
import OSLog
let log = OSLog(subsystem: "com.notesisland.app", category: .pointsOfInterest)
let id = OSSignpostID(log: log)
os_signpost(.begin, log: log, name: "CreateNote", signpostID: id, "title=%{public}@", title)
// ... 创建笔记的完整流程
os_signpost(.end, log: log, name: "CreateNote", signpostID: id)
```

Instruments 选 "Points of Interest" 模板就能看到这些标记叠加在 Time Profiler 的时间轴上,**告诉你哪些代码段属于哪个业务动作**。这比对着裸火焰图猜要有效得多。

### 2.9 Hang Diagnostics 与 Scroll Hitch

iOS 16 引入了 `MXHangDiagnostic`,定义是**主线程连续被阻塞 >250ms**。iOS 14 引入的 `MXAnimationMetric.scrollHitchTimeRatio` 衡量**滚动期间掉帧比例**(0.0 = 完美 120 FPS,0.05 = 5% 时间在掉帧,>0.01 就算有问题)。

这两个指标都不需要你埋点——MetricKit 自动从内核拿数据。**Apple 在 App Analytics 里展示的 "Hang Rate" 与 "Scroll Hitch Rate" 就是这两个数据的聚合**。

工程上的实际效果是:你不需要管"如何检测 hang",只需要管:

1. **接 MetricKit** → 拿到 payload;
2. **payload 里有 callStackTree** → 精确到函数级别的卡顿栈;
3. **看到栈里频繁出现某个函数** → 那就是优化目标。

### 2.10 Background URLSession 与上报通道选择

MetricKit payload 不能在主线程同步上报——payload JSON 通常几十到几百 KB,网络一卡 UI 就卡。推荐通路:

| 通路 | 优点 | 缺点 |
| --- | --- | --- |
| 自家服务器 + `URLSession.background uploadTask` | 完全可控,后台运行,失败自动重试 | 需要自己搭服务 |
| 集成 Firebase Performance / Sentry | 即开即用,有 UI | 第三方依赖,Privacy Manifest 要声明 |
| Apple 自家 App Analytics(无需接入) | 零成本,审核免声明 | 只有聚合数据,看不到单条 callstack |

NotesIsland 同时接入"自家服务"(收集详细 payload 供研发分析)与"信任 Apple App Analytics"(给非研发同学看趋势)。**Background URLSession 用 `URLSessionConfiguration.background(withIdentifier:)`,App 被杀也能上传**,这是 iOS 上唯一原生支持的"后台可靠上传"机制。

### 2.11 与 Privacy Manifest 的关系

第 20 篇讲过 `PrivacyInfo.xcprivacy` 强制要求。MetricKit 与 OSLog 涉及到的隐私边界:

- **MetricKit payload 不含用户内容**——只含系统指标和栈地址,**不需要在 PrivacyInfo 里声明数据收集**;
- **OSLog 默认 `.private`**——日志内容里出现的字符串、对象描述,在 Console.app 真机查看时显示为 `<private>`,**只有显式标 `.public` 才公开**;这恰好与 GDPR / Privacy Manifest 对齐;
- **自家上报通道**——如果你把 payload + 自家收集的 user ID 一起 POST 到服务端,**必须在 PrivacyInfo 里声明**,并在 ATT 弹窗后才能 opt-in 真人 ID。

NotesIsland 的策略:MetricKit payload 与 user account 完全解耦,**只用一个随机 install UUID** 标记设备,不与 Apple ID 关联。这样既能做趋势分析,又不踩隐私红线。

---

## 三、工程实现:NotesIsland 接入 MetricKit + OSLog

### 3.1 OSLog 统一日志入口

```swift
// File: NotesIsland/Telemetry/Log.swift
import Foundation
import OSLog

// MARK: - Log Categories
enum AppLog {
    private static let subsystem = "com.notesisland.app"

    static let ocr     = Logger(subsystem: subsystem, category: "ocr")
    static let storage = Logger(subsystem: subsystem, category: "storage")
    static let ui      = Logger(subsystem: subsystem, category: "ui")
    static let sync    = Logger(subsystem: subsystem, category: "sync")
    static let metric  = Logger(subsystem: subsystem, category: "metric")
}
```

业务代码使用:

```swift
AppLog.ocr.info("OCR start: noteID=\(note.id, privacy: .public)")
AppLog.storage.error("SwiftData save failed: \(error, privacy: .public)")
```

### 3.2 MetricKit Subscriber

```swift
// File: NotesIsland/Telemetry/MetricsCollector.swift
import Foundation
import MetricKit
import OSLog

// MARK: - Metrics Collector
/// 接收系统每日推送的 MetricKit payload,落地到本地 / 上报到自家服务
@MainActor
final class MetricsCollector: NSObject {
    static let shared = MetricsCollector()

    func bootstrap() {
        MXMetricManager.shared.add(self)
        AppLog.metric.info("MetricKit subscriber registered.")
    }
}

// MARK: - MXMetricManagerSubscriber
extension MetricsCollector: MXMetricManagerSubscriber {
    nonisolated func didReceive(_ payloads: [MXMetricPayload]) {
        Task { await Self.persist(payloads: payloads) }
    }

    nonisolated func didReceive(_ payloads: [MXDiagnosticPayload]) {
        Task { await Self.persist(diagnostics: payloads) }
    }

    // MARK: - Persistence
    private static func persist(payloads: [MXMetricPayload]) async {
        for payload in payloads {
            let json = payload.jsonRepresentation()
            await Self.upload(name: "metric", data: json)
            AppLog.metric.info("metric payload size=\(json.count, privacy: .public)")
            if let cpu = payload.cpuMetrics {
                AppLog.metric.info("cumulative cpu time: \(cpu.cumulativeCPUTime)")
            }
            if let scroll = payload.animationMetrics {
                AppLog.metric.info("scroll hitch ratio: \(scroll.scrollHitchTimeRatio)")
            }
        }
    }

    private static func persist(diagnostics: [MXDiagnosticPayload]) async {
        for payload in diagnostics {
            let json = payload.jsonRepresentation()
            await Self.upload(name: "diagnostic", data: json)
            if let crashes = payload.crashDiagnostics {
                AppLog.metric.error("crash diagnostics count=\(crashes.count)")
            }
            if let hangs = payload.hangDiagnostics {
                AppLog.metric.error("hang diagnostics count=\(hangs.count)")
            }
        }
    }

    private static func upload(name: String, data: Data) async {
        // TODO: 落到本地 file 或 POST 到自家收集服务
        // 此处只示意,真实工程把 data 攒批后通过 URLSession.background uploadTask 发出
        _ = (name, data)
    }
}
```

### 3.3 App 入口注册

```swift
// File: NotesIsland/App/NotesIslandApp.swift
import SwiftUI
import SwiftData

// MARK: - App Entry
@main
struct NotesIslandApp: App {
    init() {
        MetricsCollector.shared.bootstrap()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
        }
        .modelContainer(for: Note.self)
    }
}
```

### 3.4 自定义 Hang 检测兜底

iOS 16+ MetricKit 自带 hang diagnostic,但**只在系统检测到 250ms+ 主线程阻塞时记录**,且 24h 后才推送。开发期可以加一个 watchdog 即时报警:

```swift
// File: NotesIsland/Telemetry/MainThreadWatchdog.swift
import Foundation
import OSLog

// MARK: - Main Thread Watchdog
/// 开发期发现主线程长卡顿,Release 不启用
@MainActor
final class MainThreadWatchdog {
    static let shared = MainThreadWatchdog()
    private var timer: Timer?
    private var lastTick: Date = .now

    func start() {
        #if DEBUG
        Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
            guard let self else { return }
            let now = Date()
            let gap = now.timeIntervalSince(self.lastTick)
            if gap > 0.25 {
                AppLog.ui.fault("Main thread hang detected: \(Int(gap * 1000))ms")
            }
            self.lastTick = now
        }
        #endif
    }
}
```

虽然简陋,但**配合 Instruments 一起跑能精准定位 hang 起点**,因为日志时间戳能和 Time Profiler 的时间轴对齐。

### 3.5 用户报障时附带最近日志

```swift
// File: NotesIsland/Telemetry/FeedbackBuilder.swift
import Foundation
import OSLog

// MARK: - Feedback Builder
struct FeedbackBuilder {
    static func collectRecentLogs(hours: Int = 6) async throws -> String {
        let store = try OSLogStore(scope: .currentProcessIdentifier)
        let start = store.position(date: Date().addingTimeInterval(TimeInterval(-hours * 3600)))
        let entries = try store.getEntries(at: start)
            .compactMap { $0 as? OSLogEntryLog }
            .filter { $0.subsystem == "com.notesisland.app" }
            .map { entry in
                "[\(entry.date)] [\(entry.category)] \(entry.composedMessage)"
            }
        return entries.joined(separator: "\n")
    }
}
```

用户点"反馈"按钮 → 调 `collectRecentLogs()` → 自动附在邮件正文里;开发者收到带日志的反馈,**复现成本骤降一个数量级**。

### 3.6 业务关键路径加 signpost

```swift
// File: NotesIsland/Features/Notes/CreateNoteFlow.swift
import OSLog
import SwiftData

@MainActor
final class CreateNoteFlow {
    private static let log = OSLog(
        subsystem: "com.notesisland.app",
        category: .pointsOfInterest
    )

    func create(title: String, body: String, image: Data?, ctx: ModelContext) async throws {
        let id = OSSignpostID(log: Self.log)
        os_signpost(.begin, log: Self.log, name: "CreateNote",
                    signpostID: id, "title=%{public}@", title)
        defer { os_signpost(.end, log: Self.log, name: "CreateNote", signpostID: id) }

        let note = Note(title: title, body: body, imageData: image)
        ctx.insert(note)
        try ctx.save()
        if image != nil {
            try await OCRService.shared.recognizeText(in: image!).flatMap {
                note.extractedText = $0
            }
            try ctx.save()
        }
        AppLog.storage.info("note \(note.id, privacy: .public) created.")
    }
}
```

Instruments 选 Points of Interest 模板录一段 → 时间轴上能看到一条 "CreateNote" 标记,覆盖从插入到 OCR 完成的全段时间。结合 Time Profiler,你能直接读出"OCR 段在主线程吗?"、"SwiftData save 段多长?"这些以前要靠日志 timestamp 减法的问题。

---

## 四、调参与验收

### 验收清单

1. **MetricKit 在线触发**:接入 MetricKit 后,在 Xcode → Debug → Simulate MetricKit Payloads,**模拟器立即触发一次 payload**,验证你的 subscriber 能收到 JSON 数据并上传成功;
2. **真机自然采集**:真机连续使用 App 24h 以上,次日打开 Xcode → Devices and Simulators → 选设备 → View Device Logs 里能看到 MetricKit 自动推送;
3. **Crash 模拟**:在 Debug 编译里手动 `fatalError("manual crash for test")`,真机跑一次 Crash → 重新连 Xcode → Organizer Crashes 里几分钟内能看到符号化后的栈;
4. **OSLog 验证**:Mac 上打开 Console.app → 连接真机 → 过滤 `subsystem:com.notesisland.app`,能看到分类后的日志流;
5. **Time Profiler 滚动场景**:Instruments → Time Profiler → Record → 滚动 10 秒列表 → Stop,**主线程不应有 >100ms 的连续色块**;
6. **Allocations Generation 对比**:打开 100 个笔记详情后退出,Allocations 两次 Generation 对比,detail view 相关对象应已释放,**净增 = 0**;
7. **dSYM 备份验证**:每次 Archive 后,**确认 Organizer → Archives → 右键 → Show in Finder → .xcarchive → dSYMs/ 目录有对应 .dSYM**,否则线上 Crash 无法符号化。

### 关键参数

| 参数 / 入口 | 推荐做法 |
| --- | --- |
| MetricKit subscriber 注册时机 | App 启动 `init` 或第一个 Scene 创建时,**越早越好** |
| MetricKit payload 上传策略 | 攒批 + `URLSession.background uploadTask`,**不要立即发** |
| OSLog privacy 级别 | 用户数据 `.private`(默认),业务标识 `.public` 显式 opt-in |
| Watchdog 阈值 | Debug 0.25s 触发 fault;Release 不启用 |
| Crash 上报通道 | 优先用 Apple Organizer(免费且符号化好),自有渠道作补充 |
| dSYM 保存 | 每次发版的 .xcarchive **必须保留至少 1 年**,**iOS 15+ Apple 也接受 archive 后期补传** |

### 真机 vs 模拟器

- **MetricKit 在模拟器上不会自然推送**——必须用 Xcode → Debug → Simulate MetricKit Payloads 手动触发;真机上每天 24h 自然推送一次;
- **Crash 报告在模拟器上是 macOS Crash 格式**,与真机 .ips 不一样,**不能拿来验证符号化流程**;
- **Time Profiler 在模拟器上不准**——模拟器是 macOS 进程,CPU 调度与真机完全不同;
- **Energy Log 必须真机 + 无线 debug** 才能采到电量曲线,USB 连线时会被充电干扰;
- **Allocations 在模拟器上能用**,但内存峰值数字**只在真机有参考价值**(iOS 设备内存限制远低于 Mac)。

---

## 五、踩坑:与 Swift 5 / iOS 16 旧教程的差异

### 坑 1:还在用 `symbolicatecrash` 命令

老教程动不动让你跑 `xcrun symbolicatecrash CrashReport.crash *.dSYM`,这个工具到 Xcode 14+ 已经默认隐藏,**Apple 推荐路径全面转向 Xcode Organizer + `atos`**。如果你必须命令行符号化(CI 场景),用 atos 即可:

```bash
atos -arch arm64 -o YourApp.app.dSYM/Contents/Resources/DWARF/YourApp \
     -l 0x102000000 0x10203a8c
```

`-l` 是 load address(从 .ips 报告里的 binary images 段找),后面的是要符号化的具体地址。

### 坑 2:Leaks 没报警就当没泄漏

Leaks 模板只检测"完全孤立的对象"。retain cycle 里两个对象互相持有,**对 Leaks 来说它们还可达,不算 leak**。但它们也永远不会被释放,这才是 iOS 内存问题的主要类型。

**正确做法**:用 Allocations + Mark Generation 对比,看到某类对象数量单调增长就是泄漏。

### 坑 3:把 `print` 当 OSLog 用

Swift 5 时代很多人在 release 包里到处 `print("xxx")`。这个习惯到 Swift 6 必须改:

- `print` 是同步 stdout 写入,**主线程频繁 print 是真的会卡 UI**;
- `print` 不带 subsystem/category,Console.app 里找不到;
- `print` 不区分隐私级别,**用户数据可能被系统日志收集**;
- Logger 是 lock-free 写入到 unified log,**Release 包零开销**。

替换 import:`import OSLog` → `Logger(...)`。

### 坑 4:MetricKit payload 当成"实时监控"用

MetricKit 的设计就是 **每 24h 一次批量推送**,不是实时监控。如果你需要分钟级粒度,需要在 App 内自建 telemetry(用 `Logger` + 自家上报)。MetricKit 适合做的事是 **长期趋势** 与 **线下回看**。

### 坑 5:`@unchecked Sendable` 绕开严格并发

旧代码迁移到 Swift 6 时,最常见的偷懒做法是给所有 class 加 `@unchecked Sendable`。**这是给自己埋雷**:

- 编译过了,运行时数据竞争依旧;
- Crash 多发生在 release 包 + 真机 + 用户使用,Debug 模拟器复现不出来;
- MetricKit hang diagnostic 里看到的栈通常指向"看起来人畜无害"的 getter / setter,根因其实是别处的并发写。

**正确做法**:用 actor 隔离,或显式声明 `@MainActor`,不要 `@unchecked`。

### 坑 6:dSYM 丢了

最痛的坑:发版后没保留 .xcarchive,半年后线上 Crash 一堆,**全是 `0x102a3b4c` 这种纯地址**,符号化无门。

预防:

- **CI 流程把每次发版的 .xcarchive 上传到对象存储**,key 用 build number;
- Xcode Organizer **本身就是 dSYM 的备份**,只要你登录的 Apple Account 一致,换电脑也能看到历史 Crash 符号化;
- **iOS 15+ 支持后期补传 dSYM**:Xcode → Organizer → Archives → 选 archive → Download Debug Symbols,Apple 服务端也保留了一份。

### 坑 7:Time Profiler 看 Debug 包

Debug 包(`-Onone`)的 Swift 性能比 Release(`-O`)慢 5-10 倍,所有"慢函数"分布都不一样。**性能 profile 必须 Release 包 + 真机**,Debug 包结论**不可信**。

正确做法:Xcode → Edit Scheme → Profile 这个 action 改成 Release 配置,或者直接 Build Configuration 用 ReleaseProfiling(继承 Release 但保留 dSYM 与部分调试信息)。

### 坑 8:OSLogStore 在严格并发下编译报错

`OSLogStore` 不是 `Sendable`,跨 actor 用会报错。把检索操作收口到一个工具 actor 或在创建处就地消费,不要跨边界传递。

### 坑 9:Crash 报告里 `0x0000000000000000` 地址不要慌

线上 Crash 经常看到栈顶是 0x0,这往往不是符号化失败,而是**真的崩在了 NULL 指针解引用上**——经常对应 Swift 里 `force unwrap` `nil` 或 `Unmanaged` 持有失败。

排查路径:看栈第二、第三帧,找你自己的代码;在那段 Swift 源码里搜 `!` 或 `Unmanaged`,通常一抓一个准。这也是本系列从第 01 篇起就明令禁止 `force unwrap` 的原因。

### 坑 10:MetricKit Hang Diagnostic 的 callStackTree 看不懂

`MXHangDiagnostic.callStackTree` 是树形结构,**不是单一栈**——它表示"在采样窗口内,这些栈各出现了多少次"。读图技巧:

1. 按 `subFrames.count` 倒序排,先看"出现次数最多的栈";
2. 沿着栈顶往下看,**最先看到自家代码 frame 那一层**就是优化目标;
3. 如果栈里只有系统 frame 没有自家代码,通常是 SwiftUI 主线程做了大 layout——回去看 SwiftUI Instruments 模板的 View Body Updates。

### 坑 11:Crash 报告里 `Last Exception Backtrace` vs `Thread Backtrace`

`.ips` 里有两段栈:

- `Last Exception Backtrace`:Objective-C NSException 的抛出点(NSArray 越界、KVO 配置错等)——**这是真因**;
- `Thread 0 Backtrace`:Crash 发生时主线程的栈——**这是结果**(往往是 abort / __cxa_throw,无业务信息)。

很多人只看 Thread 0 就猜不到根因,务必先扫 Last Exception。Swift 程序大部分异常是 trap(force unwrap、数组越界、precondition),那时 Last Exception 段会空,看 Thread 0 即可。

### 坑 12:线上 ANR / Hang 复现不出来——电量与温度的影响

线下你怎么试都不卡,线上一堆 Hang Diagnostic。常见原因:

- **CPU 节流**:用户机型温度过高(炎热环境、充电时玩游戏),CPU 频率被限制到 1/3,**原本 50ms 的操作变 150ms**,触发 hang;
- **电量低**:iOS 在电量 <20% 时进入 Low Power Mode,关闭 ProMotion、降低后台优先级,**SwiftUI 动画时间窗口变长**,容易丢帧;
- **磁盘满**:用户磁盘 <500MB 时 SwiftData / Core Data 的写入会变慢甚至挂起,**MetricKit 里能看到 diskWritesCount 与 cumulativeForegroundTime 失衡**。

排查这类问题,要把 MetricKit payload 里的 `thermalState` / `lowPowerModeEnabled` / `application_time_metrics` 一起拉出来归因。Apple 在 `applicationTimeMetrics` 里有详细的"前台 vs 后台 vs CPU 时间"分布,**它就是为这种归因设计的**。

### 坑 13:符号化忘了 -arch

iPhone 早期同时有 arm64 / arm64e / armv7,Apple Silicon Mac 又多了 arm64 (Mac)。`atos` 不指定 `-arch` 时默认当前 host 架构,**iPhone 报告用 Mac host arch 符号化结果全错**。

铁律:**`atos` 必须显式 `-arch arm64`(或 arm64e),与 .ips 报告里 binary images 段的 architecture 字段一致**。

---

NotesIsland 走到第 27 篇,从骨架到 UI、数据、能力、Widget、AI、性能,再到现在的线上诊断,**已经具备了一款真正能在 App Store 上活下去的 App 的全部基本面**。从第 28 篇起我们会回到工程组织,讨论 SPM 模块化与 Build System,把单体工程拆成可维护的多模块结构。
