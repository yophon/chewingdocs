# epoll 在网络的应用

上一篇 30 讲了 socket 七件套和那个 fork 版 echo server——能跑,但**一连接一进程,顶天撑几千**:每进程几 MB 内存、fork 慢、上下文切换更慢。**真正撑得住十万连接的服务器,全靠一个东西:epoll**。1999 年 Dan Kegel 的「C10K problem」论文把"一万并发连接"当作标志性难题,2002 年 Linux 2.5 引入 epoll 把它解了——之后 Nginx / Node.js / Redis / Envoy / Netty 全部建在 epoll 之上,直到 2019 年 io_uring 才出现真正的下一代(下一篇)。本篇只讲 epoll 在**网络栈**这一面的应用——LT / ET 怎么选、accept 惊群怎么破、Reactor 怎么搭、百万长连接卡在哪。**详见 osLearning/21 epoll 深入(讲 epoll 数据结构 / 红黑树 / 就绪链表 / `epoll_event` 字段全解),本章只讲网络栈应用**,不重复 IO 模型基础。

> 一句话先记住:**epoll 解决的是"一个线程同时盯一万个 fd 谁有事"的问题**——`select` / `poll` 每次都把全量 fd 集合从用户态拷到内核扫一遍(O(n)),epoll 在内核维护一棵红黑树 + 就绪链表,你只需要 `epoll_wait` 取就绪事件(**O(1) 唤醒,只返回真有事的 fd**)。**LT(水平触发)= 只要有数据就一直通知**(默认,简单不易错);**ET(边缘触发)= 状态变化时才通知一次**(高性能,但必须配非阻塞 socket + 循环读到 `EAGAIN`,漏读直接卡死)。**惊群早就被解了**:Linux 4.5 给 epoll 加了 `EPOLLEXCLUSIVE`,Nginx 用 `SO_REUSEPORT` 让内核自己分发——别再迷信"accept 惊群是 epoll 的诅咒"。**百万长连接的瓶颈不是 epoll 本身,是文件描述符上限、TIME_WAIT、conntrack 表、内存 / sendbuf 总量**——优化要打这些靶,不是去改 epoll。

---

## 一、为什么需要 epoll:select / poll 的两座大山

### 1.1 select:25 年的老兵,死在 1024

```c
fd_set rset;
FD_ZERO(&rset);
FD_SET(fd1, &rset);
FD_SET(fd2, &rset);
...
int n = select(maxfd + 1, &rset, NULL, NULL, &timeout);
for (int fd = 0; fd <= maxfd; fd++) {
    if (FD_ISSET(fd, &rset)) {
        // 处理 fd
    }
}
```

**三个致命问题**:

1. **fd 数量上限 1024**(`FD_SETSIZE` 编译期常量)——网络服务器分分钟超
2. **每次调用要把 fd 集合从用户态拷到内核**——10000 fd = 10000 次比特拷贝,每次 select 都来一遍
3. **返回后必须遍历所有 fd 找谁有事**——O(n) 扫描,99% 是空跑

### 1.2 poll:解了 fd 数量上限,没解扫描问题

```c
struct pollfd fds[10000];
fds[0].fd = sock1; fds[0].events = POLLIN;
...
int n = poll(fds, 10000, timeout);
for (int i = 0; i < 10000; i++) {
    if (fds[i].revents & POLLIN) { ... }
}
```

**poll 修了**:fd 数量没硬上限(链表存),用结构体而不是 bitmap。
**poll 没修**:每次还要拷贝 10000 个 `pollfd` 进内核,返回还要扫 10000 个找有事的。

**1 万连接、99% 空闲、1% 活跃** → poll 每次都得扫 1 万,**99% 的 CPU 在做无用功**。

### 1.3 epoll:把"哪些 fd"和"哪些有事"分开

epoll 的关键设计:

```
fd 集合 → 一次性注册到内核(epoll_ctl ADD,放进红黑树)
事件等待 → 内核只把"就绪 fd"放到就绪链表
epoll_wait → 只返回就绪链表的内容,O(就绪数) 而不是 O(总数)
```

**对比**:

| | select | poll | epoll |
| --- | --- | --- | --- |
| fd 数量上限 | 1024 | 无 | 无(`/proc/sys/fs/file-max`) |
| 每次调用拷贝 | 全量拷 | 全量拷 | 增量(epoll_ctl 才拷) |
| 返回后扫描 | O(n) | O(n) | O(就绪数) |
| 支持触发模式 | LT | LT | LT + ET |
| 内核数据结构 | bitmap | 数组 | 红黑树 + 就绪链表 |
| 实测 1 万 fd 1% 活跃 | ~1ms | ~1ms | **~10μs** |

**100 倍差距**——这就是 C10K 被解掉的根本原因。

---

## 二、epoll 三件套 API

```c
int epoll_create1(int flags);
int epoll_ctl(int epfd, int op, int fd, struct epoll_event *event);
int epoll_wait(int epfd, struct epoll_event *events, int maxevents, int timeout);
```

### 2.1 epoll_create1:开一个 epoll 实例

```c
int ep = epoll_create1(EPOLL_CLOEXEC);
// 返回一个 epoll fd(自己也是个 fd!可以套娃,把另一个 epoll 加进来)
```

**老的 `epoll_create(size)` 中 size 早就被忽略**——内核动态扩容。**用 `epoll_create1` 可以一次设 `EPOLL_CLOEXEC`**。

### 2.2 epoll_ctl:增删改

```c
struct epoll_event ev;
ev.events  = EPOLLIN | EPOLLET;   // 关心可读 + 边缘触发
ev.data.fd = sock_fd;             // 用户数据,wait 时原样返回

epoll_ctl(ep, EPOLL_CTL_ADD, sock_fd, &ev);   // 注册
epoll_ctl(ep, EPOLL_CTL_MOD, sock_fd, &ev);   // 改关心的事件
epoll_ctl(ep, EPOLL_CTL_DEL, sock_fd, NULL);  // 删除
```

`ev.data` 是个 union:`fd` / `ptr` / `u32` / `u64`。**生产代码常用 `ev.data.ptr` 指向自己的连接对象**(`struct conn`),wait 时直接拿到上下文,省一次哈希表查找。

**事件类型**:

| | 含义 |
| --- | --- |
| `EPOLLIN` | 可读 |
| `EPOLLOUT` | 可写(很少加,加了会一直触发,见下面) |
| `EPOLLRDHUP` | 对方半关闭(收到 FIN)——比 EPOLLIN + recv 返回 0 早一点知道 |
| `EPOLLERR` | socket 出错(必有,即使你不加) |
| `EPOLLHUP` | 挂起(必有) |
| `EPOLLET` | 边缘触发模式 |
| `EPOLLONESHOT` | 触发一次后自动 disable,需 MOD 重新激活 |
| `EPOLLEXCLUSIVE` | (Linux 4.5+)防止惊群 |

### 2.3 epoll_wait:取就绪事件

```c
struct epoll_event events[64];
int n = epoll_wait(ep, events, 64, timeout_ms);
for (int i = 0; i < n; i++) {
    int fd = events[i].data.fd;
    if (events[i].events & EPOLLIN)  handle_read(fd);
    if (events[i].events & EPOLLOUT) handle_write(fd);
}
```

**timeout = -1 永久阻塞,= 0 立即返回(纯轮询),> 0 毫秒超时**。

**maxevents 是这一次最多取多少**——不是上限,只是这次返回多少。**取太少**:剩下的下次再取(可能饿死);**取太大**:内存浪费。**经验值 32-128**。

---

## 三、LT vs ET:工程上最重要的二选一

```
LT (Level Triggered, 水平触发):
  只要 fd 上还有数据可读 / 还能写,epoll_wait 就一直返回它

ET (Edge Triggered, 边缘触发):
  只在"无数据 → 有数据"或"不可写 → 可写"的瞬间触发一次
  错过这次,直到下次状态再变才会再触发
```

### 3.1 LT 行为:简单不易错

