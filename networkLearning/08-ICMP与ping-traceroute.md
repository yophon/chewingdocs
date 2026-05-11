# ICMP 与 ping / traceroute

「ping 通就是网络好,ping 不通就是网络坏」——**这是普通用户的认知;但工程师必须知道:`ping` 测的是 ICMP 通道,而 ICMP 跟你的 HTTP / TCP 走的可能是完全不同的路径,被完全不同的策略处理**。**生产里 ping 通的网络可能死在 TCP 上,ping 不通的网络可能 TCP 飞速**。**ICMP 是 IP 协议的"伴生协议",它不是 TCP/UDP,不带端口,定义在 RFC 792**——很多防火墙把 ICMP 全 deny 是 Top 1 的运维错误,因为这会顺便把 PMTUD、traceroute、不可达通告全切断。**学会 ICMP + ping + traceroute + mtr 这套工具链,你能在 90 秒内定位 80% 的「网络通不通」问题**。

> 一句话先记住:**ICMP = IP 协议层面的"控制 + 故障报告"通道**。**报文嵌在 IP 包里(Protocol = 1),没有端口,只有 Type + Code 区分用途**。**最常用 4 类:Echo Request/Reply(ping 用)、Destination Unreachable(端口/主机/网络/分片不通)、Time Exceeded(TTL 耗尽,traceroute 用)、Redirect(更优路由提示)**。**ping 不通 ≠ 网络坏,只意味着 ICMP 通道被挡**——很多公网默认 deny ICMP,但 80 端口照样可达。

---

## 一、为什么需要 ICMP

IP 协议(06)是「best-effort」——丢就丢、错就错,不告诉发送方。但**真出问题时,发送方需要知道**:

```
我发了个包给 8.8.8.8

可能出错的方式:
  ✗ 中间路由器路由表查不到 8.8.8.8       → 网络不可达
  ✗ 包到了 8.8.8.8 但目标端口没人监听     → 端口不可达
  ✗ TTL 在路上耗尽                         → TTL exceeded
  ✗ 包太大,中间链路 MTU 不够              → 分片需要
  ✗ 路由器发现你走错路了,有更近的         → Redirect

如果 IP 协议自己处理这些 → IP 头会胀成几百字节
所以单独搞一个 ICMP 来做"诊断"
```

**ICMP 解决的事**:**故障由谁回报、回报什么内容、回给谁**——就这三件,没了。

> 经验法则:**ICMP 不是「应用层服务」,是「IP 自己的辅助协议」**——它和 IP 一样无状态、无连接、不可靠。**ICMP 包丢了,网络不会替它重传**——但发送方丢一个 ICMP 通常就丢了所有故障信息,所以 ICMP 关键路径都是"重要又无奈"。

---

## 二、ICMP 报文结构

### 2.1 通用格式

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|     Type      |     Code      |          Checksum             |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                       Body / Payload                          |
|                  (因 Type 而异,通常带原 IP 头 + 8 字节)        |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

**Type + Code 共 16 位组合,定义具体含义**:

| Type | 含义 | 常见 Code |
| --- | --- | --- |
| **0** | Echo Reply | 0 |
| **3** | Destination Unreachable | 0 = 网络不可达 / 1 = 主机不可达 / 3 = 端口不可达 / 4 = 分片需要 |
| **5** | Redirect | 改路由 |
| **8** | Echo Request | 0 |
| **11** | Time Exceeded | 0 = TTL 耗尽 / 1 = 重组超时 |
| **12** | Parameter Problem | 0 = IP 头有错 |

**ICMPv6**(IPv6 用,RFC 4443)Type 编号不同,但思路相同。

### 2.2 ICMP 报文的「附带证据」

`Destination Unreachable` 和 `Time Exceeded` 都会把**原始 IP 包的头 + 前 8 字节数据**抄回来——为什么?

```
你发了个包给 B,中间路由器丢了,回 ICMP "Time Exceeded"
你收到这个 ICMP,但你怎么知道是「哪个包」TTL 耗尽?

→ ICMP 把原 IP 头(20 字节)+ 数据前 8 字节抄回来
→ 数据前 8 字节正好覆盖 TCP/UDP 的(源端口 + 目端口 + 序号)
→ 你能精准对应到是哪个 socket / 哪条 TCP 流
```

