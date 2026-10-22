# Adaptive Thinking 与 Effort

旧版本系列里这一篇叫"Extended Thinking",讲的是用 `budget_tokens` 给模型一个固定的思考预算。这套写法在 2026 年的新模型上已经**直接报 400**。现在的模型用 **adaptive thinking**:由模型自己判断每一步要不要想、想多少;你用 **effort** 这一个旋钮控制整体的深度和花费。

> 一句话先记住:**新模型上不要再写 `budget_tokens`,也不要想着关掉思考**。要它想得少一点、快一点、便宜一点,就降低 effort;要它更彻底,就提高 effort。另外,**思考块要原样传回,对话历史只追加、不修改**——这是新模型最容易踩的坑。

---

## 一、从 budget_tokens 到 adaptive

```python
# 旧写法:在新模型上 400
thinking={"type": "enabled", "budget_tokens": 10000}

# 新写法
response = client.messages.create(
    model="claude-opus-5-5",
    max_tokens=16000,
    thinking={"type": "adaptive"},              # 在 Opus 5.5 上也可以干脆不传
    output_config={"effort": "high"},           # low | medium | high | xhigh | max
    messages=[{"role": "user", "content": "一步步分析这个并发 bug……"}],
)
```

`effort` 写在 `output_config` 里,**不是**顶层参数。

### 1.1 各模型的规则

| 模型 | 思考 | 不传 `thinking` 时 | `budget_tokens` | 采样参数 | effort 默认 |
| --- | --- | --- | --- | --- | --- |
| Fable 5 / 5.1 | 始终开启,`disabled` 报 400 | adaptive | 400 | 400 | high |
| **Opus 5.5** | **始终开启**,任何 effort 下 `disabled` 都 400 | adaptive | 400 | 400 | **medium** |
| Opus 5 | 默认开启;`disabled` 只能在 high 及以下 | adaptive | 400 | 400 | high |
| Opus 4.8 / 4.7 | 只有 adaptive 一种开启方式;可以 `disabled` | **不思考**,要显式开 | 400 | 400 | high(4.7 为 xhigh) |
| **Sonnet 5.5** | `disabled` 报 400;要关就用 `{"type": "between_tools"}` | adaptive | 400 | 只能默认值 | high |
| Sonnet 5 | adaptive;可以 `disabled` | adaptive | 400 | 400 | high |
| **Haiku 5.5** | adaptive,默认开启;`disabled` 只能在 high 及以下 | adaptive | 400 | 只能默认值 | **medium** |
| Opus 4.6 / Sonnet 4.6 | 推荐 adaptive | 要显式开 | 已弃用,仍可用 | 可用 | high |
| Haiku 4.5 及更早 | `{"type": "enabled", "budget_tokens": N}` | 不思考 | 必需 | 可用 | 不支持 effort |

两个最容易忽略的默认值变化:

- **Opus 5.5 和 Haiku 5.5 的默认 effort 是 `medium`**,比上一代低一级。不显式设置,行为会和你从 Opus 5 迁移过来时预期的不一样
- **Opus 4.8 / 4.7 不传 `thinking` 时完全不思考**,而 Opus 5 及以后不传时默认 adaptive

---

## 二、effort:唯一的主旋钮

### 2.1 各等级

| 等级 | 适合 |
| --- | --- |
| `low` | 聊天、分类、高吞吐或对延迟敏感的路由;子 agent 干简单的活 |
| `medium` | Opus 5.5 的默认;范围清晰的日常工程工作。也是在质量能保住时的省钱档 |
| `high` | 需要验证、边界情况多的工作;对智能要求高的任务至少用这一档 |
| `xhigh` | 更深的推理;Opus 4.7 / 4.8、Fable 5 等模型上编码和 agent 任务的推荐档 |
| `max` | 正确性比成本更重要的难题。可能收益递减,先测再推广 |

effort 不只影响"想多久":**低 effort 意味着更少、更集中的工具调用,更少的开场白,更简短的确认**。

### 2.2 怎么定

- **按任务类型调,不要全局一刀切**:编码和长周期 agent 任务对 effort 很敏感;聊天、分类、高吞吐路由往往 `low` 就够
- **先测量再提高默认值**:在一批真实请求上比较不同等级的质量和成本
- **同一个等级名在不同模型上不等价**,迁移模型时要重新扫一遍 effort
- **在做"多模型级联"之前,先试试"最强模型 + 低 effort"**:新模型的低 effort 往往不输上一代的高 effort,而且只用一个模型意味着只有一个缓存命名空间
- **按"完成一个任务的总成本"衡量**,不是按单次请求:一个更便宜的请求如果需要更多轮或重试才能完成,其实不便宜

