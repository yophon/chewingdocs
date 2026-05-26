# Instruments 与 MetricKit

24 篇讲了 SwiftUI 内部性能追踪,这一篇讲**线下 + 线上的两套工具**:Instruments 是开发期本地 profile;MetricKit 是线上从用户设备自动上报的性能指标 + 崩溃数据。两者各管一段,做线上 App 都必须用。

> 一句话先记住:**Instruments 是 Xcode 自带的 profiler——Time Profiler 看 CPU 火焰图、Allocations 看内存分配、Leaks 看泄漏(但有局限,不抓 retain cycle)、SwiftUI template 看 body 调用。MetricKit(`MXMetricPayload`)是 iOS 系统每天打包一份用户设备的性能数据自动给你 App,看不到具体用户但有聚合指标。**

---

## 一、Instruments 模板选型

打开 Instruments(Xcode → Open Developer Tool → Instruments,或 ⌘ + I)。常用模板:

| 模板 | 解决什么 |
| --- | --- |
| **Time Profiler** | CPU 热点,哪些函数占主线程 |
| **Allocations** | 内存分配,看哪些类占内存最多 |
| **Leaks** | 内存泄漏检测 |
| **SwiftUI** | View body 频率、Render passes |
| **Animation Hitches** | 卡帧分析(掉帧原因) |
| **Network** | URLSession 请求 / 响应时间线 |
| **Core ML** | ML 模型推理时间、调度到 CPU/GPU/ANE |
| **System Trace** | 全系统调用栈(advanced) |
| **Energy Log** | 电量消耗,后台行为 |

**用 Profile build(Cmd + I)而不是 Debug**——Debug 优化级别 -Onone,性能数据不真实;Profile 是 Release 配置,代表真实运行情况。

---

## 二、Time Profiler:CPU 火焰图

1. 启动 App,在 Instruments 里选 Time Profiler
2. Record(红色按钮),操作 App 触发卡顿场景
3. Stop,看左下角调用栈

火焰图读法:
- **横宽 = 占用 CPU 时间比例**——越宽越耗时
- **纵深 = 调用栈深度**——上面是顶层函数,下面是叶子函数
- **找最宽的函数**——通常是性能元凶
- **过滤主线程**——左下角 Choose Target → Main Thread

例:你看到 `NoteRow.body` 函数下面有一片宽矩形是 `DateFormatter.string(from:)`,说明每次重算 body 都重新 format date,**优化点就在这里**(static formatter)。

---

## 三、Allocations:内存分布

启动 Allocations,做完一系列操作后:

- **All Heap Allocations**:还活着的对象总数
- **All Heap & Anonymous VM**:加上虚拟内存映射
- **Persistent Bytes**:从某时点开始累积的新分配

**Mark Generation** 功能:在某个状态下"打个标记",然后操作,看新增了哪些对象——典型用于"发现哪些对象本该回收但没回收"。

例:
1. App 打开,Mark Generation A
2. 进入 Detail 视图,做几次操作,Mark Generation B
3. 返回 List,Mark Generation C
4. 看 C 比 A 多了什么——理论上不应该多,多了就是泄漏。

---

## 四、Leaks 的局限

`Leaks` 工具检测**已经完全没引用、但 ARC 没回收**的对象——典型场景:循环引用。

```swift
class A {
    var b: B?
}

class B {
    var a: A?      // ❌ 强引用,A.b → B,B.a → A,循环
}

let a = A()
let b = B()
a.b = b
b.a = a
// 离开 scope 后两个都不释放
```

**Leaks 只能抓"完全没引用"的循环**——某些场景下 Leaks 看不到泄漏,因为它们还被某个 scope 弱弱地连着(比如 NotificationCenter)。

**真正的内存泄漏调查靠 Memory Graph**:

- 运行 App → Xcode Debug navigator → Memory → Debug Memory Graph 按钮
- 弹出可视化对象图,可疑对象(过期 view controller / store)旁边有紫色 ! 标记
- 选中查看持有链

---

## 五、SwiftUI Instruments

iOS 17+ 才有 SwiftUI template。Record 一段 App 使用,得到:

