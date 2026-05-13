# FSDP 心智:PyTorch 原生版的 ZeRO-3

DeepSpeed 把 ZeRO 做成熟之后,PyTorch 团队把同一套思路重新实现进 `torch.distributed.fsdp`——这就是 FSDP(Fully Sharded Data Parallel)。功能上跟 ZeRO-3 等价,**真正的差别在生态集成度**:FSDP 跟 PyTorch profiler、torch.compile、autocast、DTensor 都是同一个团队维护,API 风格统一。2026 年 Meta、Hugging Face 大量训练代码已经从 DeepSpeed 切到 FSDP2。

> 一句话先记住:**FSDP = ZeRO-3 in PyTorch native**。FSDP1 的 FlatParameter 跟 TP 配合差,FSDP2 的 per-parameter sharding(基于 DTensor)解决了这个问题,逐渐成为新项目的首选。

---

## 一、为什么不直接用 DeepSpeed

DeepSpeed 是 Microsoft 维护的独立框架,从 2020 年起一直引领大模型训练的优化。它的特点:

- **独立 runtime**:有自己的 engine、optimizer 包装、训练循环
- **配置驱动**:`ds_config.json`,跟 PyTorch 原生 API 风格不一致
- **跟 PyTorch 新特性集成滞后**:torch.compile、DTensor、新的 mixed precision、FP8 都是 PyTorch 先有,DeepSpeed 跟一阵子才支持

PyTorch 团队 2022 年正式把 ZeRO 写进官方:`FullyShardedDataParallel`(FSDP1)。理由:

1. **降低概念碎片**:用户不再需要在 DDP / DeepSpeed / FairScale 之间纠结
2. **跟生态深度集成**:profiler、autocast、checkpoint、compile 都不需要专门适配
3. **跟 TP / PP 组合时基础类型一致**:DTensor 统一了 TP、FSDP、PP 的张量切分语义

```
2020-2022:  DeepSpeed 独大,FairScale 是社区中转版本
2022:       PyTorch FSDP1 发布,基本对齐 ZeRO-3 功能
2024:       PyTorch FSDP2 发布,per-parameter sharding,跟 TP 组合更顺
2026:       Meta / HF / 大模型团队大量切 FSDP2
            DeepSpeed 仍在,但更多用于 ZeRO-Infinity / DeepSpeed-Inference 差异化能力
```

不是 DeepSpeed 不好,而是「PyTorch 自己有了原生方案,新项目优先用原生」。

---

## 二、FSDP 的参数 lifecycle

ZeRO-3 的核心动作在 FSDP 里完全一样,但 PyTorch 把它放到了 forward / backward 的 module hook 里。

```
模型:Layer 1 → Layer 2 → ... → Layer N
每层都被 FSDP 包装,参数被切成 N 份分散在 N 卡

时刻 0(初始):
  Rank 0 持 Layer 1 参数的 1/N 切片
  Rank 1 持 Layer 1 参数的 1/N 切片
  ...

==== forward 阶段 ====

forward 进入 Layer 1:
  ┌─────────────────────────────┐
  │ All-Gather Layer 1 完整参数  │  ← 通信
  └─────────────────────────────┘
       ↓
  Layer 1 forward(用完整参数)
       ↓
  ┌─────────────────────────────┐
  │ 释放非本卡的参数,只留 1/N   │  ← 内存回收
  └─────────────────────────────┘
       ↓
  保存激活(本卡的那部分输出)

forward 进入 Layer 2(重复)...
forward 进入 Layer N

==== backward 阶段 ====

backward 进入 Layer N:
  ┌─────────────────────────────┐
  │ All-Gather Layer N 完整参数  │  ← 通信(forward 后已释放)
  └─────────────────────────────┘
       ↓
  Layer N backward(算梯度)
       ↓
  ┌─────────────────────────────┐
  │ Reduce-Scatter 梯度          │  ← 通信
  │ 各卡只留自己 1/N 的梯度      │
  └─────────────────────────────┘
       ↓
  ┌─────────────────────────────┐
  │ 释放完整参数,只留 1/N       │
  └─────────────────────────────┘

... backward 进入 Layer N-1, N-2, ..., 1

==== step 阶段 ====

各卡只更新自己 1/N 的参数(本地操作,无通信)
```

