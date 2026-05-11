# Spanner / Calvin / NewSQL

20-23 走过了一遍分布式事务的进化:**2PC 是锁穿一切的强一致,Saga/TCC 是放弃 I 换性能,Percolator 是 KV 上糊一层锁列**。但这些方案都有一个共同短板——**它们做不了"全球同步的 ACID + 高吞吐 + 透明 SQL"**。Percolator TSO 是单点,跨大陆 100ms 延迟;2PC 在金融场景能用但 TPS 撑不住互联网量级。**Google 在 2012 年用一篇 Spanner 论文给出了终极答案**——**用原子钟 + GPS 装出"靠谱的物理时间"**,让分布式数据库能像单机数据库一样讲"时间偏序"。同年 Yale 的 Thomson & Abadi 走了一条完全相反的路——**Calvin**:**先全局排序所有事务,再并行确定性执行**。这两篇论文 + Percolator,定义了今天所有 NewSQL 的格局。

> 一句话先记住:**Spanner 拿 TrueTime 把"分布式系统里没有真时间"这个老问题硬怼回去**——花钱装原子钟 + GPS,让全球数据中心都有 ε ≈ 7ms 的物理时间不确定区间,然后用 commit wait 等过这个区间,做出了 **External Consistency**(可线性化的事务版)。**Calvin 走另一极端**——别用锁了,所有事务先 deterministic 排个全序,所有副本按这个序并行跑,结果天然一致。**NewSQL 三大流派**:**Spanner 派**(CockroachDB / YugabyteDB,模拟 TrueTime 用 HLC)、**TSO 派**(TiDB,继承 Percolator)、**Calvin 派**(FaunaDB)。

---

## 一、为什么需要 Spanner

Google 2012 年面临的问题:**广告系统 F1 / AdWords 已经从 MySQL Sharding 撑不住了**——分片到 5000 台机器,跨分片事务、schema 变更、跨地域同步全是噩梦。

业务诉求很苛刻:

| 维度 | 要求 |
| --- | --- |
| 规模 | PB 级 + 万级 QPS,跨多大陆 |
| 一致性 | **ACID,跨地域跨分片** |
| 可用性 | 99.999%(单大陆挂了不影响) |
| 接口 | **SQL**,业务别改代码 |
| 延迟 | 跨大陆读写也要可接受 |

**这套需求在 2012 年看像天方夜谭**。Percolator 的 TSO 是单点,跨大陆延迟扛不住;2PC 锁穿一切,扛不住吞吐;Cassandra 这种 AP 系统又不能给 ACID。

Spanner 的回答是:**"既然分布式时间不靠谱,那我花钱让它靠谱"**。

---

## 二、TrueTime:工程上的"物理时间真理"

### 2.1 核心 API

TrueTime 暴露给上层的 API 极简:

```cpp
struct TTinterval {
    Timestamp earliest;  // 真实时间不早于这个
    Timestamp latest;    // 真实时间不晚于这个
};

TTinterval TT.now();      // 当前时间的不确定区间
bool TT.after(t);         // t 已经过去了吗?(t < TT.now().earliest)
bool TT.before(t);        // t 还没到吗?(t > TT.now().latest)
```

**关键点**:**TrueTime 不返回一个具体时间,而是一个区间**。区间宽度 ε 在 Google 数据中心是 **1-7ms**(平均 4ms),靠**每个机房放 GPS + 原子钟**双时间源 + 协议同步实现。

### 2.2 区间从哪来

```
┌──────────────────────────────────────────────┐
│   每个数据中心:                                │
│     ┌──────────┐    ┌─────────────┐         │
│     │ GPS 接收器│    │ 铯原子钟    │         │
│     └────┬─────┘    └──────┬──────┘         │
│          │                  │                 │
│          └──────────┬───────┘                 │
│                     ▼                         │
│            time master(多副本)               │
└────────────────┬─────────────────────────────┘
                 │ 每 30 秒同步一次
                 ▼
            各机器的 timeslave daemon
                 │
                 │ 推算本机时间区间(累积漂移误差)
                 ▼
            TT.now() = [earliest, latest]
```

