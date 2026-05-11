# Spark 心智:RDD、DataFrame、Spark SQL、Catalyst

2010 年 Matei Zaharia 在 UC Berkeley 写 Spark 论文,卖点直白:**MapReduce 太慢,中间结果落磁盘是罪魁祸首,内存计算 + DAG 调度能快 100 倍**。15 年过去,Spark 不仅没死,反而成了**离线批处理的事实标准**——MapReduce 真没了,Hadoop 系生态半死不活,但 Spark 跟着 Iceberg / Delta / Databricks 一路活到了 2025。这一篇拉清楚 Spark 的心智:三套 API 的演化、Catalyst 优化器、Tungsten 执行引擎,以及为什么「DataFrame + SQL」是 90% 场景的正确入口。

> 一句话先记住:**Spark = DAG 调度 + 内存中间结果 + Catalyst 优化器 + Tungsten 代码生成**。三套 API 里,**新代码只用 DataFrame / SQL**,RDD 留给极少数需要灵活控制的场景。Spark 没赢在速度,赢在「一套 API + 批 + 流 + SQL + ML + 图」覆盖了数据工程的整个频谱。

---

## 一、为什么 MapReduce 死了,Spark 活下来

### 1.1 MapReduce 的死法

写一个稍微复杂点的 join,比如 `订单 join 用户 join 商品`,要写两个 MR job:

```
Job 1:    Map(订单)─→ partition by user_id ─→ Reduce 
                                                  ↓
                                                落 HDFS 中间文件
                                                  ↓
Job 2:    Map(中间文件 + 商品)─→ partition by product_id ─→ Reduce
                                                              ↓
                                                            落 HDFS 结果
```

问题:
- 每个 Job 之间中间结果**落 HDFS**(磁盘 IO 重)
- 写代码:每步都要 Mapper / Reducer 类,Hive 出现之前一切要 Java
- 调度:Job 之间靠 Oozie / Azkaban 串,失败重启代价大
- 慢:复杂 ETL 跑半天,迭代算法(ML)一轮一个 Job,几十轮 = 一天

### 1.2 Spark 的三个突破

1. **RDD + 内存计算**:中间结果留内存(可 cache),只在必要时落盘
2. **DAG 调度**:整个计算图一次提交,引擎自动算依赖、合并 Stage,失败按窄/宽依赖恢复
3. **一套 API 串起来**:Java/Scala/Python/SQL 都能写,批 / 流 / 图 / ML 共享

```
MapReduce:       Map → 落 HDFS → Map → 落 HDFS → Reduce
                 (每步都磁盘 IO,Job 间独立)

Spark:          DAG(读 → 转换 → 转换 → 转换 → 写)
                (整图一次调度,中间留内存)
```

性能上 10-100 倍(论文场景),工程上把「**复杂 ETL 写成几十行代码**」从奢望变成日常。

### 1.3 现状(2025)

- MapReduce 几乎绝迹(Hive 默认引擎都换成 Tez / Spark)
- Hive on MR 仍存在于一些老旧系统,但新建项目没人选
- Spark 占据 OSS 离线批处理 70%+ 份额(剩下是 Trino 做交互、Flink 做流、Snowflake/BQ 做托管仓)

Spark 不是最快(向量化 OLAP 引擎更快),但**「批 + 流 + ML + SQL 一套 API 覆盖」** 让它的生态护城河无人能及。

---

## 二、三套 API 的演化

### 2.1 时间线

```
2010  Spark 1.0  RDD                  函数式、强类型、能做任何事
2013  Spark 1.3  DataFrame            类似 Pandas,Catalyst 优化器加入
2016  Spark 1.6  Dataset              DataFrame + 编译期类型(只 JVM)
2017+  Spark 2/3 DataFrame/SQL 主导   RDD 渐 deprecated 但不删
2020+  Spark 3.x AQE + Photon         运行期自适应,Databricks 商业化
2025   Spark 4   Variant 类型、connect 模式、Arrow-friendly
```

### 2.2 RDD:能做一切,但优化器不懂你

```python
rdd = sc.textFile("s3://bucket/orders.txt")
result = (rdd
    .map(lambda line: line.split(","))
    .filter(lambda fields: fields[2] == "paid")
    .map(lambda fields: (fields[1], float(fields[3])))
    .reduceByKey(lambda a, b: a + b)
    .collect())
```

