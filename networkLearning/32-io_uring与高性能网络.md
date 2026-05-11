# io_uring 与高性能网络

上一篇 31 讲 epoll 把"等谁就绪"做到了 O(1),把 select / poll 时代的 1024 fd 上限扫进了历史——但 epoll **没解掉一个根本问题**:**就绪之后还要 syscall**。每接一个连接 `accept`、读一次数据 `recv`、回一次响应 `send`、关一次连接 `close`——一个完整请求至少 4-6 次 syscall,每次 100-200ns,**百万 QPS 场景光 syscall 就吃掉 1-2 个 CPU 核**。2019 年 Linux 5.1 合入 Jens Axboe 的 io_uring,**第一次让 IO 提交不需要 syscall**——内核和用户态共享两个环形队列,你写 SQ、内核读 SQ 处理、写 CQ、你读 CQ。**N 个 IO = 1 次 syscall,甚至 0 次**。本篇讲 io_uring 在网络栈的应用、liburing API、SQPOLL 零 syscall 模式、和 epoll 的真实性能对比、当前生态(Rust monoio / glommio / Go 还没原生支持),以及——**什么时候 epoll 仍然够用、不必上 io_uring**。**详见 osLearning/22 io_uring 内核机制深入**(SQ/CQ 数据结构、kernel side 实现、安全模型),本章只讲网络栈这一面的应用。

> 一句话先记住:**io_uring = 内核 + 用户态共享一对无锁环形队列(SQ 提交、CQ 完成),把 N 次 IO syscall 合成 1 次,SQPOLL 模式下甚至 0 次**。**核心革命**:不是"快一点点",是**模型从'同步 syscall'变成'异步消息队列'**——和 epoll 的"等就绪 + 自己 read/write"完全不同。**网络场景的实际数据**:小包 echo 短连接 io_uring 比 epoll 快 20%-50%(5.6+ 内核),长连接低 QPS 场景几乎打平,**真正拉开差距是磁盘 + 网络混合 IO**(epoll 不支持普通文件 fd,得线程池;io_uring 文件 + socket 一把梭)。**现状**:Rust monoio / glommio 已生产、tokio io_uring 后端 alpha、**Go 1.23 仍是 epoll(调度模型不兼容)**。**何时仍用 epoll**:内核 < 5.10、不写 C/Rust、纯网络无磁盘 IO、运维不熟、需要极致兼容——这些场景 epoll 还能撑十年。

---

## 一、为什么 epoll 还不够:syscall 这道墙

### 1.1 epoll 时代一个请求的 syscall 账

以 HTTP/1.1 短连接 echo 为例:

```
accept4(listen_fd, ...)             1 次 syscall (~150ns)
epoll_ctl(ADD, conn_fd)             1 次 syscall (~100ns)
epoll_wait()                        N 个事件均摊 ~50ns
recv(conn_fd, buf, 4096)            1 次 syscall (~200ns)
send(conn_fd, buf, n)               1 次 syscall (~200ns)
epoll_ctl(DEL, conn_fd)             1 次 syscall (~100ns)
close(conn_fd)                      1 次 syscall (~100ns)
─────────────────────────────────────────────
合计                                ~900 ns / 请求
```

**100 万 QPS 场景**:syscall 总耗时 = 1M × 900ns = **0.9 秒/秒**——**单核 90% 时间在做 syscall 切换,只剩 10% 给业务**。

**这就是 epoll 的天花板**:不是 epoll 慢,是 syscall 本身已成本不可忽略。

### 1.2 syscall 慢在哪(回顾 osLearning/02)

```
1. CPU 特权切换 (ring 3 → ring 0)        几十周期
2. 寄存器保存恢复(十几个)                几十周期
3. TLB 部分刷新                           几十-几百周期(KPTI 后更糟)
4. 缓存污染(L1/L2 被内核代码挤掉)        几百周期
5. 分支预测失败                           几十周期
─────────────────────────────────────────────────
总计                                      ~100-300 周期 = 30-100 ns(空 syscall)
真实带数据的 syscall                      ~200-1000 ns
```

