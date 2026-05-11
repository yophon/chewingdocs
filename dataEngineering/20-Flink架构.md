# Flink 架构:JobManager / TaskManager / Checkpoint / Savepoint

19 讲完 Watermark,你已经知道流处理"对不对"靠什么保证(事件时间 + 水位线 + 迟到处理)。这一篇拆开 Flink 这台机器本身——**一段 Flink SQL 提交进去之后,集群里到底发生了什么**:谁接你的 job、谁把它编译成执行计划、谁分配资源、谁真正跑算子、Checkpoint 是怎么"在数据流不停的情况下"做出全局一致快照的、为什么这套机制能保证 exactly-once。

> 一句话先记住:**Flink 是一个"被 Checkpoint Barrier 穿过的、由 JobManager 协调、运行在 TaskManager Slot 上的、永不停止的有状态算子图"**。JobManager 像总指挥(管调度 + 协调 Checkpoint),TaskManager 像工厂车间(里面是 Slot 槽位,每个槽里跑一些算子的子任务),Checkpoint Barrier 是周期性插进数据流的"对账标记"——所有算子都对完账,这次 Checkpoint 就成功了,失败时整个 job 从这个一致性切片回滚重跑。**理解了 Barrier 怎么穿过算子,就理解了 Flink 80% 的精髓**。

---

## 一、为什么需要一个"流处理专用集群"

### 1.1 上一代的世界

Storm 用过的人现在不多了——它的模型是"每个 Worker 跑几个 Bolt,数据从 Spout 推过去",**没有内置状态、没有内置 checkpoint、exactly-once 要靠业务端 Trident 层硬拼**。结果就是 Storm 集群可以跑无状态的 ETL,但凡涉及"窗口聚合"或"流 Join"的有状态计算,工程师都得自己造轮子。

Spark Streaming 走另一条路——**把流"切成微批"**,每 1 秒生成一个 RDD 跑一次批处理。状态靠 RDD 之间的 `updateStateByKey` 维持,checkpoint 借用 Spark 的 lineage。**优点**:复用了 Spark 生态;**缺点**:延迟下不去(微批边界),复杂事件时间窗口和 watermark 表达不自然。

Flink 想做的事很明确——**真正以"事件驱动"为一等公民的有状态流处理引擎**:

- 数据是连续流,不是微批
- 状态是引擎内置的,不靠外部 KV
- 事件时间 + Watermark 是核心,不是补丁
- Checkpoint 是异步、增量、自动的,不是用户操心的

**这套定位决定了 Flink 必须有自己的集群架构**——它要管的事比 Spark 多一个量级:**一个 7×24 跑了几个月的 job、状态可能几个 TB、Checkpoint 几秒一次还要不打断数据流**——这套机制不可能依附在批引擎上。

### 1.2 Flink 集群的两个角色

```
                              ┌────────────────┐
       Client (你提交 SQL) ──→│  JobManager    │
                              │  (总指挥)      │
                              └────┬───────────┘
                                   │ 调度 / 心跳 / Checkpoint 协调
                    ┌──────────────┼──────────────┐
                    ▼              ▼              ▼
              ┌──────────┐   ┌──────────┐   ┌──────────┐
              │TaskMgr 1 │   │TaskMgr 2 │   │TaskMgr 3 │
              │ ┌──┬──┐  │   │ ┌──┬──┐  │   │ ┌──┬──┐  │
              │ │S1│S2│  │   │ │S1│S2│  │   │ │S1│S2│  │
              │ └──┴──┘  │   │ └──┴──┘  │   │ └──┴──┘  │
              │ Slot 槽  │   │ Slot 槽  │   │ Slot 槽  │
              └──────────┘   └──────────┘   └──────────┘
              (车间,跑算子的子任务)
```

- **JobManager**:协调 + 调度,管整个集群的 metadata,**1 个**(HA 模式有 standby)
- **TaskManager**:工作进程(JVM),**N 个**,每个内含若干 **Slot**(槽位)
- **Slot**:一份固定的资源(主要是内存隔离),**一个 task 子任务**跑在一个 Slot 上

接下来挨个拆。

---

## 二、JobManager 的三件套

JobManager 不是一个组件,是三个组件的复合体:

```
                  ┌─────────────────────────────────┐
                  │          JobManager 进程        │
                  │                                 │
   submitJob() ──→│  ┌──────────────┐              │
                  │  │ Dispatcher   │ 接 job、分发 │
                  │  └──────┬───────┘              │
                  │         │ 启动                  │
                  │         ▼                       │
                  │  ┌──────────────┐              │
                  │  │ JobMaster    │ 管单 job 执行│
                  │  │ (每 job 一个)│ + Checkpoint │
                  │  └──────┬───────┘              │
                  │         │ 申请资源              │
                  │         ▼                       │
                  │  ┌─────────────────┐           │
                  │  │ ResourceManager │ 管 Slot   │
                  │  └─────────────────┘ K8s/YARN  │
                  └─────────────────────────────────┘
```

### 2.1 Dispatcher:接 job 的门面

- 暴露 REST API + Web UI(8081 端口你看到的就是它)
- 接到 `submitJob` 请求,**为每个 job 启动一个独立的 JobMaster**
- 维护已提交的 job 列表(供 UI 查询)

### 2.2 JobMaster:每个 job 的执行经理

**核心职责**:

1. 把客户端发来的 **JobGraph(逻辑 DAG)** 编译成 **ExecutionGraph(物理 DAG)**
2. 向 ResourceManager 申请 Slot
3. 把 task 部署到对应的 TaskManager
4. **协调 Checkpoint**(下面详讲)
5. 监控 task 失败,触发重启(从最近一次 Checkpoint 恢复)

**一个 job 一个 JobMaster** ——这个隔离很重要:job A 的 Checkpoint 协调跟 job B 完全独立,一个 job 出问题不影响其他。

### 2.3 ResourceManager:Slot 的分配中心

**注意**:这里的 ResourceManager 是 Flink 内部的,**不是 YARN 的 RM**(虽然名字撞了)。它的工作:

- 维护当前注册到集群的所有 TaskManager 的 Slot 总数
- 接 JobMaster 的"我需要 5 个 Slot"请求,从空闲池分配
- **K8s/YARN 模式下**,不够就**向 K8s 申请新 pod**(新 TaskManager),自动扩容
- TaskManager 挂了,把它的 Slot 标记不可用,通知所有受影响的 JobMaster 重启 task

**两个角度看这一层**:

- **资源调度**:K8s/YARN 给 Flink 集群分 pod / container,这是"集群级"
- **Slot 分配**:Flink 集群内部把 Slot 给 task 用,这是"job 级"

K8s/YARN 不知道也不关心 Slot 的存在——它们只看到 TaskManager 这个 pod。**Slot 完全是 Flink 自己的概念**。

---

## 三、TaskManager 与 Slot

### 3.1 Slot 是什么

```
TaskManager 进程(一个 JVM)
   ├── 总堆内存 8GB
   ├── 总堆外 4GB(给 RocksDB / 网络 buffer)
   └── 4 个 Slot
       ├─ Slot 0:1/4 内存隔离  ← 跑某些 task
       ├─ Slot 1:1/4 内存隔离  ← 跑某些 task
       ├─ Slot 2:1/4 内存隔离  ← 跑某些 task
       └─ Slot 3:1/4 内存隔离  ← 跑某些 task
```

- Slot 是 **内存的隔离单位**(均分 TaskManager 总内存)
- Slot 不隔离 CPU——多个 Slot 共享 TaskManager 进程的 CPU 时间片
- **一个 Slot 可以跑多个 task 子任务**(slot sharing,默认开)

### 3.2 Slot Sharing:为什么默认开

**Slot 数量决定 job 的最大并行度**——`parallelism=8` 的 job 至少需要 8 个 Slot 才跑得起来。但一个 job 通常有多个算子(map → keyBy → window → sink),每个算子又有各自的并行度。如果**每个算子的子任务都独占一个 Slot**,需要的 Slot 数会爆炸。

```
没有 slot sharing 的世界:
  source(p=4) + map(p=4) + window(p=4) + sink(p=4) = 16 个 Slot

开了 slot sharing 的世界:
  同一个 pipeline 的子任务可以共享 Slot:
  Slot 0:source-0 + map-0 + window-0 + sink-0
  Slot 1:source-1 + map-1 + window-1 + sink-1
  Slot 2:source-2 + map-2 + window-2 + sink-2
  Slot 3:source-3 + map-3 + window-3 + sink-3
  = 4 个 Slot 就够了
```

**收益**:

1. Slot 数量等于最大算子并行度,资源不浪费
2. 同一个 pipeline 的算子在同一进程内,**部分数据传递可以走内存,不走网络**

**代价**:Slot 之间的内存隔离不是绝对的——同一个 Slot 里的多个算子共享那 1/4 内存。**所以 Flink 的"Slot 隔离"主要是预算意义上的,不是 Linux cgroup 那种硬隔离**。

