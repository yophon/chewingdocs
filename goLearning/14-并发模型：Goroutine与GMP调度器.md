# 并发模型：Goroutine 与 GMP 调度器

> **导读**：为什么 Go 单机能轻松扛下几十万并发？答案就在于极致轻量的协程和自带的 GMP 调度器。

## 一、Goroutine 简介
在 Go 中，创建一个并发任务只需一个关键字：`go`。
Goroutine 是用户态的轻量级线程（协程）。创建一个 OS 线程通常需要 2MB 内存，而创建一个 Goroutine 初始只需要 **2KB** 栈内存，并可动态伸缩。

```go
func task(id int) {
    fmt.Println("Task", id)
}

func main() {
    go task(1) // 抛入后台并发执行
    go task(2)
    time.Sleep(time.Second) // 等一下，否则 main 结束时所有 Goroutine 会被强杀
}
```

## 二、GMP 调度器模型
如果仅仅是轻量，那 Node.js 也能做到。Go 强就强在它是 **多对多(M:N)** 模型，内置了极其聪明的调度器。

- **G (Goroutine)**：协程。保存了自己栈和程序计数器状态。
- **M (Machine)**：操作系统的真实物理线程（Thread）。
- **P (Processor)**：逻辑处理器（默认为 CPU 核心数）。它维护了一个本地 G 队列。

**调度流程**：
1. `go func()` 创建一个 G，放入 P 的本地队列。
2. M 必须绑定一个 P，才能执行 P 队列中的 G。
3. **窃取机制(Work Stealing)**：如果某个 P 的队列空了，它的 M 会去其他 P 的队列里“偷”一半的 G 过来执行，保证 CPU 核心不闲置。
4. **移交机制(Hand Off)**：如果 G 执行了阻塞的系统调用（比如读文件卡住了），M 也会被一起卡住。此时调度器会把 P 摘下来，挂载到其他空闲的 M 上继续执行剩余的 G。

正是这种设计，让 Go 即拥有了高并发能力（几万个 G），又能充分榨干多核物理 CPU（多 M 执行）。
