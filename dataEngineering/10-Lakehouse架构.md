# Lakehouse 架构:为什么不是数据仓库 2.0

2020 年 Databricks 一篇论文《Lakehouse: A New Generation of Open Platforms》给这个词起了名字,意思直白:**数据湖的开放 + 数据仓库的纪律**。十年之前数据圈的世界观是「**仓 vs 湖二选一**」——仓贵但管理严、湖便宜但散乱;十年之后,**Iceberg / Delta / Hudi 给湖加上了 ACID + Schema + Time Travel,湖事实上变成了仓**——这就是 Lakehouse。这一篇画清楚仓、湖、Lakehouse 三种形态的根本差异,Medallion(Bronze/Silver/Gold)分层思想,以及小公司在什么时候不要上 Lakehouse。

> 一句话先记住:**Lakehouse = 对象存储 + 开放表格式 + 计算引擎可替换**——这不是数据仓库 2.0,因为数据仓库 1.0 是「闭源存储 + 绑死引擎 + 一份数据只服务 SQL」;Lakehouse 是「开放存储 + 任何引擎 + ML / SQL / Streaming 共享一份数据」。**性质完全不同**。

---

## 一、回顾:仓和湖各自的死结

### 1.1 数据仓库(2000-2015 主流)

**代表**:Teradata、Oracle Exadata、IBM DW、Vertica;后来的 Snowflake、BigQuery、Redshift。

**优势**:
- 强 schema、ACID、SQL 完备
- 性能优化深(列存、索引、向量化、MPP)
- 用户体验好(分析师直接 SQL)
- 治理工具成熟

**死结**:
- **贵**:按计算资源 + 存储付费,大数据量场景成本爆炸
- **闭源格式**:数据进仓就是某家产品的私有格式,迁出难
- **绑死计算引擎**:Snowflake 数据只能 Snowflake 算,不能让 Spark 直接读
- **ML 不友好**:训练要数据,但仓里的格式不让你直接读文件,只能 export
- **半结构化 / 非结构化数据弱**:JSON / 图片 / 视频 / 长文本要塞进仓很别扭

### 1.2 数据湖(2010-2020 主流)

**代表**:HDFS + Parquet + Spark / Hive;S3 + Spark + Hive Metastore。

**优势**:
- **便宜**:对象存储一字节几分钱,Spark on K8s 弹性算力
- **开放格式**:Parquet 是公开标准,任何引擎能读
- **ML / SQL / Streaming 共享同一份数据**:S3 上的 Parquet,Spark 跑 ML,Trino 跑 SQL,Flink 写流式
- **半结构化 / 非结构化也能存**:JSON / 文本 / 图片直接扔

**死结**:
- **无 ACID**:多写者乱写、读到半截写入
- **无 Schema 强约束**:字段一变下游全炸
- **元数据混乱**:几万个分区下 list 慢死、文件没人管累积小文件
- **没事务、没时间旅行、没版本**:误删数据找不回
- **「数据沼泽」**:大公司一年后,湖里几万张「不知道谁建的、不知道有没有人用、schema 是啥」的表

仓和湖各有死结,业界做了十年的「双线作战」——湖里灌原始数据,转换后导仓,**两边各跑一套,数据冗余,口径不一致**。

---

## 二、Lakehouse:把湖加上仓的纪律

### 2.1 三件套

```
对象存储          S3 / OSS / GCS / MinIO
                  ─────────────────────
                     便宜、无限大、11 个 9 持久
   +
开放表格式        Iceberg / Delta / Hudi
                  ─────────────────────
                     ACID、Schema 演进、Time Travel
                     Hidden Partitioning、原子 commit
   +
计算引擎可换      Spark / Flink / Trino / DuckDB / Snowflake
                  ─────────────────────
                     无状态、弹性、按需,引擎不绑数据
   +
Catalog          Glue / Nessie / Unity / Polaris / REST
                  ─────────────────────
                     表名映射、权限、血缘
   
= Lakehouse
```

### 2.2 为什么不是数据仓库 2.0

