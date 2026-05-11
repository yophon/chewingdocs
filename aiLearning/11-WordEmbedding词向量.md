# Word Embedding 词向量

经典架构三篇里的最后一篇。前两篇 CNN / RNN 处理的是已经数值化的输入(像素、token id),但**文字本身不是数**——你必须先把"猫"这个字变成一个向量,神经网络才能算。这一步就叫 word embedding(词向量)。

> 一句话先记住:词向量的本质是"用一个稠密向量表达一个词的语义",好的词向量能让"国王 - 男人 + 女人 ≈ 王后"这种语义运算成立。Word2Vec 是 2013 年的经典做法,2026 年的 LLM 已经不直接用它,但**思想**仍然贯穿到现在。

---

## 一、One-hot 的维度灾难和语义缺失

最朴素的"把词变成向量"方法是 one-hot:

```
词表:[猫, 狗, 苹果, 香蕉, 跑, 走]
猫    →  [1, 0, 0, 0, 0, 0]
狗    →  [0, 1, 0, 0, 0, 0]
苹果  →  [0, 0, 1, 0, 0, 0]
香蕉  →  [0, 0, 0, 1, 0, 0]
跑    →  [0, 0, 0, 0, 1, 0]
走    →  [0, 0, 0, 0, 0, 1]
```

简单粗暴,但有两个致命问题:

| 问题 | 解释 | 后果 |
| --- | --- | --- |
| 维度灾难 | 中文词表至少几十万,one-hot 向量就有几十万维 | 存不下、算不动 |
| 语义缺失 | 任意两个 one-hot 向量都正交,相似度永远是 0 | "猫"和"狗"的距离 = "猫"和"苹果"的距离 |

> 你拿"猫"和"狗"做余弦相似度是 0,跟"苹果"做也是 0——网络看不出"猫和狗都是动物"这件事,**所有语义关系都得它从训练数据里重学一遍**,效率极低。

我们需要的是这样的向量:

- **稠密**(几百维就够,而不是几十万维)
- **语义相近的词,向量也相近**

这就是词向量。

---

## 二、Word2Vec:CBOW 与 Skip-gram

Word2Vec(2013,Mikolov 团队)是词向量的奠基之作。核心思路非常 elegant:

> **一个词的语义,由它的上下文决定。** ——分布假说(distributional hypothesis)

意思是:如果两个词总出现在相似的上下文里,它们就语义相近。

举个例子:

```
今天我去吃了 [____],很好吃。
```

横线里能填"火锅""寿司""牛排""饺子"——这些词在大量文本里都出现在类似句式中,所以它们语义相近。

Word2Vec 把这个想法变成了一个**预测任务**:

### CBOW(Continuous Bag-of-Words)

**用上下文预测中心词**:

```
[今天, 我, 去, 吃, 了]  →  预测  →  [火锅]
   ↑                              ↑
 上下文(窗口内的词)            中心词
```

### Skip-gram

**反过来,用中心词预测上下文**:

```
[火锅]  →  预测  →  [今天, 我, 去, 吃, 了]
```

两者对比:

| 维度 | CBOW | Skip-gram |
| --- | --- | --- |
| 方向 | 上下文 → 中心词 | 中心词 → 上下文 |
| 训练速度 | 快 | 慢(每个中心词预测多个) |
| 低频词效果 | 一般 | **明显更好** |
| 大语料适合 | 中小语料 | 大语料 |

> 经验法则:**Skip-gram 更常用**,因为它对低频词友好(每个低频词都能贡献多次训练样本)。Word2Vec 论文里 Skip-gram 也是主角。

### 训练完之后,词向量在哪?

这是新手常困惑的地方。Word2Vec 是一个**两层的浅网络**:

```
输入 one-hot (V 维)  ──W1──►  hidden (D 维)  ──W2──►  输出 one-hot (V 维)
```

训练目标是预测准确,但**真正有用的不是输出**——是中间那个 W1 矩阵。

```
W1 形状: V × D
第 i 行 就是 词表里第 i 个词的 D 维向量
```

D 通常取 100、200、300。**词向量就是这个矩阵**。训完之后扔掉 W2,只保留 W1。

---

## 三、负采样(简提)

Skip-gram 训练时有个工程难题:输出层 softmax 要在整个词表(几十万词)上算分布,**每一步训练都要算 V 个 exp**,慢到没法用。

负采样(Negative Sampling)的思路:**别算全部 V 个词的概率,只采样几个负例做二分类**。

```
正样本:(中心词, 真上下文词) → 标签 1
负样本:(中心词, 随机抽 5 个不在窗口的词) → 标签 0

每步只更新这 6 个词的向量,O(V) 降到 O(6)。
```

> 这是个**工程加速 trick**,但也带来了好的副作用——高频词被过度采样,Mikolov 还设计了一个"次采样"(subsampling)缓解。这些细节不必深究,知道有这件事就够了。

