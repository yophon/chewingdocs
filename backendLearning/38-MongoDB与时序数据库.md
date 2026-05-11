# MongoDB 与时序数据库

前面 12 ~ 17 章覆盖了 MySQL / PostgreSQL，这两位是关系数据库阵营的"主流默认"。但有些场景关系库做不好，会逼你转向**文档数据库**或**时序数据库**：

- 字段经常变、嵌套层级深、Schema 不固定 → **MongoDB**
- 写入量极大、按时间窗口查询、保留策略明显 → **InfluxDB / TimescaleDB / Prometheus**

这一章把这两类补齐。

---

## 一、MongoDB 是什么

**文档数据库**：以 JSON-like（BSON）文档为基本单元，天生 Schema-less。

```
关系库:                       MongoDB:
Database  Database            Database
  └─ Table                      └─ Collection
      └─ Row                        └─ Document
          └─ Column                     └─ Field（任意嵌套）
```

最适合的场景：

| 场景 | 为什么 |
| --- | --- |
| 字段经常变（表单、商品属性、配置） | 不用频繁 ALTER TABLE |
| 嵌套层级深（订单里嵌商品列表） | 关系库要拆多张表，文档一条搞定 |
| 写入快、读多按主键 | 内置分片、水平扩展容易 |
| 内容型（CMS、博客、评论） | 非结构化字段 + 全文索引 |

**不适合**：复杂多表 JOIN、强一致跨文档事务、报表分析（虽然 MongoDB 也支持，但远不如 OLAP）。

---

## 二、MongoDB 基础操作

```js
// 插入
db.users.insertOne({
  _id: 42,
  name: "Tom",
  email: "tom@x.com",
  tags: ["vip", "early-bird"],
  address: { city: "Shanghai", street: "..." },
  createdAt: new Date(),
});

// 查询
db.users.find({ "address.city": "Shanghai", tags: "vip" });
db.users.findOne({ _id: 42 });

// 更新（部分字段）
db.users.updateOne(
  { _id: 42 },
  { $set: { "address.city": "Beijing" }, $push: { tags: "trial" } }
);

// 删除
db.users.deleteOne({ _id: 42 });
```

注意：

- `_id` 默认是 ObjectId，也可以自定义
- 嵌套字段用 `.` 路径
- 更新用 `$set / $push / $inc / $pull` 等修饰符

---

## 三、索引、查询计划

```js
// 单字段
db.users.createIndex({ email: 1 }, { unique: true });

// 复合（遵循最左前缀，和 MySQL 一样）
db.users.createIndex({ "address.city": 1, createdAt: -1 });

// 文本索引
db.posts.createIndex({ title: "text", content: "text" });

// TTL（自动过期）
db.sessions.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 });

// 看查询计划
db.users.find({ email: "x" }).explain("executionStats");
```

> 经验法则：**MongoDB 慢查询调优心智和 MySQL 一致**——不走索引一切白搭。`COLLSCAN` 出现在 explain 里就是警报。

---

## 四、聚合管道（Aggregation Pipeline）

类比 SQL 的 GROUP BY + JOIN，但更灵活。每个 stage 是一个变换：

```js
db.orders.aggregate([
  { $match:  { status: "paid", createdAt: { $gte: ISODate("2026-05-01") }}},
  { $group:  { _id: "$userId", total: { $sum: "$amount" }, cnt: { $sum: 1 }}},
  { $sort:   { total: -1 }},
  { $limit:  10 },
  { $lookup: {                          // 类似 LEFT JOIN
      from: "users", localField: "_id",
      foreignField: "_id", as: "user" }},
  { $project: { _id: 0, total: 1, cnt: 1, "user.name": 1 }},
]);
```

常用 stage：

| Stage | 作用 |
| --- | --- |
| `$match` | WHERE |
| `$group` | GROUP BY |
| `$sort / $limit / $skip` | ORDER BY / LIMIT / OFFSET |
| `$project` | SELECT 字段 |
| `$lookup` | JOIN |
| `$unwind` | 展开数组 |
| `$facet` | 一次跑多个并行管道 |

---

## 五、副本集与分片

MongoDB 高可用 = **Replica Set**（一主多从 + 仲裁），故障自动切主。

