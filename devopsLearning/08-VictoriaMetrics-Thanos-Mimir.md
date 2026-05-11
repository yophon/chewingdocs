# VictoriaMetrics / Thanos / Mimir:Prometheus 长存储与多机房三选一

讲 Prometheus 长存储的文章一抓一大把,但 90% 都犯同一个错——**把"能用"和"该用"混在一起讲**。VictoriaMetrics 能装、Thanos 能装、Mimir 也能装,问题不是装不装得起来,而是「你这个团队、这个规模、这种查询模式,到底该选哪个」。这一篇只回答这个问题。06、07 两篇讲了 Prometheus 自己的能力极限——单机存储、本地盘、跨实例查询要靠 federation 拼;**这一篇讲的就是这个极限被撞穿之后,长存储这条路怎么走才不挖坑给自己**。

> 一句话先记住:**长存储不是"Prometheus 不够用了就加一个"的补丁,是一次架构升级**——你换的不是一个"更大的硬盘",而是把 Prometheus 从「单机时序数据库」变成了「分布式时序系统」。多了三个新东西要维护:对象存储 / 查询聚合层 / 历史数据的压缩与降采样策略。**90% 的团队第一次上长存储都低估了这三样的复杂度**,以为「装个 Thanos sidecar 就完了」,半年后掉进「Store Gateway 查不动 / S3 账单爆炸 / 时间窗口对不齐」的坑里爬不出来。

---

## 一、为什么 Prometheus 单机会撞墙

backendLearning/33 讲过 Prometheus 的 Pull 模型——它的强项是「单机本地盘 + 单进程查询」,这套设计在 100-500 个 target、单实例不到 200 万 series 的时候非常稳。**但你团队一旦做到这两件事,Prometheus 就开始痛**:

```
   ┌───────────────────────────────────────────────────────────┐
   │   情况一:数据保留期需要超过 30 天                        │
   │   ─────────────────────────────────────────                │
   │   Prometheus 本地 TSDB 存 100 万 series × 90 天             │
   │   ≈ 200-400 GB 本地盘                                       │
   │   再加上副本(高可用要 2 副本)→ 800GB                      │
   │   再加上预留增长空间 → 1TB+                                 │
   │   K8s PVC 给一个 1TB 的 SSD,这就是单点                     │
   │   挂了恢复时间小时级别,不能分片                            │
   └───────────────────────────────────────────────────────────┘

   ┌───────────────────────────────────────────────────────────┐
   │   情况二:跨实例 / 跨机房聚合查询                          │
   │   ─────────────────────────────────────────                │
   │   有 3 个机房,每个机房一个 Prometheus 实例                 │
   │   想看全局 sum(rate(http_requests_total[5m]))               │
   │   原生方案 federation:中心 Prometheus 抓子 Prometheus       │
   │   问题:                                                    │
   │     - 中心实例又是单点,数据量翻倍                          │
   │     - 历史数据没法回填,只能从 federation 开始算            │
   │     - 跨实例的 join 跑不通(标签维度不对齐)                │
   └───────────────────────────────────────────────────────────┘
```

**这两个痛点出现的临界点,大致是**:

| 团队规模 | 微服务数 | series 数量 | Prometheus 单机能不能扛 |
| --- | --- | --- | --- |
| 5 人,1 个机房 | < 30 | < 50 万 | 完全 OK,本地盘够 |
| 10-20 人,1 个机房 | 50-100 | 100-300 万 | 还能撑,但保留期建议 ≤ 15 天 |
| 30-50 人,2-3 机房 | 100-300 | 500 万-1000 万 | **开始痛**,该上长存储 |
| 100+ 人,多机房 + SaaS | 500+ | 1000 万+ | **必须上**,而且要选对方案 |

**重点不是 series 总数,是查询模式**。如果团队从来不查超过 7 天的数据、从来不跨机房聚合,即便 series 到 500 万,也可以靠"把 Prometheus 的本地盘加大、保留期调短"撑着。**真正逼你上长存储的是查询场景在变**——产品要看月度趋势、容量规划要看 90 天峰值、年度复盘要拉一年的数据——**这才是触发点,不是 series 数量**。

---

## 二、三个方案的"个性"完全不同

VictoriaMetrics(下文简称 VM)、Thanos、Mimir 不是「同一类工具的三个品牌」——它们的**架构起点完全不同**,选错了后期想换代价极大。

