# Twitter 与微博

社交媒体的**核心难题**只有一个:**Timeline 怎么设计才扛得住 1 亿用户每秒刷新?** 这个问题看似简单——「就是查我关注的人发的最新内容」——**实际上是分布式系统里读写权衡的最经典案例**。从 2006 年 Twitter 开始,业界用了 15 年才把这个问题解决得比较完善,核心结论是:**没有银弹,只有"推拉结合"的妥协**——普通用户用 Push 预计算,大 V 用 Pull 实时拉,**因为 Twitter 的 Justin Bieber 一发推会触发 1 亿次写入**。

> 一句话先记住:**Timeline 是"读多写少 → Push 写时多做事";"少数大 V 写多读多 → Pull 读时聚合"**。Push 适合普通用户(关注百八十人),Pull 适合大 V(粉丝几千万)。**两者结合 = 大厂方案**。**永远记住:Justin Bieber 发一条推 = 1 亿次写**——这是 Twitter 工程团队 10 年挥之不去的噩梦。

---

## 一、需求拆解

### 1.1 功能需求

- **发推 / 发微博**:文本 + 图片 / 视频
- **关注 / 取关**:单向关系(我关你不一定你关我)
- **Timeline**:看「我关注的人最近发的内容」
- **个人页**:看「某个用户发过的所有内容」
- **点赞 / 转发 / 评论**

### 1.2 非功能需求

- **可用性**:99.99%
- **延迟**:Timeline 加载 < 200ms,发推 < 500ms
- **规模**:DAU 2 亿,人均关注 200,大 V 粉丝 1 亿+
- **一致性**:**最终一致**(发推后几秒内被关注者看到 OK)

### 1.3 这一轮不做

- 推荐 / 排序算法(For You 流)
- 私信(IM,详见 18 篇)
- 搜索

---

## 二、容量估算

### 2.1 QPS

```
发推:DAU 2 亿 × 人均 0.5 条 = 1 亿条/天
     平均 QPS = 10^8 / 10^5 = 1000
     峰值 QPS ≈ 5000

刷 Timeline:DAU × 人均 100 次/天 = 200 亿次/天
           平均 QPS = 23 万
           峰值 QPS ≈ 100 万

读写比 = 200:1(典型读多写少)
```

### 2.2 存储

```
推文:1 亿/天 × 300 字节(含图片URL/元数据) = 30 GB/天
     5 年 = 55 TB,含索引副本 ×3 = 165 TB
     → 必须分库

Follow 关系:2 亿用户 × 平均关注 200 = 400 亿条
            每条 16 字节(两个 user_id)= 640 GB
            含索引副本 ×3 = 2 TB
            → 必须分库

Timeline 存储(Push 模型):
  每个用户的 timeline 缓存 1000 条
  2 亿 × 1000 × 50 字节(只存 tweet_id) = 10 TB
  → 必须 Redis Cluster
```

### 2.3 关键洞察

**写入 5000 QPS 不算大,真正的难点是读 100 万 QPS**——**整个设计的核心是优化读路径**。

---

## 三、数据模型

### 3.1 推文表(按 tweet_id 分库)

```sql
CREATE TABLE tweet (
    id          BIGINT PRIMARY KEY,    -- 雪花 ID
    user_id     BIGINT NOT NULL,
    content     TEXT,
    media_url   VARCHAR(500),
    created_at  TIMESTAMP,
    INDEX idx_user_time (user_id, created_at DESC)  -- 看某人的推文
);
-- 分片键: id
```

### 3.2 关注表(按 follower_id 分库)

```sql
CREATE TABLE follow (
    follower_id  BIGINT,
    followee_id  BIGINT,
    created_at   TIMESTAMP,
    PRIMARY KEY (follower_id, followee_id),
    INDEX idx_followee (followee_id, follower_id)  -- 反查粉丝
);
-- 分片键: follower_id (按"谁关注的"分,因为查"我关注谁"最频繁)
```

### 3.3 反向关注表(按 followee_id 分库,空间换时间)

