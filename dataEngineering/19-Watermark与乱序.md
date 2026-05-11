# Watermark 与乱序:事件时间 / 水位线 / Late Event / Allowed Lateness

18 讲流处理心智时,把"事件时间(Event Time)"和"窗口"作为基本盘点了一句:**用事件自带的时间戳,而不是消息到达系统的时间,才能算出业务真正想要的结果**。这一篇把那一句拆开——**为什么仅有事件时间还不够、Flink 凭什么知道"5 分钟窗口可以触发了"、迟到的事件该怎么办**。

> 一句话先记住:**Watermark 不是"系统当前时间",是"用户向系统打的一个承诺"——我宣告:Event Time ≤ T 的事件应该都来了,你可以触发 T 之前的窗口、释放它的状态了**。承诺得越激进(乱序容忍度越小),延迟越低、丢数越多;承诺得越保守,延迟越高、结果越完整。**这条延迟 vs 完整性的取舍曲线,就是流处理工程师每天在调的旋钮**。

---

## 一、没有 Watermark 的世界:5 分钟窗口什么时候触发

### 1.1 一个具体场景

假设你在算"每 5 分钟的活跃用户数",窗口 `[12:00, 12:05)`。事件流从 Kafka 进来,每条事件长这样:

```json
{ "user_id": "u123", "event_time": "12:03:17", "action": "click" }
```

这里有两条独立的时间轴:

```
事件时间 (Event Time)        — 事件自己说的"我什么时候发生"
                               (App 端打的时间戳、CDC 的 commit 时间)

处理时间 (Processing Time)   — 这条事件被 Flink 算子看到的墙上时钟
                               (取决于网络、Kafka 积压、消费者位置)
```

**两者从来不一致**。一条 12:00:30 发生的点击,可能因为手机在地铁里掉线,12:08:45 才被上报到 Kafka,12:09:02 才被 Flink Source 读到。

### 1.2 用处理时间触发会怎样

最朴素的方案:**到 12:05 这个墙上时间,我就把 `[12:00, 12:05)` 窗口的累计结果输出**。

```
处理时间 ────●──────────────●──────────●─────────────●──────────────►
            12:00          12:05      12:08         12:10

事件 A      [evt_time=12:03] 在 12:04 到达      ← 进窗口,OK
事件 B      [evt_time=12:04] 在 12:08 到达      ← 窗口已经在 12:05 触发了,丢
事件 C      [evt_time=12:02] 在 12:10 到达      ← 也丢了
事件 D      [evt_time=12:07] 在 12:06 到达      ← 这条事件应该进 [12:05,12:10) 窗口
                                                  但被算到 [12:05,12:10) 是按到达时间分的
                                                  纯属凑巧对了
```

两个致命问题:

1. **迟到的事件全丢**——B 和 C 明明在 `[12:00, 12:05)` 范围内发生,但系统用墙上时间触发,12:05 之后到的全部不算
2. **结果跟"到达顺序"绑死**——同一份数据在网络抖动、Kafka 重启、消费者重平衡之后,跑出的结果完全不同。**流处理最怕的就是"结果不可复现"**

### 1.3 用事件时间触发,问题变成另一个

那就用事件时间分窗口呗——事件 B 的 evt_time=12:04,理应进 `[12:00, 12:05)`。

可是新问题出来了:**Flink 怎么知道"12:04 那个窗口可以触发了"**?

```
理想做法:等到"未来不会再有 evt_time < 12:05 的事件"时,就触发窗口

现实问题:Flink 怎么知道未来没有了?
         如果再过 1 小时来一条 evt_time=12:04 的事件呢?
         那是不是要永远等下去?
```

**这就是 Watermark 要回答的问题**——给 Flink 一个"判断未来"的依据。

---

## 二、Watermark 是什么:用户对乱序程度的承诺

### 2.1 定义

Watermark 是一条**插在数据流里的特殊标记**,值是一个时间戳 `W(t)`,语义如下:

> **算子收到 `W(t)` 之后,就把它当成"承诺":Event Time ≤ t 的事件应该都已经来过了,之后再来 evt_time ≤ t 的事件,叫做迟到事件(Late Event)**。

```
数据流(从 Source 到下游算子):

  ───●───●───●───◆───●───●───◆───●───●───►
     evt evt evt W(t1) evt evt W(t2) evt evt
                  └─承诺:evt_time ≤ t1 的都来过了

收到 W(t1) 时,算子就知道:可以触发所有 end_time ≤ t1 的窗口了
```

**关键认知**:

- Watermark 是**用户告诉系统**的,不是系统自己算出来的
- "应该都来过了"是个**承诺,不是事实**——承诺错了就有迟到事件
- 承诺得越激进(允许的乱序越小),触发越早、迟到越多
- 承诺得越保守(允许的乱序越大),触发越晚、迟到越少

### 2.2 时间线图:Watermark 怎么跟着事件流前进

假设我们承诺"乱序不超过 10 秒",来看一段事件流:

```
Event Time 轴(事件自己说的时间)
12:00:00         12:00:10         12:00:20         12:00:30
 │                │                │                │
 ●────●─────────●──●────●─────●───●──●─────●─────●──►
 12:00:02       12:00:09 12:00:11 12:00:18  12:00:25
   12:00:05               12:00:14    12:00:22

Watermark 的计算(承诺乱序 ≤ 10 秒):
  看到最大 evt_time = 12:00:25 时
  → W = 12:00:25 - 10s = 12:00:15
  → 意味着"evt_time ≤ 12:00:15 的事件应该都到齐了"
  → 触发所有 end_time ≤ 12:00:15 的窗口

然后又来一条 evt_time=12:00:14 的事件:
  → 这条已经迟到(因为 W 已经是 12:00:15),进入迟到处理通道
```

```
Processing Time 轴(墙上时钟,事件实际到达的时间)
12:08:00         12:08:30         12:09:00         12:09:30
 │                │                │                │
 ●────●─────────●──●────●─────●───●──●─────●─────●──►
 evt(12:00:02)        evt(12:00:09)      evt(12:00:14) ← 在 W=12:00:15 之后才到
       evt(12:00:05)              evt(12:00:11)            按承诺它本不该来了
                evt(12:00:18)         evt(12:00:25)        但还是来了 → 迟到事件

观察:Event Time 轴上的"前后",在 Processing Time 轴上完全乱序
     乱序的根因:网络抖动、客户端缓存上传、Kafka 分区不均、消费者重启
```

**Watermark 的本质**:把"等多久才安全"这个开放问题,**变成"我承诺等 10 秒"这个工程决策**。

### 2.3 Watermark 在算子之间怎么传

```
                  ┌──────────┐
Source 1 ──W=100→ │          │
                  │  Window  │── 取所有上游 Watermark 的最小值 ──W=80→ 下游
Source 2 ──W=80 → │  Operator│
                  └──────────┘
```

**多输入算子取最小值**——任何上游说"我这边可能还有 evt_time=80 的事件",整个下游就不能宣告 100 之前已到齐。

**这条规则在 Join 场景非常致命**:左流水位 100、右流水位 80,Join 算子只能用 80 触发,**慢的一边拖快的一边**。后面 21 讲状态时会再提——慢源没数据但也不打 Watermark,会让所有缓存的 Join 状态永远释放不掉。

---

## 三、三种 Watermark 生成策略

### 3.1 Bounded Out-of-orderness:最常用的 99%

```java
// DataStream API
WatermarkStrategy
    .<Event>forBoundedOutOfOrderness(Duration.ofSeconds(10))
    .withTimestampAssigner((event, ts) -> event.getEventTime());
```

```sql
-- Flink SQL DDL
CREATE TABLE clicks (
    user_id STRING,
    event_time TIMESTAMP(3),
    WATERMARK FOR event_time AS event_time - INTERVAL '10' SECOND
) WITH (
    'connector' = 'kafka',
    ...
);
```

语义:**Watermark = 当前看到的最大 evt_time - 10 秒**。

`10 秒`这个数,是**你对业务乱序程度的判断**:

- 客户端事件(手机 / Web):**看 P99 延迟**,通常 30 秒到几分钟
- Kafka CDC(数据库变更):很整齐,**1-5 秒**就够
- IoT 设备(可能离线再批量上传):**几分钟到几小时**,或者干脆走批处理

**调小这个值的代价**:更多迟到事件;**调大的代价**:窗口触发延迟,内存里挂的状态更多。

### 3.2 Monotonous Timestamps:严格有序时

```java
WatermarkStrategy
    .<Event>forMonotonousTimestamps()
    .withTimestampAssigner((event, ts) -> event.getEventTime());
```

等同于 `forBoundedOutOfOrderness(Duration.ZERO)`——**承诺事件严格有序**,Watermark 就是当前最大 evt_time。

什么场景能用:

- **单分区 Kafka Topic** 且生产者只有一个,且按时间顺序发——比如某些机器日志
- **CDC 单表的 binlog** 在源头是有序的(但跨分区/跨表后通常就乱了)