**误差来源**:

- 时间源到机器:网络延迟
- 同步间隔之间:本地晶振漂移(每 30 秒积累 1-2ms)
- 网络抖动:可能临时拉大区间到 100ms+(此时 Spanner 直接拒服务)

> **Spanner 的牛逼之处不是发明了某个算法,而是花钱让"物理时间在分布式下变得可信"**。Google 给每个数据中心装原子钟和 GPS 天线,**这才是别人抄不来的地方**。CockroachDB / YugabyteDB 都得用 HLC 模拟 TrueTime。

### 2.3 Commit Wait:为什么要等这个区间过去

```
事务在 commit 时:
  1. s = TT.now().latest       (取区间右端点作为 commit_ts)
  2. 等到 TT.now().earliest > s (等真实时间确实超过了 s)
  3. 才返回 ack 给 client
  
等待时间 ≈ ε ≈ 4-7ms
```

**为什么必须等?**

**External Consistency** 要求:**如果事务 T1 在 T2 开始之前完成(物理上),那么 T2 必须能看到 T1**。

- 不等就 ack:T1 commit_ts = s,但真实时间可能还没到 s
- T2 在 s 之前开始(物理上)但 timestamp = s' > s
- T2 应该看不到 T1 才对,但因为 s' > s,T2 会看到 T1 → 违反 External Consistency

**等过区间**就保证 commit_ts s 确实是物理已发生的时间,**任何"在 T1 之后"开始的事务的 timestamp 都 > s**。

```
            等  完
T1 ─── prepare ─── pick s = TT.now().latest ─── wait until TT.now().earliest > s ─── ack
                                                            ^
                                                            真实时间在这一刻已超过 s
                            
T2 (在 T1 ack 后启动) ─── pick s' = TT.now().latest > s ─── 看到 T1 ✓
```

> **Commit wait 是 Spanner 性能开销的核心**——每个事务多 4-7ms 延迟。但**它是 TrueTime 区间宽度的代价,不是 Paxos 的代价**。区间越窄,commit wait 越短——所以 Google 拼命缩小 ε。

---

## 三、Spanner 的整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                  Spanner 全球部署                            │
│                                                             │
│   ┌────────────┐  ┌────────────┐  ┌────────────┐         │
│   │ Zone US-W  │  │ Zone EU    │  │ Zone APAC  │         │
│   │            │  │            │  │            │         │
│   │ ┌────────┐ │  │ ┌────────┐ │  │ ┌────────┐ │         │
│   │ │ Tablet │ │  │ │ Tablet │ │  │ │ Tablet │ │         │
│   │ │  + Paxos│ │  │ │  + Paxos│ │  │ │  + Paxos│ │   ←──────┐
│   │ └────────┘ │  │ └────────┘ │  │ └────────┘ │         │   │
│   │                                                       │   │ 同一个 Paxos 组
│   │ TrueTime   │  │ TrueTime   │  │ TrueTime   │         │   │ 跨 3 个 zone 复制
│   │ (GPS+原子钟)│  │ (GPS+原子钟)│  │ (GPS+原子钟)│         │   │
│   └────────────┘  └────────────┘  └────────────┘         │   │
│                                                          ─────┘
└─────────────────────────────────────────────────────────────┘
```

### 3.1 分片(Tablet)+ Paxos

数据按 key 范围切成 **Tablet**(类似 region),**每个 Tablet 一个 Paxos 组**,跨 3-5 个数据中心复制。

- Tablet 内部:**单 Paxos 组**搞定写入复制(线性一致)
- 跨 Tablet 事务:**2PC 协调**(coordinator 选其中一个 Tablet 的 Leader 担任)

### 3.2 写流程(跨 Tablet 事务)

```
client                Tablet A (Leader)        Tablet B           Tablet C
                      (coordinator)            (participant)      (participant)

