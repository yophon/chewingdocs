# 极大似然、MAP 与贝叶斯推断

「为什么回归用 MSE、分类用 cross entropy?」「L2 weight decay 到底在罚什么?」「先验是个什么神秘东西?」——这些问题工程师能背答案,但**没人告诉你它们底下是同一套东西:似然函数**。MSE 是高斯似然换皮、cross entropy 是多项似然换皮、L2 weight decay 是加了高斯先验、L1 是加了 Laplace 先验。**理解这一层,你看损失函数和正则化就不再是"抄默认值",而是"我对数据的假设"**——再调起 sklearn 的 `C` 和 PyTorch 的 `weight_decay` 才知道动的是什么。

> 一句话先记住:**MLE 是"找最像生成数据的参数"、MAP 是"加了先验的 MLE"、贝叶斯是"不要点估计,直接给后验分布"**。**MLE 写出来就是 loss 函数、MAP 写出来就是 loss + 正则、贝叶斯写出来是后验分布**。这条线把"损失函数从哪里来"、"正则化为什么有效"、"何时该用贝叶斯"全部串起来。

---

## 一、为什么必须懂这条线

工程师不学 MLE/MAP/贝叶斯,日常 80% 的工作还是能干——抄个 cross entropy、加个 weight decay,模型也能训得动。但碰到下面这些场景,**没这层语言就只能拍脑袋**:

| 场景 | 没这层时的回答 | 有这层时的回答 |
| --- | --- | --- |
| 回归任务为什么用 MSE 不用 MAE | "默认是这个" | MSE 假设噪声是高斯,MAE 假设是 Laplace |
| 分类任务为什么用 cross entropy | "softmax 配它" | 它就是多项分布的负对数似然 |
| 为什么要加 L2 weight decay | "防过拟合" | 等价于"假设权重服从均值为 0 的高斯先验" |
| L1 比 L2 更稀疏,凭什么 | "Lasso 论文这么说" | Laplace 先验在 0 处尖峰,逼权重压到 0 |
| 小数据时怎么办 | "数据增强 / 早停" | 加强先验(增大 weight decay / 用贝叶斯) |
| sklearn 的 `C` 越小为什么正则越强 | "API 这么定义的" | C = 1/λ,小 C = 大 λ = 强先验 |
| Thompson Sampling 凭什么比 ε-greedy 好 | "在线学习论文里看到的" | 它直接采样后验,自动平衡探索/利用 |
| RLHF 里的 KL 罚项在罚什么 | "防止偏离 SFT 太远" | 把 SFT 模型当先验,RL 是 MAP 优化 |

> **核心直觉**:**机器学习的损失函数 95% 都是某个似然的负对数;正则项 95% 都是某个先验的负对数**。你定义损失函数那一刻,**已经隐式假设了数据怎么生成、参数应该长什么样**——只是大多数教程不告诉你。

---

## 二、似然 vs 概率:同一公式,两个视角

这两个词在中文教学里翻译模糊,英文里 `probability` 和 `likelihood` 也长一个样的公式,导致 90% 工程师永远分不清。**关键是看哪个量固定、哪个变**。

```
P(data | θ)  这个公式可以从两个视角读:

视角 1(概率):θ 固定,data 在变
            "给定参数 θ,观测到这个 data 的可能性是多少"
            → 这是常说的"概率"

视角 2(似然):data 固定,θ 在变
            "已经观测到这个 data 了,在不同 θ 下,这个 data 的合理性是多少"
            → 这是"似然"
```

**公式完全一样**,只是把谁当变量、谁当参数换了一下。**机器学习的训练就是视角 2**——数据已经收集完了,就在那儿,我们要找一个 θ 让"现有数据看起来最自然"。

```
扔硬币 10 次,7 正 3 反

视角 1(概率):假设硬币公平 θ=0.5,看到这个结果的概率是
              C(10,7) · 0.5^10 ≈ 0.117

视角 2(似然):数据 7 正 3 反固定,把 θ 当变量画出来:
              L(θ) = C(10,7) · θ^7 · (1-θ)^3
              在 θ=0.7 处取最大 → 这就是 MLE
```

