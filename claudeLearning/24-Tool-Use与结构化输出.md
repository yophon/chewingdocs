# Tool Use 与结构化输出

aiLearning/21 讲过 function calling 的通用原理:模型不直接执行函数,而是输出"我想用什么参数调用哪个工具",由你的代码执行后把结果交回去。这一篇收窄到 Anthropic SDK 的具体写法:怎么定义工具、SDK 的 Tool Runner 怎么帮你跑循环、什么时候才需要手写循环、并行调用怎么处理,以及怎么拿到**保证符合 schema** 的 JSON。

> 一句话先记住:**能用 Tool Runner 就别手写循环,能用结构化输出就别靠提示词"请输出 JSON"**。前者帮你处理调用、执行、回传、终止判断;后者在解码层面保证输出合法,不再需要正则提取、重试解析。

---

## 一、定义一个工具

```python
weather_tool = {
    "name": "get_weather",
    "description": "获取某个城市的当前天气。用户问到天气、气温、是否下雨时调用。",
    "input_schema": {
        "type": "object",
        "properties": {
            "location": {"type": "string", "description": "城市名,如 北京、上海"},
            "unit": {"type": "string", "enum": ["celsius", "fahrenheit"], "description": "温度单位"},
        },
        "required": ["location"],
    },
}
```

写好工具定义的几条规则:

- **名字清楚具体**:`get_current_weather` 好过 `weather`
- **description 要写"什么时候调用"**,不只是"它是做什么的"——Claude 主要靠描述决定要不要调用它
- **每个参数都写 description**,固定取值用 `enum`
- **只把真正必需的参数放进 `required`**,其他给默认值
- **工具数量要克制**:工具太多会让模型选错。工具上百个时用服务端的 tool search 按需加载(28 篇)

---

## 二、Tool Runner:让 SDK 跑循环

```python
import anthropic
from anthropic import beta_tool

client = anthropic.Anthropic()

@beta_tool
def get_weather(location: str, unit: str = "celsius") -> str:
    """获取某个城市的当前天气。

    Args:
        location: 城市名,如 北京、上海。
        unit: 温度单位,celsius 或 fahrenheit。
    """
    return f"{location}:22°C,晴"     # 换成你的真实实现

runner = client.beta.messages.tool_runner(
    model="claude-opus-5-5",
    max_tokens=16000,
    tools=[get_weather],
    messages=[{"role": "user", "content": "北京今天天气怎么样?"}],
)

for message in runner:        # 每一轮产出一条 assistant 消息,Claude 不再调用工具时结束
    print(message)
```

`@beta_tool` 根据函数签名和 docstring **自动生成 schema**,类型化的输入在执行前会被校验。异步版本用 `@beta_async_tool`。

Tool Runner 不是黑盒,"我需要控制"很少是放弃它的理由:

| 你想要 | Tool Runner 里怎么做 |
| --- | --- |
| 执行前人工确认 | 在工具函数里检查,不同意就返回"用户拒绝"的结果;或检查产出的消息,覆盖待执行的调用 |
| 拦截错误 | 在结果回给 Claude 之前检查并处理 |
| 修改结果 | 回传前改写结果,比如加上缓存标记 |
| 重试某一轮 | 比如调大 `max_tokens` 重跑被截断的那一轮;用 `max_iterations` 限制总轮数 |
| 流式、自动压缩 | 都支持 |

> **安全提醒**:Tool Runner 会在 Claude 请求时**自动执行**你的工具函数。发邮件、改数据库、转账这类有副作用的工具,一定要在函数里校验输入、对破坏性操作加确认门。

---

## 三、手写循环:只在真正需要时

需要 Tool Runner 不提供的控制(自定义传输层、SDK 构造不出来的请求形态、不想依赖 beta)时,才自己写:

```python
messages = [{"role": "user", "content": user_input}]

while True:
    response = client.messages.create(
        model="claude-opus-5-5",
        max_tokens=16000,
        tools=tools,
        messages=messages,
    )

    if response.stop_reason == "end_turn":
        break

    if response.stop_reason == "pause_turn":       # 服务端工具达到迭代上限,原样发回去继续
        messages.append({"role": "assistant", "content": response.content})
        continue

    # 把完整的 assistant 内容(含 tool_use 块)追加进历史
    messages.append({"role": "assistant", "content": response.content})

    tool_results = []
    for block in response.content:
        if block.type == "tool_use":
            try:
                result = execute_tool(block.name, block.input)
                tool_results.append({"type": "tool_result", "tool_use_id": block.id, "content": result})
            except Exception as e:
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": f"错误:{e}。请检查参数后重试。",
                    "is_error": True,
                })

    # 所有结果放进同一条 user 消息
    messages.append({"role": "user", "content": tool_results})

final_text = next(b.text for b in response.content if b.type == "text")
```

