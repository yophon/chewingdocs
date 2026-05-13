# LoRA 服务化:一台机器跑 100 个领域微调模型

aiLearning 18 篇讲过 LoRA 训练原理:不更新原始权重 W,只训两个小矩阵 A 和 B,让 ΔW = B @ A 来近似全量微调,**只占 0.1-1% 参数量**。这一篇不重复训练原理,只讲一个工程问题:**训完 100 个 LoRA(法律、医疗、客服、代码、SQL……)上线,怎么不让 GPU 成本也变成 100 倍?**

> 一句话先记住:**LoRA 服务化的核心是「N 个 LoRA + 1 份 base model + 共享 KV」三者的批处理融合**。S-LoRA / Punica 的 SGMV kernel 让同一 batch 里不同请求走不同 LoRA 也能一次算完;vLLM 把这套搬进了生产,`--enable-lora` 是 2026 微调服务的事实标准。Rank=8/16/32 是甜点,LoRA 显存占用比 KV 还小,真正瓶颈是路由调度和冷加载策略。

---

## 一、单 LoRA 部署:其实没问题

如果只有一个 LoRA(比如就一个客服模型),最简单做法是 merge:

```
W_finetuned = W_base + B @ A          # offline 一次性合并

部署:
  把 W_finetuned 当成普通模型加载,vLLM / SGLang / TRT-LLM 全支持
  推理时跟没用过 LoRA 完全一样,无任何额外开销
```

**单 LoRA 服务跟普通推理服务完全等同**,没有什么特殊工程问题。

但 merge 之后**失去了 LoRA 的核心优势**:

```
单 LoRA merge 部署:
  + 推理 0 overhead
  - 模型变成全量大小(70B 还是 70B)
  - 100 个领域 = 100 个全量 70B 副本 = 不可能
  - 切换 LoRA 要重启服务

LoRA 留着不 merge:
  - 推理时算 W·x + B·(A·x)         (多两次小矩阵乘)
  + 100 个 LoRA 共享一份 base 70B
  + 切 LoRA 不重启,运行时加载
  + 同一 batch 内不同请求走不同 LoRA
```

**生产 LoRA 服务化的全部价值都在「不 merge」这条路上**。

---

## 二、多 LoRA 服务的真实需求

实际产品场景:

```
一个智能客服平台:
  base model:  Llama-3-70B
  LoRA-1:      法律咨询(rank=16,~150 MB)
  LoRA-2:      医疗咨询(rank=16,~150 MB)
  LoRA-3:      税务咨询(rank=16,~150 MB)
  LoRA-4:      工程问答(rank=32,~300 MB)
  ...
  LoRA-100:    某客户私有定制(rank=8,~75 MB)

请求模式:
  来一条法律请求 → 用 LoRA-1
  来一条医疗请求 → 用 LoRA-2
  100 路混合请求,每路走自己的 LoRA
  
  并发场景:同一时刻可能 50 个不同 LoRA 都在被请求
```

这是 LoRA 服务化的标准画像:**一份 base 权重 + 上百个小 LoRA,按请求路由**。

---

## 三、朴素方案为什么死

### 3.1 每个 LoRA 起一个独立服务

```
                    Load Balancer
                          │
       ┌─────────┬────────┼────────┬─────────┐
       ▼         ▼        ▼        ▼         ▼
   ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
   │vLLM-1  │ │vLLM-2  │ │vLLM-3  │ │vLLM-4  │ │vLLM-100│
   │70B+LoRA1│ │70B+LoRA2│ │70B+LoRA3│ │70B+LoRA4│ │ 70B+...│
   │ 4×H100  │ │ 4×H100  │ │ 4×H100  │ │ 4×H100  │ │  ...   │
   └────────┘ └────────┘ └────────┘ └────────┘ └────────┘
   
GPU 成本:100 × 4 = 400 张 H100
Base model 重复浪费:99 × 140GB = 13.86 TB 显存重复存
LoRA 利用率严重不均:法律请求多 → vLLM-1 满载,医疗少 → vLLM-2 闲置
```

