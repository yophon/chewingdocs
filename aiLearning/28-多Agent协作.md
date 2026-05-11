# 多 Agent 协作

单 Agent 走通之后,你早晚会撞上一个问题:**一个 Agent 又要查资料、又要写代码、又要审代码、又要管进度**,prompt 越写越长,效果越来越糊。这时候自然的想法是——**让多个 Agent 各干各的**。这篇讲清楚多 Agent 协作的几种主流玩法、它们各自适合什么场景,以及"什么时候你压根不该上多 Agent"。

> 一句话先记住:**多 Agent 不是更牛逼,是更复杂**。能用单 Agent 解决的别上多 Agent,就像能用单体应用搞定的别上微服务。

---

## 一、为什么需要多个 Agent

单 Agent 干活,本质是**一个 LLM + 一堆 tool + 一个不断膨胀的 context**。撑不住的时候有三个典型信号:

| 信号 | 表现 | 多 Agent 怎么解 |
| --- | --- | --- |
| 角色冲突 | 同一个 prompt 既要"严谨求实"又要"大胆创新" | 拆成两个 Agent,各自人格独立 |
| 上下文爆炸 | context 里塞了 20 个工具结果,模型开始遗忘前文 | 子 Agent 独立 context,只把结论回传 |
| 串行太慢 | 5 个独立子任务必须一个接一个跑 | 多 Agent 并行,wall-clock 时间砍 N 倍 |

往深了说,多 Agent 真正的价值是**关注点分离**。这跟软件工程里"为什么要分模块"是一回事:不是因为一个文件写不下,而是因为**职责混在一起调试不动**。

> 经验法则:**当你给单 Agent 写的 system prompt 超过 500 行,且里面出现了"如果你在做 A 任务时……如果你在做 B 任务时……",就该考虑拆 Agent 了**。

---

## 二、典型角色

多 Agent 系统里反复出现的角色,记住这几个就够 80% 场景:

| 角色 | 职责 | 典型 prompt 关键词 |
| --- | --- | --- |
| Researcher | 检索、查资料、汇总信息 | "搜索""引用""不要编造" |
| Planner / Manager | 拆解任务、分派、跟进 | "把目标拆成可执行步骤" |
| Coder | 写代码、改代码 | "实现""遵循 style guide" |
| Critic / Reviewer | 审查、找漏洞、提反对意见 | "挑刺""指出风险""不要客气" |
| Executor | 执行确定操作(跑命令、调 API) | "只执行,不思考" |
| Summarizer | 把长输出压缩成结论 | "用三句话总结" |

> Critic 这个角色被低估了。**单 Agent 自己审自己几乎没用**(同一个模型同一个 context,看不到自己的盲点),但**让另一个独立 context 的 Agent 来挑刺**,往往能发现真问题。这是 Reflection 模式从单 Agent 升级到多 Agent 后效果显著提升的根本原因。

---

## 三、AutoGen 的对话模式

微软出的 AutoGen,核心理念是**让 Agent 之间像群聊一样对话**。所有 Agent 都接到一个 GroupChat 里,由一个 GroupChatManager 决定下一个轮到谁说话。

```python
import autogen

config_list = [{"model": "claude-opus-4-7", "api_key": "..."}]

# 三个角色
planner = autogen.AssistantAgent(
    name="Planner",
    system_message="你负责把用户需求拆成可执行的步骤,只规划不执行。",
    llm_config={"config_list": config_list},
)

coder = autogen.AssistantAgent(
    name="Coder",
    system_message="你根据 Planner 的步骤写 Python 代码,写完交给 Critic。",
    llm_config={"config_list": config_list},
)

critic = autogen.AssistantAgent(
    name="Critic",
    system_message="你审查代码,找 bug 和风格问题,有问题打回 Coder,没问题输出 APPROVED。",
    llm_config={"config_list": config_list},
)

user = autogen.UserProxyAgent(
    name="User",
    human_input_mode="NEVER",
    code_execution_config={"work_dir": "workspace"},
)

# 群聊
groupchat = autogen.GroupChat(
    agents=[user, planner, coder, critic],
    messages=[],
    max_round=12,
)
manager = autogen.GroupChatManager(groupchat=groupchat, llm_config={"config_list": config_list})

user.initiate_chat(manager, message="写一个读 CSV 并按某列分组求和的脚本")
```

