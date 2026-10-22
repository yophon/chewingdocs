# Worktree、Jobs 与定时任务

24、25 篇讲的是"多个 agent 同时干活"。这一篇换两个维度:**不在同一个目录干活**,和**不在同一时刻干活**。前者靠 git worktree 把会话挪进一份新检出;后者靠两套机制:后台 job 让一条命令在会话名下继续跑、跑完叫醒 agent,定时任务让 Host 到点往原会话投一条消息。08 篇的 goal 自动续跑也属于"没人说话它也继续"的一类,这里放在一起对照。

如果你读过 Claude Code 系列的并行 Agent 篇和无人值守篇,会发现 dsh 的思路很不一样:Claude Code 有子代理级的 worktree 隔离,有云端 routines;dsh 这几样都更"贴着会话"——worktree 只换当前会话的目录,定时任务只往原会话里投消息,而且只在你本机的 Host 运行时才投。

> 一句话先记住:**这三样都不会凭空多出一个 agent**。`create_worktree` 是把当前会话挪进新检出,job 是挂在会话名下的后台任务,定时任务是到点给原会话发一条 follow-up。dsh 的"无人值守"围绕会话组织,不围绕云端或独立进程。

---

## 一、先分清四种"它自己会继续"的机制

| 机制 | 什么时候触发 | 消息进哪里 | 前提 | 详见 |
| --- | --- | --- | --- | --- |
| **job 完成通知** | 后台命令 / workflow 结束 | 同一会话:忙时插进下一步,空闲时开一个新 turn | 组合里有 `dsh-jobs-local` + `dsh-tool-jobs` | 本篇三 |
| **定时任务** | 到达设定时间 | 原会话的 inbox,作为 follow-up | Host(`dsh web` 或 Desktop)在运行 | 本篇四 |
| **goal 续跑** | agent 空闲且 goal 处于激活状态 | 同一会话,作为 goal 来源的用户消息 | 挂了 `dsh-goal-round-driver` | 08 篇 |
| **workflow 后台运行** | 你让脚本 `run_in_background` | 结果随完成通知回来 | 挂了 workflow 工具 | 25 篇 |

它们的共同点是:**都不会绕过 05 篇的 sandbox 和 approval**。被叫醒的 turn 和你手动发消息开的 turn 走的是同一条工具管线,需要审批的调用照样要有人批准:Web 里要等人在界面上处理,headless 里没有应答者、直接失败(27 篇)。没人在场时,这正是"跑了一夜什么也没做"的常见原因。

---

## 二、Worktree:把会话挪进一份新检出(实验性)

### 2.1 怎么开

worktree 能力由两个实验性包组成:运行时 `@deepseek-ai/dsh-experimental-worktree`(提供 `ctx.worktrees`)和工具 `@deepseek-ai/dsh-experimental-tool-worktree`(提供 `create_worktree`)。**所有发布的 profile 里它都是关的**。两种打开方式:

- **GUI**:Plugins → Official → **Git Worktrees**,打开开关。这个可选 bundle 随 Harness 一起安装,关掉开关只移除工具,不删已有的检出和分支
- **显式组合**:在 patch 或自己的组合里按顺序挂两行,运行时在前

```yaml
- name: '@deepseek-ai/dsh-experimental-worktree'
- name: '@deepseek-ai/dsh-experimental-tool-worktree'
```

运行时依赖 `workingDirectory`、`fs`、`subprocess`、`sandbox`、`sandboxPolicy` 这几个服务,标准组合里都有。它是实验性功能,升级前对照你版本的包 README 再确认一遍。

### 2.2 `create_worktree` 做了什么

模型调用 `create_worktree({ name?, from? })`,一次完成三件事:

1. **在当前会话所在的仓库里解析 `from`**(本地的 commit、分支或 tag,省略为 `HEAD`),先钉死成一个 commit
2. **新建分支 + 检出**,默认放在 `<当前检出根>/.agents/worktrees/<name>`;`name` 省略时生成 `worktree-` 加 UUID。如果这次创建顺带建出了池目录,会在里面写一个内容为 `*` 的 `.gitignore`,已有文件和忽略规则不动
3. **把会话的当前工作目录切过去**(通过 working-directory 服务),之后的相对路径、新启动的进程、指令文件发现、skills 都以新目录为准

