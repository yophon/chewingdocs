# CRDT:无冲突复制数据类型

前面 16-18 三篇从「线性一致 → 因果一致」一路往下铺,**18 篇结尾留了个钩子**:因果一致比线性一致便宜,但「并发写」仍然要靠应用层解冲突——Dynamo 给你两个 sibling、Riak 给你 vector clock,**谁合并、怎么合并,你自己写代码**。这一篇就回答这个问题:**有没有一种数据结构,让并发更新天然可合并,不需要应用层解冲突?** 有,就是 CRDT。**Yjs / Automerge / Figma / Google Docs 协同编辑、Redis CRDT 多地域复制、Riak 计数器、Akka Distributed Data,底下全是这一篇**。

> 一句话先记住:**CRDT 让并发更新满足"交换 + 结合 + 幂等"三性,任意顺序合并都得到同一结果——根本不需要协调**。代价是**元数据膨胀**(tombstone 难 GC)和**约束受限**(全局唯一/库存这种"必须协调的约束",CRDT 救不了)。**协同编辑、点赞、离线优先、多地域多主**——是 CRDT 的甜点;**转账、库存、唯一用户名**——别用。

---

## 一、为什么需要 CRDT

回到 18 篇的最后:**Dynamo / Riak 用 vector clock 检测冲突,但解冲突要应用层介入**。

```
节点 A:cart = {apple, banana}
节点 B:cart = {apple, cherry}
分区合并 → 应用收到两个 sibling,自己决定合并
```

应用层"自己决定"听起来美,**实际写起来痛苦**:

- 购物车要写并集
- 点赞数要相加
- 用户资料要 LWW(last-writer-wins)
- 文档协同要"按光标位置插入"
- ……每种数据类型一套合并规则,**很容易写错**

更糟的是,**合并规则要满足三性**才能保证"任意网络拓扑下最终一致":

```
1. 交换律(Commutative):a ⊕ b = b ⊕ a
2. 结合律(Associative):(a ⊕ b) ⊕ c = a ⊕ (b ⊕ c)
3. 幂等(Idempotent):  a ⊕ a = a
```

三性都满足,数学上叫**半格(semilattice)**——任意两个状态一合并就上升到一个"最小上界",反复合并也不会再变。

**应用程序员手写合并函数,99% 写不满足三性**——丢更新、循环冲突、合并不收敛(刷新一下又变了)各种鬼故事都见过。

> CRDT 的本质就是:**把"合并规则"封装到数据结构里,只要你用这个结构,合并必然正确**。Shapiro 等人 2011 / 2014 两篇论文把这套形式化了:**只要数据类型构成半格,任意复制、任意网络、任意重排,最终都收敛到同一状态**。

---

## 二、两大流派:State-based vs Op-based

CRDT 在工程上分两条腿:

### 2.1 State-based(CvRDT,Convergent)

**节点之间传整个状态,合并用 `join` 函数**。

```
节点 A 状态:S_A
节点 B 状态:S_B

节点 A 发 S_A 给 B
B 收到 → S_B' = join(S_B, S_A)

join 必须满足:交换 + 结合 + 幂等
```

**优势**:消息丢、重复、乱序都不影响——只要状态最终能到对方,合并必然正确。

**劣势**:每次同步要传整个状态,**状态越大越费带宽**(后面有 delta-CRDT 优化)。

### 2.2 Op-based(CmRDT,Commutative)

**节点之间传"操作",每个节点本地重放操作**。

```
节点 A 执行 op_1 → 广播 op_1 给所有节点
节点 B 收到 op_1 → 本地 apply(op_1)

op 必须满足:并发的 op 之间交换
```

**优势**:消息小(只传 op,不传状态)。

**劣势**:消息**不能丢、不能重复**——传输层必须是 reliable causal broadcast(RCB),工程上比 state-based 难。

### 2.3 怎么选

| 维度 | State-based | Op-based |
| --- | --- | --- |
| 网络要求 | 任意网络,最终送达即可 | 因果序广播 + 不丢不重 |
| 消息大小 | 整状态(可用 delta 优化) | 单个 op,小 |
| 实现难度 | 简单 | 复杂(要 RCB) |
| 典型系统 | Riak / Redis CRDT / Akka | Yjs / Automerge |

