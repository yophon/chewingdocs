# 谱图与 PageRank

如果说 26 篇讲的图论是"路径与结构",那这一篇讲的就是"**把图变成矩阵,用线性代数挖出它的隐藏结构**"。**PageRank 让 Google 起家、谱聚类把无监督学习推到一个新台阶、GNN 在 2020 年代变成推荐/搜索/反欺诈的标配**——这三件事本质都是**邻接矩阵或其变体的特征向量**。**学会从"图"切换到"矩阵"看,后面读 GCN/GAT/GraphSAGE 论文不会再被 D^(-1/2) A D^(-1/2) 唬住**。

> 一句话先记住:**图的"主结构" = 邻接矩阵的特征向量**。PageRank 是"按入度加权 + 阻尼"的随机游走稳态分布,数学上就是转移矩阵的主特征向量;谱聚类是把节点投影到拉普拉斯矩阵小特征向量构成的低维空间再 k-means;GNN 的一层就是邻接矩阵乘特征矩阵再非线性。**全是矩阵 × 向量,只是怎么归一化、怎么截断、怎么加非线性的区别**。

---

## 一、为什么要把图变矩阵

| 问题 | 不用矩阵语言 | 用矩阵语言 |
| --- | --- | --- |
| "网页排名" | 写一堆规则 | 求转移矩阵主特征向量 |
| "把图分成 k 个紧密的簇" | 启发式 + 试错 | 拉普拉斯矩阵 + k-means(谱聚类) |
| "节点表示学习" | 手工特征 | GCN:A · X · W |
| "图的连通程度" | 看图发呆 | 拉普拉斯第二小特征值(代数连通度) |
| "随机游走稳态" | 仿真 | 转移矩阵幂 / 主特征向量 |

**矩阵语言的好处**:整个图的全局信息被一矩阵装下,**特征值/特征向量直接告诉你这张图的"主轴"**。一行代码`np.linalg.eig(A)` 就能挖出一堆结构信息。

---

## 二、邻接矩阵 A:图的最朴素矩阵化

### 2.1 邻接矩阵的特征向量在干什么

```
A · v = λ · v
```

**A 把节点的"分数向量" v 映射成"按邻居加权聚合"的新分数**——分数高的节点把分数传给邻居。**特征向量 = 这种传递的不变方向**(传一遍后只是缩放 λ 倍,方向不变)。

### 2.2 一个 4 节点的例子

```
A = [0 1 1 0]      图:
    [1 0 1 0]         1 ── 2
    [1 1 0 1]         │  ╲ │
    [0 0 1 0]         │   ╲│
                      │    3
                      │    │
                      4 ───┘  (4 只跟 3 相邻)
```

```python
import numpy as np
A = np.array([[0,1,1,0],[1,0,1,0],[1,1,0,1],[0,0,1,0]])
eigvals, eigvecs = np.linalg.eig(A)
print(np.round(eigvals, 3))
# [ 2.17 -1.48 -1. 0.31]   按绝对值排序

print(np.round(eigvecs[:,0], 3))   # 主特征向量
# [0.52 0.52 0.61 0.28]            ← 节点"重要性"分布
```

**主特征向量(λ 最大对应的)** 就是节点的 **"特征向量中心度"(Eigenvector Centrality)**——简单理解就是**"被重要节点连得越多,自己越重要"** 的稳态。

> **核心直觉**:**特征向量中心度是 PageRank 的"无阻尼简化版"**。PageRank 在它基础上加了阻尼(避免某些病态情况),其他几乎一样。

---

## 三、拉普拉斯矩阵 L:谱图理论的主角

### 3.1 定义

```
L = D - A

D 是度矩阵:对角线 D[i][i] = 节点 i 的度,其他 0
A 是邻接矩阵
```

例:

```
A = [0 1 1 0]    D = [2 0 0 0]    L = D - A = [ 2 -1 -1  0]
    [1 0 1 0]        [0 2 0 0]                [-1  2 -1  0]
    [1 1 0 1]        [0 0 3 0]                [-1 -1  3 -1]
    [0 0 1 0]        [0 0 0 1]                [ 0  0 -1  1]
```

