# Service Mesh 实战

32 章把"微服务和服务网格是什么"讲清楚了——但**没动手部一个 Istio,看不到它在 K8s 里到底怎么工作**。这章把 Service Mesh 从概念落到 hands-on:Istio / Linkerd 部署、流量管理、安全、可观测性、性能代价。

---

## 一、为什么需要 Service Mesh

```
微服务里每个服务都要做的事:
   ├─ 服务发现 / 负载均衡
   ├─ 重试 / 超时 / 熔断
   ├─ 限流 / 流量控制
   ├─ mTLS 加密
   ├─ 可观测性(Metrics / Trace / Log)
   ├─ 灰度发布 / A/B
   └─ 鉴权 / 策略

每个语言都要重新实现一套(Spring Cloud Java、Go-kit、Node 自己撸)
→ 维护成本爆炸 + 各服务能力参差
```

Service Mesh 的核心思路:**把这些能力下沉到一个 Sidecar 进程**,业务代码什么都不知道。

```
Pod
 ┌──────────────────────────┐
 │  业务容器                  │
 │   ↑↓                      │ ← 业务只跟 localhost 说话
 │  Sidecar (Envoy)          │ ← 网络层做所有"治理"
 └──────────────────────────┘
            ↑↓ mTLS / 策略
        其他 Pod 的 Sidecar
```

> 经验法则:**业务语言数 > 2 + 服务数 > 30 时,Service Mesh 才回本**。否则 Spring Cloud 那套已经够用,引入 Mesh 是给运维加两倍负担。

---

## 二、主流选型

| Mesh | 数据面 | 控制面 | 优势 | 劣势 |
| --- | --- | --- | --- | --- |
| **Istio** | Envoy | istiod | 功能全、生态大 | 资源重、学习曲线陡 |
| **Linkerd** | Linkerd-proxy(Rust) | linkerd-control | 轻、快、简单 | 功能不如 Istio 全 |
| **Consul Connect** | Envoy | Consul | 跟 HashiCorp 栈贴合 | K8s 生态弱 |
| **Cilium Service Mesh** | eBPF + Envoy(可选无代理) | Cilium agent | 内核层,延迟最低 | 较新,生态在追 |
| **Kuma / Kong Mesh** | Envoy | Kuma | 多区域设计好 | 国内用得少 |

**当下推荐**:

- **入门 / 小团队 → Linkerd**(资源占用小,学习成本低)
- **企业级 / 复杂治理 → Istio**(事实标准,招聘容易)
- **追求极致性能 → Cilium**(eBPF 直接在内核做)

---

## 三、Istio 部署(Ambient 模式)

Istio 1.22+ 有两种数据面:

```
Sidecar 模式(传统):
  每 Pod 一个 Envoy(50-100 MB 内存,延迟 +1-3ms)
  
Ambient 模式(2024 GA):
  L4: ztunnel(每节点一个,所有 Pod 共享)
  L7: waypoint proxy(按需,功能用到才开)
  → 资源占用降 70%,无侵入
```

```bash
# 装 Istio CLI
curl -L https://istio.io/downloadIstio | sh -
cd istio-*

# Ambient 模式安装
istioctl install --set profile=ambient -y

# 标某个 namespace 加入 mesh
kubectl label namespace prod istio.io/dataplane-mode=ambient
```

**业务 Pod 完全不用动**——重启就自动接入 mesh。这比 sidecar 模式优雅一个数量级。

> 经验法则:**新项目直接上 Istio Ambient**,Sidecar 模式是历史包袱。Ambient 把"sidecar 烦人"的核心痛点解决了。

---

## 四、流量管理:VirtualService + DestinationRule

### 1. 灰度发布(按权重)

```yaml
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: order-service
spec:
  hosts: [order-service]
  http:
    - route:
        - destination: { host: order-service, subset: v1 }
          weight: 90
        - destination: { host: order-service, subset: v2 }
          weight: 10                  # 10% 流量到新版本

---
apiVersion: networking.istio.io/v1
kind: DestinationRule
metadata:
  name: order-service
spec:
  host: order-service
  subsets:
    - name: v1
      labels: { version: v1 }
    - name: v2
      labels: { version: v2 }
```

业务代码 / Deployment **完全不动**,只改 VS 就实现金丝雀。

### 2. 按 Header 灰度(精准放量)

```yaml
http:
  - match:
      - headers:
          x-canary: { exact: "true" }
    route:
      - destination: { host: order-service, subset: v2 }
  - route:
      - destination: { host: order-service, subset: v1 }
```

测试团队请求带 `x-canary: true` 走 v2,其他走 v1。**比按用户 ID 取模灵活十倍**。

### 3. 故障注入(配合混沌工程)

```yaml
http:
  - fault:
      delay:
        percentage: { value: 10.0 }
        fixedDelay: 5s             # 10% 请求加 5 秒延迟
      abort:
        percentage: { value: 5.0 }
        httpStatus: 503            # 5% 直接 503
    route:
      - destination: { host: order-service }
```

无需改代码就能模拟故障——**演练不能扛 5s 延迟的链路是不是真崩**。

