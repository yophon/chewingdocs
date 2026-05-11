# Plan Mode 与 ExitPlanMode

让 Claude 在一个**清晰的计划被你认可之前**,什么实质改动都不做——这就是 plan mode。它在 Claude Code 的工作流里看似"多了一步",但**对中等以上复杂度的任务,plan mode 是从"可能翻车"变成"可控交付"的最大杠杆**。

> 一句话先记住:**Plan mode 把 Agent 强制从"边想边做"切换到"先想清楚,你审完再做"**。它不是给小改动用的,**是给"我不放心让它直接动手"的改动用的**。

---

## 一、Plan Mode 是什么

进入 plan mode 后,Claude 行为有两条硬约束:

1. **不能改文件**(Edit / Write / NotebookEdit 全禁)
2. **不能跑有副作用的命令**(基本只能读、查、grep、glob)

但它能:

- 读所有文件
- Grep / Glob 探索代码
- 起 subagent 调研
- 跟你来回讨论方案
- **写出一份 plan 文件**给你审

审完之后:**你点 approve(实际是 Claude 调用 `ExitPlanMode` 工具触发批准流程)**,plan mode 退出,Claude 才真正动手执行。

```
[Plan Mode]              [Approval Gate]              [Execution]
读 / 查 / 想 / 写 plan   →    ExitPlanMode →用户确认  →   开始改
                                (拒绝就回 plan 重写)
```

> 这个 gate 是 plan mode 最有价值的地方——**你在动手前看到一份完整方案**,不是事后看 diff 后悔。

---

## 二、什么时候该进 plan mode

不是所有任务都需要 plan mode。**用错地方反而拖慢节奏**。

### 该用

- **跨多文件的改造**:重命名 API、升级一个 hook 版本、统一 lint 规则
- **架构级决定**:加一个新模块、引入新框架、迁移数据库
- **风险大的改动**:动 schema、动 auth、动支付、动权限
- **不熟悉的代码**:你不确定哪里会受影响时,让它先调研出影响面再开干
- **多步骤工作流**:涉及"先 X 再 Y 然后 Z"的连贯改造

### 不该用

- **单文件单点改**:加个 log、改个 typo、补一行注释
- **明确指令**:你已经说得很清楚要怎么改,plan mode 反而把简单事变复杂
- **探索性会话**:还不知道要做什么,只是看看代码,直接读就行
- **bug 调试**:bug 排查是动态的,plan 不出来,**直接动手 + 看反馈**更快

> 经验法则:**改动会涉及到 3+ 文件,或可能有非预期影响,就上 plan mode**。

---

## 三、怎么进 plan mode(三种方式)

### 3.1 用户主动:`/plan` 或 Shift+Tab

最直接:输 `/plan`,或者按 Shift+Tab 在几种模式间循环切换(`default` → `acceptEdits` → `plan`)。

### 3.2 启动时指定:`--permission-mode plan`

```bash
claude --permission-mode plan
```

整个 session 默认 plan mode,适合"今天就是来做大改造"的场景。

### 3.3 Claude 自己进:`EnterPlanMode` 工具

LLM 自己评估到"这事得先 plan 一下",会主动调 EnterPlanMode 工具——你看到的体验是它说 "让我先 plan 一下" 然后切到 plan mode。

> 这种主动行为是 Claude Code 内核 prompt 鼓励的——遇到大任务、不熟悉的代码、可能多解的问题,LLM 自己进 plan mode 最稳。

---

## 四、Plan 文件长什么样

进入 plan mode 后,Claude 会把它的计划写到一个 plan 文件里(具体路径在每个 session 不一样,系统 prompt 会告诉它)。一份典型的 plan 大概这样:

```markdown
# 计划:把 session-based auth 迁到 JWT

## 目标
- 现有 60 个 API 从 cookie session 改为 Bearer JWT
- 对外不破坏(老 client 仍能用一段时间)

## 影响面分析
- middleware/auth.ts:核心鉴权逻辑
- api/login.ts、api/logout.ts:登录登出流程
- 47 个业务路由用了 ctx.session
- 前端 lib/api.ts:axios 拦截器

## 步骤
1. 引入 JWT 库 + 工具(签发 / 校验 / 刷新)
2. 加新 middleware/jwt-auth.ts,与老 session-auth 并存
3. 改 login API:同时返回 set-cookie 和 Authorization header
4. 让所有路由 middleware 接受两种鉴权(session OR JWT)
5. 前端 axios 改为 Bearer 模式
6. 监控 cookie 模式调用比例,降到 < 1% 后下线

## 风险与回滚
- 风险:JWT 长 token 泄漏代价更大 → 加短期 + refresh
- 回滚:每一步都保留老路径,任何一步失败可以单独回退

## 不在本次范围
- 多设备登录管理
- 撤销 token 列表(下个迭代)

## 测试计划
- 加 jwt-auth 的单元测试
- 加并存模式的集成测试
- staging 环境验证 1 周
```

**关键要素**:

- 目标(说清楚做什么)
- 影响面(哪些文件 / 模块会动)
- 步骤(可执行的有序列表)
- 风险与回滚(失败怎么办)
- **不在本次范围**(明确边界,防止越界)
- 测试计划

> 你审 plan 时要看的不只是"步骤对不对",更重要的是"边界对不对、风险考虑全不全、回滚方案有没有"。**没回滚方案的 plan 直接退回**。

---

## 五、ExitPlanMode 的角色

`ExitPlanMode` 是 plan mode 里 LLM 用来"申请退出"的工具。**它不是直接退出**——是触发一个**用户审批弹窗**。

行为:

1. LLM 写完 plan,调 ExitPlanMode
2. 用户看到"批准 / 拒绝"按钮
3. 批准 → plan mode 退出,LLM 开始执行
4. 拒绝 → 留在 plan mode,LLM 继续讨论 / 改 plan

