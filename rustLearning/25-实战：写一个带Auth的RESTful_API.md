# 25-实战：写一个带 Auth 的 RESTful API

> 一句话导读：一个 Rust Web 服务的关键不是“能返回 Hello World”，而是把路由、状态、数据库、认证、错误处理和配置边界组织清楚。

这一篇用 Axum、SQLx、Serde、JWT 和 Argon2 搭一个带认证的 RESTful API 骨架。

目标功能：

- `POST /auth/register`：注册用户。
- `POST /auth/login`：登录并返回 JWT。
- `GET /api/me`：带 Bearer Token 获取当前用户。

代码为了教学做了适度简化，但结构接近真实项目。

## 一、机制心智：请求在服务里怎么流动

一次受保护请求的路径大概是：

```text
HTTP Request
    |
    v
Axum Router 匹配路由
    |
    v
Extractor 解析 State / Json / Header
    |
    v
Auth Extractor 校验 JWT，产出 Claims
    |
    v
Handler 执行业务逻辑
    |
    v
SQLx 查询数据库
    |
    v
Result<T, AppError> 转成 HTTP Response
```

Axum 的核心心智是 extractor。你在 handler 参数里写了什么，Axum 就尝试从请求里提取什么。

```rust
async fn handler(
    State(state): State<AppState>,
    Json(body): Json<RequestBody>,
    claims: Claims,
) -> Result<Json<ResponseBody>, AppError> {
    // ...
}
```

`claims: Claims` 不是普通参数，它可以被实现成认证提取器：没有 token 就拒绝，有 token 就把用户身份放进 handler。

## 二、依赖和项目结构

`Cargo.toml`：

```toml
[package]
name = "auth_api"
version = "0.1.0"
edition = "2021"

[dependencies]
argon2 = "0.5"
axum = "0.7"
chrono = { version = "0.4", features = ["serde"] }
jsonwebtoken = "9"
rand_core = { version = "0.6", features = ["std"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
sqlx = { version = "0.7", features = ["runtime-tokio", "postgres", "chrono", "macros"] }
thiserror = "1"
tokio = { version = "1", features = ["macros", "rt-multi-thread", "net"] }
tracing = "0.1"
tracing-subscriber = "0.3"
```

建议目录：

```text
src/
├── main.rs
├── app.rs
├── auth.rs
├── error.rs
└── users.rs
```

教学文章里会放成几个片段。实际项目应该拆开。

数据库表：

```sql
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## 三、共享状态和 DTO

共享状态要便于 clone。`PgPool` 本身就是 cheap clone，内部有连接池引用计数；secret 用 `Arc<str>` 或 `String` 都可以。

```rust
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub jwt_secret: Arc<str>,
}

#[derive(Debug, sqlx::FromRow)]
pub struct UserRecord {
    pub id: i64,
    pub username: String,
    pub password_hash: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserResponse {
    pub id: i64,
    pub username: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenResponse {
    pub access_token: String,
    pub token_type: &'static str,
}

impl From<UserRecord> for UserResponse {
    fn from(user: UserRecord) -> Self {
        Self {
            id: user.id,
            username: user.username,
            created_at: user.created_at,
        }
    }
}
```

注意没有把 `password_hash` 放进响应类型。不要依赖 `skip_serializing` 兜底，直接不给响应模型这个字段更稳。

## 四、统一错误处理

Axum handler 返回 `Result<T, E>` 时，只要 `E: IntoResponse`，就能自动变成 HTTP 响应。

```rust
use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("bad request: {0}")]
    BadRequest(String),

    #[error("unauthorized")]
    Unauthorized,

    #[error("not found")]
    NotFound,