```
┌──────┐    复制     ┌──────┐
│ PRIM │ ─────────▶ │ SEC1 │
└──────┘  ─────────▶ ┌──────┐
                     │ SEC2 │
                     └──────┘
```

水平扩展 = **Sharded Cluster**：按 shard key 把数据切到多个 replica set 上。

```
mongos (路由)
   │
   ├──▶ shard A (rs0)   userId 0~999999
   ├──▶ shard B (rs1)   userId 1000000~...
   └──▶ shard C (rs2)
   ＋ Config Servers (元数据)
```

> ⚠️ **shard key 一旦定下不能改**，选错（比如选了单调递增的 createdAt）会出现写热点全打到最后一个 shard。

---

## 六、MongoDB 事务

4.x 起支持多文档 ACID 事务（必须副本集 / 分片集群）：

```js
const session = db.getMongo().startSession();
session.startTransaction();
try {
  db.accounts.updateOne({ _id: "A" }, { $inc: { balance: -100 }}, { session });
  db.accounts.updateOne({ _id: "B" }, { $inc: { balance:  100 }}, { session });
  session.commitTransaction();
} catch (e) {
  session.abortTransaction();
  throw e;
} finally {
  session.endSession();
}
```

> 经验法则：**能用单文档事务就别用多文档事务**——MongoDB 的设计哲学是"把相关数据嵌进同一个文档"，多文档事务性能与心智都接近关系库，往往是 schema 设计错了。

---

## 七、Spring Data MongoDB

```java
@Document("users")
public class User {
    @Id private String id;
    private String name;
    private List<String> tags;
    private Address address;
    private Instant createdAt;
}

public interface UserRepository extends MongoRepository<User, String> {
    List<User> findByAddressCityAndTagsContaining(String city, String tag);
}
```

带聚合：

```java
Aggregation agg = Aggregation.newAggregation(
    Aggregation.match(Criteria.where("status").is("paid")),
    Aggregation.group("userId").sum("amount").as("total"),
    Aggregation.sort(Sort.Direction.DESC, "total"),
    Aggregation.limit(10)
);
```

---

## 八、时序数据库（TSDB）是什么

时间序列：**带时间戳的指标 / 事件**，特征是：

- 写多读少（写远大于读）
- 几乎只追加，少更新
- 查询基本按时间窗口
- 数据量大但旧数据可压缩 / 自动删

经典场景：

| 场景 | 数据形态 |
| --- | --- |
| 监控指标 | cpu_usage{host=...} 12.3 |
| IoT 传感器 | 温度、湿度、振动 |
| 行情 / 价格 | tick 级股票数据 |
| 业务事件 | 订单/曝光/点击的时间分布 |
| APM | 请求耗时随时间 |

---

## 九、主流 TSDB 对比

| 产品 | 模型 | 强项 | 弱项 |
| --- | --- | --- | --- |
| **Prometheus（TSDB）** | Pull + label | 监控原生、生态最大 | 不适合做永久存储 |
| **VictoriaMetrics** | Prometheus 兼容 | 写入快 5~10 倍、存储省 | 较新，企业用例少于 Prom |
| **InfluxDB** | 自有 line protocol | 老牌、SQL-like 查询（Flux/InfluxQL） | 集群版收费 |
| **TimescaleDB** | PostgreSQL 扩展 | 完整 SQL、JOIN 还能用 | 写入吞吐弱于纯 TSDB |
| **ClickHouse** | 列存 OLAP | 分析能力极强 | 严格意义不是 TSDB，更偏 OLAP |
| **OpenTSDB / KairosDB** | 基于 HBase / Cassandra | 老牌、海量 | 运维重 |

> 经验法则：**监控用 Prometheus（短期）+ VictoriaMetrics / Mimir（长期）；业务时序 + 复杂查询用 TimescaleDB；超大规模分析走 ClickHouse**。

---

## 十、TimescaleDB 极简上手

