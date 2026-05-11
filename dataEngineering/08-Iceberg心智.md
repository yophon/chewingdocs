# Iceberg 心智:快照、Hidden Partitioning、时间旅行

2019 年 Netflix 把内部用的 Iceberg 捐给 Apache 时,行业里还有 Hudi 和 Delta 两个对手,大家都说「三足鼎立」。2024 年情况已经很清晰:**Snowflake 推了 Polaris、Databricks Delta 出了 UniForm(写 Delta 同时输出 Iceberg metadata)、AWS / Azure / GCP 都把 Iceberg 列为一等公民**——Iceberg 凭借「**Catalog 解耦 + 引擎中立 + Hidden Partitioning + Schema/Partition 演进零重写**」打赢了开放表格式之争的一半。这一篇画清楚 Iceberg 的三层结构(Catalog → Metadata → Manifest → Data),把「时间旅行」和「Hidden Partitioning」拆到机制层。

> 一句话先记住:**Iceberg 不是新存储引擎,是「给一堆 Parquet 加 metadata 让它变成表」的标准**。它的核心是**「每次写都生成新 metadata.json,旧版本不删 → 时间旅行 + 原子 commit」**,以及**「分区是表元数据的逻辑概念,不再绑死路径」**——这两件让 Iceberg 既比 Hive 灵活又能扛 ACID。

---

## 一、Iceberg 解决了哪些 Hive 的死结

### 1.1 Hive 时代的痛

Hive 表本质是「目录 + Hive Metastore 元数据」:

```
hive.orders            (HMS 记录:表名 → 路径 + schema + partitions)
   │
   └─► s3://bucket/orders/
           date=2025-05-01/
               file-001.parquet
               file-002.parquet
           date=2025-05-02/
               file-003.parquet
```

Hive 的核心问题:

| 痛点 | 表现 |
| --- | --- |
| **无原子提交** | 一次 INSERT 写多个文件,中间挂了留半成品;两个 job 同时写互相覆盖 |
| **list 慢** | 万级分区 × 万级文件,启动 query 几分钟 list |
| **改分区粒度要重写** | 从 day 换 hour,旧数据全部重新分区 |
| **改 schema 有限制** | 加列勉强可以,改列名 / 改类型 / 删列基本不行(数据文件不带 schema) |
| **没时间旅行** | 误删数据找不回,只能从备份恢复 |
| **写双重过滤** | `WHERE dt='2025-05-01' AND event_time > '2025-05-01'` — 一个给 partition,一个给数据 |

### 1.2 Iceberg 的根本变化

把表的「真实状态」从「文件系统结构」搬到「元数据文件」:

```
hive.orders                Iceberg orders
─────────────              ──────────────
                           Catalog (Glue / REST / Nessie)
HMS:                            │  指针指向当前 metadata.json
  路径 + schema +                │  原子 swap = 原子 commit
  分区列表                       ▼
                           metadata.json v5
                              │
                              │  指向当前 snapshot
                              ▼
                           snapshot-5
                              │
                              │  指向 manifest list
                              ▼
                           manifest list
                              │
                              ├─► manifest-001.avro
                              │       │
                              │       └─► data-001.parquet (with stats)
                              │           data-002.parquet (with stats)
                              │
                              └─► manifest-002.avro
                                      └─► data-003.parquet (with stats)
```

**核心创新**:
- **表的"当前状态" = Catalog 里指向哪个 metadata.json**(原子切换)
- **每个 manifest 记录一批 data 文件 + 它们的 partition + 统计**
- **读表 = 读 metadata → 读 manifest → 拿到 data 文件列表(无 list 操作)**

---

## 二、Iceberg 三层结构

### 2.1 全图

