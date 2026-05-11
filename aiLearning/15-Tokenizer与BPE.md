# Tokenizer 与 BPE

LLM 不直接吃文字,它吃的是 **token**——一串整数 ID。Tokenizer 就是"文字 ↔ 整数"的双向翻译器。

听起来很无聊,但**它是 LLM 应用层最高频踩坑的地方**:你以为输入了 100 个汉字,API 算成 200 个 token;你拼了个 emoji,context 多花一截;你把 JSON 切错位,模型直接看不懂。这一篇把它彻底讲清楚。

> 一句话先记住:**Tokenizer 决定了 LLM 看见的"原子单位",改 tokenizer = 换大脑**。它不能在训练后再换。

---

## 一、为什么需要 token

最朴素的想法:把文字编码成"字符 ID"喂给模型不就行了?比如 ASCII 只有 128 个字符,Unicode 把全人类语言纳入,一个 char 对应一个 ID。

为什么不行?三个原因:

| 方案 | 序列变长 | 词表大小 | 单 token 携带的语义 |
| --- | --- | --- | --- |
| 字节级(UTF-8) | **极长**(汉字 3 字节) | 256 | 几乎为零,1 个字节 |
| 字符级 | 较长 | Unicode 几十万 | 一点点 |
| **词级**(white-space split) | 较短 | 数十万到数百万 | 高(一个词) |
| **Subword(BPE/WordPiece)** | 折中 | 几万到 20 万 | 中等 |

字节级或字符级:**序列太长**。一句"我爱你"要 9 个字节,Transformer attention 是 O(n²),context 直接爆。而且**1 个字节本身没语义**,模型要花大量算力去"组词"。

词级:**词表爆炸**。英文还能勉强(空格切分),中文怎么办?分词本身就是难题。新词(比如 "ChatGPT" "thinking-model")永远 OOV(out-of-vocabulary)。

**Subword 是折中**:常见词作为一个 token,罕见词拆成更小的 subword,既不会词表爆炸又不会序列过长,还能处理新词:

```
"thinking"  →  ["think", "ing"]                # 两个 subword
"GPT-5"     →  ["GPT", "-", "5"]              # 拆成可识别的小块
"煎饼果子"   →  ["煎", "饼", "果子"]           # 部分组合
```

> **核心理念**:让常见的 pattern 变成单独 token,稀有的就拆开。**统计上效率最高**,这就是 BPE 干的事。

---

## 二、字符级 vs 词级 vs subword

举个对比例子,处理 "I love deep learning":

```
字符级:  ['I', ' ', 'l', 'o', 'v', 'e', ' ', 'd', 'e', 'e', 'p', ' ', 'l', 'e', 'a', 'r', 'n', 'i', 'n', 'g']
         20 个 token

词级:    ['I', 'love', 'deep', 'learning']
         4 个 token,但词表要包含 'learning' 和 'learn' 两个

subword: ['I', ' love', ' deep', ' learn', 'ing']
         5 个 token,词表只要 ['I', ' love', ' deep', ' learn', 'ing'] 等基础块
```

> **注意 subword 里 token 自带空格**(` love` 而不是 `love`)。这是 GPT 系 BPE 的特点——空格被当成词的开头标记。这影响很多边界 bug,后面踩坑会讲。

字符级和词级各有死结,subword 用一种**自适应**的方式解决:常用词当一个 token,罕用词组合而成。BPE 是 subword 里最主流的算法。

---

## 三、BPE 算法

BPE = Byte Pair Encoding,1994 年用于数据压缩,2015 年被引入 NLP。算法极简:

> **核心思想**:统计语料里**最常出现的相邻字符对**,合并成一个新 token,反复执行 N 次。

### 手算演示

假设训练语料就 4 个词(数字是出现频次):

```
"low"      : 5
"lower"    : 2
"newest"   : 6
"widest"   : 3
```

**Step 0:初始化为字符级 + 词尾标记 `</w>`**(标记一个词到这结束):

```
'l o w </w>'      : 5
'l o w e r </w>'  : 2
'n e w e s t </w>': 6
'w i d e s t </w>': 3

初始词表: {'l', 'o', 'w', 'e', 'r', 'n', 's', 't', 'i', 'd', '</w>'}
```

**Step 1:统计相邻 pair 频次**

```
('l','o') = 5+2 = 7
('o','w') = 5+2 = 7
('w','</w>') = 5
('w','e') = 2+6 = 8     ← 最高
('e','r') = 2
('r','</w>') = 2
('n','e') = 6
('e','s') = 6+3 = 9     ← 错,这个更高
('s','t') = 6+3 = 9     ← 错,这个并列
... 
```

