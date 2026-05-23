# 标准库 net/http 与路由机制

> **导读**：`net/http` 是 Go Web 生态的地基，理解它的 Handler、ServeMux、超时和中间件模型，比先背框架 API 更重要。

## 一、工程场景：不用框架也能写服务

很多团队一上来就用 Gin、Echo 或 Fiber，但这些框架底层大多仍然依赖 `net/http` 的请求模型。只要理解标准库，就能看懂：

- Handler 为什么是函数也可以是结构体。
- 中间件为什么是一层包一层。
- 请求 Context 如何感知客户端断开。
- 服务端为什么必须配置超时。
- Go 1.22 之后标准库路由能力为什么明显增强。

标准库适合内部服务、轻量 API、健康检查、管理端口、Webhook 回调等场景。即使用框架，管理端口和指标端口也经常直接用 `net/http`。

## 二、最小 HTTP 服务

```go
package main

import (
    "encoding/json"
    "log"
    "net/http"
    "time"
)

func main() {
    mux := http.NewServeMux()
    mux.HandleFunc("GET /healthz", healthz)
    mux.HandleFunc("GET /users/{id}", getUser)

    srv := &http.Server{
        Addr:              ":8080",
        Handler:           logging(mux),
        ReadHeaderTimeout: 3 * time.Second,
        ReadTimeout:       5 * time.Second,
        WriteTimeout:      10 * time.Second,
        IdleTimeout:       60 * time.Second,
    }

    log.Println("listening on :8080")
    log.Fatal(srv.ListenAndServe())
}

func healthz(w http.ResponseWriter, r *http.Request) {
    writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func getUser(w http.ResponseWriter, r *http.Request) {
    id := r.PathValue("id")
    writeJSON(w, http.StatusOK, map[string]string{
        "id":   id,
        "name": "alice",
    })
}

func writeJSON(w http.ResponseWriter, code int, v any) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(code)
    _ = json.NewEncoder(w).Encode(v)
}

func logging(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        start := time.Now()
        next.ServeHTTP(w, r)
        log.Printf("%s %s cost=%s", r.Method, r.URL.Path, time.Since(start))
    })
}
```

Go 1.22 开始，`ServeMux` 支持方法和路径参数，例如：

```go
mux.HandleFunc("GET /users/{id}", getUser)
id := r.PathValue("id")
```

这让很多轻量 API 不再必须引入第三方路由库。

## 三、Handler 接口是核心

`net/http` 的核心抽象只有一个：

```go
type Handler interface {
    ServeHTTP(ResponseWriter, *Request)
}
```

函数能当 Handler，是因为标准库提供了适配类型：

```go
type HandlerFunc func(ResponseWriter, *Request)
```

结构体也可以当 Handler，适合挂依赖：

```go
type UserHandler struct {
    repo UserRepo
}

func (h *UserHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
    id := r.PathValue("id")
    user, err := h.repo.Find(r.Context(), id)
    if err != nil {
        http.Error(w, "not found", http.StatusNotFound)
        return
    }
    writeJSON(w, http.StatusOK, user)
}
```

工程上不建议在 Handler 里直接写大量业务逻辑。Handler 更适合作为协议层：解析请求、调用 service、转换响应。

## 四、中间件：包裹 Handler

标准库没有特殊的中间件类型。中间件本质就是：

```go
func Middleware(next http.Handler) http.Handler
```

示例：请求 ID、认证、日志组合。

```go
type contextKey string

const requestIDKey contextKey = "request_id"

func requestID(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        rid := r.Header.Get("X-Request-ID")
        if rid == "" {
            rid = time.Now().Format("20060102150405.000000000")
        }
        ctx := context.WithValue(r.Context(), requestIDKey, rid)
        w.Header().Set("X-Request-ID", rid)
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}

func auth(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        if r.Header.Get("Authorization") != "Bearer secret" {
            http.Error(w, "unauthorized", http.StatusUnauthorized)
            return
        }
        next.ServeHTTP(w, r)
    })
}

func chain(h http.Handler, middlewares ...func(http.Handler) http.Handler) http.Handler {
    for i := len(middlewares) - 1; i >= 0; i-- {
        h = middlewares[i](h)
    }
    return h
}
```

使用：

```go
srv.Handler = chain(mux, requestID, auth, logging)
```

中间件顺序很重要。通常是恢复 panic、请求 ID、日志、限流、鉴权、业务 Handler。

## 五、请求 Context 与客户端断开

每个 `*http.Request` 都带有 Context：

```go
ctx := r.Context()
```

当客户端断开连接、HTTP/2 请求取消或 Handler 返回时，这个 Context 会被取消。下游数据库、RPC、HTTP 调用应该继续传递它。

