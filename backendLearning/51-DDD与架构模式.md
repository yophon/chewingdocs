# 领域驱动设计与架构模式

50 章把"测试体系"讲完,意味着你已经能写出**正确的代码**;这一章告诉你怎么写出**长得对的代码**。

业务越复杂,堆 service / dao 的写法越早撞墙——所有逻辑都散在 service 里,改一个需求要翻八个类、动十张表。**DDD(领域驱动设计)** 不是"再多一种设计模式",而是把业务语言、模型、代码捏在一起的工程方法。

---

## 一、为什么贫血模型会让你迟早翻车

新手最常见的写法:

```java
// 贫血模型
class Order {
    Long id; String userId; BigDecimal amount; OrderStatus status;
    // 一堆 getter / setter,没有任何行为
}

class OrderService {
    public void pay(Long id) {
        var order = orderMapper.selectById(id);
        if (order.getStatus() == OrderStatus.PAID) throw new BizException("已支付");
        if (order.getAmount().compareTo(BigDecimal.ZERO) <= 0) throw new BizException("金额错");
        // 又一个判断
        // 又一个判断
        order.setStatus(OrderStatus.PAID);
        orderMapper.updateById(order);
    }
}
```

业务规则全堆在 service,Order 沦为"DTO + getter/setter"。结果是:

| 症状 | 后果 |
| --- | --- |
| 同一条规则散落在多个 service | 改 1 处漏 3 处 |
| 测试要 mock 一堆依赖才能验业务规则 | 测试又长又脆 |
| 新人读代码顺着 service 一路跳 | 三个月才上手 |

**充血模型**(把规则放回对象):

```java
class Order {
    private OrderStatus status;
    private BigDecimal amount;

    public void pay() {
        if (this.status == OrderStatus.PAID) throw new DomainException("已支付");
        if (this.amount.signum() <= 0) throw new DomainException("金额错");
        this.status = OrderStatus.PAID;
    }
}

class OrderService {
    public void pay(Long id) {
        var order = repo.findById(id);
        order.pay();         // 业务规则在对象里
        repo.save(order);
    }
}
```

> 经验法则:**业务规则属于"动作所属的对象"**——支付是 Order 的事,不是 OrderService 的事。Service 只是个组装入口。

---

## 二、战略设计:限界上下文(Bounded Context)

DDD 分**战略**和**战术**两层。战术(聚合、实体、仓储)很多人会;战略(限界上下文、上下文映射)更重要,**它决定你怎么拆服务**。

**限界上下文**:同一个词在不同业务里含义不同,各自有自己的模型。

```
"用户(User)"
├─ 营销上下文:User = { 标签、人群、生命周期 }
├─ 订单上下文:User = { 收货地址、会员等级、风控分 }
├─ 客服上下文:User = { 历史工单、优先级、满意度 }
└─ 财务上下文:User = { 发票抬头、纳税号、对账主体 }
```

**新手错误**:做一个"宇宙大 User"塞所有字段——结果耦合到任何业务都得动它。
**正确做法**:每个上下文有自己的 User 模型,通过 ID 引用,字段只放本上下文关心的。

> 经验法则:**一个限界上下文 = 一个微服务**(粗粒度的对应)。不知道怎么拆服务?**先画限界上下文,再决定要不要物理拆开**。上下文是"模型边界",微服务是"部署边界",前者比后者更稳定。

### 上下文映射(Context Mapping)

上下文之间一定要交互,关系常见有:

| 关系 | 含义 | 例 |
| --- | --- | --- |
| **Shared Kernel** | 共享一小块核心模型 | 用户 ID + 基本信息 |
| **Customer-Supplier** | 上游决定下游的接口 | 订单(下游)依赖支付(上游) |
| **Conformist** | 下游被迫顺应上游模型 | 接第三方 API |
| **Anticorruption Layer(ACL)** | 防腐层,翻译外部模型为本地模型 | 老系统集成必备 |
| **Open Host Service** | 上游对所有人开放统一协议 | OpenAPI / RESTful |
| **Published Language** | 标准化的交换语言 | OpenAPI / Avro / Protobuf |

```java
// ACL 防腐层示例
class LegacyUserAdapter {
    public DomainUser fetch(String id) {
        var raw = legacyApi.get(id);                 // 老系统的烂格式
        return new DomainUser(                        // 翻译成自己的领域模型
            raw.uid,
            UserLevel.from(raw.lv_code),
            new Address(raw.addr1 + raw.addr2)
        );
    }
}
```

---

## 三、战术设计:四个核心积木

