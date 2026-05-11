# Envoy 与服务网格

「Nginx 不是挺好的吗,为什么云原生都跑去用 Envoy?」——这是从单体时代过来的工程师最常见的疑问。但**当你管 100 个微服务、每天发 50 次版、每个服务有 mTLS 证书**,你会突然懂:**Nginx 改一行配置要 reload,Envoy 改一千个路由不停机;Nginx mTLS 证书要手动塞,Envoy SDS 自动滚;Nginx 加个新协议要编译模块,Envoy 加 filter 用 wasm 热插**。**Envoy 不是"更好的 Nginx",是范式不同的产品**——它的设计前提是"**配置永远变,架构永远变,我必须能在不停机前提下吞下任何变化**"。从 2016 年 Lyft 开源到 2018 年成为 CNCF 毕业项目,Envoy 在三年内吃下了云原生的代理市场——**Istio / Consul Connect / AWS App Mesh / Cilium Mesh 全跑 Envoy 数据面**——你不一定要现在就上,但**必须吃透它的架构,这是未来 10 年的代理基线**。

> 一句话先记住:**Envoy = L7 代理 + 一切配置都从控制面通过 xDS gRPC 流推过来**——它本身不读 yaml,不 reload,**所有 Listener / Route / Cluster / Endpoint / Secret 都是控制面动态推的对象**。**这就是 Envoy 和 Nginx 的根本分野**:Nginx 是"配置文件 + reload"模型,Envoy 是"控制面 + 数据面分离"模型。**Istio = 控制面(Istiod 推 xDS)+ 数据面(每个 Pod 旁边塞一个 Envoy sidecar)**——你写的虚拟服务规则被 Istiod 翻译成 Envoy 配置,通过 xDS 推给所有 sidecar,**毫秒级生效不需要任何重启**。理解这一点,你就理解了服务网格的全部魔法。

承接上一篇 34-Nginx 深度:你已经知道 master/worker、epoll 事件循环、location 优先级、upstream 算法。**Envoy 在数据面层面和 Nginx 是同类**——都是 L7 代理,都用事件驱动——**但配置模型完全反过来**。这一篇讲清楚 Envoy 怎么用 + 服务网格的本质,**下一篇 36 把 Envoy / Nginx / HAProxy 放到 LB 和 CDN 调度的更大图里看**。

---

## 一、为什么会有 Envoy:Nginx 在微服务时代的痛

### 1.1 三个不能忍

```
痛 1:配置变更要 reload
  100 个微服务 × 每天 50 次发布 = 5000 次 reload/天
  reload 期间老 worker 还在,新 worker 起来,内存翻倍
  长连接(WebSocket / gRPC stream)被强制断或者挂在老 worker

痛 2:服务发现要外挂
  Nginx 不知道"我这个 upstream 实际有几个 Pod"
  要么 nginx-upstream-dynamic-servers + Consul,要么 OpenResty + lua
  自己造轮子,没有统一标准

痛 3:可观测性弱
  日志只能写文件 + tail
  metrics 要装第三方模块(nginx-vts / nginx-prometheus-exporter)
  trace 几乎没有原生支持
```

### 1.2 Envoy 的三个直接答案

```
答 1:xDS API
  所有配置 = 控制面推过来的对象
  改路由 = 控制面推一条新 RDS,数据面毫秒生效
  零 reload,零重启

答 2:服务发现是一等公民
  EDS(Endpoint Discovery Service)= 上游 IP 列表
  Pod 起 / 灭,控制面推 EDS,Envoy 立即更新

答 3:o11y 内建
  统计:几百个内置 metric 全推 statsd / Prometheus
  trace:Zipkin / Jaeger / Lightstep 原生
  日志:结构化 access log,字段完全可定制
```

### 1.3 数字感对比

| 指标 | Nginx | Envoy |
| --- | --- | --- |
| 单核 QPS(空 reverse proxy) | ~80K | ~50K |
| 内存基线 | ~10 MB | ~80 MB |
| P99 延迟(空代理) | 0.3 ms | 0.5 ms |
| 配置变更生效 | 1-3s reload | < 100 ms xDS |
| 长连接 reload 影响 | 老 worker 留 4h | 0 |
| 内置 metric 数 | ~50(加模块) | ~500 |
| HTTP/3 支持 | 1.25+(2022) | 1.18+(2021) |
| gRPC 支持 | 转发 OK,深度差 | 一等公民,gRPC-Web 桥接 |

