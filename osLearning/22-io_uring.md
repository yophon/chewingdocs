# io_uring

上一篇把 epoll 夸了一路,这一篇先拆它的台。epoll 解决的是"等谁就绪",但**就绪之后的活它一点没干**:read 是一次 syscall,write 是一次 syscall,fsync 又是一次。高 QPS 下,你的服务真正的时间黑洞往往不是"等",而是这些**一次次跨越用户态/内核态边界的过路费**。更难受的是普通文件——epoll 压根管不了它(21 篇末尾讲过),逼得所有 runtime 都养一个线程池专门伺候磁盘。io_uring 是 Linux 5.1(2019)对这两笔旧账的总清算:**它第一次让文件 IO 和网络 IO 住进同一个高性能异步框架**。

> 一句话先记住:**io_uring = 用户态和内核共享两条环形队列——提交队列 SQ(Submission Queue)和完成队列 CQ(Completion Queue)**。你往 SQ 写"我要做 read/accept/send",内核做完往 CQ 写"完成了,结果是 res"。epoll 告诉你"可以去做了",io_uring 直接告诉你"**做完了**"。它的优势不是逢场景就秒杀 epoll,而是**批量提交省 syscall + 文件/网络/超时/取消统一进一个异步模型**。

---

## 一、epoll 时代欠下的两笔账

### 第一笔:syscall 太多

一个 epoll 服务处理一波请求的真实开销:

```
epoll_wait     1 次 syscall(等)
read × N       N 次 syscall(每个就绪连接读一次起步)
write × N      N 次 syscall(回响应)
fsync / ...    随缘再加
```

syscall 不是免费的(02 篇算过这笔账):陷入内核、保存恢复上下文、污染缓存——单次几百纳秒到微秒级。本来这钱也认了,但 2018 年 Meltdown/Spectre 之后,内核加上 KPTI 等缓解措施,**syscall 的单价显著上涨**。每秒几十万次 IO 的服务,光过路费就能吃掉两位数百分比的 CPU。**"为什么 io_uring 在某些场景能快 30%",第一个答案就在这:把 2N+1 次 syscall 压成 1 次,甚至 0 次**。

### 第二笔:文件 IO 没有像样的异步

- epoll 等不了磁盘完成——普通文件在它眼里永远 ready
- 老的 Linux AIO(`io_submit`)只在 O_DIRECT 下真异步,坑多到连作者都嫌弃
- 于是 libuv、Go runtime、Java NIO 集体选择:**网络走 epoll,文件扔线程池**

一套程序两种 IO 模型,线程池一头还有线程切换和排队开销。io_uring 的野心就是终结这个双轨制:

```
提交一批 IO(管你是文件还是 socket)
内核异步执行
完成后批量收结果
```

---

## 二、两条环:io_uring 的核心结构

io_uring 的精髓是**一块用户态和内核共享的内存**,上面摆两条环形队列:

```
        用户态                          内核态
          │                               │
   写 SQE ├──────→ ┌─────────────┐ ──────→ 取 SQE,执行
          │        │  SQ(提交环) │        │
          │        └─────────────┘        │
          │                               │
   收 CQE ←──────  ┌─────────────┐ ←────── 写 CQE
          │        │  CQ(完成环) │        │
          │        └─────────────┘        │

  双方靠 head/tail 指针(原子操作)交接,环上数据零拷贝共享
```

为什么共享内存这么关键?因为**往队列里塞请求、从队列里收结果,都只是写写本进程能直接访问的内存,不需要 syscall**。syscall 只剩一个用途:通知对方"有活了/我要睡了"(`io_uring_enter`),而这一次通知可以顺带捎上几十个请求——**批处理是写进数据结构基因里的**。

环上的元素长这样:

**SQE(Submission Queue Entry)**——一份请求,核心字段:

```c
opcode      // 干什么:IORING_OP_READ / WRITE / ACCEPT / RECV / SEND ...
fd          // 对哪个 fd 干
addr, len   // buffer 在哪、多长
off         // 文件偏移(文件 IO 用)
user_data   // 64 位,你随便塞,完成时原样还给你
```

**CQE(Completion Queue Entry)**——一份结果,只有三个字段:

```c
user_data   // 原样返回——靠它找回"这是哪个请求/哪个连接"
res         // 返回值,语义同对应 syscall;负数是 -errno
flags
```

`user_data` 是整套异步编程的锚点:提交时塞业务上下文的指针,完成时捞出来继续处理。**忘了设 user_data 的 CQE 等于一封没有寄件人的回信**。

