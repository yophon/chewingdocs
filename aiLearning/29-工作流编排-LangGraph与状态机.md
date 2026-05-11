# 工作流编排:LangGraph 与状态机

上一篇讲了多 Agent 协作,但你很快会发现一个新问题:**Agent 太自由了,生产环境不敢用**。客服流程必须先认证再处理订单、退款必须经过审批、医疗诊断必须有 human-in-the-loop——这些场景需要的不是"让 Agent 自己想办法",而是**让 Agent 在确定的轨道里跑**。这篇讲怎么用 LangGraph 把 Agent 装进状态机,以及"什么时候用 Workflow、什么时候用 Agent"。

> 一句话先记住:**Workflow 是"我决定流程,LLM 填空";Agent 是"我给目标,LLM 决定流程"**。两种范式,不是替代关系。

---

## 一、Workflow vs Agent 的边界

这是 2024 年 Anthropic 在《Building Effective Agents》里强调过的核心区分,2026 年仍然成立:

| 维度 | Workflow | Agent |
| --- | --- | --- |
| 流程 | 开发者预定义 | LLM 动态决定 |
| 控制权 | 在代码里 | 在 prompt 里 |
| 可预测性 | 高 | 低 |
| 灵活性 | 低 | 高 |
| 调试难度 | 低(状态可见) | 高(行为不确定) |
| 失败恢复 | 容易(重跑该 node) | 难(整个 trace 重跑) |
| 典型场景 | 客服分流、订单流程、ETL | 编程 Agent、研究 Agent、开放问答 |

> 经验法则:**任务流程能在白板上画清楚的,用 Workflow;画不清楚的,用 Agent**。能用 Workflow 解决的别上 Agent,因为前者**便宜、稳定、可调试**。

实际项目里**纯 Workflow 和纯 Agent 都很少**,大部分是混合架构:**外层 Workflow 控流程,某些 node 内部塞一个小 Agent 做开放探索**。

---

## 二、为什么需要状态机思想

Workflow 的本质是**有限状态机(FSM)**——节点是状态、边是转换。把 Agent 装进 FSM 有三个工程上的核心好处:

| 能力 | 没有状态机 | 有状态机 |
| --- | --- | --- |
| 可控 | LLM 自己决定下一步 | 代码决定下一步,LLM 只填内容 |
| 可恢复 | 中途挂了从头跑 | 从最近的 checkpoint 继续 |
| 可调试 | 只能看 LLM trace | 看每个 node 的输入输出 / state 变化 |
| 可观测 | 黑盒 | 白盒,每个节点可以打点、监控 |
| 可分支 | 用 if 套 prompt | 用 conditional edge,显式 |

> 为什么必须状态机而不是普通函数调用?因为**LLM 调用会失败、会超时、会成本爆炸,你需要在每个状态边界 checkpoint**。普通的函数调用挂了就挂了;状态机挂了可以从上一个状态继续。**生产级 LLM 应用没有 checkpoint 等于裸奔**。

---

## 三、LangGraph 核心概念

LangGraph 是 LangChain 团队 2024 年推出的状态机框架,2026 年已经是 Workflow 编排的事实标准。四个核心概念:

| 概念 | 说明 | 类比 |
| --- | --- | --- |
| State | 整个图共享的状态对象 | React 的 store |
| Node | 一个计算单元(函数 / Agent) | 状态机的状态 |
| Edge | 节点之间的转移 | 状态机的转换 |
| Conditional Edge | 根据 state 决定下一个 node | if/switch |

**State 的核心约定**:Node 的返回值会**合并(reduce)**到全局 state,合并方式由你定义。这是 LangGraph 区别于普通函数调用图的核心设计——**state 不是参数传递,而是声明式更新**。

```python
from typing import TypedDict, Annotated
from operator import add

class GraphState(TypedDict):
    messages: Annotated[list, add]   # 用 add 合并(append 模式)
    user_id: str                       # 直接覆盖
    decision: str
```

> Annotated 里的第二个参数是 reducer。**这是 LangGraph 最容易踩坑的地方**——忘了写 reducer,默认行为是覆盖,结果你 messages 列表每次只剩最后一条。

---

## 四、构建一个简单 LangGraph

来个完整的例子:**客服分流流程**——根据用户输入判断是技术问题还是退款问题,分别交给不同的处理 node。