返回值是四个字段:

```ts
interface CreatedWorktree {
  path: string           // 规范化后的检出绝对路径
  branch: string         // 新分支名
  baseCommit: string     // 钉死的 commit
  repositoryRoot: string // 源检出的顶层目录
}
```

几条容易踩的语义:

- **分支名或检出路径已存在就报错**,它只创建,不复用
- **不复制任何未提交内容**:暂存的、未暂存的、未跟踪的、被忽略的文件都留在原检出里。`.env`、依赖目录在新检出里都没有
- **不 fetch**:缺失的对象(包括 partial clone 缺的)直接让创建失败;也不初始化 submodule、不装依赖
- **检出时关掉 clean / smudge / process 过滤器**,避免执行仓库配置的程序或触发隐式下载。代价是 Git LFS 指针和加密 blob 保持原样,要自己另行还原
- **在已有的 sandbox 策略下执行**:它不会为目标目录和共享的 Git 管理目录额外放开写权限。默认位置在项目内,一般没问题;把 `directory` 改到项目外就可能被 05 篇的沙箱拦下

### 2.3 离开与清理

离开用内置的 `working_directory({ cd: path })` 切回去即可。**检出和分支都会保留**,包里没有"删除 worktree""合并回去"的工具,清理是你自己的事:

```bash
git worktree list
git worktree remove .agents/worktrees/fix-login
git branch -d fix-login
```

取消或失败也可能留下半成品,错误信息里会写出位置。

还有一条和 05 篇相关的细节:**会话目录变了,但 sandbox 的可写根和项目归属仍锚定在会话最初的项目上**。所以默认的 `.agents/worktrees/` 放在项目里面,而不是项目旁边。

### 2.4 配置与 Git 版本

`dsh-experimental-worktree` 的配置字段:

| 字段 | 作用 |
| --- | --- |
| `directory` | 仓库内的相对检出池目录 |
| `namePrefix` | 自动生成名字的前缀 |
| `gitCommand` / `nodeCommand` | Git、Node 可执行文件 |
| `timeoutMs` / `graceMs` / `maxOutputBytes` | 单条子进程的期限、终止宽限、输出上限 |

**Git 版本有要求**:必须支持 `GIT_NO_LAZY_FETCH`,即 Git 2.45 及以上,或 2.39.4、2.40.2、2.41.1、2.42.2、2.43.4、2.44.1 这些维护版本。更老的 Git 会忽略这个变量,在 partial clone 里可能悄悄从远端补拉对象,而不是按设计失败。

### 2.5 和 Claude Code 的 worktree 不是一回事

| | Claude Code | dsh |
| --- | --- | --- |
| 位置 | `.claude/worktrees/<名字>/` | `.agents/worktrees/<名字>/` |
| 入口 | `claude --worktree`、`EnterWorktree` 工具 | 只有 `create_worktree` 工具,默认关闭 |
| 子代理隔离 | 子代理可配 `isolation: worktree`,每个子代理一份 | **没有**。子代理不会自动进各自的 worktree |
| 复制被忽略文件 | `.worktreeinclude` | 不支持,一律不复制 |
| 清理 | 退出交互会话时询问,干净的自动删 | 从不自动删 |
| 成熟度 | 正式功能 | 实验性可选 bundle |

**dsh 没有"每个子代理一个 worktree"的自动隔离**。想让子代理在独立检出里干活,只能手动拼:父会话先 `create_worktree`(这会把父会话自己也挪过去),再用 24 篇讲的 `subagent` 的 `cwd` 参数把子代理的初始目录指到那份检出。子代理之后各自维护目录,父会话切走不影响已经起来的子代理。

25 篇的 agent team 更直接:包 README 写明**队友共享一个 cwd、立刻看到彼此的改动**,不提供 worktree、合并或文件锁。用 team 时要按文件划分任务,别指望 worktree 兜底。

---

## 三、Jobs:挂在会话名下的后台任务

### 3.1 三层结构

