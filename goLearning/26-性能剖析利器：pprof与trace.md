# 性能剖析利器：pprof 与 trace

> **导读**：服务内存异常上涨？CPU 占用率飙升到 100%？Go 原生自带了工业级的性能调优工具，让你像透视眼一样看到代码运行的一切。

## 一、引入 net/http/pprof
只需一行匿名 import，就能为你的 HTTP 服务开启性能监控后门！

```go
import _ "net/http/pprof"

func main() {
    // 如果你没有用框架，只用默认的 ServeMux
    go func() {
        // 专门开个端口用于暴露性能数据
        log.Println(http.ListenAndServe("localhost:6060", nil))
    }()
    // ... 主业务逻辑
}
```

## 二、分析 CPU 与内存瓶颈
服务跑起来后，直接在终端执行：

**1. 诊断 CPU 性能：**
```bash
go tool pprof http://localhost:6060/debug/pprof/profile?seconds=30
```
该命令会采集 30 秒的 CPU 样本。进入交互界面后输入 `top`，立马告诉你哪几个函数消耗了最多的 CPU 时间。输入 `web` 可以直接生成直观的 SVG 调用关系图（火焰图）。

**2. 诊断内存泄漏 (Heap)：**
```bash
go tool pprof http://localhost:6060/debug/pprof/heap
```
可以查看目前哪段代码分配了最大的堆内存且未释放，常用于排查 OOM 问题。

**3. 诊断 Goroutine 泄漏：**
访问 `http://localhost:6060/debug/pprof/goroutine?debug=1`，会直接列出当前所有几万个 Goroutine 到底卡在哪个文件的哪一行代码上，死锁排查神器。

## 三、Go Trace
如果 pprof 是宏观的快照，那 Trace 就是微观的电影。它可以记录一小段时间内每一个 Goroutine 在哪个 CPU 核心上执行、休眠、唤醒的全部细节。

通过 `go tool trace trace.out` 可以在浏览器里打开时间轴视图，非常适合用于分析**延迟尖峰（Latency Spikes）**和**调度争抢**问题。
