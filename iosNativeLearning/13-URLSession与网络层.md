# URLSession 与网络层

iOS 上的网络从 `NSURLConnection`(2003)→ `NSURLSession`(2013)→ `URLSession` async API(2021)→ Swift 6 严格并发(2024)演进了二十年。2026 年新代码的姿势已经稳定:**`URLSession.shared.data(for:) async`、`Codable` 解析、actor 隔离的拦截器、`async/await` 写 retry**。这一篇讲透网络层架构。

> 一句话先记住:**`URLSession.data(for:) async` 替代 `dataTask` callback,网络请求变成顺序异步代码;`Codable` + `JSONDecoder` 把 JSON 自动映射到 struct;actor 包一层 `APIClient` 解决"并发请求 + 共享 token / cookie"的状态管理;Retry / 拦截 / 错误模型靠组合 async 函数实现,不再装 Alamofire 那种重量级框架。**

---

## 一、async API 替代 callback

```swift
// ❌ 旧:dataTask callback
URLSession.shared.dataTask(with: url) { data, response, error in
    if let error { return handle(error) }
    guard let data, let response = response as? HTTPURLResponse,
          (200..<300).contains(response.statusCode) else {
        return handle(...)
    }
    DispatchQueue.main.async {
        self.notes = try? JSONDecoder().decode([Note].self, from: data)
    }
}.resume()
```

```swift
// ✅ 新:async/await
func fetchNotes() async throws -> [Note] {
    let (data, response) = try await URLSession.shared.data(from: url)
    guard let http = response as? HTTPURLResponse,
          (200..<300).contains(http.statusCode) else {
        throw APIError.badStatus(response)
    }
    return try JSONDecoder().decode([Note].self, from: data)
}
```

差异不只是"少几行"——是**错误传播 / 取消传播 / 资源释放**完全免费了。`throws` 让错误顺调用栈往上走;`Task.cancel()` 会让 `await` 抛 `CancellationError`;`Task` scope 结束所有未完成请求自动取消。

`URLSession.shared.data(for:)` 接 `URLRequest`,`data(from:)` 接 `URL`。`data(for: req)` 是常用的,因为通常要加 header / body:

```swift
var req = URLRequest(url: url)
req.httpMethod = "POST"
req.setValue("application/json", forHTTPHeaderField: "Content-Type")
req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
req.httpBody = try JSONEncoder().encode(payload)

let (data, response) = try await URLSession.shared.data(for: req)
```

---

## 二、流式 API:大文件 / SSE / 长连接

```swift
let (bytes, _) = try await URLSession.shared.bytes(for: req)

for try await byte in bytes {
    // 一字节一字节处理
}

for try await line in bytes.lines {
    // 一行一行(适合 SSE)
    if line.hasPrefix("data: ") {
        let payload = String(line.dropFirst(6))
        handle(payload)
    }
}
```

`bytes(for:)` 返回 `URLSession.AsyncBytes`,实现了 `AsyncSequence`。配合 `for try await` 流式消费,适合:
- 大文件下载(边下边写磁盘,内存不爆)
- Server-Sent Events
- AI streaming response(token by token)

---

## 三、Codable + JSONDecoder

```swift
struct Note: Codable, Identifiable, Sendable {
    let id: UUID
    var title: String
    var body: String
    var createdAt: Date
    
    enum CodingKeys: String, CodingKey {
        case id, title, body
        case createdAt = "created_at"
    }
}

let decoder = JSONDecoder()
decoder.dateDecodingStrategy = .iso8601
let notes = try decoder.decode([Note].self, from: data)
```

JSON key 跟 Swift 字段命名风格不一致时:**`CodingKeys` 手动映射** 或 **`decoder.keyDecodingStrategy = .convertFromSnakeCase` 全局策略**。

```swift
let decoder = JSONDecoder()
decoder.keyDecodingStrategy = .convertFromSnakeCase   // created_at → createdAt
decoder.dateDecodingStrategy = .iso8601
```

`Date` 默认是 reference date 的 TimeInterval(数字),后端常用 ISO 8601 / 时间戳 / 自定义格式,要指定 strategy:

```swift
decoder.dateDecodingStrategy = .iso8601                      // ISO 字符串
decoder.dateDecodingStrategy = .secondsSince1970              // Unix 秒
decoder.dateDecodingStrategy = .millisecondsSince1970         // Unix 毫秒
decoder.dateDecodingStrategy = .formatted(customFormatter)    // 自定义
```

可选字段:**Swift `?` 标记**就能容忍缺失:

```swift
struct Note: Codable {
    let id: UUID
    let title: String
    let body: String?      // 可能没有
}
```

---

## 四、错误模型

```swift
enum APIError: Error, LocalizedError {
    case invalidURL
    case badStatus(code: Int, data: Data)
    case decode(any Error)
    case offline
    case unauthorized
    case timeout
    
    var errorDescription: String? {
        switch self {
        case .invalidURL: return "URL 不合法"
        case .badStatus(let code, _): return "服务器错误(\(code))"
        case .decode: return "数据格式错误"
        case .offline: return "网络未连接"
        case .unauthorized: return "未登录"
        case .timeout: return "请求超时"
        }
    }
}
```

