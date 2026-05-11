# 推理引擎深入:vLLM、SGLang、TensorRT-LLM

33 篇里把 KV Cache、量化、连续批处理这些**概念**讲过一遍。这一篇把当今三大主流推理引擎**vLLM、SGLang、TensorRT-LLM** 拆开看:它们各自的杀手锏、什么场景该用哪个、怎么部署、怎么压榨吞吐。如果你要自部署模型扛生产流量,这一篇是直接对应的"工具书"。

> 一句话先记住:**vLLM 是通用基座(PagedAttention),SGLang 是为复杂提示与结构化场景优化(RadixAttention + 前端 DSL),TensorRT-LLM 是 NVIDIA 自家的极致压榨(深度量化 + 算子融合)**。三者不是替代关系,是不同生态位。

---

## 一、先重温:推理为什么这么难

### 1.1 两个阶段

```
Prefill(预填充):一次性处理完整 prompt
  → 计算密集,GPU 利用率高
  → 时间 ∝ prompt_len^2(attention)

Decode(逐词生成):一次出一个 token
  → 显存带宽密集,GPU 利用率低
  → 时间 ∝ context_len(每步要读全量 KV)
```

### 1.2 KV Cache 是显存大户

每生成一个 token,要为每层每个 head 存 K/V 向量:

```
KV cache 大小 = 2 × n_layers × n_heads × head_dim × seq_len × batch × dtype_size

LLaMA-3-70B,seq=8K,batch=32,FP16
= 2 × 80 × 8 × 128 × 8192 × 32 × 2 bytes
≈ 86 GB
```

**KV cache 经常比模型权重还大**。所有推理引擎的优化大头都围绕它。

### 1.3 三大优化目标

| 目标 | 关键技术 |
| --- | --- |
| **吞吐(Throughput)** | 连续批处理、PagedAttention、Prefix 缓存 |
| **延迟(TTFT / ITL)** | Prefill 优化、speculative decoding、量化 |
| **成本($/M tokens)** | 量化、模型并行、调度策略 |

**没有"全都最强"的引擎,只有"在你的场景下最优"**。

---

## 二、vLLM:开源推理事实标准

UC Berkeley 2023 年出品,论文 "Efficient Memory Management for Large Language Model Serving with PagedAttention"。两年内成为开源推理引擎默认选项。

### 2.1 PagedAttention:KV cache 的"虚拟内存"

传统做法:为每个 request 预留一段连续 KV cache 空间。
问题:**碎片化严重 + 浪费**——request 可能没用完那么长。

PagedAttention 的灵感来自操作系统 paging:

```
KV cache 切成固定大小的 block(典型 16 个 token)
       ↓
每个 sequence 维护一个 block table:逻辑位置 → 物理 block
       ↓
分配按需,块共享(prompt 相同的部分多个 request 共用)
```

效果:**KV cache 利用率从 20-40% 提到 90%+**,等同于把可服务并发翻 2-4 倍。

### 2.2 Continuous Batching(连续批处理)

传统 static batch:8 条一起来,一起结束,慢的拖快的。
Continuous batching:**每完成一条,立即把新请求填进 batch**,GPU 永远忙。

这两件事(PagedAttention + Continuous Batching)是 vLLM 的核心,合起来就能在同样硬件上把吞吐拉到 SOTA。

### 2.3 Prefix Caching

多条请求共享 system prompt 时,前缀部分的 KV cache 可以复用:

```
Request A: [system_prompt, "用户问题1"]
Request B: [system_prompt, "用户问题2"]
                ↑
       这一段 KV 算一次,B 直接命中
```

Agent 场景(每条请求几 K 的固定上下文)收益巨大,QPS 翻倍很常见。

### 2.4 部署示例

```bash
# 安装(支持 CUDA 12)
pip install vllm

# 启 OpenAI 兼容 server
python -m vllm.entrypoints.openai.api_server \
    --model meta-llama/Meta-Llama-3.1-8B-Instruct \
    --port 8000 \
    --max-model-len 8192 \
    --tensor-parallel-size 2 \
    --gpu-memory-utilization 0.92 \
    --enable-prefix-caching \
    --quantization awq           # 可选,4bit AWQ 量化模型
```

客户端就是普通 OpenAI SDK:

```python
from openai import OpenAI
client = OpenAI(base_url="http://localhost:8000/v1", api_key="EMPTY")
resp = client.chat.completions.create(
    model="meta-llama/Meta-Llama-3.1-8B-Instruct",
    messages=[{"role": "user", "content": "你好"}],
)
```

### 2.5 vLLM 的强项 / 弱项

✅ 通用、生态好、绝大多数模型一键跑
✅ Multi-LoRA(同一 base 上挂多个 LoRA,按 request 切换)
✅ Spec decoding(草案模型加速)
✅ 兼容 OpenAI API,迁移零成本
⚠️ 极致吞吐略输 TensorRT-LLM(尤其在 H100 上)
⚠️ 复杂控制流(分支/状态)需要自己在 client 编排

> **如果你不知道该用哪个,默认用 vLLM**。这是最稳妥的选择。

---

## 三、SGLang:为复杂提示和结构化输出而生

LMSYS 团队(Vicuna / Chatbot Arena 那帮人)2024 年出品。它的目标不是"再吐快一点",而是**让复杂 LLM 程序(多轮、多分支、JSON / 调工具)变得高效**。

### 3.1 RadixAttention:Prefix Cache 的进化版

vLLM 的 prefix cache 是单棵树根。SGLang 用 **radix tree(前缀树)** 同时缓存所有出现过的前缀:

```
所有历史请求的 prompt 构成一棵 radix tree
  ↓
新请求 lookup 最长公共前缀
  ↓
直接复用 KV,只算新 token

优化场景:
  - Few-shot:多个请求共享一长串示例
  - Agent:多步交互,每步累加历史
  - Tree-of-Thought:并行多分支共享前段
```

在 ToT / 多 Agent / 长 system prompt 场景,**端到端加速 2-5 倍**。

### 3.2 前端 DSL:复杂控制流的声明式表达

```python
import sglang as sgl

@sgl.function
def multi_turn_qa(s, question):
    s += sgl.system("你是科学顾问")
    s += sgl.user(question)
    s += sgl.assistant(sgl.gen("answer", max_tokens=256))
    s += sgl.user("再用一句话总结")
    s += sgl.assistant(sgl.gen("summary", max_tokens=64))

state = multi_turn_qa.run(question="为什么天是蓝的?")
print(state["answer"], state["summary"])
```

引擎能看懂控制流,**自动并行 / 共享 KV / 避免重复 prefill**。

### 3.3 结构化输出加速(constrained decoding)

让模型只能输出合法 JSON / regex / EBNF 语法的 token——SGLang 集成了 `xgrammar`,在 grammar 受限时仍能保持高吞吐。

```python
@sgl.function
def extract_email(s, text):
    s += "Extract email from: " + text
    s += sgl.gen("email", regex=r"[\w.]+@[\w.]+")
```

vLLM 也有 outlines/lm-format-enforcer 集成,但 SGLang 在受限解码下吞吐衰减更小。

### 3.4 部署

```bash
pip install "sglang[all]"

python -m sglang.launch_server \
    --model-path meta-llama/Meta-Llama-3.1-8B-Instruct \
    --port 30000 \
    --tp 2
```

也提供 OpenAI 兼容 endpoint。

### 3.5 SGLang 强项 / 弱项

✅ 长 system prompt + 高 QPS Agent 场景王者
✅ 结构化输出 / 工具调用快且稳
✅ DeepSeek、Llama、Qwen、Mixtral 优化齐全(MoE 推理也强)
⚠️ 学习曲线略高(DSL)
⚠️ 模型支持广度略不及 vLLM

> **跑 Agent 系统、多轮对话、ToT 推理 → SGLang 通常是最佳选择**。简单 chat 场景跟 vLLM 差距不大。

---

## 四、TensorRT-LLM:NVIDIA 的极致压榨

NVIDIA 自己开源(2023)。底层基于 TensorRT,**专门为 NVIDIA 卡(尤其 H100/H200/B200)做编译期优化**。

### 4.1 它和 vLLM/SGLang 的根本差异

```
vLLM / SGLang:Python + PyTorch,启动即跑
TensorRT-LLM:先 build(编译为 engine 文件),再 deploy
```

build 阶段:

- 算子融合(Linear + GELU + Norm 合成一个 CUDA kernel)
- 量化方案植入(SmoothQuant / AWQ / FP8 / INT4)
- 形状专门化(指定 batch 范围、seq 长度)
- Graph capture(消除调度开销)

