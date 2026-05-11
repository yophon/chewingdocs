# 负载均衡与 CDN 调度

「我用 Nginx 做 LB,加几个 backend,负载就均衡了」——这是入门视角。但**真做大规模流量调度,你会发现负载均衡不是"分散请求"这么简单**:**L4 还是 L7?同一用户请求要不要落同一台?backend 挂了多久察觉?健康检查是主动 ping 还是被动统计?跨机房怎么调度?用户在巴西,我服务在北京,DNS 怎么把他指到圣保罗的边缘节点?边缘节点缓存命中率从 30% 提到 80% 那 50% 的差值 P99 能省多少?Cloudflare 怎么用 Anycast 让全球都觉得"主页就在身边"?CDN 回源风暴打挂源站,源站怎么保护自己?**——这些是 LB 和 CDN 真正的工程命题。从 LVS(2000 年章文嵩)到 HAProxy(2001 年)到 Cloudflare 全球 Anycast(2010+),**这条路线把"用户感受到的快"做到了极致**——而懂这条路的工程师,在每家公司都是 SRE / 网关 / 基础架构岗的硬通货。

> 一句话先记住:**LB 的核心问题是"把请求送到哪个 backend"——L4 看 IP+端口,L7 看 HTTP**;**CDN 的核心问题是"把用户送到哪个边缘节点"——靠 GSLB(智能 DNS)或 Anycast(同 IP 多地播)**。**两层调度合起来:用户 → 最近的边缘 → 命中缓存(80%+)就直接返回,没命中才回源 → 源站再用 LB 在 backend 池里挑一个**。**性能优化的第一杠杆永远是减少 RTT**——CDN 把 200ms 的跨洋 RTT 干到 10ms,就是这个杠杆的最大化。**这一篇把这两层调度的全部算法、协议、坑一次讲清**。

承接上一篇 35-Envoy:你已经知道 Envoy 怎么做 L7 代理 + xDS 动态配置 + mTLS。**这一篇把视角拉远**:从单台代理(Envoy / Nginx)拉到"几百台 LB + 几千个边缘节点"的全球流量调度。**Envoy / Nginx 是这套体系里的"L7 数据面零件"**,LVS / HAProxy 在 L4 层补位,CDN 在用户 → 源站之间再加一层缓存和调度。

---

## 一、LB 全景:四层 vs 七层

### 1.1 一图对比

```
                    用户
                     │
                     ▼
          ┌──────────────────────┐
          │    L4 LB (LVS, HAProxy TCP, DPVS)  │
          │    决策依据:IP + 端口             │
          │    不解 HTTP,纯转 TCP/UDP 字节       │
          │    100 万 QPS 单机不眨眼              │
          └──────────────────────┘
                     │
                     ▼
          ┌──────────────────────┐
          │    L7 LB (Nginx, Envoy, HAProxy HTTP) │
          │    决策依据:URL / Host / Cookie / Header │
          │    解 HTTP,能改请求 / 路由           │
          │    单机 5-10 万 QPS                    │
          └──────────────────────┘
                     │
                     ▼
                 backend 池
```

### 1.2 关键差异

| 维度 | L4 LB | L7 LB |
| --- | --- | --- |
| 决策依据 | IP + 端口 | URL / Host / Header / Cookie |
| 性能 | ~100 万 QPS | ~5-10 万 QPS |
| 延迟开销 | < 0.1 ms | 0.3-1 ms |
| 协议感知 | 无(任意 TCP/UDP) | 必须 HTTP/HTTPS/gRPC |
| TLS 终止 | 不(直接转 TCP) | 是(可以解 TLS) |
| URL 路由 | 不能 | 能 |
| 灰度 / canary | 不能 | 能(按 header / weight) |
| 健康检查 | TCP 通就算活 | HTTP 200 才算活 |
| 单机连接数 | 几百万 | 几十万 |
| 典型场景 | LB 入口、MySQL 反代 | API 网关、Web 前置 |

### 1.3 真实生产架构:两层叠加

