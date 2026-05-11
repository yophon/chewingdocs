# DoT / DoH / DNSSEC

「我在咖啡店连 WiFi,输了 `bank.com`,银行真的是银行吗」——传统 DNS 给不了答案。**1983 年设计的 DNS 协议,Header 第一字段是明文 ID,载荷是明文域名,UDP 53 端口任何中间设备都能看、能改、能伪造**。这意味着:**运营商可以在你查询 `youtube.com` 时返回错的 IP**(国内常见 ISP 劫持)、**Wi-Fi 热点可以把你导向假的 `bank.com` 钓鱼站**(中间人攻击)、**国家防火墙可以投毒污染所有过境的 DNS 包**(DNS poisoning,GFW 标志技术)。**整个互联网的入口竟然这么脆弱**——这是 21 世纪互联网安全最大的 elephant in the room。

> 一句话先记住:**DoT / DoH / DoQ = 加密 DNS,解决「别人能看 + 能改」**;**DNSSEC = DNS 签名,解决「能验真,但不加密」**——两件事正交,加起来才是完整方案。**DoH 走 443,跟普通 HTTPS 流量混在一起**,所以浏览器(Firefox / Chrome)默认开 DoH;**DNSSEC 用 RRSIG 签名 + DNSKEY 验签 + DS 锚定根**,签名链从根 `.` 一路下钻验到目标。**部署率**:DoH/DoT 几年内从 0 涨到 30%,DNSSEC 折腾 25 年还卡在 5%——**因为 DNSSEC 配错就全域不能解析,运维 PTSD**。

上一篇 27 把 DNS 报文 / 递归 / 缓存讲透了,但忽略了一个事实:**那套协议在 2024 年的互联网上是在裸奔**。这一篇补上「**怎么让 DNS 不再被偷看、被篡改、被伪造**」。

---

## 一、传统 DNS 的三宗罪

### 1.1 明文可窥探(Eavesdropping)

```
你的手机 → WiFi 路由器 → 运营商 → 8.8.8.8

每一跳都能看到:
  你查了 chase.com   → 推断你是 Chase 用户
  你查了 grindr.com  → 推断你的私生活
  你查了 jobs.amazon.com → 推断你在找工作
```

**DNS 查询是隐私元数据的金矿**——比 TLS 握手里的 SNI 还泄密(SNI 加密了之后 DNS 是最后一片明文)。

### 1.2 易被篡改(Tampering)

**ISP 劫持**:你查 `notexist.com`,运营商不返回 NXDOMAIN,而是返回**广告页 IP**——这是国内很多家庭宽带的「常态」:

```
$ dig notexist.example.com
;; ANSWER SECTION:
notexist.example.com.  60  IN  A  111.13.55.66    ← 运营商广告页
```

正常应该返回:

```
;; AUTHORITY SECTION:
example.com.  60  IN  SOA  ...
;; status: NXDOMAIN
```

### 1.3 易被投毒(Cache Poisoning)

**Kaminsky 攻击**(2008 年震惊业界):

```
攻击者构造大量 DNS 响应,猜测 16 位 Transaction ID
只要猜中一次,递归服务器把假 IP 缓存几小时
所有用这个递归的用户都被劫持
```

**16 位 ID 只有 65536 种**——攻击者每秒发上万个伪造响应,几分钟就能命中。

**修复**:**Source Port Randomization**(RFC 5452)——把客户端源端口也随机化(16+16=32 位猜),把单纯靠 ID 的攻击拉到 40 多亿次才命中。**但根本上**:这套防御还是统计游戏,**真正的解法是加密**。

> 经验法则:**任何明文协议,只要能改字节,就能被劫持** ——HTTP / DNS / SMTP 全踩过这个坑,加密是唯一出路。

---

## 二、加密 DNS:DoT / DoH / DoQ 三种姿势

### 2.1 总览对比

