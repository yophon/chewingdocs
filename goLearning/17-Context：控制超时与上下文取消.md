# Context：控制超时与上下文取消

> **导读**：如果你去看开源的 Go 库或源码，所有的函数第一个参数几乎都是 `ctx context.Context`。它是 Go 微服务链路追踪、超时控制的核心动脉。

## 一、为什么需要 Context？
假设你的网关收到一个请求，它开启了一个 Goroutine 去请求 DB，请求 DB 的过程又开了协程去调用外部 RPC。如果客户端因为不耐烦断开了连接（请求取消），后台这一大串正在死等 DB 的 Goroutine 怎么全部停掉？不控制的话就会发生**Goroutine 泄漏**，导致内存耗尽。

Context 的树形结构完美解决了这个问题。

## 二、Context 的四大武器

```go
// 1. 根节点（万物起源）
ctx := context.Background()

// 2. 带超时取消的 Context
// 如果 2 秒内没执行完，会自动发取消信号
ctxTimeout, cancel := context.WithTimeout(ctx, 2*time.Second)
defer cancel() // 无论是否超时，退出时都释放资源

// 3. 带取消信号的 Context (手动取消)
ctxCancel, cancelManual := context.WithCancel(ctx)
// 主动调用 cancelManual() 会通知所有子孙协程

// 4. 携带链路数据的 Context (常用于传递 TraceID / UserID)
ctxValue := context.WithValue(ctx, "trace_id", "xyz123")
```

## 三、如何在协程中监听取消信号？
结合 `select` 和 `ctx.Done()` 管道。

```go
func worker(ctx context.Context) {
    for {
        select {
        case <-ctx.Done(): // 一旦父级调用 cancel 或者 timeout，这里就会接收到信号
            fmt.Println("收到停止指令，或者超时了，立马跑路:", ctx.Err())
            return
        default:
            fmt.Println("认真干活...")
            time.Sleep(500 * time.Millisecond)
        }
    }
}

func main() {
    ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
    defer cancel()
    go worker(ctx)
    time.Sleep(3 * time.Second) // 观察 2 秒后 worker 是否会自动退出
}
```
