# PromQL 实战:rate / histogram_quantile / 常见踩坑 / 别再用 increase 算 QPS

第二层「可观测性三件套」的 Metrics 部分,前两篇讲了"**打什么 metric**"和"**怎么抓 metric**",**这一篇讲"怎么用 metric"**——也就是 PromQL。**这一层我打算讲到底,因为 PromQL 是 Prometheus 整个生态里,中型团队工程师最容易写错、写错了还看不出来错的东西**。Dashboard 上挂的一条 P99 曲线长得平平稳稳——你以为业务稳如老狗——**实际上是 PromQL 写错了,真实的 P99 早就破了 SLO**。告警写"5xx 率 > 1% 触发"——**你以为这条告警准时响**——实际上是 PromQL 把不同时区不同实例的请求乱聚合,真出事时被稀释成 0.3%,**告警永远不响**。**这种"看起来在监控,实际全错"的状态比"完全没监控"还危险**——前者让你产生"我们有监控"的错觉,后者至少你知道自己没有。

backendLearning/33 浅讲过 PromQL 的 `rate / sum / by` 基本语法,**这一篇假设你已经能写 `sum by (service) (rate(http_requests_total[5m]))`**。这一篇只讲 PromQL 的工程视角:**rate vs irate vs increase 三个函数的差别和坑(尤其是为什么 increase 不能算 QPS)、rate 时间窗口的最小约束(必须 ≥ 4 × scrape_interval)、histogram_quantile 正确写法和错误写法只差一行 `by (le)`、offset / @ modifier / subquery 这些高级特性什么时候真有用、counter reset 和 stale marker 怎么让你的告警在最关键时刻失准、5 条生产里每天在用的 PromQL 模板**。看完你应该能在 Grafana 上**一眼看出"这个查询写错了"**,而不是只会跟着同事的截图照抄。

> 一句话先记住:**PromQL 是声明式的,但它不是"你写出来就一定对"——它会"算出一个数"给你,但那个数可能跟你想问的问题完全无关**。Counter reset、stale marker、scrape interval 抖动、bucket 边界、聚合顺序——这五个隐藏变量决定了同一行 PromQL 在不同上下文返回的结果差别可以是几倍到几十倍。**这一篇不讲 PromQL 完整语法,只讲"工程师每天写 PromQL 时最容易踩、踩了还看不见的坑"**。

---

## 一、问题场景:一条错的 PromQL 比没监控还坑

直接讲一个真实事故,在某中型 SaaS 团队。

```
P0 事故:某产品页加载延迟从 100ms 飙到 3 秒,持续 25 分钟才被工程师发现
       (是从客服投诉里发现的,不是从告警)

事后复盘:
  - 团队 dashboard 上有"产品页 P99"这条曲线
  - 事故期间这条曲线显示 350ms,完全没异常
  - 告警阈值是 P99 > 500ms,所以没触发
  - 但实际 P99 是 3000ms 

PromQL 拆开看:
  团队写的(错的):
    avg(histogram_quantile(0.99, rate(product_page_duration_seconds_bucket[5m])))
                                     ↑                                          ↑
                                     这两个括号位置错了,导致先按 instance 算各自 P99
                                     然后 avg 把 100 个 instance 的 P99 平均掉了
    
  应该写的(对的):
    histogram_quantile(0.99, 
      sum by (le) (rate(product_page_duration_seconds_bucket[5m]))
    )
    ↑ 先把所有 instance 的 bucket 加起来,再算分位数

  结果差别:
    错的:  ~350ms(100 个 instance 各自 P99 的平均,被稀释)
    对的:  ~3000ms(全局 P99,反映真实用户体验)
    差了 8 倍
```

**这场事故的根因不是工具,不是 cardinality,不是告警阈值——是 PromQL 写错了一行**。**而且团队没有任何机制能发现这一行写错了**——dashboard 显示数字,数字看起来"合理",所有人都默认它对的。

中型团队撞上 PromQL 错误的临界点很明显:

| 团队规模 | PromQL 表现 |
| --- | --- |
| < 5 人 | 一个老员工写所有 PromQL,他写对了就对 |
| **5-15 人 / 100 微服务** | **PromQL 各团队自己写,错率最高的阶段** |
| 15-30 人 | 必须有 PromQL Code Review + Recording Rule 模板 |
| > 30 人 | 必须有 PromQL Linter + Dashboard 治理流程 |

**这一篇主要服务 5-15 人这一档**——刚开始让每个团队自己写 PromQL,但还没建好治理。

---

## 二、rate / irate / increase:三个看似一样的函数,大不相同

**这是 PromQL 里最容易混淆的一组函数**。三者都作用于 Counter,**都"看起来"在算"涨了多少"**,但语义和适用场景完全不同。

### 2.1 三者的语义

```
假设一个 Counter 的样本(scrape_interval = 15s):
  t=0s    counter = 100
  t=15s   counter = 120
  t=30s   counter = 145
  t=45s   counter = 170
  t=60s   counter = 200

rate(counter[1m])     在 t=60 时:
  含义:过去 1 分钟内的"平均"增长速率(每秒)
  算法:(末值 - 首值) / 时间窗口
       (200 - 100) / 60s = 1.67 /s
       但 Prom 会做"外推"(extrapolation)调整边界
  返回:接近 1.67(单位:per second)

irate(counter[1m])    在 t=60 时:
  含义:最近两个样本的"瞬时"增长速率
  算法:(最后一个 - 倒数第二个) / 间隔
       (200 - 170) / 15s = 2 /s
  返回:2(单位:per second)
  注意:窗口里只用最后两个点,前面 4 个点完全没用

increase(counter[1m]) 在 t=60 时:
  含义:过去 1 分钟"总共"涨了多少(不是每秒)
  算法:跟 rate 一样的 (末值-首值),但乘以窗口长度
       基本等价于 rate(...[1m]) * 60
  返回:接近 100(单位:绝对值,不是 per second)
```

