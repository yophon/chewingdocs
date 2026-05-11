# 20-编写命令行工具（CLI）

> "Rust 天生适合写 CLI 工具。它编译出来的二进制文件极小、启动极快、无外部依赖，简直是取代 Python 和 Bash 脚本的神器。"

在学会了那么多底层知识后，我们终于可以开始干活了！本篇将带你使用社区生态最强库，写一个顺手的命令行工具。

## 一、核心武器：`clap`

解析命令行参数是一件极其繁琐的事（想想 C 里的 `getopt`）。在 Rust 中，我们有神器 `clap`。

在 `Cargo.toml` 中加入：
```toml
[dependencies]
clap = { version = "4.0", features = ["derive"] }
```

### 使用 Derive 宏魔法
你只需要定义一个结构体，把参数类型写好，加上 `#[derive(Parser)]`，它就会自动生成解析逻辑、验证逻辑，甚至是极其精美的 `--help` 文档！

```rust
use clap::Parser;

/// 这是一个搜索文件的简单工具
#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// 要搜索的关键词
    #[arg(short, long)]
    query: String,

    /// 要搜索的文件路径
    #[arg(short, long)]
    path: std::path::PathBuf,

    /// 是否开启大小写敏感
    #[arg(short, long, default_value_t = false)]
    case_sensitive: bool,
}

fn main() {
    let args = Args::parse();
    
    println!("正在搜索: {}", args.query);
    println!("路径: {:?}", args.path);
    if args.case_sensitive {
        println!("（大小写敏感）");
    }
}
```
运行 `cargo run -- --help`，看看它为你生成了什么！

## 二、错误处理的救星：`anyhow`

在写业务应用或 CLI 时，我们经常会遇到不同类型的错误（IO 错误、解析错误等）。如果要在签名里把这些错误枚举出来会非常痛苦。
`anyhow` 提供了一个通用的 `Result` 类型，帮你吃掉所有错误。

```toml
[dependencies]
anyhow = "1.0"
```

```rust
use anyhow::{Context, Result};
use std::fs;

// 注意这个 Result 是 anyhow::Result，不需要写 E 参数了
fn read_file_content(path: &str) -> Result<String> {
    let content = fs::read_to_string(path)
        .with_context(|| format!("无法读取文件: {}", path))?; // 补充错误上下文
    Ok(content)
}

fn main() -> Result<()> { // main 函数也可以返回 Result！
    let content = read_file_content("no_exist.txt")?;
    println!("{}", content);
    Ok(())
}
```
当它报错退出时，终端会打印出极度清晰的错误调用链。

## 三、其他常用 CLI 库推荐

- **打印彩色终端日志**：`colored` 库，用法：`"text".red().bold()`。
- **漂亮地加载提示音/进度条**：`indicatif` 库。
- **让你的工具快如闪电的正则库**：`regex`。

---
**下一篇：** `21-Axum-现代Web框架入门.md`，把 Rust 搬上 Web 后端服务器。
