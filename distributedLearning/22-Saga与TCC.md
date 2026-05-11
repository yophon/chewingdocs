# Saga 与 TCC

上一篇 2PC/3PC 把"锁住一切等所有人投票"的强一致路线讲完了。结论很残酷:**2PC 在工程上几乎不能用于长事务**——锁持有时间和事务跨度同阶,跨服务一次下单可能跨支付、库存、券、积分、通知 6-7 个系统,每个都锁着等协调者投票,**TPS 直接掉到个位数**,只要协调者一抖就整链卡死。所以**真实互联网公司几乎没有一个把核心链路压在 2PC 上的**——他们用的是 Saga 和 TCC。

> 一句话先记住:**Saga 用"补偿"换"不锁"**——长事务拆成 N 步小事务,每一步立即提交不持锁,任一步失败就反向调用前面所有步的补偿动作。**TCC 是"业务级 2PC"**——把 prepare/commit/rollback 三个动作下沉到业务,资源在 Try 阶段就预占。**两者都放弃了 ACID 的 I(Isolation)**,换来了几个数量级的吞吐——你看到的中间态可能脏,但最终会对得上。

---

## 一、为什么 2PC 不能扛长事务

回到一个真实场景:用户下单,系统要做这些事:

```
1. 订单服务   create_order(订单状态=待支付)
2. 库存服务   deduct_stock(扣减库存)
3. 优惠券服务 use_coupon(标记券已用)
4. 积分服务   freeze_points(冻结积分用于抵扣)
5. 支付服务   create_payment(创建支付单)
6. 通知服务   send_sms(发送下单短信)
```

**6 个服务、6 个数据库,任何一个失败都要回滚前面所有人**。

如果走 2PC:

```
协调者 → 6 个参与者 prepare(每个参与者持锁、写 redo log)
        ↓
        全部 YES?
        ↓
协调者 → 6 个参与者 commit(各自落盘、释放锁)
```

**问题**:

| 问题 | 表现 |
| --- | --- |
| 锁持有时间 = 整个链路 RT | 通常 300ms~2s,**单订单卡 1s 锁,1000 QPS 直接卡死库存表** |
| 跨网络 RPC × N 次 | 任何一段抖动整个事务等 |
| 协调者宕机 | 参与者锁卡到协调者恢复(blocking) |
| 通知服务这种「无法回滚」 | 短信已发出去,你怎么补偿?要么不参加事务要么单独处理 |
| 异构数据源 | 订单 MySQL、库存 Redis、积分 MongoDB——**根本没有统一的 prepare/commit 协议** |

> 实际工程结论:**只有同库内的多表事务才适合 2PC(本来就是本地事务),跨服务跨库的长链路必须放弃 2PC**。

但业务要求"要么全成功要么全回滚"还是真实存在的——只是不要求**强一致(立刻一致)**,只要求**最终一致(几秒内自愈)**。这就是 Saga 与 TCC 的舞台。

---

## 二、Saga:Garcia-Molina 1987 的老论文

Saga 是 1987 年 Hector Garcia-Molina 和 Kenneth Salem 在「Sagas」论文里提出的概念,**当时是为 long-running transactions 设计**(早期数据库系统跑几小时的事务,锁着库等于挂)。

### 2.1 核心定义

**一个 Saga 是一个有序的子事务序列**:

```
S = T1, T2, ..., Tn

每个 Ti 都是一个【本地原子事务】(单独可提交可回滚)
每个 Ti 都有一个对应的【补偿事务】 Ci
```

执行规则:

```
正常路径:  T1 → T2 → T3 → ... → Tn   (全部成功)
失败路径:  T1 → T2 → T3(失败) → C2 → C1   (反向补偿)
```

**关键不变量**:**Ti 与 Ci 都是本地事务,各自原子提交**。整个 Saga 不是 ACID 的,但保证 **要么 Tn 成功(全部完成),要么补偿到 C1(全部撤销)**——这叫"语义层面的原子性"。

### 2.2 与 2PC 的对比图

