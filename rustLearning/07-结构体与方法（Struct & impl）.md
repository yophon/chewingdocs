# 07-结构体与方法（Struct & impl）

> 一句话导读：Rust 没有传统 class，但 `struct` 负责组织数据，`impl` 负责绑定行为，组合起来就是定义领域模型的核心工具。

学完所有权和借用后，就可以开始定义自己的类型了。Rust 的结构体不像面向对象语言里的类那样内置继承体系，它更强调数据结构、方法、trait 和组合。

## 核心心智模型

`struct` 回答“这个东西由哪些字段组成”，`impl` 回答“这个东西能做什么”。字段拥有各自的所有权，方法通过 `self`、`&self`、`&mut self` 表达是否消费、读取或修改实例。

这和前面所有权规则完全一致：

- `self`：方法拿走整个实例。
- `&self`：方法只读借用实例。
- `&mut self`：方法可变借用实例。

## 定义和实例化结构体

```rust
#[derive(Debug)]
struct User {
    active: bool,
    username: String,
    email: String,
    sign_in_count: u64,
}

fn main() {
    let mut user = User {
        active: true,
        username: String::from("alice"),
        email: String::from("alice@example.com"),
        sign_in_count: 1,
    };

    user.email = String::from("alice@company.com");

    println!("{:?}", user);
}
```

如果要修改字段，整个实例绑定必须是 `mut`。Rust 不支持只把某个字段标成 `mut`。

## 字段初始化简写

变量名和字段名一致时可以简写：

```rust
#[derive(Debug)]
struct User {
    username: String,
    email: String,
    active: bool,
}

fn build_user(username: String, email: String) -> User {
    User {
        username,
        email,
        active: true,
    }
}

fn main() {
    let user = build_user(String::from("bob"), String::from("bob@example.com"));
    println!("{:?}", user);
}
```

## 结构体更新语法与所有权

```rust
#[derive(Debug)]
struct User {
    username: String,
    email: String,
    active: bool,
}

fn main() {
    let user1 = User {
        username: String::from("alice"),
        email: String::from("alice@example.com"),
        active: true,
    };

    let user2 = User {
        email: String::from("new@example.com"),
        ..user1
    };

    println!("{:?}", user2);
    // println!("{:?}", user1);
}
```

`..user1` 会移动未显式指定的字段。这里 `username: String` 从 `user1` 移到 `user2`，所以 `user1` 不能再整体使用。`active: bool` 是 `Copy`，复制即可。

如果后面还要使用 `user1`，可以克隆需要的字段，或者重新设计数据流。

## 元组结构体和单元结构体

元组结构体适合给一组值起一个有意义的新类型名：

```rust
struct Color(u8, u8, u8);
struct Point(i32, i32, i32);

fn main() {
    let black = Color(0, 0, 0);
    let origin = Point(0, 0, 0);

    println!("rgb({}, {}, {})", black.0, black.1, black.2);
    println!("point({}, {}, {})", origin.0, origin.1, origin.2);
}
```

即使内部字段一样，`Color` 和 `Point` 也是不同类型。

单元结构体没有字段，常用于实现 trait 或表示一种类型标记：

```rust
struct AlwaysEqual;

fn main() {
    let _value = AlwaysEqual;
}
```

## 方法与 impl

```rust
#[derive(Debug)]
struct Rectangle {
    width: u32,
    height: u32,
}

impl Rectangle {
    fn area(&self) -> u32 {
        self.width * self.height
    }

    fn can_hold(&self, other: &Rectangle) -> bool {
        self.width >= other.width && self.height >= other.height
    }

    fn scale(&mut self, factor: u32) {
        self.width *= factor;
        self.height *= factor;
    }

    fn square(size: u32) -> Rectangle {
        Rectangle {
            width: size,
            height: size,
        }
    }
}

fn main() {
    let mut rect = Rectangle {
        width: 30,
        height: 50,
    };

    let small = Rectangle::square(10);

    println!("area = {}", rect.area());
    println!("can hold small = {}", rect.can_hold(&small));

    rect.scale(2);
    println!("scaled = {:?}", rect);
}
```