---

## 三、用 liburing 写一遍最小流程

裸的 io_uring syscall 接口(`io_uring_setup` / `io_uring_enter` / `io_uring_register`)细节繁琐,实践中都用官方封装库 liburing:

```c
struct io_uring ring;
io_uring_queue_init(256, &ring, 0);          // 队列深度 256

// 1. 拿一个空 SQE,填上"读 fd 的 offset 处 len 字节到 buf"
struct io_uring_sqe *sqe = io_uring_get_sqe(&ring);
io_uring_prep_read(sqe, fd, buf, len, offset);
io_uring_sqe_set_data(sqe, req);             // 锚点:塞业务上下文

// 2. 提交(这里才发生 syscall,而且可以攒一批一起交)
io_uring_submit(&ring);

// 3. 等完成
struct io_uring_cqe *cqe;
io_uring_wait_cqe(&ring, &cqe);

struct req *req = io_uring_cqe_get_data(cqe);   // 捞回上下文
int res = cqe->res;                              // 按 read 的返回值理解
io_uring_cqe_seen(&ring, cqe);                   // 归还环上槽位
```

四个必须养成的习惯:

- **每个 SQE 都设 `user_data`**——不然完成事件对不上号
- **`res` 按对应 syscall 的返回值理解**——可能短读短写,负数是 `-errno`
- **处理完必须 `cqe_seen`**——不归还槽位,CQ 环会被占满
- **队列深度按最大并发 IO 数设**——深度 256 意味着同时在途的请求最多 256 个

---

## 四、opcode 一览:一个框架装下所有 IO

io_uring 的操作码覆盖面是它"统一异步框架"野心的直接证据:

| opcode | 用途 |
| --- | --- |
| `IORING_OP_READ` / `WRITE` | 文件读写(epoll 管不了的,它管) |
| `IORING_OP_READV` / `WRITEV` | 分散/聚集 IO |
| `IORING_OP_ACCEPT` | 异步接收连接 |
| `IORING_OP_CONNECT` | 异步建连 |
| `IORING_OP_RECV` / `SEND` | socket 收发 |
| `IORING_OP_TIMEOUT` | 定时器——连 timerfd 都不用了 |
| `IORING_OP_LINK_TIMEOUT` | 给链式操作挂超时 |
| `IORING_OP_POLL_ADD` | poll 某个 fd——epoll 的活它也能干 |
| `IORING_OP_FSYNC` | 异步 fsync——数据库写日志的福音 |
| `IORING_OP_CLOSE` | 连 close 都能异步 |

注意 `LINK_TIMEOUT`:SQE 可以用 `IOSQE_IO_LINK` 串成链,"先 read 再 write,任何一步挂了后面取消",再挂个超时——**"带超时的读"这种 epoll 时代要手搓状态机的需求,这里是一条链的事**。

---

## 五、三件性能武器

### 5.1 批量提交:syscall 从 2N+1 到 1

攒 32 个 SQE,一次 `io_uring_submit` 全交上去,一次 syscall 顶 epoll 时代的 32 次 read/write。等待侧同理,一次唤醒能收一批 CQE。**高 QPS 小 IO 的场景,这一条就是那"快 30%"的主力来源**。

### 5.2 SQPOLL:syscall 降到 0

`IORING_SETUP_SQPOLL` 让内核起一个专属线程盯着你的 SQ:

```
用户态:往共享内存写 SQE,完事(连 io_uring_enter 都不用调)
内核线程:忙轮询 SQ,见到新请求立刻取走执行
```

提交路径上 **syscall 归零**,延迟做到极致。代价同样直白:

- 那个内核线程**忙等着,空闲时也烧一个 CPU 核**
- 有内核版本和权限要求
- 流量不密时,纯属花钱买寂寞

适合存储引擎、交易系统这类"延迟就是命"的场景,普通业务别碰。

### 5.3 注册文件与固定 buffer:省掉每次的小账

```c
io_uring_register_files(...)     // 预注册 fd 集合
io_uring_register_buffers(...)   // 预注册并 pin 住内存
```

每次 IO,内核都要对 fd 做引用计数升降、对用户 buffer 做页查找和 pin。单次很小,百万 IOPS 下就是大账。预注册等于"办了年卡":fd 引用一次到位,内存提前 pin 死,每次 IO 走快速通道。

