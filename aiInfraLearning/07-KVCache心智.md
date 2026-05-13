# KV Cache 心智:推理一切优化绕着它转的那个东西

03 篇划清了训练和推理的边界,提了一句 KV Cache 是推理"权重之外唯一活的状态"。这一篇把它单独拎出来——为什么自回归生成必须 cache、KV 显存怎么算、长上下文为什么把卡撑爆、GQA/MQA 是怎么把 KV 砍下来的,以及为什么后面 06-30 一半的篇章都在围着 KV 这一件事转。

> 一句话先记住:**KV Cache 把自回归生成的计算量从 O(n²) 压到 O(n),代价是显存占用从零变成 O(L × H × d × seq_len × batch);70B 模型在 128K 上下文下,单请求 KV 就 40GB 起步,KV 比权重还大;后面所有推理引擎的优化(PagedAttention、Continuous Batching、KV 量化、Prefix Cache、Disaggregated)都是在解 KV 这一件事的不同子问题**。

---

## 一、没有 KV Cache 的世界长什么样

### 1.1 为什么自回归必须 cache

LLM 推理的 decode 阶段每一步生成 1 个 token,本质上是这样:

```
输入序列: [t1, t2, t3, t4]  → 目标:生成 t5

不带 cache 的朴素做法:
  step N 要生成第 N+1 个 token,要算 attention:
    Q_N+1 = X_N+1 · W_Q          (新 token 的 Q)
    Attention(Q_N+1, K_1..N+1, V_1..N+1)
                ↑
                每次都要把 K_1, K_2, ..., K_N 重新算一遍
                因为 K_i = X_i · W_K, V_i = X_i · W_V
                X_i 没变、W_K W_V 没变,但每步还在重算
```

这就是 03 篇点过的"重复计算"问题。摊到整个生成过程:

```
朴素生成 N 个 token 总计算量:
   step 1:  算 1 个 token 的 K, V        → 1 次投影
   step 2:  算 2 个 token 的 K, V        → 2 次投影(重算 1 个)
   step 3:  算 3 个 token 的 K, V        → 3 次投影(重算 2 个)
   ...
   step N:  算 N 个 token 的 K, V        → N 次投影
   
   总投影次数 = 1+2+3+...+N = O(N²)
   每个 attention 算 score 也是 O(N²)
   合起来 decode 阶段是 O(N²) 复杂度
```

短文本看不出来,但生成 2000 个 token 的代码:朴素做法 ≈ 200 万次重复投影,带 cache ≈ 2000 次。**两个数量级差距**。

### 1.2 一张图:有 cache vs 无 cache 的 attention

```
无 KV Cache:每步要重算前面所有 token 的 K, V
─────────────────────────────────────────────────────
step 1   X1 ─→ K1,V1   ┐                      Q1·K1
                       ├ attention(Q1, K1, V1)
                       └

step 2   X1 ─→ K1,V1   ┐
         X2 ─→ K2,V2   ├ attention(Q2, K1..2, V1..2)
                       │  ↑ 又算了 K1, V1(浪费!)
                       └

step 3   X1 ─→ K1,V1   ┐
         X2 ─→ K2,V2   ├ attention(Q3, K1..3, V1..3)
         X3 ─→ K3,V3   │  ↑ K1, V1, K2, V2 全重算一遍
                       └

有 KV Cache:K, V 算一次进缓存,新 token 只算自己那份
─────────────────────────────────────────────────────
step 1   X1 ─→ K1,V1 ─→ KV_CACHE: [K1,V1]
                          attention(Q1, KV_CACHE)

step 2   X2 ─→ K2,V2 ─→ KV_CACHE: [K1,V1, K2,V2]
                          attention(Q2, KV_CACHE)

step 3   X3 ─→ K3,V3 ─→ KV_CACHE: [K1,V1, K2,V2, K3,V3]
                          attention(Q3, KV_CACHE)

每步只算 1 个新 K, 1 个新 V,然后追加进 cache
```

**用显存换算力**——这五个字概括了 KV Cache 的全部本质。GPU 算力和显存都是稀缺资源,在 LLM 推理这个特定的工作负载下,**显存不够花,但拿显存换算力是净赚**(因为 decode 是 memory-bound,算力本来就闲着,详见 02 篇)。

---

## 二、KV Cache 显存公式:一个必须默写的等式

### 2.1 公式

```
KV Cache 大小 (字节) = 2 × L × H_kv × d_head × seq_len × batch × bytes_per_element

  ┬   ┬     ┬       ┬        ┬          ┬          ┬
  K+V Layer KV head head_dim 序列长度    并发请求    精度字节
                                                  (BF16=2, FP8=1, INT4=0.5)
```

