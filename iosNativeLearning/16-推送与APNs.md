# 推送与 APNs

推送是 iOS 区别于跨端的核心阵地。Apple Push Notification service(APNs)是**唯一合法的**远程推送通道——所有第三方推送服务(FCM、极光、JPush)最终都是经 APNs 转发。这一篇讲透:**`UNUserNotificationCenter` 权限、本地通知 vs 远程推送、APNs token 上行流程、Notification Service Extension 修改内容、静默推送与后台唤醒、Push to Start Live Activity(iOS 17.2+)**。

> 一句话先记住:**推送有两条路径:本地(`UNNotificationRequest` schedule 到通知中心)和远程(APNs 经服务器经 token 推到设备)。两条都用 `UNUserNotificationCenter` 接收处理。Notification Service Extension 在远程通知到达后、用户看到前,有 30 秒窗口修改内容(解密 / 下载附件 / 拼接富文本)。**

---

## 一、权限请求

App 启动后某个合适时机请求通知权限:

```swift
import UserNotifications

func requestNotificationPermission() async -> Bool {
    do {
        return try await UNUserNotificationCenter.current()
            .requestAuthorization(options: [.alert, .badge, .sound])
    } catch {
        return false
    }
}
```

**`alert` / `badge` / `sound`** 是基本三件套。iOS 12+ 还能加:

- `.provisional`:免提示静默授权(通知直接进通知中心,但不出锁屏 banner;用户在锁屏看到这条通知后能选"显著显示 / 关闭")
- `.criticalAlert`:绕过勿扰模式(医疗 / 公共安全 App 才能申请)
- `.providesAppNotificationSettings`:App 内提供"通知设置入口",系统会显示一个"设置"按钮

**请求时机很重要**:首次启动就弹是反模式(用户不知道为啥要权限,大概率拒绝)。最佳实践:在用户首次完成关键行为后(创建第一条笔记 / 设置首个提醒)再请求,给个"需要通知提醒你的笔记到期" 之类的 onboarding 文字。

权限状态查询:

```swift
let settings = await UNUserNotificationCenter.current().notificationSettings()
switch settings.authorizationStatus {
case .authorized: ...
case .denied: ...               // 用户拒了,要引导去设置打开
case .notDetermined: ...        // 还没问
case .provisional: ...
case .ephemeral: ...             // App Clip
@unknown default: break
}
```

被拒绝后**不能再次弹系统弹窗**——只能引导用户去系统设置:

```swift
if let url = URL(string: UIApplication.openSettingsURLString) {
    await UIApplication.shared.open(url)
}
```

---

## 二、本地通知

调度一个 30 秒后的本地通知:

```swift
let content = UNMutableNotificationContent()
content.title = "笔记提醒"
content.body = "你 5 分钟前创建了一条标题为「会议纪要」的笔记"
content.sound = .default
content.userInfo = ["noteID": noteID.uuidString]  // 自定义数据

let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 30, repeats: false)
let request = UNNotificationRequest(
    identifier: "note-\(noteID)",
    content: content,
    trigger: trigger
)

try await UNUserNotificationCenter.current().add(request)
```

三种 trigger:
- `UNTimeIntervalNotificationTrigger(timeInterval:repeats:)`:N 秒后
- `UNCalendarNotificationTrigger(dateMatching: components, repeats:)`:某个时间(每天 8 点)
- `UNLocationNotificationTrigger(region: CLRegion, repeats:)`:进入 / 离开某地理区域

trigger 为 nil 时通知立即送达。

取消未到时的:

```swift
UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ["note-..."])
UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
```

清除已经显示的:

```swift
UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [...])
UNUserNotificationCenter.current().removeAllDeliveredNotifications()
```

---

## 三、远程推送:APNs token 上行

APNs 远程推送的完整链路:

```
App 启动
  ↓
UNUserNotificationCenter.requestAuthorization
  ↓
用户同意
  ↓
UIApplication.shared.registerForRemoteNotifications()
  ↓
系统向 APNs 注册
  ↓
APNs 返回 deviceToken(每个设备 + App 唯一)
  ↓
AppDelegate.application(_:didRegisterForRemoteNotificationsWithDeviceToken:)
  ↓
App 把 deviceToken 上传到自己的后端
  ↓
后端用 deviceToken + auth token 调 APNs HTTP/2 API
  ↓
APNs 推到设备
  ↓
UNUserNotificationCenter.delegate 处理
```

`@main App` 入口要桥一个 `AppDelegate`:

```swift
@main
struct NotesIslandApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    
    var body: some Scene {
        WindowGroup { RootView() }
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        application.registerForRemoteNotifications()    // 触发拿 token
        return true
    }
    
    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        Task {
            try? await uploadTokenToServer(token)
        }
    }
    
    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("注册失败:\(error)")
    }
}

extension AppDelegate: UNUserNotificationCenterDelegate {
    // App 在前台时收到推送
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        return [.banner, .sound, .badge]    // 即使在前台也显示
    }
    
    // 用户点击通知
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        let info = response.notification.request.content.userInfo
        if let noteIDStr = info["noteID"] as? String, let noteID = UUID(uuidString: noteIDStr) {
            await handleOpenNote(noteID)
        }
    }
}
```