### 3.3 Operator Chain:更激进的优化

```
原始 DAG:
  source → map → filter → keyBy → window → sink
            └── 都是 forward(1 对 1)──┘  └─ 跨网络 ─┘

Operator Chain 后:
  [source → map → filter] → keyBy → [window → sink]
   ↑ 这三个算子合并成一个"链",在同一个线程里函数调用
                              ↑ keyBy 必须 shuffle,断链
```

**收益**:

- 算子之间是函数调用,**不走序列化、不走网络**
- 一个线程吃掉多个算子的逻辑,CPU 缓存友好

**默认开**——你可以在 SQL 里通过 hint、DataStream API 里通过 `.disableChaining()` 关掉某段(用于精细排查反压时)。

---

## 四、逻辑 DAG 到物理 DAG

一段 SQL 提交后的旅程:

```
   SQL / DataStream 代码
            │
            ▼
   ┌─────────────────────┐
   │    StreamGraph      │  最初的逻辑图,算子节点
   └────────┬────────────┘
            │ Operator Chain 优化
            ▼
   ┌─────────────────────┐
   │    JobGraph         │  发给 JobMaster 的图
   └────────┬────────────┘
            │ 按并行度展开
            ▼
   ┌─────────────────────┐
   │   ExecutionGraph    │  物理图,每个算子展开成 N 个 SubTask
   └────────┬────────────┘
            │ 部署到 Slot
            ▼
   ┌─────────────────────┐
   │  Physical Execution │  实际跑在 TaskManager 上
   └─────────────────────┘
```

**关键展开**:

- 一个 `WindowOperator(parallelism=8)` 在 ExecutionGraph 里变成 **8 个 SubTask**,每个 SubTask 处理一部分 key 的数据
- 每个 SubTask 的输入端和输出端,**通过 ResultPartition / InputGate 连接**——这就是 Flink 网络栈的入口

### 4.1 算子之间的数据传递

```
上游 SubTask                  下游 SubTask
 ┌──────────┐                ┌──────────┐
 │  output  │── ResultPartition ──→ InputGate │  input  │
 │  buffer  │  ↑                          │  buffer  │
 └──────────┘  网络 buffer 池(有限)         └──────────┘

下游消费慢 → 网络 buffer 池满 → 上游 output 写不进去 → 上游 task 阻塞 → 反压
```

**反压(Backpressure)的本质**:Flink 不主动丢数据,**通过 buffer 池的有无来传导慢的信号**。下游慢,buffer 池就满,**这种"满"会沿着算子链一路向上游传**,直到 Source 也阻塞——Source 阻塞意味着不再从 Kafka 拉新消息,Kafka 上的 lag 开始增长。

**Flink UI 怎么看反压**:每个算子的"BackPressure" 标签——红色就是阻塞中、绿色就是正常。**反压定位永远从下游往上游看**——红的算子的"下游"才是真正慢的那个。

---

## 五、Checkpoint 机制:Flink 的命脉

这是 Flink 最深也最巧的设计。问题的难度:

> **数据流 7×24 不停,如何在不暂停整个 job 的前提下,给所有算子的状态拍一张"全局一致"的快照,让失败时能恢复到这张快照对应的"上一秒"**?

### 5.1 Chandy-Lamport 算法的工程实现

Flink Checkpoint 借鉴了 1985 年的 Chandy-Lamport 算法。**核心想法**:**在数据流里插一个特殊的"标记",让它代替"暂停世界"——所有算子收到这个标记时,就给自己的状态拍快照**。

这个特殊标记叫 **Checkpoint Barrier**。

```
数据流(从 Source 到下游,Barrier N 已经在里面前进):

时刻 t1:JobMaster 周期性触发 Checkpoint N
        ┌─────────┐
        │JobMaster│ ── trigger(N) ──→ 所有 Source
        └─────────┘

时刻 t2:Source 收到触发,在数据流里插入 Barrier N
        Source ──[d4][d3][d2][B(N)][d1]──→ 下游算子
                                ↑
                    Barrier 是普通数据流里的特殊标记
                    所有 d1 在它之前(属于 N-1 之前)
                    所有 d2 d3 d4 在它之后(属于 N 之后)

时刻 t3:下游算子接到 Barrier N
        - 暂停从这条输入读
        - 等其他输入的 Barrier N(barrier alignment)
        - 所有 Barrier 到齐 → 给自己拍快照,异步写到外部存储(S3/HDFS)
        - 把 Barrier N 转发给所有下游
        - 继续处理数据

时刻 t4:Sink 也完成了自己的快照
        - 向 JobMaster ack(N)

时刻 t5:JobMaster 收齐所有 ack
        - 在元数据里标记 Checkpoint N 完成
        - 把 _metadata 文件写到 checkpoint 目录
```