**总结**:**Envoy 单核性能略弱、内存重,但配置动态性、协议丰富度、可观测性全面碾压**。这是云原生场景对的取舍——**单台代理性能不够就横向加,但配置管不过来就死**。

---

## 二、Envoy 架构:一图看清

### 2.1 数据流

```
                                  ┌───── Cluster A ──── EDS ──── Endpoint(s)
                                  │
Listener → Filter Chain → Router ─┤───── Cluster B ──── EDS ──── Endpoint(s)
   ↑           ↑            ↑     │
   LDS         匹配 vhost    RDS   └───── Cluster C ──── EDS ──── Endpoint(s)
                + route             ↑
                                    CDS
                                    
所有 LDS/RDS/CDS/EDS/SDS 都通过 ADS gRPC 流从控制面订阅
```

| 概念 | Nginx 对应 | 角色 |
| --- | --- | --- |
| **Listener** | `listen 80` | 监听一个端口 |
| **Filter Chain** | location + handler 链 | 处理 L4/L7 数据,可串多个 |
| **Router(http_connection_manager)** | http {} 块 | HTTP 解析 + 路由分发 |
| **Cluster** | `upstream` 块 | 一组上游(逻辑后端) |
| **Endpoint** | `server` 行 | 具体的 IP:port |

### 2.2 五种主 xDS API

```
LDS  Listener Discovery Service       推监听器(端口 + filter chain)
RDS  Route Discovery Service          推路由(URL → Cluster 映射)
CDS  Cluster Discovery Service        推集群(逻辑后端)
EDS  Endpoint Discovery Service       推端点(具体 IP)
SDS  Secret Discovery Service         推证书 / 密钥(mTLS)

ADS  Aggregated Discovery Service     一条 gRPC 流跑所有 xDS,保证顺序一致
```

**为什么需要 ADS?**因为 LDS / RDS / CDS / EDS 之间有依赖关系——Listener 引用 Route,Route 引用 Cluster,Cluster 引用 Endpoint。**分别推的话顺序错了 Envoy 就 NACK(不接受这个配置)**。ADS 把所有推送序列化到一个 gRPC stream 上,**保证因果顺序**。

### 2.3 启动配置 vs 动态配置

```
bootstrap.yaml:           Envoy 启动唯一硬编码的文件
  └── 写死控制面地址
  └── 写死自己的 node 信息
  └── 启动后立刻去控制面订阅

控制面推过来的:           所有真正的业务配置
  └── 听哪个端口
  └── 转发什么 URL 到哪个后端
  └── 用什么证书
```

**bootstrap 启动后就不再改**——所有变化都通过 xDS 来。

---

## 三、Listener / Filter Chain:比 Nginx 强一千倍的 L7 编排

### 3.1 Filter 是什么

```
连接进来
  ↓
Listener Filter        (L4 阶段:TLS 检测 / proxy protocol 解析)
  ↓
Network Filter Chain   (L4 阶段:TCP 代理 / Redis 协议 / MySQL 协议)
  ↓
HTTP Filter Chain      (L7 阶段,如果 Network 是 http_connection_manager)
  ↓ (一连串 HTTP filter,顺序很重要)
  - cors
  - jwt_authn
  - rate_limit
  - lua / wasm
  - rbac
  - router(终点,转发到 Cluster)
  ↓
Cluster → Endpoint
```

### 3.2 一份典型 Listener 配置(节选)

