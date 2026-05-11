# 推理与采样:temperature、top-p、top-k

调 LLM API 的人都见过 `temperature` 这种参数,但很少有人能讲清楚它们到底在改什么。这一篇讲透:从模型吐出 logits 那一刻起,到最后落到一个具体 token,中间到底发生了什么。

> 一句话先记住:**模型每一步给出的不是一个词,是整个词表上的一个概率分布。所谓"采样参数",就是在改这个分布的形状。**

---

## 一、解码:从 logits 到 token

自回归 LLM 每生成一个 token,实际只做了一件事:

```
输入 [t1, t2, ..., tn]
       ↓ Transformer
输出 logits ∈ ℝ^V        # V 是词表大小,常见 32k ~ 200k
       ↓ softmax
概率分布 p ∈ ℝ^V          # 所有元素 ≥ 0,加起来 = 1
       ↓ 采样策略
下一个 token tn+1
```

`logits` 是没归一化的"分数",每个词表位置一个值。`softmax` 把它压成概率:

```
p_i = exp(logit_i) / Σ_j exp(logit_j)
```

**采样策略就是"怎么从 p 里挑一个"**,这才是 temperature/top-k/top-p 的工作场景。模型本身不变,变的是后处理。

| 阶段 | 谁的活 | 是否可以调 |
| --- | --- | --- |
| 算 logits | 模型权重 | 不可调(除非改模型) |
| 归一化成概率 | softmax | 可以加 temperature |
| 截断分布 | top-k / top-p | 可以选 |
| 抽样 | 从分布里 sample | 可以加 seed |

> 看清这个分层很重要。"幻觉"是 logits 阶段的问题,采样参数救不了;"重复啰嗦"才是采样阶段的问题。

---

## 二、Greedy Decoding(直接选最大概率)

最简单的策略:每步直接挑 `argmax(p)`。

```python
import torch

def greedy_decode(model, input_ids, max_new_tokens=50):
    for _ in range(max_new_tokens):
        with torch.no_grad():
            logits = model(input_ids).logits[:, -1, :]   # 最后一个位置的 logits
        next_token = torch.argmax(logits, dim=-1, keepdim=True)
        input_ids = torch.cat([input_ids, next_token], dim=-1)
        if next_token.item() == model.config.eos_token_id:
            break
    return input_ids
```

特点:

- **确定性**:同样的输入永远得到同样的输出(理论上,见第十节)
- **容易陷入循环**:"我我我我我..." / "Thanks. Thanks. Thanks."
- **常用于**:抽取、分类、翻译、JSON 生成等"答案唯一"的场景

> Greedy 不等于"最好的整句"。它每步局部最优,但整句可能不是概率最大的序列。这是它和 Beam Search 的区别。

---

## 三、Beam Search(机器翻译时代,LLM 时代基本不用)

Beam Search 维护 `beam_size`(常见 4 / 8)条候选序列,每步扩展所有可能,保留累计概率最高的 `beam_size` 条。

```
beam=2,词表={A,B,C}
step1:
  最高 2 条:[A](0.5)、[B](0.3)
step2:
  从 [A] 扩展:[AA](0.5*0.4)、[AB](0.5*0.3)、[AC](0.5*0.3)
  从 [B] 扩展:[BA](0.3*0.6)、[BB](0.3*0.3)、[BC](0.3*0.1)
  保留概率最高的 2 条:[AA](0.20)、[BA](0.18)
...
```

适用场景:

| 任务 | Beam Search 适合吗 |
| --- | --- |
| 机器翻译 | ✅ 经典战场,有"标准答案" |
| 摘要 | ✅ 有事实约束 |
| 开放生成(对话、写作) | ❌ 输出会变得无聊、模板化 |
| 代码生成 | 有时用,但 LLM 时代基本被取代 |

LLM 时代为什么很少用 Beam:

1. **输出"求稳"反而变差**。Beam 倾向选最常见的搭配,创意题目下输出像八股文。
2. **计算贵**。每步要维护 beam_size 条序列,显存和速度都吃亏。
3. **采样 + temperature 已经够用**,主流 API(OpenAI、Anthropic)甚至不暴露 beam 参数。

> 你看到 `transformers.generate(num_beams=4)` 还能跑,但商用 LLM API 几乎都默认采样。Beam 已经成了"翻译模型的特化技巧"。

