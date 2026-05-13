# SGLang 与 RadixAttention:为复杂 LLM 程序写的运行时

vLLM 把单轮推理的吞吐拉到 SOTA,但生产里大量请求根本不是单轮:RAG 跨多个 chunk、Agent 多次工具调用、Tree-of-Thought 一次开几个分支、结构化输出要求 JSON 严格合法。这些场景下 vLLM 的 prefix caching 命中率会掉(因为它只看请求间的根前缀),decode 也跑不快(因为 JSON 里大量 token 是确定的,模型却挨个采样)。SGLang 是 LMSYS(写出 Vicuna、做 Chatbot Arena 的那帮人)2024 年开源的引擎,**目标不是再压一点单轮吞吐,而是把"复杂 LLM 程序"当一等公民来跑**。这一篇拆它的三件武器:RadixAttention、Compressed FSM、Python DSL 前端,以及和 vLLM 的工程位置差。

> 一句话先记住:**vLLM 的世界观是"一堆独立请求要榨吞吐",SGLang 的世界观是"一段 LLM 程序要跑得聪明"**。RadixAttention 把多请求间的任意公共前缀都缓存复用,Compressed FSM 让结构化解码一次推多个确定 token,前端 DSL 让多轮 / 分支 / 并行变成可被引擎看见的执行计划。简单 chat 场景两者打平;Agent / 多轮 / RAG / 强结构化场景,SGLang 通常 2-5 倍 vLLM。

---

## 一、为什么 vLLM 在这些场景不够用

把 prefix caching 和 RadixAttention 摆到一起就清楚了:

```
vLLM 的 prefix caching(逻辑视图):
   所有请求共享一个全局 KV block 池,以"完整 prompt 哈希"或
   "块级哈希"做 lookup;命中粒度在 block(典型 16 token)。
   适合:一堆请求挂在同一个 system prompt 后面。
   不适合:请求之间公共前缀复杂、嵌套、动态变化。

典型失效场景:
   Agent 每步累加 history → 第 n 轮的请求和第 n-1 轮共享前 n-1 轮
   ToT 一次开 4 个分支 → 4 个分支共享根前缀,但分支间也共享子前缀
   RAG 检索回不同 chunk → chunk A+B 和 chunk A+C 共享 chunk A
   Few-shot 不同样例混搭 → 共享 system + 样例 1,但样例 2 不同
```

vLLM 不是不能命中,是**命中粒度粗、命中率不稳**——尤其 Agent 多步交互,前一步生成的 assistant 消息进入下一步 prompt,前缀树的形状每秒都在变。SGLang 把这层做到极致:**所有出现过的前缀都活在一棵基数树上,每个新请求在树里走最长公共路径,共享部分一个 token 都不重算**。

再看结构化输出。让模型只能输出合法 JSON 的常见做法是"在每步采样时屏蔽不合法的 token logits"——叫 constrained decoding。这能保证语法对,但**模型仍然在跑 decode**,显存带宽、SM 调度、逐 token 串行,一项也没省。问题是 JSON 里大量位置是确定的:`{"name": "..."` 里的 `{`、`"`、`name`、`":` `"`,只要前一个 token 已定,这些后续 token 概率分布全部是单点(在 grammar 上唯一可能)。SGLang 的 Compressed FSM **把这些确定 token 一次性追加进序列,根本不走采样**。

最后是控制流。多轮、分支、并行在 vLLM 里只能写在客户端:

```python
# 客户端拼 prompt,引擎看不到结构
hist = system_prompt
for turn in range(5):
    hist += user_msg(turn)
    resp = vllm_client.complete(hist)   # 引擎不知道下一轮还会来
    hist += resp
```

引擎拿到的就是一堆独立请求,**它无从知道这 5 个请求共享前 4 轮的 KV**——只能事后靠 prefix cache 救。SGLang 让你把"这是一段程序"声明出来,引擎在执行计划层就知道每一步的依赖、并行性、共享前缀。

---

## 二、RadixAttention:把所有前缀塞进一棵基数树

### 2.1 数据结构

