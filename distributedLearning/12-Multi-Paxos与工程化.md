# Multi-Paxos 与工程化

Basic Paxos(11 篇)只决定"一个值",但**真实系统要决定的是一连串值**——一条日志、一组命令、一系列状态变更。**Multi-Paxos 就是把 Basic Paxos 跑成"流水线"**——选一个稳定 Leader,Phase 1 一次性做完,后续每条日志只跑 Phase 2,一次 RTT 落盘一条命令。

但 Lamport 在 2001 年的 *Paxos Made Simple* 末尾只用了半页篇幅讲 Multi-Paxos,**所有"怎么落地"的细节都没写**——选主、日志复制、空洞填补、成员变更、Snapshot、客户端幂等,全是各家自己摸出来的。Google 的 Tushar Chandra 在 *Paxos Made Live*(2007)第一节就抱怨:**"理论和工程之间有巨大的鸿沟"**。这一篇把这些"鸿沟"全填上,**看完你才真正"会看"一个 Paxos 系统是怎么跑的**。

> 一句话先记住:**Multi-Paxos = 稳定 Leader + 日志复制 + 状态机**(Replicated State Machine)。**核心优化:Leader 选出来之后,Phase 1 不再每次跑,只对"所有 log slot"一次性做完,后续每条日志只要 1 RTT(Phase 2)**。**工程上的麻烦全在 Leader 周围**——选主、续约、空洞、成员变更、Snapshot、exactly-once,**这些细节是 Paxos 论文留的空白**,导致每家实现都不一样。**Raft 火起来正是因为它"把这些空白都填了"**。

---

## 一、从 Basic Paxos 到 Multi-Paxos

### 1.1 Basic Paxos 的低效根源

每决定一个值要 2 RTT(Prepare + Accept)+ 至少 2 次 fsync:

```
                    Basic Paxos 每个值的开销
┌─────────────────────────────────────────────────┐
│  Phase 1: Prepare → Promise          1 RTT       │
│           (Acceptor fsync(promised))   1 fsync    │
│  Phase 2: Accept → Accepted          1 RTT       │
│           (Acceptor fsync(accepted))   1 fsync    │
└─────────────────────────────────────────────────┘
        ⇒ 2 RTT + 2 fsync 每条日志
        ⇒ 跨城几十毫秒一条,生产不可用
```

**Lamport 的观察**:Phase 1 的作用是"申请提议权 + 发现历史"——**如果 Proposer 不变,这些信息只需要建立一次**。

### 1.2 Multi-Paxos 的核心优化

```
┌──────────────────────────────────────────────────────┐
│  Multi-Paxos 关键观察:                                 │
│                                                        │
│  1. 选一个稳定 Leader,所有客户端请求都给它           │
│  2. Leader 启动时跑一次 Phase 1,对"所有未来 log slot"  │
│     一次性占住承诺权                                   │
│  3. 后续每条日志:                                     │
│     - 只跑 Phase 2(Accept → Accepted)= 1 RTT         │
│     - Acceptor 只需一次 fsync(accepted)                │
│  4. Leader 故障时,新 Leader 上来重新跑一次 Phase 1     │
└──────────────────────────────────────────────────────┘

→ 稳态下每条日志只要 1 RTT + 1 fsync,可达 10000+ QPS
```

```
              Multi-Paxos 流水线
           
Leader 启动:
   ━━━━━━━━━ Phase 1 (一次性) ━━━━━━━━━━━━━
   "我用编号 n 占住所有 log slot 的提议权"
              ↓
   Acceptor 答应,带回每个 slot 之前 accept 过什么
              ↓
   Leader 知道历史,可以继续往后写
   
稳态写入(每条):
   Client → Leader
   Leader → Acceptor: Accept(n, slot=i, v)
                       ↓ 1 RTT + fsync
   Acceptor → Leader: Accepted(n, slot=i, v)
                       ↓
   Leader → Client: OK (并通知 Learner)
```

---

## 二、Replicated State Machine 模型

Multi-Paxos 的输出是**一条"被多数派认可"的日志序列**,但用户业务要的不是日志,**是日志被执行后的"状态"**。这就是 RSM(Replicated State Machine):

