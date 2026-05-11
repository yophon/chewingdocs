# OpenTelemetry 与链路追踪:Trace / Span / 上下文传播 / Tempo / Jaeger

讲链路追踪的文章 90% 都从「Dapper 论文」起手——这是错的。**链路追踪不是 Google 发明给中型团队学的论文,是给"100 个微服务 + 5000 QPS + 偶尔有诡异延迟"这种工程现实救命的工具**。10 篇讲完日志,这一篇接着讲可观测性的第三支柱——**指标告诉你"有问题",日志告诉你"出什么错",trace 告诉你"问题在调用链的哪一跳"**。这三件套缺一个,中型团队的故障定位都得拼运气。

> 一句话先记住:**链路追踪不是"画个图给老板看",是当一个请求穿过 8 个服务、某个 P99 抖了、metrics 说不清楚是哪个环节的时候,唯一能在 10 分钟内定位到根因的工具**。**它解决的不是"系统怎么工作",是"系统出问题时,出在哪"**。**OpenTelemetry(OTel)2024 年之后已经吃掉了 Jaeger / Zipkin / OpenTracing / OpenCensus 所有的客户端市场**——再开新项目用 Jaeger client、Zipkin client 就是给自己挖坑;**OTel 是事实标准,这一篇默认你用 OTel,不再讨论替代方案**。

---

## 一、不上链路追踪,生产里会出什么事

讲一个真实的故障场景,**这是我在三个不同公司亲眼见过的同一个模式**:

```
   线上告警:支付接口 P99 从 200ms 涨到 3000ms
   ──────────────────────────────────────────
   
   前 30 分钟,工程师在做什么:
   ──────────────────────────────
   T+0     看 Grafana,确认 P99 真的涨了
   T+2     看 payment-service 的 CPU / 内存 → 一切正常
   T+5     看 payment-service 的日志 → 也没异常
   T+10    打开 payment-service 上游 / 下游列表(15 个依赖服务)
   T+15    逐个看每个依赖服务的 metrics → 都正常
   T+20    随机挑几个依赖,看它们的日志 → 也都正常
   T+25    猜测可能是 DB / Redis / 网关 / RPC client
            → 一一看,都没有明显异常
   T+30    上 trace 系统(假设有)
            找一个 3000ms 的请求
            → 看到了:这个请求里,risk-service 调了 5 次 user-service
              每次都重试,前 4 次超时(各 600ms),第 5 次成功
              → 真正的问题是 user-service 偶发慢请求 + risk-service 重试逻辑过于激进
            → 5 分钟定位完
```

**没有 trace 的版本**:这种问题平均要 1-3 小时定位,**因为靠 metrics 和日志反推调用链是不可能的**——上游服务的 metrics 不知道它调了下游 5 次(只看到一次"调用"),日志里 trace_id 关联得靠人脑拼。**Trace 系统的核心价值是把"一个请求的完整生命周期"变成可以一眼看穿的数据**。

**这就是为什么 100 个微服务这个规模,trace 不是可选项,是必备品**——团队规模到 10 人,服务到 50 个以上,**没有 trace 就是用瞎眼调试生产**。

---

## 二、Trace / Span / SpanContext / Baggage:核心语义

OTel 的所有概念都基于这四个原语,**搞不懂这四个,后面什么 propagation / sampling / collector 都是无源之水**。

### 2.1 Span:一个工作单元

**Span = 一个有起止时间的工作单元**——可以是一个 HTTP 请求处理、一个 DB 查询、一个 RPC 调用、一段业务逻辑。

```
   Span 的核心字段:
   ────────────────────────────────
   name           span 的名字(如 "GET /api/orders")
   trace_id       属于哪条 trace(128 bit)
   span_id        本 span 的 id(64 bit)
   parent_span_id 父 span 的 id(64 bit)
   start_time     起始时间
   end_time       结束时间
   attributes     键值对(类似日志的字段)
   events         span 内的事件点(类似单独的日志行)
   status         OK / ERROR / UNSET
   kind           SERVER / CLIENT / INTERNAL / PRODUCER / CONSUMER
```

**Span 不是日志**——span 是结构化的、有起止的、有父子关系的事件。**一个 span 对应一个工作单元的"耗时 + 上下文"**,日志是"工作单元过程中打印的事件点"——**关系是日志可以作为 span 的 events 挂上去**。

### 2.2 Trace:一组 Span 的因果链

**Trace = 一个请求穿过整个系统产生的所有 span 的集合**——通过 `trace_id` 关联,通过 `parent_span_id` 形成树状结构。

```
   trace_id = abc123(整个请求)
   
   ┌──────────────────────────────────────────────────────┐
   │ span_id=A  GET /api/orders                            │
   │ kind=SERVER, parent=null, duration=850ms              │
   │                                                       │
   │   ┌──────────────────────────────────────────────┐    │
   │   │ span_id=B  RPC user-service.GetUser           │    │
   │   │ kind=CLIENT, parent=A, duration=200ms         │    │
   │   │                                              │    │
   │   │   ┌──────────────────────────────────────┐   │    │
   │   │   │ span_id=C  GetUser (server side)       │   │    │
   │   │   │ kind=SERVER, parent=B, duration=190ms │   │    │
   │   │   │                                       │   │    │
   │   │   │   ┌──────────────────────────────┐    │   │    │
   │   │   │   │ span_id=D  SELECT users ...    │    │   │    │
   │   │   │   │ kind=CLIENT, parent=C, 150ms  │    │   │    │
   │   │   │   └──────────────────────────────┘    │   │    │
   │   │   └──────────────────────────────────────┘   │    │
   │   └──────────────────────────────────────────────┘    │
   │                                                       │
   │   ┌──────────────────────────────────────────────┐    │
   │   │ span_id=E  RPC payment-service.Charge         │    │
   │   │ kind=CLIENT, parent=A, duration=600ms         │    │
   │   └──────────────────────────────────────────────┘    │
   └──────────────────────────────────────────────────────┘
```

