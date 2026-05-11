# socket 编程

上一篇 29-DNS 性能讲完"找到对方 IP"这一步的所有优化(本地缓存 / 预热 / Anycast / GSLB),现在 IP 拿到了——**真要往这个 IP 上送字节,工程师手里的 API 就是 socket**。socket 是 1983 年 BSD 4.2 发明的"网络版文件描述符":**一切 TCP / UDP / Unix Domain / Raw 通信都从 socket() 开始,以 close() 结束**。Linux / BSD / macOS / Windows(Winsock 是抄的)全靠这套 API,40 年没换过。本篇把 BSD socket 七件套、socket 类型、关键选项、半关闭、scatter-gather IO、一个能跑的 C 版 echo server 全讲透——**不重复讲 IO 模型(blocking / non-blocking / 多路复用,见 osLearning/02 与下一章 epoll),只讲网络栈这一面**。

> 一句话先记住:**socket = 一个 fd + 一个协议栈状态机的句柄**——你 `read` / `write` 它,内核就替你跑 TCP 状态机、组包、重传、ACK。**七件套口诀:服务端 socket → bind → listen → accept,客户端 socket → connect,然后双方 send / recv,完了 close**。**SO_REUSEADDR ≠ SO_REUSEPORT**:前者是让 TIME_WAIT 状态的端口能被重新 bind,后者是让多个 socket 同时 listen 同一个端口由内核负载均衡——名字像兄弟,功能完全不同,90% 的人会混。**TCP_NODELAY 关 Nagle、TCP_CORK 攒包、SO_LINGER 控 close 行为**——这三个加一个 SO_KEEPALIVE 是生产代码必调的四个 socket 选项。

---

## 一、socket 是什么

### 1.1 一句话定义

```
socket = "插座"
        = 进程往内核网络栈插的一根线
        = 用户态唯一能操作 TCP / UDP 协议栈的句柄
```

打开一个 socket,内核就替你创建一个 `struct socket` 和 `struct sock`(协议无关 + 协议相关两层),分配一个 fd 给你,**之后所有 read / write / send / recv 都通过这个 fd 落到协议栈**。

### 1.2 socket 在内核里是什么

```
fd 表 (per process)
   │
   ├── fd 3 → struct file
   │           └── private_data → struct socket
   │                                ├── ops (proto_ops:bind/connect/...)
   │                                └── sk → struct sock
   │                                          ├── 接收队列 (sk_receive_queue)
   │                                          ├── 发送队列 (sk_write_queue)
   │                                          ├── 重传队列 (tcp_rtx_queue)
   │                                          ├── 状态 (sk_state, ESTABLISHED 等)
   │                                          └── 拥塞控制 (tcp_congestion_ops)
```

**关键观察**:**socket 是 file 的子类**——这就是为什么你能 `read(socket_fd, ...)` 像读文件一样读网络。"一切皆文件"在 Unix 是真的。

### 1.3 BSD socket 的历史

```
1983  BSD 4.2:  Bill Joy 把 socket API 放进 BSD,Sun 工作站起家
1986  POSIX:    标准化 socket
1993  Winsock:  Windows 抄了一份(几乎一样,只是 close 换成 closesocket)
2024  io_uring: 还是 socket fd,只是提交方式变了
```

**socket API 是少数 40 年没破坏性升级的接口**——这是它的优点(稳定),也是它的缺点(epoll / io_uring 都是后来叠加上去的"补丁")。

---

## 二、七件套 API

```
服务端                          客户端
  │                              │
  socket()                     socket()
  │                              │
  bind()    [绑定本地地址]
  │
  listen()  [开启 backlog 队列]
  │                              │
  accept()  ←─── 三次握手 ───→  connect()
  │                              │
  recv() / send()              send() / recv()
  │                              │
  close()                      close()
```

### 2.1 socket():开一根线

