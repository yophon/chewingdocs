# 性能剖析利器：pprof 与 trace

> **一句话导读**：Go 性能优化不要靠猜，`pprof` 看资源消耗，`trace` 看调度时序，两者配合才能定位 CPU、内存、阻塞和延迟尖峰。

## 一、性能问题先分类

线上服务变慢时，很多人第一反应是“加机器”或“改算法”。在 Go 项目里，更稳的做法是先判断瓶颈类型：

- **CPU 高**：某些函数计算密集、序列化过重、锁竞争导致自旋，或者日志/正则/加密过度消耗 CPU。
- **内存高**：对象分配过多、缓存无上限、切片引用大数组、goroutine 泄漏。
- **延迟高但 CPU 不高**：可能卡在锁、网络、数据库、channel、系统调用或调度。
- **偶发尖刺**：可能是 GC、批量任务、连接池耗尽、慢 SQL、下游抖动。

`pprof` 擅长回答“资源花在哪里”，`trace` 擅长回答“某段时间内 goroutine 为什么没运行”。优化顺序应该是：先复现，再采样，再定位，再做最小改动，最后对比优化前后数据。

## 二、开启 pprof：不要把调试端口暴露到公网

Go 标准库自带 `net/http/pprof`。最常见的做法是为 pprof 单独开一个只监听本地或内网的端口。

```go
package main

import (
	"log"
	"net/http"
	_ "net/http/pprof"
)

func main() {
	go func() {
		// 生产环境建议监听 localhost、Pod 内部端口或受控管理网段。
		log.Println(http.ListenAndServe("127.0.0.1:6060", nil))
	}()

	startBusinessServer()
}
```

如果你的主服务已经用了 Gin，不建议把 pprof 直接挂到公网 API 路由上。可以单独起一个 `http.Server`，并配置访问控制：

```go
srv := &http.Server{
	Addr:              "127.0.0.1:6060",
	Handler:           http.DefaultServeMux,
	ReadHeaderTimeout: 3 * time.Second,
}
go func() {
	log.Printf("pprof listen: %v", srv.ListenAndServe())
}()
```

容器或 Kubernetes 环境里，可以通过端口转发临时访问：

```bash
kubectl port-forward pod/my-api-7d9c6bdb7c-abcde 6060:6060
```

## 三、pprof 的机制心智

pprof 不是精确记录每一次函数调用，而是采样分析。它会在一段时间内收集样本，然后按函数、调用栈、对象分配位置聚合。

常用 profile：

```text
/debug/pprof/profile      CPU 采样，默认 30 秒
/debug/pprof/heap         堆内存对象
/debug/pprof/goroutine    goroutine 栈
/debug/pprof/block        阻塞等待
/debug/pprof/mutex        锁竞争
/debug/pprof/allocs       历史分配
/debug/pprof/threadcreate 系统线程创建
```

CPU profile 里的指标：

- `flat`：函数自身消耗，不含它调用的子函数。
- `cum`：函数及其子调用累计消耗。
- `top`：按消耗排序看热点。
- `list`：查看某个函数每一行的消耗。

内存 profile 里的指标：

- `inuse_space`：当前仍然存活的堆内存，适合看内存占用。
- `alloc_space`：历史累计分配，适合看分配压力。

## 四、CPU 剖析：找到真正的热函数

采集 CPU：

```bash
go tool pprof "http://127.0.0.1:6060/debug/pprof/profile?seconds=30"
```

进入交互界面后常用命令：

```text
top
top -cum
list EncodeResponse
web
peek json.Marshal
```

也可以直接生成火焰图或网页：

```bash
go tool pprof -http=:8081 cpu.out
```

一个典型优化例子：接口 CPU 高，profile 显示大量时间耗在 JSON 序列化和字符串拼接。

```go
func BuildLogLine(userID int64, path string, cost time.Duration) string {
	return fmt.Sprintf("uid=%d path=%s cost=%s", userID, path, cost)
}
```

如果这段代码在高 QPS 路径里，`fmt.Sprintf` 的反射和分配成本会被放大。可以换成 `strings.Builder` 或结构化日志字段，让日志库处理编码：

```go
logger.Info("request finished",
	zap.Int64("user_id", userID),
	zap.String("path", path),
	zap.Duration("cost", cost),
)
```

优化时不要只看单个函数耗时。某个函数排第一，可能只是因为它被上层循环调用太多。`top -cum` 和调用图能帮助你找到更上层的设计问题。

## 五、内存剖析：区分占用和分配压力

采集当前堆：

```bash
go tool pprof "http://127.0.0.1:6060/debug/pprof/heap"
```

查看当前存活对象：

```text
top -inuse_space
list LoadCache
```

查看累计分配：

```bash
go tool pprof -alloc_space "http://127.0.0.1:6060/debug/pprof/allocs"
```

常见内存问题：

- 全局 map/cache 没有 TTL 或容量上限。
- 从大切片截取小切片后，小切片仍引用整个底层数组。
- 每个请求创建过多临时对象，导致 GC 压力上升。
- goroutine 泄漏导致栈和引用对象无法释放。

切片引用大数组的例子：

