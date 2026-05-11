# Catalog 与元数据:Lakehouse 最容易被忽视的一层

「我们用 Iceberg + Spark + S3」——听起来配置齐全,但你漏了一个关键问题:**Spark 怎么知道某个表叫 shop.orders、它的 metadata 在 s3 哪个路径?**答案不在数据里,在 Catalog 里。Catalog 是 Lakehouse 的「中央通讯录」——表名 → metadata 指针 → 权限 → 血缘。Hive Metastore 占了这位置 15 年,现在 AWS Glue / Nessie / Unity / Polaris 同时在抢,且都打着「Iceberg REST Catalog 协议」的旗号。这一篇拆清楚 Catalog 在做什么、5 家选型怎么决策。

> 一句话先记住:**Catalog = 表名注册中心 + 当前 metadata 指针 + 权限/血缘**——它是 Lakehouse 的"中枢",决定了引擎能不能找到表、谁能读、改的时候原子不原子。Hive Metastore 老旧,Glue 锁 AWS,Unity 锁 Databricks,Nessie 主打 Git 风格,**Iceberg REST Catalog 协议是统一未来**——任何 catalog 实现这个 REST API,所有引擎都能用。

---

## 一、没 Catalog 之前是什么样的

### 1.1 直接读 S3 的痛

```python
# 没有 Catalog 时,Spark 这么读:
df = spark.read.format("iceberg") \
    .load("s3://bucket/warehouse/shop/orders/metadata/v123.metadata.json")
# 必须给完整路径,且要知道当前 metadata 版本
```

问题:
- 谁来追踪当前 metadata 是哪个版本?(写时新生成 v124,读端怎么知道?)
- 表名 → 路径的映射放在哪?(代码里硬编码?)
- 多个引擎(Spark / Trino / Flink)各自怎么找到同一张表?
- 谁有权限读这张表?
- 这张表的字段意义、所有者、SLA 谁记录?

**Catalog 就是来回答这些的中央服务**。

### 1.2 Catalog 干的事

```
1. 命名空间 / 表名 → 当前 metadata 位置
   shop.orders → s3://bucket/warehouse/shop/orders/metadata/v124.metadata.json
   
2. 原子 commit
   把 v124 改成 v125,必须原子(CAS / 两阶段提交)
   多 writer 并发时,后写者失败重试
   
3. 权限管控
   user:alice 可读 shop.orders,user:bob 不可
   
4. 血缘 / 文档(可选)
   orders 由哪个任务产出,被哪些下游消费
   
5. 跨引擎统一
   Spark / Trino / Flink / DuckDB 通过同一个 Catalog 看到同样的表列表
```

---

## 二、Hive Metastore:服役 15 年的老兵

### 2.1 出身和角色

Hive Metastore(HMS)2009 年随 Hive 出生,**事实上是大数据 15 年的元数据标准**——几乎所有非 Snowflake / BQ / Redshift 的湖仓引擎都支持 HMS API。

### 2.2 数据结构

HMS 后端是关系数据库(MySQL / PostgreSQL),核心表:

```sql
-- 简化结构
DBS:       database 列表(命名空间)
TBLS:      表列表(名字、所在 DB、表类型)
COLUMNS:   每张表的字段
PARTITIONS:每张表的分区(value + 路径)
SDS:       Storage Descriptor(序列化格式、压缩、SerDe)
TBL_PRIVS: 表级权限
```

### 2.3 Thrift API

HMS 通过 Thrift RPC 暴露 API:`getTable`, `getPartitions`, `dropTable` 等。所有引擎(Spark / Trino / Flink / Impala)对接 HMS 的方式都是 Thrift。

### 2.4 HMS 的死结

| 痛点 | 表现 |
| --- | --- |
| **单点 + 单 DB** | 后端 MySQL 宕 → HMS 全停 → 所有引擎读不到表 |
| **list partitions 慢** | 万级分区 → getPartitions 几秒到几十秒 → query 启动慢 |
| **不支持多 catalog** | 一个 HMS 只能服务一个命名空间根 |
| **Thrift 老旧** | 1990 风格 RPC,跨语言支持有限,云原生差 |
| **不支持现代特性** | 没原子 commit(rename 依赖 FS)、没分支、没事务 |
| **权限模型粗** | 表级,没列级 / 行级,没集成 IAM / OIDC |

### 2.5 它还活着的原因

