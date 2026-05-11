# 17-消息传递-Channel

> "不要通过共享内存来通信，而应该通过通信来共享内存。" —— Go 语言的并发名言，在 Rust 里也同样适用。

在上一篇中，我们学习了用 `Mutex` 和 `Arc` 共享内存。但这很容易导致死锁，代码也很繁琐。更推荐的并发方式是：**消息传递（Message Passing）**。

## 一、什么是 Channel（通道）

通道有两个端点：发送端（Transmitter）和接收端（Receiver）。
就像水管一样，一个线程往里倒水（数据），另一个线程在另一端接水。

Rust 标准库提供了多生产者、单消费者（Multiple Producer, Single Consumer，简称 **mpsc**）的通道。

## 二、基础使用

```rust
use std::sync::mpsc;
use std::thread;

fn main() {
    // tx 是发送端，rx 是接收端
    let (tx, rx) = mpsc::channel();

    thread::spawn(move || {
        let val = String::from("hi");
        // send 返回 Result，如果接收端已经被释放就会返回 Err
        tx.send(val).unwrap(); 
        
        // println!("val is {}", val); // ❌ 报错！val 的所有权已经顺着管道发送出去了！
    });

    // 主线程阻塞等待接收消息
    let received = rx.recv().unwrap(); 
    println!("Got: {}", received);
}
```

**极其重要的细节**：`tx.send(val)` 会拿走 `val` 的**所有权**，并将其转移给接收者！这就从根源上杜绝了发送后，发送线程继续修改数据导致的数据竞争问题。

## 三、多个生产者，一个消费者

由于 `mpsc` 支持多生产者，我们可以通过**克隆发送端**，让多个线程向同一个接收端发送消息。

```rust
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

fn main() {
    let (tx, rx) = mpsc::channel();

    // 克隆一个发送端给第一个线程
    let tx1 = tx.clone();
    thread::spawn(move || {
        let vals = vec![
            String::from("hi"),
            String::from("from"),
            String::from("the"),
            String::from("thread"),
        ];

        for val in vals {
            tx1.send(val).unwrap();
            thread::sleep(Duration::from_millis(1));
        }
    });

    // 原始的 tx 给第二个线程
    thread::spawn(move || {
        let vals = vec![
            String::from("more"),
            String::from("messages"),
            String::from("for"),
            String::from("you"),
        ];

        for val in vals {
            tx.send(val).unwrap();
            thread::sleep(Duration::from_millis(1));
        }
    });

    // 接收端可以直接被当成迭代器使用
    // 它会一直等待消息，直到所有的 tx 都被 drop，循环才会结束
    for received in rx {
        println!("Got: {}", received);
    }
}
```

## 四、总结：Mutex vs Channel

什么时候用什么？
- **Channel**：像传送带。数据被转移（所有权转移）。适合任务分发、工作流、事件驱动。
- **Mutex**：像保险箱。数据保留在原地供大家抢。适合全局状态管理（如缓存、配置项更新）。

不管你选哪一个，Rust 都会帮你做好最难的线程安全检查。

---
**下一篇：** `18-Async与Await底层原理.md`，多线程太重了？来看异步编程！
