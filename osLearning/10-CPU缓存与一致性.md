# CPU 缓存与一致性

多核 CPU 的"暗物质"在这一层——**MESI 协议**让多核共享内存看起来正常,但代价是**性能在某些模式下崩 10 倍**。最有名的就是 **false sharing(伪共享)**:两个线程改不同的变量,但因为变量在同一个 cache line,**性能比串行还慢**。再加上 **NUMA**(多 socket 系统的"内存远近"问题),**高性能并发代码必须按 cache line 来设计数据结构**——这是 Java DisruptorRingBuffer / LMAX / Linux 内核 percpu 变量背后的根本原因。

> 一句话先记住:**多核共享内存的代价是 cache 一致性协议(MESI)**——一个核改了某 cache line,所有核的相应 line 要失效。**false sharing 让"无关变量"变成"竞争变量"** —— 通过 padding 让它们到不同 cache line 就解决了,差距能到 10 倍。**NUMA 系统跨 socket 访问内存延迟翻倍**,所以高性能服务必须 NUMA 亲和。

---

## 一、回顾:cache line 是 64 字节

第 04 篇讲过——**CPU 不是按字节读内存,最小单位是 64 字节(cache line)**。

```
char arr[64];
char x = arr[0];     // 实际把 arr[0..63] 全部加载到 cache line
```

**所有 cache 一致性的故事都建立在这个事实上**。

---

## 二、为什么需要 cache 一致性

### 2.1 多核共享内存的问题

```
Core 0:  改 x = 1 → 写到自己的 L1 cache
Core 1:  读 x → 从自己的 L1 cache 读出旧值 0

如果不解决:Core 1 永远看不到 Core 0 的写入
```

### 2.2 简单方案:写直达(Write-through)

每次写都同步到主存:**正确,但慢得没法用**(每次写都要等几十纳秒)。

### 2.3 工程方案:MESI 协议

让 cache 之间互相协调,**只在必要时同步**。

---

## 三、MESI 协议:cache line 的四种状态

每个 cache line 在每个 core 的 cache 里都有一个状态:

```
M  Modified    我改过,主存里的是旧的,只有我有
E  Exclusive   我有这一份,主存一致,别人没有
S  Shared      多个 core 都有,主存一致
I  Invalid     我的这一份失效了
```

### 3.1 状态转换

```
Core 0 读 x(原本 I)
  → 主存读到 cache,标 E (独占)

Core 1 也读 x
  → Core 0 的 line 从 E 变 S
  → Core 1 的 line 也是 S(共享)

Core 0 写 x
  → Core 1 的 line 失效(I)
  → Core 0 的 line 变 M (我修改了)

Core 1 再读 x
  → 触发 Core 0 把 M 写回主存(或直接转给 Core 1)
  → Core 0 变 S,Core 1 变 S
```

### 3.2 关键观察:写需要"独占"

**任何核要写一个 cache line,必须先让所有其他核的相应 line 变 I**。

- 发出 invalidate 信号到其他所有核
- 等所有核确认
- 然后才能写

**这就是 MESI 的代价** —— 写竞争的 cache line 极慢。

---

## 四、false sharing:伪共享的灾难

### 4.1 经典案例

```c
struct {
    int counter_a;     // Core 0 频繁改
    int counter_b;     // Core 1 频繁改
} stats;
```

**counter_a 和 counter_b 在同一个 cache line(64 字节内)**:

```
Core 0 改 counter_a → invalidate Core 1 的 cache line
Core 1 改 counter_b → invalidate Core 0 的 cache line
Core 0 再改 counter_a → 又 invalidate Core 1
...
```

**这叫 cache line ping-pong** —— 两个核疯狂"打乒乓",每次访问都 cache miss,性能比串行还慢。

### 4.2 数字对比

```
单线程,counter_a 加 1 亿次:        500 ms
两线程,各自加 5000 万次,无 false sharing:  300 ms (理想 2x 加速)
两线程,各自加 5000 万次,有 false sharing:  3000 ms (慢 10 倍!)
```

**false sharing 是最坑的性能 bug**——代码看起来"独立",实际并发竞争。

### 4.3 修复:cache line padding

```c
struct {
    int counter_a;
    char padding[60];        // 填满 64 字节
    int counter_b;
} stats;
```

**或用对齐属性**:

```c
struct {
    alignas(64) int counter_a;
    alignas(64) int counter_b;
} stats;
```

**Java 8+ 的 @Contended**:

```java
@Contended
class Counters {
    long a;
    long b;
}
```

### 4.4 实战:LMAX Disruptor

高性能并发队列,**所有重要变量都 padding 到独占 cache line**:

```java
class RingBuffer {
    long p1, p2, p3, p4, p5, p6, p7;   // padding before
    long head;                          // 真正的字段
    long p9, p10, p11, p12, p13, p14, p15;  // padding after
}
```