```sql
CREATE TABLE follower (
    followee_id  BIGINT,
    follower_id  BIGINT,
    PRIMARY KEY (followee_id, follower_id)
);
-- 分片键: followee_id
-- 用于"找某人的粉丝"——发推时要 fanout 给粉丝
```

**为什么存两份**:见 08 篇分库分表「多维度查询」——**`follow_id` 和 `followee_id` 两个维度都要快**,只能各存一份。

### 3.4 Timeline(Redis ZSet,Push 模型)

```
Key:    timeline:{user_id}
Type:   ZSet(score = tweet_id 的时间戳)
Member: tweet_id

每个用户存最近 1000 条,超过淘汰
```

---

## 四、架构演进:三种 Timeline 模型

### 4.1 V1:Pull 模型(简单但不可扩展)

**思想**:每次刷 Timeline 都实时查:

```sql
-- 用户 A 刷 Timeline
SELECT * FROM tweet
WHERE user_id IN (SELECT followee_id FROM follow WHERE follower_id = A)
ORDER BY created_at DESC
LIMIT 100;
```

**优点**:写时简单,发推只写一张表。
**致命问题**:

- 每次读都做大 join + 排序,**单 Timeline 查询要 100ms+**
- 100 万 QPS × 100ms = 100 万次复杂查询/秒,**DB 直接崩**

**适用**:DAU < 10 万的小型社区。

### 4.2 V2:Push 模型 / Fanout-on-Write(主流早期方案)

**思想**:**发推时主动写入所有粉丝的 Timeline 缓存**:

```python
def post_tweet(user_id, content):
    tweet_id = generate_id()
    db.insert(tweet_id, user_id, content)
    
    # 找出所有粉丝
    followers = db.query(f"SELECT follower_id FROM follower WHERE followee_id = {user_id}")
    
    # 写入每个粉丝的 Timeline
    for follower_id in followers:
        redis.zadd(f"timeline:{follower_id}", {tweet_id: timestamp})
        redis.zremrangebyrank(f"timeline:{follower_id}", 0, -1001)  # 保持 1000 条
```

**读 Timeline**:

```python
def get_timeline(user_id):
    tweet_ids = redis.zrevrange(f"timeline:{user_id}", 0, 99)
    return batch_get_tweets(tweet_ids)  # 批量从分库取 tweet 详情
```

**优点**:读 Timeline 极快,**纯 Redis O(log N) 操作**,< 5ms。

**致命问题:大 V**

```
Justin Bieber 1 亿粉丝
他发一条推 → 要写 1 亿次 Redis ZADD
```

**实际操作**:

- 单台 Redis 写入 5 万 QPS 上限
- 1 亿次写入要 2000 秒 = **半小时,粉丝才看得到**
- 即使分摊到 100 台 Redis,也要 20 秒
- 期间 Redis 写入打满,影响其他用户的 Timeline 更新

> 这就是 Twitter 内部传说的 **"Justin Bieber 问题"** ——**每次他发推,Twitter 整个 Timeline 系统都要短暂"打嗝"**。Twitter 工程团队 10 年都在优化这个。

### 4.3 V3:Pull 模型 / Fanout-on-Read(应对大 V)

**思想**:大 V 不预写 Timeline,**读时实时拉**:

```python
def post_tweet_big_v(user_id, content):
    tweet_id = generate_id()
    db.insert(tweet_id, user_id, content)
    # 不 fanout
```

```python
def get_timeline(user_id):
    tweet_ids = redis.zrevrange(f"timeline:{user_id}", 0, 99)
    
    # 我关注了哪些大 V
    big_vs = db.query(f"SELECT followee_id FROM follow WHERE follower_id = {user_id} AND big_v = 1")
    
    # 实时拉大 V 的最新推文
    big_v_tweets = db.query(f"""
        SELECT * FROM tweet
        WHERE user_id IN ({big_vs})
        ORDER BY created_at DESC LIMIT 100
    """)
    
    # merge 普通用户(已 push)+ 大 V(实时拉)
    return merge_sort(tweet_ids, big_v_tweets)[:100]
```

