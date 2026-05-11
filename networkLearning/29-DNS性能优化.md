# DNS 性能优化

「我打开 google.com,网页 100ms 就出来了——但 chrome 的 DevTools 告诉我 DNS 解析占了 80ms」——**没错,DNS 是冷启动里被低估到极致的瓶颈**。**用户感受的「慢」,80% 是延迟,延迟里 DNS 经常是第一公里**。普通业务的 DNS 解析在 50-200ms 之间,移动 4G 弱网甚至 500ms+;**这意味着你的 P99 优化做到再极致,只要 DNS 没缓存,体验就废一半**。但反过来——**只要 DNS 命中本地缓存,延迟可以压到亚毫秒级**。这一篇把 DNS 性能从「冷查询的最坏路径」拆到「亿级 QPS 的最佳实践」:**本地缓存(systemd-resolved / dnsmasq / nscd)、负缓存、`<link rel="dns-prefetch">`、Anycast 让 8.8.8.8 全球同 IP、GSLB 用 EDNS Client Subnet 选机房、CDN 用 DNS 调度,以及 dnsperf / kdig stats 怎么压测**。

> 一句话先记住:**DNS 性能的根本是「能不能命中缓存」**——浏览器 / OS / 路由器 / 递归 / 权威,五层缓存任何一层命中就赢。**冷查询无法避免时,靠 Anycast 把递归节点拉到地理上离你 5ms 的距离;权威调度靠 GSLB + EDNS Client Subnet 让 CDN 给你「最近的机房」**。**典型预算**:`gethostbyname` 缓存命中 < 1ms,本地 dnsmasq 命中 1-5ms,公共 DNS 热查询 10-30ms,冷查询 50-200ms,弱网冷查询 500ms+。**优化第一原则:能预解析就预解析,能复用就复用,绝不在关键路径上发冷 DNS**。

上一篇 28 把 DNS 安全升级讲透了,但有个反直觉事实:**加密 DNS 通常更慢**(多了 TLS 握手)。所以「安全 + 性能」永远是个对子——这一篇专攻性能。

---

## 一、DNS 是被低估的瓶颈:数字说话

### 1.1 一次冷启动的时序拆解

```
用户敲 enter:
  T0 ────────────────────────────────────  浏览器开始处理
        │
  T0+5ms ── HSTS preload 检查(瞬时,内存查表)
        │
  T0+5ms ── DNS 查询开始
        │ ↓ 浏览器 DNS 缓存:miss
        │ ↓ OS stub resolver 缓存:miss
        │ ↓ 路由器缓存:miss
        │ ↓ 递归服务器(8.8.8.8)冷查询:50-150ms
        │
  T0+150ms ── DNS 解析完成,拿到 IP
        │
  T0+150ms ── TCP 三次握手:1 RTT(30ms)
  T0+180ms ── 握手完成
        │
  T0+180ms ── TLS 1.3 握手:1 RTT(30ms)
  T0+210ms ── TLS 完成
        │
  T0+210ms ── HTTP 请求发出
  T0+240ms ── 首字节回来(TTFB)
        │
  T0+500ms ── 首屏渲染
```

**「白屏阶段」总共 500ms,DNS 占了 150ms——30%**。

### 1.2 为什么这么慢

```
浏览器 → OS:        系统调用,~10μs
OS → 路由器:        局域网 RTT,1-5ms
路由器 → 递归:      ISP 边缘 → 公共 DNS,5-50ms
递归 → 根:          全球任意,5-100ms
递归 → TLD:         5-100ms
递归 → 权威:        5-100ms

如果递归没缓存,4 跳叠加,轻松 100ms+
```

### 1.3 移动场景更惨

```
4G 弱网:
  无线接入 + LTE 调度:30-80ms
  + 运营商 NAT:5-10ms
  + DNS 查询本身:30-100ms
  ─────────────────────────
  实际 DNS 解析:80-200ms

国际访问:
  跨境光缆:100-200ms
  权威服务器在国外:再加一倍

极端情况:首次访问 = 500ms+ 的 DNS,白屏体感「卡死了」
```

> 经验法则:**在移动场景,DNS 是 P99 抖动最大的来源之一**——比 TCP/TLS 还坑,因为 DNS 没有 keep-alive 概念。