整个过程跟 ZeRO-3 一致,差异只在工程实现:钩子机制、buffer 管理、stream 调度都是 PyTorch 原生的。

---

## 三、FSDP1 vs FSDP2 的关键差异

### 3.1 FSDP1:FlatParameter

FSDP1 把一个 FSDP 单元(一组要一起 shard 的层,通常一个 transformer block)里的所有参数 **flatten 成一个大张量**,叫 FlatParameter:

```
TransformerBlock 包含:
  attn.q_proj.weight    [4096, 4096]
  attn.k_proj.weight    [4096, 4096]
  attn.v_proj.weight    [4096, 4096]
  attn.o_proj.weight    [4096, 4096]
  mlp.gate_proj.weight  [11008, 4096]
  mlp.up_proj.weight    [11008, 4096]
  mlp.down_proj.weight  [4096, 11008]

FSDP1 处理:
  把这一块所有 tensor flatten + concat 成一个 1D 张量
    FlatParameter [总元素数]
  按 N 卡均匀切:
    Rank 0:  [0..1/N]
    Rank 1:  [1/N..2/N]
    ...
```

**好处**:通信高效,一次 All-Gather 一整块,launch 开销低、带宽利用高。

**坏处**:
- 跟 TP 组合时,TP 要按特定维度切(比如 attention head 维度),**FlatParameter 已经把维度拍平了,两者切分语义对不上**
- 单个参数想做特殊处理(某层用不同精度)很别扭
- DCP(Distributed Checkpoint)保存时,FlatParameter 的索引是隐式的,**跨配置(改 N、改 wrap policy)恢复脆**

### 3.2 FSDP2:per-parameter sharding(DTensor)

FSDP2(PyTorch 2.4 引入)走另一条路:**保留每个原始参数的形状,每个参数自己被切成 N 份**,底层用 DTensor 表示。

```
TransformerBlock 包含:
  attn.q_proj.weight  [4096, 4096]
                        ↓ 沿 dim 0 切
                      Rank 0:  [0..512, 4096]
                      Rank 1:  [512..1024, 4096]
                      ...
  attn.k_proj.weight  [4096, 4096] (同样切)
  mlp.gate_proj.weight [11008, 4096] (同样切)
  ...

每个参数都是一个 DTensor,带 placement 元信息
(沿哪个维度切、放在哪些 rank、跨哪个 mesh 维度)
```

**好处**:
- **跟 TP 自然组合**:TP 也用 DTensor,FSDP shard + TP shard 用同一套切分描述符,组合等于 placement 叠加
- 每个参数独立,精度、梯度类型可以单独控制
- DCP 保存 / 加载更稳健,DTensor 自带分布信息

**坏处**:
- 通信单元从「一大块 FlatParameter」变成「多个独立小块」,**通信启动开销略增**(被 prefetch 缓解)
- 实现更新,FSDP1 用了几年沉淀的工程坑要在 FSDP2 重新填

### 3.3 对比表

| | FSDP1 | FSDP2 |
| --- | --- | --- |
| 切分单位 | FlatParameter(1 大块) | 每个 nn.Parameter(多块) |
| 底层类型 | FlatParameter | DTensor |
| API 入口 | `FullyShardedDataParallel(model, ...)` | `fully_shard(module, ...)` |
| 跟 TP 组合 | 困难(维度被拍平) | 自然(placement 叠加) |
| DCP checkpoint | 脆(隐式索引) | 稳(自带分布信息) |
| 2026 推荐 | 老项目维护 | 新项目首选 |

PyTorch 文档已经把 FSDP2 标为推荐方案,FSDP1 短期保留向前兼容。

---

## 四、关键 API

### 4.1 FSDP2 推荐:`fully_shard`

