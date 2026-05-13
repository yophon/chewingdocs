# LLM 算力账:三个公式 + 一张大表

LLM Infra 工程师跟前几代 Web 工程师最大的区别,就是必须会算账。一台 H100 8 卡服务器一天租金 100-200 美元,跑 70B 推理服务每千 token 成本 0.5 到 5 美元区间——算错一个数量级,公司从盈利变烧钱。这一篇用三个公式 + 几张表,把"模型 vs 卡 vs 显存 vs 吞吐 vs 成本"算清楚,后面所有选型(06 引擎、14 ZeRO、22 FP8、29 成本)都站在这一篇上。

> 一句话先记住:**推理一次 FLOPs ≈ 2 × P × tokens(P 是参数量),训练总 FLOPs ≈ 6 × P × D(D 是训练 token 数,Chinchilla),推理显存 ≈ 参数 × bytes + KV;Decode 阶段每 token 算量极小但要把所有权重读一遍,所以瓶颈是 HBM 带宽不是算力——这一组数学决定了选什么卡、能上什么模型、TPS 上限是多少**。

---

## 一、为什么必须会算账

不会算账的三种典型错误:

```
1. 买错卡
   "70B 推理 H100 一张就够吧"
   → BF16 权重 140 GB,H100 SXM5 80 GB 装不下
   → 实际需要 2 张 H100 或 1 张 H200(141 GB)
   → 错了一档,采购预算翻倍

2. 定错 SLO
   "我们 SLO 设 TTFT 100ms"
   → 8K context prefill 在 H100 上至少 200-500ms
   → SLO 永远达不到,客户投诉,服务下线

3. 亏本上线
   "OpenAI gpt-4o 0.005 美元/1k token,我们卖 0.003 应该有得赚"
   → 70B 自托管成本算下来 0.5-2 美元/1k(没批量优化时)
   → 卖一单亏 100x,做得越大死得越快
```

会算账的工程师在白板前 5 分钟就能砍掉这些方案,不用上线踩坑。下面三个公式是底子。

---

## 二、公式 1:推理 FLOPs ≈ 2 × P × tokens

每生成或处理一个 token,模型基本上要把所有参数都"摸一遍"。粗略估算:

```
推理 FLOPs ≈ 2 × P × tokens

  P:      模型参数量(忽略 embedding,只算 transformer block 主体)
  tokens: 处理的 token 总数(prefill 输入 + decode 输出)
  2:      一次乘加 (multiply-add) 算 2 个 FLOP
```

为什么是 2 × P:每个权重在一个 token 上参与一次乘加,70B 模型一个 token 大概 140 G FLOPs。

举例:

```
70B 模型,prompt 1024 + output 512 = 1536 tokens
  推理 FLOPs ≈ 2 × 70e9 × 1536 ≈ 2.15e14 = 215 TFLOPs

H100 BF16 算力 1979 TFLOPS:
  纯算力下 215 / 1979 ≈ 0.11 秒(理论下限,实际跑不到)
```

**注意"理论下限"四个字**——这只是把所有权重当 FLOP 算。实际 decode 阶段受 HBM 带宽限制,远跑不到这个速度。第九节展开。

Attention 项通常忽略,但长上下文不能忽略:

```
Attention FLOPs ≈ 2 × n_layer × n_head × seq_len² × head_dim
              ≈ O(L × H × seq² × d)

70B (L=80, H=64, d=128):
  seq=2K:    Attention ≈ 5.4 G FLOPs / token        相比 140 G 主算量小
  seq=32K:   Attention ≈ 86  G FLOPs / token        开始可比
  seq=128K:  Attention ≈ 344 G FLOPs / token        反客为主
```

**长上下文场景 attention 成本会反客为主**——这是 FlashAttention / Sparse Attention / Sliding Window 等算法存在的原因(aiLearning 21 讲过算法细节)。

---

## 三、公式 2:训练总 FLOPs ≈ 6 × P × D(Chinchilla)

