# CDC 实战:Debezium、Flink CDC、增量同步

每天凌晨跑 12 小时的全量 Spark 任务从 MySQL 拉订单表 → 6 小时算 DWD → 6 小时算 DWS——**这套已经是 2015 年的事**。2025 年的做法是 **CDC(Change Data Capture)**:实时捕获 Binlog 变更,几秒钟流到湖里,**「一次性把全量拉过来,后续只同步增量」**。这一篇拆 CDC 的三种实现、Debezium 怎么解析 Binlog、Flink CDC 怎么把整个链路简化,以及生产 CDC 必须处理的几个工程难点(snapshot + 增量切换、DDL 演进、大事务、删除)。

> 一句话先记住:**CDC = 从 OLTP 实时捕获变更 + 流到下游**。三种实现里**基于日志(Log-based)** 是生产唯一选择,Debezium + Kafka 是事实标准,Flink CDC 把 Debezium 直接嵌进 Flink 省去 Kafka 中转。**真正的工程难点不在引擎,在 snapshot + 增量切换 + Schema 演进 + 大事务这几道暗坑**。

---

## 一、为什么不能全量重算

### 1.1 全量重算的痛

```
凌晨 0:00:
  Spark 起来读 MySQL orders 表(10 亿行)
  通过 JDBC 拉(MySQL 主库压力陡增,业务方告状)
  12 小时跑完
  
  写 ODS 全量替换
  6 小时跑 DWD
  6 小时跑 DWS
  
  → 下午 12:00 才出当天数据
  → 业务下午才能用,实时分析不可能
```

### 1.2 CDC 之后

```
持续:
  MySQL Binlog → Debezium → Kafka(几秒延迟)
  Flink 消费 Kafka → 写 Iceberg(几秒到分钟延迟)
  
  实时大屏:Flink 直接消费,秒级
  数仓:dbt incremental,每小时跑一次新数据
  
  → 业务库压力小(只读 Binlog,不查表)
  → 全链路延迟从 12 小时降到分钟
```

---

## 二、CDC 的三种实现

### 2.1 基于查询(Query-based)

```sql
-- 每隔一段时间查"过去 N 分钟变更"
SELECT * FROM orders 
WHERE updated_at > '2025-05-11 10:00:00';
```

**优点**:简单,任何 DB 都能做。

**死结**:
- **漏 DELETE**(查询不到已删的)
- **依赖 `updated_at` 字段**(业务必须每次更新都改这个字段,容易漏)
- **轮询 → 业务库压力 + 延迟**
- **跨 DB 不一致**(查的时刻在变)

**结论**:小数据 + 业务允许漏 DELETE + 没有 Binlog 时凑合用。生产几乎不用。

### 2.2 基于触发器(Trigger-based)

```sql
-- 在源表上加 INSERT/UPDATE/DELETE 触发器,写变更表
CREATE TRIGGER orders_audit AFTER UPDATE ON orders
FOR EACH ROW INSERT INTO orders_changes (...) VALUES (...);
```

**优点**:能抓 DELETE,准确。

**死结**:
- **影响业务库性能**(每个写都触发额外 SQL)
- **维护成本高**(DBA 不喜欢)
- **业务表加列要同时改触发器**

**结论**:几乎被 Log-based 淘汰。

### 2.3 基于日志(Log-based) — 生产唯一选择

```
MySQL Binlog                   PostgreSQL WAL              MongoDB Oplog
─────────────                  ─────────────                ─────────────
Row-based format               Logical Replication          Operation Log
binlog_format=ROW              wal_level=logical            Replica Set 必备
                               Replication Slot
                               
每个 SQL → INSERT/UPDATE/DELETE 行级事件,带 before/after
```

**优点**:
- **不影响业务库**(只读 binlog 文件)
- **完整捕获**(INSERT / UPDATE / DELETE / DDL)
- **顺序保证**(binlog 是事务有序)
- **事务一致**(可以按事务提交边界对齐)

**这是生产 CDC 的事实选择**,下面展开。

---

## 三、Debezium:Log-based CDC 的事实标准

### 3.1 出身

```
2016  Red Hat 出 Debezium(原是为 EAP 应用做事件溯源)
2017  捐 Apache(实际还在 Red Hat 主导)
2024+ 支持几乎所有主流 DB:MySQL / PostgreSQL / MongoDB / Oracle / SQL Server / Cassandra / Db2
```

### 3.2 工作原理

```
MySQL Binlog                              Kafka topic
─────────────                             ─────────────
binlog row event 1:                        message 1:
  table=orders, op=INSERT,                 {before:null, after:{id:1, ...}, op:c}
  after={id:1, amount:99, ...}
                                           message 2:
binlog row event 2:                        {before:{id:1, amount:99, ...},
  table=orders, op=UPDATE,                  after:{id:1, amount:109, ...},
  before={id:1, amount:99, ...},            op:u}
  after={id:1, amount:109, ...}

binlog row event 3:                        message 3:
  table=orders, op=DELETE,                 {before:{id:1, amount:109, ...},
  before={id:1, amount:109, ...}            after:null, op:d}
```