**Spectre / Meltdown 之后的 KPTI**(Kernel Page Table Isolation)还把这个数字翻了一倍——**每次 syscall 要切两套页表**。

### 1.3 思路转变:从"系统调用"到"消息队列"

**epoll 模型**(同步 syscall):

```
用户态                          内核
  │ epoll_wait → 阻塞 ─────→  等事件
  │ ←──────── 唤醒返回 ─────│  fd 就绪
  │ recv() ──────────────→   读数据,拷给用户
  │ ←──────── 返回字节数 ───│
  │ send() ──────────────→   写数据
  │ ←──────── 返回字节数 ───│
```

**io_uring 模型**(异步消息):

```
用户态(SQ)                     内核(共享内存)               用户态(CQ)
  │ 写 SQE: accept ──────────→ [SQ Ring]
  │ 写 SQE: recv  ──────────→ [SQ Ring]
  │ 写 SQE: send  ──────────→ [SQ Ring]
  │ io_uring_enter()(可选) ──→ 内核处理三个 SQE
  │                            完成后写 CQE
  │ ←─────────────────────── [CQ Ring]  ←────  CQE: accept done, conn_fd=12
  │ ←─────────────────────── [CQ Ring]  ←────  CQE: recv done, n=128
  │ ←─────────────────────── [CQ Ring]  ←────  CQE: send done, n=128
```

**关键**:**用户态写 SQE 是普通内存写**(共享内存,无 syscall);**内核读 SQE 也是普通内存读**——只在"通知内核有新 SQE"时才需要一次 `io_uring_enter`,而 SQPOLL 模式连这个都省了。

---

## 二、io_uring 数据结构:两个环

```
                  共享内存(mmap 三段)
                  ┌────────────────────┐
   用户态 写 ───→ │   SQ Ring (head/tail/array)  │ ←─── 内核态 读
                  ├────────────────────┤
                  │   SQE Array(具体的 IO 请求)  │
                  ├────────────────────┤
   用户态 读 ───→ │   CQ Ring (head/tail/array)  │ ←─── 内核态 写
                  └────────────────────┘
                  
  SQE = Submission Queue Entry,描述一个 IO 请求
  CQE = Completion Queue Entry,描述一个完成结果(对应一个 SQE)
```

### 2.1 SQE 长什么样

```c
struct io_uring_sqe {
    __u8  opcode;        // IORING_OP_ACCEPT / RECV / SEND / READ / WRITE / ...
    __u8  flags;
    __u16 ioprio;
    __s32 fd;            // 操作的 fd
    union {
        __u64 off;       // 偏移(文件)
        __u64 addr2;
    };
    __u64 addr;          // buffer 地址
    __u32 len;           // 长度
    union {
        __u32 rw_flags;
        __u32 fsync_flags;
        __u16 poll_events;
        ...
    };
    __u64 user_data;     // 用户透传字段,CQE 原样返回(常用作请求 ID)
    union { ... };
};
```

**关键字段**:`opcode` 决定干啥、`fd` 是 socket、`addr/len` 是 buffer、`user_data` 是你自己的句柄(指针/ID)用来在 CQE 里识别"这是哪个请求的回应"。

### 2.2 CQE 长什么样

```c
struct io_uring_cqe {
    __u64 user_data;    // 跟 SQE 透传的一样
    __s32 res;          // 返回值(就像 syscall 的返回值,负数是 -errno)
    __u32 flags;
};
```

**`res` 完全等价于对应同步 syscall 的返回值**——`recv` 返回字节数、出错返回 `-EAGAIN` / `-ECONNRESET` 等。

### 2.3 提交流程

```c
// 1. 拿一个 SQE(从环上分配)
struct io_uring_sqe *sqe = io_uring_get_sqe(&ring);

// 2. 填字段
io_uring_prep_recv(sqe, conn_fd, buf, sizeof(buf), 0);
sqe->user_data = (__u64)conn;   // 自定义上下文

// 3. 提交(更新 SQ tail,可能触发 io_uring_enter)
io_uring_submit(&ring);

// 4. 等待 / 取完成事件
struct io_uring_cqe *cqe;
io_uring_wait_cqe(&ring, &cqe);
struct conn *c = (void *)cqe->user_data;
ssize_t n = cqe->res;
io_uring_cqe_seen(&ring, cqe);
```

