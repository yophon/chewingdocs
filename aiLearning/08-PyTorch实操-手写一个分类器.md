# PyTorch 实操：手写一个分类器

前面讲了一堆原理，现在把它们全跑一遍。这一篇目标只有一个：**从零写出一个能跑通的 PyTorch 训练循环**，用经典的鸢尾花（Iris）数据集做多分类。

---

## 一、PyTorch 的核心概念速览

| 概念 | 作用 |
| --- | --- |
| `Tensor` | 多维数组，GPU/CPU 通用，支持自动求导 |
| `nn.Module` | 神经网络的基类，所有层都继承它 |
| `Optimizer` | 更新参数（SGD、Adam…） |
| `DataLoader` | 批量加载数据 |
| `autograd` | 自动计算梯度，`.backward()` 一键触发 |

```python
import torch

x = torch.tensor([1.0, 2.0, 3.0], requires_grad=True)
y = (x ** 2).sum()
y.backward()
print(x.grad)   # tensor([2., 4., 6.])  ← dy/dx = 2x
```

`requires_grad=True` 告诉 PyTorch：**记录对这个 tensor 的所有操作**，反向传播时用。

---

## 二、数据准备

```python
from sklearn.datasets import load_iris
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
import torch
from torch.utils.data import DataLoader, TensorDataset

# 加载
X, y = load_iris(return_X_y=True)

# 标准化（让每个特征均值 0，方差 1）
scaler = StandardScaler()
X = scaler.fit_transform(X)

# 划分训练集 / 测试集
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

# 转成 Tensor
X_train = torch.FloatTensor(X_train)
X_test  = torch.FloatTensor(X_test)
y_train = torch.LongTensor(y_train)   # 分类标签用 Long
y_test  = torch.LongTensor(y_test)

# DataLoader：自动分 batch、打乱顺序
train_loader = DataLoader(
    TensorDataset(X_train, y_train),
    batch_size=16,
    shuffle=True,
)
```

> `FloatTensor` vs `LongTensor`：特征用 float32，分类标签用 int64（Long）——CrossEntropy 要求如此。

---

## 三、定义网络

```python
import torch.nn as nn

class Classifier(nn.Module):
    def __init__(self, in_features, hidden, num_classes):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(in_features, hidden),
            nn.ReLU(),
            nn.Linear(hidden, hidden),
            nn.ReLU(),
            nn.Linear(hidden, num_classes),
        )

    def forward(self, x):
        return self.net(x)   # 输出 logits，不需要手动 softmax

model = Classifier(in_features=4, hidden=64, num_classes=3)
print(model)
```

```
Classifier(
  (net): Sequential(
    (0): Linear(in_features=4, out_features=64, bias=True)
    (1): ReLU()
    (2): Linear(in_features=64, out_features=64, bias=True)
    (3): ReLU()
    (4): Linear(in_features=64, out_features=3, bias=True)
  )
)
```

---

## 四、训练循环

这是整个 PyTorch 的核心模式，**背下来**：

```python
import torch.optim as optim

criterion = nn.CrossEntropyLoss()          # 损失函数
optimizer = optim.Adam(model.parameters(), lr=1e-3)

def train_epoch(model, loader, criterion, optimizer):
    model.train()                           # 切到训练模式（影响 Dropout/BN）
    total_loss = 0
    for X_batch, y_batch in loader:
        # 1. 前向传播
        logits = model(X_batch)
        loss   = criterion(logits, y_batch)

        # 2. 清零梯度（必须！否则会累加）
        optimizer.zero_grad()

        # 3. 反向传播
        loss.backward()

        # 4. 更新参数
        optimizer.step()

        total_loss += loss.item()
    return total_loss / len(loader)
```

### 为什么要 `zero_grad()`?

PyTorch 默认**累加**梯度。如果不清零，上一个 batch 的梯度会叠加进来，导致参数更新错乱。

---

## 五、评估

```python
def evaluate(model, X, y):
    model.eval()                            # 切到评估模式
    with torch.no_grad():                   # 关闭梯度计算，省内存
        logits = model(X)
        preds  = logits.argmax(dim=1)       # 取概率最大的类
        acc    = (preds == y).float().mean()
    return acc.item()
```

---

## 六、跑起来

```python
for epoch in range(1, 101):
    loss = train_epoch(model, train_loader, criterion, optimizer)
    if epoch % 10 == 0:
        acc = evaluate(model, X_test, y_test)
        print(f"Epoch {epoch:3d}  loss={loss:.4f}  test_acc={acc:.3f}")
```

典型输出：

```
Epoch  10  loss=0.9821  test_acc=0.767
Epoch  20  loss=0.6134  test_acc=0.900
Epoch  50  loss=0.1892  test_acc=0.967
Epoch 100  loss=0.0831  test_acc=0.967
```

Iris 是个简单数据集，100 轮能跑到 96-100%。

---

## 七、常见坑

| 坑 | 现象 | 修法 |
| --- | --- | --- |
| 忘记 `zero_grad()` | loss 剧烈震荡或 NaN | 每次 `loss.backward()` 前调用 |
| 标签用了 `FloatTensor` | CrossEntropy 报错 | 改成 `LongTensor` |
| 评估时没 `model.eval()` | Dropout 还在随机 dropout | 评估前切到 eval 模式 |
| 评估时没 `torch.no_grad()` | 显存爆 | 包一个 `with torch.no_grad()` |
| 数据没标准化 | 收敛很慢甚至不收敛 | 一定要 `StandardScaler` |

---

## 八、完整代码（可直接跑）

```python
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset
from sklearn.datasets import load_iris
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

# ── 数据 ──────────────────────────────
X, y = load_iris(return_X_y=True)
X = StandardScaler().fit_transform(X)
X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=42)

X_tr = torch.FloatTensor(X_tr);  y_tr = torch.LongTensor(y_tr)
X_te = torch.FloatTensor(X_te);  y_te = torch.LongTensor(y_te)
loader = DataLoader(TensorDataset(X_tr, y_tr), batch_size=16, shuffle=True)

# ── 模型 ──────────────────────────────
model = nn.Sequential(
    nn.Linear(4, 64), nn.ReLU(),
    nn.Linear(64, 64), nn.ReLU(),
    nn.Linear(64, 3),
)

criterion = nn.CrossEntropyLoss()
optimizer = optim.Adam(model.parameters(), lr=1e-3)

# ── 训练 ──────────────────────────────
for epoch in range(1, 101):
    model.train()
    for xb, yb in loader:
        loss = criterion(model(xb), yb)
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

    if epoch % 10 == 0:
        model.eval()
        with torch.no_grad():
            acc = (model(X_te).argmax(1) == y_te).float().mean()
        print(f"epoch {epoch:3d}  acc={acc:.3f}")
```

---

## 九、下一步

现在你已经跑通了：**数据 → 网络 → 训练循环 → 评估**，这个框架适用于 99% 的深度学习任务。下面的章节会把这里的`nn.Sequential` 换成更复杂的架构：先是 CNN（图像），再是 Transformer（序列），最终是 LLM。
