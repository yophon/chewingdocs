# Percolator

上一篇讲了 Saga / TCC——**应用层凑出来的最终一致**。这一篇换条路:**如果我就要跨行 ACID,但又不想被 2PC 锁穿一切,怎么办?**Google 2010 年那篇《Large-scale Incremental Processing Using Distributed Transactions and Notifications》给了一个让人拍案的答案——**Percolator**:**不重写 BigTable,只在 client 端加一层 lock 列,就在 KV 上做出了跨行事务 + Snapshot Isolation**。这个设计后来被 TiKV 几乎一比一抄走,变成了今天国内 NewSQL 的事实标准。

> 一句话先记住:**Percolator 用 BigTable 的多版本特性做快照隔离,用"主锁 / 从锁"的两阶段写做跨行原子提交,用一个集中式 TSO 发号器做全局时间戳**。所有协调状态都写到 BigTable 同一行的几个特殊列(data / write / lock),**协调者宕机不卡死**——后续事务遇到锁会去查 primary 状态自动决定 commit 还是 rollback。**TiKV 是它最完整的开源实现**。

---

## 一、Google 为什么要造 Percolator

2010 年前后,Google 索引系统(Caffeine)从批处理走向**增量更新**。

老系统:**MapReduce 全量重算**

```
每天爬全网 → 全量 MapReduce 跑索引 → 几小时延迟
新闻一出来,几小时后才能搜到
```

新需求:**网页爬到就立刻进索引**(分钟级)。

**核心难点**:索引由 N 张表组成(链接图、PageRank、anchor text 等),**改一个网页可能要原子更新很多张表**。传统方案要么:

- **用 BigTable 单行事务**——只能改一行,不够
- **上 MySQL**——撑不住 PB 级数据
- **跑 2PC**——卡死、协调者单点

Google 工程师 Peng & Dabek 想出来一个办法:**在 BigTable 之上做一层 client 库,把跨行 ACID 拆成两阶段写到 BigTable 的特殊列,所有协调状态都序列化写入存储,根本不需要长期持锁**。

> **Percolator 不是一个独立数据库——它是 BigTable 客户端 SDK + 一个 TSO 服务**。所有事务状态都进了 BigTable,client 是无状态的。这是它最聪明的地方。

---

## 二、底层模型:BigTable 三列

Percolator 给 BigTable 每个表加三个特殊列族:

```
┌────────────────────────────────────────────────────────────┐
│  row_key   │  data:        │   write:           │  lock:    │
├────────────────────────────────────────────────────────────┤
│  alice@bal │  ver_ts → val │  ver_ts → data_ts  │  锁信息    │
└────────────────────────────────────────────────────────────┘

data 列   :真正的数据,多版本(BigTable timestamped)
write 列  :commit 记录,告诉读者"这个 commit_ts 对应哪个 data 版本"
lock 列   :prewrite 阶段的锁(包含 primary key 指针)
```

举例,转账事务 (alice -= 100, bob += 100):

```
row_key  │  data                  │  write              │  lock
─────────┼────────────────────────┼─────────────────────┼─────────────────
alice    │  ts=7 → bal=900        │  ts=8 → @data_ts=7  │  (空)
bob      │  ts=7 → bal=200        │  ts=8 → @data_ts=7  │  (空)
```

- **ts=7 是 start_ts**(prewrite 时写入 data 的版本号,实际是该事务的 start_ts)
- **ts=8 是 commit_ts**(commit 时写到 write 列)
- 读 bob 余额(以 start_ts=10):查 write 列里 ts ≤ 10 的最大值 → ts=8 → 指向 data_ts=7 → 读出 200

**关键洞察**:`write 列的存在 = commit 已完成`;**没有 write 列、只有 lock 列 = 事务还没 commit**。

---

## 三、TSO:中心化时间戳

Percolator 需要**全局单调递增的时间戳**——所有事务用同一把"逻辑尺子"。

```
                  TSO (Timestamp Oracle)
                  ┌──────────────────────┐
                  │  全局单调递增计数器     │
                  │  典型实现:Paxos 复制   │
                  │  +持久化每秒一次       │
                  └──────────────────────┘
                          ▲
              get_ts()    │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
     client A          client B          client C
   start_ts = 100   start_ts = 101   start_ts = 102
```

**为什么需要 TSO**:

1. **快照隔离需要 start_ts 来决定"读哪个版本"**
2. **commit_ts 用来标记"提交时刻"**,后续事务的 start_ts > commit_ts 才能读到
3. **全局唯一序号避免 ABA / 并发冲突**