```c
ev.events = EPOLLIN;     // LT (默认,不加 EPOLLET)
epoll_ctl(ep, EPOLL_CTL_ADD, fd, &ev);

// epoll_wait 返回 EPOLLIN
char buf[1024];
read(fd, buf, 1024);   // 读 1024 字节
// 即使 socket 缓冲区还有数据,下次 epoll_wait 还会再返回 EPOLLIN
// 没读完没关系,下次接着读
```

**优点**:**漏读不会卡死**——内核会一直提醒你。
**缺点**:**有数据时反复触发**——如果不及时读完,wait 一直返回。

### 3.2 ET 行为:状态变化才触发,必须读到 EAGAIN

```c
ev.events = EPOLLIN | EPOLLET;
epoll_ctl(ep, EPOLL_CTL_ADD, fd, &ev);

// epoll_wait 返回 EPOLLIN
// 必须循环读到 EAGAIN!
while (1) {
    ssize_t n = read(fd, buf, sizeof(buf));
    if (n > 0)  process(buf, n);
    else if (n == 0) { close_conn(fd); break; }       // 对方关了
    else if (errno == EAGAIN) break;                   // 内核缓冲区空了,等下次
    else if (errno == EINTR) continue;                 // 被信号打断,重试
    else { /* 真错误 */ break; }
}
```

**ET 三铁律**:

1. **socket 必须设非阻塞**——不然 read 没数据会阻塞整个事件循环(`fcntl(fd, F_SETFL, O_NONBLOCK)` 或 `accept4(.., SOCK_NONBLOCK)`)
2. **必须循环读到 EAGAIN**——不然剩下的数据要等"下次有新数据来"才会再触发,中间可能卡很久
3. **写也一样**——`write` 返回 `EAGAIN` 才停,否则一直写

### 3.3 为什么要有 ET

**LT 在某些场景会"被空跑唤醒"**:

```
连接 A 收了 100 字节
LT: epoll_wait 返回 A
你读 50 字节,留 50 字节没读
LT: epoll_wait 还会返回 A(还有 50 字节呢)
你读了 50 字节,但 epoll_wait 还是带回了一个事件——多了一次系统调用

ET: 只在"刚到的瞬间"触发一次,你必须一次读完——一个事件覆盖所有数据
```

**ET 减少 epoll_wait 唤醒次数**——每秒百万事件场景下能省 5-10% CPU。**Nginx 默认 ET,Redis 默认 LT**——选择取决于复杂度容忍度。

### 3.4 EPOLLOUT 的坑

**永远不要"加上 EPOLLOUT 就不取消"**——LT 模式下 socket 几乎永远可写(发送缓冲区有空闲),`epoll_wait` 会一直返回 EPOLLOUT,CPU 被打满。

**正确套路**:

```
普通流程:不加 EPOLLOUT,直接 send
     send 返回 EAGAIN(发送缓冲区满了)
        ↓
     这才加 EPOLLOUT,等可写
        ↓
     epoll_wait 返回 EPOLLOUT
     send 完剩下的字节,删掉 EPOLLOUT
```

ET 模式则只在"满 → 有空"瞬间触发,自然不会一直唤醒。

### 3.5 LT vs ET 对比

| | LT | ET |
| --- | --- | --- |
| 编程复杂度 | 低 | 高 |
| 漏读后果 | 下次还会触发,无碍 | 卡死直到下次状态变化 |
| 必须非阻塞 | 不要求(但建议) | 强制 |
| EPOLLOUT 处理 | 麻烦(必须动态加删) | 简单 |
| 性能 | 略低 | 略高(5-10%) |
| 代表 | Redis、libev 默认 | Nginx、Netty 默认 |

**经验**:**没有性能瓶颈用 LT,业务逻辑简单清晰**;**有量级压力(每秒数十万 QPS)再上 ET**。**先 LT 跑通,profile 看 epoll_wait 是不是热点,再考虑 ET**。

---

## 四、accept 惊群:历史包袱与现代解法

### 4.1 什么叫惊群

```
8 个 worker 进程,都 epoll_wait 同一个 listening socket
新连接来了,内核唤醒所有 8 个进程
8 个 进程 同时 accept,只有 1 个成功,7 个返回 EAGAIN
→ 7 次空唤醒 + 7 次上下文切换的浪费
```

**这就是惊群(thundering herd)**——一个事件惊动一群人,只有一个有用。