**关键事实**:**span 不是平铺的,是树状的**——这棵树的根节点(没有父 span)叫**root span**,通常对应入口请求(HTTP API 的处理 / 一个 cron job 的执行)。

### 2.3 SpanContext:跨进程传播的载体

**SpanContext = 让 trace_id / span_id 跨进程传播的"信封"**——这是分布式追踪的命脉。

```
   SpanContext 包含的最小信息:
   ──────────────────────────
   trace_id        128 bit hex(都用这个关联整条链)
   span_id         64 bit hex(发送方的当前 span)
   trace_flags     1 byte(关键位:是否采样)
   trace_state     vendor-specific 扩展(很少用)
```

**为什么这玩意是命脉**:服务 A 调服务 B 时,**A 的 SpanContext 通过 HTTP header / RPC metadata 传给 B**;B 收到后,**用 A 的 trace_id 创建自己的子 span**——这样 A 和 B 的 span 才能拼成一条 trace。**SpanContext 不传 = trace 断**。

### 2.4 Baggage:跨进程的业务上下文

**Baggage = 跨进程传播的键值对,但不直接进入 span**——它的设计目的是「**让请求带着业务上下文穿过整个系统**」。

```
   典型用法:
   ──────────────────────────────────
   入口服务设置:
       baggage.set("user.tier", "vip")
       baggage.set("ab.variant", "control")
       baggage.set("region", "cn-beijing")
   
   穿过 5 个服务:每个服务都能读到这些字段
   
   下游服务读取:
       tier = baggage.get("user.tier")    # "vip"
       根据 tier 走不同业务逻辑(限流 / 路由 / 监控维度)
```

**Baggage 和 SpanContext 都通过 HTTP header 传**,但语义不同:
- **SpanContext** 是追踪系统自己用的(trace_id / span_id),**业务不应该读**
- **Baggage** 是业务用的(user / region / experiment),**业务读写**

**踩坑预告**:**Baggage 不要塞大字段**——每个跨进程调用都要发送整个 baggage,**塞 1KB 进去就是给每个 RPC 加 1KB 网络开销**。**典型滥用**:把整个 user 对象塞进去、把 JSON 序列化的 metadata 塞进去——**这是反模式,后面踩坑章节会展开**。

---

## 三、上下文传播:为什么 W3C Trace Context 统一了

**SpanContext 怎么在 HTTP / RPC 里传**?——这个问题历史上有 10 多种答案,**每家厂商一种 header 格式**,谁家 SDK 谁家格式。**2020 年之后 W3C 终于推了 Trace Context 标准**,**OTel 默认就用它**,**这一节讲清楚为什么这是中型团队的关键利好**。

### 3.1 历史:propagation header 的混战

```
   2010-2018 年的 header 一团乱:
   ───────────────────────────────
   
   B3(Zipkin 用):
     X-B3-TraceId: 80f198ee56343ba864fe8b2a57d3eff7
     X-B3-SpanId:  e457b5a2e4d86bd1
     X-B3-ParentSpanId: e457b5a2e4d86bd1
     X-B3-Sampled: 1
     
   Jaeger:
     uber-trace-id: 80f198ee56343ba864fe8b2a57d3eff7:e457b5a2e4d86bd1:0:1
     
   AWS X-Ray:
     X-Amzn-Trace-Id: Root=1-5759e988-bd862e3fe1be46a994272793;...
     
   DataDog:
     x-datadog-trace-id: 9532127138774266268
     x-datadog-parent-id: 9532127138774266268
     x-datadog-sampling-priority: 1
```

**问题**:你的栈里如果同时有 Spring Cloud Sleuth(用 B3)+ Istio(用 Jaeger 格式)+ AWS Lambda(用 X-Ray)——**就算每家都做对了,trace 也会在边界断**,**因为 B 服务读不懂 A 服务发的 header**。

**典型断点症状**:Jaeger 上看到的 trace 是「来源 A → A 自己处理结束」,**根本看不到 A 调用了 B**——不是 A 没调,是 B 用的 client 不识别 A 发的 header,**B 当成新 trace 起头了**。

### 3.2 W3C Trace Context 的两个 header

W3C 标准化把所有传播简化成两个 header:

```
   traceparent: 00-80f198ee56343ba864fe8b2a57d3eff7-e457b5a2e4d86bd1-01
                │  │                                │                │
                │  │                                │                └── flags(采样标记)
                │  │                                └── parent-id(64 bit)
                │  └── trace-id(128 bit)
                └── version(目前是 00)
   
   tracestate: vendor1=value1,vendor2=value2
                 ↑
                 给厂商扩展(很少用)
```

**就这两个 header**——简单到只有一行,**任何懂 string split 的库都能解析**。OTel SDK 在 2021 年之后默认用这个,**Istio 1.10+ / Envoy / 主流云厂商 SDK 都跟进了**。

### 3.3 为什么 W3C 是中型团队的关键利好

**之前**:用 Jaeger,服务 A 是 Java(Sleuth B3 格式),服务 B 是 Go(jaeger-client Jaeger 格式)——**默认两边互不识别**,工程师要手动配 propagator,**配错一处全公司 trace 断**。

**之后**:OTel SDK 全部默认 W3C,**新建服务 zero config 就能互通**,**老服务迁移时 OTel SDK 还能配置同时识别 W3C + B3 + Jaeger(向后兼容)**。

