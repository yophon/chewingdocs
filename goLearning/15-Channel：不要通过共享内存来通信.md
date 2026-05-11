# Channel：不要通过共享内存来通信

> **导读**：**"Do not communicate by sharing memory; instead, share memory by communicating."** 这一句 Go 官方格言道破了 Channel 的本质。

## 一、为什么需要 Channel？
传统的并发编程，多线程修改同一个变量，需要用到互斥锁（Mutex）。这很容易引发竞态条件和死锁。
Go 提供的 Channel，就像一根**线程安全的管道**，Goroutine A 把数据塞进去，Goroutine B 取出来。

## 二、Channel 的基础操作
```go
// 1. 创建无缓冲通道 (同步通信)
ch := make(chan int) 

// 2. 创建有缓冲通道 (异步通信，能存 3 个元素)
bufCh := make(chan string, 3)

// 3. 发送数据
ch <- 100 

// 4. 接收数据
val := <-ch

// 5. 关闭通道
close(ch)
```

**阻塞规则**：
- **无缓冲通道**：发送方必须等到有接收方在等，否则发不进去，卡死；接收方如果没有数据，也会卡死。
- **有缓冲通道**：缓冲满了，发送方卡死；缓冲空了，接收方卡死。

## 三、Select 多路复用
在系统编程中，我们常用 `epoll/select` 监听多个网络连接。在 Go 里，我们用 `select` 监听多个 Channel。

```go
select {
case msg1 := <-ch1:
    fmt.Println("收到来自 ch1 的消息", msg1)
case ch2 <- 100:
    fmt.Println("成功往 ch2 发送数据")
case <-time.After(2 * time.Second):
    fmt.Println("超时了！两秒内哪个 channel 都没有响应")
default:
    // 如果没有任何 channel 准备好，立即走 default，避免阻塞
    fmt.Println("非阻塞退出")
}
```

> **致命错误（Panic）总结**：
> 1. 向已经 close 的 channel 发送数据会 Panic。
> 2. close 一个已经 close 的 channel 会 Panic。
> 3. 从 close 的 channel 读取数据不会 Panic，会读到零值和 `false`（`val, ok := <-ch`）。
