# 多租户 SaaS 架构

做 toC 项目你只伺候一群"用户"——所有人共用同一套数据。**做 SaaS 你伺候一群"租户"**——每个租户(企业客户)有自己的用户、数据、配置,**互相必须看不见**。

这是个看似简单但暗坑遍布的命题。一行 SQL 写错就是"A 公司看到 B 公司订单"——这种事故 99% 会让你失去客户。

---

## 一、租户(Tenant)的三种隔离策略

```
   完全独立部署 ◀─────────────────────▶ 完全共享
   ║                                            ║
   各租户独立 K8s 集群 / 独立 DB              共享一切,租户 ID 字段区分
   成本最高,隔离最强                           成本最低,隔离最弱
```

| 策略 | 数据库 | 应用 | 适用 |
| --- | --- | --- | --- |
| **Silo(独栋)** | 每租户独立实例 | 每租户独立服务 | 大客户、强合规、私有化部署 |
| **Bridge(共享应用 + 独立 DB/Schema)** | 每租户独立 DB 或 Schema | 共享应用,按租户连不同 DB | 中型 SaaS,需要数据分离 |
| **Pool(共享一切)** | 共享 DB,按 tenant_id 区分行 | 共享应用 | 中小客户、起步阶段 |
| **混合** | 大客户 Silo / 小客户 Pool | 同一套应用 | 现实大部分 SaaS |

> 经验法则:**先 Pool 起步,大客户出现时按需 Silo**。一上来就 Silo 是给自己挖坑——客户少时浪费资源,客户多时运维爆炸。

---

## 二、Pool 模式:行级隔离

最常见、最便宜、最容易踩坑。**每张表加 `tenant_id`**,所有查询都得带。

```sql
CREATE TABLE orders (
  id          BIGINT PRIMARY KEY,
  tenant_id   VARCHAR(32) NOT NULL,
  user_id     VARCHAR(32) NOT NULL,
  amount      DECIMAL(10,2),
  status      VARCHAR(16),
  ...
  INDEX idx_tenant_user (tenant_id, user_id)   -- 索引第一个字段必须是 tenant_id
);
```

**所有查询第一个 WHERE 条件就是 tenant_id**:

```sql
SELECT * FROM orders WHERE tenant_id = 'acme' AND user_id = 'u1';
UPDATE orders SET status = 'PAID' WHERE tenant_id = 'acme' AND id = 100;
```

**核心问题**:全靠业务代码自觉——**漏一次就跨租户**。

---

## 三、租户上下文怎么贯穿

每个请求进来,先识别租户,然后**整个请求生命周期内"租户上下文"都能拿到**。

### 1. 识别租户

| 来源 | 适合 |
| --- | --- |
| **子域名** `acme.app.com` | 最常见,SEO 友好 |
| **路径** `/acme/orders` | 简单,但 URL 不优雅 |
| **JWT 里的 tenant claim** | API 化 SaaS 标配 |
| **Header** `X-Tenant-Id` | 内部服务调用 |

```java
@Component
public class TenantResolver implements WebFilter {
    @Override
    public Mono<Void> filter(ServerWebExchange ex, WebFilterChain chain) {
        String host = ex.getRequest().getURI().getHost();
        String tenant = host.split("\\.")[0];     // acme.app.com → acme
        TenantContext.set(tenant);
        return chain.filter(ex)
            .doFinally(s -> TenantContext.clear());   // ⚠️ 必须 clear
    }
}
```

### 2. 上下文存哪里

```java
public class TenantContext {
    private static final ThreadLocal<String> TENANT = new ThreadLocal<>();
    public static void set(String t) { TENANT.set(t); }
    public static String get() {
        String t = TENANT.get();
        if (t == null) throw new IllegalStateException("Tenant not set");
        return t;
    }
    public static void clear() { TENANT.remove(); }
}
```

**虚拟线程时代**:用 Java 21 的 `ScopedValue`(代替 ThreadLocal),或带租户 ID 当方法参数显式传。

```java
// Java 21+
private static final ScopedValue<String> TENANT = ScopedValue.newInstance();
ScopedValue.where(TENANT, "acme").run(() -> service.find(id));
```

> 经验法则:**ThreadLocal + 异步 / 跨线程 = 必丢上下文**。CompletableFuture 提交、@Async、消息消费——都得手动把租户透传过去,别忘了。