```go
// 配置 propagator,生产实际写法
otel.SetTextMapPropagator(
    propagation.NewCompositeTextMapPropagator(
        propagation.TraceContext{},   // W3C(主)
        propagation.Baggage{},
        b3.New(),                      // B3(兼容老服务)
    ),
)
```

**这一段配置让 OTel 同时识别 W3C 和 B3**——新服务发 W3C,老服务发 B3,**任何方向调用都能识别**。**这是中型团队迁移过程必备的招**。

---

## 四、采样:头部 / 尾部 / 自适应

**全量保留 trace = 把 metrics + logs 的成本再叠一份**。**5000 QPS 的服务一天产生 4 亿个 span,完整存 7 天 = 几十 TB**——这数字超过任何中型团队的预算。**采样是必须的,问题是怎么采**。

### 4.1 头部采样(Head Sampling)

**入口决策**:在 root span 创建时就决定"这条 trace 要不要保留"——**通常用 trace_id 哈希 mod**。

```
   配置:1% 采样率
   ──────────────────────────────
   
   入口服务:
   ──────────
   trace_id 生成
   if hash(trace_id) % 100 == 0:
       sampled = 1   # 标记采样
   else:
       sampled = 0
   
   这个 sampled flag 通过 traceparent 传到下游
   ────────────────────────────────────────
   
   下游服务:
   ──────────
   if sampled == 0:
       不创建 span(节省开销)
   else:
       创建 span,继续传 sampled = 1
```

**优点**:

- **决策一次,全链路一致**——所有 span 要么全在要么全不在,没有"半条 trace"
- **CPU 开销极小**——下游不采样的请求,SDK 不会真的构建 span(zero-cost path)
- **简单**——一个 hash 函数搞定

**缺点**:

- **好坏请求一视同仁**——一个 ERROR 请求 99% 概率被丢,**真出问题时手里没数据**
- **采样率太低看不到长尾**——1% 采样,一天 4 亿个请求 = 400 万 span,**一个偶发问题(每天 100 次)采样后只剩 1 个,几乎看不到**

### 4.2 尾部采样(Tail Sampling)

**请求结束后决策**:**等整个 trace 走完,根据它的"特征"决定要不要保留**——错的全留,慢的全留,正常的低概率留。

```
   策略示例:
   ──────────────────────────────
   
   trace 在 Collector 缓冲 30 秒(等所有 span 到齐)
   ──────────────────────────────────────────
   
   判断规则:
       if any_span.status == ERROR:        → 100% 留
       elif total_latency > 1s:             → 100% 留
       elif http_status >= 500:             → 100% 留
       elif http_path matches "/payment/*": → 50% 留(关键业务)
       else:                                → 1% 留
```

**优点**:

- **关键事件 100% 不丢**——错的、慢的、关键业务的,**全部保留**
- **采样率灵活**——不同业务不同规则,**比头部采样精细 10 倍**

**缺点**:

- **要缓冲 30s 整条 trace**——Collector 内存压力大,**span 跨长达 5 分钟的 trace 会丢前面的**
- **配置复杂**——规则越多越难维护
- **Collector 必须**——这是尾部采样的核心,**应用端不能做尾部采样**(它只看到自己的 span,看不到全链路)

### 4.3 自适应采样(Adaptive Sampling)

**根据流量动态调整采样率**——QPS 高时降低采样,QPS 低时提高。

```
   目标:稳定每秒收集 100 个 trace
   ──────────────────────────────────────
   
   if QPS = 10:    采样率 = 100%   → 收 10/s
   if QPS = 1000:  采样率 = 10%    → 收 100/s
   if QPS = 100k:  采样率 = 0.1%   → 收 100/s
```

**优点**:**预算可控**——不管流量怎么涨,**后端存储量稳定**。

**缺点**:**采样率随时变,统计意义弱**——拿 trace 算业务指标会失真(09 篇讲过采样的统计偏差)。

### 4.4 怎么选

```
   ┌──────────────────────────────────────────────────────┐
   │  团队规模 < 30 服务,< 1000 QPS                       │
   │  → 头部采样 100%(全量留)                            │
   │  方案:OTel SDK 配 AlwaysSample                       │
   │  理由:数据量小,全量最简单,不用 Collector 尾部采样   │
   ├──────────────────────────────────────────────────────┤
   │  30-100 服务,1000-10000 QPS                          │
   │  → 头部 10% + 尾部错误 / 慢请求 100%                  │
   │  方案:OTel SDK 头部 10%,Collector tail sampling     │
   │  理由:大部分场景头部够用,关键事件靠尾部补            │
   ├──────────────────────────────────────────────────────┤
   │  100+ 服务,10000+ QPS                                │
   │  → 尾部为主 + 自适应                                  │
   │  方案:头部 100%(发到 Collector),Collector 尾部决定 │
   │  理由:中型团队的"金标准",成本 + 数据完整性平衡好    │
   └──────────────────────────────────────────────────────┘
```

**90% 中型团队的最优解是 case 2**——SDK 头部 10% 已经过滤了 90% 的开销,**Collector 尾部再保住错误和慢请求**,这套组合**月成本能控制在原始数据的 1/20**,**关键事件不丢**。

---

## 五、OTel 架构:SDK + Collector

OTel 不是一个工具,是一个**双层架构**——**SDK 跑在应用里,Collector 跑在独立进程**。这一节讲清楚两层各自的职责。

