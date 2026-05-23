# 06-切片（Slice）

> 一句话导读：切片是对连续数据的一段借用视图，它不拥有数据，却能安全、高效地描述“其中一部分”。

写程序经常需要处理字符串的一段、数组的一段、缓冲区的一段。很多语言会直接复制出一个新集合，Rust 更鼓励使用切片：只借用原数据的一段范围，不复制底层内容。

## 核心心智模型

切片是一个“胖指针”：它包含起始位置和长度。它没有所有权，所以不会释放数据；它遵守借用规则，所以能防止原数据变化导致视图失效。

常见切片类型：

- `&str`：字符串切片，指向一段 UTF-8 字节。
- `&[T]`：数组、Vec 或其他连续集合的元素切片。
- `&mut [T]`：可变切片，可以修改切片覆盖的元素。

## 字符串切片

```rust
fn main() {
    let text = String::from("hello world");

    let hello = &text[0..5];
    let world = &text[6..11];

    println!("{hello}, {world}");
}
```

范围是左闭右开：`0..5` 包含索引 0 到 4，不包含 5。

常见简写：

```rust
fn main() {
    let text = String::from("hello");

    let a = &text[0..2];
    let b = &text[..2];
    let c = &text[2..text.len()];
    let d = &text[2..];
    let e = &text[..];

    println!("{a} {b} {c} {d} {e}");
}
```

## 字符串字面量就是 &str

```rust
fn main() {
    let literal: &str = "hello";
    let owned: String = String::from("world");
    let slice: &str = &owned;

    println!("{literal} {slice}");
}
```

`String` 是拥有所有权、可增长、堆分配的字符串。`&str` 是借用视图，可能指向二进制文件里的字符串字面量，也可能指向某个 `String` 的内部缓冲区。

因此，函数参数如果只需要读取字符串，优先写 `&str`：

```rust
fn print_uppercase(value: &str) {
    println!("{}", value.to_uppercase());
}

fn main() {
    let owned = String::from("rust");
    let literal = "cargo";

    print_uppercase(&owned);
    print_uppercase(literal);
}
```

如果参数写成 `&String`，字符串字面量就不方便传入，API 会变窄。

## UTF-8 边界问题

Rust 字符串是 UTF-8。字符串索引范围按字节计算，但切片边界必须落在合法字符边界上。

```rust
fn main() {
    let text = String::from("你好");
    let first = &text[0..3];

    println!("{first}");
}
```

`你` 占 3 个字节，所以 `0..3` 合法。如果写 `0..1`，运行时会 panic：

```text
byte index 1 is not a char boundary
```

工程上，不要随便按字节切中文字符串。需要按字符处理时，用 `.chars()`；需要按用户感知字符处理时，还要考虑 Unicode grapheme cluster，通常使用专门 crate。

## 数组和 Vec 的切片

```rust
fn sum(values: &[i32]) -> i32 {
    let mut total = 0;

    for value in values {
        total += value;
    }

    total
}

fn main() {
    let array = [1, 2, 3, 4, 5];
    let vector = vec![10, 20, 30, 40];

    println!("{}", sum(&array[1..4]));
    println!("{}", sum(&vector[..]));
}
```

`&[T]` 让函数同时接收数组切片和 Vec 切片，是非常常见的 API 设计。

## 可变切片

```rust
fn double_all(values: &mut [i32]) {
    for value in values {
        *value *= 2;
    }
}

fn main() {
    let mut nums = [1, 2, 3, 4];

    double_all(&mut nums[1..3]);

    println!("{:?}", nums);
}
```

输出：

```text
[1, 4, 6, 4]
```

`value` 的类型是 `&mut i32`，所以修改时要解引用：`*value *= 2`。

## 可编译综合示例：first_word

```rust
fn first_word(text: &str) -> &str {
    for (index, byte) in text.bytes().enumerate() {
        if byte == b' ' {
            return &text[..index];
        }
    }

    text
}

fn main() {
    let sentence = String::from("hello rust world");
    let word = first_word(&sentence);

    println!("first word = {word}");

    let literal = "cargo build";
    println!("first word = {}", first_word(literal));
}
```

这个函数接收 `&str`，所以既能处理 `String` 的引用，也能处理字符串字面量。

## 常见编译器错误与修正

### 错误 1：切片借用存在时修改原字符串

```rust
fn main() {
    let mut text = String::from("hello world");
    let word = &text[..5];

    text.clear();

    println!("{word}");
}
```

错误类似：

```text
error[E0502]: cannot borrow `text` as mutable because it is also borrowed as immutable
```

原因是 `word` 还要使用，如果 `text.clear()` 成功，`word` 会变成无效视图。修正：先用完切片，再修改原数据。

```rust
fn main() {
    let mut text = String::from("hello world");
    let word = &text[..5];

    println!("{word}");

    text.clear();
    println!("{text}");
}
```

### 错误 2：返回局部 String 的切片

```rust
// fn bad() -> &str {
//     let text = String::from("hello");
//     &text[..]
// }
```

局部 `text` 函数结束就释放，返回切片会悬垂。修正：返回 `String`，或者让调用方传入数据并返回它的切片。

```rust
fn first_two(text: &str) -> &str {
    &text[..2]
}

fn main() {
    let text = String::from("hi!");
    println!("{}", first_two(&text));
}
```

注意这个例子只适合 ASCII；真实字符串需要考虑字符边界。

## 工程判断

API 设计里，能用切片就少拿所有权：

- 只读字符串：`&str`
- 只读列表：`&[T]`
- 修改一段列表：`&mut [T]`
- 需要保存、增长、跨函数长期持有：`String` 或 `Vec<T>`

切片能减少复制，也能让函数更通用。但不要把切片保存到比原数据更长寿的地方。切片的生命依赖原数据，原数据没了，切片就不该存在。

## 结尾总结

切片是 Rust 高频使用的借用视图。它不拥有数据，所以轻量；它遵守借用规则，所以安全。掌握 `&str` 和 `&[T]` 后，你会写出更通用、更少复制的函数签名。

---

**下一篇：** `07-结构体与方法（Struct & impl）.md`，把相关数据和行为组织成自己的类型。
