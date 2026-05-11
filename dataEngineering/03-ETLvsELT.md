# ETL vs ELT:同一个 T,为什么从仓外搬到了仓内

2010 年大家说 ETL,2020 年大家说 ELT,**就调换了俩字母的顺序,中间发生了什么?**——不是工具换了名,是**底层经济学变了**:对象存储一字节几分钱、MPP 仓库按秒计费、Spark on K8s 弹性扩容、dbt 让 SQL 可测试可 review——「先把数据搬进仓再说」从一个工程禁忌变成了默认选择。这一篇讲清楚 E、T、L 三步在两个时代各自的位置,以及为什么 ELT 才是 2025 年的事实标准——但**ETL 没死,在合规、脱敏、强 schema 校验场景仍然是正确选择**。

> 一句话先记住:**ETL 时代「转换在仓外」,ELT 时代「转换在仓内」**——不是 T 这一步变了,是仓的成本和能力变了:从昂贵且严格的关系仓,变成了便宜且灵活的湖仓 + MPP。dbt 的胜利就是 ELT 的胜利:**SQL 写转换 + 仓内执行 + 软件工程纪律(测试、版本、CI、血缘)**。

---

## 一、E、T、L 三步分别在做什么

```
E (Extract)    从源头取数据
                MySQL Binlog / 业务库 SELECT / 第三方 API / 日志文件 / Kafka 消息
                
T (Transform)  把原始数据变成业务可用的形态
                清洗(去重、补缺、纠错)
                标准化(单位、字段名、类型)
                关联(订单 join 用户 join 商品)
                聚合(按天 / 城市 / 类目)
                建模(维度建模、事实表)
                
L (Load)       把数据写到目标存储
                数据仓库 / 数据湖 / OLAP 引擎
```

E 和 L 是搬运工作,T 是真正产生价值的地方——**同一份原始数据,T 的方式不同,出来的结果完全不同**。

**ETL 顺序**:E → T → L  → 转换在仓外做(Spark / Informatica),只把干净结果灌进仓
**ELT 顺序**:E → L → T  → 先原样灌进仓,再用 SQL 在仓内转换

差一步顺序,工程世界完全不一样。

---

## 二、ETL 时代:为什么转换必须在仓外

### 2.1 时代背景(2000-2015)

- 数据仓库:Teradata、Oracle Exadata、IBM DB2 Warehouse,**贵到按 CPU 核数收钱**
- 仓的存储:专有格式 + 列存 + 索引,**改一行都肉疼**
- 仓的计算:跟存储绑死,扩容难、价格高
- 内存:还很贵,几十 GB 是奢侈
- 网络:跨机房带宽贵

在这种约束下,**仓的位置只够留给"最终结果"**——脏数据、临时中间表、重复计算都不能往仓里放,否则成本爆炸。

### 2.2 ETL 的工程实践

```
[源头 OLTP]                                      [数据仓库]
MySQL / Oracle / 日志                            Teradata / Oracle DW
   │                                                  ▲
   │                                                  │
   ▼                                                  │
[ETL 集群]                                            │
Informatica / DataStage / Kettle                      │
Spark / Hive (后来加入)                               │
                                                      │
   1. Extract   读源头                                │
   2. Transform 清洗、关联、聚合、建模  ─────────────┘
                整个过程在 ETL 集群完成
                只把最终干净数据灌进仓
```

**ETL 的核心代价**:
- 转换逻辑写在 Java / Python / 拖拽工具里,**SQL 之外的另一套语言**
- ETL 工具贵(Informatica / DataStage 商业 license)
- 调试困难:中间结果不在仓里,出错了不知道在哪一步炸的
- 血缘和文档全靠人维护,字段一变下游全炸
- ETL 工程师 vs 数仓工程师 vs 分析师,**三套人三套语言三套工具**

### 2.3 ETL 没死的场景

