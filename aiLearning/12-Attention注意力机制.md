# Attention 注意力机制

这是整套教程最关键的一篇。Transformer、GPT、Claude、所有现代 LLM,核心机制都是 Attention。**你能不能看懂论文、能不能调好 LLM,基本就看这一篇消化得怎么样**。

> 一句话先记住:Attention 就是"用 Query 去查 Key,按相似度加权取 Value"。一次软查表,如此而已。

---

## 一、起源:seq2seq 的瓶颈

要理解 Attention 为什么诞生,得先看看它要解决什么问题。

2014 年之前,机器翻译用的是 **Encoder-Decoder + RNN**:

```
[I  love  you]  →  Encoder(RNN)  →  [一个固定长度的向量 c]  →  Decoder(RNN)  →  [我  爱  你]
```

Encoder 把整句话**压缩成一个固定向量** `c`(通常 512 维),Decoder 再从 `c` 一个词一个词地生成。

问题立刻就来了:

| 问题 | 说人话 |
| --- | --- |
| 信息瓶颈 | 不管你输入是 5 个词还是 500 个词,都要塞进同一个 512 维向量。后面的词把前面的"挤掉"了 |
| 长程依赖丢失 | RNN 一步步算,梯度走到第 100 步早衰减没了 |
| 无法并行 | 第 t 步要等第 t-1 步算完,GPU 干瞪眼 |

> 直觉:你翻译"The cat sat on the mat"成中文时,翻"猫"应该重点看"cat",翻"垫子"应该重点看"mat"。**你不会把整句话压成一个向量再翻**,你的注意力会动态聚焦到不同的词上。

2014 年 Bahdanau 等人提出:**让 Decoder 每生成一个词,都能"回头看"Encoder 的所有词,并自己决定哪个词更重要**。这就是 Attention 的雏形。

2017 年 Google 的《Attention Is All You Need》直接说:**RNN 都不要了,光靠 Attention 就够了**。Transformer 诞生。

---

## 二、直觉:查字典

把 Attention 想成"软查表"是最容易的入门方式。

普通字典查表(精确匹配):

```python
d = {"cat": "猫", "dog": "狗", "fish": "鱼"}
d["cat"]  # → "猫"
```

精确匹配的问题是:你必须 key 完全相等才能查到。

**Attention 是"软查表"**:你给一个 Query,它会和**所有 Key** 算相似度,按相似度加权返回**所有 Value 的混合**。

```
                    [k1, k2, k3]    ← Keys
                    [v1, v2, v3]    ← Values
                       │
   q ────────► 算 q 和每个 ki 的相似度 ────► [0.7, 0.2, 0.1]  ← softmax 后的权重
                                                │
                                       output = 0.7·v1 + 0.2·v2 + 0.1·v3
```

| 角色 | 在翻译里的对应 | 在 self-attention 里的对应 |
| --- | --- | --- |
| Query (Q) | 当前要翻译的词 | 当前 token "我想知道关于自己谁更重要" |
| Key (K) | 源句每个词的"标签" | 每个 token 的"我能提供什么" |
| Value (V) | 源句每个词的"内容" | 每个 token 的"实际语义" |

> 类比:Q 是搜索框输入,K 是网页标题(用来匹配),V 是网页内容(真正要的东西)。这三者在 Transformer 里都来自同一个输入(self-attention),但通过三个不同的线性变换得到。

---

## 三、Scaled Dot-Product Attention 公式

公式只有一行,但每个符号都得吃透:

```
Attention(Q, K, V) = softmax( Q·Kᵀ / √d_k ) · V
```

逐项含义:

| 符号 | 形状 | 含义 |
| --- | --- | --- |
| Q | (n, d_k) | n 个 query,每个 d_k 维 |
| K | (m, d_k) | m 个 key,每个 d_k 维 |
| V | (m, d_v) | m 个 value,每个 d_v 维 |
| Q·Kᵀ | (n, m) | 每个 q 和每个 k 的点积分数(相似度) |
| /√d_k | (n, m) | 缩放,防止 softmax 饱和(下一节讲) |
| softmax | (n, m) | 按行做,每行加和为 1,变成"权重" |
| 最后 ·V | (n, d_v) | 用权重对 V 加权求和,得到 n 个输出 |