基数树(radix tree / 压缩 trie)是把"共享前缀的字符串"压成树的经典结构。SGLang 把 KV block 当成"字符",每个节点存一段连续 token 对应的 block 引用:

```
ROOT
 │
 ├── ["你是一个智能助手", BLOCKS[0..2]]
 │    │
 │    ├── ["用户1的问题A", BLOCKS[3..5]]
 │    │    └── ["回复A", BLOCKS[6..7]]
 │    │
 │    ├── ["用户1的问题B", BLOCKS[3..6]]
 │    │
 │    └── ["用户2的问题C", BLOCKS[3..4]]
 │         └── ["回复C", BLOCKS[5..6]]
 │
 └── ["你是一个代码助手", BLOCKS[10..13]]
      └── ["写一个二分查找", BLOCKS[14..18]]
           └── ["def binary_search...", BLOCKS[19..30]]
```

**关键性质**:

- 每条**根→叶**路径就是一个完整的 sequence(prompt + generated)
- 任意两条路径的**公共前缀只算一次**——KV block 只在节点存一份
- 新请求来了,把它的 prompt 在树里**最长公共前缀匹配**,共享部分 prefill 时跳过
- 节点带引用计数,**计数归零才能被驱逐**(LRU 时机和 vLLM 的 block 池类似)

### 2.2 与 vLLM Prefix Cache 的对比

```
                       vLLM Prefix Cache              SGLang RadixAttention
                       ──────────────────             ─────────────────────
共享粒度               block-hash 命中                树节点(自然变长)
共享形状               扁平(多请求挂一个共同根)     任意分叉(树状嵌套共享)
驱逐策略               block 级 LRU                  节点级 LRU + 引用计数
命中查找               哈希查 + chain                树遍历(O(prompt_len))
对动态共享的反应       慢一拍(等下次哈希命中)       即时(树写入即可被后续命中)
对 Agent 的友好度      命中但浪费 reprefill          天然契合,接近 100% 复用
```

工程上最大的差别:**Agent 第二轮的 prompt = 第一轮 prompt + 第一轮 response + 第二轮 user**。在 SGLang 里,第一轮结束时整段(prompt + response)就以路径形式留在树上,第二轮的请求一来,前面那段直接命中,**只算第二轮 user 这部分的 prefill**。vLLM 也能命中但它的命中是"碰巧块哈希一致",对话越长、共享段越复杂,SGLang 越占优。

### 2.3 一个最小可量化的例子

设想一个 Agent,system prompt + 工具描述合计 4000 token,每轮新增 user 100 token,assistant 回复 200 token。跑 5 轮:

```
轮次   累计 prompt 长度        无 prefix cache (vLLM 早期)   SGLang RadixAttention
────  ────────────────         ──────────────────────────    ─────────────────────
1     4000                      prefill 4000                  prefill 4000
2     4000+100+200+100=4400    prefill 4400(全重算)         prefill 100(只算新 user)
3     4400+200+100=4700        prefill 4700                  prefill 100
4     4700+200+100=5000        prefill 5000                  prefill 100
5     5000+200+100=5300        prefill 5300                  prefill 100

总 prefill token        4000+4400+4700+5000+5300 = 23400      4000+100×4 = 4400
                                                              ≈ 5x 节省
```

**5x 的 prefill 节省直接转化成 TTFT 和总吞吐**——尤其 Agent 这种 prefill 占总耗时大头的场景。vLLM 加了 prefix caching 之后能拿到大部分收益,但**前提是块边界对齐 + 完全相同**;一旦中间有个时间戳、随机 ID、轮次编号,命中率就崩。

### 2.4 不要把它当神药

- **请求之间没有公共前缀** → RadixAttention 退化成普通 KV 池,和 vLLM 没差别
- **吞吐型单轮 chat**(每个用户一段独立的短 prompt)→ vLLM 更稳
- **树节点数量爆炸**(几十万 session、每个有独立 history)→ 树本身的内存和遍历开销会显著,需要按 session TTL 主动驱逐
- **驱逐发生时不可控**——一个高频共享的根前缀如果被 LRU 误清,后续命中全失

---

