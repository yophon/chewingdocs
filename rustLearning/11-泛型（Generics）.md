# 11-泛型（Generics）

> 一句话导读：Rust 的泛型让你为“形状相同、类型不同”的逻辑写一份代码，并在编译期生成高效的具体实现。

泛型不是为了炫技。它解决的是非常实际的问题：同一套逻辑要支持多个类型，但你不想复制粘贴，也不想牺牲性能。

比如“找最大值”这件事，对 `i32`、`f64`、`char` 都成立。没有泛型时，你会写出一堆重复函数；有泛型后，你只写一个函数，再用 trait bound 说明类型必须支持什么能力。

## 一、机制心智：类型参数 + 能力约束

泛型里的 `<T>` 只是“类型参数”。它告诉编译器：这里先不写死具体类型，等调用时再决定。

但 Rust 不会因为你写了 `<T>` 就允许你对它做任何事。你想比较，就必须要求 `T` 支持比较；你想打印，就必须要求 `T` 支持打印。

```rust
fn first<T>(items: &[T]) -> Option<&T> {
    items.get(0)
}

fn main() {
    let numbers = vec![1, 2, 3];
    let names = vec!["Ada", "Linus"];

    println!("{:?}", first(&numbers));
    println!("{:?}", first(&names));
}
```

上面这个函数不需要知道 `T` 的具体能力，因为它只返回引用，不比较、不复制、不打印内部值。

## 二、泛型函数：用 trait bound 描述能力

如果要找最大值，就需要元素能比较大小。这个能力由 `PartialOrd` 表达。

```rust
fn largest<T: PartialOrd>(items: &[T]) -> Option<&T> {
    let mut iter = items.iter();
    let mut largest = iter.next()?;

    for item in iter {
        if item > largest {
            largest = item;
        }
    }

    Some(largest)
}

fn main() {
    let numbers = vec![34, 50, 25, 100, 65];
    let chars = vec!['y', 'm', 'a', 'q'];

    println!("largest number: {:?}", largest(&numbers));
    println!("largest char: {:?}", largest(&chars));
}
```

这里返回 `Option<&T>`，因为空切片没有最大值。不要为了偷懒直接访问 `items[0]`，那会在空集合时 `panic`。

## 三、泛型结构体与枚举

结构体可以把字段类型写成泛型。

```rust
#[derive(Debug)]
struct Point<T> {
    x: T,
    y: T,
}

#[derive(Debug)]
struct Pair<T, U> {
    left: T,
    right: U,
}

fn main() {
    let p1 = Point { x: 3, y: 4 };
    let p2 = Point { x: 1.2, y: 3.4 };
    let pair = Pair { left: "age", right: 18 };

    println!("{p1:?}");
    println!("{p2:?}");
    println!("{pair:?}");
}
```

`Point<T>` 表示 `x` 和 `y` 必须是同一种类型。`Pair<T, U>` 表示两个字段可以是不同类型。

标准库里的 `Option<T>`、`Result<T, E>`、`Vec<T>`、`HashMap<K, V>` 都是泛型类型。

## 四、泛型方法：impl 后也要声明类型参数

为泛型结构体实现方法时，要在 `impl` 后声明泛型参数。

```rust
#[derive(Debug)]
struct Point<T> {
    x: T,
    y: T,
}

impl<T> Point<T> {
    fn x(&self) -> &T {
        &self.x
    }
}

impl Point<f64> {
    fn distance_from_origin(&self) -> f64 {
        (self.x.powi(2) + self.y.powi(2)).sqrt()
    }
}

fn main() {
    let int_point = Point { x: 3, y: 4 };
    let float_point = Point { x: 3.0, y: 4.0 };

    println!("x={}", int_point.x());
    println!("distance={}", float_point.distance_from_origin());
}
```

`impl<T> Point<T>` 给所有 `Point<T>` 实现方法；`impl Point<f64>` 只给 `Point<f64>` 实现方法。

## 五、多个约束与 where 写法

当约束变多时，`where` 比尖括号里堆满 trait 更清楚。

```rust
use std::fmt::Display;

fn print_pair<T, U>(left: T, right: U)
where
    T: Display,
    U: Display,
{
    println!("{left} -> {right}");
}

fn main() {
    print_pair("status", 200);
    print_pair("pi", 3.14);
}
```

如果函数需要复制值，可以要求 `Clone`；如果需要按值简单复制，可以要求 `Copy`。边界要按真实需求收紧，不要为了方便给泛型加一堆不必要的约束。

## 六、常见错误与修正

### 1. 对泛型值做没有声明能力的操作

```rust
use std::fmt::Display;

fn show<T: Display>(value: T) {
    println!("value={value}");
}

fn main() {
    show(42);
    show("hello");
}
```

如果没有 `T: Display`，`println!("{value}")` 就不能编译。Rust 只相信函数签名里的能力声明。

### 2. 返回局部变量的引用

```rust
fn make_value<T>(value: T) -> T {
    value
}

fn main() {
    let s = make_value(String::from("owned"));
    println!("{s}");
}
```

不要返回函数内部创建的局部变量引用。泛型不改变所有权规则。如果要把值交给调用者，返回拥有所有权的 `T`。

### 3. 误以为泛型会自动支持不同字段类型

```rust
#[derive(Debug)]
struct Point<T, U> {
    x: T,
    y: U,
}

fn main() {
    let p = Point { x: 5, y: 4.0 };
    println!("{p:?}");
}
```

`Point<T>` 的两个字段必须同类型。需要不同类型时，声明多个类型参数。

## 七、零成本抽象：单态化

Rust 泛型默认采用单态化。编译器会根据实际使用的类型生成具体版本。

```rust
fn identity<T>(value: T) -> T {
    value
}

fn main() {
    let a = identity(10_i32);
    let b = identity("rust");

    println!("{a}, {b}");
}
```

编译后，运行时没有一个“泛型 T”在那里动态判断类型。代码已经变成具体的 `i32` 版本、`&str` 版本等。这也是 Rust 泛型性能好的原因之一，代价是编译时间和二进制体积可能增加。

## 八、工程使用边界

适合使用泛型：

- 逻辑确实与具体类型无关。
- 类型只需要一组明确能力，比如比较、打印、序列化。
- 写库代码，希望调用者传入自己的类型。
- 避免重复实现同构逻辑。

不适合过早泛型化：

- 当前只有一个具体类型，未来需求不明确。
- 泛型约束变得很复杂，读者很难理解调用条件。
- 业务概念其实不同，只是字段长得像。

工程建议：

- 函数参数优先从具体类型写起，重复出现后再提炼泛型。
- trait bound 写最小能力，不要把 `Clone + Debug + Display + Default` 当成习惯性套餐。
- 返回类型尽量保持清晰，必要时用类型别名改善可读性。

## 九、结尾总结

泛型的本质是“用类型参数复用逻辑，用 trait bound 声明能力”。它不会绕过所有权，也不会牺牲运行时性能。写好泛型代码的关键不是把所有东西都抽象掉，而是让函数签名准确表达：我不关心你是什么类型，但我需要你具备哪些行为。

---
**下一篇：** `12-Trait-接口与多态.md`，理解泛型的灵魂伴侣。
