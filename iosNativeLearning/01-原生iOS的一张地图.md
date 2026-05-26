# 原生 iOS 的一张地图

学 iOS 的最大障碍不是"API 太多",是**心智模型没建起来**。一个写过几年 Objective-C + Storyboard 的人,如果还把 iOS 当"多个 `UIViewController` 通过 segue 互跳",那一打开 SwiftUI 项目就会立刻懵——`@main App`?`some View`?`@State`?导航怎么 push?这一篇不教任何 API,只讲一件事:**现代 iOS 到底长什么样**。

> 一句话先记住:**现代 iOS 是一棵被 Observation 追踪的 SwiftUI 视图树,挂在 `App` 协议入口上,被 Swift Concurrency 隔离并发,被 SwiftData 落盘,通过 Apple 平台框架接入系统能力。其余 framework——Widget、推送、StoreKit、Core ML——都是这棵树的扩展或副作用边界。** 这句话听上去很抽象,但后面 26 篇都是它的推论。

---

## 一、忘掉 Storyboard + UIKit 那一代 iOS

很多人对 iOS 的初始印象是"Objective-C 写业务、Storyboard 拖界面、`UIViewController` 组合生命周期、GCD 跑后台"。这套心智在 2018 年之前是对的,在 2026 年是**陈旧的**。

| 维度 | 旧 iOS(2010-2018) | 现代 iOS(2022-) |
| --- | --- | --- |
| 语言 | Objective-C / Swift 5 | **Swift 6**(strict concurrency) |
| UI | Storyboard / XIB + Auto Layout | **SwiftUI**(声明式) |
| 屏幕 | 每屏一个 `UIViewController`,`segue` 跳转 | **`NavigationStack`** + 类型化路由 |
| 入口 | `AppDelegate` + `SceneDelegate` | **`@main` + `App` 协议** |
| 异步 | `dispatch_async` / `OperationQueue` | **`async/await` + `actor`** |
| 状态 | `delegate` + KVO + Notification | **`@State` + `@Observable`**(字段级追踪) |
| 数据层 | Core Data NSManaged 一堆样板 | **SwiftData**(`@Model` 几行搞定) |
| 网络 | `NSURLConnection` → `URLSession` callback | **`URLSession.data(for:) async`** |
| 包管理 | CocoaPods / Carthage | **Swift Package Manager**(Xcode 原生) |
| 发布 | iTunes Connect 手动 archive | **App Store Connect + Xcode Cloud / TestFlight** |

**最要命的差别不在 API 数量,而在心智方向**:旧 iOS 是"命令式 + 引用驱动",你拿到 `UILabel` 引用、`label.text = "hello"` 命令式修改。现代 iOS 是"声明式 + 状态驱动",你声明的是"当状态长这样时 UI 应该长这样",剩下的让 SwiftUI runtime 自己 diff 出最小重渲染范围。

> 如果你脑子里 iOS 的心智还停留在"`viewDidLoad` / `viewWillAppear` / `viewDidDisappear` 五段生命周期",那看 SwiftUI 时会一直问"这哪里相当于 viewDidLoad",看 `@Observable` 时会一直问"它什么时候 dealloc"——问题不在 API,在你以为 iOS 还是 2015 年那一套。

---

## 二、那棵树长什么样

现代 iOS 应用,**整个进程从一个 `@main App` 类型起步**。这个 `App` 的 `body` 返回一组 `Scene`,`Scene` 里挂着 SwiftUI 视图树。

```
进程
└── @main NotesIslandApp: App
    └── var body: some Scene
        └── WindowGroup { ... }       ← Scene,跨 form factor 抽象
            └── RootView()             ← SwiftUI 视图根节点
                ├── NavigationStack    ← 路由,管"现在显示哪一屏"
                │   ├── NoteListView()
                │   │   ├── List
                │   │   │   └── NoteRow(...) × N
                │   │   └── .toolbar { ... }
                │   └── NoteDetailView(...)
                └── .modelContainer(container)  ← SwiftData 注入
```