**优点**:写起来灵活,Agent 之间可以自由插话、追问、反驳。
**缺点**:**不可控**——GroupChatManager 决定谁说话的逻辑本身也是 LLM,经常出现"该 Coder 说话时它让 Critic 又说一遍"。

> AutoGen 适合**研究性任务**(头脑风暴、辩论、开放讨论),不适合**生产流程**(发货、审批、有 SLA 的)。生产流程要可控,看下篇 LangGraph。

---

## 四、CrewAI 的流程模式

CrewAI 走的是另一个极端:**预定义流程**,Agent 之间不自由对话,而是按 Tasks 列表顺序/分派执行。

```python
from crewai import Agent, Task, Crew, Process

researcher = Agent(
    role="行业研究员",
    goal="收集 2026 年 AI Agent 框架的最新动态",
    backstory="你是一名资深技术分析师,擅长从一手资料中提炼趋势。",
    tools=[search_tool],
)

writer = Agent(
    role="技术作者",
    goal="把研究结果写成博客",
    backstory="你写过五年技术博客,文风简洁。",
)

task1 = Task(
    description="调研 LangGraph、AutoGen、CrewAI 在 2026 年的更新",
    expected_output="一份 markdown 格式的调研笔记",
    agent=researcher,
)

task2 = Task(
    description="基于调研笔记写一篇 1000 字博客",
    expected_output="一篇 markdown 博客",
    agent=writer,
    context=[task1],   # 依赖 task1 的输出
)

crew = Crew(
    agents=[researcher, writer],
    tasks=[task1, task2],
    process=Process.sequential,   # 也支持 Process.hierarchical
)

result = crew.kickoff()
```

CrewAI 的核心抽象是 **Agent + Task + Crew**:
- **Agent** 有 role / goal / backstory,定义"它是谁"
- **Task** 是"具体要做什么",可以指定依赖
- **Crew** 把它们串起来,选择执行模式(sequential / hierarchical)

**优点**:流程清晰,适合"有明确产出"的任务(生成报告、写代码、跑分析)。
**缺点**:**不够灵活**——Agent 之间不能自由协商,真要插话得靠 hierarchical 模式硬转。

---

## 五、MetaGPT 的 SOP 模式

MetaGPT 把"多 Agent"做到了极致——**直接模拟一家软件公司**。产品经理、架构师、工程师、QA 全都是 Agent,按照 SOP(Standard Operating Procedure)接力。

```
用户需求
   ↓
产品经理(写 PRD)
   ↓
架构师(设计架构、技术选型)
   ↓
项目经理(拆 task)
   ↓
工程师 × N(写代码)
   ↓
QA(测试)
   ↓
交付
```

每个角色都有标准化的输入输出格式,例如产品经理必须输出固定模板的 PRD,架构师必须输出 mermaid 类图。**Agent 之间不是对话,是文档接力**。

```python
from metagpt.team import Team
from metagpt.roles import ProductManager, Architect, Engineer, ProjectManager

team = Team()
team.hire([ProductManager(), Architect(), ProjectManager(), Engineer()])
team.invest(investment=3.0)
team.run_project("做一个 2048 小游戏的网页版")
await team.run(n_round=5)
```

**优点**:对"软件开发"这种**结构化领域**效果惊人,demo 起来很有冲击力。
**缺点**:**只适合软件开发场景**,换到客服、内容创作、数据分析就没那么自然了。而且模板化太强,跳不出去。

