# epoll 深入

学 epoll 的最大障碍不是 API 记不住——三个函数而已——是**不知道内核在背后干了什么**。不知道内核结构,你就解释不了"为什么 epoll 比 select 快",更解释不了 ET 模式下那个经典事故:**连接还在、数据已经到了、但你的服务永远不再读它**。Nginx、Redis、Node.js、Go netpoller、Java Netty,底下全是 epoll,这一篇把它拆开看:内核里的红黑树和就绪链表、LT/ET 的真实差别、EPOLLONESHOT 和 EPOLLEXCLUSIVE 在解决什么、以及为什么 epoll 不是万能事件系统。

> 一句话先记住:**epoll = 把"fd 关注集合"搬进内核常驻保存,事件就绪时由回调推给你,而不是你每次全量扫描**。`epoll_ctl` 改关注集合,`epoll_wait` 只取就绪链表。**epoll 的快来自"避免重复扫描",不是 read/write 本身变快了**——这一点决定了它的能力边界,也埋下了 io_uring 登场的伏笔。

---

## 一、没有 epoll 的世界:select/poll 在浪费什么

上一篇(20 篇)讲过,IO 多路复用的本质是"一个线程等多个 fd"。select/poll 也能干这事,问题出在**每次调用的成本结构**:

```
select/poll 每一次调用:
  用户态 → 把整个 fd 数组拷进内核        O(n)
  内核   → 把每个 fd 都问一遍"你就绪没"   O(n)
  返回   → 用户态再把数组扫一遍找就绪的    O(n)
```

1 万个连接,每秒 wait 几千次,**每次都是三个 O(n)**。而真实世界的长连接服务(IM、推送、网关)有个残酷事实:**绝大多数连接绝大多数时间是安静的**。1 万连接里同一时刻活跃的可能就 100 个,select/poll 99% 的扫描是在反复确认"它还是没动静"。

epoll 的洞察很简单:**关注集合很少变,就绪事件很少有——那就把这两件事拆开,各自只在发生时付成本**:

```
epoll_ctl:  集合变化时才告诉内核(加连接 / 删连接)
epoll_wait: 只取就绪的那一小撮,不碰安静的大多数
```

这就是为什么 epoll 的复杂度是 O(就绪数) 而不是 O(连接数)——**连接数从 1 万涨到 10 万,epoll_wait 的成本几乎不变**,select 的成本翻 10 倍。

---

## 二、内核里到底有什么:红黑树 + 就绪链表

`epoll_create1` 创建的不是一个普通 fd,是内核里一个**常驻的 eventpoll 对象**,里面三样东西:

```
eventpoll 实例
├── interest set(红黑树)
│     你关心的所有 fd + 各自关注的事件
│     红黑树保证 ctl 增删改查 O(log n)
│
├── ready list(就绪链表)
│     已经就绪、等你来取的 fd
│
└── wait queue(等待队列)
      正在 epoll_wait 里睡觉的线程
```

关键在于**事件怎么进 ready list**。注册 fd 时,epoll 会在那个 socket 的唤醒队列上挂一个回调。之后数据到来的完整链路(中断机制 05 篇讲过):

```
网卡收到数据
  → 硬中断/软中断,数据进入 socket 接收队列
  → socket 唤醒自己的等待队列
  → epoll 的回调被触发:把这个 fd 挂到 ready list
  → 顺手唤醒睡在 epoll_wait 上的线程
```

看清楚这个方向:**不是 epoll_wait 去轮询所有 fd,是数据到达时 socket 主动"打卡报到"**。epoll_wait 醒来后只需要把 ready list 倒出来,一个安静的 fd 从头到尾不会被碰。

| | select/poll | epoll |
| --- | --- | --- |
| 关注集合存哪 | 用户态,每次传 | **内核常驻**(红黑树) |
| 谁找就绪 fd | 内核挨个问(拉) | socket 回调报到(**推**) |
| wait 成本 | O(总连接数) | **O(就绪数)** |
| 集合变更成本 | 免费(反正每次全传) | epoll_ctl,O(log n) |

> 顺便解决一个常见疑问:"连接很少的时候 epoll 是不是反而慢?"理论上是——几十个 fd 时 select 的全量扫描快得可以忽略,epoll 还多了 ctl 的 syscall。但差距小到没有工程意义,**所以现代代码无脑用 epoll 就对了**。

---

## 三、三件套与典型事件循环

