# 22-数据库交互：SQLx 与 SeaORM

> 一句话导读：Rust 数据库开发的核心选择是“手写 SQL 换控制力”还是“ORM 换建模效率”，但生产边界永远绕不开连接池、迁移、事务、超时和可观测性。

Rust 后端服务最终都会碰到数据库。相比很多语言，Rust 的数据库生态更强调类型和编译期检查。常见选择里，SQLx 和 SeaORM 都建立在异步生态上，能很好配合 Tokio 和 Axum。

这篇不追求覆盖所有 API，而是建立选型和工程心智：什么时候选 SQLx，什么时候选 SeaORM，怎么管理连接池和事务，哪些坑会在生产环境放大。

## 一、架构心智：应用、连接池、事务与迁移

数据库访问可以拆成几层：

```text
HTTP handler / CLI command
  |
  v
Repository / Service
  |
  v
Connection Pool
  |
  v
Transaction / Query
  |
  v
Database
```

几个基本原则：

- 应用启动时创建连接池，不要每个请求都新建连接。
- SQL schema 变更要走迁移，不要手动改库后忘记代码。
- 多步写入要用事务。
- 所有数据库调用都应该有超时或被上层请求超时覆盖。
- 不要把数据库错误原样返回给客户端。

## 二、SQLx：手写 SQL + 类型检查

SQLx 不是 ORM。它鼓励你写原生 SQL，同时提供类型映射、连接池、迁移和编译期查询检查。

```toml
# Cargo.toml
[dependencies]
sqlx = { version = "0.7", features = [
    "runtime-tokio",
    "postgres",
    "macros",
    "migrate",
    "chrono",
] }
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
serde = { version = "1", features = ["derive"] }
anyhow = "1"
```

一个接近可编译的 Postgres 示例：

```rust
use sqlx::{postgres::PgPoolOptions, PgPool};

#[derive(Debug, sqlx::FromRow)]
struct User {
    id: i64,
    username: String,
}

async fn find_user_by_name(pool: &PgPool, username: &str) -> Result<Option<User>, sqlx::Error> {
    sqlx::query_as::<_, User>(
        "SELECT id, username FROM users WHERE username = $1"
    )
    .bind(username)
    .fetch_optional(pool)
    .await
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let database_url = std::env::var("DATABASE_URL")?;

    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&database_url)
        .await?;

    if let Some(user) = find_user_by_name(&pool, "alice").await? {
        println!("found user: {:?}", user);
    }

    Ok(())
}
```

`query_as::<_, User>()` 是运行时检查列映射。SQLx 更强的能力是 `query!` / `query_as!` 宏，它们可以在编译期连接数据库检查 SQL：

```rust
// 需要 DATABASE_URL 指向可访问数据库，或者使用 sqlx offline 模式。
async fn find_user_checked(pool: &PgPool, username: &str) -> Result<Option<User>, sqlx::Error> {
    sqlx::query_as!(
        User,
        r#"
        SELECT id, username
        FROM users
        WHERE username = $1
        "#,
        username
    )
    .fetch_optional(pool)
    .await
}
```

编译期检查很强，但也带来工程要求：CI 编译时要么能访问测试数据库，要么维护 SQLx offline 元数据。

## 三、SQLx 迁移

SQLx 支持迁移文件。常见目录：

```text
migrations/
  202605240001_create_users.sql
```

迁移内容：

```sql
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

应用启动时执行迁移：

```rust
use sqlx::PgPool;

async fn run_migrations(pool: &PgPool) -> Result<(), sqlx::migrate::MigrateError> {
    sqlx::migrate!("./migrations").run(pool).await
}
```

生产环境是否由应用自动迁移，要看团队流程：

- 小项目、内部服务：启动时自动迁移很方便。
- 多实例服务：要避免多个实例同时迁移，通常交给部署流水线或 migration job。
- 大表变更：需要 expand-contract 策略，不能一条锁表 SQL 直接上生产。

## 四、事务：保证多步写入一致

多步写入必须考虑事务。比如创建用户后创建 profile：

```rust
use sqlx::PgPool;

