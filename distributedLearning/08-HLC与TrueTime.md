# HLC 与 TrueTime

上一篇向量时钟解决了「**识别并发**」,但 O(N) 开销让它**没法直接当事务的"全局时间戳"用**——你不能让一个 SQL 事务带 1000 个节点的版本号。这一篇讲分布式时间的两条工程出路:**HLC(混合逻辑时钟)是软件方案,CockroachDB / YugabyteDB 在用;TrueTime 是硬件方案,Google Spanner 砸钱搞 GPS + 原子钟**。两条路解决同一个核心问题——**怎么给跨节点事务一个又可比又可信的时间戳**,让数据库不用共识就能维持"全局顺序"。

> 一句话先记住:**物理时钟可比但不可信(05 篇),逻辑时钟可信但脱节物理(06/07 篇)**——HLC 把两者揉一起,(物理 ms, 逻辑计数) 的二元组,物理推不动就拨逻辑,**实现 O(1) 的因果追踪**。**TrueTime 走另一条路——砸硬件钱把时间不确定区间 ε 压到 7ms 以内**,事务靠"commit wait 等过 ε" 实现外部一致性。**CockroachDB 是 Spanner 的"穷人版"**——没有原子钟,用 HLC 模仿,代价是偶尔出现 uncertainty restart。

---

## 一、为什么需要 HLC/TrueTime:逻辑和物理的两难

回顾前几篇:

| 维度 | 物理时钟(NTP) | Lamport 时钟 | 向量时钟 |
| --- | --- | --- | --- |
| 可比性 | 可比(就是数) | 可比(就是数) | 偏序(部分可比) |
| 因果保持 | **不保证**(NTP 跳变会破坏) | 单向(只保证 happens-before ⇒ <) | **双向** |
| 反映真实时间 | 是 | 否(只是序号) | 否 |
| 开销 | O(1) | O(1) | **O(N)** |

每一种都有死穴:

- 物理钟:**给事务 commit 时间戳的最自然选择,但 NTP 跳变能让你"先写的数据在后写的之后"**——这破坏数据库正确性
- Lamport 时钟:可比、O(1),**但和物理时间脱节**——日志看起来很怪("这条 LC=5000 的写发生在 2026 年还是 2030 年?")
- 向量时钟:**完整的因果追踪,但 O(N) 没法塞进每行数据**

### 1.1 数据库需要什么样的时间

**理想需求**:

1. **可比**:任意两个事件,能比出"谁在前"——共识/复制需要
2. **可信**:反映真实物理时间,运维/审计/外部一致性需要
3. **轻量**:O(1) 开销,塞进每条行/MVCC 版本不痛
4. **因果保持**:happens-before 关系不被打破

**Lamport 占 1、3、4 但缺 2;物理钟占 1、2、3 但缺 4(NTP 不可靠);向量时钟占 4 但缺 3**。

**HLC 想三个都占**(用了一个小逻辑位换);**TrueTime 通过砸硬件把物理钟变得"可靠"**,从根上解决问题。

---

## 二、HLC:Kulkarni 2014 的混合逻辑时钟

### 2.1 数据结构

每个节点维护一个 HLC 时间戳:

```
HLC = (l, c)
  l: physical_time_ms  当前已知的"最大物理时间"(ms)
  c: logical_counter   逻辑计数,用于同一 ms 内排序
```

完整呈现:`HLC = "1715394728123.5"`,前 13 位毫秒、后面是 c。

### 2.2 三条核心规则

**规则 1(本地事件)**:发生本地事件,读当前物理钟 `pt`

```python
def local_event():
    pt = physical_clock.now_ms()
    l_new = max(l, pt)
    if l_new == l:
        c = c + 1        # 物理钟没前进,只能拨逻辑位
    else:
        c = 0            # 物理钟前进了,逻辑位归 0
    l = l_new
    return (l, c)
```

**规则 2(发送消息)**:发消息时执行 local_event,把 (l, c) 随消息发出

**规则 3(接收消息 m=(l_m, c_m))**:逐项取 max,逻辑位适当 +1

```python
def receive(l_m, c_m):
    pt = physical_clock.now_ms()
    l_new = max(l, l_m, pt)
    if l_new == l == l_m:
        c = max(c, c_m) + 1
    elif l_new == l:
        c = c + 1
    elif l_new == l_m:
        c = c_m + 1
    else:
        c = 0
    l = l_new
    return (l, c)
```