虽然 ELT 是主流,**ETL 在以下场景仍然正确**:

- **合规过滤**:PII / 信用卡号 / 医疗数据,**绝不能落到仓里**——必须在源头脱敏后再 load
- **强 schema 校验**:金融、医疗的某些数据必须先校验后入库,不允许"先入再说"
- **极大体量,转换复杂**:某些超大企业级 ETL,需要在 Spark 集群完成复杂转换才入仓
- **隔离的安全域**:跨网段、跨云的数据,只能在边界做转换后传输

**ETL 不是过时**,而是从「默认选择」变成「特定场景的工具」。

---

## 三、ELT 时代:为什么转换搬进了仓里

### 3.1 经济学反转(2015-)

三件事让 T 这一步可以放心搬进仓:

| 变化 | 影响 |
| --- | --- |
| 对象存储普及(S3 2006、广泛使用 2015+) | 存原始数据便宜到可忽略 |
| MPP 仓 / 计算存储分离(Snowflake 2014、BigQuery 2010) | 仓内算力按秒计费、可弹性扩缩 |
| Spark + 数据湖(2014+) | 湖也能当仓用,SQL 引擎(Trino)直接查 |
| dbt 2016 出现 | SQL 转换有了软件工程方法 |
| Iceberg / Delta 2018 | 湖加 ACID,变成 Lakehouse |

「先 load 再 transform」从禁忌变成了**最经济的选择**:存储便宜、计算弹性、SQL 是统一语言。

### 3.2 ELT 的工程实践

```
[源头 OLTP / 事件流]                  [数据仓库 / 湖仓]
MySQL / Kafka / API                   Snowflake / BigQuery / Iceberg
   │                                       ▲
   │                                       │
   ▼                                       │
[Extract & Load]                           │
Airbyte / Fivetran                         │
Debezium + Kafka  ─────────────────────────┤
                                           │  
                                           │  ODS(原样落仓)
                                           │     │
                                           │     ▼
                                           │  [Transform in Warehouse]
                                           │  dbt / SQL / Spark SQL
                                           │     │
                                           │     ├─→ DWD (清洗)
                                           │     ├─→ DWS (聚合)
                                           │     └─→ ADS (集市)
                                           │
                                           └─── 全部在仓内,SQL 完成
```

**几个根本变化**:

1. **数据先原样落地**(ODS / Bronze 层):无论以后怎么用,先把原始事实保留
2. **转换是 SQL**:dbt 把 `SELECT ... FROM ref('upstream_model')` 自动编译成 `CREATE TABLE / INCREMENTAL` 等
3. **中间结果留在仓里**:DWD、DWS 都是仓里的表,可被反复查询、反复 backfill
4. **血缘自动生成**:dbt 通过 `ref()` 推 DAG,改字段一键看影响面
5. **测试可写**:dbt test 内置 unique / not_null / accepted_values,质量进 CI

### 3.3 dbt 的胜利就是 ELT 的胜利

dbt 没发明新算法,它只是把**软件工程的一套(版本控制、测试、CI、Code Review、文档)** 引入了 SQL 转换层。在 ETL 时代,这一套根本做不到——因为转换不在 SQL 里,而在 Informatica 拖拽配置或者 Python 脚本里,**没法 git diff、没法单元测试、没法 PR 审查**。

```sql
-- ELT 的现代标准长这样:dbt model
-- models/marts/daily_orders.sql

{{ config(
    materialized='incremental',
    unique_key='order_date',
    on_schema_change='append_new_columns'
) }}

WITH orders AS (
    SELECT * FROM {{ ref('stg_orders') }}
    {% if is_incremental() %}
      WHERE order_date > (SELECT MAX(order_date) FROM {{ this }})
    {% endif %}
),
dim_user AS (
    SELECT * FROM {{ ref('dim_user') }}
)
SELECT
    o.order_date,
    u.province,
    COUNT(DISTINCT o.user_id) AS uv,
    SUM(o.amount) AS gmv
FROM orders o
LEFT JOIN dim_user u ON o.user_id = u.user_id
GROUP BY 1, 2
```

