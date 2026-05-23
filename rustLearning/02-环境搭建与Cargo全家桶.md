# 02-环境搭建与 Cargo 全家桶

> 一句话导读：学 Rust 不只是安装一个编译器，而是先把 `rustup`、`rustc`、`cargo`、`rust-analyzer` 这一整套工程工具链搭好。

如果你来自 C/C++，可能习惯了编译器、构建系统、包管理器、测试框架各管一摊；如果你来自 Python/Node，可能习惯了项目环境和依赖版本偶尔互相打架。Rust 的第一课不是语法，而是工具链：官方把版本管理、构建、测试、文档、依赖解析都收进了统一流程。

## 核心心智模型

把 Rust 工具链想成三层：

1. `rustup` 管工具链版本：安装 stable、beta、nightly，切换目标平台，更新本地文档。
2. `rustc` 负责真正编译：它是编译器本体，但日常开发很少直接调用。
3. `cargo` 负责工程生命周期：创建项目、下载依赖、编译、运行、测试、发布。

实际工作里，你大多数时间都在和 `cargo` 打交道。`rustc` 像发动机，`cargo` 像驾驶舱。

## 安装 Rust

macOS 和 Linux 推荐使用官方安装器：

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Windows 推荐使用 rustup-init 安装器。安装完成后，打开一个新的终端，确认命令可用：

```bash
rustc --version
cargo --version
rustup --version
```

常用命令：

```bash
rustup update
rustup show
rustup doc
rustup target list
```

`rustup doc` 很重要。它会打开本地离线文档，里面有标准库、书籍、Cargo 手册和各种 API 说明。Rust 的文档质量很高，越早习惯查官方文档越省时间。

## 创建第一个项目

使用 Cargo 创建二进制项目：

```bash
cargo new hello_rust
cd hello_rust
cargo run
```

目录结构通常是：

```text
hello_rust
├── Cargo.toml
├── Cargo.lock
└── src
    └── main.rs
```

`Cargo.toml` 是项目清单，声明包名、版本、edition 和依赖。`Cargo.lock` 锁定依赖的精确版本，保证团队和 CI 编译出同一套依赖图。`src/main.rs` 是二进制程序入口。

一个最小可运行程序如下：

```rust
fn main() {
    println!("hello, Rust");
}
```

运行：

```bash
cargo run
```

## Cargo 的日常命令

高频命令不多，但每个都要理解：

```bash
cargo check
cargo build
cargo run
cargo test
cargo fmt
cargo clippy
cargo build --release
```

`cargo check` 只做类型检查和借用检查，不生成最终二进制，速度通常比 `build` 快。写 Rust 时应该频繁运行它，因为 Rust 的很多反馈来自编译器。

`cargo build --release` 会启用优化，生成的程序通常快很多，但编译时间更长。开发期用 debug 构建，交付性能敏感程序时用 release 构建。

## Cargo.toml 该怎么看

一个常见配置如下：

```toml
[package]
name = "hello_rust"
version = "0.1.0"
edition = "2021"

[dependencies]
rand = "0.8"
serde = { version = "1", features = ["derive"] }
```

几个关键点：

- `edition` 不是编译器版本，而是一组语言兼容性规则。新项目通常使用当前稳定推荐的 edition。
- `[dependencies]` 放运行时依赖。
- `[dev-dependencies]` 放测试、基准、开发辅助依赖。
- feature 是依赖暴露的可选能力，常用于减少默认编译体积或开启派生宏。

添加依赖可以手写，也可以使用：

```bash
cargo add rand
cargo add serde --features derive
```

如果当前环境还没有 `cargo add`，可以更新工具链，或者安装 `cargo-edit`。

## 可编译示例：使用第三方依赖

在新项目中执行：

```bash
cargo add rand
```

然后把 `src/main.rs` 改成：

```rust
use rand::Rng;

fn main() {
    let mut rng = rand::thread_rng();
    let n = rng.gen_range(1..=100);

    println!("random number: {n}");
}
```

这段代码演示了 Cargo 的完整流程：解析依赖、下载 crate、编译依赖、编译当前包、运行程序。

## 常见编译器错误与修正

### 错误 1：命令找不到

```text
zsh: command not found: cargo
```

原因通常是安装后没有重新加载 shell 环境，或 PATH 没更新。

修正：

```bash
source "$HOME/.cargo/env"
cargo --version
```

如果仍然失败，重新打开终端，或检查 shell 配置文件是否加载了 `$HOME/.cargo/env`。

### 错误 2：crate 未声明

```rust
use rand::Rng;

fn main() {
    let n = rand::thread_rng().gen_range(1..=10);
    println!("{n}");
}
```

如果没有在 `Cargo.toml` 中添加 `rand`，会看到类似：

```text
error[E0432]: unresolved import `rand`
```

修正：

```bash
cargo add rand
```

或者手动添加：

```toml
[dependencies]
rand = "0.8"
```

### 错误 3：直接用 rustc 编译 Cargo 项目

如果项目依赖第三方 crate，直接运行：

```bash
rustc src/main.rs
```

通常会因为找不到依赖而失败。修正方式是使用：

```bash
cargo run
```

工程项目交给 Cargo，单文件实验才适合直接用 `rustc`。

## IDE 与代码质量工具

推荐组合：

- VS Code + `rust-analyzer`
- JetBrains RustRover
- Vim/Neovim + LSP + rust-analyzer

常用质量工具：

```bash
cargo fmt
cargo clippy
cargo test
```

`cargo fmt` 统一格式，减少无意义风格争论。`cargo clippy` 给出更地道的 Rust 建议，很多团队会把它放进 CI。`cargo test` 同时运行单元测试、集成测试和文档测试。

## 工程判断

项目刚开始时，不要急着上复杂工作区。一个二进制项目或一个库项目就够了。等出现多个包共享代码、多个可执行入口、或需要拆分 crate 编译边界时，再使用 Cargo workspace。

`Cargo.lock` 的提交策略也要分清：

- 应用程序：提交 `Cargo.lock`，保证部署和 CI 可复现。
- 库 crate：通常也可以提交，但发布到 crates.io 时库的依赖解析由使用方决定。

依赖版本不要盲目追新。Rust 生态更新快，但工程上更看重可维护性：依赖活跃、文档清楚、下载量和维护者可信，比版本号新更重要。

## 结尾总结

Rust 的开发体验建立在工具链之上：`rustup` 管版本，`cargo` 管工程，`rust-analyzer` 管编辑期反馈，`fmt`、`clippy`、`test` 管质量。把这套流程练熟，后面学习所有权、生命周期、并发时，编译器给你的反馈才会变成帮助，而不是噪音。

---

**下一篇：** `03-基础语法速通.md`，十分钟过完 Rust 里最常用的基础语法。
