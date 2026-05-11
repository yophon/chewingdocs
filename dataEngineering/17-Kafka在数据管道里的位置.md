# Kafka 在数据管道里的位置:不是消息队列,是事实源

backend 工程师看 Kafka 想到「生产者-消费者-MQ」,数据工程师看 Kafka 想到「**事实源 + 数据管道的血管**」——同一个东西,在两个语境里角色完全不同。在数据栈里,Kafka 不是 RabbitMQ 的兄弟,而是 **「分布式 append-only log」**:每条消息有 offset,消费者可任意回放,topic 按 partition 切并发,**整套数据栈的「实时事实源」**。这一篇专讲 Kafka 作为数据管道一员的角色:为什么它本质是 log 而不是 MQ、Log Compaction、Tiered Storage、Schema Registry、Kafka Connect 生态。

> 一句话先记住:**在数据工程语境下,Kafka 不是消息队列,是数据管道的「实时事实源」**——Binlog / 埋点 / 业务消息都先进 Kafka,后续所有消费者(实时大屏、Flink CDC、湖落地、推荐近线)都从这一处订阅。**它的核心抽象不是「消息收发」,而是「持久化日志 + 多消费者订阅 + 任意回放」**。

---

## 一、Kafka 在数据栈里干什么

### 1.1 数据栈视角的 Kafka

```
                  生产数据源
                  ─────────────
                  MySQL Binlog (CDC)
                  业务事件(下单/支付/退款)
                  埋点 SDK
                  IoT 设备
                  日志 agent
                      │
                      ▼
                ┌─────────────┐
                │   Kafka     │   ← 数据管道的"枢纽"
                │  (分布式 log)│      事实源
                └─────────────┘
                      │
       ┌──────────────┼────────────────┐
       ▼              ▼                ▼
   Flink CDC     Spark Structured    Connect Sink
   实时聚合      Streaming           写 Iceberg / ES
   写大屏        微批落湖             写 HDFS
       │              │                ▲
       ▼              ▼                │
   实时业务       离线分析            历史归档
```

**关键洞察**:Kafka 不是「下游」,是「中心枢纽」。所有数据先进 Kafka,任意多个下游订阅。

### 1.2 跟「消息队列」的根本差异

| | RabbitMQ / 传统 MQ | Kafka |
| --- | --- | --- |
| 数据生命周期 | 消费后删除 | **持久保留**(按 retention,默认 7 天到永久) |
| 消费模型 | Push,消费即删 | Pull,offset 自管,**可任意回放** |
| 多消费者 | 队列分发(一人一份) | **每个消费组都看到完整流** |
| 持久化 | 内存 + 选择性磁盘 | **日志 append + Page Cache** |
| 吞吐 | 几万 QPS | **百万级 QPS / partition** |
| 顺序保证 | 队列内有序 | **partition 内有序** |
| 用途 | RPC、任务分发 | **数据管道、事件溯源、CDC、流处理** |

**Kafka 长得像 MQ 但本质是 log**——MQ 的对比者是 RocketMQ / RabbitMQ,Kafka 的对比者是「分布式 WAL」。

---

## 二、Topic / Partition / Offset:Kafka 的核心三件

### 2.1 Topic = 一类数据流

```
topic: orders                  topic: clicks                  topic: shipments
  ├─ partition 0                  ├─ partition 0
  ├─ partition 1                  ├─ partition 1
  ├─ partition 2                  ├─ partition 2
  └─ partition 3                  └─ partition 3
```

每个 topic 是一类数据流(订单 / 点击 / 物流),按 **partition** 切分以扩展吞吐。

### 2.2 Partition 是顺序和并发的统一单位

```
Partition 0:   [offset 0][offset 1][offset 2][offset 3]...
Partition 1:   [offset 0][offset 1][offset 2]...
Partition 2:   [offset 0][offset 1][offset 2][offset 3][offset 4]...

每个 partition 内 offset 严格递增,数据按 append-only log 存
跨 partition 不保证顺序
```

**核心约束**:partition 是**最小并发单位**。一个 topic 有 100 partition → 最多 100 个消费者并行。

**取 partition 数**:
- 太少 → 并发瓶颈
- 太多 → metadata 开销,Broker 内存压力
- 经验:topic 当前 + 未来 2 年的最大消费者数

### 2.3 Partition Key 选错的灾难