```
┌──────────────────────────────────────────────────────────────┐
│  Catalog (外部服务)                                          │
│  ┌────────────────────────────────────────────────┐          │
│  │  shop.orders → s3://bucket/orders/metadata/    │          │
│  │                 v5.metadata.json               │          │
│  └────────────────────────────────────────────────┘          │
│        │  原子 CAS:v5 → v6 替换指针 = commit             │
└────────┼─────────────────────────────────────────────────────┘
         ▼
┌──────────────────────────────────────────────────────────────┐
│  Metadata File (v5.metadata.json)                            │
│   - schema (字段定义 + field-id)                             │
│   - partition spec (分区策略,可演进)                        │
│   - properties (write.format.default 等)                     │
│   - snapshots [snap-1, snap-2, ..., snap-5]                  │
│   - current-snapshot-id: snap-5                              │
│   - sort-order, etc.                                         │
└──────────────────────────────────────────────────────────────┘
         │
         ▼  (指向当前 snapshot)
┌──────────────────────────────────────────────────────────────┐
│  Snapshot (snap-5.avro)                                      │
│   - snapshot-id: 5                                           │
│   - parent-snapshot-id: 4                                    │
│   - timestamp-ms: 1715000000000                              │
│   - operation: append / overwrite / delete                   │
│   - manifest-list: snap-5-manifest-list.avro                 │
│   - summary: added-data-files, deleted-data-files, ...       │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────┐
│  Manifest List (Avro)                                        │
│   - manifest-1: path, partition-summary, added/deleted count │
│   - manifest-2: path, partition-summary, ...                 │
│   - manifest-3: ...                                          │
│   (一次 commit 通常加 1-2 个 manifest)                       │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────┐
│  Manifest (Avro)                                             │
│  每行一个 data file:                                          │
│   - file-path: s3://.../data-001.parquet                     │
│   - file-format: parquet                                     │
│   - partition: {date=2025-05-01}                             │
│   - record-count: 12345                                      │
│   - file-size-in-bytes: 1234567                              │
│   - column-stats: {amount: min=0, max=999, null=0, ...}      │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────┐
│  Data Files (Parquet / ORC / Avro)                           │
│  s3://bucket/orders/data/date=2025-05-01/data-001.parquet    │
│  ...                                                         │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 每一层的角色

| 层 | 文件 | 作用 |
| --- | --- | --- |
| Catalog | (外部服务) | 表名 → 当前 metadata 指针(11 篇展开) |
| Metadata | `*.metadata.json` | 表的全局状态:schema、partition spec、所有 snapshot |
| Manifest List | `*.avro` | 一次 commit 用到哪些 manifest |
| Manifest | `*.avro` | 一组 data files + 它们的 partition + 列统计 |
| Data | `*.parquet` | 实际数据 |

### 2.3 读表流程(为什么没有 list)

```
1. 查 Catalog 拿 orders 表的当前 metadata 路径
2. 读 metadata.json
3. 读 current-snapshot 对应的 manifest list
4. 读 manifest list 里的 manifest files
5. 按 query 谓词裁剪:用 manifest 里的 partition + column-stats
   ① partition 裁剪:WHERE date='2025-05-01' 只看 date partition 匹配的 manifest
   ② column 裁剪:WHERE amount > 100 看 column-stats 跳过 max <= 100 的文件
6. 拿到必须读的 data file 列表 → 直接 GET S3
```

**全程没有 list 操作**,所有信息都在 manifest 里——这是 Iceberg 跟 Hive 在大规模上的根本性能差。

---

## 三、Hidden Partitioning:Iceberg 的最大体验改进

### 3.1 Hive 时代的双重写法

```sql
-- Hive 表分区是物理路径
CREATE TABLE orders_hive (
  id BIGINT,
  amount DECIMAL,
  event_time TIMESTAMP
) PARTITIONED BY (dt STRING);  -- 分区列是 dt 字符串

-- 写时必须手动算 dt
INSERT INTO orders_hive PARTITION (dt='2025-05-01')
SELECT id, amount, event_time
FROM source
WHERE date_format(event_time, 'yyyy-MM-dd') = '2025-05-01';

-- 读时也必须双过滤(否则全表扫)
SELECT * FROM orders_hive
WHERE dt = '2025-05-01'              ← partition filter
  AND event_time >= '2025-05-01'      ← 数据 filter
  AND event_time <  '2025-05-02';
```

**为什么要双过滤**:Hive 引擎只看 dt 做分区裁剪,不知道 dt 和 event_time 的关系——分析师如果只写 `WHERE event_time = ...`,引擎会扫全表。

### 3.2 Iceberg 的隐藏分区

```sql
CREATE TABLE orders (
  id BIGINT,
  amount DECIMAL(10,2),
  event_time TIMESTAMP
) USING iceberg
PARTITIONED BY (days(event_time));   -- 分区是 event_time 的派生

