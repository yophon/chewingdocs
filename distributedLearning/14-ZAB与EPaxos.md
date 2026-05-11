# ZAB 与 EPaxos

Raft 的胜利不等于共识协议的终点。这一篇讲两个**与 Raft 同时代、解决稍微不同问题**的协议:**ZAB(ZooKeeper Atomic Broadcast)**和**EPaxos(Egalitarian Paxos)**。**ZAB 在 Raft 出生前 5 年就已经在 ZooKeeper 里跑了**——它解决的不是"通用日志复制",而是**"严格 FIFO 顺序广播"**,所以它有个 Raft 没有的关键特征:**客户端顺序保证**。**EPaxos 是学术上的明珠**——它打破了"必须有 Leader"的传统,**任何节点都能发起共识**,在跨地域写均匀的场景下理论延迟最优,**但工业界用得极少**——为什么?这一篇讲清楚。

> 一句话先记住:**ZAB = Raft 的前辈,加上严格 FIFO + 类 term 的 epoch + 三阶段(Discovery / Sync / Broadcast)**,**给 ZooKeeper 喂出了 sequential consistency,sync 才升级到 linearizable**;**EPaxos = 无 leader Paxos**,**冲突检测决定 1 RTT 还是 2 RTT**,**多地域写均匀的理论王者,工业落地极少——实现复杂、运维难、Raft 已经够用**。**选型上:强 leader 单地域用 Raft / Multi-Paxos;严格 FIFO 协调服务用 ZAB;多地域写均匀且实在装得起的用 EPaxos——但 99% 的人选不到第三档**。

---

## 一、为什么不是 Raft 一统天下

Raft 在大部分场景已经够用,但有两类需求 Raft 不太擅长:

### 1.1 严格的 FIFO 客户端顺序

Raft 保证**多数派看到的日志顺序一致**,但**不强制保证同一客户端的请求按发送顺序进入日志**。

```
Client 先发 A,后发 B
Leader 同时收到 A 和 B(网络乱序),把 B 先放进日志,A 后放
Raft 视角:OK,日志一致就行
ZK / ZAB 视角:不行!必须 A 在 B 前面
```

**ZooKeeper 用作分布式协调服务**——配置中心、leader election、锁、序号分配,**它的 API 语义本质上是"对一个共享文件树的有序操作"**,**客户端的操作顺序必须保留**(`/parent → child1 → child2` 不能乱)。

ZAB 把这个语义**直接做进协议**:**同一 client 的所有事务严格按发送顺序进入提交序列**。

### 1.2 多地域写均匀:Leader 不是瓶颈也是延迟

Raft 强 leader 意味着:**所有写都要先到 leader,再 RTT 到多数派**。

```
3 地域 5 节点:北京、上海、广州、东京、新加坡
leader 在北京

广州的 client 写一个 key:
    client → 广州本地节点 → 转发到北京 leader(40ms)
    leader 写 → 复制到次远的多数派(40ms)
    总计:80ms 起步

如果 leader 在上海,广州 client 写:
    client → 上海 leader(30ms) → 复制(30ms)
    总计:60ms

如果完全无 leader,广州 client 可以直接发起共识:
    client → 本地节点(0ms) → 直接联系其他节点(30-40ms)
    总计:30-40ms
```

**EPaxos 的卖点就是这个**——**无 leader,每个 client 找最近的节点发起共识**,理论上跨地域延迟最优。

---

## 二、ZAB:ZooKeeper 的原子广播

ZAB 全称 **ZooKeeper Atomic Broadcast**,由 Flavio Junqueira 等人在 2008 设计、2011 完整描述(*Zab: High-performance broadcast for primary-backup systems*)。**它跟 Raft 的关系是"远房表亲"——同样的安全性目标,不同的语义优先级**。

### 2.1 核心数据结构:zxid

ZAB 用一个 64 位整数 **zxid** 标识每个事务:

```
┌────────────────┬────────────────┐
│  epoch (32位)  │ counter (32位)  │
└────────────────┴────────────────┘

epoch  = "任期",每次 leader 切换 +1(类似 Raft 的 term)
counter= 该 epoch 内事务的递增编号
```

