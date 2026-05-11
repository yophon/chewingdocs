# 28-FFI（外部函数接口）与其他语言交互

> "Rust 最美好的愿景之一是：用 Rust 替换掉你系统里最吃性能的那一部分代码，而不必完全重写整个系统。"

FFI (Foreign Function Interface) 让你能从 Rust 调用 C 的代码，或者把 Rust 编译成动态链接库，供其他语言调用。

## 一、从 Rust 调用 C 语言函数

C 语言没有借用检查器，所以调用 C 函数是**绝对不安全**的，必须放在 `unsafe` 块中。

```rust
// 告诉编译器，这有一个叫 abs 的函数是在外部用 C 编译好的
extern "C" {
    fn abs(input: i32) -> i32;
}

fn main() {
    unsafe {
        println!("C 语言的 abs(-3) 结果是: {}", abs(-3));
    }
}
```

## 二、从其他语言调用 Rust 函数

要把 Rust 代码暴露给别的语言（如 C, Python, Node.js），你需要做两件事：
1. 告诉 Rust 不要破坏函数名（因为 Rust 编译器会做 Name Mangling，改变编译后的函数名）。
2. 指定使用 C 语言的调用约定。

```rust
// #[no_mangle] 告诉编译器不要重命名这个函数
// extern "C" 告诉编译器使用 C 的 ABI (应用程序二进制接口)
#[no_mangle]
pub extern "C" fn call_from_c() {
    println!("我是一个从 C 语言被调用的 Rust 函数！");
}
```

同时，你需要在 `Cargo.toml` 中把产物类型改为 `cdylib`（C 的动态链接库）：
```toml
[lib]
crate-type = ["cdylib"]
```
这样编译后，在 Linux 上会生成 `.so` 文件，在 Mac 上是 `.dylib`，在 Windows 是 `.dll`。

## 三、神级生态：NAPI-RS 与 PyO3

如果你要写跨语言绑定，千万别手写原生的 C-FFI，太折磨了。社区有做好的神器！

### 1. NAPI-RS (给 Node.js 写扩展)
Next.js, Vite, SWC 这些大名鼎鼎的前端工具，底层全都在用 Rust + NAPI-RS 重写。
你只需要在 Rust 函数上加一个 `#[napi]` 宏，它就能自动帮你生成 TypeScript 的 `.d.ts` 声明文件，并编译成 Node.js 可以直接 `require()` 的 `.node` 文件！

### 2. PyO3 (给 Python 写扩展)
用 Python 搞数据科学和 AI 时，如果遇到纯 Python 跑不动的 for 循环，加上 `#[pyfunction]` 宏，用 PyO3 编译成 `.so`，Python 里直接 `import` 调用，性能提升百倍。

---
**下一篇：** `29-WebAssembly（WASM）实战.md`，把 Rust 搬进浏览器！
