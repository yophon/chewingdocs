# 布隆过滤器与 Count-Min Sketch

布隆过滤器(Bloom Filter)和 Count-Min Sketch 是**概率数据结构的代表**——**牺牲一点准确性,换数量级的空间和速度**。判断"用户是否注册过"、"这个 URL 是否爬过"、"这个词出现了多少次"——内存放不下精确数据时,概率结构是工程救星。

> 一句话先记住:**布隆过滤器答 "可能在 / 一定不在",Count-Min Sketch 答 "至少出现这么多次"**。两个都有"假阳性"(没说错时它说对,但说有时可能没有),用对了能省 90% 内存,用错了会误判用户体验。

---

## 一、为什么需要概率数据结构

**精确判存在**:HashSet,空间 O(N),每个元素几十字节。
**1 亿个 URL 判重**:HashSet 至少几个 GB,**不能放进单机内存**。
**布隆过滤器**:**几百 MB 搞定 1 亿,允许 1% 假阳率**。

**经典对话**:
- "这个 URL 我们爬过吗?"
- "布隆说'可能爬过',那大概率爬过,跳过它"
- "万一是假阳性?"——重复爬一次也没事,**业务能容忍**

只要业务能容忍假阳性,就该用布隆。

---

## 二、布隆过滤器的工作原理

**三个零件**:
1. **一个超大的位数组(bitmap)**,初始全 0
2. **k 个不同的哈希函数**
3. **两个操作**:add 和 contains

### add(x)

把 x 用 k 个哈希函数算 k 个位置,**这 k 个位都置 1**。

```
位数组:[0 0 0 0 0 0 0 0 0 0]
add("apple"):
  hash1("apple") = 2
  hash2("apple") = 5
  hash3("apple") = 8
位数组:[0 0 1 0 0 1 0 0 1 0]
```

### contains(x)

把 x 用 k 个哈希函数算 k 个位置,**这 k 个位是不是全 1**。
- 全 1 → **可能存在**(也可能是别人加的)
- 有一位 0 → **一定不存在**

```
contains("apple"):
  位 2 = 1 ✓
  位 5 = 1 ✓
  位 8 = 1 ✓
  → 可能存在 ✓

contains("banana"):
  hash1 = 3 → 位 3 = 0 ✗
  → 一定不存在
```

### 关键不对称性

- **说"在"** → 可能错(假阳性)
- **说"不在"** → 一定对(无假阴性)

**这个不对称是布隆的灵魂**。

---

## 三、参数怎么选

三个变量:
- n:预计存多少元素
- m:位数组大小(bit 数)
- k:哈希函数个数
- p:可接受的假阳率

**最优 k 的公式**:`k = (m/n) · ln(2)`

**给定 n 和 p,m 的最小值**:`m = -n · ln(p) / (ln(2))²`

**经验数字**:
- 1 亿元素,1% 假阳 → 大约 1.2 GB,k = 7
- 1 亿元素,0.1% 假阳 → 大约 1.7 GB,k = 10

**降一个数量级假阳率,空间多 ~50%**。

---

## 四、简易实现

```typescript
class BloomFilter {
  private bits: Uint8Array
  private size: number
  private hashCount: number

  constructor(expectedN: number, falsePositive: number = 0.01) {
    const m = Math.ceil(-expectedN * Math.log(falsePositive) / (Math.log(2) ** 2))
    this.size = m
    this.hashCount = Math.ceil((m / expectedN) * Math.log(2))
    this.bits = new Uint8Array(Math.ceil(m / 8))
  }

  private hash(key: string, seed: number): number {
    let h = seed
    for (let i = 0; i < key.length; i++) {
      h = (h * 31 + key.charCodeAt(i)) >>> 0
    }
    return h % this.size
  }

  add(key: string): void {
    for (let i = 0; i < this.hashCount; i++) {
      const pos = this.hash(key, i + 1)
      this.bits[pos >> 3] |= 1 << (pos & 7)
    }
  }

  contains(key: string): boolean {
    for (let i = 0; i < this.hashCount; i++) {
      const pos = this.hash(key, i + 1)
      if (!(this.bits[pos >> 3] & (1 << (pos & 7)))) return false
    }
    return true
  }
}
```

工程里别自己写——**Guava `BloomFilter`、Redis `BF.ADD` 命令(RedisBloom 模块)** 都比这个稳。

---

## 五、布隆过滤器的应用场景

### 1. 缓存穿透防护

经典场景。用户查一个数据库里没有的 key,缓存 miss → 查 DB → DB 没有 → 不写缓存。下次同样 key 又走一遍——**穿透到 DB**,容易被恶意攻击打爆。

**布隆挡前面**:把 DB 里**所有存在的 key** 预先加进布隆。查询时:
- 布隆说"不在" → 直接返回 not found,不查 DB ✓
- 布隆说"在" → 查 DB(可能假阳浪费一次,可接受)

### 2. 爬虫去重

爬过的 URL 加进布隆,新 URL 先问布隆"爬过吗",**避免重复爬**。允许少量重复(假阳),但绝不漏(无假阴)。

### 3. HBase / Cassandra 的 SSTable

LSM-Tree 里每个 SSTable 文件配一个布隆过滤器,**查询时先问布隆**,布隆说不在就跳过这个文件,不用读磁盘。

### 4. Chrome 浏览器的恶意 URL 检测

Google 维护一个"恶意 URL 黑名单",布隆过滤器版本下发到客户端,**本地秒判 URL 是否疑似恶意**;疑似的再去服务端确认。

### 5. 邮件去重 / 短信去重

