# Trie 字典树

Trie(念 "try",也叫前缀树)是**为"前缀查询"量身定做的树**。查询"以 `app` 开头的所有单词"这种事,用哈希表得 O(n) 全扫,Trie 只需要 O(前缀长度)。自动补全、拼写检查、IP 路由、敏感词过滤全靠它。学 Trie 的真正收获,**不是记一个数据结构,是理解"用结构共享前缀"这个思想**——后面 AC 自动机、后缀数组、radix tree 都是它的亲戚。

> 一句话先记住:**Trie 把所有字符串的公共前缀共享在一条路径上**。存 "app"、"apple"、"april",三个单词在 Trie 里只共享一条 "a-p" 路径,节省空间还天然支持前缀查询——**一个结构解决两个问题**。

---

## 一、Trie 的结构

```
存 ["app", "apple", "april"]:

         root
          |
          a
          |
          p
         / \
        p   r
       /|   |
      * l   i
        |   |
        e   l
        |   |
        *   *

* 标记一个词的结束
```

**每个节点代表一个字符**,从根到某个 `*` 节点的路径拼起来就是一个存进去的单词。

### 节点定义

```typescript
class TrieNode {
  children: Map<string, TrieNode> = new Map()
  isEnd: boolean = false
}

class Trie {
  root = new TrieNode()

  insert(word: string): void {
    let cur = this.root
    for (const c of word) {
      if (!cur.children.has(c)) cur.children.set(c, new TrieNode())
      cur = cur.children.get(c)!
    }
    cur.isEnd = true
  }

  search(word: string): boolean {
    const node = this.findNode(word)
    return node !== null && node.isEnd
  }

  startsWith(prefix: string): boolean {
    return this.findNode(prefix) !== null
  }

  private findNode(s: string): TrieNode | null {
    let cur = this.root
    for (const c of s) {
      if (!cur.children.has(c)) return null
      cur = cur.children.get(c)!
    }
    return cur
  }
}
```

**复杂度**:插入 / 查找 / 前缀检查都是 **O(word.length)**,跟 Trie 里有多少词**无关**。

---

## 二、为什么 `isEnd` 标记很重要

不加 `isEnd`,你没法区分"app 存了"还是"app 只是 apple 的前缀"。

```
search("app") 应该返回:
  - true  (如果确实存了 "app")
  - false (如果只存了 "apple",没存 "app")
```

**`isEnd` 是 Trie 里最容易忘的细节**,忘了 100% 写错。

---

## 三、存储优化:数组 vs 哈希

### 数组版(ASCII 小写字母 26 个)

```typescript
class TrieNode {
  children: (TrieNode | null)[] = new Array(26).fill(null)
  isEnd: boolean = false
}

// 查找
const idx = c.charCodeAt(0) - 97
if (!cur.children[idx]) return null
cur = cur.children[idx]
```

**优点**:O(1) 子节点访问,比 Map 快。
**缺点**:每个节点固定 26 个指针位置,**空间浪费严重**——尤其 Unicode 要几万个,直接炸。

### 哈希版

```typescript
children: Map<string, TrieNode> = new Map()
```

**空间按实际分支数**,Unicode / 大字符集友好。略慢一点(哈希开销)。

### 压缩 Trie(Radix Tree)

**合并只有一个子的链式节点**:

```
原来:
  a → p → p → l → e
压缩:
  "apple"  (一个节点)
```

**极大节省空间**。Linux 内核的路由表、Redis 的 rax 树、etcd 都用 Radix Tree。
**代价**:实现复杂,插入 / 删除时要处理分裂和合并。

---

## 四、经典应用

### 1. 自动补全 / 搜索建议

用户输入 "app",返回所有以 "app" 开头的词。

```typescript
function autocomplete(trie: Trie, prefix: string): string[] {
  const node = trie.findNode(prefix)
  if (!node) return []
  const result: string[] = []
  function dfs(n: TrieNode, path: string) {
    if (n.isEnd) result.push(path)
    for (const [c, child] of n.children) {
      dfs(child, path + c)
    }
  }
  dfs(node, prefix)
  return result
}
```

**步骤**:找到前缀对应的节点 → 从那开始 DFS 收集所有词。

### 2. 拼写检查 / 编辑距离搜索

从 Trie 里找"离目标单词编辑距离 ≤ k"的所有词。比暴力对比字典快得多,因为**错误分支可以尽早剪掉**。

