# Agent 设计模式

aiLearning/27 讲过通用 Agent 架构模式(ReAct / Plan-Execute / Reflexion / Router)。这一篇收窄到**Claude 生态下的工程选型**:同一个需求,该用裸 Agent SDK?Claude Code?Anthropic 平台 Managed Agents?多 Agent 编排?——本篇给一份决策框架。

> 一句话先记住:**先问"是不是 Coding 任务"——是 → Claude Code;不是 → Anthropic API + 适当 Agent 模式**。Coding 之外的 Agent,**先用单 Agent + 好工具,不行再加 subagent / 编排**。复杂多 Agent 架构 90% 是过早抽象。

---

## 一、单 Agent vs 多 Agent

最重要的决定。新写 Agent 90% 该选**单 Agent + 多工具**,不是多 Agent。

### 1.1 单 Agent 模式(默认)

```
        ┌─────────────┐
        │  主 Agent    │
        │  (一个 LLM)  │
        └──────┬──────┘
               │
   ┌───────────┼───────────┐
   ▼           ▼           ▼
[tool A]   [tool B]   [tool C]
```

**为什么 90% 选这个**:

- LLM 在一个 context 里看全局,决策不分散
- 调试简单(看一份 transcript)
- 成本可控(一份 history)
- 工具丰富时 LLM 一次决策选最合适的

**Claude Code 自身就是单 Agent + 多工具的极端代表**——只在调研/审查时派 subagent。

### 1.2 多 Agent 模式

```
                    ┌──────────┐
                    │  Router   │
                    └─────┬────┘
                          │
            ┌─────────────┼─────────────┐
            ▼             ▼             ▼
       ┌───────┐     ┌───────┐     ┌───────┐
       │Agent A│     │Agent B│     │Agent C│
       └───────┘     └───────┘     └───────┘
       客服        销售        技术
```

**什么时候真需要**:

- 角色 / 能力差距大,system prompt 难统一
- 各 Agent 用不同模型(成本 / 速度差)
- 各 Agent 用不同工具集
- 任务可清晰分发(Router 的判断标准明确)

**典型场景**:

- 客服分流(技术 / 账单 / 售后)
- 多语言团队(中文 Agent / 英文 Agent / 日文 Agent)
- 复杂工作流(研究 → 写作 → 审查 三个独立 Agent)

> 决定要不要多 Agent,问自己:**单 Agent 在哪些场景表现明显差?** 如果说不出具体场景,**先单 Agent**。

---

## 二、Claude 生态里的"多 Agent"实现方式

### 2.1 Subagent(Agent SDK / Claude Code 的方式)

主 Agent 调 `Task` 派子 agent。**不是真"多 Agent 平等",是"主从"**。

```
主 Agent(对用户负责) → 派 subagent → subagent 干完返回结果 → 主 Agent 总结
```

**优点**:

- 主从结构,决策权清晰
- subagent 上下文隔离,主 context 干净
- 每个 subagent 可独立 model / tools

**缺点**:

- 不是真并发的多 Agent 协作(subagent 跑完才回来)
- 难做"持续 standby 的 Agent"

### 2.2 Anthropic Managed Agents(2025 起)

Anthropic 平台直接托管 Agent,你只提供 prompt + tools + skill,平台给你跑。**比 Agent SDK 抽象更高**:

```
你定义 → Anthropic 平台跑 → API 调用就跑你的 Agent
```

**优点**:

- 完全托管(无需自己跑 server)
- 自带 SaaS 化(分发给客户用)
- 计费集中

**缺点**:

- 比 SDK 自由度低
- 黑盒(出问题难深度调试)

### 2.3 自己用 Anthropic SDK 拼

完全控制,适合有特殊要求的复杂多 Agent 编排——但开发成本高。**除非真有定制要求,先试 Agent SDK 或 Managed Agents**。

---

## 三、几个经典 Agent 模式与 Claude 实现

### 3.1 ReAct(Reason + Act)

最基础的 tool-use 模式:**LLM 推理 → 行动 → 观察 → 推理...**

Claude 在 Agent SDK 里**默认就是这个模式**——加 `thinking` enabled 进一步增强 Reason 阶段。