- **View Body**:每个 view 的 body 调用次数 + 累计时间
- **Updates**:render 更新次数
- **Layout**:布局耗时
- **Identity Changes**:identity 变动事件

**最有用**:看哪个 view 的 body 调用次数远超预期——通常是依赖了过度宽的 Observable 字段。

---

## 六、Animation Hitches:掉帧分析

`Animation Hitches` 模板检测"该 16ms / 8.33ms 出一帧但延迟了"的情况:

- **Hitch Time Ratio**:总时间里掉帧总时长占比(目标 < 5%)
- **Hitch List**:具体哪一帧晚了多少 ms

掉帧原因常见:
- 主线程被堵(JSON decode / image decode)
- 大量 body 重算 + diff(动画期间)
- SwiftData 大查询同步执行
- 阻塞调用(GCD sync 切到主线程)

iOS 14+ 有 `MetricKit` 内建 hitch metric `MXAnimationMetric.scrollHitchTimeRatio`,线上数据更代表真实用户。

---

## 七、`.crash` / `.ips` 符号化

用户上传的 crash log:
- **`.crash`**(iOS 14 之前 + watchOS)
- **`.ips`**(iOS 15+,JSON 格式)

里面是 hex address 的调用栈,看不懂。**用 dSYM 符号化**:

1. App Store Connect → 你的 App → TestFlight → Build → 下载 dSYM
2. Xcode → Window → Organizer → Crashes → 自动 match 你的 dSYM
3. 看到符号化后的栈

或者命令行:

```bash
symbolicatecrash YourApp.ips YourApp.dSYM
```

**dSYM 是发布 build 时生成的符号表**,Release build 必须打 dSYM(默认是)。dSYM 与你 App 的 build UUID 一一对应,每次构建都不一样,**必须存档**(Xcode 自动归档到 ~/Library/Developer/Xcode/Archives/)。

---

## 八、Xcode Organizer:线上 Crash 与 Metrics

Xcode → Window → Organizer 三个面板:

- **Archives**:历史归档 build,可重新下载 dSYM、提交审核
- **Crashes**:Apple 自动收集的崩溃报告(用户开了"分享 with developer" 才上报)
- **Metrics**:启动时间 / Hang Rate / 滚动卡顿率 / 内存使用 / 电量消耗

**Metrics 面板**给的是聚合统计——某 build 在所有用户上的 P50 / P95 启动时间,Hang Rate(P95 > 250ms 算 Hang)等。**重要数据点**:
- **Launch Time**:cold launch P95 > 2s 就不行了
- **Hang Rate**:任何 hang 都是用户感知到的卡
- **Disk Writes**:写盘多导致电量消耗大

---

## 九、MetricKit:自动上报

`MXMetricManager` 自动拿系统级聚合指标 + crash diagnostics:

```swift
import MetricKit

final class MetricsHandler: NSObject, MXMetricManagerSubscriber {
    static let shared = MetricsHandler()
    
    func start() {
        MXMetricManager.shared.add(self)
    }
    
    func didReceive(_ payloads: [MXMetricPayload]) {
        for payload in payloads {
            // 一份 payload 是过去 24 小时的聚合数据
            let appLaunchTime = payload.applicationLaunchMetrics?.histogrammedTimeToFirstDraw
            let cpu = payload.cpuMetrics?.cumulativeCPUTime
            let hangs = payload.applicationResponsivenessMetrics?.histogrammedApplicationHangTime
            // 上报到你的服务器
            upload(payload.jsonRepresentation())
        }
    }
    
    func didReceive(_ payloads: [MXDiagnosticPayload]) {
        for payload in payloads {
            // crash / disk write / hang / cpu / app launch diagnostic
            for crash in payload.crashDiagnostics ?? [] {
                let callStack = crash.callStackTree.jsonRepresentation()
                upload(crash: callStack)
            }
        }
    }
}
```

**MetricKit 的特点**:
- 系统每天一次打包数据传给 App(App 启动时)
- 数据匿名(不带用户标识)
- 包含 crash / hang / cpu / disk / network 全面诊断