### 4.2 历史:从有到无,又从无到有

```
Linux 2.6 早期:  fork 后多进程 accept 同一 socket → accept 惊群严重
Linux 2.6 中期:  内核改了 wake_up_one,只唤醒一个 → accept 惊群解决
                但 epoll 加进来后,如果多个进程都 epoll_wait 同一 listening fd
                → epoll 惊群又来了(epoll_wait 是 wake_up_all)
Linux 4.5 (2016): epoll 加 EPOLLEXCLUSIVE 标志 → 一个事件只唤醒一个 epoll
Linux 3.9 (2013): SO_REUSEPORT → 每进程一个独立 listening socket,内核哈希分发
                → 根本不会惊群,而且四元组哈希分发负载更均匀
```

### 4.3 现代解法:SO_REUSEPORT

**Nginx 的 reuseport 配置**:

```nginx
server {
    listen 80 reuseport;
}
```

**底层效果**:

```
每个 worker 各自:
  socket()
  setsockopt(SO_REUSEPORT)
  bind(80)            ← 同时 bind 同一端口,内核允许
  listen()
  epoll_ctl(ADD, listening_fd)

新连接来:
  内核根据 (src_ip, src_port, dst_ip, dst_port) 哈希
  分给固定的某个 listening socket
  只有那个 worker 的 epoll_wait 被唤醒
```

**好处**:

1. **零惊群**——一个连接只唤醒一个进程
2. **负载均衡**——内核哈希,比应用层"谁先抢到"更均匀
3. **kernel-bypass scaling**——多核 scaling 接近线性,Nginx 实测 QPS +30%

**坑**:**worker 重启时会丢一部分 SYN**——重启的 worker 那个哈希分桶里的连接没人 accept,SYN 包被丢直到 SO_REUSEPORT 群组重建。Linux 4.5+ 用 `SO_ATTACH_REUSEPORT_CBPF` 可以做更智能的分发(Envoy 用得多)。

### 4.4 EPOLLEXCLUSIVE

如果不用 SO_REUSEPORT,**多进程共享一个 listening fd 也可以靠 EPOLLEXCLUSIVE 防惊群**:

```c
ev.events = EPOLLIN | EPOLLEXCLUSIVE;
epoll_ctl(ep, EPOLL_CTL_ADD, listen_fd, &ev);
```

**效果**:同一个事件只唤醒一个 epoll 实例。**但负载均衡不如 SO_REUSEPORT 均匀**(还是"先到先得")。

---

## 五、Reactor 模式:工业级网络框架的骨架

```
       ┌─────────────────────────────────┐
       │       事件循环(单线程)         │
       │                                 │
       │  while (1) {                    │
       │    n = epoll_wait(ep, evs, ..); │
       │    for each ev:                 │
       │      handler[fd](ev);           │
       │  }                              │
       └─────────────────────────────────┘
            │
            ├── listen_fd 的 handler:do_accept
            ├── conn_fd 的 handler:do_read / do_write / do_close
            └── 定时器 timerfd 的 handler:check_timeout
```

**Reactor 的核心**:**所有 IO 事件、所有定时器、所有信号都化成 fd 可读事件**——`epoll_wait` 一个口子统一收。

### 5.1 为什么单线程也能扛 10 万 QPS

**网络服务的特性**:**99% 时间在等 IO,真 CPU 工作很少**。一个 4GHz 的核心一秒 40 亿周期,处理一个 HTTP 请求(无业务逻辑)~10μs = 4 万周期 → 单核理论 10 万 QPS。**Redis 单线程跑 100K QPS 就是这个原理**。

### 5.2 Reactor 的三种部署形态

```
1. 单 Reactor 单线程
   Redis 经典模式,简单,无锁
   适合:CPU 占用低、纯 IO 转发

2. 单 Reactor 多线程
   主线程 epoll_wait + accept,工作线程池处理业务
   适合:有 CPU 密集业务(JSON 解析、加密),不想阻塞 IO 线程

3. 多 Reactor 多线程(Nginx / Netty 主流)
   每个 worker 进程 / 线程一个独立 epoll 实例
   主进程只 accept,把新 conn fd 交给某个 worker(round-robin 或 SO_REUSEPORT)
```