---

## 二、本地缓存:第一道防线

### 2.1 三种本地缓存方案对比

| 方案 | 适用 | 特点 |
| --- | --- | --- |
| **nscd** (Name Service Cache Daemon) | 老 Linux | glibc 自带的「全功能」缓存,缓存 hosts/passwd/group |
| **systemd-resolved** | 现代 Linux(Ubuntu 18+) | 默认就在,支持 DoT,集成 NetworkManager |
| **dnsmasq** | 路由器 / 容器 | 小巧,配置灵活,常用作内网 DNS 转发 |
| **Unbound / BIND** | 重度环境 | 功能最全,但配置复杂 |

### 2.2 systemd-resolved:Ubuntu 默认

```bash
# 看状态
systemd-resolve --status        # 旧版本
resolvectl status               # 新版本(systemd 239+)

# 看缓存统计
resolvectl statistics
```

输出:

```
DNSSEC supported by current servers: no
Transactions
Current Transactions: 0
  Total Transactions: 1234

Cache
  Current Cache Size: 89
  Cache Hits: 856
  Cache Misses: 378
  ↑ 命中率 856/(856+378) = 69%
```

**配缓存大小**(默认 4096 条):

```ini
# /etc/systemd/resolved.conf
[Resolve]
DNS=1.1.1.1#cloudflare-dns.com
DNSOverTLS=yes
Cache=yes
CacheFromLocalhost=no
```

`/etc/resolv.conf` 默认指向 `127.0.0.53`(systemd-resolved 的本地 stub):

```
nameserver 127.0.0.53
options edns0 trust-ad
```

### 2.3 dnsmasq:轻量灵活

经典使用场景:**家庭路由器 / 容器内**。

```bash
# 安装
sudo apt install dnsmasq

# /etc/dnsmasq.conf
listen-address=127.0.0.1
cache-size=10000             # 缓存 10000 条
neg-ttl=60                   # 负缓存 60 秒
no-resolv                    # 不读 /etc/resolv.conf
server=1.1.1.1               # 上游 DNS
server=8.8.8.8

# 启动
sudo systemctl restart dnsmasq

# 把 /etc/resolv.conf 指向本地
echo "nameserver 127.0.0.1" | sudo tee /etc/resolv.conf
```

**dnsmasq 优势**:配置一行就生效,**还能拦截广告域名**(配 `address=/.doubleclick.net/0.0.0.0`)。

### 2.4 nscd:别用

**glibc 自带 nscd 已经被多数发行版淘汰**,因为:

- 缓存策略奇怪(默认 TTL 写死)
- 容易跟 NSS 模块冲突
- 在 musl(Alpine)下根本没有

> 现代生产用 systemd-resolved 或 dnsmasq;**永远别再上 nscd 了**。

### 2.5 缓存命中率怎么提升

```
1. 加大缓存条数
   systemd-resolved 默认 4096,业务密集可调到 65536
   
2. 调上游 DNS 的 TTL
   你管不了别人的 TTL,但能给自家域设长 TTL(1h+)
   
3. 启用负缓存
   NXDOMAIN 也缓存 60 秒,避免反复打权威
   
4. 短 TTL 的记录单独优化
   CDN 域名 TTL 30 秒,刷新快但命中率低
   非关键域名(图标、CDN 静态)可以人工调长
```

---

## 三、负缓存:经常被忽略的优化

### 3.1 什么是负缓存

**Negative Caching(RFC 2308)**:**NXDOMAIN 和空 Answer 也要缓存**——否则错误域名会反复打到根服务器。

```
没有负缓存:
  应用查 nonexist.example.com
  → 递归服务器没缓存 → 一路到权威 → NXDOMAIN
  应用马上又查同一个错误域名
  → 又一路到权威 → NXDOMAIN
  → 1 秒内反复打 100 次,被运维拉黑
  
有负缓存:
  第一次 NXDOMAIN,缓存 60 秒
  后续 60 秒内的查询直接返回 NXDOMAIN,~0ms
```

### 3.2 负缓存 TTL 由谁定

**SOA 记录的 minimum 字段**:

```bash
$ dig SOA example.com +short
sns.dns.icann.org. noc.dns.icann.org. 2024010100 7200 3600 1209600 3600
                                                                    ↑
                                                               minimum (3600s)
```

