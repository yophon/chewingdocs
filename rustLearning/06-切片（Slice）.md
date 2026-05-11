# 06-切片（Slice）

> "切片就是数据的一段 '视窗'，它没有所有权，只提供视图。"

在写代码时，我们经常需要截取字符串或数组的一部分。在其他语言中，你可能会截取并返回一个新的字符串或数组拷贝。在 Rust 中，为了追求性能和内存安全，我们有**切片（Slice）**。

切片允许你引用集合中一段连续的元素序列，而不用引用整个集合。**切片是一类引用，所以它没有所有权。**

## 一、字符串切片（String Slices）

字符串切片的类型写作 `&str`。

```rust
let s = String::from("hello world");

// 使用范围语法 [starting_index..ending_index] （左闭右开）
let hello: &str = &s[0..5];
let world: &str = &s[6..11];
```

这里，`hello` 是一个引用，它指向 `s` 这个堆上数据的第 0 字节，并知道长度是 5。它**没有拷贝任何字符数据**，只是创建了一个很轻量的胖指针（包含指针地址和长度）。

### 语法糖
```rust
let s = String::from("hello");

let slice1 = &s[0..2];
let slice2 = &s[..2]; // 从头开始可以省略 0

let slice3 = &s[3..s.len()];
let slice4 = &s[3..]; // 到尾部可以省略长度

let slice5 = &s[..]; // 引用整个字符串
```

## 二、String 和 &str 的区别（面试必考）

这是 Rust 新手最抓狂的问题之一：为什么有两种字符串？

- `String`: 是一个可变的、在**堆**上分配的、有**所有权**的字符串。你可以 `push` 追加字符，因为它是动态大小的。
- `&str`: 字符串切片，是一个指向连续 UTF-8 字节的**引用（无所有权）**。它的长度是固定的。

**最重要的事实：字符串字面量就是切片**
```rust
let s: &str = "Hello, world!";
```
这里的 `"Hello, world!"` 被硬编码在了最终的可执行二进制文件的数据段中。`s` 只是一个指向二进制文件中特定位置的引用。所以字符串字面量是不可变的（它是 `&str`，不是 `String`）。

### 函数签名的最佳实践
当你写一个接收字符串的函数时，如果你不需要所有权，**请使用 `&str` 而不是 `&String` 作为参数。**

```rust
// ✅ 最佳实践：接收 &str
fn process_string(s: &str) {
    println!("{}", s);
}

fn main() {
    let my_string = String::from("hello");
    let my_str = "world";

    process_string(&my_string); // 传 String 的引用时，Rust 会自动解引用将其变为 &str，这叫 Deref 强制转换！
    process_string(&my_string[..]); // 传 String 的切片（这也是 &str）
    process_string(my_str);         // 直接传字面量（&str）
}
```
你看，如果参数是 `&str`，无论是 `String` 还是字面量都能传进去。如果参数是 `&String`，字面量就传不进去了，严重限制了 API 的通用性。

## 三、其他类型的切片

不光是字符串，数组也能切片。数组切片的类型是 `&[T]`。

```rust
let a = [1, 2, 3, 4, 5]; // 数组存在栈上

let slice: &[i32] = &a[1..3]; // slice 包含 [2, 3]

assert_eq!(slice, &[2, 3]);
```
它的工作原理和字符串切片完全一样，通过存储第一个元素的引用和一个长度来工作。

## 四、总结：切片与借用规则的配合

既然切片是一种引用，那它完全遵守上一篇提到的**借用规则**。
这就解释了为什么下面的代码会报错：

```rust
fn main() {
    let mut s = String::from("hello world");

    let word = first_word(&s); // word 拿到了 s 前半部分的不可变借用

    s.clear(); // ❌ 报错！clear 尝试获取 s 的可变借用以清空字符串

    println!("the first word is: {}", word); 
    // 上面还要用 word，说明不可变借用的作用域一直持续到这里
    // 所以中间不允许插入 clear 的可变借用
}

fn first_word(s: &String) -> &str {
    &s[..] // 略去逻辑，返回切片
}
```
如果没有这个报错，`s.clear()` 会清空堆内存，导致 `word` 变成悬垂指针！Rust 在编译期就保护了你。

---
**基础部分告一段落！**
**下一篇：** `07-结构体与方法（Struct & impl）.md`，看看 Rust 怎么做面向对象中的数据封装。
