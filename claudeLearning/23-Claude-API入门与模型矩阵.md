# Claude API 入门与模型矩阵

前三层讲的都是"用 Claude Code"。从这一篇开始换一个视角:**把 Claude 当作一个能力组件,写进你自己的产品**——客服机器人、文档问答、代码审查服务、数据抽取流水线。这些都通过 Claude API 实现。

API 的核心只有一个接口:`POST /v1/messages`。工具调用、结构化输出、思考、缓存、引用……都是这个接口上的参数,不是单独的 API。

> 一句话先记住:**API 是无状态的,每次请求都要带上完整的对话**。你管理消息数组,API 只负责"给定这些消息,生成下一条"。另外要特别小心:2025-2026 年 API 变化很大,网上很多示例(甚至你记忆里的写法)在新模型上会直接报 400。这一篇最后附了一张"旧写法 → 新写法"对照表。

---

## 一、Hello World

```bash
pip install anthropic
```

```python
import anthropic

client = anthropic.Anthropic()   # 从环境里读凭证,不要把 key 写死在代码里

response = client.messages.create(
    model="claude-opus-5-5",
    max_tokens=16000,
    messages=[{"role": "user", "content": "用一句话解释什么是幂等"}],
)

# content 是一个内容块列表(text、thinking、tool_use……),先判断类型再取值
for block in response.content:
    if block.type == "text":
        print(block.text)
```

Python SDK 现在是 **1.x**,底层 HTTP 库换成了 `httpx2`(不是 `httpx`)。从 0.x 升级时,自定义 HTTP 客户端、超时对象这类代码要跟着改。

---

## 二、模型矩阵(2026 年 10 月)

| 模型 | ID | 上下文 | 最大输出 | 输入 / 输出(每百万 token) |
| --- | --- | --- | --- | --- |
| **Claude Fable 5.1** | `claude-fable-5-1` | 1M | 128K | $10 / $50 |
| Claude Fable 5 | `claude-fable-5` | 1M | 128K | $10 / $50 |
| **Claude Opus 5.5** | `claude-opus-5-5` | 1M | 128K | **$4 / $20** |
| Claude Opus 5 | `claude-opus-5` | 1M | 128K | $5 / $25 |
| Claude Opus 4.8 | `claude-opus-4-8` | 1M | 128K | $5 / $25 |
| **Claude Sonnet 5.5** | `claude-sonnet-5-5` | 1M | 128K | $2 / $10 |
| Claude Sonnet 5 | `claude-sonnet-5` | 1M | 128K | $2 / $10 |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | 1M | 128K | $3 / $15 |
| **Claude Haiku 5.5** | `claude-haiku-5-5` | 1M | 128K | $0.10 / $0.50(超过 10 万 token 的 prompt 为 $0.50 / $2.50) |
| Claude Haiku 4.5 | `claude-haiku-4-5` | 200K | 64K | $1 / $5 |

还在服务的旧型号有 Opus 4.7、Opus 4.6、Opus 4.5、Sonnet 4.5 等;Sonnet 3.7、Haiku 3.5、Opus 3 及更早的已经退役。

### 2.1 怎么选

| 模型 | 定位 |
| --- | --- |
| **Opus 5.5** | **默认选择**。长时间运行的 agent 编码和知识工作,比 Opus 5 更便宜 |
| **Fable 5.1** | 最强的公开模型,用于最难的推理和超长周期的 agent 任务。单价最高,API 行为和 Opus 系列有差异 |
| **Sonnet 5.5** | 日常编码、agent 和企业工作的速度与能力平衡 |
| **Haiku 5.5** | 高吞吐、低延迟:分类、路由、抽取、作为子 agent 干杂活 |

**model ID 要写完整、准确**:`claude-opus-5-5` 就是完整 ID,不要自己拼日期后缀。拼错的 ID 直接报错。

### 2.2 用 Models API 查实时能力

上面的表会过时,上下文窗口、最大输出、支持哪些特性,以 API 返回的为准:

```python
m = client.models.retrieve("claude-opus-5-5")
print(m.max_input_tokens, m.max_tokens)
print(m.capabilities["thinking"]["types"]["adaptive"]["supported"])

# 筛选所有支持 adaptive thinking 且上下文 >= 200K 的模型
[m.id for m in client.models.list()
 if m.capabilities["thinking"]["types"]["adaptive"]["supported"]
 and m.max_input_tokens >= 200_000]
```

---

## 三、认证

SDK 按这个顺序查找凭证,找到第一个就用:

```
ANTHROPIC_API_KEY  →  ANTHROPIC_AUTH_TOKEN  →  ant CLI 登录的 profile
  →  工作负载身份联邦(WIF)环境变量  →  磁盘上的默认 profile
```

- 本地开发最省事的方式是装 Anthropic 官方 CLI `ant`,跑 `ant auth login`,之后 `anthropic.Anthropic()` 不带参数就能用
- 生产环境用 API key(环境变量注入)或 WIF(让云上的工作负载用自己的身份换取短期令牌,不存长期密钥)
- **永远不要把 key 写进代码或提交进仓库**

---

## 四、请求的核心字段

| 字段 | 说明 |
| --- | --- |
| `model` | 模型 ID |
| `max_tokens` | 本次输出上限。**别设太小**:非流式建议约 16000,流式约 64000;触顶会截断输出 |
| `messages` | 对话数组,第一条必须是 `user` |
| `system` | 系统提示,字符串或内容块数组(带缓存标记时用数组) |
| `thinking` | 思考配置,新模型用 `{"type": "adaptive"}` 或干脆不传(26 篇) |
| `output_config` | `effort` 等级、结构化输出的 `format` |
| `tools` / `tool_choice` | 工具定义和调用策略(24 篇) |
| `stop_sequences` | 遇到这些字符串就停止 |

**新模型上已经不能用的东西**:

- **采样参数**(`temperature`、`top_p`、`top_k`):Opus 4.7 及以后、Fable、Sonnet 5 上传了就 400;Sonnet 5.5、Haiku 5.5 上只接受默认值
- **assistant 预填充**(把最后一条消息写成 assistant 开头,引导输出格式):4.6 及以后的模型全部 400。要控制格式,用结构化输出或在系统提示里说明
- **强制工具调用**(`tool_choice` 为 `any` 或指定工具):Fable 5.1、Opus 5.5、Sonnet 5.5 上 400

---

## 五、流式输出

长输出、高 `max_tokens`、需要实时展示的场景都应该用流式,否则容易撞上 HTTP 超时:

```python
with client.messages.stream(
    model="claude-opus-5-5",
    max_tokens=64000,
    messages=[{"role": "user", "content": "写一篇关于缓存失效的技术博客"}],
) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)

    final = stream.get_final_message()   # 拿到完整的 Message 对象
```

**要用到 128K 这种大输出,SDK 要求必须流式**。不需要逐字展示、只是想避免超时,也可以用 `stream()` + `get_final_message()`。

需要区分思考和正文时,遍历事件:

```python
with client.messages.stream(
    model="claude-opus-5-5",
    max_tokens=64000,
    thinking={"type": "adaptive", "display": "summarized"},
    messages=[{"role": "user", "content": "分析这个问题"}],
) as stream:
    for event in stream:
        if event.type == "content_block_delta":
            if event.delta.type == "thinking_delta":
                print(event.delta.thinking, end="")
            elif event.delta.type == "text_delta":
                print(event.delta.text, end="")
```

---

## 六、多轮对话

API 不记得上一轮,你要自己维护消息数组:

```python
messages = []

def chat(user_text: str) -> str:
    messages.append({"role": "user", "content": user_text})
    response = client.messages.create(
        model="claude-opus-5-5",
        max_tokens=16000,
        system="你是一个简洁的技术助手。",
        messages=messages,
    )
    # 把完整的 content 追加回去,而不只是文字——思考块、工具调用块后续都要用
    messages.append({"role": "assistant", "content": response.content})
    return next((b.text for b in response.content if b.type == "text"), "")
```

几条规则:

- 第一条消息必须是 `user`;连续同角色的消息会被合并成一轮
- **新模型的思考块要原样传回**,不要删改历史里的内容(26 篇细讲)
- 对话中途要追加运维指令(比如"切换到简洁模式"),在支持的模型上可以往 `messages` 里加一条 `{"role": "system", ...}`,而不是改顶层 `system`——这样不会让缓存失效(25 篇)

---

## 七、stop_reason:它为什么停了

| 值 | 含义 | 你该做什么 |
| --- | --- | --- |
| `end_turn` | 自然结束 | 正常处理 |
| `max_tokens` | 撞到 `max_tokens` 上限 | 调大,或改用流式 |
| `stop_sequence` | 遇到了你设的停止序列 | 正常处理 |
| `tool_use` | 要调用工具 | 执行工具,把结果发回去继续(24 篇) |
| `pause_turn` | 服务端工具执行中暂停 | 原样把响应发回去让它继续 |
| `refusal` | 安全分类器拒绝 | 看 `stop_details`,考虑回退 |

**读 `content` 之前先看 `stop_reason`**。

### 7.1 拒绝与回退

Fable、Opus 5.5、Opus 5、Sonnet 5.5 带安全分类器,网络安全、生物等类别的请求可能被拒绝(HTTP 200,`stop_reason` 为 `refusal`):

```python
if response.stop_reason == "refusal" and response.stop_details:
    print(response.stop_details.category)      # 例如 "cyber"、"bio"
    print(response.stop_details.explanation)
```

可以开启**服务端回退**:被拒绝时,API 在同一次调用里自动换一个模型重跑:

```python
response = client.beta.messages.create(
    model="claude-opus-5-5",
    max_tokens=16000,
    betas=["server-side-fallback-2026-07-01"],
    fallbacks="default",          # 按拒绝类别自动路由到合适的模型,不用自己维护列表
    messages=[{"role": "user", "content": "..."}],
)
```

回退模型本身也可能拒绝,最终 `stop_reason` 仍是 `refusal` 时说明整条链都拒绝了。Batches API 不支持这个参数;Bedrock、Vertex、Foundry 上用 SDK 提供的客户端回退中间件。

---

## 八、错误处理与重试

**SDK 默认会自动重试**连接错误和 408、409、429、5xx(默认 2 次,指数退避),一般不用自己写重试。错误处理要分层,不要用一个宽泛的异常吞掉所有错误:

```python
try:
    response = client.messages.create(...)
except anthropic.BadRequestError as e:          # 400:参数错误,别重试,改代码
    log.error("bad request: %s", e.message)
except anthropic.AuthenticationError:           # 401
    ...
except anthropic.NotFoundError:                 # 404:模型 ID 写错了
    ...
except anthropic.RateLimitError as e:           # 429:按 retry-after 等待
    wait = int(e.response.headers.get("retry-after", "60"))
except anthropic.APIStatusError as e:           # 其他状态码,>=500 可以稍后重试
    ...
except anthropic.APIConnectionError:            # 网络问题
    ...
```

几个实用点:

- 默认超时 10 分钟;`client.with_options(timeout=5.0, max_retries=5)` 可以单次覆盖
- 每个响应都有 `response._request_id`,**报问题时附上它**
- 超时也会重试,所以最坏情况下的总耗时是 `timeout × (max_retries + 1)`

---

## 九、Token 计数与成本预估

```python
count = client.messages.count_tokens(
    model="claude-opus-5-5",
    system=system,
    messages=messages,
)
print(count.input_tokens)
```

不要用第三方分词库估算——不同代模型的分词器不同。从 Opus 4.6、Sonnet、Haiku 或更早的模型迁移到 Opus 4.7 及以后的模型时,**同样的文本 token 数可能多出 0% 到 35%**,迁移前用 `count_tokens` 重新测一遍预算。

---

## 十、在云平台上调用