意思:`*.example.com` 不存在的查询,递归服务器最多缓存 3600 秒。

### 3.3 实战:观察 dig 的负缓存

第一次查不存在的域名:

```bash
$ dig nonexist.example.com
;; Query time: 56 msec
;; status: NXDOMAIN
```

紧接着第二次:

```bash
$ dig nonexist.example.com
;; Query time: 0 msec    ← 走了递归的负缓存,瞬间返回
;; status: NXDOMAIN
```

> 很多 monitoring 工具(prometheus / nagios)漏配了「服务名解析」,会反复查不存在的域名——开了负缓存这部分压力直接消失。

---

## 四、DNS 预热:HTML 一行加速

### 4.1 dns-prefetch

```html
<head>
  <link rel="dns-prefetch" href="//cdn.example.com">
  <link rel="dns-prefetch" href="//api.example.com">
  <link rel="dns-prefetch" href="//assets.example.com">
</head>
```

**浏览器看到这个标签后,在解析 HTML 时就异步发 DNS 查询**,等到真正发 fetch 时,DNS 已经解过了。

**省的就是冷启动那几十毫秒**——对一个有 5 个域的网页,串行查 5 次 DNS 可能 200ms,prefetch 一下变 50ms。

### 4.2 preconnect:更激进

```html
<link rel="preconnect" href="https://api.example.com">
```

**不只 DNS,还提前建 TCP+TLS 连接**——发请求时直接复用连接。**省 DNS + 1 RTT TCP + 1-2 RTT TLS,合计能省 100-300ms**。

```html
<link rel="dns-prefetch" href="//api.example.com">     <!-- 省 DNS -->
<link rel="preconnect"   href="https://api.example.com"> <!-- 省 DNS+TCP+TLS -->
```

**preconnect 比 dns-prefetch 强大但更贵**——会占用 socket / 文件描述符,**别预连不会用的**(浏览器 5 秒内不用就丢)。

### 4.3 实测:PerformanceObserver

```javascript
const observer = new PerformanceObserver((list) => {
  list.getEntries().forEach((entry) => {
    if (entry.entryType === 'navigation' || entry.entryType === 'resource') {
      console.log(entry.name);
      console.log('  DNS:', entry.domainLookupEnd - entry.domainLookupStart, 'ms');
      console.log('  TCP:', entry.connectEnd - entry.connectStart, 'ms');
      console.log('  TLS:', entry.connectEnd - entry.secureConnectionStart, 'ms');
    }
  });
});
observer.observe({ entryTypes: ['navigation', 'resource'] });
```

**Chrome DevTools → Network → Timing 面板就直接看**——`DNS Lookup` 这一行就是。

---

## 五、Anycast:8.8.8.8 全球同 IP

### 5.1 什么是 Anycast

**单 IP,多台机器在全球同时声明这个 IP**——BGP 路由让用户的包**走到地理上最近的那台**。

```
8.8.8.8 在全球至少有 100+ 节点,都用同一个 IP

我在北京 →     8.8.8.8(实际是北京节点)→ ~10ms
我在伦敦 →     8.8.8.8(实际是伦敦节点)→ ~5ms
我在纽约 →     8.8.8.8(实际是纽约节点)→ ~3ms
```

**用户视角**:`dig @8.8.8.8 ...` 永远 5-30ms,不管在地球哪里。

### 5.2 用 traceroute 验证

```bash
# 在北京
traceroute 8.8.8.8
# 几跳就到 Google 的边缘

# 在巴黎
traceroute 8.8.8.8
# 也是几跳就到,但路径完全不同(走的是法国节点)
```

**13 组根服务器全部用 Anycast**——每组背后是几百台机器分布全球。**没有 Anycast,DNS 根本撑不住**。

### 5.3 自己起 Anycast 难不难

**很难,需要 BGP / AS 号 / 多机房**:

```
1. 申请自治系统号(ASN)
2. 在多个 PoP 部署服务器
3. 每个 PoP 用 BGP 宣告同一个 IP 段
4. 上游运营商接受你的 BGP 路由
```

**普通业务用 CDN 厂商的 Anycast 即可**——Cloudflare / AWS Route 53 / 阿里云 Anycast 都开箱即用。

