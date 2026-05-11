# LoRA 与高效微调:没有 8 张 A100 也能微调

如果你试过完整微调一个 7B 模型,会发现显存噌一下涨到 80GB。这一篇讲的是怎么**只动 0.1%~1% 的参数,达到 95% 的全参微调效果**——LoRA 系列的故事。

> 一句话先记住:**全参微调是把整个模型换一脑子,LoRA 是给模型"加一个补丁"。微调的本质是"调整方向",而方向不需要全维度才能描述。**

---

## 一、全参微调的成本(7B 模型也要几十 GB 显存)

训练一个模型要存什么:

```
显存占用 = 模型权重 + 梯度 + 优化器状态 + 激活值 + 临时 buffer
```

以 LLaMA-7B(70 亿参数)、Adam、FP16 训练为例:

| 项 | 大小 | 说明 |
| --- | --- | --- |
| 模型权重 | 14 GB | 7B × 2 bytes (FP16) |
| 梯度 | 14 GB | 同模型大小 |
| Adam m | 28 GB | FP32 一阶动量 |
| Adam v | 28 GB | FP32 二阶动量 |
| 激活值 | 10~30 GB | 取决于 batch size 和 seq len |
| **合计** | **~90+ GB** | 至少 1 张 A100-80G,实际通常 2 张 |

**70B 模型?直接 9 张 A100。** 个人玩家直接出局。

更糟的是:每多一个任务就得复制一份完整模型权重。10 个下游任务 = 10 个 7B 模型 = 140 GB 仅模型本身。

| 微调方式 | 7B 显存 | 70B 显存 | 一份适配产物大小 |
| --- | --- | --- | --- |
| 全参微调 | ~90 GB | ~900 GB | 14 GB |
| LoRA | ~20 GB | ~160 GB | ~50 MB |
| QLoRA | ~10 GB | ~48 GB | ~50 MB |

> LoRA 不是"穷人版微调",**它是为"多任务部署"量身定做的方案**。一份 base + 几十个小补丁,比一堆完整模型经济得多。

---

## 二、LoRA 原理:ΔW = BA,低秩矩阵分解

LoRA 论文(2021)的核心观察:**微调时模型权重的更新 ΔW 是低秩的**,也就是说更新方向被限制在一个低维子空间里。

### 数学表达

原始 forward:

```
h = W x        # W ∈ ℝ^(d × d)
```

全参微调要更新 W,变成:

```
h = (W + ΔW) x
```

LoRA 把 ΔW 强制写成两个小矩阵的乘积:

```
ΔW = B A       # B ∈ ℝ^(d × r), A ∈ ℝ^(r × d), r << d
```

forward 变成:

```
h = W x + B A x
```

### 图示

```
   原 W                ΔW = B A
┌─────────┐         ┌──┐ ┌──────────┐
│         │         │  │ │          │
│  d × d  │   +     │d │ │  r × d   │
│         │         │ ×│ │          │
│         │         │ r│ └──────────┘
└─────────┘         └──┘
原参数数 d×d         新参数数 d×r + r×d = 2dr

d = 4096, r = 8 时:
原始 16,777,216 参数
新增 65,536 参数      减少 99.6%
```

### 训练时

```
冻结 W(不参与求梯度)
只训 A 和 B
```

A 用高斯随机初始化,B 用 0 初始化,**这样训练开始时 ΔW = BA = 0,模型行为完全和 base 一致**,不会破坏预训练知识。

### 推理时两种模式

```
模式一(动态):     h = W x + B A x        # 灵活,可以热切换不同 LoRA
模式二(合并):     W' = W + B A,然后 h = W' x   # 推理零开销,但失去切换能力
```

### 为什么有效

直觉:预训练已经把"语言能力"和"世界知识"装进 W 里,你做下游任务(比如"用中文回答")只是**在原有能力上做一个低维度的方向调整**,不需要重新学习语言本身。

> 这就解释了为什么 r=8 甚至 r=4 就能 work:你不是在塑造一个新模型,是在给老模型"贴一个标签"。

