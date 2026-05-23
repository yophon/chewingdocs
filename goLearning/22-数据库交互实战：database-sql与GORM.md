# 数据库交互实战：database/sql 与 GORM

> **导读**：Go 访问关系型数据库有两条主线：`database/sql` 提供稳定底层能力，GORM 提供更高开发效率；真正的重点是连接池、事务、超时和 SQL 边界。

## 一、工程场景：订单服务如何访问数据库

一个订单服务通常会遇到这些问题：

- 查询用户订单列表。
- 创建订单时同时写订单表和流水表。
- 更新状态时要避免并发覆盖。
- 接口超时后数据库查询要及时取消。
- 慢 SQL 和连接池耗尽要能被发现。

无论使用原生 SQL 还是 ORM，这些问题都绕不开。

## 二、database/sql 的定位

`database/sql` 是标准库里的数据库抽象层。它不包含具体数据库驱动，需要自己引入驱动。

以 MySQL 为例：

```bash
go mod init sql-demo
go get github.com/go-sql-driver/mysql
```

示例代码：

```go
package main

import (
    "context"
    "database/sql"
    "errors"
    "fmt"
    "log"
    "time"

    _ "github.com/go-sql-driver/mysql"
)

type User struct {
    ID        int64
    Name      string
    Email     sql.NullString
    CreatedAt time.Time
}

func main() {
    dsn := "root:pass@tcp(127.0.0.1:3306)/app?parseTime=true&charset=utf8mb4&loc=Local"
    db, err := sql.Open("mysql", dsn)
    if err != nil {
        log.Fatal(err)
    }
    defer db.Close()

    db.SetMaxOpenConns(50)
    db.SetMaxIdleConns(10)
    db.SetConnMaxLifetime(30 * time.Minute)
    db.SetConnMaxIdleTime(5 * time.Minute)

    ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
    defer cancel()

    if err := db.PingContext(ctx); err != nil {
        log.Fatal(err)
    }

    user, err := FindUser(ctx, db, 1)
    if err != nil {
        log.Fatal(err)
    }
    fmt.Printf("%+v\n", user)
}

func FindUser(ctx context.Context, db *sql.DB, id int64) (*User, error) {
    const query = `
SELECT id, name, email, created_at
FROM users
WHERE id = ?
`
    var u User
    err := db.QueryRowContext(ctx, query, id).Scan(&u.ID, &u.Name, &u.Email, &u.CreatedAt)
    if errors.Is(err, sql.ErrNoRows) {
        return nil, nil
    }
    if err != nil {
        return nil, err
    }
    return &u, nil
}
```

注意 `sql.Open` 不会立刻建立连接，它主要初始化连接池。真正验证连通性要用 `PingContext`。

## 三、连接池不是可选配置

`*sql.DB` 代表连接池，不是单条连接。生产中要显式设置：

```go
db.SetMaxOpenConns(50)
db.SetMaxIdleConns(10)
db.SetConnMaxLifetime(30 * time.Minute)
db.SetConnMaxIdleTime(5 * time.Minute)
```

常见判断：

- `MaxOpenConns` 不能超过数据库承受能力，也要考虑服务副本数。
- `MaxIdleConns` 太低会导致频繁建连，太高会浪费连接。
- `ConnMaxLifetime` 应该小于数据库或负载均衡的连接回收时间。
- 所有查询都尽量用 `QueryContext`、`ExecContext`、`BeginTx`。

可以暴露 `db.Stats()` 到监控，关注 `WaitCount`、`WaitDuration`、`OpenConnections`。

## 四、事务：把一致性边界写清楚

创建订单时，订单表和流水表必须一起成功或一起失败。

```go
func CreateOrder(ctx context.Context, db *sql.DB, userID int64, amount int64) error {
    tx, err := db.BeginTx(ctx, &sql.TxOptions{
        Isolation: sql.LevelReadCommitted,
    })
    if err != nil {
        return err
    }
    defer tx.Rollback()

    res, err := tx.ExecContext(ctx,
        "INSERT INTO orders(user_id, amount, status) VALUES(?, ?, ?)",
        userID, amount, "created",
    )
    if err != nil {
        return err
    }

    orderID, err := res.LastInsertId()
    if err != nil {
        return err
    }

    _, err = tx.ExecContext(ctx,
        "INSERT INTO order_events(order_id, event) VALUES(?, ?)",
        orderID, "created",
    )
    if err != nil {
        return err
    }

    return tx.Commit()
}
```

`defer tx.Rollback()` 即使在 `Commit` 成功后执行也会返回错误，通常可以忽略。它的价值是保证中途 return 时事务不会悬挂。

## 五、查询多行与资源释放

