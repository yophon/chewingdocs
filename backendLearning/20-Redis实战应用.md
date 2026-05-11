# Redis 实战应用

会用命令不算会 Redis,**会用 Redis 解决业务问题** 才算。这一章把生产里 Redis 最常见的 5 类用法系统讲一遍:**缓存、分布式锁、限流、计数与排行、延迟队列**。

---

## 一、缓存

最经典的用法。**目标:把热数据放 Redis,挡掉 90% 数据库读请求**。

### 1. Cache-Aside(旁路缓存)

业内 80% 的项目用这种。

```java
public User get(long id) {
    String key = "user:" + id;
    String v = redis.opsForValue().get(key);
    if (v != null) return JSON.parseObject(v, User.class);

    User u = db.findById(id);
    if (u != null) redis.opsForValue().set(key, JSON.toJSONString(u), 600, SECONDS);
    return u;
}

public void update(User u) {
    db.save(u);
    redis.delete("user:" + u.getId());     // 先改库 → 再删缓存
}
```

> **为什么是"删"而不是"改"**:并发下"改库 → 改缓存"会出现旧值覆盖新值。删除让下次读重新从库取最新。

### 2. Read-Through / Write-Through

由缓存层代理读写,常见于 Spring Cache、Caffeine + Redis:

```
get(key) → cache.get → miss → loader 自动从 DB 读 → 回填
put(key) → cache 写入 → 同步透写 DB
```

### 3. Write-Behind(异步落库)

写缓存立即返回,异步批量落 DB。性能极高,**但宕机会丢数据**——只有可容忍的场景才用(浏览次数、最后访问时间)。

---

## 二、缓存三大坑

| 现象 | 解释 | 应对 |
| --- | --- | --- |
| 缓存穿透 | 查不存在的数据,缓存永远 miss,每次打 DB | **缓存空值(短 TTL)+ 布隆过滤器** |
| 缓存击穿 | 某个 hot key 突然过期,大量并发同时打 DB | **互斥锁 / 永不过期(逻辑过期)** |
| 缓存雪崩 | 大量 key 同时过期 / Redis 整个宕掉 | **TTL 加随机抖动 + Redis 高可用 + 兜底降级** |

### 1. 穿透:缓存空值

```java
if (v != null) return v.equals("") ? null : JSON.parseObject(v, User.class);

User u = db.findById(id);
redis.set(key, u == null ? "" : JSON.toJSONString(u), u == null ? 60 : 600, SECONDS);
return u;
```

### 2. 击穿:互斥锁

```java
public User get(long id) {
    String v = redis.get(key);
    if (v != null) return parse(v);

    String lockKey = "lock:user:" + id;
    if (redis.opsForValue().setIfAbsent(lockKey, "1", 10, SECONDS)) {
        try {
            v = redis.get(key);                          // double check
            if (v != null) return parse(v);
            User u = db.findById(id);
            redis.set(key, JSON.toJSONString(u), 600, SECONDS);
            return u;
        } finally {
            redis.delete(lockKey);
        }
    }
    Thread.sleep(50);
    return get(id);                                       // 自旋重试
}
```

### 3. 雪崩:TTL 加随机

```java
int ttl = 600 + ThreadLocalRandom.current().nextInt(120);
redis.set(key, v, ttl, SECONDS);
```

---

## 三、分布式锁

只在多个节点都需要"同一时刻只有一个执行"的场景下才需要。

### 1. 单 Redis 简版

```
SET lock:order:42 token123 NX PX 30000
```

- `NX`:不存在才设
- `PX 30000`:30s 过期(防进程挂了锁不释放)
- value 用 token,**释放时校验 token,避免误删别人的锁**

释放(必须用 Lua 保证原子):

```lua
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
else
  return 0
end
```

### 2. Redisson(Java)

```java
RLock lock = redisson.getLock("order:42");
if (lock.tryLock(3, 30, SECONDS)) {
    try { ... }
    finally { lock.unlock(); }
}
```

Redisson 自动续期(看门狗)、可重入、提供 `RedLock` 算法。

### 3. RedLock 与脑裂

Redis 作者 antirez 提出了 RedLock(向多个 Redis 节点请求锁,大多数成功才算拿到)。学界(Martin Kleppmann)对其有争议。

> 现实:**Redis 锁是"高可用 + 性能"型锁,不是 100% 正确的锁**。资金类极端正确性场景请用数据库行锁 + 业务幂等设计,Redis 不在你需要"绝对不可破"的场景里。

### 4. 分布式锁的实战要点

1. **永远设过期时间**(避免持锁进程挂)
2. **value 用全局唯一 token**,释放时校验
3. **释放用 Lua**,GET + DEL 不原子
4. **不要在锁内做长 IO**(HTTP / MQ),容易超时
5. 有续期需求用 **Redisson 看门狗**

