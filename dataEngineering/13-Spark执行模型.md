# Spark 执行模型:Job、Stage、Task、Shuffle、宽窄依赖

写 `df.groupBy("x").agg(sum("y")).write.parquet(...)` 这一行,Spark UI 里你会看到「**1 个 Job、2 个 Stage、200 个 Task、一次 Shuffle**」——这些词不是 Spark 自己造的迷雾,它们是 Spark 的核心调度单位。**懂这套模型 = 懂为什么 query 慢、为什么挂、为什么调优要看 Stage 时间分布**。这一篇拆 Spark 一次执行的全过程,把 Shuffle 这个性能杀手画到帧。

> 一句话先记住:**Action 触发 Job,Shuffle 切 Stage,分区数 = Task 数**。窄依赖在一个 Stage 内流水线执行,宽依赖必须 Shuffle 切 Stage。**Shuffle = 上游写本地盘 + 下游跨节点拉,网络 IO + 磁盘 IO 双重开销**——这是 Spark 调优最大的战场。

---

## 一、Action vs Transformation:为什么"Job"会等到最后才跑

### 1.1 懒执行(Lazy Evaluation)

```python
df = spark.read.parquet("s3://bucket/orders")       # 不触发
df2 = df.filter("status='paid'")                     # 不触发
df3 = df2.groupBy("user_id").agg(F.sum("amount"))    # 不触发
df3.show()                                           # 触发!
```

Spark 把 Transformation(map、filter、groupBy、join)只构建 DAG,**不计算**;只有 Action(show、collect、count、write、save)才触发 Job。

为什么这么设计:
- Catalyst 优化器在 Job 触发前能看到全图,做整体优化(列裁剪、谓词下推、Join 重排)
- 失败重启时,只需重跑必要部分
- 用户写法可读(链式调用),性能不打折

### 1.2 常见 Action

```python
df.show()               # 打印
df.count()              # 行数
df.collect()            # 全部拉回 Driver(危险!大数据 OOM)
df.first() / df.take(N) # 拉部分
df.write.format(...).save(...)   # 写
df.foreach(fn)           # 对每行执行
```

### 1.3 一次 Action = 一个 Job

```python
df3.show()             # Job 0
df3.count()            # Job 1(重新计算!Spark 不会自动 cache)
```

每次 Action 都从头跑(读 source、转换、聚合)——所以**复用中间结果要 cache / persist**(14 篇)。

---

## 二、窄依赖 vs 宽依赖:Stage 边界

### 2.1 必画图

```
窄依赖 (Narrow)                  宽依赖 (Wide / Shuffle)
─────────────────                ─────────────────────
父分区  子分区                   父分区   子分区
  □ ───→ □                        □ ─┬─→ □
  □ ───→ □                        □ ─┼─→ □
  □ ───→ □                        □ ─┴─→ □
  □ ───→ □                        
                                  父子分区 多对多
父子分区 一对一                   需要 Shuffle 重分布
没有 Shuffle                      
                                  典型:groupBy、join、distinct、
典型:map、filter、              repartition、orderBy
union、coalesce(变少)            
```

### 2.2 哪些操作产生宽依赖

```
窄依赖                          宽依赖(Shuffle)
─────                          ──────────────
select / project               groupBy
filter / where                 reduceByKey
map / mapPartitions            join (除非 Broadcast)
union                          distinct
coalesce (变少分区)             repartition
withColumn (无 udf shuffle)     orderBy / sort
                               window 函数(分区切换)
```

### 2.3 Stage 是怎么切的

```
DAG:
  Read Parquet  ─→  filter  ─→  select  ─→  groupBy  ─→  agg  ─→  write
        窄         窄          窄          宽          窄        窄

Stage 切分:
  Stage 0:  Read → filter → select → 写 shuffle 文件
                                          ↓
                                       Shuffle 边界
                                          ↓
  Stage 1:  读 shuffle → groupBy → agg → write
```

**规则**:Stage 内部都是窄依赖(可 pipeline 执行),Stage 边界由 Shuffle 划定。

### 2.4 看 Stage 数量

