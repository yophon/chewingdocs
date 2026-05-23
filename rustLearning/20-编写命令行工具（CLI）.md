# 20-编写命令行工具（CLI）

> 一句话导读：优秀的 CLI 不只是能跑的二进制，它还应该有清晰的参数、可靠的错误信息、可测试的核心逻辑和稳定的退出码。

Rust 很适合写命令行工具：启动快、内存占用低、可以编译成单个二进制、跨平台分发方便。很多现代工具都选择 Rust，比如 `ripgrep`、`fd`、`bat`、`zoxide`、`ruff` 的部分生态工具等。

但 CLI 工程不是把 `std::env::args()` 读出来就完事。真实工具需要考虑帮助文档、子命令、配置、错误上下文、标准输入输出、退出码、测试和发布。

## 一、CLI 架构心智

推荐把 CLI 分成三层：

```text
命令行入口 main.rs
  |
  | 解析参数、初始化日志、处理退出码
  v
命令分发层 commands
  |
  | 根据子命令调用对应业务
  v
核心逻辑 lib.rs
  |
  | 可测试、少副作用、尽量不依赖终端
  v
文件系统 / 网络 / 标准输入输出
```

不要把所有逻辑都写在 `main()` 里。`main()` 负责胶水代码，真正业务放到普通函数或库模块里，测试会简单很多。

## 二、用 `clap` 定义参数

`clap` 是 Rust CLI 参数解析的事实标准。用 derive 宏可以让结构体同时成为参数定义和帮助文档来源。

```toml
# Cargo.toml
[dependencies]
clap = { version = "4", features = ["derive"] }
anyhow = "1"
```

一个完整可编译的搜索工具骨架：

```rust
use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use std::fs;
use std::path::PathBuf;

#[derive(Parser, Debug)]
#[command(name = "rfind")]
#[command(version, about = "A tiny search CLI written in Rust")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand, Debug)]
enum Command {
    /// Search a file for lines containing a query.
    Search {
        /// Query string to search for.
        query: String,

        /// File path to read.
        path: PathBuf,

        /// Match case sensitively.
        #[arg(short, long)]
        case_sensitive: bool,
    },
}

fn search_lines<'a>(content: &'a str, query: &str, case_sensitive: bool) -> Vec<&'a str> {
    if case_sensitive {
        content.lines().filter(|line| line.contains(query)).collect()
    } else {
        let query = query.to_lowercase();
        content
            .lines()
            .filter(|line| line.to_lowercase().contains(&query))
            .collect()
    }
}

fn run(cli: Cli) -> Result<()> {
    match cli.command {
        Command::Search {
            query,
            path,
            case_sensitive,
        } => {
            let content = fs::read_to_string(&path)
                .with_context(|| format!("failed to read {}", path.display()))?;

            for line in search_lines(&content, &query, case_sensitive) {
                println!("{line}");
            }
        }
    }

    Ok(())
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    run(cli)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn search_is_case_insensitive_by_default() {
        let content = "Rust\nrustacean\nGo\n";
        assert_eq!(
            search_lines(content, "RUST", false),
            vec!["Rust", "rustacean"]
        );
    }
}
```

运行方式：

```bash
cargo run -- search rust ./README.md
cargo run -- search rust ./README.md --case-sensitive
cargo run -- --help
```

注意 `cargo run --` 里的 `--`，它表示后面的参数传给你的程序，而不是传给 cargo。

## 三、错误处理：`anyhow` 与 `thiserror`

CLI 应用通常使用 `anyhow` 很舒服，因为它能携带上下文，把不同错误类型统一成 `anyhow::Error`。

```rust
use anyhow::{Context, Result};
use std::fs;
use std::path::Path;

fn load_config(path: &Path) -> Result<String> {
    fs::read_to_string(path)
        .with_context(|| format!("failed to read config file {}", path.display()))
}
```

库代码更推荐 `thiserror` 定义明确错误类型，方便调用方匹配：

```toml
[dependencies]
thiserror = "1"
```

```rust
use std::path::PathBuf;
use thiserror::Error;

#[derive(Debug, Error)]
enum ConfigError {
    #[error("config file does not exist: {0}")]
    Missing(PathBuf),

    #[error("invalid config syntax: {0}")]
    InvalidSyntax(String),
}
```

简单区分：

- `anyhow`：应用层、CLI 层、快速返回带上下文的错误。
- `thiserror`：库层、领域错误、需要给调用方精确处理的错误。

## 四、退出码与标准输出

CLI 的输出分两类：

- 正常结果写 stdout，方便管道处理。
- 日志、错误、诊断信息写 stderr，避免污染结果。

```rust
use std::process::ExitCode;

fn main() -> ExitCode {
    match real_main() {
        Ok(()) => ExitCode::SUCCESS,
        Err(err) => {
            eprintln!("error: {err:?}");
            ExitCode::from(1)
        }
    }
}

fn real_main() -> anyhow::Result<()> {
    println!("machine-readable result");
    Ok(())
}
```

如果你的工具会被脚本调用，退出码就是 API。常见约定：

- `0`：成功。
- `1`：一般错误。
- `2`：参数错误。
- 其他值：特定业务错误，但要文档化。

## 五、配置来源优先级

真实 CLI 常同时支持命令行参数、环境变量、配置文件。建议明确优先级：

```text
命令行参数 > 环境变量 > 配置文件 > 默认值
```

