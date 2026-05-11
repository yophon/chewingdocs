# 接口(Interface)与鸭子类型

> **导读**：Go 语言多态的灵魂。鸭子类型：如果它走起来像鸭子，叫起来像鸭子，那它就是鸭子。

## 一、隐式实现
在 Go 中，结构体不需要显式声明实现了哪个接口（没有 `implements` 关键字）。只要结构体实现了接口定义的所有方法，它就自动实现了该接口。

```go
type Speaker interface {
    Speak() string
}

type Dog struct{}
// Dog 自动实现了 Speaker 接口
func (d Dog) Speak() string {
    return "Woof!"
}

type Cat struct{}
func (c Cat) Speak() string {
    return "Meow!"
}

func animalSound(s Speaker) {
    fmt.Println(s.Speak())
}
```

## 二、空接口 `interface{}`
没有任何方法的接口。既然只要实现 0 个方法就能实现它，那意味着**所有类型都实现了空接口**。它相当于 Java 的 `Object`。Go 1.18 之后引入了别名 `any`。

```go
func printAnything(v interface{}) {
    fmt.Println(v)
}
// 等价于
func printAny(v any) {
    fmt.Println(v)
}
```

## 三、接口的最佳实践
1. **接口应该很小**：Go 标准库中到处都是只有一个方法的接口（如 `io.Reader`, `io.Writer`）。接口越大，实现的成本越高，复用性越差。
2. **返回值返回结构体，参数接收接口**：这是 Go 开发中的一句名言（Accept interfaces, return structs）。这样能让调用方获得最大的灵活性，而你又能提供具体的实现细节。
