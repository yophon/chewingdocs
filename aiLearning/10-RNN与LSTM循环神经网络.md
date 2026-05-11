# RNN 与 LSTM 循环神经网络

CNN 解决了"图像怎么看",这一篇解决"序列怎么读"——文字、语音、股价、时间序列,只要数据有先后顺序,你都需要一个能"记住前面"的网络。

> 一句话先记住:RNN 的核心是**一个不断被覆盖的 hidden state**,它在时间维度上一格格往前走,负责把"过去"压缩进当前一步。LSTM 是"加了三个开关的 RNN",让这个 state 别那么容易忘掉重要东西。

这篇会有一些"反面教材"的味道——RNN 在 2026 年已经不是主流了,但你必须懂它,因为它是 Attention 和 Transformer 出现的**直接动机**。

---

## 一、序列数据的特点

跟图像不一样,序列数据有两个特点让 MLP 和 CNN 都难受:

| 特点 | 例子 | MLP / CNN 的问题 |
| --- | --- | --- |
| 变长 | 句子有长有短,语音可以 1 秒也可以 1 分钟 | 全连接层要求固定输入维度,做不到 |
| 时序依赖 | "我没吃饭" vs "我吃过饭",改一个 token 意思反了 | 不考虑顺序就没法理解 |
| 长程依赖 | "他从北京坐飞机到上海,然后下午在那里见了客户"——"那里"指上海 | 简单 n-gram 看不到这么远 |

> 工程上"变长"还能用 padding 凑齐,但**时序依赖**这件事,需要网络架构本身具备"按顺序处理"的能力。RNN 就是为这件事设计的。

---

## 二、RNN:hidden state 在时间维度传递

RNN(Recurrent Neural Network)的核心是一个简单的递推式:

```
h_t = tanh(W_xh · x_t + W_hh · h_{t-1} + b)
y_t = W_hy · h_t + b'
```

`h_t` 就是 **hidden state**——你可以把它理解成"网络读到第 t 步时的记忆向量"。

按时间展开来看:

```
x_1   x_2   x_3   x_4   ...   x_T
 │     │     │     │             │
 ▼     ▼     ▼     ▼             ▼
[h_1]→[h_2]→[h_3]→[h_4]→ ... →[h_T]
 │     │     │     │             │
 ▼     ▼     ▼     ▼             ▼
y_1   y_2   y_3   y_4   ...   y_T
```

注意三个关键点:

1. **每个时间步用的是同一组权重** `W_xh`、`W_hh`、`W_hy`(参数共享,跟 CNN 一样)
2. **hidden state 在时间维度顺序流动**,t 步的输出依赖 t-1 步的状态
3. **RNN 处理变长序列天然适配**——序列多长就 unroll 多少步

> 直觉理解:RNN 像一个**只能从左到右看一遍、有短期记忆的读者**——你给它文字,它一边读一边脑子里维护一个"理解",每读一个新词就更新一次。

### RNN 能干什么

| 任务类型 | 输入/输出 | 例子 |
| --- | --- | --- |
| 多对一 | 序列输入,单个输出 | 情感分类(读完整句话给个 label) |
| 多对多(同长) | 序列输入,序列输出 | 词性标注 |
| 多对多(不同长) | 序列输入,序列输出 | 机器翻译(Seq2Seq) |
| 一对多 | 单个输入,序列输出 | 看图说话 |

---

## 三、梯度消失 / 爆炸为什么发生

RNN 看着很美,但有个致命问题:**它学不会长依赖**。原因藏在反向传播里。

把递推式连续展开,从 t 步反向传到 1 步,梯度里会出现这一项:

```
∂h_t / ∂h_1 = ∏_{k=1}^{t-1} W_hh · diag(tanh'(...))
```

注意那个连乘符号 ∏。如果时间步 t 是 100,这就是 100 个矩阵连乘。

直觉上:

| W_hh 的特性 | 100 次连乘的结果 | 后果 |
| --- | --- | --- |
| 元素普遍 < 1 | 趋近于 0 | **梯度消失**:远处的信号传不回来,网络只能学短依赖 |
| 元素普遍 > 1 | 趋近于无穷 | **梯度爆炸**:loss 直接 NaN |

加上 tanh 的导数最大值才 1(且 saturating 区域接近 0),RNN 实践中**几乎只会出梯度消失**。

> 实测里,普通 RNN 一般只能记住 **5-10 步**之前的东西,再远基本就丢了。一篇 200 词的文章,你让它读完后总结开头讲了什么——做不到。

工程上能做的缓解措施:

1. 梯度裁剪(`torch.nn.utils.clip_grad_norm_`)防爆炸,但救不了消失
2. 用 ReLU 替换 tanh,部分缓解,但引入新问题
3. 改用 LSTM / GRU——这才是工业标准答案

---

## 四、LSTM:遗忘门、输入门、输出门

LSTM(Long Short-Term Memory,1997 年)的核心创新是引入了一条**单独的"传送带"**叫 cell state(记作 c_t),它**不经过非线性激活**,只做加减法。

LSTM 单元的结构:

```
        ┌──────────────────────────────┐
c_{t-1} ┤  × (forget gate)             │  c_t
        │           +  ────────────►   │
        │           ↑ (input gate)      │
        │           × (candidate ĉ_t)   │
        └──────────────────────────────┘
        ┌──────────────────────────────┐
h_{t-1} │  → 计算 4 个门 (f,i,ĉ,o)      │  h_t = o · tanh(c_t)
x_t     │                                │
        └──────────────────────────────┘
```

四个公式(看着唬人,本质都是 sigmoid 算个 0~1 的开关):

```
f_t = σ(W_f · [h_{t-1}, x_t] + b_f)        # 遗忘门:c_{t-1} 留多少
i_t = σ(W_i · [h_{t-1}, x_t] + b_i)        # 输入门:新信息收多少
ĉ_t = tanh(W_c · [h_{t-1}, x_t] + b_c)     # 候选记忆
c_t = f_t · c_{t-1} + i_t · ĉ_t            # 更新 cell state
o_t = σ(W_o · [h_{t-1}, x_t] + b_o)        # 输出门:这步输出多少
h_t = o_t · tanh(c_t)
```

三个门的角色一句话总结:

| 门 | 作用 | 口语解释 |
| --- | --- | --- |
| forget gate (f) | 决定 c_{t-1} 哪些维度要遗忘 | "之前记的东西,哪些可以扔了" |
| input gate (i) | 决定 ĉ_t 哪些维度要写入 | "现在看到的新东西,值不值得记" |
| output gate (o) | 决定 h_t 暴露 c_t 的哪部分 | "这一步要不要把记忆暴露出去" |

### 为什么 LSTM 能学长依赖

关键看这一行:

```
c_t = f_t · c_{t-1} + i_t · ĉ_t
```

如果 forget gate `f_t ≈ 1`,cell state 就是**线性恒等传递** + 加法更新,反向传播时梯度沿这条路径几乎不衰减——这就是为什么 LSTM 能记住几十甚至上百步前的信息。

> 经验法则:**LSTM 比 RNN 强的本质,是把"记忆"和"输出"解耦了**。普通 RNN 的 h_t 既要当输出又要当记忆,顾此失彼;LSTM 的 cell state 专心当记忆,h_t 专心当输出。

---

## 五、GRU:LSTM 简化版

GRU(Gated Recurrent Unit,2014)把 LSTM 的三个门合并成两个,把 cell state 和 hidden state 合并成一个:

```
r_t = σ(W_r · [h_{t-1}, x_t])              # 重置门
z_t = σ(W_z · [h_{t-1}, x_t])              # 更新门
h̃_t = tanh(W · [r_t · h_{t-1}, x_t])
h_t = (1 - z_t) · h_{t-1} + z_t · h̃_t      # 加权融合
```

LSTM vs GRU:

| 维度 | LSTM | GRU |
| --- | --- | --- |
| 门数量 | 3 个 | 2 个 |
| 状态 | h_t + c_t | 只有 h_t |
| 参数量 | 多约 25% | 少 |
| 速度 | 慢 | 快 |
| 效果 | 长序列略好 | 中短序列差不多 |

> 选型经验法则:**短序列(< 100 步)用 GRU,长序列(几百步)用 LSTM**。但说实话,2026 年你大概率用不上它们,直接 Transformer。

---

## 六、Seq2Seq + Attention 的瓶颈

机器翻译的经典做法叫 Seq2Seq(2014):

```
Encoder LSTM         Decoder LSTM
─────────────        ─────────────
x_1 x_2 x_3 x_4  →   c   →   y_1 y_2 y_3 y_4 y_5
                    (上下文向量)
```

Encoder 把整个源句子压缩成**一个固定长度的向量** c,Decoder 拿着这个 c 生成目标句子。

问题立刻就来了:

> **不管输入是 5 个词还是 50 个词,都要塞进一个固定大小的向量。** 长句信息必然损失。

2015 年 Bahdanau Attention 出场,做了一件事:让 Decoder 在生成每个目标词时,**回头看 Encoder 所有时间步的 hidden state,加权求和**。

```
Decoder 第 t 步:
  α_{t,i} = softmax(score(s_t, h_i))     ← 对每个 Encoder 步打分
  context_t = Σ α_{t,i} · h_i             ← 加权求和
  y_t = output(s_t, context_t)
```

这个想法叫 attention(注意力)。它解决了固定向量瓶颈,翻译效果一举突破。

> **伏笔来了**:既然 attention 这么强,为什么还要 RNN?能不能完全用 attention?——这就是 2017 年 Transformer 论文的标题:**Attention Is All You Need**。下一篇 12 篇会专门讲这个机制,你会看到它怎么把 RNN 彻底踢出主流舞台。

---

## 七、PyTorch nn.LSTM 用法

PyTorch 的 LSTM 用起来很简单,坑也不少。基本范式:

```python
import torch
import torch.nn as nn

# 任务:对一批文本做情感分类(多对一)
class TextLSTM(nn.Module):
    def __init__(self, vocab_size, embed_dim=128, hidden_dim=256, num_classes=2):
        super().__init__()
        self.embed = nn.Embedding(vocab_size, embed_dim)
        # batch_first=True 让输入形状为 (B, T, D),否则是 (T, B, D)
        self.lstm = nn.LSTM(
            input_size=embed_dim,
            hidden_size=hidden_dim,
            num_layers=2,
            batch_first=True,
            dropout=0.3,
            bidirectional=False,
        )
        self.fc = nn.Linear(hidden_dim, num_classes)

    def forward(self, x):
        # x: (B, T)  token id 序列
        emb = self.embed(x)                          # (B, T, embed_dim)
        out, (h_n, c_n) = self.lstm(emb)
        # out: (B, T, hidden_dim) —— 每个时间步的输出
        # h_n: (num_layers, B, hidden_dim) —— 最后一步的 hidden state
        last_hidden = h_n[-1]                        # 取最后一层
        return self.fc(last_hidden)                  # (B, num_classes)

# 假设词表 1 万,序列长度 50
model = TextLSTM(vocab_size=10000)
x = torch.randint(0, 10000, (32, 50))   # batch=32, seq_len=50
logits = model(x)
print(logits.shape)   # torch.Size([32, 2])
```

几个**容易踩的坑**:

1. **`batch_first=True` 一定要写**。默认 False,输入是 (T, B, D),写错了 shape 错乱很难发现。
2. **`h_n[-1]` 才是最后一层最后一步**。`out[:, -1, :]` 也是,但形状要对。多层 LSTM 时别用错。
3. **不要把整个 `out` 扔到全连接里再分类**。多对一任务用最后一步,多对多任务才用整个 out。
4. **变长序列用 `pack_padded_sequence`**,否则 padding 的 0 会污染 hidden state。

---

## 八、为什么 RNN 被 Transformer 取代