### 2.3 一张图看懂

```
节点 A(物理钟跑得正常)
  pt=100  local → HLC=(100, 0)
  pt=101  local → HLC=(101, 0)
  pt=102  send  → HLC=(102, 0)  发 m=(102, 0)
                          ╲
                           ╲
节点 B(物理钟比 A 慢 5ms,pt=97 时收到 m)
  pt=97   recv m=(102,0)
          l_new = max(97, 102, 97) = 102
          l_new == l_m → c = 0+1 = 1
          → HLC=(102, 1)   ← 物理钟没追上,用逻辑位 +1
  pt=98   local
          l_new = max(102, 98) = 102
          物理钟没前进 → c = 1+1 = 2
          → HLC=(102, 2)
  pt=103  local
          l_new = max(102, 103) = 103
          物理钟前进了 → c = 0
          → HLC=(103, 0)
```

**关键性质**:

```
1. HLC 永远单调递增(每个节点的本地序列)
2. happens-before(A → B) ⇒ HLC(A) < HLC(B)  ✓
3. HLC(A) - 物理时间 ≤ 时钟误差上界(若 NTP 误差 ≤ ε,HLC 物理位偏离 ≤ ε)
4. 元数据 O(1):一对 (ms, counter),不到 16 字节
```

### 2.4 HLC 解决了什么

- **可比**:就是两个数,字典序比
- **可信**:物理位 `l` 就是 ms 级时间,运维一看就明白"这事是中午 12 点的"
- **轻量**:8 字节物理 + 4 字节逻辑 = 12 字节,塞进每个 MVCC 版本完全没压力
- **因果保持**:逻辑位接管 NTP 抖动

**唯一前提**:NTP 不疯——只要物理钟偏移有上界 ε,HLC 就能稳定工作。

---

## 三、HLC 工程实战:CockroachDB / YugabyteDB

### 3.1 CockroachDB 的事务时间戳

CockroachDB(简称 CRDB)是开源 Spanner 模仿者,**用 HLC 完全替代 TrueTime**:

```
1. 客户端 BEGIN  → 选一个节点作 gateway,gateway 拨 HLC 给事务一个 ts_begin
2. 事务读写都基于 ts_begin(MVCC 多版本读)
3. 写时检查:目标 key 上是否有 ts > ts_begin 的写?有就冲突
4. COMMIT → 提交时间戳 ts_commit ≥ ts_begin,持久化到 Raft 日志
```

### 3.2 Uncertainty Interval(不确定性区间)

CRDB 的精髓:**因为不信任物理钟,事务携带一个 uncertainty 区间**

```
事务 T 从 gateway 拿到 ts_begin = (1000ms, 0)
gateway 配置 max_offset = 500ms(节点间最大允许时钟偏差)
T 的 uncertainty window = [1000, 1500]
```

**读规则**:

```
读 key K,看见多个 MVCC 版本:
  v1 ts = 900   → 在 T 之前,可见
  v2 ts = 1200  → 在 uncertainty 内 → 不确定它"真"在 T 之前还是之后
                 → 触发 ReadWithinUncertaintyIntervalError
                 → 客户端要 restart 事务,把 ts_begin 拨到 1200 之后
  v3 ts = 1600  → 在 T 之后,不可见
```

**这就是"read-restart"**——CRDB 在没有 TrueTime 的情况下用 uncertainty 保证 serializability,**代价是偶尔(尤其时钟漂移大的时候)需要重试事务**。

### 3.3 max_offset 怎么配

**关键参数**:`--max-offset 500ms` 是 CRDB 的核心安全阀

```
配置太小(50ms) → NTP 漂移超过,节点被踢出集群
配置太大(5s)   → uncertainty window 大,read-restart 多,延迟飙升
推荐:250ms ~ 500ms,前提是部署 chrony 让 NTP 偏差稳定 < 100ms
```

**生产事故**:云上虚机的时钟漂移有时能爆 1s+,**CRDB 文档明确要求"用裸金属或专门的 NTP 设施"**——这是 HLC 路线的成本边界。

### 3.4 YugabyteDB(也是 HLC)

YB 用 Raft + HLC,玩法和 CRDB 几乎一样,**多了"Hybrid Time Leader Leases"**:Raft Leader 用 HLC 维持租约,**写必须发生在租约期内**——避免脑裂期间双 Leader 用不同 HLC 写出冲突数据。