──BEGIN──▶ 选 A 作 coordinator
──write x─▶ acquire 行锁
──write y──────────────────────────▶ acquire 行锁
──write z────────────────────────────────────────────▶ acquire 行锁
──COMMIT─▶

       ┌──────── prepare phase ─────────────┐
       │ A 选 prepare_ts_A = max(TT.now().latest, lock_ts)
       │ A 写 prepare log(Paxos 复制)
       ├── prepare ──▶ B: 选 prepare_ts_B,Paxos 复制 prepare
       ├── prepare ──▶ C: 选 prepare_ts_C,Paxos 复制 prepare
       │
       │ commit_ts = max(prepare_ts_A, prepare_ts_B, prepare_ts_C, TT.now().latest)
       │
       │ Commit Wait: 等到 TT.after(commit_ts) 成立
       │     ≈ ε ≈ 4-7ms
       │
       │ A 写 commit log(Paxos 复制)
       ├── commit ──▶ B: Paxos 复制 commit
       ├── commit ──▶ C: Paxos 复制 commit
       │
       ◀─ ack(到这里整个事务确认提交)
```

**注意三个关键时机**:

1. **prepare_ts 不小于 lock 持有时刻 + TT.now().latest**——保证 commit_ts 严格大于事务开始
2. **commit_ts 是所有 prepare_ts 的最大值**——任何一个 Tablet 都不能"提前提交"
3. **Commit Wait 在 ack 之前**——保证返回 client 时,真实时间已超过 commit_ts

### 3.3 Spanner 的开销分摊

| 阶段 | 延迟 | 备注 |
| --- | --- | --- |
| 行锁获取 | 1-2 ms | 同地域 Paxos round trip |
| Prepare(并行) | 5-10 ms | 跨地域 Paxos quorum |
| Commit Wait | 4-7 ms | TrueTime 区间 |
| Commit(并行) | 5-10 ms | 跨地域 Paxos quorum |
| 总和 | **~15-30 ms** | 跨地域 ACID 的代价 |

**单地域**:Paxos quorum 在本地,总延迟可压到 5-10ms。**跨地域**:Paxos 跨大陆,主要瓶颈是网络,不是 TrueTime。

---

## 四、External Consistency:Linearizability 的事务版

### 4.1 定义

**External Consistency**(外部一致性) = **Strict Serializability**:

```
事务 T1, T2 满足:
   如果 T1 完成(client 收到 ack)在 T2 开始(client 发请求)之前,
   那么任何看到的"事务串行序"必须有 T1 < T2
```

**两个组合**:

- **Serializability**:有一个串行序能解释观察到的结果
- **Linearizability**:单 key 的实时顺序被尊重
- **Strict Serializability = Serializability + Linearizability**(事务级)

### 4.2 为什么 Snapshot Isolation 不够

```
T1: write x = 1, commit ← physical time 100ms
T2: read x         ← physical time 200ms

SI 不保证 T2 一定读到 x=1!
因为 T2 的 start_ts 可能 ≤ T1 的 commit_ts(时钟不准)
```

**Spanner 用 TrueTime + Commit Wait 保证**:

- T1 commit 完成时,真实时间已经超过 commit_ts
- T2 start 时取的 ts > 真实时间 > T1.commit_ts
- 所以 T2 一定看到 T1

> **External Consistency 是分布式事务的圣杯**。**99% 业务用不到**(SI 够了),但**金融监管、跨地域审计、跨服务严格因果**这些场景里,它是刚需。

---

## 五、Calvin:走完全相反的路

Yale 大学 Daniel Abadi 团队 2012 年的论文,**和 Spanner 同年**——但理念几乎对立:

```
Spanner: 用更好的时钟 → 让事务可以乐观并发 → 用锁 + 2PC 协调
Calvin:  根本别用锁 → 先全局定序 → 所有副本确定性执行
```

### 5.1 核心思想

```
1. 所有事务进系统前,先送到 Sequencer
2. Sequencer 把事务排成全局序列 1, 2, 3, ...
3. 这个序列被复制(Paxos)到所有副本
4. 所有副本按相同序列、相同读写集 → 完全确定性执行
5. 结果天然一致(无需协调)
```

```
              ┌──────────────────────┐
              │     Sequencer        │
              │   (Paxos 复制)        │
              │  txn1 → txn2 → ...    │
              └──────────┬───────────┘
                         │ 广播事务序列
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
    副本 1             副本 2             副本 3
    Scheduler         Scheduler         Scheduler
    Worker            Worker            Worker
    (按序执行)         (按序执行)         (按序执行)