**这三个函数的输出单位不同**:rate / irate 是"per second"(速率),increase 是"绝对值"(总量)。这是它们最大的语义差异。

### 2.2 rate:99% 的场景用它

**rate 是 PromQL 算 Counter 速率的默认答案**——除非你有明确理由用 irate 或 increase,**永远先选 rate**。

```text
# 每秒请求数(QPS)
sum(rate(http_requests_total[5m]))

# 按服务拆 QPS
sum by (service) (rate(http_requests_total[5m]))

# 错误率
sum(rate(http_requests_total{status="5xx"}[5m]))
  / sum(rate(http_requests_total[5m]))
```

**rate 的工程优势**:

1. **平滑 / 抗抖动**——窗口内所有样本都用,scrape 偶尔失败一次不影响结果
2. **自动处理 counter reset**——Counter 重启从 0 开始,rate 看到下跌会自动补偿(假定刚好涨到上一个值就重启)
3. **外推(extrapolation)**——窗口边界的样本通常不在精确时间点上,rate 会按比例外推

### 2.3 irate:只看最后两个点,适合"瞬时尖峰"

```text
# 实时 CPU 使用率(亚分钟尖峰可见)
irate(node_cpu_seconds_total{mode="user"}[1m])
```

**irate 的特征**:

```
窗口[1m]内有 4 个样本:[100, 120, 145, 170, 200]
rate:    用全部 5 个点 → 平均速率 1.67/s
irate:   只用最后两个 → 瞬时速率 2.0/s

如果中间有突变:
  样本:  [100, 120, 145, 170, 500]   ← 最后一秒突然 +330
  rate:  (500-100)/60 = 6.67/s
  irate: (500-170)/15 = 22/s         ← 尖峰被精准捕捉
```

**irate 适合什么**:**短时间内可能有尖峰、你需要"最新一刻"的速率,不在乎平均**。典型用法是**实时 dashboard**(看当前一瞬间在涨多快)。

**irate 不适合什么**:**告警**。告警评估每 15s 一次,**irate 在窗口边缘抖动剧烈**,容易触发误报或漏报。**告警永远用 rate**。

### 2.4 increase:只算"总量",不是 QPS

**这一节是这一章的重点**——大量团队**用 increase 算 QPS,而且不知道自己写错了**。

```text
# 错的(看起来对,实际错):
increase(http_requests_total[5m])
# 工程师以为:"过去 5 分钟的 QPS"
# 实际上:    "过去 5 分钟总共多少个请求"
# 单位:     绝对值,不是 per second

# 错误后果:
# 看到 dashboard 上的数字是 30000
# 你以为 QPS 是 30000(很高?)
# 其实是"5 分钟内 30000 个请求" → QPS = 30000/300 = 100
```

**那 increase 在什么时候用**?**只有当你想知道"某个时间窗口内总共多少"这个绝对值时**。

```text
# 对的用法:
# 过去 1 小时一共发生多少次错误
increase(http_errors_total[1h])

# 一天的请求总量(报表用)
increase(http_requests_total[24h])

# 跟"速率"无关,跟"累计"有关
```

**判别口诀**:

```
你的问题是"每秒"几个?  → rate
你的问题是"总共"几个?  → increase
你的问题是"现在"几个?  → irate
```

**最严重的踩坑**:Grafana 默认 panel 的 unit 设错——比如 panel 设了 "requests/sec" 但 PromQL 是 `increase()`,**数字是绝对值但单位标 per second,直接误导一年**。

### 2.5 时间窗口选多大

```
窗口[X]的最小约束:
   X ≥ 4 × scrape_interval

为什么必须 ≥ 4 倍:
   rate 至少需要 2 个数据点才能算
   但抖动 / scrape 失败 / counter reset 会让点变少
   留至少 4 倍 buffer,才稳定

   scrape_interval = 15s
      ✓ rate(...[1m])     窗口 60s,够 4 个点  ← 标准选择
      ✓ rate(...[5m])     窗口 300s,够 20 个点 ← 平滑
      ✗ rate(...[30s])    只够 2 个点,极易出现 NaN

   scrape_interval = 30s
      ✓ rate(...[2m])     8 个点
      ✓ rate(...[5m])     10 个点
      ✗ rate(...[1m])     2 个点,不稳

   scrape_interval = 60s
      ✓ rate(...[4m])     4 个点(刚好达标)
      ✓ rate(...[10m])    10 个点(更稳)
```

**经验**:

- **告警用 `[5m]` 或 `[10m]`**——足够稳,误报少
- **实时 dashboard 用 `[1m]` 或 `[2m]`**——足够细,看变化快
- **业务指标(QPS / 错误率)用 `[5m]`**——平衡稳定性和实时性

**绝对不要用 `[15s]` `[30s]`**——这是新人最常犯的错,以为"窗口越小越实时",**结果是 PromQL 返回 NaN 一半时间**。

### 2.6 一张选型决策表

| 你要算什么 | 用什么 | 例子 |
| --- | --- | --- |
| QPS / 每秒错误数 / 速率 | `rate` | `sum(rate(http_requests_total[5m]))` |
| 总数 / 累计量 / 报表 | `increase` | `increase(http_requests_total[24h])` |
| 实时尖峰 / 瞬时变化 | `irate` | `irate(node_cpu_seconds_total[1m])`(只用在 dashboard) |
| Gauge(不是 Counter)| 直接查 | `node_memory_MemAvailable_bytes` |
| Gauge 的变化率 | `deriv` | `deriv(queue_length[5m])` |
| Gauge 在某窗口平均 | `avg_over_time` | `avg_over_time(cpu_usage[10m])` |

