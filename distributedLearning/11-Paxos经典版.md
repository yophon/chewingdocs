# Paxos 经典版

**Paxos 是分布式系统的"魔咒"**——所有人都听过,大多数人讲不清楚,Lamport 自己花了 8 年(1989 → 1998)才让学界接受这个算法,又花了 3 年(2001 *Paxos Made Simple*)试图重写得通俗一点。后来 Google 的 Tushar Chandra 在 *Paxos Made Live*(2007)里坦白:**"我们实现 Chubby 的 Paxos 时,反复发现论文有空缺,只能自己填"**。Ongaro 在 Raft 论文里更直白:**"Paxos 既难懂,又难实现"**——这是他发明 Raft 的动机。

这一篇不抄论文,**直接把 Paxos 当成"两阶段 + 多数派"的最小共识协议来讲**——剥开抽象名词后,Paxos 的核心只有一件事:**多个 Proposer 同时想往日志里塞值,Acceptor 多数派投票决定塞哪个,Learner 看投票结果学到结果**。看懂这一篇,你就知道 Chubby / Spanner / etcd / Zookeeper 的强一致是怎么来的。

> 一句话先记住:**Paxos 解决的问题是"一群人异步通信、可能故障的前提下,对一个值达成不可反悔的共识"**。**核心机制是两阶段**(Prepare/Promise → Accept/Accepted)**+ 多数派**(Quorum)。**关键不变量是"一旦多数派接受了值 v,后续被选定的必然还是 v"**。**Ballot Number(轮次编号)单调递增** 是让协议在并发与失败下仍能收敛的"时间感"。Paxos 难懂不是因为复杂,而是因为它**讨论的状态空间太抽象**——所有反直觉都来自"乱序消息 + 任意节点崩溃"的组合爆炸。

---

## 一、为什么 Paxos 这么难懂

先把"难懂"这件事拆开:

### 1.1 Lamport 写得故意拐弯

1990 年 Lamport 投了《The Part-Time Parliament》(兼职议会),用希腊岛 Paxos 的虚构议员故事讲算法。**审稿人完全没看懂**——以为是一篇考古论文,论文被拒。直到 1998 年才正式发表,2001 年 Lamport 不得不写《Paxos Made Simple》摘要,**只有 13 页,把那个故事拆掉直接讲算法**。

> Lamport 后来承认:那个故事是失败的(*"This paper was rejected. Some of the reviewers thought it might be amusing."*)。**"我们做学术的人有时候会得意忘形"**——他在论文集里自嘲。

### 1.2 抽象命名让人头大

Paxos 的角色和概念都用了泛化命名:**Proposer / Acceptor / Learner**——听上去像三方,实际上**一个进程可以同时扮演三种角色**(工程上几乎所有 Paxos 实现都这么做)。
**Ballot / Round / Proposal Number** —— 三种说法指的是同一个东西。
**Value**——可以是日志一条,可以是命令,可以是配置。

### 1.3 状态空间太大

Paxos 假设:

- 网络异步(消息任意延迟、丢失、乱序)
- 节点可崩溃 + 恢复(但不作恶,**非拜占庭**)
- 没有全局时钟

在这种环境下"对一个值达成共识"这个目标看起来普通,**展开状态空间后是组合爆炸**——这就是论文里那些`if highest proposal number you've seen is ≥ ...` 反直觉判断的根源。**它在防"任意时刻任意节点挂、任意消息乱序"导致的所有错乱**。

### 1.4 本质其实简单

剥开后:

```
两阶段:
  Phase 1(Prepare): 提议者问 Acceptor 们 "我用编号 n 提议,你们答应不答应?"
  Phase 2(Accept):  得到多数同意后,提议者发 "那就接受 (n, v) 吧"

多数派(Quorum):
  任意两个多数派必然有交集 → 信息不会丢

不变量:
  一旦多数派 Acceptor 接受了 (n, v),
  之后任何编号 n' > n 的提议,提议的值必然还是 v
```

