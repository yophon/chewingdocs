# DNS 协议

「我在浏览器输 `www.google.com`,网络栈第一件事是什么」——绝不是 TCP 握手,而是 **DNS 查询**。**没有 DNS,整个互联网就是一堆数字**。这套协议 1983 年由 Paul Mockapetris 设计(RFC 1034 / 1035),活到今天 40 多年没大改,在每秒几十万亿次查询的规模下还在跑——**这是互联网最低估的奇迹**。新手对 DNS 的认识停在「域名转 IP 的工具」,但 DNS 是一个**全球分布式数据库 + 一套自定义二进制协议 + 缓存机制 + 多种记录类型**的复合系统:你以为的一次查询背后可能是 4-5 跳递归、几十毫秒延迟、UDP 与 TCP 之间的切换、EDNS0 扩展、缓存命中策略——**懂了 DNS,你才懂为什么冷启动慢、为什么换 DNS 服务器能加速、为什么 CDN 调度全靠它**。

> 一句话先记住:**DNS = 全球分层的「域名 → 记录」分布式数据库**——根 13 组、顶级域(com / cn / org)、权威服务器、子域逐级下钻。**默认走 UDP 53,响应大于 512 字节走 TCP 53 或 EDNS0 扩到 4096**。**递归查询**(我问你,你帮我找完整结果)与**迭代查询**(我问你,你告诉我下一步去问谁)是 DNS 体系的两个工作模式。**报文 12 字节固定头 + 四段(Question / Answer / Authority / Additional)+ 名字压缩指针**——这套二进制格式 40 年没动过。

上一篇 26-WebRTC 讲了 P2P 实时通信怎么穿 NAT,**ICE 候选地址收集第一件事就是 DNS 查 STUN / TURN 服务器**——所以从这章开始,我们正式进入「**应用层最底层的解析层**」:**DNS 体系**(27-29)。

---

## 一、为什么有 DNS

### 1.1 没有 DNS 的世界

回到 1980 年代,ARPANET 上几百台主机,所有名字 → IP 的映射就放在一个文件里:

```
/etc/hosts
192.0.43.7   example.com
208.67.222.222  opendns
129.42.38.1     ibm.com
...
```

**每台机器手动维护一份**。每周从 SRI-NIC 下载更新。规模到了上千台后,这个方案瞬间崩溃:

- 文件越来越大,下载耗时
- 命名冲突(谁都想叫 `mail`)
- 谁有权改 hosts 文件?中心化太脆弱
- 一台机器 IP 变了,全网要等几天才同步

**1983 年 Paul Mockapetris 设计 DNS,核心思路三点**:

```
1. 分层命名:把名字切成 . 分隔的段(www.google.com)
2. 分布式存储:每段名字归不同的服务器管
3. 缓存加速:查过一次的结果存起来
```

> 经验法则:**DNS 不是「翻译工具」,是「全球分层的分布式数据库 + 自定义二进制协议」**——你能区分出这两层,DNS 就懂了一半。

### 1.2 hosts 文件至今还在

打开 `/etc/hosts`(Mac/Linux)或 `C:\Windows\System32\drivers\etc\hosts`(Windows):

```
127.0.0.1       localhost
::1             localhost
255.255.255.255 broadcasthost
```

**hosts 优先级高于 DNS**——这是开发常用的「劫持本地解析」的手段:

```
echo "1.2.3.4 api.prod.com" | sudo tee -a /etc/hosts
# 之后 curl api.prod.com 就走 1.2.3.4
```

> 调试一个域名解析到错误 IP 时,先看 hosts——99% 是有人手动改了。

---

## 二、DNS 的层级结构

### 2.1 域名是一棵倒置的树

```
                            . (根)
                            |
        ┌───────────────────┼─────────────────┐
        |                   |                 |
       com                  cn                org
        |                   |                 |
   ┌────┼─────┐         ┌───┼───┐         ┌───┴───┐
 google amazon github  baidu sina taobao  wikipedia mozilla
   |        |              |
  www       www            www
```

每一段是一个**标签**(label),最长 63 字符;整个域名最长 255 字符。**每个点 `.` 是分层的边界**。

完整写法叫 **FQDN**(Fully Qualified Domain Name),末尾还有一个隐含的根点:

```
www.google.com.
              ↑ 真正的 FQDN 末尾有这个点(根域)
```

### 2.2 谁管哪层

