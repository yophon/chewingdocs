# TensorRT-LLM 心智:把模型编译成 engine 的 NVIDIA 自家路线

vLLM 和 SGLang 的世界观是「Python 主进程调度 + CUDA Kernel 执行」——你 `pip install` 完启动就跑,加减模型、改 batch、调参数都热的。TensorRT-LLM 走另一条路:**先把模型连同执行计划一起编译成一个 engine 二进制(.engine 文件),运行时把它加载起来跑**。这跟 PyTorch eager → TorchScript → AOT 编译的演化逻辑一致,也跟 Spark 从 RDD lambda 走向 Catalyst 编译式优化的路子一致——**牺牲灵活性,换 AOT 优化的极致空间**。这一篇拆 TRT-LLM 的心智:它和 vLLM 的本质差异、编译流程、核心优化武器,以及什么场景它真值这个工程成本,什么场景纯属自虐。

> 一句话先记住:**TRT-LLM = TensorRT 的图编译框架 + 为 LLM 写的算子插件库 + 一个能装载 engine 跑推理的 runtime**。它在 NVIDIA 卡(尤其 Hopper / Blackwell)+ FP8 / INT4 量化 + 大 batch + 模型相对稳定的场景下,比 vLLM 再快 20-50%;代价是 engine 与 GPU 型号绑定(H100 编的不能在 A100 跑)、改任何配置都要重新 build(几十分钟)、调试困难。**它是"性能上限"路线,不是"生产首选"路线**——前者属于云厂商和大流量自部署,后者大多数团队仍然该用 vLLM。

---

## 一、为什么 NVIDIA 要做这么一个东西

### 1.1 Python + CUDA Kernel 路线碰到的天花板

vLLM 用 PyTorch 调度,每一步 forward 是几十次 Python → CUDA 的调用。开销在哪里:

```
每次 step,框架做的事:
  1. Python 调度器算下一步要跑哪些请求(连续批)
  2. 调用 PyTorch ops:权重读取 + matmul + add + activation + ...
  3. PyTorch ops 内部 launch CUDA kernel
  4. 每个 kernel launch 有几 μs 开销(host → GPU 同步、参数传递)
  5. kernel 之间隔着 HBM 写入/读出(中间 tensor 落 HBM 再读回)
  6. 整个 step 完成,Python 拿结果做调度

decode 一步在 H100 上几毫秒,kernel launch + HBM 中转占去 30-50%。
```

vLLM 已经在算子层做了大量优化(自家写的 PagedAttention kernel、FlashAttention 集成),但**只要还在"调度归 Python、执行归 kernel"的架构里,kernel 之间的边界就是优化天花板**。

### 1.2 编译式的解法

把这件事 AOT 做掉:

```
1. 把模型计算图整体捕获(不是 step 时动态构造)
2. 编译期算子融合(N 个相邻 kernel 合成 1 个,中间张量留 SRAM)
3. 编译期形状专门化(知道 batch 范围 / seq 长度,生成专门 kernel)
4. 编译期量化植入(FP8 / INT4 路径直接 build 进 kernel,不走 cast)
5. 编译期 Graph Capture(消除 host-device 同步,整段一次提交)
6. 输出 engine 二进制,runtime 加载即跑
```

代价:**改任何东西(模型 / 量化 / batch 范围 / 并行策略)都要重 build**。
回报:**同硬件 20-50% 加速**,以及对新硬件特性(FP8、TMA、Multi-block Attention)的最早支持。

这跟 03 篇讲过的"训练 vs 推理"分野有同样的工程逻辑:推理是稳定工作负载,**模型上线后几个月不变**,完全适合 AOT 重投资。

### 1.3 谁在用,为什么

```
NVIDIA 自家:DGX Cloud、NeMo、Triton 推理套件,默认 backend 之一
云厂商:    AWS、Azure 在自家托管推理服务后端用,挤每一分性能
大流量自部署: OpenAI / Anthropic 这种级别会有定制版,中等流量公司用 TRT-LLM
搜索 / 推荐: LLM 用作 ranker 时,QPS 大、模型相对稳定 → 编译式收益最大
中小团队: 一般不用,vLLM 够,运维成本可承受
```

