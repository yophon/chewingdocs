# WAF 与 DDoS 防御

CDN 调度把"正常流量"分发到边缘——但**互联网上 30% 以上的流量是恶意的**:扫描、爬虫、撞库、CC、DDoS。一个未做防御的源站,公网 IP 暴露 24 小时内必被扫,72 小时内必被打。**WAF 和 DDoS 防御是源站活下去的护城河**——不是"上线之后再做",而是"上线之前必须做"。

> 一句话先记住:**DDoS 拼带宽 + 算力,WAF 拼规则 + 行为**。容量型攻击(SYN/UDP Flood、反射放大)只能在**链路上游**清洗——你自己机房带宽 10Gbps,被打 100Gbps 时光纤直接堵死,iptables 再快也救不了。**所以现代防御链是分层的**:运营商清洗(T级)→ Anycast/CDN(百G级)→ 自建 iptables/eBPF/XDP(十G级)→ 应用层限流(单机级)。**WAF 是这条链最末端**——专治应用层攻击(SQL 注入、CC、Bot),拦的是"带语义的恶意",不是"洪水"。

---

## 一、DDoS 的三大类:容量型 / 协议型 / 应用型

新手最大的误解是把"DDoS"当一种攻击——**它是几十种攻击的统称**,防御手段完全不同。按"打哪一层"分三类:

```
攻击类型              打的资源            典型流量          防御层
─────────────────────────────────────────────────────────────
容量型(Volumetric)   带宽 / 链路        100Gbps - 数Tbps  必须上游清洗
  UDP Flood
  ICMP Flood
  反射放大(NTP/DNS/Memcached)

协议型(Protocol)     状态表 / 半连接队列 几Mbps-几Gbps     iptables / 内核
  SYN Flood
  ACK Flood
  TCP 连接耗尽
  Slowloris(慢攻击)

应用型(Application)  CPU / DB / 后端    几百-几千 RPS     WAF / 限流
  HTTP CC 攻击
  慢 POST
  恶意爬虫
  接口刷量(刷验证码 / 注册)
```

**判断哪类的最快办法**:看流量的 **单位**。

- 报告"打了 500Gbps" → 容量型,你机房根本扛不住,只能找运营商或上 CDN
- 报告"半连接队列爆了" → 协议型 SYN Flood,sysctl + syncookies 救
- 报告"QPS 突然涨到平时 100 倍但带宽不大" → 应用型 CC 攻击,WAF + 限流救

---

## 二、容量型:SYN Flood 与反射放大

### 2.1 SYN Flood:最经典的协议型(其实跨容量型)

TCP 三次握手原理决定了一个根本缺陷:**服务端在收到 SYN 后必须保留半连接状态**(SYN_RECV),等客户端的 ACK。如果攻击方只发 SYN 不发 ACK,服务端的半连接队列会被填满,**正常 SYN 进不来**。

```
正常握手:
  Client ── SYN ────────► Server   [半连接队列 +1]
  Client ◄── SYN+ACK ──── Server
  Client ── ACK ────────► Server   [半连接 → 全连接]

SYN Flood:
  攻击者 ── SYN ────────► Server   [+1]
  攻击者 ── SYN ────────► Server   [+2]
  攻击者 ── SYN ────────► Server   [+3]
  ... (源 IP 全是伪造的,SYN+ACK 发出去无人回)
  攻击者 ── SYN ────────► Server   [队列满,丢]
  
  正常用户 ── SYN ─────► Server   [×丢弃,连不上]
```

**关键数据**:Linux 默认 `net.ipv4.tcp_max_syn_backlog=128`——攻击方一秒打几千 SYN 就能撑爆。

**防御四件套**(全在 sysctl):

```bash
# 加大半连接队列(几千到几万)
net.ipv4.tcp_max_syn_backlog=8192

# 减少 SYN+ACK 重传次数(默认 5 次,共 31s,太长)
net.ipv4.tcp_synack_retries=2

# 开启 SYN Cookies——彻底解决:不分配半连接表项,
# 把状态信息编码进 SYN+ACK 的 seq 号,客户端 ACK 回来再校验
net.ipv4.tcp_syncookies=1

# 减少 FIN_WAIT 时间,防止连接耗尽
net.ipv4.tcp_fin_timeout=15
```

**SYN Cookies 的精髓**——**用算力换内存**:

```
不开 SYN Cookies:  每个 SYN 占 ~256 字节内存 → 100k SYN = 25MB 半连接表
开 SYN Cookies:    SYN 不占内存,但每次 ACK 要算 hash 校验
                   攻击者发 ACK Flood 反过来打 CPU
```

> 所以**不要全程开 SYN Cookies**——内核默认是"队列要满才启用",这是平衡。

