# Plan、Goal 与 Todo

Claude Code 系列 08 篇把 plan mode 比作刹车、`/goal` 比作油门。dsh 也有这两样,外加一个模型自己维护的 todo 清单和一个向你提问的工具。名字相似,性质却有一处根本差别:**dsh 的 plan mode 只是一段提示词,不拦任何工具**。

这一篇是第一层的最后一篇,讲这几样东西各管什么、在一个真实任务里怎么配合。

> 一句话先记住:**plan mode 是软约束,真正拦住改动的是 05 篇的沙箱和审批;goal 是每个会话一个、能跨轮自动续跑的目标,靠轮数上限而不是 token 预算刹车;todo 是模型每次整表替换的进度清单**。

---

## 一、四样东西的定位

| | 谁发起 | 持久性 | 是否强制 | 用户入口 |
| --- | --- | --- | --- | --- |
| **plan mode** | 你 | 状态写进会话日志,恢复和 fork 后保留 | 否,只加一段提示词 | `/plan`、`/plan off`、计划审阅 |
| **goal** | 你或模型(需你的直接请求) | 跨轮、跨重启持久 | 否,但会自动续跑 | `/goal` 系列命令、Web 的目标控件 |
| **todo** | 模型 | 跨轮、恢复会话后保留 | 否 | 只读展示 |
| **ask_user_question** | 模型 | 一次性 | 默认阻塞等你回答 | 回答卡片 |

在 Web 里,这四样都挂在 `standard`、`ptc`、`cordis` 三个 agent 预设上;**极简模式(`minimal`)一个都没有**(04 篇)。headless、ACP、SDK 没有斜杠命令,`/plan`、`/goal` 在那里用不了。

---

## 二、Plan mode:只是提示词

### 2.1 进入和退出

| 操作 | 效果 |
| --- | --- |
| `/plan` | 进入 plan mode |
| `/plan <消息>` | 进入并把这条消息作为下一步的请求,可以带图片和文件附件 |
| `/plan off` | 直接离开;也会取消一个还没生效的进入 |
| Web 输入框 `+` 菜单里的 Plan | 等价于 `/plan` |
| 输入框旁蓝色的 Plan 按钮 | 点击执行 `/plan off` |

切换不是立刻生效的:选择先挂起,在下一个被接受的步骤开始前写进日志。所以 agent 正在跑时切 plan mode,影响的是它的下一步,而不是正在进行的那一步。

### 2.2 它到底做了什么

plan mode 激活时,system prompt 里多一个 `plan:policy` 段落(order 50),内容是 base 里 `plan-mode` 行配置的文字,开头是:

```text
You are in plan mode. Stay in plan mode until the user approves your plan
through exit_plan_mode or switches the session mode. ...
Do not edit or write files, change configuration, run formatters or code
generation that rewrites tracked files, commit, or otherwise carry out the plan.
```

后面几段要求模型先探索、用 `ask_user_question` 只问需要你拍板的事、不要用 `todo_write` 跟踪规划阶段,最后用 `exit_plan_mode` 提交一份以 `#` 标题开头的完整 Markdown 计划。

关键在这句:**"The tool catalog stays the same across modes for request-cache stability"**。为了不让请求前缀的 KV Cache 失效(16 篇),工具列表在 plan mode 里一个不少,写文件、跑命令的工具照样可以调用。plan mode 靠的是模型听话,仓库文档自己的定性就是 **soft guidance**。

### 2.3 审阅计划

模型调用 `exit_plan_mode` 后,Web 在右侧边栏打开这份计划:

| 你的选择 | 结果 |
| --- | --- |
| **Approve** | 离开 plan mode,下一步开始实施 |
| **Keep planning**(可附反馈) | 工具调用以失败返回并带上你的反馈,模型修改后重新提交 |
| 关掉审阅、直接打字 | 当前轮结束,plan mode 保持,你的下一条消息开始新请求 |

