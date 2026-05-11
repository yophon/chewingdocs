# Raft 全解

Raft 是 Diego Ongaro 2014 年的博士论文,题目就叫 **"In Search of an Understandable Consensus Algorithm"**——副标题翻译过来是「找一个能听懂的共识算法」。这句话直接戳了 Paxos 二十年的痛处:**Paxos 算法不是不对,是没人能听懂**。Raft 用同一个安全性证明、同一个 RPC 复杂度,**把算法重新组织成"先选主、再复制日志、再保安全"三块独立模块**,论文上来就给伪代码、状态机、不变量,**学生第一次能在两小时内手写出一个能跑的版本**。**这是 Raft 最大的工程胜利——不是更强,而是更易实现、更易调试、更易讲清楚**。

> 一句话先记住:**Raft = Multi-Paxos + 强 Leader + 明确的三个子问题(选主 / 日志复制 / 安全)+ 工业级伪代码**——它没在数学上做新东西,**它在工程"可读性"上做了革命**。**今天 etcd / Consul / TiKV / CockroachDB / Kafka(KRaft) / Redis Cluster Bus / SQL Server / RethinkDB / 几乎所有现代协调与数据库的复制层,底下全是 Raft**——Paxos 留在论文里,Raft 留在生产里。

---

## 一、Raft 解决的问题:跟 Paxos 一样,但讲法不同

Raft 跟 Multi-Paxos 解决的是**完全相同的问题**:

- N 个副本(常 3 / 5 / 7)
- 异步网络,可能丢包 / 乱序 / 延迟
- 节点可能 crash 重启(**不考虑拜占庭故障**,留给第 15 篇)
- 多数派存活就要继续工作(N=5 可容忍 2 个挂)
- 所有副本最终对**一个有序的指令序列**达成一致

**结果**:在副本上跑同一个状态机,**输入序列一致 → 输出一致 → 状态一致**——这就是 State Machine Replication(SMR),所有协调服务的根基。

### 1.1 为什么不直接用 Paxos

Paxos 论文留下的痛点(详见第 11、12 篇):

| 痛点 | Paxos 现状 | Raft 解决方式 |
| --- | --- | --- |
| **没有标准 leader 流程** | Multi-Paxos 提到"应该选 leader",但没给伪代码 | **Leader Election 单独一章,完整伪代码** |
| **日志空洞处理含糊** | 论文允许日志有洞,工程实现各家不同 | **强约束:日志连续,不允许空洞** |
| **成员变更没讲清** | 原论文不讲,后续 paper 加 alpha-Paxos / Vertical Paxos | **Joint Consensus + 单步变更两套都给伪代码** |
| **学生看不懂** | Lamport 自嘲"我故意写得难" | **Ongaro 反着来:伪代码 + 状态图 + 不变量罗列** |
| **测试很难** | 状态空间大、模糊 | **TLA+ spec 论文附录给了,可以模型检查** |

> **Paxos 是"算法在数学上的胜利",Raft 是"算法在工程教学上的胜利"**——前者论文 1998 年,后者 2014 年,**中间隔了 16 年的工程师抱怨**。

### 1.2 Raft 的三段切分(论文核心贡献)

Raft 把共识拆成**三个互相独立**的子问题:

```
        ┌──────────────────────────────────────┐
        │      Raft = 三个子问题 + 安全约束       │
        └──────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────────┐
        ▼                 ▼                     ▼
   1. Leader         2. Log              3. Safety
      Election          Replication          (Invariants)
   ─────────────    ─────────────────    ─────────────────
   term + voting    leader 接受写         5 大不变量
   随机 timeout     广播 AppendEntries    保证状态机一致
   多数票当选       多数派 commit
```

**每个子问题独立讲清楚,然后用安全不变量串起来**——这是 Raft 论文的写作秘诀,也是它易懂的根本原因。

---

## 二、三态状态机:Follower / Candidate / Leader

每个 Raft 节点任意时刻处于三个状态之一:

```
                  ┌──────────────────────────────┐
                  │                              │
                  │      启动 / 收到 leader 心跳   │
                  ▼                              │
            ┌───────────┐                        │
            │ Follower  │◀───── 收到更高 term ──┐ │
            └─────┬─────┘                      │ │
                  │ election timeout            │ │
                  │ (150-300ms 内未收到心跳)    │ │
                  ▼                            │ │
            ┌───────────┐                      │ │
            │ Candidate │─── 收到更高 term ────┤ │
            └─────┬─────┘                      │ │
                  │                            │ │
        ┌─────────┼─────────┐                  │ │
        │         │         │                  │ │
   赢得多数选票  超时未赢   收到 leader 心跳    │ │
        │         │  (拆票) (该 leader 合法)    │ │
        ▼         ▼         ▼                  │ │
   ┌─────────┐  重选     回 Follower            │ │
   │ Leader  │                                 │ │
   └─────────┘─────── 失联 / 收到更高 term ────┘ │
        │                                        │
        └────────────── 发心跳维持 leadership ───┘
```

**三态切换的关键触发条件**:

| 切换 | 触发 |
| --- | --- |
| Follower → Candidate | election timeout(随机 150-300ms 没收到 leader 心跳) |
| Candidate → Leader | 赢得多数派选票 |
| Candidate → Follower | 收到合法 leader 的 AppendEntries / 投票给别人 / 看到更高 term |
| Candidate → Candidate | 选票拆分,等下一轮 election timeout |
| Leader → Follower | 看到更高 term(网络分区恢复后常见) |

> **任何状态下,只要看到 term > 自己的 term,立即变 Follower**——这是 Raft 最重要的一条规则,保证不会出现"两个 leader 都觉得自己合法"的局面。

---

## 三、Leader Election:term + 随机 timeout

### 3.1 term 是 Raft 的"逻辑时钟"

**term(任期)是单调递增的整数**,每次选举开启一个新 term。**term 起到 Paxos 中 proposal number 的作用**——比较新旧、决定谁的写有效。

```
term 1            term 2          term 3       term 4
─────────  ████  ─────────  ███  ─────────  ███  ─────────
 N1 leader  选举  N2 leader  选举  无主     选举  N3 leader
                                  (拆票)
```

**关键不变量**:

- **每个 term 最多一个 leader**(Election Safety,见第六节)
- **每个节点在一个 term 内最多投一票**(给最先 RequestVote 的)

### 3.2 RequestVote 伪代码

```
// Candidate 发起选举
On election timeout:
    currentTerm += 1
    state = Candidate
    votedFor = self
    voteCount = 1
    reset election timer
    并发发 RequestVote(term, candidateId, lastLogIndex, lastLogTerm) 给所有节点

// 接收方处理
RequestVote(term, candidateId, lastLogIndex, lastLogTerm):
    if term < currentTerm:
        return (currentTerm, false)              // 拒绝旧 term

    if term > currentTerm:
        currentTerm = term
        state = Follower
        votedFor = null                          // 新 term 重置投票

    // 关键:谁的日志"更新"才投票
    logUpToDate = (lastLogTerm > myLastLogTerm) ||
                  (lastLogTerm == myLastLogTerm && lastLogIndex >= myLastLogIndex)

    if (votedFor == null || votedFor == candidateId) && logUpToDate:
        votedFor = candidateId
        reset election timer
        return (currentTerm, true)

    return (currentTerm, false)
```

**两条核心规则**:

1. **只给"日志至少和我一样新"的候选人投票**——保证将来的 leader 一定有所有已 commit 的日志(**Leader Completeness 不变量**,第 6 节细讲)
2. **在新 term 内只投一票**——保证一个 term 最多一个 leader

### 3.3 随机化 election timeout:防止反复拆票

**所有节点同时变 Candidate → 都拿不到多数票 → 都超时 → 再同时变 Candidate**,这叫**活锁(livelock)**。

**Raft 的解决方案极简单**:**election timeout 在 [150ms, 300ms] 范围内随机取**。

```
N1: timeout = 187ms
N2: timeout = 245ms
N3: timeout = 290ms

N1 先超时 → 先发 RequestVote → 大概率赢
```

> **这是 Raft 最聪明的一笔——用随机化避免对称死锁,论文里花了大段证明这个范围的有效性**。**工业实现里常调到 [500ms, 1000ms],跨地域甚至 1.5s-3s**——单元越慢、网络越抖,timeout 要越大。

---

## 四、Log Replication:Leader 单流、多数派 commit

### 4.1 日志结构

每个节点维护一个**有序日志**,每条日志条目(entry)包含:

```
┌─────┬──────┬──────────────────────┐
│ idx │ term │ command              │
├─────┼──────┼──────────────────────┤
│  1  │  1   │ x = 3                │
│  2  │  1   │ y = 1                │
│  3  │  2   │ x = 5                │
│  4  │  3   │ z = 2                │
└─────┴──────┴──────────────────────┘
            ▲
            │ commitIndex(已知被多数派复制,可应用)
```

- **idx**:日志位置,从 1 开始连续
- **term**:这条 entry 是哪个 term 写入的(关键,用于安全性判断)
- **command**:状态机命令(SET x 3 / DELETE y / ...)

### 4.2 写入流程一张图

```
Client                Leader (N1)            Follower (N2)    Follower (N3)
  │                       │                       │                │
  │── write(x=5) ────────▶│                       │                │
  │                       │ append to local log   │                │
  │                       │ idx=4, term=3         │                │
  │                       │                       │                │
  │                       │── AppendEntries ─────▶│                │
  │                       │── AppendEntries ──────┼───────────────▶│
  │                       │                       │ append          │
  │                       │                       │ idx=4, term=3   │
  │                       │                       │                │
  │                       │◀──────── ack ─────────│                │
  │                       │◀──────── ack ─────────┼────────────────│
  │                       │                       │                │
  │                       │ majority acked        │                │
  │                       │ commitIndex = 4       │                │
  │                       │ apply to state machine│                │
  │                       │                       │                │
  │◀────── OK ────────────│                       │                │
  │                       │                       │                │
  │                       │── next AppendEntries 带 commitIndex=4 ─│
  │                       │                       │ apply to SM    │
  │                       │                       │                │ apply to SM
```

**五步**:

1. Client 把请求发到 Leader(发到 Follower 会被重定向)
2. Leader **先 append 到自己的本地日志**(不 commit)
3. Leader 并发 AppendEntries 给所有 Follower
4. **多数派 ack 后,Leader commit**(写到 commitIndex)→ 应用到状态机 → 回 Client OK
5. Leader 在**下一个 AppendEntries / 心跳**中带上新的 commitIndex,Follower 跟进 commit + apply

> **commit 的定义**:**一条 entry 被多数派复制 + leader 当前 term 内的 entry 中至少有一条被多数派复制**——后半句是为了避免一个 corner case(**Figure 8 问题**,第 6 节会讲)。

### 4.3 AppendEntries 伪代码

```
// Leader 发送
AppendEntries(
    term,              // leader 当前 term
    leaderId,
    prevLogIndex,      // 紧接新 entry 之前的 log index
    prevLogTerm,       // 那个 entry 的 term
    entries[],         // 新 entry(心跳时为空)
    leaderCommit       // leader 的 commitIndex
)

// Follower 接收
On AppendEntries:
    if term < currentTerm:
        return (currentTerm, false)              // 拒绝旧 leader

    reset election timer                          // 收到合法心跳,不参选

    if term > currentTerm:
        currentTerm = term
        state = Follower

    // Log Matching 检查
    if log[prevLogIndex].term != prevLogTerm:
        return (currentTerm, false)              // 日志不连续,leader 要回退

    // 删除冲突的后续 entry,append 新 entry
    for each entry in entries:
        if log[entry.index] exists and log[entry.index].term != entry.term:
            delete log[entry.index..end]         // 删除冲突段
        log[entry.index] = entry

    if leaderCommit > commitIndex:
        commitIndex = min(leaderCommit, lastNewEntryIndex)
        apply entries [lastApplied+1 .. commitIndex] to state machine

    return (currentTerm, true)
```

**关键点 prevLogIndex / prevLogTerm**:

```
Leader 想 append idx=5(term=3)给 Follower
Leader 在 AppendEntries 里带:
    prevLogIndex=4, prevLogTerm=2

Follower 检查自己 idx=4 的 entry:
    如果 term==2 → 一致 → append 新 entry
    如果 term!=2 → 不一致 → 返回 false,要求 leader 把 prevLogIndex 往前回退
```

**Leader 处理拒绝**:nextIndex[follower] -= 1,重发更早的 AppendEntries,直到找到一致点。**找到一致点后,Leader 把后面的全部覆盖给 Follower**——**强 Leader 模型,Follower 没有协商权**。

### 4.4 Log Matching 不变量(第 6 节细讲)

```
如果两条日志条目在两个节点上:
    1. index 相同
    2. term 相同
则:
    a) 它们的 command 必相同
    b) 它们之前的所有 entry 也必相同
```