---

## 二、TRT-LLM 跟 vLLM 的本质差异

### 2.1 一张表

```
                          vLLM                      TensorRT-LLM
                          ────                      ─────────────
执行模型                  Python 主调度 + CUDA       Engine binary + C++ runtime
                          解释执行                   AOT 编译执行
切换模型                   换权重路径,秒级           重 build engine,几十分钟
切换 batch 范围            改启动参数,秒级           重 build engine
切换量化                   AWQ 模型可热加载           重 build engine
新增并行策略 (TP/PP)       改启动参数                重 build engine
跨硬件搬迁                 一份代码到处跑             engine 与 GPU 型号绑定,重 build
扩展自定义算子              写 PyTorch Module         写 C++/CUDA Plugin,接 TRT 注册
故障调试                   Python stack trace        engine 是 binary,只能看 NVIDIA 工具
开箱模型支持               几乎所有 HF 模型           NVIDIA 适配的范围(主流模型齐全)
社区生态                   开源主流推理引擎          NVIDIA 主导,半开源
```

### 2.2 编译式 vs 解释式的工程含义

```
解释式 (vLLM):
  ├── 优点:迭代快、易调、生态广、跨硬件
  └── 缺点:每 step 都有 Python + kernel launch 开销,优化空间有限

编译式 (TRT-LLM):
  ├── 优点:AOT 优化彻底、新硬件特性最先支持、极限性能
  └── 缺点:编译时间长、调试困难、与硬件强绑定、改一点重 build
```

工程上的判断很简单:**你这个推理服务,接下来 3-6 个月会不会动模型 / 动并行 / 动量化**?会动 → vLLM;不会动 → TRT-LLM 的编译成本可摊薄,值得投资。

---

## 三、编译流程:从 HF 模型到能跑的 engine

### 3.1 总览图

```
   ┌─────────────────────────┐
   │  Hugging Face 模型权重  │  meta-llama/Meta-Llama-3.1-8B-Instruct
   │  config.json + .safetensors │
   └─────────────────────────┘
              │
              ▼  convert_checkpoint.py(每个模型家族一份)
   ┌─────────────────────────┐
   │   TRT-LLM Checkpoint   │  统一格式,带量化 metadata
   │   (.json + 分片 .bin)  │  这一步可选量化(SmoothQuant / AWQ / FP8)
   └─────────────────────────┘
              │
              ▼  trtllm-build (核心编译步骤)
   ┌─────────────────────────┐
   │   构图 (TRT-LLM Python) │  用 TRT-LLM 的 nn-like API 描述模型结构
   │   插入 Plugin            │  PagedAttention / FMHA / RMSNorm 等
   │   设置量化精度           │  FP16 / FP8 / INT4 / mixed
   │   设置形状范围           │  max_batch_size / max_input_len / max_output_len
   │   设置并行策略           │  TP / PP / EP
   └─────────────────────────┘
              │
              ▼  TensorRT 内部
   ┌─────────────────────────┐
   │   算子融合              │  Linear+GELU+Norm 等合并
   │   Kernel 选择 / 调优    │  CUTLASS / cuDNN / 自家库里挑最快
   │   显存布局优化          │  KV cache 池、workspace、graph capture
   │   形状专门化            │  按指定范围 specialize
   └─────────────────────────┘
              │
              ▼
   ┌─────────────────────────┐
   │     engine 文件         │  .engine,二进制,几 GB
   │     绑定:               │
   │     - GPU 型号 (H100/H200/...)│
   │     - CUDA / TRT 版本    │
   │     - 编译时设的形状范围 │
   └─────────────────────────┘
              │
              ▼  trtllm-serve / Triton
   ┌─────────────────────────┐
   │   Runtime 加载,提供推理│  C++ runtime,Python wrapper 调用
   │   In-flight Batching    │  连续批调度
   │   KV Cache Manager      │  PagedAttention 等价物
   └─────────────────────────┘
```

### 3.2 一段最小流程