```python
df.explain()
# == Physical Plan ==
# Project [user_id, amount]
# +- Filter status = 'paid'
#    +- FileScan parquet ...

df.groupBy("user_id").agg(F.sum("amount")).explain()
# == Physical Plan ==
# *(2) HashAggregate(keys=[user_id], functions=[sum(amount)])
# +- Exchange hashpartitioning(user_id, 200), ENSURE_REQUIREMENTS
#    +- *(1) HashAggregate(keys=[user_id], functions=[partial_sum(amount)])
#       +- *(1) FileScan parquet ...
#
# Exchange = Shuffle 边界,即 Stage 0 → Stage 1
# *(1) 和 *(2) 是不同的 WholeStageCodeGen Stage
```

---

## 三、Task:Spark 的最小执行单位

### 3.1 Task = Stage × 分区

```
Stage 1 (Read → filter → write shuffle)
   分区 0: Task 0     →  Executor A core 1
   分区 1: Task 1     →  Executor A core 2
   分区 2: Task 2     →  Executor B core 1
   ...
   分区 199: Task 199 →  Executor X core Y
   
共 200 个 Task 并行(假设输入分区 200)
```

**所以分区数 = Task 数 = 并发度**。
- 分区太少 → 并发不够,Task 太大,容易倾斜
- 分区太多 → 调度开销,小 Task 浪费启动时间

```python
spark.conf.set("spark.sql.shuffle.partitions", 200)  # shuffle 后分区数默认 200
df.rdd.getNumPartitions()  # 当前分区数
df.repartition(1000)  # 改分区数(会触发 Shuffle)
df.coalesce(50)       # 减少分区(尽量不 Shuffle)
```

### 3.2 Task 调度

```
Driver:
  DAG Scheduler 拆 Job → Stages
  Task Scheduler 把 Task 派给 Executor

Executor:
  从 Driver 拿 Task,本地反序列化执行
  完成后返回结果或落盘 shuffle 文件

数据本地性优先级:
  PROCESS_LOCAL  > NODE_LOCAL > RACK_LOCAL > ANY
  (任务越靠近数据越好,Spark 会等 spark.locality.wait=3s)
```

### 3.3 Task 失败处理

Spark 默认重试 Task 4 次(`spark.task.maxFailures=4`):
- 偶发失败(网络、节点慢)→ 自动恢复
- 持续失败(代码 bug、数据问题)→ Stage 失败 → Job 失败

**Stage 内的失败可以只重跑 Task,Shuffle 跨边界的失败要从上一个 Shuffle 重新生成数据**——这是宽窄依赖的另一个工程价值。

---

## 四、Shuffle:Spark 最大的性能杀手

### 4.1 必画图:Shuffle 在做什么

```
                Stage 0 (上游 Map 端)
                ─────────────────
  Executor A:                       Executor B:
  Task 0  ┐                        Task 2  ┐
          ├─→ 写本地盘                      ├─→ 写本地盘
  Task 1  ┘  shuffle 文件          Task 3  ┘  shuffle 文件
            ↓                              ↓
            按 key hash 分 200 桶           按 key hash 分 200 桶
            写 200 个 .data + 1 个 .index   同
                                            ↓
                                  ─────────────────────
                                  跨节点 Shuffle Service
                                  (或直接 Executor 之间)
                                  ─────────────────────
                                            ↓
                Stage 1 (下游 Reduce 端)
                ───────────────────
  Reduce Task 0:                  Reduce Task 199:
  从所有上游拉 partition 0          从所有上游拉 partition 199
  (网络 IO + 磁盘读)                (网络 IO + 磁盘读)
       ↓                                    ↓
  合并 + 排序 + 聚合              合并 + 排序 + 聚合
```

### 4.2 Shuffle 的代价

- **磁盘 IO**:上游 Map 端写本地盘,下游 Reduce 端读本地盘
- **网络 IO**:Reduce 端跨 Executor / 跨节点拉数据
- **序列化 / 反序列化**:数据要从内存对象 → 字节流 → 网络 → 字节流 → 内存对象
- **内存压力**:reduce 端要 buffer + sort

**实测**:一个 1TB 数据的 Shuffle ≈ 1TB 磁盘写 + 1TB 网络传 + 1TB 磁盘读 = 性能瓶颈集中在这里。

### 4.3 Shuffle Manager 演进

