# ZeRO 三阶段:把训练显存切成 N 份

DDP 把 batch 横切让每卡分担,但**模型权重、梯度、优化器状态在每张卡上完整复制**——这是 7B 以上模型用纯 DDP 训不动的根本原因。ZeRO 是 DeepSpeed 团队 2019 年提出的方案,思路朴素:**这些复制的东西本来就是冗余,完全可以切到 N 卡上,要用的时候临时拼回来**。三阶段 ZeRO-1/2/3 一层层把可切的东西都切了,代价是多几次通信。

> 一句话先记住:**ZeRO = 把每卡冗余复制的「优化器状态 / 梯度 / 参数」按 N 卡切分,要用的时候 All-Gather 拼回来**。从 ZeRO-1 到 ZeRO-3,显存降得越多、通信代价越高。70B 训练单纯 DDP 直接 OOM,ZeRO-3 + offload 才让单节点都能塞下。

---

## 一、训练时显存到底花在哪四块

```
单卡训练显存 = 模型参数 + 梯度 + 优化器状态 + 激活/临时
              ─────────────────────────────  ─────────────
              这三块跟模型大小成正比          这块跟 batch / seqlen 成正比
              ZeRO 优化的就是这三块            激活由 checkpointing / SP 处理
```

每一块的来源:

| 块 | 是什么 | 怎么算 |
| --- | --- | --- |
| 模型参数 | 网络权重 | X B 参数 × 数据精度 |
| 梯度 | backward 算出的 ∂L/∂w | 跟参数等大 |
| 优化器状态 | Adam 的 momentum + variance(+ FP32 master weight) | Adam 下是参数本身的 4 倍(下节展开) |
| 激活/临时 | forward 中间输出 + 其他 buffer | 跟 batch、seqlen、模型架构相关 |

激活那块在 18 篇序列并行 / activation checkpointing 展开,本篇只讲前三块。

---

## 二、Adam 优化器的隐藏成本

新手最容易低估的就是优化器状态。**Adam 一份参数对应 2 份状态(一阶动量 m、二阶动量 v),且通常用 FP32 存,加上 FP32 主权重(master weight),合计 8 字节/参数**——比 BF16 参数本身(2 字节/参数)大 4 倍。

```
混合精度训练(BF16 forward / backward + FP32 update),X B 参数:

  模型参数 (BF16):       2X 字节/参数 → 2X GB
  梯度    (BF16):       2X 字节/参数 → 2X GB
  优化器状态 (Adam):
    FP32 master weight:  4 字节/参数
    FP32 momentum (m):   4 字节/参数
    FP32 variance (v):   4 字节/参数
                         合计 12 字节/参数 → 12X GB

光这三块加起来 = 16X GB(还没算激活和 KV)
```

X = 7 → 112 GB,**单张 80GB H100 直接装不下**。X = 13 → 208 GB,两张卡都装不下。

```
7B 模型 BF16 + Adam 训练,纯 DDP 时每卡显存:

  ┌────────────────────────┐
  │ 模型参数 (BF16):  14 GB │
  ├────────────────────────┤
  │ 梯度    (BF16):   14 GB │
  ├────────────────────────┤
  │ 优化器状态:               │
  │   master weight: 28 GB │
  │   momentum:      28 GB │
  │   variance:      28 GB │
  │   小计:          84 GB │
  ├────────────────────────┤
  │ 激活 + 临时:    视配置   │
  └────────────────────────┘
   前三块:14 + 14 + 84 = 112 GB,80GB H100 直接 OOM
```

这就是为什么「DDP + 7B」很多场景跑不动——不是模型太大,是优化器太胖。

> 题外话:为什么 Adam 要 FP32?BF16 / FP16 表示范围窄,梯度小数累加多次会被舍入吃掉(下溢出),momentum / variance 在长训练里会累计大量更新,精度必须留住。FP32 master weight 同理:每步小幅更新累积起来会掉精度,FP32 才稳。

---

## 三、ZeRO 的核心思想:复制即浪费

DDP 在 N 张卡上复制了 N 份这些东西。但每张卡每次只用一部分,完整复制是浪费。ZeRO 的思路:

- **优化器状态**:每卡只存 1/N 的状态,只更新 1/N 的参数
- **梯度**:每卡只保留 1/N 的梯度(其他 reduce 完就丢)
- **参数**:每卡只存 1/N 的参数,要用时 All-Gather 拼出来,用完丢

切完之后,每卡的内存占用变成原来的 1/N(对于切过的部分)。代价是引入新的通信:本来 DDP 每步只 All-Reduce 一次梯度,ZeRO-3 要在 forward 和 backward 都 All-Gather 一次参数。

