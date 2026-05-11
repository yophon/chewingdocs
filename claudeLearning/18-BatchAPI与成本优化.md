# Batch API 与成本优化

写应用的成本可以分两类:**实时调用**(用户在等)和 **离线调用**(可以慢点等)。后者用 Anthropic 的 Message Batches API 能直接打 5 折。这是 prompt caching 之后**最大的省钱杠杆**。本篇也顺带把整套成本优化清单一次性列清楚——cache、batch、模型路由、prompt 精简、token 预算,五件事一起看。

> 一句话先记住:**实时调用全开 cache;离线任务全走 batch;两者结合 + 模型路由,生产成本能压到原来的 1/3 到 1/5**。

---

## 一、Batch API 是什么

把一组请求打包提交,Anthropic 后端在 24 小时内异步处理完,给你结果文件。**所有请求 50% 价格**(input + output 都打折)。

适合的场景:

- 离线分析几万条 ticket / 评论 / 邮件
- 批量翻译
- 大规模文档抽取
- 历史数据补打标
- 模型评估 / 跑实验数据集
- 定时报告(每天凌晨跑一批)

**不适合**:

- 用户对话(用户不会等 24 小时)
- 在线推理 / 流式 UI

---

## 二、最小例子

```python
from anthropic import Anthropic
client = Anthropic()

# 1. 提交一批请求
batch = client.messages.batches.create(
    requests=[
        {
            "custom_id": "review-1001",
            "params": {
                "model": "claude-haiku-4-5",
                "max_tokens": 256,
                "messages": [{"role": "user", "content": "把这条评论分类为正面/负面/中性: ..."}]
            }
        },
        {
            "custom_id": "review-1002",
            "params": { ... }
        },
        # ... 最多 10 万 / 批
    ]
)

print(batch.id, batch.processing_status)
# "msgbatch_xxx", "in_progress"
```

24 小时内拉:

```python
batch = client.messages.batches.retrieve(batch.id)
print(batch.processing_status)  # "ended" 时完成

if batch.processing_status == "ended":
    for result in client.messages.batches.results(batch.id):
        print(result.custom_id, result.result.message.content[0].text)
```

完成时间通常远快于 24 小时——**很多场景几分钟就能跑完几千条**。

---

## 三、Batch 的几个关键约束

| 维度 | 限制 |
| --- | --- |
| 单批最大请求数 | ~10 万 |
| 单批最大字节数 | 看模型,大致几百 MB |
| 完成时间 | 24 小时内(SLA),实际多数几分钟到几小时 |
| 状态 | `in_progress` / `canceling` / `ended` |
| 结果文件 | 一行一个 JSON,按 custom_id 对齐 |
| 价格 | 实时价的 50%(input + output 都打折) |
| Cache | **支持**——批内重复前缀也能命中 cache |

> Batch + Cache 叠加是隐藏 buff:批量任务里同一个 system prompt 重复用,**cache 让每条只付 10%,batch 再 5 折,叠起来 5%**。

---

## 四、模型路由:Haiku / Sonnet / Opus 怎么分配

成本优化里最容易被忽略的是**别一律用 Sonnet / Opus**。按任务难度路由:

```python
def pick_model(task_type: str) -> str:
    if task_type in ("classification", "tagging", "simple_extraction"):
        return "claude-haiku-4-5"      # $0.80 / $4
    if task_type in ("summarization", "qa", "moderate_writing"):
        return "claude-sonnet-4-7"     # $3 / $15
    if task_type in ("complex_reasoning", "long_agent", "architecture"):
        return "claude-opus-4-7"       # $15 / $75
    return "claude-sonnet-4-7"
```

**典型比例(成熟应用)**:

```
Haiku  60%   小任务、批量分类、第一道筛选
Sonnet 35%   日常推理、客服、Coding
Opus    5%   复杂决策、最终把关、难任务
```

**两阶段策略**:

```
入口:Haiku 做粗判 / 抽信息
       ↓ 路由
难的:Sonnet
更难的:Opus
```

> 这是 Anthropic 自家的 Claude Code 都用的策略——**不同 subagent / 不同任务用不同模型**。

---

## 五、Prompt 精简的几条原则

```
便宜:input token 1x、output token ~5x
所以:省 output 比省 input 性价比高 5 倍
```

具体优化:

1. **限制输出长度**(`max_tokens`、prompt 里说"不超过 200 字")
2. **要 JSON 不要 prose**——结构化输出更短
3. **少 few-shot 示例**——多一个示例多 500-1000 token,3 个够通常就够
4. **system prompt 别写小说**——300 token 够用就别写 2000
5. **历史对话裁剪**——长对话定期 compact,丢掉不再相关的早期消息
6. **图像走低分辨率**(要求支持的话)——高清图 5x token 量

---

## 六、Token 预算与上限保护

生产应用一定要设上限:

```python
def safe_call(messages, max_input_tokens=20000):
    count = client.messages.count_tokens(model="claude-sonnet-4-7", messages=messages)
    if count.input_tokens > max_input_tokens:
        raise ValueError(f"input too long: {count.input_tokens}")
    return client.messages.create(
        model="claude-sonnet-4-7",
        max_tokens=1024,           # 输出上限
        messages=messages,
        metadata={"user_id": "..."}
    )
```

**用户级别预算**(SaaS 场景):

```python
# 每个 user 每天 X 个 token
def check_user_budget(user_id, tokens):
    used = redis.get(f"budget:{user_id}:{today}") or 0
    if used + tokens > USER_DAILY_LIMIT:
        raise BudgetExceeded()
```

---

## 七、实战成本优化清单

按性价比排序的"做这些就能省 60%+":

### 高 ROI(必做)

1. **开 prompt cache**:长 system / tools / 长背景文档 → 省 90% input token
2. **离线任务全走 batch**:50% 价
3. **模型路由**:简单任务 Haiku,默认 Sonnet,难任务 Opus
4. **`max_tokens` 收紧**:别给 8192 当默认,按场景设
5. **限制重试 + 指数退避**:4xx 不重试

### 中 ROI(常做)

6. **删 few-shot 冗余**:从 5 个减到 3 个
7. **system prompt 精简**:删冗长描述
8. **JSON 输出短文字**
9. **流式 UI 不展示 thinking 全文**:thinking 给真人看用进度条
10. **Streaming 复用 history**:避免每条消息重发

### 长期(规模化必做)

11. **监控每用户成本**:发现异常 user 立刻限流
12. **A/B test 不同模型**:Haiku 够用就别 Sonnet
13. **PromptCaching 命中率监控**:< 80% 就要排查
14. **batch + cache 叠加**:批量任务系统 prompt 也要 cache_control

---

## 八、监控与可观测

生产应用最少要监控这些指标:

```python
# 每条调用都记录
log.info({
    "user_id": user_id,
    "model": model,
    "input_tokens": resp.usage.input_tokens,
    "cache_creation": resp.usage.cache_creation_input_tokens,
    "cache_read": resp.usage.cache_read_input_tokens,
    "output_tokens": resp.usage.output_tokens,
    "thinking_tokens": resp.usage.thinking_tokens,
    "cost_usd": calc_cost(...),
    "latency_ms": elapsed,
    "task_type": "...",
})
```

**几个关键看板**:

- 每用户每天成本 top N(发现异常)
- cache 命中率(整体 / 按 endpoint)
- 模型分布(Haiku/Sonnet/Opus 比例)
- 平均 input / output token 趋势
- batch vs realtime 比例

> 没有监控就没法优化。**第一周就建好,不要等成本炸了再补**。

---

## 九、典型应用的成本估算

例:**客服机器人**

- system + tools cache:5K token,每用户 session 命中
- 每条用户消息 100 token,回答 200 token
- 一个 session 平均 10 条对话

不优化:

```
input:  (5K + 100 * 10) * $3/M = $0.018
output: 200 * 10 * $15/M = $0.030
单 session ≈ $0.048
1 万 session/天 = $480/天 = $14400/月
```

优化后(Sonnet → Haiku 简单问 + cache + Sonnet 难问):

```
80% 走 Haiku + cache:省 70%
20% 走 Sonnet + cache:省 50%
单 session ≈ $0.012
月成本 ≈ $3600(节省 75%)
```

> 这套优化很现实,**绝大多数生产应用都能复制**。

---

## 十、踩坑

1. **不开 cache 跑生产**——账单第一周吓出汗
2. **离线任务用实时 API**——Batch 价 5 折,你白付一倍
3. **一律 Opus**——简单任务多花 5x;**Sonnet 起步,Haiku 主流**
4. **`max_tokens` 给 8192 默认**——LLM 真给你写到 8192,output 是最贵的
5. **不监控成本**——某个 hook bug 让一条消息调 100 次,月底发现已经晚了
6. **不限 user 预算**——SaaS 场景一个 user 一天烧 $100 不是稀奇事
7. **Batch 不用 cache**——批量任务系统 prompt 也该 cache_control
8. **重试 4xx**——badrequest 重试 5 次还是 fail,白付 token + 速率
9. **流式 UI 错过中途断网**——没存 partial,用户重新问,白付一次
10. **不切 thinking budget**——简单任务给 16K thinking budget,贵 5 倍且没用

---

## 十一、第二层(API)结束语

12-18 篇讲完了 Anthropic API 的核心:

```
12 入门              Messages API 基础
13 Tool Use          工具调用机制(Agent 内核)
14 Prompt Caching    成本性能的关键
15 Extended Thinking 复杂推理
16 Files / Citations 文档处理 + 引用
17 Computer Use      屏幕级 Agent
18 Batch API + 成本   省钱
```

至此**你能用 Anthropic API 写任何应用了**。

下一段(19-23)进入 Claude Agent SDK ——把这些 API 拼成 Agent 不需要你手写 tool loop / context 管理 / subagent。**Anthropic 把 Claude Code 的内核开源出来给你**,这就是 Agent SDK。
