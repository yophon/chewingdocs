# 数组、切片(Slice)与映射(Map)

> **导读**：日常开发最常用的数据结构。在 Go 中，很少直接用数组，几乎都在用 Slice。

## 一、数组 (Array)
长度固定，类型的一部分。`[3]int` 和 `[4]int` 是不同类型。传递数组是**值拷贝**。
```go
var a [3]int = [3]int{1, 2, 3}
b := [...]int{1, 2, 3} // 自动推导长度
```

## 二、切片 (Slice)
切片是对底层数组的动态视图。
```go
// 1. 从数组创建切片
arr := [5]int{1, 2, 3, 4, 5}
s1 := arr[1:4] // [2, 3, 4]，左闭右开

// 2. 使用 make 创建切片 (类型, 长度, 容量)
s2 := make([]int, 0, 10)

// 3. 字面量创建
s3 := []int{1, 2, 3}

// 4. append 动态扩容
s3 = append(s3, 4, 5) // 如果底层数组容量不够，Go 会自动分配新数组
```
> **避坑**：Slice 作为函数参数传递是“引用”传递（实际传的是 Slice 结构体的拷贝，但结构体里的指针指向同一个底层数组），在函数内修改元素会影响原 Slice，但 append 导致扩容时不会影响原 Slice。

## 三、映射 (Map)
无序的键值对。必须初始化才能赋值。
```go
// 初始化 Map
m := make(map[string]int)
m["alice"] = 18

// 字面量
m2 := map[string]int{"bob": 20}

// 查与删
age, ok := m["alice"] // ok 返回元素是否存在
if ok {
    fmt.Println(age)
}
delete(m, "alice")
```
> **避坑**：Map 在并发读写时会直接引发 fatal error 导致程序崩溃。并发场景必须使用加锁的 map 或 `sync.Map`。
