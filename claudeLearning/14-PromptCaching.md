# Prompt Caching

如果让我选 Anthropic API 里**最重要的一个特性**,就是 prompt caching。它不是"性能优化",是**成本和延迟数量级差距**——同样的应用,开了 cache 和没开,账单可以差 10 倍,首 token 延迟能差 5 倍。**Claude Code 的全部"长 session 友好"都靠它**。这一篇讲清楚怎么开、怎么省、怎么不踩坑。

> 一句话先记住:**长 prompt 的稳定部分(system / tools / 长背景文档 / 早期对话历史)用 cache_control 标记,下次相同前缀只付 10% 的钱**。**5 分钟 TTL 默认,1 小时 TTL 加价**。

---

## 一、为什么 Prompt Caching 是刚需

举个真实例子。Claude Code 跑一个长 session,system prompt 大约 10K token、tools 描述 5K token、CLAUDE.md 注入 2K token——加起来 17K 是**每条消息都要发的固定前缀**。

不开 cache:每条消息都付 17K 输入 token。10 轮对话 = 170K 输入费。

开 cache:第一条付 17K * 1.25(写 cache 加价 25%);后面 9 条 cache 命中,每条 17K 只付 10%。

```
10 条消息总输入 token cost:
  不开 cache:170K * $3/M = $0.51
  开 cache:  17K * 1.25 + 17K * 0.1 * 9 = 36K 等价 = $0.108
  
  省 79%
```

更长的 session 省得更多。**Claude Code 单 session 几百轮对话,没 cache 用不起**。

---

## 二、最小例子

加一个 `cache_control` 字段就行:

```python
resp = client.messages.create(
    model="claude-sonnet-4-7",
    max_tokens=1024,
    system=[
        {
            "type": "text",
            "text": LONG_BACKGROUND_DOC,  # 几千字背景文档
            "cache_control": {"type": "ephemeral"},  # 标这段为可缓存
        }
    ],
    messages=[
        {"role": "user", "content": "..."}
    ],
)

print(resp.usage)
# Usage(
#     input_tokens=12,                 # 这次新发的 user 部分
#     cache_creation_input_tokens=5000,  # 第一次写入 cache(加价 25%)
#     cache_read_input_tokens=0,         # 第一次没命中
#     output_tokens=...
# )
```

第二次同一段 system prompt 再发:

```
input_tokens=15
cache_creation_input_tokens=0
cache_read_input_tokens=5000   # 命中,只付 10%
```

---

## 三、计费模型

| 行为                          | 价格                          |
| --------------------------- | --------------------------- |
| 普通 input token              | 1x                          |
| **写 cache(cache_creation)** | 1.25x(5min TTL)/ 2x(1h TTL) |
| **读 cache(cache_read)**     | 0.1x                        |
| 输出 token                    | 不变                          |

> 重点:写贵 25%、读省 90%。**只要被读 3 次以上就划算**——Coding 场景动辄读几十次,白送。

---

## 四、TTL:5 分钟 vs 1 小时

```python
"cache_control": {"type": "ephemeral", "ttl": "5m"}   # 默认
"cache_control": {"type": "ephemeral", "ttl": "1h"}   # 加价
```

| TTL | 写入加价 | 读取价 | 适合 |
| --- | --- | --- | --- |
| 5min | 1.25x | 0.1x | 用户在 5 分钟内会持续发请求(对话、IDE 内 session) |
| 1h | 2x | 0.1x | 跨 session、批处理、间断使用 |

**实战经验**:

- **聊天 / 对话场景**:5min 够用,用户停 5 分钟基本就走了
- **Coding Agent / Claude Code 风格**:5min 也够,长 session 内每 4 分钟会有新交互,cache 一直在
- **批量任务**:1h(几小时跑一批,几次都命中 cache)
- **每天跑一次的离线作业**:cache 没意义,反而加价

---

## 五、Cache 命中规则:**前缀**精确匹配

Cache 的命中规则:

> **从 messages 开头算起,直到 cache_control 标记之前的所有内容,必须完全一致**。

具体说:

- system 改一个字 → cache miss
- tools 改一个字段 → cache miss
- 早期消息少一条 → cache miss
- 同样的内容,顺序不一样 → miss

**所以**:

- 把**稳定的、长的**放前面
- 把**变化的、短的**放后面
- 标记 `cache_control` 在"稳定前缀的最后一块"

---

## 六、典型分层缓存策略

```python
client.messages.create(
    model="claude-sonnet-4-7",
    max_tokens=1024,
    system=[
        {
            "type": "text",
            "text": "你是 X 助手,核心规则:..."   # 短,不缓存
        },
        {
            "type": "text",
            "text": LONG_BACKGROUND_DOC,           # 长背景,缓存
            "cache_control": {"type": "ephemeral"}
        }
    ],
    tools=[
        # 工具列表,长且稳定 → 跟 system 一起被前置缓存
        {
            "name": "search",
            "description": "...",
            "input_schema": {...},
            # 工具最后一个加 cache_control,会缓存到这之前的所有
        },
        {
            "name": "fetch",
            "description": "...",
            "input_schema": {...},
            "cache_control": {"type": "ephemeral"}  # 缓存到 tools 末尾
        }
    ],
    messages=[
        # 对话历史
        {"role": "user", "content": "第一轮"},
        {"role": "assistant", "content": "..."},
        {
            "role": "user",
            "content": [{
                "type": "text",
                "text": "第二轮",
                "cache_control": {"type": "ephemeral"}  # 把历史也缓存
            }]
        }
    ],
)
```

**多个 cache_control 标记**:Anthropic 最多支持 **4 个 cache breakpoint**。典型分配:

```
breakpoint 1: 在 system 长背景之后
breakpoint 2: 在 tools 之后
breakpoint 3: 在最后一个用户消息之后(把整个历史也缓存)
breakpoint 4: 留作动态数据,如 "今天的日期" 这种每天变一次的
```

> **每条新对话只把"breakpoint 之后的新增内容"作为增量,前面全 cache 命中**——这就是 Claude Code 长 session 跑得起的根本。

---

## 七、tools 的 cache 怎么标

不是给 `tools` 字段标,而是给 tools 列表里**最后一个 tool** 加:

```python
tools = [
    {"name": "t1", "description": "...", "input_schema": {...}},
    {"name": "t2", "description": "...", "input_schema": {...}},
    {
        "name": "t3",
        "description": "...",
        "input_schema": {...},
        "cache_control": {"type": "ephemeral"}    # 这里
    },
]
```

**含义**:从 messages 开头到 t3 结尾的所有内容(system + tools t1..t3)都被缓存。

---

## 八、Streaming 下 cache 的体验

streaming 第一次写 cache 时**TTFB 会比无 cache 慢一点点**(写入开销);但命中 cache 时,**TTFB 提速极明显**——直接跳过几千 token 的处理,~200ms 内开始流。

> Claude Code 让你感觉到"几乎秒响"——cache 是核心原因。

---

## 九、常见错误:cache 没命中

按这清单排查:

1. **system prompt 里有"今天日期" / 时间戳 / 用户名**——每次都不一样,前缀变化。**把动态部分挪到最后一个非缓存块**
2. **tools 排序变了**——LLM 框架 autosort 可能把工具列表洗牌。**显式固定顺序**
3. **少一个空格 / 标点**——精确匹配,改一个字符就 miss。**system 用常量 / 文件**
4. **历史消息里有时间戳 / id**——比如 "你的 session_id 是 X"。**这种动态信息别进 history**
5. **测试用了不同的 model**——cache 按 (model, prompt) 维度。换模型 cache 失效
6. **TTL 过期**——5min 没人发请求,cache 已经被清。重新写
7. **token 太短**——cache 有最低 token 阈值(每个模型不同,Sonnet 大致 1024+ 才生效);太短的 prompt cache 不起作用

**调试**:打印 `resp.usage`:

```
cache_creation_input_tokens   # 这次新写入了多少
cache_read_input_tokens       # 这次命中了多少
input_tokens                  # 实际新内容
```

理想长 session 第二条之后:

```
cache_creation_input_tokens=0
cache_read_input_tokens=10000+
input_tokens=很小
```

---

## 十、什么场景该缓存什么

| 场景 | 该缓存什么 |
| --- | --- |
| 客服机器人 | system + 公司知识库前置文本 + tools |
| Coding Agent | system + tools + CLAUDE.md + 长 session 历史 |
| RAG | system + 工具定义(检索 / 引用工具) |
| 文档 QA | system + 整篇文档(用户每问一次都命中) |
| 批量数据抽取 | system + 抽取 schema + few-shot 例子 |

> 万能公式:**任何"长 + 稳定"的部分都该 cache**;短 + 多变的部分才不缓存。

---

## 十一、几个实用模式

### 11.1 Few-shot 缓存

```python
system = [
    {"type": "text", "text": "你是抽取助手,从输入里抽订单字段。"},
    {
        "type": "text",
        "text": FEW_SHOT_EXAMPLES,   # 5 个 example,长,稳定
        "cache_control": {"type": "ephemeral"}
    }
]
```

每个 case 都命中 few-shot,不用每次重新发。

### 11.2 多用户客服

每个用户的对话独立,但**system + tools + 公司知识库**全相同。把这部分缓存,**所有用户共享同一个 cache**——Anthropic 后端按 prompt 哈希命中,不是按用户。

### 11.3 RAG 检索结果不要全 cache

刚检索出来的文档块每次不一样,**别加 cache_control**;但 system + tools 仍然该缓存。

---

## 十二、和 Claude Code 的关系

Claude Code 重度用 cache:

- system prompt(几千 token)
- tools 定义(包括所有 MCP tools)
- CLAUDE.md
- 长 session 的早期对话

`/compact` 命令会主动压缩历史——压缩之后**重新写一次 cache**,从压缩点开始作为新前缀。**这就是为什么长 session 不会无限慢、无限贵**。

> 第 22 篇会讲 Compaction 的细节。

---

## 十三、踩坑

1. **不开 cache**——写应用第一周看账单都吓一跳;**默认就该开**
2. **缓存了"动态部分"**——日期 / token / 用户名进 system,每次变前缀,cache 永远 miss
3. **test 跑得快但生产 miss**——本地测时是连续发,5min 内命中;生产发一次隔半天,过期
4. **breakpoint 放错位置**——放第一个 message 后面,后续历史每条都让 cache 失效
5. **>4 个 breakpoint**——超出报错;**只用最关键的几个**
6. **tools 顺序不固定**——某些框架 autosort,prompt 看起来一样实际 miss
7. **cache 短于阈值还问"怎么没生效"**——Sonnet 大约 1024+ token 才有效,小 prompt 不缓存
8. **测试时改了一字 cache miss 自然反应是"cache 没用"**——不是,是改字符就该 miss;长 session 里整段不动才命中
9. **1h cache 滥用**——每天跑一次的批处理用 1h,加价 2x 但完全没读过,纯浪费
10. **不监控 cache 命中率**——生产应用 30% 命中率和 95% 命中率账单差异 5 倍以上;**`/cost` 风格的统计要做**

---

下一篇:`15-ExtendedThinking.md`,讲 Claude 4.x 的 extended thinking——budget tokens、interleaved thinking with tool use、什么场景该开。
