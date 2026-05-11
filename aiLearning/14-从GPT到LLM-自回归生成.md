# 从 GPT 到 LLM:自回归生成

13 篇把 Transformer Block 拆透了。这一篇回答两个问题:

1. **为什么"猜下一个词"这件看起来很笨的事,能做出像样的智能?**
2. **2017 到 2026,Transformer 是怎么一路膨胀成 GPT-5、Claude 4.7 这种"会推理的怪物"的?**

> 一句话先记住:**LLM = Decoder-Only Transformer + 自回归 next-token prediction + 大规模预训练 + 后训练对齐**。这四个东西哪一样都不能少。

---

## 一、Encoder-Only / Decoder-Only / Encoder-Decoder

13 篇讲过,2026 年 Decoder-Only 一统江湖。但回到 2018 年,三派旗鼓相当。先把分歧讲清楚:

| 流派 | 代表 | 训练任务 | 看序列方向 | 适合 |
| --- | --- | --- | --- | --- |
| Encoder-Only | BERT、RoBERTa | MLM(完形填空) | 双向 | 分类、抽取、语义匹配 |
| Decoder-Only | GPT、Claude、Llama | Next Token Prediction | 单向(只看左边) | 生成、对话、推理 |
| Encoder-Decoder | T5、BART、原 Transformer | seq2seq 各种任务 | Encoder 双向 + Decoder 单向 | 翻译、摘要 |

```
BERT(Encoder-Only):
  输入:[CLS] I [MASK] you [SEP]
  目标:猜出 [MASK] 是 "love"

GPT(Decoder-Only):
  输入:[BOS] I love
  目标:预测下一个词 "you"

T5(Encoder-Decoder):
  输入(Encoder):translate English to Chinese: I love you
  输出(Decoder):我  爱  你
```

> **关键差异**:BERT 看双向但不能直接生成,GPT 只看单向但天然能生成。这个**单向 vs 双向**之争,是 2018-2022 之间整个 NLP 的主旋律。

---

## 二、Decoder-Only 的自回归:next token prediction

GPT 的训练目标极简:**给定前面的 token,预测下一个 token**。

```
训练数据(一句话当 N 个训练样本):
  "我 爱 你"

训练时(并行,所有位置一起):
  位置 0: 看 [<bos>]                  → 预测 "我"
  位置 1: 看 [<bos>, 我]              → 预测 "爱"
  位置 2: 看 [<bos>, 我, 爱]          → 预测 "你"
  位置 3: 看 [<bos>, 我, 爱, 你]      → 预测 "<eos>"

loss = CrossEntropy(每个位置的预测 vs 真实下一个 token) 的平均
```

数学上:

```
L = -Σ log P(x_t | x_<t; θ)         # 负对数似然(就是 CE loss)
```

推理时也是同一套机制,只是**串行生成**,把上一步的输出接到输入末尾再跑一次:

```python
# 极简的自回归生成循环
def generate(model, tokens, max_new=100):
    for _ in range(max_new):
        logits = model(tokens)              # (1, N, vocab)
        next_token = logits[:, -1].argmax(dim=-1)   # 取最后位置 + greedy
        tokens = torch.cat([tokens, next_token[:, None]], dim=1)
        if next_token.item() == EOS:
            break
    return tokens
```

> **核心问题**:为什么这么简单的目标能 scale 出智能?
>
> 因为"预测下一个词"这件事,**逼着模型隐式学会了世界上几乎所有结构化知识**:
> - 要预测下一个词是 "Paris" 还是 "London",得知道地理
> - 要预测下一个词是数学表达式的对的下一个,得"会算"
> - 要预测下一个词补全一个论证,得有逻辑
>
> 一个足够强的下一个词预测器 = 一个压缩了人类知识的世界模型。这是 Sutskever 反复强调的观点。

---

## 三、KV Cache 直觉

推理时一个不起眼但极重要的优化。33 篇会详讲实现,这里建立直觉。

朴素自回归生成的问题:**每生成一个新 token,都要把整段输入再跑一遍 Transformer**。

```
step 1: 输入 [a]            算 N=1 个位置的 attention
step 2: 输入 [a, b]         算 N=2 个位置(其中 [a] 又重算了一次)
step 3: 输入 [a, b, c]      算 N=3 个位置(其中 [a, b] 又重算了一次)
```

仔细看 **causal mask 下,过去 token 的 K、V 永远不变**——它们看不到后面的 token。所以可以缓存:

```
step 1: 算 K_1, V_1,缓存
step 2: 只算 K_2, V_2,接到缓存后面;新 Q_2 和 [K_1, K_2] 算 attention
step 3: 只算 K_3, V_3,接到缓存后面;新 Q_3 和 [K_1, K_2, K_3] 算 attention
```

| 不用 KV Cache | 用 KV Cache |
| --- | --- |
| 每步 O(N²) 计算 | 每步 O(N) 计算 |
| 生成 100 token 慢 | 快 10 倍以上 |
| 显存:不需 | 显存:N · num_layers · 2 · d_model |

代价是显存。一个长 prompt(几万 token)的 KV Cache 可能占几 GB。这就是为什么:

- API 计价里 input token 比 output token 便宜(input 一次 prefill,output 每个都要 decode)
- vLLM、SGLang 这些推理框架都在围绕 KV Cache 做优化(PagedAttention、Prefix Caching)
- Anthropic、OpenAI 都推 prompt caching 功能,本质是把常用 prompt 的 KV Cache 持久化

> 33 篇会从工程角度讲 KV Cache 的存储布局、连续 batch、Prefix Sharing 等。这里你只要记住**KV Cache 让自回归生成从 O(N²) 降到 O(N)**,是现代 LLM 推理性能的命脉。

---

## 四、BERT vs GPT 的范式分野

2018-2020 这段时间,业界普遍认为 BERT 派会赢。原因合理:

| 维度 | BERT(Encoder-Only) | GPT(Decoder-Only) |
| --- | --- | --- |
| 看上下文 | 双向 | 单向 |
| 在 GLUE/SQuAD 上 | 直接 SOTA | 需要更多 trick |
| 生成 | 不能直接生成 | 天生会生成 |
| 训练任务 | MLM(填空) | Next Token Prediction |

BERT 的 MLM 看起来更"扎实"——能利用全文信息,还能针对不同下游任务微调出各种小模型。当时的范式是:**预训练一个 BERT,针对每个任务 fine-tune 出一个分类头**。

GPT 走的是另一条路:**所有任务都重新表达成"续写"**。

```
分类:"评价: 这电影真好看  情感:" → 续写 "正面"
QA:  "问: 中国首都  答:" → 续写 "北京"
翻译:"翻译: I love you ->" → 续写 "我爱你"
```

这就是 **Prompt 范式**的雏形。到 GPT-3 时,这个范式优势开始压倒 BERT:

| 维度 | BERT 派 | GPT 派 |
| --- | --- | --- |
| 适配新任务 | 必须 fine-tune | **改 Prompt 就行**(in-context learning) |
| 模型数量 | 每个任务一个 | 一个模型万能 |
| Scale 效果 | 边际收益递减 | 越大越通用 |
| 用户接口 | API 接 + 后处理 | 一个对话框搞定 |

> **决定性时刻**:2020 GPT-3(175B),展示了"用大参数 + 大数据 + 单纯 next token prediction"也能在 zero-shot/few-shot 下打 BERT-style fine-tune,而且**接口通用**。从这刻起,大家发现 BERT 这条路 scale 不上去。

---

## 五、为什么 Decoder-Only 赢了

复盘下来,Decoder-Only 的胜利不是偶然:

### 1. 接口统一:一切皆生成

写代码、聊天、做数学题、调 API、规划任务——**全都能表达成"输入 prompt → 输出文本"**。这种接口的统一性,让一个模型能干所有事,也让用户不用学 N 套 API。

### 2. Scale 友好

经验上,Decoder-Only 的 loss 和参数量、数据量、算力的关系非常干净(这就是 Scaling Law,19 篇详讲)。**给资源就涨能力,这是工业化的前提**。

### 3. 训练目标无歧义

Next Token Prediction 没有任何 trick:就是 CE loss,就是预测下一个 token。BERT 的 MLM 还有 mask 比例怎么选、是否要 NSP(下一句预测)等讨论,GPT 这边干净得多。

### 4. 自然支持 in-context learning

放几个 example 在 prompt 里,模型就能照着例子做新任务。这个能力来自"模型在预训练时见过类似分布的多任务混合数据",是 Decoder-Only + Scale 涌现出来的。

### 5. 工程链路成熟

KV Cache、流式输出、推理优化、RLHF、function calling……整个生态都围绕 Decoder-Only 建。BERT 派想跟上得重新搞,但 BERT 的市场已经被吃掉了。

