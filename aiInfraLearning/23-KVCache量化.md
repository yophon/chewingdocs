# KV Cache 量化:长上下文真正的杀手锏

07 篇算过 KV Cache 的显存账:70B 模型 BF16 推理,128K 上下文一个请求 KV 就要 40GB,batch=8 直接 320GB,**KV 比权重(140GB)还大**。22 篇又说「KV FP8 是免费降本的最大单点」。这一篇拉清楚为什么——KV 量化跟权重量化 / 激活量化在工程上完全是另一回事,**只动 KV 不动权重的设计**让它代价小、收益大,2026 年长上下文服务基本默认开启。

> 一句话先记住:**KV 量化必须 per-token(每个 token 自己一个 scale),原因是 token 之间数值范围差异极大;FP8 KV 50% 显存收益、精度损失 < 1%,长上下文必开;INT4 KV 75% 收益、长序列末尾会丢细节,适合极限显存场景;量化-反量化必须在 attention kernel 内部完成,vLLM / SGLang / TRT-LLM 都已生产可用**。

---

## 一、为什么 KV 量化收益大

### 1.1 长上下文场景下 KV 远超权重

复用 07 篇的公式,以 Llama-3-70B(80 层、8 KV head、head_dim=128、GQA)为例:

```
每 token 每层 KV(BF16):
  2 × n_kv_head × head_dim × 2 bytes
  = 2 × 8 × 128 × 2 = 4096 bytes/层 = 4 KB/层

每 token 全部 80 层 KV:
  4 KB × 80 = 320 KB / token

不同 context 长度(单请求):
  4K  ctx:   4096 × 320 KB ≈ 1.25 GB
  32K ctx:   32768 × 320 KB ≈ 10 GB
  128K ctx: 131072 × 320 KB ≈ 40 GB
  1M  ctx:    ...        ≈ 320 GB    单请求就装不下

batch × context 双增长:
  batch=8 × 128K = 320 GB           ← 8 卡 H100 全部 KV 占满,权重都没地方放
  batch=4 × 256K = 320 GB
  batch=1 × 1M   = 320 GB
```

**长上下文场景里 KV 是绝对的显存杀手**,GQA(把 KV 头数从 64 砍到 8)已经把权重侧的优化都用完了,再省就只能往 KV 字节上动手。

### 1.2 一张表:三种量化方案对比

同一个 Llama-3-70B、batch=8、128K context:

| 方案 | 字节/值 | KV 总占用 | 显存收益 | 精度损失(MMLU) | 长上下文检索(needle@128K) |
| --- | --- | --- | --- | --- | --- |
| BF16 | 2.00 | 320 GB | 0% | 0% | 100% |
| FP8 E4M3 | 1.00 | 160 GB | 50% | 0.3-0.8% | 95-98% |
| FP8 E5M2 | 1.00 | 160 GB | 50% | 0.5-1.0% | 95-97% |
| INT8 (per-token) | 1.00 + scale | ~165 GB | 48% | 0.5-1.5% | 92-96% |
| INT4 (per-token) | 0.50 + scale | ~85 GB | 73% | 1-3% | 85-92% |
| INT2(实验) | 0.25 + scale | ~50 GB | 84% | 5-10% | < 70% |

**FP8 是 2026 长上下文服务的主流首选**:50% 显存收益、精度几乎没损失。INT4 是「装不下就上」的极限方案。

---

## 二、KV 量化的特殊性

### 2.1 为什么不能 per-tensor

权重量化可以 per-tensor 一个 scale(权重是静态的、整个张量数值范围相对一致)。KV 不行:

```
不同 token 的 K / V 数值范围对比(典型 LLM):

  token 序号    →
   ┌──────────────────────────────────────────────────────────────┐
   │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │
   │█│ │█│ │ │ │█│█│ │ │ │ │ │ │█│█│█│ │█│ │█│ │ │ │█│ │█│█│ │█│ │
   └─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┘
      ↑ token 0 K 值范围 ±2.5,大多 token 在 ±1 内
      ↑ token 7 是 special token,K 值范围 ±50 (outlier)
      ↑ token 23 是数字 token,K 值范围 ±0.5
      
  如果 per-tensor 一个 scale:
    scale = max / 448 ≈ 50/448 = 0.11
    token 23 的真实值 0.5 → 量化后 = 4.5 (FP8 E4M3 邻近值 5.0)
    精度退化为 11%,无法用
    
  per-token scale:
    每个 token 自己算一个 scale
    token 7:  scale = 50/448 = 0.11
    token 23: scale = 0.5/448 = 0.0011    ← 精度极高
    每个 token 内部精度都最大化
```

**所以 KV 量化天然是 per-token / per-channel 的细粒度量化**——这是它跟权重量化最大的不同。

### 2.2 量化与反量化的发生位置

```
没量化的 attention 计算:
  Q (FP16) × K^T (FP16)  →  attention scores (FP32)
  scores → softmax → attention weights
  attention weights × V (FP16) → output

KV 量化后的 attention 计算:
  KV cache 里存的是 FP8 / INT4 K, V + 每 token 的 scale
  
  Q (FP16) × K_quantized^T 
       ↓
       kernel 内部边读 K 边反量化:
         for each token in cache:
           K_fp16_token = dequant(K_quantized_token, scale_token)
           score += Q · K_fp16_token^T
       ↓
  scores → softmax → attention weights
  
  attention weights × V_quantized
       ↓
       同样,边读 V 边反量化
       ↓
  output

关键:反量化必须发生在 kernel 内部,不能在 kernel 外提前 dequant 整个 cache
       (那样反而把显存翻倍 + HBM 搬运变多,完全失去收益)
```

**这就是为什么 KV 量化必须有 attention kernel 的支持**——不是简单改个 dtype 就能跑,需要 kernel 内置 dequant 路径。FlashAttention-3 / vLLM 的 PagedAttention v2 都有专门的 FP8 / INT4 KV path。

---

## 三、显存布局:三种方案

### 3.1 必画图:KV Cache block 的内部结构

vLLM PagedAttention 把 KV 切成固定大小的 block(默认 16 token / block)。一个 block 内部布局如下:

```
BF16 KV block(基线,vLLM 默认)
─────────────────────────────────────────────────────────
block 大小 = 16 token × 8 KV head × 128 head_dim × 2 bytes
           = 32 KB(K) + 32 KB(V) = 64 KB / block
           
内存布局:
  ┌─────────────────────────────────────────────────────┐
  │  K 部分(连续 32 KB)                                │
  │  ┌───┬───┬───┬───┬───┬───┬───┬───┬───┬...┬───┐    │
  │  │t0 │t1 │t2 │t3 │t4 │t5 │t6 │t7 │t8 │...│t15│    │
  │  └───┴───┴───┴───┴───┴───┴───┴───┴───┴...┴───┘    │
  │   ↑ 每 token 2 KB(8 head × 128 dim × 2 bytes)     │
  ├─────────────────────────────────────────────────────┤
  │  V 部分(连续 32 KB)                                │
  │  ┌───┬───┬───┬───┬───┬───┬───┬───┬───┬...┬───┐    │
  │  │t0 │t1 │t2 │t3 │t4 │t5 │t6 │t7 │t8 │...│t15│    │
  │  └───┴───┴───┴───┴───┴───┴───┴───┴───┴...┴───┘    │
  └─────────────────────────────────────────────────────┘


FP8 KV block(50% 收益,主流)
─────────────────────────────────────────────────────────
block 大小 = 16 token × 8 head × 128 dim × 1 byte
           = 16 KB(K) + 16 KB(V) + scale = 32 KB + ε / block

内存布局:
  ┌─────────────────────────────────────────────────────┐
  │  K 部分(16 KB,FP8 E4M3)                          │
  │  ┌───┬───┬───┬───┬───┬───┬───┬───┬───┬...┬───┐    │
  │  │t0 │t1 │t2 │t3 │t4 │t5 │t6 │t7 │t8 │...│t15│    │
  │  └───┴───┴───┴───┴───┴───┴───┴───┴───┴...┴───┘    │
  │   ↑ 每 token 1 KB(8 head × 128 dim × 1 byte)      │
  │  K scale(per-token,FP16):16 个值 = 32 bytes      │
  ├─────────────────────────────────────────────────────┤
  │  V 部分(16 KB,FP8 E5M2)+ V scale 32 bytes        │
  └─────────────────────────────────────────────────────┘
  总 block:32 KB + 64 bytes ≈ 32.06 KB
  scale 开销 < 0.2%,可忽略


INT4 KV block(75% 收益,极限场景)
─────────────────────────────────────────────────────────
block 大小 = 16 token × 8 head × 128 dim × 0.5 byte
           = 8 KB(K) + 8 KB(V) + scale + zero_point = 16 KB + ε

内存布局:
  ┌─────────────────────────────────────────────────────┐
  │  K 部分(8 KB,INT4 packed)                        │
  │  ┌───┬───┬───┬───┬───┬───┬───┬───┬───┬...┬───┐    │
  │  │t0 │t1 │t2 │t3 │t4 │t5 │t6 │t7 │t8 │...│t15│    │
  │  └───┴───┴───┴───┴───┴───┴───┴───┴───┴...┴───┘    │
  │   ↑ 每 token 512 bytes(每两个 INT4 打包成一个字节) │
  │  K scale(per-token, FP16) + zero_point(per-token, INT8) │
  │  额外:16 × (2 + 1) = 48 bytes                     │
  ├─────────────────────────────────────────────────────┤
  │  V 部分(8 KB,INT4 packed)+ scale + zero_point   │
  └─────────────────────────────────────────────────────┘
  总 block:16 KB + 96 bytes ≈ 16.1 KB
  scale 开销 < 0.6%
```

**FP8 几乎不需要 zero_point**(浮点本身能表示负数和 0),INT 量化必须配 scale + zero_point 两个参数。

### 3.2 per-token scale 怎么算

```
量化:
  for each token in cache:
    amax_token = max(|K_token|)            # 这个 token 内最大绝对值
    scale_token = amax_token / 448         # FP8 E4M3 max = 448
    K_token_fp8 = clamp(K_token / scale_token, -448, +448).cast(FP8)
    存:K_token_fp8(1 byte/值)+ scale_token(2 byte / token)

反量化(kernel 内):
  K_token_fp16 = K_token_fp8.cast(FP16) × scale_token
```

**注意**:scale 是「per-token」而不是「per-element」——一个 token 内的所有 head × dim 共享一个 scale。再细就成了「per-channel per-token」,精度更好但 kernel 复杂度爆炸,目前生产没人这么细。

---

## 四、与 PagedAttention 的配合

### 4.1 vLLM block 内自包含

```
                 KV 物理内存池
   ┌───────────────────────────────────────────────────┐
   │  block 0:  request A, position 0-15  (FP8)        │
   │  block 1:  request B, position 0-15  (FP8)        │
   │  block 2:  request A, position 16-31 (FP8)        │
   │  block 3:  request C, position 0-15  (FP8)        │
   │  block 4:  request B, position 16-31 (FP8)        │
   │  ...                                              │
   └───────────────────────────────────────────────────┘
                         ↑
   每个 block 都自包含:K, V 数据 + 每 token 的 scale
   
   Request A 的 block table:
   [0, 2, ...]    ← 通过 block 索引拼出整个 KV 序列
   
   Attention kernel 拿到 block table → 逐 block 读 → block 内 dequant → 算 attention
```

