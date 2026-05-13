# Slurm 与 HPC 调度:为什么大模型训练不用 K8s

27 篇刚讲完 K8s 上的 GPU——Device Plugin、MIG、KubeRay、拓扑感知调度,看起来 K8s 已经把 GPU 集群覆盖了。但你去看任何一家做大模型预训练的公司:OpenAI、Anthropic、xAI、Meta FAIR、智源、月之暗面、DeepSeek——**真正跑 1000+ 卡训练的集群,十有八九是 Slurm**,不是 K8s。这一篇讲清楚 Slurm 是什么、为什么 HPC 圈三十年的老兵在 LLM 训练时代反而二次起飞、以及小团队和大团队在 K8s vs Slurm 之间应该怎么选。

> 一句话先记住:**Slurm = Gang Scheduling 原生 + 拓扑感知默认 + 故障重排队成熟 + 没有控制面**;K8s 是为「无状态、可漂移、独立 Pod」设计的,而大模型训练是「全卡同步、拓扑敏感、一卡死全 job 死」——这两套设计哲学几乎相反,所以业界训练侧整体倒向 Slurm,推理侧留在 K8s,中间用 SkyPilot / Run:ai 拉通。

---

## 一、Slurm 是什么

**Simple Linux Utility for Resource Management**——名字朴素,2003 年 Lawrence Livermore 国家实验室开发,管的是当时美国能源部超算中心的几十万核 CPU。后来 SchedMD 公司接手商业化,二十多年里一直是 HPC 圈的事实标准。

```
Top 500 超算榜单 (2024):
   前 10 名超算中,Slurm 是 7 家的调度器
   前 100 名中占 60%+
   
学术界 / 国家实验室:
   几乎清一色 Slurm
   
工业界 LLM 训练:
   2022 之后大量倒向 Slurm
```

Slurm 的设计目标从一开始就是:**一次提交一个 job,把几十到几万个进程同时启在不同节点上,要么全启,要么不启**——这正是大模型训练每天在做的事。

### 1.1 集群组成

```
                    ┌─────────────────────┐
                    │     slurmctld       │   ← 控制器 (主备双机)
                    │  - 调度决策          │
                    │  - 队列管理          │
                    │  - 节点状态追踪       │
                    │  - 任务记账           │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
        ┌─────────┐      ┌─────────┐      ┌─────────┐
        │ slurmd  │      │ slurmd  │      │ slurmd  │   ← 每节点一个 daemon
        │ Node-01 │      │ Node-02 │      │ Node-N  │   - 启动 / kill 进程
        │ 8×H100  │      │ 8×H100  │      │ 8×H100  │   - 报告资源状态
        └─────────┘      └─────────┘      └─────────┘
              │                │                │
              └────────────────┼────────────────┘
                               │
                       ┌───────┴───────┐
                       │  共享文件系统   │   ← Lustre / GPFS / 自建 NFS
                       │  (代码 / ckpt) │      训练 ckpt 必须共享存储
                       └───────────────┘
                       
       ┌─────────────────────────────────────────────┐
       │  slurmdbd  (可选,记账 / 历史 / 配额数据库)   │
       └─────────────────────────────────────────────┘
```

**就这么简单**——没有 etcd、没有 API Server、没有 controller manager 一堆控制面组件。一个控制器 daemon + 每节点一个 worker daemon + 一个共享盘,完事。千卡集群部署一天搞定,运维一两个人就够。

K8s 那边 etcd 一炸全集群懵,Slurm 这边 slurmctld 切到备机继续工作,正在跑的 job 不受影响——slurmd 拿着任务自己跑,控制器只负责调度新 job。

### 1.2 核心命令(就这五个)

| 命令 | 干什么 | 例子 |
| --- | --- | --- |
| `sbatch` | 提交一个批处理作业 | `sbatch train.sh` |
| `squeue` | 看队列里有什么 | `squeue -u $USER` |
| `sinfo` | 看节点状态 | `sinfo -p gpu` |
| `scancel` | 取消作业 | `scancel 12345` |
| `sacct` | 看历史作业(成功 / 失败 / 资源用量) | `sacct -j 12345` |

