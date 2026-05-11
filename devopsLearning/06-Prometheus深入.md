# Prometheus 深入:Pull 模型 / 服务发现 / Recording Rule / Federation

上一篇讲了 Metrics 心智——四种 metric 类型、avg 是骗人的、cardinality 是怎么炸的。这一篇拆开下游:**这些 metric 怎么被采集回来、存哪儿、怎么提前算好、怎么扩到多机房**。**Prometheus 是 2026 年 Metrics 这一层的事实标准**——但事实标准不等于无脑用。我见过太多团队装上 Prom 就觉得"我们上监控了",**实际上他们的 Prom 在每天凌晨 3 点 OOM 一次,WAL 损坏一周一次,Remote Write 队列堵到 50 GB,Federation 拉远端拉到 timeout**。这些坑都不是 Prom 本身的问题,是工程师没理解 Prom 的设计假设就开始拍配置。

backendLearning/33 浅讲过 Prometheus 是什么、怎么装。**这一篇默认你已经会 `prometheus --config.file=prometheus.yml`**,讲的是**生产级 Prometheus 的工程视角**:Pull vs Push 为什么是争论了 10 年还没结束的话题但在 K8s 里答案显而易见;服务发现的三种主流模式各自适合谁;Scrape interval 拍 15s 还是 30s 这道选择题怎么算账;Recording Rule 不是性能优化是工程纪律;Federation 和 Remote Write 各自的边界;单实例 Prom 撑到几百万 series 就要拆 —— 拆成什么(看下一篇 PromQL 实战 + 08 篇长存储)。

> 一句话先记住:**Prometheus 是为"几千个 target × 几百万个 series × 几天数据"设计的**——超出这个量级它不是不能跑,是**没有为这个量级优化**。**90% 的 Prometheus 事故,根因是工程师把它当成 InfluxDB / TimescaleDB / Datadog 在用,然后撞上它没设计为这个场景的边界**。这一篇就是把这些"它不擅长的事"挨个讲清楚——**不擅长的事让 VictoriaMetrics / Thanos / Mimir(08 篇)去做,Prometheus 自己只做它擅长的那 90% 的活**。

---

## 一、问题场景:没有规划的 Prometheus 长什么样

直接讲一个真实故事(混合了几个团队的经历,但每件事都真发生过)。

某团队从 backendLearning 学了 Prometheus 怎么起步,装了一台 4C8G 的虚拟机,跑 Prometheus,scrape 100 个 microservice 的 `/metrics`。**头三个月一切完美**——dashboard 漂亮,告警准时,SRE 老板表扬。

```
第 4 个月:
  - 业务量翻倍,microservice 变成 200 个
  - 每个 service 暴露 100+ 个 metric
  - 总 series 数:大约 200 × 5000 = 1M
  - Prometheus 内存:4 GB → 7 GB
  
第 5 个月:
  - 工程师为了"按用户拆"加了 user_id label
  - series 数:1M → 50M
  - 凌晨 OOM 一次,重启后正常
  - 团队修了一晚把 user_id label 拿掉,series 回 1M
  - 但 WAL 损坏,丢了 6 小时数据

第 6 个月:
  - 业务接入第二个机房,有人提出"两边 Prom 联邦"
  - Federation 一开,中心 Prom 每 15s 拉远端
    远端的 1M series 全推过来
    中心 Prom 内存爆炸 → 又 OOM
  - 联邦改成"只拉聚合后的指标",但聚合规则没写好
    aggregation 把 cardinality 又拉高了
  - 决定上 Thanos,但没人懂,先停在"联邦+本地"凑合

第 12 个月:
  - 团队招了个 SRE,看到现状直接说:
    "你们这套架构在 50 个服务以内是对的,过了 100 个就该重新设计了"
  - 重新做:Prometheus 分两套(business + infra)
    每套独立 Prom + 共享 Thanos
    Recording Rule 把 PromQL 重的查询预算了
    Cardinality 监控周报
    花了 2 个月重做,业务连续性没断
```

**这场反面教材的根因不是 Prometheus 烂,是没人给 Prometheus 做"容量规划 / 工程治理"**——大家都把它当成"装上就跑"的工具。中型团队撞上 Prometheus 工程问题的临界点很明显:

| 团队规模 | Prometheus 表现 |
| --- | --- |
| < 5 人 / < 30 微服务 | 单实例 4C8G 够,凑合 |
| 5-15 人 / 30-100 微服务 | **必须开始 Recording Rule + Cardinality 监控**,否则一定 OOM |
| 15-30 人 / 100-300 微服务 | 必须分实例 + 长存储(Thanos/VM/Mimir,08 篇) |
| > 30 人 / 300+ 微服务 | 必须有专门的"Observability 平台团队" |

**这一篇主要服务 5-15 人这一档**——你已经"用上"了 Prometheus,但需要把它"用好"。

---

## 二、Pull 模型:为什么 Prometheus 不爱 Push

**这是 Prometheus 设计上最被争论的一件事**——业界大部分老牌监控(StatsD / InfluxDB / Datadog Agent / OpenTSDB)是 Push 模型,**Prometheus 偏要 Pull**。这一节讲清楚:**Pull 不是 Prometheus 的偏执,是它的工程哲学**。

### 2.1 Pull 和 Push 的本质差异

