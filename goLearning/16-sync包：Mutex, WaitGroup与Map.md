# sync 包：Mutex, WaitGroup 与 Map

> **一句话导读**：`sync` 包提供的是共享内存并发的基础工具，锁负责保护状态，WaitGroup 负责等待任务，sync.Map 负责特定读多写少场景的并发字典。

## 一、心智模型：先定义共享状态，再定义同步边界

```text
shared state
    |
    v
+------------------+
| critical section |
+------------------+
    ^
    |
 Mutex / RWMutex
```

使用 `sync` 包时最重要的问题不是“用哪个类型”，而是：

- 哪些数据会被多个 goroutine 同时访问？
- 哪些操作必须作为一个整体完成？
- 谁负责启动任务，谁负责等待任务结束？
- 是否需要读写分离？
- 是否真的适合 `sync.Map`？

## 二、Mutex：保护临界区

```go
package main

import (
    "fmt"
    "sync"
)

type Counter struct {
    mu sync.Mutex
    n  int
}

func (c *Counter) Add(delta int) {
    c.mu.Lock()
    defer c.mu.Unlock()
    c.n += delta
}

func (c *Counter) Value() int {
    c.mu.Lock()
    defer c.mu.Unlock()
    return c.n
}

func main() {
    var c Counter
    var wg sync.WaitGroup

    for i := 0; i < 100; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            c.Add(1)
        }()
    }

    wg.Wait()
    fmt.Println(c.Value())
}
```

运行方式：

```bash
go run main.go
go test -race ./...
```

`defer Unlock` 在普通业务代码里更稳妥，能避免中途 return 后忘记解锁。极端性能热点中可以手动 unlock，但要非常克制。

## 三、RWMutex：读多写少才值得

```go
type Store struct {
    mu   sync.RWMutex
    data map[string]string
}

func NewStore() *Store {
    return &Store{data: make(map[string]string)}
}

func (s *Store) Get(key string) (string, bool) {
    s.mu.RLock()
    defer s.mu.RUnlock()
    v, ok := s.data[key]
    return v, ok
}

func (s *Store) Set(key, value string) {
    s.mu.Lock()
    defer s.mu.Unlock()
    s.data[key] = value
}
```

`RWMutex` 允许多个读者并发进入，但写者仍然独占。它不总是比 `Mutex` 快：

- 读临界区很短时，RWMutex 的额外开销可能不划算。
- 写操作频繁时，读写锁会退化成复杂的互斥。
- 读操作里如果还要调用慢函数，可能拖慢写者。

先用 `Mutex` 写对，再用 benchmark 判断是否需要 `RWMutex`。

## 四、WaitGroup：等待一组任务完成

```go
var wg sync.WaitGroup

for i := 0; i < 5; i++ {
    wg.Add(1)
    go func(id int) {
        defer wg.Done()
        fmt.Println("worker", id)
    }(i)
}

wg.Wait()
```

关键规则：

- `Add` 要在启动 goroutine 前调用。
- 每个 `Add(1)` 必须对应一次 `Done()`。
- 不要复制使用中的 `WaitGroup`。
- `Wait` 只负责等待，不负责取消任务。

带错误返回时，标准库 `WaitGroup` 不会帮你收集错误。可以用 channel，也可以用 `errgroup`。

```go
errCh := make(chan error, 1)

wg.Add(1)
go func() {
    defer wg.Done()
    if err := work(); err != nil {
        select {
        case errCh <- err:
        default:
        }
    }
}()

wg.Wait()
close(errCh)
if err := <-errCh; err != nil {
    return err
}
```

## 五、sync.Map：不是普通 map 的无脑替代

基本使用：

```go
var m sync.Map

m.Store("name", "gopher")
v, ok := m.Load("name")
m.Delete("name")

actual, loaded := m.LoadOrStore("name", "new")
fmt.Println(v, ok, actual, loaded)
```

遍历：

```go
m.Range(func(key, value any) bool {
    fmt.Println(key, value)
    return true
})
```

