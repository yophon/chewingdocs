# eBPF / XDP / DPDK

上一篇 32 讲 io_uring 把"socket API + syscall 模型"推到了天花板,但有个前提没破:**包仍然走 Linux 内核协议栈**——网卡中断 → softirq → netfilter → IP 路由 → conntrack → TCP/UDP → socket buffer → 用户态。这条路在百万 pps 量级以上**协议栈本身就是瓶颈**:DDoS 来 1000 万 SYN 包,你 io_uring 写得再优雅,内核 conntrack 表先爆;K8s 集群 iptables 几千条规则,每个包都要线性扫,延迟蹿到几百微秒。**这一层的解法分两派**:**eBPF / XDP——把代码塞到内核里、塞到网卡驱动里,在协议栈之前判决**(留在内核,安全;Cilium / Cloudflare / Meta 用);**DPDK——彻底绕过内核,网卡驱动搬到用户态,CPU 永远轮询**(出内核,极致;5G 基站 / 高频交易用)。本篇讲清楚这四个名词、它们在性能金字塔的位置、为什么 epoll → io_uring → XDP → DPDK 是四个量级的跨越,以及"工程师什么时候真用得上"。

> 一句话先记住:**eBPF = 在 Linux 内核里安全运行的字节码 VM**(verifier 静态检查 → 不会崩内核 → 可以 hook 几乎任何位置:socket / xdp / tracepoint / kprobe);**XDP = eBPF 在网卡驱动层(协议栈之前)的 hook 点**,能在包进入 Linux 网络栈前就 drop / pass / redirect,**线速 10M+ pps DDoS 防御**;**DPDK = 完全用户态网络栈**,网卡驱动绑用户态进程、CPU 100% 轮询、大页内存、CPU 亲和性绑核——**线速 100M+ pps,但代价是吃满 CPU 核 + 失去 Linux 协议栈所有功能**。**性能金字塔**:`epoll(100K QPS)→ io_uring(500K-1M QPS)→ XDP(10M pps drop / 5M pps L4)→ DPDK(100M+ pps,网卡线速)`。**99% 业务 epoll / io_uring 够了;1% 做防火墙、L4 负载均衡、5G、CDN edge、HFT 才碰 XDP / DPDK**——但你必须知道存在,因为现代 K8s 网络(Cilium)、CDN(Cloudflare 用 XDP)、SDN 都在这一层。

---

## 一、为什么 io_uring 之后还有故事

### 1.1 内核协议栈的固有开销

一个 64 字节小包从网卡到达用户态要走完:

```
网卡 RX                   1 µs (DMA + 中断)
softirq + napi            2 µs
netfilter PREROUTING      0.5-50 µs (规则数线性,iptables 几千条就崩)
IP 路由表查找             0.3 µs
conntrack 查询/创建       1 µs (表满直接丢包)
TCP/UDP 协议处理          0.5 µs
socket 收队列入队          0.3 µs
epoll 唤醒 + 用户态拷贝    1 µs
─────────────────────────────────
合计                      6-50+ µs
```

**100M pps 线速** = 每包 10ns 处理预算——**根本走不完上面这条路**。

### 1.2 两个突破口

```
方案 A:在协议栈之前就拦截(eBPF / XDP)
  → 留在内核,享受内核安全和兼容,只在驱动层加 hook
  → 适合 DDoS drop / L4 LB / K8s CNI

方案 B:把网卡和驱动整个搬到用户态(DPDK)
  → 离开内核,无中断、无协议栈、CPU 100% 轮询
  → 适合 NFV、5G、HFT、自己实现一整个网络栈
```

**两条路线不是替代,是分工**——下面分别讲。

---

## 二、eBPF:可以跑在内核里的"沙盒字节码"

### 2.1 什么是 eBPF

```
e = extended (区别于 1992 年原始的 BPF "Berkeley Packet Filter")

eBPF 程序:
  1. 用 C 写(或 Rust),clang -target bpf 编译成 BPF 字节码
  2. 用户态加载 → 内核 BPF verifier 静态检查
        - 没有无限循环(早期硬限制,5.3+ 支持有界循环)
        - 不越界访问内存
        - 不调任意函数(只能调白名单 BPF helpers)
        - 路径数 <= 100 万(verifier 路径爆炸保护)
  3. JIT 编译成原生机器码
  4. attach 到内核某个 hook 点
  5. 包/事件触发时执行,几纳秒级
```

**关键卖点**:**不是模块、不会崩内核、可以热插拔、可以读内核数据结构**——这是过去 30 年内核可观测/可编程从来没有过的能力。

