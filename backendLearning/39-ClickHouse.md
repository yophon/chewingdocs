# ClickHouse

前面 12 ~ 17 章覆盖 MySQL / PostgreSQL,38 章顺手提了一句 ClickHouse 是 OLAP——但它在"数据多到关系库分析跑不动"这个场景里几乎没有对手,值得单开一章讲清楚。

OLTP 与 OLAP 的分工:

| 维度 | OLTP(MySQL / PG) | OLAP(ClickHouse) |
| --- | --- | --- |
| 主要工作 | 业务事务、单行读写 | 大批量聚合、报表、分析 |
| 行为 | 高并发短事务 | 少并发长查询 |
| 一致性 | 强(ACID) | 最终一致即可 |
| 数据量 | GB ~ TB | TB ~ PB |
| 写入模式 | 随机 INSERT/UPDATE | 批量追加 |
| 查询模式 | `WHERE id=?` | `SUM/COUNT/GROUP BY 时间窗口` |

> 经验法则:**业务系统不要用 ClickHouse 当主库**。它是"在 MySQL 旁边加一台分析引擎",通过 CDC / Kafka 把数据同步过来跑报表。

---

## 一、为什么 ClickHouse 这么快

三件事撑起了它的性能:

1. **列式存储**:同一列连续存盘,查 `SUM(amount)` 只读这一列,不用像行存那样把整行拉起来
2. **向量化执行**:一次处理一批(batch),CPU 缓存命中率高,SIMD 友好
3. **极致压缩**:同一列数据相似度高,LZ4 / ZSTD 压缩率常常 5~10 倍,IO 直接降下来

```
行存(MySQL):         列存(ClickHouse):
[id|user|amount|ts]   id:    1, 2, 3, 4, ...
[id|user|amount|ts]   user:  A, B, A, C, ...
[id|user|amount|ts]   amount:10,20,15,30, ...
[id|user|amount|ts]   ts:    t1,t2,t3,t4,...
```

代价:**单行更新慢、点查不如关系库、不擅长高并发**。这就是它的边界。

---

## 二、引擎家族:MergeTree 是核心

ClickHouse 表必须指定引擎,90% 的业务用 **MergeTree 家族**:

| 引擎 | 用途 |
| --- | --- |
| `MergeTree` | 默认,按主键排序、分区,标准 OLAP 表 |
| `ReplacingMergeTree` | 后台合并时按主键去重(用于"幂等覆盖") |
| `SummingMergeTree` | 合并时同主键自动 SUM(预聚合) |
| `AggregatingMergeTree` | 配合物化视图,存 AggregateFunction 状态 |
| `CollapsingMergeTree` | 用 sign=±1 实现"逻辑删除/更新" |
| `ReplicatedXxx` | 上面任意一种 + ZooKeeper/Keeper 副本 |
| `Distributed` | 不存数据,只做分片路由 |

> 经验法则:**先选 `MergeTree`,数据有去重需求再换 `ReplacingMergeTree`**。其他几种是"知道自己在做什么"才用,用错了会让数据语义变得难以推理。

---

## 三、建表与基础查询

```sql
CREATE TABLE events
(
    event_time   DateTime,
    user_id      UInt64,
    event_type   LowCardinality(String),   -- 枚举型字段必上 LowCardinality
    country      LowCardinality(String),
    amount       Decimal(18, 2),
    properties   Map(String, String)
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(event_time)         -- 分区:常用按月
ORDER BY (event_type, user_id, event_time) -- 排序键 = 稀疏主键
SETTINGS index_granularity = 8192;
```

要点:

- **`ORDER BY` 既是排序也是稀疏主键**——这里没有 MySQL 那种"每行一个 B+Tree 索引",而是每 8192 行一个标记,过滤效率取决于排序键能不能裁剪掉大块数据
- **`PARTITION BY` 用粗粒度**(按月/按天),不是用来加速点查的,而是用来 **DROP PARTITION 快速清理历史**
- **`LowCardinality(String)`** 给基数低的字符串列(国家、状态、事件名)做字典编码,体积和速度都暴跌一个量级

写入:

```sql
INSERT INTO events VALUES
  ('2026-05-08 10:00:00', 1001, 'click',   'CN', 0,    {'utm':'qq'}),
  ('2026-05-08 10:00:01', 1002, 'pay',     'US', 12.5, {});
```

⚠️ **批量写,不要一行一个 INSERT**——ClickHouse 每次 INSERT 都生成一个 part,part 太多 merge 跟不上,查询性能直接崩。常见做法:**积攒到 1 万 ~ 10 万行 / 秒级 ~ 分钟级 flush 一次**,或者前面挂一个 Kafka + `Kafka` 引擎表。

---

## 四、最常见的几种聚合写法