**99% 的真实场景不要用这个**——一旦有任何乱序,事件直接迟到,无救。

### 3.3 Punctuated:每条事件单独打

```java
public class PunctuatedGenerator implements WatermarkGenerator<Event> {
    @Override
    public void onEvent(Event event, long ts, WatermarkOutput output) {
        if (event.hasWatermarkMark()) {                         // 事件本身带标记
            output.emitWatermark(new Watermark(event.getEventTime()));
        }
    }

    @Override
    public void onPeriodicEmit(WatermarkOutput output) { }       // 周期性不发
}
```

罕见——只有当**事件流本身就携带"checkpoint 标记"**时才用,例如某些特殊 CDC 协议每隔 N 条插一个标志。**默认走 Bounded Out-of-orderness 即可,不要为了"看起来精确"切到 Punctuated**。

---

## 四、迟到了怎么办:Allowed Lateness 与 Side Output

承诺总会出错。**承诺 10 秒乱序,实际有一条事件迟到了 30 秒**——它来到下游窗口算子时,窗口已经触发并释放状态了,这条事件该怎么办?

Flink 给了三层处理:

```
              到达时 evt_time vs Watermark
                       │
                       ▼
    ┌──────────────────────────────────────┐
    │ evt_time > W ? 不迟到,正常进窗口    │
    └──────────────────────────────────────┘
                       │
                  evt_time ≤ W
                       ▼
    ┌──────────────────────────────────────┐
    │ Allowed Lateness 内 (默认 0)         │
    │ → 窗口状态还没释放,补算并触发更新    │
    └──────────────────────────────────────┘
                       │
              超出 Allowed Lateness
                       ▼
    ┌──────────────────────────────────────┐
    │ Side Output 配置了吗?               │
    │ → 配了:进侧路 stream                │
    │ → 没配:直接丢                      │
    └──────────────────────────────────────┘
```

### 4.1 Allowed Lateness:窗口的"宽限期"

```java
DataStream<Result> result = stream
    .keyBy(Event::getUserId)
    .window(TumblingEventTimeWindows.of(Time.minutes(5)))
    .allowedLateness(Time.minutes(1))                            // 多等 1 分钟
    .sideOutputLateData(lateTag)                                 // 超过 1 分钟的进侧路
    .aggregate(new CountAgg());
```

语义:**窗口在 Watermark 跨过 end_time 时第一次触发,但状态再保留 1 分钟**——这 1 分钟内有迟到事件,窗口被重新触发,**下游收到一个更新后的结果**。

**代价**:下游必须能处理"同一个 key 收到多次结果"——所以一般配合 upsert 写入(Iceberg / Hudi / 数据库)。如果下游是 Append-Only(Kafka topic),你就会得到两条记录,得自己去重。

### 4.2 Side Output:超期事件别丢

```java
OutputTag<Event> lateTag = new OutputTag<Event>("late-events"){};

// 主流程
DataStream<Result> result = ... .sideOutputLateData(lateTag) ...;

// 拿侧路流单独处理(写到对账表、报警、批处理补算)
DataStream<Event> lateStream = result.getSideOutput(lateTag);
lateStream.addSink(new IcebergSink("late_events_audit"));
```

**真实工程意义**:监控"我承诺的 Watermark 是否合理"——

- 侧路流量 < 0.01%:Watermark 合理
- 侧路流量 1-5%:可以容忍,但要审计这部分对业务的影响
- 侧路流量 > 5%:**Watermark 设错了,把延迟调大**

很多团队的"实时大屏"和"次日批补算"两套链路,就是这么共存的——大屏用 Watermark + Allowed Lateness 给个"近实时"结果,T+1 批跑用全量数据修正最终值。

---

## 五、四个真实工程坑

### 5.1 Watermark 卡住:某分区没数据

**现象**:任务跑着跑着,Flink UI 上的 Watermark 突然不前进了,所有窗口都不触发。

**根因**:Source 的某个并行实例分配到的 Kafka 分区**没有新数据**,而 Watermark 算子取所有上游的 min,**整体被这个空闲分区拖死**。

```java
WatermarkStrategy
    .<Event>forBoundedOutOfOrderness(Duration.ofSeconds(10))
    .withIdleness(Duration.ofMinutes(1));                        // 关键
```

`withIdleness(1分钟)`:**1 分钟没数据的分区,Watermark 算子直接忽略它**。下游的 Watermark 重新由活跃分区驱动。

**这一行不加,Flink 任务在低峰时段(夜里)经常卡死**——是流处理工程师必踩的第一坑。