### 2.2 eBPF 能 hook 哪些点

| hook 类型 | 用途 | 例子 |
| --- | --- | --- |
| **kprobe / kretprobe** | 内核任意函数前后 | bpftrace 抓 `tcp_sendmsg` 调用 |
| **tracepoint** | 内核预定义跟踪点 | 抓 `sched_switch` 看上下文切换 |
| **uprobe** | 用户态函数 | 抓 `malloc` 看内存分配 |
| **XDP** | 网卡驱动收包路径(最早) | DDoS drop / L4 LB |
| **tc (traffic control)** | qdisc 入口/出口 | 出口流量控制、加密、镜像 |
| **socket filter / sockops** | socket 层面 | TCP BPF、连接跟踪 |
| **cgroup** | cgroup 内进程的 syscall / network | 容器网络隔离 |
| **LSM (Linux Security Module)** | 安全决策点 | 替代 SELinux 的部分场景 |
| **perf event** | 采样性能事件 | flamegraph 火焰图 |

**网络栈相关的最热三个**:**XDP**(收包最早)、**tc-bpf**(出入口流量控制)、**sockops**(连接级别)。

### 2.3 一个最小的 BPF 程序(C 写)

```c
// drop_udp.bpf.c —— 把所有 UDP 包丢掉
#include <linux/bpf.h>
#include <bpf/bpf_helpers.h>
#include <linux/if_ether.h>
#include <linux/ip.h>

SEC("xdp")
int drop_udp(struct xdp_md *ctx)
{
    void *data     = (void *)(long)ctx->data;
    void *data_end = (void *)(long)ctx->data_end;

    struct ethhdr *eth = data;
    if ((void *)(eth + 1) > data_end) return XDP_PASS;
    if (eth->h_proto != __constant_htons(ETH_P_IP)) return XDP_PASS;

    struct iphdr *ip = (void *)(eth + 1);
    if ((void *)(ip + 1) > data_end) return XDP_PASS;

    if (ip->protocol == IPPROTO_UDP)
        return XDP_DROP;

    return XDP_PASS;
}

char _license[] SEC("license") = "GPL";
```

**编译加载**:

```bash
clang -O2 -g -target bpf -c drop_udp.bpf.c -o drop_udp.o
ip link set dev eth0 xdp obj drop_udp.o sec xdp
# 卸载
ip link set dev eth0 xdp off
```

**这就是 XDP**——21 行 C 代码,在网卡驱动里跑,**线速丢 UDP 包**。

### 2.4 BPF maps:用户态和内核态共享数据

```c
struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __type(key, __u32);     // 源 IP
    __type(value, __u64);   // 包计数
    __uint(max_entries, 65536);
} ip_counter SEC(".maps");
```

**用户态读 map**(via libbpf):

```c
__u32 ip = ...; __u64 cnt;
bpf_map_lookup_elem(map_fd, &ip, &cnt);
```

**这是 eBPF 给"内核里采集 / 用户态消费"提供的核心数据通道**——bpftrace、Cilium、Falco 全用这个。

---

## 三、XDP:网卡驱动层的"前置关卡"

### 3.1 XDP 的位置

```
传统 Linux 网络栈(简化):
  网卡 → 中断 → driver napi poll → skb 分配 → tcpdump/AF_PACKET hook
       → netfilter PREROUTING → 路由 → netfilter INPUT → 协议栈 → socket

XDP:
  网卡 → driver napi poll → ★ XDP eBPF program ★ → skb 分配 → ...
                              ↑
                    在 skb 分配之前,处理裸 frame
                    省掉 skb 分配是 XDP 快的最大原因
```

**XDP 程序返回值**:

| 返回 | 含义 |
| --- | --- |
| `XDP_DROP` | 直接丢,不再处理 |
| `XDP_PASS` | 放行,继续走正常协议栈 |
| `XDP_TX` | 在原网卡发回(反弹)——L4 LB 在用 |
| `XDP_REDIRECT` | 重定向到另一个网卡或 CPU(AF_XDP 用户态) |
| `XDP_ABORTED` | 异常,会触发 trace 事件 |

### 3.2 三种部署模式

