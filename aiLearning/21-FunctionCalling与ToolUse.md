# Function Calling 与 Tool Use

如果说 Prompt Engineering 是教模型"怎么说",那 Function Calling 就是教模型"怎么做"。**它让 LLM 第一次拥有了调用外部世界的能力**——查数据库、调 API、发邮件、跑代码。这一篇讲清楚 OpenAI 和 Anthropic 两套方案的写法、原理和踩坑。看完这篇,你就拿到了 Agent 的"手脚",26 篇之后讲的所有 Agent 模式都建立在这之上。

> 一句话先记住:**Function Calling 的本质不是"模型在调函数",而是"模型在按你给的 schema 输出结构化 JSON,你再决定要不要执行"**。

---

## 一、什么是 Function Calling

考虑一个常见需求:**"帮我查一下今天北京的天气"**。

光靠 prompt 是搞不定的——模型训练数据截止到去年,不知道今天的天气。但如果你能告诉模型:

> "你有一个工具叫 `get_weather(city: str)`,你需要的时候可以调它"

模型就会**输出一段"我要调 get_weather('北京')"的指令**,你的程序解析这段指令、真正去查天气 API、把结果再喂回模型,模型再产出最终答复。

整个过程长这样:

```
用户:今天北京天气怎么样?
   ↓
LLM:我需要调用 get_weather(city="北京")  ← 模型输出 tool_use
   ↓
你的代码:执行 get_weather("北京"),拿到 "晴, 22°C"
   ↓
你把结果回喂:tool_result = "晴, 22°C"
   ↓
LLM:今天北京晴天,气温 22°C  ← 最终回答
```

> **关键认知**:模型并没有真的"调用"任何东西。它只是输出了一段格式化的"调用意图"。**真正的执行权在你手里**——你可以同意、拒绝、改参数、记录日志。这是安全的核心。

---

## 二、本质:让模型输出符合 schema 的 JSON

把 Function Calling 拆开看,它其实是一个特殊版的"结构化输出":

| 维度 | 普通 JSON 输出 | Function Calling |
| --- | --- | --- |
| 模型决定输出什么 | 总是 JSON | 模型决定输不输,以及调哪个 tool |
| schema 来源 | 你写在 prompt 里 | 用 SDK 的 `tools` 参数声明 |
| 触发条件 | 每次都触发 | 模型判断"需要调"才触发 |
| 多个候选 | 不支持 | 多 tool 时模型自己选 |

**所有现代 LLM 的 Function Calling 都是在 SFT/RLHF 阶段专门训过的能力**——不是 prompt 黑魔法,而是模型权重里就内置了"看到 tools 参数就该输出 tool_use 块"的行为。

---

## 三、OpenAI Function Calling

```python
from openai import OpenAI
import json

client = OpenAI()

# 1. 声明 tools
tools = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "获取指定城市当前天气",
            "parameters": {
                "type": "object",
                "properties": {
                    "city": {
                        "type": "string",
                        "description": "城市名,中文,如 北京、上海",
                    },
                },
                "required": ["city"],
            },
        },
    }
]

# 2. 第一轮:让模型决定要不要调
messages = [{"role": "user", "content": "今天北京天气怎么样?"}]
resp = client.chat.completions.create(
    model="gpt-5",
    messages=messages,
    tools=tools,
)

assistant_msg = resp.choices[0].message
messages.append(assistant_msg)

# 3. 如果模型选择调 tool
if assistant_msg.tool_calls:
    for call in assistant_msg.tool_calls:
        if call.function.name == "get_weather":
            args = json.loads(call.function.arguments)
            result = real_get_weather(args["city"])  # 你自己实现
            messages.append({
                "role": "tool",
                "tool_call_id": call.id,
                "content": json.dumps(result, ensure_ascii=False),
            })

    # 4. 第二轮:把 tool 结果喂回去,拿最终答复
    final = client.chat.completions.create(
        model="gpt-5",
        messages=messages,
        tools=tools,
    )
    print(final.choices[0].message.content)
```

注意几个点:

- **tools 在每一轮都要传**,不传模型会忘了自己有这些工具
- **tool_call_id 必须和 assistant 那条对得上**,否则 OpenAI 会报错
- `parameters` 用标准 JSON Schema,模型对 description 极其敏感——**写得好不好直接决定模型选不选这个 tool**

