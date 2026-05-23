# 自动化测试与 Mock

> **一句话导读**：Go 的测试体系不靠复杂框架，而是用 `testing`、表格驱动、接口替身和少量工具，把正确性、回归保护和性能验证放进日常开发流程。

## 一、心智模型：测试不是只测函数返回值

```text
production code
      |
      v
small interface boundary
      |
      +--> real dependency in production
      |
      +--> fake/mock dependency in tests
```

Go 测试的核心思路是：

- 普通逻辑用单元测试快速覆盖。
- 多输入场景用表格驱动测试。
- 外部依赖用接口隔离。
- 并发和性能用 `-race`、benchmark、profile 辅助观察。
- 集成测试按需用 build tag 或环境变量控制。

## 二、基础单元测试

生产代码：

```go
// calc.go
package calc

func Add(a, b int) int {
    return a + b
}
```

测试代码：

```go
// calc_test.go
package calc

import "testing"

func TestAdd(t *testing.T) {
    got := Add(1, 2)
    if got != 3 {
        t.Fatalf("Add(1, 2) = %d, want 3", got)
    }
}
```

运行方式：

```bash
go test ./...
```

`t.Errorf` 会记录错误并继续执行，`t.Fatalf` 会立刻终止当前测试。初始化失败、前置条件失败时通常用 `Fatalf`；多个 case 的差异可以用 `Errorf`。

## 三、表格驱动测试

Go 社区很偏爱表格驱动，因为它让“输入、期望、名称”集中在一起。

```go
func TestAddTable(t *testing.T) {
    tests := []struct {
        name string
        a    int
        b    int
        want int
    }{
        {name: "positive", a: 1, b: 2, want: 3},
        {name: "zero", a: 0, b: 0, want: 0},
        {name: "negative", a: -1, b: 1, want: 0},
    }

    for _, tt := range tests {
        tt := tt
        t.Run(tt.name, func(t *testing.T) {
            got := Add(tt.a, tt.b)
            if got != tt.want {
                t.Fatalf("Add(%d, %d) = %d, want %d", tt.a, tt.b, got, tt.want)
            }
        })
    }
}
```

运行单个子测试：

```bash
go test -run 'TestAddTable/positive'
```

`tt := tt` 的目的是让闭包捕获当前 case。在新版本 Go 中 range 变量语义已经改进，但这样写在跨版本项目里仍然清晰。

## 四、测试错误路径

只测 happy path 很容易漏掉真正的生产故障。下面是一个可测试的解析函数：

```go
package user

import (
    "fmt"
    "strconv"
)

func ParseAge(s string) (int, error) {
    n, err := strconv.Atoi(s)
    if err != nil {
        return 0, fmt.Errorf("parse age: %w", err)
    }
    if n < 0 {
        return 0, fmt.Errorf("age must be non-negative")
    }
    return n, nil
}
```

测试：

```go
func TestParseAge(t *testing.T) {
    tests := []struct {
        name    string
        input   string
        want    int
        wantErr bool
    }{
        {"valid", "18", 18, false},
        {"not number", "x", 0, true},
        {"negative", "-1", 0, true},
    }

    for _, tt := range tests {
        tt := tt
        t.Run(tt.name, func(t *testing.T) {
            got, err := ParseAge(tt.input)
            if (err != nil) != tt.wantErr {
                t.Fatalf("err = %v, wantErr %v", err, tt.wantErr)
            }
            if got != tt.want {
                t.Fatalf("got %d, want %d", got, tt.want)
            }
        })
    }
}
```

## 五、Mock 的核心：先设计接口边界

假设业务逻辑需要发短信。不要让函数直接依赖真实 HTTP 客户端，而是依赖一个小接口。

```go
package notify

import "context"

type Sender interface {
    Send(ctx context.Context, phone string, text string) error
}

type Service struct {
    sender Sender
}

func NewService(sender Sender) *Service {
    return &Service{sender: sender}
}

func (s *Service) SendLoginCode(ctx context.Context, phone string, code string) error {
    return s.sender.Send(ctx, phone, "login code: "+code)
}
```

测试里手写 fake：

