# PostgreSQL 基础

PostgreSQL(简称 PG / Postgres)是另一棵后端世界的"大树",和 MySQL 并列。它的标签是 **"功能最完整的开源关系数据库"**——类型系统强、SQL 标准支持好、扩展生态(PostGIS、TimescaleDB、pgvector)极其丰富。

---

## 一、什么时候选 PostgreSQL

| 选 PG | 选 MySQL |
| --- | --- |
| 类型多、约束严、有复杂查询(CTE、窗口、JSONB) | 业务简单 CRUD,运维生态主导(国内云厂商 / DBA 团队) |
| 全文检索、地理空间(PostGIS) | 互联网"高并发简单写"场景 |
| 数据分析(物化视图、并行查询) | 极致单机写入吞吐 |
| 一切围绕"严谨" | 一切围绕"简单且够用" |
| 跨境 / 海外项目(欧美社区主流) | 国内招聘市场主流 |

经验:**做 SaaS / B 端 / 数据密集场景上 PG**,**做 C 端 / 国内运维生态吃透就 MySQL**。两者你都得会,但每次新项目按业务挑。

---

## 二、用 Docker 启一套

```bash
docker run -d --name pg \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=demo \
  -e TZ=Asia/Shanghai \
  -p 5432:5432 \
  -v pg_data:/var/lib/postgresql/data \
  postgres:16

docker exec -it pg psql -U postgres -d demo
```

`psql` 速查:

```
\l               列出所有库
\c demo          切到 demo 库
\dt              列出表
\d users         看表结构(类似 DESC)
\df              列函数
\du              列用户/角色
\dn              列 schema
\q               退出
\timing on       显示耗时
\x               切换扩展显示(列太多时好看)
```

---

## 三、库 / Schema / 用户

PG 的层次比 MySQL 多一层 **Schema**(MySQL 里 database 和 schema 是一回事,PG 不是)。

```
集群(Cluster)
 └ 数据库(Database)             ← 跨库查询要 dblink/FDW
    └ Schema(默认 public)        ← 命名空间,可做多租户隔离
       └ 表 / 视图 / 函数
```

```sql
CREATE DATABASE demo;
\c demo
CREATE SCHEMA app;
CREATE TABLE app.users (id SERIAL PRIMARY KEY, name TEXT);
SET search_path = app, public;       -- 不带前缀也能找到
```

### 角色与权限

```sql
CREATE ROLE app LOGIN PASSWORD 'app';
GRANT CONNECT ON DATABASE demo TO app;
GRANT USAGE ON SCHEMA public TO app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app;     -- 之后新建的表也自动授权
```

---

## 四、字段类型

PG 类型比 MySQL 丰富得多,这是它的杀手锏之一。

### 常用

| 类型 | 说明 |
| --- | --- |
| `SERIAL / BIGSERIAL` | 自增 int / bigint(底层是 SEQUENCE) |
| `IDENTITY`(SQL 标准) | `GENERATED ALWAYS AS IDENTITY`,推荐 |
| `INT / BIGINT / NUMERIC(M,D)` | 数值 |
| `TEXT` | 字符串(没长度限制,推荐用 TEXT 而不是 VARCHAR) |
| `BOOLEAN` | true/false(MySQL 没这玩意,只能 TINYINT(1)) |
| `TIMESTAMPTZ` | 带时区的时间戳,**强烈推荐** |
| `DATE / TIME / INTERVAL` | 日期、时分秒、时间间隔 |
| `UUID` | 原生 UUID 类型 |
| `JSON / JSONB` | 文档型,**JSONB 是 PG 的王牌** |
| `ARRAY` | 数组,例 `INT[]`、`TEXT[]` |
| `ENUM` | 枚举(`CREATE TYPE status AS ENUM (...)`) |
| `INET / CIDR / MACADDR` | 网络地址类型 |
| `GEOMETRY`(PostGIS 扩展) | 地理空间 |

### 例

```sql
CREATE TABLE users (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username    TEXT NOT NULL UNIQUE,
  email       TEXT NOT NULL UNIQUE,
  status      SMALLINT NOT NULL DEFAULT 1,
  tags        TEXT[] DEFAULT '{}',
  meta        JSONB  DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON users USING gin (tags);     -- 数组的 GIN 索引,支持 @> 查询
CREATE INDEX ON users USING gin (meta);     -- JSONB GIN
```

---

## 五、CRUD 与 RETURNING

PG 的 `RETURNING` 是 MySQL 没有的好东西:**写完直接返回受影响的行**。

```sql
INSERT INTO users(username, email) VALUES ('tom', 't@a.com')
RETURNING id, created_at;

UPDATE users SET status=0 WHERE id=1
RETURNING *;

DELETE FROM users WHERE id=1
RETURNING *;
```

UPSERT(`INSERT ... ON CONFLICT`):

```sql
INSERT INTO users(username, email) VALUES ('tom', 't@a.com')
ON CONFLICT (email) DO UPDATE
SET username = EXCLUDED.username
RETURNING id;
```