---

## 四、Anthropic Tool Use

Anthropic 的 API 在内容块层面就内置了 tool use,语义更清晰。一个完整可跑的例子:

```python
from anthropic import Anthropic

client = Anthropic()

tools = [
    {
        "name": "get_weather",
        "description": "获取指定城市当前天气。返回温度和天气描述。",
        "input_schema": {
            "type": "object",
            "properties": {
                "city": {
                    "type": "string",
                    "description": "城市名,如 北京、上海",
                },
            },
            "required": ["city"],
        },
    },
    {
        "name": "get_time",
        "description": "获取指定时区当前时间。",
        "input_schema": {
            "type": "object",
            "properties": {
                "timezone": {"type": "string", "description": "如 Asia/Shanghai"},
            },
            "required": ["timezone"],
        },
    },
]

def real_get_weather(city: str) -> dict:
    # 真实实现:调一个天气 API
    return {"city": city, "temp": 22, "desc": "晴"}

def real_get_time(timezone: str) -> dict:
    from datetime import datetime
    from zoneinfo import ZoneInfo
    return {"now": datetime.now(ZoneInfo(timezone)).isoformat()}

def dispatch(name: str, inputs: dict):
    if name == "get_weather":
        return real_get_weather(**inputs)
    if name == "get_time":
        return real_get_time(**inputs)
    raise ValueError(f"unknown tool {name}")

messages = [{"role": "user", "content": "今天北京天气怎么样,几点了?"}]

while True:
    resp = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        tools=tools,
        messages=messages,
    )

    # 把 assistant 这一轮的全部 content 块原封不动加回去
    messages.append({"role": "assistant", "content": resp.content})

    # 模型说"我说完了",退出循环
    if resp.stop_reason == "end_turn":
        break

    # 找出所有 tool_use 块,逐个执行
    if resp.stop_reason == "tool_use":
        tool_results = []
        for block in resp.content:
            if block.type == "tool_use":
                try:
                    output = dispatch(block.name, block.input)
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": str(output),
                    })
                except Exception as e:
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": f"Error: {e}",
                        "is_error": True,
                    })
        messages.append({"role": "user", "content": tool_results})
        continue

    break  # 其他停止原因(max_tokens / stop_sequence),也退出

# 取最终回答
for block in resp.content:
    if block.type == "text":
        print(block.text)
```

### Anthropic 的内容块结构

Anthropic 的 messages content 是一个 **block 数组**,不是字符串。一轮 assistant 回答可能同时包含:

| block 类型 | 含义 |
| --- | --- |
| `text` | 模型说的话 |
| `tool_use` | 模型要调 tool(包含 id、name、input) |
| `thinking` | 内部思考(开启 extended thinking 时) |

而你回喂 tool 结果用的是 `tool_result` 块,放在一条 `user` 消息里。**这种结构比 OpenAI 的更线性、更清晰**,尤其是多 tool 并行时。

---

## 五、多步 Tool 调用循环

真实场景几乎都是多步的:**"帮我订一张明天去上海的高铁,选下午的"**——模型可能要先查时刻表,再查余票,再下单,最后给确认。这就是上面例子里 `while True` 的意义。

### 标准循环骨架

```python
def run_agent(user_query: str, max_iters: int = 10):
    messages = [{"role": "user", "content": user_query}]
    for _ in range(max_iters):
        resp = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2048,
            tools=tools,
            messages=messages,
        )
        messages.append({"role": "assistant", "content": resp.content})

        if resp.stop_reason == "end_turn":
            return extract_text(resp)

        if resp.stop_reason == "tool_use":
            tool_results = [
                {
                    "type": "tool_result",
                    "tool_use_id": b.id,
                    "content": str(dispatch(b.name, b.input)),
                }
                for b in resp.content if b.type == "tool_use"
            ]
            messages.append({"role": "user", "content": tool_results})
            continue

        return extract_text(resp)

    raise RuntimeError("超过最大迭代次数")
```

### 必加的安全网