```c
int epoll_create1(int flags);
int epoll_ctl(int epfd, int op, int fd, struct epoll_event *event);
int epoll_wait(int epfd, struct epoll_event *events, int maxevents, int timeout);
```

一个最小可用的服务端骨架:

```c
int ep = epoll_create1(EPOLL_CLOEXEC);

struct epoll_event ev = {0};
ev.events = EPOLLIN | EPOLLRDHUP;   // 关心可读 + 对端关闭
ev.data.fd = listen_fd;
epoll_ctl(ep, EPOLL_CTL_ADD, listen_fd, &ev);

for (;;) {
    int n = epoll_wait(ep, events, 128, -1);   // -1 = 一直睡到有事
    for (int i = 0; i < n; i++) {
        handle(events[i]);   // accept 新连接,或读写已有连接
    }
}
```

几个容易被忽略的细节:

- `ev.data` 是个 union,除了 fd 还能塞指针——**生产代码几乎都塞连接对象指针**,事件来了直接拿到上下文,不用再查表
- `EPOLLRDHUP` 让你能区分"对端关写"和"真有数据",处理半关闭必备
- `maxevents`(上面的 128)只是单次取的上限,**不是丢事件**——没取完的还在 ready list 里,下次 wait 接着给。但设太小会让高峰期一次 wait 处理不完,多绕几圈循环

---

## 四、LT 与 ET:同一份数据,两种通知哲学

这是 epoll 最重要、事故最多的一节。LT(Level-Triggered,水平触发)和 ET(Edge-Triggered,边缘触发)的区别,用接收缓冲区的"水位"打比方最清楚:

```
socket 接收缓冲区里有 2KB 数据,你每次只读 1KB:

LT(看水位):  "缓冲区有数据" 这个状态还在,就一直喊你
   wait → 通知 → 读 1KB → wait → 又通知(还剩 1KB)→ 读 1KB → 安静

ET(看变化):  只在 空 → 非空 的"跳变"那一刻喊你一次
   wait → 通知 → 读 1KB → wait → 沉默(没有新数据到,就没有新跳变)
                                  ↑ 剩下的 1KB 永远没人提醒你
```

### 4.1 LT:默认模式,容错的

```c
ev.events = EPOLLIN;            // 不加 EPOLLET 就是 LT
```

只要条件仍满足(可读/可写),每次 epoll_wait 都会再报。**这次没读完?没关系,下次还会喊你**。代价是:如果你处理慢,同一个 fd 会反复出现在结果里,反复唤醒。

### 4.2 ET:高效模式,但有三条铁律

```c
ev.events = EPOLLIN | EPOLLET;
```

只在状态跳变时通知一次,通知次数最少、唤醒最少,Nginx 用的就是它。但**它把"确保读干净"的责任完整地甩给了你**,于是有三条铁律,一条都不能破:

1. **fd 必须设成非阻塞**(`O_NONBLOCK`)
2. **read/write 必须循环到返回 `EAGAIN` 为止**——这是"我确认读干净了"的唯一凭证
3. **正确处理短读、短写和 `EINTR`**

标准的 ET 读循环长这样:

```c
for (;;) {
    ssize_t n = read(fd, buf, sizeof(buf));
    if (n > 0)              process(buf, n);     // 继续循环,可能还有
    else if (n == 0)        { close_conn(fd); break; }   // 对端关闭
    else if (errno == EAGAIN) break;             // 读干净了,安心返回 wait
    else if (errno == EINTR)  continue;          // 被信号打断,重试
    else                    { close_conn(fd); break; }   // 真错误
}
```

### 4.3 经典事故:ET 模式连接假死

值得讲一个真实形态的事故,因为**每个自己写事件循环的团队几乎都踩过一遍**:

> 服务上线后一切正常,压测也过了。运行几天后客服反馈"部分用户的请求一直转圈"。排查发现:连接是 ESTABLISHED 的,`ss` 看接收队列 Recv-Q 里**明明有数据**,但服务死活不读。重启就好,过几天又有。

原因:用了 ET,但读循环写成了"读一次就走"(或循环条件有 bug 提前 break)。某次两个请求的数据几乎同时到达,一次跳变、一次通知,代码只读走了第一个请求,第二个留在缓冲区里。**之后这个连接如果对端不再发新数据(它在等响应,当然不发),就永远不会有新跳变,epoll 永远沉默**——连接没断,数据在,服务"瞎了"。这种假死最阴险的地方是**低流量时复现不了**,数据包很少挤在同一次通知里。

