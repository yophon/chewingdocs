# 接口(Interface)与鸭子类型

> **导读**: Go 的接口不是类继承体系的附属品,而是调用方描述"我需要什么能力"的最小契约。

Go 接口最容易被误解。很多人会按 Java 的习惯先定义一堆 `IUserService`、`IRepository`,再让结构体显式 implements。这样写 Go 通常会显得笨重。Go 的接口是隐式实现的,一个类型只要拥有接口要求的方法,就自动满足这个接口。

这一篇讲接口的心智模型、隐式实现、小接口、空接口、类型断言、type switch、nil interface 坑,以及真实项目里接口应该放在哪一侧。

---

## 一、核心心智模型:接口定义在使用方

Go 接口最重要的一句话:

> **不要问一个类型实现了什么接口,要问调用方需要什么能力。**

例如一个函数只需要读取字节:

```go
func ReadAll(r io.Reader) ([]byte, error)
```

它不关心传进来的是文件、网络连接、内存 buffer,还是 gzip reader。只要有 `Read(p []byte) (n int, err error)` 方法,就能用。

这就是 Go 的鸭子类型:

> 如果它能 Read,在这个调用点它就是 Reader。

接口的工程价值不是"抽象一切",而是降低调用方和具体实现的耦合。

---

## 二、接口定义与隐式实现

基本例子:

```go
package main

import "fmt"

type Speaker interface {
    Speak() string
}

type Dog struct{}

func (Dog) Speak() string {
    return "woof"
}

type Cat struct{}

func (Cat) Speak() string {
    return "meow"
}

func Say(s Speaker) {
    fmt.Println(s.Speak())
}

func main() {
    Say(Dog{})
    Say(Cat{})
}
```

`Dog` 和 `Cat` 没有写 `implements Speaker`,但它们都实现了 `Speak() string`,所以都满足 `Speaker`。

隐式实现的好处:

- 具体类型不需要知道所有使用方接口
- 接口可以由调用方按需定义
- 第三方类型也可以自然适配已有接口
- 小接口组合非常灵活

坏处也有:

- 大型项目里不容易一眼看出某类型实现了哪些接口
- 方法签名变更可能在远处触发编译错误

所以 Go 接口要小,越小越容易推理。

---

## 三、小接口:Go 标准库的核心风格

Go 标准库最经典的接口:

```go
type Reader interface {
    Read(p []byte) (n int, err error)
}

type Writer interface {
    Write(p []byte) (n int, err error)
}
```

一个方法就足够强大。

可运行例子:

```go
package main

import (
    "fmt"
    "io"
    "strings"
)

func CountBytes(r io.Reader) (int, error) {
    buf := make([]byte, 8)
    total := 0

    for {
        n, err := r.Read(buf)
        total += n

        if err == io.EOF {
            return total, nil
        }
        if err != nil {
            return 0, err
        }
    }
}

func main() {
    n, err := CountBytes(strings.NewReader("hello go"))
    if err != nil {
        fmt.Println(err)
        return
    }

    fmt.Println(n)
}
```

`CountBytes` 不知道 `strings.Reader` 的具体类型,只依赖 `io.Reader` 能力。

---

## 四、接口组合

小接口可以组合成大接口:

```go
type ReadWriter interface {
    Reader
    Writer
}
```

自定义例子:

```go
type Loader interface {
    Load(id string) (string, error)
}

type Saver interface {
    Save(id string, value string) error
}

type Store interface {
    Loader
    Saver
}
```

工程建议:

- 参数尽量接收小接口
- 只有确实需要多个能力时再组合
- 不要一开始就定义大而全接口

大接口的问题是实现成本高,测试替身也难写。

---

## 五、接口值内部是什么

接口值可以理解为两部分:

```text
(动态类型, 动态值)
```

例如:

```go
var s Speaker = Dog{}
```

接口值里装的是:

```text
(Dog, Dog{})
```

这解释了 Go 里非常经典的 nil interface 坑。

```go
package main

import "fmt"

type MyError struct{}

func (*MyError) Error() string {
    return "my error"
}

func returnsError() error {
    var err *MyError = nil
    return err
}

func main() {
    err := returnsError()
    fmt.Println(err == nil) // false
}
```

为什么不是 nil?因为返回的接口值是:

```text
(*MyError, nil)
```

动态类型不为空,所以接口整体不等于 nil。

正确做法:

```go
func returnsError(ok bool) error {
    if ok {
        return nil
    }
    return &MyError{}
}
```

不要把带类型的 nil 指针塞进接口返回。

---

## 六、空接口 any

空接口没有任何方法:

```go
interface{}
```

所有类型都实现了 0 个方法,所以所有类型都满足空接口。Go 1.18 后 `any` 是 `interface{}` 的别名:

```go
func Print(v any) {
    fmt.Println(v)
}
```

空接口适合:

- 日志字段值
- JSON 任意结构
- 泛型出现前的通用容器
- 和反射配合

但业务代码里不要滥用 `any`。一旦用了 `any`,编译器就很难帮你检查类型,调用方也不知道应该传什么。

优先级通常是:

```text
具体类型 > 小接口 > 泛型 > any
```

---

## 七、类型断言与 type switch

接口值可以通过类型断言取回具体类型:

```go
package main

import "fmt"

func main() {
    var v any = "hello"

    s, ok := v.(string)
    if ok {
        fmt.Println(s)
    }
}
```

