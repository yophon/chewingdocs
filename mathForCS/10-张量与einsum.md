# 张量与 einsum

写到这一篇,线代的「矩阵」抽象就到顶了——再往上就是张量。**实际工程中 99% 的「线代」其实是张量计算**,矩阵只是张量的二维特例。看 Transformer / Diffusion / Mamba 的实现,几乎每一行都在玩 `(B, T, H, D)` 这种四维五维的张量;不熟张量的形状语言,你看 PyTorch 代码就跟看天书一样。

> 一句话先记住:**张量计算的所有 bug 都是 shape bug,所有 shape bug 都是「维度没对齐」的 bug**。`einsum` 之所以值得专门写一篇,是因为它把「维度对齐」从隐式约定变成了显式标注——一行 `'bhid,bhjd->bhij'` 比五行 `reshape + transpose + matmul` 都更不容易写错。

---

## 一、为什么必须懂张量与 einsum

来一个真实场景。下面这两段代码做的是**同一件事**(Multi-Head Attention 里的 `Q @ K^T`),你能一眼看出哪段更容易写错吗?

```python
# 写法 A:reshape + transpose 链
B, T, D = x.shape
H, Dh = 8, D // 8

Q = q_proj(x).reshape(B, T, H, Dh).transpose(1, 2)  # (B, H, T, Dh)
K = k_proj(x).reshape(B, T, H, Dh).transpose(1, 2)  # (B, H, T, Dh)
scores = Q @ K.transpose(-2, -1)                    # (B, H, T, T)

# 写法 B:einsum
Q = q_proj(x).reshape(B, T, H, Dh)                  # (B, T, H, Dh)
K = k_proj(x).reshape(B, T, H, Dh)                  # (B, T, H, Dh)
scores = torch.einsum('bthd,bshd->bhts', Q, K)      # (B, H, T, T)
```

写法 A 里的 `.transpose(1, 2)` 哪个维度换哪个、`-2 -1` 是不是真的拿到最后两维——**这种事不画一遍 shape 是不敢肯定的**。写法 B 直接把维度名字写出来:`bthd` 里的 `b` 是 batch、`t` 是 query 的 token、`h` 是 head、`d` 是 head 维度;`bshd` 里 `s` 是 key 的 token。维度对不齐了 einsum 直接报错,**没办法写错却跑通**。

不懂张量与 einsum 时常踩的坑:

| 场景 | 不懂时 | 懂了之后 |
| --- | --- | --- |
| 看 FlashAttention 论文 | "Q (B,H,T,D) 怎么变成 (B,H,T,T) 的" | 一眼看出是 `'bhtd,bhsd->bhts'` |
| 写 MHA | reshape/transpose 写到第三遍出现 shape 错 | 一行 einsum,改 head 数维度不动 |
| 调 batch 矩阵乘 | 不知道 `torch.bmm` 和 `torch.matmul` 区别 | einsum 表达式直接告诉你 contraction 在哪 |
| `transpose` 后 `.view` 报错 | 不知道为什么 | 知道 transpose 后不 contiguous,要 reshape |
| 广播两个张量结果 shape 不对 | 蒙圈调试 | 从最右一维往左对齐,一眼看出哪维错 |

> **经验法则**:写 attention / cross-attention / RoPE / 任何带「按 head 拆分」「按位置加和」的算子,**优先试 einsum**——表达力强、维度命名清晰、写错时报错信息直接给你看哪个维度没对上。

---

## 二、张量是什么:两种视角

### 2.1 工程视角:n 维数组

**最直白的定义**:张量 = 多维数组。

```
0 维  scalar     ()           标量,一个数
1 维  vector     (D,)         向量,D 个数
2 维  matrix     (M, N)       矩阵,M 行 N 列
3 维  tensor     (B, T, D)    一个 batch 的序列(transformer 输入)
4 维  tensor     (B, C, H, W) 一个 batch 的彩色图(CNN 输入)
5 维  tensor     (B, H, T, T, D) 偶尔在 attention 实现里见到
```

**在 PyTorch / NumPy / JAX 里,所有这些都是同一个数据类型**(`torch.Tensor` / `np.ndarray`)。维度数 (`ndim`) 是动态属性,只是个 shape 元组而已。

### 2.2 数学视角:高维线性变换