### 5.3 真实代码骨架(C 版,LT,简化)

```c
#include <sys/epoll.h>
#include <fcntl.h>
// ... 包含上一篇的 socket 头

#define MAX_EVENTS 128

static int set_nonblock(int fd) {
    int fl = fcntl(fd, F_GETFL, 0);
    return fcntl(fd, F_SETFL, fl | O_NONBLOCK);
}

int main(void) {
    int srv = /* socket + bind + listen,见上一章 */;
    set_nonblock(srv);

    int ep = epoll_create1(EPOLL_CLOEXEC);
    struct epoll_event ev = { .events = EPOLLIN, .data.fd = srv };
    epoll_ctl(ep, EPOLL_CTL_ADD, srv, &ev);

    struct epoll_event evs[MAX_EVENTS];
    for (;;) {
        int n = epoll_wait(ep, evs, MAX_EVENTS, -1);
        for (int i = 0; i < n; i++) {
            int fd = evs[i].data.fd;

            if (fd == srv) {
                /* 新连接 */
                while (1) {
                    int c = accept4(srv, NULL, NULL,
                                    SOCK_NONBLOCK | SOCK_CLOEXEC);
                    if (c < 0) {
                        if (errno == EAGAIN) break;
                        perror("accept"); break;
                    }
                    struct epoll_event cev = {
                        .events = EPOLLIN | EPOLLRDHUP,
                        .data.fd = c,
                    };
                    epoll_ctl(ep, EPOLL_CTL_ADD, c, &cev);
                }
            } else {
                /* 已有连接 */
                if (evs[i].events & (EPOLLIN | EPOLLRDHUP)) {
                    char buf[4096];
                    ssize_t r = recv(fd, buf, sizeof(buf), 0);
                    if (r > 0) {
                        send(fd, buf, r, MSG_NOSIGNAL);  // echo
                    } else {
                        epoll_ctl(ep, EPOLL_CTL_DEL, fd, NULL);
                        close(fd);
                    }
                }
            }
        }
    }
}
```

**这版能撑多少**:**单线程,Linux 5.x,2GHz 核**,纯 echo 大概 80K-150K QPS,长连接十几万。**业务一上来 CPU 才是瓶颈**。

---

## 六、生产级架构:Nginx / Node.js / Netty

### 6.1 Nginx 模型:多进程 + SO_REUSEPORT + ET

```
master 进程
   │ fork
   ├── worker 1   epoll_wait + accept(SO_REUSEPORT 自己的 listen socket)
   ├── worker 2   epoll_wait + accept
   ├── ...
   └── worker N   通常 N = CPU 核数
```

**特点**:

- 每 worker 单线程事件循环,**全异步、零线程切换**
- worker 之间不共享内存,**无锁**(共享数据放共享内存 + 自旋锁)
- 一个 worker 撑几万-十几万长连接;百万连接 = 8-16 worker

**Nginx 实测**(2024 年硬件,32 核 / 128GB):
- 短连接 HTTP:**~500K QPS**
- 长连接 HTTP/1.1 keep-alive:**~1M QPS**
- WebSocket 长连接:**~500K 连接/单机**

### 6.2 Node.js libuv 模型:单线程事件循环 + 线程池

```
JavaScript 线程(单线程):
   uv_run() 的事件循环
       │
       ├── poll IO        (epoll_wait,Linux)
       ├── timers         (setTimeout)
       ├── pending callbacks
       └── ...

threadpool(默认 4 个线程):
   ├── 阻塞文件 IO(open/read/write)
   ├── DNS 解析(c-ares 之外的回退)
   └── crypto / zlib 一些重操作
```

**关键**:**网络 IO(socket)走事件循环不进 threadpool**;**文件 IO / CPU 密集走 threadpool**——因为文件 fd 在 Linux 上 epoll 不支持(详见下一篇 io_uring 解决了这个)。

**N 个连接 vs N 个线程**:Node.js 一万连接 = 一个事件循环 + 4 个 worker,内存几十 MB;Java per-thread 模型一万连接 = 一万线程,几十 GB——这是为什么 Node 早期靠"高并发"出圈。