每个节点(`RootView`、`NoteListView`、`NoteRow`)都是一个 `struct` 实现 `View` 协议。这些结构体**只读状态、生成 View 描述**,自己不持有任何字段引用、不订阅生命周期、不操作 `UIView`。

**这棵树的关键性质**:

1. **声明式**——你写"在某状态下 UI 长什么样",不写"如何把 UI 从 A 状态改成 B 状态"。
2. **View 是值类型**——`struct`,每次重算 `body` 都是构造一个新值,几乎零成本。
3. **状态外挂**——`@State` 实际指向 SwiftUI 框架维护的"存储槽",视图重建不会丢状态。
4. **没有 `UIView` 引用**——你拿不到也不需要拿 `UILabel` 这种对象,只描述输出。

后面 05-10 篇全在讲这棵树:怎么搭、怎么重算、怎么布局、怎么动画。

---

## 三、谁持有状态:@State 与 @Observable

View 是 `struct`,**结构体不可变**,那 `@State private var count = 0; count += 1` 怎么改自己?

答案是 `@State` 不是普通字段,是 property wrapper:它的实际值存在 SwiftUI 框架管理的"存储槽"里,struct 本身只持有一个指向存储槽的引用。所以**视图被反复重建,但状态跟着 view identity 走,不会丢**。

```
SwiftUI 框架
   │
   ├── StorageNode("NoteListView@root/0")
   │   ├── @State var searchText: String      ← 视图私有状态
   │   └── @State var presentingNewNote: Bool
   │
   └── EnvironmentValues
       └── modelContext: ModelContext         ← 跨视图依赖注入
```

`@State` 只够装"视图私有的可变状态"(搜索框输入、是否展开)。一旦状态要被多个视图共享、要跨页传递、要装真正的业务逻辑,就升级到 `@Observable`:

```swift
@Observable
final class NotesStore {
    var notes: [Note] = []
    var isLoading = false
    func reload() async { ... }
}
```

`@Observable` 宏展开后,SwiftUI 会**按字段做依赖追踪**——视图读了 `notes`,只有 `notes` 变化时它才重算;读了 `isLoading` 的另一个视图不受牵连。这是相对 `ObservableObject + @Published`(2019 老方案)的根本升级。06 篇展开。

> 这就是 **UDF(单向数据流)** 在 SwiftUI 的落地:状态从 `@Observable` 流到 View,事件从 View 调回 `@Observable` 的方法,**没有 `binding(to:)` 这种反向耦合**。Combine 在 2026 年只保留在桥接 Notification / Timer 的边缘位置,不再是状态主轴。

---

## 四、副作用从哪里出去:Swift Concurrency

UI 树是纯的,`@Observable` 也只是个状态容器,真正"做事"的是**async 函数**——发网络、查数据库、调系统服务。所有这些操作通过 `async/await` 写成结构化的调用链,在 `Task` 里启动,绑定到某个 `actor` 上避免数据竞争。

```
@MainActor View
   ↓ Task { await store.reload() }
   ↓
@Observable NotesStore (默认 @MainActor)
   ↓ await api.fetchNotes()
   ↓
actor APIClient (后台 actor)
   ↓ try await URLSession.shared.data(for: req)
   ↓
内核 / 网络
```

**结构化并发**的核心:`Task` 有 scope,scope 被取消时 `Task` 自动取消,没有"孤儿协程"在后台烧 CPU。`actor` 把"共享可变状态 + 串行访问"封装成语言原语,**编译器在 Swift 6 严格并发模式下会拒绝任何跨 actor 的不安全访问**——数据竞争从"运行时偶发崩"变成"编译期就报错"。04 / 05 篇讲透。

GCD(`DispatchQueue.global().async { ... }`)在 2026 年只在和老 SDK 桥接时出现,新代码不再写。

---

## 五、Apple SDK 是一堆 framework,不是一个"全家桶"

很多人以为 "iOS SDK" 是个安装包,装上 Xcode 就有所有功能可用。**对了一半**——Xcode 确实把所有 framework 都装好,但你要 `import` 才能用,且不同 framework 服务于不同层次。