```
   ┌──────────────────────────────────────────────────────┐
   │  应用层(SDK 跑在业务进程内)                          │
   │  ────────────────────────────                         │
   │  ┌──────────────────────────────────────────────┐    │
   │  │ Tracer Provider                               │    │
   │  │   ├── Tracer("user-service")                  │    │
   │  │   │   └── span 创建 / 结束                    │    │
   │  │   ├── Propagator(W3C TraceContext)           │    │
   │  │   ├── Sampler(头部采样决策)                  │    │
   │  │   └── Span Processor                          │    │
   │  │       └── Batch Span Processor                │    │
   │  │           └── OTLP Exporter ─────────┐        │    │
   │  └──────────────────────────────────────│────────┘    │
   └─────────────────────────────────────────│─────────────┘
                                              │ gRPC/HTTP OTLP
                                              ▼
   ┌──────────────────────────────────────────────────────┐
   │  Collector(独立进程,DaemonSet 或 Deployment)        │
   │  ────────────────────────────                         │
   │  ┌──────────────────────────────────────────────┐    │
   │  │ Pipeline:                                    │    │
   │  │   Receiver(otlp / jaeger / zipkin)           │    │
   │  │     ↓                                         │    │
   │  │   Processor(batch / tail_sampling /          │    │
   │  │              attributes / k8s_attributes)     │    │
   │  │     ↓                                         │    │
   │  │   Exporter(tempo / jaeger / otlp / kafka)    │    │
   │  └──────────────────────────────────────────────┘    │
   └──────────────────────────┬───────────────────────────┘
                              ▼
                       后端(Tempo / Jaeger)
```

### 5.1 SDK 的职责(应用内)

- **创建 span / 设置属性 / end span**——业务代码直接调
- **propagator** 注入和解析 W3C header
- **头部 sampler** 决定要不要采样(不采样的 span 创建是零开销路径)
- **BatchSpanProcessor** 批量缓冲 span,**异步发到 Collector**
- **OTLP Exporter** 用 OTLP 协议发数据(gRPC 或 HTTP)

**关键设计**:**SDK 不应该有复杂处理逻辑**——批量、压缩、重试都有,但**不做尾部采样、不做复杂变换**。**这些都是 Collector 的事**。

### 5.2 Collector 的职责(独立进程)

- **接收**(receiver):支持 OTLP / Jaeger / Zipkin 等多种协议,**兼容遗留 SDK**
- **处理**(processor):batch / tail_sampling / 加 K8s metadata / 限流 / 路由
- **导出**(exporter):发到 Tempo / Jaeger / Kafka / 文件 / 多个后端同时发

### 5.3 为什么 Collector 是必须的

**有团队问**:**"我的 SDK 能不能直接发到 Tempo,省掉 Collector"**?**能,但代价巨大**——Collector 解决 5 件 SDK 解决不了的事:

**1. 屏蔽后端变化**

```
   没 Collector:
   SDK ──直发──▶ Jaeger
                   ▲
                   │
                   要换 Tempo?所有应用都要改 SDK 配置,
                   重新打镜像、滚动发布,全公司动一遍

   有 Collector:
   SDK ──OTLP──▶ Collector ──▶ Jaeger / Tempo / SaaS
                                ▲
                                │
                                Collector 配置改一行就切,
                                应用零感知
```

**2. 尾部采样必须**

**SDK 在单个进程内,看不到全链路**——尾部采样需要把整条 trace 的所有 span 聚到一起,**只有 Collector 能做**(如果 SDK 直发,根本不存在尾部采样这个选项)。

**3. 限流 / 削峰**

某服务突发流量 10x,SDK 直接打满 Tempo——**Collector 在中间能限流,保护后端**。

**4. 富化(enrichment)**

加 K8s metadata(namespace / pod / labels)、加云厂商 metadata、改 span 名(把 `/api/orders/123` 归一化成 `/api/orders/:id`)——**这些不应该在 SDK 里做**(SDK 拿不到 K8s metadata,而且改 SDK 要发版),**Collector 里做最自然**。

**5. 多后端同时发**

数据同时发 Tempo(自建) + 商业 APM(SaaS,做评估)——**SDK 直发只能配一个后端,Collector 能 fan-out**。

### 5.4 Collector 的两种部署形态

```
   ┌──────────────────────────────────────────────────────┐
   │  形态 A:Agent 模式(DaemonSet)                       │
   │  ──────────────────────────────────                   │
   │  每个 node 一个 Collector,应用发到 localhost          │
   │  优点:网络延迟低,故障域小                            │
   │  缺点:每个 node 都要资源,尾部采样难做(看不到全链路)│
   ├──────────────────────────────────────────────────────┤
   │  形态 B:Gateway 模式(Deployment 多副本)             │
   │  ──────────────────────────────────                   │
   │  集中几个 Collector 副本,应用发到 Service             │
   │  优点:尾部采样能做,资源利用率高                      │
   │  缺点:Collector 故障影响大                            │
   ├──────────────────────────────────────────────────────┤
   │  形态 C:Agent + Gateway 两层(生产推荐)               │
   │  ──────────────────────────────────                   │
   │  Agent 收 → Gateway 集中处理 → 后端                   │
   │  优点:两全其美,Agent 屏蔽延迟,Gateway 做尾部采样    │
   │  缺点:两层都要维护                                    │
   └──────────────────────────────────────────────────────┘
```

**中型团队推荐 C**——**Agent 用 DaemonSet,3-5 个 Gateway 实例做尾部采样**。

---

## 六、后端选型:Tempo / Jaeger / Zipkin / SaaS

**OTel 是采集端的事实标准,后端可以自由选**——这一节讲四个主流后端的画像。

### 6.1 Tempo:Grafana 系亲儿子

