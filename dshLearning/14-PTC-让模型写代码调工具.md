# PTC:让模型写代码调工具

13 篇讲的管线有一个默认前提:模型每发一个工具调用,就是一个 JSON 块,结果回到上下文里,模型看完再决定下一步。aiLearning 21 篇讲的 Function Calling 就是这种形态。04 篇介绍过的 PTC 预设换了一种方式:模型不再逐个发工具调用,而是写一段 TypeScript 程序,在程序里调用多个工具、循环、分支、过滤,最后只把需要的东西打印或返回出来。

这一篇讲 PTC 模式的内部机制:模型实际看到什么,程序里的工具调用怎么回到 13 篇那条管线,执行程序的 `ctx.ptcRuntime` 接缝和默认的 Node 运行时怎么隔离,以及这种方式的代价。

> 一句话先记住:**PTC 模式下模型只能直接调用 `run_code`,其余工具变成程序里的 `await tools.name(args)`**。程序中的每个子调用照样走完整的 `tools/*` 管线,包括策略、审批和 guard;中间结果留在程序里,只有打印和返回的内容进入对话。省掉的是往返次数和中间结果的上下文,代价是可调试性和对模型写代码能力的依赖。

---

## 一、为什么要让模型写代码

### 1.1 原生调用的问题

PTC 的设计笔记(`.agents/notes/implemented/feature/2026-06-15-ptc.md`)是这样描述问题的:原生呈现下,每个工具都以 JSON schema 函数定义的形式出现,模型每个 step 发调用,**每个中间结果都会在下一次请求里回到上下文**。模型想"遍历一批结果""按中间值分支""扇出再汇总",每一次都要完整地往返一趟模型,而且不管需不需要,中间结果都被拖回上下文。

同一份笔记引用了 Cloudflare 的 Code Mode 作为思路来源:模型见过大量真实代码,却很少见过人造的工具调用轨迹,所以更擅长写代码。让模型对着一份生成的 API 写程序,程序在沙箱里跑,模型自己决定把什么带回来。

### 1.2 名字的来历

这个功能早期叫 "code mode"。2026 年 8 月改名为 PTC,会话格式 v2→v3 的迁移把旧事件 `tool/code-dispatch` / `tool/code-dispatch-start` 改成了 `tool/ptc-dispatch` / `tool/ptc-dispatch-start`,v3→v4 迁移也保留了 `tools-code-mode` 这个历史键。用户文档(`docs/`)里没有展开 PTC 的全称,Web UI 预设帮助的文案把它解释为 Programmatic Tool Calling(04 篇),界面上的写法统一是"PTC mode / PTC 模式"。读旧 issue 或旧会话时看到 code mode,指的就是它。

---

## 二、怎么打开

PTC 是工具注册表 `dsh-tools` 的一种**呈现模式**。`mode` 只接受 `native`(默认)和 `ptc`;`both` 在 0.2.1-alpha.1 之后的版本里移除(升级指南 `docs/upgrade-guide/v0.2.1-alpha.1/tool-presentation-mode/guide.md`)。有三个层次可以设置:

| 层次 | 怎么设 | 作用范围 |
| --- | --- | --- |
| 部署默认 | `tools` 行的 `config.mode` | 所有没自己声明呈现方式的 agent |
| 环境变量 | `DSH_TOOLS_MODE=native` 或 `ptc` | 整个进程;web-app 和 headless 两个 bundle 用 `!!js process.env.DSH_TOOLS_MODE` 读取,其他值会导致启动失败 |
| agent 预设 | 预设里加一行 `dsh-agent-tool-presentation`,`mode` 必填 | 加入该预设的 agent,可以和原生 agent 跑在同一个进程里 |

web-app 的 `cordis.patch.yml` 自己把环境变量这条路标成 **TEMPORARY workaround**:等 Web UI 能按会话选择呈现方式,这个开关就会去掉。日常用法是在 Web 里新建会话时选 PTC 预设(`packages/bundle/web-app/presets/ptc.patch.yml`),它的核心就是这一行:

```yaml
- id: tool-presentation
  name: '@deepseek-ai/dsh-agent-tool-presentation'
  config:
    mode: ptc
```

前提是组合里有一个 `ctx.ptcRuntime`,而且它的语言有注册好的 SDK 渲染器。base 已经挂了 `ptc-runtime` 行(`@deepseek-ai/dsh-ptc-runtime-node`)。缺这个运行时时,部署级 `ptc` 会在组装提示词时失败;预设级 `ptc` 在挂载时就被拒绝,报错会点名这一行。

还有一个限制:**呈现方式是按 agent 定的,不是按工具定的**。同一个 agent 里不能让某个工具走原生、另一个走 PTC。

---

## 三、模型看到的是什么

### 3.1 只有一个 `run_code`

PTC 模式下,发给模型的工具列表里只剩 `run_code` 一个(`docs/tool-catalog.md`,Node 运行时下的 schema):

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `code` | 是 | 要执行的 TypeScript 程序,按运行时给出的执行说明来写 |
| `description` | 是 | 5 到 10 个词的主动语态说明,显示在 UI 上 |
| `timeoutMs` | 否 | 本次程序的耗时预算,受部署上限约束(运行时支持覆盖时才出现) |
| `sandbox_permissions` | 否 | 本次程序要的更宽沙箱模式:`workspace-write` 或 `danger-full-access` |
| `justification` | 否 | 为什么需要更宽权限,展示给用户审批;要求用用户当前请求的语言写 |

### 3.2 两段提示词

系统提示词里多出两段:

- **`tools:ptc-only`**:排在各工具自己的说明之前,明确告诉模型"`run_code` 是唯一能直接调用的工具,直接调用别的工具会失败"。注册表注释解释了这么安排的原因:如果模型只能靠被拒绝才发现这条规则,纠正就来得太晚了
- **`tools:sdk`**:运行时提供的执行说明,加上一份**确定性生成**的 SDK 声明。工具按名字字典序输出,工具集合不变时文本逐字节相同,这对 KV Cache 很重要;这一段的 first-party 排序值是 5000,并且关闭了提示词变量插值

生成器 `packages/core/tools/src/ts-types.ts` 输出的声明骨架是:

```ts
interface ToolArgsMap {
  // 每个可见工具一项:名字 → 参数类型(由 JSON Schema 转来,带工具描述注释)
}
interface ToolOutputMap {
  // 每个可见工具一项:名字 → 规范返回值类型
}
type ToolName = keyof ToolOutputMap

declare class ToolCallError extends Error {
  readonly name: "ToolCallError";
  readonly toolName: ToolName;
}

declare const tools: {
  [K in ToolName]: (args: ToolArgsMap[K]) => Promise<ToolOutputMap[K]>;
}
```

注意 `ToolOutputMap`:每次调用返回的是工具声明的**类型化规范值**,而不是渲染给人看的文本。这得益于 19 篇会讲的强制输出 schema。

### 3.3 直接调用会怎样

模型如果还是发了一个原生的 `bash` 调用,注册表会在进入策略管线之前就以 `UNKNOWN_TOOL` 拒绝,提示它这个工具要在 `run_code` 里调用。规则很简单:没有 `parent` token 的模型直接调用,只能是 `run_code`;程序内的子调用带着 parent token,才能调用其他可见工具。宣告给模型的工具面和实际可调用的工具面保持一致。

---

## 四、一个程序长什么样

### 4.1 官方示例

tools README 给出的 TypeScript 执行说明里,带着这样一个完整调用(只在 `bash` 的参数 schema 接受这组参数时才渲染):

```ts
run_code({ code: "return await tools.bash({ description: 'Show current directory', command: 'pwd' })", description: "Show current directory" })
```

### 4.2 一个多工具的例子

