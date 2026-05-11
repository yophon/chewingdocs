# 内核内存与 slab

讲完了用户态的 malloc,**该看内核自己怎么管理内存了**。内核的需求和用户态完全不同——内核要分配 `task_struct`(每个进程一个,几 KB)、`inode`(文件系统元数据)、`socket buffer` 等等,**这些都是固定大小的小对象,且分配频率极高**(每次 fork、每次打开文件、每次新连接)。普通的 malloc 在内核场景下太慢。这一篇讲内核内存的两层结构:**buddy 分配器(管物理页)** 和 **slab/slub(管小对象)**,以及为什么 `slabtop` 是内核内存调优的必备工具。

> 一句话先记住:**内核内存 = "buddy 管页 + slab 管对象"** 的两层结构。**buddy 按 2 的幂大小分配物理页**(4 KB / 8 KB / ... / 4 MB),解决"有连续物理页可分"的问题;**slab 在 buddy 上面切对象**,**对每种内核数据结构(`task_struct` / `inode` / `dentry`)预分配 cache**,分配几乎零成本。**slab 是"为什么 Linux 能撑百万 socket"的底层关键**——没有它,内核自己就被自己拖死。

---

## 一、内核为什么不能用普通 malloc

### 1.1 三个根本约束

```
1. 内核不能缺页
   - 用户态访问没分的虚拟内存 → 缺页 → 内核帮你处理
   - 内核自己缺页 → 谁来处理?直接死锁
   → 内核分配的内存必须立刻有物理页

2. 中断上下文不能睡眠
   - malloc 内部可能等内存(等待 page reclaim)
   - 中断处理函数不能等任何东西
   → 内核的"原子分配"不能阻塞

3. 物理连续性
   - DMA 设备直接访问物理内存,要求连续
   - kmalloc 必须返回物理连续内存
   → 不能有碎片
```

### 1.2 内核内存的两层

```
┌─────────────────────────────┐
│   slab / slub               │ ← 切小对象给内核数据结构
│   (kmalloc, kmem_cache_*)   │
├─────────────────────────────┤
│   buddy allocator           │ ← 管理物理页(4KB / 8KB / 16KB / ...)
│   (alloc_pages)             │
├─────────────────────────────┤
│   物理内存                   │
└─────────────────────────────┘
```

---

## 二、buddy 分配器:按 2 的幂分配

### 2.1 思想

把**物理内存按 2 的幂分块**:

```
order 0:  1 页 (4 KB)
order 1:  2 页 (8 KB)
order 2:  4 页 (16 KB)
...
order 10: 1024 页 (4 MB)
```

每个 order 维护一个 free list:

```
order 0 free list: [page A] → [page B] → ...
order 1 free list: [pair AB] → ...
...
```

### 2.2 分配 / 释放

**分配**:

```
要 8 KB → order 1
order 1 list 有空闲 → 取一对页
没空闲 → 拆 order 2 的一对(分裂成两对 order 1,用一对)
```

**释放**:

```
还 order 1 → 看伙伴(buddy)是否也空闲
是 → 合并成 order 2 → 继续看 order 2 的伙伴
否 → 直接放 order 1 list
```

**伙伴的定义**:同 order、地址连续、可合并的那一对。

### 2.3 为什么是 2 的幂

- **合并简单**:伙伴地址只差 1 个 bit
- **碎片可控**:总能合并,大块容易凑出来
- **分配快**:O(log n) 找到合适大小

### 2.4 看 buddy 状态

```bash
cat /proc/buddyinfo
# Node 0, zone   Normal   100  50  20  10  5  2  1  0  0  0  0
#                         o0  o1  o2 ...                    o10
```

每个数字 = 该 order 的空闲块数。**高 order 全是 0 = 没有大块连续内存了**(碎片化严重)。

**坑**:**高 PPS 网卡需要分配大块连续内存(16+ 页)** —— 内存碎片化时分配失败,网卡掉包。