```
Push 模型(StatsD / Datadog / NewRelic):
   App 主动 → 监控服务

   ┌─────┐       ┌─────┐       ┌─────┐
   │ App │ ──►   │ App │ ──►   │ App │ ──►  Monitoring
   └─────┘       └─────┘       └─────┘       Server
        每个 app 每 N 秒主动推一次

   特点:
     ✓ 防火墙友好(只要 app 能出去就行)
     ✓ 短任务、batch job 也能上报
     ✗ 监控服务不知道有谁该上报(没上报 = 失联 or 死亡?)
     ✗ 高峰期多个 app 同时 push 容易雪崩
     ✗ App 端要内置"我该 push 到哪"(配置耦合)


Pull 模型(Prometheus):
   监控服务主动 ← App 暴露

   ┌─────┐       ┌─────┐       ┌─────┐
   │ App │       │ App │       │ App │
   │/metrics    │/metrics    │/metrics
   └──▲──┘       └──▲──┘       └──▲──┘
      └─────────────┼─────────────┘
                    │
              ┌─────┴──────┐
              │ Prometheus │
              │   scrape   │
              └────────────┘
        Prometheus 主动每 15s 来拉一次

   特点:
     ✓ Prom 知道有谁该被采(有 target 列表)
     ✓ Target 失联立刻报"up=0"
     ✓ 速率由 Prom 端控,不会雪崩
     ✓ Target 不需要知道 Prom 在哪(解耦)
     ✗ NAT / 防火墙后的 target 拉不到(用 Push Gateway 中转)
     ✗ 短任务 / batch job 上报需要 Push Gateway
```

### 2.2 为什么 K8s 里 Pull 反而简单

很多人第一反应:**"Pull 不就要 Prom 能访问每个 app 吗?在云上得开一堆防火墙啊"**。

**这个反应在 VM 时代是对的,在 K8s 时代是错的**:

```
K8s 里的 Pod 网络:
  - 每个 Pod 都有一个 ClusterIP,集群内任意 Pod 可达
  - kube-apiserver 提供完整的"哪些 Pod 在哪儿"列表
  - 暴露 /metrics 只需要在 Deployment 里开个端口

K8s + Prometheus 工作流:
  ┌───────────────┐
  │ kube-apiserver│  ── Prom 通过 K8s SD 实时拿到所有 Pod 列表
  └───────────────┘
          │
          ▼
  ┌───────────────┐
  │ Prometheus    │  ── 自动发现新 Pod / 自动剔除被删的 Pod
  │ scrape every  │
  │   15s         │
  └───────┬───────┘
          │
       Pull /metrics
          │
  ┌───────▼───────┐    ┌───────────────┐    ┌───────────────┐
  │ Pod A         │    │ Pod B         │    │ Pod C         │
  │ :8080/metrics │    │ :8080/metrics │    │ :8080/metrics │
  └───────────────┘    └───────────────┘    └───────────────┘
```

**在 K8s 里 Pull 模型的工程优势**:

1. **服务发现免费**——Prom 直接调 K8s API,知道有哪些 Pod
2. **Pod 重启 / scale up/down 自动跟随**——不需要 app 端做任何配置
3. **/metrics endpoint 是约定**——任何 lang 的 library 都默认这个 path
4. **网络是自然通的**——K8s 集群内 Pod 互相可达,不需要额外打洞

**Pull 仍然不擅长的场景**:

```
✗ Cron job / batch task / Lambda
   - 跑完就退出,Prom 来拉的时候已经没了
   - → 用 Push Gateway 中转(看 §2.4)

✗ 客户端是用户设备(浏览器、手机 App)
   - 全球 IP,Prom 拉不到
   - → 用 OTel Push 走中心化 ingest(看 11 篇)

✗ 跨防火墙 / 跨网络
   - VPN 外的 IDC,Prom 进不去
   - → 用 Push Gateway 或 远端 Prom + Federation/Remote Write
```

### 2.3 Push Gateway:给短任务的"信箱"

Push Gateway 是 Prometheus 官方的 Push 适配器——**它是个中介,接受 Push,然后被 Prometheus Pull**:

```
   ┌──────────────┐   push     ┌─────────────────┐    pull   ┌────────────┐
   │ Batch Job    │ ─────────► │ Push Gateway    │ ◄──────── │ Prometheus │
   │ (短任务)     │             │ (持久化最后一次值)│           └────────────┘
   └──────────────┘             └─────────────────┘
```

**用 Push Gateway 的边界**:

```
✓ 该用:
   - Cron job:每天凌晨跑一次的 ETL,跑完 push 结果(成功/失败/处理量)
   - K8s CronJob 同理
   - Spark / Flink batch task

✗ 不该用:
   - 长跑的 service(那直接暴露 /metrics 让 Prom pull)
   - 高频 metric(Push Gateway 不做 aggregation,会被无限堆积)
   - 多实例任务(Push Gateway 不区分 instance,后写覆盖前写 → 数据丢失)
```

**最大的坑**:**Push Gateway 不会自动过期数据**。一个跑了一次的 cron job 推了 `job_success_total = 1`,**这个值会永远留在 Push Gateway 里**,直到你显式 DELETE 或重启 Push Gateway。**结果**:某个 job 三个月前跑过一次,你今天还能在 Prom 上查到那次的指标,**以为 job 还在跑**。

**治理**:**Push Gateway 上的 metric 必须有"自我过期"机制**——或者 job 跑完显式 DELETE,或者周期性清空 Push Gateway。

### 2.4 一句话总结:Pull 是 Prom 的对的选择

```
长期运行服务 → Pull(原生 /metrics)
短任务      → Push Gateway 中转,然后 Pull
跨网络       → 远端独立 Prom + Federation / Remote Write(看 §6 / 08 篇)
```

**绝不需要"我们整个公司都改成 Push 因为防火墙"**——你的工程问题应该靠工程方法解决(打洞、Side Car、网关),不是改监控架构。

---

## 三、服务发现:三种主流模式

**Service Discovery(SD)是 Prometheus 的灵魂**——它通过"动态知道有哪些 target 该被 scrape",让 Prom 在云原生环境下不需要手写 IP 列表。三种主流 SD,各有适用场景:

### 3.1 K8s Service Discovery

