# Metrics 心智:Counter / Gauge / Histogram / 为什么不要直接存 avg

第二层「可观测性三件套」开篇必须先把 Metrics 这件事的心智摆正——**90% 的事故先在 Metrics 这一层被发现,但 90% 的团队的 Metrics 是错的**。错不在工具,错在心智:把所有数都当成"一个数",存平均值代替分布,label 上一个 `user_id` 把存储打爆,`http_request_duration` 不带 `_seconds` 后缀,Histogram bucket 边界拍脑袋一拍,Summary 拿来跨实例算 p99——**这些错误在工具教程里都不会教,因为工具不管你怎么打错指标,它只管把你打错的指标存下来**。

backendLearning/33 浅讲过 Prometheus 怎么起步、四种指标长什么样,**那一篇是"看一眼能跑"**。这一篇只讲心智——**四种 metric 类型的语义边界在哪、为什么 avg 是最大谎言、Histogram bucket 怎么设才不会"看起来有 p99 实际是骗人的"、Summary 为什么在分布式系统里基本没用、cardinality 是怎么炸的、指标命名为什么必须带单位**。看完你应该能在 code review 时一眼看出来「这条 metric 是错的」,而不是只会喊「我们要监控这个」。

> 一句话先记住:**Metrics 不是"打几个数字",是"打能被聚合的数字"**——可观测性的代价从你按下 `Counter.inc()` 那一刻就开始计了。**一个错的 metric 不仅没用,而且有毒**——它会让告警在该响的时候不响、不该响的时候响个不停,让 dashboard 在 P0 凌晨给你看一条平平的曲线告诉你"一切正常",**而真实情况是 1% 的用户已经在客服群里骂街了**。Metrics 心智的核心就一句:**永远不要存"平均",永远不要把高基数维度放 label,永远在指标名里写明单位**。这一篇就是把这三件事拆开讲。

---

## 一、问题场景:为什么"看起来在监控"等于没监控

我直接讲一个真实事故。

某中型电商团队,Grafana 上挂了一块大屏:订单服务的 `http_request_duration_avg` 是一条 80ms 左右的曲线,过去 30 天平稳得像心电图直线。**所有人都觉得"订单服务稳得一批"**。

```
某天凌晨,客服群炸了:
  - "下单转圈半分钟"
  - "支付完订单消失了"
  - "我点了 5 次,扣了 5 次钱"

研发拉日志:
  - 5xx 率 0.3%(看起来低)
  - QPS 正常
  - P99 dashboard 上没人画
  - 那条 avg 80ms 的曲线?还是 80ms,一动没动

排查 3 小时后定位:
  某下游 RPC 偶发超时 12 秒,影响 0.5% 的请求
  其他 99.5% 的请求正常 50ms
  → avg = 0.995 × 50 + 0.005 × 12000 ≈ 110ms
  比正常 80ms 高了 30ms,几乎肉眼不可见
  但 0.5% 的用户体验是"30 秒看不到响应,以为系统挂了"
```

**这场事故的根因不是技术,是 metric 心智**——团队监控了"平均延迟",**但平均延迟这个指标本身就是错的**。如果他们打的是 Histogram + 在 dashboard 上画 p99,**P99 会从 200ms 直接跳到 12000ms,一目了然**。

这就是这一篇要讲清楚的核心:**Metrics 选错了,工具再厉害也没用**。中型团队(10 人 / 100 微服务 / 5000 QPS)撞上 metric 心智问题的临界点是:

| 团队规模 | Metrics 表现 |
| --- | --- |
| < 5 人 / 10 微服务 | 全员 SRE,谁打谁看,**问题被掩盖** |
| 5-15 人 / 50-100 微服务 | **必撞 cardinality 爆炸 + avg 误导**,Prometheus OOM 是常态 |
| 15-50 人 / 100+ 微服务 | 必须有 metric 规范,否则一年烧掉 50 万存储费 |
| > 50 人 | 必须做指标治理平台,有人专门看"哪些指标可以删了" |

**这一篇主要服务 5-15 人这一档**——刚撞上"我们以为有监控,但监控全是错的"这个坎。

---

## 二、四种 Metric 类型:语义边界和典型陷阱

Prometheus(以及 OpenMetrics 标准)只有四种 metric 类型:**Counter / Gauge / Histogram / Summary**。**90% 的工程师对这四种的理解停留在"我知道有这四种",但说不出来什么时候选哪种**。下面挨个拆。

### 2.1 Counter:只能涨,不能跌

```
Counter 的定义:
   一个单调递增的累计计数器
   重启时归零(下文讲怎么处理)
   只支持 .inc() / .add(正数)

典型用途:
   http_requests_total              请求数
   http_errors_total                错误数
   bytes_sent_total                 发送字节数
   kafka_messages_consumed_total    Kafka 消费数

错误用途:
   ✗ "当前在线用户数"               (这个会跌,该用 Gauge)
   ✗ "队列长度"                     (同上)
   ✗ "CPU 使用率"                   (同上)
```

