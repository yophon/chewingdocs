# Agent Loop:turn、step 与可替换的主循环

09、10 篇讲了 Cordis 的插件、服务和事件,11 篇讲了启动时这些插件怎么按行 id 叠成一棵树。这一篇进入树里最核心的一行:`agent-loop`。"调模型、跑工具、再调模型"这个循环,也就是 aiLearning 26 篇讲的 ReAct 模式,在 dsh 里就落在这个包上。

和 Claude Code 不同,dsh 的主循环本身也只是一个插件。它通过 `ctx.agents.setFactory()` 把自己登记成 agent 工厂,其他插件只依赖 `ctx.agents`,从不 import 它。这一篇讲清楚循环每一步在做什么、哪些点能插手,以及"主循环可替换"具体指什么、要付出什么代价。

> 一句话先记住:**step 是一次模型请求加上它引出的工具调用,turn 是把已接纳的输入消化完的零到多个 step**。循环里每个能插手的点都是 `agent/*` 或 `tools/*` 事件,模型能看到的每条事实都先写进会话日志。所以加功能几乎不用改循环;真要换循环,新实现也得守住同一套事件和日志契约。

---

## 一、四个层级:step、turn、round、exchange

`docs/glossary.md` 的 loop hierarchy 一节给循环层级定了四个词,仓库里每个概念只用一个固定术语:

| 术语 | 中文(按 `docs/i18n/terminology.md`) | 定义 | 例子 |
| --- | --- | --- | --- |
| **step** | 步骤 | 一次模型请求,加上它的回复引出的工具执行 | 模型回了 3 个工具调用,跑完这 3 个,算 1 个 step |
| **turn** | 轮次 | 把已接纳的输入消化一遍,含零到多个 step;模型和工具都停下、或终止策略介入时结束 | 你发一句话,模型连调 5 次工具再作答,是 1 个 turn、6 个 step |
| **round** | Round(保留英文) | 外层策略的一次迭代,里面装着一个 turn | 一个 goal round、一次 Ralph 新 agent 尝试 |
| **exchange** | — | 从一个"首个 step 接纳了人类输入"的 turn 起,到下一个这样的 turn 之前的连续 turn | 子代理结束、goal round、定时任务唤醒的 turn,都并入前一个 exchange |

几个容易混的点:

- **turn 可以没有 step**:提议的 step 被 `agent/pre-step` 拒绝时,turn 照样打开、关闭,只是一次模型请求都不发
- **round 的计数归策略自己管**:goal 的 round 上限只数 goal 发起的 turn,同一会话里你手动发的 turn 不占额度(08 篇)
- **Ralph loop 不是循环的一种模式**:glossary 明说它是由 workflow 和 subagent 原语组合出来的工具策略,不是 agent-loop 的运行模式(25 篇)

---

## 二、一个 turn 里发生了什么

### 2.1 流程

下面按 `docs/architecture.md` 的 Turn flow 和 `docs/agent-lifecycle.md` 的时序图整理。行首 `[S]` 表示写进会话日志的持久事件,`[L]` 表示只在进程内派发的实时事件,其余是 waterfall 扩展点或内部动作:

```text
[S] turn/start
    领取输入:全部 next-step 收件 + 至多一条 next-turn 消息        [L] agent/inbox/claimed
    system-prompt/assemble        组装提示词分段 + 工具 schema
    agent/pre-step  (waterfall)   ── reject,或首批被改写为空 ─→ 关闭 turn,不开 step
        │ enter(messages, startsRequestSeries?)
[S] step/start
    agent/request (waterfall) → ctx.llm.prepareCall()   这两步里取消:提示词和用户消息都不提交
[S] system/message(逐节点对账) + user/message(每条接纳的消息)
[S] request/header、request/context(有变化时才写)
    从日志派生并冻结本次请求的历史
    llm/stream (waterfall)                              [L] agent/assistant-stream start / chunk*
[S] assistant/message(成功)或 assistant/attempt(失败、重试、取消)   [L] ... end
    请求失败 → agent/request-error (waterfall) → 返回 retry 就在同一个 step 里重来
[S] tool/call* → tools/pre-execute → tools/execute → tools/post-execute → [S] tool/result*
[S] step/end
    工具还欠模型一次请求,或来了新的 next-step 输入 → 回到"领取输入",开下一个 step
    自然停下且 next-step 为空 → agent/turn-stopping (serial)
[S] turn/end
```