**100 倍 GPU 成本去服务一份 base + 100 份 LoRA(总参数量 < 70.5B),完全不可接受**。

### 3.2 串行切换 LoRA

```
方案:1 张服务器,按需加载 LoRA,处理完释放再加载下一个

请求 1(法律): load LoRA-1 → 处理 → done    (200ms 加载,500ms 推理)
请求 2(医疗): load LoRA-2 → 处理 → done    (200ms 加载,500ms 推理)
请求 3(税务): load LoRA-3 → 处理 → done

每个请求被 LoRA load 拖慢 200ms+
吞吐:1.4 QPS
完全不能并发(同时只能跑一个 LoRA)
```

**这两条路都通不了——必须有「同 batch 不同 LoRA 一次算」的能力**。

---

## 四、多 LoRA 路由:核心心智

### 4.1 必画图:同 batch 内异构 LoRA

```
                        请求队列
                ┌──────────────────────┐
                │  R1: 法律问题 (LoRA-1) │
                │  R2: 医疗问题 (LoRA-2) │
                │  R3: 法律问题 (LoRA-1) │
                │  R4: 税务问题 (LoRA-3) │
                │  R5: 通用问题 (无 LoRA)│
                │  R6: 医疗问题 (LoRA-2) │
                └──────────────────────┘
                          │
                          ▼  调度器组成一个 batch (size=6)
                          
   batch 索引     0       1       2       3       4       5
   请求          R1      R2      R3      R4      R5      R6
   LoRA id       L1      L2      L1      L3      None    L2
   
                          │
                          ▼  Forward pass(单个 Transformer block)
                          
       Base GEMM(共享一次):
        ┌────────────────────────────────────────────────────┐
        │  Y_base = X @ W^T                                   │
        │  对所有 6 个请求一起算,跑满 Tensor Core            │
        └────────────────────────────────────────────────────┘
                          │
                          ▼  
       LoRA GEMM(异构,SGMV 一次算完):
        ┌────────────────────────────────────────────────────┐
        │  for i in batch:                                    │
        │    if LoRA[i] is not None:                          │
        │      Y_lora[i] = X[i] @ A[LoRA[i]]^T @ B[LoRA[i]]^T │
        │  Y[i] = Y_base[i] + Y_lora[i]                       │
        │                                                     │
        │  Punica SGMV kernel:把这个循环融合成一个 kernel call│
        └────────────────────────────────────────────────────┘
                          │
                          ▼
                       下一层
                       
   关键不变量:
     - Base 权重 W 共享(只搬一次)
     - 不同 LoRA 的 A, B 在显存里都活着,kernel 按需 gather
     - 同一 batch 不同 LoRA 一次 forward 完成
```

### 4.2 算一笔账:LoRA 路径的额外开销

```
Base model GEMM:
  Y = X @ W^T   
  W 形状 (4096, 4096),一次 4096² ≈ 1670 万次 FMA / batch 元素

LoRA path GEMM (rank=16):
  Y_lora = X @ A^T @ B^T
  A 形状 (16, 4096), B 形状 (4096, 16)
  → 两次小 GEMM,4096 × 16 + 16 × 4096 ≈ 13 万次 FMA / batch 元素

LoRA 额外开销:13 / 1670 ≈ 0.78%

整体 LoRA 推理 vs base:   慢 1-3%(算上调度)
```

**LoRA 增加的算力可以忽略,工程难点全在「不同 batch 元素走不同 LoRA」的 kernel 实现**。

---

## 五、S-LoRA(Berkeley 2024)

S-LoRA 是 multi-LoRA 服务的奠基性论文,贡献两点:

### 5.1 Unified Paging

把 LoRA 权重也分页管理,**与 KV Cache 共用同一个显存池**:

```
                  GPU 显存(80GB)
   ┌──────────────────────────────────────────────────────┐
   │  Base model 权重:140GB / TP=4 = 35GB / 卡            │
   │  ──────────────────────────────────────────────────  │
   │                                                      │
   │  统一页表(每页 16 KB):                              │
   │  ┌────────────────────────────────────────────────┐  │
   │  │ page 0:  KV block (request A, position 0-15)   │  │
   │  │ page 1:  KV block (request B, position 0-15)   │  │
   │  │ page 2:  LoRA-1 part (layer 0-9 A matrix)      │  │
   │  │ page 3:  KV block (request C, position 0-15)   │  │
   │  │ page 4:  LoRA-1 part (layer 0-9 B matrix)      │  │
   │  │ page 5:  LoRA-2 part (layer 0-9 A matrix)      │  │
   │  │ page 6:  KV block (request A, position 16-31)  │  │
   │  │ ...                                            │  │
   │  └────────────────────────────────────────────────┘  │
   └──────────────────────────────────────────────────────┘
   
   优点:
     - LoRA 和 KV 共享一个分配器,显存碎片不再撕裂两种用途
     - LoRA 也可以「按页换出 / 换入」(LRU)
     - 同一份显存池,业务波动时弹性更好
```

### 5.2 Heterogeneous Batching

不同 LoRA 在同一 batch 内一次算完——这是 S-LoRA 自定义 CUDA Kernel 的核心:

```
传统做法(分组 batch):
  把同 LoRA 的请求分组,每组单独跑一次 forward
  group_1 (LoRA-1): 3 请求 → forward
  group_2 (LoRA-2): 2 请求 → forward
  group_3 (LoRA-3): 1 请求 → forward
  group_4 (None):   1 请求 → forward
  
  共 4 次 forward,每次都重读 base 权重 → HBM 来回 4 倍
  Tensor Core 利用率低(每个 group 都是小 batch)

S-LoRA Heterogeneous Batching:
  1 个 batch (size=7) 走 1 次 forward
  base GEMM:大 batch,一次算完
  LoRA GEMM:自定义 kernel 按 LoRA id gather A/B,一次算完
  
  base 权重只搬 1 次
  Tensor Core 跑大 GEMM 吃满
  整体吞吐 5-10× 传统做法
```

S-LoRA 实测:**单台 8×A100 上同时服务上千个 LoRA**,吞吐比传统方案 4 倍以上。

---

## 六、Punica:SGMV Kernel

Punica(CMU 2023)和 S-LoRA 思路相同,核心贡献是 **SGMV(Segmented Gather Matrix-Vector multiplication)** kernel:

```
SGMV 解决的问题:
  batch 中每个元素要乘不同的小矩阵(LoRA A 或 B)
  这是「按 segment 分组的矩阵-向量乘」
  
传统实现:
  for i in batch:
    out[i] = mat[lora_id[i]] @ vec[i]
  → for 循环 = 串行,SM 闲置

SGMV 实现(GPU kernel):
  把一组按 lora_id 分段的矩阵-向量乘合并成一个 launch
  每个 SM 负责一个 segment,内部并行计算
  访存模式优化:连续 segment 的同一 LoRA 矩阵只读一次 HBM
  
  → 1 次 launch 完成所有 batch 元素的 LoRA 计算
  → SM 利用率接近峰值
```

vLLM 把 Punica 的 SGMV kernel 集成进了 PagedAttention 的批处理流水。**今天用 vLLM 跑 multi-LoRA,底层就是 Punica 内核**。

---

## 七、vLLM 的 multi-LoRA(生产可用)

### 7.1 启动配置

```bash
# 启用 multi-LoRA 支持
vllm serve meta-llama/Meta-Llama-3-70B-Instruct \
    --enable-lora \
    --max-loras 16 \              # 最多同时活跃 16 个 LoRA
    --max-lora-rank 32 \          # 最大支持 rank=32 的 LoRA
    --max-cpu-loras 100 \         # CPU 内存里缓存 100 个(LRU)
    --tensor-parallel-size 4
```

`--max-loras` 是「同时在 GPU 显存里」的数量,`--max-cpu-loras` 是 CPU 缓存数量(超过 max-loras 时按 LRU 换出 GPU,需要时再 swap 进来)。

### 7.2 请求侧路由

