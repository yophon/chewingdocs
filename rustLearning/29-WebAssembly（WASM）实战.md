# 29-WebAssembly（WASM）实战

> 一句话导读：Rust 编译到 WASM 的价值不是替代所有 JavaScript，而是把计算密集、可隔离、可复用的核心逻辑带到浏览器、边缘和插件运行时。

WebAssembly 是一种二进制指令格式，能在浏览器和很多非浏览器运行时中执行。

Rust 很适合写 WASM，因为：

- 没有 GC，产物更可控。
- 类型系统强，适合写复杂核心逻辑。
- `wasm-bindgen` 和 `wasm-pack` 生态成熟。
- 同一份 Rust 逻辑可以在服务端、CLI、WASM 中复用一部分。

但 WASM 不是“让前端自动变快”的魔法。调用边界、包体积、调试成本都要算进去。

## 一、机制心智：WASM 是计算模块，JS 是宿主环境

浏览器里的 WASM 不能自己直接操作 DOM，也不能随意调用浏览器 API。它通常通过 JS 胶水代码和宿主交互。

```text
JavaScript
    |
    | 调用导出的 WASM 函数
    v
Rust 编译出的 .wasm
    |
    | 返回数值、字符串、数组或句柄
    v
JavaScript 更新 UI / 调用浏览器 API
```

适合放进 WASM 的通常是：

- 图像处理。
- 音视频编解码。
- 加密、哈希、压缩。
- 解析器、规则引擎。
- 游戏或图形核心逻辑。

不适合放进 WASM 的通常是：

- 大量 DOM 操作。
- 普通表单页面。
- 频繁和 JS 来回传小对象。
- 本来瓶颈在网络或数据库的逻辑。

## 二、环境准备

安装工具：

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
```

创建项目：

```bash
cargo new --lib image_score_wasm
cd image_score_wasm
```

`Cargo.toml`：

```toml
[package]
name = "image_score_wasm"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
wasm-bindgen = "0.2"

[profile.release]
opt-level = "s"
lto = true
```

`cdylib` 让 Rust 生成适合外部宿主加载的动态库形式。`opt-level = "s"` 偏向减小体积。

## 三、导出简单函数

`src/lib.rs`：

```rust
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}

#[wasm_bindgen]
pub fn normalize_score(raw: f64, max: f64) -> f64 {
    if max <= 0.0 {
        return 0.0;
    }

    (raw / max * 100.0).clamp(0.0, 100.0)
}
```

构建：

```bash
wasm-pack build --target web
```

`pkg/` 里会生成：

- `.wasm`：真正的 WASM 模块。
- `.js`：加载和类型转换胶水代码。
- `.d.ts`：TypeScript 声明。

## 四、在浏览器里调用

`index.html`：

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Rust WASM Demo</title>
  </head>
  <body>
    <output id="result"></output>

    <script type="module">
      import init, { add, normalize_score } from "./pkg/image_score_wasm.js";

      await init();

      const value = add(20, 22);
      const score = normalize_score(8, 10);

      document.querySelector("#result").textContent =
        `add=${value}, score=${score}`;
    </script>
  </body>
</html>
```

因为浏览器加载 WASM 需要正确 MIME 和模块语义，建议用本地 HTTP 服务打开：

```bash
python3 -m http.server 8080
```

然后访问 `http://localhost:8080`。

## 五、传递字符串和数组

数值跨边界最便宜；字符串和数组需要额外转换。

```rust
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn slugify(input: &str) -> String {
    input
        .trim()
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

#[wasm_bindgen]
pub fn sum_bytes(bytes: &[u8]) -> u32 {
    bytes.iter().map(|&b| b as u32).sum()
}
```

JS 调用：

```js
import init, { slugify, sum_bytes } from "./pkg/image_score_wasm.js";

await init();

console.log(slugify(" Hello, Rust WASM! "));

const bytes = new Uint8Array([1, 2, 3, 4]);
console.log(sum_bytes(bytes));
```

工程经验：

- 少在 JS 和 WASM 之间频繁传大量小对象。
- 尽量批量传数组。
- 把核心循环放在 WASM 内部完成。

## 六、从 Rust 调用 JS