> 没了。**这就是 Paxos 的全部**。后面所有反直觉的细节都是为了让"两阶段 + 多数派"在异步网络 + 故障下仍能成立。

---

## 二、共识问题的形式化

Paxos 要解决的"共识(Consensus)"问题精确定义:

```
N 个节点参与,要对"一个值"达成一致,要满足:

1. Agreement(一致性):
   不存在两个不同的值被宣布"被选中"

2. Validity(有效性):
   被选中的值必须是某个 Proposer 真的提议过的
   (不能凭空造一个)

3. Termination(终止性):
   只要有多数派节点不挂,协议最终能选出一个值

约束:
- 异步网络:消息任意延迟、丢失、乱序
- Crash-Recovery 故障模型:节点可崩溃,可恢复(磁盘持久化)
- 非拜占庭:节点不撒谎,只是会挂 / 慢
```

**FLP 不可能定理**(09 篇)告诉我们:严格满足三点不可能。**Paxos 的妥协是放弃 Termination 的"保证最终终止"**——理论上可能活锁(后面讲),**工程上靠 Leader 选主消除活锁**。

---

## 三、三角色

```
┌─────────────────────────────────────────────────────────┐
│                                                          │
│    Proposer ──提议──→ Acceptor ──告知结果──→ Learner    │
│       │                  ↑                                │
│       │                  │                                │
│       └──发起两阶段投票──┘                                │
│                                                          │
└─────────────────────────────────────────────────────────┘

Proposer(提议者):
   - 接受客户端请求
   - 发起 Paxos 协议
   - 决定提案编号(Ballot Number)
   - 决定提议什么值

Acceptor(接受者):
   - "议会成员",对提议投票
   - 持久化记录"承诺过什么"、"接受过什么"
   - 多数派 Acceptor 同意 = 决议通过

Learner(学习者):
   - 不参与投票,只关心结果
   - 从 Acceptor 学习"已选定的值"
   - 接到结果后落到状态机执行
```

工程上往往合并:

```
真实部署常见的形态:
        ┌────────────────────┐
        │  Node 1            │
        │  Proposer+Acceptor │
        │  +Learner          │
        └────────────────────┘
        ┌────────────────────┐
        │  Node 2            │
        │  Proposer+Acceptor │
        │  +Learner          │
        └────────────────────┘
        ┌────────────────────┐
        │  Node 3            │
        │  Proposer+Acceptor │
        │  +Learner          │
        └────────────────────┘

每个节点都能接客户端请求(都是 Proposer)
每个节点都是 Acceptor(投票成员)
每个节点都是 Learner(学到结果就在本地状态机 apply)

→ 3 节点 Paxos 集群,容忍 1 个节点故障
→ 5 节点 Paxos 集群,容忍 2 个节点故障
→ 通式:N=2f+1 容忍 f 个故障
```

---

## 四、Phase 1:Prepare / Promise

第一阶段的目的:**Proposer 向 Acceptor 申请"用编号 n 提议的资格",顺便了解之前已经发生过什么**。

### 4.1 流程

```
Proposer 行为:
  1. 选一个比之前用过的都大的提案编号 n
     (常用 (round_number, node_id),保证全局唯一且单调)
  2. 向所有(至少多数派)Acceptor 发送 Prepare(n)

Acceptor 收到 Prepare(n) 时:
  if n > 我承诺过的最大编号 max_promised:
      max_promised = n           # 持久化!
      回 Promise(n, accepted_proposal)
      # accepted_proposal = 我之前已经 Accept 过的 (n_a, v_a) 或 None
  else:
      拒绝 / 静默(或回 NACK)
```

### 4.2 时序图(成功的 Phase 1)

```
Proposer                A1            A2            A3
   │                    │             │             │
   │  Prepare(n=5)      │             │             │
   ├───────────────────►│             │             │
   │  Prepare(n=5)      │             │             │
   ├──────────────────────────────────►│             │
   │  Prepare(n=5)      │             │             │
   ├────────────────────────────────────────────────►│
   │                    │             │             │
   │  Promise(5, None)  │             │             │
   │◄───────────────────┤             │             │
   │  Promise(5, None)  │             │             │
   │◄──────────────────────────────────┤             │
   │ (网络丢了,无所谓)                              │
   │                                                  │
   │  收到 2/3 = 多数派 ✓ → 可以进入 Phase 2          │
   │                                                  │
```