Grafana Labs 2020 年出的,**和 Loki 同一套设计哲学**:**只索引 trace_id,内容压缩到对象存储**。

**亮点**:

- **存储极便宜**——和 Loki 一个套路,S3/OSS 存储,**月成本是 Jaeger 的 1/10**
- **Grafana 集成最深**——dashboard 上点 trace_id 就跳 Tempo
- **OTel 原生支持**——OTLP 直接接收
- **水平扩展简单**——无状态查询节点

**短板**:

- **只能按 trace_id 查**——不能按 service / tag 检索,**这是设计取舍**(类似 Loki 不能全文搜索)
- **要全文搜索得用 Tempo + 外部索引**(把 trace metadata 同步到 ES)——**生产部署复杂度一下子起来**
- **社区比 Jaeger 小**

**适合**:**和 Loki / Grafana 一起用的栈,trace_id 反查是主要场景**。

### 6.2 Jaeger:CNCF 老牌

Uber 2017 年开源(基于 Dapper 论文),**CNCF 毕业项目**,**生态最成熟**。

**亮点**:

- **支持复杂检索**——按 service / operation / tag / duration 检索
- **UI 成熟**——比 Tempo 的 UI 信息量大
- **生态丰富**——Istio / Spring Cloud / 老 SDK 都内置支持
- **可选存储**:ES / Cassandra / Kafka,**灵活**

**短板**:

- **存储贵**——ES 后端和 ELK 一样,**索引膨胀严重**
- **维护重**——ES + Jaeger 自己的几个组件,**比 Tempo 重几倍**
- **OTLP 支持不如 Tempo 原生**——Jaeger 1.35 之后才直接收 OTLP

**适合**:**已经在用 ES 的团队,需要复杂检索**。

### 6.3 Zipkin:老前辈,新项目别用

Twitter 2012 年开源,**OpenTracing 时代的标杆**,**今天主要是历史遗留**。

**亮点**:轻量、简单、几乎所有语言都有 client。

**短板**:**生态在被 OTel + Tempo/Jaeger 取代**,**新项目没理由选**——OTel 兼容 Zipkin 协议,**但反过来 Zipkin client 不兼容 OTel 的所有特性**。

**适合**:**有老服务还在用 Zipkin client 的迁移期**——继续用 Zipkin 后端,但 SDK 切 OTel。

### 6.4 SaaS:Datadog / New Relic / Honeycomb

商业 APM,**省事但贵**。

**亮点**:**零运维**,UI / 告警 / 关联全套包好。

**短板**:**贵**(按 GB 或 trace 数计费,百万 QPS 团队月费 $50k+)、**数据流出公司**(PII 合规问题)、**vendor lock-in**。

**适合**:**< 30 服务、不想自建可观测性栈、预算够**——SaaS 是合理选择。**100+ 服务的团队,SaaS 账单会让你想自建**。

### 6.5 选型矩阵

| 团队规模 | 主要查询模式 | 预算 | 推荐 |
| --- | --- | --- | --- |
| < 30 服务 | 反查 | 自建预算紧 | **Tempo + Loki + Grafana** |
| < 30 服务 | 任意 | 想省心 | **Datadog SaaS** |
| 30-100 服务 | 反查 + 简单分析 | 自建 | **Tempo**(主)+ Jaeger(备查询) |
| 30-100 服务 | 复杂检索 | 自建 | **Jaeger + ES** |
| 100+ 服务 | 复杂检索 + 性能 | 自建 | **Jaeger + Cassandra** 或 **Tempo + 外部索引** |

**90% 中型团队的最优解是 Tempo**——和 09 / 10 篇推 Loki 是一个逻辑,**便宜 + 简单 + 反查够用**。

---

## 七、最小 OTel SDK 接入:Go 例子

讲落地——挑 Go 因为生态最成熟,**这段代码生产可用,不到 60 行**。

```go
package main

import (
    "context"
    "log"
    "net/http"
    "os"

    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/attribute"
    "go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
    "go.opentelemetry.io/otel/propagation"
    "go.opentelemetry.io/otel/sdk/resource"
    sdktrace "go.opentelemetry.io/otel/sdk/trace"
    semconv "go.opentelemetry.io/otel/semconv/v1.24.0"
    "go.opentelemetry.io/otel/trace"
    "go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

// initTracer 在 main 启动时调用一次
func initTracer(ctx context.Context) func() {
    // 1. exporter:发到本地 OTel Collector
    exporter, err := otlptracegrpc.New(ctx,
        otlptracegrpc.WithEndpoint("otel-collector:4317"),
        otlptracegrpc.WithInsecure(),
    )
    if err != nil { log.Fatal(err) }

    // 2. resource:标识"我是谁"——service.name 必填
    res, _ := resource.New(ctx,
        resource.WithAttributes(
            semconv.ServiceName("order-service"),
            semconv.ServiceVersion(os.Getenv("APP_VERSION")),
            semconv.DeploymentEnvironment(os.Getenv("ENV")),
        ),
    )

    // 3. provider:头部采样 10%
    tp := sdktrace.NewTracerProvider(
        sdktrace.WithBatcher(exporter),       // 异步批量发
        sdktrace.WithResource(res),
        sdktrace.WithSampler(sdktrace.TraceIDRatioBased(0.1)),
    )
    otel.SetTracerProvider(tp)

    // 4. propagator:W3C + Baggage,同时兼容 B3
    otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
        propagation.TraceContext{},
        propagation.Baggage{},
    ))

    return func() { _ = tp.Shutdown(context.Background()) }
}

// 业务代码:创建 span
func getOrder(ctx context.Context, orderID string) (*Order, error) {
    tracer := otel.Tracer("order-service")
    ctx, span := tracer.Start(ctx, "getOrder",
        trace.WithSpanKind(trace.SpanKindInternal),
        trace.WithAttributes(attribute.String("order.id", orderID)),
    )
    defer span.End()

    order, err := db.QueryOrder(ctx, orderID)
    if err != nil {
        span.RecordError(err)
        span.SetStatus(codes.Error, err.Error())
        return nil, err
    }
    return order, nil
}

// HTTP 服务:用 otelhttp 自动埋点(包括 SpanContext 提取)
func main() {
    ctx := context.Background()
    shutdown := initTracer(ctx)
    defer shutdown()

    handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        order, _ := getOrder(r.Context(), r.URL.Query().Get("id"))
        json.NewEncoder(w).Encode(order)
    })
    // otelhttp:自动从 W3C header 提取 SpanContext,创建 SERVER span
    wrapped := otelhttp.NewHandler(handler, "GET /orders")
    http.ListenAndServe(":8080", wrapped)
}

// 调下游服务:用 otelhttp client(自动注入 W3C header)
func callUserService(ctx context.Context, userID string) (*User, error) {
    client := http.Client{Transport: otelhttp.NewTransport(http.DefaultTransport)}
    req, _ := http.NewRequestWithContext(ctx, "GET",
        "http://user-service/users/"+userID, nil)
    resp, err := client.Do(req)   // SpanContext 自动注入 header
    // ...
    return user, nil
}
```

