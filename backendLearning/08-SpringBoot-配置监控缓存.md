# Spring Boot 配置 · 监控 · 缓存

这一章把 Spring Boot 的"非业务但生产必备"能力打包讲:**多环境配置、Actuator、Micrometer、Spring Cache、Logback**。这些在 demo 阶段感受不到价值,上线后才发现少一个都难受。

---

## 一、Profile 多环境

```
src/main/resources/
├── application.yml            ← 公共 + 默认值
├── application-dev.yml
├── application-test.yml
├── application-prod.yml
```

```yaml
# application.yml
spring:
  profiles:
    active: ${SPRING_PROFILES_ACTIVE:dev}      # 环境变量优先,没有则 dev
```

启用方式优先级:**命令行 > 环境变量 > 配置文件**。

```bash
java -jar app.jar --spring.profiles.active=prod
SPRING_PROFILES_ACTIVE=prod java -jar app.jar
```

**条件 Bean**:

```java
@Configuration
@Profile("!prod")
public class DevDataInitializer { ... }     // 非 prod 环境注入测试数据
```

---

## 二、配置优先级(从高到低)

1. 命令行参数 `--server.port=9000`
2. 环境变量 `SERVER_PORT=9000`(下划线对应点号)
3. `application-{profile}.yml`
4. `application.yml`
5. `@PropertySource` 引入的文件
6. `@Value` 默认值

> 经验法则:**敏感配置(密码、密钥)走环境变量或配置中心,绝不进 Git**。

---

## 三、配置中心

中大型项目把配置集中管理:

| 工具 | 厂商/社区 |
| --- | --- |
| Nacos | 阿里(国内主流) |
| Apollo | 携程 |
| Spring Cloud Config | Spring 官方 |
| Consul / Etcd | HashiCorp / CoreOS |

```yaml
spring:
  cloud:
    nacos:
      config:
        server-addr: nacos:8848
        file-extension: yaml
```

支持 **配置热更新**:`@RefreshScope` 注解的 Bean 会在配置变化时重建。

---

## 四、日志:Logback + MDC

Spring Boot 默认用 Logback。

```yaml
logging:
  level:
    root: INFO
    com.example: DEBUG
    org.hibernate.SQL: DEBUG                  # 看 SQL
  pattern:
    console: "%d{HH:mm:ss.SSS} [%thread] [%X{traceId:-}] %-5level %logger{36} - %msg%n"
  file:
    name: /var/log/app/app.log
  logback:
    rollingpolicy:
      max-file-size: 100MB
      max-history: 30
      total-size-cap: 10GB
```

**MDC**(Mapped Diagnostic Context)能让每条日志带上 traceId:

```java
MDC.put("traceId", "abc123");
log.info("user login");        // 输出 ... [abc123] ... user login
MDC.clear();
```

---

## 五、Actuator(健康 / 指标 / 信息)

```text
implementation 'org.springframework.boot:spring-boot-starter-actuator'
```

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,prometheus,env,loggers
  endpoint:
    health:
      show-details: when_authorized          # 不要轻易 always 暴露
```

常用端点:

| 端点 | 作用 |
| --- | --- |
| `/actuator/health` | 健康检查(K8s liveness/readiness 必备) |
| `/actuator/info` | 应用信息(版本、git commit) |
| `/actuator/metrics` | JVM、HTTP、DB 等指标 |
| `/actuator/prometheus` | Prometheus 格式指标 |
| `/actuator/loggers` | 动态调日志级别 |
| `/actuator/env` | 当前所有配置(⚠️ 含敏感信息,生产别开) |
| `/actuator/threaddump` | 线程栈 |
| `/actuator/heapdump` | 堆 dump(下载) |

> ⚠️ **生产环境** Actuator 端点要么走内网,要么加 Spring Security 限制访问,**绝不能裸暴露**。

---

## 六、自定义健康检查

```java
@Component
public class RedisHealthIndicator implements HealthIndicator {
    private final RedisTemplate<String, ?> redis;

    public Health health() {
        try {
            redis.execute((RedisCallback<String>) c -> { c.ping(); return null; });
            return Health.up().build();
        } catch (Exception e) {
            return Health.down(e).build();
        }
    }
}
```

---

## 七、Micrometer(指标抽象层)

Micrometer 是 JVM 世界的"SLF4J for metrics",对接 Prometheus / Datadog / InfluxDB / NewRelic。

```text
implementation 'io.micrometer:micrometer-registry-prometheus'
```

```java
@RestController
@RequiredArgsConstructor
public class OrderController {
    private final MeterRegistry registry;

    @PostMapping("/orders")
    public Order create(...) {
        Timer.Sample sample = Timer.start(registry);
        try {
            return service.create(...);
        } finally {
            sample.stop(registry.timer("order.create",
                "channel", channel));
        }
    }

