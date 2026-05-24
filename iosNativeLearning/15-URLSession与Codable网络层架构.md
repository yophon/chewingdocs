# 15 URLSession async API、Codable 与网络层架构

> 基线:iOS 18 (最低部署目标) / Swift 6 严格并发 / Xcode 16 / SwiftUI。涉及 iOS 19+ 的 API 单独标注。

NotesIsland 已经能本地存数据、跨设备同步,但还有一类需求绕不开:**和服务端打交道**——拉服务端的笔记模板、上传备份、订阅别人的公共笔记本、用第三方 AI 接口生成摘要。这一篇把 Apple 平台的网络栈讲清楚:`URLSession` 的 async API、`Codable` 序列化、错误模型、拦截器与重试、以及 Combine 在 2026 年的合理位置。

iOS 15 起 `URLSession` 全面 async 化,iOS 18 + Swift 6 严格并发让这套 API 第一次完全好用。**这一篇默认不写 `dataTask(with:completionHandler:)`,不写 `@Published` + Combine 当主线状态层,只在桥接处保留 Combine。**

---

## 一、机制定位

### 1.1 为什么不要再用 dataTask 回调

```swift
// ❌ 老回调 API
URLSession.shared.dataTask(with: url) { data, response, error in
    if let error { /* ... */ return }
    guard let data else { return }
    DispatchQueue.main.async { self.handle(data) }
}.resume()
```

回调链的三宗罪:

1. **错误传递难**:`Result` 模式要嵌套,组合多个请求是回调地狱。
2. **取消复杂**:要手动持有 task,在 deinit 里 cancel,容易漏。
3. **并发模型割裂**:Foundation 用 GCD dispatch,业务用 `@MainActor`,中间 `DispatchQueue.main.async` 容易踩 actor 隔离漏洞,Swift 6 严格并发下一堆警告。

async API 一次解决:

```swift
// ✅ async
let (data, response) = try await URLSession.shared.data(from: url)
```

错误通过 `throws` 传播,取消跟随 Task 结构化并发自动传播,actor 隔离编译期检查。**这是 2026 年默认范式**。

### 1.2 网络层在 App 架构里的位置

一个生产级 App 的网络层至少分四层:

```
View / ViewModel
   ↓ 调用业务 API
Repository (NoteRepository, AuthRepository...)
   ↓ 拼业务请求
APIClient (拦截器 / 重试 / 鉴权头注入)
   ↓ 发原始请求
URLSession
   ↓
TLS / TCP / DNS
```

很多教程直接 `URLSession.shared.data(...)` 撒到 View 里,小项目能跑,**中型项目第一次要换 base URL / 加 token 刷新 / 加 metrics 上报时就会重写一遍**。这一篇要给出能扛到中型项目的最小骨架。

---

## 二、Apple 平台心智

### 2.1 核心 API

| API | framework | 角色 |
| --- | --- | --- |
| `URLSession` | Foundation | 会话,持有 config 与连接池 |
| `URLSessionConfiguration` | Foundation | 配置(超时、缓存、headers、HTTP/2、TLS) |
| `URLRequest` | Foundation | 单次请求 |
| `URLResponse` / `HTTPURLResponse` | Foundation | 响应元数据 |
| `URLError` | Foundation | 错误模型(枚举 `URLError.Code`) |
| `JSONDecoder` / `JSONEncoder` | Foundation | JSON 解析 |
| `Codable` | Swift stdlib | 序列化协议 |
| `URLSession.bytes(for:)` | Foundation | 流式响应,AsyncSequence |

### 2.2 三种 async 入口

```swift
// 1. 整个 body 一次性 await(< 几 MB 用)
let (data, response) = try await session.data(for: request)

// 2. 流式 byte sequence(大文件 / SSE / 流式 LLM)
let (asyncBytes, response) = try await session.bytes(for: request)
for try await line in asyncBytes.lines { /* ... */ }

// 3. 上传(支持 InputStream / Data)
let (data, response) = try await session.upload(for: request, from: bodyData)
```

`bytes(for:)` 返回的 `AsyncSequence` 可以按行 / 按字节迭代,这是 SSE(server-sent events) / 流式 LLM 输出的关键。

### 2.3 取消与 Task 结构化并发

```swift
let task = Task {
    let (data, _) = try await session.data(for: request)
    return try decode(data)
}
// 用户离开页面
task.cancel()
```

