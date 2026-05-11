# JIT 心智

到 27 篇为止,Mochi 已经是个能跑的字节码 VM——但它再怎么优化也只能到 CPython 3.11 的 1/10。**剩下那 10 倍差距,全在 JIT 上**。V8 比 Python 快 10-100 倍、HotSpot 比 CPython 快 50 倍,**核心就一件事**:把"热点"字节码翻译成 native 机器码,跳过 dispatch 循环。这一篇不写 SSA、不写寄存器分配——**只搭一个"看 V8 / LuaJIT 源码不慌"的心智图**,讲清楚 JIT 三大流派、type specialization / inline cache / deoptimization 三个关键词、V8 多 tier 怎么协作。Mochi 不实现 JIT——**30-50k 行代码的事,玩具语言不上**——但这一篇之后,你再看 V8 那堆 tier 的命名,脑子里有图。

> 一句话先记住:**JIT = Just-In-Time,运行时把热点字节码翻译成 native 机器码,跳过 dispatch**。三大流派**模板 / 方法 / Tracing**——模板最简单(LuaJIT stage1 / V8 Sparkplug),方法最主流(V8 TurboFan / HotSpot C2),Tracing 跨方法优化最激进(LuaJIT / PyPy)。**没有 type specialization + inline cache + deoptimization 这三件套,JIT 是空话**——它们决定了优化代码什么时候快、什么时候要倒退回解释器。

---

## 一、为什么 JIT 比解释器快 10-100 倍

字节码解释器每条指令大致这样跑:

```
取下一条字节码 (1 cycle)
查 dispatch 表跳转 (1-3 cycles, 分支预测失败更慘)
取操作数 → 执行 (1-2 cycle)
更新 PC → goto next
```

**纯执行只有 1 cycle**,**dispatch 开销占 70%**。JIT 的核心思想:**把这堆字节码直接拼成机器码**,dispatch 没了、PC 自增没了、操作数取址 inline 了。

```
字节码:                       JIT 生成的 x86-64:
  LOAD_FAST  a                   mov rax, [rbp-8]      ; a
  LOAD_FAST  b                   add rax, [rbp-16]     ; + b
  BINARY_ADD                     mov [rbp-24], rax     ; c
  STORE_FAST c
```

**3 条机器指令,直接跑完**——之前要走 4 条字节码、每条 dispatch 5-10 cycle。这就是 10x。

---

## 二、JIT 三大流派

### 2.1 模板 JIT(template / baseline)

**每条字节码对应一段预先写好的机器码模板,拼起来**——实现简单,编译速度极快,优化空间小。代表:V8 早期 Full-codegen、**LuaJIT 第一阶段**、**V8 Sparkplug**(2021 加的 baseline tier)。

**Sparkplug 的存在感**:V8 团队发现"从 Ignition 直接上 TurboFan 太慢",中间加了 Sparkplug——**编译比 TurboFan 快 100 倍,运行比 Ignition 快 ~50%**。**模板 JIT 不死,反而在大厂复活了**。

### 2.2 方法 JIT(method-based)

拿**整个方法**当编译单元——构建 IR(通常 SSA)→ 跑一堆优化 pass → 输出机器码。

```
function add(a, b) { return a + b }
  ↓ 构建 SSA
  ↓ Pass: inlining / constant prop / dead code elim
  ↓ Pass: register allocation
  ↓ 输出: 几十条 x86 指令
```

优化深、性能巅峰最高;编译慢、内存吃。代表:**HotSpot C1 / C2**、**V8 TurboFan**、**V8 Maglev**(2023+ 中端 tier)。**C2 / TurboFan 是这个流派的工业标杆**——产出的代码常常比 C 还快(因为有运行时类型信息可以 specialize)。

### 2.3 Tracing JIT

**不按方法切,按实际跑过的"热路径"切**——记录一段真实运行轨迹(trace),把这条路径上跨越的所有方法都 inline 成一坨。**跨方法内联粒度极激进**,**热路径性能炸裂**;trace 是动态的——分支爆炸时代码会爆。代表:**LuaJIT**(教科书级实现)、**PyPy**、SpiderMonkey 早期 TraceMonkey。

LuaJIT 是这个流派的标杆——**Mike Pall 一个人写的**,在动态语言里跑出过接近 C 的性能。**想看真东西就读它,40k 行 C 看得完**。

### 2.4 三派对比

| 维度 | 模板 JIT | 方法 JIT | Tracing JIT |
| --- | --- | --- | --- |
| 编译单元 | 单条字节码 | 整个方法 | 实际 trace |
| 实现代码量 | 5k 行 | 30-50k 行 | 20-40k 行 |
| 编译速度 | 极快(ms) | 慢(几十 ms) | 中等 |
| 峰值性能 | 1.5-3x 解释器 | 10-100x | 10-100x |
| 代表 | V8 Sparkplug | HotSpot C2 / TurboFan | LuaJIT / PyPy |

---

## 三、JIT 三件套:type specialization / inline cache / deopt

### 3.1 Type specialization

动态语言里,`a + b` 的解释器版本要查类型、走分支——**慢就慢在每次都要查**。但运行时观察,**99% 的实际调用都是 int + int**。JIT 的做法:**编一个只处理 int + int 的特化版本**,前面加一个**类型守卫(type guard)**:

```
  cmp [a_tag], INT
  jne deopt           ← 不是 int 就退回解释器
  cmp [b_tag], INT
  jne deopt
  mov rax, [a_val]; add rax, [b_val]; ret
```

