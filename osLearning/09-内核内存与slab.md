# 内核内存与 slab

新手看 `free -h` 最常见的惊吓:16GB 的机器,`free` 只剩 500MB——"内存被谁吃光了?!"然后慌忙重启服务,甚至有人写了定时清缓存的 cron。这都是冤案:**那 11GB 的 buff/cache 不是被吃了,是 Linux 拿空闲内存做了缓存,你的程序要用时它随时让出来**。要看懂这笔账,你得知道内核自己是怎么管内存的——它不能用 malloc(它自己就是 malloc 的底座),它有自己的两层体系:**buddy 管物理页,slab 管小对象**。每次 fork、每次 open、每个新连接,背后都是这套体系在毫秒间分配 task_struct、inode、socket buffer。这一篇把内核这本账讲清楚。

> 一句话先记住:**内核内存 = buddy(按 2 的幂分配物理页)+ slab(在页上为每种内核对象切好"专用货架")**,而剩下的空闲内存几乎全被拿去做 **page cache**——所以**看可用内存要看 available,不是 free**。slab 让 task_struct / inode 这类高频小对象的分配接近零成本,**这是 Linux 能扛住每秒十万级 fork / open / accept 的底层原因**。

---

## 一、内核为什么不能用 malloc

用户态的 malloc 那么成熟,内核抄一份不行吗?不行,内核面对三条用户态没有的死规矩:

```
1. 内核不能缺页
   用户态访问没分配的页 → 缺页中断 → 内核来兜底
   内核自己缺页 → 谁兜底?没人,直接死锁/崩溃
   → 内核分到的内存必须立刻有物理页,不能玩"先记账后给钱"

2. 中断上下文不能睡眠
   malloc 内部可能等内存回收(等就是睡眠)
   中断处理函数绝不能睡
   → 必须提供"原子分配":要么立刻给,要么立刻失败

3. DMA 要求物理连续
   网卡/磁盘控制器直接往物理内存写,不经过 MMU
   → 给设备的缓冲区必须物理连续,虚拟连续没用
```

所以内核自己搭了一套,分两层:

```
┌─────────────────────────────┐
│  slab / slub                │ ← 在页上切小对象(kmalloc、kmem_cache_*)
├─────────────────────────────┤
│  buddy allocator            │ ← 管物理页(alloc_pages)
├─────────────────────────────┤
│  物理内存                    │
└─────────────────────────────┘
```

眼熟吗?**和用户态"glibc 切小块 / 内核批发大块"是同一个思想**——批发零售两级结构,只是这次批发商是 buddy,零售商是 slab。

---

## 二、buddy 分配器:用 2 的幂驯服碎片

buddy 把物理内存按 2 的幂分块,每档(order)各维护一条空闲链表:

```
order 0:  1 页 = 4KB      free list: [页A] → [页B] → ...
order 1:  2 页 = 8KB      free list: [页对] → ...
order 2:  4 页 = 16KB
...
order 10: 1024 页 = 4MB   ← kmalloc 的天花板就来自这
```

**分配**:要 8KB → 找 order 1 的链表;空了就去拆一个 order 2 的块,劈成两半,用一半挂一半。

**释放**:还 order 1 的块时,看它的"伙伴(buddy)"——同 order、地址相邻、合起来正好是一个 order 2 块的那一半——是否也空闲。**空闲就合并成 order 2,然后递归向上继续试合并**。

为什么死磕 2 的幂?三个理由:**伙伴好找**(伙伴的地址和自己只差一个 bit,异或一下就出来)、**碎片可控**(小块总有机会合回大块)、**分配快**(O(log n) 定位档位)。

观测:

```bash
cat /proc/buddyinfo
# Node 0, zone   Normal   100  50  20  10  5  2  1  0  0  0  0
#                          o0  o1  o2  o3 ...              o10
```