### 2.1 VictoriaMetrics:把"简单"做到极致

VM 是俄罗斯人写的,**架构最简单也最反主流**——不依赖对象存储,不依赖 Cassandra,**一切都是本地盘**。它的核心赌注是:**自研一套叫 mergeset 的存储引擎,压缩比和查询性能直接打到比 Prometheus 高 5-10 倍**,所以同样的 series 量,VM 只要 1/5 的硬件。

```
   写入路径:
   ─────────
   vmagent ──remote_write──▶ vmstorage(本地 SSD)
                                  │
                                  └─ mergeset(LSM 变种,行存压缩极致)

   查询路径:
   ─────────
   Grafana ──PromQL──▶ vmselect ──fan-out──▶ vmstorage × N
                            │
                            └─ 内置 MetricsQL(PromQL 超集)
```

**亮点**:

- **单二进制**模式(`victoria-metrics-single`),适合中型团队——一个进程就是「Prometheus 替代品」,本地盘,**起步零运维**
- **集群版**(vmagent / vmselect / vmstorage / vminsert),组件少,默认配置就能跑
- **不强制对象存储**——这一点是和 Thanos / Mimir 最大区别,小团队不用预先搞 S3
- **MetricsQL** 是 PromQL 超集,常用查询 100% 兼容,还多了 `keep_last_value` / `histogram_share` 这种实用扩展

**短板**:

- 社区比 Thanos / Mimir 小,中文文档少
- 多租户支持比 Mimir 弱(企业版才有完整租户隔离)
- 跨地域复制要靠 vmagent 双写,**不是原生分布式**

### 2.2 Thanos:Prometheus 嫡系,对象存储原生

Thanos 是 Improbable 公司开源(后捐给 CNCF),它的**核心赌注完全相反**——**Prometheus 一个字符不改,在它旁边贴一个 Sidecar 把数据传到对象存储,所有历史数据用 S3 / GCS / OSS 存,查询时按需拉回来**。

```
   ┌─────────────────────────────────────────────────────────────────┐
   │   每个 Prometheus 实例                                          │
   │   ┌────────────────────┐                                        │
   │   │ Prometheus + WAL   │                                        │
   │   │  Sidecar(Thanos) │──▶ 每 2h 上传一个 block 到 S3           │
   │   └────────────────────┘                                        │
   │           ▲                                                     │
   │           │ gRPC                                                │
   └───────────┼─────────────────────────────────────────────────────┘
               │
   ┌───────────┴──────────────┐
   │       Thanos Query        │ ── PromQL ── Grafana
   │  (聚合 Sidecar + Store)  │
   └───┬──────────────────┬────┘
       │                  │
       ▼                  ▼
   Sidecars(近 2h)    Store Gateway(历史数据)
                              │
                              ▼
                          S3 / GCS / OSS
```

**亮点**:

- **兼容性最好**——Prometheus 不用改,Sidecar 是旁路,**踩雷成本低**(出问题撤掉 Sidecar 就回到原 Prometheus)
- 对象存储天生便宜,**90 天数据放 S3 一个月几十块钱**
- 多机房聚合是它的强项——Query 组件直接 fan-out 到多个集群的 Sidecar,**跨地域 PromQL 原生支持**
- 社区最大,集成最多(ArgoCD / Grafana Cloud 早期方案都是 Thanos)

**短板**:

- **组件多**——Sidecar / Query / Store Gateway / Compactor / Ruler / Receiver,5-6 个组件全要部署
- 查询冷数据慢——Store Gateway 要从 S3 拉 block,**第一次查 90 天前的数据,30 秒不算夸张**
- Compactor 是单点(必须独占运行),挂了要人介入

### 2.3 Mimir:Grafana Labs 的"重型武器"

Mimir 是 Grafana Labs 2022 年开源(基于 Cortex 演进),**它的赌注是写路径性能 + 多租户**——专门给「写入量大、租户多」的 SaaS / 平台团队设计。

```
   写入路径(微服务化最彻底)
   ─────────────────────────────────────────
   vmagent / Grafana Agent  ──remote_write──▶ Distributor
                                                  │ hashring
                                                  ▼
                                              Ingester(内存 + WAL)
                                                  │ 每 2h flush
                                                  ▼
                                              Store(对象存储)

   查询路径(分片并行)
   ─────────────────────────────────────────
   Grafana ──▶ Query Frontend ──split──▶ Querier × N ──▶ Ingester + Store
                                                                Gateway
```