### 4.3 关键含义

**Promise(n, accepted_proposal) 的含义**:

```
"我承诺:
  1. 之后不再接受编号 < n 的 Prepare(继续提升我的承诺线)
  2. 之后不再接受编号 < n 的 Accept(锁住更早的提议)
  
顺便告诉你:
  我之前已经 Accept 过 (n_a, v_a) 这个提议(如果有的话)"
```

**为什么要带上"之前 Accept 过什么"**?

这是 Paxos 最关键的设计——**让新 Proposer 看到历史,避免它覆盖已经被多数派接受的值**。

> 这是 Paxos 协议的"灵魂细节"。**Proposer 在 Phase 2 必须采用 Promise 里看到的最高编号已接受值**,而不是它原本想提的值。**这一步让"已选定的值"无法被新提议覆盖**——保证 Agreement。

---

## 五、Phase 2:Accept / Accepted

### 5.1 流程

```
Proposer 收到多数派 Promise 后:
  
  # 决定要 Accept 什么值
  if 任何 Promise 里带回了 accepted_proposal:
      选编号最大的那个 accepted_proposal 的值 v
      # 关键!不再用 Proposer 自己想提的值
  else:
      v = 我自己想提的值

  向 Acceptor 发 Accept(n, v)

Acceptor 收到 Accept(n, v):
  if n >= max_promised:
      accepted = (n, v)          # 持久化!
      max_promised = n
      回 Accepted(n, v)
      同时把 (n, v) 告诉 Learner(或由 Proposer 通知)
  else:
      拒绝
```

### 5.2 时序图(成功的 Phase 2)

```
Proposer                A1            A2            A3        Learner
   │                    │             │             │            │
   │  Accept(5, v=X)    │             │             │            │
   ├───────────────────►│             │             │            │
   │  Accept(5, v=X)    │             │             │            │
   ├──────────────────────────────────►│             │            │
   │  Accept(5, v=X)    │             │             │            │
   ├────────────────────────────────────────────────►│            │
   │                    │             │             │            │
   │  Accepted(5, X)    │             │             │            │
   │◄───────────────────┤             │             │            │
   │  Accepted(5, X)    │             │             │            │
   │◄──────────────────────────────────┤             │            │
   │                                                  │            │
   │  收到 2/3 多数派 Accepted ✓                      │            │
   │  X 被选定(Chosen)!                              │            │
   │                                                  │            │
   │  Decide(X) ───────────────────────────────────────────────►│
   │                                                              │
   │  返回客户端 OK                                                │
```

### 5.3 完整两阶段时序图(无竞争场景)

把两个阶段串起来:

```
  Client      Proposer       A1            A2            A3       Learner
   │            │             │             │             │           │
   │  Request   │             │             │             │           │
   ├───────────►│             │             │             │           │
   │            │             │             │             │           │
   │            │ ━━━━━━━━━━━━━ Phase 1: Prepare ━━━━━━━━━━━━━━━━━━   │
   │            │  Prepare(5) │             │             │           │
   │            ├────────────►│             │             │           │
   │            ├──────────────────────────►│             │           │
   │            ├────────────────────────────────────────►│           │
   │            │             │             │             │           │
   │            │ Promise(5,None) Promise(5,None)  (任一可丢)         │
   │            │◄────────────┤             │             │           │
   │            │◄──────────────────────────┤             │           │
   │            │       (多数派 = 2/3 ✓)                              │
   │            │                                                      │
   │            │ ━━━━━━━━━━━━━ Phase 2: Accept ━━━━━━━━━━━━━━━━━━━   │
   │            │  Accept(5, X)                                        │
   │            ├────────────►│             │             │           │
   │            ├──────────────────────────►│             │           │
   │            ├────────────────────────────────────────►│           │
   │            │             │             │             │           │
   │            │ Accepted(5,X) Accepted(5,X)                          │
   │            │◄────────────┤             │             │           │
   │            │◄──────────────────────────┤             │           │
   │            │       (多数派 = 2/3 ✓ → CHOSEN)                     │
   │            │                                                      │
   │            │  Decide(X)                                           │
   │            ├──────────────────────────────────────────────────►│
   │  Response  │                                                      │
   │◄───────────┤                                                      │
   
往返次数:2 RTT(Prepare/Promise + Accept/Accepted)
+ 1 次 disk fsync(Acceptor 持久化 max_promised)+ 1 次 disk fsync(Acceptor 持久化 accepted)
```

