# 13-生命周期（Lifetimes）

> 一句话导读：生命周期不是让值活得更久的魔法，而是用来说明引用之间“谁不能比谁活得久”的关系。

生命周期是 Rust 最容易吓退新手的概念，因为它看起来像一套额外语法：`'a`、`&'a str`、`struct Foo<'a>`。但它的目标非常单一：防止悬垂引用。

你可以把生命周期标注理解成“借用合同”。它不创建数据、不延长数据生命，也不改变销毁时机；它只是把引用和被引用数据的有效范围讲清楚。

## 一、机制心智：引用必须短于数据

引用不能比它指向的数据活得更久。这个规则在所有语言里都重要，只是 Rust 在编译期强制检查。

```rust
fn main() {
    let x = 5;
    let r = &x;

    println!("r={r}");
}
```

上面没问题，因为 `x` 活得比 `r` 久。

下面这种写法会产生悬垂引用，所以 Rust 不允许：

```rust
fn main() {
    // let r;
    //
    // {
    //     let x = 5;
    //     r = &x;
    // }
    //
    // println!("{r}");

    let x = 5;
    let r = &x;
    println!("{r}");
}
```

修正思路不是给 `r` 加生命周期标注，而是让被引用的数据 `x` 活得足够久，或者直接转移所有权。

## 二、生命周期标注描述关系

大多数引用生命周期可以被编译器自动推断。你需要手写生命周期，通常是因为函数返回引用，而编译器无法判断返回值来自哪个参数。

```rust
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() >= y.len() {
        x
    } else {
        y
    }
}

fn main() {
    let a = String::from("short");
    let b = String::from("a much longer string");

    let result = longest(&a, &b);
    println!("{result}");
}
```

`'a` 的意思不是“让 x 和 y 都活到一样久”，而是：返回的引用不能比 `x` 和 `y` 中较短的那个活得更久。

这个函数签名表达的是关系：

- `x` 是某个生命周期里的 `&str`。
- `y` 也是同一个生命周期约束下的 `&str`。
- 返回值也在这个共同约束下有效。

## 三、常见真实场景 1：返回输入的一部分

生命周期最常见的真实用法，是函数不创建新数据，只返回输入数据中的一段。

```rust
fn first_word(input: &str) -> &str {
    input.split_whitespace().next().unwrap_or("")
}

fn main() {
    let line = String::from("GET /index.html HTTP/1.1");
    let method = first_word(&line);

    println!("method={method}");
}
```

这个函数不需要手写生命周期，因为 Rust 有省略规则：一个输入引用对应一个输出引用时，输出默认来自输入。

如果返回值可能来自多个输入，就要标注：

```rust
fn choose_non_empty<'a>(primary: &'a str, fallback: &'a str) -> &'a str {
    if primary.is_empty() {
        fallback
    } else {
        primary
    }
}

fn main() {
    let user_input = String::new();
    let default_name = String::from("guest");

    let name = choose_non_empty(&user_input, &default_name);
    println!("{name}");
}
```

这类函数的工程价值很大：避免分配新的 `String`，直接借用原始输入的一部分。

## 四、常见真实场景 2：结构体保存引用

结构体如果保存引用，必须声明这个引用和结构体实例之间的生命周期关系。

```rust
#[derive(Debug)]
struct RequestLine<'a> {
    method: &'a str,
    path: &'a str,
}

fn parse_request_line(line: &str) -> Option<RequestLine<'_>> {
    let mut parts = line.split_whitespace();
    let method = parts.next()?;
    let path = parts.next()?;

    Some(RequestLine { method, path })
}

fn main() {
    let raw = String::from("GET /users HTTP/1.1");
    let parsed = parse_request_line(&raw).expect("valid request line");

    println!("{parsed:?}");
}
```

`RequestLine<'a>` 不拥有字符串内容，它只是借用 `raw` 的两段。因此 `parsed` 不能比 `raw` 活得更久。

这在解析器、编译器、协议处理、配置读取里很常见。你可以用生命周期换取更少分配和更高性能。

## 五、真实场景 3：选择借用还是拥有

并不是所有结构体都应该保存引用。很多业务结构体更适合拥有数据。

```rust
#[derive(Debug)]
struct UserView<'a> {
    name: &'a str,
}

#[derive(Debug)]
struct UserRecord {
    name: String,
}

fn main() {
    let raw = String::from("Ada");
    let view = UserView { name: &raw };
    let record = UserRecord { name: raw.clone() };

    println!("{view:?}");
    println!("{record:?}");
}
```