---

## 三、histogram_quantile:最容易写错的一个函数

**这是 PromQL 第二个高发错误区**。**写错的方式只有一种,写对的方式也只有一种,但 80% 的工程师写的是错的那一种**。

### 3.1 错的写法 vs 对的写法

直接看代码:

```text
# === 错的写法 1:先 quantile 再聚合 ===
avg(histogram_quantile(0.99, 
  rate(http_request_duration_seconds_bucket[5m])
))
# 这个写法在每个 instance 上各算一次 p99
# 然后 avg 把这些 instance 的 p99 平均掉
# → "100 个 instance 各自 p99 的平均"
# → 不是"全局 p99"
# 数学上:平均 p99 ≠ 全局 p99,后者通常大很多


# === 错的写法 2:le 没有 by 进去 ===
histogram_quantile(0.99, 
  sum(rate(http_request_duration_seconds_bucket[5m]))
)
# sum 把所有 series(包括 le 维度)都加成一个数
# histogram_quantile 找不到 le 标签,直接报错或返回 NaN
# Prom 现代版本会 silent 失败


# === 对的写法 ===
histogram_quantile(0.99,
  sum by (le) (rate(http_request_duration_seconds_bucket[5m]))
)
# 1. 先 rate() 算每个 bucket 的速率
# 2. sum by (le) 把所有 instance / 所有维度,按 le(桶上界)合并
# 3. histogram_quantile 看到只剩 le 维度,正确算分位数


# === 对的写法(按 endpoint 拆,看每个 endpoint 的 p99)===
histogram_quantile(0.99,
  sum by (le, endpoint) (rate(http_request_duration_seconds_bucket[5m]))
)
# by (le, endpoint) ── 保留 endpoint 维度,le 必须 by
# 输出:每个 endpoint 一条 p99 曲线
```

### 3.2 为什么 `le` 必须 `by` 进去

**这是 Histogram 的内部数据结构决定的**——上一篇 05 讲过,Histogram 用一组按 `le`(less-than-or-equal)累计的 Counter 表示分布:

```
http_request_duration_seconds_bucket{le="0.005"}   1234
http_request_duration_seconds_bucket{le="0.01"}    1500
http_request_duration_seconds_bucket{le="0.025"}   1800
http_request_duration_seconds_bucket{le="0.05"}    2100
http_request_duration_seconds_bucket{le="0.1"}     2500
http_request_duration_seconds_bucket{le="0.25"}    2800
http_request_duration_seconds_bucket{le="0.5"}     2950
http_request_duration_seconds_bucket{le="1"}       2990
http_request_duration_seconds_bucket{le="2.5"}     2998
http_request_duration_seconds_bucket{le="5"}       2999
http_request_duration_seconds_bucket{le="10"}      3000
http_request_duration_seconds_bucket{le="+Inf"}    3000
```

**`histogram_quantile(0.99, …)` 函数的算法**:**遍历所有 le 标签,找出"刚好覆盖 99% 累计数"的那个桶,然后线性插值算具体值**。

```
total_count = 3000(le=+Inf 桶)
99% × 3000 = 2970

遍历:
  le=0.005   累计 1234 < 2970,继续
  le=0.01    累计 1500 < 2970,继续
  ...
  le=0.25    累计 2800 < 2970,继续
  le=0.5     累计 2950 < 2970,继续
  le=1       累计 2990 ≥ 2970,停!

p99 在 [0.5, 1] 之间,线性插值:
  上一桶累计 2950(在 le=0.5)
  这一桶累计 2990(在 le=1)
  需要 2970(在 le=?)
  
  比例 = (2970 - 2950) / (2990 - 2950) = 0.5
  p99 = 0.5 + 0.5 × (1 - 0.5) = 0.75 (秒)
```

**关键**:**这个算法依赖"`le` 是一个独立的维度",才能遍历**。如果你把 `le` `sum` 掉了,所有 bucket 加成一个数,**histogram_quantile 没法工作**。

### 3.3 多实例聚合:正确的层次

```text
# 100 个 Pod,每个 Pod 自己的 p99 (单独看每个 Pod)
histogram_quantile(0.99,
  sum by (le, instance) (rate(http_request_duration_seconds_bucket[5m]))
)
# by 里多了 instance,每个 instance 一条曲线

# 全局 p99 (把 100 个 Pod 加起来一起算)
histogram_quantile(0.99,
  sum by (le) (rate(http_request_duration_seconds_bucket[5m]))
)
# 只 by le,instance 维度被 sum 掉

# 按 endpoint 拆全局 p99
histogram_quantile(0.99,
  sum by (le, endpoint) (rate(http_request_duration_seconds_bucket[5m]))
)
# 既要按 endpoint 拆,le 也 by
```

**判别口诀**:**`histogram_quantile(...)` 的内部表达式,`by (le, X1, X2, …)` 里的 X 维度就是你最后看到的曲线分组**。**`le` 永远在里面,后面跟你想看的业务维度**。

### 3.4 一个真实的反面教材

某团队的 dashboard 上有这条:

```text
histogram_quantile(0.99,
  rate(http_request_duration_seconds_bucket[5m])
)
```

**这条没显式聚合,Prom 会保留所有原始维度(instance / status / le / ...)**。结果:**每个 instance × 每个 status 一条 p99 曲线**——dashboard 上几千条线,看不见任何模式。

