# CQRS:读写模型分离,不是所有系统都需要

很多系统一开始会默认"写入用什么模型,读取也用什么模型"。这在简单 CRUD 里很自然:一张订单表,写订单也查订单。但业务增长后,写模型要保护一致性,读模型要满足各种列表、筛选、聚合、搜索、权限展示。最后一个对象既要适合写入不变量,又要适合页面查询,两边都别扭。

CQRS 要解决的问题是:**当读和写的形状、频率、约束差异很大时,把命令模型和查询模型分开**。

---

## 一、问题:同一个模型同时服务读写会变形

写入下单时,系统关心:

- 用户是否能下单.
- 库存是否可扣.
- 优惠是否可用.
- 订单状态是否从合法状态迁移.

后台订单列表关心:

- 按手机号、商品名、渠道筛选.
- 展示支付状态、物流状态、售后状态.
- 支持分页、排序、导出.
- 可能需要跨多张表 join.

如果强行用一个 `Order` 对象承载全部需求,写模型会被展示字段污染,读查询会被领域对象绕远路。变化点已经分叉:写侧变化来自业务规则,读侧变化来自页面和查询性能。

---

## 二、模式:Command 和 Query 分开

CQRS 的基本结构:

```text
Write Side
  Command -> CommandHandler -> Domain Model -> Write DB

Read Side
  Query -> QueryHandler -> Read Model -> Read DB / View / Search Index
```

最小 TypeScript 示例:

```ts
type CreateOrderCommand = {
  userId: string;
  productId: string;
  quantity: number;
};

class CreateOrderHandler {
  constructor(private orders: OrderRepository) {}

  async handle(cmd: CreateOrderCommand) {
    const order = Order.create(cmd.userId, cmd.productId, cmd.quantity);
    await this.orders.save(order);
    return order.id;
  }
}

type OrderListQuery = {
  keyword?: string;
  status?: string;
  page: number;
};

class OrderListQueryHandler {
  async handle(query: OrderListQuery) {
    return db.order_list_view.findMany({
      keyword: query.keyword,
      status: query.status,
      offset: (query.page - 1) * 20,
      limit: 20,
    });
  }
}
```

写侧可以使用 DDD 聚合保护不变量;读侧可以直接查视图、宽表、搜索引擎、缓存,不必把查询伪装成领域行为。

---

## 三、落地形态:轻量 CQRS 到重型 CQRS

CQRS 不是只有一种重量。

轻量 CQRS:

```text
同一个服务
同一个数据库
CommandHandler 和 QueryHandler 分开
读查询可以使用专用 SQL / View / DTO
```

这种适合大多数业务系统,成本低,收益明显。

中等 CQRS:

```text
同一个服务
写库和读库分开
写入后通过事件更新读模型
允许短暂延迟
```

适合读多写少、查询复杂、读性能压力明显的系统。

重型 CQRS:

```text
写服务和读服务分开
事件流驱动读模型
可能结合 Event Sourcing
读写最终一致
```

适合审计强、事件历史重要、读模型多样的系统,但复杂度很高。

---

## 四、落地判断:什么时候值得分

适合 CQRS 的信号:

- 读请求远多于写请求,读性能和扩展性压力明显.
- 写模型有复杂不变量,读模型有复杂展示需求.
- 页面需要多种投影:列表、详情、统计、搜索、导出.
- 读侧可以接受最终一致,比如几百毫秒到几秒延迟.
- 团队能处理数据同步、补偿和排错.

不适合 CQRS 的信号:

- 系统就是简单增删改查.
- 读写都围绕同一张表,查询也不复杂.
- 业务强依赖写后立刻读到最新结果,但你又没有一致性方案.
- 团队还没有监控、重试、补偿、数据校验能力.

一个实用判断是:**先在代码层分 Command 和 Query,再按压力决定是否分库、分服务、分事件流**。不要一上来就把 CQRS 和 Event Sourcing、微服务、Kafka 全绑在一起。

---

## 五、代价与误用

CQRS 的最大代价是数据一致性和心智复杂度。读模型可能落后于写模型,事件可能重复、乱序、失败。你需要幂等、重试、补偿、对账和可观测性。

常见误用之一是为所有接口机械创建 Command 和 Query 类。简单 `getById` 或 `updateName` 不一定需要一套完整 Handler 体系。

常见误用之二是读写分离后没有告诉产品和用户一致性语义。比如订单支付成功后,列表还显示未支付 3 秒,这不是代码细节,是体验和业务承诺。

常见误用之三是把 CQRS 当成性能银弹。如果慢查询来自缺索引、N+1 查询、错误分页,先修这些,不要直接上读模型同步系统。

---

## 六、与前端模式的边界

CQRS 是应用架构模式,讨论命令和查询在业务系统中的模型分离。前端也有"写动作"和"读状态"的区分,比如 Redux action 和 selector,但那主要是客户端状态组织,不是后端读写模型分离。不要因为用了 Redux 就说系统用了 CQRS。

边界很简单:如果你分离的是业务写入模型和查询投影,是 CQRS;如果你分离的是 UI 事件和视图状态,是前端状态管理模式。

---

## 一句话总结

CQRS 的价值在于承认读和写经常不是同一种模型,先轻量分离命令和查询,只有当读写差异真的很大时才升级到独立读模型和最终一致。