下面用 4 卡的图把三阶段画出来。

---

## 四、三阶段:ZeRO-1 / ZeRO-2 / ZeRO-3

### 4.1 ZeRO-1:切优化器状态(Pos)

```
DDP (基线):
  Rank 0:  完整 P,完整 G,完整 OS
  Rank 1:  完整 P,完整 G,完整 OS
  Rank 2:  完整 P,完整 G,完整 OS
  Rank 3:  完整 P,完整 G,完整 OS

ZeRO-1:
  Rank 0:  完整 P,完整 G,OS[0..1/4]
  Rank 1:  完整 P,完整 G,OS[1/4..2/4]
  Rank 2:  完整 P,完整 G,OS[2/4..3/4]
  Rank 3:  完整 P,完整 G,OS[3/4..1]

P = parameters, G = gradients, OS = optimizer states
```

**省了什么**:优化器状态从 N×OS 变成 1×OS,Adam 下是大头(占前三块的 75%)。

工作流程:
1. forward / backward 跟 DDP 一样
2. backward 后对梯度做 Reduce-Scatter(每卡拿到自己负责段的 1/N reduced 梯度,而不是完整梯度)
3. 各卡只用自己的 OS 更新自己负责的 1/N 参数
4. All-Gather 把更新后的参数同步给所有卡

通信量:**Reduce-Scatter + All-Gather ≈ All-Reduce(数学等价)**,跟 DDP 几乎一样。

### 4.2 ZeRO-2:切优化器状态 + 切梯度(Pos+g)

```
ZeRO-2:
  Rank 0:  完整 P,G[0..1/4],OS[0..1/4]
  Rank 1:  完整 P,G[1/4..2/4],OS[1/4..2/4]
  Rank 2:  完整 P,G[2/4..3/4],OS[2/4..3/4]
  Rank 3:  完整 P,G[3/4..1],OS[3/4..1]
```

**比 ZeRO-1 多省的**:梯度从 N×G 变成 1×G。

工作流程:
1. forward 跟 DDP 一样
2. backward 时,某层算出梯度立刻 Reduce-Scatter,其他卡丢掉这部分(不再持有完整梯度)
3. 各卡只用自己的 1/N 梯度 + 自己的 1/N OS 更新自己的 1/N 参数
4. All-Gather 同步参数

通信量:**跟 ZeRO-1 一样**(Reduce-Scatter 是 backward 时本来就要做的)。**ZeRO-2 比 DDP 通信量没增加,显存又省了一些,基本是免费午餐**。

### 4.3 ZeRO-3:切优化器 + 切梯度 + 切参数(Pos+g+p)

```
ZeRO-3:
  Rank 0:  P[0..1/4], G[0..1/4], OS[0..1/4]
  Rank 1:  P[1/4..2/4], G[1/4..2/4], OS[1/4..2/4]
  Rank 2:  P[2/4..3/4], G[2/4..3/4], OS[2/4..3/4]
  Rank 3:  P[3/4..1], G[3/4..1], OS[3/4..1]
```

**比 ZeRO-2 多省的**:参数从 N×P 变成 1×P,**所有东西都切了**。

forward 第 L 层:
```
  1. All-Gather 拼出第 L 层完整参数        ← 通信(所有 rank 参与)
  2. 各卡用完整参数 forward(各算各 batch)
  3. 释放第 L 层非自己负责的参数            ← 内存回收
  4. 进入下一层,重复 1-3
```

backward 第 L 层(从最后一层往前):
```
  1. All-Gather 拼出第 L 层完整参数(再来一次,因为 forward 后已经释放)← 通信
  2. 各卡算 grad
  3. Reduce-Scatter 梯度,各卡只留自己 1/N 段       ← 通信
  4. 释放第 L 层非自己负责的参数
```

step:
```
  各卡只更新自己 1/N 的参数(本地操作,不需要通信)
```

每层每个 step 多了 2 次 All-Gather(forward 一次、backward 一次)。

ZeRO-3 是「显存最省、通信最重」的极端,后面 FSDP 就是 PyTorch 原生版的 ZeRO-3。

---

## 五、必看表:7B / 70B 在不同阶段下的单卡显存

假设混合精度 BF16 + Adam,N = 8 卡,只看前三块(参数 + 梯度 + 优化器):