### 2.3 对话中途改 effort

直接改顶层的 `output_config.effort` 会让消息缓存失效。在支持的新模型(Fable 5.1、Opus 5.5、Opus 5、Sonnet 5.5、Haiku 5.5)上,可以用一条只带 `output_config` 的 system 消息在对话中途改 effort,不破坏缓存(beta `mid-conversation-output-config-2026-07-01`)。

---

## 三、思考内容怎么显示

`thinking.display` 控制你**看得到**什么,不影响模型实际想了多少、计费多少:

| 值 | 效果 |
| --- | --- |
| `"omitted"` | **新模型的默认值**:思考块照常返回,但文字为空 |
| `"summarized"` | 返回思考过程的可读摘要 |
| `"updates"` | 隐藏推理过程,但把模型在工具调用之间写的进度说明作为简短摘要返回(beta `thinking-display-updates-2026-08-18`) |

```python
thinking={"type": "adaptive", "display": "summarized"}
```

> **流式展示思考时一定要显式设 `summarized`**。默认是 `omitted`,用户看到的会是一段很长的停顿,然后才出现正文。**任何模型都不会返回原始的思维链**,能拿到的只是摘要。

Opus 5.5 和 Fable 5.1 上,模型在工具调用之间写的较长说明(刚发现了什么、下一步做什么)会以进度更新的形式出现在思考块里,而不是 `text` 块。需要给用户看,就用 `display: "updates"`;需要它在长任务中途把某段内容**原样**交给用户(一段代码、一个确切的值),给它一个"发消息给用户"的工具,并说明只用于这类内容。

---

## 四、思考块要原样传回

### 4.1 规则

多轮对话、特别是工具循环里,**把 assistant 的完整 `content` 追加回历史,包括思考块,不做任何修改**。

```python
messages.append({"role": "assistant", "content": response.content})   # 完整追加
```

### 4.2 思考块绑定了模型和对话(preserved thinking)

新模型的思考块带有签名,签名记录了**是哪个模型产生的**,以及**产生它时的对话前缀**(system、tools、之前的所有消息)。由此有两条规则:

**规则一:绑定模型**。一个模型读不懂另一个模型的思考块时,API 会**静默丢弃**它(不计费)。所以切换模型、走回退时,照样把思考块传回去就行——不需要也不应该自己删,自己删反而可能触发顺序或签名错误。

**规则二:绑定对话**。在 Fable 5.1、Opus 5.5、Sonnet 5.5 等模型上,**修改历史会让之后所有的思考块失效**。会触发失效的操作:

- 编辑、重排、删除较早的轮次,同时保留后面的轮次(包括删除旧的工具结果——要用服务端的工具结果清理功能)
- 往较早的轮次里注入每次请求都不同的文字(提醒、状态行、token 计数),下次请求又删掉或重建
- 同一对话中途重建顶层的 `system` 或 `tools`
- 早期轮次里的图片或文档 URL 在后续请求时返回了不同的内容

不会失效的:**只追加的历史**——包括追加 `role: "system"` 消息、留在原处的本轮临时提醒、从最旧开始按顺序移除开头的一串思考块。

### 4.3 违反时会怎样

在强制执行这条规则的账号上(2026-08-31 及以后创建的账号默认强制),带着失效思考块的请求**直接 400**,错误信息会指出是哪条消息的签名对不上。处理方式:

1. **把历史里所有思考块去掉再重试**(保留 text 和 tool_use 块)——这一轮会在没有之前推理的情况下回答
2. **让 API 丢弃而不是报错**:开启 beta `thinking-binding-controls-2026-08-01`,设 `thinking.block_binding.prefix_mismatch_behavior: "drop_block"`,响应里的 `input_transformations` 会告诉你丢了哪些

> 根本的解决办法是**把你的 harness 改成只追加**:system 在会话开始时冻结,中途的指令用追加的 system 消息;工具在开始时全部声明(用 `defer_loading` 隐藏暂不用的),中途增删用专门的块;每轮提醒用 `clear_at` 的临时 system 消息,留在原处不要删。这和 25 篇"保持缓存命中"的要求是同一套做法。

