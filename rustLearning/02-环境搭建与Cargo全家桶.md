# 02-环境搭建与Cargo全家桶

> "别把 Cargo 当成普通的构建工具，它是整个 Rust 生态的灵魂。"

如果你以前用过 C++ (CMake 噩梦) 或者 Python (pip/conda 环境地狱)，你会觉得 Rust 的工具链好得令人发指。

## 一、安装 Rustup

Rust 的官方安装工具叫 `rustup`。它不仅能安装编译器，还能管理不同的工具链版本（比如 stable、beta、nightly）。

在 macOS/Linux 上，只需一行命令：
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

安装完成后，输入以下命令验证：
```bash
rustc --version
cargo --version
```

### 常用 rustup 命令
- `rustup update`: 更新工具链到最新版本。
- `rustup doc`: 在本地打开离线的官方文档（断网也能学）。

## 二、Cargo：Rust 的大管家

Cargo 兼具了 npm（包管理）、Make（构建）、Jest（测试）甚至更多功能。

### 1. 创建新项目
```bash
cargo new hello_rust
cd hello_rust
```
这会生成一个最基本的目录结构：
- `Cargo.toml`: 项目配置和依赖声明（类似于 `package.json`）。
- `src/main.rs`: 源代码入口。

### 2. 核心命令 (每天都要敲几百遍)
- `cargo build`: 编译项目。
- `cargo run`: 编译并直接运行。
- `cargo check`: **高频使用！** 只检查代码能不能编译通过，不生成可执行文件，速度极快。写代码时应该习惯不断运行 `cargo check` 而不是 `build`。
- `cargo test`: 跑单元测试和集成测试。
- `cargo build --release`: 打包生产环境的优化版本（编译时间变长，但运行速度有极大飞跃）。

## 三、Cargo.toml 解析

```toml
[package]
name = "hello_rust"
version = "0.1.0"
edition = "2021" # Rust 的版本，目前主流是 2021

[dependencies]
# 格式：库名 = "版本号"
rand = "0.8.5"
serde = { version = "1.0", features = ["derive"] } # 启用特定的 feature
```

## 四、推荐的神仙插件

随着工程变大，原生的 Cargo 不够用，可以安装这些扩展：

1. **cargo-watch**: 监视文件变化并自动运行命令，像前端的 nodemon。
   - 安装：`cargo install cargo-watch`
   - 使用：`cargo watch -x check` 或 `cargo watch -x run`
2. **cargo-edit**: 在命令行直接添加依赖，无需手改 TOML。
   - 安装：`cargo install cargo-edit`
   - 使用：`cargo add serde` (类似于 `npm install serde`)
3. **cargo-tree**: 早就内置了！运行 `cargo tree` 可以查看清晰的依赖树，解决冲突神器。

## 五、IDE 配置

**唯一推荐组合**：VSCode + **rust-analyzer** 插件（或者直接用 JetBrains 的 RustRover）。
*注意：不要装官方那个叫 `Rust` 的老插件，它已经被淘汰了。认准 `rust-analyzer`。*

---
**下一篇：** `03-基础语法速通.md`，十分钟过完其他语言也有的东西。
