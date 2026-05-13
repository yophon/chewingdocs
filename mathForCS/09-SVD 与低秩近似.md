# SVD 与低秩近似

特征分解漂亮但脆弱——**只对方阵管用、只对可对角化的矩阵管用、特征值可能是复数**。**SVD(Singular Value Decomposition)是它的工程师版**:**任何形状的矩阵都能分解,奇异值永远是非负实数,误差可控**。**LoRA 凭什么压缩、推荐系统凭什么用矩阵分解、PCA 在协方差矩阵以外的另一种算法、JPEG 压缩里的能量集中——底下都是同一个 SVD**。

> 一句话先记住:**任何矩阵都能分解成"旋转 → 沿轴缩放 → 旋转",缩放的强度就是奇异值,从大到小排**。**截断最小的那些奇异值,就是 Frobenius 范数意义下最优的低秩近似**——这是 Eckart-Young 定理给的"信仰保证"。LoRA 的 r=8、PCA 的前 k 主成分、推荐系统的 latent factor、JPEG 把图压成 10%——全是这一句的不同壳子。

---

## 一、为什么这一篇必须存在

| 场景 | 不懂 SVD | 懂一点 SVD |
| --- | --- | --- |
| LoRA 论文里的 ΔW = BA | "为什么 r=8 就够?" | 大模型权重更新是低秩的,SVD 给数学依据 |
| 推荐系统协同过滤 | "矩阵分解是什么黑盒" | user-item 矩阵的截断 SVD |
| PCA 但数据维度比样本多 | 协方差矩阵奇异,分解失败 | 直接对数据矩阵做 SVD,绕过协方差 |
| 模型压缩 / 剪枝 | "为什么神经网络能压缩这么多" | 权重矩阵奇异值衰减快,本质低秩 |
| 图像压缩 / 信号去噪 | 不知道从哪下手 | 奇异值能量集中在前几个 |

**特征分解告诉你"矩阵在不变方向上的行为",SVD 告诉你"矩阵在最重要的方向上的行为"**——后者在工程里更可靠、更通用、更频繁出现。

---

## 二、SVD 是什么:三个矩阵的几何故事

### 2.1 公式

```
对任意 m×n 矩阵 A:

  A = U Σ V^T

其中:
  U: m×m 正交矩阵           (U^T U = I,列向量两两正交,长度为 1)
  Σ: m×n "对角"矩阵         (只在主对角线上有非负实数 σ_1 ≥ σ_2 ≥ ... ≥ 0)
  V: n×n 正交矩阵           (V^T V = I)

σ_i 叫"奇异值",从大到小排
U 的列向量叫"左奇异向量"
V 的列向量叫"右奇异向量"
```

### 2.2 几何直觉:任何线性变换都是"旋转 → 缩放 → 旋转"

把矩阵 A 看作一个线性变换,它把单位圆变成椭圆。SVD 告诉你**任何这种变换都能拆成三步**:

```
原始向量 x
   │
   ▼ V^T:旋转(把右奇异向量转到坐标轴)
   │
y = V^T x
   │
   ▼ Σ:沿坐标轴独立缩放(每个轴的缩放因子是 σ_i)
   │
Σy
   │
   ▼ U:再旋转(把坐标轴转到左奇异向量方向)
   │
A x = U Σ V^T x


几何上:
  ●●●●●●            ●●●●●●         ●●●               ⋅⋅⋅
  ● 原始 ●          ● 转向 ●       ● 拉成 ●           ⋅ 转 ⋅
  ● 单位圆●  V^T   ● 标轴对 ● Σ   ●  椭圆 ● U      ⋅ 到目标 ⋅
  ● 在 R^n●  ─→    ●  齐  ●  ─→  ● (各方向不 ─→     ⋅ 方向(R^m) ⋅
  ●●●●●●            ●●●●●●         同σ缩放) ⋅ ⋅
                                    ●●●               ⋅⋅⋅
```

**三步分别对应矩阵 V^T、Σ、U**:V^T 和 U 只旋转(不改变长度),**所有"压缩信息"全在 Σ 的奇异值里**。