适合高频固定文件、固定内存池的存储/网络高性能服务;**普通业务一上来就用属于过早优化**,复杂度先把你淹了。

---

## 六、io_uring vs epoll:到底怎么选

| | epoll | io_uring |
| --- | --- | --- |
| 模型 | **就绪通知**(可以做了) | **完成通知**(做完了) |
| 就绪后的 read/write | 你自己 syscall | 不存在这一步,结果直接在 CQE 里 |
| 普通文件 IO | 不支持,只能线程池 | **原生强项** |
| syscall 数量 | wait + 每个 fd 读写各一次 | 批量 submit/wait,可降到 0 |
| 超时/取消/链式 | 自己搓状态机 | opcode 原生支持 |
| 成熟度 | 二十年老兵,稳 | 新,迭代快,建议内核 5.10+ |
| 心智复杂度 | 中(ET/LT 已经够喝一壶) | 高(buffer 生命周期、环管理) |

现在可以把"快 30%"完整拼出来了——**当瓶颈在 IO 路径本身**(高 QPS 小包、大量 fsync、文件+网络混合)时,io_uring 赢在三处:

1. **省 syscall**:批量提交 + 共享内存通信,Meltdown 之后这笔钱更值钱
2. **省线程池**:文件 IO 不再排队等 worker 线程,少一层切换和排队
3. **省状态机**:超时、取消、链式操作内核原生做,用户态代码路径更短

反过来,**如果你的服务每个请求要跑 2ms 业务逻辑,IO 只占 5%,那换 io_uring 一根毛都快不了**——瓶颈不在那。纯网络长连接、计算占主导的业务,epoll 依旧又稳又够。

生态现状一句话:Rust(tokio-uring、glommio/monoio)、RocksDB、Netty(incubator)、libuv 都已接入或实验性接入;但 io_uring 历史上出过多次安全漏洞,**不少容器平台和云厂商默认用 seccomp 禁了它**——上线前先确认你的运行环境给不给跑,这是真实卡点,不是注脚。

---

## 七、什么时候该用,什么时候别凑热闹

**适合:**

- 高性能存储引擎、数据库(大量随机读写 + fsync)
- 代理/网关同时做磁盘缓存(文件 + 网络混合,io_uring 的主场)
- 日志/消息系统(高吞吐顺序写)
- C/Rust 写的网络服务,QPS 高到 syscall 开销可见
- 需要大量 timeout/cancel/link 语义的异步任务

**不适合:**

- 内核版本不可控(客户环境、老发行版)——5.1 能跑,**5.10+ 才算能用,越新越好**
- 团队不熟 C/Rust 底层 IO——buffer 生命周期管理是真刀真枪的内存安全问题
- 纯业务 CRUD——瓶颈在数据库在网络,不在 IO 模型
- epoll 还根本不是瓶颈——先 profile,再谈换

---

## 踩坑提醒

1. **以为 io_uring 是"更快的 epoll"**——模型根本不同:epoll 报"就绪",io_uring 报"完成";它的真正卖点是统一异步框架 + 批处理,不是逢场景必快
2. **内核版本太低还硬上**——5.1 刚引入时 bug 和能力缺口都多,生产建议 5.10+,新特性(multishot accept、ring buffer)要更新的内核
3. **以为所有操作都真异步**——部分路径(某些文件系统、不支持的 opcode)内核会 fallback 到内部 io-wq 工作线程,延迟特征完全不同;关键路径要实测
4. **buffer 提交后就释放/复用**——从 SQE 提交到 CQE 回来之前,buffer 的所有权在内核手里;提前动它,轻则数据错乱,重则内存安全事故
5. **不处理短读短写**——`res` 完全可能小于请求长度,和 syscall 一样要自己续上
6. **队列深度拍脑袋设**——太浅则 `get_sqe` 拿不到空槽,吞吐被卡;CQ 处理不及时还会溢出丢事件
7. **忘了运行环境可能禁用 io_uring**——历史安全问题让很多容器/云环境默认 seccomp 拦截,本地跑得欢,上线 EPERM
8. **拿 io_uring 救一个 IO 占比 5% 的服务**——先 `perf` 确认瓶颈真在 syscall/事件模型,否则只是给系统加复杂度

---

下一篇:`23-零拷贝.md`,讲数据搬运本身的优化——传统 read+write 发个文件要四次拷贝两次 syscall,sendfile/splice/mmap 怎么把 CPU 从搬运工的活里解放出来,以及 Kafka、Nginx 吃零拷贝红利的名场面。