**特点**:
- 函数式风格,lambda 任意 Python / Scala 函数
- 强类型(Scala / Java)或弱类型(Python)
- **优化器看不懂**:lambda 是黑盒,Catalyst 无法下推、推断 schema

**什么时候仍用 RDD**:
- 需要任意自定义逻辑(图算法、复杂状态机)
- 老代码维护
- 极端场景 DataFrame 表达不了

### 2.3 DataFrame:Spark 的 SQL 引擎对外名字

```python
df = spark.read.parquet("s3://bucket/orders")
result = (df
    .filter(F.col("status") == "paid")
    .groupBy("user_id")
    .agg(F.sum("amount").alias("total")))
result.show()
```

**特点**:
- 列式数据 + schema
- Catalyst 优化器看得懂:列裁剪、谓词下推、Join 顺序重排
- 跨语言一致(Python / Scala / Java / R)
- 弱类型(列名是字符串)

**90% 场景的入口**。

### 2.4 SQL:DataFrame 的另一张脸

```python
spark.read.parquet("s3://bucket/orders").createOrReplaceTempView("orders")

result = spark.sql("""
SELECT user_id, SUM(amount) AS total
FROM orders
WHERE status = 'paid'
GROUP BY user_id
""")
```

**SQL ≡ DataFrame**:执行计划一致,Catalyst 优化器一致。**写 SQL 还是写 DataFrame 看团队偏好**——dbt 时代,SQL 是主流。

### 2.5 Dataset:Spark 唯一的「强类型 + 优化」选项

```scala
case class Order(id: Long, user_id: Long, amount: Double, status: String)

val ds = spark.read.parquet("s3://bucket/orders").as[Order]
val result = ds.filter(_.status == "paid").groupBy("user_id").agg(sum("amount"))
```

**特点**:
- 编译期类型检查
- 但 lambda 仍然是黑盒(`_.status == "paid"`),部分优化失效
- 只 JVM(Scala / Java),Python 无

**用得少**:Scala 团队选择,Python 没这个东西。

### 2.6 决策树

```
有 schema、纯转换         → DataFrame / SQL  (90% 默认)
极复杂自定义逻辑          → RDD              (少数)
Scala + 想要类型 + 性能   → Dataset          (Scala 偏好)
Python 全栈              → DataFrame / SQL  (没 Dataset)
```

---

## 三、Catalyst 优化器:Spark 的 SQL 大脑

### 3.1 必画图:查询从 SQL 到 RDD 的流水线

```
        SQL / DataFrame API
              │
              ▼
    ┌─────────────────────────┐
    │  Unresolved Logical Plan │   解析,但表 / 列还没绑定
    │  Project [user_id, amount]│
    │   Filter status='paid'    │
    │    UnresolvedRelation t   │
    └─────────────────────────┘
              │
              ▼  Analyzer 用 Catalog 解析表 / 列
    ┌─────────────────────────┐
    │   Analyzed Logical Plan  │
    │  Project [user_id:long,  │
    │           amount:double] │
    │   Filter status='paid'   │
    │    Iceberg.shop.orders   │
    └─────────────────────────┘
              │
              ▼  Optimizer 应用一系列规则
    ┌─────────────────────────┐
    │  Optimized Logical Plan  │
    │  谓词下推 / 列裁剪 / 常量折叠│
    │  Join 重排 / 推断 Broadcast│
    │  ColumnPruning + Filter PD│
    └─────────────────────────┘
              │
              ▼  Strategy 选择物理算子
    ┌─────────────────────────┐
    │   Physical Plan          │
    │  FileScan(列裁剪 + filter)│
    │   ↓                      │
    │   HashAggregate          │
    └─────────────────────────┘
              │
              ▼  Whole-Stage CodeGen
    ┌─────────────────────────┐
    │   Generated Java Code    │
    │   编译,JIT 友好         │
    └─────────────────────────┘
              │
              ▼
            RDD 执行
            (Stage / Task / Shuffle,13 篇展开)
```

### 3.2 Catalyst 干的事

| 优化 | 例子 |
| --- | --- |
| **列裁剪 ColumnPruning** | `SELECT a FROM t` 只读列 a,不读 b/c/d |
| **谓词下推 PredicatePushdown** | `WHERE date='2025-05-01'` 推到 Parquet 读取层(Row Group 跳过) |
| **常量折叠 ConstantFolding** | `1 + 1 = 2` 编译期算 |
| **Filter 合并** | `WHERE a > 1 AND a < 10` 合成一个 |
| **Join Reorder** | 多表 join 时按统计选最优顺序 |
| **Broadcast 推断** | 一边小于阈值 → Broadcast Join 代替 SortMergeJoin |
| **Push Filter through Join** | `WHERE t1.x = ?` 推到 t1 一侧读取时 |