```
互联网
  │
  ▼
[ Anycast IP ]
  │ (多个机房同时宣告同一 IP,BGP 引到最近)
  ▼
机房入口
  │
  ▼
┌─────────────────────────┐
│  L4 LB 集群(LVS DR 模式)  │     扛大流量,做基础分流
│  扛 SYN flood、CC 一级粗筛   │
└─────────┬───────────────┘
          │
          ▼
┌─────────────────────────┐
│  L7 LB 集群(Nginx / Envoy) │     做 URL 路由、TLS 终止、限流
│  按业务线分流到对应 backend     │
└─────────┬───────────────┘
          │
          ▼
   backend Pod / 实例
```

**为什么不一层就完事**:**L4 扛量但路由弱,L7 路由强但扛量弱**——大厂"L4 + L7"两层是标配。**字节 / 阿里 / 美团**的接入层基本都是这个结构。

---

## 二、L4 LB:三种模式(NAT / TUN / DR)

LVS(Linux Virtual Server,1998 年章文嵩开发,2003 进 Linux 内核)是 L4 LB 的祖宗,三种工作模式至今是教科书:

### 2.1 NAT 模式

```
client ──→ LB(改 dst IP)──→ backend
                ▲                    │
                └──── 改 src IP ─────┘  (回包必须经 LB,改回 client 的视角)

特点:
  - 配置简单
  - LB 是网关,所有进出都经过
  - 双向流量打 LB → 带宽瓶颈
  - 适合 < 10 Gbps 场景
```

### 2.2 TUN 模式(IP Tunneling)

```
client ──→ LB ──[IP-in-IP 封装]──→ backend
                                     │
                                     ▼
                              直接回 client(走自己的网关)

特点:
  - 出口流量不经过 LB(只入口)
  - LB 带宽压力小 10 倍
  - backend 要支持 IPIP 解封装(Linux 默认有)
```

### 2.3 DR 模式(Direct Routing,生产首选)

```
client ──→ LB(只改 MAC,IP 不变)──→ backend
                                       │
                                       ▼
                              直接回 client

特点:
  - LB 和 backend 同一个 L2(同交换机/VLAN)
  - 几乎零开销转发(只改一个 MAC)
  - 单机能扛 100 万 QPS+
  - backend 必须配 VIP 在 lo,且关 ARP 应答(避免抢 ARP)
```

**DR 模式的"魔法"**:client 看到的目标 IP 就是 VIP,backend 也以为自己就是 VIP——**LB 只是把 frame 的 dst MAC 改成 backend 的 MAC**,**IP 层完全不动**。

### 2.4 现代 L4 LB:DPVS / Katran / Maglev

```
LVS(传统)        基于 Linux 内核 netfilter,~1M QPS
DPVS(爱奇艺)     LVS + DPDK,绕过内核,~10M QPS
Katran(Facebook) eBPF/XDP,内核级加速 + 一致性哈希,~3M QPS
Maglev(Google)   纯软件 LB + 一致性哈希算法,跑在普通商品机器上
```

**思路一致**:**绕开 Linux 内核协议栈**(走 DPDK / XDP),**或者用 ebpf 在 XDP 层做转发决策**——详见 33 篇 eBPF/XDP/DPDK。

---

## 三、L7 LB:为什么慢但是值

### 3.1 L7 能做什么 L4 做不了

```
按 URL 分:
  /api/v1/users → user-service
  /api/v1/orders → order-service
  
按 Host 分:
  api.example.com → API 集群
  www.example.com → 静态站

按 Header 分:
  User-Agent: iPhone → mobile-backend
  X-Region: cn → 国内集群

按 Cookie 分:
  sessionid → 同一用户落同一 backend(粘性会话)

灰度:
  90% → v1
  10% → v2
  
A/B 测试:
  hash(user_id) % 100 < 5 → 实验组
```

### 3.2 L7 的代价

```
解 HTTP 头:        ~10 μs
解 TLS:            ~50 μs(session 复用)/ ~2 ms(全握手)
路由匹配:          ~5 μs
log 写入:          ~5 μs
─────────
总开销:             ~70 μs(P50)
                    ~500 μs(P99,有 GC / 缓冲冲突)
```

**比 L4 的 < 100 ns 慢 1000 倍**——但**对于业务 50ms 的请求,加个 70μs 的 LB 没人感知**。

### 3.3 L7 LB 选型

