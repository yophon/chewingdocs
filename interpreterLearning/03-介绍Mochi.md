# 介绍 Mochi

每个解释器系列都需要一门玩具语言来承载——《Crafting Interpreters》用 Lox,《Writing An Interpreter in Go》用 Monkey,本系列用 **Mochi**(麻糬,日式糯米团)。**为什么取这个名字**:软、糯、Q弹、能塞各种馅料——动态类型让它"软",一等公民函数和闭包让它"Q弹",类和模块让它能"塞各种馅料"。**Mochi 不追求生产可用**,所有"为了简单而省略"的地方都会明确标注「Mochi 这里偷懒了 / 真实语言会怎么做」——但**它要能跑、能 REPL、能在字节码 VM 上比树遍历版本快 5-10 倍**。**这一篇把 Mochi 的语法、设计取舍、路线图一次性钉死,后面 28 篇都在这门语言上叠加,不再改动**。

> 一句话先记住:**Mochi = 动态类型 + 一等函数 + 闭包 + 类 + 模块**,语法介于 Python 和 JS 之间——**01-19 篇是树遍历版本,20-25 篇切换字节码 VM,26-27 篇加 GC**,一门越长越大的玩具,**不是 30 个孤立 demo**。

---

## 一、设计取舍:做什么、不做什么

**做的事**(每一项都对应后面某几篇):

| 特性 | 篇数 | 备注 |
|---|---|---|
| 动态类型 + 自动内存管理 | 11 / 26-27 | 不引入静态类型检查,运行时报错 |
| 一等公民函数 + 匿名函数 | 14 | `let f = fn(x){...}` 能赋值、传参、返回 |
| 词法作用域 + 闭包 | 12, 14 | 强制词法,**不做 dynamic scope** |
| if / while / for / break / continue | 13 | `for i in 0..10` 风格 |
| 类 + 单继承 + super | 16 | **不做多重继承,不做原型** |
| 模块系统(`import "math"`) | 17 | 文件即模块,**不做 namespace 嵌套** |
| try / catch + throw | 13 | 异常作为非局部跳转 |
| 字节码 VM | 20-25 | 栈式,后面对比寄存器式 |
| Mark-sweep GC | 26 | 简单三色,**不做分代** |

**坚决不做的事**(留白,真实工业语言才需要):

- **并发**——不做协程、不做 channel、不做线程,**Mochi 单线程**(GC 写一遍已经够大了)
- **静态类型推导**——不写 Hindley-Milner,18 篇做心智层的对照,**不实现**
- **泛型 / Trait / 所有权**——这是 Rust 那个量级的工程,**远超玩具语言范畴**
- **JIT**——28 篇讲心智,但**不在 Mochi 上实现**(JIT 工程量 = 解释器 × 3)
- **完整标准库**——只够跑 demo 的 `math` / `string` / `io`,**不要写 Node 那套**

**为什么这么砍**:玩具语言的死亡陷阱就是**功能蔓延**——加完类想加 trait,加完 trait 想加泛型,半年没写完一个 GC。**Mochi 锁定 30 篇打完,所有"看起来很想加"的特性都拒绝**。

---

## 二、完整语法速览

整门语言用这一段示例就能讲完:

```mochi
// 字面量与变量
let x = 10              // 不可变(默认)
var y = "hello"         // 可变
let arr = [1, 2, 3]
let obj = { name: "mochi", age: 1 }

// 函数(一等公民)
fn add(a, b) { return a + b }
let inc = fn(x) { return x + 1 }   // 匿名函数

// 控制流
if x > 0 { print("pos") } else { print("neg") }
while x > 0 { x = x - 1 }
for i in 0..10 { print(i) }

// 闭包(捕获 by reference)
fn make_counter() {
  var n = 0
  return fn() { n = n + 1; return n }
}
let c = make_counter()
print(c())   // 1
print(c())   // 2

// 类
class Point {
  init(x, y) { this.x = x; this.y = y }
  distance() { return sqrt(this.x * this.x + this.y * this.y) }
}

// 继承
class ColoredPoint < Point {
  init(x, y, color) { super.init(x, y); this.color = color }
}

// 模块
import "math"
print(math.sqrt(2))

// 异常
try {
  risky()
} catch (e) {
  print(e.message)
}
```

**几个关键决策**:

1. **`let` 默认不可变,`var` 可变**——和 Rust / Swift 一致,**鼓励默认不变**(这是过去 20 年语言设计共识)
2. **大括号 `{}` 做 block**——不学 Python 的缩进,**Python 缩进让 lexer 复杂 3 倍**(05 篇会讲)
3. **`fn` 而不是 `function` / `def`**——3 字符短关键字,**Rust 取 `fn` 是有道理的**
4. **类用 `<` 表示继承**——抄 Lox,简洁,`class CP < Point` 比 `extends Point` 短
5. **没有分号**——换行即语句边界,**复杂 case 用 `;` 兜底**(避免 JS 走过的 ASI 弯路)

