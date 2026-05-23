# 08-枚举与模式匹配（Enum & Match）

> 一句话导读：Rust 的枚举不是一组数字常量，而是“一个值可能处于几种形态之一，并且每种形态可以携带不同数据”的类型系统工具。

很多语言里的枚举只是 `RED/GREEN/BLUE` 这种命名整数。Rust 的 `enum` 更接近代数数据类型：它能精确表达状态分支，并让编译器检查你是否处理了所有可能情况。

## 核心心智模型

`struct` 表达“同时拥有这些字段”，`enum` 表达“只能是这些变体之一”。`match` 负责把不同变体拆开，并强制你覆盖所有情况。

当你发现一个值有互斥状态时，优先考虑 enum，而不是多个 bool 字段或松散字符串。

## 定义枚举

```rust
#[derive(Debug)]
enum IpAddr {
    V4(u8, u8, u8, u8),
    V6(String),
    Unknown,
}

fn main() {
    let home = IpAddr::V4(127, 0, 0, 1);
    let loopback = IpAddr::V6(String::from("::1"));
    let unknown = IpAddr::Unknown;

    println!("{:?}", home);
    println!("{:?}", loopback);
    println!("{:?}", unknown);
}
```

每个变体可以携带不同类型、不同数量的数据，也可以不携带数据。

再看消息模型：

```rust
#[derive(Debug)]
enum Message {
    Quit,
    Move { x: i32, y: i32 },
    Write(String),
    ChangeColor(u8, u8, u8),
}
```

这比用一个结构体加很多可空字段更安全，因为不合法状态根本构造不出来。

## match：穷尽匹配

```rust
#[derive(Debug)]
enum Message {
    Quit,
    Move { x: i32, y: i32 },
    Write(String),
    ChangeColor(u8, u8, u8),
}

fn handle(message: Message) {
    match message {
        Message::Quit => println!("quit"),
        Message::Move { x, y } => println!("move to ({x}, {y})"),
        Message::Write(text) => println!("write: {text}"),
        Message::ChangeColor(r, g, b) => println!("color = {r}, {g}, {b}"),
    }
}

fn main() {
    handle(Message::Move { x: 10, y: 20 });
    handle(Message::Write(String::from("hello")));
}
```

`match` 的强大之处在于：

- 必须穷尽所有变体。
- 可以直接解构变体携带的数据。
- 每个分支可以返回值。

## match 是表达式

```rust
enum Status {
    Draft,
    Published,
    Archived,
}

fn label(status: Status) -> &'static str {
    match status {
        Status::Draft => "draft",
        Status::Published => "published",
        Status::Archived => "archived",
    }
}

fn main() {
    println!("{}", label(Status::Published));
}
```

每个分支返回 `&'static str`，整个 `match` 就是函数的返回表达式。

如果分支返回类型不同，会报类型不匹配。修正方式是让所有分支返回同一种类型。

## 穷尽性检查

下面代码故意漏掉一个分支：

```rust
enum Direction {
    Up,
    Down,
    Left,
    Right,
}

fn main() {
    let direction = Direction::Up;

    match direction {
        Direction::Up => println!("up"),
        Direction::Down => println!("down"),
    }
}
```

错误类似：

```text
error[E0004]: non-exhaustive patterns
```

修正：补全分支，或使用 `_` 兜底。

```rust
enum Direction {
    Up,
    Down,
    Left,
    Right,
}

fn main() {
    let direction = Direction::Up;

    match direction {
        Direction::Up => println!("up"),
        Direction::Down => println!("down"),
        Direction::Left | Direction::Right => println!("side"),
    }
}
```

`_` 可以忽略其他情况：

```rust
fn main() {
    let dice = 5;

    match dice {
        1 => println!("one"),
        6 => println!("six"),
        _ => println!("other"),
    }
}
```

如果还想拿到其他值，可以绑定变量：

```rust
fn main() {
    let dice = 5;

    match dice {
        1 => println!("one"),
        6 => println!("six"),
        other => println!("other = {other}"),
    }
}
```

## if let：只关心一种情况

当你只处理一个模式，其他都忽略时，`if let` 更简洁：

```rust
enum Message {
    Write(String),
    Quit,
}

fn main() {
    let message = Message::Write(String::from("hello"));

    if let Message::Write(text) = message {
        println!("text = {text}");
    }
}
```