> **2026 年共识**:除非你有非常具体的需求(比如端侧分类、embedding 检索),否则就用 Decoder-Only LLM。23 篇会专门讲 embedding 模型,那是 BERT 派至今还活着的领域。

---

## 六、Scale 的故事

把过去几年的旗舰模型摆一起,数字一目了然:

| 模型 | 年份 | 参数量 | 上下文 | 关键事件 |
| --- | --- | --- | --- | --- |
| GPT-1 | 2018 | 117M | 512 | 证明 pretrain + finetune 可行 |
| GPT-2 | 2019 | 1.5B | 1024 | "太危险不能放出来"梗 |
| GPT-3 | 2020 | **175B** | 2048 | few-shot 在线,Decoder-Only 初次封神 |
| InstructGPT / ChatGPT | 2022 | 175B | 4k | RLHF + 对话,产品爆炸 |
| GPT-4 | 2023 | ~1.8T(MoE,推测) | 8k → 128k | 多模态、推理跃升 |
| GPT-4o | 2024 | 未公开 | 128k | 原生多模态、低延迟 |
| o1 / o3 | 2024-2025 | 未公开 | 128k+ | "思考链推理",强化学习对齐 |
| **GPT-5** | 2025-2026 | 未公开(估 数 T 级) | 1M+ | 更强推理、更长 context、更稳工具使用 |

Anthropic 这条线:

| 模型 | 关键事件 |
| --- | --- |
| Claude 1 / 2 | 2023,主打长 context(100k)、Constitutional AI |
| Claude 3(Opus/Sonnet/Haiku) | 2024,三档分级,Opus 对标 GPT-4 |
| Claude 3.5 / 3.7 Sonnet | 2024-2025,Sonnet 性价比之王,Computer Use 出现 |
| Claude 4 / 4.5 / **4.7** | 2025-2026,**1M context、可控 thinking、agent 一线** |

其他重要选手:Google Gemini(2 / 2.5 / 3,2M context、原生多模态),Meta Llama 3 / 4(开源旗舰,商用主流),Mistral / Qwen / DeepSeek(国产/欧洲开源强力)。

> **Scale 的另一个侧面**:**模型不是简单"变大",而是同时**:
> - 训练数据从几百 GB 扩到 PB 级
> - 训练算力从单机 GPU 扩到几万张 H100/B200
> - 上下文从 2k 扩到 1M+
> - 训练范式从 next-token 加入 SFT、RLHF、RLAIF、过程奖励、思考链 RL 等
> 19 篇专讲 Scaling Law,17 篇讲训练范式演进。

---

## 七、Scaling Law 与涌现的伏笔

为什么大家敢往里砸百亿美金?**因为 Scaling Law 是经验上可预测的**。

OpenAI 2020 年的论文给出:

```
Loss(N, D, C) ≈ A · N^(-α) + B · D^(-β) + C^(-γ)
```

N = 参数量,D = 数据量,C = 算力。**给定预算,你能算出最优 N 和 D**。

DeepMind 2022 年的 Chinchilla 论文修正了配比:**参数和 token 数应该 1:20 大致同步增长**。这直接指导了 Llama 系列(7B → 1.4T tokens,接近这个配比)。

**涌现(Emergent Abilities)**:有些能力(比如多步算术、链式推理、follow 多步指令)在小模型上**完全不会**,模型大到某个临界点突然就有了。这是 GPT-3 之后大家不再小打小闹的根本原因——你不知道下一个 10x scale 会冒出什么新能力。

> 19 篇会展开 Scaling Law 的细节、Chinchilla 的修正、最近"推理时算力 scale"(o1/o3 类)的范式。先建立直觉:**今天主流 LLM 训练的费用动辄数千万到数亿美金,押的就是 Scaling Law 不会失效**。

2024-2026 这两年的新故事是 **inference-time scale**:让模型在推理时多想一会儿(o1、o3、Claude 的 extended thinking),效果远好过单纯把参数堆更大。这是 LLM 进入"会推理"阶段的标志。

---

## 八、自回归的根本缺陷

把 LLM 吹完,得给一盆冷水。**自回归生成有几个绕不过去的硬伤**:

### 1. 幻觉(Hallucination)

模型的目标只是"下一个 token 概率最大",不是"说真话"。当训练数据没覆盖到、或者模型推理失败时,它会**自信地编造**。