按 0.2.1-rc.2 里 `glob`(返回 `{ root, paths }`)和 `read`(参数 `file_path` / `offset` / `limit`,返回 `{ path, offset, lines, totalLines }`)的实际 schema,可以写出这样的 `code`。它是 async 函数体,支持顶层 `await` 和 `return`:

```ts
const { paths } = await tools.glob({ pattern: 'packages/*/package.json' })

const files = await Promise.all(
  paths.map(p => tools.read({ file_path: p, limit: 5 })),
)

try {
  await tools.read({ file_path: 'NOT_EXIST.md' })
} catch (e) {
  if (e instanceof ToolCallError) console.log(`${e.toolName} failed: ${e.message}`)
}

return files.map(f => ({ path: f.path, totalLines: f.totalLines }))
```

这段程序一次 `run_code` 就完成了"列出所有包、读每个 `package.json` 的开头、汇总行数"。原生模式下,同样的工作要先 glob,再发 N 个 read,中间结果全部进上下文。几个要点:

- **只有 `return` 和 `console.log` 的内容是程序输出**。`files` 里每个文件的内容不会进对话,模型只看到最后那个汇总数组
- **`Promise.all` 不等于全部并发**。子调用遵循 12 篇讲的原生调度契约:声明了并发安全的工具(比如 `read`)才会重叠执行,修改类工具按提交顺序单独执行
- **失败的工具调用以 `ToolCallError` 拒绝**,可以 `try/catch` 后继续
- **只能用可擦除的 TypeScript 语法**(没有 `enum` 和 namespace),类型注解仅供参考,运行前会被剥掉

### 4.3 模型拿回什么

| 情况 | 模型看到的 `run_code` 结果 |
| --- | --- |
| 正常结束 | 打印的各行加上返回值 |
| 什么都没输出 | `(run_code completed with no output)` |
| 程序失败 | `Error: code run failed (<kind>): <message>`,有捕获输出时后面跟 `Captured output:` 和捕获的行 |

子调用返回的结果如果含图片,会在 `run_code` 结果之后作为一条附加上下文追加(`source.kind` 为 `ptc-mode`),模型下一个 step 能看到图。其他中间结果一律不进对话。

---

## 五、子调用照样走完整管线

这是 PTC 安全模型的核心:**程序里的 `tools.bash(...)` 不是绕过管线的后门**。

```text
模型 ──run_code──→ tools/pre-execute → 审批 → guard → tools/execute → ...   外层调用
                       │
                       ▼ 程序在 ptc-runtime 里运行
                 tools.read(...)  ──→ 完整的 tools/* 管线(带 parent token)
                 tools.bash(...)  ──→ 完整的 tools/* 管线(带 parent token)
                       │
                       ▼
                 外层结果 → tools/post-execute → spill → [S] tool/result
```

具体来说(`packages/core/tools/README.md` 的 PTC mode 一节和 `src/ptc.ts`):

- **每个子调用都带着外层 `run_code` 的不透明 `parent` token**,走 pre-execute、审批、guard、execute、post-execute 全套。沙箱模式、审批策略、hooks 桥对子调用同样生效
- **子调用 id 是 `<parent>:ptc:<n>`**,按提交顺序编号。消费方应当把它当不透明字符串,只做相等比较
- **日志里每个真正启动的子调用记一对事件**:`tool/ptc-dispatch-start`(id、名字、规范化后的参数)和 `tool/ptc-dispatch`(结果内容、`isError`、可选的展示元数据 `meta` 和结构化错误)。两者都只进日志,`deriveMessages()` 会忽略它们,子调用永远不会重新进入模型上下文。排队时就被放弃的调用不记录
- **`meta` 字段**是 2026-10-05 的持久化变更加的(`docs/persistence-changes/2026-10-05-ptc-operation-metadata.md`),让历史里保留操作当时的目录和文件目标;同版本变更,旧记录照样有效
- **日志副本可以单独瘦身**。`tools/ptc-dispatch-log` waterfall 只改写写进日志的那份内容,`spill-policy` 用它截断超大的子结果;程序本身拿到的仍是完整值
- **并发上限是 `maxParallelSubCalls`**,默认 10,设成 1 恢复严格串行
- **拒绝变成程序里的异常**。策略拒绝或审批未通过的子调用,在程序里表现为 `ToolCallError` 拒绝;子调用的 `additionalContexts` 被省略,以保证外层 call/result 的相邻关系