**关键工程点**:scale 必须跟 K/V 在同一个 block 内,**不能放到外部表**——否则 kernel 读 K 一次、读 scale 一次,HBM 来回两倍。

### 4.2 量化-反量化的 kernel overhead

```
小 batch 场景(decode batch=1, 512 tokens cache):
  Attention 总计算量:Q (1,d) × K (512, d)^T  
                  + softmax  
                  + attn_w (1,512) × V (512, d)
  约 100 万次 FMA
  
  反量化开销:dequant 512 个 K_token × 8 head × 128 dim × 1 cast
            ≈ 50 万次 cast(快但不忽略)
            
  → kernel 跑慢 10-15%(对比 BF16 KV,无需 dequant)

大 batch 场景(decode batch=64, 32K tokens cache):
  Attention 总计算量增长 64 × 64 = 4096 倍
  反量化开销也增长 64 × 64 倍
  
  但显存收益(50%)直接让 batch 翻倍成可能
  → 整体吞吐反而 1.5-1.8 倍
```

**结论**:小并发短上下文 KV 量化不一定划算,**KV 量化的甜点在大并发 + 长上下文**——而这正好是长上下文服务的常态。

---

## 五、工程落地

### 5.1 vLLM

```bash
# FP8 E4M3 KV(默认精度更好)
vllm serve meta-llama/Meta-Llama-3-70B-Instruct \
    --kv-cache-dtype fp8 \
    --tensor-parallel-size 4 \
    --max-model-len 131072 \
    --gpu-memory-utilization 0.95

# 或者明确指定格式
--kv-cache-dtype fp8_e4m3      # 精度优先(主流)
--kv-cache-dtype fp8_e5m2      # 范围优先(更长上下文,精度略差)

# 与权重 FP8 / 激活 FP8 一起开
vllm serve meta-llama/Meta-Llama-3-70B-Instruct-FP8 \
    --quantization fp8 \
    --kv-cache-dtype fp8 \
    --tensor-parallel-size 4
```

注意:`--quantization fp8`(权重量化)和 `--kv-cache-dtype fp8`(KV 量化)是**两件独立的事**——可以只开一个,也可以全开。

### 5.2 SGLang

```bash
python -m sglang.launch_server \
    --model-path meta-llama/Meta-Llama-3-70B-Instruct \
    --kv-cache-dtype fp8_e5m2 \
    --tp 4 \
    --context-length 131072
```

SGLang 的 RadixAttention(10 篇)对 KV 共享更激进,与 KV 量化叠加在长上下文 + 多轮场景收益更大。

### 5.3 TRT-LLM

TRT-LLM 不用运行时 flag,build engine 时指定:

```bash
trtllm-build \
    --checkpoint_dir ./llama-70b-fp8-checkpoint \
    --output_dir ./engines/llama-70b-fp8 \
    --gemm_plugin fp8 \
    --kv_cache_quant_algo fp8 \
    --use_paged_context_fmha enable \
    --max_input_len 131072
```

TRT-LLM 也支持 INT8 KV(`--kv_cache_quant_algo int8`)和 INT4 KV(`int4_awq` 等)。

---

## 六、评测:不要只看 MMLU

短任务基准(MMLU、GSM8K、HumanEval)对 KV 量化的精度回退**非常不敏感**——这些任务的 context 短,KV 也少,量化误差累积有限。

**长上下文场景必须用专门基准**:

```
LongBench
  GitHub: THUDM/LongBench
  覆盖单文档 QA、多文档 QA、摘要、Few-shot、代码补全、合成任务
  context 范围 4K-200K
  KV 量化在这上面的回退能反映出来

RULER (NVIDIA)
  GitHub: NVIDIA/RULER
  专门测长上下文,包含 needle-in-a-haystack、变量追踪、共指消解
  4K-128K 多档,可对比量化精度退化曲线

InfiniteBench
  专测 100K+ 超长上下文

Needle-in-a-Haystack
  最经典:在 N 万 token 的文档某处插一句「特定信息」,问模型能否找回
  KV 量化在这个任务上的回退最直观
```