### r 的选取

| r | 参数量 | 适用 |
| --- | --- | --- |
| 4~8 | 极少 | 风格调整、简单分类 |
| 16~32 | 少 | 大多数场景的甜点 |
| 64~128 | 中 | 复杂任务、领域适应 |
| 256+ | 多 | 接近全参,但通常没必要 |

> r 不是越大越好。太大会过拟合训练集,且失去 LoRA 的"轻量"优势。**先从 r=16 开始**。

---

## 三、QLoRA:4-bit 量化 base + LoRA(让消费级 GPU 微调 70B)

QLoRA(2023)进一步把显存压到极致:**把冻住的 base model 量化到 4-bit,LoRA 部分保持高精度**。

```
传统 LoRA:
  W (FP16) + LoRA 适配器 (FP16)
  显存:全模型 FP16

QLoRA:
  W (NF4 4-bit,反量化时变 BF16) + LoRA 适配器 (BF16)
  显存:全模型 ~25% 大小
```

### 三个关键技术

**1. NF4(NormalFloat 4-bit)量化**

普通 4-bit 量化用 16 个均匀间隔的值,但神经网络权重大致服从正态分布。NF4 的 16 个量化值是按正态分布的分位点选的,**信息损失更小**。

**2. Double Quantization**

量化常数本身也量化一次,再省一点显存。

**3. Paged Optimizer**

显存爆的时候,把优化器状态丢去 CPU 内存,需要时再调回来。NVIDIA Unified Memory 的活用。

### 显存效果

| 模型 | 全参 FP16 | LoRA | QLoRA |
| --- | --- | --- | --- |
| 7B | ~90 GB | ~20 GB | ~6 GB |
| 13B | ~160 GB | ~35 GB | ~10 GB |
| 70B | ~900 GB | ~160 GB | ~48 GB |

**QLoRA 让 70B 模型在单张 A100-80G 上就能微调**,这是革命性的。消费级 RTX 4090(24GB)可以微调 13B,RTX 3060(12GB)可以微调 7B。

> 代价:训练速度比纯 LoRA 慢 30%~50%(因为反量化有开销),效果损失约 1~2%。**对绝大多数应用,这点损失换显存非常划算**。

---

## 四、PEFT 库总览

HuggingFace `peft`(Parameter-Efficient Fine-Tuning)是目前事实标准。统一了多种高效微调方法:

| 方法 | 思路 | 何时用 |
| --- | --- | --- |
| **LoRA** | ΔW = BA 低秩 | **首选**,通用 |
| **QLoRA** | LoRA + 4-bit base | 显存吃紧 |
| **AdaLoRA** | 自适应分配秩 | 想精细优化 |
| **Prompt Tuning** | 学一个 soft prompt | 极轻量,任务简单 |
| **Prefix Tuning** | 每层加 prefix kv | 比 prompt tuning 强,但更重 |
| **IA³** | 缩放激活值 | 比 LoRA 还小,但能力受限 |
| **DoRA** | LoRA 的改进,分解 magnitude | 效果略好,2024 后期出现 |

基本用法:

```python
from peft import LoraConfig, get_peft_model
from transformers import AutoModelForCausalLM

base = AutoModelForCausalLM.from_pretrained("meta-llama/Llama-3-8B")

config = LoraConfig(
    r=16,
    lora_alpha=32,
    target_modules=["q_proj", "v_proj"],   # 通常只在注意力层加
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM",
)

model = get_peft_model(base, config)
model.print_trainable_parameters()
# trainable params: 4,194,304 || all params: 8,034,254,848 || trainable%: 0.052
```

> 注意 `lora_alpha`:这是缩放系数,实际 ΔW = (alpha/r) × BA。**alpha=2*r 是常见配置**,意味着 LoRA 输出被翻倍后加回去。

---

## 五、Prompt Tuning、Prefix Tuning(简提对比)

LoRA 之前还有一系列"只调输入"的方案:

### Prompt Tuning

