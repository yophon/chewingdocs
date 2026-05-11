# CDC 与数据同步

39 章 ClickHouse 画了 CDC 链路图却没展开,21 章 ES 也提过"数据怎么从 MySQL 进来"留白了。这一章把 **业务库 → 其他存储系统** 的同步问题彻底讲清。

CDC = **Change Data Capture**,变更数据捕获。本质是"实时把数据库的写操作转成事件流"。

---

## 一、为什么要 CDC

业务库 MySQL 是事实源(source of truth),但实际系统里数据要去很多地方:

```
                 ┌──▶ Elasticsearch     (全文搜索)
                 │
[ MySQL ] ──────┼──▶ ClickHouse / Doris (OLAP 分析)
                 │
                 ├──▶ Redis             (缓存)
                 │
                 ├──▶ 数据湖 / 数仓      (离线计算)
                 │
                 └──▶ 下游业务服务      (订阅事件)
```

把数据搬过去,有几条路可选:

| 方式 | 特点 |
| --- | --- |
| **双写** | 业务代码写 MySQL 同时写 ES / Redis / Kafka |
| **定时全量同步** | 每天跑批 dump 一次 |
| **定时增量同步** | 按 update_time > last 拉新数据 |
| **CDC** | 监听 binlog,业务无感知 |

---

## 二、为什么 "双写" 是个陷阱

直觉上"代码里写两份"最简单,但坑非常多:

```java
@Transactional
public void createOrder(...) {
    orderMapper.insert(...);    // 1. 写 MySQL
    esClient.index(...);        // 2. 写 ES
}
```

致命问题:

1. **不在同一事务**:MySQL 提交了,ES 写挂——数据不一致
2. **顺序倒置**:并发下后写的可能被先写的覆盖
3. **耦合**:加一个下游就要改业务代码
4. **重试雪崩**:下游慢 → 业务接口慢 / 失败 / 重试
5. **历史数据怎么办**:双写只覆盖增量,存量数据要单独全量同步

> 经验法则:**只要数据要给两个以上系统看,直接放弃双写,上 CDC**——不是 CDC 多好,是双写实在太烂。

---

## 三、CDC 的工作原理

**核心思想**:数据库内部本来就有一份"所有变更的有序日志",我们读它就行。

| 数据库 | 日志 |
| --- | --- |
| MySQL | binlog(ROW 格式) |
| PostgreSQL | WAL + 逻辑复制槽(logical replication slot) |
| MongoDB | oplog |
| Oracle | Redo log + LogMiner |
| SQL Server | Transactional Log |

CDC 工具伪装成数据库的"从库",订阅这条日志流,转成 INSERT/UPDATE/DELETE 事件输出:

```
MySQL ───binlog─── ▶ [ CDC 工具 ] ── 事件流 ─── ▶ Kafka / 下游
                       (Canal / Debezium)
```

每条事件长这样:

```json
{
  "table": "orders",
  "type": "UPDATE",
  "before": { "id": 1, "status": "PENDING", "amount": 100 },
  "after":  { "id": 1, "status": "PAID",    "amount": 100 },
  "ts":     1715169600000
}
```

**对业务库零侵入**——业务该怎么写就怎么写,CDC 自动捕获。

---

## 四、主流 CDC 工具对比

| 工具 | 出身 | 强项 | 弱项 |
| --- | --- | --- | --- |
| **Canal** | 阿里 | 中文友好、轻量、国内生态广 | 仅 MySQL,功能没 Debezium 全 |
| **Debezium** | RedHat | 多 DB 支持(MySQL/PG/Mongo/Oracle...)、Kafka Connect 生态 | 部署稍重 |
| **Maxwell** | Zendesk | 单文件部署、JSON 输出极简 | 维护趋缓、仅 MySQL |
| **Flink CDC** | 阿里 | 整合 Flink 做 ETL,exactly-once | 学习曲线 + 需要 Flink 集群 |
| **AWS DMS** | AWS | 云上一键 | 锁死 AWS、迁移场景偏多 |
| **Striim / Fivetran** | 商业 | 企业级 | 收费 |