```python
from typing import TypedDict, Annotated, Literal
from operator import add
from langgraph.graph import StateGraph, START, END
from langchain_anthropic import ChatAnthropic

llm = ChatAnthropic(model="claude-opus-4-7")

class State(TypedDict):
    messages: Annotated[list, add]
    category: str          # "tech" | "refund" | "other"
    resolved: bool

# Node 1:分类
def classify(state: State) -> dict:
    user_msg = state["messages"][-1]["content"]
    prompt = f"""判断用户问题属于哪一类,只输出 tech / refund / other 之一。

用户问题:{user_msg}"""
    resp = llm.invoke(prompt).content.strip().lower()
    return {"category": resp}

# Node 2:技术问题处理
def handle_tech(state: State) -> dict:
    user_msg = state["messages"][-1]["content"]
    answer = llm.invoke(f"作为技术支持,回答:{user_msg}").content
    return {
        "messages": [{"role": "assistant", "content": answer}],
        "resolved": True,
    }

# Node 3:退款处理
def handle_refund(state: State) -> dict:
    user_msg = state["messages"][-1]["content"]
    answer = llm.invoke(f"作为退款专员,回答:{user_msg}").content
    return {
        "messages": [{"role": "assistant", "content": answer}],
        "resolved": True,
    }

# Node 4:其他(转人工)
def escalate(state: State) -> dict:
    return {
        "messages": [{"role": "assistant", "content": "已为您转接人工客服"}],
        "resolved": True,
    }

# Conditional edge:根据 category 决定下一步
def route(state: State) -> Literal["tech", "refund", "other"]:
    return state["category"] if state["category"] in ("tech", "refund") else "other"

# 构图
graph = StateGraph(State)
graph.add_node("classify", classify)
graph.add_node("tech", handle_tech)
graph.add_node("refund", handle_refund)
graph.add_node("other", escalate)

graph.add_edge(START, "classify")
graph.add_conditional_edges(
    "classify",
    route,
    {"tech": "tech", "refund": "refund", "other": "other"},
)
graph.add_edge("tech", END)
graph.add_edge("refund", END)
graph.add_edge("other", END)

app = graph.compile()

# 跑起来
result = app.invoke({
    "messages": [{"role": "user", "content": "我的订单 12345 想退款"}],
    "category": "",
    "resolved": False,
})
print(result["messages"][-1]["content"])
```

**这个例子里值得注意的几个点**:

1. State 是 TypedDict,每个 node 只返回**变更的字段**,LangGraph 会按 reducer 合并
2. classify node 只决定 `category`,不返回 messages
3. conditional edge 的 router 函数返回字符串,映射到目标 node
4. START 和 END 是特殊节点,标识入口和出口

> 你可以把这个图导出成 mermaid:`app.get_graph().draw_mermaid()`,**生产环境一定要画出来贴文档里**,不然没人看得懂你在干嘛。

---

## 五、循环、分支、并行节点

实际场景的图比上面复杂得多。三种常见模式:

### 1. 循环(Loop)

让某个 node 重复执行直到满足条件。比如 ReAct 模式的"思考→行动→观察→再思考":

```python
def should_continue(state: State) -> Literal["tools", "end"]:
    last_msg = state["messages"][-1]
    return "tools" if last_msg.tool_calls else "end"

graph.add_conditional_edges(
    "agent",
    should_continue,
    {"tools": "tools", "end": END},
)
graph.add_edge("tools", "agent")   # 回到 agent,形成循环
```

### 2. 并行(Parallel)

多个 node 同时跑,结果汇总到下一个 node:

```python
graph.add_edge(START, "search_web")
graph.add_edge(START, "search_db")        # 两条边从 START 出发,自动并行
graph.add_edge("search_web", "merge")
graph.add_edge("search_db", "merge")
graph.add_edge("merge", END)
```

LangGraph 看到一个 node 有多个前驱时,会**等所有前驱跑完**再执行(类似 join 语义)。state 的合并依赖你写的 reducer。

### 3. 分支(Branch)

就是上面的 conditional_edge,根据 state 走不同分支。**注意 conditional edge 的目标节点是字典 value,不是 key**——key 是 router 返回值,value 是真正的 node 名,这两个可以不一样。