这是 Raft 的核心安全性保证——**(index, term) 全局唯一确定一条 entry,且推出之前历史全相同**。**这条不变量是 AppendEntries 的 prevLogIndex/prevLogTerm 检查直接维护的**。

---

## 五、Raft vs Paxos:不是更强,是更易实现

| 维度 | Multi-Paxos | Raft |
| --- | --- | --- |
| **算法核心** | Prepare + Accept 两阶段 | RequestVote + AppendEntries 两个 RPC |
| **Leader 角色** | 论文里"可选" | **强 Leader,不可省** |
| **日志结构** | 允许有空洞 | **强约束,连续无洞** |
| **日志复制** | leader 可以乱序发 | **必须按 index 顺序连续** |
| **新 leader 处理日志** | Phase 1 重新 prepare 所有未 commit 的位置 | **找到日志最新的人当 leader,直接覆盖 follower** |
| **成员变更** | 没说清,后人补 | **Joint Consensus + 单步变更,论文给伪代码** |
| **可读性** | 论文 13 页,学生看不懂 | 论文 18 页 + 附录,学生 1 天能复现 |
| **TLA+ spec** | Lamport 后期补的 | 论文附录直接给 |
| **工程库** | Chubby(闭源) / Spanner / Cassandra Lightweight Tx | etcd / Consul / TiKV / CockroachDB / KRaft / dragonboat |

> **理论强度上 Raft 是 Multi-Paxos 的"特例"**——Raft 强制 Leader、强制日志连续,**牺牲了一些灵活性,换来易实现性**。Paxos 不会被淘汰(Spanner、Cassandra LWT 还在用),但**新系统几乎没人再选 Paxos**——可读性碾压,工程师不愿意写自己看不懂的代码。

---

## 六、五大安全不变量(Raft 的灵魂)

这是 Raft 论文 Figure 3 的核心——**只要这五条不变量都成立,系统就安全**:

### 6.1 Election Safety:每个 term 最多一个 leader

**保障机制**:

- 一个 term 内每个节点最多投一票
- 当选需要多数派票
- → **同一 term 不可能有两个候选人都拿到多数派**(两个多数派必有交集,交集节点不能同 term 投两票)

### 6.2 Leader Append-Only:Leader 永远不修改/删除自己的日志

**保障机制**:Leader 只能 append 新 entry,不能改旧的。**如果 Leader 看到 term > 自己的就立即变 Follower**——所以一个 leader 任内,它的日志只增不变。

### 6.3 Log Matching:idx + term 相同 → 历史全同

**保障机制**:AppendEntries 的 prevLogIndex / prevLogTerm 检查 + 归纳法。**这条不变量是 Raft 区别于 Paxos 的核心简化**——Paxos 允许日志洞,Raft 不允许,直接砍掉一大堆复杂情况。

### 6.4 Leader Completeness:已 commit 的 entry 在所有未来 leader 中都有

**保障机制**(最难的一条):

- **commit 要求多数派复制**
- **当选 leader 要求多数派投票**
- **投票规则要求"候选人的日志至少和我一样新"**(lastLogTerm 大或 lastLogIndex 大)
- → **任何已 commit 的 entry 必定在某个多数派中**;**任何新当选的 leader 必定来自某个多数派的"日志最新者"**;**两个多数派必有交集** → **交集节点的"日志最新"包含已 commit 的 entry** → **新 leader 的日志一定有它**

**这一条保证了"leader 切换不丢已 commit 的写"**,是 Raft 最关键的安全性。

### 6.5 State Machine Safety:同一 idx 上所有节点应用相同 command

**保障机制**:由前 4 条直接推出——日志一致 + leader 不丢 → 状态机应用一致。

---

### 6.6 Figure 8 问题:不能 commit 旧 term 的 entry

Raft 论文里有个著名的 corner case,叫 **Figure 8 问题**:

```
场景:
    term 2 的 leader 写了 idx=2 entry,刚复制到一台 follower 就挂了
    term 3 新 leader 上任,发现 idx=2 这条只在 1 台节点上,**它能直接 commit 这条吗?**

回答:不能。

为什么?
    如果直接 commit,后续可能出现"已 commit 的 entry 被覆盖"
    具体:
        term 4 又选出一个 leader(它没复制到 idx=2 那条),
        它会 append 自己的 idx=2 → 把那条 term 2 的覆盖了
        → 已 commit 的东西被覆盖,违反 Leader Completeness!

解决:
    新 leader 不能直接 commit 旧 term 的 entry,
    必须在自己当前 term 写一条新 entry,**通过 commit 这条新的"间接 commit"旧的**。
```