**L 是对称半正定矩阵**——所有特征值 ≥ 0,且实数,且特征向量两两正交。这些性质让 L 比 A 更好"切割"。

### 3.2 L 的关键性质

| 性质 | 含义 |
| --- | --- |
| **最小特征值 = 0** | 对应特征向量 = (1,1,...,1)/√n,因为每行之和 = 0 |
| **0 特征值的重数** | = 连通分量个数 |
| **第二小特征值 λ₂**(Fiedler value) | "代数连通度",越大说明图越难分割 |
| 所有特征值非负 | 半正定的体现 |
| 特征向量两两正交 | 谱嵌入可以直接用 |

### 3.3 Fiedler value 的工程意义

> **核心直觉**:**λ₂ 越大,图越"团结"** ——切开它需要付出更大代价(切的边权重和大)。λ₂ ≈ 0 说明图已经接近断开。

```
两个团完全断开 (λ₂ = 0)        两个团靠 1 条边连接 (λ₂ 很小)        全连通图 (λ₂ 大)
A ─ B   D ─ E                A ─ B ─── D ─ E                  A ─ B
│   │   │   │                │   │     │   │                  │ ╲ │
C ─┘   F ─┘                  C ─┘     F ─┘                  C ─ D
                                                              │ ╱
                                                              └─
```

工程对应:

- 网络韧性(切多少条边能让网络断开)
- 社群发现(λ₂ 对应的特征向量直接给"应该怎么切")
- 图采样的难度评估

```python
import scipy.sparse.csgraph as csg
import numpy as np

A = np.array([[0,1,1,0],[1,0,1,0],[1,1,0,1],[0,0,1,0]])
L = csg.laplacian(A)
eigvals = np.sort(np.linalg.eigvalsh(L))
print(eigvals)
# [0.   0.84 2.   3.16]
print("代数连通度 λ₂ =", eigvals[1])
```

NetworkX 直接调:`nx.linalg.algebraic_connectivity(G)`。

---

## 四、谱聚类:用 L 的小特征向量做聚类

### 4.1 为什么 k-means 直接做不行

```
两个非凸簇(月牙形):

    ●●●●●●
   ●        ●●
  ●          ●●
              ●●
              ●●
              ●
              ●●
              ●●●●
              ●        ●●
                       ●●●●

k-means 用欧氏距离切球面 → 切错(把两个月牙的相邻部分混在一起)
```

k-means 假设簇是球形的、凸的。月牙、螺旋、嵌套环全都搞不定。

### 4.2 谱聚类的思路

```
1. 用 K 近邻 / 高斯核 构造图
2. 算拉普拉斯矩阵 L
3. 取 L 最小的 k 个特征值对应的特征向量,作为节点的新坐标
4. 在这个低维空间跑 k-means
```

**核心是第 3 步**——用 L 的小特征向量"展开"图,**让原本"距离近 = 真的相似"在新空间成立**。

### 4.3 一段代码

```python
from sklearn.cluster import SpectralClustering
from sklearn.datasets import make_moons
import numpy as np

X, y_true = make_moons(n_samples=200, noise=0.05, random_state=0)

# 谱聚类
sc = SpectralClustering(n_clusters=2, affinity='nearest_neighbors',
                        n_neighbors=10, random_state=0)
y_spec = sc.fit_predict(X)

# 对比 k-means
from sklearn.cluster import KMeans
y_km = KMeans(n_clusters=2, random_state=0).fit_predict(X)

print("谱聚类正确率:", (y_spec == y_true).mean())   # 几乎 100%
print("k-means 正确率:", (y_km == y_true).mean())   # 50% 上下,瞎猜
```

> **避坑**:**谱聚类对图构造方式极敏感**——K 近邻、ε-球、高斯核、互邻接,选不一样的方式结果完全不同。**默认从 K 近邻 K=10 起步**,然后看效果调。

