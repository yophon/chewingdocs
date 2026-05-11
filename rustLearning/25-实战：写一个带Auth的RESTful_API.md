# 25-实战：写一个带 Auth 的 RESTful API

> "纸上得来终觉浅，绝知此事要躬行。我们把 Axum、SQLx、Serde 全串联起来。"

由于篇幅限制，这里提供的是一个核心架构和最关键代码的骨架。理解了这个骨架，写多复杂的业务都是复制粘贴。

## 一、架构选型与依赖

- Web 框架：`axum`
- 数据库操作：`sqlx` (Postgres)
- 序列化：`serde`
- JWT 鉴权：`jsonwebtoken`
- 密码哈希：`bcrypt`

## 二、定义共享状态和实体

```rust
use std::sync::Arc;
use sqlx::PgPool;
use serde::{Serialize, Deserialize};

// 整个 App 共享的状态
pub struct AppState {
    pub db: PgPool,
    pub jwt_secret: String,
}

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct User {
    pub id: i64,
    pub username: String,
    // 密码哈希不序列化给前端
    #[serde(skip_serializing)] 
    pub password_hash: String,
}
```

## 三、Axum 中间件（Middleware）：拦截并验证 JWT

在 Axum 中，实现鉴权通常是利用提取器（Extractor）来实现类似于中间件的功能。

```rust
use axum::{
    async_trait, extract::FromRequestParts, http::request::Parts, response::IntoResponse, http::StatusCode,
};
use jsonwebtoken::{decode, DecodingKey, Validation};

pub struct Claims {
    pub user_id: i64,
}

// 为 Claims 实现 FromRequestParts 提取器
#[async_trait]
impl<S> FromRequestParts<S> for Claims
where
    S: Send + Sync,
{
    type Rejection = StatusCode;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        // 1. 从 HTTP Header 获取 Authorization: Bearer <token>
        let auth_header = parts.headers.get("Authorization").ok_or(StatusCode::UNAUTHORIZED)?;
        let auth_str = auth_header.to_str().map_err(|_| StatusCode::UNAUTHORIZED)?;
        let token = auth_str.trim_start_matches("Bearer ");

        // 2. 解码并验证 Token（实际中秘钥应从环境变量获取）
        let token_data = decode::<Claims>(
            token,
            &DecodingKey::from_secret("my_super_secret".as_ref()),
            &Validation::default(),
        ).map_err(|_| StatusCode::UNAUTHORIZED)?;

        Ok(token_data.claims) // 提取成功，原样返回给后端的 Handler
    }
}
```

## 四、业务 Handler：处理受保护的路由

看！在写具体的业务接口时，只要加上 `claims: Claims` 参数，Axum 就会自动先过一遍上面的鉴权逻辑。没登录直接返回 401，登录了就可以拿到当前请求的用户 ID。

```rust
use axum::{extract::State, Json};

async fn get_my_profile(
    State(state): State<Arc<AppState>>,
    claims: Claims, // 👈 核心：只有带着合法 JWT 才能走到这里，且直接拿到了用户 ID
) -> Result<Json<User>, StatusCode> {
    
    // 使用 sqlx 查库
    let user = sqlx::query_as!(
        User,
        "SELECT id, username, password_hash FROM users WHERE id = $1",
        claims.user_id
    )
    .fetch_optional(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    match user {
        Some(u) => Ok(Json(u)),
        None => Err(StatusCode::NOT_FOUND),
    }
}
```

## 五、组合启动服务器

```rust
use axum::{routing::get, Router};

#[tokio::main]
async fn main() {
    let pool = sqlx::PgPool::connect("postgres://localhost/mydb").await.unwrap();
    let state = Arc::new(AppState {
        db: pool,
        jwt_secret: "my_super_secret".to_string(),
    });

    let app = Router::new()
        .route("/api/me", get(get_my_profile)) // 注册路由
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
```

**至此，第四部分工程实战结束。**
你已经完全具备用 Rust 写一个生产级 Web 服务的全部理论和实战基础！

---
**下一篇：** `26-Unsafe Rust.md`，进入最后的第五部分（底层深入），看看怎么绕过编译器的保护，干一些危险的事。
