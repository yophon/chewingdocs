# CNN 卷积神经网络

这是"经典架构"三篇里的第一篇。CNN(Convolutional Neural Network)在 2012 年用 AlexNet 一战封神,后续 10 年图像领域几乎全是它的天下。即使到了 2026 年 LLM 满天飞,CNN 也没消失,只是换了形态——你手机里拍照的实时美颜、自动驾驶的车道线检测、医院的 CT 阅片,底下大概率还是 CNN 或 CNN 的混血儿。

> 一句话先记住:CNN 解决的是"图像数据维度太高、像素之间有局部结构"这两件事——它用**参数共享**和**局部连接**把 MLP 算不动的事情算动了。

---

## 一、为什么不能直接用 MLP 处理图像

先算一笔账。一张普通的彩色图,224×224×3,展平之后是 **150528 维**的向量。

如果第一层全连接(MLP)隐藏层只有 1024 个神经元,这一层的参数量是:

```
150528 × 1024 + 1024 ≈ 1.54 亿
```

**仅仅一层**就要 1.5 亿参数。再叠几层、再上 batch、再上 backward,显存直接爆炸。

但更要命的不是显存,而是**这种连接方式根本不合理**:

| 问题 | 说明 |
| --- | --- |
| 参数浪费 | 图像左上角的猫耳朵和右下角的猫耳朵,MLP 里是用**两组完全不同的权重**学的 |
| 没有平移不变性 | 同一只猫往左挪 10 像素,网络就当成另一张图,需要重新见过才认识 |
| 忽略空间结构 | 展平之后,相邻像素的"邻居关系"丢了,(i,j) 和 (i,j+1) 的距离跟 (i,j) 和 (i+100,j) 没区别 |

> **MLP 把图像当成无结构的一维向量,这是它处理图像最致命的缺陷。**

---

## 二、卷积:参数共享 + 局部连接

CNN 的核心就两个想法:

**1. 局部连接**:一个神经元只看输入的一小块(比如 3×3),不看全图。
**2. 参数共享**:同一个"卷积核"在整张图上滑动,所有位置共用一组权重。

直观图示:

```
输入图(5×5)            卷积核(3×3)         输出特征图(3×3)
─────────────           ─────────         ────────────
1 2 3 0 1                                    a b c
4 5 6 1 2     ⊛       1 0 -1     →         d e f
7 8 9 2 3              1 0 -1                g h i
0 1 2 3 4              1 0 -1
1 2 3 4 5

a = 1×1 + 2×0 + 3×(-1) + 4×1 + 5×0 + 6×(-1) + 7×1 + 8×0 + 9×(-1)
```

卷积核(kernel,也叫 filter)在整张图上**滑动**,每个位置做一次"对应位置相乘后求和"。这意味着:

- 这张图的左上角和右下角用的是**同一组 9 个权重**(参数共享)
- 一个输出位置只看输入对应位置周围 3×3(局部连接)
- 上面 5×5 的图,要用 MLP 至少 25 个权重,卷积只用 9 个

> 经验法则:**MLP 是"全看",CNN 是"用同一个放大镜扫一遍"**。前者参数随分辨率平方爆炸,后者参数跟分辨率无关。

---

## 三、卷积核、stride、padding、channel

实际工程里,你写卷积层只要填几个参数:

```python
nn.Conv2d(in_channels=3, out_channels=64, kernel_size=3, stride=1, padding=1)
```

挨个解释:

| 参数 | 含义 | 怎么选 |
| --- | --- | --- |
| in_channels | 输入通道数 | 彩色图 3,灰度图 1,中间层是上一层的 out_channels |
| out_channels | 这一层有多少个卷积核 | 越深越大,常见 32 / 64 / 128 / 256 / 512 |
| kernel_size | 卷积核空间大小 | 现代基本只用 3,偶尔用 1 或 5 |
| stride | 滑动步长 | 1 = 输出和输入同分辨率(配合 padding),2 = 输出边长减半 |
| padding | 边缘补 0 | 配合 kernel=3 用 padding=1 保持分辨率 |

### 输出尺寸算式(背下来)

```
H_out = (H_in + 2*padding - kernel_size) / stride + 1
```

例子:输入 32×32,kernel=3,stride=1,padding=1 → 输出 32×32(分辨率不变)。
输入 32×32,kernel=3,stride=2,padding=1 → 输出 16×16(下采样一半)。

### channel 的真正含义

很多新手卡在 channel 上,记住一句话:**channel 是"特征种类",不是"图像通道"**。

- 输入层的 3 通道是 RGB,有物理含义
- 中间层的 64、128、256 通道是**网络自己学出来的特征**,比如"竖边缘""红色斑块""猫耳尖角"

每个卷积核的真实形状是 `[kernel_size, kernel_size, in_channels]`,它**同时**看输入的所有 channel。所以 `Conv2d(3, 64, 3)` 这一层的参数量是:

```
3 × 3 × 3 × 64 + 64 = 1792
```