DeepMind 2022 年 Chinchilla 论文给出的经验估计:

```
训练总 FLOPs ≈ 6 × P × D

  P: 参数量
  D: 训练 token 数
  6: 包含 forward (2P) + backward (4P,反向比前向贵 ~2x)
```

为什么反向 ~2x 前向:每层反向要算两类梯度——对参数的梯度 + 对输入的梯度,两者各等于一次前向的算量。所以 forward 2P + backward 4P = 6P。

Chinchilla scaling law 还告诉我们,在算力预算固定时,**最优 D ≈ 20 × P**(每个参数训 20 个 token)。这是"训多少 token 性价比最高"的经验值。Llama-3 把这个推到 ~150 倍,是觉得算力不再是主要瓶颈,数据质量更重要。

```
70B 模型,Chinchilla 最优 D = 20 × 70B = 1.4T tokens
训练总 FLOPs ≈ 6 × 70e9 × 1.4e12 = 5.88e23 FLOPs

折算到 H100 BF16(标称 1979 TFLOPS,实际 sustained 约 30-50%):
  实际有效算力 ≈ 1979 × 0.4 ≈ 800 TFLOPS / 卡
  总 GPU 秒 = 5.88e23 / (800e12) ≈ 7.35e8 秒
            = 8500 卡天

  1024 张 H100 训:8500 / 1024 ≈ 8.3 天   (利用率拉满的理想)
  实际 30% MFU:                     ≈ 28 天 / 1024 卡
  256 张 H100 训:                   ≈ 33-100 天
```

**8 天 1024 张 H100 训一个 70B,这是 2024-2025 头部公司的事实成本**。考虑到 H100 月租 1500-2500 美元 / 卡,8 天 1024 卡 ≈ 1024 × 8/30 × 2000 ≈ 55 万美元——还没算前期数据准备、试错、checkpoint 恢复、超参搜索。

DeepSeek 系列在工程上反复验证一件事:**MoE 把激活参数从 670B 降到 37B,训练 FLOPs 按"激活参数 × D"算**——所以 V3 只用了 ~2.8e24 FLOPs(约 2048 H800 × 2 个月)就训完。这是 MoE 经济学。

---

## 四、公式 3:推理显存 = 权重 + KV

```
推理显存 ≈ 模型参数 × bytes_per_param + KV Cache + workspace

KV Cache 大小 ≈ 2 × n_layer × n_kv_head × head_dim × seq × batch × bytes
             ↑
             K 和 V 各一份
```

`workspace`(临时计算 buffer、CUDA Graph 等)在 vLLM 里通常预留几 GB。下面只算前两块。

### 4.1 权重显存(各模型规模 × 各精度)

```
                     BF16 (2B/p)    FP8 (1B/p)    INT4 (0.5B/p)
7B 模型:              14 GB          7 GB          3.5 GB
13B 模型:             26 GB          13 GB         6.5 GB
34B 模型:             68 GB          34 GB         17 GB
70B 模型:             140 GB         70 GB         35 GB
180B 模型 (MoE 激活):  360 GB         180 GB        90 GB
405B 模型:            810 GB         405 GB        202 GB
```

(MoE 全部参数比这大,但每 token 只激活一部分。激活的部分要驻留,未激活的可以路由到不同卡——25 / 27 篇展开)

### 4.2 KV Cache 显存(每 token,典型 GQA 模型)

按 70B Llama-style 模型(80 层、64 头、8 KV 头、head_dim=128):

```
每 token KV (BF16) = 2 × 80 × 8 × 128 × 2B ≈ 327 KB
每 token KV (FP8)  ≈ 163 KB
每 token KV (INT4) ≈  82 KB
```

按 7B Llama-3(32 层、32 头、8 KV 头、head_dim=128):

```
每 token KV (BF16) = 2 × 32 × 8 × 128 × 2B ≈ 131 KB
每 token KV (FP8)  ≈  66 KB
每 token KV (INT4) ≈  33 KB
```