| 方案 | 端口 | 底层 | 标准 | 上线年份 | 主要部署者 |
| --- | --- | --- | --- | --- | --- |
| **DoT** (DNS over TLS) | 853 | TCP+TLS | RFC 7858 | 2016 | OS 层(Android Private DNS) |
| **DoH** (DNS over HTTPS) | 443 | HTTP/2+TLS | RFC 8484 | 2018 | 浏览器(Firefox / Chrome) |
| **DoQ** (DNS over QUIC) | 853 | QUIC | RFC 9250 | 2022 | 实验阶段(Cloudflare / Adguard) |

**核心区别**:**DoT 在专用端口 853**(易被识别 / 易被封),**DoH 在 443**(跟普通 HTTPS 混一起,不易识别 / 不易封),**DoQ 走 UDP**(0-RTT 起飞,适合移动端)。

### 2.2 DoT:DNS over TLS

**思路**:在 853 端口起一条 TLS 长连接,普通 DNS 报文塞进去:

```
客户端 → TCP 853 → TLS 握手 → DNS query (TLS payload) → DNS response → ...
                            ↑
                            就是 27 章讲的二进制 DNS 报文,一字节都没改
```

**报文格式不变**——只是套了个 TLS 隧道。

**优点**:
- 报文格式不变,实现简单
- 长连接复用,不用每次握 TLS

**缺点**:
- 853 端口太显眼,容易被识别 / 封禁
- 需要 OS 或 stub resolver 支持(浏览器不直接支持 DoT)

**Android 9+ 内置「私人 DNS」(Private DNS)就是 DoT**:

```
设置 → 网络 → 私人 DNS → 输入: dns.google
        ↑
        Android 自动连 dns.google:853 走 DoT
```

### 2.3 DoH:DNS over HTTPS

**思路**:把 DNS 查询塞进 HTTP/2 请求,走 443 端口:

```
GET /dns-query?dns=AAABAAABAAAAAAAAA3d3dwZnb29nbGUDY29tAAABAAE HTTP/2
Host: dns.google
Accept: application/dns-message

POST /dns-query HTTP/2
Host: dns.google
Accept: application/dns-message
Content-Type: application/dns-message
<DNS binary payload>
```

**完全跟普通 HTTPS 流量长得一样**——中间人看不出这是 DNS 还是访问网页。

**典型 DoH 端点**:

| 服务商 | URL |
| --- | --- |
| Google | `https://dns.google/dns-query` |
| Cloudflare | `https://cloudflare-dns.com/dns-query` |
| Quad9 | `https://dns.quad9.net/dns-query` |
| AdGuard | `https://dns.adguard.com/dns-query` |

**curl 测一下**:

```bash
curl -H 'Accept: application/dns-message' \
     --data-binary @query.bin \
     -X POST https://cloudflare-dns.com/dns-query \
     -o response.bin
```

或用 JSON 接口(RFC 8427 + Cloudflare 扩展):

```bash
curl -H 'Accept: application/dns-json' \
     'https://cloudflare-dns.com/dns-query?name=www.google.com&type=A'
```

返回:

```json
{
  "Status": 0,
  "TC": false,
  "RD": true,
  "RA": true,
  "AD": false,
  "CD": false,
  "Question": [{"name": "www.google.com.", "type": 1}],
  "Answer": [{"name": "www.google.com.", "type": 1, "TTL": 300, "data": "142.250.80.100"}]
}
```

**JSON 接口让前端 / 调试工具直接用**——不用解二进制报文。

### 2.4 DoQ:DNS over QUIC

**思路**:把 DoT 底层的 TCP+TLS 换成 QUIC:

- 0-RTT 起飞(QUIC 复用 session ticket)
- 没有 TCP 队头阻塞(每个查询一个 QUIC stream)
- UDP 之上,移动网络切换不断

**和 DoT 一样走 853**(QUIC 是 UDP,不冲突 TCP 853),客户端按 ALPN 协商「dq」表示 DoQ。

**Cloudflare 1.1.1.1 / AdGuard 都支持 DoQ**——但客户端支持还很少(主要是嵌入式 DNS 工具)。

### 2.5 三者性能实测(粗略)

```
冷查询 (cold):
  传统 UDP DNS:        20-50ms
  DoT(已建 TLS 长连):  15-40ms
  DoT(冷,要握 TLS):  60-120ms
  DoH(已建 HTTP/2):    20-50ms
  DoH(冷,要握 TLS):  80-150ms
  DoQ(0-RTT):         20-40ms

长连热查询:
  DoT / DoH 都接近 UDP DNS,因为 TLS 握手摊销了
```

