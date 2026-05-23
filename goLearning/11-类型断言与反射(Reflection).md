# 类型断言与反射(Reflection)

> **一句话导读**：类型断言解决“接口值到底是什么类型”，反射解决“运行时查看和操作类型信息”，二者都很强，但越靠近业务主流程越应该谨慎使用。

## 一、心智模型：接口值不是一个裸值

Go 的接口值可以粗略理解成两部分：

```text
interface value
+----------------+----------------+
| concrete type  | concrete data  |
+----------------+----------------+
```

当你写：

```go
var x any = "hello"
```

`x` 里保存的不是“一个神秘对象”，而是：

- 动态类型：`string`
- 动态值：`"hello"`

类型断言就是检查这个动态类型是否满足目标类型。反射则把类型和值包装成 `reflect.Type` 和 `reflect.Value`，允许你在运行期做通用处理。

## 二、类型断言

### 1. 安全断言

```go
package main

import "fmt"

func main() {
    var v any = "hello"

    s, ok := v.(string)
    if !ok {
        fmt.Println("not a string")
        return
    }

    fmt.Println(len(s))
}
```

运行方式：

```bash
go run main.go
```

安全断言的核心是 `value, ok := x.(T)`。断言失败不会 panic，而是返回 `ok=false`。

### 2. 强制断言

```go
var v any = 123
s := v.(string) // panic: interface conversion
fmt.Println(s)
```

强制断言适合你已经通过上游逻辑保证类型正确的地方，例如框架内部在注册阶段完成校验后，执行阶段可以减少重复分支。业务代码里更推荐安全断言。

### 3. Type Switch

```go
func Print(v any) {
    switch x := v.(type) {
    case nil:
        fmt.Println("nil")
    case string:
        fmt.Println("string:", x)
    case int, int64:
        fmt.Println("integer:", x)
    case fmt.Stringer:
        fmt.Println("stringer:", x.String())
    default:
        fmt.Printf("unknown: %T\n", x)
    }
}
```

Type switch 适合处理有限数量的类型分支，例如解析配置、适配日志字段、处理协议消息。

## 三、反射的基本操作

### 1. TypeOf 和 ValueOf

```go
package main

import (
    "fmt"
    "reflect"
)

type User struct {
    Name string
    Age  int
}

func main() {
    u := User{Name: "Alice", Age: 20}

    t := reflect.TypeOf(u)
    v := reflect.ValueOf(u)

    fmt.Println(t.Name()) // User
    fmt.Println(t.Kind()) // struct
    fmt.Println(v.FieldByName("Name").String())
}
```

`Type.Name()` 是声明的类型名，`Type.Kind()` 是底层类别。比如 `type MyInt int` 的 `Name()` 是 `MyInt`，`Kind()` 是 `int`。

### 2. 修改值必须可寻址、可设置

```go
package main

import (
    "fmt"
    "reflect"
)

func main() {
    x := 10

    v := reflect.ValueOf(&x).Elem()
    if v.CanSet() {
        v.SetInt(20)
    }

    fmt.Println(x)
}
```

下面这段会 panic：

```go
v := reflect.ValueOf(x)
v.SetInt(20)
```

原因是 `reflect.ValueOf(x)` 拿到的是值副本，不可设置。要修改原变量，必须传指针并 `.Elem()`。

### 3. 读取结构体标签

```go
package main

import (
    "fmt"
    "reflect"
)

type Config struct {
    Host string `json:"host" env:"APP_HOST"`
    Port int    `json:"port" env:"APP_PORT"`
}

func main() {
    t := reflect.TypeOf(Config{})
    for i := 0; i < t.NumField(); i++ {
        f := t.Field(i)
        fmt.Println(f.Name, f.Tag.Get("json"), f.Tag.Get("env"))
    }
}
```

JSON、ORM、配置加载器、参数校验器经常依赖 struct tag 做映射。

## 四、一个可运行的小型配置加载器

下面例子展示反射真正有用的地方：把环境变量填充到结构体。