**Counter 的关键特性是"单调递增"**——你看到一条曲线是 `1000 → 1050 → 1100 → 1200`,你**才能用它算出来速率**(每分钟涨了多少)。如果曲线跳上跳下,Prometheus 那些 rate 函数全要崩。

**Counter 的陷阱 1:进程重启**

```
进程重启前:counter = 99,999,999
进程重启后:counter = 0

Prometheus 看到的曲线:
   ... 99,999,996 → 99,999,997 → 99,999,998 → 0 → 1 → 2 ...
   
错的 rate 计算:把 -99,999,998 当成"涨了负 99M",显然不对
对的 rate 计算:Prometheus 自动检测 counter reset,认为"刚好涨完那一段就重启了"
```

**Prometheus 内部对 counter reset 有专门处理**——`rate()` 函数看到曲线下跌就当作"重启了"自动补偿。**但这个补偿有上限**——如果一个 scrape 间隔内重启了好几次,Prometheus 看不见中间的累积,**这部分数据就丢了**。所以**Counter 必须用在"重启不频繁"的场景**;比如重启一秒一次的临时任务,用 Counter 是灾难。

**Counter 的陷阱 2:命名必须带 `_total`**

```
http_requests             ← 错(看不出来是 counter 还是 gauge)
http_requests_total       ← 对(_total 是 Prometheus 的"Counter 后缀"约定)
```

Prometheus 文档强制规定 Counter 必须以 `_total` 结尾,**虽然你不加也能跑**,但加了之后 PromQL 函数(尤其是新的 `rate(http_requests_total[5m])` 这种)更容易识别,且 OpenMetrics 标准会拒绝不带 `_total` 的 counter。

### 2.2 Gauge:能涨能跌,瞬时值

```
Gauge 的定义:
   一个可以涨可以跌的数值,代表"当前的瞬时状态"
   支持 .set() / .inc() / .dec() / .add()

典型用途:
   queue_length             当前队列长度
   active_connections       当前活跃连接数
   memory_usage_bytes       当前内存占用
   temperature_celsius      当前温度
   cpu_usage_ratio          当前 CPU 使用率

错误用途:
   ✗ "今天的总请求数"        (累计的用 Counter)
   ✗ "今天的总错误数"        (同上)
```

**Gauge 是最直白的 metric 类型**——你打多少它就是多少,不做任何聚合或累计。**但 Gauge 的陷阱是"瞬时性"**:

```
Scrape 间隔 15s,你的 Gauge 在中间变化:
  t=0s   queue_length = 100
  t=5s   queue_length = 9999  (一次大流量峰值)
  t=10s  queue_length = 110
  t=15s  Prometheus 抓 → 看到 110

  → 9999 这个峰值,Prometheus 永远看不到
  → Dashboard 上是一条平稳的 100-110 曲线
  → "其实出过事"
```

**怎么治**:**对会暴涨暴跌的 Gauge,在被采集端自己做"最大值滚动窗口"**,或者**用 Histogram 替代**(Histogram 不会丢峰值,见下)。**Gauge 最适合"变化缓慢"的状态**——CPU、内存、连接数。**对突发尖峰敏感的场景,Gauge 是错的工具**。

### 2.3 Histogram:延迟分布的正确姿势

```
Histogram 的定义:
   把每次观测值落到"预定义的桶(bucket)"里,
   每个桶是一个 Counter(累计有多少次观测值 ≤ 桶上界)
   外加一个 _sum(所有观测值之和)和 _count(总观测数)

典型用途:
   http_request_duration_seconds_bucket    请求延迟分布
   rpc_response_size_bytes_bucket          响应体大小分布
   db_query_duration_seconds_bucket        DB 查询延迟分布

绝对适用:
   任何"需要算分位数(p50 / p95 / p99)"的场景
```

**Histogram 的内部结构**——理解这个图,你就理解了 Histogram:

```
假设 buckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, +Inf]

每次有请求,记录其延迟(秒),落入所有"≤ 上界"的桶都 +1:

  延迟 = 0.012s 的请求:
                 ┌──────────────────────────────────────────┐
   le=0.005  ──→ │                                          │   (0)
   le=0.01   ──→ │                                          │   (0)
   le=0.025  ──→ │ ██                                       │  +1
   le=0.05   ──→ │ ██                                       │  +1
   le=0.1    ──→ │ ██                                       │  +1
   le=0.25   ──→ │ ██                                       │  +1
   le=0.5    ──→ │ ██                                       │  +1
   le=1      ──→ │ ██                                       │  +1
   le=2.5    ──→ │ ██                                       │  +1
   le=5      ──→ │ ██                                       │  +1
   le=10     ──→ │ ██                                       │  +1
   le=+Inf   ──→ │ ██                                       │  +1
                 └──────────────────────────────────────────┘
                
   每个 bucket 是个 Counter,记录"≤ 该上界的累计观测数"
   注意是"累计"——不是"恰好落入"
```

**这个"累计而非互斥"的设计是 Histogram 算 quantile 的关键**——只要桶足够密,Prometheus 就能反推出"p99 大约在哪个桶里",然后用线性插值估算具体值(`histogram_quantile()` 函数)。

**Bucket 边界怎么设——分两种**:

