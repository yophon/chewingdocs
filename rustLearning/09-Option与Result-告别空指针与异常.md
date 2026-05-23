# 09-Option 与 Result：告别空指针与异常

> 一句话导读：Rust 不用 `null` 和异常表达失败，而是把“可能没有值”和“可能失败”显式写进类型，让调用者在编译期就必须处理。

在很多语言里，函数签名看起来返回 `User`，实际可能返回 `null`；函数体看起来只是读文件，实际可能在任意一行抛异常。调用者如果忘了检查，就会在运行时踩坑。

Rust 的选择很直接：

- 值可能不存在：返回 `Option<T>`。
- 操作可能失败：返回 `Result<T, E>`。
- 想提前返回错误：用 `?`。
- 真的遇到不可恢复错误：才 `panic!`。

## 一、机制心智：把分支放进类型里

`Option` 和 `Result` 都是枚举。它们不是特殊语法，而是标准库里最常用的普通类型。

```rust
// 简化后的定义
enum Option<T> {
    Some(T),
    None,
}

enum Result<T, E> {
    Ok(T),
    Err(E),
}
```

这两个类型的关键不是“包装了一层”，而是：你不能把 `Option<T>` 当成 `T` 用，也不能把 `Result<T, E>` 当成 `T` 用。编译器会逼你先处理 `None` 或 `Err`。

```rust
fn main() {
    let age: Option<u8> = Some(18);

    // 错误心智：age 就是数字。
    // let next_year = age + 1;

    // 正确心智：age 是一个分支，要先处理。
    let next_year = match age {
        Some(value) => value + 1,
        None => 0,
    };

    println!("{next_year}");
}
```

## 二、Option：处理“没有值”

`Option<T>` 适合表达正常业务里的“缺席”。比如：用户可能没有昵称、数组下标可能越界、查询可能没有命中。

```rust
fn find_user_name(id: u64) -> Option<String> {
    if id == 1 {
        Some(String::from("Ada"))
    } else {
        None
    }
}

fn main() {
    match find_user_name(1) {
        Some(name) => println!("found user: {name}"),
        None => println!("user not found"),
    }

    let display_name = find_user_name(2).unwrap_or_else(|| String::from("guest"));
    println!("display as {display_name}");
}
```

常用方法：

- `match`：最清晰，适合分支逻辑不同的场景。
- `if let Some(x) = value`：只关心有值的场景。
- `unwrap_or(default)`：没有值时使用默认值。
- `unwrap_or_else(|| build_default())`：默认值生成成本较高时再调用。
- `map`：只在 `Some` 时转换内部值。
- `and_then`：连续执行可能返回 `Option` 的步骤。

```rust
fn parse_positive(input: &str) -> Option<u32> {
    input
        .trim()
        .parse::<u32>()
        .ok()
        .and_then(|n| if n > 0 { Some(n) } else { None })
}

fn main() {
    let samples = ["42", "0", "abc"];

    for sample in samples {
        match parse_positive(sample) {
            Some(n) => println!("{sample:?} => {n}"),
            None => println!("{sample:?} is not a positive integer"),
        }
    }
}
```

这里的 `.ok()` 会把 `Result<T, E>` 转成 `Option<T>`：成功保留 `Some(T)`，失败丢弃错误信息变成 `None`。只有当错误细节不重要时才这么做。

## 三、Result：处理“可能失败”

`Result<T, E>` 适合表达操作失败，而且调用者需要知道失败原因。文件、网络、解析、数据库、权限检查，通常都应该返回 `Result`。

```rust
use std::num::ParseIntError;

fn double_number(input: &str) -> Result<i32, ParseIntError> {
    let n = input.trim().parse::<i32>()?;
    Ok(n * 2)
}

fn main() {
    for input in ["21", "oops"] {
        match double_number(input) {
            Ok(value) => println!("{input:?} doubled is {value}"),
            Err(err) => println!("cannot parse {input:?}: {err}"),
        }
    }
}
```

`?` 的机制可以理解成一段固定的 `match`：

```rust
// let n = input.parse::<i32>()?;

// 大致等价于：
// let n = match input.parse::<i32>() {
//     Ok(value) => value,
//     Err(err) => return Err(err.into()),
// };
```

注意最后的 `err.into()`。这意味着 `?` 不只会“原样返回错误”，它还可以通过 `From`/`Into` 把底层错误转换成当前函数声明的错误类型。

