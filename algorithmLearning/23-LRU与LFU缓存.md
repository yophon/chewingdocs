# LRU 与 LFU 缓存

LRU(Least Recently Used)是**工程师必须能徒手撕的算法**——面试高频、Redis / Guava / Caffeine / OS 页面置换全用它。它是**前面学的"哈希表 + 双链表"两件武器组合**而成的产物——理解 LRU,就理解了为什么"用对数据结构是 80% 的算法功夫"。

> 一句话先记住:**LRU = HashMap(O(1) 查) + 双向链表(O(1) 移到头)**。get 和 put 都要保证 O(1),这就需要哈希直接定位节点 + 链表能 O(1) 摘除并插到头部。**两者缺一不可,缺哈希查变 O(n),缺链表"摘到头"变 O(n)**。

---

## 一、LRU 是什么

**Least Recently Used**:最近最少使用的优先淘汰。

场景:有限容量的缓存,装满后再插要踢一个出去——**踢"最久没被访问的"**。

```
容量 3,操作序列:
  put(1, A)            缓存:[1=A]
  put(2, B)            缓存:[2=B, 1=A]      (左边最近)
  put(3, C)            缓存:[3=C, 2=B, 1=A]
  get(1)               缓存:[1=A, 3=C, 2=B] (1 被访问,移到最前)
  put(4, D)            缓存:[4=D, 1=A, 3=C] (容量满,踢 2)
```

**两个操作都要 O(1)**:
- `get(key)`:返回值,且把 key 移到最前
- `put(key, val)`:写入,如果满了踢最尾

---

## 二、为什么必须是双向链表

**单链表不行**——摘除一个节点需要前驱,单链表找前驱要 O(n)。

双链表每个节点有 `prev` / `next`,**给定节点指针,O(1) 摘除**:

```typescript
function remove(node: Node) {
  node.prev!.next = node.next
  node.next!.prev = node.prev
}
```

---

## 三、为什么必须是哈希表

**只有链表的话,get(key) 要 O(n) 遍历**——查不到 O(1)。

哈希表 `key → node`,直接找到节点位置:

```typescript
const node = map.get(key)  // O(1)
moveToHead(node)           // O(1)
```

---

## 四、LRU 完整实现

```typescript
class Node {
  key: number
  val: number
  prev: Node | null = null
  next: Node | null = null
  constructor(k: number, v: number) { this.key = k; this.val = v }
}

class LRUCache {
  private capacity: number
  private map: Map<number, Node> = new Map()
  private head: Node            // dummy head
  private tail: Node            // dummy tail

  constructor(capacity: number) {
    this.capacity = capacity
    this.head = new Node(0, 0)
    this.tail = new Node(0, 0)
    this.head.next = this.tail
    this.tail.prev = this.head
  }

  get(key: number): number {
    const node = this.map.get(key)
    if (!node) return -1
    this.moveToHead(node)
    return node.val
  }

  put(key: number, val: number): void {
    const existing = this.map.get(key)
    if (existing) {
      existing.val = val
      this.moveToHead(existing)
      return
    }
    if (this.map.size >= this.capacity) {
      // 踢尾(最久未用)
      const lru = this.tail.prev!
      this.remove(lru)
      this.map.delete(lru.key)
    }
    const node = new Node(key, val)
    this.addToHead(node)
    this.map.set(key, node)
  }

  private addToHead(node: Node) {
    node.next = this.head.next
    node.prev = this.head
    this.head.next!.prev = node
    this.head.next = node
  }

  private remove(node: Node) {
    node.prev!.next = node.next
    node.next!.prev = node.prev
  }

  private moveToHead(node: Node) {
    this.remove(node)
    this.addToHead(node)
  }
}
```

**关键设计**:
- **dummy head 和 dummy tail**:消除"插到第一个"和"删最后一个"的边界判断
- **node 里存 key**:踢尾时要从 map 里删,所以节点必须知道自己的 key

---

## 五、用 LinkedHashMap 一行实现(Java)

Java 的 LinkedHashMap 内置了"访问顺序"模式,**继承一下重写一个方法就完事**:

```java
class LRUCache extends LinkedHashMap<Integer, Integer> {
    private int capacity;
    public LRUCache(int capacity) {
        super(capacity, 0.75f, true);  // accessOrder = true
        this.capacity = capacity;
    }
    public int get(int key) {
        return super.getOrDefault(key, -1);
    }
    public void put(int key, int value) {
        super.put(key, value);
    }
    @Override
    protected boolean removeEldestEntry(Map.Entry<Integer, Integer> eldest) {
        return size() > capacity;
    }
}
```

**面试要写完整版,工程要懂这个**——说明 LRU 是太常用以致语言库直接做了支持。

---

## 六、LRU 在工程里出现的地方

### 1. Redis 内存淘汰策略

`maxmemory-policy allkeys-lru` / `volatile-lru`:Redis 内存满时按 LRU 淘汰。

**Redis 的 LRU 是近似的**——它不维护全局双链表(开销太大),而是**随机采样几个 key,挑最久未用的**。`maxmemory-samples 5` 控制采样数,默认 5。**采样 10 已经接近精确 LRU**。

### 2. MySQL InnoDB Buffer Pool

InnoDB 的页缓存用 **Young / Old 双 LRU 列表** —— 防止全表扫描污染热点数据。新加载的页放 Old,只有再次被访问且间隔超过阈值才进 Young。**这是 LRU 的工业级变体**。

### 3. CPU Cache / 操作系统页面置换

操作系统的 Page Replacement 用近似 LRU(精确 LRU 太贵,通常用 Clock 算法或 Aging)。