```
2PC:
  T1.prepare ─┐
  T2.prepare ─┤ (锁住,等协调者)
  T3.prepare ─┘
           ▼
        全部 YES
           ▼
  T1.commit, T2.commit, T3.commit   ← 锁住期间没人干活

Saga:
  T1.commit ─→ T2.commit ─→ T3.commit ─→ ...
  (每一步立即提交、立即释放锁)
  
  T3 失败:
  T1.commit ─→ T2.commit ─→ T3 fail
                              ↓
                            C2 ─→ C1   ← 反向补偿,不持有跨步骤锁
```

> **核心差异**:2PC 是"先锁后提交",Saga 是"边走边提交,失败反向补偿"。**2PC 锁的是资源,Saga 锁的是时间**——Saga 期间任何人都能读到中间态,但只接受"最终会对账"。

---

## 三、Saga 的两种编排方式

写 Saga 工程上有两个路线:**Choreography(协作式 / 事件驱动)** 和 **Orchestration(编排式 / 中心协调)**。

### 3.1 Choreography:事件驱动,无中心

每个服务订阅前一个服务的事件,自己决定下一步做什么:

```
订单服务            库存服务         优惠券服务         支付服务
  │  OrderCreated     │                │                  │
  ├──────────────────▶│                │                  │
  │                   │ StockDeducted  │                  │
  │                   ├───────────────▶│                  │
  │                   │                │ CouponUsed       │
  │                   │                ├─────────────────▶│
  │                   │                │                  │ PaymentCreated
  │                   │                │                  ├──┐
  │                   │                │                  │  │
  
失败场景:支付服务失败,发 PaymentFailed 事件
                                       │ PaymentFailed    │
                                       │◀─────────────────│
                                       │ 补偿:释放券      │
                                       │ 发 CouponReleased│
                       ◀───────────────│
                       │ 补偿:回库存
                       │ 发 StockRestored
   ◀───────────────────│
   │ 补偿:取消订单
```

**优点**:无单点,服务松耦合,加新步骤改自己的服务即可。
**缺点**:**全局流程难以观察**——你看代码看不出整个 Saga 长什么样,出错调试地狱;循环依赖(A 订 B、B 订 A)容易死锁。

### 3.2 Orchestration:中心协调器

一个 **Saga Orchestrator**(Saga 协调器)显式驱动每一步,记录状态机:

```
┌───────────────────────────────────────────────────┐
│            Saga Orchestrator (有状态)              │
│                                                   │
│  state machine:                                   │
│   pending → stock_deducted → coupon_used →        │
│   payment_created → completed                     │
│                                                   │
│   失败时:current_step → C(current) → C(prev) → ... │
└─────────┬─────────────────────────────────────────┘
          │ 1. call stock.deduct
          ▼
       库存服务
          │ 2. ok
          ▼
       Orchestrator (持久化进度)
          │ 3. call coupon.use
          ▼
       优惠券服务
          │ ...
```

**优点**:全流程一目了然,失败处理逻辑集中,**事务进度可查询**。
**缺点**:协调器是单点(需要 HA),业务逻辑被拽出来了一部分。

### 3.3 哪个更合适?

| 维度 | Choreography | Orchestration |
| --- | --- | --- |
| 步骤数 | ≤ 3 步合适 | ≥ 4 步合适(否则事件链爆炸) |
| 可观测性 | 差(全局视角缺失) | 好(状态机可视化) |
| 业务变更 | 影响多个服务 | 改 Orchestrator 一处 |
| 单点风险 | 无 | Orchestrator HA 必须做 |
| 典型工程 | EventBridge / RocketMQ 事务消息 | **Temporal / Cadence / SEATA Saga / Camunda** |

> **结论**:**3 步以内、且变更频率低的链路用 Choreography**(简单可靠);**3 步以上、流程会演进的复杂业务用 Orchestration**(可控、可观测)。Uber 内部把整套订单链路从 Choreography 迁到 Orchestration(Temporal),原因是事件链复杂到没人能看懂。

---

## 四、Saga 的伪代码(Orchestration 版)