需要处理否则分支时：

```rust
enum Message {
    Write(String),
    Quit,
}

fn main() {
    let message = Message::Quit;

    if let Message::Write(text) = message {
        println!("text = {text}");
    } else {
        println!("not a write message");
    }
}
```

## Option：标准库里的经典 enum

Rust 没有空指针，常用 `Option<T>` 表达可能为空：

```rust
fn find_user(id: u32) -> Option<String> {
    if id == 1 {
        Some(String::from("alice"))
    } else {
        None
    }
}

fn main() {
    match find_user(1) {
        Some(name) => println!("found {name}"),
        None => println!("not found"),
    }
}
```

`Option<T>` 本质上就是：

```rust
enum Option<T> {
    Some(T),
    None,
}
```

它让“可能没有值”成为类型的一部分，编译器会逼你处理。

## 可编译综合示例

```rust
#[derive(Debug)]
enum Payment {
    Cash(u32),
    Card { last4: String, amount: u32 },
    Coupon(String),
}

fn describe(payment: Payment) -> String {
    match payment {
        Payment::Cash(amount) => format!("cash: {amount}"),
        Payment::Card { last4, amount } => {
            format!("card ****{last4}: {amount}")
        }
        Payment::Coupon(code) => format!("coupon: {code}"),
    }
}

fn main() {
    let payments = [
        Payment::Cash(100),
        Payment::Card {
            last4: String::from("1234"),
            amount: 250,
        },
        Payment::Coupon(String::from("WELCOME")),
    ];

    for payment in payments {
        println!("{}", describe(payment));
    }
}
```

这个例子体现了 enum 的优势：现金、银行卡、优惠券是互斥形态，但每种形态携带的数据不同。

## 常见编译器错误与修正

### 错误 1：match 没有覆盖所有情况

```text
error[E0004]: non-exhaustive patterns
```

修正：补全所有变体，或者用 `_` 兜底。工程上，业务关键状态优先显式列完，不要过早用 `_`，否则新增变体时编译器无法提醒你补逻辑。

### 错误 2：分支返回类型不一致

```rust
fn main() {
    let n = 1;
    let value = match n {
        1 => "one",
        _ => 0,
    };

    println!("{value}");
}
```

错误核心：

```text
match arms have incompatible types
```

修正：

```rust
fn main() {
    let n = 1;
    let value = match n {
        1 => "one",
        _ => "other",
    };

    println!("{value}");
}
```

### 错误 3：match 移动了 enum 内部数据

```rust
enum Message {
    Write(String),
    Quit,
}

fn main() {
    let message = Message::Write(String::from("hello"));

    match message {
        Message::Write(text) => println!("{text}"),
        Message::Quit => println!("quit"),
    }

    // println!("{:?}", message);
}
```

`text` 被移动出来后，`message` 不能再使用。修正：如果只想读取，用引用匹配。

```rust
#[derive(Debug)]
enum Message {
    Write(String),
    Quit,
}

fn main() {
    let message = Message::Write(String::from("hello"));

    match &message {
        Message::Write(text) => println!("{text}"),
        Message::Quit => println!("quit"),
    }

    println!("{:?}", message);
}
```

## 工程判断

适合使用 enum 的场景：

- 互斥状态：订单状态、任务状态、连接状态。
- 不同输入形态：命令行子命令、消息类型、支付方式。
- 明确的成功/失败或有/无：`Result<T, E>`、`Option<T>`。

不要用字符串表示有限状态，例如 `"draft"`、`"done"`、`"failed"` 到处传。字符串无法让编译器帮你检查拼写和遗漏分支。enum 能把状态空间收紧，后续新增状态时，`match` 的穷尽性检查会提醒你所有需要更新的地方。

## 结尾总结

Rust 的 enum 是表达业务状态的强工具，match 是拆解状态的强工具。两者配合可以把“不可能的状态”挡在类型系统之外，把“遗漏的处理分支”挡在编译期。下一篇的 `Option` 和 `Result`，就是 enum 思想在标准库中的日常应用。

---

**下一篇：** `09-Option与Result-告别空指针与异常.md`，学习 Rust 里最常见的两个枚举。