### 4. Caffeine / Guava 缓存

Java 内存缓存库。Guava 是经典 LRU + 软引用;**Caffeine 用 W-TinyLFU**,实测命中率比 LRU 高很多。

### 5. CDN / 浏览器缓存

资源缓存按 LRU 淘汰。

---

## 七、LRU 的局限:扫描污染

LRU 假设"最近用过的会再用",**但一次大扫描会把整个缓存冲走**:

```
缓存里 99 个热点
来一个全表扫描,加 1000 个新 key
→ 99 个热点全被踢了
```

**解决方案**:
1. **LRU-K**:必须连续访问 K 次才进缓存(防"一次性扫"污染)
2. **2Q**:有"FIFO 队列"和"LRU 队列",新来的进 FIFO,被复访才进 LRU
3. **LFU**(下面讲):按频率,不按时间
4. **InnoDB 的 Young / Old**:就是 2Q 的变体

---

## 八、LFU:Least Frequently Used

**按访问频率淘汰**——少被访问的先走。

直觉:"最近用过"不如"经常用"靠谱。一个被访问 1000 次的页,不该因为 1 分钟没碰被踢掉。

**朴素 LFU**:
- 每个 key 一个计数
- 满了找计数最小的踢

朴素实现 O(N),要 O(1) 需要更巧的结构。

---

## 九、LFU O(1) 实现

**思路**:**双层链表** —— 一层按频率分组,一层链同频率的 key。

```
freq 1:   [keyA, keyB, keyC]   ← 同频率内按 LRU 排
freq 2:   [keyD]
freq 5:   [keyE, keyF]
```

每次访问 keyA:把它从 freq 1 那条移到 freq 2。

满了踢:从 minFreq 那条链尾踢一个。

```typescript
class LFUCache {
  private capacity: number
  private size = 0
  private minFreq = 0
  private keyToVal = new Map<number, number>()
  private keyToFreq = new Map<number, number>()
  private freqToKeys = new Map<number, Set<number>>()  // 同频率用 Set 保序

  constructor(capacity: number) { this.capacity = capacity }

  get(key: number): number {
    if (!this.keyToVal.has(key)) return -1
    this.touch(key)
    return this.keyToVal.get(key)!
  }

  put(key: number, val: number): void {
    if (this.capacity <= 0) return
    if (this.keyToVal.has(key)) {
      this.keyToVal.set(key, val)
      this.touch(key)
      return
    }
    if (this.size >= this.capacity) this.evict()
    this.keyToVal.set(key, val)
    this.keyToFreq.set(key, 1)
    if (!this.freqToKeys.has(1)) this.freqToKeys.set(1, new Set())
    this.freqToKeys.get(1)!.add(key)
    this.minFreq = 1
    this.size++
  }

  private touch(key: number) {
    const freq = this.keyToFreq.get(key)!
    this.freqToKeys.get(freq)!.delete(key)
    if (this.freqToKeys.get(freq)!.size === 0) {
      this.freqToKeys.delete(freq)
      if (freq === this.minFreq) this.minFreq++
    }
    const newFreq = freq + 1
    this.keyToFreq.set(key, newFreq)
    if (!this.freqToKeys.has(newFreq)) this.freqToKeys.set(newFreq, new Set())
    this.freqToKeys.get(newFreq)!.add(key)
  }

  private evict() {
    const keys = this.freqToKeys.get(this.minFreq)!
    const victim = keys.values().next().value as number  // Set 保插入序
    keys.delete(victim)
    if (keys.size === 0) this.freqToKeys.delete(this.minFreq)
    this.keyToVal.delete(victim)
    this.keyToFreq.delete(victim)
    this.size--
  }
}
```

**O(1)** 操作 —— 借助 `Map` + `Set` 的 O(1) 增删 + Set 保插入顺序的特性。Java / C++ 实现需要用 `LinkedHashSet` 保插入顺序。

---

## 十、LRU vs LFU 选择

| 场景 | 选 |
| --- | --- |
| 一般缓存,简单可靠 | **LRU** |
| 访问模式有热点(热的总热) | **LFU** |
| 怕扫描污染 | **LFU / LRU-K / 2Q** |
| 极致命中率 | **W-TinyLFU**(Caffeine 用的) |

**LFU 的坑**:
- **冷启动问题**:新 key 频率为 1,容易被踢,新热点起不来
- **频率衰减问题**:历史曾经热的 key 即使现在不用也"长期霸占"
  - 解决:**频率定期减半**(Aging)

**W-TinyLFU**:用小的"窗口 LRU" 收纳新 key + 大的"主 SLRU" 配 TinyLFU 频率统计 + Count-Min Sketch 估计频率,**结合 LRU 和 LFU 的优点**。Caffeine 的实现,业界事实标准。

---

## 十一、面试与工程的不同

**面试**:手写 LRU 是必备,LFU 是加分项。
**工程**:**别自己写 LRU**——用语言库或成熟缓存框架(Caffeine / Ristretto / Cache.js)。它们处理了过期、并发、内存权重、统计、监控等一堆你不会想自己写的东西。

---

## 十二、一句话总结

> **LRU = HashMap + 双链表,两个 O(1) 操作正好对接两种数据结构的强项**。会写 LRU 是把"哈希查 + 链表插删"组合用的第一道门;**LFU / W-TinyLFU 是为缓解 LRU 的扫描污染设计的进化版**。理解 LRU,缓存这块的算法面试和工程对话都不会再卡。

下一篇讲**限流算法**——固定窗口、滑动窗口、漏桶、令牌桶四种经典实现,以及它们各自的"漏点"。