> 协同编辑普遍走 Op-based(消息小、延迟低),数据库 / 缓存普遍走 State-based(网络可靠性差,允许重传)。

---

## 三、半格(Semilattice):CRDT 的数学骨架

让数据类型变成 CRDT,本质是**让状态空间构成一个 join-semilattice**——任意两个状态都有一个"最小上界(LUB)"。

```
        join(S_A, S_B)        ← 上界,合并结果
              ↑
         ╱         ╲
        S_A         S_B       ← 两个并发状态
         ╲         ╱
              ↓
            S_0                ← 共同祖先
```

**几何直觉**:状态只往「上」走,合并就是「找两点的最小公共上界」。**永远不会回退**(单调性),所以反复合并必然稳定。

数学定义:

```
偏序 ≤,join 函数 ⊔
- 交换:a ⊔ b = b ⊔ a
- 结合:(a ⊔ b) ⊔ c = a ⊔ (b ⊔ c)
- 幂等:a ⊔ a = a
- 单调:a ≤ a ⊔ b,b ≤ a ⊔ b
```

**任意 CvRDT 的 join 都要构成 semilattice**——这是 CRDT 的"通过条件",不满足就不是 CRDT。

---

## 四、经典 CRDT 全家桶

下面挨个过一遍工程上最常用的几种 CRDT,**每个都给出 join 规则和代码骨架**。

### 4.1 G-Counter(Grow-only Counter,只增计数器)

最简单的 CRDT。**每个节点维护自己的本地计数,合并时取 max**。

```python
class GCounter:
    def __init__(self, node_id):
        self.node_id = node_id
        self.counts = {}          # node_id → count

    def increment(self, n=1):
        self.counts[self.node_id] = self.counts.get(self.node_id, 0) + n

    def value(self):
        return sum(self.counts.values())

    def merge(self, other):
        # 关键:每个 node_id 取 max
        for nid, c in other.counts.items():
            self.counts[nid] = max(self.counts.get(nid, 0), c)
```

**为什么取 max 而不是相加?**——因为可能多次合并同一个对等节点的状态(**幂等**)。取 max 保证 `merge(A, A) = A`。

合并示例:

```
节点 1:counts = {1: 5, 2: 3}        总值 = 8
节点 2:counts = {1: 4, 2: 7}        总值 = 11
分区合并 → counts = {1: max(5,4), 2: max(3,7)} = {1: 5, 2: 7}  总值 = 12
```

**注意 max(5,4) = 5,不是 9**——节点 1 上自己的计数 5 已经包含了"它自己的全部增量",节点 2 那边收到的 4 是个旧拷贝。

### 4.2 PN-Counter(Positive-Negative Counter,可增可减)

G-Counter 只能加。要支持减,**用两个 G-Counter**:一个记加(P),一个记减(N),值 = P - N。

```python
class PNCounter:
    def __init__(self, node_id):
        self.P = GCounter(node_id)
        self.N = GCounter(node_id)

    def increment(self, n=1):
        self.P.increment(n)

    def decrement(self, n=1):
        self.N.increment(n)

    def value(self):
        return self.P.value() - self.N.value()

    def merge(self, other):
        self.P.merge(other.P)
        self.N.merge(other.N)
```

**经典用法**:点赞 / 取消点赞、关注 / 取消关注、库存预占 / 释放(注意,**库存严格不超卖不能用 PN-Counter**,后面踩坑会说)。

### 4.3 G-Set(Grow-only Set,只增集合)

只能 add 不能 remove。合并就是**并集**。

```python
class GSet:
    def __init__(self):
        self.items = set()

    def add(self, item):
        self.items.add(item)

    def merge(self, other):
        self.items |= other.items
```

**并集天然满足三性**——交换、结合、幂等。**G-Set 是所有集合 CRDT 的母版**。

### 4.4 2P-Set(Two-Phase Set,加完可删)

