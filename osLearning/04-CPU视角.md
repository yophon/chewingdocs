# CPU 视角

理解程序性能的最深一层是**理解 CPU 在干什么**——你写的 `a + b` 不是简单的加法,**现代 CPU 会预测、乱序、并行、缓存、流水线**地执行。一个相同算法 / 相同数据量的 C 程序,跑在同样的机器上,**仅仅因为内存访问模式不同,性能可能差 10 倍**——根本原因是 cache 命中率。这一篇讲清楚程序员该懂的 CPU 知识:**多核、寄存器、缓存层级、流水线、乱序执行、SIMD**——以及为什么「性能优化最后都到 cache 友好」。

> 一句话先记住:**现代 CPU = "预测式 + 流水线式 + 多核" 的执行机器**——它不像你写代码那样一行一行跑,而是同时执行十几条指令、缓存几 MB 数据、跨核共享缓存。**性能瓶颈 95% 来自"内存墙"** —— CPU 比内存快 100 倍,**cache 命中决定一切**。**程序优化的终极目标不是少写代码,是让数据待在 L1**。

---

## 一、CPU 的物理结构

```
CPU Package(一颗 CPU)
├── Core 0
│   ├── L1d (32 KB, 1 cycle)
│   ├── L1i (32 KB)
│   ├── L2  (256 KB, 10 cycles)
│   └── 寄存器
├── Core 1
│   ├── L1d / L1i / L2
│   └── 寄存器
├── ...
├── L3  (32 MB, 40 cycles, 所有核共享)
└── Memory Controller → DRAM (200+ cycles)
```

**关键洞察**:

- L1 离核最近,极快但极小
- L2 中等
- L3 大但慢,所有核共享
- DRAM 是 L3 的几十倍延迟

### 1.1 各层延迟数字

```
寄存器:        ~0.3 ns (1 cycle @ 3GHz)
L1 cache:     ~1 ns
L2 cache:     ~3 ns
L3 cache:     ~12 ns
DRAM:         ~100 ns
SSD (NVMe):   ~10 μs
HDD:          ~10 ms
```

**100 倍差距**——CPU 等内存的时间能跑 100 条指令。**这就是"内存墙"**。

---

## 二、寄存器

CPU 内部的**最快存储**——直接连接 ALU。

x86_64 的寄存器:

```
通用寄存器:   rax / rbx / rcx / rdx / rsi / rdi / rsp / rbp / r8-r15  (16 个,各 64 bit)
浮点 / SIMD:  xmm0-xmm15 (128 bit) / ymm0-15 (256 bit) / zmm0-31 (512 bit)
段寄存器:     cs / ds / ss / es / fs / gs
程序计数器:   rip(指向下一条指令)
标志寄存器:   rflags(零标志、进位、负数等)
```

### 2.1 寄存器分配

编译器的核心工作之一——**把变量分配到寄存器**:

```c
int sum(int *arr, int n) {
    int s = 0;              // s → rax
    for (int i = 0; i < n; i++)  // i → rcx
        s += arr[i];        // arr[i] → 临时寄存器
    return s;
}
```

**变量太多 → 寄存器不够 → spill 到栈**(性能下降)。

### 2.2 register 关键字

```c
register int i;  // 提示编译器把 i 放寄存器
```

**现代编译器忽略这个提示**——它自己分配得比你好。

---

## 三、流水线(Pipeline)

CPU 不是「执行完一条再执行下一条」,**是流水线并行**:

```
          时刻 1   2   3   4   5
指令 1:   F  D  X  M  W
指令 2:      F  D  X  M  W
指令 3:         F  D  X  M  W
指令 4:            F  D  X  M  W

F = Fetch(取指令)
D = Decode(解码)
X = Execute(执行)
M = Memory access(访存)
W = Write back(写回)
```

5 级流水线 → **5 条指令同时在不同阶段处理**。现代 CPU 有 14-19 级流水线。

### 3.1 流水线打断:三大杀手

#### A. 分支预测失败

```c
if (x > 0) { ... } else { ... }
```

CPU 提前预测会走哪个分支,预读后续指令到流水线。**预测错 → 流水线全部清空,重新加载**(罚 10-20 个 cycle)。

**优化**:`__builtin_expect(x, 1)` 告诉编译器"这个条件常为真"。

```c
if (__builtin_expect(x > 0, 1)) { ... }
```

#### B. 数据依赖

```c
a = b + c;
d = a + 1;   // 必须等 a 算完
```

**指令 2 等指令 1 的结果** —— 流水线"卡住"。CPU 通过**乱序执行(OoO)+ 寄存器重命名**缓解。

#### C. 缓存未命中