```yaml
# models/marts/schema.yml
models:
  - name: daily_orders
    description: 按天 × 省份的订单聚合
    columns:
      - name: order_date
        tests: [not_null]
      - name: gmv
        tests:
          - not_null
          - dbt_utils.accepted_range:
              min_value: 0
```

**这段在 ETL 时代是写不出来的**——你怎么对一个拖拽配置或者 Python 脚本写「字段必须 > 0」的 yaml 测试?dbt 让 SQL 转换有了「软件工程的形状」,从此 ELT 起飞。

dbt 详见 **25 dbt 心智**。

---

## 四、心智图:三个时代的对比

```
1995 - 2010   ETL 时代
              [源] → [ETL 集群: Informatica/DataStage] → [仓: Teradata/Oracle]
              转换在仓外,贵且封闭
              
2015 - 2025   ELT 时代
              [源] → Airbyte/Fivetran/CDC → [仓/湖: Snowflake/Iceberg] → 仓内 SQL 转换
              转换是 SQL,仓内执行,dbt 工程化
              
2025+         AI 协作时代(尚在演进)
              [源] → 自动同步 → [仓/湖] → AI 写 SQL / 半自动建模 → 语义层
              转换可能由 LLM Agent 协作生成,但 SQL 仍是中间表示
```

E 和 L 越来越自动化(Airbyte / Fivetran 是 SaaS 产品,几分钟接一个数据源);T 越来越「软件工程化」(dbt + git + CI);AI 在 T 这一步介入帮写 SQL,但**SQL 还是稳定的中间语言**。

---

## 五、ELT 的工程落地:E + L + T 三段最小骨架

### 5.1 E + L:接入

最简单的两种姿态:

```bash
# 方式一:CDC(实时,业务库)
# Debezium 监听 MySQL Binlog,写入 Kafka
# Flink 消费 Kafka 写入 Iceberg
# 详见 27 篇

# 方式二:全托管 SaaS(Airbyte / Fivetran)
# 一个连接器接 Stripe / Salesforce / Google Analytics 等
# 自动化处理 schema 演进、增量同步
airbyte init
airbyte connect --source stripe --destination snowflake
# 在 UI 里点几下,数据自动每小时同步
```

### 5.2 T:仓内转换(dbt 最小项目)

```
my_project/
├── dbt_project.yml
├── models/
│   ├── staging/
│   │   ├── stg_orders.sql       -- 字段标准化、去重
│   │   └── stg_users.sql
│   ├── intermediate/
│   │   └── int_orders_enriched.sql  -- 关联维度
│   └── marts/
│       ├── fct_daily_revenue.sql    -- 按天事实
│       └── dim_users.sql             -- 用户维度
└── tests/
    └── assert_revenue_positive.sql
```

```bash
# 跑全部转换
dbt run

# 跑测试
dbt test

# 生成血缘文档
dbt docs generate && dbt docs serve
```

**关键观察**:从源到 ADS,**没有人写 Python / Java / 拖拽工具**——全是 SQL。

### 5.3 编排(让 EL + T 周期性跑)

```python
# Airflow DAG (23 篇展开)
from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.operators.bash import BashOperator

with DAG('elt_daily', schedule='@daily') as dag:
    extract_load = PythonOperator(
        task_id='airbyte_sync',
        python_callable=trigger_airbyte_sync,
    )
    transform = BashOperator(
        task_id='dbt_run',
        bash_command='cd /opt/dbt && dbt run --select tag:daily',
    )
    test = BashOperator(
        task_id='dbt_test',
        bash_command='cd /opt/dbt && dbt test --select tag:daily',
    )
    extract_load >> transform >> test
```

