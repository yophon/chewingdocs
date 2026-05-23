# 19-Tokio 运行时详解

> 一句话导读：Tokio 不只是让 `async main` 能跑起来，它是一整套任务调度、I/O 驱动、定时器、同步原语和阻塞隔离的生产级运行时。

上一章讲了 `Future`、`Poll`、`Waker` 和状态机。标准库只定义了这些抽象，但没有提供完整运行时。Rust 异步生态里最主流的运行时是 Tokio。你写 Axum、Tonic、SQLx、Redis 客户端、Kafka 客户端时，底层大概率都在依赖 Tokio。

学 Tokio 不能只学 `#[tokio::main]` 和 `tokio::spawn`。生产服务真正出问题的地方通常是：阻塞了运行时、任务无限增长、超时缺失、锁用错、后台任务无法关闭。

## 一、架构心智：Runtime = Executor + Reactor + 工具箱

Tokio 可以拆成几块理解：

```text
async 任务 Future
  |
  v
Executor 任务调度器
  |
  +--> worker threads 执行 poll
  |
  +--> task queue 保存可运行任务
  |
  v
Reactor I/O 驱动
  |
  +--> epoll/kqueue/IOCP
  +--> socket readiness
  +--> waker wake task
  |
  v
Utilities
  |
  +--> time / fs / net / sync / signal / process
```

`Executor` 负责 poll future；`Reactor` 负责监听 I/O 事件并唤醒任务；`tokio::time`、`tokio::net`、`tokio::sync` 等模块提供不会阻塞运行时线程的异步 API。

这也是 Tokio 和普通线程池最大的区别：它不是简单地把闭包扔到线程里跑，而是协作式调度大量可暂停的任务。

## 二、创建运行时：宏与手动方式

最常见写法是 `#[tokio::main]`：

```rust
// Cargo.toml
// [dependencies]
// tokio = { version = "1", features = ["macros", "rt-multi-thread", "time"] }

use tokio::time::{sleep, Duration};

#[tokio::main]
async fn main() {
    sleep(Duration::from_millis(100)).await;
    println!("hello tokio");
}
```

这个宏会在背后创建 runtime，然后 `block_on` 你的 async main。

有时你需要手动配置 runtime，比如控制 worker 数量、线程名、是否开启 I/O 和 time 驱动：

```rust
use tokio::runtime::Builder;
use tokio::time::{sleep, Duration};

fn main() {
    let runtime = Builder::new_multi_thread()
        .worker_threads(4)
        .thread_name("app-worker")
        .enable_io()
        .enable_time()
        .build()
        .expect("build tokio runtime");

    runtime.block_on(async {
        sleep(Duration::from_millis(50)).await;
        println!("runtime configured");
    });
}
```

CLI 工具、嵌入式运行时、测试环境里，手动构建更容易控制资源。Web 服务大多直接用宏即可。

## 三、`tokio::spawn`：任务不是线程

`tokio::spawn` 创建的是异步任务。它很轻，可以创建很多，但不是无限免费。

```rust
use tokio::time::{sleep, Duration};

#[tokio::main]
async fn main() {
    let mut handles = Vec::new();

    for id in 0..5 {
        let handle = tokio::spawn(async move {
            sleep(Duration::from_millis(50)).await;
            format!("task-{id}")
        });
        handles.push(handle);
    }

    for handle in handles {
        let output = handle.await.expect("task panicked");
        println!("{output}");
    }
}
```

注意几个点：

- `JoinHandle<T>` 本身也是 future，需要 `.await`。
- `handle.await` 的错误表示任务 panic 或被取消，不是业务返回的 `Err`。
- 被 spawn 的 future 通常要 `Send + 'static`。
- drop `JoinHandle` 不会自动停止任务，任务会继续在后台运行；如果要停止，用 `abort()` 或设计关闭信号。

## 四、并发控制：不要无限 spawn

很多服务刚开始写 Tokio 时会这样：

```rust
// for request in requests {
//     tokio::spawn(handle(request));
// }
```

如果上游突然打进 100 万个任务，内存、数据库连接、下游服务都会被压垮。生产代码必须有限流、背压或队列容量。

一种简单方式是 `Semaphore`：