**性能问题**:TSO 是单点。但工程上单 TSO 节点能撑 **百万级 QPS**(简单计数器 + 批量分配),通常不是瓶颈。TiDB 的 PD 提供 TSO,**每次 get_ts 不是一次 RPC,而是 client 缓存一批 ts**(比如批量取 1000 个,慢慢用)。

> **TSO 是 Percolator 路线最有争议的一点**——它给系统装了一个单点,但**这个单点小到可以被 Paxos 复制 + 简单 leader 选主**,实际生产中几乎不挂。**Spanner 用 TrueTime 干掉了这个单点**(下一篇),但代价是要装原子钟。**TSO 是穷人版 TrueTime**。

---

## 四、Snapshot Isolation(SI):Percolator 的隔离级别

Percolator 提供的隔离级别叫 **Snapshot Isolation**——**比 Serializable 弱,但比 Read Committed 强**。

### 4.1 SI 的规则

每个事务有 (start_ts, commit_ts):

```
读规则: 读 key 时,看 write 列里 ≤ start_ts 的最大 commit_ts
        → 从该 commit_ts 指向的 data 版本读
        → 看到的是 "start_ts 时刻的全库快照"

写规则: 提交时,检查事务写过的所有 key
        → 任何 key 在 [start_ts, commit_ts] 区间内被别的事务写过
        → 这个事务必须 abort
```

### 4.2 SI 不能防的:Write Skew(写偏序)

**经典反例**:on-call 排班

```
规则:任何时候至少一人在 on-call

T1 读 (Alice on_call=true, Bob on_call=true)
   → 想把 Alice 设为 off(因为还有 Bob)
T2 读 (Alice on_call=true, Bob on_call=true)
   → 想把 Bob 设为 off(因为还有 Alice)

T1, T2 写的 key 不冲突(一个写 Alice,一个写 Bob)
→ SI 都允许提交 → 两人都 off,没人 on-call!
```

**Serializable 能防这个,SI 不能**。但 SI 已经覆盖了 99% 业务场景,工程上够用了。

> Postgres 9.1+ 提供 **Serializable Snapshot Isolation(SSI)** 来补这个洞,Percolator/TiKV 默认是 SI,可以通过显式 SELECT FOR UPDATE 升级到 Serializable。

---

## 五、Primary Key Lock:协调的核心机制

跨行事务怎么原子提交?Percolator 的招很妙:**事务随便挑一个写的 key 当 primary,其他 key 都叫 secondary,secondary 锁里指向 primary**。

```
事务写: key1, key2, key3
选 key1 作为 primary
key2, key3 是 secondary

锁内容:
  key1.lock = { primary=key1, status=PREWRITE }    ← primary 自指
  key2.lock = { primary=key1, status=PREWRITE }    ← 指向 key1
  key3.lock = { primary=key1, status=PREWRITE }    ← 指向 key1
```

**Commit 时**:**只需要原子提交 primary**(BigTable 单行事务保证),其他 secondary 异步清理。

**为什么能这样**:**事务的成败 100% 由 primary 决定**——后续任何读到 secondary 锁的人,都去看 primary 的状态:

- primary.write 列已存在(已 commit) → secondary 也算 commit,直接清锁
- primary.lock 不见了且 write 列没有(已 rollback) → secondary 也 rollback
- primary 还有 lock → 看是死锁还是正常进行中

> **这一招把"分布式两阶段提交"压成了"单机原子操作 + 异步广播"**——commit 的关键时刻只动 primary 一行,BigTable 单行原子性帮你扛住。**协调者宕机也没事,因为协调状态全在 BigTable 里**,任何后续 client 都能读出来恢复。

---

## 六、写流程:Prewrite + Commit 两阶段

### 6.1 完整时序图

```
        client                  TSO        BigTable(key1=P)  BigTable(key2)   BigTable(key3)

  ┌─ get_ts() ──────────────────▶│
  │      start_ts = 100          │
  │◀─────────────────────────────┘
  │
  │ ─── Prewrite Phase ────────────────────────────────────────────────────────────
  │
  ├── prewrite(key1, val1, primary=key1) ────────▶ 检查 [100, ∞) 无别人写
  │                                                  写 data: ts=100 → val1
  │                                                  写 lock: { primary=key1, START_TS=100 }
  │◀── ok
  │
  ├── prewrite(key2, val2, primary=key1) ──────────────────────────▶ 同上(指向 key1 作为 primary)
  │◀── ok
  │
  ├── prewrite(key3, val3, primary=key1) ────────────────────────────────────────▶ 同上
  │◀── ok
  │
  │ ─── Commit Phase ─────────────────────────────────────────────────────────────
  │
  ├── get_ts() ──────────────────▶│
  │      commit_ts = 101          │
  │◀──────────────────────────────┘
  │
  │ # 关键:只用原子提交 primary
  ├── commit(key1, commit_ts=101) ─▶ 原子操作:
  │                                   write 列写入 ts=101 → 指向 data_ts=100
  │                                   lock 列删除
  │◀── ok    ← 这一刻整个事务"在 SI 视角下"已经提交
  │
  │ # 异步清 secondary 的锁(失败也无所谓,后续读者会自愈)
  ├── commit(key2, commit_ts=101) ──────────────────────▶ 同上
  ├── commit(key3, commit_ts=101) ────────────────────────────────────────▶ 同上
  │
  └─ done
```