**变量逐项的工程含义**:

| 变量 | 含义 | 你能调的 |
| --- | --- | --- |
| 2 | K 和 V 各一份 | 不能 |
| L | Transformer 层数 | 不能(模型架构定死) |
| H_kv | KV 头数(GQA/MQA 已砍过) | 不能(模型架构定死) |
| d_head | 每个头的维度 | 不能(模型架构定死) |
| seq_len | 当前序列长度(prompt + 已生成) | 应用层(限 max_tokens) |
| batch | 并发请求数 | 调度层(continuous batching,09 篇) |
| bytes_per_element | 精度 | KV 量化(23 篇) |

**模型架构这一行是固定的**——挑模型时 KV 单价就锁死了。剩下三个旋钮:**截 seq_len、限 batch、降精度**。所有 KV 优化最终都落在这三件事上。

### 2.2 几个常见模型的"每 token KV 单价"

```
Llama-3-8B:
  L=32, H_kv=8 (GQA), d_head=128
  → 每 token 每层 KV (BF16) = 2 × 8 × 128 × 2 = 4096 bytes
  → 每 token 全部层 KV = 4096 × 32 = 128 KB

Llama-3-70B:
  L=80, H_kv=8 (GQA), d_head=128
  → 每 token 每层 KV (BF16) = 2 × 8 × 128 × 2 = 4096 bytes
  → 每 token 全部层 KV = 4096 × 80 = 320 KB

Llama-3-405B:
  L=126, H_kv=8 (GQA), d_head=128
  → 每 token 每层 KV (BF16) = 2 × 8 × 128 × 2 = 4096 bytes
  → 每 token 全部层 KV = 4096 × 126 = 504 KB

Mistral-7B (GQA):
  L=32, H_kv=8, d_head=128 → 同 Llama3-8B,128 KB / token

Qwen2-72B:
  L=80, H_kv=8 (GQA), d_head=128 → ≈ 320 KB / token
```

**记一个粗略量级**:中等规模模型 BF16 大约 **每 token 100-500 KB**。

### 2.3 一张大表:7B / 70B 在不同上下文下的 KV 占用

单个请求(batch=1)的 KV:

| 模型 | 上下文 | BF16 (320KB/tok) | FP8 (160KB/tok) | INT4 (80KB/tok) |
| --- | --- | --- | --- | --- |
| 7B | 4K | 0.5 GB | 0.25 GB | 0.13 GB |
| 7B | 32K | 4 GB | 2 GB | 1 GB |
| 7B | 128K | 16 GB | 8 GB | 4 GB |
| 70B | 4K | 1.3 GB | 0.6 GB | 0.3 GB |
| 70B | 32K | 10 GB | 5 GB | 2.5 GB |
| 70B | 128K | **40 GB** | **20 GB** | **10 GB** |
| 405B | 32K | 16 GB | 8 GB | 4 GB |
| 405B | 128K | 64 GB | 32 GB | 16 GB |

**关键观察**:

1. **70B + 128K 单请求 KV = 40GB**——这一个请求就吃掉半张 H100 的 80GB
2. **batch 一上,KV 线性涨**——70B + 32K + batch=8 = 80GB,等于一张 H100 的全部显存
3. **FP8 砍一半,INT4 砍四分之三**——23 篇专门讲 KV 量化怎么省

### 2.4 batch × context 双增长是非线性灾难

```
                70B BF16 KV 显存(单位 GB)
                
        context →
batch ↓     4K     16K    32K    64K    128K
  1        1.3    5.0    10     20     40
  4        5      20     40     80    160
  8       10     40      80    160    320
 16       20     80     160    320    640
 32       40    160     320    640   1280
 64       80    320     640   1280   2560
                                    
                ← 一张 H100 80GB 的边界(权重还没算)
```

红线很显然:**长 context + 高并发** = 卡撑爆。这就是为什么生产服务在长上下文场景下,batch 上不去——不是算力不够,**是 KV 装不下**。

---

## 三、显存怎么分:一张 70B 推理服务的饼图

### 3.1 70B 在 H100 8 卡 (640GB) 上,不同 context 的显存构成