---

## 六、`ctx.ptcRuntime` 接缝

"运行一段程序"本身是一个能力接缝(12 篇第七节)。Service Definition 是 `dsh-ptc-runtime`,它对工具一无所知:拿到一段程序和若干组命名的异步绑定,跑完后报告 `{ value, logs, error? }`。

### 6.1 两步:resolve 和 run

- `resolve(request)`:校验调用方的选项,补上部署默认值(工作目录、截止时间、沙箱策略)
- `run(spec)`:执行完全解析过的输入,不再自己补任何缺失值

`PtcRunRequest` 的主要字段:`program`、`bindings`(每组成为程序里的一个全局对象,PTC 传的是 `tools`)、`cwd`、`timeoutMs`(省略用默认值,`null` 表示不设耗时上限)、`sandboxPolicy`、`stateOwner`(可选的内存状态归属)、`signal`。

**跨边界的值只能是无损 JSON**:绑定的参数和返回值、程序的完成值,都必须能无损地 JSON 往返,否则以描述性错误拒绝,而不是悄悄损坏数据。

### 6.2 失败分类

失败是结果里的一个字段,不是 `run()` 的异常。各种失败相互正交,分开报告:

| kind | 含义 |
| --- | --- |
| `exception` | 程序抛错,或解析、转换失败 |
| `timeout` | 实现自有的预算耗尽 |
| `abort` | `signal` 触发 |
| `worker-exit` | 执行载体没结算就死了(比如 OOM) |
| `invalid-output` | 完成值不是无损 JSON |
| `output-limit` | 日志加完成值的序列化大小超过上限 |
| `protocol` | 程序发来非法或超预算的控制消息 |
| `sandbox-unavailable` | 无法建立要求的隔离 |

### 6.3 现有的 provider

| provider | 状态 | 要点 |
| --- | --- | --- |
| `dsh-ptc-runtime-node` | base 默认挂载 | TypeScript,每次调用一个新 Node 进程,见第七节 |
| `dsh-experimental-ptc-runtime-python` | 实验性,没有任何出厂 profile 启用 | CPython 3.10+,仅 macOS / Linux;每次一个新进程,不保留状态;不支持显式 `timeoutMs` 覆盖,截止时间由 `maxWallMs`(默认 600000)决定;子进程只拿到 `TMPDIR` |

用 Python 运行时有一个连带影响:workflow 引擎 `workflow-ptc` 只接受 TypeScript 运行时,所以 Python 组合必须禁用 `workflow-ptc`、`tool-workflow` 和任何启用的 `tool-ralph` 行。

---

## 七、ptc-runtime-node:程序在哪跑、怎么隔离

### 7.1 隔离方式

按 `packages/ptc-runtime/ptc-runtime-node/README.md`:

- **每次调用一个全新的 Node 进程**(默认 `executionMode: per-call`),和 Bash 走**同一套操作系统沙箱策略**:先通过 `ctx.sandbox` 包装 argv,再经 `ctx.subprocess` 启动
- **环境变量被清空**。子进程的 OS 环境只保留可执行文件搜索路径、Windows 系统路径和临时目录,程序可见的 `process.env` 被换成空对象。网络代理指南也写明,workflow 和 Node ptc-runtime 进程拿不到代理设置,模型写的脚本因此读不到可能带密码的代理 URL
- **V8 堆上限**默认 512 MiB(`maxOldGenerationSizeMb`)。注意这不是进程树的内存上限,原生分配和子孙进程不受它约束
- **控制通道和输出分开**。绑定调用走长度分帧的 JSON 控制通道,和程序的 stdout/stderr 分开;宿主会校验帧大小、调用 id 和绑定名,模型写的代码被当作不可信的对端
- **程序里直接用 Node API**(文件、网络、子进程)也是允许的,但受所选沙箱模式约束。和 Bash 一样,沙箱只管文件效果,不管网络(05 篇)

