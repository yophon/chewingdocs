# eBPF

eBPF 是现代 Linux 最重要的可观测性和网络扩展机制之一。它允许你把受限的小程序加载到内核事件点上运行,不用改内核源码、不用写内核模块,就能观测 syscall、网络包、调度、文件系统,甚至实现高性能网络转发和安全策略。这一篇讲清楚:**eBPF 程序怎么安全运行、kprobe/tracepoint/XDP/TC/uprobes 是什么、bpftrace 和 BCC 怎么用、它的边界在哪里**。

> 一句话先记住:**eBPF = 安全地在内核事件点运行的小程序**。Verifier 保证它不会崩内核,Maps 负责和用户态交换数据,Hooks 决定它挂在哪里。**可观测性、网络、安全是 eBPF 三大主战场**。它不是万能药,但它让"线上看内核正在发生什么"变得前所未有地低成本。

---

## 一、为什么需要 eBPF

传统方式:

- 加日志:要改代码、重启
- strace:开销大,信息有限
- 内核模块:危险,容易崩内核
- tcpdump:只能看包,看不到应用/内核关联

eBPF:

```
写一个小程序
加载到内核 hook 点
事件发生时执行
把统计结果写入 map
用户态读取 map
```

不需要改业务代码,也不需要重启服务。

---

## 二、eBPF 架构

```
用户态 loader
  → 加载 BPF bytecode
  → verifier 检查安全
  → JIT 编译成本机指令
  → attach 到 hook

内核事件发生
  → 执行 BPF 程序
  → 读写 BPF maps

用户态
  → 读取 maps/perf buffer/ring buffer
```

Verifier 检查:

- 程序会终止
- 不越界访问
- 不随便解引用内核指针
- 栈大小受限
- 调用 helper 合法

---

## 三、Hook 类型

| Hook | 用途 |
| --- | --- |
| tracepoint | 稳定内核跟踪点 |
| kprobe/kretprobe | 动态挂内核函数入口/返回 |
| uprobe/uretprobe | 挂用户态函数 |
| XDP | 网卡驱动早期处理包 |
| TC | Linux 流量控制层 |
| cgroup hooks | 按 cgroup 过滤/观测 |
| LSM | 安全策略 |
| perf event | CPU 性能事件 |

### 3.1 tracepoint vs kprobe

tracepoint:

- 接口较稳定
- 字段明确
- 推荐优先用

kprobe:

- 能挂几乎任意内核函数
- 内核版本变化可能导致函数名/参数变化

---

## 四、bpftrace 入门

统计进程 syscall:

```bash
bpftrace -e 'tracepoint:syscalls:sys_enter_* { @[comm] = count(); }'
```

统计 open 文件:

```bash
bpftrace -e 'tracepoint:syscalls:sys_enter_openat { printf("%s %s\n", comm, str(args->filename)); }'
```

统计函数耗时:

```bash
bpftrace -e '
kprobe:vfs_read { @start[tid] = nsecs; }
kretprobe:vfs_read /@start[tid]/ {
  @lat = hist((nsecs - @start[tid]) / 1000);
  delete(@start[tid]);
}'
```

bpftrace 适合快速排查和一次性脚本。

---

## 五、BCC / libbpf

BCC:

- Python 前端
- 内嵌 C 写 BPF 程序
- 工具丰富
- 依赖较重

libbpf + CO-RE:

- 现代生产推荐
- 编译一次,适配不同内核结构(BTF)
- C/Rust/Go 生态都在跟进

常见工具:

```bash
execsnoop
opensnoop
tcpconnect
tcptop
biolatency
runqlat
profile
```

---

## 六、网络: XDP 和 TC

XDP 在包进入协议栈前执行:

```
网卡驱动收到包
  → XDP
  → PASS / DROP / TX / REDIRECT
  → 内核网络栈
```

用途:

- DDoS 丢包
- 负载均衡
- 包过滤
- 高性能转发

TC 在协议栈稍后位置:

- 更容易拿到 skb 上下文
- 适合策略、限速、服务网格数据面

Cilium 就大量使用 eBPF 做 K8s 网络和安全策略。

---

## 七、可观测性场景

### 7.1 syscall 慢

看某个 syscall 延迟直方图。

### 7.2 run queue 延迟

`runqlat` 看任务从 runnable 到真正上 CPU 等了多久。

### 7.3 磁盘延迟

`biolatency` 看块 IO 分布。

### 7.4 TCP 重传

跟踪 `tcp_retransmit_skb`。

### 7.5 锁竞争

观察 futex、调度延迟、off-CPU 时间。

---

## 八、限制与风险

1. **内核版本差异**:能力随内核版本变化。
2. **Verifier 限制**:不能写任意复杂逻辑。
3. **观测也有开销**:高频 hook 打印会拖垮系统。
4. **字段不稳定**:kprobe 依赖内核实现。
5. **权限要求高**:通常需要 root/CAP_BPF/CAP_SYS_ADMIN。
6. **容器环境受限**:云厂商可能禁用部分能力。

---

## 九、使用原则

- 优先 tracepoint,再 kprobe
- 高频事件只做聚合,不要逐条 printf
- 线上脚本先在测试环境跑
- 设置过滤条件:pid/comm/cgroup
- 观测时间短而明确
- 复杂长期程序用 libbpf CO-RE

---

## 十、eBPF 不替代什么

eBPF 不替代:

- 应用日志
- 指标系统
- tracing
- profiler
- 正确的容量规划

它补的是"应用看不到的内核层事实"。

> **结论**:eBPF 的价值不是炫技,而是把内核变成可观测、可编程的平台。排障时它能回答传统工具回答不了的问题:到底哪个进程、哪个 syscall、哪个内核路径、哪个网络事件在拖慢系统。