一步步拆:

```
1. Q·Kᵀ        : 算"每个 query 和每个 key 的相似度"
2. /√d_k       : 缩放
3. (mask)      : 可选,把不能看的位置设成 -∞(下一篇讲)
4. softmax     : 把分数变成权重(每行加起来 = 1)
5. ·V          : 对 value 加权求和
```

> **核心理解**:整套操作可以一句话概括为"用 Q 在 K 里查,在 V 里取"。如果 Q 和某个 K 很像,对应的 V 就会被大权重选出来。

举个具体的小例子,假设 d_k=2,有 2 个 token:

```python
Q = [[1, 0], [0, 1]]     # 2 个 query
K = [[1, 0], [0, 1]]     # 2 个 key
V = [[10, 20], [30, 40]] # 2 个 value

# Q·Kᵀ = [[1, 0], [0, 1]]
# /√2  ≈ [[0.71, 0], [0, 0.71]]
# softmax 行:
#   [0.71, 0]  → [0.67, 0.33]
#   [0, 0.71]  → [0.33, 0.67]
# ·V:
#   [0.67·10+0.33·30, 0.67·20+0.33·40] = [16.6, 26.6]
#   [0.33·10+0.67·30, 0.33·20+0.67·40] = [23.4, 33.4]
```

第一个 query 偏向第一个 value,第二个偏向第二个,符合直觉。

---

## 四、为什么除以 √d_k

这是面试高频考点,也是初学者最容易忽略的细节。

**直觉解释**:点积 `Q·Kᵀ` 的方差会随维度 d_k 增大而增大。维度高了,分数有的非常大、有的非常小,softmax 会变得"非常尖":几乎只有一个权重接近 1,其他全是 0。

```
softmax([1, 2, 3])      ≈ [0.09, 0.24, 0.67]   ← 平滑
softmax([10, 20, 30])   ≈ [2e-9, 2e-5, 1.00]   ← 饱和!几乎单选
```

softmax 一旦饱和:

| 现象 | 后果 |
| --- | --- |
| 梯度极小 | 反向传播时梯度几乎为 0,模型学不动 |
| 退化成 hard attention | 失去"软"加权的好处,模型变僵硬 |
| 训练不稳定 | loss 震荡或 NaN |

**数学解释**:假设 q、k 各分量独立同分布,均值 0、方差 1,那么 `q·k = Σqi·ki` 的方差 = d_k。除以 √d_k 后方差归 1,softmax 输入分布稳定。

> 记忆:**维度越高,点积越容易"爆"**,所以要除以 √d_k 把它"压回正常区间"。这是 Transformer 能 scale 到大模型的一个小但关键的细节。

---

## 五、Self-Attention vs Cross-Attention

光有 Attention 公式还不够,得分清两种用法。

### Self-Attention(自注意力)

Q、K、V **来自同一个输入**:

```
x  ──► W_q ──► Q
x  ──► W_k ──► K     # x 是同一个东西
x  ──► W_v ──► V
```

每个 token 都"看"序列里所有其他 token(包括自己),找出哪些对自己更相关。

> 直觉:句子"猫坐在垫子上"中,"坐"这个词通过 self-attention,能直接和"猫""垫子"建立关系——不管它们离多远。这就是 Transformer 解决长程依赖的根本机制。

### Cross-Attention(交叉注意力)

Q 来自一个序列,K、V 来自**另一个序列**:

```
decoder_x  ──► W_q ──► Q
encoder_x  ──► W_k ──► K     # K、V 来自 Encoder 输出
encoder_x  ──► W_v ──► V
```

