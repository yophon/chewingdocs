# MySQL 事务与锁

事务和锁是数据库**正确性 + 性能**的核心。这一章把 ACID、隔离级别、MVCC、行锁/间隙锁/死锁讲清楚——这是后端面试和生产排查最常考、最容易出事的地方。

---

## 一、事务的 ACID

| 字母 | 含义 | 谁保证 |
| --- | --- | --- |
| **A** Atomicity 原子性 | 要么全做,要么全不做 | undo log(回滚日志) |
| **C** Consistency 一致性 | 数据从一种合法状态到另一种合法状态 | A + I + D + 业务约束共同保证 |
| **I** Isolation 隔离性 | 并发事务互不干扰 | 锁 + MVCC |
| **D** Durability 持久性 | 提交后掉电也不丢 | redo log(重做日志) |

---

## 二、隔离级别

并发事务可能出现三种问题:

| 问题 | 现象 |
| --- | --- |
| 脏读 | 读到其他事务**未提交**的数据 |
| 不可重复读 | 同一事务两次读同一行结果不同(被别人改了) |
| 幻读 | 同一事务两次范围查询,结果集行数不同(被别人插入了) |

| 隔离级别 | 脏读 | 不可重复读 | 幻读 | MySQL 默认? |
| --- | --- | --- | --- | --- |
| READ UNCOMMITTED | 可能 | 可能 | 可能 | |
| READ COMMITTED | × | 可能 | 可能 | (Oracle / PG 默认) |
| **REPEATABLE READ** | × | × | **MySQL 通过 next-key lock 解决** | ✅ MySQL 默认 |
| SERIALIZABLE | × | × | × | 性能差,几乎不用 |

```sql
-- 看
SELECT @@transaction_isolation;

-- 临时设置(当前会话)
SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;
```

> 经验:**互联网公司很多用 RC**(READ COMMITTED),因为锁范围小、并发更高。RR 默认在 MySQL 是为了 statement-based 复制安全。

---

## 三、事务的使用

### 1. 显式事务

```sql
BEGIN;                          -- 或 START TRANSACTION
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;                         -- 或 ROLLBACK
```

### 2. 应用代码里(Spring Boot)

```java
@Transactional(rollbackFor = Exception.class)
public void transfer(long from, long to, BigDecimal amt) {
    accountDao.minus(from, amt);
    accountDao.plus(to, amt);
}
```

> 必看:**Spring 的事务基于 AOP**,同类方法自调用、private 方法、checked exception 默认不回滚——上一章详述过。

### 3. 保存点(SAVEPOINT)

```sql
BEGIN;
INSERT INTO orders VALUES (...);
SAVEPOINT sp1;
INSERT INTO order_items VALUES (...);   -- 失败
ROLLBACK TO sp1;                        -- 只回滚到 sp1,前面的 INSERT 还在
COMMIT;
```

---

## 四、MVCC(多版本并发控制)

InnoDB 通过 MVCC 实现 **"读不阻塞写、写不阻塞读"**:

- 每行隐含 `trx_id`(创建该版本的事务 ID)和 `roll_pointer`(指向旧版本的 undo log)
- 事务启动时拿一个 **read view**(快照)
- 普通 SELECT 是 **快照读**,根据 read view + trx_id 决定看哪个版本
- `SELECT ... FOR UPDATE / LOCK IN SHARE MODE` 是 **当前读**,加锁

```
RC:每个 SELECT 一个新快照     → 看到提交的最新数据
RR:事务开始时一个快照,贯穿到底 → 同一事务多次读结果一致
```

---

## 五、锁的分类

### 1. 全局锁 / 表锁 / 行锁

| 锁级别 | 例 |
| --- | --- |
| 全局锁 | `FLUSH TABLES WITH READ LOCK`(全库只读,备份用) |
| 表锁 | `LOCK TABLES users WRITE` / DDL |
| 行锁 | InnoDB 默认,通过索引加 |

### 2. 共享锁 vs 排他锁

| 锁 | 写法 | 互斥关系 |
| --- | --- | --- |
| S(共享 / 读) | `SELECT ... LOCK IN SHARE MODE` | 与 S 兼容,与 X 互斥 |
| X(排他 / 写) | `SELECT ... FOR UPDATE` / UPDATE / DELETE | 与所有锁互斥 |

### 3. 意向锁(IS / IX)

表级,用来"快速判断表上是否存在行锁",由引擎自动加,**业务无需关心**。

---

## 六、行锁的三种形态(RR 下)

InnoDB 在 **REPEATABLE READ** 下用三种锁防止幻读:

| 锁 | 范围 |
| --- | --- |
| Record Lock | 单行 |
| Gap Lock | 两行之间的"空隙",防止其他事务插入 |
| **Next-key Lock** | 行 + 前面的间隙(默认形态) |

例:`id` 索引上有 5, 10, 20, 30 四条记录,事务 A 执行:

```sql
SELECT * FROM t WHERE id BETWEEN 10 AND 20 FOR UPDATE;
```

锁定的范围:`(5, 10]`、`(10, 20]`、`(20, 30]`,这期间事务 B `INSERT id=15` 会阻塞。

> **行锁是加在索引上的!** 没用索引的更新会退化成 **表锁**(实际上是锁所有行)——这是非常重的坑。

```sql
-- ❌ name 没索引
UPDATE users SET status=0 WHERE name='tom';   -- 锁全表
```

---

## 七、死锁

两个事务相互等待对方持有的锁。

```
T1: UPDATE a SET ... WHERE id=1;        持 a:1
T2: UPDATE a SET ... WHERE id=2;        持 a:2
T1: UPDATE a SET ... WHERE id=2;        等 a:2  ← 等 T2
T2: UPDATE a SET ... WHERE id=1;        等 a:1  ← 等 T1
                                        💥 死锁
```

InnoDB 会**自动检测并回滚一方**,报 `Deadlock found when trying to get lock`。

```sql
SHOW ENGINE INNODB STATUS\G            -- 看最近一次死锁详情
```

**避免死锁**:

1. **按相同顺序访问资源**(如总是先小 id 后大 id)
2. **缩短事务**(事务越长越易死锁)
3. **批量操作时减少事务范围**
4. **必要的索引**(避免锁退化)
5. **对不可避免的死锁,业务层重试**

---

## 八、乐观锁 vs 悲观锁

### 1. 悲观锁

```sql
BEGIN;
SELECT balance FROM accounts WHERE id=1 FOR UPDATE;     -- 拿到 X 锁
UPDATE accounts SET balance = balance - 100 WHERE id=1;
COMMIT;
```

- 适合冲突频繁、必须等结果的场景
- 缺点:并发被锁卡住

### 2. 乐观锁(版本号)

```sql
SELECT id, version FROM accounts WHERE id=1;       -- version=5
UPDATE accounts SET balance=balance-100, version=version+1
WHERE id=1 AND version=5;                          -- 0 行,说明被并发改了,重试
```

- 适合冲突少、能容忍重试
- 优点:不阻塞别人

> 经验:**钱、库存这种"必须正确"的写**用悲观锁 + 短事务;**计数、状态、点赞**这种"宁可重试也不阻塞"的用乐观锁。

---

## 九、`FOR UPDATE` 的注意点

```sql
SELECT * FROM users WHERE name='tom' FOR UPDATE;
```

- name 没索引 → 锁全表(灾难)
- 必须在事务内 (`BEGIN ... COMMIT`)
- 锁范围由 RR/RC、索引情况、是否唯一决定,**复杂得超出直觉**——**生产前一定在测试库验证**

---

## 十、长事务的危害

长事务 = "活的"未提交事务,持有 undo log,导致:

1. **MVCC 链不断增长**,SELECT 慢
2. **回滚段膨胀**,空间紧张
3. **行锁长时间不放**,阻塞别人
4. **从库延迟**

```sql
SELECT * FROM information_schema.innodb_trx
WHERE TIMESTAMPDIFF(SECOND, trx_started, NOW()) > 60;     -- 找超过 60s 的事务
```

> 经验:**事务能短就短**——把 IO 调用、远程接口、文件操作挪出事务边界。

---

## 十一、`UPDATE` 的几个反直觉细节

```sql
-- 1. 自增列被 UPDATE 后回滚,自增值不会回收(留有空洞)
-- 2. 同一事务里 UPDATE 后 SELECT 看到的是新值(自己看到自己)
-- 3. UPDATE 没改变值时也会获取 X 锁,只是不写 redo
UPDATE users SET status=1 WHERE id=1 AND status=1;    -- 仍然加锁
```

---

## 十二、典型 case 速查

| 现象 | 原因 |
| --- | --- |
| `Lock wait timeout exceeded` | 锁等超时,看 `innodb_lock_waits` 找谁拿着锁 |
| `Deadlock found` | 死锁,改顺序 / 缩事务 / 重试 |
| 大批量 UPDATE 锁全表 | WHERE 列没索引 |
| 高并发下扣库存数据错乱 | 没用 `FOR UPDATE` 或乐观锁 |
| 主从复制延迟暴涨 | 大事务 / 大表 DDL / 长时间未 COMMIT |

---

## 十三、给新手的建议

1. **永远显式开事务**,知道哪里 `BEGIN`、哪里 `COMMIT`
2. **事务里别做远程调用**(HTTP / RPC / MQ)——网络抖一下事务就拖几秒
3. **WHERE 列必有索引,否则 UPDATE/DELETE 是表级锁**
4. **死锁不可怕,业务层加重试就行**(指数退避 + 上限)
5. **学会看 `SHOW ENGINE INNODB STATUS`**,这是事务/锁问题的"黑匣子"