**工程实现**:**leader 上任后立即写一条 no-op entry**(空操作),用它的 commit 顺带 commit 之前的——etcd / Consul / TiKV 都这么做。

> **Figure 8 是 Raft 最容易被实现忽略的一点**,Aphyr 用 Jepsen 测试发现过多家(早期 etcd、Consul)有这个 bug。

---

## 七、成员变更:Joint Consensus 与单步变更

### 7.1 为什么成员变更难

**最危险的不一致**:从 3 节点扩到 5 节点,**如果不小心,可能同时存在"3 节点的多数派 = 2"和"5 节点的多数派 = 3",两个多数派不相交 → 两个 leader 都觉得合法 → 脑裂**。

```
旧配置 C_old = {A, B, C},多数派 = 2
新配置 C_new = {A, B, C, D, E},多数派 = 3

如果 A、B 还停留在 C_old,觉得自己赢得了多数(2 票),选 A 当 leader
同时 C、D、E 已切到 C_new,觉得自己赢得了多数(3 票),选 C 当 leader
→ 两个 leader 同 term 出现!
```

**根因**:**配置变更不是原子的**,节点切换有时差,期间两个多数派不相交。

### 7.2 Joint Consensus(两阶段成员变更)

Raft 论文给的方案——**两阶段切换**:

```
阶段 1:发布"联合配置" C_old,new
    任何决策需要同时获得 C_old 的多数派 + C_new 的多数派
    → 期间不可能出现两个不相交的多数派

阶段 2:多数派确认 C_old,new 后,切到 C_new
```

**联合多数派 = 旧集合多数 AND 新集合多数**,**两个不能同时被两个不同 leader 拿到**(都需要旧集合多数,旧集合多数派必有交集)。

**伪代码**:

```
1. Leader 收到 ChangeMembership 请求,生成 C_old,new
2. AppendEntries 把 C_old,new 复制到联合多数派
3. C_old,new commit 后,Leader 写 C_new entry
4. AppendEntries 把 C_new 复制到 C_new 多数派
5. C_new commit → 切换完成 → 不在 C_new 里的节点退出
```

### 7.3 单步成员变更(Diego 后期方案)

Joint Consensus 太复杂,后来 Diego 在 PhD 论文里给了**简化版:每次只加/减一个节点**。

**核心观察**:**奇偶切换时,N 和 N+1 的多数派必有交集**:

```
3 节点(多数派 = 2)→ 4 节点(多数派 = 3)
    任何 3 节点多数派 ∩ 任何 4 节点多数派 ≠ ∅
    (因为 2 + 3 > 4,必有交集)
```

→ **不会出现两个不相交的多数派,可以一步切换,不用联合配置**。

**etcd / Consul / TiKV 全部用单步成员变更**——简单可靠。Joint Consensus 反而被冷落了。

---

## 八、Snapshot 与日志压缩:InstallSnapshot RPC

### 8.1 为什么需要快照

**日志会无限增长**——每次写操作都 append 一条,**跑一年的集群日志可能几百 GB**。

**问题**:

- 重启时回放日志要几小时
- 新加入节点要复制全部日志才能跟上
- 磁盘吃满

### 8.2 快照机制

```
日志:
    ┌────┬────┬────┬────┬────┬────┬────┬────┬────┐
    │ 1  │ 2  │ 3  │ 4  │ 5  │ 6  │ 7  │ 8  │ 9  │
    └────┴────┴────┴────┴────┴────┴────┴────┴────┘
                              ▲
                              │ lastApplied = 5

打快照:把状态机当前快照存盘,记录 lastIncludedIndex=5, lastIncludedTerm=2
然后:
    ┌──────────────┬────┬────┬────┬────┐
    │  Snapshot    │ 6  │ 7  │ 8  │ 9  │
    │ (idx ≤ 5)    │    │    │    │    │
    └──────────────┴────┴────┴────┴────┘
    把 idx 1~5 的日志条目丢掉
```

**每个节点独立打快照**(不需要协调),**leader 不发送已被快照的 entry**——**Follower 跟不上时,leader 发 InstallSnapshot RPC**,直接把整个快照传过去。

### 8.3 InstallSnapshot 伪代码