```
┌──────────────────────────────────────────────────────────┐
│                     RSM 模型                              │
│                                                            │
│   客户端命令(SET x=5, INCR y, ...)                       │
│         │                                                  │
│         ▼                                                  │
│   ┌──────────────┐                                        │
│   │   Paxos 共识  │← 共识协议保证:                        │
│   │  (Multi-     │  "所有副本看到的命令序列是同一份"        │
│   │   Paxos)     │                                        │
│   └──────────────┘                                        │
│         │                                                  │
│         ▼  确定的日志顺序                                   │
│   ┌─────────────────────────────────────┐                 │
│   │  Log: [SET x=5][INCR y][DEL z][...] │                 │
│   └─────────────────────────────────────┘                 │
│         │                                                  │
│         ▼                                                  │
│   每个副本按同一顺序 apply:                                │
│   ┌──────┐   ┌──────┐   ┌──────┐                          │
│   │副本 A│   │副本 B│   │副本 C│                          │
│   │KV 存储│   │KV 存储│   │KV 存储│                          │
│   └──────┘   └──────┘   └──────┘                          │
│         │         │         │                              │
│   只要起始状态相同 + 日志序列相同 + apply 函数确定性        │
│   → 三个副本的最终状态相同                                 │
└──────────────────────────────────────────────────────────┘
```

**RSM 的三个不变量**:

```
1. Determinism(确定性):
   状态机 apply 函数必须是纯函数 — 同样的命令在同样的状态下
   产生同样的新状态。绝不能依赖本地时间、随机数、网络。

2. Same Log(相同日志):
   所有副本看到的日志序列完全相同(Paxos 保证)。

3. Same Order(相同顺序):
   所有副本按相同顺序 apply(由 log index 决定)。

→ 这三条满足,三个副本的状态最终必然一致。
```

> **共识协议(Paxos / Raft)的本质不是"决定值",而是决定一个 log 序列**。决定 log 序列后,副本各自 apply,就有了一致的状态。**这就是为什么 Paxos 论文里只讲"对一个值的共识",但工程上能用来做 KV / 文件系统 / 数据库**——因为只要把"每条命令"看作"一个值",一条一条 apply 就能复制任意复杂的状态机。

---

## 三、Multi-Paxos 的日志复制

### 3.1 完整日志复制图

```
Client            Leader L1            Acceptor A2          Acceptor A3
   │                  │                     │                    │
   │  cmd1: SET x=5   │                     │                    │
   ├─────────────────►│                     │                    │
   │                  │ ┌─ 分配 slot 1 ────┐│                    │
   │                  │ │ log[1] = SET x=5 ││                    │
   │                  │ └──────────────────┘│                    │
   │                  │ Accept(n=5, slot=1, v=SET x=5)            │
   │                  ├────────────────────►│                    │
   │                  ├──────────────────────────────────────────►│
   │                  │                     │ ┌─ log[1] ─┐       │
   │                  │                     │ │ persist  │       │
   │                  │                     │ └──────────┘       │
   │                  │ Accepted(n=5, slot=1)                    │
   │                  │◄────────────────────┤                    │
   │                  │◄──────────────────────────────────────────┤
   │                  │ (多数派 ✓ → slot=1 committed)             │
   │                  │ log[1] apply 到状态机:x=5                │
   │  OK              │                                          │
   │◄─────────────────┤                                          │
   │                  │                                          │
   │  cmd2: INCR y    │                                          │
   ├─────────────────►│                                          │
   │                  │ Accept(n=5, slot=2, v=INCR y)            │
   │                  ├────────────────────►│                    │
   │                  ├──────────────────────────────────────────►│
   │                  │ Accepted(n=5, slot=2)                    │
   │                  │◄────────────────────┤                    │
   │                  │◄──────────────────────────────────────────┤
   │  OK              │ (slot=2 committed → apply)                │
   │◄─────────────────┤                                          │
```

每个 slot 是一个独立的"Basic Paxos 实例"——**关键是它们共享同一个 Leader 和同一个 round number n,因此 Phase 1 只跑一次**。

### 3.2 Pipeline 优化

Leader 不需要等上一条 Accepted 回来再发下一条:

```
传统串行:
  cmd1 ─→ Accept ─→ Accepted ─→ cmd2 ─→ Accept ─→ Accepted ─→ ...
        |←─── RTT ────→|

Pipeline:
  cmd1 ─→ Accept(slot=1) ──┐
  cmd2 ─→ Accept(slot=2) ──┤── 同时在飞
  cmd3 ─→ Accept(slot=3) ──┤
  cmd4 ─→ Accept(slot=4) ──┘
          ↓
  收到回包按 slot 顺序 commit + apply
```

```
Leader        A2          A3
  │            │           │
  │ Accept(1) ▼            │
  │ Accept(2) ▼            ▼   ← 并发飞向多个 Acceptor
  │ Accept(3) ▼            ▼
  │ Accept(4) ▼            ▼
  │            │           │
  │            └ Accepted(1)
  │ ◄ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤
  │            └ Accepted(2)
  │ ◄ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤
  │      ↓                 │
  │   commit log[1], log[2]│
  │   apply 到状态机        │
  │                        │
```

**单次 fsync 可以 batch 多条**——`group commit` 在工程上让 Multi-Paxos / Raft 实际 QPS 上到几万。

---

## 四、工程问题一:Leader 选举

Basic Paxos 没规定怎么选 Leader,**Multi-Paxos 的所有效率都建立在"有稳定 Leader" 这个前提上**。

### 4.1 选主的两种典型方式

```
方式 A:用 Paxos 自身选主
  把"谁是 Leader"作为一个值用 Paxos 选定
  优势:协议层一致,无需外部依赖
  劣势:选主期间无法服务,延迟敏感

方式 B:外部仲裁 + 租约(Lease)
  用 ZooKeeper / etcd 选主(里面其实也是共识)
  Leader 定期续租约,过期则触发重选
  优势:与协议解耦,容易实现
  劣势:依赖外部协调服务
```

### 4.2 Lease(租约)是 Multi-Paxos 的常见手段

```
Leader 任期(Term / Epoch / Lease)
   │
   ▼
┌──────────────────────────────┐
│ Leader 持有租约 [t0, t0+T]   │   ← T 通常几秒到 30 秒
│                              │
│  在租约内:                   │
│   - Leader 才能发 Accept     │
│   - 客户端只信这个 Leader     │
│                              │
│  续约:                       │
│   每 T/3 时间 Leader 续一次   │
│                              │
│  租约过期(网络分区、Leader 挂):│
│   多数派 Acceptor 不再认它    │
│   触发新 Leader 选举         │
└──────────────────────────────┘
```

**Chubby 用 Lease 防双主**:Leader 即使脑裂出去,租约过期前不会有新 Leader 上来(详见 26 / 27 篇)。

### 4.3 新 Leader 上任要做的第一件事

```
新 Leader 上任时(round = n_new):

  1. 向所有 Acceptor 发 Prepare(n_new),覆盖所有 log slot
     注意!不是只覆盖某一个 slot,而是"所有未 commit 的 slot"
  
  2. 收集 Promise,带回每个 slot 各自的 accepted 历史
  
  3. 对每个 slot,采用 Promise 里看到的最高编号 accepted 值
     (如果某 slot 没人 accept 过,可以填 no-op 占位)
  
  4. 进入正常 Phase 2 流水线模式
```

**第 3 步是关键**:**新 Leader 必须把"前任 Leader 已经发出但未 commit"的所有日志补完**,否则状态机数据会丢。Raft 把这一步叫做 "recovery"。

---

## 五、工程问题二:日志空洞

### 5.1 空洞怎么产生

```
Leader 同时发 4 条日志,网络抖动:
  Accept(slot=1) ✓
  Accept(slot=2) × (丢包)
  Accept(slot=3) ✓
  Accept(slot=4) ✓

→ log 中 slot=2 没收到 Accepted
→ slot=3、4 已经 committed,但因为 2 没 commit,无法 apply
   (RSM 必须按顺序 apply)
```

```
副本视角的日志状态:
  
  slot:   1     2     3     4     5
  状态:   ✓     ✗     ✓     ✓     ✓
          │     │     │     │     │
          │   空洞   │     │     │
          │     │     │     │     │
       apply 卡在这里,后面的都不能 apply
```

### 5.2 填补空洞

