# 视觉模型:CLIP、Diffusion、SAM

35 篇讲过 VLM(视觉理解,文字进文字出),但视觉这条线比 LLM 早、分支也多。这一篇补三条最重要的支线:**CLIP(对齐文本和图像)、Diffusion(从噪声生图)、SAM(像素级分割)**。理解它们,才看得懂 Stable Diffusion 为什么能跟着提示画、ControlNet 为什么能"按草图生成"、Photoshop 的"一键抠图"是怎么做的。

> 一句话先记住:**CLIP 是"翻译机",把图像和文字扔到同一个空间;Diffusion 是"画家",从噪声里一步步把图像还原出来;SAM 是"剪刀",给一个点/框就能精准切下任何东西**。三者互相组合,撑起了 2022 年以后大半个图像 AI 生态。

---

## 一、CLIP:把图像和文字塞进同一个向量空间

OpenAI 2021 年的 CLIP(Contrastive Language–Image Pre-training)解决了一个老大难问题:**图像 embedding 和文字 embedding 谁也对齐不了谁**。

### 核心思想:对比学习

训练数据:从网上爬的 4 亿对 `(图像, 描述文字)`。

```
一个 batch:N 张图 + N 段文字
       │
       ▼
图像编码器(ViT)→ N 个图像向量
文本编码器(Transformer)→ N 个文本向量
       │
       ▼
两两点积 → N×N 相似度矩阵
       │
       ▼
对角线(配对)拉高,非对角线(不配对)压低
       ↑
   InfoNCE 损失
```

训练完之后,**配对的图文向量在同一空间几乎重合**。这件事一旦做成,后面所有应用顺水推舟:

| 应用 | 怎么做 |
| --- | --- |
| **Zero-shot 分类** | "猫的照片"、"狗的照片" → 算 embedding,和图比相似度 |
| **以文搜图** | 图库都算成 embedding,query 文本算成 embedding,余弦相似度排序 |
| **以图搜图** | 同上,query 换成图像 |
| **生成模型的"指挥棒"** | Stable Diffusion 把文本提示交给 CLIP,U-Net 用它做条件 |
| **数据清洗** | 算图文相似度,过滤低于阈值的脏数据 |

### 一段代码感受一下

```python
# pip install open_clip_torch torch pillow
import torch, open_clip
from PIL import Image

model, _, preprocess = open_clip.create_model_and_transforms("ViT-B-32", pretrained="laion2b_s34b_b79k")
tokenizer = open_clip.get_tokenizer("ViT-B-32")
model.eval()

image = preprocess(Image.open("cat.jpg")).unsqueeze(0)
labels = ["a photo of a cat", "a photo of a dog", "a photo of a car"]
text = tokenizer(labels)

with torch.no_grad():
    image_features = model.encode_image(image)
    text_features = model.encode_text(text)
    image_features /= image_features.norm(dim=-1, keepdim=True)
    text_features /= text_features.norm(dim=-1, keepdim=True)
    probs = (100.0 * image_features @ text_features.T).softmax(dim=-1)

print(dict(zip(labels, probs[0].tolist())))
```

> CLIP 的伟大不在指标,而在**它把"语义对齐"做成了通用基础设施**。后来的 BLIP、SigLIP、EVA-CLIP 都是它的变体。

---

## 二、Diffusion 模型:从噪声里"长"出图像

35 篇浅讲过扩散模型,这里展开。Diffusion 的关键在两件事:**(1)训练时把图像逐步加噪到纯高斯,(2)推理时学一个网络逐步去噪**。

### 2.1 前向加噪过程(无需训练)

```
x₀ (原图) → x₁ → x₂ → ... → x_T (≈纯噪声)

每一步:x_t = √(1-β_t) · x_{t-1} + √β_t · ε,  ε ~ N(0,1)
```

T 通常取 1000。β 调度(线性 / cosine)决定噪声加多快。

### 2.2 反向去噪过程(要训练)

