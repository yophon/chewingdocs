# 22-数据库交互：SQLx 与 SeaORM

> "在 Rust 生态中，你既可以选择写原生 SQL 但享受编译期安全（SQLx），也可以选择现代化的异步 ORM（SeaORM）。"

以前大家用 Diesel，但它是同步的，和 Tokio 配合不好。现在，异步数据库操作的基石是 **SQLx**。

## 一、SQLx：编译期检查的 SQL

SQLx 不是 ORM，它不帮你拼接 SQL。它让你手写原生 SQL，但在**编译阶段**，它会连上你的本地测试数据库，检查你的 SQL 语句语法对不对、表和字段存不存在！

```toml
[dependencies]
# 引入宏、运行时绑定和 postgres 驱动
sqlx = { version = "0.7", features = ["runtime-tokio", "postgres", "macros"] }
```

### 连接池与查询
```rust
use sqlx::postgres::PgPoolOptions;

// 定义一个映射数据表的结构体，必须 derive FromRow
#[derive(sqlx::FromRow, Debug)]
struct User {
    id: i64,
    username: String,
}

#[tokio::main]
async fn main() -> Result<(), sqlx::Error> {
    // 1. 创建连接池
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect("postgres://user:password@localhost/mydb").await?;

    // 2. 神奇的 query_as! 宏
    // 编译时会检查这段 SQL。如果写错了字段名，编译直接报错！
    let user = sqlx::query_as!(
        User,
        "SELECT id, username FROM users WHERE username = $1", // $1 是 Postgres 的参数占位符
        "alice"
    )
    .fetch_one(&pool) // 执行并期待返回一条数据
    .await?;

    println!("找到了用户: {:?}", user);
    Ok(())
}
```

## 二、SeaORM：现代异步 ORM

如果你实在讨厌手写 SQL，喜欢 Entity 操作，SeaORM 是构建在 SQLx 之上的最强 ORM。

它的特色是：
1. **完全基于宏**：可以从数据库逆向生成全套的 Rust Entity 代码。
2. **构建器模式**：纯 Rust 代码拼接查询条件。

```rust
// SeaORM 的伪代码示例
use sea_orm::*;

let users: Vec<user::Model> = User::find()
    .filter(user::Column::Username.eq("alice"))
    .order_by_asc(user::Column::Id)
    .all(&db_conn)
    .await?;
```

### 选型建议
- 如果你的业务逻辑全是极度复杂的联表查询、各种统计聚合，且 SQL 很长，**强推原生 SQLx**，编译期检查能拯救你无数次。
- 如果你的业务偏 CRUD，有很多动态生成条件的查询（比如后台管理系统按各种维度过滤数据），**选 SeaORM**。

---
**下一篇：** `23-Serde-序列化与反序列化.md`，聊聊 Rust 社区拥有绝对统治力的库。
