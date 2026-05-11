# MySQL 基础与 SQL

MySQL 是世界上使用最广泛的关系型数据库。对后端开发者来说,**SQL 写得好坏决定了系统性能上限**。这一章覆盖最实用的基础:**安装、字段类型、DDL、DML、SELECT 进阶、字符集**。

---

## 一、用 Docker 起一个 MySQL

```bash
docker run -d --name mysql \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=demo \
  -e TZ=Asia/Shanghai \
  -p 3306:3306 \
  -v mysql_data:/var/lib/mysql \
  mysql:8.4 \
  --character-set-server=utf8mb4 \
  --collation-server=utf8mb4_0900_ai_ci

docker exec -it mysql mysql -uroot -proot demo
```

> **8.0 之后默认字符集是 utf8mb4**(支持完整 Unicode + emoji),不要再用老的 `utf8`(其实是 utf8mb3,3 字节,不能存表情)。

---

## 二、字段类型

### 1. 数值

| 类型 | 字节 | 范围(有符号) | 用途 |
| --- | --- | --- | --- |
| TINYINT | 1 | -128 ~ 127 | 状态、布尔 |
| SMALLINT | 2 | ±3.2 万 | 类目枚举 |
| INT | 4 | ±21 亿 | 通用主键 |
| BIGINT | 8 | ±9e18 | 雪花 ID、订单号 |
| DECIMAL(M,D) | 变长 | 精确 | **金额** |
| FLOAT / DOUBLE | 4/8 | 不精确 | 科学计算,**别存钱** |

⚠️ **金额永远用 `DECIMAL`**,FLOAT/DOUBLE 会出现 `0.1 + 0.2 != 0.3` 的浮点误差。

### 2. 字符串

| 类型 | 上限 | 用途 |
| --- | --- | --- |
| CHAR(N) | N 个字符,定长 | 状态码、性别 |
| VARCHAR(N) | N 个字符,变长 | 名字、邮箱 |
| TEXT | 64KB | 文章 |
| MEDIUMTEXT | 16MB | 大段内容 |
| LONGTEXT | 4GB | 极少用,通常应该走对象存储 |
| BLOB / LONGBLOB | 二进制 | 不推荐存数据库,放 OSS/S3 |

### 3. 时间

| 类型 | 范围 | 推荐 |
| --- | --- | --- |
| DATE | YYYY-MM-DD | 生日 |
| TIME | HH:MM:SS | 时长 |
| DATETIME | 1000-01-01 ~ 9999-12-31 | **业务时间字段** |
| TIMESTAMP | 1970 ~ 2038 | 注意 2038 问题 |

> 经验法则:**默认用 DATETIME**,需要自动跟时区转就 TIMESTAMP,但要承担 2038 风险。

### 4. JSON

```sql
CREATE TABLE config (
  id INT PRIMARY KEY,
  payload JSON
);

INSERT INTO config VALUES (1, '{"theme":"dark","tags":["a","b"]}');
SELECT payload->'$.theme' FROM config;
SELECT payload->>'$.tags[0]' FROM config;
```

MySQL 8 的 JSON 比 PostgreSQL 的 JSONB 弱,索引能力有限,**复杂 JSON 查询场景建议用 PostgreSQL**。

---

## 三、建表(DDL)

```sql
CREATE TABLE users (
  id          BIGINT       NOT NULL AUTO_INCREMENT,
  username    VARCHAR(64)  NOT NULL,
  email       VARCHAR(128) NOT NULL,
  password    VARCHAR(255) NOT NULL,
  status      TINYINT      NOT NULL DEFAULT 1 COMMENT '1启用 0禁用',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_email (email),
  KEY idx_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

要点:

- **每张表必须有主键**(InnoDB 没主键会偷偷创隐藏主键)
- **主键尽量短、单调递增**(BIGINT AUTO_INCREMENT 或雪花 ID)
- **`created_at / updated_at` 几乎是必备**
- 字符集统一 `utf8mb4`,排序规则 8.0 默认 `utf8mb4_0900_ai_ci`(不区分大小写)

修改表:

```sql
ALTER TABLE users ADD COLUMN nickname VARCHAR(64) AFTER username;
ALTER TABLE users MODIFY COLUMN email VARCHAR(255) NOT NULL;
ALTER TABLE users DROP COLUMN nickname;
ALTER TABLE users ADD INDEX idx_status (status);
```

⚠️ 大表 ALTER 锁表风险高,生产用 `pt-online-schema-change` 或 `gh-ost` 在线变更。

---

## 四、CRUD(DML)

```sql
-- 插入
INSERT INTO users(username, email, password) VALUES ('tom', 'tom@a.com', 'xxx');

-- 批量插入
INSERT INTO users(username, email, password) VALUES
('a','a@a.com','x'),('b','b@a.com','x'),('c','c@a.com','x');

-- 唯一冲突时更新(UPSERT)
INSERT INTO users(username, email) VALUES ('tom', 'tom@a.com')
ON DUPLICATE KEY UPDATE username = VALUES(username);

-- 更新
UPDATE users SET status = 0 WHERE id = 1;

-- 删除
DELETE FROM users WHERE id = 1;

