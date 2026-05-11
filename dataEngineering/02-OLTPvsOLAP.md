# OLTP vs OLAP:为什么不能用一个数据库通吃所有事

下单时 MySQL 0.5 ms 返回插入成功,你以为数据库就是这样;运营要看「过去一年各省份各品类 GMV 月度趋势」,你照着写 SQL 给 MySQL,跑了 47 分钟超时——**同一台数据库,处理不同形状的查询,性能能差几个数量级**。这不是 MySQL 不行,是你**让一个面向事务的引擎,去干面向分析的活**——就像让赛车跑越野,马力再强也得趴窝。这一篇讲清楚 OLTP 和 OLAP 是两个完全不同的负载,引擎的内部组织从存储到查询执行从根上不一样,以及 HTAP 这套「合二为一」的承诺到底兑现了多少。

> 一句话先记住:**OLTP 优化「单行高频读写 + 事务」,OLAP 优化「全表扫描 + 聚合」**——前者用 B+ 树 + WAL + 行存 + MVCC,后者用列存 + 向量化 + 大块顺序读。**两套设计目标互相打架,不是一台数据库能同时做好的事**。HTAP 是把两套引擎装一个壳里,不是变出一个万能引擎。

---

## 一、两类负载的根本差异

### 1.1 一张表把负载特征对清楚

| 维度 | OLTP(Online Transaction Processing) | OLAP(Online Analytical Processing) |
| --- | --- | --- |
| 典型操作 | `INSERT/UPDATE/SELECT WHERE id=?` | `SELECT SUM(...), GROUP BY ... WHERE date BETWEEN ...` |
| 数据形状 | 单行或几行,带索引点查 | 全表扫描或大范围扫描,聚合 |
| 并发模型 | 几千到几万 TPS,事务隔离级别 | 几个到几十个并发,长查询 |
| 一次访问数据量 | KB 级 | GB 到 TB 级 |
| 延迟要求 | 毫秒 | 秒到分钟 |
| 一致性要求 | 强(ACID) | 弱(分析侧能接受最终一致) |
| 写入特征 | 频繁、小批量、随机 | 批量灌入(几小时一次或流式) |
| 存储格式 | **行存**(B+ 树 / LSM) | **列存**(Parquet / ORC / 内部列式) |
| 典型代表 | MySQL / PostgreSQL / Oracle / SQL Server | ClickHouse / Doris / Snowflake / BigQuery / Redshift |
| 数据量上限 | 单表千万级,过亿要分库 | 单表千亿级到万亿,分区即可 |

「OLTP」和「OLAP」是 1993 年 Codd 命名的(对,就是关系模型那个 Codd),三十年过去这个分法仍然成立——**因为底层硬件和需求形状没变,变的只是各自的工具**。

### 1.2 一个具体例子的对照

电商订单表 1 亿行。两个查询:

```sql
-- 查询 A:OLTP 典型
SELECT * FROM orders WHERE user_id = 12345;
-- MySQL: 走 user_id 索引,几十毫秒,秒级千 QPS

-- 查询 B:OLAP 典型
SELECT province, category, SUM(amount), COUNT(*)
FROM orders 
WHERE order_date BETWEEN '2024-01-01' AND '2024-12-31'
GROUP BY province, category
ORDER BY SUM(amount) DESC;
-- MySQL: 全表扫描 1 亿行,40 分钟,内存炸,可能直接 OOM
-- ClickHouse / Doris: 几秒,因为只读 4 列(province/category/amount/order_date)
```

**这不是 MySQL 不行,是查询 B 不该问 MySQL**——它该问把这张表用列存重组的 OLAP 引擎。

---

## 二、为什么要分开:存储和执行的根本对立

### 2.1 行存 vs 列存(必画图)

行存(MySQL / PG)在磁盘上一行紧挨着一行:

```
[id=1, user=12345, prod=A, amount=99,  date=...]
[id=2, user=67890, prod=B, amount=199, date=...]
[id=3, user=12345, prod=A, amount=88,  date=...]
...
```

读「user_id=12345 的所有列」非常爽——一次 IO 读出整行;但读「所有行的 amount 列做求和」很惨:**每读一个 amount 都要把整行加载进来,99% 数据是浪费**。

列存(ClickHouse / Parquet)在磁盘上同列连续:

```
id     列: [1, 2, 3, 4, ...]
user   列: [12345, 67890, 12345, ...]
prod   列: [A, B, A, A, ...]
amount 列: [99, 199, 88, 50, ...]
date   列: [...]
```

读「所有 amount 求和」非常爽——只读 amount 列的连续块,IO 直接降一个数量级,而且同列同类型压缩比能到 10 倍以上;但读「user_id=12345 的整行」要分别访问 5 个列文件,**单行查询慢得离谱**。

**列存的三大附加红利**:
- **压缩比高**:同列同类型,字典/RLE/Delta 编码 + Snappy/Zstd 压缩,通常压缩 5-10 倍
- **向量化执行**:CPU 一次处理一批同类型值,SIMD 友好
- **谓词下推**:Parquet 文件的统计信息能跳过整块数据(`WHERE date='2025-01'` 只读对应 row group)

详细的列存原理见 **06 列存原理**。

### 2.2 事务模型的对立

OLTP 必须强事务:**ACID** + **MVCC**(多版本并发控制) + **WAL**(预写日志)。这套机制让 MySQL 能在写入时保证一致性,但代价是:

- 每次写都要落 WAL(顺序磁盘 IO + fsync)
- 长事务持有行锁,影响并发
- MVCC 维护多个版本,撑大存储

OLAP 不需要这些:数据一旦灌入基本不改,**写入是「批量替换 + Snapshot 切换」**(参考 08 Iceberg)。所以 OLAP 引擎可以省掉 WAL、行锁、MVCC,把所有资源投到「扫得快」上。

```
OLTP:  写优化 + 强事务 + 单行查询快
        ↑
        如果加了列存或并行扫描,事务和写入会受影响
        
OLAP:  扫描优化 + 批量写 + 弱事务
        ↑
        如果加了行级更新和强事务,扫描会受影响
```

**这是一个 trade-off,不是一个工程偷懒**。

### 2.3 索引哲学的对立

| | OLTP | OLAP |
| --- | --- | --- |
| 主索引 | B+ 树(主键)、二级索引(B+ 树) | Skipping Index(min/max + bloom),粗粒度 |
| 索引数 | 多(每个高频查询条件一个) | 极少(列存本身就是"宽索引") |
| 索引代价 | 写入慢、空间大 | 几乎免费(零碎元数据) |
| 索引精确度 | 精确到行 | 精确到 row group / 块 |

OLTP 索引的目标是「定位到这一行」;OLAP 索引的目标是「跳过这一大块数据」。**完全不同的力学**。

### 2.4 并发哲学的对立

OLTP 一个连接一个事务,常驻几千到几万连接,每个查询毫秒级;OLAP 一个查询打满整个集群跑几秒,典型并发就几十。**资源调度模型完全不同**:

```
OLTP:  细粒度多线程,锁竞争,连接池
        典型部署:8-32 核单机,几十 GB 内存,主从 + 分库
        
OLAP:  少量大查询,跨节点并行(MPP),Shuffle
        典型部署:N 个节点,每节点 32+ 核 256+ GB,share-nothing
```

把 OLAP 引擎改成支持几千并发?——它的 MPP 调度器和 Shuffle 机制根本不适合;把 OLTP 改成支持单查询打满 100 节点?——它的锁和缓冲池设计根本扛不住。

---

## 三、心智图:数据从 OLTP 流向 OLAP 是常态

```
   [业务侧 OLTP]              [分析侧 OLAP]
   
   MySQL / PG                 ClickHouse / Doris / Snowflake
   订单 / 用户 / 商品          DWD / DWS / ADS
        │                            ▲
        │                            │
        └────────────────────────────┘
              CDC / Binlog
              Debezium / Flink CDC
              ↓
              Kafka(数据管道事实源)
              ↓
              落 Iceberg / 直接 sink 到 OLAP
```

**生产数据库永远不是分析数据库**。一条数据的两段人生:

1. 在 MySQL 里活几天(支持业务查询),然后归档
2. 通过 CDC 流到 OLAP 侧,在那里活几年(支持分析、训练、回溯)

CDC 怎么做(27 篇展开):增量同步 vs 全量重算,Binlog 解析,schema 演进。

---

## 四、HTAP:把两套引擎装一个壳里

「HTAP(Hybrid Transactional/Analytical Processing)」是 Gartner 2014 提的词,口号是「**一个数据库通吃 OLTP + OLAP**」。

