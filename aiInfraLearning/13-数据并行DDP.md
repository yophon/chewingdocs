# 数据并行 DDP:从单卡训练到多卡训练的入口

单卡能装下模型,只是 batch 跑得慢——这是 99% 团队迈进多卡训练的第一步。数据并行的逻辑朴素到吓人:**每张卡复制一份模型,各处理一段数据,反向之后把梯度同步一下,大家用同一个梯度更新参数**。听起来简单,但「梯度同步」在 1024 卡集群上能吃掉训练 30-50% 的时间——All-Reduce、Bucket、通信-计算重叠都是为这件事服务。这一篇拉清楚 DDP 的心智、PyTorch 的两套实现,以及它的天花板。

> 一句话先记住:**DDP = 每卡完整模型 + 各算各的 mini-batch + 反向时 All-Reduce 同步梯度**。它的硬约束是「模型必须能装单卡」——超过这个边界,就得 ZeRO / FSDP / TP 上场。

---

## 一、为什么先讲数据并行

模型并行(TP / PP)和数据并行(DP)是分布式训练的两条主线,**90% 团队从 DP 开始**:

- 模型能装单卡(7B BF16 = 14GB,80GB H100 装得下),想用更大 batch 加速训练 → DP
- 模型装不下单卡(70B+),才必须切模型本身(TP / PP / ZeRO-3)

DP 的好处是工程上简单——**模型代码不动**,在外面包一层就行。坏处是:卡的数量不能让模型本身变大,只能让 batch 变大。

```
单卡训练:    1 GPU, batch=8,  step time = T
                                ↓ 想更快
DDP 8 卡:   8 GPU, batch=64,   step time ≈ T (理想线性扩展)
                                ↑ 等效更大 batch,梯度更稳
                                ↑ 训练总时间缩短到 1/8(理想)
```

实际上同步开销让 step time 略增,通信好的话能拿到 7-7.5× 线性加速。

---

## 二、心智模型:DDP 一个 step 的时序

```
时刻 0      Rank 0          Rank 1          Rank 2          Rank 3
          └ 完整模型      └ 完整模型      └ 完整模型      └ 完整模型
          └ batch[0..15] └ batch[16..31] └ batch[32..47] └ batch[48..63]

 Forward    各算各的         各算各的         各算各的         各算各的
            ↓                ↓                ↓                ↓
          loss_0           loss_1           loss_2           loss_3

 Backward   各算各的梯度     各算各的梯度     各算各的梯度     各算各的梯度
            ↓                ↓                ↓                ↓
          grad_0           grad_1           grad_2           grad_3

 Sync                 ──── All-Reduce(grad_0..3 求和取平均)────
                                         ↓
                                   grad_avg(每卡都拿到一份)

 Step      grad_avg apply   grad_avg apply   grad_avg apply   grad_avg apply
            ↓                ↓                ↓                ↓
          params_t+1       params_t+1       params_t+1       params_t+1
          (四卡参数完全一致,因为初始化同 + 每步用同一个梯度)
```

关键性质:
- 初始化时 broadcast 一次,**之后每卡参数永远一致**
- forward 不通信(各卡数据本地,模型一致)
- backward 时通信(All-Reduce 梯度)
- step 时不通信(每卡用同一份梯度更新)
- 通信内容 ≈ 模型参数量大小

---

## 三、PyTorch 的两套实现

### 3.1 DataParallel(`nn.DataParallel`)— 已弃用

老的实现,**新代码不要用**。

```python
model = nn.DataParallel(model)   # 一行包一下
out = model(x)                   # 内部自动散发
```

工作方式:**单进程多线程**,主进程持有模型,每个 forward 把 batch 切成 N 段、复制到每张卡、并发跑、把结果聚回主卡。

```
DataParallel 的拓扑:
   Process 0 (Main, GIL)
      ├─ Thread 0 → GPU 0 (主卡,梯度聚这,显存压力最大)
      ├─ Thread 1 → GPU 1
      ├─ Thread 2 → GPU 2
      └─ Thread 3 → GPU 3
                ↑
          GIL 把多线程并行变伪并行
```

为什么死了:
1. Python GIL 把多线程优势抹平,8 卡线性加速通常只到 4-5×
2. 主卡先满(要聚梯度、聚输出),其他卡半空
3. **不支持多机**
4. 跟 mixed precision、torch.compile 等新特性集成差

PyTorch 官方文档已经把 DataParallel 标为「不推荐」,只在最简单的 demo 里看得到。

### 3.2 DistributedDataParallel(`nn.parallel.DistributedDataParallel`)— 标准方案

DDP 是当下唯一答案。**多进程,每张卡一个独立进程**。

