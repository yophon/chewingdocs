# 微调实战:QLoRA + Unsloth 完整流程

18 篇讲过 LoRA / QLoRA 的原理:**冻结大模型,只训一个低秩补丁,4-bit 量化降显存**。这一篇不讲数学,只做一件事——**带你把一个 7B / 8B 模型从下载到能在你自己显卡上跑出可用 LoRA,全流程跑通**。Unsloth 是当下"消费级显卡微调"最顺手的库,速度比裸 Hugging Face 快 2 倍、显存少 60%。

> 一句话先记住:**微调真正的难点从来不是代码,是数据**。1000 条精心标注的样本 > 10 万条糙数据。这一篇代码不到 100 行,但前置的数据工作通常占你 70% 时间。

---

## 一、什么时候你才该自己微调

先泼冷水。下面这些场景**不要微调**:

| 场景 | 应该用 |
| --- | --- |
| 提示模型"用更友好语气" | Prompt + system message |
| 让模型懂你公司产品 | RAG(22 篇) |
| 让模型按 JSON schema 输出 | Structured output / Tool use |
| 改改示例就能解决 | Few-shot |
| 数据每周变一次 | RAG(微调跟不上更新) |

**真正适合微调的场景**:

1. **风格 / 语气固化**:法律语气、医疗严谨、特定 IP 角色——few-shot 太啰嗦
2. **特定任务格式**:把自由对话压成你专属 schema、工具调用格式
3. **领域语言**:模型对生物 / 半导体 / 金融术语理解不到位
4. **降低延迟和成本**:把 GPT-4 能做的任务蒸馏到 7B,推理便宜 50 倍
5. **隐私 / 离线**:数据不能出公司,只能 self-host

---

## 二、显存预算与硬件门槛(2026 年现实)

| 模型 | 全参微调 | LoRA(FP16) | QLoRA(4-bit) | Unsloth(4-bit) |
| --- | --- | --- | --- | --- |
| 7B / 8B | 90 GB | 20 GB | 10 GB | **6-8 GB** |
| 13B | 160 GB | 35 GB | 16 GB | **12 GB** |
| 32B | ~400 GB | 90 GB | 36 GB | **24 GB** |
| 70B | ~900 GB | 160 GB | 48 GB | **40-48 GB** |

**消费卡能跑哪些**:

- RTX 3060 12GB:7B QLoRA(短序列)
- RTX 4090 24GB:7B 任意 / 13B QLoRA / 32B 极限挤进去
- RTX 5090 32GB(2026):32B 舒服、70B 极限
- A100 80GB / H100 80GB:70B 商用

> Unsloth 的省显存源于:**手写 Triton kernel + 直接计算 LoRA 梯度,不走 Hugging Face 的全权重路径**。代价是只支持它适配过的模型(Llama / Qwen / Mistral / Gemma / Phi 系列基本全有)。

---

## 三、数据准备:这才是 70% 的工作

### 3.1 格式约定

现代微调数据基本都是**对话格式**(chat template):

```json
{
  "conversations": [
    {"role": "system", "content": "你是一个客服助手,语气友好..."},
    {"role": "user", "content": "我想退款"},
    {"role": "assistant", "content": "好的,请提供订单号..."}
  ]
}
```

每条样本是一段完整对话(可单轮、可多轮)。**模型只学 assistant 的部分**——loss mask 自动屏蔽掉 user / system。

### 3.2 数据量经验值

| 任务难度 | 经验数据量 |
| --- | --- |
| 风格调整(语气/格式) | 200-1000 条 |
| 任务格式(JSON / 工具调用) | 500-2000 条 |
| 领域语言(医疗/法律) | 5000-50000 条 |
| 复杂能力(数学推理) | 50000+ |

### 3.3 数据质量四原则

1. **覆盖度**:cover 用户实际会问的所有变体,而不是只放"理想 query"
2. **难度分布**:50% 简单 + 30% 中等 + 20% 边缘 case
3. **拒答样本**:必须留 5-10% 是"模型应该说不知道"的——否则微调出爱编造的模型
4. **去重**:embedding 去重,完全相同的 prompt 留一条就够,重复会让模型死记硬背

### 3.4 用强模型生成数据(distillation)

最常见做法:用 GPT-4 / Claude / DeepSeek 给你生成几千条高质量数据,人工审核 10%。

```python
# 生成数据的 prompt 框架(简化)
SYSTEM = """你是数据生成助手。任务:为客服微调生成多样化样本。
输出 JSON,字段:user_query, ideal_answer, difficulty(1-5), category。
要求:
1. 覆盖退款、物流、产品咨询、投诉、闲聊
2. 30% 包含错别字 / 口语化
3. 10% 是"客服应明确拒答"的违规要求
"""
```

---