```bash
# 0. 装 TRT-LLM(官方推荐 docker 镜像,版本绑死)
docker run --rm -it --gpus all \
    nvcr.io/nvidia/tensorrt-llm/release:0.16.0 bash

# 1. 在容器里 clone 示例
cd /app/examples/llama
git lfs clone https://huggingface.co/meta-llama/Meta-Llama-3.1-8B-Instruct

# 2. convert checkpoint(可在此处量化)
python convert_checkpoint.py \
    --model_dir ./Meta-Llama-3.1-8B-Instruct \
    --output_dir ./trt_ckpt/fp16 \
    --dtype float16 \
    --tp_size 1

# 或 FP8 量化(只在 H100/H200 真有效)
python ../quantization/quantize.py \
    --model_dir ./Meta-Llama-3.1-8B-Instruct \
    --dtype float16 \
    --qformat fp8 \
    --kv_cache_dtype fp8 \
    --output_dir ./trt_ckpt/fp8

# 3. build engine(几分钟到几十分钟)
trtllm-build \
    --checkpoint_dir ./trt_ckpt/fp8 \
    --output_dir ./trt_engines/fp8/llama3.1-8b \
    --gemm_plugin fp8 \
    --max_batch_size 64 \
    --max_input_len 4096 \
    --max_seq_len 8192 \
    --max_num_tokens 16384 \
    --use_paged_context_fmha enable \
    --use_fp8_context_fmha enable

# 4. 起服务
trtllm-serve \
    --model ./trt_engines/fp8/llama3.1-8b \
    --tokenizer ./Meta-Llama-3.1-8B-Instruct \
    --port 8000 \
    --max_batch_size 64
```

OpenAI 兼容 endpoint(`/v1/completions`、`/v1/chat/completions`)从 0.13 起算稳定。Python SDK 里也有 `LLM` 直接 API:

```python
from tensorrt_llm import LLM, SamplingParams

llm = LLM(model="./trt_engines/fp8/llama3.1-8b",
          tokenizer="./Meta-Llama-3.1-8B-Instruct")
sampling = SamplingParams(temperature=0.7, max_tokens=128)
out = llm.generate(["你好"], sampling)
print(out[0].outputs[0].text)
```

### 3.3 几个 build 参数的含义

| 参数 | 含义 | 设错代价 |
| --- | --- | --- |
| `--max_batch_size` | engine 支持的最大并发请求数 | 设小 → 高并发跑不满;设大 → 显存预留浪费 |
| `--max_input_len` | 最长输入(prefill)长度 | 设小 → 长 prompt 报错;设大 → workspace 浪费 |
| `--max_seq_len` | 最长总序列(prompt + output) | 同上,KV pool 大小由它决定 |
| `--max_num_tokens` | 单 step 处理的总 token 数(chunked prefill 用) | 太小 → prefill 慢;太大 → 单 step 时间过长 |
| `--gemm_plugin` | matmul 用的 plugin(`fp8`/`fp16`/`bf16`) | 必须和 checkpoint 精度匹配 |
| `--use_paged_context_fmha` | prefill 时用 paged 注意力 | 长 prompt 必开 |
| `--use_fp8_context_fmha` | FP8 prefill 注意力 | 仅 H100+ 且 FP8 模型 |

**这些参数定下来后才能 build,build 出来的 engine 只在这个配置下高效**。要开 batch=128 的版本?重新 build。要扩到 32K 上下文?重新 build。

---

## 四、核心优化武器

### 4.1 算子融合(Kernel Fusion)

把多个相邻算子的 CUDA kernel 合成一个,中间张量不写回 HBM:

```
未融合:
   x → Linear → tmp1 (写 HBM)
   tmp1 → RMSNorm → tmp2 (写 HBM)
   tmp2 → SiLU → tmp3 (写 HBM)
   tmp3 → Linear → out (写 HBM)
   
   每步都有 kernel launch + HBM 来回。

融合后(一个 kernel):
   x → [Linear + RMSNorm + SiLU + Linear] → out
   中间 tmp 留在 SRAM / register,HBM 只读 x、写 out。
   消除 3 次 kernel launch + 6 次 HBM 中转。
```