`URLSession` async API 会**监听 Task 的取消信号**,Task cancel 后 URL 请求会立刻被 abort,抛 `URLError(.cancelled)`。这是 Task 结构化并发的承诺,**不用再手动持有 `URLSessionDataTask` 调 `cancel()`**。

SwiftUI 里的标准做法:

```swift
.task(id: searchKeyword) {
    do {
        results = try await api.search(searchKeyword)
    } catch is CancellationError { /* 切换关键词,正常 */ }
    catch { /* 真错误 */ }
}
```

`.task(id:)` 在 id 变化时自动 cancel 旧 task,把节流 / 重新发请求都用 SwiftUI 原生 modifier 搞定。

### 2.4 隔离域

- `URLSession.shared.data(for:)` 是 **nonisolated** 的,可以在任何 actor 调用。
- 返回的 `Data` 是 value type,本身 Sendable,可以跨 actor 返回。
- `JSONDecoder().decode(...)` 也是 nonisolated。

唯一要小心:**把结果回写到 `@Observable` 视图模型必须在 `@MainActor`**。最简单方式:模型类标 `@MainActor`,或者写回时 `await MainActor.run { ... }`。

---

## 三、工程实现

### 3.1 错误模型

```swift
// File: Network/Core/APIError.swift

import Foundation

// MARK: - 网络错误统一收口
enum APIError: Error, Sendable {
    case transport(URLError)        // 网络层(超时 / 无网 / TLS 失败)
    case decoding(DecodingError)    // JSON 不对
    case server(status: Int, body: Data?)  // 4xx / 5xx
    case cancelled
    case unauthorized               // 401 单独区分,触发刷新 token
    case unknown(Error)
}

extension APIError {
    /// 是否可以重试(transient 错误)
    var isRetryable: Bool {
        switch self {
        case .transport(let e):
            return [.timedOut, .networkConnectionLost, .notConnectedToInternet,
                    .dnsLookupFailed].contains(e.code)
        case .server(let s, _):
            return (500...599).contains(s)
        default:
            return false
        }
    }
}
```

错误类型 enum 化,**比直接抛 `URLError` 好用得多**——业务层只关心「是不是 401」「能不能重试」,不关心传输细节。

### 3.2 拦截器(Adapter)模式

```swift
// File: Network/Core/RequestInterceptor.swift

import Foundation

// MARK: - 拦截器协议
protocol RequestInterceptor: Sendable {
    /// 请求前改写(注 header / 签名)
    func adapt(_ request: URLRequest) async throws -> URLRequest
    /// 响应后判定是否重试,返回 nil 表示不重试
    func retry(_ error: APIError, request: URLRequest, attempt: Int) async -> RetryDecision?
}

enum RetryDecision: Sendable {
    case retry
    case retryAfter(Duration)
}

// MARK: - 鉴权拦截器
struct AuthInterceptor: RequestInterceptor {
    let tokenProvider: @Sendable () async -> String?
    let refresher: @Sendable () async throws -> Void

    func adapt(_ request: URLRequest) async throws -> URLRequest {
        var req = request
        if let token = await tokenProvider() {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return req
    }

    func retry(_ error: APIError, request: URLRequest, attempt: Int) async -> RetryDecision? {
        guard case .unauthorized = error, attempt == 0 else { return nil }
        do { try await refresher(); return .retry } catch { return nil }
    }
}

// MARK: - 重试拦截器(指数退避)
struct RetryInterceptor: RequestInterceptor {
    let maxAttempts: Int
    func adapt(_ request: URLRequest) async throws -> URLRequest { request }
    func retry(_ error: APIError, request: URLRequest, attempt: Int) async -> RetryDecision? {
        guard error.isRetryable, attempt < maxAttempts else { return nil }
        // 指数退避 + jitter:0.5s, 1s, 2s ...
        let backoff = pow(2.0, Double(attempt)) * 0.5
        let jitter = Double.random(in: 0...0.2)
        return .retryAfter(.milliseconds(Int((backoff + jitter) * 1000)))
    }
}
```

拦截器是网络层心智的核心——**鉴权 / 重试 / 日志 / metrics 全部以 interceptor 形式独立**,APIClient 不知道也不需要知道有没有 token,有没有重试策略。

