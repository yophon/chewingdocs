# Ray Serve 与 vLLM:推理服务化的事实组合

25 篇讲了 Ray 的运行时心智,这一篇下沉到推理服务一侧——你训完一个 70B 模型,怎么把它**变成一个能扛 1000 QPS、延迟稳定、副本能自动扩缩、版本能蓝绿发布的 HTTP 服务**?这不是 vLLM 一个引擎能搞定的事,vLLM 解决的是「单卡 / 单副本怎么把 token 吐快」(详见 06-12),服务化要解决的是这个引擎之外的一圈:HTTP 入口、多副本、autoscaling、灰度、健康检查、模型路由。Ray Serve + vLLM 是这一层在 2026 的事实组合。

> 一句话先记住:**Ray Serve = 推理服务化的应用层框架,vLLM = 推理引擎**;Ray Serve 给你 Deployment / Replica / Application 三层抽象,vLLM 嵌在 Deployment 里跑;autoscaling 指标必须选「队列长度」而不是 QPS,因为 LLM 请求长度差异让 QPS 完全失真。

---

## 一、推理服务化要解决的事

把一个 vLLM 进程包成生产服务,你要解决一长串问题:

```
单进程 vLLM 启动:
   python -m vllm.entrypoints.openai.api_server --model llama-70b ...
   
   ↑ 一个进程、一台机器、一个端口
     挂了请求全断、扩不了量、灰度不了、监控要自己接
```

生产要的是这一圈:

```
                          ┌──────────────────────┐
                          │   客户端 / 上游服务      │
                          └──────────┬───────────┘
                                     │ HTTP / gRPC
                          ┌──────────▼───────────┐
                          │   Ingress / LB         │
                          └──────────┬───────────┘
                                     │
                          ┌──────────▼───────────┐
                          │   HTTP Proxy (路由)    │  ← 多模型 / 灰度
                          └──────────┬───────────┘
                                     │
        ┌─────────────────────────────┼─────────────────────────────┐
        ▼                             ▼                             ▼
   ┌──────────┐                  ┌──────────┐                  ┌──────────┐
   │ Replica1 │                  │ Replica2 │                  │ Replica3 │
   │ vLLM     │                  │ vLLM     │                  │ vLLM     │
   │ 1 GPU    │                  │ 1 GPU    │                  │ 1 GPU    │
   └──────────┘                  └──────────┘                  └──────────┘
        ↑                             ↑                             ↑
        └─────────────┬───────────────┴──────────────┬──────────────┘
                      │                              │
                  健康检查                       Autoscaler
                  (是否 ready)                  (按队列长度扩缩)
```

具体清单:**HTTP 入口 + 多副本 + 自动扩缩容 + 灰度 + 健康检查 + 流式输出 + 路由 + 监控**——这些都是 Ray Serve 包揽的事。

---

## 二、Ray Serve 的核心抽象

```
Application (一个完整的推理服务,可能多个 deployment 组合)
   │
   ├─ Deployment A: 路由 / 预处理(轻量)
   │     ├─ Replica 1 (CPU)
   │     ├─ Replica 2 (CPU)
   │     └─ Replica 3 (CPU)
   │
   └─ Deployment B: vLLM 推理(重)
         ├─ Replica 1 (1 GPU)
         ├─ Replica 2 (1 GPU)
         └─ Replica 3 (1 GPU)
```

| 抽象 | 是什么 | 类比 |
| --- | --- | --- |
| **Deployment** | 一种推理服务的逻辑单元(一段代码 + 配置)| K8s Deployment |
| **Replica** | Deployment 的一个运行实例(一个 Ray Actor)| K8s Pod |
| **Application** | 多个 Deployment 组成的服务图(DAG 路由)| 一个微服务子系统 |

**Deployment 一段最小代码**:

```python
from ray import serve

@serve.deployment(num_replicas=3, ray_actor_options={"num_gpus": 1})
class HelloModel:
    def __init__(self):
        self.model = load_model()

    async def __call__(self, request):
        text = await request.body()
        return self.model.generate(text)

serve.run(HelloModel.bind())
```

`num_replicas=3` → 起 3 个独立 Actor,各占 1 GPU,Ray Serve 自动起 HTTP Proxy 把请求路由过来。

---

## 三、用 Ray Serve 部署 vLLM:最小可跑代码