> 不需要专门"实现" ReAct,**Claude SDK 内核就是 ReAct**。

### 3.2 Plan-Execute

先规划再执行。**Claude Code 的 plan mode 直接是这个模式**:

```
任务 → plan_mode 出 plan → 用户审 → 执行
```

写自己 Agent 时复用 Claude Code 这套——`permission_mode="plan"`。

### 3.3 Reflexion(自我反思)

执行 → 反思 → 改进 → 再执行。**用 hook 实现最自然**:

```
PostToolUse hook 跑测试 → 失败回灌 LLM 让它反思 → 自己修
```

第 5 篇的 hook 例子里就是这个模式。**Claude Code 用户每天在用**。

### 3.4 Router(路由)

按用户输入路由到不同 Agent。Claude 实现:

- 简单的:在 system prompt 里描述路由规则
- 复杂的:用一个 Haiku 做轻量分类 → 路由到 Sonnet/Opus 的特定 Agent
- 用 subagent:主 Agent 当 router,各专门 subagent 做执行

```python
# 简单版 router
@tool(name="route", description="按用户问题类型派给对应专家")
async def route(category: str, question: str):
    if category == "tech":
        return await tech_agent(question)
    if category == "billing":
        return await billing_agent(question)
    ...
```

### 3.5 Orchestrator-Worker

复杂工作流:一个总调度 Agent 派多个 worker。**Claude 实现等于 subagent 模式**——主 Agent 是 orchestrator。

```
orchestrator: "需要做研究 → 写作 → 审查"
   ↓
派 subagent 1:research
派 subagent 2(并行):outline
   ↓
派 subagent 3:write
   ↓
派 subagent 4:review
```

### 3.6 Multi-Agent Debate

让两个 Agent 对话争论一个问题,得到更好答案。**实战中很少有用**——成本翻倍,提升不一定明显。**只在"判断真伪"或"评估方案"少数场景值得**。

---

## 四、决策框架:具体需求选什么

### 4.1 需求是 Coding 类

```
做一个"帮工程师改代码"的 Agent → Claude Code(已经是)
做一个"PR review CI"  → Claude Agent SDK + 主 Agent + 几个 review subagent
做一个"代码生成 SaaS" → Claude Agent SDK or Managed Agents
做一个 IDE 内 LLM 助手 → Claude Code 集成 IDE 或 Cursor 扩展
```

### 4.2 需求是 Workflow Agent

```
做客服 Agent       → 单 Agent + 知识库 MCP + 路由 / 升级人工 tool
做销售 SDR Agent   → 单 Agent + CRM MCP + email tool
做数据分析 Agent   → 单 Agent + DB MCP + 画图 + subagent 处理大查询
做合规审查 Agent   → 单 Agent + 文档 Files API + Citations
做调度 Agent       → 单 Agent + 各内部系统 MCP
```

绝大多数 workflow Agent 单 Agent 就够。

### 4.3 需求是研究 / 写作

```
做学术研究助手     → Plan-Execute(plan mode)+ subagent 分主题查 + 主 Agent 综合
做长报告生成     → Orchestrator-worker:大纲 → 各章节 worker 写
```

### 4.4 需求是真实多角色

```
做角色扮演游戏     → 真多 Agent(每个 NPC 一个 Agent)
做面试模拟         → 多 Agent(面试官、求职者、观察员)
```

这些 Anthropic SDK 直接拼就行,Agent SDK 反而不一定合适。

---

## 五、模式选错的代价

```
单 Agent 能搞定却用了多 Agent → 复杂度翻倍,debug 难,成本翻倍
多 Agent 真需要却用单 Agent     → system prompt 越来越乱,LLM 决策质量下降

Plan-Execute 该用却没用         → 大改造翻车
Plan-Execute 不该用却硬用       → 小改动也来回 plan,体验差

应该路由却合一                  → 一个 prompt 里塞 N 套规则,LLM 混
应该合一却分了 Agent             → 上下文割裂,每个 Agent 看不到全局
```

> 经验:**简单优先,需要时再分**。从单 Agent 起步,**遇到具体问题(prompt 太长、决策质量下降)再考虑分**。**没遇到问题别提前架构**。