| 产品 | 强项 | 弱项 |
| --- | --- | --- |
| **Nginx** | 配置直觉、社区大、稳 | 动态性差、reload 痛 |
| **Envoy** | xDS 动态、可观测性强 | 配置复杂、学习曲线陡 |
| **HAProxy** | TCP/HTTP 都强、性能极佳 | 历史包袱、配置语法独特 |
| **Traefik** | K8s Ingress 简单 | 性能弱、生产规模少 |
| **APISIX** | 国产 OpenResty 系、插件多 | 生态相对小 |

> 经验法则:**没特殊需求选 Nginx**;**K8s + 微服务选 Envoy / Istio**;**纯 TCP LB 选 HAProxy + LVS**。

---

## 四、LB 算法地图

### 4.1 五大经典算法

#### 轮询(Round Robin)

```
请求 1 → backend A
请求 2 → backend B
请求 3 → backend C
请求 4 → backend A
...
```

**适合**:backend 同质化(配置一样、请求耗时相近)。
**不适合**:有的 backend 慢,被打死。

#### 加权轮询(Weighted Round Robin)

```nginx
upstream backend {
    server A weight=3;   # 60% 流量
    server B weight=1;   # 20%
    server C weight=1;   # 20%
}
```

**适合**:backend 配置不均(老服务器 + 新服务器混跑)。
**坑**:权重高的瞬间负载也高,要平滑(平滑加权算法)。

#### 最少连接(Least Connections)

```
LB 维护每 backend 当前活跃连接数
新请求 → 选连接数最少的那个
```

**适合**:**请求耗时差异大**——快请求快还,慢请求堆在一台,LB 自动避开。
**典型场景**:有大文件下载 + 普通 API 混跑。

#### 一致性哈希(Consistent Hashing)

```
hash(client_ip) % 范围 → 落到环上某个位置
顺时针找第一个 backend 节点
```

**详见 algorithmLearning/25 一致性哈希**。**关键性质**:**新增 / 删除一台 backend,只影响 1/N 的 key**(普通 hash 会重洗 100%)。

**应用场景**:

```
1. 缓存(同一 key 永远落同一台,缓存命中率高)
2. 粘性会话(同一用户永远落同一台,session 不丢)
3. CDN 节点选源(同一 URL 永远从同一节点回源)
```

**Maglev 算法**(Google,2016):一致性哈希的工业级改进版,**Lookup table 预计算**,转发时只查表,O(1)。

#### 随机 / 带权随机

简单粗暴,**对真随机 + 大流量等效于轮询**。Envoy 的 `RANDOM` 算法在大流量下表现接近轮询且实现极简。

### 4.2 算法对比表

| 算法 | 实现难度 | 负载均匀度 | 缓存友好 | 会话保持 | 加 / 减节点影响 |
| --- | --- | --- | --- | --- | --- |
| 轮询 | 低 | 中 | 差 | 不 | 100% 重新分布 |
| 加权轮询 | 低 | 中 | 差 | 不 | 100% 重新分布 |
| 最少连接 | 中 | 好 | 差 | 不 | 自适应 |
| 一致性哈希 | 中 | 中(虚拟节点改善) | 极好 | 是 | 1/N |
| 随机 | 极低 | 中(大流量好) | 差 | 不 | 100% |

### 4.3 用 nginx / envoy 配

```nginx
# Nginx
upstream backend {
    least_conn;          # 或 ip_hash;  hash $request_uri consistent;
    server 10.0.0.1:8080;
    server 10.0.0.2:8080;
}
```

```yaml
# Envoy
clusters:
- name: backend
  lb_policy: LEAST_REQUEST     # 或 RING_HASH / MAGLEV / ROUND_ROBIN
  ring_hash_lb_config:
    minimum_ring_size: 1024
```

---

## 五、会话保持:粘性还是分布式

### 5.1 三种实现

```
1. Source IP Hash(L4)
   优点:LB 无状态,简单
   缺点:NAT 后的客户(公司出口)全部落同一台

2. Cookie 注入(L7)
   LB 给响应加 Set-Cookie: SERVERID=A
   后续请求按 Cookie 路由
   缺点:LB 必须有状态(或 Cookie 包含 backend 信息)

3. App-Level Session Sharing(根本方案)
   把 session 放 Redis / DB,任意 backend 都能读
   完全无状态,LB 想怎么调度都行
```

### 5.2 Nginx 配 Cookie 粘性(商业版独有,开源版只能 ip_hash)