每个数字是该 order 的空闲块数。**右边高 order 全是 0 = 系统已经凑不出大块连续物理内存了**。这不是理论问题——高 PPS 场景网卡驱动要分配多页连续缓冲,碎片化的机器上分配失败,**表现就是莫名其妙的丢包**。

---

## 三、slab:给每种内核对象开"专用货架"

### 3.1 没有 slab 的世界

内核的分配负载长这样:

```
每秒 fork 100 次     → 100 个 task_struct(每个约 2KB)
每秒 open 1000 次    → 1000 组 file / inode / dentry
每秒 accept 10 万次  → 10 万个 sock 结构
```

全是**固定大小、生灭极快**的小对象。每次都找 buddy 拿一整页?2KB 的对象占 4KB 的页,浪费一半;而且分配路径太长,扛不住这个频率。

### 3.2 slab 的解法:按类型预制

**为每种内核数据结构维护一个专属 cache**:

```
task_struct cache:
  从 buddy 批发一页,预先划成 N 个 task_struct 大小的格子
  分配:从格子里拿一个,O(1)
  释放:放回格子,O(1)(连初始化都能省——格子里留着上次的构造状态)
  格子用完 → 再找 buddy 批发一页

inode cache、dentry cache、sock cache……每种对象一套
```

这就是 slab。**fork / open / accept 的内存分配被压到近乎零成本,Linux 能撑百万级 socket,这是底层支柱之一**。

历史上有三个实现:`slab`(初版,思想来自 Solaris)、`slub`(现在的 Linux 默认,更简洁更快)、`slob`(嵌入式小内存版)。**现在跑的都是 slub,但所有人嘴上还是叫 slab**,内核 API 也还是 `kmem_cache_*`:

```c
// 内核模块给自己的结构建 cache:
struct kmem_cache *my_cache = kmem_cache_create("my_obj",
        sizeof(struct my_obj), 0, SLAB_HWCACHE_ALIGN, NULL);
struct my_obj *o = kmem_cache_alloc(my_cache, GFP_KERNEL);
kmem_cache_free(my_cache, o);
```

### 3.3 观测:slabtop

```bash
slabtop
#  OBJS  ACTIVE  USE  OBJ SIZE  SLABS  OBJ/SLAB  CACHE SIZE  NAME
# 100000  90000  90%   256.0K    100        1      24.4MB    task_struct
# 200000 180000  90%   192.0K    200        1      38.4MB    inode_cache
```

**"系统内存涨了但所有进程的 RSS 都解释不了"时,slabtop 是第一现场**——经常是 dentry / inode 缓存被海量小文件操作撑起来了(可调 `vm.vfs_cache_pressure` 让内核更积极地回收它们,默认 100,调大更积极)。

---

## 四、kmalloc vs vmalloc:内核里的"两种 malloc"

内核代码自己要内存时,有两个常用入口:

| | `kmalloc(size, flags)` | `vmalloc(size)` |
| --- | --- | --- |
| 物理连续性 | **连续**(走 slab / buddy) | 虚拟连续,物理可以碎 |
| 能否 DMA | 能 | **不能**(设备不认虚拟地址) |
| 大小上限 | 约 4MB(buddy order 10) | 几百 MB 没问题 |
| 速度 | 快 | 慢一点(要逐页建页表映射) |
| 碎片敏感 | 大块在碎片化机器上会失败 | 不敏感 |

选择口诀:**小对象、要 DMA、要快 → kmalloc;大块、不碰设备 → vmalloc**。

kmalloc 还要带一个 `GFP_*` 标志,告诉内核"我现在处于什么上下文":

```c
GFP_KERNEL:   普通进程上下文,缺内存可以睡着等回收
GFP_ATOMIC:   中断 / 自旋锁里,绝不能睡——要么立刻给要么失败
GFP_NOIO:     回收时禁止发 IO(防止 IO 路径上的递归死锁)
GFP_DMA:      限定低 16MB 物理内存(伺候老 ISA 设备)
__GFP_ZERO:   分配顺便清零
__GFP_NOFAIL: 死磕到拿到为止(慎用)
```