### 2.2 反射放大攻击:互联网最毒的设计缺陷

**原理**:找一种 UDP 协议,**请求小、响应大**,且**不验证源 IP**。攻击者伪造受害者 IP 发请求,响应全打到受害者。

经典放大倍数(请求 / 响应):

```
协议            放大倍数      说明
────────────────────────────────────────
DNS(开放递归)  ~50x        ANY 查询返回大量记录
NTP(monlist)   ~556x       一条 monlist 命令返回最多 600 条 IP
Memcached       ~50000x     UDP 缺省开放,STATS 返回巨量数据
SSDP            ~30x        UPnP 设备
LDAP            ~50x

(2018 年 GitHub 1.35Tbps 攻击 = Memcached 反射放大,攻击者只发了几 Gbps)
```

**ASCII 攻击路径**:

```
                 ┌──── 伪造源IP=Victim 的 UDP ────┐
                 │     (10字节请求)                │
                 ▼                                  │
       Attacker(肉鸡群) ◄────────────────────  反射服务器(开放 NTP/DNS/Memcached)
                                                    │ 巨大响应
                                                    │ (5KB)
                                                    ▼
                                                Victim ── 链路打爆

特征:
  Victim 收到大量 UDP 包,源 IP 全是合法的"反射器"(无法封)
  攻击者本人 0 流量进出
  追溯极难
```

**防御**(注意:**反射攻击的根本防御不在受害者,而在反射器的所有者**):

```
受害者侧:
  - 上 CDN/Anycast,把流量"摊薄"到几十个 PoP
  - 找上游 ISP 做"目的 IP 黑洞路由"(Blackhole)——把打你的流量在骨干网丢
  - iptables 直接 drop UDP(若你不用 UDP)
    iptables -I INPUT -p udp -j DROP

反射器所有者侧(社会责任):
  - 关闭 NTP monlist:disable monitor
  - 关闭开放 DNS 递归:只服务自己用户
  - Memcached 必须 bind 127.0.0.1 + 加防火墙
  - BCP 38(uRPF):ISP 在边界检查源 IP,伪造的包直接丢
```

> 经验法则:**所有跑在公网的 UDP 服务,默认就是被滥用的反射器候选**——除非你显式做了源 IP 校验或鉴权。

---

## 三、应用型:CC 攻击与慢攻击

### 3.1 CC(Challenge Collapsar)攻击

CC 起源是早期"挑战黑洞"产品被绕过——攻击者**用真实 HTTP 请求**打你的动态接口,流量小但**每个请求都会触发数据库查询**。

```
特征:
  - 请求看起来"完全合法":有 UA、有 Cookie、有 Referer
  - 通常打 /search?q=xxx /api/list 这种重接口
  - 1000 RPS 就能让数据库 CPU 100%
  - 带宽利用极低(10Mbps),传统流量监控发现不了

为什么难防:
  攻击包和正常包在 IP 层 / TCP 层完全一样
  必须看到 HTTP 层(应用层)才能识别
  → 必须在 7 层防御
```

**防御链**:

```
1. 速率限制(每 IP / 每 token / 每接口)
   nginx limit_req_zone
   
2. 行为分析
   "这个 IP 5 秒打 1000 次 /search"——正常用户不可能
   
3. 挑战式验证
   可疑流量 302 跳到 /captcha,过了才放行

4. 指纹识别
   正常浏览器有 TLS JA3 指纹、HTTP/2 SETTINGS 指纹
   攻击工具的指纹和真实浏览器不同 → 直接拦
```

详见本章第七节 WAF + 引用 algorithmLearning/24 限流算法(令牌桶 / 漏桶 / 滑动窗口)。

### 3.2 Slowloris:用 1 个 IP 打死服务器

2009 年 Robert Hansen 发布,核心思路反直觉:**攻击不是"快",是"慢"**。

```
原理:
  1. 跟服务器建立 TCP + HTTP 连接
  2. 发 GET / HTTP/1.1\r\n
  3. 然后每隔 10 秒发 1 个无意义 header:
        X-a: 1\r\n
  4. 永远不发完整的请求(永远不发空行)
  5. 服务器一直等,连接挂死
  
  开几千个这样的连接 → 把服务器的 worker 全占住
  Apache prefork 模式 256 worker,几千 IP 就打死
```

**为什么 Apache 倒了 Nginx 没事**:

```
Apache prefork:每连接一个进程,250 个进程上限 → Slowloris 杀手
Apache worker / event:线程,扛得住一些
Nginx event-driven:一个进程几万连接,Slowloris 影响小但不是免疫
```

**防御**:

```nginx
# 客户端发送请求体的最长时间
client_body_timeout 10s;

# 客户端发送请求头的最长时间
client_header_timeout 10s;

# 一次请求允许的最长时间
send_timeout 10s;

# 单 IP 并发连接数限制
limit_conn_zone $binary_remote_addr zone=conn_per_ip:10m;
limit_conn conn_per_ip 20;
```

> Slowloris 现在很少独立用,但**慢 POST**(发 Content-Length: 1000000,但每秒发 1 字节)仍是 WAF 必须防的。

---

## 四、防御层次:从 T 级到单机

```
                  攻击方
                    │
                    ▼
   ┌────────────────────────────────────┐
   │  ① 运营商清洗 / 骨干 BGP 黑洞       │  T 级
   │     (中国电信高防 / Akamai Prolexic) │
   └────────────────────────────────────┘
                    │ 留下 ~100Gbps
                    ▼
   ┌────────────────────────────────────┐
   │  ② Anycast + CDN 边缘吸收           │  百 G 级
   │     (Cloudflare / Akamai / 阿里高防) │
   └────────────────────────────────────┘
                    │ 留下 ~10Gbps
                    ▼
   ┌────────────────────────────────────┐
   │  ③ 自建机房:iptables / eBPF/XDP    │  十 G 级
   └────────────────────────────────────┘
                    │ 留下 ~1Gbps 真实流量
                    ▼
   ┌────────────────────────────────────┐
   │  ④ Nginx / WAF / 应用层限流          │  单机级
   └────────────────────────────────────┘
                    │
                    ▼
                  应用
```

每一层都有"价格"和"上限"——**没有任何一层能单独扛住一切**。

### 4.1 ① 运营商清洗

只有 T 级运营商能做。机制:**BGP 路由把你的 IP 段引流到清洗中心**,清洗后的"干净流量"通过专线回到你机房。

```
流量路径(平时):
  攻击者 ──► 公网骨干 ──► 你的机房 IP
  
流量路径(被打,启用清洗):
  攻击者 ──► 公网骨干 ──► 清洗中心(吸收所有攻击)
                          │
                          └─► 干净流量 ──► 专线 ──► 你的机房 IP
```

**月费用**:几万到几十万人民币不等,按防御带宽计费。

### 4.2 ② CDN / Anycast 吸收

Anycast 让"同一个 IP"在全球几十个 PoP 同时响应。攻击流量被天然分散——单个 PoP 只承受几十 Gbps,加起来才是 T 级。

详见上一篇 36(LB / CDN 调度),核心机制不重复。

### 4.3 ③ iptables / eBPF / XDP

| 工具 | 处理位置 | 速度 |
| --- | --- | --- |
| iptables | netfilter 框架(内核) | ~1M PPS / 核 |
| nftables | 同上,新一代 | ~2M PPS / 核 |
| eBPF (TC) | 流量控制层 | ~5M PPS / 核 |
| XDP | 网卡驱动层(更早) | ~20M PPS / 核 |
| DPDK | 用户态绕过内核 | ~50M PPS / 核 |

**XDP** 是 DDoS 防御的核武器——在网络包**进入内核协议栈之前**就丢弃。Cloudflare 的 L4 防御就是 XDP + eBPF。

```
传统 iptables 路径:
  网卡 → 驱动 → skb_alloc → netfilter → drop
  (即使 drop,也已经分配了 sk_buff,有内存压力)

XDP 路径:
  网卡 → 驱动 → BPF 程序判断 → drop
  (在 sk_buff 之前 drop,几乎零开销)
```

详见 33 篇 eBPF / XDP / DPDK。

### 4.4 ④ 应用层限流

最后一道防线,在 Nginx / Envoy / 应用代码里实现。

```nginx
# 速率限制(令牌桶):每 IP 每秒 10 请求,burst 20
limit_req_zone $binary_remote_addr zone=api_rate:10m rate=10r/s;

server {
    location /api/ {
        limit_req zone=api_rate burst=20 nodelay;
        # 超出直接 503
    }
}
```

详见 algorithmLearning/24 限流算法——令牌桶 / 漏桶 / 滑动窗口对比、计数器单调性问题、分布式限流(Redis + Lua)。

---

## 五、iptables 防御实战:几条命令救一台机器

下面这套规则适用于"被小流量打但还没买高防"的应急情景。**生产环境必须先 iptables-save,否则改错锁外**。