## 四、动手:Unsloth + QLoRA 完整脚本

### 4.1 安装

```bash
# 推荐 Linux + CUDA 12.x;Windows 用 WSL2
pip install "unsloth[cu121-torch240] @ git+https://github.com/unslothai/unsloth.git"
pip install datasets transformers trl bitsandbytes accelerate
```

### 4.2 加载 4-bit 模型

```python
from unsloth import FastLanguageModel

max_seq_length = 2048
model, tokenizer = FastLanguageModel.from_pretrained(
    model_name="unsloth/Meta-Llama-3.1-8B-Instruct-bnb-4bit",
    max_seq_length=max_seq_length,
    dtype=None,            # None 自动选 bf16/fp16
    load_in_4bit=True,
)
```

Unsloth 在 HF 上有一堆预量化好的 `*-bnb-4bit` 包,下载比自量化快很多。

### 4.3 包上 LoRA adapter

```python
model = FastLanguageModel.get_peft_model(
    model,
    r=16,                     # LoRA rank,8/16/32 常见;越大越能"装"知识但易过拟
    lora_alpha=16,            # 缩放,通常 = r 或 2r
    lora_dropout=0,           # Unsloth 优化路径要求 0
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                    "gate_proj", "up_proj", "down_proj"],
    bias="none",
    use_gradient_checkpointing="unsloth",
    random_state=42,
)
```

### 4.4 准备数据并套 chat template

```python
from datasets import load_dataset

ds = load_dataset("json", data_files="my_data.jsonl", split="train")

def format_chat(example):
    # 用模型自带的 chat template,确保和推理时一致
    text = tokenizer.apply_chat_template(
        example["conversations"],
        tokenize=False,
        add_generation_prompt=False,
    )
    return {"text": text}

ds = ds.map(format_chat)
```

> **chat template 必须和推理时一致**——Llama-3、Qwen、Gemma 各家不同,搞错了模型推理会乱。Unsloth 默认走 `tokenizer` 自带 template,直接对齐。

### 4.5 训练

```python
from trl import SFTTrainer, SFTConfig

trainer = SFTTrainer(
    model=model,
    tokenizer=tokenizer,
    train_dataset=ds,
    dataset_text_field="text",
    max_seq_length=max_seq_length,
    packing=False,                # 短样本可开 packing 提速
    args=SFTConfig(
        per_device_train_batch_size=2,
        gradient_accumulation_steps=4,   # 等效 batch=8
        warmup_steps=10,
        num_train_epochs=3,              # 小数据集 2-4 epoch 常见
        learning_rate=2e-4,
        fp16=False, bf16=True,           # 30 系及以上用 bf16
        logging_steps=5,
        optim="adamw_8bit",              # 8bit 优化器再省一半
        weight_decay=0.01,
        lr_scheduler_type="cosine",
        seed=42,
        output_dir="outputs",
    ),
)

trainer.train()
```

### 4.6 保存 / 推理 / 合并

```python
# 1. 只存 LoRA 权重(几十 MB)
model.save_pretrained("lora_adapter")
tokenizer.save_pretrained("lora_adapter")

# 2. 直接推理(LoRA + base 同进程)
FastLanguageModel.for_inference(model)
inputs = tokenizer.apply_chat_template(
    [{"role": "user", "content": "我要退款,订单号 12345"}],
    return_tensors="pt", add_generation_prompt=True,
).to("cuda")
out = model.generate(input_ids=inputs, max_new_tokens=256, temperature=0.3)
print(tokenizer.decode(out[0], skip_special_tokens=True))

# 3. 合并到 base 权重(便于部署)
model.save_pretrained_merged("merged_16bit", tokenizer, save_method="merged_16bit")

# 4. 直接出 GGUF(给 llama.cpp / Ollama)
model.save_pretrained_gguf("merged_gguf", tokenizer, quantization_method="q4_k_m")
```

**最后一步是 Unsloth 最香的功能**:LoRA → GGUF 一行调出来,扔进 Ollama 就能本机跑。

---

## 五、超参怎么调

| 参数 | 经验值 | 说明 |
| --- | --- | --- |
| `r`(LoRA rank) | 16 是默认起点 | 数据多 / 任务复杂调到 32-64,简单风格调到 8 |
| `lora_alpha` | = r 或 2r | 实际"学习强度" = alpha/r |
| `learning_rate` | 1e-4 ~ 3e-4 | 比全参 LR 大 10 倍是常态 |
| `epoch` | 2-4 | 5+ 容易死记 |
| `batch size`(等效) | 8-32 | 用 grad accumulation 凑 |
| `target_modules` | 7 个全开 | Unsloth 默认建议;只开 q/v 也可省显存 |
| `max_seq_length` | 看数据 | 99% 数据落在 X 以下,就把它截到 X |

