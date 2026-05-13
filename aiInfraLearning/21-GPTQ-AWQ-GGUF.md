# GPTQ / AWQ / GGUF:三套主流权重量化方案

20 篇讲完量化心智,本篇直接进三套主流方案的工程对比:**GPTQ、AWQ、GGUF**——上线一个 LLM 推理服务的量化几乎只在这三套之间选。三套的设计哲学完全不同,适用场景也不重叠。这一篇拉清楚每套是怎么算的、跟谁配、什么时候选哪套。

> 一句话先记住:**GPTQ = Hessian 误差补偿(老牌通用),AWQ = 保护 1% 关键权重(GPU 推理首选),GGUF = llama.cpp 的格式 + k-quants(CPU/Mac/移动端)**。GPU 端 vLLM/SGLang 主推 AWQ,CPU 端 llama.cpp 走 GGUF,选型决策三句话搞定:**GPU 推理 → AWQ;老模型/老引擎 → GPTQ;CPU/Mac → GGUF**。

---

## 一、为什么三套并存

### 1.1 不是谁淘汰谁,是各占场景

```
GPTQ (2022)              AWQ (2023)              GGUF (llama.cpp)
─────────────            ─────────────           ──────────────
最老牌 PTQ               GPU 推理新主流          CPU/Mac/边缘
通用兼容性最好            精度普遍优于 GPTQ        格式 + k-quants 一体
对激活离群有点慢热        激活感知,稳            混合位宽,极致空间

vLLM / SGLang / TRT-LLM  vLLM / SGLang           llama.cpp / Ollama
都支持                   首推 AWQ                 LM Studio / 本地工具
```

### 1.2 选型一句话决策树

```
你部署在哪?
  ├─ NVIDIA GPU 集群 / vLLM / SGLang
  │    ├─ 模型在 AWQ 兼容列表(主流 LLM 都在) → AWQ
  │    └─ 模型旧 / AWQ 不支持                  → GPTQ
  │
  ├─ Mac M-Series / CPU / 边缘 / 单卡消费 GPU
  │    └─ GGUF (llama.cpp / Ollama)
  │
  └─ NVIDIA H100 + 极致吞吐(批 > 32)
       └─ TRT-LLM + SmoothQuant W8A8 / FP8(22 篇)
```

下面三章把三套各自怎么算讲清楚,然后一张大表对比。

---

## 二、GPTQ:用 Hessian 信息做误差补偿

### 2.1 核心思想:逐权重量化,误差下次补

GPTQ 基于 **OBS(Optimal Brain Surgeon)** 思想:把神经网络剪枝/量化看成「在所有权重上分布修改」,每改一个权重(量化它),用二阶 Hessian 信息算出**该层其他权重应该怎么动**才能补偿误差。

伪算法:

```
对每一层 L:
    H     = X^T X            ← 二阶信息(用校准集激活算)
    H_inv = chol(H)^-1       ← 逆 Hessian(Cholesky 分解算稳)

    for j in 0 .. cols(W):
        # 量化第 j 列权重
        W[:, j]_q = quantize(W[:, j], scale_j)

        # 算量化误差
        err = (W[:, j] - W[:, j]_q) / H_inv[j, j]

        # 用误差更新剩余未量化的列(补偿)
        W[:, j+1:] -= err * H_inv[j, j+1:]
```

直觉:**每量化一个权重,产生的误差不是丢掉,而是分摊到后面还没量化的权重上**,让后面的权重稍微调一调,把这次误差吃掉。

### 2.2 一张直觉图

```
未补偿:
  W[0] → 量化误差 ε0  (丢)
  W[1] → 量化误差 ε1  (丢)
  W[2] → 量化误差 ε2  (丢)
  累积误差 = ε0 + ε1 + ε2

GPTQ 补偿:
  W[0]   → 量化,误差 ε0 → 推到 W[1..N] 调整
  W[1]'  → 量化,新误差 ε1' (比 ε1 小) → 推到 W[2..N]
  W[2]'  → 量化,新误差 ε2' → ...
  累积误差 ≈ ε_last(只剩最后一列吃不掉的余数)
```

