# NoSQL交互：Redis与Elasticsearch

> **导读**：Redis 和 Elasticsearch 都不是“更快的数据库”，它们分别解决缓存/原子计数和搜索/聚合问题；用错边界会让系统更复杂也更脆弱。

## 一、工程场景：商品服务的读性能与搜索

一个电商商品服务常见需求：

- 商品详情访问量很高，不能每次都查 MySQL。
- 秒杀活动需要快速扣减库存或做限流。
- 用户要按关键词、品牌、价格区间、标签搜索商品。
- 后台需要按分类、品牌做聚合统计。

这时常见组合是：

- MySQL 作为事实数据源。
- Redis 做缓存、分布式锁、限流、计数。
- Elasticsearch 做全文检索和复杂过滤。

关键是边界清楚：Redis 不负责复杂查询，Elasticsearch 不负责强一致交易。

## 二、Redis：缓存商品详情

使用 `github.com/redis/go-redis/v9`：

```bash
go mod init nosql-demo
go get github.com/redis/go-redis/v9
```

可运行示例：

```go
package main

import (
    "context"
    "encoding/json"
    "errors"
    "fmt"
    "log"
    "time"

    "github.com/redis/go-redis/v9"
)

type Product struct {
    ID    int64  `json:"id"`
    Name  string `json:"name"`
    Price int64  `json:"price"`
}

func main() {
    rdb := redis.NewClient(&redis.Options{
        Addr:         "localhost:6379",
        DB:           0,
        PoolSize:     20,
        MinIdleConns: 5,
    })
    defer rdb.Close()

    ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
    defer cancel()

    p, err := GetProduct(ctx, rdb, 1001)
    if err != nil {
        log.Fatal(err)
    }
    fmt.Printf("%+v\n", p)
}

func GetProduct(ctx context.Context, rdb *redis.Client, id int64) (*Product, error) {
    key := fmt.Sprintf("product:%d", id)

    cached, err := rdb.Get(ctx, key).Result()
    if err == nil {
        var p Product
        if json.Unmarshal([]byte(cached), &p) == nil {
            return &p, nil
        }
    } else if !errors.Is(err, redis.Nil) {
        return nil, err
    }

    p, err := loadProductFromDB(ctx, id)
    if err != nil {
        return nil, err
    }
    if p == nil {
        _ = rdb.Set(ctx, key, "null", 30*time.Second).Err()
        return nil, nil
    }

    b, _ := json.Marshal(p)
    ttl := 10*time.Minute + time.Duration(id%60)*time.Second
    if err := rdb.Set(ctx, key, b, ttl).Err(); err != nil {
        return nil, err
    }
    return p, nil
}

func loadProductFromDB(ctx context.Context, id int64) (*Product, error) {
    return &Product{ID: id, Name: "Go 语言实战", Price: 9900}, nil
}
```

这个例子包含几个缓存实践：

- 命中 Redis 直接返回。
- Redis miss 后回源数据库。
- 空值短 TTL 缓存，降低缓存穿透。
- TTL 增加轻微抖动，降低同一时刻大量过期。

示例里为了简洁没有处理 `"null"` 的反序列化，生产中应该明确约定空值格式，例如 `{"exists":false}` 或单独使用标记 key。

## 三、Redis 原子操作：限流

Redis 的单线程命令执行模型让 `INCR`、`SET NX` 等操作天然适合简单原子场景。

固定窗口限流示例：

```go
func Allow(ctx context.Context, rdb *redis.Client, userID int64, limit int64) (bool, error) {
    key := fmt.Sprintf("rate:user:%d:%d", userID, time.Now().Unix()/60)

    n, err := rdb.Incr(ctx, key).Result()
    if err != nil {
        return false, err
    }
    if n == 1 {
        _ = rdb.Expire(ctx, key, 2*time.Minute).Err()
    }
    return n <= limit, nil
}
```

这个实现简单有效，但有边界：固定窗口在边界处可能放过两倍流量。要求更严格时可以用滑动窗口、令牌桶，或直接使用网关限流能力。

## 四、Redis Pipeline：降低 RTT

批量读取多个 key 时，循环逐个 `Get` 会产生多次网络往返。Pipeline 可以把命令打包发送。

```go
func BatchGetProducts(ctx context.Context, rdb *redis.Client, ids []int64) (map[int64]string, error) {
    pipe := rdb.Pipeline()
    cmds := make(map[int64]*redis.StringCmd, len(ids))

    for _, id := range ids {
        key := fmt.Sprintf("product:%d", id)
        cmds[id] = pipe.Get(ctx, key)
    }

    _, err := pipe.Exec(ctx)
    if err != nil && !errors.Is(err, redis.Nil) {
        return nil, err
    }

    result := make(map[int64]string, len(ids))
    for id, cmd := range cmds {
        val, err := cmd.Result()
        if errors.Is(err, redis.Nil) {
            continue
        }
        if err != nil {
            return nil, err
        }
        result[id] = val
    }
    return result, nil
}
```

Pipeline 不是事务，只是减少网络 RTT。如果需要“多个命令原子执行”，要考虑 Lua 脚本或 Redis 事务，但也要评估复杂度。

## 五、Redis 关键坑位

### 1. 缓存穿透、击穿、雪崩

- 穿透：大量请求不存在的数据，解决方式是空值缓存、布隆过滤器、参数校验。
- 击穿：热点 key 过期瞬间大量回源，解决方式是互斥回源、逻辑过期、热点预热。
- 雪崩：大量 key 同时过期，解决方式是 TTL 抖动、分批预热、多级缓存。

