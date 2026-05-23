# 12-Trait：接口与多态

> 一句话导读：Trait 是 Rust 描述“类型能做什么”的方式，它连接了泛型、接口、多态、扩展方法和动态分发。

如果说泛型回答“我不关心你是什么类型”，那么 trait 回答“但我需要你具备什么能力”。Rust 里大量设计都围绕 trait 展开：打印用 `Display`/`Debug`，比较用 `PartialOrd`，克隆用 `Clone`，迭代用 `Iterator`，错误用 `Error`。

Trait 很像其他语言的接口，但它和所有权、泛型、静态分发结合得更紧。

## 一、机制心智：行为契约，不是继承层级

Trait 定义一组方法签名，类型通过 `impl Trait for Type` 承诺自己实现这些行为。

```rust
trait Summary {
    fn summarize(&self) -> String;
}

struct Article {
    title: String,
    author: String,
}

struct Tweet {
    username: String,
    content: String,
}

impl Summary for Article {
    fn summarize(&self) -> String {
        format!("{} by {}", self.title, self.author)
    }
}

impl Summary for Tweet {
    fn summarize(&self) -> String {
        format!("@{}: {}", self.username, self.content)
    }
}

fn main() {
    let article = Article {
        title: String::from("Rust traits"),
        author: String::from("Ada"),
    };
    let tweet = Tweet {
        username: String::from("rustacean"),
        content: String::from("traits are everywhere"),
    };

    println!("{}", article.summarize());
    println!("{}", tweet.summarize());
}
```

Trait 不是父类。`Article` 和 `Tweet` 没有共享一棵继承树，它们只是都实现了 `Summary` 这个行为契约。

## 二、默认实现：给行为一个兜底版本

Trait 方法可以有默认实现。实现类型可以使用默认版本，也可以覆盖。

```rust
trait Summary {
    fn author(&self) -> &str;

    fn summarize(&self) -> String {
        format!("read more from {}", self.author())
    }
}

struct BlogPost {
    author: String,
    title: String,
}

impl Summary for BlogPost {
    fn author(&self) -> &str {
        &self.author
    }

    fn summarize(&self) -> String {
        format!("{} - {}", self.title, self.author())
    }
}

struct ShortNote {
    author: String,
}

impl Summary for ShortNote {
    fn author(&self) -> &str {
        &self.author
    }
}

fn main() {
    let post = BlogPost {
        author: String::from("Ada"),
        title: String::from("Ownership in practice"),
    };
    let note = ShortNote {
        author: String::from("Linus"),
    };

    println!("{}", post.summarize());
    println!("{}", note.summarize());
}
```

默认实现适合表达“多数类型可以共享的行为”，但不要把复杂业务塞进 trait 默认方法里，容易让实现者看不见真实逻辑。

## 三、Trait 作为参数：静态多态

函数可以接受“任何实现了某个 trait 的类型”。

```rust
trait Summary {
    fn summarize(&self) -> String;
}

struct News {
    headline: String,
}

impl Summary for News {
    fn summarize(&self) -> String {
        self.headline.clone()
    }
}

fn notify(item: &impl Summary) {
    println!("breaking: {}", item.summarize());
}

fn notify_generic<T: Summary>(item: &T) {
    println!("generic breaking: {}", item.summarize());
}

fn main() {
    let news = News {
        headline: String::from("Rust 1.x released"),
    };

    notify(&news);
    notify_generic(&news);
}
```

`impl Summary` 是常用简写，`T: Summary` 是完整泛型写法。两者通常都会触发静态分发：编译器为具体类型生成具体代码。

## 四、多个约束和 where

当参数需要多个能力时，用 `+` 连接。约束多了，用 `where` 提高可读性。

```rust
use std::fmt::{Debug, Display};

fn log_value<T>(label: &str, value: T)
where
    T: Display + Debug,
{
    println!("{label}: {value} ({value:?})");
}

fn main() {
    log_value("status", 200);
    log_value("mode", "debug");
}
```

Trait bound 是设计 API 的关键。约束越多，调用者能传的类型越少。只写你真正需要的能力。

## 五、返回 impl Trait

函数也可以返回 `impl Trait`，表示“返回某个实现了该 trait 的具体类型，但调用者不需要知道它的名字”。

```rust
fn numbers() -> impl Iterator<Item = i32> {
    [1, 2, 3].into_iter().map(|n| n * 10)
}

fn main() {
    for n in numbers() {
        println!("{n}");
    }
}
```

限制是：同一个函数的所有返回路径必须返回同一种具体类型。

```rust
fn make_iter(reverse: bool) -> Box<dyn Iterator<Item = i32>> {
    if reverse {
        Box::new((1..=3).rev())
    } else {
        Box::new(1..=3)
    }
}

fn main() {
    for n in make_iter(true) {
        println!("{n}");
    }
}
```