加上 `srun`(交互式调试用)、`salloc`(申请资源后开 shell),全部命令一只手数得过来。

```
$ sinfo -p gpu
PARTITION  AVAIL  TIMELIMIT  NODES  STATE  NODELIST
gpu          up    infinite    128   idle   gpu[001-128]
gpu          up    infinite     16   alloc  gpu[129-144]    ← 16 节点正被占
gpu          up    infinite      2   drain  gpu[145-146]    ← 故障隔离

$ squeue
   JOBID PARTITION     NAME     USER  ST       TIME  NODES
   12450       gpu  llama70b   alice   R    8:23:14     16
   12451       gpu     mix7b     bob   R    1:02:30      4
   12452       gpu  qwen32b   carol  PD       0:00      8     ← 排队中
```

---

## 二、为什么大模型训练选 Slurm 而非 K8s

### 2.1 Gang Scheduling 原生

**Gang Scheduling**:N 个进程要么全部同时启动,要么一个都不启。

K8s 的 Pod 调度是**逐个**进行的——你提 16 个 Pod,scheduler 一个个找节点放。如果资源紧,可能放下 14 个,剩 2 个 Pending,前 14 个 Pod 启动后干等——干等就是干烧钱(GPU 一小时几美元)。

Slurm 一行解决:

```bash
sbatch -N 16 --gpus-per-node=8 --ntasks-per-node=8 train.sh
```

要么 16 节点 × 8 卡 = 128 卡同时给你,要么排队等到所有资源齐了再给。**没有"启了一半"的中间态**。

K8s 后来用 Volcano、KubeFlow 的 PyTorchJob、KubeRay 的 RayCluster 补 Gang Scheduling,但都是**在 K8s 之上加一层调度器**——你提的不是 Pod 而是 PyTorchJob CRD,Volcano 等所有节点资源齐了再批量创建 Pod。能做,但是补丁,不如 Slurm 原生顺手。

### 2.2 拓扑感知是默认

详见 19 篇 NCCL 与拓扑——千卡训练的通信量是 GB 级,**8 卡放在同一机箱(NVLink 900 GB/s)和分散在 8 台机器(IB 50 GB/s)差 18 倍**。调度器必须知道哪些节点之间网络近、哪些远。

Slurm 的 HPC 出身决定了它从第一天就有这个概念:

```
slurm.conf:
  TopologyPlugin=topology/tree
  
topology.conf:
  SwitchName=leaf01 Nodes=gpu[001-016]   ← 同一 leaf 交换机
  SwitchName=leaf02 Nodes=gpu[017-032]
  SwitchName=spine  Switches=leaf[01-04]
```

提交 16 节点 job 时,Slurm 优先把 16 个节点放在同一 leaf 下,跨交换机通信能避就避。

```bash
sbatch -N 16 --switches=1 train.sh   # 强制 16 节点必须在同一交换机下
```

K8s 的 Topology Aware Scheduling、Volcano 的 NetworkTopology 在追,但**生态远没成熟**——你要么用 NVIDIA 的 GPU Operator + Network Operator + 自定义 webhook 自己拼,要么直接 Slurm。

### 2.3 故障恢复:Checkpoint + Requeue

千卡训练的现实:**每天都有节点故障**——HBM ECC、IB 链路抖动、电源、风扇、内存 ECC 都能挂。一次预训练跑两个月,期间硬件故障率不是 0,是大约 1-3 次/周(以 1000 节点规模为例,跟着 NVIDIA 的 SHARP 论文与 Meta 的 Llama-3 报告)。

Slurm 的故障恢复模式:

```bash
#!/bin/bash
#SBATCH --job-name=llama70b
#SBATCH --nodes=16
#SBATCH --gpus-per-node=8
#SBATCH --ntasks-per-node=8
#SBATCH --time=72:00:00
#SBATCH --signal=SIGUSR1@90        ← 关键:被 kill 前 90 秒发 SIGUSR1
#SBATCH --requeue                  ← 关键:被 kill 后自动重新排队
#SBATCH --output=logs/%j.out

srun python train.py --ckpt-dir /shared/ckpt/llama70b
```

训练脚本里捕获 SIGUSR1:

```python
import signal, sys

def save_and_exit(signum, frame):
    save_checkpoint(model, optimizer, step)
    sys.exit(0)

signal.signal(signal.SIGUSR1, save_and_exit)
```

效果:节点故障 → Slurm 检测 → 给 job 发 SIGUSR1 → 训练脚本 90 秒内写完 ckpt 退出 → Slurm 自动 requeue → 在剩下健康节点上从最近 ckpt 重启。**全自动,人不在场也能跑过周末**。

K8s 上做同样的事要装 KubeFlow Training Operator + 自己写 ckpt 逻辑 + Pod 重启策略 + StatefulSet,工程量大一截。

### 2.4 节点健康自动隔离

节点出错(NCCL 超时、GPU ECC、温度过高)时 Slurm 自动把节点 drain 掉,新 job 不再分到这台节点上,等运维人介入。

```bash
$ scontrol update NodeName=gpu145 State=DRAIN Reason="NCCL timeout 3 times"
```

```
prolog 脚本(每 job 启动前在每节点跑一次):
  - nvidia-smi 看 GPU 是否健康
  - ibstat 看 IB 链路是否通
  - 跑一段 NCCL allreduce benchmark
  - 任一项失败 → 节点自动 drain
  
epilog 脚本(每 job 结束后跑):
  - nvidia-smi 看是否有 ECC error 累积
  - 清理临时文件
```