```bash
# 查现有规则
iptables -L INPUT -n --line-numbers

# ① 限制单 IP 同时连接数(防扫描 / 慢攻击)
iptables -A INPUT -p tcp --syn --dport 80 \
  -m connlimit --connlimit-above 50 -j REJECT

# ② 限制 SYN 速率(每 IP 每秒最多 10 SYN)
iptables -A INPUT -p tcp --syn --dport 80 \
  -m hashlimit --hashlimit-name syn-rate \
  --hashlimit-above 10/sec --hashlimit-mode srcip \
  --hashlimit-burst 20 -j DROP

# ③ 黑名单(挂上后不需要重启)
ipset create blacklist hash:ip
iptables -A INPUT -m set --match-set blacklist src -j DROP
ipset add blacklist 1.2.3.4

# ④ 限制 ICMP(防 Smurf)
iptables -A INPUT -p icmp --icmp-type echo-request \
  -m limit --limit 1/s --limit-burst 5 -j ACCEPT
iptables -A INPUT -p icmp -j DROP

# ⑤ 丢弃明显异常包
iptables -A INPUT -p tcp --tcp-flags ALL NONE -j DROP   # NULL 扫描
iptables -A INPUT -p tcp --tcp-flags ALL ALL  -j DROP   # XMAS 扫描
iptables -A INPUT -p tcp --tcp-flags SYN,FIN SYN,FIN -j DROP

# 保存
iptables-save > /etc/iptables/rules.v4
```

**经验值**:`connlimit 50 / hashlimit 10` 是中等流量站点的安全水位——CDN 后的 Nginx 因为所有流量来自 CDN IP,这两个值要设得很大或基于 X-Forwarded-For 限。

> 警告:**iptables 规则越多越慢**——每个包要顺序匹配。超过几千条规则就要换 ipset / nftables / eBPF。

---

## 六、eBPF/XDP 一瞥:Cloudflare 的 DDoS 防御长这样

XDP 程序运行在网卡驱动里,可以在包进入协议栈之前 drop。下面是一个最小可读的"丢 UDP 包"示例(Cloudflare 真实代码复杂得多):

```c
// xdp_drop_udp.c (用 LLVM 编译成 BPF 字节码)
#include <linux/bpf.h>
#include <bpf/bpf_helpers.h>

SEC("xdp")
int xdp_drop_udp(struct xdp_md *ctx) {
    void *data     = (void *)(long)ctx->data;
    void *data_end = (void *)(long)ctx->data_end;

    struct ethhdr *eth = data;
    if ((void *)(eth + 1) > data_end) return XDP_PASS;
    if (eth->h_proto != bpf_htons(ETH_P_IP)) return XDP_PASS;

    struct iphdr *ip = (void *)(eth + 1);
    if ((void *)(ip + 1) > data_end) return XDP_PASS;

    if (ip->protocol == IPPROTO_UDP)
        return XDP_DROP;     // ← 这里 drop,完全不进协议栈

    return XDP_PASS;
}
char _license[] SEC("license") = "GPL";
```

**生产 DDoS XDP 防御的核心规则集**(Cloudflare 公开过):

```
1. 校验 IP / TCP / UDP header 长度(防奇形怪状)
2. 丢已知反射协议端口(NTP/DNS/Memcached/SSDP)
3. 速率限制(per-src-ip,bpf_map 维护)
4. 校验 TCP flags 合法性
5. 黑名单 lookup(LPM trie 实现 IP 段匹配)
```

XDP 的处理速度是 iptables 的 10-20 倍,**单核能扛 20M PPS**——这是 T 级 DDoS 时代的硬通货。

---

## 七、WAF:应用层的"第二层皮肤"

**WAF**(Web Application Firewall)= 反向代理 + 规则引擎。所有 HTTP 请求过 WAF,**符合规则的攻击模式被拦下**。

### 7.1 工作原理:三种检测引擎

```
请求进入 WAF
    │
    ▼
┌────────────────────────────────────┐
│ ① 规则匹配引擎(Signature)         │
│   正则匹配请求 URL/header/body      │
│   命中规则 → block                  │
│   优点:快、准、可解释               │
│   缺点:0day 攻击拦不住、规则要更新   │
└────────────────────────────────────┘
    │ 通过
    ▼
┌────────────────────────────────────┐
│ ② 行为分析(Behavior)              │
│   单 IP 频率 / Session 路径异常      │
│   "正常用户不会 3 秒访问 50 个接口"  │
└────────────────────────────────────┘
    │ 通过
    ▼
┌────────────────────────────────────┐
│ ③ 机器学习(ML)                    │
│   学正常请求分布,标记 outlier      │
│   优点:能发现未知攻击               │
│   缺点:误杀高、解释难               │
└────────────────────────────────────┘
    │ 通过
    ▼
转发到后端
```

### 7.2 规则匹配:OWASP CRS 是怎么写的

OWASP **Core Rule Set**(CRS)是世界上最广用的 WAF 规则集——ModSecurity / Coraza / 多家云 WAF 都用它。看几条真实规则:

```apache
# REQUEST-942-APPLICATION-ATTACK-SQLI.conf 节选
SecRule REQUEST_COOKIES|ARGS|REQUEST_HEADERS \
  "@detectSQLi" \
  "id:942100,phase:2,block,msg:'SQL Injection Attack Detected',\
   tag:'attack-sqli',severity:'CRITICAL'"

# REQUEST-941-APPLICATION-ATTACK-XSS.conf 节选
SecRule REQUEST_COOKIES|ARGS \
  "@detectXSS" \
  "id:941100,phase:2,block,msg:'XSS Attack Detected'"
```

**Paranoia Level**(PL)从 1 到 4——越高越激进:

```
PL1:几乎不误杀,只拦明显攻击,适合电商 / 大众 SaaS
PL2:稍激进,适合企业 OA
PL3:很激进,适合内网 / 银行
PL4:近乎偏执,误杀率高,适合极敏感场景
```

**新手最大的坑**:**直接上 PL3 → 业务全炸**。正确姿势:**先 detection-only 跑一周,看 false positive,逐条豁免后再切 block**。

```apache
SecDefaultAction "phase:2,log,auditlog,pass"   # 先 pass(只记录)
# 跑一周,确认无误杀后改为:
SecDefaultAction "phase:2,log,auditlog,deny,status:403"
```

### 7.3 主流 WAF 产品对比

| 产品 | 类型 | 部署方式 | 强项 | 弱项 |
| --- | --- | --- | --- | --- |
| **ModSecurity** | 开源(Apache 基金会) | Nginx/Apache 模块 / Coraza 独立 | 灵活、规则透明、免费 | 自维护、性能一般 |
| **Coraza** | 开源(Go 实现) | Envoy/Caddy 插件 | 现代、性能好、兼容 ModSec 规则 | 较新,生态在建 |
| **Cloudflare WAF** | 商业,边缘 | DNS 切到 CF | 全球 PoP、Bot Management 强 | 黑盒、依赖 CDN |
| **AWS WAF** | 商业,云原生 | ALB/CloudFront/API GW | 集成度高、按请求计费 | 规则数量上限、贵 |
| **阿里云 WAF** | 商业 | 接入或反代 | 中文支持、国内合规、CC 强 | 国外节点弱 |
| **F5 ASM / NGINX App Protect** | 商业,本地 | 专门硬件或软件 | 企业级支持 | 贵 |

**自建 vs 上云**:

```
自建 ModSecurity:
  优点:数据不出域、规则透明、零额外费用
  缺点:规则维护要人、突发流量挡不住(还是被打死)

上云 WAF(Cloudflare / 阿里云):
  优点:开箱即用、有 Bot 数据库、能扛大流量
  缺点:数据出域(合规问题)、按 QPS 计费贵、黑盒
```

### 7.4 Nginx + ModSecurity 安装一瞥

```bash
# Ubuntu
apt install libmodsecurity3 libnginx-mod-http-modsecurity

# 下载 OWASP CRS
git clone https://github.com/coreruleset/coreruleset.git /etc/modsecurity/crs

# Nginx 配置
load_module modules/ngx_http_modsecurity_module.so;

http {
    modsecurity on;
    modsecurity_rules_file /etc/modsecurity/main.conf;
}

# main.conf
Include /etc/modsecurity/modsecurity.conf
Include /etc/modsecurity/crs/crs-setup.conf
Include /etc/modsecurity/crs/rules/*.conf
```

`modsecurity.conf` 关键参数:

```apache
SecRuleEngine On                  # On / Off / DetectionOnly
SecRequestBodyAccess On           # 检查 POST body
SecRequestBodyLimit 13107200      # 12.5 MB 上限
SecResponseBodyAccess Off         # 一般关掉(性能 + 隐私)
SecAuditEngine RelevantOnly       # 只审计被拦的
SecAuditLog /var/log/modsec_audit.log
```

---

## 八、白名单 vs 黑名单:WAF 的根本之争

```
黑名单(blocklist):允许默认,只挡已知坏的
  优点:不挡正常业务,部署快
  缺点:0day 攻击不挡,规则要不停更新
  适用:互联网公开服务、SaaS

白名单(allowlist):禁止默认,只放已知好的
  优点:0day 也挡(因为不在白名单里)
  缺点:业务变更就要改白名单,运维重
  适用:内网 API / 银行后台 / 特定接口
```

**OWASP CRS 是黑名单**——这是它好用的根本原因(易部署),也是它扛不住未知攻击的根本原因。

**两者结合**才是企业级:

```
黑名单层:OWASP CRS 拦 SQLi/XSS/RCE/LFI 等已知模式
+
白名单层:对 /admin/* /api/internal/* 强制源 IP 白名单
+
基于学习的白名单:WAF 学习正常请求结构,异常字段直接拦
```

### 8.1 误杀(False Positive)排查

