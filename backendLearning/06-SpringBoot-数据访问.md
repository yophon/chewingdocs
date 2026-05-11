# Spring Boot 数据访问

Spring Boot 在数据访问层提供了多套方案:**JdbcTemplate、JPA / Hibernate、MyBatis、Spring Data JDBC**。本章讲它们各自的位置、典型用法、踩坑点。

---

## 一、方案对比

| 方案 | 抽象层级 | SQL 控制力 | 心智负担 | 适合 |
| --- | --- | --- | --- | --- |
| JdbcTemplate | 极低 | 完全(自己写 SQL) | 低 | 简单脚本 / 报表 |
| Spring Data JDBC | 低 | 高 | 中 | 简单聚合根、不需要懒加载 |
| **MyBatis** | 中 | **极高**(SQL 和 Java 解耦) | 中 | 国内主流,SQL 复杂、性能敏感 |
| **JPA / Hibernate** | 高 | 中(默认生成 SQL,可写 JPQL/Native) | 高 | 业务 CRUD 多、领域模型清晰 |
| jOOQ | 高 | 极高(类型安全 SQL DSL) | 中 | 重度 SQL + 类型安全爱好者 |

> 经验法则:
> - **国内项目主流是 MyBatis-Plus**,SQL 友好、生态成熟
> - **欧美 / DDD 重项目**多用 JPA / Hibernate
> - **小工具 / 报表 / 数据迁移**用 JdbcTemplate 即可

---

## 二、连接池:HikariCP

Spring Boot 2.x 起默认 HikariCP(目前性能最快的 JDBC 连接池)。

```yaml
spring:
  datasource:
    url: jdbc:mysql://localhost:3306/demo?useUnicode=true&characterEncoding=utf-8&serverTimezone=Asia/Shanghai
    username: root
    password: root
    hikari:
      maximum-pool-size: 20            # 不是越大越好,看下游和 CPU
      minimum-idle: 5
      connection-timeout: 3000
      idle-timeout: 600000
      max-lifetime: 1800000             # < MySQL wait_timeout(默认 28800s)
      leak-detection-threshold: 60000   # 超过 60s 没归还,打日志
```

⚠️ **`max-lifetime` 必须小于 MySQL `wait_timeout`**,否则 MySQL 已经把连接关了池子还在用,报 `CommunicationsException`。

---

## 三、JdbcTemplate(最薄那层)

```gradle
implementation 'org.springframework.boot:spring-boot-starter-jdbc'
```

```java
@Repository
@RequiredArgsConstructor
public class UserDao {
    private final JdbcTemplate jdbc;

    public User findById(long id) {
        return jdbc.queryForObject(
            "SELECT id, name, email FROM users WHERE id = ?",
            (rs, i) -> new User(rs.getLong("id"), rs.getString("name"), rs.getString("email")),
            id);
    }

    public int insert(User u) {
        return jdbc.update("INSERT INTO users(name,email) VALUES(?,?)", u.getName(), u.getEmail());
    }
}
```

适合:简单查询、批处理、动态 SQL 较少。

---

## 四、JPA / Spring Data JPA

```gradle
implementation 'org.springframework.boot:spring-boot-starter-data-jpa'
runtimeOnly    'com.mysql:mysql-connector-j'
```

### 1. 实体

```java
@Entity
@Table(name = "users")
@Getter @Setter @NoArgsConstructor
public class User {
    @Id @GeneratedValue(strategy = IDENTITY)
    private Long id;

    @Column(nullable = false, length = 30)
    private String name;

    private String email;

    @CreationTimestamp
    private LocalDateTime createdAt;

    @UpdateTimestamp
    private LocalDateTime updatedAt;

    @Version
    private Integer version;          // 乐观锁
}
```

### 2. Repository

```java
public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByEmail(String email);

    List<User> findByNameContainingOrderByIdDesc(String keyword, Pageable pg);

    @Query("SELECT u FROM User u WHERE u.email = :email")
    Optional<User> queryByEmail(@Param("email") String email);

    @Modifying
    @Query("UPDATE User u SET u.name = :name WHERE u.id = :id")
    int rename(@Param("id") Long id, @Param("name") String name);
}
```

只要继承 `JpaRepository`,常见 CRUD 就有了:`save / findById / findAll / delete / count` …

### 3. 分页与排序

```java
Page<User> page = repo.findAll(PageRequest.of(0, 20, Sort.by("id").descending()));
page.getContent();   // List<User>
page.getTotalElements();
page.getTotalPages();
```

### 4. JPA 三大坑

1. **N+1 查询**:对一对多关系遍历访问会触发 N 次 SQL
   - 解决:`@EntityGraph(attributePaths = "orders")` 或 `JOIN FETCH`
2. **OpenSessionInView**(默认开启)让懒加载在 Controller 里也能跑,但**掩盖了 N+1 问题**
   - 生产建议关闭:`spring.jpa.open-in-view: false`
3. **`save` 不一定 INSERT**:JPA 的 `save` 是 "merge" 语义,会先 SELECT 看是否存在
   - 大批量插入用 `EntityManager.persist` + 手工 flush

---

## 五、MyBatis(国内主流)

```gradle
implementation 'org.mybatis.spring.boot:mybatis-spring-boot-starter:3.0.3'
```

