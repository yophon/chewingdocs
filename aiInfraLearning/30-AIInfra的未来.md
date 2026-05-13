# AI Infra 的未来:已经在路上的几件事

写到第 30 篇,系列收尾。回到 00 写作计划那张图——硬件心智 → 推理引擎 → 训练并行 → 量化 → 调度平台 → 端到端工程,六层一路画下来,你应该能在白板前讲清楚一家 AI 公司从 GPU 选型到上线 SLO 的全流程。这一篇不预言十年,只挑 2025-2026 已经在主流公司落地或方向明确的六件事——它们改写的是接下来 2-3 年 AI Infra 工程师每天要打交道的栈,不是科幻小说。

> 一句话先记住:**(1) Disaggregated Prefill-Decode 把推理拆两组卡;(2) Hybrid Attention+Mamba 啃长上下文;(3) 多模态推理需要变长 prefill;(4) Agent 工作负载逼调度器重写;(5) Blackwell + GB200 NVL72 把单卡训练单元抬到机柜级;(6) PyTorch FSDP2 + DTensor + torch.compile 在收编 DeepSpeed / Megatron**——这六件事不需要等,2026 年都已经在生产里跑。

---

## 一、Disaggregated Prefill-Decode:推理拆两组卡

### 1.1 现状的痛

03 篇就讲过 Prefill 与 Decode 是两种完全不同的工作负载:

```
Prefill:    compute-bound,大 GEMM,把 Tensor Core 跑满
Decode:     memory-bound,小 GEMV,把 HBM 带宽跑满
```

把它俩塞同一张 GPU 上,**互相拖累**:

- Prefill 来一个长 prompt,decode 队列被它阻塞 1-3 秒,其他用户 TPOT 抖动
- Decode 占 KV cache 没释放,新 prefill 没 slot 进来
- Tensor Core 和 HBM 带宽轮流被打满,但**没有任一时刻两者同时跑满**

vLLM 的 Continuous Batching + Chunked Prefill 部分缓解了这个问题(详见 09 篇),但治标不治本——**两阶段的硬件瓶颈本质就不该共享一张卡**。

### 1.2 方向:物理拆分

```
                   ┌─────────────────────────────────┐
                   │      边缘网关 / Router          │
                   └────────┬───────────────┬────────┘
                            │ prefill       │ decode 任务
                            ▼               ▼
              ┌─────────────────────┐   ┌─────────────────────┐
              │   Prefill Pool      │   │   Decode Pool       │
              │   ──────────────    │   │   ──────────────    │
              │   GPU: 算力优化型    │   │   GPU: 显存优化型    │
              │   B200 / H200       │   │   H100 / H200       │
              │   配比:1            │   │   配比:3-5          │
              │                     │   │                     │
              │   一次过 prompt,    │   │   接 KV 后做长 decode│
              │   产出第 1 token + │   │   持续到 EOS         │
              │   完整 KV cache     │   │                     │
              └──────────┬──────────┘   └─────────────────────┘
                         │ KV transfer (NVLink / RDMA)
                         │  ── 这块的工程化是核心难点 ──
                         │
                         └──────────→  Decode Pool 接收 KV
```

**几个具体实现**:

- **NVIDIA Dynamo**(2024 年 GTC 发布,2025 GA):NVIDIA 官方的 disaggregated 推理框架,接 vLLM / SGLang / TRT-LLM 后端,KV transfer 走 NIXL / NVLink Switch
- **Mooncake**(月之暗面 2024 论文 + 开源):Kimi 内部生产架构,KV pool 分层(GPU HBM → CPU DRAM → SSD),长 prompt 复用率显著提升
- **DistServe**(UCSD 2024 论文):学术方向的代表,详细分析了哪些场景拆分有正收益(长 input + 短 output 收益最大)
- **vLLM 0.7+ disaggregated 模式**:社区版本陆续合入

### 1.3 何时拆,何时不拆

