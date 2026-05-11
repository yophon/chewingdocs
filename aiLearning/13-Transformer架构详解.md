# Transformer 架构详解

上一篇把 Attention 拆透了,这篇把它**装进 Transformer 这个大架子**里。读完你应该能:

- 闭着眼画出 Encoder/Decoder Block 的内部结构
- 解释为什么有残差、为什么有 LayerNorm、为什么有 FFN
- 看到一个 LLM 的配置文件(d_model、num_layers、num_heads)能立刻估算参数量
- 知道 Pre-LN、RMSNorm、RoPE 这些"现代 Transformer"的改动是干嘛的

> 一句话先记住:**Transformer = 堆 N 层 (Self-Attention + FFN),每个子层外面包一层"残差 + Norm"**。仅此而已。

---

## 一、Transformer 全景图

2017 年原始论文里,Transformer 是 **Encoder + Decoder** 的双塔结构,做翻译用:

```
    ┌─────────────────┐               ┌─────────────────┐
    │   Encoder × N   │               │   Decoder × N   │
    │                 │               │                 │
    │  Self-Attention │               │  Masked Self-Attn│
    │       ↓         │               │       ↓         │
    │     FFN         │               │  Cross-Attention│ ← 看 Encoder 输出
    │                 │ ─────────────►│       ↓         │
    │                 │               │     FFN         │
    └────────▲────────┘               └────────▲────────┘
             │                                 │
       源句 embedding                    目标句 embedding
       + 位置编码                         + 位置编码
```

但 2026 年的现实是:**Decoder-Only 一统江湖**。GPT 系列、Claude 系列、Llama、Qwen,全是 Decoder-Only。

| 流派 | 代表 | 用法 |
| --- | --- | --- |
| Encoder-Only | BERT、RoBERTa | 理解任务(分类、NER) |
| Decoder-Only | GPT-5、Claude 4.7、Llama 3 | 生成任务,LLM 主流 |
| Encoder-Decoder | T5、原版 Transformer | 翻译、Summary 等 seq2seq |

> 14 篇会专门讲为什么 Decoder-Only 赢了。这篇先把三种结构的内部都讲清楚。

每个 Encoder/Decoder 都是 N 个相同 Block 堆起来。**每个 Block 内部结构才是核心**,接下来我们一层层拆。

---

## 二、Encoder Block:Self-Attention + FFN + 残差 + LayerNorm

一个 Encoder Block 长这样:

```
        x  (B, N, d_model)
        │
        ├──────────────────┐
        ▼                  │
   Multi-Head Self-Attn    │
        ▼                  │
        + ◄────────────────┘  ← 残差
        ▼
    LayerNorm
        │
        ├──────────────────┐
        ▼                  │
       FFN                 │
        ▼                  │
        + ◄────────────────┘  ← 残差
        ▼
    LayerNorm
        │
        ▼  到下一个 Block
```

**两个子层(Self-Attention 和 FFN),每个外面都包一层"残差 + LayerNorm"**。这种叫 Post-LN 结构(LN 在残差之后)。

逐块说明:

### Self-Attention 子层

就是上一篇讲的 multi-head attention,在序列内部建联系。

### FFN(Feed-Forward Network)

一个两层全连接 + 激活:

```
FFN(x) = max(0, x·W1 + b1)·W2 + b2          # 原论文用 ReLU
       = GELU(x·W1 + b1)·W2 + b2             # GPT-2 起换 GELU
```

形状变化:

```
(B, N, d_model) ─ W1 ─► (B, N, d_ffn) ─ GELU ─► (B, N, d_ffn) ─ W2 ─► (B, N, d_model)
```

| 参数 | 经典值 | 干嘛的 |
| --- | --- | --- |
| d_ffn | 4 × d_model | 中间扩 4 倍,给非线性更大空间 |

> **直觉**:Self-Attention 负责"token 间互相看",FFN 负责"每个 token 各自做非线性加工"。两个分工,缺一不可。光有 attention 没 FFN,模型就是一堆线性变换和 softmax,表达力大幅下降。

### 残差(Residual Connection)

```
output = x + Sublayer(x)
```

为什么必须有?**没有残差,深度堆 6 层以上就训不动了**。残差解决两个问题:

1. **梯度消失**:深层网络反向传播时,梯度连乘容易归零。残差让梯度能"直通"地往前传
2. **恒等映射兜底**:就算 Sublayer 学崩了,输出至少等于输入,不会更差

### LayerNorm

```
LN(x) = γ · (x - μ) / σ + β     # μ、σ 是按最后一维算的均值标准差
```

| 区别 | 说明 |
| --- | --- |
| BatchNorm | 跨样本算统计量,需要 batch 大,依赖 batch 分布 |
| LayerNorm | **每个样本独立**算最后一维(d_model)的均值方差 |

LayerNorm 不依赖 batch,序列任务里特别合适——你 batch 里每个序列长度都不同,BN 没法算。

> **现代魔改**:Llama、Mistral、Claude 这些用的是 **RMSNorm**(只除以 RMS,不减均值,少一半计算)和 **Pre-LN**(LN 放在残差**之前**),稳定性更好,后面第十节再说。

---

## 三、Decoder Block

Decoder Block 比 Encoder 多一个子层:

```
        x  (B, N, d_model)
        │
        ▼
   Masked Self-Attention   ← 加 causal mask,不准看未来
        │
   + LN
        │
        ▼
   Cross-Attention         ← Q 来自 Decoder 自己,K/V 来自 Encoder 输出
        │
   + LN
        │
        ▼
       FFN
        │
   + LN
        │
        ▼
```

三个子层,从下到上分别干:

| 子层 | 输入 | 干什么 |
| --- | --- | --- |
| Masked Self-Attn | 已生成的目标序列 | 看自己之前生成了啥 |
| Cross-Attention | Q=自己,K/V=Encoder 输出 | 去源句里找信息 |
| FFN | 上面的输出 | 非线性加工 |

> **GPT 这类 Decoder-Only 模型**:把上面的 **Cross-Attention 拿掉**,只留 Masked Self-Attention + FFN。因为没有"另一个序列"可看,所有信息都在自己这条序列里。

---

## 四、位置编码

Attention 是**位置无关**的:你把句子里的词打乱顺序,Q·Kᵀ 的结果一模一样。这肯定不行——"狗咬人"和"人咬狗"差远了。

所以必须给每个位置加点"位置信号"。四种主流方案:

### 1. Sinusoidal(原版,2017)

```
PE(pos, 2i)   = sin(pos / 10000^(2i/d_model))
PE(pos, 2i+1) = cos(pos / 10000^(2i/d_model))
```

直接和 token embedding 相加。优点:不需训练参数;缺点:外推到比训练时更长的序列效果一般。

### 2. 可学习位置编码(GPT-2、BERT)

直接搞一个 `(max_seq_len, d_model)` 的可训练矩阵,和 token embedding 相加。**训练时简单,但 max_seq_len 是死的**——你训练用 2048,推理塞 4096 直接报错。

### 3. RoPE(Rotary Position Embedding,Llama 起)

不在输入加,而是**在 Q、K 上做旋转变换**:

```
旋转角度 θ_pos = pos · base^(-2i/d)
对 Q、K 的每两维做旋转矩阵乘法
```

好处:

| 优点 | 说明 |
| --- | --- |
| 相对位置 | Q·Kᵀ 的结果只和**相对距离 |i-j|** 有关 |
| 外推友好 | 配合 NTK-aware scaling、YaRN 等技巧,2k 训练能外推到 32k+ |
| 不增加参数 | 不像可学习 PE 那样占显存 |

**Llama、Qwen、Mistral、DeepSeek、Claude 等几乎全用 RoPE**。Claude 4.7 的 1M context 也是 RoPE + 一系列长度外推 trick。

### 4. ALiBi(Attention with Linear Biases)

更激进:**完全不做位置编码,直接在 attention 分数上加一个线性 bias**:

```
attention_score(i, j) = q_i · k_j - m · |i - j|        # m 是斜率,不同 head 不同
```

| 方案 | 是否参数化 | 长度外推 | 主流采用 |
| --- | --- | --- | --- |
| Sinusoidal | 否 | 一般 | 原版 Transformer |
| Learned | 是 | 差 | GPT-2、BERT |
| **RoPE** | 否 | 好 | Llama、Qwen、Claude、DeepSeek |
| ALiBi | 否 | 极好 | Falcon、MPT |