`bytes/token = 2(KV) × n_layer × n_kv_head × head_dim × bytes_per_elem`,记住"GQA 模型 KV 大小由 n_kv_head 决定,不是 n_head"。Llama-3 70B GQA 把 KV 头数从 64 砍到 8,KV 占用直接砍 8x——这是为什么 GQA 几乎成了 2024 之后所有大模型的标配。

---

## 五、单卡能不能装下:三大模型 × 三大卡

把权重 + 一段典型 KV 加起来:

```
            权重 (BF16)  权重 (FP8)   权重 (INT4)
7B          14 GB        7 GB         3.5 GB
70B         140 GB       70 GB        35 GB
405B        810 GB       405 GB       202 GB
```

```
                A100 80G    H100 80G    H200 141G   8×H100      8×H200
7B   BF16       ✓单卡       ✓单卡       ✓单卡       ✓           ✓
7B   FP8        ✓单卡       ✓单卡       ✓单卡       ✓           ✓
70B  BF16       ✗(140>80)   ✗           ✓单卡       ✓           ✓
70B  FP8        ✓单卡(紧)    ✓单卡(紧)    ✓单卡       ✓           ✓
70B  INT4       ✓单卡       ✓单卡       ✓单卡       ✓           ✓
405B BF16       ✗           ✗           ✗           ✓ TP=8       ✓ TP=8
405B FP8        ✗           ✗           ✗           ✓ TP=8       ✓ TP=8
405B INT4       ✗           ✗(202>80)    ✓ TP=2      ✓           ✓
```

"单卡(紧)"指权重塞下了但 KV 池余量很少,实际并发会很受限。

记忆要点:

- **7B 哪都装**,主战场是端侧和小服务
- **70B 是 H100 时代的甜点**:FP8 单卡装下,2 卡 BF16 装下有富余
- **405B 是必须 multi-GPU 的尺度**,FP8 + 8 卡 H100 是 2024-2025 主流部署
- **H200 的核心存在理由**:把 70B BF16 单卡变成可能,把 405B INT4 也单/双卡化

---

## 六、装下了之后,KV 还能塞多少:并发 × 上下文

显存 = 权重 + KV,装下权重后剩下都是 KV 池。

以 70B FP8 在不同卡上算:

```
单卡 H100 80GB:
  权重 70 GB + 工作空间 5 GB
  剩余给 KV ≈ 5 GB     ← 几乎没有,生产并发根本扛不住

2 卡 H100 NVLink (TP=2):
  每张 35 GB 权重 + 5 GB workspace + 40 GB KV
  KV 总量 ≈ 80 GB,FP8 KV 每 token 163 KB
  能塞 ≈ 80 GB / 163 KB ≈ 514K tokens
  → 并发 32 × 16K context ≈ 512K       OK

单卡 H200 141GB:
  权重 70 GB + 5 GB workspace + 65 GB KV
  能塞 ≈ 65 GB / 163 KB ≈ 418K tokens
  → 并发 24 × 16K context              OK

单卡 H100 80GB,权重切到 INT4:
  权重 35 GB + 5 GB + 40 GB KV
  能塞 ≈ 257K tokens
  → 并发 16 × 16K context              OK,代价是精度 -1~2%

任意上配 + KV 量化(FP8 KV):每 token 减半到 82 KB
  上面所有方案的 KV 容量直接翻倍
```

**KV 池容量是上下文长度和并发的硬墙**——任何"我们要支持 128K 上下文 / 1000 QPS"的需求,先到这里来算。常见的回答:

- 128K 上下文 + 32 并发 ≈ 4M tokens × 163 KB = 654 GB KV → 单副本必须 8 卡 H200 + KV 量化
- 1000 QPS + 平均 200 token / 秒输出 → 每副本至少 50-100 并发,看 TTFT 要求

---

## 七、输出 tokens/s 与每千 token 成本