**修复**:

```text
histogram_quantile(0.99,
  sum by (le) (rate(http_request_duration_seconds_bucket[5m]))
)
```

**一条干净的全局 p99 曲线**——这才是 dashboard 该有的样子。

### 3.5 Recording Rule 必预算 histogram_quantile

`histogram_quantile` 的计算量是 PromQL 里最大的一档——**dashboard 频繁查 + 告警频繁评估 = CPU 飙满**。**必须用 Recording Rule 预算**(上一篇 §5 详谈过):

```yaml
# rules.yml
groups:
  - name: latency
    interval: 30s
    rules:
      - record: endpoint:http_request_duration_seconds:p99_5m
        expr: |
          histogram_quantile(0.99,
            sum by (le, endpoint, service) (
              rate(http_request_duration_seconds_bucket[5m])
            )
          )

      - record: endpoint:http_request_duration_seconds:p95_5m
        expr: |
          histogram_quantile(0.95,
            sum by (le, endpoint, service) (
              rate(http_request_duration_seconds_bucket[5m])
            )
          )
```

**之后**,dashboard 和告警查 `endpoint:http_request_duration_seconds:p99_5m`——一个简单的指标查询,**比原始 PromQL 快 100 倍**。

---

## 四、5 条生产里每天在用的 PromQL

讲完原理,看模板。下面这 5 条是 RED 指标 + 容量预测的核心 PromQL,**直接抄到 dashboard 上能跑**。

### 4.1 服务 QPS(请求速率)

```text
# 全局
sum(rate(http_requests_total[5m]))

# 按服务拆
sum by (service) (rate(http_requests_total[5m]))

# 按 endpoint 拆(注意要先 path normalize)
sum by (service, endpoint) (rate(http_requests_total[5m]))
```

**单位**:requests / second(req/s)

**踩坑**:

- 别用 `increase()` 替代 `rate()`(已说)
- 别用 `irate()`(告警用 rate)
- 别忘了 `sum`——不 sum 的话每个 instance 一条线

### 4.2 错误率(5xx ratio)

```text
# 全局错误率
sum(rate(http_requests_total{status="5xx"}[5m]))
  /
sum(rate(http_requests_total[5m]))

# 按服务拆
sum by (service) (rate(http_requests_total{status="5xx"}[5m]))
  /
sum by (service) (rate(http_requests_total[5m]))
```

**单位**:ratio(0-1),Grafana 上设 unit "percent (0.0-1.0)"

**踩坑**:

- **分母是所有请求,不只是非 5xx**——不要写成 `5xx / non-5xx`
- **status label 必须 normalize 成 2xx/4xx/5xx**(不是具体 200/404/500),否则筛选条件麻烦
- **分母为 0 → NaN**:某段时间没请求,这个表达式返回 NaN。**告警判定要带 `or vector(0)` 兜底**

```text
# 防御性写法(NaN 时返回 0)
(
  sum by (service) (rate(http_requests_total{status="5xx"}[5m]))
    /
  sum by (service) (rate(http_requests_total[5m]))
)
or
sum by (service) (rate(http_requests_total[5m])) * 0
```

### 4.3 P99 延迟

```text
# 全局 p99(必经 Recording Rule)
histogram_quantile(0.99,
  sum by (le) (rate(http_request_duration_seconds_bucket[5m]))
)

# 按服务拆
histogram_quantile(0.99,
  sum by (le, service) (rate(http_request_duration_seconds_bucket[5m]))
)

# 三条线同图(p50/p95/p99)
histogram_quantile(0.50, sum by (le) (rate(...[5m])))   # 中位数
histogram_quantile(0.95, sum by (le) (rate(...[5m])))   # 95 分位
histogram_quantile(0.99, sum by (le) (rate(...[5m])))   # 99 分位
```

**单位**:seconds

**踩坑**:

- **`le` 必须 by**(已经说过 3 遍)
- **bucket 不覆盖 SLO 边界 → p99 算不准**(上一篇说过)
- **太少样本 → p99 抖动剧烈**:某 endpoint QPS < 10,5min 才几十个样本,p99 跳来跳去。**用 30m 窗口** `rate(...[30m])` 平滑

### 4.4 CPU 饱和度

```text
# 节点 CPU 使用率(USE 方法)
1 - avg by (instance) (
  rate(node_cpu_seconds_total{mode="idle"}[5m])
)
# 思路:CPU idle 速率越低,使用率越高
# 100% = 1.0(注意单位,Grafana 设 percent unit)

# 容器 CPU(Pod 级)
sum by (pod) (
  rate(container_cpu_usage_seconds_total{container!=""}[5m])
)
# 单位:CPU cores(1.5 = 1.5 个核)

# 容器 CPU 占 limit 的比例
sum by (pod) (rate(container_cpu_usage_seconds_total[5m]))
  /
sum by (pod) (kube_pod_container_resource_limits{resource="cpu"})
# 0-1 之间,0.8+ 接近 throttle
```

**踩坑**:

- **`mode="idle"`**——node_exporter 暴露 idle/user/system/iowait 等,**用 1 - idle 比 sum(user+system+…) 简单且更准**(包含了 iowait)
- **`container!=""`**——过滤掉 cgroup root,否则 sum 会双计
- **不要用 `node_load1`**——load average 是"运行队列长度",和 CPU% 不一样(虽然相关)

### 4.5 容量预测:predict_linear

