# Serverless 与 Edge

24~30 章讲容器和 K8s——但容器/K8s 也有"重"的一面:**最少要起 1 个 Pod,流量为 0 也在烧钱**。

Serverless 的卖点是 **"按调用次数计费,不调用零成本"**;Edge 的卖点是 **"代码跑在最近用户的边缘节点,延迟近乎为零"**。这章把这两条非传统部署路线讲清。

---

## 一、Serverless 的核心价值

```
传统部署:
  起服务 → 占资源 → 365 天 24 小时计费
  流量 0 也要付
  弹性扩缩有滞后

Serverless:
  调用来了 → 平台拉起一份代码跑 → 跑完释放
  没调用 = 0 成本
  瞬时扩到上千实例
```

| 场景 | Serverless 适合 |
| --- | --- |
| 流量稀疏 / 突发 | ✅ 极其适合 |
| 创业前期 / MVP | ✅ 几美分 / 月 |
| 后台 cron / 定时任务 | ✅ 一周一次也只算那一次 |
| 文件处理 / 图像转码 / Webhook 处理 | ✅ 事件驱动天然契合 |
| 持续高并发 | ❌ 比 ECS 贵几倍 |
| 长运行任务(>15 分钟) | ❌ 平台限制 |
| 极致延迟敏感(冷启动) | ⚠️ 视平台而定 |

> 经验法则:**Serverless 是"流量分布不均"的最优解**——一个月跑 100 万次但分布在 3 天内的脉冲流量,Serverless 价格碾压预留实例。

---

## 二、主流平台

| 平台 | 特点 | 限制 |
| --- | --- | --- |
| **AWS Lambda** | 事实标准,生态最广 | 15 分钟、10GB 内存 |
| **Cloudflare Workers** | Edge,V8 isolate,启动 <5ms | 30s CPU、128MB |
| **Vercel Functions** | 跟前端 Next.js 集成无缝 | 60s,基于 Lambda / Edge |
| **Netlify Functions** | Lambda wrapper,简单 | 同 Lambda |
| **Deno Deploy** | TS first,边缘 | 50ms CPU 限制 |
| **Google Cloud Functions / Run** | GCP 生态 | Run 类似容器 |
| **Azure Functions** | 微软生态 | - |
| **阿里云函数计算 / 腾讯云 SCF** | 国内主流 | 同类 |
| **Supabase Edge Functions** | 跟 Supabase Postgres 强耦合 | Deno 运行时 |

**两大流派**:

```
1. 容器派(Lambda、Cloud Run、SCF)
   每实例隔离,可跑任何语言,启动 100ms~几秒

2. Isolate 派(Cloudflare Workers、Deno Deploy)
   V8 isolate,只能 JS/TS/WASM,启动 <5ms
```

---

## 三、Lambda 实战(AWS)

```python
# handler.py
def handler(event, context):
    return {
        "statusCode": 200,
        "body": json.dumps({"hello": event.get("name", "world")})
    }
```

部署方式三选一:

```bash
# 1. AWS Console 直接传 zip(玩具)
# 2. AWS SAM(声明式)
# 3. Serverless Framework(跨云通用)
```

```yaml
# serverless.yml
service: my-api
provider:
  name: aws
  runtime: python3.12
  region: us-east-1

functions:
  hello:
    handler: handler.handler
    events:
      - httpApi: 'GET /hello'
    memorySize: 256
    timeout: 10
```

```bash
sls deploy
```

---

## 四、冷启动:Serverless 的最大痛点

```
请求来了 → 平台找一个空闲实例
   ├─ 有 → "热启动",几十毫秒返回
   └─ 没 → "冷启动":
         1. 拉代码
         2. 起运行时(JVM 几秒,Python/Node 数百毫秒,Go/Rust 几十毫秒)
         3. 跑你的初始化代码
         4. 处理请求
```

| 运行时 | 冷启动 |
| --- | --- |
| Cloudflare Workers(V8 isolate) | <5ms |
| Node.js / Python | 200~500ms |
| Go / Rust(预编译) | 50~200ms |
| Java(标准 JVM) | **2~10s** |
| Java(GraalVM Native Image) | 100~300ms |
| .NET | 500ms~1s |