step 之间只领取 next-step 收件,不再领取 next-turn 消息;每个 step 都会重新组装提示词并跑一遍 `agent/pre-step`。工具管线那一行展开讲在 13 篇,`llm/stream` 和 `prepareCall()` 在 15 篇,提示词怎么作为 `system/message` 进历史在 16 篇。

### 2.2 读这张图要抓住的几条

- **请求可以从日志重建**。架构文档的原话是 "Model-visible means logged"。请求只由 `header.config`、`deriveMessages()` 派生的历史和 `header.tools` 三部分组成,没有单独的 `system` 字段,系统提示词本身也是历史里的 `system/message`
- **`agent/pre-step` 是派生请求前唯一的 waterfall**。它决定这个 step 接纳哪些消息。仓库里挂在上面的有 `compaction-basic`(按上下文压力触发压缩)、`plan-mode`、`agent-instructions`、`time-context`、`goal-round-driver`、`repeat-tool-reminder`,以及实验性的 hooks 桥等(见 `docs/event-producer-consumer.md`)
- **`agent/request` 改不了消息**。它只能替换这次调用的配置(`LlmCallConfig`,比如换 provider 或 model)。要让模型看到新内容,必须走会写日志的渠道,比如 `agent.inject()`
- **重试不会把前面重走一遍**。retry 不重新组装提示词、不重跑 `agent/pre-step`、也不重复接纳用户消息,只重新 prepare 调用、对账提示词,再派生请求
- **`agent/turn-stopping` 是 serial,没有 `next()`**。listener 想反对结束,就调 `agent.steer(...)`,循环会重读收件箱:有新的 steering 就再跑一个 step,没有就关闭 turn。反过来,工具结果带上 `concludesTurn`,可以让 turn 在这个 step 后结束

### 2.3 PreStepDecision

`agent/pre-step` 的 payload 是 `{ agent, messages, turn, step, signal }`,返回值类型定义在 `packages/core/agent/src/runtime-types.ts`:

```ts
/** Whether and with which messages the loop enters a proposed step. */
type PreStepDecision =
  | { kind: 'reject' }
  | {
    kind: 'enter'
    messages: UserMessage[]
    /** Start a distinct model-message series before this step's admitted messages. */
    startsRequestSeries?: true
  }
```

- **reject**:不开 step。已经领取的消息到此为止,既不会作为 `user/message` 写入,也不算被丢弃(不发 `agent/inbox/discarded`)
- **enter**:给出这个 step 的完整消息批。被领取、但最终决定里没包含的消息保持移除;领取之后才进收件箱的消息仍然待处理
- **包装型 listener** 调 `next()` 拿到下游的决定后,要用 `{ ...decision, messages }` 的写法保留 `startsRequestSeries`,除非你就是要替换它

---

## 三、持久事件与实时事件

| 域 | 例子 | 存在哪 | 用途 |
| --- | --- | --- | --- |
| 会话事件(持久) | `turn/start`、`turn/end`、`step/start`、`step/end`、`user/message`、`system/message`、`assistant/message`、`assistant/attempt`、`tool/call`、`tool/result`、`request/header`、`request/context` | 会话日志,经 `session/event` 广播 | 重放、resume、fork、转录、遥测 |
| agent 事件(实时) | `agent/status`、`agent/inbox/inserted`、`agent/inbox/claimed`、`agent/inbox/discarded`、`agent/assistant-stream`、`agent/pre-step`、`agent/request`、`agent/request-error`、`agent/turn-stopping`、`agent/created`、`agent/disposed`、`agent/error` | 只在进程内派发 | 观察、拦截正在进行的工作 |
| 能力事件 | `tools/*`、`fs/*`、`llm/stream`、`telemetry/*` | 只在进程内派发 | 在某个接缝上挂策略和适配器,不用 import 循环 |

两个例外要记住:

1. **`agent/inbox/spliced` 带着 `agent/` 前缀,却是持久的会话事件**。收件箱的每次插入、编辑、删除、领取都会落成一条 splice,所以没有活着的 agent 时,冷读也能从日志里折叠出还有哪些待处理消息
2. **`agent/assistant-stream` 的 chunk 帧是瞬时的**。持久的是结算时写入的 `assistant/message` 或 `assistant/attempt`,里面嵌着完整的带时间戳流。进程在结算前硬崩,这次尝试就不留痕迹

要做可重放的 UI 或 SDK 集成,读 `session/event`;要实时控制队列、拦截请求,用 `agent/*`。日志格式本身见 17 篇。

---

## 四、失败与重试:`agent/request-error`