几个细节:

- 没有交互式审阅通道时(比如没有 UI 的入口),`exit_plan_mode` 直接失败,只能用 `/plan off` 离开
- 提交过的计划会作为卡片留在那一轮的产出区,之后随时能点开;刷新页面后从会话历史恢复
- 会话行上会显示 **Plan review** 状态点
- fork 出来的会话继承 plan 状态,新 spawn 的子代理从非 plan 状态开始;受另一个 agent 管理的子代理不能打开审阅

### 2.4 想要真正的"只读规划"

既然 plan mode 不拦工具,需要硬保证时就把它和权限预设一起用:

```text
1. /permission read-only      写文件和越界一律被沙箱拒绝
2. /plan 设计 auth 模块从 session cookie 迁移到 JWT 的方案
3. 审阅、Approve
4. /permission workspace-write
```

这样即使模型在规划阶段"忍不住"动手,写操作也会被沙箱挡下。注意 `read-only` 下模型仍可以申请提权,弹出来的审批拒掉即可(05 篇)。

---

## 三、Goal:持久目标与自动续跑

### 3.1 模型

- **每个会话最多一个当前目标**。未完成的目标必须先编辑、暂停、恢复、阻塞或清除,才能被新目标替换;已完成的目标可以直接替换
- **四个持久阶段**:`active`、`paused`、`blocked`、`complete`
- **另有一个进程内的"是否已武装(armed)"标志**,决定能不能自动开下一轮。它不持久化:恢复会话或 fork 之后,`active` 的目标处于未武装状态,**需要你明确 resume 才会继续**
- **刹车只有轮数**:每个目标有 `maxGoalRounds`,默认 256(`dsh-goal` 的 `defaultMaxGoalRounds`)。**不计 token、费用、时间和服务商额度**

源码注释称这是仿 Codex 形状的 `/goal` 命令。

### 3.2 `/goal` 命令

| 输入 | 效果 |
| --- | --- |
| `/goal` | 显示目标、阶段、已用轮数 / 上限、是否武装,以及当前可用的命令 |
| `/goal <目标>` | 创建并武装一个目标;已有未完成目标时报错,提示先 edit 或 clear |
| `/goal edit <目标>` | 改目标文字,不改阶段和武装状态;当前目标已完成时等于新建 |
| `/goal pause` | 暂停并解除武装;由你发起的暂停会中止正在跑的那一轮 |
| `/goal resume` | 恢复已停止的目标,或在恢复会话 / fork 后重新武装,前提是还有剩余轮数 |
| `/goal clear` | 清除当前目标,历史仍留在会话日志里 |

控制词只有占满整个输入时才算命令:`/goal pause after verification` 会创建一个字面目标"pause after verification"。创建或编辑时附带的图片和文件,会作为一条普通用户消息进入历史,后续轮次从历史里读。

Web 侧也有目标控件,可以编辑、暂停、恢复、清除;创建目标仍走 `/goal` 或让模型创建。

> 仓库小差异:`packages/goal/command-goal/README.md` 说 `/goal` 挂在 `standard`、`code`、`cordis` 三个预设上,但 `packages/bundle/web-app/presets/` 里没有 `code` 预设,实际挂载的是 `standard`、`ptc`、`cordis`。以预设文件为准。

### 3.3 自动续跑怎么跑

`dsh-goal-round-driver` 在满足这些条件时自动开一轮:agent 完全空闲、子代理都已结束、目标 `active` 且已武装、还有剩余轮数。每一轮是一条带目标文字、当前轮号和上限的提示,告诉模型以工作区现状、工具结果和持久状态为准继续推进。

- **只有真正进入历史的目标轮才计数**,你发的消息不占轮数
- 你在中间插话,自动轮次会让路,等 agent 再次空闲才继续

停下来的情况:

| 原因 | 结果 |
| --- | --- |
| 模型调用 `update_goal` 报告 `complete` | 目标完成,本轮写一条给你的总结后结束 |
| 自动轮次里模型报告 `blocked` | 需要同一问题**连续 3 轮**才被允许(`blockedAfterConsecutiveRounds`),阻塞码 `model-reported`;你直接要求停下则立即生效 |
| 轮数用完 | 记录阻塞码 **`round-limit`** |
| 你暂停、取消当前轮 | 暂停;取消不会自动重启 |
| 一轮因为 max tokens 结束、持久化失败、插件卸载 | 停止续跑 |

撞上 `round-limit` 后 `/goal resume` 会因为没有剩余轮数失败。可以直接对模型说"把目标轮数上限提到 400",由它用 `update_goal` 先 `edit` 提高 `max_goal_rounds` 再 `resume`;或者 `/goal clear` 后重建。

### 3.4 模型这一侧的工具

`dsh-tool-goal` 给模型三个工具:`get_goal`、`create_goal(objective, max_goal_rounds?)`、`update_goal(goal_id, revision, action, ...)`,`action` 是 `edit` / `pause` / `resume` / `complete` / `blocked` 之一。

权限规则很严:**创建、编辑、暂停、恢复都要求当前轮里有你的直接消息**,而且只能是顶层 agent,子代理和定时任务这类非人类来源都不行。所以你说"帮我把这个迁移一直做完",模型可以替你建目标;但它不能在自动轮次里自己给自己续命。被你暂停的目标,模型的 `resume` 会被拒,只能你来恢复。

### 3.5 和 Claude Code `/goal` 的差别

| | Claude Code | dsh |
| --- | --- | --- |
| 本质 | 会话级的 prompt 型 Stop hook | 持久的目标状态 + 独立的续跑驱动 |
| 谁判断做完 | 独立的评估模型 | 干活的模型自己调用 `update_goal` |
| 刹车 | 评估者判定、手动 clear | 轮数上限(默认 256),没有 token 预算 |
| 持久性 | 当前会话 | 跨重启持久,恢复后要手动 resume |

因为没有独立评估者,**目标写成可验证的完成条件更重要**,比如"`pnpm test` 和 `pnpm typecheck` 都退出码为 0",模型才有客观依据决定什么时候报 `complete`。另外 goal 不改变权限预设:`workspace-write` 下需要提权的动作仍会停下来等你审批。

---

## 四、Todo 与 ask_user_question

### 4.1 `todo_write`:整表替换

每一项只有两个字段:

```json
{
  "todos": [
    { "content": "迁移 session 中间件到 JWT", "status": "completed" },
    { "content": "更新登录接口和测试", "status": "in_progress" },
    { "content": "清理旧的 cookie 配置", "status": "pending" }
  ]
}
```

- **每次调用都发完整清单**,新清单整体替换旧的,没有按项修改
- 状态只有 `pending` / `in_progress` / `completed`,刻意不设 id、优先级和 `activeForm`
- 内容为空、重复,或者多带了字段,调用直接失败
- base 和 Web 预设都配了 `allowParallelInProgress: true`,允许多项同时 `in_progress`(配合子代理和后台任务)
- 清单属于**一个 agent 会话**:子代理有自己的清单,无法共享
- 成功时返回 `Updated todo list: <n> pending, <n> in progress, <n> completed.`,界面同步更新

plan mode 的提示词明确要求规划阶段**不要**用它:todo 跟踪的是批准之后的实施进度,计划本身属于 `exit_plan_mode`。

### 4.2 `ask_user_question`

模型需要你确认、选择或补充信息时调用它。一次可以问多个问题,每个问题给出选项,推荐项放第一个并在标签后加 `(Recommended)`。

- 默认**阻塞**,一直等你回答
- 可以在预设的插件列表里把 `tool-ask-user` 行配成 `mode: timed` 加 `timeout`(秒):到点后模型先去做不依赖答案的事,问题仍然可答;**超时永远不等于同意**
- 没有应答 UI 时,阻塞调用直接失败
- 受另一个 agent 管理的子代理不能调用它

