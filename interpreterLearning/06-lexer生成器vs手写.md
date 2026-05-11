# lexer 生成器 vs 手写

打开任何编译原理教材,讲完正则就会推荐你用 lex / flex / re2c——「写 BNF,工具帮你生成 lexer,**比手写严谨**」。可是你打开 V8、CPython、rustc、Go、TypeScript、Roslyn 的源码,**全部手写**。**这不是因为他们老派,是因为生成器在生产语言场景下烂得几乎用不了**。这一篇拆清楚为什么——读完你会明白,**手写 lexer 不是"原始",而是"工业一线的必经之路"**。

> 一句话先记住:**lex / flex 在 1970s 的 Unix 工具里很好,在 2020s 的生产编译器里很差**——错误信息控不住、性能不够、上下文不敏感、增量不友好。**ANTLR 在 DSL / SQL 方言里还有市场,主流编程语言全是手写**。Mochi 跟一线节奏,**全程手写,不用生成器**。

---

## 一、生成器在做什么

`lex` / `flex` 接受一份「正则 → 动作」的规则文件——`"let" { return LET; }`、`[0-9]+ { return NUM; }`、`[a-zA-Z_]\w* { return IDENT; }`,几十行覆盖一门小语言。flex 把规则**编译成一个巨大的 DFA**,生成 C 代码——一个 `yylex()` 函数。**理论上很美**:正则等价于 DFA,Thompson 构造法保证最长匹配 + 最优顺序——**写规则即写实现**。

`re2c` 同思路但更现代,生成代码可读,**PHP / ninja / Hack 都用它**。`ANTLR` 更激进——同时生成 lexer + parser,**Hive / Presto / Spark SQL 都是**。

---

## 二、理论上应该用工具

教科书的论据:

1. 正则 ≡ NFA ≡ DFA(Kleene 定理)
2. DFA 是 O(1) 状态转移,**理论最优**
3. 规则即文档,改语言只改规则
4. 工具帮你查歧义、查不可达规则

**如果你做学术玩具,这些都对**。问题是生产语言的需求**几乎没有一条**能从这些性质里推出来。

---

## 三、为什么 V8 / CPython / rustc 全是手写

### 3.1 错误信息

```
flex 默认报错: syntax error at line 5
rustc 报错:
error: unknown character `@`
 --> src/main.rs:5:13
  |
5 |     let x @ = 10;
  |           ^ help: did you mean `=`?
```

**rustc 这样的错误信息,生成器写不出来**。flex 的错误处理只能 print 一行——你要带列号、高亮、建议、相邻 token 上下文,**必须手写**。

### 3.2 性能

V8 的 scanner 走模板特化 + ASCII fast path + 字符分类查表——**比 regex 引擎快 3-5 倍**。flex 生成的 DFA 状态转移虽然 O(1),但**常数大**:每个字符要查 256 大小的表,缓存不友好。

手写允许:

- SIMD 一次扫 16 字节找终止符
- 跳过空白用 `memchr` 加速
- 关键字用 perfect hash 不走 strcmp

### 3.3 上下文敏感

JS 里 `/` 是除号还是正则字面量?**取决于上一个 token**:

```javascript
a / b           // 除号
return /b/g     // 正则
typeof /b/      // 正则
```

flex / re2c 是无状态 DFA,**做不了**。V8 的 scanner 维护一个 `last_token_was_expression`,**手动判断**。

Python 的缩进更狠——**INDENT / DEDENT 是 token,词法层就要做栈**。Rust 的 raw string `r###"..."###` 里 `#` 的数量要匹配——**这不是正则能描述的语言**,必须手写。

### 3.4 增量解析 / LSP

LSP 场景:你改了一个字符,IDE 想 **只重新分析改动周围**,不重扫整个文件。**flex 做不了**——它是一次性扫到底。

rustc 的 lexer 设计成「以 token 为单位增量产出」,IDE 从光标位置往回找一个安全点重 tokenize。**这是手写才能做到的事**。

---

## 四、对比 + 真实选型

| 维度 | lex/flex | re2c | ANTLR | 手写 |
| --- | --- | --- | --- | --- |
| 写规则速度 | 快 | 快 | 快 | 慢 |
| 错误信息 | 烂 | 烂 | 一般 | **可控** |
| 性能 | 一般 | 好 | 一般 | **最好** |
| 上下文敏感 | 不行 | 勉强 | 可以但代码丑 | **自然** |
| 增量解析 | 不行 | 不行 | 不行 | **可以** |
| 适合 | 小工具、配置 | 嵌入 C 项目 | DSL / SQL | 生产编程语言 |

