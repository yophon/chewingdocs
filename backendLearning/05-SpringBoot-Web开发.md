# Spring Boot Web 开发

写 RESTful 接口是后端最常见的活儿。这一章覆盖 Spring MVC 的核心写法:**路由、参数绑定、响应、校验、异常、拦截器、文件上传**。

---

## 一、Controller 与路由

```java
@RestController                       // = @Controller + @ResponseBody
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService service;

    @GetMapping                       // GET /api/users
    public List<User> list() { ... }

    @GetMapping("/{id}")              // GET /api/users/42
    public User get(@PathVariable Long id) { ... }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public User create(@RequestBody @Valid CreateUserDTO dto) { ... }

    @PutMapping("/{id}")
    public User update(@PathVariable Long id, @RequestBody @Valid UpdateUserDTO dto) { ... }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) { ... }
}
```

`@RestController` 等价于 `@Controller + @ResponseBody`,意思是:**所有方法返回值会被序列化成 JSON**(而不是渲染模板)。

---

## 二、参数绑定

| 注解 | 来源 | 例 |
| --- | --- | --- |
| `@PathVariable` | URL 路径 | `/users/{id}` |
| `@RequestParam` | URL ?查询参数 / 表单 | `?name=tom` |
| `@RequestBody` | 请求体(JSON) | POST/PUT |
| `@RequestHeader` | Header | `Authorization` |
| `@CookieValue` | Cookie | `JSESSIONID` |
| 普通对象 | 绑定 query / form | `User user`(基于字段名) |

```java
@GetMapping("/search")
public Page<User> search(
    @RequestParam(defaultValue = "") String keyword,
    @RequestParam(defaultValue = "1")  int page,
    @RequestParam(defaultValue = "20") int size,
    @RequestHeader("X-Tenant-Id") String tenantId
) { ... }
```

---

## 三、返回值

```java
// 1. 直接返对象 → 默认 200
@GetMapping("/{id}")
public User get(...) { return user; }

// 2. ResponseEntity:能控制状态码 / Header
@GetMapping("/{id}")
public ResponseEntity<User> get(...) {
    return ResponseEntity.ok()
        .header("X-Trace", traceId)
        .body(user);
}

// 3. 自定义状态码
@PostMapping
@ResponseStatus(HttpStatus.CREATED)
public User create(...) { ... }

// 4. 文件下载(流)
@GetMapping("/export")
public ResponseEntity<Resource> export() {
    return ResponseEntity.ok()
        .contentType(MediaType.APPLICATION_OCTET_STREAM)
        .header(CONTENT_DISPOSITION, "attachment; filename=data.csv")
        .body(new InputStreamResource(in));
}
```

---

## 四、统一响应包装

业内常见做法:所有接口包成 `{ code, message, data }`。

```java
@Data
@AllArgsConstructor
public class R<T> {
    private int code;
    private String message;
    private T data;

    public static <T> R<T> ok(T data)   { return new R<>(0, "ok", data); }
    public static <T> R<T> fail(int c, String m) { return new R<>(c, m, null); }
}

@GetMapping("/{id}")
public R<User> get(@PathVariable Long id) {
    return R.ok(service.get(id));
}
```

> ⚠️ **不要把所有错误也回 200 + code=-1**——HTTP 状态码该 4xx/5xx 时仍然要按 HTTP 标准回(只是 body 用 `R` 结构)。

更优雅的做法:用 `ResponseBodyAdvice` 自动包装:

```java
@RestControllerAdvice
public class WrapAdvice implements ResponseBodyAdvice<Object> {
    public boolean supports(...) { return true; }
    public Object beforeBodyWrite(Object body, ...) {
        if (body instanceof R) return body;
        return R.ok(body);
    }
}
```

---

## 五、参数校验(Bean Validation)

加依赖:

```text
implementation 'org.springframework.boot:spring-boot-starter-validation'
```

```java
@Data
public class CreateUserDTO {
    @NotBlank @Size(min = 2, max = 30)
    private String name;

    @NotBlank @Email
    private String email;

    @Min(0) @Max(150)
    private int age;

    @Pattern(regexp = "^1[3-9]\\d{9}$")
    private String phone;

    @NotNull @Valid                  // 嵌套校验
    private Address address;
}

@PostMapping
public R<User> create(@RequestBody @Valid CreateUserDTO dto) { ... }
```

常见注解:

| 注解 | 作用 |
| --- | --- |
| `@NotNull / @NotEmpty / @NotBlank` | 非空(语义递增:不为 null / 不为空集合 / 不为纯空白字符串) |
| `@Size(min, max)` | 长度 |
| `@Min / @Max / @Range` | 数值范围 |
| `@Email / @URL / @Pattern` | 格式 |
| `@Valid` | 触发嵌套对象校验 |

校验失败默认抛 `MethodArgumentNotValidException`,需要在全局异常里捕获。

---

## 六、统一异常处理

```java
@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    // 自定义业务异常
    @ExceptionHandler(BizException.class)
    public ResponseEntity<R<?>> handleBiz(BizException e) {
        return ResponseEntity.status(e.getStatus())
            .body(R.fail(e.getCode(), e.getMessage()));
    }

    // 参数校验失败
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<R<?>> handleValidation(MethodArgumentNotValidException e) {
        String msg = e.getBindingResult().getFieldErrors().stream()
            .map(f -> f.getField() + " " + f.getDefaultMessage())
            .collect(Collectors.joining("; "));
        return ResponseEntity.badRequest().body(R.fail(400, msg));
    }

    // 兜底
    @ExceptionHandler(Exception.class)
    public ResponseEntity<R<?>> handleAll(Exception e) {
        log.error("unhandled", e);
        return ResponseEntity.internalServerError()
            .body(R.fail(500, "服务异常"));
    }
}
```