TRT-LLM 内置了 LLM 常见的融合模式:

- **FlashAttention v2/v3**:Q/K/V 计算 + softmax + attention output 融合,中间矩阵不写 HBM
- **RMSNorm + Linear 融合**:LLM 每个 block 开头的 norm + 紧跟的 QKV proj 合并
- **FFN 融合**:`Linear → SiLU → Linear`(SwiGLU)合成一个 kernel
- **Rotary Position Embedding 融合**:RoPE 的 cos/sin 应用合进 attention kernel
- **Bias + Activation 融合**:常规 fuse 但累积起来可观

### 4.2 量化工具链

TRT-LLM 自带 `quantization/quantize.py`,一条命令出量化 checkpoint:

```bash
# FP8(权重 + 激活,H100+)
python quantize.py --model_dir hf_model --qformat fp8 \
    --kv_cache_dtype fp8 --output_dir trt_ckpt/fp8

# INT4 AWQ
python quantize.py --model_dir hf_model --qformat int4_awq \
    --awq_block_size 128 --output_dir trt_ckpt/int4_awq

# INT8 SmoothQuant
python quantize.py --model_dir hf_model --qformat int8_sq \
    --output_dir trt_ckpt/int8_sq
```

| 量化 | 精度损失 | 速度增益 | 显存节省 | 适用 |
| --- | --- | --- | --- | --- |
| FP8 | 极小 (~0.1-0.5 ppl) | 1.5-2x | 50% | H100/H200/B200 首选 |
| INT4 AWQ | 小 (~0.5-1 ppl) | ~2x | 75% | 显存紧张场景 |
| INT8 SmoothQuant | 中 | 1.3-1.5x | 50% | A100 / 老卡 |
| INT4 + KV INT8 | 大 (1-2 ppl) | 3x+ | 80% | 极致省钱,可接受精度损失 |

**FP8 + KV cache FP8** 是 H100+ 上推理的当下标配——精度几乎无损,**显存对半**(模型权重和 KV cache 都减半),decode 速度因 HBM 带宽节省再快 1.5x+。

### 4.3 In-flight Batching

跟 vLLM 的 Continuous Batching 是同一件事(09 篇讲过),不同名字:

```
传统 batching: 8 条一起来一起结束,慢的拖快的
in-flight:    完成一条立刻塞新请求,GPU 永远忙
```

TRT-LLM 的 in-flight batching 由 C++ runtime 调度,**没有 Python 调度开销**——这是它对小 batch 场景仍能比 vLLM 快的关键之一。

### 4.4 Paged KV Cache

跟 vLLM PagedAttention 同思路:KV cache 切固定 block,按需分配,消除碎片。TRT-LLM 把 block 粒度做得更细(可配 16/32/64/128),并支持:

- **Block reuse**:多请求共享 system prompt 时复用(等价 vLLM 的 prefix caching)
- **KV quantization**:KV 用 FP8 / INT8 存,带宽和容量同步降
- **Chunked prefill**:长 prompt 切块多 step 跑,避免一次性占满

### 4.5 Multi-block Attention / Multi-query Attention

针对长上下文 prefill 的内核优化:

```
Multi-block attention(长 prefill):
   把 KV 在序列维度切块,多个 SM 并行算同一个 head 的不同段
   长 prompt(8K+)prefill 加速明显

Multi-query / Grouped-query attention:
   K/V head 数远小于 Q head 数(GQA / MQA 模型,如 Llama 3 / Qwen 2)
   TRT-LLM 内核针对这种结构生成专门 kernel,
   省掉重复的 K/V 加载
```

### 4.6 Plugin 系统

TRT-LLM 允许写 C++/CUDA Plugin 注入自定义算子。你写一个 `.so`,实现 TRT 的 Plugin 接口(`enqueue` / `getOutputDimensions` / `serialize`),`trtllm-build` 时通过 Python 构图把它接进图里,build 完就当 native 算子用。