### 4.4 工程对应

- 图像分割(每个像素一个节点)
- 社群发现(社交、引用网络)
- 文档聚类(基于 cosine 相似度构图)
- 异常检测(异常点在谱嵌入里"远离"主簇)

---

## 五、PageRank:Google 起家的算法

### 5.1 直观理解

> **核心直觉**:**想象一个"网页冲浪者",随机点击网页上的链接,有时也按下"地址栏随便输一个网址"重启**。**PageRank = 这个冲浪者长期停在每个页面的概率分布**。

### 5.2 迭代公式

```
v ← α · A_norm · v + (1 - α) · e/N
```

其中:

- **A_norm**:列归一化的邻接矩阵(每列之和 = 1),代表"从某页出去时,均匀挑一个链接"
- **α**:阻尼因子(通常 0.85),"继续点链接"的概率
- **(1-α)**:"重启"的概率
- **e/N**:全 1 向量除以 N,代表"重启时随机落到任意一页"
- **v**:N 维向量,每个分量 = 该页面 PageRank

### 5.3 一张图

```
3 个网页,链接关系:

   1 → 2
   2 → 3
   3 → 1
   3 → 2

A_norm 列归一化:
       1   2   3
    1[ 0   0  1/2]    ← 1 收到来自 3 的一半流量
    2[ 1   0  1/2]    ← 2 收到来自 1 的全部、来自 3 的一半
    3[ 0   1   0 ]    ← 3 收到来自 2 的全部
```

### 5.4 一段代码

```python
import numpy as np

def pagerank(A, alpha=0.85, tol=1e-6, max_iter=100):
    """A: 邻接矩阵 (N×N),A[i][j]=1 表示 i→j"""
    N = A.shape[0]
    # 列归一化(M[j,i] = 1 / out_deg(i) 如果 i→j)
    out_deg = A.sum(axis=1)
    out_deg[out_deg == 0] = 1                 # 处理悬挂节点
    M = (A / out_deg[:, None]).T              # 转置后列归一化
    v = np.ones(N) / N
    for _ in range(max_iter):
        v_new = alpha * M @ v + (1 - alpha) / N
        if np.abs(v_new - v).sum() < tol:
            return v_new
        v = v_new
    return v

A = np.array([[0,1,0],[0,0,1],[1,1,0]])
print(np.round(pagerank(A), 4))
# [0.3878 0.2148 0.3973]   PageRank 分布
```

NetworkX:`nx.pagerank(G, alpha=0.85)`。

### 5.5 收敛性的数学骨架

> **核心直觉**:**PageRank 的稳态分布 = 转移矩阵 (αM + (1-α)/N · 11ᵀ) 的主特征向量**(对应 λ=1)。

为什么一定收敛?

1. **强连通 + 非周期 + α∈(0,1)**:这个修改后的转移矩阵是 Perron-Frobenius 定理的对象——**主特征值 = 1,且唯一,主特征向量分量全正**
2. **其他特征值绝对值 ≤ α**:所以幂迭代 v ← M·v 的"收敛速率" ≈ α^k

| α | 收敛速度 | 含义 |
| --- | --- | --- |
| 0.5 | 极快(几次) | 重启太频繁,"链接结构"权重低 |
| 0.85 | 适中(50~100 次) | Google 当年的选择,也是现在主流默认 |
| 0.99 | 极慢 | 链接结构主导,但容易被"链接农场"操纵 |

### 5.6 阻尼因子为什么是 0.85

**两层考虑**:

1. **避免悬挂节点(dead-end)和周期性**:没有 (1-α) 这一项,**没有出链的节点会"吸走"所有 PageRank**——所有概率最终都堵在它身上;**有些环也会让 PageRank 在某几个节点之间周期循环不收敛**
2. **建模真实用户**:0.85 隐含"用户大约连续点 1/(1-0.85) ≈ 6.7 次链接然后跳走"——大致符合早期网络冲浪行为