### 7.2 配置

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| `executionMode` | `per-call` | `persistent-in-memory` 为每个 agent 保留一个受限的 REPL |
| `timeoutMs` | 120000 | 默认耗时上限,**包含等待子工具和审批的时间** |
| `maxTimeoutMs` | 600000 | `run_code` 里 `timeoutMs` 的上限 |
| `maxOutputBytes` | 67108864 | 日志加完成值或诊断信息的总预算 |
| `maxOldGenerationSizeMb` | 512 | V8 老生代堆上限 |
| `maxPendingCalls` | 128 | 同时进行的绑定调用数 |
| `graceMs` | 3000 | 终止和排空输出的宽限时间 |

耗时上限是墙钟时间,不是 CPU 计量。超时或取消会通过宿主的托管进程范围停掉死循环。

### 7.3 持久 REPL 模式

需要在多次 `run_code` 之间保留变量时,可以用 patch 打开(README 示例):

```yaml
- id: ptc-runtime
  config:
    executionMode: persistent-in-memory
```

这时每个活着的 agent 有自己的进程,顶层变量、函数、导入的模块跨调用和跨 turn 保留。写法也变了:不支持顶层 `return`,改用最后一个表达式作为结果。这些内存是尽力而为的,从不落盘;重启、超时、取消、协议错误、进程退出都会清空它,恢复会话或 fork 出的 agent 都从空内存开始。会话日志仍然记录程序、子调用和可见结果。

### 7.4 提权

`run_code` 带 `sandbox_permissions` 时必须同时给出非空的 `justification`,程序启动前先走审批:

- 批准的权限**只对这一次程序执行**生效,会话的常设策略不变,程序里的子工具仍按各自的权限走
- 一次性提权在临时环境里执行,读不到常设 REPL 里的变量
- **被拒绝的程序不会自动重放**,因为前面的副作用可能已经提交了。模型应该先检查已经发生了什么,再显式重试
- 会话的沙箱模式一旦变更,受影响的 PTC 调用会被立即取消

---

## 八、不只是 `run_code`

同一个 Node 运行时还服务于 workflow:`workflow-ptc` 在新的 Node 进程里跑 JavaScript workflow 脚本,沿用调用方会话的文件沙箱策略,脚本里的 `agent()`、`parallel()`、`pipeline()` 等钩子再去调度子代理(25 篇)。和 `run_code` 不同,workflow 运行没有总体耗时上限,服务调用时传的是 `timeoutMs: null`。

PTC 预设里也挂了 workflow 引擎和 `tool-workflow`。两者共享同一个运行时,所以把 `ptc-runtime` 行换成别的 provider 时,要确认 workflow 那边还能用。

---

## 九、取舍

| 维度 | PTC 的收益 | PTC 的代价 |
| --- | --- | --- |
| 往返次数 | 多步工具工作压成一次 `run_code` | 程序写错了要整段重来 |
| 上下文 | 中间结果留在程序里,只回传打印和返回的内容 | 模型挑错了输出就看不到需要的信息,只能再跑一次 |
| token | 省掉中间结果的重复发送 | 工具 schema 换成了 SDK 文本加一个传输 schema,tools README 明说不保证整体一定更省 |
| KV Cache | 工具集合和 SDK 不变时前缀稳定 | 切换模式、改变工具集合会从第一个变化的 token 起失效 |
| 可调试性 | 每个子调用都有 `tool/ptc-dispatch` 日志 | 中间规范值只在执行期存在,无法从会话重放中重建 |
| 模型能力 | 擅长写代码的模型能一次组合多个工具 | 依赖模型写出正确的 TypeScript;能力弱的模型更容易陷在报错里 |
| 资源 | — | 中间值在字节上不受限,可能撑爆进程内存;只有外层输出有硬上限 |

