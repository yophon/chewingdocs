# Context：控制超时与上下文取消

> **导读**：Context 不是“传参数的袋子”，而是 Go 服务里控制请求生命周期、超时、取消和链路元信息的统一协议。

## 一、工程场景：一次请求背后的退出信号

在真实后端服务里，一个 HTTP 请求通常不会只做一件事。它可能会查数据库、调库存服务、写审计日志、请求第三方接口。客户端一旦断开连接，或者网关规定 800ms 内必须返回，后面的工作就没有继续执行的价值了。

如果没有 `context.Context`，这些后台 goroutine 可能还在傻等：

- 数据库查询已经没必要了，但还占着连接。
- RPC 调用已经没人要结果了，但还在重试。
- worker 卡在 channel 或网络 IO 上，最终形成 goroutine 泄漏。
- 上游超时了，下游仍然继续消耗资源，导致雪崩。

Context 的核心价值就是把“这件事还要不要继续做”变成一个可以向下传递的信号。

## 二、Context 的基本模型

Context 是一棵树。父 Context 被取消时，所有子 Context 都会收到取消信号。

常见创建方式有四种：

```go
ctx := context.Background()

ctx, cancel := context.WithCancel(ctx)
defer cancel()

ctx, cancel = context.WithTimeout(ctx, 2*time.Second)
defer cancel()

ctx = context.WithValue(ctx, requestIDKey{}, "req-123")
```

它们分别解决不同问题：

- `Background`：根节点，通常在 `main`、测试、初始化任务中使用。
- `WithCancel`：手动取消，例如一个任务失败后取消其他任务。
- `WithTimeout` / `WithDeadline`：设置最大耗时。
- `WithValue`：传递请求级元信息，例如 request id、trace id、租户 id。

注意：`cancel` 不是可选项。即使请求自然结束，也应该调用 `cancel()` 释放计时器和父子关系上的资源。

## 三、可运行示例：带超时的 HTTP 调用

下面的例子模拟一个业务 Handler，它调用一个慢接口。如果整体超过 800ms，就停止等待并返回超时。

```go
package main

import (
    "context"
    "encoding/json"
    "errors"
    "fmt"
    "log"
    "net/http"
    "time"
)

type response struct {
    RequestID string `json:"request_id"`
    Message   string `json:"message"`
}

type requestIDKey struct{}

func main() {
    mux := http.NewServeMux()
    mux.HandleFunc("/api/profile", profileHandler)
    mux.HandleFunc("/slow-upstream", slowUpstreamHandler)

    srv := &http.Server{
        Addr:              ":8080",
        Handler:           mux,
        ReadHeaderTimeout: 3 * time.Second,
    }

    log.Println("listening on :8080")
    log.Fatal(srv.ListenAndServe())
}

func profileHandler(w http.ResponseWriter, r *http.Request) {
    ctx := r.Context()

    requestID := r.Header.Get("X-Request-ID")
    if requestID == "" {
        requestID = fmt.Sprintf("req-%d", time.Now().UnixNano())
    }
    ctx = context.WithValue(ctx, requestIDKey{}, requestID)

    ctx, cancel := context.WithTimeout(ctx, 800*time.Millisecond)
    defer cancel()

    msg, err := callUpstream(ctx)
    if err != nil {
        status := http.StatusInternalServerError
        if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
            status = http.StatusGatewayTimeout
        }
        http.Error(w, err.Error(), status)
        return
    }

    w.Header().Set("Content-Type", "application/json")
    _ = json.NewEncoder(w).Encode(response{
        RequestID: requestID,
        Message:   msg,
    })
}

func callUpstream(ctx context.Context) (string, error) {
    req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://localhost:8080/slow-upstream", nil)
    if err != nil {
        return "", err
    }

    resp, err := http.DefaultClient.Do(req)
    if err != nil {
        return "", err
    }
    defer resp.Body.Close()

    if resp.StatusCode >= 500 {
        return "", fmt.Errorf("upstream status: %d", resp.StatusCode)
    }
    return "profile loaded", nil
}

func slowUpstreamHandler(w http.ResponseWriter, r *http.Request) {
    select {
    case <-time.After(1500 * time.Millisecond):
        _, _ = w.Write([]byte("ok"))
    case <-r.Context().Done():
        log.Println("client canceled slow upstream:", r.Context().Err())
    }
}
```