模型请求失败(最终 adapter 层报出的失败)时,循环先写一条 `assistant/attempt`,再派发 `agent/request-error` waterfall。处理者不调 `next()`、直接返回 `{ kind: 'retry' }` 表示接管恢复;默认返回 `undefined`,失败就是终态。base 里有三个处理者:

| 处理者 | 管什么 |
| --- | --- |
| `dsh-llm-retry`(行 id `llm-retry`) | 瞬时故障重试。插件本身没有配置,策略写在各 provider adapter 的 `retryPolicy` 上 |
| `dsh-compaction-basic` | 只处理标准的上下文溢出:先跑 tool-result-pruner,再做摘要;只有裁剪或摘要确实推进了替换代次才重试(16 篇) |
| `dsh-compaction-image-offload` | 图片预算超限:把最早的图片换成占位符再重试 |

`dsh-llm-retry` 的默认行为(未配置 `retryPolicy` 时的 normal 模式):对 `EMPTY_RESPONSE`、`RATE_LIMIT`、`SERVER`、`TIMEOUT`、`TRANSPORT` 最多重试 5 次,指数退避从 500 ms 到 10 s,10% 抖动。`always` 模式则无限重试,直到成功、取消或插件卸载。每次重试会先写 `llm/retry`、开始前再写 `llm/retry-started`,这两条都不进模型历史。**每次重试都是一次新的计费请求**。

插件抛错的处理方式不一样:中间件、工具、结果处理等扩展失败会直接关闭 turn。按 agent-loop README 的说法,插件失败结束的是这个 turn,不是整个循环。

失败的 step 收尾时,循环会给没有结果的工具调用补上 error 结果,保证历史里 call 和 result 成对:

| 情况 | 补的结果 |
| --- | --- |
| 记了 `tool/call`,但没有提交结果 | `TOOL_OUTCOME_UNKNOWN` |
| 连 `tool/call` 都没记 | `TOOL_NOT_STARTED` |
| 取消导致没派发出去的调用 | 合成一对 `tool/call` + `ABORTED_BEFORE_DISPATCH` |

这样后续请求的历史是合法的,同时**不会自动重试结果不确定的操作**。

---

## 五、Agent 句柄:从外面驱动一个 agent

UI、ACP 桥、hooks 桥、编排器都面向 `Agent` 接口编程(`docs/subsystems/core.md`,源码在 `packages/core/agent`):

| 成员 | 作用 |
| --- | --- |
| `id` | `SessionId`,agent 和会话共用一个 id |
| `options` | `provider`、`model`、`reasoningEffort`、`maxTokens` |
| `session` / `ctx` | 它驱动的会话 / agent 作用域的 Context,通过它注册的东西随 agent 销毁一起卸载 |
| `inbox` | 两个待处理列表:`nextTurn`(各自开新 turn 的消息)和 `nextStep`(等最近一个 step 边界的输入) |
| `status` | `'idle'` 或 `'running'`;销毁不是第三种状态,而是从注册表移除并发 `agent/disposed` |
| `send(message, target, wakeup)` | 统一入口:投到 `'next-turn'` 或 `'next-step'`,并决定是否唤醒 |
| `followup(message)` | 排一个新 turn 并唤醒;每条消息独占它自己的 turn |
| `steer(message)` | 送到最近的 step 边界;空闲时直接开一个 turn |
| `inject(message)` | 放进下一个 pre-step,**不唤醒**;空闲的 agent 要等 followup 或 steer 来叫醒 |
| `cancel(cause, options?)` | 中止当前活动;默认清空收件箱,`keepInbox: true` 保留 |
| `whenIdle()` | 等整个 agent 静止,不对应某条具体消息的完成 |
| `runMaintenance(task)` | 在真正空闲时跑一个不算 turn 的维护任务,期间 status 仍是 `idle`;`compaction-basic` 和子代理管理器都用到它 |

取消原因是一个封闭联合:`user`、`parent`、`hook`(带 `reason`)、`disposed`,最终记进 `turn/end` 的 `{ kind: 'aborted', reason }`。

程序化创建走 `ctx.agents.create()`,返回 `AgentHandle`(agent-loop README 的示例,这里换成 base 里实际出现的路由名):

```ts
const handle = await ctx.agents.create({
  sessionId,
  agentOptions: { provider: 'deepseek-official', model: 'deepseek-flash' },
  setup: (agentCtx, agent) => {
    // 发布前的窗口:在这里做 agent 作用域的注册,不要驱动 agent
  },
})
```