**这就是 traceroute 能区分多个并行探测包的原理**——靠这 8 字节回执。

---

## 三、ping:Echo Request / Reply

### 3.1 ping 在做什么

```
1. 客户端发 ICMP Echo Request (Type 8)
   报文内容:
     - Identifier(16 位):区分多个 ping 进程
     - Sequence(16 位):递增序号
     - Payload:可选数据(默认填时间戳 + 模式)

2. 目标主机内核收到,无脑回 Echo Reply (Type 0)
   - Identifier 和 Sequence 原样返回
   - Payload 原样返回

3. 客户端收到 Reply,对照 Sequence,算 RTT
```

### 3.2 一次完整的 ping 抓包

```bash
$ tcpdump -i any -n icmp

10:15:23.123456 IP 192.168.1.10 > 8.8.8.8: ICMP echo request, id 1234, seq 1, length 64
10:15:23.156789 IP 8.8.8.8 > 192.168.1.10: ICMP echo reply, id 1234, seq 1, length 64
                                                                                      ↑
                                          ↑                                      原样返回
                                     总长 64 字节(IP 20 + ICMP 8 + payload 36)
```

**Linux/macOS ping 默认 payload 56 字节**(加 8 字节 ICMP 头 = 64 字节,加 IP 头 20 = 84 字节),**Windows 默认 32 字节**。

### 3.3 RTT 是怎么算的

```c
// Linux 内核 / ping 工具代码思路
1. 客户端发包前:
   timestamp_send = gettimeofday();
   把 timestamp_send 塞进 payload

2. 收到 Reply 时:
   timestamp_recv = gettimeofday();
   timestamp_send = 从 payload 里取出来
   rtt = timestamp_recv - timestamp_send

显示:
   64 bytes from 8.8.8.8: icmp_seq=1 ttl=51 time=24.3 ms
                                                    ↑
                                                  这就是 RTT
```

**RTT 包括**:发送侧→第一跳→...→对端收到→对端处理→对端回包→...→你收到——**全程任意一环慢都体现在 RTT 上**。

### 3.4 ping 的常用参数

```bash
# 计数 + 间隔
ping -c 10 -i 0.5 8.8.8.8        # 发 10 个,间隔 0.5s

# 大包测 MTU
ping -M do -s 1472 8.8.8.8       # DF=1, payload 1472(总 1500)
ping -s 9000 1.1.1.1             # 测试巨型帧

# 时间戳(看精确时间)
ping -D 8.8.8.8                  # Linux 显示发包时间戳

# 死亡计数(超时 N 秒就退出)
ping -w 5 8.8.8.8                # 最多跑 5 秒

# Flood ping(只 root 能用,小心打瘫对端)
ping -f 192.168.1.1              # 不限速,每收到一个就发下一个

# 看真实路径 MTU
ping -M do -s 1472 -c 1 8.8.8.8  # 不通就降 size 二分
```

> 经验法则:**默认 ping 速率每秒 1 包,正常网络 RTT 抖动应该 < 5%**——抖动大就是路径有拥塞 / 排队 / 不稳定链路。

---

## 四、ping 抓包看 4 种典型结果

### 4.1 正常通

```
$ ping baidu.com
PING baidu.com (110.242.68.66): 56 data bytes
64 bytes from 110.242.68.66: icmp_seq=0 ttl=51 time=24.3 ms
64 bytes from 110.242.68.66: icmp_seq=1 ttl=51 time=23.8 ms

→ 正常,RTT 稳定
→ TTL 51,从 64 算回去走了 13 跳
```

### 4.2 主机不可达(Host Unreachable)

```
$ ping 192.168.1.99
PING 192.168.1.99 (192.168.1.99): 56 data bytes
From 192.168.1.1 icmp_seq=0 Destination Host Unreachable

→ 网关 192.168.1.1 替"目标"回了 ICMP Type 3 Code 1
→ 通常是目标关机 / ARP 失败
```