**head 独占一个 cache line** → 任何核改 head 不影响其他变量。

---

## 五、内存屏障(Memory Barrier)

### 5.1 现代 CPU 的乱序与缓冲

```
你写的:
  a = 1;
  b = 2;

CPU 实际可能:
  把 a = 1 暂存在 store buffer(还没真写到 cache)
  先执行 b = 2
  之后再 flush store buffer
```

**对其他核来说,可能先看到 b = 2,后看到 a = 1**——顺序乱了。

### 5.2 内存屏障的作用

```c
a = 1;
__sync_synchronize();    // 内存屏障
b = 2;
```

**强制屏障之前的写完成,才能进行屏障之后的写**。其他核看到的顺序就是 a 先 b 后。

### 5.3 用户态怎么用

```
C/C++:    std::atomic + memory_order_*
Java:     volatile / synchronized
Go:       sync/atomic + sync.Mutex
Rust:     std::sync::atomic
```

**这些原语内部都用了内存屏障**——你不用直接写汇编。

详见 15 篇内存屏障与重排序。

---

## 六、原子操作(Atomic)

### 6.1 普通递增不是原子的

```c
counter++;       // 实际上是 load → add → store 三步
```

多核同时做,**结果可能丢更新**。

### 6.2 原子操作

```c
__atomic_fetch_add(&counter, 1, __ATOMIC_SEQ_CST);
```

**底层用 LOCK 前缀**(x86)或 LL/SC 指令对(ARM):

```assembly
lock add [counter], 1     ; 锁总线 / cache line,保证原子
```

**代价**:

- LOCK 指令比普通指令慢 10-100 倍
- 触发完整的 MESI 协议(invalidate 所有其他核的 cache line)

**这就是为什么"无锁但用 atomic"也不一定快**——atomic 不是免费的。

详见 14 篇锁与原子操作。

---

## 七、NUMA:跨 socket 的内存代价

### 7.1 NUMA 是什么

NUMA = Non-Uniform Memory Access。

**多 socket 服务器**:

```
Socket 0:  CPU 0-15 + 64 GB 本地内存
Socket 1:  CPU 16-31 + 64 GB 本地内存
两个 socket 之间通过 QPI / UPI 互联

CPU 0 访问本地内存:    ~100 ns
CPU 0 访问 Socket 1 的内存:  ~200 ns(慢 1 倍)
```

### 7.2 NUMA 不绑定的灾难

```
进程在 CPU 0(Socket 0)启动,malloc 分到 Socket 0 内存
调度器把进程切到 CPU 16(Socket 1)
→ 进程的所有内存访问变成跨 socket
→ 性能降一半
```

### 7.3 NUMA 亲和

```bash
numactl --hardware
# available: 2 nodes (0-1)
# node 0 cpus: 0 1 2 ... 15
# node 0 size: 64000 MB
# node 1 cpus: 16 17 ... 31
# node 1 size: 64000 MB

numactl --cpunodebind=0 --membind=0 ./app   # 绑 node 0
```

**生产推荐**:

- 数据库 / Redis / 高性能服务**绑死 NUMA node**
- 多实例部署时按 NUMA 切分(每实例一个 node)

### 7.4 看 NUMA 失衡

```bash
numastat
#                    node0           node1
# numa_hit          1234567890       234567890
# numa_miss            234567        12345678  ← 这个高 = 跨 node 多
# numa_foreign         234567        12345678
```

`numa_miss` / `numa_foreign` 高 → 调度 / 内存分配跨 node,要绑亲和。

---

## 八、cache 友好的数据结构

### 8.1 数组 vs 链表

```
数组:     连续内存,顺序访问 cache 命中率高
链表:     节点散落,每个节点 cache miss

10 万元素求和:
  数组:    1 ms
  链表:    10-50 ms (慢 10-50 倍!)
```

**这就是为什么数据库 / 高性能容器都用数组而不是链表**。

### 8.2 AoS vs SoA(再讲一次,因为重要)

```c
// 不友好:Array of Struct
struct Person { char name[32]; int age; };
Person people[1000];
// 访问 ages 时把 names 也加载到 cache,浪费

// 友好:Struct of Array
struct {
    char names[1000][32];
    int ages[1000];
} people;
// 只加载 ages,cache 利用率高
```

### 8.3 哈希表的设计

```
开链法(separate chaining):
  每个桶是链表 → cache 不友好
  
开放地址法(open addressing):
  桶就是数组 → cache 友好
  Robin Hood / Cuckoo / Hopscotch 等现代变种
```

**Go 的 map 是 open addressing + 局部 chain**,**Java HashMap 是纯 chain(性能稍差)**。

---

