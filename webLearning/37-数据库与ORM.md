# 数据库与 ORM:PostgreSQL + Prisma / Drizzle

数据库是后端最重要的依赖。**你的数据库选错 / 用错,服务再优雅也救不回来**。

这一篇按以下顺序讲:

```
1. 关系型 vs 非关系型 — 选哪个
2. Postgres 为什么是默认选择
3. SQL 基础回顾(全栈最低限度)
4. ORM 选型:Prisma vs Drizzle
5. 数据建模 / 索引 / 性能
6. 迁移 / 生产部署
```

---

## 一、数据库分类

```
关系型(SQL)
├── PostgreSQL    ← 现代默认
├── MySQL         ← 老牌
├── SQLite        ← 嵌入式 / 边缘
└── MS SQL Server ← 企业

文档型(NoSQL)
├── MongoDB       ← 最有名
└── Firestore     ← Firebase

KV / 缓存
├── Redis         ← 缓存 / 队列
├── Memcached
└── DynamoDB      ← AWS

时序
├── InfluxDB
└── TimescaleDB(Postgres 扩展)

向量
├── Pinecone / Qdrant / pgvector(Postgres 扩展)

图
├── Neo4j

搜索
├── Elasticsearch / OpenSearch / Meilisearch / Typesense
```

**90% 的 Web 应用第一选择**:**PostgreSQL**。

---

## 二、为什么 Postgres 而不是 MySQL

```
特性                | Postgres | MySQL
JSON 字段           | ✅ 强   | ⚠️ 一般
全文搜索            | ✅ 内置 | ⚠️ 较弱
数组 / 复杂类型     | ✅       | ❌
窗口函数 / CTE       | ✅       | ⚠️ 8+
事务 DDL           | ✅       | ❌
MVCC               | 优秀    | 一般
扩展生态(向量等)   | ✅ 极强 | ⚠️
社区 / 文档         | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐
```

**Postgres 是"什么都能做"的数据库**:
- 当 KV(JSONB)
- 当全文搜索(tsvector)
- 当向量库(pgvector)
- 当时序库(TimescaleDB)
- 当队列(`SELECT FOR UPDATE SKIP LOCKED`)

**一个数据库覆盖 80% 场景**,这是 2025 行业共识。

MySQL 仍然适合:简单 CRUD、和老系统对接、用了 PlanetScale 这种 MySQL 服务。

---

## 三、SQL 基础回顾

### 1. 表 / 行 / 列

```sql
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  age         INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO users (email, name) VALUES ('a@b.com', 'Alice');

SELECT * FROM users WHERE age > 18;

UPDATE users SET name = 'Bob' WHERE id = '...';

DELETE FROM users WHERE id = '...';
```

### 2. 关系(JOIN)

```sql
CREATE TABLE posts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  content     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 查 Alice 的所有 post
SELECT p.*
FROM posts p
JOIN users u ON p.user_id = u.id
WHERE u.email = 'a@b.com';
```

JOIN 类型:

```
INNER JOIN  : 两边都有的行
LEFT JOIN   : 左边全要,右边没有就 NULL
RIGHT JOIN  : 右边全要
FULL JOIN   : 两边都要

最常用 INNER 和 LEFT。
```

### 3. 聚合 / 分组

```sql
SELECT user_id, COUNT(*) as post_count
FROM posts
GROUP BY user_id
HAVING COUNT(*) > 5
ORDER BY post_count DESC;
```

```
COUNT, SUM, AVG, MIN, MAX
GROUP BY 后 SELECT 必须是 GROUP BY 字段或聚合函数
WHERE 在 GROUP BY 前过滤行,HAVING 在 GROUP BY 后过滤组
```

### 4. 索引

```sql
-- 单列
CREATE INDEX idx_users_email ON users (email);

-- 复合
CREATE INDEX idx_posts_user_created ON posts (user_id, created_at DESC);

-- 唯一
CREATE UNIQUE INDEX uniq_users_email ON users (email);

-- 部分索引(条件索引)
CREATE INDEX idx_active_users ON users (id) WHERE deleted_at IS NULL;

-- JSON 字段索引
CREATE INDEX idx_meta ON posts USING GIN (metadata);
```

