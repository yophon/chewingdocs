# 21-Axum：现代 Web 框架入门

> 一句话导读：Axum 的核心不是宏法术，而是用类型系统把路由、请求提取、共享状态和响应转换组合成可维护的 HTTP 服务。

Axum 建立在 Tokio、Hyper 和 Tower 之上，是 Rust Web 后端生态里非常主流的选择。它的设计风格很 Rust：handler 是普通 async 函数，请求数据通过 extractor 提取，响应通过 trait 转换，状态显式注入，中间件来自 Tower 生态。

这篇以生产服务的视角学习 Axum：不只写 Hello World，还要处理状态、错误、JSON、路由拆分、超时、日志和关闭边界。

## 一、架构心智：Router + Extractor + State + Tower

Axum 请求处理链路可以这样理解：

```text
TCP listener
  |
  v
Hyper HTTP server
  |
  v
Tower middleware layer
  |
  v
Axum Router
  |
  v
Extractor 从请求中提取 Path/Query/Json/State
  |
  v
handler async fn
  |
  v
IntoResponse 转换成 HTTP 响应
```

几个关键词：

- `Router`：声明路径和方法。
- `Extractor`：从请求里拿路径参数、查询参数、Header、JSON、共享状态。
- `State`：显式传入应用状态，比如数据库连接池。
- `IntoResponse`：handler 返回值转 HTTP 响应。
- `Layer`：Tower 中间件，比如 tracing、timeout、cors、limit。

## 二、Hello Axum

```toml
# Cargo.toml
[dependencies]
axum = "0.7"
tokio = { version = "1", features = ["macros", "rt-multi-thread", "net", "signal"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

最小可编译服务：

```rust
use axum::{routing::get, Router};
use tokio::net::TcpListener;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let app = Router::new().route("/", get(root));

    let listener = TcpListener::bind("127.0.0.1:3000").await?;
    println!("listening on {}", listener.local_addr()?);

    axum::serve(listener, app).await?;
    Ok(())
}

async fn root() -> &'static str {
    "Hello, Axum"
}
```

如果不用 `anyhow`，也可以让 `main` 返回 `Result<(), Box<dyn std::error::Error>>`。

## 三、Extractor：类型化读取请求

Axum handler 的参数就是 extractor。

```rust
use axum::{
    extract::{Json, Path, Query},
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
struct ListParams {
    page: Option<u32>,
    page_size: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct CreateUserRequest {
    username: String,
}

#[derive(Debug, Serialize)]
struct UserResponse {
    id: u64,
    username: String,
}

async fn get_user(Path(id): Path<u64>) -> Json<UserResponse> {
    Json(UserResponse {
        id,
        username: "alice".to_string(),
    })
}

async fn list_users(Query(params): Query<ListParams>) -> Json<Vec<UserResponse>> {
    let page = params.page.unwrap_or(1);
    let page_size = params.page_size.unwrap_or(20);

    Json(vec![UserResponse {
        id: page as u64,
        username: format!("page-size-{page_size}"),
    }])
}

async fn create_user(Json(payload): Json<CreateUserRequest>) -> Json<UserResponse> {
    Json(UserResponse {
        id: 1,
        username: payload.username,
    })
}

fn app() -> Router {
    Router::new()
        .route("/users", get(list_users).post(create_user))
        .route("/users/:id", get(get_user))
}
```

消耗 body 的 extractor，比如 `Json<T>`、`String`、`Bytes`，通常要放在参数列表最后。因为 HTTP body 是流，只能被消费一次。

## 四、共享状态：数据库连接池、配置、客户端

Web 服务通常需要共享状态。Axum 用 `State<T>` 显式传递。

```rust
use axum::{
    extract::State,
    routing::get,
    Json, Router,
};
use serde::Serialize;
use std::sync::Arc;

#[derive(Clone)]
struct AppState {
    app_name: String,
}

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    app: String,
}

async fn health(State(state): State<Arc<AppState>>) -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        app: state.app_name.clone(),
    })
}

fn build_app() -> Router {
    let state = Arc::new(AppState {
        app_name: "demo-api".to_string(),
    });

    Router::new()
        .route("/health", get(health))
        .with_state(state)
}
```

`State` 里的内容应该是可克隆、线程安全、生命周期清晰的对象。数据库连接池本身通常已经是 cheap clone，不一定需要再套 `Arc`；普通配置结构体如果较大，可以用 `Arc<AppConfig>`。

不要把每个请求独有的数据塞进全局 state。请求 ID、认证用户、trace context 应该走 extractor 或 middleware extension。

## 五、错误处理：统一响应格式

生产 API 不应该把内部错误直接 `unwrap()` 或暴露给客户端。常见做法是定义应用错误类型，并实现 `IntoResponse`。

```rust
use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;

#[derive(Debug)]
enum AppError {
    NotFound,
    BadRequest(String),
    Internal(anyhow::Error),
}

#[derive(Serialize)]
struct ErrorBody {
    code: &'static str,
    message: String,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code, message) = match self {
            AppError::NotFound => (
                StatusCode::NOT_FOUND,
                "not_found",
                "resource not found".to_string(),
            ),
            AppError::BadRequest(message) => (
                StatusCode::BAD_REQUEST,
                "bad_request",
                message,
            ),
            AppError::Internal(err) => {
                tracing::error!(error = ?err, "internal server error");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal",
                    "internal server error".to_string(),
                )
            }
        };

        (status, Json(ErrorBody { code, message })).into_response()
    }
}

impl<E> From<E> for AppError
where
    E: Into<anyhow::Error>,
{
    fn from(err: E) -> Self {
        AppError::Internal(err.into())
    }
}
```

handler 可以返回 `Result<Json<T>, AppError>`：

```rust
use axum::Json;
use serde::Serialize;

