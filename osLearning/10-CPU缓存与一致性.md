# CPU 缓存与一致性

有一类性能 bug 专治各种不服:代码评审挑不出毛病、profiler 里没有热点函数、锁也没竞争,但程序就是慢——你把任务拆给两个线程,结果**比单线程还慢好几倍**。凶手往往藏在比代码低一层的地方:**多核 CPU 为了让"共享内存"这个幻觉成立,缓存之间在背后疯狂通信,而某些数据布局会把这个通信量推到爆炸**。最有名的名场面叫 false sharing(伪共享):两个线程改的是两个毫不相干的变量,只因它们挤在同一个 cache line 里,性能直接腰斩再腰斩。这一篇讲清楚这层"暗物质":MESI、false sharing、NUMA,以及为什么高性能代码必须按 64 字节设计数据结构。

> 一句话先记住:**多核共享内存是靠 MESI 协议维持的幻觉——任何一个核要写某个 cache line,必须先把所有其他核手里的同款 line 作废**。推论一:**两个核反复写同一个 line = cache line 在核间打乒乓,性能崩 10 倍**,哪怕它们写的是不同变量(false sharing)。推论二:**真正快的并发设计不是"锁得更聪明",而是让每个核只碰自己的数据**(percpu / padding / NUMA 亲和)。

---

## 一、地基:CPU 按 64 字节为单位搬内存

第 04 篇讲过,这里必须再敲一遍,因为本篇所有故事都建立在它上面:**CPU 不按字节读内存,缓存的最小单位是 64 字节,叫 cache line**。

```c
char arr[64];
char x = arr[0];   // 实际把 arr[0..63] 整条搬进了 cache
```

你以为你在操作一个 int,硬件眼里你动的是一整条 64 字节的线。**变量不是孤立的,它和"同一条线上的邻居"绑在一条船上**——记住这个画面。

---

## 二、为什么需要一致性协议

每个核有自己的 L1/L2 缓存。没有协调机制的话:

```
Core 0:x = 1  → 写进自己的 L1
Core 1:读 x  → 从自己的 L1 读出旧值 0,而且永远是 0
```

多线程程序直接没法写了。最朴素的修法是写直达(write-through)——每次写都同步穿透到主存——正确,但每次写都要等几十纳秒,**慢到等于没有缓存**。

工程上的答案是让缓存之间互相通气,只在必要时同步:**MESI 协议**。

---

## 三、MESI:每条 cache line 的四种身份

每个核的缓存里,每条 line 都挂着一个状态:

```
M  Modified    我改过了,主存是旧的,全世界只有我这份是对的
E  Exclusive   只有我缓存了它,而且和主存一致
S  Shared      好几个核都缓存着,大家和主存都一致
I  Invalid     我这份作废了,不许用
```

跟一遍状态流转,感受一下两个核抢一个变量时背后发生的事:

```
Core 0 读 x        → 从主存加载,标 E(独占)
Core 1 也读 x      → 两边都变 S(共享,各拿一份)
Core 0 写 x        → 向所有核广播 invalidate!
                     Core 1 的 line 变 I,Core 0 的变 M
Core 1 再读 x      → 发现自己是 I,要 Core 0 把 M 的数据交出来
                     两边回到 S
Core 1 接着写 x    → 再来一轮 invalidate,Core 0 变 I……
```

看出关键了吗:**写需要独占——动笔之前必须先把所有其他核手里的同款 line 作废,还要等它们确认**。读共享便宜,**写共享的 line 极贵**。一旦两个核交替写同一条 line,它就在两个核的缓存之间来回搬家,每次访问都是 miss——这就是 **cache line ping-pong(乒乓)**。

---

## 四、false sharing:最冤的性能 bug

### 4.1 案发现场

```c
struct {
    int counter_a;     // 线程 0(Core 0)疯狂自增
    int counter_b;     // 线程 1(Core 1)疯狂自增
} stats;
```

代码层面零共享:两个线程各改各的变量,没锁没竞争,教科书式的并行。但 `counter_a` 和 `counter_b` 加起来才 8 字节,**必然挤在同一条 64 字节的 cache line 里**。于是硬件眼里:

```
Core 0 写 counter_a → 作废 Core 1 的整条 line
Core 1 写 counter_b → 作废 Core 0 的整条 line
Core 0 再写         → 又作废回去……乒乓开始
```

**变量无关,line 共享——所以叫"伪"共享**。实测量级:

```
单线程把一个计数器加 1 亿次:                500 ms
双线程各加 5000 万,无 false sharing:        300 ms(正常,接近 2x)
双线程各加 5000 万,有 false sharing:       3000 ms(比单线程慢 6 倍!)
```

最要命的是它的隐蔽性:**逻辑全对、profiler 没热点、锁分析没竞争**——不知道 cache line 这回事的人,可以被它折磨到怀疑人生。

### 4.2 修法:把它们拆到不同的 line

思路只有一个:padding(填充),让热点变量各自独占一条 line。