```
DDP 的拓扑:
  Process 0 (Rank 0) → GPU 0   独立 Python 解释器
  Process 1 (Rank 1) → GPU 1   独立 Python 解释器
  Process 2 (Rank 2) → GPU 2   独立 Python 解释器
  Process 3 (Rank 3) → GPU 3   独立 Python 解释器
                ↑
        进程间靠 NCCL / MPI 通信
        没有 GIL,真并行
```

特点:
- 每进程一张卡,**没有 GIL 干扰**
- 启动靠 `torchrun`(以前叫 `torch.distributed.launch`)
- 跨机也支持(NCCL over InfiniBand / Ethernet)
- forward 不通信,backward 通过 All-Reduce 同步梯度

```python
import torch.distributed as dist
dist.init_process_group(backend="nccl")
model = DDP(model, device_ids=[local_rank])
```

| | DataParallel | DistributedDataParallel |
| --- | --- | --- |
| 进程模型 | 单进程多线程 | 多进程 |
| GIL | 受限 | 无 |
| 多机 | 否 | 是 |
| 通信 | 主卡 scatter / gather | All-Reduce(对称) |
| 主卡显存 | 多吃一份 | 跟其他卡一样 |
| 状态 | deprecated | 标准 |

---

## 四、All-Reduce:梯度同步的核心

### 4.1 它要解决什么

每张卡有一份梯度 `g_i`,要把所有卡的梯度求平均、然后让每张卡都拿到这个平均值:

```
g_avg = (g_0 + g_1 + ... + g_{N-1}) / N
然后每个 rank 都更新 g_i ← g_avg
```

「reduce(求和) + broadcast(广播)」加在一起就是 All-Reduce。这是 collective 通信里最重要的算子,详细在 19 篇展开。

### 4.2 两类实现:Ring vs Tree

**Ring All-Reduce**(NCCL 默认,带宽优先):

```
Rank 0 ─→ Rank 1 ─→ Rank 2 ─→ Rank 3
   ↑                              │
   └──────────────────────────────┘

每张卡负责自己 1/N 的数据,环上传 N-1 步:
  Reduce-Scatter:转 N-1 步,每张卡得到一份完整 reduce 后的 1/N 数据
  All-Gather:再转 N-1 步,把每张卡的 1/N 拼回完整数据

总通信量 ≈ 2 × 数据量 (跟 N 几乎无关)
延迟:O(N) 步,N 大时延迟变高
```

**Tree All-Reduce**(节点数多 / 小消息时更快):

```
       Reduce 上行         Broadcast 下行
            ↑                    ↓
         ┌──┴──┐              ┌──┴──┐
         │     │              │     │
       ┌─┴─┐ ┌─┴─┐          ┌─┴─┐ ┌─┴─┐
       │   │ │   │          │   │ │   │

延迟 O(log N),小消息友好
```

NCCL 会根据消息大小自动选算法:小消息 Tree(降延迟),大消息 Ring(打满带宽)。

### 4.3 通信代价跟模型大小成正比

7B 模型,BF16 梯度 = 14 GB。每步 Ring All-Reduce 实际传输 ≈ 28 GB(双向):

```
NVLink 带宽 (H100 节点内,8 卡互联): 900 GB/s
理论时间:  28GB / 900GB/s ≈ 31 ms

InfiniBand 400Gb (节点间单网卡): 50 GB/s
理论时间:  28GB / 50GB/s ≈ 560 ms
                                ↑
                          模型大、卡少,这一步就成瓶颈
```

千卡训练里通信经常占 step time 的 30-60%。所以工业界对 DDP 的优化几乎都围绕「**让通信和计算重叠,不让通信占满 step time**」。

---

## 五、Bucket 与通信-计算重叠

### 5.1 为什么要 Bucket

模型有几百个 parameter tensor(每层 weight、bias、norm gain...)。如果每个 tensor 一算完梯度就 All-Reduce 一次,**通信库的 launch 开销会被几百次小消息放大**——NCCL 一次 launch 大约 5-10 μs,几百次就是几 ms 全打水漂。

解决方案:**多个小 gradient 攒到一个 bucket(默认 25MB)再发一次**。

```
没 Bucket:
  layer N grad   (几 MB) → All-Reduce → launch overhead ~10 μs
  layer N-1 grad (几 MB) → All-Reduce → ~10 μs
  ... (几百次)
  累计 launch overhead 加起来几 ms,完全浪费

有 Bucket:
  layer N..M grad 攒到 25MB → All-Reduce 1 次 → ~10 μs launch
  layer M-1..K grad 攒到 25MB → All-Reduce 1 次 → ~10 μs
  ... (十几次)
  通信少、消息大、带宽利用高
```

```python
model = DDP(
    model,
    device_ids=[local_rank],
    bucket_cap_mb=25,         # bucket 大小,默认 25MB
)
```

