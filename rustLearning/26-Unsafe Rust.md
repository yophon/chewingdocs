# 26-Unsafe Rust

> 一句话导读：`unsafe` 不是“关闭 Rust 安全性”的按钮，而是把少数编译器无法证明的安全责任交还给程序员。

Rust 的大多数安全保证来自编译器：所有权、防悬垂引用、无数据竞争、类型检查、生命周期检查。

但有些底层任务编译器确实无法静态证明：

- 调用 C 函数。
- 操作硬件寄存器。
- 手写高性能容器。
- 解引用裸指针。
- 构建标准库那样的基础抽象。

这时 Rust 提供 `unsafe`。它允许你做一些危险操作，但要求你自己维护不变量。

## 一、机制心智：unsafe 是局部责任边界

`unsafe` 有两个非常重要的事实：

1. `unsafe` 不会关闭借用检查器。
2. `unsafe` 只允许你执行五类额外操作。

五类操作是：

- 解引用裸指针。
- 调用 `unsafe fn`。
- 访问或修改 `static mut`。
- 实现 `unsafe trait`。
- 访问 `union` 字段。

创建裸指针本身是安全的；真正危险的是解引用：

```rust
fn main() {
    let mut value = 10;

    let ptr_const = &value as *const i32;
    let ptr_mut = &mut value as *mut i32;

    unsafe {
        println!("{}", *ptr_const);
        *ptr_mut = 20;
        println!("{}", value);
    }
}
```

`unsafe` 块的含义不是“这里一定有 bug”，而是“这里有编译器无法替我证明的事情，我承诺自己证明过”。

## 二、裸指针和引用的区别

引用 `&T` 和 `&mut T` 带有 Rust 的别名规则：

- 任意数量不可变引用，或一个可变引用。
- 引用必须非空、对齐、指向有效值。
- 生命周期内不能悬垂。

裸指针 `*const T` 和 `*mut T` 不保证这些：

- 可以为空。
- 可以悬垂。
- 可以未对齐。
- 可以同时存在多个可变裸指针。
- 不自动受生命周期约束。

所以解引用前必须自己检查。

```rust
fn read_first(slice: &[i32]) -> Option<i32> {
    let ptr = slice.as_ptr();

    if ptr.is_null() || slice.is_empty() {
        return None;
    }

    unsafe {
        Some(*ptr)
    }
}

fn main() {
    assert_eq!(read_first(&[1, 2, 3]), Some(1));
    assert_eq!(read_first(&[]), None);
}
```

这个例子里的安全依据是：

- `slice.as_ptr()` 来自有效 slice。
- `slice` 非空时，第一个元素一定存在。
- 只读取，不写入。

## 三、把 unsafe 包成安全抽象

Rust 标准库里大量使用 `unsafe`，但对外暴露的是安全 API。你的代码也应该这样做。

下面是一个教学版的 `split_at_mut`，把一个可变 slice 拆成两个不重叠的可变 slice。

```rust
fn my_split_at_mut(values: &mut [i32], mid: usize) -> (&mut [i32], &mut [i32]) {
    let len = values.len();
    let ptr = values.as_mut_ptr();

    assert!(mid <= len);

    unsafe {
        (
            std::slice::from_raw_parts_mut(ptr, mid),
            std::slice::from_raw_parts_mut(ptr.add(mid), len - mid),
        )
    }
}

fn main() {
    let mut data = [1, 2, 3, 4];
    let (left, right) = my_split_at_mut(&mut data, 2);

    left[0] = 10;
    right[0] = 30;

    assert_eq!(data, [10, 2, 30, 4]);
}
```

安全依据：

- `ptr` 来自一个有效的 `&mut [i32]`。
- `mid <= len`，所以不会越界。
- 两个 slice 的范围分别是 `[0, mid)` 和 `[mid, len)`，互不重叠。
- 返回的 slice 生命周期绑定到输入的 `&mut [i32]`。

如果没有这些不变量，这个函数就可能制造两个指向同一内存的 `&mut`，直接违反 Rust 的核心别名规则。

## 四、unsafe fn：调用者也要承担责任

`unsafe fn` 表示：调用这个函数必须满足额外前置条件。

```rust
unsafe fn read_at(ptr: *const i32, index: usize) -> i32 {
    *ptr.add(index)
}

fn main() {
    let data = [10, 20, 30];
    let ptr = data.as_ptr();

    let value = unsafe {
        read_at(ptr, 1)
    };

    assert_eq!(value, 20);
}
```