经验判断：

- 临时视图、解析结果、零拷贝读取：可以保存引用。
- 长期存储、跨线程传递、放入缓存、异步任务持有：通常保存拥有型数据，如 `String`、`Vec<T>`、`Arc<T>`。

很多生命周期问题不是语法问题，而是所有权设计问题。你想让一个值被长期保存，就不要让它借用短期输入。

## 六、方法中的生命周期省略

Rust 有生命周期省略规则，所以很多方法不用写 `'a`。

```rust
struct Text<'a> {
    content: &'a str,
}

impl<'a> Text<'a> {
    fn first_line(&self) -> &str {
        self.content.lines().next().unwrap_or("")
    }
}

fn main() {
    let content = String::from("line1\nline2");
    let text = Text { content: &content };

    println!("{}", text.first_line());
}
```

方法里如果有 `&self`，返回引用通常默认和 `self` 的借用相关联。只有关系变复杂时才需要手写。

## 七、`'static`：整个程序期间有效

`'static` 表示引用指向的数据可以活到程序结束。字符串字面量就是典型例子。

```rust
fn app_name() -> &'static str {
    "biglearning"
}

fn main() {
    println!("{}", app_name());
}
```

不要把 `'static` 当成解决生命周期报错的万能药。函数要求 `&'static str`，意思是它只接受能活到程序结束的字符串引用。

```rust
fn log_static(message: &'static str) {
    println!("{message}");
}

fn main() {
    log_static("literal is static");

    let dynamic = String::from("created at runtime");
    // log_static(&dynamic); // dynamic 不是 'static 引用

    println!("{dynamic}");
}
```

如果你的数据来自运行时输入，通常不应该强行要求 `&'static str`。改成 `&str`、`String` 或 `Arc<str>` 更合理。

## 八、常见错误与修正

### 1. 返回局部 String 的引用

```rust
fn build_name() -> String {
    let name = String::from("Ada");
    name
}

fn main() {
    let name = build_name();
    println!("{name}");
}
```

错误写法通常是 `fn build_name() -> &str`，然后返回 `&name`。函数结束时 `name` 被销毁，引用会悬垂。修正方式是返回拥有型 `String`。

### 2. 结构体保存了短生命周期引用

```rust
#[derive(Debug)]
struct Holder {
    value: String,
}

fn main() {
    let holder;

    {
        let text = String::from("temporary");
        holder = Holder { value: text };
    }

    println!("{holder:?}");
}
```

如果数据要离开内部作用域，就让结构体拥有它。不要保存 `&text`。

### 3. 用同一个生命周期绑死不该绑的参数

```rust
fn return_left<'a>(left: &'a str, _right: &str) -> &'a str {
    left
}

fn main() {
    let long_lived = String::from("left");
    let result;

    {
        let short_lived = String::from("right");
        result = return_left(&long_lived, &short_lived);
    }

    println!("{result}");
}
```

如果返回值只来自 `left`，就不要把 `right` 也标成同一个 `'a`。生命周期标注越精确，调用者越自由。

## 九、工程使用边界

适合使用引用和生命周期：

- 高频解析，想避免复制字符串。
- 数据天然由上层拥有，下层只是临时查看。
- API 明确是同步、短期、只读处理。
- 性能敏感路径中大量切片操作。

更适合拥有型数据：

- 结构体要长期保存。
- 数据要跨线程、跨异步任务、放入队列或缓存。
- 生命周期标注开始污染大量业务类型。
- 你需要独立于输入释放或修改数据。

实战建议：

- 先让数据所有权清晰，再考虑借用优化。
- 不要为了少一次 `clone` 把整个系统拖进复杂生命周期。
- 库的底层解析模块可以用生命周期做零拷贝，业务层 DTO 通常用拥有型字段。
- 遇到生命周期报错，先画出谁拥有数据、谁借用数据、引用使用到哪里。

## 十、结尾总结

生命周期的核心不是语法，而是关系：返回引用来自哪里？结构体里的引用依赖谁？这个引用会不会比数据活得更久？当你把这些关系讲清楚，`'a` 只是标注工具。真实工程里，生命周期最适合零拷贝、短期视图和解析场景；一旦数据要长期保存或跨边界移动，拥有型数据往往更稳。

---
**下一篇：** `14-闭包与迭代器.md`，进入闭包、函数式流水线和惰性计算。