```
1. Native XDP(最快)
   网卡驱动原生支持(mlx5、i40e、ice、virtio_net 等都支持)
   在驱动 napi poll 里直接调 BPF
   单核 ~20-30 Mpps drop

2. Generic XDP(通用,慢)
   驱动不支持时的回退,在协议栈早期跑
   性能跟普通 netfilter 差不多
   单核 ~3-5 Mpps drop

3. Offloaded XDP(最快)
   网卡硬件直接执行 BPF(Netronome 智能网卡)
   100% bypass CPU,实测 100+ Mpps,但硬件少
```

### 3.3 XDP 的杀手级应用

**1. DDoS 防御**(Cloudflare 公开过)

```
正常:1000 万 SYN/s → 内核 conntrack 表爆 → 服务死
XDP:在 driver 层判决 → 黑名单 IP 直接 DROP → CPU 占用几乎 0
```

Cloudflare 在 XDP 里用 BPF map 维护"黑名单 IP + 速率限制",百 G 流量服务器单台扛 50M+ pps DDoS 不眨眼。

**2. L4 负载均衡**(Facebook Katran 公开过)

```c
SEC("xdp")
int xdp_lb(struct xdp_md *ctx)
{
    /* 解析 IP/TCP 头 */
    /* 一致性哈希查 backend */
    __be32 backend_ip = consistent_hash_lookup(...);
    /* 改写目标 IP,XDP_TX 弹回去 */
    return XDP_TX;
}
```

**Katran 单核 5M PPS L4 LB**——比 LVS(走内核协议栈)快 10 倍以上。

**3. K8s 网络:Cilium**

Cilium 用 XDP + tc-bpf **完全替代 iptables / IPVS** 实现 Service / NetworkPolicy / kube-proxy:

```
传统 K8s kube-proxy(iptables 模式):
  Service 数量 1000+ → 每包过几千条 iptables 规则 → 延迟蹿到几百微秒

Cilium:
  XDP 在网卡层处理 Service VIP DNAT
  tc-bpf 做 NetworkPolicy + 加密
  延迟降到几微秒,Service 数量翻 10 倍也不影响
```

**Cilium 是 eBPF 在生产规模的最大成功案例**——AKS / EKS / Anthos 都已支持。

### 3.4 AF_XDP:用户态 + XDP 的桥梁

XDP 还能把包送到**用户态共享内存环**(类似 io_uring 的 SQ/CQ),让用户态进程直接处理裸 frame:

```c
return bpf_redirect_map(&xsks_map, queue_id, 0);
```

**这就是 AF_XDP**——给"想要 DPDK 性能但又不想离开 Linux 内核"的中间方案。**Suricata IDS、Vector(Datadog)、Cloudflare 部分场景在用**。

---

## 四、tc-bpf:出入口流量整形

XDP 只能挂在**入口**(收包),**出口**(发包)挂不上——这时候用 **tc-bpf**:

```
tc(traffic control)是 Linux 自带的 QoS 框架
  - qdisc(队列规则)
  - filter / classifier
  - action

tc-bpf 把 BPF 程序当作 filter / action,挂在 qdisc 上
```

**典型用法**:

```bash
tc qdisc add dev eth0 clsact
tc filter add dev eth0 egress bpf da obj egress.bpf.o sec tc/egress
# 出口每个包都过这个 BPF 程序
```

**应用场景**:

- 出口流量计费 / 限速
- 容器之间加密(WireGuard 模式)
- IPv6 → IPv4 转换
- Cilium 的 NetworkPolicy 出口规则

**XDP 入、tc-bpf 出**——形成完整的"内核层可编程网络"。

---

## 五、bpftrace:eBPF 的 awk

```bash
# 抓所有 TCP 连接的目标地址 + 程序名
bpftrace -e '
kprobe:tcp_connect {
  printf("%s -> ", comm);
}
'

# 统计每个进程发了多少 UDP 包
bpftrace -e '
tracepoint:net:net_dev_queue { @[comm] = count(); }
'

# TCP 重传统计(分位数)
bpftrace -e '
kprobe:tcp_retransmit_skb { @[comm] = count(); }
interval:s:5 { print(@); clear(@); }
'
```

**bpftrace 是"运维 eBPF 第一入口"**——不用写 C、不用编译、一行命令出结果。**bcc / bpftrace / Pixie / Inspektor Gadget** 这一票工具全是 eBPF 的高层封装。

---

## 六、DPDK:完全离开内核

### 6.1 DPDK 的三大支柱

```
1. PMD(Poll Mode Driver):用户态网卡驱动,CPU 100% 轮询(无中断)
2. 大页内存(HugePage):2MB / 1GB 页,减少 TLB miss
3. CPU 亲和性 + lcore 模型:每核一个轮询线程,无线程切换
```

