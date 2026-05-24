# Spring Security

Spring Security 是 Spring 生态的安全框架,提供 **认证(Authentication)** 与 **授权(Authorization)** 两大块。它强大,但学习曲线陡——理解了它的"过滤器链"模型,一切就清晰了。

---

## 一、安全的两件事

| 名称 | 回答的问题 | 例 |
| --- | --- | --- |
| 认证 Authentication | 你是谁? | 校验用户名密码 / JWT |
| 授权 Authorization | 你能干什么? | 检查角色 / 权限 |

记忆:**先认证、再授权**。匿名用户也是一种认证(`AnonymousAuthenticationToken`)。

---

## 二、过滤器链

Spring Security 的本质是 **一条 Servlet Filter 链**(`SecurityFilterChain`)。每个请求按顺序穿过约 15 个过滤器:

```
Request
  → SecurityContextPersistenceFilter   (从 session/JWT 加载上下文)
  → CorsFilter
  → CsrfFilter
  → LogoutFilter
  → UsernamePasswordAuthenticationFilter   (表单登录)
  → BearerTokenAuthenticationFilter        (JWT)
  → ExceptionTranslationFilter             (把 AccessDenied 翻译成 401/403)
  → AuthorizationFilter                    (检查权限)
  → ... → Controller
```

理解这一点后,所谓"自定义鉴权",就是往这条链里**塞一个新过滤器**。

---

## 三、最简配置(Spring Boot 3 / Security 6)

```text
implementation 'org.springframework.boot:spring-boot-starter-security'
```

引入即生效:**所有接口都需要登录**,默认账号 `user`,密码在启动日志里打印。

---

## 四、自定义配置

```java
@Configuration
@EnableWebSecurity
@EnableMethodSecurity                 // 启用 @PreAuthorize 等
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthFilter jwtFilter;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        return http
            .csrf(AbstractHttpConfigurer::disable)
            .cors(Customizer.withDefaults())
            .sessionManagement(s -> s.sessionCreationPolicy(STATELESS))   // JWT 无状态
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/login", "/api/register", "/api/health").permitAll()
                .requestMatchers("/api/admin/**").hasRole("ADMIN")
                .anyRequest().authenticated())
            .exceptionHandling(e -> e
                .authenticationEntryPoint((req, res, ex) -> res.setStatus(401))
                .accessDeniedHandler((req, res, ex) -> res.setStatus(403)))
            .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class)
            .build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();         // ⚠️ 永远别明文存密码
    }

    @Bean
    public AuthenticationManager authManager(AuthenticationConfiguration cfg) throws Exception {
        return cfg.getAuthenticationManager();
    }
}
```

---

## 五、UserDetailsService(认证数据源)

Security 需要你告诉它"用户长什么样":

```java
@Service
@RequiredArgsConstructor
public class MyUserDetailsService implements UserDetailsService {
    private final UserRepository repo;

    @Override
    public UserDetails loadUserByUsername(String username) {
        User u = repo.findByUsername(username)
            .orElseThrow(() -> new UsernameNotFoundException(username));
        return org.springframework.security.core.userdetails.User.builder()
            .username(u.getUsername())
            .password(u.getPassword())            // 已经是 BCrypt 后的
            .roles(u.getRole())                   // ROLE_ 前缀会自动加
            .disabled(!u.isEnabled())
            .build();
    }
}
```

---

## 六、JWT 实战(无状态)

无状态 JWT 是目前 Web/移动端最主流的认证方式。

### 1. 依赖

```text
implementation 'io.jsonwebtoken:jjwt-api:0.12.6'
runtimeOnly    'io.jsonwebtoken:jjwt-impl:0.12.6'
runtimeOnly    'io.jsonwebtoken:jjwt-jackson:0.12.6'
```

### 2. JwtService

```java
@Service
public class JwtService {

    private final SecretKey key = Keys.hmacShaKeyFor("a-256-bit-secret-key-must-be-long-enough!".getBytes());
    private static final long EXPIRE = TimeUnit.HOURS.toMillis(2);

    public String issue(String username, List<String> roles) {
        return Jwts.builder()
            .subject(username)
            .claim("roles", roles)
            .issuedAt(new Date())
            .expiration(new Date(System.currentTimeMillis() + EXPIRE))
            .signWith(key)
            .compact();
    }

    public Claims parse(String token) {
        return Jwts.parser().verifyWith(key).build()
            .parseSignedClaims(token).getPayload();
    }
}
```

### 3. 登录接口

```java
@PostMapping("/api/login")
public R<Map<String, String>> login(@RequestBody @Valid LoginDTO dto) {
    Authentication auth = authManager.authenticate(
        new UsernamePasswordAuthenticationToken(dto.username(), dto.password()));
    UserDetails u = (UserDetails) auth.getPrincipal();
    List<String> roles = u.getAuthorities().stream().map(GrantedAuthority::getAuthority).toList();
    return R.ok(Map.of("token", jwt.issue(u.getUsername(), roles)));
}
```

