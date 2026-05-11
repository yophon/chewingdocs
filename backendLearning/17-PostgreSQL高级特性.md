# PostgreSQL 高级特性

PG 真正令人上瘾的部分。本章覆盖:**JSONB、CTE、窗口函数、UPSERT、分区表、扩展生态(PostGIS / pgvector / TimescaleDB)**。

---

## 一、JSONB:文档 + 关系一把抓

### 1. JSON vs JSONB

| 类型 | 存储 | 索引 | 速度 |
| --- | --- | --- | --- |
| `JSON` | 原文文本 | ❌ | 写快,读时解析 |
| `JSONB` | 二进制 | ✅ GIN | 写稍慢,读快、可索引,**生产推荐** |

### 2. 基本操作

```sql
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  name TEXT,
  spec JSONB
);

INSERT INTO products(name, spec) VALUES
('iphone', '{"brand":"apple","color":"black","price":999,"tags":["phone","5g"]}'),
('mac',    '{"brand":"apple","color":"silver","price":1999,"tags":["laptop"]}');

-- 取字段(-> 返回 JSON,->> 返回 text)
SELECT spec->'brand'   FROM products;        -- "apple"
SELECT spec->>'brand'  FROM products;        -- apple
SELECT spec#>'{a,b,c}' FROM products;        -- 多层路径

-- 包含查询(@>)
SELECT * FROM products WHERE spec @> '{"brand":"apple"}';

-- 是否有 key
SELECT * FROM products WHERE spec ? 'tags';

-- 数组任意元素
SELECT * FROM products WHERE spec->'tags' @> '"5g"';
```

### 3. GIN 索引

```sql
-- 通用 GIN(支持 @>, ?, ?| 等)
CREATE INDEX idx_products_spec ON products USING gin (spec);

-- 路径优化(jsonb_path_ops)更小更快,只支持 @>
CREATE INDEX idx_products_spec ON products USING gin (spec jsonb_path_ops);

-- 表达式索引:针对某个 key
CREATE INDEX idx_products_brand ON products ((spec->>'brand'));
```

### 4. 修改 JSONB

```sql
-- jsonb_set:更新某路径
UPDATE products
SET spec = jsonb_set(spec, '{price}', '888')
WHERE id = 1;

-- 合并(后面的覆盖前面的)
UPDATE products SET spec = spec || '{"discount": 0.1}'::jsonb;

-- 删除 key
UPDATE products SET spec = spec - 'discount';

-- 删除路径
UPDATE products SET spec = spec #- '{specs,color}';
```

### 5. 什么时候用 JSONB,什么时候用列

| 场景 | 选择 |
| --- | --- |
| 字段固定、查询频繁、需 join | **列** |
| schemaless、字段动态、查询少 | **JSONB** |
| 用户自定义属性、配置项 | JSONB |
| 给前端的扩展字段 `extra` | JSONB |

> 经验:**别把整个对象塞 JSONB 偷懒**——常查的字段单独立列,JSONB 留给"灵活属性"。

---

## 二、CTE:结构化复杂查询

CTE(Common Table Expression)就是 `WITH ... AS (...)`,把"中间结果"命名,像写函数一样组织 SQL。

```sql
WITH active AS (
  SELECT id, name FROM users WHERE status = 1
), big_orders AS (
  SELECT user_id, SUM(amount) AS total
  FROM orders
  WHERE created_at > NOW() - INTERVAL '30 days'
  GROUP BY user_id
  HAVING SUM(amount) > 10000
)
SELECT a.id, a.name, b.total
FROM active a
JOIN big_orders b ON b.user_id = a.id
ORDER BY b.total DESC;
```

### 递归 CTE:树形结构

```sql
-- 部门表,parent_id 形成层级
WITH RECURSIVE tree AS (
  SELECT id, name, parent_id, 1 AS lvl
  FROM departments WHERE parent_id IS NULL
  UNION ALL
  SELECT d.id, d.name, d.parent_id, t.lvl + 1
  FROM departments d JOIN tree t ON d.parent_id = t.id
)
SELECT * FROM tree ORDER BY lvl, id;
```

> 递归 CTE 让"评论楼中楼、组织架构、目录树"这种查询一行 SQL 搞定,MySQL 8 也支持但生态成熟度不如 PG。

---

## 三、窗口函数

> 第 12 章简单提过,这里讲 PG 特色用法。

```sql
SELECT
  user_id, order_id, amount, created_at,
  ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn,
  LAG(amount)  OVER (PARTITION BY user_id ORDER BY created_at)      AS prev,
  SUM(amount)  OVER (PARTITION BY user_id ORDER BY created_at
                     ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cum
FROM orders;
```

典型应用:

- **取每个用户最新一笔订单**:`WHERE rn = 1`
- **环比增长**:`amount - prev`
- **累计**(累计和、累计去重)

PG 的 `FILTER` 语法在窗口/聚合里特别好用:

```sql
SELECT user_id,
  COUNT(*) FILTER (WHERE status='paid')      AS paid_cnt,
  COUNT(*) FILTER (WHERE status='refunded')  AS refund_cnt,
  SUM(amount) FILTER (WHERE status='paid')   AS paid_amt
FROM orders
GROUP BY user_id;
```

比 `CASE WHEN` 写法更清晰。

---

## 四、UPSERT 与并发

```sql
INSERT INTO counters(key, n) VALUES ('login', 1)
ON CONFLICT (key) DO UPDATE
SET n = counters.n + 1
RETURNING n;
```

`ON CONFLICT` 是 PG 9.5 引入的,**原子操作**,不需要事务包裹。

---

## 五、分区表(Declarative Partitioning)

PG 10 起,声明式分区(类似 Oracle/MySQL)。