| 工作负载 | 拆 vs 合 | 原因 |
| --- | --- | --- |
| 长 prompt 短输出(RAG / 摘要) | **拆**收益大 | prefill 重,decode 轻,资源失衡严重 |
| 短 prompt 长输出(写代码 / 故事) | **合**就行 | prefill 几乎可忽略,拆反而引入 KV transfer 开销 |
| 多轮对话(prompt 越来越长) | **拆**收益大 | 每轮都重 prefill 一段,prefill 池能批处理 |
| 极低 QPS(< 10 RPS) | **合** | 拆带来运维复杂度,QPS 不够摊不开 |
| Agent(工具反复调用) | **拆 + Prefix Cache** | KV 复用是关键,见后面第 4 节 |

**别盲目跟风**——大部分小团队继续 vLLM Continuous Batching,该升级到 Disaggregated 通常是 QPS 和 prompt 长度都到一定规模后才有收益。

---

## 二、长上下文专用栈:Attention 不再独大

### 2.1 现实

128K-1M context 在 2025-2026 已经从"卖点"变成"标配"——Gemini 2 / Claude 3.7 / Llama 4 / Qwen 3 都在 1M 量级。但 KV 显存和 attention 算力都是"线性 ~ 二次"涨:

```
单 token KV (70B,FP8 KV)    ≈ 160 KB
1M context KV               = 1M × 160 KB = 160 GB
                              ── 比模型权重 (140 GB) 还大
                              
Attention 算力               ≈ O(S² × d)
S = 4K  时 attention ≈ 5%   总算力
S = 128K 时 attention ≈ 60% 总算力
S = 1M  时 attention ≈ 95% 总算力
                              ── attention 把所有算力都吃了
```

### 2.2 两个方向

**方向 A:工程化撑住 attention**

详见 18 篇序列并行:

- Ring Attention:把 S 维度切到多卡,环状传 KV
- Ulysses Sequence Parallel:沿 head 维度切,每卡只算自己那部分 head
- Flash Attention 3:在 H100 上把 attention IO 优化到接近峰值
- KV 量化(详见 23 篇):FP8 / INT4 KV 砍 byte
- Prefix Cache + KV pool 复用

**这条路径在 2025-2026 仍然是主流**——主流厂商先靠工程把 1M context 撑住。

**方向 B:架构上换掉 Attention**

- **Mamba / Mamba-2**:状态空间模型,O(N) 推理,SSM 状态固定大小
- **RWKV** v6/v7:线性 attention 变种,KV 不随 seq 增长
- **xLSTM**:LSTM 的现代化,长上下文友好
- **Linear Attention 系列**(GLA / RetNet 等)

但这些纯线性架构在 2025-2026 仍没完全替代 Transformer——召回精度在长上下文有损失。

**当前主流答案是 Hybrid**:

```
模型每 N 层里:
   N-1 层 Mamba / 线性注意力 (O(N) 推理)
       1 层 Full Attention (保留细节召回能力)
       
代表:Jamba (AI21,2024)、Zamba (Zyphra)、Falcon-H1、Nemotron-H、
     Mistral 的 Codestral-Mamba、商汤 Sensetime 内部模型
     
2025-2026 进展:
   - 新发布的中等规模模型(7B-30B)有相当比例采用 Hybrid
   - 主流推理引擎(vLLM / SGLang)开始支持 Hybrid 架构
   - Hybrid 模型 KV 占用是纯 Transformer 的 1/4 - 1/8
```

**对工程师的影响**:推理栈要支持「不同层不同 KV 形状」,vLLM 的 PagedAttention 假设每层 KV 等大,Hybrid 时代要重写——已经在做。

---

## 三、多模态推理:变长 prefill 是新常态

### 3.1 token 化变了

文本 LLM 时代,prompt 长度可控(几百到几千 token)。多模态把这个假设打掉:

```
单图 (224×224, ViT-L 切 patch):     ~ 256 token
高清图 (1024×1024):                  ~ 4096 token
PDF 文档(10 页 × 高清):             ~ 40000 token
1 分钟视频 (1 fps + token 化):       ~ 15000 token
1 小时视频:                          ~ 900000 token
```

**单次请求的 prompt 长度暴涨 10-1000 倍**——多模态 prefill 经常单条就几十万 token。

### 3.2 推理栈的连锁反应

```
传统 LLM 推理路径:
   Tokenizer ── 输出 token id 序列 ── LLM ── 输出 token

多模态推理路径:
   ┌─ 文本 tokenizer ──────────────┐
   │                              ├──→ 拼成统一 token 序列 ──→ LLM ──→ 输出
   ├─ 图像 encoder (ViT/SigLIP) ──┤      │
   │                              │      │
   ├─ 视频 encoder (帧抽样)──────┤      KV cache 形状各异
   │                              │      (prefill 时每段独立 encode)
   └─ 音频 encoder (Whisper-like)─┘
```

**工程难点**:

- Encoder + LLM 解耦部署:Encoder 是 compute-bound,LLM decode 是 memory-bound,放同一卡互相拖累(类似 disaggregated prefill-decode)
- 变长多模态 prefill:同一 batch 里有人传文本、有人传图、有人传视频,batch 调度器要做 token-level packing
- KV cache 跨模态共享:同一段视频不同问题,encoder 输出可缓存复用

### 3.3 当前现状

- vLLM 0.6+ / SGLang 在 2024 大力补多模态;**2025-2026 多模态推理引擎仍在快速演进**——主流推理引擎都还没到完全成熟
- TRT-LLM 多模态 pipeline 在 NVIDIA 自家 demo 完整,生态外用得少
- Production-ready 的多模态推理服务,大部分公司还是「Encoder 一组 K8s 服务 + LLM 一组 K8s 服务 + 自己拼路由」

**预计 2026-2027 多模态推理引擎才会进入"像 vLLM 之于纯文本"的成熟度**。

---

## 四、Agent 工作负载:重写调度器的需求

### 4.1 Agent 推理跟传统 chat 完全不同

```
传统 chat 推理形状:
   prompt → 一段 decode → 完
   一次请求,线性 token 流出

Agent 推理形状:
   ┌─ prompt + tools list ─→ decode 一段 (要不要用 tool?) ─→
   │                                                       │
   │   ↓ 用 tool                                           ↓ 不用,直接出
   │                                                       
   ├─ 拼接 tool 结果 ─→ decode 一段 (下一步?) ─→
   │                                            
   └── 反复 5-50 轮 ────────────────────────→ 最终答案
   
   每轮:  prompt 越来越长(累积上下文)
          需要重新 prefill 新增的部分
          KV cache 高度可复用(前缀完全一样)
```

### 4.2 现有引擎的不适配

- 假设「一次请求一段输出」:Agent 一次"用户请求"对应几十段 LLM 调用
- 假设「prefill 不重复」:Agent 每轮都要 prefill 新增的 tool result
- batch 调度器按 request 维度调,Agent 场景按 trace 维度更合理

### 4.3 已有的工程答案

| 技术 | 解决什么 | 出自第几篇 |
| --- | --- | --- |
| **RadixAttention(SGLang)** | 多轮 KV 前缀树共享,前缀完全相同时几乎 0 prefill | 10 |
| **Prefix Caching** | 同 system prompt 跨请求复用 KV | 08 |
| **投机解码** | 工具调用场景输出格式固定,draft 模型接受率特别高 | 11 |
| **Disaggregated KV pool** | KV 跨副本共享,Agent trace 漂移到不同副本仍命中 | 本篇 1.2 |
| **Continuous Batching 改造** | 把 Agent 多轮拍成可调度单元 | 09 |

**SGLang 在 Agent 场景的优势在 2025-2026 越来越明显**——RadixAttention + 结构化输出 (regex / JSON schema) + Frontend DSL,基本就是为 Agent 设计的。vLLM 也在快速补这块。

