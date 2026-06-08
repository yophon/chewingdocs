# WebAssembly 入门

WebAssembly(Wasm)= **浏览器里的字节码**。让 C / C++ / Rust / Go 等语言**编译到浏览器里跑**,且性能接近原生(比 JS 快 1.5~10 倍,看场景)。

```
JS:        高级语言 → JIT → 机器码
WebAssembly:高级语言(C/Rust/...) → wasm 字节码 → 浏览器 Wasm VM → 机器码
```

不是"取代 JS",而是**JS 的 CPU 密集场景外援**:

```
JS 不擅长          Wasm 擅长
重计算(密码学)    ✅
图像 / 视频处理    ✅
游戏引擎           ✅(Unity / Unreal)
解压缩 / 编解码     ✅(ffmpeg.wasm)
SQLite / DuckDB    ✅(全部数据库都能跑浏览器里)
PDF / Office 解析  ✅
Python / Ruby      ✅(Pyodide / Ruby.wasm)
```

---

## 一、Wasm 是什么(更精确)

```
Wasm 模块 = 一个二进制文件(.wasm),里头是字节码 + 类型信息 + 导入导出
浏览器加载后,VM 把字节码 JIT 成本机机器码,直接执行
比 JS 快是因为:类型固定 / 没有运行时检查 / 不需要解析文本
```

特点:
- **跨平台**:同一份 wasm 在 Chrome / Safari / Firefox / Node / Deno / Bun / Cloudflare Workers 都能跑
- **沙箱**:跑在 VM 里,不能直接碰文件系统 / 网络 / DOM
- **对 JS 友好**:JS 可以调用 Wasm 函数,反之亦然

---

## 二、第一个 Wasm:从 C 编译

```c
// add.c
int add(int a, int b) { return a + b; }
```

用 [Emscripten](https://emscripten.org) 或 [wasi-sdk](https://github.com/WebAssembly/wasi-sdk) 编译:

```bash
emcc add.c -o add.js -s EXPORTED_FUNCTIONS='["_add"]' -s MODULARIZE=1
```

或更简单:**clang 直接出 wasm**:

```bash
clang --target=wasm32 -nostdlib -Wl,--no-entry -Wl,--export=add -o add.wasm add.c
```

JS 加载:

```js
const r = await WebAssembly.instantiateStreaming(fetch('add.wasm'));
console.log(r.instance.exports.add(1, 2));   // 3
```

---

## 三、Rust → Wasm(2025 主流路径)

Rust 是写 Wasm 最舒服的语言:工具链好、安全、性能。

### 1. 装工具

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
```

### 2. 项目

```bash
cargo new --lib hello-wasm
cd hello-wasm
```

```toml
# Cargo.toml
[lib]
crate-type = ["cdylib"]

[dependencies]
wasm-bindgen = "0.2"
```

```rust
// src/lib.rs
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}

#[wasm_bindgen]
pub fn greet(name: &str) -> String {
    format!("Hello, {}!", name)
}
```

### 3. 构建

```bash
wasm-pack build --target web
```

生成 `pkg/` 目录,包含 `.wasm` + JS 胶水 + TypeScript 类型。

### 4. 在前端用

```js
import init, { add, greet } from './pkg/hello_wasm.js';