**优点**:发推快(不 fanout)。
**缺点**:读慢一点(要查大 V 的推文)。

### 4.4 V4:推拉结合(Hybrid,大厂主流)

**最终方案**:

```
用户分类:
  普通用户(粉丝 < 1 万)→ Push 模式,发推时 fanout
  大 V(粉丝 > 1 万)    → Pull 模式,不 fanout

读 Timeline:
  从 Redis ZSet 拿"普通关注者已 push 的推文"
  加上"实时拉关注的大 V 的最新推文"
  merge 后返回
```

```python
def post_tweet(user_id, content):
    tweet_id = generate_id()
    db.insert(tweet_id, user_id, content)
    
    user = get_user(user_id)
    if user.fans_count < 10000:
        # 普通用户:fanout
        followers = get_followers(user_id)
        for f in followers:
            redis.zadd(f"timeline:{f}", {tweet_id: timestamp})
    # 大 V:不 fanout,只写一份到自己的 timeline:user
```

```python
def get_timeline(user_id):
    push_tweets = redis.zrevrange(f"timeline:{user_id}", 0, 99)
    big_vs = get_followed_big_vs(user_id)
    pull_tweets = batch_get_recent_tweets(big_vs, limit=100)
    return merge_sort(push_tweets, pull_tweets)[:100]
```

**优势**:

- 99% 的用户(普通用户)是 Push,读快
- 0.1% 的用户(大 V)是 Pull,写快
- 整体扛得住

**这就是 Twitter / 新浪微博的实际架构**。

---

## 五、关键取舍 1:大 V 的临界值

「粉丝多少算大 V」是个**业务决策**——划得低则更多人 Pull 拖慢读,划得高则大 V Push 时仍崩。

**经验值**:

```
< 1000 粉丝:        纯 Push
1000 ~ 1 万粉丝:     Push,但分批异步
1 万 ~ 100 万粉丝:    分级延迟 Push(给活跃粉丝立即推,不活跃的延迟推)
> 100 万粉丝:        Pull
```

### 5.1 分级延迟 Push

不是所有粉丝都"立刻看到":

```
发推后:
  立即推给 在线 + 活跃 粉丝(1% 的人)
  延迟 10 秒推给 30 天活跃 粉丝(20%)
  延迟 1 分钟推给 全部粉丝(剩下 79%)
```

**逻辑**:粉丝当下不在线,5 秒后看到和 1 分钟后看到没差别;**降低瞬时写入压力**。

### 5.2 大 V 推文的 Pull 缓存

大 V 的最新推文**用 Redis 缓存**,不是每次都查 DB:

```
key: tweets:user:{big_v_id}
type: List(最近 100 条 tweet_id)
TTL: 1 小时
```

读 Timeline 时,**先查这个缓存,基本不打 DB**。

---

## 六、关键取舍 2:Timeline 缓存的容量

每个用户存 N 条 timeline:

```
N = 100   → 用户翻 5 页就要查 DB,体验差
N = 1000  → 翻 50 页,大多数用户够用,**主流值**
N = 10000 → 内存爆炸(2 亿用户 × 10000 × 50 = 100 TB)
```

**用户翻到底了怎么办**:

- **延迟加载**:从 DB 读老数据,异步刷回 Redis
- **冷热分离**:最近的进 Redis,旧的进 HBase / Cassandra(列式存储,长期归档)

---

## 七、关键取舍 3:发推的写路径

发推不只是写一张表:

```
1. 写 tweet 表(主存储)
2. 异步发消息到 MQ
3. MQ 消费者:
   a. 计算粉丝列表
   b. fanout 到粉丝 timeline
   c. 写入搜索引擎
   d. 触发推送通知
   e. 写监控统计
   f. 同步到对象存储(图片/视频)
   g. 反作弊扫描
```

**关键设计**:**发推接口只做 1 + 2**,**< 100ms 返回**;后面所有事异步做。

---

## 八、关键问题:粉丝数变化时的同步

用户从 9999 粉丝变 10001 粉丝(刚好越过大 V 临界值)——