### 2.3 配置和精度

```
GPTQ 标配:
  bits:          4               ← INT4 主流
  group_size:    128             ← per-group,精度/速度折衷
  desc_act:      True/False      ← 按激活大小排序处理列(精度↑,速度↓)
  damp_percent:  0.01            ← Hessian 加 damping,避免奇异

精度损失:
  Llama-7B  W4G128 GPTQ:  MMLU 掉 0.5-1.5 个点
  Llama-70B W4G128 GPTQ:  MMLU 掉 0.3-1.0 个点
```

### 2.4 缺点

- **对激活离群值不敏感**:GPTQ 看的是权重 + Hessian,激活 outlier 没特别处理
- 某些激活离群严重的模型(早期 OPT、部分 13B-34B 模型)用 GPTQ 精度掉
- AWQ 在这些模型上通常更稳

### 2.5 工具

- **AutoGPTQ**:Python 库,Hugging Face 生态主流
- **GPTQ-for-LLaMa**:更早的实现
- **vLLM / SGLang / TRT-LLM** 都原生支持 GPTQ 模型加载

---

## 三、AWQ:保护 1% 的关键权重

### 3.1 核心观察(2023 MIT/CMU 论文)

LLM 权重量化时损失最大的不是均匀分布的:**对应「大激活 channel」的那 1% 权重**(论文称 **salient weights**)是精度杀手——这些权重碰上大激活,量化误差被放大几十倍。

直觉公式:

```
Y = X · W
误差: ΔY ≈ X · ΔW

如果 X 这一 channel 大(离群),ΔW 即使小,ΔY 也大
→ 这部分 W 必须特殊保护
```

### 3.2 算法:不动权重值,动 scale

AWQ 的实际做法**不是真把这部分权重保留 FP16**(那样 kernel 难写),而是用一个等价变换:

```
原:    Y = X · W
变换:  Y = (X / s) · (s · W)
            ↑          ↑
       缩小激活    放大权重(对应大激活的 channel)

放大后,这部分权重在量化时占据更大的整数范围
→ 量化分辨率更高,误差更小
→ 对应的激活除以 s 后,激活对量化误差也不那么敏感

s 用搜索决定(grid search 在校准集上找最优)
```

### 3.3 一张图

```
AWQ 之前(per-channel 量化,所有 channel 同一 scale 范围):

权重 channel 量化分辨率:
  ┌──────────────────────────────┐
  │ ●●●●●●●●●●●●●●●●●●●●●●●●●●● │  ← 普通 channel,范围小,分辨率够
  │              ●               │  ← salient channel,大值,分辨率被压
  └──────────────────────────────┘

AWQ 之后(对 salient channel 等价缩放):

  普通 channel:s ≈ 1,基本不变
  salient channel: s = 2 ~ 4,放大权重值
                   对应激活 / s,缩小激活
                   量化分辨率 ↑,误差 ↓
```

### 3.4 配置和精度

```
AWQ 标配:
  w_bit:         4               ← INT4 主流
  q_group_size:  128             ← per-group
  zero_point:    True/False      ← 对称还是非对称

精度损失:
  Llama-7B  W4G128 AWQ:  MMLU 掉 0.3-1.0 个点(普遍优于 GPTQ)
  Llama-70B W4G128 AWQ:  MMLU 掉 0.1-0.5 个点
  对激活离群严重的模型,AWQ 优势更明显
  (掉 1-2 个点 vs GPTQ 掉 3-5 个点)
```

### 3.5 工具与 kernel

- **AutoAWQ / llm-awq**:量化和推理一体
- **vLLM / SGLang 原生支持 AWQ kernel**:专门优化的 INT4 GEMM kernel,推理速度通常比 GPTQ 略快
- **TensorRT-LLM** 也集成了 AWQ

### 3.6 AWQ 的工程优势

```
1. 精度稳定          对各种模型(Llama / Qwen / Mistral)都好用
2. 推理 kernel 优化好 INT4 GEMM 在 H100 上跑得快
3. 部署链路成熟      vLLM 直接加载 AWQ checkpoint
4. 跟 KV 量化兼容    可以 W4A16 + KV INT8(详见 23 篇)
```

