# Spring Boot 入门

Spring Boot 是 **Spring + 自动配置 + 内嵌 Web 容器** 的工程化组合,目标只有一个:**把 Spring 应用从"配置地狱"里救出来**。

---

## 一、Spring Boot 在做什么

| 痛点(传统 Spring) | Spring Boot 做了什么 |
| --- | --- |
| 一堆 XML / `@Configuration` | **自动配置**:依赖加进来就能用 |
| Tomcat 单独部署 | **内嵌 Tomcat / Jetty / Undertow**,`java -jar` 即可启动 |
| 每个项目都要重复搭脚手架 | **starter 依赖** 一行引入 |
| 配置散落各处 | 统一 `application.yml` |
| 不知道项目跑得怎么样 | **Actuator** 暴露健康/指标 |

一句话:**约定大于配置 + 开箱即用**。

---

## 二、版本对应

| Spring Boot | Spring Framework | JDK |
| --- | --- | --- |
| 2.7.x | 5.3.x | 8 / 11 / 17 |
| 3.0 ~ 3.2 | 6.0 ~ 6.1 | **17+** |
| 3.3 / 3.4 | 6.1 / 6.2 | 17+(推荐 21) |

> 现在新项目直接上 **Spring Boot 3.x + JDK 17/21**。Boot 2.x 已停维护(2023.11),除非维护老项目,别再用。

---

## 三、最快上手

### 1. 用 Spring Initializr 生成

访问 <https://start.spring.io>,选:

- **Project**:Maven 或 Gradle(新项目推 Gradle Kotlin DSL)
- **Language**:Java / Kotlin
- **Spring Boot**:3.x
- **Dependencies**:`Spring Web`、`Spring Boot DevTools`、`Lombok`

或用命令行:

```bash
curl https://start.spring.io/starter.zip \
  -d dependencies=web,devtools,lombok \
  -d type=gradle-project \
  -d language=java \
  -d bootVersion=3.4.0 \
  -d javaVersion=21 \
  -o demo.zip
```

### 2. 项目骨架

```
src/main/java/com/example/demo/
├── DemoApplication.java       ← 入口
└── controller/
    └── HelloController.java
src/main/resources/
├── application.yml            ← 配置
└── static/                    ← 静态资源
```

### 3. 入口类

```java
@SpringBootApplication
public class DemoApplication {
    public static void main(String[] args) {
        SpringApplication.run(DemoApplication.class, args);
    }
}
```

`@SpringBootApplication` = `@Configuration` + `@EnableAutoConfiguration` + `@ComponentScan`,一个注解干仨活。

### 4. 写第一个接口

```java
@RestController
@RequestMapping("/api")
public class HelloController {

    @GetMapping("/hello")
    public Map<String, String> hello(@RequestParam(defaultValue = "world") String name) {
        return Map.of("message", "Hello, " + name);
    }
}
```

```bash
./gradlew bootRun
# or
mvn spring-boot:run

curl localhost:8080/api/hello?name=Tom
# {"message":"Hello, Tom"}
```

到这里,你已经跑通了一个 Spring Boot 应用,**不需要**配 Tomcat、不需要打 war、不需要改 web.xml。

---

## 四、starter 是什么

starter 就是"打包好的依赖集合 + 默认配置"。引入 `spring-boot-starter-web` 会自动:

- 引入 Spring MVC、Tomcat、Jackson
- 注册 `DispatcherServlet`
- 默认端口 8080
- 默认开启静态资源处理

常见 starter:

| starter | 提供能力 |
| --- | --- |
| `spring-boot-starter-web` | Web/MVC + 内嵌 Tomcat |
| `spring-boot-starter-webflux` | 响应式 Web(基于 Netty) |
| `spring-boot-starter-data-jpa` | JPA + Hibernate |
| `spring-boot-starter-data-redis` | Redis 客户端 |
| `spring-boot-starter-security` | Spring Security |
| `spring-boot-starter-validation` | Bean Validation(JSR-380) |
| `spring-boot-starter-actuator` | 健康检查、指标 |
| `mybatis-spring-boot-starter` | MyBatis(社区) |

---

## 五、配置文件 application.yml

YAML 比 properties 可读性好,推荐用 YAML。