---

## 三、slab / slub:小对象的"高速 cache"

### 3.1 问题

```
内核每秒可能:
  fork 100 次 → 100 个 task_struct(每个 ~2KB)
  open 1000 次 → 1000 个 file 结构 / inode / dentry
  accept 10 万次 → 10 万个 sock 结构

如果每次都走 buddy 分配 4 KB 页 → 浪费 + 慢
```

### 3.2 slab 的解法

**为每种对象类型,维护一个 cache**:

```
task_struct cache:
  从 buddy 一次拿 1 页
  一页能装 ~2 个 task_struct
  分配:从 cache 拿一个,O(1)
  释放:还回 cache,O(1)
  cache 用完 → 再从 buddy 拿一页

inode cache:
  独立的 cache,装 inode 大小的对象
  ...
```

**所有内核对象都有自己的 cache**——这就是 slab。

### 3.3 三个版本

```
slab:    最早的实现,Solaris 来的
slub:    Linux 默认,简化 slab,性能更好
slob:    嵌入式简化版,小内存友好
```

> 现代 Linux 默认 slub,但**所有人都管它叫 slab**(代码里也是 `kmem_cache_*`)。

### 3.4 看 slab 使用

```bash
slabtop
# Active / Total Objects (% used)    : 1234567 / 2345678 (52.6%)
# Active / Total Slabs (% used)      : 12345 / 12345 (100.0%)
# Active / Total Caches (% used)     : 100 / 150 (66.7%)
# Active / Total Size (% used)       : 500MB / 800MB (62.5%)
#
#  OBJS ACTIVE  USE OBJ SIZE  SLABS  OBJ/SLAB CACHE SIZE NAME
# 100000  90000  90%  256.0K   100      1   24.4MB  task_struct
# 200000 180000  90%  192.0K   200      1   38.4MB  inode_cache
# ...
```

**用途**:

- 看哪个内核对象占内存最多
- 排查"内核内存涨"的问题
- 调 `vm.vfs_cache_pressure` 控制 inode/dentry 缓存

### 3.5 创建自己的 slab cache(内核模块开发)

```c
struct kmem_cache *my_cache;

my_cache = kmem_cache_create("my_obj", sizeof(struct my_obj), 
                              0, SLAB_HWCACHE_ALIGN, NULL);

struct my_obj *o = kmem_cache_alloc(my_cache, GFP_KERNEL);
// ...
kmem_cache_free(my_cache, o);
```

---

## 四、kmalloc vs vmalloc

### 4.1 kmalloc

```c
void *p = kmalloc(size, GFP_KERNEL);
```

**特征**:

- **物理连续**(可以做 DMA)
- 走 slab(小对象)/ buddy(大对象)
- 大小有上限(通常 4 MB,即 buddy 的 order 10)
- 慢:碎片化时分配失败

### 4.2 vmalloc

```c
void *p = vmalloc(size);
```

**特征**:

- **虚拟连续,物理可不连续**
- 不能做 DMA(物理不连续)
- 用户态级 mmap-like 机制
- 可以分配大块(几百 MB)
- 比 kmalloc 慢一点(要建页表)

### 4.3 选择

```
小对象、要 DMA、要快:        kmalloc
大块(>1MB)、不需要 DMA:    vmalloc
```

---

## 五、GFP flags:分配上下文的"提示"

`GFP_*` 告诉内核"这次分配在什么场景":

```c
GFP_KERNEL:     普通进程上下文,可以睡眠等内存
GFP_ATOMIC:     中断 / 自旋锁内,绝不能睡眠
GFP_NOIO:       禁止文件系统 IO(避免死锁)
GFP_DMA:        必须物理低 16MB 内(老 ISA 设备)
GFP_HIGHUSER:   用户态高内存
__GFP_ZERO:     分配后清零
__GFP_NOFAIL:   死磕,绝不返回 NULL(慎用)
```