```python
class OrderSaga:
    """下单 Saga,中心协调"""
    
    steps = [
        ("create_order",   "cancel_order"),
        ("deduct_stock",   "restore_stock"),
        ("use_coupon",     "release_coupon"),
        ("freeze_points",  "unfreeze_points"),
        ("create_payment", "cancel_payment"),
    ]
    
    def execute(self, saga_id, ctx):
        # 持久化 saga_id 与状态(避免协调器崩溃丢进度)
        self.store.create(saga_id, status="running", step=0)
        
        completed = []
        for i, (action, _) in enumerate(self.steps):
            try:
                # 业务调用,带幂等键 (saga_id + step) 防重
                self.invoke(action, ctx, idem_key=f"{saga_id}#{i}")
                completed.append(i)
                self.store.update(saga_id, step=i+1)
            except Exception as e:
                # 反向补偿已完成的步骤
                self.compensate(saga_id, completed, ctx)
                self.store.update(saga_id, status="rolled_back")
                raise
        
        self.store.update(saga_id, status="completed")
    
    def compensate(self, saga_id, completed_idxs, ctx):
        # 反向遍历,逐个调用补偿
        for i in reversed(completed_idxs):
            _, compensate = self.steps[i]
            # 补偿也带幂等键,可能被重试多次
            self.invoke(compensate, ctx, idem_key=f"{saga_id}#{i}#comp",
                        retry=INFINITE)
```

**关键细节**:

1. **`saga_id + step` 是幂等键**——每个业务接口必须用这个键去重,不然崩溃重启重放就会双倍扣
2. **补偿无限重试**——补偿不能失败,即使失败也要重试到成功(不然系统永远卡在中间态)
3. **状态机持久化**——协调器宕机重启要能恢复进度(Temporal 用 event sourcing,SEATA 用 DB 表)

---

## 五、TCC:业务级 2PC

TCC = **Try / Confirm / Cancel**,是日本 NTT DATA 的工程师 Pat Helland 思路的工程化(也常被归功于 Atomikos)。

**核心思想**:**让每个业务接口拆成三个动作**,业务层显式实现 prepare/commit/rollback:

```
Try    → 预留资源(冻结额度、占住库存、不实际扣)
Confirm → 真正扣减(从冻结转为实际)
Cancel  → 释放预留(取消冻结)
```

### 5.1 Try-Confirm-Cancel 状态机

```
                  ┌─────────┐
                  │ Initial │
                  └────┬────┘
                       │ Try
                       ▼
                  ┌─────────┐
        ┌─────────┤ Trying  ├─────────┐
        │         └─────────┘         │
   Cancel (失败)                  Confirm (成功)
        │                             │
        ▼                             ▼
  ┌──────────┐                  ┌───────────┐
  │ Cancelled│                  │ Confirmed │
  └──────────┘                  └───────────┘
```

### 5.2 用账户扣款举例

**传统接口**:`deduct(account, amount)` → 直接扣

**TCC 接口**:

```python
class Account:
    def try_deduct(self, account, amount, tx_id):
        """预留:从余额冻结 amount"""
        # available_balance -= amount
        # frozen_balance += amount
        # 记录 (tx_id, amount) 防重
        ...
    
    def confirm_deduct(self, tx_id):
        """确认:从冻结余额真正扣掉"""
        # frozen_balance -= amount
        # 不动 available_balance
        ...
    
    def cancel_deduct(self, tx_id):
        """取消:把冻结的退回可用"""
        # frozen_balance -= amount
        # available_balance += amount
        ...
```

**关键不变量**:`total = available + frozen`(三状态切换不改变总数)

### 5.3 TCC 的协调流程

```
协调器                  账户A         券          库存

──Try──────────────────▶│
                       try_deduct(100)   ← 预冻结 100
──Try──────────────────────────────────▶│
                                  try_use(coupon_id)  ← 预占
──Try──────────────────────────────────────────────▶│
                                              try_lock(item_id)  ← 预扣

(全部 Try 成功)

──Confirm──────────────▶│
                       confirm_deduct  ← 真扣
──Confirm──────────────────────────────▶│
                                  confirm_use
──Confirm──────────────────────────────────────────▶│
                                              confirm_lock

(任一 Try 失败,前面已 Try 的全部 Cancel)
```

### 5.4 TCC 与 2PC 的本质区别

| 项 | 2PC | TCC |
| --- | --- | --- |
| 锁层级 | 数据库行锁(资源锁) | 业务字段锁(冻结额度) |
| 谁实现 | 数据库 | 业务代码 |
| 中间态可见 | 不可见(锁住) | 可见(冻结额度透明) |
| 跨异构源 | 难(需要 XA) | 易(各服务自己实现三接口) |
| 资源占用 | 行锁占数据库连接 | 数据库连接每次都 release |

