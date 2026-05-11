# 运行时错误与 REPL

解释器写到这里,大半语义都跑得通了——但**有件事决定你的语言看起来"是玩具"还是"是工具":它怎么报错**。`Error: undefined variable` 跟 `Error: undefined variable 'foo' at file.mochi:3:7` + 一个箭头是两种不同的语言。Python 3.11 之前的错误信息被骂了 20 年,3.11 加了 fine-grained location 之后突然就好用了——同样的 bug,以前花 5 分钟翻栈,现在 5 秒看完就知道。这一篇讲清楚 Mochi 的错误对象怎么设计、stack trace 怎么生成、source map 是干嘛的、然后顺手把 REPL 写出来——**REPL 是解释器作者自己最爽的体验**,你的语言"活起来"的瞬间就在这里。

> 一句话先记住:**好错误信息 = 错误对象带位置(line, col)+ 调用栈快照(每个 frame 一行)+ 源码上下文(那一行 + 一个箭头)**。**REPL 不是新东西,是同一个解释器跑在同一个全局 env 上,只是每次只读一句**——`let x = 1` 之后,下一行还能用 x。

---

## 一、错误的两种 + 错误对象

**编译期错误**(parse / resolve):语法错、名字找不到——**你能一次看完整个文件的所有错**(parse 完整个 program 再报)。**运行期错误**:除零、null 访问、数组越界、调用不是函数的东西、用户主动 `throw`——**一次只能看到一个**,因为后面的代码还没跑。Rust / TS 这种静态语言把大量错误左移到编译期——**同样一段代码 Rust 能一次告诉你 5 个错,Mochi 只能告诉你跑到第几行才崩**。

```ts
class MochiError extends Error {
  constructor(
    public kind: 'TypeError' | 'NameError' | 'RuntimeError' | 'UserError',
    public message: string, public line: number, public col: number,
    public stack: StackFrame[] = [],
  ) { super(`${kind}: ${message}`) }
}
interface StackFrame { fnName: string; file: string; line: number; col: number }
```

`kind` 用来让用户的 `catch(e)` 决定是否 rethrow;`line` / `col` 是错误**直接发生**的位置(从 AST 节点拿);`stack` 是调用栈(每层 callFunction 往上 push)。**没有 line / col 就是没做这件事**——很多新手解释器报错只一行 "TypeError",一看就是 token 没把位置信息一路带到 AST 上。

---

## 二、位置信息怎么一路带,栈怎么 push

「好错误信息」的底层基础设施,**从 lexer 就要做对**——lexer 给每个 token 带 `(line, col, length)` → parser 把 token 的位置塞进 AST 节点 → evaluator 抛错时,从当前 AST 节点拿 `(line, col)` 塞进 MochiError。**漏一环就废**:lexer 只记 line 不记 col,后面所有错误的箭头就指不准。**04 篇项目骨架那一篇就强调过**:从第一天就把位置带上,后期补极其痛苦。

栈追踪每层调用自己 push:

```ts
function callFunction(fn: MochiFunction, args: Value[], callSite: AstNode) {
  try { return fn.call(interp, args) }
  catch (e) {
    if (e instanceof MochiError) {
      e.stack.push({ fnName: fn.name ?? '<anonymous>',
                     file: callSite.file, line: callSite.line, col: callSite.col })
    }
    throw e
  }
}
```

**在 catch 里 push 不是调用前 push**——栈顺序天然是"最里向外"。打印出来跟 Python / Node 你天天看的栈一模一样:

```
TypeError: cannot add number and string
    at add        (math.mochi:3:12)
    at <anonymous> (main.mochi:7:5)
    at main       (main.mochi:14:3)
    at <global>   (main.mochi:20:1)
```

**结构就是这么简单**。

---

## 三、Rust 风格的源码上下文

光有 `line:col` 不够,**最好把那一行源码本身打出来,加个箭头**:

```
TypeError: cannot add number and string
  --> main.mochi:3:11
   |
 3 |   let x = 1 + "hello"
   |           ^^^^^^^^^^^ 这两个类型不能相加
```

实现不到 10 行 TS——`source.split('\n')[err.line - 1]` 拿那一行,`' '.repeat(err.col - 1) + '^'` 拼箭头,几个 template literal 拼成 5 行输出。**用户体验差一个量级**。Rust 编译器的 `compiler/rustc_errors` 就是这套加强版,做了多行高亮、错误类型染色、suggest fix。**Elm 编译器更激进**,直接给你写好"你大概是想这样写"的代码片段。

---

## 四、REPL:解释器最有趣的部分

REPL = Read-Eval-Print Loop。**最低版本就是个 while**:

```ts
async function repl() {
  const interp = new Interpreter()       // 整个 REPL 共用一个解释器
  const globalEnv = interp.globalEnv     // 整个 REPL 共用一个全局 env
  while (true) {
    const line = await prompt('mochi> ')
    if (line === ':quit') break
    if (line.startsWith(':')) { handleCommand(line, interp); continue }
    try {
      const ast = parse(lex(line))
      const result = interp.execProgram(ast, globalEnv)   // ← 同一个 env
      if (result !== undefined) console.log(formatValue(result))
    } catch (e) {
      if (e instanceof MochiError) console.error(formatError(e, line))
      else throw e
    }
  }
}
```

**最关键的一行**:`interp.execProgram(ast, globalEnv)`——**每次输入不是新建解释器,是在同一个全局 env 上继续追加**。所以这种交互才能工作:

```
mochi> let x = 1
mochi> let y = 2
mochi> x + y
3
mochi> fn double(n) { return n * 2 }
mochi> double(x + y)
6
```

**第一行 `let x = 1` 后,x 进入 globalEnv,后续输入都看得见**——REPL 的"持久 env"就是这一行代码的事。

`:` 开头的元命令(不是 Mochi 代码):

| 命令 | 干嘛 |
| --- | --- |
| `:env` / `:type x` | 看当前 env / 看变量类型——**比加 print 高效十倍** |
| `:reset` | 清掉 env,从头开始 |
| `:load file` | 把一个文件 read 进来按 program 跑 |
| `:edit` | 进多行编辑模式 |
| `:quit` / `:help` | 退出 / 列出命令 |

---

## 五、多行输入是个坑

你想在 REPL 输入 `fn fib(n) { ... }` 多行——但 REPL 一行一行读,第一行 `fn fib(n) {` 一进 parser 就报"语法错"。**两种解法**:

1. **自动检测**:parse 失败时看错误是不是"句子还没结束"(花括号不匹配 / 表达式没完),是的话提示符变 `... > ` 等下一行。**Python / Node REPL 走这条**,实现要 parser 暴露"continuation needed"信号,**不容易**。
2. **显式命令**:`:edit` 进多行模式,空行结束。**实现简单,体验差一点**。

Mochi **现阶段走第二条**——`:edit` 显式进多行。Lua / Erlang REPL 都做了 auto-detect,后续可补。

---

## 六、工业级是怎么做的

**Python 3.11 fine-grained error location**(PEP 657):错误信息不再只指一行,**指那一行里具体的 token**(`z = x['a']['b'] + 1` 下面用 `~~~~~~~^^^^^` 圈出冲突的 `['b']`)。实现:把 `co_positions` 表塞进 code 对象,记录每条字节码对应的源码 `(start_line, end_line, start_col, end_col)`——**Python 3.10 之前每条字节码只有 line 没有 col**,**这是过去 5 年 Python 错误体验最大的提升**。

**Rust 编译器**:`compiler/rustc_errors` + `rustc_span` 管位置——`Span` 类型贯穿整个编译器,任何分析阶段抛错都能精确回放源码。**Rust 错误信息神在哪**:不是某个魔法工具,**是基础设施一路带**。

**IPython / Jupyter**:不只是 REPL——是 REPL + 持久内核 + 富文本输出 + 历史可重放。**REPL 一旦做到这步,就成了科学计算的主流形态**——Mathematica / MATLAB / Maple 全是这套心智。

---

## 七、Mochi 这里偷懒了

**没做 multiline auto-detect**——要进多行得显式 `:edit`,工业级 REPL 都做了自动续读。**没做 history search**——Ctrl-R 翻历史这种细节直接用 readline 库就能做,玩具版没接入。**source map 只到行列**,不像 Python 3.11 那样到 start/end col,所以箭头是"指到某一列"不是"高亮一段范围"——要做范围:AST 节点存 `(start, end)` 而不是 `(line, col)`,重构量大,留给 20 篇之后。

---

## 八、为什么这一篇是「树遍历最爽的一篇」

写完 15 篇,**你的 Mochi 第一次能交互式跑了**——

```
$ ./mochi
Mochi 0.1 (tree-walking)
Type :help for commands.

mochi> let xs = [1, 2, 3, 4, 5]
mochi> xs.map(fn(x) { return x * x })
[1, 4, 9, 16, 25]
mochi> fn fact(n) { if n < 2 { return 1 }; return n * fact(n-1) }
mochi> fact(10)
3628800
```

**这就是你写解释器的回报瞬间**——前面 14 篇所有的 lexer / parser / AST / env / 闭包,全在这个 REPL 里活过来了。**没有这一刻,前面 14 篇是抽象的;有了这一刻,Mochi 是你的语言**。

---

下一篇:`16-类与继承.md`,讲清楚 OOP 在解释器里**根本没你想的复杂**——对象本质就是个"带方法的 map",方法分派就是查表,super 是父类查找的一个偏移。讲完你就能在白板前给同事画清楚 Python 的 MRO 和 JS 的 `[[Prototype]]` 链。
