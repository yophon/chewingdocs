# 23-Serde：序列化与反序列化

> "如果说有什么第三方库是每一个 Rust 程序员都绕不过去的，那一定是在 crates.io 上下载量霸榜第一的 Serde。"

Serde 名字来源于 Serialize 和 Deserialize。它是 Rust 数据结构和数据格式（JSON, YAML, TOML等）转换的通用框架。最关键的是，它的性能极其恐怖，是世界上最快的 JSON 解析器之一。

## 一、一键 JSON 转换

引入依赖（通常配套 `serde_json` 使用）：
```toml
[dependencies]
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
```

只需要在你的结构体上加一行 `#[derive(Serialize, Deserialize)]` 宏！

```rust
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug)]
struct Point {
    x: i32,
    y: i32,
}

fn main() {
    let point = Point { x: 1, y: 2 };

    // 1. Rust 结构体 -> JSON 字符串
    let serialized = serde_json::to_string(&point).unwrap();
    println!("JSON: {}", serialized); // {"x":1,"y":2}

    // 2. JSON 字符串 -> Rust 结构体
    let deserialized: Point = serde_json::from_str(&serialized).unwrap();
    println!("Struct: {:?}", deserialized);
}
```

## 二、神级重命名与字段控制（Attribute 宏）

实际开发中，前端传过来的 JSON 经常和我们的后端结构体命名规范（`snake_case`）冲突。Serde 提供了极其方便的字段控制：

```rust
#[derive(Serialize, Deserialize, Debug)]
// 1. 自动转换驼峰命名法：前端传 { "userId": 1 }，后端自动映射到 user_id
#[serde(rename_all = "camelCase")] 
struct User {
    user_id: i32,
    
    // 2. 如果 JSON 里没有这个字段，赋予默认值，而不是反序列化失败报错
    #[serde(default)] 
    is_active: bool,
    
    // 3. 序列化时，不把密码吐给前端
    #[serde(skip_serializing)] 
    password_hash: String,
    
    // 4. 强制重命名某个特定的字段
    #[serde(rename = "CLASS")] 
    class_name: String,
}
```

## 三、处理未知结构的 JSON：`serde_json::Value`

如果你接外部 API，传过来的 JSON 结构千奇百怪，你不想写死结构体，可以使用泛型的 `Value` 类型：

```rust
use serde_json::Value;

fn main() {
    let data = r#"
        {
            "name": "John Doe",
            "age": 43,
            "phones": [ "+44 1234567", "+44 2345678" ]
        }
    "#;

    // 解析为泛型 Value
    let v: Value = serde_json::from_str(data).unwrap();

    // 像操作 JS 对象一样去访问它
    println!("第一个电话号码: {}", v["phones"][0]);
}
```
**注意**：尽可能定义结构体。频繁使用 `Value` 会丧失 Rust 类型安全带来的所有好处。

---
**下一篇：** `24-自动化测试与CI_CD.md`，教你用内置的 Cargo 测试框架写单元测试和集成测试。