```python
from torch.distributed._composable.fsdp import fully_shard, MixedPrecisionPolicy
from torch.distributed.device_mesh import init_device_mesh

# 1. 建立 device mesh(单维度,纯 FSDP)
mesh = init_device_mesh("cuda", (world_size,))

# 2. 混合精度策略
mp_policy = MixedPrecisionPolicy(
    param_dtype=torch.bfloat16,
    reduce_dtype=torch.float32,   # 梯度用 FP32 做 reduction,数值更稳
)

# 3. 对每个 transformer block 调用 fully_shard
model = LlamaModel(config)
for block in model.model.layers:
    fully_shard(block, mesh=mesh, mp_policy=mp_policy)

# 4. 对顶层模型也包一次(把 embedding / 顶层 norm 也 shard)
fully_shard(model, mesh=mesh, mp_policy=mp_policy)
```

风格比 FSDP1 干净:不需要 `auto_wrap_policy`,直接对要 shard 的模块调 `fully_shard` 即可。每层独立调用,**粒度由你掌控**。

### 4.2 FSDP1(老风格,仍在用)

```python
import functools
from torch.distributed.fsdp import (
    FullyShardedDataParallel as FSDP,
    MixedPrecision,
    ShardingStrategy,
)
from torch.distributed.fsdp.wrap import transformer_auto_wrap_policy

mp_policy = MixedPrecision(
    param_dtype=torch.bfloat16,
    reduce_dtype=torch.float32,
)

wrap_policy = functools.partial(
    transformer_auto_wrap_policy,
    transformer_layer_cls={LlamaDecoderLayer},   # 哪一类 module 作为 shard 单位
)

model = FSDP(
    model,
    auto_wrap_policy=wrap_policy,
    mixed_precision=mp_policy,
    sharding_strategy=ShardingStrategy.FULL_SHARD,   # 等价 ZeRO-3
    device_id=torch.cuda.current_device(),
)
```

`sharding_strategy` 选项:`NO_SHARD`(=DDP)、`SHARD_GRAD_OP`(=ZeRO-2)、`FULL_SHARD`(=ZeRO-3)、`HYBRID_SHARD`(=HSDP,节点内 ZeRO-3 + 节点间 DDP)。

---

## 五、最小可跑代码:FSDP2 包 Llama

```python
import os
import torch
import torch.distributed as dist
from torch.distributed._composable.fsdp import fully_shard, MixedPrecisionPolicy
from torch.distributed.device_mesh import init_device_mesh
from torch.distributed.algorithms._checkpoint.checkpoint_wrapper import apply_activation_checkpointing
from transformers import LlamaForCausalLM, LlamaConfig
from transformers.models.llama.modeling_llama import LlamaDecoderLayer

def main():
    dist.init_process_group(backend="nccl")
    rank = int(os.environ["LOCAL_RANK"])
    torch.cuda.set_device(rank)

    mesh = init_device_mesh("cuda", (dist.get_world_size(),))

    config = LlamaConfig(hidden_size=4096, num_hidden_layers=32,
                        num_attention_heads=32, vocab_size=32000)
    model = LlamaForCausalLM(config).to(torch.bfloat16).cuda()

    # 激活检查点(每个 transformer block 独立)
    apply_activation_checkpointing(
        model, check_fn=lambda m: isinstance(m, LlamaDecoderLayer))

    mp_policy = MixedPrecisionPolicy(
        param_dtype=torch.bfloat16, reduce_dtype=torch.float32)

    # FSDP2 包装:每个 layer 单独 shard,顶层再包一次
    for layer in model.model.layers:
        fully_shard(layer, mesh=mesh, mp_policy=mp_policy)
    fully_shard(model, mesh=mesh, mp_policy=mp_policy)

    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-4)

    for step, batch in enumerate(loader):
        out = model(**batch)
        out.loss.backward()
        optimizer.step()
        optimizer.zero_grad()

if __name__ == "__main__":
    main()
```

启动:

```bash
torchrun --nproc_per_node=8 train_fsdp.py
```

---

## 六、与 ZeRO 对比

