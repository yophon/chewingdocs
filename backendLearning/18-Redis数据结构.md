# Redis 数据结构

Redis 是 **单线程内存数据库**(IO 多路复用 + 单线程命令处理),核心价值不是"快",而是 **"丰富的数据结构 + 原子操作"**。这一章把它的 7 大数据结构讲一遍,每种都给出真实业务场景。

---

## 一、为什么 Redis 单线程还这么快

| 原因 | 说明 |
| --- | --- |
| 内存操作 | 比磁盘快 5 个数量级 |
| 单线程避免锁 | 命令天然原子,无并发开销 |
| IO 多路复用 | epoll / kqueue,一个线程处理万级连接 |
| 高效数据结构 | SDS、ziplist、跳表、quicklist 等 |
| 6.0 起多线程 IO | 网络 IO 多线程,**命令执行仍单线程** |

> 单线程意味着:**一条慢命令(`KEYS *`、大 value 操作)会卡住所有其他命令**。

---

## 二、起一个 Redis

```bash
docker run -d --name redis -p 6379:6379 \
  -v redis_data:/data \
  redis:7-alpine \
  redis-server --appendonly yes --maxmemory 512mb --maxmemory-policy allkeys-lru

docker exec -it redis redis-cli
```

`redis-cli` 速查:

```
PING                # PONG
SET k v             # 设值
GET k
DEL k
EXISTS k
TTL k               # 剩余秒数,-1 永不过期,-2 不存在
EXPIRE k 60         # 设 60s 过期
KEYS *              # ⚠️ 生产禁用!阻塞
SCAN 0 MATCH user:* COUNT 100   # 推荐替代 KEYS
INFO memory
DBSIZE              # 当前库 key 数量
FLUSHDB / FLUSHALL  # ⚠️ 删库,谨慎
```

---

## 三、String(字符串)

最基础,值最大 512MB。

```
SET   user:1:name  "tom"
GET   user:1:name
MSET  a 1 b 2
MGET  a b
INCR  counter            # +1,原子
INCRBY counter 5
DECR  counter
APPEND log:1 "abc"
SETEX session:tk 3600 "value"   # 设值同时设过期
SETNX lock:order 1               # 不存在才设,基础分布式锁
```

**典型场景**:

| 场景 | 用法 |
| --- | --- |
| 计数器 | `INCR view:article:42` |
| 缓存 | `SET user:42 "json..." EX 600` |
| 限流 | `INCR + EXPIRE` |
| 分布式锁(基础版) | `SET key val NX EX 30` |
| 序列号 | `INCR order:seq` |

⚠️ string 也能存二进制(图片、序列化对象),但**单 key 别超过 100KB**,会拖慢网络和 IO。

---

## 四、Hash(哈希)

类似 Java 的 `Map<String, String>`,适合存对象。

```
HSET   user:1 name tom age 25 email t@a.com
HGET   user:1 name
HGETALL user:1
HMGET  user:1 name email
HINCRBY user:1 age 1
HDEL   user:1 email
HEXISTS user:1 email
```

**典型场景**:

| 场景 | 写法 |
| --- | --- |
| 用户对象 | `user:1 → {name, age, email}` |
| 商品库存 | `stock:p1 → {total, used, free}` |
| 配置项 | `config:app → {theme, lang}` |

> 经验:对象有 5+ 字段且常按字段读写时 → Hash;只是整体读写 JSON → String 也行。

---

## 五、List(列表)

底层 quicklist(linked list of ziplist),两端 push/pop 都是 O(1)。

```
LPUSH q hello world
RPUSH q !
LRANGE q 0 -1            # ["world","hello","!"]
LPOP q
RPOP q
LLEN q
BRPOP q 5                # 阻塞 5s 弹出
LMOVE src dst LEFT RIGHT # 原子移动
```

**典型场景**:

| 场景 | 用法 |
| --- | --- |
| 简单消息队列 | `LPUSH` 生产、`BRPOP` 消费 |
| 时间线/朋友圈 | 每个用户一个 list |
| 最新 N 条 | `LPUSH + LTRIM 0 99`(只保留 100 条) |

> 简单队列用 List 凑合用,**真正的消息队列用 Stream / Kafka / RocketMQ**。

---

## 六、Set(集合)

无序、不重复。

```
SADD  tags:1 a b c
SMEMBERS tags:1
SISMEMBER tags:1 a
SCARD tags:1            # 元素数
SREM  tags:1 a
SUNION tags:1 tags:2    # 并集
SINTER tags:1 tags:2    # 交集
SDIFF  tags:1 tags:2    # 差集
SRANDMEMBER tags:1 3    # 随机取 3 个
```

**典型场景**:

| 场景 | 用法 |
| --- | --- |
| 用户标签 / 权限集 | `tags:user:1` |
| 共同好友 | `SINTER friends:a friends:b` |
| 抽奖去重 | `SADD lucky:user:1 ...` |
| 唯一访客 UV | `SADD uv:2024-01-01 user1` |

---

## 七、Sorted Set / ZSet(有序集合)

**Redis 最强的数据结构**——成员唯一,带 score 排序,跳表实现。

```
ZADD  rank 100 tom 80 jerry 90 alice
ZSCORE rank tom                       # 100
ZRANK  rank tom                       # 排名(从小到大)
ZREVRANK rank tom                     # 排名(从大到小)
ZRANGE rank 0 -1 WITHSCORES           # 全部
ZRANGE rank 0 9 REV WITHSCORES        # Top 10
ZRANGEBYSCORE rank 80 100             # 按分数区间
ZINCRBY rank 5 tom                    # 给 tom 加 5 分
ZREM rank tom
ZCARD rank
```

