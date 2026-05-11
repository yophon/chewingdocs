# Extended Thinking

OpenAI 的 o1 让"模型先深度思考再回答"成了主流。Anthropic 这边的对应特性叫 **Extended Thinking**(extended thinking,以下简称 thinking)。Claude 4.x 全系都支持——你给一个**思考预算**,它在生成最终答案前先在心里"草稿"一遍。复杂推理、多步规划、棘手 debug 场景下效果显著。

> 一句话先记住:**thinking 是给 Claude 的"草稿纸"**。budget_tokens 控制纸有多大,interleaved 控制能不能在工具调用之间继续打草稿。**简单任务别开,复杂任务加 budget,bug 难抓的时候 budget 翻倍**。

---

## 一、最小例子

```python
resp = client.messages.create(
    model="claude-sonnet-4-7",
    max_tokens=4096,
    thinking={
        "type": "enabled",
        "budget_tokens": 4000,
    },
    messages=[
        {"role": "user", "content": "证明 √2 是无理数。"}
    ],
)

# resp.content 现在有 thinking 块和 text 块
for block in resp.content:
    if block.type == "thinking":
        print("[think]", block.thinking[:200], "...")
    elif block.type == "text":
        print("[answer]", block.text)
```

**关键字段**:

- `thinking.type: "enabled"` —— 打开
- `thinking.budget_tokens` —— 思考最多用多少 token
- 返回 content 里出现 `thinking` 类型块,**和 text 块共存**

---

## 二、Budget 怎么定

| 任务 | budget 建议 |
| --- | --- |
| 简单问答 / 客服 | **不开** thinking |
| 中等推理(数学、逻辑) | 2000-4000 |
| 复杂规划(架构、多步任务) | 8000-16000 |
| 难 debug / 长链路推理 | 16000-32000 |
| 极端复杂(科研、复杂数学证明) | 32000+(Opus 上限可到 64000+) |

**budget 越大,越聪明,越慢,越贵**。

> 第一次开 thinking 选 4000 试,看效果不够就翻倍。**别一上来就给 32000**——大部分任务用不上,纯浪费。

---

## 三、Thinking 影响哪些参数

开了 thinking 后,有些参数行为变了:

- **max_tokens** 必须 ≥ budget_tokens + 期望最终回答长度。**给大点**,比如 budget 4000,max_tokens 给 8192
- **temperature** 默认 1,不需要改
- **stream**:thinking 部分会作为单独的 content_block 流出来

---

## 四、Streaming 下处理 thinking

```python
with client.messages.stream(
    model="claude-sonnet-4-7",
    max_tokens=8192,
    thinking={"type": "enabled", "budget_tokens": 4000},
    messages=[{"role": "user", "content": "..."}],
) as stream:
    current_type = None
    for event in stream:
        if event.type == "content_block_start":
            current_type = event.content_block.type
            if current_type == "thinking":
                print("\n[思考中...]", end="")
            elif current_type == "text":
                print("\n[回答]", end="")
        elif event.type == "content_block_delta":
            if event.delta.type == "thinking_delta":
                print(".", end="", flush=True)   # 不展示给用户具体内容
            elif event.delta.type == "text_delta":
                print(event.delta.text, end="", flush=True)
```

> 给真人用户的 UI **不展示 thinking 全文**,只显示进度条 / "思考中..."。Thinking 是**给模型的草稿**,展示完整内容用户大概率会困惑。

---

## 五、Interleaved Thinking with Tool Use

最强的用法:**让 Claude 在工具调用之间继续 think**。

```python
client.messages.create(
    model="claude-sonnet-4-7",
    max_tokens=8192,
    thinking={"type": "enabled", "budget_tokens": 8000},
    tools=[...],
    messages=messages,
    extra_headers={
        "anthropic-beta": "interleaved-thinking-2025-05-14"
    },
)
```

**含义**:Claude 调一个 tool 拿到结果,**在调下一个 tool 之前可以再 think 一段**。这对长链路 Agent 至关重要——不开 interleaved,Claude 看到 tool 结果只能立刻反应;开了,它可以"看完结果想想下一步该怎么办"。

```
user message
  ↓
[think]: "我需要先查 X"
  ↓
[tool_use]: search(...)
  ↓
[tool_result]: ...
  ↓
[think]: "结果不对头,改用 Y 查"     ← interleaved 才有这一步
  ↓
[tool_use]: search(...)
  ↓
...
```

> Coding Agent 启用这个 + 8K-16K budget,质量显著上一个台阶。