Debezium 把每行变更包装成标准 JSON / Avro:

```json
{
  "before": { "id": 1, "amount": 99.5, "status": "paid" },
  "after":  { "id": 1, "amount": 109.5, "status": "paid" },
  "op": "u",
  "ts_ms": 1715000000000,
  "source": {
    "version": "2.5.0",
    "connector": "mysql",
    "name": "shop",
    "db": "shop",
    "table": "orders",
    "ts_ms": 1715000000000,
    "snapshot": "false",
    "binlog_file": "mysql-bin.000123",
    "binlog_pos": 456,
    "gtid": "..."
  }
}
```

### 3.3 部署模式

```
方式 1: Kafka Connect 集群上跑(生产标准)
        Connect 提供 HA + 配置管理
        每个 connector 监听一个 DB
        
方式 2: Debezium Server(轻量)
        独立 JVM,直接推到 Kafka/Pulsar/Kinesis
        
方式 3: 嵌入式(Debezium API 直接调用)
        极少用,典型在 Flink CDC 里
```

### 3.4 Connector 配置示例

```json
{
  "name": "mysql-shop-connector",
  "config": {
    "connector.class": "io.debezium.connector.mysql.MySqlConnector",
    "database.hostname": "mysql.shop.com",
    "database.port": "3306",
    "database.user": "debezium",
    "database.password": "secret",
    "database.server.id": "184054",
    "topic.prefix": "shop",
    "database.include.list": "shop",
    "table.include.list": "shop.orders,shop.users,shop.products",
    "schema.history.internal.kafka.bootstrap.servers": "kafka:9092",
    "schema.history.internal.kafka.topic": "shop.schema-changes",
    "snapshot.mode": "initial",
    
    "key.converter": "io.confluent.connect.avro.AvroConverter",
    "key.converter.schema.registry.url": "http://schema-registry:8081",
    "value.converter": "io.confluent.connect.avro.AvroConverter",
    "value.converter.schema.registry.url": "http://schema-registry:8081"
  }
}
```

输出到 Kafka topic:
- `shop.shop.orders`
- `shop.shop.users`
- `shop.shop.products`
- `shop.schema-changes`(DDL 变更)

---

## 四、Snapshot + Streaming 切换:CDC 最难的部分

### 4.1 启动时的难题

```
你新开 CDC 任务:
  历史已经在表里(几亿行)
  Binlog 只能从某个 position 开始读(过去几天)
  
怎么把"现在的全量"+"未来的增量"统一?
```

### 4.2 Debezium 的 Initial Snapshot

```
1. 启动时拿一个一致性快照位点:
   FLUSH TABLES WITH READ LOCK   -- 短暂锁全库
   GET CURRENT BINLOG POSITION    -- 记下 binlog position
   UNLOCK TABLES
   
2. SELECT * FROM orders 全量拉(标记为 snapshot 事件)
3. SELECT * FROM users  全量拉
4. ...
5. 切换到 binlog 模式,从 step 1 记录的 position 开始读增量
```

**关键**:**全表 SELECT 时锁库** → 业务侧短暂受影响。

### 4.3 Debezium 的 Incremental Snapshot(DBZ-1862)

不锁库,**并发**做全量:
- 把表按 PK 切成 chunk
- 每个 chunk 内:记录 binlog position1 → SELECT 这个 chunk → 记录 position2
- 把 chunk 数据合并到流里,**用 watermark 标记**
- Binlog 模式下,如果某个 binlog 事件的 PK 在 chunk 内且时间在 position1-position2 之间 → 丢弃(已经在 chunk 数据里)

**这套设计**避免锁库、可中途恢复、可并发跑多表。**现代 Debezium 默认用这套**。

### 4.4 Flink CDC 的 snapshot 切换

Flink CDC 2.0+ 也做了类似的 **并发无锁 snapshot**(基于 Netflix DBLog 算法),核心思想同上。

---

## 五、Flink CDC:把 Debezium 嵌进 Flink

### 5.1 出身

```
2020  阿里出 Flink CDC,把 Debezium 内嵌到 Flink Source
2022  Flink CDC 2.0 自研并发无锁 snapshot
2024  Flink CDC 3.0 加入 schema 演进、多表合并 source
```

### 5.2 心智:省去 Kafka 中转

```
传统(Debezium + Kafka):
  MySQL ──Debezium──→ Kafka ──Flink──→ Iceberg
  4 个组件,3 跳网络

Flink CDC:
  MySQL ──Flink CDC Source──→ Iceberg
  2 个组件,直接消费 Binlog
```