**zxid 是全局单调递增的**——比较两个 zxid:

- epoch 大者新
- epoch 相同,counter 大者新

**zxid 同时编码了顺序和合法性**——这是 ZAB 和 Raft 一个微妙的区别,Raft 用(term, index)两个字段,ZAB 用一个 64 位整数。

### 2.2 三阶段流程

ZAB 把生命周期分成**三个明确阶段**(论文叫 phases):

```
                ┌───────────────────┐
                │  阶段 1: Discovery │
                │  发现集群中最大 zxid │
                │  选出 prospective  │
                │  leader            │
                └─────────┬─────────┘
                          │
                          ▼
                ┌───────────────────┐
                │  阶段 2: Sync     │
                │  把 leader 的日志   │
                │  同步到所有 follower│
                └─────────┬─────────┘
                          │
                          ▼
                ┌───────────────────┐
                │  阶段 3: Broadcast │
                │  对外服务,两阶段广播│
                │  (Propose → Ack    │
                │   → Commit)        │
                └─────────┬─────────┘
                          │
              leader 挂 / 失联 / 多数派失联
                          │
                          ▼
                  返回阶段 1,重选
```

#### 阶段 1:Discovery(发现)

- 节点互相交换自己见过的最大 zxid
- **拥有最大 zxid 的节点**成为 prospective leader(准 leader)
- 选出新 epoch(比集群已知的最大 epoch +1)
- 类比 Raft:相当于 RequestVote,只投票给"日志最新"的人

#### 阶段 2:Synchronization(同步)

- 准 leader 把自己的日志发给所有 follower
- Follower 截掉与 leader 不一致的尾部,补齐 leader 的日志
- 多数派同步完成后,准 leader 升级为正式 leader

#### 阶段 3:Broadcast(广播)

正常服务阶段,**两阶段提交**(注意:不是 2PC 那种带 prepare 的,是简化的两阶段):

```
Leader                Follower 1         Follower 2
  │                       │                  │
  │── Propose(txn) ──────▶│                  │
  │── Propose(txn) ──────────────────────────▶│
  │                       │                  │
  │                       │ append to log    │
  │                       │ (未 commit)       │
  │                       │                  │
  │◀───── ACK ────────────│                  │
  │◀───── ACK ────────────────────────────────│
  │                       │                  │
  │ majority ack          │                  │
  │ commit local          │                  │
  │                       │                  │
  │── Commit ────────────▶│                  │
  │── Commit ─────────────────────────────────│
  │                       │ apply            │
  │                       │                  │ apply
```

**跟 Raft 的差别**:

- **ZAB 显式发 Commit 消息**,Raft 是把 commitIndex 搭在下次 AppendEntries 里
- ZAB 的 Propose **严格按 zxid 顺序**——leader 内部维护单线程提议队列,**任何乱序都不会发生**

---

### 2.3 ZAB 的 FIFO 顺序保证(关键差异)

**ZAB 给客户端的承诺**:

1. **写顺序保证**:同一 client 的所有写,**全局按发送顺序生效**
2. **读看到自己的写**:client 自己发的写,**自己后续的读一定能看到**(read-your-writes)
3. **单调读**:同一 client 后续的读看到的版本只增不减

**实现机制**:

- Client 通过 TCP 长连接连一个 server(follower 或 leader)
- 写请求经 follower 转发到 leader,**但 client 端的请求 id 严格递增,server 不接受乱序请求**
- Leader 在自己的提议队列里**保留 client 的请求顺序**

```
Client 顺序发 A, B, C
即使网络让 B 先到 server,server 也会等 A 到了再处理 A,然后 B,然后 C
```

> **这是 ZAB 比 Raft 多出来的语义**。Raft 库默认不保证这一点,**应用层要自己做 client-side sequencing**(给请求带 client-id + sequence 号)。**ZooKeeper 把这套做进协议,所以 ZK 客户端用起来像在单机操作文件**。

### 2.4 ZK 的一致性级别:Sequential by default,Linearizable on sync()

**这是被误解最多的一点**:

| 操作 | 一致性 |
| --- | --- |
| **写**(create / setData / delete) | **Linearizable**(所有写都过 leader + 多数派) |
| **默认读** | **Sequential**(读 follower,可能落后)|
| **sync() 后读** | **Linearizable**(强制 follower 追上 leader) |

```
Client A:setData("/x", "v2")
        服务端返回 OK(已 commit)

Client B:getData("/x")
        如果 B 连的 follower 还没收到 commit
        B 可能读到 v1(旧值)
```

**这不是 bug,这是 ZK 设计**——**ZK 默认 sequential 而非 linearizable**,这是它高读吞吐的关键。**需要强一致读的场景必须调 `sync()`,sync() 会强制 follower 跟 leader 同步后再返回**。

> **常见踩坑**:**用 ZK 实现分布式锁,持锁判定用普通 getData,刚获锁的人可能读到旧的"锁节点不存在"状态——以为没人持锁**。**必须 sync() 或者用 watch 等待事件**。

---

### 2.5 ZAB vs Raft 详细对比

| 维度 | ZAB | Raft |
| --- | --- | --- |
| **任期标识** | epoch(32位) | term(64位) |
| **日志标识** | zxid = epoch + counter | (term, index) |
| **选 leader 规则** | zxid 最大者当选 | (lastLogTerm, lastLogIndex) 最大者当选 |
| **客户端顺序** | **严格 FIFO**,协议保证 | **不保证**,应用自己做 |
| **日志同步** | 显式 Sync 阶段,leader 主动推 | 集成在 AppendEntries,prevLogIndex 协商 |
| **Commit 通知** | 单独 Commit 消息 | commitIndex 搭次 AppendEntries |
| **成员变更** | **后期加,不优雅**(ZK 3.5 reconfig) | 论文原生支持 Joint Consensus + 单步 |
| **快照** | snapshot + 事务日志分离 | snapshot + log,InstallSnapshot RPC |
| **核心场景** | 协调服务 | 通用日志复制 |
| **典型系统** | ZooKeeper | etcd / Consul / TiKV |

> **不要纠结"哪个更好"**——**ZAB 是 ZK 量身定做的,Raft 是通用日志复制的标准库**。**如果你不是在写 ZK,别选 ZAB**。但**理解 ZAB 让你理解 ZK 的所有诡异行为**——sync() / watch / sequential 节点的 zxid 顺序、leader 切换时为什么有时会"丢"watch 事件,全靠这一层。

---

## 三、EPaxos:无 Leader 的 Paxos

EPaxos 全称 **Egalitarian Paxos**,Iulian Moraru 等人 2013 年提出(*There Is More Consensus in Egalitarian Parliaments*)。**egalitarian** 意思是「平等的」——**所有节点平等,没有 leader 角色**。

### 3.1 设计动机

Raft / Multi-Paxos 的 leader 是优化也是瓶颈:

```
优点:
    leader 接收所有请求,顺序天然确定
    follower 只需 append,不需协调
    1 RTT 内 commit(假设客户端到 leader 0 RTT)

缺点:
    单点瓶颈:leader 网卡 / CPU 是写吞吐天花板
    跨地域延迟:远程 client 必须先 RTT 到 leader,再多数派 RTT
    leader 切换:不可用窗口 100-500ms
```

EPaxos 的反思:**为什么不允许任何节点直接发起共识?**——只要保证共识仍然安全,**就能让 client 找最近的节点**,延迟最优。

### 3.2 关键观察:不冲突的指令可以乱序

**Raft 强制所有指令排成全序**,但实际上**很多指令是无关的**(不冲突):

```
指令 A: SET x = 1
指令 B: SET y = 2

A 和 B 谁先谁后无所谓——它们操作不同的 key,顺序不影响最终状态
```

**EPaxos 的核心思想**:**只对"冲突的"指令排序**,**不冲突的并行 commit**——这样:

- 不冲突:**1 RTT 搞定**(快路径,fast path)
- 冲突:**2 RTT 搞定**(慢路径,slow path,要协调)

