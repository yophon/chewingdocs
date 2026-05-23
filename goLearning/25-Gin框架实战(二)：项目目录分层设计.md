# Gin 框架实战(二)：项目目录分层设计

> **一句话导读**：Gin 项目的目录分层不是为了显得“架构很重”，而是为了让 HTTP、业务规则、数据库和基础设施各在各的位置上演进。

## 一、为什么 Gin 项目容易写乱

Gin 上手很快，一个 `main.go` 就能写出路由、参数绑定、数据库查询和 JSON 返回：

```go
r.POST("/users", func(c *gin.Context) {
	var req CreateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	var user User
	db.Where("email = ?", req.Email).First(&user)
	c.JSON(200, user)
})
```

这种写法在 demo 里没问题，但项目一旦增长，会出现几个典型问题：

- Handler 里混着参数校验、权限判断、事务、缓存、数据库和响应组装。
- Service 无法单元测试，因为业务逻辑依赖 `*gin.Context`。
- 数据库表结构变化会影响路由层，改一处牵动全身。
- 不同模块的错误返回不统一，前端难以稳定处理。
- main 函数越来越大，初始化顺序和依赖关系失控。

好的分层目标不是把代码拆得越碎越好，而是让每一层的职责稳定：外层适配协议，内层表达业务，基础设施通过接口被调用。

## 二、目录架构心智：入口、应用、领域、基础设施

一个中小型 Gin 服务可以从下面的结构开始：

```text
.
├── cmd/
│   └── api/
│       └── main.go              # 程序入口，只做装配和启动
├── configs/
│   └── config.yaml              # 本地配置模板
├── internal/
│   ├── app/
│   │   ├── router.go            # Gin 路由注册
│   │   └── server.go            # HTTP Server 生命周期
│   ├── config/
│   │   └── config.go            # 配置结构和加载
│   ├── handler/
│   │   └── user_handler.go      # HTTP 入参、出参、状态码
│   ├── service/
│   │   └── user_service.go      # 业务用例
│   ├── repo/
│   │   └── user_repo.go         # 数据访问接口和实现
│   ├── model/
│   │   └── user.go              # 数据库模型或领域实体
│   ├── middleware/
│   │   ├── auth.go
│   │   └── request_id.go
│   └── response/
│       └── response.go          # 统一响应和错误码
├── pkg/
│   └── logger/                  # 真正可复用的公共库才放 pkg
├── scripts/
│   └── migrate.sh
├── go.mod
└── Makefile
```

这里有两个重要原则：

- `cmd/api/main.go` 是装配层，不写业务逻辑。
- `internal` 是项目私有实现，Go 编译器会阻止外部项目 import 它。

如果项目不大，不必强行引入 DDD 的 `domain/application/infrastructure` 全套术语。`handler/service/repo` 已经足够清晰。等业务复杂到需要领域模型、事件、聚合根，再逐步演进。

## 三、各层职责边界

### 1. Handler：只处理 HTTP

Handler 负责从 `gin.Context` 读取输入、调用 service、把结果转换成 HTTP 响应。它不应该直接写 SQL，也不应该决定复杂业务规则。

```go
package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/example/app/internal/response"
	"github.com/example/app/internal/service"
)

type UserHandler struct {
	users *service.UserService
}

func NewUserHandler(users *service.UserService) *UserHandler {
	return &UserHandler{users: users}
}

type CreateUserRequest struct {
	Name  string `json:"name" binding:"required,min=2,max=32"`
	Email string `json:"email" binding:"required,email"`
}

func (h *UserHandler) Create(c *gin.Context) {
	var req CreateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, "INVALID_ARGUMENT", err.Error())
		return
	}

	user, err := h.users.Create(c.Request.Context(), service.CreateUserInput{
		Name:  req.Name,
		Email: req.Email,
	})
	if err != nil {
		response.Error(c, err)
		return
	}

	response.OK(c, gin.H{
		"id":    user.ID,
		"name":  user.Name,
		"email": user.Email,
	})
}
```

### 2. Service：表达业务用例

Service 不依赖 Gin。这样同一段业务逻辑以后可以被 HTTP、gRPC、消息队列消费者复用。