`URLError` 是系统抛的,常见 code:

```swift
do {
    let data = try await URLSession.shared.data(for: req).0
} catch let urlError as URLError {
    switch urlError.code {
    case .notConnectedToInternet: throw APIError.offline
    case .timedOut: throw APIError.timeout
    case .cancelled: throw CancellationError()
    default: throw urlError
    }
}
```

业务错误从 HTTP status / response body 提取:

```swift
let (data, response) = try await URLSession.shared.data(for: req)
guard let http = response as? HTTPURLResponse else { throw APIError.invalidURL }

switch http.statusCode {
case 200..<300:
    do {
        return try decoder.decode(T.self, from: data)
    } catch {
        throw APIError.decode(error)
    }
case 401:
    throw APIError.unauthorized
case 400..<500:
    throw APIError.badStatus(code: http.statusCode, data: data)
case 500..<600:
    throw APIError.badStatus(code: http.statusCode, data: data)
default:
    throw APIError.badStatus(code: http.statusCode, data: data)
}
```

---

## 五、actor 包 APIClient

并发请求 + 共享 token / cookie 状态,用 actor 隔离:

```swift
actor APIClient {
    private let session: URLSession
    private var authToken: String?
    private let baseURL: URL
    
    init(baseURL: URL) {
        self.baseURL = baseURL
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 15
        config.timeoutIntervalForResource = 30
        self.session = URLSession(configuration: config)
    }
    
    func setToken(_ token: String?) {
        self.authToken = token
    }
    
    func get<T: Decodable>(_ path: String) async throws -> T {
        var req = URLRequest(url: baseURL.appending(path: path))
        if let token = authToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        let (data, response) = try await session.data(for: req)
        try validateResponse(response, data: data)
        return try JSONDecoder.api.decode(T.self, from: data)
    }
    
    private func validateResponse(_ response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidURL }
        switch http.statusCode {
        case 200..<300: return
        case 401: throw APIError.unauthorized
        default: throw APIError.badStatus(code: http.statusCode, data: data)
        }
    }
}

extension JSONDecoder {
    static let api: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        d.dateDecodingStrategy = .iso8601
        return d
    }()
}
```

actor 解决:
- token 改动 + 请求发起的并发不互相打架
- 同一 client 实例多处使用安全
- 编译期保证

---

## 六、Retry 与拦截器

不用第三方框架,Retry 几行代码:

```swift
extension APIClient {
    func retry<T>(_ attempts: Int = 3, _ block: () async throws -> T) async throws -> T {
        var lastError: (any Error)?
        for attempt in 0..<attempts {
            do {
                return try await block()
            } catch let error as APIError where error.shouldRetry {
                lastError = error
                let delay = pow(2.0, Double(attempt)) * 0.5    // 指数退避:0.5/1/2s
                try await Task.sleep(for: .seconds(delay))
                continue
            } catch {
                throw error
            }
        }
        throw lastError ?? APIError.timeout
    }
}

extension APIError {
    var shouldRetry: Bool {
        switch self {
        case .timeout: return true
        case .badStatus(let code, _) where code >= 500: return true
        default: return false
        }
    }
}

// 使用
let notes: [Note] = try await client.retry(3) {
    try await client.get("/notes")
}
```

拦截器(adapter)模式——在请求发起前 / 收到响应后做事:

```swift
extension APIClient {
    private func makeRequest(path: String, method: String) async throws -> URLRequest {
        var req = URLRequest(url: baseURL.appending(path: path))
        req.httpMethod = method
        
        // 通用 header
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.setValue("NotesIsland/\(version)", forHTTPHeaderField: "User-Agent")
        
        // Auth
        if let token = authToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        // Trace
        req.setValue(UUID().uuidString, forHTTPHeaderField: "X-Request-ID")
        
        return req
    }
}
```

401 自动 refresh token + 重发:

```swift
private func request<T: Decodable>(_ req: URLRequest) async throws -> T {
    do {
        return try await execute(req)
    } catch APIError.unauthorized {
        try await refreshToken()
        return try await execute(req)        // 用新 token 再来一次
    }
}
```

---

## 七、上传 / 下载

```swift
// 上传
let (data, response) = try await URLSession.shared.upload(
    for: req,
    from: fileData
)

// 下载
let (fileURL, response) = try await URLSession.shared.download(for: req)
// fileURL 是临时文件,你应该立刻移到 documents
let dest = documentsDir.appending(component: "downloaded.zip")
try FileManager.default.moveItem(at: fileURL, to: dest)
```

`download(for:)` 把数据流式写到磁盘临时文件,**不会**把整个内容装进内存——适合大文件。

Multipart 表单上传要自己组 boundary,但通常 Apple 后端不强制 multipart,JSON body 解决 90% 场景。