```sql
CREATE TABLE metrics (
  time   TIMESTAMPTZ NOT NULL,
  device TEXT,
  cpu    DOUBLE PRECISION,
  mem    DOUBLE PRECISION
);

-- 普通表 → 超表（按时间自动分块）
SELECT create_hypertable('metrics', 'time');

CREATE INDEX ON metrics (device, time DESC);

-- 写入与普通 INSERT 一样
INSERT INTO metrics VALUES (now(), 'srv-1', 23.1, 45.2);

-- 时间窗聚合
SELECT time_bucket('1 minute', time) AS bucket,
       device, avg(cpu) AS cpu_avg
FROM metrics
WHERE time > now() - INTERVAL '1 hour'
GROUP BY bucket, device
ORDER BY bucket;

-- 数据保留：30 天前自动删
SELECT add_retention_policy('metrics', INTERVAL '30 days');

-- 连续聚合（物化视图）
CREATE MATERIALIZED VIEW metrics_5m
WITH (timescaledb.continuous) AS
SELECT time_bucket('5 minutes', time) AS bucket,
       device, avg(cpu), max(cpu)
FROM metrics
GROUP BY bucket, device;
```

最大亮点：**仍然是 PostgreSQL**，所有 SQL、JOIN、psql、JDBC 全部能用。

---

## 十一、InfluxDB 风格

```
# Line Protocol 写入
weather,location=us-midwest temperature=82 1700000000000000000

# Flux 查询（v2）
from(bucket: "metrics")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "cpu" and r.host == "srv-1")
  |> aggregateWindow(every: 1m, fn: mean)
```

InfluxDB 的优势是**生态原生**（Telegraf 采集、Chronograf 出图），运维比 Postgres 路线更轻；劣势是 schema 设计要小心 **series 基数爆炸**——把 userId 当 tag 等于自杀。

---

## 十二、文档库 / 时序库的常见踩坑

**MongoDB**：

1. **把 MongoDB 当 MySQL 用**：写大量 join 用 `$lookup`，慢且贵
2. **shard key 单调递增**：写热点
3. **嵌套数组无限增长**：单文档上限 16MB，超了崩
4. **不建索引**：扫全表分分钟
5. **不用副本集**：单点 = 没备份

**TSDB**：

1. **基数爆炸**：高基数字段（userId / orderId）当 tag/label
2. **没保留策略**：盘瞬间满
3. **当主库用**：丢点数据无所谓，所以默认不强一致
4. **直接写 Prometheus**：Prometheus 是拉模型 + 短期，长期数据上 VM/Mimir
5. **混淆 OLAP 与 TSDB**：报表分析就用 ClickHouse / Doris，不要硬套时序库

---

## 十三、本章 Checklist

| 项 | 说明 |
| --- | --- |
| ✅ MongoDB 用嵌套替 JOIN | 文档库的精髓 |
| ✅ shard key 选离散且高频访问字段 | 不能改 |
| ✅ 副本集 + 自动故障转移 | 生产标配 |
| ✅ TSDB 选型清晰 | Prom / VM / Timescale / ClickHouse |
| ✅ 时序数据保留策略 | 自动转冷 / 删除 |
| ✅ 控制 series 基数 | 别把高基数当 tag |
| ✅ 慢查询监控 | MongoDB profiler 1ms 阈值 |

---

## 小结：到这里你已经具备的体系

```
应用框架    Spring Boot / ElysiaJS
关系库      MySQL / PostgreSQL
内存库      Redis
文档库      MongoDB
搜索        Elasticsearch
时序库      Prometheus / TimescaleDB
消息队列    Kafka / RabbitMQ / NATS
微服务      Spring Cloud / Service Mesh
网关 / BFF
监控 / 日志  Prometheus + Grafana + Loki/ELK + OTel
压测        wrk / k6 / JMeter
协议        REST + gRPC + GraphQL
容器 / 编排  Docker → Compose → K8s
```

后端的"已知世界"基本走完一圈。下一步往哪走？

- **深度方向**：JVM 调优、PostgreSQL 内核、分布式一致性（Raft / Paxos）
- **大数据方向**：Flink / Spark / 数据湖
- **AI Infra 方向**：LLM 服务化、向量数据库、推理网关
- **基础设施方向**：eBPF、Mesh 控制面、自研存储

但所有这些方向的前提，都是先把这一套 **业务系统能跑稳** 的能力打牢。