| 维度 | 数据仓库 | Lakehouse |
| --- | --- | --- |
| 存储 | 闭源 + 绑引擎 | 开放(Parquet)+ 不绑引擎 |
| 计算 | 绑死(Snowflake 数据只能 Snowflake 算) | 解耦(同一份数据多引擎) |
| ML 支持 | 弱(要 export) | 原生(直接读 Parquet) |
| 半结构化 | 弱(强 schema 约束) | 强(schema 演进灵活) |
| 流处理 | 弱(微批写入限制多) | 原生(Flink / Spark Streaming 直接写) |
| 成本 | 高(按计算节点) | 低(对象存储 + 弹性计算) |
| 治理 | 成熟 | 后来居上(Unity / Polaris)|

**关键差别**:数据仓库的数据进了之后,**你只能用这家产品的引擎**;Lakehouse 的数据在 S3 上,**任何能读 Iceberg / Delta / Parquet 的引擎都能读**。

### 2.3 「数据湖 2.0」的说法也不准

数据湖 2.0 听起来像「升级版的湖」,但 Lakehouse 改变了根本属性:**它有 ACID、有 schema、有时间旅行**——这些是仓的属性,不是湖的属性。所以**「Lakehouse 是湖和仓的融合」**,不是单纯的湖升级。

---

## 三、Medallion 架构:Bronze / Silver / Gold

Databricks 推广的湖仓分层模式,概念跟中国数仓圈的 ODS/DWD/DWS/ADS 高度对应:

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   Bronze (青铜)                  原始数据,几乎不动      │
│   ─────────────                  ↑ 等价于 ODS           │
│   • 从 CDC / Kafka / API 接进来  • Schema 跟随源        │
│   • 落 Iceberg,基本无转换       • 保留 raw 字段        │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   Silver (银)                    清洗、关联维度          │
│   ─────────────                  ↑ 等价于 DWD            │
│   • 字段标准化、去重、补缺       • 业务可读              │
│   • Join 维度表                  • 模型可用              │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   Gold (金)                       聚合、业务主题         │
│   ─────────────                   ↑ 等价于 DWS + ADS    │
│   • 按时间 / 维度聚合             • 直接喂 BI 报表       │
│   • 按业务主题组装                • 喂模型 / API         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 3.1 分层的根本价值

- **隔离上下游变化**:Bronze schema 跟源,Silver / Gold 用 dbt 规范化,源变了 Silver 改一遍即可
- **回溯成本可控**:Gold 改逻辑 → 只重跑 Silver → Gold,不需要从 Bronze 重新清洗
- **质量隔离**:Bronze 允许脏数据,Silver 强 schema,Gold 业务最终
- **权限分层**:Bronze 只给数据工程师,Silver 给分析师,Gold 给业务

### 3.2 工程实现

```sql
-- Bronze:从 CDC 直接落
CREATE TABLE bronze.orders USING iceberg
PARTITIONED BY (days(ingestion_time))
AS SELECT *, current_timestamp() AS ingestion_time
FROM kafka_orders_cdc;

-- Silver:清洗 + 关联维度(用 dbt)
{{ config(materialized='incremental', unique_key='id') }}
SELECT 
  o.id, o.user_id, o.amount, o.status,
  u.province, u.user_segment,
  o.event_time
FROM {{ ref('bronze_orders') }} o
LEFT JOIN {{ ref('dim_users') }} u USING (user_id)
WHERE o.status NOT IN ('test', 'cancelled')
  AND o.amount > 0
{% if is_incremental() %}
  AND o.event_time > (SELECT MAX(event_time) FROM {{ this }})
{% endif %}

-- Gold:按业务主题聚合
SELECT 
  DATE_TRUNC('day', event_time) AS day,
  province, user_segment,
  SUM(amount) AS gmv,
  COUNT(DISTINCT user_id) AS dau
FROM {{ ref('silver_orders') }}
GROUP BY 1, 2, 3
```

---

## 四、Lakehouse 的完整拓扑