---

## 四、Temperature 怎么影响概率分布(数学+直觉)

Temperature 直接改 softmax 的输入:

```
p_i = exp(logit_i / T) / Σ_j exp(logit_j / T)
```

- `T = 1`:原始分布
- `T → 0`:分布变尖,只有最大值留下来 → 等价于 greedy
- `T → ∞`:分布变平,所有 token 概率趋同 → 等价于均匀随机

直观感受(假设三个候选 logits 是 [3.0, 2.0, 1.0]):

| T | softmax 后 | 含义 |
| --- | --- | --- |
| 0.1 | [0.9999, 0.0001, ~0] | 几乎一定选第一个 |
| 0.5 | [0.87, 0.12, 0.01] | 倾向选第一个,有少量随机 |
| 1.0 | [0.67, 0.24, 0.09] | 原始分布 |
| 2.0 | [0.51, 0.31, 0.19] | 第二第三都更有戏 |
| 5.0 | [0.42, 0.34, 0.24] | 接近均匀 |

```python
import torch
import torch.nn.functional as F

logits = torch.tensor([3.0, 2.0, 1.0])
for T in [0.1, 0.5, 1.0, 2.0, 5.0]:
    p = F.softmax(logits / T, dim=-1)
    print(f"T={T}: {p.tolist()}")
```

**直觉记忆**:

- 0.0 ~ 0.3:抽取、JSON、代码、分类(要稳)
- 0.5 ~ 0.8:对话、问答、改写(默认主战场)
- 0.9 ~ 1.2:写作、起名、头脑风暴
- > 1.5:很容易跑飞,慎用

> Anthropic 和 OpenAI 的 API 默认 temperature 通常是 1.0,但 Claude 内部会做一些 calibration,实际"感觉"和 OpenAI 0.7 类似。**不要跨模型直接复用 temperature 数值**。

---

## 五、Top-k 采样

只在概率最高的 k 个 token 里采样,其余归零再重新归一化。

```python
def top_k_sampling(logits, k=50):
    top_k_logits, top_k_indices = torch.topk(logits, k=k, dim=-1)
    probs = F.softmax(top_k_logits, dim=-1)
    next_token_idx = torch.multinomial(probs, num_samples=1)
    return top_k_indices.gather(-1, next_token_idx)
```

特点:

- **截断"长尾"**。词表里 95% 的 token 在大多数语境下概率都极低,留着只会带来噪声。
- **k 是个"硬阈值"**:不管这 k 个里第 k 个的概率多低,都参与抽样;不管第 k+1 个多高,都被踢掉。
- **常见取值**:k = 40 ~ 100。

| k | 效果 |
| --- | --- |
| 1 | 等价于 greedy |
| 10 | 输出非常保守 |
| 50 | 默认值附近,效果稳定 |
| 1000 | 几乎等于不截断,长尾噪声进来 |

> Top-k 的痛点:**在不同位置上,合理的候选数差别很大**。生成"今天天气真"后面,合理选项可能就 5 个;但生成"我喜欢"后面,几百个名词都合理。固定 k 在两种场景都不最优,所以现在更常用 top-p。

---

## 六、Top-p (Nucleus) 采样

按概率从高到低累加,累计到 p 后停下,只在这部分里采样。

```python
def top_p_sampling(logits, p=0.9):
    sorted_logits, sorted_indices = torch.sort(logits, descending=True)
    sorted_probs = F.softmax(sorted_logits, dim=-1)
    cumulative_probs = torch.cumsum(sorted_probs, dim=-1)

    # 找到累计概率超过 p 的位置
    mask = cumulative_probs > p
    # 保留第一个超过 p 的位置(否则可能空集)
    mask[..., 1:] = mask[..., :-1].clone()
    mask[..., 0] = False

    sorted_logits[mask] = float('-inf')
    probs = F.softmax(sorted_logits, dim=-1)
    next_token_idx = torch.multinomial(probs, num_samples=1)
    return sorted_indices.gather(-1, next_token_idx)
```

直觉:**让候选集合的"信息量"大致稳定**。

- "今天天气真"后面分布尖,top-p=0.9 可能只取 3-5 个 token
- "我喜欢"后面分布平,top-p=0.9 可能取几十个 token

两者对比:

| 维度 | top-k | top-p |
| --- | --- | --- |
| 截断方式 | 固定个数 | 固定累计概率 |
| 分布尖时 | 候选过多,引入噪声 | 自适应缩小 |
| 分布平时 | 砍掉合理选项 | 自适应扩大 |
| 推荐 | 不如 top-p 通用 | **首选** |

实际工程里常**两者一起用**:先 top-k=50 兜底,再 top-p=0.9 精修。HuggingFace `generate` 默认就这么干。

> 经验值:`top_p = 0.9 ~ 0.95`,`temperature = 0.7 ~ 1.0`,这是大多数对话场景的甜点。

---

## 七、Repetition Penalty / frequency_penalty / presence_penalty

LLM 经常"我我我"或"thank you. thank you."。三个参数都是治这个,但思路不一样。

### 7.1 repetition_penalty(HuggingFace 风格)

对已经出现过的 token,把 logits 除以一个系数(>1 时降低概率,<1 时提升):

```python
def apply_repetition_penalty(logits, generated_ids, penalty=1.1):
    for token_id in set(generated_ids):
        if logits[token_id] > 0:
            logits[token_id] /= penalty
        else:
            logits[token_id] *= penalty
    return logits
```

- 1.0:无影响
- 1.1 ~ 1.3:常用区间
- > 1.5:容易把"the""and"这种功能词也压掉,句子开始磕巴

### 7.2 frequency_penalty(OpenAI 风格)

按 token **出现次数**线性减分:

```
new_logit = logit - frequency_penalty * count(token)
```

- 范围 -2.0 ~ 2.0
- 出现越多,惩罚越重
- 适合长文本生成,避免反复啰嗦

### 7.3 presence_penalty(OpenAI 风格)

按是否**出现过**(0/1)减分,只要出现过就被惩罚一次:

```
new_logit = logit - presence_penalty * (1 if appeared else 0)
```

- 鼓励"换新词"
- 适合需要多样性的场景,比如让模型聊不同的话题

| 参数 | 思路 | 推荐场景 |
| --- | --- | --- |
| repetition_penalty | 乘除 logits | 开源模型(HF / vLLM) |
| frequency_penalty | 按次数减分 | 防止重复用词 |
| presence_penalty | 出现就扣 | 鼓励话题多样性 |

> 两者都开 0.1 ~ 0.3 是个稳妥起点。开太大会让输出"为换词而换词",反而看着别扭。

---

## 八、参数对照表:写代码 / 创作 / 抽取 / 对话各自怎么调

| 场景 | temperature | top_p | top_k | freq_penalty | 备注 |
| --- | --- | --- | --- | --- | --- |
| 写代码 | 0.1 ~ 0.3 | 0.95 | 50 | 0 | 接近 greedy,但留点余地 |
| 抽取 / 分类 / JSON | 0.0 ~ 0.2 | 1.0 | - | 0 | 越确定越好,常配 logit_bias |
| 翻译 | 0.2 ~ 0.5 | 0.95 | - | 0.1 | 略加多样,避免逐词翻 |
| 客服 / FAQ 对话 | 0.5 ~ 0.7 | 0.9 | - | 0.2 | 答案稳定,语气自然 |
| 聊天助手 | 0.7 ~ 0.9 | 0.9 | - | 0.3 | 默认主战场 |
| 创作 / 小说 | 0.9 ~ 1.2 | 0.92 | - | 0.4 | 鼓励发散 |
| 头脑风暴 | 1.0 ~ 1.3 | 0.95 | - | 0.5 | 多给变化 |

OpenAI 风格调用:

```python
from openai import OpenAI
client = OpenAI()

resp = client.chat.completions.create(
    model="gpt-5-mini",
    messages=[{"role": "user", "content": "起 5 个咖啡店名字"}],
    temperature=1.1,
    top_p=0.95,
    frequency_penalty=0.3,
    presence_penalty=0.5,
)
```

Anthropic 风格调用:

```python
import anthropic
client = anthropic.Anthropic()

resp = client.messages.create(
    model="claude-opus-4-5",
    max_tokens=1024,
    temperature=1.0,
    top_p=0.9,
    messages=[{"role": "user", "content": "起 5 个咖啡店名字"}],
)
```

