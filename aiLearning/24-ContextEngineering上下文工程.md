# Context Engineering 上下文工程

LLM 是个无状态的函数:你给它什么,它就只能"看到"什么。它**不知道**你公司的代码库、你昨天聊了什么、用户的真实意图——它只能看到你这一次请求里塞进 Context Window 的那几万 token。**Context Engineering 就是研究"在有限的 Context Window 里,塞什么、怎么塞、怎么腾位置"这件事。** 它比 Prompt Engineering 更上一层:Prompt 是写一段话,Context 是设计整个输入的结构。

> 一句话先记住:**模型没有"知道",只有"看到"**。你以为它"忘了",其实是你没把那段塞进去;你以为它"懂业务",其实是你 system prompt 写得好。

---

## 一、Context 是 LLM 唯一能"看到"的

写过几个月 LLM 应用的人都遇到过这种事:

- 用户:"你刚才说的那个方案,再讲细点。"
- 模型:"抱歉,我不记得我说过什么。"

不是模型笨,是它**真的没看到**。LLM 的每一次推理都是一次独立的函数调用——`generate(prompt) -> response`,中间没有任何隐含状态。你以为的"对话",其实是你每次把整段历史拼起来重新发一遍。

所以**所有让模型"知道"的东西,本质都是 Context Engineering**:

| 你以为的           | 实际机制                                          |
| ------------------ | ------------------------------------------------- |
| 模型"记住"了我的名字 | 你把"用户叫张三"塞进了 system prompt 或 history     |
| 模型"懂"我的代码库  | RAG 把相关文件 chunk 检索出来塞进了 context        |
| 模型"调用"了工具    | 你把 tool schema 写在 tools 字段里,模型生成 JSON  |
| 模型"理解"业务规则  | 你在 system prompt 里把规则讲清楚了                |

> **结论很硬核**:模型的所有"能力",在应用层眼里都等价于"context 里塞了什么"。Context 是你**唯一的杠杆**。

---

## 二、Prompt Engineering vs Context Engineering

两个词经常被混用,其实不一样:

| 维度         | Prompt Engineering         | Context Engineering             |
| ------------ | -------------------------- | ------------------------------- |
| 关注粒度     | 一段话怎么写               | 整个输入的结构怎么设计           |
| 主要技巧     | 措辞、Few-shot、CoT        | 切片、检索、压缩、排版、缓存      |
| 典型问题     | "怎么让模型输出 JSON"       | "20 万 token 的代码库怎么塞进 200K context" |
| 优化目标     | 单次响应质量               | 多轮、长会话的整体可用性          |
| 工程含量     | 偏写作                     | 偏系统设计                       |

**5 年工程师的视角**:Prompt Engineering 是"写好一个函数",Context Engineering 是"设计整个数据流"。前者是局部技巧,后者是架构问题。做 demo 时只用 Prompt Engineering 够了,做产品时**不会 Context Engineering 一定翻车**。

---

## 三、Context 的几大来源

应用层一次 LLM 调用,context 通常由以下来源拼成:

| 来源                  | 作用                              | 谁来塞                 |
| --------------------- | --------------------------------- | ---------------------- |
| System Prompt         | 模型人设、规则、输出格式           | 应用开发者(写死或模板化) |
| User Message          | 当前一轮用户输入                  | 用户                   |
| Conversation History  | 之前几轮对话                      | 应用层从存储里拼接       |
| Tool Definitions      | 可调用工具的 schema(name + JSON Schema) | 开发者声明在 tools 字段  |
| Tool Result           | 上一轮工具调用的返回值             | 应用层执行后塞回         |
| Memory                | 跨会话的长期记忆(用户偏好、历史结论) | 应用层从外部存储拉取     |
| RAG / 知识库片段       | 与当前问题相关的文档片段           | 检索系统(向量库 + reranker) |
| 环境信息              | 当前时间、用户地区、平台等          | 系统注入                 |

一次典型的 Agent 调用,context 长这样:

```
[ system prompt: 角色 + 规则 ]      ← 几百 token
[ tool definitions: 5-20 个工具 ]   ← 1-3K token
[ memory: 用户长期偏好 ]            ← 几百 token
[ retrieved docs: 3-5 个文档片段 ]  ← 2-5K token
[ history: 最近 N 轮对话 ]          ← 几百到上万 token
[ user message: 当前提问 ]          ← 几十到几百 token
```

> **Anthropic Tool Use 的渲染顺序**(2026/05 当前规范): `tools` → `system` → `messages`。这个顺序直接影响 prompt cache 命中率——后面会讲。

---

## 四、Context 管理:截断、压缩、摘要、滚动窗口

Context Window 再大也是有限的。Claude Opus 4.7 已经是 1M token,但**你 1M 全用满了,延迟和成本也都炸了**。所以必须管理。

主流策略:

| 策略         | 做法                                          | 适用场景                  | 缺点                        |
| ------------ | --------------------------------------------- | ------------------------- | --------------------------- |
| 硬截断       | 超长就丢掉前面的若干轮                         | 简单聊天                  | 直接丢信息,模型会"失忆"     |
| 滚动窗口     | 永远只保留最近 N 轮                            | 客服、闲聊                | 早期上下文消失              |
| Summary 压缩 | 把旧的几轮压成一段摘要,新轮原文保留             | 长对话、研究助手           | 摘要本身有信息损失          |
| 分层保留     | 关键事实(用户名、目标)永久保留 + 近 N 轮原文 | 个人助手                  | 需要识别"什么是关键"         |
| 工具 result 清理 | 把已用过的旧 tool_result 清掉                | Agent 长循环              | 需要追踪哪些还会被用到       |

Anthropic 在 Opus 4.7 / 4.6 / Sonnet 4.6 上提供了**服务端 Compaction**(beta `compact-2026-01-12`):context 接近上限时,API 自动把早期上下文摘要成一个 `compaction` 块。应用层只需要把 `response.content` 整个 append 回 messages,API 下一次请求会用摘要替换被压缩的历史。

```python
import anthropic

client = anthropic.Anthropic()
messages = []

def chat(user_msg):
    messages.append({"role": "user", "content": user_msg})
    resp = client.beta.messages.create(
        betas=["compact-2026-01-12"],
        model="claude-opus-4-7",
        max_tokens=16000,
        messages=messages,
        context_management={"edits": [{"type": "compact_20260112"}]},
    )
    # 关键:append response.content,不是只 append text
    # compaction 块必须留下,API 下次请求要用它
    messages.append({"role": "assistant", "content": resp.content})
    return next(b.text for b in resp.content if b.type == "text")
```

> **踩过的坑**:很多人 append 的时候只取了 `block.text`,丢掉了 `compaction` 块,下一次请求 API 找不到"被压缩的历史在哪",直接报错或行为异常。**记住: append 整个 `response.content`**。

---

## 五、Context Window 之争:长上下文是否取代 RAG

2024 年,业界还在争"128K 够不够"。2026 年,Opus 4.7 / Sonnet 4.6 都是 1M token,Gemini 也有 1M+。一个老问题被反复拿出来:

> **既然 context 这么长了,RAG 是不是可以扔了?**

答案:**部分场景能扔,大部分场景不能**。理由很现实:

| 维度         | 长上下文(全塞)         | RAG(检索后塞)            |
| ------------ | ------------------------- | -------------------------- |
| 成本         | 每次都按 1M 计费,贵       | 只塞相关片段,便宜          |
| 延迟         | 处理 1M token 慢          | 处理 5K token 快            |
| 命中率       | "Lost in the middle":中间塞的容易被忽略 | 检索准了,结果集中,效果反而更好 |
| Cache 命中   | 1M 全塞,任何一字节变了全失效 | 只有 system + 公共片段稳定 |
| 数据量级     | < 1M token 才能塞         | 千万级文档随便检索          |

**5 年工程师的取舍**:

- **静态、单次任务**(读一个 100K 的 PDF 总结一下):直接全塞,简单粗暴。
- **长文档问答 / 知识库**(几百万文档):必须 RAG。
- **代码库**:中型(<300K)可以全塞 + 长上下文模型;大型必须 RAG + 文件系统工具(Claude Code 的玩法)。
- **多用户共享数据**:RAG。每个用户的 context 都不一样,缓存不了。

> **结论**:长上下文不是替代 RAG,是**让 RAG 的边界往前挪**。原本 8K 时代你要把文档切到 500 字,现在 1M 时代切到 1 万字,粗粒度检索就能用了。

---

## 六、Anthropic 的 Context Engineering 实践

Anthropic 的官方文档和 Claude Code 的实战代码里,有几个被反复强调的实践,值得照搬:

### 1. XML 标签结构化

Claude 系列模型对 XML 标签理解非常好。不要把所有信息糊成一坨,**用标签分块**:

```python
system_prompt = """你是一个代码审查助手。

<role>
你需要审查 Python 代码,找出潜在 bug、性能问题、风格问题。
</role>

<rules>
- 只指出真问题,不指出风格偏好
- 每条指出都给出具体行号
- 严重程度分 high / medium / low
</rules>

<output_format>
JSON,字段: issues[{ line, severity, description, suggestion }]
</output_format>
"""
```

这种结构比一段大白话清晰得多,模型也更容易遵守。

### 2. Few-shot Examples 放最后

如果你给模型示例,**放在 user message 紧挨着的位置**,不要扔到 system prompt 开头。模型对"最近看到的"权重更高:

```
[ system prompt: 角色 + 规则 ]
[ example 1 ]
[ example 2 ]
[ user: 真实输入 ]
```

### 3. 大段文档放前面,问题放最后

cache 命中和注意力分配的双重原因:

```
[ 100K 的代码文档 ]   ← 稳定,可以缓存
[ user: 帮我找 X 函数的调用方 ]   ← 变化的部分放最后
```