```python
# 生产者:
producer.send("orders", key=str(user_id), value=order)
# 用 user_id 做 partition key

# 问题:某些 user_id 是大客户,日订单几万条
# → 这个 user 的所有消息打到同一 partition
# → 该 partition 数据量是其他的 100 倍
# → 该 partition 的消费者扛不住,lag 累积
```

**正解**:
- 热点 key 加随机后缀:`user_id_random_0..9`(但失去 key 顺序保证)
- 业务侧分拆:大客户单独 topic
- 不要 key:`producer.send("orders", value=order)`(Kafka 自动 round-robin)

### 2.4 Offset 是消费者的指针

```
Partition 0:  [0][1][2][3][4][5][6][7][8][9]
                              ↑
                          消费者 A 当前 offset = 6
                          消费者 B 当前 offset = 9

# 消费者拉取后自己更新 offset
# Kafka 不删数据(直到 retention 过期)
# 任意时刻可以 seek 到任意 offset 重新消费

consumer.seek(partition, offset=0)  # 从头开始
consumer.seek_to_beginning()
consumer.seek_to_end()
```

**这是 Kafka 跟 MQ 最大的不同**:**数据不消费即删**,而是按时间保留;任意消费者可任意时刻回放历史。

---

## 三、Kafka 在数据管道里的几个核心角色

### 3.1 角色 1:CDC 中转

```
MySQL Binlog → Debezium → Kafka topic: db.shop.orders
                                      ├─→ Flink CDC → Iceberg(实时落湖)
                                      ├─→ Elasticsearch(近实时搜索)
                                      ├─→ Redis(缓存预热)
                                      └─→ 旧 ETL 兼容
```

**业务库的变更进 Kafka 后,所有下游订阅**——上游不知道也不关心下游有谁。**这就是「事实源」的力量**。

### 3.2 角色 2:埋点事件中转

```
Web / App SDK → 网关 → Kafka topic: events.click / events.expose
                                  ├─→ Flink 实时计算 UV/PV
                                  ├─→ Spark Streaming 微批 → Iceberg
                                  └─→ Druid 实时分析
```

### 3.3 角色 3:微服务间事件

```
订单服务 → Kafka topic: order.created → 库存服务消费(扣减)
                                       → 积分服务消费(发积分)
                                       → 营销服务消费(发券)
                                       → 数据团队消费(数据管道)
```

虽然这跟「消息队列」最像,但 Kafka 的回放 + 多订阅特性远超 MQ。

### 3.4 角色 4:实时业务大屏的事件源

```
Kafka → Flink → ClickHouse(物化的实时聚合表)→ 大屏
                  ↑
              「秒级 GMV 跳动」
```

---

## 四、Log Compaction:KV 视角的 Kafka

### 4.1 普通 retention vs log compaction

```
普通 retention(按时间删):
  topic 配 retention.ms=604800000 (7 天)
  超过 7 天的数据被 segment-level 删
  
log compaction(按 key 留最新):
  对于 (key, value) 流,保留每个 key 最新的 value
  旧版本可清理
```

### 4.2 应用场景:状态快照

```
topic: user.profile (log compacted)

写入顺序:
  (user=1, name=Alice, age=20)   offset=0
  (user=2, name=Bob,   age=25)   offset=1
  (user=1, name=Alice, age=21)   offset=2  ← user=1 新版本
  (user=3, name=Carol, age=30)   offset=3
  (user=1, name=Alice, age=22)   offset=4  ← user=1 又新版本

Compaction 后:
  (user=2, name=Bob,   age=25)
  (user=3, name=Carol, age=30)
  (user=1, name=Alice, age=22)   ← 只保留最新

= 一个 KV 快照,可重建任意时刻的"当前状态"
```

**用途**:
- 配置中心(同 key 反复更新,只关心最新)
- 用户状态、产品状态
- Kafka Streams / Flink 的状态恢复源
- 替代 Redis 类 KV(简单场景)

### 4.3 配置

```ini
cleanup.policy=compact         # 启用 compaction(默认是 delete)
cleanup.policy=compact,delete  # 两个都开:旧数据按 time/size 删 + 同 key 保留最新
min.compaction.lag.ms=0
delete.retention.ms=86400000   # tombstone(null value)保留多久后清理
```

---

## 五、Tiered Storage(KIP-405):冷数据下沉 S3

### 5.1 没 Tiered Storage 的痛

```
Kafka topic: events.click
  retention=30 天 → 100TB 数据
  → 每个 Broker 都要塞下副本
  → 几十台 Broker,每台几十 TB SSD,$$$
  → 想 retention=1 年?成本爆炸
```

### 5.2 Tiered Storage 长这样