---

## 六、Thinking + Cache

Thinking 内容**不进 cache**。原因:thinking 是模型当下的"心智活动",每次都是新的。

但是:

- system prompt、tools、user message 仍然能 cache
- thinking 之后的 final text 不进 cache(本来就是输出)

**所以**:开 thinking 不影响你 cache 长 prompt 的策略——继续按 14 篇做。

---

## 七、什么场景**应该**开

| 场景 | 为什么 |
| --- | --- |
| 数学 / 逻辑题 | 直接答错率高,thinking 让它先验证 |
| 复杂代码改造的规划 | 多文件影响面、依赖、回滚都要想 |
| Debug 难复现 bug | 推理空间大 |
| 多步 Agent 决策 | 比"看到工具结果 → 立刻动" 强多了 |
| 复杂 schema 抽取 | 边界、缺字段、冲突,先想再抽 |
| 法律 / 财务 合规 | 看完文档要交叉验证 |

---

## 八、什么场景**不该**开

| 场景 | 为什么 |
| --- | --- |
| 简单问答 / FAQ | 没必要,慢、贵 |
| 客服闲聊 | thinking 会让用户等 3-5 秒,体验差 |
| 流式 UI 期望快速响应 | thinking 期间用户看不到 token 流 |
| 单步工具调用 | 例如"查天气",1 步搞定 |
| 写诗 / 创意 | 不是推理任务,thinking 帮不上 |

---

## 九、Thinking 与 Reasoning 模型(o1 / DeepSeek-R1)的差别

| 维度 | OpenAI o1 / DeepSeek R1 | Claude Extended Thinking |
| --- | --- | --- |
| 是不是单独模型 | **是**(o1 是独立模型) | **不是**(Claude 4 全系都支持) |
| budget 控制 | 有限(low / medium / high) | 精确字数 |
| 是否能看 thinking | o1 不能(隐藏)/ DeepSeek 能 | 能(返回 thinking 块) |
| 与 tools 配合 | o1 不能用 tools(2024 起步)/ 后期支持 | 一开始就 native 支持 + interleaved |
| 与 streaming 配合 | 受限 | 完整支持 |

**Claude 的 thinking 优势**:

- 可见(便于 debug)
- 可调(精确 budget)
- 与 tool / streaming 配合好

> 选模型时不需要"为了 reasoning 选 o1 或 R1"——Sonnet 4.7 + thinking 8K 是 2026 年最实用的"思考型 Coding Agent"。

---

## 十、监控:thinking 真的有用吗?

跑实验时同时记录:

```python
resp.usage.thinking_tokens   # 这次 thinking 用了多少
resp.usage.output_tokens     # 最终输出多少
```

**判断 thinking 是否值得**:

- 同一组任务,开 thinking vs 关 thinking,**答案准确率**差多少
- thinking 增加的成本(extra tokens * 价格)
- 用户感知延迟变化

**如果开了 thinking 准确率没显著提升**,关掉。**别为了"看起来更智能"开**。

---

## 十一、踩坑

1. **简单任务也开 thinking**——客服 FAQ 每条都思考 4000 token,成本 / 延迟翻 5 倍,对话质量没提升
2. **budget 设得太小**——给 500 想做难题,thinking 没想完就强制收尾,效果可能比不开还差
3. **max_tokens < budget + 答案长度**——budget 用完没空间写 final,**max_tokens 给 budget 的 1.5-2 倍**
4. **把 thinking 内容展示给真人用户**——80% 用户会困惑;**只展示进度,不展示草稿**
5. **不开 interleaved 用在 Agent 链路里**——多轮 tool 调用之间不能反思,质量一般;**Coding Agent 一定开 interleaved**
6. **thinking 进 cache(以为)**——cache 命中只能对前 messages,不会缓存 thinking 内容
7. **stream 下不处理 thinking event**——thinking_delta 不处理直接 print,用户看到一堆草稿
8. **生产没监控 thinking_tokens**——某月发现账单暴涨,定位不到是 thinking 用爆了
9. **thinking 用在不需推理的批量任务**——分类、抽取、翻译这些 thinking 帮不上,纯浪费
10. **不试就觉得"思考一定更好"**——很多任务 thinking 0 vs 4000 差异 < 5%;**A/B 测一下,数据说话**

---

下一篇:`16-FilesAPI与Citations.md`,讲文件上传 API、PDF / 长文本怎么处理、citations(让 Claude 给出"我引用了哪段")的用法、和 RAG 搭配。