```
延迟类(秒)——用指数桶,因为延迟跨多个数量级:
   buckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
   覆盖 5ms 到 10s,公比约 2.5x(每两步翻 ~6 倍)
   ↑ Prometheus client 库的默认 DefBuckets 就是这个
   ↑ 适合 HTTP API / RPC / 数据库查询

大小类(字节)——用线性桶,因为大小通常分布集中:
   buckets = [100, 1000, 10000, 100000, 1000000]    (10x 步长)
   或      = [1024, 4096, 16384, 65536, 262144, 1048576]   (2x 步长)
   ↑ 适合响应体大小 / 文件大小

业务类——按业务实际值定:
   订单金额:[10, 50, 100, 500, 1000, 5000, 10000]  ¥
   连接耗时:[0.001, 0.005, 0.01, 0.05, 0.1, 0.5]   s
```

**Bucket 设计的核心原则**:

```
1. 桶数量控制在 8-12 个
   太少 ──> 分位数不准(p99 可能落在两个桶之间,插值误差大)
   太多 ──> 每个 series 多出 N 倍存储(label 维度 × 桶数量)

2. 桶必须覆盖 SLO 边界
   你的 SLO 是 p99 < 300ms ──> buckets 里必须有 ~0.3 这个点
   没有这个桶,你永远算不准"p99 是不是踩了 SLO 红线"

3. 桶必须延伸到"远超期望"的值
   不要 buckets 最大值 = 1s
   ──> 出现 10s 慢请求时全落入 +Inf 桶,你看不见
```

**默认 buckets 有问题**:

```python
# Python prometheus_client 的默认 buckets
DEFAULT_BUCKETS = (0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5,
                   0.75, 1.0, 2.5, 5.0, 7.5, 10.0, +Inf)
```

这个默认覆盖 5ms ~ 10s,**对 HTTP API 够用**——但**对 K8s 内部 RPC(亚毫秒级)和 ML 推理(几十秒)都不够**。**永远显式定义 buckets,不要用默认**。

### 2.4 Summary:看起来像 Histogram 但有致命缺陷

```
Summary 的定义:
   在客户端预先计算好分位数(quantile),直接打出 quantile 值
   _sum 和 _count 同 Histogram

典型用途:
   http_request_duration_seconds{quantile="0.5"}   p50
   http_request_duration_seconds{quantile="0.9"}   p90
   http_request_duration_seconds{quantile="0.99"}  p99

致命缺陷:
   ✗ 不能跨实例聚合
   ✗ 不能改 quantile(客户端写死)
   ✗ 客户端开销大
```

**Summary 和 Histogram 看起来好像差不多**——都是为了"看延迟分布",甚至有些库的 API 设计还很像。**但它们解决的是完全不同的问题**:

```
Histogram:
  客户端打桶,聚合在 Prometheus 服务端
  → 跨 N 个实例的 p99?
     server-side: sum(rate(bucket[5m])) by (le)
              → histogram_quantile(0.99, ...) 
     一行 PromQL 搞定
  → 改 quantile?dashboard 上点一下,改成 0.95 / 0.999 都行

Summary:
  客户端预算 p50/p90/p99,只送结果
  → 跨 N 个实例的 p99?
     ✗ 不能直接平均(平均 p99 不等于聚合后的 p99)
     ✗ 必须客户端先聚合(分布式系统不可能)
     → 实际只能用 max(quantile="0.99")    ← 错的近似
  → 改 quantile?改代码、重新发布、等 24 小时数据
```

**用一张表对比**:

| 维度 | Histogram | Summary |
| --- | --- | --- |
| 客户端开销 | 低(只是几个 Counter++) | 高(维持 sliding window + 流式分位数算法) |
| 服务端开销 | 中(N 个 bucket × N 个 series) | 低(直接是值) |
| 跨实例聚合 | **支持** | **不支持(致命)** |
| 分位数动态调整 | **支持(PromQL 时改)** | **不支持(代码时写死)** |
| 精度 | 看 bucket 设计 | 高(客户端流式精算) |
| 现代 Prometheus 推荐 | **是** | 否(只在单实例场景用) |

**我的立场**:**在 2026 年的分布式系统里,Summary 几乎没有合理用途**。所有"打 quantile metric"的场景都该用 Histogram。**唯一例外**:单实例服务 + 你需要 client-side 高精度分位数(比如 SDK 内部的 p99),且**绝对不会跨实例聚合**——这种场景 Summary 才有意义。

> 一个真实事故:某团队 100 个 Pod,每个 Pod 打 Summary 的 p99,Grafana 上画 `max(http_request_duration_seconds{quantile="0.99"})`——以为这是"全局 p99"。**这是 100 个 Pod 各自 p99 的最大值,不是全局 p99**。两者数值上可能相差 2-5 倍。出了事故才发现 dashboard 上的 p99 跟用户真实体验对不上。**迁到 Histogram 后才解决**。

### 2.5 四种 metric 选型决策树