```nginx
upstream backend {
    server 10.0.0.1:8080;
    server 10.0.0.2:8080;
    sticky cookie srv_id expires=1h domain=.example.com path=/;   # NGINX Plus
}
```

开源版用 `ip_hash` 替代,但精度差。

### 5.3 实战:为什么大厂都不用粘性

```
粘性会话的根本问题:
  1. 一台 backend 挂了 → 上面的 session 全丢
  2. 扩缩容时 hash 重新分布 → 一波重新登录
  3. 跨机房灾备时 session 没法迁
  
解药:
  把 session 移出 backend → Redis / 自研 KV
  backend 完全无状态 → 任意 LB 算法
  
代价:
  每个请求多 1 次 Redis 读(~1ms)
  
但拿到了:
  无限扩缩、零停机、跨机房灾备
```

> 经验法则:**粘性会话是上世纪的技术**——所有新系统应该 stateless backend + 共享 session 存储。

---

## 六、健康检查:别让 LB 把请求扔到死人手里

### 6.1 主动 vs 被动

```
主动健康检查:
  LB 定时(如 5s)向 backend 发 GET /healthz
  连续 N 次失败 → 标记 down
  连续 M 次成功 → 标记 up
  
被动健康检查:
  统计实际请求的失败率
  达到阈值 → 标记 down(或 outlier eject)
  一段时间后再让一点点流量过去试探
```

### 6.2 主动检查的 trade-off

| 参数 | 太大 | 太小 |
| --- | --- | --- |
| 检查间隔 | 故障检测慢(分钟级) | 健康检查请求把 backend 打满 |
| 超时 | 慢响应误判健康 | 网络抖动误判挂 |
| 失败阈值 | 故障检测延迟 | 误判频繁 |

**典型生产配置**:

```
间隔 5s,超时 1s,连续失败 3 次标记 down
→ 故障检测延迟 ~15s
→ /healthz 请求 = 12 次/分钟/backend,可忽略
```

### 6.3 /healthz 应该检查什么

```
浅:
  GET /healthz → return 200
  问题:进程还在但数据库挂了,LB 看不见

深:
  GET /healthz 内部:
    1. ping DB,500ms 内通
    2. ping Redis,200ms 内通
    3. 检查内部 metric(队列堆积量 < 阈值)
  失败任一项 → 503

代价:
  健康检查本身可能引发问题(检查 DB 把 DB 打慢)
  → 主接口和健康检查接口分开,健康检查内部缓存 1s
```

### 6.4 慢启动(Slow Start)

```
backend 刚起来 / 刚 up:
  JIT 还没热、连接池还空、缓存空
  → 立刻打满 100% 流量必崩
  
慢启动:
  前 30s 流量从 0% 线性涨到 100%
  → 给系统时间预热
```

Nginx Plus 和 Envoy 都支持。**开源 Nginx 没有,要 lua 实现**。

### 6.5 异常驱逐(Outlier Detection,Envoy 独门)

```yaml
outlier_detection:
  consecutive_5xx: 5             # 连续 5 个 5xx
  interval: 10s                   # 检查间隔
  base_ejection_time: 30s         # 第一次驱逐 30s
  max_ejection_percent: 50         # 最多驱逐 50% 节点(避免雪崩)
```

**特别强**:**自动驱逐 + 自动恢复**,不需要人工介入。**驱逐时间指数级增长**(30s → 60s → 120s),反复出问题的节点关得越久。

---

## 七、CDN:把内容推到用户身边

### 7.1 为什么需要

```
没 CDN:
  用户在巴西 → 请求源站(北京)→ RTT 250ms
  100 张图 = 100 × 250ms = 25 秒首屏
  
有 CDN:
  用户在巴西 → 请求最近的 CDN 边缘(圣保罗)→ RTT 10ms
  命中缓存 → 直接返回 → 100 张图 = 1 秒
  没命中 → 边缘代回源 → 用户感知 ~RTT 25ms × 1 倍数
```

**性能优化的最大杠杆永远是 RTT**——CDN 是这个杠杆的物理化体现。

### 7.2 CDN 三件套

```
1. 边缘节点(POP, Point of Presence)
   全球部署几百-几千个机房
   每个机房有 反代 + 缓存

2. 调度系统(GSLB / Anycast)
   决定:用户请求 → 哪个 POP

3. 回源系统
   POP 没命中时怎么回源:
     直接回源(简单,源站压力大)
     层级回源(POP → 区域中心 → 源站)
     回源限流 + 鉴权
```

