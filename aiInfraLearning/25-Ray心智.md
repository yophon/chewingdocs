# Ray 心智:Actor、Task、Object Store

到了第五层,要从「单个推理引擎 / 单个训练任务」切到「**集群一侧**」——你训练 70B 要 64 张卡协同、推理服务要 8 个副本自动扩缩、超参搜索要并发跑 200 组、数据预处理要 1000 个进程,这些都不是 PyTorch 自己能搞定的事。Ray 就是 AI 圈过去五年内卷出来的事实编排层——**一个分布式 Python 运行时**,上面长出了 Train / Serve / Data / Tune / RLlib 一整套生态。这一篇拉清楚 Ray 的心智,后面 26 篇讲 Ray Serve + vLLM,27 篇讲 K8s 上的 GPU,KubeRay 把这两层串起来。

> 一句话先记住:**Ray = 分布式 Python = Task(无状态远程函数)+ Actor(有状态远程对象)+ Object Store(共享内存对象池)**;它不是 Spark 的替代品,是 Spark 在 AI 工作负载下水土不服后,Python + PyTorch 生态自己长出来的运行时。看 AI 项目的 stack 时,看到 `@ray.remote` 就知道是这套。

---

## 一、为什么 AI 工程链不直接用 Spark / K8s

### 1.1 Spark 的水土不服

Spark 在数据工程那侧封神,到了 AI 这边几乎用不动:

```
Spark 的世界                         AI 工作负载
─────────────                       ──────────────
JVM (Scala/Java)                     Python + PyTorch
DataFrame + SQL                       任意 Python 对象、张量、模型
批 + 微批                             长任务(训练几天)+ 服务化(常驻)
无状态算子为主                        强状态(模型权重几十 GB 不能反复传)
                                     
对长跑 GPU 任务、Actor 模型的支持都不是
Spark 的设计目标,硬塞进去全是补丁。
```

**根本原因**:Spark 是 JVM 上的 DataFrame 引擎,AI 圈是 Python + PyTorch 生态——两边语言、抽象、状态模型都不一致。

### 1.2 K8s 不够细

K8s 是「Pod 一级」的编排,适合部署服务、跑 Job,但**它不知道你 Python 进程之间在传什么张量、谁拿着模型权重、哪几个进程必须一起调度到 NVLink 域内**。让你写个超参搜索,K8s 帮不了你,得自己搞 200 个 Job、收集结果、串通信。

### 1.3 Ray 的定位

```
K8s 是「集群本身的编排」(Pod / Node / 资源)
Ray 是「集群内的运行时」(Python 函数 / Python 对象 / 张量传递)

二者不是替代,是叠加。
生产上: Ray on K8s = KubeRay(详见 27 篇)
```

**Ray 干的是 Spark 想干但因为 JVM 干不了的事**:让你写一段 Python,在几十台机器上像写单机程序一样跑,且支持有状态对象、零拷贝大对象传递、GPU 资源声明。

---

## 二、三个核心抽象

Ray 的全部 API 表面就三件东西。看懂这三个,Ray 就懂了一半。

### 2.1 Task:无状态远程函数

```python
import ray
ray.init()

@ray.remote
def heavy_compute(x):
    return x * x

# 调用变成异步,返回 ObjectRef(future)
futures = [heavy_compute.remote(i) for i in range(100)]

# 拉结果(阻塞)
results = ray.get(futures)
```

**关键点**:
- `@ray.remote` 把普通函数变成「可远程调度的任务」
- `f.remote(...)` 不阻塞,立即返回 `ObjectRef`
- Ray 调度器把 100 个 task 分发到集群空闲 CPU 上
- 任务无状态——每次 `f.remote()` 都是独立一次

**适合**:数据预处理、并行 map、超参搜索的单次试验。

### 2.2 Actor:有状态远程对象

```python
@ray.remote(num_gpus=1)
class ModelServer:
    def __init__(self, model_path):
        self.model = load_model(model_path)   # 大模型只加载一次

    def predict(self, x):
        return self.model(x)

# 创建一个 Actor(一个独立 Python 进程,占 1 张 GPU)
server = ModelServer.remote("/models/llama-70b")

# 反复调用,模型常驻
for batch in stream:
    pred = ray.get(server.predict.remote(batch))
```

**关键点**:
- `@ray.remote` 修饰类 → Actor
- `ClassName.remote(...)` 创建 Actor 实例 = **集群上的一个独立进程,持续存在**
- 方法调用 `actor.method.remote(...)` 路由到该 Actor 进程
- 状态留在 Actor 进程内(模型权重、计数器、缓存)