### 6.2 Prewrite 伪代码

```python
def prewrite(key, val, primary_key, start_ts):
    # 1. 冲突检查:[start_ts, ∞) 区间不能有别人 commit 过这个 key
    if exists(key.write, commit_ts >= start_ts):
        raise WriteConflict  # 必须 abort
    
    # 2. 冲突检查:不能有别人的 lock(写写冲突)
    if exists(key.lock):
        raise KeyAlreadyLocked
    
    # 3. 写数据(版本号 = start_ts)和锁
    with single_row_txn(key):
        key.data[start_ts] = val
        key.lock = {primary: primary_key, start_ts: start_ts}
```

### 6.3 Commit 伪代码

```python
def commit(primary_key, secondary_keys, start_ts):
    commit_ts = tso.get_ts()
    
    # 1. 提交 primary(BigTable 单行原子)
    with single_row_txn(primary_key):
        if not primary_key.lock or primary_key.lock.start_ts != start_ts:
            raise LockNotFound  # 锁被别人清了 → 事务失败
        primary_key.write[commit_ts] = start_ts  # 指向 data 版本
        del primary_key.lock
    
    # —— 这一刻起,事务"已经提交"。即使下面 secondary 清理失败,
    #     后续读 secondary 的人会查 primary 状态自动 commit ——
    
    # 2. 异步清 secondary(best effort)
    for sk in secondary_keys:
        with single_row_txn(sk):
            sk.write[commit_ts] = start_ts
            del sk.lock
```

> **核心不变量**:**primary 的 write 列出现的瞬间 = 事务提交点**。这一行原子写完之后,事务在 BigTable 里就是 committed,所有后续 client 都能看到。secondary 的清理是 best-effort 的,失败了也只是垃圾锁,后续读者会自愈。

---

## 七、读流程:遇到 lock 怎么办

读看似简单——**读 write 列里 ≤ start_ts 的最大 commit_ts** 就行。但**如果读到 lock 怎么办**?

```
读 key (start_ts = 200)

情况 1: key 没有 lock,只有 write
       → 找 write 里 ≤ 200 的最大 commit_ts,正常读
       
情况 2: key 有 lock,lock.start_ts > 200
       → 这是个比我新的事务,跟我无关,正常读 write 列
       
情况 3: key 有 lock,lock.start_ts ≤ 200
       → 有个比我早的事务还没 commit/abort
       → 这把锁是死的还是活的?
       → 去看 primary 状态!
```

### 7.1 锁清理(Lock Resolve)

读者遇到一把潜在死锁,要主动去**判定 primary 的最终状态**:

```python
def resolve_lock(key, lock):
    primary = lock.primary
    primary_status = check_primary(primary, lock.start_ts)
    
    if primary_status == COMMITTED:
        # primary 已 commit → secondary 也算 commit
        # 用 primary 的 commit_ts 给 secondary 补一个 write 记录
        with single_row_txn(key):
            key.write[primary.commit_ts] = lock.start_ts
            del key.lock
    
    elif primary_status == ROLLED_BACK:
        # primary 已 rollback → secondary 也 rollback
        with single_row_txn(key):
            del key.data[lock.start_ts]
            del key.lock
    
    else:  # primary 还在 PREWRITE 中
        # 是不是事务卡死了?(client 挂了)
        if lock.ttl_expired():
            # 强制 rollback primary
            force_rollback(primary, lock.start_ts)
            # 再递归清自己
            resolve_lock(key, lock)
        else:
            # 事务还在跑,我等等
            wait_or_retry()
```

**这是 Percolator 最有意思的设计**:**任何 client 都能推进任何卡住的事务**——不需要原 client 还活着。锁有 TTL,过期后下一个读到的人就帮你 rollback。

---

## 八、TiKV:Percolator 的开源工业级实现

TiKV(PingCAP)几乎照搬 Percolator 模型,差异主要在底层:

| 项 | Percolator | TiKV |
| --- | --- | --- |
| 底层存储 | BigTable | **Raft + RocksDB**(自研 KV) |
| 单行事务 | BigTable 单行原子 | RocksDB WriteBatch + Raft commit |
| TSO | Google Chubby + 中心化 | **PD (Placement Driver)** + Raft 复制 |
| 锁的存储 | BigTable 的 lock 列 | **CF_LOCK** 列族 |
| 数据多版本 | BigTable 多版本 | **CF_WRITE / CF_DATA** 列族 + MVCC |
| 客户端 | C++ client | **TiDB SQL 层** / TiKV Java/Go client |
| 锁清理 | 读者懒清理 | **同样懒清理 + GC 周期清理过期版本** |

### 8.1 TiKV 的 ColumnFamily

```
CF_DEFAULT  ←  data 列(实际数据,key 带 start_ts 后缀)
CF_LOCK     ←  lock 列
CF_WRITE    ←  write 列(指向数据版本)
```

**每次写都是写三个 CF**(写时机不同),读时按 CF 查找。

### 8.2 PD = Placement Driver

PD 一个角色干三件事:

1. **TSO**(全局时间戳分配)
2. **元数据**(region 分布、节点信息)
3. **调度**(region balance、副本迁移)

PD 自身用 etcd(Raft)做高可用——Leader 提供 TSO,Follower 待命。

### 8.3 TiDB 的事务模型

```
TiDB SQL 层
  │   SQL → KV 操作
  ▼
TiKV Client(实现 Percolator 协议)
  │   prewrite / commit / get / scan
  ▼
TiKV(Raft + RocksDB,每个 region 一个 Raft 组)
  ▲
PD(TSO + 元数据)
```

> **看一遍 TiDB 代码你就理解 Percolator——每一步都是论文映射**。这是国内分布式数据库的事实标准。

---

## 九、性能优化:Async Commit / 1PC

Percolator 经典模型每个事务至少需要:

```
1. get start_ts          (RPC × 1)
2. prewrite N keys       (RPC × N,并行)
3. get commit_ts         (RPC × 1)
4. commit primary        (RPC × 1)
5. commit secondaries    (RPC × N,异步,client 不等)

最少延迟 = 2 × RPC(prewrite + primary commit)+ 2 × TSO
```

TiDB 后来做了两个重大优化:

### 9.1 Async Commit(TiDB 5.0+)

**核心想法**:**prewrite 成功就算 commit**,不再需要单独的 primary commit RPC。

```
原版:
  prewrite all → wait → commit primary → 才算"事务成功"
  RT = prewrite RTT + primary commit RTT

Async Commit:
  prewrite all 时,直接把 lock 里写上"min_commit_ts"
  全部 prewrite 成功 → client 立即认为 commit 完成,返回用户
  commit_ts 推导:max(prewrite 时各 region 推上来的 min_commit_ts)
  
RT = prewrite RTT(节省一次 RTT!)
```

**代价**:读者遇到 async commit 的 lock 时,需要去检查所有 secondary 的状态决定 commit_ts,**清锁复杂度变高**。但平均场景下 commit 延迟降了一半。

### 9.2 1PC(单 region 退化)

**如果整个事务的所有 key 都在同一个 region**,根本不需要 Percolator——退化成 RocksDB 的单 region 事务,一次 Raft 写入搞定。

```
判定:事务所有 keys hash 到同一个 region(包括 leader)
→ 写一次 WriteBatch + 一次 Raft commit
→ 跳过 prewrite / commit 两阶段
```

TiDB 自动判定并退化,**80% 的小事务都能走 1PC**——延迟从 4 RTT 降到 1 RTT。

---

## 十、Percolator 的代价

### 10.1 长事务卡其他事务

**Percolator 写时持锁**(虽然锁只在 BigTable lock 列里,但其他读到的人要等或者去 resolve)。**长事务持锁几分钟,大量读者要走 resolve_lock 路径**,延迟剧增。

**对策**:

- **限制单事务大小**(TiDB 默认 100MB 数据 / 30 万 key)
- **大事务用 TiDB 4.0+ 的 Large Transaction 优化**(分批 commit)
- **OLAP 走 TiFlash 列存**(读时不走 Percolator 锁)

### 10.2 TSO 是中心瓶颈

**所有事务的 start_ts / commit_ts 都要走 TSO**——理论上的单点。

工程缓解:

- **批量分配**:client 一次问 TSO 拿一批(1000 个 ts)缓存
- **PD Leader 选举只在故障时发生**:平时纯单点处理
- **PD 用 etcd 做 leader 选举**,Leader 失效几秒内自动切换