**这套是 liburing 的高级 API**,原始 syscall 也能直接用,但 liburing 帮你管 ring 的 head/tail 和 memory barrier。

---

## 三、liburing:写 io_uring 的标准库

```bash
# Debian/Ubuntu
apt install liburing-dev
# 或源码 https://github.com/axboe/liburing
```

### 3.1 网络相关 opcode

| opcode | 对应 syscall | 说明 |
| --- | --- | --- |
| `IORING_OP_ACCEPT` | accept4 | 异步 accept |
| `IORING_OP_CONNECT` | connect | 异步 connect |
| `IORING_OP_RECV` / `RECVMSG` | recv / recvmsg | 异步收 |
| `IORING_OP_SEND` / `SENDMSG` | send / sendmsg | 异步发 |
| `IORING_OP_CLOSE` | close | 异步关 |
| `IORING_OP_SHUTDOWN` | shutdown | 异步半关 |
| `IORING_OP_POLL_ADD` | (epoll 类) | 等 fd 可读/可写,不动数据 |
| `IORING_OP_PROVIDE_BUFFERS` | — | 预注册 buffer 池,RECV 自动取 |
| `IORING_OP_LINK_TIMEOUT` | — | 给上一个 SQE 加超时 |

**5.6 内核**起 RECV / SEND 全支持;**5.19** 起增加 multishot 模式(一次 ACCEPT 后续连接全自动放 CQ,不用每次重新 prep)。

### 3.2 一个 io_uring echo server(简化骨架)

```c
#include <liburing.h>
#include <netinet/in.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <unistd.h>

#define QD 256                /* 队列深度 */
#define BUF_SIZE 4096

enum { OP_ACCEPT, OP_RECV, OP_SEND };

struct req {
    int op;
    int fd;
    char buf[BUF_SIZE];
    int len;
};

static void prep_accept(struct io_uring *ring, int srv) {
    struct req *r = calloc(1, sizeof(*r));
    r->op = OP_ACCEPT;
    r->fd = srv;
    struct io_uring_sqe *sqe = io_uring_get_sqe(ring);
    io_uring_prep_accept(sqe, srv, NULL, NULL, 0);
    io_uring_sqe_set_data(sqe, r);
}

static void prep_recv(struct io_uring *ring, int conn) {
    struct req *r = calloc(1, sizeof(*r));
    r->op = OP_RECV; r->fd = conn;
    struct io_uring_sqe *sqe = io_uring_get_sqe(ring);
    io_uring_prep_recv(sqe, conn, r->buf, BUF_SIZE, 0);
    io_uring_sqe_set_data(sqe, r);
}

static void prep_send(struct io_uring *ring, int conn,
                      char *buf, int len) {
    struct req *r = calloc(1, sizeof(*r));
    r->op = OP_SEND; r->fd = conn;
    memcpy(r->buf, buf, len); r->len = len;
    struct io_uring_sqe *sqe = io_uring_get_sqe(ring);
    io_uring_prep_send(sqe, conn, r->buf, len, MSG_NOSIGNAL);
    io_uring_sqe_set_data(sqe, r);
}

int main(void) {
    int srv = /* socket + setsockopt + bind + listen,见 30 章 */;

    struct io_uring ring;
    io_uring_queue_init(QD, &ring, 0);

    prep_accept(&ring, srv);
    io_uring_submit(&ring);

    for (;;) {
        struct io_uring_cqe *cqe;
        io_uring_wait_cqe(&ring, &cqe);
        struct req *r = io_uring_cqe_get_data(cqe);
        int res = cqe->res;

        switch (r->op) {
        case OP_ACCEPT:
            if (res >= 0) {
                prep_recv(&ring, res);
                prep_accept(&ring, srv);   /* 继续 accept */
            }
            break;
        case OP_RECV:
            if (res > 0)        prep_send(&ring, r->fd, r->buf, res);
            else                close(r->fd);
            break;
        case OP_SEND:
            if (res > 0)        prep_recv(&ring, r->fd);
            else                close(r->fd);
            break;
        }
        free(r);
        io_uring_cqe_seen(&ring, cqe);
        io_uring_submit(&ring);
    }
}
```

