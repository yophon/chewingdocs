# Flink 状态后端:RocksDB / 增量 Checkpoint / 状态 TTL

20 把 Flink 这台机器的"骨架"拆开了——JobManager、TaskManager、Checkpoint Barrier。这一篇钻进 Flink 最核心也最容易踩坑的一层:**状态(State)**。Checkpoint 写出去的到底是什么、为什么 RocksDB 成了 2025 年事实标准、增量 Checkpoint 怎么让 TB 级状态作业也能稳定运行、状态膨胀这种"看起来跑了 3 个月没事最后一夜爆盘"的事故为什么频繁发生。

> 一句话先记住:**没有状态的流处理 = 过滤映射,有状态才能聚合 / Join / CEP**。Flink 把"状态"做成了引擎一等公民——你声明一个 `ValueState<Long>`,引擎自动管它的存储、checkpoint、恢复、清理。**RocksDB 状态后端是一个嵌在 Flink 算子里的 LSM-Tree 存储**,堆外内存 + 本地磁盘,checkpoint 把新 SSTable 增量传到 S3,恢复时再拉回。**90% 的 Flink 生产事故,要么是状态没设 TTL 跑爆了盘,要么是 RocksDB 调优没做好读写卡死,要么是 Savepoint 升级时改错 schema 状态读不出来**——这一篇就是把这三件事讲清。

---

## 一、为什么需要"内置状态":两种流处理任务对比

### 1.1 无状态算子:每条独立处理

```
输入:  [user=u1, action=click, ts=100] → 过滤 action=click → [u1, click, 100] → Sink
输入:  [user=u2, action=view,  ts=101] → 过滤 action=click → (丢)
输入:  [user=u1, action=click, ts=102] → 过滤 action=click → [u1, click, 102] → Sink

算子内部状态:无
失败重启:重新消费 Kafka,无状态可恢复
```

`map`、`filter`、`flatMap` 这类算子都属于无状态——**每条事件的处理只依赖事件本身**。

### 1.2 有状态算子:依赖历史

```
任务:每个用户最近 1 小时的点击数

输入:  [u1, click, 12:00] → 算子查 u1 的状态 → state[u1] = 1     → 输出 (u1, 1)
输入:  [u1, click, 12:05] → 算子查 u1 的状态 → state[u1] = 2     → 输出 (u1, 2)
输入:  [u2, click, 12:10] → 算子查 u2 的状态 → state[u2] = 1     → 输出 (u2, 1)
输入:  [u1, click, 13:30] → 算子查 u1 的状态 → 12:00 那条已超时
                                              state[u1] = 2 (12:05 那条还在)
                                              + 1 = 3            → 输出 (u1, 3)

算子内部状态:每个 user 的点击列表(或聚合值)
失败重启:必须能恢复"算子内的 state[u1]、state[u2]"才能继续算
```

**这就是为什么 Flink 要把"状态"做成引擎能力**——你不能让用户自己存 Redis(慢、外部依赖、跟 checkpoint 不一致),不能存堆内 HashMap(失败丢了);**必须内置一套"声明 state → 自动 checkpoint → 失败自动恢复"的机制**。

---

## 二、四种状态原语

Flink 暴露给用户的状态有四种形态——按"形态"选,而不是按"用途"选:

```java
// 1. ValueState<T>:每 key 一个值(累加器)
private ValueState<Long> count;
count = getRuntimeContext().getState(new ValueStateDescriptor<>("count", Long.class));

void processElement(Event evt, Context ctx, Collector<Long> out) {
    Long current = count.value();              // 读
    count.update((current == null ? 0L : current) + 1);  // 写
    out.collect(count.value());
}

// 2. ListState<T>:每 key 一个列表(窗口元素)
private ListState<Event> bufferedEvents;
bufferedEvents.add(evt);                       // 追加
Iterable<Event> all = bufferedEvents.get();   // 读全部

// 3. MapState<K, V>:每 key 一个 map(去重计数器、Session 跟踪)
private MapState<String, Long> sessionMap;
sessionMap.put("last_seen", evt.getTimestamp());
Long lastSeen = sessionMap.get("last_seen");

// 4. ReducingState / AggregatingState:边写边聚合
private ReducingState<Long> sum;
sum = getRuntimeContext().getReducingState(
    new ReducingStateDescriptor<>("sum", Long::sum, Long.class));
sum.add(evt.getValue());                       // 自动累加
```