```yaml
listeners:
- name: listener_0
  address:
    socket_address: { address: 0.0.0.0, port_value: 8080 }
  filter_chains:
  - filters:
    - name: envoy.filters.network.http_connection_manager
      typed_config:
        "@type": type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager
        stat_prefix: ingress_http
        codec_type: AUTO
        rds:
          route_config_name: my_route
          config_source: { ads: {} }
        http_filters:
        - name: envoy.filters.http.cors
        - name: envoy.filters.http.jwt_authn
          typed_config:
            providers:
              auth0:
                issuer: https://my.auth0.com/
                audiences: [my-api]
                remote_jwks: { http_uri: { uri: https://my.auth0.com/.well-known/jwks.json, cluster: jwks_cluster, timeout: 1s } }
            rules:
            - match: { prefix: /api/ }
              requires: { provider_name: auth0 }
        - name: envoy.filters.http.local_ratelimit
          typed_config:
            stat_prefix: rl
            token_bucket: { max_tokens: 100, tokens_per_fill: 10, fill_interval: 1s }
        - name: envoy.filters.http.router   # ★ 必须最后一个
```

**关键观察**:

```
1. Filter 顺序就是执行顺序(类似 express middleware)
2. router filter 必须在最后(它是终点)
3. 每个 filter 配置都是 strongly typed protobuf,IDE 能补全
4. RDS 模式下,路由表不在 Listener 里,从控制面动态推
```

### 3.3 高级:同一端口跑多协议

Filter Chain 可以**按 SNI / 客户端类型分流**:

```yaml
listeners:
- name: multi_proto
  address: { socket_address: { address: 0.0.0.0, port_value: 443 } }
  listener_filters:
  - name: envoy.filters.listener.tls_inspector   # 偷看 ClientHello
  filter_chains:
  - filter_chain_match: { server_names: [api.example.com] }
    transport_socket: { name: envoy.transport_sockets.tls, ... }
    filters: [ http_connection_manager 配置... ]
  - filter_chain_match: { server_names: [grpc.example.com] }
    transport_socket: { name: envoy.transport_sockets.tls, ... }
    filters: [ http_connection_manager 配置 with HTTP/2... ]
  - filter_chain_match: {}        # default: 普通 TCP 透传
    filters: [ tcp_proxy 配置... ]
```

**一份 listener 同时跑 HTTPS API + gRPC + TCP 透传**——Nginx 要写三个 server 块且端口冲突就没法这样。

---

## 四、xDS 协议:配置怎么"推"过来

### 4.1 一次 xDS 交互长什么样

```
控制面(Istiod)              数据面(Envoy)
                              │
       ◄──── ADS gRPC stream 建立 ───── │   (Envoy 启动时连上)
                              │
                              │  DiscoveryRequest
                              │  { type: LDS, version: "" }
       ◄────────────────────  │   "我要 Listener,目前没有"
                              │
       DiscoveryResponse
       { resources: [Listener_0], version: "v1" }
       ──────────────────────►│
                              │  Envoy 应用 Listener_0
                              │
                              │  DiscoveryRequest
                              │  { type: LDS, version: "v1", response_nonce: ... }
       ◄────────────────────  │   "v1 收到,继续监听"
                              │
                              ⋮  保持流活,有新版本立即推
                              ⋮
       DiscoveryResponse
       { resources: [Listener_0', Listener_1], version: "v2" }
       ──────────────────────►│
                              │  Envoy diff & 应用变更
                              │
                              │  DiscoveryRequest
                              │  { type: LDS, version: "v2" }
       ◄────────────────────  │   ACK
```

**ACK / NACK 机制**:数据面应用配置失败 → 回 NACK + 错误信息 → 控制面知道这个版本有问题。

### 4.2 增量 vs 全量

```
SOTW(State of the World)模式:
  每次推全量,Envoy 自己 diff
  简单,但配置大时浪费带宽

Incremental(Delta)模式:
  只推变化的资源 + 删除的资源名
  Envoy 增量更新
  Istio 1.6+ 默认开
```

### 4.3 Envoy 怎么"热加载"配置而不停机

```
旧 Listener(端口 8080,filter v1)
        ↓ 控制面推新版本
新 Listener(端口 8080,filter v2)
        ↓
Envoy 在内部:
  1. 把端口 8080 的 fd 移交给新 Listener(SO_REUSEPORT)
  2. 老连接继续在老 Listener 上处理(drain timeout)
  3. 新连接走新 Listener
  4. drain timeout(默认 10min)后老 Listener 销毁

效果:零丢包,长连接平滑过渡
```

**对比 Nginx 平滑 reload**:Nginx 老 worker 也保留,但**配置文件级别整体替换**——Envoy 是**单个对象级别替换**,粒度细 100 倍。