> 经验法则:**冷启动 DoT/DoH 比明文 DNS 慢一个 RTT**(TCP+TLS 握手),**长连下基本无损**。**移动端弱网首推 DoQ**。

---

## 三、浏览器和 OS 的 DoH 默认开关

### 3.1 浏览器层(应用各自做)

| 浏览器 | 默认 DoH | 默认服务商 |
| --- | --- | --- |
| **Firefox** | 美国地区默认开(2020+) | Cloudflare 或 NextDNS |
| **Chrome** | 跟随 OS 配置(Auto-upgrade DoH) | 看你 OS 配的 DNS |
| **Edge** | 同 Chrome | 同 Chrome |
| **Safari** | 不主动启,让 OS 处理 | OS |

**Firefox 默认开 DoH 在 2018-2020 引发巨大争议**:

```
ISP / 政府视角:
  我看不到用户查啥了,丧失监管 / 屏蔽能力
  紧急公告(EmergenC) DNS 不生效

用户视角:
  隐私大幅提升
  绕过 ISP 劫持,不再有「未知域名跳广告」

企业 IT 视角:
  公司内网 DNS(私有域 corp.local)解不出来
  无法做内部黑名单 / 审计
```

**结果**:Firefox 加了「Canary domain」机制 —— 如果检测到 `use-application-dns.net` 不存在,关闭 DoH(给 ISP / 企业留逃生口)。

### 3.2 OS 层(全局)

| OS | DoH/DoT 支持 | 配置方式 |
| --- | --- | --- |
| **Android 9+** | DoT(Private DNS) | 系统设置直接填域名 |
| **iOS 14+** | DoT + DoH | 安装 DNS 配置文件(.mobileconfig) |
| **macOS 11+** | 同 iOS | 同 iOS |
| **Windows 11** | DoH | 网络适配器设置 |
| **Linux systemd-resolved** | DoT | `/etc/systemd/resolved.conf` |

**systemd-resolved 配 DoT**:

```ini
# /etc/systemd/resolved.conf
[Resolve]
DNS=1.1.1.1#cloudflare-dns.com
DNSOverTLS=yes
```

`#cloudflare-dns.com` 是「IP + SNI」语法,告诉 resolved 用什么 SNI 验证证书。

### 3.3 实战:用 dig 测 DoH

```bash
# 用 kdig (knot-utils)
kdig @1.1.1.1 +https www.google.com
kdig @1.1.1.1 +tls www.google.com
```

或:

```bash
# Cloudflare 的 cloudflared 工具起本地 DoH 代理
cloudflared proxy-dns --upstream https://1.1.1.1/dns-query
# 之后本地 127.0.0.1:53 就是 DoH 代理
```

---

## 四、1.1.1.1 / 8.8.8.8 / 9.9.9.9 实测对比

### 4.1 三家公共 DNS

| 服务 | 主 IP | 特色 |
| --- | --- | --- |
| **Cloudflare 1.1.1.1** | 1.1.1.1 / 1.0.0.1 | 主打隐私(承诺日志 24h 删) |
| **Google 8.8.8.8** | 8.8.8.8 / 8.8.4.4 | 速度稳定 / 覆盖广(Anycast) |
| **Quad9** | 9.9.9.9 | 内置威胁拦截(已知钓鱼域直接 NXDOMAIN) |

### 4.2 速度实测(用 `dig` 平均 100 次)

参考(具体看你所在地):

```
                    UDP 平均   DoT 平均   DoH 平均
Cloudflare 1.1.1.1   12ms       18ms       22ms
Google 8.8.8.8       18ms       25ms       30ms
Quad9 9.9.9.9        25ms       35ms       40ms
ISP DNS              5-30ms     N/A        N/A
```

**ISP DNS 通常最快**(物理距离近),**但隐私 / 劫持风险最大**——这是工程取舍。

### 4.3 用 dnsperf 自己测

