# Subagents 子代理

主对话和 Claude 聊得久了上下文会爆——读了 50 个文件、跑了 100 条命令,context 窗口快满,LLM 开始忘事、决策质量下降。**Subagent 就是用来解决这个的**:把一段子任务派给独立的 Claude,它在自己的上下文里跑完、回汇一个总结,主对话只看到结果。

> 一句话先记住:**Subagent = "fork 一个 Claude 干一件事,用完即弃"**。隔离上下文、独立工具集、独立 token 预算。**搜代码、做研究、跑安全审查这种"重读轻写"的事,subagent 最擅长**。

---

## 一、为什么需要 subagent

主 Claude 一个 session 大概率最后会做这些事:写代码、改文件、改 settings、跑命令。这些动作对**当前的工作上下文**很重要。

但你也常会让它干一些"探索性"任务:

- "在这个 monorepo 里找所有用了 `useReducer` 的地方"
- "把 25 个文档读一遍总结今年的销售趋势"
- "用 git log 找 6 个月内改动最频繁的文件 top 10"

这些事**只是产出一个结论**,过程中读到的几百个文件根本不需要留在主上下文里。如果让主 Claude 自己干,它会:

1. Read 一堆文件
2. context 膨胀到 100K
3. 之后干正事时,因为上下文太长开始遗忘

**用 subagent**:

1. 主 Claude 派任务给 subagent
2. Subagent 自己 Read 几百个文件、整理结论
3. **Subagent 只把"结论"传回主 Claude**(可能就 200 字)
4. 中间的几百个文件,主 Claude 一行也没看到

> 这就是 subagent 的根本价值:**用一个独立的 context 窗口完成"探索",只把"结论"带回来**。主 context 干净,token 省一大截。

---

## 二、内置 subagent:Explore / Plan / general-purpose

Claude Code 默认带几个 subagent:

| subagent | 干什么 | 工具 |
| --- | --- | --- |
| **Explore** | 快速搜索、查代码、找文件 | 只读(Read / Glob / Grep / Bash) |
| **Plan** | 软件架构、设计实施方案 | 只读 |
| **general-purpose** | 通用,什么都能干 | 全部工具 |
| **statusline-setup** | 配置 status line | Read / Edit |

**主 Claude 调 Task 工具来派 subagent**,基本结构:

```jsonc
Task({
  "subagent_type": "Explore",
  "description": "找所有 useReducer 用法",
  "prompt": "在 src/ 下找所有用了 useReducer 的文件,列出文件路径和大致用法,不需要展开完整代码"
})
```

返回结果是 subagent 跑完后的最终 message,主 Claude 把它当成 tool 返回结果,继续推理。

### 2.1 Explore 的典型用法

```
Task({
  description: "定位状态管理代码",
  subagent_type: "Explore",
  prompt: "在这个 monorepo 里找所有用 zustand 的地方。报告结构:文件路径 | store 名字 | 主要 state 字段 | 调用它的组件数。不超过 200 字。"
})
```

**Explore 是只读的**——它读不写。这意味着:

- 不会意外改文件
- 适合做"先勘察后决定"的工作
- 比 general-purpose 更快(LLM 不用考虑写操作)

### 2.2 Plan 的典型用法

```
Task({
  description: "设计认证迁移方案",
  subagent_type: "Plan",
  prompt: "我们要从 session-based auth 迁到 JWT,系统现在有 60 个 API。设计一个 step-by-step 迁移计划:阶段划分 / 风险点 / 兼容期策略 / 回滚方案。"
})
```

Plan 的 prompt 是为"架构思考"调过的——它倾向于产出**可执行的步骤序列**,而不是泛泛而谈。

### 2.3 general-purpose 的典型用法

任何上面两个不擅长的多步任务:

```
Task({
  description: "PR 合规审查",
  subagent_type: "general-purpose",
  prompt: "审查 PR #123:跑 `gh pr diff 123`,然后跑 `gh pr view 123` 看描述,按以下五点逐项审,最后给一句话结论。详细要求:..."
})
```

---

## 三、自定义 subagent:`.claude/agents/`

内置三种不够用,自己写。

`.claude/agents/security-auditor.md`:

```markdown
---
name: security-auditor
description: 用此 agent 审查安全风险——OWASP Top 10、密钥泄漏、注入、越权。每次涉及 auth / payment / 用户数据的 PR 都该跑。
tools: Read, Grep, Glob, Bash(gh pr diff:*), Bash(gh pr view:*)
model: claude-opus-4-7
---

你是一个专注安全审查的 agent。

工作流程:
1. 用 `gh pr diff` 看完整 diff
2. 按以下顺序检查:
   - 注入风险(SQL / XSS / Command)
   - 鉴权 / 授权(IDOR、越权访问)
   - 密钥泄漏(API key、token、密码硬编码)
   - 危险依赖(已知 CVE 包)
   - 输入校验 / 输出转义
3. 输出:
   - 总结一句话(可合并 / 需修复 / 不可合并)
   - 严重问题列表(按 CVSS 评分排)
   - 建议修复

不要修改文件,只报告。
```

frontmatter 字段:

| 字段 | 含义 |
| --- | --- |
| `name` | subagent 名字,主对话用这个调 |
| `description` | 给主 Claude 看的"什么时候用我"的描述,**写好这条决定它会不会被调到** |
| `tools` | 这个 subagent 能用的工具白名单 |
| `model` | 这个 subagent 用什么模型(典型:深度任务 opus,简单的 haiku) |

**位置**:

- `~/.claude/agents/xxx.md` —— 用户级
- `.claude/agents/xxx.md` —— 项目级(提交进 git,团队共享)

调用方式:`subagent_type: "security-auditor"`。

> **写自定义 subagent 是 Claude Code 高阶玩家的入门门槛**——你停止只用 Claude Code 提供的能力,开始把自己的"工作流程"封进 agent。

---

## 四、subagent prompt 设计要点

写 subagent 比写 slash 难——因为 subagent 不知道你和主 Claude 之前聊了什么。每条 prompt 必须**自包含**。

### 4.1 包含必要 context

```
不好:
  Task({prompt: "继续刚才的检查"})

好:
  Task({
    prompt: "审查 PR #234,这个 PR 改了 auth 模块。
    我们用 NextAuth + JWT。重点关注 session 管理、CSRF、token 刷新。
    标准:OWASP Top 10。
    输出格式:..."
  })
```

### 4.2 写清楚输出格式 / 长度

```
不好:
  Task({prompt: "看一下 src/ 都有什么"})

好:
  Task({
    prompt: "看一下 src/ 都有什么。报告格式:
    - 模块清单(每行一个,带一句话说明)
    - 入口文件位置
    - 主要技术栈关键词
    总长度不超过 300 字。"
  })
```

> Subagent 的报告要回到主 Claude 的 context,**控制长度比让它"详细"重要 10 倍**。一份 5000 字的报告,主 Claude 看完直接 context 涨 10K,得不偿失。

### 4.3 终态可验证

让 subagent 给"事实"或"列表",不是"感觉"。**判断 subagent 写得好不好,看它能不能给出可验证的产出**:

- ❌ "这个项目代码质量还行"
- ✅ "代码质量评估:8/10。问题:src/auth.ts 第 45-67 行有 try-catch 吞错;test 覆盖率 62%(覆盖率工具未跑)"

### 4.4 别让 subagent 做副作用

**Read-only 是 subagent 的最好品类**。让它读、查、分析,**让主 Claude 来执行决策**。

为什么?subagent 写文件出错了,主 Claude 不知道、你也不知道。读文件出错最多是结论错,不会真的破坏什么。

> 例外:确实需要长任务自动化时(如批量改 100 个文件),subagent 写也合理——但务必先用 plan mode 让你看一遍计划。

---

## 五、何时该用 subagent,何时不该

| 场景 | 用 subagent? |
| --- | --- |
| "在 monorepo 里找所有 useReducer" | ✅(读多写少) |
| "审查这个 PR" | ✅(只读 + 给结论) |
| "解释这段代码"(短) | ❌ 主 Claude 直接看就行 |
| "大改造,改 50 个文件" | ⚠️ 用 Plan subagent 规划,主 Claude 执行 |
| "调试 bug" | ❌ 主 Claude 来,因为要持续看上下文反应 |
| "并行做三件无关的探索" | ✅ 三个 subagent 同时发(Task tool 多次并行调用) |
| "写一个新 feature" | ❌ 主 Claude 来,subagent 没有项目长期上下文 |

> 一条经验:**主 Claude 干"主线",subagent 干"调研 / 总结 / 审查 / 探索"**。生产代码相关让主 Claude 写,因为写完你要看 diff 再继续推进。

---

## 六、并行 subagent

主 Claude 一条消息里发**多个 Task 调用**,会真的并行跑:

```
Task({description: "找所有 useState", ...})
Task({description: "找所有 useReducer", ...})
Task({description: "找所有 zustand store", ...})
```

三个 subagent 同时跑,各自独立 context,主 Claude 等三个都回来后汇总。

**这是大规模代码理解最快的姿势**——单线程顺序找 30 分钟的事,并行 5 分钟搞完。

> 一次开太多并行 subagent token 很贵,一般 2-4 个为宜;**不要一次开 10 个无关的 subagent**,主 Claude 自己会卡在等待。

---

## 七、worktree 隔离:让 subagent 在干净环境里跑

写代码的 subagent(尤其是改文件的)有时会希望**在独立的工作树里跑**——不污染主 Claude 当前的修改。

```jsonc
Task({
  "subagent_type": "general-purpose",
  "isolation": "worktree",
  "description": "在隔离环境写 feature",
  "prompt": "在 worktree 里实现 dark mode,改完跑测试,把 PR 描述写好"
})
```

`isolation: "worktree"` 会自动开一个 git worktree,subagent 在那里改;改完如果有改动,worktree 保留路径返回;否则自动清理。

**适合的场景**:实验性改动、不想污染当前分支、并行做几条不冲突的 feature。

---

## 八、subagent 的"transcript"和调试

主 Claude 看到的只是 subagent 的**最终消息**——subagent 自己的中间过程不会进主 context。但你可以单独看:

```bash
Ctrl+R    # 进 transcript 模式
```

里面能展开到 subagent 调用,看它跑了什么 tool、读了什么文件、迭代了几轮。**第一次 subagent 表现不好,大概率 prompt 没写清楚——transcript 能直接看出问题**。

---

## 九、Skill 与 Subagent 的差别(经常被混)

| 维度 | Subagent | Skill |
| --- | --- | --- |
| **作用** | 派一个独立 Claude 干子任务 | 在主 Claude 里"激活"一段专业知识 |
| **上下文** | 独立窗口 | 共享主 Claude 的上下文 |
| **触发** | 主 Claude 主动调 Task | 主 Claude 看到匹配场景自动激活 |
| **配置** | `.claude/agents/xxx.md` | `~/.claude/skills/xxx/SKILL.md` |
| **典型例子** | "做安全审计 → 单独 fork 一个 Claude 跑" | "做安全审计 → 给主 Claude 加上专业指引" |

**怎么选**:

- 任务**重读轻写、可隔离上下文** → subagent
- 任务**和主流程交织、需要看到全局** → skill

下一篇会把 skill 讲透。**先把这两个概念差别记住**——很多人 6 个月才搞清楚什么时候用哪个。

---

## 十、踩坑

1. **subagent 当 ChatGPT 用**——`Task({prompt: "解释 OAuth"})` 这种问题主 Claude 自己回就行,不用开 subagent
2. **prompt 不写清输出长度**——subagent 写了 5000 字回报,主 context 直接膨胀
3. **subagent prompt 缺 context**——subagent 不知道你之前的对话,你说"继续刚才那件事"它两眼一抹黑
4. **让 subagent 写代码,产出不审就 merge**——subagent 写完主 Claude 没看见过程,**真要让它写,先 Plan 子 agent 规划再 general-purpose 执行,且改完一定看 diff**
5. **`description` 写得太宽**——`description: "通用 agent"` 让 LLM 啥都派给它;**写清楚"什么时候用我"**,LLM 才调得对
6. **`tools` 给得太宽**——subagent 默认能用所有工具,但应该按需限制;Explore 一类 only-read 的就限定 Read/Glob/Grep
7. **主 Claude 自己其实更擅长**——尤其是"写一个 feature"这种需要持续看上下文的,**subagent 不擅长这种长链路任务**
8. **不并行**——三件无关的事顺序跑;**一条消息发多个 Task 就并行了**,这件事很多人没意识到
9. **subagent 改了文件主 Claude 不知道**——主 Claude 后续推理还基于旧文件状态;**subagent 改完,主 Claude 该 Read 一遍再继续**
10. **subagent 一次跑太久**——超过 5 分钟的 subagent 该重新设计,拆成几个小 subagent 串行跑

---

下一篇:`08-Skills技能系统.md`,讲 SKILL.md 的结构、progressive disclosure、和 hook / slash / subagent 的最终对比、"什么时候选 skill"的决策树、写一个有用 skill 的完整例子。
