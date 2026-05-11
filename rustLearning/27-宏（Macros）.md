# 27-宏（Macros）

> "如果你觉得每天写重复的样板代码很烦，你可以用宏来生成它们。Rust 的宏在编译期展开，比 C 的字符串替换宏强大一万倍。"

我们在第一天用的 `println!`，以及后面的 `vec!` 和 `#[derive(Serialize)]`，全都是宏。
宏分为两大类：**声明宏** 和 **过程宏**。

## 一、声明宏 (Declarative Macros)

这是最常见的宏，使用 `macro_rules!` 定义。它类似正则表达式匹配，把匹配到的语法树节点替换成我们写的代码。

我们来看看 `vec!` 是怎么被写出来的（简化版）：
```rust
#[macro_export]
macro_rules! my_vec {
    // $x:expr 表示匹配一个表达式，并将其绑定到变量 $x
    // $( ... ),* 表示匹配以逗号分隔的零个或多个表达式
    ( $( $x:expr ),* ) => {
        {
            let mut temp_vec = Vec::new();
            $(
                temp_vec.push($x); // 会对每一个匹配到的 $x 生成一行 push 代码
            )*
            temp_vec
        }
    };
}

fn main() {
    let v = my_vec![1, 2, 3];
    // 上面的代码在编译前会被宏展开成：
    // let v = {
    //     let mut temp_vec = Vec::new();
    //     temp_vec.push(1);
    //     temp_vec.push(2);
    //     temp_vec.push(3);
    //     temp_vec
    // };
}
```

## 二、过程宏 (Procedural Macros)

过程宏更像是一个编译器插件：它接收一段 Rust 代码（语法树），运行你用 Rust 写的逻辑，然后输出一段新的 Rust 代码。

它有三种：
1. **自定义 `#[derive]` 宏**：像 `#[derive(Serialize)]` 那样，为结构体自动生成实现。
2. **属性宏**：像 Axum 里的 `#[tokio::main]` 或 `#[route("/")]`，可以修改任意函数的签名和内容。
3. **函数式宏**：像 `sqlx::query!("SELECT...")`。

### 写过程宏的代价
写过程宏必须单独建一个 `crate`，并且配置 `proc-macro = true`。因为它是要参与编译器的编译过程的，所以难度比较高，需要用到 `syn` (解析语法树) 和 `quote` (生成代码) 这两个库。

日常开发中，**学会用别人的宏比自己写宏重要得多。** 只有在极度渴望消除模板代码时，才去碰过程宏。

---
**下一篇：** `28-FFI-与其他语言交互.md`，把 Rust 塞进 C、Python 和 Node.js 里！