### 4.3 网络不可达(Network Unreachable)

```
$ ping 99.99.99.99
PING 99.99.99.99 (99.99.99.99): 56 data bytes
From 192.168.1.1 icmp_seq=0 Destination Net Unreachable

→ 路由器查不到去这个网段的路由,Type 3 Code 0
```

### 4.4 100% 丢包(Request Timeout)

```
$ ping 8.8.8.8
PING 8.8.8.8 (8.8.8.8): 56 data bytes
Request timeout for icmp_seq 0
Request timeout for icmp_seq 1

→ 没收到任何回应
→ 三种可能:
   1. 对方真的下线 / 不可达
   2. 对方收到了但 ICMP 被防火墙挡(很常见)
   3. 中间某段链路单向丢包
```

**「Request Timeout」≠「不通」**——很多服务器(包括 AWS 防火墙、阿里云 ECS 默认安全组)就是把 ICMP 全 deny,但 TCP 80 端口照样开。**用 `nc -zv host port` 才是真正的端口探活**。

---

## 五、traceroute:用 TTL 让每跳路由器自暴位置

### 5.1 traceroute 的神奇之处

```
你不知道你到 8.8.8.8 中间走了哪几跳路由器
路由器又不会主动告诉你
怎么办?

利用 IP 协议的「TTL = 0 时回 ICMP Time Exceeded」机制
```

### 5.2 算法

```
第 1 轮:发 3 个 UDP/ICMP 包,TTL = 1
   → 第 1 跳路由器收到,TTL - 1 = 0,丢包 + 回 ICMP Type 11
   → 你拿到了第 1 跳的 IP

第 2 轮:发 3 个包,TTL = 2
   → 第 1 跳路由器 TTL - 1 = 1,转发
   → 第 2 跳路由器 TTL - 1 = 0,丢包 + 回 ICMP Type 11
   → 你拿到了第 2 跳的 IP

第 3 轮:发 3 个包,TTL = 3
   → 同上,拿到第 3 跳

...直到 TTL 大到包真的到达目标 8.8.8.8
   → 8.8.8.8 收到包(注意不是 ICMP Time Exceeded)
   → 如果是 UDP 探测且端口没监听,回 ICMP Type 3 Code 3 (Port Unreachable)
   → 如果是 ICMP Echo,回 Echo Reply
   → traceroute 看到对端的回应,知道到了,结束

每跳发 3 个包是为了显示 3 个 RTT(冗余 + 看抖动)
```

### 5.3 一次真实 traceroute 输出

```bash
$ traceroute -n 8.8.8.8
traceroute to 8.8.8.8 (8.8.8.8), 30 hops max, 60 byte packets
 1  192.168.1.1            1.234 ms   1.156 ms   1.089 ms
 2  100.64.0.1             8.456 ms   8.234 ms   8.123 ms
 3  61.139.2.1            12.345 ms  11.987 ms  12.234 ms
 4  202.97.34.21          15.678 ms  15.432 ms  15.234 ms
 5  202.97.94.89          18.123 ms  18.456 ms  18.234 ms
 6  * * *
 7  * * *
 8  108.170.246.1         22.789 ms  22.456 ms  22.345 ms
 9  216.239.62.55         24.123 ms  24.456 ms  24.234 ms
10  8.8.8.8               24.789 ms  24.567 ms  24.456 ms
```

**逐行解读**:

```
第 1 跳  192.168.1.1     家里的网关(LAN gateway)
第 2 跳  100.64.0.1      运营商 CGN(详见 10),这是 ISP 给的内网 IP
第 3-5 跳 61.139.x / 202.97.x  电信骨干网
第 6-7 跳 * * *           中间路由器禁了 ICMP Time Exceeded(很常见)
                          所以「无法显示」,但包确实穿过去了
第 8-9 跳 108.170 / 216.239   Google 的 AS15169 网络
第 10 跳 8.8.8.8         目标到了
```

### 5.4 为什么会有「* * *」

「* * *」表示该跳没有回任何 ICMP Time Exceeded:

```
1. 该路由器策略性禁止回 ICMP(运营商 / 大企业骨干常见)
2. 该路由器太忙,丢了所有控制平面包(rate-limit)
3. 中间链路丢包(回程被丢)
4. ICMP 被中间防火墙挡住
```

**「* * *」不代表中断**——后续还能看到回应说明包确实穿过去了,只是这一跳静默。

### 5.5 不同实现的 traceroute

```
Linux traceroute (默认 UDP)
   发 UDP 到目标的高端口(33434+)
   到达终点时:回 ICMP Type 3 Code 3 (Port Unreachable)

mtr (混合)
   默认 ICMP Echo,可以 -u UDP / -T TCP

Windows tracert
   默认 ICMP Echo Request

traceroute -I (Linux)
   用 ICMP Echo,跟 Windows 兼容

traceroute -T (Linux,paris-traceroute)
   用 TCP SYN(对穿透防火墙友好)
   tcptraceroute -p 80 google.com
```

> 经验法则:**测公网路径用 ICMP 模式;测被 ICMP 挡的服务器用 TCP 模式 -T -p 443**——TCP SYN 几乎不会被防火墙挡(因为是建连请求)。

---

## 六、mtr:ping + traceroute 合二为一的神器

### 6.1 mtr 干什么

```
mtr 持续不断地对每一跳发探测包
显示:
  - 每一跳 IP
  - 每一跳的丢包率(实时计算)
  - 每一跳的 RTT(min/avg/max/stddev)
  - 抖动(jitter)
```

### 6.2 输出示例

```bash
$ mtr -n 8.8.8.8
                              My traceroute  [v0.95]
host (192.168.1.10)                                            2026-05-10T10:15:23
                                                Packets               Pings
 Host                                       Loss%   Snt   Last   Avg  Best  Wrst StDev
 1. 192.168.1.1                              0.0%   100    1.2   1.3   1.0   2.5   0.3
 2. 100.64.0.1                               0.0%   100    8.5   8.4   7.9  10.2   0.5
 3. 61.139.2.1                               0.0%   100   12.3  12.5  12.0  14.5   0.6
 4. 202.97.34.21                             1.0%   100   15.7  15.6  15.2  18.7   0.7
 5. 202.97.94.89                            12.0%   100   18.1  18.2  17.9  22.5   0.9   ← 注意
 6. ???                                    100.0%   100    0.0   0.0   0.0   0.0   0.0
 7. ???                                    100.0%   100    0.0   0.0   0.0   0.0   0.0
 8. 108.170.246.1                            0.0%   100   22.8  22.7  22.5  25.5   0.6
 9. 216.239.62.55                            0.0%   100   24.1  24.2  23.9  26.8   0.6
10. 8.8.8.8                                  0.0%   100   24.8  24.6  24.3  27.5   0.7
```

### 6.3 mtr 的关键判读

**第 5 跳 12% 丢包,但目标 0% 丢包**——为什么?

```
两种可能:
1. 第 5 跳路由器自己「rate-limit」了 ICMP Time Exceeded
   → 真实业务包不丢,只是 ICMP 控制包被限流
   → 看「目标跳」的丢包才是真相

2. 真的有丢包
   → 但因为 TCP 重传,业务感知小
   → 但会影响延迟和带宽

判定方法:
   看「最后一跳目标」的丢包率
   目标 0% → 中间是 ICMP rate-limit,业务不影响
   目标也丢包 → 真的有问题
```

> 经验法则:**mtr 只看「最后一跳目标」的丢包率,中间跳的「丢包」90% 是 ICMP rate-limit 假象**——这是新手最容易误判的地方。

---

## 七、ICMP 黑洞:Top 1 网络疑难

### 7.1 什么是 ICMP 黑洞

**ICMP 黑洞 = 中间路径丢弃 ICMP 包,但不告诉发送方**:

```
发送方:发大包(DF=1)
路径:某段 MTU 较小,需要回 ICMP "Frag Needed"
中间防火墙:把所有 ICMP 全 deny(包括 Type 3 Code 4)
发送方:没收到任何反馈,以为是抖动,继续发大包
→ 大包永远过不去
→ 小包能过(ping)
→ 「能 ping 不能传文件」(详见 06)
```

