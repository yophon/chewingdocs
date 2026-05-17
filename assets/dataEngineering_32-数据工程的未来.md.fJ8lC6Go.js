import{_ as s,H as n,f as p,i as e}from"./chunks/framework.BHvCMIhP.js";const u=JSON.parse('{"title":"数据工程的未来:开放表格式收敛、计算存储分离、AI 改写数据栈","description":"","frontmatter":{},"headers":[],"relativePath":"../dataEngineering/32-数据工程的未来.md","filePath":"../dataEngineering/32-数据工程的未来.md","lastUpdated":1778574438000}'),l={name:"../dataEngineering/32-数据工程的未来.md"};function i(t,a,o,c,r,h){return n(),p("div",null,[...a[0]||(a[0]=[e(`<h1 id="数据工程的未来-开放表格式收敛、计算存储分离、ai-改写数据栈" tabindex="-1">数据工程的未来:开放表格式收敛、计算存储分离、AI 改写数据栈 <a class="header-anchor" href="#数据工程的未来-开放表格式收敛、计算存储分离、ai-改写数据栈" aria-label="Permalink to &quot;数据工程的未来:开放表格式收敛、计算存储分离、AI 改写数据栈&quot;">​</a></h1><p>写到这里,<strong>第 32 篇,系列收尾</strong>。回到 01 篇画的「现代数据栈一张图」——你应该已经能在白板上把每一层填满了:<strong>对象存储 + Iceberg + Spark/Flink/Trino + Airflow/Dagster + dbt + 向量库 + 特征平台</strong>。但 2025 不是终点,<strong>这套栈正在被新的力量重塑</strong>:Iceberg 收编 Delta、Snowflake 推 Polaris、Databricks 收 Tabular、Rust 重写一切、Long Context LLM 挤压 RAG、Reverse ETL 闭环、Data Mesh 走向产品化。这一篇收口讲未来 2-3 年正在发生的事,以及哪些不会发生。</p><blockquote><p>一句话先记住:<strong>未来 2-3 年的主线</strong>——开放表格式之争事实收敛(<strong>Iceberg 赢一半,Delta UniForm 抢一半</strong>)、计算存储分离极致化、AI 协助生成 SQL / dbt model、Rust 引擎追上 JVM、<strong>特征平台 + RAG 管道</strong> 是 AI 工程化的入口。<strong>SQL + dbt + Iceberg + Spark/Flink 是稳定底座</strong>,这五样未来几年仍然是骨架。</p></blockquote><hr><h2 id="一、开放表格式之争收敛" tabindex="-1">一、开放表格式之争收敛 <a class="header-anchor" href="#一、开放表格式之争收敛" aria-label="Permalink to &quot;一、开放表格式之争收敛&quot;">​</a></h2><h3 id="_1-1-三家格局变了" tabindex="-1">1.1 三家格局变了 <a class="header-anchor" href="#_1-1-三家格局变了" aria-label="Permalink to &quot;1.1 三家格局变了&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>2018-2023:    Iceberg / Hudi / Delta 三足鼎立</span></span>
<span class="line"><span>              三家各做各的 metadata 层</span></span>
<span class="line"><span>              </span></span>
<span class="line"><span>2024:        Databricks 出 UniForm:写 Delta 同时输出 Iceberg metadata</span></span>
<span class="line"><span>              Snowflake 开源 Polaris(Iceberg REST Catalog)</span></span>
<span class="line"><span>              Apache XTable 跨格式翻译</span></span>
<span class="line"><span>              </span></span>
<span class="line"><span>2025+:       事实上 Iceberg metadata 成为读端标准</span></span>
<span class="line"><span>              写端按场景选:Hudi(upsert)/ Delta(Databricks)/ Iceberg(中立)</span></span></code></pre></div><h3 id="_1-2-商业战的延伸" tabindex="-1">1.2 商业战的延伸 <a class="header-anchor" href="#_1-2-商业战的延伸" aria-label="Permalink to &quot;1.2 商业战的延伸&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Snowflake:  推 Polaris(Iceberg)+ 全力开放</span></span>
<span class="line"><span>            收 Iceberg 创始团队失败后自建</span></span>
<span class="line"><span>            </span></span>
<span class="line"><span>Databricks: 推 Unity + Delta</span></span>
<span class="line"><span>            收 Tabular(Iceberg 创始团队)</span></span>
<span class="line"><span>            UniForm 兼顾 Iceberg</span></span>
<span class="line"><span>            </span></span>
<span class="line"><span>AWS:       S3 Tables 直接支持 Iceberg(2024 GA)</span></span>
<span class="line"><span>            Glue / Athena / Redshift 全链路 Iceberg</span></span>
<span class="line"><span>            </span></span>
<span class="line"><span>GCP:       BigLake 支持 Iceberg</span></span>
<span class="line"><span>Azure:     Fabric 支持 Iceberg</span></span></code></pre></div><p><strong>结果</strong>:<strong>Iceberg 成事实标准</strong>(读端),但<strong>写端继续分</strong>(各家擅长不同)。</p><h3 id="_1-3-影响" tabindex="-1">1.3 影响 <a class="header-anchor" href="#_1-3-影响" aria-label="Permalink to &quot;1.3 影响&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>2025 新建项目:    几乎默认 Iceberg</span></span>
<span class="line"><span>                  Catalog 选 Polaris / Glue / 自建 REST</span></span>
<span class="line"><span>                  </span></span>
<span class="line"><span>Databricks 用户:  继续 Delta + UniForm 兼容</span></span>
<span class="line"><span>                  Unity Catalog 是治理一等公民</span></span>
<span class="line"><span>                  </span></span>
<span class="line"><span>Hudi 用户:        在 CDC / upsert 场景仍有优势</span></span>
<span class="line"><span>                  Iceberg V2 + equality delete 在追赶</span></span></code></pre></div><hr><h2 id="二、计算存储分离极致化" tabindex="-1">二、计算存储分离极致化 <a class="header-anchor" href="#二、计算存储分离极致化" aria-label="Permalink to &quot;二、计算存储分离极致化&quot;">​</a></h2><h3 id="_2-1-趋势" tabindex="-1">2.1 趋势 <a class="header-anchor" href="#_2-1-趋势" aria-label="Permalink to &quot;2.1 趋势&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>2014  Snowflake:    云原生 MPP,存算分离开创</span></span>
<span class="line"><span>2018  Databricks:   Spark + S3 + Photon 同样走存算分离</span></span>
<span class="line"><span>2020+  Iceberg + 任意引擎:开源版存算分离</span></span>
<span class="line"><span>2025+  Lakehouse 标配</span></span></code></pre></div><h3 id="_2-2-终局形态" tabindex="-1">2.2 终局形态 <a class="header-anchor" href="#_2-2-终局形态" aria-label="Permalink to &quot;2.2 终局形态&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>存储:      S3 / OSS / GCS  (按 GB 付费,无限弹性)</span></span>
<span class="line"><span>表格式:    Iceberg(元数据)</span></span>
<span class="line"><span>Catalog:   Polaris / Unity / Nessie(治理 + 权限 + 血缘)</span></span>
<span class="line"><span>计算:      Spark / Flink / Trino / DuckDB / Snowflake / BigQuery</span></span>
<span class="line"><span>           按需启动 / Serverless</span></span>
<span class="line"><span>           跨引擎共享数据</span></span></code></pre></div><p><strong>核心红利</strong>:</p><ul><li>存储和计算分别按需扩</li><li>引擎可换(无锁定)</li><li>ML / SQL / Streaming / RAG 共享一份数据</li><li>跨云 / 跨 region 灵活</li></ul><hr><h2 id="三、ai-改写数据栈" tabindex="-1">三、AI 改写数据栈 <a class="header-anchor" href="#三、ai-改写数据栈" aria-label="Permalink to &quot;三、AI 改写数据栈&quot;">​</a></h2><h3 id="_3-1-text-to-sql" tabindex="-1">3.1 Text-to-SQL <a class="header-anchor" href="#_3-1-text-to-sql" aria-label="Permalink to &quot;3.1 Text-to-SQL&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>2024+:</span></span>
<span class="line"><span>  Snowflake Cortex Analyst</span></span>
<span class="line"><span>  Databricks Genie</span></span>
<span class="line"><span>  Hex Magic</span></span>
<span class="line"><span>  ...</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>体验:</span></span>
<span class="line"><span>  「过去 30 天 GMV 趋势按城市分组」</span></span>
<span class="line"><span>  → AI 自动生成 SQL → 跑 → 出图</span></span></code></pre></div><p>但<strong>生产场景仍要语义层兜底</strong>:</p><ul><li>LookML / Cube / dbt MetricFlow 定义口径</li><li>AI 只在语义层之上写 SQL,不直接看裸表</li><li>否则 AI 会编造字段、漂移口径</li></ul><h3 id="_3-2-ai-写-dbt-model" tabindex="-1">3.2 AI 写 dbt model <a class="header-anchor" href="#_3-2-ai-写-dbt-model" aria-label="Permalink to &quot;3.2 AI 写 dbt model&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>描述:      「我要一张表叫 daily_revenue,按天聚合 fct_orders 的 amount」</span></span>
<span class="line"><span>           </span></span>
<span class="line"><span>AI 生成:    </span></span>
<span class="line"><span>  - 在 models/marts/ 下创建 daily_revenue.sql</span></span>
<span class="line"><span>  - 自动加 incremental config</span></span>
<span class="line"><span>  - 自动写 schema.yml + 测试</span></span>
<span class="line"><span>  - 自动算依赖(ref)</span></span>
<span class="line"><span>  - 提 PR</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>人审:    </span></span>
<span class="line"><span>  - 看 SQL 对不对</span></span>
<span class="line"><span>  - 看测试合理</span></span>
<span class="line"><span>  - 看物化策略合适</span></span>
<span class="line"><span>  - merge</span></span></code></pre></div><p>dbt Labs / Snowflake / Databricks 都在做。<strong>人是 reviewer,AI 是 author</strong>。</p><h3 id="_3-3-agent-for-analytics" tabindex="-1">3.3 Agent for Analytics <a class="header-anchor" href="#_3-3-agent-for-analytics" aria-label="Permalink to &quot;3.3 Agent for Analytics&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>未来形态:</span></span>
<span class="line"><span>  「分析师」= 业务人 + AI Agent</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  Q: &quot;为什么本周 GMV 跌 30%?&quot;</span></span>
<span class="line"><span>  A(AI):</span></span>
<span class="line"><span>    1. 查最近 4 周 GMV → 确认下跌</span></span>
<span class="line"><span>    2. 按城市拆 → 北京掉 60%</span></span>
<span class="line"><span>    3. 按品类拆 → 数码品类掉 80%</span></span>
<span class="line"><span>    4. 按时间维度 → 周三开始掉</span></span>
<span class="line"><span>    5. 关联事件:周三发布新版本</span></span>
<span class="line"><span>    6. 检查埋点 → 数码品类点击数掉 70%(可能埋点炸了)</span></span>
<span class="line"><span>    7. 给出假设 + 验证 SQL</span></span>
<span class="line"><span>    </span></span>
<span class="line"><span>  AI 自己跑了 5 次查询、画了 3 张图、给业务结论。</span></span></code></pre></div><p>代表:Snowflake Cortex / Databricks Genie / Hex / Glean / Outerbounds。</p><h3 id="_3-4-rag-直接查仓" tabindex="-1">3.4 RAG 直接查仓 <a class="header-anchor" href="#_3-4-rag-直接查仓" aria-label="Permalink to &quot;3.4 RAG 直接查仓&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Reverse ETL + RAG:</span></span>
<span class="line"><span>  把仓里建好的 mart 表 + 业务文档 + Wiki 一起嵌入</span></span>
<span class="line"><span>  AI 客服 / 内部 Agent 可以查仓里的&quot;事实&quot;+ 文档的&quot;知识&quot;</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>代表:Lakehouse on AI、Snowflake Cortex Search、Databricks Vector Search</span></span></code></pre></div><hr><h2 id="四、rust-重写一切" tabindex="-1">四、Rust 重写一切 <a class="header-anchor" href="#四、rust-重写一切" aria-label="Permalink to &quot;四、Rust 重写一切&quot;">​</a></h2><h3 id="_4-1-趋势" tabindex="-1">4.1 趋势 <a class="header-anchor" href="#_4-1-趋势" aria-label="Permalink to &quot;4.1 趋势&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>2010s 数据生态:Java/Scala 主导(Hadoop / Spark / Flink / Kafka)</span></span>
<span class="line"><span>2020s+:      Rust 在大量底层组件崛起</span></span></code></pre></div><h3 id="_4-2-已经在生产的-rust-项目" tabindex="-1">4.2 已经在生产的 Rust 项目 <a class="header-anchor" href="#_4-2-已经在生产的-rust-项目" aria-label="Permalink to &quot;4.2 已经在生产的 Rust 项目&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Polars              DataFrame(Pandas 杀手)</span></span>
<span class="line"><span>DataFusion / Comet  Spark 向量化引擎候选</span></span>
<span class="line"><span>Vector              数据采集 / 路由(Splunk 替代)</span></span>
<span class="line"><span>GreptimeDB          时序 DB</span></span>
<span class="line"><span>Redpanda            Kafka 协议 Rust 实现</span></span>
<span class="line"><span>LanceDB             AI Lakehouse 列存</span></span>
<span class="line"><span>Lance / Vortex      新一代列存格式</span></span>
<span class="line"><span>Apache Arrow Flight Rust 实现</span></span>
<span class="line"><span>Qdrant              向量库</span></span>
<span class="line"><span>Postgres extensions(Tantivy / pg_vectorize / ...)</span></span></code></pre></div><h3 id="_4-3-为什么-rust" tabindex="-1">4.3 为什么 Rust <a class="header-anchor" href="#_4-3-为什么-rust" aria-label="Permalink to &quot;4.3 为什么 Rust&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>- 性能:跟 C/C++ 同级,比 JVM 快 1.5-3x</span></span>
<span class="line"><span>- 内存安全:GC-free,大内存场景友好</span></span>
<span class="line"><span>- 启动快:无 JVM warmup</span></span>
<span class="line"><span>- 部署简单:静态编译,单二进制</span></span>
<span class="line"><span>- 与 Arrow / Parquet 生态契合</span></span></code></pre></div><p><strong>预测</strong>:<strong>2025-2027 OSS Spark 会内置 Rust/C++ 向量化引擎</strong>(Gluten / Comet / 自研三选一)。Flink 是否会跟进未定。</p><hr><h2 id="五、流批一体的下一步-声明式实时表" tabindex="-1">五、流批一体的下一步:声明式实时表 <a class="header-anchor" href="#五、流批一体的下一步-声明式实时表" aria-label="Permalink to &quot;五、流批一体的下一步:声明式实时表&quot;">​</a></h2><h3 id="_5-1-趋势" tabindex="-1">5.1 趋势 <a class="header-anchor" href="#_5-1-趋势" aria-label="Permalink to &quot;5.1 趋势&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Flink Materialized Table (2024+):</span></span>
<span class="line"><span>  CREATE MATERIALIZED TABLE daily_summary AS SELECT ...</span></span>
<span class="line"><span>  Flink 自动决定流 / 批 / 物化策略</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>Snowflake Dynamic Table (2023):</span></span>
<span class="line"><span>  CREATE DYNAMIC TABLE ... TARGET_LAG = &#39;5 minutes&#39;</span></span>
<span class="line"><span>  Snowflake 自动维护实时表</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>Databricks Delta Live Tables:</span></span>
<span class="line"><span>  声明式管道,自动流批选择</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>SQLMesh / dbt 增量:</span></span>
<span class="line"><span>  schema-aware backfill,虚拟环境</span></span></code></pre></div><h3 id="_5-2-心智变化" tabindex="-1">5.2 心智变化 <a class="header-anchor" href="#_5-2-心智变化" aria-label="Permalink to &quot;5.2 心智变化&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>旧:     用户决定 流 vs 批,写两套代码 / 一份代码两种模式</span></span>
<span class="line"><span>新:     用户声明 &quot;我要这张表是这个 SQL 的结果,延迟 X 分钟&quot;</span></span>
<span class="line"><span>        引擎决定流 / 批 / 物化策略</span></span></code></pre></div><p><strong>「流批一体」的下一阶段:用户根本不需要操心</strong>——这是 2025+ 的方向。</p><hr><h2 id="六、reverse-etl-与-operational-analytics" tabindex="-1">六、Reverse ETL 与 Operational Analytics <a class="header-anchor" href="#六、reverse-etl-与-operational-analytics" aria-label="Permalink to &quot;六、Reverse ETL 与 Operational Analytics&quot;">​</a></h2><h3 id="_6-1-reverse-etl" tabindex="-1">6.1 Reverse ETL <a class="header-anchor" href="#_6-1-reverse-etl" aria-label="Permalink to &quot;6.1 Reverse ETL&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>仓 → SaaS / 业务系统</span></span>
<span class="line"><span>  Hightouch / Census 把 mart 表 sync 回 Salesforce / Mailchimp / Intercom</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>价值:    数据不再只是给 BI 看的,而是直接驱动业务</span></span>
<span class="line"><span>         &quot;用户分群&quot; 推回 CRM,营销直接用</span></span>
<span class="line"><span>         &quot;高价值客户&quot; 推回 Sales 工具</span></span>
<span class="line"><span>         &quot;异常风险&quot; 推回风控规则</span></span></code></pre></div><h3 id="_6-2-operational-analytics" tabindex="-1">6.2 Operational Analytics <a class="header-anchor" href="#_6-2-operational-analytics" aria-label="Permalink to &quot;6.2 Operational Analytics&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>传统 BI:    给人看(决策辅助)</span></span>
<span class="line"><span>Operational Analytics: 给系统用(自动化)</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>仓里的指标 → 触发业务动作</span></span>
<span class="line"><span>&quot;过去 1 小时 GMV 跌 30%&quot; → 触发自动调价</span></span>
<span class="line"><span>&quot;用户 5 分钟内 3 次失败登录&quot; → 触发风控</span></span></code></pre></div><hr><h2 id="七、data-mesh-走向产品化" tabindex="-1">七、Data Mesh 走向产品化 <a class="header-anchor" href="#七、data-mesh-走向产品化" aria-label="Permalink to &quot;七、Data Mesh 走向产品化&quot;">​</a></h2><h3 id="_7-1-data-mesh-2020-zhamak-dehghani-提出" tabindex="-1">7.1 Data Mesh(2020 Zhamak Dehghani 提出) <a class="header-anchor" href="#_7-1-data-mesh-2020-zhamak-dehghani-提出" aria-label="Permalink to &quot;7.1 Data Mesh(2020 Zhamak Dehghani 提出)&quot;">​</a></h3><p>核心思想:</p><ul><li>把数据所有权交还给业务团队</li><li>「<strong>Data as a product</strong>」</li><li>联邦治理 + 自助平台</li></ul><h3 id="_7-2-当下进展" tabindex="-1">7.2 当下进展 <a class="header-anchor" href="#_7-2-当下进展" aria-label="Permalink to &quot;7.2 当下进展&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>理念阶段过去,工具化阶段开始:</span></span>
<span class="line"><span>  数据合约(05 篇)         → 产品化</span></span>
<span class="line"><span>  Self-serve 平台          → Dagster / Databricks SaaS</span></span>
<span class="line"><span>  联邦权限                  → Unity / Polaris</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>但完整 Data Mesh 落地的公司仍少,小公司过度设计</span></span></code></pre></div><h3 id="_7-3-现实" tabindex="-1">7.3 现实 <a class="header-anchor" href="#_7-3-现实" aria-label="Permalink to &quot;7.3 现实&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>理论:       完全去中心化</span></span>
<span class="line"><span>现实:       80% 公司:中心化数据团队 + Mesh 思想(数据合约 + 各团队 Owner)</span></span>
<span class="line"><span>            10% 大公司:真正 Mesh</span></span>
<span class="line"><span>            10% 公司:不需要,小到不用 Mesh</span></span></code></pre></div><hr><h2 id="八、不会发生的事" tabindex="-1">八、不会发生的事 <a class="header-anchor" href="#八、不会发生的事" aria-label="Permalink to &quot;八、不会发生的事&quot;">​</a></h2><h3 id="_8-1-数据网格完全替代中央数仓" tabindex="-1">8.1 数据网格完全替代中央数仓 <a class="header-anchor" href="#_8-1-数据网格完全替代中央数仓" aria-label="Permalink to &quot;8.1 数据网格完全替代中央数仓&quot;">​</a></h3><p><strong>不会</strong>。大多数公司治理能力 / 团队规模不够,集中模式仍最实用。</p><h3 id="_8-2-lakehouse-杀死所有数据库" tabindex="-1">8.2 Lakehouse 杀死所有数据库 <a class="header-anchor" href="#_8-2-lakehouse-杀死所有数据库" aria-label="Permalink to &quot;8.2 Lakehouse 杀死所有数据库&quot;">​</a></h3><p><strong>不会</strong>。OLTP 场景仍有强需求(MySQL/PG),时序 / 图 / KV / 全文搜索专用引擎仍有价值。Lakehouse 主要替代「<strong>传统数据仓库</strong>」位置。</p><h3 id="_8-3-llm-完全自动化所有-etl" tabindex="-1">8.3 LLM 完全自动化所有 ETL <a class="header-anchor" href="#_8-3-llm-完全自动化所有-etl" aria-label="Permalink to &quot;8.3 LLM 完全自动化所有 ETL&quot;">​</a></h3><p><strong>不会(短期)</strong>。LLM 写 SQL 越来越好,但<strong>领域知识、业务口径、数据治理</strong>这些 LLM 短期内替代不了。<strong>人是 reviewer,AI 是 author</strong>。</p><h3 id="_8-4-流处理完全替代批" tabindex="-1">8.4 流处理完全替代批 <a class="header-anchor" href="#_8-4-流处理完全替代批" aria-label="Permalink to &quot;8.4 流处理完全替代批&quot;">​</a></h3><p><strong>不会</strong>。批仍在大量场景成本 / 简单度 / 调试性上胜出。<strong>混合架构是常态</strong>(04 篇)。</p><h3 id="_8-5-spark-死掉" tabindex="-1">8.5 Spark 死掉 <a class="header-anchor" href="#_8-5-spark-死掉" aria-label="Permalink to &quot;8.5 Spark 死掉&quot;">​</a></h3><p><strong>不会(短期)</strong>。Spark 在 PB 级 ETL + ML 训练场景仍主流,生态护城河深。会被向量化引擎包装(Photon / Gluten),但 API 和地位稳。</p><h3 id="_8-6-dbt-被取代" tabindex="-1">8.6 dbt 被取代 <a class="header-anchor" href="#_8-6-dbt-被取代" aria-label="Permalink to &quot;8.6 dbt 被取代&quot;">​</a></h3><p><strong>会有挑战但不会被替代</strong>。SQLMesh / dbt Cloud 各有进步,核心「<strong>SQL 工程化</strong>」思想稳定。</p><hr><h2 id="九、工程师-2025-2027-的应对" tabindex="-1">九、工程师 2025-2027 的应对 <a class="header-anchor" href="#九、工程师-2025-2027-的应对" aria-label="Permalink to &quot;九、工程师 2025-2027 的应对&quot;">​</a></h2><h3 id="_9-1-投资稳定的底座" tabindex="-1">9.1 投资稳定的底座 <a class="header-anchor" href="#_9-1-投资稳定的底座" aria-label="Permalink to &quot;9.1 投资稳定的底座&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>SQL                    永远不会过时</span></span>
<span class="line"><span>dbt                    转换工程化的事实标准</span></span>
<span class="line"><span>Iceberg                开放表格式胜出方</span></span>
<span class="line"><span>Spark                  批 ETL / ML 仍核心</span></span>
<span class="line"><span>Flink                  真流处理仍核心</span></span>
<span class="line"><span>Kafka                  事实源仍核心</span></span>
<span class="line"><span>Airflow / Dagster     编排仍核心(Dagster 涨势好)</span></span>
<span class="line"><span>PostgreSQL             单机 OLTP / 起步首选</span></span></code></pre></div><p><strong>这 8 样:每一个都不会在 5 年内被替代,投资学习 ROI 高</strong>。</p><h3 id="_9-2-关注的新方向" tabindex="-1">9.2 关注的新方向 <a class="header-anchor" href="#_9-2-关注的新方向" aria-label="Permalink to &quot;9.2 关注的新方向&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>向量库 + RAG 管道      AI 工程化的入口(28 / 29 篇)</span></span>
<span class="line"><span>特征平台              规模化 ML 必备(30 篇)</span></span>
<span class="line"><span>Agent for analytics    AI 协作工具链</span></span>
<span class="line"><span>Rust 数据栈            Polars / DuckDB / Lance / DataFusion</span></span>
<span class="line"><span>声明式实时表           Flink Materialized Table 等</span></span>
<span class="line"><span>数据合约              05 篇,治理产品化</span></span></code></pre></div><h3 id="_9-3-不要追的事" tabindex="-1">9.3 不要追的事 <a class="header-anchor" href="#_9-3-不要追的事" aria-label="Permalink to &quot;9.3 不要追的事&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>- 各种新出的&quot;Pandas 杀手&quot;(每年都有)</span></span>
<span class="line"><span>- &quot;我们独家的 XXX 引擎&quot;(大概率商业噱头)</span></span>
<span class="line"><span>- &quot;AI 自动化全部数据工程&quot;(短期不可能)</span></span>
<span class="line"><span>- &quot;区块链 + 数据&quot;(已死)</span></span>
<span class="line"><span>- 各种花式数据平台 SaaS(看背后开源协议)</span></span></code></pre></div><h3 id="_9-4-跨领域能力" tabindex="-1">9.4 跨领域能力 <a class="header-anchor" href="#_9-4-跨领域能力" aria-label="Permalink to &quot;9.4 跨领域能力&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>数据工程的天花板不再是 Spark / Flink 调优,</span></span>
<span class="line"><span>而是:</span></span>
<span class="line"><span>- 数据建模 + 业务理解(26 篇)</span></span>
<span class="line"><span>- 数据治理 + 数据合约(05 / 11 篇)</span></span>
<span class="line"><span>- AI 数据管道(RAG / 特征 / Agent)</span></span>
<span class="line"><span>- 跨团队协作 + 数据产品思维(Mesh 一部分)</span></span></code></pre></div><hr><h2 id="十、回到-01-篇-那张图填满了" tabindex="-1">十、回到 01 篇:那张图填满了 <a class="header-anchor" href="#十、回到-01-篇-那张图填满了" aria-label="Permalink to &quot;十、回到 01 篇:那张图填满了&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌──────────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│                        消费层 (Consumption)                      │</span></span>
<span class="line"><span>│   BI 报表    实时大屏    推荐召回    模型训练    RAG 检索        │</span></span>
<span class="line"><span>│  Tableau     Flink+大屏  Faiss索引   PyTorch    pgvector/Milvus  │  </span></span>
<span class="line"><span>└──────────────────────────────────────────────────────────────────┘</span></span>
<span class="line"><span>              ▲              ▲              ▲              ▲</span></span>
<span class="line"><span>              │              │              │              │</span></span>
<span class="line"><span>┌──────────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│                  服务层 / 应用层 (Serving)                       │  ← 30、28、29</span></span>
<span class="line"><span>│   语义层(dbt MetricFlow / Cube) + 在线特征(Redis/HBase)       │</span></span>
<span class="line"><span>│   + 向量库(pgvector/Milvus) + Reverse ETL(Hightouch)         │</span></span>
<span class="line"><span>└──────────────────────────────────────────────────────────────────┘</span></span>
<span class="line"><span>              ▲                                            ▲</span></span>
<span class="line"><span>              │                                            │</span></span>
<span class="line"><span>┌──────────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│                     建模层 (Modeling)                            │  ← 25、26</span></span>
<span class="line"><span>│   ADS (业务集市)  ◀──  DWS (汇总)  ◀──  DWD (明细)  ◀──  ODS    │</span></span>
<span class="line"><span>│              dbt models + Spark SQL + Iceberg 物化               │</span></span>
<span class="line"><span>└──────────────────────────────────────────────────────────────────┘</span></span>
<span class="line"><span>              ▲                                            ▲</span></span>
<span class="line"><span>              │                                            │</span></span>
<span class="line"><span>┌──────────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│                     计算层 (Compute)                             │  ← 12-16、17-22</span></span>
<span class="line"><span>│  批: Spark / Trino / DuckDB        流: Flink / Spark Streaming   │</span></span>
<span class="line"><span>│  调度 / 编排: Airflow / Dagster / Prefect                        │  ← 23、24</span></span>
<span class="line"><span>└──────────────────────────────────────────────────────────────────┘</span></span>
<span class="line"><span>              ▲                                            ▲</span></span>
<span class="line"><span>              │                                            │</span></span>
<span class="line"><span>┌──────────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│                    存储层 (Storage)                              │  ← 06-11</span></span>
<span class="line"><span>│  对象存储 (S3/OSS/GCS)  +  开放表格式 (Iceberg/Delta/Hudi)       │</span></span>
<span class="line"><span>│       +  Catalog (Glue/Nessie/Unity/Polaris)                     │</span></span>
<span class="line"><span>│  消息中枢: Kafka / Pulsar / Redpanda  (兼数据管道事实源)         │  ← 17</span></span>
<span class="line"><span>└──────────────────────────────────────────────────────────────────┘</span></span>
<span class="line"><span>              ▲                                            ▲</span></span>
<span class="line"><span>              │                                            │</span></span>
<span class="line"><span>┌──────────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│                     接入层 (Ingestion)                           │  ← 27</span></span>
<span class="line"><span>│  CDC: Debezium / Flink CDC                                       │</span></span>
<span class="line"><span>│  事件: Kafka / Pulsar  (埋点 / 业务消息)                         │</span></span>
<span class="line"><span>│  批同步: DataX / Airbyte / Fivetran  (第三方 SaaS 数据)          │</span></span>
<span class="line"><span>└──────────────────────────────────────────────────────────────────┘</span></span>
<span class="line"><span>              ▲              ▲              ▲              ▲</span></span>
<span class="line"><span>              │              │              │              │</span></span>
<span class="line"><span>┌──────────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│                       数据源 (Sources)                           │</span></span>
<span class="line"><span>│  业务库  事件埋点  日志  第三方 API  IoT 传感器  外部数据集      │</span></span>
<span class="line"><span>└──────────────────────────────────────────────────────────────────┘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>横切:     数据质量 (31) / 元数据治理 / Schema (05) / 合约 / FinOps</span></span></code></pre></div><p>每一格你都能讲清楚:<strong>上一代死在哪、这一代赢在哪、下一代往哪走</strong>。</p><hr><h2 id="十一、最后" tabindex="-1">十一、最后 <a class="header-anchor" href="#十一、最后" aria-label="Permalink to &quot;十一、最后&quot;">​</a></h2><p>数据工程在过去 15 年从「Hadoop 集群运维」变成「现代数据栈拼装」,工具更换了好几代,<strong>但核心问题始终是同一个</strong>:</p><blockquote><p><strong>怎么搭一套既能让分析师写 SQL,又能让算法跑训练,还能让产品看实时大屏,且改一个字段不导致全公司报表跳水的「数据基础设施」</strong>。</p></blockquote><p>——这是 01 篇的开头一句,放在结尾仍然成立。<strong>工具会变,问题不变;答案会变,思维方式不变</strong>。</p><p>32 篇打完,你应该能在白板前画出一家公司从埋点 / Binlog 到 BI 报表 + 推荐召回 + RAG 召回的完整数据链路——<strong>Spark / Flink / Airflow / dbt / Iceberg 不再是&quot;听过的名词&quot;,而是知道每个环节解决什么问题、什么时候上、什么时候过度设计</strong>。</p><hr><h2 id="十二、看完这一系列-你应该能" tabindex="-1">十二、看完这一系列,你应该能 <a class="header-anchor" href="#十二、看完这一系列-你应该能" aria-label="Permalink to &quot;十二、看完这一系列,你应该能&quot;">​</a></h2><p>回到 00 篇写作计划里立的那两个硬指标:</p><p><strong>指标 1</strong>:看完 06-11 + 23-27 这 11 篇,白板前讲清楚——</p><ul><li>✓ 为什么 Parquet 在分析查询能比行存快 10 倍,代价是什么(06)</li><li>✓ 为什么 Iceberg 在大公司能取代 Hive,小公司直接用 DuckDB 也行(08、16)</li><li>✓ 为什么 dbt 让 SQL 终于可以测试 / Code Review / CI,以前为什么不能(25)</li><li>✓ 为什么 Airflow 写 DAG 还能写出&quot;数据回溯&quot;的 bug,Dagster 怎么解(23、24)</li></ul><p><strong>指标 2</strong>:加上 28-32 这 5 篇,讲清楚——</p><ul><li>✓ RAG 的数据管道和传统离线特征管道有什么区别,增量更新怎么做(29、30)</li><li>✓ 为什么向量库不会替代搜索引擎,二者怎么混合(28)</li><li>✓ 为什么特征平台必须管离线和在线两边,训练-服务偏差怎么消(30)</li></ul><p><strong>这两题都能答清楚,这系列就值了</strong>——这是 00 篇里给的目标,<strong>32 篇打完,目标达成</strong>。</p>`,108)])])}const g=s(l,[["render",i]]);export{u as __pageData,g as default};