### 1. 注解版

```java
@Mapper
public interface UserMapper {

    @Select("SELECT * FROM users WHERE id = #{id}")
    User findById(long id);

    @Insert("INSERT INTO users(name,email) VALUES(#{name},#{email})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(User u);
}
```

### 2. XML 版(复杂 SQL 推荐)

```xml
<!-- mapper/UserMapper.xml -->
<mapper namespace="com.x.UserMapper">

  <select id="search" resultType="User">
    SELECT * FROM users
    <where>
      <if test="keyword != null">AND name LIKE CONCAT('%', #{keyword}, '%')</if>
      <if test="status != null">AND status = #{status}</if>
    </where>
    ORDER BY id DESC
    LIMIT #{offset}, #{size}
  </select>
</mapper>
```

```yaml
mybatis:
  mapper-locations: classpath:mapper/*.xml
  configuration:
    map-underscore-to-camel-case: true
    log-impl: org.apache.ibatis.logging.stdout.StdOutImpl
```

### 3. MyBatis-Plus(国内 90% 的项目)

`mybatis-plus-spring-boot3-starter`,在 MyBatis 基础上加了通用 CRUD、条件构造器、分页:

```java
public interface UserMapper extends BaseMapper<User> { }

userMapper.selectList(new LambdaQueryWrapper<User>()
    .eq(User::getStatus, 1)
    .like(User::getName, "tom")
    .orderByDesc(User::getId));
```

> ⚠️ MyBatis-Plus 用着爽,但**坏处是大家都不写 SQL 了**,慢查询和索引意识会下降。新项目至少**自己手动写过几个核心查询**再上 plus。

---

## 六、`#{}` vs `${}`

```sql
-- ✅ 占位符,自动 PreparedStatement,防 SQL 注入
WHERE name = #{name}

-- ⚠️ 直接字符串拼接,易 SQL 注入
ORDER BY ${sortField}
```

`${}` 只在**字段名 / 表名 / ORDER BY 字段** 这种语法位置用,且必须**白名单校验**。

---

## 七、事务 `@Transactional`

```java
@Service
@RequiredArgsConstructor
public class OrderService {

    private final OrderRepository orderRepo;
    private final StockService stock;

    @Transactional(rollbackFor = Exception.class)
    public Order place(CreateOrderDTO dto) {
        Order o = orderRepo.save(new Order(dto));
        stock.decrease(dto.getProductId(), dto.getCount());     // 抛异常会回滚
        return o;
    }
}
```

### 必须知道的几个事实

1. **默认只回滚 `RuntimeException` 和 `Error`**,Checked Exception 不回滚
   - 总是加 `rollbackFor = Exception.class` 或抛 RuntimeException
2. **同类调用失效**:`@Transactional` 基于 AOP,自调用绕过代理
3. **`REQUIRED`(默认)**: 加入当前事务,没就新建。`REQUIRES_NEW` 永远开新事务
4. **事务方法必须 public**(JDK 代理限制)
5. **大事务是性能大敌**:别把 IO 调用、远程接口塞进 `@Transactional`,会长期持有数据库连接

---

## 八、批量操作的姿势

### MyBatis 批量插入

```xml
<insert id="batchInsert">
  INSERT INTO users(name, email) VALUES
  <foreach collection="list" item="u" separator=",">
    (#{u.name}, #{u.email})
  </foreach>
</insert>
```

### JDBC 批处理

```java
jdbc.batchUpdate("INSERT INTO users(name) VALUES(?)", new BatchPreparedStatementSetter() {
    public void setValues(PreparedStatement ps, int i) throws SQLException {
        ps.setString(1, list.get(i).getName());
    }
    public int getBatchSize() { return list.size(); }
});
```

⚠️ MySQL 连接 URL 必须加 `rewriteBatchedStatements=true`,否则 JDBC 批处理会一条一条发。

---

## 九、动态数据源

读写分离 / 多租户场景常需要切换数据源。常用方案:

- 自己用 `AbstractRoutingDataSource` 写一个
- 用 [dynamic-datasource-spring-boot3-starter](https://github.com/baomidou/dynamic-datasource-spring-boot-starter)
- ShardingSphere(分库分表 + 读写分离)

```java
@DS("slave")               // dynamic-datasource 注解
public List<User> list() { ... }

@DS("master")
public void create(User u) { ... }
```

---

## 十、SQL 监控:p6spy / Druid

排查慢 SQL、查看真实执行 SQL,推荐 [p6spy](https://github.com/p6spy/p6spy):

```yaml
spring:
  datasource:
    url: jdbc:p6spy:mysql://localhost:3306/demo
    driver-class-name: com.p6spy.engine.spy.P6SpyDriver
```

它会在日志里输出**带参数的最终 SQL**,而不是 `?`。

---

## 十一、给新手的建议

1. **先选好 ORM 再开工**,中途换代价巨大
2. **学会看 EXPLAIN**,所有 ORM 上层魔法,最终都落到 SQL
3. **小心 N+1**,关联查询要么 join,要么 in 批量
4. **别把所有逻辑放事务里**,事务越短越好
5. **慢查询日志一定开**,生产数据库稳定性 80% 由索引和慢 SQL 决定
6. **不要在循环里查询数据库**,这是新手最常见的性能 BUG