> **避坑**:似然 **不是** 概率。`L(θ)` 对 θ 积分不等于 1(概率密度对 data 积分才等于 1)。**所以"似然 = 0.3" 没有"30% 概率"的意思**——它只是个相对量,用来对比不同 θ 谁更合理。

---

## 三、MLE:最大化似然,损失函数就是这么来的

### 3.1 一般形式

```
N 条独立同分布数据 x_1, ..., x_N

似然 L(θ) = Π P(x_i | θ)            # 独立 → 概率连乘
对数似然 ℓ(θ) = Σ log P(x_i | θ)    # 取 log,乘变加 + 数值稳定

θ_MLE = argmax_θ ℓ(θ)
       = argmin_θ [-ℓ(θ)]           # 等价的最小化版本

最小化负对数似然 NLL = - Σ log P(x_i | θ)
   ↑
   这就是机器学习里几乎所有损失函数的真名
```

**为什么取 log**——两个工程理由:
1. **数值稳定**:连乘 1000 个 0.01 的小概率 = 10^(-2000),float64 直接下溢成 0。取 log 变加法,只会得到 -2000,正常存得下。
2. **乘变加 + 求导方便**:`d(log f) = df/f`,链式法则简单。

### 3.2 回归 MSE 等价于"假设噪声是高斯"

工程里最常见的回归模型:

```
y = f(x; θ) + ε,    ε ~ N(0, σ²)
```

把 ε 当作噪声,假设它是均值为 0、方差 σ² 的高斯。那么给定 x,y 的分布是:

```
P(y | x; θ) = N(y; f(x;θ), σ²)
            ∝ exp(- (y - f(x;θ))² / (2σ²))
```

写出对数似然(N 个样本):

```
log P(y | x; θ) ∝ - (1/2σ²) · Σ (y_i - f(x_i;θ))²
                 ↑                ↑
              常数(σ² 当超参)    MSE 损失!

→ argmax (log likelihood) = argmin Σ (y_i - f(x_i;θ))²
                          = argmin MSE
```

> **核心结论**:**MSE 损失 = 假设噪声是高斯的 MLE**。这就是为什么回归默认用 MSE——不是"L2 距离很美",是工程上**默认假设噪声是高斯**(中心极限定理在背书)。**如果你知道噪声有重尾,应该换 MAE(对应 Laplace 噪声)或 Huber loss**。

### 3.3 分类 cross entropy 等价于"多项分布 MLE"

K 类分类,模型输出概率 `p = (p_1, ..., p_K)`,真实类别 one-hot 编码 `y`:

```
P(y | x; θ) = Π p_k^{y_k}      (只有真实类那一项 p_k 起作用)

log P(y | x; θ) = Σ y_k · log p_k    (对所有类求和)

NLL = - Σ_i Σ_k y_{i,k} · log p_{i,k}
       ↑
       这就是 cross entropy loss 的字面定义
```

> **核心结论**:**Cross entropy loss = 多项分布的 MLE**。**Logistic regression(二分类)= 伯努利分布的 MLE**(K=2 的特例)。所有分类损失都是这一类——所以 PyTorch 把它们统一叫 `nn.NLLLoss`(负对数似然)和 `nn.CrossEntropyLoss`(自带 log_softmax 的 NLL)。

### 3.4 损失函数对应关系一览

| 任务 | 数据假设(分布) | 损失函数(NLL) | PyTorch API |
| --- | --- | --- | --- |
| 回归(对称噪声) | 高斯 N(μ, σ²) | MSE | `nn.MSELoss` |
| 回归(重尾噪声) | Laplace | MAE / L1 | `nn.L1Loss` |
| 回归(混合) | Huber 假设 | Huber loss | `nn.SmoothL1Loss` |
| 二分类 | 伯努利 | Binary cross entropy | `nn.BCEWithLogitsLoss` |
| 多分类 | 多项 | Cross entropy | `nn.CrossEntropyLoss` |
| 计数预测 | 泊松 | Poisson NLL | `nn.PoissonNLLLoss` |
| 多标签独立 | K 个独立伯努利 | Sigmoid + BCE per label | `nn.BCEWithLogitsLoss` |
| 序数 / 排序 | Plackett-Luce | Listwise NLL | 自己写 |