- **15 年生态惯性**:大公司有几万张表登记在 HMS 里
- **Hadoop 系所有工具开箱即用**:Hive / Spark / Trino / Presto / Impala 默认 HMS 客户端
- **简单**:就是 MySQL + Thrift,部署门槛低
- **够用**:绝大多数批处理场景,HMS 不是瓶颈

**2025 的事实**:HMS 仍是大量公司的现状,但新建场景不再选 HMS。

---

## 三、AWS Glue Catalog:云上事实标准

### 3.1 定位

Glue Catalog 是 AWS 推出的**完全托管 HMS 兼容**服务。简单说:**「我帮你跑 HMS,你不用自己运维」**。

### 3.2 优势

- **托管**:HA + 备份 + 扩容 AWS 都搞定
- **跟 AWS 服务深度集成**:Athena / EMR / Redshift / Lake Formation 都直接用
- **HMS Thrift API 兼容**:旧 Spark / Trino 配置切 endpoint 就能用
- **IAM 集成**:权限走 AWS IAM,跟 S3 权限统一

### 3.3 劣势

- **锁 AWS**:数据可以是 Iceberg / Parquet 开放,但 Catalog 服务绑 AWS
- **API 仍是 HMS 风格**:深 API 调用上跟原生 HMS 有微差异
- **跨 region 复杂**:多 region 部署要自己处理
- **费用**:按请求 + 存储计费,大流量场景有成本

### 3.4 工程落地

```python
spark = SparkSession.builder \
    .config("spark.sql.catalog.glue", "org.apache.iceberg.spark.SparkCatalog") \
    .config("spark.sql.catalog.glue.catalog-impl", "org.apache.iceberg.aws.glue.GlueCatalog") \
    .config("spark.sql.catalog.glue.warehouse", "s3://bucket/warehouse") \
    .config("spark.sql.catalog.glue.io-impl", "org.apache.iceberg.aws.s3.S3FileIO") \
    .getOrCreate()

spark.sql("USE glue.shop")
spark.sql("SHOW TABLES")
spark.sql("SELECT * FROM orders LIMIT 10")
```

**事实标准**:AWS 用户,Glue 几乎默选。

---

## 四、Nessie:Git for Data

### 4.1 创新点

Nessie 是 Dremio 主推的 Catalog,核心理念是 **「数据有版本控制,像代码一样 branch / commit / merge」**。

### 4.2 心智模型

```
main 分支              开发分支 dev_2025_05
─────────              ─────────────────
表 orders v100        表 orders v100 (基于 main)
                       ↓
                       INSERT 新数据 → v101 (只在 dev 分支)
                       ↓
                       UPDATE → v102 (只在 dev 分支)
                       ↓
                       验证 OK → MERGE 到 main
                       ↓
main:orders v103       (合并后 main 拿到 dev 的所有改动)
```

跟 Git 完全一样的语义。

### 4.3 工程场景

- **数据回归测试**:dev 分支跑改后的 dbt model,跟 main 对比数据差异 → 决定是否 merge
- **隔离环境**:CI 跑 dbt 用临时分支,不污染生产
- **回滚**:误删数据 → revert commit → 整个表回到上一个状态
- **A/B 实验**:同时跑两个分支,A/B 对比

### 4.4 局限

- 生态比 Glue / HMS 小,集成支持靠 Iceberg
- 分支多了 metadata 累积快
- 团队需要适应 Git 风格的工作流

### 4.5 工程落地

```python
spark = SparkSession.builder \
    .config("spark.sql.catalog.nessie", "org.apache.iceberg.spark.SparkCatalog") \
    .config("spark.sql.catalog.nessie.catalog-impl", "org.apache.iceberg.nessie.NessieCatalog") \
    .config("spark.sql.catalog.nessie.uri", "http://nessie:19120/api/v1") \
    .config("spark.sql.catalog.nessie.ref", "main") \
    .config("spark.sql.catalog.nessie.warehouse", "s3://bucket/warehouse") \
    .getOrCreate()

# 切换到 dev 分支
spark.sql("USE REFERENCE dev_2025_05 IN nessie")

# 在 dev 分支做改动
spark.sql("INSERT INTO shop.orders VALUES (...)")

# 验证后 merge 回 main
spark.sql("MERGE BRANCH dev_2025_05 INTO main IN nessie")
```

### 4.6 谁在用

中等规模公司、想要数据版本控制的团队。Dremio 商业版客户为主,开源社区也在涨。

---

## 五、Unity Catalog:Databricks 的统一治理平面

