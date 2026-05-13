# 信息论在 ML 与 LLM 里的应用

前三篇把熵、交叉熵、KL、互信息这几把工具讲完了。这一篇是**信息论这一层的收口**——把那几个公式拼起来,看它们在 LLM 训练、评测、推理里**到底是哪个旋钮**。

> 一句话先记住:**LLM 整套技术栈,可以一律视为"用神经网络做的一台压缩机"**。Tokenizer 是字符级压缩的第一道关、cross-entropy loss 是压缩比的代理目标、perplexity 是压缩比的指数版、Scaling Law 是压缩机大小与数据量的最优配比、KV cache 是推理时复用的中间码本。**"压缩即智能"不是文学修辞,是这一层数学的工程后果**。

---

## 一、为什么这篇必须存在

前面 16-18 篇讲的熵、KL、互信息,**单独看像一堆公式;放到 LLM 工程里,它们就是同一根线**:

| 现象 | 用什么数学概念解释 |
| --- | --- |
| 中文 prompt 比英文费 token 30% | tokenizer 的 bits-per-char(熵编码效率) |
| GPT-3.5 perplexity 比 GPT-2 低 30% | cross-entropy 降了 → 压缩比升了 |
| Chinchilla 说 70B 模型该配 1.4T token | 数据信息量 vs 模型容量的配比 |
| MLA / GQA 把 KV cache 砍 4 倍 | 信息冗余 + 低秩近似的应用 |
| RLHF 里的 KL 罚项调 β = 0.1 | 用 KL 限制 policy 偏离 reference 的程度 |

**看完这一篇,你看 Anthropic / OpenAI 的 tech report,能直接读懂里面那些"我们的 BPC 降到 0.65"、"compute-optimal training"、"effective capacity"是在说什么。**

---

## 二、Tokenizer 是字符级压缩

### 2.1 BPE 就是个贪心的压缩算法

BPE(Byte Pair Encoding)原本就是**1994 年提出的一个压缩算法**——只是后来被 Sennrich 2015 年搬到 NMT 里、再被 GPT-2 当成 tokenizer 用红了。它的算法极其朴素:

```
初始化:把语料拆成单字符序列,vocab = 所有字符

重复 V 次(V 是目标词表大小):
  1. 统计当前语料里所有相邻 pair 的频次
  2. 取频次最高的 pair (a, b)
  3. 把它合并成新 token "ab",加入 vocab
  4. 把语料里所有出现的 (a, b) 替换成 "ab"
```

**为什么这个贪心策略和信息论有关**?因为合并最高频 pair = 给最高频模式分配一个更短的码字 = **逼近 Huffman 编码的下界**。BPE 不是最优的(Huffman 才是最优的前缀码),但它**实现简单、能直接处理子词、对训练分布外的词友好**——三件事 Huffman 都做不好。

> **核心直觉**:**好的 tokenizer = 压缩比高的 tokenizer**。同样一段文本,A 用 200 个 token、B 用 250 个 token,A 就比 B 优——因为模型每次推理的算力开销和 token 数成正比,KV cache 大小也和 token 数成正比。

### 2.2 度量 tokenizer 的两个指标

| 指标 | 定义 | 用途 |
| --- | --- | --- |
| **bits per character (BPC)** | 平均每个字符花了多少比特(语言模型的) | 比较跨 tokenizer 的语言模型 |
| **tokens per word** | 平均每个英文单词被切成几个 token | 比较 tokenizer 本身 |
| **compression ratio** | 原始字节数 / token 数 | 工程里最直观的"性价比" |

GPT-4 的 tokenizer(`cl100k_base`)对英文大约是 **4 字节/token**——所以你看到"1 token ≈ 4 个英文字符"这个口口相传的说法。

### 2.3 中英文与代码的 token 效率差异

这是真实数据,来自 OpenAI 的 `tiktoken` 在 `cl100k_base` 词表上的统计:

| 内容类型 | 字符数 | token 数 | 字符/token |
| --- | --- | --- | --- |
| 英文(普通文章) | 1000 | ~230 | 4.3 |
| 英文代码(Python) | 1000 | ~280 | 3.6 |
| 中文(普通文本) | 1000 | ~700 | 1.4 |
| 日文 | 1000 | ~600 | 1.7 |
| Emoji / 罕用字符 | 100 | ~80 | 1.25 |

```
同一段意思的句子:

英文: "The quick brown fox jumps over the lazy dog."
      → 9 个 token

中文: "敏捷的棕色狐狸跳过了懒狗。"
      → 17 个 token(差不多 2x)
```

> **避坑**:**中文用户的 API 账单和上下文消耗大约是英文的 2-3 倍**——这不是 OpenAI 故意,是 BPE 在英文语料上训练出来的 vocab 对中文不友好。**自己训中文模型时,要么用 SentencePiece + 中文语料重训词表,要么用 Qwen / DeepSeek / GLM 系列已经针对中文优化过的 tokenizer**。

### 2.4 为什么 tokenizer 重要

```
压缩比降 20%
  → 同样上下文窗口能塞更多内容
  → 同样训练算力能见更多文本
  → 同样推理 latency 能输出更多内容
  → 单 token cost 不变,总账单降 20%
```

**这就是 DeepSeek-V3 把 vocab 从 100k 扩到 128k、Qwen3 把中文 vocab 单独扩展的原因**——压缩比这个 0.01 都不起眼的小数,乘以万亿 token 的训练量,就是百万美元级的算力。

---

## 三、Perplexity:压缩比的指数版

### 3.1 从交叉熵到 perplexity

交叉熵已经是个"平均每 token 多花多少比特"的指标了,那 perplexity 又是什么?**它只是交叉熵的指数版本,为了让数值更直观**。

```
H(p, q) = -Σ p(x) log q(x)     # 交叉熵(以 e 为底)

perplexity = exp(H(p, q))
           = exp(cross_entropy_loss)
```

**直观解释**:perplexity = "模型在每个位置平均纠结于多少个候选词"。

```
perplexity = 1:   完全确定,下一个 token 100% 猜中
perplexity = 10:  好像在 10 个候选词里随机选
perplexity = 100: 在 100 个候选词里随机选(基本是瞎猜)
```

### 3.2 LLM 评测里的角色

| 模型 | 在 WikiText-103 上的 perplexity |
| --- | --- |
| GPT-2 small (124M) | ~37 |
| GPT-2 XL (1.5B) | ~17 |
| GPT-3 (175B) | ~11 |
| LLaMA 2 (70B) | ~5-7 |
| GPT-4 级 | ~4-5(估计值) |

**注意三件事**:

1. **perplexity 只能在同一份测试集 + 同一份 tokenizer 上比**——换 tokenizer 就没法比了,因为分母都不一样
2. **perplexity 是"在线下任务上的压缩能力代理",和"实际能力"(reasoning、coding、对话)只是弱相关**——所以现在没人单看 perplexity 评模型,都要配 MMLU / HumanEval / 真实下游任务
3. **训练 loss 就是 cross-entropy,所以 `exp(eval_loss)` 直接就是 perplexity**——HuggingFace `evaluate.perplexity` 就是这么算的

> **经验法则**:训练时盯 train loss + eval loss + eval perplexity 这三件,perplexity 一旦反弹了,大概率是 overfit / 数据分布漂移。**别只盯 loss,perplexity 是它的"人类可读版"**。

### 3.3 跨语言比时怎么算

直接比 perplexity 不公平,因为中文 token 短英文 token 长。**正确做法是换算到 BPC**(bits per character):

```
BPC = cross_entropy_per_token × tokens_per_char / ln(2)

# 例:
# cross_entropy_per_token = 2.0 nats/token
# tokens_per_char         = 0.7(中文,大约)
# BPC = 2.0 × 0.7 / 0.693 ≈ 2.02 bits/char
```

