# Pratt 解析器

08 写完递归下降,你会看到一个事实:`expr → assign → logicOr → ... → unary → call → primary` 10 层楼梯,每层就一个函数,每个函数就调下一层。加运算符要决定它在第几层、然后**插一层函数**;改优先级要重排函数嵌套;同一个 token 在前缀位置和中缀位置(`-x` vs `a-b`,`(group)` vs `f(arg)`)要分别写一份。1973 年 MIT 的 Vaughan Pratt 在 POPL 上发的 4 页论文《Top Down Operator Precedence》**把这 10 层楼梯压成一个 30 行循环**,过去 50 年被 Crockford / Munificent / rustc / Zig / TypeScript 反复重新发现。这一篇必须画清楚:**绑定能力(binding power)的数字怎么"碰撞",决定运算符往左吃还是往右吃**。

> 一句话先记住:**Pratt = 给每个运算符一个 bp(binding power)数字 + 一个 while 循环 + 两种回调(nud 前缀 / led 中缀)**。**前缀 / 中缀 / 后缀全部统一**,这是表达式解析过去 50 年里没人超过的最优解。

---

## 一、那 10 层楼梯丑在哪

复习 08 留下的问题:`expr` 一路调到 `primary`,**10 个函数一个调一个**。代价三件:**加运算符要插一层**(`%` 跟 `*` 同级也要新写函数)、**改优先级要重排嵌套**、**同 token 两种意思要写两份代码**(`(` 既是分组又是调用)。根因:**优先级被隐式编码进调用栈深度**,结构本身就是问题。

---

## 二、binding power:用一个数字编码一切

Pratt 的洞察是把优先级和结合性**全压进一个数字 `bp`**。**bp 越大,运算符越"贪",越紧地抱住两边操作数**——`*` bp=8 比 `+` bp=7 大,所以 `a + b * c` 里 `*` 把 b、c 吸过去。

| 运算符 | bp | 结合性 |
| --- | --- | --- |
| `=` | 1 | 右 |
| `?:` | 2 | 右 |
| `\|\|` | 3 | 左 |
| `&&` | 4 | 左 |
| `== !=` | 5 | 左 |
| `< > <= >=` | 6 | 左 |
| `+ -` | 7 | 左 |
| `* /` | 8 | 左 |
| 一元 `-x !x` | 9 | 前缀 |
| `( [ .` 调用/索引/成员 | 10 | 后缀 |

这张表就是 07 那张优先级表加一列 bp 数字。

---

## 三、nud 与 led:统一前缀和中缀

每个 token 注册两个回调,可以只注册一种:

**nud**(null denotation,**"无左操作数时"** 的解析逻辑,即前缀位置):`NUMBER`/`IDENT` 返回字面量;`-` 调 `parseExpr(UNARY)` 后变 Unary;`(` 调 `parseExpr(0)` 加 `consume(")")`,返回内部表达式。

**led**(left denotation,**"已有左操作数时"** 的解析逻辑,即中缀/后缀位置):`+ - * /` 是 `parseExpr` 后变 Binary;`(` 这次是函数调用变 Call;`[` 索引;`.` 成员;`?` 三元;`=` 赋值。

**最骚的地方**:`(` 同一个 token,**前缀位置走 nud(分组),中缀位置走 led(调用)**——递归下降里要写两段独立代码,Pratt 里就是查表自动分派。

---

## 四、核心算法 30 行

```
parseExpr(minBp):
  left = nud(advance())             # 当前 token 必有 nud,否则报错
  while bp(peek) > minBp:            # 右边 bp 比我大,让它吃
    op = advance()
    right = parseExpr(bp(op))        # 左结合;右结合改传 bp(op) - 1
    left = Binary(left, op, right)
  return left
```

**算法精髓**:**递归出口由 minBp 控制"吃到哪儿停"**——传 `bp(op)` 后续相同优先级运算符不能再进(左结合),传 `bp(op) - 1` 能继续(右结合)。

---

## 五、bp 怎么"碰撞"决定结合方向(必看)

三个例子。bp:`+`=7,`*`=8,`^`=9。

**例 1:`1 + 2 * 3`,`*` 应该先吃**

```
parseExpr(0): left=1, peek=+, 7>0 YES → consume +
  parseExpr(7): left=2, peek=*, 8>7 YES → consume *
    parseExpr(8): left=3, EOF → return 3
  return (2*3)
return 1 + (2*3)   ✓
```

**例 2:`1 + 2 + 3`,左结合的关键**

```
parseExpr(0): left=1, +, consume +
  parseExpr(7): left=2, peek=+, 7>7? NO → return 2    ← 7 不大于 7,停!
left=(1+2), peek=+, 7>0 YES → consume +
  parseExpr(7): left=3 → 3
return ((1+2) + 3)   ✓ 左结合
```

**例 3:`1 ^ 2 ^ 3`,右结合传 bp - 1**