> **2026 共识**:RoPE 是默认选择。如果你做长 context 优化,看 YaRN、NTK-aware、Linear/Dynamic NTK 这些 RoPE 衍生方案。

---

## 五、Mask 机制

Attention 计算时有两种 mask:

### Causal Mask(因果掩码)

Decoder 训练时**绝对不能看未来**。否则训练时偷看了答案,推理时就傻了。

形式上:把 attention score 矩阵**右上三角设为 -∞**,softmax 后变成 0:

```
位置 0 能看:[0]
位置 1 能看:[0, 1]
位置 2 能看:[0, 1, 2]
位置 3 能看:[0, 1, 2, 3]
```

```python
# (N, N) 的下三角矩阵,1 表示可见,0 表示不可见
mask = torch.tril(torch.ones(N, N))
scores = scores.masked_fill(mask == 0, float('-inf'))
```

### Padding Mask

batch 里序列长度不一致,要 pad 到统一长度。pad 出来的位置不该参与 attention,也要 mask 掉:

```
real:  [I, love, you, <pad>, <pad>]
mask:  [1,    1,   1,     0,     0]
```

实际代码里两种 mask 通常合并成一个 `(B, 1, N, N)` 的 boolean tensor 一起处理。

### Mask 在不同模型里的差异

| 模型 | Self-Attention 的 mask |
| --- | --- |
| BERT(Encoder-Only) | 只 padding mask,**双向看** |
| GPT(Decoder-Only) | causal + padding,**只看左边** |
| T5 Encoder | 只 padding(双向) |
| T5 Decoder | causal + padding(单向) |

> 这就是 BERT 适合理解、GPT 适合生成的根本原因——**能不能看未来**。14 篇会展开这个范式分歧。

---

## 六、训练 vs 推理

这是非常多新手的混淆点。同一个 Transformer,训练和推理时**完全两个工作模式**。

### 训练:Teacher Forcing(并行)

假设要训"I love you" → "我爱你":

```
Decoder 输入:  [<bos>, 我, 爱, 你]            ← 真实标签当输入(老师强行喂)
Decoder 输出:  [我, 爱, 你, <eos>]            ← 模型要预测的下一个 token
```

关键:**所有位置的 loss 一次性算**,因为有 causal mask 保证每个位置只能看左边,不会作弊。**整个序列并行训练**,这就是 Transformer 比 RNN 快的核心原因。

### 推理:Autoregressive(串行)

没有"标准答案"可以喂了,只能一个一个生成:

```
step 1: [<bos>]                  → 模型 → 我
step 2: [<bos>, 我]              → 模型 → 爱
step 3: [<bos>, 我, 爱]          → 模型 → 你
step 4: [<bos>, 我, 爱, 你]      → 模型 → <eos> (停)
```

每步都要重新跑一次 Transformer。**这就是为什么生成 1000 token 比读 1000 token 慢得多**——读是并行(prefill),写是串行(decode)。

| 阶段 | 计算特征 | 瓶颈 |
| --- | --- | --- |
| 训练 | 并行,GPU 利用率高 | 显存(梯度+优化器状态) |
| 推理 prefill | 并行处理 prompt | 计算(compute-bound) |
| 推理 decode | 串行生成,每步只算 1 个 token | 显存带宽(memory-bound) |

> **KV Cache** 是推理 decode 的关键优化:已经算过的 K、V 缓存起来,新 token 只算自己那一行。33 篇详细展开。

---

## 七、参数量怎么算

看到一个模型配置 `d_model=4096, num_heads=32, num_layers=32, d_ffn=14336`,你应该立刻能估出量级。

**单个 Decoder Block 的参数**:

| 组件 | 参数量 | 备注 |
| --- | --- | --- |
| Self-Attention 的 W_q、W_k、W_v、W_o | 4 · d² | 各是 d×d 的矩阵 |
| FFN 的 W1、W2 | 2 · d · d_ffn | 中间扩 d_ffn 维 |
| LayerNorm | ~2d | 可忽略 |
| **小计** | ≈ 4d² + 2·d·d_ffn | 当 d_ffn=4d 时,≈ **12 d²** |

**整个模型 ≈ N_layers × 12d² + 词表 embedding**

举例,Llama-7B:`d_model=4096, layers=32, vocab=32k`