```
            ┌──────────────────────────────────────────┐
            │           消费层                         │
            │  BI / 实时大屏 / 推荐 / RAG / 模型训练   │
            └──────────────────────────────────────────┘
                       ▲              ▲             ▲
                       │              │             │
┌──────────────────────┴──────────────┴─────────────┴──────────┐
│           计算引擎层(共享一份数据)                          │
│  ┌──────────┐ ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌──────┐│
│  │ Spark    │ │ Flink   │ │ Trino   │ │ Snowflake│ │DuckDB││
│  │ (批+ML)  │ │ (流)    │ │ (交互)  │ │ (托管)   │ │(单机)││
│  └──────────┘ └─────────┘ └─────────┘ └──────────┘ └──────┘│
└────────────────────────────┬──────────────────────────────────┘
                             │  通过 Catalog API 找到表
                             ▼
┌─────────────────────────────────────────────────────────────┐
│           Catalog 层                                        │
│  Glue / Nessie / Unity / Polaris / REST Catalog             │
│  (表名 → 当前 metadata 位置 + 权限 + 血缘)                  │
└────────────────────────────┬─────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────┐
│           表格式层(metadata)                               │
│  Iceberg / Delta / Hudi                                     │
│  (snapshot / manifest / commit log)                         │
└────────────────────────────┬─────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────┐
│           对象存储                                          │
│  S3 / OSS / GCS / MinIO                                     │
│  (Parquet data files,海量便宜)                             │
└─────────────────────────────────────────────────────────────┘
```

每一层都是「**开放标准 + 可替换实现**」——这是 Lakehouse 跟数据仓库的根本区别。

---

## 五、工程落地:四引擎读同一张表

### 5.1 Spark 写 Iceberg

```python
spark = SparkSession.builder \
    .config("spark.sql.extensions", "...IcebergSparkSessionExtensions") \
    .config("spark.sql.catalog.shop", "org.apache.iceberg.spark.SparkCatalog") \
    .config("spark.sql.catalog.shop.catalog-impl", "...RESTCatalog") \
    .config("spark.sql.catalog.shop.uri", "https://catalog/api") \
    .getOrCreate()

(spark.read.json("s3://raw/orders/*.json")
     .write.mode("append")
     .saveAsTable("shop.bronze.orders"))
```

### 5.2 Trino 读同表做交互 SQL

```ini
# /etc/trino/catalog/iceberg.properties
connector.name=iceberg
iceberg.catalog.type=rest
iceberg.rest-catalog.uri=https://catalog/api
```

```sql
SELECT province, SUM(amount) FROM shop.bronze.orders
WHERE event_time >= DATE '2025-05-01'
GROUP BY province;
```

### 5.3 DuckDB 在笔记本探索

```sql
INSTALL iceberg;
LOAD iceberg;

ATTACH 'iceberg-catalog' AS shop (TYPE iceberg, URI 'https://catalog/api');

SELECT * FROM shop.bronze.orders WHERE event_time = DATE '2025-05-01' LIMIT 10;
```

### 5.4 Snowflake 外部表

```sql
CREATE EXTERNAL CATALOG INTEGRATION my_iceberg
  CATALOG_SOURCE = ICEBERG_REST
  TABLE_FORMAT = ICEBERG
  REST_CONFIG = (...)
  CATALOG_NAMESPACE = 'shop';

SELECT * FROM my_iceberg.shop.bronze.orders;
```

**同一份数据**,四种引擎读;**写入也只需要一处**(Spark 批 / Flink 流)。这就是 Lakehouse 的核心红利:**数据不动,引擎来读**。

---

## 六、Lakehouse 不是免费午餐

### 6.1 元数据维护成本

- Iceberg 表要定期 compact、expire snapshot、rewrite manifests
- Catalog 服务要 HA、监控、备份
- 没维护 → 表慢慢变慢、存储慢慢变贵

**这是 Lakehouse 比 Snowflake 不爽的地方**——后者全托管,前者要团队投资 ops。

### 6.2 性能仍不如专门优化的仓

```
Snowflake / BigQuery / Redshift:
  深度优化 Cache / 索引 / 调度
  PB 级查询表现稳定
  毫秒级元数据操作

Lakehouse (Iceberg + Trino):
  Cold 查询要现读 S3 metadata
  并发能力依赖引擎(Trino 限制几百并发)
  Cache 层需要自己接(Alluxio / 引擎自带)
```

**事实**:专门仓在 「交互式 BI / 毫秒级响应 / 高并发」 场景仍然更顺手。Lakehouse 在批量、大表、ML、流式更强。

### 6.3 治理工具仍在赶

仓的权限模型、审计、行级安全、列级脱敏成熟;Lakehouse 这边 Unity / Polaris 在追,但仍落后 1-2 年。