### 5.1 定位

Unity Catalog(2021)是 Databricks 的统一治理层,管的不只是 Iceberg/Delta 表,还包括:
- **表**(Delta / Iceberg)
- **文件**(Volume,直接挂目录给用户)
- **AI/ML 模型**(MLflow 模型注册)
- **Notebook / Dashboard**(权限挂在 Unity)
- **跨 workspace 访问**

### 5.2 优势

- **统一治理**:一个权限模型管所有资产
- **行级 / 列级 / 动态视图**安全控制完善
- **审计日志**完整
- **血缘自动生成**:Databricks SQL / Notebook / Workflow 都自动上报到 Unity
- **跨 workspace 共享**:不同 Databricks 工作区共享同一份数据

### 5.3 劣势

- **绑 Databricks**:开源版能力受限,完整功能只在 Databricks 平台
- **2024 部分开源**:Unity Open-Source 已发布,但治理深度仍依赖 Databricks 服务
- **跨引擎支持**:Iceberg REST Catalog 兼容(2024+),但非 Databricks 引擎体验差

### 5.4 工程落地

```sql
-- 在 Databricks SQL 里
CREATE CATALOG shop;
USE CATALOG shop;

CREATE SCHEMA prod;
CREATE SCHEMA dev;

GRANT USE CATALOG ON CATALOG shop TO `analyst-team`;
GRANT SELECT ON TABLE shop.prod.orders TO `data-scientist@company.com`;

-- 行级安全
CREATE FUNCTION shop.prod.is_my_region(region STRING)
RETURN current_user() IN (SELECT user FROM shop.prod.user_region WHERE region = is_my_region.region);

ALTER TABLE shop.prod.orders
SET ROW FILTER shop.prod.is_my_region(region);

-- 动态列脱敏
CREATE FUNCTION mask_email(email STRING) RETURN CASE WHEN is_member('admin') THEN email ELSE '***@***' END;
ALTER TABLE shop.prod.users ALTER COLUMN email SET MASK mask_email;
```

---

## 六、Polaris:Snowflake 的反击

### 6.1 出身

2024 年 Snowflake 开源 Polaris Catalog,**完全实现 Iceberg REST Catalog 协议**——直接对标 Unity 的"治理 + 跨引擎"定位,但 Snowflake 的关键差异:**Polaris 是开源的**(Apache License)。

### 6.2 卖点

- **完全开源**:不绑 Snowflake
- **Iceberg REST Catalog 标准**:任何引擎都能接(Spark / Trino / Flink / Snowflake / Athena / DuckDB)
- **企业级权限**:RBAC、Service Principal、跨 region
- **零运维**:Snowflake 提供托管版,也可自部署

### 6.3 工程落地

```python
spark = SparkSession.builder \
    .config("spark.sql.catalog.polaris", "org.apache.iceberg.spark.SparkCatalog") \
    .config("spark.sql.catalog.polaris.type", "rest") \
    .config("spark.sql.catalog.polaris.uri", "https://polaris.snowflake.com/api/catalog") \
    .config("spark.sql.catalog.polaris.credential", "client_id:client_secret") \
    .config("spark.sql.catalog.polaris.scope", "PRINCIPAL_ROLE:ALL") \
    .config("spark.sql.catalog.polaris.warehouse", "shop_warehouse") \
    .getOrCreate()
```

### 6.4 这场战争是 Iceberg vs Delta 的延伸

- Snowflake 推 Polaris + 收 Iceberg 创始团队(Tabular 2024 被 Databricks 抢走,反过来 Snowflake 自建)
- Databricks 推 Unity + Delta(UniForm 输出 Iceberg)
- AWS / Azure / GCP:都支持 Iceberg REST Catalog

**未来 2-3 年 Catalog 之战是 Lakehouse 时代的关键战役**——谁占了 Catalog,谁就抢到了治理这一层。

---

## 七、Iceberg REST Catalog:协议层而非实现

### 7.1 关键洞察

REST Catalog 不是一个 Catalog 实现,而是**一个 HTTP REST API 协议**:

```
GET /v1/namespaces                  列命名空间
POST /v1/namespaces                  创建命名空间
GET /v1/namespaces/{ns}/tables       列表
POST /v1/namespaces/{ns}/tables       创建表
GET /v1/namespaces/{ns}/tables/{t}/metadata  取 metadata 路径
POST /v1/namespaces/{ns}/tables/{t}/metadata 更新 metadata(CAS)
...
```