类似的还有 Hierarchical Softmax(用霍夫曼树替代 softmax),原理不同但目的相同,都是加速训练。

---

## 四、GloVe(简提)

GloVe(Global Vectors,2014,Stanford)是 Word2Vec 之后的另一个经典词向量。它的思路跟 Word2Vec 不同:

- **Word2Vec**:基于局部窗口的预测
- **GloVe**:基于全局共现矩阵的矩阵分解

简单理解 GloVe 的目标:让两个词向量的内积,接近它们在大语料里共现次数的对数。

```
v_i · v_j ≈ log(co-occurrence(i, j))
```

实际效果上,Word2Vec 和 GloVe **差不多**——都是稠密向量、都能做语义类比、都能当成下游 NLP 模型的输入层。

> 你完全可以把 GloVe 看成"另一个版本的 Word2Vec",不必死磕区别。**2026 年要预训练词向量,你大概率直接用 fasttext 或者从 LLM 里 dump 出来的 token embedding。**

---

## 五、Embedding 的几何性质

词向量最神奇的性质,是**语义关系变成了向量运算**。

经典例子:

```
v(king) - v(man) + v(woman)  ≈  v(queen)
v(Paris) - v(France) + v(Italy)  ≈  v(Rome)
v(walking) - v(walked) + v(swam)  ≈  v(swimming)
```

这不是人为设计的,而是训练完之后**自动涌现**的现象——因为模型通过上下文学到了"性别""国家-首都""时态"这些隐含维度,这些维度变成了向量空间的方向。

直觉图示:

```
              王后(queen)
              ▲
              │  +女性方向
              │
king ─────────┤
              │
              │  -男性方向
              ▼
              ?
```

可视化(用 t-SNE 把 300 维降到 2 维)后,你会看到:

- 国家名聚在一起
- 动物聚在一起
- 时态变化在向量空间是同一方向
- 单复数变化在向量空间是同一方向

> 这是词向量真正震撼的地方:**没人告诉模型"性别"是什么,模型从纯文本里就学到了**。这也是 NLP 走向深度学习的关键里程碑——文字开始能做"算术"了。

### 词向量能做什么

| 任务 | 用法 |
| --- | --- |
| 找近义词 | 余弦相似度排序 |
| 类比推理 | 上面的 king-man+woman |
| 下游任务初始化 | LSTM/CNN 的 Embedding 层用预训练词向量初始化 |
| 文本聚类 | 句向量(词向量平均)做 KMeans |
| 拼写纠错 | 找最近邻词 |

---

## 六、上下文相关 vs 无关

Word2Vec / GloVe 都有一个根本局限:**一个词只有一个向量**。

但中文里"苹果"可以是水果,也可以是公司;英文 "bank" 可以是银行,也可以是河岸。Word2Vec 给它们的是**同一个向量**——这显然不合理。

这就是"上下文无关 embedding"的硬伤。

2018 年之后,出现了一类**上下文相关 embedding**:

| 模型 | 年份 | 上下文相关? | 说明 |
| --- | --- | --- | --- |
| Word2Vec | 2013 | 否 | 一个词一个向量,固定 |
| GloVe | 2014 | 否 | 同上 |
| ELMo | 2018 | 是 | 用 Bi-LSTM 算出依赖上下文的向量 |
| BERT | 2018 | 是 | 用 Transformer Encoder,同一个词在不同句子里向量不同 |
| GPT | 2018+ | 是 | 同上,但是单向 |

举个例子,BERT 里:

```
句子 1:我吃了苹果。       → 苹果向量 v1
句子 2:苹果发布新手机。   → 苹果向量 v2

v1 ≠ v2,因为上下文不同
```

> 这是个**根本性的进步**。从此"词向量"这个概念其实已经被淹没在更大的模型里——BERT/GPT 给出的是"某个 token 在某个上下文里的表示",这比静态词向量强大得多。

---

## 七、PyTorch nn.Embedding 用法

PyTorch 的 `nn.Embedding` 本质就是一个**查表**——给 token id,返回对应行向量。

```python
import torch
import torch.nn as nn

# 词表大小 10000,每个词向量 128 维
embedding = nn.Embedding(num_embeddings=10000, embedding_dim=128)

# 输入是一批 token id (B, T)
ids = torch.tensor([[1, 5, 7, 2], [3, 8, 0, 9]])     # batch=2, seq_len=4
vectors = embedding(ids)                              # (2, 4, 128)
print(vectors.shape)
```

底层就是:

```python
# 等价于
W = torch.randn(10000, 128)   # 这个 W 就是 embedding 矩阵
vectors = W[ids]               # 按 id 查行
```

### 用预训练词向量初始化