访问内存的指令突然要等 100+ 个 cycle —— 流水线被冻结。

**这是性能优化的主战场**。

---

## 四、乱序执行(Out-of-Order Execution)

```c
a = load(x);    // 可能要等 100 cycle (cache miss)
b = 1 + 2;      // 不依赖 a
c = b * 3;      // 依赖 b
d = a + 1;      // 依赖 a
```

CPU 看到这段代码:

- 执行 a = load(x),发现要等
- **同时**执行 b = 1+2(没依赖,先做)
- **同时**执行 c = b*3
- 等 a 回来,再执行 d = a+1

**用户看到的"顺序执行"是个假象** —— **乱序的代价是"并发可见性问题"**(详见 15 内存屏障)。

### 4.1 推测执行(Speculative Execution)

CPU 不仅乱序,**还会"猜未来"** —— 预测分支后,**提前执行**还没确定要走的路径。猜对了赚到,猜错了回滚。

**问题**:Spectre / Meltdown 漏洞——CPU 推测执行的过程会留下缓存痕迹,**攻击者能侧信道读出敏感数据**。这就是 2018 年震惊业界的 CPU 漏洞,所有云厂商都打了补丁。

---

## 五、缓存:程序员能控制的最关键变量

### 5.1 cache line:64 字节是单位

CPU 不是按字节读内存的——**最小单位是 64 字节(cache line)**。

```c
char arr[1024];
char x = arr[0];   // 实际把 arr[0..63] 全部加载到 cache line
```

**意味着**:连续访问 64 字节内的元素,只触发**一次内存访问**。

### 5.2 顺序访问 vs 随机访问

```c
// 顺序:cache 友好
for (int i = 0; i < N; i++)
    sum += arr[i];

// 随机:cache 杀手
for (int i = 0; i < N; i++)
    sum += arr[hash(i)];
```

**顺序访问比随机访问快 5-10 倍**——不是 CPU 算得慢,是 **cache miss 多**。

### 5.3 二维数组的访问顺序

```c
int matrix[1024][1024];

// 行优先(C 语言内存布局):快
for (int i = 0; i < 1024; i++)
    for (int j = 0; j < 1024; j++)
        sum += matrix[i][j];

// 列优先:慢 5-10 倍
for (int j = 0; j < 1024; j++)
    for (int i = 0; i < 1024; i++)
        sum += matrix[i][j];
```

**因为 C 语言行优先存储**——内层循环按行扫,cache 命中;按列扫,每次跳 4KB,cache 全失效。

### 5.4 数据结构对 cache 友好

```c
// 结构体数组 (AoS):访问 ages 时,name 也被加载,浪费 cache
struct Person { char name[32]; int age; };
Person people[1000];
for (i = 0; i < 1000; i++) sum += people[i].age;

// 数组结构体 (SoA):只加载需要的字段,cache 利用率高
int ages[1000];
char names[1000][32];
for (i = 0; i < 1000; i++) sum += ages[i];
```

**SoA 比 AoS 快 2-5 倍** —— 这是游戏引擎、ML 框架的常用优化。

### 5.5 prefetch:告诉 CPU 提前加载

```c
for (int i = 0; i < N; i++) {
    __builtin_prefetch(&arr[i + 8]);  // 提前 8 个迭代加载
    sum += arr[i];
}
```

**手动 prefetch 在不规则访问场景能快 20-50%** —— 但顺序访问 CPU 自己会预取,加了反而慢。

---

## 六、多核与缓存一致性

```
Core 0 改了 x  → 它的 L1 cache 里 x = 1
Core 1 读 x    → 看到的是它自己 L1 cache 里的旧值 x = 0?
```

**不会** —— **MESI 协议**保证多核的 L1 cache 看到一致的值。

详见 10 篇 CPU 缓存与一致性。

### 6.1 false sharing(伪共享)

```c
struct {
    int a;  // Core 0 改这个
    int b;  // Core 1 改这个
} shared;
```

**a 和 b 在同一个 cache line(64 字节)** —— Core 0 改 a 会让 Core 1 的 cache line 失效,反之亦然。**性能比加锁还慢**。

**修复**:padding 让它们不在同一 line:

```c
struct {
    int a;
    char padding[60];   // 填满 64 字节
    int b;
} shared;
```

**这是高性能并发代码的"必修课"** —— 详见 10 / 15 篇。

---

## 七、SIMD:一条指令算多个数

SIMD = Single Instruction Multiple Data —— 一条指令同时操作多个数据。

```
普通加法:   a + b → c          (1 个 int)
SSE2:      [a0,a1,a2,a3] + [b0,b1,b2,b3]  (4 个 int 同时加)
AVX-512:   16 个 int / 8 个 double 同时加
```