> MetaGPT 是个**好的思想实验**:它证明了"如果把人类组织流程搬给 LLM,效果比单 Agent 强很多"。但生产环境里,大多数公司不会真的让 Agent 团队替代研发——更多是借鉴它的角色拆分思路。

---

## 六、Anthropic 的 Subagent 模式

2025 年以来,Anthropic 在 Claude Agent SDK 和 Claude Code 里推了一种新的玩法:**Subagent**(子代理)。和前面三种最大的区别是,**它不是平等协作,而是"主 Agent 派活给子 Agent"**。

核心机制:
- 主 Agent 有完整的对话 context 和工具
- 主 Agent 可以调用一个特殊的"子 Agent" tool,把一个**子任务的描述**作为参数传过去
- 子 Agent 在**独立的 context** 里执行该任务,只有最终结论返回给主 Agent
- 子 Agent 可以再派子子 Agent(理论上无限嵌套)

```python
# Claude Agent SDK 风格的伪代码
from claude_agent_sdk import Agent, tool

@tool
def search_codebase(query: str) -> str:
    """在代码库里搜索相关文件"""
    ...

# 子 Agent 定义
researcher_subagent = Agent(
    name="researcher",
    description="深度研究某个技术问题,输出结论",
    tools=[search_codebase, web_search],
)

# 主 Agent 把 subagent 当成 tool 用
main_agent = Agent(
    name="main",
    tools=[search_codebase, run_command],
    subagents=[researcher_subagent],
)

main_agent.run("优化这个项目的构建速度,先调研业内方案再改")
# 主 Agent 会:
# 1. 调用 researcher subagent → 子 Agent 独立查资料、独立总结 → 返回结论
# 2. 主 Agent 拿到结论后,自己执行修改
```

为什么这种模式好用:

| 维度 | 群聊模式 (AutoGen) | Subagent 模式 |
| --- | --- | --- |
| 谁拿主动权 | GroupChatManager(LLM 决定) | 主 Agent 显式调用 |
| 上下文 | 共享(每个人都看到所有历史) | 隔离(子 Agent 看不到主 context) |
| 并行 | 难 | 天然支持(同时调多个 subagent) |
| 调试 | 难(对话乱) | 简单(树状调用栈) |

> Claude Code 内部就是这套架构。你跑一个复杂任务时,主 Agent 经常会派多个 subagent 并行去查不同模块,然后汇总。**上下文隔离 + 并行是 subagent 的两个杀手锏**。

---

## 七、单 Agent 何时够用、多 Agent 何时才有意义

| 场景 | 单 Agent 够用 | 多 Agent 必要 |
| --- | --- | --- |
| 任务步骤少(<5 步) | 是 | 否 |
| 单一职责(只查资料 / 只写代码) | 是 | 否 |
| 角色冲突(既要严谨又要发散) | 否 | 是 |
| 需要并行(多个独立子任务) | 否 | 是 |
| context 容易爆(单次执行涉及大量工具调用) | 否 | 是 |
| 需要"另一个视角"做审查 | 否 | 是(Critic) |

> 工程现实是:**90% 的"AI 应用"用单 Agent + 好的工具集就够了**。多 Agent 是当你**真的撞墙**之后才该上的方案,不是"看着炫酷就上"的方案。

---

## 八、四种模式对比

| 维度 | AutoGen GroupChat | CrewAI Process | MetaGPT SOP | Anthropic Subagent |
| --- | --- | --- | --- | --- |
| 协作方式 | 群聊对话 | 任务接力 | 文档接力 | 主从派活 |
| 流程灵活性 | 高(自由对话) | 中(预定义 task) | 低(SOP 固定) | 高(主 Agent 自主决策) |
| 可控性 | 低 | 高 | 高 | 中高 |
| 上下文隔离 | 否 | 部分 | 是(文档分离) | 是 |
| 并行能力 | 弱 | 中 | 弱 | 强 |
| 调试难度 | 高 | 低 | 中 | 低 |
| 适合场景 | 研究、辩论、头脑风暴 | 内容生产、报告、流水线 | 软件开发、结构化领域 | 复杂工程任务、Coding Agent |
| 学习曲线 | 中 | 低 | 中 | 低(如果用 Claude SDK) |

