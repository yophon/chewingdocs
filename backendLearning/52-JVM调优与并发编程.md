# JVM 调优与并发编程

51 章把"代码怎么组织"讲透,这一章往下挖一层:**代码跑起来之后,JVM 在做什么**。

Spring Boot 占了 6 章,但 JVM 本身一章没有——这是 Java 后端的最大遗漏。只懂业务不懂 JVM,**线上 OOM、Full GC、CPU 100%、线程死锁**全都束手无策。这一章把 JVM 内功、GC 调优、并发编程一次讲完。

---

## 一、JVM 内存模型(Java 21+)

```
┌──────────────────────────────────────────────────────┐
│                       JVM Process                    │
│ ┌──────────────────────────────────────────────────┐ │
│ │              Heap(堆,GC 主战场)                  │ │
│ │  ┌─────────────────┐  ┌────────────────────────┐ │ │
│ │  │   Young Gen     │  │       Old Gen          │ │ │
│ │  │ Eden + S0 + S1  │  │    长期存活对象         │ │ │
│ │  └─────────────────┘  └────────────────────────┘ │ │
│ └──────────────────────────────────────────────────┘ │
│ ┌────────────┐ ┌──────────────┐ ┌──────────────────┐ │
│ │ Metaspace  │ │ Code Cache   │ │ Direct Memory    │ │
│ │ (类元数据) │ │ (JIT 后机器码) │ │ (Netty/NIO/堆外) │ │
│ └────────────┘ └──────────────┘ └──────────────────┘ │
│ ┌────────────────────────────────────────────────┐   │
│ │  线程栈 × N(每个线程一份,默认 1MB/线程)        │   │
│ └────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

| 区域 | 存什么 | 出问题表现 |
| --- | --- | --- |
| **Heap Young** | 短命对象 | YGC 频繁 |
| **Heap Old** | 老对象 | Full GC、`OutOfMemoryError: Java heap space` |
| **Metaspace** | 类元数据 | `Metaspace OOM`(频繁热部署) |
| **Code Cache** | JIT 编译产物 | "code cache is full" 性能突降 |
| **Direct Memory** | NIO 堆外缓冲 | `OutOfMemoryError: Direct buffer memory` |
| **Stack** | 方法栈帧 | `StackOverflowError`(深递归) |

> 经验法则:**容器里设堆要给堆外留余量**——`-Xmx4g` 不代表 JVM 只用 4G。Metaspace + 直接内存 + 线程栈 + JIT 还要加 1~2G。容器 limit 设成 `-Xmx + 25%` 起步,否则容器 OOM Killer 直接秒杀进程,日志都没。

---

## 二、对象生命周期与代际假说

Hotspot GC 设计的根基是**弱代际假说**:**绝大多数对象朝生夕死,少数活很久**。

```
new Object() →  Eden ─[YGC 存活]→  Survivor  ─[多次存活]→  Old
                  │
                  └─[YGC 直接回收]