**或者用 Dagster**(24 篇),把整个 EL + T 用「资产化」的方式声明,自动算依赖。

---

## 六、ELT 不是免费的

把 T 搬进仓内有代价:

### 6.1 仓内成本要管

「数据先全部灌进仓」意味着仓里有大量原始 + 中间数据,**Snowflake / BigQuery 按计算 + 存储计费,不管理就成本爆炸**:
- 每跑一次 dbt run 都在烧钱
- 重复全表扫描的 model 是头号开销
- 用 incremental materialization、partition、cluster key 压成本

### 6.2 不是所有转换都该 SQL

- 复杂正则、自然语言处理、图算法 —— SQL 写不出来或写出来慢得吓人
- ML 特征工程的某些步骤 —— Python / Spark MLlib 更合适
- 二进制 / 嵌入式数据 —— 需要专门的 UDF

dbt 1.3+ 引入 Python model(可以在 Snowpark / Databricks / BQ 跑 Python),部分缓解但没解决全部。

### 6.3 schema 演进仍然痛

- 上游加列:多数情况下 dbt 配 `on_schema_change='append_new_columns'` 自动处理
- 上游删列:依赖该列的下游 model 立刻炸
- 上游改语义(同名字段含义变了):dbt 测试可能不报警,业务侧才发现 — 这是 Data Contract 的范畴(05 篇)

### 6.4 全部走 SQL 的认知负担

不是所有数据工程师都是 SQL 高手——窗口函数、CTE、JSON 函数、地理函数、日期函数,跨仓还有方言差异。dbt adapter 提供一定抽象但不彻底。

---

## 七、ELT vs ETL vs Reverse ETL:三个 T 的位置

最近几年还出现了第三个概念:**Reverse ETL**——把数据从仓里搬回业务系统(SaaS / CRM / 营销工具)。

```
ETL          源 → 仓外转换 → 仓
ELT          源 → 仓 → 仓内转换
Reverse ETL  仓 → 业务系统(Salesforce / Mailchimp / Intercom)
```

代表工具:**Hightouch、Census**——把仓里建好的「客户细分人群」推回 CRM,营销直接用。

这构成了完整的**「Operational Analytics」** 闭环:业务数据 → 仓 → 转换 → 业务系统消费,数据不再只是给 BI 看的。

---

## 八、什么时候选 ETL,什么时候选 ELT

```
选 ETL:
- PII / 合规数据,绝不能落仓
- 严格 schema + 写前校验需求
- 已有大量 Informatica / DataStage 投资,迁移成本高
- 数据源极多源、跨网段、需要边界转换

选 ELT(默认):
- 现代数据栈起步、Greenfield 项目
- 团队有 SQL 能力,愿意接受 dbt / SQLMesh
- 仓 / 湖 已经在用 Snowflake / BigQuery / Iceberg / Databricks
- 业务变化快,中间表常需要 backfill / 改建模

混合(常见实战):
- 核心业务库 → CDC + Flink(实时 ELT,低延迟)
- 第三方 SaaS → Airbyte/Fivetran(全托管 ELT)
- 严敏感数据 → 自建 ETL(脱敏后再入仓)
```

**2025 的事实**:90% 的新数据团队默认 ELT 起步,ETL 留给特定场景。

---

## 九、看完这一篇,你应该能

- 在白板上画 E、T、L 三步,讲清 ETL 和 ELT 的根本差异
- 解释为什么 ELT 在 2015 后赢了:对象存储 + MPP 仓 + dbt
- 区分 ETL 适用的特殊场景(合规、脱敏、强校验)
- 看到 dbt 第一反应是「啊这就是 ELT 的 T」
- 知道 Reverse ETL 是数据闭环的最后一段

下一篇:**04 Lambda 与 Kappa** — 同一个业务逻辑写两遍跑两套,叫 Lambda;只写一遍流回放,叫 Kappa;**现实里大家都在用混合架构**。
