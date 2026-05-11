# 29-WebAssembly（WASM）实战

> "JS 统治了浏览器，但对于音视频处理、3D 渲染、复杂的加密计算来说，JS 太慢了。WASM 就是破局的解药，而 Rust 是写 WASM 体验最好的语言。"

WebAssembly 是一种可以直接在浏览器引擎里以接近原生速度运行的字节码格式。

## 一、环境准备

我们需要安装 `wasm-pack`，这是 Rust 官方的 WebAssembly 构建工具。

```bash
cargo install wasm-pack
```

## 二、写一个 WASM 库

创建一个新项目：`cargo new --lib hello-wasm`。
在 `Cargo.toml` 中添加依赖，并设置类型为 `cdylib`：

```toml
[lib]
crate-type = ["cdylib"]

[dependencies]
wasm-bindgen = "0.2" # WASM 和 JS 交互的桥梁
```

写代码 `src/lib.rs`：
```rust
use wasm_bindgen::prelude::*;

// 引入 JS 的 alert 函数
#[wasm_bindgen]
extern "C" {
    pub fn alert(s: &str);
}

// 暴露一个 greet 函数给 JS 调用
#[wasm_bindgen]
pub fn greet(name: &str) {
    let msg = format!("Hello, {}! This is from Rust WASM!", name);
    alert(&msg);
}
```

## 三、编译与在前端使用

执行编译命令：
```bash
wasm-pack build --target web
```
这会在 `pkg` 目录下生成 `.wasm` 文件和已经封装好的 `.js` 胶水代码。

在你的普通 HTML 里就可以直接用了！
```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Rust WASM Demo</title>
  </head>
  <body>
    <script type="module">
      // 直接引入 wasm-pack 帮我们生成的胶水 JS
      import init, { greet } from './pkg/hello_wasm.js';

      async function run() {
        // 等待 wasm 模块加载和实例化
        await init(); 
        
        // 直接调用 Rust 写的函数！
        greet('Frontend Developer');
      }

      run();
    </script>
  </body>
</html>
```

## 四、真实应用场景

1. **Figma**：核心渲染引擎是用 C++ 和 Rust 编译到 WASM 跑在浏览器里的。
2. **Yew 框架**：如果你想彻底不用 JS，Yew 允许你用 Rust 写类似于 React 的组件，然后全部编译成 WASM 运行。

---
**下一篇：** `30-Rust性能优化与火焰图.md`，最后一篇！教你怎么压榨 CPU。