```c
int socket(int domain, int type, int protocol);
// domain:  AF_INET / AF_INET6 / AF_UNIX / AF_PACKET
// type:    SOCK_STREAM / SOCK_DGRAM / SOCK_RAW
// protocol: 0(让内核根据 type 选)/ IPPROTO_TCP / IPPROTO_UDP

int fd = socket(AF_INET, SOCK_STREAM, 0);  // TCP
int fd = socket(AF_INET, SOCK_DGRAM, 0);   // UDP
```

返回一个 fd,失败返回 -1 + errno。**这一步只在内核分配数据结构,没发任何包**。

### 2.2 bind():占住本地地址

```c
struct sockaddr_in addr = {
    .sin_family = AF_INET,
    .sin_port   = htons(8080),         // 端口字节序!
    .sin_addr.s_addr = htonl(INADDR_ANY),  // 0.0.0.0
};
bind(fd, (struct sockaddr *)&addr, sizeof(addr));
```

**坑 1**:`htons` / `htonl` 必须用——网络字节序(大端)和主机字节序(x86 是小端)不一样,不转就连不上。

**坑 2**:**客户端不需要 bind**——connect 时内核自动分配一个临时端口(ephemeral port,默认范围 `/proc/sys/net/ipv4/ip_local_port_range`,32768-60999)。**只有需要固定源端口的场景才 bind 客户端 socket**。

**坑 3**:`bind` 失败常见两个原因——端口被占(`Address already in use`)或权限不足(< 1024 端口需要 root 或 `CAP_NET_BIND_SERVICE`)。

### 2.3 listen():进入"准备接连接"模式

```c
listen(fd, 128);   // backlog = 128
```

**backlog 含义**(Linux 行为):

```
全连接队列 (accept queue):  完成三次握手等 accept 的连接数
半连接队列 (syn queue):      收到 SYN 还没完成握手的连接数

backlog 控制全连接队列长度
半连接队列长度由 net.ipv4.tcp_max_syn_backlog + somaxconn 决定
```

**实际生效值** = `min(backlog, /proc/sys/net/core/somaxconn)`。Linux 5.4+ somaxconn 默认 4096,旧内核默认 128——**生产环境必调到 8192 或更高**,否则高并发场景 SYN 包被丢、客户端 connect 超时。

### 2.4 accept():取一个完成握手的连接

```c
struct sockaddr_in cli;
socklen_t len = sizeof(cli);
int conn_fd = accept(fd, (struct sockaddr *)&cli, &len);
```

**关键**:**accept 返回一个新 fd**(代表这条连接),原 listening fd 继续接下一个连接。所以 listening fd 和 connection fd 是两个 socket。

**Linux 2.6.28+** 提供 `accept4`,可以一次设置 `SOCK_NONBLOCK | SOCK_CLOEXEC`:

```c
int conn_fd = accept4(fd, NULL, NULL, SOCK_NONBLOCK | SOCK_CLOEXEC);
// 省一次 fcntl 调用,高并发服务器必用
```

### 2.5 connect():主动握手

```c
struct sockaddr_in srv = {
    .sin_family = AF_INET,
    .sin_port   = htons(8080),
    .sin_addr.s_addr = inet_addr("10.0.0.1"),
};
connect(fd, (struct sockaddr *)&srv, sizeof(srv));
```

**阻塞模式**:connect 返回时三次握手已完成。
**非阻塞模式**:connect 立即返回 `-1` + `errno = EINPROGRESS`,后续用 `epoll_wait` 等可写事件,然后 `getsockopt(SO_ERROR)` 检查是否成功。

### 2.6 send / recv:把字节送进 / 取出协议栈

```c
ssize_t send(int fd, const void *buf, size_t len, int flags);
ssize_t recv(int fd, void *buf, size_t len, int flags);
```

`flags` 常用值:

| flag | 含义 |
| --- | --- |
| `0` | 默认行为 |
| `MSG_DONTWAIT` | 这次调用非阻塞(不改 socket 状态) |
| `MSG_PEEK` | 偷看一下,数据不从队列移除 |
| `MSG_NOSIGNAL` | 对方关了别给我发 SIGPIPE,返回 EPIPE 就好 |
| `MSG_WAITALL` | recv 等到把 len 字节收满(或出错)再返回 |

**生产代码必带 `MSG_NOSIGNAL`**——不然对方挂了你这边收 SIGPIPE,默认行为是进程退出,服务直接死。或者全局 `signal(SIGPIPE, SIG_IGN)`。

### 2.7 close():关一根线

```c
close(fd);
// TCP:发 FIN,进入四次挥手
// UDP:直接释放 socket
```

**关键**:`close` 是"我两个方向都不要了"——见下面 shutdown 章节,有时候只想关一个方向。

---

## 三、socket 类型:STREAM / DGRAM / RAW

### 3.1 SOCK_STREAM(TCP)

```
特点:有连接、可靠、字节流、有序
保证:发 100 字节,对方收到的就是这 100 字节,顺序不变,不会重不会丢
代价:握手 1 RTT、挥手 1.5 RTT、有重传、有拥塞控制
```

**用在**:HTTP / SSH / MySQL / Redis 等绝大多数应用。

### 3.2 SOCK_DGRAM(UDP)

```
特点:无连接、不可靠、数据报
保证:几乎没有——可能丢、可能乱序、可能重复
优点:无握手、延迟低、可一对多(组播)
```

**用在**:DNS、QUIC(自己在 UDP 上重做可靠性)、视频会议、游戏、SNMP。

**坑**:UDP `recvfrom` 一次返回一个完整数据报——**buffer 太小,后面的字节会被截断丢弃**(Linux 行为),不像 TCP 那样下次 recv 还能再读。

### 3.3 SOCK_RAW(原始套接字)

```c
int fd = socket(AF_INET, SOCK_RAW, IPPROTO_ICMP);
```

**绕过 TCP / UDP,直接收发 IP 包**——你自己拼协议头。

**典型用途**:

- `ping` / `traceroute`(发 ICMP)
- 自己实现新协议(SCTP 用户态实现)
- 抓包工具(`AF_PACKET` 更底,直接拿链路层帧)

**坑**:需要 root(或 `CAP_NET_RAW`)——内核默认不让普通用户发原始包,否则任何用户都能伪造 IP 源地址。

### 3.4 三种类型对比

| 维度 | SOCK_STREAM | SOCK_DGRAM | SOCK_RAW |
| --- | --- | --- | --- |
| 协议 | TCP | UDP | 自定义/ICMP |
| 边界 | 字节流(无边界) | 数据报(有边界) | 包 |
| 可靠性 | 有 | 无 | 无 |
| 连接 | 有(握手) | 无 | 无 |
| MTU 关心 | 不用 | 要(>1472 会分片) | 要(自己拼) |
| 权限 | 普通用户 | 普通用户 | root |

---

## 四、关键 socket 选项:必调的八个

```c
int val = 1;
setsockopt(fd, level, optname, &val, sizeof(val));
// level: SOL_SOCKET / IPPROTO_TCP / IPPROTO_IP
```

### 4.1 SO_REUSEADDR

**作用**:允许 bind 处于 `TIME_WAIT` 的本地端口。

**场景**:服务端进程刚 crash 重启,旧连接还在 TIME_WAIT(60 秒),如果不开 `SO_REUSEADDR`,新进程 bind 同一端口直接 `Address already in use`——线上这意味着重启等 1 分钟才能恢复。

```c
int yes = 1;
setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof(yes));
```

**生产代码 100% 应该开**。

### 4.2 SO_REUSEPORT(完全不同的功能!)

**作用**:**允许多个 socket 同时 listen 同一个 (IP, port)**,内核做四元组哈希分发新连接。