## 四、组合 Option 与 Result

真实代码经常同时遇到“可能没有”和“可能失败”。比如环境变量可能不存在，存在时又可能解析失败。

```rust
use std::env;
use std::num::ParseIntError;

fn read_port() -> Result<u16, ParseIntError> {
    let raw = env::var("APP_PORT").unwrap_or_else(|_| String::from("8080"));
    raw.parse::<u16>()
}

fn main() {
    match read_port() {
        Ok(port) => println!("server will listen on {port}"),
        Err(err) => eprintln!("APP_PORT is not a valid u16: {err}"),
    }
}
```

如果“不存在”和“格式错误”都要区分，就不要丢弃错误信息，可以定义自己的错误类型。

```rust
#[derive(Debug)]
enum ConfigError {
    MissingKey,
    InvalidNumber(std::num::ParseIntError),
}

fn parse_required_port(value: Option<&str>) -> Result<u16, ConfigError> {
    let raw = value.ok_or(ConfigError::MissingKey)?;
    raw.parse::<u16>().map_err(ConfigError::InvalidNumber)
}

fn main() {
    for value in [Some("3000"), Some("bad"), None] {
        println!("{:?}", parse_required_port(value));
    }
}
```

`ok_or` 和 `ok_or_else` 是 `Option` 转 `Result` 的常用桥梁：

- `ok_or(err)`：`None` 时返回指定错误。
- `ok_or_else(|| err)`：`None` 时再构造错误，避免无意义的分配或计算。

## 五、常见错误与修正

### 1. 对可能失败的值直接 `unwrap`

```rust
fn main() {
    let input = "abc";

    // let n: i32 = input.parse().unwrap(); // 会 panic

    let n = match input.parse::<i32>() {
        Ok(value) => value,
        Err(_) => 0,
    };

    println!("{n}");
}
```

`unwrap` 不是禁用 API，但它应该用于“这里失败就是程序 bug”的地方，比如测试、原型、一次性脚本、已经由前置逻辑保证的分支。生产业务路径里优先返回 `Result` 或提供明确降级。

### 2. 函数用了 `?`，返回类型却不是 Result/Option

```rust
use std::fs;
use std::io;

fn read_config() -> Result<String, io::Error> {
    let content = fs::read_to_string("config.toml")?;
    Ok(content)
}

fn main() {
    match read_config() {
        Ok(content) => println!("config bytes: {}", content.len()),
        Err(err) => eprintln!("cannot read config: {err}"),
    }
}
```

`?` 的意思是“失败时提前返回”，所以当前函数必须能承载这个失败：通常返回 `Result<_, E>`，有时返回 `Option<_>`。

### 3. 丢掉错误上下文

```rust
use std::fs;

fn main() {
    let path = "missing.txt";

    match fs::read_to_string(path) {
        Ok(content) => println!("{content}"),
        Err(err) => eprintln!("failed to read {path}: {err}"),
    }
}
```

错误信息要带上上下文。只打印 `No such file or directory` 不够，调用者还需要知道是哪个文件、哪个操作失败。

## 六、工程使用边界

`Option` 适合：

- 缺席是正常业务状态：用户没有头像、缓存未命中、查询无结果。
- 调用者不需要失败原因。
- 可以自然提供默认值。

`Result` 适合：

- 失败原因会影响处理策略。
- 失败需要向上层传播。
- 你正在写库代码或边界层代码，希望调用者自己决定怎么处理。

`panic!` 适合：

- 不变量被破坏，继续运行没有意义。
- 测试代码里快速暴露失败。
- 示例代码为了聚焦主题使用 `expect`，但错误信息要写清楚。

不建议：

- 用 `Option` 吞掉所有错误，让排查问题变难。
- 在业务服务的请求路径里大量 `unwrap`。
- 为了省事把所有错误都变成 `String`，导致上层无法按错误类型分支。

## 七、结尾总结

`Option` 和 `Result` 是 Rust 错误处理的核心心智：失败不是隐藏控制流，而是函数签名的一部分。`Option` 表达“有没有”，`Result` 表达“成没成以及为什么没成”。当你能熟练使用 `match`、`?`、`map_err`、`ok_or_else` 这些工具，Rust 的错误处理会从“啰嗦”变成“边界清晰”。

---
**下一篇：** `10-集合类型.md`，聊聊最常用的 Vector、String 和 HashMap。