> **TCC 把"锁"从数据库行锁变成了业务字段**——账户余额拆成 available + frozen,扣的时候只动 frozen,不持有数据库锁。**整个 try 阶段后,数据库连接就还回去了**,锁的代价从"持锁时间 = 整个事务跨度"降到"持锁时间 = 单次 SQL 执行"。

---

## 六、Saga vs TCC vs 2PC:正面对比

| 维度 | 2PC | TCC | Saga |
| --- | --- | --- | --- |
| 一致性 | 强一致(原子) | 最终一致(几秒内) | 最终一致(几秒~几分钟) |
| 隔离性 | 完整(锁) | 业务级隔离(冻结) | 几乎无(中间态全可见) |
| 性能 | 差(锁持时间长) | 中(锁短,但 3 次 RPC) | 好(N 次 RPC,无锁) |
| 业务侵入 | 低(框架透明) | **高**(每接口要写 3 份) | 中(每步要写补偿) |
| 适合数据 | 同库 | 强一致需求的金融账户 | 长链路、跨异构、可补偿 |
| 失败回滚 | 自动(数据库) | 业务 Cancel | 业务 Compensation |
| 工程代表 | XA / MySQL XA | **SEATA TCC / Hmily** | **Temporal / Cadence / SEATA Saga / DTM** |
| 典型场景 | 同库多表 | 转账、扣库存、需强隔离 | 下单、出行、退款流程 |

> **三句话记法**:
> - **2PC 给你"原子",代价是"锁穿一切"**——只能用于同库
> - **TCC 给你"业务级原子",代价是"3 倍开发量"**——用于核心金融
> - **Saga 给你"语义级最终一致",代价是"中间态脏"**——用于长链路

---

## 七、业务幂等性:Saga/TCC 的生命线

Saga 和 TCC 都依赖**重试**——网络抖动、服务暂时不可用,协调器都会重试调用。**所以每个业务接口必须是幂等的**——重试 100 次和重试 1 次效果一致。

### 7.1 幂等键的标准做法

每个业务调用带一个**全局唯一 ID**:

```
idempotency_key = saga_id + "#" + step_index
# 或: trace_id + "#" + step_id

业务方收到请求:
  1. 用 idempotency_key 去 Redis / DB 查是否已处理
  2. 已处理:直接返回上次的结果
  3. 未处理:处理 + 记录 (key, result)
```

### 7.2 三种典型陷阱

**陷阱 1:重复扣款**

```
Saga 调 deduct(amount=100),网络超时但实际扣了
Saga 重试 → 又扣了 100
```

**修复**:业务方用 idempotency_key 去重,**第二次直接返回第一次的结果**。

**陷阱 2:Cancel 与 Try 乱序**

```
Try 发出,但网络慢
协调器认为超时 → 发 Cancel
Cancel 先到达 → 业务方根本没 Try 过,Cancel 做不做?

如果不记录:Try 后到,业务又 Try 成功 → 卡死!
```

**修复**:**空补偿 + 防悬挂**

- **空补偿**:Cancel 来了但没有对应 Try,先记下 (tx_id, "cancelled") 状态,Cancel 直接成功
- **防悬挂**:Try 来了但已经有 (tx_id, "cancelled") 记录 → Try 直接拒绝

**陷阱 3:补偿动作本身失败**

```
Saga 步骤 3 失败 → 补偿步骤 2
补偿步骤 2 的接口又超时
```

**修复**:补偿必须**无限重试 + 死信兜底**——重试 N 次仍失败,推到死信队列人工介入,**不能让系统永远卡在中间态**。

> **没有幂等键的 Saga 一定会出事**——出事概率 ≈ 100%,出事时间 ≈ 上线一周内。这不是杞人忧天,是工程定律。

---

## 八、与消息队列组合:本地消息表(Transactional Outbox)

Saga 在 Choreography 模式下要用 MQ 发事件。**问题:DB 写和 MQ 发是两个动作,怎么保证原子?**

```
写 DB → 发 MQ:写 DB 成功后,发 MQ 失败 → 数据写了但下游不知道
发 MQ → 写 DB:发 MQ 成功后,写 DB 失败 → 下游收到了但本地没数据
```

