# Tool Use 实战

aiLearning/21 已经讲过 Function Calling / Tool Use 的通用概念。这一篇收窄到 Anthropic SDK 的具体实现:**怎么定义工具、怎么处理工具调用、怎么写 tool loop 让 Claude 真的把任务做完**。Claude Code 的全部能力都是建立在这套机制上——你看完这一篇就理解了 Coding Agent 的内核。

> 一句话先记住:**Tool Use 不是"调用一次工具"——是"循环:Claude 决定调谁 → 你执行 → 把结果回给 Claude → 直到 Claude 说停"**。理解循环你就理解了 Agent。

---

## 一、最小可用例子

```python
from anthropic import Anthropic
client = Anthropic()

# 1. 定义工具
tools = [
    {
        "name": "get_weather",
        "description": "查询某城市的当前天气。",
        "input_schema": {
            "type": "object",
            "properties": {
                "city": {"type": "string", "description": "城市名"},
                "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]}
            },
            "required": ["city"]
        }
    }
]

# 2. 第一次发请求
messages = [{"role": "user", "content": "北京今天多少度?"}]
resp = client.messages.create(
    model="claude-sonnet-4-7",
    max_tokens=1024,
    tools=tools,
    messages=messages,
)

# 3. resp.stop_reason == "tool_use" 表示 Claude 想调工具
print(resp.stop_reason)             # "tool_use"
tool_use = next(b for b in resp.content if b.type == "tool_use")
print(tool_use.name, tool_use.input)  # get_weather, {"city": "北京"}

# 4. 你执行工具拿到结果
tool_result = "12°C, 晴"

# 5. 把 assistant 这轮 + tool_result 一起发回
messages.append({"role": "assistant", "content": resp.content})
messages.append({
    "role": "user",
    "content": [{
        "type": "tool_result",
        "tool_use_id": tool_use.id,
        "content": tool_result,
    }]
})

# 6. 再发一次,这次 Claude 拿到结果会写最终回答
final = client.messages.create(
    model="claude-sonnet-4-7",
    max_tokens=1024,
    tools=tools,
    messages=messages,
)
print(final.content[0].text)
# "北京今天 12°C,晴。"
```

**关键点**:

- 工具定义放 `tools=` 字段
- Claude 不直接执行——它**返回 `tool_use` 块说明它想怎么调**
- 你执行,把结果作为 `tool_result` 块塞回 messages
- 再发一次,Claude 用结果写最终答

---

## 二、Tool Schema 写法的几条铁律

```jsonc
{
  "name": "search_db",
  "description": "在订单库里搜订单。仅支持按用户 ID 或订单号精确查。",
  "input_schema": {
    "type": "object",
    "properties": {
      "user_id": { "type": "string", "description": "用户 UUID" },
      "order_no": { "type": "string", "description": "订单号,如 ORDER-20251231-001" },
      "limit": { "type": "integer", "minimum": 1, "maximum": 100, "default": 20 }
    },
    "anyOf": [
      { "required": ["user_id"] },
      { "required": ["order_no"] }
    ]
  }
}
```

### 2.1 description 决定 LLM 调不调你

`description` 是 LLM 唯一的"什么时候用我"的依据。

- **写清楚能干什么、不能干什么**:"仅支持按 X / Y 查",避免 LLM 误以为能模糊查
- **写清楚副作用**:"会扣款"、"会发邮件"、"会创建数据"——LLM 看到这些会更谨慎
- **写好示例输入**:"如 ORDER-20251231-001",LLM 就知道格式

### 2.2 参数 schema 越严越好

LLM 会按 schema 填参数,**schema 严 = LLM 错率低**:

- 用 `enum` 限制选项
- 用 `minimum / maximum` 限制数值
- 用 `pattern` 限制字符串格式
- 用 `required` 标必填
- 用 `anyOf / oneOf` 表达"至少给一个 / 二选一"

### 2.3 description 长度别吝啬

很多人 description 写 10 个字,然后吐槽"LLM 调错"。**它就只看那 10 个字,你不写它怎么知道?** 写 50-100 字给 LLM 上下文:这工具是干啥的、何时用、注意事项。

---

## 三、Tool Loop:让 Claude 跑到底

实际任务很少一次工具就够。Claude 调一次拿到结果可能还要再调,得循环跑:

```python
def run_agent(user_input: str, max_iters=10):
    messages = [{"role": "user", "content": user_input}]
    for i in range(max_iters):
        resp = client.messages.create(
            model="claude-sonnet-4-7",
            max_tokens=2048,
            tools=tools,
            messages=messages,
        )
        # 把 assistant 这轮加进 history
        messages.append({"role": "assistant", "content": resp.content})

        if resp.stop_reason != "tool_use":
            # Claude 决定不再调工具,把最终回答返回
            return next((b.text for b in resp.content if b.type == "text"), "")

        # 处理所有 tool_use 块(可能并行多个)
        tool_results = []
        for block in resp.content:
            if block.type == "tool_use":
                result = dispatch(block.name, block.input)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": result,
                })
        messages.append({"role": "user", "content": tool_results})

    raise RuntimeError("达到最大迭代")

def dispatch(name: str, args: dict) -> str:
    if name == "get_weather":
        return f"{args['city']} 12°C, 晴"
    if name == "search_db":
        return "..."
    raise ValueError(f"unknown tool {name}")
```

**这就是 Agent 主循环**——所有 Coding Agent / 客服 Agent / 数据 Agent 内核都是这个套路。

---

## 四、Parallel Tool Use:并行调用

Claude 可以**一次返回多个 tool_use 块**——表示它要并行调几个工具:

```python
# resp.content 可能是
[
    {"type": "text", "text": "我先看下两个城市天气"},
    {"type": "tool_use", "id": "x1", "name": "get_weather", "input": {"city": "北京"}},
    {"type": "tool_use", "id": "x2", "name": "get_weather", "input": {"city": "上海"}},
]
```

**你应该并行执行**——不是顺序 for 循环。Python 用 ThreadPool / asyncio,JS 用 Promise.all:

```python
from concurrent.futures import ThreadPoolExecutor

with ThreadPoolExecutor() as ex:
    futures = []
    for block in resp.content:
        if block.type == "tool_use":
            futures.append((block.id, ex.submit(dispatch, block.name, block.input)))
    tool_results = [
        {"type": "tool_result", "tool_use_id": id, "content": f.result()}
        for id, f in futures
    ]
```

**省时间**:5 个 200ms 的工具,并行 200ms,顺序 1s。

> Claude 4.x 默认行为已经倾向于并行;你的客户端代码**也要支持并行**,否则白瞎了。

---

## 五、`tool_choice`:控制 Claude 是不是必须调

| `tool_choice` | 含义 |
| --- | --- |
| `{"type": "auto"}`(默认) | LLM 自己决定调不调 |
| `{"type": "any"}` | 必须调一个工具(任意一个) |
| `{"type": "tool", "name": "X"}` | 必须调 X 这个工具 |
| `{"type": "none"}` | 禁止调工具,只输出文本 |

**典型用法**:

- 数据抽取场景 → `tool_choice: any`,**强制 LLM 走结构化输出**(下文详讲)
- 流程第一步固定 → `tool_choice: tool, name: "search"`
- 总结阶段 → `tool_choice: none`,不让它再调

---

## 六、用 Tool Use 做"结构化输出"

LLM 直接生成 JSON 偶尔会写错(多个引号、漏字段、格式错);**用一个伪工具强制 LLM 输出结构化**:

```python
extract_tool = {
    "name": "extract_invoice",
    "description": "从发票文本里提取关键字段。",
    "input_schema": {
        "type": "object",
        "properties": {
            "vendor": {"type": "string"},
            "amount": {"type": "number"},
            "date": {"type": "string", "format": "date"},
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "qty": {"type": "integer"},
                        "price": {"type": "number"}
                    },
                    "required": ["name", "qty", "price"]
                }
            }
        },
        "required": ["vendor", "amount", "date", "items"]
    }
}

resp = client.messages.create(
    model="claude-sonnet-4-7",
    max_tokens=2048,
    tools=[extract_tool],
    tool_choice={"type": "tool", "name": "extract_invoice"},
    messages=[{"role": "user", "content": INVOICE_TEXT}],
)

# 直接拿到结构化数据
data = next(b.input for b in resp.content if b.type == "tool_use")
print(data)
# {"vendor": "...", "amount": 1234.56, ...}
```

**这是 2026 年最干净的"结构化输出"模式**——比"prompt 里要求 JSON" 可靠 10 倍,SDK 自动校验 schema。

---

## 七、Tool Result 的几个细节

### 7.1 content 可以是 list

`tool_result` 的 content 可以是字符串或 content blocks:

```python
{
    "type": "tool_result",
    "tool_use_id": "x1",
    "content": [
        {"type": "text", "text": "查询结果如下"},
        {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": "..."}}
    ]
}
```