```rust
use std::sync::Arc;
use tokio::sync::Semaphore;
use tokio::time::{sleep, Duration};

async fn call_downstream(id: usize) {
    sleep(Duration::from_millis(100)).await;
    println!("done {id}");
}

#[tokio::main]
async fn main() {
    let semaphore = Arc::new(Semaphore::new(3));
    let mut handles = Vec::new();

    for id in 0..10 {
        let permit = semaphore.clone().acquire_owned().await.unwrap();

        handles.push(tokio::spawn(async move {
            let _permit = permit;
            call_downstream(id).await;
        }));
    }

    for handle in handles {
        handle.await.unwrap();
    }
}
```

`permit` 的生命周期就是并发额度的生命周期。任务结束后 `_permit` drop，额度归还。

## 五、Tokio I/O：用异步 API 替代标准库阻塞 API

异步程序里应优先使用 Tokio 提供的 I/O 类型。

```rust
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

#[tokio::main]
async fn main() -> std::io::Result<()> {
    let listener = TcpListener::bind("127.0.0.1:4000").await?;

    loop {
        let (mut socket, addr) = listener.accept().await?;
        println!("accepted {addr}");

        tokio::spawn(async move {
            let mut buf = [0_u8; 1024];

            match socket.read(&mut buf).await {
                Ok(0) => {}
                Ok(n) => {
                    let _ = socket.write_all(&buf[..n]).await;
                }
                Err(err) => eprintln!("read error: {err}"),
            }
        });
    }
}
```

不要在 Tokio worker 线程里调用 `std::net::TcpListener::accept()`、`std::thread::sleep()`、大型同步文件读取、同步数据库客户端。它们会阻塞运行时线程，让其他 async 任务也跟着卡住。

## 六、阻塞边界：`spawn_blocking`

如果必须做 CPU 密集计算、压缩、加密、图片处理、调用同步 SDK，可以用 `tokio::task::spawn_blocking` 隔离。

```rust
#[tokio::main]
async fn main() {
    let checksum = tokio::task::spawn_blocking(|| {
        let mut acc = 0_u64;
        for n in 0..50_000_000 {
            acc = acc.wrapping_add(n);
        }
        acc
    })
    .await
    .expect("blocking task panicked");

    println!("checksum = {checksum}");
}
```

但 `spawn_blocking` 不是万能解药：

- 它使用专门的阻塞线程池，任务太多仍会排队。
- CPU 任务过多会争抢机器核心。
- 长时间不可取消的阻塞任务会拖慢优雅关闭。
- 对稳定高负载 CPU 任务，专门线程池或独立服务可能更清晰。

## 七、Tokio 同步原语

Tokio 提供 async 版本的锁、通道和通知工具：

- `tokio::sync::mpsc`：多生产者单消费者异步通道。
- `tokio::sync::oneshot`：一次性返回结果。
- `tokio::sync::broadcast`：一发多收，每个接收者都能收到。
- `tokio::sync::watch`：保留最新值，适合配置热更新。
- `tokio::sync::Mutex` / `RwLock`：异步锁。
- `tokio::sync::Notify`：轻量通知。

示例：用 mpsc 管理后台 worker。

```rust
use tokio::sync::mpsc;

#[derive(Debug)]
enum Job {
    SendEmail { to: String },
    Shutdown,
}

#[tokio::main]
async fn main() {
    let (tx, mut rx) = mpsc::channel::<Job>(100);

    let worker = tokio::spawn(async move {
        while let Some(job) = rx.recv().await {
            match job {
                Job::SendEmail { to } => println!("send email to {to}"),
                Job::Shutdown => break,
            }
        }
    });

    tx.send(Job::SendEmail { to: "a@example.com".into() }).await.unwrap();
    tx.send(Job::Shutdown).await.unwrap();

    worker.await.unwrap();
}
```

通道容量 `100` 是生产边界。容量太小会让上游频繁等待；容量太大会隐藏下游故障并堆积内存。

## 八、超时、取消与优雅关闭

异步服务不能无限等待下游。`tokio::time::timeout` 是最基础的保护。