**坑**:**中断处理用了 GFP_KERNEL → 死锁** —— 必须 GFP_ATOMIC。

---

## 六、内核内存的回收

### 6.1 page reclaim

物理内存吃紧时,内核会:

```
1. 扫描 LRU list
2. 把不常用的页换出 (swap)
3. 回收 cache(page cache、slab cache)
4. 还不够 → OOM Killer
```

### 6.2 vm.swappiness

控制内核多积极地用 swap(0-100):

```
0   尽量不 swap,优先回收 page cache
60  默认,平衡
100 优先 swap,保留 cache
```

**经验值**:

- 数据库服务器:`vm.swappiness=1`(尽量不 swap)
- 桌面:60(默认)

### 6.3 vm.vfs_cache_pressure

控制 inode / dentry 缓存的回收积极性:

```
100 默认,与 page cache 同等优先级
1000 更积极回收 inode/dentry
```

**用于**:文件操作密集的场景,inode 缓存吃太多内存。

### 6.4 drop_caches:手动清缓存

```bash
echo 1 > /proc/sys/vm/drop_caches    # 清 page cache
echo 2 > /proc/sys/vm/drop_caches    # 清 inode/dentry
echo 3 > /proc/sys/vm/drop_caches    # 全清
```

**只在测试环境用** —— 生产清缓存会让接下来的请求都从磁盘读,**性能瞬间崩**。

---

## 七、page cache:Linux 的"免费缓存"

### 7.1 是什么

```
你 read("/data/file")
→ 内核读磁盘
→ 把数据缓存到 page cache
→ 拷贝到你的 buffer

下次再 read 同一文件
→ 直接从 page cache 拿,不打磁盘
```

**Linux 默认会用所有空闲内存做 page cache** —— 这就是 `free -h` 里 `available` 远大于 `free` 的原因。

```bash
free -h
#               total   used   free   shared  buff/cache  available
# Mem:           16Gi    4Gi   500Mi   100Mi      11Gi      11Gi
# Swap:           4Gi     0B     4Gi
```

`buff/cache` 11 GB **不是被用了,而是 Linux 拿来做缓存了**——程序需要时立即让出。

### 7.2 写也走 page cache

```
write("/data/file")
→ 写入 page cache(标记 dirty)
→ 立即返回(异步刷盘)

后台 pdflush / writeback 线程定时刷盘
```

**这就是 write 比想象中快的原因** —— 没有立刻打磁盘。

**fsync** 才是真正强制刷盘:

```c
write(fd, ...);
fsync(fd);    // 阻塞,直到数据真在磁盘上
```

### 7.3 dirty 限制

```
vm.dirty_ratio:           dirty 内存占总内存的最大百分比 → 触发同步刷盘
vm.dirty_background_ratio: 触发后台刷盘的阈值
```

**默认**:`dirty_ratio=20, dirty_background_ratio=10`。

**调优**:大量 IO 写入的服务(数据库)调小这两个值,**避免突然大块刷盘 stall 业务**。

---

## 八、内核内存的可观测

### 8.1 /proc/meminfo

```bash
cat /proc/meminfo
# MemTotal:       16384000 kB
# MemFree:          500000 kB
# Buffers:          200000 kB        ← 块设备缓存
# Cached:        11000000 kB        ← page cache (含 tmpfs)
# Slab:           1000000 kB        ← slab 总占用
# SReclaimable:    800000 kB        ← slab 可回收(主要是 dentry/inode)
# SUnreclaim:      200000 kB        ← slab 不可回收(其他内核结构)
# KernelStack:      80000 kB        ← 内核栈(每个线程 16KB)
# PageTables:      100000 kB        ← 页表本身占的内存
# ...
```

### 8.2 内核内存"诡异占用"排查