```
InstallSnapshot(
    term,                  // leader term
    leaderId,
    lastIncludedIndex,     // 快照包含到哪个 idx
    lastIncludedTerm,
    offset,                // 分块传输偏移
    data[],
    done                   // 是否最后一块
)

On receive:
    if term < currentTerm: return
    save data to snapshot file
    if not done: return    // 等下一块

    // 最后一块,生效
    if existing snapshot covers lastIncludedIndex:
        return             // 忽略旧 snapshot

    delete log entries up to lastIncludedIndex
    apply snapshot to state machine
    commitIndex = lastIncludedIndex
    lastApplied = lastIncludedIndex
```

**工程实现**:

- 快照分块传输(几百 MB 不能一个 RPC 干完)
- **快照不能阻塞主流程**——一般用 fork / copy-on-write,后台慢慢打
- **打快照频率权衡**:太频繁占 IO,太少日志膨胀;**etcd 默认 10000 条 entry 打一次**

---

## 九、工程实现:六大主流 Raft 库

| 库 | 语言 | 用在哪 | 特色 |
| --- | --- | --- | --- |
| **etcd-raft** | Go | etcd / TiKV(老版) / CockroachDB / Kubernetes | 库形态,不带网络/存储,业务自己接;**最经典的实现** |
| **hashicorp/raft** | Go | Consul / Nomad / Vault | 自带网络层,易上手;**HashiCorp 全家桶都用它** |
| **braft** | C++ | 百度内部多项目 / brpc 配套 | 高性能,C++ 实现;**国内最广用的 C++ Raft** |
| **dragonboat** | Go | OpenGauss、各种自研 KV | **multi-raft 优先**,可跑十万个 raft group |
| **TiKV multi-raft** | Rust | TiDB / TiKV | **每个 Region 一个 raft group**,几十万个 group |
| **KRaft** | Java | Kafka 3.3+ | **Kafka 自研,替代 ZK**;controller 元数据用 Raft |

### 9.1 etcd-raft 的「裸库」哲学

etcd-raft 不带网络、不带存储、不带 RPC——**它只给你一个状态机**:你 `Step()` 喂消息给它,它告诉你"现在该发什么消息 / 写什么日志 / 应用到状态机"。

```go
// 简化示意
n := raft.StartNode(config, peers)
for {
    select {
    case <-tickC:
        n.Tick()                              // 时钟驱动
    case rd := <-n.Ready():
        saveToStorage(rd.HardState, rd.Entries, rd.Snapshot)
        send(rd.Messages)                     // 应用层负责网络
        for _, entry := range rd.CommittedEntries {
            process(entry)                    // 应用到业务状态机
        }
        n.Advance()
    case m := <-recvC:
        n.Step(m)                             // 收到对端消息
    }
}
```

**好处**:库不绑定具体网络/存储,**任何项目都能拿来用**。
**坏处**:上手陡——你得自己写网络层、日志持久化、快照管理。

### 9.2 multi-raft:大规模数据系统的标配

**单 Raft 组的瓶颈**:**所有写都过 leader**,leader 网卡是单点天花板。

**multi-raft 的思路**:**把数据切成几万个 region,每个 region 一个独立的 raft group**,leader 分布在不同节点上。

```
TiKV 一个集群可能有 100,000 个 region
每个 region ≈ 96MB 数据
每个 region 有自己的 leader / follower / 日志
不同 region 的 leader 在不同节点上 → 写流量天然分散

CockroachDB / TiKV / YugaByte / Dragonboat 都用 multi-raft。
```

**工程难点**:

- **批量心跳**:10 万个 group 心跳合并发,不然光心跳就占满网络
- **Region 分裂 / 合并**:数据热点要动态切分
- **跨 region 事务**:见第 23 篇 Percolator

---

## 十、Raft 的缺点与局限

### 10.1 单 leader 写吞吐天花板

**所有写都过 leader**,leader 的 CPU / 网卡 / 磁盘 IO 决定上限。单 region 的 Raft 在 10Gbps 网卡上**典型写入上限 10-30 万 QPS**——再高就要 multi-raft 切流量。

### 10.2 跨地域延迟敏感

**写必须多数派 ack**——5 节点跨 3 个 region,**任何一次写都要等次远 region 的 ack**。北京 ↔ 上海 ↔ 广州 三地写,**延迟 30-50ms 起步**,**比单机 1ms 慢 30-50 倍**。