```
聚合(Aggregate)
   ├─ 聚合根(Aggregate Root)←  唯一对外入口
   ├─ 实体(Entity)
   └─ 值对象(Value Object)

外加:领域服务、领域事件、仓储、工厂
```

### 1. 值对象(Value Object)

**没有身份、不可变、可比较**。Money、Address、DateRange 都是。

```java
public record Money(BigDecimal amount, Currency currency) {
    public Money {
        if (amount.signum() < 0) throw new IllegalArgumentException();
        Objects.requireNonNull(currency);
    }
    public Money plus(Money other) {
        if (!this.currency.equals(other.currency)) throw new DomainException("币种不一致");
        return new Money(this.amount.add(other.amount), currency);
    }
}
```

> 经验法则:**能写成值对象就别写成实体**。值对象是不可变的、行为内聚的,几乎不出 bug。Java 的 `record`、Kotlin 的 `data class` 天然契合。

### 2. 实体(Entity)

**有身份(ID)、可变、按 ID 相等**。Order、User、Product 都是。

### 3. 聚合根(Aggregate Root)

**一组实体的集群,只能通过聚合根访问**。

```
订单聚合:
  Order(根)
   ├─ List<OrderItem>
   ├─ ShippingAddress(值对象)
   └─ payment 状态

外部不能直接拿 OrderItem,必须 order.getItems()
```

聚合的边界就是**事务边界**:一次操作只改一个聚合,**保证强一致性**;跨聚合用最终一致(领域事件)。

```java
class Order {
    private List<OrderItem> items;
    private OrderStatus status;

    public void addItem(Product p, int qty) {
        if (status != OrderStatus.DRAFT) throw new DomainException("不能修改");
        items.add(new OrderItem(p.id(), p.price(), qty));
    }
}
```

> 经验法则:**聚合要小**。常见错误是把"用户 + 订单 + 商品"全塞一个聚合,加载一个 User 把数据库拖崩。**聚合越小,锁越细,并发越高**。

### 4. 领域服务

不属于任何一个实体的业务行为(跨多个聚合)。

```java
class TransferService {
    public void transfer(Account from, Account to, Money amount) {
        from.withdraw(amount);
        to.deposit(amount);
    }
}
```

⚠️ 不要变成"什么都往这里堆"——能放回实体的优先放实体。

### 5. 领域事件(Domain Event)

**发生过的、领域里有意义的事实**。

```java
public record OrderPaid(Long orderId, String userId, Money amount, Instant occurredAt) {}

class Order {
    private List<DomainEvent> events = new ArrayList<>();
    public void pay() { ...; events.add(new OrderPaid(id, userId, total, Instant.now())); }
    public List<DomainEvent> pullEvents() { ... }
}
```

事件用来**解耦**:订单服务发出 OrderPaid,营销/库存/物流自己订阅,**订单不知道也不该知道下游有谁**。

---

## 四、分层架构 vs 六边形 vs Clean Architecture

### 1. 经典三层(贫血)

```
Controller → Service → DAO → DB
```

简单粗暴,小项目够用,大了就变成"啥都在 Service 里"。

### 2. DDD 四层

```
┌──────────────────────────────────┐
│ Interface(Controller / RPC)     │  对外协议
├──────────────────────────────────┤
│ Application(用例编排)            │  事务边界、调度领域对象
├──────────────────────────────────┤
│ Domain(实体 / 聚合 / 领域服务)   │  ★ 业务核心,不依赖任何框架
├──────────────────────────────────┤
│ Infrastructure(仓储实现 / MQ)    │  技术细节
└──────────────────────────────────┘
```

**关键**:Domain 层**不能依赖 Spring、JPA、Jackson**——它该是纯 Java/Kotlin。

### 3. 六边形(Ports & Adapters)/ Clean Architecture

```
                    ┌────────────┐
       HTTP Adapter │            │ JPA Adapter
               ┌────►   Domain  ◄────┐
               │    │ (端口为接口)│    │
       Kafka Adapter│            │ Redis Adapter
                    └────────────┘
```

**领域定义"端口"(接口),适配器去实现**。换 DB? 换一个适配器。换框架? 不动领域。

```java
// 领域层定义端口
public interface OrderRepository {
    Order findById(Long id);
    void save(Order order);
}

// 基础设施层实现
@Repository
class JpaOrderRepository implements OrderRepository {
    @Override public Order findById(Long id) { ... }
}
```

> 经验法则:**Spring Data 的 Repository 不是"领域仓储"**——它是技术细节。真正的领域仓储是接口,放在领域层;实现放在基础设施层。

### 三种架构怎么选