---

## 六、有竞争场景:两个 Proposer 抢

这是 Paxos 最反直觉的地方,**多个 Proposer 同时跑协议**,看 Paxos 怎么保证最终只有一个值被选定:

```
Proposer P1 想提 v=X      Proposer P2 想提 v=Y
   │                            │
   │ Prepare(n=5)               │
   ├──→ A1 A2 A3                │
   │ ◄── Promise(5,None) x3     │
   │                            │
   │                            │ Prepare(n=7)
   │                            ├──→ A1 A2 A3
   │                            │ ◄── Promise(7,None) x3
   │                            │  (因为 7>5,Acceptor 都升级承诺到 7)
   │                            │
   │ Accept(5, X)               │
   ├──→ A1 A2 A3                │
   │ ◄── NACK x3                │
   │     (Acceptor 拒绝!因为它们已承诺 7,5<7)
   │                            │
   │ 需要重新跑:n=9             │
   │                            │ Accept(7, Y)
   │                            ├──→ A1 A2 A3
   │                            │ ◄── Accepted(7, Y) x3 ✓
   │                            │
   │                            │ Y 被选定 (Chosen)
   │                            │
   │ Prepare(n=9)               │
   ├──→ A1 A2 A3                │
   │ ◄── Promise(9, (7, Y)) x3  │ ← 这里关键!
   │     Acceptor 带回 "我已接受过 (7, Y)"
   │                            │
   │ 决定:我必须 Accept Y,不能 Accept X 了!
   │                            │
   │ Accept(9, Y)               │
   │  (即使 P1 客户端想提 X,协议强制它提 Y)
```

**这就是 Paxos 的精髓**——只要某个值被多数派接受过(进入"将被选定"状态),后续任何新 Proposer 都会**通过 Phase 1 看到这个值**,然后**被强制在 Phase 2 提议这个值**。

> 这就是为什么 Paxos 不会"两个不同值都被选定"。**这不是禁令,是协议把"想覆盖已选值"的可能性算死了**——Phase 1 强制让你看到历史,Phase 2 强制你尊重历史。

---

## 七、关键不变量(直觉版证明)

Paxos 的正确性归结到一个不变量:

> **如果值 v 在编号 n 被选定(Chosen,即多数派 Acceptor Accept 了 (n, v)),那么任何编号 n' > n 的提议,提议的值必然还是 v**。

**证明思路(归纳法)**:

```
基础情况:n+1 这一轮
  Proposer 想用 n+1 提议
  → Phase 1 必须先得到多数派 Promise
  → 由于"任意两个多数派必有交集"(Quorum 性质)
  → Promise 多数派 ∩ Accept 多数派 ≠ ∅
  → 至少 1 个 Acceptor 既在 (n,v) 的 Accept 多数派,又在 (n+1) 的 Promise 多数派
  → 该 Acceptor 在 Promise 时会带回 accepted_proposal=(n, v)
  → Proposer 必须用 v 提议(协议强制)

归纳:假设 n+1 ~ n+k 都被强制提议 v
  考虑 n+k+1:同样道理,多数派交集里至少有一个 Acceptor 带回 accepted_proposal
  且带回的编号最高的那个的值仍然是 v(因为前面都是 v)
  → n+k+1 也提议 v

结论:从 n 之后所有提议的值都是 v
```

