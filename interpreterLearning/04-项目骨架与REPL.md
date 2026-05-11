# 项目骨架与 REPL

很多教程开篇就直接「现在我们来实现一个 lexer」——**这是新手陷阱**。一个没有基建的解释器项目,写到第 10 篇会让你回头重写所有源码定位、所有错误信息、所有测试夹具。最后你不是在学解释器,**是在补昨天偷懒的债**。本篇先做那些"看着没意思但后期一定后悔没做"的事:目录结构、TS strict、vitest、`(line, col)` 错误追踪、REPL 骨架——一个 `pnpm test` 全绿的空壳,后面 26 篇都在它上面叠加。

> 一句话先记住:**解释器项目 80% 的痛苦来自"位置信息没从第一天带上"**——token 没带 `(line, col)`、AST 没带 source span、错误信息只能 print "syntax error"。**先把基建搭对,后面加特性才爽**;基建欠的债是复利的。

---

## 一、目录结构

最小可用的解释器项目就这几个文件:

```
mochi-lang/
├── src/
│   ├── token.ts      # Token 类型 + 位置信息
│   ├── lexer.ts      # 05 篇填:字符流 → token 流
│   ├── parser.ts     # 08 篇填:token 流 → AST
│   ├── eval.ts       # 11 篇填:AST → 求值
│   ├── repl.ts       # 本篇就把它写出来
│   └── errors.ts     # 统一的错误格式
├── tests/{lexer,parser,eval}.test.ts
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

**一开始把所有空文件都建出来**——不要等到第 8 篇才发现 `parser.ts` 还没建,然后 import 路径全得改。

---

## 二、初始化:pnpm + vitest + TS strict

```bash
mkdir mochi-lang && cd mochi-lang
pnpm init
pnpm add -D typescript vitest tsx @types/node
pnpm tsc --init --strict
```

`tsconfig.json` 必开 `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`,target `ES2022`,module `ESNext`。**为什么 strict**:解释器代码全是「这个字段可能 null」「这个下标可能越界」——TS 帮你拦下来,**比运行时 `undefined is not a function` 哭着 debug 强 100 倍**。

`package.json` 加 `"scripts": { "test": "vitest run", "repl": "tsx src/repl.ts" }`。

---

## 三、Token 与位置:从第一天就要带

最坑的偷懒法:**Token 只记 `kind` 和 `lexeme`,不记位置**。等你写到 parser 报错,根本不知道是哪一行。

```typescript
// src/token.ts
export interface Position { line: number; col: number }   // 都从 1 开始
export interface Token { kind: TokenKind; lexeme: string; pos: Position }

export type TokenKind =
  | "let" | "var" | "fn" | "if" | "else" | "while" | "for"
  | "ident" | "number" | "string"
  | "+" | "-" | "*" | "/" | "=" | "=="
  | "(" | ")" | "{" | "}" | "," | ";" | "eof"
```

错误对象也带位置:

```typescript
// src/errors.ts
import type { Position } from "./token"
export class MochiError extends Error {
  constructor(
    public stage: "lex" | "parse" | "eval",
    public pos: Position,
    msg: string,
  ) { super(`[${stage}] ${pos.line}:${pos.col} ${msg}`) }
}
```

**`pos` 是 token 的左上角**——AST 节点之后会合并出 `[start, end]` 的 source span,12 篇展开。

---

## 四、REPL 骨架(30 行 TS)

REPL = **R**ead **E**val **P**rint **L**oop。本篇先把壳搭起来,后面把 lexer / parser / eval 填进 `evaluate`:

```typescript
// src/repl.ts
import * as readline from "node:readline"

function evaluate(src: string): string {
  // 第 11 篇会真正实现这里
  return `(stub) you typed: ${src}`
}

const rl = readline.createInterface({
  input: process.stdin, output: process.stdout, prompt: "mochi> ",
})
console.log("Mochi 0.0.1 - press Ctrl+D to exit")
rl.prompt()
rl.on("line", (line) => {
  try { console.log(evaluate(line)) }
  catch (e) { console.error(e instanceof Error ? e.message : String(e)) }
  rl.prompt()
})
rl.on("close", () => console.log("\nbye"))
```

跑一下 `pnpm repl`:

```
mochi> let x = 10
(stub) you typed: let x = 10
mochi> ^D
bye
```

**30 行,跑通,提交**——这就是本篇产出。

第一个测试用例确保 `pnpm test` 是绿的——验证 `new MochiError("lex", {line:3,col:5}, "bad char").message === "[lex] 3:5 bad char"`。之后每篇合入前的硬规则:`pnpm test` 全绿,**否则不算写完**(见 00 篇「完成判据」)。

---

## 五、工业级是怎么做的

**CPython** 的入口栈:

```
Python/pythonrun.c    ← REPL 主循环 PyRun_InteractiveLoop
Parser/tokenizer.c    ← 词法
Parser/parser.c       ← 语法
Python/ceval.c        ← 字节码 VM
```

`PyRun_InteractiveOneObject` 本质和我们的 `rl.on("line")` 一样:读一行、tokenize、parse、compile、execute、打印。**只是它多了 30 年的边界 case**。

**V8 的 REPL** 叫 `d8`(`v8/src/d8/d8.cc`),**只是个壳**——核心是 `v8::Isolate` 和 `v8::Context`,把 JS 字符串扔进去得到 Value 出来。**REPL 只是"调用 evaluate 的循环",真正的难度在 evaluate**。

**Rust 没有官方 REPL**,但有 `evcxr`——它把 Rust 编译成 .so 再 dlopen 进来。**这就是为什么动态语言的 REPL 远比静态语言好做**。

---

## 六、Mochi 这里偷懒了

| 做的事 | 真实语言会做 |
| --- | --- |
| 只读一行 stdin | readline 库:历史、Ctrl+R、Tab 补全 |
| 不做语法高亮 | bpython / IPython 实时高亮 + 自动缩进 |
| 多行靠分号 | Python 用「未闭合括号」自动续行 |
| 没有 `.mochi_history` | bash / zsh / Python 都有 |
| 错误只 print message | 真实 REPL 高亮出错的那一列、给修复建议 |

**这些不做不影响学解释器**——15 篇专门讲 REPL 体验时再补。

---

## 七、踩坑提醒

1. **Token 不带 `(line, col)`**——后面所有错误信息都是瞎的,**第一天就上**
2. **不开 TS strict**——写到第 10 篇 AST 节点,会有一堆 `undefined` 漏过去
3. **不写 vitest 用例**——重构时无声崩坏,每篇至少 5 个测试
4. **直接监听 `process.stdin.on('data')`**——UTF-8 半截 chunk 会糊,**用 `node:readline`**
5. **错误 throw 原生 `Error`**——丢失 stage 和位置信息,统一 `MochiError`
6. **目录结构推到最后才建**——文件之间 import 路径全乱
7. **`tsx` 跑得通,`tsc` 编译就崩**——别用宿主特有的 import.meta 之类非标 API
8. **以为 REPL 简单**——`evaluate` 那一行,是后面 20 篇的全部内容

---

下一篇:`05-词法分析.md`,把 `src/lexer.ts` 真正填出来——**字符流 → token 流**,听起来最简单的一步,**却是新手最容易写得屎一样的一步**。