## 三、Compressed FSM:结构化解码一次推多个确定 token

### 3.1 痛点

```
模型生成 JSON: {"name": "Alice", "age": 30}

逐 token 看:
  step 1: { (确定,grammar 规定开头必须是 {)
  step 2: " (确定)
  step 3: name (高概率)
  step 4: " (确定)
  step 5: : (确定)
  step 6: " (确定)
  step 7: A (模型选)
  step 8: l (高概率)
  ...

朴素 constrained decoding:每个 step 都跑一次 decode,只是在采样前
                          屏蔽掉非法 token。30 个 token 跑 30 次。

观察:step 1, 2, 4, 5, 6 等位置在 grammar 状态机里只有唯一合法 token,
      根本不需要走模型。
```

### 3.2 SGLang 的做法

SGLang 把 grammar(JSON / regex / EBNF)编译成一个 FSM,执行 decode 时:

```
每一步出 logits 后:
  1. 看 FSM 当前状态有几个合法 token
     - 多个    → 正常采样,屏蔽非法 token
     - 唯一    → 跳过采样,直接把这个 token 追加进序列
                 同时更新 KV cache(因为下一步要用)
  2. 推进 FSM 状态
  3. 检查新状态是否还在"唯一态"
     - 是      → 继续追加,直到遇到分叉
     - 否      → 把追加的多个确定 token 压进当前 batch step,
                 算一次 prefill-style 的 forward 把它们的 KV 算出来
```

```
朴素 constrained:
  decode → token1
  decode → token2
  decode → token3   ← 三次完整的 decode forward(各跑一遍模型)

Compressed FSM:
  decode → token1 (模型选)
  FSM:    确定 token2, token3, token4(无需模型)
  一次 prefill-style forward 把 token2-4 的 KV 一并算出
   → 三步合一,decode 调用 1 次而非 3 次
```

实测在 schema 严格的 JSON 抽取任务上,SGLang 的吞吐相对朴素 constrained decoding 快 1.5-3 倍,常见 schema 越规整加速越明显。

### 3.3 为什么这事 vLLM 难做

vLLM 的 outlines / lm-format-enforcer 集成做的是"采样阶段加 mask",**没有改 decode 调用次数**。要做到 SGLang 这种"批量追加确定 token",需要改两处:

- 调度器要接受"这一步该 batch 里有些请求其实跑的是变长 prefill 而不是 1-step decode"
- KV cache 管理要支持"一次插入多个 token 的 KV"(PagedAttention 的 block 写入逻辑要扩展)

vLLM 的连续批架构原本就把每 step 当成"每个活跃请求 +1 token"来调度,改起来不是不行,是动到了主链路。SGLang 一开始就把这个能力当核心来设计。

### 3.4 一段代码

```python
import sglang as sgl

@sgl.function
def extract(s, text):
    s += "Extract the person info from the text:\n" + text + "\n"
    s += sgl.gen(
        "info",
        max_tokens=128,
        regex=r'\{"name": "[A-Za-z ]+", "age": \d+, "city": "[A-Za-z ]+"\}',
    )

state = extract.run(text="Alice is 30, lives in Beijing.")
print(state["info"])
# {"name": "Alice", "age": 30, "city": "Beijing"}
```

这个 regex 里大约 60% 的位置是确定的(`{"name": "`、`", "age": `、`, "city": "`、`"}`),Compressed FSM 把它们一次性追加,只在 name / age / city 的内容位置真正调模型。

更强的形式是 JSON Schema:

```python
@sgl.function
def extract_json(s, text):
    s += "Extract:\n" + text + "\n"
    s += sgl.gen(
        "obj",
        max_tokens=128,
        json_schema='{"type":"object","properties":{"name":{"type":"string"},"age":{"type":"integer"}}}',
    )
```

引擎用 xgrammar 把 schema 编译成 FSM,效果同上。

---

## 四、SGLang 前端:把多轮 / 分支 / 并行写成程序

### 4.1 一段最小多轮 + 工具调用