### 7.2 为什么这么常见

```
企业防火墙的"安全省事"做法:
  - ICMP 容易被滥用做扫描 / DDoS 反射
  - 默认全 deny
  - 不细化到具体 Type/Code

很多云厂商安全组默认:
  - Inbound: ICMP deny
  - Outbound: ICMP allow

家庭路由器默认:
  - Inbound: ICMP deny(大部分)
  - Outbound: 看品牌,有些也 deny
```

### 7.3 怎么排查 ICMP 黑洞

```bash
# 1. 探路径 MTU
ping -M do -s 1472 -c 3 target   # 1500
ping -M do -s 1372 -c 3 target   # 1400
ping -M do -s 1272 -c 3 target   # 1300
# 找到第一个不通的 size,就是路径 MTU

# 2. 看是否能收到 frag needed
sudo tcpdump -i any 'icmp and icmp[icmptype]=3 and icmp[icmpcode]=4'
# 同时 ping 大包,看有没有 ICMP 回报

# 3. 看 PMTU 缓存
ip route get target
# 显示 mtu xxxx 才表示 PMTUD 工作了

# 4. 抓包分析
tcpdump -i any -n 'host target and (icmp or tcp[tcpflags] & tcp-syn != 0)'
```

### 7.4 怎么修

**详见 06 第七节**——核心方案:**MSS Clamping**(改 TCP 握手 MSS)+ **MTU 调小**(直接降本端 MTU)+ **专门放行 ICMPv4 Type 3 Code 4 / ICMPv6 Type 2**。

---

## 八、ICMP Redirect:别理它

```
Type 5,Code 0/1/2/3
"我看你发包总走这条路,其实有更近的下一跳,你直连吧"
```

**听起来很贴心,实际上是安全噩梦**:

```
ICMP Redirect 攻击:
  攻击者伪造 Redirect,让你走他的中间机
  → 中间人攻击成立
```

**所有现代 Linux 默认禁掉 ICMP Redirect 接受**:

```bash
sysctl net.ipv4.conf.all.accept_redirects = 0
sysctl net.ipv6.conf.all.accept_redirects = 0
```

> 经验法则:**抓包看到 ICMP Redirect 99% 是网络配置错(路由器策略不当)或者攻击,直接当噪声丢**。

---

## 九、ICMP 在生产环境的角色

### 9.1 监控告警

```
公网监控:
  对每个目标定时 ping,RTT > 阈值告警
  对应链路状态、可用性、抖动

内网监控:
  fping / smokeping / blackbox-exporter 持续 ping 业务节点
```

### 9.2 健康检查

```
K8s livenessProbe / readinessProbe 都是 TCP/HTTP,不用 ICMP
但「Pod 间网络是否通」常用 ping 测试
```

### 9.3 故障定位 4 步法

```
1. ping 目标         → 链路通不通
2. mtr 目标          → 中间哪一段慢/丢
3. ping -M do -s X   → 路径 MTU 多少
4. nc -zv host port  → TCP 端口可不可达
```

**这四步走完 80% 网络问题已经定位**——剩下 20% 才需要 tcpdump / Wireshark 深挖。

---

## 十、案例:线上一次「中国 → 美国突然 RTT 暴涨」

```
症状:
  10:00 起,curl 美国 API 从 80ms 涨到 350ms
  TCP 重传率从 0.3% 涨到 8%
  应用 P99 从 200ms 涨到 1500ms

排查:
$ mtr us-api.example.com
   1. 192.168.1.1              0.0%    1.2 ms
   2. 100.64.0.1               0.0%    8.5 ms
   3. 61.139.2.1               0.0%   12.3 ms
   4. 202.97.34.21             0.0%   15.7 ms
   5. 202.97.94.89             0.0%   85.6 ms   ← 这跳暴涨,说明「绕路」
   6. some-us-router           0.0%  280.3 ms   ← 跳到美国西海岸,RTT 突变
   7. ...
  10. us-api.example.com       0.0%  340.5 ms

诊断:
  正常时 第 5 跳 ≈ 18 ms(走电信 → ChinaNet → 太平洋海缆)
  现在 第 5 跳 ≈ 85 ms(说明前 4 跳后绕到了别的出口)
  → 太平洋海缆某条断了 / BGP 收敛去了备份路径

确认:
  curl http://lookingglass.tools/   或者各 ISP 的 looking glass
  发现 PCCW / NTT 在 09:50 宣告维护

结论:
  跨国海缆中断,应用层重连到加拿大 / 日本 IDC 的备份点
  ETA 4 小时恢复
```