### 关键判断:loss 该长什么样

```
合理曲线:
  loss 从 ~2.5 平滑降到 0.5-1.5,后半段缓慢
        
异常 1(过拟合):
  loss 砸到 0.05 以下 → 模型在背训练集,推理会复读
  → 减 epoch / 减 r / 加数据
  
异常 2(没在学):
  loss 一直在 2 以上不动 → LR 太小 / chat template 错 / 数据格式不对
```

**永远留 5-10% 当 eval 集**,光看 train loss 一定翻车。

---

## 六、评估:不要"看着像就完事"

### 6.1 自动 eval

把测试集每条样本喂进微调模型,和 ground truth 比:

```python
def eval_one(model, tokenizer, sample):
    prompt = tokenizer.apply_chat_template(sample["conversations"][:-1],
                                           tokenize=False, add_generation_prompt=True)
    out = generate(model, tokenizer, prompt)
    expected = sample["conversations"][-1]["content"]
    return judge(out, expected)  # 字符串比对 / embedding 相似度 / LLM-as-judge
```

### 6.2 LLM-as-judge

复杂任务用 GPT-4 / Claude 给两份回答打分(微调前 vs 微调后)。32 篇 evaluation 详细讲过。

### 6.3 不能只看你训练数据的分布

必备的 OOD eval:

- **通用能力回归**:别的任务别变笨。挑 100 条通用 prompt,看微调后是否退化
- **拒答能力**:模型还会拒绝越权要求吗?LoRA 微调最容易把安全护栏削弱
- **越界 prompt**:你训过的格式有变体输入还能 hold 住吗?

---

## 七、踩坑提醒

1. **Chat template 不匹配是 #1 故障源**。训练时用 A 模板、推理时用 B 模板,模型胡言乱语。永远用 `tokenizer.apply_chat_template`。
2. **不要在 instruct 模型上又叠 instruct**。base 模型微调 instruct 行为最干净;在 instruct 模型上再学一套 instruct 容易冲突。
3. **过拟合的"温柔表象"**:模型把训练集里某个 user 的口头禅照搬。eval 集没出现就发现不了——所以 eval 集要刻意构造分布外样本。
4. **数据顺序敏感**。SFT 不像预训练那么海量,样本顺序的"灾难性遗忘"明显。`shuffle=True` 永远开。
5. **bf16 比 fp16 稳**。30 系以下没 bf16 只能用 fp16,要打开 grad scaling,否则前几步直接 NaN。
6. **不要太相信"loss 下降"**。loss 0.3 听着好,但只代表分布拟合度。真用户体验要看 eval 和盲测。
7. **存了 LoRA 不要丢 tokenizer**。tokenizer 要和训练一致,否则 special token id 变了照样乱。
8. **70B 用 QLoRA 仍要 48GB+**。不要被 "QLoRA 7B 8GB" 误导以为 70B 也能消费卡跑。
9. **VPN / 镜像**。HF 国内不稳定,设 `HF_ENDPOINT=https://hf-mirror.com` 或预先下到本地。
10. **训练崩溃重启用 `resume_from_checkpoint`**。3 epoch 跑了一半 OOM,别从头重来。

---

## 八、生产部署衔接

LoRA adapter 部署有两条路:

```
路线 A:每次启动加载 base + adapter
  优点:多个 LoRA 共用一个 base,显存便宜
  框架:vLLM(支持 multi-LoRA)、TGI

路线 B:合并成完整模型
  优点:推理更快,工具兼容性好
  缺点:每个 adapter 都是一份完整模型(几十 GB)
  框架:Ollama / llama.cpp / 任意推理引擎
```

部署优化在 33 篇和 41 篇展开。

---

## 九、一份 1 小时上手清单

```
☐ 选定任务 + 写出 5 条"理想交互"样例
☐ 决定数据来源:人工 / 蒸馏 / 真实日志
☐ 准备 200 条数据,JSONL 格式,80/20 分 train/eval
☐ pip install unsloth + 拉一个 8B 4bit 模型
☐ 跑 1 个 epoch 看 loss 曲线 + eval 一遍
☐ 如有问题:检查 chat template / LR / 数据格式
☐ 加到 3 epoch 重跑
☐ eval + 盲测对比 base 模型
☐ 满意 → 合并 + 量化 + 用 Ollama 本地跑起来
```

> 微调不是"魔法变好"。**它会让模型在你定义的分布里更准,但代价是别处可能变差**。先 RAG / Prompt,真不行再上 LoRA,实在不行再考虑全参——这个顺序基本永远对。

---

下一篇:`41-推理引擎深入-vLLM-SGLang-TensorRTLLM.md`,微调好的模型怎么扛住高并发推理,把工程的最后一环讲完。
