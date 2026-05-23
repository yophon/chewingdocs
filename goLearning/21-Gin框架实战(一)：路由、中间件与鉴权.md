# Gin 框架实战(一)：路由、中间件与鉴权

> **导读**：Gin 的价值不只是“写路由快”，而是用一套清晰的 Handler 和 Middleware 约定，把接口层的参数解析、鉴权、错误响应和日志串起来。

## 一、工程场景：一个后台 API 服务

假设要写一个后台用户服务，包含：

- 登录接口，返回 token。
- 查询当前用户资料，需要鉴权。
- 管理端接口，需要管理员角色。
- 每个请求要记录耗时、状态码和 request id。
- 参数错误、鉴权失败、业务错误都要返回统一 JSON。

这类场景用标准库当然能写，但当路由、参数绑定、中间件数量变多时，Gin 会更省事。

## 二、最小可运行项目

初始化：

```bash
go mod init gin-demo
go get github.com/gin-gonic/gin
```

`main.go`：

```go
package main

import (
    "net/http"
    "strings"
    "time"

    "github.com/gin-gonic/gin"
)

type LoginReq struct {
    Username string `json:"username" binding:"required,min=3"`
    Password string `json:"password" binding:"required,min=6"`
}

type User struct {
    ID   int64  `json:"id"`
    Name string `json:"name"`
    Role string `json:"role"`
}

func main() {
    r := gin.New()
    r.Use(gin.Recovery(), RequestID(), AccessLog())

    r.GET("/healthz", func(c *gin.Context) {
        c.JSON(http.StatusOK, gin.H{"status": "ok"})
    })

    r.POST("/login", login)

    api := r.Group("/api")
    api.Use(Auth())
    {
        api.GET("/me", me)

        admin := api.Group("/admin")
        admin.Use(RequireRole("admin"))
        admin.GET("/users", listUsers)
    }

    srv := &http.Server{
        Addr:              ":8080",
        Handler:           r,
        ReadHeaderTimeout: 3 * time.Second,
    }

    _ = srv.ListenAndServe()
}

func login(c *gin.Context) {
    var req LoginReq
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request", "detail": err.Error()})
        return
    }

    if req.Username != "alice" || req.Password != "secret1" {
        c.JSON(http.StatusUnauthorized, gin.H{"error": "bad credentials"})
        return
    }

    c.JSON(http.StatusOK, gin.H{"token": "user:1:admin"})
}

func me(c *gin.Context) {
    user := CurrentUser(c)
    c.JSON(http.StatusOK, user)
}

func listUsers(c *gin.Context) {
    c.JSON(http.StatusOK, []User{
        {ID: 1, Name: "alice", Role: "admin"},
        {ID: 2, Name: "bob", Role: "user"},
    })
}
```

运行后测试：

```bash
go run main.go
curl -X POST http://localhost:8080/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"secret1"}'

curl http://localhost:8080/api/me -H 'Authorization: Bearer user:1:admin'
```

## 三、路由分组：按业务边界组织

Gin 的分组适合表达接口层级：

```go
api := r.Group("/api")
api.Use(Auth())

orders := api.Group("/orders")
orders.GET("", listOrders)
orders.POST("", createOrder)
orders.GET("/:id", getOrder)
```

建议按资源分组，而不是按动作分组：

- 推荐：`GET /orders/:id`
- 不推荐：`GET /getOrder?id=1`

路径参数、查询参数、Header 常见写法：

```go
id := c.Param("id")
page := c.DefaultQuery("page", "1")
traceID := c.GetHeader("X-Request-ID")
```

Handler 里不要堆太多业务逻辑，比较清晰的分层是：

- Handler：协议转换，参数绑定，响应状态码。
- Service：业务流程。
- Repository / Client：数据库或外部服务访问。

## 四、参数绑定与校验

Gin 的 binding 能减少大量手写解析代码。

```go
type CreateOrderReq struct {
    ProductID int64 `json:"product_id" binding:"required,gt=0"`
    Count     int   `json:"count" binding:"required,gte=1,lte=100"`
}

func createOrder(c *gin.Context) {
    var req CreateOrderReq
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request", "detail": err.Error()})
        return
    }

    c.JSON(http.StatusCreated, gin.H{"id": 1001})
}
```

生产里通常会把错误响应统一封装：

```go
func Abort(c *gin.Context, code int, msg string) {
    c.AbortWithStatusJSON(code, gin.H{
        "error":      msg,
        "request_id": c.GetString("request_id"),
    })
}
```

注意不要把 validator 的原始错误直接暴露给外部用户。内部系统可以详细一些，公网 API 应该返回稳定错误码和可读提示。

## 五、中间件：请求进入业务前后的横切逻辑

中间件本质是 `gin.HandlerFunc`。它可以在 `c.Next()` 前做前置处理，也可以在 `c.Next()` 后记录结果。