**为什么不只给一个 ValueState<HashMap>**:

- ListState 的 `add` 和 `get` 在 RocksDB 后端可以**追加写,不需要序列化整个列表**——百万元素列表追加是 O(1)
- MapState 的单 key 操作也类似——只读/写一个 entry,不动整个 map
- ReducingState 的 add 是**增量聚合**,中间结果不存,内存友好

**经验法则**:**有现成的就别用 ValueState 包**——用 ListState/MapState/ReducingState 能省一个数量级的序列化开销和内存占用。

---

## 三、Keyed State vs Operator State

### 3.1 Keyed State(99% 场景)

只存在于 `keyBy()` 之后的算子里——**按 key 自动隔离**:

```java
stream.keyBy(Event::getUserId)
      .process(new MyKeyedProcessFunction());

// MyKeyedProcessFunction 内的 state 自动是 per-key 的
// 处理 u1 时,getRuntimeContext().getState(...) 返回的是 u1 自己的 state
// 处理 u2 时,自动切换到 u2 的 state
```

**关键性质**:

- **状态按 key hash 分片到 SubTask**:并行度 8,key u1 永远落在某个固定的 SubTask 上
- **改并行度时状态会被自动重分配**(rescale)——但这非常昂贵,要重读所有状态再 hash 一次,所以**生产改并行度通常通过 Savepoint 中转**

### 3.2 Operator State(少数场景)

整个算子共享一份状态,不按 key 隔离:

```java
class KafkaSourceFunction implements CheckpointedFunction {
    private ListState<Long> offsets;            // 存所有分区的 offset

    public void snapshotState(FunctionSnapshotContext ctx) {
        offsets.clear();
        for (long off : currentOffsets) offsets.add(off);
    }

    public void initializeState(FunctionInitializationContext ctx) {
        offsets = ctx.getOperatorStateStore().getListState(...);
    }
}
```

**典型用途**:

- Kafka Source 存 partition offsets
- Sink 存"未提交的事务 ID"

**为什么不能存大状态**:Operator State 不分片,改并行度时**所有 SubTask 都要读全量**,1GB 的 Operator State 改并行度等于读 1GB × N 次。**所以 Operator State 永远是小元数据,不是业务状态**。

---

## 四、三种 StateBackend 的演化

### 4.1 演化时间线

```
Flink 1.0-1.12:三个 StateBackend 名字
   - MemoryStateBackend       状态在堆 + checkpoint 也在堆      玩具
   - FsStateBackend           状态在堆 + checkpoint 写文件系统   小状态
   - RocksDBStateBackend      状态在 RocksDB + checkpoint 写文件 大状态

Flink 1.13+ 重构,概念分成两个独立维度:

   Backend(状态在哪)                    + CheckpointStorage(checkpoint 写哪)
   ─────────────────                       ────────────────────────────
   - HashMapStateBackend(堆)              - JobManagerCheckpointStorage(JM 内存)
   - EmbeddedRocksDBStateBackend(堆外)    - FileSystemCheckpointStorage(文件)

   旧的 MemoryStateBackend = HashMap + JobManager(已弃用)
   旧的 FsStateBackend     = HashMap + FileSystem
   旧的 RocksDBStateBackend = RocksDB + FileSystem
```

### 4.2 三种生产可用的组合

| 组合 | 状态位置 | Checkpoint 位置 | 适用 | 局限 |
|---|---|---|---|---|
| HashMap + JobManager | JVM 堆 | JM 内存 | 单元测试 | 玩具,生产禁用 |
| HashMap + FileSystem | JVM 堆 | S3 / HDFS | 状态 < TaskManager 堆的 1/3 | 状态超过堆就 OOM |
| **RocksDB + FileSystem** | **堆外 RocksDB** | **S3 / HDFS** | **生产默认** | 序列化每次读写 |

