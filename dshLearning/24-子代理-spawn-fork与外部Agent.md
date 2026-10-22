# 子代理:spawn、fork 与外部 Agent

前面二十多篇里干活的始终是一个 agent。第四层开始讲多个 agent 一起干活、以及没人盯着也在干活。第一步是子代理:主 agent 把一块独立的工作交出去,子代理在自己的上下文里做完,只把结论交回来。

Claude Code 系列的子代理篇讲过为什么要用子代理(隔离上下文、并行、换模型),这里不重复。dsh 的不同在于结构:**子代理不是一个内置功能,而是一个服务加若干可替换的 provider**,Claude Code 和 Codex 本身也可以作为 provider 挂进来。

> 一句话先记住:**dsh 的子代理 = 一个委派工具实例 + 一个 provider**。provider 决定孩子怎么跑(进程内从零开始、带着父对话、或者在另一个进程里跑另一个 harness),工具实例决定模型看到的工具名、能选哪些预设、能递归几层。dsh 没有 Markdown 写的"子代理类型",对应物是 agent 预设。

---

## 一、结构:服务、provider、工具

```text
模型调用  subagent / subagent_fork / subagent_claude_code / ...
              │   每个名字是一个 dsh-tool-subagent 实例,绑定一个 provider
              ▼
        ctx.subagents(dsh-subagent:准入、容量、深度、父目录、生命周期)
              │
  ┌──────┬────┴───┬────────┬────────┬─────────────┬──────────┐
spawn   fork     acp     codex   claude-code     dsh-sdk
```

`dsh-subagent` 只是契约和管理器,单独挂上它不会开启任何委派。真正决定行为的是 provider:

| provider | 包 | 孩子在哪跑 | 看得到父对话 | 能追加消息 / 恢复 |
| --- | --- | --- | --- | --- |
| `spawn` | `dsh-subagent-spawn-in-process` | 同进程,全新会话 | 否 | 能 |
| `fork` | `dsh-subagent-fork-in-process` | 同进程,用父会话已完成的轮次做种子 | 是 | 能 |
| `acp` | `dsh-subagent-acp` | 子进程里任意 ACP agent | 否 | 否 |
| `dsh-sdk` | `dsh-subagent-dsh-sdk` | 子进程里一个完整的 dsh | 否 | 否 |
| `codex` | `dsh-subagent-codex`(可选 bundle) | 原生 Codex,官方 app-server 协议 | 否 | 否 |
| `claude-code` | `dsh-subagent-claude-code`(可选 bundle) | 原生 Claude Code,官方 Agent SDK | 否 | 否 |

前两个是"本地孩子",有持久的子会话,可以继续对话;后四个是"外部执行",每次只跑一次,结果交回后就结束。

---

## 二、标准预设里挂了什么

base bundle 在 Host 层注册了 `spawn` 和 `fork` 两个 provider,也在 Host 层挂了一套委派工具行,headless 等 profile 直接用。web profile 的 `dsh-web-app` bundle 把这些 Host 工具行禁用,改由预设挂载。标准预设在一个 `delegation` 组里挂了模型能用的工具(`packages/bundle/web-app/presets/standard.patch.yml`):

```yaml
- id: delegation
  name: cordis:group
  group: true
  isolate:
    workflowEngine: true
  config:
    - id: tool-subagent-control
      name: '@deepseek-ai/dsh-tool-subagent-control'
    - id: tool-subagent-list-agents
      name: '@deepseek-ai/dsh-tool-subagent-control/list-agents'
    - id: tool-subagent
      name: '@deepseek-ai/dsh-tool-subagent'
      config:
        provider: spawn
        toolName: subagent
        modelSelectionSettings: true
    - id: tool-subagent-fork
      name: '@deepseek-ai/dsh-tool-subagent'
      config:
        provider: fork
        toolName: subagent_fork
    - id: workflow-ptc
      name: '@deepseek-ai/dsh-workflow-ptc'
      config:
        provider: spawn
    - id: tool-workflow
      name: '@deepseek-ai/dsh-tool-workflow'
```

于是模型看到这些工具:

| 工具 | 来自 | 作用 |
| --- | --- | --- |
| `subagent` | `tool-subagent`(spawn) | 派一个从零开始的子代理 |
| `subagent_fork` | `tool-subagent`(fork) | 派一个带着当前对话的子代理 |
| `send_message` | `tool-subagent-control` | 父子之间互发消息 |
| `interrupt_agent` | `tool-subagent-control` | 停掉子代理当前这一轮 |
| `list_agents` | `.../list-agents` | 列出自己派出的可继续的子代理 |
| `list_subagent_models` | 开了 `modelSelectionSettings` 时注册 | 查可选的 provider / 模型 |
| `workflow` | `tool-workflow` | 用脚本编排大量子代理(25 篇) |