**实战建议**:决定 KV 量化策略前,**用 RULER 跑一遍 BF16 / FP8 / INT4 三档对比**。INT4 在 32K 之前可能没差,到 64K 后开始掉,128K 时差距明显。FP8 几乎所有 context 长度都能跟住 BF16。

---

## 七、与 GQA / MQA 的关系

GQA(Grouped-Query Attention)和 MQA(Multi-Query Attention)是模型层面的 KV 压缩——把 KV head 数减少,Q head 共享同一组 KV。

```
Multi-Head Attention (原始):
  Q, K, V 各 N_head 个
  KV 大小 = 2 × N_head × head_dim × seq_len
  
GQA(Llama-2/3, Qwen 等主流):
  Q 仍 N_head 个,KV 只 N_kv_head 个(N_kv_head < N_head)
  Q 分组,每组共享一组 KV
  Llama-3-70B:N_head = 64,N_kv_head = 8 → KV 缩 8 倍
  
MQA(PaLM 等):
  N_kv_head = 1,极端版 GQA
  KV 缩 N_head 倍
```

**KV 量化是 GQA 之上还能再省一倍的方法**:

```
Llama-3-70B 没 GQA:        KV 系数 1.0    (假设 baseline)
Llama-3-70B + GQA(已实现):KV 系数 1/8 = 0.125
Llama-3-70B + GQA + FP8 KV:KV 系数 0.0625
Llama-3-70B + GQA + INT4 KV:KV 系数 0.031
```

GQA 是模型架构层面优化(训练就定了),KV 量化是推理层面优化(运行时切换)。**两者完全正交,可以叠加**。

---

## 八、什么时候不该量化 KV

```
场景                                     建议
──────────────────────────────────────  ─────────────────────────
短上下文(< 4K)+ 中并发(batch < 16)    可不开,收益小、精度损失没意义
TTFT 极敏感的实时对话                    谨慎,kernel overhead 在小 batch 影响 latency
精度敏感的代码 / 数学场景                FP8 OK,INT4 慎用
长上下文 RAG / 多轮 / agent              必开 FP8,可能要 INT4
1M+ 超长上下文                           必开 INT4 / 混合(浅层 FP8 + 深层 INT4)
极速研究迭代,精度评测不充分             先 FP8,验证后再考虑 INT4
```

**反向 checklist**:决定不开 KV 量化前,问自己一句「**省下的显存能不能让 batch 翻倍**」——能,就开;不能,就先调其他参数。

---

## 九、看完这一篇,你应该能

- 解释为什么 KV 量化必须 per-token,不能 per-tensor
- 算出 70B 模型在不同 context / batch 下,BF16 vs FP8 vs INT4 KV 的占用对比
- 画 KV block 的内部布局(K 段、V 段、per-token scale 都在 block 内)
- 解释为什么反量化必须在 attention kernel 内部完成
- 说出 KV 量化在小 batch 短上下文可能拖慢的 kernel overhead,以及大 batch 长上下文为什么反而吞吐翻倍
- 用 vLLM `--kv-cache-dtype fp8` / SGLang / TRT-LLM 启动 KV 量化推理
- 知道评测必须用 RULER / LongBench / Needle-in-a-Haystack,不能只看 MMLU
- 解释 GQA 和 KV 量化为什么正交可叠加

下一篇:**24 LoRA 服务化** — 训练侧的 LoRA(aiLearning 18)讲过低秩适配怎么训,但生产推理服务想同时跑 100 个领域 LoRA(法律 / 医疗 / 客服)怎么办?S-LoRA / Punica 怎么把多 LoRA 在同一 batch 内一次性算完,vLLM 的 multi-LoRA 怎么用,QLoRA 推理时该 dequant 还是混合 kernel——本系列量化 / 微调层最后一篇。