**HashMap 后端的真实场景**:**状态确实小且需要极致性能**——每次读写都是堆内 HashMap O(1),没有序列化开销。**但这有个隐藏代价**:状态在堆,GC 压力直接挤占算子的处理线程,**老年代一长容易 STW**。

**RocksDB 后端的代价**:**每次读写都要序列化**——key 和 value 都要 byte[],状态接口看似 `state.value()` 一行,底层是 `RocksDB.get(serialize(key)) → deserialize`。一次状态访问可能就是几十微秒。**但**:堆外内存,不影响 GC;状态可以远超堆;增量 checkpoint 几乎是 RocksDB 独占技能。

**结论**:**生产默认 RocksDB**,除非状态确认极小且对单条延迟敏感(< 1ms)。

---

## 五、RocksDB 在 Flink 里的形态

### 5.1 RocksDB 是什么:LSM-Tree 心智

```
写路径(append-friendly):
  put(k, v) → MemTable(内存,跳表)── flush ──→ SSTable(磁盘,有序不变)
                                                ↓
                                          Compaction(后台合并多个 SSTable)
                                                ↓
                                          更大的 SSTable(L1, L2, ..., Ln)

读路径(从新到旧):
  get(k) → MemTable → L0 SSTables → L1 → L2 → ... → 找到就返回
```

**核心思想**:**写永远 append**(MemTable + SSTable 都不可变),**读可能扫多层**——LSM-Tree 牺牲读性能换写性能。

**为什么 Flink 选 LSM-Tree 而不是 B-Tree**:流处理里**写远多于读**——每条事件至少更新一次状态,RocksDB 的写吞吐(几十万 OPS/秒)远超 B-Tree 类存储。

### 5.2 一个 Flink 算子在 RocksDB 里的样子

```
TaskManager 进程
  ├── JVM 堆(算子代码、Flink 框架)
  └── 堆外内存
       └── RocksDB 实例(每 SubTask 一个)
            ├── Column Family: window-state
            │   ├── MemTable
            │   └── SSTables(磁盘,本地 SSD)
            ├── Column Family: count-state
            │   └── ...
            └── Column Family: dedup-state
                └── ...
```

**关键映射**:

- **每个 SubTask 一个独立 RocksDB 实例**——并行度 8 就有 8 个 RocksDB 实例
- **每种 state 一个 Column Family**——`ValueState<Long> count` 就是一个 CF
- **Keyed State 的 key 是 RocksDB key 的一部分**——RocksDB key = `<key-group-id><key><namespace>`

**状态在物理上**:

```
TaskManager 本地 SSD 上的目录:
  /tmp/flink-rocksdb/
    └── job-xxx/
        └── chk-1234/
            ├── window-state-cf/
            │   ├── 000123.sst       ← SSTable 文件
            │   ├── 000124.sst
            │   └── MANIFEST
            └── count-state-cf/
                └── ...
```

### 5.3 调优旋钮:你大概率要碰的几个

```yaml
# RocksDB 内存预算(堆外!)
state.backend.rocksdb.memory.managed: true            # 让 Flink 统一管,默认即可
state.backend.rocksdb.memory.fixed-per-slot: 256mb    # 每 Slot 给 RocksDB 多少堆外

# 写入相关
state.backend.rocksdb.writebuffer.size: 64mb          # MemTable 大小,大 → 写吞吐高
state.backend.rocksdb.writebuffer.count: 4

# Compaction
state.backend.rocksdb.compaction.style: LEVEL         # LEVEL 适合状态读写均衡
state.backend.rocksdb.thread.num: 4                   # 后台 compaction 线程

# 本地存储路径(强烈建议挂 SSD)
state.backend.rocksdb.localdir: /mnt/ssd1,/mnt/ssd2   # 多盘可分散 IO
```

**踩坑提醒**:

- **本地用 HDD 跑 RocksDB 是灾难**——LSM-Tree 的 compaction 是大量随机 IO,HDD 直接卡死
- **K8s 上用 emptyDir(走宿主机磁盘)而不是 PVC**——RocksDB 是 cache,挂了重建即可,持久化交给 checkpoint

---

## 六、增量 Checkpoint:RocksDB 专属神器

### 6.1 没增量的痛

HashMap 状态后端的 Checkpoint 流程:

```
触发 Checkpoint N:
  1. 算子拿到 Barrier
  2. 把整个 HashMap 序列化
  3. 写到 S3:s3://.../chk-N/state-xxx.bin
  4. 算子向 JM ack

50 GB 状态 → 每次 Checkpoint 写 50 GB → 1 分钟 interval 根本完不成
```

**问题**:**每次都全量上传**,状态稍微大一点就跟不上。

### 6.2 增量 Checkpoint 的核心点

RocksDB 的 SSTable **永远不可变**——一旦写到磁盘,内容永远不变,只可能被 compaction 合并掉(从而被删除)。这给增量 checkpoint 提供了天然结构:

```
Checkpoint N:
  本地 RocksDB SSTable 清单:[A.sst, B.sst, C.sst]
  上传:把 A、B、C 都传到 S3

Checkpoint N+1:
  本地 RocksDB 又写了:[A.sst, B.sst, C.sst, D.sst, E.sst]
                       (旧 SSTable 都没变,新增了 D 和 E)
  增量上传:只传 D 和 E
  metadata 记录:本次 checkpoint 引用 [A, B, C, D, E](其中 A B C 在 N 已上传)

Compaction 合并掉 A B 变成 X.sst:
  本地 RocksDB:[C, D, E, X]
  Checkpoint N+2:
  增量上传:只传 X
  metadata 记录:[C, D, E, X]
```

**收益**:50 GB 状态、新增 100 MB 数据/分钟,**Checkpoint 实际上传只有 100 MB**——几秒完成。

```yaml
state.backend.incremental: true     # 必开,RocksDB 后端的灵魂配置
```

**踩坑**:增量 Checkpoint 的 metadata 引用了 N 个历史 SSTable,**checkpoint 之间形成依赖链**——保留最近 1 个 checkpoint 时,最老的 SSTable 仍然不能删。**这就是为什么 Flink 默认保留多个 checkpoint(默认 1 个,生产建议 3-5 个),而不是只保留最新**。

### 6.3 大状态作业的稳定性套餐

```yaml
# 三件套:大状态作业的标准配置
state.backend: rocksdb
state.backend.incremental: true
execution.checkpointing.unaligned: true   # 反压时也能完成 checkpoint

# 给 checkpoint 留余量
execution.checkpointing.timeout: 15min
execution.checkpointing.tolerable-failed-checkpoints: 5
execution.checkpointing.min-pause: 30s    # 两次 checkpoint 之间最少休 30 秒
```

---

## 七、状态 TTL:不配它的 job 一定爆盘

### 7.1 状态膨胀的真实事故模板

**场景一**:用户行为去重表

```java
private MapState<String, Boolean> seenUsers;

void processElement(Event evt, ...) {
    if (seenUsers.contains(evt.getUserId())) return;   // 去重
    seenUsers.put(evt.getUserId(), true);
    out.collect(evt);
}
```

跑了 3 个月,用户量 1 亿,**MapState 里挤了 1 亿 key**。RocksDB 几十 GB,Compaction 跟不上,读延迟暴涨,**checkpoint 反复超时**。

**场景二**:双流 Join 等永远不来的另一边

```java
// 订单流 Join 支付流,等 30 分钟
stream1.keyBy(Order::getOrderId)
       .intervalJoin(stream2.keyBy(Pay::getOrderId))
       .between(Time.minutes(-30), Time.minutes(30))
       .process(...);
```

如果支付流偶尔丢消息,部分订单的状态**永远等不到对应的支付**,在窗口内一直占着内存。

### 7.2 StateTtlConfig:必配