什么时候用:批量读取、搜索后过滤、扇出再汇总这类机械性的多步工作,PTC 优势明显。需要模型逐步观察、边看边判断的探索性工作,原生调用更直接。dsh 允许不同预设各选各的,同一个进程里可以同时有原生会话和 PTC 会话。

---

## 踩坑

1. **以为 PTC 绕过了权限**——每个子调用都走完整的 `tools/*` 管线,沙箱、审批、guard 一个不少。被拒的子调用在程序里抛 `ToolCallError`
2. **在 PTC 会话里发原生工具调用**——除 `run_code` 以外一律 `UNKNOWN_TOOL`。看到这个错误,说明模型没读懂 `tools:ptc-only` 规则,而不是工具没注册
3. **程序里算完了却没 `return` 也没打印**——模型只看到 `(run_code completed with no output)`。程序输出只有 `return` 和 `console.log` 两条路
4. **`Promise.all` 一堆 `bash` 期待并发**——`bash` 没有声明并发安全,按提交顺序串行执行;只有 `read` 这类工具才会重叠
5. **用 `enum` 或 namespace**——只接受可擦除的 TypeScript,这类语法会解析失败,报 `exception`
6. **持久 REPL 里写顶层 `return`**——REPL 模式不支持,用最后一个表达式作为结果;重复声明同名的 `let` / `const` 也会报错
7. **把持久 REPL 的变量当成可靠状态**——超时、取消、重启都会清空它,也不会写进会话日志。重要的状态写到文件里
8. **长任务被 120 秒截断**——默认上限包含等子工具和审批的时间,可以在 `run_code` 里传 `timeoutMs`,上限 600 秒。真正的长任务用后台 job 或 workflow
9. **只把 `DSH_TOOLS_MODE` 写进团队配置**——它被标成临时开关,以后会移除。按预设选择用 `dsh-agent-tool-presentation`,部署级默认用 `tools` 行的 `mode`
10. **换成 Python 运行时后 workflow 坏了**——`workflow-ptc` 只接受 TypeScript 运行时,要同时禁用 `workflow-ptc`、`tool-workflow`、`tool-ralph` 行

## 源码与文档索引

- `packages/core/tools/README.md`(PTC mode、Model Experience 两节)
- `packages/core/tools/src/ptc.ts`、`packages/core/tools/src/ts-types.ts`、`packages/core/tools/src/types.ts`
- `docs/subsystems/ptc-runtime.md`、`packages/ptc-runtime/ptc-runtime/README.md`
- `packages/ptc-runtime/ptc-runtime-node/README.md`
- `packages/experimental/ptc-runtime-python/README.md`
- `packages/core/agent-tool-presentation/README.md`
- `packages/bundle/web-app/presets/ptc.patch.yml`、`packages/bundle/web-app/cordis.patch.yml`(`tools` 行)
- `docs/persistence-changes/2026-10-05-ptc-operation-metadata.md`
- `docs/upgrade-guide/v0.2.1-alpha.1/tool-presentation-mode/guide.md`
- `.agents/notes/implemented/feature/2026-06-15-ptc.md`
- `packages/session/session-format-v2-to-v3/README.md`(code-dispatch 到 ptc-dispatch 的重命名)
- `packages/workflow/workflow-ptc/README.md`

---

下一篇:`15-LLM层与DeepSeek线协议.md`,讲 LLM 层:LlmAdapter 契约和 StreamChunk、Anthropic 兼容的 Messages API、dsh 自己的线协议扩展,以及 token meter。