```
Hash Shuffle (Spark 1.0-1.4)     每个 Map Task 给每个 Reduce 写一个文件
                                  → 文件数 M × R 爆炸
                                  
Sort Shuffle (Spark 1.5+,默认)   每个 Map Task 写一个 sorted 文件 + 1 index
                                  → 文件数 M(降 R 倍)
                                  
Tungsten Sort Shuffle (1.5+)     堆外内存 + 直接二进制操作
                                  
Push-based Shuffle (3.2+)        Map 主动 push 到 Shuffle Service
                                  → 减少 Reduce 端连接数(适合大集群)
```

### 4.4 看 Shuffle 量

Spark UI → Stage 详情:
- **Shuffle Read**:Reduce 端从上游拉了多少数据
- **Shuffle Write**:Map 端写了多少 shuffle 数据
- **Shuffle Spill**:内存放不下溢出到磁盘的量(越大越慢)

```python
# 代码里也能查看
status = stage.task_metrics
print(status.shuffle_read_metrics)
print(status.shuffle_write_metrics)
```

---

## 五、Join 的物理实现:Spark 怎么选

### 5.1 三种 Join 物理算子

```
1. Broadcast Hash Join (BHJ)
   小表广播到所有 Executor,大表本地 lookup
   ┌──────┐         ┌──────────┐
   │ 小表 │ broadcast│ Executor │
   │ 1MB │ ──────→ │ build map│
   └──────┘         │  lookup  │
                    │ 大表 streaming
                    └──────────┘
   
   优点:无 Shuffle,非常快
   触发:小表 < spark.sql.autoBroadcastJoinThreshold (默认 10MB)
        手动 broadcast(F.broadcast(small_df))
        
2. Sort Merge Join (SMJ,默认)
   两边都按 join key 排序 + Shuffle,然后归并合并
   
   优点:稳定,内存友好,适合大表 join 大表
   代价:两边 Shuffle + sort
   
3. Shuffle Hash Join (SHJ)
   小一点的表 Shuffle 后建 hash 表,大表 Shuffle 后探测
   
   优点:不需要 sort
   代价:hash 表内存压力
   触发条件严格(spark.sql.join.preferSortMergeJoin=false 且 满足大小条件)
```

### 5.2 选 Join 的决策

```
小表(< 10MB)  →  BHJ
            ↑      ↑
       手动 broadcast 可以推大点(配合 spark.sql.autoBroadcastJoinThreshold)
            
大表 join 大表  → SMJ(默认)

小一点的表(< 100MB)+ 不要 sort  → SHJ(很少手动选)

倾斜 join  →  AQE 自动 split 倾斜分区(15 篇)
```

### 5.3 看选了哪个

```python
df1.join(df2, "id").explain()

# == Physical Plan ==
# BroadcastHashJoin [id], Inner, BuildRight     ← BHJ
# 或
# SortMergeJoin [id], [id], Inner                ← SMJ
```

---

## 六、AQE:跨 Stage 的运行时优化(15 篇展开)

Catalyst 在编译期优化,但很多决策(分区合并、倾斜处理、Join 策略切换)需要运行期统计才能做。

**AQE(Adaptive Query Execution,Spark 3.0+,3.2+ 默认开)** 解决这个:

```python
spark.conf.set("spark.sql.adaptive.enabled", "true")  # 3.2+ 默认 true
```

主要功能:
- 动态合并 shuffle partition(把 200 个小的合成 50 个)
- 动态切换 Join 策略(发现一边小了 → SMJ → BHJ)
- 动态处理倾斜(split skewed partition)

详见 15 篇。

---

## 七、看 Spark UI 的最小操作流程

### 7.1 入口

```
Driver 起来后访问 http://<driver>:4040
(Local 模式)  http://localhost:4040
(K8s 模式)   通过 Service / Ingress

History Server: 任务结束后看,默认 18080 端口
```

### 7.2 关键页面

```
Jobs            每个 Action 一个 Job,看哪个 Job 慢
                ↓
Stages          每个 Stage 的 Task 时间分布、Shuffle 读写量
                ↓ 点开
Tasks           看是否倾斜(Task 时间长尾)
                ↓
Storage         看 cache 的 RDD/DataFrame 内存占用
Executors       每个 Executor 的 CPU / 内存 / 任务数
SQL             SQL 查询的 Plan + 实际指标
```