```python
import numpy as np
# 假设你下载了一个 GloVe 矩阵
glove_matrix = np.load('glove_300d.npy')   # shape (10000, 300)

embedding = nn.Embedding.from_pretrained(
    torch.tensor(glove_matrix, dtype=torch.float32),
    freeze=False,   # 是否冻结(True 就不再更新)
    padding_idx=0,  # 0 号 id 是 padding,梯度不更新
)
```

`freeze=True` 适用于:**小数据集 + 预训练向量质量很高**(防止过拟合冲坏预训练知识)。
`freeze=False` 适用于:**数据足够 + 想 fine-tune 词向量**(让向量适应你的领域)。

### 一个完整的简单分类模型

```python
class SimpleClassifier(nn.Module):
    def __init__(self, vocab_size, embed_dim=128, num_classes=2):
        super().__init__()
        self.embed = nn.Embedding(vocab_size, embed_dim, padding_idx=0)
        self.fc = nn.Linear(embed_dim, num_classes)

    def forward(self, x):
        # x: (B, T)
        emb = self.embed(x)              # (B, T, embed_dim)
        # 句向量 = 词向量平均(简单粗暴但 baseline 效果不错)
        sentence_vec = emb.mean(dim=1)   # (B, embed_dim)
        return self.fc(sentence_vec)

model = SimpleClassifier(vocab_size=10000)
x = torch.randint(0, 10000, (32, 50))
logits = model(x)
print(logits.shape)   # torch.Size([32, 2])
```

> 这个 5 行的模型在 IMDB 情感分类上能跑到 80% 以上准确率——简单到离谱,但 baseline 就是这么强。**先跑 baseline,再想花活**,是机器学习的通用工作流。

---

## 八、伏笔:现代 LLM 没有"词向量"

到 2026 年的 LLM 时代,你打开 GPT 或 Claude 的源码,**找不到"word vector"这个词**。原因有两层:

### 1. 不再以"词"为单位,而是 token

现代 LLM 用 BPE / SentencePiece 等子词切分,把"unbelievable"切成 ["un", "believ", "able"]——这种切分单位是 token,不是 word。**Token embedding 才是真正的输入层**。

### 2. token embedding 永远跟模型一起训练

Word2Vec 是**先训词向量,再用到下游模型**的两阶段流程。LLM 不是——token embedding 矩阵是 Transformer 的第一个参数,跟整个模型从头到尾联合训练。它**没有独立意义**,只是大模型的一个参数。

LLM 输入侧通常是这样:

```
输入 token id  →  token embedding (查表)  +  position embedding (位置)  →  Transformer 层
```

| 组件 | 作用 |
| --- | --- |
| token embedding | 把 token id 变成向量(类似 Word2Vec 的角色,但联合训练) |
| position embedding | 告诉模型"这个 token 在第几位"(因为 Transformer 没有顺序感) |

这两个加起来才是真正喂给 Transformer 第一层的东西。后面 13 篇讲 Transformer 时会展开。

> **思想没死,实现变了**。"用稠密向量表达 token 的语义"这个核心想法,从 Word2Vec 到 BERT 再到 GPT,一脉相承。但你不再需要单独训练词向量了——它已经被吸收进端到端的大模型训练流程里。

---

## 九、给新手的建议

1. **不必精通 Word2Vec 推导**。理解"上下文决定语义""稠密向量""向量算术能反映语义"这三件事就够了。负采样、CBOW/Skip-gram 数学不用背。
2. **2026 年别再训 Word2Vec 了**。除非有特殊需求(超小语料、超低延迟、不能上 Transformer),否则用 BERT / sentence-transformers 拿到的 embedding 质量碾压它。
3. **`nn.Embedding` 是查表,不是网络**。它的"训练"就是更新表里的行向量,概念上极其简单。新手常以为它在做什么神秘运算,放心,就是查表 + 反向传播更新表。
4. **`padding_idx` 一定要设**。否则 padding 的 0 也会更新梯度,污染你的训练。
5. **embedding_dim 经验值**:小任务 64-128,中型 256,大模型 768/1024/4096。别拍脑袋选 7 这种奇怪的数。
6. **预训练 embedding 用不用看场景**。数据多就 random init + 随模型训练;数据少就用预训练 + freeze。中间地带先用预训练 + fine-tune 是稳妥选择。
7. **理解"为什么 word2vec 不够"比理解"word2vec 怎么算"更重要**。这是 BERT/GPT 出现的动机,也是这一篇的真正落点。
8. **本篇是经典架构三篇的收尾**。读完 09、10、11 之后,你已经具备读 12 篇 Attention 的全部前置——RNN 的 hidden state 局限、Word2Vec 的静态向量局限,这两个痛点直接催生了 Transformer。

---

下一篇:`12-Attention注意力机制.md`,这是整个教程的转折点——从经典神经网络迈向现代大模型的核心机制。前三篇(09/10/11)看完之后,你会对这一篇为什么"开天辟地"有最直观的感受。