```python
# 看 explain
df.filter("status = 'paid'") \
  .select("user_id", "amount") \
  .explain(True)

# 输出会包含:
#  - Parsed Logical Plan
#  - Analyzed Logical Plan
#  - Optimized Logical Plan
#  - Physical Plan
# PushedFilters: [EqualTo(status,paid)]  ← 下推成功
```

### 3.3 Catalyst 的扩展点

- **自定义 Rule**:`spark.experimental.extraOptimizations`,业务规则进优化器
- **DataSource V2**:第三方存储(Iceberg / Delta / Hudi)通过 V2 接口让 Catalyst 看懂它们的统计、分区

**不要随便加自定义 Rule**——一个错的 Rule 能让所有 query 出错。

---

## 四、Tungsten:Spark 的执行引擎

### 4.1 解决的痛

JVM Spark 在 2014 年的痛:
- 对象开销大(每行数据一个 Java 对象 = 上百字节 overhead)
- GC 暂停打断长跑任务
- CPU 缓存命中率低(对象散在堆)

### 4.2 三件套

1. **堆外内存**:Spark 自管内存,不让 JVM 堆膨胀
2. **二进制行内格式**:`UnsafeRow`,定长 + bitmap 紧凑布局,CPU 友好
3. **Whole-Stage CodeGen**:把一个 Stage 的所有算子编译成一个 Java 函数,JIT 内联,**类似手写循环**

```python
# 没 CodeGen 时(理论):
for row in stage_input:
    for op in [filter_op, project_op, agg_op]:
        row = op.apply(row)
    output.append(row)
# 每个 op 一次函数调用,JIT 优化跨不了边界

# 有 CodeGen 时(实际):
generated_func = """
for row in stage_input:
    if row.status == 'paid':         # filter inlined
        out_user_id = row.user_id    # project inlined
        out_amount = row.amount
        agg_map[out_user_id] += out_amount   # agg inlined
"""
# 一个大循环,JIT 直接编译成机器码
```

性能提升:**1.5-2 倍**(2015 年 Spark 1.5+)。

### 4.3 现代演进:Photon / Gluten

- **Photon**(Databricks 2020+):C++ 重写执行算子,**向量化执行**,3-5 倍 OSS Spark。**闭源,只在 Databricks 上**。
- **Gluten**(Intel 主导,开源):**把 Spark 物理算子映射到 Velox / ClickHouse 向量化引擎**,开源 Photon 替代品
- **Apache DataFusion / Comet**:Rust 写的 Spark 向量化执行,起步阶段

**Spark 3.x → 4.x 的核心改进就是向量化执行**——所有引擎都在追这条赛道。

---

## 五、Spark 的部署形态

### 5.1 Cluster Manager 三选

```
Spark Standalone        Spark 自带,小规模、简单
                        没人在生产用,只 demo
                        
YARN                    Hadoop 系老搭档
                        2025 仍有,新建场景少
                        
Kubernetes              主流方向
                        Spark Operator,弹性扩缩容,云原生
                        
Local Mode              开发测试,跑在单 JVM
```

### 5.2 Driver vs Executor

```
              ┌───────────────┐
              │   Driver      │   (任务编排器)
              │  - SparkContext │
              │  - DAG Scheduler│
              │  - Task Scheduler│
              └───────────────┘
                     │
       ┌─────────────┼─────────────┐
       ▼             ▼             ▼
  ┌─────────┐  ┌─────────┐  ┌─────────┐
  │Executor1│  │Executor2│  │Executor3│
  │ Slot×4   │  │ Slot×4   │  │ Slot×4   │  (JVM 进程,每个跑多个 Task)
  │ Cache    │  │ Cache    │  │ Cache    │
  └─────────┘  └─────────┘  └─────────┘
       ↑             ↑             ↑
       └─────────────┴─────────────┘
                     │
                Shuffle 文件
                (写本地盘,跨 Executor 拉取)
```

**13 篇会展开**:Job / Stage / Task / Shuffle 的执行模型;**14 篇**讲调优。

### 5.3 资源配置常见模式