`bucket_cap_mb` 调多大算合适:
- 太小 → launch 开销高
- 太大 → 第一个 bucket 要等很多层算完才发,通信-计算重叠效果差
- 大模型 / 高带宽集群常见 50-100MB

### 5.2 通信-计算重叠

DDP 注册了反向钩子(backward hook):**某层 backward 算完梯度,这层归属的 bucket 一旦凑满,就 launch All-Reduce,主线程继续算前面层的 backward**。

```
时间轴 →

Backward Layer N      ▓▓▓
Backward Layer N-1            ▓▓▓
Backward Layer N-2                  ▓▓▓
Backward Layer N-3                        ▓▓▓
...

All-Reduce bucket A         ░░░░░░
All-Reduce bucket B               ░░░░░░
All-Reduce bucket C                       ░░░░░░

▓ 计算  (在 SM 上跑)
░ 通信  (在 NVLink/IB 上跑,独立硬件)

注意:░ 和 ▓ 在不同硬件,可以并行 → 通信被计算盖住
```

这个 overlap 是 DDP 拿到接近线性加速的关键。Profiler(`torch.profiler` / NSight Systems)看「通信被多少计算盖住」就是看这个,**理想情况下,All-Reduce 只剩最后一个 bucket 暴露在 step 末尾**。

### 5.3 反向顺序就是参数注册顺序

DDP 的钩子触发顺序由 backward 自动决定(后向算完什么,什么先发)。但 bucket 的分配顺序基于参数注册顺序,**反向时早算的参数应该排在 bucket 末尾,这样这部分 bucket 最后才凑满**——这跟工程直觉是反的。一般不用手动管,DDP 会帮你倒序排。但如果你的模型有「forward 看似最后跑、backward 第一个跑」的奇怪模块,可能要手动 hint。

---

## 六、梯度累积配合 DDP:`no_sync` 上下文

### 6.1 想要更大的 effective batch,但不想加卡

显存装不下 batch=128,可以 batch=32 跑 4 步、累积梯度,等效 batch=128。普通模型直接累积就行,但 **DDP 默认每次 backward 都触发一次 All-Reduce**——4 步累积 = 4 次同步,前 3 次浪费。

```python
# 反例:每次 backward 都同步,前 3 次白同步
for i, batch in enumerate(loader):
    loss = model(batch).loss / accum_steps
    loss.backward()           # 这里 DDP 默认就发 All-Reduce
    if (i + 1) % accum_steps == 0:
        optimizer.step()
        optimizer.zero_grad()
```

### 6.2 `no_sync()` 的作用

```python
from contextlib import nullcontext

for i, batch in enumerate(loader):
    is_accum_step = (i + 1) % accum_steps != 0

    cm = model.no_sync() if is_accum_step else nullcontext()
    with cm:
        loss = model(batch).loss / accum_steps
        loss.backward()       # no_sync 内不发 All-Reduce,梯度本地累加

    if not is_accum_step:
        optimizer.step()      # 最后一步退出 no_sync,这次 backward 触发同步
        optimizer.zero_grad()
```

`no_sync` 让 DDP 跳过 All-Reduce,梯度就在本地累加。最后一步退出 `no_sync` 再 backward,这次会触发同步。

效果:**通信次数从 N 次降到 N/accum_steps 次,带宽省一大块**。LLM 训练几乎都开 accum + no_sync。

---

## 七、最小可跑代码

### 7.1 训练脚本(`train.py`)

```python
import os
import torch
import torch.distributed as dist
from torch.nn.parallel import DistributedDataParallel as DDP
from torch.utils.data import DataLoader, DistributedSampler

def main():
    # torchrun 会注入这些环境变量
    local_rank = int(os.environ["LOCAL_RANK"])
    rank = int(os.environ["RANK"])
    world_size = int(os.environ["WORLD_SIZE"])

    # 初始化进程组
    dist.init_process_group(backend="nccl")
    torch.cuda.set_device(local_rank)

    # 模型 + DDP 包装
    model = MyModel().cuda()
    model = DDP(model, device_ids=[local_rank], bucket_cap_mb=25)

    # 关键:DistributedSampler 让每个 rank 看不同的数据切片
    dataset = MyDataset()
    sampler = DistributedSampler(dataset, num_replicas=world_size, rank=rank)
    loader = DataLoader(dataset, batch_size=32, sampler=sampler)

    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-4)

    for epoch in range(10):
        sampler.set_epoch(epoch)   # 每个 epoch 重新洗牌(必须)
        for batch in loader:
            optimizer.zero_grad()
            loss = model(batch).loss
            loss.backward()
            optimizer.step()

    dist.destroy_process_group()

if __name__ == "__main__":
    main()
```

### 7.2 启动

