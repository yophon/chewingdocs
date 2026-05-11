# 09-Option 与 Result：告别空指针与异常

> "Tony Hoare（图灵奖得主）曾说：'引入 Null 引用是我犯下的十亿美元的错误'。Rust 决定彻底消灭 Null 和 Try-Catch。"

Rust 没有 `null`，也没有 `try...catch` 异常系统。取而代之的是两个极其强大的内置枚举：`Option` 和 `Result`。

## 一、Option<T>：优雅处理“没有值”

当一个值可能存在，也可能不存在时，必须使用 `Option<T>` 类型。它被定义在标准库中，并且被自动引入（不需要 import 就能用 `Some` 和 `None`）。

```rust
// 标准库中的定义（伪代码）：
// enum Option<T> {
//     None,
//     Some(T),
// }

let some_number = Some(5);
let some_char = Some('e');
let absent_number: Option<i32> = None; // 如果是 None，必须告诉编译器 T 是什么类型
```

**为什么这比 Null 好？**
因为类型系统强制你在使用 `Option<T>` 之前，**必须**将其转换为 `T`。这就彻底杜绝了"忘记检查 Null 导致崩溃"的问题。

```rust
let x: i8 = 5;
let y: Option<i8> = Some(5);

// let sum = x + y; // ❌ 报错！i8 和 Option<i8> 是不同类型，不能相加！
```
你必须用 `match` 或方法把它取出来：
```rust
let y_val = y.unwrap_or(0); // 取出 Some 里的值，如果是 None 就用 0
let sum = x + y_val; // ✅ 成功
```

## 二、Result<T, E>：坚如磐石的错误处理

遇到可能失败的操作（比如读文件、网络请求），Rust 不抛异常，而是返回 `Result` 枚举。

```rust
// 标准库中的定义（伪代码）：
// enum Result<T, E> {
//     Ok(T),
//     Err(E),
// }

use std::fs::File;

fn main() {
    let f = File::open("hello.txt"); // f 的类型是 Result<File, std::io::Error>

    let f = match f {
        Ok(file) => file,
        Err(error) => panic!("打开文件失败: {:?}", error), // panic 会使程序崩溃退出
    };
}
```

### 快速暴力的提取方式 (适合原型开发)
- `f.unwrap()`: 如果是 Ok 就返回值，如果是 Err 就直接 `panic!` 崩溃。
- `f.expect("自定义错误信息")`: 和 unwrap 一样，但崩溃时带有具体的报错说明（推荐用这个代替 unwrap）。

## 三、`?` 运算符：错误传播的神器

如果每个 `Result` 都要 `match` 一遍，代码会变成很丑的嵌套地狱。Rust 提供了 `?` 运算符。

```rust
use std::fs::File;
use std::io::{self, Read};

// 注意函数的返回值是 Result<String, io::Error>
fn read_username_from_file() -> Result<String, io::Error> {
    let mut f = File::open("hello.txt")?; // 👈 看这个问号
    let mut s = String::new();
    f.read_to_string(&mut s)?;            // 👈 还有这个
    Ok(s)
}
```
**`?` 的作用是：**
- 如果结果是 `Ok(值)`，就把值提取出来赋给左边，程序继续往下走。
- 如果结果是 `Err(错误)`，就**立刻终止当前函数**，并把这个 `Err` 作为整个函数的返回值 return 回去。

这就是 Rust 里的 `Try...Catch` 平替方案，而且比它清晰一万倍，因为你可以从函数签名明确看出这个函数可能会抛出什么错误。

---
**下一篇：** `10-集合类型.md`，聊聊最常用的 Vector 和 HashMap。