| | DeepSpeed ZeRO-3 | FSDP2 |
| --- | --- | --- |
| 切分语义 | OS / G / P 三阶段 | FULL_SHARD ≈ ZeRO-3 |
| 配置方式 | JSON config | Python API |
| PyTorch 集成 | 独立 runtime | 原生,直接是 PyTorch module |
| torch.compile | 支持中 | 深度集成 |
| 跟 TP 组合 | 较难,需要手动 | 自然(DTensor) |
| Offload | 强(ZeRO-Infinity / NVMe) | 仅 CPU offload |
| 调试体验 | 黑盒重 | 偏 PyTorch 原生 |
| 2026 趋势 | 维持,差异化场景 | 新项目首选 |

简单说:**主流 LLM 预训练 / SFT 用 FSDP2 已经是正确选择**。需要 NVMe offload、要训万亿参数,或代码已经在 DeepSpeed 上跑了几年,继续用 DeepSpeed。

---

## 七、通信调优:prefetch 与 reshard

### 7.1 backward prefetch

backward 时,FSDP 默认是「下一层要算了再 All-Gather 它的参数」,通信暴露在算之前。开 prefetch 让 All-Gather 跟当前层 backward 重叠:

```
没 prefetch:
  Layer N backward     ▓▓▓
  All-Gather Layer N-1     ░░░     ← 通信暴露
  Layer N-1 backward          ▓▓▓

有 BACKWARD_PRE:
  Layer N backward     ▓▓▓
  All-Gather Layer N-1   ░░░       ← 与 Layer N backward 重叠
  Layer N-1 backward          ▓▓▓

  通信被计算盖住,step time 接近纯计算时间
```

`BACKWARD_PRE`:当前层 backward **开始前** prefetch 下一层(重叠最好,内存峰值高)。
`BACKWARD_POST`:backward **结束后**才 All-Gather(省内存,通信暴露)。
FSDP1 通过 `backward_prefetch` / `forward_prefetch` 显式配,FSDP2 默认就启用基于 DTensor 调度的 prefetch。

### 7.2 reshard_after_forward

forward 完立刻 reshard(释放完整参数)= 内存省,backward 时要再 All-Gather 一次。
forward 完不 reshard = 内存多,backward 不重新通信。

通常 transformer 中间层选 `reshard_after_forward=True`(省内存),最后一层选 False(立刻 backward,留着免一次通信)。

---

## 八、HSDP:机内 ZeRO + 机间 DDP

千卡训练时,纯 FSDP 跨机 All-Gather 走 InfiniBand,**带宽是节点内 NVLink 的 1/10 到 1/20**,易成瓶颈。

HSDP(Hybrid Sharded DP)的思路:
- **节点内 8 卡**做 FSDP(等价 ZeRO-3),All-Gather 走 NVLink 900 GB/s
- **节点间**做 DDP,只 All-Reduce 已经 reduced 过的梯度

```
8 节点 × 8 卡 = 64 卡训练:

  节点 0 (NVLink): Rank 0..7 内部做 FSDP, 切完整模型
  节点 1 (NVLink): Rank 8..15 内部做 FSDP, 切完整模型
  ...
  节点之间 (InfiniBand): All-Reduce 节点级梯度

通信 pattern:
  节点内:每层 forward / backward 都 All-Gather + Reduce-Scatter (快)
  节点间:每步 All-Reduce 一次梯度 (慢但只一次)
```

代码:

```python
# 二维 mesh:外层 inter-node,内层 intra-node
mesh = init_device_mesh(
    "cuda",
    (num_nodes, gpus_per_node),
    mesh_dim_names=("inter_node", "intra_node"),
)

# FSDP 沿 intra_node 维度切
for layer in model.model.layers:
    fully_shard(layer, mesh=mesh["intra_node"])
```

通信代价显著降低:跨机不再走 All-Gather 大块参数,只 All-Reduce 1/N 大小的梯度。

详细的 3D 并行(TP × PP × DP)在 18 篇展开,HSDP 是它的简化版本(只用 DP × 切分)。

---

## 九、工程坑

### 9.1 FSDP1 时代不能跟 TP 顺利组合

