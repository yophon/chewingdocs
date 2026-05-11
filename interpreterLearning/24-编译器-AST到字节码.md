# 编译器:AST 到字节码

编译器是写一门语言**最容易卡的一关**——不是因为难,而是因为它**长得太像前面的递归求值器**,你会一直问"这跟我之前写的有什么区别"。区别是:**求值器返回值,编译器 emit 指令**——树形递归的形状一字不改,只是返回的"值"换成了"塞进 chunk 末尾的几个字节"。但有一个新东西是树遍历求值器从没见过的——**跳转回填(backpatching)**:编译 `if` 时你还不知道 then 分支多长,得先 emit `JUMP_IF_FALSE ?`,等编完 then 再回头把 `?` 填上。**这一招看图秒懂、不看图永远卡着**。

> 一句话先记住:**编译器 = 树遍历求值器换皮——把 visit(node) 里的「算出 value」换成「emit 字节码」**;唯一新概念是**跳转回填**——前向跳转目标未知,先写 0、记下位置、补回。

---

## 一、编译器的形状跟求值器一模一样

```ts
// 求值器:返回 Value           // 编译器:emit 字节码
case "binary":                   case "binary":
  const l = evalExpr(n.left);     compileExpr(n.left, ctx);
  const r = evalExpr(n.right);    compileExpr(n.right, ctx);
  return apply(n.op, l, r);       emitOp(ctx, opFor(n.op));   // ← 唯一变化
```

**唯一变化**:求值器返回 value,编译器追加字节到 chunk。**值在哪?在 VM 跑这段字节码时的栈顶上**,不在编译期。**编译器只负责安排好"跑的时候栈顶就是对的"**——左子树编完栈顶就有左值;右子树编完栈顶有左、右两个值;emit ADD,VM 弹两个压一个,栈顶就是结果。Mochi 走**单遍**:一边走 AST 一边输出字节码,不建中间 IR(rustc / GCC 中间有 MIR / GIMPLE / SSA 做优化,单遍够 Lua / Mochi 用)。输出 Chunk:`{ code: number[], consts: Value[], lines: number[] }`。

---

## 二、局部变量编号:栈式分配 slot

进入函数体时,**局部变量按声明顺序分配 slot 0, 1, 2, ...**——VM `locals[]` 数组下标。

```
fn f(x, y) {        // x → slot 0, y → slot 1
  let a = x + y    // a → slot 2
  if a > 0 {
    let b = a*2    // b → slot 3 (进 block,push)
    print(b)
  }                // 出 block,pop → 下次 b 复用 slot 3
}
```

编译器维护一个**作用域栈** `Ctx`,核心方法:`beginScope/endScope`(出 block 时弹掉该域局部变量并 emit POP)、`declareLocal(name)` 返回 slot、`resolveLocal(name)` 倒序线性搜索。**没有 hash map**——作用域里变量数通常 < 16,缓存友好。Lua / Crafting Interpreters 都这么干。

---

## 三、编译器骨架(60 行 TS)

```ts
function compileStmt(s: Stmt, ctx: Ctx): void {
  switch (s.kind) {
    case "let":   compileExpr(s.init, ctx); ctx.declareLocal(s.name); return;
    case "expr":  compileExpr(s.expr, ctx); emitOp(ctx, OP.POP); return;
    case "if":    return compileIf(s, ctx);
    case "while": return compileWhile(s, ctx);
    case "block":
      ctx.beginScope();
      for (const x of s.body) compileStmt(x, ctx);
      ctx.endScope(); return;
    case "return":
      if (s.value) compileExpr(s.value, ctx);
      emitOp(ctx, OP.RETURN); return;
  }
}

function compileExpr(e: Expr, ctx: Ctx): void {
  switch (e.kind) {
    case "num":    emitConst(ctx, e.value); return;
    case "var":
      const slot = ctx.resolveLocal(e.name);
      if (slot !== null) emitOp(ctx, OP.LOAD_LOCAL, slot);
      else emitOp(ctx, OP.LOAD_GLOBAL, ctx.internGlobal(e.name));
      return;
    case "binary":
      compileExpr(e.left, ctx); compileExpr(e.right, ctx);
      emitOp(ctx, opFor(e.op)); return;
    case "and": case "or": return compileShortCircuit(e, ctx);
  }
}

// emitOp 就是 ctx.chunk.code.push(op, ...args)
```

---

## 四、跳转回填(backpatching):本篇核心

编译 `if x > 0 { print(x) }`,到这里:

```
LOAD_LOCAL x
CONST 0
GT
JUMP_IF_FALSE ???     ← emit 时不知道要跳多远!
  LOAD_LOCAL x
  CALL print
JUMP_IF_FALSE 的目标 = 这里
```

**问题**:emit `JUMP_IF_FALSE` 时还没编 then 分支,不知道偏移。**解法**:**先填 0、记下位置、编完再回填**。