**为什么必须 100% 轮询**:

```
中断驱动:小流量省电,但每个中断 1-2 µs 切换开销 → 大流量死
轮询驱动:小流量浪费 CPU,但大流量零中断 → 100M pps 都不眨眼
```

**这是反直觉的优化**——**用 100% CPU 换确定性的 ns 级延迟**。

### 6.2 一个最小 DPDK 程序(伪代码)

```c
#include <rte_eal.h>
#include <rte_ethdev.h>
#include <rte_mbuf.h>

int main(int argc, char **argv) {
    rte_eal_init(argc, argv);                      // 初始化 EAL
    rte_eth_dev_configure(0, 1, 1, &port_conf);    // 配置网卡端口 0
    rte_eth_rx_queue_setup(0, 0, 1024, 0, NULL, mbuf_pool);
    rte_eth_tx_queue_setup(0, 0, 1024, 0, NULL);
    rte_eth_dev_start(0);

    /* 主轮询循环——这个核 100% 给我 */
    while (1) {
        struct rte_mbuf *bufs[32];
        uint16_t n = rte_eth_rx_burst(0, 0, bufs, 32);   // 收一批
        for (int i = 0; i < n; i++) {
            process(bufs[i]);                             // 自己解析协议
        }
        rte_eth_tx_burst(0, 0, bufs, n);                  // 发回去
    }
}
```

**注意**:**没有 socket、没有 IP 栈、没有 TCP**——你要自己实现,或用 DPDK 之上的 stack(VPP、F-Stack、Seastar、TLDK)。

### 6.3 DPDK 的代价

| 维度 | 代价 |
| --- | --- |
| **CPU** | 每个轮询核 100% 占用,不工作也满 |
| **内存** | 必须预留大页(GB 级) |
| **网卡** | 网卡被独占,Linux 看不见 |
| **协议栈** | 没有,要自己写或用 F-Stack(把 FreeBSD 协议栈搬过来) |
| **运维** | tcpdump 用不了、ip 命令看不到、监控工具全失效 |
| **调试** | 大部分内核工具失效 |

**这就是为什么 DPDK 99% 业务用不到**——除非你做的是 5G UPF、运营商 NFV、CDN edge、HFT、SDN switch fabric——这些场景**单机数百 Gbps 流量不能丢一个包**。

---

## 七、XDP vs DPDK:用户态 vs 内核态的高性能之争

| 维度 | XDP(内核态高性能) | DPDK(用户态绕过) |
| --- | --- | --- |
| 位置 | 网卡驱动 + eBPF | 用户态进程 + PMD |
| 是否独占网卡 | 否(协议栈共用) | **是**(独占) |
| CPU 占用 | 低(空闲不轮询) | **100% / 核** |
| 包处理上限 | 单核 10-30 Mpps | 单核 30-100 Mpps |
| 延迟 | μs 级 | **亚 μs 级** |
| 协议栈 | 复用 Linux 完整栈 | **自己写或用 F-Stack** |
| 编程复杂度 | 中(eBPF C + verifier 限制) | 高(全套自己来) |
| 调试 | 内核工具仍可用 | 内核工具全失效 |
| 典型用户 | Cilium / Cloudflare / Katran | 5G UPF / VPP / HFT |
| 心智模型 | "内核可编程" | "用户态网络栈" |

**选择原则**:

```
能用 XDP 解决就别上 DPDK——XDP 的运维 / 调试 / 兼容性好太多
DPDK 是"穷尽 XDP 仍不够"的最后一招
```

**Cloudflare 公开数据**:从 iptables 迁到 XDP,DDoS 防御能力提升 **20 倍**;再从 XDP 迁部分到 DPDK,提升 **1.5-2 倍**——可见 XDP 已经吃掉大头收益,DPDK 只在最极致场景才值得。

---

## 八、性能金字塔:四个量级,选你需要的

```
   ▲ 性能 / 复杂度
   │
   │  ┌────────────────────┐
   │  │  DPDK              │  100M+ pps / 核
   │  │  用户态轮询 + 大页  │  亚 µs 延迟
   │  │  独占网卡 + CPU     │  5G / NFV / HFT
   │  └────────────────────┘
   │  ┌────────────────────┐
   │  │  XDP / AF_XDP      │  10-30M pps / 核
   │  │  内核驱动层 BPF     │  µs 级延迟
   │  │  Cilium / Katran    │  DDoS / L4 LB / K8s
   │  └────────────────────┘
   │  ┌────────────────────┐
   │  │  io_uring          │  500K-1M QPS / 核
   │  │  共享 SQ/CQ + SQPOLL│  几 µs 延迟
   │  │  Rust monoio        │  极致网络应用
   │  └────────────────────┘
   │  ┌────────────────────┐
   │  │  epoll             │  100-300K QPS / 核
   │  │  事件循环 + LT/ET   │  几十 µs 延迟
   │  │  Nginx / Redis     │  绝大多数业务
   │  └────────────────────┘
   │
   └───────────────────────► 适用范围 / 成熟度
```