**最常见的误杀**:

| 场景 | 误判规则 | 解决 |
| --- | --- | --- |
| 富文本编辑器提交 HTML | XSS | 豁免 `/api/article/post` |
| 后端日志上报含 `' "` | SQL 注入 | 豁免特定参数 |
| 文件上传 base64 含 `--` | SQL 注释 | 豁免 `multipart/form-data` |
| Markdown 链接 `[](javascript:...)` | XSS payload | 改业务前端预处理 |
| 用户名带 `<script>` | XSS | 业务侧拒绝即可 |

**ModSec 豁免规则示例**:

```apache
# 在 location /api/article/post 里
SecRuleRemoveById 941100 941160 941170
# 或按参数豁免
SecRuleUpdateTargetById 941100 "!ARGS:content"
```

> 经验法则:**WAF 上线第一个月主要工作 = 看 false positive 然后写豁免**。准备好至少 3-5 个工时 / 周。

---

## 九、挑战式防御:JS Challenge / CAPTCHA

当 WAF 拿不准"这个请求是不是真人"时,**让客户端"证明自己是浏览器"**。这是 Cloudflare 5 秒盾的核心。

### 9.1 三种挑战强度

```
JS Challenge(无感)
  返回一段 JS,做一些计算 / 解一道小数学题 / 校验浏览器特性
  浏览器执行后带 token 重新请求 → 通过
  脚本工具(curl/wrk)无 JS 引擎 → 直接挂
  
  代价:首次访问延迟 +200~500ms
  适合:可疑 IP、新 IP、低信誉 ASN

Managed Challenge(轻交互)
  浏览器特性 + 可能弹出"点这个方块"
  hCaptcha / Cloudflare Turnstile
  
  代价:用户体验稍差
  适合:登录 / 注册 / 评论提交

CAPTCHA / hCaptcha(强交互)
  让用户认图、点对话框
  
  代价:转化率掉 10-20%(电商不能乱用)
  适合:高危操作、被打期间应急
```

### 9.2 工作流(Cloudflare 5 秒盾)

```
Client ──── GET /any ─────► CDN
                              │
                              │ 判断:可疑
                              ▼
            ◄──── 200 OK + JS challenge ─── 
            (页面只有一段 JS,跑 ~5 秒)
                              
浏览器执行 JS:
  - 收集 navigator.* 等指纹
  - 算一道数学题(慢 hash)
  - 写 cookie cf_clearance=xxx
  - 重定向回原页面

Client ──── GET /any (带 cookie) ─────► CDN
                              │
                              │ 校验通过
                              ▼
            ◄──── 真实页面 ─── Origin
```

**为什么有效**:**自动化攻击工具不跑 JS**——Python requests / Go 的 net/http / curl 都不跑。要跑 JS 就得上 Selenium / Playwright,**资源占用高 100 倍**,攻击成本飙升 → 自动放弃。

### 9.3 反挑战:无头浏览器与对抗升级

进攻方也在进化——Puppeteer / Playwright 用真实 Chromium,理论上能跑 JS。但留下 **CDP(Chrome DevTools Protocol)指纹**:

```js
navigator.webdriver === true        // 自动化标志
window.chrome 缺少某些子对象        // 真 Chrome 全有
WebGL renderer 是 "SwiftShader"     // 无 GPU 时
TLS JA3 指纹与真实 Chrome 不一致     // 库特征
```

Cloudflare Bot Management 会综合 50+ 指纹判断。这是无止境的军备竞赛——**所以"挑战"只能减缓,不能根除**,核心还是**让攻击成本 > 攻击收益**。

---

## 十、Bot 流量识别:全网 30% 流量的真相

公开数据(Imperva 2024 Bad Bot Report):

```
全互联网流量构成:
  人类流量    51%
  好 Bot      17%   (Googlebot / Bingbot / 监控机器人)
  坏 Bot      32%   (爬虫 / 撞库 / 刷量 / 自动化攻击)
                    ↑
                    这是 WAF/Bot 防御的真正战场
```

### 10.1 Bot 识别四层信号

```
① IP 信誉
   - 是不是已知 IDC / VPS / 代理 / Tor 出口?
   - ASN 历史是不是常出问题?
   - 数据源:Spamhaus / IPinfo / MaxMind / 自建黑库

② 请求指纹
   - User-Agent 是不是真的常见?
   - HTTP/2 SETTINGS 帧顺序?
   - TLS JA3 / JA4 指纹?
   - 请求头大小写、顺序是不是符合主流浏览器?

③ 行为模式
   - 鼠标移动轨迹(前端埋点)
   - 页面停留时间
   - 点击 / 滚动事件分布
   - 跨页面访问图

④ 挑战响应
   - 跑得了 JS 吗?
   - 算得动 PoW(workload proof)吗?
   - 过得了 CAPTCHA 吗?
```