**记住这张表**:**你选损失函数那一刻,已经选了一个数据生成模型**。换损失就是换假设,不是"调超参"。

### 3.5 MLE 的两个工程坑

**坑 1:小样本下 MLE 严重过拟合**

```
扔 3 次硬币,3 次都正面
MLE: θ̂ = 3/3 = 1.0
含义:这枚硬币永远不会反面 ←  3 个样本就敢下这种结论
```

人类直觉知道"这才 3 次,大概率还是正常硬币",但 MLE 没这个机制。**解决:加先验,这就是 MAP**。

**坑 2:类别不均衡时 MLE 偏向多数类**

```
1000 张图,990 张猫、10 张狗
MLE 训练 → 模型预测全猫,准确率 99%、毫无价值
```

**解决:加权 NLL、focal loss、上下采样**——本质都是修正 MLE 的隐式假设(类别均衡)。

---

## 四、MAP:加先验的 MLE

### 4.1 形式

```
后验 ∝ 似然 × 先验
P(θ | data) ∝ P(data | θ) · P(θ)

θ_MAP = argmax_θ [log P(data | θ) + log P(θ)]
                  └── 似然项 ───┘   └── 先验项 ─┘
                  对应损失           对应正则项
```

**结论一句话**:**MAP = MLE + 正则**。你看到的所有"损失 + λ × 正则"形式,**都可以写成 MAP**——只看你给参数加了什么先验。

### 4.2 L2 weight decay = 高斯先验

```
P(θ) = N(0, 1/λ)        # 假设权重服从均值 0、方差 1/λ 的高斯
log P(θ) ∝ - λ/2 · ‖θ‖²

→ argmax MAP = argmin [NLL + (λ/2) · ‖θ‖²]
                       └─loss─┘  └─L2 reg─┘
```

> **核心直觉**:**L2 weight decay 等价于"先验地相信权重应该接近 0"**——这就是 ridge regression / weight decay 在数学上的全部内容。`λ` 越大,先验越强,权重被拉得越接近 0。

### 4.3 L1 = Laplace 先验

```
P(θ) = Laplace(0, 1/λ)       # 双指数分布,在 0 处有尖峰
log P(θ) ∝ - λ · ‖θ‖_1

→ argmax MAP = argmin [NLL + λ · Σ |θ_i|]
                                └─L1 reg─┘
```

### 4.4 为什么 L1 比 L2 更稀疏:画两个先验的形状

```
高斯先验(L2 对应):                Laplace 先验(L1 对应):
                                      ▲
       ▁▂▄▆█▇▆▄▂▁                    ▆█▆
     ▁▃▆█    █▆▃▁                  ▁▃    ▃▁
   ─────────────────              ──────────────────
        0                                0
   平滑、在 0 处导数 = 0          在 0 处尖峰、导数不连续
```

**关键差异**:

- **高斯先验在 0 附近平滑**——把权重往 0 推,但**不会真的逼成 0**(导数为 0,梯度推不动)
- **Laplace 在 0 处有尖峰**——0 是它的最优点,**梯度有"恒定推力" λ·sign(θ)**,小权重直接被推成 0

这就是 L1 产生稀疏解的几何原因。**Lasso 之所以做特征选择,不是因为"L1 范数像菱形",是因为它的先验在 0 处有尖峰,优化时小权重被强制压成 0**。

| 先验 | 正则 | 行为 | 用途 |
| --- | --- | --- | --- |
| 高斯 N(0, 1/λ) | L2 / Ridge | 权重整体变小,不强制为 0 | 一般训练默认 |
| Laplace(0, 1/λ) | L1 / Lasso | 小权重压成 0,自动特征选择 | 高维稀疏数据 |
| 高斯 + Laplace 混合 | Elastic Net | 既稀疏又稳定 | 共线性 + 稀疏 |
| 学生 t | 鲁棒回归 | 容许极端值 | 离群点多 |
| 均匀(无先验) | 无正则 | 退化成 MLE | 数据足够多时 |

### 4.5 sklearn 的 `C` 参数为什么这么定义

