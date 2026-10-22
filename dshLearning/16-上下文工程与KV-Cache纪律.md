# 上下文工程与 KV Cache 纪律

15 篇里反复出现几个看起来很绕的设计:system prompt 变化时"追加"而不是"改写",工具增删要用专门的 `tool_addition` 块,usage 里单列 `cacheReadTokens`。这一篇把它们串起来:**dsh 几乎每一个上下文相关的设计选择,都是在保护 provider 侧的缓存前缀**。

KV Cache 为什么能复用前缀、命中了省多少,见 aiInfraLearning 07 篇(KV Cache 心智);上下文工程的一般方法见 aiLearning 24 篇(Context Engineering)。这里不重复原理,只讲 harness 这一侧怎么做:system prompt 怎么分段排序、运行时信息放在哪、工具表怎么变,以及唯一有意改写前缀的操作——压缩。用户怎么用 `/compact` 在 07 篇讲过。

> 一句话先记住:**provider 的前缀缓存只认字节完全相同的前缀。dsh 的办法是把会变的东西往后放**:稳定的指令放在 system prompt 前部,进程相关的路径和运行时事实作为 user 消息追加在历史之后,system prompt 和工具表的变化也尽量追加而不是改写。真正会改写前缀的只有压缩,而压缩有阈值、有日志。

---

## 一、harness 为什么要守前缀

### 1.1 每一步都在重发整个历史

一次模型请求 = system prompt + 工具 schema + 全部历史消息。一个要调好几次工具的轮次,每个步骤都把累积的历史重发一遍。provider 能缓存的是**从第一个 token 开始、字节完全相同的那一段**;只要第 k 个 token 变了,从 k 往后全部重新计算。

所以 harness 侧的问题很具体:**哪些操作会改动已经发过的前缀**。仓库把这件事做成了文档规范——各包 README 的 "Model Experience" 部分固定有三个小节:What the model sees、Token effect、**KV Cache effect**,有 300 多个包 README 都写了这一节。写插件时也该按这个思路评估自己的影响。

### 1.2 什么会破坏前缀

从各包 README 的 KV Cache effect 小节归纳:

| 操作 | 对缓存前缀的影响 |
| --- | --- |
| 普通的历史增长(新的 user / assistant / tool 消息) | 只追加,前缀保留 |
| 推理内容回传 | 每个带推理的轮次追加一段,前缀保留 |
| `llm-retry` 重试 | 从日志重建出同一个请求,前缀保留 |
| system prompt 在 in-history 路由上变化 | 追加在历史之后,前缀保留 |
| system prompt 在未声明 in-history 的路由上变化 | 改写头部,从改动的第一个 token 起失效 |
| 工具 schema 增删、重排、改描述 | 从第一个改动的 schema token 起失效(addition-only 的新增除外) |
| 换 provider 或换模型 | 换了一个缓存域 |
| 压缩、工具结果裁剪、图片卸载 | 从第一个被替换的历史 token 起失效 |

---

## 二、System prompt 怎么组装

### 2.1 四种输入

`dsh-system-prompt` 提供 `ctx.systemPrompt`,所有提示词贡献都注册到这里:

```text
// 段落:按 order 升序拼接,order 相同按名字的码元顺序
ctx.systemPrompt.section({ name: 'tool:bash', order: 100, text: 'Prefer bash for file and process operations.' })

// 变量:在段落里写 {{response_language}},每次组装时解析
ctx.systemPrompt.variable('response_language', () => 'English')
```

| 输入 | 去向 | 适合放什么 |
| --- | --- | --- |
| `section()` | 拼成 system prompt 文本 | 稳定的身份、规则、工具用法 |
| `variable()` | 替换段落里的 <code v-pre>{{name}}</code> | 少量会变的事实,loop 提供 `provider` 和 `model` |
| `context()`(`PromptContext`) | **不进 system prompt**,作为 user 角色快照记入历史 | 工作目录、沙箱和审批策略、进程相关的路径 |
| 工具 schema provider | 模型可见的工具列表 | 一般不用手工接,`ToolRuntime` 自动注册 |

渲染是严格的:引用了没注册的变量、或注册了但没有值,直接让组装失败,而不是发出一个残缺的 prompt。不想被插值的段落设 `interpolate: false`。

### 2.2 段落顺序:稳定的在前,带环境的在后

仓库内的段落从一张集中分配的表里取位置(`getSectionOrder(name)`),节选:

| 名字 | order | 内容 |
| --- | --- | --- |
| `HARNESS_IDENTITY` | -1000 | 固定开场白 `You are an AI agent powered by DeepSeek Harness.` |
| `DEPLOYMENT_PERSONA_PREFIX` | 0 | 部署人设前缀 |
| `PLAN_POLICY` / `TEAM_POLICY` / `PTC_ONLY` | 500 / 600 / 800 | plan mode、agent team、PTC 的策略段 |
| `TOOL_BASH` … `MCP_SERVERS` | 1000 … 3100 | 各工具的使用说明 |
| `TOOLS_SDK` | 5000 | PTC 生成的工具 SDK 说明 |
| `STRUCTURED_OUTPUT` | 9900 | 结构化输出要求 |
| `HARNESS_SOURCE` / `WEB_SURFACE` | 10000 / 10100 | 本地源码路径、本地 Web 地址 |
| `DEPLOYMENT_PERSONA_SUFFIX` | 10200 | 部署人设后缀 |

源码里的注释直接点明了意图:"Local paths and endpoints follow reusable instructions."。路径、端口这类每台机器不一样的东西排在最后,同样的模型、人设和工具下,换个目录或换个端口不影响前面可复用的部分。

配置项也很少:

```yaml
- name: '@deepseek-ai/dsh-system-prompt'
  config:
    includeHarnessIdentity: true    # 关掉只去掉那句固定开场白
    includeRuntimeContext: true
    personaPrefix: ''
    personaSuffix: ''
    toolOrder: ['<unlisted-tools>'] # 必须恰好有一个 rest 占位
```

不配 `toolOrder` 时工具按名字字典序排。理由是注册顺序只是插件加载顺序的副产品,不稳定;名字比较用与 locale 无关的码元顺序,保证每台机器顺序一致。

### 2.3 agent 级覆盖

通过 `agent.ctx` 注册的段落、变量和工具 provider 只对这个 agent 生效,并且**同名时遮蔽全局注册**。底层是 `dsh-scope` 的 `ScopedLayers`:先取全局条目,再叠加该 agent 的同名覆盖。agent 预设替换人设就是靠这个——预设和部署都使用同一个段名 `deployment:persona-prefix`,所以是替换而不是重复。

---

## 三、System prompt 是一条历史消息

### 3.1 surface 节点 0

dsh 的请求里**没有单独的 `system` 字段**,`request/header` 里也不记 prompt。渲染好的 prompt 作为一条 `system/message` 会话事件提交,成为 surface 的第 0 个节点,和其他消息一样从日志派生出来(surface 的机制见 17 篇)。这样 prompt 的每一个版本都在日志里,请求可以完整重建。

### 3.2 prompt 变了怎么办

| 情况 | loop 的做法 | 缓存影响 |
| --- | --- | --- |
| 渲染结果没变 | 不写任何事件 | 无 |
| 路由声明了 `systemPromptUpdate: 'in-history'`,且仍在同一个请求序列里 | 在已缓存的历史**之后追加**一条新的 `system/message` | 历史前缀保留 |
| 路由没声明,或开始了新的请求序列 | 把文本合并回头部节点(其余 system 节点用日志化的空替换清掉) | 从头部第一个改动的 token 起失效,通常等于整个前缀 |
| 渲染结果为空 | 清掉所有活跃的 system 节点 | — |

"新的请求序列"在三种情况下开始:pre-step 决定声明 `startsRequestSeries`、会话发生了 surface 替换(比如压缩)、做了图片卸载决定。单纯 resume 或换 provider / 模型不算。

in-history 也有代价:**每一个保留的 prompt 版本都会在之后的每个请求里继续计费**,直到压缩把它遮蔽或被合并清掉。默认目录里只有 `deepseek-flash` 声明了这个能力(15 篇),其他模型要在 `models` 里显式声明。

---

## 四、运行时上下文:追加在历史之后

`PromptContext` 在源码里的定位就是 "cache-safe counterpart to `PromptSection`"。它也有一张集中分配的顺序表:

| 名字 | order |
| --- | --- |
| `WORKING_DIRECTORY` | 100 |
| `SANDBOX_POLICY` / `APPROVAL_POLICY` | 110 / 115 |
| `SUBAGENT_DELEGATION` / `TEAM_IDENTITY` | 120 / 125 |
| `HARNESS_SOURCE` / `WEB_SURFACE` | 200 / 210 |

注释写得很直白:"Process-specific paths and endpoints stay out of the cached system prompt."

loop 的处理方式:

- 把所有 context 按顺序拼成一个快照,作为 `user/message` 记入历史,来源 `kind` 是 `runtime-context`,`form` 是 `snapshot`,并带上各段的名字和文本
- **只有内容变了,或者压缩把旧快照遮蔽掉了,才追加新快照**;没变就什么都不写
- 全部被关掉时追加一条固定文本 `Current runtime context: none. Earlier runtime-context snapshots no longer apply.`,而不是回头删旧快照
- `includeRuntimeContext: false` 或 `suppressRuntimeContext()` 只去掉可选部分,标了 `required: true` 的运营性上下文保留