```python
from ray import serve
from vllm import AsyncLLMEngine, AsyncEngineArgs, SamplingParams
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse

app = FastAPI()

@serve.deployment(
    num_replicas=2,                                # 初始 2 副本
    ray_actor_options={"num_gpus": 1},             # 每副本 1 GPU
    autoscaling_config={                           # 自动扩缩容
        "min_replicas": 1,
        "max_replicas": 8,
        "target_ongoing_requests": 16,             # 关键:按队列长度扩
        "upscale_delay_s": 30,
        "downscale_delay_s": 600,                  # 缩容慢一点,避免抖动
    },
    max_ongoing_requests=32,                       # 单副本最大并发
)
@serve.ingress(app)
class VLLMDeployment:
    def __init__(self, model_id: str):
        engine_args = AsyncEngineArgs(
            model=model_id,
            tensor_parallel_size=1,
            gpu_memory_utilization=0.9,
            max_model_len=8192,
            enable_prefix_caching=True,
        )
        self.engine = AsyncLLMEngine.from_engine_args(engine_args)

    @app.post("/v1/chat/completions")
    async def chat(self, request: Request):
        body = await request.json()
        prompt = body["messages"][-1]["content"]
        sampling = SamplingParams(
            temperature=body.get("temperature", 0.7),
            max_tokens=body.get("max_tokens", 512),
        )

        async def stream():
            async for output in self.engine.generate(prompt, sampling, request_id=...):
                yield f"data: {output.outputs[0].text}\n\n"

        return StreamingResponse(stream(), media_type="text/event-stream")

# 部署
serve.run(VLLMDeployment.bind(model_id="meta-llama/Llama-3-70B-Instruct"))
```

跑起来你拿到一个 OpenAI 兼容的 HTTP 端点,自动起 2 个副本(各占 1 GPU),队列长了自动扩到 8 个,空了缩回 1 个。**这个 80 行代码替代了一个团队三个月做的「自研推理网关」**。

---

## 四、请求路由拓扑

```
客户端
  │
  │  POST /v1/chat/completions
  ▼
┌──────────────────────────────────────┐
│   Ray Serve HTTP Proxy (uvicorn)       │   ← 部署在 Head 或单独 proxy 节点
│   - 收 HTTP                             │
│   - 找路由(哪个 deployment)             │
│   - 选副本(round-robin / least-load)   │
└──────────────────────────────────────┘
                  │
                  │  内部 RPC (Ray Actor 调用)
                  ▼
       ┌─────────────────────────┐
       │   Replica 选择            │
       │   - 负载均衡(least busy) │
       │   - 排队(进 ongoing 队列)│
       └─────────────────────────┘
                  │
       ┌──────────┼──────────┐
       ▼          ▼          ▼
  ┌─────────┐ ┌─────────┐ ┌─────────┐
  │Replica 1│ │Replica 2│ │Replica 3│
  │  ┌────┐ │ │  ┌────┐ │ │  ┌────┐ │
  │  │vLLM│ │ │  │vLLM│ │ │  │vLLM│ │   ← 每副本独立 vLLM 引擎
  │  │1 GPU│ │  │1 GPU│ │  │1 GPU│ │     内部做 Continuous Batching
  │  └────┘ │ │  └────┘ │ │  └────┘ │     (09 篇)
  └─────────┘ └─────────┘ └─────────┘
```

**关键细节**:
- HTTP Proxy 是**无状态**的,你可以起 N 个 proxy 副本(`http_options.num_replicas`),挂在同一个 LB 后
- Replica 选择默认 `power_of_two`(随机选 2 个挑负载小的);`least` 策略可选
- 一个请求进入 Replica 后,vLLM 内部把它丢进 continuous batching 的活动批次

---

## 五、Ray Serve + vLLM 的优势

### 5.1 vLLM 的 OpenAI 兼容 API 一行接入

vLLM 自带 `vllm.entrypoints.openai.api_server` 已经实现 OpenAI 协议,Ray Serve 只是把它包成可扩缩的 deployment——客户端代码完全不用改,从 `openai.OpenAI(base_url=...)` 直接打过来。

### 5.2 多模型路由:同集群跑多 deployment

```python
# 同一个集群跑 base + code + 量化版三个模型
serve.run(
    Application.bind({
        "/v1/chat": VLLMDeployment.bind(model_id="llama-70b"),
        "/v1/code": VLLMDeployment.bind(model_id="codellama-34b"),
        "/v1/cheap": VLLMDeployment.bind(model_id="llama-70b-awq"),
    })
)
```

或基于 header / 模型名的路由——一个网关后面接多个 base / 多个量化版本。

### 5.3 自动扩缩容