数学里张量是**多线性映射**:**接收 k 个向量,返回一个标量,且对每个输入都是线性的**。一个二维张量 `(M, N)` 接收两个向量(一个 M 维一个 N 维)返回一个标量——这就是矩阵 + 双线性型。

工程师不需要记这个定义,但有一件事要记住:

> **核心直觉**:**张量计算的核心操作是「contraction」(收缩)**——把多个张量的某些维度**对齐相乘并求和**,得到一个新张量。矩阵乘法 `(M,K) @ (K,N) -> (M,N)` 就是最简单的 contraction:沿 K 维做内积、求和。einsum 把所有这类操作统一表达。

### 2.3 形状的语义

张量计算的痛点不在维度数,而在**每个维度代表什么**。同样是 `(32, 128, 768)`:

```
解释 1:batch=32, sequence_len=128, hidden=768      ← transformer encoder 输出
解释 2:hidden=32, batch=128, sequence_len=768      ← 写错维度顺序的等价 shape
解释 3:32 张图,128 通道,768 个像素              ← 在 CV 里完全合理
```

**同一个 shape,在不同代码里可以代表完全不同的东西**。好的代码会把维度命名出来(`B, T, D = x.shape`),einsum 直接把这个命名带进运算里。

> **避坑**:**永远不要靠 shape 推断维度语义**。`(B, T, D)` 和 `(B, D, T)` 在 PyTorch 里是完全不同的两个 tensor——前者是 transformer 风格、后者是 CNN 风格,搞混了会得到一堆「能跑但完全错」的结果。

---

## 三、shape 与 stride:contiguous / view vs reshape / transpose 后为什么不连续

### 3.1 内存里其实是一维的

无论你的 tensor 在 Python 里看着是几维,**在内存里它都是一段连续的一维数组**。**shape 和 stride 决定怎么把这段一维数组「读成」多维**。

```
tensor:  [[1, 2, 3],
          [4, 5, 6]]    # shape = (2, 3)

内存里:  [1, 2, 3, 4, 5, 6]
         ↑           ↑
       offset=0   offset=3

stride = (3, 1)  意思:
  → 沿第 0 维(行)走一步,内存里跳 3 个元素(下一行)
  → 沿第 1 维(列)走一步,内存里跳 1 个元素(下一列)
```

> **核心直觉**:**stride 是「沿这一维走一步、内存里跳几个元素」**。shape + stride + offset 三件套,就够把任意视图刻画清楚——这就是 PyTorch 实现 view / transpose / slice 不复制内存的秘密。

### 3.2 transpose 为什么不复制

`a.transpose(0, 1)` 在 PyTorch 里**不动内存,只把 shape 和 stride 两个属性交换**:

```
原 tensor a:  shape=(2, 3), stride=(3, 1)
内存:        [1, 2, 3, 4, 5, 6]

a.T:         shape=(3, 2), stride=(1, 3)
内存:        [1, 2, 3, 4, 5, 6]   ← 同一段内存!

读 a.T[0, 0]:  offset = 0*1 + 0*3 = 0  → 1
读 a.T[0, 1]:  offset = 0*1 + 1*3 = 3  → 4
读 a.T[1, 0]:  offset = 1*1 + 0*3 = 1  → 2
读 a.T[1, 1]:  offset = 1*1 + 1*3 = 4  → 5
读出来就是 [[1, 4], [2, 5], [3, 6]]   ✓
```

**transpose 只是给数据换了一种「读法」**,所以零开销。**代价**:转置后,沿第 0 维走一步内存里跳 1 个(密集)、沿第 1 维走一步跳 3 个(稀疏)——**这种 stride 模式叫「不连续」**(non-contiguous)。

### 3.3 contiguous 是什么:`stride[i] = ∏ shape[j], j>i`

定义很简单:**最后一维 stride=1,从右往左每加一维 stride = 后面所有维度 shape 的乘积**。

```
shape=(2, 3, 4)
contiguous 的 stride = (12, 4, 1)
                       │   │  └─ 最后一维:1
                       │   └─ 4 = shape[2]
                       └─ 12 = shape[1] * shape[2]
```

这种排列叫 **C-order**(行主序)。**transpose / permute 之后 stride 就乱了,不再是连续的**。

### 3.4 `.view()` vs `.reshape()`

