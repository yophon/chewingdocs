# 12-Trait：接口与多态

> "Trait 类似于其他语言中的接口（Interface），但它更强大，因为它可以让你给别人写的类型（甚至标准库的类型）补充行为！"

在上一篇泛型中，我们提到了 `T: std::cmp::PartialOrd`，这就是 Trait。Trait 定义了类型必须拥有的行为。

## 一、定义与实现 Trait

假设我们有一个新闻网站，上面有新闻文章（NewsArticle）和微博推文（Tweet），我们希望它们都能生成一个摘要打印出来。

```rust
// 1. 定义 Trait
pub trait Summary {
    fn summarize(&self) -> String;
}

pub struct NewsArticle {
    pub headline: String,
    pub content: String,
}

// 2. 为具体的结构体实现 Trait
impl Summary for NewsArticle {
    fn summarize(&self) -> String {
        format!("Headline: {}", self.headline)
    }
}

pub struct Tweet {
    pub username: String,
    pub content: String,
}

impl Summary for Tweet {
    fn summarize(&self) -> String {
        format!("{}: {}", self.username, self.content)
    }
}
```

### 默认实现
Trait 里的方法可以提供默认的实现体。如果实现这个 Trait 的类型没有覆盖它，就会使用默认实现。

## 二、Trait 作为参数 (多态)

现在我们写一个函数，接受**任何**实现了 `Summary` Trait 的类型。

```rust
// 使用 impl Trait 语法
pub fn notify(item: &impl Summary) {
    println!("Breaking news! {}", item.summarize());
}
```
有了这个函数，你不管是传 `&NewsArticle` 还是 `&Tweet` 都可以。

### Trait Bound (特征约束)
`impl Trait` 只是一个语法糖。它完整的泛型写法被称为 Trait Bound：
```rust
pub fn notify<T: Summary>(item: &T) { ... }
```

如果一个函数需要参数同时实现多个 Trait，可以使用 `+`：
```rust
pub fn notify(item: &(impl Summary + Display)) { ... }
// 或者：
pub fn notify<T: Summary + Display>(item: &T) { ... }
```

### where 从句 (让签名更清晰)
当泛型泛滥时，尖括号会变得难以阅读，Rust 提供了 `where`：
```rust
fn some_function<T, U>(t: &T, u: &U) -> i32
    where T: Display + Clone,
          U: Clone + Debug
{ ... }
```

## 三、静态分发 vs 动态分发

刚刚提到的所有泛型和 `impl Trait`，都在编译期进行**单态化**，这叫**静态分发（Static Dispatch）**，运行速度极快。

但如果你想要在一个 `Vec` 里同时装入 `NewsArticle` 和 `Tweet`（异构集合），静态分发做不到。这时候需要**动态分发（Dynamic Dispatch）**，使用 `Box<dyn Trait>`（Trait 对象）：

```rust
// 这是一个存放任意实现了 Summary 特征的对象的数组。
// 'dyn' 关键字代表动态分发，这会引入运行时的性能开销（虚表查找）。
let my_list: Vec<Box<dyn Summary>> = vec![
    Box::new(NewsArticle { ... }),
    Box::new(Tweet { ... }),
];
```

---
**下一篇：** `13-生命周期（Lifetimes）.md`，深呼吸，准备迎接 Rust 最臭名昭著但也最伟大的概念。