**亮点**:

- **写入吞吐最强**——Distributor + Ingester 这一套是 Cortex 验证多年的设计,千万 QPS 写入毫无压力
- **多租户原生**——X-Scope-OrgID header 切租户,Grafana Cloud 自己也在用 Mimir
- 查询有 split + cache 优化,长时间范围的 PromQL 是分片并行执行的
- **水平扩展彻底**——每个组件都可以独立加副本

**短板**:

- **极重**——10+ 个微服务组件,生产部署 30+ Pod 起步
- 多租户对中型团队是**负担不是价值**——你就 100 个微服务,不需要"租户"概念
- 运维复杂度数倍于 VM,**没有专职 SRE 团队不要碰**

### 2.4 三个方案的"性格画像"

| 维度 | VictoriaMetrics | Thanos | Mimir |
| --- | --- | --- | --- |
| 架构哲学 | **简单 + 性能** | **兼容 + 对象存储** | **写路径 + 多租户** |
| 最小组件数 | 1(单机版) | 4-5 | 10+ |
| 对象存储 | 可选(企业版必需) | **必选** | **必选** |
| 查询性能(冷数据) | 快(本地盘) | 慢(S3 拉) | 中(分片 + cache) |
| 写入吞吐 | 高 | 中 | **最高** |
| 多机房聚合 | 双写 + vmselect 联邦 | **原生 fan-out** | 原生(但要规划租户) |
| 多租户 | 企业版 | 弱(per-cluster) | **强** |
| 学习曲线 | 1-2 周 | 1-2 月 | 3-6 月 |
| 中文社区 | 还行 | 大 | 一般 |
| 已有 Prometheus 的迁移成本 | 极低(remote_write) | **零**(Sidecar 旁路) | 中(要重配 agent) |

---

## 三、选型矩阵:你到底该选哪个

不要看 GitHub Star,**看你这三个变量**:**单机房还是多机房 / 已有对象存储没有 / 团队有没有专职 SRE**。

```
   ┌─────────────────────────────────────────────────────────────┐
   │  你的 series 总量 < 1000 万,单机房,没专职 SRE             │
   │  → 选 VictoriaMetrics(单二进制)                           │
   │  理由:零运维,本地 SSD 一个 TB 撑半年                      │
   ├─────────────────────────────────────────────────────────────┤
   │  series 1000 万-5000 万,2-3 个机房,已有 S3/OSS              │
   │  → 选 Thanos                                                │
   │  理由:对象存储现成,Sidecar 模式不动 Prometheus            │
   ├─────────────────────────────────────────────────────────────┤
   │  series 5000 万+,多租户 SaaS,有专职 SRE                    │
   │  → 选 Mimir                                                 │
   │  理由:水平扩展彻底,租户隔离原生                            │
   ├─────────────────────────────────────────────────────────────┤
   │  series < 200 万,数据只看 7 天,不跨机房                    │
   │  → 别上长存储,把 Prometheus 本地盘加大,retention 调到 30 天 │
   │  理由:折腾长存储的精力够你做 5 件正经事                    │
   └─────────────────────────────────────────────────────────────┘
```

**90% 的中型团队应该选 VictoriaMetrics**——这不是结论,是观察。我见过的「装了 Thanos 然后放在那不维护」的团队比「装了 VM 然后放着」的团队多 10 倍。**因为 Thanos 的组件多,而中型团队没人有时间维护那么多组件**。

**剩下 10% 真正适合 Thanos / Mimir 的团队,通常有这两个特征**:

1. **已经在用 S3/OSS,而且账单上有运维专人盯着**——上对象存储成本不是难点
2. **真有跨机房查询需求**——不是「将来可能有」,是「这季度有人在投诉」

---

## 四、VM 最小部署:一个真实的落地

挑 VM 来讲落地,**因为它是大多数中型团队的最优解**。落地分三步:**vmagent 在每个集群收集 → vmstorage 集中存 → vmselect 统一查**。

### 4.1 架构图