| 模型 | 全量(单卡) | DDP(单卡) | ZeRO-1(单卡) | ZeRO-2(单卡) | ZeRO-3(单卡) |
| --- | --- | --- | --- | --- | --- |
| 7B  | 112 GB | 112 GB | 14+14+10.5 ≈ **38.5 GB** | 14+1.75+10.5 ≈ **26.25 GB** | 1.75+1.75+10.5 ≈ **14 GB** |
| 13B | 208 GB | 208 GB | 26+26+19.5 ≈ **71.5 GB** | 26+3.25+19.5 ≈ **48.75 GB** | 3.25+3.25+19.5 ≈ **26 GB** |
| 70B | 1120 GB | 1120 GB | 140+140+105 ≈ **385 GB** | 140+17.5+105 ≈ **262.5 GB** | 17.5+17.5+105 ≈ **140 GB** |

(算法:OS = 12X / N,G = 2X / N,P = 2X / N;X 是模型参数 B,N 是卡数)

直观结论:
- **7B 模型**:DDP 装不下 80GB 卡;ZeRO-2 刚好,ZeRO-3 余量大、可以加 batch / seqlen
- **13B 模型**:ZeRO-3 单卡能塞,ZeRO-2 紧
- **70B 模型**:**8 卡 ZeRO-3 还是装不下 80GB 卡(140GB/卡)**,需要更多卡(N=16 → 70 GB/卡)、加 offload、或者切到 TP/PP

---

## 六、通信代价对比

| 阶段 | forward 通信 | backward 通信 | 一步总通信(参数量为 P) |
| --- | --- | --- | --- |
| DDP | 0 | All-Reduce P | **2P**(Ring All-Reduce 实际传输) |
| ZeRO-1 | 0 | Reduce-Scatter P + All-Gather P | **2P**(数学等价 All-Reduce) |
| ZeRO-2 | 0 | Reduce-Scatter P + All-Gather P | **2P**(同 ZeRO-1) |
| ZeRO-3 | All-Gather P | All-Gather P + Reduce-Scatter P | **3P** |

ZeRO-1/2 跟 DDP 通信量一样(只是把 All-Reduce 拆成 Reduce-Scatter + All-Gather),**所以从 DDP 切到 ZeRO-2 几乎是免费的**。

ZeRO-3 多了 forward 时的 All-Gather,通信量增加 50%,**带宽不够时会拖慢训练**。补救方法:
- prefetch 下一层参数,All-Gather 跟当前层 forward 重叠
- 通信和计算 overlap(类似 DDP bucket 的思路)
- 减小 layer 粒度(每个 transformer block 一个 shard 单元)

---

## 七、ZeRO-Offload 与 ZeRO-Infinity

### 7.1 ZeRO-Offload

显存仍然不够?**把优化器状态搬到 CPU**:

```
GPU:
  - 模型参数 (BF16)
  - 梯度    (短暂存在,reduce 完就转 CPU)
  - 激活
CPU:
  - 优化器状态 (FP32 master + m + v)
  - optimizer.step() 在 CPU 上跑

每 step:
  1. GPU forward / backward
  2. 梯度 transfer 到 CPU
  3. CPU 跑 optimizer.step (Adam update 比较轻)
  4. 更新后的参数 transfer 回 GPU
```

代价:CPU 算 + PCIe 传输,step time 拖长 1.5-3×。但能在单卡上训 13B、双卡上训 30B,**预算紧的入门玩家的救命稻草**。

### 7.2 ZeRO-Infinity

更激进:**把参数也搬到 NVMe SSD**,需要时再 prefetch 进 HBM。

```
HBM (GPU):  当前层参数 + 激活 + 临时
DRAM (CPU): 接下来要用的几层参数(预取窗口)
NVMe SSD:   完整模型参数 + 优化器状态(冷数据)

数据流:
  NVMe → CPU DRAM → GPU HBM → 算 → 释放 → NVMe
        (prefetch)  (Hot)
```

适合极端规模(几千亿到万亿参数)。但工程复杂度和 IO 调优都不简单——SSD 寿命、PCIe 通道争抢、prefetch 时机都是坑,主流团队用得少。

### 7.3 谁会用 offload

```
学术 / 个人玩家       ZeRO-Offload(单卡 / 几张消费卡训 13-30B)
中小公司预研          ZeRO-3 + Offload(8 卡训 70B)
大公司预训练          基本不用 offload,直接堆 GPU + 3D 并行
                     (offload 的 PCIe 瓶颈在大集群上不划算)
```

---

## 八、DeepSpeed 配置最小示例

