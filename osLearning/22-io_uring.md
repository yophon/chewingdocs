# io_uring

epoll 解决了"等谁就绪",但没解决"就绪后还要 syscall read/write"。io_uring 把 IO 变成提交队列和完成队列:用户态写请求到 SQ,内核完成后写结果到 CQ。它第一次让 Linux 上普通文件和 socket 都能用统一的高性能异步模型处理。这一篇讲清楚:**SQ/CQ 数据结构、liburing 基本流程、SQPOLL、固定 buffer/file、和 epoll 的取舍**。

> 一句话先记住:**io_uring = 用户态和内核共享两条 ring:Submission Queue + Completion Queue**。用户提交的是"我要做 accept/read/write/send",拿到的是"这个操作完成了,结果是 res"。它的优势不是每个场景都秒杀 epoll,而是**把文件 IO、网络 IO、超时、取消、批处理放进同一个异步框架**。

---

## 一、为什么需要 io_uring

epoll 模型:

```
epoll_wait  等 fd 就绪
read         syscall
write        syscall
fsync        syscall
```

高 QPS 下 syscall 次数可观。更麻烦的是普通文件:

- epoll 等不了磁盘完成
- 运行时通常用线程池包文件 IO
- 网络一套模型,文件又一套模型

io_uring 的目标:

```
提交多个 IO
内核异步执行
完成后批量收结果
```

---

## 二、两个环

```
用户态                      内核态
  写 SQE  ───────────────→  读 SQE 并执行
  读 CQE  ←───────────────  写 CQE
```

SQE(Submission Queue Entry)描述请求:

```c
opcode: IORING_OP_READ / WRITE / ACCEPT / RECV / SEND ...
fd
addr
len
off
user_data
```

CQE(Completion Queue Entry)描述结果:

```c
user_data  // 原样返回,用来找业务上下文
res        // 返回值,负数是 -errno
flags
```

---

## 三、liburing 基本流程

```c
struct io_uring ring;
io_uring_queue_init(256, &ring, 0);

struct io_uring_sqe *sqe = io_uring_get_sqe(&ring);
io_uring_prep_read(sqe, fd, buf, len, offset);
io_uring_sqe_set_data(sqe, req);

io_uring_submit(&ring);

struct io_uring_cqe *cqe;
io_uring_wait_cqe(&ring, &cqe);

struct req *req = io_uring_cqe_get_data(cqe);
int res = cqe->res;
io_uring_cqe_seen(&ring, cqe);
```

核心习惯:

- 每个 SQE 设置 `user_data`
- CQE 的 `res` 按 syscall 返回值理解
- 完成后必须 `cqe_seen`
- 队列深度要按并发 IO 数设置

---

## 四、常用 opcode

| opcode | 用途 |
| --- | --- |
| `IORING_OP_READ/WRITE` | 文件读写 |
| `IORING_OP_READV/WRITEV` | 分散/聚集 IO |
| `IORING_OP_ACCEPT` | 接收连接 |
| `IORING_OP_CONNECT` | 建连 |
| `IORING_OP_RECV/SEND` | socket 收发 |
| `IORING_OP_TIMEOUT` | 定时器 |
| `IORING_OP_LINK_TIMEOUT` | 给链式操作加超时 |
| `IORING_OP_POLL_ADD` | poll 某 fd |
| `IORING_OP_FSYNC` | 异步 fsync |
| `IORING_OP_CLOSE` | 异步 close |

---

## 五、性能关键特性

### 5.1 批量提交

一次 `io_uring_submit` 提交多个 SQE,减少 syscall。

### 5.2 SQPOLL

`IORING_SETUP_SQPOLL` 开一个内核线程轮询 SQ:

```
用户态写 SQE
不用每次 io_uring_enter
内核线程主动取请求
```

代价:

- 占一个 CPU
- 权限/内核版本要求
- 空闲时也可能耗资源

适合极致低延迟场景。

### 5.3 注册文件和 buffer

```c
io_uring_register_files(...)
io_uring_register_buffers(...)
```

减少每次 fd 引用和页 pin 的开销。

适合:

- 高频固定文件
- 固定内存池
- 存储/网络高性能服务

不适合普通业务一上来就用,复杂度高。

---

## 六、和 epoll 的关系

| | epoll | io_uring |
| --- | --- | --- |
| 模型 | 等就绪 | 提交操作等完成 |
| 网络 IO | 成熟稳定 | 新但越来越成熟 |
| 文件 IO | 不适合普通文件 | 强项 |
| syscall | wait + read/write | 批量 submit/wait |
| 复杂度 | 中 | 高 |
| 内核要求 | 很老也可用 | 建议 5.10+ |

纯网络长连接、业务计算多时,epoll 仍然很好。

文件 + 网络混合、高 QPS 小 IO、需要批处理和取消时,io_uring 更有吸引力。

---

## 七、常见坑

1. **内核版本太低**:早期 io_uring bug 和能力限制较多。
2. **以为所有操作都真异步**:某些路径可能 fallback 到 worker。
3. **buffer 生命周期错误**:提交后到 CQE 返回前,buffer 不能释放。
4. **忘记处理短读短写**:res 可能小于请求长度。
5. **队列深度不够**:SQE 拿不到,吞吐上不去。
6. **安全限制**:历史上 io_uring 出过多次安全问题,有些环境会禁用。

---

## 八、什么时候用

适合:

- 高性能存储
- 代理/网关同时做磁盘缓存
- 日志系统
- C/Rust 网络服务
- 需要大量 timeout/cancel/link 的异步任务

不适合:

- 内核版本不可控
- 团队不熟 C/Rust 底层 IO
- 纯业务 CRUD
- epoll 已经不是瓶颈

> **结论**:io_uring 是 Linux IO 模型的大升级,但不是"替换 epoll"这么简单。它真正强在统一异步操作和批处理,用之前先确认瓶颈确实在 syscall/文件 IO/事件模型。

