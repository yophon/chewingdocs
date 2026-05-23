# 27-宏（Macros）

> 一句话导读：Rust 宏是在编译期生成代码的工具，适合消除重复结构、扩展语法和生成 trait 实现，但不应该拿来隐藏业务逻辑。

你每天都在用宏：

```rust
println!("hello {}", "rust");
let values = vec![1, 2, 3];
assert_eq!(values.len(), 3);
```

这些名字后面都有 `!`，说明它们不是普通函数，而是宏。

宏的核心价值是：函数只能接收已经写好的值，宏可以接收并生成 Rust 代码。

## 一、机制心智：宏操作的是语法，不是运行期值

普通函数运行在程序运行期：

```text
源码 -> 编译 -> 运行时调用函数
```

宏运行在编译期：

```text
源码 -> 宏展开生成更多源码 -> 编译展开后的源码 -> 运行
```

所以宏适合做这些事：

- 生成重复代码。
- 根据类型定义生成 trait 实现。
- 创建小型 DSL。
- 在编译期检查某些输入，比如 `sqlx::query!` 检查 SQL。

不适合做这些事：

- 替代普通函数。
- 隐藏复杂业务流程。
- 让错误信息变得难以理解。
- 让 IDE 和新人都看不懂代码。

Rust 宏主要分两类：

- 声明宏：`macro_rules!`。
- 过程宏：`derive` 宏、属性宏、函数式过程宏。

## 二、声明宏：用模式匹配生成代码

声明宏使用 `macro_rules!`。它接收一段 token tree，按规则匹配后输出另一段 token tree。

下面实现一个简化版 `vec!`：

```rust
macro_rules! my_vec {
    ( $( $item:expr ),* $(,)? ) => {{
        let mut values = Vec::new();
        $(
            values.push($item);
        )*
        values
    }};
}

fn main() {
    let a = my_vec![1, 2, 3];
    let b = my_vec![
        "rust",
        "macro",
    ];

    assert_eq!(a, vec![1, 2, 3]);
    assert_eq!(b, vec!["rust", "macro"]);
}
```

几个符号要熟悉：

- `$item:expr`：匹配一个表达式，并命名为 `item`。
- `$( ... ),*`：匹配 0 个或多个由逗号分隔的片段。
- `$(,)?`：允许末尾多一个逗号。
- 双层 `{{ ... }}`：让宏展开成一个表达式块，避免变量泄漏。

声明宏常见 matcher：

```text
expr   表达式
ident  标识符
ty     类型
path   路径
pat    模式
stmt   语句
block  代码块
tt     token tree
```

## 三、宏卫生：为什么变量不容易串味

Rust 宏有 hygiene。宏内部定义的变量通常不会意外污染调用处。

```rust
macro_rules! make_answer {
    () => {{
        let value = 42;
        value
    }};
}

fn main() {
    let value = 10;
    let answer = make_answer!();

    assert_eq!(value, 10);
    assert_eq!(answer, 42);
}
```

但宏仍然可能因为路径解析造成问题。写库宏时，应该尽量使用 `$crate` 指向当前 crate：

```rust
#[macro_export]
macro_rules! call_helper {
    () => {
        $crate::helper()
    };
}

pub fn helper() -> &'static str {
    "ok"
}
```

这样宏被别的 crate 使用时，也能找到定义宏的 crate 里的 helper。

## 四、用声明宏消除重复实现

假设你有多个 ID newtype，都要实现 `value()`：

```rust
macro_rules! id_type {
    ($name:ident) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
        pub struct $name(u64);

        impl $name {
            pub fn new(value: u64) -> Self {
                Self(value)
            }

            pub fn value(self) -> u64 {
                self.0
            }
        }
    };
}

id_type!(UserId);
id_type!(OrderId);

fn main() {
    let user_id = UserId::new(7);
    let order_id = OrderId::new(9);

    assert_eq!(user_id.value(), 7);
    assert_eq!(order_id.value(), 9);
}
```

这类宏的价值很明确：重复结构多，模式稳定，展开后代码容易预测。

如果只是少写两行普通函数，就不值得引入宏。

## 五、过程宏：编译器插件式代码生成

过程宏接收 token stream，输出 token stream。它更强，也更重。

三种过程宏：

- 自定义 derive：`#[derive(Serialize)]`。
- 属性宏：`#[tokio::main]`、`#[instrument]`。
- 函数式过程宏：`sqlx::query!("SELECT 1")`。