### 4.4 长期方向

```
Agent-aware scheduler 的几个方向(都还在演进):
   - trace-level scheduling:把一个 Agent 整段 trace 当调度单元
   - speculative agent:小模型并行猜下几步要调什么 tool
   - tool result caching:相同 tool 调用结果跨 trace 复用
   - 模型 + tool 联合优化:tool 选择本身用更小的模型
```

这块还在快速变化,2026 之后会有更明确的工程范式。

---

## 五、硬件层:Blackwell 已上,机柜成新单元

### 5.1 Blackwell 代次的实际含义

```
Hopper (H100/H200, 2022-2024):
   FP16 989 TFLOPS, FP8 1979 TFLOPS
   
Blackwell B100 / B200 (2024-2025):
   FP8 ~ 2.2x H100
   FP4 / FP6 新增,推理理论吞吐再翻倍
   单卡 192 GB HBM3e
   
GB200 = Grace CPU + 2 × B200,NVLink-C2C 全互联
```

**对工程师的实际影响**:

- 推理:**FP4 在 2025-2026 进入生产**(主流推理引擎陆续支持),70B 推理吞吐对比 H100 FP8 可观提升,精度损失需要逐模型评估
- 训练:FP6 / FP4 训练仍在探索,主流训练栈 2026 年仍然 FP8 为主
- 单卡装得下 70B 不量化:192 GB HBM3e 让模型部署更灵活

### 5.2 GB200 NVL72:机柜级训练单元

```
GB200 NVL72 一个机柜:
   - 36 × Grace CPU + 72 × B200 GPU
   - NVLink Switch 把 72 张卡连成全互联
   - 跨卡带宽 1.8 TB/s(单卡对全卡)
   - 等效一个超大的"单 GPU",13.5 TB HBM
   
意义:
   - 千亿模型可以单机柜 TP=72 + 不跨节点
   - 跨节点 IB 通信瓶颈被推到机柜外
   - "单训练单元"从 8 卡升到 72 卡
```

**对调度的影响**:

- Slurm 的拓扑感知要识别"机柜"这一级
- 任务调度按机柜分配,而非按节点
- 千卡训练 = 14 个机柜,跨机柜才走 IB

2025 年这种机柜在 OpenAI / Meta / xAI / Anthropic 已部署。**2026 年的 1000+ 节点训练集群,主流形态是 NVL72 机柜组成的 multi-rack 架构**。

### 5.3 推理专用 ASIC

| 厂商 | 路线 | 现状 |
| --- | --- | --- |
| Groq LPU | 极致低延迟 decode | 单 token 延迟优势明显,生态在补 |
| Cerebras | Wafer-scale,长序列 | 推理服务 API 在跑 |
| SambaNova | RDU 架构,定制大模型推理 | 部分企业客户落地 |
| Tenstorrent | Wormhole / Blackhole,RISC-V + AI | 开源栈,在快速演进 |
| AWS Trainium / Inferentia | 云上自研 | AWS 自家服务在用 |
| Google TPU | 长期主线 | TPU v5p / v6 训推一体 |

**2025-2026 的现实**:

- 训练几乎仍是 NVIDIA(>90% 市场)
- 推理 ASIC 在长尾场景吃份额(低延迟 chat / 边缘部署 / 自家云)
- TPU 在 Google 内外稳定占一块
- **NVIDIA 在通用栈上的护城河仍很深**——CUDA / NCCL / Triton / cuDNN 整套生态难以短期替代

---

## 六、训练栈在收敛:PyTorch 一统

### 6.1 过去几年的混乱

```
2020-2024 训练栈:
   - DeepSpeed (ZeRO)         微软主导,优化器分片(详见 14 篇)
   - Megatron-LM (3D 并行)    NVIDIA 主导,TP+PP(详见 16/17 篇)
   - FSDP (PyTorch 原生)      易用但功能落后(详见 15 篇)
   - JAX + GSPMD              Google 系,自动并行
   - ColossalAI / OneFlow     第三波,小众

70B 训练经常 DeepSpeed + Megatron 混搭——配置复杂,bug 多。
```

