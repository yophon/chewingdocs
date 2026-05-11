# epoll 深入

epoll 是 Linux 高并发网络的地基。Nginx、Redis、Node.js、Go netpoller、Java Netty 都绕不开它。上一篇讲 IO 模型,这一篇深入 epoll 自己:**红黑树保存关注集合、就绪链表保存 ready fd、LT/ET 的真实差别、EPOLLONESHOT 和 EPOLLEXCLUSIVE 解决什么、为什么 epoll 不是万能事件系统**。

> 一句话先记住:**epoll = 内核保存 fd 关注集合 + 只把就绪事件返回给你**。`epoll_ctl` 改关注集合,`epoll_wait` 取就绪链表。LT 简单,ET 高效但必须非阻塞并读到 `EAGAIN`。**epoll 的性能来自避免每次全量扫描,不是来自 read/write 更快**。

---

## 一、select/poll 的问题

select/poll 每次调用都要:

```
用户态传一堆 fd
内核扫描一遍
返回后用户态再扫描一遍
```

1 万连接 1% 活跃时,99% 扫描都是浪费。

epoll 把两件事拆开:

```
epoll_ctl: fd 集合变化时才告诉内核
epoll_wait: 只拿就绪 fd
```

---

## 二、epoll 三件套

```c
int epoll_create1(int flags);
int epoll_ctl(int epfd, int op, int fd, struct epoll_event *event);
int epoll_wait(int epfd, struct epoll_event *events, int maxevents, int timeout);
```

典型流程:

```c
int ep = epoll_create1(EPOLL_CLOEXEC);

struct epoll_event ev = {0};
ev.events = EPOLLIN | EPOLLRDHUP;
ev.data.fd = listen_fd;
epoll_ctl(ep, EPOLL_CTL_ADD, listen_fd, &ev);

for (;;) {
    int n = epoll_wait(ep, events, 128, -1);
    for (int i = 0; i < n; i++) {
        handle(events[i]);
    }
}
```

---

## 三、内核数据结构

一个 epoll 实例大致包含:

```
interest set: 红黑树
  保存你关心的 fd 和事件

ready list: 就绪链表
  保存已经 ready 的 fd

wait queue:
  epoll_wait 睡眠的线程
```

当 socket 收到数据:

```
网卡中断/软中断
  → 数据进入 socket receive queue
  → socket 唤醒等待队列
  → epoll callback 把 fd 放入 ready list
  → 唤醒 epoll_wait
```

`epoll_wait` 不扫描所有 fd,只取 ready list。

---

## 四、LT 与 ET

### 4.1 LT

只要状态仍满足,就一直通知。

```c
ev.events = EPOLLIN;
```

优点:漏读没关系。
缺点:没处理完会反复唤醒。

### 4.2 ET

只在状态变化时通知一次。

```c
ev.events = EPOLLIN | EPOLLET;
```

三条铁律:

1. fd 必须非阻塞
2. read/write 必须循环到 `EAGAIN`
3. 要正确处理短读、短写、`EINTR`

```c
for (;;) {
    ssize_t n = read(fd, buf, sizeof(buf));
    if (n > 0) process(buf, n);
    else if (n == 0) close(fd);
    else if (errno == EAGAIN) break;
    else if (errno == EINTR) continue;
    else close(fd);
}
```

---

## 五、EPOLLOUT 的正确用法

socket 大多数时候可写。如果一直监听 EPOLLOUT,事件循环会被写事件打满。

正确策略:

```
平时不关心 EPOLLOUT
send 返回 EAGAIN → 把剩余数据放 output buffer → MOD 加 EPOLLOUT
EPOLLOUT 到来 → 继续 send
写完 → MOD 去掉 EPOLLOUT
```

---

## 六、EPOLLONESHOT

`EPOLLONESHOT` 表示事件触发一次后自动禁用,必须 `EPOLL_CTL_MOD` 重新启用。

适合多线程处理同一个 epoll 的场景:

```
线程 A 拿到 fd 事件
fd 自动 disable
线程 A 处理完后 MOD 重新打开
```

避免同一个连接同时被多个 worker 处理。

---

## 七、EPOLLEXCLUSIVE 与惊群

多个线程/进程阻塞在同一个 listen fd 上,一个连接到来,早期可能唤醒多个等待者,只有一个 accept 成功,其他白醒。

Linux 4.5 引入 `EPOLLEXCLUSIVE`:

```c
ev.events = EPOLLIN | EPOLLEXCLUSIVE;
epoll_ctl(ep, EPOLL_CTL_ADD, listen_fd, &ev);
```

它让内核尽量只唤醒一个 epoll waiter。

另一种常见方案是 `SO_REUSEPORT`:每个 worker 一个 listen socket,内核按哈希/负载分发连接。

---

## 八、epoll 的边界

epoll 适合 socket、pipe、eventfd、timerfd 这类"会等待就绪"的 fd。

普通文件通常不适合:

- 普通文件读写一般总是 ready
- epoll 不能告诉你磁盘 IO 完成
- 文件异步更适合 io_uring 或线程池

这就是为什么很多 runtime:

- 网络 IO 用 epoll
- 文件 IO 用线程池

---

## 九、生产级事件循环要处理什么

一个真正的 Reactor 不只是 epoll:

- accept 限速
- 连接对象生命周期
- input/output buffer
- 半关闭
- 定时器
- 背压
- 最大连接数
- TLS 握手状态机
- 跨线程唤醒(eventfd)

epoll 只解决"谁 ready",不解决协议和资源管理。

---

## 十、常见坑

1. **ET 忘设非阻塞**:一个 read 卡住整个 loop。
2. **ET 没读到 EAGAIN**:剩余数据没有下次通知。
3. **EPOLLOUT 常驻**:CPU 100%。
4. **close 后事件复用**:fd 数字可能被新连接复用,连接对象要做 generation/引用管理。
5. **忘处理 EPOLLERR/HUP/RDHUP**:连接泄漏。
6. **maxevents 太小**:高峰期事件处理不完。

---

## 十一、排查命令

```bash
strace -e epoll_wait,epoll_ctl -p <pid>
ss -antp
lsof -p <pid>
perf top
cat /proc/<pid>/limits
```

看 fd 上限:

```bash
ulimit -n
cat /proc/sys/fs/file-max
```

> **结论**:epoll 是高并发网络的地基,但不是完整框架。它把"等待大量 fd"做快了,剩下的正确性都在你的事件循环:非阻塞、缓冲区、背压、连接生命周期。

