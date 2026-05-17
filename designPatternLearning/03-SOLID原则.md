# SOLID 原则

SOLID 很容易被讲成五句口号:单一职责,开闭原则,里氏替换,接口隔离,依赖倒置。口号背下来没有用。真正有用的是知道它们分别在提醒你哪类代码风险,以及什么时候会被过度解读。

> 一句话先记住:SOLID 不是强制规则,是识别变化风险的检查清单。

---

## 一、先看问题

一个 `UserService` 经常从这样开始:

```ts
class UserService {
  async register(input: RegisterInput) {
    this.validate(input);
    const passwordHash = this.hash(input.password);
    const user = await db.users.insert({ ...input, passwordHash });
    await email.sendWelcome(user.email);
    await audit.log("user_registered", user.id);
    return user;
  }
}
```

这段代码不一定立刻有问题。但变化一多,它会同时因为这些原因被修改:

- 注册规则变化
- 密码算法变化
- 数据库结构变化
- 邮件模板变化
- 审计策略变化

一个类因为太多原因被修改,就是 SOLID 想提醒你的第一类风险。

---

## 二、S:单一职责原则

单一职责不是"一个类只能有一个方法",而是:

```text
一个模块应该只有一个主要变化原因
```

把上面的代码拆开,不是为了让类数量变多,而是为了让变化有地方去:

```ts
class RegisterUser {
  constructor(
    private users: UserRepository,
    private password: PasswordHasher,
    private notifier: WelcomeNotifier,
  ) {}

  async execute(input: RegisterInput) {
    const passwordHash = this.password.hash(input.password);
    const user = await this.users.create({ ...input, passwordHash });
    await this.notifier.welcome(user);
    return user;
  }
}
```

判断标准:

- 如果一个修改需求总是同时改这个类,职责可能还没拆清
- 如果一个业务动作必须读 8 个小类才能明白,可能拆过头了

---

## 三、O:开闭原则

开闭原则说的是:

```text
对扩展开放,对修改关闭
```

它不是说永远不能改老代码,而是说当变化类型已经明确时,新增变体不应该反复修改核心流程。

坏例子:

```ts
function discount(type: string, amount: number) {
  if (type === "vip") return amount * 0.8;
  if (type === "new_user") return amount * 0.9;
  return amount;
}
```

当折扣类型持续增加,可以改成策略表:

```ts
type Discount = (amount: number) => number;

const discounts: Record<string, Discount> = {
  vip: amount => amount * 0.8,
  new_user: amount => amount * 0.9,
};

function discount(type: string, amount: number) {
  return (discounts[type] ?? (x => x))(amount);
}
```

这里的开放不是神秘抽象,只是给新增类型留一个清晰入口。

---

## 四、L:里氏替换原则

里氏替换最容易被背定义。工程里可以这样理解:

```text
如果调用方依赖父类型,换成任何子类型都不应该破坏调用方预期
```

经典坏例子是正方形继承长方形:

```ts
class Rectangle {
  setWidth(width: number) {}
  setHeight(height: number) {}
}

class Square extends Rectangle {
  setWidth(width: number) {
    // must also change height
  }
}
```

调用方以为宽高可以独立变化,但 `Square` 破坏了这个约定。问题不是数学上正方形是不是长方形,而是代码里的行为契约不一致。

落地判断:

- 子类不要收紧父类方法的输入要求
- 子类不要改变父类承诺的核心语义
- 如果继承后要重写大量方法并抛异常,继承关系大概率错了

---

## 五、I:接口隔离原则

接口隔离不是"接口越多越好",而是:

```text
调用方不应该被迫依赖自己不用的方法
```

坏例子:

```ts
interface Machine {
  print(file: File): void;
  scan(): File;
  fax(file: File): void;
}

class SimplePrinter implements Machine {
  print(file: File) {}
  scan(): File {
    throw new Error("not supported");
  }
  fax(file: File) {
    throw new Error("not supported");
  }
}
```

更好的做法:

```ts
interface Printer {
  print(file: File): void;
}

interface Scanner {
  scan(): File;
}
```

小接口的价值是让依赖更精确。Go 语言里这点尤其明显:接口常常由使用方定义,而不是由实现方提前设计一个大而全的接口。

---

## 六、D:依赖倒置原则

依赖倒置说的是:

```text
高层策略不应该依赖低层细节,两者都应该依赖抽象
```

坏例子:

```ts
class BillingService {
  private gateway = new StripeGateway();

  charge(amount: number) {
    return this.gateway.charge(amount);
  }
}
```

更稳的结构:

```ts
interface PaymentGateway {
  charge(amount: number): Promise<string>;
}

class BillingService {
  constructor(private gateway: PaymentGateway) {}

  charge(amount: number) {
    return this.gateway.charge(amount);
  }
}
```

注意:依赖倒置不等于必须上 IoC 容器。手动构造也可以:

```ts
const service = new BillingService(new StripeGateway());
```

容器只是管理依赖的一种工具,不是原则本身。

---

## 七、五个原则怎么连起来

```text
单一职责:变化原因不要混在一起
开闭原则:明确变化通过扩展进入
里氏替换:抽象的实现不能破坏契约
接口隔离:调用方只依赖自己需要的能力
依赖倒置:核心策略不要被技术细节绑死
```

它们不是五条独立戒律,而是一组共同目标:让变化有边界。

---

## 八、代价与误用

**误用一:为了单一职责拆到无法阅读**

如果一个业务流程要在十几个只有一行代码的类之间跳转,阅读成本会超过复用收益。

**误用二:把开闭原则理解成永不修改**

需求没稳定前,抽象往往是猜的。先让代码清楚,等变化重复出现再开扩展点。

**误用三:把依赖倒置等同于所有类都要接口**

一个只有唯一实现,没有测试替换需求,没有外部技术风险的类,可以先不抽接口。

**误用四:忽略语言习惯**

Java 项目里接口常常显式命名。TypeScript 里可以用结构类型。Go 里小接口经常放在消费方。照搬写法会显得笨重。

---

## 九、一句话总结

> SOLID 的价值不是让代码看起来符合原则,而是帮你判断哪些变化会把模块撕开,以及该不该现在就切出边界。