> 并行 + 合并是 LangGraph 比手写循环强的核心场景。**手写并行 = 一堆 asyncio.gather + 状态拼接,LangGraph 一行 add_edge 解决**。

---

## 六、Human-in-the-loop

生产场景里有大量"必须有人确认"的环节:发送邮件前、扣款前、删数据前。LangGraph 通过 **interrupt** 机制原生支持:

```python
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import interrupt, Command

def review_node(state: State) -> dict:
    # 暂停图,把要审核的内容抛给外部
    decision = interrupt({
        "action": "send_email",
        "to": state["recipient"],
        "content": state["draft"],
    })
    # decision 是用户在外部给的回应,resume 之后继续往下跑
    return {"approved": decision == "yes"}

graph.add_node("review", review_node)

checkpointer = MemorySaver()
app = graph.compile(checkpointer=checkpointer)

# 第一次跑,跑到 interrupt 处暂停
config = {"configurable": {"thread_id": "user-123"}}
app.invoke(initial_state, config=config)
# 此时 state 已 checkpoint 在 thread_id=user-123 下

# 用户在前端点了"批准",外部把 decision 传回来
app.invoke(Command(resume="yes"), config=config)
# 从 interrupt 处继续跑
```

**关键**:interrupt 不是阻塞等待,是**真的把图暂停、序列化 state、从函数返回**。前端拿到中间状态,显示给用户;用户决定后,**用同一个 thread_id 重新 invoke**,LangGraph 从断点继续。

> 这套机制对**长流程**(可能跨小时甚至跨天)非常关键。比如审批流程,人不可能盯着 LLM 等;你需要一个能"挂起几小时再恢复"的执行模型。

---

## 七、Checkpoint 与持久化

Checkpoint 不只是给 human-in-the-loop 用的,**它是 LangGraph 一切高级能力的基石**:

| 能力 | 依赖 Checkpoint |
| --- | --- |
| Human-in-the-loop | 暂停后存盘,resume 时读盘 |
| 故障恢复 | 中途崩了从最近 checkpoint 继续 |
| Time travel | 回到某个历史状态重跑 |
| 多用户会话 | 用 thread_id 隔离不同会话的 state |
| 调试 | 拉出某次执行的所有中间 state |

LangGraph 提供几种内置 checkpointer:

| Checkpointer | 适用场景 |
| --- | --- |
| MemorySaver | 单进程开发调试 |
| SqliteSaver | 本地小型应用、单机部署 |
| PostgresSaver | 生产环境,多实例共享 |
| RedisSaver | 高吞吐场景 |

```python
from langgraph.checkpoint.postgres import PostgresSaver

with PostgresSaver.from_conn_string("postgresql://...") as checkpointer:
    checkpointer.setup()
    app = graph.compile(checkpointer=checkpointer)
```

> 生产环境**必上 PostgresSaver / RedisSaver**。MemorySaver 重启就没,SqliteSaver 撑不住多实例。Checkpoint 表最好做分区/归档策略,不然 state 数据涨得比业务数据还快。

---

## 八、和 Claude Agent SDK 的对比

LangGraph 和 Claude Agent SDK(CAS)经常被拿来比,但其实**它们解决的问题不一样**:

| 维度 | LangGraph | Claude Agent SDK |
| --- | --- | --- |
| 定位 | Workflow 编排框架 | Agent 执行框架 |
| 核心抽象 | State + Node + Edge | Agent + Tools + Subagents |
| 谁决定下一步 | 代码(conditional edge) | LLM(模型自己规划) |
| 适合 | 流程明确的任务 | 开放探索的任务 |
| Checkpoint | 一等公民 | 通过 session 管理 |
| Subagent | 需要自己用 node 包装 | 原生支持 |
| 学习曲线 | 中(state machine 思维) | 低(声明 tool 就跑) |

**典型组合**:**外层 LangGraph 控流程,某些 node 内部跑 Claude Agent SDK 做开放探索**。

```python
def research_node(state: State) -> dict:
    # 这个 node 内部是个完整的 Agent,而不是单次 LLM 调用
    from claude_agent_sdk import Agent
    agent = Agent(tools=[web_search, read_pdf])
    result = agent.run(state["topic"])
    return {"research_result": result}

graph.add_node("research", research_node)
```

