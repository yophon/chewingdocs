# 24-自动化测试与 CI/CD

> 一句话导读：Rust 的测试体系不是额外插件，而是 Cargo、编译器、文档和 CI 共同组成的一套质量门禁。

Rust 项目里，测试不只是 `cargo test`。一个成熟的检查链通常包括：

- `cargo fmt -- --check`：格式是否统一。
- `cargo clippy -- -D warnings`：是否有明显坏味道。
- `cargo test`：单元测试、集成测试、文档测试是否通过。
- `cargo build --release`：发布构建是否成立。
- 安全和依赖检查：比如 `cargo audit`、`cargo deny`。

本篇重点讲测试怎么组织，以及如何放进 GitHub Actions。

## 一、机制心智：Rust 测试也是普通 Rust 代码

Rust 没有把测试做成魔法语言。测试函数就是被 `#[test]` 标记的普通函数。

当你运行：

```bash
cargo test
```

Cargo 会：

1. 编译你的库和二进制。
2. 编译带 `#[cfg(test)]` 的测试模块。
3. 编译 `tests/` 目录里的集成测试。
4. 编译文档注释里的代码块。
5. 运行测试二进制并收集结果。

这意味着测试同样受所有权、生命周期、类型系统约束。能编译过的测试，本身就已经帮你过滤掉一批低级错误。

## 二、单元测试：贴着实现写

单元测试适合验证单个函数、结构体方法、私有辅助逻辑。

`src/lib.rs`：

```rust
pub fn normalize_username(input: &str) -> Option<String> {
    let name = input.trim().to_lowercase();

    if name.is_empty() || name.len() > 32 {
        return None;
    }

    if !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
        return None;
    }

    Some(name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trims_and_lowercases_username() {
        assert_eq!(
            normalize_username("  Alice_01 "),
            Some("alice_01".to_string())
        );
    }

    #[test]
    fn rejects_empty_username() {
        assert_eq!(normalize_username("   "), None);
    }

    #[test]
    fn rejects_invalid_chars() {
        assert_eq!(normalize_username("alice!"), None);
    }
}
```

`#[cfg(test)]` 的意思是：只有测试构建会编译这个模块。生产构建不会带上这些测试代码。

常用断言：

```rust
assert!(value > 0);
assert_eq!(left, right);
assert_ne!(left, right);
panic!("unexpected branch");
```

测试 panic：

```rust
pub fn divide(a: i32, b: i32) -> i32 {
    if b == 0 {
        panic!("division by zero");
    }
    a / b
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[should_panic(expected = "division by zero")]
    fn panics_when_dividing_by_zero() {
        divide(10, 0);
    }
}
```

工程上更推荐返回 `Result` 而不是 panic；`should_panic` 适合测试确实应该崩的底层不变量。

## 三、测试返回 Result，少用 unwrap

测试函数可以返回 `Result`。这样你可以直接用 `?`：

```rust
use std::fs;

fn parse_port(input: &str) -> Result<u16, std::num::ParseIntError> {
    input.trim().parse()
}

#[test]
fn parses_port_from_file() -> Result<(), Box<dyn std::error::Error>> {
    fs::write("target/test-port.txt", "8080")?;

    let text = fs::read_to_string("target/test-port.txt")?;
    let port = parse_port(&text)?;

    assert_eq!(port, 8080);
    Ok(())
}
```

注意这里把临时文件写到 `target/` 下，避免污染源码目录。

## 四、集成测试：从外部调用公开 API

集成测试放在项目根目录的 `tests/` 下，它把你的 crate 当作外部依赖，只能访问 `pub` API。

目录结构：

```text
my_project/
├── Cargo.toml
├── src/
│   └── lib.rs
└── tests/
    └── user_api_test.rs
```

`src/lib.rs`：

```rust
pub fn build_greeting(name: &str) -> String {
    format!("Hello, {name}!")
}
```

`tests/user_api_test.rs`：

```rust
use my_project::build_greeting;

#[test]
fn builds_public_greeting() {
    assert_eq!(build_greeting("Rust"), "Hello, Rust!");
}
```

集成测试适合：

- 验证库的公共 API。
- 验证多个模块协作。
- 从用户视角测试行为，而不是测试内部实现。

如果 `tests/` 里多个测试文件要共享工具函数，可以放在 `tests/common/mod.rs`，然后在测试里 `mod common;`。

## 五、文档测试：让示例永远不过期

Rust 会运行文档注释里的代码块：

````rust
/// Adds two numbers.
///
/// ```
/// let result = my_project::add(2, 3);
/// assert_eq!(result, 5);
/// ```
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}
````

文档测试适合公共库。它能防止 README 和 API 文档里的示例悄悄坏掉。

如果示例只展示编译，不想运行，可以标记：

````rust
/// ```no_run
/// let client = expensive_network_client();
/// client.call();
/// ```
````

