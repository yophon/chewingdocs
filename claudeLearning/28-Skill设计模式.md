# Skill 设计模式

到这里五种"扩展 Claude"的方式你都见过了:**Slash Command / Hook / Skill / Subagent / MCP**。每一种都讲了"是什么、怎么写"。但生产里最常被问的不是"它们各自怎么写",而是"这件事我该用哪个"。这一篇把所有"选型决策"集中讲清楚——**这是 Claude 生态高阶玩家和入门玩家最大的差距**。

> 一句话先记住:**按"谁触发"和"在哪执行"两个维度选**。用户主动 = slash;生命周期事件 = hook;LLM 看场景自动 = skill;独立子任务 = subagent;外接系统 = MCP。

---

## 一、五种扩展机制总图

```
                         我要扩展 Claude 的某个能力
                                 │
            ┌────────────────────┼────────────────────┐
            ▼                    ▼                    ▼
       谁触发?              在哪执行?            连接外部?
            │                    │                    │
   ┌────────┼────────┐    ┌──────┴──────┐         ┌──┴──┐
   ▼        ▼        ▼    ▼             ▼         ▼     ▼
用户主动  系统自动  LLM自动  主对话上下文  独立 fork    系统 API
   │        │        │    │             │
   ▼        ▼        ▼    ▼             ▼
 SLASH    HOOK    SKILL  (任意)       SUBAGENT
                   ↑                                  ▼
                   └─在主上下文加专业指令 / 资源   MCP server
```

---

## 二、决策表:按需求类型选

| 需求 | 该选 | 例子 |
| --- | --- | --- |
| 反复用同一段 prompt | **Slash** | `/review`、`/translate` |
| 反复跑同一个流程(多步) | **Slash** | `/deploy-staging` |
| 改文件后要做 X(每次) | **Hook PostToolUse** | 改 .ts 后自动 prettier |
| 提交 commit 前要 X | **Hook PreToolUse** | git commit 前跑测试 |
| 用户输 prompt 时要预处理 | **Hook UserPromptSubmit** | 注入当前分支信息 |
| Claude 停下时要做 X | **Hook Stop** | 自动 git status |
| 看场景"这个任务该按某流程做" | **Skill** | "审 PR"、"做安全审查"、"配 settings" |
| 让 LLM 看到 SQL 就按规范写 | **Skill** | sql-expert |
| 一段子任务,要独立 context 跑完 | **Subagent** | 大 monorepo 探索代码 |
| 多个并行调研 | **Subagent**(多个) | 同时审 3 个维度 |
| 只读探索,不改文件 | **Subagent**(read-only) | Explore |
| 接公司内部平台 | **MCP server** | deploy / 监控 / 工单 |
| 接 SaaS(GitHub / Notion) | **MCP server** | github / notion 官方 server |
| 让 LLM 操作业务 DB | **MCP server** | postgres |

---

## 三、容易混淆的几对

### 3.1 Slash vs Hook

**问题**:都能"跑一段 shell + 调一段 prompt",怎么选?

**答**:

- **slash 是用户主动**:你输 `/xxx` 才跑,**不输不跑**
- **hook 是事件触发**:某条件成立**一定跑**,你不能跳过

**选**:

- 你希望"想跑就跑,不想跑就不跑" → slash
- 你希望"团队所有人每次都做这件事" → hook

```
"提交前希望跑测试"
 → 想强制 = hook
 → 提示性 = slash(/test 跑测试,你自己决定要不要)
```

### 3.2 Skill vs Slash

**问题**:都是"prompt 模板",怎么选?

**答**:

- **slash 是用户主动**:输 `/review` 触发
- **skill 是 LLM 自动**:看到"我开了个 PR" 自动激活

**选**:

- 我**自己**手动用 → slash
- 我希望 **LLM 自己**碰到合适场景就上 → skill

> 如果你希望"LLM 自动审 PR" + "我也能手动 `/review`",两者都写——slash 触发主流程,skill 在 slash prompt 加专业指引,**两者协作**。

### 3.3 Skill vs Subagent

**问题**:都让 Claude 做"专业领域任务",怎么选?

**答**:

- **skill 在主上下文里加指令**——Claude 仍然是同一个 session、同一个 context
- **subagent 派出 fork**——独立 session、独立 context、独立预算

**选**:

- 任务和主流程交织、需要看到全局 → **skill**(让主 Claude 按某规范做)
- 任务可独立、读多写少、要省主 context → **subagent**

```
"审 PR":可独立 → subagent + skill 配合(skill 给指引,主 Claude 派 subagent 执行)
"写 SQL":每次都按某规范 → skill
"探索代码":独立 → subagent
```

### 3.4 Subagent vs MCP

**问题**:都让 Claude 多一份能力,怎么选?

**答**:

- **subagent 是 Claude 自己再 fork 一个 Claude**——能力本质是 LLM
- **MCP 是接外部系统**——能力本质是 API

**选**:

- 任务靠 LLM 推理 → subagent
- 任务靠**调用外部数据 / 系统** → MCP

```
"审 PR 里的安全风险" → subagent(LLM 推理)
"查 PR 当前的 CI 状态" → MCP(调 GitHub API)
```

### 3.5 Hook vs MCP

**问题**:都能跑代码,怎么选?

**答**:

- **hook 是 Claude Code 自身的"插件",不暴露给 LLM**——不进 LLM 决策
- **MCP server 暴露 tools,LLM 主动调**

**选**:

- 我希望 LLM **不知道**这件事(后台自动) → hook
- 我希望 LLM **会用到**这件事 → MCP

```
"改完 ts 文件自动 prettier" → hook(LLM 不需要知道,后台跑)
"在 GitHub 上创建 PR" → MCP(LLM 决定何时创建)
```

---

## 四、组合用法:一个真实需求拆解

需求:**"团队希望每次写代码时按公司风格写,提交前自动跑测试,审 PR 时按公司清单查"**

拆解:

| 子需求 | 选哪个 |
| --- | --- |
| "按公司风格写" | **Skill**(LLM 看到写代码场景就按规范来) |
| "提交前自动跑测试" | **Hook PreToolUse**(git commit 拦截 → 跑测试) |
| "审 PR" | **Skill `pr-review`**(Claude 看到"审 PR" 触发) + 内部 **Subagent** 并行审多维度 |
| "PR 留 comment" | **MCP github server**(用现成的) |
| "团队成员手动审 PR" | **Slash `/review`**(辅助手动触发) |

最后:

```
.claude/
  settings.json          # hook 配置:提交前跑测试
  skills/
    company-style/SKILL.md      # 公司风格 skill
    pr-review/SKILL.md          # PR 审查 skill
  agents/
    explore.md             # 只读探索 subagent
    security-auditor.md    # 安全审查 subagent
  commands/
    review.md              # /review slash
.mcp.json                  # GitHub MCP server
```

**这五种机制叠加,一个完整 dev 工作流就成型了**。任何一个机制单独都做不到全部——**它们设计出来就是协作**。

---

## 五、反模式:常见错配

### 5.1 用 prompt / memory 写"每次都要"

```
CLAUDE.md:
  - 每次提交前一定要跑测试
  - 每次写完代码一定要 lint
```

**错**——LLM 是概率系统,会忘 / 跳。**确定性的事一律 hook**。

### 5.2 把"知识"写成 hook

```
hook PreToolUse(Bash) :
  if cmd starts with "git commit":
    echo "记得本项目用 conventional commits 风格" >&2
```

**错**——这是知识,不是流程。**写进 CLAUDE.md 或 skill**,LLM 看到自然遵守。

### 5.3 用 slash 实现 LLM 主动行为

```
/auto-review (希望 LLM 写完代码自动调它)
```

**错**——slash 用户主动用;让 LLM 主动用应该写 **skill** 或在 system prompt 里告诉它。

### 5.4 用 subagent 做单步操作

```
Task({prompt: "把这个 typo 改了"})
```

**错**——subagent 派 fork 有开销。**主 Claude 一步搞定就行**。

### 5.5 用 hook 做 LLM 该做的事

```
hook PostToolUse: 自动判断要不要补测试
```