| 层 | 包 | 作用 |
| --- | --- | --- |
| 契约 | `@deepseek-ai/dsh-jobs` | 抽象服务 `ctx.jobs`(`JobRegistry`) |
| 实现 | `@deepseek-ai/dsh-jobs-local` | 进程内实现,任务随 harness 进程一起结束 |
| 模型面 | `@deepseek-ai/dsh-tool-jobs` | `job_output`、`job_list`、`job_kill` 三个工具和完成通知 |

base bundle 挂了 `jobs` 和 `tool-jobs` 两行;Web 组合把 registry 留在 Host 层,把 `job_*` 工具挪进各个 preset。**没挂 `dsh-tool-jobs` 的组合起不了后台任务**,因为它附带的 controller 才让生产方的 `ctx.jobs.start()` 可用。

生产方是谁?bash(Windows 上是 pwsh)、实验性的持久终端(`terminal_send`)、workflow 脚本。各自在 `JobKindMap` 里注册一个 kind,job id 的格式是 `<kind>-<16 位十六进制>`,比如 `bash-…`、`workflow-…`。

### 3.2 bash 的后台与超时

```json
{ "description": "Run full test suite", "command": "pnpm test", "run_in_background": true }
```

- **`run_in_background: true`** 立刻返回 job id,不受超时限制
- **前台命令也是 job**:组合了 registry 时,每条命令一开始就注册;前台调用只是在等这个 job
- **前台超时不杀进程**:`promoteOnTimeout` 默认 `true`,超时的命令转成后台 job 继续跑,返回同一个 id。这和很多 harness"超时即杀"的习惯相反
- `enableRunInBackground: false` 会把 `run_in_background` 从 schema 里拿掉

拿到 id 之后用三个工具:

| 工具 | 作用 |
| --- | --- |
| `job_output(job_id, wait?, timeout_ms?)` | 读上次读取之后的新输出;结尾总有 `[status: ...]`。`wait: true` 最多等配置的上限,超时不杀任务 |
| `job_list()` | 每行一个:`<id> [<kind>] <status> — <label>` |
| `job_kill(job_id, reason?)` | 请求取消,真正停下后状态才变成 `killed` |

状态只有五种:`running`、`stopping`、`completed`、`killed`、`failed`。

### 3.3 完成通知:忙时插队,闲时叫醒

job 结束时,owner agent 会收到一条会话内消息:

```text
background job <id> (<kind>: <label>) finished [status: ...]. Read its output with job_output.
```

- **agent 正忙**:通知插进下一步,turn 在 inbox 清空前不会结束,几个 job 一起结束只多花一步
- **agent 空闲**:开一个 follow-up turn 把它叫醒,这就是"job 能让空闲 agent 继续干活"的机制
- **已经收过的不重复通知**:`job_output` 的 `wait` 等到了的、模型自己 `job_kill` 的、owner 销毁导致的结束,都不发

`dsh-tool-jobs` 的配置:

| 字段 | 默认 | 含义 |
| --- | --- | --- |
| `waitTimeoutMs` | `30000` | `wait: true` 不带 `timeout_ms` 时等多久 |
| `maxWaitTimeoutMs` | `600000` | 模型能要求的最长等待,超出会被压到这个值 |
| `completionDelivery` | `wakeup` | `quiet` 时空闲 agent 也只排队、不叫醒 |
| `maxConsecutiveWakes` | 不设 | 每个 owner 连续被叫醒的上限,不设就是无上限 |

**无人值守时要想清楚 `maxConsecutiveWakes`**。默认无上限意味着"叫醒的 turn 又起了一个后台任务,任务结束再叫醒"可以一直链下去,每次叫醒都是一次你没让它发的模型请求。设了上限之后,超出的通知会静静地等,**只有用户发的消息能把额度恢复**,时间过去不会恢复,而且客户端不会提示有通知在等。

### 3.4 registry 的边界

`dsh-jobs-local` 的配置:`maxConcurrentJobsPerOwner` 默认 `10`(按 owner 计 `running` + `stopping`,满了直接报错,不排队)、`retainBytes` 默认 `262144`、`settledRetainBytes` 默认 `16384`、`pumpPollMs` 默认 `150`。

几条边界:

- **进程内,不跨重启**:harness 进程退出,活着的 job 和输出缓冲一起消失。会话日志里会留下 `job/registered` 和 `job/settled` 两条记录,但关机时最后那条 `settled` 不保证落盘,缺了就是"未完成",不要自己补结束时间
- **owner 销毁就取消**:会话的 agent 被销毁时,它名下的 job 全部取消并等待退出;挂在空闲 owner 上还没被领取的通知也一起丢掉
- **模型读取是单消费者**:`job_output` 读过的输出不会再给模型一次。Web 任务列表用的是不移动游标的 `readAt`,看输出不会"偷走"模型还没读的内容
- **完整输出在 spill 文件里**:缓冲被挤掉的部分,模型会收到提示和 spill 文件路径(大输出 spill 见 13 篇)

写插件时怎么注册自己的 job,见 19 篇。

---

## 四、定时任务:到点往原会话投一条消息

### 4.1 先确认你的版本里有没有

Schedule 的组合位置来回变过两次,所以老教程和老配置可能对不上:

| 版本 | 状态 |
| --- | --- |
| v0.1.7-rc.2 之后 | 从 Web 组合移出,改由默认关闭的"自动化任务"可选 bundle `@deepseek-ai/dsh-experimental-schedule-bundle` 插入 |
| v0.2.0-rc.2 之后 | 这个 bundle 被移除,Web 组合自己挂 `schedule` 和 `ui-schedule`;加载 profile 时会自动把旧 bundle 从 `dsh.profile.bundles` 里删掉 |

到 0.2.1-rc.2,发布的 Web profile 自带 Host 上的 `@deepseek-ai/dsh-schedule` 服务和"自动化任务"页面;`standard`、`cordis`、`ptc` 三个 preset 声明了时钟上下文 `time-context` 和四个工具;`minimal` 都没有。有两个例外要知道:

- **headless 和 SDK 组合里用不了**:投递依赖 Host Web 的 Session controller 和会话持久化后端,package README 明确说不能单独挂在 headless 或纯 SDK 组合里
- **Desktop 默认不开**:Desktop 的 README 写的是 "Desktop does not enable scheduled tasks by default"。同一段还说提醒只在已加载的会话里触发,而 schedule 包的 README 说 Host 会在到点时恢复冷会话,两份文档在这一点上不一致,以你实际版本的行为为准

旧的 patch 里如果有顶层的 `- id: time-context` 覆盖,现在已经匹配不到任何行(时钟行归 preset 了),删掉即可。

### 4.2 四个工具、六种规则

模型通过 `schedule_create`、`schedule_list`、`schedule_update`、`schedule_delete` 管理提醒。创建时必须给 `prompt`(到点要投递的指令)、`title`(不超过 120 字符,不会从 prompt 自动生成)和**恰好一个**时间规则:

| 规则 | 例子 | 说明 |
| --- | --- | --- |
| `after_seconds` | `600` | 一次性,正整数秒;只能创建,不能 update |
| `at` | `"2099-01-01T09:00:00+08:00"` | 一次性,必须带偏移;也接受 `{date, time, time_zone}` |
| `every_seconds` | `300` | 固定间隔,**不小于 60 秒**,从创建时刻对齐 |
| `daily` | `{"time":"23:00:00","time_zone":"Asia/Shanghai"}` | 每天某个本地时间 |
| `weekly` | 再加 `"weekdays":[1,3]` | ISO 星期,1 是周一,7 是周日 |
| `cron` | `{"expression":"*/15 9-17 * * 1-5","time_zone":"Asia/Shanghai"}` | 五段 Vixie cron,必须带 IANA 时区 |

完整的一次创建调用:

```json
{
  "title": "Nightly CI triage",
  "prompt": "检查 main 分支最近一次 CI,有失败就定位原因并在会话里汇报",
  "cron": { "expression": "0 23 * * 1-5", "time_zone": "Asia/Shanghai" }
}
```

几个细节:`every_seconds: 86400` 是固定间隔,不等于"每天 0 点",要按墙上时钟走就用 `daily`;夏令时跳过的本地时间那天直接跳过,重叠的时间取较早的那次;cron 不支持 `L`、`W`、`#`、`@daily` 这类扩展,也不接受六段式,最小粒度一分钟。时钟上下文会告诉模型浏览器所在的时区,但**落盘的规则一定带显式时区**,不依赖运行环境。