经典死法:**中断处理函数里用了 GFP_KERNEL**——它一睡眠,整个 CPU 的中断处理卡死。中断里只能 GFP_ATOMIC。

---

## 五、page cache:那 11GB"消失的内存"

现在回答开头的惊吓。看这个输出:

```bash
free -h
#         total   used   free   shared  buff/cache  available
# Mem:     16Gi    4Gi   500Mi   100Mi      11Gi       11Gi
```

那 11GB 的 buff/cache 是 **page cache**:你每次 `read` 一个文件,内核顺手把数据留在内存里,下次再读同一块就不打磁盘了。**Linux 的哲学是"空闲内存就是浪费的内存"——能拿来做缓存的全拿去**。关键在于这些页是"随叫随让"的:程序要内存时内核直接回收它们。

所以铁律是:**看 available,别看 free**。available 才是"程序还能用多少"。

写也走 page cache,而且更妙:

```
write() → 数据进 page cache,标记 dirty → 立即返回(没碰磁盘!)
后台 writeback 线程定期把 dirty 页刷盘
```

**这就是 write 快得不像在写磁盘的原因——它确实没在写磁盘**。代价是掉电会丢没刷盘的数据,所以数据库在关键节点调 `fsync(fd)` 强制落盘(阻塞到数据真正在盘上)。

dirty 页的水位由两个参数管:`vm.dirty_background_ratio`(默认 10,超过就启动后台刷)和 `vm.dirty_ratio`(默认 20,超过就强制同步刷,**业务线程会被卡住**)。重写入的服务通常把它们调小,把"攒一大坨突然刷盘 stall 几秒"摊平成持续小流量。

顺带认识 **tmpfs**:`/tmp`、`/run`、`/dev/shm` 这些挂载点的"文件"其实直接存在 page cache 里,读写飞快但关机即焚。**坑:tmpfs 占的内存算 used 不算 cache**——往 /dev/shm 倒了 4GB 文件,used 莫名多 4GB,经常没人想得起来。

---

## 六、内存吃紧时:回收的优先级链

物理内存不够了,内核按这个顺序自救:

```
1. 回收 page cache(干净页直接丢,dirty 页先刷盘)
2. 回收 slab 里可回收的部分(主要是 dentry / inode 缓存)
3. 把冷的匿名页换到 swap
4. 都不行 → OOM Killer 杀进程(06 篇讲过选人规则)
```

第 3 步的积极性由 `vm.swappiness`(0-100)控制:0 是几乎不 swap、优先砍 cache,默认 60,100 是积极 swap 保 cache。**数据库服务器设 1**——宁可缓存少点,绝不让热数据被换出去(被换出的页再访问就是毫秒级主缺页,p99 当场去世)。

还有个看起来诱人的开关:

```bash
echo 3 > /proc/sys/vm/drop_caches   # 1=清 page cache,2=清 dentry/inode,3=全清
```

**只配出现在测试环境**(比如做干净的 IO 基准测试)。生产上清缓存等于把所有热数据扔了,接下来每个请求都打磁盘,**性能瞬间塌方**——开头说的那种"定时清缓存的 cron"就是在定时自残。

---

## 七、内核这本账去哪查:/proc/meminfo

```bash
cat /proc/meminfo
# MemTotal:       16384000 kB
# MemFree:          500000 kB
# Buffers:          200000 kB   ← 块设备缓存
# Cached:        11000000 kB   ← page cache(含 tmpfs!)
# Slab:           1000000 kB   ← slab 总占用
# SReclaimable:    800000 kB   ←   其中可回收(dentry/inode 为主)
# SUnreclaim:      200000 kB   ←   其中不可回收
# KernelStack:      80000 kB   ← 内核栈,每个线程 16KB
# PageTables:      100000 kB   ← 页表本身占的内存
```

