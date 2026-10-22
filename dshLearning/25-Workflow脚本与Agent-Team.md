# Workflow 脚本与 Agent Team

24 篇的子代理由模型一轮一轮地派:派几个、等通知、再决定下一步。几个、十几个任务没问题;到了"审计 300 个路由""迁移 500 个文件"这种规模,回合制编排和上下文都撑不住。另一类问题正好相反:不是任务多,而是几个角色需要长期协作、互相发消息、共享一块任务板。

dsh 对这两类问题各有一个答案:`workflow` 工具把编排写成脚本,agent team 把协作做成一群有名字的持久会话。Claude Code 系列的 Dynamic Workflows 篇和并行 Agent 篇讲过同样的思路,本篇末尾有对照。

> 一句话先记住:**workflow 把"计划"写进脚本,agent team 把"协作"落到持久的花名册和任务板上**。前者适合大量同构子任务加明确的汇总条件,标准预设自带;后者适合几个角色互相讨论、分工认领,是默认关闭的实验性 bundle。

---

## 一、四种多 agent 方式

| | 子代理(24 篇) | `workflow` | Ralph 循环 | Agent team |
| --- | --- | --- | --- | --- |
| 谁决定下一步 | 模型,逐轮 | **脚本** | 固定循环,每轮一个新 agent | Lead 和队友各自决定 |
| 中间结果在哪 | 父 agent 的上下文 | 脚本变量 | 工作区 + 每轮一份有界报告 | 共享任务板 + 消息 |
| 规模 | 每轮几个 | 一次最多 1000 个 | 默认最多 256 轮 | 最多 16 个队友 |
| 子 agent 能互相通信 | 只能和直接父级 | 不能 | 不能 | **能** |
| 默认状态 | 标准预设自带 | 标准预设自带 | 实验性,默认关 | 实验性,默认关 |

---

## 二、`workflow` 工具

### 2.1 由哪些包组成

| 包 | 作用 |
| --- | --- |
| `@deepseek-ai/dsh-workflow` | 服务定义 `ctx.workflowEngine`,每个上下文只允许一个引擎 |
| `@deepseek-ai/dsh-workflow-ptc` | 引擎实现:在 Node PTC 进程里跑脚本(14 篇) |
| `@deepseek-ai/dsh-tool-workflow` | 模型看到的 `workflow` 工具 |

base bundle 在 Host 层挂了 `ptc-runtime`、`workflow-ptc`(`provider: spawn`)和 `tool-workflow`,headless 等 profile 直接可用。web profile 里改由预设挂载:标准预设的 `delegation` 组里有这两行;`ptc` 预设里这两行是 `disabled: true`;`minimal` 没有。引擎只接受 TypeScript 的 PTC 运行时,换成 Python PTC 的组成必须把这几行关掉。

工具描述里写明:**只在用户明确要求 workflow 或大规模多 agent 编排时使用**,一两个委派用普通子代理。这是给模型的引导,不是硬开关。

### 2.2 调用参数

| 参数 | 必需 | 说明 |
| --- | --- | --- |
| `meta` | 是 | 身份数据:`name`(kebab-case)、`description`,可选 `whenToUse`、`phases` |
| `script` | 是 | 纯 JavaScript 函数体,不是 TypeScript,**不写 `export const meta`** |
| `args` | 否 | JSON 对象,脚本里作为全局变量 `args`;数组要包一层字段 |
| `run_in_background` | 否 | 作为后台 job 运行 |

`meta` 是 JSON 数据,引擎在运行任何代码之前先校验它。`docs/subsystems/workflow.md` 的原话是 "the field vocabulary matches the Claude Code dynamic-workflows meta block",字段和 Claude Code 的 meta 块一致;`phases` 只是进度分组的词汇,`phase()` 调用按标题精确匹配,不代表执行结构。

### 2.3 脚本里能用的函数

| 函数 | 作用 |
| --- | --- |
| `agent(prompt, opts?)` | 跑一个子代理直到结束。不带 `schema` 返回最终文字;带 `schema` 返回校验过的对象;**孩子失败返回 `null`** |
| `pipeline(items, ...stages)` | 每个 item 独立地依次过各个 stage,stage 之间**没有屏障**;stage 收到 `(prev, item, index)` |
| `parallel(thunks)` | 并发跑一组无参函数,等**全部**完成(屏障) |
| `phase(title)` | 开始一个进度阶段 |
| `log(message)` | 输出一条进度说明 |
| `args` | 调用时传入的 `args` |

