# NoSQL交互：Redis与Elasticsearch

> **导读**：在高并发服务端开发中，纯靠关系型数据库一定会被打挂，引入 Redis 做缓存、ES 做复杂检索是标配。

## 一、Redis 交互 (go-redis)
`github.com/redis/go-redis` 是目前 Go 生态最主流的 Redis 客户端，自带连接池。

```go
import "github.com/redis/go-redis/v9"
import "context"

var ctx = context.Background()

func main() {
    rdb := redis.NewClient(&redis.Options{
        Addr:     "localhost:6379",
        Password: "", 
        DB:       0,  
    })

    // 设置键值带过期时间 (很重要，防缓存雪崩)
    err := rdb.Set(ctx, "key", "value", 10*time.Minute).Err()

    // 读取
    val, err := rdb.Get(ctx, "key").Result()
    if err == redis.Nil {
        fmt.Println("Key does not exist")
    } else if err != nil {
        panic(err)
    }
}
```
**高并发技巧**：使用 Redis 自身的原子操作（如 `Incr`）进行防刷限流；利用 `Pipeline` 一次性打包发送几十条命令，极大降低网络 RTT 延迟。

## 二、Elasticsearch 交互 (olivere/elastic)
当业务需要“全文检索”、“多维条件聚合分析”（例如电商商品过滤）时，MySQL 的 Like 查询会导致全表扫描。

```go
// 引入第三方成熟库 github.com/olivere/elastic/v7
client, err := elastic.NewClient(elastic.SetURL("http://localhost:9200"))

// 构造复杂查询条件
termQuery := elastic.NewTermQuery("status", "active")
matchQuery := elastic.NewMatchQuery("description", "golang")
boolQuery := elastic.NewBoolQuery().Must(termQuery, matchQuery)

// 执行查询
searchResult, err := client.Search().
    Index("products").
    Query(boolQuery).
    Sort("price", true). // 价格升序
    From(0).Size(10).    // 分页
    Do(ctx)

// 解析结果
var products []Product
for _, item := range searchResult.Each(reflect.TypeOf(Product{})) {
    p := item.(Product)
    products = append(products, p)
}
```
