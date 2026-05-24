# Redis 持久化与高可用

Redis 是内存数据库,但它**不是易失存储**——通过 **RDB / AOF** 落盘,通过 **主从 + Sentinel / Cluster** 实现高可用。这一章讲透这两条路。

---

## 一、RDB:快照持久化

**RDB(Redis Database)** 把某个时刻的内存全量数据写到磁盘 `.rdb` 文件。

### 触发方式

```
SAVE         # 同步,阻塞主线程,生产不要用
BGSAVE       # fork 子进程后台写,常用
```

`redis.conf` 自动触发:

```text
save 900 1        # 900s 内 ≥1 次写,触发
save 300 10
save 60  10000

stop-writes-on-bgsave-error yes
rdbcompression yes
dbfilename dump.rdb
dir /data
```

### 优缺点

| ✅ | ❌ |
| --- | --- |
| 文件紧凑,加载快 | 两次快照间数据丢失 |
| fork 子进程,不影响主线程命令处理 | 大实例 fork 时内存翻倍风险 |
| 适合备份、灾备恢复 | 实时性差(分钟级) |

---

## 二、AOF:追加日志

**AOF(Append Only File)** 把每条写命令追加到日志,重启时重放。

```text
appendonly yes
appendfilename "appendonly.aof"
appendfsync everysec      # 三选一:always / everysec / no
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size  64mb
```

### `appendfsync` 三种模式

| 模式 | 行为 | 数据安全 | 性能 |
| --- | --- | --- | --- |
| `always` | 每条写都 fsync | 最强(0 丢失) | 最差 |
| `everysec` | 每秒 fsync | **丢失 ≤1s**,生产推荐 | 好 |
| `no` | OS 决定 | 可能丢几十秒 | 最快 |

### AOF 重写

AOF 文件会越写越大。`BGREWRITEAOF` 触发后,fork 子进程把内存当前状态用最少命令写一份新 AOF。

### 优缺点

| ✅ | ❌ |
| --- | --- |
| 数据更安全(秒级) | 文件大,加载慢 |
| 可读性好(命令文本) | 写入比 RDB 重 |

---

## 三、混合持久化(推荐)

Redis 4.0 起,AOF 重写时把当时的内存以 RDB 二进制写入开头,后续命令以 AOF 追加。**结合两者优点**。

```text
aof-use-rdb-preamble yes
```

> 经验:生产环境一般同时开 RDB(定期备份)+ AOF(实时持久化,everysec)+ 混合重写。

---

## 四、内存与 fork 的隐患

Redis 用 `fork` 写盘,Linux 是 **Copy-On-Write**:子进程刚 fork 时不占额外内存,只有写入时才复制页。

⚠️ **风险**:

- 大实例(几十 GB)**fork 本身要几百毫秒**,期间主线程阻塞
- 写流量大时,COW 让物理内存可能翻倍 → OOM
- 解决:**单实例不要太大**(建议 ≤ 8GB),或关闭 THP(Transparent Huge Pages)

```bash
echo never > /sys/kernel/mm/transparent_hugepage/enabled
```

---

## 五、主从复制

```
Master                              Replica(Slave)
  │                                    │
  │  ── 全量同步(RDB + 增量缓冲)──▶  │
  │  ── 部分同步(PSYNC)─────────────▶ │
  │  ── 命令传播(write 操作)────────▶ │
```

### 配置

```text
# replica.conf
replicaof master 6379
masterauth your-pass
replica-read-only yes
```

或运行时:

```
REPLICAOF master 6379
INFO replication
```

### 复制流程

1. **全量同步**:首次连接、或 offset 不在缓冲区时
2. **部分同步**:断线重连,从 replication offset 续传(`PSYNC`)
3. **命令传播**:正常运行时,主把每条写命令推给从

⚠️ 主从架构**不能自动故障转移**,主挂了从不会自动顶上——需要 Sentinel。

---

## 六、Sentinel(哨兵)

Sentinel 是一组独立进程,**监控主从、自动选主**。

```
┌── Sentinel 集群(奇数,通常 3 个)──┐
│   监控 + 投票 + 通知客户端              │
└────┬─────────────────────────────────┘
     ↓
  Master ── Replica1 ── Replica2
     ↑
  客户端通过 Sentinel 拿到主地址
```

### 工作原理

1. Sentinel 周期 `PING` 主从
2. 主无响应,Sentinel 标 **主观下线(SDOWN)**
3. 多数 Sentinel 都认为主挂,标 **客观下线(ODOWN)**
4. 选举一个 Sentinel 做 Leader,从从库中选新主
5. 通知客户端新主地址

### 客户端

客户端不连 Redis,而是连 Sentinel 拿主地址:

```java
// Spring Data Redis
spring.redis.sentinel.master = mymaster
spring.redis.sentinel.nodes  = sentinel-1:26379,sentinel-2:26379,sentinel-3:26379
```

适合 **中小规模、没分片需求** 的场景。

---

## 七、Cluster(分片集群)

数据量超出单机内存或写 QPS 单点抗不住,就要分片了。

### 核心概念

- **16384 个 hash slot**,key 通过 `CRC16(key) % 16384` 落到某个 slot
- 一个集群至少 **3 主**(多数派),通常 3 主 3 从
- 每个主负责一段 slot 范围
- **客户端直连**,Redis 通过 `MOVED` / `ASK` 重定向

```
┌─────── 主1 (slot 0~5460)  ── 从1
│
├─────── 主2 (slot 5461~10922)  ── 从2
│
└─────── 主3 (slot 10923~16383) ── 从3
```

### 搭建一个 Cluster(Docker)

```bash
for p in 7000 7001 7002 7003 7004 7005; do
  docker run -d --name redis-$p --net host \
    redis:7 redis-server --port $p \
    --cluster-enabled yes --cluster-config-file nodes-$p.conf \
    --appendonly yes
done

redis-cli --cluster create \
  127.0.0.1:7000 127.0.0.1:7001 127.0.0.1:7002 \
  127.0.0.1:7003 127.0.0.1:7004 127.0.0.1:7005 \
  --cluster-replicas 1
```

### 限制

1. **跨 slot 命令不行**:`MGET k1 k2`、`SUNION`、`MULTI` 等多 key 操作要求落同一 slot
2. **只能用 0 号库**(`SELECT` 不可用)
3. **Lua / 事务 / pipeline 跨槽失败**

### `{}` Hash Tag:强制同 slot

```
SET {user:1}:profile  ...
SET {user:1}:orders   ...
# 都落到同一 slot,可以一起 MULTI 或 SUNION
```

---

## 八、Sentinel vs Cluster 怎么选

| 维度 | Sentinel | Cluster |
| --- | --- | --- |
| 数据上限 | 单机内存(几十 GB) | 集群总和(TB 级) |
| 写 QPS | 单主 ~10 万 | N × 单主 |
| 客户端复杂度 | 中(需感知 Sentinel) | 高(支持 cluster 协议、handle MOVED) |
| 多 key 命令 | 完整支持 | 受限 |
| 运维 | 简单 | 较复杂(扩缩容、迁移 slot) |

> 经验:**单机内存够 + 不需要 1 万 + QPS** → Sentinel 足够;**真有分片需求** 才上 Cluster。中间还有一个选项:**云上 Redis**(阿里云 / AWS ElastiCache),省心。

---

## 九、客户端常见问题

### 1. 连接池

```yaml
spring:
  redis:
    lettuce:
      pool:
        max-active: 20
        max-idle: 10
        min-idle: 2
        max-wait: 2000ms
```

> 经验:Lettuce 默认是 Netty + 单连接多路复用,**连接池在 Cluster 模式才显著有用**;Jedis 是连接池模型。

### 2. 重试 / 超时

```yaml
spring.redis.timeout: 1000ms      # 命令超时
```

⚠️ 高 RT 比 Redis 挂还致命——业务线程被卡。**永远设超时**。

### 3. 慢查询

```
CONFIG SET slowlog-log-slower-than 10000     # 微秒,即 10ms
SLOWLOG GET 20
SLOWLOG RESET
```

---

## 十、备份策略

| 频率 | 内容 |
| --- | --- |
| 每天 | RDB 拷到对象存储(S3 / OSS) |
| 每小时 | 灾备从机的 RDB / AOF 文件备份 |
| 实时 | 流向另一个 Redis(`replicaof` 或 RedisShake) |

恢复:把 `dump.rdb` 或 `appendonly.aof` 放到 `dir` 目录,重启即可。

---

## 十一、几个真实事故清单

1. **`KEYS *` 在 1 千万 key 实例上跑** → 阻塞 30 秒,所有业务超时
2. **大 hash 用 `HGETALL` 一次返回 500MB** → 网络打满 + 客户端 OOM
3. **AOF 写满磁盘** → Redis 拒绝写入,业务雪崩
4. **fork 期间主机内存不足** → 系统 OOM kill 掉 redis 进程
5. **Sentinel 网络分区** → 脑裂,新旧 master 同时存在,数据写错地方

---

## 十二、给新手的建议

1. **AOF + RDB + 混合重写,everysec 是默认正确答案**
2. **单实例别太大**(8~16GB 比较舒服),太大就分实例或分片
3. **生产 Redis 必须有副本**,只起一个主等于把鸡蛋放一个篮子里
4. **关掉 THP,设 `vm.overcommit_memory=1`**,fork 才稳
5. **第一天就监控**:内存使用率、QPS、慢查询、复制 lag、连接数
