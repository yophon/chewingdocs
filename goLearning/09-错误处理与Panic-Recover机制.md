# 错误处理与 Panic-Recover 机制

> **导读**: Go 的错误处理看起来啰嗦,但它把失败路径变成了代码里可见、可审查、可测试的一等公民。

Go 没有 `try-catch`,普通错误通过 `error` 返回值显式传递。你会反复写 `if err != nil`,也会反复把底层错误包装后返回。很多新手觉得这很繁琐,但在长期运行的服务里,这种显式失败路径非常重要:每一次失败都在调用点被迫做选择,是重试、降级、返回、记录,还是终止。

这一篇讲 `error` 接口、创建错误、错误包装、`errors.Is/As`、自定义错误、panic/recover 的边界,以及工程里如何判断一个失败应该返回 error 还是 panic。

---

## 一、核心心智模型:错误是普通值,panic 是崩溃信号

先记住:

> **业务可预期失败返回 error;程序不变量被破坏才考虑 panic。**

例如:

- 用户不存在:返回 error
- 参数校验失败:返回 error
- 数据库超时:返回 error
- 配置文件不存在:返回 error 或启动失败
- 数组越界:panic
- nil 指针解引用:panic
- 程序进入理论上不可能的状态:可以 panic

Go 的错误处理不是异常系统。错误就是一个值,函数返回它,调用方检查它。

```go
type error interface {
    Error() string
}
```

任何实现了 `Error() string` 的类型都是 error。

---

## 二、创建普通错误

最简单的错误:

```go
package main

import (
    "errors"
    "fmt"
)

func validateName(name string) error {
    if name == "" {
        return errors.New("name is empty")
    }
    return nil
}

func main() {
    if err := validateName(""); err != nil {
        fmt.Println(err)
    }
}
```

需要格式化:

```go
return fmt.Errorf("user %d not found", id)
```

错误字符串风格:

- 通常小写开头
- 不以句号结尾
- 包含足够上下文
- 不要写成给终端用户看的完整文案

例如:

```go
return fmt.Errorf("load user %d: %w", id, err)
```

比:

```go
return err
```

更容易排查问题。

---

## 三、错误包装:%w

Go 1.13 引入错误包装。`fmt.Errorf` 使用 `%w` 可以保留原错误:

```go
return fmt.Errorf("open config: %w", err)
```

这样上层既能看到上下文,又能用 `errors.Is` 判断根因。

可运行例子:

```go
package main

import (
    "errors"
    "fmt"
    "os"
)

func loadConfig(path string) error {
    _, err := os.Open(path)
    if err != nil {
        return fmt.Errorf("load config %s: %w", path, err)
    }
    return nil
}

func main() {
    err := loadConfig("missing.yaml")
    if err == nil {
        return
    }

    fmt.Println(err)

    if errors.Is(err, os.ErrNotExist) {
        fmt.Println("config file does not exist")
    }
}
```

不要用 `%v` 包装你还想判断的错误:

```go
fmt.Errorf("open config: %v", err) // 只拼字符串,错误链断了
```

---

## 四、sentinel error 与 errors.Is

sentinel error 是包级预定义错误:

```go
var ErrNotFound = errors.New("not found")
```

调用方可以判断:

```go
if errors.Is(err, ErrNotFound) {
    // ...
}
```

完整例子:

```go
package main

import (
    "errors"
    "fmt"
)

var ErrNotFound = errors.New("not found")

func findUser(id int64) (string, error) {
    if id != 1 {
        return "", fmt.Errorf("find user %d: %w", id, ErrNotFound)
    }
    return "alice", nil
}

func main() {
    name, err := findUser(2)
    if err != nil {
        if errors.Is(err, ErrNotFound) {
            fmt.Println("return 404")
            return
        }
        fmt.Println("return 500")
        return
    }

    fmt.Println(name)
}
```

sentinel error 适合稳定、少量、调用方需要分支处理的错误类型。

注意:不要让错误变量变成随处依赖的全局协议。错误一旦导出,就成了 API 的一部分。

---

## 五、自定义错误与 errors.As

如果错误需要携带结构化信息,定义自定义错误类型:

```go
package main

import (
    "errors"
    "fmt"
)

type ValidationError struct {
    Field string
    Msg   string
}

func (e *ValidationError) Error() string {
    return fmt.Sprintf("invalid %s: %s", e.Field, e.Msg)
}

func createUser(name string) error {
    if name == "" {
        return &ValidationError{Field: "name", Msg: "empty"}
    }
    return nil
}

func main() {
    err := createUser("")
    if err == nil {
        return
    }

    var ve *ValidationError
    if errors.As(err, &ve) {
        fmt.Println("field:", ve.Field)
        fmt.Println("msg:", ve.Msg)
        return
    }

    fmt.Println(err)
}
```

`errors.As` 会沿着错误链查找能赋值给目标类型的错误。

使用自定义错误的场景:

- 需要字段名、错误码、重试信息
- HTTP/gRPC 需要映射状态码
- 调用方需要按错误类型分支
- 日志需要结构化上下文

---

## 六、错误处理的调用点策略

遇到 error 时,调用方只有几种选择:

1. 处理并恢复
2. 加上下文后返回
3. 转换成领域错误后返回
4. 记录并终止当前流程
5. 在程序入口处退出

典型写法:

```go
func Handle(id int64) error {
    user, err := LoadUser(id)
    if err != nil {
        return fmt.Errorf("handle user %d: %w", id, err)
    }

    return Process(user)
}
```

不要每层都 log:

```go
if err != nil {
    log.Println(err)
    return err
}
```

如果每层都记录,一条失败会产生多条重复日志。更好的策略是:

- 中间层包装上下文并返回
- 边界层统一记录,例如 HTTP handler、worker main loop、CLI main