```go
func RequestID() gin.HandlerFunc {
    return func(c *gin.Context) {
        rid := c.GetHeader("X-Request-ID")
        if rid == "" {
            rid = time.Now().Format("20060102150405.000000000")
        }
        c.Set("request_id", rid)
        c.Header("X-Request-ID", rid)
        c.Next()
    }
}

func AccessLog() gin.HandlerFunc {
    return func(c *gin.Context) {
        start := time.Now()
        c.Next()
        gin.DefaultWriter.Write([]byte(
            time.Now().Format(time.RFC3339) + " " +
                c.Request.Method + " " +
                c.Request.URL.Path + " " +
                time.Since(start).String() + "\n",
        ))
    }
}
```

在中间件中阻断请求要用 `Abort`：

```go
c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
return
```

调用 `Abort` 后仍然要 `return`，否则当前函数后面的代码还会继续执行。

## 六、鉴权：从 Header 到上下文

下面是一个简化版鉴权中间件。真实系统里 token 通常是 JWT、Session ID 或网关透传的用户信息。

```go
const userKey = "current_user"

func Auth() gin.HandlerFunc {
    return func(c *gin.Context) {
        header := c.GetHeader("Authorization")
        if !strings.HasPrefix(header, "Bearer ") {
            Abort(c, http.StatusUnauthorized, "missing token")
            return
        }

        token := strings.TrimPrefix(header, "Bearer ")
        user, ok := parseToken(token)
        if !ok {
            Abort(c, http.StatusUnauthorized, "invalid token")
            return
        }

        c.Set(userKey, user)
        c.Next()
    }
}

func RequireRole(role string) gin.HandlerFunc {
    return func(c *gin.Context) {
        user := CurrentUser(c)
        if user.Role != role {
            Abort(c, http.StatusForbidden, "forbidden")
            return
        }
        c.Next()
    }
}

func CurrentUser(c *gin.Context) User {
    v, exists := c.Get(userKey)
    if !exists {
        return User{}
    }
    user, _ := v.(User)
    return user
}

func parseToken(token string) (User, bool) {
    // 示例 token: user:1:admin
    parts := strings.Split(token, ":")
    if len(parts) != 3 || parts[0] != "user" {
        return User{}, false
    }
    return User{ID: 1, Name: "alice", Role: parts[2]}, true
}
```

工程上通常不要让业务 Handler 自己反复解析 token。鉴权中间件解析一次，把用户身份放入请求上下文，下游只读结果。

## 七、Context 传播：用 Request.Context

Gin 的 `*gin.Context` 和标准库 `context.Context` 不是同一个东西。访问数据库、RPC、HTTP 客户端时，应该传：

```go
ctx := c.Request.Context()
user, err := service.GetUser(ctx, id)
```

不要把 `*gin.Context` 传到 service 或 repository 层，否则业务层会被 Web 框架污染，也不利于单元测试。

## 八、关键坑位

### 1. gin.Default 不是永远合适

`gin.Default()` 自动加 Logger 和 Recovery，demo 很方便。生产里很多团队会用 `gin.New()`，自己接入结构化日志、链路追踪和恢复逻辑。

### 2. 不要在 goroutine 里直接使用 gin.Context

`gin.Context` 会被复用。如果要在 goroutine 中使用请求数据，先拷贝必要字段：

```go
rid := c.GetString("request_id")
path := c.Request.URL.Path
go func() {
    _ = rid
    _ = path
}()
```

### 3. Body 只能读一次

`ShouldBindJSON` 会读取 body。中间件如果提前读了 body，后面的 Handler 可能就读不到。需要重复读取时要主动缓存并重设 `c.Request.Body`，但这会增加内存开销。

### 4. Abort 后要 return

`Abort` 阻止后续 Handler，但不会自动停止当前函数。鉴权失败后忘记 return 是常见漏洞。

### 5. 信任代理头要谨慎

如果使用 `ClientIP()`，要正确配置可信代理。否则用户可能伪造 `X-Forwarded-For` 影响审计和限流。

## 九、生产判断

Gin 适合：

- API 数量较多，需要路由分组和中间件体系。
- 团队希望快速构建 HTTP JSON 服务。
- 已经有统一错误、日志、鉴权、限流规范。

需要克制的地方：

- 不要把 Gin 类型传遍全项目。
- 不要把中间件写成隐藏业务逻辑的地方。
- 不要依赖全局变量保存 DB、配置和客户端。
- 重要服务要显式配置 `http.Server` 的超时和优雅关闭。

框架提高的是接口层效率，不会自动解决业务分层、超时、资源治理和可观测性。

## 十、总结

Gin 的核心使用方式是：路由分组表达资源边界，中间件处理横切逻辑，Handler 做协议转换，业务层接收标准 `context.Context`。鉴权要在中间件统一完成，错误响应要统一格式，生产环境要补齐超时、日志、Recovery 和代理配置。把 Gin 限制在接口层，项目会更容易测试和维护。