```
                ┌──────────────────────────┐
                │  Client 想 commit 指令 I │
                └──────────┬───────────────┘
                           │
                           ▼
              ┌──────────────────────────┐
              │  本地节点 N 发起 PreAccept │
              │  发给所有节点,告知 I 的    │
              │  "依赖集 deps"             │
              └──────────┬───────────────┘
                          │
                          ▼
              ┌──────────────────────────┐
              │  各节点返回自己看到的 deps │
              │  N 收集多数派回复          │
              └──────────┬───────────────┘
                          │
            ┌─────────────┴─────────────┐
            │                           │
   所有回复 deps 相同         有节点 deps 不同
   (无冲突)                  (有冲突,要协调)
            │                           │
            ▼                           ▼
   Fast Path                    Slow Path
   直接 Commit(1 RTT)         发 Accept(再 1 RTT)
                                 → Commit (2 RTT)
```

### 3.3 冲突检测

两条指令 I1、I2 **冲突**(interfere)的定义:

- 它们访问的 key 集合**有交集**
- 且至少一个是**写**

```
SET x = 1 vs SET x = 2          → 冲突(同 key 写)
SET x = 1 vs SET y = 2          → 不冲突(不同 key)
SET x = 1 vs GET x              → 冲突(写读同 key)
GET x vs GET x                  → 不冲突(都是读)
```

**冲突表现**:不同节点对**冲突指令的依赖关系**可能不一致,**需要协调出统一顺序**。

### 3.4 依赖图(DAG):EPaxos 的核心结构

每条指令 commit 时携带一个 **依赖集 deps**——它"必须排在之后"的所有冲突指令。

```
指令 I1: SET x = 1, deps = {}
指令 I2: SET y = 2, deps = {}
指令 I3: SET x = 3, deps = {I1}     ← I3 依赖 I1
指令 I4: SET x = 4, deps = {I1, I3}

构成 DAG:
    I1 ───▶ I3 ───▶ I4
    I2

执行顺序(拓扑序):
    I1, I2 可以并行
    I3 必须在 I1 之后
    I4 必须在 I1 和 I3 之后
```

**应用到状态机时**:对每条新提交的指令,**做反向 DFS 拓扑排序**,按顺序 apply。**强连通分量(SCC)内部按 seq 排序**(seq 是每个指令的全局递增编号,保证 SCC 内有确定顺序)。

### 3.5 EPaxos 的代价

| 代价 | 详情 |
| --- | --- |
| **协议实现复杂** | DAG / SCC / 依赖收集 / 冲突分析,代码量是 Raft 的 3-5 倍 |
| **依赖图占内存** | 每条指令要存 deps 集合,集群规模大时内存膨胀 |
| **冲突率高时退化** | 写均高度冲突(单 key 热点),退化到 2 RTT 比 Raft 还慢 |
| **执行复杂** | 不是按 log 顺序 apply,要拓扑排序 |
| **运维难** | 无 leader → 没有"主节点"概念,调试和监控习惯都得改 |
| **慢路径需要 N 个 deps 一致** | 节点多时 fast path 概率反而降 |

**EPaxos 的甜区**:

- **跨地域 3-5 个节点**(地域多 fast path 价值大)
- **写键空间大、冲突率低**(随机 key 范围广)
- **关心 P99 而非平均**(不冲突的写 P99 极低)

**反过来**:

- **单地域** → leader 0 RTT,EPaxos 完全没优势
- **写键集中(热点)** → 冲突率高,slow path 频繁,反而劣于 Raft
- **小集群(3 节点)** → fast path 难达成(要 N-1 = 2 个相同 dep,概率不高)

### 3.6 EPaxos 工业实现极少

**目前公开生产用 EPaxos 的系统几乎为 0**——为什么?

1. **CockroachDB 早期评估过,最终选了 Raft**——理由是"easier to reason about"
2. **etcd / Consul / TiKV 全选 Raft**——库成熟,生态好
3. **少数学术项目和实验性系统用过**:Google 内部某些跨地域服务、Apache Kudu 早期 prototype
4. **MultiPaxos / Raft 已经够好**——加上 leader transfer + multi-raft + 读优化,**多地域延迟也能压到 50-80ms 级别**
5. **运维成本**:"为了把 P99 从 80ms 降到 50ms,运维复杂度翻 3 倍" → 大多数业务不接受

