# K8s 上的 GPU:Device Plugin、MIG、KubeRay、Volcano

K8s 调度 CPU / 内存 / 普通 Pod 是 backendLearning 已经讲过的事——本篇**只补 GPU 特殊性**。GPU 不是「另一种 CPU」:它有驱动 / NVLink 拓扑 / MIG 切分 / 显存 / 整张卡不可分时复用,默认 K8s 调度器对这些都是瞎的。这一篇把 GPU 在 K8s 上的整套机制拉清楚:Device Plugin 怎么暴露卡、GPU Operator 干什么、MIG vs vGPU 的取舍、拓扑感知调度的痛、Gang Scheduling 为什么是大模型训练的刚需、KubeRay 把 25 / 26 篇的 Ray 部署到 K8s 上,以及——**为什么 K8s 在大规模训练上仍干不过 Slurm**(28 篇)。

> 一句话先记住:**K8s 把 GPU 当成 extended resource(`nvidia.com/gpu`)**,通过 Device Plugin 上报、GPU Operator 一键装好整套依赖、MIG 把 H100 切 7 份做多租户、KubeRay 在 K8s 上声明 RayCluster CRD;但 K8s 默认调度器不懂 NVLink 拓扑、不会 gang scheduling,**所以大模型训练业界仍偏 Slurm**。

---

## 一、K8s 调度 GPU 的基本机制

K8s 原生只懂 CPU / memory / ephemeral-storage 三种资源——GPU 是「extended resource」,要靠 Device Plugin 框架接进来:

```
节点上有 8 张 H100,K8s 怎么知道?

      ┌──────────────────────────────┐
      │  Worker Node                  │
      │  ┌────────────────────────┐  │
      │  │  kubelet                 │  │
      │  │  ┌──────────────────┐   │  │
      │  │  │ Device Plugin      │   │  │   ← NVIDIA 出品的进程
      │  │  │ (nvidia-device-    │   │  │     扫 /dev/nvidia*、跑 nvml
      │  │  │   plugin DaemonSet)│   │  │     上报「这节点有 8 张卡」
      │  │  └──────────────────┘   │  │
      │  └────────────────────────┘  │
      │  ┌────────────────────────┐  │
      │  │  GPU 0  GPU 1  GPU 2 ...  │
      │  └────────────────────────┘  │
      └──────────────────────────────┘
                    │
                    │ gRPC 上报: nvidia.com/gpu = 8
                    ▼
              ┌──────────┐
              │ API Server│
              └──────────┘
                    ▲
                    │
              ┌──────────┐
              │ Scheduler│  ← Pod 声明 nvidia.com/gpu: 1
              └──────────┘     调度到有空闲卡的节点
```

### 1.1 Pod 声明 GPU 资源

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: vllm-server
spec:
  containers:
  - name: vllm
    image: vllm/vllm-openai:latest
    args: ["--model", "llama-70b", "--tensor-parallel-size", "2"]
    resources:
      limits:
        nvidia.com/gpu: 2          # 这个 Pod 要 2 张 GPU
      requests:
        cpu: "8"
        memory: "64Gi"
```

**关键点**:
- 只能写 `limits`,因为 GPU 是整数、不可压缩资源(写 `requests` 必须等于 `limits`)
- 调度器把 Pod 调度到 ≥ 2 张空闲卡的节点
- kubelet 通过 Device Plugin 把 `/dev/nvidia0` `/dev/nvidia1` 挂进容器
- 容器内 `nvidia-smi` 只看到这 2 张卡(其他被屏蔽)

### 1.2 还差什么:驱动、CUDA、container toolkit

光有 Device Plugin 不够,节点上还得有:
- **NVIDIA 内核驱动**(`nvidia.ko`,跟内核版本匹配)
- **container-toolkit / nvidia-runtime-hook**(让 Docker / containerd 把 GPU 挂进容器)
- **DCGM Exporter**(监控)

手动装一遍每台机器,踩坑无数——这就是 GPU Operator 存在的理由。

---

## 二、NVIDIA GPU Operator:一键装齐生态

GPU Operator 是个 K8s Operator,装上后**自动**在每个 GPU 节点上跑一组 DaemonSet:

```
GPU Operator 部署后:
   ├─ nvidia-driver-daemonset       (装 / 升级 driver,容器化驱动)
   ├─ nvidia-container-toolkit      (容器运行时 hook)
   ├─ nvidia-device-plugin          (上报 GPU 给 kubelet)
   ├─ nvidia-dcgm-exporter          (Prometheus 抓 GPU 指标)
   ├─ nvidia-mig-manager            (动态配 MIG 切片)
   ├─ gpu-feature-discovery         (打 label:有几张 H100、是否 MIG)
   └─ nvidia-cuda-validator         (启动时跑个 sample 验证)