`ptc` 预设的委派组和标准预设一样,只是 `workflow-ptc` 和 `tool-workflow` 两行是 `disabled: true`;`minimal` 预设不挂任何委派工具。

---

## 三、异步语义:先拿到 id,结果后到

`subagent` 的参数只有三个:`description`(3 到 5 个词的显示标签)、`prompt`(完整、自包含的任务)、可选的 `cwd`。调用后**立刻返回** `started subagent <childId>`,工具本身不等结果:

1. 子代理在后台跑,父 agent 可以继续干别的,也可以再派几个
2. 子代理结束时,运行时给父 agent 发一条**完成通知**,里面带着最终答案、可选的结构化结果、诊断和结束原因
3. 本地孩子运行中,父 agent 可以用 `send_message` 追加指示,它在下一个 step 边界收到
4. 本地孩子结束后,`send_message` 会让它开新的一轮;不在内存里的会从持久化里**冷恢复**,需要会话持久化和会话查询都在
5. 子代理也能用 `send_message` 主动给直接父级发消息

几条规则:

- `send_message` 只能发给**相邻**的 agent:直接的孩子,或者自己的直接父级
- `interrupt_agent` 只停当前这一轮,收件箱和它派出的孙辈都保留
- `list_agents` 的 `running` / `inactive` 只表示此刻在不在跑,**不表示任务完成了**
- 外部执行拒绝追加消息,`interrupt_agent` 会让它永久停止

子代理的 `cwd` 可选,相对路径按父 agent 当前目录解析,省略则继承;之后父子各自切目录互不影响。

---

## 四、spawn 和 fork 怎么选

| | `subagent`(spawn) | `subagent_fork`(fork) |
| --- | --- | --- |
| 起点 | 空对话,只有你写的 prompt | 父会话所有**已完成**的轮次,进行中的那一轮不带 |
| prompt 要求 | 必须自包含 | 可以引用前文 |
| 选模型 | `modelSelectionSettings: true` 时可以选 | **不能**,固定沿用父 agent 的 provider 和模型 |
| 选预设 | 支持 `agentPreset` | 不支持,沿用父 agent 的组成 |
| 成本 | 便宜 | 种子要计 token,但同模型下能复用父请求的前缀缓存 |

fork 固定用父模型是有意的:换了模型,复制过去的前缀就无法命中 KV Cache,种子的 token 就白付了(原理见 16 篇)。种子是派生那一刻的快照,父 agent 之后的对话不会再传给孩子。

**经验法则**:任务能用一段话说清楚就 spawn;需要"刚才讨论的那些上下文"才 fork。

---

## 五、委派工具的配置

一个 `dsh-tool-subagent` 实例的字段:

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `provider` | 必填 | `ctx.subagents` 上的 provider 名 |
| `toolName` | `subagent` | 模型看到的工具名,同一组成里每个实例必须不同 |
| `modelSelectionSettings` | `false` | 让模型按 Host 的授权列表选子代理的 provider / 模型 / effort |
| `agentOptions` | — | 固定子代理的 `provider`、`model`、`reasoningEffort`、`maxTokens` |
| `agentPreset` | — | 默认给孩子用的独立预设,只有 spawn 支持 |
| `allowedAgentPresets` | — | 预设白名单,暴露成模型可选的 `agent_preset` 枚举 |
| `maxDepth` | Host 设置(初始 `1`) | 委派深度上限,`0` 禁止委派;外部 provider 用 `provider-managed` |

两个 Host 级设置:

- **`subagent.maxDepth`**:在 Plugins → Subagent 页面改,默认 `1`,也就是只允许直接孩子,孩子不能再派。工具配置里显式写了 `maxDepth` 时以工具为准
- **`maxActiveSubagents`**:`dsh-subagent` 行上的配置,默认 `8`,按整棵委派树计算同时活着的孩子数。满了直接拒绝(`ACTIVATION_LIMIT_REACHED`),**不排队**

`modelSelectionSettings` 只有两个进程内 provider 和 `dsh-sdk` 支持,ACP、Codex、Claude Code 会直接拒绝,不会悄悄忽略。

---

## 六、"子代理类型" = agent 预设