await init();           // 加载 wasm
console.log(add(1, 2));  // 3
console.log(greet('World'));   // "Hello, World!"
```

`wasm-bindgen` 自动处理 JS ↔ Rust 类型转换(字符串、数组、对象、Promise)。

### 5. Vite 集成

```ts
// vite.config.ts
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default {
  plugins: [wasm(), topLevelAwait()],
};
```

```ts
import init, { add } from 'hello-wasm';
await init();
add(1, 2);
```

---

## 四、AssemblyScript(TS 写 Wasm)

如果你不想学 Rust,**[AssemblyScript](https://www.assemblyscript.org)** 是个折中——**像 TypeScript 但编译到 Wasm**:

```ts
// assembly/index.ts
export function add(a: i32, b: i32): i32 {
  return a + b;
}
```

```bash
pnpm add -D assemblyscript
pnpm asinit .
pnpm asbuild
```

性能不如 Rust(没那么强的优化),但**学习成本低**,适合 JS 开发者过渡。

---

## 五、性能对比

```
任务                        JS     Wasm   差距
简单加法                     1x     0.8x   差不多(JIT 已经很好)
复杂数学运算                 1x     2-3x   Wasm 快
Mandelbrot 集 / 图像滤镜     1x     5-10x  Wasm 快
解析大 JSON                 1x     1.2x   差不多(JIT 优化的就是这个)
DOM 操作                    1x     0.7x   JS 反而快(Wasm 调 DOM 要跨越边界)
```

**结论**:
- 纯计算 → Wasm 大幅胜出
- DOM / 字符串 / 频繁 JS 互调 → Wasm 不一定快
- **不要用 Wasm 重写所有代码**,只重写真的 CPU 瓶颈

---

## 六、JS 与 Wasm 互操作

### 1. 类型限制

Wasm MVP 只支持 `i32 / i64 / f32 / f64`。字符串 / 数组要通过 **共享内存**:

```rust
// Rust(用 wasm-bindgen 自动处理,不用关心)
#[wasm_bindgen]
pub fn process(data: &[u8]) -> Vec<u8> {
    data.iter().map(|x| x * 2).collect()
}
```

`wasm-bindgen` 把字符串 / Vec 自动转成共享内存指针 + 长度。

### 2. 跨边界开销

```
JS 调 Wasm 函数 = 几十纳秒(很快)
传字符串 / 大数组 = 拷贝到 Wasm 内存(可能慢)
```

优化:**减少跨边界次数**。把整个循环放进 Wasm 一次跑完,而不是每次循环都调一次。

### 3. 共享内存(SharedArrayBuffer)

```js
const memory = new WebAssembly.Memory({ initial: 1, maximum: 100, shared: true });
```

JS 和 Wasm 共享同一块内存,**无拷贝**传数据。但需要 COOP/COEP 头(浏览器安全要求)。

---

## 七、实战场景

### 1. 浏览器跑 Python:Pyodide

```html
<script src="https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js"></script>
<script>
  async function main() {
    const py = await loadPyodide();
    py.runPython(`
      import numpy as np
      print(np.array([1, 2, 3]).sum())
    `);
  }
  main();
</script>
```

整个 NumPy / Pandas / scikit-learn 跑在浏览器里。**JupyterLite** 就用这个。

### 2. 浏览器跑 SQLite

```js
import { sqlite3Worker1Promiser } from '@sqlite.org/sqlite-wasm';

const promiser = await new Promise(r => {
  const p = sqlite3Worker1Promiser({ onready: () => r(p) });
});

await promiser('open', { filename: ':memory:' });
await promiser('exec', { sql: 'CREATE TABLE t (x)' });
await promiser('exec', { sql: 'INSERT INTO t VALUES (1)' });
```

**完整 SQLite,带 OPFS 持久化**。可以做完全离线的数据库应用。

### 3. 浏览器跑 ffmpeg

```js
import { FFmpeg } from '@ffmpeg/ffmpeg';

const ff = new FFmpeg();
await ff.load();
await ff.writeFile('input.mp4', await fetchFile(file));
await ff.exec(['-i', 'input.mp4', '-vf', 'scale=320:240', 'out.mp4']);
const data = await ff.readFile('out.mp4');
```

视频转码 / 剪切 / 滤镜全在前端,**不传服务器**。

### 4. 浏览器跑 Photoshop

Adobe 把 Photoshop 主要 C++ 代码用 Emscripten 编译成 Wasm,**直接在 Chrome 跑全功能 Photoshop**(2023 上线)。

### 5. 数据压缩

```js
import { gzip, ungzip } from 'pako';     // 不是 wasm 但常用
// 或用 wasm 版本(更快):
import { compress } from '@bokuweb/zstd-wasm';
```

---

## 八、Wasm 之外:WASI / Component Model

### WASI(WebAssembly System Interface)

让 Wasm 能在**浏览器外**跑(Node / Deno / Cloudflare / 独立 runtime),**带文件系统 / 网络等系统调用**。

```bash
# 编译为 wasi
clang --target=wasm32-wasi -o hello.wasm hello.c

