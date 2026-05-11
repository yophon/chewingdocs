# BST / AVL / 红黑树

二叉搜索树(BST)是**给二叉树加了"有序"这一个性质,立刻获得 O(log n) 的查找能力**——听起来像魔法,背后只有一条不变量:**左子树所有值 < 根 < 右子树所有值**。但它有个致命问题:**插入顺序不好就退化成链表**,O(log n) 塌成 O(n)。AVL 和红黑树是**为这个问题打的补丁**——用"旋转"强制维持平衡,是无数高级数据结构的地基。

> 一句话先记住:**BST 天生会退化,红黑树是工程界普遍使用的平衡 BST**——Java TreeMap、C++ std::map、Linux 进程调度器、epoll 内核实现全用它。AVL 平衡更严但维护更贵,实际场景红黑树胜出。

---

## 一、BST 的定义与操作

```typescript
class TreeNode {
  val: number
  left: TreeNode | null = null
  right: TreeNode | null = null
  constructor(v: number) { this.val = v }
}
```

**不变量**:对每个节点,`left.val < val < right.val`(且子树递归满足)。

### 查找 O(log n) 平均,O(n) 最坏

```typescript
function search(root: TreeNode | null, target: number): TreeNode | null {
  if (!root || root.val === target) return root
  return target < root.val
    ? search(root.left, target)
    : search(root.right, target)
}
```

每层往左或往右走,**每次排除一半**——跟二分查找是同一个心智。

### 插入

```typescript
function insert(root: TreeNode | null, val: number): TreeNode {
  if (!root) return new TreeNode(val)
  if (val < root.val) root.left = insert(root.left, val)
  else if (val > root.val) root.right = insert(root.right, val)
  return root
}
```

### 删除(三种情况,最麻烦)

```typescript
function deleteNode(root: TreeNode | null, val: number): TreeNode | null {
  if (!root) return null
  if (val < root.val) root.left = deleteNode(root.left, val)
  else if (val > root.val) root.right = deleteNode(root.right, val)
  else {
    // 找到要删的节点
    if (!root.left) return root.right    // 1. 无左子 → 右子顶上
    if (!root.right) return root.left    // 2. 无右子 → 左子顶上
    // 3. 左右都有:找右子树最小节点替换,然后删那个
    let succ = root.right
    while (succ.left) succ = succ.left
    root.val = succ.val
    root.right = deleteNode(root.right, succ.val)
  }
  return root
}
```

**删除复杂的原因**:删掉的节点如果两个子都有,要找**中序后继**(右子树最小值)来顶上,才能保持 BST 性质。

---

## 二、BST 的致命弱点:退化

按 `1, 2, 3, 4, 5` 顺序插入:

```
1
 \
  2
   \
    3
     \
      4
       \
        5
```

**彻底退化成链表**,查找 O(n)。在**数据有序或接近有序的场景下**,BST 是灾难。

**解法**:**自平衡 BST**——每次插入 / 删除后,**旋转**让树重新变矮。核心操作就一个:旋转。

---

## 三、旋转:平衡 BST 的唯一武器

### 左旋

```
     X                   Y
      \                 / \
       Y       →       X   C
      / \               \
     B   C               B
```

`X.right = Y`,旋转后 `Y.left = X`。

### 右旋

```
       X                Y
      /                / \
     Y         →      A   X
    / \                  /
   A   B                B
```

对称。

**旋转后 BST 性质不变**(因为左 < 根 < 右依然成立),但**树的高度可能变化**。平衡树就是利用这点,把"高"的一侧转低。

---

## 四、AVL:严格平衡

**规则**:每个节点的**左右子树高度差 ≤ 1**。

**插入 / 删除后**从底往上回溯,遇到"不平衡"的节点做旋转。不平衡有四种情况:

| 情况 | 形状 | 怎么转 |
| --- | --- | --- |
| LL | 左子的左子过高 | 右旋 |
| RR | 右子的右子过高 | 左旋 |
| LR | 左子的右子过高 | 先左旋左子,再右旋当前 |
| RL | 右子的左子过高 | 先右旋右子,再左旋当前 |

AVL 保证**严格 O(log n)**,查找快。

**但**:插入 / 删除可能触发多次旋转,**写入密集场景下维护成本高**。所以真实工程用得少。

---

## 五、红黑树:平衡的"差不多就行"

红黑树放松了 AVL 的"严格平衡",改成"**近似平衡**"——树高最多是 `2·log(n+1)`,比 AVL 的 `1.44·log(n+1)` 略高,但**插入删除的旋转次数大幅减少**。

### 五条规则

1. 每个节点是**红或黑**
2. **根节点是黑**
3. **所有叶子(NIL 空节点)是黑**
4. **红节点的孩子必须是黑**(不能两红相连)
5. **任何路径从根到叶子,经过的黑节点数相同**(黑高相等)

