# API 文档与契约

代码写完了、协议跑通了——但**前端怎么知道你接口长什么样**?对接方怎么知道传什么字段?这一章讲后端工程里被严重低估的一环:**接口契约**。

没契约的项目长什么样:Postman 里翻几十个收藏、群里"在吗?这个字段是 string 还是 number?"、上线后才发现两边理解不一致。**OpenAPI / Mock / 契约测试**是治本药。

---

## 一、为什么"自然语言文档"必死

大多数团队的演化:

```
v1: 在 Wiki 写一篇 markdown 描述接口
v2: 后端改了接口忘了改 wiki
v3: 前端按 wiki 实现,联调时发现字段对不上
v4: PM 拉群拉到崩溃
v5: 改成 Excel 表(对不齐了又重写)
v6: 最后所有人都凭"上次联调时的记忆"开发
```

根本问题:**文档和代码是两个东西,没有强制同步机制**。

破法只有一种:**让代码生成文档,而不是反过来**。这就是 **OpenAPI(原 Swagger)** 在做的事。

---

## 二、OpenAPI 是什么

**OpenAPI Specification(OAS)** 是 RESTful API 的描述规范,JSON / YAML 格式。一份 OpenAPI 文档能描述:

```yaml
openapi: 3.1.0
info:
  title: Order API
  version: 1.0.0
paths:
  /orders/{id}:
    get:
      summary: 查询订单
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: string }
      responses:
        '200':
          description: 成功
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Order'
        '404':
          description: 不存在
components:
  schemas:
    Order:
      type: object
      required: [id, status, amount]
      properties:
        id:     { type: string }
        status: { type: string, enum: [PENDING, PAID, CANCELLED] }
        amount: { type: number, format: decimal }
```

**有了 OpenAPI 文档,可以做的事**:

| 用途 | 工具 |
| --- | --- |
| 渲染交互式文档 | Swagger UI / Redoc / Stoplight Elements |
| Mock 服务器 | Prism / Stoplight Mock |
| 生成客户端 SDK | openapi-generator(40+ 语言) |
| 生成服务端骨架 | 同上 |
| 接口联调测试 | Postman / Insomnia / Bruno |
| 契约测试 | Schemathesis / Dredd |
| 网关配置 | Kong / APISIX 直接吃 OpenAPI |

> 经验法则:**有 OpenAPI 文档 = 同时拥有了文档、Mock、SDK、网关配置、契约测试**——一个文件喂活整条链。

---

## 三、Spring Boot 自动生成 OpenAPI:springdoc

**老的 Springfox 已弃维护,新项目一律用 springdoc**。

```gradle
implementation 'org.springdoc:springdoc-openapi-starter-webmvc-ui:2.6.0'
```

启动后自动暴露:

```
http://localhost:8080/v3/api-docs        ← 机器读的 JSON
http://localhost:8080/swagger-ui.html    ← 人看的 UI
```

**什么都不写就能出文档**——springdoc 扫所有 Controller。但要写得好看,加注解:

```java
@RestController
@RequestMapping("/orders")
@Tag(name = "订单", description = "订单 CRUD")
public class OrderController {

    @Operation(summary = "查询订单详情",
               description = "按订单 ID 查,支持已删除查询")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "成功"),
        @ApiResponse(responseCode = "404", description = "订单不存在")
    })
    @GetMapping("/{id}")
    public OrderVO get(
        @Parameter(description = "订单 ID", example = "ORD-2024-001")
        @PathVariable String id) {
        return service.find(id);
    }
}

@Schema(description = "订单视图")
public record OrderVO(
    @Schema(example = "ORD-2024-001") String id,
    @Schema(example = "PAID")          OrderStatus status,
    @Schema(example = "199.00")        BigDecimal amount
) {}
```

---

## 四、Code-First vs Design-First

```
Code-First:写代码 → 注解 → 自动生成 OpenAPI
   优点:零额外维护,代码即文档
   缺点:接口设计被实现细节带偏

Design-First:先写 OpenAPI yaml → 评审 → 生成代码骨架 → 填实现
   优点:前后端可并行(后端写 yaml 时前端就有 mock 了)
   缺点:多一层维护、yaml 写法门槛
```