```

- 小对象先进 Eden
- Eden 满 → YGC,存活的进 Survivor;**Survivor 反复倒,年龄达到 15 进 Old**
- Old 满 → Full GC(慢、停顿大)

> 经验法则:**Full GC 的根因 90% 是"短命对象进了 Old"**——比如缓存设错策略、批处理一次加载几十万条、@Async 队列堆积。线上看到 Full GC 频繁,先查"哪些对象本不该长期存活却进了 Old"。

---

## 三、GC 算法演进:G1 vs ZGC vs Shenandoah

| GC | 出现 | 暂停 | 适合 |
| --- | --- | --- | --- |
| **Serial** | 远古 | 数秒 | 客户端、玩具 |
| **Parallel(PS)** | JDK 5 | 百毫秒~秒 | 批处理 |
| **CMS** | JDK 5 | 几十~百毫秒 | 已废弃,JDK 14 移除 |
| **G1** | JDK 7+ | 50~200ms | **默认推荐**(JDK 9 起为 Server 默认) |
| **ZGC** | JDK 11+,21 GA | **<1ms** | 大堆(几十~几百 GB)、低延迟 |
| **Shenandoah** | JDK 12+ | <10ms | RedHat 系发行版,大堆 |

### G1 心智模型

把堆切成约 2048 个 Region,每个 1~32MB。Young/Old 不再是连续区,而是 Region 集合。

```
[E][E][O][S][O][E][O][O][O][E][O][H][H]    H = Humongous(大对象)
```

GC 时挑"垃圾最多的 Region"先回收(Garbage First)——所以叫 G1。

```bash
# 推荐起手参数(JDK 17+)
-XX:+UseG1GC
-XX:MaxGCPauseMillis=200          # 期望最大停顿
-XX:G1HeapRegionSize=4M           # Region 大小,堆 4G 起一般 4M
-XX:InitiatingHeapOccupancyPercent=45   # 老年代占用率到 45% 开始并发标记
```

### ZGC 的"亚毫秒级停顿"怎么做到

ZGC 用**染色指针 + 读屏障 + 转移并发**,把绝大部分工作放进**应用线程并发执行**。代价是**吞吐稍低、CPU 占用高**——拿 CPU 换延迟。

```bash
# 大堆 + 低延迟
-XX:+UseZGC
-Xmx32g
-XX:+ZGenerational         # JDK 21 起的分代 ZGC,显著降低开销
```

> 经验法则:
>
> - 4~16G 堆、普通 Web 业务:**G1**(默认就好)
> - >32G 堆、对延迟敏感(API 网关、交易):**ZGC**
> - **永远别用 ParallelGC + 大堆**,长 STW 一秒起步

---

## 四、看 GC 日志和定位问题

打日志是底线:

```bash
-Xlog:gc*=info,gc+heap=debug,gc+age=trace:file=/log/gc.log:time,uptime,level,tags:filecount=10,filesize=50M
```

观察工具:

| 工具 | 用途 |
| --- | --- |
| **GCEasy / GCViewer** | 上传日志,出可视化报告 |
| **JFR(Java Flight Recorder)** | JDK 自带,生产可开,几乎零开销 |
| **Async-Profiler** | 火焰图,找 CPU/分配热点 |
| **jstat -gcutil <pid> 1s** | 实时看各代占用 |
| **Arthas** | 阿里开源,在线诊断神器 |

**三类典型 GC 病**:

| 表现 | 病因 | 处方 |
| --- | --- | --- |
| YGC 频繁、停顿短 | Eden 太小、对象分配速率高 | 加堆 / 优化分配热点 |
| Old 持续涨、Full GC 频繁 | 内存泄漏 / 缓存不限制 | 拿 heap dump 找根 |
| 单次 STW 很长 | 大对象、并发标记失败 | 调 G1 区域大小、降 IHOP |

### 拿 heap dump

```bash
# 进程在跑,主动拿
jcmd <pid> GC.heap_dump /tmp/heap.hprof

# 出 OOM 时自动 dump
-XX:+HeapDumpOnOutOfMemoryError
-XX:HeapDumpPath=/data/dumps/
```

dump 文件用 **MAT(Eclipse Memory Analyzer)** / **JProfiler** 打开,看"Dominator Tree"和"Leak Suspects",几分钟就能定位泄漏对象。

---

## 五、容器里的 JVM:别让默认设置坑你

容器里跑 JVM 有三个常见坑:

### 1. 内存边界

JDK 8u191+ / JDK 10+ 已经能识别 cgroup,**别再用 `-Xmx2g` 写死**——用比例:

```bash
-XX:+UseContainerSupport            # 默认开
-XX:MaxRAMPercentage=75.0           # 容器内存的 75% 给堆
-XX:InitialRAMPercentage=75.0
-XX:MinRAMPercentage=75.0
```

### 2. CPU 边界

`Runtime.availableProcessors()` 在容器里默认能拿到 CPU limit,但**很多框架的"线程池大小 = CPU × N"**——要确认你的容器至少给了 1 整核,**不要 0.5 核**(只有奇怪的舍入行为)。

### 3. 时区

```
ENV TZ=Asia/Shanghai
ENV JAVA_TOOL_OPTIONS="-Duser.timezone=Asia/Shanghai"
```

---

## 六、并发基石:Java 内存模型(JMM)

JMM 解决的是:**多线程下,一个线程的写,另一个线程什么时候看得到**。

三个核心概念:

| 概念 | 含义 |
| --- | --- |
| **可见性** | 线程 A 改了变量,B 能不能看到 |
| **原子性** | 操作是否能被中断打断 |
| **有序性** | 编译器/CPU 可能重排序,你看到的执行顺序未必是写的顺序 |

经典坑:**双重检查单例**没加 `volatile`:

```java
class Singleton {
    private static Singleton inst;     // ❌ 没 volatile,线程 B 可能拿到半构造对象
    public static Singleton get() {
        if (inst == null) {
            synchronized (Singleton.class) {
                if (inst == null) inst = new Singleton();
            }
        }
        return inst;
    }
}
```

`new Singleton()` 在字节码里是三步:**分配内存 → 初始化 → 赋引用**,如果重排序成 1→3→2,B 线程看到 inst 不为 null 但实际还没初始化完。**`volatile` 加上**禁止重排序,问题消失。

> 经验法则:**volatile 保证可见性 + 禁重排序,但不保证复合操作原子性**。`count++` 加 volatile 仍然不安全——要么 synchronized 要么 AtomicXxx。

---

## 七、synchronized vs ReentrantLock

```java
// synchronized:简单
synchronized (lock) { ... }