### 2.3 奇异值的意义:每个方向的"重要程度"

```
σ_i 大 → 这个方向上变换强,信息多
σ_i 小 → 这个方向上变换弱,信息少
σ_i = 0 → 这个方向被压成零(A 不能在这个方向"发声")

A 的秩 = 非零奇异值的个数
A 的"有效秩"(数值意义) = 显著大于零的奇异值个数
```

> **核心直觉**:**奇异值告诉你"矩阵在每个方向上有多大能量"**。前 k 个奇异值占总能量多少,决定了用前 k 个分量近似的"保真度"。**这是所有低秩近似的根**。

---

## 三、低秩近似:Eckart-Young 定理

### 3.1 截断 SVD

把最小的奇异值都丢掉,只保留前 k 个:

```
完整 SVD:
  A = U Σ V^T  
     = σ_1 u_1 v_1^T + σ_2 u_2 v_2^T + ... + σ_r u_r v_r^T    (r 个秩 1 矩阵之和)

截断 SVD(保留前 k 个):
  A_k = σ_1 u_1 v_1^T + ... + σ_k u_k v_k^T
      = U[:, :k] · Σ[:k, :k] · V[:, :k]^T

存储成本:
  A:    m × n
  A_k:  m × k  +  k  +  k × n  =  k(m + n + 1)    ← 当 k << min(m,n) 时大幅省
```

```
当 m = n = 1000, k = 10:
  A:    1,000,000 个数
  A_k:    20,010 个数         ← 压缩 50 倍
```

### 3.2 Eckart-Young 定理:截断 SVD 是最优低秩近似

**任何秩 ≤ k 的矩阵 B,与 A 的 Frobenius 距离都不会比 A_k 更小**:

```
min_{rank(B) ≤ k} || A - B ||_F  =  || A - A_k ||_F  =  sqrt(σ_{k+1}^2 + ... + σ_r^2)

意思是:截断 SVD 是 Frobenius 范数下的最优低秩近似
```

**人话**:**要找最好的"秩 ≤ k 的矩阵"近似 A,截断 SVD 是答案,误差就是丢掉的奇异值的平方和**。

> **核心直觉**:**Eckart-Young 给了"低秩近似"这件事的信仰**——不是"找一个低秩矩阵差不多就行",而是 SVD 给出来的就是数学上最优的。**所以 PCA、推荐系统、图像压缩、LoRA 都从这里出发**。

### 3.3 奇异值衰减谱:这个矩阵能不能压缩

```
画 σ_i 关于 i 的图(对数 y 轴):

  case 1: 真实低秩,陡峭衰减
       σ
        │ ●
        │  ●
        │   ●
        │    ●●●●●●●●●●●●●●   ← 前几个大,后面几乎是零
        ┼──────────────────────► i
        前 5 个就占 99% 能量 → 截 k=5 几乎无损

  case 2: 平缓衰减,难压缩
       σ
        │ ●●
        │   ●●●
        │      ●●●●●●●●●●●●     ← 每个都不能忽略
        ┼──────────────────────► i
        要保留大半才行 → 难压缩

  case 3: 阶梯衰减(很现实的形状)
       σ
        │ ●
        │  ●
        │   ●
        │     ●●●●
        │          ●●●●●●●●     ← 前 k 个是"主信号",后面是噪声
        ┼──────────────────────► i
        截 k = 第一个阶梯处,既保留信号又去噪
```

**LLM 权重矩阵的奇异值通常是 case 3**——这是 LoRA 能 work 的实证基础。

---

## 四、SVD 在工程中:四个核心应用

### 4.1 PCA 再访:为什么直接对数据矩阵 SVD

08 篇讲 PCA 是协方差矩阵的特征分解。**但实际工程很少这么做**——**直接对数据矩阵做 SVD 更稳更快**:

```
数据矩阵 X(n_samples × n_features)中心化后,做 SVD:
  X = U Σ V^T

主成分 = V 的列(右奇异向量)
主成分对应的方差 = σ_i^2 / (n - 1)

数学等价性:
  协方差矩阵 C = X^T X / (n-1)
            = V Σ U^T U Σ V^T / (n-1)
            = V (Σ^2 / (n-1)) V^T

→ V 既是 X 的右奇异向量,也是 C 的特征向量
→ Σ^2 / (n-1) 就是 C 的特征值
```

**为什么这样更稳?**

| 方法 | 问题 |
| --- | --- |
| 算 `X^T X` 再特征分解 | `X^T X` 的 condition number 是 X 的平方,小奇异值会丢精度 |
| 直接 SVD on `X` | 不放大 condition number,数值更稳 |

> **避坑**:**永远直接 SVD,不要"先算协方差再特征分解"**——这是 sklearn 的 PCA 默认实现。

### 4.2 推荐系统:协同过滤

**User-item 评分矩阵**通常是巨大的(数百万用户 × 数百万物品)且稀疏(每个用户只评过少数物品)。**核心假设**:**用户对物品的偏好可以用少数几个 latent factor 解释**(比如"喜欢动作片"、"喜欢慢节奏"等)。

```
评分矩阵 R(N_users × N_items),很稀疏

假设 R ≈ U V^T   (低秩近似)
  U: N_users × r,每行是用户在 r 个 latent factor 上的偏好
  V: N_items × r,每行是物品在 r 个 latent factor 上的特征

预测用户 i 对物品 j 的评分:
  r_ij_hat = u_i · v_j    (两个 latent 向量的点积)

训练目标:
  min || R_observed - U V^T ||^2 + 正则项
```

**这是协同过滤的核心**——Netflix Prize 2006-2009 的核心算法,**Simon Funk 当年用 SGD 求 SVD,横空出世**。现代版本叫 Matrix Factorization,公式没变,只是用 SGD/ALS 求解(因为有缺失值,标准 SVD 不直接 work)。

| 参数 | 调法 |
| --- | --- |
| latent factor 数 r | 5-200,数据多调大,少调小 |
| 正则系数 λ | 1e-4 到 1e-1,大则平滑,小则过拟合 |
| 算法 | 显式 SVD(没缺失值)/ ALS(交替最小二乘)/ SGD |

### 4.3 LoRA:大模型微调的低秩压缩

**LoRA(Low-Rank Adaptation)是 2021 年微软提的微调方法,2026 年是大模型微调的事实标准**。

**核心想法**:**全量微调的权重更新 ΔW 在数学上是低秩的——所以只学一个低秩近似就够了**。

```
原始全量微调:
  W' = W + ΔW
  ΔW: d × k,和 W 一样大,要学 d·k 个参数

LoRA:
  W' = W + B A
  B: d × r,A: r × k     (r 远小于 d, k)
  
  原始参数:d · k        (比如 4096 × 4096 = 16.7M)
  LoRA 参数:r(d + k)    (r=8 时 8 × 8192 = 65K,压缩 256x)
```

```
                W (frozen)
                 │
              ┌──┴──┐
       x ────┤     ├──→ Wx
              │     │
              └──┬──┘
                 │
            ┌────┴────┐
            │  A  B   │      ← 只学这俩矩阵
            │ r×k d×r │
            └────┬────┘
                 │
                BAx
                 │
              x ─┼─→ (W + BA)x = Wx + BAx
```

**为什么 r=8 就够?**

数学上的"低秩"和工程上的"近似低秩"是两回事:

```
理论:ΔW 的秩可能很高(d×k 的满秩),但奇异值衰减很快
实证:截断到 r=8 之后,||ΔW - B A|| 占总能量已经够小
     (能量分布在前几个奇异值上的现象,在大模型微调中普遍)

工程上的等价说法:
  "大模型已经学会了大部分东西,新任务只需要在少数几个方向上调整"
  ← 这个直觉被 LoRA 论文的消融实验验证
```

> **核心直觉**:**LoRA 不是"近似全量微调",是"假设全量微调里的有用信号本来就是低秩的"**。**如果你的任务真的需要 ΔW 高秩(比如跨语种学新词汇),LoRA 会效果差**——这时要么提高 r,要么用 QLoRA + 全层覆盖。