---

## 四、GGUF:llama.cpp 的格式 + k-quants

### 4.1 GGUF 不是单一算法

GGUF(GPT-Generated Unified Format)是 **llama.cpp** 项目的统一文件格式,继承自更早的 GGML。它包含两件事:

1. **文件格式**:模型权重 + tokenizer + 元数据打包成单文件,跨平台,可 mmap
2. **一组 k-quant 量化方案**:Q2_K、Q3_K、Q4_K_M、Q5_K_M、Q6_K、Q8_0

### 4.2 K-quants 命名约定

```
Q4_K_M
│ │ │
│ │ └── M = Medium(还有 S = Small,L = Large,精度递增)
│ └──── _K = 用 k-quant 算法(更新一代,精度高)
└────── 4 = 4 bits 主体

Q8_0   = 8 bits 经典量化(老一代,简单)
Q4_0   = 4 bits 经典量化(老一代)
Q4_K_M = 4 bits k-quant medium(主流推荐)
Q5_K_M = 5 bits k-quant medium(精度更好)
Q6_K   = 6 bits k-quant(质量与 FP16 接近)
Q2_K   = 2 bits(极端压缩,精度有损但能跑)
```

### 4.3 K-quants 的关键设计

```
混合位宽:
  关键层(attention output projection、FFN down_proj)用更高位宽
  其他层用基础位宽

分块量化:
  每 32 / 64 个权重一个 super-block
  super-block 内分 8 个 sub-block
  super-block 用 FP16 scale,sub-block 用 INT 表示偏移
  → 实际位宽 4.5-4.8 bit(比纯 4-bit 多一点 metadata)
```

精度:**Q4_K_M 在大多数模型上比 GPTQ 精度好,接近 AWQ**。Q5_K_M / Q6_K 几乎无损。

### 4.4 为什么 CPU/Mac 走 GGUF

- llama.cpp **C++ 写**,无 Python / CUDA 依赖
- mmap 加载,启动快,内存占用小
- Apple Silicon Metal 后端、Intel/AMD AVX-512、ARM NEON 全平台优化
- Ollama / LM Studio / koboldcpp 等本地工具都基于 llama.cpp
- M3/M4 Mac 上 7B-13B 模型流畅交互(20-50 tok/s)

### 4.5 GGUF 不适合什么

- **大批量并发推理**(没有 PagedAttention、连续批处理)
- **多 GPU TP**(llama.cpp 的 GPU offload 是单卡为主)
- **服务化部署**(没有调度/限流/监控的成熟生态)

→ **GGUF 是个人 / 边缘 / 离线场景**,不是数据中心场景。

---

## 五、三方对比:精度/速度/显存/工程成本

### 5.1 大表

| 维度 | GPTQ | AWQ | GGUF (Q4_K_M) |
| --- | --- | --- | --- |
| **诞生年** | 2022 | 2023 | 2023(GGML 2022) |
| **核心算法** | OBS + Hessian 误差补偿 | 保护 salient 权重(等价 scale) | 混合位宽 + 分块量化 |
| **典型位宽** | INT4 + group=128 | INT4 + group=128 | 4.5-4.8 bit 实际 |
| **精度损失(7B)** | 0.5-1.5 MMLU | 0.3-1.0 MMLU | 0.3-1.0 MMLU |
| **激活离群处理** | 弱(只看权重) | 强(等价变换搬走) | 中(分块+混合精度) |
| **量化耗时(7B)** | 1-3 小时 | 1-2 小时 | 几分钟(纯转格式) |
| **校准集需求** | 是(128-1024 样本) | 是(几十-几百样本) | 否(无需校准) |
| **GPU 推理速度** | 快 | 略快于 GPTQ | 不适合 GPU 大批 |
| **CPU 推理速度** | 不支持 | 不支持 | 主战场 |
| **支持引擎** | vLLM/SGLang/TRT-LLM/HF | vLLM/SGLang/TRT-LLM | llama.cpp/Ollama/LMStudio |
| **多卡 TP** | 支持 | 支持 | 弱(GPU offload only) |
| **KV 量化兼容** | 支持 | 支持 | 内置 |
| **生态成熟度** | 高 | 高(增长最快) | 高(本地端) |
| **首选场景** | 老模型 / 历史包袱 | GPU 数据中心推理 | Mac / CPU / 边缘 / 个人 |

