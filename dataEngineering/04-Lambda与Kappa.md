# Lambda 与 Kappa:批流分离、批流一体、与现实里的混合架构

2011 年 Nathan Marz 出了《Big Data》,提出 Lambda 架构:**批层 + 速度层 + 服务层**——这套思想统治了大数据圈快十年。2014 年 Jay Kreps(Kafka 作者)写了《Questioning the Lambda Architecture》,提出 Kappa:**只要流就够了,批是流的特例**——又掀起一波改造。十年过去,大公司用的既不是纯 Lambda 也不是纯 Kappa,而是**「Flink 流 + Iceberg 时间旅行 + dbt 批」的混合架构**。这一篇讲清楚这两套范式的来龙去脉,以及为什么「流批一体」这个口号 2025 年仍在路上。

> 一句话先记住:**Lambda 用「同一份业务跑两套代码」换得「批层兜底正确」**,Kappa 用「只跑流」换得「代码统一」。**两者都没完美兑现承诺**——Lambda 死于「两套代码维护成本」,Kappa 死于「流引擎扛不动大批量回算」。**真实工程是混合架构**:实时关键链路走 Flink,大批量历史走 Spark/dbt,Iceberg 做事实源,两侧读同一份数据。

---

## 一、为什么会有「Lambda」这套东西

### 1.1 2010 年的工程困境

那时候的世界:
- Hadoop / MapReduce 跑离线,延迟天级,代码用 Java MR 写
- 实时需求出现(广告点击实时归因、推荐特征实时更新、风控秒级判断)
- 当时的流处理:Storm(2011),保证 At Least Once,**有重复 / 顺序问题**
- 离线和实时是两种引擎、两种语言、两种 SLA

矛盾:
- **流处理快但不准**:容错、状态、一致性都没解决
- **批处理慢但准**:跑完再跑一遍结果一样,数学上完美

Marz 的解法:**不要二选一,两个都用,各取所长**。

### 1.2 Lambda 架构的三层

```
                  数据源
                  (事件日志 / Kafka / DB)
                     │
         ┌───────────┼───────────┐
         │           │           │
         ▼           ▼           ▼
    [批层]       [速度层]
    Hadoop/Spark Storm/Spark Streaming
    全量重算     增量近似
    高延迟高准   低延迟可能错
         │           │
         │           │
         └────┬──────┘
              ▼
         [服务层]
    HBase/Cassandra/Redis
    读时合并:批层结果 + 速度层增量
              │
              ▼
            查询接口
```

**核心思想**:速度层提供「现在的近似答案」,批层提供「过去的精确答案」,服务层把两个层的结果合并对外提供。**真相在批层**,速度层只是「预览」。

### 1.3 Lambda 的甜与苦

**甜**:
- 速度层错了不可怕,批层下一次跑会修正
- 历史数据可以重新计算(回算友好)
- 流和批各自用最适合的引擎

**苦**(致命):
- **同一份业务逻辑写两遍**——Spark 写一遍,Storm 写一遍,**两份代码、两个团队、两套 bug**
- 离线和实时结果对不齐 → 业务怀疑数据
- 服务层合并逻辑复杂,要处理"批层覆盖速度层"的窗口边界
- 运维成本翻倍:Hadoop 集群 + Storm 集群 + 服务层存储

**真实场景**:
> 2015 年某厂的实时大屏数据和次日 BI 报表对不上,几个小时差几千万 GMV。最后发现:**Storm 任务里有个字段被算错,Spark 那份是对的**——同一段业务在两套代码里漂移了。

这种事故几乎每个上 Lambda 的团队都经历过。Lambda 在工程上是「正确但贵」的妥协。

---

## 二、Kappa:把批层删掉

### 2.1 Kreps 的反思(2014)

Jay Kreps 是 LinkedIn 出来的,Kafka 主作者。他观察到一个事:

> 既然 Kafka 是「分布式 append-only 日志」,而批处理本质上是「读一段历史日志重新计算」——**那为什么不让流引擎直接重新读日志,就当作批处理?**

也就是说:**批 = 流的一个特例**(读完就停的有界流)。

### 2.2 Kappa 架构

```
            数据源
              │
              ▼
            Kafka
              │
              ▼
        [流处理引擎]
        Flink / Spark Streaming
              │
              ▼
        [服务层]
              │
              ▼
            查询
```

**只有一层**。需要回算历史?**重新读 Kafka 从头跑一遍**。需要新算法?**起一个新版本任务并行跑,跑完切换**。

### 2.3 Kappa 的甜与苦

**甜**:
- 一份代码、一种引擎、一种语言、一套测试
- 实时和回算用同一逻辑,**结果天然一致**
- 运维只有一套

**苦**:
- **流引擎必须能扛回算的吞吐**——历史一个月数据用流方式重跑,引擎会被打爆
- Kafka 必须保留足够长(retention),要么 Tiered Storage(KIP-405)冷数据 S3
- 状态恢复复杂:重跑时初始状态怎么搭?
- 复杂多源 join、窗口聚合的 backfill 极其考验流引擎能力
- 一些天然就是「批」的场景(全量计算 PageRank、一年一次的财报口径)用流硬撑很别扭

