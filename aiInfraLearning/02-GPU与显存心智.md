# GPU 与显存心智:为什么 LLM 推理是 memory-bound

打开 nvidia-smi 看一个 70B 推理服务,**SM 利用率经常只有 30-50%,但显存被吃满**。这不是程序写得差,是 LLM 推理的工作负载本来就是这样:每生成一个 token,要把整个模型权重从 HBM 读到 SM 算一遍,**绝大部分时间花在搬数据,不在算**。算力(FLOPS)便宜得多,**显存容量和 HBM 带宽才是真正稀缺的资源**。这一篇把 GPU 解剖一遍,讲清为什么 LLM 推理永远卡在 memory 这一头。

> 一句话先记住:**LLM 推理 decode 阶段的算术强度只有 2 FLOP/byte 左右,远低于现代 GPU 的拐点(H100 ≈ 295 FLOP/byte)——这意味着算力再大也用不上,瓶颈永远在 HBM 带宽和容量**。所有推理引擎的优化(PagedAttention / Continuous Batching / 投机解码 / FP8 KV / Prefix Cache)本质都在做一件事:**让有限的显存搬运更多有用的 token**。

---

## 一、为什么 GPU 值得单独一章

CPU 工程师看 GPU 容易犯三类错:

1. **以为"GPU 快"就是"FLOPS 大"**——但 LLM 推理 90% 时间不在算
2. **以为"显存 = 内存的更快版"**——但 HBM 带宽和算力的比例跟 DRAM/CPU 完全不同
3. **以为"显卡分配空间和 malloc 差不多"**——但 KV Cache 的动态增长能在几秒内把卡撑爆

**LLM 工程上 90% 的故障都和显存相关**:OOM、KV Cache 满了、并发数上不去、首 token 慢、长 prompt 算不动。**搞清楚显存和带宽,这一系列后面所有章节才有支点**。

---

## 二、GPU 解剖:从一张 H100 说起

### 2.1 整体结构

```
┌──────────────────────────────────────────────────────────┐
│                    H100 SXM5 (整体)                       │
│                                                           │
│   ┌──────────────────────────────────────────────────┐   │
│   │   SM (Streaming Multiprocessor) × 132 个         │   │
│   │   ┌────────────────────────────────────────────┐ │   │
│   │   │  一个 SM 内部:                             │ │   │
│   │   │   - 128 CUDA Core (FP32 通用算)            │ │   │
│   │   │   - 4 个 Tensor Core 单元 (矩阵乘加)       │ │   │
│   │   │   - 共享内存 / L1 Cache 合计 228 KB        │ │   │
│   │   │   - 寄存器文件 256 KB                      │ │   │
│   │   │   - Warp Scheduler × 4 (每 Warp 32 线程)   │ │   │
│   │   │   - Tensor Memory Accelerator (TMA, Hopper)│ │   │
│   │   └────────────────────────────────────────────┘ │   │
│   └──────────────────────────────────────────────────┘   │
│                            │                              │
│              ┌─────────────────────────┐                  │
│              │  L2 Cache (50 MB,全卡共享) │              │
│              └─────────────────────────┘                  │
│                            │                              │
│         ┌───────────────────────────────────┐             │
│         │  HBM3 (80 GB,带宽 3.35 TB/s)     │             │
│         │  分成多个独立通道并发访问         │             │
│         └───────────────────────────────────┘             │
│                            │                              │
│   NVLink 4 (900 GB/s)  ←→  其他 GPU(节点内 8 卡互联)     │
│   PCIe Gen5 (128 GB/s) ←→  CPU                            │
└──────────────────────────────────────────────────────────┘
```

### 2.2 几个关键名词,搞清楚就够了

