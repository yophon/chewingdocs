# 26-Unsafe Rust

> "安全是 Rust 的招牌，但为了写操作系统、写底层驱动或者榨干最后一丝性能，Rust 留了一个后门：Unsafe。"

在这个 `unsafe` 大括号里，你等于对编译器说：“我保证我写的代码没问题，哪怕有悬垂指针、内存越界，出了事我负责。”

## 一、Unsafe 的五大超能力

使用 `unsafe` 关键字并不会关闭借用检查器！它只是赋予了你 5 项超能力：
1. 解引用裸指针
2. 调用不安全的函数或方法
3. 访问或修改可变静态变量
4. 实现不安全的 trait
5. 访问 union 的字段

## 二、解引用裸指针 (Raw Pointers)

和引用（`&`）不同，裸指针（`*const T` 和 `*mut T`）允许你无视借用规则，允许它为空，甚至允许悬垂！

```rust
fn main() {
    let mut num = 5;

    // 创建裸指针是安全的！
    // 只是拿到一个内存地址而已，不会发生什么危险的事。
    let r1 = &num as *const i32;
    let r2 = &mut num as *mut i32;

    // 真正的危险在于读取这块内存！所以解引用必须放在 unsafe 里。
    unsafe {
        println!("r1 is: {}", *r1);
        *r2 = 10;
        println!("r2 is: {}", *r2);
    }
}
```

## 三、调用 Unsafe 函数

很多底层的系统调用或者是 C 语言的 FFI 调用，Rust 是无法保证其安全性的，所以这些函数会被标记为 `unsafe fn`。

```rust
unsafe fn dangerous() {
    // 危险操作...
}

fn main() {
    // 调用它必须包裹在 unsafe 块中
    unsafe {
        dangerous();
    }
}
```

## 四、安全抽象 (Safe Abstraction)

在 Rust 标准库里，像 `Vec<T>`、`String`、`Rc<T>` 的底层源码，**全都是用 `unsafe` 写的**。
因为在计算机最底层，申请内存（malloc）、指针偏移本来就是不安全的。

但 Rust 提倡的思想是：**把不安全的底层逻辑封装起来，对外暴露安全的 API。**
只要 `Vec` 的实现者（Rust 官方团队）确保了它的逻辑没问题，你在上层使用 `Vec::push()` 时，就绝对不需要写 `unsafe`。

---
**下一篇：** `27-宏（Macros）.md`，写代码的代码。