**优化手段**:

| 手段 | 适用 |
| --- | --- |
| **Provisioned Concurrency**(Lambda) | 预留 N 个热实例,**冷启动归零但花钱** |
| **SnapStart**(Lambda Java) | 提前快照 JVM 状态,启动降到 <1s |
| **GraalVM Native** | Spring Boot 3 / Micronaut / Quarkus 编译为本地镜像 |
| **轻量框架** | 用 Quarkus / Micronaut 替 Spring Boot |
| **保持温暖** | 5 分钟一次 cron 调一下,但不优雅 |

> 经验法则:**Java 上 Lambda 不用 SnapStart 或 GraalVM,基本不可用**——10 秒冷启动用户早跑了。新项目首选 Node.js / Python / Go。

---

## 五、Cloudflare Workers:边缘极致体验

```
你写的代码部署到 Cloudflare 全球 300+ 节点
用户在东京访问 → 东京节点跑你的代码 → 返回
不需要"地区"概念,自动就近
```

```typescript
// worker.ts
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/hello') {
      const name = url.searchParams.get('name') ?? 'world';
      return new Response(JSON.stringify({ hello: name }), {
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('Not found', { status: 404 });
  }
};
```

```bash
npx wrangler deploy   # 几秒后全球可用
```

**Workers 的杀手锏 KV / R2 / D1 / Durable Objects**:

| 服务 | 干什么 |
| --- | --- |
| **KV** | 全球分布的 KV 存储,毫秒读 |
| **R2** | S3 兼容,**无出口流量费**(对比 S3 极便宜) |
| **D1** | 边缘 SQLite,适合小型应用 |
| **Durable Objects** | 全球唯一的有状态对象,适合实时协作 |
| **Queues** | 边缘消息队列 |
| **Workers AI** | 跑 AI 模型在边缘 |

**Workers 的限制**:

- 最大 30s CPU 时间(墙钟可更长,等 IO 不算)
- 128MB 内存
- 不能写本地文件
- 没有 Node.js 完整 API(部分 polyfill)

> 经验法则:**Cloudflare Workers + R2 是"现代 JAMstack 全栈"的最优选**——前端 Next.js / Astro 静态部署,后端 Workers,数据 D1 / R2,**月成本几美元起**,全球延迟低。

---

## 六、Vercel / Netlify Functions

跟前端绑定的"全栈轻 Serverless":

```typescript
// app/api/hello/route.ts (Next.js App Router)
export const runtime = 'edge';      // 'edge' = 跑在 Vercel Edge,'nodejs' = Lambda

export async function GET(request: Request) {
  return Response.json({ hello: 'world' });
}
```

**两种 runtime**:

| runtime | 跑在 | 适合 |
| --- | --- | --- |
| **edge** | Vercel Edge(类似 Cloudflare Workers) | 短逻辑 / 全球低延迟 |
| **nodejs** | Lambda | 完整 Node API / DB 连接 |

> 经验法则:**Next.js / Remix / Astro 项目里,简单 API 用 edge,需要 DB 连接的用 nodejs**——edge 的 DB 连接生态还在补(Neon / PlanetScale 已支持)。

---

## 七、事件驱动架构

Serverless 真正发挥价值的姿势是**事件驱动**:

```
S3 上传文件 → 触发 Lambda → 转码 → 写回 S3 → 通知 SNS → 触发另一个 Lambda → 邮件

所有连接松耦合,每环按调用计费
```

```yaml
functions:
  imageProcessor:
    handler: image.process
    events:
      - s3:
          bucket: uploads
          event: s3:ObjectCreated:*
          rules:
            - suffix: .jpg
```

```yaml
functions:
  webhook:
    handler: webhook.handle
    events:
      - httpApi: 'POST /webhook/{provider}'
```

```yaml
functions:
  hourlyCron:
    handler: jobs.cleanup
    events:
      - schedule: rate(1 hour)
```

> 经验法则:**Serverless 不是"传统服务的替代"**——它是"事件驱动架构"的最佳载体。**用它做 webhook、文件处理、cron、日志分析、IoT 数据接收**。

---