如果颠倒过来,问题在前文档在后,**每次问题不同就让 cache 全失效**。

### 4. Prompt Caching 利用稳定前缀

Anthropic 的 prompt caching 是**前缀匹配**:任何一字节变化都会让后面所有 cache 失效。所以设计 context 时:

| 位置 | 内容 | 稳定性 |
| --- | --- | --- |
| 最前 | tools(锁定排序) | 永远不变 |
| 中间 | system prompt | 偶尔改 |
| 后半 | 大文档、长 history | 一次会话内不变 |
| 最后 | 当前 user message | 每次都变 |

**踩过的坑**:在 system prompt 里放 `f"Current time: {datetime.now()}"` —— 每次时间不同,前缀就变了,**cache 永远命中不了**。要么把时间放到 user 段,要么干脆别加。

---

## 七、Tool Result 的塑形

Agent 跑起来后,模型会反复看 tool 的返回值。如果 tool result 是一坨 raw JSON 或者一长串 stack trace,模型很容易"看不懂"或者"看歪了"。

**塑形原则**:

| Tool Result 风格    | 模型友好度 | 备注                            |
| ------------------- | ---------- | ------------------------------- |
| 原始 JSON dump      | 低         | 字段太多,模型抓不到重点         |
| 关键字段 + 截断      | 高         | 比如只返回 top 10 + "still N more" |
| 自然语言摘要         | 中         | 简单任务可以,复杂任务会丢字段    |
| 结构化 + Markdown   | 高         | 清晰且模型容易抽取                |

举个例子,搜索工具返回 50 条结果,**不要全塞**:

```python
# 不好:全塞
tool_result = json.dumps([all_50_results])  # 30K token

# 好:精简 + 提示
tool_result = {
    "matches_count": 50,
    "shown": 10,
    "results": top_10_results,
    "note": "Showing top 10 of 50. Call again with filters if needed."
}
```

模型看到这种格式,反而更容易决策"要不要再 search 一次、要不要换关键词"。

> **5 年工程师的经验**:tool result 是 agent 里**信息密度最高、最容易爆 context** 的部分。每加一个 tool,先想想"它返回的东西需要塑形吗"。

---

## 八、给应用开发者的核心建议

放在一起的检查清单,落地时直接照着看:

### Context 设计层面

1. **算 token,别估**。任何一段 context,先用 `client.messages.count_tokens()` 数一下。1K 还是 10K,体感差不多但成本和延迟差 10 倍。
2. **稳定的放前面,变化的放后面**。这是 prompt caching 命中率的命门。
3. **别在 system prompt 里塞时间戳、UUID、随机 ID**。任何一个会变的东西扔到前缀里,cache 全废。
4. **大段文档用 XML 标签包起来**:`<doc title="X">...</doc>`,模型解析得更准。
5. **Few-shot 示例放在 user message 之前最近的位置**,不要扔在 system 顶部。

### Context 管理层面

6. **会话长了一定要管理**。要么压缩要么截断,别想着"反正 1M context 够"——延迟和成本不允许。
7. **用 Anthropic 的服务端 Compaction**(Opus 4.7 / 4.6, Sonnet 4.6)。append `response.content` 而不是 `response.text`。
8. **Tool result 必须塑形**。raw JSON 慎用,模型更喜欢"摘要 + 关键字段 + 提示"。
9. **Memory 不是把所有东西都塞进去**。只塞"以后还可能用到的事实",每加一条都要问"它 24 小时后还需要吗"。

### 调试层面

10. **打日志,把每次发给模型的完整 context dump 出来**。模型行为奇怪的时候,80% 的问题在你以为塞了但实际没塞,或者你以为没塞但实际塞了。
11. **响应里看 `usage.cache_read_input_tokens`**。如果连续相同前缀的请求里它一直是 0,有 silent invalidator(参考第六节的常见坑)。

---

## 九、伏笔:Context 是 Agent 设计的最大杠杆

Prompt Engineering 让你**写好一个 LLM 调用**,Context Engineering 让你**设计好一个会话**,而 Agent(自己规划+调用工具的循环)让 context 直接变成**动态生成的、每一轮都不同的东西**。

到了 Agent 阶段,context 的复杂度会再上一个量级:

- 第 1 轮:user message
- 第 2 轮:user + assistant + tool_use + tool_result
- 第 3 轮:再叠 tool_use + tool_result
- ...
- 第 20 轮:context 已经长达几万 token

每一轮都是上一轮 context 的延续。**Agent 设计好不好,80% 决定于 context 管理好不好**——超长循环里怎么压缩、tool result 怎么塑形、何时该 spawn subagent 把脏 context 隔离开,全是 Context Engineering 的具体应用。

下一篇:`25-Memory记忆系统.md`,讲跨会话的长期记忆——也是 Context Engineering 的延伸:**当 context window 装不下了,记忆该住到哪儿、怎么取出来塞回去**。