实际上 `('e','s')` = 9 最高,合并成新 token `'es'`:

```
'l o w </w>'        : 5
'l o w e r </w>'    : 2
'n e w es t </w>'   : 6
'w i d es t </w>'   : 3

词表追加: 'es'
```

**Step 2:再统计**,`('es', 't')` = 9 最高,合并成 `'est'`:

```
'l o w </w>'        : 5
'l o w e r </w>'    : 2
'n e w est </w>'    : 6
'w i d est </w>'    : 3

词表追加: 'est'
```

**Step 3:`('est','</w>')` = 9 最高,合并成 `'est</w>'`**:

```
'l o w </w>'         : 5
'l o w e r </w>'     : 2
'n e w est</w>'      : 6
'w i d est</w>'      : 3
```

**Step 4:`('l','o')` = 7,合并成 `'lo'`**

**Step 5:`('lo','w')` = 7,合并成 `'low'`**

照这个规律走下去,最终得到一组合并规则。**编码时按训练时学到的合并顺序**,把新文本一步步合并成 token 序列。

### 算法核心代码

```python
from collections import Counter

def get_pair_freq(corpus):
    """统计语料里所有相邻 pair 的频次"""
    pairs = Counter()
    for word, freq in corpus.items():
        symbols = word.split()
        for i in range(len(symbols) - 1):
            pairs[(symbols[i], symbols[i+1])] += freq
    return pairs

def merge_pair(pair, corpus):
    """把所有出现该 pair 的位置合并"""
    merged = {}
    bigram = ' '.join(pair)
    replacement = ''.join(pair)
    for word, freq in corpus.items():
        new_word = word.replace(bigram, replacement)
        merged[new_word] = freq
    return merged

# 训练循环
corpus = {
    'l o w </w>': 5,
    'l o w e r </w>': 2,
    'n e w e s t </w>': 6,
    'w i d e s t </w>': 3,
}
num_merges = 10
for i in range(num_merges):
    pairs = get_pair_freq(corpus)
    if not pairs: break
    best = max(pairs, key=pairs.get)
    corpus = merge_pair(best, corpus)
    print(f"merge {i}: {best}")
```

### Byte-level BPE(GPT-2 起)

GPT-2 用 byte-level BPE:**先把所有文本转成 UTF-8 字节,再做 BPE**。好处:

- 词表里只有 256 个字节作为最小单位,**任何 Unicode 字符都能编码**(不会 OOV)
- 不需要预处理(分词、normalize)
- 中文、emoji、罕见字符都能处理

代价:中文一个字往往是 2-3 个字节,要好几个 token 才能表示一个汉字。**这就是中文 token 比英文"贵"的根本原因**。

> **现代主流模型**(GPT-4o、Claude、Llama)用的都是 byte-level BPE 或其变体。词表大小 100k-200k 是常见值。

---

## 四、WordPiece、Unigram、SentencePiece 的差异

BPE 不是唯一的 subword 算法,简单对比:

| 算法 | 代表模型 | 训练目标 | 切分方式 |
| --- | --- | --- | --- |
| **BPE** | GPT 系、Llama、Claude | 最大化合并频率 | 贪心从前往后 merge |
| **WordPiece** | BERT 系 | 最大化语料 likelihood | 贪心,但用 likelihood 而非频率 |
| **Unigram** | XLNet、T5 | EM 训练一个语言模型,删低概率 token | 概率最大化的切分(允许多种切法) |
| **SentencePiece** | T5、Llama、Mistral | **不是算法,是工具** | 把 BPE/Unigram 包装,**支持任意语言** |

最重要的两点:

1. **BPE 和 WordPiece 切分时是确定性的**(贪心),Unigram 是概率性的(可以采样不同切法用于数据增强)
2. **SentencePiece 解决了"中文/日文不需要预先分词"的问题**——它把空格当成普通字符 (`▁` 标记),整个文本流直接学 subword,**对中文友好**。Llama、Mistral 等多语言模型都用 SentencePiece + BPE。

```
BERT WordPiece:
  "playing"  →  ["play", "##ing"]      # ## 表示 subword 中段
  
GPT-2 BPE:
  " playing" →  [" play", "ing"]        # 空格在词首 token 里

SentencePiece:
  " playing" →  ["▁play", "ing"]        # ▁ 是 SentencePiece 的空格标记
```

> **应用层影响**:你看不见这些差异,但在调用不同 API 时,**同一段文字算出的 token 数会不同**。GPT、Claude、Gemini 各家词表都不一样。

---

## 五、中文 token 的特殊性

这是**中文应用工程师必须懂的**。

### 中文 token 的几种情况

GPT-3.5 时代,大量中文字按字节切,一个汉字 ~2-3 token:

```
"我爱你"  →  GPT-3.5 cl100k_base  →  6 tokens
"你好世界" →  GPT-3.5  →  8 tokens
```

GPT-4o(o200k_base)和 Claude 3+ 大幅扩了中文常用字 token,**一个汉字常常就 1 个 token**:

```
"我爱你"  →  GPT-4o o200k_base  →  3 tokens
"机器学习" →  GPT-4o  →  2 tokens(机器、学习 各一个)
```

| 模型 / Tokenizer | "你好世界" 的 token 数 |
| --- | --- |
| GPT-3.5 (cl100k_base) | 8 |
| GPT-4o (o200k_base) | 3 |
| Claude 3+ | 4 左右 |
| Llama 3 | 6-8 |
| Qwen / DeepSeek(中文优化) | 3-4 |

### 为什么中文 tokenizer 这么"卷"

中文每 token 字符数(compression ratio)**直接决定推理成本和速度**:

- 同样 4k context 上限,中文 tokenizer 能塞的字数差 2-3 倍
- 同样的模型,中文 tokenizer 烂的话**推理速度感觉慢得多**(因为要生成更多 token)

所以国产模型(Qwen、DeepSeek、GLM)在 tokenizer 上对中文做了大量优化。**这是它们在中文场景下经常比 Llama 用着更顺的隐藏原因**。

### 多字 token 的副作用

为了压缩,GPT-4o 把一些中文常见短语合并成一个 token:

```
"中华人民共和国" →  可能就 1-2 个 token
```

副作用:

1. **拼写错误难察觉**:模型看到的是整块,改一个字模型可能感知不到
2. **少见组合 vs 多 token**:罕见组合(比如"汉藏" "蓬莱")可能 2-3 token,而"经济"" 文化"是 1 token
3. **数字处理糟糕**:很多 tokenizer 把 4 位以上数字按奇怪边界切,导致 LLM 数学差(这也是为什么算术任务建议工具调用)

---

## 六、tiktoken 与 transformers tokenizer 实操

OpenAI 的 tiktoken 是最快的 BPE 实现,Anthropic 也开放了 token 计数 API。HuggingFace transformers 提供统一接口加载几乎所有模型的 tokenizer。

### tiktoken(OpenAI、可估算 GPT 系)

```python
import tiktoken

# 加载 GPT-4o 的 tokenizer
enc = tiktoken.get_encoding("o200k_base")

text = "你好,世界!Hello, world!"
tokens = enc.encode(text)
print(tokens)
# [171831, 11, 19023, 6, 9906, 11, 1879, 0]

# 反编码看每个 token
for t in tokens:
    print(t, repr(enc.decode([t])))
# 171831 '你好'
# 11 ','
# 19023 '世界'
# 6 '!'
# 9906 ' Hello'
# 11 ','
# 1879 ' world'
# 0 '!'

print(f"token count: {len(tokens)}")
```

注意 ` Hello`(带前导空格)是一个 token,GPT 系 BPE 把空格作为词首标记。

### transformers(几乎所有开源模型)

```python
from transformers import AutoTokenizer

# Llama 3 (SentencePiece + BPE)
tok = AutoTokenizer.from_pretrained("meta-llama/Meta-Llama-3-8B")

text = "你好,世界!Hello, world!"
ids = tok.encode(text)
print(ids)
print([tok.decode([i]) for i in ids])
# 看到 ▁ 标记空格
```

### 估算 API 成本

```python
import tiktoken

PRICING = {
    "gpt-5":           {"in": 1.25, "out": 10.0},   # 假设价(USD per 1M tokens)
    "gpt-5-mini":      {"in": 0.25, "out": 2.0},
    "claude-4.7-sonnet": {"in": 3.0, "out": 15.0},
    "claude-4.7-haiku":  {"in": 0.8, "out": 4.0},
}

def estimate(text_in, text_out, model="gpt-5"):
    enc = tiktoken.get_encoding("o200k_base")
    n_in = len(enc.encode(text_in))
    n_out = len(enc.encode(text_out))
    p = PRICING[model]
    cost = n_in / 1e6 * p["in"] + n_out / 1e6 * p["out"]
    return n_in, n_out, cost

n_in, n_out, cost = estimate("写一篇关于 LLM 的 1000 字短文", "..." * 500, "gpt-5")
print(f"in={n_in}, out={n_out}, cost=${cost:.4f}")
```

> **生产实务**:Anthropic、OpenAI 都有官方 token 计数接口/库;Claude 用 `anthropic.Anthropic().messages.count_tokens(...)`,OpenAI 用 tiktoken。**对应的模型用对应的 tokenizer**,跨家估算只是粗估。

