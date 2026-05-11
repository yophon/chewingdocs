# Spark 调优:分区、倾斜、广播、持久化、序列化

写 Spark 容易,**调 Spark 难**:同一个 join 你写得没问题,数据小时 30 秒跑完,数据大了跑 6 小时还在 Stage 1。**90% 的 Spark 调优问题集中在三件事:Shuffle 太多、数据倾斜、内存配置错**。这一篇把这三件加上「广播、持久化、序列化、UDF 陷阱」拉成一份**可操作的调优手册**——遇到慢任务先排查这几个方向,90% 的问题不需要看源码。

> 一句话先记住:**调 Spark 的核心是「减少 Shuffle + 控制分区 + 处理倾斜」**。所有其他细节(广播、cache、序列化、内存)都在为这三件服务。**先看 Spark UI 找慢 Stage、再看是否倾斜、再看 Shuffle 量**——80% 的问题在这三步内能定位。

---

## 一、分区:Task 数的总开关

### 1.1 分区数从哪来

```
读 Parquet:    1 个分区 ≈ 1 个 Parquet 文件(或 1 个 Block,大文件会切)
               大概率受 spark.sql.files.maxPartitionBytes (默认 128MB) 控
               
Shuffle 后:   spark.sql.shuffle.partitions (默认 200)

repartition(N): 手动 Shuffle 到 N 个分区
coalesce(N):    合并到 N 个分区(尽量不 Shuffle,只在父分区 > 子分区时不 Shuffle)
```

### 1.2 分区数的工程经验

```
任务            分区数        理由
─────────       ────────     ────────
读 1TB 数据     5000-10000   每个 Task 处理 100-200MB
读 100GB        500-1000     同
小数据(< 1GB)  10-50        过多反而调度开销大
Shuffle 后默认  200          很多公司在 SparkSession 配为 1000-2000

每个 Task 处理量 100-500MB 是甜点
< 50MB:        Task 太小,启动成本占比高
> 1GB:        Task 太大,容易倾斜 / OOM
```

### 1.3 怎么调

```python
# 全局
spark.conf.set("spark.sql.shuffle.partitions", "1000")
spark.conf.set("spark.default.parallelism", "1000")  # 给 RDD 用

# 单 query
df.repartition(2000, "user_id")    # 按 user_id 分,均匀打散
df.repartitionByRange(2000, "ts")  # 按区间分,适合后续 orderBy

# 写入前合并
df.coalesce(50).write.parquet("...")
```

### 1.4 AQE 自动合并(15 篇)

```python
spark.conf.set("spark.sql.adaptive.enabled", "true")
spark.conf.set("spark.sql.adaptive.coalescePartitions.enabled", "true")
# 跑完 Shuffle 后,看到 200 分区里大部分很小 → 合并成 50
```

---

## 二、倾斜:Spark 最头痛的问题

### 2.1 倾斜是什么

```
GroupBy / Join 时,某个 key 占了 90% 数据:

正常 Task 时间分布:
  Task 0:  30 秒
  Task 1:  35 秒
  Task 2:  28 秒
  ...
  Task 199: 32 秒
  
倾斜 Task 时间分布:
  Task 0:  30 秒
  Task 1:  35 秒
  Task 2:  28 秒
  ...
  Task 187: 30 分钟   ← 大 key 全分到这里
  Task 188: 35 分钟   ← 同
  Task 199: 32 秒
```

**整个 Stage 的总时间 = 最慢的 Task 的时间**——其他 Task 都跑完了等这两个,整体延迟拖几十倍。

### 2.2 怎么发现

```
Spark UI → Stage → Tasks → 看 Duration 分布
                            ↓
              Min / 25% / Median / 75% / Max / Mean
              ↓
          Max >> Median? → 倾斜
          
Spark UI → Stage → Summary Metrics → Skewed Tasks(3.0+ 直接标出来)
```

### 2.3 倾斜的根因

```
1. 业务数据分布不均(自然倾斜)
   用户 ID:大部分用户活跃度低,少数用户操作几万次
   订单类目:大部分类目几百单,top 类目几千万单
   
2. NULL / 空字符串聚集
   user_id = NULL 全分到同一 Task
   
3. Join 时一边有重复 key
   user_id=12345 在 orders 和 users 都各有 100 行 → 笛卡尔 1 万行
```