```
你要打这条 metric ──→ 这个值会跌吗?
                        │
                ┌───否──┘ 不会跌
                │                          会跌
                │                            │
                ▼                            ▼
        是累计计数器吗?               这是个瞬时状态吗?
        (请求数 / 错误数)                (CPU / 内存 / 队列)
                │                            │
                ▼                            ▼
            Counter                       Gauge
                                             
你要打的是"分布"吗?(延迟、大小)
        │
        ▼
   要跨实例聚合 / 灵活改分位数吗?
        │
        ├──是──→ Histogram   ← 99% 的场景
        └──否──→ Summary     ← 仅单实例场景
```

---

## 三、为什么 avg 是最大的谎言

上面 §1 那个真实事故的根因。这一节单独拎出来讲——**这是中型团队 Metrics 心智里最常见的错误,没有之一**。

### 3.1 平均值的数学陷阱

```
情景:某 API 1000 次请求
  990 次:50ms
  10 次:5000ms(下游超时,影响 1% 用户)

  平均延迟 = (990 × 50 + 10 × 5000) / 1000 = 99.5ms
  P50 延迟 = 50ms
  P99 延迟 = 5000ms
  P99.9 延迟 = 5000ms

  → avg 看起来只是"略微比正常高一点"(99.5 vs 50)
  → P99 直接暴露问题(5000ms 触发任何理性的告警)
```

**平均值会被大基数稀释**——99% 的快请求把 1% 的慢请求的影响"摊薄"成几乎不可见。但**对用户而言,1% 的慢请求就是 1% 的用户骂街**。

### 3.2 平均掩盖的不只是"长尾",还有"双峰"

```
情景:某 API 实际是两个集群在跑
  Cluster A(500 次):20ms     (新代码,快)
  Cluster B(500 次):200ms    (老代码,慢,逐步下线中)

  平均延迟 = (500 × 20 + 500 × 200) / 1000 = 110ms

  → avg 看起来是 110ms,一切平常
  → 实际分布是双峰:一半 20ms 一半 200ms
  → "平均用户体验 110ms"这句话是假的——没有任何一个用户体验是 110ms
```

**这种"双峰分布"在金丝雀发布、A/B 测试、多版本灰度时非常常见**——`avg` 把它们抹平,你看不出来"哪些用户在快、哪些用户在慢"。**P50 / P95 / P99 才能暴露真实分布**。

### 3.3 PromQL 写法:用 Histogram 不用 avg

**错的写法**:

```promql
# 错 1:存了 avg(直接打了一个 Gauge)
http_request_duration_seconds_avg

# 错 2:用 _sum / _count 算 avg
rate(http_request_duration_seconds_sum[5m]) 
  / rate(http_request_duration_seconds_count[5m])
# ↑ 这条 PromQL 你 dashboard 上肯定见过,数学上等于 avg
#   但能算只是"恰好"——本质上是错的,因为 avg 本身就是错的指标
```

**对的写法**:

```promql
# P99(整个服务的)
histogram_quantile(0.99, 
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le)
)

# P99(按 endpoint 拆)
histogram_quantile(0.99,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le, endpoint)
)

# P50 / P99 一起画(dashboard 上对照)
histogram_quantile(0.50, sum(rate(..._bucket[5m])) by (le))
histogram_quantile(0.95, sum(rate(..._bucket[5m])) by (le))
histogram_quantile(0.99, sum(rate(..._bucket[5m])) by (le))
```

**`histogram_quantile` 函数的语义**(下一篇 PromQL 实战会专讲):**把"bucket 累计计数"反推回"分位数"**。**注意 `le` 必须 `by` 进去**——这是 PromQL 最常见的错误之一,下一篇会专讲。

### 3.4 什么时候可以用 avg

不是说 avg 永远不能用——**有些指标的语义本身就是"平均",并不存在长尾问题**:

```
合理的 avg 用法:
  ✓ CPU 使用率 = sum(CPU time) / wall time          (本来就是"平均")
  ✓ 当前连接数 = avg(active_connections) over time   (短窗口内取均值,平滑曲线)
  ✓ QPS = rate(requests_total[5m])                   (本来就是"每秒平均")

不该用 avg 的:
  ✗ 延迟、响应大小、文件大小、队列等待时间
     ──> 所有"分布相关"的指标必用 Histogram
```

**判定标准**:**这个 metric 的尾部值会不会比 avg 大 10 倍以上**?会就用 Histogram,不会才能用 avg。

---

## 四、Cardinality 陷阱:label 不是免费的

**这是 Metrics 心智里和"avg 是骗人的"并列的两大经典陷阱**。我直接讲事故。

### 4.1 一个 Prometheus OOM 的真实故事

```
某团队某天 Prometheus 突然 OOM,重启后又 OOM,循环。

排查:
  最近一次发布,有个工程师在 http_request_duration_seconds 上加了 label:
    {method, path, status, user_id}     ← 加了 user_id !
  
  之前的 series 数(基数):
    method(5) × path(100) × status(5) ≈ 2,500 series
  
  加了 user_id 后:
    2,500 × user_id(500,000 活跃用户) ≈ 12.5 亿 series
  
  Prometheus 内存爆炸,WAL 写不动,OOM killer 触发
```