**这段代码的 6 个关键点**:

1. **`service.name` 必须设**——OTel 强制语义约定,**没这个所有 trace 都是 unknown_service**
2. **`TraceIDRatioBased(0.1)`** 是 10% 头部采样——**全量到 Collector,Collector 再做尾部**
3. **`otelhttp.NewHandler`** 自动从 W3C header 提取 SpanContext + 自动创建 SERVER span——**99% 的场景这一行就够了**,不用手写
4. **`otelhttp.NewTransport`** 自动注入 W3C header 到下游请求——**这是 trace 不断的关键**
5. **`span.RecordError + SetStatus`** 错误一定要标记——**否则 trace UI 上看不出失败**
6. **`defer span.End()`** 必须调——**没 End 的 span 永远不会被发送**(后面踩坑章节展开)

---

## 八、OTel Collector 最小配置

一个能用于生产的 Collector 配置,**32 行**:

```yaml
# otel-collector-config.yaml
receivers:
  otlp:
    protocols:
      grpc: { endpoint: 0.0.0.0:4317 }
      http: { endpoint: 0.0.0.0:4318 }

processors:
  # 加 K8s metadata(namespace / pod / labels)
  k8sattributes:
    auth_type: serviceAccount
    extract:
      metadata: [k8s.pod.name, k8s.namespace.name, k8s.node.name]
      labels: [{ tag_name: app, key: app, from: pod }]

  # 尾部采样
  tail_sampling:
    decision_wait: 30s
    num_traces: 100000
    policies:
      - { name: errors, type: status_code, status_code: { status_codes: [ERROR] } }
      - { name: slow, type: latency, latency: { threshold_ms: 1000 } }
      - { name: random_low, type: probabilistic, probabilistic: { sampling_percentage: 1 } }

  # 批量
  batch:
    timeout: 5s
    send_batch_size: 1000

exporters:
  otlp/tempo:
    endpoint: tempo:4317
    tls: { insecure: true }

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [k8sattributes, tail_sampling, batch]
      exporters: [otlp/tempo]
```

**配置 6 个关键决定**:

1. **`k8sattributes`** 自动加 pod / namespace 标签——**应用 SDK 不知道自己在哪个 pod,Collector 加最自然**
2. **`tail_sampling.decision_wait: 30s`**——等 30s 让一条 trace 的所有 span 到齐,**别短了**(span 还没到决策就跑,丢)**也别长**(内存压力)
3. **三条采样策略叠加**——错误 100% / 慢请求 100% / 其他 1% 概率——**OR 关系,任一命中就采**
4. **`num_traces: 100000`** 内存里能缓冲的 trace 数——**100k × 30s 大概是 10k QPS 的容量**,够中型团队
5. **`batch` processor 必加**——**没 batch 的 OTLP 一条 span 一个请求,后端会被打爆**
6. **`pipelines.traces` 是声明式**——receiver → processor → exporter 顺序就是数据流向

---

## 九、链路追踪在中型团队的真实价值

这一节是观点不是结论——**用一个真实案例讲清楚"什么场景必须有 trace"**。

### 9.1 一个常见的诡异故障

**场景**:**某接口 P99 偶发 3 秒**(平时 200ms),**每天 5-10 次**,无规律。

**没有 trace 的排查路径**:

```
   step 1:看 Grafana metrics
   ──────────────────────────
   payment-service P99 抖了 → CPU 不高 → DB 慢查询?
   → 检查 DB 慢查询日志,没有 3s 的
   → 检查 Redis,也没有
   → 假设是网络抖动?(说不通,只有这个接口抖)
   
   step 2:看 payment-service 日志
   ──────────────────────────
   ERROR 日志没有,所有请求都是 200
   找不到任何线索
   
   step 3:抓包(开发都不愿意做的事)
   ──────────────────────────
   tcpdump 在生产,要审批,要 SRE 配合
   抓了一小时才抓到一次
   → 看到 payment-service 调 risk-service 的 TCP 包,有 reset
   → 假设是 risk-service 偶发 close 连接
   
   step 4:翻 risk-service 代码
   ──────────────────────────
   risk-service 配置了 connection pool,默认 30s 闲置 close
   payment-service 客户端没设 keepalive,刚好踩到 close 的窗口
   → 重试一次成功,总耗时多了一个 RTT × 重试次数
   
   总耗时:3 天
```