```c
int yes = 1;
setsockopt(fd, SOL_SOCKET, SO_REUSEPORT, &yes, sizeof(yes));
bind(fd, ...);
listen(fd, ...);
// 多个进程 / 线程各自开 fd,各自 bind / listen 同一端口
```

**对比 `SO_REUSEADDR`**:

| | SO_REUSEADDR | SO_REUSEPORT |
| --- | --- | --- |
| 解决问题 | 重启复用端口 | 多进程负载均衡 |
| 引入版本 | 早 | Linux 3.9 (2013) |
| 是否处理 accept 惊群 | 否 | **是**(内核分发,不惊群) |
| Nginx 用法 | 可选 | `reuseport` 指令 |

**生产价值**:Nginx 配 `reuseport` 后,每个 worker 进程一个 listening socket,内核负载均衡,QPS 提升 30%-50%(大量短连接场景)——详见下一章 epoll 惊群部分。

### 4.3 SO_KEEPALIVE

**作用**:开启 TCP keepalive——空闲连接定期探测对方是否还活着。

**默认参数**(`/proc/sys/net/ipv4/`):

```
tcp_keepalive_time   = 7200    (2 小时空闲后开始探测)
tcp_keepalive_intvl  = 75      (探测包间隔)
tcp_keepalive_probes = 9       (失败 9 次判死)
```

**坑**:默认 2 小时太长,生产环境必调:

```c
int idle = 60, intvl = 10, cnt = 3;
setsockopt(fd, SOL_SOCKET, SO_KEEPALIVE, &(int){1}, sizeof(int));
setsockopt(fd, IPPROTO_TCP, TCP_KEEPIDLE,  &idle,  sizeof(idle));
setsockopt(fd, IPPROTO_TCP, TCP_KEEPINTVL, &intvl, sizeof(intvl));
setsockopt(fd, IPPROTO_TCP, TCP_KEEPCNT,   &cnt,   sizeof(cnt));
// 60 + 10*3 = 90 秒检测出死连接
```

**应用层心跳 vs TCP keepalive**:**两者各有用途**——TCP keepalive 检测网络层假死,应用层心跳还能附带"业务健康"信息(比如 Redis PING)。HTTP/2 / WebSocket / gRPC 都自带应用层 ping。

### 4.4 TCP_NODELAY:关掉 Nagle 算法

**Nagle 算法**(默认开):**小包不立刻发,攒一攒**——减少小包数量,但增加延迟。

```
write(fd, "GET ", 4)
write(fd, "/api ", 5)
write(fd, "HTTP/1.1\r\n", 10)

Nagle 开:可能等 40ms (delayed ACK 撞上 Nagle) 才把这 19 字节合并发
Nagle 关:每个 write 立刻发包
```

**何时关**:**所有交互式 / 低延迟应用**——Redis、SSH、HTTP、RPC。

```c
setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &(int){1}, sizeof(int));
```

**何时不用关**:批量上传大文件、scp——让 Nagle 攒包反而效率高。

### 4.5 TCP_CORK:反过来,主动攒

**作用**:**塞住 socket,直到取消才发**——比 Nagle 更激进的"攒包"。

```c
setsockopt(fd, IPPROTO_TCP, TCP_CORK, &(int){1}, sizeof(int));
write(fd, header, header_len);
sendfile(fd, file_fd, NULL, file_size);
write(fd, footer, footer_len);
setsockopt(fd, IPPROTO_TCP, TCP_CORK, &(int){0}, sizeof(int));  // 取塞,统一发
```

**典型场景**:Nginx 发 HTTP 响应——header + body + 末尾 chunk 一起 cork 起来,**减少包数量,提升带宽利用率**。

**坑**:CORK 和 NODELAY 不冲突——TCP_NODELAY 控 Nagle,TCP_CORK 控 cork,可以同时开,Linux 行为是 CORK 优先。

### 4.6 SO_LINGER:控制 close 时的行为