```sql
CREATE TABLE logs (
  id BIGSERIAL,
  level TEXT,
  msg   TEXT,
  ts    TIMESTAMPTZ NOT NULL
) PARTITION BY RANGE (ts);

CREATE TABLE logs_2024_01 PARTITION OF logs
  FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
CREATE TABLE logs_2024_02 PARTITION OF logs
  FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');
```

写入时 PG 自动路由到对应分区,查询会自动 **partition pruning**(只扫相关分区)。

适合:**按时间归档的大表**(日志、订单、消息)。

⚠️ 注意:全局唯一约束跨分区不能保证,主键必须包含分区键。

---

## 六、全文检索(轻量)

PG 自带全文检索,中量数据可用,**不必上 ES**。

```sql
ALTER TABLE articles ADD COLUMN tsv tsvector;
UPDATE articles SET tsv = to_tsvector('simple', title || ' ' || body);
CREATE INDEX idx_articles_tsv ON articles USING gin (tsv);

SELECT id, title, ts_rank(tsv, q) AS rank
FROM articles, to_tsquery('simple', 'postgres & json') q
WHERE tsv @@ q
ORDER BY rank DESC LIMIT 10;
```

中文需要分词扩展:`zhparser` / `pg_jieba`。生产严肃中文检索还是 ES 更稳。

---

## 七、扩展生态(让 PG 不止是数据库)

```sql
\dx                                       -- 列已安装扩展
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

| 扩展 | 用途 |
| --- | --- |
| `pgcrypto` | 加解密、UUID 生成 |
| `uuid-ossp` | UUID v1/v4 |
| `hstore` | 老式 KV 类型(JSONB 出现后基本被替代) |
| `pg_trgm` | 模糊匹配(LIKE / 相似度) |
| `citext` | 大小写不敏感字符串 |
| `PostGIS` | **地理空间**,业内事实标准 |
| `TimescaleDB` | **时序数据库**,IoT / 监控 |
| `pgvector` | **向量检索**,LLM 时代必备 |
| `pg_stat_statements` | 查询统计,慢查询定位 |
| `Citus` | 分布式 PG |

### pg_trgm:LIKE %xx% 走索引

```sql
CREATE EXTENSION pg_trgm;
CREATE INDEX idx_users_name_trgm ON users USING gin (name gin_trgm_ops);

SELECT * FROM users WHERE name ILIKE '%tom%';   -- 走 GIN 索引
```

### pgvector:向量检索

```sql
CREATE EXTENSION vector;
CREATE TABLE docs (id SERIAL PRIMARY KEY, content TEXT, emb vector(1536));
CREATE INDEX ON docs USING ivfflat (emb vector_cosine_ops) WITH (lists=100);

SELECT id, content, 1 - (emb <=> '[0.1, 0.2, ...]') AS score
FROM docs
ORDER BY emb <=> '[0.1, 0.2, ...]'
LIMIT 5;
```

LLM RAG 直接 PG 上做,不需要单独上 Pinecone / Milvus。

---

## 八、统计与慢查询

### 1. EXPLAIN

```sql
EXPLAIN ANALYZE
SELECT * FROM orders WHERE user_id=1 AND created_at > '2024-01-01';
```

输出比 MySQL 详细:节点类型、循环次数、实际时间、行数估算 vs 真实。

```
Seq Scan on orders  (cost=0.00..1234.00 rows=200 width=64)
                    (actual time=0.012..2.345 rows=180 loops=1)
```

> 经验:`cost` 是估算,`actual time` 才是真正耗时。优化器估错(`rows`/`actual rows` 差距大)是慢 SQL 常见原因。

### 2. pg_stat_statements

```sql
CREATE EXTENSION pg_stat_statements;       -- 一次性
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements
ORDER BY total_exec_time DESC LIMIT 20;
```

线上"哪些 SQL 最慢、最频繁"一目了然。

---

## 九、并发与锁

PG 用 **MVCC**(同样的核心思路,但实现细节与 MySQL 不同):

- 写不阻塞读(读不同版本)
- 读不阻塞写
- **没有"间隙锁"概念**——RR 级别仍可能幻读,要 SERIALIZABLE 才能彻底防

```sql
SELECT * FROM users WHERE id=1 FOR UPDATE;        -- 行 X 锁
SELECT * FROM users WHERE id=1 FOR SHARE;          -- 行 S 锁
SELECT * FROM users WHERE id=1 FOR UPDATE NOWAIT;  -- 拿不到立刻报错
SELECT * FROM users WHERE id=1 FOR UPDATE SKIP LOCKED;  -- 拿不到跳过(队列消费)
```

> `SKIP LOCKED` 是写"基于 PG 的轻量任务队列"的关键,MySQL 8 也支持。

---

## 十、典型反模式

1. **大量 NUMERIC 当 ID**:用 `BIGINT`,NUMERIC 慢且占位
2. **`SELECT *` 遇到 TOAST 大字段**:PG 自动把大字段单独存,SELECT * 会触发额外 IO
3. **超大事务**:`vacuum` 会被卡住,长事务杀手
4. **盲目 GIN 索引整个 JSONB**:数据量大时索引比表还大,改用表达式索引或键值列拆出来

---

## 十一、给新手的建议

1. **JSONB 是 PG 的"杀手锏",但不是垃圾桶**
2. **递归 CTE 学一次,树形数据再无烦恼**
3. **窗口函数 + FILTER + RETURNING 是写复杂业务 SQL 的三把刀**
4. **pg_stat_statements 第一天就开**,慢 SQL 自己浮出来
5. **新业务能用 PG 就用 PG**,你以后会发现要的东西它早就有了