训练目标:给定 `x_t` 和时间步 `t`,预测当时加进去的噪声 `ε`。

```python
loss = MSE(  ε_predicted = U-Net(x_t, t, condition),  ε_true  )
```

推理时:从纯噪声 `x_T` 出发,迭代 T 步(或用 DDIM/DPM-Solver 加速到 20-50 步)。

### 2.3 Latent Diffusion(Stable Diffusion 的本质)

直接在 512×512×3 像素上做扩散太贵。**Latent Diffusion** 先用 VAE 把图压到 64×64×4 的 latent 空间,在 latent 里做扩散,推理完再 VAE 解码回像素。算力降一个量级,这才让消费级显卡跑得起。

```
图像 ──VAE Encoder──▶ latent (64×64×4)
                       │
                       ▼
              U-Net 去噪(text 条件经 CLIP 注入)
                       │
                       ▼
                latent ──VAE Decoder──▶ 图像
```

### 2.4 Classifier-Free Guidance(CFG)

让生成"更听话"的关键技巧:同时算"有条件 ε_cond"和"无条件 ε_uncond",做线性外推:

```
ε_final = ε_uncond + w · (ε_cond - ε_uncond)
```

`w`(CFG scale)调到 7-12 是常见甜点。太大会变僵硬,太小忽略提示。

### 2.5 ControlNet:加一条"导轨"

Stable Diffusion 听文字,但你想让它"按这张草图/姿态/边缘生成"——加 ControlNet。本质是把 U-Net 复制一份当 trainable 旁路,只接收条件图(canny / depth / pose),把残差加回主分支。

```python
# 用 diffusers 跑 SDXL + Canny ControlNet
from diffusers import StableDiffusionXLControlNetPipeline, ControlNetModel
import torch

controlnet = ControlNetModel.from_pretrained("diffusers/controlnet-canny-sdxl-1.0", torch_dtype=torch.float16)
pipe = StableDiffusionXLControlNetPipeline.from_pretrained(
    "stabilityai/stable-diffusion-xl-base-1.0",
    controlnet=controlnet, torch_dtype=torch.float16
).to("cuda")

image = pipe(prompt="a cyberpunk cat on a rooftop, neon lights",
             image=canny_edge_image,
             controlnet_conditioning_scale=0.8,
             num_inference_steps=30).images[0]
image.save("out.png")
```

### 2.6 Diffusion 家族选型

| 模型 | 特点 | 适合 |
| --- | --- | --- |
| **SD 1.5** | 老旧但生态最全,LoRA / ControlNet 模型成千上万 | 二次元、定制化 |
| **SDXL** | 1024 分辨率,通用质量好 | 商用主力 |
| **SD3 / Flux** | 文字渲染好、构图准 | 海报、UI 草图 |
| **DALL·E 3** | 提示词理解最强,但是 API | 不想折腾的产品 |
| **Midjourney** | 美学强、风格化 | 创意视觉 |

---

## 三、SAM:Segment Anything

Meta 2023 年的 SAM(Segment Anything Model)做的事很简单也很革命:**给一个 prompt(点 / 框 / 文本),返回精准的像素 mask**。它训练在 11 亿 mask、1100 万图的 SA-1B 数据集上,zero-shot 切割能力夸张。

### 3.1 架构

```
图像 ──ViT image encoder──▶ image embedding
                                   │
prompt(点/框/mask)──prompt encoder──▶ prompt embedding
                                   │
                                   ▼
                          mask decoder(轻量)──▶ mask
```

image encoder 跑一次就能缓存,后续给不同 prompt 只跑很轻的 mask decoder——这才让"交互式分割"变得实时。

### 3.2 用法示意