```bash
# 准备查询列表
echo "www.google.com A
www.facebook.com A
www.amazon.com A
www.cloudflare.com A" > query.txt

# 跑 30 秒压测
dnsperf -s 1.1.1.1 -d query.txt -l 30
```

输出:

```
Statistics:
  Queries sent:         28543
  Queries completed:    28540 (100.00%)
  Queries lost:         3 (0.01%)

  Response codes:       NOERROR 28540 (100.00%)
  Average latency:      4.523 ms
  Latency StdDev:       2.146 ms
```

**详见 29 篇 DNS 性能优化的 benchmark 部分**。

### 4.4 选哪个

| 优先 | 选 |
| --- | --- |
| 隐私 | Cloudflare 1.1.1.1 |
| 稳定 / 全球速度 | Google 8.8.8.8 |
| 安全(自动拦截恶意) | Quad9 9.9.9.9 |
| 国内 | 114.114.114.114 / 阿里 223.5.5.5 / DNSPod 119.29.29.29 |
| 极致性能 | ISP DNS(但有劫持风险,搭 DoT/DoH 用) |

---

## 五、DNSSEC:验真但不加密

### 5.1 核心思路

**DoT/DoH 解决「传输安全」**,**但权威服务器返回的内容本身可信吗**?如果攻击者攻破了递归服务器,或者 DNS 缓存被投毒,**DoT/DoH 没法识别**——因为客户端只验了 TLS 证书,没验数据本身。

**DNSSEC**(DNS Security Extensions,RFC 4033/4034/4035)的解法:**给每条 DNS 记录加密码学签名**,客户端逐级验签到根,**任何一环被篡改,签名校验失败**。

```
传统 DNS:                直接信任递归服务器返回的数据
DNSSEC:    每条记录都有签名,客户端从根开始逐级验真
```

> **DNSSEC 不加密查询内容**——只签名。**窃听者还能看到你查啥**。**所以 DNSSEC 和 DoT/DoH 是正交的两件事**——理想是「DoH 加密传输 + DNSSEC 验真内容」一起开。

### 5.2 三个新记录类型

| 记录 | 含义 |
| --- | --- |
| **RRSIG** | 资源记录的签名(签 A / AAAA / NS 等记录) |
| **DNSKEY** | 区域的公钥(用于验证 RRSIG) |
| **DS** (Delegation Signer) | 上级区域里指向下级 DNSKEY 的指纹(锚定信任链) |
| **NSEC / NSEC3** | 「这个域名段之间没有别的记录」的签名证明(防 NXDOMAIN 否认) |

### 5.3 信任链:从根到目标

```
根 (.) 的 DNSKEY  ←  全球预置的「Trust Anchor」(KSK-2017)
       ↓ 根用自己 DNSKEY 签了 .com 的 DS
.com 的 DS
       ↓ DS 是 .com 的 DNSKEY 的指纹
.com 的 DNSKEY  ←  通过 DS 验真
       ↓ .com 用自己 DNSKEY 签了 example.com 的 DS
example.com 的 DS
       ↓
example.com 的 DNSKEY  ←  通过 DS 验真
       ↓ example.com 用自己 DNSKEY 签了所有 A / MX / TXT
example.com 的 A 记录 + RRSIG
```

**客户端拿到 A 记录 + RRSIG 后**:

```
1. 拿 example.com 的 DNSKEY 验 A 记录的 RRSIG
2. 拿 .com 的 DS 验 example.com 的 DNSKEY
3. 拿 .com 的 DNSKEY 验 .com 的 DS 的 RRSIG
4. 拿 . (根) 的 DS 验 .com 的 DNSKEY  
5. 根的 DNSKEY 是预置 Trust Anchor,客户端硬编码信任
```

**任何一环验失败,整条链 fail,客户端拿到 SERVFAIL**——而不是「我用了被篡改的数据」。

### 5.4 KSK 与 ZSK

每个 DNSSEC 区域有两套密钥:

```
KSK (Key Signing Key)
  ─ 长期使用(2-3 年换一次)
  ─ 只签 ZSK
  ─ 公钥的指纹是 DS 记录,登记到上级

ZSK (Zone Signing Key)
  ─ 短期使用(1-3 个月换一次)
  ─ 签所有具体记录(A / MX / NS)
  ─ 不需要登记到上级,因为 KSK 验
```