---

## 四、TrueTime:Google Spanner 的硬件神迹

### 4.1 核心理念

Spanner(Corbett et al. 2012)走完全相反的路:**不要逻辑修补,直接砸钱让物理钟可信**

```
每个数据中心配置:
  - GPS 接收器(从卫星拿原子钟时间)
  - 原子钟(铷或铯,作 GPS 失效时的备份)
  - Time master 服务器(汇总并广播)
  - 每台机器的 timeslave daemon 从 master 同步,本地 polling
```

### 4.2 TrueTime API

**关键点**:`TT.now()` **不返回一个数,返回一个区间**

```
TT.now() → TTinterval{ earliest, latest }
  earliest: 当前真实时间一定 ≥ earliest
  latest:   当前真实时间一定 ≤ latest
  ε = (latest - earliest) / 2  → 7ms 以内(Google 公开数据)

辅助 API:
  TT.after(t)  → 当前时间一定大于 t 吗?  (即 t < earliest)
  TT.before(t) → 当前时间一定小于 t 吗?  (即 t > latest)
```

**这是和 HLC 最大的不同**——TrueTime **承认时间不准但给出准确的不确定度**,HLC 假设时间不准但靠逻辑位修补。

### 4.3 ε 怎么压到 7ms 以内

```
GPS / 原子钟本身误差: < 1ms
广播+网络传输误差:    2-5ms
本地 polling 漂移:    1-2ms (每 30s 同步一次)
保守上界:           ε ≈ 7ms(99.9% 分位数)
```

**Google 在 SIGMOD 2017 后续论文里说,Spanner ε 中位数 < 4ms**——这是数千万美元基础设施换来的。

### 4.4 Commit Wait:外部一致性的实现

**Spanner 的杀手锏**——保证"如果 T1 在 T2 开始前提交,T1 的提交时间戳一定 < T2 的提交时间戳"(External Consistency,比 Linearizability 还强)

```
事务 T 准备提交,提交时间戳 s = TT.now().latest
                          ↑ 选 latest 而不是 earliest

Commit Wait:
  while not TT.after(s):
      sleep(...)
  # 此时全网真实时间一定 > s
  # 任何后续事务的时间戳都会 > s
  return success
```

**直白说**:**事务先选一个"未来"的时间戳,然后等到那个时间真的过去了才回 ack**。**等待时间 ≈ ε ≈ 7ms**。

这看似浪费,但**关键在于**:在这 7ms 内,系统已经在做 Paxos 复制 + 锁释放,**等 Paxos 完它也差不多过了 ε**——commit wait 几乎不增加用户感知延迟。

### 4.5 Spanner 事务时序图

```
client  ──BEGIN──→ coord
                    │
                    │ acquire locks
                    │ pick prepare_ts ≥ TT.now().latest
                    │
                    ├── Paxos replicate(prepare_ts) ──→ participants
                    │                                    │ persist
                    │                                    │ ack
                    │←─── ack ────────────────────────── ┘
                    │
                    │ commit_ts = max(prepare_ts from all)
                    │ Paxos replicate(commit_ts)
                    │
                    │ COMMIT WAIT:
                    │   while not TT.after(commit_ts):
                    │       sleep
                    │
                    │←───── 等 ε 过去 ──────│
                    │
client ←─ACK── coord
```

**性质**:任何在该 ACK 之后开始的事务,都看到 commit_ts < 它自己的时间戳——**实现了 external consistency**。

---

## 五、HLC vs TrueTime vs 中心化 TSO:三方对比

第三条路是**中心化 Timestamp Oracle**(TSO),代表是 TiDB(从 Percolator 继承的设计):

```
所有事务从同一个 TSO 节点拿时间戳
TSO 单点,无并发问题,绝对单调
依赖物理钟但 TSO 内部维护单调计数,不怕 NTP 抖
```

**三方对比**:

| 维度 | TrueTime(Spanner) | HLC(CRDB / YB) | TSO(TiDB) |
| --- | --- | --- | --- |
| 时间源 | GPS+原子钟 | NTP+逻辑位 | 单个节点的物理钟 |
| 元数据/事务 | TT interval | (ms, counter) | 一个数 |
| 跨地域延迟 | **commit wait ≈ 7ms** | uncertainty restart 偶发 | 跨地域到 TSO 一来一回(可能上百 ms) |
| 单点风险 | 无(每个 DC 都有 time master) | 无(节点自维护) | **TSO 是单点**(实际 PD 也是 Raft) |
| 硬件成本 | **很高**(原子钟+GPS) | 低(普通 NTP) | 低 |
| 容量上限 | 数百万 TPS | 100W TPS 量级 | TSO 申请走批量,百万 TPS |
| 哪家在用 | Google Spanner / F1 | CockroachDB / YugabyteDB | TiDB / TiKV |