一个真实的"内存失踪案"排查:total 16GB、所有进程 RSS 加起来 4GB、cache 才 1GB,剩下的呢?翻 meminfo——`PageTables` 占了 5GB(几百个大进程,**页表自己就是 GB 级开销**,06 篇讲的多级页表不是免费的),或者 `KernelStack` 占 2GB(几十万个线程,每个白送内核 16KB)。**用户态工具看不见的内存,全在这个文件里对账**。

---

## 八、容器的内存账:cgroup

Docker / K8s 限制容器内存,底层就是 cgroup:

```bash
docker run -m 1g ...
# 约等于:
echo 1G > /sys/fs/cgroup/memory/mycontainer/memory.limit_in_bytes
echo $$ > /sys/fs/cgroup/memory/mycontainer/cgroup.procs
```

内核为每个 cgroup 单独记账(RSS + page cache),超限就触发 **cgroup 内的 OOM Killer**。两个著名的坑:

- **老版 JVM 看不见 cgroup**,按宿主机内存自动算 -Xmx——容器限 2G,JVM 按 64G 的机器给自己定了 16G 的堆,起来没多久就 OOMKilled。Java 10+ 的 `-XX:+UseContainerSupport` 修了(配合 07 篇的 MaxRAMPercentage)
- **page cache 也算进 cgroup 的账**——容器里大量读写文件,cache 把 limit 顶满,看起来"进程没用多少内存却 OOM 了"

容器底层的完整机制详见 25 篇。

---

## 九、NUMA:内存还分远近

多 socket 服务器上,内存条物理上挂在不同 CPU 下面:

```
Node 0:CPU 0-15  + 64GB 本地内存
Node 1:CPU 16-31 + 64GB 本地内存
跨 node 访问 → 走 socket 间互联,延迟约翻倍
```

内核分配策略默认"优先本地 node,不够再去远端"。排查和绑定:

```bash
numactl --hardware                            # 看拓扑
numastat                                      # numa_miss 高 = 跨 node 严重
numactl --cpunodebind=0 --membind=0 ./app     # 绑死 node 0
```

NUMA 对性能的完整影响(以及为什么数据库要绑核)放到下一篇和 CPU 缓存一起讲。

---

## 踩坑提醒

1. **把 buff/cache 当"被吃掉的内存"**——那是随叫随让的缓存,看 available 才是真可用
2. **生产环境 drop_caches**——热数据全扔,接下来所有请求打磁盘,这是自残不是优化
3. **kmalloc 申请大块**——上限 4MB 且碎片化时失败,大块用 vmalloc
4. **中断上下文用 GFP_KERNEL**——可能睡眠 = 死锁,中断里只有 GFP_ATOMIC
5. **数据库机器不调 swappiness**——默认 60 会把热页换出去,p99 被主缺页打飞,设 1
6. **内存失踪不查 /proc/meminfo**——PageTables / KernelStack / SUnreclaim 这些隐形大户只在这里现形
7. **不会用 slabtop**——dentry / inode 缓存吃掉几个 GB 时,进程视角永远找不到凶手
8. **dirty 水位不调**——重写入服务攒一大坨 dirty 页突然同步刷盘,业务 stall 几秒
9. **容器里跑老 JVM 不开容器感知**——按宿主机内存定堆大小,必被 OOMKilled
10. **忘了 page cache 算 cgroup 的账**——容器内大量文件 IO 也能把 limit 顶爆
11. **把 vmalloc 当 kmalloc 用**——物理不连续,给 DMA 用直接出事
12. **tmpfs 当普通磁盘使**——它占的是内存且算 used,往 /dev/shm 倒大文件等于偷偷吃内存

---

下一篇:`10-CPU缓存与一致性.md`,内存层的最后一块拼图,也是最影响并发性能的一块——MESI 协议怎么让多核看到一致的内存、false sharing 为什么能让多线程比单线程还慢 10 倍、NUMA 跨 socket 的真实代价,以及为什么高性能代码必须按 cache line(64 字节)设计数据结构。
