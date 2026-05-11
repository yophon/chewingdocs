# Elasticsearch 集群与优化

单节点 ES 只能做 demo。生产里的 ES 是**分布式集群**——理解分片、副本、节点角色，才能看懂监控告警、做容量规划、定位性能瓶颈。

---

## 一、核心概念

### 1. 节点角色

| 角色 | 职责 | 配置 |
| --- | --- | --- |
| Master | 管理集群元数据（索引、分片分配） | `node.roles: [master]` |
| Data | 存储数据、执行查询 | `node.roles: [data]` |
| Coordinating | 接收请求、汇总结果（无角色节点） | `node.roles: []` |
| Ingest | 写入前预处理（pipeline） | `node.roles: [ingest]` |

> 小集群（3 节点以下）可以 master + data 混部；大集群建议分离，coordinating 节点专门抗流量。

### 2. 分片与副本

```
索引 "orders"
├── 主分片 P0  ──── 副本 R0 (另一台节点)
├── 主分片 P1  ──── 副本 R1
└── 主分片 P2  ──── 副本 R2
```

- **主分片数（number_of_shards）**：创建后不可改，决定水平扩展上限
- **副本数（number_of_replicas）**：随时可改，副本承担读流量 + 容灾

**经验法则：**
- 单分片建议 10~50 GB
- 副本 ≥ 1（生产必须）
- 分片数 = 总数据量 / 30GB（粗估）

---

## 二、集群健康状态

```bash
GET /_cluster/health
```

| 状态 | 含义 |
| --- | --- |
| **green** | 所有主副分片正常 |
| **yellow** | 主分片正常，有副本未分配（通常单节点时出现） |
| **red** | 有主分片未分配，部分数据不可用 |

```bash
# 查看未分配分片原因
GET /_cluster/allocation/explain
```

---

## 三、写入优化

### 1. 批量写入（bulk API）

单条写入会触发一次网络往返 + segment flush，**批量是写入性能的关键**：

```bash
POST /_bulk
{ "index": { "_index": "orders" } }
{ "id": 1, "amount": 100 }
{ "index": { "_index": "orders" } }
{ "id": 2, "amount": 200 }
```

Java/Kotlin 用 `BulkRequest`，每批 5~15 MB 是通常最优点。

### 2. 调大 refresh_interval

ES 默认每秒 refresh（新数据才可搜索），写入高峰期可临时调大：

```bash
PUT /orders/_settings
{
  "index.refresh_interval": "30s"
}
```

批量导入数据时可以设为 `-1`（关闭 refresh），导完再恢复。

### 3. 关闭副本写入再恢复

```bash
# 导入前
PUT /orders/_settings
{ "number_of_replicas": 0 }

# 导入后
PUT /orders/_settings
{ "number_of_replicas": 1 }
```

### 4. translog 调优

```yaml
index.translog.durability: async      # 异步刷盘（有极小数据丢失风险）
index.translog.sync_interval: 5s
```

---

## 四、查询优化

### 1. 用 filter 代替 query（不评分的条件）

```json
{
  "query": {
    "bool": {
      "must":   [{ "match": { "title": "elasticsearch" } }],
      "filter": [
        { "term":  { "status": "published" } },
        { "range": { "date": { "gte": "2024-01-01" } } }
      ]
    }
  }
}
```

filter 结果会被缓存，重复执行几乎零开销。

### 2. 避免深度分页

```bash
# ❌ 深翻页，性能极差
GET /orders/_search
{ "from": 100000, "size": 10 }
```

替代方案：

| 方案 | 适用场景 |
| --- | --- |
| `search_after` | 滚动加载"下一页" |
| `scroll` API | 一次性全量导出 |
| `pit`（point in time） | 稳定分页（ES 7.10+） |

```bash
# search_after 示例（基于上一页最后一条的排序值）
{
  "sort": [{ "date": "desc" }, { "_id": "asc" }],
  "search_after": ["2024-05-01", "abc123"]
}
```

### 3. 只取需要的字段

```bash
{
  "_source": ["title", "price"],
  "query": { "match_all": {} }
}
```

或者用 `docvalue_fields` 只读 doc values（更快，适合数值/keyword）。

### 4. 减少 segment 数

```bash
POST /orders/_forcemerge?max_num_segments=1
```

只对**不再写入的索引**（历史归档）做 force merge，主动写入的索引不要用。

---

## 五、索引生命周期管理（ILM）

日志类数据随时间增长，ILM 自动管理"热温冷"分层：

```bash
PUT _ilm/policy/logs_policy
{
  "policy": {
    "phases": {
      "hot": {
        "actions": {
          "rollover": { "max_size": "50gb", "max_age": "7d" }
        }
      },
      "warm": {
        "min_age": "7d",
        "actions": {
          "shrink":   { "number_of_shards": 1 },
          "readonly": {}
        }
      },
      "cold": {
        "min_age": "30d",
        "actions": { "freeze": {} }
      },
      "delete": {
        "min_age": "90d",
        "actions": { "delete": {} }
      }
    }
  }
}
```

---

## 六、监控关键指标

| 指标 | 正常范围 | 告警阈值 |
| --- | --- | --- |
| JVM Heap Usage | < 75% | > 85% |
| GC Old Gen 频率 | 极少 | 频繁触发 |
| Search latency p99 | < 200ms | > 500ms |
| Indexing rate | 平稳 | 突降 |
| Pending tasks | 0 | > 10 |

```bash
GET /_nodes/stats                  # 节点级别指标
GET /_cluster/stats                # 集群总览
GET /_cat/indices?v&h=index,health,pri,rep,store.size
```

---

## 七、常见问题排查

### 集群 yellow

```bash
# 通常是单节点，副本无处分配
PUT /my_index/_settings
{ "number_of_replicas": 0 }
```

### OOM / GC 频繁

- JVM Heap 设为物理内存的 50%，最大不超过 31 GB（超过压缩指针失效）
- 排查是否有大 aggregation 或 deep scroll 把 heap 撑爆

### 磁盘满了自动变只读

```bash
PUT /_cluster/settings
{
  "persistent": {
    "cluster.routing.allocation.disk.watermark.low": "85%",
    "cluster.routing.allocation.disk.watermark.high": "90%",
    "cluster.routing.allocation.disk.watermark.flood_stage": "95%"
  }
}
# 清理空间后解除只读
PUT /my_index/_settings
{ "index.blocks.read_only_allow_delete": null }
```

---

## 小结

| 优化方向 | 核心手段 |
| --- | --- |
| 写入性能 | bulk API、调大 refresh_interval、导入时关副本 |
| 查询性能 | filter 缓存、search_after 代替 from/offset、只取需要字段 |
| 存储成本 | ILM 分层、force merge 归档索引 |
| 稳定性 | 分离节点角色、副本 ≥ 1、JVM Heap ≤ 50% 物理内存 |