| 项目 | lexer | 文件 |
| --- | --- | --- |
| V8 | 手写 C++ | `v8/src/parsing/scanner.cc` |
| CPython | 手写 C | `Parser/tokenizer.c` |
| rustc | 手写 Rust | `compiler/rustc_lexer/src/lib.rs` |
| Go | 手写 Go | `src/go/scanner/scanner.go` |
| TypeScript | 手写 TS | `src/compiler/scanner.ts` |
| Roslyn(C#) | 手写 C# | `Microsoft.CodeAnalysis.CSharp.Lexer` |
| Lua | 手写 C | `lua/llex.c`(500 行,极小) |
| PHP | re2c | 历史包袱 |
| Hive QL | ANTLR | DSL 场景 |
| PostgreSQL | flex | 老 + SQL 文法规整 |

**模式很清楚**:**编程语言全是手写,SQL / DSL 还有生成器**——因为 SQL 错误信息要求低、文法规整、性能不敏感。

---

## 五、ANTLR 在 DSL 场景下还是值钱

不要因为 V8 手写就一刀切。**做 DSL / 规则引擎 / 配置语言**,大概率用 ANTLR:

- 文法清晰可读(Hive 几百条 grammar 一目了然)
- AST 自动生成,parser 也省
- 多语言后端(同一份语法生成 Java + Python + TS)
- 错误恢复在 ANTLR 4 已经做得不差

**判断标准**:

```
用户期待 IDE 体验、增量解析、精确错误高亮?  → 手写
用户只在 CLI 跑、错误信息能用就行?          → ANTLR / flex
```

Mochi 的目标是模拟生产语言,**所以手写**。你做内部规则引擎,**别为了"工业感"也手写,白浪费时间**。

---

## 六、Mochi 这里偷懒了

- **没写 fuzzer 验证 lexer 正确性** —— 生产 lexer 都有 100k+ AFL fuzz case
- **不支持 UTF-8 多字节标识符** —— 工业必备,要做 Unicode 表
- **没做增量 tokenize** —— LSP 才需要,30 篇才提
- **错误信息没有 source span 高亮** —— 15 篇会补
- **没做 SIMD 加速** —— 学习版没必要

**学完原理,真要做生产 lexer**,回头看 rustc `compiler/rustc_lexer/src/cursor.rs` 那 80 行——**比这一篇值钱 10 倍**。

---

## 七、工业指针

最值得逐行读的手写 lexer:

```
rustc:       compiler/rustc_lexer/src/lib.rs        (~700 行, 极干净)
             compiler/rustc_lexer/src/cursor.rs    (~80 行, peek/advance 范本)
Go:          src/go/scanner/scanner.go             (~800 行, 含 semicolon 自动插入)
Lua:         lua/llex.c                            (~500 行, 极简单纯粹)
TypeScript:  src/compiler/scanner.ts               (~2700 行, 案例丰富)
V8:          src/parsing/scanner.cc                (~1200 行, 性能优化范本)
```

**别先读 CPython `Parser/tokenizer.c`**——里面有 Python 缩进的特殊处理,**新手会以为"词法都这么复杂"**,其实不是。

---

## 八、踩坑提醒

1. **学校教 lex / flex,工作中没人用** —— 别拿"我会 lex"当本事
2. **学正则有用,但不是写 lexer 用** —— 学完去写 sed / grep / 表单校验
3. **DSL 直接上 ANTLR 没问题** —— 别为了"工程感"也手写
4. **手写不等于不严谨** —— rustc 比生成器还规整,因为 test case 比规则多
5. **以为正则能解析所有语言** —— Rust raw string、Python f-string 都不是正则
6. **以为生成器代码可读** —— flex 生成的 `yylex` 函数你打开就懵
7. **想用 ANTLR 但把整个生产语言文法拷过来** —— 体量 ANTLR 跑不动
8. **觉得手写就要重新发明 peek / advance** —— 抄 `rustc_lexer/cursor.rs`,80 行就够

---

下一篇:`07-文法基础.md`,从 BNF 起步——**LL vs LR、二义性、运算符优先级**,看完你才能理解为什么递归下降是工程主流、为什么 yacc / bison 没人用了。