**对比上一章的 epoll 版**:

- **没有 epoll_ctl**——所有"我想干什么"通过 SQE 写共享内存,无 syscall
- **没有非阻塞 socket 必须循环 read 的 ET 痛苦**——recv 一次提交,完成就一次 CQE
- **更接近"future / promise" 的编程模型**——每个操作有 callback(在 cqe 处理里)

### 3.3 multishot accept(5.19+):一次提交,后续全自动

```c
io_uring_prep_multishot_accept(sqe, srv, NULL, NULL, 0);
// 之后每来一个新连接,自动产生一个 CQE,不需要重新 prep_accept
```

**好处**:**accept 路径上零 SQE 申请、零 user 内存分配**——百万短连接场景再省 5-10% CPU。

---

## 四、SQPOLL:零 syscall 模式

```c
struct io_uring_params p = { .flags = IORING_SETUP_SQPOLL,
                             .sq_thread_idle = 2000 /* ms */ };
io_uring_queue_init_params(QD, &ring, &p);
```

**做了什么**:**内核启一个 kernel thread 专门轮询你的 SQ ring**。

```
普通模式:
  你写 SQE → io_uring_submit() → io_uring_enter syscall → 内核读 SQ
                                                         ↑
                                                    每次提交 1 syscall

SQPOLL 模式:
  你写 SQE → 更新 SQ tail(普通内存写)→ kernel thread 轮询发现 → 处理
                                                         ↑
                                                    完全无 syscall

  只有 kernel thread 闲了 sq_thread_idle 毫秒(进入睡眠后),
  你提交才需要再 io_uring_enter 唤醒它
```

**代价**:

- **占用一整个 CPU 核**(kernel thread 一直跑)
- **要 root 或 `CAP_SYS_NICE`**(5.11+ 放宽到普通用户)
- **冷启动时第一个请求可能慢**(thread 在睡)

**适用场景**:**专用网络服务器**,延迟极致敏感(比如交易系统、5G UPF),愿意为零 syscall 牺牲一个核。

**实测**:SQPOLL 在 Mellanox 100G 网卡 + Optane SSD 场景下,**端到端延迟从 6μs 降到 3μs**,QPS 提升 30%。

---

## 五、io_uring 的"高级武器"

### 5.1 注册 buffer / 注册 fd:省一次内核拷贝校验

```c
struct iovec iov[N] = { ... };
io_uring_register_buffers(&ring, iov, N);
// 之后用 IORING_OP_READ_FIXED / WRITE_FIXED 引用 buffer 索引
// 内核不用每次 IO 都做 copy_from_user / 校验权限
```

**注册 fd**:`io_uring_register_files`——**省去每次 IO 内核做 fd → file* 的查找**。

### 5.2 链式 SQE:链路依赖一次提交

```c
sqe1 = io_uring_get_sqe(...); io_uring_prep_recv(...); sqe1->flags |= IOSQE_IO_LINK;
sqe2 = io_uring_get_sqe(...); io_uring_prep_send(...);
// recv 完成后才执行 send,前者失败后者自动取消
io_uring_submit(&ring);
```

**经典用法**:**recv → send echo,一次提交两个 SQE,内核串起来执行**——再省一半的"回到用户态调度"的开销。

### 5.3 IORING_FEAT_FAST_POLL:内核内置 poll

5.7 起,**RECV 这种"如果当前没数据就要等"的操作,内核直接挂内部 poll 等就绪,然后再处理**——你不用先 POLL_ADD 再 RECV,一次 prep_recv 就够。

### 5.4 multishot recv + provide buffers(5.19+)

```c
io_uring_register_buf_ring(&ring, ...);
io_uring_prep_recv_multishot(sqe, fd, NULL, 0, 0);
// recv 一直触发新 CQE,每次自动从 buffer pool 取一块 buffer
```