### 2.4 解法 1:加盐(Salting)

```python
# 原始(倾斜):
result = orders.groupBy("user_id").agg(F.sum("amount"))
# 大 key user_id=12345 把一个 Task 累死

# 加盐打散:
salted = orders.withColumn(
    "salt", F.expr("CAST(rand() * 10 AS INT)")  # 0-9 随机
)

# 第一步:按 (user_id, salt) 聚合,把大 key 分散到 10 个桶
partial = salted.groupBy("user_id", "salt").agg(F.sum("amount").alias("partial_sum"))

# 第二步:再按 user_id 二次聚合,合并 10 个桶
final = partial.groupBy("user_id").agg(F.sum("partial_sum").alias("total"))
```

### 2.5 解法 2:AQE Skew Join Handling(15 篇)

```python
spark.conf.set("spark.sql.adaptive.skewJoin.enabled", "true")
# Spark 3.0+ AQE 自动检测倾斜分区 split + 复制对面对应数据
# 适用场景:Shuffle Sort Merge Join 时倾斜
# 不需要改代码
```

### 2.6 解法 3:NULL / 默认值打散

```python
# user_id=NULL 全到一个 Task
# 改成:
df = df.withColumn(
    "user_id_key",
    F.when(F.col("user_id").isNull(),
           F.concat(F.lit("null_"), F.expr("CAST(rand() * 100 AS INT)")))
     .otherwise(F.col("user_id"))
)
df.groupBy("user_id_key")...
```

### 2.7 解法 4:广播一边

如果倾斜来自 Join 一边有大 key,把另一边广播:

```python
# orders 表 user_id 倾斜,但 users 表小
result = orders.join(F.broadcast(users), "user_id")
# 没有 Shuffle,直接每个 Executor 本地 lookup,倾斜消失
```

---

## 三、广播:消除 Shuffle 的利器

### 3.1 触发条件

```python
spark.conf.set("spark.sql.autoBroadcastJoinThreshold", "10485760")  # 默认 10MB
# 小表 < 10MB 时,Catalyst 自动选 BroadcastHashJoin

# 手动强制
result = big_df.join(F.broadcast(small_df), "key")
```

### 3.2 工作原理

```
1. Driver 把 small_df 拉回来
2. Driver 把 small_df 广播到所有 Executor(每个 Executor 一份内存副本)
3. big_df 在各 Executor 本地 join,无 Shuffle
```

### 3.3 边界

| 场景 | 是否适合广播 |
| --- | --- |
| 小表 < 10MB | ✓ 自动 |
| 小表 < 100MB | 可考虑手动 broadcast |
| 小表 < 1GB | 谨慎,看 Executor 内存 |
| > 1GB | ❌ Driver 拉回 OOM、广播带宽爆 |

```python
# 调阈值
spark.conf.set("spark.sql.autoBroadcastJoinThreshold", "104857600")  # 100MB
# 但 Driver 内存必须够,Executor 内存也要够装下广播副本
```

### 3.4 看是否广播

```python
df1.join(df2, "id").explain()
# 输出含 BroadcastHashJoin → 广播了
# 输出含 SortMergeJoin → 没广播
```

---

## 四、持久化:中间结果的内存换 CPU

### 4.1 什么时候 cache

```python
df = read_and_transform(...)
# 后续要用 3 次:
df.count()   # 触发 1 次完整计算
df.show()    # 触发 2 次(从头跑)
df.write()   # 触发 3 次(从头跑)

# Cache 后:
df.cache()
df.count()   # 第一次:完整计算 + 物化 cache
df.show()    # 命中 cache,快
df.write()   # 命中 cache,快
```

**规则**:**同一个 DataFrame 在后续被 Action 触发 ≥ 2 次,就值得 cache**。

### 4.2 StorageLevel

```python
from pyspark import StorageLevel

df.persist(StorageLevel.MEMORY_AND_DISK)  # 默认,内存装不下溢出磁盘
df.persist(StorageLevel.MEMORY_ONLY)      # 只内存,装不下扔(再用要重算)
df.persist(StorageLevel.DISK_ONLY)        # 只磁盘
df.persist(StorageLevel.MEMORY_AND_DISK_SER)  # 序列化压缩,省内存
```