| 团队类型 | 推荐 |
| --- | --- |
| 小团队、迭代快 | **Code-First** + springdoc |
| 多端协作(Web + iOS + Android) | **Design-First** |
| 公开 API / OpenAPI 是"对外承诺" | **Design-First** + 严格 review |

> 经验法则:**Design-First 在跨团队协作上回报最大**——OpenAPI 文档评审环节强迫所有人(PM、前端、后端、测试)在写代码前对齐字段。事后撕逼成本下降一个量级。

---

## 五、Mock 服务:让前端不再等后端

OpenAPI 文档配上 Mock 工具,**前端不用等后端写完就能联调**。

### Prism(Stoplight 开源,最强)

```bash
npm i -g @stoplight/prism-cli
prism mock openapi.yaml -p 4010
# 立即起一个 Mock 服务,按 schema 生成假数据
```

Prism 还能根据 `examples` 字段返特定示例,根据 query 参数返不同响应。

### 自己在代码里 Mock

```java
@Profile("mock")
@RestController
public class OrderControllerMock {
    @GetMapping("/orders/{id}")
    public OrderVO get(@PathVariable String id) {
        return new OrderVO(id, OrderStatus.PAID, BigDecimal.valueOf(199));
    }
}
```

**前端联调环境**指向 Mock,**预发**指向真实服务。

---

## 六、OpenAPI Generator:批量生成客户端

```bash
openapi-generator-cli generate \
  -i openapi.yaml \
  -g typescript-axios \
  -o ./frontend/src/api
```

支持的目标:typescript / kotlin / swift / dart / python / go / rust...

**好处**:

- 前端不用手写一行 fetch / axios 代码
- 接口字段类型变了,生成的 SDK 自动报编译错
- 多端 SDK 完全一致

**配合 monorepo / npm 私有仓库** 把生成的 SDK 自动发出去,前端 `npm install @company/api-sdk` 就完事。

---

## 七、JSON Schema:OpenAPI 的字段定义层

OpenAPI 的请求/响应 schema 实际上就是 **JSON Schema**——一份独立的标准,描述"JSON 长什么样"。

```json
{
  "type": "object",
  "required": ["email", "age"],
  "properties": {
    "email": { "type": "string", "format": "email" },
    "age":   { "type": "integer", "minimum": 0, "maximum": 150 },
    "tags":  { "type": "array", "items": { "type": "string" }, "uniqueItems": true }
  }
}
```

**用途远超 API 文档**:

| 场景 | 用 JSON Schema 做什么 |
| --- | --- |
| 配置文件校验 | k8s manifest / package.json 都有 schema |
| 表单生成 | JSON Schema → React Form |
| 数据库 JSON 字段约束 | PostgreSQL CHECK 约束 |
| 消息队列 schema 注册 | Kafka Schema Registry |

```java
// 后端用 networknt/json-schema-validator 校验请求
JsonSchema schema = JsonSchemaFactory.getInstance(VersionFlag.V202012)
    .getSchema(schemaUrl);
Set<ValidationMessage> errors = schema.validate(jsonNode);
```

---

## 八、消息契约:Avro / Protobuf / Schema Registry

REST 用 OpenAPI,**消息队列**用什么?

```
Producer 发什么字段,Consumer 拿什么字段,出错了怎么知道?
```

主流方案是 **Schema Registry + Avro/Protobuf**。

### Confluent Schema Registry(Kafka 主流)

```
Producer 发消息时:
  1. 序列化前,把 schema 注册到 Registry,拿 schemaId
  2. 消息体 = [schemaId 4 字节][payload]
  
Consumer 收消息时:
  1. 从消息头拿 schemaId
  2. 去 Registry 查 schema 反序列化
  3. schema 演化时自动兼容(向前/向后/全)
```

