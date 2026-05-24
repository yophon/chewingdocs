# MySQL 主从与分库分表

单库扛不住流量、单表撑不住数据,后端的"水平扩展"基本都是这两条路:**主从复制**(扩展读、容灾)和 **分库分表**(扩展写、突破单表上限)。

---

## 一、单机 MySQL 的瓶颈

| 瓶颈 | 大致阈值(参考) |
| --- | --- |
| 单库 QPS | 几千 ~ 几万 |
| 单表行数 | 1 千万 ~ 5 千万(视字段宽度而定) |
| 单表索引页 | B+ 树 3~4 层是健康线 |
| 写入瓶颈 | redo log、磁盘 IO、binlog |

到了这个量级,就要考虑横向扩展了。**别提前拆**——分库分表会显著增加复杂度。

---

## 二、主从复制

### 1. 为什么要主从

| 目的 | 说明 |
| --- | --- |
| **读写分离** | 写主、读从,扩展读 QPS |
| **容灾** | 主挂了切到从 |
| **数据备份** | 从库 dump 不影响主库 |
| **跨机房 / 跨地域** | 数据下沉到边缘 |

### 2. 复制原理

```
┌─────── Master ───────┐                ┌─────── Slave ───────┐
│ 业务写入             │                │                      │
│   ↓                  │                │  IO Thread:          │
│ binlog(二进制日志) │ ──── TCP ─────▶│   ← 拉 binlog 写入 relay log │
│                      │                │  SQL Thread:         │
└──────────────────────┘                │   读 relay log 重放  │
                                        └──────────────────────┘
```

binlog 三种格式:

| 格式 | 内容 | 优缺点 |
| --- | --- | --- |
| STATEMENT | SQL 原文 | 体积小,但 NOW()、UUID() 这类不一致 |
| ROW | 每行变化 | 兼容性强,**生产推荐** |
| MIXED | 自动选 | 折中 |

### 3. 简单搭一套(Docker)

```yaml
# docker-compose.yml(简化)
services:
  mysql-master:
    image: mysql:8.4
    environment:
      MYSQL_ROOT_PASSWORD: root
    command: --server-id=1 --log-bin=mysql-bin --binlog-format=ROW --gtid-mode=ON --enforce-gtid-consistency=ON
    ports: ["3306:3306"]

  mysql-slave:
    image: mysql:8.4
    environment:
      MYSQL_ROOT_PASSWORD: root
    command: --server-id=2 --gtid-mode=ON --enforce-gtid-consistency=ON --read-only=ON
    ports: ["3307:3306"]
```

```sql
-- master 上创建复制账号
CREATE USER 'repl'@'%' IDENTIFIED BY 'repl';
GRANT REPLICATION SLAVE ON *.* TO 'repl'@'%';

-- slave 上指向 master
CHANGE REPLICATION SOURCE TO
  SOURCE_HOST='mysql-master',
  SOURCE_USER='repl',
  SOURCE_PASSWORD='repl',
  SOURCE_AUTO_POSITION=1;
START REPLICA;
SHOW REPLICA STATUS\G        -- 看 Replica_IO_Running / Replica_SQL_Running 是否 Yes
```

---

## 三、复制的几种模式

| 模式 | 说明 |
| --- | --- |
| 异步复制(默认) | 主提交后立即返回客户端,主挂了从可能丢数据 |
| **半同步(semi-sync)** | 至少一个从库 ACK 后再返回。**生产常用** |
| 全同步 | 所有从都 ACK,延迟高,几乎不用 |
| **MGR(组复制)** | 多主、Paxos 协议 |
| **InnoDB Cluster** | MGR + Router 的组合方案 |

---

## 四、读写分离

### 1. 中间件方案

| 方案 | 特点 |
| --- | --- |
| **ProxySQL** | 高性能 SQL 代理,规则灵活 |
| **MySQL Router** | 官方,与 InnoDB Cluster 集成 |
| **MaxScale** | MariaDB 出品 |
| **ShardingSphere-Proxy** | 国内生态完善,**分库分表与读写分离一站式** |

### 2. 应用层方案