```java
StateTtlConfig ttlConfig = StateTtlConfig
    .newBuilder(Time.days(7))                                  // TTL 7 天
    .setUpdateType(UpdateType.OnCreateAndWrite)                // 写时刷新 TTL
    .setStateVisibility(StateVisibility.NeverReturnExpired)    // 过期立即不可见
    .cleanupInRocksdbCompactFilter(1000)                       // RocksDB compact 时清理
    .build();

ValueStateDescriptor<Long> desc = new ValueStateDescriptor<>("count", Long.class);
desc.enableTimeToLive(ttlConfig);
```

**关键参数**:

- **`Time.days(7)`**:状态多久没更新就过期——根据业务场景定
- **`OnCreateAndWrite`**:每次写都重置 TTL(适合 hot key 不希望被清理)
  - 对比 `OnReadAndWrite`:读也会重置(适合"最近被访问就保留")
- **`cleanupInRocksdbCompactFilter`**:RocksDB 的 compaction 过程顺手清掉过期数据——**生产必开**,否则过期状态在 RocksDB 里变成"僵尸 SSTable",不被读但占盘
- **`NeverReturnExpired`**:state.value() 时如果过期,直接返回 null,即使 RocksDB 物理上还没清

### 7.3 SQL 里的 TTL

```sql
SET 'table.exec.state.ttl' = '7 d';
```

Flink SQL 全局 TTL 配置——所有状态算子(GROUP BY、JOIN、窗口)的状态默认 7 天清。

**这一行不加,长跑 SQL 任务必爆盘**——是 SQL 流处理工程师的第一红线。

### 7.4 业务侧水位线

某些场景 TTL 也救不了——比如双流 Join 等不到的一边可能有合理的"我等到这个时间就放弃"的业务语义:

```java
// processElement 时启动定时器
ctx.timerService().registerEventTimeTimer(evt.getTimestamp() + 30 * 60 * 1000);

// 定时器触发时清掉相关状态
public void onTimer(long timestamp, OnTimerContext ctx, Collector<Out> out) {
    // 业务侧主动清理:状态 + 输出"未匹配"事件
    pendingState.clear();
    out.collect(new UnmatchedRecord(...));
}
```

**经验法则**:**TTL 是兜底,定时器是业务表达**——两者不冲突,大状态作业两个都用。

---

## 八、Savepoint 的 Schema 演进:能改什么不能改什么

升级 Flink job 时,常见诉求:加一个字段、改算子、改并行度。**Savepoint 的格式决定了哪些改动安全**。

### 8.1 安全改动

| 改动 | 安全性 |
|---|---|
| 改 job 并行度 | 安全(Keyed State 自动 rescale) |
| 给 POJO 状态加字段 | 安全(默认值填补) |
| 加新算子 | 安全(新算子 state 为空) |
| 改非 state 相关的逻辑 | 安全 |

### 8.2 危险改动

| 改动 | 风险 |
|---|---|
| 删 POJO 字段 | **严重**——序列化器变化,旧状态读不出来 |
| 改字段类型(int → long) | **严重**——同上 |
| 删算子 | 该算子的 state 丢失(可加 `--allowNonRestoredState`) |
| 改 state 名字 | 旧 state 找不到,等于丢 |
| 算子 UID 没显式指定 | **致命**——算子 UID 默认根据拓扑生成,加个算子整张图 UID 全变,所有 state 全丢 |

### 8.3 必做工程纪律

```java
// 所有有状态算子必须显式指定 UID
stream
    .keyBy(...)
    .process(new MyProcessFunction())
    .uid("user-aggregator-v1")           // 必加
    .name("UserAggregator");
```

**为什么必须**:UID 是 Savepoint 里 state 的"身份"。不指定时 Flink 自动生成,**任何拓扑改动都会改变自动生成的 UID,state 全部认不出来**。

**升级流程**(Flink 1.18+ 推荐):