```

部署一行 helm:

```bash
helm install --wait gpu-operator \
  -n gpu-operator --create-namespace \
  nvidia/gpu-operator
```

**生产标配**——没有 GPU Operator,手动维护几十台 GPU 节点的驱动版本灾难。

---

## 三、MIG:H100 一张卡切 7 份

MIG(Multi-Instance GPU)是 Hopper / Ampere 的硬件特性——**一张 GPU 在硬件层切成多个独立实例,各自有独立 SM / L2 / HBM**。不是软件时分复用,是物理隔离。

### 3.1 H100 80GB 的 MIG 切分布局

```
H100 一整张卡 (80GB HBM, 132 SM, 全部 NVLink 带宽)
┌────────────────────────────────────────────────────┐
│                                                      │
│   GPU Engine: 7 个 GPC,可切分到不同 MIG 实例           │
│                                                      │
└────────────────────────────────────────────────────┘

切成 7 份(1g.10gb × 7):
┌────────┬────────┬────────┬────────┬────────┬────────┬────────┐
│ 1g.10gb│ 1g.10gb│ 1g.10gb│ 1g.10gb│ 1g.10gb│ 1g.10gb│ 1g.10gb│
│ 10GB   │ 10GB   │ 10GB   │ 10GB   │ 10GB   │ 10GB   │ 10GB   │
│ 1/7 SM │ 1/7 SM │ 1/7 SM │ 1/7 SM │ 1/7 SM │ 1/7 SM │ 1/7 SM │
└────────┴────────┴────────┴────────┴────────┴────────┴────────┘

切成 3 份(2g.20gb + 2g.20gb + 3g.40gb):
┌──────────────────┬──────────────────┬───────────────────────┐
│   2g.20gb         │   2g.20gb         │    3g.40gb            │
│   20GB / 2/7 SM   │   20GB / 2/7 SM   │    40GB / 3/7 SM      │
└──────────────────┴──────────────────┴───────────────────────┘

每个实例:
  - 独立 SM / 独立 L2 cache slice / 独立 HBM 切片
  - 故障隔离(一个实例 crash 不影响其他)
  - 容器看到的是「一张完整 GPU」,nvidia-smi 显示自己分到的资源
```

### 3.2 MIG 适用场景

| 场景 | MIG 是否合适 |
| --- | --- |
| 多团队共享一张 H100 做小模型推理(7B 以下) | 合适 |
| Notebook / 学生作业服务 | 合适 |
| 服务化推理(QPS 不高但要隔离) | 合适 |
| 大模型推理(70B,要 NVLink 通信) | 不合适(MIG 实例没有 NVLink) |
| 训练 | 几乎不合适(无 NVLink) |

**MIG 实例之间没有 NVLink 通信**——MIG 是为「独立工作负载」设计的,不是为「协同工作」。

### 3.3 在 K8s 上用 MIG

GPU Operator 的 mig-manager 支持 strategy:
- `single`:整节点统一切法(所有卡切成 7×1g.10gb)
- `mixed`:不同卡不同切法(灵活但管理复杂)

Pod 声明变成:

```yaml
resources:
  limits:
    nvidia.com/mig-1g.10gb: 1     # 要一个 1g.10gb 切片
```

---

## 四、vGPU:商业的时分复用方案

| 维度 | MIG | vGPU |
| --- | --- | --- |
| 隔离方式 | **硬件分区**(各自独立 SM/L2/HBM) | **时分复用**(轮转分配 SM 时间) |
| 卡支持 | Ampere / Hopper / Blackwell 部分型号 | 几乎全系列 |
| 性能干扰 | 几乎无 | 有(邻居噪声) |
| 显存 | 物理切分 | 软件分配 |
| 切分粒度 | 固定档位(7/4/3/2/1) | 灵活 |
| 故障隔离 | 强 | 弱 |
| 商业 / 开源 | 开源(驱动 / Operator) | **NVIDIA 商业 license** |
| 主流场景 | AI 推理多租户 | VDI(虚拟桌面)、传统图形 |

**AI 工作负载用 MIG**,vGPU 这个东西更多在虚拟桌面 / CAD 场景。

---

## 五、拓扑感知调度:K8s 默认调度器的瞎点

### 5.1 痛在哪

一台 8 卡 H100 服务器内部,8 张卡的物理布局类似:

```
              ┌─────────── CPU 0 / Memory ───────────┐
              │           NUMA 0                       │
              │      PCIe Root Complex 0               │
              │      ┌────┐ ┌────┐ ┌────┐ ┌────┐     │
              │      │GPU0│ │GPU1│ │GPU2│ │GPU3│     │
              │      └────┘ └────┘ └────┘ └────┘     │
              │       │     │     │     │             │
              │       └─NVSwitch (NVLink 全互联)──┐   │
              │                                    │   │
              ├─────── Inter-socket UPI ───────────┼──┤
              │                                    │   │
              │      ┌────┐ ┌────┐ ┌────┐ ┌────┐  │  │
              │      │GPU4│ │GPU5│ │GPU6│ │GPU7│  │  │
              │      └────┘ └────┘ └────┘ └────┘  │  │
              │      PCIe Root Complex 1            │  │
              │           NUMA 1                     │  │
              └─────── CPU 1 / Memory ──────────────┘