**选择经验**:

```
单机 < 50K QPS / 任何业务            → epoll 都嫌奢侈
单机 50K-500K QPS / 通用 web         → epoll(Nginx/Netty)
单机 500K-1M QPS / 关键路径          → io_uring
百 K-M pps / DDoS / L4 LB / K8s 网络  → XDP / Cilium
G+ pps / 5G 基站 / NFV / HFT          → DPDK / VPP
```

**别"为高性能而高性能"**——栈越底越快,但**调试难度、运维难度、兼容性代价是指数级上升**。

---

## 九、生产案例速览

| 公司 / 产品 | 用了什么 | 干什么 |
| --- | --- | --- |
| **Cloudflare** | XDP + AF_XDP | 全球 DDoS 防御、Magic Transit |
| **Meta / Facebook** | XDP(Katran) | L4 LB,替代硬件 LB |
| **Google** | eBPF / Cilium | GKE Dataplane V2 |
| **Cilium** | XDP + tc-bpf | K8s CNI,替代 iptables |
| **Datadog** | eBPF(NPM) | 网络性能监控 |
| **Falco** | eBPF | 运行时安全(syscall 监控) |
| **VPP**(FD.io) | DPDK | 软件路由器 / SDN 交换 |
| **5G UPF**(中国移动等) | DPDK + SR-IOV | 用户面承载 |
| **Open vSwitch** | DPDK / XDP 双模式 | 虚拟交换机 |
| **Solarflare HFT** | DPDK / OpenOnload | 高频交易 |

**eBPF / XDP 在 2023-2025 这两年是 Linux 生态最热的方向**——工程师无论做云原生、安全、可观测、网络,都迟早会撞上。

---

## 十、踩坑提醒

1. **以为 eBPF 等于 XDP**——eBPF 是 VM,XDP 是 hook 点;eBPF 还能挂 kprobe / tracepoint / cgroup 等几十种位置
2. **XDP 测试用 veth / loopback**——这些虚拟设备 XDP 路径和真网卡不同,数据不准;务必上物理网卡或 vfio
3. **写 BPF 程序触发 verifier 报错看不懂**——用 `bpftool prog dump` 看反汇编、`bpftool feature` 看内核能力,逐步加 `bpf_printk` 排查
4. **XDP 改 IP 头不重算 checksum**——包到对方被丢,bpf_csum_diff / l3_csum_replace helper 别忘
5. **DPDK 把网卡独占了 Linux 看不见**——`ip link` 看不到 eth1 别慌,是 `dpdk-devbind.py` 把它绑给 vfio 了
6. **DPDK lcore 没绑核**——线程被调度跨核跑,缓存全冷,延迟蹿
7. **大页配置不够 / NUMA 不对**——DPDK 启动失败或者性能差一半;`numactl --hardware` 看 NUMA 分布,大页要在对的 NUMA 节点
8. **Cilium kube-proxy replacement 模式没装内核 5.4+**——XDP / sockops 关键 hook 缺,功能被降级
9. **生产开 XDP 不跑过压测**——XDP 程序 bug 直接弹包丢、网卡假死,**先在镜像流量上压一轮再上**
10. **盲目追性能金字塔顶层**——业务 QPS 10K,上 DPDK 是给运维制造灾难;先 profile 看真瓶颈,再选层

---

下一篇:`34-Nginx深度.md`,把这一层"内核 + 高性能 IO"全部串到工程实战——Nginx 的事件模型(epoll + 多 worker + SO_REUSEPORT)、配置精要(server / location / upstream / proxy_pass / ssl_session_cache)、调优点(worker_connections / keepalive / sendfile / TCP_NODELAY / tcp_nopush)、Lua/OpenResty 怎么把 Nginx 变成可编程网关、为什么 Nginx 至今不上 io_uring 而 Envoy 选了不同路线,以及一份"开箱即用的生产 Nginx 反代配置注解版"——这一篇是网络系列从"理论"过渡到"工程实战"的转折点。