**这就是 mtr 的真正价值**——不是「通不通」,是「**RTT 在哪一跳突变**」,直接定位是哪一段链路出问题。

---

## 十一、ICMP 抓包速查

```bash
# 抓所有 ICMP
tcpdump -i any -n icmp

# 只抓 echo request
tcpdump -i any -n 'icmp[icmptype]=8'

# 只抓 ttl exceeded(traceroute 中间反馈)
tcpdump -i any -n 'icmp[icmptype]=11'

# 只抓 frag needed(PMTUD 反馈)
tcpdump -i any -n 'icmp[icmptype]=3 and icmp[icmpcode]=4'

# IPv6
tcpdump -i any -n 'icmp6'
tcpdump -i any -n 'icmp6 and ip6[40]=128'   # echo request
tcpdump -i any -n 'icmp6 and ip6[40]=2'     # packet too big(IPv6 的 frag-needed)

# 看 ICMP 大包(可能是 ICMP 反射攻击)
tcpdump -i any -n 'icmp and greater 200'
```

---

## 十二、踩坑提醒

1. **以为 ping 不通 = 网络坏** —— 90% 是 ICMP 被防火墙挡,TCP 照样通
2. **以为 ping 通 = 业务通** —— ICMP 走不同路径 / 不同优先级
3. **mtr 中间跳的丢包率当真** —— 99% 是 ICMP rate-limit,看最后一跳才准
4. **生产用 ICMP 健康检查** —— 不靠谱,改用 TCP/HTTP probe
5. **traceroute 看到 *** —— 不是断,只是中间静默
6. **以为 traceroute 走的就是业务包路径** —— UDP/TCP/ICMP 三种 traceroute 路径可能完全不同(ECMP)
7. **改 TTL 来「绕过限制」** —— 没用,TTL 是跳数计数器,不是策略
8. **ping 不带 -c 直接 Ctrl+C** —— Linux ping 默认无限,容易忘
9. **接受 ICMP Redirect** —— 中间人攻击大门
10. **以为 ICMPv6 可以全 deny** —— 直接打瘫 NDP / SLAAC,IPv6 网络全炸(详见 07)

---

## 十三、本章 Checklist

| 项 | 说明 |
| --- | --- |
| ✅ 默写 ICMP 4 种核心 Type | Echo / Dest Unreachable / TTL Exceeded / Redirect |
| ✅ 解释 ping 内部如何算 RTT | 时间戳塞 payload + 收到时减 |
| ✅ 解释 traceroute 的 TTL 递增技巧 | 让每跳路由器返回 ICMP Type 11 |
| ✅ 看 mtr 输出能区分「真丢包」和「ICMP rate-limit」 | 看最后一跳 |
| ✅ 知道 ICMP 黑洞是怎么回事 | 防火墙挡 ICMP → PMTUD 失败 |
| ✅ 4 步排查法 | ping → mtr → 测 MTU → nc 测端口 |
| ✅ 不接受 ICMP Redirect | 安全配置 |
| ✅ 抓包能精确过滤 ICMP Type/Code | tcpdump 'icmp[icmptype]=X' |

---

下一篇:`09-路由原理.md`,讲 **路由表的本质**(目标网段 / 下一跳 / 出接口 / 度量)、**静态 vs 动态路由**的取舍、**RIP**(距离向量,跳数,收敛慢得令人发指)、**OSPF**(链路状态 + Dijkstra,域内主流,大企业内网必跑)、**BGP**(路径向量,全互联网骨架,几次 BGP 劫持事件让全球某网站离线一小时)——以及 Linux 上 `ip route` 命令怎么直接看到自己机器路由表怎么生效。