---

## 四、限流

### 1. 计数器(简单版)

```lua
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
if n > tonumber(ARGV[2]) then return 0 else return 1 end
```

```
EVAL "..." 1 limit:user:42 1 100
```

> **窗口边界突刺**:1.5s 时来 100 次,2.5s 时又来 100 次,但这是同 1 秒(1.5~2.5)内的 200 次。

### 2. 滑动窗口(ZSet)

```lua
-- 移除窗口外的
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[1])
-- 计数
local n = redis.call('ZCARD', KEYS[1])
if n >= tonumber(ARGV[2]) then return 0 end
redis.call('ZADD', KEYS[1], ARGV[3], ARGV[3])
redis.call('EXPIRE', KEYS[1], ARGV[4])
return 1
```

### 3. 令牌桶 / 漏桶(Lua + 双 key)

成熟方案直接用现成库:

| 库 | 备注 |
| --- | --- |
| Spring Cloud Gateway 内置 | RedisRateLimiter |
| Sentinel | 阿里开源,功能强 |
| Resilience4j | 现代 Java 限流熔断 |
| Bucket4j + Redis | 令牌桶 |

---

## 五、计数与排行榜

### 1. 计数

```
INCR view:article:42
HINCRBY user:42 like_count 1
```

> 大并发下用 Redis 存,**异步批量回写到 MySQL**(每分钟同步一次)。直接每次写 MySQL 撑不住。

### 2. 排行榜

ZSet 经典场景:

```
ZINCRBY rank:2024-01 5 user42       # 加分
ZREVRANGE rank:2024-01 0 9 WITHSCORES   # Top 10
ZREVRANK  rank:2024-01 user42        # 我的名次
```

按周 / 按月用不同 key,过期就自动清理。

---

## 六、延迟队列(ZSet 实现)

```
ZADD delay:order  <触发时间戳>  "order:1001"
```

消费者:

```
ZRANGEBYSCORE delay:order -inf <now> LIMIT 0 10
```

取到后 `ZREM`,然后处理。**取 + 删用 Lua 一起做,保证不重复消费**。

```lua
local items = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1], 'LIMIT', 0, ARGV[2])
if #items > 0 then redis.call('ZREM', KEYS[1], unpack(items)) end
return items
```

> 适合: 订单 30min 未支付自动取消、定时任务、重试调度。重业务消息队列还是用 Kafka / RocketMQ。

---

## 七、Pub/Sub 与 Stream

### Pub/Sub

```
SUBSCRIBE channel
PUBLISH   channel  "hello"
```

⚠️ Pub/Sub **不持久化**,客户端不在线就丢。只适合"广播即时通知"。

### Stream

带消费组、ACK、回溯,见 18 章。生产里:

- 简单可靠队列 → **Stream**
- 至简广播 → Pub/Sub
- 强可靠、跨语言、海量 → Kafka / RocketMQ

---

## 八、缓存与数据库的一致性

| 模式 | 一致性强度 |
| --- | --- |
| 先删缓存,再改 DB | 写期间并发读,把旧值缓存回去 |
| **先改 DB,再删缓存** | 标准模式,瞬时不一致(毫秒级)可接受 |
| 改 DB + 同步删 + 延迟双删 | 多删一次防主从延迟 |
| binlog 订阅 + 异步刷缓存 | 终极方案(Canal、Debezium) |

> 经验:**先 DB 后删缓存** + 短 TTL 是 99% 项目的最优解。极致一致性诉求很罕见,出现就上 binlog 订阅。

---

## 九、监控指标

| 指标 | 关注点 |
| --- | --- |
| 内存使用 / max_memory 占比 | 接近上限会触发淘汰 |
| QPS | 单实例 5~10 万为安全水位 |
| 慢查询 | `SLOWLOG GET` |
| 命中率 | `keyspace_hits / (hits+misses)` < 80% 要警惕 |
| 大 key | `redis-cli --bigkeys` |
| 复制 lag | 主从同步延迟 |
| 连接数 | 是否被打满 |

```bash
redis-cli --bigkeys              # 找出每种类型最大的 key
redis-cli --hotkeys              # LFU 模式下热 key
redis-cli --latency              # 命令延迟
```

---

## 十、给新手的建议

1. **缓存不是免费午餐**——先想清楚一致性、过期、击穿的方案再加
2. **分布式锁能不上就不上**,业务能用乐观锁、状态机表达就别引锁
3. **限流要在网关层 + 业务层都做**,网关防爬虫,业务防 hot 操作
4. **大 key、慢命令是单线程 Redis 的头号敌人**,定期巡检
5. **Redis 不是数据库**——数据写 MySQL/PG 后再异步刷 Redis,丢了也能重建