### 5.2 Barrier 对齐(Barrier Alignment)

```
某个算子有 2 个输入:

输入 A:──[d3][d2][B(N)][d1]──→
输入 B:──[d5][d4][d3][B(N)]──→

算子先收到 A 的 B(N):
  → 把 A 输入的 d2、d3 buffer 起来(因为它们属于 Checkpoint N+1)
  → 继续处理 B 输入的数据

算子后收到 B 的 B(N):
  → 双方 Barrier 到齐
  → 拍快照
  → 转发 B(N) 到下游
  → 把 buffer 的 A 数据(d2、d3)继续处理
```

**为什么要对齐**:保证快照里的状态对应"恰好处理完 Barrier N 之前的所有数据,且不包含 Barrier N 之后的任何数据"——这就是 **exactly-once 语义**的根。

**对齐的代价**:阻塞时间。如果某个输入慢,所有 Barrier 已到的输入都要等它——阻塞期间不处理数据。**Flink 1.11 引入了 Unaligned Checkpoint**:不等齐,把"已到的 Barrier"和"in-flight 数据"一起存到快照里。**优点**:对齐时间归零;**代价**:checkpoint 体积变大。

### 5.3 异步 + 增量

- **异步**:算子拍快照不会阻塞数据处理——快照写外部存储是后台线程做的
- **增量(RocksDB 状态后端独有)**:21 会展开,只上传新产生的 SSTable,大状态(TB 级)的 checkpoint 几秒就能完成

### 5.4 失败时怎么恢复

```
Checkpoint N 已完成,Checkpoint N+1 在做时,某个 TaskManager 挂了:

JobMaster 检测到失败:
1. 取消整个 job 的所有 task(不是只挂的那个)
2. 从 Checkpoint N 的 _metadata 读出所有算子的状态指针
3. 申请新 Slot,重新部署整个 job
4. 每个算子从 Checkpoint N 加载自己的状态
5. Source 把 Kafka offset 回退到 Checkpoint N 时记录的位置
6. 重新开始消费——从 Checkpoint N 之后的数据再跑一遍
```

**注意**:**失败重启意味着"重新处理"**——这就是为什么 exactly-once 不是"每条数据只算一次",而是"**对外的副作用看起来只发生了一次**"。Source 必须支持回放(Kafka 行),Sink 必须支持事务或幂等(Kafka transactional producer / 数据库 upsert / Iceberg snapshot 提交)。**这条契约破了任何一环,就退化到 at-least-once**。

---

## 六、Checkpoint vs Savepoint

经常被搞混的两个东西。

| 维度 | Checkpoint | Savepoint |
|---|---|---|
| 触发 | JobMaster 周期性自动 | 用户手动(REST API / CLI) |
| 用途 | 故障恢复 | 版本升级 / job 迁移 / 重新分区 |
| 格式 | 引擎内部、跨版本不保证兼容 | 标准化、跨 Flink 版本可读 |
| 存储 | 短期(默认保留最近 N 个) | 长期(用户管理) |
| 性能 | 极致优化(增量、异步) | 完整快照,慢一些 |
| 命名 | `chk-1234` | 用户指定 |

**经验法则**:

- **故障重启** → Checkpoint(自动)
- **升级 Flink 版本 / 改动算子拓扑 / 改并行度** → 先 Savepoint → 停 job → 改代码 → 从 Savepoint 启动新 job

**踩坑**:很多团队把"job 上线"流程写成了"取消 job → 重新提交",没走 Savepoint——**结果状态全丢了**。任何有状态 job 的发布,**必须**先打 Savepoint。

---

## 七、部署模式:Application / Session / Per-Job

```
┌──────────────────────────────────────────────────────────┐
│  Session Mode                                             │
│  ┌─────────┐                                              │
│  │  Flink  │ ← 长期运行,接受 N 个 job                    │
│  │  集群   │   job 共享 JobManager / TaskManager          │
│  └─────────┘   适合短任务、交互式 SQL                     │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  Per-Job Mode (Flink 1.15 弃用)                           │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                   │
│  │ Cluster │  │ Cluster │  │ Cluster │                   │
│  │  job 1  │  │  job 2  │  │  job 3  │                   │
│  └─────────┘  └─────────┘  └─────────┘                   │
│  每个 job 独立集群,client 在外部                          │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  Application Mode (K8s 主推)                              │
│  ┌─────────┐                                              │
│  │ Cluster │ ← main() 在 JobManager 里跑                  │
│  │  job 1  │   client 不需要常驻,提交完就退              │
│  └─────────┘                                              │
└──────────────────────────────────────────────────────────┘
```

