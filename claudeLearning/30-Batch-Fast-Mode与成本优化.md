# Batch、Fast Mode 与成本优化

应用上线后,账单很快会成为第一个被追问的问题。降成本的手段很多:缓存、批处理、换小模型、调低 effort、精简 prompt……但它们不是同一类东西。有些**只省钱、不影响质量**,应该无条件先做;有些是**拿能力换钱**,必须在评测上验证过才能动。这一篇讲 Message Batches 和 fast mode 这两个与价格直接挂钩的 API 特性,再给出一套按顺序执行的成本优化方法。

> 一句话先记住:**成本按"每个完成的任务"算,不按"每个 token"算**。单价高的模型如果更少的轮次就做完,反而更便宜;便宜的模型做失败了,它的 token 照样计费,还要加上重试和失败带来的下游代价。所有省钱的判断,都要把成本和质量放在一起看。

---

## 一、两类杠杆,顺序很重要

| 类别 | 包括 | 特点 |
| --- | --- | --- |
| **免费的** | prompt 缓存、精简输入、agent 循环卫生、控制输出、批处理 | 降成本但**不降质量**,先做,缓存永远开着 |
| **有取舍的** | effort、task budget、换模型、多模型架构 | 拿能力换成本,**最后做**,每一步都要在评测上验证 |

最常见的错误顺序是:一看账单高,第一反应就是"换成 Sonnet / Haiku"。这是风险最大的一步,而前面那些免费的杠杆往往还一个都没做。

---

## 二、先看清钱花在哪

### 2.1 每个响应里的 usage

```python
u = response.usage
print(u.input_tokens, u.cache_read_input_tokens, u.cache_creation_input_tokens, u.output_tokens)
```

把每次请求的 `usage` 记进日志,是一切优化的前提。一天的日志就能回答:缓存命中率多少?输入和输出哪个占大头?思考 token 占多少?

### 2.2 Usage and Cost Admin API

组织层面的真实数据可以用 Admin API 拉取。它需要专门的 **Admin API key**(`sk-ant-admin01-...`,和普通 API key 不是一种;个人账号没有):

| 接口 | 用途 |
| --- | --- |
| `GET /v1/organizations/usage_report/messages` | token 用量,可以按 `model`、`api_key_id`、`workspace_id`、`service_tier` 分组,分出未缓存输入、缓存读、缓存写、输出 |
| `GET /v1/organizations/cost_report` | 美元成本,按日,可以按描述分组看到模型、token 类型 |

- 这是报表查询,不消耗 token;数据大约 5 分钟后出现
- 它覆盖整个组织。**多个项目共用一个 key 时,数据是混在一起的**,没法归因到某个项目——每个项目用独立的 key 或 workspace
- **Bedrock、Vertex AI、Foundry 上的流量不在这些报表里**,要看各平台自己的账单

### 2.3 不要用 tiktoken 估算

估算输入大小用 `client.messages.count_tokens`(23 篇),**不要用 OpenAI 的 tiktoken**——它对 Claude 的 token 数会少算 15%-20%,代码和中文少算得更多。token 数还因模型而异,要用你实际调用的模型来数。

---

## 三、Message Batches:半价

### 3.1 用法

```python
from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
from anthropic.types.messages.batch_create_params import Request

batch = client.messages.batches.create(requests=[
    Request(
        custom_id=f"review-{item.id}",
        params=MessageCreateParamsNonStreaming(
            model="claude-opus-5-5",
            max_tokens=4000,
            system=shared_system,           # 共享的 system 照样可以加缓存标记
            messages=[{"role": "user", "content": item.text}],
        ),
    )
    for item in items
])

# 轮询
while client.messages.batches.retrieve(batch.id).processing_status != "ended":
    time.sleep(60)

# 取结果:顺序不固定,一律按 custom_id 对应
for r in client.messages.batches.results(batch.id):
    match r.result.type:
        case "succeeded":
            save(r.custom_id, r.result.message)
        case "errored":
            if r.result.error.type == "invalid_request":
                log_bad_request(r.custom_id)          # 请求本身有问题,改了再提交
            else:
                retry_later(r.custom_id)              # 服务端错误,可以重试
        case "expired":
            retry_later(r.custom_id)                  # 24 小时内没处理完
        case "canceled":
            pass
```

### 3.2 要知道的事

| 项 | 值 |
| --- | --- |
| 折扣 | **所有 token 五折**,包括缓存读写——和缓存的折扣叠加 |
| 规模 | 每批最多 10 万个请求或 256MB |
| 时间 | 大多数一小时内完成,**最长 24 小时**——这是过期时间,不是承诺的完成时间 |
| 结果保留 | 29 天 |
| 功能 | 普通 Messages API 的功能基本都支持(视觉、工具、缓存等) |

### 3.3 适合和不适合