```

### 5.2 关键约束:必须预先声明读写集

Calvin 要求**事务在进入 Sequencer 前就声明所有 read set / write set**。

- 优势:可以提前算锁、调度,避免运行时探测
- 劣势:**有些事务不知道自己要读哪些 key**(比如索引查询)→ 必须先"侦察"再 retry

**典型例子**:`SELECT * FROM users WHERE age > 18 FOR UPDATE`

- Calvin 怎么知道要锁哪些 row?
- 方案:先跑一次"侦察事务"找出 row id,**再用真实事务声明读写集执行**(OLLP - Optimistic Lock Location Prediction)

### 5.3 Calvin 的优势与劣势

| 维度 | Calvin | Spanner |
| --- | --- | --- |
| 并发控制 | **无锁**(确定性) | 行锁 + 2PC |
| 时钟需求 | **无**(只需 Sequencer 排序) | TrueTime |
| 跨地域复制 | **完美**(Paxos 复制 log) | Paxos + 2PC |
| 事务模式 | **必须预声明读写集** | 自由 |
| 适合 | 短事务、读写集可预测 | 通用 OLTP + SQL |
| 落地系统 | **FaunaDB** | Spanner, CockroachDB |

> **Calvin 的工程难点是"预声明读写集"**——大多数 OLTP 应用不愿意改业务代码去声明。这是它没成为主流的核心原因。**FaunaDB 是唯一商业化的 Calvin 派系统**。

---

## 六、NewSQL 三大流派

```
                        NewSQL 谱系
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
    Spanner 派           TSO 派              Calvin 派
   (TrueTime/HLC)       (Percolator)        (确定性)
        │                   │                   │
        ├─ Spanner          ├─ TiDB             ├─ FaunaDB
        ├─ CockroachDB      ├─ OceanBase        │
        ├─ YugabyteDB       │                   │
        └─ Yandex YDB       │                   │
```

### 6.1 Spanner 派:CockroachDB 怎么模仿 TrueTime

CockroachDB(2015,Spencer Kimball 等人)是「**装不起原子钟的 Spanner**」:

```
没 TrueTime:用 HLC(Hybrid Logical Clock,混合逻辑时钟)
没 Spanner 那么准:用"读时检测"代替"写时等待"

关键不变量:
  事务 T1 ack 后,任何 start_ts > T1.commit_ts 的事务一定看到 T1
  
做法:
  1. commit_ts 取 max(节点 HLC, ...)
  2. 不做 commit wait(没法做,不知道真实时间)
  3. 读时如果发现"我的 start_ts 落在某事务的 uncertainty 区间内"
     → 重试,用更新的 start_ts
