# 长任务与 Compaction

Coding Agent 跑半天是常态——8 小时连续 session、几百轮工具调用、几千次文件读写。这种任务的 context 很容易突破 200K 甚至 1M 边界。**Agent 怎么"既不爆又不忘"**?这就是 Compaction 解决的问题,也是 Claude Agent SDK / Claude Code 区别于"裸 LLM 调用"最实用的内核能力。

> 一句话先记住:**Compaction = "把不再相关的早期对话压成 summary,腾出上下文空间继续干"**。它不只是删,**是有损压缩**——保留主线,丢细节。**SDK 自动做,你也能手动触发,关键是要懂它在丢什么**。

---

## 一、长 session 为什么会爆

一个 Coding Agent 长 session 的 messages 大致这样积累:

```
Read(big-file.ts)              → 5000 token
Read(another-file.ts)          → 3000 token
Bash(npm test) output          → 2000 token
Edit(file.ts)                   → 200 token
Read(file.ts)                  → 5200 token (更新后)
Bash(git diff)                  → 1500 token
... × 200 轮
```

每轮 5-10K token,200 轮就是 1-2M。**而 Sonnet 4.6 上限 200K,Sonnet 4.7 是 1M**——超了直接报错。

---

## 二、Compaction 的两种模式

### 2.1 Auto-compaction(SDK 自动)

触发条件:

- messages 总 token 接近上限(典型阈值 75-85%)
- 某些 tool 返回了大块文本(LLM 看不完)
- 长 session 结束某个 milestone(end_turn 后)

SDK 内部:

1. 检测触发
2. 派一个 Claude(用 Haiku 节省成本)对早期 messages 做 summary
3. 把早期 messages 替换成 summary
4. 继续主循环

### 2.2 Manual compaction(你触发)

```python
# Agent SDK 主动触发
await session.compact(reason="完成 phase 1,把前期讨论压缩")
```

或在 Claude Code CLI 里:

```
/compact
/compact 重点关注 phase 1 的决策
```

`/compact` 加上 hint(reason) 让 SDK 在 summary 时按 hint 重点保留某些信息。

---

## 三、Summary 长什么样

Compact 之后的 history 大致结构:

```
{role: user, content: "[Compacted summary] 用户最初要求把项目从 redux 迁到 zustand。
我们已经分析了 47 个组件,迁了其中 32 个。当前进度:
- 已完成:src/auth/* / src/dashboard/*
- 进行中:src/settings/(改了 3/8 个组件)
- 待开始:src/admin/*
关键决策:
- store 按 feature 分,不做大全局
- 异步用 zustand 自带,不引第三方
最近改动的文件:src/settings/Theme.tsx, src/settings/Lang.tsx"}

{role: assistant, content: "..."}   ← 最近几轮原样保留
{role: user, content: "..."}
{role: assistant, content: "..."}
```

**保留**:任务目标、当前进度、关键决策、最近几轮细节。
**丢失**:具体的工具调用历史、读过的文件内容、中间错误尝试、被否的方案。

---

## 四、Compaction 的副作用与对策

### 4.1 LLM 可能"忘"细节

Compact 后 LLM 不知道你 30 轮前看过 `auth.ts` 的具体内容——再问到时它会重新 Read。这通常没问题,但偶尔慢。

**对策**:**关键事实写到 CLAUDE.md / system_prompt**(那部分不会被 compact)。

### 4.2 重要决策被压扁

"要不要用 X 库"这种讨论压成一句"决定用 X"——具体理由没了。**对策**:重要决定**当时就写进文件**(ADR / decisions.md),而不是只存在对话里。

### 4.3 Cache 重建

每次 compact 后,**之前的 cache 失效**(因为 history prefix 变了)。下一条消息要重新写 cache。**对策**:不要频繁手动 compact;让 SDK 自动决定。

---

## 五、Checkpointing:更强的"长任务断点"

Compaction 是 in-session 压缩。**跨 session 续跑**需要更明确的 checkpointing。

### 5.1 模式 A:把进度写文件

```
user: "把整个项目从 redux 迁到 zustand"
LLM: 制定 plan,写到 .claude/migration-plan.md,包含:
     - 文件清单
     - 已完成/未完成标记
     - 当前进度

[多个 session 跨天]

session N+1:
user: "继续 zustand 迁移"
LLM: Read .claude/migration-plan.md → 知道进度 → 接着干
```

`.claude/migration-plan.md` 是真实文件,LLM 每个新 session 第一件事就读它。**比靠 context 续跑可靠得多**。

### 5.2 模式 B:Todo list 持久化

Agent SDK 的 TodoWrite 工具状态可持久化到磁盘:

```python
options = ClaudeAgentOptions(
    todo_persist_path=".claude/todos.json"
)
```

下次启动时 todo 恢复,LLM 看到"上次还有 X 没做"。