Claude Code 用 `.claude/agents/*.md` 定义子代理:frontmatter 写工具和模型,正文是系统提示。**dsh 没有这种文件入口**。04 篇讲的 agent 预设就是对应物:一个 `@deepseek-ai/dsh-agent-preset` 行,`plugins` 列表决定挂哪些工具,`dsh-persona` 决定身份。预设注册表不扫目录,也不接受文件路径。

例子:定义一个只能搜索和上网、不能改文件也不能跑 shell 的调研预设,再让 `subagent` 工具允许模型选它:

```yaml
- insert:
    - id: preset-scout
      name: '@deepseek-ai/dsh-agent-preset'
      config:
        id: scout
        description: 只读调研,不改文件、不跑命令
        plugins:
          - id: persona
            name: '@deepseek-ai/dsh-persona'
            config:
              prefix: You are a read-only research agent powered by the {{model}} model.
          - id: tool-fs-search
            name: '@deepseek-ai/dsh-tool-fs-search'
          - id: tool-web
            name: '@deepseek-ai/dsh-tool-web'
            config:
              fetch: true
```

注意"只读"只针对预设自己挂的工具:Host 层注册的全局工具(比如 7.1 节的 `subagent_claude_code`、写在 Host 层的 MCP 行)对每个预设都可见。

然后在标准预设的 `tool-subagent` 行加上 `allowedAgentPresets: [standard, scout]`,模型调用 `subagent` 时就多了一个可选的 `agent_preset` 参数。改内置预设的行要注意覆盖规则(11 篇),Creator 模式也能在对话里替你生成这类 bundle(20 篇)。

几条约束:

- 只有 spawn 支持独立预设;fork 和外部 provider 会拒绝
- 不选预设时,孩子加入父 agent **当前**的预设版本
- 旧版本在工具配置里写 `persona` 或 `toolFilter` 的,加载时直接报迁移错误,要挪进预设的 `plugins` 列表

---

## 七、外部 Agent:Claude Code、Codex、ACP、dsh-sdk

### 7.1 Claude Code 作为子代理

`@deepseek-ai/dsh-subagent-claude-code` 是一个可选 bundle,在 Web 或 Desktop 的 Plugins 页面打开 **Claude Code subagent** 即可安装并选中。它在 Host 层插入两行,`subagent_claude_code` 成为对所有预设(包括 minimal)可见的全局工具。不想选 bundle 时,也可以手工插入同样的行:

```yaml
- insert:
    - id: subagent-claude-code
      name: '@deepseek-ai/dsh-subagent-claude-code'
    - id: tool-subagent-claude-code
      name: '@deepseek-ai/dsh-tool-subagent'
      config:
        provider: claude-code
        toolName: subagent_claude_code
        maxDepth: provider-managed
```

| `permissionMode` | 行为 |
| --- | --- |
| `dontAsk`(默认) | 没预先授权的操作直接拒绝 |
| `acceptEdits` | 接受文件编辑,其余授权请求被拒 |
| `auto` | 交给 Claude Code 自己的分类器 |
| `plan` | 原生计划模式,拒绝执行,把计划作为最终答案返回 |
| `bypassPermissions` | 显式跳过权限检查 |

要知道的事:

- **认证和 settings 都是 Claude Code 原生的**:bundle 不会替你登录,也不改 settings;它按子会话目录读宿主机的用户、项目、本地 settings
- **运行时锁版本**:依赖锁在 Agent SDK 0.3.263 的平台包上,缺包或平台不支持时第一次委派就失败,**不会退回用机器上的 `claude`**
- **环境变量被清洗**:带凭证特征的变量被删掉,想给子会话传 API key,写进这个 provider 的 `env`
- **无人值守**:`AskUserQuestion` 被禁用,授权弹窗一律拒绝,MCP elicitation 被拒
- **只回最终文字**:推理、工具调用、stderr、改动的 diff 都不进父会话;子会话改的文件直接落在工作区里,取消时**不回滚**

### 7.2 Codex 作为子代理

`@deepseek-ai/dsh-subagent-codex` 结构相同,工具名 `subagent_codex`,每次起一个新的 app-server 进程、一个临时 thread、执行一轮。运行时锁在 `@openai/codex@0.153.4`。

| `permissionMode` | 对应的 Codex 设置 |
| --- | --- |
| `never`(默认) | `approvalPolicy: never`,沙箱用 Codex 原生配置 |
| `approve-for-me` | `on-request` + 自动审查 + `workspace-write` 沙箱 |
| `dangerously-bypass-approvals-and-sandbox` | `never` + `danger-full-access`,必须显式选择 |