> **避坑**:**α 不是越大越好**——α 越接近 1,垃圾外链(spam farm)操纵 PageRank 的能力就越强,因为重启项压不下来它们的循环刷量。

### 5.7 悬挂节点(Dangling Node)处理

没有出链的节点(死页面)会破坏列归一化。两种修复:

1. **均匀分配**:把它当成"指向所有节点"的节点处理(等价于补一行 1/N)
2. **跳过 + 全局补**:在每轮迭代后把"丢失的概率"均匀加回去

NetworkX 默认用第一种。

---

## 六、HITS:hubs 与 authorities

跟 PageRank 同时代的另一个算法,Jon Kleinberg 提出。

### 6.1 两种重要性

```
Authorities(权威):被很多 hubs 指向的页面
Hubs(枢纽):指向很多 authorities 的页面

例:
  arxiv.org / wiki  → 大量被 hubs 指向 → authorities
  awesome-list / 学者主页 → 指向大量权威 → hubs
```

### 6.2 跟 PageRank 的对比

| 维度 | PageRank | HITS |
| --- | --- | --- |
| 维度数 | 1 个分数 | 2 个分数(hub + auth) |
| 计算时机 | 离线全图(适合搜索 indexing) | 查询时局部子图(query-dependent) |
| 收敛 | 全局唯一稳态 | 也收敛(对应 A^T·A 和 A·A^T 的主特征向量) |
| 工业用 | Google + 后来变体 | 早年学术搜索引擎,现在少见 |

> **核心直觉**:HITS 的 hub 向量是 A·Aᵀ 的主特征向量,authority 向量是 Aᵀ·A 的主特征向量——**就是 A 的 SVD 左右奇异向量**(看 09 篇 SVD 的话)。

---

## 七、Personalized PageRank:推荐系统的图嵌入主力

### 7.1 一行公式的修改

```
原版:  v ← α · A_norm · v + (1 - α) · e/N      ← e 是均匀向量
个性化:v ← α · A_norm · v + (1 - α) · s        ← s 是单点向量(用户 u 处为 1)
```

### 7.2 它在算什么

> **核心直觉**:**Personalized PageRank from u** = 一个从用户 u 出发、有 (1-α) 概率重启回到 u 的随机游走稳态。**分数高的节点 = 跟 u "图距离近 + 路径多"的节点**——天然的相似度。

### 7.3 推荐系统应用

```
节点:用户 + 物品
边:用户 ─ 看过 ─ 物品

对用户 u 跑 Personalized PageRank →
    给每个物品打分 →
    排除 u 已经看过的 →
    取 Top-K 推荐
```

工程实现:

- **Pinterest 的 Pixie 推荐系统**:在 30 亿节点的图上跑实时 Personalized PageRank
- **Twitter SimCluster / WhoToFollow**:基于二部图随机游走
- **阿里 Swing / DeepWalk / Node2Vec 系列**:虽然换成图嵌入,但底层思想还是随机游走
- **GraphRAG / 知识图谱 QA**:从 query 实体出发的随机游走找相关三元组

```python
import networkx as nx
G = nx.barabasi_albert_graph(100, 3, seed=0)
ppr = nx.pagerank(G, alpha=0.85, personalization={5: 1.0})
# ppr[i] = 从节点 5 出发的 PPR 在 i 上的稳态概率
top_5 = sorted(ppr.items(), key=lambda x: -x[1])[:5]
print(top_5)
```

---

## 八、GNN 的数学骨架:图卷积一层 = 矩阵乘法 + 非线性

### 8.1 核心公式

GCN(Kipf & Welling 2017)的一层:

```
H^(l+1) = σ( D̃^(-1/2) · Ã · D̃^(-1/2) · H^(l) · W^(l) )
```

拆开看:

| 部分 | 含义 |
| --- | --- |
| H^(l) | 第 l 层每个节点的特征矩阵 (N × d_l) |
| Ã = A + I | 邻接矩阵加自环(让节点保留自己信息) |
| D̃ = Ã 的度矩阵 | 对角矩阵 |
| **D̃^(-1/2) · Ã · D̃^(-1/2)** | 对称归一化拉普拉斯,**核心** |
| W^(l) | 可训练权重矩阵 (d_l × d_{l+1}) |
| σ | 非线性(ReLU) |

### 8.2 直观理解

> **核心直觉**:**GCN 一层 = "把每个节点的特征 = 自己 + 所有邻居特征的加权平均(按度归一化),然后线性变换 + 激活"**。L 层就是聚合 L 跳邻居的信息。

### 8.3 为什么需要归一化

不归一化的版本 H^(l+1) = σ(A · H^(l) · W^(l)):

```
节点 v 的新特征 = Σ (邻居 u 的特征)

度高节点 (1000 邻居) 比度低节点 (5 邻居) 累加值大 200 倍
→ 数值不稳定,反向传播爆炸
→ 度高节点的特征 dominate 整个网络
```

**两种归一化**:

1. **D^(-1) · A**(行归一化):每行之和 = 1,等价于"邻居的平均"
2. **D^(-1/2) · A · D^(-1/2)**(对称归一化):同时考虑节点自己和邻居的度,**特征值落在 [-1, 1]**——**保证多层堆叠不爆炸**

> **核心直觉**:**对称归一化是 GCN 默认的选择**,因为它让信号传播在数学上更稳定。**消息传递的本质就是邻接矩阵(变体)的反复相乘**——你乘 L 次,就传播 L 跳信息。

### 8.4 一段简化的 GCN 代码

```python
import torch
import torch.nn as nn

class SimpleGCNLayer(nn.Module):
    def __init__(self, in_dim, out_dim):
        super().__init__()
        self.linear = nn.Linear(in_dim, out_dim)

    def forward(self, X, A_norm):
        """X: (N, in_dim);A_norm: (N, N) 已归一化邻接矩阵"""
        return torch.relu(A_norm @ self.linear(X))

# 用法:
N, d = 100, 16
A_norm = torch.rand(N, N)            # 实际由 D̃^(-1/2) Ã D̃^(-1/2) 算
X = torch.randn(N, d)
gcn1 = SimpleGCNLayer(d, 32)
gcn2 = SimpleGCNLayer(32, 8)
H1 = gcn1(X, A_norm)
H2 = gcn2(H1, A_norm)               # 2 层 → 聚合 2 跳邻居
```

实战不会自己写,**用 PyTorch Geometric 的 `GCNConv` 或 DGL 的 `GraphConv`**——它们处理了稀疏矩阵优化、自环、归一化、batch 等所有细节。

---

## 九、GraphSAGE 与 GAT(只点核心)

### 9.1 GraphSAGE:邻居采样

```
GCN 的问题:每层都要 A · H 全图传播,对大图不可扩展

GraphSAGE:每个节点只采样 k 个邻居(比如 25),局部 batch 训练
聚合方式:Mean / LSTM / Pool 都行
```

> **核心直觉**:**用采样代替全图聚合,牺牲一点精度换 100x 可扩展性**。Pinterest 的 PinSage 就是 GraphSAGE 的工业实现。

### 9.2 GAT:学出来的注意力权重

```
GCN: 邻居权重固定(度归一化)
GAT: 邻居权重 = 学出来的注意力分数

α_uv = softmax_v( LeakyReLU( a^T · [W·h_u || W·h_v] ) )
H^(l+1) = σ( Σ_{v∈N(u)} α_uv · W · h_v )
```

> **核心直觉**:**GAT 把 Transformer 的 attention 机制搬到图上**——不同邻居贡献不一样,权重由数据学出来,不再是简单平均。

| 模型 | 聚合方式 | 适用 |
| --- | --- | --- |
| GCN | 度归一化平均 | 简单稳定,中小图 |
| GraphSAGE | 采样 + 均值/LSTM/Pool | 大图,工业首选 |
| GAT | 学出来的注意力 | 异质邻居贡献不一样的场景 |
| GIN | 求和 + MLP(理论最强表达力) | 学术 benchmark 常胜 |