插件通过 `agent.inject()` 加的上下文同样以 `user/message` 落在下一个被接纳的请求里。原则是一样的:**变化的信息永远只往尾部追加**。

---

## 五、工具表的纪律

### 5.1 增删工具不改写声明列表

工具一变,loop 会在日志里写一条 `developer/message`,记录新增和移除,这一步与模型能力无关。真正发给模型时,LLM 层按路由的 `toolUpdate` 投影:

| 路由能力 | 新增工具 | 移除工具 |
| --- | --- | --- |
| 未声明 | 每次请求声明完整的当前列表 | 同左 |
| `addition-only` | 声明以 `defer_loading` 形式提前占位,历史里追加 `tool_addition` 块激活 | 从声明列表删除,前缀从改动处失效 |
| `in-history` | 同上 | 保留声明,历史里追加 `tool_removal` 块 |

### 5.2 几处为缓存做的让步

- **plan mode 不收起写工具**。base bundle 里 plan mode 的策略段原文写着 "The tool catalog stays the same across modes for request-cache stability."——写工具照样列着,只靠提示词约束,这也是 08 篇说 plan mode 只是软约束的原因之一。代价是进出 plan mode 会改动 order 500 之后的 system prompt
- **fork 子代理继承父代理的 provider 和模型**。`subagent-fork-in-process` 的 README 明说:shipped 的 fork 工具不开放子代理选路由,这样复制过来的历史仍有资格命中缓存(24 篇)
- **图片按"台阶"卸载**。超出预算时一次卸掉一整档最旧的图片,而不是每来一张新图就挤掉一张旧图、每次都改写前缀
- **压缩摘要请求复用热前缀**,见 6.3

---

## 六、压缩:唯一有意改写前缀的地方

### 6.1 结构

压缩是一个可替换的能力,分三个角色:`dsh-compaction` 定义 `ctx.compaction` 服务(`CompactionEngine`),`dsh-compaction-basic` 是默认实现,`dsh-command-compact` 提供人用的 `/compact` 命令。估算一律交给 `ctx.tokenMeter`(15 篇),`dsh-compaction-tool-result-pruner` 是可选的前置裁剪。base bundle 全都挂上了。

### 6.2 何时触发

两个入口:

- **压力触发**:`agent/pre-step` 上的监听者在派生请求之前测量压力,超过阈值就压缩
- **溢出恢复**:`agent/request-error` 收到 `CONTEXT_WINDOW_EXCEEDED`,跳过常规阈值,尽量多压一段然后重试(默认最多 1 次)

设上下文窗口为 `W`,实际输出上限为 `O`,余量 `B = 65536`:

```text
触发阈值 = floor(min(W × 0.8, W − O − B))
原样保留 = 最新的 16% × (W − O)
```

用默认值粗算(`W = 1,000,000`,`O = 256,000`):阈值是 `min(800,000, 678,464)` = 678,464 token,保留最近约 119,040 token 原文。

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `thresholdRatio` | `0.8` | 公式里的窗口比例 |
| `headroomTokens` | `65536` | 输出预留之外的额外余量 |
| `retainRatio` / `retainTokens` | `0.16` / — | 二选一;保留量必须小于阈值 |
| `summarizationProvider` / `summarizationModel` | `''` | 成对设置;留空用最近一次请求的路由 |
| `maxTokens` | 等于 `headroomTokens` | 摘要输出上限 |
| `maxOverflowRetries` | `1` | 溢出恢复次数,`0` 只关溢出恢复 |
| `modelPolicies` | `[]` | 按 provider/model 精确覆盖 |
| `auto` | `true` | 设 `false` 同时关掉自动压缩和溢出恢复,只剩手动 |

### 6.3 怎么压

**第一步:裁剪工具结果(不调模型)**。挂了 pruner 时先跑它:文本超过 `thresholdChars`(8192 个码点)的工具结果,替换为前 4096 + `[... tool result middle pruned ...]` + 后 1024。替换事件通过 `sourceEventSeqs` 引用原事件,原文仍在日志里。裁完重新测量,如果已经低于阈值就**不再做摘要**。注意它只在触发条件成立后才跑,低于压力时什么都不动。