**没索引的查询 = 全表扫描 = 慢**。哪些列要建索引?

- 经常 WHERE 的字段
- JOIN 的外键
- ORDER BY 的字段
- UNIQUE 约束(自动建)

但**索引不是越多越好**:每个索引让写操作变慢,占空间。**只为常用查询建**。

### 5. 事务

```sql
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;
-- 出错就 ROLLBACK
```

ACID:
- **A**tomicity:全部成功或全部失败
- **C**onsistency:满足约束
- **I**solation:并发隔离
- **D**urability:落盘不丢

### 6. 隔离级别

```
READ UNCOMMITTED  : 脏读(几乎不用)
READ COMMITTED    : 默认,只读已提交。同一事务可能读到不同结果(不可重复读)
REPEATABLE READ   : 同事务读一致,但可能"幻读"
SERIALIZABLE      : 完全串行(最严格,性能差)
```

Postgres 默认 **READ COMMITTED**。需要更严的转账等业务用 SERIALIZABLE 或加显式锁。

---

## 四、ORM:不写 SQL 的方式

### 为什么用 ORM

```ts
// 原生 SQL
const users = await pool.query(
  'SELECT u.*, p.title FROM users u JOIN posts p ON p.user_id = u.id WHERE u.email = $1',
  ['a@b.com']
);
// users.rows[0].title

// ORM
const users = await db.user.findMany({
  where: { email: 'a@b.com' },
  include: { posts: true },
});
// users[0].posts[0].title  ← 类型完整
```

**ORM 的核心价值:类型安全 + 防 SQL 注入 + 自动生成查询**。

但代价:
- 学一套 DSL
- 复杂查询难写,有时反而要回 raw SQL
- 性能可能不如手写 SQL

**现代选择**:
- **Prisma**(2018,最流行)
- **Drizzle**(2023,新锐)
- **Kysely**(轻量 query builder)
- **TypeORM**(老,装饰器风格,NestJS 主推)

---

## 五、Prisma:最流行的 ORM

### 1. 安装 + 初始化

```bash
pnpm add prisma -D
pnpm add @prisma/client
pnpm prisma init
```

```env
# .env
DATABASE_URL="postgresql://user:pass@localhost:5432/mydb"
```

### 2. Schema(声明式建模)

```prisma
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id        String   @id @default(uuid())
  email     String   @unique
  name      String
  posts     Post[]
  createdAt DateTime @default(now())
}

model Post {
  id        String   @id @default(uuid())
  title     String
  content   String?
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())

  @@index([userId, createdAt])
}
```

### 3. 迁移

```bash
pnpm prisma migrate dev --name init       # 开发期
# 自动:生成 SQL 文件 + 应用 + 重新生成 client

pnpm prisma migrate deploy                # 生产
```

### 4. 用客户端

```ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// 创建
const user = await prisma.user.create({
  data: { email: 'a@b.com', name: 'Alice' }
});

// 查
const users = await prisma.user.findMany({
  where: { name: { startsWith: 'A' } },
  include: { posts: true },
  orderBy: { createdAt: 'desc' },
  take: 10,
});

// 更新
await prisma.user.update({
  where: { id: '...' },
  data: { name: 'Bob' }
});

// 删除
await prisma.user.delete({ where: { id: '...' } });

// 嵌套创建
await prisma.user.create({
  data: {
    email: 'a@b.com',
    name: 'Alice',
    posts: { create: [{ title: 'Hello' }] }
  }
});

// 事务
await prisma.$transaction([
  prisma.account.update({ where: { id: 1 }, data: { balance: { decrement: 100 } } }),
  prisma.account.update({ where: { id: 2 }, data: { balance: { increment: 100 } } }),
]);
```

类型完全推导,编辑器自动补全。**Prisma 最大的卖点就是 DX**。

### 5. Prisma 的争议

- **运行时性能**:有 Rust 引擎,大查询不如手写 SQL
- **构建包体积**:有时跟不动 serverless / edge
- **Prisma 5 改了引擎,边缘部署改善了很多**
- **复杂 SQL 难写**:用 `$queryRaw` 写原生

