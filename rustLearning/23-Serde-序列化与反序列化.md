# 23-Serde：序列化与反序列化

> 一句话导读：Serde 是 Rust 生态里最重要的数据转换框架，它把“结构体如何变成 JSON/TOML/YAML”和“外部数据如何安全变回结构体”这件事做成了可组合、可检查、性能很高的基础设施。

如果你写 Web API、CLI 配置、消息队列、日志采集、缓存、数据库 JSON 字段，几乎一定会碰到序列化和反序列化。

在动态语言里，JSON 往往被当作字典随手读写；在 Rust 里，更推荐先把数据形状建模成类型，然后让 Serde 负责边界转换。

这背后的收益是：

- 字段缺失、类型错误会在反序列化阶段集中暴露。
- 业务代码里拿到的是 `User`、`Order`、`Config`，而不是到处散落的字符串 key。
- 字段重命名、默认值、兼容老版本格式都可以通过 attribute 明确表达。

## 一、机制心智：Serde 不是 JSON 库，而是转换协议

Serde 由三个角色组成：

1. 你的 Rust 类型，比如 `User`、`Config`、`Event`。
2. 数据格式 crate，比如 `serde_json`、`toml`、`serde_yaml`、`bincode`。
3. 两个核心 trait：`Serialize` 和 `Deserialize`。

`serde_json::to_string(&user)` 的过程可以理解为：

```text
User 实现 Serialize
        |
        v
Serde 把字段逐个交给 JSON Serializer
        |
        v
输出 JSON 字符串
```

`serde_json::from_str::<User>(text)` 的过程相反：

```text
JSON Deserializer 读到字段和值
        |
        v
Serde 根据 User 的 Deserialize 实现填充字段
        |
        v
返回 Result<User, serde_json::Error>
```

大多数场景不需要手写 trait，实现由 derive 宏生成：

```toml
[dependencies]
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
```

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
struct Point {
    x: i32,
    y: i32,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let point = Point { x: 1, y: 2 };

    let json = serde_json::to_string(&point)?;
    println!("{json}");

    let decoded: Point = serde_json::from_str(&json)?;
    println!("{decoded:?}");

    Ok(())
}
```

关键点是：Serde 只定义“怎么访问结构”，具体格式由格式库决定。因此同一个结构体可以同时输出 JSON、TOML、YAML、MessagePack 或二进制格式。

## 二、字段命名、默认值和兼容性

真实项目里的外部数据经常和 Rust 命名规范不一致。前端可能给 `userId`，数据库 JSON 里可能是 `user_id`，老接口可能没有某些字段。

Serde 的 attribute 是处理这些差异的主力：

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UserResponse {
    user_id: i64,
    username: String,

    #[serde(default)]
    is_active: bool,

    #[serde(skip_serializing)]
    password_hash: String,

    #[serde(rename = "avatarURL")]
    avatar_url: Option<String>,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let text = r#"{
        "userId": 42,
        "username": "alice",
        "passwordHash": "not-send-back",
        "avatarURL": null
    }"#;

    let user: UserResponse = serde_json::from_str(text)?;
    let output = serde_json::to_string_pretty(&user)?;

    println!("{output}");
    Ok(())
}
```

这个例子里有几个工程上非常常见的决策：

- `rename_all = "camelCase"`：统一处理前后端命名差异。
- `default`：老版本客户端不传字段时保持兼容。
- `skip_serializing`：内部字段可以参与反序列化，但不吐给外部调用方。
- `Option<T>`：字段可以为 `null` 或缺失时，比给一个魔法默认值更明确。

## 三、输入模型和输出模型最好分开

新手常犯的错误是：数据库实体、创建请求、更新请求、接口响应都用同一个结构体。

这会导致两个问题：

1. 外部用户可以传入不该传的字段，比如 `id`、`role`、`created_at`。
2. 内部敏感字段容易被序列化出去，比如 `password_hash`。

更稳的做法是按边界建模：

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateUserRequest {
    username: String,
    password: String,
}

#[derive(Debug)]
struct UserRecord {
    id: i64,
    username: String,
    password_hash: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UserResponse {
    id: i64,
    username: String,
}

impl From<UserRecord> for UserResponse {
    fn from(value: UserRecord) -> Self {
        Self {
            id: value.id,
            username: value.username,
        }
    }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let input = r#"{"username":"alice","password":"secret"}"#;
    let req: CreateUserRequest = serde_json::from_str(input)?;

    let record = UserRecord {
        id: 1,
        username: req.username,
        password_hash: format!("hashed:{}", req.password),
    };

    let response = UserResponse::from(record);
    println!("{}", serde_json::to_string(&response)?);