**百万长连接 idle 场景**——大部分连接只是挂着等推送,你不想给每个连接都预分配大 recv buffer。**multishot + provide buffers 让 recv 按需借 buffer,不浪费内存**——WhatsApp 模式的现代实现。

---

## 六、io_uring vs epoll:真实性能对比

不同测试给的数字差异很大,这里整理几组**有公开方法**的:

### 6.1 基础数据(Linux 5.15,4 核 i7,localhost 压测)

| 测试 | epoll QPS | io_uring QPS | 提升 |
| --- | --- | --- | --- |
| 1KB echo,短连接 | 320K | 480K | +50% |
| 1KB echo,长连接 | 580K | 720K | +24% |
| 大文件(磁盘+发送) | 2.1 GB/s | 4.5 GB/s | +110% |
| 100 字节消息推送(百万长连接,QPS 100K) | CPU 35% | CPU 25% | -28% CPU |

### 6.2 io_uring 不一定更快的场景

```
1. 业务超慢(比如每个请求 10ms 数据库查询)
   → syscall 占比 < 1%,epoll 和 io_uring 没差距

2. 单线程低 QPS
   → io_uring 的 batching 优势出不来

3. 内核版本 < 5.10
   → 早期 io_uring 各种 bug + 性能差,反而不如 epoll

4. 加密/压缩/序列化重的应用
   → 瓶颈在 CPU,io_uring 帮不上
```

### 6.3 io_uring 的杀手场景

```
1. 网络 + 文件混合 IO
   epoll 不支持文件 fd,得用线程池 → 慢、复杂、上下文切换多
   io_uring 一把梭,sendfile / splice 全异步

2. 极致延迟(交易系统、5G UPF)
   SQPOLL 模式下零 syscall,端到端延迟比 epoll 低 30%-50%

3. 海量小 IO 批量
   N 个 SQE 一次 syscall,百万 IOPS 能跑满 NVMe
```

---

## 七、io_uring 的"暗面":生态、安全、心智

### 7.1 生态成熟度

| 项目 | 状态 | 备注 |
| --- | --- | --- |
| **liburing**(C) | 生产级 | Jens Axboe 亲自维护 |
| **Rust monoio**(字节) | 生产级 | 单线程 per core,完全 io_uring |
| **Rust glommio**(DataDog) | 生产级 | thread-per-core,有调度器 |
| **Rust tokio io_uring** | 实验 | tokio 仍以 epoll 为主 |
| **Node.js libuv** | 部分支持 | 文件 IO 用,网络仍 epoll |
| **Java Netty** | 5.11+ 预览 | `io_uring transport`,需 native |
| **Go runtime** | **未支持** | netpoll 仍是 epoll(见下面) |
| **PostgreSQL 17** | 部分 | 异步 IO 用上 io_uring |
| **Nginx** | **未支持** | 一直 epoll(社区有 patch 不主线) |
| **ScyllaDB / Seastar** | 早期采用 | 单线程 reactor 模型契合 |

### 7.2 为什么 Go 没原生 io_uring

**Go 调度器假设**:syscall 阻塞时把 P 还回去给别的 G 跑(M:N 调度)。**io_uring 的异步模型和这个假设不兼容**——异步 IO 不阻塞,就没有"还 P"的时机,GMP 调度逻辑要重写。**社区有 fork**(`github.com/iceber/iouring-go`),但官方迟迟不动。**Go 1.23 仍是 epoll**——大概率 1.25+ 才会有 io_uring 后端,而且会是可选不是默认。

### 7.3 安全性历史

io_uring 在 2020-2022 年爆出多个 CVE(权限绕过、UAF),**Google 一度禁掉 ChromeOS / Android 容器使用 io_uring**。**6.1 LTS** 之后稳定性大幅提升,但**不少容器平台默认 seccomp 仍 ban 掉 io_uring 系列 syscall**——上生产前确认 K8s / 容器运行时的 seccomp 配置。

### 7.4 心智模型转变

epoll 编程模型还很"Unix":**就绪 → 同步 read/write**。io_uring 把你逼向**完全异步、callback-driven、every operation has a future**——心智门槛比 epoll 高一个台阶。