**Spanner 用 Paxos 配 TrueTime,CockroachDB 用 Raft + HLC,本质都绕不开多数派 RTT**。

### 10.3 Leader 切换的不可用窗口

**Leader 挂 → 检测超时(election timeout) → 选举 → 新 leader 同步日志 → 恢复服务**。

```
election timeout: 150-300ms(典型)
拆票一次:再 150-300ms
新 leader 同步落后 follower 日志:依数据量,可能秒级

总不可用窗口:150ms ~ 2s(典型 300ms-1s)
```

**99.9% 可用性允许年 8.76h 不可用**,Raft 自己每年几十次 leader 切换 → **每次切换都消耗几百毫秒,加起来不超标但不能放任**——**优雅切换(Leader Transfer)是工程优化重点**。

### 10.4 网络分区下的少数派完全不可用

CP 系统的本性——**3 节点集群,1 个节点分区出去,那个节点完全无法服务**。要 AP 必须换协议(Dynamo / Cassandra 的 AP 模式),不在 Raft 能力范围内。

### 10.5 不抗拜占庭故障

**Raft 假设所有节点诚实**——硬件错误返回错值、被入侵节点撒谎、磁盘静默损坏返回脏数据,Raft 都不能处理。**金融生产级别要叠校验和、磁盘 ECC、读多份对比**。**真正拜占庭场景上 PBFT,见第 15 篇**。

---

## 十一、Jepsen 测试历史:Aphyr 在 Raft 上发现的 bug

Kyle Kingsbury(Aphyr)的 Jepsen 测试系列**几乎每次都能在新 Raft 实现上找到 bug**——这反过来证明 Raft 的工程实现极难写对。

| 系统 | Jepsen 发现 | 时间 |
| --- | --- | --- |
| **etcd v0.4** | 网络分区时 leader 接受写但不提交,客户端误以为成功 | 2014 |
| **Consul 0.x** | "stale read" 默认开启,读到旧数据 | 2014 |
| **etcd v3.x** | watch 在 leader 切换时可能丢事件 | 2017 |
| **TiDB / TiKV** | 多 region 事务在分区下违反 snapshot isolation | 2019 |
| **CockroachDB** | 时钟跳变后 stale read 违反 linearizability | 2017 |
| **MongoDB(类 Raft 选举)** | 多个 corner case,**MongoDB 选举协议在 2015 之前完全错** | 2015-2017 |

> **教训**:**Raft 论文易懂不等于易实现**。**没经过 Jepsen 测的 Raft 实现都不能上生产**——上 Aphyr 的网站,每篇报告都是吓人的 bug 列表。**自研 Raft 是高级软件工程师的"自杀任务"**,**95% 的项目应该直接用 etcd-raft / hashicorp-raft / braft 这些经过千锤百炼的库**。

---

## 十二、参数调优清单

实际部署 Raft 系统时,这几个参数最常调:

| 参数 | 默认 | 调优方向 |
| --- | --- | --- |
| **election timeout** | 150-300ms | 慢网络 / 跨地域:500ms-3s |
| **heartbeat interval** | 50ms | 通常是 election timeout 的 1/10 |
| **snapshot threshold** | 10000 entries | 高写入:调高;磁盘紧:调低 |
| **snapshot chunk size** | 1MB | 跨地域大快照:调小,避免单 RPC 超时 |
| **max inflight messages** | 256 | 高带宽 / 大批量:调大 |
| **max batch entries** | 64 | 高吞吐:调大;低延迟:调小 |
| **pre-vote** | 默认开 | 防止网络抖动导致频繁选举(强烈建议开) |
| **read index / lease read** | 默认开 | 性能优化(读不走完整 Raft) |

**pre-vote 详解**:一个被分区的节点回归后,**term 比集群高**(它在分区期间多次发起选举增加了 term),回来后强行触发选举。**pre-vote 先发"假投票"探听,确认能赢再正式选**——避免无谓的 leader 抖动。

**lease read 详解**:**读请求不需要走完整 Raft 流程**,leader 凭"租约还没过期"就能安全返回——前提是 leader 知道自己还是合法 leader。**性能提升 5-10 倍**,但要小心租约时间设置(详见第 27 篇选主与租约)。

---

## 十三、真实系统映射