# 用 wasmtime 跑
wasmtime hello.wasm
```

应用:
- **Cloudflare Workers / Fastly Compute**:用 Wasm 跑 Rust / C / Go,启动 < 1ms
- **K8s / serverless**:Wasm 做轻量函数,比 Docker 启动快 100 倍
- **嵌入式 / 物联网**

### Component Model(2024+ 新标准)

让不同语言写的 Wasm 模块**互相调用**,统一接口。这是 Wasm "通用插件系统" 的雏形。

---

## 九、Wasm 的现实限制

### 1. 不能直接碰 DOM

```rust
// ❌ Wasm 直接操作 DOM 不行
// 必须通过 JS 桥接
```

`wasm-bindgen` 提供 `web-sys` crate 让 Rust 调 DOM,但每次调用都跨边界,**频繁 DOM 操作不如 JS**。

### 2. 包体积

```
Hello world Rust → wasm: 100~500KB(没优化)
Hello world C → wasm:    几 KB(链接简单)
```

Rust 的 Wasm 默认带运行时,**别加进首屏**。优化:

```toml
# Cargo.toml
[profile.release]
opt-level = "z"      # 最小化体积
lto = true
codegen-units = 1
strip = true
```

加上 `wasm-opt`:

```bash
wasm-opt -Oz input.wasm -o output.wasm
```

### 3. 启动时间

加载 + 编译 wasm 要时间。MB 级别 wasm 在手机上可能加载 1~2 秒。**懒加载 / Web Worker 加载**。

### 4. 调试

DevTools 支持 Wasm 单步调试(C / Rust 都能映射回源码),但比 JS 麻烦。开发期可以**先用 JS 写,确定瓶颈再迁移到 Wasm**。

---

## 十、什么时候用 Wasm

```
✅ 用 Wasm
  - 已有 C / C++ / Rust 库要在浏览器跑(ffmpeg / OpenCV / Tesseract)
  - CPU 密集任务卡 JS(图像处理 / 加密 / 物理引擎)
  - 跨平台共享一份代码(浏览器 + 服务端 + 移动端)
  - 需要稳定性能(JS JIT 不稳定时)
  - 边缘 serverless(Cloudflare / Fastly)

❌ 不用 Wasm
  - 普通业务 CRUD(没收益,徒增复杂度)
  - 大量 DOM 操作
  - 重在网络 I/O 而不是计算
  - 团队没 C / Rust 经验,且没现成库可用
```

**90% 应用根本用不到 Wasm**。它是"特殊场景的杀手锏",不是日常工具。

---

## 十一、心智模型

```
WebAssembly 的本质:
  浏览器多了个"VM2",能跑非 JS 字节码,性能稳定且高

JS ←→ Wasm 关系:
  互补,不替代
  JS 调 Wasm 跑重活,DOM 还是 JS

主流来源:
  Rust → Wasm     主流 + 工具链最好
  C / C++ → Wasm  老库迁移
  AssemblyScript  TS 风格,适合 JS 开发者
  Go → Wasm       支持但体积大,不推荐前端

实战清单:
  Pyodide       浏览器跑 Python
  sqlite-wasm   浏览器跑 SQLite
  ffmpeg.wasm   浏览器视频处理
  duckdb-wasm   浏览器分析数据
  自己用 Rust 写 → wasm-pack build
```

---

## 十二、推荐学习路径

如果你想深入:

1. **看 [MDN WebAssembly 教程](https://developer.mozilla.org/en-US/docs/WebAssembly)**(1 小时)
2. **跟 [Rust + Wasm 官方教程](https://rustwasm.github.io/docs/book/)** 写一个游戏(1 天)
3. **挑一个你项目里的 CPU 瓶颈**,用 Rust 重写,看性能差异
4. 看 [`wasm-bindgen` 文档](https://rustwasm.github.io/wasm-bindgen/) 学高级互操作

如果只是了解:**这一篇 + 知道 Pyodide / ffmpeg.wasm 这种工具的存在,需要时去找** 就够了。

---

## 十三、参考资源

- MDN:https://developer.mozilla.org/en-US/docs/WebAssembly
- Rust Wasm Book:https://rustwasm.github.io/docs/book/
- wasm-bindgen:https://rustwasm.github.io/wasm-bindgen/
- Emscripten:https://emscripten.org
- Pyodide:https://pyodide.org
- ffmpeg.wasm:https://ffmpegwasm.netlify.app
- sqlite.org wasm:https://sqlite.org/wasm/

下一篇 37 讲 Web Components(浏览器原生组件标准)。