### 3. 异步透传

```java
public class TenantTaskDecorator implements TaskDecorator {
    public Runnable decorate(Runnable r) {
        String tenant = TenantContext.get();
        return () -> {
            TenantContext.set(tenant);
            try { r.run(); } finally { TenantContext.clear(); }
        };
    }
}

@Bean
public ThreadPoolTaskExecutor executor() {
    var ex = new ThreadPoolTaskExecutor();
    ex.setTaskDecorator(new TenantTaskDecorator());
    return ex;
}
```

---

## 四、自动加 tenant_id:别让业务代码自觉

业务代码每条 SQL 都写 tenant_id?**人是会犯错的**。技术手段强制兜底。

### 方案 1:MyBatis 拦截器 / Hibernate Filter

```java
// Hibernate @Filter 自动注入条件
@Entity
@FilterDef(name = "tenant", parameters = @ParamDef(name = "tid", type = String.class))
@Filter(name = "tenant", condition = "tenant_id = :tid")
public class Order { ... }

// 启用 Filter
@PersistenceContext EntityManager em;

@PostConstruct
void enable() {
    em.unwrap(Session.class).enableFilter("tenant")
        .setParameter("tid", TenantContext.get());
}
```

### 方案 2:MyBatis-Plus 多租户插件

```java
@Bean
public MybatisPlusInterceptor mp() {
    var i = new MybatisPlusInterceptor();
    i.addInnerInterceptor(new TenantLineInnerInterceptor(new TenantLineHandler() {
        public Expression getTenantId() { return new StringValue(TenantContext.get()); }
        public String getTenantIdColumn() { return "tenant_id"; }
        public boolean ignoreTable(String t) { return "sys_config".equals(t); }
    }));
    return i;
}
```

**SQL 自动改写**:`SELECT * FROM orders` → `SELECT * FROM orders WHERE tenant_id = 'acme'`。

### 方案 3:PostgreSQL 行级安全(RLS,最强)

PostgreSQL 原生支持 **Row Level Security**,数据库层强制:

```sql
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON orders
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant'));

-- 应用每次连上后设当前租户
SET app.current_tenant = 'acme';
```

之后即便业务代码忘加 WHERE,**数据库自己拒绝跨租户**。**RLS 是 SaaS 隔离的银弹**——多了一层 DBA 兜底,业务代码 bug 兜得住。

> 经验法则:**用 PostgreSQL + RLS 是 Pool 模式最稳的姿势**。MySQL 没有 RLS,只能靠 ORM 拦截器,不如 PG 安全。

---

## 五、Bridge 模式:每租户独立 DB / Schema

更隔离一档:**每租户独立 schema 或 database**。

### 一个数据库 + 多 Schema(PostgreSQL)

```sql
CREATE SCHEMA tenant_acme;
CREATE TABLE tenant_acme.orders (...);

CREATE SCHEMA tenant_globex;
CREATE TABLE tenant_globex.orders (...);
```

应用每次连上,设 `search_path = 'tenant_acme'`,后续 SQL 直接 `SELECT * FROM orders` 自动定位到该 schema。

### 一个 RDS 实例 + 多 Database

每租户一个独立 database。**Hibernate 的 MultiTenancy 模式**:

```java
public class TenantConnectionProvider extends AbstractDataSourceBasedMultiTenantConnectionProviderImpl {
    Map<String, DataSource> dsByTenant;

    @Override
    protected DataSource selectDataSource(String tenantId) {
        return dsByTenant.get(tenantId);    // 按租户挑数据源
    }
}
```

### 优劣

| 维度 | 优势 | 劣势 |
| --- | --- | --- |
| 数据隔离 | 强,跨租户彻底不可能 | - |
| 备份恢复 | 可单独备份单租户 | 备份脚本变复杂 |
| 跨租户聚合 | 麻烦(要 union 几百个表) | - |
| Schema 演进 | **每租户都要 migrate**,N 倍工作 | - |
| 资源开销 | 连接数 / 缓存碎片化 | 大 |

> 经验法则:**Bridge 模式适合"中型客户、要求数据物理分离"**。一旦租户 > 200,Schema migrate 就是噩梦——必须做工具化批量迁移,见下文。

---

## 六、Schema 演进:多租户的最大痛点

```
v1 → v2:加一列 phone
   Pool 模式:一条 ALTER TABLE,完事
   Bridge 模式:对 N 个 schema 各执行一次 ALTER
```