### 4.3 投递语义

这是本篇最需要记住的一段:

- **投到原会话**:到点时 Host 恢复原会话,用 follow-up 把 prompt 排进 inbox,**不打断正在进行的工作**。同一会话同时到点的几条循环任务可能合并成一条消息
- **Host 关了就不跑**:关掉 `dsh web` 或 Desktop,调度就停了。它不是云端服务
- **重启后只补最近一次**:Host 启动时检查存储的任务,过期的一次性任务补发,每个循环任务**只补最近错过的那一次**
- **至少一次,不保证恰好一次**:会话 inbox 落盘和任务记录更新是两次独立写入,中间崩溃可能导致同一提醒再投一次。提醒里让 agent 做的事最好是幂等的
- **投递记录 ≠ 执行记录**:自动化任务页的 Records 只证明"消息写进了会话 inbox",不代表模型做完了。投递失败也没有自动重试

记录保留由 `dsh-schedule` 的两个配置控制:`deliveryHistoryDays`(默认 30)和 `deliveryHistoryRecords`(默认 200),最新一条回执始终保留。

### 4.4 自动化任务页

侧栏的"自动化任务"能跨会话看所有提醒,不需要激活对应会话:

- 按名字、指令或会话 id 搜索,按 All / Enabled / Inactive 过滤
- 一次性任务投递后变成 Inactive,**不会消失也不会自动删**;模型的 `schedule_list` 只列 active 的,别把"列表里没有"理解成"已删除"
- 可以编辑 active 任务的名字、指令和时间规则,编辑保留任务 id 和投递记录;Inactive 任务只读
- 删除会连同投递记录一起删掉,但不会撤回已经排进会话的消息
- 页面上的"新建"会开一个新会话,输入框里预填好创建请求

### 4.5 不支持的事

- **子代理不能用**:三个 preset 的委派行 deny 了这四个工具,工具本身也会用 `subagent_session` 拒绝被委派的调用者;服务层同样拒绝给子代理会话创建提醒
- **没有暂停**,也**不能每次运行开一个新会话**:所有投递都回到原会话,长期跑下去原会话的上下文会越来越长(压缩见 16 篇)
- **归档会话前要先停掉提醒**:有 active 提醒的会话归档会被拒绝,选择停止会删掉它的全部 active 提醒,取消归档也不会恢复
- **旧会话日志里的提醒不会自动迁移**:只记录在旧版本会话日志里的提醒需要用 `schedule_create` 重建

---

## 五、goal 续跑:另一种"一直干下去"

08 篇讲过 goal。这里只补一句它在无人值守里的位置:`@deepseek-ai/dsh-goal-round-driver` 在 agent 空闲、goal 处于激活且还有轮次额度时,往同一会话排一条 goal-round 消息,让模型再推进一轮;额度由 goal 自身的 `maxGoalRounds` 决定,用完记为 blocked。它本身没有配置。

和定时任务的分工:**goal 是"做完为止",按轮次推进;定时任务是"按时间点",每次都是一条新指令**。两者可以叠加,比如每天 9 点的提醒里让 agent 检查 goal 的进展。

---

## 六、和 Claude Code 对照

| 需求 | Claude Code | dsh |
| --- | --- | --- |
| 会话里临时盯一件事 | `/loop`,固定间隔或自定间隔,循环任务 7 天自动过期 | `schedule_create` + `every_seconds` / `cron`,不会自动过期 |
| 一次性提醒 | 自然语言,底层 `CronCreate` 等工具 | `after_seconds` / `at` |
| 本机定时、不依赖会话开着 | Desktop 定时任务 | Host 运行即可,会话不用开着(Desktop 上默认关闭) |
| 不依赖本机 | 云端 routines | **没有对应物**,Host 关了就不跑 |
| 每次运行一个全新会话 | routines 是独立运行 | 不支持,总是回到原会话 |
| 后台命令 | Bash 的后台运行、Monitor | `run_in_background` + `job_*`,完成后自动叫醒 |
| 子代理文件隔离 | `isolation: worktree` | 没有,手动 `create_worktree` + `cwd` |