**这样跨 tokenizer / 跨语言模型才有可比性**。OpenAI 在 GPT-3 论文里报的 BPC 就是这个量。

---

## 四、信息瓶颈(Information Bottleneck):表示学习的目标

### 4.1 什么是信息瓶颈

Tishby 2015 年提出的视角:**深度网络在做"压缩 + 保留"**——压缩输入 X 里的冗余,保留对预测 Y 有用的信号。

```
输入 X ──[网络中间层]──→ 表示 Z ──→ 输出 Y

目标:min  I(X; Z) - β · I(Z; Y)
      ─────────────  ──────────────
      压缩输入信息   保留预测目标信息
```

- `I(X; Z)` 大:表示里塞了 X 的全部细节(过拟合记忆)
- `I(Z; Y)` 大:表示里保留了预测 Y 需要的信息

`β` 控制这个 trade-off——**β 大 = 更看重保留预测信息(可能不够压缩,泛化差)、β 小 = 更看重压缩(可能丢预测信号,欠拟合)**。

### 4.2 这对 LLM 训练意味着什么

```
LLM 训练目标 = next-token prediction
            = 给定 context X,预测下一个 token Y
            = max log P(Y | X)
            = 在内部表示 Z 里保留对预测 Y 最有用的信息

  → 中间层激活就是 Z
  → 当你扩 hidden_dim,你在加大 I(X; Z) 的"容量"
  → 当 model 学到泛化能力,本质是 I(Z; Y) 上去了、I(X; Z) 没失控
```

**Anthropic / OpenAI 的 mechanistic interpretability 团队就是在干这个**——他们想看清楚 LLM 内部是怎么把 X 压成 Z 的:哪个 head 在追踪句法、哪个 neuron 在编码"周二"、哪一层负责事实知识。**这是信息瓶颈视角的工程具象化**。

> **避坑**:**别把 IB 当成 loss 直接用**——直接优化互信息梯度方差大、采样难。**它是个解释框架,不是个训练目标**。真正训练时,你优化的还是 cross-entropy(那已经隐含了 `I(Z;Y)` 的方向);压缩那一项靠隐式的归纳偏置(网络深度有限、dropout、weight decay 等)。

---

## 五、模型容量:log 参数空间的故事

### 5.1 朴素容量度量

最朴素的容量度量是**参数空间的对数大小**:

```
模型有 N 个 float32 参数
  → 参数空间总状态数 = 2^32 ^ N(理论上)
  → log 容量 ≈ 32N bits
```

但**实际容量远远比这个小**——因为大量参数是冗余的、相关的、可被压缩的。

### 5.2 Lottery Ticket Hypothesis(2018)

Frankle 和 Carbin 发现:**一个训练好的网络里,只需要保留 10-20% 的权重(剪枝后)就能达到几乎一样的精度**——只要这些权重保留训练初始化时的值。

```
训练完 ResNet-50
  → 剪掉 80% 权重 → 重训(从原始 init)→ 精度几乎一样
  → 剪掉 80% 权重 → 重训(从随机 init)→ 精度大幅下降
```

**这说明什么**?**模型的"有效容量" << 参数数量**。大部分参数只是"中奖那张彩票的伴随冗余",没参与最终的决策。

### 5.3 Grokking 现象

Power et al. 2022 在小算术任务上发现:**模型在 train loss 早已为 0、eval loss 还很高的情况下,继续训练几百倍 step,eval loss 突然断崖式下降**——叫 grokking。

```
step 0      train_loss=2.0  eval_loss=2.0
step 1000   train_loss=0.01 eval_loss=1.9   # 已经过拟合记忆
step 100000 train_loss=0.01 eval_loss=0.01  # 突然泛化了!
```