**适合**:模型推理服务、参数服务器、训练 worker、状态机。

### 2.3 Object Store:共享内存对象池

每个节点上跑一个 **Plasma** 共享内存进程,所有 Task / Actor 之间传大对象走这里:

```python
import numpy as np

# 大数组(几 GB)
arr = np.random.rand(10000, 10000)

# 显式 put 进 store
arr_ref = ray.put(arr)

# 后面所有 task / actor 拿 arr_ref,Ray 会做零拷贝
@ray.remote
def consume(ref):
    data = ray.get(ref)   # 同节点 → mmap 共享内存(零拷贝)
                          # 跨节点 → 一次网络传输,本地缓存
    return data.sum()

results = ray.get([consume.remote(arr_ref) for _ in range(10)])
```

**为什么需要 Object Store**:
- Python 没有共享内存(GIL),进程间传对象默认要 pickle + 复制
- 大张量 / 大模型权重传一次几个 GB,反复 pickle 灾难
- Plasma 把对象一次放入共享内存,同节点多进程 mmap 直接读

```
节点 A                                节点 B
┌─────────────────────────┐            ┌─────────────────────────┐
│  Worker1 ─┐             │            │  Worker3                │
│            ├─→  Plasma ─┼────网络────┼─→  Plasma  ←─ Worker4   │
│  Worker2 ─┘  shm  ┃     │            │   shm  ┃                │
└─────────────────────────┘            └─────────────────────────┘
                                       
ray.put(arr) → Plasma                  跨节点首次 ray.get → 网络拉一次
ray.get(ref) → mmap (零拷贝)            之后本节点其他进程 → mmap (零拷贝)
```

---

## 三、集群拓扑:GCS + Raylet

Ray 集群的物理形态:

```
                     ┌─────────────────────────────────┐
                     │           Head Node              │
                     │  ┌──────────────────────────┐    │
                     │  │       GCS (控制面)         │    │
                     │  │  - 集群元数据             │    │
                     │  │  - Actor 注册表           │    │
                     │  │  - 资源 / 调度状态        │    │
                     │  │  - 持久化到 Redis/内置 KV │    │
                     │  └──────────────────────────┘    │
                     │  ┌──────────────────────────┐    │
                     │  │  Raylet (本地数据面)       │    │
                     │  │  Plasma Object Store      │    │
                     │  │  Worker Processes         │    │
                     │  └──────────────────────────┘    │
                     └─────────────────────────────────┘
                                     │
                                     │ gRPC
                ┌────────────────────┼────────────────────┐
                ▼                    ▼                    ▼
       ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
       │ Worker Node 1│     │ Worker Node 2│     │ Worker Node 3│
       │              │     │              │     │              │
       │  Raylet      │     │  Raylet      │     │  Raylet      │
       │  Plasma      │     │  Plasma      │     │  Plasma      │
       │  Worker x N  │     │  Worker x N  │     │  Worker x N  │
       │              │     │              │     │              │
       │  GPU / CPU   │     │  GPU / CPU   │     │  GPU / CPU   │
       └──────────────┘     └──────────────┘     └──────────────┘

GCS  = 全局控制面:谁是 Actor、有哪些资源、哪个 task 在哪个节点
Raylet = 节点本地的调度器 + Object Store 守护:把 task 放到本节点 Worker 上
Worker = 真正跑你 Python 函数 / Actor 类的进程
```

**关键设计**:
- **GCS 是单点**(早期版本),2.0 之后加了 fault-tolerant 模式(Redis HA)
- **Raylet 自治**:大部分调度决策本地做,不跟 GCS 同步
- **Worker 是池化的**:Ray 提前 fork 出一批 Python 进程,task 来了直接复用

---

## 四、Placement Group:把卡绑到一起

GPU 训练的痛点:**两张 GPU 跨节点 / 跨 NUMA / 跨 PCIe root,通信带宽差几个数量级**。Ray 默认调度只看「这节点有空闲 GPU」,不看拓扑,放错地方训练慢一倍。

Placement Group 让你声明一组 actor / task **必须放在同一节点 / 同一 NVLink 域**:

```python
from ray.util.placement_group import placement_group, PlacementGroupSchedulingStrategy

# 声明:8 个 bundle,每个要 1 GPU + 4 CPU,全部在同一节点
pg = placement_group(
    bundles=[{"GPU": 1, "CPU": 4} for _ in range(8)],
    strategy="STRICT_PACK"   # 强制同节点
)
ray.get(pg.ready())

# 在这个 pg 上启动 8 个 worker,每个绑一张卡
@ray.remote(num_gpus=1)
class TrainWorker:
    def step(self, batch): ...

workers = [
    TrainWorker.options(
        scheduling_strategy=PlacementGroupSchedulingStrategy(
            placement_group=pg,
            placement_group_bundle_index=i,
        )
    ).remote()
    for i in range(8)
]
```

**四种 strategy**:

| strategy | 含义 | 用例 |
| --- | --- | --- |
| `PACK` | 尽量同节点 | 张量并行训练 |
| `STRICT_PACK` | 必须同节点,放不下报错 | 同上,严格版 |
| `SPREAD` | 尽量分散 | 推理副本(高可用) |
| `STRICT_SPREAD` | 必须分散 | 同上,严格版 |

**Ray Train、Ray Serve 内部都靠 Placement Group 把 GPU worker 编排起来**——你写应用时大多数时候不用直接接触它,但出问题排查时绕不开。

---

## 五、一段最小代码:三件套同框

```python
import ray
import numpy as np

ray.init()  # 本地多进程;集群上传 address="ray://head:10001"

# ===== Task =====
@ray.remote
def preprocess(chunk):
    return chunk.mean(axis=0)

# ===== Actor =====
@ray.remote
class Aggregator:
    def __init__(self):
        self.total = 0.0
        self.n = 0

    def add(self, value):
        self.total += value
        self.n += 1

    def mean(self):
        return self.total / self.n

# ===== Object Store =====
big_data = np.random.rand(1_000_000, 100)   # ~800 MB
data_ref = ray.put(big_data)                # 入 Plasma 一次

agg = Aggregator.remote()                    # Actor 常驻

# 100 个 task 并行处理 chunk,共享同一份 big_data
futures = []
for i in range(100):
    chunk_ref = preprocess.remote(big_data[i*10000:(i+1)*10000])  # task
    agg.add.remote(ray.get(chunk_ref).mean())                      # 路由到 actor

ray.get(agg.mean.remote())
```

`big_data` 不是被 100 个 task 各 pickle 一次(否则 80 GB 网络流量),而是 Plasma 共享内存里一份。**这就是 Ray 在 AI 数据 / 训练流水中的核心价值**。

---

## 六、Ray 生态:在三件套上长出的高层 API

```
                     ┌─────────────────────────────────┐
                     │       AI 应用层                    │
                     ├─────────────────────────────────┤
                     │ Ray Train  Ray Serve  Ray Tune   │
                     │ Ray Data   RLlib                  │
                     ├─────────────────────────────────┤
                     │     Ray Core (Task / Actor /      │
                     │       Object Store / GCS)         │
                     ├─────────────────────────────────┤
                     │       OS / GPU / 网络              │
                     └─────────────────────────────────┘
```

| 组件 | 干什么 | 替代谁 |
| --- | --- | --- |
| **Ray Train** | 分布式训练,包装 PyTorch DDP / FSDP / DeepSpeed | 自己写 `torchrun` |
| **Ray Serve** | 推理服务化(HTTP / gRPC + autoscaling) | TorchServe / TF Serving |
| **Ray Data** | 流式批量数据处理(图像、视频、推理预处理) | Spark / Dask 的轻量替代 |
| **Ray Tune** | 超参搜索(贝叶斯 / Hyperband / PBT) | Optuna / HyperOpt |
| **RLlib** | 强化学习训练框架 | 自己拼 actor + env + replay buffer |

**Ray Train 例子**(DDP 训练):

```python
from ray.train.torch import TorchTrainer
from ray.train import ScalingConfig

def train_loop(config):
    model = build_model()
    model = ray.train.torch.prepare_model(model)   # 自动包 DDP
    for batch in loader:
        loss = model(batch).loss
        loss.backward()
        ...

trainer = TorchTrainer(
    train_loop,
    scaling_config=ScalingConfig(num_workers=8, use_gpu=True),
)
result = trainer.fit()
```

8 个 GPU worker 自动起来、绑定 placement group、NCCL 初始化全交给 Ray。**比手写 `torchrun --nproc_per_node=8` + 多机配置省事**。

Ray Serve 和 vLLM 的组合是 26 篇主题。

---

## 七、为什么 AI 圈选 Ray 而不是 Spark