`handle.dispose()` 是一种能力:只有创建者拿得到,`ctx.agents.get(id)` 返回的是不带销毁能力的裸 `Agent`。`resume()` 用法相同,从持久化存储加载已有会话。

---

## 六、主循环是怎么"插"进去的

### 6.1 AgentLoop 只是一个 Service

`packages/core/agent-loop/src/index.ts` 的骨架:

```ts
export class AgentLoop extends Service implements AgentFactory {
  static inject = ['agents', 'sessions', 'llm', 'tools', 'systemPrompt', 'sessionProjections']

  constructor(ctx: Context, config: Config) {
    super(ctx, 'agentLoop')
    // ... 注册 turnBoundary、inbox 两个会话投影
    ctx.effect(() => ctx.agents.setFactory(this), 'agentLoop.setFactory()')
    // ... 启动 config.agents 里声明的 agent
  }
}
```

逐项看:

- **`inject` 列表**说明它依赖六个服务:agent 注册表、会话存储、LLM 层、工具注册表、提示词组装、会话投影。会话持久化 `sessionPersistence` 是可选的,通过 `ctx.inject(['sessionPersistence'], ...)` 按需接入,没挂就是纯内存会话
- **`setFactory()` 包在 `ctx.effect` 里**,插件卸载时自动撤销登记(10 篇讲的可回收注册)
- **真正干活的是包内部的 `ReactLoopAgent`**(`src/agent.ts`),每个 agent 一个 driver,运行在 `ctx.agents.withInitiator(agent, ...)` 里,这样工具、审批等下游能知道是哪个 agent 发起的调用
- **`AgentFactory` 接口只有两个方法**:`createAgent(ownerCtx, options)` 和 `resume(ownerCtx, options)`,定义在 `packages/core/agent` 里,而不是 agent-loop 里

依赖方向是单向的:

```text
UI / ACP / 子代理 / hooks 桥 ──依赖──→ ctx.agents(dsh-agent:接口 + 注册表)
                                         ↑ setFactory()
                                 dsh-agent-loop(AgentLoop + ReactLoopAgent)
```

`docs/subsystems/core.md` 的原则是:扩展插件依赖 `agent`,永远不依赖 `agent-loop`,循环才能保持可替换。base 里这一行很朴素:

```yaml
- id: agent-loop
  name: '@deepseek-ai/dsh-agent-loop'
  config:
    agents: []
```

`agents` 是启动时创建的声明式 agent,Web 模式下为空,会话由客户端请求创建。另一个字段 `maxParallelToolCalls` 默认 10,是 volatile 配置,每次调度下一组工具时重新读取。

### 6.2 工具调用怎么调度

模型一次回复里可能有多个工具调用。调度逻辑在 `packages/core/agent-loop/src/tool-calls.ts`:

- 每个调用开始前,循环问注册表 `ctx.tools.executionMode(exec)`,得到 `parallel` 或 `exclusive`
- 工具定义里的 `isConcurrencySafe(args)` 只有返回 `true` 才算 `parallel`;不声明、抛异常、返回其他值,一律 `exclusive`
- `exclusive` 调用形成**屏障**,单独执行;连续的 `parallel` 调用进入**有上限的滚动池**,同时在飞的数量不超过 `maxParallelToolCalls`
- 每个调用启动前都会**重新分类**,运行中注册表变了也能生成新的屏障
- 派发可以重叠,但 pre/post 策略、结果和附加上下文**按模型给出的顺序提交**

```text
模型回复里的调用顺序:read A, read B, edit C, read D
  [read A, read B]  并行池
  [edit C]          独占屏障:等前面的池排空后单独执行
  [read D]          新的并行组
```

在 0.2.1-rc.2 的源码里,声明了 `isConcurrencySafe` 的有 `read`、`read_image`、`web_fetch`、`web_search` 和启动子代理的工具;`bash`、`write`、`edit`、`grep`、`glob` 没有声明,按独占执行。这份清单随版本变化,以源码为准。取消时调度器停止启动新调用,等已启动的跑完并提交结果,再给没启动的补 `ABORTED_BEFORE_DISPATCH`。

### 6.3 真要换一个主循环

先说事实:**截至 0.2.1-rc.2,仓库里实现 `AgentFactory` 的只有 `dsh-agent-loop` 一个**(另外只有测试代码里的桩),没有官方的替代主循环,也没有替换循环的官方示例。agent-loop README 的建议是:只有当"调模型、跑工具、重复"这个标准生命周期不够用时,才去写自定义的 `Agent` 实现。下面是从接口推出来的做法:

```yaml
# 你自己的 patch 文件(--patch 叠加,见 11 篇)
- id: agent-loop
  disabled: true

- insert:
    - id: my-loop
      name: 'my-dsh-loop'   # 你的插件包
```

你的插件需要:

1. 实现 `createAgent` 和 `resume`,在构造时 `ctx.agents.setFactory(this)`。已有工厂时 `setFactory` 会直接抛错,所以必须先禁用 `agent-loop` 行
2. 把每个 driver 的完整前台生命周期包在 `ctx.agents.withInitiator(agent, ...)` 里
3. 写同样的会话事件(`turn/*`、`step/*`、`user/message`、`assistant/message`、`tool/call`、`tool/result`……),守住"模型可见即已记录"。持久化、resume、fork、压缩、UI 全都依赖这些事件
4. 工具走公开的 `ctx.tools.execute()`。agent-loop 用的并行调度视图 `TOOL_RUNTIME_SCHEDULER` 标着 `@internal`,不是扩展点

同时你会失去:agent-loop 注册的 `inbox` 和 `turnBoundary` 两个投影(`turnBoundary` 缺席时,读者按"没有打开的 turn"处理,有的读者会直接报错)、`ctx.agentLoop` 服务和它的 `maxParallelToolCalls`、各种请求头和提示词对账的细节。

所以更现实的路线是**不换循环,挂扩展点**。extension cookbook 把每个产品功能都映射到了某个扩展点上,原话是 "No row modifies the loop":

| 想要的效果 | 不改循环的做法 |
| --- | --- |
| 每个 step 前过滤、改写或拒绝输入 | `agent/pre-step` |
| 给模型补一条上下文 | `agent.inject()`,在下一个被接纳的请求里出现 |
| 按条件切换模型路由 | `agent/request` |
| turn 要结束时让它继续 | `agent/turn-stopping` 里 `agent.steer()` |
| 跑完一轮自动开下一轮(`/loop`) | 监听 `turn/end` 会话事件后 `followup()` |
| 某个工具成功后结束 turn | 工具里调 `concludeTurn()` |
| 工具级的放行、拒绝、审批 | `tools/pre-execute` 和 `ctx.tools.guard()`(13 篇) |

对照 Claude Code:它的主循环是闭源产品的一部分,能扩展的只有 hooks 这一层(claudeLearning 11 篇)。`Stop` hook 返回 block 让 Claude 接着干,在 dsh 里对应 `agent/turn-stopping` 里 steer;`PreToolUse` 对应 `tools/pre-execute`。差别在于 dsh 的扩展点是进程内的类型化 waterfall,而且循环本身也能整体替换。

---

## 七、能力接缝:换一个 provider,整个产品跟着变

主循环可替换只是 dsh 设计的一个特例。更普遍的机制是**能力接缝**(capability seam,术语表译作"能力 seam",本系列叫能力接缝):一个可替换的能力由三种角色组成。

| 角色 | 含义 | `packages/shell` 这个标准例子 |
| --- | --- | --- |
| Service Definition | 拥有 `ctx.<key>` 和词汇类型的 Cordis `Service`(抽象类或具体注册表,不是 TypeScript interface) | `dsh-shell`,提供 `ctx.shell` |
| Service Provider | 一个或多个实现 | `dsh-bash-local`、`dsh-bash-sandbox`(还有 `dsh-pwsh-local`) |
| Consumer | 注入该服务的使用方,通常是面向模型的工具 | `dsh-tool-bash`(还有 `tool-pwsh` 和两个 hooks 桥) |

单独一个角色不叫接缝,只有三者合起来才是。base 在非 Windows 上挂的是 `bash-sandbox` 这个 provider,`tool-bash` 完全不知道命令有没有被沙箱包住。换成远程 provider,工具一行不用改。

`docs/capability-seams.md` 把每个服务标成 `core`、`seam` 或 `service`。和本层几篇相关的接缝:

| `ctx` 键 | Provider(节选) | Consumer(节选) | 详见 |
| --- | --- | --- | --- |
| `ctx.llm` | `llm-deepseek`、`llm-pi-ai`、`llm-replay` | `agent-loop`、`compaction-basic` | 15、21 篇 |
| `ctx.shell` | `bash-local`、`bash-sandbox`、`pwsh-local` | `tool-bash`、`tool-pwsh` | 13 篇 |
| `ctx.subprocess` | `subprocess-local`、`subprocess-ssh` | bash 执行器、LSP、外部子代理后端 | 29 篇 |
| `ctx.sandbox` | `sandbox-local`、`sandbox-ssh` | `bash-sandbox`、`terminal-bash` | 05、13 篇 |
| `ctx.fs` | `fs-local`、`fs-sandbox`、`fs-ssh` | `tool-fs` | 13 篇 |
| `ctx.approval` | `user-approval`(定义和实现同包) | `tools`、`tool-bash`、`acp` | 13 篇 |
| `ctx.ptcRuntime` | `ptc-runtime-node`、实验性 Python 运行时 | `tools`、`workflow-ptc` | 14 篇 |
| `ctx.spillStore` | `spill-local` | `spill-policy` | 13 篇 |
| `ctx.compaction` | `compaction-basic` | `compaction-basic` | 16 篇 |
| `ctx.subagents` | spawn / fork in-process、acp、codex、claude-code、dsh-sdk | `tool-subagent` 等 | 24 篇 |
| `ctx.sessionPersistence` | `session-persistence-jsonl` | `agent-loop`、`session-query` 等 | 17 篇 |

注意 `ctx.agents` 和 `ctx.tools` 在这张表里标的是 `core` 而不是 `seam`:它们是脊柱服务,本身不换。主循环的可替换性来自 `ctx.agents` 上那个工厂槽位,而不是把 `ctx.agents` 整个换掉。架构文档举的例子是:文件系统和子进程 provider 共享同一个"执行世界",把它们指向远程沙箱,Bash、PTY、LSP 就一起搬过去了,不用 fork 任何 provider。

---

## 踩坑

1. **把 turn 和 step 当成一回事**——一句提问可能对应一个 turn、多个 step。按 turn 统计的指标(比如 goal round)和按 step 统计的指标(请求数、计费)差得很远
2. **在 `agent/request` 里往消息里塞内容**——这个 waterfall 改不了消息,只能换调用配置。要给模型加上下文用 `agent.inject()`,它会写进日志
3. **包装 `agent/pre-step` 时丢了 `startsRequestSeries`**——调完 `next()` 后自己拼一个新的 enter 决定,会悄悄吃掉下游的系列声明。用 `{ ...decision, messages }`
4. **以为 `agent/` 前缀的事件都是瞬时的**——`agent/inbox/spliced` 是持久会话事件。反过来,`agent/assistant-stream` 的 chunk 不落盘,做转录要读 `assistant/message`
5. **用 `inject()` 叫醒空闲的 agent**——它不唤醒 driver,消息会一直待在收件箱里,直到有 followup 或 steer。要立即生效用 `steer()`
6. **以为失败重试免费**——`dsh-llm-retry` 的每次重试都是一次新的计费请求,`always` 模式没有次数上限
7. **为了一个功能去 fork 主循环**——cookbook 里每个产品功能都挂在扩展点上,没有一个改循环。先查有没有对应的 `agent/*` 或 `tools/*` 事件
8. **禁用了 `agent-loop` 却没提供新工厂**——`ctx.agents.create()` 会报 `no agent factory registered (load an agent-loop plugin)`。同时 `inbox` / `turnBoundary` 投影也没了,依赖它们的插件会降级或报错
9. **以为所有工具都会并行执行**——只有显式声明 `isConcurrencySafe` 的工具进并行池,`bash`、`edit` 等都按独占屏障串行。`maxParallelToolCalls: 1` 可以强制全部串行
10. **把 Ralph loop 当成 agent-loop 的一种模式**——它是组合出来的工具策略,和本篇的循环是两层东西

## 源码与文档索引

- `docs/glossary.md`(loop hierarchy、capability-seam 两节)
- `docs/architecture.md`(Turn flow、Events、Capability seams 三节)
- `docs/agent-lifecycle.md`
- `docs/subsystems/core.md`
- `packages/core/agent/src/index.ts`、`packages/core/agent/src/runtime-types.ts`
- `packages/core/agent-loop/src/index.ts`、`packages/core/agent-loop/src/tool-calls.ts`、`packages/core/agent-loop/README.md`
- `packages/llm/llm-retry/README.md`
- `docs/capability-seams.md`
- `docs/event-producer-consumer.md`
- `docs/cookbook/extension-cookbook.md`
- `packages/bundle/base/cordis.patch.yml`(`agent-loop`、`llm-retry` 行)

---

下一篇:`13-工具执行管线.md`,讲一个工具调用从模型发出到结果入日志要经过的每一关:pre-execute、审批、guard、execute、post-execute、result,以及大输出怎么 spill。