```rust
use tokio::time::{timeout, sleep, Duration};

async fn slow_call() -> &'static str {
    sleep(Duration::from_secs(5)).await;
    "ok"
}

#[tokio::main]
async fn main() {
    match timeout(Duration::from_millis(200), slow_call()).await {
        Ok(value) => println!("success: {value}"),
        Err(_) => println!("timeout"),
    }
}
```

`timeout` 超时后会 drop 内部 future。被 drop 的 future 会被取消，因此业务逻辑必须能接受“执行到一半被取消”。涉及数据库写入、外部支付、消息投递时，要依赖事务、幂等键或补偿机制。

优雅关闭通常结合 `select!` 和信号：

```rust
use tokio::signal;
use tokio::time::{sleep, Duration};

async fn run_server() {
    loop {
        sleep(Duration::from_secs(1)).await;
        println!("tick");
    }
}

#[tokio::main]
async fn main() {
    tokio::select! {
        _ = run_server() => {}
        _ = signal::ctrl_c() => {
            println!("shutdown signal received");
        }
    }
}
```

真实服务还要通知后台任务停止、关闭接收端、等待 in-flight 请求完成、设置最大等待时间。

## 九、常见错误与修正

### 错误 1：在 async 里用 `std::thread::sleep`

```rust
use std::time::Duration;

async fn bad() {
    std::thread::sleep(Duration::from_secs(1));
}
```

修正：

```rust
use tokio::time::{sleep, Duration};

async fn good() {
    sleep(Duration::from_secs(1)).await;
}
```

### 错误 2：持有 `std::sync::MutexGuard` 跨 `.await`

```rust
use std::sync::Mutex;

async fn bad(lock: &Mutex<u64>) {
    let mut guard = lock.lock().unwrap();
    *guard += 1;
    // 如果这里 await，可能导致任务不可 Send 或阻塞其他任务。
    // some_async_call().await;
}
```

修正方式：缩小锁作用域，或者使用 `tokio::sync::Mutex`，但即使用 async mutex，也应避免持锁做慢 I/O。

```rust
use tokio::sync::Mutex;

async fn good(lock: &Mutex<u64>) {
    let current = {
        let mut guard = lock.lock().await;
        *guard += 1;
        *guard
    };

    println!("current = {current}");
}
```

### 错误 3：嵌套 runtime

在已有 Tokio runtime 里再创建 runtime 并 `block_on`，常见于库代码误用。

修正原则：

- 应用入口创建 runtime。
- 库函数暴露 async API，让调用方决定 runtime。
- 同步 API 调 async 需要非常谨慎，避免在 runtime worker 内阻塞。

### 错误 4：后台任务无人管理

```rust
// tokio::spawn(async move {
//     loop { do_work().await; }
// });
```

这类任务没有关闭信号、没有错误上报、没有 join 逻辑。生产里应该至少有：

- `JoinHandle` 保存和监控。
- shutdown channel 或 cancellation token。
- panic 和业务错误日志。
- 最大重启频率，避免失败循环刷屏。

## 十、工程取舍

用 Tokio 的合适场景：

- 网络服务：HTTP、RPC、WebSocket、代理、网关。
- 高并发客户端：爬虫、批量请求、消息消费。
- 需要和 Axum、SQLx、Tonic 等生态库协作。

不一定需要 Tokio 的场景：

- 简单命令行工具，只做少量同步文件操作。
- CPU 密集型计算，主要瓶颈不在 I/O。
- 嵌入式或极小运行时环境，需要更轻量 async runtime。

生产服务的基本清单：

- 所有外部调用有超时。
- 并发数量有限制。
- 阻塞代码隔离到 `spawn_blocking` 或独立线程池。
- 有关闭流程，不靠进程直接退出。
- 任务 panic 和 `JoinHandle` 错误被观测。
- 指标和 tracing 覆盖排队、耗时、错误率。

## 十一、小结

Tokio 是 Rust 异步生产生态的基础设施。它负责调度 future、驱动 I/O、管理定时器，并提供 async 版本的通道、锁和网络 API。

写 Tokio 代码的核心不是“所有函数都加 async”，而是管理边界：哪里会阻塞、哪里需要背压、哪里可能取消、哪里需要超时、后台任务如何关闭。

下一篇 `20-编写命令行工具（CLI）.md` 会换一个实战方向：用 Rust 写一个启动快、分发简单、错误信息清晰的命令行工具。