营销系统避免给同一用户重复发——布隆+用户 ID 黑名单。

---

## 六、布隆的天然缺陷

### 1. 不能删除

**单纯的布隆位数组,把位置 1 的 bit 置 0 会误删别人**(那一位可能是别的元素也置过 1)。

**解决**:**Counting Bloom Filter** —— 把每位换成小计数器(4-bit 够用),add +1,delete -1,**支持删除**。代价是空间 ×4。

### 2. 假阳率随元素数上升

加得越多,位数组里 1 越多,**假阳率指数级上升**。一旦 m 接近上限,**整个布隆失效**(几乎全是 1,任何 contains 都"在")。

**解决**:动态扩容(**Scalable Bloom Filter**) 或定期重建。

### 3. 不能取出元素

布隆只能"判存在",**不能列出存了什么**。要列就用别的结构。

---

## 七、Cuckoo Filter:布隆的进化

**Cuckoo Filter** 是 2014 年提出的"更好的布隆":
- **支持删除**(原生)
- **空间效率比布隆高 ~25%**(同假阳率下)
- **查询略快**(只需查 2 个位置)

**核心思想**:借鉴 Cuckoo Hashing,每个元素的"指纹"存在两个候选桶之一,冲突时"踢人"重新放置。

**新项目优先 Cuckoo Filter**;布隆只在生态成熟(老库、老 API)时继续用。

---

## 八、Count-Min Sketch:估频率

**问题**:数据流中每个元素出现多少次?**精确算要哈希表 O(unique 元素数) 内存**。

**Count-Min Sketch (CMS)** 用**很小的二维数组 + 多个哈希**估频率:

### 结构

```
       col 0  col 1  col 2  ... col w-1
hash 1   3     1     0          5
hash 2   2     4     1          0
hash 3   0     3     2          4
...
hash d
```

`d` 行,`w` 列(经验:d=4, w=2000)。

### 操作

**add(x)**:
- d 个哈希函数算 d 个列
- 每行的对应列计数 +1

**count(x)**:
- 算 d 个列的值
- **取最小值**返回

### 为什么取 min

哈希冲突会让**计数变大**(别人加进来的也算了)。所以**真实计数 ≤ 任何一行的计数**。**取最小值就是最接近真值的估计**——绝不低估,可能高估一点。

### 误差保证

- **w = e/ε**(ε 是相对误差)
- **d = ln(1/δ)**(δ 是误差超界的概率)
- 例:ε=0.01, δ=0.001 → w=272, d=7,**才几 KB 内存**就能估几亿次访问的频率

---

## 九、Count-Min Sketch 实现

```typescript
class CountMinSketch {
  private table: number[][]
  private d: number
  private w: number

  constructor(epsilon = 0.01, delta = 0.01) {
    this.w = Math.ceil(Math.E / epsilon)
    this.d = Math.ceil(Math.log(1 / delta))
    this.table = Array.from({ length: this.d }, () => new Array(this.w).fill(0))
  }

  private hash(key: string, seed: number): number {
    let h = seed * 0x9e3779b1
    for (let i = 0; i < key.length; i++) {
      h = ((h * 31) + key.charCodeAt(i)) >>> 0
    }
    return h % this.w
  }

  add(key: string, count = 1): void {
    for (let i = 0; i < this.d; i++) {
      this.table[i][this.hash(key, i + 1)] += count
    }
  }

  count(key: string): number {
    let min = Infinity
    for (let i = 0; i < this.d; i++) {
      min = Math.min(min, this.table[i][this.hash(key, i + 1)])
    }
    return min
  }
}
```

---

## 十、Count-Min Sketch 应用

### 1. 找 Top K 频繁元素(Heavy Hitters)

**数据流场景**:经过千亿条记录,找最热的 1000 个 URL / 关键词。
**朴素**:全量计数,内存炸。
**CMS + 小根堆**:CMS 估频率,堆维护 Top K。Caffeine 用这招。

### 2. 网络流量统计

每个源 IP 流量,**精确统计内存爆炸**——CMS 几 MB 解决。

### 3. 数据库查询计划

PostgreSQL 9.5+ 用 CMS 的变体估某个值出现的频率,辅助优化器选索引。

### 4. 推荐系统冷启动

新用户对各类目兴趣度的"草稿统计"。

### 5. W-TinyLFU 缓存

LFU 计数用 CMS 估,**省下精确频率表的巨大空间**。Caffeine 缓存命中率领先 LRU 的关键技术。

---

## 十一、概率结构家族

| 结构 | 解决什么 | 关键不对称 |
| --- | --- | --- |
| Bloom Filter | 判存在 | 假阳性,无假阴性 |
| Cuckoo Filter | 判存在 + 删除 | 同上 |
| Count-Min Sketch | 估频率 | 高估,不低估 |
| HyperLogLog | 估基数(unique 个数) | 偏差 ≤ 2% |
| Quotient Filter | 判存在 + 顺序遍历 | 同布隆 |
| MinHash | 估集合相似度 | 概率近似 |
| t-digest | 估分位数(p99) | 高精度近似 |

**这一类工具的共同哲学**:**精确不可能时,提供"概率上够用"的近似**。

---

## 十二、一句话总结

> **概率数据结构 = 牺牲精度换空间**。布隆判存在(可能误说"在",绝不漏说"不在"),CMS 估频率(可能高估,绝不低估),HLL 估基数。**业务能容忍小误差时,内存能省一两个数量级**——这是工程里最划算的交换之一。

下一篇讲**调度算法**——时间轮、优先队列、工作窃取,操作系统和应用框架背后的"任务安排"机制。