```
4K context, batch=32:
┌────────────────────────────────────────────────────────┐
│ 权重 (BF16, 8 卡 TP 切片): 140 GB ████████████ 22%      │
│ KV (32 × 4K × 320KB): 42 GB ███ 7%                     │
│ 激活 + workspace: 20 GB █ 3%                            │
│ 空闲(可加 batch): 438 GB ███████████████████████ 68%   │
└────────────────────────────────────────────────────────┘
                                ↑ KV 才占小头,批量还能拉

32K context, batch=16:
┌────────────────────────────────────────────────────────┐
│ 权重: 140 GB ████████████ 22%                           │
│ KV (16 × 32K × 320KB): 168 GB ███████████████ 26%      │
│ 激活 + workspace: 20 GB █ 3%                            │
│ 空闲: 312 GB ██████████████████ 49%                     │
└────────────────────────────────────────────────────────┘
                                ↑ KV 已经超过权重了

128K context, batch=8:
┌────────────────────────────────────────────────────────┐
│ 权重: 140 GB ████████ 22%                                │
│ KV (8 × 128K × 320KB): 336 GB ████████████████████ 53% │
│ 激活 + workspace: 30 GB █ 5%                            │
│ 空闲: 134 GB ███████ 21%                                │
└────────────────────────────────────────────────────────┘
                                ↑ KV 占主导,扩 batch 风险高

128K context, batch=16(冒进配置):
┌────────────────────────────────────────────────────────┐
│ 权重: 140 GB ████████ 22%                                │
│ KV (16 × 128K × 320KB): 672 GB ████████████████████ 75%│
│                                  ← 已经超过总显存 640GB │
│ ── OOM,服务起不来 / 频繁抢占 / 抖动 ──                  │
└────────────────────────────────────────────────────────┘
```

**长上下文场景下 KV 占比能飙到 70%+**——这就是为什么"长 context"在工程上是另一类问题:不是简单调一个 max_tokens,**是整个显存预算结构都得重排**。

### 3.2 推理服务运维第一指标:KV 占比

```bash
# vLLM 在线指标(Prometheus 或 logger 都能拿到)
vllm:gpu_cache_usage_perc       # KV 池使用率,应监控 P95
vllm:num_running                # 当前在跑的请求数
vllm:num_waiting                # 排队中(KV 不够装下)
vllm:num_preempted              # 抢占次数(KV 紧张被踢回去重算/换出)
```

健康基线:

| 指标 | 健康 | 警戒 | 出事 |
| --- | --- | --- | --- |
| KV 池使用率 (P95) | 60-80% | 85-95% | > 95% |
| num_waiting | < 1 | 1-5 | > 10 |
| num_preempted/min | 0-1 | 5-10 | > 30 |
| TPOT P99 | 平稳 | 偶尔尖刺 | 周期性飙升 |

**KV 占比是推理服务的"CPU load"**——它一高,后面所有指标(TTFT、TPOT、QPS)开始抖。运维感知到的"模型变慢了",八成不是模型变慢,是 KV 池满了开始抢占。

---

## 四、GQA / MQA:从架构层面把 KV 砍下来

### 4.1 MHA / GQA / MQA 的关系

```
原始 MHA (Multi-Head Attention):
  Q 头数 = K 头数 = V 头数 = H
  每个 Q 头有自己独立的 K, V 头
  
  Llama-1-65B:  H = 64,  KV 头数 = 64,  KV 单价 = 32 KB/token/层

GQA (Grouped-Query Attention):
  Q 头数 = H,  K 头数 = V 头数 = H_kv  (H_kv < H)
  G = H / H_kv 个 Q 头共享一组 K, V
  
  Llama-3-70B:  H = 64,  H_kv = 8,  G = 8
                KV 单价 = 4 KB/token/层  (砍到原来 1/8)

MQA (Multi-Query Attention):
  H_kv = 1,  所有 Q 头共享同一组 K, V
  
  PaLM, Falcon-7B 早期:KV 单价 = 0.5 KB/token/层  (砍到原来 1/64)
```

### 4.2 一张图

```
MHA  (64 Q 头 + 64 KV 头):
  Q  Q  Q  Q  Q  Q  Q  Q  ... Q  Q  Q  Q  (64 个)
  │  │  │  │  │  │  │  │      │  │  │  │
  K  K  K  K  K  K  K  K  ... K  K  K  K  (64 个)
  V  V  V  V  V  V  V  V  ... V  V  V  V  (64 个)
  
  KV 头数 = Q 头数,KV 显存最大

GQA (64 Q 头 + 8 KV 头,G=8):
  Q Q Q Q Q Q Q Q  Q Q Q Q Q Q Q Q  ... (64 个,8 个为一组)
   \│ │ │ │ │ │ /  \│ │ │ │ │ │ /
    └─┴─K─┴─┴─┘    └─┴─K─┴─┴─┘    ... (8 个 K)
    └─┴─V─┴─┴─┘    └─┴─V─┴─┴─┘    ... (8 个 V)
  
  每 8 个 Q 头共享 1 个 K, V 头 → KV 砍到 1/8

MQA (64 Q 头 + 1 KV 头):
  Q Q Q Q Q Q Q Q Q Q Q Q Q Q Q Q ... (64 个)
   \│ │ │ │ │ │ │ │ │ │ │ │ │ │ /
    ├──────────K────────────┤        (只有 1 个 K)
    ├──────────V────────────┤        (只有 1 个 V)
  
  所有 Q 头共享同一组 K, V → KV 砍到 1/64
```