### 5.2 一句话总结每个方法

- **GPTQ**:第一代,能用,精度可接受,新项目不要选
- **AWQ**:GPU 推理 2024+ 默认,精度稳,生态全
- **GGUF**:llama.cpp 系唯一选项,本地推理王者

---

## 六、SmoothQuant 与 W8A8

### 6.1 W4A16 之外的另一条路

GPTQ / AWQ 都是 **W4A16(只量权重)** 路线,激活留 FP16。但 H100 的 Tensor Core 对 INT8 GEMM 有专门加速,如果**激活也能量到 INT8**,吞吐能再上一档。

问题:激活离群让 per-tensor INT8 量化精度崩。**SmoothQuant**(2022)的解法:把激活的 outlier 用等价变换搬到权重侧。

```
原:    Y = X · W
        X 离群严重,per-tensor INT8 → 崩
        W 平滑,per-channel INT8 → 好

SmoothQuant: Y = (X / s) · (s · W)
              = X' · W'

              X' 平滑了,per-token INT8 量化精度好
              W' 变陡峭一点,但 per-channel 量化精度仍可接受
              → 现在 X' 和 W' 都能量到 INT8 → 走 INT8 GEMM kernel

→ 显存 ↓,吞吐 ↑(吃 H100 INT8 Tensor Core)
```

### 6.2 SmoothQuant vs AWQ:同思想,不同目标

| | SmoothQuant | AWQ |
| --- | --- | --- |
| 等价变换思想 | 同 | 同 |
| 目标 | W8A8(吞吐) | W4A16(显存) |
| 激活量化 | 是 | 否(留 FP16) |
| 主要部署 | TRT-LLM | vLLM / SGLang |

**两条路并存**:吞吐优先(高 batch 服务、Tensor Core 拉满)走 W8A8;显存优先(70B 单卡、长上下文)走 W4A16。

---

## 七、工程落地与代码骨架

### 7.1 AutoAWQ 量化一个 7B 模型

```python
from awq import AutoAWQForCausalLM
from transformers import AutoTokenizer

model_path = "meta-llama/Llama-3.1-8B-Instruct"
quant_path = "llama-3.1-8b-awq"

model = AutoAWQForCausalLM.from_pretrained(model_path, device_map="auto")
tokenizer = AutoTokenizer.from_pretrained(model_path)

quant_config = {
    "zero_point":   True,
    "q_group_size": 128,
    "w_bit":        4,
    "version":      "GEMM",   # GEMM(GPU) 或 GEMV(单 batch)
}
model.quantize(tokenizer, quant_config=quant_config)   # AWQ 内置 pile 校准
model.save_quantized(quant_path)
tokenizer.save_pretrained(quant_path)

# 之后用 vLLM 加载:
# vllm serve llama-3.1-8b-awq --quantization awq
```

### 7.2 AutoGPTQ 量化 7B 模型

```python
from auto_gptq import AutoGPTQForCausalLM, BaseQuantizeConfig

quant_config = BaseQuantizeConfig(
    bits=4, group_size=128,
    desc_act=False,        # True 精度更高,推理慢
    damp_percent=0.01,
)
model = AutoGPTQForCausalLM.from_pretrained(model_path, quant_config)
calibration_data = [tokenizer(t, return_tensors="pt") for t in load_calib_set()]
model.quantize(calibration_data)
model.save_quantized(quant_path)
```

### 7.3 用 llama.cpp 转 GGUF