支持 remove,但**删除是永久的**——删了就回不来。**用两个 G-Set:adds + tombstones**。

```python
class TwoPSet:
    def __init__(self):
        self.adds = GSet()
        self.removes = GSet()       # tombstones

    def add(self, item):
        self.adds.add(item)

    def remove(self, item):
        if item in self.adds.items:
            self.removes.add(item)

    def contains(self, item):
        return item in self.adds.items and item not in self.removes.items

    def merge(self, other):
        self.adds.merge(other.adds)
        self.removes.merge(other.removes)
```

**致命缺陷**:删除是永久的。**add → remove → add 同一个 item,第二次 add 不会让它出现**(已经在 tombstones 里了)。

### 4.5 OR-Set(Observed-Remove Set,可删可加再删可加)

解决 2P-Set 的缺陷:**add 时带上唯一 tag,remove 只删"看到过的 tag"**。

```python
class ORSet:
    def __init__(self):
        self.elements = {}          # item → set of tags
        self.tombstones = set()     # 已删除的 tag 集合

    def add(self, item):
        tag = uuid4()               # 每次 add 一个新 tag
        self.elements.setdefault(item, set()).add(tag)

    def remove(self, item):
        # 把当前看到的所有 tag 移到 tombstones
        if item in self.elements:
            self.tombstones |= self.elements[item]
            self.elements[item] -= self.tombstones

    def contains(self, item):
        tags = self.elements.get(item, set())
        return bool(tags - self.tombstones)

    def merge(self, other):
        for item, tags in other.elements.items():
            self.elements.setdefault(item, set()).update(tags)
        self.tombstones |= other.tombstones
        # 清掉已 tombstone 的 tag
        for item in self.elements:
            self.elements[item] -= self.tombstones
```

**为什么这样设计能 work**:

```
节点 A:add(x) tag=t1     elements = {x: {t1}}
节点 B:add(x) tag=t2     elements = {x: {t2}}
节点 A:remove(x)         tombstones = {t1}

分区合并:
elements = {x: {t1, t2} - {t1}} = {x: {t2}}    → x 还在!

意义:A 只看到 t1 这次 add,只能删这一次;B 的 add 没被 A 看到,不能删。
```

**OR-Set 是协同编辑、协同列表的基础积木**——Yjs 的列表本质就是 OR-Set 变种。

### 4.6 LWW-Register(Last-Writer-Wins Register)

每次写带时间戳,合并时取**时间戳大的那个**。

```python
class LWWRegister:
    def __init__(self):
        self.value = None
        self.timestamp = 0

    def set(self, value, ts):
        if ts > self.timestamp:
            self.value = value
            self.timestamp = ts

    def merge(self, other):
        if other.timestamp > self.timestamp:
            self.value = other.value
            self.timestamp = other.timestamp
```

**用在**:用户资料字段(头像、昵称)、状态标志。

**陷阱**:**两个节点时钟不同步,后写的可能反而被丢**——所以工程上的 LWW 一般用 **HLC**(混合逻辑时钟,见 08 篇)而不是物理时间戳。

### 4.7 MV-Register(Multi-Value Register)

不强行解冲突——**并发写都保留,应用层看到 sibling 自己挑**。

```
节点 A 写 v1(vector clock {A:1})
节点 B 写 v2(vector clock {B:1})
分区合并 → register = {v1@{A:1}, v2@{B:1}}    ← 两个并存
应用读 → 看到 sibling 列表,自己解
```

**Dynamo / Riak 的 default 行为就是 MV-Register**。它不算"完整的 CRDT"(因为 join 不收敛到一个值),但仍然满足"任意合并不丢数据"。

### 4.8 全家桶对比

| CRDT | 操作 | 合并规则 | 典型用途 |
| --- | --- | --- | --- |
| G-Counter | inc | per-node max | 全局计数器 / PV |
| PN-Counter | inc/dec | 双 G-Counter 相减 | 点赞 / 关注数 |
| G-Set | add | 并集 | 只增集合(标签) |
| 2P-Set | add/remove | adds ∪ removes | 删除永久的集合 |
| OR-Set | add/remove | tag 级合并 | 购物车 / 协同列表 |
| LWW-Register | set | timestamp max | 用户资料字段 |
| MV-Register | set | 保留所有 sibling | Dynamo 默认 |