> **EPaxos 是个"理论上更优,工程上跑得动但没人愿意用"**的协议。**它最大的贡献是提醒大家**:**leader 不是必须的,leader-free 在数学上行得通**——这反过来给 Raft 等 leader-based 协议的优化(比如 Multi-Raft + Leader Lease)提供了思路。

---

## 四、ZAB / EPaxos / Multi-Paxos / Raft 全对比

| 维度 | Multi-Paxos | Raft | ZAB | EPaxos |
| --- | --- | --- | --- | --- |
| **Leader 模型** | Distinguished leader | **强 Leader** | **强 Leader**(+ FIFO 保证) | **无 Leader**(任何节点发起) |
| **任期编号** | proposal number(rebid) | term | epoch | ballot number |
| **日志结构** | 可有空洞 | **连续无洞** | **连续无洞** | **DAG**(可并行) |
| **客户端顺序** | 不保证 | 不保证 | **严格 FIFO** | 不保证(乱序 apply) |
| **正常路径 RTT** | 1 RTT(client→leader 不算) | 1 RTT | 1 RTT(+ 1 单向 Commit) | **1 RTT(fast)/ 2 RTT(slow)** |
| **跨地域** | 中等 | 中等 | 中等 | **最优(写均匀时)** |
| **成员变更** | Vertical Paxos 后补 | **Joint / Single 都有** | 后期加 reconfig | 复杂,工业实现少 |
| **典型系统** | Chubby / Spanner / Cassandra LWT | etcd / Consul / TiKV | ZooKeeper | (基本无工业实现) |
| **可读性** | 困难 | **极佳** | 中等 | 困难 |
| **工业接受度** | 老牌系统在用 | **新系统首选** | ZK 专属 | **几乎无** |

> **现实选型**:
>
> - **不知道选什么 → Raft**(95% 场景)
> - **写 ZK 兼容协议 / 严格 FIFO 协调 → ZAB**
> - **教科书 / 老 Google 系 → Multi-Paxos**
> - **多地域 + 写均匀 + 实力雄厚的团队 → EPaxos**(但你大概率选 Raft + Multi-Region 优化)

---

## 五、ZooKeeper 的工程现实

ZK 是 ZAB 唯一的"代言人",**理解 ZK 的工程现实就是理解 ZAB 的实战**:

### 5.1 ZK 的写性能瓶颈

```
单个 ZK 集群典型写吞吐:
    3 节点:5,000 - 20,000 ops/sec
    5 节点:更低(多数派变大)
    
写延迟:
    本地集群:1-10ms
    跨地域:50-200ms
```

**瓶颈**:

- 所有写过 leader
- 多数派 ack(类 Raft)
- ZK 每个事务还要写 WAL(forceSync 默认开启)

> **不要把 ZK 当 KV 用**——它是协调服务,不是数据库。**写超过几万 QPS 就该考虑 etcd 或别的方案**。

### 5.2 ZK 的读性能特点

```
读默认走任何 follower → 本地内存命中 → 极快(微秒级)
读吞吐随节点数线性扩展(读可分散)
```

**但**:**默认 sequential consistency,可能读到旧值**——**需要强一致读必须 sync()**。

### 5.3 ZK 的 watch 机制

每个 znode 可注册 watcher,数据变化通知 client。**这是 ZK 作为协调服务的杀手锏**——但有几个坑:

1. **One-shot**:每次触发后失效,要重新注册
2. **可能丢事件**:client 重连期间的事件可能丢失,**ZK 3.6+ 加了 persistent watcher 缓解**
3. **leader 切换时 watcher 重建**:client session 失效会导致 watcher 全部失效

> **ZK 客户端要时刻准备"重新拿一次状态再注册 watch"**——只信 watch 通知会丢数据。

### 5.4 ZooKeeper 不擅长的事

- **大数据存储**:znode 默认 1MB 上限,**别拿它存任何业务数据**
- **高频写**:几万 QPS 就开始抖
- **大集群**:ZK 集群本身建议 ≤ 7 节点,**节点更多反而吞吐下降**(多数派变大)
- **跨地域强一致**:延迟敏感,**ZK observer 模式只能加读副本**

---

## 六、EPaxos 的理论价值