**错**——"判断"是 LLM 的活,hook 是确定性的。**写进 skill 让 LLM 自己判断**。

---

## 六、设计 review:一个能力该放哪一层?

每次设计前问自己:

1. **这件事是确定性还是要 LLM 判断?**
   - 确定性 → hook(必跑)/ MCP(必能调)
   - 要判断 → skill(LLM 自己上)/ subagent(LLM 派出去)

2. **触发条件是什么?**
   - 用户主动 → slash
   - 系统事件 → hook
   - LLM 看场景 → skill
   - LLM 派子任务 → subagent

3. **是否需要外部 API?**
   - 要 → MCP
   - 不要 → 其他四种

4. **是否独立上下文?**
   - 要 → subagent
   - 不要 → skill / hook / MCP / slash

---

## 七、组合 vs 单一:何时该混搭

很多功能不是"选一个",是**组合**。规则:

- **slash + hook**:slash 触发流程,流程内 hook 兜底
- **skill + subagent**:skill 给"标准方法",方法里调 subagent 执行
- **MCP + skill**:MCP 提供工具,skill 教 LLM 何时怎么用这些工具
- **hook + MCP**:hook 拦危险 MCP 调用(如 deny `mcp__db__delete_*`)

> 单一机制能解决简单需求;**复杂工作流几乎一定是组合**。看你写的扩展全是 slash 或全是 hook,大概率是没用对工具。

---

## 八、写新扩展前的 checklist

新加一个"让 Claude 干 X"的能力前,过这些:

- [ ] 已有 skill / slash / MCP 能干吗?(避免重复)
- [ ] 是确定性还是判断性?
- [ ] 谁触发?
- [ ] 在哪执行?
- [ ] 有没有副作用?要不要 dry_run / confirm?
- [ ] 出错怎么办?
- [ ] 给团队还是个人?(决定层级)
- [ ] 一句话能描述"何时用我"吗?(否则 description 写不好)

---

## 九、复杂场景案例:数据分析 Agent

需求:**业务分析师对话式问数据,Agent 能查、画、分析、积累常用查询**。

设计:

| 能力 | 选层 | 实现 |
| --- | --- | --- |
| 查 SQL | MCP `postgres-server` | 现成社区 server |
| 画图 | MCP `code-execution` | Anthropic 自家 server |
| 大数据集分析 | Subagent | 派一个 subagent 处理大查询 |
| "这个查询常用,封一下" | Slash `/usage-by-region` | 把常用 query 封 slash |
| 写 SQL 时按公司表命名规范 | Skill `sql-style` | LLM 看到写 SQL 就按规范 |
| 查询完自动写到分析报告 | Hook Stop | 自动 append 到 report.md |
| 不允许 DROP / DELETE | Permissions deny | 在 MCP tool 层面 + 主对话 deny |

**这一套组合下来 = 一个生产级数据分析 agent**。任何一种机制单独干不了。

---

## 十、踩坑

1. **不知道有这五种,只用 slash**——什么自动化都用 slash 模板硬扛
2. **不知道有 hook,把"每次都要"写进 prompt**——LLM 偶尔忘
3. **不知道有 skill,反复输入"按这套方法"**——LLM 该自动会的能力你手动喊
4. **不知道有 subagent,主 context 越积越多**
5. **不知道有 MCP,内部系统操作只能复制粘贴**
6. **同一件事用了两种实现**(slash + skill 都有 review)——LLM 不知道用哪个
7. **skill 太多互相重叠**——LLM 选哪个看心情;**定期 audit / 合并**
8. **MCP 工具数量爆炸**——一开 50 个 MCP server,工具 200+,LLM 选错率高;**只接当前用的**
9. **生产 hook 没监控**——某 hook 跑 30 秒每条 prompt 都拖,体验崩
10. **设计时没区分"给个人 vs 给团队"**——个人偏好进了团队配置 / 团队规范进了个人配置,体验不一致

---

下一篇:`29-Agent设计模式.md`,从单 Agent / 多 Agent / 编排 / 路由 几个经典模式讲起,落到 Claude 生态怎么选型(Agent SDK 裸用 / Claude Code / 其他 Anthropic 工具)。
