# Elasticsearch 基础

Elasticsearch(ES)是基于 Lucene 的 **分布式搜索 + 分析引擎**。它解决两个问题:**全文检索** 和 **海量数据上的聚合分析**(日志、指标、监控)。

---

## 一、ES 解决了什么 MySQL 解决不了的事

| 场景 | MySQL | Elasticsearch |
| --- | --- | --- |
| `LIKE '%xxx%'` 全文检索 | 全表扫,索引失效 | 倒排索引,毫秒级 |
| 1 亿日志中聚合分析 | 慢得没法看 | 秒级 |
| 多字段组合过滤 + 评分 | 逻辑复杂 | DSL 一目了然 |
| 中文分词 / 同义词 | 不擅长 | 分词器生态完备 |

> 经验:**ES 不是数据库的替代品**——主数据放在 MySQL/PG,定期同步到 ES 做检索/分析。ES 自身不保证强一致,对事务不友好。

---

## 二、核心概念

| ES 概念 | 类比 MySQL |
| --- | --- |
| **Cluster** | 整个数据库集群 |
| **Node** | 一台 ES 实例 |
| **Index** | 数据库 / 表(扁平,无层级) |
| **Document** | 行,JSON 文档 |
| **Field** | 列 |
| **Mapping** | 表结构(schema) |
| **Shard / Replica** | 分片 / 副本(每个 index 拆 N 片,每片有 0~N 个副本) |

---

## 三、起一个 ES + Kibana

```yaml
# docker-compose.yml
services:
  es:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.13.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
      - ES_JAVA_OPTS=-Xms1g -Xmx1g
    ports: ["9200:9200"]
    volumes: [esdata:/usr/share/elasticsearch/data]
  kibana:
    image: docker.elastic.co/kibana/kibana:8.13.0
    ports: ["5601:5601"]
    depends_on: [es]
volumes:
  esdata:
```

```bash
docker compose up -d
curl http://localhost:9200      # {"name":"...","cluster_name":"docker-cluster"...}
```

Kibana → Dev Tools 是写 DSL 最舒服的地方(自动补全、保留历史)。

---

## 四、倒排索引

ES 速度的根源。

```
原文档:
  doc1: "the quick brown fox"
  doc2: "the lazy dog"

倒排索引:
  the    → [doc1, doc2]
  quick  → [doc1]
  brown  → [doc1]
  fox    → [doc1]
  lazy   → [doc2]
  dog    → [doc2]
```

查询 `quick fox` 只要查这两个 term 的 posting list,然后求交集。和"翻字典找词"完全是同样的思路。

---

## 五、分词与分析(Analyzer)

文档进 ES 时,**字符串字段会经过分析器拆成 term**:

```
"The Quick Brown Fox"
   ↓ standard analyzer
[the, quick, brown, fox]
```

分析器三步:`character filter → tokenizer → token filter`

| Analyzer | 用途 |
| --- | --- |
| `standard`(默认) | 英文按空格 + 小写 |
| `keyword` | 整个值当一个 term,不分词 |
| `whitespace` | 仅按空格 |
| `ik_smart` / `ik_max_word` | 中文(IK 分词器,需安装) |

```http
POST /_analyze
{ "analyzer": "ik_smart", "text": "中华人民共和国" }
```

---

## 六、Mapping(字段类型)

| 类型 | 说明 |
| --- | --- |
| `keyword` | 不分词,精确匹配,排序、聚合用 |
| `text` | 分词,**全文检索用** |
| `long / integer / short / byte` | 整数 |
| `float / double` | 浮点 |
| `boolean` | true/false |
| `date` | 日期(ISO 字符串或 epoch_millis) |
| `object / nested` | 嵌套对象 |
| `geo_point / geo_shape` | 地理位置 |
| `ip` | IP 地址 |

> **同一字段经常 既要全文检索 又要精确匹配/聚合** → 用 multi-field:

```json
PUT /products
{
  "mappings": {
    "properties": {
      "name":  {
        "type": "text",
        "analyzer": "ik_max_word",
        "fields": {
          "keyword": { "type": "keyword", "ignore_above": 256 }
        }
      },
      "price": { "type": "double" },
      "tags":  { "type": "keyword" },
      "created_at": { "type": "date" }
    }
  }
}
```

之后用 `name` 做全文检索,用 `name.keyword` 做聚合或精确匹配。

---

## 七、动态 mapping

不显式建 mapping 时,ES 会根据第一个文档自动推断字段类型。

⚠️ **生产强烈建议显式建 mapping**:

- "13888888888" 第一次写入会被推成 `long`,后面写"+86"开头报错
- 字符串默认是 `text + .keyword`,占空间多一倍
- 字段一旦定型就改不了(只能新建索引 + reindex)

---

## 八、CRUD 文档