**选型建议**:

- **快速 demo / POC**:CrewAI,API 最直观,5 分钟上手
- **研究型任务、需要 Agent 互相吵架**:AutoGen
- **特定领域 SOP 已经清楚(尤其软件开发)**:MetaGPT
- **生产级 Coding Agent / 复杂任务编排**:Claude Agent SDK 的 subagent

> 这些框架不是互斥的。**很多公司内部架构是 LangGraph 编排顶层流程 + 在某些 node 里塞 subagent 做开放探索**。把工具拆开看,组合起来用。

---

## 九、踩坑

1. **沟通成本爆炸**。N 个 Agent 群聊,token 消耗是 O(N²) 起步——每个 Agent 都要看所有人的发言。10 个 Agent 一轮聊下来,单次成本可能比单 Agent 跑 100 步还贵。**多 Agent 要省钱反而更难**。
2. **谁拿主动权**。AutoGen 这种"自由群聊"经常出现"大家都在等别人发言""或者一个 Agent 抢着说停不下来"。**生产环境一定要有显式的 orchestrator**,要么是个固定流程(LangGraph),要么是个主 Agent(Subagent)。
3. **上下文爆炸**。群聊模式下每个 Agent 都看完整历史,跑十几轮就到 context 上限。**对策是要么用 subagent 模式做 context 隔离,要么定期 summarize**。
4. **循环依赖**。Critic 打回给 Coder,Coder 改完再交给 Critic,Critic 又挑出新毛病……一个 task 跑 50 轮还没结束。**必须设 max_round 兜底,且超过一定轮数自动 escalate 给人类**。
5. **Agent 角色漂移**。跑久了 prompt 里的角色定义被冲淡,Researcher 开始写代码、Coder 开始查资料。**system prompt 要在每轮都强化,而不是只在初始化时设一次**。
6. **测试和评估难**。单 Agent 还能写 unit test,多 Agent 整个系统怎么测?**目前最实用的办法是端到端 eval(给定输入,看最终产出是否合格)+ 关键节点的中间产出检查**,别指望细粒度单测覆盖。
7. **不要在第一版上多 Agent**。先单 Agent 跑通,发现具体瓶颈(context 爆 / 角色冲突 / 串行慢)再有针对性地拆。**没遇到问题就拆,纯属给自己挖坑**。

---

## 十、给新手的建议

1. **从单 Agent 起步**。把 ReAct 和 tool use 写熟练,理解 context 怎么管、tool 怎么设计,**这些技能在多 Agent 场景里 100% 复用**。
2. **第一次玩多 Agent 选 CrewAI**。API 最直观、文档最清楚、跑起来最不容易出乱子。先体验"多个角色配合"是什么感觉。
3. **第二步玩 Subagent**。理解"主从派活 + context 隔离"为什么比群聊好用,这是 2025 年之后的主流方向。
4. **群聊模式留到最后玩**。AutoGen GroupChat 看起来酷,但坑也最深。**先理解什么是确定性流程,再去玩自由对话**。
5. **多 Agent ≠ 一定更聪明**。很多 demo 里"5 个 Agent 比 1 个强"是因为单 Agent 的 prompt 没写好。**先把单 Agent 的 prompt、工具、context 工程做到位**,再考虑多 Agent。
6. **学会画 Agent 图**。多 Agent 系统调试主要靠"画出来"——谁调谁、context 怎么传、什么时候汇总。**画不清楚的系统跑起来一定有问题**。

---

下一篇:`29-工作流编排-LangGraph与状态机.md`,讲清楚"什么时候需要 Workflow 而不是 Agent",以及怎么用 LangGraph 把 Agent 装进可控的状态机里。