代价:**每改一次配置都要重新 build,几十分钟**。回报:H100 上比 vLLM 再快 20-50%,H200/B200 差距更大。

### 4.2 杀手级特性

| 特性 | 说明 |
| --- | --- |
| **FP8** | H100 原生支持,精度损失小、速度比 FP16 翻倍 |
| **In-flight batching** | 等同 continuous batching,但更深的内核优化 |
| **Speculative decoding** | 内置 draft model 加速 |
| **Multi-block attention** | 长序列 prefill 切块并行 |
| **Tensor / Pipeline / Expert 并行** | 70B+ MoE 部署的标配 |

### 4.3 部署流程示意

```bash
# 1. 准备:从 HF 下模型权重
git clone https://github.com/NVIDIA/TensorRT-LLM
cd TensorRT-LLM/examples/llama

# 2. Build engine(关键步骤)
python convert_checkpoint.py --model_dir ./Llama-3.1-8B-Instruct \
    --output_dir ./trt_ckpt --dtype float16

trtllm-build --checkpoint_dir ./trt_ckpt \
    --output_dir ./trt_engines \
    --gemm_plugin float16 \
    --max_batch_size 64 \
    --max_input_len 4096 \
    --max_output_len 2048 \
    --use_paged_context_fmha enable

# 3. 用 Triton Inference Server 部署
# (官方 docker image 把 trt-llm + Triton 打包好了)
```

或者用更高层的 **`trtllm-serve`**(2024 年起官方在向"开箱即用"靠拢):

```bash
trtllm-serve --model_path ./trt_engines --port 8000
```

### 4.4 强项 / 弱项

✅ 同硬件极限性能
✅ 大企业 / 云厂商生产部署首选
✅ FP8 / B200 等新硬件特性最先支持
⚠️ 只跑 NVIDIA 卡(AMD / 国产卡用别的)
⚠️ 配置复杂,build 耗时
⚠️ 调试困难(engine 是 binary)
⚠️ 模型支持依赖 NVIDIA 官方适配速度

> **追求成本极致 + 流量大 + 在 H100/H200 上 → TensorRT-LLM**。中小流量或快速实验,不值得这复杂度。

---

## 五、横向对比

| 维度 | vLLM | SGLang | TensorRT-LLM |
| --- | --- | --- | --- |
| **上手难度** | ⭐ 低 | ⭐⭐ 中 | ⭐⭐⭐ 高 |
| **吞吐(simple chat)** | 8/10 | 8/10 | **9.5/10** |
| **吞吐(long prefix Agent)** | 7/10 | **9/10** | 7/10 |
| **结构化输出** | 6/10 | **9/10** | 7/10 |
| **量化支持** | AWQ/GPTQ/INT8 | AWQ/GPTQ/FP8 | **FP8/INT8/INT4** 全套 |
| **多 LoRA** | ✅ | ✅ | ⚠️ 有限 |
| **跨厂商 GPU** | ✅(AMD ROCm) | ✅ | ❌ NVIDIA only |
| **生态(HF 模型支持)** | **最广** | 中 | 看 NVIDIA 适配 |
| **OpenAI API 兼容** | ✅ | ✅ | 通过 Triton |
| **MoE 优化** | 中 | **强** | 强 |

### 简单选型决策树

```
你跑什么模型?
├─ 国产卡 / AMD → vLLM(SGLang 也开始支持)
└─ NVIDIA →
    流量类型?
    ├─ 高 QPS chat,运维少投入 → vLLM
    ├─ 长 system prompt + Agent → SGLang
    └─ 极致成本 + 大流量 + 愿意工程投入 → TensorRT-LLM
```

---

## 六、量化:三家共同的省钱杠杆

| 量化方法 | 精度损失 | 速度增益 | 适用 |
| --- | --- | --- | --- |
| **FP8** | 极小 | 1.5-2x | H100/H200(三家都支持) |
| **AWQ**(4bit) | 小 | ~2x | 主流权重量化(三家都支持) |
| **GPTQ**(4bit) | 小 | ~2x | 老一些但仍主流 |
| **INT8 SmoothQuant** | 中 | 1.5x | TensorRT-LLM 强项 |
| **INT4 + KV INT8** | 大 | 3x+ | 极致省成本场景 |

