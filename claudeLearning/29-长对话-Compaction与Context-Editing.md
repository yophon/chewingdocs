# 长对话:Compaction 与 Context Editing

新模型有 1M token 的上下文窗口,但这不代表可以放心让对话无限增长。一个跑了两百轮的 agent,每一轮都带着之前所有的工具结果:每次请求越来越贵,越来越慢,早就用不上的旧日志还在干扰模型的注意力,最后总会撞上窗口上限。这一篇讲 API 提供的三种处理手段——**context editing(剪掉)、compaction(总结)、memory 工具(跨会话记住)**——以及新模型上一个很容易踩的坑:自己动手改历史。

> 一句话先记住:**在新模型上,上下文的修剪和压缩要交给服务端做**。客户端自己删旧消息、改旧消息,会让之后所有的思考块失效(26 篇的 preserved thinking),缓存也从修改点开始全部重来。服务端的 context editing 和 compaction 不算"修改历史",这是它们最大的价值。

---

## 一、三种手段

| 手段 | 做什么 | 适合 | 作用范围 |
| --- | --- | --- | --- |
| **Context editing** | 按规则**删掉**旧的工具结果、思考块 | 旧工具输出已经没用,但对话结构要保留 | 一个会话内 |
| **Compaction** | 把前面的对话**总结**成一个 compaction 块 | 对话快要撑满窗口 | 一个会话内 |
| **Memory 工具** | Claude 自己读写一个记忆目录 | 状态要跨会话保留 | 跨会话 |

很多长时间运行的 agent 三种都用:会话中用 context editing 保持精简,接近上限时 compaction,值得长期保留的东西写进 memory。

**短循环什么都不用加**。十几轮就结束的对话碰不到这些问题,加上这套机制只是增加复杂度。

---

## 二、Context Editing

### 2.1 清理旧工具结果

```python
response = client.beta.messages.create(
    model="claude-opus-5-5",
    max_tokens=16000,
    betas=["context-management-2025-06-27"],
    tools=tools,
    messages=messages,
    context_management={
        "edits": [{
            "type": "clear_tool_uses_20250919",
            "trigger": {"type": "input_tokens", "value": 300_000},     # 超过这个量才开始清
            "keep": {"type": "tool_uses", "value": 5},                 # 保留最近 5 次工具调用
            "clear_at_least": {"type": "input_tokens", "value": 50_000},  # 一次至少清掉这么多,否则不清
            "exclude_tools": ["read_requirements"],                    # 这些工具的结果永远保留
        }],
    },
)
```

- 被清掉的工具结果换成一个占位,对话结构(谁调用了什么工具)仍然在
- `clear_tool_inputs: True` 还会清掉 `tool_use` 的参数(比如写文件工具里的整段文件内容)
- 你本地的 `messages` 不用改,清理是服务端在处理请求时做的

### 2.2 清理旧思考块

`clear_thinking_20251015` 策略清掉早先回合的思考块。长时间运行、思考量大的 agent,旧回合的推理过程往往不再需要。

### 2.3 它不是省钱工具

这一点和直觉相反:**每清理一次,都是改写了缓存的前缀**,清理点之后的缓存全部重新写入(25 篇)。官方文档实测的一个例子里,context editing 花的比省的还多。所以:

- 它的用途是**腾出窗口空间**,不是降成本
- `trigger` 设得高一些,让清理不频繁发生
- 用 `clear_at_least` 保证每次清理都清得足够多,值得付那一次缓存写入的钱

---

## 三、Compaction:阈值触发

### 3.1 基本用法

```python
messages = []

def chat(user_message: str) -> str:
    messages.append({"role": "user", "content": user_message})
    response = client.beta.messages.create(
        model="claude-opus-5-5",
        max_tokens=16000,
        betas=["compact-2026-01-12"],
        messages=messages,
        context_management={
            "edits": [{
                "type": "compact_20260112",
                "trigger": {"type": "input_tokens", "value": 400_000},
            }],
        },
    )
    # 必须追加完整的 content——compaction 块要原样传回
    messages.append({"role": "assistant", "content": response.content})
    return next(b.text for b in response.content if b.type == "text")
```

输入超过阈值时,服务端先把前面的对话总结成一个 `compaction` 块,再基于"总结 + 最近内容"生成回答。之后的请求从 compaction 块开始,之前的内容不再发给模型。

**最常见的错误是只保存了文本**:`messages.append({"role": "assistant", "content": text})` 会把 compaction 块丢掉,下一次请求又带上全部历史,等于没压缩。

### 3.2 几个要点

- **自定义 `instructions` 会替换默认的总结提示词,而不是追加**。写自己的提示词时,要把默认提示词会保留的任务关键状态也写进去
- 总结本身是一次模型调用,**照常计费**,在 `usage.iterations` 里能看到
- 哪些模型支持,以 Models API 返回的能力为准(23 篇):`caps["context_management"]["compact_20260112"]["supported"]`
- 从旧版 SDK 升级时注意:Tool Runner 原来的 `compaction_control={"enabled": True, ...}` 在 Python SDK 1.x 里改成了上面这种 `context_management` + beta 头的写法