**有 trace 的排查路径**:

```
   step 1:打开 Tempo,找一个 3s 的 trace
   ──────────────────────────────────────
   trace 视图:
   payment-service:GET /pay (3000ms)
     ├── risk-service:CheckRisk (2900ms, status=ERROR)
     │   └── attempt=1, error="connection reset"
     ├── risk-service:CheckRisk (1ms, retry)
     │   └── attempt=2, error="connection reset"
     ├── risk-service:CheckRisk (1ms, retry)
     ├── risk-service:CheckRisk (1ms, retry)
     ├── risk-service:CheckRisk (1ms, retry)
     └── risk-service:CheckRisk (50ms, status=OK)  ← 第 5 次终于成功
   
   一眼看出:
   - 不是 DB 慢,不是网络抖动
   - 是 risk-service 客户端在静默重试 5 次
   - 总耗时 = 重试 5 次 × (超时 + connect 时间)
   
   总耗时:5 分钟
```

**这就是 trace 的价值**——**它把"调用链的真实形状"完整呈现**,而 metrics 和日志只能给"独立点的信息"。**没有 trace,这种"链路里某一跳偶发问题"几乎不可能在合理时间内定位**。

### 9.2 trace 真正能解决的 5 类问题

```
   1. "请求慢了" → 慢在哪一跳
   2. "请求失败了" → 哪一跳失败,失败的具体原因
   3. "调用链是什么样" → 不画图也知道服务 A 依赖了 B C D E
   4. "异常重试 / 循环调用" → trace 上一眼能看出来
   5. "跨服务的因果关系" → DB 慢导致服务 A 慢,A 慢导致 B 超时
```

**metrics 和日志各自能解决一部分,但"跨服务因果"只有 trace 能解决**——**这是 100 微服务规模下追踪不可替代的核心价值**。

---

## 十、7 条踩坑清单

### 坑 1:埋点漏关键字段(没 trace 上下文的"裸 span")

**症状**:Tempo 上看到 span,但什么有用信息都没有,**只有"GET /api"和 200ms**。

**根因**:开发用自动埋点,**没有手动加业务属性**。

**修复**:**每个有意义的 span 都该有 attributes**——`user.id` / `order.id` / `tenant.id` / `request.size` 之类:

```go
span.SetAttributes(
    attribute.String("user.id", userID),
    attribute.String("order.id", orderID),
    attribute.Int("items.count", len(items)),
)
```

**预防**:**OTel 语义约定(semantic conventions)是必须的**——`http.method` / `http.status_code` / `db.system` / `messaging.destination` 这些字段都有标准名,**别自创**。

### 坑 2:采样率太低,找不到那次出问题的请求

**症状**:某个 bug 出现后想去 trace 系统找证据,**采样 1% 一天 4 亿请求 → 4M 个 trace,这个 bug 一天发生 100 次 → 采样后只有 1 个 trace**,**还可能漏**。

**修复**:**用尾部采样,错误和慢请求 100% 留**:

```yaml
tail_sampling:
  policies:
    - { name: errors, type: status_code, status_code: { status_codes: [ERROR] } }
    - { name: slow, type: latency, latency: { threshold_ms: 1000 } }
```

**经验**:**头部采样的"低概率漏掉问题"是 trace 系统最大的反 pattern**——**重要的事件,绝不能靠概率赌**。

### 坑 3:Baggage 滥用,塞大字段

**症状**:某次发布后,跨服务调用 RTT 全部增加 50ms,**抓包发现 HTTP header 总大小从 1KB 涨到 10KB**。

**根因**:有人往 Baggage 里塞了整个 user 对象(JSON 序列化)、塞了 ABT 实验的全部 metadata、塞了 trace 自己重复的 trace_id……

**修复**:

```
   Baggage 硬规则:
   ──────────────────
   1. 单个 entry 不超过 100 字节
   2. 总 Baggage 不超过 1KB
   3. 只放 "整条 trace 都需要" 的字段(user.tier / ab.variant / region)
   4. 不放业务数据(user 对象 / order 对象)
   5. 不放 SpanContext 自己已经有的(trace_id / span_id)
```

**预防**:**Baggage 写入要 review**——和"加日志字段"是同等级的决策。

### 坑 4:Span 没 End,trace 永远收不全

**症状**:Tempo 上看到 trace 缺一截,**parent span 在但 child span 找不到结束**。

**根因**:代码里 `span := tracer.Start(...)`,**但忘了 `defer span.End()`**——**没 End 的 span 不会被发送**(BatchSpanProcessor 会一直等)。

**典型出错代码**:

```go
// 错误:漏了 defer
func badExample(ctx context.Context) {
    _, span := tracer.Start(ctx, "doWork")
    // 没 defer span.End()!
    
    if cond {
        return                  // ← 这里 return,span 永远不 End
    }
    span.End()                  // 只有走到这里才 End
}

// 正确
func goodExample(ctx context.Context) {
    _, span := tracer.Start(ctx, "doWork")
    defer span.End()            // ← 任何 return 路径都 End
    
    // ... 业务逻辑
}
```

**预防**:**`span.End()` 永远跟在 `tracer.Start()` 后面一行,用 `defer`**——这是 OTel 编码的硬规则,**code review 必查**。

### 坑 5:跨语言上下文丢失

**症状**:Java 服务调 Go 服务,**trace 在边界断**——Java 端看到完整 trace,Go 端是新 trace。