**优点**:
- 少一层 Kafka(成本 + 复杂度)
- 端到端延迟更低
- 部署简单

**缺点**:
- 多个下游消费同一份 CDC,Kafka 模式更省(Debezium 写一次,多家消费)
- Kafka 模式有重放能力,Flink CDC 重启要重新 snapshot

**经验**:
- **单一下游 / 简单场景** → Flink CDC
- **多下游 / 复杂场景** → Debezium + Kafka

### 5.3 Flink CDC SQL

```sql
-- Source:MySQL CDC
CREATE TABLE mysql_orders (
    id BIGINT,
    user_id BIGINT,
    amount DECIMAL(10,2),
    status STRING,
    event_time TIMESTAMP(3),
    PRIMARY KEY(id) NOT ENFORCED
) WITH (
    'connector' = 'mysql-cdc',
    'hostname' = 'mysql-host',
    'port' = '3306',
    'username' = 'debezium',
    'password' = 'secret',
    'database-name' = 'shop',
    'table-name' = 'orders',
    'scan.incremental.snapshot.enabled' = 'true',
    'scan.startup.mode' = 'initial'
);

-- Sink:Iceberg
CREATE TABLE iceberg_orders (
    id BIGINT,
    user_id BIGINT,
    amount DECIMAL(10,2),
    status STRING,
    event_time TIMESTAMP(3),
    PRIMARY KEY(id) NOT ENFORCED
) PARTITIONED BY (days(event_time))
WITH (
    'connector' = 'iceberg',
    'catalog-name' = 'shop',
    'format-version' = '2',
    'write.upsert.enabled' = 'true'
);

-- 同步
INSERT INTO iceberg_orders SELECT * FROM mysql_orders;
```

整个 CDC 管道 50 行 SQL,不需要写 Java 代码。

---

## 六、下游 sink:upsert 怎么落

CDC 流到 Iceberg / ClickHouse / Hudi 等,**核心问题:怎么处理 UPDATE 和 DELETE**。

### 6.1 Iceberg V2 (Equality Delete + Position Delete)

```sql
-- Iceberg V2 表
CREATE TABLE iceberg_orders (...)
WITH ('format-version'='2', 'write.upsert.enabled'='true');

-- Flink CDC 写时:
--   INSERT → 写新 data file
--   UPDATE → 写 equality delete (按 PK 标记旧行删除) + 新 INSERT
--   DELETE → 写 equality delete
```

**读时**:Iceberg 引擎合并 data + delete。

### 6.2 Hudi MoR(09 篇)

天然 upsert 友好,**写 log file,定期 compact**。CDC + Hudi 是经典组合。

### 6.3 ClickHouse ReplacingMergeTree

```sql
CREATE TABLE ck_orders (
    id UInt64,
    user_id UInt64,
    amount Decimal(10,2),
    event_time DateTime,
    _version UInt64,
    _deleted UInt8
) ENGINE = ReplacingMergeTree(_version)
ORDER BY (event_time, id);

-- 写时,_version 用 binlog position
-- ClickHouse 后台 merge 时按 _version 取最新
-- _deleted=1 时标记软删除
```

### 6.4 JDBC Sink(写回 DB)

通常用 **UPSERT**(MERGE INTO / INSERT ON CONFLICT)+ 主键约束。

---

## 七、生产 CDC 必须处理的 5 个工程难点

### 7.1 大事务

```
业务侧:一次 UPDATE 一千万行(批量优惠)
  → Binlog 产出 1000 万 row events
  → Debezium 一次往 Kafka 灌 1000 万消息
  → Kafka 单 partition 撑不住,延迟飙升
  
解法:
  - 业务侧避免大事务(分批写)
  - Debezium 配 `max.batch.size` 限制
  - 下游消费者准备好处理流量峰值
```

### 7.2 DDL 演进

```
业务侧:ALTER TABLE orders ADD COLUMN coupon_id BIGINT;
  → Binlog 有 DDL 事件
  → Debezium 推到 schema-changes topic
  
下游需要:
  - 检测到 DDL,等当前批处理完
  - 自动调整 schema(Iceberg ALTER TABLE)
  - 重启 Flink job 或不 restart(取决于 connector 支持)

Flink CDC 3.0+ 支持自动 schema 演进
传统 Debezium + 自定义下游 sink 需要手写处理
```

### 7.3 DELETE 事件下游容易丢

```
Debezium DELETE 输出:
  { before: {...}, after: null, op: "d" }

下游 sink:
  - Iceberg V2:正常,写 equality delete
  - ClickHouse:要配 _deleted 列 + ReplacingMergeTree
  - JDBC:要配 sink 处理 DELETE,默认很多 sink 忽略

教训:测试 DELETE 链路是 CDC 上线必查
```