```
SwiftUI                  ← UI 主框架
SwiftData / WidgetKit    ← 数据 / Widget(平台框架)
ActivityKit              ← Live Activity / Dynamic Island
StoreKit                 ← 内购 / 订阅
UserNotifications        ← 推送
AppIntents               ← Siri / Shortcuts / Spotlight 统一入口
Foundation / Observation ← 标准库
Combine                  ← 桥接 Notification / Timer
URLSession (in Foundation) / Network (low-level)
AVFoundation / PhotoKit  ← 相机 / 媒体
Core ML / Vision         ← 端侧 AI
CryptoKit                ← 加密
UIKit / AppKit           ← 老 UI 框架,SwiftUI 不存在某能力时回落
```

**这些 framework 是按需 import 的**。一个最小 iOS App 只 `import SwiftUI` 就能跑;一个完整产品大概 import 8-15 个。每多一个 framework,启动时绑定开销、二进制体积都会增加——所以**Apple 平台框架不等于"必须每个都用"**。

> 这套分层和 Android 的 Jetpack 思路相反:Android 把"现代化 API"都放在 `androidx.*` 命名空间里独立版本化;Apple 的现代化 API 直接长在系统 framework 上,跟着 iOS 版本走。所以**你能用什么 API 完全取决于 `IPHONEOS_DEPLOYMENT_TARGET`,不像 Android 可以用 AndroidX 把老设备拉到新能力**。

---

## 六、iOS / Swift / Xcode / Apple Developer 四件事

新读者最容易混淆这四个名词:

- **iOS**——Apple 在 iPhone 上跑的操作系统,按主版本号发布,iOS 18 = 2024 秋发布,iOS 19 = 2025 秋发布。SDK 跟着系统走。
- **Swift**——Apple 维护的语言,2024-09 发布 Swift 6,2026 已经到 6.x。Swift 与 iOS 版本**部分耦合**:新 Swift 需要新 Xcode,新 Xcode 默认绑定某个最低 iOS SDK。
- **Xcode**——Apple 的 IDE,版本号比 iOS 慢半拍(Xcode 16 = 配 iOS 18)。它**不只是 IDE**,还是 SDK 发布载体——SDK 装在 `Xcode.app/Contents/Developer/Platforms/iPhoneOS.platform/`。
- **Apple Developer Program**——$99/年的开发者账号,签证书、上传 build、上架、推送都得有它。**写代码不需要,真机调试 + 上架必须有**。

四件事的关系:**Xcode 16 内置 Swift 6 编译器 + iOS 18 SDK,产出一个 `.ipa`,通过 Apple Developer 账号上传到 App Store Connect**。

---

## 七、deployment target:不是版本号,是契约

`IPHONEOS_DEPLOYMENT_TARGET = 18.0` 这个 Build Setting 是 iOS 上最被低估的数字之一:

- 它的意思是"这个 App **不允许装在 iOS 18.0 以下的设备上**"。App Store 会拦截低版本设备下载。
- 它**同时声明了你能默认 import 的 API 集合**:`@Observable` 是 iOS 17+,`@Entry` 宏是 iOS 18+,Foundation Model 是 iOS 19+。把 deployment target 设成 18,等于声明"我代码里所有 ≤ iOS 18 的 API 都可以裸用,无需 `if #available`"。

`@available(iOS 19, *)` 与 `if #available(iOS 19, *)` 配套使用,是"我用了一个比 deployment target 更新的 API,我自觉给降级方案"的标准姿势:

```swift
if #available(iOS 19, *) {
    // 用 iOS 19+ 的 Foundation Model 端侧推理
} else {
    // 降级:云端 API 调用
}
```

**没有 `if #available` 就裸用比 deployment target 更高的 API,运行到老系统上会直接 crash**(framework 加载失败或符号缺失)。NotesIsland 钉死 **deployment target = iOS 18**,iOS 19+ API 永远走 `if #available`。