```
方案 A:Leader 重发
  Leader 维护"未 commit 的 slot 列表"
  发现某个 slot 超时未收到多数派 Accepted → 重发

方案 B:no-op 填补
  长时间填不上的空洞,Leader 主动写一条 no-op 命令
  (no-op = 不改变状态的命令,只占住 slot)
  → 让后续 slot 可以 apply
  
方案 C:新 Leader 重新填充
  Leader 切换时,新 Leader 必须把所有"看到过 accepted"的 slot 补完
  对空 slot 写 no-op
```

### 5.3 真实场景

Phxpaxos / PaxosStore 的设计文档里都强调:**空洞填补是 Multi-Paxos 实现里最隐蔽的 bug 源**。常见错误:

- 新 Leader 只补"已知 slot",漏了某些 slot 上有过 Promise 但没人记下
- 重发 Accept 时用了错误的 round number
- 用错 fsync 顺序导致重启后状态丢失

> **Raft 在这里做得比 Multi-Paxos 好太多**——Raft 的 log 是连续的、新 Leader 必须有最完整 log 才能当选(Leader Completeness Property),**直接消灭了空洞这个问题**。

---

## 六、工程问题三:成员变更(Reconfiguration)

集群要扩容(3 节点 → 5 节点)或缩容怎么办?**不能简单地"改个配置重启"**——可能造成两个不相交多数派各自决定不同的值。

### 6.1 反例

```
原集群 {A, B, C},多数派 = 2

某时刻只有 A 把配置改成 {A, B, C, D, E},多数派 = 3
其他节点还认为是旧配置

A 单独觉得新配置的多数派可以是 {A, D, E}
B、C 觉得旧多数派可以是 {B, C}

→ 两个不相交多数派,可能同时选定两个不同值
→ Agreement 被破坏!
```

### 6.2 Joint Consensus(Lamport 提出的方案)

```
分两阶段过渡:

阶段 1:Joint 配置(C_old ∪ C_new)
   - 任何决议要"旧多数派 ∩ 新多数派"同时同意
   - 这保证了过渡期间不会产生两个不相交多数派

阶段 2:切到 C_new
   - 只看新配置的多数派

C_old      Joint(C_old, C_new)       C_new
  ●─────────────●─────────────●
            过渡期间
   (任何值都要旧多数派 + 新多数派双重确认)
```

**Joint Consensus 在工程上极其复杂**——需要协议层多搞一套"双重多数派"的判断,Multi-Paxos 多数实现没原汁原味实现,而是用变种:

### 6.3 单步成员变更(Raft 推广的简化方案)

```
约束:每次只增减一个节点

3 → 4 (加一个):
  旧多数派 = 2(从 3 中)
  新多数派 = 3(从 4 中)
  
  任意旧多数派(2)和任意新多数派(3)的交集
  ≥ 2 + 3 - 4 = 1
  → 必有交集,Agreement 不破

→ 不需要 Joint Consensus,直接走一次普通共识写入新配置即可
```

**代价**:扩缩容要分多次进行(3→4→5,不能一步到位)。

> Raft 论文里推广了"单步变更",但**Diego Ongaro 自己后来在博士论文里指出"单步变更其实有微妙 bug"**,**推荐回到 Joint Consensus**。这又是 Paxos 系工程化里的"灰色地带"。

---

## 七、工程问题四:Snapshot 与日志压缩

### 7.1 为什么要压缩

```
不压缩的 log:
  slot 1: SET x=5
  slot 2: SET x=6
  slot 3: SET x=7
  ...
  slot 1000000: SET x=最新

→ log 文件无限增长,磁盘吃满
→ 新副本上线要 replay 一百万条命令,几小时启动不完
```

### 7.2 Snapshot 思路

```
定期把"状态机当前状态"序列化:

  snapshot_at_slot = 999500
  state = { x: 最新值, y: ..., ... }
  
→ 删除 slot ≤ 999500 的所有日志
→ 新副本启动时:
  1. 加载 snapshot
  2. 从 slot 999501 开始 replay 日志
```

```
                  Snapshot 工作流

   时间 ──→
   
   log: [1][2][3]...[999500][999501]...[1000000]
                       │           │
                       │   后续 log 保留
                       │
                  ┌────▼─────┐
                  │ Snapshot │  ← state at slot 999500
                  │ (binary) │     persisted to disk
                  └──────────┘
                       │
                  删除 log ≤ 999500
                  
   新副本启动:
     1. load snapshot → state restored at slot 999500
     2. apply log[999501..] → state up to date
```