几个关键细节:

- **`tool_use_id` 必须对应上**,每个 `tool_use` 块都要有一个结果
- **工具失败时返回 `is_error: True` 和清楚的错误信息**,不要直接丢掉这个结果。Claude 通常会换个参数重试或换个办法
- **加一个最大轮数**,防止无限循环;`pause_turn` 的续跑也要设上限
- 用 `json.loads` 之类的方式处理工具输入,**不要对序列化后的输入做字符串匹配**——新模型输出的 JSON 转义方式可能和旧模型不同

---

## 四、并行工具调用

默认情况下,一条 assistant 消息里可能包含**多个** `tool_use` 块。正确做法:

1. **并发执行**它们(它们彼此独立)
2. 把**所有** `tool_result` 放在**同一条** user 消息里返回

> 把结果拆成多条消息分别返回,会在不知不觉中"教会" Claude 不再并行调用。

只想一次调用一个工具,在 `tool_choice` 里加 `"disable_parallel_tool_use": True`。

---

## 五、`tool_choice` 与强制调用

| 值 | 行为 |
| --- | --- |
| `{"type": "auto"}` | 默认,Claude 自己决定 |
| `{"type": "any"}` | 必须至少调用一个工具 |
| `{"type": "tool", "name": "..."}` | 必须调用指定工具 |
| `{"type": "none"}` | 不能调用工具 |

**Fable 5.1、Opus 5.5、Sonnet 5.5 不支持强制调用**:`any` 和指定工具会返回 400。替代办法:

- 用 `auto`,在提示里明确点名要用哪个工具,并检查返回里有没有 `tool_use` 块,没有就再提示一次
- 给工具加 `strict: True`,保证参数合法
- 如果"强制调用"只是为了拿到 JSON,**直接用结构化输出**(第七节)

---

## 六、流式 + 工具

流式请求里定义了你自己的工具时,建议在每个工具上设 `eager_input_streaming: True`:默认情况下,API 会把每个参数**缓冲并校验完**才输出;对于写文件内容、代码块这种大参数,这意味着很长一段时间什么都收不到,然后一下子全部到达。开启后参数边生成边输出。

代价是 API 不再替你校验和修正参数,所以:

1. **执行前自己按 schema 校验输入**(`@beta_tool` 加类型注解的函数会自动做)
2. **出现 `tool_use` 时检查 `stop_reason` 是不是 `max_tokens`**——参数可能在中途被截断,却仍然能解析成一个"看起来合法"的不完整对象
3. 解析失败时不要执行工具,把原始输入作为错误结果返回给 Claude,让它重试

---

## 七、结构化输出:保证合法的 JSON

### 7.1 用 Pydantic(推荐)

```python
from pydantic import BaseModel

class ContactInfo(BaseModel):
    name: str
    email: str
    plan: str
    interests: list[str]
    demo_requested: bool

response = client.messages.parse(
    model="claude-opus-5-5",
    max_tokens=16000,
    messages=[{
        "role": "user",
        "content": "提取:张三(zhangsan@example.com)想要企业版,对 API 和 SDK 感兴趣,希望约一次演示。",
    }],
    output_format=ContactInfo,
)

contact = response.parsed_output        # 已校验的 ContactInfo 实例
print(contact.name, contact.interests)
```

### 7.2 直接给 JSON Schema

```python
response = client.messages.create(
    model="claude-opus-5-5",
    max_tokens=16000,
    messages=[{"role": "user", "content": "提取:李四(lisi@example.com)想要企业版。"}],
    output_config={
        "format": {
            "type": "json_schema",
            "schema": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "email": {"type": "string"},
                    "plan": {"type": "string"},
                },
                "required": ["name", "email", "plan"],
                "additionalProperties": False,
            },
        }
    },
)

data = json.loads(next(b.text for b in response.content if b.type == "text"))
```

