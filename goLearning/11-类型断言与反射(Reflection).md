# 类型断言与反射(Reflection)

> **导读**：动态语言的特征。在写通用库（如 JSON 序列化、ORM）时必不可少，但业务代码中应尽量少用。

## 一、类型断言 (Type Assertion)
当你拿到一个 `interface{}` 时，如何把它变回真实的类型？
```go
var v any = "hello"

// 1. 安全断言 (推荐)
if str, ok := v.(string); ok {
    fmt.Println("它是字符串:", str)
} else {
    fmt.Println("断言失败，它不是字符串")
}

// 2. 暴力断言 (如果不是对应类型，会直接 Panic)
str2 := v.(string) 

// 3. Type Switch (根据不同类型走不同分支)
switch val := v.(type) {
case string:
    fmt.Println("string:", val)
case int:
    fmt.Println("int:", val)
default:
    fmt.Println("unknown type")
}
```

## 二、反射 (reflect)
在运行期探测和修改变量的类型和值。Go 提供了强大的 `reflect` 包。

1. **获取类型和值信息**：`reflect.TypeOf()` 和 `reflect.ValueOf()`
```go
type User struct { Name string }
u := User{Name: "Alice"}
t := reflect.TypeOf(u)
v := reflect.ValueOf(u)
fmt.Println(t.Name()) // User
fmt.Println(t.Kind()) // struct
```

2. **通过反射修改值**：必须传入**指针**，并且调用 `.Elem()` 解引用。
```go
x := 10
vx := reflect.ValueOf(&x).Elem()
vx.SetInt(20)
fmt.Println(x) // 20
```

3. **读取结构体标签 (Struct Tag)**
JSON 和 ORM 的魔法核心，就是通过反射读取 Tag。
```go
type Config struct {
    Host string `json:"host" db:"mysql_host"`
}
t := reflect.TypeOf(Config{})
f, _ := t.FieldByName("Host")
fmt.Println(f.Tag.Get("json")) // host
```

**避坑指南**：反射非常慢（通常比直接调用慢几十倍）。不要在高性能要求的热点循环中使用反射。
