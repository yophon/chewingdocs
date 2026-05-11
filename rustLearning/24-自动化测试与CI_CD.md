# 24-自动化测试与 CI/CD

> "你不需要像在 Node/Python 里那样装一堆 Jest / PyTest 库。Rust 编译器自带了极好用的测试框架。"

在 Rust 中，测试分为两大类：**单元测试（Unit Tests）** 和 **集成测试（Integration Tests）**。

## 一、单元测试：和源代码写在一起

Rust 习惯把单元测试直接写在业务代码所在的同一个文件中，通常放在文件末尾的一个内部模块里。

```rust
// 业务代码
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}

// cfg(test) 属性意味着：只有当你运行 `cargo test` 时，这段代码才会被编译！
// 也就是说测试代码绝对不会增加你生产包的体积。
#[cfg(test)]
mod tests {
    // 引入父模块中的所有公共项
    use super::*; 

    // 这个宏标记这是一个测试函数
    #[test]
    fn test_add_works() {
        assert_eq!(add(2, 2), 4);
    }
    
    #[test]
    #[should_panic(expected = "Divide by zero")] // 测试是否如预期般崩溃
    fn test_divide_by_zero() {
        panic!("Divide by zero");
    }
}
```

运行测试：
```bash
cargo test
# 只跑特定的测试
cargo test test_add_works
```

## 二、集成测试：完全从外部调用

集成测试放在项目根目录（和 `src` 同级）的 `tests` 文件夹下。
这里的测试把你的库当成一个外部的黑盒，只能调用公开（`pub`）的 API。

目录结构：
```text
my_project/
├── Cargo.toml
├── src/
│   └── lib.rs
└── tests/
    └── integration_test.rs
```

`tests/integration_test.rs`:
```rust
// 必须导入你的库
use my_project;

#[test]
fn test_public_api() {
    assert_eq!(my_project::add(2, 2), 4);
}
```

## 三、GitHub Actions CI/CD 配置模板

一旦你的测试写好了，最舒服的事就是在每次 push 代码时让 CI 帮你跑一边检查。
在 `.github/workflows/rust.yml` 里放上这段模板：

```yaml
name: Rust CI

on:
  push:
    branches: [ "main" ]
  pull_request:
    branches: [ "main" ]

env:
  CARGO_TERM_COLOR: always

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    # 缓存依赖，加速编译
    - uses: Swatinem/rust-cache@v2
    
    # 代码格式检查
    - name: Check formatting
      run: cargo fmt -- --check
      
    # 静态代码检查 (Linter)
    - name: Clippy
      run: cargo clippy -- -D warnings
      
    # 运行所有测试
    - name: Run tests
      run: cargo test
```

只要 `clippy` 没飘红，`cargo test` 全绿，你就可以放心地把代码合并发布了。

---
**下一篇：** `25-实战：写一个带Auth的RESTful_API.md`，把前面所有的库综合起来干一票大的！
