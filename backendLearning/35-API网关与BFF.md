# API 网关与 BFF

服务多了之后，**所有请求都直接打到业务服务上** 是行不通的——鉴权、限流、日志、跨域、版本路由这些横切关心点会被每个服务重复实现。**API 网关（API Gateway）** 就是把这些抽到入口处统一处理的那一层。

而当前后端类型多起来（Web、iOS、Android、小程序、Admin 后台），又会出现"一个接口怎么改都不顺"的问题——**BFF（Backend For Frontend）** 是这个问题的常见解。

---

## 一、为什么需要网关

```
没有网关：
Client ──▶ Service A
       ├─▶ Service B   每个服务自己做鉴权、限流、日志、跨域
       └─▶ Service C

有网关：
Client ──▶ Gateway ──▶ Service A
                  ├─▶ Service B
                  └─▶ Service C
```

网关把这些抽走：

| 职责 | 说明 |
| --- | --- |
| **路由** | URL 前缀 / Header / Host 转发到后端 |
| **鉴权** | JWT / API Key / OAuth |
| **限流** | 按 IP / 用户 / 接口 |
| **熔断** | 后端挂时快速失败 |
| **协议转换** | HTTP ↔ gRPC ↔ WebSocket |
| **日志 / Trace** | 入口统一埋点 |
| **黑白名单 / WAF** | 拦截恶意流量 |
| **灰度 / AB** | 按用户分流到 v1 / v2 |
| **缓存** | 静态接口结果缓存 |

---

## 二、主流网关对比

| 网关 | 特点 | 性能 | 适用 |
| --- | --- | --- | --- |
| **Nginx + Lua（OpenResty）** | 老牌、性能极强、Lua 可编程 | 极高 | 自研深度定制 |
| **Kong** | 基于 OpenResty，插件丰富 | 高 | 企业通用 |
| **APISIX** | 国产，etcd 动态配置，云原生 | 高 | 云原生 / 大流量 |
| **Spring Cloud Gateway** | 基于 Reactor，Java 生态 | 中 | Spring Cloud 体系 |
| **Envoy** | C++，xDS 动态配置 | 极高 | Service Mesh / 复杂控制面 |
| **Traefik** | 自动发现 K8s Ingress | 中 | K8s 简单流量管理 |
| **Higress** | 阿里开源，Envoy + Istio | 高 | K8s + 微服务 |

> 经验法则：**Java 团队上 Spring Cloud Gateway，云原生 / 多语言上 APISIX 或 Higress**，超大流量去 Envoy + 自研控制面。

---

## 三、Spring Cloud Gateway 实战

```yaml
spring:
  cloud:
    gateway:
      routes:
        - id: user-service
          uri: lb://user-service           # lb:// 走注册中心
          predicates:
            - Path=/api/users/**
          filters:
            - StripPrefix=1                # 转发前去掉 /api
            - name: RequestRateLimiter     # 限流
              args:
                redis-rate-limiter.replenishRate: 100
                redis-rate-limiter.burstCapacity: 200
                key-resolver: "#{@ipKeyResolver}"
            - name: CircuitBreaker
              args:
                name: userCB
                fallbackUri: forward:/fallback/user

        - id: order-service
          uri: lb://order-service
          predicates:
            - Path=/api/orders/**
            - Header=X-Tenant, ^(?!internal).*$   # Header 路由
          filters:
            - StripPrefix=1
```

### 自定义鉴权过滤器

```java
@Component
public class AuthFilter implements GlobalFilter, Ordered {
    @Override
    public Mono<Void> filter(ServerWebExchange ex, GatewayFilterChain chain) {
        String token = ex.getRequest().getHeaders().getFirst("Authorization");
        if (token == null || !jwtVerifier.valid(token)) {
            ex.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
            return ex.getResponse().setComplete();
        }
        // 把 userId 透传给下游
        var req = ex.getRequest().mutate()
            .header("X-User-Id", jwtVerifier.userId(token)).build();
        return chain.filter(ex.mutate().request(req).build());
    }
    @Override public int getOrder() { return -100; }
}
```

---

## 四、限流算法速查

| 算法 | 思路 | 特点 |
| --- | --- | --- |
| **计数器** | 一个时间窗内计数 | 简单，跨窗口边界会突刺 |
| **滑动窗口** | 多个小窗口 | 平滑 |
| **令牌桶** | 桶里令牌定速生成，请求来取 | 允许突发 |
| **漏桶** | 桶定速漏水，超出排队 / 拒绝 | 严格平滑 |

工业实现常用 **Redis + Lua**（保证原子性）或网关内置（Nginx limit_req、APISIX limit-count）。