**三种模式的取舍**:

- **Session**:多 job 共享集群——适合开发期 SQL gateway、ad-hoc 查询;**生产慎用**,一个 job 出问题影响全部
- **Per-Job**:每 job 独立集群,但 client 端跑 main()——历史遗物,**1.15 弃用**,因为 client 端要承担 jar 解析压力,client 一断 job 起不来
- **Application**:每 job 独立集群 + main() 在 JobManager 里——**K8s 上的事实标准**,2025 年新项目默认这个

**为什么 K8s + Application 是新默认**:

- 一个 job 一个 K8s Deployment,资源边界清晰
- JobManager 跑 main(),client(`flink run`)只负责把 jar 推到集群,推完就退
- Pod 挂了 K8s 自动拉起,跟 K8s 声明式语义对齐

---

## 八、工程落地:一个完整的 K8s Flink Application 提交

### 8.1 提交命令

```bash
flink run-application \
  --target kubernetes-application \
  -Dkubernetes.cluster-id=order-stream \
  -Dkubernetes.container.image=registry.example.com/flink:1.18-order-stream \
  -Dtaskmanager.numberOfTaskSlots=4 \
  -Djobmanager.memory.process.size=2g \
  -Dtaskmanager.memory.process.size=8g \
  local:///opt/app/order-stream-1.0.jar
```

### 8.2 配套的 flink-conf.yaml(关键 12 行)

```yaml
# Checkpoint
state.backend: rocksdb
state.checkpoints.dir: s3://flink-checkpoints/order-stream
state.savepoints.dir: s3://flink-savepoints/order-stream
execution.checkpointing.interval: 60s
execution.checkpointing.mode: EXACTLY_ONCE
execution.checkpointing.timeout: 10min
execution.checkpointing.min-pause: 10s
execution.checkpointing.tolerable-failed-checkpoints: 3
state.backend.incremental: true        # 增量 checkpoint(RocksDB 必开)
execution.checkpointing.unaligned: true # 反压时仍能完成 checkpoint
restart-strategy: exponential-delay     # 指数退避重启
restart-strategy.exponential-delay.initial-backoff: 10s
```

**这 12 行覆盖了 95% 生产 Flink job 必须的 Checkpoint 配置**——更细的会在 21 讲状态后端时再展开。

### 8.3 K8s Operator 方式(更现代)

```yaml
apiVersion: flink.apache.org/v1beta1
kind: FlinkDeployment
metadata:
  name: order-stream
spec:
  image: registry.example.com/flink:1.18-order-stream
  flinkVersion: v1_18
  flinkConfiguration:
    state.backend: rocksdb
    state.checkpoints.dir: s3://flink-checkpoints/order-stream
    execution.checkpointing.interval: "60s"
  jobManager:
    resource:
      memory: 2g
      cpu: 1
  taskManager:
    resource:
      memory: 8g
      cpu: 2
  job:
    jarURI: local:///opt/app/order-stream-1.0.jar
    parallelism: 8
    upgradeMode: savepoint              # 升级时自动打 savepoint
```

**K8s Operator 是 2024 后的事实标准**——它把"先 savepoint 再升级"这种流程封装成声明式,改 yaml 就触发整个流程,运维负担降一个数量级。

---

## 九、替代方案与局限

### 9.1 Kafka Streams:库,不是集群

```
Flink:                               Kafka Streams:
┌─────────────┐                       ┌──────────────────┐
│ 独立集群    │                       │ 你的应用进程     │
│ JobManager  │                       │ ┌──────────────┐ │
│ TaskManager │                       │ │ KS 库内嵌    │ │
└─────────────┘                       │ │ State Store  │ │
                                      │ └──────────────┘ │
需要部署 + 运维                        └──────────────────┘
                                       直接跑在你的 Spring Boot 里
```

**优势**:

- **不需要单独集群**,部署成本几乎为零
- 跟你的微服务一起 K8s 化,运维统一
- 状态存在本地 RocksDB,checkpoint 写 Kafka 内部 topic