`LogisticRegression(C=1.0, penalty='l2')`——**C 越小,先验越强**(很多人记反)。

```
sklearn 的目标:argmin C · NLL + ‖θ‖²
                       └─loss─┘  └─reg─┘
              ↑
              C 在 loss 上而不是 reg 上!

→ C = 1/λ
→ C = 0.01 等价于 λ = 100,先验非常强
→ C = 100  等价于 λ = 0.01,先验几乎没有
```

> **避坑**:**sklearn 的 `C` 越小正则越强,PyTorch / Keras 的 `weight_decay` 越大正则越强**。两边方向反着,调参时一定先看文档。**网格搜索 C 时建议 logspace(-3, 3),别用 linspace**——它是个尺度参数。

### 4.6 RLHF 里的 KL 罚项也是 MAP

PPO-RLHF 的目标是:

```
maximize  E[reward] - β · KL(π_RL ‖ π_SFT)
          └─似然侧─┘   └──先验侧──┘
```

**把 SFT 模型当作先验,RL 在做的就是 MAP**——找一个比 SFT 好的策略,但**别离 SFT 太远**(否则就破坏了语言能力)。**β 就是这个先验的强度**:

- β 大 → 强先验 → 模型死守 SFT,reward 提升慢
- β 小 → 弱先验 → 模型 reward hacking,胡说八道

**这就是 RLHF 里 β 调参的全部直觉**——它不是"魔法系数",它是"我多相信 SFT"的量化。

---

## 五、共轭先验:为什么贝叶斯算得动

### 5.1 后验更新:贝叶斯的命脉

```
后验 ∝ 似然 × 先验

每来一条新数据 x:
   先验  P(θ)
   →  后验 P(θ | x)  ∝  P(x | θ) · P(θ)
   →  当成下一轮的"先验",再来一条数据继续更新
```

**问题**:大多数情况下后验**没有解析形式**,要靠 MCMC / 变分推断硬算,慢得要死。

**共轭先验的妙处**:**先验和后验属于同一族分布,只是参数变了**——后验形式不变,可以闭式更新。

### 5.2 三组工程里最常见的共轭对

#### Beta-Bernoulli(伯努利试验,二分类)

```
先验:θ ~ Beta(α, β)
似然:N 次伯努利,k 次成功,N-k 次失败
后验:θ ~ Beta(α + k, β + N - k)
       ↑
       只是把成功数加进 α,失败数加进 β!
```

**直观**:`α` 像"看到过几次成功的伪计数",`β` 像"看到过几次失败的伪计数"。先验就是"在看数据前我以为成功率是 α/(α+β),并把这视为已经观测了 α+β 个伪样本的强度"。

```python
# 实例:CTR 估计
# 先验 Beta(1, 9)——相信 CTR 大约 10%,信心约等于看过 10 个样本
# 观测:1000 次曝光,15 次点击
# 后验 Beta(1+15, 9+985) = Beta(16, 994)
# 后验均值 ≈ 16/1010 = 1.58%,接近样本估计 1.5% 但被先验拉了一下
```

**Thompson Sampling**(下一节)就是建在 Beta-Bernoulli 上。

#### Dirichlet-Multinomial(K 类分类)

```
先验:θ ~ Dirichlet(α_1, ..., α_K)
似然:多项分布观测,各类出现 n_k 次
后验:θ ~ Dirichlet(α_1 + n_1, ..., α_K + n_K)
       ↑
       每类计数加到对应 α 上
```

**用在哪**:LDA 主题模型(文档-主题分布是 Dirichlet 的)、推荐系统的多臂老虎机扩展、自然语言模型的 token 分布平滑。

#### Gamma-Poisson(计数 / 速率)

```
先验:λ ~ Gamma(α, β)
似然:观察到 k 个事件
后验:λ ~ Gamma(α + k, β + 1)
```

**用在哪**:点击率(每分钟点击数)、bug 数预估、保险索赔频次。

### 5.3 共轭先验对照表(背下来很值)