```
   集群 A                              集群 B
   ┌──────────────────┐               ┌──────────────────┐
   │ Prometheus *     │               │ Prometheus *     │
   │     │            │               │     │            │
   │     ▼            │               │     ▼            │
   │ vmagent          │               │ vmagent          │
   │ (持久化队列)    │               │ (持久化队列)    │
   └──────┬───────────┘               └──────┬───────────┘
          │ remote_write                     │ remote_write
          └──────────────┐    ┌──────────────┘
                         ▼    ▼
                  ┌─────────────────┐
                  │   vminsert      │  ── (集群版才有)
                  │   (写路由)     │
                  └────────┬────────┘
                           │
                  ┌────────▼────────┐
                  │   vmstorage     │  ── 本地 SSD,LSM 引擎
                  │  (3 副本起步) │
                  └────────▲────────┘
                           │
                  ┌────────┴────────┐
                  │   vmselect      │  ── PromQL/MetricsQL
                  └────────▲────────┘
                           │
                       Grafana

   * 备注:如果是新部署,Prometheus 都可以省掉,vmagent 直接抓 target
     既能做 Prometheus,又能写到 vmstorage,组件少一层
```

**关键设计**:

- 每个集群一个 **vmagent**,持久化队列(`-remoteWrite.tmpDataPath`)在本地盘——**网络断了不丢数据**,这是它和直接 remote_write 最大区别
- vmstorage **3 副本**起步(`-replicationFactor=2`),保证 1 个节点挂不影响查询
- vmselect 是无状态的,**可以放 K8s Deployment 多副本随便扩**

### 4.2 vmagent 的关键配置

`vmagent` 是从 Prometheus 抓数据再转发的 agent。**核心配置只有 5 段**:

```yaml
# vmagent-config.yaml
global:
  scrape_interval: 30s        # 注意:不是 15s
  external_labels:
    cluster: prod-shanghai    # 必须有 cluster 标签,跨机房聚合靠它

scrape_configs:
- job_name: 'kubernetes-pods'
  kubernetes_sd_configs:
  - role: pod
  relabel_configs:
  - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
    action: keep
    regex: 'true'
  - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_port]
    action: replace
    target_label: __address__

remote_write:
- url: http://vminsert.monitoring.svc:8480/insert/0/prometheus
  queue_config:
    capacity: 10000
    max_shards: 30           # 反压时最多 30 个分片并发写
    max_samples_per_send: 5000
```

**4 个决定**:

1. **`scrape_interval: 30s` 不是 15s**——15s 是 Prometheus 老默认,**series 上百万之后 30s 立刻把存储成本降一半**。除非你确实需要 15s 粒度告警(很少),否则没必要
2. **`external_labels.cluster` 必须有**——跨机房查询全靠它做维度切分,**忘了加,后期补就要重导历史数据**
3. **`relabel_configs` 用 `annotation` 过滤**——不要让所有 Pod 都被抓,**只抓显式声明 `prometheus.io/scrape: "true"` 的**
4. **`max_shards: 30` 是反压上限**——vmagent 的队列满了会停止抓取,**不会丢数据但会延迟**;留 30 个分片让它能撑住短暂的存储故障

### 4.3 vmstorage 的资源画像

存储节点是整个系统最重的部分。**资源估算用这个公式**:

```
   100 万 active series × 30s 采样间隔 × 90 天保留
   = 100 万 × (86400 / 30) × 90
   = 2.59 × 10^11 个数据点
   ≈ 80-120 GB(VM 压缩后,Prometheus 原生是 5x)

   生产 buffer:× 3 副本 + 30% 增长空间 → 实际 ≈ 400-500 GB
```

**实际生产配比(我们团队的真实数据)**:

| 维度 | 配比 |
| --- | --- |
| series 数(active) | 300 万 |
| 采样间隔 | 30s |
| 保留期 | 90 天 |
| 单节点磁盘 | 1 TB NVMe SSD |
| 单节点内存 | 32 GB |
| 单节点 CPU | 8 核 |
| 节点数 | 3(副本因子 2) |
| 实际占用磁盘 | 单节点 ≈ 300-350 GB |

**这套配置月成本(云上)≈ 1500-2500 元**——比同等规模的 Thanos(对象存储 + Store Gateway 计算)便宜 50%,**因为 VM 没有把数据放到 S3 还要拉回来**。

### 4.4 K8s 部署的关键 YAML