### 3.3 APIClient 主体

```swift
// File: Network/Core/APIClient.swift

import Foundation
import OSLog

// MARK: - 终端协议
protocol APIEndpoint {
    associatedtype Response: Decodable & Sendable
    var path: String { get }
    var method: String { get }
    var query: [URLQueryItem] { get }
    var body: Data? { get }
}
extension APIEndpoint {
    var method: String { "GET" }
    var query: [URLQueryItem] { [] }
    var body: Data? { nil }
}

// MARK: - 客户端
actor APIClient {
    private let baseURL: URL
    private let session: URLSession
    private let decoder: JSONDecoder
    private let interceptors: [any RequestInterceptor]
    private let log = Logger(subsystem: "com.example.NotesIsland", category: "api")

    init(baseURL: URL,
         interceptors: [any RequestInterceptor] = [],
         configuration: URLSessionConfiguration = .default) {
        configuration.waitsForConnectivity = true
        configuration.timeoutIntervalForRequest = 20
        self.baseURL = baseURL
        self.session = URLSession(configuration: configuration)
        self.interceptors = interceptors

        let dec = JSONDecoder()
        dec.keyDecodingStrategy = .convertFromSnakeCase
        dec.dateDecodingStrategy = .iso8601
        self.decoder = dec
    }

    // MARK: - 发送入口
    func send<E: APIEndpoint>(_ endpoint: E) async throws -> E.Response {
        let baseRequest = try buildRequest(endpoint)
        let (data, _) = try await performWithRetry(baseRequest, attempt: 0)
        do { return try decoder.decode(E.Response.self, from: data) }
        catch let e as DecodingError { throw APIError.decoding(e) }
    }

    // MARK: - 真正打 URLSession
    private func performWithRetry(_ original: URLRequest, attempt: Int) async throws -> (Data, HTTPURLResponse) {
        var request = original
        for ic in interceptors { request = try await ic.adapt(request) }

        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else { throw APIError.unknown(URLError(.badServerResponse)) }
            switch http.statusCode {
            case 200..<300:                return (data, http)
            case 401:                      throw APIError.unauthorized
            case let s where s >= 400:     throw APIError.server(status: s, body: data)
            default:                       return (data, http)
            }
        } catch let urlErr as URLError where urlErr.code == .cancelled {
            throw APIError.cancelled
        } catch let urlErr as URLError {
            try Task.checkCancellation()
            return try await maybeRetry(.transport(urlErr), original: original, attempt: attempt)
        } catch let api as APIError {
            try Task.checkCancellation()
            return try await maybeRetry(api, original: original, attempt: attempt)
        }
    }

    private func maybeRetry(_ error: APIError, original: URLRequest, attempt: Int)
        async throws -> (Data, HTTPURLResponse) {
        for ic in interceptors {
            if let decision = await ic.retry(error, request: original, attempt: attempt) {
                if case .retryAfter(let dur) = decision {
                    try await Task.sleep(for: dur)
                }
                log.notice("retrying attempt=\(attempt + 1) reason=\(String(describing: error))")
                return try await performWithRetry(original, attempt: attempt + 1)
            }
        }
        throw error
    }

    // MARK: - 拼 URLRequest
    private func buildRequest<E: APIEndpoint>(_ endpoint: E) throws -> URLRequest {
        var components = URLComponents(url: baseURL.appendingPathComponent(endpoint.path),
                                       resolvingAgainstBaseURL: false)
        components?.queryItems = endpoint.query.isEmpty ? nil : endpoint.query
        guard let url = components?.url else { throw URLError(.badURL) }
        var req = URLRequest(url: url)
        req.httpMethod = endpoint.method
        req.httpBody = endpoint.body
        if endpoint.body != nil { req.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        return req
    }
}
```

设计要点:

- **`APIClient` 是 `actor`**——避免重入 / 多线程发请求时拦截器状态错乱,actor 隔离把序列化交给编译器。
- **`URLSession` 不用 `.shared`**——`.shared` 不能改超时、不能注入 delegate,自己 new 一个独立 session,在 APIClient 内持有。
- **拦截器是 `[any RequestInterceptor]`**——顺序执行,鉴权放第一个、重试放最后。
- **`waitsForConnectivity = true`** 是 2026 年的默认推荐——网络暂时断开时 URLSession 自己挂起请求等连接恢复(最多到 `timeoutIntervalForResource`),不立即失败。