```python
from vllm import LLM, SamplingParams
from vllm.lora.request import LoRARequest

llm = LLM(
    model="meta-llama/Meta-Llama-3-70B-Instruct",
    enable_lora=True,
    max_loras=16,
    max_lora_rank=32,
)

# 加载多个 LoRA
lora_law      = LoRARequest("law-v2",      1, "/path/to/law-lora")
lora_medical  = LoRARequest("medical-v1",  2, "/path/to/medical-lora")
lora_tax      = LoRARequest("tax-v1",      3, "/path/to/tax-lora")
lora_code     = LoRARequest("code-v3",     4, "/path/to/code-lora")
# 第二个参数是 lora_int_id(int 型 id,vLLM 内部用)
# 第三个参数是 LoRA 权重路径

prompts = [
    "请解释合同纠纷的处理流程",       # → 法律
    "心律不齐的常见原因是什么",       # → 医疗
    "增值税进项发票如何抵扣",         # → 税务
    "用 Python 实现快速排序",          # → 代码
    "今天天气怎么样",                  # → 不带 LoRA(走 base)
]

lora_requests = [lora_law, lora_medical, lora_tax, lora_code, None]

# 一次性提交,vLLM 内部自动调度
outputs = llm.generate(
    prompts,
    SamplingParams(temperature=0.7, max_tokens=512),
    lora_request=lora_requests,    # 每个 prompt 配一个 LoRA(或 None)
)

for output in outputs:
    print(output.outputs[0].text)
```

**关键点**:`generate` 一次调用提交 5 个不同 LoRA(含 None)的请求,vLLM 内部组成一个 batch、走一次 forward,SGMV kernel 完成异构 LoRA 计算。

### 7.3 OpenAI-compatible API 模式

生产 server 模式更常用 OpenAI 协议:

```bash
# 启动 server,把每个 LoRA 注册为一个 model 名
vllm serve meta-llama/Meta-Llama-3-70B-Instruct \
    --enable-lora \
    --lora-modules \
        law=/path/to/law-lora \
        medical=/path/to/medical-lora \
        tax=/path/to/tax-lora
```

```python
# Client 用 model 字段路由
import openai

client = openai.OpenAI(base_url="http://localhost:8000/v1", api_key="dummy")

# 走法律 LoRA
client.chat.completions.create(
    model="law",       # ← 这个名字对应 --lora-modules 里注册的
    messages=[{"role": "user", "content": "合同纠纷怎么办"}],
)

# 走医疗 LoRA
client.chat.completions.create(
    model="medical",
    messages=[{"role": "user", "content": "心律不齐什么原因"}],
)

# 走 base(不指定 LoRA)
client.chat.completions.create(
    model="meta-llama/Meta-Llama-3-70B-Instruct",
    messages=[{"role": "user", "content": "今天天气"}],
)
```

---

## 八、工程考量

### 8.1 Rank 大小的甜点

```
rank=4:    LoRA 太小,微调质量上不去
rank=8:    主流甜点,质量够 + LoRA 显存极小
rank=16:   主流甜点,中等任务首选
rank=32:   重任务(代码生成、复杂推理)上限
rank=64+:  收益边际递减,接近全量微调成本
```

**rank 越大,SGMV kernel 的相对开销越大**——rank=8 时 LoRA 计算占总时间 < 1%,rank=64 可能到 5-8%。

### 8.2 显存账与冷加载

```
rank=16,Llama-3-70B(80 层、hidden=8192):
  每层 LoRA = 2 × (16 × 8192) × 2 = 524 KB / 层
  全模型 LoRA ≈ 42 MB
  100 个 LoRA ≈ 4.2 GB     ← 微不足道
  1000 个 LoRA ≈ 42 GB     ← 一张 H100 仍能容纳
```

**LoRA 显存压力远低于 KV Cache**——`--max-loras` 限制更多是 kernel 调度复杂度,不是显存。

三级缓存策略:

```
GPU 活跃池:max-loras = 16
CPU 缓存池:max-cpu-loras = 100,LRU 换入换出
本地存储池:数千个 LoRA 文件

请求带新 LoRA id 来:
  1. 在 GPU 池?直接用
  2. 在 CPU 池?swap 进 GPU(几十 ms)
  3. 都没?从磁盘 load 到 CPU,再 swap(秒级冷启动)

工程实践:启动预热热门 LoRA、闲时主动卸载冷 LoRA、租户隔离 GPU slot
```

### 8.3 监控指标

```
multi-LoRA 服务特有指标:
  active_loras:                当前 GPU 上活跃 LoRA 数
  lora_swap_in_total:          冷加载次数(高 = 工作集太大)
  lora_swap_in_latency_p99:    冷加载延迟
  per_lora_qps:                每 LoRA 的 QPS(不均衡时考虑路由)
  batch_lora_diversity:        一个 batch 内 LoRA 种类数(分散 SGMV 越复杂)
```

---

## 九、QLoRA 服务化与工业实践

QLoRA 是训练时的事:**4-bit 量化 base + LoRA 训练**(NF4 + double quant + paged optimizer)。推理时两种做法:

```
做法 1:dequant base + multi-LoRA(简单)
  4-bit base → load 时 dequant 回 BF16/FP16
  推理时 base BF16 + LoRA 走 SGMV
  问题:失去 4-bit 显存收益,只是「训练时省钱」
  
做法 2:量化 base + 量化 LoRA kernel(性能更好)
  base 保持 4-bit(GPTQ / AWQ / bnb-NF4 格式)
  LoRA 仍 BF16 / FP16
  attention / MLP kernel 内部:base dequant → BF16 GEMM,LoRA BF16 GEMM,累加
  vLLM 已支持 AWQ + multi-LoRA 组合
```

实战推荐:

```
GPU 充裕:base BF16 + multi-LoRA(最稳)
GPU 紧:  base FP8 + KV FP8 + multi-LoRA(2026 主流)
极致紧:  base AWQ INT4 + LoRA + KV INT4(精度略损)
```

工业现状:

```
Modal Labs:    用户提交 LoRA 自动加载到共享 base,弹性算 LoRA 计费
                底层 vLLM + Ray Serve(26 篇)
Anyscale:      RayLLM 集成 vLLM multi-LoRA,K8s 多租户隔离
OpenAI fine-tuning API: 内部 multi-LoRA 路由,所有用户共享 base
                       (这就是 fine-tune 后只贵一点点而非 100 倍的原因)
Replicate / Together AI / Fireworks: 服务模式都是「上传 LoRA → 路由到 base 集群」
```

**「微调」在 2026 云上等于「上传一个 LoRA 到 multi-LoRA 集群」**,不是「单独起一个服务」——这是 LoRA 服务化最大的产业意义。

---

## 十、看完这一篇,你应该能

- 解释为什么单 LoRA merge 没问题、多 LoRA merge 不可能
- 画出多 LoRA 服务的请求路由图(同 batch 不同 LoRA,base GEMM 一次 + SGMV LoRA 一次)
- 说出 S-LoRA 的两个核心贡献(Unified Paging + Heterogeneous Batching)
- 解释 SGMV kernel 解决的问题(按 LoRA id 分段的小矩阵乘合并成一个 launch)
- 用 vLLM `--enable-lora` + `LoRARequest` / `--lora-modules` 起一个 multi-LoRA 服务
- 选 LoRA rank 时知道 8/16/32 是甜点,以及 rank 越大 SGMV kernel 相对开销越大
- 设计一个 LoRA 冷加载 + LRU 缓存策略(GPU pool / CPU pool / 磁盘三级)
- 解释 QLoRA 推理时 dequant base 还是混合 kernel 的取舍

下一篇:**25 Ray 心智** — 系列从模型层切换到调度平台层。Ray 的 Actor / Task / Object Store 是怎么把 vLLM / 训练 / 数据流水 / 多 LoRA 服务都托管起来的,Ray Serve 为什么是 RayLLM / Anyscale 的事实编排层。本系列后半段全部建立在 Ray 这套抽象之上。
