# Anthropic API 入门

到这里假设你已经会用 Claude Code。这一段(12-18 篇)收窄到一个不同的场景:**你自己写一个应用,把 Claude 当成"能力组件"用**。Claude Code 是别人写好的 Agent;**你自己写 Agent / RAG / 客服 / 合同审查 / 数据抽取**,直接面对的就是 Anthropic API。

> 一句话先记住:**Anthropic API 的核心是一个 Messages 接口** ——你传消息列表 + 工具,它返回下一条消息或工具调用。听起来简单,但 prompt caching、extended thinking、tool use 几个特性叠起来,这套 API 能撑起 Claude Code 这种复杂 Agent 的所有需求。

---

## 一、Hello World:最小调用

Python:

```bash
pip install anthropic
export ANTHROPIC_API_KEY=sk-ant-xxx
```

```python
from anthropic import Anthropic

client = Anthropic()

resp = client.messages.create(
    model="claude-sonnet-4-7",
    max_tokens=1024,
    messages=[{"role": "user", "content": "用一句话介绍 MCP 协议"}],
)

print(resp.content[0].text)
```

TypeScript:

```bash
npm i @anthropic-ai/sdk
```

```ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const resp = await client.messages.create({
  model: "claude-sonnet-4-7",
  max_tokens: 1024,
  messages: [{ role: "user", content: "用一句话介绍 MCP 协议" }],
});

console.log(resp.content[0].type === "text" ? resp.content[0].text : "");
```

> **就这么简单**。Anthropic SDK 在两种语言里设计几乎一致——剩下所有特性(caching、tools、thinking、citations)都是在这个 `messages.create` 上加字段。

---

## 二、模型矩阵(2026 年现状)

| 模型 | 强项 | 一句话 | 输入 / 输出价格(每百万 token,大致) |
| --- | --- | --- | --- |
| **claude-opus-4-7** | 最强推理,长任务 | 复杂代码、agent 长链路、架构 | $15 / $75 |
| **claude-sonnet-4-6** | 主力日用 | 90% 日常工作的甜蜜点 | $3 / $15 |
| **claude-sonnet-4-7** | 主力日用(带 1M context) | 大代码库 / 长文档,新 session 起步选它 | $3 / $15(>200K 部分稍贵) |
| **claude-haiku-4-5** | 快、便宜 | 批量分类、简单工具调用、轻 agent | $0.80 / $4 |

**怎么选**:

- 给真人用、要质量 → Sonnet 4.6 / 4.7(默认),难任务 Opus
- 后台批量、要量大 → Haiku
- 长上下文(>200K) → Sonnet 4.7(支持 1M)
- Agent 长链路、Coding Agent → Opus 或 Sonnet 4.7

> **别一律 Opus**——日常 90% 的活 Sonnet 性价比 5 倍以上。**先 Sonnet,效果不够再上 Opus**。

---

## 三、Messages API 核心字段

```python
client.messages.create(
    model="claude-sonnet-4-7",
    max_tokens=1024,
    system="你是一个简洁的助手,中文回答。",     # system prompt
    messages=[                                    # 对话历史
        {"role": "user", "content": "..."},
        {"role": "assistant", "content": "..."},
        {"role": "user", "content": "..."},
    ],
    temperature=0.7,
    top_p=0.95,
    stop_sequences=["</answer>"],
    stream=False,
    tools=[...],                                  # 工具定义,见 13 篇
    tool_choice={"type": "auto"},                 # auto / any / tool / none
    metadata={"user_id": "..."},
    thinking={"type": "enabled", "budget_tokens": 4000},  # 思考,见 15 篇
)
```

字段速览:

| 字段 | 用法 |
| --- | --- |
| `model` | 模型名 |
| `max_tokens` | 输出上限,**必填** |
| `system` | 系统 prompt;长的话拆成 list 配合 cache |
| `messages` | 对话历史,user / assistant 交替 |
| `temperature` | 0-1,创造性,默认 1;**Coding 类调到 0-0.3**,创意类 0.7-1 |
| `tools` | 工具列表(函数 schema) |
| `tool_choice` | LLM 是否、必须调工具 |
| `stream` | True 启用 SSE |
| `metadata.user_id` | 给 Anthropic 滥用检测用,生产建议传 |
| `thinking` | extended thinking,15 篇专讲 |

