# Spring Boot IoC 与 AOP

Spring 的两个底层支柱:**IoC**(控制反转)管"对象怎么来",**AOP**(面向切面)管"通用逻辑怎么织进去"。理解这两个,Spring 的一切操作都不再玄学。

---

## 一、IoC 是什么

传统写法:对象自己 new 依赖。

```java
class UserService {
    UserRepository repo = new UserRepositoryImpl();   // ← 自己 new
}
```

问题:

- 换实现要改代码
- 测试时没法 mock
- 依赖越多构造越复杂

IoC(Inversion of Control)反过来:**对象自己不创建依赖,由容器注入**。

```java
@Service
class UserService {
    private final UserRepository repo;
    public UserService(UserRepository repo) { this.repo = repo; }
}
```

容器在启动时扫描所有 `@Component / @Service / ...`,创建实例放进 BeanFactory,需要时按需装配。这就是 **DI(依赖注入)**——IoC 的具体实现方式。

---

## 二、Bean 的注册方式

| 方式 | 例 | 适用 |
| --- | --- | --- |
| 注解扫描 | `@Service`、`@Repository` | 自己写的类 |
| `@Bean` 方法 | 在 `@Configuration` 类里写工厂方法 | 第三方类(没法加注解) |
| `@Import` | 导入配置类 | 模块化组装 |
| `BeanDefinitionRegistryPostProcessor` | 程序化注册 | 框架级元编程 |

```java
@Configuration
public class AppConfig {

    @Bean
    public RestTemplate restTemplate() {
        return new RestTemplateBuilder()
            .setConnectTimeout(Duration.ofSeconds(3))
            .setReadTimeout(Duration.ofSeconds(5))
            .build();
    }
}
```

---

## 三、注入方式

```java
// ✅ 推荐:构造器注入
@Service
@RequiredArgsConstructor      // Lombok:为 final 字段生成构造器
public class OrderService {
    private final UserRepository userRepo;
    private final PayClient payClient;
}

// ⚠️ 不推荐:字段注入
@Service
public class OrderService {
    @Autowired private UserRepository userRepo;
}

// ⚠️ 一般用于可选依赖:setter 注入
@Autowired(required = false)
public void setMetrics(MeterRegistry r) { ... }
```

**为什么构造器注入最好**:

1. 字段可以 `final`,真正的不可变
2. 单元测试 new 出来就能用,不需要 Spring 容器
3. 循环依赖会在启动期就报错,而不是运行时神秘 NPE
4. 依赖列表清晰,过多就是设计坏味(类太胖)

---

## 四、Bean 作用域

```java
@Service
@Scope("prototype")        // 每次 getBean 都新建
public class TaskRunner { ... }
```

| Scope | 何时创建 |
| --- | --- |
| `singleton`(默认) | 容器启动时创建一次 |
| `prototype` | 每次注入/获取都新建 |
| `request` | 每次 HTTP 请求一个(Web) |
| `session` | 每个 Session 一个(Web) |

> **99% 的业务 Bean 都是 singleton**。这意味着**实例字段不要存请求级状态**,否则会出现请求间数据污染。

---

## 五、循环依赖

A 注入 B、B 注入 A,Spring 默认能解(通过三级缓存),但**构造器循环依赖** Spring 不能解,会报 `BeanCurrentlyInCreationException`。

```java
@Service
class A {
    private final B b;       // ← 构造器
    A(B b) { this.b = b; }
}
@Service
class B {
    private final A a;
    B(A a) { this.a = a; }
}
// 启动报错
```

**解决思路**(按优先级):

1. **重构**:循环依赖往往说明职责划分有问题
2. 用 setter 注入打断
3. 加 `@Lazy` 让其中一方延迟代理
4. 抽出第三个类承担公共部分

---

## 六、`@Primary` 与 `@Qualifier`

同类型多个 Bean 时:

```java
public interface PayChannel { ... }

@Service @Primary
class WechatPay implements PayChannel { ... }

@Service
class AliPay implements PayChannel { ... }

@Service
class OrderService {
    private final PayChannel defaultPay;       // 注入 WechatPay
    private final PayChannel ali;

    public OrderService(PayChannel defaultPay,
                        @Qualifier("aliPay") PayChannel ali) {
        this.defaultPay = defaultPay;
        this.ali = ali;
    }
}
```

---

## 七、`@Conditional` 条件装配

Spring Boot 自动配置的核心。

```java
@Configuration
@ConditionalOnClass(RedisTemplate.class)
@ConditionalOnProperty(name = "app.cache", havingValue = "redis")
public class RedisConfig { ... }
```

常见的:

- `@ConditionalOnClass` / `@ConditionalOnMissingClass`
- `@ConditionalOnBean` / `@ConditionalOnMissingBean`
- `@ConditionalOnProperty`
- `@ConditionalOnWebApplication`
- `@Profile("prod")`

---

## 八、AOP 是什么

AOP(Aspect-Oriented Programming)解决"**横切关注点**"——日志、事务、权限、缓存、监控,这些跟业务无关但每处都要写的逻辑。

不用 AOP:

```java
public Order create(...) {
    log.info("create begin");
    long start = System.currentTimeMillis();
    try {
        // 真正的业务
    } finally {
        log.info("create cost = {}ms", System.currentTimeMillis() - start);
    }
}
```

每个方法都这么写,没人受得了。AOP 让你**抽出来**:

```java
@Aspect
@Component
@Slf4j
public class TimingAspect {

    @Around("@annotation(Timed)")     // 切谁
    public Object around(ProceedingJoinPoint pjp) throws Throwable {
        long start = System.currentTimeMillis();
        try {
            return pjp.proceed();      // 真正的业务调用
        } finally {
            log.info("{} cost {}ms", pjp.getSignature(),
                System.currentTimeMillis() - start);
        }
    }
}

// 使用
@Timed
public Order create(...) { ... }
```

---

## 九、AOP 五种通知

```java
@Aspect @Component
public class LogAspect {

    @Pointcut("execution(* com.example.service..*.*(..))")
    public void serviceLayer() {}

    @Before("serviceLayer()")
    public void before(JoinPoint jp) {
        log.info("→ {}", jp.getSignature());
    }

    @AfterReturning(pointcut = "serviceLayer()", returning = "ret")
    public void afterReturning(Object ret) { ... }

    @AfterThrowing(pointcut = "serviceLayer()", throwing = "ex")
    public void afterThrowing(Throwable ex) { ... }

    @After("serviceLayer()")
    public void after() { /* finally,无论成功失败 */ }

    @Around("serviceLayer()")
    public Object around(ProceedingJoinPoint pjp) throws Throwable {
        // 包裹整个调用,可改入参/出参
        return pjp.proceed();
    }
}
```

---

## 十、Pointcut 表达式

| 写法 | 含义 |
| --- | --- |
| `execution(* com.x.service.*.*(..))` | service 包下所有类的所有方法 |
| `execution(public Order com.x.OrderService.create(..))` | 精确签名 |
| `within(com.x.service..*)` | 包及子包内所有方法 |
| `@annotation(com.x.Cached)` | 带某注解的方法 |
| `@within(org.springframework.stereotype.Service)` | 类被某注解标注 |
| `bean(userService)` | 名字为 userService 的 Bean |

---

## 十一、AOP 的实现:动态代理

Spring AOP 默认用 **JDK 动态代理**(目标类实现了接口) 或 **CGLIB**(没接口时)生成代理对象。

⚠️ **同类内方法调用,AOP 失效**:

```java
@Service
public class UserService {
    public void a() { b(); }                 // ← 内部直接调用,绕过代理
    @Transactional public void b() { ... }   // 事务不会生效!
}
```

**解决**:

- 把 b 拆到另一个 Bean
- 或注入自己 `@Resource UserService self;` 通过 `self.b()` 走代理
- 或用 `((UserService) AopContext.currentProxy()).b()`(需要 `@EnableAspectJAutoProxy(exposeProxy = true)`)

---

## 十二、典型应用场景

### 1. 统一日志

```java
@Around("execution(* com.x.controller..*.*(..))")
public Object log(ProceedingJoinPoint pjp) throws Throwable {
    Object[] args = pjp.getArgs();
    log.info("→ {} args={}", pjp.getSignature().getName(), args);
    Object ret = pjp.proceed();
    log.info("← {} ret={}", pjp.getSignature().getName(), ret);
    return ret;
}
```

### 2. 自定义注解 + 限流

```java
@Target(METHOD) @Retention(RUNTIME)
public @interface RateLimit { int qps(); }

@Around("@annotation(rl)")
public Object limit(ProceedingJoinPoint pjp, RateLimit rl) throws Throwable {
    if (!bucket(rl.qps()).tryAcquire()) throw new TooManyRequests();
    return pjp.proceed();
}
```

### 3. 操作审计

```java
@AfterReturning("@annotation(Audit)")
public void audit(JoinPoint jp) {
    auditService.record(SecurityHolder.user(), jp.getSignature().toString());
}
```

---

## 十三、AOP 与事务

`@Transactional` 本质就是 AOP 的一个具体应用。理解了 AOP,你才会理解为什么:

- `@Transactional` 加在 private 方法上不生效(JDK 代理只代理 public 接口方法)
- 同类内调用不开事务
- 异常抛 `Checked Exception` 默认不回滚(要加 `rollbackFor = Exception.class`)
- 事务传播 `REQUIRES_NEW` 才能开新事务

---

## 十四、调试技巧

```java
// 看实际注入的是哪个 Bean
@Autowired ApplicationContext ctx;
ctx.getBeansOfType(PayChannel.class).forEach((k, v) ->
    log.info("{} → {}", k, v.getClass()));

// 看 Bean 是否被代理(.getClass() 名字会带 $$EnhancerBySpringCGLIB$$ 或 $Proxy)
log.info("class = {}", userService.getClass());
```

---

## 十五、给新手的建议

1. **能不写 AOP 就别写**——AOP 隐式,排查问题困难
2. **AOP 只用在真"横切"的场景**:日志、事务、权限、限流、缓存
3. **业务逻辑别藏到 AOP 里**,否则别人读代码看不到
4. 永远记住 **"代理对象 ≠ 原对象"**,理解了这一点,你就理解了 AOP 一半的坑