### 7.3 ACP 和 dsh-sdk

- **`acp`**:配置一个启动 ACP agent 的 `command`,授权请求按 `permission`(默认 `reject`)自动回答。拿 dsh 自己当孩子时,文档要求给它一个**独立的绝对路径 `DSH_HOME`**,免得嵌套的运行时读到你的 profile 和凭证
- **`dsh-sdk`**:每次起一个完整的 dsh 子进程,有自己的 profile、patch、会话和模型;`dshHome` 必填。适合需要完整 harness 隔离、又能接受每次启动一个新进程的场景

外部 provider 都不支持独立预设、结构化输出和 harness 的深度控制(`dsh-sdk` 例外地支持选模型),委派工具对它们用 `maxDepth: provider-managed`,递归预算交给子进程自己。

### 7.4 父会话里留下什么

外部执行不产生本地子会话。父会话的子代理目录里记一条 `mode: 'external'` 的成员,保存任务身份和完整的终止结果,在界面上是不能点进去的叶子节点。这是 2026-09-19 的持久化变更(`docs/persistence-changes/2026-09-19-external-subagent-catalog.md`)引入的,历史上的本地子代理条目保持有效。

---

## 八、和 Claude Code 子代理对照

| | Claude Code | dsh |
| --- | --- | --- |
| 定义方式 | `.claude/agents/*.md`,frontmatter + 系统提示 | agent 预设(Cordis 行),只有 spawn 能选 |
| 委派工具 | 一个 `Agent` 工具 | 每个 provider 一个工具实例,名字自定 |
| 默认运行方式 | 后台,完成后通知 | 后台,完成后通知 |
| 带上下文的子代理 | fork,继承整个对话 | `subagent_fork`,继承已完成的轮次,固定父模型 |
| 嵌套 | 默认最多三层 | 默认只有一层(`subagent.maxDepth: 1`) |
| 并发 | 同时 20 个时再派失败 | `maxActiveSubagents` 默认 8,整棵树共享 |
| 跨产品 | — | Claude Code、Codex、任意 ACP agent 都能当子代理 |

---

## 踩坑

1. **派完子代理马上问结果**——工具只返回 id,结果在完成通知里。要等就继续干别的,通知到了再处理
2. **以为子代理能再派子代理**——Host 默认 `subagent.maxDepth` 是 `1`,孙辈会被拒。需要嵌套就在 Plugins → Subagent 调高,或在工具行写 `maxDepth`
3. **一口气派十几个**——默认 `maxActiveSubagents` 是 8,超出直接 `ACTIVATION_LIMIT_REACHED`,不会排队
4. **给 `subagent_fork` 配模型选择**——fork 有意固定父模型,换模型就丢掉前缀缓存的收益
5. **spawn 的 prompt 写"按我们刚才说的改"**——spawn 看不到父对话,prompt 必须自包含,要上下文就用 fork
6. **把 `list_agents` 的 `inactive` 当成"做完了"**——它只表示此刻没在跑。完成以通知为准
7. **对 `subagent_claude_code` 或 `subagent_codex` 用 `send_message` 追问**——外部执行一次性跑完,不接受后续消息
8. **Claude Code 子代理报认证失败**——它用 Claude Code 自己的登录状态;API key 要写进 provider 的 `env`,环境里继承来的凭证变量会被清洗掉
9. **想写一个 `.md` 文件定义新的子代理类型**——dsh 没有这个入口,写一个 agent 预设,再用 `allowedAgentPresets` 暴露给模型
10. **取消外部子代理后以为改动会撤回**——没有回滚,它取消前改过的文件留在工作区

---

## 源码与文档索引

- `docs/subsystems/subagent.md`
- `packages/subagent/subagent/README.md`
- `packages/subagent/tool-subagent/README.md`
- `packages/subagent/tool-subagent-control/README.md`
- `packages/subagent/subagent-fork-in-process/README.md`
- `packages/subagent/subagent-claude-code/README.md`
- `packages/subagent/subagent-codex/README.md`
- `packages/subagent/subagent-acp/README.md`
- `packages/subagent/subagent-dsh-sdk/README.md`
- `packages/preset/agent-preset-registry/README.md`
- `packages/bundle/web-app/presets/standard.patch.yml`
- `docs/persistence-changes/2026-09-19-external-subagent-catalog.md`

---

下一篇:`25-Workflow脚本与Agent-Team.md`,讲用 `agent()`、`parallel()`、`pipeline()` 写编排脚本一次调度大量子代理,以及实验性的 Lead + 队友 + 共享任务 DAG。