> **不要在 LangGraph 里手撕 ReAct 循环**。LangGraph 的强项是**确定性编排**,ReAct 那种"反复思考-行动"的循环交给 Agent SDK 写得更优雅。

---

## 九、Workflow vs Agent 选型

| 你的场景 | 选 Workflow (LangGraph) | 选 Agent (Agent SDK) |
| --- | --- | --- |
| 流程图能画清楚 | 是 | 否 |
| 流程依赖业务规则(KYC、审批) | 是 | 否 |
| 需要 human-in-the-loop | 是 | 不强 |
| 需要可恢复、可重放 | 是 | 不强 |
| 任务开放(coding agent、研究) | 否 | 是 |
| 工具调用次数动态(可能 1 次也可能 50 次) | 否 | 是 |
| 需要细粒度可观测 | 是 | 不强 |

混合方案的两个常见模式:

| 模式 | 描述 | 例子 |
| --- | --- | --- |
| Workflow 套 Agent | 主流程 LangGraph,关键 node 跑 Agent | 客服流程的"问题诊断"node 是个 Agent |
| Agent 套 Workflow | Agent 在某些工具里调用预定义 Workflow | Coding Agent 把"部署流水线"作为一个 tool |

> 没有银弹。**选错了不致命,但会让你少加很多班**——Workflow 的事用 Agent 做,你会到处灭火处理它的不可预测;Agent 的事用 Workflow 做,你会写到崩溃因为分支永远画不全。

---

## 十、踩坑

1. **过度建模**。看到 LangGraph 就把所有逻辑都画成图,一个简单的"调 LLM + 解析输出"画成 5 个 node。**记住:Node 应该是有状态意义的步骤,而不是任意函数**。判断标准:**这个步骤值不值得 checkpoint**?不值得就别拆。
2. **State 爆炸**。把所有中间结果都塞进 state,跑 10 步后 state 几兆,每次 checkpoint IO 拖死性能。**对策**:大对象(文件、长文本)放对象存储,state 里只存 reference;无关的中间产物用 ephemeral 字段(每个 node 用完就清)。
3. **Reducer 写错**。Annotated[list, add] 写成 Annotated[list, ...],默认覆盖,结果 messages 永远只剩最后一条。**首次运行一定要用一个多步骤场景把 state 打印出来检查 reducer 是否符合预期**。
4. **循环死锁**。conditional edge 写成"永远回到自己",或两个 node 互相指向对方,跑起来就是死循环。LangGraph 默认有 recursion_limit(25),但**别依赖默认值,显式设个合理上限,且 trace 里要能看到循环计数**。
5. **并行节点的 state 冲突**。两个并行 node 都改同一个字段,reducer 决定谁覆盖谁,行为容易出错。**对策**:并行 node 改不同字段,合并交给后续 node。
6. **Checkpoint 表打爆**。每个 node 都 checkpoint,跑大流量任务一天写几百万行 state。**生产环境**:配置 checkpoint 的 TTL、按 thread_id 做分区、过期 thread 异步归档到对象存储。
7. **不要在 node 里 print 调试**。Node 是个函数,生产跑起来你看不见 print。**用 LangSmith / OpenTelemetry 接 trace**,每个 node 自动打点,出了问题去 trace 后台找。
8. **Interrupt 后不要在外面改 state**。你拿到 interrupt 暂停后,有些人会去手动改数据库里的 state,然后 resume——LangGraph 的 checkpoint 一致性会被破坏。**要改 state 用 graph.update_state() 显式 API,别绕过框架直接动数据库**。
9. **不要用 LangGraph 当通用 workflow 引擎**。LangGraph 是给"LLM 应用流程"设计的,不是替代 Airflow / Temporal。**纯 ETL、纯定时任务用专门的工作流引擎**,LangGraph 的优势是 LLM 友好,不是流程编排本身。
10. **图设计先草稿后落地**。新手最常见的错是上来就写代码,画着画着发现 state 设计错了,推倒重来。**先在 Miro / 白板画状态机图,确认 state 字段、node 输入输出、边的条件,再开始写代码**。

---

下一篇:`30-MCP协议.md`,讲 Anthropic 推的"AI 应用插件标准"——为什么需要它、它怎么工作、怎么自己写一个 MCP Server。