### 10.2 JA3 / JA4 指纹

`JA3` 是把 TLS ClientHello 里的字段(版本、加密套件、扩展、椭圆曲线、点格式)拼起来取 MD5——**不同 TLS 库 / 浏览器版本指纹不同**。

```
真实 Chrome 120 (macOS):  769,4865-4866-4867-...   → JA3=cd08e31494f9531f560...
Python requests:            769,49195-49199-...     → JA3=c279b3b2810911ed3...
Go net/http:                772,4865-4866-...       → JA3=c45c2c2d6c40ee9eb...
curl:                        772,4866-4865-...      → JA3=51c64c77e60f3980a...
```

WAF 维护一个"已知库 / 攻击工具 JA3 黑名单"——**冒充 Chrome User-Agent 但 JA3 是 Python 的**,就是典型的脚本攻击,直接拦。

JA4(2023 年新版)更细——把字段排序、加上 ALPN / SNI / 扩展数量,可读性更好。

### 10.3 Bot 防御工程套路

```nginx
# Nginx 简单防爬
map $http_user_agent $bad_bot {
    default 0;
    "~*scrapy"        1;
    "~*python-requests" 1;
    "~*curl"          0;  # curl 是合法工具,不一刀切
    "~*libwww"        1;
}

server {
    if ($bad_bot) { return 403; }
}
```

**生产级**:用 Cloudflare Bot Management / DataDome / PerimeterX,因为单靠 UA / IP 已经远不够——这些产品维护几千万级别的 Bot 指纹库。

---

## 十一、限流策略:WAF 最后一公里

WAF 拦不住的"看起来正常但量很大"的请求,靠**限流**兜底。

### 11.1 三种主流算法

```
算法           特点                          适用
────────────────────────────────────────────────────
计数器          固定窗口(1 分钟内不超 60)     简单接口
                临界点 burst 问题(0:59 + 1:00 双倍)

滑动窗口        窗口连续移动                   API 网关
                精度高,内存稍多

漏桶            匀速输出                       视频上传 / 出口流控

令牌桶          匀速生成 token,可 burst       绝大多数业务
                Nginx limit_req 默认实现
```

详见 algorithmLearning/24 限流算法。

### 11.2 Nginx 限流完整示例

```nginx
http {
    # 全局速率(IP 维度)
    limit_req_zone $binary_remote_addr zone=ip_rl:10m rate=10r/s;
    
    # 全局速率(用户 token 维度)
    limit_req_zone $http_authorization zone=token_rl:10m rate=100r/s;
    
    # 并发连接数限制
    limit_conn_zone $binary_remote_addr zone=ip_conn:10m;

    server {
        listen 443 ssl http2;

        location /api/ {
            limit_req zone=ip_rl burst=20 nodelay;
            limit_req zone=token_rl burst=200 nodelay;
            limit_conn ip_conn 50;
            
            limit_req_status 429;
            limit_req_log_level warn;
            
            proxy_pass http://backend;
        }
        
        # 高危接口更严格
        location /api/login {
            limit_req zone=ip_rl burst=3 nodelay;
            proxy_pass http://backend;
        }
    }
}
```

**经验值**:

| 接口类型 | 推荐速率 | burst |
| --- | --- | --- |
| 公开 GET API | 100r/s | 200 |
| 普通业务 API | 10r/s | 20 |
| 登录 / 注册 | 1r/s | 3 |
| 密码重置 / 短信 | 1r/m | 1 |
| 文件上传 | 5r/m | 5 |

### 11.3 分布式限流

单机 Nginx 限流 = N 个机器各限 10 r/s = 总 10N r/s,失控。**要全局限流,需要中心存储(Redis)**。

```lua
-- OpenResty + Redis 限流(令牌桶)
local key = "rate:" .. ngx.var.remote_addr
local count, err = red:incr(key)
if count == 1 then
    red:expire(key, 1)
end
if count > 10 then
    return ngx.exit(429)
end
```

更工业化的做法:**Sentinel / 阿里 AHAS / Envoy ratelimit service**——支持滑动窗口、热点参数限流、集群限流。

---

## 十二、监控与应急:被打的时候怎么办

### 12.1 必须有的监控指标

```
网络层:
  入向带宽 / PPS                 → 容量型攻击早期信号
  TCP 连接数 / SYN_RECV 数      → SYN Flood 信号
  iptables drop 计数            → 防御命中

WAF 层:
  规则命中率                     → 攻击模式
  block / detection 比          → 误杀率
  challenge 通过率               → Bot 比例

应用层:
  QPS / 错误率 / P99            → 应用是否还活着
  上游 4xx/5xx                  → 后端是否被打挂
  慢日志 RT > 1s                → CC 攻击信号
```