| 复杂度 | 推荐 |
| --- | --- |
| CRUD 为主、几个表 | 贫血三层即可,别折腾 |
| 业务规则中等、有领域逻辑 | DDD 四层,聚合 + 仓储 |
| 复杂业务、长生命周期、多形态前端 | 六边形 / Clean,扛大重构 |

---

## 五、CQRS(读写分离)

**写**靠领域模型保证一致性;**读**靠优化好的查询模型保证性能。**两套模型,各自优化**。

```
写:Command → 领域模型 → 事务 → 写库
                              │
                              ▼
                          领域事件
                              │
                              ▼
读:Query    → 读模型 ← 投影器 ← 事件
```

```java
// 写侧:复杂的领域逻辑
@Transactional
public void handle(PlaceOrderCommand cmd) {
    var order = orderFactory.create(cmd);
    order.placeBy(cmd.userId());
    orderRepo.save(order);   // 触发 OrderPlaced 事件
}

// 读侧:扁平的查询模型,直接给前端
public List<OrderListVO> listByUser(String userId) {
    return jdbc.query("""
        SELECT o.id, o.total, o.status, u.nickname, p.title AS first_item
        FROM order_list_view o ...
        WHERE o.user_id = ?
        """, userId);
}
```

> 经验法则:**读写分离不是必须的**——什么时候上 CQRS?当**读 QPS 远高于写、读形态多变(列表/详情/榜单/聚合一堆)、写有复杂业务规则** 三个同时成立。否则它纯粹是给自己加负担。

---

## 六、Event Sourcing(事件溯源)

把"当前状态"存成"事件序列",**任何时刻都能从事件回放出状态**。

```
传统:
   表 orders: id=1, status=PAID, total=100        ←  你只看到当前状态

ES:
   events:
   - OrderCreated(id=1, items=...)
   - ItemAdded(id=1, sku=A, qty=2)
   - DiscountApplied(id=1, code=VIP, off=10)
   - OrderPaid(id=1, txId=tx-xyz)                  ←  完整生命轨迹
```

**优势**:

- 完整审计,任何时刻能回到过去
- 模型变了重放就行
- 天然契合 CQRS

**代价**:

- 重放慢,要做 snapshot
- 模型迁移困难(老事件 schema 不能动)
- 调试复杂度高一个量级

> 经验法则:**ES 适合"账本"型业务**——金融、积分、库存、审计。**绝对不适合一切**。普通 CRUD 业务上 ES 是给自己挖坑。

---

## 七、贫血 vs 充血:别走极端

**贫血派典型反应**:"DDD 太重,我项目小用不上"
**充血派典型反应**:"必须聚合 / 仓储 / 领域事件全套"

真相:**取决于业务复杂度**。

| 业务形态 | 模型选型 |
| --- | --- |
| 后台 CRUD,80% 代码就是表单转表 | 贫血即可 |
| 有 3-5 条核心规则但流程不复杂 | 充血,但不必上聚合根全套 |
| 状态机复杂,跨多个对象联动 | 完整聚合 + 领域事件 |
| 跨上下文交互密集 | 加 ACL + Open Host Service |

> 经验法则:**别为了"做 DDD"而做 DDD**。DDD 是治"复杂业务难维护"的药——没病吃药就是中毒。

---

## 八、统一语言(Ubiquitous Language)

DDD 最被低估、却最高价值的实践:**让代码、文档、产品语言一致**。

```
PM 说"作废订单"
代码里方法叫 cancel()
DBA 看表里 status = INACTIVE
开会有人说"撤单",有人说"关闭"

→ 沟通成本 ×10,bug 概率 ×10
```

**统一语言的实践**:

1. 业务建模会议拉 PM、开发、测试一起开
2. 写 **glossary**(术语表)文档
3. 代码命名严格用 glossary 里的词
4. PR review 强制检查命名一致性

> 经验法则:**业务的方法名应该 PM 一眼能看懂**。`order.cancel()` 没问题,`order.deactivateInternal2()` 是失控信号。

---

## 九、最小落地骨架

下面是个能跑的工程骨架,适合中等复杂度业务起步:

```
order-service/
├── interface/
│   ├── rest/OrderController.java
│   └── grpc/OrderRpc.java
├── application/
│   ├── command/PlaceOrderHandler.java
│   ├── query/OrderQueryService.java
│   └── port/out/  (定义端口)
├── domain/
│   ├── model/Order.java         (聚合根)
│   ├── model/OrderItem.java     (实体)
│   ├── model/Money.java         (值对象)
│   ├── event/OrderPlaced.java
│   └── service/PricingService.java
└── infrastructure/
    ├── persistence/JpaOrderRepository.java
    ├── messaging/KafkaEventPublisher.java
    └── client/PaymentApiAdapter.java
```