// ReentrantLock:灵活
lock.lock();
try { ... } finally { lock.unlock(); }
```

| 维度 | synchronized | ReentrantLock |
| --- | --- | --- |
| 公平 | 非公平 | 可选公平/非公平 |
| 可中断 | 不可 | `lockInterruptibly()` |
| 可超时 | 不可 | `tryLock(timeout)` |
| 条件队列 | wait/notify(单条件) | `Condition` 多条件 |
| 写法 | 块/方法 | 显式 lock/unlock |
| 性能 | JDK 6+ 偏向锁/轻量级锁优化后,大多数场景持平 | 复杂场景胜出 |

> 经验法则:**默认用 synchronized**(简单不忘解锁),**只有需要可中断、超时、多条件队列时才上 ReentrantLock**。读多写少用 `ReadWriteLock` / `StampedLock`。

---

## 八、线程池:配置错就是慢性死亡

`Executors.newFixedThreadPool` / `newCachedThreadPool` **生产禁用**——前者用 `LinkedBlockingQueue`(无界,堆积 OOM),后者无线程数上限(创无数线程,直接挂)。

**自己 new ThreadPoolExecutor**:

```java
ThreadPoolExecutor pool = new ThreadPoolExecutor(
    8,                                                 // corePool
    32,                                                // maxPool
    60, TimeUnit.SECONDS,                              // 空闲存活
    new LinkedBlockingQueue<>(2000),                   // 有界队列
    new ThreadFactoryBuilder().setNameFormat("biz-%d").build(),  // 命名,日志才能看
    new ThreadPoolExecutor.CallerRunsPolicy()          // 拒绝策略
);
```

### 队列、拒绝策略选择

```
任务到来
  ├─ 当前线程数 < core → 起新线程
  ├─ 队列没满 → 入队
  ├─ 队列满 + 线程数 < max → 起新线程
  └─ 都满了 → 走拒绝策略
```

| 拒绝策略 | 行为 | 适用 |
| --- | --- | --- |
| `AbortPolicy`(默认) | 抛 RejectedExecutionException | 调用方必须感知 |
| `CallerRunsPolicy` | 调用者自己跑 | **削峰填谷,推荐** |
| `DiscardPolicy` | 丢弃,无声 | ⚠️ 默默丢,慎用 |
| `DiscardOldestPolicy` | 丢队列最老的 | 日志/统计这类可以 |

### 池子大小怎么算

| 任务类型 | 推荐线程数 |
| --- | --- |
| **CPU 密集** | `CPU 核心数` 或 `+1` |
| **IO 密集**(DB / RPC) | `CPU × (1 + 等待时间/计算时间)`,实践常 `CPU × 4~16` |
| **混合** | 拆两个池,各自隔离 |

> 经验法则:**所有 @Async 必须显式指定线程池**,Spring 默认 `SimpleAsyncTaskExecutor`**不是池**——每来一次新建一个线程,流量稍大就把进程压垮。

---

## 九、CompletableFuture:Java 的异步编排

```java
CompletableFuture<Order> future = CompletableFuture
    .supplyAsync(() -> userService.findById(uid), ioPool)
    .thenCombine(
        CompletableFuture.supplyAsync(() -> productService.find(pid), ioPool),
        (user, product) -> orderService.build(user, product)
    )
    .exceptionally(ex -> { log.error("失败", ex); return Order.empty(); })
    .orTimeout(3, TimeUnit.SECONDS);