跟前面 MLP 的 1.5 亿对比一下,这就是 CNN 能 work 的根本原因。

> 避坑:`out_channels` 不是凭感觉拍的,工程里通常**每次空间分辨率减半,channel 数翻倍**(比如 64 → 128 → 256 → 512),这样总计算量大致守恒。

---

## 四、池化(MaxPool / AvgPool)

池化也是滑动窗口,但**没有参数**——它只是把窗口里的值聚合一下。

| 类型 | 操作 | 用在哪 |
| --- | --- | --- |
| MaxPool | 取窗口最大值 | 中间下采样,保留"最强响应"(经典 CNN 标配) |
| AvgPool | 取窗口平均 | 网络末尾(GlobalAvgPool 替代全连接,参数大降) |
| 自适应 Pool | 指定输出大小,自动算 stride | 输入分辨率不固定时用(`AdaptiveAvgPool2d`) |

PyTorch 写法:

```python
nn.MaxPool2d(kernel_size=2, stride=2)   # 把分辨率砍半,channel 不变
```

> 现代 ResNet / ViT 已经很少用 MaxPool,直接用 stride=2 的卷积下采样。但你看老网络(VGG、AlexNet)还是会遇到,得认识。

---

## 五、经典网络演进:LeNet → AlexNet → VGG → ResNet

CNN 这一支的演化史很值得过一遍,因为后面的 Transformer / ViT 都是在反这条路。

| 网络 | 年份 | 关键创新 | 深度 | 现在还有用吗 |
| --- | --- | --- | --- | --- |
| LeNet-5 | 1998 | 第一个工业可用的 CNN,识别手写数字 | 5 层 | 教学用 |
| AlexNet | 2012 | ReLU + Dropout + GPU 训练,ImageNet Top-5 错误率从 26% 降到 15% | 8 层 | 历史里程碑 |
| VGG | 2014 | 全用 3×3 小卷积,堆得更深更整齐 | 16/19 层 | 老项目里还见得到 |
| GoogLeNet | 2014 | Inception 模块,多尺度并行 | 22 层 | 已淘汰 |
| ResNet | 2015 | 残差连接,深度上到 152 层不退化 | 50/101/152 层 | **目前仍是 baseline** |
| DenseNet | 2017 | 每层都连接所有前面层 | 100+ | 偶尔用 |

> 2026 年你做项目,默认 baseline 就是 **ResNet-50**,稳、快、参数适中。要更强就上 ConvNeXt 或 Swin Transformer。

### 一个值得记住的趋势

- AlexNet 用 11×11 卷积、5×5 卷积
- VGG 全部换成 3×3
- ResNet 也是 3×3 + 1×1
- 现代 ConvNeXt 又开始用 7×7

**3×3 不是终极真理**,但它是过去十年的主流。你看代码看到 `kernel_size=3` 的概率超过 80%。

---

## 六、残差连接为什么能训深

ResNet 之前,CNN 想叠到 50 层很困难——不是过拟合,而是**训练 loss 都降不下去**(称为"退化问题")。

残差块(residual block)的形状非常简单:

```
       ┌──────────────┐
x ─────┤              ├──── + ───── y
       │  Conv-BN-ReLU│      ↑
       │  Conv-BN     │      │
       └──────┬───────┘      │
              └──────────────┘
                  shortcut
```

公式:`y = F(x) + x`

直觉解释:**让网络学"残差"(F(x) = y - x)而不是"映射"(y = F(x))**。

为什么这管用?三个角度:

| 角度 | 解释 |
| --- | --- |
| 优化角度 | 如果某层啥都不学最好,F(x) 趋于 0 即可,比让 F(x) 趋于 identity 容易得多 |
| 梯度角度 | 反向传播时梯度可以直接通过 shortcut 跳到浅层,缓解梯度消失 |
| 集成角度 | 一个 N 层 ResNet 等价于 2^N 条不同长度路径的集成 |

> 这是个**通用原则**,不只 CNN 用——后面 12 篇你会看到,**Transformer 的每一层也都是残差连接**。从 LSTM 的 gate、ResNet 的 shortcut,到 Transformer 的 residual,深度学习里"加一条捷径"是反复出现的设计模式。记住它。

---

## 七、PyTorch 写一个简单 CNN 分类 CIFAR-10

CIFAR-10 是 32×32 的 10 类小图。下面是个最简版,够你跑通整个流程,准确率能到 70% 左右。