### 7.3 工程细节

- **何时触发 snapshot**:日志大小阈值(如 64MB)或时间间隔(每小时)
- **谁来做 snapshot**:Leader 做,然后传给 Follower / Follower 各自做
- **传输 snapshot**:大文件,要分块传输 + 校验
- **snapshot 一致性**:做 snapshot 时状态机要保持稳定(写时复制 / 暂停 apply)
- **snapshot + log 复制并发**:Snapshot 还在传时,Leader 又收到新写,要分清传哪个版本

**Chubby、Spanner、etcd、TiKV** 的 snapshot 实现都数千行代码,绝大多数 bug 都在这里。

---

## 八、工程问题五:客户端 Exactly-Once

### 8.1 问题

```
客户端 ──INCR x──→ Leader
                       │
                       │  Paxos 跑了一半,Leader 挂了
                       ×
客户端:超时,重试
客户端 ──INCR x──→ 新 Leader
                       │
                       │  又跑一遍 INCR x
                       │
                       ▼
                    x 被加了两次!
```

如果操作不幂等(INCR、PUSH、转账),重试就出问题。

### 8.2 解决:client_id + req_id 去重

```
客户端为每个请求分配唯一 (client_id, req_id):
  ├─ client_id: 客户端启动时申请,集群里全局唯一
  └─ req_id:   单调递增

服务端记录:每个 client_id 最近 N 个 req_id 的处理结果

收到请求:
  if (client_id, req_id) 已经处理过:
      直接返回之前的结果(从缓存)
  else:
      跑 Paxos → 应用 → 缓存结果 → 返回
```

```
                 Exactly-Once 状态表
   ┌──────────────────────────────────────────┐
   │ client_id │ last_req_id │ last_response  │
   ├──────────────────────────────────────────┤
   │ c1        │  100        │  {ok: x=42}    │
   │ c2        │  85         │  {ok}          │
   │ c3        │  1003       │  {err: dup}    │
   └──────────────────────────────────────────┘
   
   每次 Paxos commit 时也更新这张表(作为状态机的一部分)
   → snapshot 时一起 dump
```

**这张表也要走 Paxos**——所有副本都要看到同一份 client 状态,**否则切主后新 Leader 不知道某个请求已经处理过,导致重复执行**。

> 这是 Multi-Paxos 工程化里的"必修课",**绝大多数初学者写出来的 Paxos 都没考虑这一层**,跑测试一切正常,生产网络抖一下就重复扣款。

---

## 九、Multi-Paxos 工程实现对照

| 系统 | 实现者 | 特点 |
| --- | --- | --- |
| **Chubby** | Google,Burrows 2006 | 分布式锁 + 配置中心,Multi-Paxos + Lease,生产 10+ 年 |
| **Spanner** | Google 2012 | 每个 Paxos group 用 Multi-Paxos 复制,跨 region 强一致 |
| **Megastore** | Google 2011 | 跨 DC Multi-Paxos,每个 entity group 一组 |
| **PaxosStore** | 腾讯,微信存储 | 大规模 KV,EPaxos 思想结合 |
| **PhxPaxos** | 腾讯,微信开源 C++ Paxos 库 | 工程参考价值高 |
| **Microsoft Azure Cosmos DB** | Multi-Paxos 变体 | 支持五种一致性级别 |
| **MongoDB Replica Set** | 早期类 Multi-Paxos,后转 Raft 风格 | — |
| **ZAB** | Apache ZooKeeper | 不完全是 Paxos,但思想同源(后面会讲) |

### 9.1 Chubby 的工程经验(*Paxos Made Live*)

Google 工程师踩过的坑:

1. **Disk corruption**:Acceptor 持久化的状态可能因磁盘故障损坏,**需要 checksum + 多副本**
2. **Membership change**:成员变更要做对极难,**Chubby 实现了三次都有 bug**
3. **Master Lease**:用 lease 防多主,**但要小心 lease 续约期间 GC pause / clock skew**
4. **快速选举**:选举时间影响可用性,Chubby 优化到几秒
5. **Snapshot during transfer**:正在传 snapshot 时收到新写,版本协调是噩梦
6. **Testing**:**Chubby 用了 30% 的代码量做测试和验证**(Jepsen 后来证明没他们想得那么稳)