**Rust 这套语言天生有 async/await + Future**,io_uring 一拍即合;**C / C++ 的 io_uring 代码状态机管理很快变得复杂**——这是 monoio / glommio 在 Rust 圈火的根本原因。

---

## 八、什么时候 io_uring,什么时候 epoll

### 8.1 上 io_uring 的场景

```
✓ 单机百万 QPS,syscall 是瓶颈(perf 看 syscall 占 > 20% CPU)
✓ 网络 + 文件混合 IO(代理 + 缓存 + 落盘)
✓ 极致低延迟(交易、UPF、CDN edge)
✓ 用 Rust 写,async/await 生态对齐 io_uring
✓ 内核 ≥ 5.15(LTS),容器 / K8s seccomp 已放开
```

### 8.2 继续用 epoll 的场景

```
✓ 业务 CPU 重(每请求 1ms+ 计算)→ syscall 占比小,优化错地方
✓ 内核 < 5.10 / 容器禁 io_uring → 想用也用不了
✓ 用 Go / Node.js / Java Netty 老版本 → 生态还没跟上
✓ 不到 100K QPS 量级 → epoll 还撑得很
✓ 团队没人会调 io_uring → 引入复杂度大于收益
```

### 8.3 经验法则

```
QPS / 单核   选择
< 50K       不需要 epoll 都够,select / poll 都没瓶颈
50K - 500K  epoll 是甜点,生态成熟,无脑用
500K - 1M   epoll 调到极致(SO_REUSEPORT / ET / 多 worker),io_uring 开始有意义
> 1M        io_uring 几乎必选,SQPOLL 看延迟需求
```

**性能金字塔预告**(下一章详谈):

```
普通业务         epoll                  能撑 100K QPS
极致业务         io_uring               能撑 500K-1M QPS
DDoS 防御 / 路由  XDP (内核态 BPF)        线速 10M+ pps
高频交易 / NFV    DPDK (用户态轮询)       线速 100M+ pps
```

---

## 九、踩坑提醒

1. **以为 io_uring 一定比 epoll 快**——业务 CPU 重的场景没区别;syscall 占比不到 10% 别想着上 io_uring
2. **内核版本太老**——5.1-5.5 早期 io_uring bug 多 + 性能差,生产请用 5.15+ 或 6.1+ LTS
3. **SQPOLL 不调 sq_thread_idle**——默认很短,thread 频繁睡醒,反而不如普通模式
4. **SQ 满了不处理**——SQE 是有限的(QD 决定),满了 io_uring_get_sqe 返回 NULL 必须 submit 释放
5. **CQE 不及时 seen**——CQ 满了内核停止往里写新事件,服务停摆
6. **buffer 生命周期没管好**——SQE 提交后到 CQE 完成前,buffer 不能被 free / 改;否则 UAF
7. **以为 io_uring 自带超时**——必须自己 LINK_TIMEOUT,不然 recv 可能等到天荒地老
8. **多线程共用一个 ring**——不安全,典型做法是 thread-per-core 一线程一 ring(monoio / Seastar 模型)
9. **容器 / K8s seccomp 默认 ban**——上生产前 `seccomp=unconfined` 测一遍或定制 seccomp profile
10. **以为 io_uring 解决了 TIME_WAIT / 端口耗尽**——这些是 TCP 协议层瓶颈,跟 IO 接口无关,该调 sysctl 还得调

---

下一篇:`33-eBPF-XDP-DPDK.md`,讲为什么 io_uring 仍然在内核协议栈里走、当你想做 DDoS 防御 / L4 负载均衡 / K8s 网络时怎么办、eBPF 是什么(在内核里安全跑的字节码 VM)、XDP 怎么在网卡驱动层就 drop 包(线速 10M+ pps)、tc-bpf 做出口流量控制、bpftrace 抓包神技、Cilium 怎么用 eBPF 替代 iptables 实现 K8s CNI、DPDK 怎么完全绕过内核(用户态轮询 + 大页 + CPU 亲和)、DPDK 和 XDP 的取舍——以及把 epoll → io_uring → XDP → DPDK 这条性能金字塔串清楚。