`deviceToken` 是 `Data`,Apple 推荐 hex 字符串上传,服务端再转回 binary 调 APNs。

---

## 四、APNs payload 结构

后端发到 APNs 的 JSON payload:

```json
{
  "aps": {
    "alert": {
      "title": "新消息",
      "body": "李四回复了你的笔记"
    },
    "badge": 3,
    "sound": "default",
    "thread-id": "note-thread-42",
    "category": "MESSAGE_CATEGORY",
    "mutable-content": 1,
    "content-available": 1
  },
  "noteID": "uuid-here",
  "actionURL": "notesisland://note/uuid"
}
```

`aps` 字典是 Apple 保留的,**外面同级别可以放任何自定义字段**。Swift 端通过 `userInfo` 取:

```swift
let info = notification.request.content.userInfo
let noteID = info["noteID"] as? String
```

关键字段:
- **`alert`**:显示内容,可以是字符串或 `{title, subtitle, body}` 字典
- **`badge`**:App 角标数字(0 清除)
- **`sound`**:`default` 系统默认,或 `.caf` 自定义铃声
- **`thread-id`**:同 thread-id 的通知在通知中心分组
- **`category`**:绑定 `UNNotificationCategory`,决定通知附加的快捷动作
- **`mutable-content: 1`**:允许 Notification Service Extension 拦截修改
- **`content-available: 1`**:静默推送(后台唤醒,无 UI 提示)

---

## 五、Notification Service Extension

新建一个 Notification Service Extension target(File → New → Target → Notification Service Extension)。它在远程推送到达后、用户看到前**有 30 秒窗口处理**:

```swift
import UserNotifications

class NotificationService: UNNotificationServiceExtension {
    override func didReceive(
        _ request: UNNotificationRequest,
        withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
    ) {
        guard let mutable = (request.content.mutableCopy() as? UNMutableNotificationContent) else {
            contentHandler(request.content)
            return
        }
        
        // 1. 解密 payload(端到端加密的消息)
        if let ciphertext = mutable.userInfo["encrypted"] as? String,
           let plaintext = decrypt(ciphertext) {
            mutable.body = plaintext
        }
        
        // 2. 下载图片附件,做富推送
        if let imageURLString = mutable.userInfo["image"] as? String,
           let url = URL(string: imageURLString) {
            Task {
                if let attachment = await downloadAttachment(from: url) {
                    mutable.attachments = [attachment]
                }
                contentHandler(mutable)
            }
        } else {
            contentHandler(mutable)
        }
    }
    
    override func serviceExtensionTimeWillExpire() {
        // 30 秒到了,赶紧返回当前能做出来的最好版本
        // 否则 iOS 用原始 payload
    }
}
```

要让 Extension 触发:**APNs payload 必须 `mutable-content: 1`**。Extension 只对**远程推送**有效,本地通知不会触发它(本地通知你已经在 App 内,直接做好就调度)。

典型用途:
- **解密**:点对点加密的消息体,APNs 上是密文,Extension 解密成明文
- **富推送附件**:downloaded 图片 / 音频附在通知上
- **聚合标题**:`"3 条新消息来自 张三"` 这种动态拼接

---

## 六、静默推送(content-available)

```json
{
  "aps": {
    "content-available": 1
  },
  "syncRequest": "now"
}
```

`content-available: 1` 是**静默推送**——不弹通知,只触发 App 在后台短暂唤醒,跑一段代码:

```swift
func application(_ application: UIApplication,
                 didReceiveRemoteNotification userInfo: [AnyHashable: Any]) async -> UIBackgroundFetchResult {
    // 后台被静默推送唤醒,这里大约有 30 秒
    do {
        try await syncFromServer()
        return .newData
    } catch {
        return .failed
    }
}
```

`Info.plist` 要加 `UIBackgroundModes` 含 `remote-notification`。

**限制**:
- iOS 会**限流**(每小时只允许有限次数,具体阈值 Apple 不公开)
- App 在锁屏 / 长时间未用 时可能根本不送达
- 不能保证"准时"——可能延迟到下次 device 在线时

适用:**事件触发的同步,不强求实时**(如新消息触发同步,而不是依赖 polling)。

---

## 七、Push to Start Live Activity(iOS 17.2+)

iOS 17.2 起,**远程推送可以启动 Live Activity**(不再需要 App 在前台调 `ActivityKit.request(...)`)。

后端发到 APNs 的 payload:

```json
{
  "aps": {
    "timestamp": 1700000000,
    "event": "start",
    "content-state": {
      "homeScore": 1,
      "awayScore": 0
    },
    "attributes-type": "GameAttributes",
    "attributes": {
      "homeTeam": "我队",
      "awayTeam": "对手"
    },
    "alert": {
      "title": "比赛开始"
    }
  }
}
```