```sql
-- 1. 时间窗口:每分钟订单量与 GMV
SELECT
    toStartOfMinute(event_time) AS minute,
    count()                     AS orders,
    sum(amount)                 AS gmv
FROM events
WHERE event_type = 'pay'
  AND event_time >= now() - INTERVAL 1 HOUR
GROUP BY minute
ORDER BY minute;

-- 2. 漏斗(funnel):简化版按 user_id 序列分析
SELECT
    user_id,
    windowFunnel(1800)(event_time,
        event_type = 'view',
        event_type = 'cart',
        event_type = 'pay'
    ) AS step
FROM events
WHERE event_time >= today() - 7
GROUP BY user_id;

-- 3. 留存:用户首次活跃后第 N 天还活跃
SELECT
    retention(
      event_time >= '2026-05-01' AND event_time < '2026-05-02',
      event_time >= '2026-05-08' AND event_time < '2026-05-09'
    ) AS r
FROM events
GROUP BY user_id;

-- 4. 近似计数(uniq 系列)
SELECT uniqExact(user_id), uniq(user_id), uniqHLL12(user_id) FROM events;
```

`uniq` / `uniqHLL12` 用 HyperLogLog,内存极省、千万级 UV 误差 1% 以内——**精度换 10x ~ 100x 速度**,绝大多数 BI 场景值得。

---

## 五、物化视图:把计算前置

ClickHouse 的物化视图不是 PG 那种"按需刷新",而是**插入时自动写入派生表**——天生增量、近实时。

```sql
-- 明细表
CREATE TABLE events_raw (...) ENGINE = MergeTree ORDER BY ...;

-- 预聚合存储:按分钟 sum
CREATE TABLE events_1m
(
    minute      DateTime,
    event_type  LowCardinality(String),
    cnt         UInt64,
    gmv         Decimal(18, 2)
)
ENGINE = SummingMergeTree
PARTITION BY toYYYYMM(minute)
ORDER BY (event_type, minute);

-- 物化视图:写明细的同时自动 push 到聚合表
CREATE MATERIALIZED VIEW events_1m_mv TO events_1m AS
SELECT
    toStartOfMinute(event_time) AS minute,
    event_type,
    count()                     AS cnt,
    sum(amount)                 AS gmv
FROM events_raw
GROUP BY minute, event_type;
```

效果:报表 SELECT 走 `events_1m`,几亿行明细变成几千行聚合,响应从秒级降到毫秒级。

> 经验法则:**先看常用查询的 GROUP BY 维度,把它们物化下来**。明细查得少就只留 7~30 天,长期看物化视图。

---

## 六、副本与分片

| 维度 | 怎么做 |
| --- | --- |
| 高可用 | `ReplicatedMergeTree` + ZooKeeper/Keeper,多副本互相同步 |
| 水平扩展 | 分片:多机各存一部分数据,前面挂 `Distributed` 表做路由 |
| 集群形态 | 通常是 N 个 shard × M 个 replica |

```sql
-- 分片本地表(每个节点上各建一份)
CREATE TABLE events_local ON CLUSTER my_cluster (...)
ENGINE = ReplicatedMergeTree(
   '/clickhouse/tables/{shard}/events_local', '{replica}'
)
ORDER BY ...;

-- 分布式表(查询入口)
CREATE TABLE events ON CLUSTER my_cluster AS events_local
ENGINE = Distributed(my_cluster, default, events_local, rand());
```

分布式查询执行流:**协调节点 → 各 shard 本地聚合 → 协调节点合并**——`GROUP BY` 大部分在 shard 上跑完,网络只传聚合结果。

> ⚠️ JOIN 很容易把"分布式"打回原形:大表 JOIN 默认是把右表广播到所有节点。**遇到大 JOIN,优先反范式或用字典表(`Dictionary`)**。

---

## 七、TTL 与冷热分层

```sql
ALTER TABLE events MODIFY TTL
    event_time + INTERVAL 7 DAY  TO VOLUME 'hot',     -- 7 天内 SSD
    event_time + INTERVAL 90 DAY TO VOLUME 'cold',    -- 90 天内 HDD/对象存储
    event_time + INTERVAL 1 YEAR DELETE;              -- 1 年后删除
```

配合 storage policy(`disks` + `volumes`)可以让热数据走 NVMe、冷数据自动滚到 S3。**这是 ClickHouse 最舒服的运维特性之一**——不用写定时清理脚本。

---

## 八、ClickHouse vs 它的几个邻居

| 对比对象 | 共同点 | ClickHouse 的优势 | 它们的优势 |
| --- | --- | --- | --- |
| **MySQL/PG** | SQL 接口 | 聚合快 10~1000x | 事务、点查、并发写 |
| **Elasticsearch** | 海量数据查询 | 聚合内存省、SQL 友好 | 全文检索、倒排索引 |
| **Hive/Spark** | OLAP/数仓 | 单表查询快、近实时 | 复杂 ETL、生态广 |
| **Doris/StarRocks** | 国产 MPP OLAP | 单机性能与社区成熟度 | MySQL 协议兼容、JOIN 更稳 |
| **DuckDB** | 列存分析 | 分布式、海量、服务化 | 嵌入式、单机分析极轻 |