```
Block:    32 × 12 × 4096² ≈ 6.4 B
Embedding: 32000 × 4096   ≈ 0.13 B
共享 embed (输入=输出 embedding):
总和大概 6.6 B,接近"7B"的命名
```

> **粗略经验**:模型参数量 ≈ N · 12 · d²。给你 d_model 和 N,15 秒内估出来。Llama-3 70B、GPT-4o 这些大致也符合。

---

## 八、PyTorch 手写 Transformer Block

把上一篇的 MultiHeadAttention 搬过来,加 FFN、残差、LayerNorm,就是一个 Decoder-Only 的 Transformer Block:

```python
import torch
import torch.nn as nn
import torch.nn.functional as F


class MultiHeadAttention(nn.Module):
    def __init__(self, d_model, num_heads):
        super().__init__()
        self.h = num_heads
        self.d_k = d_model // num_heads
        self.W_q = nn.Linear(d_model, d_model)
        self.W_k = nn.Linear(d_model, d_model)
        self.W_v = nn.Linear(d_model, d_model)
        self.W_o = nn.Linear(d_model, d_model)

    def forward(self, x, mask=None):
        B, N, D = x.shape
        Q = self.W_q(x).view(B, N, self.h, self.d_k).transpose(1, 2)
        K = self.W_k(x).view(B, N, self.h, self.d_k).transpose(1, 2)
        V = self.W_v(x).view(B, N, self.h, self.d_k).transpose(1, 2)
        scores = Q @ K.transpose(-2, -1) / (self.d_k ** 0.5)
        if mask is not None:
            scores = scores.masked_fill(mask == 0, float('-inf'))
        attn = F.softmax(scores, dim=-1)
        out = (attn @ V).transpose(1, 2).contiguous().view(B, N, D)
        return self.W_o(out)


class FeedForward(nn.Module):
    def __init__(self, d_model, d_ffn):
        super().__init__()
        self.fc1 = nn.Linear(d_model, d_ffn)
        self.fc2 = nn.Linear(d_ffn, d_model)

    def forward(self, x):
        return self.fc2(F.gelu(self.fc1(x)))


class TransformerBlock(nn.Module):
    """Pre-LN 风格(2026 主流),LN 放在子层之前"""

    def __init__(self, d_model=512, num_heads=8, d_ffn=2048, dropout=0.1):
        super().__init__()
        self.ln1 = nn.LayerNorm(d_model)
        self.attn = MultiHeadAttention(d_model, num_heads)
        self.ln2 = nn.LayerNorm(d_model)
        self.ffn = FeedForward(d_model, d_ffn)
        self.dropout = nn.Dropout(dropout)

    def forward(self, x, mask=None):
        # Pre-LN: x + Sublayer(LN(x))
        x = x + self.dropout(self.attn(self.ln1(x), mask))
        x = x + self.dropout(self.ffn(self.ln2(x)))
        return x


class MiniGPT(nn.Module):
    def __init__(self, vocab_size, d_model=512, num_heads=8, num_layers=6,
                 d_ffn=2048, max_len=1024):
        super().__init__()
        self.token_emb = nn.Embedding(vocab_size, d_model)
        self.pos_emb = nn.Embedding(max_len, d_model)
        self.blocks = nn.ModuleList([
            TransformerBlock(d_model, num_heads, d_ffn) for _ in range(num_layers)
        ])
        self.ln_f = nn.LayerNorm(d_model)
        self.head = nn.Linear(d_model, vocab_size, bias=False)

        # causal mask 提前算好
        self.register_buffer(
            'mask', torch.tril(torch.ones(max_len, max_len)).unsqueeze(0).unsqueeze(0)
        )

    def forward(self, idx):
        B, N = idx.shape
        pos = torch.arange(N, device=idx.device)
        x = self.token_emb(idx) + self.pos_emb(pos)
        mask = self.mask[:, :, :N, :N]
        for block in self.blocks:
            x = block(x, mask)
        x = self.ln_f(x)
        return self.head(x)             # (B, N, vocab_size)


# 跑一下
model = MiniGPT(vocab_size=10000, d_model=256, num_heads=4, num_layers=4)
idx = torch.randint(0, 10000, (2, 32))
logits = model(idx)
print(logits.shape)                     # torch.Size([2, 32, 10000])

# 算参数量
n_params = sum(p.numel() for p in model.parameters())
print(f"params: {n_params/1e6:.2f}M")   # 大概 4-5M
```

