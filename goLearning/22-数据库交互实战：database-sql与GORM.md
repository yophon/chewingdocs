# 数据库交互实战：database/sql 与 GORM

> **导读**：在 Go 中，你可以使用标准库手写原生 SQL，也可以使用 GORM 这类全功能 ORM 提高开发效率。

## 一、原生 database/sql
Go 标准库不提供具体数据库驱动，只提供接口规范。你需要引入具体的驱动（如 MySQL）。

```go
import (
    "database/sql"
    _ "github.com/go-sql-driver/mysql" // 匿名引入，仅执行包内的 init() 注册驱动
)

func main() {
    // 连接池自带，不需要额外配置第三方连接池库！
    db, err := sql.Open("mysql", "user:pass@tcp(127.0.0.1:3306)/dbname")
    db.SetMaxOpenConns(100)
    
    // 查询
    var name string
    err = db.QueryRow("SELECT name FROM users WHERE id = ?", 1).Scan(&name)
}
```

## 二、GORM 快速上手
GORM 是 Go 最火的 ORM，支持链式调用，极大减轻了 CRUD 代码量。

```go
type User struct {
    gorm.Model // 自带 ID, CreatedAt, UpdatedAt, DeletedAt (软删)
    Name string `gorm:"size:255;not null"`
    Age  int
}

// 连接与自动建表
db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
db.AutoMigrate(&User{})

// 创建
db.Create(&User{Name: "Alice", Age: 18})

// 查询
var u User
db.Where("name = ?", "Alice").First(&u)

// 更新
db.Model(&u).Update("Age", 20)
```

## 三、高级与避坑
1. **预编译防注入**：无论是标准库还是 GORM，尽量使用 `?` 占位符传参，不要直接拼接字符串，以防 SQL 注入。
2. **GORM 的 Zero Value 陷阱**：当你使用 Struct 更新记录时，如果某个字段被置为零值（如 0, "", false），GORM 会忽略该字段。解法：使用 map 更新，或者将字段类型改为指针 `*int`。
3. **软删除陷阱**：嵌套了 `gorm.Model` 的表默认开启软删除，`Delete` 操作只是把 `DeletedAt` 填上时间，查询时会自动过滤。如果想真删，要用 `db.Unscoped().Delete(...)`。