Order order = future.join();
```

要点:

- `supplyAsync` **必须显式传线程池**——默认 `ForkJoinPool.commonPool()`,跟其他业务共享会死锁
- `thenApply` / `thenApplyAsync`:前者跟前一步同线程,后者切线程池;**默认用 Async 版**避免栈过深
- `allOf` / `anyOf`:聚合多个,`allOf` 等全到、`anyOf` 任一到即返
- `orTimeout`(JDK 9+)防止永远卡死
- **避免 .get() 不带超时**——线上随便一卡就线程被吃满

```java
// 多个并发查询,等所有
var f1 = CompletableFuture.supplyAsync(() -> s1.find(id), ioPool);
var f2 = CompletableFuture.supplyAsync(() -> s2.find(id), ioPool);
var f3 = CompletableFuture.supplyAsync(() -> s3.find(id), ioPool);
CompletableFuture.allOf(f1, f2, f3).join();
return new Result(f1.join(), f2.join(), f3.join());
```

---

## 十、虚拟线程(Java 21+):Project Loom 的真神器

Java 21 GA 的 **Virtual Thread** 是后端这五年最大的变化。

```
传统平台线程:        虚拟线程:
1 个 Java 线程       N 个 Java 线程
= 1 个 OS 线程        = 1 个载体线程(可复用)
= 1MB 栈              = 几 KB 栈

只能起几千个         能起几百万个
```

```java
// 老写法:线程池
var executor = Executors.newFixedThreadPool(200);

// 新写法(Java 21):虚拟线程
var executor = Executors.newVirtualThreadPerTaskExecutor();

executor.submit(() -> {
    // 写"同步阻塞"的代码,JVM 自动让出载体线程
    var user = httpClient.get(url);            // 阻塞? 虚拟线程挂起,载体线程去跑别的
    var order = db.query(user.id);
    return order;
});
```

**为什么这是革命**:

- 同步阻塞代码 = 异步代码的吞吐(IO 等待时让出载体线程)
- 不再需要 CompletableFuture / Reactor 那套链式 API
- "一个请求一个线程"模型可以无脑用了

### 但虚拟线程不是银弹

| 场景 | 适合虚拟线程? |
| --- | --- |
| HTTP 请求处理 | ✅ 完美 |
| DB / RPC 调用 | ✅ 等待时让出载体 |
| **CPU 密集计算** | ❌ 跟普通线程没区别 |
| **synchronized 长占用** | ⚠️ Pinning,载体线程被钉住——改用 ReentrantLock |
| 用 ThreadLocal 存连接 | ⚠️ 每个虚拟线程独立 ThreadLocal,可能爆炸 |

> 经验法则:**Spring Boot 3.2+ 一行配置开虚拟线程**:`spring.threads.virtual.enabled=true`,Tomcat 工作线程立即变虚拟线程。然后**审查所有 synchronized 块,长占用的换成 ReentrantLock**。

---

## 十一、并发工具箱

| 工具 | 用途 |
| --- | --- |
| `AtomicInteger` / `LongAdder` | 高并发计数;**LongAdder 在写多场景比 AtomicLong 快几倍** |
| `ConcurrentHashMap` | 并发 Map,**不要用 HashMap + synchronized** |
| `CopyOnWriteArrayList` | 读极多写极少 |
| `ConcurrentLinkedQueue` | 无界并发队列 |
| `LinkedBlockingQueue` / `ArrayBlockingQueue` | 阻塞队列,生产者-消费者 |
| `CountDownLatch` | 一次性等待 N 个完成 |
| `CyclicBarrier` | 多线程到齐后一起冲 |
| `Semaphore` | 限流(允许 N 个并发) |
| `Phaser` | 多阶段同步 |

### ThreadLocal 的隐藏雷

```java
private static ThreadLocal<UserContext> CTX = new ThreadLocal<>();

