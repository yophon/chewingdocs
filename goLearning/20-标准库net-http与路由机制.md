# 标准库 net/http 与路由机制

> **导读**：Go 被称为云时代的 C 语言，它的标准库原生自带了极其强悍的 HTTP 服务器，不依赖 Nginx/Apache 也能扛起高并发。

## 一、Hello Web
只需几行代码就能起一个高性能 HTTP 服务。

```go
package main

import (
    "fmt"
    "net/http"
)

// 处理器函数
func helloHandler(w http.ResponseWriter, r *http.Request) {
    fmt.Fprintf(w, "Hello, you requested: %s\n", r.URL.Path)
}

func main() {
    // 注册路由
    http.HandleFunc("/", helloHandler)
    
    fmt.Println("Server starting on :8080...")
    // 启动服务，监听端口。内部会为每一个进来的请求自动开一个 goroutine 处理
    if err := http.ListenAndServe(":8080", nil); err != nil {
        panic(err)
    }
}
```
> **核心机制**：`net/http` 会为**每一个传入的 TCP 连接开启一个独立的 Goroutine** 去处理请求。这就是为什么在 Go 的 Handler 里做阻塞的数据库查询，不会卡住其他用户的请求！

## 二、`http.Handler` 接口
Go Web 的灵魂接口。任何实现了 `ServeHTTP(w http.ResponseWriter, r *http.Request)` 方法的类型，都可以作为一个 HTTP 处理器。

```go
type countHandler struct {
    count int
}
func (c *countHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
    c.count++
    fmt.Fprintf(w, "Visitor count: %d", c.count)
}
// http.Handle("/count", &countHandler{})
```

## 三、原生路由的痛点
标准库 `ServeMux` 路由（在 Go 1.22 之前）比较简陋：
- 不支持 RESTful 参数提取（如 `/users/:id`）。
- 路由匹配规则不够灵活。
- 中间件机制编写起来比较嵌套。

正因为这些痛点，社区诞生了 Gin、Echo、Fiber 等流行的 Web 框架。但它们底层无一例外都是建立在 `net/http` 之上。