| API | 要求 | 行为 | 何时用 |
| --- | --- | --- | --- |
| `.view(shape)` | tensor 必须 contiguous | 0 拷贝改 shape | 确定 contiguous 时,最快 |
| `.reshape(shape)` | 无要求 | 必要时自动 `.contiguous()`(拷贝) | 不确定时,最安全 |
| `.contiguous()` | 无要求 | 强制拷贝成 contiguous 排列 | transpose 后想 view 时 |

```python
x = torch.randn(2, 3, 4)
print(x.is_contiguous())             # True

y = x.transpose(1, 2)                # shape=(2, 4, 3),stride 乱了
print(y.is_contiguous())             # False

# y.view(2, 12) 会报错:RuntimeError: view size is not compatible
y.reshape(2, 12)                     # OK,内部 .contiguous() 一次再 view
y.contiguous().view(2, 12)           # 显式版本
```

> **避坑**:**transpose 后想 view、view 报错,十有八九是因为不 contiguous**。直接换成 `.reshape()` 解决——但要意识到它在偷偷复制内存,**hot path 上注意成本**。

### 3.5 一个真实 bug 案例

```python
# 想把 (B, T, H, Dh) 重排成 (B, H, T, Dh)
x = torch.randn(2, 5, 8, 64)

# 错误写法:reshape 不能换轴的顺序,只能合并/拆分维度
wrong = x.reshape(2, 8, 5, 64)        # 数据顺序错了!

# 正确写法
right = x.transpose(1, 2)             # (B, H, T, Dh),数据语义正确
right_view = right.reshape(2, -1)     # OK,reshape 自动 .contiguous()
```

**`reshape` 永远是把一维内存按新 shape「重新读」一遍,不会换数据顺序**;**`transpose / permute` 才会换数据的「读法」**。混了就是 silent bug——shape 对、能跑、结果错。

---

## 四、广播规则:从最右一维对齐

### 4.1 规则一张图讲清楚

```
两个 tensor 做加 / 减 / 乘 / 除时,从最右一维往左对齐:

  A.shape:        ( 4, 3 )
  B.shape:  ( 2, 4, 3 )
                  └──┴── 对齐
  对齐后:  ( 2, 4, 3 )    ← A 在前面补一维,1
  结果:    ( 2, 4, 3 )    ← 每一维取 max

每个维度对齐规则(只有这三种合法):
  shape_A[i] == shape_B[i]     → 直接相同,逐元素对应
  shape_A[i] == 1              → 沿这一维「复制」B[i] 次
  shape_B[i] == 1              → 沿这一维「复制」A[i] 次

否则报错。
```

### 4.2 几个典型例子

| A shape | B shape | 对齐结果 | 解读 |
| --- | --- | --- | --- |
| `(3, 4)` | `(4,)` | `(3, 4)` | B 当成 `(1, 4)`,每行加同一个 B |
| `(3, 4)` | `(3, 1)` | `(3, 4)` | B 是列向量,每列加同一个 B |
| `(B, T, D)` | `(D,)` | `(B, T, D)` | LayerNorm 的 γ / β 这样加进来 |
| `(B, H, T, T)` | `(B, 1, 1, T)` | `(B, H, T, T)` | attention mask 这样广播 |
| `(3, 4)` | `(3,)` | **报错** | 末尾 4 ≠ 3 |

### 4.3 最常见的 silent bug:维度错位

```python
# 想给每个样本(行)加一个偏置
x = torch.randn(3, 4)          # 3 个样本,每个 4 维
bias_per_sample = torch.randn(3)  # 3 个偏置,每个样本一个

# 直觉写法
wrong = x + bias_per_sample     # 报错:(3,4) vs (3,) 末尾 4 ≠ 3
```

**这个写法的问题**:广播从右往左对齐,`(3,)` 被理解成 `(1, 3)` 然后试图广播成 `(3, 3)`——和 `(3, 4)` 对不上。

正确写法:**显式给 bias 补一维**,让它变成列向量。

```python
right = x + bias_per_sample.unsqueeze(-1)    # (3, 1),广播成 (3, 4)
# 或者
right = x + bias_per_sample[:, None]         # 同上,None 是 unsqueeze 的语法糖
```

> **经验法则**:**「按样本加」的偏置一定要写成 `(N, 1)`,「按特征加」的偏置写成 `(D,)` 或 `(1, D)`**。前者 unsqueeze 最后一维,后者啥也不用做。

### 4.4 一个 PyTorch 报错示意

```
RuntimeError: The size of tensor a (4) must match
the size of tensor b (3) at non-singleton dimension 1
```