**为什么要分两层**:**KSK 滚动需要协调上级**(`.com` 改 DS),代价高;**ZSK 滚动只在区域内**,自动化方便。

### 5.5 dig 看 DNSSEC

```bash
dig +dnssec www.cloudflare.com
```

输出多了:

```
;; ANSWER SECTION:
www.cloudflare.com.   300  IN  A      104.16.132.229
www.cloudflare.com.   300  IN  RRSIG  A 13 3 300 ...

;; flags: qr rd ra ad; ...
                      ↑↑
                      AD = Authenticated Data,验签成功
```

**关键看 `ad` flag**——`ad` 出现表示递归服务器代你验签成功了。

`drill -DT` 显示完整链:

```bash
drill -DT www.cloudflare.com
```

会一层层打印 DNSKEY / DS / RRSIG 的验证步骤。

### 5.6 NSEC / NSEC3:给 NXDOMAIN 也签名

**问题**:如果你查 `nonexist.example.com`,服务器返回 NXDOMAIN——**这个否定也得验签**,否则攻击者可以伪造 NXDOMAIN 让你以为某域名不存在。

**解法 NSEC**:返回**字典序排序后,你查的域名相邻的两个真实域名**:

```
查询: m.example.com
NSEC 响应:
  alpha.example.com   →   zeta.example.com (中间没别的记录)
  + RRSIG 签名
```

客户端看到「alpha 和 zeta 之间没别的」,且签名有效——**证明 m.example.com 确实不存在**。

**但 NSEC 暴露所有现存域名**(zone walking)——攻击者枚举一遍就能拿到全 zone。**NSEC3 引入哈希**,防枚举(但还是被算力突破过)。

---

## 六、为什么 DNSSEC 部署率低

### 6.1 数据残酷

```
全球顶级域中开 DNSSEC 的:几乎 100%(.com / .net / .org / 国家域基本都开)
全球二级域中开 DNSSEC 的:约 5-10%(用 ICANN / APNIC 统计)
中国大陆二级域开 DNSSEC 的:< 2%
```

**对比**:HTTPS 部署率 90%+,DNSSEC 25 年了还在 5%。

### 6.2 五个根本原因

```
1. 配置极其复杂
   生成 KSK / ZSK,定期 rollover,DS 同步到上级
   配错就全域不能解析,服务下线
   
2. 一旦签名过期,全域 SERVFAIL
   有时差忘续签 → 几小时全网不可达
   2019 Slack 出过事,SpaceX 出过事

3. 性能开销
   响应大小翻 3-5 倍(签名 RRSIG 占 256+ 字节)
   触发 UDP 截断 → 退到 TCP → 慢 + 资源消耗
   
4. 中间盒子不友好
   老旧防火墙 / 路由器丢大 DNS 包
   家庭路由器 90% 不支持 EDNS0 大包

5. 收益模糊
   DoT/DoH 已解决传输劫持
   DNSSEC 解决的「权威被攻破 / 缓存投毒」对普通业务没那么痛
```

> 经验法则:**DNSSEC 就像「IPv6 的安全版」——技术正确,但部署阻力 > 收益**。**大型业务(银行 / 电信 / 政府)会开,中小业务基本不碰**。

### 6.3 谁开了 DNSSEC

- 全部根域 / 几乎所有 TLD(`.com` / `.cn` / `.org` / `.io`)
- 大部分政府 / 银行域名
- Cloudflare 用户(一键开启)
- AWS Route 53 用户(一键开启)

### 6.4 怎么自己开(以 Cloudflare 为例)

```
1. Cloudflare 控制台 → DNS → DNSSEC → 启用
2. Cloudflare 给你一段 DS 记录:
   65170 13 2 abc123def456...
3. 去你的域名注册商(GoDaddy / Namecheap),把 DS 录进去
4. 等 24-48h 上级 TLD 把 DS 签入,生效
5. dig +dnssec yourdomain.com 验 ad flag
```