这个函数的调用者必须保证：

- `ptr` 非空。
- `ptr.add(index)` 没越界。
- 指针指向初始化过的 `i32`。
- 内存对齐正确。

写 `unsafe fn` 时必须在文档里写 `# Safety`：

```rust
/// Reads an `i32` from `ptr.add(index)`.
///
/// # Safety
///
/// The caller must ensure that `ptr.add(index)` is valid for reads,
/// properly aligned, and points to an initialized `i32`.
unsafe fn documented_read_at(ptr: *const i32, index: usize) -> i32 {
    *ptr.add(index)
}
```

没有 Safety 文档的 `unsafe fn` 在工程里很危险，因为调用者不知道要证明什么。

## 五、static mut 和全局状态

`static mut` 允许可变全局变量，但访问它是 unsafe：

```rust
static mut COUNTER: u64 = 0;

fn increment() {
    unsafe {
        COUNTER += 1;
    }
}
```

这段代码单线程看似没问题，多线程下就是数据竞争。

更好的写法是使用原子类型：

```rust
use std::sync::atomic::{AtomicU64, Ordering};

static COUNTER: AtomicU64 = AtomicU64::new(0);

fn increment() {
    COUNTER.fetch_add(1, Ordering::Relaxed);
}

fn main() {
    increment();
    assert_eq!(COUNTER.load(Ordering::Relaxed), 1);
}
```

工程上几乎总能用 `Atomic*`、`Mutex`、`OnceLock` 替代 `static mut`。

## 六、什么时候该用 unsafe

适合使用 `unsafe` 的场景：

- 实现底层数据结构，并能清楚写出不变量。
- FFI 调用外部 C ABI。
- 和操作系统、硬件、内存映射交互。
- 性能热点中，已经通过 profiling 证明安全封装无法满足要求。
- 编写安全抽象的内部实现。

不该用的场景：

- 为了绕过借用检查器但说不清别名关系。
- 为了省掉一次 clone，但没有性能证据。
- 为了让代码“先编过”。
- 业务逻辑层。
- 团队无人能 review 这段不变量。

如果你想写 `unsafe`，先问自己三个问题：

1. 能不能用标准库或成熟 crate？
2. 能不能把 unsafe 缩小到 5 行以内？
3. 能不能写出 Safety 注释和测试覆盖边界？

## 七、常见坑

### 1. 以为 unsafe 块里的代码都不检查

借用检查、类型检查仍然存在。`unsafe` 只是允许执行特定危险操作。

### 2. 从裸指针创建引用太随意

一旦你从 `*mut T` 创建 `&mut T`，就必须满足 `&mut` 的独占规则。多个指向同一位置的 `&mut` 是未定义行为。

### 3. 指针偏移越界

`ptr.add(n)` 要求结果位于同一 allocation 内或末尾后一位。随意跨对象偏移是 UB。

### 4. 未对齐读取

不是所有地址都能读任意类型。处理字节缓冲区时可能需要 `read_unaligned`。

### 5. FFI 字符串生命周期错误

把 Rust `String` 的内部指针交给 C 后，如果 String 被释放，C 继续持有就是悬垂指针。

## 八、工程边界和审查清单

每段 unsafe 都应该能回答：

- 这里为什么必须 unsafe？
- 输入需要满足哪些 Safety 条件？
- 是否能把 unsafe 包在私有函数里？
- 对外 API 是否仍然安全？
- 是否有 Miri、单元测试或 fuzz 测试覆盖？

可以用 Miri 检查一部分未定义行为：

```bash
rustup component add miri
cargo +nightly miri test
```

Miri 不能证明所有问题，但能抓出很多越界、悬垂、别名违规。

## 九、结尾总结

`unsafe` 是 Rust 和底层世界连接的阀门。它不是原罪，也不是捷径。

正确用法是：

1. 把 unsafe 范围缩到最小。
2. 用注释写清楚 Safety 不变量。
3. 对外暴露安全 API。
4. 优先使用标准库和成熟 crate。
5. 只有在边界层、底层抽象或被证明的性能热点中使用。

Rust 的安全性不是因为没有 unsafe，而是因为 unsafe 被圈在清晰的边界里。

---
**下一篇：** `27-宏（Macros）.md`，学习 Rust 如何在编译期生成代码。