```

实际上 H100 服务器有全互联 NVSwitch,8 卡内部任意两两 NVLink 900 GB/s——但**跨节点**走 InfiniBand,带宽差 20 倍。

K8s 默认调度器**只看「这节点有几张空闲 GPU」**,不看:
- 这几张卡之间有没有 NVLink
- 是不是跨 NUMA / 跨 PCIe root
- 多个 Pod 是不是该绑到同一节点

**结果**:你声明一个 2 卡训练 Pod,调度器可能把它放到「同节点但跨 PCIe 不同 root」的两张卡上,通信带宽腰斩。

### 5.2 应对方案

| 方案 | 干什么 |
| --- | --- |
| **Topology Manager**(kubelet 内置) | 节点本地的 CPU / NUMA / Device 亲和性策略 |
| **Volcano** | 调度器替换,支持拓扑感知 + gang scheduling |
| **Kueue** | Job 排队 + 配额,可与拓扑插件配合 |
| **KubeRay Placement Group** | Ray Cluster 内部自己做拓扑约束(详见下文) |
| **Run:AI / Bytedance Volcano fork** 等闭源方案 | 商业增强 |

实际工程中,**Volcano 或 Kueue 是大多数 GPU 集群的默认选择**——纯原生 K8s 调度器在 LLM 训练场景跑不动。

---

## 六、Gang Scheduling:训练的刚需

### 6.1 痛在哪

训练一个 70B 模型要 64 张 GPU 同时启动,**缺一张都没法开始**(NCCL init 集合通信需要全员都在)。K8s 默认逐个调度 Pod:

```
T0:  Pod1 (1 GPU) 调度成功
T1:  Pod2 (1 GPU) 调度成功
T2:  Pod3 (1 GPU) 调度失败,集群暂时没卡
T3:  Pod1, Pod2 卡在 NCCL init 等 Pod3 ...
     占着 GPU 不干活,资源浪费

T8:  其他任务释放 GPU,Pod3 终于调度成功
T9:  64 个 Pod 终于全部 ready,NCCL 完成 init
T10: 训练开始
```

期间 Pod1-Pod63 占着 GPU 不干活,**集群资源利用率塌陷**。

### 6.2 Gang Scheduling 怎么解

`gang` = 一组 Pod **要么全调度成功,要么都不调度**——避免半启动状态。

```
Volcano PodGroup:
   声明 minAvailable=64
   只有当 64 个 Pod 都能调度时,才把它们一起放出去
   否则全员等待(在 queue 中)
```

Volcano / Kueue / KubeRay 都支持。**大模型训练在 K8s 上必须开 gang scheduling**,否则集群资源利用率会塌到 30%。

### 6.3 配置示例(Volcano)

```yaml
apiVersion: scheduling.volcano.sh/v1beta1
kind: PodGroup
metadata:
  name: train-70b
spec:
  minMember: 64                    # 必须 64 个一起调度
  priorityClassName: high
  queue: training-queue

---
apiVersion: batch/v1
kind: Job
metadata:
  name: train-70b
  annotations:
    scheduling.volcano.sh/podgroup: train-70b
spec:
  parallelism: 64
  template:
    spec:
      schedulerName: volcano        # 用 Volcano 调度器
      containers:
      - resources:
          limits:
            nvidia.com/gpu: 1
```

---

## 七、KubeRay:Ray 在 K8s 上的官方姿势

25 / 26 篇讲的 Ray 集群在生产几乎都通过 KubeRay 部署——KubeRay 是个 Operator,把 Ray 集群抽象成 K8s 自定义资源(CRD)。

```yaml
apiVersion: ray.io/v1
kind: RayCluster
metadata:
  name: llm-serving