在输入前面加一段**可学习的 embedding**(soft prompt),只训这段 embedding,模型本身完全冻结。

```
输入:[v1, v2, ..., vk, "你的真实输入"]
       └── 这 k 个 embedding 是参数 ──┘
```

优点:参数量超小(k×d 个,k 通常 20)。
缺点:**只在大模型上有效**,小模型(<10B)效果差。

### Prefix Tuning

类似,但 prefix 不是加在 embedding 层,而是**加在每个 Transformer 层的 KV cache 前面**。

```
每层 attention 的 K 和 V 都被 prepend 一段可学习向量
```

优点:比 Prompt Tuning 强,小模型也能用。
缺点:实现稍复杂,需要改 attention 计算。

四种方法对比:

| 方法 | 参数量 | 适合大小 | 效果 | 工程难度 |
| --- | --- | --- | --- | --- |
| Prompt Tuning | 极小 | >10B | 一般 | 简单 |
| Prefix Tuning | 小 | 任意 | 中 | 中 |
| LoRA | 中 | 任意 | **好** | 简单 |
| QLoRA | 中 | 任意 | 好(≈LoRA) | 中 |

> 工业界 95% 的微调都是 LoRA / QLoRA。**Prompt / Prefix Tuning 主要是研究意义,工程上用得少**。

---

## 六、实操:用 transformers + peft 微调一个小模型(代码骨架)

下面是一个完整骨架,用 QLoRA 微调一个 1B 小模型做指令回答。

```python
import torch
from datasets import load_dataset
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    TrainingArguments,
)
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from trl import SFTTrainer

# ─────────────────────────────────
# 1. 加载 base model(4-bit 量化)
# ─────────────────────────────────
model_name = "Qwen/Qwen2.5-1.5B"

bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.bfloat16,
    bnb_4bit_use_double_quant=True,
)

tokenizer = AutoTokenizer.from_pretrained(model_name)
tokenizer.pad_token = tokenizer.eos_token

model = AutoModelForCausalLM.from_pretrained(
    model_name,
    quantization_config=bnb_config,
    device_map="auto",
)
model = prepare_model_for_kbit_training(model)

# ─────────────────────────────────
# 2. 加 LoRA 适配器
# ─────────────────────────────────
lora_config = LoraConfig(
    r=16,
    lora_alpha=32,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM",
)
model = get_peft_model(model, lora_config)
model.print_trainable_parameters()

# ─────────────────────────────────
# 3. 准备数据
# ─────────────────────────────────
dataset = load_dataset("yahma/alpaca-cleaned", split="train[:5000]")

def format_example(ex):
    if ex.get("input"):
        prompt = (
            f"### Instruction:\n{ex['instruction']}\n\n"
            f"### Input:\n{ex['input']}\n\n"
            f"### Response:\n{ex['output']}"
        )
    else:
        prompt = (
            f"### Instruction:\n{ex['instruction']}\n\n"
            f"### Response:\n{ex['output']}"
        )
    return {"text": prompt}

dataset = dataset.map(format_example)

# ─────────────────────────────────
# 4. 训练
# ─────────────────────────────────
training_args = TrainingArguments(
    output_dir="./qwen-lora-out",
    per_device_train_batch_size=4,
    gradient_accumulation_steps=4,        # 等效 batch=16
    num_train_epochs=3,
    learning_rate=2e-4,                   # LoRA 通常比全参大 10x
    logging_steps=10,
    save_strategy="epoch",
    bf16=True,
    optim="paged_adamw_8bit",             # QLoRA 推荐
    warmup_ratio=0.03,
    lr_scheduler_type="cosine",
)

trainer = SFTTrainer(
    model=model,
    train_dataset=dataset,
    args=training_args,
    tokenizer=tokenizer,
    dataset_text_field="text",
    max_seq_length=1024,
)

trainer.train()

# ─────────────────────────────────
# 5. 保存(只存 LoRA 权重,几十 MB)
# ─────────────────────────────────
model.save_pretrained("./qwen-lora-final")

# ─────────────────────────────────
# 6. 推理时加载
# ─────────────────────────────────
from peft import PeftModel

base = AutoModelForCausalLM.from_pretrained(model_name, quantization_config=bnb_config)
inference_model = PeftModel.from_pretrained(base, "./qwen-lora-final")

prompt = "### Instruction:\n用一句话解释什么是 LoRA。\n\n### Response:\n"
inputs = tokenizer(prompt, return_tensors="pt").to("cuda")
out = inference_model.generate(**inputs, max_new_tokens=128, temperature=0.7)
print(tokenizer.decode(out[0], skip_special_tokens=True))
```