```

**代价**:**uncertainty restart**——读路径偶尔要 retry,但绝大多数读不会触发。**CockroachDB 在通用云上能跑,Spanner 不行**(Spanner 必须自建机房装原子钟)。

### 6.2 YugabyteDB:Spanner 派的另一个分支

YugabyteDB 直接复刻 Spanner 论文,**Postgres 兼容 SQL 层 + 自研存储 DocDB**。**也用 HLC**(没 TrueTime)。

### 6.3 TSO 派:TiDB 的位置

TiDB 走 Percolator 路线(上一篇详讲),**事务模型与 Spanner 完全不同**:

- Spanner:每分片一个 Paxos 组,**TrueTime 决定 commit_ts**
- TiDB:每 region 一个 Raft 组,**PD 提供 TSO 决定 start_ts / commit_ts**

**为什么 TiDB 不走 Spanner 路线?**因为 PingCAP 在 2015 起步时,**TrueTime 模拟太难**,Percolator 论文非常完整且 Google 已经验证过——直接抄成本最低、风险最小。

### 6.4 三派对比表

| 维度 | Spanner | CockroachDB | TiDB | YugabyteDB | FaunaDB |
| --- | --- | --- | --- | --- | --- |
| 时间机制 | **TrueTime** | HLC | TSO(PD) | HLC | Sequencer |
| 共识 | Paxos | Raft | Raft | Raft | Calvin |
| 事务模型 | 2PC + Commit Wait | 2PC + uncertainty restart | Percolator | 2PC + HLC | Deterministic |
| 隔离级别 | External Consistency | Serializable | SI(默认) | Serializable | Strict Serializable |
| SQL | SQL(自家方言) | Postgres 兼容 | MySQL 兼容 | Postgres 兼容 | FQL/GraphQL |
| 部署 | **Google 内部**(GCP 提供) | 通用云 / 自建 | 自建为主 | 通用云 / 自建 | 云原生 SaaS |
| 适合场景 | Google 业务 | 全球分布式 OLTP | 国内 OLTP | 多云 / 多地域 | Serverless 应用 |
| 缺点 | 必须有 TrueTime | 偶有 uncertainty restart | 跨地域弱 | 生态没 TiDB 强 | 必须预声明读写集 |

---

## 七、TrueTime / HLC / TSO 三种时钟方案对比

| 维度 | TrueTime | HLC | TSO |
| --- | --- | --- | --- |
| 时间源 | **物理(GPS + 原子钟)** | 物理 + 逻辑混合 | **逻辑(单点计数)** |
| 单点 | 无(每机房独立) | 无 | 是(可 HA) |
| 区间 | 有(ε ≈ 4-7ms) | 有(由 NTP 误差决定) | 无(单值) |
| External Consistency | **直接保证** | 通过 restart 保证 | 直接保证(因为单序号) |
| 跨地域 | 优秀 | 优秀 | **差**(单点跨域延迟大) |
| 部署成本 | **极高**(需要 GPS + 原子钟) | 低 | 低 |
| 落地系统 | Spanner | CockroachDB, YugabyteDB | TiDB, OceanBase |

> **三者都能做对**,差异在**性能 / 部署复杂度 / 跨地域能力**的取舍。**全球跨大陆强一致只有 Spanner 真做到了无感**(因为 TrueTime),CockroachDB / YugabyteDB 跨大陆延迟也能用但 uncertainty restart 略有抖动,TiDB 跨大陆基本不建议(TSO 是瓶颈)。

---

## 八、Spanner 写流程伪代码

```python
def spanner_commit(txn):
    # 1. 在每个 participant Tablet 上获取写锁
    for tablet in txn.tablets:
        tablet.acquire_locks(txn.writes)
    
    # 2. Prepare 阶段(并行)
    prepare_timestamps = []
    for tablet in txn.tablets:
        # 每个 Tablet 选 prepare_ts ≥ TT.now().latest
        prepare_ts = max(tablet.last_assigned_ts + 1, TT.now().latest)
        tablet.paxos_replicate(prepare_log, prepare_ts)
        prepare_timestamps.append(prepare_ts)
    
    # 3. Coordinator 选 commit_ts
    commit_ts = max(
        max(prepare_timestamps),    # 任何 prepare_ts
        TT.now().latest,             # 当前 TrueTime 区间右端
    )
    
    # 4. Commit Wait!关键步骤
    while not TT.after(commit_ts):
        sleep_short()                # 通常 sleep 4-7ms
    
    # 5. 通知所有 Tablet commit
    for tablet in txn.tablets:
        tablet.paxos_replicate(commit_log, commit_ts)
        tablet.release_locks(txn.writes)
    
    # 6. 现在 ack client
    return OK