```c
struct linger lin = { .l_onoff = 1, .l_linger = 30 };
setsockopt(fd, SOL_SOCKET, SO_LINGER, &lin, sizeof(lin));
```

**三种模式**:

| l_onoff | l_linger | close 行为 |
| --- | --- | --- |
| 0 | (忽略) | 默认:立即返回,内核后台发完缓冲区再发 FIN |
| 1 | 0 | **粗暴关**:立即发 RST,丢弃发送缓冲区,**跳过 TIME_WAIT** |
| 1 | > 0 | **优雅关**:阻塞 close 直到发送缓冲区清空 + 收到对方 ACK,或超时 |

**`l_onoff=1, l_linger=0` 的妙用**:**短连接服务端主动关时绕过 TIME_WAIT**——能解决 TIME_WAIT 撑爆 socket 表的问题(详见 12 篇 TCP 状态机)。**但代价是 RST 而非 FIN,对方应用层可能报"connection reset"**。**慎用**。

### 4.7 SO_RCVBUF / SO_SNDBUF:接收 / 发送缓冲区

```c
int size = 256 * 1024;
setsockopt(fd, SOL_SOCKET, SO_RCVBUF, &size, sizeof(size));
setsockopt(fd, SOL_SOCKET, SO_SNDBUF, &size, sizeof(size));
```

**默认值**(`/proc/sys/net/ipv4/tcp_rmem` / `tcp_wmem`):

```
tcp_rmem  4096   131072   6291456    (min default max)
tcp_wmem  4096    16384   4194304
```

**关键**:**Linux 自动调整缓冲区**(autotuning,默认开)——你设的值会被内核乘 2(因为内核要保留一半给 metadata),且不能超过 `tcp_rmem` 第三列。**关掉 autotune** 才能让 setsockopt 生效到精确值:

```bash
sysctl net.ipv4.tcp_moderate_rcvbuf=0
```

**何时调**:**长肥管道(高延迟 + 高带宽,如跨国跨洋)**——根据 BDP(带宽时延积)算缓冲区,详见 16 篇 TCP 调优。

### 4.8 SO_RCVTIMEO / SO_SNDTIMEO:读写超时

```c
struct timeval tv = { .tv_sec = 5, .tv_usec = 0 };
setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
// 之后 recv 5 秒读不到数据返回 -1, errno = EAGAIN
```

**比起非阻塞 + epoll 的方式**:这是阻塞 socket 上加超时的"穷人方案"——简单脚本可以用,高并发服务器还是上 epoll。

---

## 五、半关闭:shutdown

`close` 是"两个方向都关",`shutdown` 可以**只关一个方向**:

```c
shutdown(fd, SHUT_RD);    // 关读:对方 send,我 recv 返回 0,但我能继续 send
shutdown(fd, SHUT_WR);    // 关写:发 FIN,我不再 send,但能继续 recv 对方剩下的字节
shutdown(fd, SHUT_RDWR);  // 双向关,等价 close 但不释放 fd
```

### 5.1 半关闭的经典场景:HTTP 客户端

```
客户端:               服务端:
POST /upload          
Content-Length: 1MB
[1MB body]
shutdown(SHUT_WR)  →  收到 FIN,知道 body 发完了,
                      不用再判断 Content-Length
                      处理完返回 response
                  ←   send response + close
recv response,close
```

**TCP 是双工的**——半关闭是这种"我说完了,但你继续说"语义的标准实现。

### 5.2 close vs shutdown 的本质区别

```
close(fd):
  fd 引用计数 -1,如果归零,关闭 socket(双向)
  
shutdown(fd, SHUT_RDWR):
  立即对所有共享这个 socket 的进程都关闭(无视引用计数)
```

**fork 后两个进程共享 socket**——父进程 `close` 不会真关,子进程还能用;`shutdown` 会立即关。**这是多进程服务器的一个微妙差别**。

---

## 六、地址查询:getsockname / getpeername