这里两个分支的迭代器具体类型不同，所以改用 `Box<dyn Iterator<Item = i32>>` 做动态分发。

## 六、动态分发：Trait 对象

静态分发要求编译期知道具体类型。如果你需要把不同类型放进同一个集合，就要使用 trait 对象，例如 `Box<dyn Summary>`。

```rust
trait Draw {
    fn draw(&self);
}

struct Button {
    text: String,
}

struct Checkbox {
    checked: bool,
}

impl Draw for Button {
    fn draw(&self) {
        println!("[button: {}]", self.text);
    }
}

impl Draw for Checkbox {
    fn draw(&self) {
        println!("[{}]", if self.checked { "x" } else { " " });
    }
}

fn main() {
    let widgets: Vec<Box<dyn Draw>> = vec![
        Box::new(Button { text: String::from("Save") }),
        Box::new(Checkbox { checked: true }),
    ];

    for widget in widgets {
        widget.draw();
    }
}
```

`dyn Draw` 背后通常是一个胖指针：数据指针 + 虚表指针。调用方法时通过虚表查找具体实现，因此有一次间接调用成本，也失去了一些内联优化机会。

## 七、孤儿规则：不是所有 impl 都能写

Rust 有孤儿规则：你只能在“trait 或类型至少有一个定义在当前 crate”时实现 trait。

也就是说：

- 可以给你的类型实现标准库 trait。
- 可以给标准库类型实现你的 trait。
- 不能给标准库类型实现标准库 trait。

```rust
trait CsvRow {
    fn to_csv(&self) -> String;
}

impl CsvRow for String {
    fn to_csv(&self) -> String {
        self.replace(',', "\\,")
    }
}

fn main() {
    let name = String::from("Ada,Lovelace");
    println!("{}", name.to_csv());
}
```

这条规则避免不同库给同一组外部类型和外部 trait 写出冲突实现。

## 八、常见错误与修正

### 1. 忘记把 trait 引入作用域

很多方法来自 trait。trait 不在作用域时，方法可能“看起来不存在”。

```rust
use std::io::Write;

fn main() -> std::io::Result<()> {
    let mut buffer = Vec::new();
    buffer.write_all(b"hello")?;
    println!("{buffer:?}");
    Ok(())
}
```

`write_all` 来自 `Write` trait，所以要 `use std::io::Write;`。

### 2. 试图创建裸 dyn Trait

```rust
trait Job {
    fn run(&self);
}

struct PrintJob;

impl Job for PrintJob {
    fn run(&self) {
        println!("running");
    }
}

fn main() {
    let job: Box<dyn Job> = Box::new(PrintJob);
    job.run();
}
```

`dyn Trait` 大小在编译期不确定，不能直接作为局部变量保存。要放在指针后面，如 `&dyn Trait`、`Box<dyn Trait>`、`Rc<dyn Trait>`。

### 3. Trait 对象不满足对象安全

不是所有 trait 都能变成 `dyn Trait`。如果方法返回 `Self`，或方法本身有泛型参数，通常就不是对象安全的。

```rust
trait Named {
    fn name(&self) -> &str;
}

struct User {
    name: String,
}

impl Named for User {
    fn name(&self) -> &str {
        &self.name
    }
}

fn print_name(value: &dyn Named) {
    println!("{}", value.name());
}

fn main() {
    let user = User {
        name: String::from("Ada"),
    };
    print_name(&user);
}
```

如果你需要 trait 对象，设计 trait 时要避免对象不安全的方法，或给这些方法加 `where Self: Sized`。

## 九、工程使用边界

优先用泛型 + trait bound：

- 性能敏感。
- 调用路径固定。
- 不需要把不同具体类型放在同一个集合里。
- 希望编译器内联优化。

使用 `dyn Trait`：

- 需要异构集合。
- 插件式、组件式架构，运行时才决定具体实现。
- API 不想暴露复杂具体类型。
- 编译时间或二进制体积比极致性能更重要。

设计 trait 时：

- 方法数量保持克制，trait 越小越容易实现和组合。
- 不要把数据字段思维搬进 trait，trait 表达行为。
- 错误类型要认真设计，别在 trait 方法里随意返回 `String`。
- 公共库里的 trait 一旦发布很难改，默认方法可以降低破坏性。

## 十、结尾总结

Trait 是 Rust 抽象能力的中心。它让泛型有了“能力边界”，让类型之间可以通过行为协作，也让你在必要时使用动态分发。写 trait 时不要先想“我要不要模拟接口继承”，而要问：调用者真正需要依赖哪些行为？这些行为是编译期确定，还是运行时组合？

---
**下一篇：** `13-生命周期（Lifetimes）.md`，深呼吸，准备迎接 Rust 最出名也最关键的概念。