---

## 三、跟 Lox / Monkey / Lua 的对比

四门玩具/嵌入式语言放一起,Mochi 的位置一目了然:

| 维度 | Lox(CI) | Monkey(WAIIG) | Lua | **Mochi** |
|---|---|---|---|---|
| 宿主语言 | Java / C | Go | C | **TypeScript / Rust** |
| 类型系统 | 动态 | 动态 | 动态 | **动态** |
| 类支持 | 有 | 无 | 无(table 模拟) | **有(单继承)** |
| 闭包 | 有 | 有 | 有(upvalue) | **有(upvalue)** |
| 模块 | 无 | 无 | `require` | **有(`import`)** |
| 异常 | 无 | 无 | `pcall` | **有(`try/catch`)** |
| 树遍历版 | jlox | Monkey | 无 | **01-19 篇** |
| 字节码版 | clox | (《Writing A Compiler》) | 主版本 | **20-25 篇** |
| GC | clox 有 | 无 | 增量 mark-sweep | **简单 mark-sweep(26 篇)** |
| 生产可用 | 否 | 否 | **是** | 否 |

**Mochi 相对其他玩具语言的差异**:

- 比 **Lox** 多了模块和异常(更接近现代脚本语言)
- 比 **Monkey** 多了类、字节码 VM、GC(Monkey 全树遍历,性能讨论少)
- 比 **Lua** 少了协程、寄存器 VM、生产级增量 GC(Lua 是工业语言,本系列只取它的实现思路当参考)

**所以**:**Mochi ≈ Lox 的脚本现代化版本 + Monkey 的章节结构 + Lua 的实现指针**。

---

## 四、路线图

30 篇分六层,Mochi 的形态在第三层第一次跑起来:

```
01-04  心智层    无 Mochi,只画图、讲设计、搭骨架
05-09  前端     Mochi 能 lex / parse,但还不会运行
                ↓
10-15  树遍历   Mochi 第一次能 print Hello World、跑函数、闭包
16-19  进阶语义 Mochi 有类、模块、异常 ── 功能 freeze
                ↓ 此后语法和语义不再变化,只换实现
20-25  字节码VM Mochi 后端切换:同一份测试用例,速度 ×5-10
26-27  GC      Mochi 不再泄漏,能跑大量分配的脚本
28-30  剖析    不实现,讲清楚 JIT 心智 + 真实语言对照表
```

**每一篇都要在 Mochi 仓库提交代码**:

- 不动手过的篇不算完成
- 每篇都有对应 git tag(`v01-overview`、`v14-closure`、`v22-vm-loop`...)
- `pnpm test` 全过才能打勾

仓库地址 `github.com/.../mochi-lang`(实际链接随仓库一起公开)。**16 篇之后语法 freeze**——意味着写到 22 篇调字节码 VM 时,**不会再回去改 Mochi 的语法**,**只是换一个后端**。这是写本系列最关键的纪律:**语言定义一次,实现可以换好几次**。

---

## 五、"偷懒了"的边界

Mochi 是玩具,有些地方会主动砍掉。**所有偷懒处都标注**,避免读者以为这就是真实工业实现:

| 地方 | Mochi 偷懒做法 | 真实语言会做什么 |
|---|---|---|
| 数字类型 | 全部 `number`(JS double) | Python 分 int / float / bignum,JS 也有 BigInt |
| 字符串 | UTF-8 byte 数组 | Swift 走 Unicode grapheme cluster |
| 错误恢复 | parser 遇错就停 | rustc / TS 做 panic mode 继续报多个错 |
| GC | 单线程 stop-the-world mark-sweep | V8 / JVM 分代 + 增量 + 并发 |
| 字符串字面量 | 不做 string interning | Java / Python 都 intern 短字符串 |
| 整数溢出 | 直接溢出(沿用 JS 行为) | Rust debug panic、Python bignum 自动扩展 |
| 闭包捕获 | 直接捕获环境引用 | V8 做逃逸分析,多数 closure 在栈上 |
| 模块循环依赖 | 直接报错 | CommonJS 返回半初始化对象,ESM 用占位符 |
| 浮点 NaN / Infinity | 沿用 JS 行为 | Python 区分 NaN / Inf 的语义边界 |

**读完每一篇,你应该清楚三件事**:

- 这一篇做了什么
- **省略了什么**(下一句就接「Mochi 这里偷懒了」)
- **工业级是怎么做的**(给具体文件路径或类名)

这三件事做到了,这门玩具语言就**值得花 30 篇的时间**。

---

下一篇:`04-项目骨架与REPL.md`,把 Mochi 仓库的目录结构、测试驱动框架、错误位置追踪、REPL 主循环搭起来——**一开始就把基建搭对,后面 25 篇不用回头改**。