信息论视角解释:**早期模型在用"记忆"压缩 train set(I(X;Z) 高、I(Z;Y) 也高,但 Z 里塞了 X 的全部细节),后期模型在"重构压缩",把 I(X;Z) 降下来——表示变干净了,自然就泛化了**。

> **这两个现象一起说明**:**参数数 ≠ 容量**。给一个模型 70B 参数,**它的"信息瓶颈意义下的有效容量"可能只有 10B 数量级**——这就是 Chinchilla 数据-参数比的物理基础。

---

## 六、Chinchilla:计算最优的配比

### 6.1 Scaling Law 的核心问题

**给定固定算力 C**(单位:FLOPs),应该选**多大的模型 N**、训**多少 token D**,才能让 loss 最小?

DeepMind 2022 年的 Chinchilla 论文,通过 400+ 次训练实验拟合出:

```
最优配比:N* ∝ C^0.5,  D* ∝ C^0.5
         即 N* 和 D* 应该等比例增长

经验值:每 1 个参数,配大约 20 个训练 token
```

**这就是著名的 "20:1" 法则**。

| 模型规模 | Chinchilla 最优 token 数 |
| --- | --- |
| 1B | 20B |
| 7B | 140B |
| 70B | 1.4T |
| 175B | 3.5T |
| 405B | 8T |

**GPT-3 是显著"参数过剩 / 训练不足"的**:175B 参数只训了 300B token,远小于 Chinchilla 建议的 3.5T。这就是为什么 LLaMA-65B(只有 GPT-3 一半参数、训了 1.4T token)能达到甚至超过 GPT-3 的性能——**它更接近 compute-optimal 点**。

### 6.2 为什么是 20:1(信息论直觉)

```
模型容量(可记忆的信息量)≈ N · k bits(每参数大约 k bits)
训练数据信息量(交叉熵下界)≈ D · BPT bits(每 token 大约 BPT bits)

最优:模型容量 ≈ 数据信息量
     N · k ≈ D · BPT
     D / N ≈ k / BPT ≈ 常数(经验上约 20)
```

**直觉**:**模型每个参数能"装"大约 1-2 bits 的信息,每个 token 大约也带 1-2 bits 信息——所以等比例增长**。如果模型大得多,后期参数装的是"噪声"(过拟合);如果数据多得多,模型记不下,等于在浪费数据。

> **避坑**:**20:1 是"compute-optimal"——指"用一次性训练算力换最低 loss" 的最优**。**它不是"推理友好"的最优**——LLaMA-2 / 3 都故意训得超过 Chinchilla(7B 训 2T token、70B 训 15T+),因为推理成本远大于训练成本,**多花训练算力换一个更小但更聪明的模型,长期省钱**。这是 2023 年后业界主流口径。

### 6.3 Chinchilla 计算器(给直觉用)

```python
# 极简 Chinchilla 估算
def chinchilla(params_b, tokens_per_param=20):
    """
    params_b: 参数量(单位:十亿)
    返回:建议训练 token 数(单位:十亿)、训练 FLOPs(估计)
    """
    tokens_b = params_b * tokens_per_param
    # 训练 FLOPs ≈ 6 · N · D(Chinchilla 论文经验式)
    flops = 6 * (params_b * 1e9) * (tokens_b * 1e9)
    return {
        "params_B": params_b,
        "tokens_B": tokens_b,
        "training_FLOPs": flops,
        "training_PFLOPs_days": flops / (1e15 * 86400),
    }

print(chinchilla(70))
# {'params_B': 70, 'tokens_B': 1400, 'training_FLOPs': 5.88e+23,
#  'training_PFLOPs_days': 6805}  # ~6800 PFLOPs-day
```

**这就是你看 tech report 时心里要有的那把尺**——给个参数量,你心里立刻有"这模型该训多少 token、得花多少 H100·天"的量级感。

---

## 七、LLM 是世界知识的有损压缩器

### 7.1 "压缩即智能" 的来源