| 名词 | 是什么 | 工程上需要知道什么 |
| --- | --- | --- |
| **SM** | GPU 的"核",H100 有 132 个 | SM 占用率(Occupancy)看是不是被任务塞满,推理时常常没塞满 |
| **CUDA Core** | SM 内的 FP32 算术单元 | 通用计算,但 LLM 主要不靠它 |
| **Tensor Core** | 矩阵乘加专用单元,4×4 或 8×8 块为单位 | LLM 的所有 matmul 都跑在这,**FP8 算力是 FP16 的 2 倍** |
| **Warp** | 32 个线程为一组,SIMT 一起跑 | 写 kernel 才关心;推理用户基本不碰 |
| **共享内存 / L1** | SM 内部高速 SRAM,228 KB | FlashAttention 之所以快,就是把 attention 整块塞进共享内存 |
| **L2 Cache** | 全 GPU 共享 SRAM,H100 上 50 MB | 多个 SM 协作时缓存中间结果;Hopper 上可以"刻意保留"某块 |
| **HBM** | 高带宽显存,80-192 GB | **LLM 推理的真正主战场**,容量决定能放多大模型 + 多少 KV |
| **NVLink** | 节点内 GPU 互联,H100 上 900 GB/s | TP / PP 跨卡通信走它,**节点内 ≠ 节点间** |

### 2.3 SIMT 执行模型

GPU 不是把 1 个任务跑得飞快,而是**把 10 万个相同任务并行跑**。CPU SIMD 是 4-16 通道,GPU SIMT 一次跑数万线程。

```
CPU SIMD (AVX-512):
   1 条 SIMD 指令 × 16 个 FP32 = 一次 16 个通道
   靠核数 × 频率扩展

GPU SIMT (H100):
   132 SM × (128 CUDA Core + 4 Tensor Core) × 数千线程
   靠"同时塞极多任务"扩展
```

这就是为什么 GPU **跑 matmul 飞快**(一万个 (i, j) 输出并行),**跑分支多的程序很慢**(同一 warp 内不同线程走不同分支,串行执行)。

---

## 三、显存层级:从寄存器到 HBM

显存不是单一存储,而是分了好几级,**离 SM 越近越快越小**:

```
┌─────────────────────────────────────────────────────────┐
│   寄存器 (per-thread)         ~256 KB / SM,~ns          │  ← 最快
│       ↕                                                  │
│   共享内存 / L1 (per-SM)       228 KB / SM,~10ns        │
│       ↕                                                  │
│   L2 Cache (全卡共享)          50 MB,~30ns             │
│       ↕                                                  │
│   HBM3 (全卡共享)              80 GB,~200ns,3.35 TB/s │
│       ↕                                                  │
│   NVLink 跨卡                  ~600ns,900 GB/s          │
│       ↕                                                  │
│   IB / RoCE 跨节点             ~2μs,400 Gbps           │  ← 最慢
└─────────────────────────────────────────────────────────┘
```

| 层 | 容量 | 延迟 | 带宽 | 谁负责放数据 |
| --- | --- | --- | --- | --- |
| 寄存器 | 256 KB/SM | < 1ns | 极高 | 编译器自动 |
| 共享内存 | 228 KB/SM | ~10ns | 高 | Kernel 显式 `__shared__` |
| L2 | 50 MB | ~30ns | 高 | 硬件自动 + Hopper 可显式 |
| HBM | 80-192 GB | ~200ns | 3-8 TB/s | `cudaMalloc` |
| NVLink | 其他卡的 HBM | ~600ns | 900 GB/s | NCCL / cuMemRDMA |

**LLM 推理的核心矛盾**:模型权重存在 HBM,每次计算要搬到 SM,**HBM 带宽是天花板**。FlashAttention 的核心招数就是:把 attention 中间矩阵留在共享内存里算完,**永远不写回 HBM**。

---

## 四、主流 GPU 对比表(2026 视角)

数据来自 NVIDIA 官方 datasheet 和实测;`稀疏算力 = 密集 × 2`,以下都按密集算:

| GPU | 架构 | 上市 | FP16 TFLOPS | FP8 TFLOPS | HBM 容量 | HBM 带宽 | NVLink | TDP |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **A100 80GB** | Ampere | 2020 | 312 | — | 80 GB HBM2e | 2.0 TB/s | 600 GB/s | 400W |
| **H100 SXM5** | Hopper | 2022 | 989 | 1979 | 80 GB HBM3 | 3.35 TB/s | 900 GB/s | 700W |
| **H200 SXM5** | Hopper | 2024 | 989 | 1979 | 141 GB HBM3e | 4.8 TB/s | 900 GB/s | 700W |
| **B100 SXM** | Blackwell | 2025 | 1800 | 3500 | 192 GB HBM3e | 8.0 TB/s | 1.8 TB/s | 700W |
| **B200 SXM** | Blackwell | 2025 | 2250 | 4500 | 192 GB HBM3e | 8.0 TB/s | 1.8 TB/s | 1000W |
| **GB200 NVL72** | Blackwell + Grace | 2025 | 单卡同 B200 | 单卡同 B200 | 192 GB × 72 卡 | 8 TB/s | 整机柜共享 | 整柜级 |
| **RTX 4090** | Ada | 2022 | 165 | 330 | 24 GB GDDR6X | 1.0 TB/s | 无 | 450W |
| **RTX 5090** | Blackwell | 2025 | 209 | 419 | 32 GB GDDR7 | 1.79 TB/s | 无 | 575W |

**怎么读这张表**:

1. **A100 → H100**:FP16 算力 3.2x,HBM 带宽 1.7x。从 Hopper 起 **FP8 落地**,推理实际吞吐再 2x
2. **H100 → H200**:算力不变,**HBM 1.76x 容量 + 1.43x 带宽**——典型为长上下文 LLM 推理服务
3. **H200 → B200**:算力 2.3x,容量 1.36x,带宽 1.67x——**Blackwell 把架构平衡又拉回算力一侧**
4. **数据中心卡 vs 消费卡**:H100 vs 4090,FP16 算力 6x,HBM 容量 3.3x,**带宽 3.35x**——NVLink 才是真正的代差,4090 单卡只能跑小模型

**为什么 H200 是 LLM 推理的甜点**:**显存大 + 带宽大,算力够用**——LLM decode 反正用不满算力,容量和带宽是直接收益。一张 H200 单卡能装下 70B FP8(70 GB)+ 几十个并发的 KV,A100 装不下,H100 紧绷。

**B200 的意义**:训练大模型(算力提升 + 显存翻倍 + NVLink 翻倍)。推理上 B200 不一定线性收益——decode 仍 memory-bound,算力的提升用不上,带宽提升才是 LLM 推理的实际收益。

---

## 五、Roofline 模型:一张图看懂"瓶颈在哪"

### 5.1 算术强度 (Arithmetic Intensity)

```
算术强度 = 算的次数 (FLOP) / 搬的数据量 (Byte)
        ≈ "每搬一个字节做几次运算"
```

- 矩阵乘 (matmul) M=N=K:**算术强度 ≈ N**(大矩阵高,小矩阵低)
- Attention(Q × K^T × V):取决于 seq_len 和 batch
- **LLM Decode 阶段每生成 1 个 token**:`FLOP ≈ 2 × P`(P 是参数量),`Byte ≈ P × byte_per_param`,**算术强度 ≈ 2 / byte_per_param**

### 5.2 Roofline 图

```
性能 (FLOP/s)
     ↑
     │
Peak │                       ┌─────────────────────────  Peak FLOPS 上限
     │                      ╱
     │                     ╱
     │                    ╱  ← Compute-bound 区
     │                   ╱     (算力打满)
     │                  ╱
     │                 ╱
     │                ╱
     │               ╱
     │              ╱
     │             ╱  ← Memory-bound 区
     │            ╱     (带宽打满)
     │           ╱
     │          ╱
     │         ╱
     │        ╱
     │       ╱
     │      ╱
     └─────┴────────────────────────────────────→ 算术强度 (FLOP/Byte)
           ↑
        拐点 = Peak FLOPS / HBM Bandwidth

   H100 (FP16):  989 TFLOPS / 3.35 TB/s ≈ 295 FLOP/Byte
   H100 (FP8):   1979 TFLOPS / 3.35 TB/s ≈ 591 FLOP/Byte
   H200 (FP16):  989 TFLOPS / 4.8 TB/s ≈ 206 FLOP/Byte
   B200 (FP16):  2250 TFLOPS / 8.0 TB/s ≈ 281 FLOP/Byte
   A100 (FP16):  312 TFLOPS / 2.0 TB/s ≈ 156 FLOP/Byte
```