> 经验法则:**国内中小项目用 Canal,跨数据库 / 多种源用 Debezium,需要边同步边计算用 Flink CDC**。

---

## 五、Canal 实战:MySQL → Kafka

### 1. 准备 MySQL

```sql
-- my.cnf
[mysqld]
log-bin=mysql-bin
binlog-format=ROW            -- 必须 ROW
binlog_row_image=FULL        -- 完整记录前后镜像
server-id=1
```

```sql
CREATE USER 'canal'@'%' IDENTIFIED BY 'canal';
GRANT SELECT, REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO 'canal'@'%';
```

### 2. 部署 Canal Server

```yaml
# canal.properties
canal.serverMode = kafka
canal.mq.servers = kafka:9092

# example/instance.properties
canal.instance.master.address = mysql:3306
canal.instance.dbUsername     = canal
canal.instance.dbPassword     = canal
canal.instance.filter.regex   = mall\\.orders,mall\\.users
canal.mq.topic                = mall-cdc
```

### 3. 业务侧消费

```java
@KafkaListener(topics = "mall-cdc")
public void onChange(String message) {
    var change = parse(message);
    switch (change.type()) {
        case INSERT, UPDATE -> esClient.index("orders", change.after());
        case DELETE -> esClient.delete("orders", change.id());
    }
}
```

> ⚠️ **Canal 默认是"至少一次"语义**——同一条 binlog 可能被消费多次,下游必须幂等(用 ES 的 `_id` 覆盖、用 ClickHouse 的 ReplacingMergeTree)。

---

## 六、Debezium 实战:跨数据库的标准答案

部署在 Kafka Connect 上,声明式配置:

```json
{
  "name": "pg-orders-connector",
  "config": {
    "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
    "database.hostname": "pg",
    "database.port": "5432",
    "database.user": "debezium",
    "database.password": "...",
    "database.dbname": "mall",
    "table.include.list": "public.orders,public.users",
    "plugin.name": "pgoutput",
    "topic.prefix": "mall"
  }
}
```

每张表自动出一个 topic:`mall.public.orders` / `mall.public.users`,事件格式标准化(Debezium Envelope)。

Debezium 比 Canal 强的地方:

1. **多数据库统一 API**——MySQL、PG、Mongo、Oracle 输出同样的格式
2. **Kafka Connect 生态**——Sink Connector 直接落 ES / ClickHouse / S3,代码都不用写
3. **Schema Registry**——结构变更可追踪、向后兼容

---

## 七、典型链路:MySQL → Kafka → ClickHouse

```
[ MySQL ] ─binlog─▶ [ Debezium ] ─▶ [ Kafka ] ─▶ [ ClickHouse Kafka Engine ]
                                                          │
                                                          ▼
                                                  [ MaterializedView ]
                                                          │
                                                          ▼
                                                  [ ReplacingMergeTree ]
```

ClickHouse 端配置:

```sql
-- 1. Kafka 引擎表(消费 Kafka)
CREATE TABLE orders_kafka (
    id UInt64, status String, amount Decimal(18,2),
    op String, ts_ms UInt64
)
ENGINE = Kafka
SETTINGS kafka_broker_list = 'kafka:9092',
         kafka_topic_list = 'mall.public.orders',
         kafka_group_name = 'ch-orders',
         kafka_format = 'JSONEachRow';

-- 2. 真正存储的表(去重)
CREATE TABLE orders (
    id UInt64, status String, amount Decimal(18,2),
    ts DateTime
)
ENGINE = ReplacingMergeTree(ts)
ORDER BY id;

-- 3. 物化视图把 Kafka 的数据 push 进存储表
CREATE MATERIALIZED VIEW orders_mv TO orders AS
SELECT id, status, amount, toDateTime(ts_ms / 1000) AS ts
FROM orders_kafka WHERE op IN ('c','u','r');
```