**依赖方向严格单向**:`infrastructure → application → domain`,不允许反向。

**用 ArchUnit 守护边界**:

```java
@Test
void domain_should_not_depend_on_infrastructure() {
    classes().that().resideInAPackage("..domain..")
        .should().onlyDependOnClassesThat().resideInAnyPackage("..domain..", "java..")
        .check(new ClassFileImporter().importPackages("com.example.order"));
}
```

> 经验法则:**架构纪律靠工具守护**,光靠 code review 守不住——三个月后必定退化。

---

## 十、和实际项目的折中

完整 DDD 的代价是:开发慢、上手慢、过度设计风险。**多数项目用"务实 DDD"**:

| 完整 DDD | 务实 DDD |
| --- | --- |
| 聚合根 + 全套实体 + 值对象 | 用充血 + 必要时 record 抽值对象 |
| 领域事件总线 + 投影 | 领域事件直接 spring publishEvent |
| CQRS + 读模型 | 写模型用 JPA、读用 SQL 直查 |
| 完整六边形 / Clean | 四层(controller/app/domain/infra) |
| Event Sourcing | 一律不用,除非账本类业务 |

落地节奏建议:

1. 先把"贫血 service"拆成"充血实体 + service 编排"
2. 引入领域事件解耦下游
3. 复杂业务再引聚合根 + 仓储抽象
4. 性能瓶颈再上 CQRS
5. 极端审计场景才上 ES

---

## 十一、常见踩坑

1. **聚合做太大**:User 聚合塞了订单、地址、消息,改地址锁全 User
2. **领域层依赖框架**:`@Entity` / `@Autowired` 跑进 Domain,六边形作废
3. **Service 当垃圾桶**:UserService 写到 5000 行,所有人改这一个文件
4. **领域事件当通信总线**:用事件传"参数",还要"等结果"——你需要的是同步 RPC 不是事件
5. **CQRS 一上就两套模型**:小业务一上来就分,维护成本暴涨
6. **Event Sourcing 模型一改全废**:老事件 schema 改不动,数据迁移噩梦
7. **限界上下文等于微服务**:粒度对不上,服务过细变分布式单体
8. **ACL 不写**:接老系统直接拿对方模型用,腐烂全渗进来
9. **聚合内强一致 + 跨聚合也想强一致**:跨聚合应该用最终一致,硬上就是分布式锁地狱
10. **Repository 暴露 Page<Entity> 给 Controller**:领域对象直接序列化出去,字段一改前端炸
11. **VO/DTO/Entity 概念乱**:全混在一个包,谁是谁看不清
12. **Anemic 也起一堆 Application Service**:DDD 的形,贫血的魂
13. **统一语言只在 PPT 里**:代码命名跟 PM 词汇差一万光年
14. **架构图画完不维护**:三个月后图和代码完全是两个项目

---

## 十二、本章 Checklist

| 项 | 说明 |
| --- | --- |
| ✅ 业务规则放对象内 | 抛弃贫血 |
| ✅ 限界上下文先于服务边界 | 模型边界比部署边界更稳定 |
| ✅ 聚合小、事务边界清晰 | 一次只改一个聚合 |
| ✅ 值对象优先 | 不可变,行为内聚 |
| ✅ 领域层不依赖框架 | 纯 Java/Kotlin |
| ✅ 领域事件解耦下游 | 不要事件等返回 |
| ✅ ACL 隔离老系统 / 三方 | 别让外部模型腐蚀进来 |
| ✅ 务实 DDD 起步 | 不一上来就 ES + CQRS |
| ✅ ArchUnit 守边界 | 工具替你查纪律 |
| ✅ 统一语言在代码里 | PM、glossary、命名一致 |

---

## 小结

DDD 的核心不是设计模式,是**思维方式的转换**:

- 从"我有什么表"换成"业务里有什么概念"
- 从"在 service 里写规则"换成"让对象自己懂规则"
- 从"一套模型走到底"换成"按上下文裁不同模型"

记住三句话:

1. **业务复杂度决定模型形态**——简单业务用 DDD 是负担,复杂业务不用 DDD 是地狱
2. **聚合是事务边界,事件是解耦边界**——选错就是分布式锁满天飞
3. **统一语言是最廉价、最高回报的实践**——一行代码不写就能减半沟通成本

下一章我们沉到 JVM 层——**SpringBoot 占了 6 章但 JVM 一章没有**,GC 调优、虚拟线程、CompletableFuture、线程池,这是 Java 后端"内功"的所在。