不要写不带 `ok` 的断言,除非你确定类型一定正确:

```go
// s := v.(string) // 类型不对会 panic
```

多个类型分支用 type switch:

```go
package main

import "fmt"

func Format(v any) string {
    switch x := v.(type) {
    case string:
        return "string:" + x
    case int:
        return fmt.Sprintf("int:%d", x)
    case nil:
        return "<nil>"
    default:
        return fmt.Sprintf("unknown:%T", x)
    }
}

func main() {
    fmt.Println(Format("go"))
    fmt.Println(Format(42))
    fmt.Println(Format(true))
}
```

类型断言是从抽象回到具体。频繁断言通常说明接口设计可能不合适。

---

## 八、接口应该放在哪里

Go 社区常见建议:

> **Accept interfaces, return structs.**

意思是:

- 函数参数接收接口,给调用方灵活性
- 函数返回具体类型,给调用方完整能力

例如:

```go
func Copy(dst io.Writer, src io.Reader) (int64, error)
```

它接收接口,因为它只需要读写能力。

但构造函数通常返回具体类型:

```go
func NewMemoryStore() *MemoryStore
```

不要过早写:

```go
func NewMemoryStore() Store
```

除非你有明确理由隐藏实现,否则返回接口会让调用方失去具体方法,也让 nil 问题更复杂。

接口通常定义在使用方包里,而不是实现方包里。比如业务服务需要一个用户查询能力:

```go
type UserLoader interface {
    LoadUser(id int64) (User, error)
}

func NewService(loader UserLoader) *Service {
    return &Service{loader: loader}
}
```

这样任何具体存储只要有 `LoadUser` 方法,就能传进来。

---

## 九、可运行综合例子:用接口隔离存储实现

```go
package main

import (
    "errors"
    "fmt"
)

type User struct {
    ID   int64
    Name string
}

type UserLoader interface {
    LoadUser(id int64) (User, error)
}

type MemoryUserStore struct {
    users map[int64]User
}

func NewMemoryUserStore() *MemoryUserStore {
    return &MemoryUserStore{
        users: map[int64]User{
            1: {ID: 1, Name: "alice"},
        },
    }
}

func (s *MemoryUserStore) LoadUser(id int64) (User, error) {
    user, ok := s.users[id]
    if !ok {
        return User{}, errors.New("user not found")
    }
    return user, nil
}

type UserService struct {
    loader UserLoader
}

func NewUserService(loader UserLoader) *UserService {
    return &UserService{loader: loader}
}

func (s *UserService) DisplayName(id int64) (string, error) {
    user, err := s.loader.LoadUser(id)
    if err != nil {
        return "", err
    }
    return "@" + user.Name, nil
}

func main() {
    store := NewMemoryUserStore()
    service := NewUserService(store)

    name, err := service.DisplayName(1)
    if err != nil {
        fmt.Println(err)
        return
    }

    fmt.Println(name)
}
```

这个例子里:

- `UserService` 只依赖 `UserLoader`
- `MemoryUserStore` 不知道自己实现了哪个接口
- 测试时可以轻松传一个 fake loader
- 构造函数返回具体类型 `*MemoryUserStore`

---

## 十、常见坑

### 10.1 过早定义接口

只有一个实现,也没有测试替身需求时,先别急着抽接口。Go 的接口可以后补,不需要像 Java 那样先铺体系。

### 10.2 接口太大

```go
type UserRepository interface {
    Create(...)
    Update(...)
    Delete(...)
    Find(...)
    List(...)
    Count(...)
}
```

如果调用方只需要 `Find`,就定义小接口:

```go
type UserFinder interface {
    Find(id int64) (User, error)
}
```

### 10.3 返回接口导致 nil 判断混乱

返回具体类型通常更简单。接口作为返回值要特别注意 typed nil。

### 10.4 接口命名机械加 I

Go 不流行 `IUserService`。常见命名是按能力:

- `Reader`
- `Writer`
- `Closer`
- `UserLoader`
- `OrderStore`

### 10.5 用 any 逃避类型设计

`map[string]any` 很方便,但会把类型错误推迟到运行时。业务核心数据尽量定义 struct。

---

## 十一、工程判断

什么时候该定义接口?

- 你需要替换实现,例如内存、MySQL、Redis
- 你需要在测试里注入 fake
- 调用方只需要具体类型的一小部分能力
- 你在设计跨包边界
- 你希望屏蔽外部依赖的复杂 API

什么时候不该定义接口?

- 只有一个实现且短期不会变
- 接口只是完整复制某个 struct 的所有方法
- 为了"看起来高级"而抽象
- 返回值没必要隐藏具体类型

接口越小,越有生命力。大接口往往意味着边界没想清楚。

---

## 十二、小结

Go 接口的重点不是继承,而是能力。

你需要记住:

1. 类型不需要显式声明 implements,方法集匹配就自动实现。
2. 接口应该小,最好由使用方定义。
3. 参数接收接口,返回具体类型,是常见工程默认值。
4. 空接口 `any` 表示任意类型,但会削弱类型检查。
5. 类型断言要使用 `value, ok` 形式。
6. 接口值包含动态类型和动态值,typed nil 会导致 `err != nil`。
7. 不要过早抽象,也不要用大接口复制类体系。

下一篇讲指针和内存布局。理解指针后,你会更清楚方法接收者、slice、map 和接口值背后的成本。