```text
# 预测磁盘是否会在 24 小时内被写满
predict_linear(node_filesystem_avail_bytes[1h], 24 * 3600) < 0
# 含义:用过去 1 小时的下跌趋势,预测 24h 后的余量
# < 0 → 24h 内会满,告警

# 预测内存是否会在 4 小时内 OOM
predict_linear(node_memory_MemAvailable_bytes[2h], 4 * 3600) < 0

# 预测某指标在 N 小时后达到某阈值
predict_linear(some_metric[1h], 6 * 3600) > 10000
```

**predict_linear 的算法**:**用窗口内的样本做线性回归,外推到未来 N 秒**。**前提是趋势是线性的**——指数增长(垃圾回收堆积)算不准。

**踩坑**:

- **窗口太小预测震荡**:`predict_linear([5m], …)` 用 5min 样本预测 24h,**抖一下就告警**。**至少用 1h-6h 窗口预测**
- **不能预测非单调指标**:用来预测 Counter / 单调下跌的 Gauge 才行,**对周期性指标(QPS 有日夜节奏)用 predict_linear 会乱**
- **告警要带"持续 N 分钟"**:`predict_linear(...) < 0 for 10m`——单次跳变不算

```yaml
# Alertmanager rule 示例
- alert: DiskWillFillIn24h
  expr: predict_linear(node_filesystem_avail_bytes[2h], 24 * 3600) < 0
  for: 30m              # 持续 30 分钟才告警
  labels:
    severity: warning
  annotations:
    summary: "磁盘 {{ $labels.device }} 在 24h 内可能写满"
```

---

## 五、高级特性:offset / @ modifier / subquery

这三个特性是中型团队 PromQL 进阶必备——**用得对省一半 PromQL,用错就给自己挖坑**。

### 5.1 offset:看"过去某个时间点"的值

```text
# 当前 QPS
sum(rate(http_requests_total[5m]))

# 一周前同一时刻的 QPS
sum(rate(http_requests_total[5m] offset 7d))

# 同环比(本周 vs 上周)
sum(rate(http_requests_total[5m]))
  /
sum(rate(http_requests_total[5m] offset 7d))
# 数值 > 1 = 涨,< 1 = 跌
```

**典型应用**:

- **同环比报表**(今天 vs 一周前)
- **节假日对比**(今年双 11 vs 去年双 11,offset 1y)
- **回归测试**(发布前 vs 发布后,offset 1h)

**踩坑**:

- **offset 不能跨 retention**——你 Prom 只存 15 天,`offset 30d` 直接返回空
- **offset 不影响窗口大小**——`rate([5m] offset 7d)` 是"一周前那段 5m"的 rate

### 5.2 `@` modifier:绝对时间锚点

`@` 是 Prom 2.25+ 的新特性,让你**固定 PromQL 的"现在时间"**:

```text
# 用 @end() 锚定到 dashboard 选的时间范围结尾
some_metric @ end()

# 用 @start() 锚定到时间范围开头
some_metric @ start()

# 锚定到固定 unix 时间戳
some_metric @ 1700000000
```

**典型应用**:

```text
# 计算"从 t0 到现在的累计增长率"
(
  http_requests_total
    -
  http_requests_total @ 1700000000      # 锚定到 t0
)
```

**踩坑**:

- **@ 是新特性,Grafana 老版本不支持**——升级先
- **跟 offset 容易混淆**——offset 是"相对偏移",@ 是"绝对锚点"

### 5.3 subquery:在查询里再查询

**subquery 让你在 PromQL 里嵌一个"内层 range query"**:

```text
# 用 5 分钟一段的 rate 作为新的"指标",再算它的 max
max_over_time(
  rate(http_requests_total[5m])[1h:1m]
)
# 内层:每 1 分钟算一次过去 5 分钟的 rate
# 外层:在过去 1 小时,对这些 rate 取 max
# → "过去 1 小时里,最高的 5 分钟 QPS"
```

**典型应用**:

- **算"高峰 QPS"**(过去 1 小时最高的 5m 速率)
- **算"长尾事件"**(过去 24h 出现过几次某情况)

```text
# 过去 24h 错误率超 1% 的总分钟数
count_over_time(
  ((sum(rate(http_requests_total{status="5xx"}[5m]))
    / sum(rate(http_requests_total[5m]))) > 0.01)[24h:1m]
)
```

**踩坑**:

- **Subquery 计算量大**:`[24h:1m]` = 1440 次内层查询。**Recording Rule 必须预算内层**
- **窗口和步长写错**:`[1h:1m]` 意思是"过去 1 小时,每 1m 一次内层";写成 `[1h:10m]` 就只有 6 个点

---

## 六、隐藏陷阱:counter reset / stale / 跨 Prom 聚合

讲完语法和高级特性,讲三个"PromQL 看起来跑了,但答案错了"的隐藏陷阱。

### 6.1 Counter Reset:重启的"幽灵下跌"

```
原始 Counter 样本:
  t=0    counter = 1,000,000
  t=15s  counter = 1,000,050
  t=30s  counter = 1,000,100
  t=45s  ← 进程重启
  t=45s  counter = 0
  t=60s  counter = 50

如果不处理:
  rate 会看到 (50 - 1,000,000) / 60 = -16666 /s ← 负数,荒谬

Prom 的处理:
  发现样本下跌(reset 信号)
  假定"刚好涨到上一个值就重启,然后继续涨"
  补偿:把"跌掉的"部分加回来
  → rate ≈ (1,000,100 + 50) / 60 ≈ 16668 /s ← 但其实是错的近似

正确的真实速率 = 涨 100 / 30s = 3.3 /s
Prom 估算 = 16668 /s
差了 5000 倍
```

