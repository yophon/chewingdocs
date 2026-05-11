# MySQL 索引与优化

索引是 MySQL 性能的命脉。学会**看 EXPLAIN、识别索引是否生效、避免索引失效**,你就甩开 80% 的同行了。

---

## 一、为什么需要索引

数据存在磁盘,扫描一张 100 万行的表,即使 SSD 也要数秒。索引就是 **"目录"**——通过它从 `O(N)` 降到 `O(log N)`。

代价:

- **写性能下降**(每次 INSERT/UPDATE/DELETE 要同步维护索引)
- **占空间**(索引本身是数据)

> 经验法则:**只在选择性高、查询频繁的列上建索引**。一张表索引数量控制在 5 个以内。

---

## 二、B+ 树索引(InnoDB 默认)

InnoDB 用 **B+ 树** 实现索引:

```
        [50, 100]                ← 根
       /    |    \
   [10,30] [60,80] [120,150]    ← 中间
   ↓ ↓ ↓     ...
  叶子节点: 排序的真实数据(聚簇索引)或主键值(二级索引)
```

特点:

- **叶子节点之间用链表连**,范围查询特快
- **树高一般 3~4 层**,查千万级数据也只要几次磁盘 IO

### 聚簇索引 vs 二级索引

| 概念 | 内容 |
| --- | --- |
| 聚簇索引 | 主键索引,叶子节点 = **完整数据行** |
| 二级索引 | 普通索引,叶子节点 = **主键值**,需要"回表"再查聚簇索引 |

```
主键查询:        idx → 数据行            (1 次树查)
二级索引查询:    idx → 主键 → 聚簇索引 → 数据行  (回表)
覆盖索引:       idx → 数据行(就在索引里)  (无回表)
```

---

## 三、索引的种类

| 类型 | 说明 |
| --- | --- |
| 主键索引 | 一张表只能有一个,聚簇索引 |
| 唯一索引 | 不允许重复,可有 NULL |
| 普通索引 | 加速查询,允许重复 |
| 联合索引 | 多列组合 `(a, b, c)` |
| 全文索引 | `FULLTEXT`,中文需要 ngram 分词,生产用 ES 更合适 |
| 空间索引 | `SPATIAL`,GIS |
| 函数索引(8.0+) | `INDEX ((LOWER(email)))` |

```sql
ALTER TABLE users ADD UNIQUE KEY uk_email (email);
ALTER TABLE users ADD INDEX  idx_status_created (status, created_at);
```

---

## 四、最左前缀原则(联合索引必懂)

联合索引 `(a, b, c)` 实际等价于 **同时有这 3 个索引**:

- `(a)`
- `(a, b)`
- `(a, b, c)`

**而 `(b)`、`(c)`、`(b, c)` 用不上**。

```sql
-- 索引: (status, created_at, user_id)

WHERE status=1                          ✅ 用(只用 status)
WHERE status=1 AND created_at > ?       ✅ 用(用前两列)
WHERE status=1 AND user_id=10           ✅ 用 status,但 user_id 走不到树定位,只走过滤
WHERE created_at > ? AND user_id=10     ❌ 不走索引(从 b 开始,缺 a)
WHERE user_id=10                        ❌ 不走索引
```

> 经验:**最常用的列放最左、范围列放最右**,例如 `(tenant_id, status, created_at)`。

---

## 五、覆盖索引

如果 SELECT 的字段全部在索引里,**就不需要回表**,极快。

```sql
-- 索引 (status, created_at, name)
SELECT name FROM users WHERE status=1 AND created_at > '2024-01-01';   ✅ 覆盖
SELECT * FROM users WHERE status=1 AND created_at > '2024-01-01';      ❌ 回表
```

EXPLAIN 中 `Extra: Using index` 就代表覆盖。

> 这就是**为什么不要 SELECT \***——它会逼 MySQL 回表。

---

## 六、索引失效的常见场景

### 1. 函数 / 计算

```sql
WHERE DATE(created_at) = '2024-01-01'        ❌ created_at 索引失效
WHERE created_at >= '2024-01-01' AND created_at < '2024-01-02'  ✅
WHERE id + 1 = 100                           ❌
WHERE id = 99                                ✅
```

### 2. 隐式类型转换

```sql
-- phone 是 VARCHAR
WHERE phone = 13800001234        ❌ 数字 → 字符串 转换,索引失效
WHERE phone = '13800001234'      ✅
```

### 3. LIKE 左模糊

```sql
WHERE name LIKE 'tom%'           ✅
WHERE name LIKE '%tom'           ❌
WHERE name LIKE '%tom%'          ❌(全文检索去 ES)
```

### 4. OR 没有给所有列建索引

```sql
WHERE name='tom' OR email='tom@a.com'    -- 只有 name 索引时,会全表扫
```

改用 `UNION ALL`,或两个列都建索引(MySQL 可走 index merge)。

### 5. NOT IN / != / NOT EXISTS

不一定走索引。能用 `=` 或 `IN` 表达就用它们。

