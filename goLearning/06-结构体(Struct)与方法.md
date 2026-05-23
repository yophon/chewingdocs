# 结构体(Struct)与方法

> **导读**: Go 没有 class,但并不缺少组织业务模型的能力;struct 负责数据形状,method 负责行为边界。

从 Java、C#、Python 转到 Go 的人,经常会问:"Go 没有类,那怎么写面向对象?"答案是:Go 不追求传统 OOP 的继承体系,它用 struct 表达数据,用方法绑定行为,用接口表达能力,用组合替代继承。

这一篇讲 struct 的定义、初始化、字段可见性、方法、值接收者与指针接收者、嵌入组合、标签 tag、零值设计,以及工程里如何判断一个类型应该暴露什么。

---

## 一、核心心智模型:数据是数据,行为是行为,组合优先

Go 的类型系统有一个很清晰的倾向:

> **用 struct 表达状态,用 method 表达这个状态能做什么,用 interface 表达调用方需要什么能力。**

它刻意没有:

- class
- extends
- protected
- abstract class
- constructor 关键字
- method override

取而代之的是:

- struct 字段组合
- 方法接收者
- 隐式接口实现
- 包级构造函数
- 首字母大小写控制可见性

这让 Go 的对象模型更平,更接近数据建模,也更容易在代码审查里看懂。

---

## 二、定义结构体

基本定义:

```go
package main

import "fmt"

type User struct {
    ID   int64
    Name string
    Age  int
}

func main() {
    u := User{
        ID:   1,
        Name: "alice",
        Age:  18,
    }

    fmt.Println(u)
}
```

字段名大写表示包外可访问,小写只在包内可访问:

```go
type User struct {
    ID       int64
    Name     string
    password string
}
```

这不是编码风格,而是语言级可见性规则。对外 API 类型要认真设计哪些字段导出。

---

## 三、初始化方式

### 3.1 字段名初始化,最推荐

```go
u := User{
    ID:   1,
    Name: "alice",
}
```

没写的字段使用零值。

### 3.2 按字段顺序初始化,不推荐用于业务代码

```go
u := User{1, "alice", 18}
```

这种写法对字段顺序敏感。结构体加字段或调整顺序时很容易出错,只适合很小的内部类型。

### 3.3 new 和取地址

```go
p1 := new(User)              // *User,字段都是零值
p2 := &User{Name: "alice"}   // *User,更常用
```

`new(User)` 不会调用构造函数,Go 没有构造函数关键字。它只是分配零值并返回指针。

---

## 四、构造函数:普通函数而已

Go 通常用 `NewType` 风格的普通函数表达构造逻辑:

```go
package main

import (
    "errors"
    "fmt"
    "strings"
)

type User struct {
    ID   int64
    Name string
}

func NewUser(id int64, name string) (User, error) {
    name = strings.TrimSpace(name)
    if id <= 0 {
        return User{}, errors.New("id must be positive")
    }
    if name == "" {
        return User{}, errors.New("name is empty")
    }

    return User{ID: id, Name: name}, nil
}

func main() {
    u, err := NewUser(1, " alice ")
    if err != nil {
        fmt.Println(err)
        return
    }

    fmt.Printf("%+v\n", u)
}
```

构造函数适合放:

- 参数校验
- 默认值
- 不变量维护
- 私有字段初始化
- 返回接口或具体类型的选择

如果 struct 零值已经可用,不一定需要构造函数。

---

## 五、方法:带接收者的函数

方法定义:

```go
type User struct {
    Name string
}

func (u User) DisplayName() string {
    return u.Name
}
```

接收者 `(u User)` 放在 `func` 和方法名之间。它让方法绑定到某个类型上。

完整例子:

```go
package main

import "fmt"

type Counter struct {
    n int
}

func (c Counter) Value() int {
    return c.n
}

func (c *Counter) Inc() {
    c.n++
}

func main() {
    var c Counter
    c.Inc()
    c.Inc()
    fmt.Println(c.Value())
}
```

Go 会在很多场景自动取地址或解引用,所以上面可以直接写 `c.Inc()`。

---

## 六、值接收者 vs 指针接收者

这是 struct 方法里最重要的判断。

值接收者会复制一份接收者:

```go
func (u User) Rename(name string) {
    u.Name = name // 改的是副本
}
```

指针接收者可以修改原对象:

```go
func (u *User) Rename(name string) {
    u.Name = name
}
```

可运行例子:

```go
package main

import "fmt"

type User struct {
    Name string
}

func (u User) RenameByValue(name string) {
    u.Name = name
}

func (u *User) RenameByPointer(name string) {
    u.Name = name
}

func main() {
    u := User{Name: "alice"}

    u.RenameByValue("bob")
    fmt.Println(u.Name) // alice

    u.RenameByPointer("bob")
    fmt.Println(u.Name) // bob
}
```

工程建议:

- 需要修改接收者:用指针接收者
- 结构体较大:用指针接收者,避免复制
- 包含锁、buffer、连接等不可复制字段:必须用指针接收者
- 小而不可变的值对象:可以用值接收者
- 同一个类型的方法尽量统一接收者风格,避免混乱

典型值接收者:

```go
type Point struct {
    X, Y int
}

func (p Point) String() string {
    return fmt.Sprintf("(%d,%d)", p.X, p.Y)
}
```

典型指针接收者:

```go
type Account struct {
    balance int64
}

func (a *Account) Deposit(amount int64) {
    a.balance += amount
}
```

---

## 七、组合:替代继承的主要手段

Go 通过嵌入字段实现组合:

```go
package main

import "fmt"

type Logger struct{}

func (Logger) Info(msg string) {
    fmt.Println("[INFO]", msg)
}

type Service struct {
    Logger
    Name string
}

func main() {
    s := Service{Name: "order"}
    s.Info("started")
}
```

