# dbt 心智:SQL 即代码,软件工程进数仓

「写一个表名给我」「这个字段是从哪来的?」「改字段会影响哪些下游?」「这段 SQL 有测试吗?」——这些问题在 ETL 时代基本没法回答,数仓 SQL 散落在 BI 工具、Airflow shell 命令、个人 Notebook 各处,**改字段 = 祈祷不出事**。**dbt(2016)做了一件简单又关键的事:让数仓 SQL 变成代码**——可 version control、可 review、可测试、有血缘、能跑 CI。这一篇拆 dbt 的核心抽象:model、ref、test、snapshot,以及为什么它的胜利 = ELT 的胜利。

> 一句话先记住:**dbt 把"SQL 工程化"——model 是函数 / ref() 是依赖 / test 是断言 / snapshot 是 SCD2 / docs 是文档**。它没发明新算法,只是把软件工程的一套(git / 测试 / 文档 / 血缘 / CI)带进数据仓库。**dbt 不是 ETL 工具,是 T 工具**——E 和 L 由别人(Fivetran / Airbyte / CDC)做。

---

## 一、没 dbt 的世界什么样

### 1.1 数仓 SQL 散落

```
公司里的转换 SQL 现在在哪?

BI 工具(Tableau / Looker):           分析师写的几百段 SQL,版本管理无
Airflow BashOperator:                  data engineer 写的几十段 SQL
Notebook:                              个人临时实验的几百段
Excel 公式 → 导出:                      运营自己拉的
production Snowflake 的 view:          某人三年前建的,还在用
```

**改一个字段**:
- 没人知道有多少 SQL 引用了它
- 没测试,改完不知道哪里炸
- 没 review,「我跑通了」就上线
- 改成新字段,旧 SQL 默默用着旧字段几个月

### 1.2 ETL 时代的标准做法

```
Informatica / DataStage 拖拽:         不是 SQL,是配置 + 黑盒 transform
Spark Job(Scala/Python):             SQL 嵌在代码里,可以 review 但门槛高
Hive on Hue:                           分析师写完保存,version 在数据库里
```

这套东西没有「**软件工程**」的形状——**git / 测试 / 文档 / CI 都不适用**。

---

## 二、dbt 的核心抽象

### 2.1 Model:一段 SELECT + 物化策略

```sql
-- models/marts/daily_revenue.sql
{{ config(
    materialized='incremental',
    unique_key='order_date',
    on_schema_change='append_new_columns'
) }}

WITH orders AS (
    SELECT * FROM {{ ref('stg_orders') }}
    {% if is_incremental() %}
      WHERE event_time > (SELECT MAX(event_time) FROM {{ this }})
    {% endif %}
)
SELECT
    DATE_TRUNC('day', event_time) AS order_date,
    SUM(amount) AS revenue
FROM orders
GROUP BY 1
```

`dbt run` 把这个文件自动翻译成:

```sql
-- 第一次:
CREATE TABLE daily_revenue AS
SELECT DATE_TRUNC('day', event_time), SUM(amount)
FROM stg_orders
GROUP BY 1;

-- 后续(增量):
INSERT INTO daily_revenue
SELECT DATE_TRUNC('day', event_time), SUM(amount)
FROM stg_orders
WHERE event_time > (SELECT MAX(event_time) FROM daily_revenue)
GROUP BY 1;
```

**核心**:你写「SELECT」,dbt 包装成「CREATE / INSERT / MERGE / VIEW」。

### 2.2 ref():模型间引用,自动 DAG

```sql
-- models/marts/fct_orders.sql
SELECT 
    o.id, o.user_id, o.amount,
    u.province, u.segment
FROM {{ ref('stg_orders') }} o            -- 引用 stg_orders model
LEFT JOIN {{ ref('dim_users') }} u USING (user_id)
```

dbt 看到 `{{ ref('stg_orders') }}` 和 `{{ ref('dim_users') }}`:
- 自动算出依赖关系:fct_orders ← stg_orders, dim_users
- 跑 `dbt run` 时按拓扑顺序跑:stg_orders → dim_users → fct_orders
- 自动生成血缘图

**这是 dbt 最大的创新**:**SQL 里写引用,DAG 自动生成**。

### 2.3 Source:声明上游表

```yaml
# models/staging/sources.yml
version: 2

sources:
  - name: raw_shop                    # 命名空间
    database: warehouse
    schema: bronze
    tables:
      - name: orders
        description: "MySQL Binlog 实时同步过来的订单"
        loaded_at_field: ingested_at
        freshness:
          warn_after: {count: 12, period: hour}
          error_after: {count: 24, period: hour}
      - name: users
```

```sql
-- 引用 source(原始表)
SELECT * FROM {{ source('raw_shop', 'orders') }}
```

