# 08-枚举与模式匹配（Enum & Match）

> "Rust 的枚举不是干巴巴的数字常量集合，它是可以装载不同数据的超级容器。"

## 一、极其强大的 Enum

在 C/Java 中，枚举只能是几个固定的状态（如 RED, GREEN, BLUE）。
但在 Rust 中，**枚举的每个变体，都可以附带不同类型和数量的数据！**

```rust
enum IpAddr {
    V4(u8, u8, u8, u8),   // 可以装一个元组
    V6(String),           // 可以装一个字符串
    Unknown,              // 也可以什么都不装
}

let home = IpAddr::V4(127, 0, 0, 1);
let loopback = IpAddr::V6(String::from("::1"));
```

再看一个更复杂的例子（消息枚举）：
```rust
enum Message {
    Quit,                       // 无数据
    Move { x: i32, y: i32 },    // 匿名结构体
    Write(String),              // 字符串
    ChangeColor(i32, i32, i32), // 元组
}
```
这意味着你可以在**一个数组里**存下各种各样格式不同的 `Message`，这就是 Rust 处理异构数据的绝招。

## 二、Match 控制流（极其严格的 switch）

有这么灵活的枚举，必须有配套的工具把它拆开，这就是 `match`。
`match` 类似 `switch`，但有两个巨大的区别：
1. 它强制**穷尽（Exhaustive）**：你必须处理枚举的每一种可能性，漏一个都无法编译通过。
2. 它可以把枚举里包含的**数据直接提取出来**。

```rust
fn handle_message(msg: Message) {
    match msg {
        Message::Quit => {
            println!("Quit!");
        }
        Message::Move { x, y } => {
            println!("Move to x: {}, y: {}", x, y); // 👈 直接把数据解构出来了！
        }
        Message::Write(text) => println!("Text message: {}", text),
        Message::ChangeColor(r, g, b) => println!("Color: {}, {}, {}", r, g, b),
    }
}
```

### 占位符 `_` 与 `other`
如果你只关心某几个变体，不想穷尽所有：
```rust
let dice_roll = 9;
match dice_roll {
    3 => add_fancy_hat(),
    7 => remove_fancy_hat(),
    other => move_player(other), // 捕获其他所有的值，绑定到 other 变量
    // _ => reroll(), // 如果连其他值都不想用，可以用 _ 占位符丢弃
}
```

## 三、`if let` 语法糖

当你的 `match` 只想处理**一种**情况，其他情况都忽略时，写 `match` 太繁琐了。此时可以用 `if let`：

```rust
let msg = Message::Write(String::from("hello"));

// 使用 if let：意思是如果 msg 能匹配上 Message::Write(text) 这个模式
if let Message::Write(text) = msg {
    println!("Got text: {}", text);
} else {
    println!("Not a text message");
}
```

---
**下一篇：** `09-Option与Result-告别空指针与异常.md`，两个每天都要写几十遍的内置枚举。