### 6.3 Netty:JVM 上的 Reactor 框架

```
BossGroup (1-N 个 Reactor 线程):  专门 accept
   │
   └── 把 conn 注册到 WorkerGroup 中某个 Reactor

WorkerGroup (默认 2 * CPU 核数):
   每线程一个 EventLoop(就是一个 epoll 实例)
   EventLoop 里跑 ChannelPipeline(责任链:解码 / 业务 / 编码)
```

**特点**:**EventLoop 内的所有处理都在同一线程**——业务代码不用考虑并发,符合 Reactor 思想。**业务里千万别 sleep / 阻塞**——一个 worker 卡了,这个 worker 上几千连接都卡。

---

## 七、百万长连接:瓶颈在哪

epoll 本身不是瓶颈——**百万连接的瓶颈在系统资源**。

### 7.1 文件描述符上限

```bash
# 进程级
ulimit -n             # 默认 1024,生产必调到 1048576
# /etc/security/limits.conf 永久生效

# 系统级
sysctl fs.file-max    # 默认几十万,百万连接得调到 2000000
sysctl fs.nr_open     # 单进程上限,Linux 5.x 默认 1048576
```

**没调这俩,服务器跑到几千连接 accept 就开始 EMFILE**。

### 7.2 端口范围(客户端方向)

```bash
sysctl net.ipv4.ip_local_port_range
# 默认 32768 60999 → 只有 ~28K 端口可用
# 调到 1024 65535 → 6 万多
```

**对客户端 / 反向代理(对后端建连)是关键**——Nginx 跟上游建立的连接全用 ephemeral port。**单机对单后端最多 6 万长连接,搞不到百万**——必须分散后端 IP 或开多个本地源 IP。

### 7.3 TIME_WAIT 撑爆

短连接服务端主动关 → TIME_WAIT 60 秒 → **每个 TIME_WAIT 占用 (src_ip, src_port, dst_ip, dst_port) 这个四元组**,对客户端方向限制大。

**解法**:

```bash
sysctl net.ipv4.tcp_tw_reuse=1     # 安全(检查时间戳)
sysctl net.ipv4.tcp_max_tw_buckets=2000000
# 不要再设 tcp_tw_recycle —— Linux 4.12 后已删除,有 NAT 兼容性问题
```

更好的做法:**长连接 + keepalive**,根本不进 TIME_WAIT。

### 7.4 内存:每连接的开销

```
struct sock + struct tcp_sock:        ~2 KB
sendbuf (默认 16 KB-256 KB,自动调):   16-256 KB
recvbuf (默认 87 KB-6 MB,自动调):     87 KB-6 MB
应用层连接对象:                       ~100 B - 几 KB

百万空闲长连接最低估:
  1M * (2 + 16 + 87) KB ≈ 105 GB
```

**所以百万长连接服务器一般 64-256 GB 内存**,而且要**调小 sendbuf / recvbuf**(对长连接低吞吐场景):

```bash
sysctl net.ipv4.tcp_rmem="4096 16384 1048576"
sysctl net.ipv4.tcp_wmem="4096 16384 1048576"
```

**WhatsApp 早期 FreeBSD 单机 200 万连接** 的著名案例,核心就是把 sendbuf / recvbuf 砍到几 KB,因为 IM 推送场景每连接几乎不传数据。

### 7.5 conntrack 表

如果服务器在 NAT 后或开了 iptables stateful 规则:

```bash
sysctl net.netfilter.nf_conntrack_max     # 默认 65536,百万连接必调到 2000000+
sysctl net.netfilter.nf_conntrack_buckets
```

**conntrack 满了报 `nf_conntrack: table full, dropping packet`**——新连接全被丢。

### 7.6 软中断 / 网卡队列

百万连接背后是**百万 packet/s 量级**——单个 CPU 核处理软中断成不行。

```bash
ethtool -L eth0 combined 16    # 多队列(N 个 RX/TX,可绑不同 CPU)
echo ffff > /sys/class/net/eth0/queues/rx-0/rps_cpus  # RPS 软分发
```