### 6.2 PyTorch 2.x 的整合

PyTorch 在 2024-2025 系统性吸收这些能力:

- **FSDP2**(2024):重写 FSDP,API 简化、性能赶上 ZeRO-3
- **DTensor**(2023+):分布式 Tensor 抽象,TP / PP / DP 用同一套 API 表达
- **torch.compile**:编译器后端,部分替代 Megatron 的手写 fused kernel
- **TorchTitan**(2024):Meta 出的训练参考实现,纯 PyTorch 跑 405B 训练

```
2026 训练栈正在收敛到:
   PyTorch FSDP2 + DTensor + torch.compile
   ├── 大部分场景纯 PyTorch 就够
   ├── 极致 perf 仍叠加 Megatron / TE 的 fused kernel
   └── DeepSpeed 部分功能(ZeRO 系列)逐步在 FSDP2 里有等价实现
```

### 6.3 训练 / 推理共享并行抽象

更深远的变化:**训练和推理用同一套并行抽象**——DTensor。

```
过去:
   训练:DeepSpeed ZeRO-3 切权重
   推理:vLLM / TRT-LLM 自己一套 TP 切权重
   两边切片方式不一样,模型从训练到推理要"换装"
   
未来:
   训练 / 推理 / 微调全用 DTensor 描述切分
   ckpt 直接通用,部署不需要 reshard
   
   2025 进展:torchtitan + vLLM 在做兼容
   2026-2027 进入主流栈
```

**对工程师的影响**:训练 / 推理 / 微调三个角色之间的栈隔阂在变薄,同一个 ckpt 能在三个场景直接用——再也不需要训练完先 convert 给推理引擎用。

---

## 七、不会发生的几件事

为了不变成预言家,**点几个 2025-2026 不会发生**的事:

| 不会发生 | 原因 |
| --- | --- |
| Transformer 被完全替代 | Hybrid 是过渡形态,纯 Mamba/RWKV 召回能力短期赶不上 |
| NVIDIA 失去训练市场主导 | CUDA + NCCL + 生态护城河 5 年内难破 |
| 推理硬件 ASIC 大规模替代 GPU | 通用性不够,生态需要时间 |
| 端侧大模型替代云推理 | 60B+ 仍然在云上,端侧只啃 7B 量级 |
| 训练成本大幅下降 | 模型规模继续涨,卡数一起涨,总成本不会降 |
| K8s 替代 Slurm 在大训练集群 | 千卡训练上 Slurm 仍稳坐 |
| Python 在 AI Infra 退场 | 推理 / 训练上层永远是 Python,Rust / C++ 在 kernel / runtime |
| 「AGI 元年」 | 不在工程师讨论范畴 |

---

## 八、这一系列你已经走完

30 篇打完,回到 00 篇立的目标——你应该能在白板前讲清楚:

**指标 1**:看完 06-12 + 13-19 这 14 篇——
- ✓ 为什么 vLLM 比 HuggingFace `generate` 吞吐高 10 倍,代价是什么(06-09)
- ✓ 为什么 70B 推理需要 2 张 80GB H100,KV Cache 占了多少(07-08)
- ✓ 为什么千卡训练 70B 必须 TP + PP + DP 三路并行,只用 DDP 死在哪(13-18)
- ✓ 为什么 FSDP 中等规模够用,百亿以上还得切 Megatron + DeepSpeed(15-17)

**指标 2**:加上 20-30 这 11 篇——
- ✓ GPTQ / AWQ / FP8 各降本多少,精度掉多少,什么场景选哪个(20-22)
- ✓ Ray Serve + vLLM 上线一个 LLM 服务,扩缩容怎么配,冷启动怎么解(25-27)
- ✓ 千张 H100 训一周成本多少,推理服务每千 token 成本多少,瓶颈在哪步(29)
- ✓ Disaggregated Inference 为什么是下一站,跟连续批是什么关系(本篇)

