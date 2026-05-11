# 泛型 (Generics)

> **导读**：Go 1.18 之后引入的重磅特性，终结了用 `interface{}` 满天飞的时代。

## 一、为什么需要泛型？
在没有泛型之前，如果要写一个通用的反转切片函数，你需要为 `int` 写一遍，为 `string` 写一遍；或者传入 `interface{}` 然后用极其低效且容易 Panic 的反射。泛型允许你在**强类型校验**的前提下实现代码复用。

## 二、泛型函数
泛型函数的签名中加入了类型参数（Type Parameters）。

```go
// T 是类型参数，any 是约束（意味着任何类型都可以）
func Reverse[T any](s []T) []T {
    l := len(s)
    res := make([]T, l)
    for i, v := range s {
        res[l-1-i] = v
    }
    return res
}

func main() {
    fmt.Println(Reverse([]int{1, 2, 3}))
    fmt.Println(Reverse([]string{"a", "b", "c"})) // 自动推导类型
}
```

## 三、类型约束 (Constraints)
你可以限制 `T` 必须是什么类型。标准库引入了 `golang.org/x/exp/constraints` 或者内置的 `comparable`。

```go
// comparable 表示 T 必须是可以用 == 和 != 比较的类型
func FindIndex[T comparable](arr []T, target T) int {
    for i, v := range arr {
        if v == target {
            return i
        }
    }
    return -1
}
```

## 四、自定义泛型类型
也可以用泛型定义结构体。

```go
// 定义一个泛型的栈
type Stack[T any] struct {
    items []T
}

func (s *Stack[T]) Push(item T) {
    s.items = append(s.items, item)
}

func (s *Stack[T]) Pop() T {
    // 简化实现，未处理空栈
    item := s.items[len(s.items)-1]
    s.items = s.items[:len(s.items)-1]
    return item
}
```
