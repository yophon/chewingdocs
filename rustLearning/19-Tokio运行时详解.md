# 19-Tokio 运行时详解

> "Tokio 在 Rust 异步生态里的地位，就相当于 Node.js 里的 libuv 和 V8 加起来。它是你开发高性能网络应用的基础设施。"

由于 Rust 标准库刻意保持极小化，不提供异步运行时，社区涌现了许多运行时（如 async-std、smol）。但时至今日，**Tokio** 已经赢得了战争，成为 99% 生产环境的首选。

## 一、引入 Tokio 与 async main

在 `Cargo.toml` 中添加依赖，并开启完整特性：
```toml
[dependencies]
tokio = { version = "1.0", features = ["full"] }
```

现在，你可以用 Tokio 提供的宏把 `main` 函数变成异步了：
```rust
#[tokio::main] // 👈 这个宏在底层生成了运行时，并驱动你写的 async main 函数
async fn main() {
    println!("Hello from Tokio!");
    do_work().await;
}

async fn do_work() {
    // 这不是标准库的 sleep 阻塞线程，而是 tokio 提供的非阻塞 sleep
    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    println!("Work done");
}
```

## 二、用 `tokio::spawn` 实现高并发

`tokio::spawn` 就像 `std::thread::spawn`，但它生成的是**绿色线程（异步任务 Task）**。
Tokio 运行时会在背后的少数几个物理线程池里，极速调度成千上万个 Task。

```rust
use tokio::time::{sleep, Duration};

#[tokio::main]
async fn main() {
    let mut handles = vec![];

    for i in 0..10_000 { // 瞬间开启一万个异步任务！
        // spawn 接收一个 async 块（它是一个 Future）
        let handle = tokio::spawn(async move {
            sleep(Duration::from_millis(100)).await;
            println!("Task {}", i);
        });
        handles.push(handle);
    }

    // 等待所有任务完成
    for handle in handles {
        handle.await.unwrap();
    }
}
```
如果你尝试用 `std::thread::spawn` 开一万个物理线程，你的系统可能会卡死甚至内存 OOM。但用 `tokio::spawn`，几兆内存就搞定了。

## 三、Tokio 的核心组件

除了提供执行器（Executor），Tokio 为了让你不阻塞底层的调度线程，几乎**重写了所有涉及 I/O 的标准库**：

1. **文件系统**：`tokio::fs`（替代 `std::fs`），读写文件是 `.await` 的。
2. **网络**：`tokio::net`（替代 `std::net`），TcpListener 监听也是 `.await` 的。
3. **通道**：`tokio::sync::mpsc`（替代 `std::sync::mpsc`），非阻塞的消息队列。
4. **锁**：`tokio::sync::Mutex`。**注意**：在异步代码里，不要用标准库的 Mutex，如果你持有了标准库的锁然后去 `.await`，会导致整个运行时死锁。必须用 Tokio 的异步锁！

## 四、什么是 "阻塞运行时"（Blocking the runtime）

这是用 Tokio 最容易犯的致命错误！
```rust
#[tokio::main]
async fn main() {
    tokio::spawn(async {
        // ❌ 致命错误：用普通的 sleep 或进行庞大的 CPU 计算
        // 这会霸占底层的工作线程，导致其他所有的并发任务得不到调度（饥饿）！
        std::thread::sleep(Duration::from_secs(10)); 
    });
}
```
**黄金法则**：在 `async` 块里，如果某个操作花费的时间超过几百微秒，或者会阻塞当前线程（如复杂的 JSON 解析、大文件压缩、死循环），必须使用 `tokio::task::spawn_blocking` 把任务扔给专门的同步线程池去处理。

---
**第三部分“闭包、并发与异步”告一段落！**
这是 Rust 开发后端服务的心脏。
**下一篇：** `20-编写命令行工具（CLI）.md`，进入第四部分，我们终于要开始用前面的知识做实际的项目了。