```yaml
# vmstorage StatefulSet 关键片段
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: vmstorage
spec:
  serviceName: vmstorage
  replicas: 3
  template:
    spec:
      containers:
      - name: vmstorage
        image: victoriametrics/vmstorage:v1.96.0
        args:
        - --retentionPeriod=90d              # 保留期
        - --storageDataPath=/storage
        - --dedup.minScrapeInterval=30s       # 同一 series 同时刻去重
        - --memory.allowedPercent=70          # 内存上限,留 30% 给 OS cache
        resources:
          requests:
            cpu: 4
            memory: 16Gi
          limits:
            memory: 32Gi
        volumeMounts:
        - name: storage
          mountPath: /storage
  volumeClaimTemplates:
  - metadata:
      name: storage
    spec:
      accessModes: ["ReadWriteOnce"]
      storageClassName: nvme-ssd            # 必须 NVMe,机械盘扛不住
      resources:
        requests:
          storage: 1Ti
```

**4 个生死攸关的配置**:

1. **`storageClassName: nvme-ssd`**——VM 用 LSM 结构,merge 阶段 IOPS 飙到 5000+,**机械盘 / SATA SSD 直接 OOM**
2. **`memory.allowedPercent=70`**——VM 默认会吃完 limits,留 30% 给 page cache 才能跑得快
3. **`dedup.minScrapeInterval=30s`**——HA 多副本写入时去重,**没这个会双倍存储**
4. **`retentionPeriod=90d`** 而不是 1y——**先从 90 天开始**,真有人查 1 年再加;**长保留期是最容易超预算的开关**

---

## 五、降采样与压缩的取舍

长存储有个绕不开的话题:**90 天的数据,真的需要 30 秒一个点吗**?

```
   ┌─────────────────────────────────────────────────────────┐
   │  时间维度的查询热度(经验值)                            │
   │                                                         │
   │   ▲                                                     │
   │   │ █████ 0-2 天:90% 查询                              │
   │   │ ████                                                │
   │   │ ███   2-30 天:9% 查询                              │
   │   │ ██                                                  │
   │   │ █     30-90 天:0.9% 查询                            │
   │   │ ▁     90 天+:0.1% 查询(年度回顾)                  │
   │   └─────────────────────────────────────▶               │
   │     0    2    30   90  365 天                           │
   └─────────────────────────────────────────────────────────┘
```

**结论很反直觉**:历史数据的查询频率指数级下降,但**存储成本是线性增长**——这就是「降采样(downsampling)」要解决的问题。

### 5.1 三个方案的降采样能力

| 方案 | 降采样 | 备注 |
| --- | --- | --- |
| VictoriaMetrics | **企业版才有**(社区版没有) | 社区版靠 Recording Rule 自己降 |
| Thanos | **原生支持**(5m / 1h 两档) | Compactor 组件自动跑 |
| Mimir | **原生支持** | 类似 Thanos |

**VM 社区版的妥协方案**:Recording Rule。在 vmagent 端配置:

```yaml
# 5 分钟粒度的预聚合规则
- record: rate_http_requests_5m
  expr: rate(http_requests_total[5m])
- record: rate_http_requests_1h
  expr: rate(http_requests_total[1h])
```

**Recording Rule 不是真正的降采样**——原始数据还在,只是查询时不用扫原始;**真要省存储,只能靠改 `scrape_interval`** 或者**保留期分级**(60 天 30s + 30 天 1m 不好做,只能整体一个保留期)。

### 5.2 Thanos Compactor 的降采样配置

```bash
thanos compact \
    --data-dir=/var/thanos/compact \
    --objstore.config-file=bucket.yml \
    --retention.resolution-raw=30d \      # 原始数据保留 30 天
    --retention.resolution-5m=90d \       # 5 分钟粒度保留 90 天
    --retention.resolution-1h=365d        # 1 小时粒度保留 365 天
```

**这套配置的效果**:30 天内查询用原始数据(15s 一个点),30-90 天用 5m,90 天-1 年用 1h。**存储成本对比**:

```
   100 万 series 90 天保留:
   ─────────────────────────────────────────
   不降采样      ≈ 400 GB
   30d 原始 + 60d 5m   ≈ 150 GB(省 62%)
   30d 原始 + 60d 5m + 1y 1h(总 455 天) ≈ 200 GB(几乎不变,但能查一年)
```

**经验**:**先开 5 分钟粒度,再考虑 1 小时**——5 分钟降采样基本覆盖所有"看趋势"的场景,1 小时是给"年度回顾"用的,大多数团队头一年都用不上。

### 5.3 VM 的压缩为什么这么强