---

## 七、什么时候不要上 Lakehouse

### 7.1 数据量小

```
< 10 TB / 全表          → PostgreSQL + dbt 够用
                          一键备份、运维成本极低

10-100 TB              → ClickHouse / Doris / StarRocks
                          OLAP 专用,数据量上限挺高

100 TB - PB 级          → 考虑 Lakehouse,但也可考虑 Snowflake 一把梭

> PB,多源,多团队       → Lakehouse 才有优势
```

### 7.2 没有 ops 团队

Lakehouse 是「DIY 仓」,**需要团队会管 Catalog、compaction、调度**。如果团队就 2-3 个工程师 + 没专门数据平台人,**Snowflake / BigQuery 一把梭更省心**。

### 7.3 强强查询优化场景

如果业务核心是「BI 仪表盘 + 高并发即席查询」,Snowflake / BigQuery 体验仍然强。Lakehouse 在这类场景需要堆较多优化(Trino 调优、Cache 层)。

---

## 八、什么时候必须上 Lakehouse

### 8.1 数据量大 + 多源

PB 级数据 + 多种数据形态(结构化、半结构化、文件、流式),仓装不下或太贵。

### 8.2 ML / AI 是主要消费者

机器学习管道要读原始数据训练,Lakehouse 让 Spark / PyTorch 直接读 Parquet,不需要 export。AI 时代特别重要(29 / 30 篇展开)。

### 8.3 强开放 / 多云

数据要在 AWS、Azure、GCP 之间流转、不想绑死一家云厂。Lakehouse 的开放格式让数据可迁移。

### 8.4 流式 + 批式 一份数据

实时大屏 + 离线 ETL + 模型训练共享一份事实表(参考 04 篇混合架构),Lakehouse 是事实标准。

---

## 九、几个常见误区

### 9.1 「上了 Iceberg 就是 Lakehouse 了」

技术上对,但工程上不够:
- 没 Catalog → 表散乱在 S3
- 没维护脚本 → 表慢慢炸
- 没建模规范 → Bronze / Silver / Gold 分不清
- 没数据质量 → 数据沼泽 2.0

**Lakehouse 是一套工程实践,不是某个开源项目**。

### 9.2 「Snowflake 是 Lakehouse」

Snowflake 一开始是「云原生数据仓库」(闭源格式 + 绑死引擎),后来加了 **External Tables / Iceberg Support / Polaris** 才有了 Lakehouse 能力——**但它的核心存储仍然是闭源**。

精确说:Snowflake 提供「**Lakehouse 兼容能力**」,但本质仍是云仓。

### 9.3 「我们直接用 Databricks 就行」

Databricks 是 Lakehouse 最深度的产品化平台(Unity + Delta + Photon + ML),但你**会绑死在 Databricks 上**——Delta 数据虽然格式开放,但 Photon、Unity、Liquid Clustering 都是 Databricks 闭源能力。

UniForm 给了你「随时迁出」的选项,但实际迁移有工程量。

### 9.4 「Lakehouse 杀死数据仓库」

不会。数据仓库在「**强托管 + 强 SQL 体验 + 高并发交互查询**」场景仍然好,**Lakehouse 在「开放 + 多消费者 + 大数据量」场景强**。两者会长期共存,大公司经常两个都用:**仓做核心 BI,Lakehouse 做 ML / 流式 / 归档**。

---

## 十、看完这一篇,你应该能

- 在白板上画 Lakehouse 的四层:对象存储 / 表格式 / Catalog / 引擎
- 解释 Lakehouse 跟数据仓库的根本差异(开放 vs 闭源、解耦 vs 绑死)
- 默写 Medallion 三层(Bronze / Silver / Gold)和它们对应的 ODS / DWD / DWS+ADS
- 给小公司建议:不要一上来上 Lakehouse,从 PG / Snowflake / ClickHouse 起步
- 看到「Snowflake 是 Lakehouse 吗」回答得清楚
- 解释 Lakehouse 的代价(运维、性能、治理)

下一篇:**11 Catalog 与元数据** — Lakehouse 三件套里最容易被忽略但最关键的一层:Catalog 是什么,Hive Metastore 怎么过时,Unity / Polaris / Nessie 在抢什么。
