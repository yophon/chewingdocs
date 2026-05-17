# UML 与代码结构图速通

学设计模式经常被 UML 劝退:空心三角,实线虚线,聚合组合,看起来像考试。工程里不需要把 UML 背成规范手册,但必须能画出代码结构。因为很多设计问题,不是代码语法问题,而是**依赖方向和对象关系画出来就不对**。

> 一句话先记住:UML 的价值不是形式正确,而是让依赖关系暴露出来。

---

## 一、先看问题

下面这个服务看起来只是多 new 了几个对象:

```ts
class ReportService {
  async export(userId: string) {
    const repo = new UserRepository();
    const pdf = new PdfRenderer();
    const mail = new SmtpMailer();

    const user = await repo.find(userId);
    const file = pdf.render(user);
    await mail.send(user.email, file);
  }
}
```

问题不在能不能运行,而在结构:

```text
ReportService
  -> UserRepository
  -> PdfRenderer
  -> SmtpMailer
```

`ReportService` 同时依赖数据库,PDF 引擎,邮件协议。后面想换邮件供应商,想测试导出逻辑,想把 PDF 改成 Excel,都要碰这个服务。

画图的目的,就是尽早看见这种耦合。

---

## 二、类图里最常用的关系

工程中先记五种就够了。

### 1. 依赖:我临时用你

```text
OrderService ..> Logger
```

代码里通常表现为方法参数,局部变量,静态方法调用:

```ts
function pay(order: Order, logger: Logger) {
  logger.info("paying");
}
```

依赖关系比较轻,但如果到处依赖具体类,仍然会扩散。

### 2. 关联:我长期认识你

```text
OrderService --> PaymentProvider
```

代码里通常是字段:

```ts
class OrderService {
  constructor(private provider: PaymentProvider) {}
}
```

关联意味着生命周期或协作关系更稳定,是设计模式里最常见的连接。

### 3. 继承:我是你的一种

```text
Dog --|> Animal
```

```ts
class Animal {
  move() {}
}

class Dog extends Animal {
  bark() {}
}
```

继承表达 "is-a",但很容易把复用和分类混在一起。后面会单独讲为什么组合通常比继承稳。

### 4. 实现:我遵守你的协议

```text
AlipayProvider ..|> PaymentProvider
```

```ts
interface PaymentProvider {
  charge(amount: number): Promise<string>;
}

class AlipayProvider implements PaymentProvider {
  async charge(amount: number) {
    return "trade-no";
  }
}
```

实现关系是依赖倒置的基础。上层依赖接口,下层实现接口。

### 5. 组合:你是我的组成部分

```text
Order *-- OrderItem
```

组合表示强归属:订单没了,订单项也没意义。

```ts
class Order {
  constructor(private items: OrderItem[]) {}
}
```

聚合和组合的区别在 UML 标准里有细节,但工程判断可以简单一点:

- 组合:生命周期强绑定,整体没了部分也没意义
- 聚合:只是持有引用,部分可以独立存在

---

## 三、结构图比标准 UML 更常用

日常代码评审里,你不一定要画标准 UML。下面这种结构图更快:

```text
Controller
   |
   v
Service
   |
   v
PaymentProvider(interface)
   |
   +-- AlipayProvider
   +-- WechatProvider
```

看图时重点看三件事:

- 箭头方向:谁依赖谁
- 抽象位置:接口在上层需要的地方,还是被下层技术绑住
- 变化出口:新增实现时,要不要改核心流程

如果图画出来箭头到处乱飞,代码通常也会乱。

---

## 四、时序图看调用流程

类图看静态结构,时序图看一次请求怎么流动。

```text
User -> Controller: POST /pay
Controller -> OrderService: pay(orderId)
OrderService -> PaymentProvider: charge(order)
PaymentProvider -> ThirdPartyAPI: request
PaymentProvider -> OrderService: result
OrderService -> Repository: save(result)
```

它能暴露两类问题:

- 调用链太长,一个操作穿透太多层
- 某一层知道了太多细节,比如 Controller 直接操作第三方 API

时序图尤其适合讲清楚观察者,责任链,命令,事务脚本,事件驱动这些模式。

---

## 五、用图识别稳定点和变化点

假设发送通知有三种渠道:

```text
Bad:

OrderService
  -> EmailSDK
  -> SmsSDK
  -> PushSDK
```

这表示业务服务直接依赖所有变化。

更稳的结构:

```text
Good:

OrderService
  -> Notifier(interface)
       +-- EmailNotifier
       +-- SmsNotifier
       +-- PushNotifier
```

稳定点是 `OrderService` 只需要 "通知用户"。变化点是通知渠道,签名方式,供应商协议。

---

## 六、代码示例:从图反推代码

先画结构:

```text
InvoiceService -> InvoiceRenderer
InvoiceRenderer <|.. PdfRenderer
InvoiceRenderer <|.. HtmlRenderer
```

再写代码:

```ts
interface InvoiceRenderer {
  render(invoice: Invoice): Buffer;
}

class PdfRenderer implements InvoiceRenderer {
  render(invoice: Invoice): Buffer {
    return Buffer.from("pdf");
  }
}

class InvoiceService {
  constructor(private renderer: InvoiceRenderer) {}

  export(invoice: Invoice) {
    return this.renderer.render(invoice);
  }
}
```

图和代码应该能互相解释。如果图上是接口隔离,代码里却到处 `instanceof PdfRenderer`,说明设计没有落地。

---

## 七、落地判断

需要画图的场景:

- 代码评审里一句话讲不清依赖关系
- 新需求会影响多个模块,需要先判断边界
- 准备引入工厂,策略,观察者,状态等模式
- 重构前要确认哪些对象可以先稳定下来
- 团队对某个类的职责理解不一致

不需要画图的场景:

- 单个函数内部的小重构
- 没有跨对象协作的简单 CRUD
- 图比代码还复杂,没人会维护

图不是文档负担,而是讨论工具。画完能指导代码,才值得保留。

---

## 八、代价与误用

**误用一:追求 UML 符号标准,忽略设计讨论**

空心菱形画错不致命。致命的是没人看出 `Service` 依赖了 6 个具体 SDK。

**误用二:图和代码不同步**

如果图只是会议产物,代码早就变了,它会误导新人。结构图要么贴近核心设计,要么删掉。

**误用三:所有关系都画**

图的目标是突出关键依赖。getter,DTO,工具类全画上去,真正重要的边界会被淹没。

**误用四:只画类,不画数据和调用**

很多业务问题不是类关系,而是数据流和调用顺序。类图不够时,补时序图或流程图。

---

## 九、一句话总结

> UML 不该被当成考试符号,而该被当成依赖显微镜:谁依赖谁,谁稳定,谁变化,一画就藏不住。