---

## 八、CDN 调度:GSLB DNS vs Anycast

### 8.1 GSLB(Global Server Load Balancing)

**核心**:**用 DNS 把不同地理位置的用户解析到不同 IP**。

```
user 在北京:  dig cdn.example.com → 1.1.1.1(北京边缘)
user 在巴西:  dig cdn.example.com → 2.2.2.2(圣保罗边缘)
user 在伦敦:  dig cdn.example.com → 3.3.3.3(伦敦边缘)
```

**怎么知道 user 在哪**:

```
1. 看 DNS 请求源 IP(其实是 Local DNS 的 IP)
2. 查 IP 库 → 地理位置
3. 选最近的 POP IP 返回
```

**EDNS Client Subnet (ECS)**:DNS 查询里多带一个字段告诉权威 DNS"实际客户端的 IP 段"——避免"用户在巴西,但用了美国的 8.8.8.8 DNS,结果被指到美国"。**详见 networkLearning/29-DNS 性能优化**。

### 8.2 Anycast

**核心**:**多个机房宣告同一个 IP,BGP 路由让用户走最近的**。

```
机房 A、B、C 都宣告 IP 1.1.1.1
                 │
                 ▼
                 BGP
  ┌──────────────┼──────────────┐
  ▼              ▼              ▼
beijing user → A  brazil user → B  london user → C
(routing 自动选最近的 hop)
```

**Cloudflare 全球用 Anycast**——一个 IP(如 1.1.1.1)在全球几百个节点同时宣告,**BGP 自然把流量引到最近的**。

### 8.3 两者对比

| 维度 | GSLB DNS | Anycast |
| --- | --- | --- |
| 调度依据 | IP 库 + 地理 | BGP routing |
| 切换故障节点 | 改 DNS,TTL 等待几分钟 | BGP 撤销,几秒 |
| 精度 | 受 LDNS 影响 | 物理网络精度 |
| 部署复杂度 | 中(智能 DNS) | 高(要 BGP + 自治系统号) |
| 成本 | 低 | 高 |
| 一台节点压力均衡 | 难 | 自然均衡 |

**实际**:**大厂两个都用**——GSLB 做粗粒度调度,Anycast 在每个 POP 内做精细化。

### 8.4 自己测一下 GSLB

```bash
# 在不同地区机器跑(或用 dig +subnet 模拟)
$ dig www.cloudflare.com
$ dig www.cloudflare.com @1.1.1.1 +subnet=1.1.1.1/24

# 看返回的 IP 是不是不同
```

---

## 九、CDN 缓存策略

### 9.1 Cache-Control 是命

```
源站返:
  Cache-Control: public, max-age=3600, s-maxage=86400
       │           │            │            │
       │           │            │            └─ CDN 缓存 1 天
       │           │            └─ 浏览器缓存 1 小时
       │           └─ 公共资源(任何缓存可缓存)
       └─ 缓存控制
```

| 指令 | 含义 |
| --- | --- |
| `public` | 任何缓存可缓存(浏览器 + CDN) |
| `private` | 只浏览器缓存(CDN 不缓存) |
| `no-cache` | 缓存但用前必须 revalidate |
| `no-store` | 不缓存(支付 / 隐私数据) |
| `max-age=N` | 缓存 N 秒(浏览器) |
| `s-maxage=N` | 共享缓存(CDN) N 秒 |
| `stale-while-revalidate=N` | 过期后 N 秒内仍可用旧缓存 + 异步刷新 |
| `immutable` | 永远不变(适合 hash 文件名) |

### 9.2 三类内容的缓存策略

```
静态资源(JS/CSS/图片,带 hash 文件名):
  Cache-Control: public, max-age=31536000, immutable
  → 1 年 + 永不变 → CDN 命中率接近 100%
  
动态 HTML:
  Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=60
  → 浏览器 1 分钟,CDN 5 分钟
  → 过期 1 分钟内仍能用旧的(避免穿透)
  
API:
  Cache-Control: private, no-store
  → 不缓存(每个用户数据不同)
```

### 9.3 缓存 key 怎么定义

```
默认 key = scheme + host + path + querystring

要按 cookie 区分:
  Vary: Cookie         (不推荐,缓存命中率崩)
  
要按语言区分:
  Vary: Accept-Language
  
要忽略某些 query 参数:
  Cloudflare / 阿里云的"query string white list"
```