**后果**:最长路径最多是最短路径的 2 倍(最短全黑,最长红黑交替)。

### 为什么这五条规则能保证近平衡

- 规则 4:红节点不能相连 → 红节点最多占路径一半
- 规则 5:黑节点数相同 → 所有路径差不多长

不用严格背证明,**直觉:红黑相间,黑数相等,自然就不会有一边长得离谱**。

### 红黑树 vs AVL 对比

| 维度 | AVL | 红黑树 |
| --- | --- | --- |
| 平衡严格度 | 高度差 ≤ 1 | 最长 ≤ 2·最短 |
| 查找速度 | 略快 | 略慢 |
| 插入删除旋转 | 多 | 少 |
| 实现复杂度 | 中等 | 复杂(规则多) |
| 适合场景 | 读多写少 | **通用**(读写都多) |

**工程界胜者:红黑树**。Java、C++、Linux 内核全用。

---

## 六、红黑树在工程里的身影

### 1. Java TreeMap / TreeSet

`java.util.TreeMap` 的底层就是红黑树。按 key 有序,范围查询 O(log n),迭代按顺序。

### 2. Java 8 HashMap 的树化

链表长度 > 8 时转红黑树。**HashDoS 攻击的防御**。

### 3. C++ std::map / std::set

标准库的有序映射全部用红黑树。

### 4. Linux 进程调度器(CFS)

完全公平调度(Completely Fair Scheduler)用红黑树按"运行时间"排序,**总是 O(log n) 找到"最少运行的进程"** 去调度。

### 5. Linux epoll

`epoll_ctl` 注册的 fd 用红黑树存,**O(log n) 增删查**,事件触发时一次 O(1) 拉出就绪列表。

### 6. nginx 定时器

按过期时间排序的红黑树,每次取最小的就是下一个要到期的。

**你今天用的每一个服务,背后都有红黑树在工作**。

---

## 七、平衡 BST 的替代者们

红黑树好用,但实现复杂(几百行代码,调 bug 到怀疑人生)。**工程里很多场景宁可用别的结构**:

### 跳表(Skip List)

Redis zset、LevelDB、etcd 用跳表替代红黑树。

**优势**:实现简单 10 倍、无锁并发友好、范围查询自然(从底层链表直接走)。
**代价**:空间开销更大(多层索引)。

### B+ 树

MySQL InnoDB、PostgreSQL 用 B+ 树做索引。

**为什么不用红黑树**:红黑树节点少、磁盘 I/O 次数多。B+ 树一个节点装几百个 key,树高 3-4 层能索引千万级数据,**一次查询最多 3-4 次磁盘 I/O**。

**B+ 树的要点**:
- 每个节点可以存多个 key + 多个子指针(不是二叉)
- 所有数据在叶子层,叶子间用链表连
- 适合**外存/磁盘**场景

---

## 八、BST 面试高频套路

### 1. 中序遍历得升序

看到"BST + 第 k 小"、"BST + 区间内元素",立刻想中序。

```typescript
function kthSmallest(root: TreeNode | null, k: number): number {
  const stack: TreeNode[] = []
  let cur = root
  while (cur || stack.length > 0) {
    while (cur) { stack.push(cur); cur = cur.left }
    cur = stack.pop()!
    if (--k === 0) return cur.val
    cur = cur.right
  }
  return -1
}
```

### 2. 判断一棵树是不是 BST

**坑**:不是只比父子,要比整个子树的范围。

```typescript
function isValidBST(root: TreeNode | null, min = -Infinity, max = Infinity): boolean {
  if (!root) return true
  if (root.val <= min || root.val >= max) return false
  return isValidBST(root.left, min, root.val) && isValidBST(root.right, root.val, max)
}
```

### 3. BST 的 LCA

利用有序性比通用 LCA 更高效:

```typescript
function bstLca(root: TreeNode, p: TreeNode, q: TreeNode): TreeNode {
  while (root) {
    if (p.val < root.val && q.val < root.val) root = root.left!
    else if (p.val > root.val && q.val > root.val) root = root.right!
    else return root  // p 和 q 分别在两侧
  }
  return root!
}
```

**迭代写法,O(log n) 时间、O(1) 空间**。

---

## 九、一句话总结

> **BST 用"左小右大"换 O(log n),但会退化;AVL 严格平衡但维护贵;红黑树是"差不多平衡"的工程最优解**。你不需要手写红黑树(一辈子可能写不出正确版本),但要知道它长什么样、为什么这么设计——因为你每天用的数据库、操作系统、标准库里全是它。

下一篇讲**堆与优先队列**——"永远拿最大/最小"这个需求衍生出的神器,Top K / 调度 / Dijkstra 都离不开它。
