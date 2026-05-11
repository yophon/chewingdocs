# Linearizability 深入

上一篇把一致性谱铺开,这一篇钻进谱顶那一档——**Linearizability(线性一致性)**。它的英文叫得很玄,但工程直觉就一句话:**这个系统的并发操作历史,能用一段单机串行执行的历史去解释**——外部观察者看不出它是分布式的。**这是分布式系统能给到应用层最强的"看起来像单机"承诺**——也是最贵、最难、最容易在生产假装到位实则破掉的一档。**Jepsen 这十年公开打脸了 etcd / Consul / TiDB / MongoDB / Cassandra,几乎清一色都是"我们的 Linearizable 实现并不真的 Linearizable"**——这一篇讲清楚为什么这么难,以及怎么判断你正在用的那个所谓"强一致存储"是不是真的强一致。

> 一句话先记住:**Linearizability = 每个操作看起来在 [invocation, response] 区间内某一瞬时原子完成,且真实时间偏序被保留**。**它是单对象单操作级别的"假装单机"**——和 Serializability(事务级)是两件事,**Strict Serializability = Linearizability + Serializability**。**工程上实现它的标志动作是 CAS / read-modify-write**——能不能在并发下正确做 CAS,是判定的金标准。**它和分区可用性不可兼得**——这就是 CAP 真正的数学含义。

---

## 一、Herlihy & Wing 1990 的原始定义

论文标题《Linearizability: A Correctness Condition for Concurrent Objects》,1990 年 ACM TOPLAS。**之前并发对象的"正确性"靠 Lamport 的 Sequential Consistency 描述,但 Sequential 不要求保留真实时间**——Herlihy 和 Wing 想要"能局部组合"的强模型,搞出了 Linearizability。

### 1.1 一个操作 = 一段区间

每个操作不是一个点,**是一段时间**:

```
client 发起调用            ──→     ──→     服务端返回
        invocation 时刻             response 时刻

时间轴:
  C1: [────── op1 ──────]                       op1 区间 = [t1_a, t1_b]
  C2:           [────── op2 ──────]             op2 区间 = [t2_a, t2_b]

  「op1 在 op2 之前完成」  当且仅当  t1_b < t2_a
                                    (op1 的 response 早于 op2 的 invocation)
```

**关键**:两个操作如果区间重叠,就是**并发**的,无所谓先后;如果一个的 response 早于另一个的 invocation,才是"真实时间偏序"上的先后。

### 1.2 Linearizable 的核心约束

存在一个**线性化序**(linearization order)`<`,满足:

1. **它是所有操作的一个全序**——每个 op 都有唯一位置
2. **它符合单对象顺序语义**——按 `<` 顺序执行,每个 op 的返回值要满足对象的串行规范(读到最近的写、CAS 比较正确,等等)
3. **它保留真实时间偏序**——如果 op1 在 op2 之前完成(t1_b < t2_a),则在 `<` 序里 op1 必须排在 op2 之前

**直觉**:**每个操作在它的区间内某一瞬时"原子完成"**,这个瞬时点叫**linearization point**。

```
区间表示:
  C1: [────── write(x,1) ──────]
                    ↑
                    选一个原子瞬时(linearization point)

  C2:                     [── read(x) ──]
                                  ↑
                                  线性化序里在 write 之后 → 必须返回 1
```

### 1.3 为什么这个定义"够用"

- **可组合性(locality)**:每个对象单独 Linearizable,组合起来还是 Linearizable。**Sequential Consistency 没这个性质**——这是 Linearizability 真正赢的地方
- **非阻塞性**:一个操作的合法返回值不依赖于"等其他客户端的悬挂操作"。**适合实现真实系统**

---

## 二、和 Sequential / Serializability / Strict Serializability 的区别

四个名字最容易混,**死记不如把差别图画清楚**:

### 2.1 Linearizability vs Sequential Consistency

```
真实时间轴:

  C1:  [───── write(x,1) ─────]
                                    
  C2:                                  [── read(x) = 0 ──]

线性一致:不合法
  (read 完全在 write 之后,真实时间偏序要求 read 看到 1)

顺序一致:合法
  全局序可以是 read, write —— 所有客户端都这么看就行,不需要符合真实时间
```