| 层级 | 例子 | 谁管 |
| --- | --- | --- |
| 根域 | `.` | 全球 13 组根服务器(a-m.root-servers.net),IANA / ICANN 协调 |
| 顶级域 TLD | `.com` `.cn` `.org` `.io` | 注册局(Verisign 管 .com,CNNIC 管 .cn) |
| 二级域 | `google.com` | 域名所有者(Google 自己) |
| 三级及以下 | `www.google.com` `mail.google.com` | 二级域所有者管 |

**13 组根服务器**(注意是「组」不是「台」):

```
a.root-servers.net  到  m.root-servers.net
```

每组背后是 Anycast 的几百台机器全球部署(详见 29 篇)。**之所以是 13 组**:DNS over UDP 报文限 512 字节,放下 13 个 IP + glue 记录刚好顶到上限——这是 1980 年代的物理约束,沿用至今。

### 2.3 权威服务器 vs 递归服务器

这两个角色 **新手经常混淆**:

```
权威服务器 (Authoritative)
  ─ 持有某个域的「权威数据」
  ─ Google 的权威服务器持有 google.com 所有记录
  ─ 不递归查询,只回答自己管的部分

递归服务器 (Recursive / Resolver)
  ─ 帮客户端「跑腿」找答案
  ─ 8.8.8.8 / 1.1.1.1 / 114.114.114.114 都是
  ─ 自己不持有数据,从根开始递归找权威
  ─ 把结果缓存,下次直接回
```

**你电脑配的 DNS 服务器(`/etc/resolv.conf`)是递归服务器**——它是你的代理,帮你跑全世界。

---

## 三、递归 vs 迭代:DNS 工作的两种模式

### 3.1 递归查询(Recursive)

**「你帮我找,找到再回」**——客户端 → 递归服务器:

```
我:   8.8.8.8,告诉我 www.google.com 的 IP
8.8.8.8:  好的,等我跑一圈(可能 30-200ms)
8.8.8.8:  142.250.80.100,拿走
```

**客户端只发一次,等一次**。但 8.8.8.8 自己背后跑了一堆查询。

### 3.2 迭代查询(Iterative)

**「你只告诉我下一步问谁」**——递归服务器 → 权威服务器之间用迭代:

```
8.8.8.8 → 根服务器:    www.google.com 在哪?
根服务器 → 8.8.8.8:    我不知道,但 .com 顶级域归这几个 IP 管(Authority)
                       这几个 IP 是 a.gtld-servers.net 等(Additional/glue)

8.8.8.8 → .com 服务器: www.google.com 在哪?
.com 服务器 → 8.8.8.8: 我不知道,但 google.com 归 ns1.google.com 等管
                       ns1.google.com 是 216.239.32.10(glue)

8.8.8.8 → ns1.google.com: www.google.com 在哪?
ns1.google.com → 8.8.8.8: 142.250.80.100 (Answer)

8.8.8.8 → 客户端: 142.250.80.100
```

**4 跳查询**——这就是「冷查询」的真实路径,通常 50-200ms。

### 3.3 ASCII 总览

```
                          客户端
                             |
                             | 递归(我等结果)
                             ↓
                       递归服务器(8.8.8.8)
                       /     |       \
                      / 迭代 |  迭代  \  迭代
                     ↓       ↓        ↓
                  根服务器  .com     ns1.google.com
                  (告诉它  (告诉它   (告诉它
                  去问 .com) 去问    最终 IP)
                            ns1.google.com)
```

> **递归和迭代不是「两种 DNS」,是「两种角色之间的交互方式」**——客户端到递归服务器是递归,递归服务器到权威是迭代。

### 3.4 用 dig +trace 看完整解析路径

```bash
dig +trace www.google.com
```

会看到:

```
.                       86400   IN      NS      a.root-servers.net.
.                       86400   IN      NS      b.root-servers.net.
;; Received 525 bytes from 192.168.1.1 in 12 ms

com.                    172800  IN      NS      a.gtld-servers.net.
com.                    172800  IN      NS      b.gtld-servers.net.
;; Received 1207 bytes from 198.41.0.4 (a.root-servers.net) in 28 ms

google.com.             172800  IN      NS      ns1.google.com.
google.com.             172800  IN      NS      ns2.google.com.
;; Received 663 bytes from 192.5.6.30 (a.gtld-servers.net) in 45 ms

www.google.com.         300     IN      A       142.250.80.100
;; Received 59 bytes from 216.239.32.10 (ns1.google.com) in 51 ms
```