```python
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader
from torchvision import datasets, transforms

class SmallCNN(nn.Module):
    def __init__(self, num_classes=10):
        super().__init__()
        # 32x32x3 → 32x32x32
        self.conv1 = nn.Conv2d(3, 32, kernel_size=3, padding=1)
        # 32x32x32 → 16x16x64
        self.conv2 = nn.Conv2d(32, 64, kernel_size=3, padding=1)
        # 16x16x64 → 8x8x128
        self.conv3 = nn.Conv2d(64, 128, kernel_size=3, padding=1)
        self.pool = nn.MaxPool2d(2, 2)
        # 全局平均池化 → (B, 128)
        self.gap = nn.AdaptiveAvgPool2d(1)
        self.fc = nn.Linear(128, num_classes)

    def forward(self, x):
        x = F.relu(self.conv1(x))            # 32x32x32
        x = self.pool(F.relu(self.conv2(x))) # 16x16x64
        x = self.pool(F.relu(self.conv3(x))) # 8x8x128
        x = self.gap(x).flatten(1)           # B x 128
        return self.fc(x)

# 数据
transform = transforms.Compose([
    transforms.ToTensor(),
    transforms.Normalize((0.5,)*3, (0.5,)*3),
])
train_set = datasets.CIFAR10('./data', train=True, download=True, transform=transform)
train_loader = DataLoader(train_set, batch_size=128, shuffle=True, num_workers=2)

# 训练循环
device = 'cuda' if torch.cuda.is_available() else 'cpu'
model = SmallCNN().to(device)
opt = torch.optim.Adam(model.parameters(), lr=1e-3)
loss_fn = nn.CrossEntropyLoss()

for epoch in range(5):
    for x, y in train_loader:
        x, y = x.to(device), y.to(device)
        logits = model(x)
        loss = loss_fn(logits, y)
        opt.zero_grad()
        loss.backward()
        opt.step()
    print(f'epoch {epoch} loss={loss.item():.4f}')
```

跑通以后建议改这几个东西感受一下:

- `kernel_size=5` vs `kernel_size=3`,看参数量和准确率
- 加 `nn.BatchNorm2d`,看收敛速度
- 加残差连接(把 conv2 的输入和输出加起来),看能不能堆到 10 层

> 经验法则:**CNN 训练标准三件套是 Conv + BN + ReLU**,这三个一起用比单 Conv 收敛快得多,几乎没有副作用。

---

## 八、CNN 在 LLM 时代还活着吗

2020 年 ViT(Vision Transformer)出来之后,大家以为 CNN 要进博物馆了。结果到 2026 年,真实情况是:

| 场景 | 主流架构 | 原因 |
| --- | --- | --- |
| 大规模预训练视觉(SOTA) | ViT / Swin / EVA | Transformer 在大数据下 scale 更好 |
| 中小数据集分类 | ConvNeXt / ResNet | 不需要 ViT 那么多数据,CNN 收敛快 |
| 边缘设备(手机、车) | MobileNet / EfficientNet | CNN 推理快、显存小 |
| 检测分割 | YOLO / Mask R-CNN(CNN backbone)| 工业链条成熟 |
| 多模态(CLIP、SD)| ViT + Transformer | 跟文本对齐方便 |

几个关键名词:

- **ViT**:把图片切成 16×16 patch,当成 token 喂给 Transformer。和 CNN 完全不同的思路。
- **ConvNeXt**:2022 年的"反击作",把 ViT 的设计经验(大 kernel、LayerNorm、GELU)搬回 CNN,效果跟 ViT 持平。
- **混合架构**:很多 SOTA 检测/分割模型是 CNN backbone + Transformer head,各取所长。

> **CNN 没死,只是不再独占图像领域。**做项目时,如果数据量不大或部署受限,CNN 仍然是更明智的选择;如果你跟着 SOTA 走、数据上亿,直接用 ViT 系列。

---

## 九、踩坑 / 给新手的建议

1. **永远先打印 shape**。`print(x.shape)` 是 CNN 调试的第一神器。维度对不上 90% 是 stride / padding / 通道数算错了,不要靠脑算,跑一下看一下。
2. **kernel_size 默认就用 3,padding 配 1**。除非你在做特殊任务(如大感受野的语义分割),不要乱试 5、7、11。
3. **第一层之后立刻 BN**。`Conv → BN → ReLU` 是肌肉记忆,顺序错了(比如 ReLU 后再 BN)虽然能跑,但收敛会变慢。
4. **数据增强比改网络重要**。CIFAR / ImageNet 上,加 RandomCrop + RandomFlip 提升的点数,常常比换更深的网络多。
5. **学会用 `torchvision.models`**。`resnet50(weights="DEFAULT")` 一行就是 ImageNet 预训练好的模型,做迁移学习时不要从零搭。
6. **CPU 上跑 CIFAR 没问题,跑 ImageNet 别想了**。没有 GPU 就用 Colab 或者 Kaggle 免费 GPU。
7. **不要纠结"我的网络是不是 SOTA"**。学习阶段写一个能跑、能 debug 的小 CNN 比照搬 ResNet-152 收获大十倍。
8. **理解 `nn.Conv2d` 的形状,胜过背 100 个网络名字**。CNN 的复杂度都在 shape 推演,理通了再去看 ResNet 源码会非常顺。

---

下一篇:`10-RNN与LSTM循环神经网络.md`,讲序列数据怎么处理——也是后面 Attention 机制的反面教材(为什么 RNN 不够用)。
