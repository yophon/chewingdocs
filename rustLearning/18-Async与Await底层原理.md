# 18-Async 与 Await 底层原理

> "如果每个请求都开一个线程（OS Thread），哪怕服务器有 1000 个核心也抗不住 10 万的高并发。我们需要在少量线程里，并发执行大量任务：这就是 Async。"

在 JS 中，你觉得 `async/await` 很自然。在 Rust 中，它是零成本抽象的集大成者，也是进阶路上的一座大山。

## 一、为什么需要 Async？

OS 级别的线程虽然强大（前两篇学的内容），但有缺点：
1. **上下文切换开销大**：OS 切换线程很慢。
2. **内存开销大**：每个线程至少占用几 MB 的栈空间。

对于 **I/O 密集型**（如等网络请求、读大文件）任务，绝大部分时间都在等。用 OS 线程干等太浪费了。
**异步编程**就是在一个线程内，当你遇到 I/O 阻塞时，主动把 CPU 资源“让”出来，去执行另一个任务。

## 二、Rust 异步的最基础用法

和 JS 很像，用 `async fn`。
```rust
async fn hello_world() {
    println!("hello, world!");
}

fn main() {
    let future = hello_world(); // 啥也不会打印！
}
```
**重点 1：在 Rust 中，调用 `async` 函数会返回一个 `Future`，但它啥也不会执行！**
Rust 的异步是**惰性（Lazy）**的。必须要有一个“执行器（Executor）”去 `.await` 或者去轮询它，它才会真正跑起来。

如果在一个 async 函数内部，你可以用 `.await`：
```rust
async fn do_something() {
    hello_world().await; // 只有遇到 .await，才会真正去执行并获取结果
}
```

## 三、`Future` 到底是什么？

在底层，`async fn` 被编译器展开成了一个巨大的**状态机（State Machine）**。
它实现了 `std::future::Future` 这个 trait：

```rust
pub trait Future {
    type Output;
    // 每次执行器调用 poll，Future 就往前跑一步，直到遇到下一个 I/O 阻塞
    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output>;
}

pub enum Poll<T> {
    Ready(T),  // 任务彻底跑完了，给你结果 T
    Pending,   // 我遇到了阻塞，暂时交出控制权，一会儿再来找我！
}
```

执行器（Executor）会不断去 `poll` 所有的任务。如果返回 `Pending`，执行器就去 `poll` 别的任务。

## 四、`Pin` 是什么鬼？

在写高阶异步时，你经常会遇到编译器向你扔出 `Pin` 相关的错误。

因为 `Future` 是一个状态机（实际上是一个结构体），它内部可能存着局部变量，并且**局部变量互相存在引用**（比如一个变量借用了另一个变量）。
如果这个 `Future` 被在内存中移动（Move）了位置，那些内部的引用地址就全部失效了！（自引用结构体的灾难）。

`Pin` 的作用就是把它**钉死在内存中**，保证这块内存绝对不能被移动。
*作为新手，你只需要知道：当编译器抱怨需要 Pin 时，大部分情况用 `Box::pin(your_future)` 包一下就能解决。*

## 五、谁来执行 Future？

Rust 标准库**只**定义了 `Future` 的 trait，**并没有**提供执行器！
所以如果你只用标准库，你连 `main` 函数都不能加上 `async`：
```rust
// ❌ 报错：main function is not allowed to be `async`
// async fn main() { } 
```

如果要跑异步代码，你需要引入第三方的异步运行时（Runtime）。最霸权的那个叫 **Tokio**。

---
**下一篇：** `19-Tokio运行时详解.md`，Rust 异步生态的事实标准。