```c
// 手工填充
struct {
    int counter_a;
    char pad[60];          // 把这条 line 填满
    int counter_b;
} stats;

// 或者用对齐属性(更干净)
struct {
    alignas(64) int counter_a;
    alignas(64) int counter_b;
} stats;
```

Java 8+ 有官方注解 `@Contended`(JVM 自动填充);更早的高性能库直接手搓——**LMAX Disruptor** 的著名写法:

```java
class RingBuffer {
    long p1, p2, p3, p4, p5, p6, p7;        // 前置 padding
    long head;                               // 真正的热点字段
    long p9, p10, p11, p12, p13, p14, p15;  // 后置 padding
}
```

7 + 1 + 7 个 long,保证 `head` 无论怎么布局都独占一条 line。看起来很蠢,**就是这几行"垃圾字段"撑起了百万级 TPS 的无锁队列**。代价当然有:padding 纯浪费内存——只给真正的多核写热点用,别见字段就填。

### 4.3 抓现行:perf c2c

```bash
perf c2c record ./your_program
perf c2c report
```

`perf c2c`(cache-to-cache)直接列出哪些地址、哪几行代码在核间打乒乓——**查 false sharing 的专用神器**。粗粒度的健康检查用 `perf stat`:

```bash
perf stat -e cache-references,cache-misses,L1-dcache-loads,L1-dcache-load-misses ./prog
# L1 miss rate < 5% 算健康,> 10% 该查了
```

---

## 五、同一套代价的另外两张脸:atomic 和内存屏障

### 5.1 atomic 不是免费的

`counter++` 不是一条指令,是 load → add → store 三步,多核同时做会丢更新。原子操作修正确性:

```c
__atomic_fetch_add(&counter, 1, __ATOMIC_SEQ_CST);
// x86 底层:lock add [counter], 1   (ARM 用 LL/SC 指令对)
```

但看清代价:**LOCK 前缀比普通指令慢 10-100 倍,而且每次都走完整的 MESI 独占流程**——把所有其他核的 line 作废一遍。多核高频 atomic 同一个变量,本质上还是在打乒乓。**"无锁"不等于"无代价",atomic 只是把锁缩小到了一条 cache line**。详见 14 篇。

### 5.2 写的顺序也是幻觉:内存屏障

还有一层暗坑:CPU 有 store buffer,写操作先攒着不立刻进缓存,还可能乱序:

```
你写的:a = 1;  b = 2;
其他核可能先看到 b = 2,后看到 a = 1
```

需要顺序保证时插**内存屏障(memory barrier)**:

```c
a = 1;
__sync_synchronize();   // 屏障之前的写全部生效,才许执行之后的
b = 2;
```

日常你不直接写屏障——**各语言的同步原语内部都帮你插好了**:C++ 的 `std::atomic` + memory_order、Java 的 `volatile` / `synchronized`、Go 的 `sync/atomic`、Rust 的 `std::sync::atomic`。另一个雷:**ARM 的内存模型比 x86 弱得多**(x86 是 TSO,写写不重排;ARM 几乎什么都敢排)——x86 上"碰巧能跑"的裸并发代码,搬到 ARM 服务器或 Apple Silicon 上就翻车,**跨平台并发必须用显式原子原语**。这一整层详见 15 篇。

---

## 六、NUMA:内存还分"本地"和"长途"

多 socket 服务器把代价又抬高一档。NUMA(Non-Uniform Memory Access):

```
Socket 0:CPU 0-15  + 64GB 本地内存 ┐
                                    ├─ QPI/UPI 互联
Socket 1:CPU 16-31 + 64GB 本地内存 ┘

CPU 0 访问本地内存:    ~100 ns
CPU 0 访问 Socket 1 的内存:~200 ns(翻倍)
```

经典事故剧本:进程在 Socket 0 上启动,malloc 的内存都分在 node 0(内核默认就近分配);跑着跑着调度器把它迁到了 Socket 1 的核上——**从此每次内存访问都是长途,整体性能掉一半,而且任何工具里都看不到"错误"**。

对策是绑亲和:

```bash
numactl --hardware                            # 看拓扑
numactl --cpunodebind=0 --membind=0 ./app     # CPU 和内存都绑死 node 0
numastat                                      # numa_miss / numa_foreign 高 = 跨 node 严重
```

**生产惯例**:数据库 / Redis / 高性能网关绑死 NUMA node;多实例部署按 node 切分,一实例一个 node,各吃各的本地内存。

顺带一个亲戚问题——**超线程(Hyper-Threading)**:两个逻辑 CPU 共享同一个物理核的 L1/L2,互相挤兑对方的缓存。HPC 和数据库场景常见操作是干脆关掉超线程,让单线程独享完整缓存,反而更快。

---

## 七、cache 友好的数据结构:同样的算法,差 10 倍

一致性讲的是"多核别打架",还有一半的功课是"单核别浪费"——让加载进来的每条 64 字节都物尽其用。

**数组 vs 链表**:

```
数组:元素连续,CPU 预取器顺着猜,几乎全命中
链表:节点散落堆上,每跳一个 next 就是一次 cache miss

10 万元素求和:数组 1 ms,链表 10-50 ms
```

