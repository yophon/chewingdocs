# Clean Architecture:用例层、实体层与依赖规则

很多团队听过 Clean Architecture 后,第一反应是建四个目录:domain、application、infrastructure、interfaces。然后所有代码照旧互相引用,Controller 直接拿 ORM Entity 返回,UseCase 里拼 SQL,Domain 对象里出现 HTTP Exception。目录变干净了,依赖没有变干净。

Clean Architecture 真正要解决的问题是:**业务规则应该比框架、数据库、UI 更稳定,所以依赖必须指向更稳定的内圈**。

---

## 一、问题:框架变成系统的中心

典型坏味道:

```java
@Service
public class TransferService {
  @Autowired private AccountJpaRepository accounts;

  @Transactional
  public void transfer(Long fromId, Long toId, BigDecimal amount) {
    AccountEntity from = accounts.findById(fromId).orElseThrow();
    AccountEntity to = accounts.findById(toId).orElseThrow();

    if (from.getBalance().compareTo(amount) < 0) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "insufficient balance");
    }

    from.setBalance(from.getBalance().subtract(amount));
    to.setBalance(to.getBalance().add(amount));
    accounts.save(from);
    accounts.save(to);
  }
}
```

这里的问题不是 Spring 或 JPA 不好,而是几类变化点绑死了:

- Web 错误表达绑定到业务规则.
- ORM Entity 同时承担数据库映射和领域行为.
- 事务、查询、转账规则都在一个方法里.
- 测试转账规则必须带上 Spring 和数据库语义.

稳定点是转账规则本身:账户余额不能为负,扣款和入账必须作为一个用例完成。Clean Architecture 会把这种规则放到内圈。

---

## 二、模式:依赖规则比目录更重要

常见分层从内到外:

```text
Entities
  领域对象,核心业务规则

Use Cases
  应用用例,编排实体和端口

Interface Adapters
  Controller, Presenter, Gateway, Repository Adapter

Frameworks & Drivers
  Web 框架,数据库,消息队列,UI,第三方 SDK
```

依赖规则:

```text
外圈可以依赖内圈
内圈不可以依赖外圈
跨圈通信通过接口和数据结构
```

一个简化 Java 示例:

```java
public class Account {
  private BigDecimal balance;

  public void withdraw(BigDecimal amount) {
    if (balance.compareTo(amount) < 0) {
      throw new InsufficientBalance();
    }
    balance = balance.subtract(amount);
  }

  public void deposit(BigDecimal amount) {
    balance = balance.add(amount);
  }
}

public interface AccountRepository {
  Account get(AccountId id);
  void save(Account account);
}

public class TransferMoney {
  private final AccountRepository accounts;

  public TransferMoney(AccountRepository accounts) {
    this.accounts = accounts;
  }

  public void execute(TransferCommand cmd) {
    Account from = accounts.get(cmd.from());
    Account to = accounts.get(cmd.to());
    from.withdraw(cmd.amount());
    to.deposit(cmd.amount());
    accounts.save(from);
    accounts.save(to);
  }
}
```

`TransferMoney` 不知道 Spring,不知道 HTTP,不知道 JPA。外层负责把 HTTP 请求转成 `TransferCommand`,把 `InsufficientBalance` 转成 400 响应,把 `AccountRepository` 接到数据库。

---

## 三、落地判断:Clean Architecture 保护什么

Clean Architecture 适合保护这两类稳定核心:

- 业务规则稳定且重要:金融、交易、权限、计费、审批、库存.
- 入口和外部技术多变:Web、CLI、MQ、批处理、第三方系统都可能触发同一套用例.

它和六边形架构很接近。六边形更强调端口和适配器,Clean Architecture 更强调内外圈层次和依赖规则。它和普通分层架构的区别也很清楚:普通分层经常让 Service 直接依赖具体基础设施;Clean Architecture 要求用例层依赖由内圈定义的接口。

一个常见目录可以是:

```text
src/
  domain/
    Account.ts
    errors.ts
  application/
    TransferMoney.ts
    AccountRepository.ts
  adapters/
    http/TransferController.ts
    persistence/SqlAccountRepository.ts
  main/
    container.ts
```

但目录不是重点。真正要检查的是:

- `domain` 是否引用了 Web 框架?
- `application` 是否引用了 ORM 类型?
- 控制器是否只做协议转换?
- 数据库适配器是否只做持久化映射?
- 用例测试能否不启动框架?

---

## 四、代价与误用

Clean Architecture 的代价是模型映射和依赖注入成本。外层 DTO、用例 Command、领域对象、持久化对象可能都不一样。对于复杂核心,这是隔离变化的成本;对于简单 CRUD,这就是重复劳动。

最常见误用是"贫血 Clean Architecture":Entity 只有 getter/setter,所有规则仍然在 UseCase 或 Service 里。这会让 domain 目录看起来很正规,但业务内聚性没有提高。

第二个误用是每个接口都抽象,每个类都只有一个方法,最后新增一个字段要改十几个文件。Clean Architecture 不是要求所有细节都隔离,而是要求重要规则不要依赖易变细节。

第三个误用是把框架完全妖魔化。框架可以在外圈很好地工作,比如事务、路由、序列化、ORM 映射都可以用。问题不是使用框架,而是让框架类型进入内圈。

---

## 五、与前端模式的边界

Clean Architecture 是应用架构模式,核心是业务规则和技术细节的依赖方向。前端也可以在大型客户端里引入 usecase、repository、gateway,尤其是离线应用、复杂编辑器、金融终端。但 React 组件、Vue Composition API、Signals、Redux 这些首先解决的是界面组合和状态更新,不是后端式领域规则隔离。

如果一个前端页面只是表单 + 列表,用 Clean Architecture 往往太重;如果它是复杂业务工作台,同一个用例被页面、快捷键、批处理、离线同步共同触发,再考虑这种分层。

---

## 一句话总结

Clean Architecture 的核心不是目录模板,而是依赖只能指向更稳定的业务规则;当业务核心足够重要时它很值,当系统只是简单数据搬运时它会显得很重。