一句话:**Claude Code 在"脱离本机"和"自动隔离"上走得更远,dsh 在"一切回到同一个会话、留下可查的事件日志"上更一致**。要在服务器上做真正的无人值守,dsh 的路子是把 Host 跑在一台常开的机器上(公网部署的注意事项见 28 篇),或者干脆用 27 篇的 headless 加外部 cron。

---

## 七、几个组合用法

**夜间巡检**:在一个专门的会话里让 agent 建一个 `daily` 提醒,事先选好权限预设(05 篇),把任务设计成在沙箱允许的范围内就能完成,否则它会半夜卡在审批上;早上来看自动化任务页的 Records 和会话内容。

**长构建不阻塞**:让 agent 用 `run_in_background` 起构建,继续做别的;构建结束的通知会插进它当前的步骤,或者把空闲的它叫醒。

**外部 cron + headless**:不想让 Host 常驻时,用系统的 cron 或 CI 定时触发 27 篇的 `dsh headless`,每次一个独立运行,天然"每次一个新会话",也不依赖 Schedule。

```bash
# crontab:工作日 23:00 跑一次巡检
0 23 * * 1-5 cd /srv/repo && dsh headless "检查 main 分支 CI 并总结失败原因" >> /var/log/dsh-nightly.log 2>&1
```

---

## 踩坑

1. **以为子代理会自动进各自的 worktree**——dsh 没有这个功能。需要隔离就父会话先 `create_worktree`,再用 `subagent` 的 `cwd` 指过去;agent team 共享一个 cwd
2. **新 worktree 里跑不起来**——未提交文件、`.env`、依赖都不会复制,LFS 指针也不会还原。让 agent 先装依赖,敏感配置按需手动处理
3. **`.agents/worktrees/` 越积越多**——从不自动删除。定期 `git worktree list`,用 `git worktree remove` 和 `git branch -d` 清理
4. **把 worktree 池 `directory` 改到项目外然后创建失败**——sandbox 的可写根仍锚定原项目,`create_worktree` 不会替你放开写权限
5. **前台命令超时以为被杀了**——`promoteOnTimeout` 默认把它转成后台 job 继续跑,用 `job_list` 看,不需要就 `job_kill`
6. **无人值守时后台任务链停住了**——设了 `maxConsecutiveWakes` 后,额度只能由用户消息恢复;不设又可能无限自我唤醒。按场景二选一,别指望时间会重置额度
7. **在 headless / SDK 里找 `schedule_*` 工具**——Schedule 依赖 Host Web 的 Session controller,只在 Web 组合(以及开启后的 Desktop)里有。headless 场景用外部 cron
8. **把 Records 当执行日志**——它只证明消息进了会话 inbox。而且是至少一次投递,提醒内容要设计成幂等的
9. **按旧教程去插件页找"自动化任务" bundle**——它在 v0.2.0-rc.2 之后已移除,Schedule 直接在 Web 组合里;旧 patch 里针对 `time-context` 的顶层覆盖要删掉
10. **关了电脑以为提醒还会跑**——Host 不运行就不调度,重启后每个循环任务只补最近一次

## 源码与文档索引

- `docs/subsystems/worktrees.md`
- `packages/experimental/worktree/README.md`、`packages/experimental/tool-worktree/README.md`
- `docs/subsystems/working-directory.md`
- `docs/subsystems/jobs.md`
- `packages/jobs/tool-jobs/README.md`
- `packages/jobs/jobs-local/README.md`
- `packages/shell/tool-bash/README.md`
- `docs/user/guide/schedule.md`
- `packages/schedule/schedule/README.md`
- `packages/schedule/tool-schedule/README.md`
- `docs/upgrade-guide/v0.1.7-rc.2/schedule-optional-bundle/guide.md`、`docs/upgrade-guide/v0.2.0-rc.2/schedule-bundle-retired/guide.md`
- `packages/experimental/agent-team/README.md`、`apps/desktop/README.md`

---

下一篇:`27-Headless-SDK与ACP.md`,讲怎么把 dsh 嵌进脚本、CI 和你自己的程序:headless 的 `--json` 事件流与退出码、Python / TS SDK,以及面向自动化的 ACP 接入。