| 似然(数据) | 共轭先验 | 后验更新 | 工程场景 |
| --- | --- | --- | --- |
| 伯努利 | Beta | α += 成功数, β += 失败数 | A/B 测试转化率 |
| 多项 | Dirichlet | α_k += 类 k 出现数 | LDA 主题模型 |
| 泊松 | Gamma | α += 事件数,β += 时间 | 点击率、bug 估计 |
| 高斯(已知方差) | 高斯 | 加权平均 | 在线均值估计 |
| 高斯(未知方差) | Normal-Inverse-Gamma | 解析有 | 财务、贝叶斯回归 |

> **经验法则**:**能用共轭就别上 MCMC**。共轭让"在线学习/流式更新"变成一行代码;**MCMC 跑一次得几分钟到几小时,共轭对的更新是 O(1) 的加法**。

---

## 六、贝叶斯推断 vs 点估计:何时值得做

### 6.1 三种姿势对比

```
MLE        :θ̂ = argmax  P(data | θ)                       → 一个点
MAP        :θ̂ = argmax  P(data | θ) · P(θ)                → 一个点
完整贝叶斯 :    P(θ | data) ∝ P(data | θ) · P(θ)          → 一整个分布
```

| 维度 | MLE | MAP | 完整贝叶斯 |
| --- | --- | --- | --- |
| 输出 | 一个点 | 一个点 | 一个分布 |
| 不确定性 | 没有 | 没有 | 直接给 |
| 计算成本 | 低 | 低 | 高(MCMC / VI) |
| 小样本表现 | 差(过拟合) | 好(先验救场) | 好 + 给不确定性 |
| 大样本表现 | 收敛到真值 | 收敛到真值 | 后验集中到真值 |
| 工程友好度 | 极高(就是 SGD) | 高(加正则) | 中(要 PPL) |
| 决策时用什么 | 点 | 点 | 后验,可以采样、可以算 CI |

### 6.2 何时点估计够用

- **数据多到可以淹没先验**(几百万样本)——MLE 就够,先验影响小
- **目标只是预测,不需要不确定性**——分类准确率、推荐 ranker
- **需要 GPU 大规模训练**——目前只有 SGD-based 点估计能扛得住

### 6.3 何时值得上完整贝叶斯

- **需要不确定性量化**(医疗诊断、金融风控)——给出"95% CI"而不是"概率 0.7"
- **小样本 + 强先验**(早期产品 A/B、稀有事件)
- **在线学习 / 决策**(Thompson Sampling、Bayesian Optimization)
- **模型对比**——贝叶斯因子比 cross-validation 更直接
- **可解释性需求**——参数后验比单点估计更便于沟通

> **避坑**:**别为了贝叶斯而贝叶斯**。深度学习的参数有上亿个,在它上面跑 MCMC 是不现实的(虽然有 Bayesian DL 这条线,但工业落地还少)。**贝叶斯最适合中小模型(回归、GLM、低维参数)+ 决策任务**。

---

## 七、Thompson Sampling:贝叶斯思路在 RL/Bandit

### 7.1 多臂老虎机问题

```
K 个推荐位 / 广告 / Banner,每个的真实 CTR 未知
每次只能选一个曝光,看是否点击
目标:最大化总点击数
   ↓
   要平衡"探索"(试新位)和"利用"(选已知最好的)
```

### 7.2 Thompson Sampling 的写法(简洁到震惊)

```python
import numpy as np

# 每个臂维护 Beta(α, β) 后验
K = 5
alpha = np.ones(K)   # 初始先验 Beta(1, 1) = Uniform
beta  = np.ones(K)

for step in range(10_000):
    # 1. 从每个臂的后验里采样一个 CTR
    sampled_ctr = np.random.beta(alpha, beta)
    # 2. 选采样最大的那个
    arm = sampled_ctr.argmax()
    # 3. 拉这个臂,看到 reward(0 或 1)
    reward = pull(arm)   # 你的环境
    # 4. 共轭更新对应臂的后验
    if reward == 1: alpha[arm] += 1
    else:           beta[arm]  += 1
```

**就这 10 行**——比 ε-greedy / UCB 都简洁、性能往往还更好,而且**自动平衡探索/利用**:

- 后验方差大(数据少)→ 采样波动大 → 自然会被偶尔选中(探索)
- 后验均值高且方差小(数据多且效果好)→ 经常被选中(利用)
- 数据越多,后验越窄,探索自动减少