- **适合**:没人等着看结果的工作——评测跑分、历史数据回填、每晚的报告、批量分类和抽取
- **不适合**:用户在等的请求
- **每个请求是一次性的**,批处理里没法跑多轮工具循环。有时可以把工具循环"拍平":先把工具要查的数据都准备好,一次性放进请求。这能省一半钱,但它改变了模型的推理方式,是架构决策,要验证效果
- 并发处理的请求之间,缓存命中是尽力而为的
- 23 篇讲的服务端 `fallbacks` 参数在 Batches API 上不支持
- 新模型在批处理里配合 `output-300k-2026-03-24` beta 可以输出最多 30 万 token,适合一次生成很长的文档

---

## 四、Fast Mode:更快,也更贵

07 篇讲过 Claude Code 的 `/fast`。在 API 里,它是一个请求参数:

```python
response = client.beta.messages.create(
    model="claude-opus-5-5",
    max_tokens=16000,
    speed="fast",
    betas=["fast-mode-2026-02-01"],
    messages=[...],
)
```

| 项 | 说明 |
| --- | --- |
| 是什么 | 同一个模型、同样的质量,输出更快 |
| 价格 | Opus 5.5 为 **$8 / $40** 每百万 token,是标准价的 2 倍(Opus 5 / Opus 4.8 为 $10 / $50) |
| 支持的模型 | Opus 5.5、Opus 5、Opus 4.8 |
| 平台 | **研究预览,只在 Claude API 上**(包括 Managed Agents);Bedrock、Vertex、Foundry、Claude Platform on AWS 都没有 |
| 限流 | 有单独的限流额度,和标准请求分开 |
| 缓存 | 开关 fast mode 会让 system 及之后的缓存失效(25 篇) |

**只在有人等着的时候用**:实时对话、需要快速来回的交互工具。批处理、夜间任务、无人值守的 agent 开 fast mode 只是多付一倍的钱。旧代码里的 `claude-opus-4-6-fast` 这类模型字符串已经下线,改成上面的 `speed="fast"` 写法。

---

## 五、免费的杠杆

按这个顺序过一遍。

### 5.1 Prompt 缓存

第一个做,而且永远开着。25 篇已经讲透了:稳定内容放前面,前缀里不要有时间戳,定期看 `cache_read_input_tokens`。

### 5.2 精简输入

| 现象 | 做法 | 什么时候不要做 |
| --- | --- | --- |
| 每个请求都带着一份很长的参考文档 | 做成工具或 skill,按需读取 | 大多数请求本来就要用到大部分内容——放在缓存的前缀里已经很便宜 |
| system prompt 里复述了一遍工具怎么用 | 删掉,工具的 schema 本来就会发给模型 | |
| 工具定义很多 | 工具搜索 + `defer_loading`(28 篇) | 工具定义总共不到 1 万 token |
| 图片按原分辨率发送 | 先缩小到任务需要的尺寸。图片大约按每 28×28 像素一个 token 计费,1280×720 大约 1200 token | 任务需要看清细节(技术图纸) |
| 大表格直接贴进 prompt | Files API + 代码执行,让模型在沙箱里算,只把结果带回来 | 没有需要计算的东西 |
| 工具返回整个数据库表 | 改成窄接口:`get_policy(claim_id)` 而不是 `get_all_policies()`,列表工具加 `limit`、`fields` | |
| 用户输入长度不受控 | 先用 `count_tokens` 数一下,超长的截断、总结或走 Files API | |
| prompt 是为旧模型写的 | 删掉过时的强调和补丁(`CRITICAL`、`MUST` 之类)。为旧模型写的提示会让新模型过度工作 | |

注意:**更小的前缀不一定是更便宜的任务**。把文档挪到工具后面,模型可能要多花几轮去找它原来直接能看到的东西。改完要在评测上验证。

### 5.3 Agent 循环卫生

长循环里不断堆积的工具结果用 context editing 或 compaction 处理,自带大量中间结果的步骤交给子 agent(29 篇)。

### 5.4 控制输出

- **`max_tokens` 是保险丝,不是调节旋钮**。模型看不到它,碰到上限只会被拦腰截断。设得太紧,省下的是被截断的失败尝试,每个完成的任务并没有变便宜。agent 类任务可以设到 64000 并开启流式
- **想让回答更短,在提示词里规定输出的格式**,最好给一个例子
- **想让思考更短,调 effort**,不是调 `max_tokens`
- **用停止序列做提前退出**:约定一个标记,比如模型发现无法完成时输出 `<CANNOT_REVIEW>`,并把它设为 `stop_sequences`,模型就不会再花 token 解释原因

### 5.5 批处理

没人等的流量全部走 Batches API,上一节已经讲过。

---

## 六、有取舍的杠杆

从这里开始,每一步都在拿能力换成本。**一次只改一个,在评测上验证**。

### 6.1 先扫 effort,再考虑换模型

在当前模型上,把同一批请求分别用 `low`、`medium`、`high` 跑一遍(26 篇)。官方实测的规律:

| 任务类型 | effort 曲线 |
| --- | --- |
| 研究、知识类 | 几乎是平的:`medium` 和 `high` 准确率差不多,`low` 只损失几个点却能省三分之一到一半 |
| 长周期编码 | 真实的取舍:每降一档损失个位数的通过率,省下的成本相当可观;最高几档花很多钱只换来一点提升 |

扫的时候,每个设置用单独的会话(中途改 effort 会影响缓存),一定要包含几个你知道的难题——难题才是高 effort 发挥作用的地方。

### 6.2 失败了再用高 effort 重跑

如果任务有可靠的失败信号(测试、校验器),**先全部用低 effort 跑,只把失败的用高 effort 重跑**。官方实测在编码任务上,这样的通过率和全部用高 effort 持平甚至略高,成本只有一半多一点。

### 6.3 Task budget

告诉模型这个任务大约有多少 token 预算,让它自己控制节奏(26 篇)。从循环实际用量的 90 分位开始设,再逐步收紧。它是建议性的,不会硬性截断;设得太紧通过率会下降。

### 6.4 换模型放在最后

- **先看有没有升级,再考虑降级**:如果用的是一两代以前的模型,换成同档的新模型(往往配合更低的 effort)可能直接更便宜。但这不保证,要实测
- **按每个完成的任务比较**,包括"大模型 + 低 effort"这个组合:官方的测试里,前沿模型用 `low` 在某些任务上比小模型解出更多题、单题成本还更低
- **看最难的那 10%**:普通任务上每个模型看起来都差不多,账单是由便宜模型做不好的那些任务决定的
- **一次降一档**:降级后把 effort 重置为新模型的默认值重新扫,不要沿用旧模型的设置
- **在会话之间切换,不要在会话中途切换**:中途换模型让缓存失效,新模型上之前的思考块也会失效

### 6.5 两个模型配合

| 架构 | 什么时候划算 |
| --- | --- |
| **Advisor**(便宜的执行者 + 关键时刻咨询强模型,28 篇) | 两个模型能力差距大,执行者确实会去咨询。注意:调低执行者的 effort 可能让它几乎不再咨询,结果比执行者单独跑还差 |
| **Orchestrator**(强模型规划,把大量工作分给便宜的 worker) | 有大量可以独立拆分的工作,最好多到一个上下文窗口装不下。如果工作是一条相互依赖的链,或者一个窗口就放得下,单个模型用低 effort 更划算 |

---

## 七、怎么验证

**最小评测**:从生产日志里挑 20-30 个真实请求,冻结下来,每种配置都跑同一批。判断方式选最便宜的:有标准答案就比对,能自动校验就自动校验(测试通过、JSON 合法、必填字段齐全),实在不行再用模型打分。

记录每个配置的通过率和每个任务的成本,画成"分数-成本"图,取帕累托前沿。上线前先在真实流量上影子运行,上线后再看一次 Admin API 的报表确认省下了钱。

**大多数杠杆对你的工作负载都不适用**,这很正常。官方的示例里,工具定义太少用不上工具搜索,循环太短用不上 compaction,没有数值计算用不上代码执行。"什么都不用改"也是一个有效的结论。

---

## 八、速查表

| 钱花在哪 | 用什么 |
| --- | --- |
| 每次都重复计费的 system 和工具 | prompt 缓存 |
| 每个请求都带的大文档 | 挪到工具或 skill 后面 |
| 大量工具定义 | 工具搜索 |
| 图片、PDF、大文件 | 缩小图片;Files API + 代码执行 |
| 长循环里堆积的工具结果 | context editing / compaction(服务端) |
| 一个产生大量中间结果的独立步骤 | 子 agent,可以用便宜模型 |
| 很长的可见回答 | 在提示词里规定输出格式 |
| 思考和工具调用占大头,评测有余量 | 降 effort;看同档新模型;再降一档模型 |
| 大部分是常规任务,少数是难题 | 便宜模型 + advisor |
| 没人等结果 | Batches API |

---

## 九、踩坑

1. **一看账单高就换小模型**——风险最大的一步放在了第一步,免费的杠杆还没做
2. **按每 token 单价比较模型**——要按每个完成的任务比较,失败的尝试也计费
3. **用 tiktoken 估算 token**——少算 15%-20%,中文和代码更多
4. **多个项目共用一个 API key**——Admin API 的数据无法归因
5. **批处理结果按位置对应**——顺序不固定,按 `custom_id`
6. **用户在等的请求走了 Batches API**——最长 24 小时
7. **无人值守的任务开 fast mode**——没人等,只是多付一倍
8. **把 `max_tokens` 调小来省钱**——只是让更多尝试被截断,每个完成的任务并没有更便宜
9. **同时改了好几个杠杆**——效果无法归因,一次改一个
10. **降级模型后沿用旧的 effort 设置**——每个模型的默认值和各档含义不同,重新扫

---

下一篇:`31-Managed-Agents.md`,讲 Anthropic 托管的 agent 运行时:agent、environment、session 三个核心对象,沙箱里的工具、vault 凭据、memory store、定时部署、outcomes 评分迭代,以及什么时候该用它而不是自己写循环。