运行：

```bash
go run main.go
curl -v http://localhost:8080/api/profile
```

这个请求会因为 800ms 超时而失败，同时传给 `NewRequestWithContext` 的 Context 会取消 HTTP 客户端请求。

## 四、在 goroutine 中监听取消

Context 本身不会杀掉 goroutine。它只会关闭 `Done()` channel。业务代码必须主动监听。

```go
func worker(ctx context.Context, jobs <-chan int, results chan<- int) {
    for {
        select {
        case <-ctx.Done():
            return
        case job, ok := <-jobs:
            if !ok {
                return
            }

            result, err := doWork(ctx, job)
            if err != nil {
                return
            }

            select {
            case results <- result:
            case <-ctx.Done():
                return
            }
        }
    }
}

func doWork(ctx context.Context, n int) (int, error) {
    select {
    case <-time.After(100 * time.Millisecond):
        return n * n, nil
    case <-ctx.Done():
        return 0, ctx.Err()
    }
}
```

这里有两个关键点：

- 收任务时监听 `ctx.Done()`，避免一直等 job。
- 发结果时也监听 `ctx.Done()`，避免下游不收导致阻塞。

## 五、WithValue 应该怎么用

`WithValue` 适合传递请求范围内的元信息，不适合传递业务依赖。

推荐用法：

```go
type traceIDKey struct{}

func withTraceID(ctx context.Context, traceID string) context.Context {
    return context.WithValue(ctx, traceIDKey{}, traceID)
}

func traceIDFrom(ctx context.Context) string {
    v, _ := ctx.Value(traceIDKey{}).(string)
    return v
}
```

不要这样做：

```go
ctx = context.WithValue(ctx, "db", db)
ctx = context.WithValue(ctx, "logger", logger)
ctx = context.WithValue(ctx, "user", user)
```

原因很简单：Context 的值没有编译期约束，滥用之后函数依赖会变得隐藏，测试和重构都会变难。

## 六、关键坑位

### 1. 忘记调用 cancel

```go
ctx, cancel := context.WithTimeout(parent, time.Second)
defer cancel()
```

只要创建了带 cancel 的 Context，就应该在当前函数负责释放。不要觉得“反正会超时”就省略。

### 2. 把 Context 存进结构体

Context 应该作为函数的第一个参数传入：

```go
func (s *Service) GetUser(ctx context.Context, id int64) (*User, error)
```

不要长期挂在 struct 上。请求生命周期和对象生命周期不是一回事。

### 3. 使用 Background 切断取消链路

在业务函数里随手写 `context.Background()` 会切断上游取消信号。除非你明确要启动脱离请求生命周期的后台任务，否则应该继续使用传入的 `ctx`。

### 4. 只在最外层设置超时

整体超时很重要，但下游也要有自己的预算。例如一个请求总预算 1s，数据库查询不能无上限地吃满全部时间。

```go
dbCtx, cancel := context.WithTimeout(ctx, 200*time.Millisecond)
defer cancel()
```

### 5. 不区分取消原因

`ctx.Err()` 常见两个值：

- `context.Canceled`：主动取消，常见于客户端断开。
- `context.DeadlineExceeded`：超过 deadline。

日志和指标里最好区分它们，否则排障时无法判断是用户取消还是系统慢。

## 七、生产判断

Context 的生产实践可以归纳成几条规则：

- 对外入口必须使用请求自带的 Context，例如 `r.Context()`。
- 所有可能阻塞的调用都应该接收 Context：DB、RPC、HTTP、消息队列、长循环。
- 超时预算要从上游向下游递减，不要每一层都重新给一个很大的 timeout。
- Context 只传取消信号和请求元信息，不传可选参数、配置项和大型对象。
- 关键错误要用 `errors.Is(err, context.DeadlineExceeded)` 判断，不要只靠字符串。

在微服务里，Context 是一种资源治理机制。它不保证业务变快，但它能保证当业务不值得继续执行时，系统尽快停止浪费。

## 八、总结

Context 解决的是请求生命周期管理问题：谁发起、何时取消、最长能跑多久、请求级元信息如何向下传递。写 Go 服务时，只要代码可能阻塞，就应该让它接收 `context.Context`，并在 channel、网络、数据库和循环里主动监听取消信号。把 Context 用好，才能避免超时失控、goroutine 泄漏和下游资源被无效请求拖垮。