### 4.3 为什么主流停在 GQA(8 头 KV)

| 方案 | KV 显存 | 效果 | 谁在用 |
| --- | --- | --- | --- |
| MHA | 100% | 基线 | Llama-1, GPT-3 老模型 |
| GQA G=8 | 12.5% | 几乎无损 | **Llama-3, Qwen2, Mistral, DeepSeek** |
| GQA G=4 | 25% | 几乎无损 | 部分中等模型 |
| MQA | 1.5% | 推理质量明显掉 | PaLM, Falcon 早期 |

GQA G=8 是**经验最优**——KV 砍到 1/8,模型效果几乎不掉(测了 MMLU、HumanEval、长 context 检索都基本持平)。MQA 太极端,长 context 检索能力明显退化。**2024 之后新出的开源大模型几乎全是 GQA H_kv=8**,这是个工程社区收敛掉的设计选择。

### 4.4 别忘了 MLA(DeepSeek 的另一条路)

DeepSeek-V2/V3 用的是 **MLA(Multi-head Latent Attention)**:把 K, V 压缩到一个低秩 latent 向量,推理时再展开。它的 KV 单价比 GQA 还小(典型小一倍),但 attention kernel 要专门写——好在 vLLM / SGLang 都已经支持。这条路 2026 年仍在演进,不是主流默认,但在长 context 场景越来越常见。

---

## 五、所有推理优化都围着 KV 转

把 06-30 篇里和 KV 直接相关的优化全列出来:

| 优化 | 解决 KV 的什么子问题 | 出自 |
| --- | --- | --- |
| **PagedAttention** | KV 在显存里碎片化,预留浪费 | 08 |
| **Prefix Caching** | 多请求共享前缀 KV 复用 | 08(尾)/ 10 |
| **RadixAttention** | 任意公共前缀以基数树形式共享 KV | 10 |
| **Continuous Batching** | KV 池里的活跃请求滚动进出,提利用率 | 09 |
| **Chunked Prefill** | 长 prompt 切片不阻塞 decode 的 KV 流转 | 09 |
| **投机解码** | 一次 forward 多产 token,摊薄 KV 搬运 | 11 |
| **KV 量化(FP8/INT4)** | KV 字节单价砍半到 1/4 | 23 |
| **KV CPU 卸载** | KV 池满时部分换出到 host RAM | 09 / 23 |
| **KV 重计算** | 抢占时丢掉 KV,需要时再重 prefill | 09 |
| **Disaggregated Prefill-Decode** | Prefill 和 decode 用不同卡池,KV 跨节点传 | 30 |

**没有一个推理优化和 KV 无关**——你说"vLLM 比 transformers.generate 快 10 倍",拆下来 10x 里每一倍都对应 KV 的某个子问题被解了。

**这就是把 KV 单独写一篇的理由**——把 KV 心智建立起来,后面 08-30 的每一个引擎、每一个优化、每一个调参,你都能用一句话说清"它解决了 KV 的哪部分"。

---

## 六、工程现场:一个 70B 服务的 KV 调优清单

### 6.1 容量预算

```
H100 80GB 单卡 → 跑 70B 推理,要 TP=2 或 TP=4
TP=2 (两卡):
  权重切片 ≈ 70 GB / 卡(BF16 砍半,但加上 framework overhead 大约这个数)
  剩 80 - 70 = 10 GB / 卡 给 KV
  全卡 KV 池 = 20 GB
  / 320 KB/token = 65000 tokens 容量
  
  如果配 max_tokens=2K, system prompt = 500:
    每请求平均占 2500 token KV
    并发上限 ≈ 65000 / 2500 = 26 个请求
    
  如果 context 拉到 32K:
    单请求就 10 GB,并发 = 2,基本没法服务
    → 必须开 KV FP8(23 篇)→ 等效翻倍 → 并发 4
    → 或者上 TP=4 减少每卡权重压力
```

### 6.2 配置三件套(vLLM 视角,08/09 篇展开细节)