### 2. 分布式锁不要只写 SETNX

至少要使用 `SET key value NX PX ttl`，释放时校验 value，避免删掉别人的锁。更复杂场景要评估锁是否真的必要，或者改用数据库唯一约束、状态机和幂等设计。

### 3. 大 key 和热 key

一个 key 存几 MB 的 JSON，或者一个热点 key 被所有请求访问，都会影响 Redis 稳定性。生产中要监控 big key、hot key、慢日志和内存淘汰。

### 4. Redis 不是事实数据源

缓存可以丢，可以重建。关键交易状态不要只存在 Redis，除非业务明确接受这个风险并做好持久化和恢复设计。

## 六、Elasticsearch：商品搜索

Elasticsearch 适合全文检索、多条件过滤、排序和聚合。Go 官方客户端是 `github.com/elastic/go-elasticsearch/v8`。

```bash
go get github.com/elastic/go-elasticsearch/v8
```

示例：按关键词和状态搜索商品。

```go
package search

import (
    "bytes"
    "context"
    "encoding/json"
    "fmt"
    "io"

    elasticsearch "github.com/elastic/go-elasticsearch/v8"
)

type SearchProduct struct {
    ID     int64  `json:"id"`
    Name   string `json:"name"`
    Status string `json:"status"`
    Price  int64  `json:"price"`
}

func SearchProducts(ctx context.Context, es *elasticsearch.Client, keyword string, from, size int) ([]SearchProduct, error) {
    query := map[string]any{
        "query": map[string]any{
            "bool": map[string]any{
                "must": []any{
                    map[string]any{"match": map[string]any{"name": keyword}},
                },
                "filter": []any{
                    map[string]any{"term": map[string]any{"status": "online"}},
                },
            },
        },
        "sort": []any{
            map[string]any{"price": "asc"},
        },
        "from": from,
        "size": size,
    }

    body, err := json.Marshal(query)
    if err != nil {
        return nil, err
    }

    resp, err := es.Search(
        es.Search.WithContext(ctx),
        es.Search.WithIndex("products"),
        es.Search.WithBody(bytes.NewReader(body)),
    )
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    if resp.IsError() {
        b, _ := io.ReadAll(resp.Body)
        return nil, fmt.Errorf("es search failed: %s", string(b))
    }

    var raw struct {
        Hits struct {
            Hits []struct {
                Source SearchProduct `json:"_source"`
            } `json:"hits"`
        } `json:"hits"`
    }
    if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
        return nil, err
    }

    products := make([]SearchProduct, 0, len(raw.Hits.Hits))
    for _, hit := range raw.Hits.Hits {
        products = append(products, hit.Source)
    }
    return products, nil
}
```

这个例子没有封装 DSL builder，是为了让查询结构更直观。生产中可以根据团队习惯选择官方客户端、Typed API 或第三方 builder。

## 七、写入 Elasticsearch：异步同步更常见

MySQL 和 ES 之间通常不是强一致。常见链路：

1. 业务写 MySQL。
2. 写出领域事件或 binlog。
3. 消费消息更新 ES 文档。
4. 搜索结果允许短暂延迟。

直接在用户请求里同时写 MySQL 和 ES 看似简单，但有问题：

- MySQL 成功、ES 失败时状态不一致。
- ES 慢会拖慢主交易链路。
- 重试和幂等逻辑容易散落在业务代码里。

更稳妥的是把 ES 当查询模型，通过消息或任务异步构建。

## 八、Elasticsearch 关键坑位

### 1. 分页 from/size 不能无限深

`from=100000&size=20` 会让 ES 扫描和排序大量数据。深分页应使用 `search_after`，后台导出用 scroll 或 point in time。

### 2. mapping 要提前设计

字段是 `text` 还是 `keyword`，是否需要分词，数字和时间类型如何定义，都应该在建索引时明确。mapping 错了后期修改成本很高。

### 3. 搜索结果不是强一致

ES refresh 有延迟，刚写入的数据不一定立刻可搜。不要用 ES 判断支付、库存、权限这类强一致状态。

### 4. 聚合很耗资源

高基数字段聚合、无过滤的大范围聚合、深分页排序都会消耗大量 CPU 和内存。生产查询要限制时间范围、分页深度和返回字段。

### 5. 只返回需要字段

大 `_source` 会增加网络和反序列化成本。可以通过 `_source` 过滤只返回列表页需要的字段。

## 九、生产判断

Redis 适合：

- 缓存热点数据。
- 简单计数、限流、排行榜。
- 短生命周期状态。
- 可重建、可过期的数据。

Redis 不适合：

- 复杂关系查询。
- 大对象长期存储。
- 作为唯一交易数据源。

Elasticsearch 适合：

- 全文检索。
- 多条件过滤和排序。
- 日志、商品、内容搜索。
- 面向查询的冗余数据模型。

Elasticsearch 不适合：

- 强一致事务。
- 高频单文档精确更新替代数据库。
- 无边界的深分页和复杂聚合。

架构上要始终明确：谁是事实数据源，谁是加速层，谁是查询模型。

## 十、总结

Redis 和 Elasticsearch 能显著提升读性能和搜索体验，但它们解决的是不同问题。Redis 关注低延迟缓存和原子操作，Elasticsearch 关注全文检索和聚合分析。生产使用时要把 Context、连接池、超时、TTL、幂等、同步延迟和监控一起设计进去。不要因为它们快，就把所有数据和所有查询都塞进去。