VM 的存储引擎叫 **mergeset**,核心思想是「**列存 + delta encoding + ZSTD**」:

```
   原始时序数据(每行):
   timestamp  value  labels
   1700000000 0.85   {host=web1,job=api}
   1700000030 0.87   {host=web1,job=api}    ← labels 完全相同
   1700000060 0.86   {host=web1,job=api}
   ...

   VM 压缩后:
   ┌─────────────────────────────────────────┐
   │ labels 块(一次性存储,后续引用)        │
   │ {host=web1,job=api} → id=42             │
   └─────────────────────────────────────────┘
   ┌─────────────────────────────────────────┐
   │ values 块(delta + ZSTD)                │
   │ [0.85, +0.02, -0.01, ...]               │
   │ → 实际压缩到 1-2 字节/点                │
   └─────────────────────────────────────────┘
```

**实测压缩比**:VM 是 0.5-1 字节/点(已压缩),Prometheus 是 2-3 字节/点。**这就是同样数据 VM 只要 1/3-1/5 磁盘的原因**。

---

## 六、长存储的成本估算

这一节给两组真实数据,**给你做容量规划用**。

### 6.1 VictoriaMetrics 集群版

```
   假设:300 万 active series,30s 采样,90 天保留,3 副本
   ─────────────────────────────────────────────────────────
   单副本磁盘    ≈ 300 GB(VM 实测压缩比)
   3 副本磁盘    ≈ 900 GB
   IOPS(写)    ≈ 2000-3000(merge 阶段峰值 5000)
   IOPS(读)    ≈ 100-500(Grafana 查询)
   内存(单节点) ≈ 16-32 GB(主要给 OS cache)
   CPU(单节点)  ≈ 4-8 核

   云上月成本(阿里云 ECS + NVMe SSD):
   3 × (ecs.g7.xlarge + 1TB NVMe ESSD PL1)
   ≈ 3 × (700 + 800) = 4500 元/月

   单租户 SaaS 化:300 万 series 摊到 10 个团队
   每团队成本 ≈ 450 元/月,比公有云监控服务便宜 5-10 倍
```

### 6.2 Thanos + S3

```
   同样 300 万 series,90 天保留:
   ─────────────────────────────────────────────────────────
   Prometheus 本地盘(2h 数据)× N 集群 = 60 GB × 3 = 180 GB
   S3 存储(2h+ 的所有历史)        ≈ 400-500 GB
   Store Gateway 节点(查询用,无盘) = 2 × (4 核 16G)
   Compactor 节点(单点,无盘)      = 1 × (4 核 8G)
   Query 节点(无状态)              = 2 × (2 核 4G)

   云上月成本:
   - S3:500 GB × 0.12 元/GB/月 = 60 元
   - S3 请求(查询 + Compactor):≈ 200-500 元
   - 计算节点:5 × 200-400 元 = 1500 元
   - Prometheus 本地盘:180 GB × 1 元/GB/月 = 180 元
   合计 ≈ 2000-2500 元/月

   备注:
   - S3 请求费经常被忽略!查 90 天数据会触发大量 S3 List + Get
   - Compactor 是个吃流量大户,长期运行
```

**对比**:VM 4500 元 / 月、Thanos 2000-2500 元 / 月。**单看账单 Thanos 便宜**——但是 Thanos 维护人力成本要算上:**6 个组件的告警 / 升级 / 故障排查,等于多养半个 SRE**。

**结论**:**< 50 人团队选 VM 总成本低,> 100 人团队 Thanos 才划算**——人力成本是隐形大头。

### 6.3 一个真实的反例

我见过一个团队,30 人微服务规模,**强行上了 Mimir**。理由是「未来可能要做 SaaS 化」。结果:

- 部署用了 2 个月,运维投入比业务团队还高
- 实际 series 只有 80 万,Mimir 的 Distributor / Ingester 全部空跑
- 1 年后「未来」也没来,业务收缩,Mimir 也没拆掉
- **月成本 8000 元,实际产生的价值不到 800 元**

**复盘的教训**:**不要按"未来可能性"选架构,按"今年要解决的痛"选**。Mimir 是好东西,但要在「真有租户痛 + 真有规模痛」的时候上,不是「将来可能有」。

---

## 七、踩坑清单(8 个真实踩过的坑)

### 坑 1:remote_write 没设持久化队列,网络抖动丢数据