### 4.1 HTAP 的真实做法:两套引擎 + 一份数据

代表选手:

| HTAP 数据库 | OLTP 引擎 | OLAP 引擎 | 数据流通 |
| --- | --- | --- | --- |
| **TiDB** | TiKV(行存,Raft) | TiFlash(列存,Raft Learner) | Raft Log 同步,异步 |
| **OceanBase** | OBServer 行存 | OBServer 列存(同进程) | 内部副本 |
| **SingleStore** | Rowstore | Columnstore | 同表两种存储 |
| **CockroachDB** | KV 存储 | (有限 OLAP,推外部) | 不真正算 HTAP |

**核心机制**:同一份业务数据,**同时**用行存(给 OLTP 用)和列存(给 OLAP 用)维护,通过复制协议(Raft Learner / 共识层)保证最终一致。

### 4.2 HTAP 兑现了多少

**兑现的部分**:
- 中等数据量(单表几亿到几十亿)的「实时分析」做得不错
- 业务库直接出报表,省掉一条 ETL 管道
- 数据延迟从「天」降到「分钟」甚至「秒」

**没兑现的部分**:
- 大数据量(单表万亿、跨表 join 几十张)仍然干不过专用 OLAP 引擎
- 资源隔离永远不完美,大查询拖累事务侧的故事屡见不鲜
- 复杂 ETL 转换(dbt 那种 model 编排)还是得走专用工具
- 成本可能更高(同一份数据存两遍,机器规格要按 OLAP 算)

**适合 HTAP 的场景**:
- 中小公司,想省一条 ETL 管道
- 强实时分析需求,5 分钟延迟都不能接受
- 数据量不算很大(单表 < 100 亿)

**不适合 HTAP 的场景**:
- 数据量极大或多源拼接,该走数据湖 + Iceberg
- 复杂数仓建模(ODS/DWD/DWS/ADS 多层),该走 dbt + 专用仓
- 团队已经有 OLTP 和 OLAP 两套,且管道稳定

**HTAP 不是答案,是某些场景的备选项**。

---

## 五、几个常见的反模式

### 5.1 用 MySQL 跑分析

最经典的错误:产品经理要看「每个城市每周下单用户数」,工程师写个 GROUP BY 直接打 MySQL 主库——**主库 CPU 打满,业务侧支付失败**。

正解:
- 临时方案:从库 + 不影响主库,加 `/*+ MAX_EXECUTION_TIME(60s) */` 兜底
- 中期方案:CDC 到 ClickHouse / Doris,分析侧跑
- 长期方案:数据湖 + dbt,统一建模

### 5.2 用 OLAP 引擎当业务库

反向错误:有人迷上 ClickHouse 性能强,把订单表也存 ClickHouse,业务侧拿来做单订单详情查询——**单行查询几百毫秒,远不如 MySQL**;且 ClickHouse 的 update/delete 走 mutation 异步,事务保证弱,不能扛业务一致性需求。

正解:**业务库就用业务库**,OLAP 引擎只接 CDC 流。

### 5.3 把 ES 当 OLAP 用

Elasticsearch 适合搜索 + 近实时聚合(Kibana 风格的运维分析),**但它不是 OLAP 引擎**:复杂多表 join 弱、超大聚合 OOM 风险高、列存基础设施不如 ClickHouse/Doris。

正解:ES 留给搜索 + 日志类分析,业务分析走专用 OLAP 引擎。

### 5.4 让分析师直连 OLTP 写 SQL

「就给个只读账号嘛」——某天 BI 跑了个 `SELECT * FROM orders ORDER BY created_at DESC LIMIT 10`(无 WHERE),磁盘 IO 飙满业务超时。

正解:**分析师永远不该接触 OLTP**,所有分析查询走 OLAP 副本或数据仓库,接入层用语义层(LookML / Cube / dbt MetricFlow)管控查询能力。

---

## 六、工程落地:一条数据的两段人生

最小可跑链路(Spark + Flink CDC 写 ClickHouse):