> 不要"FP16 跑生产"。AWQ 4bit 几乎免费的 2 倍提速,**没有不开的理由**。

---

## 七、推理性能基本功:你必须监控的指标

| 指标 | 含义 | 目标 |
| --- | --- | --- |
| **TTFT** | Time to First Token,prefill 完成时间 | chat: <500ms,Agent: <2s |
| **ITL** | Inter-Token Latency,decode 平均间隔 | <50ms 流畅,>100ms 慢 |
| **Throughput** | tokens/sec 总量(整机所有请求) | 越高越好 |
| **GPU util** | nvidia-smi 显示的算力占用 | decode 阶段 30-60% 算正常 |
| **KV cache util** | KV 占总分配显存比例 | 60-90% 是健康区间 |
| **Concurrency** | 在飞请求数 | 看你的目标 SLO 推 |

vLLM / SGLang 都内置 metrics endpoint(Prometheus 格式),Grafana 接进去即可。

---

## 八、配套工具链

- **Inference benchmark**:`vllm bench`、`sglang bench`、`genai-perf`(NVIDIA)
- **模型量化**:AutoAWQ、AutoGPTQ、TensorRT-LLM 自带的 quantize 脚本
- **Spec decoding 草案模型**:Llama-3.2-1B 给 8B 当草案,Qwen2.5-0.5B 给 32B 当草案
- **路由层**:LiteLLM(同一接口下挂多家 / 多模型)、AWS Bedrock proxy
- **观测**:Langfuse / Helicone / 自建 Prometheus

---

## 九、踩坑提醒

1. **`max_model_len` 决定 KV cache 池大小**,设得太大显存全被预留,实际并发反而降。按你 P99 输入长度设。
2. **`gpu_memory_utilization` 别贪 0.95**。给系统留 buffer,OOM 重启会拖整个集群。0.88-0.92 是稳妥区间。
3. **多卡 TP 不是越多越好**。8B 用 2 卡 TP 反而比 1 卡慢——通信开销吃掉收益。粗略经验:7-13B 用 1 卡,30B 用 2 卡,70B 用 4-8 卡。
4. **prefix cache 命中靠 system prompt 完全一致**。一字不差。**别在 system 里塞当前时间**,会让命中率归零。
5. **TensorRT-LLM build 要锁版本**。CUDA / driver / TRT-LLM 版本严格匹配,跨版本 engine 不通用。
6. **SGLang 的 DSL 在客户端跑**,服务端只看请求。别误以为前端 DSL 能减少网络往返。
7. **量化模型≠精度无损**。AWQ 4bit 在数学/代码任务上掉 2-5 个点常见。生产用前必跑 eval。
8. **Spec decoding 不一定加速**。草案模型若 acceptance rate < 50%,反而拖慢。先 benchmark。
9. **Triton + TensorRT-LLM 镜像很大**(~20GB)。冷启动慢,做好 K8s warm pool。
10. **国产卡(昇腾 / 摩尔线程 / 海光)别想用 TensorRT-LLM**。要么 vLLM 适配,要么厂商自家推理栈。

---

## 十、一张总表收官

| 你的场景 | 推荐 |
| --- | --- |
| 个人本地玩、Mac M 系列 | **Ollama / llama.cpp**(不在本篇范围,但好用) |
| 中小团队自部署、单 / 多卡 NVIDIA | **vLLM** |
| 长上下文 Agent / 多轮对话 / ToT | **SGLang** |
| 大流量生产 + H100/H200 + 工程团队 | **TensorRT-LLM**(配 Triton) |
| 多模型多 LoRA 路由 | vLLM(multi-LoRA)+ LiteLLM |
| 不想自部署 | **直接用 API**(Anthropic / OpenAI / Together / Fireworks) |

> **真便宜不是自部署**,是**自部署 + 高利用率**。如果你的 GPU 平均利用率 < 30%,自部署比 API 还贵。先把利用率拉满,再谈降本。

---

至此,从神经元到推理引擎,这条线串完了。第 36 篇是综合实战,这五篇(37-41)是当下最热的几个补充方向。回到学习路径上来:**原理打底 → 应用范式 → Agent 编排 → 工程部署**——你已经走完一圈,接下来就是不停做项目、看新论文、把单点能力打深。