**读法**:在第 1 维上,a 是 4、b 是 3、都不是 1、所以不能广播。**「non-singleton dimension」意思是「这一维不是 1」**——出现这个报错,99% 是你期望广播但维度没补对。

---

## 五、einsum 表示法心智

### 5.1 einsum 在做什么:三步法则

einsum 用一个字符串描述张量运算,**核心三步**:

```
1. 写出每个输入张量的「维度名字」(每维一个字母)
2. 写出输出的维度名字
3. einsum 会自动:
   a. 把输入和输出都出现的维度 → 保留(broadcast / 逐元素对齐)
   b. 把输入出现、输出没出现的维度 → 沿这一维求和(contraction)
```

**就这么三条规则**,所有矩阵乘、批量矩阵乘、attention 计算、bilinear、cross-product、tensordot 都能表达。

### 5.2 从矩阵乘开始

矩阵乘 `(M, K) @ (K, N) = (M, N)`,每个元素 `C[m,n] = Σ_k A[m,k] * B[k,n]`。

```python
A = torch.randn(M, K)
B = torch.randn(K, N)

C1 = A @ B
C2 = torch.matmul(A, B)
C3 = torch.einsum('mk,kn->mn', A, B)   # 三种等价
```

读 einsum 字符串 `'mk,kn->mn'`:
- `mk`:A 的两维分别叫 m 和 k
- `kn`:B 的两维分别叫 k 和 n
- `->mn`:输出维度叫 m 和 n
- **k 在输入里出现、输出里没有 → 沿 k 求和(contraction)**

### 5.3 一组从简单到复杂的例子

| einsum | 操作 | 等价 PyTorch |
| --- | --- | --- |
| `'i,i->'` | 向量内积 | `torch.dot(a, b)` |
| `'i,j->ij'` | 向量外积 | `a.unsqueeze(-1) * b.unsqueeze(0)` |
| `'mk,kn->mn'` | 矩阵乘 | `A @ B` |
| `'ii->i'` | 提取对角线 | `torch.diagonal(A)` |
| `'ii->'` | 矩阵的迹 trace | `A.trace()` |
| `'ij->ji'` | 转置 | `A.T` |
| `'ij->'` | 所有元素求和 | `A.sum()` |
| `'ij->i'` | 沿第 1 维(列)求和 | `A.sum(dim=1)` |
| `'bij,bjk->bik'` | batch 矩阵乘 | `torch.bmm(A, B)` |
| `'bhid,bhjd->bhij'` | MHA 的 Q@K^T | (要写一长串 transpose) |
| `'bhij,bhjd->bhid'` | MHA 的 attn @ V | (同上) |

> **核心直觉**:**einsum 的字符串就是数学公式 `C[m,n] = Σ_k A[m,k] B[k,n]` 去掉求和符号、去掉等号**——保留「下标」就够了,因为「输入有、输出没」的下标自动求和。

### 5.4 Multi-Head Attention 一行写完

标准 MHA 的 attention scores 计算:`scores[b, h, i, j] = Σ_d Q[b, h, i, d] * K[b, h, j, d]`。

```python
# 假设已经 reshape 好 (B, H, T, D_head)
Q = torch.randn(B, H, T, Dh)
K = torch.randn(B, H, T, Dh)

# 写法 1:einsum,一行
scores = torch.einsum('bhid,bhjd->bhij', Q, K) / math.sqrt(Dh)

# 写法 2:matmul + transpose
scores = (Q @ K.transpose(-2, -1)) / math.sqrt(Dh)
```

**两种写法都对**,但 einsum 把「i 是 query 的位置、j 是 key 的位置、d 是被收缩的 head 维度」说得清清楚楚。看到 `bhid,bhjd->bhij` 你就知道:b 和 h 在两边都有且输出也有(批量并行)、d 在两边有但输出没有(被求和)、i 和 j 分别只在一边出现(成为输出新维度)。

如果再写 `softmax(scores) @ V`:

```python
attn = F.softmax(scores, dim=-1)
out = torch.einsum('bhij,bhjd->bhid', attn, V)    # (B, H, T, Dh)
# 等价:out = attn @ V
```

### 5.5 为什么 einsum 不容易写错

**两个理由**:

**1. 维度命名比 reshape 链清晰**

reshape / transpose 链每一步都改变 shape,**容易把维度顺序搞反**;einsum 直接用字母命名,**写错维度顺序立刻报错**(不会 silent failure)。

