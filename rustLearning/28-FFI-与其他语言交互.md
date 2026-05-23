# 28-FFI：与其他语言交互

> 一句话导读：FFI 让 Rust 能调用其他语言，也能被其他语言调用，但它同时把类型、内存、ABI 和线程安全责任推到了语言边界上。

FFI 是 Foreign Function Interface，外部函数接口。

你会在这些场景里用到它：

- Rust 调用已有 C 库。
- 把 Rust 高性能模块暴露给 C、Python、Node.js。
- 接入系统 API 或硬件 SDK。
- 渐进式重写老项目，而不是一次性全量迁移。

FFI 的价值很大，但风险也大。Rust 编译器无法检查另一门语言是否遵守 Rust 的所有权规则。

## 一、机制心智：跨语言边界只相信 ABI

Rust 和 C/Python/Node 的类型系统完全不同。它们能互相调用，是因为双方约定了 ABI。

ABI 包括：

- 函数名如何导出。
- 参数如何传递。
- 返回值如何传递。
- 调用栈由谁清理。
- 结构体内存布局。

Rust 默认 ABI 和名称修饰不适合直接给 C 调用，所以需要：

```rust
#[no_mangle]
pub extern "C" fn add(a: i32, b: i32) -> i32 {
    a + b
}
```

- `extern "C"`：使用 C ABI。
- `#[no_mangle]`：不要把函数名改成 Rust 内部符号。
- 参数和返回值要使用 FFI-safe 类型。

## 二、Rust 调用 C 函数

调用 C 标准库里的 `abs`：

```rust
unsafe extern "C" {
    fn abs(input: i32) -> i32;
}

fn main() {
    let value = unsafe { abs(-42) };
    assert_eq!(value, 42);
}
```

为什么要 `unsafe`？

因为 Rust 编译器只能看到函数签名，看不到 C 函数内部是否：

- 读写非法内存。
- 保存了指针。
- 违反线程安全。
- 返回无效值。

所有外部调用都应该被包装成安全 Rust API。

```rust
unsafe extern "C" {
    fn abs(input: i32) -> i32;
}

pub fn c_abs(input: i32) -> i32 {
    unsafe { abs(input) }
}
```

这个包装是安全的，因为 `abs(i32) -> i32` 不涉及指针、生命周期和共享内存。

## 三、把 Rust 编译成 C 可调用动态库

`Cargo.toml`：

```toml
[lib]
crate-type = ["cdylib"]
```

`src/lib.rs`：

```rust
#[no_mangle]
pub extern "C" fn add(a: i32, b: i32) -> i32 {
    a + b
}
```

构建：

```bash
cargo build --release
```

产物通常在：

- Linux：`target/release/libxxx.so`
- macOS：`target/release/libxxx.dylib`
- Windows：`target/release/xxx.dll`

C 侧声明：

```c
int add(int a, int b);
```

这类只传数值的 FFI 最简单，也最安全。

## 四、字符串和内存所有权

跨语言字符串是 FFI 最容易出事的地方。

Rust 的 `String` 不能直接暴露给 C。C 通常认识的是 `char*`，而 Rust 字符串是 UTF-8、带长度、由 Rust allocator 管理。

一个常见模式是：Rust 返回 `CString::into_raw()`，并提供对应释放函数。

```rust
use std::ffi::{CStr, CString};
use std::os::raw::c_char;

#[no_mangle]
pub extern "C" fn greet(name: *const c_char) -> *mut c_char {
    if name.is_null() {
        return std::ptr::null_mut();
    }

    let name = unsafe {
        CStr::from_ptr(name)
    };

    let name = match name.to_str() {
        Ok(value) => value,
        Err(_) => return std::ptr::null_mut(),
    };

    let message = format!("Hello, {name}");
    CString::new(message)
        .expect("format output should not contain nul")
        .into_raw()
}

#[no_mangle]
pub extern "C" fn free_rust_string(ptr: *mut c_char) {
    if ptr.is_null() {
        return;
    }

    unsafe {
        let _ = CString::from_raw(ptr);
    }
}
```

这里有一条硬规则：谁分配，谁释放。

`greet` 返回的指针由 Rust allocator 分配，所以必须通过 `free_rust_string` 释放，不能让 C 直接 `free()`。

## 五、结构体布局：repr(C)

Rust 默认不承诺结构体字段布局。给 C 使用的结构体必须加 `#[repr(C)]`。

```rust
#[repr(C)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

#[no_mangle]
pub extern "C" fn distance_from_origin(point: Point) -> f64 {
    (point.x * point.x + point.y * point.y).sqrt()
}
```

不要在 FFI 边界暴露这些类型：

- `String`
- `Vec<T>`
- `HashMap<K, V>`
- trait object
- Rust enum 默认布局
- 带泛型的复杂类型