```sql
-- ① OLTP 侧:业务库的订单表(MySQL)
CREATE TABLE orders (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT,
  product_id BIGINT,
  amount DECIMAL(10,2),
  province VARCHAR(32),
  status TINYINT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
-- 索引:PK, idx(user_id), idx(created_at)
-- 业务侧:几十 ms 内完成下单 / 改状态 / 查个人订单

-- ② Flink CDC:实时同步到 OLAP
-- 在 Flink SQL 里:
CREATE TABLE orders_src (
  id BIGINT,
  user_id BIGINT,
  product_id BIGINT,
  amount DECIMAL(10,2),
  province STRING,
  status INT,
  created_at TIMESTAMP(3),
  PRIMARY KEY(id) NOT ENFORCED
) WITH (
  'connector' = 'mysql-cdc',
  'hostname' = 'mysql-host',
  'database-name' = 'shop',
  'table-name' = 'orders'
);

CREATE TABLE orders_sink (
  id BIGINT, user_id BIGINT, product_id BIGINT,
  amount DECIMAL(10,2), province STRING,
  status INT, created_at TIMESTAMP(3),
  PRIMARY KEY(id) NOT ENFORCED
) WITH (
  'connector' = 'clickhouse',
  'url' = 'jdbc:clickhouse://ck-host:8123/shop',
  'table-name' = 'orders'
);

INSERT INTO orders_sink SELECT * FROM orders_src;

-- ③ OLAP 侧:ClickHouse 的对应表(列存 + ReplacingMergeTree 处理 upsert)
CREATE TABLE orders (
  id UInt64,
  user_id UInt64,
  product_id UInt64,
  amount Decimal(10,2),
  province LowCardinality(String),
  status UInt8,
  created_at DateTime
) ENGINE = ReplacingMergeTree
ORDER BY (province, created_at, id)
PARTITION BY toYYYYMM(created_at);

-- ④ 分析查询:0.5 秒级
SELECT province, sumMerge(amount) AS gmv
FROM orders
WHERE created_at >= '2025-01-01'
GROUP BY province
ORDER BY gmv DESC;
```

40 行代码,**一条订单从「业务库的一行」到「分析侧的一份列存数据」**。完整的数据栈用 Iceberg + dbt 替代 ClickHouse,会在 08 / 25 篇展开。

---

## 七、替代方案与边界

### 7.1 你完全可以不分

**真小公司**:数据量不到亿,分析查询不复杂,**直接 PostgreSQL + 物化视图 + dbt** 起步。PG 有 `cstore_fdw` / `Citus` / `TimescaleDB` 这些扩展能补一部分列存能力。**别一上来就上 ClickHouse + Spark**,运维负担会压死团队。

### 7.2 现代选型谱

```
数据量小 + 实时分析需求中等   → PostgreSQL / TiDB (HTAP)
数据量中 + 实时高聚合         → ClickHouse / Doris / StarRocks
数据量大 + 复杂建模 + 多源    → 数据湖 (Iceberg) + Spark + dbt + Trino 查
SaaS 全托管                   → Snowflake / BigQuery / Redshift
笔记本上探索 + 中等数据       → DuckDB
```

详细选型见 **16 批处理替代品** 和 **10 Lakehouse 架构**。

### 7.3 OLTP/OLAP 之外还有什么

- **Time-series**:InfluxDB / TimescaleDB,时序数据特化(IoT、监控)
- **Graph**:Neo4j / TigerGraph,图关系特化
- **Search**:Elasticsearch / OpenSearch,全文 + 地理 + 倒排
- **Vector**:pgvector / Milvus,向量相似度(28 篇展开)
- **KV**:Redis / DynamoDB,极简模式 + 极致延迟

**「数据库」其实是几十种引擎的统称**,OLTP/OLAP 只是其中最普遍的两类。每种特化引擎都是「为某种特定查询模式优化的存储 + 执行」。

---

## 八、看完这一篇,你应该能

- 在白板上对照画行存 vs 列存,讲为什么列存对分析快 10 倍
- 看到「我要把 1 亿订单表跑个月度 GMV 趋势」第一反应是「这不该问 MySQL」
- 理解 HTAP 的真实承诺(两套引擎 + 一份数据)和它没兑现的部分
- 给小公司团队建议:别一上来就上 Spark + Iceberg,先看数据量
- 看到 ClickHouse / Doris / Snowflake 这些名词不抓瞎,知道它们都是「OLAP 引擎」这一类

下一篇:**03 ETL vs ELT** — 同一个 T(Transform),为什么以前在仓外做、现在在仓内做、未来可能在 LLM 里做。
