# AST 设计

词法分析把字符流变 token,递归下降把 token 列表变成一棵树——但 **AST 长什么样**才是决定后续所有阶段(求值 / 类型检查 / 优化 / 代码生成)写起来顺不顺手的关键。把 AST 设计成一堆类层级 + visitor 方法,你以后每加一个 pass 都要在十几个 class 里到处写 `visitXxx`;设计成 discriminated union(代数数据类型 ADT),编译器替你做穷举检查,加节点忘了处理立刻红线。**这一篇不解决"怎么写 AST 节点",而是解决"用什么形状的 AST"——选错了,后面 15 篇都难受**。

> 一句话先记住:**AST = 把代码句法结构做成一棵不可变树**,Mochi 用 **TS discriminated union** 而不是 OOP class 层级——`switch (node.kind)` + exhaustive check 比 visitor 模式更轻、更安全、加 pass 更快。

---

## 一、AST 比 token 高一层

Token 是"字符流的离散化":`[LET, IDENT("x"), EQ, NUM(1), PLUS, NUM(2), STAR, NUM(3)]`——它**不知道结构**,看不出 `2 * 3` 应该先算。

AST 是"句法的树化":

```
       Let
       / \
    "x"   Binary(+)
           / \
        Lit(1) Binary(*)
                / \
             Lit(2) Lit(3)
```

**AST 携带优先级、结合性、嵌套**——求值器只要递归走这棵树,答案就出来了。

没有 AST 直接在 token 上算 = **每个 pass 都得重新解析一遍**——上世纪 60 年代 BASIC 解释器的做法,慢、错误信息差,**现代语言全部走 AST**。

---

## 二、Mochi 的 AST:用 ADT 不用 class 层级

经典 OOP 教材教你这么写:

```ts
abstract class Expr {
  abstract accept<R>(visitor: ExprVisitor<R>): R;
}
class Binary extends Expr { ... }
class Literal extends Expr { ... }
// 然后 10 个 visitXxx
```

**别这么写**。Mochi 用 TS 的 discriminated union:

```ts
type Expr =
  | { kind: "Literal";    value: number | string | boolean | null }
  | { kind: "Identifier"; name: string }
  | { kind: "Binary";     op: BinOp; left: Expr; right: Expr }
  | { kind: "Unary";      op: UnOp;  operand: Expr }
  | { kind: "Call";       callee: Expr; args: Expr[] }
  | { kind: "Get";        object: Expr; name: string }                 // a.b
  | { kind: "Set";        object: Expr; name: string; value: Expr }    // a.b = v
  | { kind: "Function";   params: string[]; body: Stmt[] };

type Stmt =
  | { kind: "Let";    name: string; init: Expr }
  | { kind: "Var";    name: string; init: Expr }
  | { kind: "Assign"; target: string; value: Expr }
  | { kind: "If";     cond: Expr; then: Stmt[]; else?: Stmt[] }
  | { kind: "While";  cond: Expr; body: Stmt[] }
  | { kind: "For";    name: string; from: Expr; to: Expr; body: Stmt[] }
  | { kind: "Return"; value?: Expr }
  | { kind: "Block";  body: Stmt[] }
  | { kind: "Class";  name: string; methods: FunctionDecl[] }
  | { kind: "Import"; path: string };
```

每个节点都是普通的、不可变的 JS 对象。求值就是:

```ts
function evalExpr(e: Expr, env: Env): Value {
  switch (e.kind) {
    case "Literal":    return e.value;
    case "Identifier": return env.lookup(e.name);
    case "Binary":     return evalBinary(e, env);
    // ...
  }
}
```

---

## 三、画一张图:`let x = 1 + 2 * 3` 解析后

```
            Let { name: "x" }
                   │
                 init
                   ↓
           Binary { op: "+" }
             /          \
          left          right
           ↓              ↓
       Literal(1)   Binary { op: "*" }
                     /          \
                   left         right
                    ↓             ↓
                Literal(2)    Literal(3)
```

**注意**:Pratt parser 已经把优先级吃进了树形——`*` 比 `+` 紧,所以 `2 * 3` 是 `+` 的右子树;求值时**先递归右子树拿到 6,再加左子树的 1**,自然得到 7。**优先级不在求值器里,在 parser 里**。

---

## 四、ADT vs Visitor:为什么 ADT 赢

OOP visitor 模式的核心问题:**加 pass 容易,加节点难**——加节点要改所有 visitor 的接口(违反 OOP 的开闭原则,但事实如此)。