### 3.3 什么时候值得

compaction **只在足够长的会话里省钱**:官方文档实测,长会话里账单降了大约三分之一,短会话里什么都没省。任何一次压缩都会让缓存从头开始。

---

## 四、Compaction:按需触发

阈值触发是"到了就压",时机由服务端决定,压缩发生在关键路径上,那一轮会明显变慢。**按需 compaction**(beta `compact-2026-09-04`)把时机交给你,而且可以**在后台做**:

1. 你挑一个时机,把**已经发过的某次请求的 `messages` 原样**再发一次,加上 `"compaction": {"type": "summarize"}`,同样的模型、system、tools、thinking 设置
2. 响应里只有一个签过名的 `compaction` 块,`stop_reason` 是 `"compaction"`
3. 这期间对话照常进行,继续基于完整历史发请求
4. 拿到块之后的第一个请求:**从历史开头删掉你发去压缩的那些消息,把 compaction 块作为一条单独的 assistant 消息放在最前面**,之后新增的回合原样保留,包括它们的思考块

几条规则:

| 规则 | 原因 |
| --- | --- |
| 压缩请求里的消息必须和之前发过的完全一致 | 这样保留下来的回合的思考块仍然有效 |
| 最后一个 assistant 回合不能还在等工具结果 | 会被拒绝,先把 `tool_result` 发出去 |
| 压缩请求里不能带 `output_config.format`、`stop_sequences`、强制 `tool_choice` | 会被拒绝 |
| `max_tokens` 至少给几千 | 写不出总结时返回 200 但 `content` 为空 |
| 被总结掉的部分里的 `role: "system"` 指令,在采用 compaction 块后失效 | 需要在采用块的那个请求里重新声明一次 |
| 任何时候只带最新的一个 compaction 块 | 带两个返回 400 |
| 不要和 `context_management` 在同一个请求里用 | 两套机制冲突 |
| Amazon Bedrock 上不可用 | Claude API、Claude Platform on AWS、Google Cloud、Microsoft Foundry 可用 |

这套流程比阈值触发复杂,但官方文档在可用的平台上**更推荐按需触发**:不阻塞对话,保留最近的回合原文,而且整个过程是"只追加"的,不会让思考块失效。

---

## 五、为什么不要自己改历史

在没有 preserved thinking 的老模型上,很多人这样管理上下文:

- 删掉最早的几轮(滑动窗口)
- 把旧的工具结果截短成一行摘要
- 把前面的对话总结成一段,保留最近几轮原文(keep-tail)
- 在后台总结,总结好了再替换进去

**在 Fable 5.1、Opus 5.5、Sonnet 5.5、Haiku 5.5 上,这些做法都会出问题**。每个思考块都记录了生成它时的完整前缀,前缀里任何一处被改动,之后所有思考块都失效;对 2026-08-31 之后创建的账号,传回失效的思考块直接返回 400。

| 客户端做法 | 结果 | 替代 |
| --- | --- | --- |
| 删除或截短旧工具结果 | 之后的思考块全部失效 | 服务端 context editing |
| 删掉中间某几轮 | 同上,没有客户端的补救办法 | 改指令用中途 system 消息;删内容用 context editing |
| keep-tail 压缩 | 保留的回合的思考块失效 | 按需 compaction;或去掉保留回合里的思考块 |
| 后台压缩再替换 | 替换点之后的思考块全部失效 | 按需 compaction |
| **简单压缩**(总结成一条消息,之前的什么都不再发) | 可行 | 官方推荐的客户端形状 |

服务端的 context editing 和 compaction 之所以没问题,是因为 API 校验的是"你发来的对话",服务端在处理时做的裁剪不算你改了历史。

### 5.1 客户端简单压缩

如果一定要在客户端做(比如所在平台没有服务端 compaction),推荐的形状是:**对话太长时,总结成一条消息,下一个请求只发"这条总结 + 新的用户消息"**,之前的回合和思考块一律不再发送。Claude 模型就是用这种方式训练长任务的,效果不比复杂的方案差。

总结提示词要明确告诉模型保留什么。官方给的提示词大意是:

> 把对话总结在 `<summary></summary>` 里,让一个新的上下文窗口能接着做下去,不用重做或重新提供约束。务必保留:(1)遇到的困难和怎么解决的;(2)提出过、尝试过、放弃了的方案及原因;(3)用户要求、决定、排除、确认的偏好和约束,**原话保留**;(4)现在进行到哪一步;(5)还没解决、答应要做、接下来要做的事;(6)难以重建的细节——名字、数字、日期、原文、链接。用户说的话尽量贴近原文,自己的解释可以大幅压缩。**写总结时不要调用任何工具,只输出文字。**

最后一句很关键:压缩请求还带着对话的 `tools`(不能为了这一次去掉,否则又改了前缀),不写这句模型偶尔会去调工具而不是写总结。

还有一条:**不要在一个工具回合中间压缩**——一个 assistant 回合的 `tool_use` 还在等 `tool_result` 时,它应该带着完整的思考块原样传回。