**这就是 cardinality 爆炸**。Prometheus(以及几乎所有 TSDB)的存储模型是:**每一个独立的 label 组合 = 一条 time series**。**series 数和内存基本是线性关系**——一个 series 几十 KB 到几百 KB,千万级 series = 几十 GB 内存。

### 4.2 哪些 label 是"高基数毒瘤"

```
绝对禁止的 label:
  ✗ user_id          (10K - 10M)
  ✗ session_id       (短期内 10M+)
  ✗ request_id       (每个请求一个,无限大)
  ✗ trace_id         (同上)
  ✗ email / phone    (用户级)
  ✗ timestamp        (这都能见到,无语)
  ✗ raw URL          (path 带了 ?id=12345)
  ✗ error_message    (异常字符串,可能上千种变体)

不太离谱但要警惕:
  △ path             (要先做 normalize:/users/123 → /users/:id)
  △ user_agent       (千种浏览器版本)
  △ region           (几十到几百)
  △ instance         (Pod 名,K8s 自动重建会变)

安全的 label:
  ✓ method           (GET/POST/PUT/DELETE,< 10)
  ✓ status_code      (5 大类:2xx/3xx/4xx/5xx,具体 < 50)
  ✓ endpoint         (normalize 后,< 200)
  ✓ service          (< 100)
  ✓ env              (dev/staging/prod,< 5)
```

**判定标准**:**这个 label 的可能取值数(cardinality)是固定的、可数的、< 100 的**——就安全;**它的取值数会随用户 / 请求 / 时间无限增长**——就是毒瘤。

### 4.3 估算 cardinality 的算式

```
一条 metric 的 series 数 = ∏ (每个 label 的 cardinality)

举例:
  http_requests_total{
    method,         # 5
    path,           # 100(normalize 后)
    status_code,    # 50
    env,            # 3
    service,        # 1(这个 metric 是 order service 的)
  }
  
  → series 数 = 5 × 100 × 50 × 3 × 1 = 75,000

Prometheus 安全上限(单实例):
  
   1-2M series         ← 内存 4-8 GB,正常运行
  2-5M series          ← 内存 16-32 GB,需要调参
  5-10M series         ← 内存 64 GB+,接近上限
  > 10M series         ← 必须分片(联邦 / Thanos / VictoriaMetrics,看 08 篇)
```

**计算时不只算一个 metric,要算所有 metric 加起来**——一个 Prometheus 实例采 100 个 microservice,每个 service 暴露 50 个 metric,平均每个 metric 5K series → 总共 25M series → **必爆**。

### 4.4 治理 cardinality 的工程动作

```
1. 把"高基数维度"挪去日志 / Trace
   ✗ 不要:http_requests_total{user_id="42"}
   ✓ 要:  log.info("user_id=42 request=...")     (Loki / ELK)
   ✓ 要:  span.set_attribute("user_id", "42")     (OTel)

2. Path normalize
   ✗ 不要:path = "/users/12345/orders/67890"
   ✓ 要:  path = "/users/:id/orders/:id"
         (在 web framework 层做 path templating)

3. Label drop / replace 在 Prometheus 端做兜底
   relabel_configs:
     - source_labels: [__name__]
       regex: '.*'
       action: labeldrop
       regex: 'user_id|request_id|trace_id'

4. 用 PromQL 自己探测:
   topk(20, count by (__name__)({__name__=~".+"}))
   # 找出 series 数最多的 20 个 metric
   topk(20, count by (job, instance)({__name__=~".+"}))
   # 找出 series 数最多的 job + instance 组合

5. Prometheus 内建 admin API:
   curl http://prom:9090/api/v1/status/tsdb
   # 列出 cardinality 最高的 label 和 metric name
```

**第 4 条要每周跑一次**——cardinality 是会**悄悄涨**的,某天一个工程师不小心加了高基数 label,你不主动查就是 Prometheus OOM 告诉你。

### 4.5 一个反面教材

某团队曾经在 `nginx_requests_total` 上加 label `{client_ip="10.0.5.123"}`——**因为他们觉得"按 IP 看请求很方便"**。后果:

```
内网 IP 池:10万 + (容器漫游)
外网 client IP:无限大(用户 IP)

实际 series 数:几百万 → 千万级
Prometheus 内存:从 4 GB → 32 GB → OOM

修复:把 client_ip 移到 access log(用 Loki 索引)
Prometheus series 降到 10 万级
```

**口诀**:**只要你想问"哪一个 user / IP / 请求 ID 出了问题",答案永远是 log / trace,不是 metric**。Metric 的本质是"聚合后能看的数",不是"每一条记录"。

---

## 五、指标命名:单位、后缀、约定

中型团队最容易忽视的工程纪律之一,就是**指标命名规范**。命名乱了之后:**两个工程师独立打了同一件事的两条 metric,名字不同,dashboard 上有人画 A 有人画 B,告警阈值各设各的——同一件事被监控了两次,还都是错的**。

### 5.1 Prometheus 官方命名约定