虽然工业落地少,EPaxos 的思想影响了很多后续工作:

### 6.1 Multi-Paxos 的"无 leader 优化"

**Mencius / Atlas / Caesar** 等后续协议**继承了 EPaxos 的思想**——多 leader / 旋转 leader,试图在保留 Paxos 简洁性的同时降低跨地域延迟。

### 6.2 影响 CRDT 的设计

**EPaxos 的"不冲突操作可乱序"思想跟 CRDT 同源**——只是 EPaxos 在共识层做,CRDT 在数据类型层做。详见第 19 篇 CRDT。

### 6.3 影响 Multi-Raft 的设计

**Multi-Raft 把数据切分到多个 raft group,每组独立 leader**——这其实是 EPaxos 思想的"工程化分流":**与其让所有节点都能发起共识,不如让不同 key 范围归不同 leader**,跨地域时让 leader 分散到不同地域。

> **TiKV / CockroachDB / YugaByte 全用 multi-raft + leader-aware placement**,**用工程手段达到 EPaxos 的部分效果,代价是接受 Raft 的复杂度而非 EPaxos 的复杂度**。

---

## 七、共识协议选型框架

我给一个决策树,99% 的场景能套进去:

```
你的场景是什么?

├── 需要兼容 ZooKeeper / 已有 ZK 客户端
│   └─▶ ZAB(用 ZK 本身)
│
├── 通用 KV / 协调服务 / 配置中心 / 元数据
│   ├── 单地域 ────────────▶ Raft(etcd / Consul / 自研)
│   └── 跨地域少地域 ──────▶ Raft + multi-raft + leader placement
│
├── 数据库存储引擎复制
│   └── ────────────────────▶ multi-Raft(TiKV / CockroachDB 路线)
│
├── 超大规模 + 极端跨地域 + 实力雄厚
│   ├── 选 1:多 region multi-Raft + leader placement(主流)
│   └── 选 2:EPaxos / Atlas / SpiderDB(学术 / 自研)
│
├── 老 Google 系 / 已有 Paxos 框架
│   └─▶ Multi-Paxos(Chubby 系)
│
└── 拜占庭场景(联盟链)
    └─▶ PBFT / HotStuff / Tendermint(见第 15 篇,不是 Raft 家族)
```

> **一个简单原则**:**如果不能立刻说出选 EPaxos / Multi-Paxos 而不是 Raft 的理由,那就选 Raft**。

---

## 八、面试常见误区(顺手澄清)

### 8.1 「ZK 是用 Paxos 实现的」

**错**。ZK 用 ZAB,**ZAB 跟 Paxos 同族但不同协议**。论文里 ZAB 作者明确说"ZAB 不是 Paxos"——它有独立的安全性证明。

### 8.2 「Raft 是 Paxos 的子集」

**部分对**。Raft 的算法可以看作"约束更多的 Multi-Paxos",但**Raft 重新组织了证明结构,有独立的不变量体系**。说"子集"忽略了它的可读性贡献。

### 8.3 「EPaxos 因为复杂,所以错了」

**不对**。EPaxos 在数学上完全正确,**没有任何 Jepsen 级别的 bug 报告**(因为没人在生产用)。它只是"工程上不被接受"——这是不同维度。

### 8.4 「ZK 提供线性一致性」

**只对写**。**ZK 默认读是 sequential**,需要 linearizable 要 sync()。**这是面试最容易答错的一点**。

---

## 九、真实系统映射

| 协议 | 系统 | 备注 |
| --- | --- | --- |
| **ZAB** | ZooKeeper | 唯一工业代表 |
| **类 ZAB** | Apache Curator(ZK 客户端封装) | 用 ZK,保留 ZAB 语义 |
| **EPaxos / 类 EPaxos** | 学术原型 / 少数 Google 内部 / SpiderDB(已停) | 工业落地极少 |
| **Multi-Paxos** | Chubby / Spanner / Cassandra LWT | Google + 数据库 |
| **Raft** | etcd / Consul / TiKV / CockroachDB / KRaft / 各种自研 | 新系统首选 |