工具化是必须:

```bash
# Flyway / Liquibase 多租户用法
for tenant in $(list_tenants); do
    flyway -url=jdbc:postgresql://... -schemas=tenant_${tenant} migrate
done
```

**版本一致性问题**:有的租户 migrate 失败、有的成功,**应用代码需兼容多版本 schema**——这是 SaaS 灰度发布的核心难题。

> 经验法则:**Schema 变更必须"先扩后缩"**——先加新列(可空 / 默认值)→ 双写双读 → 切流量 → 删旧列。**不允许"破坏性 ALTER"** 一刀切。

---

## 七、租户配置:每个租户都有自己的"小天地"

SaaS 的核心价值之一是**租户可配置**:

```
acme 租户:
  - 自己的 logo / 主题色
  - 启用功能模块:订单 / 营销 / 但不启用 BI
  - 自定义字段:订单加一个"内部备注"列
  - 流程定制:审批流是 1 级 vs 3 级
  - 自己的接入凭证:支付商户号、第三方 API key
```

实现层面:

| 配置类型 | 存哪 |
| --- | --- |
| 简单开关 / 主题 | tenant_config 表 |
| 复杂表单 / DSL | JSONB 字段 |
| 自定义字段(EAV) | 字段表 + 值表 |
| 流程编排 | BPMN(Camunda 等) |
| 集成密钥 | 密钥管理服务(Vault / KMS) |

```sql
CREATE TABLE tenant_config (
  tenant_id   VARCHAR PRIMARY KEY,
  features    JSONB,        -- {"orders": true, "marketing": false}
  branding    JSONB,        -- {"logoUrl": "...", "theme": "dark"}
  integrations JSONB        -- 密钥指向 Vault path
);
```

> 经验法则:**配置驱动 > 代码分支**。"如果是 acme 走这条路径"这种 if-else 几个就够了,五个就成屎山——把所有差异收敛到 tenant_config 表。

---

## 八、计量 / 计费(SaaS 的命根)

每个租户用了多少资源?要按量计费、按席位收费、按调用次数?

### 计量数据采集

```
所有请求 → 记录 metering_event 流水
   ├─ tenantId
   ├─ resource(api / storage / users)
   ├─ amount
   └─ ts

每天 ETL 汇总 → 月底出账单
```

```java
@Around("...")
public Object meter(ProceedingJoinPoint pjp) {
    long start = System.nanoTime();
    Object r = pjp.proceed();
    meteringClient.record(MeterEvent.builder()
        .tenantId(TenantContext.get())
        .resource("api.call")
        .quantity(1)
        .latencyMs((System.nanoTime() - start) / 1_000_000)
        .build());
    return r;
}
```

存储推荐 ClickHouse / Druid 这种 OLAP 列存,**几十亿条计量数据查得动**。

### 计费模型

| 模型 | 说明 | 例 |
| --- | --- | --- |
| **席位制** | 按用户数 | 每人 50/月 |
| **用量制** | 按调用 / 存储 | $0.01 / api call |
| **分级** | 月费 + 超出按量 | $99 含 1 万次 + 超出 $0.005 |
| **企业定制** | 单签合同 | 大客户必走 |

---

## 九、租户级监控与限流

```
监控按 tenant 维度看:
  - 每个租户的 QPS / 延迟 / 错误率
  - 资源占用 top 10 租户
  - 异常租户(突发暴增、攻击)

限流按 tenant 维度做:
  - acme 限 1000 QPS,超出 429
  - 防止某个租户的 bug 把整个 SaaS 拖崩
```

```java
// Sentinel 按租户限流
@SentinelResource(value = "api", blockHandler = "blocked")
public Result invoke(Req r) { ... }

// 配置:每个 tenant 各自 1000 QPS
ParamFlowRule rule = new ParamFlowRule("api")
    .setParamIdx(0)              // 第 0 个参数是 tenantId
    .setCount(1000)
    .setGrade(RuleConstant.FLOW_GRADE_QPS);
```

> 经验法则:**SaaS 的隔离不止数据,还有"性能隔离"**——一个租户暴增不能影响别人。资源池(连接池、线程池、缓存配额)按租户分组。

---

## 十、客户大了怎么"独立化"(Silo 渐进)