### 3.4 Endpoint 与业务调用

```swift
// File: Network/Endpoints/NoteEndpoints.swift

import Foundation

struct FetchNotesEndpoint: APIEndpoint {
    struct Response: Decodable, Sendable {
        let notes: [RemoteNote]
    }
    let path = "/v1/notes"
    let after: Date?
    var query: [URLQueryItem] {
        after.map { [URLQueryItem(name: "after", value: ISO8601DateFormatter().string(from: $0))] } ?? []
    }
}

struct RemoteNote: Decodable, Sendable {
    let id: UUID
    let title: String
    let body: String
    let updatedAt: Date
}
```

```swift
// File: Features/Sync/NoteRemoteRepository.swift

import Foundation

@MainActor
struct NoteRemoteRepository {
    let client: APIClient

    func fetchUpdates(since: Date?) async throws -> [RemoteNote] {
        let res = try await client.send(FetchNotesEndpoint(after: since))
        return res.notes
    }
}
```

调用点:

```swift
// 在 SwiftUI 视图里
.task {
    do {
        let updates = try await repo.fetchUpdates(since: lastSyncedAt)
        try await merger.merge(updates)
    } catch let error as APIError {
        // 区分错误展示
    } catch is CancellationError { /* 离开页面 */ }
    catch { /* fallback */ }
}
```

### 3.5 流式响应:URLSession.bytes

调第三方 LLM 接口经常是 SSE,边到边显示:

```swift
// File: Features/AI/SummarizationClient.swift

import Foundation

@MainActor
@Observable
final class SummarizationClient {
    var partial: String = ""

    func stream(prompt: String) async throws {
        var req = URLRequest(url: URL(string: "https://api.example.com/v1/summarize/stream")!)
        req.httpMethod = "POST"
        req.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        req.httpBody = try JSONEncoder().encode(["prompt": prompt])

        partial = ""
        let (bytes, response) = try await URLSession.shared.bytes(for: req)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else {
            throw APIError.server(status: -1, body: nil)
        }
        for try await line in bytes.lines {
            guard line.hasPrefix("data:") else { continue }
            let chunk = line.dropFirst("data:".count).trimmingCharacters(in: .whitespaces)
            if chunk == "[DONE]" { break }
            partial += chunk
        }
    }
}
```

`bytes(for:)` 返回的 `URLSession.AsyncBytes` 实现 `AsyncSequence`,有 `.lines` / `.characters` / 默认按字节迭代三种粒度。配合 `@Observable` 的 partial 字段,SwiftUI 自动逐字渲染。

---

## 四、调参与验收

### 4.1 关键参数

| 参数 | 影响 | 推荐 |
| --- | --- | --- |
| `timeoutIntervalForRequest` | 单请求最长等待 | 10-30s,LLM 流式可放 60s+ |
| `timeoutIntervalForResource` | 包括重连的总时长 | 60-120s |
| `waitsForConnectivity` | 网络断开是否等 | UI 触发请求开 true,后台立即失败的请求关 |
| `httpMaximumConnectionsPerHost` | 并发连接数 | 默认 6,密集 API 调用可调 |
| `JSONDecoder.keyDecodingStrategy` | snake → camel | `.convertFromSnakeCase` |
| `JSONDecoder.dateDecodingStrategy` | 日期格式 | `.iso8601` 最稳;非标准时间走 `.formatted` |
| 重试最大次数 | 用户感知 | 2-3 次 + 指数退避 |

### 4.2 手动验证步骤

1. **正常拉取**:启动 App → `.task` 触发 fetch → 列表渲染。
2. **离线**:开飞行模式,fetch 应抛 `.transport(.notConnectedToInternet)`,UI 显示「无网络」。
3. **断网恢复**:`waitsForConnectivity = true` 时,飞行模式开 → fetch hang → 关飞行模式后 30s 内请求自动恢复完成。
4. **取消**:`.task(id: someState)` 切换 state,旧 task 立即抛 `CancellationError`,日志里能看到 URL 中断。
5. **401 刷 token**:mock server 第一次返 401,AuthInterceptor 应拉新 token 后**自动重发**,业务层不感知。
6. **5xx 重试**:mock 返 503,RetryInterceptor 应退避后重试,N 次失败后抛给业务层。
7. **流式 SSE**:LLM 接口,UI 上的 partial 文本应一段段增长(模拟器 Network Link Conditioner 选 3G 也能看到流式效果)。
8. **Instruments Network**:打开 Network 模板,确认请求复用同一 connection(HTTP/2 多路复用),DNS / TLS 只在第一个请求时发生。

