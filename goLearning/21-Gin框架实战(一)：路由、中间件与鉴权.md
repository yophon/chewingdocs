# Gin 框架实战(一)：路由、中间件与鉴权

> **导读**：Gin 是目前 Go 语言中最流行、使用最广泛的 Web 框架，以极其强悍的性能（基于 HttpRouter）和简单的 API 著称。

## 一、Gin 快速起步
引入 Gin：`go get -u github.com/gin-gonic/gin`

```go
package main

import "github.com/gin-gonic/gin"

func main() {
    r := gin.Default() // 默认自带 Logger 和 Recovery 中间件
    
    // RESTful 路由
    r.GET("/ping", func(c *gin.Context) {
        // 自动序列化为 JSON
        c.JSON(200, gin.H{ "message": "pong" })
    })
    
    r.Run(":8080") 
}
```

## 二、参数绑定与校验 (Binding)
Gin 提供了强大的数据绑定和校验能力（基于 struct tag）。

```go
type LoginReq struct {
    User     string `json:"user" binding:"required"`      // 必填
    Password string `json:"password" binding:"required"`
}

r.POST("/login", func(c *gin.Context) {
    var req LoginReq
    // 自动将 JSON Body 绑定到结构体并校验
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(400, gin.H{"error": err.Error()})
        return
    }
    c.JSON(200, gin.H{"status": "ok"})
})
```

## 三、中间件 (Middleware)
中间件本质上也是一个 `gin.HandlerFunc`。常用于鉴权、耗时统计、跨域等。

```go
// 自定义鉴权中间件
func AuthMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        token := c.GetHeader("Authorization")
        if token != "secret" {
            c.AbortWithStatusJSON(401, gin.H{"error": "unauthorized"}) // 阻断后续调用
            return
        }
        c.Set("userID", 123) // 将解析出的数据传给下游
        c.Next() // 执行下游业务 Handler
        
        // Next() 后面的代码会在请求返回前执行
        fmt.Println("请求处理完毕")
    }
}

// 使用中间件
r.GET("/protected", AuthMiddleware(), func(c *gin.Context) {
    uid, _ := c.Get("userID")
    c.JSON(200, gin.H{"uid": uid})
})
```