**但 TSO 仍然是地理跨域的瓶颈**——跨大陆访问 TSO,延迟 100ms+,**Percolator 路线很难做"全球分布式 ACID"**。Spanner 的 TrueTime 才能做到。

### 10.3 写多读少友好,写写冲突场景差

Percolator 是**乐观锁**——prewrite 阶段才检查冲突。**写写冲突频繁的场景**(秒杀同一行)会大量 abort + retry。

**对策**:

- 业务层"扣库存"用 Redis / 单点先扣,异步同步到 TiDB
- 或者用 TiDB 的悲观事务模式(后来加的,本质是先取一把 region 锁)

---

## 十一、Percolator 和它的兄弟们

| 系统 | 事务模型 | TSO | 隔离级别 | 备注 |
| --- | --- | --- | --- | --- |
| Percolator | client + BigTable + lock 列 | 是 | SI | Google 内部论文 |
| **TiKV / TiDB** | **同上,Raft 替 BigTable** | **是(PD)** | **SI(默认),可升 Serializable** | **国产 NewSQL 主流** |
| **OB(OceanBase)** | 类似 Percolator(扁平多版本) | 是(rootserver) | SI | 阿里金融场景 |
| Spanner | TrueTime + Paxos + 2PC | **否(TrueTime)** | **External Consistency** | 下一篇详讲 |
| CockroachDB | HLC + 类 Percolator | 否(HLC) | Serializable | Spanner 路线开源版 |
| FoundationDB | Optimistic + Sequencer | 是(Sequencer) | Strict Serializable | Apple 用 |

> **国内市场看下来,Percolator 路线压倒性占优**——TiDB / OceanBase / CockroachDB 国内分支几乎人均一个。原因是 TrueTime 装不起(没有 GPS + 原子钟),HLC 又太年轻,**TSO + Percolator 是性价比最高的"够用方案"**。

---

## 十二、踩坑提醒

1. **以为 Percolator 是"无锁"**——它是把锁从 DB 行锁挪到 lock 列,**还是有锁**,只是粒度细、协调状态可持久化
2. **以为 TSO 永远不挂**——PD Leader 切换的几秒内整个集群 hang,**跨机房 TiDB 必须容忍这个抖动**
3. **大事务直接撸**——TiKV 默认 100MB 上限,撑爆直接报错;业务大事务必须分批
4. **乐观锁应对热点写**——同一行高并发写,prewrite 大量冲突 abort,TPS 暴跌;改用悲观锁或业务侧排队
5. **不理解 Snapshot Isolation**——以为是 Serializable,踩 write skew(排班、限流、对账)
6. **不监控锁等待**——长事务卡死后续大量读者,但表面看 CPU/内存都正常,要监控 lock_wait 指标
7. **跨地域用 Percolator**——TSO 单点跨域延迟巨大,**全球部署的强一致用 Spanner / CockroachDB 更合适**
8. **以为 commit 失败就 rollback 完了**——commit 失败但 primary 写入已成功 → 事务实际上 commit 了!**client 必须能正确处理"返回 timeout 但实际成功"**
9. **不清理过期锁 / GC 不跟上**——长期跑会堆积大量已死事务的 lock + 旧版本,影响读路径性能
10. **拿 Percolator 当 OLAP 用**——大批量 OLTP 跨表 scan 走 MVCC,要查很多版本,慢;OLAP 用 TiFlash 列存

---

## 十三、收束:Percolator 留给后人的两个礼物

1. **"协调状态写存储,client 无状态"**——这个思想后来影响了 CockroachDB、FoundationDB、所有 newer 分布式事务系统。**协调者不再是单点**,因为协调状态本身在分布式存储里。

2. **"primary key + secondary 指针"的两阶段**——把跨行原子简化为单行原子 + 异步广播,**这是 Percolator 最美的地方**。后续任何"在 KV 上糊事务层"的设计都绕不开它。

> 读完这篇,你看 TiDB / TiKV / OceanBase 的事务模块,会发现**每一行代码都在跟 Percolator 论文对应**。这就是一篇论文 + 一个开源实现给整个行业带来的影响——**Google 写了 9 页 PDF,中国造了 3 个数据库**。

---

下一篇:`24-Spanner与Calvin与NewSQL.md`,讲分布式事务的"终极形态":**Spanner 用原子钟 + GPS 干掉了 TSO 单点**,做出了真正全球同步的 ACID;**Calvin 走另一极端——所有事务先全局排序再并行执行**,完全确定性。**这两条路加上 Percolator,构成了 NewSQL 三大流派**——TiDB / CockroachDB / YugabyteDB / FaunaDB 都能在这个谱系里找到自己的位置。