```ts
const result = await prisma.$queryRaw<User[]>`
  SELECT * FROM users WHERE email = ${email}
`;
```

---

## 六、Drizzle:新一代 SQL-like ORM

### 哲学

```
Prisma  : "我帮你抽象,SQL 你别写"
Drizzle : "我让你写得像 SQL,但完全类型安全"
```

### 1. 安装

```bash
pnpm add drizzle-orm postgres
pnpm add -D drizzle-kit
```

### 2. Schema

```ts
// db/schema.ts
import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const posts = pgTable('posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  content: text('content'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  userIdx: index('user_created_idx').on(t.userId, t.createdAt),
}));

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  user: one(users, { fields: [posts.userId], references: [users.id] }),
}));
```

### 3. 用客户端

```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, desc, and } from 'drizzle-orm';
import * as schema from './schema';

const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client, { schema });

// 查
const usersList = await db
  .select()
  .from(schema.users)
  .where(eq(schema.users.email, 'a@b.com'));

// JOIN
const result = await db
  .select({ user: schema.users, post: schema.posts })
  .from(schema.users)
  .leftJoin(schema.posts, eq(schema.users.id, schema.posts.userId))
  .where(eq(schema.users.id, '...'));

// 关系查询(类似 Prisma)
const userWithPosts = await db.query.users.findFirst({
  where: eq(schema.users.email, 'a@b.com'),
  with: { posts: true },
});

// 插入
await db.insert(schema.users).values({ email: 'a@b.com', name: 'Alice' });

// 更新
await db.update(schema.users)
  .set({ name: 'Bob' })
  .where(eq(schema.users.id, '...'));

// 事务
await db.transaction(async (tx) => {
  await tx.insert(...).values(...);
  await tx.update(...).set(...).where(...);
});
```

### 4. 迁移

```ts
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

```bash
pnpm drizzle-kit generate    # 生成 migration SQL
pnpm drizzle-kit migrate     # 应用 migration
pnpm drizzle-kit push        # 直接同步 schema(快速原型)
pnpm drizzle-kit studio      # GUI 看数据
```

### 5. Drizzle 优势

- **零运行时开销**:就是个 SQL 生成器,没有 Rust 引擎
- **边缘友好**:Cloudflare Workers / Vercel Edge 完美
- **写法接近 SQL**:学过 SQL 的零成本
- **包体积极小**

### 6. Drizzle 劣势

- **比 Prisma 啰嗦**:每个查询要手写 JOIN
- **生态没 Prisma 大**(但增长很快)
- **DX 略不如 Prisma**(没 Prisma 的智能补全惊艳)

---

## 七、Prisma vs Drizzle 选型

| 维度 | Prisma | Drizzle |
| --- | --- | --- |
| 上手 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 类型安全 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 性能(运行时) | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 包体积 | 大 | 小 |
| Edge 兼容 | ⭐⭐⭐(5 改善了) | ⭐⭐⭐⭐⭐ |
| 复杂查询 | 不擅长 | 擅长 |
| 迁移工具 | 强 | 较强 |
| 生态 | 极大 | 增长中 |

**新项目 2025 选型**:

- **Edge / Serverless / Cloudflare**:**Drizzle**(必选)
- **Node.js 服务器 + 简单 CRUD**:**Prisma**(DX 最好)
- **Node.js 服务器 + 复杂查询多**:**Drizzle**
- **学过 SQL,想保持 SQL 思维**:**Drizzle**
- **没学过 SQL,只想 ORM 抽象**:**Prisma**

**我的偏好**:Drizzle(性能 + 接近 SQL + 边缘友好)。

---

## 八、数据建模 12 条原则

### 1. 主键用 UUID 或 ULID,不用自增 ID

```sql
-- ❌ 自增暴露顺序,危险
id SERIAL PRIMARY KEY

-- ✅ UUID
id UUID DEFAULT gen_random_uuid()
```

UUID 长(36 字符),用 `ULID`(时间排序的 UUID)对索引更友好。

### 2. 时间字段用 `TIMESTAMPTZ`,不用 `TIMESTAMP`

```sql
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