### 5.2 Watermark 过激进:大量数据进侧路

**现象**:线上跑得好好的,某天客户端发版后,侧路流量从 0.1% 暴增到 30%。

**根因**:新版客户端引入了"离线缓存上传"——用户在地铁里点了一堆事件,出地铁后批量上传,**evt_time 是几小时前的**。Watermark 设的 10 秒乱序根本撑不住。

**修法**:

1. 短期:把 Watermark 调到 30 分钟,Allowed Lateness 给 1 小时
2. 长期:**离线累积的数据走批处理链路**,流处理只处理"活跃用户"的实时事件

**铁律**:**Watermark 是对"正常态乱序"的承诺,不是对"所有可能事件"的承诺**。极端尾部数据交给批处理。

### 5.3 多源 Join:慢源拖快源

**现象**:用 Flink 做"订单流 Join 用户画像流",订单流每秒几万条,画像流每天才更新一次。Join 结果的 Watermark 永远停在画像流的水位上,**所有窗口都不触发**。

**修法**:

- 画像流不应该走 Flink Stream Join——应该当成**Lookup Source(查表)**或**Broadcast State(广播状态)**
- 真要 Stream Join 两条流,**给慢的那条加 `withIdleness`**,让它在没事时不拖累快流

**心智**:**Flink 的"双流 Join"假设两条流速率接近**——一快一慢的场景,要重新设计架构。

### 5.4 Watermark 跳跃:乱序里有"未来时间"

**现象**:某天 Watermark 突然从 12:00 跳到 23:59,所有窗口被一次性触发。

**根因**:有客户端时钟不准,发了一条 evt_time = 23:59 的事件。`forBoundedOutOfOrderness` 取的是"已见过的最大 evt_time",**被一条脏数据带坏了**。

**修法**:Source 后加一层过滤——`if (evt_time > now() + 5min) drop`。**未来时间的事件直接丢**,不让它影响 Watermark。

---

## 六、Flink SQL 完整工程示例

业务:每 5 分钟统计活跃用户数,容忍 30 秒乱序,迟到 1 分钟内补算,超期事件落审计表。

```sql
-- Source: Kafka 点击流,带 Watermark 定义
CREATE TABLE clicks (
    user_id STRING,
    event_time TIMESTAMP(3),
    page STRING,
    WATERMARK FOR event_time AS event_time - INTERVAL '30' SECOND
) WITH (
    'connector' = 'kafka',
    'topic' = 'click-events',
    'properties.bootstrap.servers' = 'kafka:9092',
    'format' = 'json',
    'scan.startup.mode' = 'latest-offset'
);

-- Sink: 写到 Iceberg(支持 upsert,Allowed Lateness 重新触发时覆盖)
CREATE TABLE active_user_5min (
    window_start TIMESTAMP(3),
    window_end TIMESTAMP(3),
    active_users BIGINT,
    PRIMARY KEY (window_start) NOT ENFORCED
) WITH (
    'connector' = 'iceberg',
    'catalog-name' = 'hive_catalog',
    ...
);

-- 主聚合:Tumbling Window + Allowed Lateness
INSERT INTO active_user_5min
SELECT
    window_start,
    window_end,
    COUNT(DISTINCT user_id) AS active_users
FROM TABLE(
    TUMBLE(TABLE clicks, DESCRIPTOR(event_time), INTERVAL '5' MINUTES)
)
GROUP BY window_start, window_end;

-- Allowed Lateness 在 Flink SQL 里通过 table.exec.emit.late-fire 配置:
SET 'table.exec.emit.late-fire.enabled' = 'true';
SET 'table.exec.emit.late-fire.delay' = '1 min';
```

侧路输出在 SQL 里目前不直接支持,要走 DataStream API。**但日常 90% 的流处理,SQL + Watermark DDL + late-fire 配置就够了**。

---

## 七、替代方案与局限

### 7.1 Trigger:基于其他条件触发

Flink 窗口的触发机制是 **Trigger**,默认 `EventTimeTrigger` 即"Watermark 跨 end_time 时触发"。但 Trigger 是可换的:

```java
.trigger(CountTrigger.of(100))            // 每 100 条事件触发一次
.trigger(ProcessingTimeTrigger.create())  // 用墙上时间触发(放弃事件时间)
.trigger(new CustomTrigger(...))          // 自己写:水位 OR 数量 OR 处理时间
```

什么时候用 Trigger 替代 Watermark:

- **大屏要尽快出数**——不等 Watermark,每 10 秒输出一次中间结果(`ContinuousProcessingTimeTrigger`)
- **风控场景**——攒够 100 条就出一次,数量重于时间正确性