```
基本格式:
   <namespace>_<subsystem>_<name>_<unit>[_total]
   
   namespace:  服务名 / 大类  (如 http / db / queue)
   subsystem:  子模块         (如 client / server / pool)
   name:       具体指标       (如 requests / errors / size)
   unit:       单位(强制)    (如 seconds / bytes / ratio)
   _total:     仅 Counter 加

示例:
   ✓ http_requests_total
   ✓ http_request_duration_seconds
   ✓ db_connections_pool_size
   ✓ memory_usage_bytes
   ✓ cpu_usage_ratio
   ✓ kafka_consumer_lag_messages

反例:
   ✗ http_requests           (没 _total,看不出是 counter)
   ✗ http_latency            (没单位,毫秒还是秒?)
   ✗ httpReqTime             (驼峰命名不符合 Prom 风格)
   ✗ requests_per_second     (per_second 是 derived metric,不该存)
```

### 5.2 单位的硬约定

```
时间   ──→ _seconds      (而非 _ms / _us / _nanos)
字节   ──→ _bytes        (而非 _kb / _mb)
比例   ──→ _ratio        (0-1,而非 _percentage 0-100)
温度   ──→ _celsius      (而非 _fahrenheit)
计数   ──→ _total / _count
```

**为什么强制 SI 单位**:**PromQL 在算 `rate / aggregation / 跨指标四则运算` 时,假定单位一致**。如果你同一个 dashboard 上一条曲线是 ms 一条是 s,某天加了一行 `metric_a + metric_b`——单位错位,结果差 1000 倍,你看不出来。

**毫秒陷阱**:**新人最容易在客户端打 `request_duration_ms = 50.0`(数字 50)**——以为这样画图直观。**但 Prometheus 的 RPM(其他指标的)单位都是秒,你这一条单位是毫秒,放一起算就错位**。**永远在客户端打秒数**(`request_duration_seconds = 0.050`),dashboard 上要显示毫秒,在 Grafana 那一层做单位换算就行。

### 5.3 一份团队级命名规范

```markdown
## 团队 Metric 命名规范 v1.0

### Counter
格式:<service>_<subject>_<verb>_total
   ✓ order_payments_processed_total
   ✓ user_sessions_created_total

### Gauge
格式:<service>_<subject>_<state>_<unit>
   ✓ order_queue_pending_count
   ✓ db_connections_active_count
   ✓ memory_heap_used_bytes

### Histogram(必带 _bucket / _sum / _count)
格式:<service>_<subject>_<measurement>_<unit>
   ✓ order_api_request_duration_seconds
   ✓ kafka_message_size_bytes

### Label
- 必须:env, service, instance(自动注入)
- 业务:method, status_code, endpoint(normalize 后)
- 禁止:user_id, request_id, trace_id, ip, email
```

**这份规范贴在 wiki 上,新人入职第一周必读,code review 工具卡命名**——**否则一年后你的 Prometheus 里有 100 种"等价但名字不同"的延迟指标**。

---

## 六、最小化暴露代码:Go / Java / Python

讲完心智,看具体怎么打。下面三段代码是**生产代码 80% 长这样**——简短,但每一行都有原因。

### 6.1 Go(prometheus/client_golang)

```go
package main

import (
    "net/http"
    "time"
    "github.com/prometheus/client_golang/prometheus"
    "github.com/prometheus/client_golang/prometheus/promhttp"
)

var (
    // Counter:统计请求总数,按 method / status / endpoint 拆维度
    httpRequestsTotal = prometheus.NewCounterVec(
        prometheus.CounterOpts{
            Name: "http_requests_total",
            Help: "Total number of HTTP requests.",
        },
        []string{"method", "endpoint", "status"},
    )

    // Histogram:统计请求延迟,显式定义 buckets
    httpRequestDuration = prometheus.NewHistogramVec(
        prometheus.HistogramOpts{
            Name:    "http_request_duration_seconds",
            Help:    "HTTP request duration in seconds.",
            Buckets: []float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10},
        },
        []string{"method", "endpoint"},
    )
)

func init() {
    prometheus.MustRegister(httpRequestsTotal, httpRequestDuration)
}

func wrapHandler(endpoint string, h http.HandlerFunc) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        start := time.Now()
        sw := &statusWriter{ResponseWriter: w, status: 200}
        h(sw, r)
        elapsed := time.Since(start).Seconds()
        httpRequestsTotal.WithLabelValues(r.Method, endpoint, statusClass(sw.status)).Inc()
        httpRequestDuration.WithLabelValues(r.Method, endpoint).Observe(elapsed)
    }
}

func statusClass(s int) string {
    return string(rune('0'+s/100)) + "xx"   // 200 → "2xx",cardinality 降低
}

func main() {
    http.HandleFunc("/api/orders", wrapHandler("/api/orders", ordersHandler))
    http.Handle("/metrics", promhttp.Handler())
    http.ListenAndServe(":8080", nil)
}
```

**关键取舍**:

1. **Histogram buckets 显式写**——不用默认
2. **status 归约成 2xx/4xx/5xx**——而不是 `status="200"` 这种,降 cardinality
3. **endpoint 是显式的字符串,不是 r.URL.Path**——避免 `/users/12345` 这种带 ID 的 path 当 label
4. **`/metrics` 接口**——Prometheus 拉取的固定路径