几个关键点:

- `target_modules`:LoRA 加在哪几层。通常加在 attention 的 Q/K/V/O,效果好。也有人加 MLP 的 gate/up/down。
- `learning_rate=2e-4`:LoRA 学习率比全参微调大 10x 是常态(因为参数少,需要"动得明显")。
- `paged_adamw_8bit`:QLoRA 标配,显存友好。
- 推理时一定要先加载 base model,再 attach LoRA 权重。

---

## 七、什么时候微调,什么时候用 RAG/Prompt(决策树)

这是工程师最常纠结的问题。一个简单的决策树:

```
你想让模型做新任务?
   │
   ├── 任务靠"知识"(回答某领域问题、用某本手册)
   │       │
   │       ├── 知识量大、经常变 → RAG
   │       └── 知识量小、稳定 → Prompt + few-shot
   │
   ├── 任务靠"格式"(输出 JSON、特定标签、特定语气)
   │       │
   │       ├── 简单格式 → Prompt + 例子
   │       └── 复杂稳定格式、量大 → 微调(LoRA)
   │
   ├── 任务靠"风格/口吻"(模仿某人写作、客服话术)
   │       │
   │       └── 微调(SFT 或 DPO),Prompt 难以稳定复现风格
   │
   └── 任务靠"推理能力"
           │
           └── 换更大的模型,微调小模型不会让它"变聪明"
```

详细对比:

| 维度 | Prompt | RAG | LoRA 微调 |
| --- | --- | --- | --- |
| 上手难度 | ⭐ | ⭐⭐ | ⭐⭐⭐⭐ |
| 数据要求 | 几个例子 | 文档库 | 几百到几千条 |
| 知识更新 | 改 prompt | 改文档 | 重训 |
| 推理成本 | 低 | 中(多查一次) | 低 |
| 风格一致性 | 弱 | 弱 | 强 |
| 调试难度 | 低 | 中 | 高 |
| **首选** | **大多数场景** | **领域知识问答** | **风格/格式定制** |

> 一个常被忽略的点:**微调不会给模型"加新知识",微调改的是"行为模式"**。你训一个模型回答"我们公司的退货政策",它学到的是"该按某种风格回答关于退货的问题",但具体政策变了它不会跟着变。**新知识用 RAG,新风格用微调,这是大方向**。

---

## 八、踩坑(数据质量 > 数据量、过拟合、loss 曲线诊断)

### 8.1 数据质量是第一位

```
1000 条精选高质量 > 10000 条普通数据 > 100000 条爬虫垃圾
```

清洗清单:

- 去重(完全相同 + 接近相同)
- 去掉超长/超短样本(>2k token、<10 token 通常都是噪声)
- 检查格式一致性(标点、换行、对话角色标记)
- **抽样 50 条人工读一遍**(必做,你会发现各种问题)
- 检查标签分布(分类任务别让某个标签占 90%)

### 8.2 过拟合的信号

LoRA 看似参数少不容易过拟合,但**数据少时照样能过**。

```
train loss ↓↓↓
eval loss  先 ↓ 后 ↑     ← 经典过拟合,eval 转折点是早停时机
```

应对:

- 加 lora_dropout(0.05~0.1)
- 减小 r(从 32 减到 16 甚至 8)
- 减少 epoch(经验:LoRA 通常 1~3 epoch 足够)
- 增加数据多样性(优先于增加数据量)