| 维度 | Ray Serve 行为 |
| --- | --- |
| 扩容触发 | `target_ongoing_requests` 阈值持续超过 |
| 扩容速度 | 受 `upscale_delay_s` 节流 + 受 placement group 资源可用性约束 |
| 缩容触发 | 持续低于阈值 `downscale_delay_s` 秒 |
| 资源整合 | Ray Autoscaler(集群层面)看 pending Actor → 开新 K8s Pod / EC2 实例 |

`target_ongoing_requests` 是 Ray Serve 推荐用的指标——本质是「队列长度 + 在跑请求数」,后面会展开。

### 5.4 与 Ray Train 共集群

训练完一个模型,直接在同一个 Ray 集群上把它 serve 起来——KV / 权重还在 Object Store 里,无需跨集群搬。Anyscale 的「Train + Serve 一体化」核心卖点。

---

## 六、RayLLM:开箱即用的模板

Anyscale 出的 **RayLLM**(开源,后来部分 fold 进 Ray Serve LLM API)是「Ray Serve + vLLM」的开箱即用包。它给你的:

```yaml
# rayllm-config.yaml
deployment_config:
  autoscaling_config:
    min_replicas: 1
    max_replicas: 8
    target_ongoing_requests: 16

engine_config:
  model_id: meta-llama/Llama-3-70B-Instruct
  engine: VLLMEngine
  tensor_parallel_degree: 2
  hf_model_id: meta-llama/Llama-3-70B-Instruct
  max_total_tokens: 8192
  s3_mirror_config:
    bucket_uri: s3://my-models/llama-3-70b/
```

```bash
serve run rayllm:builder rayllm-config.yaml
```

启动一个 OpenAI 兼容服务,**配置文件十几行**。RayLLM 内置了:
- 主流模型的合理默认参数(TP、内存、prefix caching)
- S3 / 私有 registry 拉取模型
- 多模型路由
- 内置的 metrics / dashboard
- 健康检查 + 模型预热

**它不是新引擎,只是把 Ray Serve + vLLM 的最佳实践打包成模板**。生产团队从 0 跑通一个 LLM 服务,从两周缩到一天。

Ray 2.x 之后这套 API 部分以 `ray.serve.llm` 模块进入主仓,RayLLM 项目本身的角色逐渐淡化。

---

## 七、与 Triton Inference Server 对比

NVIDIA 的 Triton 是另一套主流推理服务化方案,经常拿出来比。

```
                Triton Inference Server          Ray Serve + vLLM
                ────────────────────────         ──────────────────
出品               NVIDIA                          Anyscale (Ray) + UC Berkeley (vLLM)
语言               C++ 内核 + Python 后端           Python (Ray Actor + vLLM)
后端引擎           TensorRT-LLM / TF / PyTorch /   vLLM / SGLang
                  ONNX / Python / 多种            
极致性能           ★★★★★ (与 TRT-LLM 配合)        ★★★★ (vLLM 已经很强)
Python 友好        ★★ (Python backend 性能损失)  ★★★★★ (原生)
自动扩缩容         弱(要靠外部 K8s HPA)            ★★★★★ (内置)
多模型             模型仓库,reload                 一个 Actor 一个模型
                                                  (热加载弱)
灰度 / 蓝绿        模型仓库 version 管理             蓝绿 + canary 一等公民
开箱即用           中(要写 config.pbtxt)            高(Python 类即部署)
社区生态           NVIDIA 生态                      Python AI 生态
```

**选型建议**:

| 场景 | 推荐 |
| --- | --- |
| 全 NVIDIA 栈,极致性能优先,模型固定 | Triton + TRT-LLM |
| 多种模型并存(LLM + embedding + reranker)| Ray Serve(每个 Deployment 一个) |
| Python 业务代码深度集成、需要中间件 | Ray Serve + vLLM |
| LLM 为主、自动扩缩容、灰度需求强 | Ray Serve + vLLM |
| 非 LLM(CV、检索、传统 NN)生产推理 | Triton |

**真实情况**:Triton 在传统推理(CV、推荐打分)仍是头部选择;LLM 这一波,vLLM + Ray Serve / SGLang Server 这种 Python 友好的方案抢了大量份额——LLM 服务化对「快速接入新模型、灵活预处理 / 后处理、autoscaling」的需求,比对「极致 kernel 性能」更敏感。

---

## 八、冷启动问题:LLM 服务的特殊痛

普通 Web 服务冷启动是几百毫秒到几秒,LLM 是**几十秒到几分钟**:

```
Pod 起来                              0s
拉镜像 (10-30 GB,如果不在节点本地)    30-60s
模型权重从 S3 / NFS 下载 (140 GB)      30-300s  (取决于带宽)
vLLM engine 初始化                    20-60s   (CUDA Graph + KV pool 预分配)
预热请求(让 JIT / Cuda warm up)        5-20s
                                      ─────────────
                                      ~ 2-7 分钟
```

**autoscaling 触发时已经晚了**——队列堆起来再开新副本,几分钟后才能扛流量,期间用户全报超时。

应对手段:

1. **keep-warm**:`min_replicas` 设到能扛日常基线流量(不能用 0)
2. **超额预留**:扩容时一次扩 N 个副本,不是逐个加
3. **模型 cache 在节点本地**:避免每次扩容拉 S3
4. **镜像预拉**:K8s preloaded image / CSI 卷挂模型权重
5. **Disaggregated Prefill-Decode**(30 篇)的副作用:prefill 节点和 decode 节点可以独立扩,prefill 启动比整模型轻

---

## 九、优雅升级:模型版本切换

```python
# 老版本在跑
old = VLLMDeployment.bind(model_id="llama-70b-v1")
serve.run(old, name="llm")

# 部署新版本(蓝绿)
new = VLLMDeployment.bind(model_id="llama-70b-v2")
serve.run(new, name="llm")   # 原子切换,老 deployment 优雅 drain
```

Ray Serve 在切换时:
1. 起新 deployment 的 replica
2. 等新 replica ready
3. HTTP Proxy 把新流量路到新 replica
4. 老 replica 处理完 in-flight 请求后退出

**注意**:LLM 流式响应可能持续几十秒到几分钟,优雅 drain 时间设短了会断流——`graceful_shutdown_wait_loop_s` 必须 ≥ 最长生成时间。

灰度发布:Ray Serve 2.x 支持 `serve.run` 多版本同时挂载 + Application 内部自定义路由权重,一段代码做 5% / 95% 分流。

---

## 十、自动扩缩容指标该选什么:为什么不能用 QPS

**经典 Web 服务扩缩容指标是 QPS / CPU 利用率**——LLM 这两个都不能用:

| 指标 | 为什么 LLM 上不能用 |
| --- | --- |
| QPS | 一个 30K token 的请求和一个 30 token 的请求都是「1 个」,算上下文请求耗时差 100 倍。同样 QPS 下负载相差几个数量级 |
| GPU 利用率 | vLLM continuous batching 总能把 GPU 跑到 80%+,没区分「正在合理服务」和「过载」 |
| CPU 利用率 | 推理几乎不用 CPU |
| 显存占用 | 跟在跑请求数高度相关,但变化太快,扩容跟不上 |
| **队列长度 / Ongoing Requests** | **真正反映「积压」**:有多少请求在排队 + 在 in-flight,直接对应延迟体感 |
| TTFT / TPOT | 也行,但要采集 + 滑动窗口,延迟 30s |

Ray Serve 推荐的 `target_ongoing_requests`:

```
target_ongoing_requests = 16

# 含义:每个副本理想情况下同时承载 16 个请求(continuous batching 内的活批)
# 实际超过 → 扩
# 持续低于 → 缩
```

这个值**不是越高越好**:
- 太低 → 副本数多,GPU 利用不充分(autoscale 抖动)
- 太高 → 排队深,TTFT 涨

**典型起点**:从 vLLM 的 `--max-num-seqs`(默认 256)的 1/4 到 1/8 开始,根据 SLA 调。

---

## 十一、看完这一篇,你应该能

- 解释推理服务化要解决的事(HTTP / 多副本 / autoscale / 灰度 / 健康检查 / 路由)
- 默写 Ray Serve 三层抽象:Application / Deployment / Replica
- 写出一段 Ray Serve 部署 vLLM 的最小代码(GPU 资源声明 + autoscaling 配置)
- 在白板上画 Ray Serve 请求路由拓扑(HTTP Proxy → Replica → vLLM)
- 知道 RayLLM 是 Ray Serve + vLLM 的开箱即用模板
- 说出 Triton 与 Ray Serve + vLLM 的取舍场景
- 解释 LLM 冷启动为什么严重,常用的 keep-warm / 镜像预拉策略
- 解释为什么 autoscaling 必须用「队列长度」而不是 QPS

下一篇:**27 K8s 上的 GPU** — backendLearning 已经讲过 K8s 基础,这一篇只补 GPU 调度的特殊性:Device Plugin / GPU Operator / MIG vs vGPU、拓扑感知调度、Gang Scheduling、KubeRay,以及为什么大规模训练业界仍偏 Slurm。