    #[error("database error")]
    Database(#[from] sqlx::Error),

    #[error("password error")]
    Password,

    #[error("token error")]
    Token,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let status = match self {
            AppError::BadRequest(_) => StatusCode::BAD_REQUEST,
            AppError::Unauthorized => StatusCode::UNAUTHORIZED,
            AppError::NotFound => StatusCode::NOT_FOUND,
            AppError::Database(_) => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::Password => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::Token => StatusCode::UNAUTHORIZED,
        };

        let body = Json(json!({
            "error": self.to_string()
        }));

        (status, body).into_response()
    }
}
```

生产环境里内部错误不要把数据库细节返回给用户，但应该用 tracing 记录完整错误。

## 五、密码哈希：不要自己发明算法

密码不能明文保存，也不应该只做普通 hash。使用 Argon2、bcrypt、scrypt 这类密码哈希算法。

```rust
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};

fn hash_password(password: &str) -> Result<String, AppError> {
    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|_| AppError::Password)?
        .to_string();
    Ok(hash)
}

fn verify_password(password: &str, password_hash: &str) -> Result<bool, AppError> {
    let parsed_hash = PasswordHash::new(password_hash).map_err(|_| AppError::Password)?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok())
}
```

工程边界：

- 密码长度要限制，避免超大输入拖垮服务。
- 登录失败不要区分“用户不存在”和“密码错误”。
- 密码 hash 参数需要可升级，不能写死成不可迁移的自定义格式。

## 六、JWT Claims 和认证提取器

JWT 适合无状态认证，但它不是会话系统的银弹。这里先实现 access token。

```rust
use axum::{
    async_trait,
    extract::{FromRequestParts, State},
    http::{request::Parts, StatusCode},
    RequestPartsExt,
};
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: i64,
    pub exp: usize,
}

fn create_token(user_id: i64, secret: &str) -> Result<String, AppError> {
    let exp = Utc::now()
        .checked_add_signed(Duration::hours(2))
        .ok_or(AppError::Token)?
        .timestamp() as usize;

    let claims = Claims { sub: user_id, exp };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|_| AppError::Token)
}

#[async_trait]
impl FromRequestParts<AppState> for Claims {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let auth = parts
            .headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
            .ok_or(AppError::Unauthorized)?;

        let token = auth
            .strip_prefix("Bearer ")
            .ok_or(AppError::Unauthorized)?;

        let data = decode::<Claims>(
            token,
            &DecodingKey::from_secret(state.jwt_secret.as_bytes()),
            &Validation::default(),
        )
        .map_err(|_| AppError::Unauthorized)?;

        Ok(data.claims)
    }
}
```

这里的重点不是 JWT 语法，而是把认证写成 extractor。之后任何受保护接口只要加 `claims: Claims` 参数就行。

## 七、注册、登录和当前用户接口

```rust
use axum::{extract::State, http::StatusCode, Json};

pub async fn register(
    State(state): State<AppState>,
    Json(req): Json<RegisterRequest>,
) -> Result<(StatusCode, Json<UserResponse>), AppError> {
    if req.username.trim().is_empty() || req.password.len() < 8 {
        return Err(AppError::BadRequest(
            "username is required and password must be at least 8 chars".into(),
        ));
    }

    let password_hash = hash_password(&req.password)?;

    let user = sqlx::query_as::<_, UserRecord>(
        r#"
        INSERT INTO users (username, password_hash)
        VALUES ($1, $2)
        RETURNING id, username, password_hash, created_at
        "#,
    )
    .bind(req.username.trim())
    .bind(password_hash)
    .fetch_one(&state.db)
    .await?;

    Ok((StatusCode::CREATED, Json(UserResponse::from(user))))
}

pub async fn login(
    State(state): State<AppState>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<TokenResponse>, AppError> {
    let user = sqlx::query_as::<_, UserRecord>(
        r#"
        SELECT id, username, password_hash, created_at
        FROM users
        WHERE username = $1
        "#,
    )
    .bind(req.username.trim())
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::Unauthorized)?;

    if !verify_password(&req.password, &user.password_hash)? {
        return Err(AppError::Unauthorized);
    }

    let token = create_token(user.id, &state.jwt_secret)?;

    Ok(Json(TokenResponse {
        access_token: token,
        token_type: "Bearer",
    }))
}