    @PostConstruct
    public void initGauges() {
        Gauge.builder("queue.depth", queue, Queue::size).register(registry);
    }
}
```

四种指标类型:

| 类型 | 用途 |
| --- | --- |
| Counter | 单调递增计数(请求数、错误数) |
| Gauge | 当前值(队列深度、连接数) |
| Timer | 耗时分布(P50/P95/P99) |
| DistributionSummary | 任意数值分布(请求体大小) |

---

## 八、Spring Cache

注解式缓存,支持本地 / Redis / Caffeine。

```text
implementation 'org.springframework.boot:spring-boot-starter-data-redis'
implementation 'org.springframework.boot:spring-boot-starter-cache'
```

```java
@SpringBootApplication
@EnableCaching
public class App { }
```

```java
@Service
@RequiredArgsConstructor
public class UserService {

    @Cacheable(value = "user", key = "#id", unless = "#result == null")
    public User get(long id) {
        return repo.findById(id).orElse(null);     // 第一次走 DB,之后走缓存
    }

    @CachePut(value = "user", key = "#u.id")
    public User update(User u) { return repo.save(u); }

    @CacheEvict(value = "user", key = "#id")
    public void delete(long id) { repo.deleteById(id); }

    @CacheEvict(value = "user", allEntries = true)
    public void clearAll() { }
}
```

### Redis 序列化与 TTL

```java
@Bean
public RedisCacheManager cacheManager(RedisConnectionFactory cf) {
    RedisCacheConfiguration cfg = RedisCacheConfiguration.defaultCacheConfig()
        .entryTtl(Duration.ofMinutes(10))
        .disableCachingNullValues()
        .serializeValuesWith(SerializationPair.fromSerializer(
            new GenericJackson2JsonRedisSerializer()));      // 默认 JDK 序列化是坑,改 JSON
    return RedisCacheManager.builder(cf).cacheDefaults(cfg).build();
}
```

⚠️ Spring Cache 默认序列化是 JDK,对象一改字段就反序列化失败,**生产必须换成 JSON**。

---

## 九、缓存三大问题

| 问题 | 现象 | 应对 |
| --- | --- | --- |
| 缓存穿透 | 查不存在的 key,每次打 DB | 缓存空值 + 布隆过滤器 |
| 缓存击穿 | 某个 hot key 过期瞬间打爆 DB | 互斥锁 / 永不过期(逻辑过期) |
| 缓存雪崩 | 大量 key 同时过期 | TTL 加随机抖动 |

```java
@Cacheable(value = "user", key = "#id", unless = "#result == null")
public User get(long id) { ... }            // unless 防止缓存 null

// 雪崩:配置时给 TTL 加 ±10% 随机
.entryTtl(Duration.ofMinutes(10 + ThreadLocalRandom.current().nextInt(-1, 2)))
```

第 20 章会专门讲 Redis 实战,这里先建立"缓存不是免费午餐"的概念。

---

## 十、线程池与异步

```java
@SpringBootApplication
@EnableAsync
public class App { }

@Configuration
public class AsyncConfig {
    @Bean("biz")
    public Executor bizExecutor() {
        var ex = new ThreadPoolTaskExecutor();
        ex.setCorePoolSize(8);
        ex.setMaxPoolSize(32);
        ex.setQueueCapacity(2000);
        ex.setThreadNamePrefix("biz-");
        ex.setRejectedExecutionHandler(new CallerRunsPolicy());
        ex.initialize();
        return ex;
    }
}

@Service
public class NotifyService {
    @Async("biz")
    public void send(String to, String msg) { ... }    // 立即返回,异步执行
}
```

⚠️ `@Async` 同样基于 AOP,**同类自调用失效**。

---

## 十一、定时任务

```java
@SpringBootApplication
@EnableScheduling
public class App { }

@Component
public class CleanupTask {

    @Scheduled(cron = "0 0 3 * * ?")          // 每天凌晨 3 点
    public void daily() { ... }

    @Scheduled(fixedDelay = 60_000)            // 上次执行结束后 60s
    public void poll() { ... }
}
```

⚠️ 单机定时任务在多实例部署时会重复执行,生产用 **xxl-job / ElasticJob / Quartz Cluster**。

---

## 十二、给新手的建议

1. **配置敏感信息走环境变量**,Git 里只留 placeholder
2. **`/actuator/health` 是 K8s 探针的命脉**,务必保证它真的反映服务可用性
3. **指标比日志更适合监控**,日志用来看错误细节,指标用来看趋势
4. **缓存先想好失效策略再加**,粗暴 `@Cacheable` 等于埋雷
5. **线程池一定自己定义**,别用 Spring 默认的 `SimpleAsyncTaskExecutor`(每次新建线程)