```c
int getsockname(int fd, struct sockaddr *addr, socklen_t *len);  // 我自己绑的地址
int getpeername(int fd, struct sockaddr *addr, socklen_t *len);  // 对端地址
```

**典型用途**:

- 服务端 `accept` 后想知道客户端 IP 来日志 → `getpeername`(其实 accept 第二参数已经给了)
- 客户端 `connect` 后想知道内核分配的本地端口 → `getsockname`
- NAT 后面的服务想知道"对外"看到的 IP → **不行**,getsockname 返回的是 NAT 内的 IP,要靠 STUN

```c
// 客户端打印自己的源端口
struct sockaddr_in local;
socklen_t len = sizeof(local);
getsockname(fd, (struct sockaddr *)&local, &len);
printf("local port = %d\n", ntohs(local.sin_port));
```

---

## 七、scatter-gather IO:sendmsg / recvmsg

普通 `send` 一次只能发一段连续内存。**真实场景常常要拼接多段**——比如 HTTP 响应的 header(动态生成)+ body(从文件读)。

### 7.1 没有 scatter-gather 的麻烦

```c
// 方案 A:拼到一个大 buffer
memcpy(buf, header, h_len);
memcpy(buf + h_len, body, b_len);
send(fd, buf, h_len + b_len, 0);
// 多了一次内存拷贝

// 方案 B:两次 send
send(fd, header, h_len, 0);
send(fd, body, b_len, 0);
// 多了一次 syscall + 可能两个小包(Nagle 触发)
```

### 7.2 sendmsg + iovec:一次 syscall,多段内存

```c
struct iovec iov[2] = {
    { .iov_base = header, .iov_len = h_len },
    { .iov_base = body,   .iov_len = b_len },
};
struct msghdr msg = {
    .msg_iov    = iov,
    .msg_iovlen = 2,
};
sendmsg(fd, &msg, 0);  // 内核一次性把两段都送进协议栈
```

**优点**:

- **一次 syscall**(syscall 比函数调用慢 100-1000 倍,见 osLearning/02)
- **内核保证原子性**(对 UDP 有意义——一个 datagram 出去)
- **零额外拷贝**(用户态不用拼)

### 7.3 writev / readv:简化版

如果不需要 control message(带外数据、ancillary data)、不需要指定地址,用 `writev` / `readv` 更简单:

```c
writev(fd, iov, 2);      // 等价于 sendmsg,但只支持 iovec
readv(fd, iov, 2);
```

### 7.4 真实使用:HTTP/2 帧组装

HTTP/2 一帧 = 9 字节固定 header + 变长 payload——**Nginx / Envoy 内部都用 writev 拼**,避免拷贝 payload。

---

## 八、完整 echo server(C 版)