> 经验法则:**Anycast 是公网延迟的「物理定律」破解器**——不靠它,跨国延迟天然 100ms+,无法降。

---

## 六、GSLB:基于 EDNS Client Subnet 的精准调度

### 6.1 GSLB 是什么

**Global Server Load Balancing**——**根据用户位置,DNS 返回不同的 IP**。这样 CDN / 多机房业务可以让用户访问就近机房。

```
张三在北京查 cdn.example.com → 返回 北京 CDN 节点 IP
李四在上海查 cdn.example.com → 返回 上海 CDN 节点 IP
王五在新加坡查 cdn.example.com → 返回 新加坡 CDN 节点 IP
```

### 6.2 但权威服务器看不到「真实用户 IP」

**普通 DNS 流程**:

```
用户(北京)→ 递归服务器(可能在上海,因为用 8.8.8.8)→ 权威服务器
                                                            ↑
                                          权威看到的源 IP 是「上海的递归」
                                          → 误以为用户在上海 → 返回上海节点
                                          → 实际用户在北京,绕远了
```

**这就是「公共 DNS 调度不准」的根本原因**——递归服务器的位置不等于用户位置。

### 6.3 EDNS Client Subnet (ECS) 救场

**RFC 7871**:递归服务器把**用户的 IP 网段**(如 `1.2.3.0/24`,精度可调)塞进 EDNS0 OPT 记录,转发给权威。

```
用户(北京 1.2.3.4)→ 8.8.8.8(上海)
                       ↓ 加 ECS: 1.2.3.0/24
                     权威服务器
                       ↓ 看到「用户在 1.2.3.0/24 段」
                       ↓ GSLB 数据库:这段在北京
                     返回北京节点 IP
```

**精度通常 /24**——既能定位到城市级,又不至于泄露具体用户 IP。

### 6.4 怎么看 ECS 是否生效

```bash
dig @8.8.8.8 +subnet=1.2.3.0/24 www.example.com

;; OPT PSEUDOSECTION:
; EDNS: version: 0, flags:; udp: 512
; CLIENT-SUBNET: 1.2.3.0/24/0
```

**返回里有 CLIENT-SUBNET 字段就说明权威支持 ECS**。

```bash
# 测试不同地区调度
dig @8.8.8.8 +subnet=58.32.0.0/24 www.cdn-example.com    # 上海联通
dig @8.8.8.8 +subnet=114.247.0.0/24 www.cdn-example.com  # 北京联通
# 看返回 IP 是不是变了
```

### 6.5 ECS 的隐私争议

**Cloudflare 1.1.1.1 默认不发送 ECS** —— 因为它是隐私优先,不愿把用户 IP 网段泄露给权威。**Google 8.8.8.8 默认开 ECS** —— 调度准但隐私差。

**结果**:**用 1.1.1.1 的用户,CDN 调度可能不准**(全国都给同一个 IP);**用 8.8.8.8 的用户调度更准但隐私漏一点**。

> 经验法则:**国内业务用 8.8.8.8 / 114 / 阿里 DNS 调度准**;**注重隐私优先用 1.1.1.1,性能上能接受小损失**。

---

## 七、CDN 怎么用 DNS 做调度

### 7.1 经典 CNAME 链

```
用户访问 www.example.com
   ↓ DNS 查询
www.example.com   CNAME   example.com.cdn-vendor.com
                            ↓ 又一次 DNS
example.com.cdn-vendor.com  CNAME  beijing-edge-3.cdn-vendor.com
                                       ↓
beijing-edge-3.cdn-vendor.com  A   1.2.3.4
```

**一个 HTTP 请求触发 2-3 次 DNS 查询**——每个 CNAME 都要再查。**每多一层 CNAME 加 30-60ms**。

### 7.2 CDN 的 DNS 服务器内部魔法

CDN 厂商的权威 DNS 是定制软件(不是 BIND),**核心算法**:

```
1. 接收查询,看 ECS / 源 IP 推断用户位置
2. 查实时机房健康表(哪些节点 OK,哪些挂了)
3. 查全网负载均衡表(哪个节点压力低)
4. 查链路质量数据库(哪个节点对这个用户网络好)
5. 综合这些维度,算出最佳节点
6. 返回 A 记录,TTL 通常 30-60 秒(便于切流)
```