```yaml
# prometheus.yml 片段
scrape_configs:
  - job_name: 'k8s-pods'
    kubernetes_sd_configs:
      - role: pod                 # 发现所有 Pod
    relabel_configs:
      # 只采有 annotation prometheus.io/scrape=true 的 Pod
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: true
      # 把 annotation prometheus.io/port 当 scrape port
      - source_labels: [__address__, __meta_kubernetes_pod_annotation_prometheus_io_port]
        action: replace
        regex: ([^:]+)(?::\d+)?;(\d+)
        replacement: $1:$2
        target_label: __address__
      # 注入 namespace / pod_name 作为 label
      - source_labels: [__meta_kubernetes_namespace]
        target_label: namespace
      - source_labels: [__meta_kubernetes_pod_name]
        target_label: pod
```

**工作原理**:Prom 启动后定期调 kube-apiserver(用 in-cluster ServiceAccount),拿到所有 Pod 列表,**用 relabel_configs 过滤出"该采的"**。

**适用**:**任何 K8s 集群内的 Prometheus**。

**踩坑**:

1. **role 选错**——`role: pod` 直接采 Pod,适合"Pod 各自暴露 metric";`role: service` 通过 Service VIP 采,适合"无关具体 Pod 实例"的服务(但 Service VIP 是负载均衡,每次拉到不同 Pod,数据混乱)。**99% 场景用 `role: pod` 或者 `role: endpoints`**
2. **没用 annotation 过滤**——直接采所有 Pod,大量 kube-system Pod 也被采,/metrics 都返回 404,告警刷屏
3. **kubeconfig 权限不够**——Prom 的 ServiceAccount 必须有 `pods/list`、`endpoints/list`、`services/list` 权限,否则 SD 拿不到

### 3.2 Consul Service Discovery

```yaml
scrape_configs:
  - job_name: 'consul-services'
    consul_sd_configs:
      - server: 'consul:8500'
        services: ['order-service', 'payment-service']
    relabel_configs:
      - source_labels: [__meta_consul_service]
        target_label: service
      - source_labels: [__meta_consul_node]
        target_label: node
```

**适用**:**非 K8s 环境**(VM 直接跑、混合云、传统业务系统)+ **已经用 Consul 做服务注册**。

**取舍**:

- **优点**:跨数据中心、支持 health check、生态成熟
- **缺点**:Consul 自己得维护好(集群高可用、ACL、TLS),Consul 挂 = SD 挂

**踩坑**:**Consul SD 默认会刷新得很勤**(几秒一次),**高负载时会把 Consul 压挂**。生产环境调 `refresh_interval: 30s` 是合理的。

### 3.3 File-based Service Discovery

```yaml
scrape_configs:
  - job_name: 'static-vms'
    file_sd_configs:
      - files: ['/etc/prometheus/targets/*.yml']
        refresh_interval: 30s
```

```yaml
# /etc/prometheus/targets/vms.yml
- targets:
    - 10.0.5.1:9100
    - 10.0.5.2:9100
    - 10.0.5.3:9100
  labels:
    env: prod
    region: us-east-1
```

**适用**:**VM 直接跑、target 列表少且稳定**——比如几台数据库 / Redis / 网关。

**File SD 的工程优势**:

1. **简单**——一个 YAML 列出 target,改完 30s 内生效
2. **可由 CI/Terraform/Ansible 生成**——基础设施变更时自动更新文件
3. **零依赖**——不需要 Consul / etcd

**踩坑**:**file_sd 不是"手动维护 IP 列表"**——是给"基础设施自动化工具产出"的接口。**手动维护 = 配置漂移**(IaC 心智篇讲过)。

### 3.4 三种 SD 怎么选

```
K8s 集群内               → Kubernetes SD(没有替代品)
VM / 混合云 / 有 Consul   → Consul SD
VM / 没 Consul / target 少 → File SD + IaC 工具生成
云厂商托管资源(AWS EC2)  → EC2 SD(也内置)
裸 IP 静态列表           → static_configs(最后的选择,< 10 个 target 才用)
```

**经验**:**SD 是"动态发现",static_configs 是"硬编码"——99% 的生产 target 应该用 SD,只有 Prom 自己 + Alertmanager + 关键基础设施用 static_configs**。

---

## 四、Scrape interval:15s vs 30s vs 60s

这是 Prometheus 配置里**最常被乱设的参数**。我直接给一个决策框架。

### 4.1 三个数字背后的算账

```
scrape_interval = 15s 的代价:
  - Prom 每分钟拉 4 次 /metrics
  - 假设每个 target 暴露 1000 series,/metrics 响应 50 KB
  - 100 个 target → 每分钟拉 100 × 4 = 400 次 → 20 MB/min 流量
  - 每个 series 每天产生 86400/15 = 5760 个数据点
  - 1M series → 每天 57 亿数据点 → 压缩后约 30-50 GB

scrape_interval = 30s 的代价:
  - 流量 / 数据点 / 存储 全部 ÷ 2
  - 但延迟检测变慢:从"5min 检测异常"变成"10min 检测异常"

scrape_interval = 60s 的代价:
  - 流量 / 数据点 / 存储 全部 ÷ 4
  - rate() 计算窗口必须 ≥ 4 × 60s = 240s = 4min
  - 短时尖峰彻底看不见
```

### 4.2 怎么选

```
┌──────────────────────────────────────────────────────────────┐
│  Scrape interval 决策矩阵                                       │
├──────────────────────────────────────────────────────────────┤
│  应用业务 metric(请求延迟 / 错误率)        → 15s            │
│  基础设施 metric(CPU / 内存 / 磁盘)         → 15-30s         │
│  慢变化指标(配置项 / 容量上限)             → 60s            │
│  云资源 metric(AWS CloudWatch 拉的)         → 60s 或更长     │
│  Kubernetes node_exporter                  → 15s            │
│  kube-state-metrics                        → 30s            │
└──────────────────────────────────────────────────────────────┘
```

