# 18-Async 与 Await 底层原理

> 一句话导读：Rust 的 async/await 不是语法糖版多线程，而是把异步流程编译成可暂停、可恢复、由运行时轮询的状态机。

前两篇讲的是操作系统线程：创建线程、共享状态、用锁或 channel 协调。线程模型适合 CPU 并行和阻塞任务，但对于高并发网络服务，每个连接一个线程会非常昂贵。Rust 的 async/await 解决的是另一类问题：大量任务都在等待 I/O，CPU 不应该陪它们一起等。

这篇不急着写 Tokio 应用，而是先把底层心智建立起来。理解 `Future`、`Poll`、`Waker` 和 `Pin` 后，后面看 Tokio、Axum、SQLx 的很多限制都会变得合理。

## 一、为什么需要 async

如果一个 Web 服务同时处理 10 万个连接，大多数连接并不是一直消耗 CPU，而是在等待：

- 等 socket 可读可写。
- 等数据库返回。
- 等磁盘 I/O。
- 等另一个服务响应。
- 等定时器到期。

如果给每个等待都分配一个 OS 线程，成本很高：

- 每个线程有栈内存。
- 线程切换由操作系统调度，开销不低。
- 线程数量过多时，调度本身会变成负担。

async 的核心思路是：任务遇到无法继续的 I/O 时返回 `Pending`，把当前线程让出来；等 I/O 准备好，运行时再唤醒它继续执行。

```text
Task A poll -> 等数据库 -> Pending
Task B poll -> 等网络   -> Pending
Task C poll -> CPU 计算 -> Ready
数据库可读 -> wake Task A -> 再次 poll
```

## 二、`async fn` 返回 Future

Rust 的 `async fn` 调用后不会立刻执行完内部逻辑，而是返回一个实现了 `Future` 的值。

```rust
async fn hello() -> String {
    println!("inside hello");
    "hello".to_string()
}

fn main() {
    let future = hello();
    // 这里只创建了 future。没有运行时轮询它，所以不会看到完整异步执行流程。
    drop(future);
}
```

在真实项目里，你需要运行时来驱动 future。下面用 Tokio 演示，代码接近生产中最常见的写法：

```rust
// Cargo.toml
// [dependencies]
// tokio = { version = "1", features = ["macros", "rt-multi-thread", "time"] }

use tokio::time::{sleep, Duration};

async fn fetch_user_name(id: u64) -> String {
    sleep(Duration::from_millis(50)).await;
    format!("user-{id}")
}

#[tokio::main]
async fn main() {
    let name = fetch_user_name(7).await;
    println!("{name}");
}
```

`.await` 的意思不是“阻塞线程等待结果”，而是“如果这个 future 还没准备好，当前 async 状态机暂停，把控制权交回运行时”。

## 三、`Future` trait：`Ready` 与 `Pending`

标准库里的核心 trait 是：

```rust
use std::future::Future;
use std::pin::Pin;
use std::task::{Context, Poll};

struct ReadyNumber;

impl Future for ReadyNumber {
    type Output = i32;

    fn poll(self: Pin<&mut Self>, _cx: &mut Context<'_>) -> Poll<Self::Output> {
        Poll::Ready(42)
    }
}
```

真实的 `Future` 会更复杂。它被 poll 时尝试推进一步：

- 如果已经完成，返回 `Poll::Ready(output)`。
- 如果暂时无法完成，注册唤醒信息，然后返回 `Poll::Pending`。

运行时不会凭空知道什么时候再 poll 一个 future。future 返回 `Pending` 前，必须安排好“将来可以继续时唤醒我”，这就是 `Waker` 的工作。

## 四、Waker：异步任务怎么被叫醒

可以把 `Waker` 理解成运行时给 future 的回拨按钮。I/O 资源准备好、定时器到点、channel 收到消息时，底层组件调用 `wake()`，运行时把对应任务重新放回可运行队列。

简化流程：

```text
Executor poll future
  |
  | future 发现 socket 还不可读
  v
注册 waker 到 reactor
  |
  | 返回 Pending
  v
Executor 去跑其他任务
  |
  | epoll/kqueue/IOCP 通知 socket 可读
  v
reactor 调用 waker.wake()
  |
  v
Executor 再次 poll future
```