**这套 DNS 一秒能算几百万次决策**——这是 CDN 的核心壁垒之一。

### 7.3 短 TTL 的代价

```
CDN 域名 TTL = 30 秒
     ↓
每个用户每 30 秒就重新查一次 DNS
     ↓
DNS 命中率低,递归服务器和权威都更忙
     ↓
用户冷查询频率高,首屏 DNS 时间贡献大
```

**所以 CDN 既要短 TTL(快速切流)又怕短 TTL(增加查询量)**——**新一代用 HTTPS / SVCB 记录**,把多个 IP hint 一次性返回,客户端可以预连多个,减少 DNS 依赖。

### 7.4 HTTPS / SVCB:CDN 的下一代

```bash
$ dig +short HTTPS cloudflare.com
1 . alpn="h3,h2" ipv4hint=104.16.132.229,104.16.133.229 ipv6hint=2606:4700::6810:84e5
```

一次查询拿到:
- ALPN(支持 h3 / h2)
- 多个 IPv4 / IPv6 hint
- 端口

**浏览器拿到后可以直接尝试 HTTP/3,无需先 ALPN 协商,无需再查 A/AAAA**——**省 1-2 RTT**。

---

## 八、DNS 解析失败的典型路径

### 8.1 三种失败状态

| 失败类型 | RCODE | 含义 | 典型原因 |
| --- | --- | --- | --- |
| **超时** | (无响应) | 包丢了 | 网络抖动 / 防火墙挡 / 上游挂 |
| **SERVFAIL** | 2 | 服务器内部错 | DNSSEC 校验失败 / 上游超时 / 配置错 |
| **NXDOMAIN** | 3 | 域名不存在 | 拼错 / 域名过期 / 还没生效 |

### 8.2 超时:最常见

**默认超时**:Linux glibc 5 秒,resolv.conf 可调:

```
options timeout:2 attempts:2 rotate
```

`timeout:2` = 2 秒超时,`attempts:2` = 重试 2 次,**总等待最坏 4 秒**——这就是「网卡时网页全部白屏」的常见原因。

```
options timeout:1 attempts:3 rotate
```

**调到 1 秒超时,3 次重试,总等待 3 秒,体验更好**。

### 8.3 SERVFAIL:中间环节坏了

**典型场景**:

```
1. DNSSEC 签名过期 → 验签失败 → SERVFAIL
2. 权威服务器全挂 → 递归一直拿不到答案 → SERVFAIL
3. 递归服务器自己 OOM / 满载 → SERVFAIL
4. 上游网络丢包率 100% → 触发递归服务器自我保护,SERVFAIL 几分钟
```

**排障**:

```bash
dig @8.8.8.8 example.com    # 用公共 DNS 试,看是不是本地递归坏了
dig +trace example.com      # 追完整路径,看哪一跳出错
```

### 8.4 NXDOMAIN:域名问题

**容易混淆的几个状态**:

```
真 NXDOMAIN:        域名整个不存在
NOERROR + 空 Answer: 域名存在但没对应 type 的记录(查 AAAA 但只有 A)
SERVFAIL:           别误判成「域名不存在」,是查询失败
```

**如何区分「域名真的不存在」 vs 「DNS 没配 AAAA」**:

```bash
$ dig AAAA example.com +short          # 啥都没输出
$ dig A example.com +short             # 输出了 IP
# → 说明域名存在,只是没配 IPv6
```

### 8.5 系统级排障流程

```
应用反馈「连不上 example.com」
    ↓
1. dig +short example.com    → 看能不能解析,看 RCODE
2. dig +trace example.com    → 看是哪一跳出错
3. dig @8.8.8.8 example.com → 换上游,看是不是本地递归问题
4. ping example.com          → 解析后 IP 通不通
5. tcpdump port 53           → 看实际包走哪了
```

---

## 九、benchmark 工具

### 9.1 dnsperf:工业级压测

```bash
# 安装
sudo apt install dnsperf

# 准备 query 列表(每行 域名 + type)
cat > queries.txt << 'EOF'
www.google.com A
www.facebook.com A
www.amazon.com A
www.apple.com A
www.microsoft.com A
EOF

# 压测 60 秒,目标 1000 QPS
dnsperf -s 1.1.1.1 -d queries.txt -l 60 -Q 1000
```