### 4.4 自己跑一个最小 xDS server

```bash
# 用 go-control-plane 写
$ cat main.go
package main
import (
    cache "github.com/envoyproxy/go-control-plane/pkg/cache/v3"
    server "github.com/envoyproxy/go-control-plane/pkg/server/v3"
    discovery "github.com/envoyproxy/go-control-plane/envoy/service/discovery/v3"
)
// ... 几十行起 gRPC server,推送 LDS/CDS/EDS 资源
```

**社区现成的实现**:Istiod、Contour、Gloo、Consul、Cilium 都内嵌 xDS server。**没必要自己写,除非你做 mesh 厂商**。

---

## 五、Cluster:上游不只是 IP 列表

Envoy 的 Cluster 比 Nginx 的 upstream 强大得多:

```yaml
clusters:
- name: my_service
  type: STRICT_DNS                  # 类型:STATIC / STRICT_DNS / EDS / LOGICAL_DNS / ORIGINAL_DST
  connect_timeout: 1s
  lb_policy: LEAST_REQUEST           # 算法:ROUND_ROBIN / LEAST_REQUEST / RING_HASH / MAGLEV / RANDOM
  load_assignment:
    cluster_name: my_service
    endpoints:
    - lb_endpoints:
      - endpoint: { address: { socket_address: { address: backend.svc, port_value: 8080 } } }
  health_checks:
  - timeout: 1s
    interval: 5s
    unhealthy_threshold: 3
    healthy_threshold: 2
    http_health_check: { path: "/healthz" }
  outlier_detection:                 # 异常检测(被动健康检查)
    consecutive_5xx: 5
    interval: 10s
    base_ejection_time: 30s
    max_ejection_percent: 50
  circuit_breakers:
    thresholds:
    - max_connections: 1024
      max_pending_requests: 1024
      max_requests: 1024
      max_retries: 3
  transport_socket:                  # TLS 到上游
    name: envoy.transport_sockets.tls
    typed_config:
      "@type": type.googleapis.com/envoy.extensions.transport_sockets.tls.v3.UpstreamTlsContext
      sni: backend.svc
```

**和 Nginx 的差距**:

| 能力 | Nginx | Envoy |
| --- | --- | --- |
| 主动健康检查 | 商业版 / OpenResty | 原生 |
| 异常检测(自动驱逐异常 endpoint) | 没有 | outlier_detection |
| 熔断 | 没有(要 lua 实现) | circuit_breakers 原生 |
| 一致性哈希(MAGLEV / RING_HASH) | hash 一致性哈希,弱 | MAGLEV(Google 论文)、RING_HASH 都原生 |
| 服务发现 | 第三方模块 | EDS 一等公民 |

---

## 六、SDS 和 mTLS 自动签发:服务网格的卖点

### 6.1 为什么 mTLS 是服务网格的核心

零信任(Zero Trust)的口号:**默认不信任内网**——服务间通信必须双向认证 + 加密。**详见 networkLearning/20-mTLS**。

```
传统:
  service A ──── HTTP ────► service B
  内网?信任?谁在乎,反正没人扫描我

服务网格:
  service A ──► sidecar A ──── mTLS ────► sidecar B ──► service B
                             ★ 双向证书校验
```

**问题**:几百个服务,每个要一对证书,7 天过期,谁手动滚?**SDS 解决这个**。

### 6.2 SDS 工作流

```
Istiod(控制面 + CA)         Envoy sidecar
                              │
    ◄─── 启动:把 ServiceAccount JWT 给我 ────│
    
    验 JWT,签一对 X.509(短期,如 24h)
    └── 通过 SDS 推过去
    ─────────────────────────────────────────►│
                                              │ 用这对证书做 mTLS

    (24h 到期前)
    主动推新证书 ──────────────────────────►│ 无缝切换
```

**整个过程零运维介入**——证书每天自动滚,坏了也能秒级换。**这是 Istio / Linkerd 最大的卖点之一**。

### 6.3 SPIFFE 标准

证书的 Subject Alternative Name(SAN)长这样:

```
URI: spiffe://cluster.local/ns/default/sa/my-service-account
        └────────────┘ └─────────┘ └────────────────────┘
        信任域           namespace      ServiceAccount
```

**SPIFFE ID 是服务的"身份"**——**RBAC 直接基于这个 ID 做授权**(详见 20 篇)。

```yaml
# 只允许 frontend 访问 backend(基于 SPIFFE ID)
rbac:
  rules:
  - permissions: [ any: true ]
    principals:
    - authenticated:
        principal_name:
          exact: spiffe://cluster.local/ns/default/sa/frontend
```

---

## 七、可观测性:metric / trace / log 三件套

### 7.1 Metric

Envoy 内置**几百个 metric**——每个 listener、cluster、filter 都有:

```
listener.0.0.0.0_8080.downstream_cx_total
listener.0.0.0.0_8080.downstream_cx_active
cluster.my_service.upstream_rq_total
cluster.my_service.upstream_rq_2xx
cluster.my_service.upstream_rq_5xx
cluster.my_service.upstream_rq_time         (histogram, P50/P90/P99)
cluster.my_service.upstream_cx_connect_fail
http.ingress_http.downstream_rq_total
```

**直接通过 admin 接口拿**:

```bash
$ curl localhost:9901/stats              # 文本
$ curl localhost:9901/stats/prometheus   # Prometheus 格式
```

**或者推到 statsd / Prometheus / OpenTelemetry**:

```yaml
stats_sinks:
- name: envoy.stat_sinks.statsd
  typed_config:
    address: { socket_address: { address: 127.0.0.1, port_value: 8125 } }
```

### 7.2 Trace

Envoy **原生支持 Zipkin / Jaeger / Lightstep / Datadog / OpenTelemetry**——只需要在 http_connection_manager 里加几行:

```yaml
tracing:
  provider:
    name: envoy.tracers.zipkin
    typed_config:
      "@type": type.googleapis.com/envoy.config.trace.v3.ZipkinConfig
      collector_cluster: zipkin
      collector_endpoint: "/api/v2/spans"
      collector_endpoint_version: HTTP_JSON
```

**Envoy 自动**:

```
- 入口请求:看 incoming x-b3-traceid 头,有就续 trace,没就开新 trace
- 出口请求:把 x-b3-traceid 注入到上游请求(传播 trace)
- 每个 span 上报:method / url / status / 耗时 / 后端 cluster
```

**所有微服务都跑 Envoy → 整条链路自动 trace**——这是服务网格不需要业务代码改造就能拿到分布式追踪的根源。

### 7.3 Log

Access log 字段**完全自定义**:

```yaml
access_log:
- name: envoy.access_loggers.file
  typed_config:
    "@type": type.googleapis.com/envoy.extensions.access_loggers.file.v3.FileAccessLog
    path: /dev/stdout
    log_format:
      json_format:
        time: "%START_TIME%"
        method: "%REQ(:METHOD)%"
        path: "%REQ(X-ENVOY-ORIGINAL-PATH?:PATH)%"
        protocol: "%PROTOCOL%"
        status: "%RESPONSE_CODE%"
        duration: "%DURATION%"
        upstream: "%UPSTREAM_HOST%"
        upstream_duration: "%RESPONSE_DURATION%"
        bytes_received: "%BYTES_RECEIVED%"
        bytes_sent: "%BYTES_SENT%"
        request_id: "%REQ(X-REQUEST-ID)%"
        trace_id: "%REQ(X-B3-TRACEID)%"
```

**JSON 格式直接喂 ELK / Loki**——比 Nginx 的纯文本 log 强一万倍。

---

## 八、Envoy vs Nginx 全面对比

### 8.1 单纯反代

| 维度 | Nginx | Envoy |
| --- | --- | --- |
| 学习曲线 | 平缓,配置直觉 | 陡,YAML protobuf 很冗长 |
| 性能(单核 QPS) | 80K | 50K |
| 内存基线 | 10 MB | 80 MB |
| 配置文件可读 | 高 | 低(几百行 YAML) |
| 文档质量 | 好 | 文档全但分散 |
| 社区生态 | 历史悠久 | 云原生主流 |

### 8.2 协议支持