这也是为什么 async 生态需要运行时。标准库定义了 `Future`，但不负责 reactor、定时器、任务队列、I/O 驱动。Tokio 就是这些组件的完整实现。

## 五、async 被编译成状态机

下面这段代码：

```rust
async fn load_then_parse() -> usize {
    let text = read_text().await;
    let count = parse_count(&text).await;
    count
}

async fn read_text() -> String {
    "1,2,3".to_string()
}

async fn parse_count(text: &str) -> usize {
    text.split(',').count()
}
```

编译器大致会把它变成一个状态机：

```text
State::Start
  -> poll read_text
  -> Pending 或保存中间变量并进入 State::Reading

State::Reading
  -> read_text Ready(text)
  -> poll parse_count(&text)
  -> Pending 或进入 State::Parsing

State::Parsing
  -> parse_count Ready(count)
  -> Ready(count)
```

这解释了两个重要事实：

1. async 函数里的局部变量可能跨 `.await` 存活。
2. future 的大小由它需要保存的状态决定，不是固定的小指针。

如果一个 async 函数里保存了很大的数组或结构体，并且跨 `.await` 存活，这个 future 本身也会变大。生产代码里要注意 future size，尤其是大量 spawn 的任务。

## 六、`Pin`：为什么 future 不能随便移动

async 状态机可能形成“自引用”结构：某个状态里保存了一个变量，同时另一个字段引用这个变量。普通 Rust 结构体被移动后地址会变化，自引用就可能失效。

`Pin<&mut T>` 的语义是：这个值已经被固定在内存位置上，不能再随便移动。`Future::poll` 的签名要求 `Pin<&mut Self>`，就是为了保护这类状态机。

日常开发里你通常不会手写 `poll`，所以很少直接操作 `Pin`。需要记住的实用规则是：

- 写 async 应用层代码时，基本只用 `.await`。
- 需要把 future 存进集合或 trait object 时，常用 `Pin<Box<dyn Future<Output = T> + Send>>`。
- 遇到复杂 stream、手写 future、自引用结构时，优先使用成熟库，不要轻易手搓 unsafe pin 逻辑。

示例：把多个不同 async 块装进同一个 Vec。

```rust
use std::future::Future;
use std::pin::Pin;

type BoxFuture<'a> = Pin<Box<dyn Future<Output = String> + Send + 'a>>;

fn make_tasks() -> Vec<BoxFuture<'static>> {
    vec![
        Box::pin(async { "first".to_string() }),
        Box::pin(async { "second".to_string() }),
    ]
}
```

## 七、并发不是并行：`join!`、`spawn` 与线程

async 并发和多线程并行是两回事。

```rust
// Cargo.toml
// tokio = { version = "1", features = ["macros", "rt-multi-thread", "time"] }

use tokio::time::{sleep, Duration};

async fn call_service(name: &'static str, ms: u64) -> &'static str {
    sleep(Duration::from_millis(ms)).await;
    name
}

#[tokio::main]
async fn main() {
    let (a, b) = tokio::join!(
        call_service("profile", 100),
        call_service("orders", 120),
    );

    println!("{a}, {b}");
}
```

`tokio::join!` 在同一个任务里并发轮询多个 future。它们遇到 `.await` 时会互相让出执行权，但不一定跑在不同 OS 线程上。

`tokio::spawn` 会创建一个独立异步任务，由运行时调度，可能跑在多线程运行时的任意 worker 上。

```rust
use tokio::time::{sleep, Duration};

#[tokio::main]
async fn main() {
    let handle = tokio::spawn(async {
        sleep(Duration::from_millis(50)).await;
        123
    });

    let value = handle.await.expect("task panicked");
    println!("{value}");
}
```

`spawn` 的 future 通常要求 `Send + 'static`，因为任务可能被调度到其他线程，也可能活得比当前函数调用更久。

## 八、常见错误与修正

### 错误 1：在非 async 函数里直接 `.await`

```rust
async fn load() -> String {
    "ok".to_string()
}

fn main() {
    // 编译失败：await 只能出现在 async 上下文中。
    // let value = load().await;
}
```