| 维度 | Spark | Ray |
| --- | --- | --- |
| 语言主线 | JVM (Scala/Java),Python 是 wrapper | Python 原生(C++ 内核 + Python 绑定)|
| 编程模型 | DataFrame + SQL,函数式算子 | Task + Actor,任意 Python 对象 |
| 状态 | 算子无状态(state 靠 Streaming State) | Actor 一等公民,带状态 |
| GPU 支持 | 有但弱(spark-rapids 是 NVIDIA 的补丁) | 一等公民:`num_gpus=1`,Placement Group 拓扑感知 |
| 大对象传递 | Spark 内 `broadcast` 也行,但 JVM 序列化开销 | Plasma 共享内存,零拷贝 |
| 与 PyTorch 集成 | 有 SparkTorchTrainer 但很别扭 | Ray Train 直接包 DDP / FSDP / DeepSpeed |
| 启动开销 | JVM 起几秒;一个 query 几秒 warmup | Python 进程池预热,task 微秒级 |
| 适合负载 | PB 级离线 ETL、SQL | 长跑训练 + 服务化 + 数据流水 |

**Ray 不是要把 Spark 干掉**——Spark 在数据工程的离线 ETL 仍然是王。Ray 的胜利在于:**当 AI 团队的工作流变成「数据预处理 → 训练 → 微调 → 服务化 → 评测」一整条 Python 链时,Ray 是唯一能从头串到尾的 runtime**。

---

## 八、调试与运维经验

### 8.1 本地调试技巧

分布式调试比单机难一个数量级——异常被 ray worker 吃掉、stacktrace 跨进程、断点失效。

```python
# 关键技巧:本地模式
ray.init(local_mode=True)
# 所有 task / actor 串行跑在主进程,可以打断点
```

`local_mode` 适合 dev,不适合压测——它丢失了所有并行性,只验证逻辑。

### 8.2 Dashboard 与 Profiling

```bash
ray dashboard          # 默认 http://127.0.0.1:8265
                       # 看每个节点 CPU/GPU/内存、actor 状态、task 时序
ray timeline > t.json  # Chrome trace 格式
```

`ray timeline` 是排查 Placement Group 是否生效、task 是否串行化的关键工具。

### 8.3 常见坑

1. **Object Store 装满**:大 ndarray 反复 `ray.put` 又不释放 → spill 到磁盘 → 慢。监控 `ray.cluster_resources()["object_store_memory"]`,用完显式 `del ref`
2. **Actor 死锁**:Actor A 调用 Actor B,B 又同步调用 A → 互等。Actor 方法默认串行,得用 `@ray.method(concurrency_group="...")` 或 async actor
3. **GCS 单点**:Head 节点挂全集群挂——生产用 GCS HA + Redis Sentinel
4. **Python 版本 + ray client 版本必须严格一致**:不一致会出诡异序列化错误

---

## 九、局限:Ray 不是银弹

1. **跨语言生态差**:Ray 的 Java / C++ 客户端能用但生态薄,几乎没人在生产用——Ray 就是 Python 的运行时
2. **Object Store 大对象 GC 抖动**:Plasma 用引用计数 + LRU,大对象释放时偶发卡顿;长跑服务要监控
3. **冷启动慢**:启动一个 Ray 集群(KubeRay 拉 image + GCS 起来)几十秒到几分钟;不适合「秒级弹性」
4. **不是 K8s 的替代**:Ray 不管你 image、不管 service mesh、不管证书——这些还得 K8s 干(27 篇)
5. **小规模不划算**:单机 8 卡 PyTorch DDP 直接 `torchrun` 更轻;Ray 的价值在多节点 + 多任务编排

---

## 十、看完这一篇,你应该能

- 解释 Ray 的三个核心抽象:Task / Actor / Object Store,以及各自适用场景
- 在白板上画 Ray 集群拓扑(Head + GCS + 多 Worker + Raylet + Plasma)
- 解释 Placement Group 的作用,知道 PACK / SPREAD 的语义差异
- 解释为什么 AI 圈选 Ray 而不是 Spark(Python 原生 / Actor 模型 / GPU 一等公民 / 与 PyTorch 零摩擦)
- 说出 Ray 生态地图(Train / Serve / Data / Tune / RLlib)各自的位置
- 知道本地调试的 `local_mode=True` 技巧、Dashboard 看什么、Object Store 容易踩什么坑
- 看到 AI Infra 的 stack 里出现 `@ray.remote` 就知道是这一层

下一篇:**26 Ray Serve + vLLM** — 推理服务化的事实组合。Deployment / Application / Replica 三层抽象,自动扩缩容指标该选什么,跟 Triton Inference Server 的取舍,以及 RayLLM 这套开箱即用模板。
