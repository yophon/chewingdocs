# AQE 与现代 Spark:运行时自适应、Photon、Gluten

Catalyst 优化器在**编译期**能优化的事有限:它不知道实际分区的数据量、不知道倾斜分布、不知道 Shuffle 后的真实统计。**AQE(Adaptive Query Execution,Spark 3.0+)** 把决策权部分搬到**运行期**——跑完一个 Stage,看真实统计,再决定下一步怎么走。这是 Spark 近十年最大的架构升级。这一篇拆 AQE 的三个核心能力(动态合并分区、动态切换 Join、动态处理倾斜)、DPP(Dynamic Partition Pruning)、以及向量化方向(Photon / Gluten / Comet)正在把 Spark 推向何方。

> 一句话先记住:**AQE = Catalyst 编译期决策 + 运行时反馈调优**。三个核心能力都建立在「Shuffle 完拿到真实统计」这个时机:**合并小分区、切换 Join 策略、处理倾斜**。配上 DPP(运行时分区裁剪),Spark 3.x 相比 2.x 在复杂 SQL 上提速 30-100%。**不开 AQE 等于浪费 Spark 3+。**

---

## 一、为什么 Catalyst 不够

### 1.1 Catalyst 在编译期看到什么

```sql
SELECT province, SUM(amount)
FROM orders
WHERE date = '2025-05-01'
JOIN dim_users USING (user_id)
GROUP BY province;
```

编译期 Catalyst 能算:
- 静态统计(表的总行数、列基数 — 来自表 metadata)
- 列裁剪、谓词下推
- Join 顺序重排(基于估算 row count)
- Broadcast 阈值判断

### 1.2 Catalyst 算不准的事

- **真实分区数据量**:估算 row count 跟实际差 10 倍很常见
- **Shuffle 后的分布**:聚合后变多少行?
- **倾斜**:大 key 占多少?
- **Join 后真实大小**:估算 join 结果可能差几百倍

**结果**:Spark 2.x 时代,生产 SQL 经常因为 Catalyst 估错 → 选错 Join → 跑得很惨。

### 1.3 AQE 的核心思想

```
编译期(Catalyst):构造一个 LogicalPlan + 初始 PhysicalPlan
                          │
                          ▼
运行期:跑完 Stage N
   收集 Shuffle 实际统计(每分区大小、总 row count、min/max)
                          │
                          ▼
基于真实统计,重新优化 LogicalPlan 中尚未执行的部分
                          │
                          ▼
生成新 PhysicalPlan,继续跑 Stage N+1
```

Catalyst 不再是「一次性翻译」,而是**「每跑完一个 Shuffle,重新优化剩下的部分」**。

---

## 二、AQE 三大功能

### 2.1 动态合并 Shuffle Partitions

**问题**:`spark.sql.shuffle.partitions=200` 是固定的,但实际 200 个分区里:
- 大部分很小(1MB),启动 Task 浪费
- 极少数大(100MB),拖后腿

**AQE 解法**:跑完 Map 端 Shuffle,看每个 partition 实际大小,**把小分区合并**:

```
原始:         合并后:
P0: 1MB    →   P0+P1+P2+P3: 1MB+2MB+1MB+1MB = 5MB
P1: 2MB        P4+P5+P6:     2MB+1MB+1MB = 4MB
P2: 1MB        P7+P8: ...
P3: 1MB        ...
P4: 2MB
...
P199: 1MB
```

```python
spark.conf.set("spark.sql.adaptive.enabled", "true")
spark.conf.set("spark.sql.adaptive.coalescePartitions.enabled", "true")
spark.conf.set("spark.sql.adaptive.advisoryPartitionSizeInBytes", "64m")  # 目标大小
spark.conf.set("spark.sql.adaptive.coalescePartitions.minPartitionSize", "1m")  # 最小
```

**效果**:200 分区可能合并成 30-50 个,Task 调度开销大幅减少,小数据场景跑得快 2-3x。

### 2.2 动态切换 Join 策略