修正方式：使用运行时入口。

```rust
async fn load() -> String {
    "ok".to_string()
}

#[tokio::main]
async fn main() {
    let value = load().await;
    println!("{value}");
}
```

### 错误 2：在 async 里调用阻塞操作

```rust
use std::time::Duration;

async fn bad() {
    // 会阻塞当前运行时线程，不是异步 sleep。
    std::thread::sleep(Duration::from_secs(1));
}
```

修正方式：使用运行时提供的异步 API。

```rust
use tokio::time::{sleep, Duration};

async fn good() {
    sleep(Duration::from_secs(1)).await;
}
```

如果是 CPU 密集计算或无法替换的阻塞库，放到 `spawn_blocking`：

```rust
#[tokio::main]
async fn main() {
    let result = tokio::task::spawn_blocking(|| {
        (0..10_000_000_u64).sum::<u64>()
    })
    .await
    .expect("blocking task panicked");

    println!("{result}");
}
```

### 错误 3：持有非 `Send` 值跨 `.await` 后再 `spawn`

```rust
use std::rc::Rc;

#[tokio::main]
async fn main() {
    // 编译失败示意：Rc 不是 Send，如果跨 await 存活，不能放进 tokio::spawn。
    // tokio::spawn(async {
    //     let value = Rc::new("hello".to_string());
    //     tokio::time::sleep(std::time::Duration::from_millis(1)).await;
    //     println!("{value}");
    // });
}
```

修正方式：跨线程任务用 `Arc`，或者确保非 `Send` 值不跨 `.await`，或者使用 `LocalSet` 运行 `!Send` future。

```rust
use std::sync::Arc;
use tokio::time::{sleep, Duration};

#[tokio::main]
async fn main() {
    tokio::spawn(async {
        let value = Arc::new("hello".to_string());
        sleep(Duration::from_millis(1)).await;
        println!("{value}");
    })
    .await
    .unwrap();
}
```

### 错误 4：以为 drop future 会继续执行

Future 是惰性的，也是可取消的。一个 future 被 drop 后，它不会继续执行剩余逻辑。

```rust
use tokio::time::{sleep, Duration};

async fn write_audit_log() {
    sleep(Duration::from_secs(1)).await;
    println!("written");
}

#[tokio::main]
async fn main() {
    let task = write_audit_log();
    drop(task);
    println!("audit future was cancelled before running");
}
```

生产边界上，取消安全非常重要。不要在一个可被取消的 future 中先修改内存状态，再 `.await` 写数据库，然后假设两者一定同时成功。需要事务、补偿、幂等设计，或者把关键逻辑放到不可随意取消的后台任务中。

## 九、工程取舍与生产边界

async 适合：

- 高并发 I/O 服务：HTTP、RPC、WebSocket、数据库访问。
- 大量任务在等待外部资源。
- 需要在少量线程上处理大量连接。

async 不适合直接解决：

- CPU 密集型计算。它需要多线程并行、线程池、SIMD 或专门计算框架。
- 长时间阻塞的同步库。需要 `spawn_blocking` 或独立线程池。
- 简单 CLI 脚本。为了读一个文件引入完整运行时可能不划算。

生产代码要特别关注：

- 每个 `.await` 都是潜在让出点，状态可能被取消，锁可能被长期持有。
- 不要在 async 任务里使用阻塞 I/O。
- spawn 出去的任务要有生命周期管理，不能无上限创建。
- 超时、重试、限流、背压比“能 await”更重要。
- 注意依赖库是否真正异步。有些库接口是 async，但内部可能仍走阻塞线程池。

## 十、小结

Rust async 的底层是 `Future` 状态机。运行时不断 `poll` future，future 在无法继续时返回 `Pending` 并注册 `Waker`，准备好后再被唤醒。`Pin` 则保证状态机在内存中的位置稳定。

理解这些机制后，你会更容易判断什么时候用线程、什么时候用 async、为什么 `tokio::spawn` 要求 `Send + 'static`、为什么阻塞调用会拖垮异步服务。

下一篇 `19-Tokio运行时详解.md` 会把这些底层概念落到 Rust 生产异步生态的事实标准：Tokio。