    Ok(())
}
```

不要怕多写几个结构体。边界类型越清晰，安全性和可维护性越高。

## 四、处理枚举：Tagged、Untagged 和内部标签

Serde 对枚举支持很强，适合表达事件、消息、命令等多形态数据。

最常用的是 internally tagged enum：

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum Event {
    UserCreated { user_id: i64, username: String },
    PasswordChanged { user_id: i64 },
    UserDeleted { user_id: i64, reason: Option<String> },
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let event = Event::UserCreated {
        user_id: 7,
        username: "alice".to_string(),
    };

    let json = serde_json::to_string_pretty(&event)?;
    println!("{json}");

    let decoded: Event = serde_json::from_str(&json)?;
    println!("{decoded:?}");

    Ok(())
}
```

输出类似：

```json
{
  "type": "user_created",
  "user_id": 7,
  "username": "alice"
}
```

如果你接的是历史接口，没有明确的类型字段，可以考虑 `#[serde(untagged)]`，但要小心：untagged enum 是按变体顺序尝试匹配的，结构相近时可能误判。

## 五、自定义序列化：边界处转换，不污染业务模型

常见场景：内部用整数分表示金额，对外输出小数字符串；内部用时间戳，对外输出 RFC3339。

可以用 `serialize_with` 和 `deserialize_with` 做局部转换：

```rust
use serde::{Deserialize, Deserializer, Serialize, Serializer};

fn cents_to_string<S>(cents: &i64, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    let major = *cents / 100;
    let minor = cents.abs() % 100;
    serializer.serialize_str(&format!("{major}.{minor:02}"))
}

fn string_to_cents<'de, D>(deserializer: D) -> Result<i64, D::Error>
where
    D: Deserializer<'de>,
{
    let s = String::deserialize(deserializer)?;
    let (major, minor) = s
        .split_once('.')
        .ok_or_else(|| serde::de::Error::custom("money must look like 12.34"))?;
    let major: i64 = major.parse().map_err(serde::de::Error::custom)?;
    let minor: i64 = minor.parse().map_err(serde::de::Error::custom)?;
    Ok(major * 100 + minor)
}

#[derive(Debug, Serialize, Deserialize)]
struct Invoice {
    id: String,
    #[serde(
        serialize_with = "cents_to_string",
        deserialize_with = "string_to_cents"
    )]
    amount_cents: i64,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let invoice = Invoice {
        id: "INV-001".to_string(),
        amount_cents: 1299,
    };

    let json = serde_json::to_string(&invoice)?;
    println!("{json}");

    let decoded: Invoice = serde_json::from_str(r#"{"id":"INV-002","amount_cents":"88.50"}"#)?;
    println!("{decoded:?}");

    Ok(())
}
```

工程经验是：转换逻辑应该尽量留在 IO 边界，不要让业务模型为了迁就 JSON 格式变得奇怪。

## 六、什么时候用 `serde_json::Value`

`serde_json::Value` 很像动态语言里的 JSON 对象：

```rust
use serde_json::Value;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let data = r#"{
        "name": "alice",
        "features": {
            "beta": true
        }
    }"#;

    let value: Value = serde_json::from_str(data)?;

    if value["features"]["beta"].as_bool() == Some(true) {
        println!("beta enabled");
    }

    Ok(())
}
```

它适合：

- 日志、埋点、调试工具这类结构不稳定的数据。
- 网关透传，不想理解全部字段。
- 只读取少数字段的大型外部响应。

它不适合：

- 核心业务入参。
- 数据库实体。
- 需要长期维护的 API 契约。

因为 `value["foo"]["bar"]` 写起来轻松，但类型错误会从编译期推迟到运行期。

## 七、常见坑

### 1. 忘记开启 derive feature

如果看到 `cannot find derive macro Serialize`，先检查依赖：

```toml
serde = { version = "1.0", features = ["derive"] }
```

### 2. 字段缺失导致整个解析失败

如果字段是兼容性字段，使用 `Option<T>` 或 `#[serde(default)]`。

```rust
#[derive(serde::Deserialize)]
struct Config {
    #[serde(default = "default_port")]
    port: u16,
}

fn default_port() -> u16 {
    8080
}
```

### 3. `skip_serializing` 不是 `skip_deserializing`

`skip_serializing` 只是不输出；反序列化时仍然会读。敏感字段最好通过不同的请求/响应类型隔离。

### 4. 反序列化错误不要直接 `unwrap`

Web 服务里应该把错误转换成 400，并返回可读信息；CLI 里也应该指出配置文件路径和字段位置。

### 5. `untagged` enum 顺序影响结果

两个变体字段相近时，Serde 会先尝试前面的变体。最好使用明确的 `tag` 字段。

## 八、工程边界

应该使用 Serde 的场景：

- API 请求和响应。
- 配置文件。
- 消息队列和事件。
- 缓存值编码。
- 测试快照和 fixture。

需要谨慎的场景：

- 超大 JSON 流式处理：优先考虑 streaming deserializer，避免一次性读入内存。
- 高安全边界输入：要配合字段白名单、长度限制、业务校验。
- 长期兼容协议：要明确版本字段，而不是无限堆 `Option`。

不建议的做法：

- 所有地方都用 `Value`。
- 一个结构体同时承担 DB、API、业务、日志四种职责。
- 直接把外部输入反序列化成内部权限模型。

## 九、结尾总结

Serde 的核心价值不是“少写 JSON 解析代码”，而是把外部数据边界变成可声明、可测试、可组合的类型系统入口。

日常使用时记住三条：

1. 优先定义明确结构体，不要滥用 `Value`。
2. 输入模型、输出模型、内部模型尽量分开。
3. 兼容性、默认值、重命名都写在边界类型上。

掌握 Serde 后，你会发现 Rust 写 Web API、配置系统和数据管道时并不笨重，反而因为类型边界清楚，后期维护更稳。

---
**下一篇：** `24-自动化测试与CI_CD.md`，用 Cargo 的内置测试能力和 CI 把质量检查自动化。