Spring Boot 用 [`dynamic-datasource-spring-boot3-starter`](https://github.com/baomidou/dynamic-datasource-spring-boot-starter):

```yaml
spring:
  datasource:
    dynamic:
      primary: master
      datasource:
        master:
          url: jdbc:mysql://master:3306/demo
          username: root
          password: root
        slave_1:
          url: jdbc:mysql://slave:3306/demo
        slave_2:
          url: jdbc:mysql://slave2:3306/demo
```

```java
@DS("master")
public void create(...) { ... }

@DS("slave")
public List<User> list(...) { ... }
```

---

## 五、读写分离的坑

1. **主从延迟**:刚写入的数据,立刻读从库读不到(主写 → binlog 传 → 从重放,有毫秒到秒级延迟)
   - 缓解:写后短时间(如 500ms 内)走主库,或写后把数据塞 Redis 缓存
2. **大事务卡住从库**:从库单线程重放(8.0 多线程改善但仍有上限)
3. **从库做 schema 变更**:有些 DDL 要先在从执行
4. **错误的 ROUTING 规则**:某些 SELECT 需要强一致(秒杀、扣款查),走主库

---

## 六、分库分表

读写分离解决"读",**写瓶颈** + **单表过大**就要分库分表了。

### 1. 分库 vs 分表

| 类型 | 解决的问题 |
| --- | --- |
| 垂直分库 | 不同业务拆到不同库(用户库、订单库、商品库) |
| 垂直分表 | 一张大表的列拆成多张(冷热分离) |
| **水平分库分表** | 同一张表按某个键拆到多个库/多张表 |

### 2. 分片键(sharding key)的选择

最关键的一步,选错就**很难重来**。

- **单调高、查询多的字段**:`user_id`、`tenant_id`、`order_id`
- 选项要让**热点查询能落到同一个分片**(否则跨分片代价巨大)
- 避免分布严重不均(避免热点分片)

### 3. 分片算法

| 算法 | 说明 |
| --- | --- |
| **取模** `id % 16` | 简单,**扩容难**(全部数据要重 hash) |
| **范围** `id < 1000万 → 表 0` | 扩容容易,但易热点(新数据集中) |
| **一致性 hash** | 扩容仅迁移少量数据 |
| **基因法** | 把 user_id 某些位塞到 order_id 里,保证 user-order 同分片 |

---

## 七、分库分表的代价

| 难点 | 原因 |
| --- | --- |
| **跨分片 JOIN** | 分片在不同库,JOIN 不可行 |
| **跨分片分页** | `ORDER BY x LIMIT 100, 20` 要从所有分片取 120 条再合并 |
| **跨分片事务** | 需要分布式事务(Seata、TCC、最大努力通知) |
| **全局唯一 ID** | 自增 ID 在每个分片冲突,要用雪花 ID / 数据库号段 |
| **分片键查询友好的设计** | 查不带分片键 → 广播查询(慢) |

> 经验:**能不分尽量不分**。先尝试归档老数据、加索引、分库(垂直)、上读写分离,**只有当单表写 QPS 顶不住才水平分**。

---

## 八、ShardingSphere 实战

[Apache ShardingSphere](https://shardingsphere.apache.org/) 是国内最常用的分库分表中间件,支持 JDBC 与 Proxy 两种模式。

### 1. 引入

```text
implementation 'org.apache.shardingsphere:shardingsphere-jdbc-core:5.5.0'
```

### 2. 简化配置

```yaml
dataSources:
  ds_0:
    url: jdbc:mysql://db0:3306/demo
  ds_1:
    url: jdbc:mysql://db1:3306/demo

rules:
  - !SHARDING
    tables:
      orders:
        actualDataNodes: ds_${0..1}.orders_${0..3}
        databaseStrategy:
          standard:
            shardingColumn: user_id
            shardingAlgorithmName: db_mod
        tableStrategy:
          standard:
            shardingColumn: order_id
            shardingAlgorithmName: tbl_mod
        keyGenerateStrategy:
          column: order_id
          keyGeneratorName: snowflake
    shardingAlgorithms:
      db_mod: { type: MOD, props: { sharding-count: 2 } }
      tbl_mod: { type: MOD, props: { sharding-count: 4 } }
    keyGenerators:
      snowflake: { type: SNOWFLAKE }
```

效果:`orders` 表实际拆成 `ds_0.orders_0 ~ ds_1.orders_3` 共 8 张分片,业务代码无感。

---

## 九、全局唯一 ID

| 方案 | 优点 | 缺点 |
| --- | --- | --- |
| 数据库自增(单库) | 简单单调 | 多分片冲突 |
| **雪花算法 Snowflake** | 64 位、毫秒、节点 ID | 时钟回拨需处理 |
| **段模式(Leaf-segment)** | 性能好、批量分配 | 依赖单点 DB |
| UUID | 完全独立 | 长、无序、索引差 |
| ULID / Sonyflake | 时序友好 | 生态小 |

> 经验:**业务 ID 用雪花**(美团 Leaf、百度 UidGenerator 都开源了),**别再用 UUID 当主键**——B+ 树会因随机 ID 频繁分裂,影响插入性能。

---

## 十、分布式事务的几种思路

| 方案 | 适合 |
| --- | --- |
| 2PC / XA | 强一致,性能差 |
| **TCC**(Try/Confirm/Cancel) | 业务侵入,但灵活 |
| **本地消息表 / 事务消息** | 最终一致,主流 |
| **Saga** | 长流程业务,可补偿 |
| **Seata AT 模式** | 自动反向 SQL,代价是性能 |

> 经验:**90% 业务用最终一致**,真正需要强一致的场景极少(资金类除外)。强一致的代价是性能 + 可用性。

---

## 十一、归档与冷热分离(分表前先试这招)

很多"大表"其实大部分数据是冷数据。先把"3 个月以上"的数据搬到归档表/对象存储,主表往往就回到合理量级了。

```sql
INSERT INTO orders_archive SELECT * FROM orders WHERE created_at < NOW() - INTERVAL 90 DAY;
DELETE FROM orders WHERE created_at < NOW() - INTERVAL 90 DAY LIMIT 1000;     -- 分批删
```

---

## 十二、给新手的建议

1. **不要 demo 阶段就规划分库分表**,但**预留分片键字段**总是对的(每张主表都有 `tenant_id` / `user_id`)
2. **主从延迟存在感**:写完立刻查必去主库,或加 Redis 缓存"贴单读"
3. **分库分表前先做读写分离 + 归档**,通常能多扛半年
4. **分布式事务能不上就不上**,业务上靠"对账 + 重试 + 补偿"撑住绝大多数场景
5. **学习 ShardingSphere 之前先用单库经历过性能瓶颈**,理解会深得多