---

## 五、一个真实任务里怎么配合

```text
1. /permission read-only
2. /plan 把 auth 模块从 session cookie 迁到 JWT,保持现有接口不变
     模型读代码、跑只读检查
     遇到"token 有效期多长"这类要你拍板的事 → ask_user_question
     exit_plan_mode 提交计划 → 右侧边栏审阅 → Keep planning 两轮 → Approve
3. /permission workspace-write
4. /goal 按已批准的计划完成迁移,pnpm test 与 pnpm typecheck 全部退出码为 0
     自动续跑开始,模型用 todo_write 维护实施清单
     你随时 /goal 查看轮数,看 todo 了解进度,Trajectory 看细节(07 篇)
5. 中途要插手:直接发消息(自动轮让路),或 /goal pause
6. 模型报 complete,写一段总结;你审 diff
```

几个经验:

- **规划和实施分开两个阶段**,中间的 Approve 就是你的检查点
- **goal 的完成条件写成命令和退出码**,不要写"代码更优雅"
- **长任务前先想好权限**:goal 在 `workspace-write` 下遇到提权会停住等你;真要无人值守,放进容器再放宽预设(05、27 篇)
- **恢复会话后记得 `/goal resume`**,否则目标显示 active 却不动

---

## 踩坑

1. **以为 plan mode 下模型改不了文件**——工具一个没少,只靠提示词约束。要硬保证,规划时切到 `read-only` 预设
2. **在审阅时直接打字回复,以为等于批准**——关掉审阅打字只会结束这一轮,plan mode 仍然开着。要么点 Approve,要么 Keep planning 附反馈
3. **在 headless 或 ACP 里发 `/plan`、`/goal`**——这些入口没有斜杠命令
4. **选了极简模式找不到 plan、goal、todo**——`minimal` 预设一个都没挂
5. **已有目标时 `/goal 新目标`**——未完成的目标不能直接替换,先 `/goal edit` 或 `/goal clear`
6. **`/goal pause after tests` 想表达"测试后暂停"**——控制词必须占满整个输入,这会被当成新目标文字
7. **重启后目标显示 active 却不跑**——恢复和 fork 后目标是未武装状态,要 `/goal resume`
8. **指望 goal 控制花费**——只有轮数上限,不计 token 和费用。担心成本就调低 `max_goal_rounds` 或 `defaultMaxGoalRounds`
9. **挂上 goal 走开,回来发现停在第一个审批**——goal 不改权限预设,提权仍要你批
10. **以为 `todo_write` 能单独勾掉一项**——每次都是整表替换,模型漏发的项就从清单里消失了

---

## 源码与文档索引

- `docs/subsystems/plan.md`、`packages/plan/plan-mode/README.md`
- `packages/client/ui-plan/README.md`
- `packages/bundle/base/cordis.patch.yml`(`plan-mode` 行的提示词、`goal`、`tool-todo` 行)
- `docs/subsystems/goal.md`、`packages/goal/goal/README.md`
- `packages/goal/command-goal/README.md`、`packages/goal/command-goal/src/index.ts`
- `packages/goal/goal-round-driver/README.md`、`packages/goal/tool-goal/README.md`
- `packages/client/ui-goal/README.md`
- `docs/subsystems/todo.md`、`packages/todo/tool-todo/README.md`
- `docs/subsystems/user-questions.md`、`packages/interaction/tool-ask-user/README.md`
- `packages/bundle/web-app/presets/`(`standard` / `ptc` / `cordis` / `minimal` 四个预设)

---

下一篇:`09-Cordis入门-插件-Context与服务.md`,进入第二层「读懂 dsh 内核」,讲 dsh 底下的插件框架 Cordis:三种插件形态、Context、服务与 `inject` 依赖。
