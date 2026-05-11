# sync 包：Mutex, WaitGroup 与 Map

> **导读**：虽然 Go 推荐用 Channel 通信，但在处理单纯的缓存状态修改时，传统的锁依然是性能最高、最直接的选择。

## 一、互斥锁与读写锁
保护共享状态（如 map、计数器）不被并发破坏。

1. **`sync.Mutex` 互斥锁**：不管读写，一律独占。
```go
var mu sync.Mutex
var count int

func add() {
    mu.Lock()
    count++
    mu.Unlock() // 强烈建议写成 defer mu.Unlock() 防止忘解锁导致死锁
}
```

2. **`sync.RWMutex` 读写锁**：读多写少的场景必备。多个 goroutine 可以同时获取读锁，但写锁是独占的。
```go
var rw sync.RWMutex
// 读操作使用 rw.RLock() 和 rw.RUnlock()
// 写操作使用 rw.Lock() 和 rw.Unlock()
```

## 二、`sync.WaitGroup`
用于等待一组 Goroutine 执行完毕。主协程等待子协程的标准做法，比 `time.Sleep` 靠谱一百倍。

```go
var wg sync.WaitGroup

for i := 0; i < 5; i++ {
    wg.Add(1) // 声明要等 1 个任务
    go func(id int) {
        defer wg.Done() // 任务完成，减 1
        fmt.Println("Worker", id, "done")
    }(i)
}

wg.Wait() // 阻塞直到计数器归零
fmt.Println("All workers completed.")
```
*注意：`wg.Add()` 必须在 `go func()` 之前调用！*

## 三、`sync.Map`
Go 自带的 `map` 不是并发安全的。Go 提供了一个开箱即用的并发安全字典。
内部机制很复杂（分离了只读图和脏数据图），**非常适合读多写少且 key 稳定的场景**。

```go
var sm sync.Map
sm.Store("name", "Gopher")
val, ok := sm.Load("name")
sm.Delete("name")
```

此外还有 `sync.Once`（保证函数在全生命周期内只被执行一次，常用于单例模式初始化全局配置）。