**这就是 DNS 的「魔法揭穿」**——四跳清清楚楚。**第一次写排障时跑一遍这条命令,DNS 的工作方式立刻明白**。

---

## 四、DNS 报文格式

DNS 协议是**自定义二进制格式**(不是 ASCII 也不是 JSON),因为 1983 年要塞进 UDP 512 字节。

### 4.1 报文总结构

```
+---------------------+
|       Header        |  12 字节固定头
+---------------------+
|      Question       |  问题段(查什么)
+---------------------+
|       Answer        |  答案段(直接答案)
+---------------------+
|     Authority       |  授权段(谁是权威)
+---------------------+
|     Additional      |  附加段(glue 记录等)
+---------------------+
```

**每段可以有 0 个或多个记录**,数量记在 Header 里。

### 4.2 Header 格式(12 字节)

```
                                1  1  1  1  1  1
  0  1  2  3  4  5  6  7  8  9  0  1  2  3  4  5
+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
|                      ID                       |
+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
|QR|   Opcode  |AA|TC|RD|RA|   Z    |   RCODE   |
+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
|                    QDCOUNT                    |
+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
|                    ANCOUNT                    |
+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
|                    NSCOUNT                    |
+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
|                    ARCOUNT                    |
+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
```

| 字段 | 含义 |
| --- | --- |
| **ID** (16 bit) | 查询 ID,响应必须带回同样的 ID(防 spoofing) |
| **QR** (1 bit) | 0=查询,1=响应 |
| **Opcode** (4 bit) | 0=标准查询,1=反向查询(已废弃),2=状态 |
| **AA** (1 bit) | Authoritative Answer——是否权威服务器返回 |
| **TC** (1 bit) | Truncated——响应被截断,客户端应改 TCP 重试 |
| **RD** (1 bit) | Recursion Desired——客户端要求递归 |
| **RA** (1 bit) | Recursion Available——服务器支持递归 |
| **Z** (3 bit) | 保留,后来被 DNSSEC 占用(AD / CD bit) |
| **RCODE** (4 bit) | 响应码:0=成功,2=SERVFAIL,3=NXDOMAIN,5=REFUSED |
| **QDCOUNT** | Question 数量(通常 1) |
| **ANCOUNT** | Answer 数量 |
| **NSCOUNT** | Authority 数量 |
| **ARCOUNT** | Additional 数量 |

**RCODE 是排障时第一个看的字段**:

| 值 | 含义 | 典型场景 |
| --- | --- | --- |
| 0 NOERROR | 成功 | 正常返回 |
| 2 SERVFAIL | 服务器内部错误 | 上游超时 / DNSSEC 校验失败 |
| 3 NXDOMAIN | 域名不存在 | 拼错 / 域名过期 |
| 5 REFUSED | 拒绝 | 没权限 / 防火墙挡 |

### 4.3 Question 格式

```
+-------------------+
|      QNAME        |  域名(变长,以 0 结束)
+-------------------+
|      QTYPE        |  2 字节,记录类型(A=1, AAAA=28...)
+-------------------+
|      QCLASS       |  2 字节,通常 IN=1(Internet)
+-------------------+
```

**QNAME 编码**:不是 ASCII 字符串,而是「长度 + 标签」交替:

```
查 www.google.com:

03 'w' 'w' 'w'  06 'g' 'o' 'o' 'g' 'l' 'e'  03 'c' 'o' 'm'  00
↑               ↑                            ↑                ↑
3字节标签       6字节标签                    3字节标签        结束符
```

**所以 1 字节长度 + 标签内容,反复直到 0x00 结束**。**这就是为什么单段最长 63 字节**——因为长度字段最高两位被压缩指针占用,只剩 6 bit。

### 4.4 资源记录(Resource Record)格式

Answer / Authority / Additional 三段都是 RR 格式:

```
+-------------------+
|       NAME        |  域名(可压缩指针)
+-------------------+
|       TYPE        |  2 字节,A / AAAA / CNAME / ...
+-------------------+
|      CLASS        |  2 字节,IN
+-------------------+
|        TTL        |  4 字节,缓存秒数
+-------------------+
|     RDLENGTH      |  2 字节,RDATA 长度
+-------------------+
|       RDATA       |  变长,记录数据(IP / 域名 / 文本)
+-------------------+
```