**根因**:**Prom 不知道重启发生时 counter 实际涨到哪了**——它只能用最后一个采到的值当上限。**如果重启时 counter 还在涨,真实值会高于最后采到的值**——但 Prom 看不见,只能近似。

**治理**:

- **进程不要频繁重启**——Prom 假定 reset 不常发生,1 小时一次以下问题不大
- **Counter 重启时,如果短时间(< scrape_interval)内涨很多,数据丢**——这是 Counter 的硬限制
- **不要把"业务 GMV"这种重要指标做成 Counter**——做成"事件流推 Kafka + 数仓",Prom 算近似就够

### 6.2 Stale Marker:消失的 series

```
Pod 被删 → 该 Pod 的 /metrics 拉不到 → series 失活

如果不标 stale:
  Prom 不知道这个 series 永远不会再来
  Dashboard 上还会显示这条线最后一刻的值
  PromQL aggregation 把这个"死掉的"值也加进去

Prom 的处理:
  连续 5 个 scrape 都拉不到该 target → 标记 stale
  之后 rate / sum 等函数会忽略这个 series
```

**坑**:**Stale marker 只在"target 整个失联"才触发**——如果 Pod 还在,/metrics 还能拉,但某个 metric 不再被暴露(被删了一个 label 的某个值),**这个 series 不会被自动 stale**。**Prom 会看到它"卡在最后一个值"**——dashboard 上一条平直线,看起来"很稳"。

**示例**:

```
某 Pod 暴露 metric{user_id="42"} ── 这条 series 之前有数据
此用户被删,Pod 不再暴露这个 label 值的 metric
Prom 仍然看见 metric{user_id="42"} = <最后一个值>,持续显示
直到 5 分钟 (默认 staleness window) 过去
```

**这就是为什么 cardinality 高的 label 是噩梦**——不仅占内存,还会留下"幽灵 series"长达 5 分钟。

### 6.3 跨 Prom 聚合:Federation / Remote Read 的隐性偏差

```
两个 Prom 实例 A 和 B,各自抓 50 个 target
scrape_interval = 15s,但 A 和 B 不同步

中心 Federation 每 30s 拉一次,在 t=30 拉到:
  A 的最新数据是 t=27
  B 的最新数据是 t=22
  
  ↓ 中心 Prom 把 t=22 和 t=27 的数据混在一起算 rate
  ↓ rate 窗口里,样本时间戳不连续
  ↓ 结果偏离真实值
```

**根因**:**Prom 假定一个 series 的样本来自同一来源、时间戳连续**。跨实例聚合时这个假设打破。

**治理**:

- **跨实例 PromQL 只用 Recording Rule 产物**——本地 Prom 已经做完 aggregation,中心 Prom 看到的是稳定的预算 metric
- **不要在中心 Prom 重新跑 rate / histogram_quantile**——这些是"原始 metric 级"的操作,在已聚合的 metric 上跑会丢精度
- **Thanos / Mimir 等长存储工具有"专门处理跨副本"的机制**(`__replica__` label + deduplication)

---

## 七、一段最差实践的 PromQL 改造

讲完原理和坑,看一个真实的"烂 PromQL"改造案例。

### 7.1 改造前

某团队 Grafana 上的"产品页 P99 延迟"panel:

```text
avg(
  histogram_quantile(
    0.99,
    rate(product_page_duration_ms_bucket[30s])
  )
) * 1000
```

**问题清单**:

```
1. 指标名 product_page_duration_ms_bucket 
   → 单位 ms 进了名字,违反 _seconds 约定
   → "* 1000" 暗示开发者也不确定单位,凑数

2. rate([30s]) 
   → 30s 窗口 < 4 × 15s = 60s,样本不足,经常 NaN

3. histogram_quantile 没 by (le) 
   → rate 输出保留原始 instance 维度,le 没显式聚合
   → Prom 现代版本可能 silent 返回错值

4. 外面 avg() 
   → 平均"每个 instance 的 p99",不是全局 p99
   → 数学上是错的

5. 整个表达式没 service / endpoint 维度
   → 多个产品页混在一起,看不出哪个慢
```

### 7.2 改造步骤

**第一步**:**修指标名**。

```
旧:product_page_duration_ms_bucket
新:product_page_duration_seconds_bucket    # 单位改成秒
   值:0.005 / 0.01 / 0.025 / 0.05 / 0.1 / 0.25 / 0.5 / 1 / 2.5 / 5 / 10
代码层把 ms 改成 seconds(value / 1000.0)
```

**第二步**:**改 PromQL**。

```text
# 改后(全局 P99)
histogram_quantile(0.99,
  sum by (le) (rate(product_page_duration_seconds_bucket[5m]))
)
```

```text
# 改后(按 endpoint 拆 P99)
histogram_quantile(0.99,
  sum by (le, endpoint) (rate(product_page_duration_seconds_bucket[5m]))
)
```

**第三步**:**做 Recording Rule**。

```yaml
groups:
  - name: product_page_latency
    interval: 30s
    rules:
      - record: endpoint:product_page_duration_seconds:p99_5m
        expr: |
          histogram_quantile(0.99,
            sum by (le, endpoint) (
              rate(product_page_duration_seconds_bucket[5m])
            )
          )
      - record: endpoint:product_page_duration_seconds:p95_5m
        expr: |
          histogram_quantile(0.95,
            sum by (le, endpoint) (
              rate(product_page_duration_seconds_bucket[5m])
            )
          )
      - record: endpoint:product_page_duration_seconds:p50_5m
        expr: |
          histogram_quantile(0.50,
            sum by (le, endpoint) (
              rate(product_page_duration_seconds_bucket[5m])
            )
          )
```