`Range` 不保证得到某一时刻的一致快照。遍历过程中并发写入、删除的可见性不要作为业务依赖。

### sync.Map 的适合场景

官方设计更偏向两类：

- 写一次读很多次，例如只增长的缓存。
- 多 goroutine 访问不相交的 key，减少锁竞争。

如果你有频繁更新、需要维护多个字段一致性、需要类型安全，普通 `map + Mutex/RWMutex` 往往更好。

## 六、常见坑

### 坑 1：复制锁

```go
type Cache struct {
    mu sync.Mutex
    m  map[string]string
}

func bad(c Cache) {
    c.mu.Lock()
    defer c.mu.Unlock()
}
```

锁一旦使用就不应该被复制。包含锁的结构体通常用指针接收者，传参也传指针。

```go
func good(c *Cache) {
    c.mu.Lock()
    defer c.mu.Unlock()
}
```

可以用 `go vet` 检查很多复制锁问题：

```bash
go vet ./...
```

### 坑 2：忘记 Unlock

```go
mu.Lock()
if bad {
    return // deadlock
}
mu.Unlock()
```

优先写：

```go
mu.Lock()
defer mu.Unlock()
```

### 坑 3：锁粒度过大

```go
mu.Lock()
resp, err := http.Get(url)
mu.Unlock()
```

不要在持锁期间做网络 IO、磁盘 IO、长时间计算或调用不可控回调。持锁时间越短，系统越容易保持吞吐。

### 坑 4：WaitGroup Add 放进 goroutine

```go
go func() {
    wg.Add(1) // 错误：主 goroutine 可能已经 Wait
    defer wg.Done()
}()
wg.Wait()
```

正确：

```go
wg.Add(1)
go func() {
    defer wg.Done()
}()
wg.Wait()
```

### 坑 5：sync.Map 失去类型约束

`sync.Map` 的 key/value 都是 `any`，读取后通常要断言：

```go
v, ok := m.Load("count")
if !ok {
    return
}
n, ok := v.(int)
if !ok {
    return
}
```

如果类型安全很重要，可以封装一层泛型 wrapper，或者直接用普通 map 加锁。

## 七、工程取舍

### Mutex vs Channel

- 保护共享状态：优先 `Mutex`。
- 传递任务、结果、信号：优先 channel。
- 两者可以组合，但不要为了“更 Go”把简单状态更新硬改成 channel 协议。

### Mutex vs RWMutex

- 默认用 `Mutex`。
- 读多写少、读临界区不短、benchmark 证明有效，再用 `RWMutex`。

### map + lock vs sync.Map

- 需要类型安全、一致性操作、复杂更新：`map + lock`。
- 读多写少、key 稳定、缓存类访问：`sync.Map`。

### WaitGroup vs errgroup

- 只等待完成：`sync.WaitGroup`。
- 等待完成并处理错误、支持 context 取消：`golang.org/x/sync/errgroup`。

## 八、测试方式

普通测试：

```bash
go test ./...
```

竞态检查：

```bash
go test -race ./...
```

静态检查：

```bash
go vet ./...
```

基准测试锁选择：

```go
func BenchmarkStoreGet(b *testing.B) {
    s := NewStore()
    s.Set("x", "y")

    b.RunParallel(func(pb *testing.PB) {
        for pb.Next() {
            _, _ = s.Get("x")
        }
    })
}
```

运行：

```bash
go test -bench=. -benchmem
```

不要凭直觉判断 `Mutex`、`RWMutex`、`sync.Map` 的性能，争议场景用 benchmark。

## 九、结尾总结

`sync` 包处理的是共享内存并发：`Mutex` 和 `RWMutex` 保护临界区，`WaitGroup` 等待任务结束，`sync.Map` 服务于特定并发字典场景。稳定的并发代码不是把锁藏起来，而是清楚标出共享状态、临界区、生命周期和错误处理边界。先写正确，再用 race detector、vet 和 benchmark 验证。