**一句话**:**Sequential 不在乎真实时间,Linearizable 在乎**。多核 CPU 内存模型大多是 Sequential 或更弱,分布式存储想给的是 Linearizable。

### 2.2 Linearizability vs Serializability

| | Linearizability | Serializability |
| --- | --- | --- |
| 粒度 | 单对象单操作 | 多对象多操作的事务 |
| 关心 | 并发操作历史 | 事务隔离级别 |
| 时间 | 保留真实时间偏序 | 不要求 |
| 来源 | 并发对象 / 分布式存储 | 数据库事务 |

```
Serializability 合法但 Linearizable 非法:

  T1: BEGIN; write(x, 1); COMMIT   (完整执行在 [10:00:00, 10:00:01])
  T2: BEGIN; read(x)   = 0; COMMIT (完整执行在 [10:00:02, 10:00:03])

可序列化:T2; T1 这个序也合法(只要存在等价的串行执行)
线性一致:非法(T2 完全晚于 T1,read 必须看到 1)
```

### 2.3 Strict Serializability = 两者合一

```
Strict Serializability:
  存在一个事务串行执行序,
  且这个序保留真实时间(早完成的事务在序里更前)
```

**这是 Spanner、CockroachDB、TiDB 提供的级别**——既要 Serializable,又要 Linearizable。Spanner 自称的 **External Consistency** 就是 Strict Serializability。

> **面试 / 真实选型时这四个一定不要混说**——"我们是强一致" 含糊不清,**精确说"单 key Linearizable / 事务 Serializable / 全局 Strict Serializable"**。

---

## 三、CAS:Linearizability 的指标动作

判断一个系统**真的**给 Linearizable,看它能不能正确支持 CAS(Compare-And-Swap):

```
CAS(x, expected, new):
  if read(x) == expected:
      write(x, new)
      return success
  else:
      return fail
```

**为什么 CAS 这么"敏感"**:

- 它把 read 和 write 绑成一个原子动作
- 任何"窗口期"(读到之后、写下去之前,别人改了)都会破坏正确性
- **如果系统不是 Linearizable,CAS 必然有概率失败**——比如读到主的旧值,写到了主的新值,或写时主刚切换

**Redis 单实例**:**给 Linearizable**(单线程串行),`SETNX` / `WATCH+MULTI` 可以正确做 CAS。

**Redis Cluster / Redis 主从**:**不 Linearizable**(主从异步,主挂选举可能丢数据)。**Redlock 就栽在这**——它假设了它根本拿不到的保证,详见第 26 篇。

**etcd / ZooKeeper**:**给 Linearizable**(Raft / ZAB 全多数派持久化后才返回),`etcdctl txn`、`zk.create with version check` 可以正确做 CAS。

> **看到一个"分布式锁 / CAS"实现,先问:它底下的存储是不是真的 Linearizable**——这一问能挡掉 80% 的"看似 OK,实则数据竞争"的方案。

---

## 四、CAP 的严格证明就在这里

CAP 那个定理("分区时一致性 vs 可用性二选一")**只有在 C = Linearizability 时才严格成立**——这一节把证明大意写清楚。

### 4.1 直觉

```
两个节点 N1, N2,初始 x=0,网络分区 N1 和 N2 之间无法通信:

  C1 → N1:  write(x, 1)
  C2 → N2:  read(x)

要求:
  - 可用性:两个请求都必须在合理时间内返回(不能等)
  - Linearizable:write 完成后的 read,必须返回 1

矛盾:N2 收不到 N1 的写,要么 N2 拒绝读(放弃可用),
     要么 N2 返回 0(放弃 Linearizable)
```

### 4.2 严格论证(Gilbert & Lynch 2002)

**反证法**:假设存在一个分布式系统同时满足 Linearizability + Total Availability + Partition Tolerance,**构造一个执行违反 Linearizability**:

1. 在 N1 和 N2 之间永久分区
2. 在 N1 上完成 write(x, 1),由可用性,N1 必须在有限时间内返回 ack
3. 在 N2 上发起 read(x),由可用性,N2 必须在有限时间内返回结果
4. N2 不知道 N1 写了什么(分区),只能返回旧值 0
5. 但真实时间偏序上 write 完成 < read 开始,Linearizable 要求 read=1
6. 矛盾

**结论**:**Linearizability 和 Total Availability 在异步网络分区下不可兼得**。

> **CAP 不是 vague 的"三选二",是"Linearizability + Total Availability 在分区下数学上不可兼得"**——所以**弱化任何一个**,矛盾就消失。**这就是为什么因果一致性 / Eventual 可以和 P 共存(下一篇详讲)**——它们都比 Linearizability 弱。

---

## 五、工程上怎么实现 Linearizable

### 5.1 单 key 的两板斧:Raft / Paxos + Quorum Read

**写**:走 Raft / Paxos,半数以上节点持久化后才返回 ack。**写的 linearization point 选在"commit 那一瞬"**。

**读**(关键且最容易做错):

```
方案 A:Leader Read(默认)
  ──────────────────────────
  客户端发到 leader → leader 直接返回本地值
  问题:leader 可能已被新选举推翻自己不知道("过期 leader")
        → 返回的"最新值"其实是旧值

  修补:
    a. Leader Lease(租约):leader 在 lease 期内确定自己是 leader,可放心读
    b. Read Index:读前先发 heartbeat 给多数派,确认自己还是 leader

方案 B:Quorum Read
  ──────────────────────────
  从多数派节点读,取最新版本
  代价:读延迟 = 一次共识 RTT

方案 C:Linearizable Read(etcd 默认)
  ──────────────────────────
  读请求也走 Raft log(noop 写入)
  代价大但严格
```

**etcd 的具体做法**:`raft.ReadIndex` + leader read,**默认线性化读**(`--consistency=l`)。**也提供 `--consistency=s`(serializable,只读 leader 本地)做性能换一致性**。

### 5.2 跨 key 的 Linearizable:全局序

**单 key Linearizable 是基线,跨 key Linearizable 要全局序**——这才是 NewSQL 真正的难点:

```
事务 T1:write(x=1), write(y=1)        在 partition group A
事务 T2:read(x), read(y)               在 partition group B

要求:T2 要么看到 x=1, y=1,要么都看不到 —— 不能只看到一个

实现方案:
  - Spanner:TrueTime 全局时间戳 + 2PC
  - TiDB / TiKV:TSO(全局时间戳服务)+ Percolator
  - CockroachDB:HLC + 时间戳重排
```

**Spanner 凭什么能做到 External Consistency**:**TrueTime API 返回 [earliest, latest] 区间,commit 时等到 latest 过去才返回**——这样后续事务的 timestamp 一定大于本事务,真实时间偏序天然保留。**详见 08 篇 TrueTime 和 24 篇 Spanner**。

---

## 六、"伪 Linearizable" 的常见陷阱

线上系统号称 Linearizable 的多了,真做到的少。**这一节列五大陷阱**——code review 时一眼判断系统是真还是假。

### 6.1 主从异步 + 主挂选举

**典型**:Redis 主从、MySQL 异步复制、Kafka 默认 ack=1。

```
主接受 write,立即返回 ack(异步复制中)
主挂了,从被选为新主(没收到那笔写)
客户端再去读 → 新主返回旧值 → 违反 Linearizable
```

**判定**:**只要"主接受到写并 ack" 和 "数据复制到多数派" 之间存在窗口,就不是 Linearizable**。

### 6.2 主从同步 + 从读

**Reactive 错招**:为了减轻主库压力,加同步复制后允许从读。

```
写:主 + 同步从,两阶段持久化(看起来很强)
读:负载均衡到从

时间窗口:主已 commit,从还没拿到该事务
       → 从读返回旧值 → 违反 Linearizable
```

**修补**:从读要带上"已读 index ≥ 写 commit index"的检查(类似 etcd 的 read index)。

### 6.3 ZooKeeper 默认 follower 读