```go
type fakeSender struct {
    phone string
    text  string
    err   error
}

func (f *fakeSender) Send(ctx context.Context, phone string, text string) error {
    f.phone = phone
    f.text = text
    return f.err
}

func TestServiceSendLoginCode(t *testing.T) {
    fake := &fakeSender{}
    svc := NewService(fake)

    err := svc.SendLoginCode(context.Background(), "13800000000", "123456")
    if err != nil {
        t.Fatal(err)
    }

    if fake.phone != "13800000000" {
        t.Fatalf("phone = %q", fake.phone)
    }
    if fake.text != "login code: 123456" {
        t.Fatalf("text = %q", fake.text)
    }
}
```

很多时候手写 fake 比引入大型 mock 框架更清晰。接口小、行为少、断言直接，是 Go 测试的舒适区。

## 六、什么时候用 gomock 或 testify/mock

手写 fake 适合简单依赖。下面情况可以考虑生成式 mock：

- 接口方法多，手写成本高。
- 需要验证调用次数、调用顺序、参数匹配。
- 团队已有统一 mock 规范。
- 依赖来自外部包，无法轻易替换实现。

以 `gomock` 为例，常见流程是：

```bash
go install go.uber.org/mock/mockgen@latest
mockgen -source=sender.go -destination=mock_sender_test.go -package=notify
go test ./...
```

但不要为了 mock 而 mock。过度验证“调用了哪个内部方法”会让测试绑死实现细节，重构时大量无意义失败。

## 七、基准测试

Benchmark 用于比较实现方案，不是证明绝对性能。

```go
func BenchmarkAdd(b *testing.B) {
    for i := 0; i < b.N; i++ {
        _ = Add(1, 2)
    }
}
```

运行：

```bash
go test -bench=. -benchmem
```

输出里的 `ns/op`、`B/op`、`allocs/op` 分别表示单次耗时、单次分配字节数、单次分配次数。优化 Go 代码时，减少不必要分配通常比微调几行 CPU 指令更有价值。

## 八、并发测试与 race detector

并发代码只跑通一次没有意义，要用 race detector：

```bash
go test -race ./...
```

示例：

```go
func TestCounterConcurrent(t *testing.T) {
    var (
        mu sync.Mutex
        n  int
        wg sync.WaitGroup
    )

    for i := 0; i < 100; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            mu.Lock()
            n++
            mu.Unlock()
        }()
    }

    wg.Wait()
    if n != 100 {
        t.Fatalf("n = %d, want 100", n)
    }
}
```

race detector 会让测试变慢，通常在 CI 的专门任务或关键包上运行。

## 九、常见坑

### 坑 1：测试依赖执行顺序

不同测试之间不要共享可变全局状态。确实需要环境变量、临时目录时，用测试框架提供的隔离能力：

```go
t.Setenv("APP_ENV", "test")
dir := t.TempDir()
```

### 坑 2：用 time.Sleep 等 goroutine

`time.Sleep` 会造成慢、不稳定、偶发失败。优先用 `WaitGroup`、channel 或 context。

```go
done := make(chan struct{})
go func() {
    defer close(done)
    work()
}()

select {
case <-done:
case <-time.After(time.Second):
    t.Fatal("timeout")
}
```

### 坑 3：Mock 太宽

如果一个接口有 12 个方法，但测试只需要其中 1 个方法，说明接口可能设计在提供方而不是使用方。Go 里更推荐“消费者定义小接口”。

### 坑 4：只看覆盖率数字

```bash
go test -cover ./...
```

覆盖率能提示哪些代码没跑到，但不能证明测试质量。一个只执行代码、不检查结果的测试也能提高覆盖率。

## 十、工程取舍

- 业务纯函数：表格驱动测试足够。
- 外部依赖：先抽小接口，再手写 fake。
- 复杂调用验证：再考虑 gomock。
- 数据库、消息队列：优先少量集成测试覆盖真实行为。
- 性能敏感逻辑：加 benchmark，但不要把 benchmark 当普通单元测试。
- 并发代码：至少加 `-race` 验证。

测试的边界应该围绕行为，而不是围绕实现细节。好的测试允许你重构内部代码，坏的测试会让你不敢改代码。

## 十一、结尾总结

Go 的自动化测试体系很朴素：`go test`、`testing.T`、表格驱动、benchmark、race detector 和小接口。Mock 的关键不在工具，而在边界设计。把依赖变小，把行为写清楚，把错误路径覆盖到，测试才会真正保护工程质量。