### 8.3 loss 曲线诊断

| 现象 | 原因 | 应对 |
| --- | --- | --- |
| loss 不降 | lr 太小、target_modules 不对、数据格式错 | lr ×10、检查代码 |
| loss 一开始就很低 | 数据泄露(eval 在 train 里) | 检查数据 split |
| loss 跳变到 NaN | lr 太大、fp16 溢出 | lr ÷5、改 bf16 |
| loss 抖动剧烈 | batch 太小、lr 太大 | grad accumulation、降 lr |
| train ↓ eval 一直平 | 模型已经会了,数据没新东西 | 加难样本或停训 |

### 8.4 评估比训练难

很多人训完看 train loss 觉得效果好,**真正的评估必须有独立 eval set**。

```python
# 最朴素也最有效的 eval:写 20 个测试 prompt,微调前后各跑一遍,人工对比
test_prompts = [...]   # 涵盖各种场景

before = generate(base_model, test_prompts)
after = generate(finetuned_model, test_prompts)

# 找个同事盲测打分
```

更结构化的方法:用更强的模型(GPT-5 / Claude Opus)当裁判,给微调前后输出打分。

```python
import anthropic
judge = anthropic.Anthropic()

def llm_judge(prompt, response_a, response_b):
    msg = judge.messages.create(
        model="claude-opus-4-5",
        max_tokens=512,
        messages=[{
            "role": "user",
            "content": f"""请判断 A 和 B 哪个回答更好,只输出 "A" 或 "B" 或 "tie"。

问题:{prompt}

A:{response_a}

B:{response_b}"""
        }]
    )
    return msg.content[0].text.strip()
```

### 8.5 常见错误清单

1. **target_modules 写错**:不同模型层的命名不同,Llama 是 `q_proj` `v_proj`,Qwen 是 `q_proj` `k_proj` `v_proj` `o_proj`,Bloom 是 `query_key_value`。**先 print 模型结构看看**。
2. **tokenizer pad_token 没设**:很多 LLM 没默认 pad_token,要 `tokenizer.pad_token = tokenizer.eos_token`。
3. **训练时不加 eos**:模型不知道何时停下,推理时会一直生成。
4. **学习率照搬全参**:全参用 1e-5 ~ 5e-5,LoRA 要 1e-4 ~ 5e-4。
5. **保存的 LoRA 没法加载**:base model 的版本/路径必须和训练时完全一致。
6. **量化模型直接训**:必须 `prepare_model_for_kbit_training` 包一层,否则梯度算不对。

---

## 给新手的建议

1. **先跑通,再优化**。用一个 1B 小模型 + 几百条数据先把 pipeline 跑通,看到 loss 在降、推理有变化,再上大模型大数据。
2. **优先 QLoRA**。除非你有充裕显存,默认上 QLoRA。性价比最高的方案。
3. **数据从小开始**。先 200 条精选 + 1 epoch 看效果,再决定加不加数据。**别一上来就训 10 万条 5 个 epoch 烧两天**。
4. **保存检查点**。每个 epoch 都保存,事后能比较哪一版最好。最后一版往往不是最好的。
5. **不要追新潮微调方法**。AdaLoRA、DoRA、SimPO 之类有它们的论文价值,但工程上 LoRA + QLoRA 已经够 99% 场景。
6. **微调不是万能**。模型蠢就是蠢,微调让它在特定任务上"看起来不蠢",**但本质能力提升有限**。重要场景换大模型,不要硬凹。
7. **保留 base model 路径**。LoRA 文件几十 MB,但没了 base model 它就是废铁。**一定记好你训的是哪个版本的哪个模型**。
8. **想清楚是 SFT 还是 DPO**。有"标准答案"用 SFT,只有"哪个更好的偏好"用 DPO。两者训练目标不一样,数据格式也不一样,别搞混。

---

下一篇:`19-ScalingLaw与涌现能力.md`,讲为什么"大力出奇迹"在 LLM 上真的成立。
