# 30-Rust 性能优化与火焰图

> 一句话导读：Rust 性能优化的第一原则是先测量，再定位，再修改；火焰图能告诉你 CPU 时间真正花在了哪里。

Rust 给了你很好的性能起点，但“用 Rust 写”不等于“自动最优”。

常见性能问题仍然会出现：

- Debug 模式误判性能。
- 频繁 clone 和分配。
- 锁竞争。
- 不必要的字符串转换。
- 低效 HashMap。
- async 任务过多或阻塞 executor。
- 算法复杂度本身不对。

优化不是把代码写得更玄，而是用证据把瓶颈一层层缩小。

## 一、机制心智：优化流程不是猜谜

推荐流程：

```text
定义目标
  |
  v
构建可重复 benchmark 或压测
  |
  v
采集 profile / flamegraph
  |
  v
定位最宽的热点
  |
  v
做一个小修改
  |
  v
重新测量，确认收益
```

不要一上来就改数据结构、加 unsafe、换 allocator。没有 profile 的优化通常只是把代码变复杂。

## 二、先确认 release 模式

Rust debug 构建几乎不能用于性能判断。

```bash
cargo run --release
cargo test --release
```

`Cargo.toml`：

```toml
[profile.release]
opt-level = 3
lto = true
codegen-units = 1
panic = "abort"
strip = true
```

这些配置的取舍：

- `opt-level = 3`：运行速度优先。
- `lto = true`：链接时优化，编译更慢。
- `codegen-units = 1`：更利于整体优化，编译并行度下降。
- `panic = "abort"`：减小体积，但失去 unwind。
- `strip = true`：去掉符号，发布产物更小。

服务端程序未必都要 `panic = "abort"`，因为你可能需要更好的崩溃诊断。配置要看场景。

## 三、写一个可重复 benchmark

微基准可以用 Criterion。

`Cargo.toml`：

```toml
[dev-dependencies]
criterion = "0.5"

[[bench]]
name = "slug"
harness = false
```

`benches/slug.rs`：

```rust
use criterion::{black_box, criterion_group, criterion_main, Criterion};

fn slugify(input: &str) -> String {
    input
        .trim()
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect::<String>()
}

fn bench_slugify(c: &mut Criterion) {
    c.bench_function("slugify", |b| {
        b.iter(|| slugify(black_box("Hello, Rust Performance 2026!")))
    });
}

criterion_group!(benches, bench_slugify);
criterion_main!(benches);
```

运行：

```bash
cargo bench
```

`black_box` 防止编译器把测试代码优化没。

微基准适合函数级优化；Web 服务还需要压测工具，比如 `wrk`、`oha`、`k6`。

## 四、生成火焰图

安装：

```bash
cargo install flamegraph
```

Linux 可能需要 perf 权限：

```bash
sudo sysctl kernel.perf_event_paranoid=1
```

运行：

```bash
cargo flamegraph --bin my_service
```

带参数：

```bash
cargo flamegraph --bin my_service -- --config config.toml
```

生成 `flamegraph.svg` 后用浏览器打开。

阅读方法：

- 横向宽度表示 CPU 时间占比。
- 纵向高度表示调用栈深度。
- 最宽的块通常最值得看。
- 顶部很宽的函数往往是直接热点。
- 底部很宽的函数可能是多个路径共同调用的基础函数。

不要只看函数名熟不熟，要结合业务输入和 benchmark 场景。

## 五、示例：减少循环内分配

低效版本：

```rust
fn join_numbers_slow(values: &[u32]) -> String {
    let mut output = String::new();

    for value in values {
        output = format!("{output},{value}");
    }

    output
}
```

问题：

- 每次循环都创建新 String。
- 复制旧内容。
- `format!` 成本高。

改进：

```rust
use std::fmt::Write;

fn join_numbers_fast(values: &[u32]) -> String {
    let mut output = String::with_capacity(values.len() * 4);

    for (index, value) in values.iter().enumerate() {
        if index > 0 {
            output.push(',');
        }
        write!(&mut output, "{value}").expect("writing to String should not fail");
    }

    output
}

fn main() {
    let values = [1, 20, 300];
    assert_eq!(join_numbers_fast(&values), "1,20,300");
}
```

这种优化可读性仍然不错，且减少了明显分配。

## 六、clone、借用和 Cow

`clone()` 不是错，但在热点路径里要知道自己 clone 的是什么。

```rust
fn total_len_slow(values: &[String]) -> usize {
    values
        .iter()
        .map(|value| value.clone().trim().len())
        .sum()
}

fn total_len_fast(values: &[String]) -> usize {
    values
        .iter()
        .map(|value| value.trim().len())
        .sum()
}
```

如果函数有时需要借用、有时需要拥有，可以考虑 `Cow`：

```rust
use std::borrow::Cow;

fn normalize(input: &str) -> Cow<'_, str> {
    let trimmed = input.trim();

    if trimmed == input {
        Cow::Borrowed(input)
    } else {
        Cow::Owned(trimmed.to_string())
    }
}

fn main() {
    assert!(matches!(normalize("rust"), Cow::Borrowed(_)));
    assert!(matches!(normalize(" rust "), Cow::Owned(_)));
}
```

但 `Cow` 会增加类型复杂度，只在热点或 API 边界确实受益时使用。

## 七、HashMap 和 hasher 选择

