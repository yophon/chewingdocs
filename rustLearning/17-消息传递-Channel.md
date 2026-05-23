# 17-消息传递：Channel

> 一句话导读：Channel 的核心不是“传值”，而是把数据所有权沿着一条明确的通道移动，让并发代码从“大家抢一份状态”变成“谁拥有数据谁处理”。

上一章用 `Arc<Mutex<T>>` 解决共享可变状态。它很直接，但状态越复杂，锁越多，死锁、锁竞争、持锁时间过长就越容易出现。另一种常见并发模型是消息传递：一个线程拥有状态，其他线程把命令、事件或数据发给它。

Rust 标准库提供 `std::sync::mpsc`，其中 `mpsc` 是 multiple producer, single consumer 的缩写：多个发送者，一个接收者。

## 一、机制心智：把所有权送过一条队列

Channel 可以想成一条带所有权转移的队列：

```text
producer thread 1 ---- send(Message) ----+
producer thread 2 ---- send(Message) ----+--> Receiver --> consumer thread
producer thread 3 ---- send(Message) ----+
```

关键规则：

1. 发送端调用 `send(value)` 后，`value` 的所有权转移给接收端。
2. 接收端 `recv()` 会阻塞等待消息，直到收到值或所有发送端都关闭。
3. 克隆发送端可以得到多个生产者；标准库的接收端不能克隆，所以是单消费者。
4. Channel 关闭不是异常情况，而是并发协议的一部分。

这种模型天然减少共享内存。发送者不再持有数据，接收者拿到完整所有权，所以不需要锁来保护这份数据。

## 二、最小可编译示例

```rust
use std::sync::mpsc;
use std::thread;

fn main() {
    let (tx, rx) = mpsc::channel();

    let worker = thread::spawn(move || {
        let message = String::from("build finished");
        tx.send(message).expect("receiver dropped");
        // message 在这里已经不能再使用，因为所有权已经发走。
    });

    let received = rx.recv().expect("sender dropped");
    println!("main got: {received}");

    worker.join().expect("worker panicked");
}
```

`send` 和 `recv` 都返回 `Result`：

- `send` 返回 `Err`：说明接收端已经被 drop，再发也没人收。
- `recv` 返回 `Err`：说明所有发送端都被 drop，不会再有消息。

生产代码里不应该盲目 `unwrap()`。后台线程、日志线程、任务分发器遇到通道关闭时，通常应该有序退出。

## 三、多个生产者

发送端可以 `clone`，每个线程拿一个发送端。

```rust
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

fn main() {
    let (tx, rx) = mpsc::channel();

    for id in 0..3 {
        let tx = tx.clone();

        thread::spawn(move || {
            for job in 0..3 {
                let message = format!("worker {id} produced job {job}");
                tx.send(message).expect("receiver dropped");
                thread::sleep(Duration::from_millis(20));
            }
        });
    }

    drop(tx);

    for message in rx {
        println!("{message}");
    }

    println!("all senders closed");
}
```

这里的 `drop(tx)` 很重要。循环里每个线程使用的是克隆出来的发送端，但主线程还保留着原始 `tx`。如果不 drop 原始发送端，`for message in rx` 会一直等待，因为它认为未来仍可能有新消息。

## 四、用消息表达命令

真实项目里不要只发送裸字符串。更常见的是用 enum 表达消息协议。

```rust
use std::sync::mpsc;
use std::thread;

#[derive(Debug)]
enum Command {
    Add(i64),
    Reset,
    GetTotal(mpsc::Sender<i64>),
    Shutdown,
}

fn main() {
    let (tx, rx) = mpsc::channel::<Command>();

    let manager = thread::spawn(move || {
        let mut total = 0;

        while let Ok(command) = rx.recv() {
            match command {
                Command::Add(value) => total += value,
                Command::Reset => total = 0,
                Command::GetTotal(reply_tx) => {
                    let _ = reply_tx.send(total);
                }
                Command::Shutdown => break,
            }
        }

        total
    });

    tx.send(Command::Add(10)).unwrap();
    tx.send(Command::Add(5)).unwrap();

    let (reply_tx, reply_rx) = mpsc::channel();
    tx.send(Command::GetTotal(reply_tx)).unwrap();
    println!("total = {}", reply_rx.recv().unwrap());

    tx.send(Command::Shutdown).unwrap();
    let final_total = manager.join().unwrap();
    println!("final total = {final_total}");
}
```

这段代码的心智很清晰：`manager` 线程独占 `total`，其他线程不能直接改它，只能发送命令。状态没有锁，业务协议写在 `Command` 里。

## 五、无界通道与有界通道

`mpsc::channel()` 是无界通道。发送者可以一直发送，队列会增长。如果接收者处理慢，内存可能持续上涨。