### 4.3 Combine 何时仍然胜出

`@Published` + Combine 在 2026 年的合理位置:

1. **桥接 Foundation 的回调式 API**——`NotificationCenter.publisher(for:)`、`Timer.publish`、`URLSession.dataTaskPublisher` 都是现成的 publisher,临时桥接到 async 比手写 `withCheckedContinuation` 干净。
2. **节流 / 防抖搜索框**——Combine 的 `.debounce` / `.throttle` 操作符成熟,但 iOS 18 SwiftUI 的 `.task(id:)` + `Task.sleep(for:)` 也能做。**新代码两条路都行,统一就好**。
3. **跨语言 SDK 用 RxSwift 风格**——一些老 SDK 暴露的是 publisher。

### 4.4 `@Published` vs `@Observable`

**不要为了 Combine 而 Combine**。视图状态层 2026 年默认 `@Observable`:

```swift
// ❌ 旧心智:ObservableObject + @Published
final class ViewModel: ObservableObject {
    @Published var notes: [Note] = []
}

// ✅ 新心智:@Observable
@MainActor
@Observable
final class ViewModel {
    var notes: [Note] = []
}
```

`@Observable` 是字段级追踪,视图只 invalidate 真正用了的字段;`@Published` 是整对象级触发,改任意字段所有订阅者都过一遍。**性能、心智都赢**。

桥接示例(Combine publisher → async):

```swift
let publisher = NotificationCenter.default.publisher(for: UIApplication.willResignActiveNotification)
for await _ in publisher.values {
    await saveDraft()
}
```

`.values` 是 Combine 给 publisher 加的 `AsyncSequence` 入口,让 Combine 优雅地融入 async/await,不要双向桥接,**单向从 Combine 流入 async 即可**。

---

## 五、踩坑

### 5.1 旧教程的常见误导

| 旧写法 | 改成 |
| --- | --- |
| `dataTask(with:completionHandler:)` | `try await session.data(for:)` |
| `DispatchQueue.global().async { ... DispatchQueue.main.async { ... } }` | `Task { let x = try await ...; await MainActor.run { ... } }` |
| 自己用 `SemaphoreOperation` 串行化请求 | `actor APIClient` 自带 |
| `RxSwift` / `Combine` 整链业务 | 业务用 async,Combine 留给桥接 |
| 手动 `Task.cancel()` URL 请求 | Task 结构化并发自动传 |
| `Alamofire` 重新发明拦截器 | 自己用 protocol 几十行搞定,减少依赖 |

### 5.2 严格并发下的 `Sendable` 雷区

```swift
// ❌ JSONDecoder 不是 Sendable,actor 之间共享会警告
let decoder = JSONDecoder()  // 在类型属性里
actor APIClient {
    func decode<T: Decodable>(...) { decoder.decode(...) }  // 警告
}

// ✅ 每个 actor 持有自己的 decoder
actor APIClient {
    private let decoder: JSONDecoder
    init() { self.decoder = JSONDecoder() }
}
```

`JSONDecoder` / `JSONEncoder` / `DateFormatter` 都**不是 Sendable**(内部有 NSCache、缓存的 lookup table),严格并发下不要做单例共享。每个 actor / API client 持有一份。

### 5.3 Date 解析的隐形坑

```swift
// 服务端可能给:
// "2026-05-12T10:00:00Z"        // ISO8601 + Z
// "2026-05-12T10:00:00.000Z"    // 带毫秒,默认 .iso8601 不收!
// "2026-05-12T10:00:00+08:00"   // 带时区偏移
```

`JSONDecoder.dateDecodingStrategy = .iso8601` 内部用 `ISO8601DateFormatter` 默认格式,**不带毫秒**。带毫秒要自定义:

```swift
let formatter = ISO8601DateFormatter()
formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
decoder.dateDecodingStrategy = .custom { decoder in
    let str = try decoder.singleValueContainer().decode(String.self)
    guard let date = formatter.date(from: str) else {
        throw DecodingError.dataCorruptedError(in: try decoder.singleValueContainer(),
                                               debugDescription: "Bad ISO date: \(str)")
    }
    return date
}
```