**Source 让 dbt 知道**:
- 这张表是「外部输入」(不是 dbt 自己产出的)
- 新鲜度 SLA 是什么(`dbt source freshness` 命令检查)
- 谁负责(meta 字段)

### 2.4 Test:数据质量断言

```yaml
# models/marts/schema.yml
models:
  - name: daily_revenue
    description: 按天的营收
    columns:
      - name: order_date
        tests:
          - not_null
          - unique
      - name: revenue
        tests:
          - not_null
          - dbt_utils.accepted_range:
              min_value: 0
              max_value: 100000000  # 不能 > 1 亿
```

```sql
-- 也可写单独 SQL test
-- tests/assert_revenue_positive.sql
SELECT *
FROM {{ ref('daily_revenue') }}
WHERE revenue < 0
```

`dbt test` 跑所有 test:
- 内置 generic tests:`unique` / `not_null` / `accepted_values` / `relationships`
- 包 tests:dbt-utils / dbt-expectations
- 自定义 SQL test:返回任何行 = 失败

**数据质量进 CI**,改了 model 跑测试不过 → PR 不能合。

### 2.5 Snapshot:SCD2 缓慢变化维自动跟踪

```sql
-- snapshots/dim_users_snapshot.sql
{% snapshot dim_users_snapshot %}
{{
    config(
      target_schema='snapshots',
      unique_key='user_id',
      strategy='timestamp',
      updated_at='updated_at',
    )
}}
SELECT * FROM {{ source('raw_shop', 'users') }}
{% endsnapshot %}
```

`dbt snapshot` 自动维护历史:

```sql
-- 自动生成的快照表
user_id  name    province   updated_at        dbt_valid_from   dbt_valid_to
1        Alice   Beijing    2024-01-01        2024-01-01       2024-06-01    (历史)
1        Alice   Shanghai   2024-06-01        2024-06-01       NULL          (当前)
2        Bob     Guangzhou  2024-01-01        2024-01-01       NULL          (当前)
```

**用途**:订单关联用户时取「下单时刻的用户地址」,不是当前地址(26 篇维度建模)。

### 2.6 Seed:小表用 CSV 版本管理

```csv
# seeds/country_codes.csv
country_code,country_name,region
CN,China,Asia
US,United States,North America
...
```

```bash
dbt seed   # 把 CSV 灌进仓
```

**用途**:维表小(国家代码、币种)且变化少,用 git 管理 csv 比 INSERT 语句强。

### 2.7 Macros:SQL 函数复用

```sql
-- macros/cents_to_dollars.sql
{% macro cents_to_dollars(column_name) %}
    ({{ column_name }} / 100.0)
{% endmacro %}

-- 用
SELECT {{ cents_to_dollars('amount_cents') }} AS amount_dollars FROM ...
```

---

## 三、必画图:dbt 工作流

```
开发                         CI                        生产
─────                        ────                      ─────
                             
.sql 文件                    GitHub PR                 Airflow / Dagster
   │                           │                         │
   ▼                           ▼                         ▼
dbt compile                  dbt build                 dbt run --target prod
(只生成 SQL)                 (在 ci dataset 跑)        (在 prod schema 跑)
   │                           │                         │
   ▼                           ▼                         ▼
dbt run --target dev         dbt test                  dbt test
(在 dev schema 跑)           (失败 PR 不能 merge)      dbt docs generate
   │                                                     │
   ▼                                                     ▼
本地或 dev 仓                                         BI / 下游消费
```

---

## 四、物化策略(Materializations)

dbt 提供五种主流物化:

```
view             CREATE VIEW
                 简单、零存储,但每次查询都重算
                 适合:轻量、低频查询

table            CREATE TABLE AS SELECT
                 每次 run 全表重写
                 适合:中等数据,需要查询性能

incremental      第一次 CREATE,后续 INSERT / MERGE 增量
                 适合:大事实表,每天加一天数据

ephemeral        不物化,作为 CTE 内联到下游
                 适合:轻量、被引用次数少

snapshot         SCD2 维表
                 适合:维度变化跟踪
```

### 4.1 Incremental Model 的关键

```sql
{{ config(
    materialized='incremental',
    unique_key='id',                        -- 防重 key
    incremental_strategy='merge',           -- 或 append / delete+insert
    on_schema_change='append_new_columns'    -- schema 变化处理
) }}

SELECT *
FROM {{ source('raw', 'orders') }}
{% if is_incremental() %}
  WHERE event_time > (SELECT MAX(event_time) FROM {{ this }})
{% endif %}
```

**关键陷阱**:
- 没 `unique_key` → 重跑会重复
- 时间字段选错 → 漏数据(用 ingestion_time 而非 event_time 防迟到)
- 全量重跑:`dbt run --full-refresh`

---

## 五、dbt 的命令工具链