```lua
-- 令牌桶简化版（Redis Lua）
local key = KEYS[1]
local rate = tonumber(ARGV[1])
local cap  = tonumber(ARGV[2])
local now  = tonumber(ARGV[3])

local data = redis.call("HMGET", key, "tokens", "ts")
local tokens = tonumber(data[1]) or cap
local ts = tonumber(data[2]) or now
tokens = math.min(cap, tokens + (now - ts) * rate)
if tokens < 1 then return 0 end
tokens = tokens - 1
redis.call("HMSET", key, "tokens", tokens, "ts", now)
return 1
```

---

## 五、BFF 模式

**问题**：直接把领域服务接口暴露给前端，会撞上几堵墙：

- Web 要详细字段、移动端要瘦身
- 一个页面要并发调用 5 个领域服务
- 移动端弱网，希望"一个请求拿全所有数据"
- 不同端鉴权、token 体系不同

**方案**：**为每个前端类型建一个专属 BFF**：

```
                  ┌────────────┐
Web   ────▶ Web-BFF
                  ├────────────▶  user-svc
Mobile ────▶ M-BFF                order-svc
                  ├────────────▶  product-svc
小程序 ────▶ Mini-BFF             payment-svc
                  └────────────┘
```

BFF 的核心心智：**把"前端友好"留给 BFF，把"领域纯净"留给后端服务**。

### BFF 一定会做的几件事

1. **聚合**：调多个领域服务后拼成"页面 DTO"
2. **裁剪**：返回前端真正用到的字段
3. **格式转换**：snake_case ↔ camelCase、时区转换、枚举翻译
4. **缓存**：页面级缓存
5. **降级**：某个领域服务挂时返回兜底数据

```ts
// Mobile BFF：商品详情页
app.get("/m/v1/product/:id/detail", async (c) => {
  const id = c.req.param("id");
  const [product, comments, recommend, stock] = await Promise.all([
    productSvc.get(id),
    commentSvc.top(id, 5),
    recommendSvc.similar(id, 10),
    stockSvc.get(id).catch(() => ({ qty: -1 })),   // 降级
  ]);
  return c.json({
    id: product.id,
    name: product.name,
    price: product.price / 100,        // 单位换算
    cover: product.coverUrl,
    inStock: stock.qty > 0,
    comments: comments.map(toMobileComment),
    recommendIds: recommend.map(r => r.id),
  });
});
```

---

## 六、网关 vs BFF：到底什么关系

| 维度 | 网关 | BFF |
| --- | --- | --- |
| 核心职责 | 路由 / 鉴权 / 限流 | 聚合 / 裁剪 / 适配 |
| 是否含业务逻辑 | 不含（横切） | 含（编排） |
| 前端是否感知 | 透明 | 专为某端设计 |
| 写谁 | 平台/运维 | 全栈 / 前端 |

> 经验法则：**网关是基础设施，BFF 是业务的一部分**。一个完整链路常是：`Client → 网关 → BFF → 多个领域服务`。

---

## 七、GraphQL 作为 BFF 的替代

GraphQL 让前端"按需取数"，某种意义上**自己就是个 BFF**。一个 schema 同时服务多端，前端各取所需。

```graphql
query ProductDetail($id: ID!) {
  product(id: $id) {
    id name price coverUrl
    comments(top: 5) { content rating }
    recommendations { id name price }
  }
}
```

代价：

- 后端要写 resolver、解决 N+1（DataLoader）
- 缓存难做（每个查询都不一样）
- 版本治理需要 deprecation 机制

GraphQL Federation 让多个领域服务各自维护 schema，由网关层合并——这是大型团队的常见姿态。详见第 37 章。

---

## 八、网关的常见踩坑

1. **网关变成业务大杂烩**：一开始只做鉴权，后来塞业务逻辑进去——发布频率上去了，挂一次全站挂
2. **没区分内网外网网关**：第三方接口和内部 RPC 混在一个网关，规则互相干扰
3. **限流粒度太粗**：只按 IP 限，攻击者用代理池就破了——结合用户 / 接口 / 业务维度
4. **JWT 校验在每个服务重复做**：网关验完透传 X-User-Id 给下游就行
5. **网关单点没多副本**：网关挂 = 全站挂，至少 3 副本 + 健康检查
6. **没有蓝绿/灰度**：改条路由全量生效，事故现场最常见

---

## 九、本章 Checklist

| 项 | 说明 |
| --- | --- |
| ✅ 网关做横切，不做业务 | 鉴权 / 限流 / 路由 / 日志 |
| ✅ 多副本 + HA | 单点 = 全站单点 |
| ✅ 限流 + 熔断 | 保护下游 |
| ✅ Trace 入口埋点 | traceId 从这里生成 |
| ✅ 内外网网关分离 | 安全和稳定性都好 |
| ✅ BFF 聚合 / 裁剪 | 不让前端调 N 个接口 |
| ✅ 网关与服务解耦 | 通过注册中心 / DNS |

下一章讲性能与压测——网关与服务都装好了，能扛多少流量？得压一压才知道。