```
现象:Total 16GB,used 4GB,但 buff/cache 只有 1GB,内存哪去了?
排查:
  cat /proc/meminfo | grep -i "slab\|kernel\|page"
  发现 PageTables 占了 5GB → 大量大进程,页表本身爆炸
  或 KernelStack 占了 2GB → 几十万线程
```

---

## 九、tmpfs:基于内存的"文件系统"

```bash
mount | grep tmpfs
# tmpfs on /tmp type tmpfs (rw,nosuid,nodev,size=8G)
# tmpfs on /run ...
```

**tmpfs 文件实际存在 page cache**——读写极快,**但不持久化**(关机消失)。

**用途**:

- `/tmp`、`/run`(运行时数据)
- Docker 的 `tmpfs` mount
- 共享内存(`/dev/shm`)

**坑**:tmpfs **算 used 内存,不算 cache** —— 容易让人误以为内存被吃了但不知道哪里。

---

## 十、cgroup memory:容器的内存限制

K8s / Docker 怎么限制容器内存?**通过 cgroup**:

```bash
# 容器启动时
docker run -m 1g ...
# 等价于
mkdir /sys/fs/cgroup/memory/mycontainer
echo 1G > /sys/fs/cgroup/memory/mycontainer/memory.limit_in_bytes
echo $$ > /sys/fs/cgroup/memory/mycontainer/cgroup.procs
```

**内核为这个 cgroup 单独算 RSS / cache**,超 limit 触发 cgroup 内 OOM Killer。

**坑**:

- **JVM 在容器里看不到 cgroup 限制**(老版 JVM 看的是宿主机内存)→ 用 `-XX:+UseContainerSupport`(Java 10+)
- **page cache 算进 cgroup 内存**——大量 IO 时 cache 撑爆 limit,触发 OOM

详见 25 篇容器底层。

---

## 十一、NUMA 与内核内存

NUMA 系统中,**内存属于不同节点(socket)**:

```
Node 0:  CPU 0-15 + 64 GB 内存
Node 1:  CPU 16-31 + 64 GB 内存
跨 node 访问内存 → 延迟翻倍
```

**内核分配策略**:

- 默认:**优先本地 node**(numa_balancing)
- 不够 → fallback 到其他 node

```bash
numactl --hardware              # 看 NUMA 拓扑
numastat                        # 看跨 node 访问统计
numactl --cpunodebind=0 --membind=0 ./app    # 绑死 node 0
```

详见 10 篇 CPU 缓存与一致性。

---

## 十二、踩坑提醒

1. **以为 buff/cache 是被吃的内存** —— Linux 拿来做缓存,可立即让出
2. **看 free 不看 available** —— 真正可用是 available,不是 free
3. **kmalloc 大块** —— 碎片化时失败,大块用 vmalloc
4. **中断里用 GFP_KERNEL** —— 死锁,必须 GFP_ATOMIC
5. **vm.swappiness 不调** —— 数据库被 swap 拖死
6. **手动 drop_caches 在生产** —— 接下来所有请求打磁盘
7. **slab 占用看不见** —— `slabtop` 是必备
8. **dirty 比例不调** —— 大块刷盘 stall 业务几秒
9. **容器没给 JVM 容器感知** —— -Xmx 比 limit 还大
10. **NUMA 不绑核** —— 跨 node 访问内存,延迟飘
11. **以为 vmalloc = malloc** —— vmalloc 物理不连续,不能做 DMA
12. **PageTables 占大头不知道** —— 大进程多时,页表本身就 GB 级

---

下一篇:`10-CPU缓存与一致性.md`,讲多核 CPU 的"暗物质"——**MESI 协议**(M / E / S / I 四个状态决定 cache line 的共享 / 独占)、**false sharing** 为什么让性能崩 10 倍、**NUMA** 跨 socket 访问的代价、**cache line ping-pong** 的来源,以及为什么"高性能并发代码必须按 cache line 设计数据结构"。