**第四步**:**Dashboard 改成查 Recording Rule 产物**。

```text
# Dashboard panel 1:全局 P99
sum(endpoint:product_page_duration_seconds:p99_5m)

# 等一下,这条是错的!sum 会把不同 endpoint 加起来
# 改成:
max(endpoint:product_page_duration_seconds:p99_5m)
# 或者:
avg(endpoint:product_page_duration_seconds:p99_5m)
# 取决于你要"最慢的 endpoint"还是"平均水平"
```

**注意**:**Recording Rule 产物已经按 endpoint 拆好了,Dashboard 上再聚合时要想清楚**。如果要全局 P99 而不是"各 endpoint P99 的平均",**应该在 Recording Rule 里再写一条不按 endpoint 拆的版本**:

```yaml
- record: service:product_page_duration_seconds:p99_5m
  expr: |
    histogram_quantile(0.99,
      sum by (le) (
        rate(product_page_duration_seconds_bucket[5m])
      )
    )
# 注意 level 是 service,没有 endpoint
```

**第五步**:**告警 expr 用 Recording Rule 产物**。

```yaml
- alert: ProductPageHighLatency
  expr: |
    endpoint:product_page_duration_seconds:p99_5m > 0.5
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Endpoint {{ $labels.endpoint }} P99 > 500ms"
```

### 7.3 改造前后对比

| 维度 | 改造前 | 改造后 |
| --- | --- | --- |
| 单位 | ms(违规) | seconds(标准) |
| 窗口 | 30s(易 NaN) | 5m(稳定) |
| `le` 处理 | 没 by(可能错) | by (le)(正确) |
| 聚合顺序 | avg 后 quantile(错) | sum by le 后 quantile(对) |
| 维度拆分 | 全部混合 | 按 endpoint 拆 |
| 性能 | 每次查询全算 | Recording Rule 预算 |
| 数值差 | 350ms(错的) | 3000ms(对的) |

**改造的意义不只是数字变对,还有"告警终于会在该响的时候响"**——之前 P99 看起来 350ms 永远不触发,改造后真实 P99 3000ms 立刻告警。

---

## 八、踩坑提醒

### 8.1 `rate / irate / increase` 单位混淆

`rate` 和 `irate` 是 per second,`increase` 是绝对总量。**Grafana panel 的 unit 必须和 PromQL 输出单位匹配**——错了你的图就在骗你。

### 8.2 窗口 `[X]` 小于 `4 × scrape_interval`

PromQL 静默返回 NaN 一半时间。**最小 `[1m]`(配 15s scrape),稳妥 `[5m]`**。

### 8.3 `histogram_quantile` 顺序错

记住口诀:**"先 rate,再 sum by le,最后 quantile"**。**绝不能 avg(quantile(…))**。

### 8.4 用 `increase()` 算 QPS

最常见的入门错误。**rate 是速率,increase 是总量**。

### 8.5 没监控 PromQL 自己的性能

`prometheus_engine_query_duration_seconds`、`prometheus_rule_evaluation_duration_seconds`——**这些指标告诉你哪条 PromQL 太慢**。慢查询就送 Recording Rule。

### 8.6 分母为 0 返回 NaN,告警永远不响

```text
# 错的写法
rate(errors[5m]) / rate(total[5m])    # total = 0 时 NaN,告警条件永远不满足

# 防御性写法
(rate(errors[5m]) / rate(total[5m])) or vector(0)
```

### 8.7 跨 Prom 聚合用原始 metric

跨实例聚合丢精度。**Federation / Thanos 跨实例时只查 Recording Rule 产物**。

### 8.8 Counter 重启 / Pod 漂移

重启时高速涨的 Counter,Prom 算不准。**重要的"业务总量"不要做成 Prom Counter,做成事件流**。

### 8.9 path normalize 没做

`/users/12345 /users/67890` 各成一个 series → cardinality 爆炸。在 web framework 层做 template:`/users/:id`。

### 8.10 dashboard 上 100 条线

不显式 `sum by (...)` 聚合的 PromQL,Grafana panel 上就是 100 条线挤一起。**Dashboard 一行 query 必须有显式聚合**。

### 8.11 用 PromQL 算"明细"

"上一个小时哪些用户失败了 5 次以上"——这是日志的事,不是 metric。Metric 是聚合数据。

### 8.12 告警评估慢

`histogram_quantile + 复杂 by + 长窗口` 的告警每 15s 评估一次,直接把 Prom CPU 拖满。**所有复杂告警 expr 必走 Recording Rule**。

### 8.13 Subquery 滥用

`[24h:1m]` 就是 1440 个内层 query。**Subquery 是核武器,不是默认工具**。

---

## 九、何时不该用 PromQL(或者:换工具的信号)

PromQL 不是万能。这一节是给"我们 PromQL 越写越长越复杂"的团队一个反思机会。

### 9.1 信号 1:PromQL 写到 30 行还看不懂

```
某团队的"健康度"PromQL 写了 30 行,5 个嵌套
   - 没人能解释为什么这样写
   - 改一下就崩
   
真相:这是"业务报表"逻辑,不是"指标聚合"逻辑
解决:数据进 ClickHouse / 数仓,用 SQL 写
```

**PromQL 是为"几条线性聚合 + 简单算术"设计的**——复杂业务逻辑塞进 PromQL 永远是错的方向。

### 9.2 信号 2:经常要 join 不同来源的 metric

PromQL 的 `* on(...) group_left(...)` 语法是为简单 join 设计的——**不是 SQL 风格的多表 join**。如果你天天写 `group_left`,**说明你需要的是 SQL,不是 PromQL**。