### 7.3 排查链路

```
慢 / 挂的 Job
  → 看哪个 Stage 慢
    → 看 Task duration 分布是否长尾(倾斜)
      → 看 Shuffle Read / Write 量是否巨大
        → 看 Spill 量是否爆
          → 调:分区数 / Broadcast / 加盐 / cache / 内存
```

---

## 八、工程落地:从 SQL 到完整执行

```python
spark = SparkSession.builder.getOrCreate()

orders = spark.table("shop.silver.orders")
users  = spark.table("shop.silver.dim_users")

result = (orders
    .filter(F.col("status") == "paid")            # 窄,Stage 内
    .join(F.broadcast(users), "user_id")           # BHJ,无 Shuffle
    .groupBy("province")                           # 宽,触发 Shuffle
    .agg(F.sum("amount").alias("gmv")))

result.write.mode("overwrite").parquet("...")
```

**执行画像**:

```
Job 0 (write 触发)
  Stage 0:  读 orders parquet, filter status='paid'
            读 users parquet
            broadcast users → 所有 Executor build hash map
            ↓ (没 Shuffle,因为 BHJ)
  
  Stage 1:  partial groupBy (Map 端预聚合)
            写 shuffle 文件
            ↓ Shuffle
  Stage 2:  shuffle read → final groupBy → write parquet

共 3 个 Stage,但 0/1 在一个 WholeStageCodeGen 内
看 UI 显示 "*(1)" "*(2)" 表示 codegen stage 编号
```

**Shuffle 量**:取决于 join 后行数 + key 分布

---

## 九、常见陷阱

### 9.1 `collect()` 到 Driver 炸 OOM

```python
result = df.collect()  # ❌ 如果 df 是几 GB,Driver 直接 OOM
```

正解:`df.toPandas()`(限制小)、`df.write.parquet(...)` 落盘后再读、`df.show(N)`。

### 9.2 蓝色调用看似窄,实则触发 Shuffle

```python
df.distinct()       # 触发 Shuffle(按所有列分桶)
df.orderBy("x")     # 触发 Shuffle(全局排序)
df.window().over()  # 通常触发(分区切换)
df.dropDuplicates() # 触发
```

### 9.3 UDF 是 Catalyst 黑盒

```python
@udf("double")
def calc(amount):
    return amount * 1.1

df.withColumn("new", calc("amount"))  # Catalyst 不能下推、不能内联
```

正解:用 Spark 内置函数 `F.col("amount") * 1.1` —— 几乎所有内置函数都向量化。

实在要 UDF:**Pandas UDF(Vectorized UDF)** 比普通 UDF 快 10x。

### 9.4 Cache 用错

```python
# ❌ 没用,Action 之间不会共享
df.filter(...).cache()
df.filter(...).count()  # Cache 不命中,因为 filter 是新对象

# ✓ 对
df_cached = df.filter(...).cache()
df_cached.count()       # 触发 cache 物化
df_cached.show()         # 命中
```

详细 cache 用法见 14 篇。

### 9.5 小文件爆炸

```python
df.repartition(1000).write.parquet("...")   # ❌ 1000 个分区 = 1000 个小文件
df.coalesce(10).write.parquet("...")        # ✓ 写之前合并
```

---

## 十、看完这一篇,你应该能

- 解释 Action vs Transformation 的懒执行机制
- 在白板上画窄依赖 vs 宽依赖,知道 Shuffle = Stage 边界
- 知道分区数 = Task 数 = 并发度,且 shuffle.partitions 默认 200
- 默写 Shuffle 的工作流程(Map 写本地盘 → 跨节点拉 → Reduce 合并)
- 区分 BHJ / SMJ / SHJ 三种 Join 物理算子
- 学会看 Spark UI:Job → Stage → Task,以倾斜 / Shuffle 量为入口排查
- 避开 collect / 不必要 Shuffle / UDF / 小文件 这几个常见坑

下一篇:**14 Spark 调优** — 分区、倾斜、广播、持久化、序列化、内存——把 13 篇里讲的执行模型变成可操作的调优手册。