```
之前:Push 模式,有人在 Redis ZSet 里
现在:Pull 模式,要把已 push 的清掉?
```

**解决**:**临界值留 buffer + 灰度切换**:

```
< 1 万 粉丝:Push
1 万 ~ 5 万:Push 但减少 fanout 频率
> 5 万:    Pull
中间不强制切换,以"用户数据膨胀方向"为主
```

**或者:不做切换**——**每个用户固定一种模式**(看注册时粉丝增长趋势),不动态调整。

---

## 九、转发 / 评论 / 点赞

社交互动会**翻倍 fanout 压力**——A 转发 B 的推 → 也要 fanout 给 A 的粉丝。

### 9.1 转发

```
A 转发 B 的推文:
  生成新的 tweet,type='retweet',ref_tweet_id=B 的 tweet
  fanout 到 A 的粉丝
```

### 9.2 点赞数 / 转发数

**写多读多** —— 不能每次写都改 DB:

```
Redis HINCRBY tweet_stats:{tweet_id} likes 1

每分钟批量写回 DB
```

### 9.3 评论

评论是**独立的小 Timeline**:

```
key: comments:{tweet_id}
type: ZSet(score = comment_id 时间戳)
```

热门推文的评论可能上万条 → 翻页用游标分页(详见 08 分库分表)。

---

## 十、关注关系的极端场景

### 10.1 一次取关大量人

用户取关 1000 个人:

- 不需要清理 timeline 缓存(过期数据自然淘汰,1000 条满了就挤掉)
- 只需删 follow 表

### 10.2 删除推文

用户删除自己的推文:

- 软删除 tweet 表(置 deleted=1)
- **不主动从所有粉丝的 timeline ZSet 里删**(代价太大)
- 读 timeline 时过滤已删除的(批量查 tweet 详情时跳过)

### 10.3 拉黑

A 拉黑 B 后,B 的推不再出现在 A 的 timeline:

- 读 timeline 时实时过滤
- 或者 fanout 时检查拉黑列表(写时多做事换读时简化)

---

## 十一、最终架构图

```
                       用户(发推 / 刷 timeline)
                              ↓
                       LB / Gateway
                              ↓
                ┌──────────────┴──────────────┐
                ↓                              ↓
            发推服务                        Timeline 服务
                ↓                              ↓
        ┌───────┴──────┐                ┌─────┴──────┐
        ↓              ↓                 ↓            ↓
     Tweet DB       Kafka              Redis      实时拉大 V
     (按 id 分库)   (异步 fanout)        Cluster   (大 V 缓存)
                       ↓
                  Fanout Worker
                       ↓
                  Redis Timeline ZSet
                  (每用户 1000 条)
                       ↓
                  通知 / 搜索 / 推荐 / 风控
```

---

## 十二、踩坑提醒

1. **纯 Push 不分大 V**——大 V 一发推系统挂
2. **纯 Pull 当主架构**——读延迟高 + DB 压力大,扛不住 100 万 QPS
3. **fanout 同步做**——发推 100ms+,用户体验差
4. **Timeline 不限长**——内存炸
5. **转发不限层数**——A 转 B 的转 C 的 → 嵌套层数无限增长
6. **删推文同步删 timeline**——删一条要扫 1 亿粉丝缓存
7. **Follow 表不分库**——400 亿条单库扛不住
8. **不存反向关注表**——找粉丝时跨库扫
9. **大 V 推文不缓存**——每次实时查 DB,DB 被打挂
10. **临界值频繁切换**——9999 ↔ 10001 粉丝来回切模式,缓存反复失效
11. **不做分级延迟 fanout**——大 V 发推瞬间打满 Redis
12. **不监控 fanout 队列堆积**——粉丝看到推文要 1 小时

---

下一篇:`17-新闻Feed.md`,讲新闻 / 信息流的设计——和社交 timeline 的核心区别(是排序而非时间倒序)、推荐召回 + 排序的两阶段架构、个性化和热度的混合、CTR 模型的工程落地,以及今日头条 / 抖音的"无限滚动"是怎么不让你停下的。