| 系统 | Raft 用在哪 | 注意点 |
| --- | --- | --- |
| **etcd** | 整个 KV 复制 | k8s 的元数据全靠它 |
| **Consul** | KV + 服务发现的元数据 | hashicorp/raft 库 |
| **TiKV** | 每个 Region 一个 raft group | multi-raft 典型 |
| **CockroachDB** | 每个 Range 一个 raft group | 跨地域专门优化 |
| **Kafka KRaft(3.3+)** | controller 元数据 | 替代 ZooKeeper |
| **Redis Cluster Bus** | **不是 Raft**,Gossip + 自己一套选主 | **常被误以为是** |
| **RethinkDB** | shard 元数据 | 早期实现踩过坑 |
| **Nebula Graph** | meta 服务 | braft 库 |

> **几乎所有 2015 年之后新出的强一致 KV / 协调服务都用 Raft**——Paxos 留给 Google 内部和 Cassandra Lightweight Transaction。**面试时如果讲 etcd / TiKV 的复制,默认就是讲 Raft**。

---

## 十四、踩坑提醒

1. **手写 Raft → 99% 写出 Figure 8 bug**——别自己写,**用 etcd-raft / hashicorp/raft / braft**,经过千次 Jepsen 测试
2. **election timeout 设太小**(< 100ms)——网络稍抖就选举,leader 抖来抖去,客户端体验差
3. **不开 pre-vote**——分区节点回归触发无谓选举,**etcd / TiKV 都默认开,生产必须开**
4. **leader 写入不带 no-op**——上任后不及时 commit,跟 Figure 8 bug 死磕到出事
5. **快照阻塞主流程**——同步打快照导致服务卡顿,**必须用 fork / copy-on-write 异步打**
6. **multi-raft 心跳风暴**——10 万个 raft group 各自心跳,**网络全占满**;**必须做批量心跳合并**(TiKV / Dragonboat 都这么做)
7. **跨地域 Raft 不调 timeout**——150ms 默认值在北京-洛杉矶根本不够用,**频繁误判 leader 挂**
8. **不限制 follower 落后量**——慢节点落后 GB 级别后,InstallSnapshot 触发,带宽飙升
9. **以为 Raft 解决一切**——**Raft 只解决"复制一致"**,**数据正确性还要靠 checksum / WAL / fsync**
10. **leader 切换没 fencing token**——leader 自以为还合法,实际已下台,**写入打到旧 leader 上**;**配合分布式锁 fencing token,见第 26 篇**
11. **lease read 时钟假设过强**——leader 的 lease 假设时钟不会跳变,**时钟一跳,stale read 概率违反线性一致**;CockroachDB 早期吃过亏

---

## 十五、收束

Raft 的成功是**工程教学的成功**,不是数学的成功。**它没在 Paxos 的安全性证明之外多走半步,但它把算法重组成了"凡人能复现"的样子**——三个子问题、五个不变量、一段伪代码、一份 TLA+ spec、一张状态机图。**这是软件工程史上罕见的"论文直接催生工业标准"**——2014 年论文,2015 年 etcd 上 1.0,2016 年 Kubernetes 跑在 etcd 上,**今天容器编排、数据库、消息队列、协调服务全踩在 Raft 之上**。

**但 Raft 不是终点**。它是**单 leader + crash-only**的世界——下一篇我们讲 **ZAB(ZooKeeper 用)** 怎么用类似思路换一种语义(严格 FIFO),以及 **EPaxos** 怎么用"无 leader"挑战 Raft 的多地域短板。**ZAB 你天天在用却没注意,EPaxos 你听过却很少见**——理解它们之后,你才知道 Raft 不是唯一答案,**而是"在 95% 场景下最不糟糕的答案"**。

> **看完这篇,你应该能对着任何 Raft 实现的源码,在 5 分钟内指出它处于状态机哪一态、在干哪一个子问题、可能踩哪一条不变量**。**做到这点,你就吃透了所有现代协调服务的底**。

---

下一篇:`14-ZAB与EPaxos.md`,讲两个 Paxos 家族里的另类——**ZAB 是 Raft 之前 ZooKeeper 已经用了十年的协议,严格 FIFO + 类 term 的 epoch**,理解它你才理解 ZK 的 sequential consistency 从哪来;**EPaxos 是 leaderless Paxos,理论上跨地域最优,工业上几乎没人用**——理解它你才理解 Raft 为什么宁可吃 leader 瓶颈也不学 EPaxos。