**默认值的来源**:Prometheus 自己默认 1 分钟(60s),但**社区实践基本是 15s**——理由是**告警的最小延迟需求**。一个 5xx 突增,你希望 Prom 在多久内看到?15s scrape = 30s 内必能看见(rate window > 2x scrape)。30s scrape = 1 分钟才能看见。**1 分钟对 P0 已经太久**。

### 4.3 不同 target 不同 interval

```yaml
scrape_configs:
  # 业务关键服务,15s 抓
  - job_name: 'critical-apps'
    scrape_interval: 15s
    kubernetes_sd_configs:
      - role: pod
    # ... label "critical=true" 的过滤

  # 内部工具 / 后台,30s 抓
  - job_name: 'background-apps'
    scrape_interval: 30s
    kubernetes_sd_configs:
      - role: pod
  
  # CloudWatch 拉云资源,60s
  - job_name: 'aws-cloudwatch'
    scrape_interval: 60s
```

**这种"按重要性分层"是中型团队的最优解**——不是所有 metric 都需要 15s,**给 80% 的 metric 一个慢一点的间隔,Prom 容量翻一倍**。

### 4.4 scrape_timeout 必须 < scrape_interval

```yaml
scrape_interval: 15s
scrape_timeout: 10s        # 必须 ≤ interval - 几秒缓冲
```

**为什么**:scrape_timeout 是"单次 scrape 的最长等待时间"。如果一个 target 的 /metrics 接口慢到 20s 才响应,**Prom 会在第 10s 超时**(扔掉这次结果),**下一轮 15s 又来**——**接口本身没改 = 永远拉不到这个 target**。

**如果 timeout > interval**:Prom 还在拉上一次的(没超时),又开始拉下一次的(并发)——target 双倍压力,雪崩起点。

**经验**:**scrape_timeout 设 scrape_interval 的 2/3 左右**。

---

## 五、Recording Rule:不是性能优化,是工程纪律

中型团队的 Prometheus 用着用着会撞上一件事:**dashboard 上的 PromQL 越写越长,Grafana 渲染一个 panel 要 30 秒,告警评估的时候 CPU 飙到 100%**。**Recording Rule 就是治这个的**。

### 5.1 什么是 Recording Rule

**Recording Rule 在 Prometheus 内部周期性地"预计算"一个表达式,把结果存成一个新的 metric**。

```yaml
# rules.yml
groups:
  - name: http_metrics
    interval: 30s
    rules:
      # 把"按 endpoint 的 QPS" 预算成一个新指标
      - record: endpoint:http_requests:rate5m
        expr: |
          sum by (endpoint, service) (
            rate(http_requests_total[5m])
          )

      # P99 预算
      - record: endpoint:http_request_duration_seconds:p99_5m
        expr: |
          histogram_quantile(0.99,
            sum by (le, endpoint, service) (
              rate(http_request_duration_seconds_bucket[5m])
            )
          )

      # 错误率(2xx vs 5xx)
      - record: endpoint:http_errors:ratio_5m
        expr: |
          sum by (endpoint, service) (rate(http_requests_total{status="5xx"}[5m]))
          /
          sum by (endpoint, service) (rate(http_requests_total[5m]))
```

**这三条规则每 30s 跑一次,结果存为新的 metric**——dashboard 和告警直接查这些新 metric,**比每次重新算原始 rate() 快 100 倍**。

### 5.2 命名规范:`level:metric:operations`

**这是 Prometheus 社区的公认约定**——Recording Rule 的命名格式是:

```
<level>:<metric_name>:<operations>

level:     聚合粒度(endpoint / service / cluster / global)
metric:    原始 metric 名(去掉 _total/_bucket 等后缀)
operations: 做了什么聚合(rate5m / p99_5m / ratio_5m)
```

**例子**:

```
✓ instance:node_cpu:rate5m                 ← 每实例 CPU 利用率,5min rate
✓ endpoint:http_requests:rate5m            ← 每 endpoint QPS
✓ service:http_request_duration:p99_5m     ← 每服务 p99
✓ cluster:http_errors:ratio_5m             ← 全集群错误率

✗ http_requests_rate                        ← 没冒号,看不出来是 RR
✗ rate_http_requests_total                  ← 前缀给错位置
✗ requests_5m                                ← 缺 level 和 operations
```

**为什么必须用冒号**:**Prometheus 原始 metric 名永远不会包含冒号**——冒号是 Recording Rule 专属符号,**一眼区分**这是原始 metric 还是预算 metric。

### 5.3 哪些 PromQL 必须预算

```
必须预算的场景:
  1. histogram_quantile() 配合 rate()(p99 / p95 / p50)
     → 客户端打 Histogram,服务端算分位数,计算量大
  
  2. 跨高 cardinality 维度的 sum / avg
     → sum by (cluster) (...) 涉及聚合,慢
  
  3. dashboard 上每秒都在被查的 PromQL
     → Grafana 默认 5s 刷新,查 100 个 panel = 500 次/s
  
  4. 告警里的 PromQL
     → evaluation_interval 每 15s 跑一次,慢查询拖垮告警链路

不需要预算的场景:
  - 单个 raw counter / gauge 直接查(rate 本身不慢)
  - 一次性临时查询(用完丢掉的)
  - cardinality 极低(< 100 series)
```

### 5.4 Recording Rule 的代价

```
预算的代价 = 多存一份新 series

例:
  原始 metric:http_request_duration_seconds_bucket
    cardinality:1000 (endpoint) × 12 (bucket) = 12,000 series
  
  预算 metric:endpoint:http_request_duration_seconds:p99_5m
    cardinality:1000 (endpoint) = 1,000 series
  
  增量:1,000 series,可接受

  但如果你预算了 5 个 quantile + 3 个 window(1m/5m/30m):
    1000 × 5 × 3 = 15,000 series
    几乎跟原始 bucket 一样多了 → 不划算
```