**典型场景**:

| 场景 | 用法 |
| --- | --- |
| **排行榜**(经典) | score=分数,member=用户 |
| **延迟队列** | score=触发时间戳,定时取过期的 |
| **优先级队列** | score=优先级 |
| **范围查询** | 按分数区间扫 |
| **按时间排序的最近 N 条** | score=timestamp |

延迟队列示意:

```
ZADD  delay_q  1735000000  "task-1"
# 消费者:
ZRANGEBYSCORE delay_q -inf <now> LIMIT 0 10
# 取到后用 ZREM 删除(配合 Lua 保证原子)
```

---

## 八、Bitmap(位图)

底层是 String,按 bit 操作。

```
SETBIT  sign:user:1:202401 0 1     # 1 月 1 日打卡
SETBIT  sign:user:1:202401 1 1
GETBIT  sign:user:1:202401 5
BITCOUNT sign:user:1:202401         # 1 月签到次数
BITOP   AND dest a b                # 多个用户都签到的天数
```

**典型场景**:

- **签到**:每个用户一个 bitmap
- **活跃用户**(亿级):`BITCOUNT` 比 SET 省 30 倍内存

---

## 九、HyperLogLog(基数估算)

用 **极少内存** 估算"不重复元素个数",误差约 0.81%。

```
PFADD  uv:2024-01-01  user1 user2 user3
PFCOUNT uv:2024-01-01
PFMERGE month uv:2024-01-01 uv:2024-01-02 ...     # 合并
```

12 KB 内存就能估算亿级 UV。

**适合**:UV、独立访客、近似去重计数(对**精确**有要求别用)。

---

## 十、Geo(地理)

底层是 ZSet(score 是 geohash)。

```
GEOADD bikes 116.3 39.9 bike-1 116.5 39.95 bike-2
GEODIST bikes bike-1 bike-2 km
GEOSEARCH bikes FROMLONLAT 116.4 39.92 BYRADIUS 5 km ASC
```

**适合**:附近的人、附近的商家、共享单车。

---

## 十一、Stream(消息流,Redis 5+)

类 Kafka 的轻量队列,带 **消费组、ACK、回溯**。

```
XADD  events * type login user 42         # * 自动生成 ID
XLEN  events
XRANGE events - + COUNT 10                 # 区间扫描

# 消费组
XGROUP CREATE events g1 $ MKSTREAM
XREADGROUP GROUP g1 consumer-1 COUNT 10 BLOCK 5000 STREAMS events >
XACK events g1 1727...-0
XPENDING events g1                          # 看待 ACK 消息
```

**适合**:可靠消息(简单到中等量级),比 Kafka 轻,支持持久化、消费组、ACK。

---

## 十二、过期与淘汰

```
EXPIRE k 60
PEXPIRE k 60000        # 毫秒
PERSIST k              # 取消过期
```

**淘汰策略**(`maxmemory-policy`):

| 策略 | 行为 |
| --- | --- |
| noeviction | 写满直接报错(默认) |
| allkeys-lru | 所有 key,LRU 淘汰 |
| allkeys-lfu | 所有 key,LFU 淘汰 |
| volatile-lru | 只在带 TTL 的 key 中 LRU |
| volatile-ttl | 优先淘汰快过期的 |
| allkeys-random / volatile-random | 随机 |

> 经验:**纯缓存场景**用 `allkeys-lru` 或 `allkeys-lfu`(冷热分明时 LFU 更优)。

---

## 十三、Pipeline / Transaction / Lua

### 1. Pipeline:批量发请求

```
MULTI                # 不是 pipeline,是事务
SET a 1
INCR a
EXEC                 # 一次性提交,原子但仍单线程

# pipeline:客户端批发命令,合并 RTT
```

10000 次 SET,逐条 ~ 200ms,pipeline ~ 5ms。

### 2. Lua 脚本:多命令原子

```lua
-- 限流:1 秒内最多 N 次
local cur = redis.call('INCR', KEYS[1])
if cur == 1 then redis.call('EXPIRE', KEYS[1], 1) end
if cur > tonumber(ARGV[1]) then return 0 else return 1 end
```

```
EVAL "..." 1 limit:user:1 100
```

> Redis 事务(MULTI/EXEC)弱(没回滚、不能基于中间结果),**真正的"复合原子"用 Lua**。

---

## 十四、key 设计规范

```
模块:实体:id[:子项]
user:42
user:42:profile
order:2024:42:items
session:tk:abcd1234
limit:ip:127.0.0.1
```

- 用 `:` 分层(redis-cli 自动按层显示)
- key 别超过几十字节(过长占内存)
- value 别太大(单 key < 100KB,大 hash 拆桶)

---

## 十五、给新手的建议

1. **慎用 `KEYS *`、`HGETALL` 大 hash、`SMEMBERS` 大集合**——单线程会卡死全实例
2. **生产用 `SCAN`、`HSCAN`、`SSCAN`、`ZSCAN`** 替代 KEYS
3. **每个 key 都该有 TTL**(纯计数除外),避免内存爆
4. **value 大小写日志监控**,大 key 是事故种子
5. **优先 ZSet**:排行榜、延迟队列、按时间排序的列表都靠它一招走天下