带时区的版本,**永远存 UTC**。

### 3. 软删除还是硬删除

```sql
-- 软删除
deleted_at TIMESTAMPTZ
WHERE deleted_at IS NULL    -- 查询时过滤

-- 硬删除
DELETE FROM ...
```

软删除好处:能恢复、审计。坏处:每个查询要带 `WHERE deleted_at IS NULL`。**有合规要求才用软删**。

### 4. 多对多用关联表

```sql
CREATE TABLE post_tags (
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  tag_id  UUID REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);
```

不要用 JSON 数组,失去关系完整性。

### 5. 用枚举要慎重

```sql
-- ✅ 文本 + check
status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived'))

-- ❌ Postgres ENUM(改起来很麻烦)
CREATE TYPE post_status AS ENUM ('draft', 'published');
```

文本 + check 改值简单,enum 改值要重建类型。

### 6. JSONB 用于非结构化数据

```sql
metadata JSONB
-- 查询
WHERE metadata->>'browser' = 'chrome'
WHERE metadata @> '{"verified": true}'
```

但**别滥用**:核心字段开列。JSONB 适合"用户自定义字段"、"日志附加信息"。

### 7. 给关键字段加约束

```sql
email TEXT NOT NULL CHECK (email LIKE '%@%')
age   INTEGER CHECK (age >= 0 AND age < 150)
```

数据库层面拦,程序 bug 也守得住。

### 8. NULL 是不是 0

NULL 表示"没有值",和 0 / 空字符串不一样。WHERE 比较时:

```sql
WHERE x = NULL       -- ❌ 永远 false
WHERE x IS NULL       -- ✅
```

### 9. 大表分页用 cursor

见上一篇 36 第六节。

### 10. 大字段单独表

```sql
-- 大文本 / Blob 单独存
CREATE TABLE post_contents (
  post_id UUID PRIMARY KEY REFERENCES posts(id),
  content TEXT
);
```

主表只存元信息,详情按需 JOIN。**列表查询飞快**。

### 11. 索引的成本

每个索引让 INSERT/UPDATE 慢一点。**只索引常查的字段**,跑 `EXPLAIN` 验证。

### 12. 不要存计算结果除非必要

```
❌ 每次更新都要算 total
total NUMERIC

✅ 用 view 或动态算
SELECT SUM(price) FROM order_items WHERE order_id = $1
```

但**性能要求高的统计字段可以冗余**(Twitter 的关注数就是冗余的),用触发器或事务保证一致。

---

## 九、性能调优

### 1. EXPLAIN 看执行计划

```sql
EXPLAIN ANALYZE
SELECT * FROM posts WHERE user_id = '...' ORDER BY created_at DESC LIMIT 10;
```

看是不是用了索引(`Index Scan` vs `Seq Scan`)。`Seq Scan` + 大表 = 慢。

### 2. 慢查询日志

`postgresql.conf`:

```
log_min_duration_statement = 1000   # 1 秒以上记日志
```

或用 `pg_stat_statements` 扩展看最慢的 N 条。

### 3. N+1 查询

```ts
// ❌ N+1
const posts = await db.post.findMany();
for (const p of posts) {
  const user = await db.user.findUnique({ where: { id: p.userId } });   // 每条一次查询!
}

// ✅ 一次 JOIN
const posts = await db.post.findMany({ include: { user: true } });
```

ORM 的 `include` / `with` 内部会用 IN / JOIN,**永远比循环查快几十倍**。

### 4. 批量插入

```ts
// ❌ 一条一条
for (const item of items) {
  await db.item.create({ data: item });
}

// ✅ 批量
await db.item.createMany({ data: items });
```

### 5. 连接池

```ts
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,                    // 最多 20 个连接
  idleTimeoutMillis: 30000,
});
```

**Postgres 单实例最多几百连接**。Serverless 环境每个 lambda 都开连接就爆了,用:

- **Postgres 内置连接池**(PgBouncer)
- **Prisma Accelerate** / **Neon serverless driver**
- **Cloudflare Hyperdrive**