## 八、和数据库的"恩怨"

Serverless 和传统连接池模型是天敌:

```
传统:1 个服务 100 个连接,DB 撑得住
Serverless:1000 个并发实例 × 100 连接 = 10 万连接,DB 直接挂
```

**破法**:

| 方案 | 工作方式 |
| --- | --- |
| **RDS Proxy / PgBouncer** | DB 前面挂连接池代理 |
| **Aurora Serverless V2** | DB 自己也 Serverless,自动扩缩 |
| **Neon / PlanetScale / Turso** | 设计上对 Serverless 友好 |
| **HTTP-based DB**(Hyperdrive / Vercel Postgres) | 走 HTTP 而非长连接 |

> 经验法则:**Serverless 的 DB 选型决定生死**——传统 RDS 直连必踩坑,选 Neon / PlanetScale / Aurora Serverless 这类"现代云原生 DB"。

---

## 九、可观测性:Serverless 的另一痛点

```
传统:进程在,top / strace / jstack 直接上
Serverless:函数跑完就没了,堆栈 / 内存全消失
```

工具:

| 维度 | 工具 |
| --- | --- |
| 日志 | CloudWatch / Datadog / Logtail / Better Stack |
| Metrics | 平台原生 + Datadog / NewRelic |
| Tracing | AWS X-Ray / OpenTelemetry |
| 错误聚合 | Sentry(Lambda 集成成熟) |

**OpenTelemetry Lambda Layer**:

```yaml
functions:
  api:
    handler: app.handler
    layers:
      - arn:aws:lambda:us-east-1:901920570463:layer:aws-otel-nodejs-amd64-ver-1-26-0:1
    environment:
      AWS_LAMBDA_EXEC_WRAPPER: /opt/otel-handler
```

---

## 十、成本模型:Serverless 真的便宜吗

```
Lambda:
  调用费 + 运行时间费(GB-秒)
  例:每月 100 万次,平均 200ms,256MB
   → ~$0.03(免费额度内)
   
预留实例(同等性能 t3.small):
  $15/月

→ Serverless 完胜
```

**但流量大时反转**:

```
每月 1 亿次,平均 200ms,256MB:
  Lambda:~$3000+
  K8s(几个 m5.xlarge): ~$300
```

**临界点估算**:**单功能持续 QPS > 50** 时,Serverless 比容器贵。

> 经验法则:**初创 / MVP 全 Serverless,产品起飞流量稳定后把热点功能搬到容器**——这就是 Vercel 等平台为什么会"长大后被搬走"的原因。

---

## 十一、Cold Start 优化:Java 的救赎

Spring Boot 3 + GraalVM Native Image:

```bash
# 编译为本地镜像(需 GraalVM)
./gradlew nativeBuild
# 产物:无需 JVM,直接运行的二进制
```

| 维度 | 标准 JVM | GraalVM Native |
| --- | --- | --- |
| 启动时间 | 2-10s | **<200ms** |
| 内存 | 几百 MB | **几十 MB** |
| 镜像大小 | 几百 MB | **几十 MB** |
| 峰值性能 | 高(JIT 优化) | 略低(AOT) |
| 兼容性 | 100% | 反射 / 动态代理需配置 |

Quarkus / Micronaut 比 Spring Boot 对 Native 更友好——**为 Serverless / 容器优化而生的框架**。

> 经验法则:**Java + Lambda 必须 SnapStart 或 GraalVM Native**,否则冷启动 5-10 秒,用户不可能等。

---

## 十二、Edge Computing 的真实场景

```
1. 个性化(地理位置 / AB 实验)
   用户访问 → Edge 改写 HTML/JSON → 个性化内容

2. 鉴权 / 限流前置
   Edge 拦请求 → 验 JWT → 不通过直接 401,不打回源

3. 灰度发布
   Edge 决定该用户去 v1 还是 v2

4. 缓存定制
   边缘按用户分组缓存

5. 反爬 / WAF
   边缘指纹 + 速率限制
```

```typescript
// Cloudflare Workers 例子:Edge 鉴权
export default {
  async fetch(req: Request) {
    const auth = req.headers.get('Authorization');
    if (!await verifyJwt(auth)) {
      return new Response('Unauthorized', { status: 401 });
    }
    return fetch(req);    // 通过 → 透传到回源
  }
};
```