**Quorum 不变量是基石**:

```
        Acceptor 集合
   ┌─────────────────────┐
   │                     │
   │  ┌─ Promise ─┐      │
   │  │           │      │
   │  │ ┌─ 交集 ─┐│      │
   │  │ │ ●●●    ││      │
   │  │ └────────┘│      │
   │  └───────────┘      │
   │   ┌─ Accept ─┐      │
   │   │          │      │
   │   └──────────┘      │
   │                     │
   └─────────────────────┘

任意两个多数派至少有 1 个 Acceptor 重叠
→ 信息不会丢
→ 已选定的值会被新 Proposer 看到
```

---

## 八、Ballot Number 单调递增

提案编号是 Paxos 的"逻辑时钟",**必须满足**:

- **全局唯一**:不能两个 Proposer 用同一个 n
- **单调递增**:每次都比之前用过的大
- **持久化**:进程重启不能回退

**典型实现**:

```
proposal_number = (round_number, node_id)

比较规则:
  (r1, id1) > (r2, id2)
  ⟺  r1 > r2 OR (r1 == r2 AND id1 > id2)

每个节点维护本地的 round_number
  - 启动时从磁盘读
  - 每次发起 Prepare 前先 +1 并 fsync
  - 收到 NACK(发现别人用了更高 n)时,更新本地 round_number ≥ 对方的
```

```
节点 ID=1 节点 ID=2
   round=0     round=0
   ↓           ↓
   提议 (1, 1)   提议 (1, 2)  ← 后者更大
   被 NACK     胜出
   ↓
   更新 round 到 2,提议 (2, 1)  ← 现在它更大
```

> **Ballot Number 是 Paxos 的"时间感"**。Lamport 在论文里把它叫 ballot number 是为了和"议会投票"故事对应,后人改叫 proposal number / round number / view number,本质都是一回事。

---

## 九、活锁问题:Paxos 的"心病"

**两个 Proposer 不断互相打断**:

```
P1: Prepare(5)  → 收到多数派 Promise
P2: Prepare(7)  → 收到多数派 Promise(把 5 打断了)
P1: Accept(5,X) → 被拒绝(已承诺 7)
P1: Prepare(9)  → 收到多数派 Promise(把 7 打断了)
P2: Accept(7,Y) → 被拒绝(已承诺 9)
P2: Prepare(11) → 收到多数派 Promise
P1: Accept(9,X) → 被拒绝
... 无限循环,永远没人成功 Accept

这就是 Paxos 不满足 Termination 的根源
```

```
时间 →
P1: P5 ──── A5(fail) ─── P9 ──── A9(fail) ─── P13 ──── A13(fail)
                                                          
P2: ────────── P7 ──── A7(fail) ─── P11 ──── A11(fail)

任何时刻只要有人在 Prepare 阶段超过对方,对方在 Accept 阶段就失败
```

**工程上的两种破解**:

```
┌────────────────────────────────────────────────────────┐
│ 方案一:随机退避(Random Backoff)                       │
│                                                         │
│ P1 失败 → 随机等 0~T 秒再重试                            │
│ P2 失败 → 随机等 0~T 秒再重试                            │
│                                                         │
│ 大概率两人不会同时重试,最终某人成功                     │
│ 简单,但延迟波动大                                       │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│ 方案二:选一个稳定 Leader(Multi-Paxos 的核心)          │
│                                                         │
│ 集群在某段时间内选出一个 Leader,只有它发 Prepare        │
│ → 完全消除竞争,无活锁                                   │
│ Leader 失败时重新选举                                    │
│                                                         │
│ 这就是 Multi-Paxos / Raft 都用 Leader 的根本原因         │
└────────────────────────────────────────────────────────┘
```

> **基础 Paxos 没有 Leader 概念,论文也没规定怎么选**——它只规定了"在 Proposer 之间存在共识协议"。**Leader 是工程必备,但 Lamport 把"怎么选 Leader" 这件事推给了实现者**,这也是 Paxos 论文留下的最大"工程空白"之一,导致每家实现都不一样。