pub async fn me(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<UserResponse>, AppError> {
    let user = sqlx::query_as::<_, UserRecord>(
        r#"
        SELECT id, username, password_hash, created_at
        FROM users
        WHERE id = $1
        "#,
    )
    .bind(claims.sub)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(UserResponse::from(user)))
}
```

`query_as::<_, UserRecord>` 是接近可编译的写法。如果你使用 `query_as!` 宏，还需要设置 `DATABASE_URL` 或运行 `cargo sqlx prepare`。

## 八、组装 Router 和启动服务

```rust
use axum::{routing::{get, post}, Router};
use std::{env, net::SocketAddr, sync::Arc};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();

    let database_url = env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://localhost/auth_api".to_string());
    let jwt_secret = env::var("JWT_SECRET")
        .unwrap_or_else(|_| "dev-secret-change-me".to_string());

    let db = sqlx::PgPool::connect(&database_url).await?;

    let state = AppState {
        db,
        jwt_secret: Arc::from(jwt_secret),
    };

    let app = Router::new()
        .route("/auth/register", post(register))
        .route("/auth/login", post(login))
        .route("/api/me", get(me))
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 3000));
    let listener = tokio::net::TcpListener::bind(addr).await?;

    tracing::info!("listening on {addr}");
    axum::serve(listener, app).await?;

    Ok(())
}
```

测试请求：

```bash
curl -X POST http://localhost:3000/auth/register \
  -H 'content-type: application/json' \
  -d '{"username":"alice","password":"password123"}'

TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"alice","password":"password123"}' \
  | jq -r .accessToken)

curl http://localhost:3000/api/me \
  -H "authorization: Bearer $TOKEN"
```

## 九、常见坑

### 1. JWT secret 写死在代码里

教学可以写死，生产必须来自环境变量或密钥系统。泄漏后要能轮换。

### 2. 用普通 hash 存密码

`sha256(password)` 不适合存密码。密码哈希需要 salt 和抗暴力破解成本。

### 3. 把数据库模型直接返回

数据库字段经常包含内部状态、权限位、hash、删除标记。响应 DTO 应该单独定义。

### 4. 错误信息泄漏

登录失败不要返回“用户不存在”。数据库错误不要原样返回给客户端。

### 5. 把所有逻辑塞 handler

文章为了展示放在一起。真实项目里应该分层：handler 解析请求，service 执行业务，repository 访问数据库。

### 6. 忽略速率限制

认证接口必须考虑限流、验证码、登录失败告警，否则会成为暴力破解入口。

## 十、工程边界

这个方案适合：

- 内部工具。
- 中小型 Web API。
- 单体服务或轻量微服务。
- 想用 Rust 做可靠 API 后端的项目。

需要加强的地方：

- Refresh token 和 token 吊销。
- 权限模型，比如 RBAC/ABAC。
- 数据库迁移管理。
- OpenAPI 文档。
- 请求追踪和结构化日志。
- 限流、CORS、CSRF、防爆破。

不建议一开始就做得过重：

- 自研认证协议。
- 自研密码算法。
- 把 JWT 当成万能 session。
- 过早拆成多个服务。

## 十一、结尾总结

Rust 写 RESTful API 的关键是把边界建清楚：

1. Serde 负责请求和响应模型。
2. Axum extractor 负责从请求中提取状态、JSON 和身份。
3. SQLx 负责类型化数据库访问。
4. `AppError` 统一把业务错误变成 HTTP 响应。
5. 密码哈希和 JWT 只放在认证边界，不散落到业务代码里。

这个骨架跑通后，再加业务表、权限、迁移、日志和测试，才是一个可持续演进的 Rust Web 服务。

---
**下一篇：** `26-Unsafe Rust.md`，进入 Rust 安全边界背后的底层世界。