FlatParameter 把维度拍平,TP 想沿 attention head 维度切就拿不到。社区方案要么用 FairScale 的旧版 ShardedDDP + Megatron 拼,要么自己 hack。**FSDP2 通过 DTensor 解决了这个**——2026 年新项目都该走 FSDP2 + TP 组合。

### 9.2 mixed precision 与 reduce_dtype 别搞混

```python
MixedPrecisionPolicy(
    param_dtype=torch.bfloat16,    # 参数 / 激活 用 BF16(算得快)
    reduce_dtype=torch.float32,    # 梯度 All-Reduce 用 FP32(数值稳)
)
```

`reduce_dtype` 用 BF16 时,梯度 All-Reduce 时小数累加会损失精度,大模型 / 长训练可能数值漂移、loss 抖动甚至 NaN。**FP32 reduction 是默认推荐**,只在带宽极度不够时才考虑 BF16 reduction。

### 9.3 activation checkpointing 单独配

FSDP 不自动开 activation checkpointing。激活要省显存得另外用 `apply_activation_checkpointing`,典型配置是「每个 transformer block 一个 checkpoint 单元」——forward 不存中间激活,backward 时重算。

```
不开 ckpt:激活占显存 = 层数 × seq × hidden × dtype
开 ckpt:激活占显存 ≈ 1 层 × seq × hidden × dtype
        但 backward 时间 + 30%(重算 forward)
```

LLM 训练几乎都开 checkpointing,激活才是大模型 + 长 seq 时真正的显存大头。

### 9.4 checkpoint 保存用 DCP

不要用 `torch.save(model.state_dict())`——FSDP 的 state dict 是切片的,直接保存只能拿到本 rank 那部分。用 `torch.distributed.checkpoint`(DCP)保存到目录,加载时按当前 world_size 自动重切:

```python
import torch.distributed.checkpoint as dcp
state = {"model": model.state_dict(), "optim": optimizer.state_dict()}
dcp.save(state, checkpoint_id="/path/to/ckpt")
dcp.load(state, checkpoint_id="/path/to/ckpt")  # 不同 world_size 也能加载
```

DCP 跨配置(改 N、改 sharding strategy)恢复都没问题——这是 FSDP2 用 DTensor 的另一好处。

### 9.5 调试与生态成熟度

FSDP 出问题排查麻烦(每个 rank 状态不同,日志一堆)。开发阶段先用单卡跑通模型 forward / backward 再上多卡,`NCCL_DEBUG=INFO` + `TORCH_DISTRIBUTED_DEBUG=DETAIL` 是必备调试环境变量。

FSDP2 虽然官方推荐,但 2026 初部分场景仍有坑:跟 TE / FP8 集成在迭代,部分第三方 trainer(老版 axolotl / lit-gpt)适配滞后,多模态模型混用配置麻烦。新项目优先 FSDP2,验证最充分的入口是 HF Transformers Trainer 和 TorchTitan。

---

## 十、看完这一篇,你应该能

- 解释 FSDP 跟 ZeRO-3 的关系(等价,PyTorch 原生实现)
- 默 FSDP 参数 lifecycle(分片 → All-Gather → forward → 释放 → backward 前再 All-Gather → Reduce-Scatter)
- 解释 FSDP1 (FlatParameter) 与 FSDP2 (per-parameter / DTensor) 的关键差异
- 知道 FSDP2 跟 TP 组合为什么更顺(DTensor placement 叠加)
- 写出 FSDP2 的最小训练代码(`fully_shard` + MixedPrecisionPolicy + activation checkpoint)
- 解释 `BACKWARD_PRE` / `reshard_after_forward` 在通信-计算重叠中的角色
- 解释 HSDP(机内 FSDP + 机间 DDP)为什么对千卡训练通信代价低
- 知道 DCP 是 FSDP 配套的 checkpoint 工具,不能用 `torch.save` 直接存 state_dict

下一篇:**16 张量并行** — 数据并行家族讲完了。当模型本身大到一张卡放不下、ZeRO-3 都装不下的时候,得切模型本身。Megatron-LM 的列切 / 行切是张量并行的入门,All-Reduce 在 forward / backward 都要发,通信 pattern 跟 DDP 完全不同。
