# 并发模型：Goroutine 与 GMP 调度器

> **一句话导读**：Goroutine 让并发任务变便宜，GMP 调度器让这些任务高效跑在多核线程上，但它不等于“开得越多越快”，更不等于自动消除阻塞和竞态。

## 一、先区分并发与并行

```text
concurrency: 同时处理多个任务的结构
parallelism: 同一时刻真的在多个 CPU 核上执行
```

Go 的 `go func()` 创建的是并发任务。是否并行执行，取决于可用 CPU、`GOMAXPROCS`、调度器状态、阻塞点和任务类型。

```go
package main

import (
    "fmt"
    "sync"
)

func main() {
    var wg sync.WaitGroup

    for i := 0; i < 3; i++ {
        wg.Add(1)
        go func(id int) {
            defer wg.Done()
            fmt.Println("worker", id)
        }(i)
    }

    wg.Wait()
}
```

运行方式：

```bash
go run main.go
```

不要用 `time.Sleep` 等 goroutine 完成，应该用 `sync.WaitGroup`、channel 或 context。

## 二、GMP 心智模型

```text
G: Goroutine，待执行的任务
M: Machine，操作系统线程
P: Processor，调度上下文，持有本地运行队列

             global run queue
                    |
                    v
P0 local queue --> M0 --> CPU core
P1 local queue --> M1 --> CPU core
P2 local queue --> M2 --> CPU core
```

关键规则：

- G 是 Go 代码层面的执行单元。
- M 是真实 OS 线程。
- P 是执行 Go 代码所需的调度资源。
- M 必须绑定 P 才能执行 Go 代码。
- `GOMAXPROCS` 决定同时执行 Go 代码的 P 数量，默认通常等于可用 CPU 数。

创建 goroutine 时，新 G 会进入某个 P 的本地队列或全局队列。M 从 P 的队列取 G 执行。某个 P 没活干时，会尝试从全局队列或其他 P 的本地队列偷任务。

## 三、调度器做了什么

### 1. Work Stealing

```text
P0: [G1 G2 G3 G4]
P1: []

P1 发现没活 -> 从 P0 偷一部分 G

P0: [G1 G2]
P1: [G3 G4]
```

这让负载更均匀，避免某个 CPU 忙死、另一个 CPU 空闲。

### 2. Hand Off

如果 G 进入阻塞系统调用，例如某些文件 IO 或 syscall，执行它的 M 可能被 OS 挂起。调度器会把 P 从这个 M 上摘下来，交给其他 M 继续跑剩余 G。

```text
G blocks in syscall
M0 blocked
P0 detached from M0
P0 attached to M1
```

这就是 Go 能在大量阻塞任务中保持吞吐的关键之一。

### 3. 抢占调度

早期 Go 对 CPU 密集型长循环的抢占能力较弱，现代 Go 已经有异步抢占。即便如此，也不要写永不阻塞、永不调用函数、无退出条件的忙循环。它会浪费 CPU，也让调度更困难。

## 四、一个 worker pool 示例

无限制地为每个请求开 goroutine 很容易把外部系统打爆。常见工程做法是 worker pool。

```go
package main

import (
    "context"
    "fmt"
    "sync"
    "time"
)

func worker(ctx context.Context, id int, jobs <-chan int, wg *sync.WaitGroup) {
    defer wg.Done()

    for {
        select {
        case <-ctx.Done():
            return
        case job, ok := <-jobs:
            if !ok {
                return
            }
            time.Sleep(50 * time.Millisecond)
            fmt.Printf("worker %d handled job %d\n", id, job)
        }
    }
}

func main() {
    ctx, cancel := context.WithCancel(context.Background())
    defer cancel()

    jobs := make(chan int)
    var wg sync.WaitGroup

    for i := 0; i < 3; i++ {
        wg.Add(1)
        go worker(ctx, i, jobs, &wg)
    }

    for j := 0; j < 10; j++ {
        jobs <- j
    }
    close(jobs)

    wg.Wait()
}
```

运行：

```bash
go run main.go
```

这个例子表达了三个工程原则：

- goroutine 要有退出路径。
- 并发度要能被控制。
- 等待完成要有明确同步机制。

## 五、常见误区

### 误区 1：goroutine 很轻，所以可以无限开

Goroutine 初始栈很小，但不是零成本。大量 goroutine 会带来：

- 栈内存和调度开销。
- 更高 GC 扫描成本。
- 外部资源压力，例如数据库连接、HTTP 下游、文件句柄。
- 排队延迟和内存堆积。

并发度应该由瓶颈资源决定，而不是由“goroutine 很轻”决定。

### 误区 2：GOMAXPROCS 越大越快

CPU 密集型任务的并行度通常受 CPU 核数限制。把 `GOMAXPROCS` 调得远超核心数，可能增加上下文切换和竞争。IO 密集型服务也不一定靠调大它解决问题，更多要看连接池、超时、队列和下游容量。

查看：

```go
fmt.Println(runtime.GOMAXPROCS(0))
```

运行时设置：

```bash
GOMAXPROCS=4 go run main.go
```

### 误区 3：goroutine 崩溃只影响自己

goroutine 内 panic 如果没有 recover，会导致整个进程退出。

```go
go func() {
    panic("boom")
}()
```

服务端后台任务要在边界处 recover、记录日志，并决定是否重启任务。

```go
go func() {
    defer func() {
        if r := recover(); r != nil {
            log.Printf("worker panic: %v", r)
        }
    }()
    runWorker()
}()
```

### 误区 4：并发自动提升性能

如果任务是小计算，启动 goroutine 和同步的成本可能比直接执行更高。并发适合隐藏等待时间或利用多核，不适合给每一行普通代码都套 `go`。

## 六、测试与诊断方式

### race detector

```bash
go test -race ./...
```

它能发现很多数据竞争，但不能证明并发设计没有死锁、泄漏或资源耗尽。

### goroutine 泄漏检查

测试里可以用超时防止无限等待：

```go
select {
case <-done:
case <-time.After(time.Second):
    t.Fatal("timeout, possible goroutine leak")
}
```

### pprof 观察 goroutine

服务端可引入：

```go
import _ "net/http/pprof"
```

并启动 debug server 后访问：

```bash
go tool pprof http://localhost:6060/debug/pprof/goroutine
```

goroutine profile 能看出大量 goroutine 卡在哪里，例如 channel receive、mutex lock、syscall。

## 七、工程取舍

- 短生命周期任务：可以直接 `go func()`，但要有错误处理和退出机制。
- 批量处理：优先 worker pool，限制并发度。
- 请求链路：用 `context.Context` 传递取消和超时。
- CPU 密集型：并发度接近 CPU 核数，重点减少共享状态。
- IO 密集型：关注下游容量、连接池和超时，不要只盯 goroutine 数。
- 后台常驻任务：要有 recover、日志、监控和优雅关闭。

## 八、结尾总结

Goroutine 解决的是“低成本描述并发任务”，GMP 调度器解决的是“把大量 G 高效映射到少量 OS 线程和 CPU 上”。它们让并发变容易，但不会替你设计容量、取消、同步、错误处理和资源边界。真正稳定的 Go 并发程序，核心不是开更多 goroutine，而是让每个 goroutine 都有清晰职责、受控生命周期和可观测的阻塞点。
