# Channel：不要通过共享内存来通信

> **一句话导读**：Channel 是 goroutine 之间传递所有权、信号和结果的同步原语，适合表达流程协作，但不应该被当成所有并发问题的唯一答案。

## 一、心智模型：Channel 是带同步语义的队列

```text
sender goroutine  -- value -->  channel  -- value --> receiver goroutine
                         ^                  ^
                         |                  |
                    may block           may block
```

Channel 同时承担两件事：

- 数据传递：把一个值从发送方交给接收方。
- 同步：发送和接收可能阻塞，从而建立 goroutine 之间的执行关系。

无缓冲 channel 更像“当面交接”，有缓冲 channel 更像“有限邮箱”。

```text
unbuffered: sender waits until receiver is ready
buffered:   sender waits only when buffer is full
```

## 二、基础操作

```go
package main

import "fmt"

func main() {
    ch := make(chan int)

    go func() {
        ch <- 42
    }()

    v := <-ch
    fmt.Println(v)
}
```

运行方式：

```bash
go run main.go
```

有缓冲 channel：

```go
ch := make(chan string, 2)
ch <- "a"
ch <- "b"
fmt.Println(<-ch)
fmt.Println(<-ch)
```

关闭 channel：

```go
close(ch)
```

关闭表示“不会再有新值发送”，不是“清空 channel”，也不是“通知所有发送方停止”。

## 三、阻塞和关闭规则

| 操作 | nil channel | open channel | closed channel |
| --- | --- | --- | --- |
| 发送 | 永久阻塞 | 可能阻塞或成功 | panic |
| 接收 | 永久阻塞 | 可能阻塞或成功 | 立即返回零值 |
| 关闭 | panic | 成功 | panic |

读取关闭状态：

```go
v, ok := <-ch
if !ok {
    fmt.Println("channel closed")
}
fmt.Println(v)
```

遍历直到关闭：

```go
for v := range ch {
    fmt.Println(v)
}
```

`range ch` 只有在 channel 被关闭并且缓冲区被读完后才退出。

## 四、select 多路复用

```go
select {
case v := <-ch1:
    fmt.Println("ch1:", v)
case ch2 <- 100:
    fmt.Println("sent to ch2")
case <-time.After(2 * time.Second):
    fmt.Println("timeout")
}
```

如果多个 case 同时就绪，Go 会伪随机选择一个。不要依赖 select case 的顺序实现优先级。

非阻塞尝试：

```go
select {
case v := <-ch:
    fmt.Println(v)
default:
    fmt.Println("no value")
}
```

带取消的等待：

```go
select {
case result := <-resultCh:
    return result, nil
case <-ctx.Done():
    return "", ctx.Err()
}
```

## 五、关键代码：生产者消费者

```go
package main

import (
    "context"
    "fmt"
    "sync"
    "time"
)

func producer(ctx context.Context, out chan<- int) {
    defer close(out)

    for i := 0; i < 5; i++ {
        select {
        case <-ctx.Done():
            return
        case out <- i:
        }
    }
}

func consumer(ctx context.Context, id int, in <-chan int, wg *sync.WaitGroup) {
    defer wg.Done()

    for {
        select {
        case <-ctx.Done():
            return
        case v, ok := <-in:
            if !ok {
                return
            }
            time.Sleep(50 * time.Millisecond)
            fmt.Printf("consumer %d got %d\n", id, v)
        }
    }
}

func main() {
    ctx, cancel := context.WithCancel(context.Background())
    defer cancel()

    jobs := make(chan int, 2)
    var wg sync.WaitGroup

    go producer(ctx, jobs)

    for i := 0; i < 2; i++ {
        wg.Add(1)
        go consumer(ctx, i, jobs, &wg)
    }

    wg.Wait()
}
```

运行：

```bash
go run main.go
```

注意函数签名里的方向：

```go
out chan<- int // 只能发送
in <-chan int  // 只能接收
```

方向限制让 API 意图更明确，也能让编译器阻止误用。

## 六、常见坑

### 坑 1：由接收方关闭 channel

一般原则：谁发送，谁关闭。接收方不知道是否还有其他发送方，贸然关闭会导致发送方 panic。

错误示例：

```go
func consumer(ch chan int) {
    close(ch) // 危险：可能还有 producer 正在发送
}
```

多个发送方时，通常由协调者在所有发送方退出后关闭。

```go
var wg sync.WaitGroup
out := make(chan int)

for i := 0; i < 3; i++ {
    wg.Add(1)
    go func(id int) {
        defer wg.Done()
        out <- id
    }(i)
}

go func() {
    wg.Wait()
    close(out)
}()
```

### 坑 2：把 channel 当队列无限堆积

有缓冲 channel 的容量不是越大越好。容量太大可能隐藏下游变慢，让内存堆积更久才暴露问题。容量应该来自吞吐、延迟和背压设计。

### 坑 3：nil channel 导致永久阻塞

```go
var ch chan int
<-ch // forever
```

nil channel 在 select 中有一个有用场景：动态禁用 case。

```go
var ch <-chan int
if enabled {
    ch = realCh
}

select {
case v := <-ch:
    fmt.Println(v)
case <-time.After(time.Second):
    fmt.Println("timeout")
}
```

### 坑 4：time.After 放在高频循环里

```go
for {
    select {
    case <-time.After(time.Second):
    }
}
```

高频循环里不断创建 timer 会增加开销。可以使用 `time.NewTimer` 或 `time.NewTicker` 并正确停止。

### 坑 5：以为 channel 一定比 mutex 好

如果只是保护一个计数器或 map，`sync.Mutex` 往往更直接、更快。Channel 更适合表达任务流、所有权转移、取消信号和 fan-in/fan-out。

## 七、工程取舍

适合 channel：

- worker pool 的任务分发。
- 多 goroutine 结果汇聚。
- 流式 pipeline。
- 取消、完成、超时信号。
- 所有权转移：值发出去后发送方不再修改。

适合 mutex：

- 保护共享缓存。
- 修改少量内存状态。
- 需要多个字段在同一个临界区内保持一致。
- 性能敏感且逻辑简单。

一句实用判断：如果你在描述“谁把什么交给谁”，channel 很合适；如果你在描述“这块状态同时只能一个人改”，mutex 更合适。

## 八、测试方式

运行普通测试：

```bash
go test ./...
```

检查数据竞争：

```bash
go test -race ./...
```

测试 channel 代码时要避免永久卡住：

```go
select {
case got := <-ch:
    if got != want {
        t.Fatalf("got %v, want %v", got, want)
    }
case <-time.After(time.Second):
    t.Fatal("timeout")
}
```

但生产代码里不要到处写固定 sleep。测试用超时是为了失败能退出，业务同步仍应靠协议设计。

## 九、结尾总结

Channel 的强大之处在于把数据传递和同步合在一起，让并发流程可以被清晰表达。它的危险也来自这里：关闭、阻塞、缓冲和取消协议一旦没设计清楚，就会出现死锁、泄漏或 panic。工程上不要迷信“channel 优于锁”，要根据问题是在传递任务还是保护状态来选择工具。