```
Hot Tier(本地磁盘):       最近 24h-7d 的数据,低延迟读
Cold Tier(对象存储 S3):    超过 7d 的数据,按需读
  
Broker 启动时 metadata 知道 cold segment 在哪
消费者读旧数据时,Kafka 透明从 S3 拉
```

### 5.3 价值

- **Broker SSD 不再爆**
- **retention 可设到 1 年甚至永远**(成本可控)
- **Kafka 可作真正的"事实源"长期保留**
- **流批一体的根基**:Flink / Spark 可以重读历史(参考 04 篇 Kappa)

### 5.4 现状

- Confluent / AWS MSK / Aiven 都已支持
- Apache Kafka OSS 3.6+ 支持
- 国内云厂商陆续跟进

---

## 六、Schema Registry & 数据契约(05 篇细讲)

Kafka 自身不管 schema(消息是 byte[]),所以**数据管道必须配 Schema Registry**:

```
Producer ──► Schema Registry ──► Get schema ID
              │
              ▼
Producer 写 [ID][bytes...] 到 Kafka
              │
              ▼
Consumer 读 [ID][bytes...] → Schema Registry 查 ID → 反序列化
```

详见 05 篇。**没有 Schema Registry 的 Kafka 数据管道,是定时炸弹**。

---

## 七、Kafka Connect:数据管道的两端

### 7.1 心智

```
Source Connector:    把外部数据搬进 Kafka
   ├─ Debezium(MySQL/PG/Mongo Binlog)
   ├─ JDBC Source(批量轮询)
   ├─ FilePulse / S3 Source
   └─ Salesforce / Stripe / GA / ...

Sink Connector:      把 Kafka 数据搬到外部
   ├─ S3 Sink(写 Parquet / JSON 到 S3)
   ├─ Iceberg Sink(直接写 Iceberg)
   ├─ Elasticsearch Sink
   ├─ JDBC Sink(写回 DB)
   └─ Snowflake / BigQuery / Clickhouse Sink
```

### 7.2 Debezium:CDC 的事实标准

```yaml
# Debezium MySQL connector 配置
{
  "name": "mysql-orders-connector",
  "config": {
    "connector.class": "io.debezium.connector.mysql.MySqlConnector",
    "database.hostname": "mysql.shop.com",
    "database.user": "debezium",
    "database.server.id": "184054",
    "database.server.name": "shop",
    "database.include.list": "shop",
    "table.include.list": "shop.orders,shop.users",
    "database.history.kafka.bootstrap.servers": "kafka:9092",
    "database.history.kafka.topic": "schema-changes.shop"
  }
}
```

输出到 Kafka topic: `shop.shop.orders`,每条消息是:

```json
{
  "before": {"id":1, "amount": 99.5, ...},
  "after":  {"id":1, "amount": 109.5, ...},
  "op": "u",            // c=create, u=update, d=delete, r=snapshot
  "ts_ms": 1715000000000,
  "source": {...}       // 元数据:binlog 位置、事务 ID
}
```

详见 27 篇。

### 7.3 Iceberg Sink

```yaml
{
  "connector.class": "org.apache.iceberg.connect.IcebergSinkConnector",
  "topics": "shop.shop.orders",
  "iceberg.tables": "shop.bronze.orders",
  "iceberg.catalog.type": "rest",
  ...
}
```

**Kafka → Iceberg 直连**,不用中间起 Flink/Spark job(当然 Flink 灵活性更高,Connect 适合简单场景)。

### 7.4 Connect 部署

Connect 自身是个集群(类似 Kafka Streams),独立部署或者跟 Kafka 共享。生产上还有 **Strimzi / Confluent Operator** 在 K8s 上托管。

---

## 八、Kafka 之外的"日志流"竞争者

### 8.1 Redpanda:Kafka 协议 + Rust 重写

- **零 JVM**,C++ 写,启动快、内存少
- 协议兼容 Kafka(client 不变)
- 性能宣称 5-10x Kafka
- 商业 SaaS:Redpanda Cloud

**适合**:对 Kafka 协议依赖但讨厌 JVM 运维的团队。

### 8.2 WarpStream:Direct-to-S3 Kafka

- **没有 broker 本地盘**:直接写 S3
- 100% Kafka 协议兼容
- 成本可能比 Kafka 低 10x(没本地 SSD)
- 延迟代价(写入要传 S3)

**适合**:对延迟不极致敏感、想极致省成本的场景。

### 8.3 Apache Pulsar