`agent()` 的其他选项:`label`(显示名)、`phase`(归到哪个进度组)、`provider` / `model`(给这个孩子单独指定模型)。`schema` 只能用 `type`、`properties`、`required`、`additionalProperties`、`items`、`enum`、`const`、`oneOf` 这几个关键字。脚本本身**没有文件系统、网络、定时器和 Node.js API**,读写文件、跑命令都交给 agent 去做。

### 2.4 一个例子

```json
{
  "name": "audit-routes",
  "description": "逐个检查路由处理函数是否缺少鉴权",
  "phases": [{ "title": "收集" }, { "title": "审计" }]
}
```

```js
phase('收集')
const found = await agent('列出 src/routes/ 下所有 .ts 文件的相对路径。', {
  label: 'list-routes',
  schema: {
    type: 'object',
    properties: { files: { type: 'array', items: { type: 'string' } } },
    required: ['files'],
    additionalProperties: false,
  },
})
if (!found) return { error: 'listing failed' }

phase('审计')
const audits = await pipeline(found.files.slice(0, args.limit), file =>
  agent(`检查 ${file} 里每个路由处理函数是否做了鉴权,只报告缺失的。`, { label: file, phase: '审计' }),
)
log(`完成 ${audits.filter(Boolean).length}/${audits.length} 个文件`)
return { audited: audits.length, findings: audits.filter(Boolean) }
```

上面两段分别是 `meta` 和 `script` 参数,`args` 传 `{ "limit": 50 }`。先在小范围试跑,看清用量再放大。

### 2.5 失败的两种性质

- **孩子失败**是普通结果:`agent()` 返回 `null`,脚本自己决定怎么处理,常用 `.filter(Boolean)`
- **用错函数是致命错误**:参数不对、未知选项、不支持的 schema、触到上限、子代理启动失败、被取消,都会抛出 `fatal` 错误。`parallel()` / `pipeline()` 会**重新抛出**它,而不是把那一项变成 `null`——写错一个选项名要让脚本当场死掉,不能混进"某个孩子失败了"里

`pipeline` 里一个 stage 抛普通错误,该 item 变成 `null` 并跳过后续 stage。但 `agent()` 返回 `null` 不是抛错,**下一个 stage 照样会收到 `null` 作为 `prev`**,多 stage 时要自己判空。

### 2.6 前台与后台

| 方式 | 父 agent | 结果 |
| --- | --- | --- |
| 前台(默认) | 这一轮**阻塞**,直到整个 workflow 结束 | `workflow "<name>" completed (N agents).` 加返回值 JSON;取消或失败返回 `Error: ...`,不会把部分结果当成功 |
| `run_in_background: true` | 立刻拿到 `jobId` 和 `runId`,继续干别的 | 注册成一个 `workflow` job,完成通知带回返回值 |

后台运行时,结束前 `job_output` 只返回状态,不返回中间值;要停止用 `job_kill`。job 的机制见 26 篇。无论哪种方式,孩子的中间消息都不进父对话,也不会给父模型发子代理完成通知。

### 2.7 配置与边界

`dsh-workflow-ptc` 的字段:

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `provider` | `spawn` | `agent()` 用哪个子代理 provider |
| `maxConcurrentAgents` | `0` | 并发上限;`0` 表示按 CPU 算,源码里是 `min(16, max(1, CPU 数 - 2))` |
| `maxTotalAgents` | `1000` | 一次运行最多启动多少个 `agent()` |
| `maxItemsPerCall` | `4096` | 单次 `parallel()` / `pipeline()` 的项数上限 |
| `syncTimeoutMs` | `5000` | 脚本开头同步部分的超时 |

`dsh-tool-workflow` 有 `toolName`(默认 `workflow`)、`maxResultChars`(默认 `50000`,超出的返回值被截断)、`enableRunInBackground`(默认 `true`)。

几条运行边界:

- **没有整体超时**:一次运行可以一直跑到完成、失败或被取消
- **不能中途恢复**:脚本和中间值没有检查点,进程重启后无法续跑;也不能保存成可复用的 workflow,脚本里也没有嵌套调用 `workflow()` 的函数
- **文件策略跟着会话走**:PTC 进程和所有孩子沿用调用时的工作目录和文件策略;`read-only` / `workspace-write` 下没有可用的隔离就直接失败
- **网络不受文件策略限制**,脚本进程的环境变量是空的,也拿不到代理设置
- **VM 不是安全边界**,真正的约束来自 PTC 运行时的系统级策略(05、14 篇)
- **上限是协作式的**:计数器约束的是正常脚本,不是安全配额,也不统计 token

---

## 三、和 Claude Code dynamic workflows 对照