`event: "start"` + `attributes-type` + `attributes` 的组合让 APNs 触发 Live Activity 启动。后续用 `event: "update"` 推内容更新,`event: "end"` 结束。

要 Push to Start,App 需要先拿"Push to Start token":

```swift
// iOS 17.2+
for await pushToken in Activity<GameAttributes>.pushToStartTokenUpdates {
    let tokenHex = pushToken.map { String(format: "%02x", $0) }.joined()
    try? await uploadPushToStartToken(tokenHex)
}
```

完整 Live Activity / Dynamic Island 在 20 篇展开。

---

## 八、Notification Actions:通知上的快捷按钮

```swift
// 注册 category(通常在 AppDelegate didFinishLaunching 里)
let acceptAction = UNNotificationAction(
    identifier: "ACCEPT",
    title: "接受",
    options: .foreground
)
let declineAction = UNNotificationAction(
    identifier: "DECLINE",
    title: "拒绝",
    options: .destructive
)
let category = UNNotificationCategory(
    identifier: "INVITE",
    actions: [acceptAction, declineAction],
    intentIdentifiers: [],
    options: []
)
UNUserNotificationCenter.current().setNotificationCategories([category])
```

推送 payload 里指定 `"category": "INVITE"`,通知就会带这两个按钮。处理用户点击:

```swift
func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse
) async {
    switch response.actionIdentifier {
    case "ACCEPT": await accept(...)
    case "DECLINE": await decline(...)
    case UNNotificationDefaultActionIdentifier: await openDetail(...)
    case UNNotificationDismissActionIdentifier: break
    default: break
    }
}
```

`.foreground` 选项让 App 启动到前台;不加默认是后台静默响应。

---

## 九、Communication Notifications(iOS 15+)

`UNNotificationContent.thread-id` 配合 `INSendMessageIntent` 让通知显示发送人的头像 + 名字,而不是 App 图标——这是 iMessage / 微信 / Telegram 之类即时消息 App 标准做法。需要 SiriKit + INSendMessageIntent + INPerson 配置,复杂度较高,通常聊天 App 才上,普通业务跳过。

---

## 十、FCM / Firebase 等第三方桥

Firebase Cloud Messaging(FCM)在 iOS 上的真实路径:**App 注册 APNs token → 上传到 FCM → FCM 调 APNs 推到设备**。所以 FCM **不是替代 APNs**,只是封装。

接 FCM 的好处:
- 跨端推送(Android / Web 同一套)
- 主题订阅、分群推送等业务功能
- 后端不直接对接 APNs HTTP/2 API

代价:多一层依赖、多一个 SDK、Privacy Manifest 多一份要审。

**纯 iOS App 完全可以不上 FCM**——后端用 `APNS Provider API` 直推。第三方推送 SDK 主要满足"跨端 / 大批量分群" 需求。

---

## 十一、踩坑

1. **首次启动就请求通知权限**——用户不知道为啥要,大概率拒。在用户做了关键操作后再请求,带 onboarding。
2. **`deviceToken` 上传到服务器时不更新**——每次 App 启动都拿到 token(可能变,虽然不常),都该上传。服务器要支持同一用户多个 token(多设备)。
3. **`mutable-content: 1` 没设**——Notification Service Extension 不触发,你的解密 / 富推送代码不跑。
4. **本地通知期望触发 Notification Service Extension**——不会,Extension 只对远程通知有效。
5. **`content-available: 1` 推送总是不到**——iOS 限流非常严,锁屏 + 长期不用的 App 几乎收不到。不能依赖它做"实时同步",只能做"机会性同步"。
6. **`category` 注册晚了**——`setNotificationCategories` 要在收到通知之前,通常在 AppDelegate launching 时设置。
7. **`UNUserNotificationCenter.current().delegate` 没设**——前台通知不显示,点击事件不触发。设置 delegate(通常 AppDelegate)。
8. **Live Activity Push to Start token 没拿**——只在 iOS 17.2+ 支持,且要 attribute 类型先发起过一次 Activity 才能拿 token。
9. **APNs payload size 超 4KB(iOS 16+ 是 4096 bytes)**——会被截断或 reject。富内容(图片附件)用 URL 引用,extension 下载。
10. **沙盒环境 vs 生产 APNs**——Xcode 直接安装的 App 用 sandbox APNs;TestFlight / App Store 用 production。后端配置要对应。debug 通过、线上不到的 90% 是这里。

---

下一篇 `17-AVFoundation与PhotoKit.md`,讲 `AVCaptureSession` 自定义相机、`AVPlayer` / `AVPlayerLayer` 在 SwiftUI 里的承载、`PhotosPicker` 系统选择器(无需相册权限)、`PHPhotoLibrary` 权限分级(`addOnly` vs `readWrite`)、`AVAudioRecorder` 录音、`AVAudioSession` 类别与混音。