---

## 五、Sonnet 5.5 的 `between_tools`

Sonnet 5.5 上 `disabled` 会报 400。确实需要"不思考"的路由:

```python
thinking={"type": "between_tools"}    # 只在 effort 为 high 及以下时可用
```

它不能和 `display`、`budget_tokens` 等字段同时出现,也不支持对话中途改 effort。**大多数情况下,先试 `low` effort**,它通常已经足够快和便宜。

---

## 六、Task budget:给整个 agent 循环一个预算

`max_tokens` 是单次响应的硬上限,**模型自己并不知道**;被它截断时,输出直接断在半截。**task budget** 则是告诉模型"整个任务(思考 + 工具调用 + 最终输出)你大约有多少 token",模型能看到一个倒计时,据此安排工作、在预算用完前体面地收尾:

```python
with client.beta.messages.stream(
    model="claude-opus-5-5",
    max_tokens=128000,
    output_config={
        "effort": "high",
        "task_budget": {"type": "tokens", "total": 64000},
    },
    betas=["task-budgets-2026-03-13"],
    messages=messages,
    tools=tools,
) as stream:
    response = stream.get_final_message()
```

- **最小 20,000 token**
- 它是**建议性的**,不是硬上限;太紧的预算会让任务完成得不够彻底
- 预算统计的是模型这一轮生成的内容和读到的工具结果,**不是**你每次重发的完整历史
- 一般不用自己传 `remaining`,服务端会自己追踪;只有你压缩或改写了历史、服务端无法推算已用量时才传
- 和 Managed Agents 的会话预算(按美元计、平台强制执行的硬上限)是两回事

---

## 七、关闭思考的两个失败模式

在仍然允许关闭思考的模型(如 Opus 5 在 high 及以下)上关掉思考,有两个已知问题:

1. 模型偶尔会把工具调用**写进正文**,而不是生成 `tool_use` 块——调用不会执行,也不会报错
2. 可能泄露 `<thinking>` 之类的标签

**打开思考、降低 effort** 能同时解决这两个问题。如果某条路由必须关闭思考:删掉所有"不要思考"的指令,不要在提示里提到思考标签,并加一句类似"使用工具前可以先说一句话;如果没有工具能完成用户的请求,直接说明而不是猜测;不要在回复里包含内部或系统的 XML 标签"。

---

## 八、思考与缓存、成本

- **思考的 token 按输出 token 计费**,`display` 设成什么都一样
- 改 thinking 或 effort 会让消息缓存失效(用对话中途的 effort 消息可以避免)
- 想控制花费,首选降 effort,而不是关思考
- 估算 token 用 `count_tokens`,不要用旧模型的经验值

---

## 九、和推理模型的关系

aiLearning/39 讲过 o1、DeepSeek-R1 这类"推理模型"。Claude 新模型的 adaptive thinking 本质上就是把"推理模式"变成了每个请求的默认行为,由模型按任务难度自己分配思考量;effort 则是你在"更快更省"和"更彻底"之间给的总体倾向。所以在 Claude 上,**不存在单独的"推理模型"和"普通模型"之分**,只有不同 effort 下的同一个模型。

---

## 十、踩坑

1. **照抄旧代码的 `budget_tokens`**——新模型上 400
2. **在 Opus 5.5 上写 `thinking={"type": "disabled"}`**——任何 effort 下都 400,降 effort 代替
3. **从 Opus 5 迁到 Opus 5.5 不改 effort**——默认从 high 降到了 medium,显式设置
4. **Opus 4.8 上不传 `thinking` 以为在思考**——它不思考,要显式开 adaptive
5. **流式展示思考却没设 `summarized`**——默认 omitted,用户看到一段长停顿
6. **只把 text 追加回历史**——思考块丢了,后续推理质量下降,甚至报错
7. **每轮往历史里插提醒、下轮删掉**——新模型上会让之后所有思考块失效,甚至 400
8. **对话中途重建 system 或 tools**——同上,改成追加 system 消息和工具增删块
9. **把 task budget 当硬上限**——它是建议,硬上限是 `max_tokens`
10. **为了省钱关思考**——关思考有失败模式,降 effort 更稳

---

下一篇:`27-Files-API-PDF与Citations.md`,讲 Files API 怎么上传一次、多次引用,PDF 和文档块的用法与限制,以及用 citations 让 Claude 的回答带上可验证的出处。