```http
# 写入(指定 ID)
PUT /products/_doc/1
{ "name": "iPhone 15", "price": 999, "tags": ["phone","5g"] }

# 自动生成 ID
POST /products/_doc
{ "name": "MacBook", "price": 1999 }

# 取
GET /products/_doc/1

# 更新(部分)
POST /products/_update/1
{ "doc": { "price": 888 } }

# 删除
DELETE /products/_doc/1

# 批量(bulk,每两行一对操作 + 数据)
POST /_bulk
{ "index": { "_index": "products", "_id": "1" } }
{ "name": "A", "price": 1 }
{ "index": { "_index": "products", "_id": "2" } }
{ "name": "B", "price": 2 }
```

> bulk 是写入 ES 的标准姿势,**每秒上万条**,千万别一条一条 PUT。

---

## 九、最简单的搜索

```http
GET /products/_search
{
  "query": {
    "match": { "name": "iphone" }
  }
}
```

返回里关键字段:

| 字段 | 含义 |
| --- | --- |
| `took` | 耗时 ms |
| `hits.total.value` | 命中总数 |
| `hits.max_score` | 最高得分 |
| `hits.hits[].\_source` | 原文档 |
| `hits.hits[].\_score` | 该文档得分(BM25 算法) |

---

## 十、分片与副本

```http
PUT /products
{ "settings": { "number_of_shards": 3, "number_of_replicas": 1 } }
```

- **shard**:把一个大索引拆成 N 个分片,**写入并行 + 容量横向扩展**。一旦设定**不可改**(只能 reindex)
- **replica**:每个分片的副本,**容灾 + 读扩展**。可以动态调

> 经验:
> - 单分片大小控制在 10~50GB
> - 写多读少:多分片
> - 读多:加副本
> - 数据量小(< 10GB)直接 1 分片 + 1 副本

---

## 十一、写入流程(简化)

```
1. 客户端把文档发到任意节点(coordinate)
2. coordinate 算出 hash(_id) % shards → 路由到主分片
3. 主分片写 in-memory buffer + translog(日志,落盘保证持久性)
4. 默认每 1s 把 buffer 写入新的 segment(refresh),变可搜索
5. 主分片把数据并行同步到所有 replica
6. 全部 ACK 后返回客户端
```

⚠️ **`refresh` 默认 1s**,意味着写入后 1s 内可能搜不到——这就是 ES 所谓的 **near real-time**。要立即可见用 `?refresh=true`,但极其耗资源,生产不要乱用。

---

## 十二、ES 的几种"刷盘"

| 操作 | 做了什么 | 频率 |
| --- | --- | --- |
| refresh | buffer → segment(可搜索),不落盘 | 1s |
| flush | translog 落盘 + segment 真正刷到磁盘 | 30min 或 translog 满 512MB |
| merge | 多个 segment 合并 | 后台自动 |

---

## 十三、版本与并发控制

```http
PUT /products/_doc/1?if_seq_no=5&if_primary_term=1
{ ... }
```

如果当前 doc 的 seq_no 不等于 5,会返 409,业务可重试。

> 这是 ES 的 **乐观锁**(Optimistic Concurrency Control),适合"先读后写"场景。

---

## 十四、与 MySQL 同步的常见架构

### 1. 双写

应用写 MySQL 后再写 ES。简单,**但不一致风险大**(写 MySQL 成功、写 ES 失败)。

### 2. 异步 binlog 订阅

```
MySQL → binlog → Canal/Debezium → Kafka → 消费者 → ES
```

业内主流。优点:**应用层解耦、数据最终一致**。

### 3. 定时全量 + 增量

简单业务用得最多:每天凌晨全量 reindex,工作时间增量基于 `updated_at` 拉取。

---

## 十五、生产部署要点

1. **JVM 堆 ≤ 31GB**(超过指针压缩失效)
2. **堆 = 物理内存 / 2**,另一半留给文件系统缓存(Lucene)
3. **机型**:数据节点要快盘(NVMe SSD 优先)
4. **不要 Swap**:`bootstrap.memory_lock=true`
5. **冷热分离**:近 7 天数据放 hot 节点(SSD + 大内存),老数据放 warm/cold(HDD)
6. **生命周期管理(ILM)**:自动 rollover、迁移、删除

---

## 十六、给新手的建议

1. **第一天就建 mapping**,不要依赖动态推断
2. **写入用 bulk + 自动 ID**(指定 ID 比自动慢),配合 `refresh_interval=30s` 提升吞吐
3. **不要把 ES 当主库**,数据丢了你可能找不回来
4. **了解 BM25 评分算法的直觉**(词频高、文档短的得分高),别直接抄 SQL 的 ORDER BY
5. **学会用 Kibana Dev Tools**,你的 90% 工作都在那里完成
