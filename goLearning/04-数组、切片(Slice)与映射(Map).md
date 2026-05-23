# 数组、切片(Slice)与映射(Map)

> **导读**: Go 日常写业务最常用的不是数组,而是 slice 和 map;理解它们的底层语义,比会写字面量重要得多。

在 Go 里,数组、切片和映射看起来都像"容器",但它们的工程语义完全不同:数组是固定长度的值,slice 是指向底层数组的一段视图,map 是哈希表。很多 Go bug 都来自把这三者混在一起理解,尤其是 slice 的扩容、共享底层数组、map 的 nil 和并发读写。

这一篇重点不是列 API,而是讲清楚它们的心智模型:什么时候用数组,为什么几乎都用 slice,什么时候 map 会 panic,为什么函数传 slice 后修改元素会影响外面,但 append 又不一定影响外面。

---

## 一、核心心智模型:数组是值,slice 是视图,map 是运行时结构

先记住一句话:

> **数组拥有数据,slice 描述一段数组,map 由运行时维护哈希桶。**

三者的对比:

| 类型 | 长度 | 是否可增长 | 零值 | 传参语义 | 常见用途 |
| --- | --- | --- | --- | --- | --- |
| array | 固定,类型的一部分 | 不可增长 | 元素零值 | 整体值拷贝 | 固定大小数据、底层存储 |
| slice | 动态长度 | 可 append | `nil` | slice header 值拷贝,共享底层数组 | 列表、批量数据 |
| map | 动态键值对 | 可增删 | `nil` | map header 值拷贝,共享底层结构 | 索引、缓存、去重 |

日常开发经验:

- 业务列表几乎总是 `[]T`
- 查找、去重、聚合通常用 `map[K]V`
- `[N]T` 很少直接作为函数参数,除非你真的需要固定长度值
- 并发读写 map 必须加锁或用 `sync.Map`

---

## 二、数组:Array 是固定长度值

数组长度是类型的一部分。`[3]int` 和 `[4]int` 是不同类型:

```go
package main

import "fmt"

func main() {
    var a [3]int
    b := [3]int{1, 2, 3}
    c := [...]int{1, 2, 3}

    fmt.Println(a)
    fmt.Println(b)
    fmt.Println(c)
}
```

数组是值类型,赋值和传参都会复制整个数组:

```go
package main

import "fmt"

func change(a [3]int) {
    a[0] = 100
}

func main() {
    nums := [3]int{1, 2, 3}
    change(nums)
    fmt.Println(nums) // [1 2 3]
}
```

如果数组很大,传值会有明显成本。你可以传数组指针,但业务里更常见的是直接用 slice:

```go
func changeByPointer(a *[3]int) {
    a[0] = 100
}
```

数组适合这些场景:

- 固定长度协议字段,例如 `[16]byte` 表示 UUID
- 小型固定坐标,例如 `[2]int`
- 作为 slice 的底层存储
- 需要值语义和可比较性的场景

注意:数组只有元素类型可比较时才可比较:

```go
package main

import "fmt"

func main() {
    a := [3]int{1, 2, 3}
    b := [3]int{1, 2, 3}
    fmt.Println(a == b) // true
}
```

slice 不能直接比较,只能和 nil 比较。

---

## 三、slice:三元组视图

slice 本身不是动态数组,它是一个描述符,可以近似理解为:

```go
type sliceHeader struct {
    ptr *T
    len int
    cap int
}
```

也就是:

- `ptr`: 指向底层数组某个位置
- `len`: 当前可见长度
- `cap`: 从 ptr 开始到底层数组末尾的容量

示例:

```go
package main

import "fmt"

func main() {
    arr := [5]int{1, 2, 3, 4, 5}
    s := arr[1:4]

    fmt.Println(s)      // [2 3 4]
    fmt.Println(len(s)) // 3
    fmt.Println(cap(s)) // 4,从 arr[1] 到 arr[4]

    s[0] = 200
    fmt.Println(arr) // [1 200 3 4 5]
}
```

slice 是视图,修改元素会影响底层数组。

---

## 四、创建 slice 的几种方式

### 4.1 字面量

```go
nums := []int{1, 2, 3}
```

### 4.2 make

```go
nums := make([]int, 0, 10) // len=0,cap=10
```

这是构建结果集时最常用的写法。如果你大概知道长度,提前给容量可以减少扩容:

```go
users := make([]string, 0, len(ids))
for _, id := range ids {
    users = append(users, loadName(id))
}
```

### 4.3 从数组或 slice 切片

```go
arr := [5]int{1, 2, 3, 4, 5}
s1 := arr[:]
s2 := s1[1:3]
```