-- 查询
SELECT id, username FROM users WHERE status = 1 ORDER BY id DESC LIMIT 20 OFFSET 0;
```

⚠️ **UPDATE / DELETE 没 WHERE 是事故级操作**,有些团队会强制开启 `safe-updates`:

```sql
SET sql_safe_updates = 1;
```

---

## 五、JOIN

| 类型 | 含义 |
| --- | --- |
| INNER JOIN | 两边都有的行 |
| LEFT JOIN | 左表全部 + 右表匹配 |
| RIGHT JOIN | 右表全部 + 左表匹配(少用,等价于反向 LEFT) |
| CROSS JOIN | 笛卡尔积 |

```sql
SELECT u.id, u.username, o.id AS order_id, o.amount
FROM   users u
LEFT JOIN orders o ON o.user_id = u.id AND o.status = 'paid'
WHERE  u.status = 1
ORDER BY u.id;
```

> ⚠️ **关联条件放 ON 还是 WHERE**:LEFT JOIN 时,过滤右表的条件放 ON,放 WHERE 会把它退化成 INNER JOIN。

---

## 六、聚合 / 分组

```sql
SELECT user_id, COUNT(*) AS cnt, SUM(amount) AS total, MAX(created_at) AS latest
FROM   orders
WHERE  status = 'paid'
GROUP  BY user_id
HAVING total > 1000
ORDER  BY total DESC
LIMIT  20;
```

`HAVING` vs `WHERE`:

- WHERE 在分组前过滤行
- HAVING 在分组后过滤组

---

## 七、子查询、IN、EXISTS

```sql
-- 子查询
SELECT * FROM users
WHERE id IN (SELECT user_id FROM orders WHERE amount > 100);

-- EXISTS(通常更快)
SELECT * FROM users u
WHERE EXISTS (
  SELECT 1 FROM orders o WHERE o.user_id = u.id AND o.amount > 100
);
```

> 经验:**`IN (子查询)` 在大数据量时可能比 EXISTS 慢**,具体看 EXPLAIN。

---

## 八、CASE WHEN

```sql
SELECT
  id,
  CASE
    WHEN amount >= 1000 THEN 'big'
    WHEN amount >= 100  THEN 'mid'
    ELSE 'small'
  END AS tier
FROM orders;
```

行转列:

```sql
SELECT
  user_id,
  SUM(CASE WHEN status='paid'    THEN 1 ELSE 0 END) AS paid_cnt,
  SUM(CASE WHEN status='refunded' THEN 1 ELSE 0 END) AS refund_cnt
FROM orders
GROUP BY user_id;
```

---

## 九、窗口函数(MySQL 8+)

```sql
SELECT
  id, user_id, amount,
  ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY amount DESC) AS rn,
  SUM(amount)  OVER (PARTITION BY user_id) AS user_total,
  AVG(amount)  OVER (ORDER BY id ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) AS ma5
FROM orders;
```

常见窗口函数:

| 函数 | 用途 |
| --- | --- |
| ROW_NUMBER() | 序号 |
| RANK() / DENSE_RANK() | 排名(并列处理不同) |
| LAG() / LEAD() | 上一行/下一行的值 |
| SUM/AVG/MIN/MAX OVER | 累计 / 滑动窗口 |

> 窗口函数是 MySQL 8 最重要的能力之一,**复杂报表用它能省掉一半子查询**。

---

## 十、CTE(WITH)

```sql
WITH big_buyers AS (
  SELECT user_id, SUM(amount) AS total
  FROM orders
  WHERE status='paid'
  GROUP BY user_id
  HAVING total > 10000
)
SELECT u.id, u.username, b.total
FROM big_buyers b JOIN users u ON u.id = b.user_id;
```

CTE 让复杂查询读起来像"由小段组装",**比层层嵌套子查询好维护**。

---

## 十一、字符集与排序规则的坑

```sql
-- 看当前
SHOW VARIABLES LIKE 'character%';
SHOW VARIABLES LIKE 'collation%';
```

常见问题:

1. **乱码**:连接字符串没加 `useUnicode=true&characterEncoding=utf8mb4`
2. **emoji 存不进**:列还是 `utf8`(3 字节),改 `utf8mb4`
3. **JOIN 字符集不一致**:`utf8mb4_general_ci` 和 `utf8mb4_0900_ai_ci` 混用,索引失效
4. **大小写敏感**:`_ci` 不敏感(默认),`_bin` / `_cs` 敏感

---

## 十二、分页与计数

```sql
SELECT id, name FROM users ORDER BY id DESC LIMIT 20 OFFSET 1000;     -- 第 51 页
```

⚠️ 深分页 `OFFSET 1000000` 极慢:MySQL 要扫前 100 万条才丢掉。

**优化:游标分页**

```sql
-- 客户端记下上一页最后的 id = 12345,下一页查:
SELECT id, name FROM users WHERE id < 12345 ORDER BY id DESC LIMIT 20;
```

**总数**:

```sql
SELECT COUNT(*) FROM users WHERE status=1;     -- 大表慢,InnoDB 必须扫
```

大表近似计数可读 `INFORMATION_SCHEMA.TABLES.TABLE_ROWS`(估算值,InnoDB 不准但快)。

---

## 十三、SQL 风格规范

```sql
-- ✅ 好
SELECT u.id,
       u.username,
       u.email
FROM   users u
WHERE  u.status = 1
  AND  u.created_at > '2024-01-01'
ORDER  BY u.id DESC
LIMIT  20;

-- ❌ 差
select * from users where status=1 and created_at>'2024-01-01' limit 20;
```

- 关键字大写或全部小写,**统一**
- 不要 `SELECT *`(走不上覆盖索引、字段加减引发代码 BUG)
- 表别名简短,字段必带表别名(JOIN 多了易混)
- 复杂 SQL 加注释

---

## 十四、给新手的建议

1. **先用 EXPLAIN 看一眼 SQL 怎么跑**,而不是凭直觉写
2. **任何 UPDATE / DELETE 上线前先 SELECT 同样的 WHERE 跑一遍**确认行数
3. **金额用 DECIMAL,时间用 DATETIME,字符集用 utf8mb4**
4. **不要在数据库做业务逻辑(存储过程 / 触发器)**,扩展和迁移会很痛
5. **慢查询日志 100% 要开**:`long_query_time = 1`(秒)足够定位 90% 性能问题
