# Hudi 与 Delta Lake:三剑客在哪里各自更强

2018-2020 那两年,数据湖圈三个开源表格式同时崛起:**Netflix 的 Iceberg、Uber 的 Hudi、Databricks 的 Delta**——业界叫「三剑客」,几乎所有大公司选哪个时都打过架。五年过去格局清晰多了:**Iceberg 赢了"中立 Catalog"+"引擎不绑死",Hudi 赢了"upsert / CDC 友好",Delta 赢了"Databricks 生态深度集成"**——三家在 metadata 层最终趋同(Delta UniForm + Iceberg REST + Hudi Iceberg Compat)。这一篇拆三家的差异、各自擅长的场景、以及 2025 年怎么选。

> 一句话先记住:**Iceberg / Hudi / Delta 解决的都是"给一堆 Parquet 加 ACID"**,但出发点不同:Iceberg 从一开始就是「引擎中立」,Hudi 是「为 CDC / upsert 优化」,Delta 是「Databricks 平台一部分」。选型不是「谁最强」,是「你在哪个生态、要什么核心能力」。

---

## 一、三家的出身和定位

### 1.1 时间线

```
2017  Hudi   (Uber 内部:订单数据要 upsert + 增量查询)
2017  Delta  (Databricks 内部:Spark 上想要 ACID)
2018  Iceberg (Netflix 内部:Hive 表治理炸了)

2018  Hudi 捐 Apache
2019  Iceberg 捐 Apache
2019  Delta 开源(部分;Delta 1.0 加全功能 2021)

2024  三家在 metadata 互通(Delta UniForm / Iceberg REST / Hudi Iceberg Compat)
```

### 1.2 主推方与定位

| | Iceberg | Hudi | Delta Lake |
| --- | --- | --- | --- |
| 主推方 | Netflix → Apache → AWS / Snowflake / GCP | Uber → Apache → Onehouse | Databricks |
| 定位 | 引擎中立的开放表格式标准 | upsert / CDC 友好的湖仓 | Databricks 平台一等公民 |
| Catalog | REST / Glue / Nessie / Polaris | Hive Metastore / Glue | Unity Catalog(Databricks)|
| 默认数据格式 | Parquet(也支持 ORC / Avro) | Parquet + Avro log | Parquet |
| 2025 状态 | 业界默认 | 流式 upsert 强势,Onehouse 商业化 | Databricks 内强,外慢慢失守 |

---

## 二、心智图:三种 metadata 组织方式

### 2.1 Iceberg(回顾 08 篇)

```
metadata.json (snapshot 列表 + schema)
   ↓
manifest list
   ↓
manifest (一组 data files + 它们的 partition + stats)
   ↓
data files (Parquet,immutable)
```

每次写:新 manifest → 新 manifest list → 新 metadata.json → Catalog 原子切指针。

### 2.2 Hudi 两种表模型

```
COW (Copy-on-Write)            MOR (Merge-on-Read)
───────────────────            ────────────────────
.hoodie/timeline               .hoodie/timeline
  (Instant 文件:commit/clean...)
  
base files (Parquet)            base files (Parquet)
  ↑                              + log files (Avro 增量)
  ↑
  写时合并:                     读时合并:
  新数据 + 旧 base 文件          读时把 log apply 到 base
  → 整个 file group 重写         
  → 写慢、读快                   → 写快、读时合并
```

**核心差异**:Hudi 表里同时有「**base files**(列存)」和「**log files**(行存增量 + 删除标记)」。MOR 模式下,update / delete 先写 log,定期 compact 合并到 base;COW 模式下每次更新都重写 base。

### 2.3 Delta Lake

```
_delta_log/
   00000000000000000000.json   ← commit 0
   00000000000000000001.json   ← commit 1
   ...
   00000000000000000010.checkpoint.parquet  ← 每 10 个 commit 一个 checkpoint
   
data files (Parquet,immutable)
```

**Delta 的 metadata 长得最像传统数据库 WAL**:每次 commit 一个 JSON(add / remove file 操作),定期把 JSON 们 fold 成 Parquet checkpoint 加速 plan。

---

## 三、关键能力对比

### 3.1 ACID & 时间旅行

| | Iceberg | Hudi | Delta |
| --- | --- | --- | --- |
| ACID | ✅ snapshot 切换 | ✅ instant 序列 | ✅ commit log |
| Time Travel | `VERSION AS OF` / `TIMESTAMP AS OF` | `as.of.instant` | `VERSION AS OF` / `TIMESTAMP AS OF` |
| MVCC | snapshot 多版本 | instant 序列 | commit 序列 |