ADT + switch 反过来:**加节点容易,加 pass 也容易**——只要写新函数,加 case,编译器替你检查穷举:

```ts
function evalExpr(e: Expr): Value {
  switch (e.kind) {
    case "Literal":    return e.value;
    case "Binary":     return ...;
    case "Identifier": return ...;
    // 漏掉 Unary,TS 编译报错:Not all code paths return a value
  }
}
```

这个**穷举检查(exhaustive check)** 是 OOP visitor 拿不到的——visitor 漏 case 只是默认走到父类的 `visitExpr` 抛异常,**运行时才发现**。TS / Rust 的 ADT 是**编译时发现**。

| 维度 | OOP class + visitor | ADT + switch |
| --- | --- | --- |
| 加节点 | 改所有 visitor | 加一个 case |
| 加 pass | 新 visitor 类 | 新函数 |
| 漏 case | 运行时炸 | 编译时报错 |
| 可读性 | 跳类定义 | 顺序读完 |
| 共享数据 | 字段散落各 class | 节点 = plain object |

Rust 的 enum 也是 ADT(sum type 的语言原生支持),所以 rustc 的 AST 用 enum 写得非常顺。

---

## 五、Visitor 模式什么时候真有用

ADT 不是银弹——**Visitor 在三种场景反而更合适**:**AST 节点定义在第三方库**(你只能写 visitor 不能加 case)、**大量"对每种节点做同一件事"的 pass**(pretty printer / serializer——visitor 提供模板方法)、**多语言交互**(JNI / FFI,class 层级跨语言好映射)。

但 Mochi 是自家代码 + TS 宿主,**这三条都不成立,所以 ADT 完胜**。多 pass(求值 / 类型检查 / 优化)在 ADT 上**写成多个独立函数,各自 switch**——比挂在节点上的 visitor 方法可测、可改、可删。

---

## 六、工业级是怎么做的

| 项目 | AST 文件 | 形状 |
| --- | --- | --- |
| V8 | `src/ast/ast.h` | OOP class 层级 + visitor(C++,无 ADT,只能这么写) |
| rustc | `compiler/rustc_ast/src/ast.rs` | Rust enum + match(ADT 原生支持) |
| CPython | `Include/internal/pycore_ast.h` | 用 ASDL DSL 生成 C struct + tag(手工模拟 ADT) |
| TypeScript | `src/compiler/types.ts` 的 `SyntaxKind` 枚举 | TS discriminated union(和 Mochi 一样) |
| Lua | `src/lparser.c`(无独立 AST) | **直接边解析边生成字节码**,跳过 AST 这一层 |

Lua 的"跳过 AST"是个有趣的极端——**它的解析器和编译器是同一个函数**,优势是省内存(嵌入式场景),代价是不能做基于 AST 的优化 / 类型检查。**Mochi 不学**,我们要先把 AST 这一层吃透,后面 24 篇再编译到字节码。

CPython 的 ASDL(Abstract Syntax Definition Language)值得一看——一个 mini DSL 描述所有节点,Python 启动时跑脚本生成 C 头文件,**本质就是用工具生成 ADT**。

---

## 七、Mochi 这里偷懒了

| 偷懒点 | 真实语言怎么做 |
| --- | --- |
| 节点不带类型注解槽位 | TS / Rust 每个 Expr 节点有 `type?: Type` 字段,类型检查 pass 填充(18 篇加) |
| 节点不带 source span | 真实语言每个节点带 `{ file, line, col, end }`,错误信息和 LSP 用(15 篇补) |
| 不做 lossless AST(保留注释 / 空格) | rust-analyzer 的 rowan、TS 的 trivia 都做了——**LSP / 格式化器必需** |
| 节点是 mutable plain object | rustc / Roslyn 做了"persistent AST",改一个节点共享其他子树——增量编译才需要 |
| 不分 expression / statement 优先级 | TS / Babel 的 `ExpressionStatement` wrapper——Mochi 语法简单不用 |

**核心立场**:AST 是后续所有 pass 的"共享数据结构",**早期偷懒是对的**——等到 13 篇控制流、14 篇闭包、16 篇类、18 篇类型时,自然会回来给节点加字段。**不要一开始就把所有字段塞满,会污染心智模型**。

---

下一篇:`11-表达式求值.md`,讲清楚 Mochi 第一次"动起来"——`evaluate(expr, env) → Value` 怎么递归下降在 AST 上跑,**短路语义** / **真值语义** / **隐式转换的坑**,以及为什么 `"3" + 4` 在 JS 是 `"34"`、在 Python 报错——Mochi 选 Python 这一条路。