**读法**:横轴是任务的算术强度,纵轴是能跑出来的性能。算术强度 < 拐点 → 卡在带宽上(memory-bound);> 拐点 → 卡在算力上(compute-bound)。

### 5.3 LLM 落在哪

把不同工作负载标到 Roofline 上:

```
工作负载                            算术强度 (FP16)    位置
────────────────────────────       ──────────       ────────
LLM Decode (batch=1)              ~ 2                极左,memory-bound
LLM Decode (batch=32)             ~ 64               左侧,memory-bound  
LLM Decode (batch=256, FP8)       ~ 256              接近拐点
LLM Prefill (batch=1, S=4096)     ~ 256              接近拐点
LLM Prefill (batch=32, S=4096)    ~ 1000             右侧,compute-bound
训练 forward (大 batch)            ~ 1000+            compute-bound
训练 backward                      ~ 500+             compute-bound

         H100 拐点 ≈ 295 FLOP/Byte (FP16)
                   |
   Decode b=1   Decode b=32  | Prefill   训练
       ●            ●        |   ●        ●
   ────●────────────●────────|───●────────●─────→
                             ↑
                          拐点
```

**关键观察**:

- **Decode batch=1 是最惨的工况**——算力跑不出 1%,纯靠 HBM 带宽
- **加大 batch 是把 decode 拖到拐点的最直接办法**——同一份权重供更多请求复用,算术强度线性涨。这就是 **Continuous Batching 的本质**(09 篇)
- **Prefill 天然 compute-bound**——一个长 prompt 一次性算完,矩阵很大,Tensor Core 跑满
- **FP8 把拐点右移**——同样的工作负载更容易落在 memory-bound,因此 FP8 对 prefill 加速明显,对 decode 加速主要来自"每参数搬运的字节少了一半"

---

## 六、显存账:LLM 推理到底吃多少

### 6.1 一个 70B 模型推理的显存构成

以 70B FP16 为例,单卡 H100 80GB 装不下,需要 2 张 TP 切:

```
模型权重 (FP16):  70B × 2 bytes = 140 GB    跨 2 张 H100 各 70 GB
KV Cache (每请求每 token):
   每层 KV = 2 × n_head × head_dim × 2 bytes
   70B 类模型: 每 token KV ≈ 320 KB (FP16)
   
   单请求 4K 上下文:        320 KB × 4096 ≈ 1.3 GB
   并发 32 请求 × 4K:        32 × 1.3 GB ≈ 42 GB
   并发 32 请求 × 32K:       32 × 10.5 GB ≈ 336 GB  ← 装不下!

激活 (临时):              ~ 几 GB,通常忽略
Workspace / 临时 buffer:  ~ 2-4 GB
```

**两个直觉**:

1. **长上下文是显存杀手**——KV 随 seq_len 线性增长,32K 上下文的 KV 能占到模型本身的几倍
2. **并发数被 KV 卡住**——不是 SM 不够,是 KV 装不下;**这就是 PagedAttention 要解决的问题**(08 篇)

### 6.2 训练显存构成

同样 70B,训练显存账完全不同(03 篇展开):

```
模型权重 (FP16):           140 GB
梯度 (FP16):               140 GB    ← 推理没有
优化器状态 (Adam FP32):     560 GB   ← 推理没有,Adam 是 2x params 的 momentum + variance
激活 (用于 backward):      取决于 batch 和 seq_len,几十到几百 GB
─────────────────────────────────────
总计:                      ~ 1 TB+   一张 80GB H100 远远装不下
```

**这就是 ZeRO / TP / PP / FSDP 必须存在的原因**——把这 1TB 切到几十张卡上去(14-18 篇)。

---

## 七、计算 / 通信 / 存储三角

