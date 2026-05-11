# 结构体(Struct)与方法

> **导读**：Go 没有 Class，没有继承。一切面向对象特性的载体都是 Struct（结合 Interface）。

## 一、定义与初始化
```go
type User struct {
    Name string
    Age  int
}

// 初始化
u1 := User{Name: "Alice", Age: 18}
u2 := new(User) // 返回指针 *User
u3 := &User{Name: "Bob"} // 常用，返回指针
```

## 二、给结构体定义方法
Go 中的方法就是带有**接收者（Receiver）**的普通函数。
```go
// 值接收者：无法修改原结构体（拷贝了整个结构体）
func (u User) GetName() string {
    return u.Name
}

// 指针接收者：可以修改原结构体内部属性（推荐默认使用）
func (u *User) Birthday() {
    u.Age++
}
```
**建议：** 除非结构体极小（如 `Point{X, Y}`），否则绝大多数时候都应该使用**指针接收者**来避免值拷贝和保证状态可变。

## 三、组合（替代继承）
Go 通过结构体嵌套实现“组合优于继承”的理念。
```go
type Animal struct {
    Name string
}
func (a *Animal) Move() { fmt.Println("Moving...") }

type Dog struct {
    Animal // 匿名嵌套结构体
    Breed  string
}

func main() {
    d := Dog{Animal: Animal{Name: "旺财"}, Breed: "柯基"}
    d.Move() // 直接调用嵌入类型的方法
    fmt.Println(d.Name) // 直接访问属性
}
```