---

## 六、生产 Agent 的几个非功能要求

不论选什么模式,生产 Agent 都要回答这些:

### 6.1 故障与降级

LLM API 挂了 / 超时怎么办?

- **重试 + 指数退避**
- **降级到 Haiku**(便宜模型)
- **极端降级:返回 fallback 文案 / 转人工**

### 6.2 限流与配额

- 每用户每天上限
- 每会话总成本上限
- 单 tool 调用频率上限

### 6.3 日志与可追溯

每个对话保留 transcript,**事故复盘需要**。Anthropic API 自带 metadata,可以打 user_id;Agent SDK 可以指定 transcript_path。

### 6.4 安全护栏

- prompt injection 防御(用户输入做隔离)
- output 过滤(敏感词、PII)
- tool 权限(写权限按 RBAC)

### 6.5 评测与回归

- 每次改 prompt / model / tool 跑一组评测用例
- 关键 metrics:任务成功率、平均 token、平均延迟

---

## 七、Anthropic 平台几个产品线对比(2026)

| 产品 | 定位 | 适合 |
| --- | --- | --- |
| **Anthropic SDK** | 裸 API,最底层 | 写自己应用、嵌入式调用 |
| **Claude Agent SDK** | Agent 引擎(Claude Code 内核) | 写 Coding Agent、内部 Agent |
| **Claude Code** | 终端 CLI / IDE 集成 | 工程师日常 |
| **Anthropic Managed Agents** | 平台托管 Agent | SaaS 化分发、低运维 |
| **Claude.ai / Claude Desktop** | 消费端 | 真人用户聊天 |
| **Claude API on Bedrock/Vertex** | 企业云原生 | 合规 / 云内 |

**选哪个**:

- 真人用户聊天 / 文档处理 → Claude.ai / Claude Desktop
- 工程师日常 → Claude Code
- 写自己产品 → SDK / Agent SDK
- SaaS 化分发 → Managed Agents
- 大企业合规 → Bedrock / Vertex

---

## 八、Agent 设计的几条铁律

1. **任务可拆 → 拆**;**任务不可拆 → 不要硬拆**(强行多 Agent 反而糟)
2. **工具描述准确比工具多重要**——20 个清晰 tool > 100 个含糊 tool
3. **System prompt 短而精**——长 prompt 是上下文窗口杀手 + 决策模糊源
4. **第一个版本不上 thinking** ——先看 baseline 表现,缺推理能力再加
5. **第一个版本不上多 Agent**——先单 Agent + 好工具
6. **每个 Agent 都该有 max_turns / max_cost**——失控保护
7. **每次改 prompt 跑评测**——别拍脑袋认为改好了
8. **生产 Agent 必有 transcript**——出事追责唯一线索
9. **永远写 dry_run / confirm**——LLM 第一次调危险 tool 走 dry,第二次再确认
10. **接 MCP 不等于工具加分**——MCP 太多反而稀释 LLM 决策

---

## 九、踩坑

1. **过度抽象多 Agent**——简单需求拆成 5 个 Agent,自己 debug 都吃力
2. **不区分 Coding vs Workflow**——Coding 该用 Claude Code,你硬用 LangChain
3. **prompt 改一次靠感觉**——没 evals 数据,半年后不知道哪次改坏的
4. **不限 cost / max_turns**——生产 Agent 卡死烧钱
5. **不做 prompt injection 防御**——用户输入直接进 system prompt 邻近
6. **以为多 Agent 一定更好**——多 Agent 协调成本经常>能力提升
7. **用 LangChain 不用 Agent SDK**——Coding 场景下 Agent SDK 是 native 选择
8. **写 Agent 不用 hook**——工具失败的反馈循环写不出来,Agent 卡死
9. **Agent 没 metrics 上线**——出问题不知道是模型 / prompt / tool 哪个出
10. **不学习 Claude Code 内部 prompt**——它是 Anthropic 自己的 best practice 演示,**翻系统 prompt 看一遍**收获巨大

---

下一篇,本系列最后一篇:`30-生产化与团队协作.md`,讲成本监控、settings 团队共享、版本管理、调试、灾备、上线 checklist。