`Service` 嵌入了 `Logger`,所以可以直接调用 `s.Info`。这不是继承,更准确地说是字段和方法提升。

如果字段同名或方法冲突,需要显式选择:

```go
type A struct{}
func (A) Name() string { return "A" }

type B struct{}
func (B) Name() string { return "B" }

type C struct {
    A
    B
}

// c.Name() 会产生歧义
// c.A.Name() 或 c.B.Name()
```

组合的工程价值是:你可以复用能力,但不建立脆弱的父子类层级。

---

## 八、匿名结构体

匿名结构体适合临时数据形状:

```go
package main

import "fmt"

func main() {
    resp := struct {
        Code int
        Msg  string
    }{
        Code: 200,
        Msg:  "ok",
    }

    fmt.Println(resp)
}
```

常见场景:

- 测试用例表
- 临时 JSON 响应
- 小范围聚合结果

例如表驱动测试:

```go
tests := []struct {
    name string
    a    int
    b    int
    want int
}{
    {name: "positive", a: 1, b: 2, want: 3},
}
```

如果这个结构会跨函数、跨包传递,就应该定义命名类型。

---

## 九、结构体标签 tag

struct tag 是字段上的元数据,常用于 JSON、数据库、校验:

```go
package main

import (
    "encoding/json"
    "fmt"
)

type User struct {
    ID   int64  `json:"id"`
    Name string `json:"name"`
    Age  int    `json:"age,omitempty"`
}

func main() {
    u := User{ID: 1, Name: "alice"}
    data, _ := json.Marshal(u)
    fmt.Println(string(data))
}
```

输出:

```json
{"id":1,"name":"alice"}
```

`omitempty` 表示字段为零值时省略。

注意:

- tag 本身只是字符串,具体含义由库解释
- tag 写错通常编译器不报错
- 字段必须导出,`encoding/json` 才能访问

```go
type User struct {
    name string `json:"name"` // 不会被 encoding/json 正常导出
}
```

---

## 十、可运行综合例子:订单实体

```go
package main

import (
    "encoding/json"
    "errors"
    "fmt"
)

type OrderStatus string

const (
    OrderPending OrderStatus = "pending"
    OrderPaid    OrderStatus = "paid"
)

type Order struct {
    ID     string      `json:"id"`
    Amount int64       `json:"amount"`
    Status OrderStatus `json:"status"`
}

func NewOrder(id string, amount int64) (Order, error) {
    if id == "" {
        return Order{}, errors.New("id is empty")
    }
    if amount <= 0 {
        return Order{}, errors.New("amount must be positive")
    }

    return Order{
        ID:     id,
        Amount: amount,
        Status: OrderPending,
    }, nil
}

func (o Order) IsPaid() bool {
    return o.Status == OrderPaid
}

func (o *Order) Pay() error {
    if o.Status == OrderPaid {
        return errors.New("order already paid")
    }
    o.Status = OrderPaid
    return nil
}

func main() {
    order, err := NewOrder("order-1", 100)
    if err != nil {
        fmt.Println(err)
        return
    }

    if err := order.Pay(); err != nil {
        fmt.Println(err)
        return
    }

    data, _ := json.Marshal(order)
    fmt.Println(string(data))
    fmt.Println("paid:", order.IsPaid())
}
```

这个例子体现了几个工程习惯:

- 构造函数维护不变量
- 值方法表达查询
- 指针方法表达状态变更
- tag 控制对外 JSON 形状
- 业务状态用专门类型,不是裸 string 到处飞

---

## 十一、常见坑

### 11.1 值接收者修改无效

```go
func (u User) SetName(name string) {
    u.Name = name
}
```

调用后原对象不变。需要改成 `func (u *User)`。

### 11.2 复制包含锁的结构体

```go
type Cache struct {
    mu sync.Mutex
    m  map[string]string
}
```

这种类型不能随便复制,方法必须使用指针接收者。复制锁可能导致非常隐蔽的并发问题。

### 11.3 tag 字段没导出

小写字段即使写了 JSON tag,标准库也不会导出。

### 11.4 嵌入不是继承

嵌入字段的方法被提升,但没有传统继承里的 override、多态父类等语义。多态交给 interface。

### 11.5 返回内部 slice 或 map

```go
func (u *User) Roles() []string {
    return u.roles
}
```

调用方可以修改内部状态。需要保护时返回副本。

---

## 十二、工程判断

设计 struct 时可以按这几个问题判断:

- 这个类型的零值能不能安全使用?
- 哪些字段应该导出,哪些应该隐藏?
- 是否需要构造函数维护不变量?
- 方法是否会修改状态?如果会,用指针接收者。
- 类型是否包含锁、连接、buffer、map、slice 等共享资源?
- 是否需要对外 JSON/DB 结构与内部结构分离?
- 组合是否真的复用了能力,还是让类型职责变模糊?

不要把 struct 变成贫血字段袋,也不要把所有行为都塞进一个巨大类型。Go 更鼓励小类型、小方法、小接口组合。

---

## 十三、小结

struct 和 method 是 Go 组织业务代码的核心。

你需要记住:

1. struct 表达数据形状,method 表达行为。
2. 大写字段导出,小写字段包内可见。
3. 构造函数只是普通函数,通常叫 `NewType`。
4. 值接收者复制对象,指针接收者可以修改对象。
5. 包含锁或大对象时优先指针接收者。
6. 嵌入是组合,不是传统继承。
7. struct tag 是元数据,由具体库解释。

下一篇讲接口。struct 负责"我是什么",接口负责"我能做什么"。