async fn create_user_with_profile(pool: &PgPool, username: &str) -> Result<i64, sqlx::Error> {
    let mut tx = pool.begin().await?;

    let user_id: i64 = sqlx::query_scalar(
        "INSERT INTO users (username) VALUES ($1) RETURNING id"
    )
    .bind(username)
    .fetch_one(&mut *tx)
    .await?;

    sqlx::query(
        "INSERT INTO profiles (user_id, display_name) VALUES ($1, $2)"
    )
    .bind(user_id)
    .bind(username)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(user_id)
}
```

如果中途任何一步返回错误，`tx` 被 drop 时会回滚。显式 `commit()` 成功后才真正提交。

事务边界要尽量短。不要在事务里等待外部 HTTP、发邮件、调用支付、做大计算。事务持有锁和连接，时间越长，对数据库整体吞吐影响越大。

## 五、连接池配置

连接池不是越大越好。连接数过多会把数据库压垮，过少会让应用排队。

```rust
use sqlx::postgres::PgPoolOptions;
use std::time::Duration;

async fn build_pool(database_url: &str) -> Result<sqlx::PgPool, sqlx::Error> {
    PgPoolOptions::new()
        .min_connections(1)
        .max_connections(20)
        .acquire_timeout(Duration::from_secs(3))
        .idle_timeout(Duration::from_secs(300))
        .max_lifetime(Duration::from_secs(30 * 60))
        .connect(database_url)
        .await
}
```

估算连接数时要考虑：

- 数据库最大连接数。
- 服务实例数量。
- 每个请求平均占用连接时间。
- 后台任务、迁移任务、管理工具也会占连接。
- 是否经过 PgBouncer 这类连接池代理。

如果服务有 10 个实例，每个实例 `max_connections=50`，数据库理论上可能被占 500 个连接。很多事故就是这么来的。

## 六、SeaORM：异步 ORM 与实体模型

SeaORM 构建在 SQLx 之上，更偏 ORM。它适合 CRUD 多、动态条件多、希望用 Rust 类型表达实体关系的项目。

```toml
[dependencies]
sea-orm = { version = "0.12", features = [
    "sqlx-postgres",
    "runtime-tokio-rustls",
    "macros",
] }
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

SeaORM 通常会生成 entity 模块。简化查询示例：

```rust
use sea_orm::{
    ColumnTrait, Database, DatabaseConnection, EntityTrait, QueryFilter,
};

// 假设已经由 sea-orm-cli 生成 entity::user
// mod entity;
// use entity::user;

async fn find_user(db: &DatabaseConnection, username: &str) -> Result<Option<user::Model>, sea_orm::DbErr> {
    user::Entity::find()
        .filter(user::Column::Username.eq(username))
        .one(db)
        .await
}

#[tokio::main]
async fn main() -> Result<(), sea_orm::DbErr> {
    let db = Database::connect("postgres://user:password@localhost/app").await?;
    let user = find_user(&db, "alice").await?;
    println!("{user:?}");
    Ok(())
}
```

上面代码依赖生成的 `user` entity，所以是接近可编译示例。真实项目一般通过：

```bash
sea-orm-cli generate entity -u postgres://user:password@localhost/app -o src/entity
```

生成实体，再在业务里使用。

## 七、SeaORM 插入、更新与分页

SeaORM 使用 ActiveModel 表达变更：

```rust
use sea_orm::{ActiveModelTrait, Set};

async fn create_user(db: &sea_orm::DatabaseConnection, username: String) -> Result<user::Model, sea_orm::DbErr> {
    let active = user::ActiveModel {
        username: Set(username),
        ..Default::default()
    };

    active.insert(db).await
}
```

分页查询：

```rust
use sea_orm::{EntityTrait, PaginatorTrait, QueryOrder};

async fn list_users(db: &sea_orm::DatabaseConnection, page: u64) -> Result<Vec<user::Model>, sea_orm::DbErr> {
    let paginator = user::Entity::find()
        .order_by_asc(user::Column::Id)
        .paginate(db, 20);

    paginator.fetch_page(page).await
}
```

ORM 的优势是动态查询和模型操作更顺手。代价是复杂 SQL、性能分析、数据库特性利用可能不如手写 SQL 直接。