Iceberg 1.0+ 标准化了这套 API。

### 7.2 谁实现 REST API

- **Polaris**(Snowflake)
- **Nessie**(Dremio)
- **Tabular**(已被 Databricks 收购)
- **Unity Catalog**(部分 REST 兼容)
- **AWS Glue**(2024 加入 REST API)
- 自部署的开源 REST Catalog 实现

### 7.3 工程价值

```
应用 / 引擎              Catalog 实现
─────────────             ─────────────
Spark / Trino / Flink ──→ 任何实现 REST API 的 Catalog
DuckDB / Snowflake                ↑
                                  必须遵循同一套 REST 协议
                                  实现细节(后端 DB / 存储)隐藏
```

**任何引擎实现一次 REST 客户端,任何 Catalog 实现一次 REST 服务端,N×M 集成变成 N+M**。这是 Iceberg 拉开领先的根本。

---

## 八、五家选型决策树

```
你在 Databricks
  → Unity Catalog(强治理 + 平台一等公民)
  
你在 AWS,且要简单托管
  → Glue Catalog(默认)
  → 或 Polaris(2024 GA,跨云)

你在 Snowflake 或想跨云中立
  → Polaris

你想要数据 Git 风格分支 / merge
  → Nessie

你已有大量 HMS 投资,迁移成本高
  → 继续 HMS,新表增量上 Iceberg + REST Catalog

你是中小公司,起步阶段
  → 直接 REST Catalog(开源实现 + 托管 SaaS 二选一)
```

---

## 九、Catalog 之外:DataHub / Amundsen / Atlas

Catalog(表名 + 元数据 + 权限)≠ 数据治理目录(业务文档 + 血缘 + 搜索 + 评分)。这是两个层次:

```
Catalog                      Data Catalog(数据治理目录)
───────────                  ──────────────────────────
Glue / Unity / Polaris       DataHub / Amundsen / Atlas / Collibra
                             
表名 → 元数据 + 权限          搜索表 + 业务文档
引擎查表时使用                 人查表时使用
                             血缘 + 评分 + 文档 + Owner
```

### 9.1 DataHub(LinkedIn 开源,2020)

- Java/Python,Web UI
- 自动从 Airflow / dbt / Snowflake / Spark / Kafka 抽元数据
- 血缘自动生成
- 业务术语表(Business Glossary)
- 搜索

### 9.2 Amundsen(Lyft 开源)

- 主打「数据资产搜索」
- 类似 DataHub 但更轻

### 9.3 Apache Atlas

- Hadoop 系老牌
- Hortonworks 推过,现在维护偏冷

### 9.4 Collibra / Alation(商业)

- 企业级数据目录 + 治理 + 合规
- 大企业用

---

## 十、Catalog 工程最佳实践

### 10.1 命名规范

```
catalog.namespace.table

prod.shop.orders          ← 生产数据
dev.shop_alice.orders     ← 个人开发
staging.shop.orders       ← 预发
```

**namespace 必须有规则**,否则一年后表满天飞,搜索都搜不到。

### 10.2 权限模型

- 默认拒绝
- Group 而非个人
- 用 IAM / OIDC 集成,别自建用户系统
- 行级 / 列级权限按敏感度

### 10.3 元数据补全

- Owner、Slack 频道、Wiki 必填
- 字段描述、字段语义、单位
- SLA(新鲜度、可用性)
- 上下游血缘

不强制 → 半年后又是数据沼泽。

### 10.4 灾备

- Catalog 后端 DB 备份
- HA 部署
- 演练过 Catalog 完全挂的场景(几乎所有引擎读表都依赖 Catalog)

---

## 十一、看完这一篇,你应该能

- 解释 Catalog 在 Lakehouse 里干什么(表名 → metadata + 权限 + 血缘)
- 在白板上画 HMS 的死结(单点 + list 慢 + 不支持现代特性)
- 知道 Glue / Nessie / Unity / Polaris 各自的杀手锏和绑定
- 看到 Iceberg REST Catalog 第一反应是「协议而非实现」
- 区分 Catalog(引擎查表)和 Data Catalog(人查表 + 治理)
- 给团队建议:命名规范、权限 Group 化、Owner 必填、HA 部署

下一篇:**12 Spark 心智** — 进入第三层批处理。Spark 凭什么干掉 MapReduce 还活了十几年?三套 API、Catalyst 优化器、Tungsten 执行引擎是它的三件套。