三家都做得不错,基本上**对用户体验差异不大**。

### 3.2 写并发模型

| | Iceberg | Hudi | Delta |
| --- | --- | --- | --- |
| 并发 append | 高(乐观锁 commit retry) | 高 | 高 |
| 并发 update 同分区 | 冲突,retry / fail | OCC 或 NB-CC(非阻塞) | 冲突,retry / fail |
| 多 writer | 支持 | 支持 + 协调器(Lock Provider) | 支持(Databricks 用 Unity) |

Hudi 在多 writer 场景做得最深(因为 Uber 内部就是流式 CDC + 离线批 同时写)。

### 3.3 Upsert / Delete(行级更新)

**这是 Hudi 最强的地方**。

```
场景:CDC 从 MySQL Binlog 同步过来,
      每秒几千条 update,要写到湖里

Iceberg V2(2022 才加):
  equality delete:写一行 (pk, delete_marker)
  position delete:写 (file_path, row_pos, delete_marker)
  ↑ 性能、并发都不如 Hudi MOR

Hudi MOR:
  upsert 写到 log file,compact 时合并到 base
  特化的索引(Bloom / Bucket / Record Level)定位 pk
  
Delta:
  MERGE INTO 是 OK 的,但每次都重写文件(类似 COW)
  Liquid Clustering 提升后续 query
```

**结论**:
- 高频 upsert 流 → **Hudi MOR**
- 中频 update + 主要批量 → **Iceberg V2 / Delta**
- 不需要 update,只 append → **Iceberg 最简单**

### 3.4 增量查询(Incremental Query / CDC out)

Hudi 原生支持「拉取最近 N 次 commit 的变更」:

```sql
SELECT * FROM hudi_orders
/*+ OPTIONS('hoodie.datasource.query.type'='incremental',
            'hoodie.datasource.read.begin.instanttime'='20250501100000') */
;
-- 返回从指定 instant 之后所有变更的记录
```

Iceberg 和 Delta 也有类似:
- Iceberg: `CALL system.read_changes(...)` (1.4+ 实验性)
- Delta: `CDF (Change Data Feed)`,1.0+

但**Hudi 在这一块最成熟**——这跟它「为 CDC 而生」的出身相关。

### 3.5 Schema / Partition 演进

| | Iceberg | Hudi | Delta |
| --- | --- | --- | --- |
| Schema 演进 | 强(field-id) | 中(改名受限) | 中(列重命名 1.2+) |
| 分区演进 | **强**(零重写) | 弱(改分区要 rewrite) | 弱 |
| Hidden Partitioning | ✅ | ❌(传统 Hive 风格) | ❌(传统;Liquid Clustering 替代) |

**Iceberg 在演进能力上是三家最强的**。

### 3.6 性能优化能力

| | Iceberg | Hudi | Delta |
| --- | --- | --- | --- |
| 数据排序 | `WRITE ORDERED BY` | `clustering` | `OPTIMIZE ZORDER BY` |
| 多维聚簇 | sort + bucket | clustering + bucket | **Z-Order + Liquid Clustering**(强) |
| Compact | `rewrite_data_files` | `compact` action | `OPTIMIZE` |
| File pruning | manifest stats + bloom | base + log stats | stats in commit log + checkpoint |

**Delta 在 Liquid Clustering(2023 引入)上是最先进的**——多维度自适应聚簇,无需手动排序。但只在 Databricks 上才完全可用。

---

## 四、Hudi 深入:MoR vs CoW

### 4.1 决策树

```
写多读少 + 频繁 upsert       → MOR
                                CDC、订单变更、用户状态
                                
写少读多 + 偶尔 update        → COW
                                日志、事件、不变事实
```

### 4.2 MoR 的工作流

```
T1  upsert (id=1, amount=99)
    → 写 log-1.avro: (id=1, amount=99)
T2  upsert (id=1, amount=100)  
    → 写 log-1.avro: (id=1, amount=100)
T3  upsert (id=2, amount=50)
    → 写 log-1.avro: (id=2, amount=50)

读时:
    读 base file 010.parquet + log-1.avro
    apply log:得到最终状态 [(id=1, amount=100), (id=2, amount=50)]
    
Compact (定期):
    base + log → 新 base file 020.parquet
    旧 log 可清理
```

**读放大**:每次读都要 merge log,所以 read 性能跟「log 距离上次 compact 多久」相关。

