# 07-结构体与方法（Struct & impl）

> "Rust 没有 Class，但 Struct + impl 能做到面向对象能做的一切，且没有继承的包袱。"

## 一、定义与实例化结构体

Rust 的结构体和 C 语言很像，用来把多个相关的值打包在一起。

```rust
// 定义结构体
struct User {
    active: bool,
    username: String,
    email: String,
    sign_in_count: u64,
}

fn main() {
    // 实例化 (不能只让一部分字段可变，必须整个实例可变)
    let mut user1 = User {
        email: String::from("someone@example.com"),
        username: String::from("someusername123"),
        active: true,
        sign_in_count: 1,
    };

    user1.email = String::from("anotheremail@example.com");
}
```

### 结构体更新语法 (神仙级便捷)
如果你想基于旧实例创建一个新实例，并只改变其中几个字段：
```rust
let user2 = User {
    email: String::from("another@example.com"),
    ..user1 // 剩余字段和 user1 一样。注意：这会引发所有权的 Move！user1 的 username 此时已被移走！
};
```

### 元组结构体 (Tuple Struct)
当你只想给元组起个名字以区分类型，但不关心字段名时：
```rust
struct Color(i32, i32, i32);
struct Point(i32, i32, i32);

let black = Color(0, 0, 0); // 虽然长得一样，但 Color 和 Point 是完全不同的类型
```

## 二、方法 (Methods) 与 `impl` 块

在 Java/C++ 中，方法写在 Class 内部。在 Rust 中，数据（`struct`）和行为（`impl`）是**分离**的。

```rust
struct Rectangle {
    width: u32,
    height: u32,
}

// implementation 块
impl Rectangle {
    // 1. 这是一个"方法"，它的第一个参数永远是 self 相关的
    fn area(&self) -> u32 { 
        self.width * self.height
    }

    // 2. 也可以修改 self 的数据，参数写 &mut self
    fn expand(&mut self, factor: u32) {
        self.width *= factor;
        self.height *= factor;
    }

    // 3. 这是一个"关联函数" (类似 static 方法)，它没有 self 参数
    fn square(size: u32) -> Rectangle {
        Rectangle {
            width: size,
            height: size,
        }
    }
}

fn main() {
    let mut rect1 = Rectangle { width: 30, height: 50 };
    
    println!("Area is {}", rect1.area()); // 方法调用用 .
    rect1.expand(2);
    
    let sq = Rectangle::square(10); // 关联函数调用用 ::
}
```

> **方法调用中的自动引用与解引用**：当你调用 `rect1.area()` 时，Rust 发现 `area` 需要 `&self`，于是它在底层自动把 `rect1` 转换成了 `&rect1`。这就是为什么你不用写 `(&rect1).area()`。

---
**下一篇：** `08-枚举与模式匹配（Enum & Match）.md`，体验吊打几乎所有语言的枚举系统。