```cpp
// 简化示意
class MyCustomFusion : public IPluginV2DynamicExt {
    int enqueue(const PluginTensorDesc* inputs, ..., 
                cudaStream_t stream) override {
        // 调用你的 CUDA kernel
        myFusedKernel<<<..., stream>>>(...);
        return 0;
    }
    // 其他 TRT 接口
};
```

实际工程价值:**业务有特殊算子(自定义采样、特殊归一化、专用结构)** 时不被框架卡住。绝大多数团队用不到,但能用到这层时它确实救命。

---

## 五、Triton Inference Server + TRT-LLM:NVIDIA 推的生产形态

`trtllm-serve` 是单进程一模型一端口的简化方案,实际生产 NVIDIA 推的是 Triton:

```
                ┌────────────────────────┐
                │  Triton Inference Server│
                │  (HTTP/gRPC, metrics)   │
                └────────────────────────┘
                      │     │     │
            ┌─────────┘     │     └────────┐
            ▼               ▼              ▼
      ┌─────────┐    ┌─────────┐   ┌─────────┐
      │ TRT-LLM │    │ TRT-LLM │   │  其他    │
      │ Llama   │    │ Qwen    │   │  Triton │
      │ engine  │    │ engine  │   │ backend │
      └─────────┘    └─────────┘   └─────────┘
```

Triton 的价值:

- **多模型路由 + 并发**:同一服务挂多个 engine,按请求路由
- **动态 batching + 调度策略**:在 in-flight batching 之上加更高层的请求合并
- **Metrics + Health + Model Repository**:生产服务的标准件
- **多 Backend**:除了 TRT-LLM,还可以挂 ONNX / TensorRT(非 LLM)/ vLLM / Python backend

26 篇会展开 Ray Serve 跟 Triton 的对比——简短结论:**Triton 在「单服务多模型 + NVIDIA 全家桶」场景最稳;Ray Serve 在「Python 生态 + 多框架混部」场景更通用**。

---

## 六、什么时候 TRT-LLM 真比 vLLM 快(以及快多少)

### 6.1 真有显著优势的场景

```
NVIDIA H100 / H200 / B200
+ FP8 量化
+ batch ≥ 16
+ 模型相对稳定(几个月不动)
+ 团队有 1 个工程师能 build engine 和排坑

→ TRT-LLM 比 vLLM 快 20-50%(吞吐),具体看模型
→ 长上下文 prefill 上 multi-block attention 优势更大
```

### 6.2 没差或反而慢的场景

```
A100 或更老的卡
→ FP8 用不上,主要优势没了,差距缩到 0-15%

batch = 1-4(单用户、低并发)
→ vLLM 的 Python 调度开销在低并发下不明显
→ TRT-LLM 的 engine 启动 + load 开销可能拖慢

模型经常切(调研 / 多模型 / 频繁 fine-tune 上线)
→ 每次重 build engine,工程时间被吃光

需要 multi-LoRA 路由
→ TRT-LLM 的 LoRA 支持比 vLLM 弱

需要跨厂商 GPU(AMD / 国产卡)
→ TRT-LLM 完全不支持
```

### 6.3 一张实战决策表

| 场景 | 推荐 | 原因 |
| --- | --- | --- |
| 创业公司 MVP / 小团队自部署 | vLLM | 工程成本低,够用 |
| 中等流量 API 服务,模型 1-2 个,稳定 | vLLM(SGLang 看场景) | 维护成本低 |
| 大流量公共 API,H100/H200 集群 | TRT-LLM + Triton | 极致成本,工程投入摊得开 |
| 搜索 / 推荐里 LLM 当 ranker | TRT-LLM | QPS 大、模型稳、SLO 严 |
| Agent 系统 / RAG 多轮 | SGLang | RadixAttention 是关键 |
| 多 LoRA 多租户 | vLLM | LoRA 路由更熟 |
| 实验 / 研究 / 频繁换模型 | vLLM | 重 build 时间会要命 |
| 国产卡 / AMD / 海外受限场景 | vLLM | TRT-LLM 不支持 |

---

## 七、踩坑提醒