```python
# pip install segment-anything
from segment_anything import SamPredictor, sam_model_registry
import cv2, numpy as np

sam = sam_model_registry["vit_h"](checkpoint="sam_vit_h.pth").to("cuda")
predictor = SamPredictor(sam)

image = cv2.cvtColor(cv2.imread("photo.jpg"), cv2.COLOR_BGR2RGB)
predictor.set_image(image)

# 给一个点:坐标 (x, y),label 1 表示前景
input_point = np.array([[500, 375]])
input_label = np.array([1])
masks, scores, _ = predictor.predict(point_coords=input_point, point_labels=input_label, multimask_output=True)
# masks.shape = (3, H, W),三个候选,挑 score 最高的
```

### 3.3 SAM 2 的升级

SAM 2(2024)把视频分割也支持了,可以**单帧打点 → 整段视频跟踪 mask**。视频编辑、短视频 AI 抠图全是它的下游。

### 3.4 SAM 的下游组合

| 组合 | 能干嘛 |
| --- | --- |
| **Grounding DINO + SAM** | 文本"猫" → DINO 框出猫 → SAM 切像素 mask |
| **SAM + Inpainting** | SAM 切目标 → SD inpainting 重画 → 精准换衣/换背景 |
| **SAM 2 + tracker** | 视频跟踪、Rotoscoping |
| **SAM + 3D** | NeRF / 3DGS 里精准抠物体 |

---

## 四、把三者拼起来:一个"按文字编辑图像"的 pipeline

```
用户:"把图里那只狗换成柴犬"
        │
        ▼
1. Grounding DINO 接收文字 "狗" → 输出框
2. SAM 接收框 → 输出狗的 mask
3. SD inpainting + ControlNet(原 mask)+ 提示 "a shiba inu" → 重绘 mask 区域
4. CLIP 算原图与新图相似度,作为安全护栏
        │
        ▼
返回新图
```

CLIP / Diffusion / SAM 几乎从来不是单独用,**它们是"图像积木",真实产品都是组合**。

---

## 五、和 LLM 的关系:VLM 与多模态 Agent

- **VLM**(35 篇讲过):在 LLM 一侧吃 ViT 编码后的图像 token,适合"看图回答"
- **Diffusion**:画图,通常作为 LLM 的 **工具**(LLM 写好提示词,调 SD/Flux)
- **SAM**:像素级精度,LLM 把它当 **像素操作工具**(指令"切出红色衣服" → LLM 生成点 prompt → SAM 出 mask)

> 别想用一个 Transformer 解决所有视觉任务。**VLM 看,Diffusion 画,SAM 切——分工是当下最成熟的范式**。原生统一(像 GPT-4o 的图像生成)在追,但生态还远不如三家分立成熟。

---

## 六、踩坑提醒

1. **CLIP 的偏见来自训练数据**。它对"医生"的 embedding 偏男性、对"护士"偏女性,直接拿去做检索/分类会复现这种偏见。生产里要做去偏或换 SigLIP。
2. **Diffusion 的"种子效应"很大**。同一提示换个 seed 出图天差地别,做产品要把 seed/CFG/steps 全都固定,不然客户两次结果不一样会怀疑你 bug。
3. **CFG scale 不是越大越好**。`w > 15` 经常出"塑料感"、过曝、构图崩。先调 7-9。
4. **SAM 给的 mask 边缘有锯齿**。inpainting 之前先 dilate 几 px、加个 feather,不然合成边缘会有色带。
5. **ControlNet 控制强度别拉满**。`controlnet_conditioning_scale=1.0` 有时会让结果太僵,降到 0.6-0.8 自由度更好。
6. **VRAM 预算**:SDXL 推理要 ~10GB,SD3/Flux 12-24GB,SAM ViT-H 8GB,CLIP ViT-L 1GB。把它们串到一个 pipeline 显存压力不小,常见做法是**按需加载/卸载**(`pipe.enable_model_cpu_offload()`)。

---

下一篇:`38-CodingAgent与ComputerUse.md`,看看 Cursor / Claude Code / Devin 这些"会写代码的 Agent"内部是怎么工作的。