```bash
dbt run                                # 跑所有 model
dbt run --select daily_revenue         # 跑一个 model
dbt run --select daily_revenue+        # 跑这个 model 和所有下游
dbt run --select +daily_revenue        # 跑这个 model 和所有上游
dbt run --select tag:daily             # 跑带 daily 标签的

dbt test                               # 跑所有 test
dbt test --select daily_revenue        # 测一个 model

dbt build                              # run + test 一起
dbt seed                               # 灌 CSV
dbt snapshot                           # 跑 snapshot
dbt source freshness                   # 检查 source 新鲜度

dbt compile                            # 只生成 SQL,不跑
dbt docs generate && dbt docs serve    # 生成血缘 + 文档站点
dbt run --full-refresh                 # 增量表全量重跑
```

---

## 六、谱系(Lineage)与文档

### 6.1 自动生成

```bash
dbt docs generate
dbt docs serve  # 启动 web 服务 8080,可浏览
```

Web UI 显示:
- 每个 model 的描述、列说明、tests
- 上下游依赖图(可点击跳转)
- 改字段时看影响面

### 6.2 工程价值

```
没 dbt:        改字段需要 grep 全公司 SQL,可能遗漏
有 dbt:        点击 dbt docs,直接看下游所有 model 列表
```

---

## 七、工程实践:一个最小项目结构

```
my_dbt_project/
├── dbt_project.yml          # 项目配置
├── profiles.yml             # 仓连接(放 ~/.dbt/profiles.yml)
├── packages.yml             # 第三方包
├── models/
│   ├── staging/             # ODS 层:1:1 标准化
│   │   ├── stg_orders.sql
│   │   ├── stg_users.sql
│   │   └── sources.yml
│   ├── intermediate/        # 中间层:join / 计算
│   │   └── int_orders_enriched.sql
│   └── marts/               # 集市:业务主题
│       ├── core/
│       │   ├── fct_orders.sql
│       │   └── dim_users.sql
│       └── finance/
│           └── daily_revenue.sql
├── snapshots/
│   └── dim_users_snapshot.sql
├── tests/
│   └── assert_revenue_positive.sql
├── macros/
│   └── cents_to_dollars.sql
├── seeds/
│   └── country_codes.csv
└── analyses/                # 一次性分析,不物化
    └── monthly_growth.sql
```

### 7.1 dbt_project.yml 示例

```yaml
name: shop_analytics
version: 1.0
profile: shop_prod

models:
  shop_analytics:
    staging:
      +materialized: view
      +schema: staging
    intermediate:
      +materialized: ephemeral
    marts:
      +materialized: table
      +schema: marts
      core:
        +tags: [core, daily]
      finance:
        +tags: [finance]
```

### 7.2 profiles.yml(连接配置)

```yaml
shop_prod:
  target: dev
  outputs:
    dev:
      type: snowflake
      account: xxx
      user: xxx
      password: "{{ env_var('SNOWFLAKE_PASSWORD') }}"
      database: shop_dev
      warehouse: shop_wh
      schema: dev_alice
    prod:
      type: snowflake
      account: xxx
      ...
      schema: prod
```

---

## 八、dbt 在数据栈里的位置

### 8.1 配合 ELT 链路

```
[源]  Binlog / Kafka / SaaS API
      │
      ▼  E + L (CDC / Airbyte / Fivetran)
[仓/湖]  Snowflake / Iceberg / BigQuery / Databricks
      │
      ▼  T (dbt)
ODS → DWD → DWS → ADS
      │
      ▼
[消费]  BI / 模型 / RAG / 大屏
```

dbt 只管 T,**E 和 L 是别人的事**(参考 03 ETL vs ELT)。

### 8.2 谁来跑 dbt

```
本地开发:      dbt run --target dev
CI:           dbt build(GitHub Actions)
生产调度:      Airflow / Dagster 调度 dbt run
              或 dbt Cloud
```

### 8.3 dbt + 仓的 Adapter

```
dbt-snowflake
dbt-bigquery
dbt-redshift
dbt-databricks
dbt-spark
dbt-trino
dbt-postgres
dbt-duckdb           ← 本地 / 单机起步神器
dbt-iceberg          ← 社区维护
...
```

每个仓的 SQL 方言不同,adapter 屏蔽差异。

---

## 九、dbt 不擅长的事

### 9.1 不擅长 Streaming

dbt 是「**批转换**」工具,每次 dbt run 跑一次。**没有"持续运行"概念**。

流式需求:Flink SQL / Spark Structured Streaming / SQLMesh(下面讲)。

### 9.2 不擅长 Python 转换

dbt 1.3+ 加了 Python model(在 Snowpark / Databricks / BQ 上跑 Python),但**仅限这几个仓 + 功能有限**。

Python 重度需求:Spark / Dagster + dbt 混合。