### 4. 重试 / 超时 / 熔断

```yaml
http:
  - timeout: 3s
    retries:
      attempts: 3
      perTryTimeout: 1s
      retryOn: 5xx,reset,connect-failure
    route:
      - destination: { host: order-service }
```

**所有服务统一治理策略**,不再每个服务自己撸 Resilience4j。

---

## 五、mTLS:零信任网络

```
传统:服务间用明文 HTTP,假设"内网安全"
现实:内网失陷后横向移动毫无阻力

Service Mesh:Sidecar 之间自动 mTLS
  → 业务容器仍发 HTTP
  → Sidecar 截获 → 加密 → 发到对端 Sidecar
  → 对端解密 → 转给业务
```

```yaml
# 一句话开启全 mesh mTLS
apiVersion: security.istio.io/v1
kind: PeerAuthentication
metadata:
  name: default
  namespace: istio-system
spec:
  mtls:
    mode: STRICT      # PERMISSIVE = 兼容老服务
```

证书由 istiod 自动签发 + 24 小时轮转,**业务零感知**。

> 经验法则:**Service Mesh 的 mTLS 是 Zero Trust 网络的最便宜入口**——一行配置,所有东西流量加密 + 身份认证,合规审计直接过。

---

## 六、AuthorizationPolicy:服务间访问控制

```yaml
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: order-service
  namespace: prod
spec:
  selector:
    matchLabels: { app: order-service }
  action: ALLOW
  rules:
    - from:
        - source:
            principals: ["cluster.local/ns/prod/sa/api-gateway"]   # 只允许 api-gateway
      to:
        - operation:
            methods: [GET, POST]
            paths: [/orders/*]
```

**基于服务身份(ServiceAccount)而非 IP**——Pod 重启 IP 变了无所谓,身份还是身份。

---

## 七、可观测性:开箱即用三件套

Istio 装好,**自动产出**:

| 维度 | 来源 |
| --- | --- |
| **Metrics**(Prometheus 格式) | 每个调用的 RT / 状态码 / QPS |
| **Distributed Tracing** | Jaeger / Zipkin,自动注入 trace header |
| **Access Log** | 每个请求的详情 |

```bash
# 装一套监控
istioctl install --set profile=demo
kubectl apply -f samples/addons/   # Prometheus / Grafana / Jaeger / Kiali

# 看看
istioctl dashboard kiali
istioctl dashboard jaeger
```

**Kiali**:Service Mesh 拓扑图,**一眼看出谁调谁、谁慢、谁错率高**——这是 Mesh 最爽的体验。

> 经验法则:**Mesh 的 trace 只能告诉你"网络层"**。业务方法级别的 trace 还得 OpenTelemetry SDK 在代码里埋。Mesh + 业务 SDK 是双层 trace 的黄金组合。

---

## 八、Linkerd:更轻、更快、更简单

如果不需要 Istio 的全部功能,Linkerd 是更优雅的选择:

```bash
# 装 CLI
curl --proto '=https' --tlsv1.2 -sSfL https://run.linkerd.io/install | sh

# 安装到集群
linkerd install --crds | kubectl apply -f -
linkerd install | kubectl apply -f -

# 给 namespace 注入
kubectl annotate namespace prod linkerd.io/inject=enabled
kubectl rollout restart deploy -n prod
```

| 维度 | Linkerd | Istio |
| --- | --- | --- |
| 数据面 | Linkerd2-proxy(Rust) | Envoy(C++) |
| 内存 / proxy | ~10MB | ~50MB |
| 延迟开销 | <1ms | 1-3ms |
| 学习曲线 | 平缓 | 陡 |
| API | 简单 CRD | 数十种 CRD |
| 配置面板 | Buoyant Cloud | Kiali / 自建 |
| 适合 | 中小集群、容器优先 | 大厂、复杂治理 |

> 经验法则:**Linkerd 是"我只想要 mTLS + 重试 + 可观测,别给我多功能"** 的最佳选择。不需要 Istio 那一千个 CRD。

---

## 九、Cilium Service Mesh:eBPF 革命

最新也最有想法的方案:**用内核 eBPF 做 L4 流量管理,不要 sidecar**。

```
传统 Sidecar:
  业务 → 用户态 → 内核态 → Sidecar 用户态 → 内核态 → 网络
  4 次上下文切换

Cilium eBPF:
  业务 → 内核态(eBPF 程序处理)→ 网络
  0 次额外切换 → 延迟最低
```

L7 功能(基于 HTTP header 路由)仍可挂 Envoy proxy,**按需启用**。

**优势**:延迟最低、节点级共享,资源占用最少。
**劣势**:eBPF 调试难、生态较新、需要较新内核。

---

## 十、性能代价:Mesh 不是免费午餐

| 维度 | Sidecar Istio | Ambient Istio | Linkerd | Cilium |
| --- | --- | --- | --- | --- |
| 每 Pod 内存 | 50-100MB | 0(共享 ztunnel) | ~10MB | 0 |
| 单跳延迟 | +1-3ms | +0.5-1ms | <1ms | <0.3ms |
| CPU 开销 | 0.1-0.3 core / pod | 节点共享 | 类似 Linkerd | 极低 |
| 启动复杂度 | 高 | 中 | 低 | 中 |