---

## 十、为什么 Basic Paxos 不能直接用

把 Paxos 用在生产,有几个严重问题:

### 10.1 一个 Paxos 实例只能决定一个值

```
Basic Paxos = 对"一个值"达成共识

但状态机需要"一连串值"(日志条目 1, 2, 3, ...)
→ 每条日志都要跑一个独立 Paxos = 每条都要 2 RTT + 多次 fsync

写一条日志的开销:
  - Prepare:1 RTT
  - Accept:1 RTT
  - Acceptor 两次 fsync(promised + accepted)
  - 网络往返 + 磁盘 fsync = 几十毫秒
  
→ 100 QPS 都到不了。
```

### 10.2 每次都要 Phase 1 太亏

```
观察:如果一直是同一个 Proposer 在提议
     它发的 Prepare 永远成功(没人和它抢)
     Phase 1 的功能就是"发现历史 + 占住承诺线"
     → 只要 Leader 不变,这部分可以一次性做完
     → 后续每条日志只跑 Phase 2(1 RTT)

这就是 Multi-Paxos 的核心优化(下一篇详讲)
```

### 10.3 工程实现的细节空白太多

Basic Paxos 论文不告诉你:

- 怎么选 Leader
- 怎么处理日志空洞(某些位置卡住)
- 怎么做成员变更
- 怎么 snapshot 压缩
- 怎么实现 client 幂等
- Learner 怎么追日志

**这就是为什么 Google Chubby、Spanner、PaxosStore 都用了"自家版本"的 Multi-Paxos**,各家做法不一,**Ongaro 看不下去,发明了规范一些的 Raft**(13 篇)。

---

## 十一、Basic Paxos 简化伪代码

```python
# === Proposer ===
class Proposer:
    def __init__(self, node_id, acceptors):
        self.node_id = node_id
        self.acceptors = acceptors
        self.round = 0
    
    def propose(self, value):
        while True:
            self.round += 1
            n = (self.round, self.node_id)   # 全局唯一编号
            
            # === Phase 1: Prepare ===
            promises = broadcast(self.acceptors, Prepare(n))
            if count(promises) < majority(self.acceptors):
                sleep(random_backoff())   # 没拿到多数派,退避
                continue
            
            # 检查 Promise 里有没有带回已 Accept 过的值
            accepted = [p.accepted for p in promises if p.accepted]
            if accepted:
                # 选编号最大的已接受值,放弃自己原本想提的 value
                v = max(accepted, key=lambda x: x.n).v
            else:
                v = value
            
            # === Phase 2: Accept ===
            results = broadcast(self.acceptors, Accept(n, v))
            if count_accepted(results) >= majority(self.acceptors):
                broadcast_learners(Chosen(n, v))
                return v   # 成功
            else:
                sleep(random_backoff())
                continue   # 重试
```

```python
# === Acceptor ===
class Acceptor:
    def __init__(self):
        # 这两个必须持久化(fsync 到磁盘)
        self.promised_n = None
        self.accepted = None   # (n, v)
    
    def on_prepare(self, n):
        if self.promised_n is None or n > self.promised_n:
            self.promised_n = n
            persist_to_disk(self.promised_n)
            return Promise(n, self.accepted)
        else:
            return NACK(self.promised_n)
    
    def on_accept(self, n, v):
        if self.promised_n is None or n >= self.promised_n:
            self.promised_n = n
            self.accepted = (n, v)
            persist_to_disk(self.promised_n, self.accepted)
            return Accepted(n, v)
        else:
            return NACK(self.promised_n)
```

```python
# === Learner ===
class Learner:
    def __init__(self):
        self.votes = {}   # n -> set of acceptors
    
    def on_accepted(self, acceptor_id, n, v):
        self.votes.setdefault((n, v), set()).add(acceptor_id)
        if len(self.votes[(n, v)]) >= majority:
            # 值已选定
            apply_to_state_machine(v)
```