> 这条链路是国内中大型公司"实时数仓"的事实标准。

---

## 八、典型链路:MySQL → Elasticsearch

ES 同步比 ClickHouse 更敏感——因为 ES 直接服务用户搜索,**延迟、一致性都看得见**。

```
[ MySQL ] ─binlog─▶ [ Canal/Debezium ] ─▶ [ Kafka ] ─▶ [ Logstash / 自写消费者 ] ─▶ [ ES ]
```

要点:

1. **`_id` 用 MySQL 主键**:实现幂等覆盖
2. **DELETE 要专门处理**:有些工具默认丢弃 delete 事件
3. **关联数据要 join**:user_id 想搜出 user_name?消费时去 MySQL/缓存查,或者源端做宽表
4. **重建索引时用别名**:`alias` 切换实现"零停机重建"
5. **Mapping 升级要重灌**:ES 的 mapping 字段类型不能改

---

## 九、一致性问题:CDC 不是银弹

### 问题 1:消费延迟

```
MySQL 写入 → CDC 投 Kafka(几十毫秒)→ 下游消费(秒~分钟)
```

业务侧"刚下单立刻搜不到"是常态。要么:

- 业务接受秒级延迟
- 关键查询走 MySQL,搜索走 ES(双读)
- 写入后强制刷一次 ES(代价大,慎用)

### 问题 2:消息乱序

同一行被快速 UPDATE 两次,Kafka 分区不同 → 消费顺序可能反:

```
应该:status: A → B → C
实际:status: A → C → B(B 覆盖了 C)
```

解决:**按主键 hash 到固定 partition**(Canal / Debezium 默认这样做),保证同一 key 顺序一致。

### 问题 3:全量 + 增量怎么衔接

新接的下游怎么把存量数据搞过去?

```
方案 1:Snapshot + 增量
  CDC 工具启动时先做全表快照,再切到 binlog 增量
  Debezium 默认就这么干

方案 2:并行双写过渡
  全量任务 + CDC 同时跑,依赖幂等覆盖兜底
```

### 问题 4:Schema 变更

业务加了一列、改了类型,下游怎么办?

| 变更 | 下游影响 |
| --- | --- |
| 加列 | 一般兼容(下游忽略新字段) |
| 删列 | 下游可能字段缺失 |
| 改类型 | 下游可能解析失败 |
| 改主键 | 大坑——CDC 链路会乱 |

**Schema Registry**(Confluent / Apicurio)可以做版本化,但 schema 变更仍然是 CDC 的高频事故源。

---

## 十、用 CDC 实现"事件驱动架构"

CDC 不只是"数据搬运",**它本质上是一种事件总线**:

```
[ 订单服务 ] ──写 MySQL──▶ binlog ──▶ Kafka topic: orders
                                              │
                              ┌───────────────┼───────────────┐
                              ▼               ▼               ▼
                        [ 推荐服务 ]    [ 风控服务 ]    [ 报表服务 ]
                        各自订阅,做自己的事
```

对比"业务代码里发 MQ":

| 维度 | CDC 派事件 | 业务发事件 |
| --- | --- | --- |
| 一致性 | 强(binlog 即真相) | 弱(发消息可能漏) |
| 业务侵入 | 0 | 高 |
| 灵活性 | 表 → 事件,粒度粗 | 业务可自定义 |
| 适合 | 数据同步、宽表、CRUD 事件 | 业务领域事件(已支付、已退货等语义事件) |

> 经验法则:**纯数据同步 / CRUD 类事件用 CDC,业务领域事件(DDD)走显式发布**。两者并存。

---

## 十一、Flink CDC:边同步边计算

如果数据搬运同时还要"清洗、聚合、JOIN",Flink CDC 把这一步合并:

```sql
-- Flink SQL,直接读 MySQL binlog 当流式表
CREATE TABLE orders (
   id BIGINT, user_id BIGINT, amount DECIMAL(18,2), status STRING,
   PRIMARY KEY (id) NOT ENFORCED
) WITH (
  'connector' = 'mysql-cdc',
  'hostname' = 'mysql', 'port' = '3306',
  'username' = 'flink', 'password' = '...',
  'database-name' = 'mall', 'table-name' = 'orders'
);

-- 实时大屏:每分钟付款 GMV
INSERT INTO dashboard
SELECT
    TUMBLE_END(proctime, INTERVAL '1' MINUTE) AS minute,
    SUM(amount) AS gmv
FROM orders
WHERE status = 'PAID'
GROUP BY TUMBLE(proctime, INTERVAL '1' MINUTE);
```

一句话能搞定 "MySQL 实时聚合到大屏",这是它的杀手级体验。

---

## 十二、CDC 在数据迁移中的角色

把老库迁到新库,CDC 几乎是唯一"零停机迁移"方案:

```
1. 全量复制:把老库当前数据 dump 到新库
2. CDC 启动:从全量 dump 时刻的 binlog 位点开始增量同步
3. 验证:新老库数据一致(对账工具)
4. 双写过渡:业务侧灰度切到新库
5. 切流:写流量从老库切到新库
6. 兜底:CDC 反向同步一段时间(防回滚需要)
```

阿里 DTS、AWS DMS、Debezium、Flink CDC 都支持这套流程。

---

## 十三、常见踩坑

1. **binlog 不是 ROW 格式**:STATEMENT 格式拿不到行级变更,白搭
2. **filter 太宽**:监听整个库 → Kafka 流量爆炸 + 下游处理不过来
3. **下游不幂等**:重复消费导致脏数据
4. **不处理 DELETE**:下游残留已删数据
5. **schema 变更没流程**:加字段时下游解析挂
6. **位点丢失**:CDC 工具崩了重启,从头重读 → 历史数据重复一遍
7. **Kafka 保留时间太短**:消费延迟超过保留 → 永久丢失
8. **大表全表快照阻塞业务**:Debezium 全量阶段会锁表(可改增量快照)
9. **同一行高频更新**:CDC 把每次变更都推,下游淹没——做下游侧合并
10. **没监控**:链路有个环节挂了 → 数据漂移几个小时才发现

---

## 十四、可观测性

CDC 链路的核心监控:

```
binlog lag(MySQL 当前位点 vs CDC 已读位点)→ 应 <1s
Kafka lag(生产 vs 消费偏移)→ 应 <数千
下游写入成功率 → 99.99%+
端到端延迟(MySQL 写入 → 下游可见)→ 业务定义 SLA
schema 变更告警 → 任何 DDL 通知
```

每个环节都要留 metric,不然出问题只能盲人摸象。

---

## 十五、本章 Checklist

| 项 | 说明 |
| --- | --- |
| ✅ 不双写,上 CDC | 数据同步默认方案 |
| ✅ binlog ROW + FULL image | MySQL 必备配置 |
| ✅ 同主键 hash 到同 partition | 保证顺序 |
| ✅ 下游消费幂等 | 至少一次语义的前提 |
| ✅ Snapshot + 增量衔接 | 全量增量无缝接 |
| ✅ Schema 变更走流程 | 影响评估 + 通知 |
| ✅ 端到端 lag 监控 | 出问题立刻知道 |
| ✅ 关键链路有兜底对账 | 不能完全信 CDC |
| ✅ 复杂 ETL 走 Flink CDC | 一站式 |
| ✅ 数据迁移用 CDC 双写过渡 | 零停机 |

---

## 小结

CDC 是现代数据架构的"高速公路"——一旦铺好,业务库的每次写入都能自动流到搜索、分析、缓存、数据湖。

但它也提醒我们:**没有银弹**。延迟、乱序、Schema 变更、消费幂等——每一个都要单独治理。

下一章我们看与 CDC 紧密相关的另一块:**流处理**——CDC 把变化推过来,流处理在上面做实时计算。