> 经验法则:**P99 敏感的接口(<10ms 那种)接 Sidecar 后会有感**——交易、支付链路上 Mesh 前必须压测,确认延迟可接受。

---

## 十一、生产部署的踩坑指引

### 1. 网关 vs Mesh 的关系

```
南北流量(外 → 内):API 网关(Kong / Apigee / Istio Gateway)
东西流量(内 → 内):Service Mesh
```

Istio 自带 Gateway,**南北 + 东西可统一管**;但很多团队把 Gateway 留给 Kong / Apigee,Mesh 只管东西。

### 2. mTLS 渐进式引入

```
PERMISSIVE → 监控有多少非 mTLS 流量 → 收尾 → STRICT

绝不要一上来 STRICT
```

### 3. 灰度从单服务开始

```
1. 先把一个低风险服务接入 Mesh 跑 1 个月
2. 观察 Metrics、错误率、延迟变化
3. 再逐 namespace 推开
```

### 4. 控制面 HA

istiod 单点挂了,数据面 Envoy 用最后一份配置继续跑(读写分离),**业务不立刻断**——但 24 小时内必须恢复(证书要轮转)。

---

## 十二、什么时候**不要**上 Service Mesh

| 场景 | 为什么不要 |
| --- | --- |
| 服务数 < 10 | Spring Cloud / 手撸足够 |
| 单一语言 + 单一框架 | 框架内置治理就够 |
| 团队没运维 K8s 经验 | Mesh 让 K8s 复杂度 ×2 |
| 极致延迟需求(<5ms RT) | Sidecar 加的 1-3ms 比例太大 |
| 不需要灰度 / mTLS / 跨语言治理 | 引入毫无价值 |

> 经验法则:**Mesh 是"用复杂度换治理统一"**——你的业务复杂度高得受不了"每语言各撸一套",才该考虑。否则就是给运维加坑。

---

## 十三、常见踩坑

1. **没考虑性能就接 Sidecar**:延迟 +3ms,SLO 直接破
2. **mTLS 直接 STRICT**:遗留服务还在,流量全断
3. **Sidecar 内存不限**:Pod OOM,业务被一起杀
4. **Istio 全功能装满**:CRD 一百多个,运维看天书
5. **Mesh 和 Spring Cloud 重复治理**:重试 ×2、限流 ×2、排查地狱
6. **VirtualService 改完没生效**:Envoy 配置缓存,要等几秒
7. **Sidecar 启动慢于业务**:业务先启动,前几秒请求失败
8. **Ingress + Gateway + VirtualService 一起用**:路径优先级搞不清
9. **istiod 升级跨大版本**:不兼容,Envoy 配置加载失败
10. **没监控 Sidecar 自身**:Sidecar 挂业务异常,但看不到原因
11. **AuthorizationPolicy 没默认 deny**:漏配了某个,变全开
12. **不用 Kiali / Jaeger,光看 Prometheus 数字**:看不到拓扑
13. **eBPF Cilium 装在老内核**:某些功能跑不起来
14. **Linkerd 想要 Istio 才有的功能**:用不了,选错栈了

---

## 十四、本章 Checklist

| 项 | 说明 |
| --- | --- |
| ✅ 服务数 > 30 / 多语言 才考虑 Mesh | 别为了上而上 |
| ✅ 新项目用 Istio Ambient 模式 | 摆脱 sidecar 包袱 |
| ✅ 中小集群优先 Linkerd | 简单够用 |
| ✅ mTLS 从 PERMISSIVE 开始 | 兼容遗留 |
| ✅ AuthorizationPolicy 默认 deny | 零信任 |
| ✅ Sidecar / Ambient 资源监控 | 防 OOM |
| ✅ Kiali 拓扑图常看 | 一眼看健康 |
| ✅ Mesh trace + 业务 trace 串通 | 端到端可观测 |
| ✅ 灰度先用 VirtualService 权重 | 比 Deployment 副本灰度精细 |
| ✅ 与 Spring Cloud 治理二选一 | 不要双重治理 |
| ✅ 关键链路压测验 P99 | Sidecar 增加的延迟可接受? |
| ✅ istiod / linkerd 控制面 HA | 升级有计划 |

---

## 小结

Service Mesh 的本质是**把服务治理从业务代码里"挖出来"放到平台上**——业务专注业务,治理统一管理。

记住三件事:

1. **Mesh 是规模化解药,不是小项目玩具**——服务少时它的复杂度 > 收益
2. **Ambient + Linkerd + Cilium 三派**,各有所长,**选最贴你团队能力的**
3. **Mesh 装上不等于"高可用了"**——它给的是"工具",真要用好仍要 SLO + Chaos + Postmortem 那套配齐

下一章我们换场景——一个**专业方向**的开篇:**图数据库 Neo4j**。社交、风控、知识图谱这种"关系密集"业务,关系型数据库是真扛不住的。