旧的顶层 `output_format` 参数已经弃用,`messages.create` 上用 `output_config={"format": ...}`。

### 7.3 strict 工具调用

```python
tools = [{
    "name": "book_flight",
    "description": "预订机票",
    "strict": True,
    "input_schema": {
        "type": "object",
        "properties": {
            "destination": {"type": "string"},
            "date": {"type": "string", "format": "date"},
            "passengers": {"type": "integer", "enum": [1, 2, 3, 4, 5, 6, 7, 8]},
        },
        "required": ["destination", "date", "passengers"],
        "additionalProperties": False,
    },
}]
```

`strict: True` 写在**工具定义的顶层**(和 `name`、`input_schema` 并列),不是写在 `tool_choice` 里。它保证 `tool_use.input` 严格符合 schema。

### 7.4 两者的区别与限制

| | `output_config.format` | `strict: True` |
| --- | --- | --- |
| 约束什么 | Claude 的**回复**格式 | **工具参数**格式 |
| 适合 | 数据抽取、分类、生成结构化结果 | 让工具调用的参数永远合法 |

schema 的限制:

- **支持**:基本类型、`enum`、`const`、`anyOf`、`allOf`、`$ref`,常见字符串格式(`date-time`、`email`、`uri`、`uuid` 等)
- **必须**:所有对象都设 `additionalProperties: false`
- **不支持**:递归 schema、数值约束(`minimum`、`maximum`)、字符串长度约束、复杂数组约束。Python 和 TypeScript SDK 会自动把不支持的约束从发送的 schema 里去掉,改在客户端校验

其他注意:

- 新 schema 第一次使用有编译开销,之后 24 小时内复用缓存
- **和 citations 不兼容**(同时用返回 400)
- `stop_reason` 为 `refusal` 或 `max_tokens` 时,输出可能不符合 schema——先检查 stop_reason

---

## 八、Anthropic 定义的客户端工具

有几个工具的 schema 由 Anthropic 定义,你只声明类型、自己实现执行逻辑:

```python
tools = [
    {"type": "bash_20250124", "name": "bash"},
    {"type": "text_editor_20250728", "name": "str_replace_based_edit_tool"},
    {"type": "memory_20250818", "name": "memory"},
]
```

它们**没有 `input_schema`**,模型对它们的用法经过专门训练。自己定义一个也叫 `bash` 的工具,和这个不是一回事。执行它们时一定要做好安全检查(路径限制、命令过滤、沙箱)。memory 工具在 29 篇讲,computer use 在 28 篇讲。

---

## 九、一些常见模式

| 模式 | 做法 |
| --- | --- |
| 数据抽取 | 结构化输出,不需要工具 |
| 查询类 agent(查库、查天气、查文档) | Tool Runner + 只读工具 |
| 有副作用的 agent | Tool Runner + 在工具函数里加确认门和输入校验 |
| 路由 / 分类 | 结构化输出 + `enum` |
| 让模型写代码并执行 | 服务端代码执行工具(28 篇),不用自己搭沙箱 |
| 工具很多 | tool search,按需加载工具定义 |
| 需要托管的完整 agent 运行时 | Managed Agents(31 篇) |

---

## 十、踩坑

1. **description 只写"做什么"不写"何时用"**——Claude 不知道什么时候该调用
2. **工具结果拆成多条消息返回**——会让模型逐渐不再并行调用
3. **工具失败时直接丢掉结果**——缺了 `tool_result` 请求会出错;返回 `is_error` 让它重试
4. **在新模型上用 `tool_choice: any` 强制调用**——400。用 `auto` + 提示 + `strict`
5. **为了拿 JSON 而强制调用一个假工具**——直接用结构化输出
6. **`strict` 写在 `tool_choice` 里**——它是工具定义的顶层字段
7. **schema 漏了 `additionalProperties: false`**——结构化输出要求所有对象都设
8. **结构化输出和 citations 一起用**——400
9. **开了 `eager_input_streaming` 却不校验输入**——截断的参数可能被当成合法的执行
10. **手写循环不设最大轮数**——工具一直被调用,循环停不下来

---

下一篇:`25-Prompt-Caching.md`,讲前缀缓存的工作原理、自动缓存和手动断点、TTL、最小缓存长度、那些悄悄让缓存失效的写法,以及如何验证命中率。