**LoRA 的工程超参**:

| 超参 | 含义 | 经验范围 |
| --- | --- | --- |
| `r` (rank) | 秩 | 4 - 64,通用任务 8 / 16,任务难度大用 64 |
| `alpha` (lora_alpha) | 缩放系数 | 等于 r 或 2r,实际放进网络的是 BA · (α/r) |
| `target_modules` | 给哪些层加 LoRA | 至少 q_proj, v_proj;全覆盖效果更好但参数多 |
| `dropout` | LoRA 模块的 dropout | 0.05 - 0.1 |
| `learning rate` | 学习率 | 比全量微调高 5-10 倍(只调小部分参数,放心走快点) |

### 4.4 图像压缩 / 信号去噪

**对一张灰度图(本身就是一个矩阵)做 SVD,丢掉小奇异值**:

```python
import numpy as np
from PIL import Image

img = np.array(Image.open('photo.jpg').convert('L'))    # 灰度图,(H, W)
U, s, Vt = np.linalg.svd(img, full_matrices=False)

# 保留前 k 个奇异值,重建
for k in [5, 20, 50, 100, 500]:
    img_k = U[:, :k] @ np.diag(s[:k]) @ Vt[:k, :]
    ratio = k * (img.shape[0] + img.shape[1] + 1) / (img.shape[0] * img.shape[1])
    print(f"k={k}: 存储比 {ratio*100:.1f}%, 误差 {np.linalg.norm(img-img_k):.2f}")
```

典型结果:**k=50 时存储压到 10%,肉眼几乎看不出差异**——因为自然图像的奇异值衰减很快。

**JPEG 用的不是 SVD 而是 DCT(离散余弦变换),但思路完全一样**——找一组基,把图投影到这组基上,丢掉小系数。SVD 是"找最优基"(数据驱动),DCT 是"固定一组好基"(免训练、不依赖数据)。

---

## 五、奇异值衰减谱:工程上看什么

### 5.1 谱告诉你的事

```python
import numpy as np
import torch

# 一个真实的神经网络权重
W = torch.load('pretrained_model.pt')['layers.0.attn.q_proj.weight']
U, s, Vt = torch.linalg.svd(W)

# 累计能量
energy = (s ** 2)
cumulative = energy.cumsum(0) / energy.sum()

# 找占 99% 能量的最小 k
k_99 = (cumulative < 0.99).sum().item() + 1
print(f"前 {k_99} 个奇异值占 99% 能量,W 形状 {W.shape}")
```

| 矩阵来源 | 奇异值谱形状 | 工程含义 |
| --- | --- | --- |
| 自然图像 | 陡峭衰减 | 可以压到 10-20% 大小 |
| 随机矩阵 | 平缓衰减 | 几乎不能压(噪声本质满秩) |
| 大模型权重 | 中间陡 + 长尾 | 中等压缩有效,极致压缩有损 |
| LoRA 训出的 ΔW | 只有前 r 个非零 | 是 r 秩矩阵的精确表达 |
| 推荐系统 user-item | 陡峭(实际秩低) | 低秩假设成立,latent factor 少即可 |
| 协方差矩阵 | 看数据 | 决定 PCA 取几个主成分 |

### 5.2 用谱挑 k 的两种方法

```
方法 1:累计能量阈值
  找最小的 k 使得 sum(σ_1..σ_k)^2 / sum(σ_1..σ_r)^2 ≥ 0.95
  → 保留 95% 能量
  常见阈值:90% / 95% / 99%

方法 2:elbow / scree plot
  画 σ_i 关于 i 的图,找"陡峭转平缓"的拐点
  
   σ
    │●
    │ ●
    │  ●      ← 这里是 elbow
    │   ●●●
    │       ●●●●●●●●
    ┼─────────────► i
    
  拐点之前是"主信号",之后是"噪声",取拐点 k
```

---

## 六、代码:从 NumPy 到 PEFT

### 6.1 NumPy / PyTorch 的 SVD API

