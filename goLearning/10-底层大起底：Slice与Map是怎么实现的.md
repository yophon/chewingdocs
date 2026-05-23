# 底层大起底：Slice 与 Map 是怎么实现的

> **一句话导读**：Slice 和 Map 看起来像普通容器，实际背后分别是“切片头 + 底层数组”和“哈希桶 + 渐进扩容”，理解它们才能避开内存滞留、并发崩溃和性能抖动。

## 一、先建立心智模型

### Slice：小结构体指向大数组

```text
slice header
+---------+---------+---------+
|  array  |   len   |   cap   |
+----|----+---------+---------+
     |
     v
underlying array
+---+---+---+---+---+---+
| 0 | 1 | 2 | 3 | 4 | 5 |
+---+---+---+---+---+---+
      ^------- len -------^
      ^------------- cap ------------^
```

Slice 本身不是数组，它只是一个描述符。在 64 位机器上通常包含 3 个机器字：

```go
type slice struct {
    array unsafe.Pointer
    len   int
    cap   int
}
```

因此，把 slice 作为参数传递时会复制这个头部，而不是复制底层数组。函数里修改元素会影响外部，修改 `len/cap` 本身则只影响当前那份 slice header。

### Map：哈希值定位桶，桶里最多放 8 个槽位

```text
key -> hash(key)
          |
          v
      低 B 位选桶
          |
          v
 buckets: [b0] [b1] [b2] ...
           |
           v
      +-----------------------------+
      | tophash[8] | keys | values |
      +-----------------------------+
             |
             v
        overflow bucket
```

Go 的 map 核心结构可以粗略理解为：

- `hmap`：保存桶数量、元素数、哈希种子、扩容状态等元信息。
- `bmap`：真正的桶，一个桶最多容纳 8 个 key/value。
- overflow bucket：冲突过多时挂在主桶后面。
- old buckets：扩容期间保留旧桶，等待渐进搬迁。

## 二、Slice 的关键机制

### 1. append 可能原地写，也可能换数组

```go
package main

import "fmt"

func main() {
    a := make([]int, 0, 2)
    a = append(a, 1, 2)

    b := append(a, 3) // 超过 cap，通常分配新数组
    b[0] = 100

    fmt.Println("a:", a)
    fmt.Println("b:", b)
}
```

运行方式：

```bash
go run main.go
```

重点不是“append 一定会复制”，而是“append 超过容量才会复制”。如果容量够，`append` 会复用原底层数组，这会让多个 slice 之间相互影响。

```go
package main

import "fmt"

func main() {
    a := []int{1, 2, 3, 4}
    x := a[:2]      // len=2 cap=4
    y := append(x, 9)

    fmt.Println(a) // [1 2 9 4]
    fmt.Println(y) // [1 2 9]
}
```

如果你希望 `x` 后续 append 不污染 `a`，可以用 full slice expression 限制容量：

```go
x := a[:2:2] // len=2 cap=2
y := append(x, 9) // 必然分配新数组
```

### 2. 扩容规则不要死背，要记住趋势

Go 运行时的扩容策略会随版本微调。工程上更重要的是：

- 小 slice 扩容偏激进，常见表现接近翻倍。
- 大 slice 扩容会变得平滑，避免一次性分配过多内存。
- 元素大小、内存分配器规格、对齐都会影响最终容量。

不要写依赖具体容量数字的代码。下面这类测试是不可靠的：

```go
if cap(s) != 512 {
    t.Fatal("wrong cap")
}
```

应该测试业务语义，而不是运行时内部策略。

### 3. 小切片引用大数组会造成内存滞留

```go
package main

func firstKB(data []byte) []byte {
    return data[:1024]
}
```

这段代码返回的 1KB slice 仍然引用原来的大数组。如果 `data` 是一个 100MB 文件内容，那么这 100MB 可能都无法被 GC 回收。

更稳妥的写法：

```go
func firstKBCopy(data []byte) []byte {
    n := min(len(data), 1024)
    out := make([]byte, n)
    copy(out, data[:n])
    return out
}
```

## 三、Map 的关键机制

### 1. map 的零值不能写

```go
var m map[string]int
// m["a"] = 1 // panic: assignment to entry in nil map

m = make(map[string]int)
m["a"] = 1
```

读取 nil map 是安全的，写入 nil map 会 panic。

### 2. map 查找返回零值，要用 ok 区分不存在

```go
score := map[string]int{"alice": 0}

v, ok := score["alice"]
fmt.Println(v, ok) // 0 true

v, ok = score["bob"]
fmt.Println(v, ok) // 0 false
```