```bash
# 1. 触发 Savepoint
flink savepoint <jobId> s3://savepoints/

# 2. 停 job
flink cancel <jobId>

# 3. 部署新版本(jar 改了)

# 4. 从 Savepoint 启动
flink run -s s3://savepoints/savepoint-xxx -d new-job.jar

# 如果删了某些算子:加 --allowNonRestoredState
flink run -s ... --allowNonRestoredState -d new-job.jar
```

K8s Operator 的 `upgradeMode: savepoint` 会自动跑这个流程——**生产 Flink 别手撸,用 Operator**。

---

## 九、工程落地:RocksDB + S3 配置 + 一段 ValueState 实例

### 9.1 flink-conf.yaml 关键 8 行

```yaml
state.backend: rocksdb
state.backend.incremental: true
state.checkpoints.dir: s3://flink-checkpoints/order-stream
state.savepoints.dir: s3://flink-savepoints/order-stream
state.backend.rocksdb.memory.managed: true
state.backend.rocksdb.memory.fixed-per-slot: 256mb
state.backend.rocksdb.localdir: /mnt/ssd/flink-rocksdb
table.exec.state.ttl: 7 d
```

### 9.2 一段用 ValueState 的简单聚合

业务:每个用户最近 1 小时的累计交易额,超过 10 万元报警。

```java
public class UserSpendAlert extends KeyedProcessFunction<String, Tx, Alert> {
    private transient ValueState<Double> totalSpend;
    private transient ValueState<Long> windowStart;

    @Override
    public void open(Configuration cfg) {
        StateTtlConfig ttl = StateTtlConfig
            .newBuilder(Time.hours(2))                      // 比窗口长一点
            .cleanupInRocksdbCompactFilter(1000)
            .build();

        ValueStateDescriptor<Double> spendDesc = new ValueStateDescriptor<>("spend", Double.class);
        spendDesc.enableTimeToLive(ttl);
        totalSpend = getRuntimeContext().getState(spendDesc);

        windowStart = getRuntimeContext().getState(
            new ValueStateDescriptor<>("win-start", Long.class));
    }

    @Override
    public void processElement(Tx tx, Context ctx, Collector<Alert> out) throws Exception {
        long now = ctx.timestamp();
        Long start = windowStart.value();

        // 1 小时窗口起点过期 → 重置
        if (start == null || now - start > 3600_000) {
            totalSpend.update(tx.getAmount());
            windowStart.update(now);
        } else {
            totalSpend.update(totalSpend.value() + tx.getAmount());
        }

        if (totalSpend.value() > 100_000) {
            out.collect(new Alert(ctx.getCurrentKey(), totalSpend.value()));
        }
    }
}
```

**几个工程要点**:

1. **state 在 `open()` 里初始化**——不能在 processElement 里 new
2. **TTL 必须配** + `cleanupInRocksdbCompactFilter` 必须开
3. **`transient` 是必须的**——state 不能被 Java 序列化,Flink 自己管

---

## 十、替代方案与局限

### 10.1 无状态算子直接堆

如果计算本身无状态(过滤、enrich 调外部 API),根本不需要 StateBackend——`MemoryStateBackend` 都是过度配置。**这种 job 几百 KB 的元数据 checkpoint 几乎瞬间完成**。

### 10.2 状态极大且查询型 → 走外部 KV

**Flink 状态适合**:每条事件都需要读写、按 key 分布、生命周期受控。

**Flink 状态不适合**:

- **TB 级"全量数据"做"少量查询"**——比如 100 GB 用户画像表,每次事件来查一次 → 用 Async I/O 查外部 Redis/HBase
- **跨 job 共享**——Flink 状态是 job 私有,跨 job 用要走外部存储
- **需要任意 key 范围扫描**——Flink 状态接口主要是点查 + 局部范围,大范围扫描不擅长

```java
// Async I/O 模式:查外部 KV 而不是放进 state
AsyncDataStream.unorderedWait(
    inputStream,
    new RedisLookupFunction(),
    1000, TimeUnit.MILLISECONDS,
    100                                       // 最多 100 个并发请求
);
```

### 10.3 Operator 状态后端的局限