`area` 和 `can_hold` 只读，所以用 `&self`。`scale` 修改实例，所以用 `&mut self`。`square` 没有 `self` 参数，是关联函数，用 `Rectangle::square(10)` 调用。

## 方法调用的自动借用

调用 `rect.area()` 时，方法签名需要 `&self`，编译器会自动把它理解成 `Rectangle::area(&rect)`。这叫自动引用和解引用，让方法调用更自然。

但自动借用不会绕过借用规则。下面代码不合法：

```rust
#[derive(Debug)]
struct Counter {
    value: u32,
}

impl Counter {
    fn value(&self) -> u32 {
        self.value
    }

    fn inc(&mut self) {
        self.value += 1;
    }
}

fn main() {
    let mut counter = Counter { value: 0 };
    let view = &counter;

    counter.inc();

    println!("{}", view.value());
}
```

错误类似：

```text
error[E0502]: cannot borrow `counter` as mutable because it is also borrowed as immutable
```

修正：先用完不可变引用，再可变调用。

```rust
#[derive(Debug)]
struct Counter {
    value: u32,
}

impl Counter {
    fn value(&self) -> u32 {
        self.value
    }

    fn inc(&mut self) {
        self.value += 1;
    }
}

fn main() {
    let mut counter = Counter { value: 0 };

    let view = &counter;
    println!("{}", view.value());

    counter.inc();
    println!("{}", counter.value());
}
```

## 可编译综合示例

```rust
#[derive(Debug)]
struct BankAccount {
    owner: String,
    balance: i64,
}

impl BankAccount {
    fn new(owner: String) -> BankAccount {
        BankAccount { owner, balance: 0 }
    }

    fn deposit(&mut self, amount: i64) {
        if amount > 0 {
            self.balance += amount;
        }
    }

    fn withdraw(&mut self, amount: i64) -> bool {
        if amount > 0 && self.balance >= amount {
            self.balance -= amount;
            true
        } else {
            false
        }
    }

    fn summary(&self) -> String {
        format!("{} has {}", self.owner, self.balance)
    }
}

fn main() {
    let mut account = BankAccount::new(String::from("Alice"));

    account.deposit(100);
    let ok = account.withdraw(30);

    println!("withdraw ok = {ok}");
    println!("{}", account.summary());
}
```

这个例子展示了结构体字段所有权、构造函数、可变方法、只读方法和返回新字符串。

## 常见编译器错误与修正

### 错误 1：打印结构体缺少 Debug

```rust
struct User {
    name: String,
}

fn main() {
    let user = User {
        name: String::from("alice"),
    };

    println!("{:?}", user);
}
```

错误：

```text
error[E0277]: `User` doesn't implement `Debug`
```

修正：

```rust
#[derive(Debug)]
struct User {
    name: String,
}
```

### 错误 2：修改不可变实例字段

```text
error[E0594]: cannot assign to field, as binding is not mutable
```

修正：`let mut user = ...`。如果不希望调用方随意改字段，就不要暴露字段，后续模块章节会讲可见性。

### 错误 3：结构体更新后继续使用旧实例

```text
error[E0382]: borrow of partially moved value
```

修正：避免移动字段，必要时克隆字段，或者让旧实例不再被使用。

## 工程判断

结构体不是字段越多越好。好的结构体应该表达一个稳定概念，而不是把临时变量硬塞在一起。

方法签名要克制：

- 能 `&self` 就不要 `&mut self`。
- 只有真正消费实例时才用 `self`。
- 构造逻辑复杂时，用关联函数如 `new`、`from_config`。
- 校验规则应该靠方法维护，避免业务代码到处直接改字段。

Rust 没有继承，通常用组合和 trait 表达复用。结构体负责数据边界，trait 负责行为抽象，这是后面写大型 Rust 项目的基础。

## 结尾总结

`struct` 和 `impl` 是 Rust 建模的基本单元。字段遵守所有权规则，方法通过 `self` 的不同形式表达访问权限。理解这一点后，你会发现 Rust 的“没有 class”不是缺失，而是一种更清晰的拆分：数据是数据，行为是行为，权限写在签名里。

---

**下一篇：** `08-枚举与模式匹配（Enum & Match）.md`，学习 Rust 最强大的代数数据类型。