### 12.2 被打时的应急 Checklist

```
0. 不要 panic,先确认是不是攻击(可能就是流量上涨)
   → 看 PPS/带宽分布、源 IP 分布、UA 分布

1. 快速止血(5 分钟内)
   → CDN 切到"我正在被攻击"模式(高 challenge)
   → 黑名单批量加恶意 IP / ASN
   → 限流阈值收紧 50%

2. 分析(15 分钟)
   → 攻击是哪一类?容量型 / 协议型 / 应用型
   → 集中在哪个接口?哪个 IP 段?哪个国家?
   → 用什么工具?看 JA3 / UA

3. 定向防御(30 分钟)
   → 容量型:联系上游清洗
   → 应用型:WAF 加专项规则、提高挑战强度
   → 慢攻击:client_body_timeout 调小

4. 复盘(攻击后)
   → 哪些防御层起作用了
   → 哪些没起作用为什么
   → 是否要升级 CDN/WAF 套餐
```

---

## 十三、踩坑提醒

1. **CDN 后 Nginx 限 IP**——所有请求都来自 CDN IP,limit_req 全打到 CDN 上。要用 `$http_x_forwarded_for` 或 `$proxy_add_x_forwarded_for` 取真实 IP
2. **OWASP CRS 直接上 PL3**——业务全炸,先 DetectionOnly 跑一周
3. **以为 WAF 能挡 DDoS**——WAF 只挡应用层,容量型该被打还是被打
4. **iptables 规则上千条**——每个包顺序匹配,延迟暴涨,要换 ipset / nftables / eBPF
5. **不开 SYN Cookies**——一波 SYN Flood 就挂
6. **Memcached 公网开放无密码**——百分之百会被当反射器,你成攻击源
7. **挑战强度全开**——正常用户体验崩,转化率掉 30%
8. **WAF 不审计 audit log**——出问题查不到什么被拦了
9. **JS Challenge 无超时**——爬虫挂着不返回,反过来占满 worker
10. **限流粒度只有 IP**——一个 NAT 出口几千用户,误杀严重,要按 token / session 限
11. **CC 攻击靠堆机器扛**——加机器只是把"被打死的时间"延后 5 分钟,必须 WAF + 限流
12. **WAF 之后不做后端鉴权**——WAF 一旦被绕,后端裸奔。**WAF 是辅助,不是替代**

---

## 十四、本章 Checklist

| 项 | 说明 |
| --- | --- |
| 能区分容量型 / 协议型 / 应用型 | 选对防御层 |
| 知道 SYN Cookies 是什么 / 什么时候启用 | 协议型必懂 |
| 听得懂"反射放大攻击" + 5 个常见反射协议 | 容量型必懂 |
| 装过 ModSecurity + OWASP CRS,能写一条豁免 | WAF 入门 |
| 会写 Nginx limit_req 配置,知道 burst 含义 | 限流基本 |
| 知道 XDP / eBPF 比 iptables 快多少 / 为什么 | 大流量防御方向 |
| 区分 CAPTCHA / JS Challenge / Managed Challenge | 防 Bot 工程 |
| 听说过 JA3 / JA4 指纹 | Bot 识别核心 |
| 能列被打时的 5 步应急流程 | 实战经验 |

---

## 十五、小结

防御互联网流量的本质是 **三件事**:

1. **分层** —— 没有任何单一手段能挡所有攻击。运营商清洗 + CDN + iptables/XDP + WAF + 限流,缺一环都有死角
2. **成本对抗** —— 防御不是"杜绝攻击",是"让攻击成本 > 攻击收益"。Cloudflare Bot Management 抗不住国家级对抗,但抗得住 99% 的脚本小子
3. **可观测优先** —— 没监控的防御等于裸奔。被打了不知道、知道了不会查、查到了不会复盘 → 永远在挨打

**最重要的是动手做一次**:起一个 Nginx + ModSecurity + OWASP CRS,自己写一段 Python 脚本"攻击"自己,看 WAF 怎么拦、log 怎么记。**没拦下来过几次假攻击,永远不知道防御长什么样**。

---

下一篇:`38-渗透测试入门.md`,从**进攻视角**理解防御——但**全程强调"只在授权环境测试"**。讲信息收集(nmap / dig / Shodan)、常见漏洞类型(开放端口 / 弱密码 / SQL 注入 / SSRF / RCE)、抓 token 中间人(mitmproxy)、证书钉扎(Frida hook)、Burp Suite 工作流、漏洞赏金平台(HackerOne / Bugcrowd)、CTF 入门资源——**懂攻才懂防,但永远在自己的盘子里玩**。