### 2.4 Kappa 在哪些场景成立

- **数据量适中**(几 TB 级别 retention 可承受)
- **业务模型本质就是流**(用户行为分析、监控、告警、CDC 实时数仓)
- **回算频率低**或回算窗口短

不太成立:
- **超大数据湖**,几十 PB 历史想重跑根本撑不住
- **强批处理特征**(全量 ML 训练、复杂 ETL 编排)

---

## 三、心智图:三种姿态对照

```
Lambda  (2011-2015 主流)
┌────────┐                 ┌─────────┐
│ 批 layer│ → 准 / 慢 ─→ │  服务层  │
│ Spark  │               │ 合并读   │ → 查询
│ Hive   │                │         │
└────────┘                 └─────────┘
   ▲                           ▲
   │                           │
   │     ┌──────────┐         │
   └─────│ 速度 layer│─近似/快─┘
         │ Storm    │
         │ Spark Str│
         └──────────┘
   ↑ 同一逻辑写两遍 ↑
   
Kappa  (2014-)
┌──────────┐
│ Kafka 日志│ → [流引擎 Flink/Spark Str.] → 服务层 → 查询
└──────────┘                ▲
                            │
                            └ 回算时重读 Kafka
                              (要求引擎能扛)

混合 (2020-,实战默认)
┌──────────┐
│ Kafka 流  │ ─→ Flink ─→ Iceberg (实时落仓)
│ Binlog   │     ↓                   ↑
└──────────┘   实时大屏 / 风控        │
                                      ↓
              历史回算 ─→ Spark / dbt ┴ → ADS / 报表
                         读 Iceberg 同一份事实
```

**混合架构的核心特征**:
- **一份事实数据**(Iceberg / Delta / Hudi 表)既被流写入也被批读取
- **流处理只做「实时关键链路」**(秒级延迟有强需求的)
- **批处理 / dbt 做主要建模**(ODS/DWD/DWS/ADS),覆盖大部分需求
- **读时统一**:BI 和应用都读建好的表,不关心是流写的还是批写的

这其实是 **「物理层混合 + 逻辑层统一」** 的工程妥协,而不是教科书式的 Lambda 或 Kappa。

---

## 四、流批一体:Flink / Spark 在做的事

「流批一体」(Stream-Batch Unification)是 2018 后 Flink 和 Spark 共同的方向——**用一套 API、一份代码,既能跑流也能跑批**。

### 4.1 Flink 流批一体

Flink 的设计哲学是「**批是流的特例**」(Kappa 思想):

```
DataStream API:        实际上批和流共用,批 = 有界流
Table API / SQL:        同一段 SQL 既能跑流也能跑批
```

```sql
-- 同一段 Flink SQL
INSERT INTO daily_revenue
SELECT 
    DATE_TRUNC('day', event_time) AS day,
    SUM(amount) AS gmv
FROM orders
GROUP BY DATE_TRUNC('day', event_time);

-- 跑流:实时累加,每个 day 的结果持续更新
-- 跑批:把 orders 当有界数据集,跑完输出
-- 切换由 execution.runtime-mode 决定
```

**Flink 1.12+ 把批模式优化做得不错**:有界数据时关 Checkpoint、改 Sort-Shuffle、用 BlockingResultPartition,性能接近 Spark。

### 4.2 Spark Structured Streaming

Spark 反过来:「**流是批的特例**」(微批思想):

```python
# 同一段 DataFrame API
df = spark.readStream.format("kafka").load()  # 流
# 或
df = spark.read.format("parquet").load("...")  # 批

result = df.groupBy("date").agg(F.sum("amount"))

# 流写入(每 5 秒触发一次微批)
result.writeStream.trigger(processingTime="5 seconds").start()

# 批写入
result.write.parquet("...")
```

**微批 vs 真流**:Spark 默认每 N 秒攒一批跑(微批,延迟秒级);Continuous Mode 是真流(实验性,2.3+)。生产上大多数 Spark Streaming 任务是微批。

### 4.3 选型

```
极低延迟 (< 100ms) / 复杂状态 / CEP        → Flink
微批可接受 (秒级) / 与离线 ETL 共享 Spark  → Spark Structured Streaming
团队已经在用谁                              → 继续用谁
```

详细对比见 **22 流批一体的真相**。

---

## 五、混合架构的工程落地

### 5.1 一条数据两侧消费的最小骨架

```
Binlog (CDC) ──→ Kafka (orders topic)
                    │
        ┌───────────┼─────────────┐
        ▼                         ▼
   [Flink 实时]                [Spark 批]
   消费 Kafka                  每天凌晨调度
   按 5 分钟窗口聚合           读 Iceberg 全量
   写实时大屏 + 风控          dbt 建 DWD/DWS/ADS
        │                         │
        └────────┬────────────────┘
                 │
                 ▼
            [Iceberg 表 orders]
            (事实源,流写 + 批读)
                 │
                 ▼
        [BI / 模型 / RAG / 大屏]
```