```python
import numpy as np
import torch

# NumPy: full_matrices 关键参数
A = np.random.randn(100, 50)

# full_matrices=True(默认):U (100,100), s (50,), Vt (50, 50)
U, s, Vt = np.linalg.svd(A)
print(U.shape, s.shape, Vt.shape)   # (100, 100) (50,) (50, 50)

# full_matrices=False("瘦"SVD,实际常用):U (100, 50), s (50,), Vt (50, 50)
U, s, Vt = np.linalg.svd(A, full_matrices=False)
print(U.shape, s.shape, Vt.shape)   # (100, 50) (50,) (50, 50)

# 重建
A_reconstructed = U @ np.diag(s) @ Vt
print(np.allclose(A, A_reconstructed))   # True

# 截断 SVD(最常用)
k = 10
A_k = U[:, :k] @ np.diag(s[:k]) @ Vt[:k, :]
err = np.linalg.norm(A - A_k, 'fro') / np.linalg.norm(A, 'fro')
print(f"k=10 的相对误差: {err:.3f}")

# PyTorch 等价
A_t = torch.randn(100, 50)
U_t, s_t, Vt_t = torch.linalg.svd(A_t, full_matrices=False)

# 只要前 k 个:torch.svd_lowrank(随机化 SVD,大矩阵快得多)
U_k, s_k, V_k = torch.svd_lowrank(A_t, q=10)
print(U_k.shape, s_k.shape, V_k.shape)   # (100,10) (10,) (50,10)
```

### 6.2 大稀疏矩阵:scipy 的 svds

```python
from scipy.sparse import random as sparse_random
from scipy.sparse.linalg import svds

# 10000 × 5000 稀疏矩阵
A_sparse = sparse_random(10000, 5000, density=0.01)

# 只算前 k 个奇异值/向量(用 Lanczos 类算法)
U_k, s_k, Vt_k = svds(A_sparse, k=10)

# 注意:svds 返回的奇异值是升序排的(和 LAPACK 不同)
s_k = s_k[::-1]
U_k = U_k[:, ::-1]
Vt_k = Vt_k[::-1, :]
```

### 6.3 LoRA 的最小实现

```python
import torch.nn as nn

class LoRALinear(nn.Module):
    def __init__(self, in_features, out_features, r=8, alpha=16):
        super().__init__()
        self.W = nn.Linear(in_features, out_features, bias=False)
        self.W.weight.requires_grad = False                            # 原权重 freeze
        
        # LoRA 旁路:A 用 normal 初始化,B 用零初始化
        # 保证初始时 BA = 0,不影响原模型
        self.A = nn.Parameter(torch.randn(r, in_features) * 0.01)
        self.B = nn.Parameter(torch.zeros(out_features, r))
        self.scaling = alpha / r
    
    def forward(self, x):
        return self.W(x) + self.scaling * (x @ self.A.T @ self.B.T)

# 实际你不会自己写,用 huggingface PEFT
# from peft import LoraConfig, get_peft_model
# config = LoraConfig(r=8, lora_alpha=16, target_modules=["q_proj","v_proj"])
# model = get_peft_model(base_model, config)
```

### 6.4 推荐系统的最小例子

```python
import numpy as np

# 假设有个 5 用户 × 5 物品的评分矩阵(0 表示没评分)
R = np.array([
    [5, 3, 0, 1, 0],
    [4, 0, 0, 1, 0],
    [1, 1, 0, 5, 0],
    [1, 0, 0, 4, 0],
    [0, 1, 5, 4, 0],
], dtype=float)

# 中心化(去用户平均偏好)
mask = R > 0
user_mean = R.sum(1, keepdims=True) / mask.sum(1, keepdims=True)
R_centered = (R - user_mean) * mask

# SVD(简化:把 0 当真实评分,实际用 ALS / SGD 处理缺失)
U, s, Vt = np.linalg.svd(R_centered, full_matrices=False)

# 取前 2 个 latent factor
k = 2
R_approx = U[:, :k] @ np.diag(s[:k]) @ Vt[:k, :] + user_mean
print("预测评分:")
print(R_approx.round(2))
```

---

## 七、SVD 的数值实现:大矩阵怎么办