工具能返回**图片**——很多场景(浏览器自动化、绘图、数据可视化)很有用。

### 7.2 工具失败:`is_error`

```python
{
    "type": "tool_result",
    "tool_use_id": "x1",
    "content": "Connection timeout after 30s",
    "is_error": True,   # 告诉 LLM 这次调用失败
}
```

LLM 看到 `is_error: true` 会知道这次失败,可能换个方式重试或求助用户。**这比"在 content 里写错误信息"更可靠**——LLM 一看 flag 就走"失败路径"。

---

## 八、Streaming + Tool Use

Streaming 模式下也能用 tool。`stream_text` 拿不到 tool_use,需要遍历 chunks:

```python
with client.messages.stream(
    model="claude-sonnet-4-7",
    max_tokens=2048,
    tools=tools,
    messages=messages,
) as stream:
    for event in stream:
        if event.type == "content_block_start" and event.content_block.type == "tool_use":
            # 工具开始
            ...
        elif event.type == "content_block_delta" and event.delta.type == "input_json_delta":
            # tool input 在流式生成
            print(event.delta.partial_json, end="")
        elif event.type == "content_block_delta" and event.delta.type == "text_delta":
            print(event.delta.text, end="")
    final = stream.get_final_message()
```

**实战中**:Web 应用通常不 stream tool_use 给用户(展示价值低);只 stream 最终文本回答。

---

## 九、Server Tools:Anthropic 自家提供的工具

除了你自己定义的工具,Anthropic 还提供几个 "server tool"(在它们服务器侧执行,你不用自己实现):

| Tool | 干啥 |
| --- | --- |
| `web_search` | 在线搜索 |
| `code_execution` | 在沙箱里跑 Python |
| `computer_use` | 屏幕 / 鼠标 / 键盘(17 篇专讲) |
| `text_editor` | Claude 自己读改文件(Coding Agent 用) |
| `bash` | 在 sandbox 里跑 bash |

```python
tools = [
    {"type": "web_search_20250305", "name": "web_search"},
    {"type": "code_execution_20250318", "name": "code_execution"},
]
```

**前两个常见**:web_search 让 Claude 自己上网找最新信息;code_execution 让 Claude 跑 Python 验证想法 / 算东西。**比自己写一遍简单太多**。

---

## 十、常见模式

### 10.1 RAG 风格

```
user: "公司 PTO 政策是什么?"
  ↓
[tool: search_internal_docs]
  ↓
Claude 看到检索结果 → 答用户
```

### 10.2 多步任务

```
user: "把上周新增的客户标记为 VIP"
  ↓
[tool: list_new_customers]
  ↓
[tool: tag_as_vip] (并行调多次)
  ↓
"完成,标了 N 个"
```

### 10.3 confirm 模式

```
user: "把 X 删了"
  ↓
Claude: "确认要删 X 吗?(text 输出,没调 tool)"
  ↓
user: "是"
  ↓
[tool: delete X]
```

破坏性操作不要让 LLM 直接执行,**先输出 text 确认**,用户再次确认才调 tool。

---

## 十一、踩坑

1. **不写 description / 写得太短**——LLM 不知道怎么用,要么不调要么乱调
2. **input_schema 太松**——`type: string` 没 enum,LLM 填什么都对,业务校验失败
3. **不返回 `tool_result`**——只 `content` 写错误文字 LLM 还会试着继续推理;**正确是 `tool_result + is_error`**
4. **tool_use_id 对不上**——你执行时用 block.id,塞回去时用错变量,LLM 看不懂
5. **不并行**——Claude 一次发 5 个 tool_use,你顺序跑,慢 5 倍
6. **tool_choice 永远 auto**——抽数据场景应该 `any` 或 `tool`;你 auto 它会想跟你聊天
7. **没 max_iters**——Claude 决心不强时来回调工具能跑到 50+ 轮;**永远设上限**
8. **tool 输出不限制大小**——一个查数据库的 tool 返回 50K 文本,context 立刻爆;**让 tool 自己截断 / 分页**
9. **破坏性 tool 没 dry_run / 没 confirm**——LLM 调错就真删了
10. **tool 名字带空格 / 中文 / 特殊字符**——某些 SDK 会在 schema 校验时报错;**保持 `[a-z_]` 风格**

---

下一篇:`14-PromptCaching.md`——这一篇是 Anthropic API 性价比的灵魂。把 system / tools / 历史消息分层缓存,一个长 system prompt 重复用 100 次,**总成本能降到原本的 5%**。Claude Code 跑得起,Anthropic 自己打的样。