```python
spark.conf.set("spark.executor.cores", 4)        # 每 executor 4 核
spark.conf.set("spark.executor.memory", "16g")   # 16GB
spark.conf.set("spark.executor.instances", 50)   # 50 个 executor
spark.conf.set("spark.sql.shuffle.partitions", 1000)  # shuffle 后分区数
```

经验值:`executor.cores=4-5`,内存按 cores 4-8 倍配。详见 14 篇。

---

## 六、工程落地:一个端到端 Spark 作业

```python
from pyspark.sql import SparkSession, functions as F

spark = SparkSession.builder \
    .appName("daily_revenue") \
    .config("spark.sql.catalog.shop", "org.apache.iceberg.spark.SparkCatalog") \
    .config("spark.sql.catalog.shop.type", "rest") \
    .config("spark.sql.catalog.shop.uri", "https://catalog/api") \
    .config("spark.sql.adaptive.enabled", "true")   # AQE(15 篇)
    .config("spark.sql.shuffle.partitions", "200") \
    .getOrCreate()

# 读
orders = spark.table("shop.silver.orders")
users  = spark.table("shop.silver.dim_users")

# 转换
result = (orders
    .filter(F.col("event_time") >= "2025-05-01")
    .filter(F.col("status") == "paid")
    .join(users, "user_id", "left")
    .groupBy(F.date_trunc("day", "event_time").alias("day"), "province")
    .agg(
        F.sum("amount").alias("gmv"),
        F.countDistinct("user_id").alias("dau")
    )
)

# 看物理计划
result.explain(True)

# 写回 Iceberg(原子 commit)
(result.writeTo("shop.gold.daily_revenue")
       .using("iceberg")
       .partitionedBy("day")
       .createOrReplace())

spark.stop()
```

```bash
# 提交到 K8s
spark-submit \
  --master k8s://https://k8s-api \
  --deploy-mode cluster \
  --conf spark.kubernetes.container.image=my-spark:3.5 \
  --conf spark.kubernetes.namespace=spark \
  --conf spark.executor.instances=20 \
  --conf spark.executor.memory=16g \
  --conf spark.executor.cores=4 \
  daily_revenue.py
```

---

## 七、Spark 不擅长的事

### 7.1 极低延迟交互查询

Spark 启动一个 query 几秒就过去(JVM warmup + Catalyst)。**交互式 BI / Ad-hoc SQL 用 Trino / DuckDB**(16 篇)。

### 7.2 高并发

Spark 一个 Application 跑几个查询就饱和。**几千 QPS 的 Web 类查询不是 Spark 的场景**——走 OLAP DB(ClickHouse / Doris)。

### 7.3 真流处理

Spark Structured Streaming 是**微批**(默认秒级触发),不是真流。**毫秒级延迟用 Flink**。

### 7.4 单机分析

100GB 以下数据,**DuckDB / Polars 一台机器更快**——Spark 调度开销盖过了计算。

### 7.5 OLTP

Spark 没事务、没行锁、没毫秒级单行查询 — 别用作业务数据库。

---

## 八、Spark 的位置:仍然是批处理之王

```
负载类型                       推荐引擎
─────────────────────         ────────────────────
PB 级离线批 ETL                Spark
复杂多表 join + 转换            Spark
机器学习训练 / 特征工程         Spark + PyTorch / Spark MLlib
微批流处理                      Spark Structured Streaming
大批量数据落湖                  Spark + Iceberg

交互式 SQL / BI                Trino / DuckDB / Snowflake
真流处理 (亚秒级)               Flink
高并发实时查询                  ClickHouse / Doris
单机分析 < 100GB                DuckDB / Polars
```

**Spark 的优势在「大、复杂、批」**,在 2025 年仍稳居这块。

---

## 九、看完这一篇,你应该能

- 解释 Spark 凭什么干掉 MapReduce(内存、DAG、一套 API)
- 默写三套 API 的演化和适用场景(DataFrame / SQL 90% 默认)
- 在白板上画 Catalyst 流水线(Unresolved → Analyzed → Optimized → Physical → CodeGen)
- 解释 Tungsten 的三件套(堆外、二进制行、Whole-Stage CodeGen)
- 看到 Photon / Gluten 知道是「向量化执行 + C++/Rust 重写」的方向
- 知道 Spark 不擅长什么(交互、高并发、真流、单机小数据、OLTP)

下一篇:**13 Spark 执行模型** — Job / Stage / Task / Shuffle / 宽窄依赖。Spark 的核心调度模型,Shuffle 是性能杀手。