FFI 边界尽量使用：

- 整数和浮点数。
- `#[repr(C)]` 结构体。
- 指针加长度。
- 明确的错误码。

## 六、错误处理：不要跨 FFI unwind

Rust panic 不能随意穿过 C ABI 边界。C++ exception、Python exception 也不能当作 Rust `Result` 自动跨过来。

FFI 函数应该捕获错误并返回错误码：

```rust
use std::panic::{catch_unwind, AssertUnwindSafe};

#[repr(C)]
pub struct DivideResult {
    pub ok: bool,
    pub value: i32,
}

#[no_mangle]
pub extern "C" fn safe_divide(a: i32, b: i32) -> DivideResult {
    let result = catch_unwind(AssertUnwindSafe(|| {
        if b == 0 {
            return None;
        }
        Some(a / b)
    }));

    match result {
        Ok(Some(value)) => DivideResult { ok: true, value },
        _ => DivideResult { ok: false, value: 0 },
    }
}
```

生产里可以设计更完整的错误结构，或者提供 `last_error_message()`。

## 七、构建脚本和 bindgen

如果 Rust 要链接一个 C 库，可以用 `build.rs`：

```rust
fn main() {
    println!("cargo:rustc-link-lib=ssl");
    println!("cargo:rustc-link-lib=crypto");
}
```

如果要从 C 头文件自动生成 Rust 声明，可以用 `bindgen`。它适合大型 C API，但生成结果需要审查，不要盲目信任。

如果你只是写新的跨语言接口，优先自己设计一个小而稳定的 C ABI，而不是把复杂 C++ 类层次直接暴露给 Rust。

## 八、PyO3 和 NAPI-RS：少手写原始 FFI

多数业务场景不需要手写 C ABI。

Python 扩展可以用 PyO3：

```rust
use pyo3::prelude::*;

#[pyfunction]
fn add(a: i64, b: i64) -> i64 {
    a + b
}

#[pymodule]
fn fast_math(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(add, m)?)?;
    Ok(())
}
```

Node.js 扩展可以用 NAPI-RS：

```rust
#[napi]
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}
```

这些框架会帮你处理很多类型转换、构建产物和包管理问题。

## 九、什么时候该用 FFI

适合使用 FFI：

- 已有稳定 C 库，不值得重写。
- 只想用 Rust 重写性能热点。
- 需要给 Python/Node 提供高性能扩展。
- 接系统 SDK、驱动、图形库、音视频库。
- 多语言系统需要共享一个底层核心。

不该使用 FFI：

- 只是为了“Rust 更快”但没有 profiling 证据。
- API 还在频繁变化。
- 边界类型复杂，涉及大量对象生命周期。
- 团队不熟悉内存所有权和 ABI。
- 可以用 HTTP/gRPC/消息队列等进程间协议清晰隔离。

很多时候，跨进程通信比 FFI 慢一点，但边界更清楚、崩溃隔离更好、部署也更简单。

## 十、常见坑

### 1. 忘记 `repr(C)`

没有 `repr(C)`，Rust 结构体布局不稳定，C 侧按字段读可能直接错。

### 2. 字符串释放方错误

Rust 分配的字符串必须由 Rust 提供的释放函数释放。

### 3. panic 穿过 FFI 边界

panic 跨 C ABI 是危险行为。FFI 外层应该捕获或保证不 panic。

### 4. C 保存了 Rust 临时指针

把 `&str.as_ptr()` 传给 C 后，C 如果保存这个指针，Rust 值释放后就悬垂。

### 5. 线程回调没考虑 Send/Sync

外部库可能在任意线程调用回调。传入闭包或状态前要确认线程安全。

## 十一、工程边界和审查清单

每个 FFI 函数都应该明确：

- 参数能否为空。
- 指针指向多长的内存。
- 内存由谁分配、谁释放。
- 函数是否会保存指针。
- 是否线程安全。
- 错误如何返回。
- 是否允许并发调用。

建议把原始 FFI 放在 `ffi` 模块，对外提供安全 Rust 包装：

```text
src/
├── ffi.rs       # unsafe extern 声明和裸指针转换
└── lib.rs       # safe wrapper
```

## 十二、结尾总结

FFI 的目标不是炫技，而是让 Rust 成为多语言系统里可靠的一块高性能核心。

使用原则：

1. 边界越小越好。
2. 类型越简单越好。
3. 所有权和释放函数必须成对设计。
4. 不要让 panic、复杂 Rust 类型、借用引用跨边界。
5. 能用 PyO3/NAPI-RS 这类成熟工具，就少手写原始 FFI。

FFI 写得好，是清晰的桥；写得差，就是跨语言内存事故入口。

---
**下一篇：** `29-WebAssembly（WASM）实战.md`，把 Rust 编译到浏览器和其他 WASM 运行时。