```sql
-- Flink 流写 Iceberg
CREATE TABLE iceberg_catalog.shop.orders (
    id BIGINT,
    user_id BIGINT,
    amount DECIMAL(10,2),
    event_time TIMESTAMP(3),
    PRIMARY KEY(id) NOT ENFORCED
) WITH ('format-version'='2', 'write.upsert.enabled'='true');

INSERT INTO iceberg_catalog.shop.orders
SELECT * FROM kafka_source;

-- Spark / dbt 批读同一张表(跨引擎读 Iceberg 是开放标准)
SELECT 
    DATE_TRUNC('day', event_time) AS day,
    SUM(amount) AS gmv
FROM iceberg_catalog.shop.orders
WHERE event_time BETWEEN '2025-01-01' AND '2025-01-31'
GROUP BY 1;
```

**关键点**:Iceberg 是「事实源」,流写入和批读取互不影响,且读端永远看到一致的快照(Iceberg 的 ACID 保证,详见 08 篇)。

### 5.2 实时和批侧结果对账

混合架构的真实痛点:实时大屏看到「今日 GMV 1.2 亿」,次日 BI 报表跑出来「1.18 亿」——差 200 万。是 bug 还是正常?

**正常情况**:
- 迟到事件:几小时后才到的订单(超 Watermark),实时窗口已关
- 撤销订单:实时算入 GMV,批侧排除
- 时区 / 边界差:实时按 UTC,批按本地时区

**对账方法**:
- 在 Iceberg 上跑同一段 SQL(批口径),与实时大屏数字对比
- 差异归类:迟到 / 撤销 / 边界 / 真 bug
- 业务侧理解:实时是「估算」,批是「最终结果」

这套对账机制是混合架构必须的——**否则你永远不知道哪个数字可信**。

---

## 六、几个常见误区

### 6.1 「我要 Kappa,所以全部上 Flink」

小公司听到 Kappa 心动,把全部数据管道从批改成 Flink:**运维成本爆炸**(Flink 集群常驻、状态后端要 RocksDB+S3、Checkpoint 调优、反压排查),**结果跟用 Spark + Airflow 比没快多少,但成本翻三倍**。

正确姿态:**只把确实需要实时的链路改成流**(秒级风控、实时大屏、推荐近线召回),其他保持批。

### 6.2 「批流一体 = 一份代码」

理论上是,实操上不完全是:
- Flink SQL 流模式和批模式语义有微差(batch 模式下没有 Watermark / 窗口触发)
- 状态算子(`ROW_NUMBER OVER`)在流和批的行为不同
- Sink 写法不同(流写要事务支持,批写直接覆盖)

**「一份代码两种执行」是目标,真相是「绝大部分代码一份,少数算子要分别处理」**。

### 6.3 「Lambda 已死」

Lambda 思想没死,只是**不再需要显式两套引擎**——现在一个 Flink + Iceberg 就能用「流写 + 批读」实现 Lambda 想达到的「准 + 快」效果。**思想活,工程退**。

### 6.4 「Kappa 解决一切」

Kappa 假设「Kafka 能存所有数据」,但 PB 级历史数据不可能全存 Kafka。Tiered Storage(冷数据下沉 S3)解决了一部分,但回算大批量历史时,流引擎仍然吃力——这时候 Spark 批就是更合适的工具。

---

## 七、什么时候用什么架构

```
纯批(无实时需求)                     → Spark + Airflow + dbt + Iceberg
                                       离线足够,别上流
                                       
实时关键链路 + 大量批                  → 混合(Flink 实时 + Spark 批 + Iceberg 事实源)
                                       2025 大公司事实标准
                                       
小公司、数据量适中、强实时             → Kappa 风格(Flink 一把梭)
                                       维护一套就够
                                       
大公司、复杂建模 + 强一致性            → Lambda 思想 + Iceberg 实现
                                       但不要再写两套代码
                                       
极小公司、起步阶段                     → 不要谈 Lambda/Kappa
                                       PostgreSQL + dbt 起步,扛不住再说
```

---

## 八、看完这一篇,你应该能

- 在白板上画 Lambda 三层(批 / 速度 / 服务)和 Kappa 单层
- 解释为什么 Lambda 死于「两套代码」、Kappa 死于「流引擎扛不动批回算」
- 看到「流批一体」第一反应是「Flink 1.12+ / Spark Structured Streaming,但仍有差异」
- 知道 2025 大公司事实上是「流写 Iceberg + 批读 Iceberg + 读时统一」的混合架构
- 理解实时和批侧的口径对账是必须的工程,不是 bug

下一篇:**05 模式演进与数据契约** — 同样一张 orders 表,上游加一个 `coupon_id` 字段,为什么下游会一周内陆续炸?Schema Evolution 和 Data Contract 怎么救命。