---

## 七、panic 是什么

`panic` 会终止当前正常控制流,执行当前 goroutine 栈上的 defer,然后继续向上崩溃。如果没有被 recover,程序退出。

可运行例子:

```go
package main

import "fmt"

func main() {
    defer fmt.Println("defer in main")
    panic("boom")
}
```

panic 适合:

- 程序启动时配置不可用,无法继续
- 初始化阶段发现不可恢复错误
- 内部不变量被破坏
- 测试 helper 里简化失败
- 框架边界捕获并转成 500

不适合:

- 用户输入错误
- 文件不存在
- 数据库查询失败
- 远程服务超时
- 业务规则不满足

普通业务失败用 error。

---

## 八、recover 必须在 defer 中调用

`recover` 只能在 deferred function 中捕获当前 goroutine 的 panic。

```go
package main

import "fmt"

func safeRun(fn func()) {
    defer func() {
        if r := recover(); r != nil {
            fmt.Println("recovered:", r)
        }
    }()

    fn()
}

func main() {
    safeRun(func() {
        panic("boom")
    })

    fmt.Println("still running")
}
```

注意:recover 不能跨 goroutine:

```go
func main() {
    defer func() {
        recover()
    }()

    go func() {
        panic("boom") // main 的 recover 捕不到
    }()
}
```

每个 goroutine 都有自己的调用栈。要保护 worker,必须在 worker goroutine 内部 defer recover。

---

## 九、可运行综合例子:HTTP 风格的安全边界

下面不用真的启动 HTTP 服务,只模拟 handler 边界如何把 panic 转成错误响应:

```go
package main

import (
    "errors"
    "fmt"
)

var ErrNotFound = errors.New("not found")

func safeHandle(name string, handler func() error) {
    defer func() {
        if r := recover(); r != nil {
            fmt.Println(name, "500 panic:", r)
        }
    }()

    err := handler()
    if err == nil {
        fmt.Println(name, "200 ok")
        return
    }

    if errors.Is(err, ErrNotFound) {
        fmt.Println(name, "404 not found")
        return
    }

    fmt.Println(name, "500 error:", err)
}

func main() {
    safeHandle("normal", func() error {
        return nil
    })

    safeHandle("missing", func() error {
        return fmt.Errorf("load user: %w", ErrNotFound)
    })

    safeHandle("panic", func() error {
        panic("nil pointer")
    })
}
```

真实 Web 框架的 recovery middleware 本质上就是这个思路:

- 在请求边界 recover
- 记录堆栈和请求信息
- 返回 500
- 不让单个请求拖垮整个进程

但 handler 内部的普通业务失败仍然应该返回 error,不是 panic。

---

## 十、defer 清理与错误合并

资源关闭也可能失败。最简单写法:

```go
f, err := os.Open(path)
if err != nil {
    return err
}
defer f.Close()
```

如果关闭错误很重要,需要显式处理。命名返回值可以做到:

```go
func write(path string, data []byte) (err error) {
    f, err := os.Create(path)
    if err != nil {
        return err
    }

    defer func() {
        closeErr := f.Close()
        if err == nil {
            err = closeErr
        }
    }()

    _, err = f.Write(data)
    return err
}
```

这类代码不要滥用。只有 close/commit/rollback 的错误真的影响结果时,才需要这么精细。

---

## 十一、常见坑

### 11.1 吞掉错误

```go
_ = doSomething()
```

可以写,但要有明确理由。否则就是把故障延后。

### 11.2 用字符串匹配错误

```go
if strings.Contains(err.Error(), "not found") {
}
```

这很脆。优先用 `errors.Is`、`errors.As` 或错误码。

### 11.3 包装错误时用 `%v`

```go
return fmt.Errorf("load: %v", err)
```

错误链断了。需要保留根因时用 `%w`。

### 11.4 panic 做业务分支

用 panic 跳出深层业务逻辑,最后 recover 成正常响应,会让控制流变得不可读。业务分支应该显式返回 error。

### 11.5 recover 后什么都不做

```go
defer func() {
    recover()
}()
```

这会吞掉崩溃信息,排查困难。至少记录日志、堆栈、请求上下文。

### 11.6 typed nil error

```go
func f() error {
    var e *MyError = nil
    return e
}
```

返回的 error 不等于 nil。要返回真正的 nil。

---

## 十二、工程判断

如何决定返回 error 还是 panic?

返回 error:

- 外部输入导致的问题
- 依赖服务失败
- 文件、网络、数据库问题
- 权限、校验、业务规则失败
- 调用方有机会处理或降级

使用 panic:

- 代码 bug
- 不变量被破坏
- 初始化阶段无法继续
- 极少数必须立刻终止的状态

错误设计建议:

- 在靠近错误发生处补充上下文
- 在系统边界统一记录日志
- 需要分支判断时提供 sentinel error 或自定义错误类型
- 不要把内部错误细节直接暴露给终端用户
- 对外 API 错误最好有稳定错误码或状态码
- 测试里覆盖关键错误路径,不要只测 happy path

---

## 十三、小结

Go 错误处理的核心是显式。

你需要记住:

1. `error` 是普通接口,错误是普通值。
2. 普通失败返回 error,不要 panic。
3. 用 `%w` 包装错误,用 `errors.Is` 判断 sentinel error。
4. 用 `errors.As` 提取自定义错误类型。
5. 中间层包装并返回,边界层统一记录。
6. panic 会执行 defer 并沿栈崩溃,recover 只能在 defer 中捕获。
7. recover 适合系统边界兜底,不是业务控制流。

到这里,Go 基础语法、容器、函数、结构体、接口、指针和错误处理已经串起来了。后面再看 slice/map 底层、反射、泛型和并发时,这些基础语义会反复出现。