```python
import sglang as sgl

@sgl.function
def agent(s, user_query):
    # 共享段:system + 工具描述,每个请求都命中 RadixAttention 根前缀
    s += sgl.system("你是助手,可以调用 search(query) 工具。")
    s += sgl.user(user_query)

    # 第一次推理:决定要不要调工具
    s += sgl.assistant(sgl.gen("decision", max_tokens=64,
                                regex=r"(SEARCH:.*|ANSWER:.*)"))

    if "SEARCH:" in s["decision"]:
        query = s["decision"].split("SEARCH:")[1].strip()
        result = my_search(query)            # 实际调外部 API
        s += sgl.user(f"Tool result: {result}")
        # 第二次推理:基于工具结果回答
        s += sgl.assistant(sgl.gen("answer", max_tokens=256))
    else:
        s["answer"] = s["decision"].split("ANSWER:")[1].strip()

state = agent.run(user_query="今年北京最高温?")
print(state["answer"])
```

**KV 复用怎么自动发生**:第一次 `gen("decision")` 跑完,system + tool_desc + user_query + assistant_decision 这一整段以 path 形式留在树上;第二次 `gen("answer")` 的请求是「同一段 + tool_result + assistant_」,前面那段命中,**只 prefill `tool_result + assistant_` 这几十个 token**。客户端不需要做任何缓存管理。

### 4.2 并行分支

```python
@sgl.function
def tot(s, problem):
    s += sgl.system("你是数学家,展开思路再回答。")
    s += sgl.user(problem)

    # 并行展开 4 个思路,4 个分支共享前面 system + user 的 KV
    forks = s.fork(4)
    for i, f in enumerate(forks):
        f += sgl.assistant(sgl.gen(f"thought_{i}", max_tokens=128, temperature=0.9))

    # 收集 4 个思路,选一个最好的
    forks.join()
    thoughts = [s[f"thought_{i}"] for i in range(4)]
    s += sgl.user("以下是 4 个思路,选最有道理的并给出最终答案:\n" +
                  "\n---\n".join(thoughts))
    s += sgl.assistant(sgl.gen("final", max_tokens=256))

state = tot.run(problem="证明根号 2 是无理数")
```

**引擎看见 fork 就知道 4 路并行**:它们共享前段 KV,可以同时塞进同一个 batch step 跑;不需要客户端发 4 次独立请求然后自己等结果。

### 4.3 不写 DSL 也能用

SGLang 也有 OpenAI 兼容 endpoint(`/v1/chat/completions`),不写 DSL 直接像 vLLM 那样发请求,RadixAttention 和 Compressed FSM 仍然生效——只是少了"引擎能看到控制流结构"这一层加成。**对于"我只想换个推理引擎,代码不动"的迁移路径,这条最省事**。

---

## 五、部署:启动一个 SGLang server

```bash
pip install "sglang[all]"

python -m sglang.launch_server \
    --model-path meta-llama/Meta-Llama-3.1-70B-Instruct \
    --port 30000 \
    --tp 4 \
    --mem-fraction-static 0.85 \
    --enable-radix-cache \
    --grammar-backend xgrammar
```

关键参数:

| 参数 | 说明 |
| --- | --- |
| `--tp` | 张量并行度,70B 一般 4 或 8 |
| `--mem-fraction-static` | 模型权重 + 框架预留占总显存比例,剩下给 KV 池 |
| `--enable-radix-cache` | 默认开,显式写出来提醒自己 |
| `--grammar-backend` | `xgrammar`(默认,快)或 `outlines`(老,兼容) |
| `--chunked-prefill-size` | 长 prompt 切块,避免一个长请求阻塞所有 decode |
| `--enable-mixed-chunk` | 同 batch 里 prefill 和 decode 混跑(默认 on) |

OpenAI 兼容客户端直接连 `http://localhost:30000/v1`,SDK 一行不改。

---

## 六、SGLang 跟 vLLM 的工程位置差

```
                                vLLM                     SGLang
                                ────                     ──────
代码风格                    Python + CUDA kernel      Python + CUDA kernel
PagedAttention              核心,首发                同样实现
连续批                      InflightBatching         InflightBatching
Prefix Cache 形态           扁平 hash 命中            基数树
结构化解码                   挂 outlines / xgrammar    一等公民,Compressed FSM
控制流                      客户端拼                  引擎可见(可选)
模型支持广度                极广(几乎所有 HF)        广(主流齐全,长尾略差)
社区 / 生态                 推理事实标准              快速增长,LMSYS 主导
```