过程宏必须放在单独的 proc-macro crate。

`Cargo.toml`：

```toml
[lib]
proc-macro = true

[dependencies]
proc-macro2 = "1"
quote = "1"
syn = { version = "2", features = ["full"] }
```

一个最小 derive 宏示意：

```rust
use proc_macro::TokenStream;
use quote::quote;
use syn::{parse_macro_input, DeriveInput};

#[proc_macro_derive(HelloName)]
pub fn derive_hello_name(input: TokenStream) -> TokenStream {
    let input = parse_macro_input!(input as DeriveInput);
    let name = input.ident;

    let expanded = quote! {
        impl #name {
            pub fn hello_name() -> &'static str {
                stringify!(#name)
            }
        }
    };

    expanded.into()
}
```

使用方：

```rust
#[derive(HelloName)]
struct User;

fn main() {
    assert_eq!(User::hello_name(), "User");
}
```

过程宏开发复杂度高，因为你要处理 Rust 语法树、泛型、生命周期、错误提示和跨 crate 调试。

## 六、调试宏展开

宏最痛的地方是“我不知道它展开成了什么”。

可以使用：

```bash
cargo install cargo-expand
cargo expand
```

对单个测试或模块：

```bash
cargo expand --test my_test
```

看展开结果时重点关注：

- 生成了哪些 impl。
- 泛型和 where 条件是否正确。
- 路径是否解析到预期 crate。
- 临时变量是否和调用处冲突。

## 七、什么时候该用宏

适合使用宏：

- 重复代码结构高度一致。
- 需要接受不定数量参数，比如 `vec!`、`format!`。
- 需要根据类型定义生成 trait 实现。
- 需要编译期检查 DSL，比如 SQL、路由、配置。
- 普通函数或泛型无法表达。

不该使用宏：

- 只是为了少写一点普通代码。
- 业务规则复杂且经常变化。
- 展开后错误信息很差。
- 团队没有能力维护过程宏。
- 宏调用看起来像魔法，读者无法预测生成结果。

一个实用判断：如果你不能用一句话说明这个宏会生成什么，就先别写。

## 八、常见坑

### 1. 宏递归没有出口

递归宏必须有清晰 base case，否则编译器会报 recursion limit。

### 2. 忽略尾逗号

很多 Rust 调用习惯允许尾逗号。宏里加 `$(,)?` 能改善体验。

### 3. 宏返回语句而不是表达式

如果希望宏能用于 `let x = my_macro!();`，展开结果必须是表达式。常用 `{{ ... }}` 包起来。

### 4. 错误信息不可读

过程宏应该用 `syn::Error` 返回指向具体 token 的错误，而不是直接 panic。

### 5. 过度封装 DSL

DSL 一旦复杂，IDE、跳转、重构和错误提示都会变差。除非收益很大，否则普通 Rust 代码更可维护。

## 九、工程边界

库作者可以更多考虑宏，因为库需要给用户提供简洁 API。

业务项目里应该克制：

- 优先函数。
- 其次泛型和 trait。
- 再考虑声明宏。
- 最后才考虑过程宏。

维护过程宏时要有额外测试：

- 展开结果测试。
- 编译失败测试，可以用 `trybuild`。
- 文档示例测试。

`trybuild` 示例：

```toml
[dev-dependencies]
trybuild = "1"
```

```rust
#[test]
fn ui_tests() {
    let t = trybuild::TestCases::new();
    t.pass("tests/ui/pass/*.rs");
    t.compile_fail("tests/ui/fail/*.rs");
}
```

## 十、结尾总结

Rust 宏是编译期代码生成工具。它强在消除结构性重复、表达普通函数做不到的语法模式，以及为库提供更顺手的接口。

但宏也会提高阅读和调试成本。

使用原则很简单：

1. 能用函数就用函数。
2. 能用泛型和 trait 就先用泛型和 trait。
3. 声明宏适合小而稳定的重复模式。
4. 过程宏适合库级能力，不适合随手写业务逻辑。
5. 写宏后一定要能查看展开结果并测试错误场景。

宏不是为了让代码更炫，而是为了让重复结构更少、类型边界更清楚。

---
**下一篇：** `28-FFI-与其他语言交互.md`，学习 Rust 如何和 C、Python、Node.js 等生态互相调用。