```protobuf
// orders.proto
syntax = "proto3";
message OrderEvent {
  string order_id = 1;
  string status   = 2;
  int64  ts       = 3;
}
```

```yaml
# 兼容性策略
compatibility: BACKWARD  # 新 schema 能读老消息
```

| 兼容性级别 | 含义 |
| --- | --- |
| **BACKWARD** | 新 schema 能读老数据(消费者先升级) |
| **FORWARD** | 老 schema 能读新数据(生产者先升级) |
| **FULL** | 双向兼容(最严) |
| **NONE** | 不检查(危险) |

> 经验法则:**消息契约必须版本化**——绝不允许"上线了改字段意义"。Avro/Protobuf 的字段编号是契约,**只能新增不能复用编号**。

---

## 九、契约测试(Contract Testing)

50 章测试体系提到了 Pact / Spring Cloud Contract,这里展开。

**问题**:微服务联调贵——A 服务测试要起 B / C / D 真实环境。
**契约测试**:消费方写"我期望对方怎么响应",提供方根据契约生成测试自己跑。

### Pact 流程

```
1. 消费方(订单服务)在测试里声明:
   "调用 /users/{id} 应返回 {id, name, email}"
2. 测试运行时,Pact 生成 contract.json
3. 上传到 Pact Broker
4. 提供方(用户服务)CI 时拉所有契约,跑"提供方测试"
5. 提供方测试:按契约请求自己,验响应
```

```java
// 消费方测试(订单服务)
@PactConsumerTest
class UserClientPactTest {
    @Pact(consumer = "order-service", provider = "user-service")
    public RequestResponsePact pact(PactDslWithProvider builder) {
        return builder
            .uponReceiving("get user 123")
              .path("/users/123").method("GET")
            .willRespondWith()
              .status(200)
              .body(new PactDslJsonBody()
                  .stringType("id", "123")
                  .stringType("name")
                  .stringType("email"))
            .toPact();
    }

    @Test
    void test_get_user(MockServer mockServer) { ... }
}
```

**收益**:不用真启 user-service 就能验"双方通信能跑"。修改 user-service 时,CI 立刻知道哪些消费方会被影响。

> 经验法则:**3+ 服务的微服务架构必须上契约测试**——否则联调成本爆炸,生产事故频繁。

---

## 十、API 设计的几条规矩

OpenAPI 只是"工具",底子是 **API 设计风格**:

### 1. URL 是名词,不是动词

```
✅ POST /orders          ← 创建订单
✅ DELETE /orders/123    ← 删除订单
❌ POST /createOrder
❌ GET  /deleteOrder?id=123
```

### 2. 状态码用对

```
200 OK             查询成功
201 Created        创建成功
204 No Content     删除成功 / 无返回体
400 Bad Request    参数错
401 Unauthorized   未登录
403 Forbidden      已登录但没权限
404 Not Found      资源不存在
409 Conflict       业务冲突(重复下单)
422 Unprocessable  格式对但业务校验不过
429 Too Many       限流
500 Internal       服务端 bug
503 Unavailable    依赖不可用 / 维护中
```

> 经验法则:**别用 200 + body errCode 表达所有错误**——网关、监控、客户端 SDK 都不认。状态码该用 HTTP 标准的就用,业务错误码放 body。

### 3. 错误响应统一格式(RFC 7807)

```json
{
  "type": "https://api.example.com/errors/insufficient-stock",
  "title": "库存不足",
  "status": 409,
  "detail": "商品 SKU-A 仅剩 3 件,请求 5 件",
  "instance": "/orders/draft-123",
  "errors": [
    { "field": "items[0].qty", "code": "STOCK_INSUFFICIENT" }
  ]
}
```

### 4. 分页

```
✅ GET /orders?page=1&size=20         (offset 分页)
✅ GET /orders?cursor=xxx&size=20     (cursor 分页,深翻无压力)
❌ GET /orders/page/1/20              (URL 当参数用)
```

### 5. 版本化

