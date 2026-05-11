# Elasticsearch 查询 DSL

ES 的 Query DSL 第一眼像一团 JSON,但只要分清 **"是否参与评分"** 和 **"叶子查询 vs 复合查询"**,一切就清晰了。

---

## 一、Query Context vs Filter Context

| Context | 是否评分 | 是否缓存 | 用途 |
| --- | --- | --- | --- |
| **query** | ✅ | ❌ | 全文检索、相关性 |
| **filter** | ❌(只判 yes/no) | ✅ | 精确过滤(状态、范围、tag) |

> 经验法则:**只有真正需要相关性排序时才用 query,其他全部丢 filter**——更快、可缓存。

---

## 二、最常用的 6 种叶子查询

```http
# 1. match —— 全文检索(对查询词分词)
{ "query": { "match": { "name": "iphone pro" } } }

# 2. match_phrase —— 短语匹配(顺序也要对)
{ "query": { "match_phrase": { "name": "iphone pro" } } }

# 3. multi_match —— 多字段
{ "query": { "multi_match": { "query": "iphone", "fields": ["name^3", "desc"] } } }
#   ^3 表示给 name 字段加权

# 4. term —— 精确匹配,不分词(对 keyword 字段)
{ "query": { "term": { "status": "active" } } }

# 5. terms —— IN
{ "query": { "terms": { "tags": ["phone", "5g"] } } }

# 6. range —— 范围
{ "query": { "range": { "price": { "gte": 100, "lt": 1000 } } } }
{ "query": { "range": { "created_at": { "gte": "now-7d/d" } } } }
```

⚠️ **`term` 别用在 `text` 字段**——text 字段被分词成多个 term,直接用整段 term 匹配多半搜不到。

---

## 三、复合查询:`bool`

业务里 90% 的复杂查询是 bool 拼出来的。

```http
{
  "query": {
    "bool": {
      "must":     [ { "match": { "name": "iphone" } } ],
      "should":   [ { "match": { "desc": "pro" } } ],
      "must_not": [ { "term": { "status": "off" } } ],
      "filter":   [
        { "term":  { "brand": "apple" } },
        { "range": { "price": { "lte": 2000 } } }
      ],
      "minimum_should_match": 1
    }
  }
}
```

| 子句 | 含义 |
| --- | --- |
| `must` | AND,**参与评分** |
| `must_not` | AND NOT,**不参与评分**(filter context) |
| `should` | OR,参与评分(可被 minimum_should_match 控制必须命中几个) |
| `filter` | AND,**不参与评分**,可缓存 |

> 把"不需要评分的条件"放 `filter`,你的查询会快好几倍。

---

## 四、分页

```http
{
  "from": 0,
  "size": 20,
  "query": { "match_all": {} },
  "sort": [{ "created_at": "desc" }]
}
```

⚠️ **`from + size` 默认上限 10000**(`index.max_result_window`),深翻页性能极差。

### 1. search_after(推荐)

```http
{
  "size": 20,
  "query": { ... },
  "sort": [{ "created_at": "desc" }, { "_id": "desc" }],
  "search_after": [1727000000000, "doc-12345"]      // 上一页最后一条的 sort 值
}
```

适合"翻页 / 无限滚动",**没有深度限制**。

### 2. PIT + search_after

PIT(Point In Time)给一致快照,适合需要"翻很多页且数据变化"的场景。

### 3. scroll(已不推荐)

适合"导出整个索引"的离线任务,新版 ES 推荐 `search_after + PIT` 取代。

---

## 五、排序

```http
"sort": [
  { "price": "asc" },
  { "_score": "desc" },                       // 默认排序键
  { "created_at": { "order": "desc", "missing": "_last" } }
]
```

⚠️ 排序字段必须是 `keyword / numeric / date`(不能是 `text`,会报错)。

---

## 六、聚合(Aggregation)

ES 的另一面——**轻量数据仓库**。

```http
{
  "size": 0,                                  // 不返回文档,只要聚合结果
  "aggs": {
    "by_brand": {
      "terms": { "field": "brand", "size": 10 },
      "aggs": {
        "avg_price": { "avg": { "field": "price" } },
        "max_price": { "max": { "field": "price" } }
      }
    }
  }
}
```

返回:

```json
{
  "aggregations": {
    "by_brand": {
      "buckets": [
        { "key": "apple", "doc_count": 12, "avg_price": { "value": 1500 }, ... },
        ...
      ]
    }
  }
}
```

### 聚合三大类

| 类 | 例 | 说明 |
| --- | --- | --- |
| **Bucket** | terms / range / histogram / date_histogram | 分桶 |
| **Metric** | avg / sum / min / max / cardinality / stats | 桶内指标 |
| **Pipeline** | derivative / cumulative_sum / bucket_script | 二次计算 |