decode 阶段是 memory-bound:**每 token 必须把所有权重从 HBM 读一遍**。

```
单 batch decode 时间 ≈ 模型大小 / HBM 带宽

H100 SXM5 HBM 带宽 ≈ 3.35 TB/s

70B FP8 权重 70 GB,decode 1 个 token 至少 70 / 3350 ≈ 21 ms
   → 单请求 max ≈ 48 tokens/s

加 batch:权重读一次摊给 batch 个请求
   batch=32 → 21 ms 出 32 个 token
   总吞吐 ≈ 32 / 0.021 ≈ 1524 tokens/s
   单请求仍然 ~48 tokens/s(每个用户感觉是这个速度)

decode 本质:加 batch 提总吞吐,不加 batch 提单请求速度,
            但单请求不会因为 batch=1 而跑到 100 tokens/s,被 HBM 带宽锁死。
```

实战吞吐(70B 模型,vLLM 默认配置,数字 ±30% 看 prompt 长度 / 调度):

```
            单卡   2 卡 TP   8 卡 TP   单请求 tokens/s   并发吞吐 tokens/s
H100 BF16   ✗      可行      好         ~25-40           ~1000-2000
H100 FP8    紧      好        极好       ~40-60           ~2000-4000
H100 INT4   好      好        好         ~50-70           ~1500-3000 (KV 限)
H200 FP8    好      极好      极好       ~50-70           ~3000-6000
B200 FP8    好      极好      极好       ~80-120          ~5000-10000
```

### 每千 token 成本(粗算)

```
H100 公开租金(2026 估):约 2 美元 / 卡时(规模采购可降到 1.5)

70B FP8 + 2 张 H100,稳定吞吐 3000 tokens/s:
  每秒成本:2 × 2 / 3600 ≈ 0.00111 美元
  每 1k token:0.00111 / 3 ≈ 0.00037 美元
  → 1k token ≈ 0.04 美分(纯卡成本,不含运维 / 数据 / 模型授权)

对比 OpenAI gpt-4o 价格(2026 公开价):
  $2.5 / 1M input  ≈ 0.25 美分 / 1k input
  $10  / 1M output ≈ 1.0  美分 / 1k output

自托管 70B 在饱和负载下纯卡成本是商用 API 的 1/5 ~ 1/20。
这是大量公司选自托管的核心理由。
```

注意几个隐含假设:**满负载 + 高 batch 利用率**。如果你的服务每天就几百次调用,batch 起不来,自托管成本反而比 API 贵 10x:

```
低负载场景(每天 1 万次调用,平均 1000 token):
  总 token = 10M / 天
  自托管:2 张 H100 × 24h × 2 美元 = 96 美元 / 天
  每千 token 成本 = 96 / 10000 ≈ 0.96 美分 / 1k    ← 比 OpenAI 还贵!

  改 API:10M token × 0.6 美分(均价) ≈ 60 美元 / 天

自托管的盈亏平衡线大概在每天千万到亿 token 量级——低于这个直接用 API。
```

29 篇展开成本细账。

---

## 八、Chinchilla scaling 一张表:训一个 X B 大概多少卡天

H100 BF16,实际 sustained 800 TFLOPS / 卡(40% MFU),Chinchilla D=20×P:

```
模型规模    最优 D       总 FLOPs       1024 卡天     1024 卡 × 多少天
7B         140B tokens  5.88e21        ~ 85          ~ 0.1 天 (一个白天)
13B        260B tokens  2.03e22        ~ 295         ~ 0.3 天
34B        680B tokens  1.39e23        ~ 2025        ~ 2 天
70B        1.4T tokens  5.88e23        ~ 8500        ~ 8 天 (理想 MFU)
                                                      ~ 28 天 (30% MFU 实际)
180B       3.6T tokens  3.89e24        ~ 56000       ~ 55 天 (1024 卡)
405B       8.1T tokens  1.97e25        ~ 285000      ~ 280 天 (1024 卡)
                                                      ~ 70 天 (4096 卡)
```