不论 HashMap 还是 RocksDB,**单 SubTask 的状态都受单机磁盘/内存限制**。状态超过 1 TB 时:

- 单 TaskManager 的 SSD 装不下 → 必须扩并行度让状态分散
- Compaction 跟不上 → 写入吞吐降到无法接受
- Checkpoint 即便增量也得几十秒——业务对延迟敏感时不可接受

**这种规模通常意味着架构要换**——比如把"全量历史"放外部 OLAP/KV,Flink 只处理活跃热点。

### 10.4 不要碰的反模式

1. **把状态当数据库**——Flink state 不能跨 job 查、不能做范围扫描、没有事务
2. **存 BLOB 类大对象**——状态里塞 5 MB 的 JSON,序列化成本爆炸
3. **状态 schema 跟着业务每周迭代**——Savepoint 兼容性会拖死团队

---

## 十一、踩坑提醒

1. **不配 TTL**:跑 3 个月爆盘,这是 Flink 生产事故第一名
2. **TTL 不开 `cleanupInRocksdbCompactFilter`**:状态过期但物理不清,RocksDB 越来越大
3. **算子没指定 UID**:任何拓扑改动 → Savepoint 全部状态失效
4. **本地用 HDD 跑 RocksDB**:Compaction 直接拖死,IO 100%
5. **不开增量 checkpoint**:大状态作业 checkpoint 永远超时
6. **K8s 上 RocksDB 路径放 PVC**:慢 + 浪费,emptyDir 即可
7. **删 POJO 字段不走兼容序列化器**:Savepoint 恢复直接读不出来
8. **state.backend 还在用旧名字**(MemoryStateBackend / FsStateBackend / RocksDBStateBackend):1.13+ 已弃用,用 HashMapStateBackend / EmbeddedRocksDBStateBackend
9. **ValueState 包大对象**:能用 ListState/MapState/ReducingState 就别用 ValueState 包
10. **改并行度直接改 yaml 重启**:Keyed State 重分片要 Savepoint 中转,直接改触发全量 rescale 慢且危险

---

## 十二、心智总结

```
状态原语:
  ValueState     单值
  ListState      列表(追加廉价)
  MapState       键值对(单 entry 操作廉价)
  Reducing/Aggregating  增量聚合,不存中间值

状态范围:
  Keyed State    99% 场景,按 key 分片,可 rescale
  Operator State 元数据级,Kafka offset 这类

StateBackend:
  HashMap        堆内,小状态,GC 压力
  RocksDB        堆外 LSM-Tree,大状态默认,序列化开销

Checkpoint:
  增量必开       RocksDB 才有,大状态作业生命线
  Unaligned 必开  反压时也能完成
  保留多份       默认 1 份太险,生产 3-5 份

状态 TTL:
  StateTtlConfig + cleanupInRocksdbCompactFilter
  SQL: table.exec.state.ttl
  业务侧定时器作为补充

Savepoint 升级:
  所有有状态算子显式 UID
  字段加可以,字段删危险
  K8s Operator upgradeMode: savepoint 自动化

四条工程纪律:
  1. RocksDB + 增量 + Unaligned 是大状态作业的标配三件套
  2. 任何长跑流任务必配 TTL,否则注定爆盘
  3. 所有有状态算子显式指定 UID,Savepoint 才能升级
  4. 本地存储必须 SSD,emptyDir + S3 checkpoint 是 K8s 标配
```

如果你只能记住一句话:**Flink 状态后端是把 RocksDB 嵌在算子里的小型存储引擎——TTL 决定状态会不会爆,增量 checkpoint 决定大状态能不能扛,UID 决定能不能升级**。这三件事任意一件做错,Flink 生产作业的稳定性就垮了。

---

下一篇:`22-流批一体的真相.md`,把 Flink SQL、Spark Structured Streaming 这两套"统一批流"的尝试摆到台面对比——它们各自宣称的"一份代码跑批和流"在工程上到底成立到什么程度、为什么 2025 年大多数团队仍然有两套链路、湖仓 + Iceberg 出现后流批一体的边界又往哪挪了。