标准库还提供 `mpsc::sync_channel(bound)`，这是有界通道。队列满了以后，`send` 会阻塞，形成背压。

```rust
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

fn main() {
    let (tx, rx) = mpsc::sync_channel::<u32>(2);

    let producer = thread::spawn(move || {
        for n in 0..5 {
            println!("sending {n}");
            tx.send(n).expect("receiver dropped");
            println!("sent {n}");
        }
    });

    for value in rx {
        println!("received {value}");
        thread::sleep(Duration::from_millis(100));
    }

    producer.join().unwrap();
}
```

有界通道是生产系统里的重要工具。它能防止“生产速度远大于消费速度”时把内存打爆。代价是发送者可能被阻塞，因此要设计好超时、退出和降级策略。

## 六、非阻塞接收与超时

`recv()` 会一直阻塞。有些场景需要轮询或超时。

```rust
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

fn main() {
    let (tx, rx) = mpsc::channel();

    thread::spawn(move || {
        thread::sleep(Duration::from_millis(200));
        tx.send("done").unwrap();
    });

    loop {
        match rx.recv_timeout(Duration::from_millis(50)) {
            Ok(message) => {
                println!("got {message}");
                break;
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                println!("still waiting...");
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                println!("sender gone");
                break;
            }
        }
    }
}
```

还有 `try_recv()`，它完全不阻塞，适合在事件循环里检查是否有消息。但不要用忙等循环疯狂 `try_recv()`，否则会白白烧 CPU。

## 七、常见错误与修正

### 错误 1：发送后继续使用值

```rust
use std::sync::mpsc;

fn main() {
    let (tx, _rx) = mpsc::channel();
    let value = String::from("hello");
    tx.send(value).unwrap();

    // 编译失败：value 已经被移动
    // println!("{value}");
}
```

修正方式：如果确实需要保留，发送克隆值；但先确认复制成本可接受。

```rust
use std::sync::mpsc;

fn main() {
    let (tx, rx) = mpsc::channel();
    let value = String::from("hello");

    tx.send(value.clone()).unwrap();
    println!("local copy: {value}");
    println!("remote copy: {}", rx.recv().unwrap());
}
```

更好的方式通常是重新设计所有权：谁负责处理数据，谁就拿走它。

### 错误 2：接收循环永远不结束

```rust
use std::sync::mpsc;

fn main() {
    let (tx, rx) = mpsc::channel::<u32>();
    tx.send(1).unwrap();

    // 如果 tx 仍然活着，这个循环不会自然结束。
    // for item in rx { println!("{item}"); }
}
```

修正方式：关闭不再使用的发送端，或者发送显式的 `Shutdown` 消息。

```rust
use std::sync::mpsc;

fn main() {
    let (tx, rx) = mpsc::channel();
    tx.send(1).unwrap();
    drop(tx);

    for item in rx {
        println!("{item}");
    }
}
```

### 错误 3：把标准库 channel 用在 async 任务里

`std::sync::mpsc::Receiver::recv()` 会阻塞当前线程。如果你在 Tokio worker 线程里调用它，可能阻塞整个异步调度线程。

修正方式：

- 异步代码用 `tokio::sync::mpsc`。
- 如果必须桥接同步线程和异步运行时，明确把阻塞部分放进 `spawn_blocking` 或专门线程。

## 八、工程取舍：Channel 还是锁

优先考虑 channel 的场景：

- 任务分发、事件处理、日志聚合、后台写入。
- 某个状态应该只有一个拥有者，其他线程只提交命令。
- 需要背压，避免无限制堆积任务。
- 并发流程更像流水线，而不是共享一张表。

优先考虑锁的场景：

- 多个线程需要频繁读一个小对象。
- 状态访问非常短，锁竞争很低。
- 数据结构本身适合原地更新，比如缓存、计数器、连接表。

生产边界上还要关注：

- 通道容量：无界通道可能吃光内存，有界通道可能阻塞生产者。
- 关闭协议：靠 drop 关闭，还是发送 `Shutdown` 消息。
- 错误传播：worker 失败后，主线程如何感知。
- 顺序保证：单个发送者内部顺序通常保持，但多个发送者之间不要依赖全局顺序。

## 九、小结

Channel 让并发代码从“共享内存并加锁”转向“移动所有权并传递消息”。它特别适合表达任务队列、事件流和单线程状态管理器。

但 channel 不是银弹。队列容量、关闭时机、阻塞行为、错误传播都需要设计。Rust 帮你保证消息所有权安全，工程上仍然要保证协议清晰。

下一篇 `18-Async与Await底层原理.md` 会进入另一种并发方式：不用为每个任务创建 OS 线程，而是用 Future 和运行时在少量线程上调度大量 I/O 任务。