**经验**:`MEMORY_AND_DISK`(默认)在 90% 场景够用。

### 4.3 释放 cache

```python
df.unpersist()   # 用完释放,否则占用 Executor 内存
```

不释放 → cache 累积 → 后续任务 OOM。**用完 unpersist 是纪律**。

### 4.4 checkpoint vs cache

```python
spark.sparkContext.setCheckpointDir("hdfs://.../checkpoint")

df.cache().count()   # 触发 cache 物化(可能仍在内存)
df.checkpoint()      # 物化到磁盘,且斩断 lineage
```

- **cache**:lineage 仍保留,失败可重算
- **checkpoint**:落 HDFS,lineage 截断,失败从 checkpoint 恢复

对**迭代算法**(几十轮)很重要,避免 DAG 越来越长导致重算成本爆炸。

### 4.5 cache 的常见错

```python
# ❌ 没起作用
result = df.filter(...).cache()
df.filter(...).count()  # 新的 DataFrame 对象,没命中 cache

# ✓ 对
result = df.filter(...).cache()
result.count()  # 第一次物化
result.show()   # 命中
```

---

## 五、序列化:Kryo vs Java

### 5.1 Java 默认序列化的问题

- 慢(反射 + class 名)
- 大(每对象带 class 信息)
- UDF / RDD 跨节点传输时差异巨大

### 5.2 切 Kryo

```python
spark.conf.set("spark.serializer", "org.apache.spark.serializer.KryoSerializer")
spark.conf.set("spark.kryo.registrationRequired", "true")

# Scala 注册类(Java 也行)
val conf = new SparkConf()
conf.registerKryoClasses(Array(classOf[MyClass], classOf[OtherClass]))
```

性能差异:**Kryo 通常快 2-10x,空间小 50%+**。

### 5.3 DataFrame 内部用什么

DataFrame 内部已经是 **Tungsten 二进制行格式**(UnsafeRow),不走 Java/Kryo 序列化。只在 UDF / RDD 转换时才用到——所以**纯 DataFrame 工作流改 Kryo 影响小,UDF / RDD 多的工作流改 Kryo 收益大**。

---

## 六、内存配置:Spark 最迷的部分

### 6.1 内存大致划分

```
Executor 内存(spark.executor.memory,如 16GB)
├─ Reserved Memory:300MB(固定)
├─ User Memory:占余下 40%(用户对象、UDF 中间状态)
└─ Unified Memory:占余下 60%
   ├─ Storage:cache、broadcast
   └─ Execution:Shuffle、join、sort
   (两者动态借用)
```

### 6.2 关键配置

```bash
--executor-memory 16g
--executor-cores 4
--num-executors 50

# spark.memory.fraction = 0.6 (Unified Memory 占比)
# spark.memory.storageFraction = 0.5 (Storage 在 Unified Memory 中占比)
```

### 6.3 内存出错的常见信号

```
Java heap space          OOM,加内存或减分区大小
GC overhead limit        GC 频繁,可能 cache 太多或 task 数据太大
Container killed by YARN exceeding memory limits   堆外溢出,加 overhead
```

```bash
--conf spark.executor.memoryOverhead=4g   # 堆外内存,Python UDF/Shuffle 用
```

### 6.4 cores 不是越多越好

```
2 cores  /executor   并发不够,启动开销分摊不出去
4-5 cores/executor   经验值最优(GC、HDFS / S3 IO 并发)
> 8 cores            HDFS client 锁竞争、GC 时间变长
```

---

## 七、UDF:Catalyst 黑盒,慎用

### 7.1 普通 Python UDF 的代价

```python
@udf("double")
def my_calc(amount, discount):
    return amount * (1 - discount) * 1.1

df.withColumn("final", my_calc("amount", "discount"))
```

发生了什么:
- 每行序列化 → Java 进程到 Python 进程
- Python 算
- 序列化回来
- 跨进程通信慢 + Catalyst 不能内联

性能:**比内置函数慢 5-10x**。

### 7.2 改用内置函数

```python
df.withColumn("final", F.col("amount") * (1 - F.col("discount")) * 1.1)
# 全部在 JVM 内向量化执行,Catalyst 可优化
```

### 7.3 Pandas UDF(Vectorized UDF,推荐)

