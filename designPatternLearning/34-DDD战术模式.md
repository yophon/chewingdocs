# DDD 战术模式:Entity、Value Object、Aggregate、Repository

很多人第一次接触 DDD,会把它理解成"把表换个名字叫 Entity"。结果代码里出现一堆 `UserEntity`、`OrderEntity`,里面只有字段和 getter/setter,业务规则仍然散落在 Service、Controller、定时任务和 SQL 里。最后 DDD 没有让业务更清晰,只是让名词更多。

DDD 战术模式要解决的问题是:**当业务规则本身复杂时,让模型围绕业务不变量组织,而不是围绕数据库表组织**。

---

## 一、问题:表模型不能表达业务不变量

比如订单支付,如果只看表,你可能会写:

```ts
await db.order.update({
  id: orderId,
  status: "PAID",
  paidAt: new Date(),
});
```

但真实业务规则可能是:

- 只有待支付订单才能支付.
- 已取消订单不能支付.
- 支付金额必须等于订单应付金额.
- 一个订单不能重复支付.
- 支付成功后要产生领域事件.

这些规则如果散在多个 Service 里,每个入口都要记得写一遍。稳定点是"订单生命周期的不变量",变化点是入口、存储、支付渠道和后续通知。DDD 战术模式会把不变量放回模型内部。

---

## 二、模式:几个核心战术概念

### 2.1 Entity:有身份,会变化

Entity 的核心是身份,不是字段。订单的状态、金额、收货地址可能变化,但订单 ID 不变。

```ts
class Order {
  private status: "PENDING" | "PAID" | "CANCELED" = "PENDING";
  private events: DomainEvent[] = [];

  constructor(
    public readonly id: string,
    private totalAmount: Money,
  ) {}

  pay(amount: Money) {
    if (this.status !== "PENDING") throw new Error("order cannot be paid");
    if (!this.totalAmount.equals(amount)) throw new Error("amount mismatch");

    this.status = "PAID";
    this.events.push({ type: "OrderPaid", orderId: this.id });
  }

  pullEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }
}
```

### 2.2 Value Object:无身份,靠值相等

金额、地址、时间范围、坐标常常适合做 Value Object。它们的重点是不变量和不可变。

```ts
class Money {
  constructor(
    public readonly amount: number,
    public readonly currency: string,
  ) {
    if (amount < 0) throw new Error("money cannot be negative");
  }

  equals(other: Money) {
    return this.amount === other.amount && this.currency === other.currency;
  }
}
```

### 2.3 Aggregate:一致性边界

Aggregate 是一组对象的一致性边界,外部只能通过聚合根修改内部状态。

```text
Order(Aggregate Root)
  |
  +-- OrderItem
  +-- ShippingAddress(Value Object)
```

订单明细不能被外部随便改,必须通过 `Order.addItem()`、`Order.changeAddress()` 这类方法维护总价、状态、库存预占等不变量。

### 2.4 Repository:按聚合保存和加载

Repository 不是 DAO 的换名。它的对象应该是聚合,不是任意表行。

```ts
interface OrderRepository {
  findById(id: string): Promise<Order | null>;
  save(order: Order): Promise<void>;
}
```

应用服务负责用例编排:

```ts
class PayOrderUseCase {
  constructor(private orders: OrderRepository) {}

  async execute(orderId: string, amount: Money) {
    const order = await this.orders.findById(orderId);
    if (!order) throw new Error("not found");

    order.pay(amount);
    await this.orders.save(order);
  }
}
```

---

## 三、落地判断:什么时候 DDD 战术模式有价值

DDD 战术模式适合业务规则多、不变量重要、概念需要团队统一语言的地方。典型场景:

- 订单、合同、账户、库存、计费、审批流.
- 同一个业务动作有多个入口,比如 API、MQ、后台任务.
- 错误不是技术错误,而是业务状态错误.
- 规则经常被产品、运营、财务、法务一起讨论.

不适合的场景:

- 纯报表查询.
- 简单后台管理 CRUD.
- 数据同步、ETL、日志采集.
- 主要复杂度在性能和基础设施,不在业务规则.

DDD 和分层、六边形、Clean Architecture 可以配合。常见组合是:

```text
Controller -> UseCase -> Aggregate -> Repository Port -> DB Adapter
```

DDD 提供领域建模方式;Clean Architecture 或六边形提供依赖方向;分层架构提供基本代码组织。

---

## 四、代价与误用

DDD 的代价是建模成本。你需要和业务方反复确认概念,需要为对象设计行为,需要处理 ORM 映射和领域对象之间的距离。它不是最快写 CRUD 的方式。

常见误用之一是"表驱动 Entity"。数据库有 `order` 表,代码就有 `OrderEntity`;数据库有 `order_item` 表,代码就有 `OrderItemEntity`。这不一定错,但如果对象没有行为,DDD 没有真正发生。

常见误用之二是聚合过大。有人把用户、订单、支付、物流全塞进一个大聚合,希望一次事务解决所有一致性问题。结果并发差、锁冲突多、加载成本高。聚合边界应该围绕强一致不变量,不是围绕"业务上有关联"。

常见误用之三是到处发领域事件。领域事件应该表达已经发生的业务事实,比如 `OrderPaid`、`ContractSigned`,不是技术动作 `SendEmailRequested`。

---

## 五、与前端模式的边界

DDD 战术模式是业务建模方法,主要服务于领域规则复杂的应用核心。前端组件模式关心的是 UI 拆分和复用,单向数据流关心状态更新路径,响应式模式关心依赖自动传播。前端可以有领域对象,但不要把每个按钮、表单项、组件状态都建成 Entity 或 Aggregate。

简单判断:如果你讨论的是"这个业务概念如何保持不变量",偏 DDD;如果你讨论的是"这个界面状态如何传给组件并触发渲染",偏前端模式。

---

## 一句话总结

DDD 战术模式用 Entity、Value Object、Aggregate 和 Repository 把业务不变量收回模型内部,适合规则复杂的核心域,但用在简单 CRUD 上通常只是增加名词和映射成本。