**Transactional Outbox 模式**(本地消息表):

```
┌──────────────────────────────────────────────────┐
│ 本地数据库(同一个事务)                            │
│                                                  │
│  BEGIN                                           │
│  INSERT INTO orders(...) VALUES(...);  -- 业务表  │
│  INSERT INTO outbox(event) VALUES(...); -- 消息表 │
│  COMMIT                                          │
└──────────────────────────────────────────────────┘
                       │
                       ▼ (异步)
┌──────────────────────────────────────────────────┐
│ Outbox Publisher (后台进程)                        │
│   每秒扫 outbox 表,推到 MQ,推成功标记 sent       │
└──────────────────────────────────────────────────┘
                       │
                       ▼
                     MQ → 下游消费(幂等消费)
```

**关键**:

- **业务表 + 消息表在同一个本地事务**——要么都成功要么都失败
- **后台进程异步推送**——可以失败重试
- **消费方幂等**——保证下游只生效一次(本地消息表是 at-least-once,需要消费方去重)

**对应工程**:

- RocketMQ 的「事务消息」是这个模式的内置版本
- 阿里 Seata 的 Saga 模式底层用类似机制
- 自研可以直接用 Outbox 表 + Canal/Debezium 监听 binlog 推到 MQ

> **DB → MQ 这一对的最佳实践就是 Outbox**——不要在业务代码里直接 send MQ,出事率极高。**所有"先写库再发 MQ"的代码都有不一致风险**。

---

## 九、工程实战:六大主流框架

### 9.1 阿里 Seata(开源)

国内最常见,支持四种模式:

| 模式 | 原理 | 适合 |
| --- | --- | --- |
| **AT**(默认) | SQL 解析自动生成反向 SQL 做补偿 | 同 DataSource,**主流模式** |
| **TCC** | 业务实现三接口 | 跨服务、需强隔离 |
| **Saga** | 状态机引擎驱动 | 长流程、有补偿可能 |
| **XA** | 数据库原生 XA | 跨同库不同 schema |

**AT 模式特别的地方**:Seata 拦截 SQL,自动生成 undo log,业务**不感知**事务——但代价是有全局锁,性能不如 TCC。

### 9.2 DTM(Go 生态,字节出品)

支持 Saga / TCC / 二阶段消息 / XA,**亮点是"子事务屏障"**——内置幂等、空补偿、防悬挂处理,业务方不需要自己写。

### 9.3 Temporal / Cadence(Uber 开源)

**不止是 Saga 框架,是完整的 workflow 引擎**:

- 业务代码写成 Workflow(看起来像顺序代码),底层自动持久化每一步状态
- 崩溃后从上次断点恢复(replay event log)
- 适合长流程(几小时到几天的事务,如订单全生命周期)

```go
func OrderWorkflow(ctx workflow.Context, order Order) error {
    workflow.ExecuteActivity(ctx, CreateOrder, order)
    workflow.ExecuteActivity(ctx, DeductStock, order)
    workflow.ExecuteActivity(ctx, ChargePayment, order)
    // 看起来是顺序代码,实际每一步都持久化、可恢复
    // 失败时 Temporal 自动调用补偿(SAGA 模式)
}
```

> Uber、Snap、Coinbase、Stripe 内部大量用 Temporal。**它已经事实上取代了"自己用 MQ + DB 拼 Saga"这种土办法**。

### 9.4 AWS Step Functions

托管的 Saga 编排引擎,JSON 定义状态机,适合 Serverless 场景。

### 9.5 Camunda / Zeebe

老牌 BPM 引擎,适合**业务流程复杂、需要业务可视化的传统企业**(银行、保险)。

### 9.6 RocketMQ 事务消息

不是完整 Saga 框架,但提供"半消息"机制让 DB 写 + MQ 发原子化——Choreography 模式 Saga 的轻量选择。

---

## 十、不适合 Saga / TCC 的场景

**两条死线**:

### 10.1 严格 Isolation 的场景

**Saga 中间态是脏的**——T1 提交后到 T3 失败之前,**别人能看到 T1 的结果**。如果业务严格要求"事务期间不可见",Saga 不能用。