Ilya Sutskever 2023 年在 Simons Institute 讲座里说:

> "Predicting the next token well means that you understand the underlying reality... Compression is intelligence."

Anthropic 的 *Towards Monosemanticity* 系列、Jack Rae 在 Stanford 的 Compression for AGI talk 都在重复这个观点。**这不是文学修辞,有严格的信息论基础**:

```
1. 训练 LLM 的 loss = next-token cross-entropy
                    = 给整段语料编一个码本,平均每 token 占多少比特

2. 优化这个 loss = 让码本更短 = 压缩比更高

3. 一段文本的最优压缩,需要"理解"它内部所有的规律 / 关系 / 知识
   ——这就是 Kolmogorov complexity 的工程逼近

4. 所以训得越好的 LLM,等于"对人类语言+知识的更好的有损压缩器"
```

### 7.2 工程后果

| 现象 | 用"LLM 是压缩器"视角的解释 |
| --- | --- |
| 模型涌现出能力 | 数据规模到一定量,压缩它必须建立"概念" → 涌现 |
| 多语言迁移能力 | 共享词汇 / 句法的部分被压缩成共享表示 |
| Fine-tune 比 prompt 强 | 更新参数 = 调整压缩的码本,prompt 只是查表 |
| 重复 prompt 浪费 token | 给同样的内容多次推理 = 重复解压 |
| RAG 比纯 LLM 知识新 | RAG 把"新知识"作为外部存储,LLM 只压缩通用规律 |
| Quantization 不掉太多分 | 压缩器对自身参数的微小扰动鲁棒(大多数 bit 是冗余的) |

> **核心直觉**:**当你把 LLM 看成"训练时压缩了人类全网文本的 lossy compressor、推理时按 prompt 解压"——你之前所有关于 LLM 的疑惑(为什么会幻觉、为什么 RAG 有用、为什么 SFT 改不动核心能力)都有了一致的解释**。

---

## 八、KV cache 与推理时的信息论

### 8.1 KV cache 是什么、为什么大

Transformer 自回归解码时,每生成一个 token,需要 attention 关注前面所有 token 的 Key/Value。**为了避免重复计算,把前面的 K、V 存起来——这就是 KV cache**。

```
单个 token 的 KV 大小 = 2 (K and V) × num_layers × num_heads × head_dim × dtype_bytes

例:LLaMA-70B
  layers=80, heads=64, head_dim=128, fp16(2 bytes)
  → 单 token KV = 2 × 80 × 64 × 128 × 2 = 2.6 MB / token

  → 8K context 一次推理:2.6 MB × 8000 ≈ 20 GB!
```

**这就是为什么大上下文窗口又贵又慢**——KV cache 线性增长,显存压力极大。

### 8.2 MLA / GQA:信息论压缩在 KV cache 上的应用

**Group Query Attention(GQA)**:不同 head 共享 K/V——损失一点表达力,把 KV 缩到 1/N。LLaMA-2 / 3 都用 GQA(num_kv_heads=8 / num_heads=64,缩 8×)。

**Multi-Head Latent Attention(MLA,DeepSeek-V2/V3)**:更激进——**把 K/V 先压到一个低秩的 latent vector,推理时再解压**。

```
传统 MHA:        K,V ∈ R^d_model    每 token 存 2 × d_model
GQA:             K,V ∈ R^d_model/g  每 token 存 2 × d_model / g
MLA (DeepSeek):  latent ∈ R^d_c     每 token 存 d_c(d_c << d_model)
```

**信息论视角**:**这是把 KV 这个"中间表示"用低秩或共享的方式重新编码——本质就是再压一道**。代价是表达力损失,但实验证明 MLA 在很多任务上几乎无损,KV cache 砍 4× 以上。

### 8.3 量化也是压缩