```python
# 假设我把 transpose 写错了
scores_wrong = Q @ K.transpose(-1, -2)    # 实际上 -1 -2 和 -2 -1 一样,看不出来
scores_wrong = Q @ K.transpose(-3, -2)    # head 和 token 转错了,但 shape 看起来对!

# einsum 版本如果写错:
scores_wrong = torch.einsum('bhid,bhjd->bhij', Q, K.transpose(-3, -2))
# 实际上 K 已经被打乱,einsum 不知道你打乱了,结果是错的
# 但你不会写错 einsum 表达式本身——错的是你之前为什么 transpose
```

更重要的是,**einsum 让你只写「最终怎么对齐」,不用考虑「怎么变形过去」**——后者由 einsum 自己挑实现方式。

**2. 自动决定 contraction 顺序**

三个张量的 contraction(比如 `'ij,jk,kl->il'`),不同的乘法顺序计算量差很多:

```
A: (1000, 1000), B: (1000, 5), C: (5, 1000)

(A @ B) @ C  ：先 (1000,1000)*(1000,5) = 5e6,再 (1000,5)*(5,1000) = 5e6,共 1e7
A @ (B @ C)  ：先 (1000,5)*(5,1000) = 5e6,再 (1000,1000)*(1000,1000) = 1e9!
```

**手写时容易选错顺序;`opt_einsum` 或 `torch.einsum` 内部可以自动选最优顺序**(尤其多张量 contraction)。

### 5.6 reshape/transpose 链 vs einsum:对比

| 维度 | reshape/transpose 链 | einsum |
| --- | --- | --- |
| 维度顺序错误 | silent,跑出错结果 | 通常会报错(维度名字对不上) |
| 可读性 | 三层 reshape 后没人看得懂 | 一行表达完整意图 |
| contraction 顺序 | 手写,容易选错 | 自动 |
| 性能 | 直接调 BLAS,无开销 | PyTorch 实现也优化得不错,但偶尔不如 matmul |
| 灵活度 | 受限于二元 matmul / bmm | 任意元数、任意维度 contraction |

> **经验法则**:**写 attention / 任何带 head 拆分的算子,用 einsum;写普通的 `(M,K) @ (K,N)` 矩阵乘,直接 `@` 就行**——einsum 对二元简单 case 没有可读性优势,反而显得绕。

---

## 六、Transformer 里张量怎么流

把上面的张量 + 广播 + einsum 全用上,看看 transformer 里一次 forward 张量到底怎么流的。

### 6.1 全过程的 shape 演化

```
输入  tokens     (B, T)              ← 整数 token id
  ↓ embedding
  ↓
       x        (B, T, D)            ← B=batch, T=seq_len, D=hidden
  ↓ q_proj/k_proj/v_proj(均为 Linear)
  ↓
       Q,K,V    (B, T, D)            ← 三个独立 D 维投影
  ↓ reshape 拆 head:D = H * Dh
  ↓
       Q,K,V    (B, T, H, Dh)        ← H=head 数, Dh=每个 head 维度
  ↓ transpose 把 head 提到前面
  ↓
       Q,K,V    (B, H, T, Dh)        ← 这样后续 contraction 时 H 当成 batch
  ↓ attention scores: Q @ K^T
  ↓
       scores   (B, H, T, T)         ← einsum('bhid,bhjd->bhij', Q, K)
  ↓ / sqrt(Dh)、加 mask、softmax(沿最后一维)
  ↓
       attn     (B, H, T, T)
  ↓ attn @ V
  ↓
       out      (B, H, T, Dh)        ← einsum('bhij,bhjd->bhid', attn, V)
  ↓ transpose 把 head 移回去 + reshape 合并
  ↓
       out      (B, T, D)            ← 准备进下一层 / FFN
```

**两个 contraction**:
- `bhid,bhjd->bhij`:Q @ K^T,沿 head 维度求和
- `bhij,bhjd->bhid`:attn @ V,沿 key/value 的 token 维度求和

### 6.2 attention mask 的广播魔法

```
causal mask 长这样:  (T, T) 的下三角矩阵
[[0, -inf, -inf, ...],
 [0,   0,  -inf, ...],
 [0,   0,    0,  ...],
 ...]

要加到 (B, H, T, T) 的 scores 上,reshape 成 (1, 1, T, T):
  mask:    (1, 1, T, T)
  scores:  (B, H, T, T)
  广播:    (B, H, T, T)   ← B 和 H 维都从 1 广播过去
```