```java
public class BizException extends RuntimeException {
    private final int code;
    private final HttpStatus status;
    public BizException(int code, HttpStatus status, String msg) {
        super(msg); this.code = code; this.status = status;
    }
}
```

> 经验法则:**业务异常用 RuntimeException**,Checked Exception 让代码丑且默认不回滚事务。

---

## 七、过滤器 / 拦截器 / AOP 三件套

| 层级 | 时机 | 典型用途 |
| --- | --- | --- |
| **Filter**(Servlet) | 最外层,Request/Response 阶段 | CORS、压缩、日志、链路 traceId |
| **Interceptor** | DispatcherServlet 内,Handler 前后 | 鉴权、统一参数注入、性能监控 |
| **AOP** | 方法级 | 业务横切(事务、缓存、限流) |

**写一个 traceId Filter**:

```java
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class TraceIdFilter extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res,
                                    FilterChain chain) throws ServletException, IOException {
        String tid = Optional.ofNullable(req.getHeader("X-Trace-Id"))
            .orElse(UUID.randomUUID().toString().replace("-", "").substring(0, 16));
        MDC.put("traceId", tid);                  // 日志自动带上
        res.setHeader("X-Trace-Id", tid);
        try { chain.doFilter(req, res); }
        finally { MDC.clear(); }
    }
}
```

**写一个鉴权 Interceptor**:

```java
@Component
@RequiredArgsConstructor
public class AuthInterceptor implements HandlerInterceptor {
    private final JwtService jwt;

    @Override
    public boolean preHandle(HttpServletRequest req, HttpServletResponse res, Object h) {
        String token = req.getHeader("Authorization");
        if (token == null || !token.startsWith("Bearer ")) {
            res.setStatus(401); return false;
        }
        UserContext.set(jwt.parse(token.substring(7)));
        return true;
    }
    @Override
    public void afterCompletion(...) { UserContext.clear(); }
}

@Configuration
@RequiredArgsConstructor
class WebConfig implements WebMvcConfigurer {
    private final AuthInterceptor auth;
    public void addInterceptors(InterceptorRegistry r) {
        r.addInterceptor(auth)
            .addPathPatterns("/api/**")
            .excludePathPatterns("/api/login", "/api/health");
    }
}
```

---

## 八、文件上传

```java
@PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
public R<String> upload(@RequestPart MultipartFile file,
                        @RequestParam String type) throws IOException {
    if (file.getSize() > 10 * 1024 * 1024) throw new BizException(400, BAD_REQUEST, "超过 10MB");
    String name = UUID.randomUUID() + "-" + file.getOriginalFilename();
    file.transferTo(Path.of("/data/upload", name));
    return R.ok(name);
}
```

`application.yml`:

```yaml
spring:
  servlet:
    multipart:
      max-file-size: 50MB
      max-request-size: 100MB
```

---

## 九、跨域

```java
@Configuration
public class CorsConfig {
    @Bean
    public CorsFilter corsFilter() {
        CorsConfiguration c = new CorsConfiguration();
        c.addAllowedOriginPattern("*");           // 注意:如果 setAllowCredentials(true),不能用 *,要列举
        c.addAllowedHeader("*");
        c.addAllowedMethod("*");
        c.setAllowCredentials(true);
        UrlBasedCorsConfigurationSource src = new UrlBasedCorsConfigurationSource();
        src.registerCorsConfiguration("/**", c);
        return new CorsFilter(src);
    }
}
```

也可以用 `@CrossOrigin` 标注在 Controller 上,但全局配置更清晰。

---

## 十、JSON 序列化(Jackson)

```yaml
spring:
  jackson:
    date-format: yyyy-MM-dd HH:mm:ss
    time-zone: Asia/Shanghai
    default-property-inclusion: non_null   # null 字段不输出
    serialization:
      write-dates-as-timestamps: false
      fail-on-empty-beans: false
    deserialization:
      fail-on-unknown-properties: false
```

字段级控制:

```java
public class User {
    @JsonIgnore               // 不序列化(密码、token 字段必加!)
    private String password;

    @JsonProperty("user_name")
    private String name;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate birthday;
}
```

⚠️ **永远不要**让密码、token 等敏感字段意外序列化出去。

---

## 十一、API 文档:OpenAPI

```text
implementation 'org.springdoc:springdoc-openapi-starter-webmvc-ui:2.6.0'
```

启动后访问:

- `/v3/api-docs` → JSON
- `/swagger-ui.html` → 可视化页面

```java
@Operation(summary = "查询用户")
@GetMapping("/{id}")
public User get(@Parameter(description = "用户 ID") @PathVariable Long id) { ... }
```

---

## 十二、给新手的建议

1. **DTO 与实体分离**:接口入参用 DTO,数据库实体用 Entity,别让数据库结构污染接口
2. **`@Valid` 不要漏**,90% 的"诡异 NPE"是没校验
3. **统一异常一定要有**,否则栈信息直接暴露给前端是**安全问题**
4. **MDC + traceId 必上**,生产排查神器
5. **上线前过一遍 Swagger**,看 URL 是不是 RESTful、字段命名一致