### 选型决策

```
你的请求形态是?
├── 大量独立短请求,单轮 chat                  → vLLM
├── 大量请求挂同一长 system prompt              → 都行,vLLM 够用
├── Agent 多轮 / 工具调用 / RAG 多 chunk        → SGLang
├── Tree-of-Thought / 并行 sampling             → SGLang
├── 强 JSON / Schema / Regex 输出               → SGLang
├── 多模型 multi-LoRA 路由                     → vLLM(LoRA 支持更熟)
├── DeepSeek / Qwen MoE 大模型                 → SGLang(MoE 优化更新)
└── 国产卡 / AMD ROCm                          → vLLM(适配更广,SGLang 跟进中)
```

简单说:**默认 vLLM,场景对路了换 SGLang**。两者 PagedAttention 心智一致,迁移成本不高。

---

## 七、不擅长 / 注意事项

1. **纯单轮短回复**——RadixAttention 的树维护开销 + Compressed FSM 的 grammar 编译成本,在没有共享前缀和无结构约束时是纯负担。该场景下 vLLM 简单稳。
2. **会话级隔离要求强**——基数树是全局共享的,严格要求不同租户 KV 不混(出于安全或合规),需要用 namespace / per-tenant pool 隔离,默认行为不区分。
3. **树节点驱逐策略不可控**——LRU 在长尾请求下可能把一个高频共享节点踢掉,造成偶发性能抖动。监控命中率波动比绝对值更重要。
4. **grammar 不正确会卡住**——一个写错的 regex 可能让 FSM 走到死胡同,模型生成不出任何合法 token,要么超时要么死循环。线上必须超时熔断。
5. **`fork` 的并行收益靠 batch 余量**——分支数超过当前 batch 余量,fork 会排队,加速变退化。
6. **TTFT 抖动**——RadixAttention 命中时 TTFT 几乎为零,未命中时和普通 prefill 一致。P50 漂亮但 P99 仍然取决于 prefill 延迟。SLO 算账以 P99 为准。
7. **不要把 system 里写动态内容**(时间戳、随机 ID、user_id)——和 vLLM 同样的雷,命中率秒变 0。
8. **Compressed FSM 在 schema 复杂时收益缩水**——schema 越自由(很多 string、自由对象),"确定 token"位置占比越低,加速越接近 1x。

---

## 八、和 aiLearning 41 篇的边界

aiLearning 41 把三个引擎并列做了入门介绍,本篇只展开"SGLang 的实现机制"。你需要补的:

- **PagedAttention 怎么做的**:08 篇
- **Continuous Batching 调度细节**:09 篇
- **投机解码**:11 篇(下一篇)
- **TensorRT-LLM 极致编译路线**:12 篇
- **Multi-LoRA 路由 / S-LoRA / Punica**:24 篇

41 篇是"知道选什么";本篇是"知道为什么这么实现,什么时候真用得上"。

---

## 九、看完这一篇,你应该能

- 解释 RadixAttention 和 vLLM Prefix Caching 的差别(粒度、形状、命中策略)
- 在白板上画一棵 RadixAttention 树,说清 Agent 多轮共享路径如何形成
- 解释 Compressed FSM 为什么能比朴素 constrained decoding 快 1.5-3 倍(批量追加确定 token)
- 写一段 SGLang DSL,展示多轮 / 工具调用场景下 KV 复用如何自动发生
- 看到一个推理需求,能判断"该用 vLLM 还是 SGLang"
- 知道 SGLang 不擅长的场景(纯单轮短回复、强隔离、不规整 schema)

下一篇:**11 投机解码** — Decode 阶段算力大量空闲,用空闲算力一次推多个候选 token。Speculative / Medusa / EAGLE / Lookahead 四种流派,接受率为什么是关键,为什么大 batch 下投机收益会消失。
