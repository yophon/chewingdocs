# Gin 框架实战(二)：项目目录分层设计

> **导读**：Go 语言本身没有规定项目必须怎么分层（不像 Java Spring Boot）。良好的目录结构（Clean Architecture）是防止代码腐化的关键。

## 一、标准 Go 语言工程结构 (Standard Go Project Layout)
业界公认的一套项目目录组织规范：

```text
├── cmd/           # 程序的入口，每个子目录对应一个可执行文件（如 cmd/api/main.go）
├── internal/      # 核心私有业务逻辑。Go 编译器会强制限制 internal 外的包无法 import 这里的代码！
├── pkg/           # 可以被外部其他项目 import 的公用工具库（如果不打算开源复用，尽量少用 pkg）
├── api/           # OpenAPI/Swagger 接口定义文件、Protocol Buffers 契约文件
├── configs/       # 配置文件模板 (yaml, json)
├── scripts/       # 构建、部署用的 Bash/Makefile 脚本
└── go.mod         # 依赖管理
```

## 二、Internal 内部的三层架构模型
在 `internal/` 目录下，最经典的做法是按照 Controller-Service-Repository 三层拆分。

```text
internal/
 ├── handler/  (或 controller)
 │     # 负责接收 HTTP 请求(gin.Context)，参数绑定与校验，返回 JSON 响应。不包含核心业务。
 │
 ├── service/  (或 logic/usecase)
 │     # 核心业务逻辑层。接收纯数据结构，处理核心规则，调用 repo。完全不依赖 Gin。
 │
 └── repo/     (或 dao)
       # 数据访问层。封装所有数据库 CRUD 和 Redis 缓存操作。对外只暴露接口。
```

## 三、为什么非要拆分？
有些新手喜欢在 Handler 里一把梭（直接把 `db.Where(...)` 写在 Gin 路由里）。
一旦业务变得复杂，或者需要写单元测试时：
- **解耦隔离**：Service 层不需要知道外层是 HTTP 还是 gRPC 请求，这使得业务逻辑极其容易复用。
- **方便 Mock**：因为 Repo 是接口，在测试 Service 时，你可以传入一个 MockRepo（不在真实 DB 写入数据），实现飞快且隔离的单元测试。
- **依赖倒置**：这是大型项目必备的架构心智模型。配合 Google 的 `Wire` 依赖注入库体验极佳。