```go
func slowHandler(w http.ResponseWriter, r *http.Request) {
    select {
    case <-time.After(2 * time.Second):
        _, _ = w.Write([]byte("done"))
    case <-r.Context().Done():
        log.Println("request canceled:", r.Context().Err())
    }
}
```

不要在 Handler 里无脑创建 `context.Background()`，否则会切断取消链路。

## 六、ResponseWriter 的几个细节

### 1. Header 要在 WriteHeader 前设置

```go
w.Header().Set("Content-Type", "application/json")
w.WriteHeader(http.StatusCreated)
```

一旦调用 `WriteHeader` 或第一次 `Write`，响应头就基本确定了。

### 2. 默认状态码是 200

如果直接 `w.Write(...)`，标准库会隐式发送 `200 OK`。

### 3. 不要在多个 goroutine 里并发写 ResponseWriter

`ResponseWriter` 不是设计给并发写的。需要流式响应时，也要谨慎控制写入顺序和 flush。

```go
if f, ok := w.(http.Flusher); ok {
    f.Flush()
}
```

## 七、服务端超时必须配置

不要在生产中直接使用：

```go
http.ListenAndServe(":8080", nil)
```

它没有给服务端设置明确超时，容易被慢连接拖住资源。更推荐显式创建 `http.Server`：

```go
srv := &http.Server{
    Addr:              ":8080",
    Handler:           mux,
    ReadHeaderTimeout: 3 * time.Second,
    ReadTimeout:       10 * time.Second,
    WriteTimeout:      10 * time.Second,
    IdleTimeout:       60 * time.Second,
    MaxHeaderBytes:    1 << 20,
}
```

对公网服务来说，`ReadHeaderTimeout` 尤其重要，可以降低慢速请求攻击的影响。

## 八、优雅关闭

服务发布、容器重启或收到 SIGTERM 时，应该停止接收新请求，并等待正在处理的请求结束。

```go
func run() error {
    mux := http.NewServeMux()
    mux.HandleFunc("GET /healthz", healthz)

    srv := &http.Server{
        Addr:              ":8080",
        Handler:           mux,
        ReadHeaderTimeout: 3 * time.Second,
    }

    errCh := make(chan error, 1)
    go func() {
        errCh <- srv.ListenAndServe()
    }()

    sigCh := make(chan os.Signal, 1)
    signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

    select {
    case err := <-errCh:
        if err != nil && err != http.ErrServerClosed {
            return err
        }
    case <-sigCh:
        ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
        defer cancel()
        return srv.Shutdown(ctx)
    }
    return nil
}
```

需要的 import：

```go
import (
    "context"
    "os"
    "os/signal"
    "syscall"
)
```

## 九、关键坑位

### 1. 默认 ServeMux 的全局状态

`http.HandleFunc` 注册到全局 `DefaultServeMux`。库代码里不要随便注册全局路由，容易和其他包冲突。业务服务更推荐 `http.NewServeMux()`。

### 2. 路由匹配版本差异

Go 1.22 前的 `ServeMux` 不支持 `"GET /users/{id}"` 这种写法。如果项目还跑在旧版本，需要第三方路由库，或者自己解析路径。

### 3. Handler 内共享状态要加锁

每个请求会并发执行 Handler。如果 Handler 结构体里有可变字段，必须加锁或用并发安全结构。

### 4. 读取 Body 后要考虑大小限制

不要直接对外部请求 `io.ReadAll(r.Body)`。大请求体会耗尽内存。可用：

```go
r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
```

### 5. 客户端也要设置超时

服务端调用其他 HTTP 服务时，不要长期使用默认无超时的 client。

```go
client := &http.Client{Timeout: 2 * time.Second}
```

更复杂的场景应配置 transport 的连接池和 dial timeout。

## 十、生产判断

什么时候只用标准库？

- 路由简单，API 数量不多。
- 内部服务、管理端口、健康检查、指标暴露。
- 团队希望减少框架依赖。
- 需要完全理解和控制 HTTP 行为。

什么时候引入框架？

- 需要大量路由分组、参数绑定、校验、统一错误处理。
- 团队已有成熟框架规范。
- 业务更关注快速开发而不是底层控制。

无论用不用框架，`http.Server` 的超时、Context 传播、优雅关闭和 Handler 并发安全都绕不开。

## 十一、总结

`net/http` 的设计非常小：Handler 处理请求，ServeMux 分发路由，中间件包裹 Handler，Request Context 管理生命周期。掌握这些机制后，使用 Gin 等框架也会更清楚它们到底帮你封装了什么。生产服务不要停留在 `ListenAndServe` 的 demo 写法，必须补齐超时、限流、日志、鉴权和优雅关闭。