## 九、Linux percpu 变量

内核里的高级技巧——**给每个 CPU 一份独立的变量**:

```c
DEFINE_PER_CPU(int, my_counter);

// CPU N 自己访问自己的副本,完全无锁
this_cpu_add(my_counter, 1);
```

**用途**:

- 内核统计计数器(网络包数、syscall 数)
- 不需要严格同步,只需各 CPU 独立
- 累加时偶尔合并各 CPU 的副本

**避免了 cache 一致性的代价**——每个 CPU 都用自己 cache line 上的版本。

---

## 十、看 cache 性能:perf

```bash
perf stat -e cache-references,cache-misses,L1-dcache-loads,L1-dcache-load-misses ./your_program

# 关注:
#   cache-misses / cache-references = miss rate
#   L1 miss rate < 5% 算 OK,> 10% 性能堪忧
```

更细:

```bash
perf c2c record ./your_program     # cache-to-cache,定位 false sharing
perf c2c report
```

**perf c2c** 直接告诉你哪行代码触发了 cache line ping-pong——**调优 false sharing 的神器**。

---

## 十一、ARM vs x86 的 cache 差异

ARM 的内存模型比 x86 弱:

```
x86:  TSO (Total Store Order),写之间不会重排
ARM:  弱内存模型,写之间可能重排,需要更多内存屏障
```

**意味着**:

- x86 上"看似正确"的并发代码,在 ARM 上可能 bug
- 跨平台并发代码必须用 std::atomic 等显式同步原语

---

## 十二、Hyper-Threading 的 cache 影响

超线程:**两个逻辑 CPU 共享一个物理核的 L1/L2 cache**。

```
两个线程在同一个物理核(超线程):
  共享 L1/L2 cache → 互相 evict → cache 命中率下降
  
两个线程在不同物理核:
  各自独立的 L1/L2 → 互不影响
```

**HPC / 数据库场景关掉超线程**——单线程拿到完整 cache,反而快。

---

## 十三、综合实战:高性能计数器

需求:**百万 QPS 的 counter,统计请求数**。

### 13.1 朴素:加锁

```c
mutex_lock();
counter++;
mutex_unlock();
```

**慢**:锁竞争 + cache ping-pong,百万 QPS 下 CPU 100% 还跑不动。

### 13.2 atomic 计数器

```c
__atomic_fetch_add(&counter, 1, __ATOMIC_RELAXED);
```

**还慢**:LOCK 指令 + cache 失效。

### 13.3 percpu 计数器

```c
__thread int local_counter;        // 每线程独立
local_counter++;                    // 完全无锁

// 周期性合并
total = sum(local_counter for each thread);
```

**快**:无锁,无 cache 竞争。**代价**:总数有延迟(不是实时精确)。

### 13.4 实战选择

- **要精确实时**:atomic
- **能容忍延迟**:percpu(快百倍)

---

## 十四、踩坑提醒

1. **不知道 cache line 64 字节** —— false sharing 神坑
2. **多线程改同一结构体不同字段** —— false sharing
3. **链表代替数组** —— cache miss 多 10 倍
4. **AoS 用法读单字段** —— cache 利用率低
5. **不绑 NUMA** —— 跨 socket 内存访问慢一倍
6. **atomic 当免费用** —— 仍有 LOCK 开销 + cache 失效
7. **以为 ARM 和 x86 内存模型一样** —— ARM 弱很多
8. **超线程总开** —— HPC / 数据库可能关掉更快
9. **percpu 没合并** —— 总数永远不对
10. **不用 perf c2c** —— false sharing 永远查不到
11. **乱用 padding** —— 大量 padding 内存浪费
12. **以为编译器优化能搞定一切** —— 它不能跨核优化

---

## 第二层小结

06-10 这五篇是**OS 内存系统的全图**:

- 06 虚拟内存:每个进程的"假地址空间"
- 07 进程内存布局:那张地图长什么样
- 08 内存分配:malloc 内部 + glibc / jemalloc
- 09 内核内存:slab + buddy + page cache
- 10 cache 一致性:多核共享的代价

**看完应该能讲清楚:**

- 为什么 RSS 不等于真实占用
- 为什么 jemalloc 比 glibc 快
- 为什么 buff/cache 不是真用了内存
- 为什么 false sharing 让性能崩 10 倍
- 为什么数据库要绑 NUMA

---

下一篇:`11-进程.md`,进入第三层"进程线程与并发"。讲 Linux 进程的本质——**进程 = task_struct + 资源**、`fork` 的 COW 魔法、`exec` 怎么换皮、**进程状态机**(R / S / D / Z / T)、**僵尸进程**为什么是 bug、**孤儿进程**为什么 init 收养,以及为什么 Linux 上"进程和线程其实是一回事"。