### 3. IP 路由表(最长前缀匹配)

路由表要找"匹配当前 IP 的最长前缀"。IP 拆成二进制位,建 Trie。

```
存 10.0.0.0/8 → 接口 eth0
存 10.1.0.0/16 → 接口 eth1

查询 10.1.2.3:
  沿着二进制位走 Trie,遇到标记的节点就记下,
  走不下去时返回最深的那次标记
```

**Linux 内核的 FIB 就是压缩 Trie 的变种**。

### 4. 敏感词过滤(AC 自动机)

**AC 自动机 = Trie + KMP 的 fail 指针**。

- 先把所有敏感词建成 Trie
- 给每个节点加 fail 指针(类似 KMP 的 next 数组)
- 一次扫描文本,**同时匹配所有敏感词**

**复杂度 O(文本长度 + 模式总长度)**,是多模式匹配的天花板。

实现较复杂,工程里直接用 `ahocorasick` 库(几乎每种语言都有)。

### 5. 字符串集合去重 / 前缀统计

问"给定一堆字符串,有多少是别的串的前缀?"——Trie 一遍搞定。

---

## 五、Trie 上的 DFS / BFS

Trie 本质是个树,**树上能做的事,Trie 都能做**:

- 找最长 / 最短的词 → DFS
- 按字典序输出所有词 → 先序遍历(子节点按字符顺序)
- 前缀匹配数量 → 每个节点维护一个 `count` 字段

**给节点加辅助字段**是 Trie 的常见技巧:

```typescript
class TrieNode {
  children: Map<string, TrieNode> = new Map()
  isEnd: boolean = false
  count: number = 0       // 经过这个节点的词数
  wordCount: number = 0   // 以这里结尾的词数
}
```

---

## 六、空间开销的现实

Trie 最大缺点:**空间**。

存 10 万个平均长 10 的单词,节点数最坏 100 万,每节点一个 Map,开销远大于"直接把 10 万个字符串装哈希表"。

**优化方向**:
1. **压缩 Trie**(合并链式节点)
2. **双数组 Trie**(DAT,工业级中文分词用)
3. **DAWG**(有向无环词图,共享后缀)

真实工程选型:
- 词典小(万级) → 普通 Trie
- 路由 / 敏感词过滤 → AC 自动机或 Aho-Corasick 库
- 百万词的搜索引擎 → 倒排索引(不是 Trie)
- 嵌入式 / 压缩内存 → DAT 或 DAWG

---

## 七、和哈希表的对比

| 操作 | 哈希表 | Trie |
| --- | --- | --- |
| 插入单词 | O(L)(L=词长) | O(L) |
| 查询单词 | O(L) | O(L) |
| 前缀查询 | **O(n)** 扫整个表 | **O(L)** |
| 遍历有序 | ❌ | ✅ 按字典序 |
| 空间 | 紧凑 | 大(节点多) |
| 公共前缀存储 | 全部重复 | 共享 |

**选型决策**:
- 只做精确查询 → 哈希表(更快更省)
- 要前缀匹配 / 字典序遍历 → Trie
- 要最长前缀匹配 → 必须 Trie

---

## 八、面试题型模板

Trie 面试题就三种套路:

### 模板 1:标准实现题

"实现 Trie 的 insert / search / startsWith"——背模板,熟到 5 分钟写完。

### 模板 2:结合 DFS 搜索

"单词搜索 II"(2D 字母网格里找字典词):
- 把字典存 Trie
- 网格里做 DFS,**沿着 Trie 走**——只在 Trie 有对应子节点时继续
- 碰到 `isEnd` 就记一次

这种"**DFS × Trie**" 是经典组合——剪枝效果极强。

### 模板 3:位 Trie

**把整数拆成二进制位**当字符,建 Trie。用于:
- 异或最大值(每一位贪心选相反的)
- 子集枚举
- 范围异或

---

## 九、一句话总结

> **Trie 用"共享前缀"换"前缀查询 O(L)"**。它不是省空间的结构,是**为特定查询特化的结构**——就像堆特化最值、哈希特化精确查。见到"前缀"、"以...开头"、"多模式匹配",就是 Trie 的地盘。

下一篇讲**并查集**——极简结构、极强能力,几行代码解一大类"连通性 / 分组" 问题。