如果示例故意无法编译，可以标记：

````rust
/// ```compile_fail
/// let x: i32 = "not a number";
/// ```
````

## 六、异步测试

Web 服务和数据库代码通常是 async。Tokio 提供了测试宏：

```toml
[dependencies]
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

```rust
async fn fetch_user_name(id: u64) -> Option<String> {
    if id == 1 {
        Some("alice".to_string())
    } else {
        None
    }
}

#[tokio::test]
async fn fetches_existing_user() {
    let name = fetch_user_name(1).await;
    assert_eq!(name.as_deref(), Some("alice"));
}
```

异步测试要注意：

- 不要依赖测试执行顺序。
- 不要多个测试抢同一个端口。
- 数据库测试要用独立 schema、事务回滚或容器化测试库。

## 七、Mock 和测试替身：优先抽象边界

Rust 里不太流行运行期 monkey patch。更常见的做法是把外部依赖抽象成 trait。

```rust
trait EmailSender {
    fn send(&self, to: &str, body: &str) -> Result<(), String>;
}

struct SignupService<S> {
    sender: S,
}

impl<S: EmailSender> SignupService<S> {
    fn signup(&self, email: &str) -> Result<(), String> {
        self.sender.send(email, "welcome")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    struct FakeEmailSender {
        sent_to: RefCell<Vec<String>>,
    }

    impl EmailSender for FakeEmailSender {
        fn send(&self, to: &str, _body: &str) -> Result<(), String> {
            self.sent_to.borrow_mut().push(to.to_string());
            Ok(())
        }
    }

    #[test]
    fn sends_welcome_email() {
        let sender = FakeEmailSender {
            sent_to: RefCell::new(Vec::new()),
        };
        let service = SignupService { sender };

        service.signup("a@example.com").unwrap();

        assert_eq!(service.sender.sent_to.borrow()[0], "a@example.com");
    }
}
```

如果项目大量使用 trait mock，可以考虑 `mockall`；但对于多数业务代码，手写 fake 更清晰。

## 八、CI 配置模板

`.github/workflows/rust.yml`：

```yaml
name: Rust CI

on:
  push:
    branches: ["main"]
  pull_request:
    branches: ["main"]

env:
  CARGO_TERM_COLOR: always

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt, clippy

      - name: Cache cargo
        uses: Swatinem/rust-cache@v2

      - name: Check formatting
        run: cargo fmt --all -- --check

      - name: Clippy
        run: cargo clippy --all-targets --all-features -- -D warnings

      - name: Test
        run: cargo test --all-features

      - name: Release build
        run: cargo build --release --all-features
```

如果是 workspace，`--all-targets --all-features` 能覆盖更多目标，但也可能让 feature 组合变复杂。库项目可以再加 matrix 测试不同 Rust 版本。

## 九、常见坑

### 1. 测试依赖时间和顺序

测试默认并行执行。不要让 `test_a` 创建文件，`test_b` 假设这个文件存在。

如果确实要串行，优先重构测试隔离；最后才考虑：

```bash
cargo test -- --test-threads=1
```

### 2. 测试里连共享数据库

多个测试同时写同一张表，会产生脏数据和偶发失败。可以使用唯一数据库名、事务回滚、测试容器或内存替代。

### 3. CI 只跑 `cargo test`

`cargo test` 不等于质量门禁。格式、Clippy、feature 组合、release 编译都可能暴露不同问题。

### 4. 过度 mock 内部细节

测试应该关心行为，而不是实现步骤。否则重构代码会导致大量测试无意义失败。

### 5. `#[ignore]` 后再也没人运行

慢测试可以标记：

```rust
#[test]
#[ignore = "requires external service"]
fn calls_real_payment_gateway() {}
```

但 CI 应该有定时任务运行：

```bash
cargo test -- --ignored
```

## 十、工程边界

应该强制自动化的检查：

- PR 必跑格式、Clippy、测试。
- 发布前跑 release build。
- 公共库跑文档测试。
- 关键服务跑数据库迁移测试或接口测试。

不必一开始就上的东西：

- 很重的端到端测试。
- 覆盖率硬门槛。
- 复杂的 mock 框架。
- 多平台 matrix。

好的策略是从轻量门禁开始，把真正出过事故的地方逐步自动化。

## 十一、结尾总结

Rust 的测试体验强在“和工具链是一体的”。单元测试贴着实现，集成测试站在用户视角，文档测试保护示例，CI 把这些检查变成合并前的硬门槛。

建议每个 Rust 项目至少保留这条命令链：

```bash
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-features
cargo build --release --all-features
```

先让这条链稳定，再谈更复杂的质量工程。

---
**下一篇：** `25-实战：写一个带Auth的RESTful_API.md`，把 Axum、SQLx、Serde 和 JWT 串成一个真实 Web 服务。