```
parseExpr(0): left=1, ^, consume ^
  parseExpr(8):                                       ← 右结合关键:传 9-1=8
    left=2, peek=^, 9>8? YES → consume ^               ← 8<9,允许再进
      parseExpr(8): left=3 → 3
    return (2^3)
return (1 ^ (2^3))   ✓ 右结合
```

**关键洞察**:左结合递归传 `bp(op)`,同级**不能再进**;右结合传 `bp(op) - 1`,同级**能再进**。**一个数字差 1 完整编码了结合性**。

---

## 六、给 Mochi 写 Pratt 表达式

```typescript
const BP = { ASSIGN:1, TERNARY:2, OR:3, AND:4, EQ:5, CMP:6,
             ADD:7, MUL:8, UNARY:9, CALL:10 }

// 中缀 token → [bp, 是否右结合]
const INFIX: Record<string, [number, boolean]> = {
  "=":[1,true],   "?":[2,true],
  "||":[3,false], "&&":[4,false], "==":[5,false], "!=":[5,false],
  "<":[6,false],  ">":[6,false],  "+":[7,false],  "-":[7,false],
  "*":[8,false],  "/":[8,false],
  "(":[10,false], "[":[10,false], ".":[10,false],
}

parseExpr(minBp = 0): Expr {
  let left = this.nud(this.advance())
  while (true) {
    const info = INFIX[this.peek().lexeme]
    if (!info || info[0] <= minBp) break
    const op = this.advance().lexeme
    left = this.led(op, left, info[1] ? info[0] - 1 : info[0])  // 右结合→bp-1
  }
  return left
}

nud(t: Token): Expr {
  if (t.type === NUMBER || t.type === STRING) return { type: "Lit", value: t.literal }
  if (t.type === IDENT) return { type: "Var", name: t.lexeme }
  if (t.type === MINUS || t.type === BANG)
    return { type: "Unary", op: t.lexeme, expr: this.parseExpr(BP.UNARY) }
  if (t.type === LPAREN) {
    const e = this.parseExpr(0); this.consume(RPAREN, "expected ')'"); return e
  }
  throw this.error(t, `unexpected '${t.lexeme}'`)
}

led(op: string, left: Expr, rbp: number): Expr {
  if (op === "(") {                                   // 函数调用
    const args = this.parseArgs(); this.consume(RPAREN, "expected ')'")
    return { type: "Call", callee: left, args }
  }
  if (op === "[") {                                   // 索引
    const idx = this.parseExpr(0); this.consume(RBRACKET, "expected ']'")
    return { type: "Index", obj: left, idx }
  }
  if (op === ".")                                     // 成员
    return { type: "Member", obj: left, name: this.consume(IDENT, "name").lexeme }
  if (op === "?") {                                   // 三元
    const thenE = this.parseExpr(0); this.consume(COLON, "expected ':'")
    return { type: "Ternary", cond: left, then: thenE, else: this.parseExpr(rbp) }
  }
  if (op === "=")                                     // 赋值(右结合)
    return { type: "Assign", target: left, value: this.parseExpr(rbp) }
  return { type: "Binary", left, op, right: this.parseExpr(rbp) }   // 二元
}
```

**约 40 行覆盖优先级、结合性、前缀、二元、三元、调用 / 索引 / 成员、赋值**——递归下降版本写 200 行还不够。**8 种语法结构 → 2 种回调 → 1 个循环**,加新运算符只要在 `BP` / `INFIX` 各加一行,**结构是平的,不再"插一层函数"**。

---

## 七、工业指针

| 项目 | 文件 |
| --- | --- |
| rustc | `compiler/rustc_parse/src/parser/expr.rs`,优先级表叫 `AssocOp` |
| Zig | `src/parse.zig` 的 `parseExpr*`,手写 Pratt 主循环 |
| TypeScript | `src/compiler/parser.ts` 的 `parseBinaryExpressionOrHigher`,precedence climbing(Pratt 等价变体) |
| Crafting Interpreters | "Compiling Expressions" 章,VM 部分直接用 Pratt |
| matklad 博客 | "Simple but Powerful Pratt Parsing"——**网上最干净的一篇,必读** |

进一步推荐 matklad "From Pratt to Dijkstra",把 Pratt 跟 shunting-yard 操作符优先级算法统一起来。

---

## 八、Mochi 这里偷懒了

- **不做语法位置歧义**:JS 的 `function` 在不同位置是声明 vs 表达式——Mochi 一律用 `fn` 关键字声明
- **不支持自定义运算符**:Haskell / Swift 允许用户声明新运算符及优先级——Mochi 优先级写死在 `BP` 表
- **无错误的 nud 回退**:遇到无 nud 的 token 直接报错,不像 rustc 会"假装补一个表达式"继续解析

---

下一篇:`10-AST设计.md`,讲清楚解析器产出的 AST 应该长什么样——**节点类型怎么挑、Visitor 模式 vs 代数数据类型、为什么 OOP 重载是 AST 的反模式**。