**重要**:`ExitPlanMode` 只在 plan 真的需要写代码 / 改文件时调。如果是纯研究 / 纯探索任务(只读),**根本不需要 ExitPlanMode**——直接给结论就行。

> Claude Code 的内置 prompt 里明确写了:"研究类任务不要用 ExitPlanMode"。这是常被新写 agent 的人犯的错——把每个任务都当作"要改文件",其实很多任务全程只读。

---

## 六、Plan Mode 配合 todo / hook 用

### 6.1 plan + todo

plan 通过后,Claude 通常会把"步骤"写进 todo list,然后逐项执行。这种工作流的好处:

- 每一步可见进度
- 中断后可恢复
- 你能看到当前在哪一步

```
[plan 通过 → 创建 todo list]
  ☐ 引入 JWT 库
  ☐ 加 middleware/jwt-auth.ts
  ☐ 改 login API
  ...
[一项一项做,做完打勾]
```

### 6.2 plan + hook

执行阶段配 PostToolUse hook:每改一个文件自动跑测试 / lint / format,**plan 通过 → 一路自动化到结尾**。

```
plan 通过
  ↓
LLM 改文件
  ↓
PostToolUse hook 自动跑 prettier + lint
  ↓ 失败回灌 LLM
LLM 修
  ↓
跑测试
  ↓
进入下一项 todo
```

**这是 Coding Agent 最丝滑的姿势**——计划你看过、执行有质量门、结果有 todo 跟踪。

---

## 七、Plan Mode 下 LLM 能做和不能做的

| 能 | 不能 |
| --- | --- |
| Read / Grep / Glob | Edit / Write / NotebookEdit |
| 跑只读 Bash(`git status`、`ls`、`cat`) | 跑写 Bash(`git commit`、`rm`、`mv`、`docker run`) |
| 起 subagent 调研 | 让 subagent 改文件 |
| WebFetch / WebSearch | 写 PR / 发邮件 |
| TodoWrite(规划用) | 任何"对外有副作用"的动作 |

**重点**:plan mode 不只是禁止 `Edit`——而是禁止**所有可能"已经动手"的副作用**。这是为什么很多 Bash 命令也被禁。

> 如果 Claude 在 plan mode 下问你"我能跑一下 `npm install` 吗",**说明它想做的事真的是有副作用**。这时要么 approve,要么改 plan 让这步移到执行阶段。

---

## 八、典型场景模板

### 8.1 大重构

```
你:把整个项目从 redux 迁到 zustand,先做计划
[Claude 进入 plan mode 自动 → 调研 → 写 plan]
你:审 plan,觉得 step 4 风险大,改一下
[Claude 改 plan]
你:批准
[ExitPlanMode → 开始执行]
```

### 8.2 不熟悉的代码上手

```
你:这个项目我没看过,要在 payment 模块加个 webhook,/plan
[Claude 大量读代码、调 Explore subagent、画影响面]
[plan 出来你看完一目了然]
你:批准
```

### 8.3 风险大的改动

```
你:升级 NextJS 14 → 15,/plan
[Claude 看 changelog、看官方迁移指南、扫项目里 deprecated 用法]
[plan 给出按文件分批的迁移路径]
你:批准
```

---

## 九、debugging plan mode

### 9.1 LLM 不进 plan mode 怎么办

加 `/plan` 强制进入,或者重启 `claude --permission-mode plan`。

如果你希望它**自动判断进 plan mode**,在 CLAUDE.md 写约束:

```markdown
# CLAUDE.md
- 涉及 3+ 文件的改造、动 schema、动 auth、动支付,先进 plan mode
- 单文件改动可直接执行
```

### 9.2 plan 写得太空 / 太具体

太空(只有大方向)→ 让它"加上具体到文件路径的步骤"。
太具体(逐行代码)→ 计划阶段不需要细节,代码留到执行写。

### 9.3 ExitPlanMode 弹了但 plan 还不完整

不批准,继续讨论。**多迭代两轮没问题——比改完发现错了便宜得多**。

---

## 十、踩坑

1. **小改动也进 plan mode**——加一行 log 还要 plan,流程拖死。**只有 3+ 文件 / 风险大 / 不熟悉的才上**
2. **plan 不审就批**——这是最常见的失误。**plan 是给你看的,不看等于没写**。每次至少扫一遍"步骤"和"不在本次范围"
3. **plan 太长读不下去**——让它精简到一页能看完。**plan 不是设计文档,只是执行前的 sanity check**
4. **没"不在本次范围"段**——不写边界,LLM 容易越界。**让 plan 必须有这一段**
5. **没回滚方案**——动 schema / 动 auth / 动支付的 plan 没回滚 = 不该批
6. **plan 通过后中途变需求,不重 plan**——执行到一半你说"再加个 X",原 plan 就乱了。**重大需求变化 = 重 plan**
7. **以为 plan mode 下 Bash 全能跑**——只读 Bash 能跑,写 Bash 不行。改文件、跑 docker、跑 npm install 全在禁止之列
8. **研究任务也调 ExitPlanMode**——纯研究不需要,直接给结论。**有这个习惯的早点改**
9. **plan 文件不留下**——执行完就清掉了,出问题想看当时计划没了。**重大改造 plan 自己 cp 一份留底**
10. **plan mode 只用一次**——大改造分几个阶段时,每个阶段开始都该重新 plan;不要批了一次大 plan 就连续干一周

---

下一篇:`10-Memory与CLAUDE.md.md`,讲项目级 / 用户级 memory 文件、@import 链接其他 md、好的 CLAUDE.md 长什么样、什么内容该写、什么不该写、和 settings / skill / hook 怎么分工。