```python
from pyspark.sql.functions import pandas_udf

@pandas_udf("double")
def my_calc(amount: pd.Series, discount: pd.Series) -> pd.Series:
    return amount * (1 - discount) * 1.1

df.withColumn("final", my_calc("amount", "discount"))
```

**Pandas UDF 用 Arrow 做批量交换**,一次几千行,**比普通 Python UDF 快 10-100x**。

### 7.4 SQL 表达式优先

```python
df.withColumn("final", F.expr("amount * (1 - discount) * 1.1"))
# 完全在 Catalyst / Tungsten 内,最快
```

---

## 八、小文件问题

### 8.1 哪里来

- 流写入或微批写入,每个 trigger 一批小文件
- 分区数多但每分区数据少
- Iceberg 表不 compact

### 8.2 小文件的代价

- 读时:1000 个 1MB 文件 vs 8 个 128MB 文件,后者快 5-10x
- 调度开销:每个文件 1 个 Task → 任务数爆炸
- Footer / 元数据开销占比高

### 8.3 解决

```python
# 写之前合并
df.coalesce(10).write.parquet("...")
df.repartition(50, "date").write.parquet("...")  # 按 date 分桶,避免跨分区小文件

# Iceberg
spark.sql("CALL system.rewrite_data_files('shop.orders', " +
          "map('target-file-size-bytes', '536870912'))")

# 配置 minPartitionSize(AQE)
spark.conf.set("spark.sql.adaptive.advisoryPartitionSizeInBytes", "128m")
```

---

## 九、Shuffle 调优

### 9.1 减少 Shuffle 量

```python
# 不必要的 sort / orderBy
df.orderBy("x").take(10)  # 全局 sort 全表
                          # 改:df.sortWithinPartitions("x").limit(10) + topN

# 避免 distinct 大数据
df.distinct()  # 全表 Shuffle
              # 如果只是去重 key,用 approx_count_distinct 或 dropDuplicates(subset)
```

### 9.2 Shuffle Spill 减少

```python
spark.conf.set("spark.sql.shuffle.partitions", "2000")  # 增大,每分区小
spark.conf.set("spark.shuffle.file.buffer", "1MB")      # 写 buffer
spark.conf.set("spark.reducer.maxSizeInFlight", "96MB") # 拉数据 buffer
```

### 9.3 Bucket(预 Shuffle)

```sql
-- 建表时分桶
CREATE TABLE orders USING iceberg
PARTITIONED BY (bucket(64, user_id), days(event_time))
AS SELECT * FROM source;

-- Join 时 Spark 知道两边都按 user_id bucket 64,自动跳过 Shuffle
SELECT * FROM orders o JOIN users u ON o.user_id = u.user_id;
```

不适合所有场景(数据分布不均时 bucket 反而倾斜),但**对高频 Join 的事实-维度对**很有用。

---

## 十、完整调优 Checklist

```
慢任务 → 看 Spark UI → 找慢 Stage
                       │
   ┌───────────────────┼────────────────────┐
   ▼                   ▼                    ▼
看分区数            看是否倾斜              看 Shuffle 量
                                                ↓
   太少加分区        Task 长尾                 调小表 Broadcast
   太多 coalesce     → 加盐 / AQE              改 Join 类型
                                                
看是否要 cache       看内存配置              看是否 UDF 慢
   重复 Action       OOM / GC                 改内置 / Pandas UDF
   → cache + unpersist 加内存 / 减分区
   
看小文件             看序列化
   compact / coalesce  改 Kryo
```

---

## 十一、看完这一篇,你应该能

- 看到慢任务第一反应是 Spark UI 找慢 Stage 看 Task 分布
- 解释倾斜的根因,会用加盐 / AQE / Broadcast 三种解法
- 知道 BroadcastHashJoin 触发条件,会手动 broadcast
- 用 cache / unpersist 不留坑(同对象、用完释放)
- 改 Kryo 序列化、调内存、避免 Python UDF
- 看出小文件 / Shuffle 量过大的问题,会写 compact / repartition / bucket

下一篇:**15 AQE 与现代 Spark** — AQE 是 Spark 3.0+ 的杀手锏,运行时自适应做了什么?Photon / Gluten / Comet 等向量化方向把 Spark 推到哪里?