Prometheus 直接 `remote_write` 到 vminsert,**默认队列在内存**,网络断了 30 秒数据就丢了。

**修复**:

```yaml
# Prometheus 配置
remote_write:
- url: http://vminsert:8480/insert/0/prometheus
  queue_config:
    capacity: 10000
    max_shards: 30
# 但 Prometheus 自己的 queue 是内存的,还是会丢

# 真正修法:用 vmagent 替代 Prometheus 的 remote_write
# vmagent 有 -remoteWrite.tmpDataPath,网络断了写本地盘
```

**经验**:**用 vmagent 不用 Prometheus 自己的 remote_write**——这是 VM 团队的设计哲学,vmagent 是专门为 reliable shipping 设计的。

### 坑 2:跨机房 series 没加 cluster 标签

第一次部署没加 `external_labels: cluster`,运行 3 个月后想做跨机房聚合,**发现所有数据都长一样,根本分不开**。

**修复成本**:**全部重导**——VM 没法在原数据上加标签,Thanos 也一样。

**预防**:**第一天就加 `external_labels`**——`cluster` / `region` / `env`(prod/staging)三个**雷打不动**。

### 坑 3:Prometheus + Thanos Sidecar 内存爆炸

Sidecar 模式默认会读 Prometheus 的 TSDB block,**Prometheus 节点的内存负担翻倍**——一个 16G 内存的 Prometheus 加了 Sidecar 之后 OOM。

**修复**:

```yaml
# Sidecar 必须限内存
args:
- --shipper.upload-compacted=false   # 别让 Sidecar 等 compactor
- --reloader.config-file=/etc/prometheus.yaml
resources:
  limits:
    memory: 4Gi
```

更彻底:**Prometheus 设置 `--storage.tsdb.min-block-duration=2h --storage.tsdb.max-block-duration=2h`** ——禁用本地 compaction,让 Thanos Compactor 接管,Sidecar 内存压力降一半。

### 坑 4:Store Gateway 查冷数据 30 秒+

Thanos 第一次查 60 天前的数据,**Store Gateway 要从 S3 拉 block index、加载到内存、再扫描**——30 秒都算快的。

**修复**:

- **加 cache**:`--index-cache.config-file` 配 Memcached 或 Redis,索引缓存住
- **加副本**:Store Gateway 多副本分担
- **改 client 行为**:Grafana dashboard 默认时间范围别开 90 天

**经验**:**Thanos 的查询性能不是 PromQL 慢,是 S3 拉数据慢**——这是物理限制,只能靠 cache 缓解。

### 坑 5:Compactor 跑 OOM 把对象存储搞坏

Thanos Compactor 默认会把多个 block merge 成大 block,**内存峰值需要 8-16 GB**——OOM 之后中断,**可能留下半坏的 block 在 S3**,下一轮 Compactor 起来直接报错。

**修复**:

```bash
thanos compact \
    --compact.concurrency=1 \              # 别并发
    --downsample.concurrency=1 \
    --consistency-delay=30m \              # 等 30m 再处理新 block,避免和 Sidecar 上传冲突
    --delete-delay=48h                     # 删除前等 48h,留恢复机会
```

**经验**:**Compactor 单点,资源给足,自动重试要靠人**——这一点 VM 完全没这个问题,merge 是 vmstorage 内置的。

### 坑 6:VM 单二进制版本扩不动了,集群版又不肯切

团队从 VM 单二进制版起步,**series 涨到 200 万,单节点开始 GC 卡顿**——想切集群版,但是单二进制的数据迁移有点麻烦。

**修复**:

```bash
# 用 vmctl 工具迁移
vmctl vm-native \
    --vm-native-src-addr=http://old-vm:8428 \
    --vm-native-dst-addr=http://new-cluster:8480 \
    --vm-native-filter-time-start=2024-01-01T00:00:00Z \
    --vm-native-filter-time-end=2024-12-31T23:59:59Z
```

**经验**:**单二进制版的天花板大约是 200-300 万 series**,超过这个数提前规划切集群版,**别等出问题才切**。

### 坑 7:Grafana 配 datasource 没区分 vmselect 和 Prometheus

vmselect 用的是 PromQL 兼容协议,**Grafana 里直接选 Prometheus datasource 类型**就能用——但有几个细节:

- `Scrape interval` 不是 Prometheus 用的概念,VM 不读
- `Query timeout` 默认 30s 在 VM 上够,但大查询可能不够,**调到 60s**
- VM 的 `Type: VictoriaMetrics` 这种第三方插件**也存在**,但兼容性不如直接用 Prometheus 类型

**推荐**:**直接用 Prometheus datasource 类型**,VM 兼容度足够,**避免插件升级时的兼容问题**。

### 坑 8:Mimir Distributor 的 hashring 配置错了,写入丢

Mimir 的 Distributor 用 consistent hash 把 series 分配到 Ingester,**hashring 配错(replication factor 算错 / KV store 用 inmemory)会导致写入 ack 之后数据丢**。

**修复**:**KV store 必须用 Consul / etcd / memberlist**——`-distributor.ring.store=memberlist`,**不要用 `inmemory`**。

```yaml
distributor:
  ring:
    kvstore:
      store: memberlist

common:
  storage:
    backend: s3
    s3:
      endpoint: s3.amazonaws.com
      bucket_name: mimir-blocks
```

**经验**:**Mimir 的"开箱即用"是骗人的**——任何 inmemory 配置上生产都是雷,**这就是它需要专职 SRE 的原因**。

---

## 八、何时不该上长存储

**这部分写给"还在犹豫"的团队**——以下 4 种情况,**别折腾**:

### 8.1 series 总量 < 100 万 + 保留期 ≤ 30 天

把 Prometheus 本地盘扩到 500 GB,`--storage.tsdb.retention.time=30d`,**就够用**。**500 GB SSD 一个月 100 元,长存储要 2000+**。

### 8.2 没有跨机房 / 跨实例聚合需求

如果团队只有一个机房,Grafana 直接连 Prometheus 就行,**federation 都不用搭**。**长存储的核心价值是"全局视角",没这个需求别买这个套件**。

### 8.3 团队没有专职 SRE

Thanos / Mimir 需要长期维护,**升级一次牵动 5-6 个组件**。如果团队没人愿意每月花 8 小时盯着这套东西,**只会变成放在 K8s 里慢慢腐烂的僵尸服务**。

**例外**:VM 单二进制版**真的可以零运维**,**这是它和 Thanos / Mimir 的本质区别**。

### 8.4 主要痛点是"查询慢"不是"存不下"

PromQL 查询慢的原因 80% 是**查询本身写得烂**(没用 Recording Rule、查了 30 天的 high-cardinality 数据),**不是 Prometheus 不够强**。先优化查询,**再考虑换存储**。

**判断方法**:

```
   去 Prometheus 的 /metrics 看 prometheus_engine_query_duration_seconds:
   ─────────────────────────────────────────────────────────────
   p99 < 1s    → 查询没问题,可能是 dashboard 不合理
   p99 1-5s    → 优化查询(降基数 + Recording Rule)
   p99 > 10s   → 真的撑不住了,考虑长存储
```

---

## 九、回到一开始的问题

**Prometheus 长存储不是"加个组件"——是把单机时序数据库升级成分布式系统**。这一升级带来的不只是「数据存更久」,还有:

- **新的故障域**——对象存储 / 查询聚合层 / 降采样调度都可能出问题
- **新的成本结构**——存储成本变低,但运维 + 计算成本上来了
- **新的查询语义**——MetricsQL / 跨机房聚合,不再是「我熟悉的 PromQL」
- **新的 SLO 维度**——长存储自己的可用性,要不要算进监控系统的 SLO

**这一篇要给你留下的不是"VM / Thanos / Mimir 怎么装",而是"为什么、什么时候、什么规模该装"**。装哪个工具是 1 周的事,**选错了工具维护 3 年是 100 周的事**。

> 经验法则:**< 1000 万 series 单机房选 VM 简单又快,> 5000 万 series + 多机房选 Thanos 兼容性好,真有多租户痛才上 Mimir**。**没有"绝对正确"的选择,只有"匹配你当前规模"的选择**——一年后业务规模变了,**该换就换**,不要为了「沉没成本」死守一个不合适的方案。

---

下一篇 `09-日志系统选型.md`,从指标切到日志——讲清楚为什么 ELK 时代的"一切都索引"在今天的数据规模下经济上跑不通、Loki 用「只索引 label」换来的成本优势到底香在哪、ClickHouse 做日志为什么在中等规模团队里越来越火、以及最关键的——**结构化日志和采样策略不做好,换什么后端都救不了你的账单**。