**经验**:**只预算你"经常用 + 算得贵"的 PromQL**——不要把每个分位数 × 每个窗口都预算。

### 5.5 evaluation_interval 和 scrape_interval 的关系

```yaml
global:
  scrape_interval: 15s          # 多久拉一次 target
  evaluation_interval: 15s      # 多久跑一次 Recording Rule 和 Alerting Rule
```

**这两个值通常相等**(都是 15s)。**不相等的隐藏问题**:

```
scrape_interval = 15s, evaluation_interval = 60s 时:
  - Prom 每 15s 抓一次 target
  - Recording Rule 每 60s 跑一次
  - 预算 metric 的精度变成 60s,丢失了 4/5 的中间数据

scrape_interval = 60s, evaluation_interval = 15s 时:
  - Prom 每 60s 抓一次 target
  - Recording Rule 每 15s 跑一次,前 4 次都在算同样的输入数据
  - CPU 浪费 4 倍
```

**经验**:**evaluation_interval ≥ scrape_interval**,且**两个值相等是最优**。

---

## 六、Federation vs Remote Write:多机房 / 长存储

单实例 Prometheus 撑到几百万 series 后,你会面对两个问题:**(1) 跨机房怎么看全局 (2) 长期数据(几个月、几年)怎么存**。Prometheus 给了两个机制:**Federation 和 Remote Write**。两者解决的问题不同,**社区误用率极高**。

### 6.1 Federation:Prom 拉 Prom

```
┌──────────┐        ┌──────────┐        ┌──────────┐
│ Prom A   │        │ Prom B   │        │ Prom C   │
│ (us-east)│        │(us-west) │        │(eu-west) │
└─────┬────┘        └─────┬────┘        └─────┬────┘
      │                   │                   │
      └─────── /federate ─┴───────────────────┘
                          │
                          ▼
                  ┌──────────────┐
                  │ Prom Central │
                  │ "联邦中心"   │
                  └──────────────┘
```

**Federation 的本质**:**中心 Prom 通过 `/federate` 端点,从下游 Prom 拉部分指标**(不是所有指标),用于"跨集群看全局视图"。

**配置**:

```yaml
scrape_configs:
  - job_name: 'federate'
    scrape_interval: 30s
    honor_labels: true
    metrics_path: '/federate'
    params:
      # 注意:只拉聚合后的 metric,不要拉原始 metric
      'match[]':
        - '{__name__=~"job:.*"}'                     # 拉所有以 job: 开头的(Recording Rule 产物)
        - 'up'                                       # target 健康状态
        - '{__name__="http_requests_total"}'         # 极个别原始 metric
    static_configs:
      - targets: ['prom-us-east:9090', 'prom-us-west:9090']
```

**Federation 的边界**:

```
✓ 适合:
  - 跨集群"汇总视图"(全公司 5xx 率、各集群 P99)
  - Recording Rule 产物的二次聚合
  - HA Prom 之间互相拉(主备容灾)

✗ 不适合:
  - 全量数据归档(拉原始 metric 把中心 Prom 打爆)
  - 长期存储(Prom 本地 retention 默认 15 天,Federation 不解决)
  - 大量数据 + 跨机房(拉的时候网络抖动 = 数据丢)
```

**最常见的 Federation 误用**:**`match[]: ['{__name__=~".*"}']`**——直接拉所有 metric。**这是 Federation OOM 的头号原因**。中心 Prom 一次性拉百万 series,自己也炸。**Federation 只拉"已经聚合好的指标"**——这就是 §5 Recording Rule 命名规范的另一个用途:`job:xxx` 前缀正好用于 `match[]` 过滤。

### 6.2 Remote Write:把数据流式推到长存储

```
┌─────────────┐
│ Prometheus  │
│  (local)    │
│  retention  │
│  15-30 天   │
└──────┬──────┘
       │  Remote Write
       │  (streaming, persistent queue)
       ▼
┌─────────────────────────────────────┐
│  长存储后端 (任选)                   │
│  - Thanos                           │
│  - VictoriaMetrics                  │
│  - Cortex / Mimir                   │
│  - InfluxDB                         │
│  - Datadog / NewRelic(SaaS)         │
└─────────────────────────────────────┘
       │
       │  PromQL / Datadog API
       ▼
   Grafana / 长期 dashboard
```

**Remote Write 的工作模式**:**Prometheus 在抓 metric 的同时,把所有 sample 通过 HTTP POST 推给一个远端 endpoint**。远端可以是任何兼容协议的存储。

**配置**:

```yaml
remote_write:
  - url: 'https://thanos-receiver/api/v1/receive'
    queue_config:
      capacity: 10000                  # 内存队列容量
      max_shards: 200                  # 最大并发分片
      max_samples_per_send: 2000       # 每个 batch 最多 sample 数
      batch_send_deadline: 5s          # 等不到 batch 满,5s 也强发
    remote_timeout: 30s
    write_relabel_configs:
      # 可以在这里 drop 不想发出去的 metric
      - source_labels: [__name__]
        regex: 'go_.*'                  # 不发 Go runtime 指标
        action: drop
```

**Remote Write 的边界**:

```
✓ 适合:
  - 长期存储(> 30 天)
  - 跨集群中心化(所有 Prom 推到一个 Thanos)
  - SaaS 接入(Datadog / Grafana Cloud)

✗ 边界:
  - 网络抖动时队列堆积 → 内存暴涨 → Prom OOM
  - 远端不可用时 Prom 也开始堆数据 → 同上
  - 高 QPS 推送 → 远端处理跟不上,反压
```