**但 Trigger ≠ 替代 Watermark**——Watermark 控制的是**状态什么时候释放**,Trigger 控制的是**结果什么时候输出**。两个旋钮。激进 Trigger 可以多次输出中间结果,Watermark 还是必须最终前进,否则状态永远释放不掉。

### 7.2 Spark Structured Streaming 的水位线

Spark 也有 Watermark,但模型更简单:`withWatermark("event_time", "10 minutes")`,语义类似 `forBoundedOutOfOrderness(10min)`。**不支持 per-source 配置 idle、不支持 Side Output、Allowed Lateness 隐式由水位决定**。

差别本质:**Spark Structured Streaming 是微批,Watermark 在每个 micro-batch 边界上重算**;Flink 是事件驱动,Watermark 是数据流里的特殊事件,**两种调度模型决定了表达力差异**。22 会展开。

### 7.3 没有 Watermark 行不行

行——**所有"摄入时间(Ingestion Time)"或"处理时间"语义的窗口**,都不需要 Watermark。比如:

- "每 1 分钟统计一次本机收到的请求数"——处理时间窗口,不关心事件本身的时间戳
- "Kafka 进来 100 万条就触发一次"——Count Window,不关心时间

**但只要业务回答"用户在 12:00-12:05 之间做了什么",就必须 Event Time + Watermark**——这是流处理无法绕过的正典。

### 7.4 Watermark 模型的根本局限

**Watermark 假设乱序是有界的**。真实世界里:

- App 卸载后 3 个月,用户重装登录,旧版本缓存的事件被上传——**乱序无界**
- 历史数据回灌(backfill)——evt_time 在 1 年前,Watermark 模型直接崩溃

**这些场景不要硬上 Watermark**——回灌走批处理,极端尾部数据走 T+1 修正。**流处理负责 99% 的近实时,批处理负责 100% 的最终正确**——这就是 Lambda 架构存在的根因(04 讲过)。

---

## 八、踩坑提醒

1. **空闲分区不开 idle**:夜里 Watermark 卡住,所有窗口不触发——`withIdleness(1min)` 必加
2. **Watermark 设太小**:看似"低延迟",实际大量数据进侧路或被丢——必须监控侧路流量
3. **Watermark 设太大**:状态膨胀、内存压力,窗口结果延迟严重
4. **未来时间 evt_time 没过滤**:一条脏数据把 Watermark 拉到天上,所有窗口被一次性触发
5. **多源 Join 慢源没 idle**:慢源拖死整个 Watermark,Join 永远不触发
6. **Allowed Lateness 不配 upsert sink**:同一窗口多次触发,下游收到重复结果
7. **以为 Watermark 是系统时间**:Watermark 是用户承诺,不是 `System.currentTimeMillis()`,设错了系统不会报错
8. **回灌历史数据用流处理**:evt_time 在过去,Watermark 模型完全错位——回灌走批

---

## 九、心智总结

```
Event Time      事件自己说的时间    业务真正想要的口径
Processing Time 算子看到的墙上时钟  跟业务无关,只跟系统状态有关
Watermark       用户对乱序的承诺    "evt_time ≤ T 应该都到了,可以触发了"

三种生成策略:
  Bounded Out-of-orderness  日常 99%,设个合理的乱序界
  Monotonous                严格有序,极少
  Punctuated                事件本身带标记,极少

迟到事件三层处理:
  正常窗口期内       直接进窗口
  Allowed Lateness   补算 + 触发更新结果
  超期               Side Output 落审计 / 直接丢

四条工程纪律:
  1. forBoundedOutOfOrderness + withIdleness 是默认起点
  2. 监控侧路流量,> 1% 就要审 Watermark 设置
  3. 多源 Join 慢源必须 idle,否则永远不触发
  4. 回灌 / 极端尾部 → 批处理,不要硬塞流处理
```

如果你只能记住一句话:**Watermark 是承诺,不是观测——你承诺多激进,系统就多激进,代价由你的业务承担**。

---

下一篇:`20-Flink架构.md`,讲清楚 JobManager 的三件套(Dispatcher / JobMaster / ResourceManager)和 TaskManager 的 Slot 模型——一段 SQL 怎么变成物理 DAG 跑在集群上,Checkpoint 的 Barrier 怎么穿过算子,失败时怎么从最近一个 Checkpoint 拉回状态;以及为什么 Application 模式是 K8s 上的事实标准、Per-Job 模式被 Flink 1.15 弃用的原因。