**问题**:Catalyst 编译期估算「订单表过滤后还有 10TB」 → 选 SortMergeJoin。**实际跑完 filter 只剩 50MB**——这时候 Broadcast Hash Join 才是最优,但已经晚了。

**AQE 解法**:filter 这个 Stage 跑完,看实际输出大小,如果小于 broadcast 阈值,**把后续 Join 从 SMJ 改成 BHJ**:

```
编译期 PhysicalPlan:                运行期 (AQE) 调整后:
                                    
Filter ─→ SortMergeJoin              Filter ─→ BroadcastHashJoin
   ↑                                    ↑
估算 10TB                             实际 50MB
```

```python
spark.conf.set("spark.sql.adaptive.localShuffleReader.enabled", "true")
# 切到 BHJ 后,免去后续 Shuffle 读
```

**效果**:复杂 SQL 估算偏离时,性能差距能从「跑半天」变「跑几分钟」。

### 2.3 动态处理倾斜(Skew Join)

**问题**:Sort Merge Join 时,某个 key 极大(自然倾斜),所在 Task 拖到无穷大。

**AQE 解法**:Shuffle 完检测哪个分区显著大于中位数(阈值可配),**把它 split 成多个小分区,对面对应 partition 复制多份**:

```
原始 Join:                          AQE Skew Handling:
                                    
左侧 partition 0 (大 key)            左侧 partition 0 split 成 3 块
  ├ key=12345 占 90%                   ├ 块 0a:key=12345 部分
                                       ├ 块 0b:key=12345 部分
                                       └ 块 0c:key=12345 部分
右侧 partition 0                     右侧 partition 0 复制 3 份
  └ key=12345 在这里                   ├ 副本 0a → join 块 0a
                                       ├ 副本 0b → join 块 0b
                                       └ 副本 0c → join 块 0c
                                    
Task 0 拖死(30 分钟)                3 个 Task 并行(10 分钟)
```

```python
spark.conf.set("spark.sql.adaptive.skewJoin.enabled", "true")
spark.conf.set("spark.sql.adaptive.skewJoin.skewedPartitionFactor", "5")  
# 分区超过中位数 5 倍算倾斜
spark.conf.set("spark.sql.adaptive.skewJoin.skewedPartitionThresholdInBytes", "256MB")
```

**效果**:不用改代码、不用加盐,倾斜 join 自动并行化。**这是 AQE 最大的体验改进**。

---

## 三、DPP:Dynamic Partition Pruning

### 3.1 经典场景

```sql
SELECT * FROM fact_orders f
JOIN dim_region r ON f.region_id = r.id
WHERE r.country = 'CN';
```

`fact_orders` 按 `region_id` 分区,1000 个分区。
`dim_region` 表小,过滤后只有 50 行 region_id 属于 CN。

**没 DPP**:fact_orders 全表扫描 → join → 过滤,扫了 1000 个分区。
**有 DPP**:先算出 dim_region 过滤后的 region_id 集合 → 把这个集合作为 fact_orders 的分区裁剪谓词 → 只扫 50 个分区。

### 3.2 工作流

```
1. 编译期:Catalyst 识别出可下推
   fact_orders.region_id IN (SELECT id FROM dim_region WHERE country='CN')
   
2. 运行期:
   先执行右侧子查询(读 dim_region,过滤,collect 50 个 id)
   广播这个 id 列表给左侧 fact_orders 的 FileScan
   
3. FileScan 用这个列表做分区裁剪
   Iceberg / Hive 表都支持
   
4. 实际只读 50 个分区,IO 量减少 95%
```

```python
spark.conf.set("spark.sql.optimizer.dynamicPartitionPruning.enabled", "true")  # 3.0+ 默认 true
```

### 3.3 看 DPP 生效

```python
spark.sql("...").explain(True)
# 物理计划里看到 PartitionFilters: [dynamicpruning#XX]
# 表示 DPP 被推下去了
```

### 3.4 AQE vs DPP

