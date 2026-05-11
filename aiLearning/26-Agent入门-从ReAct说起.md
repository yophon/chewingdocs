# Agent 入门：从 ReAct 说起

普通 LLM 调用是"问一次答一次"。**Agent** 是让模型自己决定"下一步干什么"——可以调工具、查信息、再想想、再调工具……直到任务完成。

> 一句话先记住：Agent = LLM + 工具 + 循环。

---

## 一、为什么需要 Agent？

LLM 的局限：
- 没有实时信息（知识截止日期）
- 不能执行代码
- 不能访问外部系统
- 一次性推理，不能"走走想想"

Agent 的解法：给模型一堆工具，让它自己决定用哪个、怎么用、用多少次。

---

## 二、ReAct：第一个成熟的 Agent 范式

ReAct（Reason + Act，2022年论文）的核心思路：**思考 → 行动 → 观察 → 再思考**，循环直到得出答案。

```
Thought: 我需要查一下上海今天的天气
Action: search("上海 今天天气")
Observation: 上海今天晴，25°C
Thought: 已经有答案了，可以回复用户了
Answer: 上海今天晴天，气温25摄氏度。
```

每一步 LLM 输出的是结构化文本，代码解析后执行对应工具，把结果喂回去，LLM 继续生成下一步。

---

## 三、用 Claude 从零实现一个 ReAct Agent

```python
import anthropic
import json
import math

client = anthropic.Anthropic()

# 定义工具
tools = [
    {
        "name": "calculator",
        "description": "执行数学计算，输入数学表达式字符串",
        "input_schema": {
            "type": "object",
            "properties": {
                "expression": {"type": "string", "description": "如 '2 + 3 * 4' 或 'sqrt(16)'"}
            },
            "required": ["expression"],
        },
    },
    {
        "name": "get_weather",
        "description": "获取某城市当前天气",
        "input_schema": {
            "type": "object",
            "properties": {
                "city": {"type": "string", "description": "城市名，如 '上海'"}
            },
            "required": ["city"],
        },
    },
]

# 工具实现（真实场景中这里接真实 API）
def run_tool(name: str, inputs: dict) -> str:
    if name == "calculator":
        try:
            # 安全起见只允许数学表达式
            result = eval(inputs["expression"], {"__builtins__": {}}, {"sqrt": math.sqrt, "pi": math.pi})
            return str(result)
        except Exception as e:
            return f"计算出错: {e}"
    elif name == "get_weather":
        # Mock 数据
        weather_db = {"上海": "晴，25°C", "北京": "多云，18°C", "广州": "阵雨，30°C"}
        return weather_db.get(inputs["city"], "未知城市")
    return "工具不存在"

# Agent 循环
def run_agent(user_query: str) -> str:
    messages = [{"role": "user", "content": user_query}]

    while True:
        response = client.messages.create(
            model="claude-opus-4-7",
            max_tokens=1024,
            tools=tools,
            messages=messages,
        )

        # 把助手回复加入历史
        messages.append({"role": "assistant", "content": response.content})

        # 判断是否结束
        if response.stop_reason == "end_turn":
            # 提取最终文本回复
            for block in response.content:
                if hasattr(block, "text"):
                    return block.text

        # 有工具调用，执行并把结果喂回去
        if response.stop_reason == "tool_use":
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    result = run_tool(block.name, block.input)
                    print(f"[工具调用] {block.name}({block.input}) → {result}")
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result,
                    })
            messages.append({"role": "user", "content": tool_results})

# 测试
if __name__ == "__main__":
    answer = run_agent("上海今天天气怎么样？另外帮我算一下 sqrt(144) + 5*7 是多少？")
    print("\n最终回复:", answer)
```

运行输出大致是：
```
[工具调用] get_weather({'city': '上海'}) → 晴，25°C
[工具调用] calculator({'expression': 'sqrt(144) + 5*7'}) → 47.0

最终回复: 上海今天晴天，气温25°C。sqrt(144) + 5×7 = 12 + 35 = 47。
```

---

## 四、Agent 的核心组件

```
┌─────────────────────────────────────────┐
│              Agent 循环                  │
│                                         │
│  用户输入                               │
│     │                                   │
│     ▼                                   │
│  ┌──────────┐   工具调用    ┌─────────┐ │
│  │   LLM    │ ────────────▶ │  工具   │ │
│  │  (大脑)  │ ◀──────────── │ (手脚)  │ │
│  └──────────┘   观察结果    └─────────┘ │
│     │                                   │
│     │ stop_reason == "end_turn"         │
│     ▼                                   │
│  最终回复                               │
└─────────────────────────────────────────┘
```

| 组件 | 作用 |
| --- | --- |
| **LLM** | 决策大脑，决定调哪个工具、怎么用 |
| **工具（Tools）** | 能力扩展，搜索/代码执行/数据库查询… |
| **记忆（Memory）** | 上下文 + 历史（详见第 25 篇）|
| **循环（Loop）** | 工具调用 → 观察 → 继续推理，反复执行 |

---

## 五、停止条件与安全边界

Agent 如果没有停止条件会死循环。常见做法：

```python
MAX_STEPS = 10
step = 0

while step < MAX_STEPS:
    response = call_llm(messages)
    step += 1
    if response.stop_reason == "end_turn":
        break
    # 处理工具调用...

if step >= MAX_STEPS:
    return "达到最大步数限制，任务未完成。"
```

除了步数限制，还有：
- **时间超时**：防止长时间卡住
- **工具白名单**：只允许调用指定工具，防止意外副作用
- **Human-in-the-loop**：高风险操作（发邮件、删数据）前先问人

---

## 六、ReAct 之后的演进

| 方法 | 核心改进 |
| --- | --- |
| **ReAct**（2022）| 基础范式，思考+行动交替 |
| **Reflexion**（2023）| 加了"反思"步骤，失败后自我复盘再来 |
| **Plan-and-Execute** | 先整体规划，再逐步执行，避免短视 |
| **Tree of Thoughts** | 多路径探索，像棋盘搜索一样试多条路 |
| **Function Calling** | OpenAI/Claude 官方原生支持，更结构化 |

下一篇（27）会详细讲这些架构模式。

---

## 七、给新手的三条建议

1. **先用 Function Calling，别手写解析**。Claude/GPT 原生支持 tool_use，比自己 parse JSON 可靠得多。
2. **工具要幂等**。Agent 可能重复调用同一个工具，确保多次调用不出问题。
3. **日志是命根**。把每次 Thought/Action/Observation 打出来，调试时救命。