| 协议 | Nginx | Envoy |
| --- | --- | --- |
| HTTP/1.1 | ✓ | ✓ |
| HTTP/2 | ✓ | ✓ |
| HTTP/3 / QUIC | 1.25+ | 1.18+ |
| gRPC | 转发 OK,弱解 | 一等公民,gRPC-Web 桥 |
| WebSocket | ✓ | ✓ |
| TCP / UDP | stream 模块 | tcp_proxy / udp_proxy |
| MySQL 协议感知 | 商业版 | 原生 filter |
| Redis 协议感知 | OpenResty 社区 | 原生 filter |
| Kafka 协议感知 | 没有 | 原生 filter |
| Postgres 协议感知 | 没有 | 原生 filter |

### 8.3 动态性

| 能力 | Nginx | Envoy |
| --- | --- | --- |
| 配置变更 | reload(秒级) | xDS(毫秒级) |
| upstream 列表变更 | OpenResty + lua | EDS 原生 |
| 证书滚动 | 手动重载 | SDS 自动 |
| 路由变更 | reload | RDS 推 |
| 流量切分(canary) | 手写多 server | 路由 weighted_clusters 一行 |

### 8.4 怎么选

```
99% 场景仍然用 Nginx:
  - 单体 / 小集群
  - 静态站点 + 反代
  - 团队没人懂 service mesh
  
该用 Envoy:
  - 微服务 ≥ 50 个
  - 需要全自动 mTLS
  - 需要分布式追踪开箱即用
  - 已经在 K8s 上跑
  - 频繁改路由(灰度 / A/B / 金丝雀)
  
不该用 Envoy:
  - 团队不熟,光学就半年
  - 静态资源 / 单体应用
  - 极致性能(单核 QPS)
```

> 经验法则:**Envoy 的复杂度只有在 50+ 服务规模才能摊薄**——小规模上 Envoy 是用大炮打蚊子。**Istio 官方都建议 5 节点以下别上**。

---

## 九、服务网格:数据面 + 控制面

### 9.1 一图看懂 Istio

```
                  ┌─────────────────────────┐
                  │      Istiod (控制面)     │
                  │  - 配置翻译(VirtualService → xDS)
                  │  - CA(签 mTLS 证书)
                  │  - 服务注册中心同步(K8s API)
                  └────────────┬────────────┘
                               │ xDS gRPC
                ┌──────────────┼──────────────┐
                │              │              │
        ┌───────▼─────┐  ┌─────▼────┐  ┌──────▼────┐
        │  Pod A      │  │  Pod B   │  │  Pod C    │
        │  ┌───────┐  │  │ ┌──────┐ │  │ ┌───────┐ │
        │  │ envoy │◄─┼──┼─│envoy │◄┼──┼─│ envoy │ │
        │  │sidecar│  │  │ │sidecr│ │  │ │sidecar│ │
        │  └───┬───┘  │  │ └──┬───┘ │  │ └───┬───┘ │
        │      │      │  │    │     │  │     │     │
        │  ┌───▼───┐  │  │ ┌──▼──┐  │  │ ┌───▼──┐  │
        │  │ app   │  │  │ │ app │  │  │ │ app  │  │
        │  └───────┘  │  │ └─────┘  │  │ └──────┘  │
        └─────────────┘  └──────────┘  └───────────┘
                              │
                  iptables 把流量劫持到 sidecar
```

### 9.2 Istio 怎么把"流量劫持"到 sidecar

K8s 装 Istio 后,**每个 Pod 自动注入 envoy sidecar + init-container**:

```
init-container:
  iptables -t nat -A OUTPUT -p tcp -j REDIRECT --to-port 15001
                  ↑ 应用出去的所有 TCP 都转到 envoy sidecar 的 15001
  iptables -t nat -A PREROUTING -p tcp -j REDIRECT --to-port 15006
                  ↑ 进来的所有 TCP 也转到 envoy 的 15006

应用代码完全无感:
  app curl http://backend → 实际进了 envoy → envoy mTLS 到对端 envoy → 再到 backend
```

**这就是"应用零改造接入 mesh"的真相**——iptables hijack。

### 9.3 控制面长什么样

`VirtualService` 是用户写的高层抽象:

```yaml
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: reviews
spec:
  hosts: [reviews]
  http:
  - match:
    - headers: { user-agent: { regex: ".*Chrome.*" } }
    route:
    - destination: { host: reviews, subset: v2 }
      weight: 90
    - destination: { host: reviews, subset: v3 }
      weight: 10           # Chrome 用户 10% 切到 v3
  - route:
    - destination: { host: reviews, subset: v1 }
```

**Istiod 把这个翻译成具体的 Envoy RDS / CDS 配置,推给所有相关 sidecar**。**这就是服务网格的范式**:**用户写"我要怎样",平台帮你做"怎么实现"**。

---

## 十、Sidecar vs Gateway:两种部署模式

### 10.1 Sidecar 模式

```
每个 Pod 一个 envoy
  ↓
所有南北 + 东西流量都过 envoy
  ↓
精细控制(每个服务独立策略)
↑↑ Istio / Linkerd 默认
```

**优点**:细粒度、零信任、本地策略。
**缺点**:每 Pod 多 80MB 内存 × 几千 Pod = 几百 GB,**资源消耗大**。

### 10.2 Gateway 模式(Ingress / Egress)

```
Cluster 边界放一个共享的 envoy 集群
  ↓
南北流量从这进出
  ↓
集群内部 Pod 直连(不走 sidecar)
↑↑ Envoy Gateway / Contour / Ambient Mesh
```

**优点**:资源省、运维简单。
**缺点**:东西流量没策略 / 没 mTLS。

### 10.3 Ambient Mesh:Istio 的新方向(2023+)

```
没有 sidecar,改成 ztunnel(节点级 L4 代理)+ Waypoint(L7 代理)
  ↓
ztunnel 跑在每个节点(类似 kube-proxy 一份),做 mTLS + L4 策略
  ↓
要 L7 策略时才挂一个 waypoint pod
  ↓
内存从每 Pod 80MB 降到每节点共享几十 MB
```

**这是对"Sidecar 资源开销大"的回应**——但成熟度还在路上。

---

## 十一、踩坑提醒

1. **以为 Envoy 是 Nginx 替代品**——99% 场景 Nginx 更合适,Envoy 只在大微服务集群有 ROI
2. **手写 Envoy YAML 上生产**——配置太长,必定写错,**用控制面**(Istio / Contour / Gloo)
3. **没装 admin 接口**(`localhost:9901`)——出问题没法看 stats / config_dump,排障地狱
4. **xDS 推送频率太高**——上千服务时每秒几次推 + diff 计算,Envoy CPU 飙
5. **Cluster `connect_timeout` 设很大**——后端慢时所有请求堆积,**1s 是上限**
6. **没配 `circuit_breakers`**——Envoy 默认上限是 1024,大流量直接打满
7. **Sidecar 内存 80MB × 1000 pod = 80GB**——预算时漏算,集群挤爆
8. **iptables 劫持把 Pod 的 metric 也劫了**——Prometheus 抓不到,要排除特定端口
9. **mTLS PERMISSIVE 模式忘了切 STRICT**——线上 50% 流量还在明文,不知道
10. **HTTP/2 默认 gRPC 框架的 keepalive 时间长达 2 小时**——Envoy / 中间网络可能超前断,要主动调
11. **以为 Istio 必须用 Envoy**——能换,但生态全是 Envoy,换 Linkerd2-proxy 是另一种取舍
12. **以为换上 Envoy 就有 trace**——还要业务代码传播 `x-b3-traceid` 头,不传就断链

---

下一篇:`36-LB-CDN调度.md`,把代理拉到更宏观的层面看——**L4 LB(LVS / HAProxy / DPVS)vs L7 LB(Nginx / Envoy)**,**LB 算法地图**(轮询 / 加权 / 最少连接 / 一致性哈希,引用 algorithmLearning/25)、**会话保持**(cookie / source IP)、**主动健康检查 vs 被动健康检查**、**CDN 三件套**(GSLB DNS 调度 / Anycast / 边缘缓存策略)、**回源限流和源站保护**、**Cloudflare Workers / Vercel Edge 这种边缘计算**——以及为什么"全球用户都觉得快"的背后是**几千个边缘节点 + 几十种调度算法 + 严格的回源治理**。