```
  租户少 → Pool(共享一切)
  租户多 + 出现"大客户" → 大客户拉单独 K8s namespace + 独立 DB
  关键金融客户 / 私有化部署 → 完全独立环境
```

这种渐进迁移叫 **"Tenant Promotion"**——同一份代码,部署形态不同。

实现关键:**应用代码完全不感知"我是部署在哪个 namespace 里"**——配置驱动,DB 连接、对象存储 bucket、缓存前缀都通过环境变量。

---

## 十一、跨租户的特殊场景

### 1. 平台运营后台

平台员工要看所有租户数据,**单独的 super_admin 角色 + 切换租户上下文**:

```java
@PreAuthorize("hasRole('SUPER_ADMIN')")
public Object viewAsTenant(String tenantId, ...) {
    TenantContext.set(tenantId);
    try { ... } finally { TenantContext.clear(); }
}
```

**操作日志必须严格审计**——谁在什么时候以哪个租户身份操作了什么。

### 2. 跨租户的 Marketplace

允许租户 A 把商品上架给租户 B 买?这种"跨租户业务"要专门设计:

- 引入"中间表"——marketplace_listing 不属于任何租户
- 数据所有权清晰——卖家数据归 A,订单数据归 B,中间靠合同对账

### 3. 数据导出 / 数据归属

合同到期客户走人,**必须支持"导出我所有数据"**——GDPR / SOC 2 都要求。

---

## 十二、常见踩坑

1. **忘加 tenant_id 条件**:跨租户数据泄露,**SaaS 一票否决级别事故**
2. **索引第一个字段不是 tenant_id**:某个租户大,查询全表扫
3. **ThreadLocal 没 clear**:线程池下一个请求复用,**B 租户用户看到 A 租户数据**
4. **MQ 消费没透传 tenant**:消费时拿不到租户上下文
5. **缓存 key 没带 tenant_id**:`product:1` 在两个租户之间共享了
6. **Schema 演进不兼容**:某次 ALTER 漏了几个租户的 schema
7. **资源没按租户限流**:大客户突发把整个集群拖崩
8. **计量数据存 MySQL**:几亿条之后查不动
9. **租户配置硬编码 if-else**:接十个客户改十次代码
10. **审计日志缺租户维度**:出事查不到"哪个租户哪个用户做的"
11. **跨租户聚合查询用 union 一百张表**:DBA 哭
12. **Silo 模式后才意识到部署成本**:十几个租户起独立 DB 实例,$$$
13. **加密密钥跨租户共享**:一个泄密所有人完蛋
14. **删租户没真正"擦干净"**:数据残留,GDPR 投诉
15. **测试环境没 tenant 隔离**:开发互相覆盖测试数据

---

## 十三、本章 Checklist

| 项 | 说明 |
| --- | --- |
| ✅ 起步 Pool 模式,按需 Silo | 别一上来过度设计 |
| ✅ 所有表索引第一字段 tenant_id | 性能基础 |
| ✅ ORM 拦截器自动注入条件 | 别靠业务自觉 |
| ✅ PostgreSQL 上 RLS 兜底 | DB 层强制 |
| ✅ 租户上下文 + 异步透传 | ThreadLocal 必 clear |
| ✅ 缓存 key 带 tenant_id | 防跨租户 |
| ✅ 限流按租户维度 | 性能隔离 |
| ✅ 配置驱动差异化 | 不写 if-else |
| ✅ 计量数据进 OLAP | MySQL 撑不住 |
| ✅ Schema 变更先扩后缩 | 兼容多版本 |
| ✅ Schema migrate 工具化 | 多租户批量 |
| ✅ 审计日志带租户维度 | 合规必需 |
| ✅ 数据导出 / 删除支持 | GDPR / SOC2 |

---

## 小结

多租户的本质是**"一份代码、多份数据、严格隔离"**——技术不难,**纪律难**。漏一次就够上头条。

记住三件事:

1. **隔离要分层**:数据(WHERE / RLS)+ 性能(限流)+ 配置(每租户独立)+ 安全(密钥独立)
2. **Pool 起步,大客户 Silo**——别一开始就 Silo,运维成本会反噬
3. **PostgreSQL + RLS 是 SaaS 黄金组合**——MySQL 也行,但要更小心

下一章我们把 40 章的 CI/CD 推进一档——**IaC 基础设施即代码**(Terraform / Helm / Pulumi),把"环境"也变成版本化的代码。