> 经验法则:**Vary 用得越多,缓存命中率越低**——只用最必要的(`Accept-Encoding` 几乎必加)。

### 9.4 主动 purge 和预热

```
purge:
  发布新版本时,主动清掉旧 URL 的缓存
  CDN API: POST /purge {urls: [...]}
  几秒到几分钟全球生效
  
预热(prefetch):
  发布前主动访问一遍 URL → CDN 提前缓存
  避免首批用户穿透回源
```

### 9.5 回源:CDN 没命中时

```
用户 → 边缘 POP(没命中) → 回源
                              │
                     ┌────────┴────────┐
                     ▼                 ▼
              直接回源站           层级回源
              (简单)               用户 → POP → 区域中心 → 源站
                                    └─ 多个 POP 共享区域中心的缓存
                                    └─ 大幅降低源站压力
```

**回源 collapse(回源合并)**:

```
没合并:
  100 个 POP 同时穿透 → 源站收到 100 个请求
  
合并:
  100 个 POP 中第 1 个去回源
  其他 99 个等结果
  → 源站只收 1 个请求
```

---

## 十、源站保护:别让 CDN 反过来打挂你

### 10.1 回源风暴的来源

```
1. 缓存集体过期(同一时刻)
2. 攻击者构造大量 cache miss URL
3. 发布后预热没做完就开放
4. CDN 节点故障切换,新节点全 cold cache
```

### 10.2 五道防线

```
1. 回源限流
   CDN 边缘节点设回源 QPS 上限
   超过 → 用 stale 缓存(stale-while-revalidate / use_stale)
   
2. 回源鉴权
   只有 CDN 节点 IP 能直连源站
   或者 CDN 给请求签名,源站验签
   
3. 源站本地缓存(双层缓存)
   源站前再放一层 nginx + proxy_cache
   CDN 没命中 → 源站缓存命中 → 不打 backend
   
4. 自适应缓存延长
   源站压力大时,自动延长 max-age
   牺牲数据新鲜度换稳定性
   
5. 回源 collapse + cache lock
   nginx 的 proxy_cache_lock(见 34 篇)
```

### 10.3 鉴权回源:怎么防"绕过 CDN 直接打源站"

```
方案 1:IP 白名单
  源站 nginx 只允许 CDN 节点 IP 段
  CDN 厂商提供 IP 段列表
  
方案 2:Token 签名
  CDN 在请求头加 X-Cdn-Signature: HMAC-SHA256(timestamp + path, secret)
  源站验签
  
方案 3:mTLS
  CDN 节点持客户端证书,源站只接受持证客户端
  
方案 4:私网链路(BGP / 专线)
  源站只暴露在内网,CDN 通过专线访问
  最贵但最稳
```

---

## 十一、边缘计算:不只是缓存

### 11.1 Cloudflare Workers / Vercel Edge / Fastly Compute@Edge

```
传统 CDN:
  边缘节点只能 缓存 + 转发
  
边缘计算:
  边缘节点能跑代码(JS / Rust / WebAssembly)
  → 鉴权、A/B、个性化、SSR 全在边缘做
  → 完全不回源也能返回动态响应
```

**一段 Cloudflare Worker**:

```javascript
addEventListener('fetch', event => {
  event.respondWith(handle(event.request))
})

async function handle(req) {
  // 在边缘做地理判断
  const country = req.cf.country
  if (country === 'CN') {
    return Response.redirect('https://cn.example.com', 302)
  }
  
  // 边缘缓存
  const cache = caches.default
  let resp = await cache.match(req)
  if (resp) return resp
  
  // 回源
  resp = await fetch(req)
  resp = new Response(resp.body, resp)
  resp.headers.set('Cache-Control', 'max-age=300')
  event.waitUntil(cache.put(req, resp.clone()))
  return resp
}
```

**优势**:**用户 → 边缘 ~5ms,边缘上跑 V8 isolate ~1ms → 总 6ms 返回**——比"边缘 → 源站"快几十倍。

### 11.2 边缘的限制

```
CPU 时间限制:Workers 50ms / 请求(免费版 10ms)
内存:128MB
持久存储:KV(读快写慢)/ D1(SQLite at edge)
不能开 TCP socket(只能 HTTP fetch 出去)
```