**XDP / DPDK 是更激进的方案**,见下一章。

### 7.7 一张瓶颈优先级表

| 瓶颈 | 出现连接数量级 | 解法 |
| --- | --- | --- |
| `ulimit -n` | 1K-10K | 调 ulimit |
| `somaxconn` / backlog | 10K | 调 sysctl |
| 端口耗尽(客户端方向) | 60K(一对一) | 多 IP / 长连接 |
| TIME_WAIT | 100K(短连接) | tcp_tw_reuse / 长连接 |
| conntrack | 65K | nf_conntrack_max 调大或关 nf |
| sendbuf/recvbuf 内存 | 100K-1M | 调小 tcp_rmem/wmem |
| CPU 软中断 | 1M+ | 多队列 + RSS / RPS |
| 内核协议栈 | 1M+ | XDP / DPDK(下一章) |

---

## 八、压测工具:看清自己的极限

```bash
# wrk:HTTP 压测之王
wrk -t12 -c10000 -d30s --latency http://target/

# h2load:HTTP/2 压测
h2load -n 100000 -c 1000 -m 100 https://target/

# 长连接压测:自己造一个 sleep loop
# 或者用 vegeta / ab / hey 都行

# 看连接分布
ss -s
# Total: 80123
#   TCP:   80020 (estab 79900, closed 50, ...)
#   TIME-WAIT 50

# 看端口耗尽
sysctl net.ipv4.ip_local_port_range
ss -tn state time-wait | wc -l
```

**典型瓶颈定位流程**:

```
1. wrk QPS 上不去 → 先看 CPU(top / mpstat)
   - 用户态满 → 业务代码慢
   - 软中断高 → 网卡 / 协议栈瓶颈
   - 都不高 → 客户端瓶颈

2. dmesg 看内核报错
   - "TCP: too many orphaned sockets"
   - "nf_conntrack: table full"
   - "Out of socket memory"

3. ss -s + ss -tnp 看连接状态分布
```

---

## 九、踩坑提醒

1. **ET 模式忘了循环读到 EAGAIN**——客户端发了 1KB,你只 read 一次拿到 800 字节,剩下 200 字节"消失"了,直到对方发新数据才会再触发
2. **ET 下 socket 不设非阻塞**——read 阻塞住事件循环,所有连接卡死
3. **EPOLLOUT 加了不删**——CPU 100% 空转(LT 模式下 socket 几乎永远可写)
4. **多进程共享 listen fd 不防惊群**——4.5 之前没法,现在用 SO_REUSEPORT 或 EPOLLEXCLUSIVE
5. **ulimit / somaxconn 不调**——压测到几千连接就开始 EMFILE / SYN drop,以为框架不行,其实是默认值太小
6. **以为 epoll 比 kqueue 快**——FreeBSD 的 kqueue 设计更早(1999),功能更全(支持文件 / 信号 / aio),性能也类似;Linux 选了 epoll 是历史路径
7. **业务里在 epoll 线程睡 10ms**——一个 worker 上几千连接全卡 10ms,**永远不要 sleep / 同步 IO / 大计算**
8. **每个新连接都 epoll_create**——epoll 实例本身有开销,正确做法是一个线程一个 epoll,所有 fd 共用
9. **以为 epoll 能等文件 fd**——**Linux epoll 不支持普通文件 fd**(总是"可读"),只能等 socket / pipe / eventfd / timerfd / signalfd / inotify;文件异步要 io_uring,见下一篇
10. **百万连接用单进程**——一个 epoll 实例的事件循环有上限(几十万连接 + 几 GB 内存),百万必须多进程

---

下一篇:`32-io_uring与高性能网络.md`,讲为什么"epoll + 非阻塞 + 线程池"已经是 socket API 的天花板、io_uring 怎么用 SQ/CQ 双环形队列彻底打破 syscall 瓶颈、accept / recv / send 全异步带来什么变化、SQPOLL 模式下零 syscall 的极致优化、io_uring 在网络场景到底比 epoll 快多少(以及哪些场景反而不如)、Rust monoio / glommio 这套新生态的取舍,以及"什么时候 epoll 仍然够用、不必上 io_uring"。