#[derive(Serialize)]
struct User {
    id: u64,
}

async fn maybe_user() -> Result<Json<User>, AppError> {
    let found = true;

    if found {
        Ok(Json(User { id: 1 }))
    } else {
        Err(AppError::NotFound)
    }
}
```

对外响应要稳定，对内日志要详细。这两个目标不要混在一起。

## 六、路由拆分与版本化

项目变大后，按模块拆路由：

```rust
use axum::{routing::get, Router};

async fn users_index() -> &'static str {
    "users"
}

async fn orders_index() -> &'static str {
    "orders"
}

fn users_router() -> Router {
    Router::new().route("/", get(users_index))
}

fn orders_router() -> Router {
    Router::new().route("/", get(orders_index))
}

fn app() -> Router {
    Router::new()
        .nest("/api/v1/users", users_router())
        .nest("/api/v1/orders", orders_router())
}
```

版本化不是所有服务都必须一开始做，但公共 API、移动端 API、第三方集成 API 应该尽早规划。内部服务可以靠部署节奏和契约测试管理版本。

## 七、中间件：日志、超时、CORS、请求体限制

Axum 基于 Tower，因此可以使用 `tower` 和 `tower-http`。

```toml
[dependencies]
tower = { version = "0.4", features = ["timeout"] }
tower-http = { version = "0.5", features = ["trace", "cors", "limit"] }
tracing = "0.1"
tracing-subscriber = "0.3"
```

```rust
use axum::{routing::get, Router};
use std::time::Duration;
use tower::ServiceBuilder;
use tower_http::{
    cors::CorsLayer,
    limit::RequestBodyLimitLayer,
    trace::TraceLayer,
};

async fn root() -> &'static str {
    "ok"
}

fn app() -> Router {
    let middleware = ServiceBuilder::new()
        .layer(TraceLayer::new_for_http())
        .layer(tower::timeout::TimeoutLayer::new(Duration::from_secs(10)))
        .layer(RequestBodyLimitLayer::new(1024 * 1024))
        .layer(CorsLayer::permissive());

    Router::new()
        .route("/", get(root))
        .layer(middleware)
}
```

生产环境里 `CorsLayer::permissive()` 通常太宽，只适合本地开发或内部服务。公网 API 应该明确允许的 origin、method、header。

## 八、优雅关闭

服务不能只靠 Ctrl+C 强杀。Axum 支持 graceful shutdown：

```rust
use axum::{routing::get, Router};
use tokio::net::TcpListener;

async fn root() -> &'static str {
    "ok"
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let app = Router::new().route("/", get(root));
    let listener = TcpListener::bind("127.0.0.1:3000").await?;

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

async fn shutdown_signal() {
    if let Err(err) = tokio::signal::ctrl_c().await {
        tracing::error!(?err, "failed to listen for shutdown signal");
    }
}
```

真实生产还要处理：

- 停止接收新请求。
- 等待正在处理的请求完成。
- 通知后台 worker 停止。
- 关闭连接池或 flush 指标。
- 设置最大关闭等待时间，避免永久卡住。

## 九、常见错误与修正

### 错误 1：handler 里 `unwrap()`

```rust
async fn bad() -> String {
    std::fs::read_to_string("config.toml").unwrap()
}
```

问题有两个：阻塞运行时线程；错误会 panic。修正：启动时读取配置，放进 state；请求内错误返回 `AppError`。

### 错误 2：每个请求新建数据库连接

不要在 handler 里每次 `connect()`。应在启动时创建连接池，放入 `State`。

```rust
// async fn handler(State(pool): State<PgPool>) { ... }
```

连接池 clone 很便宜，通常内部已经是引用计数。

### 错误 3：把大对象直接 clone 到每个请求

如果配置或客户端很大，使用 `Arc`。但不要滥用 `Arc<Mutex<_>>` 作为全局变量盒子。可变业务状态优先放数据库、缓存或专门后台 actor。

### 错误 4：缺少请求限制

公网服务至少要考虑：

- 请求体大小限制。
- 超时。
- 并发限制或限流。
- CORS 策略。
- 认证和授权。
- 日志脱敏。

Axum 让你容易写出服务，但不会自动替你做好这些生产边界。

## 十、工程取舍

Axum 适合：

- Tokio 生态服务。
- REST API、JSON API、Webhook、轻量网关。
- 希望 handler 保持普通函数风格。
- 需要 Tower 中间件生态。

可能需要其他选择的场景：

- 团队已有成熟 Actix Web 项目，不值得迁移。
- 需要极少依赖的嵌入式 HTTP。
- 大量 OpenAPI-first 生成代码，可能需要额外工具链配合。

生产清单：

- 路由按模块组织。
- 错误响应统一。
- State 里放连接池和配置，而不是请求临时数据。
- 所有外部调用有 timeout。
- tracing 覆盖 request id、耗时、状态码。
- 请求体大小、CORS、认证、限流按暴露面配置。
- 有 graceful shutdown。

## 十一、小结

Axum 的美感在于组合：Router 负责路由，Extractor 负责从请求取数据，State 负责共享依赖，IntoResponse 负责返回响应，Tower Layer 负责横切能力。

写 Axum 生产服务的重点不是堆 handler，而是把边界处理好：错误、状态、超时、中间件、关闭和观测。

下一篇 `22-数据库交互-SQLx与SeaORM.md` 会接上 Web 服务最重要的依赖：数据库。我们会比较 SQLx 和 SeaORM，并重点讨论连接池、迁移、事务和生产边界。