> **核心直觉**:**Thompson Sampling = 按"我相信这个臂最好"的概率去选它**。它把贝叶斯的不确定性自然变成了探索动力——**这是工程师最喜欢的贝叶斯应用**:不需要调参、代码 10 行、效果好。

**衍生应用**:Bayesian Optimization(超参搜索)、推荐系统冷启动、广告竞价、Multi-Armed Contextual Bandits(LinUCB / Thompson with linear model)。

---

## 八、代码:把上面所有概念跑一遍

### 8.1 手写 MLE:伯努利的最大似然

```python
import numpy as np

# 数据:扔 100 次硬币,57 次正面
N, k = 100, 57
theta_grid = np.linspace(0.01, 0.99, 200)
log_lik = k*np.log(theta_grid) + (N-k)*np.log(1 - theta_grid)
theta_mle = theta_grid[log_lik.argmax()]
print(f"MLE θ = {theta_mle:.3f}")     # ≈ 0.57
# 解析解就是 k/N
```

### 8.2 MAP:Beta(2, 2) 先验拉一下小样本

```python
# 只扔 3 次,3 次都正面
N, k = 3, 3
# MLE θ_MLE = 1.0(显然太极端)

# MAP with Beta(2, 2) 先验:
# log_posterior = log_lik + (α-1)log θ + (β-1)log(1-θ)
alpha, beta = 2, 2
log_post = (k + alpha - 1)*np.log(theta_grid) + (N - k + beta - 1)*np.log(1 - theta_grid)
theta_map = theta_grid[log_post.argmax()]
print(f"MAP θ = {theta_map:.3f}")     # ≈ 0.80,被先验拉回中间一点

# 完整后验:Beta(α+k, β+N-k) = Beta(5, 2)
from scipy import stats
post = stats.beta(alpha + k, beta + N - k)
print(f"后验均值 = {post.mean():.3f}")     # ≈ 0.71
print(f"后验 95% CI = [{post.ppf(0.025):.3f}, {post.ppf(0.975):.3f}]")
# CI 给出诚实的不确定性范围
```

### 8.3 L2 weight decay = 高斯先验:在线性回归里验证

```python
from sklearn.linear_model import Ridge
import numpy as np

rng = np.random.default_rng(0)
X = rng.normal(0, 1, (50, 100))     # 50 样本 100 维(故意过参数化)
true_w = rng.normal(0, 0.3, 100)
y = X @ true_w + rng.normal(0, 0.5, 50)

for alpha in [0.0001, 0.01, 1, 100]:
    model = Ridge(alpha=alpha).fit(X, y)
    print(f"α={alpha:7.4f}  ‖w‖²={(model.coef_**2).sum():.3f}")
# alpha 越大,‖w‖² 越小 —— 先验越强
```

### 8.4 Logistic Regression 的 C:验证它是 1/λ

```python
from sklearn.linear_model import LogisticRegression
X = rng.normal(0, 1, (200, 50))
y = (X[:, 0] + X[:, 1] > 0).astype(int)

for C in [0.001, 0.1, 1, 100]:
    model = LogisticRegression(C=C, penalty='l2').fit(X, y)
    print(f"C={C:7.3f}  ‖w‖²={(model.coef_**2).sum():.3f}")
# C 越大,‖w‖² 越大,先验越弱
```

### 8.5 Thompson Sampling 完整 demo

```python
import numpy as np
rng = np.random.default_rng(0)

# 真实 CTR(模拟环境用,算法看不到)
true_ctr = np.array([0.05, 0.10, 0.08, 0.12, 0.06])
K = len(true_ctr)
alpha, beta = np.ones(K), np.ones(K)

for step in range(10_000):
    sampled = rng.beta(alpha, beta)
    arm = sampled.argmax()
    reward = rng.random() < true_ctr[arm]
    if reward: alpha[arm] += 1
    else:      beta[arm]  += 1

print("各臂被拉的次数:", (alpha + beta - 2).astype(int))
print("各臂后验 CTR 均值:", alpha / (alpha + beta))
# 最优臂(idx=3, true=0.12)被拉的次数远多于其他
```