```json
{
  "train_batch_size": 256,
  "gradient_accumulation_steps": 1,

  "fp16": { "enabled": false },
  "bf16": { "enabled": true },

  "zero_optimization": {
    "stage": 3,
    "overlap_comm": true,
    "contiguous_gradients": true,
    "reduce_bucket_size": 5e8,

    "stage3_prefetch_bucket_size": 5e8,
    "stage3_param_persistence_threshold": 1e6,
    "stage3_max_live_parameters": 1e9,
    "stage3_max_reuse_distance": 1e9,

    "offload_optimizer": {
      "device": "cpu",
      "pin_memory": true
    }
  }
}
```

启动:

```bash
deepspeed --num_gpus=8 train.py \
    --deepspeed --deepspeed_config ds_config.json
```

几个关键参数:
- `stage`:1 / 2 / 3,选 ZeRO 阶段
- `overlap_comm`:通信和计算重叠(必开)
- `reduce_bucket_size`:跟 DDP 的 bucket 一回事,默认 500MB
- `stage3_prefetch_bucket_size`:ZeRO-3 提前 All-Gather 下一层参数,藏住通信延迟
- `stage3_param_persistence_threshold`:小于这个大小的参数不切(切了反而开销大)
- `offload_optimizer.device`:"cpu" 开 ZeRO-Offload,"nvme" 开 ZeRO-Infinity

DeepSpeed 配置选项比这多得多,但 90% 场景调上面这几个就够了。剩下的项默认就行。

---

## 九、何时选哪一阶段

```
模型能装单卡(参数+梯度+优化器都装得下):
  ↓
  纯 DDP 就行,通信简单

模型本身能装单卡,但加上优化器装不下:
  ↓
  ZeRO-1 或 ZeRO-2(免费午餐,通信量跟 DDP 一样)

模型本身装不下单卡:
  ↓
  ZeRO-3(每卡只存 1/N 参数)
  或 张量并行(TP,16 篇)— 推理也用 TP,训练-推理一致

ZeRO-3 + N 卡仍装不下:
  ↓
  ZeRO-3 + offload(CPU 上跑 optimizer)
  或 3D 并行 TP+PP+DP(18 篇)— 千亿级以上的标准方案

万亿参数极限场景:
  ↓
  ZeRO-Infinity(NVMe offload),或者直接换 Megatron + DeepSpeed 的 3D 并行
```

工业经验:
- **7B-13B 训练**:FSDP / ZeRO-2 是甜区(通信便宜、显存够)
- **30B-70B 训练**:FSDP / ZeRO-3 + activation checkpointing
- **100B+**:3D 并行(TP × PP × DP),DeepSpeed / Megatron-LM 主导

---

## 十、ZeRO 和 DDP 不冲突,而是叠加

ZeRO 仍然是数据并行的一种——每个 rank 处理不同的数据 batch。**它没替代 DDP,只是把 DDP 那种「每卡完整复制」的内存浪费填上了**。

```
                数据切 (batch)    模型切 (params)   优化器状态切    梯度切
DDP                ✓                                                  
ZeRO-1             ✓                                  ✓
ZeRO-2             ✓                                  ✓             ✓
ZeRO-3             ✓                ✓                  ✓             ✓
TP (16 篇)                          ✓ (沿不同维度,无 1/N 概念)
PP (17 篇)                          ✓ (按层切)
```

理解这层关系后,「ZeRO 是不是模型并行」这个问题就清楚了:**不是,ZeRO 仍然是 DP 一族,只是把每卡的副本切成 N 份;真正的模型并行是 TP / PP**。

---

## 十一、看完这一篇,你应该能

- 默写训练显存四块(参数 / 梯度 / 优化器 / 激活)
- 算 7B BF16 + Adam 训练单卡需要多少显存(112 GB,80GB 卡装不下)
- 解释 ZeRO 三阶段切的是什么,各自省多少
- 在白板上画 7B 模型在 DDP / ZeRO-1/2/3 下的单卡占用对比表
- 解释 ZeRO-3 比 DDP 多了哪两次通信(forward / backward 各一次 All-Gather)
- 看到 DeepSpeed config 知道每个 zero_optimization 字段在管什么
- 选型:模型大小 → 推荐阶段(能装单卡 → ZeRO-1/2,装不下 → ZeRO-3,极限 → offload / 3D)
- 解释 ZeRO 仍然是 DP 一族,跟 TP/PP 是正交的

下一篇:**15 FSDP 心智** — PyTorch 把 ZeRO-3 写进了官方 API,叫 FullyShardedDataParallel。功能上跟 DeepSpeed ZeRO-3 等价,但跟 PyTorch 生态(profiler、torch.compile、DTensor)集成更顺。FSDP1 → FSDP2 的 per-parameter sharding 是 2026 年的趋势。