NVIDIA 出的 [DCGM Health](https://github.com/NVIDIA/DCGM) + Slurm 的 prolog/epilog 是大规模 GPU 集群的标配组合。

### 2.5 没有控制面 = 运维量极小

K8s 一个生产集群:etcd 集群 3-5 节点 + apiserver 高可用 + scheduler + controller-manager + cloud-controller + ingress + monitoring stack + cert-manager + ……一票控制面组件,**专职 SRE 至少一个人维护**。

Slurm 一个 controller(主备 2 节点)+ 一个 MySQL(slurmdbd 的)+ slurmd 在每个节点。配置文件一份(`slurm.conf` + `topology.conf` + `gres.conf`),改完 `scontrol reconfigure` 全集群生效。**千卡集群一个兼职运维 + 半个 SRE 就够**。

对预训练团队来说,**算力贵,人也贵,运维负担越小越好**——这是 Slurm 在大模型时代二次起飞的隐性原因。

---

## 三、最小可跑的 Slurm 训练脚本

```bash
#!/bin/bash
#SBATCH --job-name=llama-pretrain
#SBATCH --nodes=16                          # 16 节点
#SBATCH --ntasks-per-node=8                 # 每节点 8 个进程(对应 8 卡)
#SBATCH --gpus-per-node=8                   # 每节点 8 GPU
#SBATCH --cpus-per-task=12                  # 每 rank 12 个 CPU(数据 loader)
#SBATCH --mem=0                             # 0 = 用满节点内存
#SBATCH --time=72:00:00
#SBATCH --partition=h100
#SBATCH --signal=SIGUSR1@90
#SBATCH --requeue
#SBATCH --output=logs/%j.out
#SBATCH --error=logs/%j.err

# 关键:从 SLURM 变量推导 NCCL 启动需要的 4 个变量
export MASTER_ADDR=$(scontrol show hostnames $SLURM_JOB_NODELIST | head -n 1)
export MASTER_PORT=29500
export WORLD_SIZE=$SLURM_NTASKS              # 16 × 8 = 128
export RANK=$SLURM_PROCID                    # 由 srun 给每个进程注入

# NCCL 调优(详见 19 篇)
export NCCL_IB_HCA=mlx5
export NCCL_IB_GID_INDEX=3
export NCCL_SOCKET_IFNAME=eth0
export NCCL_DEBUG=WARN                       # INFO 太吵,WARN 出问题再回看

# srun 把进程拉起到 16 × 8 = 128 个 rank
srun --cpu-bind=cores --gpu-bind=closest \
    python -u train.py \
        --model llama-70b \
        --ckpt-dir /shared/ckpt/$SLURM_JOB_NAME \
        --resume-from-latest
```

**几个关键点**:

1. `--ntasks-per-node=8` 加 `--gpus-per-node=8` 等于每张 GPU 一个进程(rank),这是 PyTorch 分布式的标准模型——不要把 8 张卡塞同一个进程用 DataParallel,那个早就死了
2. `MASTER_ADDR` 取 nodelist 第一个节点,这是 NCCL 的 rendezvous 节点
3. `WORLD_SIZE` / `RANK` 由 SLURM 注入,**不需要 torchrun**;PyTorch 直接读环境变量
4. `--cpu-bind=cores --gpu-bind=closest` 让 CPU 和 GPU 在同一 NUMA 域,数据搬运不跨 socket
5. `--resume-from-latest` 在训练脚本里实现:启动时扫 ckpt 目录最新 step,自动恢复

如果你坚持用 torchrun,把最后一行改成:

```bash
srun --cpu-bind=cores torchrun \
    --nnodes=$SLURM_NNODES \
    --nproc-per-node=$SLURM_NTASKS_PER_NODE \
    --rdzv-id=$SLURM_JOB_ID \
    --rdzv-backend=c10d \
    --rdzv-endpoint=$MASTER_ADDR:$MASTER_PORT \
    train.py
```

但纯 srun + 环境变量更轻量,业界主流。

---

## 四、Slurm 任务时序图

```
时间 →

T0:  用户 sbatch 提交 → slurmctld 拿到 job 12450
                       │
T1:  scheduler 找资源 → 找到 gpu[001-016] 16 节点 × 8 卡都空闲
                       │
T2:  prolog 在每节点跑 → nvidia-smi + ibstat + NCCL 健康检查
                       │ (任一节点失败 → 换节点重试,这一步对用户透明)
T3:  srun 启动 128 进程 → 每节点 slurmd 拉起 8 个 python 进程
                       │
T4:  rank 0 (gpu001) 监听 :29500 → 其他 127 rank 连过去 NCCL init
                       │
T5:  训练循环开始 → 每 step forward + backward + AllReduce + ckpt
                       │
T6:  跑 71h59m,T_end - 90s → Slurm 发 SIGUSR1
                       │
T7:  训练脚本捕获信号 → 在 90 秒内 save_checkpoint,sys.exit(0)
                       │
T8:  job 结束 → epilog 跑(清理 + GPU 健康复检)
                       │ 
T9:  --requeue 生效 → job 重新进队列,等下次资源就续训
```

中间任一节点挂了:

```
T5':  gpu007 NCCL 超时 60s (NCCL_TIMEOUT) → 整个 job 卡死
                       │
T6':  Slurm 心跳检测到 gpu007 unresponsive → kill job + drain gpu007
                       │
T7':  job 因 --requeue 重排队 → 调度器在剩 127 节点 + 1 备用节点上重启
                       │
T8':  从 /shared/ckpt 恢复最近 step → 继续训练
```

**人为介入次数:0**——只要 ckpt 频率够高(典型每 500-2000 step 一次)、备用节点池够大,周末撒手不管也能跑。

---

## 五、SkyPilot:Slurm-like 体验跨多云

2024 年起 [SkyPilot](https://github.com/skypilot-org/skypilot) 在 LLM 团队中扩散——UC Berkeley Sky Lab 项目,把 Slurm 的体验搬到 AWS / GCP / Azure / 阿里云 / Lambda Labs / 自建集群。

```yaml
# train.sky.yaml
resources:
  accelerators: H100:8
  cloud: aws            # 或 any 让 SkyPilot 自动找最便宜的
  use_spot: true
  
num_nodes: 16

setup: |
  pip install -r requirements.txt
  
run: |
  torchrun --nnodes=$SKYPILOT_NUM_NODES \
           --nproc-per-node=8 \
           --node-rank=$SKYPILOT_NODE_RANK \
           --master-addr=$SKYPILOT_NODE_IPS_0 \
           train.py
```

```bash
sky launch -c llama-train train.sky.yaml
sky autostop -i 30 llama-train      # 30min idle 自动关
sky exec llama-train "python eval.py"
```

**SkyPilot 能解的事**:

- **多云比价**:同一时间各家 H100 现货价格差 2-3 倍,SkyPilot 自动找便宜的
- **Spot 容灾**:Spot 被回收时自动迁移到 on-demand 或换 region
- **跨云 ckpt 同步**:把 ckpt 写到对象存储,迁移时自动恢复
- **Slurm-like CLI**:`sky launch / sky exec / sky logs / sky cancel` 接近 Slurm 体验
- **统一对接 Kubernetes**:你把自建 K8s 集群也注册进来,SkyPilot 当 Slurm-on-K8s 用

不取代 Slurm 在大集群的位置,**而是给中小团队一个"不养集群也能 Slurm-like 跑训练"的选项**。Anyscale、Together AI、月之暗面公开提到过用 SkyPilot 拉云上 Spot GPU 训练。

---

## 六、K8s + Slurm 的共存模式

2026 大厂主流形态:

```
                    ┌─────────────────────────┐
                    │       业务流量            │
                    └──────────┬──────────────┘
                               ▼
       ┌───────────────────────────────────────────────┐
       │   推理集群 (K8s + Ray Serve + vLLM)            │
       │   - 弹性扩缩容,毫秒级冷启动                   │
       │   - 多租户隔离 (Namespace + ResourceQuota)    │
       │   - GitOps 部署,蓝绿发布                      │
       │   - 故障 Pod 自动重启,标准 K8s 流程            │
       └─────────────────┬─────────────────────────────┘
                         │ 模型 ckpt 流
                         │ (训练 → 推理)
                         ▼
       ┌───────────────────────────────────────────────┐
       │   训练集群 (Slurm)                             │
       │   - 1000+ H100,IB 全互联                      │
       │   - 共享 Lustre / GPFS 存 ckpt                │
       │   - Gang Scheduling + Topology + Requeue      │
       │   - 训练任务排队,跑完自动归还资源             │
       └───────────────────────────────────────────────┘
                         ▲
                         │
       ┌─────────────────┴─────────────────────────────┐
       │  统一接入层:SkyPilot / Run:ai / Lepton        │
       │  - 用户提同一份 yaml,后端自动选 K8s 还是 Slurm │
       │  - 推理走 K8s,训练走 Slurm,实验走云上 Spot    │
       └───────────────────────────────────────────────┘
```

**为什么不强行统一到一边**?

- 推理走 Slurm:Slurm 缺自动扩缩容、缺路由、缺多租户隔离、缺滚动更新——硬上等于自己造一个 K8s 子集
- 训练走 K8s:Pod 漂移、控制面单点故障、Gang Scheduling 是补丁、拓扑感知是补丁、千卡运维负担重

**两边各擅长一块,中间用 SkyPilot / Run:ai / Lepton 这类统一调度层做 facade**——用户写一份配置,后端按工作负载类型路由到合适的调度器。

---

## 七、什么时候选哪个

| 团队规模 | 工作负载 | 推荐 |
| --- | --- | --- |
| < 8 节点,推理为主 | LLM 推理服务 | K8s + KubeRay + vLLM |
| < 8 节点,训练为主 | SFT / LoRA / 中小模型 | K8s + KubeFlow Training Operator,或直接 Ray |
| 8-32 节点,混合 | 训练 + 推理 + 实验 | K8s + Volcano,或引入 SkyPilot 屏蔽差异 |
| 32-128 节点,训练重 | 中大型预训练 | Slurm 主用,推理另起 K8s |
| 128+ 节点,千卡训练 | 大规模预训练 | Slurm 几乎是唯一选择 |
| 不养集群,云上 Spot | 短期实验 / 中等规模训练 | SkyPilot |
| 严格多租户 + GPU 共享 | 内部 PaaS / 教育云 | K8s + MIG + Volcano,或 Run:ai |

**几个反例**:

- 8 节点小集群上 Slurm:Slurm 能用,但 K8s 上的 Ray / KubeFlow 生态丰富、故障恢复也够用,Slurm 的优势用不出来
- 千卡集群上纯 K8s:能跑,但 Volcano / Kueue / KubeFlow 一票补丁堆起来后,运维成本反过来超过 Slurm,且千卡 Gang Scheduling 出错率比 Slurm 高
- 推理服务上 Slurm:推理需要自动扩缩容、滚动更新、多租户、流量切分——这些 K8s 体系成熟,Slurm 几乎全要自己造

---

## 八、踩过的坑

**坑 1:NCCL 超时默认 30 分钟,够长但不够智能**

NCCL 默认 `NCCL_TIMEOUT=1800s`,任一 rank 卡住 30 分钟才报超时。如果是数据 loader 慢或 ckpt 写入慢,30 分钟里整个 job 啥也干不了。生产实践:

```bash
export NCCL_TIMEOUT=600                       # 10 分钟即可
export TORCH_NCCL_HEARTBEAT_TIMEOUT_SEC=120   # 心跳更勤
```

**坑 2:`#SBATCH --signal=SIGUSR1@90` 的 90 秒不够**

70B+ 模型 ckpt 写入 Lustre 经常 60-120 秒,90 秒边界值。生产实践改成 300 秒,且 ckpt 异步写(主进程算下一步,后台进程刷盘)。

**坑 3:共享文件系统是隐性瓶颈**

128 节点 × 8 进程同时启动,数据 loader 同时去 Lustre 拉数据,把 metadata 服务器打爆。解决:

- 数据预先 shuffle 后切 1024 份,每个 rank 只读自己的那份
- 用 WebDataset / MosaicML StreamingDataset 把数据预打包成 shard,顺序读
- 大文件 prefetch + 本地 SSD cache

**坑 4:`--mem=0` 让进程占满节点内存,触发 OOM kill**——OS 的 OOM killer 仍在,建议显式 `--mem=512G`(节点 1TB 留一半给系统)。

**坑 5:slurmctld 备机切换时 pending job 会被重排**——默认 backfill 调度器主备切换时会重排队列,生产用 `PriorityType=priority/multifactor` + 显式优先级配置。

---

## 九、看完这一篇,你应该能

- 解释 Slurm 集群的三个组件(slurmctld + slurmd + 共享盘),为什么比 K8s 控制面轻 10 倍
- 默写五个核心命令(sbatch / squeue / sinfo / scancel / sacct)
- 写一个最小的 sbatch 脚本,把 16 节点 × 8 卡 NCCL 训练拉起来,推导 MASTER_ADDR / WORLD_SIZE / RANK
- 解释为什么大模型训练需要 Gang Scheduling,K8s 上 Volcano / KubeFlow 是怎么补这一块的
- 用 `--signal=SIGUSR1@90 --requeue` + 信号捕获写一个故障自愈的训练脚本
- 说清楚 K8s + Slurm 共存的现代大厂模式:推理 K8s,训练 Slurm,中间 SkyPilot
- 在 8 / 32 / 128 节点三种规模下,给团队选合适的调度方案

下一篇:**29 推理服务的成本与吞吐** — TTFT / TPOT / Throughput 三件套,云上 H100 时薪 × 模型规模,一张表算清楚每千 token 成本,SLO 怎么定,弹性扩缩用什么指标触发。