**两题都能答清楚,这系列就值了**——这是 00 篇里立的目标。

### 8.1 与其他系列的连接

AI Infra 不是孤立的——它在一张大网的中间:

```
            aiLearning (模型本身:Transformer / SFT / RLHF / RAG)
                              │「模型是什么」
                              ▼
            aiInfraLearning (本系列:硬件 / 引擎 / 并行 / 调度 / 成本)
                              │「怎么把它跑起来」
        ┌────────┬────────────┼────────────┬────────┐
        ▼        ▼            ▼            ▼        ▼
   dataEngineering  devopsLearning  networkLearning  osLearning
   (数据进/评测出)   (监控/SLO/FinOps)  (IB/RDMA/拓扑)  (GPU 调度/IO)
                              │
                              ▼
            backendLearning + distributedLearning (服务化外层)
```

- **aiLearning 教模型本身,aiInfraLearning 教怎么把它跑起来**——同一个模型,在 H100 以 FP8 跑、用 vLLM 服务化、千卡训练,是两层完全不同的工程问题
- **dataEngineering**:训练数据从哪来、评测数据怎么入仓——本系列 29 谈推理时只点数据 SLA,真正在那边讲透
- **devopsLearning**:SLO、告警、Tracing、FinOps 的方法论直接用,本系列 29 只补 LLM 特有指标(TTFT / TPOT / KV 占比)
- **networkLearning**:network 讲协议本身,本系列 19 讲拓扑对训练吞吐的影响
- **osLearning**:os 讲操作系统底座,本系列 02 把 GPU 心智用 CPU 做对照
- **distributedLearning**:它讲共识、容错、一致性,本系列 13-19 的 collective 通信是它的姊妹问题

### 8.2 一个 AI Infra 工程师的图景

走完这一系列,你站在白板前应该能从零画出一家 AI 公司的完整工程链:

```
GPU 选型(02-05)
  → 训练并行策略(13-19)
  → 训练集群调度(28 Slurm)
  → 模型 ckpt
  → 量化 / 压缩(20-24)
  → 推理引擎选型(06-12)
  → 推理服务化(25-27)
  → 成本与 SLO(29)
  → 未来演进(30)
```

每一步你都能讲出**上一代死在哪、这一代赢在哪、下一步往哪走**——这就是 AI Infra 工程师的图景。**vLLM / SGLang / DeepSpeed / Megatron / Ray / Slurm / FP8 / PagedAttention 不再是"听过的名词"**,而是知道每个东西解决什么瓶颈、什么时候上、什么时候是过度工程。

---

## 九、看完这一篇,你应该能

- 解释 Disaggregated Prefill-Decode 解决什么问题,长 prompt 短输出场景为什么收益最大
- 默写长上下文的两条路径:工程化撑(Ring / Sequence / Flash3 / KV 量化)vs 架构换(Mamba / Hybrid)
- 解释多模态推理为什么把变长 prefill 推到极致,encoder 为什么需要解耦部署
- 列出 Agent 工作负载与传统 chat 推理的三个不同(多轮、prefix 复用、trace 级调度)
- 知道 Blackwell 在 FP4/FP6 上带来的推理加速大致量级,GB200 NVL72 把训练单元抬到机柜级
- 理解 PyTorch FSDP2 + DTensor + torch.compile 的整合方向,以及它如何让训练 / 推理共享并行抽象
- 把 aiInfraLearning 与 aiLearning / dataEngineering / devopsLearning / networkLearning / osLearning 在白板上串成一张图

---

30 篇收尾。系列写作计划与立场边界在 [`00-写作计划.md`](00-写作计划.md),回头能回看每篇的设计意图与「不写什么」的反对清单。AI Infra 这一层在 2026 仍在快速演进,**底子稳的部分是 KV / Continuous Batching / 3D 并行 / Slurm / 成本核算这套思维**——工具会换名字,问题不会。