```

**对比 Percolator commit**:Percolator 是"single primary commit",依赖 BigTable 单行原子;Spanner 是"2PC over Paxos",每个 prepare/commit 都要走 Paxos 复制。**Spanner 写路径更重,但跨地域更强**。

---

## 九、工业现状:NewSQL 替换 MySQL 分库分表

**2010-2020 的十年**,中国互联网公司的主流方案是 **MySQL 分库分表 + ShardingSphere / TDDL / MyCat**。

**痛点**:

- **扩容时数据迁移地狱**(分片数变化要 rehash 所有数据)
- **跨库事务靠业务层 Saga**(全靠运维和监控盯着)
- **DDL 跨分片不一致**(加字段加索引要轮 100 个库,过程中数据不一致)
- **运维复杂**(主从延迟、双主切换、binlog 处理一堆杂事)

**2020 后**,**金融 / 大型电商 / SaaS** 大量切到 TiDB / OceanBase / CockroachDB:

| 公司 | 用 | 替换什么 |
| --- | --- | --- |
| 平安 / 中信 / 微众 | TiDB | MySQL 分库分表 |
| 蚂蚁 / 网商银行 | OceanBase | Oracle / MySQL |
| 美团 / B 站 / 知乎 | TiDB | MySQL 分库分表 |
| 多抓鱼 / 货拉拉 | TiDB | MySQL 分库分表 |
| Netflix | CockroachDB | Cassandra(部分场景) |
| DoorDash | CockroachDB | Postgres |

**TPS / 延迟对比**(经验值,不绝对):

| 数据库 | 单机 TPS | 延迟 | 备注 |
| --- | --- | --- | --- |
| 单机 MySQL | 5万+ | 1-3 ms | 主从异步,主挂丢数据 |
| MySQL 分库分表 | 几十万 | 2-5 ms | 跨库事务靠业务 |
| **TiDB** | 几十万-百万 | **5-15 ms** | **强一致 ACID,运维大幅简化** |
| Spanner | 百万-千万 | **跨地域 15-30 ms** | 跨大陆 ACID |

> **简单结论**:**TiDB / OceanBase 的写延迟比单机 MySQL 慢 2-5 倍,但运维成本降一个数量级**。**这笔账,只要业务能承受"延迟从 2ms 变 8ms",就划算**。**金融和大型电商已经在大规模迁**。

---

## 十、什么场景该选哪个

**决策树**:

```
                   要分布式数据库吗?
                         │
                         ▼
                业务能容忍 5-15ms 延迟?
                         │
                ┌────────┴────────┐
                否                 是
                │                  │
                ▼                  ▼
        继续 MySQL 分库分表    需要全球跨大陆?
        (Saga 兜底跨库)       ┌──────┴──────┐
                              否            是
                              │             │
                              ▼             ▼
                        国内 OLTP?        是 Google Cloud?
                        ┌────┴────┐       ┌────┴────┐
                        是        其他    是        否
                        │         │       │         │
                        ▼         ▼       ▼         ▼
                      TiDB     Cockroach Spanner   CockroachDB
                      OceanBase           (托管)    YugabyteDB
                      (国内生态强)