**TTL 是 DNS 缓存的核心**——后面 29 篇详细讲。

### 4.5 名字压缩指针:DNS 报文最巧妙的设计

DNS 报文里 `www.google.com` 可能出现 4-5 次(Question / Answer / Authority / Additional 的 NAME 字段),每次重复占字节。**为节省空间,DNS 用 14 bit 压缩指针**:

```
长度字节最高两位:
  00xxxxxx  普通标签,后面 6 bit 是长度
  11xxxxxx  压缩指针,后面 14 bit 是「报文内偏移」

例:
  c0 0c     表示「跳到偏移 0x0c 处复用那个名字」
```

**所以 DNS 报文里同一个名字第二次出现只占 2 字节**——这是 1980 年代为塞进 UDP 512 字节的极限优化。

> 自己写 DNS 解析器时,**90% 的 bug 在压缩指针处理**——指针可以套指针,遇到环就死循环。

---

## 五、记录类型大全

DNS 不只是「域名 → IP」,**它是个通用的分层数据库**,存什么都行。常用类型:

| 类型 | 编号 | 含义 | RDATA 内容 |
| --- | --- | --- | --- |
| **A** | 1 | IPv4 地址 | 4 字节 IPv4 |
| **AAAA** | 28 | IPv6 地址 | 16 字节 IPv6 |
| **CNAME** | 5 | 别名 | 另一个域名 |
| **MX** | 15 | 邮件交换 | 优先级 + 邮件服务器域名 |
| **TXT** | 16 | 文本 | 任意字符串(SPF / DKIM / 域名所有权验证) |
| **NS** | 2 | 域名服务器 | 权威服务器域名 |
| **SOA** | 6 | 区域起始 | 主服务器 + 管理员邮箱 + 序列号 + 各种 TTL |
| **PTR** | 12 | 反向解析 | IP → 域名(`x.y.z.w.in-addr.arpa`) |
| **SRV** | 33 | 服务定位 | 优先级 + 权重 + 端口 + 主机名 |
| **CAA** | 257 | CA 授权 | 限定哪些 CA 可签证书 |
| **HTTPS / SVCB** | 65 / 64 | HTTPS 服务参数 | ALPN / 端口 / IP hint(让浏览器一次拿到 H/3 配置) |
| **DS / DNSKEY / RRSIG** | 43/48/46 | DNSSEC | 详见 28 篇 |

### 5.1 A 与 AAAA

```bash
$ dig +short A www.google.com
142.250.80.100

$ dig +short AAAA www.google.com
2607:f8b0:4004:c08::69
```

**双栈主机会同时有两条**——浏览器用 Happy Eyeballs(RFC 8305)同时握 v4 和 v6,谁先成谁赢。

### 5.2 CNAME:别名

```
www.example.com.    CNAME    example.com.
example.com.        A        93.184.216.34
```

**CNAME 不能在区域顶点用**(如 `example.com` 自己不能 CNAME),否则与 SOA 冲突。**这是为什么很多 SaaS 让你用 `www`,而不是裸域**。

### 5.3 MX:邮件路由

```bash
$ dig +short MX gmail.com
5 gmail-smtp-in.l.google.com.
10 alt1.gmail-smtp-in.l.google.com.
20 alt2.gmail-smtp-in.l.google.com.
```

**前面数字是优先级**——越小优先级越高。SMTP 客户端先连 5,失败再连 10。

### 5.4 TXT:万能文本

最常见的用途:

```
v=spf1 include:_spf.google.com ~all              # SPF 反垃圾邮件
v=DMARC1; p=reject; rua=mailto:dmarc@example.com  # DMARC
google-site-verification=xxxxxxxxxxxxxxxxxxxxx     # Google 验证域名所有权
```

### 5.5 SRV:协议无关的服务发现

XMPP / SIP / Kerberos 大量用 SRV:

```bash
$ dig +short SRV _xmpp-client._tcp.gmail.com
5 0 5222 xmpp.l.google.com.
```

`5 0 5222 xmpp.l.google.com` 意思是:**优先级 5、权重 0、端口 5222、主机 `xmpp.l.google.com`**。**客户端拿这个就直接知道连哪、连哪个端口**,无需硬编码。

### 5.6 NS / SOA:管理记录

```bash
$ dig +short NS google.com
ns1.google.com.
ns2.google.com.
ns3.google.com.
ns4.google.com.

$ dig +short SOA google.com
ns1.google.com. dns-admin.google.com. 689091779 900 900 1800 60
                                       ↑序列号 ↑refresh ↑retry ↑expire ↑minTTL
```