spec:
  rayVersion: '2.10.0'
  headGroupSpec:
    template:
      spec:
        containers:
        - name: ray-head
          image: rayproject/ray:2.10.0-py310-gpu
          resources:
            limits:
              cpu: "4"
              memory: 16Gi

  workerGroupSpecs:
  - replicas: 4
    minReplicas: 1
    maxReplicas: 16                # 自动扩缩到 16
    groupName: gpu-workers
    template:
      spec:
        schedulerName: volcano      # gang scheduling
        containers:
        - name: ray-worker
          image: rayproject/ray:2.10.0-py310-gpu
          resources:
            limits:
              nvidia.com/gpu: 1
              cpu: "8"
              memory: 64Gi
```

**KubeRay 干的事**:
- 把 RayCluster CRD 翻译成 K8s Pod / Service / ConfigMap
- 监控 worker pod 健康,自动重启
- 暴露 Ray Dashboard 和 client endpoint
- 与 Ray Autoscaler 配合:Ray 内部 pending actor → KubeRay 扩 worker pod

**Ray Serve 部署也走 RayService CRD**——一行 `kubectl apply` 上一个推理服务。

---

## 八、典型 LLM 训练集群在 K8s 的拓扑

```
                  ┌──────────────────────────────────┐
                  │  K8s Control Plane                  │
                  │  - API Server                       │
                  │  - Volcano Scheduler (gang)         │
                  │  - GPU Operator (CRD)               │
                  │  - KubeRay Operator                 │
                  │  - Kueue (Job queue)                │
                  │  - Prometheus + DCGM Exporter       │
                  └──────────────────────────────────┘
                                  │
       ┌──────────────────────────┼──────────────────────────┐
       ▼                          ▼                          ▼
┌───────────────┐         ┌───────────────┐         ┌───────────────┐
│ GPU Node Pool 1│         │ GPU Node Pool 2│         │ GPU Node Pool 3│
│ (8 × H100,     │         │ (8 × H100,     │         │ (8 × A100,     │
│  NVSwitch,     │         │  NVSwitch,     │         │  老存量,推理) │
│  IB 400G)      │         │  IB 400G)      │         │                │
│                │         │                │         │                │
│ Daemonset:     │         │ Daemonset:     │         │ Daemonset:     │
│  - nvidia-     │         │  - nvidia-     │         │  - nvidia-     │
│    driver      │         │    driver      │         │    driver      │
│  - device-     │         │  - device-     │         │  - device-     │
│    plugin      │         │    plugin      │         │    plugin      │
│  - dcgm-       │         │  - dcgm-       │         │  - dcgm-       │
│    exporter    │         │    exporter    │         │    exporter    │
│                │         │                │         │                │
│ Workload:      │         │ Workload:      │         │ Workload:      │
│  Train Job     │         │  Train Job     │         │  Ray Serve     │
│  (RayCluster)  │         │  (RayCluster)  │         │  (RayService)  │
│  64 GPU Worker │         │  ↑ 上面继续          │ MIG 1g.10gb x 56 │
└───────────────┘         └───────────────┘         └───────────────┘
                                  │
                                  ▼
                  ┌──────────────────────────────────┐
                  │     共享存储                          │
                  │  - 模型权重:对象存储 (S3 / OSS)     │
                  │  - 训练数据:Lustre / WekaFS / NFS   │
                  │  - Checkpoint:S3 / 对象存储         │
                  └──────────────────────────────────┘
```

**几个细节**:
- 训练池(Volcano + gang)和推理池(KubeRay + autoscale)隔离,避免资源抢占
- 推理池的旧卡可以开 MIG 做小模型多租户
- Storage 必须高带宽——加载 70B 权重要 140 GB 数据,慢盘启动几分钟
- DCGM Exporter + Prometheus + Grafana 是监控标配

---

## 九、多租户配额与监控

### 9.1 配额

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: team-llm-quota
  namespace: team-llm
spec:
  hard:
    requests.nvidia.com/gpu: "32"        # 整个 namespace 最多 32 GPU
    requests.memory: 2Ti
    pods: "100"
```

**LLM 团队的典型分配**:一个团队一个 namespace,配额按用途分:训练 64 GPU、推理 16 GPU、实验 8 GPU。

Kueue 在此基础上提供「公平共享 + 抢占」——闲时多用,忙时抢回。

### 9.2 监控:DCGM Exporter

DCGM Exporter 暴露的关键指标(Prometheus 格式):