**padding mask 同理**,key padding mask shape 通常是 `(B, T)`,reshape 成 `(B, 1, 1, T)` 广播到 scores 上。

### 6.3 Linear 层在张量上的作用

`nn.Linear(D_in, D_out)` 内部是 `(D_in, D_out)` 的权重 W 和 `(D_out,)` 的 bias。它对任意 shape 的输入做 `x @ W + b`,**只动最后一维**:

```
x         (B, T, D_in)
W         (D_in, D_out)
x @ W     (B, T, D_out)    ← 广播只在最后一维起作用
+ b       (D_out,)         ← 广播加到每个位置
```

**关键**:**Linear 不关心前面有多少维度,它就把所有非最后一维当 batch**。这就是 `nn.Linear` 能直接处理 `(B, T, D)` 而不需要 `(B*T, D)` 再 reshape 的原因。

> **核心直觉**:**整个 Transformer 的张量计算 = 一堆 `(D,D')` 的矩阵乘 + attention 里的两个 contraction + LayerNorm/softmax 这种逐元素 / 沿一维的算子**。看懂这三类操作的张量流,Transformer 实现你就能读到底。

---

## 七、代码:把上面三段串起来

跑一遍完整的 MHA,所有写法都列出来对比。

```python
import math
import torch
import torch.nn.functional as F

B, T, D, H = 2, 5, 64, 8
Dh = D // H

x = torch.randn(B, T, D)

# 假装这是 q/k/v 投影
W_q = torch.randn(D, D)
W_k = torch.randn(D, D)
W_v = torch.randn(D, D)

Q = x @ W_q    # (B, T, D)
K = x @ W_k
V = x @ W_v

# 拆 head:reshape 是无损的(只要 contiguous)
Q = Q.reshape(B, T, H, Dh)   # (B, T, H, Dh)
K = K.reshape(B, T, H, Dh)
V = V.reshape(B, T, H, Dh)

# ─── 写法 1:transpose + matmul(经典) ───
Qt = Q.transpose(1, 2)       # (B, H, T, Dh)
Kt = K.transpose(1, 2)
Vt = V.transpose(1, 2)
scores1 = Qt @ Kt.transpose(-2, -1) / math.sqrt(Dh)   # (B, H, T, T)
attn1   = F.softmax(scores1, dim=-1)
out1    = attn1 @ Vt                                  # (B, H, T, Dh)
out1    = out1.transpose(1, 2).reshape(B, T, D)       # (B, T, D)

# ─── 写法 2:einsum,从 (B, T, H, Dh) 直接算,省 transpose ───
scores2 = torch.einsum('bthd,bshd->bhts', Q, K) / math.sqrt(Dh)
attn2   = F.softmax(scores2, dim=-1)
out2    = torch.einsum('bhts,bshd->bthd', attn2, V)   # (B, T, H, Dh)
out2    = out2.reshape(B, T, D)                       # (B, T, D)

print(torch.allclose(out1, out2, atol=1e-5))    # True
```

**两种写法结果一样**。注意写法 2 里:
- `bthd,bshd->bhts`:Q 的 token 维度叫 `t`、K 的叫 `s`,head 维度 `d` 被求和,输出是 `(B, H, t, s)`
- `bhts,bshd->bthd`:attn 的 key 维度 `s` 和 V 的 token 维度 `s` 对齐求和,输出回到 `(B, t, H, d)`

**整个流程没出现 `transpose`**——所有维度顺序的事 einsum 都帮你搞定了。

---

## 八、工程对应与局限

### 8.1 PyTorch / NumPy / JAX 的 einsum 实现

| 框架 | API | 备注 |
| --- | --- | --- |
| PyTorch | `torch.einsum(eq, *tensors)` | 内部分派到 matmul / bmm / 自定义 kernel |
| NumPy | `np.einsum(eq, *arrays)` | 默认实现不一定最优,大张量要配 `optimize=True` |
| JAX | `jnp.einsum(...)` | XLA 编译后通常和手写差不多 |
| TensorFlow | `tf.einsum(...)` | 类似 |

### 8.2 `opt_einsum`:多张量自动选最优顺序

