# 21-Axum：现代 Web 框架入门

> "过去几年 Rust Web 框架群魔乱舞，但随着 Tokio 团队官方下场推出 Axum，大局已定。"

Axum 建立在 Tokio 和 Hyper 之上，它最大化地利用了 Rust 的宏和宏观类型系统来提供绝对安全的路由，而且人体工程学极佳。

## 一、Hello Axum

在 `Cargo.toml` 中添加：
```toml
[dependencies]
axum = "0.7"
tokio = { version = "1.0", features = ["full"] }
```

最简单的 HTTP 服务器：
```rust
use axum::{routing::get, Router};
use tokio::net::TcpListener;

#[tokio::main]
async fn main() {
    // 1. 构建路由
    let app = Router::new()
        .route("/", get(|| async { "Hello, World!" }));

    // 2. 绑定端口
    let listener = TcpListener::bind("0.0.0.0:3000").await.unwrap();
    println!("Server running on http://localhost:3000");
    
    // 3. 启动服务器
    axum::serve(listener, app).await.unwrap();
}
```

## 二、魔法一样的提取器 (Extractors)

Axum 最牛的地方在于它的 `Extractor` 系统。你想从 HTTP 请求里拿什么，只要在函数的参数列表里写上对应的类型，Axum 在运行前会**自动**帮你从请求里提取并转换好。如果转换失败（比如参数缺失），直接自动返回 `400 Bad Request`！

```rust
use axum::{extract::{Path, Query, Json}, routing::post, Router};
use serde::Deserialize;

#[derive(Deserialize)]
struct Pagination {
    page: usize,
}

#[derive(Deserialize)]
struct CreateUser {
    username: String,
}

// 这个 Handler 演示了各种提取器
async fn create_user(
    Path(user_id): Path<u64>,               // 从 URL 路径中提取: /users/:user_id
    Query(pagination): Query<Pagination>,   // 从 URL 问号参数提取: ?page=1
    Json(payload): Json<CreateUser>,        // 从 Body 中提取 JSON 并反序列化
) -> String {
    format!(
        "为 ID 为 {} 的用户在第 {} 页创建了叫 {} 的角色",
        user_id, pagination.page, payload.username
    )
}
```
**注意：提取器的顺序是有严格要求的！** 消耗 Body 的提取器（如 `Json`, `String`）必须放在参数列表的最后一个。

## 三、共享应用状态 (State)

在 Web 服务中，我们经常需要在所有的路由之间共享一个数据库连接池。Axum 提供了安全的 `State` 机制。

```rust
use axum::{extract::State, routing::get, Router};
use std::sync::Arc;

// 1. 定义你的状态结构体
struct AppState {
    db_connection_string: String,
}

// handler 通过 State 提取器获取状态
async fn get_users(State(state): State<Arc<AppState>>) -> String {
    format!("Connecting to {}", state.db_connection_string)
}

#[tokio::main]
async fn main() {
    // 2. 将状态包在 Arc 里以供并发共享
    let shared_state = Arc::new(AppState {
        db_connection_string: String::from("postgres://localhost"),
    });

    // 3. 注入到 Router 中
    let app = Router::new()
        .route("/users", get(get_users))
        .with_state(shared_state); // 👈 注入状态
}
```

---
**下一篇：** `22-数据库交互-SQLx与SeaORM.md`，Web 服务没有数据库怎么行。