-- 写时不需要算分区
INSERT INTO orders SELECT id, amount, event_time FROM source;

-- 读时只写自然过滤
SELECT * FROM orders WHERE event_time >= '2025-05-01' AND event_time < '2025-05-02';
-- Iceberg 自动用 days(event_time) 做 partition 裁剪
```

### 3.3 内置 Transform 函数

```sql
PARTITIONED BY (
  bucket(16, user_id),     -- hash 分桶,均匀打散
  truncate(10, region),    -- 字符串前 10 字符
  years(event_time),       -- 按年
  months(event_time),      -- 按月
  days(event_time),        -- 按天
  hours(event_time),       -- 按小时
  identity(status)         -- 直接用字段(等价于 Hive 风格)
)
```

**对比 Hive**:Hive 要你**手工**把 event_time 转 dt 字段并写进数据;Iceberg 把这种转换变成 metadata 描述,数据文件本身**不带分区字段**——节省存储、避免双过滤、改分区粒度无痛。

### 3.4 工程价值

- **写代码不算分区字段**:少写 50% 模板代码
- **查询自动下推**:用户不需要懂表的分区策略
- **分区演进**:换粒度时无数据重写

---

## 四、分区演进(Partition Evolution)

### 4.1 现实场景

最初表分区按月:`PARTITIONED BY (months(event_time))`,数据量小没问题。一年后数据量上涨,月分区每个 100GB,query 太慢,想换成日分区。

**Hive 怎么做**:重写所有历史数据,几天计算 + 几 PB 流量费。

**Iceberg 怎么做**:

```sql
ALTER TABLE orders REPLACE PARTITION FIELD months(event_time) WITH days(event_time);
```

- **旧数据保持月分区**,manifest 仍记录 `months=2025-04`
- **新数据按日分区**,manifest 记录 `days=2025-05-01`
- **查询时引擎同时按两种分区裁剪**

### 4.2 分区演进的语义

```sql
-- 加分区字段
ALTER TABLE orders ADD PARTITION FIELD hours(event_time);

-- 改分区粒度
ALTER TABLE orders REPLACE PARTITION FIELD days(event_time) WITH hours(event_time);

-- 删分区字段
ALTER TABLE orders DROP PARTITION FIELD bucket(16, user_id);
```

每个操作只改 metadata,**零数据重写**。这在 Hive 时代是工程奇迹级的体验。

### 4.3 局限

- 旧分区数据仍然按旧策略,**性能不会自动好起来**,要定期 `REWRITE DATA FILES` 重写
- 查询计划稍复杂,需要引擎理解多 partition spec

---

## 五、Schema 演进(零数据重写)

### 5.1 关键:field-id 内部不变

Iceberg 每个字段有个**内部 field-id**(整数),不随字段名变化:

```json
// schema v1
{
  "fields": [
    {"id": 1, "name": "id",         "type": "long"},
    {"id": 2, "name": "user_id",    "type": "long"},
    {"id": 3, "name": "amount",     "type": "double"},
    {"id": 4, "name": "event_time", "type": "timestamp"}
  ]
}