### 6. 读写分离 / 复制

```
Primary(写)
  ↓ 复制
Replica 1, Replica 2(读)
```

读写分离让读流量水平扩展。但**读到的数据有几毫秒延迟**(eventually consistent)。

---

## 十、迁移(Migration)的最佳实践

### 1. 永远向前兼容

部署时新代码和老代码同时存在。迁移要保证两个都能跑:

```
要加新列?
  ✅ 先加列(允许 NULL)→ 部署新代码用新列 → 再加 NOT NULL 约束
  ❌ 加 NOT NULL 列 + 改代码 一起部署 → 老代码插不进数据
```

### 2. 大表加索引用 CONCURRENTLY

```sql
-- ❌ 锁表,业务卡死
CREATE INDEX idx_xxx ON big_table (col);

-- ✅ 不锁表
CREATE INDEX CONCURRENTLY idx_xxx ON big_table (col);
```

### 3. 迁移脚本入版本控制

```
prisma/migrations/
└── 20240101_init/
    └── migration.sql

drizzle/migrations/
└── 0001_init.sql
```

跟代码一起 review,跟代码一起部署。

### 4. 备份 / 回滚

每次部署前:
- 数据库自动备份(Postgres `pg_dump`)
- 大改前手动备份
- 测试环境先验证

---

## 十一、实战:常用 Postgres 扩展

```sql
-- UUID 生成
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 全文搜索(默认就有)
CREATE INDEX idx_posts_search ON posts USING GIN (to_tsvector('english', title || ' ' || content));

SELECT * FROM posts
WHERE to_tsvector('english', title || ' ' || content) @@ to_tsquery('english', 'react & hooks');

-- 向量搜索(2024 标配)
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE posts ADD COLUMN embedding vector(1536);
CREATE INDEX ON posts USING ivfflat (embedding vector_cosine_ops);

SELECT * FROM posts ORDER BY embedding <-> '[0.1, 0.2, ...]' LIMIT 10;

-- 行级安全
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_posts ON posts USING (user_id = current_setting('app.user_id')::uuid);
```

**Postgres + pgvector** 是 2024+ 做 RAG / 语义搜索的默认方案。

---

## 十二、托管服务

```
开发期:本地 Docker Postgres
生产:
  Neon            ← Serverless Postgres,边缘友好,免费起步
  Supabase        ← Postgres + Auth + Storage + Realtime,Firebase 替代
  Railway         ← 简单易用,适合小项目
  PlanetScale     ← MySQL,无需 schema 迁移(branch)
  Cloudflare D1   ← SQLite,边缘
  AWS RDS / Aurora ← 企业,贵但稳
```

**新项目首选**:**Supabase 或 Neon**。免费档够个人项目用,后端少操心。

---

## 十三、心智模型

```
2025 后端数据栈:

  PostgreSQL(主库)
       ↓
  ORM:Drizzle / Prisma
       ↓
  Hono / Express(API)
       ↓
  Redis(缓存 / 队列,可选)

数据建模三原则:
  - 正常化(避免冗余)优先,性能敏感处反规范化
  - 主键 UUID,时间用 TIMESTAMPTZ,时区永远 UTC
  - 关系用外键,不用 JSON 数组替代

性能三原则:
  - 看 EXPLAIN 找 Seq Scan
  - 解决 N+1(用 include / JOIN)
  - 大表分页用 cursor

迁移三原则:
  - 向前兼容(新老代码同时跑得通)
  - 大表用 CONCURRENTLY
  - 一切可回滚 / 备份
```

---

## 十四、参考速查

```bash
# Prisma
pnpm prisma init
pnpm prisma migrate dev --name xxx
pnpm prisma studio          # GUI

# Drizzle
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
pnpm drizzle-kit studio

# Postgres CLI
psql $DATABASE_URL
\dt                # 列表
\d users           # 表结构
\di                # 索引
EXPLAIN ANALYZE ...

# 备份
pg_dump $DB > backup.sql
psql $DB < backup.sql
```

下一篇 38 讲部署:Docker、GitHub Actions、Vercel/Cloudflare。