```yaml
# 启动 vLLM 70B + 32K context 服务
--model            meta-llama/Meta-Llama-3.1-70B-Instruct
--tensor-parallel-size  4              # 把权重摊薄,腾给 KV
--max-model-len    32768               # 限死 context 上限
--gpu-memory-utilization  0.92         # KV 池能用多少显存(留 8% 给 framework)
--kv-cache-dtype   fp8                 # KV 用 FP8,等效 KV 池翻倍
--max-num-seqs     64                  # 并发上限,根据上面预算调
--enable-prefix-caching                # 系统提示能复用就开
```

### 6.3 监控告警

```
告警规则:
  - vllm:gpu_cache_usage_perc > 0.92, 持续 5 分钟 → 警告(KV 池吃紧)
  - vllm:num_preempted_total 增速 > 10/min        → 警告(频繁抢占)
  - vllm:num_waiting > 5, 持续 1 分钟              → 警告(请求排队)
  - vllm:time_per_output_token P99 > 100ms        → 警告(decode 慢)
  - 任何 OOM                                      → 紧急(降 max-num-seqs)

排查顺序(KV 满了怎么办):
  1. 先看 max-num-seqs 是不是开太大
  2. 看请求实际 context 分布,长尾 99% 是不是远超中位数
  3. 看是否能开 FP8 KV(23 篇),立省 50%
  4. 看是否能开 chunked prefill 让长请求不阻塞(09 篇)
  5. 看是否要扩 TP / 加卡
```

**KV 容量不够有 5 个解,从轻到重**:限 max_tokens → 量化 KV → 减并发 → 分阶段(prefill/decode 分卡,30 篇)→ 扩硬件。

---

## 七、几个常见误区

### 7.1 "把 max_model_len 调到 1M 反正用不到"

错。vLLM 启动时会按 max_model_len 预留 KV 池上界——把它从 32K 改到 1M,**池的容量预算换算逻辑会变**,容易让 batch 跑得更不稳。**只在确实有 1M 用例时才开**,否则限死合理上限。

### 7.2 "GPU 利用率 100% 说明性能拉满"

错。nvidia-smi 看到的 GPU-Util 只表示"SM 是否在忙",对 LLM decode 来说,**整个 SM 大部分时间在等 HBM 搬权重和 KV**——SM 在等也算"忙"。真要看的是 HBM 带宽利用率,以及 vLLM 的 KV 池利用率。

### 7.3 "KV Cache 是 vLLM 发明的"

错。KV Cache 是 Transformer decoder 自回归生成的固有需求,2018 年起所有推理实现都有。vLLM 的贡献是 **PagedAttention**(08 篇)——一种 KV 在显存里的**布局方式**,不是 KV Cache 本身。

### 7.4 "GQA 会掉效果所以别用"

错。GQA H_kv=8 在主流 benchmark 上和 MHA 几乎无差。**Llama-3 / Qwen2 / Mistral / DeepSeek 全部用 GQA**,这是社区已经收敛掉的事实,**MHA 70B 推理的 KV 是 GQA 的 8 倍,你扛不住这个代价**。

### 7.5 "Prefix Cache 一开就快"

不一定。Prefix Cache 的命中率取决于请求形态——大量请求挂同一个长 system prompt 就命中率高,每个请求 prompt 都不一样命中率就接近 0,纯算管理开销。详见 08 篇尾部 / 10 篇 SGLang。

---

## 八、看完这一篇,你应该能

- 用一行公式默写 KV Cache 大小:`2 × L × H_kv × d_head × seq_len × batch × bytes`
- 心算:Llama-3-70B BF16,128K context,单请求 KV ≈ 40 GB
- 解释为什么自回归 decode 必须 cache(O(N) vs O(N²))
- 解释 GQA H_kv=8 为什么是当前社区最优(KV 砍 8x,效果几乎无损)
- 在 nvidia-smi + vLLM metrics 里指出 KV 池使用率、抢占次数、排队数三个关键指标
- 给一个长上下文 OOM 故障,按"限长度 → 量化 → 减并发 → 分卡"四步排查
- 把 PagedAttention / Continuous Batching / KV 量化 / Disaggregated 这些后续优化全对应到 KV 公式的具体维度

下一篇:**08 PagedAttention** — 朴素实现把 KV 当连续显存预留 max_seq_len,浪费高达 80%;vLLM 借鉴操作系统虚拟内存,把 KV 切成固定大小的 block,逻辑序列通过 Block Table 索引到物理块,碎片消失,Copy-on-Write 让并行采样共享前缀,Prefix Cache 让多请求复用系统提示。