线上 99% 的「网络数据解析失败」是日期格式踩雷,**永远先 mock 一份真实响应跑一遍 decoder**。

### 5.4 取消传播必须由你触发

```swift
// ❌ 长循环不查 cancellation
for note in notes {
    try await client.send(UploadEndpoint(note))  // URLSession 自己感知 cancel,OK
    process(note)  // 但纯 CPU 工作不感知
}

// ✅ 显式 check
for note in notes {
    try Task.checkCancellation()
    try await client.send(UploadEndpoint(note))
    process(note)
}
```

URLSession 的 await 点会自动响应 cancel,但**纯 CPU 循环 / 纯本地 IO 不会自动检查**。长循环每轮加 `try Task.checkCancellation()`。

### 5.5 ATS 与 http 调试

```xml
<!-- Info.plist 临时放行 http (上架会被审核员问) -->
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoadsForLocal</key>
    <true/>  <!-- 仅 localhost,生产可接受 -->
</dict>
```

iOS 默认 ATS 强制 https。开发期调本机 mock server(`http://localhost:3000`)走 `NSAllowsArbitraryLoadsForLocal`,**不要**写 `NSAllowsArbitraryLoads = true`,这个 key 上架时审核会单独问,过审风险大。

### 5.6 不要 force unwrap response

```swift
// ❌
let (data, response) = try await session.data(for: req)
let http = response as! HTTPURLResponse  // file:// 时不是 HTTPURLResponse,crash

// ✅
guard let http = response as? HTTPURLResponse else {
    throw APIError.unknown(URLError(.badServerResponse))
}
```

`URLSession` 处理 `file://`、`data://` 这些 scheme 时返回的 response 不是 HTTPURLResponse,强转直接 crash。**别 force unwrap 任何来自系统 API 的 cast**,Swift 6 的好习惯。

### 5.7 不要 actor 包业务 ViewModel

```swift
// ❌ 把 ViewModel 写成 actor,SwiftUI 渲染需要同步访问字段
actor NoteListVM {
    var notes: [Note] = []
}

// SwiftUI body 里:
Text(vm.notes.first?.title ?? "")  // 编译报错,actor 字段不能同步访问
```

业务 ViewModel 用 `@MainActor + @Observable`,**只有需要排队 / 跨线程序列化资源**(API client、文件写入队列)才用 `actor`。两个概念用错位置写起来很痛苦。

### 5.8 Combine 与 async 双向桥接的坑

```swift
// ❌ 把 async 包成 Combine publisher 再 sink 回 async,绕一圈
Future { promise in
    Task { promise(.success(try await api.fetch())) }
}.sink { ... }

// ✅ 直接 await
let result = try await api.fetch()
```

新代码不要把 async 函数包回 Combine。Combine → async 用 `.values` 是合理的(老 publisher 接入新世界),**反向不要做**。

### 5.9 URLCache 与缓存策略

`URLSession` 默认带一个 `URLCache.shared`(几十 MB 磁盘 + 几 MB 内存)。响应头有 `Cache-Control`、`ETag`、`Last-Modified` 时,系统自动按 HTTP 缓存语义复用。要禁用或独立配置:

```swift
let config = URLSessionConfiguration.default
config.requestCachePolicy = .reloadIgnoringLocalCacheData  // 强制走网络
config.urlCache = URLCache(memoryCapacity: 10 * 1024 * 1024,
                            diskCapacity: 100 * 1024 * 1024,
                            directory: nil)
```

**注意 `.useProtocolCachePolicy`(默认)需要服务端给正确缓存头才生效**——如果服务端不返 `Cache-Control`,URLSession 是不会缓存的。这是很多人误会「URLSession 不缓存」的原因,其实是 server 没设。

### 5.10 网络层的测试:URLProtocol mock

不打真实网络的标准技巧:塞自己的 `URLProtocol`:

```swift
// File: Tests/Mock/MockURLProtocol.swift

final class MockURLProtocol: URLProtocol, @unchecked Sendable {
    // 测试夹具,生命周期短,我们自己 hold 锁保证安全
    nonisolated(unsafe) static var handler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        guard let handler = Self.handler else { return }
        do {
            let (response, data) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }
    override func stopLoading() {}
}

// 测试里
let config = URLSessionConfiguration.ephemeral
config.protocolClasses = [MockURLProtocol.self]
let client = APIClient(baseURL: URL(string: "https://api.test")!,
                       configuration: config)
MockURLProtocol.handler = { req in
    let resp = HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
    return (resp, #"{"notes": []}"#.data(using: .utf8)!)
}
```

之前章节强调不要 `@unchecked Sendable`,这里是测试夹具的合理例外——**测试代码本质上 sequential execute,夹具状态由测试自己保证**,而且仅用于测试 target。生产 target 永远不开。

### 5.11 上传与下载进度

要拿上传 / 下载进度,需要给 task 配 `URLSessionTaskDelegate`(iOS 15 起 async API 也支持 per-task delegate):

```swift
final class ProgressDelegate: NSObject, URLSessionTaskDelegate {
    let onProgress: @Sendable (Double) -> Void
    init(_ onProgress: @Sendable @escaping (Double) -> Void) { self.onProgress = onProgress }

    func urlSession(_ session: URLSession, task: URLSessionTask,
                    didSendBodyData bytesSent: Int64, totalBytesSent: Int64,
                    totalBytesExpectedToSend: Int64) {
        let p = Double(totalBytesSent) / Double(totalBytesExpectedToSend)
        Task { @MainActor in onProgress(p) }
    }
}

let delegate = ProgressDelegate { progress in print(progress) }
let (data, _) = try await session.upload(for: req, from: body, delegate: delegate)
```

`delegate:` 参数是 iOS 15+ 给 async API 加的桥,**比给整个 session 装 delegate 更干净**——单次请求的回调隔离在单次请求。

### 5.12 WebSocket

`URLSession` 自带 WebSocket,API 已经 async 化:

```swift
let task = session.webSocketTask(with: URL(string: "wss://chat.example.com")!)
task.resume()

Task {
    for try await message in task.messages {  // iOS 17+ AsyncSequence
        switch message {
        case .string(let s):  handleText(s)
        case .data(let d):    handleBinary(d)
        @unknown default:     break
        }
    }
}

try await task.send(.string("hello"))
task.cancel(with: .normalClosure, reason: nil)
```

`.messages` 是 iOS 17 加的 AsyncSequence 入口,旧 API `receive()` 也还在但要在循环里手动调。生产环境的 WebSocket 还要自己做心跳 (`Timer` / `Task.sleep` 定期 ping) 和断线重连;Apple 不给你 out-of-box。

### 5.13 后台 URLSession 与 BGTaskScheduler 的边界

App 退后台后,普通 URLSession 任务会被系统挂起。需要持续下载 / 上传(比如大文件备份)走 background configuration:

```swift
let config = URLSessionConfiguration.background(withIdentifier: "com.example.NotesIsland.backup")
config.isDiscretionary = true        // 让系统挑合适时机(充电 + Wi-Fi)
config.sessionSendsLaunchEvents = true  // 任务完成时拉起 App
```

后台 session 只支持 `upload / download`,**不支持 data task**——所有数据必须是文件 URL。完成回调走 App lifecycle 的 `handleEventsForBackgroundURLSession`,这一段会在 21 章后台任务展开。

### 5.14 安全:别把 token 写进日志

```swift
// ❌ Debug 时常见
print(request.allHTTPHeaderFields)  // Authorization 全打到 console

// ✅ 自己写 sanitizer
extension URLRequest {
    var sanitizedHeaders: [String: String] {
        var h = allHTTPHeaderFields ?? [:]
        if h["Authorization"] != nil { h["Authorization"] = "Bearer ***" }
        return h
    }
}
log.debug("\(request.url!.absoluteString) headers=\(request.sanitizedHeaders)")
```

iOS 的 OSLog 会写进 unified logging,**device console 谁连上线都看得到**(开发期连 Mac 用 Console.app 直接看);测试同事的 token 被 print 到日志里再被截图,这是常见的低级事故。统一 sanitize 一次,全 codebase 受益。

---

至此 NotesIsland 的四件套——UI、导航、数据、网络——都齐了。下一篇我们补 Keychain、CryptoKit 与 App Group,把凭据安全和 Widget 共享存储这块拼上。