```yaml
server:
  port: 8080
  servlet:
    context-path: /api

spring:
  application:
    name: demo
  profiles:
    active: dev
  datasource:
    url: jdbc:mysql://localhost:3306/demo
    username: root
    password: root

logging:
  level:
    root: INFO
    com.example: DEBUG
```

**多环境**:

```
application.yml          ← 公共
application-dev.yml      ← 开发
application-prod.yml     ← 生产
```

通过 `spring.profiles.active=prod` 或环境变量 `SPRING_PROFILES_ACTIVE=prod` 切换。

读取配置:

```java
@Value("${server.port}")
private int port;

// 推荐:批量绑定到对象
@ConfigurationProperties(prefix = "app")
@Data
public class AppProps {
    private String name;
    private int retry;
}
```

---

## 六、自动配置怎么"知道"该装什么

核心是 `@Conditional` 系列注解。比如 Spring 看到 classpath 上有 `H2`,就会自动配一个内嵌数据库:

```java
@Configuration
@ConditionalOnClass(H2ConsoleProperties.class)
@ConditionalOnProperty(prefix = "spring.h2.console", name = "enabled", havingValue = "true")
public class H2ConsoleAutoConfiguration { ... }
```

排查思路:

```bash
# 启动时加 --debug 看自动配置报告
./gradlew bootRun --args='--debug'
```

---

## 七、Bean 的概念(重要!)

Spring 容器管理的对象叫 Bean。你需要知道的最少 4 个注解:

| 注解 | 用途 |
| --- | --- |
| `@Component` | 通用组件 |
| `@Service` | 业务层(语义) |
| `@Repository` | 数据访问层(语义,且会翻译数据库异常) |
| `@Controller` / `@RestController` | Web 层 |

注入用 `@Autowired`,但更推荐 **构造器注入**(配合 Lombok `@RequiredArgsConstructor`):

```java
@Service
@RequiredArgsConstructor
public class UserService {
    private final UserRepository userRepo;       // ← 自动注入
    private final RedisTemplate<String, ?> redis;
}
```

> 经验法则:**不要用字段注入(`@Autowired` 直接打字段上),用构造器注入**——好测试、字段可 final、循环依赖一眼能看出来。

---

## 八、热加载(开发体验)

```text
developmentOnly 'org.springframework.boot:spring-boot-devtools'
```

修改 Java 文件后,IDEA 按 `Ctrl+F9`(或开自动构建),DevTools 会重启 ApplicationContext,比冷启动快 5~10 倍。

更猛的方案:**JRebel**(收费)或 **Spring Boot 3 + GraalVM 原生镜像**(冷启动毫秒级,但开发体验暂不如 JVM 模式)。

---

## 九、打包 & 运行

```bash
./gradlew bootJar
java -jar build/libs/demo-0.0.1-SNAPSHOT.jar

# 指定 profile
java -jar demo.jar --spring.profiles.active=prod

# 用环境变量覆盖配置
SERVER_PORT=9090 java -jar demo.jar
```

Spring Boot 的"可执行 jar"内含 Tomcat,产物就一个 jar,部署极简。

---

## 十、常见踩坑

1. **包扫描问题**:`@SpringBootApplication` 默认扫描自己所在包及子包,Service 放到上层包会扫不到
2. **端口冲突**:8080 已占用,改 `server.port` 或 `kill -9`
3. **数据库连不上**:Boot 3 默认引入了 HikariCP + 自动配 DataSource,**没引数据库依赖时启动会报错**——加 `spring.autoconfigure.exclude=...DataSourceAutoConfiguration` 或干脆引入数据库 starter
4. **JSON 时间格式**:`LocalDateTime` 默认序列化成数组,加 `spring.jackson.date-format=yyyy-MM-dd HH:mm:ss` 和 `spring.jackson.serialization.write-dates-as-timestamps=false`
5. **Lombok 不生效**:IDEA 要装插件 + 开启 Annotation Processing

---

## 十一、推荐学习节奏

1. 跑通 hello world(本章)
2. 理解 IoC、AOP(下一章)
3. 写一个完整 CRUD(05、06 章)
4. 加 JWT 鉴权(07 章)
5. 加 Redis 缓存
6. 打 Docker 镜像
7. 上 K8s

不要一上来就追 GraphQL、Reactor、Native Image,基础不稳,框架越花,坑越深。