这就是一个**最小可跑的 GPT 风格模型**。生产代码会再加 RoPE、RMSNorm、KV Cache、FlashAttention 等,但**核心结构就这些**。Karpathy 的 nanoGPT 也是这套骨架,300 行训出能讲莎士比亚的小模型。

---

## 九、为什么 Transformer 这么强

凭什么它能干掉 RNN/LSTM,还能 scale 到万亿参数?

| 优势 | 解释 |
| --- | --- |
| **并行训练** | 一次性看整个序列,GPU 满载。RNN 必须串行 |
| **长程依赖** | 任意两个 token 直接 attention,不像 RNN 信息要走 N 步 |
| **scale 友好** | d_model 翻倍参数 4 倍,但效果稳定提升,符合 Scaling Law |
| **架构统一** | 文本、图像、音频都能用(ViT、Whisper、SAM),一招吃遍 |
| **预训练-微调范式** | 大规模无监督预训练,小数据微调,通用性强 |
| **工程生态成熟** | PyTorch、HF、vLLM、FlashAttention 等基建齐全 |

> **关键洞察**:Transformer 的成功不只是架构本身,更是它**和 GPU 硬件高度匹配**——大量矩阵乘法、规则的内存访问模式。这是 RNN 类模型(包括最近的 Mamba)很难超越的工程优势。

19 篇会讲 Scaling Law:**Transformer 是目前唯一被验证"参数 × 数据 × 算力 → 效果"近乎线性可预测的架构**,这才是它真正强的地方。

---

## 十、踩坑(Pre-LN vs Post-LN、RMSNorm)

### Pre-LN vs Post-LN

| 风格 | 公式 | 特点 |
| --- | --- | --- |
| Post-LN(原论文) | `LN(x + Sublayer(x))` | 表达力略强,但训练不稳,深层易崩 |
| **Pre-LN(GPT-2 起)** | `x + Sublayer(LN(x))` | 训练稳定,允许大学习率,**现代默认** |

**踩坑**:照原论文搭个 24 层 Post-LN Transformer,你大概率训不动。换 Pre-LN 立刻好。GPT-2、Llama、Claude 全是 Pre-LN。

### LayerNorm vs RMSNorm

```
LayerNorm:  γ · (x - μ) / σ + β       # 减均值、除标准差、缩放、偏移
RMSNorm:    γ · x / RMS(x)            # 只除 RMS,没均值、没偏移
```

RMSNorm 节省一半计算,**效果不掉甚至略好**。Llama 起几乎所有现代 LLM 都用。

### 其他常见坑

1. **dropout 在哪加**:每个子层输出后、残差前。Self-Attention 内部的 attention weights 也可以加(attn dropout),但很多现代 LLM 不加了
2. **学习率 warmup**:Transformer 必须 warmup,前几千步线性涨上去再衰减,否则一开始就崩
3. **梯度裁剪**:`clip_grad_norm_(params, 1.0)`,几乎是必须的,防止偶尔的梯度爆炸
4. **embedding 初始化**:`nn.Embedding` 默认 N(0,1) 太大,通常初始化成 N(0, 0.02)
5. **tied embedding**:输入和输出 embedding 共享权重,省一大笔参数,效果不差
6. **bf16 vs fp16**:训大模型用 bf16(动态范围大),不要 fp16(容易 NaN)
7. **激活函数**:GELU(GPT-2)→ SwiGLU(Llama 起,效果更好,代价是 FFN 多一个矩阵)
8. **不要自己手写 attention 上生产**:用 `F.scaled_dot_product_attention` 或 FlashAttention,显存和速度差几倍
9. **位置编码不要用 Sinusoidal 了**:除非你做研究复现,生产直接 RoPE
10. **deep model 调参**:层数 > 32 时会出现训练不稳,可能要用 DeepNorm、Sub-LN 等专门 trick

---

下一篇:`14-从GPT到LLM-自回归生成.md`,看 Decoder-Only 怎么从一个翻译模型的"半边",一路膨胀成今天的 GPT-5、Claude 4.7,并解释为什么"下一个词预测"这件事能做出像样的智能。