**同样是 O(n),差 10-50 倍**——这就是为什么现代高性能容器和数据库内部几乎全是数组结构,链表只活在教科书里。

**AoS vs SoA**(结构体数组 vs 数组结构体):

```c
// AoS:遍历 age 时,每 64 字节里只有 4 字节有用,其余是无辜的 name
struct Person { char name[32]; int age; };
Person people[1000];

// SoA:ages 紧密排列,一条 line 装 16 个,利用率 100%
struct {
    char names[1000][32];
    int  ages[1000];
} people;
```

**哈希表**也是同一道理:开链法(每桶一条链表)cache 不友好;开放地址法(桶就是数组,Robin Hood / Cuckoo 等变种)对 cache 好得多。Go 的 map 用开放地址 + 局部链,Java 的 HashMap 是纯链表桶——纯查找性能上前者占优,原因就在 cache。

---

## 八、终极思路:干脆别共享——percpu

把本篇的教训推到头,就是 Linux 内核自己的打法:**每个 CPU 一份独立副本,谁也别碰谁的**。

```c
DEFINE_PER_CPU(int, my_counter);
this_cpu_add(my_counter, 1);    // 改自己核的副本,无锁,无一致性流量
// 要总数时,把各 CPU 的副本加一遍
```

内核的网络包计数、syscall 统计全是这么干的。用户态的等价物是 `__thread`(线程局部存储)。

拿一个真实需求收尾——**百万 QPS 的请求计数器**,三种写法对比:

| 方案 | 写法 | 表现 |
| --- | --- | --- |
| 加锁 | `mutex_lock(); counter++; unlock();` | 锁竞争 + 乒乓,百万 QPS 下 CPU 打满还不够用 |
| atomic | `__atomic_fetch_add(&counter, 1, __ATOMIC_RELAXED);` | 正确,但 LOCK + MESI 独占,所有核挤一条 line,还是乒乓 |
| percpu | `__thread long local; local++;` 定期汇总 | **无锁无一致性流量,快上百倍**;代价是总数有几毫秒延迟 |

选择标准就一条:**要实时精确用 atomic,能容忍统计延迟就 percpu**。监控计数这类场景,percpu 永远是答案。

---

## 九、第二层收官:内存五篇的全图

06-10 拼起来,就是"为什么我的程序占这么多内存 / 为什么忽快忽慢"的完整答案:

```
06 虚拟内存:    地址是假的,页表 + TLB + 缺页撑起全部幻觉
07 内存布局:    地址空间的地图,-Xmx 之外还住着一堆人
08 内存分配:    malloc 是中间商,free 不退货,碎片是顽疾
09 内核内存:    buddy + slab 管内核自己,buff/cache 是缓存不是占用
10 缓存一致性:  多核共享内存的真实代价,64 字节是设计单位
```

自测一下,这五个问题现在应该都能一句话答出来:为什么 RSS ≠ 真实占用(看 PSS);为什么 jemalloc 比 glibc 快(per-thread cache 免锁);为什么 buff/cache 不算被吃(随叫随让);为什么 false sharing 崩 10 倍(cache line 乒乓);为什么数据库要绑 NUMA(跨 node 延迟翻倍)。

---

## 踩坑提醒

1. **不知道 cache line 是 64 字节**——本篇所有坑的总根源,变量和邻居是绑在一起的
2. **多线程高频写同一结构体的不同字段**——false sharing 教科书现场,热点字段 padding 到独立 line
3. **用链表该用数组的场景**——同样 O(n) 慢 10-50 倍,cache miss 杀人不见血
4. **AoS 布局只读单个字段**——每条 line 里大部分字节白搬,热路径改 SoA
5. **多 socket 机器不绑 NUMA**——进程被调度迁走后所有内存访问变长途,性能腰斩还查不出错
6. **把 atomic 当免费午餐**——LOCK 慢 10-100 倍且照样打乒乓,高频计数用 percpu / __thread
7. **以为 x86 上能跑 = 并发正确**——ARM 内存模型弱得多,跨平台必须用显式原子原语
8. **超线程无脑全开**——共享 L1/L2 互相挤兑,HPC / 数据库可能关掉更快
9. **percpu 副本忘了汇总**——每个核的局部数永远对,总数永远错
10. **怀疑 false sharing 却不用 perf c2c**——靠读代码找伪共享基本是大海捞针
11. **见字段就 padding**——padding 是纯内存浪费,只伺候真正的多核写热点
12. **指望编译器救场**——编译器看不见"另一个核在干什么",数据布局是你的责任

---

下一篇:`11-进程.md`,进入第三层"进程线程与并发"。讲 Linux 进程的本质——内核里的一个 task_struct、fork 怎么靠 COW 做到几毫秒"复制"整个进程、exec 怎么"换皮"、进程状态机里 R / S / D / Z / T 各是什么(为什么 D 状态 kill -9 都杀不死、僵尸进程为什么是父进程的 bug),以及为什么说 Linux 上"线程只是共享了资源的进程"。