```
第 1 步: emit JUMP_IF_FALSE             code: [..., JUMP_IF_FALSE]
第 2 步: 记下 patchAddr,push 0 占位      code: [..., JUMP_IF_FALSE, 0]
                                                                  ↑ patchAddr (等下回填)
第 3 步: 编译 then 分支                  code: [..., JUMP_IF_FALSE, 0, LOAD_LOCAL, x_slot, CALL, 1]
                                                                                                  ↑ code.length
第 4 步: 回填 offset = code.length - patchAddr - 1 = 4
                                        code: [..., JUMP_IF_FALSE, 4, LOAD_LOCAL, x_slot, CALL, 1]
                                                                  ↑ 跳过 4 字节正好到 then 之后
```

代码(`emitJump` 占位、`patchJump` 回填):

```ts
function emitJump(ctx: Ctx, op: OP): number {
  emitOp(ctx, op);
  const patchAddr = ctx.chunk.code.length;
  ctx.chunk.code.push(0);                                // 占位
  return patchAddr;
}
function patchJump(ctx: Ctx, patchAddr: number): void {
  ctx.chunk.code[patchAddr] = ctx.chunk.code.length - patchAddr - 1;
}

function compileIf(s: IfStmt, ctx: Ctx): void {
  compileExpr(s.cond, ctx);
  const elseJump = emitJump(ctx, OP.JUMP_IF_FALSE);
  emitOp(ctx, OP.POP); compileStmt(s.then, ctx);
  if (s.else_) {
    const endJump = emitJump(ctx, OP.JUMP);
    patchJump(ctx, elseJump);
    emitOp(ctx, OP.POP); compileStmt(s.else_, ctx);
    patchJump(ctx, endJump);
  } else {
    patchJump(ctx, elseJump); emitOp(ctx, OP.POP);
  }
}
```

CPython `compile.c` 的 `ADDOP_JUMP` 宏、Lua `lcode.c` 的 `luaK_jump` / `luaK_patchlist` 都是同一招。

---

## 五、短路、循环、Chunk

**短路** `a && b`:不能编译成 `compile(a); compile(b); AND`(**会先把 b 算出来**,失了短路语义)。正确做法是 emit `compileExpr(a); JUMP_IF_FALSE skip; POP; compileExpr(b); skip:`——和 if 一样的回填套路,a 假就跳过 b、栈顶留 false。`||` 对偶。

**while**:比 if 多一件事——**反向跳转**。反向不用回填,目标在前面,直接算偏移:

```ts
function compileWhile(s: WhileStmt, ctx: Ctx): void {
  const loopStart = ctx.chunk.code.length;
  compileExpr(s.cond, ctx);
  const exitJump = emitJump(ctx, OP.JUMP_IF_FALSE);
  emitOp(ctx, OP.POP); compileStmt(s.body, ctx);
  emitOp(ctx, OP.JUMP);
  ctx.chunk.code.push(loopStart - ctx.chunk.code.length - 1);   // 负偏移
  patchJump(ctx, exitJump); emitOp(ctx, OP.POP);
}
```

**for** 解糖成 while:`for i in 0..10 { ... }` → `{ let i = 0; while i < 10 { ...; i = i + 1; } }`——**编译器只处理一种循环结构**,rustc、Kotlin 都这么干。`Chunk.lines[ip]` 给 stack trace 用(CPython 3.11+ 把 lines 压成 varint,看 `Objects/codeobject.c`)。

---

## 六、工业指针

| 项目 | 文件 | 看什么 |
|------|------|--------|
| Lua | `src/lcode.c` `luaK_jump` `luaK_patchlist` | 跳转回填的工业级实现 |
| CPython | `Python/compile.c` `compiler_visit_stmt` | 单遍编译 visitor,看 `ADDOP_JUMP`;3.12 后 `flowgraph.c` 做 CFG 优化 |
| V8 Ignition | `src/interpreter/bytecode-generator.cc` | TypeScript 的编译器,带类型 hint emit |
| Crafting Interpreters | `compiler.c` | Bob Nystrom 极简范本,**先看这本**——200 行讲透回填,再看 Lua / CPython 才不晕 |

---

## 七、Mochi 这里偷懒了

- **不做 peephole / dead code elimination / jump threading / constant folding**——`CONST 0; ADD`、`if false { ... }`、`JUMP a; a: JUMP b`、`1 + 2` 都应该编译期处理,Mochi 让 VM 在运行时算
- **没有 IR**——CPython 3.12 引入 CFG IR 做优化,Mochi 一遍出字节码;**Lua 也都不做**(LuaJIT 才做)——本系列追求"代码能跑、结构干净",优化留给读者作业

---

下一篇:`25-函数调用与闭包.md`——VM 怎么处理函数调用:**call frame 进栈、返回地址、参数传递**,以及**闭包捕获外层变量的真实机制(upvalue)**——为什么 JS 闭包不会让外层栈帧失效、Lua / Python / Rust 各自的捕获策略差在哪。