```
URL: /v1/orders, /v2/orders         ← 显式、好观察(主流)
Header: Api-Version: 2              ← 干净,但调试难
Accept: application/vnd.api+json;version=2  ← 标准但繁琐
```

> 经验法则:**对外 API 用 URL 版本化**(便于 CDN、网关、监控按版本统计);**内部 API 可以不版本化**(直接演进 + 契约测试守护)。

---

## 十一、API 网关里的 OpenAPI

Kong / APISIX / Apigee 等网关都吃 OpenAPI 文档:

```
OpenAPI yaml → 网关
  → 自动生成路由
  → 自动校验请求(参数类型、必填)
  → 自动生成 Mock(测试环境)
  → 自动出限流策略骨架
```

**让网关 + OpenAPI 帮你做基础校验,业务服务专注业务**——这是 BFF / 网关层的成熟实践。

---

## 十二、文档的"防腐"

OpenAPI 自动生成的文档也会过时。两个守护手段:

### 1. CI 校验

```yaml
# 在 CI 里跑契约校验
- run: spectral lint openapi.yaml --ruleset .spectral.yaml
- run: schemathesis run openapi.yaml --base-url http://api/   # 拉真服务跑
```

### 2. 强制 PR 时附 OpenAPI diff

```bash
# 用 oasdiff 对比新旧文档
oasdiff breaking old.yaml new.yaml
```

**Breaking change(删字段、改类型)** 在 PR 里直接挂红——必须人工确认。

---

## 十三、常见踩坑

1. **依赖 Wiki 写文档**:不出三个月就过时
2. **接口和文档分两份维护**:必然不一致
3. **Springfox 还在用**:已弃维护,换 springdoc
4. **不写 examples**:Swagger UI 上一片空,前端联调要猜值
5. **Schema 混合用 long / Long / String 表示 ID**:对端类型乱炸
6. **删字段不告知 / 不版本化**:线上客户端集体崩
7. **错误返 200 + errCode**:网关监控看不到错误率
8. **Mock 与真实服务行为差太远**:联调过 Mock 一切正常,接真服务全炸
9. **不做契约测试**:微服务联调成本爆炸
10. **Avro / Protobuf 字段编号被复用**:消费者反序列化全错
11. **没 Schema Registry**:消息体格式靠群消息约定
12. **OpenAPI 文档手写,代码自己改**:契约失守
13. **HTTP 状态码全用 200**:CDN / 网关不认
14. **公开 API 没 deprecation 周期**:一刀切下线,客户骂死

---

## 十四、本章 Checklist

| 项 | 说明 |
| --- | --- |
| ✅ Spring 用 springdoc(不是 springfox) | 主流标准 |
| ✅ 接口加 @Schema / @Operation 描述 | 文档可读 |
| ✅ 字段写 examples | 联调省心 |
| ✅ 错误用 HTTP 状态码 + RFC 7807 body | 标准化 |
| ✅ 接口 URL 是名词 | RESTful 规矩 |
| ✅ 公开 API URL 版本化 | /v1/, /v2/ |
| ✅ Mock 用 Prism / Stoplight | 前端不等后端 |
| ✅ 客户端 SDK 用 openapi-generator | 生成而非手写 |
| ✅ Kafka 上 Schema Registry | 消息契约不靠口头 |
| ✅ Schema 版本兼容策略明确 | BACKWARD 起手 |
| ✅ 微服务上契约测试(Pact) | 减少联调成本 |
| ✅ CI 跑 OpenAPI lint + breaking diff | 防腐自动化 |

---

## 小结

API 契约这件事,**便宜的代价是文档,贵的代价是联调和事故**。

记住三件事:

1. **代码生成文档,而不是反过来**——OpenAPI / springdoc 是底线
2. **契约不只服务文档,还服务 Mock / SDK / 测试 / 网关 / 校验**——一份多用
3. **跨团队协作必须 Design-First + 契约测试**——否则微服务架构会反噬

下一章我们做 SaaS 必修课——**多租户架构**:数据库怎么隔离、租户上下文怎么贯穿、SaaS 与 toC 项目的本质区别在哪。