**ZooKeeper 默认 follower 可读**,**这本身只是 Sequential 不是 Linearizable**——follower 可能 lag 在某一版本。

要 Linearizable read,**显式调用 `sync()` 再 read**,或用 `getData(sync=true)`。

> 很多人用 ZK 做"配置中心",**没调 sync 就直接 getData**,**结果新配置推送后某台机器读到旧值**——典型 follower lag 坑。

### 6.4 客户端缓存

```
客户端缓存了 x = 0
另一个客户端 write(x = 1)
读时打到缓存 → 仍返回 0 → 违反 Linearizable
```

**修补**:**缓存必须有失效机制**——TTL 太长 = 违反 Linearizable。

### 6.5 假 CAS:Read-then-Write 不在同一个原子动作里

**错误代码**:

```python
v = client.get("x")              # 读
if v == expected:
    client.set("x", new)          # 写
# 这两步之间任何人都能改 x → 不是 CAS
```

**正确**:用客户端 SDK 的 CAS 接口(`etcd txn`、`Redis WATCH + MULTI`、`MongoDB findAndModify`)——把读和写绑进**服务端原子操作**。

> **应用代码里自己拼 CAS 就是错的**——必须用存储侧的 CAS 原语。

---

## 七、怎么"测"线性一致性:Jepsen / Knossos / Porcupine

**写完一个号称 Linearizable 的系统怎么验证**?数学证明大多数项目做不了,**工程做法 = 黑盒测试**:让多个客户端并发跑、注入故障、记录历史,然后用算法去判定这段历史能不能 linearize。

### 7.1 Jepsen(Kyle Kingsbury / Aphyr)

**业界标杆**。流程:

```
1. 用 Clojure 写一个 Jepsen test:
   - 部署 N 个节点的目标系统
   - 多个客户端并发发请求,记录每个操作的 [invoke, response]
   - 注入故障:网络分区 / 节点重启 / 时钟跳变 / 进程暂停

2. 收集完整历史(每个 op 的 invoke/response + 真实时间戳)

3. 把历史喂给 checker(Knossos / Porcupine 等)

4. checker 判定:是否存在一个线性化序解释这段历史?
```

**Jepsen 公开报告打过脸的系统**(部分):

| 系统 | 公开年份 | 主要问题 |
| --- | --- | --- |
| **etcd 0.4** | 2014 | 多次违反 Linearizability |
| **Consul** | 2014 | 默认配置下违反 Linearizable read |
| **MongoDB** | 多次 | writeConcern 不当 / 读到回滚数据 |
| **Cassandra** | 多次 | LWT(轻量事务)在网络抖动下违反 |
| **TiDB** | 2019 | 多次发现 Strict Serializability 违反 |
| **CockroachDB** | 多次 | 时钟漂移导致违反 |
| **VoltDB** | 2014 | 脑裂后数据丢 |
| **Redis Sentinel** | 多次 | 主切换丢数据,Redlock 被论证不安全 |

> **Jepsen 报告是这一层最值钱的"病理报告库"**——研究分布式存储不读 Jepsen 等于学医不看尸检。

### 7.2 Knossos 与 Porcupine:线性化判定算法

**核心难题**:判定一段历史能否被 linearize 是 **NP 完全的**(Gibbons & Korach 1997)——没有快算法,只能搜索。

- **Knossos**(Clojure,Jepsen 原配):WGL 算法(Wing & Gong 1993)穷举,慢,大历史扛不住
- **Porcupine**(Go,Anish Athalye 2017):穷举 + partial order reduction + caching,**比 Knossos 快 100-1000 倍,现在 Jepsen 也用它**

**最小测试示例**(Porcupine 风格):

```go
// 定义对象的串行规范(KV register)
spec := porcupine.Model{
    Init: func() interface{} { return map[string]string{} },
    Step: func(state, in, out interface{}) (bool, interface{}) {
        s := state.(map[string]string)
        req := in.(Op)
        switch req.Type {
        case "write":
            s[req.Key] = req.Value
            return true, s
        case "read":
            return out.(string) == s[req.Key], s
        }
        return false, s
    },
}

// 收集并发历史 → 喂给 checker
events := collectFromRealRun()
if !porcupine.CheckEvents(spec, events) {
    fmt.Println("NOT LINEARIZABLE!")
}
```