排查这类问题的趁手组合:`ss -antp` 看 Recv-Q 是否堆积 + `strace -e epoll_wait` 看该 fd 是否再没出现过。

**怎么选?**LT + 非阻塞已经能支撑绝大多数服务,逻辑简单不易错;ET 在海量连接、追求极致唤醒次数时收益明显。**拿不准就 LT**——少一次唤醒的收益,远比一个假死事故便宜。

---

## 五、EPOLLOUT:可写事件要"按需点亮"

新手最常见的 CPU 100% 事故来自这一行:注册时顺手写了 `EPOLLIN | EPOLLOUT`。

问题在于:**socket 的发送缓冲区绝大多数时候是有空位的,也就是"绝大多数时候可写"**。LT 模式下常驻监听 EPOLLOUT,等于每次 epoll_wait 都立刻带着一堆"它可写!"返回——事件循环空转,CPU 拉满,而你根本没东西要写。

正确的姿势是把 EPOLLOUT 当成**临时闹钟**,只在"写不动了"的时候才设:

```
平时:               只注册 EPOLLIN,直接 send
send 返回 EAGAIN:    发送缓冲区满了
                    → 剩余数据放进自己的 output buffer
                    → epoll_ctl MOD,加上 EPOLLOUT
EPOLLOUT 到来:       缓冲区腾出空间了 → 接着 send
全部写完:            epoll_ctl MOD,把 EPOLLOUT 摘掉
```

这个"摘掉"动作就是网络框架里说的**关注写事件/取消写事件**,Netty、muduo 全是这个套路。

---

## 六、EPOLLONESHOT:多线程抢活时的安全栓

场景:多个 worker 线程共享同一个 epoll 实例,事件来了谁抢到谁处理。问题随之而来——线程 A 正在处理 fd 5 的数据,fd 5 又来了新数据,LT 又把它报给了线程 B。**两个线程同时操作同一个连接**,数据顺序、缓冲区状态全乱。

`EPOLLONESHOT` 的语义:**事件触发一次后,这个 fd 自动在 epoll 里被禁用**,直到你用 `EPOLL_CTL_MOD` 重新武装它:

```
线程 A 拿到 fd 事件 → fd 自动 disable(谁也拿不到它的新事件)
线程 A 处理完毕     → MOD 重新打开
```

一个连接同一时刻最多被一个线程持有,锁都省了。代价是每个事件多一次 MOD 的 syscall——这也是为什么另一派(如 Netty)选择"每个连接固定绑给一个 event loop 线程",从结构上消灭竞争,不靠 ONESHOT。

---

## 七、惊群与 EPOLLEXCLUSIVE

惊群(thundering herd)这个词很形象:多个进程/线程都在等同一个 listen fd,一个连接到来,**全部被唤醒,一拥而上,只有一个 accept 成功,其余白醒一场**——白白付了唤醒、调度、缓存抖动的成本。连接来得越密,浪费越壮观。早年 Nginx 多 worker 抢 accept,靠的是自己加一把 accept_mutex 锁来串行化,就是在绕这个坑。

内核后来给了两个正解:

**方案一:EPOLLEXCLUSIVE(Linux 4.5+)**

```c
ev.events = EPOLLIN | EPOLLEXCLUSIVE;
epoll_ctl(ep, EPOLL_CTL_ADD, listen_fd, &ev);
```

语义是"这个 fd 就绪时,**尽量只唤醒一个** epoll waiter"。注意措辞是尽量——它是"至少唤醒一个"的弱保证,不是精确一个,但已经把惊群从 N 砍到接近 1。

**方案二:SO_REUSEPORT(Linux 3.9+)**

换个思路,根本不共享 listen fd:**每个 worker 自己 bind 一个同端口的 listen socket**,内核按四元组哈希把新连接直接分发给某一个。没有共享,自然没有惊群,还顺带做了负载均衡。新版 Nginx 的 `listen 80 reuseport` 就是它,实测高并发 accept 场景吞吐明显更好。

| | EPOLLEXCLUSIVE | SO_REUSEPORT |
| --- | --- | --- |
| 思路 | 共享 fd,少唤醒 | 各持 fd,内核分发 |
| 负载均衡 | 谁醒谁拿,可能不均 | 哈希分发,较均匀 |
| 改动量 | 加个 flag | listen socket 创建方式要改 |