// schema v2 加 coupon_id
{
  "fields": [
    {"id": 1, "name": "id",         "type": "long"},
    {"id": 2, "name": "user_id",    "type": "long"},
    {"id": 3, "name": "amount",     "type": "double"},
    {"id": 4, "name": "event_time", "type": "timestamp"},
    {"id": 5, "name": "coupon_id",  "type": "long"}   ← 新 field-id
  ]
}
```

**Parquet 文件里也存的是 field-id 而不是字段名**(Iceberg 写时配置)。所以:
- 加列:新数据带 id=5,旧数据无 id=5,读时引擎自动填 null
- 删列:metadata 里去掉 id=2,旧文件里 id=2 列存在但被忽略
- 改名:metadata 里 id=2 的 name 从 "user_id" 改成 "uid",数据文件不动
- 改顺序:metadata 重排,数据文件不动

### 5.2 支持的演进

```sql
ALTER TABLE orders ADD COLUMN coupon_id BIGINT AFTER amount;
ALTER TABLE orders DROP COLUMN region;
ALTER TABLE orders RENAME COLUMN user_id TO uid;
ALTER TABLE orders ALTER COLUMN amount TYPE DECIMAL(20,4);  -- 向上扩
ALTER TABLE orders ALTER COLUMN coupon_id AFTER user_id;
```

**支持但有限**:
- 类型扩展(int → long、float → double)OK,反向不行
- 删列后再加同名列:不会复用旧数据(field-id 不同)

---

## 六、时间旅行

### 6.1 每次写都是新 snapshot

```sql
INSERT INTO orders VALUES (...);   -- 生成 snap-1
INSERT INTO orders VALUES (...);   -- 生成 snap-2
UPDATE orders SET amount = ...;    -- 生成 snap-3
DELETE FROM orders WHERE ...;      -- 生成 snap-4
```

每个 snapshot 在 metadata.json 里都留着(直到 expire)。

### 6.2 查询历史快照

```sql
-- 按版本号
SELECT * FROM orders VERSION AS OF 12345;

-- 按时间戳
SELECT * FROM orders TIMESTAMP AS OF '2025-05-01 10:00:00';

-- 用 Spark 函数
SELECT * FROM orders.snapshots;
SELECT * FROM orders.history;
SELECT * FROM orders.files;
```

### 6.3 工程价值

- **误删恢复**:UPDATE 错了 → 查上一个 snapshot 找回数据
- **审计**:谁在什么时候改了什么
- **A/B 实验**:同时跑两个 snapshot 的数据
- **可复现 ML 训练**:训练时记录 snapshot-id,以后能复刻当时的数据状态

### 6.4 代价:snapshot expire

历史 snapshot 不会自动清理(数据文件也不能删,因为还被某个 snapshot 引用)。需要定期:

```sql
CALL system.expire_snapshots('shop.orders', TIMESTAMP '2025-04-01');
-- 删除 2025-04-01 之前的 snapshot
-- 自动 GC 不再被任何 snapshot 引用的 data file
```

未配 expire 的表 → snapshot 累积 + 数据文件不删 → 存储成本爆炸。

---

## 七、维护操作:Iceberg 表的「日常打扫」

### 7.1 Compact(合并小文件)

```sql
-- Spark 调用 Iceberg procedure
CALL system.rewrite_data_files(
  table => 'shop.orders',
  options => map('min-input-files', '5', 'target-file-size-bytes', '536870912')
);
-- 把多个小文件合并成 ~512MB 的大文件
```

为什么必要:**流写入或频繁微批 → 小文件累积 → 元数据爆炸 + 读时 IO 多**。Compact 把它们合并回正常大小。

### 7.2 Rewrite Manifests

```sql
CALL system.rewrite_manifests('shop.orders');
-- 合并多个 manifest 文件,提升后续 plan 性能
```

### 7.3 Expire Snapshots

```sql
CALL system.expire_snapshots('shop.orders', TIMESTAMP '2025-04-01');
-- 同时 GC 不再被引用的数据文件
```

### 7.4 Remove Orphan Files

```sql
CALL system.remove_orphan_files('shop.orders', TIMESTAMP '2025-04-30');
-- 删除 metadata 不再引用的数据文件(失败任务残留的孤儿)
```

### 7.5 Maintenance 调度

生产实践:
- **每天**:Compact + Rewrite Manifests(数据写入频繁的表)
- **每周**:Expire Snapshots(保留 7-30 天历史)
- **每月**:Remove Orphan Files(谨慎,有时间窗口)

Airflow / Dagster 调度跑这些 procedure,**不跑 = 表会慢慢变慢 + 存储慢慢变贵**。

---

## 八、工程落地:从零创建到查询

### 8.1 Spark + REST Catalog

```python
spark = SparkSession.builder \
    .config("spark.sql.extensions", "org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions") \
    .config("spark.sql.catalog.shop", "org.apache.iceberg.spark.SparkCatalog") \
    .config("spark.sql.catalog.shop.type", "rest") \
    .config("spark.sql.catalog.shop.uri", "https://rest-catalog/api") \
    .config("spark.sql.catalog.shop.warehouse", "s3://bucket/warehouse") \
    .getOrCreate()