### 6.2 Java(Micrometer + Spring Boot)

```java
@RestController
public class OrderController {

    private final MeterRegistry registry;
    private final Counter requestsTotal;
    private final Timer requestDuration;

    public OrderController(MeterRegistry registry) {
        this.registry = registry;
        this.requestsTotal = Counter.builder("http_requests_total")
            .description("Total HTTP requests")
            .tags("service", "order")
            .register(registry);
        this.requestDuration = Timer.builder("http_request_duration_seconds")
            .description("HTTP request duration")
            .publishPercentiles(0.5, 0.95, 0.99)        // Micrometer 默认走 Summary 风格
            .publishPercentileHistogram()                // ← 切回 Histogram(关键!)
            .serviceLevelObjectives(Duration.ofMillis(100), Duration.ofMillis(500), Duration.ofSeconds(1))
            .register(registry);
    }

    @PostMapping("/api/orders")
    public Order createOrder(@RequestBody OrderRequest req) {
        return requestDuration.recordCallable(() -> {
            requestsTotal.increment();
            return orderService.create(req);
        });
    }
}
```

**关键取舍**:

1. **`publishPercentileHistogram()`**——Micrometer 默认会发 Summary(client-side quantile),**这条必加,才会发成 Histogram**。否则你拿到的是不能跨实例聚合的 Summary。
2. **`serviceLevelObjectives()`**——告诉 Micrometer 你的 SLO 边界,它会自动把这些值加入 bucket(让 P99 在 SLO 附近精确)
3. **tags 在 builder 里写**——避免每次 increment 都传

> Micrometer 是 Java 生态的事实标准,但**它的默认行为是发 Summary**——这是历史原因(Java 圈早期推 Summary),**在分布式系统里必须显式切到 Histogram**。**code review 时见到 Micrometer 没加 `publishPercentileHistogram()` 的,直接打回**。

### 6.3 Python(prometheus_client)

```python
from prometheus_client import Counter, Histogram, start_http_server
import time
from flask import Flask, request

app = Flask(__name__)

# Counter
REQUESTS = Counter(
    'http_requests_total',
    'Total HTTP requests',
    ['method', 'endpoint', 'status']
)

# Histogram
REQUEST_DURATION = Histogram(
    'http_request_duration_seconds',
    'HTTP request duration',
    ['method', 'endpoint'],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10)
)

@app.before_request
def before():
    request.start_time = time.time()

@app.after_request
def after(response):
    endpoint = request.endpoint or 'unknown'
    method = request.method
    status_class = f"{response.status_code // 100}xx"
    REQUESTS.labels(method=method, endpoint=endpoint, status=status_class).inc()
    REQUEST_DURATION.labels(method=method, endpoint=endpoint).observe(
        time.time() - request.start_time
    )
    return response

if __name__ == '__main__':
    start_http_server(8000)        # /metrics on :8000
    app.run(host='0.0.0.0', port=5000)
```

**关键取舍**:

1. **`start_http_server(8000)` 单独起一个端口**——和业务端口分开,避免业务挂了 /metrics 也挂
2. **endpoint 来自 Flask 的 `request.endpoint`**——是 Flask 注册的路由名(`'create_order'`),不是 URL path(`/api/orders/12345`),自动 normalize
3. **buckets 显式写**——Python client 的默认 buckets 在某些场景太密 / 太疏

---

## 七、几条核心踩坑

### 7.1 用 avg 代替 Histogram

已经反复说,这是最大的坑。**code review 见到任何形式的 `avg / mean / sum/count` 算延迟,打回**。

### 7.2 label 放 user_id / request_id

Prometheus OOM 的头号原因。**任何想"按用户拆"的需求,答案都是 log / trace,不是 metric**。

### 7.3 Summary 拿来跨实例算 p99

数学上不等价,结果会让你的 p99 看起来"比真实情况好 2-5 倍"。**全部迁到 Histogram**。

### 7.4 Histogram buckets 拍脑袋

**没覆盖 SLO 边界** = p99 永远算不准。**没覆盖远超期望值** = 慢请求全落 +Inf,看不见峰值。**先写 SLO,再设 buckets**。

### 7.5 Counter 不带 `_total`

OpenMetrics 标准会拒绝,Prometheus 老版本容忍但新版本警告。**Counter 必带 `_total`,Gauge 必不带 `_total`**——一眼看出类型。

### 7.6 客户端打毫秒、Prom 假定是秒

客户端打 `request_duration = 50.0`(以为是毫秒),Grafana 上画曲线发现是 50 秒——单位错位 1000 倍。**全栈强制秒**。

### 7.7 把 Prometheus 当事件日志

「我每个订单都打一条 metric」——错。Metric 是聚合数据,**每个订单要打的是日志**。某团队曾经 `Counter.inc()` 每次都 label 上 `order_id="ord-12345"`,Prometheus 秒级 OOM。

---

## 八、何时不该用 Metrics(或者:这些场景该用别的)