**局限**:

- **规模小**——状态超过单机内存/磁盘就难
- 只能消费 Kafka(强 Kafka 绑定)
- 没有 SQL,只有 DSL/Processor API

**适用场景**:**已经全 Kafka 化的业务,流处理逻辑简单(过滤、enrich、轻聚合),规模可控**——很多公司的"实时风控""库存计算"这类局部场景就用它,不上 Flink。

### 9.2 Spark Structured Streaming:微批,生态共享

22 会展开对比。一句话定位:**如果你的团队 Spark 已经是基础设施,Streaming 跟 Batch 共享代码、共享调度、共享存储,Structured Streaming 是默认选项**。Flink 在毫秒级延迟、复杂状态算子(CEP、双流 Join)、Watermark 表达力上更强,**代价是要单独部署、运维、调优一套集群**。

### 9.3 Flink 自身的局限

1. **冷启动慢**——一个 Application 集群从 K8s 拉起到 task 跑起来,**通常 30-60 秒**;不适合"每 5 分钟跑一次"的批节奏
2. **状态超大时 checkpoint 仍是瓶颈**——TB 级状态即便增量 checkpoint 也得几十秒
3. **SQL 表达力有限**——复杂状态算子(CEP、Pattern Matching)还是要回到 DataStream API
4. **运维门槛**——Watermark 卡住、反压定位、Checkpoint 失败、状态膨胀,**没人天天看 Flink UI 的团队不要轻易上**

---

## 十、踩坑提醒

1. **Session 模式跑生产**:一个 job 出问题影响全部,生产用 Application
2. **升级前不打 Savepoint**:状态全丢,事故最常见的根因
3. **Checkpoint interval 设太小**(< 10 秒):checkpoint 还没完成下一次又开始,系统反复抖
4. **Checkpoint timeout 设太小**:大状态作业 checkpoint 超时,job 被反复重启
5. **不开 incremental checkpoint**:RocksDB 状态后端,每次 checkpoint 都全量上传,延迟爆炸
6. **不开 unaligned checkpoint**:反压时 Barrier 永远对不齐,checkpoint 一直失败
7. **Slot 数等于核数错觉**:Slot 是内存隔离单位,不是 CPU 核数;TaskManager 的 Slot 数 ≈ 算子并行度上限
8. **TaskManager 内存全给堆**:RocksDB 用堆外,堆外不够 → 频繁 OOM kill;堆内堆外比例需要根据状态后端调
9. **重启策略默认 fixed-delay 死磕**:小毛病重启 N 次后 job 直接挂——生产用 exponential-delay
10. **Flink UI 反压看错方向**:红色算子的"下游"才是真正慢的;从下往上排查

---

## 十一、心智总结

```
JobManager        总指挥   = Dispatcher + JobMaster + ResourceManager
                            (接 job)  (管单 job)  (分 Slot)

TaskManager       工作进程  = JVM + N 个 Slot
                            Slot 是内存隔离单位,不隔 CPU
                            slot sharing 默认开,同 pipeline 共享 Slot

数据传递          上下游通过 ResultPartition / InputGate + 网络 buffer
                  反压 = buffer 池满,沿算子链反向阻塞

Checkpoint        Barrier 流过算子,对齐后异步写外部存储
                  EXACTLY_ONCE 靠 Source 可回放 + Sink 事务/幂等
                  失败 → 整 job 回退到最近 Checkpoint 重跑

Savepoint         手动触发,标准化格式,用于升级 / 迁移
                  生产升级流程必须先 Savepoint

部署模式          Session / Per-Job / Application
                  Application + K8s Operator 是 2025 默认

四条工程纪律:
  1. 生产用 Application 模式 + K8s Operator
  2. 升级前必须 Savepoint,不要 cancel + restart
  3. RocksDB + 增量 + Unaligned Checkpoint 是大状态作业的三板斧
  4. 反压定位从下游往上游看,红色算子的下一个才是慢的
```

如果你只能记住一句话:**Flink 是一台被 Checkpoint Barrier 周期性穿过的有状态算子图——理解 Barrier 怎么对齐,就理解了 Flink 提供的所有正确性保证从哪来**。

---

下一篇:`21-Flink状态后端.md`,把 Checkpoint 写出去的"状态"这件事拆开——为什么 RocksDB 是大状态作业的事实标准、增量 checkpoint 凭什么 TB 级状态也只要几秒、状态 TTL 不配的 job 三个月后必爆、Savepoint 的 schema 演进什么改得动什么改不动。