> **ZK 没死**——它在 Hadoop / HBase / Kafka(旧版) / Solr / Flink JM 选主 / Spark 早期都广泛使用。但**Kafka 3.3+ 用 KRaft 替了 ZK,Pulsar 用 BookKeeper 不依赖 ZK,Flink 趋势也在去 ZK**。**ZK 是 Hadoop 时代的协调服务王者,但新时代正在被 Raft + etcd 替代**。

---

## 十、踩坑提醒

1. **以为 ZK 默认读是强一致**——**默认 sequential,要 sync()**;**用 ZK 实现锁、读锁状态时必须 sync(),否则可能误判**
2. **用 ZK 当数据库**——ZK znode 默认 1MB 上限,**几万写就抖,别拿它存业务数据**
3. **ZK 集群规模太大**(> 7 节点)——**多数派变大,吞吐反而下降**,典型部署 3 / 5 节点
4. **跨地域部署 ZK**——延迟敏感,**ZK 跨机房延迟超 50ms 就要重新评估**,要么用 observer,要么换方案
5. **不处理 ZK 的 session 失效**——network partition 导致 client session 超时,**所有 ephemeral node 消失、watch 失效**;**客户端必须有重连 + 重建状态的逻辑**
6. **以为 EPaxos 比 Raft 更好就上 EPaxos**——**实现复杂度 3-5 倍**,**没有成熟开源库**,**99% 的项目应该用 Raft**
7. **EPaxos 在高冲突场景下用**——**冲突率高时 slow path 频繁,反而比 Raft 慢**;只在写均匀(随机大 keyspace)时才有优势
8. **不理解 ZAB FIFO 语义**——**ZK client API 的"顺序保证"来自 ZAB,换 etcd 后没有这个保证**,业务要自己做 sequencing
9. **混淆 ZAB epoch 和 Raft term**——概念类似,**实现细节不同**(zxid 把 epoch 编进事务 ID,Raft 把 term 放在每条 entry)
10. **EPaxos 的依赖图不持久化**——崩溃恢复后依赖图丢失,EPaxos 的依赖**必须随日志一起持久化**;部分实现里这是 bug 源头
11. **以为「无 leader = 更可用」**——**EPaxos 同样需要多数派,少数派依然不可写**;无 leader 不等于无多数派依赖

---

## 十一、收束

ZAB 和 EPaxos 是共识协议家族的"另一面":

- **ZAB 教会我们:协议可以为特定应用语义定制——严格 FIFO + 协调服务,ZK 用 ZAB 不用 Raft 的原因就是历史早 + 语义更贴合**。
- **EPaxos 教会我们:leader 不是必须的——leader-free 数学上可行,只是工程上太贵**。

**Raft 不是终点,Raft 是当前最优解**——它在「易实现 / 易理解 / 性能足够」三角上取得了最佳平衡。**ZAB 在 Hadoop 时代有它的辉煌,EPaxos 是学术界对 Paxos 家族的最后一次重大革新**——它们都是共识理论这棵大树的旁枝,**主干仍然是 Multi-Paxos → Raft 这条线**。

下一篇我们将彻底离开「诚实节点」的世界,进入**拜占庭故障**——**节点可以撒谎、可以攻击、可以任意行为**。**Raft / ZAB / EPaxos 全部失效,要换一套完全不同的协议**——PBFT、HotStuff、Tendermint,**这是区块链共识的根基,也是金融级容灾的天花板**。

> **看完这篇,你应该能在脑子里清楚回答**:**ZK 为什么不能改成 Raft 复制(语义不兼容)?EPaxos 为什么不流行(实现太难,Raft 已够用)?Raft + multi-region 怎么近似 EPaxos 的多地域优势(multi-raft + leader placement)?** 能想清这三问,你就吃透了共识协议家族 95% 的工程图景。

---

下一篇:`15-拜占庭容错.md`,**进入"节点可以撒谎"的世界**——为什么 N ≥ 3f+1、PBFT 三阶段为什么是 O(N²) 消息、HotStuff 怎么把它降到 O(N)、Tendermint / Cosmos 怎么把 PBFT 和 PoS 结合,**为什么 99% 的业务不需要 BFT**——内网集群 Raft / Paxos 完全够用,**BFT 是 3-5 倍开销的奢侈品**。