> Burrows 在论文里说:**"虽然 Paxos 算法本身只有 30 行伪代码,我们花了两年才让 Chubby 稳定。最后我们的代码远远超出原始算法的描述。"**

---

## 十、为什么工业界更流行 Raft

Diego Ongaro 在 Raft 论文(2014)开篇就吐槽 Paxos:

> *"Despite its dominance, Paxos is notoriously difficult to understand. Furthermore, its architecture requires complex changes to support practical systems. As a result, both system builders and students struggle with Paxos."*

具体不满意的地方:

| Paxos 留下的空白 | Raft 是怎么填的 |
| --- | --- |
| 没规定怎么选 Leader | 明确的 Leader 选举(任期 Term + 投票 + 心跳) |
| 没规定日志怎么连续 | 强制 log 连续 + Leader Completeness |
| 没规定怎么补空洞 | 不允许有空洞,Leader log 必须完整 |
| 成员变更只给思路 | 单步变更 + Joint Consensus 两种方案都给完整算法 |
| Snapshot 不在论文里 | 显式 InstallSnapshot RPC |
| 客户端去重不讨论 | 显式 client session + req_id |
| 三种角色名抽象 | Leader / Follower / Candidate,直观 |
| 两阶段不直观 | AppendEntries 一种 RPC 完成正常写入 |

**Raft 的设计哲学**:"为了可理解性而设计"(*designed for understandability*)。**牺牲一点点性能,换可读、可实现、可维护**。

```
社区采纳度对比:
                  
Raft 实现(开源):           Paxos 实现(开源):
  - etcd (Go)               - PhxPaxos (C++)
  - hashicorp/raft (Go)     - libpaxos
  - dragonboat (Go)         - (很少)
  - braft (C++)
  - tikv/raft-rs (Rust)
  - openraft (Rust)
  - JRaft (Java)
  - 几十种工业级实现        - 极少
```

**结论**:Multi-Paxos 是历史正确,但 **2014 年后绝大多数新项目选 Raft**——可读、社区库丰富、文档完备。**Paxos 仍然活在 Spanner、Chubby、Cassandra LWT、PaxosStore 这些"先于 Raft" 的系统里**。

> **不要被"Raft 是 Paxos 简化版"这种说法误导**。Raft 是基于 Paxos 思想的**完全独立设计**,**它把所有工程空白填满了**——这就是它的核心价值。**Paxos 是理论里程碑,Raft 是工程里程碑**。

---

## 十一、Multi-Paxos 简化伪代码

```python
class MultiPaxosLeader:
    def __init__(self, node_id, peers):
        self.node_id = node_id
        self.peers = peers
        self.round = 0
        self.log = {}        # slot -> (n, v, committed)
        self.next_slot = 1
        self.state_machine = StateMachine()
        self.client_table = {}  # client_id -> (last_req_id, last_response)
        self.is_leader = False
    
    def become_leader(self):
        """新 Leader 启动时跑一次 Phase 1"""
        self.round += 1
        n = (self.round, self.node_id)
        
        # 对"所有 log slot"做 Prepare
        promises = broadcast(self.peers, Prepare(n, slot=ALL))
        if len(promises) < majority:
            return False
        
        # 收集已 accepted 的最高编号值,补完每个 slot
        for slot in all_slots_seen(promises):
            highest = max_accepted(promises, slot)
            if highest:
                self.log[slot] = highest    # 接收已 accept 过的最高值
            else:
                self.log[slot] = no_op()    # 空洞填 no-op
        
        # 把这些"补完"的 slot 用 Phase 2 重发,确保多数派接受
        for slot, value in self.log.items():
            self.run_phase2(slot, value)
        
        self.is_leader = True
        return True
    
    def handle_client(self, client_id, req_id, command):
        # === Exactly-once ===
        if (client_id, req_id) in self.client_table:
            return self.client_table[(client_id, req_id)]
        
        # === 分配 slot ===
        slot = self.next_slot
        self.next_slot += 1
        self.log[slot] = (self.current_n(), command, committed=False)
        
        # === Phase 2 (Pipeline) ===
        accepts = broadcast(self.peers, Accept(self.current_n(), slot, command))
        if count_accepted(accepts) < majority:
            return ERR_NOT_LEADER
        
        # === Commit + Apply ===
        self.log[slot] = mark_committed(self.log[slot])
        result = self.state_machine.apply(command)
        self.client_table[(client_id, req_id)] = result
        return result


class MultiPaxosAcceptor:
    def __init__(self):
        # 必须持久化的状态
        self.promised_n = None    # 当前承诺的最高 round
        self.log = {}             # slot -> (n, v)
    
    def on_prepare(self, n, slot=ALL):
        if self.promised_n is None or n > self.promised_n:
            self.promised_n = n
            persist(self.promised_n)
            # 返回所有 slot 的 accepted 历史
            return Promise(n, self.log)
        return NACK
    
    def on_accept(self, n, slot, v):
        if self.promised_n is None or n >= self.promised_n:
            self.promised_n = n
            self.log[slot] = (n, v)
            persist(self.log[slot])
            return Accepted(n, slot, v)
        return NACK
```

