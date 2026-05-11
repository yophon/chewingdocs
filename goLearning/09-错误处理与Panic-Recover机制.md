# 错误处理与 Panic-Recover 机制

> **导读**：不要抱怨 `if err != nil`。这是 Go 让服务在生产环境中保持极度稳定（永不崩溃）的秘诀。

## 一、`error` 接口
在 Go 中，错误就是一个普通的接口，只要实现了 `Error() string` 方法，就是错误。

```go
type error interface {
    Error() string
}
```

业务中如何抛出错误？
```go
// 方式一：简单的文本错误
return errors.New("user not found")

// 方式二：带有格式化的文本错误
return fmt.Errorf("user %s not found: %w", username, err) // %w 包装原错误
```

## 二、错误检查与处理
不要忽视任何一个错误。
```go
f, err := os.Open("config.txt")
if err != nil {
    // 处理错误：重试、返回给上层、或退出
    return err
}
defer f.Close()
```
如果你不想每次都手写 `if err != nil`，可以用 IDE 快捷键生成，或者这是你不可避免的修行。

## 三、Panic 与 Recover
Go 没有 `try-catch`。`panic` 意味着**发生了不可恢复的灾难性错误**（如数组越界、空指针）。一旦触发 `panic`，程序会立刻停止执行并崩溃退出。

如果不希望整个 Web 服务因为一个请求引发的 `panic` 而宕机，必须使用 `defer` 配合 `recover` 拦截它。

```go
func safeWorker() {
    defer func() {
        if r := recover(); r != nil {
            fmt.Println("捕获到了严重崩溃:", r)
            // 这里可以报警或者记录日志，保护主服务不挂掉
        }
    }()
    
    // 模拟严重的运行时错误
    var a []int
    a[10] = 1 // 数组越界，触发 Panic
}
```
**规范**：平时开发业务逻辑时，必须使用 `error` 返回错误。绝不可以用 `panic` 去做正常的错误控制流跳转！