`MXDiagnosticPayload` 包含具体的 crash call stack,可以上传到自己后端做聚合分析——**比 Apple 自带 Organizer 更灵活**(自定义看板、按 build / 设备型号过滤)。

---

## 十、os_log 与 OSLogStore

`os_log` 是 iOS 系统级日志 API,比 `print` 强大得多:

```swift
import os.log

let logger = Logger(subsystem: "com.example.NotesIsland", category: "sync")

logger.debug("Starting sync with \(items.count) items")
logger.info("Sync completed")
logger.error("Sync failed: \(error.localizedDescription)")
logger.fault("Critical error: \(error)")    // 最严重级别
```

`Logger` 的好处:
- **不阻塞主线程**(异步)
- **可配置 privacy**(默认敏感信息脱敏)
- **可被 Console.app 实时查看**
- **被 OS 自动收集到 sysdiagnose**

iOS 15+ 提供 `OSLogStore`,在 App 内**检索本设备的过去日志**:

```swift
import OSLog

func loadRecentLogs() async throws -> [String] {
    let store = try OSLogStore(scope: .currentProcessIdentifier)
    let position = store.position(timeIntervalSinceLatestBoot: 1)  // 从启动后 1s 开始
    
    let entries = try store.getEntries(at: position)
        .compactMap { $0 as? OSLogEntryLog }
        .filter { $0.subsystem == "com.example.NotesIsland" }
        .map { "\($0.date): \($0.composedMessage)" }
    
    return entries.suffix(100).map { String($0) }
}
```

适用:线上用户反馈"出问题了" → 让用户在 App 内导出最近日志发给你。

---

## 十一、真机 vs 模拟器:测什么不能在模拟器

模拟器够用的:
- UI 布局调试
- 大部分 SwiftUI 行为
- SwiftData 本地操作
- 基本网络请求

**必须真机**才准确:
- 性能 / 卡顿(模拟器跑 Mac CPU 比 iPhone 快很多)
- Core ML 推理(模拟器没 ANE)
- 相机 / 麦克风
- Touch ID / Face ID
- 推送通知(模拟器 iOS 16+ 能模拟,但实际接收要真机)
- CloudKit 同步细节
- 内存 / 电量真实消耗
- Bluetooth / NFC

**Release 测试一定真机**——上架前用 TestFlight 装到真机跑一遍,这是 unsubstitutable 的最后一步。

---

## 十二、踩坑

1. **Debug build 跑 Time Profiler**——优化级别不同,数据无意义。用 Profile build。
2. **看 Leaks 没 leak 就以为没泄漏**——Leaks 只抓"完全孤立"的循环,被 NotificationCenter / closure 弱连的看不到。配 Memory Graph。
3. **不存档 dSYM**——线上 crash 报告没法符号化,栈是 hex 地址。Xcode Archive 自动存,别清掉。
4. **MetricKit 没启动**——`add(self)` 在 App 启动时调,否则永远收不到 payload。
5. **MetricKit 测试**:Xcode 16+ 有 `Test → Simulate Metric Payload`,模拟器能触发。
6. **`os_log` 没启用**——Console.app 默认过滤 debug / info 级,要在 Console 里勾选才显示。
7. **OSLogStore 在 Extension 里读**——只能读本 Process,跨 process 不能。需要主 App 写,主 App 读。
8. **dSYM 上传第三方 crash 服务**——某些服务要求 dSYM 上传到他们后台才能符号化。CI 流程要包含。
9. **Animation Hitches 阈值不准**——hitch 检测是统计,小样本不可靠,长时间使用才有意义。
10. **真机调试运行内存比线上多**——Xcode 在调试时给 App 额外内存预算,生产环境更紧张。OOM 要靠 Organizer Metrics 看线上数据。

---

下一篇 `26-SPM模块化与测试体系.md`,讲 Swift Package Manager 的 `Package.swift` / target / product / binaryTarget xcframework / Resource bundle、本地 SPM 包模块化、Swift Testing(`@Test` / `#expect`)+ XCTest UI Testing、参数化测试、`#Preview` 宏、测试 SwiftData 与 MainActor、Snapshot testing 思路。