**根因 1**:Java 用 Sleuth(B3 header),Go 用默认 OTel(W3C header),**两边格式不同**。

**根因 2**:消息队列(Kafka / RabbitMQ)默认不传 header,**生产端发送时 trace 上下文丢了**。

**修复**:

```go
// Go 端配置同时识别 W3C 和 B3
otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
    propagation.TraceContext{},
    b3.New(),                       // 兼容 Java Sleuth
    propagation.Baggage{},
))
```

```java
// Java 端逐步切到 W3C
@Bean
public TextMapPropagator textMapPropagator() {
    return TextMapPropagator.composite(
        W3CTraceContextPropagator.getInstance(),
        B3Propagator.injectingMultiHeaders()
    );
}
```

**预防**:**所有语言统一用 W3C TextContext**,**老服务过渡期同时识别 B3**。

### 坑 6:异步任务上下文丢失

**症状**:HTTP handler 创建了 span,**handler 里 `go doWork()` 启动 goroutine,goroutine 里的 span 不在原 trace 上**。

**根因**:Go 的 `context.Context` 是显式传递的,**`go doWork()` 没传 ctx,goroutine 拿不到 trace 上下文**。

**修复**:

```go
// 错误:context 没传
func handler(w http.ResponseWriter, r *http.Request) {
    ctx := r.Context()
    go func() {
        // 这里 ctx 没传进来,新 span 是孤儿
        doBackground()
    }()
}

// 正确:显式传 ctx
func handler(w http.ResponseWriter, r *http.Request) {
    ctx := r.Context()
    go func(ctx context.Context) {
        ctx, span := tracer.Start(ctx, "doBackground")
        defer span.End()
        doBackground(ctx)
    }(ctx)
}
```

**Python 同理**:`asyncio.create_task` 默认不带 context,**要用 `contextvars` 显式传**。

**预防**:**所有跨 goroutine / 跨线程 / 跨协程的调用,都要显式传 context**——这是分布式追踪的硬要求。

### 坑 7:跨服务采样决策不一致

**症状**:服务 A 的 span 在 Tempo,**服务 B 调用的子 span 不在**——同一个 trace 半条不见。

**根因**:服务 A 采样了(sampled=1),**但服务 B 的 SDK 配的是独立采样**(`AlwaysSample` 或自己的 `TraceIDRatioBased`),**它无视 A 传来的 sampled flag**。

**修复**:**所有服务必须用 `ParentBased` sampler**——**遵循 parent span 的采样决策**:

```go
tp := sdktrace.NewTracerProvider(
    sdktrace.WithSampler(
        sdktrace.ParentBased(                            // 优先遵循 parent
            sdktrace.TraceIDRatioBased(0.1),             // 根 span 才用这个
        ),
    ),
)
```

**逻辑**:**root span(没 parent)按 10% 采样**;**有 parent 的 span,遵循 parent 的 sampled 标志**——**这样整条 trace 的所有 span 要么全在要么全不在**。

**预防**:**所有服务的 sampler 必须用 `ParentBased`**——这是 OTel 推荐,**别自创**。

---

## 十一、何时不该上链路追踪

**这一节给小团队**——**以下情况,不必着急**:

### 11.1 单体应用 / < 5 服务

**调用链就 2-3 层,日志的 request_id 关联就够了**。trace 系统的运维成本超过它解决的问题。

### 11.2 < 1000 QPS + < 10 服务

**复杂度还撑不起 trace**——**先把 metrics 和日志做好**(05-10 篇讲过的),trace 是最后一块拼图。

### 11.3 团队没人懂 OTel

**埋点 / 配置 / Collector 都需要懂**——**没人懂的 trace 系统会变成"装上就不动",最后没人查,跟没装一样**。

**例外**:**用 SaaS(Datadog / Honeycomb)托管**——它们的 SDK 比开源 OTel 易用,**适合"想用 trace 但不想自建"的小团队**。

---

## 十二、回到一开始

**链路追踪是 100 微服务规模下的"必备品"**——它解决的不是"我想监控更多",**是"某个跨服务的偶发问题,我能不能在合理时间内定位根因"**。

这一篇要给你留下的不是"OTel 怎么装",**是 5 件事**:

1. **OTel 是 2024 之后的事实标准**——别再用 Jaeger client / Zipkin client / Sleuth(老服务慢慢迁)
2. **Collector 是必须的**——尾部采样、富化、屏蔽后端变化,SDK 替代不了
3. **采样要做尾部**——错误 100% / 慢请求 100% / 其他低概率,**这是中型团队的金标准**
4. **W3C Trace Context 是默认**——新服务一律 W3C,老服务过渡期同时识别 B3
5. **trace 的核心价值是"跨服务因果"**——metrics 和日志单点信息,trace 是链路全貌

> 经验法则:**100 个微服务 + 10000 QPS + 5 个不同语言栈** 的中型团队,**OTel SDK + Tempo + Grafana** 这套组合,**3 个人 1 个月能落地,1 个 SRE 长期维护**——**这是当下最划算的可观测性追踪方案**。

---

下一篇 `12-持续性能剖析.md`,从"链路追踪"切到"代码级别"——讲清楚为什么 Profile 是可观测性的第四件套(metrics 告诉"有问题",trace 告诉"在哪一跳",**profile 告诉"那一跳里哪行代码慢"**)、Continuous Profiling 是怎么从"出事后跑 pprof"演进到"7×24 持续采集"、Pyroscope / Parca 这些新工具用 eBPF 怎么做到"零代码改动看火焰图"、以及它在中型团队的真实开销和价值——**这是可观测性栈最后一块、也是 2024 年之后崛起最快的一块**。