| | Claude Code | dsh |
| --- | --- | --- |
| meta | 脚本第一条语句 `export const meta` | 单独的 `meta` JSON 参数,脚本里不能写 |
| 触发 | `ultracode` 关键词、ultracode 模式、内置 `/deep-research` | 模型调用 `workflow` 工具,工具描述要求用户明确提出 |
| 运行 | 后台运行,`/workflows` 进度视图,可暂停 | 默认前台阻塞;`run_in_background` 变成 job |
| 恢复 | 同一会话内可恢复,复用已完成 agent 的结果 | 不支持 |
| 保存复用 | 存到 `.claude/workflows/`,变成 `/名字` 命令 | 不支持 |
| 并发 | 默认最多 16 | 默认 `min(16, CPU 数 - 2)` |
| 单次项数 / 总数 | 4096 / 1000 | 4096 / 1000 |
| 失败的 agent | 返回 `null` | 返回 `null`;用错函数整个脚本失败 |

函数名和语义基本一一对应,从 Claude Code 写过来的脚本主要改两处:去掉 `export const meta`,把它挪到 `meta` 参数里;不依赖恢复和保存。

---

## 四、Ralph 循环(实验性)

`@deepseek-ai/dsh-tool-ralph` 是 workflow 引擎上的一个固定循环:每一轮开一个**全新**的子代理,朝同一个不可变的目标干活,轮与轮之间只传一份有界的结构化报告,工作区本身就是长期记忆。工具是 `ralph({ objective, maxRounds? })`,前台阻塞到 worker 报告完成、报告具体阻碍或者轮数用完,结果是 `complete`、`blocked` 或 `budget-limited`。

| 字段 | 默认 |
| --- | --- |
| `subagentProvider` | `spawn`,必须支持结构化输出且不继承父上下文 |
| `maxRounds` | `256`,也是单次调用能设的上限 |
| `maxHandoffChars` / `maxResultChars` | `16384` / `16384` |

它由 `@deepseek-ai/dsh-experimental-ralph-bundle` 提供,Web 和 Desktop 里默认关闭,在 Plugins 页面打开。工具描述要求只在用户明确要 Ralph 时使用;worker 报告"完成"**不会被独立核验**。普通的长任务用 08 篇的 goal。

---

## 五、Agent team(实验性)

### 5.1 开启

一个 bundle 打开整套功能:领域服务、9 个工具和 Web 界面。默认关闭,在 Plugins 页面打开 Agent Teams,或者加进一个已经包含 `@deepseek-ai/dsh-base` 的 profile:

```bash
dsh plugin --profile headless add @deepseek-ai/dsh-experimental-agent-team-profile
dsh --profile headless "Use Agent Teams to split this task between two teammates, wait, and summarize."
```

开启后,普通的 `subagent`、`subagent_fork` 工具和重叠的全局子代理控制工具被禁用,改用团队版本;`workflow` 仍然可以用 `spawn` 派全新的孩子。团队必须有持久化的会话存储,文档里最小配置用的是 `@deepseek-ai/dsh-session-persistence-jsonl`。

### 5.2 结构

- **Lead**:当前会话本身,隐式成为团队的根
- **队友**:有名字的持久会话,名字是唯一的小写 kebab-case,**永不复用**(创建失败的也占着名字);创建时选 `fresh`(看不到 Lead 的对话)或 `fork`(继承 Lead 已完成的轮次),默认 `fresh`
- **同一个工作目录、同一个进程**:所有成员共享 cwd,彼此的改动立即可见;没有 worktree,没有跨进程团队
- **只有 Lead 能创建和打断队友**;花名册是扁平的,不能嵌套、改名或删除

### 5.3 工具

| 工具 | 作用 |
| --- | --- |
| `spawn_teammate` | 创建队友(只有 Lead 能调),参数 `name`、`description`、`prompt`、`context` |
| `send_message` | 给任意成员或 Lead 发消息 |
| `interrupt_agent` | Lead 停掉队友当前这一轮,排队的消息保留 |
| `list_agents` | 花名册:`running`、`inactive`、`provisioning`、`failed` |
| `wait_agent` | 等下一次团队变化(状态、消息、任务),代替轮询 |
| `team_task_create` / `team_task_get` / `team_task_list` | 建任务、读任务 |
| `team_task_update` | 按 revision 做比较并交换:`claim`、`release`、`complete`、`reopen`、`delete` |

### 5.4 消息

每条消息都按 Steer 投递:对方在跑就在最近的 step 边界收到;对方空闲就开新的一轮;不在内存里就**冷恢复**。发送成功只表示进了对方收件箱,不表示对方已经处理。团队不保存未接受的发送意图,重启后不重试,重复发送也不去重。

### 5.5 共享任务 DAG