---

## 六、事务与隔离

```sql
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id=1;
UPDATE accounts SET balance = balance + 100 WHERE id=2;
COMMIT;        -- 或 ROLLBACK
```

| 隔离级别 | PG 默认 |
| --- | --- |
| READ COMMITTED | ✅ |
| REPEATABLE READ | 真正的可串行化语义,无幻读 |
| SERIALIZABLE | SSI 串行化,失败抛异常,业务重试 |

> PG 的 RR 比 MySQL 严格——遇到不可序列化场景会抛 `serialization_failure`,而不是悄悄给一个错误结果。

---

## 七、索引

PG 索引种类比 MySQL 多得多:

| 类型 | 用途 |
| --- | --- |
| **B-tree**(默认) | 范围、等值,绝大多数场景 |
| **Hash** | 仅等值查询(8 之前不写 WAL,谨用) |
| **GIN** | 倒排,适合数组、JSONB、全文检索 |
| **GiST** | 通用搜索树(地理、范围) |
| **SP-GiST / BRIN** | 特殊场景(空间分区、超大顺序表) |

```sql
CREATE INDEX idx_users_status ON users (status);

-- 部分索引:只索引活跃用户,体积小、查询快
CREATE INDEX idx_users_active ON users (created_at) WHERE status=1;

-- 表达式索引
CREATE INDEX idx_users_lower_email ON users (LOWER(email));

-- 唯一索引
CREATE UNIQUE INDEX uk_users_email ON users (email);
```

---

## 八、视图与物化视图

```sql
-- 普通视图:每次查询都重新执行底层 SQL
CREATE VIEW v_active_users AS
SELECT id, username FROM users WHERE status=1;

-- 物化视图:把结果存起来,适合慢查询/报表
CREATE MATERIALIZED VIEW mv_user_orders AS
SELECT u.id, u.username, COUNT(o.id) AS cnt, SUM(o.amount) AS total
FROM users u LEFT JOIN orders o ON o.user_id=u.id
GROUP BY u.id;

REFRESH MATERIALIZED VIEW CONCURRENTLY mv_user_orders;     -- 刷新
```

> MySQL 没有物化视图,需要用"汇总表 + 定时任务"模拟。

---

## 九、与 MySQL 的高频差异速查

| 项 | MySQL | PostgreSQL |
| --- | --- | --- |
| 默认隔离级别 | REPEATABLE READ | READ COMMITTED |
| 字符串大小写 | 默认不区分 | **默认区分** |
| 自增 | AUTO_INCREMENT | SEQUENCE / IDENTITY |
| 反引号 | `` `col` `` | 双引号 `"col"` |
| 字符串拼接 | `CONCAT(a, b)` | `a \|\| b` |
| LIMIT | `LIMIT 20 OFFSET 100` | 同(也支持 `FETCH FIRST n ROWS ONLY`) |
| GROUP BY | 宽松(可选 SELECT 字段不在 GROUP BY) | **严格**,SELECT 字段必须聚合或在 GROUP BY |
| 大小写 | 表名默认不敏感 | **标识符默认转小写**,加双引号才保留大小写 |
| 布尔类型 | 没有,用 TINYINT | 原生 BOOLEAN |
| 数组 / JSONB | 弱 | **原生且强大** |
| 全文检索 | 一般 | tsvector + GIN,生产可用 |
| 复制 | binlog,逻辑/物理 | WAL + 逻辑复制(发布订阅) |
| 客户端 | mysql / Workbench | psql / pgAdmin / DataGrip / TablePlus |

⚠️ **大小写陷阱**:

```sql
CREATE TABLE Users (...);             -- 实际名是 users
SELECT * FROM "Users";                -- 报错(不存在)
SELECT * FROM users;                  -- 正确
```

---

## 十、连接 PostgreSQL

### Spring Boot

```yaml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/demo
    username: postgres
    password: postgres
    driver-class-name: org.postgresql.Driver
  jpa:
    properties:
      hibernate.dialect: org.hibernate.dialect.PostgreSQLDialect
```

### Bun + Elysia + Drizzle

```ts
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

const client = postgres(Bun.env.DATABASE_URL!)
const db = drizzle(client)
```

---

## 十一、备份与恢复

```bash
# 逻辑备份
pg_dump -U postgres -F c -d demo > demo.dump

# 恢复
pg_restore -U postgres -d demo demo.dump

# 流式物理备份(常用于主从)
pg_basebackup -D /backup -F tar -P -X stream
```

---

## 十二、给新手的建议

1. **新项目优先 PG**——你以后会感谢自己有 JSONB 和窗口函数
2. **时间字段一律 `TIMESTAMPTZ`**,不要 `TIMESTAMP`(无时区)
3. **不要用 VARCHAR(N) 限制长度**,直接用 `TEXT`(PG 没有性能差异),业务校验在应用层
4. **大小写敏感、`'`/`"` 区别 是 PG 入门最大坑**
5. **掌握 psql 命令(\d / \dt / \timing)**,一辈子都用得上