**注意**:**取消 DNSSEC 也要先在注册商那撤 DS,否则会全域 SERVFAIL**——这是「DNSSEC PTSD」的源头。

---

## 七、加密 DNS 的边界:它防不了什么

### 7.1 SNI 还在裸奔

DoH 加密 DNS 查询,**但你下一步访问 `bank.com` 时,TLS ClientHello 里的 SNI 还是明文** —— 监听者照样知道你访问哪个网站。

**解决**:**Encrypted ClientHello (ECH)** —— 把 SNI 也加密(详见 19 篇 TLS 1.3 扩展)。**ECH + DoH 才是端到端隐私**——但 ECH 部署率比 DNSSEC 还低。

### 7.2 IP 地址还在明文

即使 DNS / SNI 都加密了,**TCP 包目的 IP 永远明文**。**反向解析(IP → 域名)**还是能猜出你访问谁——除非用 Tor。

### 7.3 DoH 服务商本身能看你查啥

你把 DoH 用到 Cloudflare,**Cloudflare 就成了新的「中心化窥探者」**——它能看到你所有 DNS 查询。**信任从 ISP 转移到了 DoH 服务商**,不是消除。

> 经验法则:**加密只是把「信任」转移,不是「消除」**——DoH 让你信 Cloudflare/Google 而不是 ISP,你必须自己判断哪个值得信。

### 7.4 DNS 不能防上层应用

你查 `paypal.com`,DNS 给你正确 IP,但你点的是钓鱼链接 `paypaI.com`(大写 I),DNS 完全无能为力。**域名安全**(防钓鱼 / 抢注 / typosquatting)是另一个独立话题。

---

## 八、DoH/DoT 的反对声音

技术决策没有银弹。DoH / DoT 也有人坚决反对:

```
1. 集中化风险
   全网都走 Cloudflare/Google → 单点故障 + 监控集中
   
2. 绕过家长控制 / 企业策略
   IT 在内网封了某域名,DoH 让员工绕过
   
3. 紧急公告失效
   政府用 DNS 切断危险站点的能力丧失
   
4. 中小 ISP 失去「DNS 增值服务」
   原本能基于 DNS 拦病毒 / 拦广告,DoH 让这套没法做
```

**英国 ISPA 2019 提名 Mozilla 为「年度互联网恶人」**(后来撤回)——就是因为 Firefox 默认 DoH。这反映了**技术 / 监管 / 商业的真实矛盾**。

---

## 九、抓包看 DoT / DoH

### 9.1 DoT(853 端口)

```bash
sudo tcpdump -i any -n 'port 853' -vv
```

看到的是 TLS 握手 + 加密 payload——**看不到具体查询内容**。但能看到「这个客户端确实在用 DoT」。

### 9.2 DoH(443 端口)

```bash
sudo tcpdump -i any -n 'host 1.1.1.1 and port 443' -vv
```

**完全和访问普通 HTTPS 网站一样**——除非你解 TLS,否则连「这是 DNS」都看不出来。**这就是 DoH 的隐蔽性**。

### 9.3 解密 DoH(只能在自己机器)

设环境变量:

```bash
export SSLKEYLOGFILE=~/sslkeys.log
firefox &
```

Wireshark 加载 `sslkeys.log` 后能看明文 HTTPS,**包括 DoH 查询的具体内容**。详见 39 篇抓包高级。

---

## 十、一个完整选型决策树

```
我要不要升级 DNS 安全?
    │
    ├── 我是个人用户:
    │     ├── 关心隐私 → 用 Cloudflare 1.1.1.1 + DoH
    │     ├── 在不可信网络(咖啡店 WiFi)→ 必须 DoH/DoT
    │     └── 在审查网络 → DoH(443 不易封)
    │
    ├── 我是企业 IT:
    │     ├── 内网有私有域名 → 不能全开 DoH(解不出内部域)
    │     ├── 要审计 → 起企业级 DoH 网关(Cisco Umbrella / NextDNS)
    │     └── 强合规 → 只信任内部递归服务器
    │
    └── 我是网站运营:
          ├── 业务普通 → 加 CAA 记录就够,DNSSEC 看心情
          ├── 业务敏感(金融/政府)→ 强烈建议 DNSSEC
          └── CDN 后端 → CDN 厂商一键开 DNSSEC
```