- 每个任务有 `subject`、`description`、`status`、`ownerId`、`blockedBy`、`writeScopes` 和 `revision`
- `blockedBy` 必须指向未删除的任务,整张图保持无环;依赖全部完成后任务才能被认领
- 状态:`pending`(未开始或被释放)、`in_progress`(有主)、`completed`、`deleted`(保留的墓碑)
- **每次修改都是 compare-and-set**:拿旧 revision 去改会被拒,两个成员不会悄悄覆盖对方
- **`writeScopes` 只是提示**:两个进行中的任务声明的路径重叠时给警告,不加锁。Bash、格式化工具、代码生成器都能绕过,最终 diff 要 Lead 自己审
- 不活跃、被打断、进程退出、干砸了,都**不会自动释放**任务的归属

| 限制 | 默认 |
| --- | --- |
| `maxMembers` | `16`,包括创建失败的 |
| `maxTasks` | `256` 个活跃任务 |
| `maxMessageBytes` | `65536` |
| `disposalTimeoutMs` | `5000` |

### 5.6 和 Claude Code agent teams 对照

| | Claude Code | dsh |
| --- | --- | --- |
| 开启 | 环境变量 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` | 打开 `agent-team-profile` bundle |
| 队友起点 | 独立实例,看不到 lead 的对话 | `fresh` 或 `fork` 二选一 |
| 文件隔离 | 不进各自的 worktree | 同一个 cwd,只有 `writeScopes` 警告 |
| 任务清单 | 共享,依赖自动解锁 | 持久 DAG,revision 比较并交换 |
| 运行场景 | 只能在交互式会话里组队 | headless profile 也能用 |
| 成员上限 | 建议从 3 到 5 个开始 | 硬上限 `maxMembers: 16` |

---

## 六、怎么选

| 情况 | 选 |
| --- | --- |
| 一块独立的支线工作,只要结论 | 子代理 |
| 同一个步骤要在几十上百个对象上重复,最后汇总 | `workflow` |
| 一个目标反复迭代,每轮都想要干净的上下文 | Ralph(用户明确要求时) |
| 几个角色要互相质疑、分工认领、长期协作 | agent team |
| 想要真正的文件隔离 | 都不提供,看 26 篇的 worktree |

---

## 踩坑

1. **小任务也用 workflow**——几个文件的事,子代理更省也更快。工具描述也要求用户明确提出
2. **照搬 Claude Code 脚本里的 `export const meta`**——dsh 的 meta 是单独的 JSON 参数,工具说明明确要求脚本里不写这一句,脚本解析失败会在启动前就被拒绝
3. **前台跑大 workflow,父 agent 一直卡着**——前台会阻塞整轮。规模大就用 `run_in_background`,通过 job 查看
4. **多 stage 的 `pipeline` 没判空**——孩子失败时 `agent()` 返回 `null`,下一个 stage 照样收到 `null`
5. **把参数写错当成"有几个孩子失败了"**——用错函数是致命错误,整个脚本直接失败,看错误信息改脚本
6. **并发调高后报 `ACTIVATION_LIMIT_REACHED`**——按 `dsh-subagent` 文档的语义,workflow 的孩子同样占用整棵委派树的 `maxActiveSubagents`(默认 8),而准入不排队、启动失败在 workflow 里是致命的。两份文档没有交代这两个上限的交互,CPU 核多的机器上建议把 `maxConcurrentAgents` 显式设在它以内,并在自己的版本上实测
7. **指望 workflow 断了能续跑**——没有检查点,进程重启就从头来
8. **以为 workflow 的脚本进程没网**——文件策略不管网络,脚本能拿到的只是一个空环境
9. **agent team 的队友同时改一个文件**——共享 cwd,`writeScopes` 只给警告。按文件划分任务,或者改用 worktree
10. **队友卡住后任务一直挂在它名下**——不会自动释放,要 `release` 或由 Lead 重新分配

---

## 源码与文档索引

- `docs/subsystems/workflow.md`
- `packages/workflow/workflow/README.md`
- `packages/workflow/workflow-ptc/README.md`
- `packages/workflow/workflow-ptc/src/index.ts`
- `packages/workflow/workflow-ptc/src/runtime.ts`
- `packages/workflow/tool-workflow/README.md`
- `docs/tool-catalog.md`
- `packages/experimental/tool-ralph/README.md`
- `docs/subsystems/agent-team.md`
- `packages/experimental/agent-team/README.md`
- `packages/experimental/agent-team-profile/README.md`
- `packages/bundle/web-app/presets/standard.patch.yml`

---

下一篇:`26-Worktree-Jobs与定时任务.md`,讲实验性的 worktree 怎样给 agent 隔离出独立的工作副本、后台 job 的生命周期与输出,以及定时任务怎么让 agent 在没人盯着时按计划干活。