```go
package main

import (
    "fmt"
    "os"
    "reflect"
    "strconv"
)

type AppConfig struct {
    Host string `env:"APP_HOST"`
    Port int    `env:"APP_PORT"`
}

func LoadEnv(ptr any) error {
    v := reflect.ValueOf(ptr)
    if v.Kind() != reflect.Pointer || v.IsNil() {
        return fmt.Errorf("ptr must be non-nil pointer")
    }

    elem := v.Elem()
    if elem.Kind() != reflect.Struct {
        return fmt.Errorf("ptr must point to struct")
    }

    typ := elem.Type()
    for i := 0; i < elem.NumField(); i++ {
        field := elem.Field(i)
        meta := typ.Field(i)
        key := meta.Tag.Get("env")
        if key == "" || !field.CanSet() {
            continue
        }

        raw := os.Getenv(key)
        if raw == "" {
            continue
        }

        switch field.Kind() {
        case reflect.String:
            field.SetString(raw)
        case reflect.Int:
            n, err := strconv.Atoi(raw)
            if err != nil {
                return fmt.Errorf("%s: %w", key, err)
            }
            field.SetInt(int64(n))
        default:
            return fmt.Errorf("%s: unsupported kind %s", key, field.Kind())
        }
    }

    return nil
}

func main() {
    os.Setenv("APP_HOST", "127.0.0.1")
    os.Setenv("APP_PORT", "8080")

    var cfg AppConfig
    if err := LoadEnv(&cfg); err != nil {
        panic(err)
    }
    fmt.Printf("%+v\n", cfg)
}
```

运行方式：

```bash
go run main.go
```

## 五、常见坑

### 坑 1：带类型的 nil 放进接口后不等于 nil

```go
package main

import "fmt"

type MyError struct{}

func (*MyError) Error() string { return "bad" }

func returnsError() error {
    var e *MyError = nil
    return e
}

func main() {
    err := returnsError()
    fmt.Println(err == nil) // false
}
```

接口值里有动态类型 `*MyError`，只是动态值为 nil，因此接口整体不等于 nil。正确做法是没有错误时直接 `return nil`。

### 坑 2：Kind 和 Type 混淆

```go
type UserID int64

var id UserID = 1
t := reflect.TypeOf(id)

fmt.Println(t.Name()) // UserID
fmt.Println(t.Kind()) // int64
```

如果你需要识别业务类型，要看 `Type`；如果只是按底层类别处理，要看 `Kind`。

### 坑 3：反射访问未导出字段

反射可以看到未导出字段，但不能随便设置它们。跨包访问未导出字段会受到限制。绕过限制通常要用 `unsafe`，除非你在写极底层框架，否则不应这样做。

### 坑 4：反射 panic 很多

下面操作都可能 panic：

- 对不可设置的 Value 调 `Set`。
- 对非 struct 调 `Field`。
- 对 nil pointer 调 `Elem` 后继续取值。
- 用错误的 setter，例如对 string 调 `SetInt`。

工程代码里要先检查 `Kind`、`IsNil`、`CanSet`、`CanInterface`。

## 六、工程取舍

优先级通常是：

1. 具体类型和普通函数。
2. 接口抽象。
3. 泛型。
4. 类型断言。
5. 反射。

反射适合：

- 序列化和反序列化。
- ORM 字段映射。
- 配置加载。
- 参数校验。
- 测试工具和 Mock 框架。

反射不适合：

- 高频业务循环。
- 可以用接口或泛型清晰表达的逻辑。
- 需要强可读性和强编译期约束的核心代码。

反射慢并不是唯一问题，更大的问题是错误从编译期推迟到了运行期。你写错字段名、tag、类型转换，编译器通常帮不上忙。

## 七、测试方式

对反射代码一定要用表格驱动测试覆盖正常和异常输入：

```go
func TestLoadEnv(t *testing.T) {
    t.Setenv("APP_HOST", "localhost")
    t.Setenv("APP_PORT", "8080")

    var cfg AppConfig
    if err := LoadEnv(&cfg); err != nil {
        t.Fatal(err)
    }

    if cfg.Host != "localhost" || cfg.Port != 8080 {
        t.Fatalf("unexpected config: %+v", cfg)
    }
}
```

运行：

```bash
go test ./...
```

## 八、结尾总结

类型断言是从接口值回到具体类型的工具，反射是运行期观察和操作类型系统的工具。它们都能提高框架代码的通用性，但会降低静态检查、可读性和性能。业务代码里先考虑接口和泛型；只有当类型确实要到运行期才知道时，再让反射上场。