---

## 十一、踩坑清单

1. **以为开了 DoH/DoT 就完全私密了**——SNI / IP 还在明文
2. **以为 DNSSEC 会加密**——它只验真,不加密
3. **DNSSEC 签名忘续签**——全域 SERVFAIL,拿 PagerDuty 吧
4. **DoH 走的服务商收集了所有查询**——隐私从 ISP 转移到 DoH 厂商
5. **企业内网开 Firefox DoH**——内部 `.corp.local` 直接解不出来
6. **DoT 端口 853 被防火墙封**——很多公司只放 80/443,DoT 不工作
7. **EDNS0 包过大触发分片**——老路由器丢分片包,DNSSEC 失败
8. **NSEC 被 zone walking 枚举**——给攻击者送一份完整域名清单,改用 NSEC3
9. **Trust Anchor 没更新**——根 KSK 2017 年滚动过一次,老系统没跟上验签全失败
10. **DoH JSON 接口和二进制接口混淆**——JSON 接口是 Cloudflare 私有扩展,不是 RFC 8484

---

## 十二、关键 RFC

| RFC | 内容 |
| --- | --- |
| RFC 4033/4034/4035 | DNSSEC 概念 / 资源记录 / 协议修改 |
| RFC 5155 | NSEC3 |
| RFC 7858 | DNS over TLS (DoT) |
| RFC 8484 | DNS over HTTPS (DoH) |
| RFC 9250 | DNS over QUIC (DoQ) |
| RFC 8914 | Extended DNS Errors(SERVFAIL 也能告诉你「为啥」) |

---

## 十三、本章 Checklist

| 项 | 说明 |
| --- | --- |
| 知道 DoT / DoH / DoQ 的端口和协议栈 | 协议熟悉 |
| 能解释「DNSSEC 验真但不加密」 | 不踩误区 |
| 知道 KSK / ZSK / DS / RRSIG / NSEC 五个角色 | DNSSEC 入门 |
| 会用 `dig +dnssec` 看 ad flag | 调试工具 |
| 配过 systemd-resolved 的 DoT | 实操经验 |
| 知道 1.1.1.1 / 8.8.8.8 / 9.9.9.9 的差别 | 选型常识 |
| 知道 DoH 把信任从 ISP 转移到 DoH 服务商 | 不被宣传忽悠 |
| 知道 DNSSEC 部署率为啥低 | 工程取舍 |

---

## 十四、小结

加密 DNS 这一仗,2024 年的状态是:

```
传输层加密(DoT/DoH/DoQ):快速普及,3-5 年内 50%+
内容验真(DNSSEC):折腾 25 年还卡 5%,主要在 TLD / 大型业务
SNI 加密(ECH):刚起步
IP 元数据保护:除非 Tor,无解
```

**核心认知**:

1. **加密 DNS 解决「中间人能改」**——浏览器 / OS 都默认开,新装机就该启用
2. **DNSSEC 解决「权威被劫持」**——配置复杂收益小,大业务才值得碰
3. **加密只是把信任转移,不是消除**——选 DoH 服务商等于选你信谁
4. **DNS 安全是组合拳**——CAA + DNSSEC + DoH + ECH 一起才是完整方案

但话说回来——**DNS 协议本身就 40 年了,过去 10 年才开始认真补安全**。**这就是互联网基础设施的现实节奏**:**好用 → 流行 → 暴露问题 → 缓慢修复**。

下一篇:`29-DNS性能优化.md`,讲 DNS 这个被低估的瓶颈怎么调优——**冷启动 50-200ms 的 DNS 怎么压到 5ms 以内**、**本地缓存 systemd-resolved / dnsmasq / nscd 三件套**、**DNS 预热(`<link rel="dns-prefetch">`)、Anycast 让 8.8.8.8 在全球都「就近」、GSLB 用 EDNS Client Subnet 让 CDN 调度精确到城市**、**dnsperf / kdig stats 怎么测 DNS 性能基线**。**网页慢的第一公里,经常是 DNS**——这一篇把这第一公里掰碎讲清楚。