```bash
# 把 HF 模型转 GGUF FP16
python convert_hf_to_gguf.py /path/to/llama-3.1-8b \
    --outfile llama-3.1-8b-f16.gguf

# 量化到 Q4_K_M
./llama-quantize llama-3.1-8b-f16.gguf llama-3.1-8b-q4_k_m.gguf Q4_K_M

# 直接跑(CPU 或 GPU offload)
./llama-cli -m llama-3.1-8b-q4_k_m.gguf -p "你好" -n 128

# 或 Ollama 加载
ollama create my-llama -f Modelfile  # Modelfile 指向 .gguf
ollama run my-llama
```

### 7.4 vLLM 加载 AWQ / GPTQ / FP8

```bash
# AWQ
vllm serve TheBloke/Llama-3-70B-AWQ --quantization awq

# GPTQ
vllm serve TheBloke/Llama-3-70B-GPTQ --quantization gptq

# FP8(H100 / H200)
vllm serve neuralmagic/Llama-3-70B-FP8 --quantization fp8
```

vLLM 会自动按 quantization 类型选 INT4 / INT8 / FP8 GEMM kernel,推理流程跟 FP16 完全一致。

---

## 八、选型决策

### 8.1 决策树

```
你的部署环境是?
│
├─ NVIDIA GPU + vLLM/SGLang(数据中心推理主流)
│      │
│      ├─ 模型 7B-30B,batch 中等,显存够 → AWQ W4A16(推荐)
│      ├─ 模型 70B+,显存紧            → AWQ W4A16(必须)
│      └─ 极致吞吐 + H100,batch ≥ 32  → TRT-LLM W8A8 / FP8
│
├─ NVIDIA GPU + 老引擎(HF text-generation-inference 等)
│      └─ GPTQ W4A16(兼容性好)
│
├─ Apple Silicon Mac / CPU / Edge / 个人本地
│      ├─ 7B 流畅                → GGUF Q4_K_M
│      ├─ 13B-30B                → GGUF Q4_K_M / Q5_K_M
│      └─ 70B(需要 64GB+ 内存)  → GGUF Q4_K_M
│
└─ 训练侧(QAT / 训练时量化)
       └─ FP8 训练,Transformer Engine(详见 22 篇)
```

### 8.2 不要犯的坑

- **不评测就上线**:量化精度损失 1-5% 是常态,业务能不能接受是评测问题不是猜测问题
- **追低位宽追到 INT2**:Q2_K / W2A16 在 13B 及以下模型常常崩,只有 70B+ 大模型勉强能跑
- **GPTQ 跑数学/代码模型**:对激活敏感的模型 AWQ 更稳
- **GGUF 上数据中心**:llama.cpp 没批处理调度,百级并发会被 vLLM 吊打十几倍
- **AWQ 跑非主流架构**:AWQ kernel 对 attention 结构有假设,新颖架构(Mamba / SSM)可能不支持

### 8.3 上线前检查清单

```
□ 业务评测集分数 vs FP16 baseline
□ 长上下文(8k+)输出质量(短样本评测会漏掉长上下文崩塌)
□ 显存实际占用(KV cache、激活算上)
□ p50/p99 延迟对比 FP16
□ 边界 prompt(emoji、代码、多语言)稳定性
□ 跟 FP16 并存 A/B,看真实业务指标
```

---

## 九、看完这一篇,你应该能

- 解释 GPTQ 的核心思想(Hessian 误差补偿,逐列量化)
- 解释 AWQ 的核心观察(1% salient 权重对应大激活,等价 scale 保护)
- 解释 GGUF 不是算法,是 llama.cpp 的格式 + k-quants 一组方案
- 默写三方对比表的核心维度(精度损失、速度、引擎、场景)
- 给出选型决策:GPU 数据中心 → AWQ;老引擎 → GPTQ;CPU/Mac → GGUF
- 解释 SmoothQuant 跟 AWQ 是同思想不同目标(W8A8 vs W4A16)
- 写得出 AutoAWQ / AutoGPTQ / llama-quantize 的最小命令
- 上线前不评测就量化的人,你能列出他错过了哪些坑

下一篇:**22 FP8 训练与推理** — 从权重量化(整数)切到数值格式革命(浮点)。Hopper 之后 FP8 是新标准,E4M3 与 E5M2 双格式各有分工,Transformer Engine 是把 FP8 训练真正打通的工程关键。
