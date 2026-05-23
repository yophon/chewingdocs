# 04-所有权机制：Rust 的灵魂

> 一句话导读：所有权是 Rust 用编译期规则管理内存的方式，它让程序不依赖 GC，也不把释放内存的责任完全交给人脑。

在 C/C++ 中，内存释放靠程序员自觉，忘了释放会泄漏，重复释放会崩溃，释放后继续使用会产生未定义行为。在 Java、Go、JavaScript 中，垃圾回收器会在运行时帮你判断对象何时不再使用。Rust 选择第三条路：在编译期确定每个值的所有者和生命周期，离开作用域时自动释放。

## 核心心智模型

每个值都像一份资产，任意时刻只能有一个“户主”。户主离开作用域，资产就被释放。把资产交给另一个变量或函数，叫移动。想继续使用原资产，要么借用，要么克隆。

所有权解决的不是语法问题，而是内存安全问题：

- 谁负责释放这块内存？
- 什么时候释放？
- 释放后还有没有人继续访问？
- 有没有两个所有者重复释放同一块内存？

Rust 编译器严格，是因为它要在程序运行前排除这些问题。

## 栈和堆

栈适合大小固定、生命周期简单的数据，例如 `i32`、`bool`、固定长度数组。函数调用结束时，栈帧整体弹出，速度很快。

堆适合运行时大小不确定或需要动态增长的数据，例如 `String`、`Vec<T>`。堆分配需要记录指针、长度、容量等元信息，也需要明确什么时候释放。

以 `String` 为例：

```rust
fn main() {
    let s = String::from("hello");
    println!("{s}");
}
```

变量 `s` 本身在栈上，里面存着指向堆内存的指针、长度、容量。真正的 UTF-8 字节在堆上。`s` 离开作用域时，Rust 自动调用 `drop` 释放堆内存。

## 所有权三条规则

Rust 所有权规则可以压缩成三句话：

1. 每个值都有一个所有者。
2. 同一时刻只能有一个所有者。
3. 所有者离开作用域，值会被丢弃。

```rust
fn main() {
    {
        let message = String::from("hello");
        println!("{message}");
    } // message 到这里离开作用域，堆内存被释放
}
```

这段代码没有手动 `free`，也没有 GC。释放动作由编译器插入在确定的位置。

## Move：所有权转移

看一段新手最容易困惑的代码：

```rust
fn main() {
    let s1 = String::from("hello");
    let s2 = s1;

    println!("{s2}");
    // println!("{s1}");
}
```

`let s2 = s1;` 之后，`s1` 不再可用。因为 `String` 指向堆内存，如果简单复制栈上的指针、长度、容量，就会出现两个变量指向同一块堆内存。两个变量离开作用域时都尝试释放，就会二次释放。

Rust 的修正策略是：赋值后所有权从 `s1` 移动到 `s2`，旧绑定失效。它不是浅拷贝，而是 move。

如果取消最后的 `println!("{s1}")` 注释，会看到类似：

```text
error[E0382]: borrow of moved value: `s1`
```

修正方式有两种。确实需要两份数据，就克隆：

```rust
fn main() {
    let s1 = String::from("hello");
    let s2 = s1.clone();

    println!("s1 = {s1}, s2 = {s2}");
}
```

只是临时读取，就借用。借用下一篇详细讲：

```rust
fn main() {
    let s1 = String::from("hello");
    print_message(&s1);
    println!("still usable: {s1}");
}

fn print_message(message: &String) {
    println!("{message}");
}
```

## Copy：栈上小值的复制

基础数字类型不会 move：

```rust
fn main() {
    let x = 5;
    let y = x;

    println!("x = {x}, y = {y}");
}
```

因为 `i32` 实现了 `Copy`，赋值时直接复制值本身，没有堆资源需要协调释放。

常见 `Copy` 类型包括：

- 整数、浮点数、布尔、字符
- 只包含 `Copy` 类型的元组
- 一些简单值类型

`String`、`Vec<T>` 这类拥有堆资源的类型通常不实现 `Copy`。

## 函数传参也会移动

把值传给函数，和赋值一样可能发生 move：