## 八、在 Axum 中使用连接池

SQLx 连接池通常放进 Axum state。

```rust
use axum::{extract::State, routing::get, Json, Router};
use serde::Serialize;
use sqlx::PgPool;

#[derive(Clone)]
struct AppState {
    pool: PgPool,
}

#[derive(Serialize)]
struct Health {
    database: &'static str,
}

async fn db_health(State(state): State<AppState>) -> Result<Json<Health>, AppError> {
    sqlx::query("SELECT 1")
        .execute(&state.pool)
        .await
        .map_err(AppError::from)?;

    Ok(Json(Health { database: "ok" }))
}

fn app(pool: PgPool) -> Router {
    Router::new()
        .route("/health/db", get(db_health))
        .with_state(AppState { pool })
}

#[derive(Debug)]
struct AppError(anyhow::Error);

impl<E> From<E> for AppError
where
    E: Into<anyhow::Error>,
{
    fn from(err: E) -> Self {
        AppError(err.into())
    }
}
```

实际项目还需要给 `AppError` 实现 `IntoResponse`，上一篇已经讲过。

## 九、常见错误与修正

### 错误 1：每个请求创建连接池

错误做法：

```rust
// async fn handler() {
//     let pool = PgPoolOptions::new().connect(&database_url).await.unwrap();
// }
```

修正：应用启动时创建一次，注入 state。连接池就是为了跨请求复用连接。

### 错误 2：拼接 SQL 字符串

```rust
// let sql = format!("SELECT * FROM users WHERE username = '{username}'");
```

这会引入 SQL 注入风险。修正：使用参数绑定。

```rust
sqlx::query("SELECT id FROM users WHERE username = $1")
    .bind(username)
    .fetch_optional(pool)
    .await?;
```

### 错误 3：长事务里做外部调用

```rust
// begin transaction
// insert order
// call payment service
// update order
// commit
```

如果支付服务慢，事务会长时间占用连接和锁。修正：缩短事务，使用状态机、outbox、幂等键或补偿流程。

### 错误 4：把数据库错误直接返回给用户

数据库错误可能包含表名、字段名、连接信息。对外应该返回稳定错误码，对内记录详细日志。

### 错误 5：忽视 N+1 查询

ORM 容易写出循环里查数据库：

```rust
// for user in users {
//     load_orders(user.id).await?;
// }
```

修正：批量查询、join、预加载关系，或者针对热点路径手写 SQL。

## 十、SQLx 与 SeaORM 怎么选

选择 SQLx：

- 复杂查询多，联表、窗口函数、CTE、聚合很多。
- 团队熟 SQL，希望精准控制性能。
- 希望利用数据库特性。
- 接口较稳定，SQL 可读性比 ORM 抽象更重要。

选择 SeaORM：

- CRUD 多，后台管理、资源管理类系统。
- 动态过滤、排序、分页很多。
- 团队希望用实体和关系建模。
- 可接受 ORM 抽象带来的学习和性能分析成本。

混用也可以：主体用 SeaORM，复杂报表和热点查询用 SQLx。但要控制边界，避免同一张表的业务规则散落在两套数据访问层里。

## 十一、生产边界清单

数据库相关事故往往不是语法错误，而是边界没守住：

- 连接池大小按实例数和数据库容量计算。
- 查询有超时，上层请求也有超时。
- 慢查询有日志和指标。
- 迁移可回滚或有前滚方案。
- 大表变更分阶段发布。
- 事务短小，不跨外部服务。
- 错误对外脱敏，对内可观测。
- 对唯一约束、外键约束、序列化失败有明确处理。
- 测试环境覆盖迁移和关键 SQL。

## 十二、小结

SQLx 和 SeaORM 代表两种风格：SQLx 让你保留 SQL 的直接控制，并提供类型检查；SeaORM 用实体和查询构建器提升 CRUD 开发效率。

选型没有绝对答案。真正决定系统稳定性的，是连接池、迁移、事务、超时、错误处理和观测这些生产边界是否清楚。

下一篇 `23-Serde-序列化与反序列化.md` 会进入 Rust 生态中几乎所有 Web、配置、消息系统都会用到的基础库：Serde。