**适合**:鉴权、路由、SSR、个性化、A/B、API 聚合。
**不适合**:CPU 密集(图像处理)、长连接、复杂业务。

---

## 十二、监控指标:LB 和 CDN 该看什么

### 12.1 LB 指标

| 指标 | 阈值 | 含义 |
| --- | --- | --- |
| QPS | 看历史基线 | 流量水位 |
| P50 / P99 / P999 延迟 | P99 < 100ms | 用户体验 |
| 5xx 比例 | < 0.1% | 错误率 |
| backend up 数 | == 总数 | 健康状态 |
| 连接数 | 看上限 | 是否要扩 |
| TLS 握手时间 P99 | < 100ms | session 复用是否正常 |
| upstream 连接失败 | ~0 | backend 是否健康 |

### 12.2 CDN 指标

| 指标 | 阈值 | 含义 |
| --- | --- | --- |
| 缓存命中率 | > 80%(理想 95%+) | 缓存配置是否合理 |
| 回源带宽 | < 总带宽 5% | 源站压力 |
| 回源 QPS | 远小于总 QPS | 回源风暴预警 |
| 边缘 P99 延迟 | < 50ms | 用户体验 |
| 5xx 比例 | < 0.01% | 错误率 |
| Bandwidth Saved | 越高越好 | CDN 价值体现 |

### 12.3 一个真实案例

```
现象:某 API P99 从 80ms 飙到 800ms
排查路径:
  1. 看 LB metric → 发现 backend P99 也 800ms → 锅在 backend
  2. 看 backend metric → DB 查询 P99 飙
  3. 看 DB metric → 一个慢查询打满 CPU
  4. 看 trace → 一个新业务上线带了 N+1 查询
  
关键:监控分层 → 一层一层往下推
没监控 → 瞎猜 → 修错地方
```

---

## 十三、踩坑提醒

1. **L4 LB 和 L7 LB 不分**——单纯 TCP 转发用 L4,需要 URL 路由用 L7
2. **DR 模式 backend 没绑 VIP / 没关 ARP**——VIP 在网络上"消失"
3. **NAT 模式撑大流量**——LB 入口出口双向打,~1Gbps 就崩
4. **健康检查间隔 1s**——backend 多了 health check 自己把 backend 打挂
5. **/healthz 没检查依赖**——进程在但 DB 挂,LB 还在转
6. **粘性会话上规模**——backend 重启时 session 集体丢
7. **DNS TTL 设几小时**——故障切换要等几小时,设 60s
8. **CDN 不区分 query 参数**——有 ?utm_source=xx 的 URL 重复缓存,命中率崩
9. **Cache-Control 不带 s-maxage**——CDN 用 max-age,浏览器缓存失效时 CDN 也失效
10. **回源没鉴权**——攻击者扫描出源站 IP 直接打,绕过 CDN 防护
11. **缓存集体过期**——同时间发布的资源都设 max-age=86400 → 第二天同时间集体回源
12. **CDN purge 太频繁**——每改一行就 purge 全部 → 命中率几乎 0
13. **Anycast 没考虑长连接**——BGP 路由变化时,长连接被引到别的节点,直接 RST
14. **以为 ECS 一定准**——很多 LDNS 不支持 ECS,大段 IP 用同一个解析结果
15. **边缘 Worker 里调外部 API 没缓存**——每次都往外打,边缘性能优势抵消

---

下一篇:`37-WAF与DDoS防御.md`,讲完了"怎么把流量送到对的地方",该讲"怎么把坏流量挡在门外"——**WAF 在 LB 后面做了什么**(SQL 注入 / XSS / 路径遍历的特征匹配 + 行为分析)、**OWASP ModSecurity 规则集**、**DDoS 三大类型**(SYN flood 在传输层 / UDP amp 利用反射 / CC 在应用层伪装真用户)、**防御手段从浅到深**(SYN cookie / 速率限制 / 挑战质询 / Anycast 摊平 / 大流量清洗中心)、**429 / 503 在限流时怎么用、Retry-After 是关键、Cloudflare / 阿里云 / AWS Shield 各自的玩法**——以及为什么"防 DDoS 最好的办法是有钱买 Anycast 带宽",而**钱不够的小厂只能在源站做 CC 防御**。