```rust
fn main() {
    let name = String::from("Rust");
    take_name(name);
    // println!("{name}");

    let year = 2026;
    print_year(year);
    println!("year still usable: {year}");
}

fn take_name(name: String) {
    println!("name = {name}");
}

fn print_year(year: i32) {
    println!("year = {year}");
}
```

`name` 是 `String`，传入 `take_name` 后所有权移动到函数参数。函数结束时参数离开作用域，字符串被释放。`year` 是 `i32`，实现 `Copy`，所以传参只是复制。

如果确实想让函数处理后把所有权还回来，可以返回它：

```rust
fn main() {
    let message = String::from("hello");
    let message = add_suffix(message);

    println!("{message}");
}

fn add_suffix(mut value: String) -> String {
    value.push_str(", world");
    value
}
```

但大量这样写会很笨重。更常见的方案是引用和借用。

## 可编译综合示例

```rust
#[derive(Debug)]
struct Report {
    title: String,
    score: u32,
}

fn submit(report: Report) {
    println!("submit: {:?}", report);
}

fn main() {
    let draft = Report {
        title: String::from("Rust ownership"),
        score: 95,
    };

    println!("draft title before move: {}", draft.title);

    submit(draft);

    // draft 已经移动到 submit 中，不能再使用
    // println!("{:?}", draft);

    let retries = 3;
    let copied_retries = retries;
    println!("retries = {retries}, copied = {copied_retries}");
}
```

这段代码里 `Report` 拥有 `String`，所以整个结构体默认也不是 `Copy`。传给 `submit` 后，所有权移动。

## 常见编译器错误与修正

### 错误 1：使用已经移动的值

```rust
fn main() {
    let s = String::from("hello");
    let t = s;
    println!("{s}");
    println!("{t}");
}
```

错误：

```text
error[E0382]: borrow of moved value: `s`
```

修正一：使用 `clone`。

```rust
fn main() {
    let s = String::from("hello");
    let t = s.clone();
    println!("{s}");
    println!("{t}");
}
```

修正二：如果只是读取，传引用或使用引用。

```rust
fn main() {
    let s = String::from("hello");
    let t = &s;
    println!("{s}");
    println!("{t}");
}
```

### 错误 2：结构体部分移动

```rust
struct User {
    name: String,
    age: u32,
}

fn main() {
    let user = User {
        name: String::from("alice"),
        age: 18,
    };

    let name = user.name;
    println!("{name}");
    // println!("{}", user.name);
    println!("{}", user.age);
}
```

`user.name` 被移动走后，不能再使用这个字段。但 `user.age` 是 `Copy` 字段，仍可使用。工程上，如果后面还要整体使用 `user`，不要移动字段，改成借用：

```rust
struct User {
    name: String,
    age: u32,
}

fn main() {
    let user = User {
        name: String::from("alice"),
        age: 18,
    };

    let name = &user.name;
    println!("{name}");
    println!("{} {}", user.name, user.age);
}
```

## 为什么编译器这么限制

所有权限制看起来像是“编译器不信任我”，但它真正防的是三类运行时灾难：

- use after free：内存释放后继续访问。
- double free：同一块内存释放两次。
- iterator/reference invalidation：数据重新分配后，旧指针仍然被使用。

在有 GC 的语言里，这些问题被运行时系统隐藏；在 C/C++ 里，它们可能变成线上崩溃或安全漏洞。Rust 把规则前移到编译期，所以你会更早遇到错误，也更早修掉错误。

## 工程判断

所有权设计会影响 API：

- 函数需要消费数据，参数用 `T`。
- 函数只读数据，参数优先用 `&T` 或更通用的 `&str`、`&[T]`。
- 函数要修改数据，参数用 `&mut T`。
- 确实需要独立副本时再 `clone`，不要为了绕过编译器盲目克隆。

`clone` 不是坏事，但它应该表达真实需求：我要一份独立数据。如果只是为了让代码编译通过，通常说明所有权边界还没想清楚。

## 结尾总结

所有权是 Rust 的内存管理模型：值只有一个所有者，赋值和传参可能移动所有权，离开作用域自动释放。它的限制不是为了增加学习成本，而是为了在编译期消灭一整类内存错误。下一篇的引用与借用，就是在不转移所有权的前提下使用数据。

---

**下一篇：** `05-引用与借用.md`，学习如何只借数据，不拿走数据。