`clap` 支持从环境变量读取参数，需要开启 `env` feature。

```toml
clap = { version = "4", features = ["derive", "env"] }
```

```rust
use clap::Parser;

#[derive(Parser, Debug)]
struct Cli {
    #[arg(long, env = "APP_ENDPOINT", default_value = "http://localhost:3000")]
    endpoint: String,
}

fn main() {
    let cli = Cli::parse();
    println!("{}", cli.endpoint);
}
```

不要让配置来源隐式互相覆盖。复杂工具可以在 `--verbose` 下打印最终配置，便于排查线上任务为什么连到了错误环境。

## 六、读写 stdin/stdout：让工具适合管道

好用的 CLI 往往可以接管道：

```bash
cat access.log | rfind search error -
```

约定 `-` 表示 stdin 是常见做法。

```rust
use anyhow::{Context, Result};
use std::io::{self, Read};
use std::path::Path;

fn read_input(path: &Path) -> Result<String> {
    if path == Path::new("-") {
        let mut input = String::new();
        io::stdin()
            .read_to_string(&mut input)
            .context("failed to read stdin")?;
        Ok(input)
    } else {
        std::fs::read_to_string(path)
            .with_context(|| format!("failed to read {}", path.display()))
    }
}
```

当输出很大时，使用 `BufWriter`，不要每行都频繁刷新。

## 七、日志、颜色与进度条

CLI 的输出体验要克制：

- 面向机器消费的输出不要默认带颜色。
- 只有连接到 TTY 时才显示进度条。
- `--json` 输出要稳定，不要混入日志。
- `--quiet`、`--verbose`、`--no-color` 是很多工具的基础选项。

常用库：

- `tracing` / `tracing-subscriber`：结构化日志。
- `indicatif`：进度条。
- `anstyle` / `owo-colors`：颜色输出。
- `serde_json`：机器可读输出。

示例：用 `tracing` 控制日志级别。

```toml
[dependencies]
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
```

```rust
fn init_logging() {
    tracing_subscriber::fmt()
        .with_env_filter(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info".to_string())
        )
        .init();
}
```

## 八、常见错误与修正

### 错误 1：所有逻辑都塞进 `main`

问题：

- 难测试。
- 难复用。
- 错误处理和参数解析混在一起。

修正：把 `main -> parse -> run -> core function` 分层。核心函数只接收普通参数，返回普通结果。

### 错误 2：错误信息没有上下文

```rust
use std::fs;

fn read(path: &str) -> std::io::Result<String> {
    fs::read_to_string(path)
}
```

用户只看到 `No such file or directory`，不知道哪个文件失败。修正：

```rust
use anyhow::{Context, Result};

fn read(path: &str) -> Result<String> {
    std::fs::read_to_string(path)
        .with_context(|| format!("failed to read {path}"))
}
```

### 错误 3：把错误输出写到 stdout

如果错误写 stdout，用户做管道时会污染数据：

```bash
tool --json > result.json
```

修正：错误和日志使用 `eprintln!` 或日志系统输出到 stderr。

### 错误 4：忽略跨平台路径

不要手写 `/` 拼路径：

```rust
use std::path::PathBuf;

fn cache_file(home: PathBuf) -> PathBuf {
    home.join(".cache").join("my-tool").join("state.json")
}
```

进一步可以用 `directories` 或 `dirs` 处理平台差异。

## 九、测试 CLI

核心逻辑用普通单元测试，整条命令用集成测试。常用组合：

- `assert_cmd`：运行二进制并断言退出码、输出。
- `predicates`：断言 stdout/stderr。
- `tempfile`：创建临时文件和目录。

示例思路：

```rust
// tests/cli.rs
// use assert_cmd::Command;
// use predicates::prelude::*;
//
// #[test]
// fn shows_help() {
//     let mut cmd = Command::cargo_bin("rfind").unwrap();
//     cmd.arg("--help")
//         .assert()
//         .success()
//         .stdout(predicate::str::contains("Usage"));
// }
```

CLI 工具越常被脚本依赖，越要用测试保护输出格式和退出码。

## 十、工程取舍

适合 Rust CLI 的场景：

- 高频使用，对启动速度敏感。
- 需要单文件分发，减少运行时依赖。
- 文件扫描、文本处理、网络客户端、开发工具。
- 需要更强类型和更稳定重构能力。

不一定适合的场景：

- 一次性脚本，Bash/Python 更快。
- 主要逻辑依赖巨大动态生态库，比如某些数据科学任务。
- 团队没有 Rust 维护能力，工具会长期无人接手。

生产级 CLI 的检查清单：

- `--help` 信息完整。
- 错误带上下文。
- stdout/stderr 分离。
- 退出码稳定。
- 支持配置来源优先级。
- 核心逻辑有单元测试。
- 发布时包含 shell completion、man page 或 README 示例。

## 十一、小结

Rust CLI 的优势在于可靠、快、好分发。`clap` 解决参数解析，`anyhow` 解决应用层错误上下文，`tracing`、`indicatif`、`serde` 等库补齐体验。

真正要写好的不是 `main()`，而是边界：参数怎么进入、错误怎么出去、输出能不能被脚本消费、核心逻辑能不能独立测试。

下一篇 `21-Axum-现代Web框架入门.md` 会把 Rust 带到服务端 Web 开发，看看 Tokio 之上的现代 HTTP 框架如何组织路由、状态和错误。