**SOA 序列号是 zone 同步的关键**——主从同步时从看序列号决定要不要拉 zone。

### 5.7 CAA:防证书签发滥用

```
example.com.    CAA    0 issue "letsencrypt.org"
example.com.    CAA    0 issue "digicert.com"
```

**意思是:只允许 Let's Encrypt 和 DigiCert 给我签证书**。其他 CA 看到这条记录必须拒绝签发——这是防止域名被劫持后乱签证书的最后防线。

### 5.8 HTTPS / SVCB:浏览器一次拿全

新协议(RFC 9460,2023),让 DNS 一次返回 HTTP/3 的 ALPN、端口、IP hint:

```bash
$ dig +short HTTPS cloudflare.com
1 . alpn="h3,h2" ipv4hint=104.16.132.229 ipv6hint=2606:4700::6810:84e5
```

**省了一次 ALPN 协商往返**——这是新一代 Web 性能优化方向。

---

## 六、Glue 记录:鸡生蛋蛋生鸡的解法

**经典问题**:`google.com` 的 NS 记录是 `ns1.google.com`——**那 `ns1.google.com` 的 IP 谁告诉我**?**这就是循环依赖**。

解法:**glue 记录**——`.com` 的权威服务器**直接在 Additional 段返回 `ns1.google.com` 的 A 记录**:

```
;; AUTHORITY SECTION:
google.com.    172800  IN  NS  ns1.google.com.
google.com.    172800  IN  NS  ns2.google.com.

;; ADDITIONAL SECTION:
ns1.google.com. 172800  IN  A  216.239.32.10
ns2.google.com. 172800  IN  A  216.239.34.10
```

**Additional 段塞 glue,客户端拿到就直接能继续**。否则要再发一轮独立查询查 `ns1.google.com` 的 IP——那会再触发循环。

> 自己买域名时,如果 DNS 服务器在自己的子域(如 `ns1.example.com` 给 `example.com`),**注册局会要求你提交 glue 记录**(注册商界面叫「胶水记录」或「子域名 IP」)。

---

## 七、UDP 53、TCP 53、EDNS0

### 7.1 默认 UDP 53

DNS 设计时一个原则:**短包不需要建连接,UDP 一来一回最快**。所以 DNS 默认走 UDP 53。

但 UDP 有 **512 字节限制**(RFC 1035 时代为防 IP 分片定的安全值)。

### 7.2 大响应:TCP 53 与 TC bit

如果响应大于 512 字节(常见于 DNSSEC 签名、`NS` 记录多、`TXT` 长记录):

```
1. 服务器先尽量塞 512 字节的 UDP 响应,把 TC bit (Truncated) 设为 1
2. 客户端看到 TC=1,知道被截断,改用 TCP 53 重发查询
3. TCP 没有大小限制(TCP 头里 2 字节 length)
```

**所以「DNS 也要开 TCP 53」**——防火墙别只开 UDP 53。**DNS over TCP 不只是大响应才用,zone transfer (AXFR) 也只走 TCP**。

### 7.3 EDNS0:UDP 也能传更大

RFC 6891 引入 **EDNS0**(Extension Mechanisms for DNS)——**复用 UDP,但允许声明更大缓冲区**。

实现方式:**Additional 段加一个 OPT 伪记录**,声明客户端能接收的最大 UDP 包(常见 4096):

```
;; OPT PSEUDOSECTION:
; EDNS: version: 0, flags:; udp: 4096
```

**服务器看到 udp 4096,就敢回大包**(只要别超过路径 MTU 引发分片)。

**EDNS0 还带其他功能**:

- **Client Subnet (ECS)**:把客户端 IP 网段告诉权威,做就近 GSLB(详见 29 篇)
- **DNSSEC OK (DO bit)**:声明客户端要 DNSSEC 签名

> 现代递归解析器默认 EDNS0 + 4096——基本不再触发 TCP 回退。

### 7.4 抓包看 DNS:tcpdump 一行命令

```bash
sudo tcpdump -i any -n -s 0 'port 53' -vv
```

输出大概:

```
14:23:01.123  IP 192.168.1.10.54321 > 8.8.8.8.53: 0xabcd+ A? www.google.com. (32)
14:23:01.156  IP 8.8.8.8.53 > 192.168.1.10.54321: 0xabcd 1/0/0 A 142.250.80.100 (48)
```