典型场景:翻译里 Decoder 生成中文时,Q 是中文当前位置,K/V 是英文 Encoder 的输出。

| 类型 | 出现在哪 | 干什么 |
| --- | --- | --- |
| Self-Attention | Encoder、Decoder 第一层 | 序列内部建联系 |
| Masked Self-Attention | Decoder 第一层(训练时加 mask) | 防止"偷看"未来 |
| Cross-Attention | Decoder 第二层 | 让 Decoder 看 Encoder 的信息 |

GPT 这类 Decoder-Only 模型**只有 Masked Self-Attention**,没有 Cross-Attention。BERT 这类 Encoder-Only 模型**只有 Self-Attention**(无 mask)。原始 Transformer(Encoder-Decoder)三种都有。

---

## 六、Multi-Head:为什么要多头

单头 Attention 的问题:**一次只能学一种"关系模式"**。

举个例子,在句子"The animal didn't cross the street because it was too tired"里:

- "it" 应该指代"animal"(语义上的指代关系)
- "tired" 修饰"animal"(形容词修饰)
- "didn't cross" 是动作(主谓动宾结构)

**一个 head 学不过来**。所以 Transformer 把 d_model 拆成 h 个头,每个头独立学一种关系:

```
d_model = 512, num_heads = 8 → 每个头 d_k = 64

         ┌─ Head 1: 学指代关系 ─┐
         ├─ Head 2: 学语法依存 ─┤
input ──►│       ...           │──► concat ──► W_o ──► 输出
         ├─ Head 7: 学位置邻近 ─┤
         └─ Head 8: 学语义相似 ─┘
```

公式:

```
MultiHead(Q, K, V) = Concat(head_1, ..., head_h) · W_o

其中 head_i = Attention(Q·W_q_i, K·W_k_i, V·W_v_i)
```

| 单头 | 多头 |
| --- | --- |
| 一种 attention pattern | h 种 attention pattern,模型表达力强 |
| d_k = d_model | d_k = d_model / h(总参数量不变) |
| 容易过拟合到某种关系 | 头之间互相补充,泛化更好 |

> 实务:头数 h 不是越多越好。常见配置 d_model=512、h=8(每头 64),d_model=4096、h=32(每头 128)。**每头维度太小(<32)模型表达力下降,太大(>128)收益递减**。

GPT-5、Claude 4.7 这类大模型,部分还会用 GQA(Grouped-Query Attention)或 MQA,把多个 Q 共享同一组 K/V,**显著减小推理时的 KV cache 显存**。但训练原理还是 multi-head,工程上的 trick 而已。

---

## 七、PyTorch 手写 Attention

不动手永远不算懂。20 行版本,可直接跑:

```python
import torch
import torch.nn as nn
import torch.nn.functional as F

class MultiHeadAttention(nn.Module):
    def __init__(self, d_model=512, num_heads=8):
        super().__init__()
        assert d_model % num_heads == 0
        self.d_model = d_model
        self.num_heads = num_heads
        self.d_k = d_model // num_heads

        self.W_q = nn.Linear(d_model, d_model)
        self.W_k = nn.Linear(d_model, d_model)
        self.W_v = nn.Linear(d_model, d_model)
        self.W_o = nn.Linear(d_model, d_model)

    def forward(self, x, mask=None):
        B, N, D = x.shape  # batch, seq_len, d_model

        # 1) 线性投影 + 拆头  (B, N, D) -> (B, h, N, d_k)
        Q = self.W_q(x).view(B, N, self.num_heads, self.d_k).transpose(1, 2)
        K = self.W_k(x).view(B, N, self.num_heads, self.d_k).transpose(1, 2)
        V = self.W_v(x).view(B, N, self.num_heads, self.d_k).transpose(1, 2)

        # 2) Scaled Dot-Product Attention
        scores = Q @ K.transpose(-2, -1) / (self.d_k ** 0.5)   # (B, h, N, N)
        if mask is not None:
            scores = scores.masked_fill(mask == 0, float('-inf'))
        attn = F.softmax(scores, dim=-1)
        out = attn @ V                                          # (B, h, N, d_k)

        # 3) 合头 + 输出投影
        out = out.transpose(1, 2).contiguous().view(B, N, D)
        return self.W_o(out)


# 跑一下
x = torch.randn(2, 10, 512)        # batch=2, 序列长 10, d_model=512
mha = MultiHeadAttention(512, 8)
y = mha(x)
print(y.shape)                     # torch.Size([2, 10, 512])
```