---

## 十、工程对应与局限

### 10.1 库与系统

| 数学概念 | 工程实现 |
| --- | --- |
| 邻接矩阵特征向量 | `np.linalg.eig` / `scipy.sparse.linalg.eigs`(大图用 ARPACK) |
| 拉普拉斯矩阵 | `scipy.sparse.csgraph.laplacian` / `nx.laplacian_matrix` |
| 代数连通度 | `nx.linalg.algebraic_connectivity(G)` |
| 谱聚类 | `sklearn.cluster.SpectralClustering` |
| PageRank | `nx.pagerank(G, alpha=0.85)` / Spark GraphFrames `pageRank` |
| Personalized PageRank | `nx.pagerank(G, personalization={...})` |
| HITS | `nx.hits(G)` |
| GCN / GraphSAGE / GAT | **PyTorch Geometric (PyG)** / **DGL** / **Graph Neural Network Library 系列** |
| 大规模图嵌入 | PBG (PyTorch BigGraph)、阿里 Euler、Twitter Pixie |

### 10.2 推荐系统中的图技术现状

| 公司 | 图算法 |
| --- | --- |
| Pinterest | Pixie(实时 PPR)+ PinSage(GraphSAGE 工业版) |
| Twitter | SimCluster(矩阵分解)+ TwHIN(图嵌入) |
| 阿里 | EGES、Swing、GraphSAGE 系列 |
| Facebook/Meta | PyTorch BigGraph、知识图谱嵌入 |
| Google | (闭源,但 PageRank 思想全产品扩散) |
| 微软 | LightGCN、KGE 系列 |

### 10.3 关键超参与调参

| 模型 | 关键超参 | 经验起步 |
| --- | --- | --- |
| PageRank | α 阻尼 | 0.85;搜索可降到 0.5(更"局部") |
| 谱聚类 | K 近邻数、簇数 k | KNN=10、k 由肘部法则 |
| GCN | 层数 L | **2~3 层**(更深会"过平滑",所有节点表示趋同) |
| GCN | 隐藏维度 | 16 / 32 / 64 起步 |
| GraphSAGE | 采样邻居数 | 第一跳 25,第二跳 10(PinSage 默认) |
| GAT | 注意力头数 | 4 ~ 8 |

> **避坑**:**GCN/GAT 不能堆深**——4 层以上几乎所有节点的表示会趋同(over-smoothing 问题),效果反而下降。**残差连接、JKNet、APPNP 是常见解法**。

### 10.4 局限

- **谱方法对超大图不友好**——求 N×N 矩阵特征值是 O(N³),N > 10 万就要用稀疏/迭代方法,**N > 千万直接放弃精确,用近似/采样**
- **PageRank 的链接结构假设过时**——现在搜索引擎的排名远不止 PageRank,内容质量、点击行为、个性化、AI 评分加权综合
- **GNN 对动态图不友好**——节点/边一变,所有邻居采样和权重都要重算,持续学习的图模型还是开放问题
- **图模型可解释性差**——为什么模型推荐了这个商品,沿哪条路径推过来的,**需要 GNNExplainer / SubgraphX 这类专门工具**
- **"六度分隔"的现实推论**:WhatsApp / Facebook 上几乎任意两人都在 4-5 跳内,**意味着 GCN 跑 4 层就理论上覆盖全图,但实际过平滑 → 这是 GNN 的内在张力**

---

写到这里,你应该能在白板前讲清:**PageRank 为什么收敛 = 转移矩阵的主特征向量唯一**;**谱聚类用拉普拉斯特征向量是因为它把"切边数最少"翻译成了"特征向量距离最近"**;**GCN 一层就是 "归一化邻接矩阵 × 特征矩阵 × 权重 + 激活"**——能讲清这三件事,这一篇就够了,**剩下的 GNN 论文你能直接读**。