**标准 SVD 的复杂度是 O(min(mn², m²n))**——n=10⁵ 时根本算不动。**实际工程用两类近似**:

### 7.1 随机化 SVD(Randomized SVD)

**核心想法**:**用随机投影把矩阵降到小空间,再在小空间内精确 SVD**。

```
randomized_svd(A, k, oversampling=10):
  l = k + oversampling
  Ω = 随机高斯矩阵 (n × l)
  Y = A Ω                        # m × l,小很多
  Q, _ = qr(Y)                   # 正交化
  B = Q^T A                      # l × n,小很多
  U_B, Σ, V^T = svd(B)           # 小矩阵的 SVD,便宜
  U = Q U_B                      # 回到原空间
  return U[:, :k], Σ[:k], V^T[:k]
```

**复杂度从 O(mn²) 降到 O(mnk + nk² + k³)**——k=100 而 n=10⁵ 时,快 1000 倍。

**实际库**:

- `sklearn.utils.extmath.randomized_svd`
- `torch.svd_lowrank`(底层就是随机化 SVD)
- `dask-ml`、`umap-learn` 等都依赖它

### 7.2 截断 SVD(Truncated SVD via Lanczos)

**稀疏矩阵或希望精确 top-k**:用 Lanczos 类算法(和 08 篇求大稀疏矩阵特征值同源)。

| 算法 | 适合 | 库 |
| --- | --- | --- |
| Randomized SVD | dense 矩阵,只要 top-k | sklearn、torch.svd_lowrank |
| Truncated SVD (ARPACK) | 稀疏矩阵,精确 top-k | scipy.sparse.linalg.svds |
| Full SVD | 全部奇异值/向量 | numpy/torch.linalg.svd |

### 7.3 数值实验:看一眼速度差异

```python
import numpy as np
import time
from sklearn.utils.extmath import randomized_svd

A = np.random.randn(5000, 5000)

t = time.time(); U, s, Vt = np.linalg.svd(A, full_matrices=False); print(f"Full SVD: {time.time()-t:.2f}s")
t = time.time(); U, s, Vt = randomized_svd(A, n_components=10); print(f"Rand SVD k=10: {time.time()-t:.2f}s")
```

典型输出:

```
Full SVD: 4.2s
Rand SVD k=10: 0.08s     ← 50 倍快
```

---

## 八、工程对应与避坑

### 8.1 API 速查

| 任务 | 推荐 API |
| --- | --- |
| 中等矩阵全 SVD | `np.linalg.svd(A, full_matrices=False)` |
| 大矩阵只要 top-k | `torch.svd_lowrank(A, q=k)` 或 `sklearn.utils.extmath.randomized_svd` |
| 稀疏矩阵 top-k | `scipy.sparse.linalg.svds(A, k=k)` |
| PCA | `sklearn.decomposition.PCA` 或 `TruncatedSVD`(稀疏数据) |
| LoRA 微调 | `huggingface peft` 的 `LoraConfig` |

### 8.2 避坑清单

| 坑 | 表现 | 避坑 |
| --- | --- | --- |
| `full_matrices=True` 默认 | 大矩阵 OOM | 默认加 `False` |
| `svds` 返回升序 | 后续逻辑搞反 | 加 `[::-1]` 反转 |
| 零奇异值 | 重建后多个 NaN | 加 `np.where(s > 1e-10, ...)` |
| 复数 SVD | 想不到地拿到复数 | 大部分库返回实数,但矩阵是复数时会 |
| LoRA r 太小 | 任务训不动 | 加大 r(8 → 16 → 32),或扩 target_modules |
| LoRA alpha 调错 | 学得太慢 / 太快 | 经验 α = r 或 α = 2r,把缩放算清楚 |
| 用 SVD 做协同过滤 | 缺失值处理错 | 用 ALS / SGD,不是直接 SVD |

### 8.3 LoRA 的 r 和 alpha 究竟在调什么