到 2017 年,大家发现 RNN/LSTM 有几个绕不开的硬伤:

| 问题 | RNN/LSTM | Transformer |
| --- | --- | --- |
| 并行性 | **几乎不能并行**,t 步必须等 t-1 步算完 | 整个序列同时计算,GPU 利用率拉满 |
| 长程依赖 | 即使是 LSTM,几百步以上也吃力 | Attention 任意两个位置直接连,O(1) 距离 |
| 训练速度 | 序列越长,训练越慢(线性) | 序列长度内并行,单步快得多 |
| 信息瓶颈 | 全部压在一个 hidden state | 每对位置独立交互 |
| Scaling | 加深加宽收益快速饱和 | 模型越大效果越好,孕育出 LLM |

> **本质上,RNN 是"顺序计算 + 单一记忆通道",Transformer 是"并行计算 + 全连接交互"**。GPU 时代,前者是天生劣势——你买了 8 张 H100,RNN 只能干等着上一步算完,而 Transformer 能把所有 token 同时塞进去算。

这就是为什么 2018 年之后,几乎所有 NLP 大模型都换成 Transformer,RNN 系列从主流退到边角料。

---

## 九、RNN 现在还有价值吗

有,但场景变窄了。2026 年你还会在这些地方看到 RNN/LSTM:

| 场景 | 为什么还用 RNN | 例子 |
| --- | --- | --- |
| 极小模型 / 边缘设备 | LSTM 参数量小、推理快、显存占用稳定 | 智能音箱的唤醒词检测、可穿戴设备的步态识别 |
| 流式推理 | RNN 天然支持"来一帧算一帧",Transformer 要 KV Cache 才行 | 实时语音识别(虽然现在也有 Streaming Transformer) |
| 时间序列预测 | 数据量小,LSTM/GRU baseline 跑得通 | 工业传感器、能耗预测、销量预测 |
| 强化学习的 policy 网络 | 状态空间小,RNN 够用,而且记忆机制契合 | 部分机器人控制 |
| 学术研究 | 作为 baseline 对比,或研究新架构(SSM、Mamba 等"现代 RNN") | RWKV、Mamba 系列其实是 RNN 思想的复兴 |

> **彩蛋**:2024 年开始热起来的 Mamba / SSM(State Space Model),本质是把 RNN 的递推思想做了一次现代化改造——线性递推 + 高效并行训练。它能不能真的撼动 Transformer 的地位,2026 年还在打。**RNN 这条路并没有死,只是换了形态在赛跑。**

---

## 十、给新手的建议

1. **不必精通 RNN 数学**,理解"hidden state 在时间维度传递"和"梯度消失"两件事就够了。LSTM 的四个公式不用背,会查就行。
2. **写代码先用 GRU**。比 LSTM 简单、参数少、收敛快,效果差异在大多数任务里可以忽略。
3. **变长序列必须用 packing**(`pack_padded_sequence` + `pad_packed_sequence`),不然 padding 会让结果偏差。
4. **`hidden_size` 默认 128 / 256 起步**,任务越复杂越大,但 RNN 加宽收益远不如加深(而加深又会梯度消失,所以中庸之道)。
5. **遇到 NaN 第一反应是检查梯度爆炸**。`torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)` 加上,80% 的 NaN 问题没了。
6. **新项目优先用 Transformer**。除非你明确知道为什么要用 RNN(边缘部署、流式、超小数据),否则 2026 年用 Transformer 的成本更低、上限更高。
7. **看老论文别气馁**。2014-2017 那批 NLP 论文里 LSTM、Bi-LSTM、Stacked LSTM、ConvLSTM 各种花样,看不懂正常,挑跟你任务相关的看就行。
8. **理解 attention 的动机比理解 LSTM 公式更重要**。这篇你只要带走一句话:**RNN 的 hidden state 是个瓶颈,attention 把它砸开了**。

---

下一篇:`11-WordEmbedding词向量.md`,讲文字怎么变成神经网络能吃的数字——这是 NLP 整个体系的入口。