### 5.3 模式 C:Session resumption

Claude Code 提供 `claude --resume <session-id>` 续跑;Agent SDK 类似 API。**但仍受 compact / context 限制**——长任务最稳的是结合"文件型 checkpoint"。

---

## 六、Long-task 的设计 pattern

### 6.1 任务拆分

把"迁整个项目"拆成"迁 src/auth/"、"迁 src/dashboard/"……每段 50K context 内能完成,不依赖 compact。

```
phase 1: src/auth/   → 完成 → commit
phase 2: src/dashboard/ → 完成 → commit
phase 3: ...
```

**每个 phase 一个 session,状态在 git / plan 文件**。

### 6.2 Subagent 隔离

对每个独立子任务**派 subagent**——subagent 是独立 context,跑完不污染主 Agent。

```
主 Agent(决策) → 派 subagent A(改 auth)→ 子任务完
主 Agent → 派 subagent B(改 dashboard)→ ...
```

主 Agent context 只增长决策日志,不背具体改动。

### 6.3 工具返回值控制

让 tool 主动 truncate 大返回值——读 50K 文件不全 dump,先 head/tail/grep。**Agent 内核给 Read 工具默认 limit 就是这个原因**。

---

## 七、Context 用尽的报错怎么处理

API 报 `prompt is too long`:

```python
try:
    resp = await client.messages.create(...)
except APIStatusError as e:
    if "prompt is too long" in str(e):
        # 强制 compact
        messages = compact_now(messages)
        # retry
        resp = await client.messages.create(...)
    else:
        raise
```

Agent SDK 内部已经做这件事——但**写 custom tool / subagent 时,你的 input 也可能撑爆 context**。

---

## 八、监控 context 用量

```python
# Anthropic API 返回的 usage
resp.usage.input_tokens             # 这次输入
resp.usage.cache_read_input_tokens  # 命中 cache 的部分
```

**生产监控**:

- 每条 messages 的总 input_tokens 趋势
- compact 频率(每天 / 每 user 多少次)
- compact 前后 input_tokens 减少率

太频繁 compact 说明任务设计有问题——**任务该拆分而不是靠 compact 救命**。

---

## 九、实战:长任务 Agent 的常见模式

```
1. 接到任务,plan_mode 出 plan,写到 .claude/<task>/plan.md
   plan 含:目标 / 阶段 / checkpoint 标记

2. 对每个阶段:
   2a. session 开始 → Read plan.md 知道当前阶段
   2b. 派 subagent 做这阶段(独立 context)
   2c. subagent 完成 → 主 Agent 把进度写回 plan.md
   2d. commit / push checkpoint

3. session 结束 / context 接近上限 → 用户重启
   3a. 新 session → Read plan.md → 跑下一阶段
```

**这个模式 Anthropic 自家做大型 demo 时反复在用**:plan 文件 + session 间断 + git commit checkpoint + subagent 隔离。

---

## 十、和 Anthropic API 1M context 的关系

Sonnet 4.7 支持 1M context。**这不意味着不需要 compact**——

1. 1M 的 input token 极贵($6/M = 全打满 6 美刀)
2. LLM 在长 context 里效果**衰减**(中间内容被忽略,经典 needle-in-haystack 问题)
3. 长 context cache 帮 90%,但仍然有不可压成本

**实战经验**:

- 200K-500K:还行,但开始关注 cache 命中
- 500K-1M:超长,通常意味着任务设计问题;考虑拆分 / subagent
- 1M+:不该到这

> 1M context 是"安全垫",不是"省 compact 的理由"。

---

## 十一、踩坑

1. **认为 compact = 删历史**——是 summary,但仍然有损;重要细节早期就要落到文件 / CLAUDE.md
2. **不写 plan 文件**——长任务靠 compact 续跑,某次 compact 把进度 summary 错了,任务重启后从头来
3. **Cache 命中率监控不做**——长任务里频繁 compact = cache 频繁失效,账单飞涨
4. **不拆任务**——8 小时跑一个超大任务,一次 compact 就丢关键信息
5. **subagent 不用**——主 Agent context 自己背几百次工具调用,迟早爆
6. **manual /compact 太频繁**——每隔几分钟手动 compact,反而打乱 cache
7. **/compact 不加 hint**——让 SDK 默认 summary,可能丢你最关心的信息
8. **以为 1M context 万能**——长 context 衰减是真的,关键内容要靠近末端
9. **重要决定不写 ADR**——"为什么用 X 不用 Y"被 compact 压成一句话,后人看不到理由
10. **不监控 context 趋势**——某 hook bug 让每条 prompt 多注入 5K,context 涨得比平时快

---

下一篇:`23-实战AgentSDK项目.md`,从零搭一个完整的 PR review agent——结合自定义 tool / subagent / hooks / skills,300 行代码端到端跑通。