```go
func ListUsers(ctx context.Context, db *sql.DB, limit int) ([]User, error) {
    rows, err := db.QueryContext(ctx,
        "SELECT id, name, email, created_at FROM users ORDER BY id DESC LIMIT ?",
        limit,
    )
    if err != nil {
        return nil, err
    }
    defer rows.Close()

    var users []User
    for rows.Next() {
        var u User
        if err := rows.Scan(&u.ID, &u.Name, &u.Email, &u.CreatedAt); err != nil {
            return nil, err
        }
        users = append(users, u)
    }
    if err := rows.Err(); err != nil {
        return nil, err
    }
    return users, nil
}
```

关键点：

- `rows.Close()` 必须调用，否则连接可能无法及时归还连接池。
- 循环结束后检查 `rows.Err()`。
- NULL 字段用 `sql.NullString`、`sql.NullInt64` 或指针接收。

## 六、GORM 快速落地

GORM 适合 CRUD 较多、模型关系明显、开发效率优先的业务。

```bash
go get gorm.io/gorm
go get gorm.io/driver/mysql
```

```go
package main

import (
    "context"
    "time"

    "gorm.io/driver/mysql"
    "gorm.io/gorm"
)

type Product struct {
    ID        uint           `gorm:"primaryKey"`
    Name      string         `gorm:"size:128;not null"`
    Price     int64          `gorm:"not null"`
    Stock     int            `gorm:"not null"`
    CreatedAt time.Time
    UpdatedAt time.Time
    DeletedAt gorm.DeletedAt `gorm:"index"`
}

func openGORM(dsn string) (*gorm.DB, error) {
    db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
    if err != nil {
        return nil, err
    }

    sqlDB, err := db.DB()
    if err != nil {
        return nil, err
    }
    sqlDB.SetMaxOpenConns(50)
    sqlDB.SetMaxIdleConns(10)
    sqlDB.SetConnMaxLifetime(30 * time.Minute)

    return db, nil
}

func FindProduct(ctx context.Context, db *gorm.DB, id uint) (*Product, error) {
    var p Product
    err := db.WithContext(ctx).First(&p, id).Error
    if err == gorm.ErrRecordNotFound {
        return nil, nil
    }
    if err != nil {
        return nil, err
    }
    return &p, nil
}
```

即使用 GORM，也要拿到底层 `sql.DB` 配置连接池。

## 七、GORM 事务与更新

```go
func DecreaseStock(ctx context.Context, db *gorm.DB, productID uint, count int) error {
    return db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
        result := tx.Model(&Product{}).
            Where("id = ? AND stock >= ?", productID, count).
            UpdateColumn("stock", gorm.Expr("stock - ?", count))

        if result.Error != nil {
            return result.Error
        }
        if result.RowsAffected == 0 {
            return errors.New("not enough stock")
        }

        return nil
    })
}
```

这里没有先查库存再更新，因为那样容易并发超卖。用条件更新让数据库在一条 SQL 内完成判断和修改。

需要 import：

```go
import "errors"
```

## 八、关键坑位

### 1. SQL 注入

不要拼接用户输入：

```go
db.Where("name = " + name).Find(&users)
```

应该使用占位符：

```go
db.Where("name = ?", name).Find(&users)
```

原生 SQL 同理，所有外部输入都用参数绑定。

### 2. GORM 零值更新

```go
db.Model(&user).Updates(User{Name: "", Age: 0})
```

GORM 用 struct 更新时会忽略零值。需要更新零值时用 map 或 `Select`：

```go
db.Model(&user).Updates(map[string]any{"name": "", "age": 0})
```

### 3. AutoMigrate 不是完整迁移系统

`AutoMigrate` 适合开发期或简单项目，不适合替代生产迁移。生产数据库变更应该使用版本化迁移工具，并经过审核、灰度和回滚设计。

### 4. N+1 查询

循环里逐条查关联数据会把数据库打爆：

```go
for _, order := range orders {
    db.Where("order_id = ?", order.ID).Find(&items)
}
```

应使用批量查询或 `Preload`，并关注生成的 SQL。

### 5. 长事务

事务里不要做网络请求、文件操作、复杂计算。事务持有锁和连接，时间越长越容易阻塞其他请求。

### 6. SELECT *

大表查询不要无脑 `SELECT *`。只查需要的字段，配合索引和分页。

## 九、生产判断

什么时候选 `database/sql`：

- SQL 较复杂，必须精确控制执行计划。
- 团队 DBA 参与较多，SQL 可读性和审计很重要。
- 服务性能敏感，不希望 ORM 隐藏查询。

什么时候选 GORM：

- CRUD 占多数，模型关系清晰。
- 团队更看重开发效率。
- 能接受对生成 SQL 做持续审查。

无论选哪种，都要做到：

- 所有数据库调用传 Context。
- 配置连接池并接入监控。
- 慢 SQL 有日志和指标。
- 事务边界明确。
- 外部输入全部参数化。

## 十、总结

`database/sql` 是稳定、透明、可控的底层能力，GORM 是提升 CRUD 效率的上层工具。真正决定数据库访问质量的不是选哪一个库，而是是否正确处理连接池、事务、超时、NULL、资源释放和 SQL 注入。生产代码里，数据库访问应该是可观测、可取消、可审计的。
