# 自动化测试与 Mock

> **导读**：Go 语言原生自带测试框架 `testing`，不再需要额外引入第三方测试库。

## 一、单元测试
文件名以 `_test.go` 结尾，函数名以 `Test` 开头。

```go
// math.go
func Add(a, b int) int { return a + b }

// math_test.go
import "testing"

func TestAdd(t *testing.T) {
    res := Add(1, 2)
    if res != 3 {
        t.Errorf("Expected 3, got %d", res) // 报错但继续执行
        // t.Fatalf 会立即中断测试
    }
}
```

## 二、表格驱动测试 (Table-Driven Tests)
Go 社区最推荐的测试写法：把测试数据用数组/切片列出来，然后用 for 循环跑。

```go
func TestAddTable(t *testing.T) {
    tests := []struct {
        a, b, expected int
    }{
        {1, 1, 2},
        {0, 0, 0},
        {-1, 1, 0},
    }

    for _, tt := range tests {
        if got := Add(tt.a, tt.b); got != tt.expected {
            t.Errorf("Add(%d, %d) = %d; expected %d", tt.a, tt.b, got, tt.expected)
        }
    }
}
```

## 三、基准测试 (Benchmark)
用于测试性能，函数名以 `Benchmark` 开头。执行：`go test -bench=.`

```go
func BenchmarkAdd(b *testing.B) {
    for i := 0; i < b.N; i++ { // b.N 会被测试框架自动调整，直到运行时间足够得出稳定的统计数据
        Add(1, 2)
    }
}
```

## 四、Mock
由于 Go 是强类型语言，Mock 通常通过**接口(Interface)**来实现。利用第三方库 `gomock` 或 `testify/mock`，可以非常方便地为接口生成打桩代码，实现解耦测试（比如拦截对数据库或外部 API 的调用）。