**号称 Linearizable 没跑过 Jepsen / Porcupine 的就是说大话**。

---

## 八、一段真实事故:etcd 0.4 时代的 bug

**Jepsen 2014 报告**(简化):

```
场景:5 节点 etcd 集群,客户端做 CAS 计数器(初始 0,只能 +1)
注入:网络分区把集群分成 (3 vs 2)
预期:多数派分区(3)可用,少数派(2)不可用
实际:
  - 多数派分区 leader 接受写(正确)
  - 少数派分区也能"接受"写(因为 etcd 0.4 的实现 bug)
  - 分区恢复时,少数派的写被丢
  - 客户端拿到的 success 实际并没生效

→ Linearizability 严重违反:客户端被骗"我成功 +1 了",
   实际计数器没动 → 跨这个分裂事件后,值减少了
```

**修复**:Raft 实现严格化(只有多数派 leader 才能 ack 写),后续 etcd 2.x / 3.x 通过 Jepsen 验证。

**教训**:

1. **写 Raft / Paxos 的难度被低估**——细节错一个就破不变量
2. **公开 Jepsen 报告 = 学习样本**——不要重复别人踩过的坑
3. **生产前必跑 Jepsen 类测试**——别等 Aphyr 来打你的脸,自己先打

---

## 九、何时该要 Linearizable,何时不该

```
         Q1: 不一致会"造成钱 / 库存 / 法律责任损失"吗?
                       │
              ┌────────┴────────┐
              是                  否
              │                   │
              ▼                   ▼
         Linearizable        Q2: 用户能直接观察到不一致吗?
                                      │
                            ┌─────────┴──────────┐
                            是                    否
                            ▼                     ▼
                       Causal /              Eventual
                       Read-Your-Writes
```

**典型映射**:余额 / 库存 / 订单状态 / 分布式锁 → **Linearizable**;改头像 → **Read-Your-Writes**;评论 / 社交时间线 → **Causal**;点赞 / 推荐 → **Eventual**。

| 业务档位 | 不能用 | 推荐用 |
| --- | --- | --- |
| Linearizable | Redis 主从、MySQL 异步、Cassandra 默认 | etcd / ZK / Spanner / TiDB |
| Causal | 普通 KV(需带版本向量) | Riak / 自研 |
| Eventual | — | 任何 + 异步复制 |

---

## 十、踩坑提醒

1. **把 Linearizable 当 Serializable 用**——前者单对象,后者多对象事务,**Strict Serializable 才是两者合**
2. **Redis 当 Linearizable 用**——主从异步必然违反,**Redlock 也救不了(详见 26 篇)**
3. **ZK 默认 follower 读没加 sync**——拿到的可能是几秒前的旧值
4. **Leader Read 没用 Lease / ReadIndex**——过期 leader 返回旧值,典型"伪 Linearizable"
5. **跨 key 当成 Linearizable**——单 key 强一致 ≠ 跨 key,**跨 key 要事务 / TrueTime**
6. **CAS 用应用层拼读+写**——必须用存储侧原子原语
7. **号称 Linearizable 没跑 Jepsen / Porcupine**——没测过就是没保证
8. **以为同步复制 = Linearizable**——同步只保证持久,**读还是要保证读到最新 commit**
9. **MongoDB 用了 writeConcern=majority 就当强一致读**——还要 readConcern=majority / linearizable 才完整
10. **以为强一致没办法做高 QPS**——单 partition Raft 在 SSD + 万兆网下 5-10w QPS 不难,**真正的瓶颈是跨 partition 事务**

---

下一篇:`18-因果一致性.md`,讲谱上的甜点档——**因果一致性**。它**绕开了 CAP 的死结**(Mahajan 2011 证明:分区下因果可以和可用性共存),**是协同编辑、社交时间线、跨地域多写的工程优解**——Google Docs / Yjs / Figma 都在这一层。