```
LoRA 网络里实际进来的是:scaling · BA · x,其中 scaling = α / r

→ 加大 alpha = 等于加大 LoRA 的"等效学习率"
→ 加大 r = 增大表达能力,但每步学到的"幅度"被 scaling 拉平

经验法则:
  α 固定为 16,只调 r:简单但浪费(r 大时学得慢)
  α = r 同时调:LoRA 输出独立于 r,效果稳定
  α = 2r:更激进,适合微调难任务
```

> **核心直觉**:**调 r 是调"能学的方向数",调 α 是调"学得多狠"**——这两件事是独立的,理解了就不用照搬"r=8, α=16"这种默认。

### 8.4 SVD 的局限

| 局限 | 影响 | 替代 |
| --- | --- | --- |
| O(min(mn², m²n)) 不能算超大 | n=10⁶ 不可行 | 随机化 SVD / 截断 SVD |
| 假设矩阵线性 | 真实世界很多非线性结构 | autoencoder / VAE / 神经网络 |
| Frobenius 范数最优 ≠ 实际任务最优 | 比如推荐系统真正目标是 ranking | 用任务特定 loss + 矩阵分解 |
| 对缺失值不友好 | 协同过滤的稀疏矩阵 | ALS / SGD 矩阵分解 |
| 解释性差 | latent factor 不对应任何"业务概念" | 加约束(NMF 的非负、稀疏 PCA) |

**非负矩阵分解(NMF)、稀疏 PCA、独立成分分析(ICA)、张量分解(CP / Tucker)** 都是 SVD 的近亲——**约束放在不同位置,解决不同的工程问题**:

| 方法 | 约束 | 适合 |
| --- | --- | --- |
| SVD | 正交基,Frobenius 最优 | 通用低秩近似 |
| NMF | 非负元素 | 主题模型、文档聚类(主题数 = r) |
| Sparse PCA | L1 稀疏 | 可解释的主成分 |
| ICA | 独立分量 | 信号分离(盲源分离) |
| CP / Tucker | 张量版的 SVD | 多模态数据(用户 × 物品 × 时间) |

---

## 九、补一个直觉:为什么 SVD 比特征分解通用

| 维度 | 特征分解 | SVD |
| --- | --- | --- |
| 适用矩阵 | 方阵(且可对角化) | 任意 m×n 矩阵 |
| 输出 | 可能复数 | 总是实数 |
| 几何 | 找不变方向 | 找最重要方向 |
| 数值稳定 | 一般 | 工业级稳 |
| 唯一性 | 重特征值时不唯一 | 不同奇异值时基本唯一(差正负号) |
| 工程库优先级 | 看场景 | 永远首选 |

**对方阵 A,特征分解和 SVD 的关系**:

```
对称半正定 A:
  特征分解 A = Q Λ Q^T,Λ 全是非负实数
  SVD     A = U Σ V^T,U = V = Q,Σ = Λ          ← 完全一致

对一般方阵 A:
  特征分解和 SVD 可能完全不同
  SVD 给的"主方向"更工程化(总是正交、总是实数)
```

> **经验法则**:**默认用 SVD,只在"必须"用特征值时(谱半径分析、PageRank 收敛性、对角化幂运算)才用特征分解**。**当代码里看到 `eig`,先问自己:能不能换 SVD**?

---

## 参考与延伸

- **Strang《Introduction to Linear Algebra》第 7 章**——SVD 的标准教材讲法
- **LoRA 原论文**(Hu et al. 2021 "LoRA: Low-Rank Adaptation of Large Language Models")
- **Eckart-Young 定理原文**(Eckart & Young 1936)——历史出处
- **Halko, Martinsson, Tropp 2011**——随机化 SVD 的开山论文
- **HuggingFace PEFT 文档**(https://huggingface.co/docs/peft)——LoRA / QLoRA / IA3 等参数高效微调方法
- **sklearn PCA / TruncatedSVD 文档**——稀疏数据的 PCA 标准实现
- **Funk 2006 博客 "Netflix Update: Try This at Home"**——协同过滤矩阵分解的最早工程实现

下一篇:`10-张量与 einsum.md`——把矩阵的运算推广到任意阶,看 Transformer 里的张量到底怎么流动。