@Around
public Object aspect() {
    CTX.set(buildCtx());
    try { return joinPoint.proceed(); }
    finally { CTX.remove(); }            // ⚠️ 必须 remove,线程池里的线程会复用
}
```

不 remove → 上一次请求的用户上下文留给下一次请求的线程 → **A 用户看到 B 的数据**——经典生产事故。

> 经验法则:**ThreadLocal 的 set 必须配对 remove,放 finally 块**。能用方法参数传上下文就别用 ThreadLocal。

---

## 十二、CPU 100% 怎么排查

```bash
# 1. 找占 CPU 的 Java 进程
top -c

# 2. 找占 CPU 的线程(进程内)
top -Hp <pid>

# 3. 拿到线程 ID,转 16 进制
printf '%x\n' <tid>

# 4. 拿线程栈
jstack <pid> | grep -A 30 'nid=0x<hex_tid>'

# 5. 直接火焰图(更好用)
async-profiler/profiler.sh -d 30 -f cpu.html <pid>
```

火焰图横向是栈帧、纵向是调用层级,**最宽的方法就是最热点**。看一眼能发现 90% 的性能问题。

---

## 十三、常见踩坑

1. **`Executors.newFixedThreadPool` 队列无界**:任务堆积 OOM
2. **`Executors.newCachedThreadPool` 线程无限**:压力来了创几万线程,直接挂
3. **`@Async` 不指定线程池**:默认 SimpleAsyncTaskExecutor 不是池
4. **CompletableFuture 用默认 forkJoinPool**:跟系统其他模块抢资源,容易死锁
5. **`.get()` 不带超时**:某次下游卡住,所有调用线程被吃满
6. **ThreadLocal 没 remove**:复用线程串数据
7. **synchronized + 虚拟线程**:载体线程被 Pinning,虚拟线程优势消失
8. **double check 单例没 volatile**:偶发 NPE
9. **HashMap 当并发用**:JDK 7 死循环,JDK 8 数据丢失
10. **count++ 加 volatile 就以为安全**:不行,要么 atomic 要么 lock
11. **容器里 -Xmx 写死**:换机器忘了改,要么浪费要么 OOM
12. **没开 HeapDumpOnOutOfMemoryError**:线上 OOM 死无对证
13. **Full GC 频繁不分析,直接加堆**:堆变大,Full GC 一停就更长
14. **GC 日志没打**:出问题没材料分析
15. **ParallelGC + 32G 堆**:STW 几秒,接口直接超时

---

## 十四、本章 Checklist

| 项 | 说明 |
| --- | --- |
| ✅ JDK 17+,默认 G1,大堆上 ZGC | 别用 ParallelGC + 大堆 |
| ✅ 容器内用 RAMPercentage,不写死 -Xmx | 跨规格部署 |
| ✅ 开 GC 日志 + JFR | 出问题有材料 |
| ✅ 开 HeapDumpOnOutOfMemoryError | OOM 第一现场 |
| ✅ 自建 ThreadPoolExecutor + 有界队列 | 拒绝 Executors 工厂方法 |
| ✅ 拒绝策略选 CallerRunsPolicy | 削峰、压回上游 |
| ✅ 线程池命名 | jstack 才看得懂 |
| ✅ CompletableFuture 必显式传 pool | 不要用默认 commonPool |
| ✅ ThreadLocal set / remove 成对 | finally 块 |
| ✅ Java 21+ 开虚拟线程 | Spring Boot 3.2 一行开关 |
| ✅ synchronized → ReentrantLock(虚拟线程下) | 避免 Pinning |
| ✅ 火焰图工具备好 | async-profiler / Arthas |

---

## 小结

JVM 是 Java 后端的"地基"——业务代码是楼,JVM 是地下结构。**地基出问题,楼上一切都晃**。

记住这几条:

1. **GC 病的根因是对象生命周期**,不是堆不够大
2. **线程池的核心不是大小,是"出问题怎么降级"**——队列有界 + 拒绝策略
3. **虚拟线程让"同步代码 = 异步性能"成为现实**——但 synchronized 是它的死敌
4. **JFR + 火焰图 + heap dump** 是 JVM 三件套,缺一个就是盲打

下一章我们解决"企业级登录"——7 章 Spring Security 教你"能登录",但 SaaS / 多产品线场景下的 **OAuth2 / OIDC / SSO / RBAC / ABAC / Keycloak**,才是真正的"企业级"。