---

## 八、Combine 何时仍胜出

Combine 在 2026 年 SwiftUI 状态层已经被 `@Observable` 替代(06 篇讲过)。**网络层完全 async,几乎不用 Combine**。

Combine 唯一剩下的位置:**桥接 Notification / Timer / KVO 等老 API**:

```swift
// NotificationCenter 转 async sequence
let stream = NotificationCenter.default.notifications(named: .didEnterBackground)
for await _ in stream {
    await store.persist()
}

// Timer
let timer = Timer.publish(every: 1, on: .main, in: .common)
    .autoconnect()
    .values    // → AsyncSequence
for await tick in timer {
    update()
}
```

`Foundation` 在 iOS 15+ 给绝大多数 Combine publisher 加了 `.values` 属性,转成 AsyncSequence,统一到 async/await 主轴。**新代码几乎不需要写 `cancellables: Set<AnyCancellable>`**。

---

## 九、URLSession 配置

```swift
let config = URLSessionConfiguration.default

// 超时
config.timeoutIntervalForRequest = 15        // 单请求超时(等响应开始)
config.timeoutIntervalForResource = 30       // 整体超时(下载完成)

// 缓存
config.requestCachePolicy = .reloadIgnoringLocalCacheData

// HTTP/2 / HTTP/3
config.httpMaximumConnectionsPerHost = 4

// 后台 session(下载继续即使 App 退出)
let bgConfig = URLSessionConfiguration.background(withIdentifier: "com.example.download")
bgConfig.isDiscretionary = false
bgConfig.sessionSendsLaunchEvents = true

let session = URLSession(configuration: config)
```

`.background` session 让 iOS 在 App 进后台 / 被杀后继续下载,完成后唤醒 App。但 `.background` session 不能用 async API,只能用旧 delegate 模式——这是 2026 还没修的少数遗留。

---

## 十、ATS 与 HTTPS

iOS 9 起强制 HTTPS(App Transport Security)。HTTP 接口要 Info.plist 加例外:

```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSExceptionDomains</key>
    <dict>
        <key>internal.example.com</key>
        <dict>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
        </dict>
    </dict>
</dict>
```

**App Store 审核要求所有公网接口都 HTTPS**——例外只接受"内网"或"已经无法升级的老服务"。新项目应该全 HTTPS。

证书 pinning(防中间人攻击)在 ATS 之上额外加一层,通过 `URLSessionDelegate` 实现:

```swift
final class PinningDelegate: NSObject, URLSessionDelegate {
    func urlSession(_ session: URLSession,
                    didReceive challenge: URLAuthenticationChallenge) async
        -> (URLSession.AuthChallengeDisposition, URLCredential?) {
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              let serverTrust = challenge.protectionSpace.serverTrust else {
            return (.cancelAuthenticationChallenge, nil)
        }
        // 比较证书 fingerprint 与本地预埋的是否一致
        ...
    }
}
```

普通业务不需要 pinning(审核不强制),仅金融 / 医疗类必要。

---

## 十一、踩坑

1. **`dataTask` callback 还在写**——iOS 15+ 有 async API,新代码全部 `data(for:)`。
2. **`DispatchQueue.main.async { self.x = ... }` 处理响应**——`async/await` + `@MainActor` 自动切回主线程,不再需要 GCD。
3. **`JSONDecoder` 没指定 `dateDecodingStrategy`**——默认是 reference date TimeInterval,后端给字符串就崩。一律显式设。
4. **`Codable` 字段非可选,某 API 缺少导致整体 decode 失败**——把可选字段标 `?`,或者自定义 `init(from:)`。
5. **大文件 `data(for:)`**——会一次性装进内存。改 `download(for:)` 或 `bytes(for:)` 流式。
6. **`URLSession.shared` 全局共享导致跨 App 行为不一致**——简单业务用 shared OK;复杂业务自建独立 session(自己的 timeout / 缓存策略)。
7. **`Task` 内 `await` 但忘记 `try`**——`throws` 函数 await 必须 `try await`,编译报错很直接。
8. **`URLError.cancelled` 当业务错误处理**——`cancelled` 是 Task 被取消的正常信号,应该 throw `CancellationError`,UI 层忽略它,不要 show error。
9. **没把网络代码放 actor 里,直接 `@MainActor` 写**——大量 await 都把主线程让出来,但 UI 仍可能因 JSON decode 卡顿。重型 decode 放 detached task 或后台 actor。
10. **`URLSessionConfiguration.background` 用 async API**——不支持,会 fallback 到前台行为。后台传输只能 delegate 模式,这是 Apple 没来得及现代化的部分。

---

下一篇 `14-Keychain与AppGroup.md`,讲 Keychain Services API、`kSecAttrAccessible*` 访问控制、iCloud Keychain 同步、`CryptoKit` 对称 / 非对称 / 哈希、`App Group` 容器与跨 App / Widget / Extension 共享存储。