> 经验法则:**日志 / 行为分析 / 实时报表上 ClickHouse;复杂多表 JOIN 的数仓考虑 StarRocks/Doris;单机分析(<100GB)直接 DuckDB**。

---

## 九、典型架构:它在系统里的位置

```
业务库 MySQL ──CDC(Debezium)──┐
                                ├──▶ Kafka ──▶ ClickHouse(明细)
日志/埋点 ────────────────────┘                   │
                                                  ├──▶ 物化视图(分钟/小时聚合)
                                                  └──▶ BI(Grafana/Superset/Metabase)
```

要点:

- **不要让业务直连 ClickHouse 写**:走 Kafka,既削峰也避免小批量插入
- **Schema 先想好排序键和分区键**:ClickHouse 改表代价比 PG 大,排序键基本不可变
- **报表层 BI 工具直接连**:Superset、Metabase、Grafana 都有原生驱动

---

## 十、Spring Boot 接入

ClickHouse 提供 JDBC 驱动,接入跟 MySQL 几乎一样:

```xml
<dependency>
  <groupId>com.clickhouse</groupId>
  <artifactId>clickhouse-jdbc</artifactId>
  <classifier>shaded-all</classifier>
</dependency>
```

```yaml
spring:
  datasource:
    url: jdbc:ch://ch-1:8123/default
    username: default
    password: ${CH_PASSWORD}
    driver-class-name: com.clickhouse.jdbc.ClickHouseDriver
```

```java
@Repository
public class EventDao {
    private final JdbcTemplate jdbc;

    public List<Map<String, Object>> gmvByMinute(Instant from) {
        return jdbc.queryForList("""
            SELECT toStartOfMinute(event_time) AS minute, sum(amount) AS gmv
            FROM events
            WHERE event_type = 'pay' AND event_time >= ?
            GROUP BY minute ORDER BY minute
            """, Timestamp.from(from));
    }
}
```

> 实践提醒:**ClickHouse 不要走 ORM**(JPA/MyBatis Plus)。ORM 习惯逐行 INSERT、N+1,会踩中 ClickHouse 最不擅长的地方。批量入库直接拼 `INSERT ... VALUES (...), (...), ...` 或用 `clickhouse-client` 流式写入。

---

## 十一、常见踩坑

1. **小批量频繁 INSERT**:part 爆炸 → `Too many parts` 报错。批量化是底线
2. **UPDATE / DELETE 当 OLTP 用**:ClickHouse 的 `ALTER ... UPDATE` 是异步重写整个 part,代价巨大,业务 UPDATE 别走它
3. **排序键设计错**:WHERE 里用不到排序前缀 → 全表扫,跟没建表一样
4. **JOIN 大表 JOIN 大表**:右表会被广播,内存炸。要么反范式,要么用字典表
5. **不用 `LowCardinality`**:几个枚举值的 String 列直接吃几十倍空间和 CPU
6. **当业务库**:并发 1000 QPS 点查,ClickHouse 直接给你跪——它不是干这个的
7. **没有副本**:ReplicatedMergeTree 不开 = 单机故障 = 数据没了
8. **PARTITION 太细**:按小时分区 → partition 数爆炸,merge 压力巨大,按天/按月就够

---

## 十二、本章 Checklist

| 项 | 说明 |
| --- | --- |
| ✅ 区分 OLAP 与 OLTP 用途 | ClickHouse 不替代 MySQL |
| ✅ 默认 MergeTree | 去重场景再换 ReplacingMergeTree |
| ✅ 排序键设计配合常用 WHERE | 决定查询是否裁剪 |
| ✅ 分区按天 / 按月 | 用来管理生命周期,不是加速点查 |
| ✅ 枚举字段加 LowCardinality | 体积速度双降 |
| ✅ 批量写入,前面挂 Kafka | 避免 part 爆炸 |
| ✅ 高频报表用物化视图 | 明细 → 分钟/小时聚合 |
| ✅ 生产用 ReplicatedMergeTree | 副本是底线 |
| ✅ TTL + 冷热分层 | 自动清理与降本 |
| ✅ 别用 ORM 写 | 直连 JDBC + 批量 SQL |

---

## 小结

ClickHouse 在后端体系里的定位非常明确:**业务系统旁边的"分析副驾驶"**。让 MySQL/PG 专心扛事务、ClickHouse 专心扛分析,各自发挥自己最擅长的事——这才是大多数公司真实的数据架构走向。

下一步可以继续深入的方向:

- **数仓建模**:维度建模、宽表 vs 星型 / 雪花
- **CDC 链路**:Debezium / Flink CDC 把业务库实时同步进 ClickHouse
- **ClickHouse 替代品评估**:StarRocks / Doris(更强 JOIN)、Druid(更老牌实时)、DuckDB(单机分析)
- **可观测性**:用 ClickHouse 自建日志 / Trace 平台(Uber 的 Logging,Cloudflare 的分析后端走的都是这条路)