```go
func FirstKB(buf []byte) []byte {
	return buf[:1024] // 如果 buf 是 100MB，小切片仍然引用整个数组。
}
```

修复方式是复制出真正需要的部分：

```go
func FirstKB(buf []byte) []byte {
	out := make([]byte, 1024)
	copy(out, buf[:1024])
	return out
}
```

这会增加一次复制，但能让大数组被 GC 回收。是否值得，要看数据规模和生命周期。

## 六、goroutine、block 和 mutex

goroutine 数量持续上涨，通常意味着泄漏。先看栈：

```bash
curl "http://127.0.0.1:6060/debug/pprof/goroutine?debug=2"
```

常见泄漏写法：

```go
func watch(ctx context.Context, ch <-chan Event) {
	go func() {
		for e := range ch {
			handle(ctx, e)
		}
	}()
}
```

如果 `ch` 永远不关闭，这个 goroutine 就永远不退出。更稳的写法是监听 `ctx.Done()`：

```go
func watch(ctx context.Context, ch <-chan Event) {
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case e, ok := <-ch:
				if !ok {
					return
				}
				handle(ctx, e)
			}
		}
	}()
}
```

block 和 mutex 默认不开启详细采样，需要在程序中设置：

```go
runtime.SetBlockProfileRate(1)
runtime.SetMutexProfileFraction(5)
```

然后采集：

```bash
go tool pprof "http://127.0.0.1:6060/debug/pprof/block"
go tool pprof "http://127.0.0.1:6060/debug/pprof/mutex"
```

block profile 适合看 channel、select、锁、网络等待造成的阻塞；mutex profile 适合看互斥锁竞争。生产环境不要长期把采样开得过细，可能带来额外开销。

## 七、trace：看 goroutine 的时间线

pprof 是聚合视角，trace 是时间线视角。它能看到 goroutine 何时创建、阻塞、唤醒、运行，以及 GC、系统调用、网络轮询、调度延迟。

采集 trace：

```bash
curl -o trace.out "http://127.0.0.1:6060/debug/pprof/trace?seconds=5"
go tool trace trace.out
```

打开页面后重点看：

- **Goroutine analysis**：某个 goroutine 为什么等待、等待多久。
- **Network blocking profile**：是否大量时间耗在网络。
- **Synchronization blocking profile**：是否卡在锁或 channel。
- **Scheduler latency profile**：goroutine 准备好了但迟迟没有被调度运行。
- **GC events**：GC 是否和延迟尖峰重叠。

trace 的采集成本比普通 pprof 更高，通常采 3 到 10 秒即可。它特别适合排查“CPU 不高但接口偶尔慢”的问题。

## 八、基准测试与本地剖析

除了线上 pprof，还可以对 benchmark 生成 profile：

```go
func BenchmarkEncodeUser(b *testing.B) {
	user := User{ID: 1, Name: "Tom", Email: "tom@example.com"}

	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_, _ = EncodeUser(user)
	}
}
```

运行：

```bash
go test ./internal/encoder -bench=. -benchmem -cpuprofile cpu.out -memprofile mem.out
go tool pprof -http=:8081 cpu.out
go tool pprof -http=:8082 mem.out
```

`-benchmem` 会显示每次操作分配了多少字节、多少次 allocation。对于高频函数，减少 allocation 往往比微调几行 CPU 更有效。

## 九、排错清单

采样前先保证环境可信：

- 压测流量是否足够接近真实流量。
- 是否打开了 debug 日志，导致 profile 失真。
- 是否在容器 CPU limit 下运行，调度和 GC 表现可能不同。
- 是否只采了一次，偶发问题至少多采几组对比。
- 是否区分冷启动、缓存预热后、稳定运行期。

看 pprof 时不要急着改第一名函数。先问三个问题：

- 这个热点是否在业务主路径上？
- 它的 `flat` 高还是 `cum` 高？
- 优化它会不会改变语义、增加复杂度或带来内存换 CPU 的副作用？

## 十、生产取舍

pprof 是强大的诊断入口，也是一扇危险的门：

- 不要把 `/debug/pprof` 暴露到公网。
- 最好单独监听管理端口，并通过内网、鉴权、端口转发访问。
- 高峰期采集 CPU 和 trace 要控制时长，避免额外扰动。
- profile 文件可能包含函数名、路径、请求形态等敏感信息，分享前要脱敏。
- 优化后必须用同样压测条件复测，否则无法证明收益。

性能优化要服务于目标，例如降低 P99、减少机器成本、避免 OOM、提升吞吐。没有目标的优化很容易把代码改复杂，却对线上体验没有帮助。

## 十一、总结

`pprof` 和 `trace` 是 Go 工程师必须熟练掌握的生产工具。CPU profile 告诉你计算花在哪里，heap profile 告诉你内存被谁占着，goroutine/block/mutex profile 帮你发现泄漏和等待，trace 则把调度、阻塞和 GC 放到一条时间线上。

真正有效的优化路径是：定义问题，稳定复现，采集数据，定位瓶颈，做小步改动，再用同样方法验证。少猜，多量，Go 的性能问题大多都会变得可解释、可修复。