---

## 八、epoll 的边界:它管不了普通文件

epoll 适合的对象是 socket、pipe、eventfd、timerfd 这类**"有等待语义"的 fd**——它们会经历"没数据→有数据"的状态跳变,有跳变才有事件。

普通磁盘文件不一样:

- 在 epoll 看来**普通文件永远是 ready 的**——监听了也只会立刻返回,毫无信息量
- 你真正想等的是"这次磁盘读什么时候完成",而 epoll 的词汇表里**只有"就绪",没有"完成"**
- read 一个不在 page cache 里的文件,该卡还是卡(卡在磁盘 IO 上)

这就是为什么几乎所有 runtime 都长成双轨制:

```
网络 IO → epoll 事件循环
文件 IO → 线程池硬扛(libuv / Go runtime / Java NIO 全是)
```

一个事件循环,两套机制,缝合得很别扭。**把"就绪通知"升级成"完成通知"、让文件和网络进同一个异步框架,正是下一篇 io_uring 干的事**。

---

## 九、生产级事件循环:epoll 只是地基

最后泼盆冷水:epoll 只解决"谁 ready"这一件事。一个真正能扛生产流量的 Reactor,在 epoll 之上还要处理一长串:

- **accept 限速**——连接风暴时不能无脑收
- **连接对象生命周期**——什么时候建、谁持有、close 后怎么安全销毁
- **input/output buffer**——TCP 是字节流,半个请求、三个半请求都是常态
- **半关闭**——对端关了写,你可能还有数据要发
- **定时器**——空闲连接踢掉、请求超时
- **背压**——下游写不动时,要反过来停止读上游,否则内存被 buffer 吃光
- **最大连接数**——fd 耗尽前主动拒绝
- **TLS 握手状态机**——握手期间"可读"不等于"有应用数据"
- **跨线程唤醒**——别的线程想叫醒 epoll_wait,标准做法是往 eventfd 写一字节

这串清单就是 Netty / libuv / muduo 存在的理由——**epoll 提供事件,框架提供正确性**。

---

## 十、排查工具箱

```bash
strace -e epoll_wait,epoll_ctl -p <pid>   # 看事件循环在干嘛、有没有空转
ss -antp                                   # 看连接状态、Recv-Q/Send-Q 堆积
lsof -p <pid>                              # 看进程打开了哪些 fd
perf top                                   # CPU 100% 时看热点在哪
cat /proc/<pid>/limits                     # 该进程的 fd 上限
```

fd 上限是高并发服务的第一道坎,两层都要看:

```bash
ulimit -n                      # 进程级
cat /proc/sys/fs/file-max      # 系统级
```

---

## 踩坑提醒

1. **以为 epoll 快是因为 read/write 快**——快的只是"等"这一步,数据拷贝一个字节没少;这正是 io_uring 要继续解决的
2. **ET 模式忘设非阻塞**——某次 read 把缓冲区读空后再 read 一次,整个事件循环卡死在这一个连接上
3. **ET 没循环读到 EAGAIN**——剩余数据没有下次通知,连接假死,低流量复现不了,上量必炸(见第四节事故)
4. **EPOLLOUT 常驻监听**——socket 几乎总是可写,事件循环空转,CPU 100%;按需点亮、写完摘掉
5. **close 之后没清理连接状态**——fd 数字会被新连接立刻复用,旧事件打到新连接上;连接对象要做 generation 或引用计数
6. **不处理 EPOLLERR / EPOLLHUP / EPOLLRDHUP**——出错和半关闭的连接没人收尸,连接泄漏到 fd 耗尽
7. **maxevents 设得太小**——不丢事件,但高峰期一次 wait 取不完,处理延迟拉长
8. **多线程共享 epoll 又不用 EPOLLONESHOT**——同一连接被两个线程同时处理,数据错乱比崩溃更难查
9. **多进程等同一个 listen fd 不做惊群处理**——连接一来全员空转;上 EPOLLEXCLUSIVE 或 SO_REUSEPORT

---

下一篇:`22-io_uring.md`,讲 Linux 5.1 带来的异步 IO 革命——用户态和内核共享的提交/完成双环怎么把 syscall 省下来、SQPOLL 和固定 buffer 这些进阶武器,以及"为什么把 epoll 换成 io_uring 能在某些场景快 30%"的真正答案。