- 计算 / 存储分离原生设计(类似 Lakehouse 思想)
- 多租户友好
- 雅虎 + StreamNative 推动
- 生态不如 Kafka,但功能更全

### 8.4 NATS JetStream / RabbitMQ Streams

- 跟 Kafka 在概念上趋同
- 各有各的生态

**2025 事实**:Kafka 仍是绝对主流,Redpanda 在追,Pulsar 是大公司选项。

---

## 九、Kafka 在数据管道的工程经验

### 9.1 Partition 数怎么定

```
当前 + 未来 2 年的最大消费者并发数
+ 留 30% 余量
最少不要 < 3(避免单点)
经验:小 topic 6-12,大 topic 30-100
```

**不要太多**:1000+ partition 的 topic 会让 Broker 元数据爆炸。

### 9.2 Retention 怎么定

```
合规需要长期保留        → Tiered Storage + S3 + 一年
                       
数据管道下游回放需要    → 7-30 天

实时消费,失败再回灌    → 3-7 天

只是事件传递,无回放    → 24h
```

### 9.3 ACK / 容错配置

```python
producer = Producer({
    'bootstrap.servers': 'kafka:9092',
    'acks': 'all',                    # 主副本 + 全部 ISR 收到才算成功
    'enable.idempotence': True,       # 幂等生产(Exactly Once 基础)
    'retries': 2147483647,            # 无限重试
    'max.in.flight.requests.per.connection': 5,
})
```

数据管道场景**几乎都该用 acks=all + 幂等**——丢消息是事实源的灾难。

### 9.4 Consumer Group 设计

```python
# 每个下游系统一个 consumer group
consumer = Consumer({
    'group.id': 'flink-cdc-iceberg',   # 独立 group,offset 独立
    'enable.auto.commit': False,        # 手动提交,跟下游事务对齐
    'auto.offset.reset': 'earliest',
})

# Exactly-once 场景:下游 sink 事务 + offset 一起提交
```

### 9.5 监控指标

- **Lag**(消费者落后量)→ 最重要,大了就是消费者跟不上
- **ISR shrinking**(in-sync replicas 收缩)→ 副本同步出问题
- **Under-replicated partitions** → 集群健康
- **Producer / Consumer 错误率**

---

## 十、Kafka 不擅长的事

### 10.1 极低延迟(< 1ms)

Kafka 默认毫秒级,极致 RPC 用专门 MQ(NATS / Aeron)。

### 10.2 小消息 + 高频

Kafka 是为「事件流 + 持久化」设计,每条几十字节、几万 QPS 的纯 RPC,RabbitMQ / Redis Streams 更合适。

### 10.3 复杂路由

RabbitMQ 的 exchange / routing key 模型,Kafka 没有(可以用 KStream 做但麻烦)。

### 10.4 优先级队列

Kafka 没有(可用多 topic 模拟,但麻烦)。

### 10.5 定时任务

不是 Kafka 的事(用 Airflow)。

---

## 十一、Kafka 在数据栈里的位置图

```
                  生产数据源
                  ─────────
                  ▼
              ┌──────────┐
              │  Kafka   │  ←── 事实源 / 中央枢纽
              │  topics  │
              │ + Connect│
              │ + Schema │
              │ Registry │
              └──────────┘
            ┌─────┼─────┐
            ▼     ▼     ▼
       Flink   Spark   Sink
       实时    微批    Connect
        │      │       │
        ▼      ▼       ▼
       ClickHouse / Iceberg / ES / DB
       
       (下游消费者各自独立的消费 group)
```

**Kafka 是数据管道的「血液循环系统」**——上游产生的事件经过它送到所有下游;下游可以独立故障、独立扩容、独立回放;不依赖于具体上游实现。

---

## 十二、看完这一篇,你应该能

- 解释「Kafka 在数据栈里是 log 不是 MQ」的根本差异
- 在白板上画 topic / partition / offset 三件套
- 知道 partition key 选错的灾难(热点 + 消费者打爆)
- 解释 Log Compaction 是 KV 视角的 topic
- 知道 Tiered Storage(KIP-405)让 Kafka 真正长期保留
- 看到 Debezium 知道是 CDC 进 Kafka 的事实标准
- 区分 Kafka / Redpanda / WarpStream / Pulsar 各自的卖点
- 给数据管道建议:Schema Registry 必上、acks=all 默认、监控 Lag

下一篇:**18 流处理心智** — 事件时间、Watermark、状态、Exactly-once。流处理跟批的根本差异在哪?