通过 `wasm-bindgen` 声明外部 JS 函数：

```rust
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(message: &str);
}

#[wasm_bindgen]
pub fn run_task() {
    log("task started from Rust");
}
```

这适合少量日志和宿主 API 调用。不要在性能热点里每次循环都调用 JS，边界成本会吞掉 WASM 的收益。

## 七、panic 和错误处理

默认情况下，Rust panic 在浏览器里不一定好读。开发时可以加：

```toml
[dependencies]
console_error_panic_hook = "0.1"
wasm-bindgen = "0.2"
```

```rust
use std::sync::Once;

static INIT: Once = Once::new();

fn init_panic_hook() {
    INIT.call_once(|| {
        console_error_panic_hook::set_once();
    });
}

#[wasm_bindgen]
pub fn parse_positive(input: &str) -> Result<u32, JsValue> {
    init_panic_hook();

    let value: u32 = input
        .parse()
        .map_err(|_| JsValue::from_str("input must be a positive integer"))?;

    Ok(value)
}
```

WASM API 更推荐返回 `Result<T, JsValue>`，而不是 panic。

## 八、体积优化

WASM 包体积会直接影响页面加载。

常见优化：

```toml
[profile.release]
opt-level = "z"
lto = true
codegen-units = 1
panic = "abort"
strip = true
```

构建后可以使用：

```bash
wasm-pack build --target web --release
wasm-opt -Oz -o pkg/optimized.wasm pkg/image_score_wasm_bg.wasm
```

`wasm-opt` 来自 Binaryen，需要额外安装。

还要注意依赖选择。一个看似普通的 crate 可能拉入大量格式化、时间、本地系统相关依赖，导致体积明显变大。

## 九、什么时候该用 WASM

适合使用 WASM：

- CPU 密集任务真的发生在客户端。
- 算法核心能与 UI 分离。
- 希望 Rust 逻辑复用到浏览器和服务端。
- 插件系统需要沙箱执行。
- 边缘运行时支持 WASM。

不该使用 WASM：

- 页面只是 CRUD。
- 性能瓶颈是网络请求。
- 需要频繁操作 DOM。
- 团队不熟悉前端构建链。
- 为了“技术先进”把简单 JS 逻辑搬进 Rust。

WASM 的边界调用不是免费的。小任务可能 JS 更快，因为省掉了跨边界转换成本。

## 十、常见坑

### 1. 直接双击 HTML 打开

浏览器模块和 WASM 加载通常需要 HTTP 服务。使用本地 server。

### 2. 在 WASM 里做大量 DOM 操作

可以做，但通常不划算。让 JS 框架处理 UI，WASM 处理计算。

### 3. 包体积失控

注意 release 配置、依赖选择和 `wasm-opt`。

### 4. 频繁跨边界传对象

把一万个对象逐个传给 WASM，往往比 JS 本地处理更慢。应批量传 typed array。

### 5. 使用不支持 wasm target 的 crate

依赖如果需要文件系统、线程、系统调用，可能无法编译到 `wasm32-unknown-unknown`。

## 十一、工程边界

建议项目结构：

```text
crates/
├── core_logic/       # 纯 Rust 核心逻辑，不依赖 wasm-bindgen
├── wasm_api/         # wasm-bindgen 包装层
└── server/           # 服务端复用 core_logic
```

这样核心逻辑可以普通单元测试，WASM 层只负责转换类型。

测试策略：

- 核心逻辑用 `cargo test`。
- WASM 导出用 `wasm-bindgen-test`。
- 前端集成用 Playwright 或浏览器测试。

## 十二、结尾总结

Rust + WASM 的最佳姿势是：让 Rust 负责稳定、可测试、计算密集的核心，让 JS 负责 UI 和宿主环境。

使用原则：

1. 先确认瓶颈在客户端 CPU。
2. 把跨边界调用次数降到最低。
3. 控制包体积。
4. 核心逻辑和 WASM 包装层分开。
5. 不要为了替代 JS 而使用 WASM。

WASM 是一把适合核心计算的工具，不是所有前端问题的答案。

---
**下一篇：** `30-Rust性能优化与火焰图.md`，用 profiling 找瓶颈，而不是凭感觉优化。