---

## 十二、Paxos 的工程映射

虽然 Basic Paxos 不直接用,**它的思想渗透在所有强一致系统里**:

| 真实系统 | 用 Paxos 的方式 |
| --- | --- |
| **Google Chubby** | Multi-Paxos 实现分布式锁 + 配置中心 |
| **Google Spanner** | 每个 Paxos group 用 Multi-Paxos 复制 |
| **Microsoft Azure Cosmos DB** | Multi-Paxos 变体 |
| **Tencent PaxosStore** | 微信存储,Multi-Paxos |
| **Tencent Phxpaxos** | C++ 开源 Paxos 库 |
| **Apache ZooKeeper** | ZAB(Zookeeper Atomic Broadcast,Paxos 变体) |
| **Apache Cassandra** | Lightweight Transaction 用 Basic Paxos 实现 CAS |
| **etcd / Consul** | Raft(Paxos 简化版,见 13 篇) |

> **Cassandra LWT 是少数真的在用 Basic Paxos 的场景**——`INSERT ... IF NOT EXISTS` 这种 CAS 操作底下是 Basic Paxos,每次 CAS 要 2 RTT + 4 次 fsync,**延迟数倍于普通写,生产慎用**。

---

## 十三、踩坑提醒

1. **以为 Paxos 是"算法"而忘了它需要稳定 Leader**——Basic Paxos 没 Leader 概念,实际工程必须配上 Leader 选举,否则活锁
2. **以为 Paxos 在网络分区时还可用**——多数派不可达就停服,这是 CP 的代价
3. **Proposal Number 没持久化**——进程重启回滚 round,可能用比之前小的 n 提议,破坏不变量
4. **Acceptor 的 promised/accepted 没 fsync**——掉电后状态丢失,可能重新承诺更小的 n,**整个不变量崩溃**
5. **没区分 Promise 的"约束"和"信息"**——Promise 既是承诺也是历史告知,两者都不能漏
6. **Proposer 不按 Promise 带回的最高编号 accepted 来选 value**——直接破坏 Agreement,出现两个不同值都被选定
7. **多数派算错**(N=4 时多数派是 3,N=5 时多数派是 3)——偶数节点是浪费,**生产部署用奇数节点**(3 / 5 / 7)
8. **用 Basic Paxos 跑高 QPS**——单条 2 RTT + fsync,几百 QPS 就到顶,**生产用 Multi-Paxos 或 Raft**
9. **Leader 选举不带 fencing**——旧 Leader 复活继续提议,可能用旧 round 号造成混乱,**新 Leader 必须先把 round 推高(看到旧的 + 1)**
10. **认为 Paxos 没有故障窗口**——多数派不可达时拒绝服务,**这是设计的容错代价,不是 bug**
11. **手写 Paxos 库**——空缺太多,Google/腾讯都花了若干年才稳定,**用 etcd-raft / hashicorp-raft / dragonboat,不要自己写**
12. **把 Paxos 当万能药**——它只保证"对一个值达成共识",**不解决性能、跨地域、拜占庭、客户端幂等**——这些都要工程额外加

---

Basic Paxos 是分布式共识的"原始理论",它证明了"在异步网络 + 故障下达成共识是可能的",但**离能用还差很远**。后人在 Basic Paxos 之上做的工程化叫 **Multi-Paxos**——Lamport 在 2001 年的 *Paxos Made Simple* 末尾简单提了几句(只有半页),**所有真正生产用的"Paxos 系统"都是各家自己摸出的 Multi-Paxos**。

下一篇:`12-Multi-Paxos与工程化.md`。**这一篇决定你能不能看懂 Chubby / Spanner / PaxosStore 这些真正在跑生产的 Paxos 系统**——稳定 Leader、日志复制、空洞填补、成员变更、Snapshot 压缩、客户端 exactly-once,**Lamport 没告诉你的所有工程细节,都在这里**。看完你也会理解,为什么 Ongaro 看不下去,直接发明了 Raft——Multi-Paxos 留的空白实在太多。