### 4.3 Hudi 的索引

Hudi 必须知道「这个 pk 上次写到哪个 file group」才能做 upsert。提供多种索引:

| 索引类型 | 用途 |
| --- | --- |
| **Bloom Index** | 默认,用 pk Bloom Filter 定位 |
| **Simple Index** | 全表扫,慢但准 |
| **Bucket Index** | 按 hash(pk) 固定到 bucket,O(1) |
| **HBase Index** | pk → file 映射存 HBase |
| **Record Level Index**(1.0+) | 内置索引,接近 KV 查找 |

**写性能极大依赖索引选型**——这是 Hudi 用户最容易踩坑的地方。

---

## 五、Delta Lake 深入

### 5.1 commit log 模型

```
_delta_log/00000000000000000000.json:
{"add": {"path": "part-001.parquet", "size": 1234, "stats": "..."}}
{"add": {"path": "part-002.parquet", ...}}

_delta_log/00000000000000000001.json:
{"remove": {"path": "part-001.parquet", ...}}
{"add": {"path": "part-003.parquet", ...}}
```

每次 commit 一个 JSON 文件,记录 add / remove 哪些 data file。

### 5.2 MERGE INTO(Delta 最爽的 API)

```sql
MERGE INTO orders AS t
USING orders_updates AS s
ON t.id = s.id
WHEN MATCHED THEN UPDATE SET *
WHEN NOT MATCHED THEN INSERT *;
```

这套 SQL 在 Delta 里写起来最直接(Iceberg / Hudi 也有类似,Delta 因为 Databricks 推广最深入开发者社区)。

### 5.3 Z-Order 和 Liquid Clustering

```sql
-- 传统 OPTIMIZE
OPTIMIZE orders;

-- Z-Order:多维数据聚簇
OPTIMIZE orders ZORDER BY (user_id, product_id);
-- 把多个高频过滤字段在文件内联合排序
-- 查询 WHERE user_id=X AND product_id=Y 时跳得更多

-- Liquid Clustering(2023+,Databricks 主推)
CREATE TABLE orders ... CLUSTER BY (user_id, product_id);
-- 自适应聚簇,无需周期性 OPTIMIZE
-- 写入时自动维护
```

**Liquid Clustering 是 Delta 当下的杀手锏**——比 Z-Order 更智能、与 Hudi/Iceberg 拉开身位。但**仅在 Databricks 上全功能可用**。

### 5.4 UniForm:输出 Iceberg metadata

2024 年 Delta 引入 UniForm:**写 Delta 时,自动生成对应的 Iceberg metadata**——非 Databricks 引擎可以当 Iceberg 表读。

```sql
CREATE TABLE orders (...) USING delta
TBLPROPERTIES (
  'delta.universalFormat.enabledFormats' = 'iceberg'
);
```

这是 Databricks 对「Iceberg 已成行业标准」的让步——**让你继续在 Databricks 用 Delta 写,外部生态用 Iceberg 读**。

---

## 六、Iceberg 的反击:V2 + REST Catalog

### 6.1 V2 表(行级 delete)

2022 年 Iceberg V2 加 row-level delete:

```
position delete:   (file_path, row_position) → 删第 N 行
equality delete:   (pk_value) → 删 pk = X 的所有行
```

填补 Hudi 在 update / delete 场景的优势。

### 6.2 REST Catalog

2023 年 Iceberg 主推 REST Catalog 协议:任何引擎(Spark / Trino / Flink / DuckDB / Snowflake / BigQuery)按统一 REST API 读写 Iceberg。Polaris、Nessie、Tabular(已被 Databricks 收购)都实现 REST Catalog。

**这是 Iceberg 拉开 Delta 距离的根本**——开放协议,不依赖某一家平台。

---

## 七、选型决策树

```
你在 Databricks 全家桶
  → Delta(默认,UniForm 兼顾 Iceberg)

你在 Snowflake / AWS / GCP / 自建
  → Iceberg(REST Catalog / Glue / Polaris)

你的主要 workload 是 CDC 同步 / 高频 upsert
  → Hudi MOR(其他两家都差)
  或 Iceberg V2(简单场景够用)

你想跨平台 / 多引擎
  → Iceberg

你团队已经在用其中之一
  → 继续用,不要折腾
```

---

## 八、工程落地:三家最小可跑示例

### 8.1 Hudi MOR + Upsert