> Anthropic 不暴露 frequency / presence penalty,理由是 Claude 在训练阶段已经处理了重复问题。**不同厂商的"哲学"不同,别简单照搬参数**。

---

## 九、采样 vs Greedy:什么场景用哪个

决策表:

| 你想要的 | 选 | 理由 |
| --- | --- | --- |
| 同样输入 → 同样输出 | greedy / temp=0 | 测试、CI、回归对比 |
| 一次问多次得到不同答案 | 采样(temp>0) | self-consistency、ensemble |
| 创意 / 写作 | 采样,temp 高 | greedy 输出会很无聊 |
| 解析结构化数据 | greedy + JSON 模式 | 格式必须确定 |
| 工具调用决策 | 低温采样(0.1) | 主路径稳定,但留一点点容错 |
| 头脑风暴一次出 5 个候选 | 高温采样,n=5 | 多样性优先 |

**Self-consistency(经典技巧)**:同一道数学题,采样跑 5 次,选答案出现最多的那个。比 greedy 一次准很多。

```python
from collections import Counter

answers = []
for _ in range(5):
    resp = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=1024,
        temperature=1.0,
        messages=[{"role": "user", "content": "26 * 17 等于多少?只输出数字。"}],
    )
    answers.append(resp.content[0].text.strip())

print(Counter(answers).most_common(1)[0][0])
```

---

## 十、踩坑:temperature=0 不一定确定性(浮点、batch 影响)

这是 99% 的人不知道的事。设了 `temperature=0` 不代表你能复现一模一样的输出。

原因有四个:

### 10.1 浮点 non-associative

```
(a + b) + c  ≠  a + (b + c)   // 浮点加法不满足结合律
```

GPU 上做矩阵乘法,不同 batch、不同硬件、不同 kernel 实现,**累加顺序不一样**,最后几位 bit 会不同。当两个 token 的 logits 极接近时,argmax 可能跳变。

### 10.2 batch 大小变化

商用 API 后端会把不同用户的请求合并成 batch 做推理。**你的请求被放进多大的 batch 是不可控的**,而 batch 大小会影响 kernel 选择,从而影响数值精度。

### 10.3 KV cache 实现细节

是否启用 cache、cache 是否被分页、是否做了量化(FP16 / BF16 / INT8),都会让数值结果飘动。

### 10.4 系统负载

某些 API 在高负载时会切到不同的推理后端(比如降级到量化版本),输出会不一样。

应对方法:

| 你想要 | 怎么做 |
| --- | --- |
| 单机本地复现 | 固定 seed + `torch.use_deterministic_algorithms(True)` + 单卡跑 |
| API 复现 | OpenAI 提供 `seed` 参数,但官方写明"best effort";Anthropic 没有 seed |
| 评测稳定 | 跑多次取平均,不要追求 bit 一致 |
| 业务幂等 | **不要依赖 LLM 输出本身做幂等**,自己加缓存层 |

> **教训**:把 LLM 当成"概率系统",不要当成"纯函数"。你的代码要在它"今天答 A、明天答 B"的前提下还能跑。

---

## 给新手的建议

1. **不要从一堆参数开始调**。先用默认值跑通,效果不行再动 temperature,**先 temperature,后 top_p,最后 frequency_penalty**。
2. **A/B 时一次只动一个参数**。同时改三个参数,你永远不知道是谁的功劳。
3. **抽取类任务无脑 temp=0**。需要稳定结构、需要复现的,先把随机性关掉再说。
4. **不要跨模型套参数**。Claude 的 0.7 ≠ GPT 的 0.7 ≠ Llama 的 0.7,各家训练数据和 calibration 不同。
5. **写测试用低温,别用 temp=0**。temp=0 在浮点层面也会飘,用 temp=0.1 + 多次采样比较"语义等价"更靠谱。
6. **遇到重复啰嗦,先看 prompt 再调参数**。很多重复是 prompt 引诱出来的(比如让模型"详细解释"它会本能地凑字数),改 prompt 比加 frequency_penalty 治本。
7. **看到模型"乱编"别第一反应调 temperature**。幻觉是 logits 阶段的事,采样救不了,要靠 RAG / few-shot / 工具调用。

---

下一篇:`17-预训练SFT与RLHF.md`,讲一个 LLM 是怎么从"乱说话的鹦鹉"被训成"会聊天的助手"的。