### 4. JwtAuthFilter

```java
@Component
@RequiredArgsConstructor
public class JwtAuthFilter extends OncePerRequestFilter {
    private final JwtService jwt;

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res,
                                    FilterChain chain) throws ServletException, IOException {
        String h = req.getHeader("Authorization");
        if (h != null && h.startsWith("Bearer ")) {
            try {
                Claims c = jwt.parse(h.substring(7));
                @SuppressWarnings("unchecked")
                List<String> roles = (List<String>) c.get("roles");
                var auths = roles.stream().map(SimpleGrantedAuthority::new).toList();
                var token = new UsernamePasswordAuthenticationToken(c.getSubject(), null, auths);
                SecurityContextHolder.getContext().setAuthentication(token);
            } catch (JwtException ignore) { /* 401 由后续过滤器处理 */ }
        }
        chain.doFilter(req, res);
    }
}
```

---

## 七、方法级权限

```java
@Service
public class UserService {

    @PreAuthorize("hasRole('ADMIN')")
    public void deleteUser(long id) { ... }

    @PreAuthorize("hasAuthority('user:read')")
    public User get(long id) { ... }

    @PreAuthorize("#userId == authentication.principal or hasRole('ADMIN')")
    public void update(long userId, UpdateDTO dto) { ... }

    @PostAuthorize("returnObject.tenantId == authentication.principal.tenantId")
    public Order findOrder(long id) { ... }
}
```

| 注解 | 时机 |
| --- | --- |
| `@PreAuthorize` | 进方法前 |
| `@PostAuthorize` | 方法返回后(对返回值判定) |
| `@Secured("ROLE_ADMIN")` | 老式,只支持角色 |

---

## 八、获取当前用户

```java
// 1. 在任何地方
Authentication auth = SecurityContextHolder.getContext().getAuthentication();
String username = auth.getName();

// 2. Controller 注入
@GetMapping("/me")
public User me(@AuthenticationPrincipal UserDetails u) { ... }

// 3. 自定义 Principal(更强类型)
public record CurrentUser(long id, String username, String tenantId, List<String> roles) { }

@GetMapping("/me")
public CurrentUser me(@AuthenticationPrincipal CurrentUser u) { return u; }
```

---

## 九、CSRF 与 CORS

| 名词 | 解决的问题 | 配置 |
| --- | --- | --- |
| **CSRF** | 跨站请求伪造(攻击者用你的 cookie 发请求) | 表单/Cookie 登录场景需开启;**JWT/纯 API 后端可关闭** |
| **CORS** | 浏览器同源策略,前后端不同域 | 必须配 |

```java
http.csrf(c -> c.disable());                       // JWT 项目通常关闭
http.cors(Customizer.withDefaults());              // 配合 WebMvc 的 CorsConfig
```

---

## 十、密码安全

- **永远不存明文**——用 `BCryptPasswordEncoder`(自带 salt)
- 密码字段加 `@JsonIgnore`
- 错误密码 / 不存在用户 **统一返回 "用户名或密码错误"**(防用户名枚举)
- 登录失败应有**限流 / 锁定 / 验证码**机制

```java
String hashed = encoder.encode("plain-pwd");
encoder.matches("plain-pwd", hashed);    // true
```

---

## 十一、常见踩坑

1. **403 with "CSRF token missing"**:JWT 项目记得 `csrf().disable()`
2. **Filter 顺序错**:JwtAuthFilter 必须在 `UsernamePasswordAuthenticationFilter` 之前
3. **`@PreAuthorize` 不生效**:没加 `@EnableMethodSecurity`,或方法不是 public,或同类自调用
4. **`hasRole` vs `hasAuthority`**:`hasRole("ADMIN")` 实际匹配 `ROLE_ADMIN`,搞混会一直 403
5. **token 永久有效**:必须设过期 + 刷新机制
6. **JWT 注销难**:JWT 是无状态的,要"踢人下线"得维护一份黑名单(放 Redis)

---

## 十二、生产级建议

| 维度 | 建议 |
| --- | --- |
| 加密算法 | BCrypt(成本因子 10~12)或 Argon2 |
| Token 存储 | 短期 access token(分钟级)+ 长期 refresh token |
| 敏感操作 | 二次验证(短信 / TOTP) |
| 接口审计 | 所有写操作落 audit_log 表 |
| 限流 | 登录接口 IP / 账号双维度限流 |
| 日志脱敏 | 手机号、身份证、银行卡需打码 |

---

## 十三、给新手的建议

1. **先看懂过滤器链**,再调配置,否则永远在猜
2. **JWT 不是银弹**,小项目用 Session 简单又安全
3. **不要自己实现加密**,用框架自带的 `BCryptPasswordEncoder`
4. **方法级注解优于 URL 级**,业务规则集中在 service 层
5. 上线前用 **OWASP ZAP / Burp** 扫一下你的接口