切片表达式是左闭右开:

```go
s := []int{10, 20, 30, 40}
fmt.Println(s[1:3]) // [20 30]
```

---

## 五、append 与扩容:是否影响原 slice 取决于底层数组

`append` 会返回新的 slice,必须接住返回值:

```go
s = append(s, 4)
```

如果容量足够,append 会复用原底层数组;如果容量不够,运行时会分配新数组并复制元素。

```go
package main

import "fmt"

func main() {
    base := []int{1, 2, 3, 4}
    a := base[:2] // len=2,cap=4
    b := append(a, 99)

    fmt.Println("base:", base) // [1 2 99 4]
    fmt.Println("a:", a)       // [1 2]
    fmt.Println("b:", b)       // [1 2 99]
}
```

这个例子很容易吓人:append `a` 居然改了 `base`。原因是 `a` 还有容量,append 写进了同一个底层数组。

如果你不希望新 slice 影响旧数据,就复制:

```go
package main

import "fmt"

func main() {
    base := []int{1, 2, 3, 4}
    a := append([]int(nil), base[:2]...)
    b := append(a, 99)

    fmt.Println("base:", base)
    fmt.Println("b:", b)
}
```

Go 1.21 以后也可以用标准库 `slices.Clone`,但学习基础时先掌握 `append([]T(nil), src...)` 的语义。

---

## 六、函数参数中的 slice

Go 所有参数传递都是值传递。传 slice 时复制的是 slice header,底层数组仍然共享。

```go
package main

import "fmt"

func changeElement(s []int) {
    s[0] = 100
}

func appendValue(s []int) {
    s = append(s, 200)
}

func main() {
    nums := []int{1, 2, 3}

    changeElement(nums)
    fmt.Println(nums) // [100 2 3]

    appendValue(nums)
    fmt.Println(nums) // 仍然是 [100 2 3]
}
```

如果函数要把 append 后的结果交还给调用方,必须返回:

```go
func appendValue(s []int) []int {
    return append(s, 200)
}
```

工程判断:

- 函数只读 slice:传 `[]T`
- 函数修改元素:传 `[]T`,但命名和文档要明确
- 函数追加元素:返回新的 `[]T`
- 需要避免共享底层数组:进入函数时复制

---

## 七、nil slice 与空 slice

nil slice:

```go
var a []int
```

空 slice:

```go
b := []int{}
c := make([]int, 0)
```

它们的 `len` 都是 0,都可以 append:

```go
package main

import "fmt"

func main() {
    var a []int
    a = append(a, 1)
    fmt.Println(a)
}
```

差异主要在 JSON 编码、是否等于 nil、API 语义:

```go
package main

import (
    "encoding/json"
    "fmt"
)

func main() {
    var nilSlice []int
    emptySlice := []int{}

    a, _ := json.Marshal(nilSlice)
    b, _ := json.Marshal(emptySlice)

    fmt.Println(string(a)) // null
    fmt.Println(string(b)) // []
}
```

API 返回时要有意识:

- 不关心 JSON 表达时,返回 nil slice 很常见
- 对外 HTTP API 通常更希望返回 `[]`,避免前端处理 null

---

## 八、map:哈希表,但不是线程安全容器

map 的基本用法:

```go
package main

import "fmt"

func main() {
    ages := make(map[string]int)
    ages["alice"] = 18
    ages["bob"] = 20

    age, ok := ages["alice"]
    if ok {
        fmt.Println(age)
    }

    delete(ages, "bob")
    fmt.Println(ages)
}
```

字面量:

```go
scores := map[string]int{
    "alice": 95,
    "bob":   88,
}
```

查不存在的 key 会返回 value 类型的零值:

```go
package main

import "fmt"

func main() {
    m := map[string]int{"alice": 18}

    fmt.Println(m["bob"]) // 0

    age, ok := m["bob"]
    fmt.Println(age, ok) // 0 false
}
```

所以只要零值可能有业务含义,就必须使用 `value, ok`。

---

## 九、map 的零值和初始化

nil map 可以读,但不能写:

```go
package main

import "fmt"

func main() {
    var m map[string]int

    fmt.Println(m["missing"]) // 0
    // m["x"] = 1             // panic

    m = make(map[string]int)
    m["x"] = 1
    fmt.Println(m)
}
```

如果 map 的 value 是 slice,常见聚合写法很简洁:

```go
package main

import "fmt"

func main() {
    groups := map[string][]string{}

    groups["admin"] = append(groups["admin"], "alice")
    groups["admin"] = append(groups["admin"], "bob")
    groups["guest"] = append(groups["guest"], "tom")

    fmt.Println(groups)
}
```