---

## 十二、踩坑提醒

1. **Multi-Paxos 没标准实现**——每家都自己摸,**别期待"按论文写"能得到能用的系统**
2. **Leader 选举不用 Lease**——直接靠心跳超时,**容易脑裂(双主)**,生产必须配 Lease + Fencing
3. **新 Leader 不重做 Phase 1**——直接用旧 round 提议,可能写入和前任冲突,**Agreement 被破坏**
4. **新 Leader 不补 log 空洞**——前任已经 accept 但未 commit 的写丢了,**数据丢失**
5. **状态机 apply 不是确定性的**——比如用了 `time.Now()`、随机数、依赖外部 API,**副本间状态发散**
6. **Snapshot 期间不暂停 apply**——状态机被边读边写,snapshot 内容不一致,**新副本启动状态错乱**
7. **没做 exactly-once**——客户端重试导致重复扣款 / 重复 INCR,**生产 100% 会踩**
8. **client_table 不走 Paxos**——切主后新 Leader 没这个表,**重复消息无法识别**
9. **成员变更直接改配置文件 + 重启**——可能产生两个不相交多数派,**Agreement 崩溃**
10. **Snapshot 与 log 串流交叉**——半个 snapshot 半个 log,启动时状态混乱
11. **没做 fsync 批量**(group commit)——每条命令单独 fsync,QPS 拉不上去,**等于自废功夫**
12. **手写 Multi-Paxos**——Google / 腾讯都做了 2-3 年,**用 etcd-raft / braft / dragonboat**,需要 Paxos 风格用 PhxPaxos
13. **以为 Multi-Paxos 比 Raft 强**——纯粹的协议性能差异很小,**工程成熟度 Raft 完胜**

---

## 第三层中段小结(09-12)

```
09 FLP 不可能定理     → 异步 + 一个故障 = 共识不可能
                       工程上靠"放宽假设"绕开

10 复制三态          → 主从 / 多主 / 无主
                       Quorum NWR 是无主的不变量
                       共识的"前置题"

11 Paxos 经典版      → 两阶段 + 多数派
                       "对一个值的共识"
                       理论里程碑,但工程不直接用

12 Multi-Paxos       → 稳定 Leader + RSM + 日志复制
                       + 空洞 + 成员变更 + Snapshot + exactly-once
                       Lamport 论文留的空白都在这里
```

**到这一篇为止,你已经能"看懂"Spanner / Chubby / Cassandra LWT 的强一致是怎么来的**——它们底层都是 Multi-Paxos 的某种工程化。

下一篇:`13-Raft全解.md`。**Raft 是 2014 年至今最重要的共识算法**——不是因为它比 Paxos 性能好,而是因为它**把 Paxos 留的所有工程空白填得清清楚楚**。我们会讲清:为什么"Term 编号"比"Ballot Number"直观、选主的"3 种状态" + "RequestVote / AppendEntries 两种 RPC"为什么够用、Log Matching Property 怎么保证日志一致性、为什么 etcd / TiKV / Consul / CockroachDB / MongoDB / Redis Cluster(部分)全用 Raft。看完 13 你就知道:**Paxos 教你"为什么对",Raft 教你"怎么做对"**——这是从理论到工程的关键一跳。