```go
package service

import (
	"context"
	"errors"

	"github.com/example/app/internal/model"
	"github.com/example/app/internal/repo"
)

var ErrEmailExists = errors.New("email already exists")

type UserService struct {
	users repo.UserRepo
}

func NewUserService(users repo.UserRepo) *UserService {
	return &UserService{users: users}
}

type CreateUserInput struct {
	Name  string
	Email string
}

func (s *UserService) Create(ctx context.Context, in CreateUserInput) (*model.User, error) {
	exists, err := s.users.ExistsByEmail(ctx, in.Email)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, ErrEmailExists
	}

	user := &model.User{
		Name:  in.Name,
		Email: in.Email,
	}
	if err := s.users.Create(ctx, user); err != nil {
		return nil, err
	}
	return user, nil
}
```

### 3. Repo：封装数据访问

Repo 对 service 暴露接口，对内部隐藏 GORM、SQL、Redis 等具体细节。

```go
package repo

import (
	"context"

	"github.com/example/app/internal/model"
	"gorm.io/gorm"
)

type UserRepo interface {
	Create(ctx context.Context, user *model.User) error
	ExistsByEmail(ctx context.Context, email string) (bool, error)
	FindByID(ctx context.Context, id uint64) (*model.User, error)
}

type GormUserRepo struct {
	db *gorm.DB
}

func NewGormUserRepo(db *gorm.DB) *GormUserRepo {
	return &GormUserRepo{db: db}
}

func (r *GormUserRepo) Create(ctx context.Context, user *model.User) error {
	return r.db.WithContext(ctx).Create(user).Error
}

func (r *GormUserRepo) ExistsByEmail(ctx context.Context, email string) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&model.User{}).
		Where("email = ?", email).
		Count(&count).Error
	return count > 0, err
}
```

接口放在哪里没有唯一答案。简单项目可以放在 `repo` 包；如果你坚持依赖倒置，可以把 service 依赖的接口定义在 `service` 包或更内层的 `domain` 包。关键不是名词，而是不要让业务层依赖具体数据库实现。

## 四、路由注册和依赖装配

路由注册不要散落在 main 函数里。main 只负责读取配置、初始化依赖、启动服务。

```go
package app

import (
	"github.com/gin-gonic/gin"
	"github.com/example/app/internal/handler"
	"github.com/example/app/internal/middleware"
)

type Handlers struct {
	User *handler.UserHandler
}

func NewRouter(h Handlers) *gin.Engine {
	r := gin.New()
	r.Use(gin.Recovery(), middleware.RequestID(), middleware.AccessLog())

	v1 := r.Group("/api/v1")
	{
		v1.POST("/users", h.User.Create)
		v1.GET("/users/:id", h.User.Get)
	}

	return r
}
```

```go
package main

import (
	"log"

	"github.com/example/app/internal/app"
	"github.com/example/app/internal/handler"
	"github.com/example/app/internal/repo"
	"github.com/example/app/internal/service"
)

func main() {
	cfg := MustLoadConfig()
	db := MustOpenDB(cfg.Database)

	userRepo := repo.NewGormUserRepo(db)
	userSvc := service.NewUserService(userRepo)
	userHandler := handler.NewUserHandler(userSvc)

	router := app.NewRouter(app.Handlers{User: userHandler})
	log.Fatal(router.Run(cfg.HTTP.Addr))
}
```

当依赖变多时，可以用 Google Wire 做编译期依赖注入，也可以手写 provider。不要为了“高级”引入运行期反射型 DI，Go 项目通常更偏向显式装配。

## 五、统一响应与错误映射

如果每个 handler 都自己写 `c.JSON`，错误格式很快会混乱。可以集中做一层响应封装。

```go
package response

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/example/app/internal/service"
)

type Body struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data,omitempty"`
}

func OK(c *gin.Context, data any) {
	c.JSON(http.StatusOK, Body{
		Code:    "OK",
		Message: "success",
		Data:    data,
	})
}

func Fail(c *gin.Context, status int, code, message string) {
	c.JSON(status, Body{Code: code, Message: message})
}