这里 `groups["admin"]` 初始是 nil slice,可以直接 append。

---

## 十、map 遍历无序

Go 故意让 map 遍历顺序不稳定。不要写依赖顺序的逻辑:

```go
for k, v := range m {
    fmt.Println(k, v)
}
```

如果要稳定输出,排序 key:

```go
package main

import (
    "fmt"
    "sort"
)

func main() {
    m := map[string]int{"bob": 20, "alice": 18, "tom": 22}

    keys := make([]string, 0, len(m))
    for k := range m {
        keys = append(keys, k)
    }
    sort.Strings(keys)

    for _, k := range keys {
        fmt.Println(k, m[k])
    }
}
```

稳定顺序是工程输出、测试断言、日志比对里非常重要的细节。

---

## 十一、可运行综合例子:统计日志里的状态码

```go
package main

import (
    "fmt"
    "sort"
    "strings"
)

func main() {
    lines := []string{
        "GET /users 200",
        "POST /orders 201",
        "GET /missing 404",
        "GET /users 200",
        "POST /orders 500",
    }

    counts := make(map[string]int)
    paths := make([]string, 0, len(lines))

    for _, line := range lines {
        parts := strings.Fields(line)
        if len(parts) != 3 {
            continue
        }

        path := parts[1]
        status := parts[2]

        counts[status]++
        paths = append(paths, path)
    }

    statuses := make([]string, 0, len(counts))
    for status := range counts {
        statuses = append(statuses, status)
    }
    sort.Strings(statuses)

    for _, status := range statuses {
        fmt.Println(status, counts[status])
    }

    fmt.Println("paths:", paths)
}
```

这个例子体现了三个基本习惯:

- 结果列表用 slice
- 聚合计数用 map
- map 输出前排序 key

---

## 十二、常见坑

### 12.1 append 后不接返回值

```go
// append(s, 1) // 编译失败:结果未使用
s = append(s, 1)
```

Go 强迫你接住 append 结果,因为底层数组可能已经变了。

### 12.2 切小片导致大数组无法释放

```go
func head(data []byte) []byte {
    return data[:10]
}
```

如果 `data` 很大,返回的小 slice 仍然引用整个底层数组,大数组不能被 GC。需要复制:

```go
func head(data []byte) []byte {
    out := make([]byte, 10)
    copy(out, data[:10])
    return out
}
```

### 12.3 range 拿到的是元素副本

```go
users := []User{{Name: "alice"}}
for _, u := range users {
    u.Name = "bob" // 改的是副本
}
```

要修改原元素:

```go
for i := range users {
    users[i].Name = "bob"
}
```

### 12.4 map 并发读写会崩

普通 map 不是并发安全的。一个 goroutine 写,另一个 goroutine 读,可能直接 fatal error。

并发场景用:

- `sync.RWMutex + map`
- `sync.Map`
- channel 把 map 所有权集中到一个 goroutine

### 12.5 map 的 key 必须可比较

可以作为 key:

- string
- int
- bool
- pointer
- array,前提是元素可比较
- struct,前提是字段都可比较

不能作为 key:

- slice
- map
- function

---

## 十三、工程判断

选择容器时可以这样判断:

- 需要保持顺序:用 slice
- 需要按 key 快速查找:用 map
- 需要去重:用 `map[T]struct{}`
- 需要固定长度且可比较:用 array
- 需要并发共享:普通 map 外面加锁,不要裸用
- 需要返回 API 列表:注意 nil slice 和空 slice 的 JSON 差异
- 需要避免调用方修改内部数据:返回前 clone slice 或 map

map 的 clone 需要手写:

```go
func cloneMap(src map[string]int) map[string]int {
    dst := make(map[string]int, len(src))
    for k, v := range src {
        dst[k] = v
    }
    return dst
}
```

slice 和 map 都很方便,但它们都带有共享底层数据的语义。只要数据会跨函数、跨 goroutine、跨模块传递,就要认真考虑所有权问题。

---

## 十四、小结

数组、slice、map 是 Go 基础数据结构里最重要的三件套。

你需要记住:

1. 数组是固定长度值,传参会复制。
2. slice 是底层数组的视图,包含指针、长度、容量。
3. append 可能复用底层数组,也可能分配新数组,所以必须接返回值。
4. nil slice 可以 append,nil map 不能写入。
5. map 查不存在 key 会返回零值,需要用 `value, ok` 区分。
6. map 遍历无序,稳定输出必须排序 key。
7. 普通 map 不支持并发读写。

下一篇讲函数和多返回值,也就是 Go 错误处理风格的语法基础。