### 9.3 信号 3:要看个体明细

```
✗ "user_id=42 这个用户过去 1 小时的延迟历史"
   - 在 metric 层做不到(label 不能放 user_id)
   - → Trace / Log 查
   
✗ "上次部署影响了哪几个 endpoint"
   - 还是 Trace / Log 的事
   
✗ "某个 device_id 最后心跳时间"
   - 这是事件流,不是 metric
```

### 9.4 信号 4:跨 Prom 实例频繁

```
跨 region / 跨集群的 PromQL 永远有精度问题
→ 用 Thanos / VM / Mimir 提供的全局 PromQL(看 08 篇)
→ 或者把数据落到 OLAP(ClickHouse / Druid)用 SQL 查
```

### 9.5 PromQL 之外的选择

```
要做明细查询      → SQL on ClickHouse / Druid
要做时序预测      → ML 模型 / Prophet / 算法库
要做复杂 join     → SQL on OLAP
要做长时间报表    → 数仓
要看个体记录      → Trace + Log
```

---

## 十、踩坑提醒清单

1. **`increase` 算 QPS** —— 单位错了 N 倍,dashboard 长期误导
2. **窗口 < 4 × scrape_interval** —— NaN 一半时间
3. **`histogram_quantile` 没 `by (le)`** —— 函数 silent 失败或错值
4. **avg(quantile(...)) 跨实例 P99** —— 数学上不等价,真实 P99 看不见
5. **`irate` 用在告警里** —— 窗口边缘抖动剧烈,误报漏报
6. **分母可能为 0 不写 `or vector(0)`** —— NaN 让告警永远不响
7. **跨 Prom 用原始 metric 算 PromQL** —— 时间戳不同步,精度丢
8. **PromQL 写 30 行嵌套** —— 这是业务逻辑,该用 SQL 不是 PromQL
9. **没 Recording Rule** —— 复杂查询每次重算,Prom CPU 飙
10. **不做 path normalize** —— cardinality 爆炸,PromQL 巨慢
11. **Counter Reset 没考虑** —— 高频重启时 rate 不准
12. **Stale Marker 5 min 假象** —— 死掉的 series 还在 dashboard 显示
13. **跨 endpoint 聚合时 P99 求平均** —— "平均 P99" 数学上不存在
14. **subquery 滥用** —— `[24h:1m]` 是核武器,不是默认工具
15. **dashboard 没显式聚合,100 条线挤一起** —— 啥都看不出来

---

## 十一、本篇的硬指标

看完这一篇,你应该能在白板前讲清楚:

- **`rate / irate / increase` 三者的语义和适用场景**——给具体业务问题能 5 秒选出对的函数
- **rate 窗口的最小约束**——`[X] ≥ 4 × scrape_interval`,且**告警永远用 5m+**
- **`histogram_quantile` 的正确写法**——口诀"先 rate,再 sum by le,最后 quantile"
- **错误率 / QPS / P99 / CPU / 容量预测 五条核心 PromQL**——直接能写出来不用查文档
- **counter reset / stale marker / 跨 Prom 聚合 三个隐藏陷阱**——能在 code review 时识别
- **何时该用 PromQL,何时该换工具**(SQL / Trace / 数仓)

并且能给团队**写一份 PromQL 模板库**——RED 指标 / USE 指标 / 容量预测 各 1 条标准 query,新人直接复用,不再各写各的。

---

## 十二、第二层 Metrics 三连小结

到这里,**Metrics 这一层的三篇连起来形成了一张完整地图**:

```
05-Metrics 心智 (打什么)
   ├─ Counter / Gauge / Histogram / Summary
   ├─ avg 是骗人的,长尾用 Histogram
   ├─ cardinality 是底线,user_id 不进 label
   └─ 命名带 _seconds / _bytes / _total

06-Prometheus 深入 (怎么抓)
   ├─ Pull 模型为什么在 K8s 简单
   ├─ Service Discovery 三种
   ├─ scrape_interval 15s 是标准
   ├─ Recording Rule 命名 level:metric:operations
   ├─ Federation vs Remote Write 边界
   └─ 单实例容量上限 2-3M series

07-PromQL 实战 (怎么查) ← 这一篇
   ├─ rate / irate / increase 三选一
   ├─ histogram_quantile 必须 by le
   ├─ 5 条核心 PromQL 模板
   ├─ counter reset / stale / 跨 Prom 三大陷阱
   └─ Recording Rule 让 dashboard 飞起来
```

**这三件事一起到位,你团队的 Metrics 这一层就稳了**。**任何一件漏一项,这三件都白做**——比如打了 Histogram 但 PromQL 用 avg,白搭;PromQL 写对但用 Summary,白搭;两件都对但没 cardinality 治理,Prometheus OOM 一切归零。**这三篇是一个套件,不是单独阅读**。

---

下一篇:`08-VictoriaMetrics-Thanos-Mimir.md`,讲完单实例 Prometheus,讲"超出单实例容量后怎么办"——**VictoriaMetrics / Thanos / Mimir 三选一**,讲清楚三者的设计哲学差别(VM 是单二进制重写,Thanos 是 Prom + 对象存储,Mimir 是 Cortex 的演进)、**长期存储的存储分层**(本地热存 / 对象存储冷存)、**高 cardinality 友好度比较**、**多机房 PromQL 查询的 Thanos Query 模式**——以及**为什么 2026 年 90% 中型团队的答案是 VictoriaMetrics**(开源、单二进制、扛 cardinality)。**这是 Metrics 这一层的"长存储"答案,看完整 Metrics 章节才闭环**。