---

## 四、Streaming:边生成边收

生产几乎一律走 streaming——TTFB 低、用户体验好。

```python
with client.messages.stream(
    model="claude-sonnet-4-7",
    max_tokens=2048,
    messages=[{"role": "user", "content": "讲讲分布式锁的几种实现"}],
) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)

# 全部生成完想拿完整 response
final = stream.get_final_message()
```

TS:

```ts
const stream = await client.messages.stream({
  model: "claude-sonnet-4-7",
  max_tokens: 2048,
  messages: [{ role: "user", content: "..." }],
});

for await (const chunk of stream) {
  if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
    process.stdout.write(chunk.delta.text);
  }
}

const final = await stream.finalMessage();
```

> **Web 应用一律 streaming**——非 streaming 的体验是"等 5 秒,屏幕一闪出现一大段"。

---

## 五、多轮对话:你管 messages 数组

Anthropic API 是**无状态**的——服务器不记得你上一次发的什么。**对话历史完全在客户端**。

```python
history = []

def chat(user_input: str) -> str:
    history.append({"role": "user", "content": user_input})
    resp = client.messages.create(
        model="claude-sonnet-4-7",
        max_tokens=1024,
        messages=history,
    )
    text = resp.content[0].text
    history.append({"role": "assistant", "content": text})
    return text

print(chat("你好"))
print(chat("我刚才说了什么?"))   # 会答得出来,因为 history 里有
```

**所以**:

- 多轮对话需要你**自己存 messages**(redis / db / memory)
- 每轮都把整个 history 发回去
- 配合 prompt caching(下下篇)避免每轮都付全 history 的钱

---

## 六、System Prompt:一段还是一组?

最简单写法:

```python
system="你是 X 助手,要 Y。"
```

但生产里**经常拆成 list**:

```python
system=[
    {
        "type": "text",
        "text": "你是 X 助手,要 Y。",  # 短的、稳定的
    },
    {
        "type": "text",
        "text": LONG_BACKGROUND_DOC,    # 几千 token 的背景资料
        "cache_control": {"type": "ephemeral"},  # 走 cache
    },
]
```

为什么?**因为你想给"长的、稳定的"那段加 prompt caching**——下次同一段背景资料只付 10% 的钱。第 14 篇专讲。

> 写应用第一天就要分开"短的指令"和"长的背景资料",**单独缓存长的**,这是 Anthropic API 用得划算的关键习惯。

---

## 七、错误处理与重试

```python
from anthropic import APIError, RateLimitError, APIStatusError
import time

def call_with_retry(messages, max_retry=3):
    for i in range(max_retry):
        try:
            return client.messages.create(
                model="claude-sonnet-4-7",
                max_tokens=1024,
                messages=messages,
            )
        except RateLimitError:
            wait = 2 ** i
            print(f"rate limit, sleep {wait}s")
            time.sleep(wait)
        except APIStatusError as e:
            if e.status_code >= 500:
                time.sleep(2 ** i)
                continue
            raise
    raise RuntimeError("max retry exceeded")
```

**生产建议**:

- 用 SDK 自带的 retry(`max_retries=3` 在 client 构造时传)
- 5xx / RateLimitError 重试,4xx 不重试
- 重要请求加幂等键,避免重复执行

---

## 八、Token 计数与成本预估

Tokens API 让你不发请求就能数 token:

```python
count = client.messages.count_tokens(
    model="claude-sonnet-4-7",
    messages=[{"role": "user", "content": LONG_TEXT}],
)
print(count.input_tokens)
```

**用处**:

- 估算成本(决定要不要发)
- 截断长文本(超 context 窗就主动截)
- 控制系统行为(N 个 token 走 Sonnet,M 个 token 走 Haiku)

---

## 九、走 Bedrock / Vertex / 自部署

不直连 Anthropic 的几种姿势:

| 部署方式 | 一句话 | 改什么 |
| --- | --- | --- |
| AWS Bedrock | 走 AWS 鉴权,合规 | `from anthropic import AnthropicBedrock` |
| GCP Vertex AI | 走 GCP | `AnthropicVertex` |
| 自部署 / 代理 | 自己加 gateway | 改 `base_url` |

```python
from anthropic import AnthropicBedrock

client = AnthropicBedrock(aws_region="us-east-1")
# 后面 messages.create(...) 用法一样
```

> 大厂走 Bedrock / Vertex 而不是直连——合规、计费走云、数据不出云。**SDK 接口完全相同**,业务代码无需改。

---

## 十、Prompt Caching 的 5 秒预告

第 14 篇会展开,这里**只讲一条结论**:

> **任何长 prompt(系统提示、背景文档、tool schema、长对话历史)都该开 prompt caching。**

带 cache 的请求,缓存命中部分**只付 10% 价钱**,且**延迟低很多**。Anthropic 自家的 Claude Code 重度依赖 prompt caching——**没有它你账单会非常痛**。

---

## 十一、批量任务:Batch API 的 5 秒预告

第 18 篇会展开:**非实时的批量任务用 Batch API,价格五折**。

适合:

- 离线分析几万条 tickets
- 批量翻译
- 大规模数据抽取
- 文档批量打标

不适合:

- 用户对话(异步太慢)

---

## 十二、最小聊天程序(可直接跑)

把上面所有概念组合一下,一个 50 行能用的 CLI 聊天程序:

```python
import os
from anthropic import Anthropic

client = Anthropic()

history = []
SYSTEM = [
    {"type": "text", "text": "你是简洁的中文助手,有用、不啰嗦。"},
]

def chat(user_input: str):
    history.append({"role": "user", "content": user_input})
    with client.messages.stream(
        model="claude-sonnet-4-7",
        max_tokens=2048,
        system=SYSTEM,
        messages=history,
    ) as stream:
        text = ""
        for chunk in stream.text_stream:
            print(chunk, end="", flush=True)
            text += chunk
        print()
        history.append({"role": "assistant", "content": text})

if __name__ == "__main__":
    print("Anthropic CLI Chat. /quit 退出。")
    while True:
        try:
            line = input("you> ").strip()
        except EOFError:
            break
        if not line: continue
        if line == "/quit": break
        chat(line)
```

跑一下:

```
$ python chat.py
you> 你好
你好。
you> 给我讲讲 prompt caching
prompt caching 是 Anthropic API 的特性...
```

> **从这个程序起步,加 tool / cache / streaming UI 就长成你自己的应用**。

---

## 十三、踩坑

1. **不传 `max_tokens`**——会直接报错;**它是必填**
2. **system 写成 user message**——历史里 user 第一条就讲规则,LLM 会被 context 弄混;**system 进 `system=` 字段**
3. **每轮发完整 history 不开 cache**——账单蹭蹭涨;**14 篇一定要看**
4. **temperature 不调**——Coding 任务 1.0 太散,改 0-0.3;创意任务 0 太死板,改 0.7-1
5. **没处理 streaming 中断**——网络断了 history 没补上 assistant 的回复;**保存 final message 之前不要写 history**
6. **拿 `resp.content[0].text` 默认是 text**——但有 tool_use 时这个 index 不一定是 text;**正确做法是遍历 content 块按 type 处理**
7. **不计 token 提交超 context 窗的请求**——直接 400;**长任务要 count_tokens 预检**
8. **生产没 metadata.user_id**——出滥用 Anthropic 找不到归属;**多用户应用一定要传**
9. **API key 进代码 / git**——基础错误。**走 env / secrets manager**
10. **不区分 Sonnet 和 Opus 用同一份代码**——某些参数(thinking budget、max_tokens 上限)模型间略有差异;**生产要按模型分配置**

---

下一篇:`13-ToolUse实战.md`,讲怎么定义 tool schema、parallel tool use、tool_choice、tool_result 怎么回填到 messages、复杂工具的递归调用 loop。