**选型公式**:

```
有钱跨地域 + 要 external consistency  → TrueTime(Spanner)
没钱跨地域 + 要近似强一致           → HLC(CRDB / YB)
单地域为主 + 想要简单               → TSO(TiDB)
```

---

## 六、HLC/TrueTime 解决不了的问题

### 6.1 HLC 假设的"NTP 不疯"

CRDB 的 max_offset 配 500ms,**但 NTP 真出过 1 小时跳变的事故**(05 篇)——这种时候 HLC 没救:

- 节点 A 物理钟突然回退 1h
- A 本地 HLC 看到 `pt < l`,继续用 l(不退)
- **但 A 的 NTP 报告"我现在是 1h 前"**——其他节点不信任 A,把 A 踢出集群
- 集群正常,A 离线

**对策**:**严格监控 NTP 偏差**——CRDB 内置心跳带 HLC 比对,偏差超阈值自动隔离节点。

### 6.2 TrueTime 的硬件依赖

```
GPS 被欺骗(spoofing)→ 时间被恶意带偏
原子钟故障 + GPS 网络断 → ε 飙升到几百 ms
DC 内 time master 全挂 → ε → ∞ → 系统不能提交事务
```

**Google 公开过**:Spanner 在某个 DC 经历过 time master 故障,**ε 飙到 200ms,影响该 DC 的 commit wait 延迟**(但因为多 DC,没有彻底挂)。

### 6.3 跨 DC 的因果在两边都看不准

HLC 和 TrueTime **都是"节点本地 + 消息携带"模式**——没有消息往来的两个节点,**它们的 HLC/TT 可能错位**(在 ε 范围内)。

**例**:DC1 写 v1,几乎同时 DC2 写 v2,**没有任何消息把 v1 同步到 DC2**,DC2 给 v2 打的 ts 可能 < v1 的 ts。**这种"真并发"在 HLC 下表现为 uncertainty,在 TrueTime 下被 commit wait 屏蔽**。

### 6.4 谁先打时间戳谁有锁(死锁与饥饿)

Spanner 内部规则:**事务时间戳早的优先**——但如果一个长事务时间戳很早,**短事务全都被它阻塞**。**CRDB 类似**:read-restart 多了之后,**有时事务永远拿不到稳定的时间戳**。

**对策**:**优先级 + Deadlock detection**,生产监控里盯紧 "uncertainty_restarts" 这个指标。

---

## 七、HLC 在分布式追踪 / 日志聚合的另一用法

HLC 不止用在数据库,**任何需要"跨节点排序事件"的地方都能用**:

### 7.1 OpenTelemetry / Jaeger / Zipkin 的 trace

分布式追踪要把跨服务的 span 排成有序的 trace,**目前主流用 NTP**——但跨地域 NTP 偏差几十 ms,span 顺序经常错位。

**前沿做法**:在 SDK 里嵌入 HLC,每个 span 带 HLC 时间戳,**保证 happens-before 关系不乱**(MongoDB / FoundationDB 都在内部做了类似事)。

### 7.2 多机房日志聚合

ELK / Loki 这类系统从多机房收日志,**用机器本地时间排序经常乱**——HLC 能让"用户 A 触发的请求链路"在日志里按因果顺序出现。

> **HLC 的本质是给 NTP "买一份保险"**——付出 O(1) 的逻辑位,换 happens-before 的强保证。**任何依赖跨节点事件顺序的系统都能受益**。

---

## 八、Spanner / CRDB / TiDB 的"内部时钟"实现细节

### 8.1 Spanner 的 TrueTime Daemon

每台机器跑一个 daemon,**每 30s 从 time master polling**,中间用本地 oscillator 外推:

```python
class TrueTimeDaemon:
    def __init__(self):
        self.last_sync = time.monotonic()
        self.master_time_at_sync = master.query()
        self.epsilon_at_sync = master.uncertainty  # 通常 < 1ms
    
    def now(self):
        elapsed = time.monotonic() - self.last_sync
        # 本地 oscillator 漂移上界 ~200ppm
        drift_upper = elapsed * 200e-6
        return TTinterval(
            earliest = self.master_time_at_sync + elapsed - drift_upper - self.epsilon_at_sync,
            latest   = self.master_time_at_sync + elapsed + drift_upper + self.epsilon_at_sync,
        )
```

### 8.2 CockroachDB 的 HLC 实现

CRDB 源码 `pkg/util/hlc/hlc.go`:**整数 64 位**(ms 高 48 位 + counter 低 16 位),原子操作更新

### 8.3 TiDB 的 PD / TSO

PD(Placement Driver)集群 3-5 节点,Raft 选主,**只 Leader 发号**:

- 客户端批量申请(一次拿 100 个 ts)
- Leader 内存维护单调计数,**每 3s 持久化一次最大已发号**
- Leader 切换 → 新 Leader 从持久化值 +X 起步(避免回退)

**TSO 不依赖物理钟绝对值**——纯计数器,但**实际仍然按 ms 编码**,所以 TiDB 也建议节点开 NTP。

---

## 九、外部一致性 vs 线性一致性:Spanner 多保了什么

线性一致性(详见 16/17 篇):**单 key 操作看起来像在单机上执行**

外部一致性(External Consistency):**全系统所有事务看起来像按真实物理时间顺序执行**

```
线性一致性:
  T1 提交后,T2 才开始,T2 一定看见 T1   ✓
  T1 和 T2 真实物理时间有重叠时,顺序未定

外部一致性(更强):
  T1 真实物理时间 < T2 真实物理时间(即 T1 完全早于 T2)
  → T2 一定看见 T1,且 commit_ts(T1) < commit_ts(T2)
```

**Spanner 用 TrueTime + commit wait 实现外部一致性**——这是它能"装作单机 SQL 数据库"的关键。**CRDB 只保证 serializability**(不破坏因果但不保证 wall clock 顺序),**比 Spanner 弱一档**——这就是没有原子钟的代价。

---

## 十、踩坑提醒

1. **以为 HLC 完全等同 TrueTime**——HLC 没有 ε 区间保证,**事务"看起来按 wall clock 排序"是 best-effort**;只有 TrueTime + commit wait 才有外部一致性。
2. **CRDB 不监控 max_offset**——节点 NTP 漂移超阈值会被踢出集群,**没监控就是惊喜**。生产必须配 chrony + Prometheus 报警。
3. **TrueTime ε 不监控**——Spanner 也会偶尔出现 ε 飙升,**关键 SLA 看板要把 ε 99 分位数和 commit wait 时长画上**。
4. **HLC 当 wall clock 用做调度**——HLC 物理位会因为对端消息被"拉前",**不能用它做"5 分钟后执行"的定时任务**,用纯物理钟。
5. **跨地域部署 TSO**——TiDB PD 跨地域,事务每次都要跨 RTT 拿 ts,**直接把单事务延迟从 5ms 拉到 100ms+**。**TSO 必须和热点业务同地域**。
6. **HLC 节点 ID 不稳定**——重启换 ID,HLC 比较看起来正常但实际"假并发"暴增。**节点 ID 持久化**。
7. **不实现 uncertainty restart**——HLC 系统必须能处理 ReadWithinUncertaintyIntervalError,**应用层不要把它当普通错误抛给用户**。
8. **以为 commit wait 是浪费**——它就是 Spanner 强一致的核心,**砍掉了就退化成 CRDB 级别的 serializability**。
9. **依赖 HLC 排"跨服务因果"**——HLC 节点本地单调,**但跨服务必须有消息携带 HLC 才有因果保证**。RPC 框架要把 HLC 注入 trace context。
10. **以为"装 NTP 就够了"**——NTP 标准协议只保证 ms 级,**且不保证 monotonic**。生产用 PTP(IEEE 1588)或 chrony 强约束,**HLC max_offset 才能压低**。

---

下一篇 `09-FLP 不可能定理`:时间戳的故事讲完了,但**真正的难题在共识——异步网络里,你怎么让 N 台机器对"下一个值是什么"达成一致?**FLP 在 1985 年丢了一颗深水炸弹:**只要存在 1 个 crash 节点,纯异步网络里就不存在确定性的共识算法**。这听起来像"共识不可能",但 Paxos / Raft 满天飞——它们怎么"绕过" FLP?下一篇拆开看。