`0xabcd` 是 Transaction ID;`A?` 是 Question Type;`1/0/0` 是 Answer/Authority/Additional 的数量。

---

## 八、缓存与 TTL:DNS 性能的命门

### 8.1 缓存层数

```
浏览器缓存(60秒,Chrome 内置)
    ↓
OS stub resolver 缓存(systemd-resolved / nscd)
    ↓
路由器 / 内网 DNS(企业级 Bind / Unbound)
    ↓
ISP / 公共递归(8.8.8.8 / 1.1.1.1)
    ↓
权威服务器(无缓存)
```

**任何一层命中,就不再往下**——这是 DNS 撑住每秒万亿查询的原因。**全球 DNS 缓存命中率估计在 80-95%**。

### 8.2 TTL 怎么定

| TTL | 适合场景 |
| --- | --- |
| 30-60 秒 | 经常切换的(灰度发布、紧急切流) |
| 5 分钟 | 常规生产 |
| 1 小时 | 普通业务 |
| 1 天 | 稳定不变的(MX 记录、根域 NS) |
| 1 周 | TLD 服务器 NS(基本不变) |

**核心权衡**:**TTL 长 → 命中率高,缓存压力小,但变更慢(切流要等)**;**TTL 短 → 变更快,但查询频次高,递归服务器压力大**。

> CDN 厂商用 30 秒 TTL,因为它要随时把流量从挂掉的机房切走;反过来根服务器 NS 用 6 天 TTL,因为它几乎不变。

### 8.3 负缓存(Negative Caching)

**RFC 2308**:NXDOMAIN 也要缓存,否则错域名会反复打到根。

**负缓存 TTL 由 SOA 记录的 minimum 字段控制**(通常 60-3600 秒)。

```bash
$ dig +short SOA google.com | awk '{print $7}'
60
```

意思是:`*.google.com` 的 NXDOMAIN 缓存 60 秒。

---

## 九、用 dig 做高级排障

`dig`(Domain Information Groper)是 DNS 调试的瑞士军刀。常用场景:

### 9.1 基本查询

```bash
dig www.google.com               # 默认查 A
dig AAAA www.google.com          # 查 IPv6
dig MX google.com                # 查邮件
dig +short www.google.com        # 只输出 IP
```

### 9.2 指定 DNS 服务器

```bash
dig @8.8.8.8 www.google.com           # 用 Google DNS
dig @1.1.1.1 www.google.com           # 用 Cloudflare DNS
dig @192.168.1.1 www.google.com       # 用本地路由
```

**对比不同 DNS 返回的结果**——如果某个 DNS 返回错的 IP,可能是被污染或 GSLB 不同分区。

### 9.3 跟踪完整解析路径

```bash
dig +trace www.google.com
```

从根开始一跳一跳查——**调试「我的域名解析慢」时第一个跑这个**。

### 9.4 查看完整报文

```bash
dig +noall +answer +authority +additional www.google.com
```

或:

```bash
dig www.google.com +qr     # 显示发出去的 Query 和回来的 Response
dig www.google.com +stats  # 显示各种统计
```

### 9.5 反向解析

```bash
dig -x 8.8.8.8                       # 给 IP 查域名(PTR)
                                     ; 等价于:
dig 8.8.8.8.in-addr.arpa PTR
```

输出:

```
8.8.8.8.in-addr.arpa.   86400  IN  PTR  dns.google.
```

### 9.6 查看 EDNS0 / DNSSEC

```bash
dig +bufsize=4096 +dnssec www.cloudflare.com
```

会返回 RRSIG 签名记录(详见 28 篇)。

### 9.7 drill:DNSSEC 友好的替代

```bash
drill -DT www.cloudflare.com    # -D 启 DNSSEC,-T trace
```

drill 输出比 dig 更利于 DNSSEC 排障(详见下一篇)。

---

## 十、DNS 报文的 Wireshark 视角

抓一个 `dig www.google.com`,Wireshark 解析后:

```
Domain Name System (query)
    Transaction ID: 0xabcd
    Flags: 0x0120 Standard query
        0... .... .... .... = Response: Message is a query
        .000 0... .... .... = Opcode: Standard query (0)
        .... ..0. .... .... = Truncated: Message is not truncated
        .... ...1 .... .... = Recursion desired: Do query recursively
        .... .... ..1. .... = AD bit: Set
    Questions: 1
    Answer RRs: 0
    Authority RRs: 0
    Additional RRs: 1
    Queries
        www.google.com: type A, class IN
            Name: www.google.com
            [Name Length: 14]
            Type: A (Host Address) (1)
            Class: IN (0x0001)
    Additional records
        <Root>: type OPT
            Name: <Root>
            Type: OPT (41)
            UDP payload size: 4096
```

**和我们前面讲的报文格式完全对得上**——Header 的 ID / Flags / 各段 count、Question 段的 Name / Type / Class、Additional 段的 OPT 记录(EDNS0)。

> 学协议的最快方式:**抓个包 + 看 Wireshark 解析 + 对照 RFC** ——三件套连起来,任何协议都能吃透。

---

## 十一、常见踩坑

1. **以为 DNS 只有 A 记录**——MX / TXT / SRV / CNAME / CAA 一堆,不同业务都用得到
2. **CNAME 链过长**——RFC 限制 CNAME 不能套太深,8 层以上很多解析器直接失败
3. **裸域(apex)用 CNAME**——违反 RFC,会跟 SOA 冲突,改用 ALIAS / ANAME(各厂商私有扩展)
4. **TTL 设太长**——切流量发现 24 小时内还有用户访问旧 IP
5. **TTL 设 0**——递归服务器可能拒绝缓存,反而打爆权威
6. **不开 TCP 53**——大响应被截断,DNSSEC 直接失败
7. **glue 记录漏配**——子域 NS 在自己子域内,没 glue 永远解不出来
8. **`/etc/hosts` 优先级忘了**——发现解析结果不对,先看 hosts
9. **CNAME 链遇到 NXDOMAIN**——中间一环不存在,整条链 fail,但很多解析器返回 NOERROR + 空 Answer,迷惑
10. **NXDOMAIN 缓存太久**——临时把域名指错了,负缓存让你想撤销也得等 SOA minimum

---

## 十二、关键 RFC

| RFC | 内容 |
| --- | --- |
| RFC 1034 | DNS 概念与功能 |
| RFC 1035 | DNS 实现与规范(报文格式) |
| RFC 2181 | DNS 澄清(TTL / CNAME 规则) |
| RFC 2308 | 负缓存 |
| RFC 6891 | EDNS0 |
| RFC 7766 | DNS over TCP 强制要求 |
| RFC 8484 | DoH(下一篇) |
| RFC 9460 | SVCB / HTTPS 记录 |

---

## 十三、本章 Checklist

| 项 | 说明 |
| --- | --- |
| 知道 DNS 是分层数据库,不是「翻译工具」 | 心智模型 |
| 能区分递归服务器和权威服务器 | 必修 |
| 会跑 `dig +trace` 看完整路径 | 排障必备 |
| 能背出 12 字节 Header 的字段含义 | 协议熟练 |
| 知道 RCODE:NOERROR / SERVFAIL / NXDOMAIN | 排障常用 |
| 知道 UDP 53 + TCP 53 + EDNS0 三种传输 | 工程基础 |
| 知道至少 8 种记录类型 | 业务足够 |
| 理解 glue 记录和压缩指针 | 行家细节 |

---

## 十四、小结

DNS 是互联网最低估的基础设施:

1. **它不是工具,是一个全球分层的数据库**——根 / TLD / 权威 / 缓存
2. **协议 40 年没改**——12 字节 Header + 4 段 + 压缩指针,简单到极致
3. **缓存是命门**——TTL 怎么定决定切流速度和命中率的取舍
4. **dig +trace 是 DNS 调试的入门票**——不会跑这个,DNS 永远是黑盒

但 DNS 协议有个**致命缺陷**:**明文走 UDP**——任何中间节点都能看你查什么、改你回什么。**运营商劫持 / 中间人投毒**几十年来一直是 DNS 的伤口。

下一篇:`28-DoT-DoH-DNSSEC.md`,讲 DNS 的「**安全升级三件套**」——**DoT**(DNS over TLS)在 853 端口加密、**DoH**(DNS over HTTPS)在 443 端口伪装成普通 HTTPS、**DoQ**(DNS over QUIC)走 UDP 加密、以及 **DNSSEC** 这个「验真但不加密」的签名链。**为什么浏览器和 OS 默认开 DoH、为什么 DNSSEC 部署率十年只爬到 5%**——加密 DNS 这一仗,远没结束。