### 7.1 应用场景

- 数值计算 / 矩阵运算
- 图像处理 / 视频编码
- 字符串搜索 / 解析
- 哈希 / CRC
- ML 推理(float32 矩阵乘)

### 7.2 怎么用

```c
// 编译器自动向量化
gcc -O3 -mavx2 ...

// 手动 intrinsics
#include <immintrin.h>
__m256i a = _mm256_load_si256(...);
__m256i b = _mm256_load_si256(...);
__m256i c = _mm256_add_epi32(a, b);
```

**好的库都用了 SIMD** —— BLAS / NumPy / OpenCV / FFmpeg 都是。

---

## 八、超线程(SMT / Hyper-Threading)

一个物理核**模拟成 2 个逻辑核** —— 共享执行单元 / cache,各自有独立的寄存器集合。

```
Linux 看 8 物理核 + 超线程 = 16 核
但实际计算能力只有 1.2-1.4 倍单核
```

**好处**:一个线程等内存时,另一个线程能占用执行单元。
**坏处**:cache 竞争,**有些计算密集场景关掉超线程反而快**(数据库 / HPC)。

---

## 九、性能测量:perf 看真实开销

```bash
perf stat ./your_program

# 输出:
#  10,234,567,890 cycles                  
#  20,123,456,789 instructions              # 2.0 IPC (instructions per cycle)
#   1,234,567,890 cache-references
#     123,456,789 cache-misses              # 10% miss rate
#      12,345,678 branch-misses             # 1% misprediction
```

**关键指标**:

- **IPC(每周期指令数)**:理想 4+,< 1 说明 CPU 在等(内存或分支)
- **Cache miss rate**:< 5% OK,> 10% 要优化数据结构
- **Branch misprediction**:< 1% OK,> 5% 要优化分支

详见 26 篇性能工具。

---

## 十、CPU 频率与功耗

### 10.1 频率不是恒定的

现代 CPU 动态调频:

- 空闲时降到 800MHz(省电)
- 高负载时升到 4-5GHz(Boost)
- 多核同时高负载时降回(防过热)

**性能测试要锁频**:`cpupower frequency-set -g performance`。

### 10.2 功耗墙

为什么 CPU 频率从 2005 年起 10 年都卡在 3-4GHz?

**因为功耗 ∝ 频率³** —— 频率翻倍,功耗 8 倍,散热搞不定。**所以 CPU 厂商改走"多核"路线**——核数越来越多。

**这就是为什么"并行编程"是这十年的主旋律**。

---

## 十一、ARM vs x86

2025 年的格局:

```
x86_64 (Intel / AMD):  服务器主流,功能最全,功耗高
ARM64 (Apple / 高通 / 鲲鹏): 移动 / 笔记本主流,服务器迅速崛起 (AWS Graviton, Apple Silicon)
RISC-V:                开源,新兴,嵌入式起步
```

**关键差异**:

- ARM 内存模型更弱(原子操作可能慢)
- ARM 的 SIMD 是 NEON / SVE(不是 AVX)
- 某些 syscall 编号不同
- `gcc -march=...` 要指定不同

**好消息**:Linux 抽象了 95% 的差异 —— 你写的代码大多数都能跨平台。

---

## 十二、踩坑提醒

1. **以为代码顺序执行**——CPU 乱序 + 推测,顺序是假象
2. **不考虑 cache**——同样算法快慢差 10 倍
3. **结构体不对齐**——内存浪费 + cache 不友好
4. **多线程改同 cache line(false sharing)**——性能崩
5. **大量分支**——预测失败罚得狠
6. **二维数组列优先访问**——cache miss 爆表
7. **不用 `-O2 / -O3`**——编译器优化能差 5 倍
8. **以为 perf stat 数字看不懂**——IPC、cache miss、branch miss 三个数足够定位 80% 性能问题
9. **以为超线程总是好**——HPC 场景关掉更快
10. **频率没锁就测性能**——动态调频导致结果飘
11. **AVX-512 滥用**——这指令集功耗高,触发 CPU 降频,反而慢
12. **以为 ARM 跟 x86 一样**——内存模型不同,跨平台并发代码要小心

---

下一篇:`05-中断与异常.md`,讲 CPU 是怎么"分心"的——**硬件中断**(网卡来包了)、**异常**(除零、缺页)、**syscall**(用户主动陷入)三种"陷入(trap)"机制怎么走、**中断处理函数**为什么不能睡眠、**软中断 / tasklet / 工作队列**为什么是"中断分上下半部"的解决方案,以及为什么"高 PPS 网络服务必须开 RPS / RSS"。