举例:**银行内部对账查询**——查询时如果一笔转账正在 Saga 执行,部分账户已扣、部分未加,查出来余额对不上。这种场景必须用 2PC 或单库本地事务。

### 10.2 补偿不可能的动作

有些动作做了就**真的撤不回**:

| 动作 | 能补偿吗 |
| --- | --- |
| 扣余额 | 能(加回去) |
| 扣库存 | 能(还回去) |
| **发短信 / 邮件** | **不能**(已经发出去了) |
| **真实发货** | **不能**(物流车上路了) |
| **第三方支付扣款** | 能,但要走退款接口,**T+1 到账** |
| **打印发票 / 报税** | 不能 |

**对策**:

1. **把不可补偿的动作放到 Saga 最末尾**——前面所有可补偿的都成功了才执行
2. **"通知"类动作用"延迟发送 + 状态机校验"**——订单进入"已完成"才真正发短信
3. **第三方调用前先 Try**(预占),最末再 Confirm——某些三方支付支持二阶段(微信、支付宝的「预扣 + 确认」)

> **设计 Saga 第一件事:把所有动作按"可补偿性"排序,不可补偿的全部往后放**。看似简单的原则,**90% 的 Saga 事故都是因为违反了它**(发了短信再发现订单失败,只能下次发"很抱歉刚才那条不算")。

---

## 十一、踩坑提醒

1. **业务接口不幂等**——重试时双倍扣款 / 双倍发货,**幂等键是 Saga/TCC 的命**
2. **补偿动作没幂等**——补偿被重试时再次回滚,数据错乱
3. **不处理空补偿和悬挂**——Cancel 先到 / Try 在 Cancel 后到,业务卡死
4. **补偿动作允许失败**——补偿一旦失败就要重试到成功 + 死信兜底,**不能像主流程那样"算了不补了"**
5. **不可补偿动作放在 Saga 中间**——发了短信再失败,补偿不能撤,只能下次发抱歉
6. **协调器无持久化**——Orchestrator 崩了重启忘了进度,事务永远卡半路
7. **业务流程不画状态机**——长链路 Saga 没人能看懂,出错时连"该走哪个补偿"都不知道
8. **DB + MQ 不用 Outbox**——直接 send MQ 必然出现"DB 写了 MQ 没发"或反向情况
9. **拿 Saga 当 2PC 用**——业务依赖中间态隔离,看到脏数据后崩溃
10. **不监控 Saga 的"卡住率"**——Saga 状态"running 超过 5 分钟"的数量不监控,出事不知道
11. **没有人工介入入口**——死信里的失败 Saga 不能在管理后台手动重试 / 强制完成,运维瘫痪
12. **TCC 业务字段没拆 frozen**——TCC 必须有"available / frozen / total"三状态字段,直接扣 available 就退化成"两阶段"了

---

## 十二、收束:三套方案的选型决策树

```
                    要分布式事务?
                          │
                          ▼
                   同库内多表吗?
                  ┌────┴────┐
                  是        否
                  ▼         │
              本地事务      ▼
                       跨服务跨库
                            │
                  ┌─────────┼─────────┐
                  ▼         ▼         ▼
            金融账户类   长链路   异构数据源
            需要强隔离   多步骤   (MySQL+Redis+ES)
                  │         │         │
                  ▼         ▼         ▼
                TCC       Saga      Saga
            (SEATA TCC)  (Temporal)  (DTM)
```

> **互联网公司的真实分布式事务栈是 95% Saga + 4% TCC + 1% 2PC**。Saga 不是 2PC 的替代品,它是**用业务语义换性能**的另一条路——你放弃了 ACID 的 I,但换来了能在生产真正跑得动的吞吐。**面试问"分布式事务怎么做",不答 2PC 答 Saga + TCC + Outbox + 幂等,才是工程师的答案**。

---

下一篇:`23-Percolator.md`,讲 Google 2010 OSDI 那篇神奇论文——在不改 BigTable 的前提下,**在客户端层面**实现了跨行 ACID + 快照隔离,几个工程师在 BigTable 上糊了一层 lock 列就做出了能撑 Google 索引的分布式事务。**TiDB / TiKV 的事务底层就是 Percolator**,理解它你就理解了为什么国内大量 NewSQL 都长这个样子。
