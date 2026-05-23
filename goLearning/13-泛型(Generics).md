# 泛型 (Generics)

> **一句话导读**：泛型让 Go 在保持静态类型检查的同时复用代码，但它不是面向对象模板系统，适合表达“同一套算法作用于一组类型”。

## 一、心智模型：类型参数 + 约束

```text
func Max[T Ordered](a, b T) T
         |       |
         |       +--> T 必须支持哪些操作
         +----------> 调用时替换成具体类型
```

泛型由两部分组成：

- 类型参数：`T`、`K`、`V` 这类占位类型。
- 类型约束：规定类型参数能做什么操作。

没有泛型时，通用代码常见三种写法：

- 为 `int`、`string`、`float64` 各写一遍。
- 使用 `any`，再做类型断言。
- 使用反射。

泛型的价值是把复用保留在编译期类型系统里。

## 二、泛型函数

```go
package main

import "fmt"

func Reverse[T any](s []T) []T {
    out := make([]T, len(s))
    for i, v := range s {
        out[len(s)-1-i] = v
    }
    return out
}

func main() {
    fmt.Println(Reverse([]int{1, 2, 3}))
    fmt.Println(Reverse([]string{"a", "b", "c"}))
}
```

运行方式：

```bash
go run main.go
```

`T any` 表示 `T` 可以是任意类型。因为任意类型不保证支持 `+`、`<` 等操作，所以函数体里只能做所有类型都支持的事，例如赋值、传递、放进切片。

## 三、可比较约束 comparable

如果需要用 `==` 或把类型作为 map key，就需要 `comparable`。

```go
func IndexOf[T comparable](items []T, target T) int {
    for i, item := range items {
        if item == target {
            return i
        }
    }
    return -1
}
```

可测试代码：

```go
func TestIndexOf(t *testing.T) {
    got := IndexOf([]string{"a", "b"}, "b")
    if got != 1 {
        t.Fatalf("got %d, want 1", got)
    }
}
```

运行：

```bash
go test ./...
```

注意：slice、map、function 不是 comparable，不能作为 `T comparable` 的实参。

## 四、自定义类型集合约束

如果要写 `Min`、`Max` 这类函数，需要约束类型支持排序。

```go
type Ordered interface {
    ~int | ~int64 | ~float64 | ~string
}

func Min[T Ordered](a, b T) T {
    if a < b {
        return a
    }
    return b
}
```

`~int` 的意思是“底层类型是 int 的类型也可以”。

```go
type UserID int

func main() {
    var a UserID = 1
    var b UserID = 2
    fmt.Println(Min(a, b))
}
```

如果约束写成 `int` 而不是 `~int`，`UserID` 这种自定义类型就不能用。

## 五、泛型类型

```go
type Stack[T any] struct {
    items []T
}

func (s *Stack[T]) Push(v T) {
    s.items = append(s.items, v)
}

func (s *Stack[T]) Pop() (T, bool) {
    var zero T
    if len(s.items) == 0 {
        return zero, false
    }

    last := len(s.items) - 1
    v := s.items[last]
    s.items[last] = zero
    s.items = s.items[:last]
    return v, true
}
```

这里 `Pop` 返回 `(T, bool)`，而不是空栈时 panic。对通用容器来说，显式表达失败更利于调用方处理。

使用：

```go
func main() {
    var s Stack[int]
    s.Push(10)
    s.Push(20)

    v, ok := s.Pop()
    fmt.Println(v, ok)
}
```

## 六、泛型与接口的关系

接口表达行为，泛型表达类型参数化。二者不是替代关系。

适合接口：

```go
type Reader interface {
    Read(p []byte) (int, error)
}
```

只关心对象能做什么，不关心具体类型。

适合泛型：

```go
func Keys[K comparable, V any](m map[K]V) []K {
    keys := make([]K, 0, len(m))
    for k := range m {
        keys = append(keys, k)
    }
    return keys
}
```

需要保留 key、value 的静态类型。

## 七、泛型常见坑

### 坑 1：以为 any 可以做任何操作

```go
func Add[T any](a, b T) T {
    // return a + b // compile error
    return a
}
```

`any` 的意思是任何类型都可传入，因此编译器不能假设它支持加法。要加法就需要更具体的约束。

### 坑 2：把约束接口当普通接口使用

```go
type Number interface {
    ~int | ~float64
}
```

这种包含类型集合的接口主要用于约束类型参数，不能像普通接口那样随意作为变量类型使用。

### 坑 3：为了泛型牺牲可读性

下面这种抽象未必值得：

```go
func Do[T any, R any, E interface{ Error() string }](v T) (R, E) {
    var r R
    var e E
    return r, e
}
```

如果调用方需要反复看约束才能理解函数，说明泛型可能过度设计了。

### 坑 4：忽略零值

泛型代码无法知道 `T` 的具体零值语义。返回失败时常见模式是：

```go
var zero T
return zero, false
```

调用方必须检查 `ok`，不能只看 `zero`。

## 八、工程取舍

泛型适合：

- 容器：Stack、Set、Queue。
- 通用算法：Map、Filter、Reduce、Min、Max。
- 保留类型信息的辅助函数：Keys、Values、Ptr。
- 减少重复但逻辑完全一致的代码。

泛型不适合：

- 类型分支很多，每种类型行为不同。
- 只有两个调用点，重复很小。
- 为了“高级”而抽象业务逻辑。
- 需要运行期动态发现字段或 tag，此时反射更合适。

一个简单判断：如果函数体对所有类型都执行同一套逻辑，泛型通常合适；如果不同类型要走完全不同逻辑，接口、普通函数或 type switch 往往更清楚。

## 九、测试与运行方式

运行示例：

```bash
go run main.go
```

运行测试：

```bash
go test ./...
```

泛型函数建议至少覆盖两类不同实参类型。例如 `Reverse` 同时测 `[]int` 和 `[]string`，这样能防止你无意中写出只对某一类类型成立的实现。

```go
func TestReverse(t *testing.T) {
    ints := Reverse([]int{1, 2, 3})
    if !reflect.DeepEqual(ints, []int{3, 2, 1}) {
        t.Fatalf("ints = %#v", ints)
    }

    strings := Reverse([]string{"a", "b"})
    if !reflect.DeepEqual(strings, []string{"b", "a"}) {
        t.Fatalf("strings = %#v", strings)
    }
}
```

## 十、结尾总结

泛型让 Go 能在编译期保留类型信息并复用代码。写泛型时要先问两个问题：这些类型是否真的共享同一套逻辑？约束是否准确表达了函数需要的能力？如果答案清楚，泛型会让代码更少、更安全；如果答案含糊，普通函数和接口往往更容易维护。