```

**几条具体经验**:

1. **国内业务 + 想要 SQL + 不想自己维护跨库事务** → **TiDB**(生态最完整,中文文档,PingCAP 支持)
2. **金融业务 + Oracle 兼容** → **OceanBase**(蚂蚁打磨多年)
3. **全球分布式 SaaS** → **CockroachDB / YugabyteDB**(都是 Spanner 路线,Postgres 兼容)
4. **真 Google 规模 + 真 Google 钱包** → **Spanner**(GCP 自家)
5. **Serverless 场景 + 不在意预声明读写集** → **FaunaDB**(Calvin)
6. **写完全确定 + 极致吞吐 + 不需要 SQL** → 用 FoundationDB 之类的 KV(Apple 用)

---

## 十一、踩坑提醒

1. **拿 NewSQL 直接替 MySQL 单机** → 延迟会涨,**不是所有业务都该用**;小项目 MySQL 单机一台机器跑 5 年最香
2. **以为 NewSQL 比 MySQL 快** → 错。**NewSQL 写延迟普遍比 MySQL 单机慢 2-5 倍**,胜在水平扩展和强一致
3. **TiDB 当 OLAP 跑大查询** → 走 TiKV 路径会很慢,**OLAP 必须挂 TiFlash 列存**
4. **不理解 External Consistency 的实际收益** → 99% 业务不需要,**别为了"听起来强"上 Spanner**
5. **CockroachDB 用错时钟** → CockroachDB 强依赖 NTP 精度,**NTP 同步差到几百毫秒会触发大量 uncertainty restart**
6. **Spanner 跨大陆做高频小事务** → commit wait + 跨大陆 Paxos = 30-50ms 延迟,业务可能扛不住
7. **以为 Calvin 没锁就快** → Calvin 的 Sequencer 是新瓶颈,**短事务 + 读写集小才能发挥优势**
8. **不监控 PD / Sequencer 的 RT** → TSO / Sequencer 是单点瓶颈,**抖动直接全集群事务慢**
9. **业务直接走默认 SI / RC 隔离级别** → SI 有 write skew,**金融场景必须显式 SELECT FOR UPDATE 或升级到 Serializable**
10. **跨地域用 Percolator 路线** → TSO 跨大陆延迟摆烂,**全球部署优先 Spanner 派**
11. **不做容量规划就上 NewSQL** → 节点数太少时优势体现不出,**至少 3 副本 5 节点起步**,1-2 节点的 NewSQL 是反模式
12. **DDL 操作不分时段** → 即使 NewSQL DDL 是 online 的,大表加索引仍然是 IO 重活,**最好挑业务低峰**

---

## 十二、收束:分布式事务的"四代"

```
第一代:2PC / XA(1980s)
   ├─ 严格 ACID,锁穿一切
   ├─ 落地:DB2, Oracle XA, MySQL XA
   └─ 状态:工程上几乎不用了(性能太差 + 协调者单点)

第二代:Saga / TCC(2000s 工程化)
   ├─ 放弃 I,业务层补偿
   ├─ 落地:Seata, DTM, Temporal
   └─ 状态:互联网公司主流(中长流程的事实标准)

第三代:Percolator(2010)
   ├─ KV 上糊一层 lock 列做 SI
   ├─ 落地:TiDB, OceanBase
   └─ 状态:国内 NewSQL 主流

第四代:Spanner / Calvin(2012)
   ├─ TrueTime / 确定性排序
   ├─ 落地:Spanner, CockroachDB, YugabyteDB, FaunaDB
   └─ 状态:全球分布式 ACID 的最终形态
```

**四代不是互相替代,而是各占场景**:

- **跨库内事务**:本地事务永远第一选择
- **跨服务长流程**:Saga + 补偿(Temporal 体系)
- **跨库强一致 OLTP**:Percolator 类(TiDB)或 Spanner 类(CockroachDB)
- **跨大陆全球 ACID**:Spanner / CockroachDB / YugabyteDB

> 看完 20-24 五篇,你应该能在白板前讲清楚:**"为什么 2PC 不能扛长事务、Saga 牺牲了什么、Percolator 为什么聪明、Spanner 凭什么花得起 TrueTime、Calvin 为什么没流行起来、TiDB / CockroachDB 在论文谱系里站在哪"**。这是分布式事务这条线的全部图景——**90% 的中间件、数据库、面试问题、生产事故,都能在这个图景里找到坐标**。

---

下一篇进入第六层:`25-一致性哈希再深入.md`,从分布式事务回到工程基石——一致性哈希。systemDesign/13 已经讲过基础形态,本篇深入 **Jump Hash / Maglev / Rendezvous Hash** 这些变种,以及每种在大厂内部的真实应用(Google Maglev 的 LB、Envoy 的 ring hash、Spotify 的 jump hash 在 Cassandra 的退场)。