**Remote Write 的踩坑(队列堆积)**:

```
现象:
  - 远端 Thanos 短暂不可用(30 min)
  - Prom 把样本堆在 in-memory queue
  - queue 满后,Prom 开始拒新 sample
  - 内存爆 → OOM
  - 重启后,本地 30 min 的数据丢

治理:
  1. queue_config.capacity 调到能扛住远端 1 小时不可用
  2. 监控 prometheus_remote_storage_queue_length(发现堆积时告警)
  3. 远端做 HA(Thanos Receiver 多副本 + ingress LB)
  4. 极端场景:开 WAL 持久化 + 设 max_block_duration 短一些
```

### 6.3 Federation vs Remote Write:选哪个

```
┌──────────────────┬─────────────────────┬─────────────────────┐
│ 场景             │ Federation          │ Remote Write        │
├──────────────────┼─────────────────────┼─────────────────────┤
│ 数据流向         │ Pull(中心拉远端)    │ Push(本地推中心)    │
│ 实时性           │ scrape 周期(15-30s) │ 流式(秒级)          │
│ 全量数据         │ 不适合(指标过滤)    │ 适合(默认全发)       │
│ 长期存储         │ ✗                   │ ✓                   │
│ 多集群汇总视图   │ ✓ 经典用法          │ △ 也行,需远端聚合    │
│ 部署复杂度       │ 低(只改 Prom 配置)  │ 中(需要远端服务)     │
│ 失效模式         │ 中心拉不到 → 看不见  │ 队列堆积 → 本地 OOM   │
└──────────────────┴─────────────────────┴─────────────────────┘
```

**我的立场**:

- **2026 年的生产环境,长存储优先用 Remote Write + Thanos/VM/Mimir**(看 08 篇详谈)
- **Federation 留给"跨集群快速看个全局"**的场景,小规模即可
- **不要同时用 Federation 拉全量 + Remote Write 推全量**——双倍流量、双倍内存,且数据延迟不一致

---

## 七、单实例容量上限:几百万 series 就要分家

讲完工具的能力,讲它的边界。Prometheus 是单进程的(不是分布式的),**单实例存在硬性容量上限**。

### 7.1 单实例资源消耗经验值

```
┌──────────────┬────────────┬────────────┬────────────┐
│ Series 数    │ 内存       │ CPU(2x4)   │ 磁盘 / 天   │
├──────────────┼────────────┼────────────┼────────────┤
│ 100K         │ 1-2 GB     │ 10%        │ 2-5 GB     │
│ 500K         │ 4-6 GB     │ 30%        │ 10-20 GB   │
│ 1M           │ 8-12 GB    │ 60%        │ 20-40 GB   │
│ 2M           │ 16-24 GB   │ 100%       │ 40-80 GB   │
│ 5M           │ 40-60 GB   │ 200%(瓶颈)│ 100-200 GB │
│ 10M          │ 紧张 OOM   │ ✗          │ ✗          │
└──────────────┴────────────┴────────────┴────────────┘
```

**这个表是经验值**,具体取决于:

- 你的 metric 的 churn rate(label 值是否经常变)
- 是否开了 Recording Rule
- Retention(默认 15 天)
- 是否 Remote Write(开了内存多一倍)

**经验**:**生产 Prometheus 单实例不应该超过 2-3M series**。超过就拆。

### 7.2 怎么拆

```
拆策略 1:按"环境"拆
  - prom-prod / prom-staging / prom-dev
  - 各 1-2 GB,互不影响

拆策略 2:按"团队 / 业务线"拆
  - prom-business / prom-platform / prom-infra
  - 各自维护各自的告警和 dashboard

拆策略 3:按"region / cluster"拆
  - prom-us-east / prom-us-west
  - 跨集群用 Thanos Query 联邦视图

拆策略 4:按"重要性"拆
  - prom-critical(关键服务,15s scrape)
  - prom-non-critical(其他,60s scrape)
```

**最优组合**:**按 region × 重要性 双维度**——

```
us-east 集群:
  - prom-us-east-critical(业务关键服务,30 万 series)
  - prom-us-east-infra(基础设施,30 万 series)

us-west 集群:
  - prom-us-west-critical
  - prom-us-west-infra

中心(Thanos / VM):
  - 所有 Prom 通过 Remote Write 推过来
  - 全局 PromQL 通过 Thanos Query 一站式查
```

### 7.3 HA Prometheus:双拉的陷阱

**问题**:单 Prometheus = 单点。挂了就没有监控数据。**解决方案**:**两个 Prom,采同样的 target**。

```
                  target
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
   ┌──────────┐           ┌──────────┐
   │ Prom A   │           │ Prom B   │
   │ (active) │           │ (active) │
   └─────┬────┘           └─────┬────┘
         │                      │
         └─────► Thanos / VM ◄──┘
                (去重)
```

**但有两个陷阱**:

```
陷阱 1:Prom A 和 Prom B 的 scrape 时间不同步
   - Prom A 在 t=0 抓到 counter=100
   - Prom B 在 t=2s 抓到 counter=105
   - rate() 计算时,A 看到 +5/15s,B 看到 +0/15s(后面没数据)
   - 同样的查询在 A 和 B 返回不同结果

陷阱 2:Alert 双发
   - 告警条件同时在 A 和 B 触发
   - Alertmanager 收到两条同样的告警
   → 必须配 Alertmanager HA 模式(用 cluster 去重)
   → 或者只让一个 Prom 发告警(用 external_labels 区分)
```

**经验**:**HA Prom 必须配合**:

1. **Thanos / VM 端去重**(用 `__replica__` label 区分)
2. **Alertmanager HA 集群**(用 `--cluster.peer` 去重)
3. **Prom external_labels 标 replica**:

```yaml
global:
  external_labels:
    cluster: 'us-east-prod'
    replica: 'A'           # B 上写 'B'
```

---

## 八、一份最小生产级 prometheus.yml

下面这份是中型团队的生产模板,**贴出来直接照抄能跑**——每一行都有理由。

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  scrape_timeout: 10s
  external_labels:
    cluster: 'us-east-prod'
    replica: 'A'

# 告警规则文件
rule_files:
  - '/etc/prometheus/rules/*.yml'

# Alertmanager 路由
alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']
      # HA Alertmanager 走 cluster
      timeout: 10s

# 抓取配置
scrape_configs:
  # 1. Prom 自身
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  # 2. K8s Pod(应用,通过 annotation 过滤)
  - job_name: 'k8s-pods'
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: true
      - source_labels: [__address__, __meta_kubernetes_pod_annotation_prometheus_io_port]
        action: replace
        regex: ([^:]+)(?::\d+)?;(\d+)
        replacement: $1:$2
        target_label: __address__
      - source_labels: [__meta_kubernetes_namespace]
        target_label: namespace
      - source_labels: [__meta_kubernetes_pod_name]
        target_label: pod
      - source_labels: [__meta_kubernetes_pod_label_app]
        target_label: service

  # 3. K8s 节点(node_exporter)
  - job_name: 'k8s-nodes'
    scrape_interval: 30s
    kubernetes_sd_configs:
      - role: node
    relabel_configs:
      - source_labels: [__address__]
        regex: '(.*):.*'
        replacement: '${1}:9100'
        target_label: __address__

  # 4. kube-state-metrics
  - job_name: 'kube-state-metrics'
    scrape_interval: 30s
    static_configs:
      - targets: ['kube-state-metrics.kube-system.svc:8080']

# Remote Write 到 Thanos / VM(长存储)
remote_write:
  - url: 'http://thanos-receive:19291/api/v1/receive'
    queue_config:
      capacity: 10000
      max_shards: 100
      max_samples_per_send: 2000
      batch_send_deadline: 5s
    remote_timeout: 30s
    write_relabel_configs:
      # 不推 Go runtime 指标(占地大,值不高)
      - source_labels: [__name__]
        regex: 'go_(gc|memstats|threads|info|goroutines)_.*'
        action: drop
```

**关键取舍**:

1. **`scrape_interval: 15s` + `scrape_timeout: 10s`**——业界标准节奏
2. **`external_labels.replica`**——HA 时双 Prom 互相区分
3. **应用用 annotation + relabel**——动态发现,不写死
4. **node_exporter / kube-state-metrics 单独 job + 30s 间隔**——慢变化指标省资源
5. **Remote Write drop Go runtime 指标**——占地大,业务用不到,**这条 drop 能省 30% series**

### 8.2 一段 ServiceMonitor(Prom Operator 风格)

如果你用 Prometheus Operator(K8s 上的事实标准),配置变成 `ServiceMonitor` CRD:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: order-service
  namespace: order
  labels:
    release: prometheus       # 这个 label 让 Prom Operator 自动识别
spec:
  selector:
    matchLabels:
      app: order-service      # 选中 order-service 这个 Service
  namespaceSelector:
    matchNames:
      - order
  endpoints:
    - port: metrics           # Service 上的 named port "metrics"
      interval: 15s
      scrapeTimeout: 10s
      path: /metrics
      # 注入 service label
      relabelings:
        - sourceLabels: [__meta_kubernetes_pod_name]
          targetLabel: pod
```

**ServiceMonitor 的优势**:**每个业务团队管自己的 ServiceMonitor,不用动 Prom 全局配置**——Prom Operator 自动扫所有命名空间的 ServiceMonitor,合并成 Prom 的 scrape_configs。

**坑**:**ServiceMonitor 的 `release` label 必须和 Prom Operator 配置匹配**——否则 ServiceMonitor 写了但 Prom 不认。

---

## 九、踩坑提醒

### 9.1 WAL 损坏 + 数据丢失

```
现象:
  - Prom 重启后 panic("WAL corruption"),拒绝启动
  - 或者重启后,过去 N 小时数据消失

根因:
  - 磁盘满了,WAL 写不下去
  - 进程 SIGKILL(OOM killer)
  - 文件系统出问题

修复:
  - 删 WAL 目录(会丢未持久化的近期数据,约 2 小时)
  - 修复磁盘
  - 重启
  
预防:
  - 磁盘容量告警(> 80% 触发)
  - retention 设短一点(15 天足够给中型团队)
  - Remote Write 长存储(WAL 丢了远端还有)
```

### 9.2 scrape_interval 和 evaluation_interval 不同步

已经在 §5.5 详谈。**两者通常应该相等,且评估间隔 ≥ 抓取间隔**。

### 9.3 HA 双 Prom 没 external_labels

**结果**:两份数据混在一起,rate() 不准,告警双发。**必须每个 Prom 设独立的 external_labels**。

### 9.4 Remote Write 队列堵塞 → OOM

**预防**:`prometheus_remote_storage_queue_length > 80% capacity` 告警,远端故障时立即知道。

### 9.5 用 `match[]: '{__name__=~".*"}` Federation

**这是 Federation 最常见的灾难**——中心 Prom 拉所有 series,自己 OOM。**Federation 只拉 Recording Rule 产物**。

### 9.6 PromQL 写错把 cardinality 拉爆

```promql
# 错的:用 rate() 还带高基数 label
rate(http_requests_total[5m])                # 保留了所有原始 label
sum by (user_id) (rate(...))                 # ← 暴露 user_id 维度

# 对的:聚合时显式 by 低基数维度
sum by (endpoint, status) (rate(http_requests_total[5m]))
```