```bash
# 单机 8 卡
torchrun --nproc_per_node=8 train.py

# 两机 8 卡(每机 4 卡)
# 机 0
torchrun --nnodes=2 --node_rank=0 --nproc_per_node=4 \
    --master_addr=192.168.1.10 --master_port=29500 train.py
# 机 1
torchrun --nnodes=2 --node_rank=1 --nproc_per_node=4 \
    --master_addr=192.168.1.10 --master_port=29500 train.py
```

需要注意的几件事:
- `DistributedSampler` 必须用,否则每个 rank 读相同数据 = 浪费
- `sampler.set_epoch(epoch)` 不调,每个 epoch 数据顺序一样
- 模型保存只在 rank 0 写,加载时 broadcast 给其他 rank
- 评估时如果想跨 rank 聚合 metric,用 `dist.all_reduce(...)`

---

## 八、DDP 的天花板

### 8.1 模型必须装单卡

DDP 的核心假设:**每张卡都有完整模型 + 完整梯度 + 完整优化器状态**。这意味着:

```
单卡 80 GB H100,Adam 训练 BF16 模型,X B 参数:
  模型权重 (BF16):     2X GB
  梯度 (BF16):         2X GB
  优化器状态 (Adam):   8X GB  (FP32 master + momentum + variance,详见 14 篇)
  激活 / KV / 临时:   剩下的

合计前三项 ≥ 12X GB

X = 6  → 72 GB,刚好装下,但激活几乎没空间
X = 7  → 84 GB,装不下了
X = 13 → 156 GB,完全没戏
```

**纯 DDP 在 2026 年 H100 上,实操能装的模型大概到 6-7B**。再大就要 ZeRO-1/2 切优化器和梯度,或者 ZeRO-3 / TP 切参数(下一篇展开)。

### 8.2 通信瓶颈

模型变大,梯度变大,All-Reduce 时间跟模型大小成正比。卡多了带宽不够分:
- 节点内 NVLink 900 GB/s 还行
- 节点间 InfiniBand 50-100 GB/s,**容易成瓶颈**

千卡训练里,通信能占 step time 的 30-60%,这就是为什么 19 篇要单独讲 NCCL 和拓扑。

### 8.3 同步 vs 异步 SGD

历史上有过「异步参数服务器」方案(Parameter Server,DistBelief / TensorFlow PS 时代):梯度异步推到 PS,worker 异步从 PS 拉参数,**不阻塞**。

```
Async PS 模型:
  Worker → push grad → PS
  Worker ← pull params ← PS
  各 worker 不等其他 worker

问题:
  - 梯度过时(stale gradients):worker 拿到的参数可能比自己梯度对应的版本旧
  - 收敛差,大模型上几乎不工作
  - 调试地狱
```

**LLM 时代异步 SGD 基本没人用**——大模型对梯度一致性敏感,过时梯度直接训崩。现在的分布式训练几乎全是同步 SGD + All-Reduce。

---

## 九、调试与监控:DDP 在生产里看什么

```
监控指标                          问题
──────────────────────────       ──────────────────
step time 突然变长                通信瓶颈,某 rank 慢(异构、坏卡)
通信占 step % 高 (> 30%)         bucket 配置不好,或带宽真不够
某 rank GPU 利用率低              数据加载慢,该 rank 是数据瓶颈
loss 在某 step 后 NaN             梯度爆/混合精度溢出,看 reduce_dtype
all_reduce timeout (默认 30 min) 某 rank 卡住,整个训练挂
```

排查工具:`torch.profiler` 看 GPU timeline 和通信-计算 overlap;`NCCL_DEBUG=INFO` 打印 NCCL 通信细节;`TORCH_DISTRIBUTED_DEBUG=DETAIL` 看 DDP 的钩子和 bucket;偶尔加 `dist.barrier()` 定位卡死的 rank。

---

## 十、看完这一篇,你应该能

- 解释 DDP 的工作机制(每卡完整模型 + 各算 batch + backward 同步梯度)
- 说清 DataParallel 为什么死了(GIL + 单进程 + 主卡瓶颈),DDP 为什么活着
- 在白板上画 DDP 一个 step 的时序图(forward / backward / All-Reduce / step)
- 解释 Bucket 和通信-计算重叠为什么是 DDP 拿到线性加速的关键
- 知道 `no_sync` 在梯度累积场景下省了多少通信
- 写出 `torchrun` + DDP 的最小训练脚本
- 知道 DDP 的硬天花板:**模型必须装单卡**,超过就要 ZeRO / FSDP / TP

下一篇:**14 ZeRO 三阶段** — DDP 在每张卡复制了「参数 + 梯度 + 优化器状态」,这些其实可以切。ZeRO 把这三块按 N 卡切分,从 ZeRO-1 到 ZeRO-3 一路把单卡显存压下去,代价是多几次通信。