| 指标 | 含义 | 看什么 |
| --- | --- | --- |
| `DCGM_FI_DEV_GPU_UTIL` | SM 使用率(%) | 训练应 > 80%,< 50% 一定有问题 |
| `DCGM_FI_DEV_MEM_COPY_UTIL` | HBM 带宽利用率 | 推理 decode 应接近上限 |
| `DCGM_FI_DEV_FB_USED` | 已用显存(MB) | 接近上限要警惕 OOM |
| `DCGM_FI_DEV_GPU_TEMP` | 温度 | > 85℃ 触发降频 |
| `DCGM_FI_DEV_POWER_USAGE` | 功耗(W) | 单卡 H100 SXM 700W TDP |
| `DCGM_FI_PROF_PIPE_TENSOR_ACTIVE` | Tensor Core 利用率 | 训练效率核心指标 |

**容易忽略**:`DCGM_FI_DEV_GPU_UTIL = 100%` 不代表 Tensor Core 跑满——可能只是某个 SM 在跑 memory copy。看真正算力要看 `PIPE_TENSOR_ACTIVE`。

---

## 十、为什么大规模训练业界仍偏 Slurm

K8s 在推理 / 中小训练已经接近全面替代,但**千卡以上大模型训练,业界仍偏 Slurm**。原因清单:

| 痛点 | K8s 现状 | Slurm 现状 |
| --- | --- | --- |
| **CNI 影响 NCCL 性能** | Calico / Flannel 等 overlay 可能让 RDMA 不直通,要专门配 Multus + SR-IOV | Slurm 直接给你裸机,IB 原生 |
| **kubelet OOM Killer** | 大模型 forward 显存波动,kubelet 可能误判 cgroup OOM 把 Pod 杀掉 | 无此问题(无 cgroup OOM 干扰) |
| **故障恢复** | Pod 挂了重启,但整个 NCCL world 要重组,Job 重启慢 | Slurm 的 checkpoint-restart 机制成熟 |
| **拓扑感知** | 要靠 Volcano / Topology Manager 拼;默认调度器盲 | Slurm 原生支持 `--gres=gpu:8 --constraint="nvswitch"` |
| **大 Job 调度延迟** | etcd / scheduler 的延迟在 N>1000 Pod 时显著 | Slurm 控制器单进程内排队,微秒级 |
| **存储挂载** | PVC / CSI 在万卡场景下抖动 | 直接挂 Lustre / GPFS,运维熟悉 |
| **生态契合** | DevOps / 微服务文化 | HPC / 科研文化 |

**不是 K8s 不行,是 K8s 的设计目标(无状态微服务)与大模型训练的需求(强状态、紧耦合、高带宽)存在 impedance mismatch**。28 篇会展开 Slurm 视角。

业界趋势:
- 推理 / 中小训练 / 数据 / Serving → K8s 已统一(KubeRay + Volcano + Kueue)
- 千卡以上 pretrain → 仍以 Slurm 为主,部分团队用 K8s + 大量补丁(Meta、字节)
- 趋势是「**训练用 Slurm**,**推理 / 应用用 K8s**,**KubeRay 桥接**」

---

## 十一、看完这一篇,你应该能

- 解释 K8s 调度 GPU 的基本机制:Device Plugin / extended resource / Pod 资源声明
- 知道 GPU Operator 替你装了什么(driver + toolkit + plugin + DCGM + MIG manager)
- 在白板上画 MIG 切分布局,解释为什么 MIG 适合多租户推理而不适合训练
- 区分 MIG 和 vGPU 的隔离机制,知道 AI 工作负载应该选 MIG
- 说出拓扑感知调度的痛点,知道 Volcano / Topology Manager / KubeRay Placement Group 解决什么
- 解释 Gang Scheduling 为什么是训练刚需,会写 Volcano PodGroup 配置
- 知道 KubeRay 把 RayCluster / RayService 包装成 K8s CRD
- 默写典型 LLM 集群在 K8s 的拓扑(训练池 + 推理池 + 共享存储 + 监控)
- 说出 DCGM Exporter 的关键指标,知道 GPU_UTIL 不等于 Tensor Core 利用率
- 解释为什么大规模训练仍偏 Slurm(CNI / OOM Killer / 故障恢复 / 拓扑 / 调度延迟)

下一篇:**28 Slurm 与 HPC 调度** — 大模型训练为什么不用 K8s 用 Slurm,Slurm 的 partition / job / step 心智,多节点 NCCL 的启动姿势,故障恢复机制,以及 Slurm 在 LLM 时代的回潮。