---

## 六、Memory 工具:跨会话记住

### 6.1 它是什么

context editing 和 compaction 都发生在一个会话之内。用户明天回来、开一个新会话,前一天的偏好、做到一半的任务就都没了。memory 工具让 Claude **自己维护一个记忆目录**,在任务开始时去看,在学到东西时写进去。

```python
response = client.messages.create(
    model="claude-opus-5-5",
    max_tokens=16000,
    tools=[{"type": "memory_20250818", "name": "memory"}],
    messages=[{"role": "user", "content": "记住:我们组的代码都用 Python 3.12,测试用 pytest"}],
)
```

它是 **Anthropic 定义、客户端执行**的工具(28 篇):模型发出 `view`、`create`、`str_replace`、`insert`、`delete`、`rename` 这些命令,操作 `/memories` 目录下的文件,**存储由你实现**——本地文件、数据库、对象存储都可以。

### 6.2 用 SDK 的帮助类实现

```python
from anthropic.lib.tools import BetaAbstractMemoryTool

class UserMemory(BetaAbstractMemoryTool):
    def __init__(self, user_id: str):
        self.root = Path("memory_store") / user_id      # 每个用户一个目录
        ...
    def view(self, command): ...
    def create(self, command): ...
    def str_replace(self, command): ...
    def insert(self, command): ...
    def delete(self, command): ...
    def rename(self, command): ...

runner = client.beta.messages.tool_runner(
    model="claude-opus-5-5",
    max_tokens=16000,
    tools=[UserMemory(user_id)],
    messages=[{"role": "user", "content": "继续昨天的数据迁移"}],
)
```

### 6.3 安全

- **按用户隔离目录**:参考实现没有访问控制,多用户系统里一定要在处理函数里按用户分目录、做鉴权
- **校验路径**:模型给出的路径要限制在该用户的记忆目录内,防止 `../` 穿越
- **不要存密钥、密码、token**;个人信息要考虑隐私法规
- **记忆内容是不可信的**:如果对话里出现过外部内容(网页、邮件),模型可能把里面的注入指令写进记忆,下次会话再读出来。对记忆内容的处理要和对外部输入一样谨慎

### 6.4 和 Claude Code 的对照

06 篇讲的 CLAUDE.md 和 auto memory 就是同样的思路:**跨会话的信息放在文件里,会话开始时加载**。区别是 Claude Code 帮你实现好了存储和加载规则;用 API 时,目录结构、加载时机、清理策略都要你自己设计。31 篇的 Managed Agents 提供托管的 memory store,带版本和回滚。

---

## 七、另一种思路:用子 agent 隔离

有些步骤天然会产生大量中间结果:扫一遍代码库、读几十个日志文件。与其让这些结果进入主对话再想办法清理,不如**一开始就交给子 agent**:子 agent 在自己的上下文里处理完,只给主 agent 返回一行结论,还可以用更便宜的模型。

代价:子 agent 从一个新的前缀开始,和主对话不共享缓存;如果主 agent 做判断需要看到中间细节,就不适合拆出去。13 篇讲的 Claude Code 子代理就是这个模式。

---

## 八、怎么选

| 情况 | 做法 |
| --- | --- |
| 对话十几轮就结束 | 什么都不加 |
| 工具结果很大,但很快就没用了 | context editing,`trigger` 设高,`clear_at_least` 设大 |
| 对话会持续很久,可能撑满窗口 | 按需 compaction(可用时),否则阈值触发 |
| 平台没有服务端 compaction | 客户端简单压缩 + 明确的总结提示词 |
| 某个步骤会产生大量中间数据 | 交给子 agent |
| 用户下次回来要接着做 | memory 工具,或 Managed Agents 的 memory store |

---

## 九、踩坑

1. **只把回答文本存进历史**——compaction 块丢了,下一次又发全部历史
2. **在新模型上自己删旧消息、截短工具结果**——之后的思考块全部失效,新账号直接 400
3. **keep-tail 压缩保留了原来的思考块**——那些思考块是基于完整历史生成的,压缩后失效
4. **把 context editing 当成省钱手段**——每次清理都改写缓存前缀,清得太频繁反而更贵
5. **自定义 compaction `instructions` 只写了一句"请总结"**——它替换默认提示词,任务关键状态丢了
6. **在工具回合中间压缩**——等待结果的 `tool_use` 回合要带着思考块原样传回
7. **按需 compaction 带了两个 compaction 块**——只带最新的一个
8. **客户端总结时模型去调用了工具**——总结提示词末尾写明"不要调用工具,只输出文字"
9. **memory 工具所有用户共用一个目录**——按用户隔离,校验路径
10. **在 Bedrock 上用按需 compaction**——不可用,先查平台支持

---

下一篇:`30-Batch-Fast-Mode与成本优化.md`,讲怎么把 Claude API 的账单降下来:Message Batches 半价批处理、fast mode 的取舍、模型和 effort 的选择、token 计数,以及一套按收益排序的成本优化清单。