| KV cache 量化 | bit / 值 | 显存节省 | 精度损失 |
| --- | --- | --- | --- |
| fp16(基线) | 16 | 1× | 0% |
| int8 | 8 | 2× | <1% |
| int4 | 4 | 4× | 1-3% |
| 2-bit (KIVI / KVQuant) | 2 | 8× | 3-5% |

**量化的本质就是"用更少 bit 表示同样的信息分布"——信息论的核心问题**。低比特量化能 work,是因为 KV cache 里大部分值的分布是高度集中的(信息熵远小于均匀分布的 16 bit 上限),用 4-bit 量化已经接近熵下界。

> **工程经验**:**KV cache 内存占总推理显存的 50-80%(在长 context 下)**——这是为什么 vLLM、SGLang、TensorRT-LLM 都在 KV cache 管理上花大力气(PagedAttention、prefix sharing、量化)。KV cache 砍一半,服务吞吐就翻一倍。

---

## 九、工程对应与局限

### 9.1 工具链速查

| 任务 | 工具 / API | 一行代码 |
| --- | --- | --- |
| 算 token | `tiktoken` | `tiktoken.encoding_for_model("gpt-4").encode(text)` |
| 训 BPE tokenizer | `sentencepiece` / `tokenizers` | `SentencePieceTrainer.train(...)` |
| 算 perplexity | `evaluate` (HF) | `evaluate.load("perplexity").compute(...)` |
| 算 cross-entropy loss | `torch.nn.CrossEntropyLoss` | `F.cross_entropy(logits, labels)` |
| 转 cross-entropy ↔ perplexity | `torch` | `perplexity = torch.exp(loss)` |
| Chinchilla 估算 | 上面那段代码 / 在线计算器 | `chinchilla(params_B=7)` |
| KV cache 大小估算 | `transformers.AutoConfig` 手算 | `2 × L × H × D × 2 / 1e9 GB/token` |

### 9.2 真实排错场景

**场景 1**:中文用户报告"GPT 比中文模型短上下文还慢"
- 看 tokenizer:用 `tiktoken` 数同一段中文 prompt 在 cl100k_base 和 Qwen tokenizer 下分别多少 token,**一般差 1.5-2 倍**
- 解决:中文场景考虑用国产模型的 tokenizer / API

**场景 2**:训练 loss 平了但 perplexity 反弹
- 多半是 eval set 分布漂移 / overfit 训练分布
- 看 train loss + eval loss + eval perplexity 三条曲线,perplexity = exp(eval_loss),反弹说明 eval 在恶化

**场景 3**:7B 模型只训了 200B token,跑分远低于 LLaMA-2-7B
- 对照 Chinchilla:7B 至少 140B token 起步,LLaMA-2 用了 2T——**你训得不够**
- 加数据 / 多 epoch / 用更高质量数据,而不是先加参数

**场景 4**:长上下文推理 OOM
- 多半是 KV cache 撑爆显存(不是模型权重)
- 解决路径:GQA / MLA 架构 → KV cache 量化 → PagedAttention(vLLM) → 分布式 KV(SGLang)

### 9.3 这一套数学不能解释什么

| 信息论视角答得好 | 信息论视角答不好 |
| --- | --- |
| "压缩比为什么影响 token 成本" | "为什么 RLHF 后模型更像人(对齐)" |
| "Chinchilla 配比的物理直觉" | "in-context learning 的机理" |
| "为什么量化几乎无损" | "什么 prompt 写法效果最好" |
| "perplexity 跨语言怎么换算" | "推理 vs 训练时的能力差异" |

**信息论是"压缩 / 编码 / 容量"这条主线的语言,它解释不了:学习的机理(那是优化论)、对齐的本质(那是 RL + 人类偏好)、in-context learning(那是 Transformer 自身的特殊归纳偏置)**。**别把信息论当万能解释——它是其中一根很粗的线,但不是全部**。

---

下一篇进入第五层「微积分与凸优化」,从 **20-导数、偏导与梯度** 开始,把"梯度下降里的梯度到底是什么"讲清楚。