**PromQL 的 cardinality 是动态的**——你查的时候临时算,如果 by 的维度高基数,**Prom 服务端临时分配巨量内存**,瞬间 OOM。

### 9.7 Service Discovery 权限不足

**K8s SD 需要 ClusterRole**:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: prometheus
rules:
  - apiGroups: [""]
    resources: ["nodes", "services", "endpoints", "pods"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["networking.k8s.io"]
    resources: ["ingresses"]
    verbs: ["get", "list", "watch"]
```

**没这个 ClusterRole,SD 直接拿不到 target,所有 job 显示 up=0**。

### 9.8 没监控 Prom 自己

**最讽刺的事故**:**Prom OOM,但没有告警**——因为没有人监控 Prom 自己。

**必须监控**:

```yaml
# 关键指标
- prometheus_tsdb_head_series           # series 数(超 80% 警告)
- prometheus_tsdb_head_samples_appended_total  # ingest 速率
- prometheus_remote_storage_queue_length        # Remote Write 队列
- prometheus_wal_corruptions_total              # WAL 损坏
- process_resident_memory_bytes                  # Prom 内存
- prometheus_target_scrape_pool_targets         # 当前 target 数
```

**用第二个 Prom 监控第一个 Prom**——或者推到 Thanos / VM 上由它来报。

---

## 十、何时不该用 Prometheus

不是所有场景都该用 Prom。**这一节是给"我们要不要上 Prom"决策做参考**。

### 10.1 不该用 Prom 的场景

```
1. 长期数据(> 6 个月)
   - Prom 本地存储设计是 15-30 天
   - → 用 Thanos / VM / Cortex(看 08 篇)

2. 高基数(IoT 几百万设备、SaaS 几千租户)
   - Prom series 上限是几百万
   - → 用 VictoriaMetrics(更扛 cardinality)
   - → 或 ClickHouse 做 metric 存储

3. 业务事件流(订单流水、用户行为)
   - 这是事件,不是 metric
   - → Kafka + ClickHouse / Druid
   - → Prom 不适合"明细查询"

4. 极端实时(亚秒级响应)
   - Prom scrape 最小 5s
   - → StatsD + Graphite(更低延迟)

5. 单机内部工具
   - 装一套 Prom + Alertmanager + Grafana 太重
   - → 写日志 + 简单脚本就够
```

### 10.2 用 Prom + 别的工具组合的场景

```
中型团队推荐栈:
  - Prometheus(短期 + 抓取)
    → Remote Write 到 Thanos / VictoriaMetrics(长期 + 高基数)
  - Loki / ELK(日志)
  - OTel + Tempo(链路)
  - Grafana(统一可视化)
  - Alertmanager(告警路由)
  
不要:
  - 单 Prometheus 扛所有(超不过 1 年就崩)
  - 不用 Alertmanager,直接 Prom 发邮件(没去重、没分组、没静音)
  - Prom 和应用部署在一起(应用挂 Prom 也挂)
```

---

## 十一、踩坑提醒清单

1. **scrape_interval 拍 15s 都不查存储**——series 多了存储吃不消,慢变化指标 30-60s 就够
2. **scrape_timeout > scrape_interval**——target 雪崩起点
3. **K8s SD 没用 annotation 过滤**——所有 Pod 都被抓,/metrics 404 刷屏
4. **role: service 拉负载均衡的 VIP**——数据混乱,99% 用 role: pod
5. **Federation 拉全量 series**——中心 Prom 秒级 OOM
6. **Remote Write 没监控队列长度**——远端挂了 30 分钟自己也 OOM
7. **HA Prom 没 external_labels**——两份数据混在一起,告警双发
8. **没监控 Prom 自己**——Prom OOM 时你才发现没监控
9. **WAL 损坏后没备份**——丢几小时数据,Remote Write 长存储是兜底
10. **Recording Rule 命名不规范**——`endpoint:http_requests:rate5m` 这种结构必须强制
11. **evaluation_interval > scrape_interval**——精度损失
12. **单 Prom 撑 5M series**——不分家就是 OOM 倒计时
13. **应用和 Prom 部署在同一节点**——应用挂 Prom 也挂,看不见
14. **Prom Operator 不用 ServiceMonitor 用全局 scrape_configs**——团队改不动,管理成本爆炸

---

## 十二、本篇的硬指标

看完这一篇,你应该能在白板前讲清楚:

- **Pull 和 Push 的本质差别,以及为什么 K8s 里 Pull 反而简单**
- **三种 Service Discovery 的适用场景和踩坑**
- **scrape_interval 的取舍依据**(精度 vs 存储 vs target 压力 的三角)
- **Recording Rule 的命名规范**(`level:metric:operations`)和它的真正作用(工程纪律,不是性能)
- **Federation 和 Remote Write 的边界**(各自适合什么、不适合什么)
- **单 Prom 容量上限**(几百万 series → 分家或上长存储)
- **HA Prom 必须配的三件套**(external_labels / 端去重 / Alertmanager HA)

并且能给团队**写出一份生产 prometheus.yml** + **一份 ServiceMonitor 模板**——上面 §8 就是底稿。

---

下一篇:`07-PromQL实战.md`——前两篇讲了"怎么打 metric"、"怎么抓 metric",最后这一篇讲"**怎么用 metric**"。**90% 的工程师 PromQL 写错过**——`rate / irate / increase` 三个函数差别在哪、为什么不能用 increase 算 QPS、`histogram_quantile` 正确的写法和错误的写法到底差在哪一行(`le` 必须 by 进 rate)、`offset / @ modifier / subquery` 实战、counter reset 和 stale 是怎么把你的告警搞失准的——讲完这一篇,你应该能在 dashboard 上一眼看出"这个 PromQL 写错了"。**PromQL 是 Prometheus 这一层最容易写对、也最容易写错的东西**。