| 防护 | 为什么 |
| --- | --- |
| `max_iters` 上限 | 防止模型死循环不停调 tool |
| 每个 tool 调用超时 | 一个慢 tool 拖死整个流程 |
| tool 错误返回结构化 error | 模型可以根据 error 调整策略 |
| 监控总 token / 总耗时 | 一次 Agent 跑跑出几百 K token 是常事 |

> 5 年工程师视角:**这个 while 循环就是一个最小可用 Agent**。26 篇讲的 ReAct、27 讲的 Plan-Execute,核心都是这个循环加点花样。

---

## 六、并行 Tool 调用

Claude 和 GPT-5 都支持**一轮里输出多个 tool_use**——比如同时查天气和查时间,模型不会串行排队。

```python
# 一个 assistant turn 的 content 里可能有:
[
    {"type": "text", "text": "我帮你查一下"},
    {"type": "tool_use", "id": "tu_01", "name": "get_weather", "input": {...}},
    {"type": "tool_use", "id": "tu_02", "name": "get_time", "input": {...}},
]
```

你应该**并行执行所有 tool**,然后一次性回喂多个 tool_result:

```python
import asyncio

async def run_tool(block):
    return {
        "type": "tool_result",
        "tool_use_id": block.id,
        "content": str(await dispatch_async(block.name, block.input)),
    }

tool_uses = [b for b in resp.content if b.type == "tool_use"]
tool_results = await asyncio.gather(*(run_tool(b) for b in tool_uses))
messages.append({"role": "user", "content": tool_results})
```

并行可以把多步 Agent 的延迟砍掉一半以上。**默认就开**。

---

## 七、Tool 设计原则

模型选不选你的 tool、参数填不填得对,**80% 取决于 tool 的设计**——剩下 20% 才是模型本身。

### 1. 命名:动词 + 名词

| 推荐 | 不推荐 |
| --- | --- |
| `search_orders` | `orders_handler` |
| `send_email` | `email_util` |
| `query_weather` | `weather` |

让模型一眼知道"这个 tool 干什么"。

### 2. 描述:写给"刚入职的实习生"

```python
{
    "name": "search_orders",
    "description": (
        "在订单系统中按用户 ID 或订单状态搜索订单。"
        "如果用户问'我的订单'但没说具体哪个,默认按最近 30 天搜索。"
        "返回最多 20 条订单的列表。"
    ),
    ...
}
```

把使用场景、默认行为、返回上限**全写进 description**。模型不会读你的代码注释。

### 3. 参数:能枚举就枚举

```python
"status": {
    "type": "string",
    "enum": ["pending", "paid", "shipped", "cancelled"],
    "description": "订单状态",
}
```

枚举比 free-form string 准确率高一个量级——**模型不会再给你编出"已发货"、"shipping"这种值**。

### 4. 错误返回结构化

不要直接 throw exception,把错误包成 tool_result 喂回去:

```python
{
    "type": "tool_result",
    "tool_use_id": ...,
    "content": json.dumps({
        "error": "INVALID_USER_ID",
        "message": "user_id 必须是数字,但收到了 'abc123'",
        "hint": "请检查用户输入或要求用户重新提供",
    }),
    "is_error": True,
}
```

模型看到结构化错误后,会**自己改参数重试**或者**问用户要更多信息**。这是 Agent 自愈能力的关键。

### 5. Tool 数量:5-15 个是甜点区

| Tool 数量 | 表现 |
| --- | --- |
| 1-5 | 模型基本不会选错 |
| 5-15 | 实战常见,需要好的 description |
| 15-30 | 选择准确率明显下降 |
| 30+ | 必须配合"tool retrieval"——先用 RAG 选 tool,再喂给模型 |

---

## 八、踩坑

### 坑 1:输入验证不能省

模型输出的 input 可能不合 schema。**永远在 dispatch 之前再 validate 一遍**:

```python
from pydantic import BaseModel, ValidationError

class WeatherInput(BaseModel):
    city: str

try:
    inp = WeatherInput(**block.input)
except ValidationError as e:
    return {"error": str(e), "is_error": True}
```

不要相信模型给的 JSON。

### 坑 2:超时

一个 tool 卡住会让整个 agent 卡住。**每个 tool 都包 timeout**:

```python
import asyncio
result = await asyncio.wait_for(real_call(...), timeout=10.0)
```

### 坑 3:Tool 选择失败