Metrics 不是万能。下面这几个场景,**Metric 不是错的答案,但不是最优答案**。

### 8.1 个体追溯 → Trace / Log

```
✗ 这个 user_id=42 的请求慢了
✗ 这次 release-v2.3 部署影响了哪些 endpoint

→ Trace(OTel + Tempo / Jaeger,看 11 篇)
→ Log(Loki / ELK,看 09 / 10 篇)
```

**Metric 是统计学,Trace 是法医学**——前者告诉你"群体什么样",后者告诉你"个体什么样"。

### 8.2 业务事件 → Event / 数仓

```
✗ 这一周哪些用户买了 iPhone
✗ 双 11 GMV 实时图

→ 业务事件流 (Kafka) → ClickHouse / Druid
→ Prometheus 不适合 "业务报表"
```

**Metric 的精度是聚合后的,不能下钻到单条记录**。**业务报表 / BI 需要明细数据,用数仓**。

### 8.3 高基数特征 → Cardinality 友好的存储

```
✗ 按 device_id 看每台设备的指标(10 万设备)
✗ 按 tenant_id 看每个租户的延迟(1000 租户)

→ 用 VictoriaMetrics(支持更高 cardinality,看 08 篇)
→ 或迁到 ClickHouse 做 metric 存储
```

**Prometheus 是为"几千 series"设计的,十万级 series 已经是上限**。SaaS 多租户 / IoT 这种场景**必须换技术栈**。

### 8.4 极端实时 → 用别的工具

```
✗ 1 秒内必须看到指标变化
✗ 触发器是 sub-second

→ Prometheus scrape interval 最低 5s,默认 15s
→ 实时性要求高 → StatsD + Graphite,或 push-based 流式
```

**Prometheus 不是为亚秒级响应设计的**——它是为"看几分钟到几小时趋势"设计的。

### 8.5 单进程 / 小工具

```
✗ 内网一个 cron job,跑 10 分钟一次

→ 直接打日志就行,不用 Prometheus
→ 没必要为这点东西部署一个 Prom + Alertmanager + Grafana
```

**Metric 工程的运维成本是有的**——一个 Prom 实例至少要 2 GB 内存、要维护 retention、要做 backup。**值不值得为 5 个内网工具去搭这套**?自己评估。

---

## 九、踩坑提醒清单

1. **用 avg 代替 Histogram** —— 长尾全被稀释,p99 永远看不见
2. **label 放 user_id / request_id** —— Prometheus 内存秒级爆炸
3. **Summary 拿来跨实例 p99** —— 数学上不等价,结果"虚假美好"
4. **Histogram buckets 不覆盖 SLO** —— 算出来的 p99 误差几十倍
5. **Counter 不带 `_total`** —— OpenMetrics 拒绝,工具识别错
6. **客户端打毫秒,服务端假定秒** —— 单位错位 1000 倍,无声错误
7. **Path 不 normalize** —— `/users/12345` `/users/67890` 全成独立 label 值,基数爆炸
8. **status_code 不归约** —— `200/201/202/204/206/...` 几十种,而不是 `2xx`
9. **Prometheus 端不做 cardinality 监控** —— 某天发布加了高基数 label,你不查就 OOM 告诉你
10. **同一件事多人打了不同名字的 metric** —— 没有命名规范的下场
11. **Micrometer 默认打 Summary** —— Java 圈最大坑,要显式 `publishPercentileHistogram()`
12. **拿 Metric 当业务事件流** —— Metric 是聚合,不是明细,业务报表去数仓
13. **打 metric 不写 Help** —— 三个月后没人记得这个指标在量什么
14. **不做指标治理** —— 一年后 Prometheus 里 1 万个 metric,80% 没人看,30% 是错的

---

## 十、本篇的硬指标

看完这一篇,你应该能在白板前讲清楚:

- **Counter / Gauge / Histogram / Summary 四个类型的边界**——给一个具体场景能 5 秒选出对的类型
- **为什么 avg 是错的**——能用一个长尾分布的例子让产品经理也听懂
- **Histogram bucket 怎么设**——能说出"我的 SLO 是 p99 < 300ms,所以我的 bucket 里必须有 0.3"
- **Cardinality 怎么算 / 怎么治**——能估算"加一个 user_id label 我的 series 会变成多少"
- **指标命名约定**——能在 code review 时一眼指出 `http_request_time` 这种名字哪里不对

并且能给团队**写出一份 metric 命名规范**——上面 §5.3 的模板就是底稿。

---

下一篇:`06-Prometheus深入.md`,这一篇讲的是"打什么 metric",下一篇讲"怎么把这些 metric 抓回来"——**Prometheus 的 Pull 模型为什么在 K8s 里反而比 Push 简单**、**服务发现的三种主流模式**(K8s SD / Consul SD / file SD)**怎么配**、**Scrape interval 15s 还是 30s 的取舍**(精度 vs 存储 vs target 压力)、**Recording Rule 命名规范** `level:metric:operations`、**Federation 和 Remote Write 的边界**、**单 Prom 实例的容量上限**——讲清楚这一篇,你就能在团队里负责 Prometheus 的运维了。