| 平台 | 运营方 | 特点 | Python 客户端 |
| --- | --- | --- | --- |
| **Claude Platform on AWS** | Anthropic | 和 Claude API **同日同步**新功能;SigV4 认证、IAM 权限、AWS Marketplace 计费 | `AnthropicAWS()` |
| **Amazon Bedrock** | AWS | 功能是子集,发布节奏不同;模型 ID 带 `anthropic.` 前缀;用 Mantle 客户端 | `AnthropicBedrockMantle(aws_region=...)` |
| **Google Cloud Vertex AI** | Google | 用 GCP 凭证,不需要 Anthropic key;region 推荐 `"global"` | `AnthropicVertex(project_id=..., region=...)` |
| **Microsoft Foundry** | Microsoft | 按标准 API 价格通过 Microsoft Marketplace 计费 | `AnthropicFoundry(...)` |

构造好客户端之后,用法和第一方 SDK 一样(`messages.create` / `stream`)。**不同平台支持的特性不一样**(比如 fast mode、Managed Agents、某些服务端工具只在 Claude API 上有),上线前查清楚目标平台的功能支持表。不要用第一方客户端加 `base_url` 去连这些平台。

---

## 十一、API 版本

每个请求都带一个 `anthropic-version` 请求头,SDK 会自动设置。长期以来它是 `2023-06-01`:在同一个版本内,已有的输入输出参数保持不变,新功能以可选参数、新增字段的形式加入,新特性通过 `betas`(`anthropic-beta` 头)按需开启。2026 年 10 月 Claude Code 新增了 `/claude-api api-version` 子命令,用于把代码迁移到新的 API 版本 `2026-10-21`——这是刚刚发布的变化,具体差异以官方版本说明为准。

---

## 十二、旧写法 → 新写法对照

网上大量示例和教程是基于旧模型写的,在新模型上会报错:

| 场景 | 旧写法 | 现在 |
| --- | --- | --- |
| 开启思考 | `thinking={"type": "enabled", "budget_tokens": N}` | `thinking={"type": "adaptive"}` 或不传,用 `output_config.effort` 控制深度;新模型上 `budget_tokens` 直接 400 |
| 关闭思考 | `thinking={"type": "disabled"}` | Opus 5.5、Fable、Sonnet 5.5 上 400;降低 effort 代替 |
| 结构化输出 | `output_format=...` | `output_config={"format": ...}`,推荐 `client.messages.parse()` |
| 控制输出格式 | assistant 预填充 | 结构化输出或系统提示;预填充在 4.6+ 上 400 |
| 强制调用工具 | `tool_choice={"type": "any"}` | 新模型上 400;用 `auto` + 提示词 + `strict: true` |
| 采样参数 | `temperature=0.2` | 新模型上 400 或只接受默认值 |
| Files / Skills API | `client.beta.files`,带 beta 头 | 已转正:`client.files`、`client.skills`,不需要 beta 头 |
| 网页搜索工具 | `web_search_20250305` | 新模型用 `web_search_20260209`(带动态过滤) |

> 拿到一段旧代码要迁移到新模型,在 Claude Code 里可以用内置的 `/claude-api migrate`,它会按目标模型逐项处理这些破坏性变化。

---

## 十三、踩坑

1. **凭感觉写 model ID**——拼错或加了日期后缀直接 404,只用官方列出的 ID
2. **`max_tokens` 设得很小**——输出被截断。非流式约 16000,流式约 64000
3. **大输出不用流式**——撞 HTTP 超时;128K 输出必须流式
4. **只把 `text` 追加回历史**——思考块、工具调用块丢了,后续请求出错。追加完整的 `content`
5. **照抄旧教程的 `budget_tokens`、`temperature`、预填充**——新模型上 400
6. **不检查 `stop_reason` 直接读 `content`**——拒绝和截断时拿到的不是你以为的结果
7. **自己写一套重试,再叠加 SDK 的重试**——重试次数翻倍。SDK 默认已经重试
8. **一个 `except Exception` 吞掉所有错误**——400 和 429 的处理方式完全不同
9. **用分词库估算 token**——用 `count_tokens`,新旧模型分词器不同
10. **在 Bedrock / Vertex 上假设功能和 Claude API 一致**——先查平台功能支持表

---

下一篇:`24-Tool-Use与结构化输出.md`,讲工具定义的写法、手写工具循环和 SDK 的 Tool Runner、并行工具调用、`strict` 严格模式,以及用 `output_config.format` 拿到保证符合 schema 的 JSON。