99% 命中,1% deopt——**平均下来比通用版本快 10x**。

### 3.2 Inline cache(IC)

JS 里 `obj.x` 是个 hash 查找——慢得离谱。**V8 的发明**:第一次访问 `obj.x` 时,记下 obj 的 shape(hidden class)+ x 的 offset,后面再访问同 shape 的对象,**直接读那个 offset**——`src/ic/` 整个目录都在做这个。Chromium 团队 2010 年左右真的靠"把 IC 写好"打赢了 Firefox。

**多态 IC**:同一个 call site 见过多个 shape——退化成短链(monomorphic → polymorphic → megamorphic)。**3 个 shape 之内基本无损,4 个以上性能开始崩**。这就是 React fiber 内部 schema 严格统一的工程原因之一。

### 3.3 Deoptimization

JIT 是**乐观优化**——假设"以后跟现在一样"。**这个假设错了**(对象 shape 变了 / 类型变了)就必须**扔掉优化代码,退回 Ignition 字节码解释器**。一次 deopt 几百 us 到几 ms——**频繁 deopt 的代码性能比纯解释器还差**——这就是写"V8 友好的 JS"的核心:**别让 V8 反复猜错**(类型稳定、shape 稳定、参数 arity 稳定)。

---

## 四、V8 现实:多 tier 协作

2026 年的 V8 实际上有**四个 tier**:

```
┌──────────┐  ~50 次  ┌──────────┐  ~1000 次 ┌──────────┐  ~10000 次 ┌──────────┐
│ Ignition │ ────────→│ Sparkplug│ ─────────→│  Maglev  │ ──────────→│ TurboFan │
│ (解释)   │           │ (模板JIT)│           │ (中端JIT)│            │ (顶级JIT)│
└──────────┘           └──────────┘           └──────────┘            └──────────┘
     ↑                                                                       │
     └─────────────────── 任一 tier 类型猜错 → deopt ─────────────────────────┘
```

**为什么要四个 tier**:每层是**编译速度 vs 运行速度**的权衡——刚跑两次用解释器最划算,跑 50 次 Sparkplug 几乎免费拿 50% 加速,真正的热代码再上 TurboFan。**Sparkplug(2021)、Maglev(2023)都是这几年新加的**——说明哪怕 V8 这么强,中间地带的优化空间还很大。

---

## 五、Mochi 这里偷懒了

**Mochi 不实现 JIT**——本系列只到字节码 VM + GC。真要做 JIT,**保守估计 30-50k 行代码**——而且工程难点不在"翻译字节码到机器码",**难点是 deopt、是 IC、是多 tier 协作、是回归测试**。

如果你看完还是想做,**最划算的路线是上 LLVM**——把 Mochi 字节码翻成 LLVM IR,让 LLVM 干所有的优化和寄存器分配。**Crystal 语言、Numba(Python JIT)走的都是这条路**。**LLVM 后端 ~3k 行代码搞定一个能跑的 JIT**——比从零写省 10 倍。

---

## 六、工业指针:看 JIT 源码该去哪

| 项目 | JIT 路径 | 推荐入口 |
| --- | --- | --- |
| V8 | `src/compiler/` `src/maglev/` `src/baseline/` | `src/compiler/pipeline.cc`(TurboFan 主流程) |
| HotSpot | `src/hotspot/share/c1/` `src/hotspot/share/opto/`(C2) | `opto/compile.cpp`(C2 主流程) |
| LuaJIT | `src/lj_record.c` `src/lj_asm.c` | `lj_record.c`(tracing 起点) |
| PyPy | `rpython/jit/metainterp/` | `metainterp.py` |
| .NET RyuJIT | `src/coreclr/jit/` | `compiler.cpp` |

**看顺序建议**:**LuaJIT 先看**——单人作品、紧凑、Tracing JIT 教科书。**V8 第二**——多 tier 设计最现代。**HotSpot 最后**——历史包袱重但 C2 优化质量至今无对手。

---

## 七、踩坑提醒

1. **以为 JIT = 编译器**——多出来的难点全在 deopt 和 IC
2. **以为 type specialization 就是"加类型注解"**——不,是**运行时观察 + 加 guard**
3. **以为 V8 / HotSpot 越跑越快**——deopt 触发后**比解释器还慢**,要 warm up
4. **同一函数传四种以上 shape 的对象**——megamorphic IC,性能崩
5. **频繁 try/catch + throw**——常常打破 JIT 假设
6. **delete obj.x**——直接破坏 hidden class,触发 deopt
7. **arguments.callee / with / eval**——上古 JS 语法,V8 直接放弃 JIT
8. **以为 Tracing JIT 包打天下**——分支多 trace 会爆,SpiderMonkey 后来抛弃了 TraceMonkey
9. **以为可以"手写汇编 JIT"**——能,但 deopt / GC 集成几乎让你自杀
10. **不区分启动期 / 稳态性能**——Java 服务前 30 秒慢是正常,等 C2 编完就起飞

---

下一篇:`29-真实语言剖析.md`,**全系列密度最高的对照篇**——把 CPython / V8 / Lua / JVM 一个一个拆开,**每家"对应到 Mochi 里的哪一部分"**,带具体文件名、类名、入口函数。读完 Mochi 看这一篇,然后去啃真实语言源码——这是 27 篇 Mochi 之后,**真正"接入工业级语言"的那一步**。