如果 value 类型本身的零值是有效业务值，就必须使用 `comma ok`。

### 3. map 扩容是渐进式的

当装载因子过高或 overflow bucket 太多时，map 会触发扩容。Go 不会一次性搬完所有桶，而是在后续读写过程中逐步迁移旧桶。

```text
before grow:
old buckets: [0] [1] [2] [3]

growing:
old buckets: [0] [1] [2] [3]
new buckets: [0] [1] [2] [3] [4] [5] [6] [7]
              ^ 每次操作顺手搬一点
```

这个设计降低了单次停顿，但也意味着 map 的某次写入可能顺带承担搬迁成本，表现为偶发延迟。

### 4. map 迭代顺序是故意不稳定的

```go
for k, v := range m {
    fmt.Println(k, v)
}
```

不要依赖遍历顺序。需要稳定输出时，先收集 key，再排序。

```go
keys := make([]string, 0, len(m))
for k := range m {
    keys = append(keys, k)
}
sort.Strings(keys)

for _, k := range keys {
    fmt.Println(k, m[k])
}
```

## 四、常见坑

### 坑 1：函数里 append 后外部 slice 没变长

```go
func add(s []int) {
    s = append(s, 1)
}

func main() {
    s := []int{}
    add(s)
    fmt.Println(len(s)) // 0
}
```

slice header 是值传递。要么返回新 slice，要么传 `*[]T`。

```go
func add(s []int) []int {
    return append(s, 1)
}
```

### 坑 2：循环变量地址放进 slice

```go
var out []*int
for _, v := range []int{1, 2, 3} {
    v := v
    out = append(out, &v)
}
```

现代 Go 已经修复了很多 range 变量复用导致的典型问题，但在跨版本代码或复杂闭包里仍建议显式复制变量，让意图更清楚。

### 坑 3：并发读写 map

```go
package main

func main() {
    m := map[int]int{}

    go func() {
        for {
            m[1]++
        }
    }()

    for {
        _ = m[1]
    }
}
```

运行后可能直接崩溃：

```text
fatal error: concurrent map read and map write
```

这是运行时 fatal error，不是普通 panic，不能指望 `recover` 救回来。共享 map 要用 `sync.Mutex`、`sync.RWMutex` 或 `sync.Map`。

### 坑 4：map value 不能直接改结构体字段

```go
type User struct {
    Age int
}

m := map[string]User{"a": {Age: 18}}
// m["a"].Age = 20 // compile error
```

因为 map 查找返回的是 value 副本，不是可寻址变量。正确做法：

```go
u := m["a"]
u.Age = 20
m["a"] = u
```

或者把 value 改成指针：

```go
m2 := map[string]*User{"a": {Age: 18}}
m2["a"].Age = 20
```

## 五、工程取舍

### Slice 取舍

- 已知大概数量时，用 `make([]T, 0, n)` 预分配，减少扩容和复制。
- 需要固定长度并逐个赋值时，用 `make([]T, n)`，避免反复 append。
- 返回大数组的一小段时，用 `copy` 切断引用。
- 对外暴露内部 slice 时，要考虑调用方修改底层数组的风险，必要时返回副本。

```go
func (c *Cache) Values() []Item {
    out := make([]Item, len(c.items))
    copy(out, c.items)
    return out
}
```

### Map 取舍

- 已知规模时，用 `make(map[K]V, n)` 给容量提示，降低扩容成本。
- 需要有序遍历时，map 不负责顺序，配合排序后的 key 使用。
- 并发访问时，普通 map 加锁通常比 `sync.Map` 更通用。
- `sync.Map` 更适合读多写少、key 稳定、缓存类场景。

## 六、测试与观察方式

### 运行单个示例

```bash
go run main.go
```

### 看逃逸和分配

```bash
go test -run '^$' -bench . -benchmem
go test -gcflags='-m' ./...
```

### 用 race detector 检查并发 map 问题

```bash
go test -race ./...
```

race detector 能发现数据竞争，但普通 map 并发读写有时会先被运行时直接终止。不要把它当成并发安全的替代品。

## 七、结尾总结

Slice 的本质是一个指向底层数组的轻量描述符，重点是 `len`、`cap`、共享底层数组和扩容复制。Map 的本质是哈希桶结构，重点是哈希冲突、渐进扩容、无序遍历和并发不安全。写 Go 容器代码时，真正可靠的习惯是：预估容量、明确所有权、避免依赖运行时细节，并且对共享 map 加同步保护。