```

### 8.2 建表

```sql
CREATE TABLE shop.orders (
  id BIGINT,
  user_id BIGINT,
  amount DECIMAL(10,2),
  status STRING,
  event_time TIMESTAMP
) USING iceberg
PARTITIONED BY (days(event_time))
TBLPROPERTIES (
  'write.format.default'='parquet',
  'write.parquet.compression-codec'='zstd',
  'format-version'='2',                  -- V2 支持 row-level delete
  'write.target-file-size-bytes'='536870912'
);
```

### 8.3 写入(批 + 流)

```sql
-- 批写
INSERT INTO shop.orders
SELECT * FROM source_orders;

-- 流写(Flink)
INSERT INTO shop.orders /*+ OPTIONS('upsert-enabled'='true') */
SELECT * FROM kafka_orders;
```

### 8.4 查询

```sql
-- 当前数据
SELECT province, SUM(amount) FROM shop.orders
WHERE event_time >= '2025-05-01'
GROUP BY province;

-- 时间旅行
SELECT * FROM shop.orders TIMESTAMP AS OF '2025-05-01 10:00:00';

-- 看快照历史
SELECT snapshot_id, committed_at, operation, summary
FROM shop.orders.snapshots
ORDER BY committed_at DESC LIMIT 10;

-- 看每个文件的统计
SELECT file_path, record_count, file_size_in_bytes, column_sizes
FROM shop.orders.files
ORDER BY file_size_in_bytes DESC LIMIT 10;
```

### 8.5 维护

```sql
-- 每天
CALL shop.system.rewrite_data_files('orders');

-- 每周
CALL shop.system.expire_snapshots('orders', TIMESTAMP '2025-04-25');
```

---

## 九、谁在用 Iceberg

- **Netflix**(发起方):内部所有数据湖
- **Apple**:大部分 Hive 表迁移到 Iceberg
- **Stripe**:实时 + 离线统一 Iceberg
- **字节(ByteDance)**:推荐 / 风控 / 数仓 + Iceberg + Flink
- **网易、滴滴、Shopee、LinkedIn**:陆续迁移
- **AWS**:Athena / EMR / Redshift 原生支持
- **GCP**:BigQuery 直接读 Iceberg(BigLake)
- **Snowflake**:外部 Iceberg 表支持 + Polaris Catalog 主推
- **Databricks**:Delta 主推但通过 UniForm 输出 Iceberg metadata

**2025 业界事实**:**新建数据湖默认 Iceberg**,除非已经在 Databricks 全家桶里用 Delta。

---

## 十、Iceberg 的局限

### 10.1 维护成本

不跑 compact / expire = 慢慢变慢变贵。需要 ops 投入。

### 10.2 写并发冲突

并发 INSERT 通常 OK(各自 commit 新 snapshot,顺序串行)。
并发 DELETE / UPDATE 同一分区 = 冲突,后写者 retry 或失败。

### 10.3 学习曲线

「分区演进」「Hidden Partitioning」这些概念对 Hive 老兵需要重新学。

### 10.4 流写小文件多

Flink 微批写 Iceberg,每个 checkpoint 一批小文件;不跑 compact 性能逐渐降。

### 10.5 跨引擎一致性

Spark、Trino、Flink 各自的 Iceberg integration 支持度有差异(尤其新特性如 Branching / Tagging)。

---

## 十一、看完这一篇,你应该能

- 在白板上画 Iceberg 的三层:Catalog → Metadata → Manifest List → Manifest → Data
- 解释为什么 Iceberg 读表不 list 文件(manifest 里都有)
- 看到 `PARTITIONED BY (days(event_time))` 知道这是 Hidden Partitioning
- 解释 schema 演进零重写的机制(field-id)
- 解释时间旅行的代价(snapshot 不会自动清理,要 expire)
- 给团队建议:Iceberg 表每天 compact、每周 expire、每月 orphan files

下一篇:**09 Hudi 与 Delta Lake** — Iceberg 不是唯一选项,Hudi 在 upsert / CDC 友好场景仍然强,Delta 在 Databricks 生态深度集成。三家怎么选?