### 时序统计

```http
{
  "size": 0,
  "aggs": {
    "by_day": {
      "date_histogram": {
        "field": "created_at",
        "calendar_interval": "day",
        "time_zone": "+08:00"
      },
      "aggs": {
        "uv": { "cardinality": { "field": "user_id" } }
      }
    }
  }
}
```

---

## 七、高亮

```http
{
  "query": { "match": { "content": "redis" } },
  "highlight": {
    "fields": { "content": {} },
    "pre_tags":  ["<em>"],
    "post_tags": ["</em>"]
  }
}
```

返回里多一个 `highlight.content` 字段,把命中词用标签包起来。前端拿到直接渲染。

---

## 八、`exists` / `missing`

```http
{ "query": { "bool": { "must_not": { "exists": { "field": "deleted_at" } } } } }
```

ES 没有"NULL"概念,字段不存在就是不存在。`exists` 判断字段有没有值。

---

## 九、嵌套 nested

数组对象默认会被 ES 摊平,导致字段间关系丢失:

```json
{ "users": [{ "name":"a", "age":30 }, { "name":"b", "age":40 }] }
// 摊平后:users.name = [a,b], users.age = [30,40]
// 查询 name=a AND age=40 会命中(实际不存在这条)
```

声明 `"type": "nested"` 后,每个对象作为独立小文档存,要用 `nested` 查询访问:

```http
{
  "query": {
    "nested": {
      "path": "users",
      "query": {
        "bool": { "must": [
          { "term":  { "users.name": "a" } },
          { "range": { "users.age":  { "gte": 30, "lt": 40 } } }
        ]}
      }
    }
  }
}
```

---

## 十、模糊与拼写纠错

```http
# 通配符(慢,生产慎用)
{ "query": { "wildcard": { "name.keyword": "iph*" } } }

# 编辑距离模糊
{ "query": { "match": { "name": { "query": "iphone", "fuzziness": "AUTO" } } } }

# 前缀
{ "query": { "prefix": { "name.keyword": "iph" } } }
```

---

## 十一、自动补全(suggester)

```http
PUT /products
{ "mappings": { "properties": { "name_suggest": { "type": "completion" } } } }

POST /products/_doc/1
{ "name_suggest": { "input": ["iPhone 15", "iphone15", "苹果15"] } }

GET /products/_search
{
  "suggest": {
    "s1": { "prefix": "iph", "completion": { "field": "name_suggest", "size": 5 } }
  }
}
```

毫秒返回。前端搜索框输入即出建议。

---

## 十二、相关性排序的直觉

ES 默认用 **BM25** 算法,综合考虑:

- **TF**:词在文档中的频次
- **IDF**:这个词在多少文档里出现过(越罕见越值钱)
- **字段长度**:短字段命中得分高(标题命中比正文命中重要)

业务可以再加 `boost`、`function_score` 调整:

```http
{
  "query": {
    "function_score": {
      "query": { "match": { "name": "iphone" } },
      "functions": [
        { "filter": { "term": { "stock": "in" } }, "weight": 2 },
        { "field_value_factor": { "field": "sales", "modifier": "log1p", "factor": 0.1 } }
      ],
      "score_mode": "sum",
      "boost_mode": "multiply"
    }
  }
}
```

> 真正调好搜索相关性是一个持续工程,先用默认的,等业务有埋点反馈再调。

---

## 十三、一个完整业务查询示例

电商搜索:**关键词 "iphone"、品牌 apple、价格 < 2000、有货,按销量加权打分,Top 20**:

```http
GET /products/_search
{
  "from": 0, "size": 20,
  "query": {
    "function_score": {
      "query": {
        "bool": {
          "must":   [ { "multi_match": { "query": "iphone", "fields": ["name^3", "desc"] } } ],
          "filter": [
            { "term":  { "brand": "apple" } },
            { "range": { "price": { "lt": 2000 } } },
            { "term":  { "stock_status": "in" } }
          ]
        }
      },
      "functions": [
        { "field_value_factor": { "field": "sales", "modifier": "log1p", "factor": 0.1 } }
      ],
      "boost_mode": "sum"
    }
  },
  "highlight": { "fields": { "name": {} } },
  "_source": ["id", "name", "price", "brand", "thumb"]
}
```

---

## 十四、给新手的建议

1. **不需要评分的条件全丢 `filter`**,这是最简单的优化
2. **永远只 `_source` 查需要的字段**,带宽和反序列化都省
3. **别 `from + size` 翻深页**,用 `search_after`
4. **聚合返回大的 buckets 数量很慢**,加 `size` 控制
5. **DSL 看起来很复杂,但都是 bool + 叶子查询的组合,多写几次就熟了**