---

## 七、token 数和成本

主流 API 几乎都按 **input/output token 分别计价**,且**output 比 input 贵 4-8 倍**(因为 output 要 decode,显存带宽 bound,贵)。

| 模型(2026 假设价,USD / 1M tokens) | input | output | cached input |
| --- | --- | --- | --- |
| GPT-5 | 1.25 | 10.0 | 0.125 |
| GPT-5 mini | 0.25 | 2.0 | 0.025 |
| Claude 4.7 Sonnet | 3.0 | 15.0 | 0.30(写) / 0.30(读) |
| Claude 4.7 Haiku | 0.8 | 4.0 | 0.08 |
| Gemini 3 Pro | 1.25 | 10.0 | 0.31 |

> 价格随时变,**自己核对官方页面**。这里要记住的是**结构**,不是具体数字。

### 算 cost 的关键公式

```
cost = N_input × p_in + N_output × p_out + N_cached × p_cached
```

实际项目里的踩坑:

1. **以为字数就是 token 数**:中文 1 字 ≈ 1 token,英文 1 词 ≈ 1.3 token,代码会高一些(变量名、运算符多)
2. **忘了 system prompt 也算**:每次请求都带,长 system prompt 极烧钱
3. **没用 prompt caching**:固定 prompt(system、few-shot example、文档上下文)缓存后,**input 成本能降到 1/10**
4. **Stream 输出依然按 token 计费**:不会因为流式而便宜
5. **思考 token 也算钱**:o1/o3/Claude extended thinking 的内部思考 token,**计费上是 output 的一部分**,容易超预期

---

## 八、踩坑

Tokenizer 是 LLM 应用层最阴险的坑源。这些坑我都踩过:

1. **emoji 暴增 token**:一个看起来普通的 😊 在某些 tokenizer 里要 4-6 token(因为是多字节 UTF-8)。**用户头像里的 emoji、聊天记录里的颜文字,都会让 context 悄悄爆炸**

2. **特殊字符 / 不可见字符**:零宽空格(U+200B)、BOM、各种 Unicode 控制字符,会被 tokenize 成奇怪 token,且模型可能完全不认识。**做 RAG 的文档预处理时务必清洗**

3. **BOS/EOS 不能漏**:BOS(beginning of sentence)、EOS(end of sentence)是模型识别"开始/结束"的关键。直接用 raw tokenize 不加 chat template,**模型可能行为完全不对**。一定用 `tokenizer.apply_chat_template(...)`

4. **chat template 各家不同**:Llama 3 用 `<|begin_of_text|>...<|end_of_text|>`,Qwen 用 `<|im_start|>...<|im_end|>`,Claude 用 `\n\nHuman:`/`\n\nAssistant:`(legacy)或 messages API。**直接拼字符串往往出错,用官方 chat template**

5. **token 边界切 JSON 出毛病**:如果你让模型输出 JSON,某些 tokenizer 会把 `{"key":"value"}` 切成怪边界的 token,导致 streaming 时**前几 chunk 是 `{"k`、`ey":"`、`val`** 这种,前端 JSON 增量解析特别难做。建议用 structured output / JSON mode

6. **空格 token 的陷阱**:GPT-2 系把前导空格作为 token 的一部分。**手动拼字符串时,把 ` apple` 错成 `apple` 会用完全不同的 token**,模型可能给不同结果

7. **tokenizer 不能后期换**:一个模型是按某个词表训出来的,**换 tokenizer = 重新训模型**。这是为什么大家用 HF 时一定要 `from_pretrained` 加载和模型配套的 tokenizer

8. **中文乱码**:UTF-8 切到一半字节会显示成乱码。**tokenize 单字节流没问题,但 streaming decode 单 token 时可能切到字节中间**——所以流式输出要用增量 decode(`StreamingDecoder` 或自己 buffer)

9. **数字切分糟糕**:`12345` 在某些 tokenizer 是 `1`、`23`、`45` 这种乱切,导致模型算术差。**计算任务一定让模型调工具,别让它"直接算"**

10. **token 计数 != 字符数 != 字节数**:做 context 管理时**必须按 token 数算**。OpenAI 给了 8k 上限就是 8k token,你按 8k 字符切会爆 / 或者浪费

11. **API 价格变化要盯紧**:模型升级、新版发布,价格可能调整。**生产项目应该把"模型 + 价格"配置化,不要硬编码**

---

下一篇:`16-推理与采样-temperature-top-p-top-k.md`,看模型给出 logits 后,**怎么从概率分布里"挑"下一个 token**——temperature、top-p、top-k 这些"创造力旋钮"到底在调什么,以及 beam search、speculative decoding 等高级采样策略。