1. **engine 与 GPU 型号、CUDA 版本、TRT 版本严格绑定**——H100 build 的不能在 A100 跑,不同 minor 版本可能也不通用。CI 里要为每种目标硬件分别 build。
2. **`max_batch_size` / `max_seq_len` 决定显存预留**——设大了显存被预占,实际并发反而下降。和真实流量对齐。
3. **build 时间长**——8B 模型 5-15 分钟,70B 模型 30-60 分钟。多模型 / 多硬件矩阵 → CI 时间爆炸。
4. **量化 calibration 数据**——AWQ / SmoothQuant 需要 256-1024 条 calibration 样本,样本质量差直接掉精度,**用业务真实分布的样本**。
5. **FP8 不是处处可用**——H100 / H200 / B200 才有,A100 没有(只有 INT8)。
6. **`--use_fp8_context_fmha` 和 prompt 长度有兼容性**——某些 seq 长度配置下会回退到 FP16,提前测一遍真实分布的长度。
7. **Plugin 写错可能 silent corruption**——TRT 不会救你,自己写的 kernel 没对齐内存可能跑出乱码而不是 crash。Plugin 写完务必跑端到端精度对比。
8. **debug 难**——engine 是 binary,出错只能开 verbose log,看 NVIDIA 工具(`trtexec` / `polygraphy`)。习惯了 PyTorch stack trace 的人会很痛苦。
9. **OpenAI API 兼容性**——0.13+ 才算稳,早期版本边缘 case 多。生产前跑完整客户端 SDK 测试。
10. **Triton + TRT-LLM 镜像很大(~20GB)**——K8s 冷启动慢,做 image warm pool。
11. **Python SDK 和 C++ runtime 版本要严格对齐**——跨版本不通用是常态。
12. **多卡 TP build 时定死**——build 时 `--tp_size 4` 的 engine 只能在 4 卡 TP 下跑,换 8 卡要重 build。

---

## 八、和 vLLM / SGLang 的工程位置总结

```
                   vLLM             SGLang            TRT-LLM
                   ────             ──────            ───────
适配速度           最快(任何 HF) 主流齐全          NVIDIA 主导节奏
开箱性能           8/10             8/10              9.5/10 (H100+ FP8)
长前缀复用         prefix cache     RadixAttention    block reuse
结构化输出         outlines 集成    Compressed FSM    constrained decoding
跨硬件             ✅ 含 AMD       ✅ 主流广          ❌ 仅 NVIDIA
迭代成本           低               低                高(重 build)
debug 难度         低               低                高
适合阶段           研发→中等流量    Agent / 多轮 / RAG 大流量稳定生产
```

**实操选型**:多数团队走「vLLM 起步,Agent 场景换 SGLang,流量大且稳了再上 TRT-LLM」三段式。直接上 TRT-LLM 的团队往往低估了 build 工程链的维护成本。

---

## 九、看完这一篇,你应该能

- 解释 TRT-LLM 跟 vLLM 的本质差异(编译 vs 解释,engine binary vs Python 调度)
- 默写 TRT-LLM 的编译流程(HF → checkpoint convert → engine build → runtime 加载)
- 列出 TRT-LLM 的核心优化武器(算子融合 / 量化工具链 / In-flight Batching / Paged KV / Plugin)
- 解释为什么 engine 与 GPU 型号绑定,改任何东西都要重 build
- 在白板讨论中说清"什么时候 TRT-LLM 真比 vLLM 快"(NVIDIA + FP8 + 大 batch + 模型稳)
- 看到一个推理需求,能判断该上 vLLM / SGLang / TRT-LLM 哪个
- 知道 Triton + TRT-LLM 是 NVIDIA 推的生产形态,但不是唯一选择

下一篇:**13 数据并行 DDP** — 第二层「推理引擎」讲完,从这里转向第三层「训练框架与并行」。先从最基础的数据并行开始:DP 为什么死了、DDP 凭什么活下来、All-Reduce / Bucket / 梯度同步的代价从哪来,以及为什么单 DDP 撑不到大模型——这是 ZeRO / FSDP / TP / PP 出现的起点。