```c
#include <arpa/inet.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <unistd.h>

#define PORT     8080
#define BACKLOG  4096
#define BUF_SIZE 4096

static void die(const char *msg) {
    perror(msg);
    exit(1);
}

int main(void) {
    /* 忽略 SIGPIPE,对方关了 send 返回 EPIPE 即可,不要因此退出 */
    signal(SIGPIPE, SIG_IGN);

    int srv = socket(AF_INET, SOCK_STREAM, 0);
    if (srv < 0) die("socket");

    /* 端口复用:重启时不用等 TIME_WAIT */
    int yes = 1;
    setsockopt(srv, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof(yes));
    setsockopt(srv, SOL_SOCKET, SO_REUSEPORT, &yes, sizeof(yes));

    struct sockaddr_in addr = {
        .sin_family      = AF_INET,
        .sin_port        = htons(PORT),
        .sin_addr.s_addr = htonl(INADDR_ANY),
    };
    if (bind(srv, (struct sockaddr *)&addr, sizeof(addr)) < 0) die("bind");
    if (listen(srv, BACKLOG) < 0) die("listen");

    printf("echo server listening on :%d\n", PORT);

    for (;;) {
        struct sockaddr_in cli;
        socklen_t cli_len = sizeof(cli);
        int conn = accept(srv, (struct sockaddr *)&cli, &cli_len);
        if (conn < 0) {
            perror("accept");
            continue;
        }

        char ip[INET_ADDRSTRLEN];
        inet_ntop(AF_INET, &cli.sin_addr, ip, sizeof(ip));
        printf("conn from %s:%d\n", ip, ntohs(cli.sin_port));

        /* 关 Nagle,echo 是低延迟场景 */
        setsockopt(conn, IPPROTO_TCP, TCP_NODELAY, &yes, sizeof(yes));

        /* 简单 fork 模型(生产用 epoll,见下一章) */
        if (fork() == 0) {
            close(srv);
            char buf[BUF_SIZE];
            ssize_t n;
            while ((n = recv(conn, buf, sizeof(buf), 0)) > 0) {
                /* MSG_NOSIGNAL 防 SIGPIPE,确保对方关了不会杀进程 */
                ssize_t left = n, sent = 0;
                while (left > 0) {
                    ssize_t w = send(conn, buf + sent, left, MSG_NOSIGNAL);
                    if (w < 0) goto done;
                    left -= w; sent += w;
                }
            }
        done:
            close(conn);
            exit(0);
        }
        close(conn);  /* 父进程关掉,引用计数留给子进程 */
    }
    return 0;
}
```

**编译跑**:

```bash
gcc echo.c -o echo && ./echo &
nc 127.0.0.1 8080
hello
hello       # 服务端 echo 回来
```

**这版的局限**:`fork` 一连接一进程,**最多撑几千连接**,而且进程 fork / 销毁开销大。**生产做法**是 epoll + 单进程多路复用,见下一章。

---

## 九、踩坑提醒

1. **忘了 `htons` / `htonl`**——port 字节序错了,bind 看起来成功,实际监听在另一个端口,客户端连不上
2. **`SO_REUSEADDR` 和 `SO_REUSEPORT` 混用**——前者解决重启,后者解决多进程负载均衡,功能完全不同
3. **不忽略 SIGPIPE**——对方一掉线服务端进程死,**生产服务器必 `signal(SIGPIPE, SIG_IGN)` 或所有 send 带 `MSG_NOSIGNAL`**
4. **listen backlog 用默认 128**——高并发场景下 SYN 包被丢,客户端连接超时;生产应调到 4096-8192,且记得改 `somaxconn`
5. **TCP_NODELAY 默认不开**——Redis client / RPC client 不开 Nagle,P99 莫名抖 40ms(撞上 delayed ACK)
6. **以为 close 立刻关连接**——实际上发送缓冲区可能还没发完,可能还在 TIME_WAIT;`SO_LINGER` 才能精确控制
7. **UDP buffer 给小了**——一个 datagram 超过 buf 直接被截断,后面的字节永远丢,**和 TCP 字节流语义完全不同**
8. **客户端不复用连接**——每次新建 TCP,握手 1 RTT、TLS 多 1-2 RTT,P99 全在握手上;**用连接池**
9. **以为 send 一次就把所有字节发完**——`send(fd, buf, 1024, 0)` 可能只返回 800,**必须循环 send**(尤其非阻塞 socket)
10. **以为 recv 返回 0 是错误**——返回 0 是对方优雅关闭(收到 FIN),返回 -1 才是错误,要看 errno 区分 EAGAIN(没数据) / ECONNRESET(被 RST) / 其他真错

---

下一篇:`31-epoll在网络的应用.md`,讲为什么单 fork 撑不住一万连接、select / poll 的 O(n) 扫描怎么演化成 O(1) 的 epoll、LT 与 ET 触发模式的取舍、`SO_REUSEPORT` 怎么解决 accept 惊群、Reactor 模式的标准实现、Nginx 与 Node.js libuv 的事件循环架构,以及百万长连接服务器到底卡在哪。