模型选了一个不该选的 tool,或者该选 tool 时没选。

| 原因 | 排查 |
| --- | --- |
| description 不清晰 | 重写 description,加使用场景 |
| Tool 太多重叠 | 合并相似 tool,或拆得更明确 |
| 用户输入有歧义 | system prompt 加"调 tool 前如果不确定就反问用户" |

### 坑 4:参数幻觉

模型给一个不存在的 user_id、编出一个假的 SKU。

| 对策 | 怎么做 |
| --- | --- |
| 让 tool 自己 validate + 返回 ID 不存在 | 模型会改 |
| prompt 里强调"不要编造,不知道就问用户" | 显著降低幻觉 |
| 关键参数走"先列表再选"两步 | 先 `list_users` 再 `get_user_detail`,模型从真实列表里挑 |

### 坑 5:tool_result content 太长

把一个 50K token 的 SQL 结果直接喂回去——上下文炸了。**tool 这一层要做摘要/截断**:

```python
def trim(s: str, max_chars: int = 4000):
    return s if len(s) <= max_chars else s[:max_chars] + f"\n...(truncated, total {len(s)} chars)"
```

### 坑 6:不同模型的 tool 行为不一致

| 模型 | 表现 |
| --- | --- |
| Claude Opus 4.7 | tool 选择和参数填写最稳;并行 tool 用得最积极 |
| Claude Sonnet 4.6 | 性价比之选,大多数 tool use 场景够用 |
| GPT-5 | tool use 准确率高,但偏向"问用户"多于"主动调" |
| Gemini 2.5 Pro | 工具数量大时表现稳,长流程偶尔丢失上下文 |

> 选型:**做生产 Agent 主力建议 Sonnet 4.6 / GPT-5,需要超复杂规划的环节才上 Opus 4.7**。成本差 5 倍。

---

## 九、伏笔:Tool 是 Agent 的手脚

回头看 20 篇讲的 ReAct:

```
Thought → Action(tool_use)→ Observation(tool_result)→ Thought → ...
```

这套循环就是本篇的 while 循环。**Tool Use 不是一个孤立功能,它是 Agent 的整个"行为基底"**。

接下来你会看到:

- 22-23 篇:把"知识检索"做成 tool,Agent 就有了"知识库"
- 24-25 篇:把"读写记忆"做成 tool,Agent 就有了"记忆"
- 26 篇:把这个 while 循环加上推理、反思,就是 ReAct
- 30 篇:**MCP**——把 tool 标准化成跨 Agent 的"插件协议"

> Tool 这一层做得好不好,**直接决定你的 Agent 是"玩具"还是"能用"**。这一层不能图省事,prompt + tool description 都要打磨。

---

## 十、踩坑/选型建议

1. **用 Anthropic 的内容块模型**(text/tool_use/tool_result)思考问题,即使你用 OpenAI——这个心智模型更清晰。
2. **Tool description 是头等公民**。花在 description 上的时间和花在业务逻辑上的时间应该差不多。
3. **不要直接把现有内部 API 暴露成 tool**。内部 API 是给工程师用的,tool 是给 LLM 用的——后者需要更"傻瓜"的接口、更明确的错误信息。
4. **每个 tool 都要 mock 测试**。不要等真实 Agent 跑起来才发现你的 tool 在某些参数下抛 500。
5. **永远设 max_iters**。永远设 max_iters。永远设 max_iters。
6. **生产环境强烈建议加 tool 调用日志**(input/output/耗时/错误),便于事后归因。
7. **JSON Schema 写出来 → 让模型自己用**。同一个 schema 既是 tool 参数又是结构化输出格式,**复用降低维护成本**。
8. **Tool 不超过 15 个**。再多就用 RAG-on-tools(先检索再调用),或者拆成多个专精 Agent。
9. **用 enum 替代 free-form string**,准确率立刻上一个台阶。
10. **不要让模型直接执行高危操作**(删库、转账)。**把高危 tool 改成"需要用户确认"——返回一个 confirmation_token,再开第二个 tool 真正执行**。

---

下一篇:`22-RAG检索增强生成.md`,讲怎么给 LLM 外挂"知识库"——这是和 Tool Use 并列的应用层基本盘,很多业务场景两者会一起上。