| | AQE | DPP |
| --- | --- | --- |
| 时机 | 运行期(Shuffle 后) | 编译期 + 运行时执行 |
| 解决问题 | 分区数 / Join 策略 / 倾斜 | 分区裁剪 |
| 依赖 | Shuffle | 子查询(广播侧) |

两者**互补**,生产场景都该开。

---

## 四、Spark 3.x → 4.x 的其他亮点

### 4.1 Photon / Gluten / Comet:向量化执行

**Spark 默认是 JVM Tungsten 行式执行**(虽然向量化但 JVM 限制了上限)。

| 项目 | 出身 | 关键 |
| --- | --- | --- |
| **Photon** | Databricks 2020+,**闭源** | C++ 重写物理算子,**只在 Databricks 上**,3-5x OSS Spark |
| **Gluten** | Intel 2022+,**开源** | Spark 物理算子映射到 Velox 或 ClickHouse,向量化 |
| **Apache DataFusion Comet** | Apple 2023+ 捐 Apache | Spark 算子映射到 Rust DataFusion,起步阶段 |
| **Spark 4 Native Engine**(Tungsten++) | OSS 持续优化 | 部分 SIMD,但比 Photon 落后 |

**核心思想**:**把 JVM 行式执行替换成 C++/Rust 列式向量化**——所有现代 OLAP 引擎(ClickHouse / DuckDB / Trino)都走这条路,Spark 在追。

### 4.2 Spark Connect(Spark 3.4+)

「**轻客户端**」:把 Spark Session 拆成 client + server,客户端只写代码、server 跑计算。

```python
# 客户端
from pyspark.sql.connect import SparkSession
spark = SparkSession.builder.remote("sc://my-spark-server:15002").getOrCreate()

df = spark.read.parquet("...")  # client 只发 protobuf 描述
df.show()                        # server 计算并返回
```

价值:
- 客户端不依赖 JVM / Spark 完整安装
- 可以从 Jupyter / Streamlit / 任意 Python 环境直接连
- 类似 Trino / Snowflake 的 client-server 模式

### 4.3 Variant 类型(Spark 4)

针对 **JSON 半结构化数据**,新增 `VARIANT` 类型(类似 Snowflake VARIANT):

```sql
CREATE TABLE events (id BIGINT, payload VARIANT);

INSERT INTO events VALUES (1, parse_json('{"a":1,"b":[2,3]}'));

SELECT payload:b[0] FROM events;
```

- 存储:嵌套二进制,比 JSON string 紧凑
- 查询:直接路径访问,无需 schema 演进
- 适合:埋点事件、AppLogs、灵活字段

### 4.4 Streaming State Store v2

Structured Streaming 的状态后端从 v1(HDFS-backed)升级到 v2(RocksDB-backed),状态可超内存、增量 checkpoint——跟 Flink 的状态后端思路趋同(21 篇)。

---

## 五、AQE 实战:看 query 提速

### 5.1 启用配置

```python
spark = SparkSession.builder \
    .config("spark.sql.adaptive.enabled", "true") \
    .config("spark.sql.adaptive.coalescePartitions.enabled", "true") \
    .config("spark.sql.adaptive.skewJoin.enabled", "true") \
    .config("spark.sql.adaptive.localShuffleReader.enabled", "true") \
    .config("spark.sql.optimizer.dynamicPartitionPruning.enabled", "true") \
    .config("spark.sql.adaptive.advisoryPartitionSizeInBytes", "64m") \
    .getOrCreate()
```

### 5.2 看 AQE 调整记录

```python
result.explain(True)
# Spark UI → SQL 查询详情 → 看 "AdaptiveSparkPlan" 标记
# 节点旁会标:
# - "coalesce" (合并分区)
# - "BroadcastHashJoin" (从 SMJ 切过来)
# - "SkewJoin handled" (倾斜处理过)
```

### 5.3 一段真实对比

```sql
-- 复杂多表 join
SELECT 
    o.province, SUM(o.amount) AS gmv, COUNT(DISTINCT o.user_id) AS dau
FROM fact_orders o
JOIN dim_users u ON o.user_id = u.user_id
JOIN dim_products p ON o.product_id = p.id
WHERE o.event_date = '2025-05-01'
  AND p.category = 'electronics'
GROUP BY o.province;
```