```python
from pyspark.sql import SparkSession

spark = SparkSession.builder \
    .config("spark.jars.packages",
            "org.apache.hudi:hudi-spark3.5-bundle_2.12:0.15.0") \
    .config("spark.sql.extensions",
            "org.apache.spark.sql.hudi.HoodieSparkSessionExtension") \
    .getOrCreate()

# 建 MoR 表
spark.sql("""
CREATE TABLE shop.orders (
  id BIGINT,
  user_id BIGINT,
  amount DECIMAL(10,2),
  event_time TIMESTAMP
) USING HUDI
TBLPROPERTIES (
  primaryKey = 'id',
  preCombineField = 'event_time',
  type = 'mor'
)
PARTITIONED BY (DATE_FORMAT(event_time, 'yyyy-MM-dd'))
""")

# Upsert
df = spark.read.parquet("/source/orders_updates")
df.write.format("hudi") \
    .option("hoodie.datasource.write.operation", "upsert") \
    .option("hoodie.datasource.write.precombine.field", "event_time") \
    .option("hoodie.datasource.write.recordkey.field", "id") \
    .mode("append") \
    .save("s3://bucket/orders")
```

### 8.2 Delta MERGE INTO

```python
spark = SparkSession.builder \
    .config("spark.jars.packages", "io.delta:delta-spark_2.12:3.2.0") \
    .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension") \
    .config("spark.sql.catalog.spark_catalog",
            "org.apache.spark.sql.delta.catalog.DeltaCatalog") \
    .getOrCreate()

spark.sql("""
CREATE TABLE orders (id BIGINT, user_id BIGINT, amount DECIMAL(10,2), event_time TIMESTAMP)
USING DELTA
LOCATION 's3://bucket/orders'
""")

spark.sql("""
MERGE INTO orders AS t
USING orders_updates AS s
ON t.id = s.id
WHEN MATCHED THEN UPDATE SET *
WHEN NOT MATCHED THEN INSERT *
""")

# Z-Order 聚簇
spark.sql("OPTIMIZE orders ZORDER BY (user_id)")
```

### 8.3 Iceberg V2 + Equality Delete(Flink CDC)

```sql
-- Flink SQL
CREATE TABLE iceberg_catalog.shop.orders (
  id BIGINT,
  user_id BIGINT,
  amount DECIMAL(10,2),
  event_time TIMESTAMP(3),
  PRIMARY KEY(id) NOT ENFORCED
) PARTITIONED BY (days(event_time))
WITH ('format-version'='2', 'write.upsert.enabled'='true');

-- Flink CDC source
CREATE TABLE mysql_orders (...) WITH ('connector'='mysql-cdc', ...);

INSERT INTO iceberg_catalog.shop.orders SELECT * FROM mysql_orders;
-- Flink 自动用 equality delete 处理 update / delete
```

---

## 九、未来:三家会合并吗

### 9.1 metadata 层互通

- Delta UniForm:写 Delta + 输出 Iceberg metadata
- Hudi 1.0:加入 Iceberg Compat Mode
- Apache XTable(原 OneTable,2023):跨格式元数据翻译,**写一份数据,三家 metadata 都可读**

**未来读端可能就一种格式(Iceberg metadata)**,写端按场景选(Hudi 强 upsert、Delta 强 Databricks、Iceberg 强中立)。

### 9.2 商业化博弈

- Databricks:推 Delta + 收购 Tabular(Iceberg 创始团队)→ 想"两手都要"
- Snowflake:推 Polaris(Iceberg)→ 全力 Iceberg
- AWS:全栈支持 Iceberg(S3 Tables 2024 GA)
- Onehouse(Hudi 创始团队商业化):流式数据湖平台

2025 的工程师视角:**核心选型仍是格式 + 引擎 + Catalog 三件**,但跨格式互通已经在路上。

---

## 十、看完这一篇,你应该能

- 在白板上画 Iceberg / Hudi / Delta 三种 metadata 组织方式的差异
- 解释 Hudi MOR vs COW 的取舍(写多读少 vs 写少读多)
- 知道 Hudi 在 CDC / upsert 场景为什么强(log + 索引 + 增量查询)
- 知道 Delta 在 Databricks 内的优势(Liquid Clustering、Unity Catalog 深度集成)
- 看到 UniForm / Iceberg Compat / XTable 知道三家在 metadata 层趋同
- 给团队选型不抓瞎(跟生态选,不跟流行选)

下一篇:**10 Lakehouse 架构** — 把对象存储 + 表格式 + 计算引擎拼起来叫什么?为什么它既不是数据仓库也不是数据湖,而是一种新形态?