```
你: 介绍一下《2025 年深度学习圣经》这本书。
LLM: 这本书由 Yann LeCun 和 Geoffrey Hinton 合著,2025 年出版,共 800 页……(完全编的)
```

为什么会这样:loss 函数从来没说"不会就别说",它的目标就是"接出概率最高的下一个 token"。

### 2. 不能"想清楚再写"

一旦输出第一个 token,就不能反悔了。**前几个 token 错了,后面就一路跟着错**:

```
问: 27 × 38 = ?
传统 LLM: 直接答 → "1100"(错的,正确是 1026)
```

为什么?因为传统自回归没有"先在心里草稿,再下笔"这个机制。**所有思考都必须以 token 形式表达出来才存在**。

这就是 **Chain-of-Thought(CoT)** prompt 兴起的原因——让模型先输出推理过程,再得结论:

```
问: 27 × 38 = ?
LLM(加 "step by step"): 
  27 × 38 = 27 × (40 - 2) 
         = 27 × 40 - 27 × 2 
         = 1080 - 54 
         = 1026
```

更进一步,o1、o3、Claude extended thinking 把 CoT 做成**默认机制**:

| 传统 LLM | "会想"的 LLM |
| --- | --- |
| 输入 prompt → 直接答 | 输入 prompt → 内部"思考"几千 token → 答 |
| 输出 = 思考 | 思考 ≠ 输出(可隐藏) |
| 算力主要花在训练 | 大量算力花在推理时思考 |

这套范式来自 **inference-time scaling + 强化学习**(让模型自己学怎么"想得更对",而不是只学"接得更顺")。

### 3. 长度归一性

自回归是"一路向前",**没法回头改**。Diffusion 类的非自回归模型在图像和小规模文本上有不同特性,但在通用 LLM 上,自回归依然是 2026 年的最优解。

> 17 篇讲训练范式时会展开 RLHF / RLAIF / 过程奖励等。要点先记住:**单纯 next-token prediction 解决不了"想清楚再说"的问题,需要在训练阶段引入额外的目标信号**。

### 4. 对齐成本

裸预训练出来的模型不会"听话",会瞎说、会跑题、会被诱导说危险内容。要做成 ChatGPT、Claude 这种产品,需要 SFT + RLHF + Constitutional AI / RLAIF 等大量后训练工程。**对齐有时候比预训练还贵**。

---

## 九、给应用工程师的影响

如果你是做应用层的(写 Agent、做 RAG、搭 AI 产品),上面这些原理直接决定你怎么用 LLM:

1. **理解"上下文 = KV Cache"**:你给 LLM 的每个字都要花钱花延迟。**精简 prompt、用 prompt caching、合理切 chunk** 是基本功(24 篇详讲 Context Engineering)
2. **接受幻觉是常态**:别指望 LLM 自己"知道自己不知道"。重要事实**必须 RAG 进去 + 要求引用**(22 篇)
3. **复杂任务先让它想**:能加 CoT 就加,能用 thinking 模式就用。**别让它"一口气说出来"**
4. **流式输出是 UX 必需品**:自回归本质是 token 流,前端**别等全部返回再渲染**,否则用户体感差到爆
5. **不同模型选型有差异**:
   - 高质量推理 → Claude 4.7 / GPT-5 / Gemini 3
   - 低延迟 / 大批量 → Haiku / GPT-5-mini / Gemini Flash
   - 私有部署 → Llama 4 / Qwen / DeepSeek
6. **API 计费看 input/output**:写长 prompt 比写长输出便宜,但都要花钱;**长 context 不等于免费**
7. **不要纠结 "GPT 还是 Claude"**:能力相近,挑顺手的。**关键是设计好 prompt、上下文、工具,这些迁移成本很低**(2026 各家 API 早就互通)
8. **理解涌现 = 理解模型的"性格"**:不同 size 的模型适合不同任务,**给小模型分类、给大模型推理**,合理分工省钱省延迟

> **一个底层心智模型**:LLM 是一个被压缩了人类大量知识的"概率续写器"。**理解这件事,你就不会指望它代替数据库,也不会用它做精确计算**(那些用工具调用解决,21 篇)。

---

下一篇:`15-Tokenizer与BPE.md`,补完 LLM 的最后一块拼图——**文字到 token 是怎么变的**。看完你才能彻底理解为什么 emoji 算 5 个 token、为什么中文按 API 计费比英文贵、为什么模型对某些"切错位置"的输入会犯傻。