输出:

```
Statistics:
  Queries sent:         60000
  Queries completed:    59987 (99.98%)
  Queries lost:         13 (0.02%)
  
  Response codes:       NOERROR 59987 (100.00%)
  Average packet size:  request 35, response 71
  Run time (s):         60.000
  Queries per second:   999.78

  Average Latency (s):  0.012345 (min 0.001, max 0.234)
  Latency StdDev (s):   0.003456
```

**关注三件事**:**Queries lost**(丢包率)、**Average Latency**(平均延迟)、**P99 / max**(尾延迟)。

### 9.2 kdig stats:轻量单点测试

```bash
kdig www.google.com @1.1.1.1 +stats

;; Received 59 B (after 18 ms)
;; QUERY TIME: 18.4 ms
;; FROM: 1.1.1.1@53(UDP)
;; WHEN: ...
```

**适合「快速看一下某个 DNS 的响应时间」**——不需要批量。

### 9.3 dnsdist:观察生产 DNS

如果你自己跑递归 DNS,**dnsdist** 是个 DNS 流量观察 + 负载均衡器:

```
# 实时统计
$ dnsdist -c
> showResponseLatency()
0.5 ms ...........................
1   ms ........................................
2   ms ..............................
5   ms ........
10  ms .....
50  ms .
> topQueries(10)
```

### 9.4 性能基线该是多少

```
本机 dnsmasq 缓存命中:        < 1ms
本机 systemd-resolved 命中:   < 1ms
LAN 内 DNS 缓存命中:          1-5ms
8.8.8.8 / 1.1.1.1 热查询:    10-30ms
8.8.8.8 / 1.1.1.1 冷查询:    30-80ms
权威服务器(Anycast):         5-30ms
权威服务器(单点):             30-200ms (跨国能到 500ms+)

DNSSEC 全开 + DoT:           各项 +20-50ms
```

**P99 超过 100ms 就该警报了** ——尤其是入口业务。

---

## 十、生产环境的 DNS 调优清单

### 10.1 客户端侧(应用 / 容器)

```
1. /etc/resolv.conf 调超时
   options timeout:1 attempts:2 rotate

2. 本地起 dnsmasq / systemd-resolved 做缓存
   把 /etc/resolv.conf 指 127.0.0.1

3. 应用层连接池复用,减少 DNS 查询频次
   HTTP keep-alive、gRPC 连接复用

4. 关键服务用 IP 直连(短期)+ DNS hostname (HostHeader)
   小心证书要支持 IP SAN
```

### 10.2 服务侧(权威 DNS)

```
1. 用 CDN / Anycast 提供权威 DNS
   Cloudflare / Route 53 / 阿里云 DNS

2. TTL 分类设置
   核心域名 1h+,CDN 域名 30s,根 NS 几天

3. 开启 EDNS0(默认就开)
   配 udp_payload_size = 4096

4. 健康检查 + 自动切换
   GSLB 探测后端,自动剔除挂掉的 IP

5. 关键业务双活权威
   ns1.foo.com 在 AWS,ns2.foo.com 在 Cloudflare
   防止单一 DNS 厂商挂掉(Dyn 2016 事件)
```

### 10.3 监控指标

```
QPS:           DNS 查询每秒数
缓存命中率:     越高越好(80%+)
平均延迟:       < 30ms
P99 延迟:      < 100ms
SERVFAIL 比例: < 0.1%
NXDOMAIN 比例: 看业务,异常突增可能是攻击或配置错
```

### 10.4 容器场景的特殊坑

```
Docker / K8s 默认 DNS = 集群内 CoreDNS
CoreDNS 配置错 / 满载 → 全集群解析失败

K8s ndots:5 默认值 → 集群内 service.namespace.svc.cluster.local 短名查询
                    每次都查 5 次才到外网域名,慢一倍
                    
解决:
  Pod spec 加 dnsConfig: { options: [{name: ndots, value: "2"}] }
  或全 cluster 改 CoreDNS 默认 ndots
```

**这是 K8s 老坑** ——很多业务上 K8s 后 DNS 慢了,根本原因就在 ndots:5。

---

## 十一、踩坑清单