Rust 标准库 `HashMap` 默认 hasher 注重抗 HashDoS，不是最快。

如果 key 来自可信内部数据，并且 profile 显示 hash 成本明显，可以换更快 hasher：

```toml
[dependencies]
ahash = "0.8"
```

```rust
use ahash::AHashMap;

fn count_words(words: &[&str]) -> AHashMap<String, usize> {
    let mut counts = AHashMap::new();

    for word in words {
        *counts.entry((*word).to_string()).or_insert(0) += 1;
    }

    counts
}
```

工程边界：

- 外部用户可控 key：谨慎换掉安全 hasher。
- 内部编译器、索引、缓存场景：快速 hasher 常有收益。
- 先测量，不要默认替换所有 HashMap。

## 八、锁竞争和并发优化

多线程慢不一定是 CPU 不够，可能是大家都在等同一把锁。

低效示例：

```rust
use std::sync::{Arc, Mutex};

fn push_many(shared: Arc<Mutex<Vec<u64>>>, values: &[u64]) {
    for value in values {
        shared.lock().unwrap().push(*value);
    }
}
```

每次循环都加锁。改成批量：

```rust
use std::sync::{Arc, Mutex};

fn push_many(shared: Arc<Mutex<Vec<u64>>>, values: &[u64]) {
    let mut local = Vec::with_capacity(values.len());
    local.extend_from_slice(values);

    let mut guard = shared.lock().unwrap();
    guard.extend(local);
}
```

优化方向：

- 缩小临界区。
- 批量处理。
- 分片锁。
- 读多写少用 `RwLock`。
- 高并发队列用 `crossbeam` 或 channel。
- async 代码避免在持锁时 `.await`。

## 九、async 性能坑

Rust async 很强，但也容易写出隐藏阻塞。

常见问题：

- 在 async handler 里做 CPU 密集计算，阻塞 executor。
- 持有 `MutexGuard` 后 `.await`。
- 生成大量细碎 task。
- 不设置连接池和超时。

CPU 密集任务可以丢到 blocking 池：

```rust
async fn hash_large_payload(payload: Vec<u8>) -> Result<String, tokio::task::JoinError> {
    tokio::task::spawn_blocking(move || {
        use sha2::{Digest, Sha256};
        let digest = Sha256::digest(&payload);
        format!("{digest:x}")
    })
    .await
}
```

不要把 async 当作自动并行。async 主要解决等待 IO 时释放执行权。

## 十、什么时候该用 unsafe 优化

极少数性能热点可能考虑 unsafe，比如：

- 边界检查确实占比高。
- SIMD 或平台 intrinsics。
- 手写内存布局。
- FFI 调用高性能库。

但前提很严格：

1. profile 证明热点存在。
2. 安全 Rust 版本已经足够清晰地测过。
3. unsafe 范围很小。
4. 有 Safety 注释、测试、Miri 或 fuzz。
5. 收益足以抵消维护风险。

不该用 unsafe 的场景：

- 为了绕过借用检查器。
- 为了“可能快一点”。
- 算法复杂度还没优化。
- 团队无法 review。

Rust 性能优化的常规路线里，unsafe 通常排在很后面。

## 十一、更多工具

常用工具：

- `cargo flamegraph`：CPU 火焰图。
- `criterion`：微基准。
- `hyperfine`：命令行程序 benchmark。
- `heaptrack` / `valgrind massif`：内存分配分析。
- `tokio-console`：Tokio async 任务观察。
- `tracing`：结构化日志和 span。
- `perf`：Linux 性能事件。

命令行程序可以用：

```bash
hyperfine 'target/release/my_cli input.txt'
```

服务端程序要结合真实流量模型，单纯函数 benchmark 不足以代表整体性能。

## 十二、常见坑

### 1. 在 debug 模式下优化

先 release，再谈性能。

### 2. 只看平均值

服务端更关心 p95、p99 延迟。平均值很好看不代表用户体验稳定。

### 3. 优化了非热点代码

不在火焰图上的代码，改得再漂亮也不会明显变快。

### 4. 牺牲可读性换微小收益

如果收益不到 1%，但代码复杂一倍，通常不值得。

### 5. 忽略算法复杂度

把 O(n²) 改成 O(n log n) 往往比消除几个 clone 更重要。

### 6. benchmark 输入不真实

小输入上的最快实现，大输入、中文、异常数据下可能完全不同。

## 十三、工程边界

优化前需要明确：

- 目标是吞吐、延迟、内存、包体积还是冷启动？
- 当前基线是多少？
- 可接受的复杂度增加是多少？
- 是否有回归 benchmark？

优化后要留下：

- benchmark。
- profile 结论。
- 关键取舍说明。
- 防止回退的测试或性能门槛。

性能优化是一种工程变更，不是一次性手工调参。

## 十四、结尾总结

Rust 给了你高性能的起点，但真正的优化仍然依赖测量和判断。

记住这条顺序：

1. 用 release 模式建立基线。
2. 用 benchmark 或压测复现问题。
3. 用火焰图定位热点。
4. 优先改算法、分配、clone、锁和 IO。
5. 最后才考虑 unsafe、SIMD、allocator 这类高成本手段。

到这里，整个 Rust 学习路线已经从基础语法、所有权、并发、Web 工程走到了底层边界和性能优化。后续真正的提升来自持续写项目、读错误、看标准库源码，以及用工具验证自己的判断。