(MoE 模型按"激活参数 × D"算,DeepSeek V3 670B-MoE / 37B 激活,实测约 2048 H800 × 2 个月)

**主流公司的实际预算**:

- 训一个 70B 主线模型:1024-2048 H100 × 1-2 个月,百万到千万美元
- 训一个 405B 主线模型:4096-8192 H100 × 2-4 个月,千万到亿美元级
- 训一个 1T+ MoE 模型:几千到上万张卡 × 几个月,亿美元级以上

这是为什么 2024 年中国"百模大战"很快收敛到不超过 10 家——不是技术不会,是没人付得起算力账。

---

## 九、Decode 阶段的 Roofline:为什么 H100 算力大半浪费

```
H100 算力(BF16):1979 TFLOPS
H100 带宽(HBM): 3.35 TB/s
拐点 = 1979e12 / 3.35e12 ≈ 590 FLOP / Byte

70B BF16 一个 batch=1 decode:
  算量 ≈ 2 × 70e9 = 140 GFLOP
  数据搬运 ≈ 140 GB(权重一次)
  算术强度 ≈ 140e9 / 140e9 = 1 FLOP/Byte    ← 远低于拐点 590

实际利用算力 ≈ HBM 带宽 × 算术强度 = 3350 × 1 = 3.35 TFLOPS
              占 H100 标称 1979 TFLOPS 的 0.17% !
```

**Decode 阶段绝大多数算力都在闲置**——这是后续 09 / 11 / 24 篇所有"加 batch / 投机解码 / multi-LoRA"优化的根本驱动力:**算力是免费的,带宽是贵的**。任何能让"读一次权重摊给更多 token"的招都直接转化为吞吐。

```
batch=1     算术强度 ≈ 1     利用算力 ≈ 3.35 TFLOPS    (0.17%)
batch=8     算术强度 ≈ 8     利用算力 ≈ 26.8 TFLOPS    (1.4%)
batch=32    算术强度 ≈ 32    利用算力 ≈ 107 TFLOPS     (5.4%)
batch=128   算术强度 ≈ 128   利用算力 ≈ 428 TFLOPS     (21.6%)
batch=590   算术强度 ≈ 590   利用算力 ≈ 1979 TFLOPS    (100%, 拐点)
```

但 batch 不能无限拉,因为 batch 大 = KV Cache 大 = 显存撑爆;**KV 池容量给 batch 设了硬上限**。这就是为什么 PagedAttention(08 篇)能让 batch 几乎翻倍——它把 KV 浪费砍掉。

prefill 阶段算术强度可以推到几千(S × 2,S 是 prompt 长度),那时算力才是瓶颈,跟 decode 完全反过来。这一组观察(prefill compute-bound、decode memory-bound)是 03 篇的核心结论,也是 30 篇 Disaggregated Prefill-Decode 架构的物理依据。

---

## 十、看完这一篇,你应该能

- 写出推理 FLOPs ≈ 2 × P × tokens 公式,用它估算一个推理请求的下限延迟
- 写出训练 FLOPs ≈ 6 × P × D 公式,算"训一个 70B 大约多少卡天"
- 算 70B / 405B 模型在 BF16 / FP8 / INT4 下的权重显存
- 算 KV Cache 每 token 大小,给一个上下文长度估总 KV 显存
- 看着模型规模和卡型,判断"装得下吗、能塞多少并发 × 多少上下文"
- 解释为什么 decode 阶段 H100 算力大半浪费(算术强度 ≈ 1,远低于拐点 590)
- 算自托管推理服务每千 token 成本,知道盈亏平衡量级在哪

下一篇:**06 推理引擎景观** — vLLM / SGLang / TensorRT-LLM / TGI / llama.cpp / MLC-LLM / LMDeploy 七大主流引擎一张选型矩阵,知道什么场景该上哪个、为什么 vLLM 是默认选择。