---

## 九、工程对应与局限

### 9.1 库与 API 对照

| 工具 | 适合什么 |
| --- | --- |
| `scipy.stats` | 共轭分布、点估计、简单贝叶斯 |
| `sklearn.linear_model.Ridge / Lasso / LogisticRegression` | 线性 MAP(L2/L1 正则) |
| `torch.distributions` | 在 PyTorch 里写自定义似然 / 先验 |
| `pymc` | Python 里最易用的 PPL,自动 MCMC + VI |
| `numpyro` / `pyro` | 基于 JAX / PyTorch 的 PPL,适合大规模 |
| `Stan` / `pystan` / `cmdstanpy` | 工业级贝叶斯,统计学家偏爱 |
| `bambi` | sklearn 风格的贝叶斯 GLM 包装 |
| `BoTorch` | 贝叶斯优化(超参搜索) |
| `Vowpal Wabbit` | 在线学习 + Contextual Bandits |

### 9.2 调参速查

| 参数 | 工程含义 | 调大 | 调小 |
| --- | --- | --- | --- |
| `weight_decay` (PyTorch) | L2 强度 | 高斯先验更强,权重压小 | 退化为 MLE |
| `C` (sklearn) | 1/L2 强度 | **先验更弱**(注意反向!) | 先验更强 |
| `λ_l1` (Lasso) | L1 强度 | Laplace 先验强,稀疏化 | 不稀疏 |
| `β` (RLHF / KL) | SFT 先验强度 | 死守 SFT,reward 难上去 | reward hacking 风险 |
| `α, β` (Beta 先验) | 伪计数 | 先验信心强,需要更多数据才动 | 容易被数据带走 |
| `ε` (Dirichlet smoothing) | 词频平滑量 | 平滑更强,稀有词概率不为 0 | 接近 MLE |

### 9.3 何时该上贝叶斯,何时别上

**该上**:
- 决策需要不确定性(医疗、金融、风控)
- 小样本 + 有真实先验知识(领域专家给出)
- 在线学习 / Bandit / 主动学习
- 想做模型对比 / 模型平均
- 实验报告要"概率上 B 比 A 好的可能性"

**别上**:
- 大模型 + 大数据(MLE 收敛得很好,贝叶斯过于昂贵)
- 只关心预测准确率(不需要不确定性)
- 团队没有维护 PPL 的能力(MCMC 调试是另一门手艺)
- 实时推理延迟敏感(后验采样比单次前向慢)

### 9.4 MLE / MAP 的隐藏假设清单

每次写损失函数,你**已经在做这些假设**——大多数时候默认就行,但出问题时第一时间反推:

```
MSE             →  噪声是均值 0、方差恒定的高斯(同方差!)
MAE / L1        →  噪声是 Laplace(重尾)
Cross Entropy   →  类别独立同分布、互斥
Hinge Loss      →  最大间隔(SVM,与概率无关)
L2 weight decay →  权重均值 0 的高斯先验,各权重独立
L1 weight decay →  权重 Laplace 先验,稀疏可解
Dropout         →  近似 Bayesian model averaging(Gal & Ghahramani 2016)
```

> **核心避坑清单**:
> 1. 写损失函数 = 隐式选择数据生成模型;噪声不是高斯就别默认 MSE
> 2. L2 weight decay = 高斯先验;L1 = Laplace 先验,L1 稀疏来自 0 处尖峰
> 3. sklearn `C` 反向定义:**C 越小先验越强**
> 4. 小样本下 MLE 严重过拟合,加先验(MAP)或 Bayes 救场
> 5. 共轭先验能闭式更新,流式 / 在线场景首选,别无脑上 MCMC
> 6. RLHF 里的 KL 罚项就是把 SFT 当先验做 MAP,β 是先验强度
> 7. Thompson Sampling 是工程师最喜欢的贝叶斯——10 行代码、效果好、自带探索

下一篇 `15-假设检验与 A/B 测试` 把这条线落到**实验决策**:**p 值真正含义、α/β 取舍、为什么不能 peek、贝叶斯 A/B 怎么不需要预先样本量**——所有"上线决策"背后的统计语言。