func Error(c *gin.Context, err error) {
	switch {
	case errors.Is(err, service.ErrEmailExists):
		Fail(c, http.StatusConflict, "EMAIL_EXISTS", "email already exists")
	default:
		Fail(c, http.StatusInternalServerError, "INTERNAL_ERROR", "internal server error")
	}
}
```

这不是鼓励吞掉错误细节。内部日志可以记录完整错误栈，外部响应要稳定、可预测，避免把 SQL、路径和敏感信息暴露给用户。

## 六、配置、日志和中间件

配置结构建议用强类型，而不是在代码里到处读环境变量：

```go
type Config struct {
	HTTP struct {
		Addr string `mapstructure:"addr"`
	} `mapstructure:"http"`
	Database struct {
		DSN         string `mapstructure:"dsn"`
		MaxOpenConn int    `mapstructure:"max_open_conn"`
		MaxIdleConn int    `mapstructure:"max_idle_conn"`
	} `mapstructure:"database"`
	Redis struct {
		Addr string `mapstructure:"addr"`
	} `mapstructure:"redis"`
}
```

中间件适合放横切能力，例如 request id、访问日志、鉴权、限流、CORS、panic recovery。业务规则不要塞进中间件，否则测试和复用都会变难。

```go
func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		requestID := c.GetHeader("X-Request-ID")
		if requestID == "" {
			requestID = uuid.NewString()
		}
		c.Header("X-Request-ID", requestID)
		c.Set("request_id", requestID)
		c.Next()
	}
}
```

生产环境启动 Gin 时要设置模式：

```go
gin.SetMode(gin.ReleaseMode)
```

同时建议不要直接用 `router.Run()`，而是显式创建 `http.Server`，方便设置超时和优雅退出。

```go
srv := &http.Server{
	Addr:              cfg.HTTP.Addr,
	Handler:           router,
	ReadHeaderTimeout: 3 * time.Second,
	ReadTimeout:       10 * time.Second,
	WriteTimeout:      10 * time.Second,
	IdleTimeout:       60 * time.Second,
}
```

## 七、测试策略

分层之后，测试会自然变轻：

- Service 测试：用 fake repo，不启动 HTTP，不连真实 DB。
- Handler 测试：用 `httptest` 构造请求，验证状态码和响应体。
- Repo 测试：可以用测试库、容器数据库或本地集成环境。

Service 测试示例：

```go
type fakeUserRepo struct {
	exists bool
}

func (f fakeUserRepo) ExistsByEmail(ctx context.Context, email string) (bool, error) {
	return f.exists, nil
}

func (f fakeUserRepo) Create(ctx context.Context, user *model.User) error {
	user.ID = 1
	return nil
}

func TestUserService_Create_EmailExists(t *testing.T) {
	svc := service.NewUserService(fakeUserRepo{exists: true})

	_, err := svc.Create(context.Background(), service.CreateUserInput{
		Name:  "Tom",
		Email: "tom@example.com",
	})

	if !errors.Is(err, service.ErrEmailExists) {
		t.Fatalf("want ErrEmailExists, got %v", err)
	}
}
```

## 八、排错与优化

分层项目常见问题集中在依赖方向和包边界：

- **循环 import**：通常是 model、service、repo 互相引用导致的。先明确依赖方向，再把共享类型下沉到更内层或单独包。
- **Handler 太厚**：如果 handler 超过几十行还在写业务判断，应该把用例挪到 service。
- **Service 依赖 Gin**：一旦 service 方法接收 `*gin.Context`，说明 HTTP 细节泄漏到了业务层。改成接收 `context.Context` 和普通 input struct。
- **Repo 返回 GORM 模型到处传**：小项目可以接受；复杂项目建议区分数据库 model 和业务 entity，避免表结构绑死业务表达。
- **配置散落**：所有连接池、超时、开关都应该进入配置结构，避免线上只能改代码。

性能上，目录分层本身几乎没有额外成本。真正要关注的是数据库索引、连接池、JSON 序列化、缓存命中率和中间件里是否做了阻塞操作。

## 九、生产取舍

没有一种目录结构适合所有 Go 项目。可以按项目规模选择：

- **小工具或 demo**：一个 `main.go` 加少量包即可，不必强行三层架构。
- **中小型 Web 服务**：`cmd + internal/handler/service/repo` 是成本最低的稳妥选择。
- **复杂业务系统**：可以进一步引入 `domain/usecase/infrastructure`，把业务模型和技术实现隔离得更彻底。
- **多服务仓库**：可以在 `cmd` 下放多个入口，在 `internal` 下按服务或业务域拆分。

不要把 `pkg` 当垃圾桶。只有明确要被别的项目 import 的稳定库，才值得放进去。项目内部复用优先放 `internal`。

## 十、总结

Gin 的项目分层，本质是在控制变化的影响范围。Handler 面向 HTTP 变化，Service 面向业务变化，Repo 面向数据存储变化，main 负责把它们装配起来。

当你能做到“业务逻辑不依赖 Gin，数据访问不散落在路由里，错误响应统一，依赖装配清楚”，这个 Gin 项目就已经具备了长期维护的基础。目录不是目的，边界才是。