1. **以为 DNS 不是瓶颈**——P99 抖动里它经常占大头
2. **没本地缓存**——Java 默认 networkaddress.cache.ttl=-1,JVM 永久缓存(反过来更坑)
3. **不开负缓存**——错误域名反复打权威
4. **TTL 永远设 1**——CDN 切流快,但 DNS 服务器被你打爆
5. **CNAME 套 5 层以上**——每层 30ms,总解析时间爆炸
6. **K8s ndots:5 没改**——集群内每次查询多 4 次无效查
7. **公共 DNS 用 1.1.1.1 调度不准**——CDN 给的 IP 不是最近机房
8. **glibc 默认 5 秒超时**——网络抖动时整页白屏 5 秒
9. **DNSSEC 没准备好就开**——签名过期全域 SERVFAIL
10. **只配一组 NS**——主 DNS 厂商挂 → 域名全网解不出来,2016 Dyn 事件全网瘫
11. **dnsmasq 没设 cache-size**——默认 150 太小,高频业务命中率差
12. **`<link rel=preconnect>` 滥用**——预连了用不上的域,浪费 socket 反而更慢

---

## 十二、关键 RFC

| RFC | 内容 |
| --- | --- |
| RFC 2308 | 负缓存 |
| RFC 7871 | EDNS Client Subnet |
| RFC 6891 | EDNS0 |
| RFC 8484 | DoH |
| RFC 9460 | SVCB / HTTPS 记录 |
| RFC 8499 | DNS 术语澄清 |

---

## 十三、本章 Checklist

| 项 | 说明 |
| --- | --- |
| 知道一次冷 DNS 50-200ms,能拆出每段耗时 | 心智 |
| 会配 systemd-resolved 或 dnsmasq | 实操 |
| 知道 dns-prefetch 和 preconnect 的差别 | Web 优化 |
| 知道 Anycast 让 8.8.8.8 全球同 IP 的原理 | 公网延迟基础 |
| 理解 EDNS Client Subnet 怎么救 GSLB | CDN 调度 |
| 会用 dnsperf / kdig stats 测 DNS 性能 | 压测能力 |
| 能区分 timeout / SERVFAIL / NXDOMAIN | 排障 |
| 知道 K8s 的 ndots:5 坑 | 容器特定 |

---

## 十四、小结

DNS 性能这一章核心思路:

1. **DNS 是冷启动的隐形税**——P99 / 首屏白屏 / 移动弱网,都跟它有关
2. **缓存是终极武器**——五层缓存任何一层命中就赢,本地缓存能省 99% 的延迟
3. **Anycast + GSLB + ECS 三件套**——让公网 DNS 既快又准
4. **预解析 / 预连接是免费的优化**——`<link rel="dns-prefetch">` 一行能省 50ms+
5. **测要用 dnsperf,排障靠 dig +trace**——基线和工具一起准备好
6. **加密 DNS 和性能的取舍**——DoT/DoH 慢一个 RTT,但隐私值得

**全系列三章 27-29 的链路串起来**:

```
27 章:DNS 协议本身——分层 / 报文 / 缓存的工作机制
28 章:加密 + 验真——DoT / DoH / DNSSEC 解决安全问题
29 章:性能优化——本地缓存 / 预解析 / Anycast / GSLB
```

DNS 这套 40 多年的协议,**简单到任何人能实现一个,复杂到全球部署仍在演化**。**它支撑了今天每秒几十万亿次查询,而你每打开一个网页都默默享受这个奇迹**。

---

下一篇正式进入第七层:**Linux 内核网络**。从 `30-socket编程.md` 开讲——**「我写 `socket() / bind() / listen() / accept()` 这一串调用,内核做了什么」**:**BSD socket API 设计 50 年了为什么还能扛**、**socket 选项的 30 个常用 flag**(`SO_REUSEADDR` / `SO_REUSEPORT` / `TCP_NODELAY` / `TCP_CORK` / `SO_KEEPALIVE`)、**半关闭 vs 全关闭**(`shutdown()` 跟 `close()` 的差别)、**`SO_REUSEPORT` 怎么让单端口被多进程绑(Nginx / Envoy 的多进程秘密)**。**socket 是网络编程的基本盘**——所有上层框架(Netty / asyncio / gRPC)最终都落到 socket 系统调用上。