### 7.4 反压

下游慢 → Kafka 积压 → 业务库 Binlog 文件保留时间不够 → **Binlog 被 purge → CDC 数据丢**

防御:
- Binlog retention 调大(`expire_logs_days >= 7`)
- 监控 Debezium lag
- 下游慢扩资源

### 7.5 主键变化 / 主从切换

```
MySQL 主从切换:
  Master A 挂 → 切到 Master B
  Binlog position 不连续(GTID 模式好一点)
  Debezium 可能丢数据或重复
  
解法:
  - 用 GTID 模式(MySQL 5.6+ 推荐)
  - Connector 配 high availability
  - 出问题用 snapshot 重建
```

---

## 八、增量同步 vs 全量重算:什么时候选哪个

```
增量同步(CDC):
  数据持续增长、要实时
  业务库压力小
  适合:订单、用户、事件,几十亿到几百亿行
  
全量重算:
  数据量小(< 千万行)
  逻辑复杂、增量难表达
  适合:配置表、维度小表、复杂报表
  也可以混合:dbt incremental 中天 / 全量重跑兜底
```

### 8.1 混合策略

```
ODS 层:                增量(CDC + Iceberg V2)
DWD 层:                增量(dbt incremental)
DWS 层:                增量 + 周期全量重算(兜底)
ADS 层:                全量(数据量小,逻辑灵活)
```

---

## 九、工程落地:一个完整 CDC 链路

```
[MySQL]
   │ (Binlog)
   ▼
[Debezium Connector on Kafka Connect]
   │ Avro + Schema Registry
   ▼
[Kafka topic: shop.shop.orders]
   │ 持久化 7 天 + Tiered Storage
   │
   ├──→ [Flink Streaming] ──→ [Iceberg V2 表] ──→ [Spark/Trino 读]
   │      实时聚合              upsert
   │      实时大屏
   │
   ├──→ [Flink Streaming 2] ──→ [ClickHouse ReplacingMergeTree]
   │      实时分析
   │
   └──→ [Kafka Streams / Spark] ──→ [Elasticsearch]
          实时搜索索引
```

**Kafka 作为 fanout 枢纽**:多家下游独立消费同一份 CDC,各自速度、各自重启、各自 schema。这是 Debezium + Kafka 比 Flink CDC 的核心优势。

---

## 十、CDC 工具生态

```
开源:
  Debezium                Red Hat 出,事实标准
  Flink CDC                阿里出,集成 Flink 深
  Maxwell                  Zendesk 出,轻量,MySQL only
  Canal                    阿里出,MySQL only,中国常见
  
商业:
  Confluent Connectors    Debezium 商业 + 企业支持
  Striim                   多源 CDC + 复杂规则
  HVR (Fivetran)           企业级
  Decodable                Flink + CDC SaaS
  
云原生:
  AWS DMS                  跨 DB 同步,内置 CDC
  GCP Datastream           托管 CDC
  Aurora Zero-ETL          AWS 推:Aurora → Redshift 零运维同步
```

---

## 十一、几个常见误区

### 11.1 「CDC 完美一致」

CDC 提供「**最终一致**」+「**事件有序**」,但**不保证下游严格强一致**——下游 sink 写入有延迟,某时刻读到的下游和源库可能有秒级差异。

### 11.2 「CDC 等于实时 ETL」

CDC 只是「**搬数据**」,**T(Transform)还需要 dbt / Flink SQL 等做**。CDC 落到 ODS 之后才是真正建模的开始。

### 11.3 「全部业务表都开 CDC」

不需要。配置表、字典表、低频变更表用全量重算更简单。**只对高频变更 + 实时需求强的表开 CDC**。

### 11.4 「CDC 直接给 BI」

CDC 流落的 ODS 不适合直接给 BI 查(schema 跟源一致,业务不友好)。**至少要经过 stg + mart 层**(参考 25 篇 dbt)。

---

## 十二、看完这一篇,你应该能

- 解释三种 CDC 实现(Query / Trigger / Log-based)以及为什么 Log-based 是生产唯一
- 在白板上画 Debezium + Kafka + Flink + Iceberg 的完整 CDC 链路
- 解释 Snapshot + Streaming 切换的难点(锁库 vs 并发无锁)
- 知道 Flink CDC 跟 Debezium + Kafka 的取舍(简单 vs 多下游)
- 看到 Iceberg V2 + Hudi MoR 知道是 CDC 下游 sink 的优选
- 给团队建议:大事务防御、DDL 演进、DELETE 测试、反压监控、GTID 模式

下一篇:**28 向量数据库** — RAG 时代的新基础设施。pgvector / Milvus / Weaviate / Qdrant / Chroma / LanceDB 怎么选,HNSW / IVF / PQ 算法各自适合什么。