`opt_einsum` 库专门解决「多个张量 contraction 时选乘法顺序」的问题——把它看作一个图论问题(找最小 cost 的 contraction 路径),NumPy 集成了简化版,PyTorch 没默认集成。

```python
import opt_einsum
import numpy as np

A = np.random.randn(100, 100)
B = np.random.randn(100, 5)
C = np.random.randn(5, 100)

# 直接 np.einsum 可能选错顺序
r1 = np.einsum('ij,jk,kl->il', A, B, C)

# 显式优化
r2 = np.einsum('ij,jk,kl->il', A, B, C, optimize='optimal')

# 或用 opt_einsum 自己
r3 = opt_einsum.contract('ij,jk,kl->il', A, B, C)
```

**只在 3+ 个张量 contraction 时有意义**——两个张量没什么可优化的,直接 matmul 就行。

### 8.3 FlashAttention 里张量布局的选择

FlashAttention 之所以快,**不是因为换了数学公式**,而是因为**用 tile + 重计算避免实例化 `(T, T)` 的中间张量**。但这也意味着——**它对张量布局非常挑剔**:

- Q / K / V 的 head 维度必须放在最后(便于沿 `Dh` 做点积)
- batch + head 维度合并成一个 `(B*H, T, Dh)`,便于 launch 一个 kernel 处理一个 head 一个 sample
- `T` 维度被切成块,块大小 `Br x Bc` 决定 SRAM 使用

> **经验法则**:**用 FlashAttention 时,先按它要的 shape 把 Q/K/V 准备好(通常是 `(B, T, H, Dh)`,不需要你 transpose 到 `(B, H, T, Dh)`)**,然后调它的 API——它内部自己管布局。不熟 FlashAttention 接口时,看一下 `flash_attn_func` 的 docstring 比凭记忆写 shape 安全得多。

### 8.4 einsum 的局限

**1. 不是所有运算都能 einsum**

einsum 只能表达**「逐元素乘 + 沿某些维度求和」**这一类运算。**遇到非线性运算就用不了**——比如 softmax(里面有 exp 和归一化)、attention mask(里面有 -inf 替换)、LayerNorm(里面有除以 std)。这些必须用普通 PyTorch op。

**2. 性能不总是最优**

PyTorch 的 einsum 内部会尽量分派到 matmul / bmm,但**复杂表达式(尤其超过两个张量、或带不常见的 contraction 模式)可能跑得比手写 reshape+matmul 慢**。Benchmark 之前别假设它最快。

**3. 不会自动 broadcast scalar**

einsum 表达式只描述「沿哪些维度对齐 / 求和」,**不处理标量缩放**——`/ sqrt(Dh)` 这种还得在 einsum 之外手写。

### 8.5 调试 shape bug 的最小流程

```python
# 写一个新的 einsum / reshape 链时,先这么干:

print('input shapes:')
print('  x:', x.shape)
print('  W:', W.shape)

out = torch.einsum('btd,de->bte', x, W)

print('expected: (B, T, D_out)')
print('actual:', out.shape)
assert out.shape == (B, T, D_out), f"shape mismatch: {out.shape}"
```

**比起 hover 鼠标看类型注释,直接 print shape 一遍**。所有 shape bug 都暴露在 print 里;ML 代码里类型注释经常对不上 runtime 真实 shape,**别太信类型,信 print**。

### 8.6 调它会动什么

| 动作 | 在 einsum / 张量层面发生了什么 |
| --- | --- |
| 把 `num_heads` 从 8 改到 16 | `H` 维变大,`Dh = D/H` 变小;contraction 在 `Dh` 维上(更短),scores 张量 `(B,H,T,T)` 变大 |
| 把 `seq_len` 从 512 改到 4096 | `T` 维变大;`(B,H,T,T)` 中间张量按 `T²` 增长 → OOM 经典原因 |
| 用 GQA(Grouped Query Attention) | K/V 的 head 维度少于 Q 的 head 维度,einsum 表达式变成 `'bthd,bsgd->bhgts'` 这类(g 是 group) |
| 加 LoRA | `W = W₀ + A @ B`,`A: (D, r)`, `B: (r, D)`,新增一对小矩阵在 forward 时多两个 einsum / matmul |

看完这篇,**所有「张量形状」「einsum 表达式」「contraction 顺序」的论文和代码,你应该都能直接读到底,不再被维度顺序吓退**。下一篇进概率心智,把概率统计这一层的数学补上。