---

## 十三、什么时候**别**上 Serverless

| 场景 | 原因 |
| --- | --- |
| 长运行任务(>15 分钟) | Lambda 上限,Edge Workers 更短 |
| 大文件处理(>500MB) | 内存限制 |
| 持续高 QPS | 容器更便宜 |
| 严格 P99 < 50ms | 冷启动可能命中 |
| WebSocket 长连接 | Lambda 不适合,要 API Gateway WebSocket(贵) |
| GPU / ML 推理 | SageMaker / 自建容器 |
| 需要本地缓存 | 实例不复用,Caffeine 几乎没意义 |

---

## 十四、混合架构:Serverless + 容器

```
Web App / 主 API  →  容器(K8s / ECS,稳定 QPS)
   │
   ├─ 文件处理 / 转码  →  Lambda(事件触发)
   ├─ Webhook 处理     →  Lambda
   ├─ 定时报表         →  Lambda
   ├─ 边缘鉴权 / 灰度   →  Cloudflare Workers
   └─ 全球静态 + 简单 API  →  Vercel / Cloudflare
```

**这才是 2024+ 主流形态**——不是非此即彼,而是"工具配场景"。

---

## 十五、常见踩坑

1. **Java + 标准 JVM Lambda**:冷启动 5-10s,用户跑光
2. **不限制并发**:每秒 1000 调用直接打挂下游 DB
3. **没用连接池代理**:DB 连接耗尽
4. **本地变量当持久缓存**:Lambda 实例可能下次销毁
5. **>15 分钟任务**:Lambda 上限,直接超时
6. **冷启动测试不打**:压测看不到偶发慢请求
7. **Lambda 内启大事务 / 长 RPC**:不可控延迟,成本爆炸
8. **打包过大**:依赖 200MB,启动慢
9. **不区分 init 阶段和 handler**:每次请求都建 client
10. **VPC 内 Lambda 没设 ENI**:启动 +5s
11. **Workers / Edge 用 Node.js 库**:许多库不兼容 isolate 环境
12. **Workers 写文件 / 用 fs**:不支持
13. **跨平台框架"一处写多处部署"**:实际兼容性糟糕,坑无数
14. **Serverless 当所有问题的银弹**:持续高 QPS 业务上完账单暴炸
15. **Edge 后面挂传统 RDS**:每次冷启动建连,Edge 优势消失

---

## 十六、本章 Checklist

| 项 | 说明 |
| --- | --- |
| ✅ 流量稀疏 / 事件驱动 → Serverless | 适用场景判断 |
| ✅ 持续高 QPS → 容器 | 成本算清 |
| ✅ Java 必上 SnapStart / GraalVM Native | 冷启动救命 |
| ✅ 用 RDS Proxy / Neon / Aurora Serverless | 解决连接 |
| ✅ Init 代码放 handler 外 | 跨调用复用 |
| ✅ 监控冷启动比例和耗时 | 早发现性能退化 |
| ✅ Sentry / OpenTelemetry 集成 | 可观测 |
| ✅ Edge Workers 跑短逻辑 / 鉴权 / 个性化 | 不当主业务 |
| ✅ 混合架构:容器 + Serverless + Edge | 工具配场景 |
| ✅ 设并发上限 | 防雪崩 |
| ✅ 严格 timeout + retry policy | 不让函数永远跑 |

---

## 小结

Serverless 和 Edge 不是"取代 K8s",**是给 K8s 不擅长的场景留的工具**。

记住三件事:

1. **Serverless 的甜区是事件驱动 + 流量稀疏**——持续高 QPS 它输给容器
2. **Edge 的杀手锏是"代码离用户更近"**——鉴权、个性化、灰度、CDN 加值场景最合适
3. **混合架构是终点**——容器跑主业务,Serverless 处理事件,Edge 做前置——根据成本与延迟取舍

下一章我们补全测试章里没细讲的最后一块——**错误处理体系**:异常分层、错误码规范、问题域映射、给前端 / 给客户的错误信息。