> 选 deployment target 是一笔交易:往上提一档,失去一批用户;往下降一档,多一堆 `if #available`。2026/05 时点的甜点是 iOS 18(iOS 17 已经丢失装机量、iOS 19 又把 iPhone 11/12 切掉)。每年这个甜点位会移,选基线时查 [Apple App Store 装机量](https://developer.apple.com/support/app-store/)。

---

## 八、本系列的整体地图

```
01     心智总览(这篇)
02-04  地基:Xcode 项目 → Swift 6 类型 → Concurrency 与 Sendable
       这一段是"会写 iOS" 的前提,顺序不能跳

05-10  SwiftUI 一族:View / 状态 / 布局 / Modifier / 动画 / 手势
       这一段是"会写界面" 的核心,占整本最大篇幅

11-14  架构与闭环:NavigationStack / SwiftData / URLSession / Keychain
       这一段读完,你能从零搭一个能联网能存数据能加密的 App

15-19  系统能力:互操作 / 推送 / 相机 / 权限 / 后台
       按需看,做什么功能看什么

20-23  平台特色与体验:Widget / 内购 / 端侧 AI / 无障碍
       iOS 区别于跨端的核心阵地

24-27  工程化与发布:性能 / Instruments / 模块化测试 / 签名上架
       上架前必看
```

**优先级**:01-14 每篇都建议看;15-19 按需;20-27 真上架前再回头读。

---

## 九、踩坑提醒(总览版,后面每篇细讲)

1. **把 SwiftUI 当 React 用**——SwiftUI 的 diff 不是 VirtualDOM,View 是 struct,`@State` 不是 hook,误等同会算错重渲染成本,24 篇展开。
2. **多 `UIViewController` 心智迁移过来**——`UIViewController` 在现代 SwiftUI 项目几乎不出现(除非桥接老 SDK),99% 屏幕用 `View` + `NavigationStack`,11 篇展开。
3. **`@StateObject` / `ObservableObject` / `@Published` 还在写**——2019 年的老 MVVM 方案已经被 `@Observable` 字段级追踪取代,06 篇会讲为什么这是性能升级而不是语法糖。
4. **`DispatchQueue.main.async` 切回主线程**——`async/await` + `@MainActor` 已经把这件事做掉,新代码不再写 GCD,04 篇展开。
5. **怕 `@unchecked Sendable`,也怕严格并发警告**——Swift 6 严格并发不是来折腾你,是替你抓数据竞争。`@unchecked Sendable` 是把编译器的安全网关掉,等于"我保证线程安全,出问题我背锅",新人绝对不要乱标,05 篇会讲怎么正面解决。
6. **deployment target 设成最新 iOS**——会失去一批装机量;设成 iOS 15 又要写一堆 `if #available`。iOS 18 是 2026 的甜点,不要照搬旧教程。
7. **想接推送就退回 `AppDelegate` 模板**——错的。`@main App` 入口加 `@UIApplicationDelegateAdaptor` 就能保留 push / URL scheme 等回调,16 篇讲。
8. **不读 Privacy Manifest 要求**——2024 起 Apple 强制,审核会卡。第三方 SDK 也必须有,18 篇讲。
9. **以为 Combine 还是主流**——SwiftUI 状态层已经被 `@Observable` 完全替代,Combine 在 2026 只剩"桥接 `NotificationCenter` / `Timer` / Foundation 老 API"这种边缘活,06 / 13 篇展开。
10. **沉迷三方库**——AsyncImage 替代 Kingfisher,`Codable` 替代 SwiftyJSON,`URLSession` async 替代 Alamofire。新项目零三方依赖能撑很久,26 篇真要拆模块时再上 SPM。

---

下一篇 `02-Xcode项目骨架与xcconfig.md`,讲 Xcode 16 工程怎么从模板开始去掉模板坏味、`xcconfig` 怎么分环境配置、`Info.plist` generated 模式、Asset Catalog 与 SF Symbols、Build Settings 哪些必改、Workspace 与 Project 的边界。