**第二步:摘要最旧的一段**。选区从第一个非 `system/message` 的节点开始,**节点 0 的 system prompt 永远不会被压掉**;选区边界保持工具调用和结果成对,但不要求整轮。摘要请求很讲究:按字节原样重放节点 0 的 system prompt、最近一次请求的工具、被选中的历史消息,最后追加一条压缩指令——这样摘要请求本身就是对话的真前缀,只有最后那条指令和输出不命中缓存。请求的 `purpose` 是 `compaction`,在 DeepSeek 路由上表现为请求头 `x-deepseek-harness-compact: 1`。

**第三步:提交**。日志依次写入:

```text
compaction/start        log-only,相当于加锁
compaction/summary      log-only,摘要、被遮蔽的 seq、估算 token、摘要调用的 provider/model
user/message            surfaceOp: replace,用 <compacted-summary> 包裹的摘要替换选中区间
compaction/end          log-only,释放锁
```

锁最后才释放,所以中途崩溃会留下一个没配对的 `compaction/start`,能被检测出来,而不是一个假装完成的 `compaction/end`。

### 6.4 /compact 与其他手段

- `/compact` **不接受参数**,带参数会提示 `Usage: /compact (no arguments)`。它在低于阈值时也能压一段;agent 正在跑轮次或已经在压缩时会报不可用,期间发的消息排队等它结束
- **没有给模型用的压缩工具**,只有人用的命令和自动触发
- 图片超预算时,`compaction-image-offload` 写一条 `image/offload` 事件,把最旧的图片换成带附件名和只读路径的占位文本,然后重试,不消耗 `llm-retry` 的次数
- 压缩是事后补救,spill 是事前预防:工具输出太大时在写入时就落到 spill 文件,历史里只留预览和定位信息(13 篇)

### 6.5 和 Claude Code 对照

| | Claude Code | dsh |
| --- | --- | --- |
| 先清什么 | 先清旧的工具输出 | pruner 按首尾截断工具结果,原文留在日志里 |
| 摘要形式 | 对话摘要 | 固定 Markdown 结构的 checkpoint,以 `user/message` 替换一段 surface |
| 手动压缩 | `/compact` 可以带关注点 | `/compact` 不接受参数 |
| 压缩后恢复什么 | 重新注入 CLAUDE.md、skills 描述等 | system prompt 在节点 0 不受影响;被遮蔽的运行时上下文快照由 loop 重新追加 |
| 阈值 | `/autocompact` 调整 | `thresholdRatio` / `headroomTokens` / `modelPolicies` 按路由配置 |

---

## 踩坑

1. **在 persona 模板里写 <code v-pre>{{cwd}}</code>**——loop 不注册这个变量,组装直接失败。删掉这句,工作目录由 working-directory 服务以运行时上下文提供
2. **把时间、路径这类会变的信息写进 section**——每次变化都改写 system prompt。会变的事实用 `PromptContext`,它追加在历史尾部
3. **任务中途来回切模型**——每个 provider/model 是独立的缓存域,切过去就从头算
4. **以为 plan mode 会把写工具藏起来**——工具表在各模式下保持不变,真正的边界在沙箱和审批(05 篇)
5. **自定义模型没在 `models` 里声明 in-history / addition-only**——每次 prompt 或工具变化都会改写前缀。确认网关真的支持再声明
6. **`retainRatio` 配得不小于 `thresholdRatio`,或小窗口模型没调 `headroomTokens`**——前者加载即失败;后者 `W − O − B` 不为正时,自动压缩对该路由报警告并跳过
7. **`/compact 保留认证相关内容`**——不接受参数。想影响摘要内容,只能换 `summarizationModel` 或自己实现 `summarize()`
8. **以为压缩把原文删了**——surface 只是遮蔽,日志里原文和裁剪前的工具结果都在。这也意味着会话日志上传会带上它们(06 篇)
9. **设 `auto: false` 以为只关了自动压缩**——溢出恢复也一起关了,超限就直接以错误结束

---

## 源码与文档索引

- `packages/core/system-prompt/README.md`
- `packages/core/system-prompt/src/index.ts`
- `docs/subsystems/system-prompt.md`
- `docs/subsystems/scope.md`
- `packages/core/agent-loop/README.md`
- `packages/core/agent-loop/src/runtime-context.ts`
- `docs/subsystems/compaction.md`
- `packages/compaction/compaction-basic/README.md`
- `packages/compaction/compaction-tool-result-pruner/README.md`
- `packages/compaction/command-compact/README.md`
- `packages/subagent/subagent-fork-in-process/README.md`
- `packages/bundle/base/cordis.patch.yml`

---

下一篇:`17-会话即事实源-事件日志与持久化.md`,讲 append-only 事件日志与 surface、JSONL v4 格式与迁移、projection 与查询,以及仓库的持久化变更流程。