### 6. 数据分布太均匀

`status` 只有 0/1 两种且各占 50%,优化器会选**全表扫**(走索引比扫表更慢)。

---

## 七、EXPLAIN 怎么看

```sql
EXPLAIN SELECT u.id, o.amount
FROM users u JOIN orders o ON o.user_id=u.id
WHERE u.status=1 AND o.created_at > '2024-01-01';
```

输出关键列:

| 列 | 含义 |
| --- | --- |
| `id` | 查询序号(JOIN/子查询时多行) |
| `select_type` | SIMPLE / SUBQUERY / DERIVED ... |
| `table` | 表名 |
| `type` | **访问类型**(下面详述) |
| `possible_keys` | 可能用到的索引 |
| `key` | 实际用到的索引 |
| `key_len` | 用到索引的字节数(联合索引能看到用了几列) |
| `rows` | 优化器估算扫描行数 |
| `filtered` | 过滤后剩余百分比 |
| `Extra` | 关键信息 |

### type 从好到坏

```
system > const > eq_ref > ref > range > index > ALL
```

- `const`:主键或唯一索引等值,**最快**
- `ref`:普通索引等值
- `range`:范围扫
- `index`:扫整个索引(没回表但全扫)
- `ALL`:**全表扫**,要警惕

### Extra 关键字

| 内容 | 含义 |
| --- | --- |
| `Using index` | **覆盖索引**(好) |
| `Using where` | 拿到行后再过滤 |
| `Using filesort` | **额外排序**(慢) |
| `Using temporary` | 用了临时表(慢,常见 GROUP BY 没索引时) |
| `Using index condition` | ICP 索引条件下推(好) |

> 经验:看到 `Using filesort` + `ALL` 同时出现,基本就是慢 SQL 重灾区。

---

## 八、慢查询定位

```sql
-- 开启
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 1;             -- 秒
SET GLOBAL slow_query_log_file = '/var/log/mysql/slow.log';

-- 看正在跑的 SQL
SHOW PROCESSLIST;
SELECT * FROM performance_schema.events_statements_current\G

-- 工具
mysqldumpslow -s t /var/log/mysql/slow.log | head    -- 按耗时排序
pt-query-digest /var/log/mysql/slow.log              -- Percona 工具,更强
```

---

## 九、典型优化 case

### case 1:翻页慢

```sql
SELECT * FROM orders ORDER BY id DESC LIMIT 100000, 20;     -- 慢
```

改写:

```sql
-- 方案 1:游标
SELECT * FROM orders WHERE id < ? ORDER BY id DESC LIMIT 20;

-- 方案 2:延迟关联
SELECT o.* FROM orders o
JOIN (
  SELECT id FROM orders ORDER BY id DESC LIMIT 100000, 20
) t ON o.id = t.id;
-- 子查询走索引扫描,只扫 ID,外层只回表 20 次
```

### case 2:`COUNT(*)` 大表慢

```sql
SELECT COUNT(*) FROM logs;           -- 千万行,几秒
```

InnoDB 没有像 MyISAM 那样的精确计数缓存。优化:

- 维护一张 `stats` 计数表,业务写入时同步加减
- 大致估算:`SHOW TABLE STATUS LIKE 'logs'\G` 看 Rows 字段

### case 3:状态字段索引选择性差

```sql
-- status 只有 0/1,不要单独建索引
ALTER TABLE orders ADD INDEX idx_status_user (status, user_id);    -- 联合索引可救
```

### case 4:范围查询字段顺序

```sql
-- ❌ 索引 (created_at, status)
WHERE created_at > ? AND status = 1
-- 走 created_at 范围,但 status 部分用不上

-- ✅ 索引 (status, created_at)
-- status 等值 → created_at 范围,完美
```

> **范围列后面的列在索引里失效**,所以"等值列在前、范围列在后"。

---

## 十、索引设计原则

1. **WHERE / ORDER BY / GROUP BY** 涉及的列优先考虑
2. 选择性高的列在前(distinct 值多)
3. **避免冗余**:有 `(a, b)` 就不需要 `(a)`
4. **InnoDB 主键最好是单调递增**(随机 UUID 会让 B+ 树频繁分裂)
5. **不要在低基数字段上单独建索引**(如 status)
6. 大字段(TEXT)别建普通索引,要建用 **前缀索引** `INDEX (col(20))`
7. 表上索引数量 ≤ 5,业务必须通过加索引解决问题前先看是否能改 SQL

---

## 十一、给新手的建议

1. **每个新写的 SQL 跑一次 EXPLAIN**,养成肌肉记忆
2. **写完接口随手看慢查询日志**,有就立刻处理,别留到生产
3. **不要乱加索引**:加索引前先想"它会被哪些查询用到"
4. **大表加索引、改表结构上线前**,用 `pt-online-schema-change` 或 `gh-ost`
5. **理解了 B+ 树和最左前缀,80% 的 SQL 优化你都能自己搞定**