---

## 五、序列 CRDT:协同编辑的真核

到目前为止全是计数器和集合,**但协同编辑要的是"有序文本"**——A 在第 5 字符插了 "hello",同时 B 在第 3 字符插了 "world",合并后位置怎么算?

这是 CRDT 最难的一块:**序列 CRDT**。核心思路**给每个字符一个不可变的"位置标识符"**,插入时生成位置,删除时打 tombstone,**位置之间有全序关系**。

主要几种算法:

| 算法 | 位置标识 | 特点 |
| --- | --- | --- |
| **WOOT** | 双向链表 + UID | 第一个工程化序列 CRDT,2006 |
| **Logoot** | 浮点序号(可无限插入) | 位置标识随插入次数膨胀 |
| **Treedoc** | 二叉树路径 | 树退化时性能差,需要重平衡 |
| **RGA**(Replicated Growable Array) | timestamp + 因果序 | **Yjs / Automerge 底层** |
| **YATA** | RGA 变种 + 冲突最少化 | **Yjs 实际算法**(2016) |

**RGA 的核心思想**:

```
每个字符 = (value, timestamp, originLeft)
- value:字符值
- timestamp:逻辑时钟(Lamport 或 HLC)
- originLeft:插入时它左边的字符 ID

插入 c 在 X 右边:
  c.originLeft = X.id
  c.timestamp = clock.next()

并发在同一位置插入多个字符:按 timestamp 降序排列(大的在前)
```

```
初始:H E L L O
A 在 H 后插入 i(时间戳 t1):H i E L L O
B 在 H 后插入 j(时间戳 t2 > t1):H j E L L O
合并(两个 originLeft 都是 H):
  按 timestamp 降序:H j i E L L O
```

**关键不变量**:**任意两个客户端按同一规则排序,得到完全相同的字符序列**——这就是协同编辑"最终一致"的数学保证。

> 序列 CRDT 是 CRDT 里最绕的一块。**95% 的工程师不需要自己实现,直接用 Yjs / Automerge / Y-CRDT** 就行;**剩下 5% 想造轮子的,劝你先把 YATA 论文读三遍**。

---

## 六、工程系统全景

### 6.1 Redis CRDT(Redis Enterprise / Active-Active)

Redis Enterprise 的多地域复制(CRDB)**底层就是 CRDT**:

- String / Set / Hash / List / Counter 都做成 CRDT
- 跨地域写互不阻塞,**异步合并**
- 计数器走 PN-Counter,集合走 OR-Set,字段走 LWW

**配置一行**:`crdb-cli` 拉起 active-active 集群,**应用层无感**——但要注意**有些命令在 CRDT 模式下语义不同**(如 LPUSH 在并发下顺序不保证)。

### 6.2 Riak

Riak 2.0 引入 Data Types 模块,**内置 Counter / Set / Map / Register / Flag** 五种 CRDT。

```erlang
%% Riak 客户端用 Counter
{ok, Counter} = riakc_pb_socket:fetch_type(Pid, {<<"counters">>, <<"my_bucket">>}, <<"page_views">>),
NewCounter = riakc_counter:increment(1, Counter),
ok = riakc_pb_socket:update_type(Pid, {<<"counters">>, <<"my_bucket">>}, <<"page_views">>, riakc_counter:to_op(NewCounter)).
```

**Riak 是工业界最早把 CRDT 当一等公民的数据库**,可惜公司倒了。

### 6.3 Akka Distributed Data

Akka 集群里的内存 KV,**全套 CRDT 数据类型 + Gossip 同步**——服务发现、配置同步、限流计数器都可以用。

```scala
import akka.cluster.ddata._
import Replicator._

val counter = PNCounter.empty.increment(node, 1)
replicator ! Update(CounterKey, PNCounter.empty, WriteLocal)(_.increment(node, 1))
```

### 6.4 Yjs / Automerge / Y-CRDT

**前端协同编辑的事实标准**:

- **Yjs**:RGA 变种(YATA 算法),性能极好,Google Docs / Notion 风格协同的 OSS 实现
- **Automerge**:JSON-like CRDT,支持嵌套对象 / 数组,API 友好
- **Y-CRDT(yrs)**:Yjs 的 Rust 实现,Figma / Linear 在用

**典型架构**:

```
浏览器 1 ─┐
浏览器 2 ─┼─ WebSocket ─→ 中继服务器(无状态)
浏览器 3 ─┘                    ↓
                           持久化(可选)
```

**注意**:中继服务器**不参与合并逻辑**,只转发 update binary。**所有 CRDT 计算在客户端做**——这是为什么 Yjs 可以做到离线编辑、纯 P2P 协同(WebRTC)。

### 6.5 Figma

Figma 的多人协同**不是纯 CRDT**——是 **CRDT + 中心化服务**:

- 大部分图层属性走 LWW(中心化时间戳)
- 文本编辑走类 CRDT 的位置标识
- 中心化服务器顺序化操作,**避免纯 P2P CRDT 的元数据膨胀**

参考 Figma 工程博客《How Figma's multiplayer technology works》——很值得读。

### 6.6 SoundCloud / Bet365 等

很多用 Riak / Cassandra 做点赞 / 关注计数的公司,**底层都跑 PN-Counter**。

---

## 七、CRDT 的局限:它救不了什么

**CRDT 不是银弹**,以下场景不能用:

### 7.1 全局唯一约束

```
两个节点同时注册用户名 "alice" → CRDT 合并后两个都在
```

**全局唯一性需要协调(共识),CRDT 拒绝协调,所以解不了**。

### 7.2 严格不超卖的库存

```
库存 = 1,两个节点同时下单
CRDT 合并:两个订单都成功,库存 = -1
```

PN-Counter 允许负值。**严格不超卖需要预占 + 协调**——Redis SETNX + Lua、TiDB 事务、Kafka 事件源都行,**CRDT 不行**。

### 7.3 复杂树/图结构

JSON 文档可以 CRDT(Automerge 做到了),但**带强约束的树/图**(语法树、外键引用)很难——节点删除时引用、循环检测、约束检查都难做。

### 7.4 元数据 GC

**这是 CRDT 最大的工程痛点**。OR-Set 的 tag、序列 CRDT 的 tombstone、LWW 的旧版本——**全是元数据**,正常工作时不能删,**否则会出现"删了再合并又复活"的鬼故事**。

```
节点 A: add(x, t1)
节点 B: add(x, t2)
节点 A: remove(x) → tombstones = {t1, t2}
节点 A: GC tombstones(以为没用了)
节点 C 离线一周,带着 add(x, t1) 上线
合并 → x 又出现了!  ← 因为 tombstones 被 GC 了
```

**唯一安全的 GC 方式**:**所有节点都见过这个 tombstone 才能删**——但要知道"所有节点都见过",得有 causal stability 检测,**这又需要协调**。

工业界的妥协:

- Yjs:不主动 GC,文档大了用 snapshot 重置
- Automerge:有"compact"操作,要求所有 peer 在线
- Riak:bucket 级别的 GC 策略,带宽换内存

> **CRDT 永远在"不要协调"和"GC 元数据要协调"之间妥协**——这是 CRDT 工程化的根本张力。

---

## 八、何时该用 CRDT

一个简化决策树:

```
你的场景需要全局唯一约束吗?
├─ 是 → 别用 CRDT(用 Spanner/TiDB/共识)
└─ 否 → 你的更新是"自然可合并的"吗?(计数、集合、文本)
        ├─ 是 → CRDT 很可能合适
        │       ├─ 协同编辑 → Yjs / Automerge
        │       ├─ 多地域多主 → Redis CRDT / Riak
        │       └─ 离线优先 App → Automerge
        └─ 否 → 用 Saga / TCC / 业务级冲突解决
```

**CRDT 的甜点场景**:

1. **计数器**:点赞、PV、播放量——PN-Counter
2. **协同编辑**:文档、白板、表格——序列 CRDT (Yjs/Automerge)
3. **离线优先 App**:Couchbase / RealmDB / Automerge → 客户端断网照写,联网合并
4. **多地域多主**:Redis CRDT、CockroachDB 的某些场景(选 follower-read + CRDT-like 处理)
5. **配置/服务发现**:Akka Distributed Data、Serf gossip 状态

**反甜点场景**:

1. 转账 / 金融账户余额(必须 ACID)
2. 库存严格不超卖
3. 用户名 / 邮箱唯一性
4. 复杂业务规则约束(订单状态机)

---

## 九、CRDT vs MV-Register vs 应用层冲突解决

并发更新的三种思路对比:

| 方案 | 谁解冲突 | 合并保证 | 工程复杂度 | 典型代表 |
| --- | --- | --- | --- | --- |
| **CRDT** | 数据结构内嵌 | 数学上必然收敛 | 中(用现成库) | Yjs / Riak DT |
| **MV-Register + 应用解** | 应用层 | 看应用层写得对不对 | 高(易写错) | Dynamo / Riak default |
| **LWW(简单时间戳)** | 时间戳大者赢 | 收敛但可能丢更新 | 低 | Cassandra default |
| **共识(Raft/Paxos)** | 全局协调 | 强一致(线性) | 高(运维痛) | etcd / TiDB |

> **不需要协调的最终一致 → CRDT;需要协调的强一致 → 共识**。MV-Register 是中间妥协,LWW 是最简单的妥协(但丢更新)。

---

## 十、踩坑提醒

1. **以为 CRDT 是万能最终一致**——它只能解"可交换合并"的场景,**唯一性、库存、外键约束统统不行**
2. **LWW 用本地物理时钟**——节点时钟不同步,后写的可能反而丢。**用 HLC 或服务器统一时钟**
3. **OR-Set 的 tag 用自增 ID**——多节点会冲突,**必须用 UUID 或 (node_id, counter)**
4. **2P-Set 当通用集合用**——删了就回不来,业务层 add → remove → add 直接失效
5. **PN-Counter 当严格库存**——允许负值,**不超卖必须协调**
6. **以为合并是幂等的就不用考虑顺序**——op-based CRDT 仍然要因果广播,**不丢不重不乱序**
7. **元数据无限增长**——OR-Set 的 tombstones、序列 CRDT 的删除标记,跑半年存储爆了
8. **拿 CRDT 当强一致**——CRDT 是**最终**一致,读到的数据可能比"全局最新"老几秒
9. **协同编辑里光标位置存绝对偏移**——并发插入后偏移就错了,**必须用 CRDT 位置标识**(Yjs 的 RelativePosition)
10. **不读论文就自己造 CRDT**——99% 概率某条交换/结合/幂等不满足,数据慢慢错。**用 Yjs / Automerge / Akka DD 的现成实现**

---

## 第四层小结

16-19 这四篇是「**一致性模型**」全谱:

- 16 一致性模型谱:Linearizability → Sequential → Causal → Eventual,**有强弱档位之分**
- 17 Linearizability 深入:**最强的档**,代价高,Jepsen 怎么测
- 18 因果一致:**CAP 之外的甜点**,COPS / 协同编辑里的 happens-before
- 19 CRDT:**最终一致的工程化**,让并发更新天然可合并

**强一致 → 共识(Raft/Paxos),最终一致 → CRDT,中间地带 → 因果一致**——这是分布式数据系统的三大主路线。**Spanner / TiDB 走第一条,Yjs / Riak 走第三条,COPS / Cassandra 用 LWW 走中间**。

---

下一篇:`20-ACID 在分布式下的崩塌.md`,进入第五层「分布式事务」。**单机 ACID 怎么获得,跨机后每个字母都会破**——A 破,引出 2PC;C 破,引出全局约束的痛;I 破,引出快照隔离与序列化代价;D 破,引出"我 fsync 了不代表全局持久"。看完这一篇,你就明白为什么 21 篇要讲 2PC、22 篇要讲 Saga、24 篇要讲 Spanner——**每一种方案都是在"补"某个字母的破口**。