### 9.3 不擅长复杂 ML 训练

`dbt model` 没法跑 PyTorch / Scikit-learn 完整训练。**dbt 适合特征工程的 SQL 部分,真正训练交给 MLflow / Vertex AI**。

### 9.4 不擅长跨仓查询

dbt 在单个仓内跑。**跨仓 / 跨数据源用 Trino**。

### 9.5 不擅长极复杂依赖管理

几百个 model 时,dbt 的依赖 + 编译时间会变慢。dbt Cloud / `dbt parse` 优化中。

---

## 十、SQLMesh:dbt 的下一代挑战者

### 10.1 出身

2023 年 Tobiko Data 出的 SQLMesh,**核心团队来自 Apple 内部数据团队**。

### 10.2 核心改进

```
schema-aware backfill         dbt 重跑要全量重算,SQLMesh 知道字段变化,只重算受影响部分
                              
虚拟环境                       dev 环境跑改动,验证后 promote 到 prod,数据不重复
                              
真正的 incremental            dbt incremental 要手写 unique_key + 时间条件
                              SQLMesh 内置增量推断
                              
Streaming / Macro             更现代的 SQL 模板系统
跨仓 / 多 dialect              直接支持跨仓 SQL 转换
Python 真正支持               不限制平台
```

### 10.3 适用场景

- 大公司、复杂 dbt 项目想升级
- 强增量 / schema-aware 回算需求
- 多仓 / 跨仓场景

**2025 现状**:SQLMesh 在涨,但 dbt 仍然是绝对主流。

---

## 十一、dbt MetricFlow / 语义层

dbt 1.6+ 收购 MetricFlow,推出 dbt Semantic Layer:

```yaml
# semantic_models/orders.yml
semantic_models:
  - name: orders
    model: ref('fct_orders')
    entities:
      - name: order_id
        type: primary
      - name: user_id
        type: foreign
    measures:
      - name: revenue
        agg: sum
        expr: amount
    dimensions:
      - name: order_date
        type: time
        type_params:
          time_granularity: day
```

```sql
-- 用 MetricFlow 查询
SELECT * FROM {{ semantic_layer.query(
    metrics=['revenue'],
    group_by=['order_date'],
    where="order_date >= '2025-05-01'"
) }}
```

**价值**:统一指标定义,所有 BI 工具 / 模型 / API 用同一段口径。**32 篇会展开**。

---

## 十二、几个真实工程模式

### 12.1 staging / mart 分层

```sql
-- staging:1:1 标准化(改字段名、类型)
SELECT
    order_id AS id,
    customer_id AS user_id,
    amount_cents / 100.0 AS amount,
    CAST(event_time AS TIMESTAMP) AS event_time
FROM {{ source('raw_shop', 'orders') }}

-- intermediate:关联、计算(ephemeral)
WITH user_segment AS (
    SELECT user_id, segment
    FROM {{ ref('stg_users') }}
)
SELECT o.*, u.segment
FROM {{ ref('stg_orders') }} o
LEFT JOIN user_segment u USING (user_id)

-- mart:业务主题(table / incremental)
SELECT segment, DATE_TRUNC('day', event_time) AS day, SUM(amount) AS gmv
FROM {{ ref('int_orders_enriched') }}
GROUP BY 1, 2
```

### 12.2 incremental 防迟到

```sql
{{ config(
    materialized='incremental',
    unique_key='id',
    incremental_strategy='merge',
) }}

SELECT *
FROM {{ source('raw', 'orders') }}
{% if is_incremental() %}
  -- 用 ingestion_time 而非 event_time,防迟到事件漏掉
  WHERE ingestion_time > (SELECT MAX(ingestion_time) - INTERVAL '3 days' FROM {{ this }})
{% endif %}
```

### 12.3 测试分层

```yaml
columns:
  - name: amount
    tests:
      - not_null
      - dbt_utils.accepted_range:
          min_value: 0
          max_value: 1000000
      - dbt_utils.expression_is_true:
          expression: "amount * quantity = total_amount"  # 业务一致性
```

---

## 十三、看完这一篇,你应该能

- 解释 dbt 把 SQL 工程化(model / ref / test / snapshot / docs)的核心抽象
- 在白板上画 dbt model 的依赖自动推导(ref → DAG)
- 选 view / table / incremental / ephemeral / snapshot 五种物化
- 写一个 incremental model 不踩坑(unique_key / 时间字段 / 全量重跑)
- 给团队建议:dbt + Airflow / Dagster + 仓 = 现代 ELT 黄金组合
- 知道 SQLMesh / MetricFlow 是 dbt 的演进方向

下一篇:**26 数据建模** — 维度建模、星型 vs 雪花、SCD2、Data Vault。数据组织的"形状"决定了下游能跑多顺。
