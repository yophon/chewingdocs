# 11-泛型（Generics）

> "在 Java/C# 中泛型是为了少写强制类型转换，在 Rust 中，泛型是最高效的代码复用手段，因为它是'零成本'的。"

当我们有多个结构体或函数处理相同逻辑但类型不同时，就需要泛型 `<T>`。

## 一、泛型函数

假设我们要写一个找出列表中最大值的函数。如果没有泛型，我们要为 `i32` 写一个，为 `char` 写一个。

```rust
// T 是 Type 的简写，习惯性用 T 命名。
fn largest<T: std::cmp::PartialOrd>(list: &[T]) -> &T {
    let mut largest = &list[0];
    for item in list {
        if item > largest { // 这里需要 T 支持比较操作，所以要在上面加 trait bound (后面讲)
            largest = item;
        }
    }
    largest
}

fn main() {
    let number_list = vec![34, 50, 25, 100, 65];
    println!("最大的数字是 {}", largest(&number_list));

    let char_list = vec!['y', 'm', 'a', 'q'];
    println!("最大的字符是 {}", largest(&char_list));
}
```

## 二、泛型结构体与枚举

我们日常用的 `Option<T>` 和 `Result<T, E>` 就是泛型枚举。结构体也一样：

```rust
struct Point<T> {
    x: T,
    y: T, // x 和 y 必须是同一个类型 T
}

struct PointDiff<T, U> {
    x: T,
    y: U, // x 和 y 可以是不同类型
}

fn main() {
    let integer = Point { x: 5, y: 10 };
    let float = Point { x: 1.0, y: 4.0 };
    // let wont_work = Point { x: 5, y: 4.0 }; // ❌ 报错！x 是整数，那 y 也必须是整数
    let diff = PointDiff { x: 5, y: 4.0 }; // ✅ 正常工作
}
```

## 三、为泛型结构体实现方法

在 `impl` 块中使用泛型时，必须先在 `impl` 后面声明 `<T>`。

```rust
impl<T> Point<T> {
    fn x(&self) -> &T {
        &self.x
    }
}

// 我们甚至可以为特定的类型单独实现方法！
impl Point<f32> {
    fn distance_from_origin(&self) -> f32 {
        (self.x.powi(2) + self.y.powi(2)).sqrt()
    }
}
```
上面的 `distance_from_origin` 只有 `Point<f32>` 类型的实例能调用，`Point<i32>` 调不了。

## 四、核心原理：单态化 (Monomorphization)

面试常考题：**泛型会影响运行性能吗？**
答案：**绝对不会。Rust 的泛型是零成本抽象 (Zero-cost Abstraction)。**

当你用 `i32` 和 `f64` 调用泛型函数时，Rust 编译器在**编译期**就会把这份泛型代码"复制"出两份真实的、针对特定类型的代码。
运行时的程序根本不知道泛型的存在，它执行的是高度优化后的具体的机器码。这也是 Rust 编译慢的原因之一（用空间/编译时间换取极高的运行性能）。

---
**下一篇：** `12-Trait-接口与多态.md`，理解泛型的灵魂伴侣。