几个细节:

1. `view(B, N, h, d_k).transpose(1,2)` 是把 d_model 拆成 h 个头,然后把 head 维度提到前面,方便后面 batched matmul
2. `Q @ K.transpose(-2,-1)` 在 PyTorch 里就是 batched 矩阵乘
3. `masked_fill(mask==0, -inf)` 把不能看的位置打成负无穷,softmax 后这些位置就是 0
4. 实际生产代码会用 `F.scaled_dot_product_attention`,内部调用 FlashAttention,显存和速度都好得多

---

## 八、Attention 复杂度 O(n²) 的含义与延伸

有得就有失。Attention 的代价是:

```
Q·Kᵀ 的形状是 (n, m),n=m 时占用 O(n²) 显存和计算
```

| 序列长度 n | Attention 矩阵大小 | FP16 显存(单 head) |
| --- | --- | --- |
| 1k | 1M | 2 MB |
| 4k | 16M | 32 MB |
| 32k | 1B | 2 GB |
| 128k | 16B | 32 GB |
| 1M | 1T | 2 TB(根本放不下) |

这就是为什么早年 Transformer 卡在 2k context。后来一系列工作把它往上推:

| 方案 | 思路 | 代表 |
| --- | --- | --- |
| FlashAttention | 不存中间矩阵,IO-aware 重排 | 默认实现,2-4x 速度 |
| Sliding Window | 每个 token 只看附近 k 个 | Mistral 系列 |
| Sparse Attention | 只算部分位置 | Longformer、BigBird |
| Linear Attention | 改公式让复杂度降到 O(n) | Mamba、Performer |
| RoPE + 长度外推 | 工程上把 context 撑到 100 万 | Claude 4.7 1M、Gemini 2M |

> 2026 年的现状:**Claude 4.7 已经标配 1M context,Gemini 2M,GPT-5 也跟上 1M 量级**。但 1M 不等于免费——计算成本和延迟还是涨,API 价格也按 token 算。所以"长上下文"不等于"什么都往里塞",还是要做 RAG 和 Context Engineering(22、24 篇会讲)。

---

## 九、踩坑

写到这,你应该能看懂 Transformer 论文里的 Attention 这一段了。但实际写代码时,坑还不少:

1. **忘记除以 √d_k**:模型能跑但训不动,loss 卡住。检查 scale 这一步是否对
2. **mask 用错了**:训练时 causal mask 漏了,模型"偷看"未来,train loss 嗖嗖降但 eval 一塌糊涂
3. **head 维度太小**:d_model=512 配 h=64,每头才 8 维,基本学不到东西。**经验值是每头 ≥ 32**
4. **softmax 数值不稳**:手写时不要直接 `exp(x)/sum(exp(x))`,会溢出。用 `F.softmax`,它内部减了 max
5. **拿 attention 权重当解释**:"模型 attention 到了 X,所以 X 重要"这个解释**不可靠**,attention 权重和模型决策没那么强的因果关系,Anthropic 自己的可解释性团队都验证过
6. **以为长 context 一定好**:超过某个长度,模型对中段信息的利用率下降(Lost in the Middle 问题)。**长不等于会用**
7. **生产部署忘了 KV Cache**:推理时每次都重算 K、V 是巨大浪费。33 篇会详细讲

---

下一篇:`13-Transformer架构详解.md`,把 Attention 装进完整的 Encoder/Decoder Block 里,看一个真正的 Transformer 是怎么搭起来的。