**Spark 2.4(无 AQE)**:
- 估算 fact 表过滤后 100GB → SMJ
- 实际只 1GB → 浪费了一次 Shuffle
- 运行时间:18 分钟

**Spark 3.5(AQE 开 + DPP)**:
- 编译期:DPP 把 product category 推到 fact 表分区裁剪
- 运行期:fact 表过滤后 1GB → AQE 切 BHJ
- AQE 合并 200 分区到 30 个
- 运行时间:4 分钟

**4.5x 提速,不改代码**。

---

## 六、AQE 不能救的事

### 6.1 写得烂的 SQL

AQE 不会自动:
- 改写 SQL 逻辑
- 移除不必要的 ORDER BY
- 替换 UDF 为内置函数
- 删除冗余 JOIN

**根本垃圾 SQL**:AQE 只能锦上添花。

### 6.2 UDF 黑盒

UDF 仍然是 Catalyst 黑盒,AQE 也看不进去——内部多慢、占多少内存,统统不知道。

### 6.3 极度倾斜

skew handling 把大 key split 成 N 块,但如果某个 key 占 99%,split N 块每块还是巨大。**极端倾斜仍需要业务侧处理**(预聚合、加盐、改架构)。

### 6.4 元数据极度膨胀

100 万个分区的表,DPP 要广播 100 万个 id —— Driver 内存撑不住。这种情况要先做 ZOrder / Liquid Clustering 之类的多维聚簇优化。

---

## 七、现代 Spark 的方向

### 7.1 向量化是必然

```
Spark 2.x   JVM 行式 → JVM Tungsten 向量化 (部分)
Spark 3.x   AQE + 部分向量化
Spark 4.x   Native 向量化加强(但仍受 JVM 限制)
Photon      C++ 全向量化(Databricks 闭源)
Gluten      Velox 向量化(开源 Photon 替代)
DataFusion Comet  Rust 向量化(实验)
```

未来 2-3 年 OSS Spark 大概率内置 Gluten 或类似方案。

### 7.2 计算-存储再解绑

Spark on K8s + 对象存储 + Iceberg → 计算节点真正无状态、可分钟级扩缩。

### 7.3 跟 AI 协作

- Spark 已经原生支持 `pyspark.ml` 和 `pandas API on Spark`
- Spark Connect 让 LLM Agent 易于调用 Spark
- Databricks 在做 AI 写 Spark SQL

### 7.4 SQL / Python 平权

```
Spark 1.x   Scala / Java 一等公民
Spark 2.x   Python / SQL 加强
Spark 3.x   Spark Connect 让 Python 几乎无 JVM 依赖
Spark 4.x   Variant、Streaming 改进、Python 性能持续提升
```

Python 在 Spark 上的体验逐渐追上 Scala。

---

## 八、什么时候不要用 Spark

虽然 Spark 持续进化,**它仍然不擅长**:
- **交互式查询**:Trino / DuckDB 启动更快
- **高并发**:OLAP DB(ClickHouse / Doris)
- **真流处理**:Flink
- **单机分析(< 100GB)**:DuckDB / Polars
- **OLTP**:任何 OLTP DB

**Spark 在「大批 + 复杂 + 多源 + ML / 流批混合」场景仍然第一**。

---

## 九、看完这一篇,你应该能

- 解释 AQE 的三大功能(合并分区 / 切换 Join / 倾斜处理)
- 知道 DPP 是编译期推 + 运行时执行的分区裁剪
- 在 Spark 3+ 项目里默认开 AQE 配置
- 看 explain 知道 AdaptiveSparkPlan 标记
- 知道 Photon / Gluten / Comet 是 Spark 向量化的方向
- 区分 AQE 能救和不能救的场景(写垃圾 SQL 救不了)

下一篇:**16 批处理替代品** — Spark 不是唯一选择。Trino / Presto / DuckDB / ClickHouse / Polars 各自擅长什么?选型决策树。