把 GPU 性能拆成三个维度,**任何工作负载都卡在其中一边**:

```
                    Compute (FLOPS)
                          ●
                        ╱ │ ╲
                       ╱  │  ╲
                      ╱   │   ╲
                     ╱  H100  ╲
                    ╱     │     ╲
                   ╱      │      ╲
                  ╱       │       ╲
                 ●────────┴────────●
            Memory                Comm
          (HBM 带宽)              (NVLink/IB)
```

不同工作负载偏向不同顶点:

| 工作负载 | 算力 | 带宽 | 通信 | 主要瓶颈 |
| --- | --- | --- | --- | --- |
| LLM Decode (batch 小) | 5% | 95% | 0% | HBM 带宽 |
| LLM Decode (batch 大) | 50% | 80% | 0% | 平衡偏带宽 |
| LLM Prefill | 80% | 60% | 0% | 算力 (单卡) |
| 训练 forward (单卡) | 90% | 50% | 0% | 算力 |
| 训练 backward (单卡) | 70% | 60% | 0% | 算力 |
| 多卡训练 AllReduce | 30% | 30% | 90% | 通信 |
| Pipeline 并行 | 50% | 30% | 70% | 通信 + 气泡 |

**LLM 工程的全部就是在这个三角里挪位置**:

- vLLM 把 decode 从 batch=1 的极端 memory-bound 拖到大 batch 的"还算合理"
- TP 把单卡 OOM 摊到多卡,代价是 AllReduce 通信
- FP8 把所有顶点都向"更便宜"侧推一格(参数小一半 + 算力翻倍)
- 投机解码把 decode 的 memory-bound 偷换成"少跑几次 decode"(11 篇)

---

## 八、CPU 心智 vs GPU 心智:别串

很多坑就是用 CPU 直觉套 GPU:

| 直觉 | CPU 上 | GPU 上 | 后果 |
| --- | --- | --- | --- |
| "加更多核就更快" | 大致成立 | 错——SM 已经够多,问题在喂得起 | 加 GPU 没用,SM 利用率仍低 |
| "分配内存是 O(1)" | 成立 | 错——`cudaMalloc` 慢且影响 stream | 频繁 alloc 拖垮服务 |
| "分支随便写" | 成立 | 错——Warp 内分支串行 | If 多的 kernel 慢得不可理喻 |
| "小数据并发好" | 成立 | 错——小矩阵跑不满 SM | batch=1 永远跑不满 GPU |
| "缓存命中靠 LRU" | 成立 | 部分——L2 也是 LRU,但容量太小 | 不能指望 70GB 模型靠 L2 |
| "内存够就行" | 成立 | 错——HBM 带宽决定速度 | 容量够但 step 时间慢 |
| "throughput = qps × 单次延迟" | 成立 | 错——decode 大 batch 时单次延迟和并发数解耦 | 容量规划算错 |

**最重要的一条**:CPU 工程师习惯把"算力"作为性能上限,GPU 工程师必须**把"HBM 带宽"作为第一性能维度**,FLOPS 是第二位的。

---

## 九、看完这一篇,你应该能

- 在白板画 GPU 解剖图:SM / Tensor Core / 共享内存 / L2 / HBM / NVLink 的层级关系
- 默写 A100 / H100 / H200 / B200 的算力和 HBM 带宽量级,知道为什么 H200 是 LLM 推理甜点
- 画 Roofline 模型,说清"算术强度 < 拐点 = memory-bound"
- 解释 LLM decode 为什么永远 memory-bound,batch 大了能拖到哪
- 算 70B 推理一个并发的 KV Cache 大约多少 MB(每 token ~320KB × seq_len)
- 看 nvidia-smi 知道 SM 利用率低 + 显存吃满意味着什么

下一篇:**03 训练与推理的根本不同** — 训练有反向 + 优化器状态,推理只有前向 + KV Cache;推理还要再切 Prefill(compute-bound)vs Decode(memory-bound)两阶段。**这个分界决定了后续所有优化的方向**:推理优化都在解 decode 的 memory-bound,训练优化都在解显存与通信。
