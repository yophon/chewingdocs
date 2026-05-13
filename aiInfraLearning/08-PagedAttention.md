# PagedAttention:把 KV Cache 当虚拟内存管

07 篇算清了 KV 的显存账,但没说一件事:**KV 在显存里是怎么摆放的**。vLLM 出现之前(2023 中以前),主流推理实现的做法朴素到离谱——**给每个请求按 max_seq_len 预留一整块连续显存**。一个请求宣布"我最多生成 2K token",引擎就给它划 2K token 的 KV 空间,哪怕这个请求最后只生成了 50 token,**1950 个 token 的空间也一直空在那**。算下来浪费 60-80% 的显存。vLLM 的 PagedAttention 把这件事从根上重做:借鉴操作系统的虚拟内存,**KV 切成固定大小的 block,逻辑序列通过 Block Table 索引到物理块**,碎片消失,共享自然发生。这一篇拆它怎么做、为什么这么做、什么时候是它的代价。

> 一句话先记住:**PagedAttention = 把 KV Cache 当虚拟内存,固定 block_size(vLLM 默认 16 token)的物理块从池子里按需分配,Block Table 把逻辑 KV 序列映射到物理块号**。外部碎片消失,只剩末块平均一半的内部碎片;Copy-on-Write 让并行采样共享 prefix,Prefix Caching 让多请求复用系统提示。代价是 attention kernel 多一层间接寻址,小 batch 下有 kernel overhead——但绝大多数生产负载下是净赚。

---

## 一、朴素实现的痛:预留 = 浪费

### 1.1 一段典型的朴素 KV 分配

```python
# transformers / 早期推理实现的做法(伪代码)
def serve_request(prompt, max_new_tokens):
    max_seq_len = len(prompt) + max_new_tokens   # 比如 2048
    
    # 给整个请求预留一整块连续显存
    kv_cache = torch.empty(
        (n_layers, 2, max_seq_len, n_heads, d_head),
        dtype=torch.float16, device='cuda',
    )
    
    # 然后按位置往里填
    for t in range(max_seq_len):
        kv_cache[:, :, t, :, :] = compute_kv(input[t])
        if generated == EOS:
            break  # 后面的空间一直空着到请求结束
```

问题摆在台面上:

```
请求 A: max_seq_len=2048, 实际生成 50 token   → 浪费 1998 token 的 KV 空间
请求 B: max_seq_len=2048, 实际生成 1500 token → 浪费 548 token
请求 C: max_seq_len=2048, 实际生成 2000 token → 浪费 48 token

平均生成长度通常只有 max_seq_len 的 20-40%,意味着 60-80% 的 KV 预留空间是空的。
```

更糟的是**外部碎片**:

```
显存空间:
┌─────┬─────┬─────┬─────┬─────┬─────┐
│ A   │ B   │ 已释放 │ C   │ D   │ 空    │
│ 2K  │ 2K  │  2K   │ 2K  │ 2K  │ 1.5K │
└─────┴─────┴───────┴─────┴─────┴──────┘
              ↑
              请求 E 想要 2K,中间这块够大,但
              不连续到旁边的空块,装不下
              → 等其他请求释放才能调度
```

**预留 + 连续要求**这两件事联手,让朴素实现的有效 KV 利用率经常只有 30-40%。

### 1.2 vLLM 原论文里的实测数字

vLLM 2023 年发的论文里测了一下:

```
朴素 KV 分配的显存使用拆解(同卡同模型,Naive 实现):
   有效 KV(真正在用):     20-40%
   预留浪费(请求实际短):   60-80%
   外部碎片(空但分配不下):  10-20%

加起来:有效利用率经常 < 30%
```

直接结论:**有 60% 的卡其实没在做事**——这就是 PagedAttention 想啃掉的那块。

---

## 二、心智:KV Cache 当成虚拟内存

### 2.1 借的是操作系统的什么招

操作系统管内存早就解决过同类问题——程序申请一段"连续"的虚拟地址空间,**底层却切成 4KB 的页(page),散在物理内存任意位置**,靠页表(Page Table)把虚拟地址翻译成物理地址。**程序眼里看到的是连续,物理上却是离散**。

```
                  ┌────────────────────────────┐
程序眼里:          │ 一段连续的虚拟地址空间      │
                  └────┬────┬────┬────┬────┬───┘
                       │    │    │    │    │
                  ┌────▼────▼────▼────▼────▼───┐
   Page Table:    │ 虚拟页号 → 物理页号映射      │
                  └────┬────────────────────────┘
                       │
                  ┌────▼───────────────────────┐
物理上:            │ 页可以在物理内存任意位置    │
                  │  P3       P0  P5    P1   P9│
                  └────────────────────────────┘
```

**PagedAttention 把这个心智搬到 KV Cache 上**——一个请求逻辑上看到"我有一段从 0 到 N 的 KV 序列",物理上是 N/block_size 个小块散在 KV 池子里,Block Table 做映射。

### 2.2 朴素 vs PagedAttention 的显存布局对比

```
朴素实现(每个请求一整块连续):

KV 显存池:
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ Request A    │ Request B    │ Request C    │ Request D    │
│ max=2048 tok │ max=2048 tok │ max=2048 tok │ max=2048 tok │
│ ████░░░░░░░░ │ ██████░░░░░░ │ ████████░░░░ │ ██░░░░░░░░░░ │
│ 用 50/2048   │ 用 800/2048  │ 用 1200/2048 │ 用 300/2048  │
└──────────────┴──────────────┴──────────────┴──────────────┘
     2% used      39% used      59% used       15% used    ← 平均利用 29%


PagedAttention(逻辑/物理分离):

逻辑视图(每个请求看到的连续序列):
  Request A: [tok0][tok1][tok2]...[tok49]                   (50 tokens)
  Request B: [tok0][tok1]...[tok799]                        (800 tokens)
  Request C: [tok0][tok1]...[tok1199]                       (1200 tokens)
  Request D: [tok0][tok1]...[tok299]                        (300 tokens)

物理视图(KV 池由固定 block 组成,block_size=16):
┌──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┐
│B0│B1│B2│B3│B4│B5│B6│B7│B8│B9│..│..│..│..│..│..│..│..│..│Bn│
└──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┘
  ↓                                                          
  Block Table 把逻辑序列映射到物理 block 号:
  
  A: [B7, B19, B42, B3]              (50 token / 16 = 4 个 block)
  B: [B11, B5, B22, ... 50 个 block]                       (800/16=50)
  C: [B0, B14, B8, ... 75 个 block]                       (1200/16=75)
  D: [B33, B41, B17, B12, ... 19 个 block]                (300/16=19)

  
  分配按需进行,blocks 池利用率 95%+
```

**核心差别**:逻辑上每个请求看到一段连续 KV(attention kernel 还是按位置取),物理上 block 散在池子各处。**没用到的 block 留在池里给其他请求**,不预留、不浪费、不碎片。

### 2.3 attention kernel 怎么寻址

朴素实现:

```
attention(Q, K, V):
  K_full = K[0..seq_len, :, :]    # 直接按位置切连续切片
  scores = Q @ K_full.T           # 一把大 matmul
```

PagedAttention kernel(伪代码,vLLM 的 paged_attention CUDA kernel 这么做):

```cpp
__global__ void paged_attention(
    Q, output,
    block_table,        // [num_seqs, max_num_blocks]
    K_cache, V_cache,   // [num_blocks, block_size, num_kv_heads, d_head]
    seq_lens,
    block_size = 16,
) {
    int seq_idx = blockIdx.x;
    int seq_len = seq_lens[seq_idx];
    int num_blocks = (seq_len + block_size - 1) / block_size;
    
    for (int b = 0; b < num_blocks; b++) {
        int physical_block_num = block_table[seq_idx][b];     // 间接寻址!
        K_block = K_cache[physical_block_num];                 // 物理块取数据
        V_block = V_cache[physical_block_num];
        
        // 算这个 block 内 token 跟 Q 的 attention
        partial_score = Q @ K_block.T;
        ...
    }
    // softmax + 加权 V
}
```

**关键代价就在那一句"间接寻址"**——每个 block 取数据前要先查 block_table。CPU 端做这层映射几乎没开销,但在 GPU 上,每个 SM 在 attention 计算时都要做这层间接,**当 batch 小、block 数也小的时候,kernel launch overhead 占比会上升**。后面讲局限会回到这一点。

---

## 三、Block Table 的索引结构

### 3.1 数据组织

```
KV 池子(物理):
┌──────────────────────────────────────────────────────────────┐
│ Block 0  Block 1  Block 2  ...  Block N-1                    │
│ ┌─────┐ ┌─────┐ ┌─────┐         ┌─────┐                       │
│ │16tok│ │16tok│ │16tok│   ...   │16tok│  每 block 装 16 个 token │
│ │K+V  │ │K+V  │ │K+V  │         │K+V  │  跨所有层(80 层 K + V) │
│ └─────┘ └─────┘ └─────┘         └─────┘                       │
└──────────────────────────────────────────────────────────────┘
                              ↑
                              N = gpu_memory_for_KV / block_bytes
                              典型 N 在几千到几万

Block Table(逻辑 → 物理映射):
┌────────────────────────────────────────────────────────────┐
│  seq_id  │ logical block 0 → phy block | 1 → phy | ...     │
├──────────┼─────────────────────────────────────────────────┤
│   A      │       7        |    19      |   42   |   3      │
│   B      │      11        |     5      |   22   |  ...50个 │
│   C      │       0        |    14      |    8   |  ...75个 │
│   D      │      33        |    41      |   17   |   12 ... │
└──────────────────────────────────────────────────────────────┘
```

每个序列只需要存一个数组(逻辑块号 → 物理块号),数组长度 = 已分配的 block 数。**Block Table 本身的开销很小**——一个 70B 模型 max_seq_len=128K 单请求最多 8K 个 block,Block Table 也就 32KB 不到。

### 3.2 一次 decode step 发生什么

```
请求 A 现在 seq_len = 47,要生成第 48 个 token:

step 1:  KV 池里取出 Block 7, 19, 42, 3 的 K, V,跑 attention
         → 算出第 48 个 token 的 logits → 采样 → 得到新 token

step 2:  把新 token 的 K, V 写入 cache
         - 当前最后一个 block(Block 3)还有 16-(47 mod 16+1) = 0 个空位?
           查一下:47 = 2*16+15,所以 Block 3 已经装了 16 个 token,满了
         - 满了 → 从池子里分配新的 free block,假设拿到 Block 88
         - Block Table[A] 追加:[7, 19, 42, 3, 88]
         - 把新 token 的 K, V 写到 Block 88 的位置 0

step 3:  下一步 decode 时,Block Table[A] = [7, 19, 42, 3, 88],seq_len=48
         attention 取这 5 个 block
```

**分配是"按需"和"局部"的**——只有 block 满了才申请新的,其他请求一点不受影响。

### 3.3 block_size 为什么是 16

vLLM 默认 `block_size=16`,可以调到 8 / 32。三者权衡:

| block_size | 优点 | 缺点 |
| --- | --- | --- |
| 1(逐 token) | 几乎零内部碎片 | Block Table 极长,attention kernel 间接寻址次数爆炸 |
| 16 | 内部碎片小(平均浪费 8 token)、kernel 间接寻址次数适中 | 平衡点,工程默认 |
| 64 | Block Table 更短,kernel launch 更少 | 内部碎片大(平均浪费 32 token),短请求浪费明显 |
| 1024 | 退化成朴素实现 | 同朴素实现的浪费 |

```
内部碎片(末块平均空着多少):
  block_size = 16  → 平均空 8 token,占请求 KV 的 0.4%(2000 token 请求)
  block_size = 32  → 平均空 16 token,占 0.8%
  block_size = 64  → 平均空 32 token,占 1.6%
  
kernel 间接寻址次数(seq_len=2000 的请求):
  block_size = 16  → 125 个 block
  block_size = 32  → 63 个 block
  block_size = 64  → 32 个 block
```

**16 是经验最优**——足够小让浪费忽略,又足够大让 kernel launch 摊薄。

---

## 四、显存碎片:从外部碎片到只剩末块

### 4.1 朴素实现 vs PagedAttention 的碎片对比

```
朴素实现:
  外部碎片:严重(请求大小不一,释放后空洞难再用)
  内部碎片:严重(max_seq_len 预留,但实际生成短)
  整体浪费:60-80%

PagedAttention:
  外部碎片:消失(block 都一样大,池里任何 free block 都通用)
  内部碎片:只剩末块平均一半浪费(0.4% 左右,可忽略)
  整体浪费:< 4%
```

**KV 利用率从 30% 提到 95%+**——这是 vLLM 比早期推理实现吞吐高一个数量级的最大单一原因。

### 4.2 一个量化对比

同一张 H100 80GB,Llama-3-70B BF16,4K max_seq_len 设定:

```
朴素实现:
   KV 池能容纳 = 80 GB - 70 GB(权重) - 5 GB(其他) = 5 GB
   每请求预留 = 4K × 320KB = 1.28 GB
   并发上限 = 5 / 1.28 = 3 个请求
   实际平均使用 ≈ 30% → 浪费 1 GB / 请求
   有效请求体验:3 个请求,每个真实长度 < 4K

PagedAttention(同样的硬件配置,加上 TP=2 把权重摊薄):
   KV 池能容纳 ≈ 30 GB
   每个 block(block_size=16,80 层 GQA-8) ≈ 80 × 4096 = 5 KB / 层(实际更紧凑)
   全部 block 数 ≈ 30 GB / 320 KB × 16 / 16 ≈ 数千个 block
   并发上限 = 几十个请求(按实际长度分配,不预留)
```

数字上的差距就是工程上的差距——同一张卡,**并发上限差一个数量级**。

---

## 五、Copy-on-Write:并行采样的 KV 共享

### 5.1 并行采样是什么

`num_return_sequences=4` 或者 `n=4`:**一个 prompt 同时采样 4 条不同的输出**(常见于 best-of-N、RLHF rollout、Tree-of-Thought)。

```
Prompt: "讲一个笑话"

朴素做法:
  开 4 个独立请求,每个跑完整 prefill + decode
  KV 占用 = 4 × prompt_kv + 4 × generated_kv
  Prompt 占用部分是完全重复的浪费(4 份相同 prompt KV)

PagedAttention + CoW:
  Prompt 只 prefill 一次,4 条采样共享同一份 prompt KV 块
  分歧后,各自的新 token 写到自己的新 block
  KV 占用 = 1 × prompt_kv + 4 × generated_kv
```

### 5.2 一张图

```
Prompt prefill 完成,4 条采样开始之前:

  Logical seq 1: [Block 7, Block 19, Block 42]  ← 共享
  Logical seq 2: [Block 7, Block 19, Block 42]  ← 共享
  Logical seq 3: [Block 7, Block 19, Block 42]  ← 共享
  Logical seq 4: [Block 7, Block 19, Block 42]  ← 共享
                  └─ Block ref_count = 4 ─┘
  
  Block 42 内还有 8 个空位(prompt 长度刚好填 40 个 token)

4 条采样各自走了几步 decode,token 不同:

  Logical seq 1: [Block 7, Block 19, Block 42*, Block 51]
  Logical seq 2: [Block 7, Block 19, Block 42*, Block 88]
  Logical seq 3: [Block 7, Block 19, Block 42*, Block 19_new]   
  Logical seq 4: [Block 7, Block 19, Block 42*, Block 33]
                  └─ Block 42* 是怎么回事?─┘
                  
  问题:第一个分歧 token 要写到 Block 42 的位置 41(空位 0)
        但 4 条采样的第 41 个 token 不一样,
        不能都写到同一个物理 block
        
  Copy-on-Write:第一个想写的采样把 Block 42 复制成 Block 42a,
                 把 Block 42 的内容拷过去,再写自己的新 token
                 之后其他采样各自再 CoW 出 42b, 42c, 42d
  
  结果:
    Logical seq 1: [B7, B19, B42a]
    Logical seq 2: [B7, B19, B42b]
    Logical seq 3: [B7, B19, B42c]
    Logical seq 4: [B7, B19, B42d]
    
    Block 7 和 Block 19 仍然共享(还没动到末位)
    Block 42 内容被复制了 4 份,代价是一次 block 拷贝(16 token × KV 字节)
```

**节省效果**:prompt 长度 1000 token,采样 4 条各生成 200 token:

```
朴素:        4 × (1000 + 200) × 320 KB = 1.5 GB
CoW:        (1000 + 4×200) × 320 KB    + 16-token 拷贝开销
            = 1800 × 320 KB ≈ 575 MB
            
节省 60%+,采样数越多收益越显著
```

---

## 六、Prefix Caching:多请求复用系统提示

### 6.1 场景

```
请求 1: [system: 你是助手...] [user: 帮我写代码]    (sys=2000 tok, user=10)
请求 2: [system: 你是助手...] [user: 解释一下...]    (sys=2000 tok, user=20)
请求 3: [system: 你是助手...] [user: 翻译这段]      (sys=2000 tok, user=15)
...

每个请求开头都是同样的 system prompt(假设 2000 token)。
朴素:每个请求都对 system 部分跑 prefill,每个都建一份 KV。
Prefix Caching:第一次见到这个 system,prefill 完留下 KV;后续请求来,
                查询是否有匹配前缀,命中就直接挪用,跳过 prefill。
```

### 6.2 vLLM 怎么做命中检测

```
拿到新请求的 prompt:
  把 prompt 按 block_size 切成 block 序列
  对每个 block,算 hash(block 内 token + 前文 hash)
    → 链式哈希,只有前面所有 block 都一致才匹配
  
  从前往后找最长匹配的 block 序列:
    request: [hash_a, hash_b, hash_c, hash_d]
    cache:   {hash_a: Block 7, hash_b: Block 19, ...}
    
    最长前缀匹配:[hash_a, hash_b, hash_c] → [Block 7, 19, 42]
    
  命中部分:三个 block(48 个 token)的 prefill 全跳过
  未命中部分:从第 4 个 block 开始 prefill
  
  对应的物理 block 引用计数 +1(被新请求复用)
```

**链式哈希的关键**:hash 包含前文,**任何一个 token 不同后续就不再命中**。所以 system prompt 不能有动态内容(时间戳、随机 ID、user_id 等),否则命中率立刻 0。

### 6.3 实测

```
场景:同一个 system prompt 2000 token,batch 10 个请求各异
  朴素:每请求 prefill 2010 token → 总计 20100 token prefill
  Prefix Caching:首请求 prefill 2010,后 9 个各 prefill 10 → 总计 2100
                  → 节省 89%
  
  TTFT 影响:首请求和朴素一样,后续请求 TTFT 接近瞬时(只算 user 部分)
```

**Prefix Caching 是当下生产 LLM 服务的免费午餐**——没有副作用,vLLM `--enable-prefix-caching` 一开就有,system prompt 长的场景立刻见效。Agent / 多轮场景 SGLang 的 RadixAttention 更彻底,详见 10 篇。

---

## 七、工程落地:启动一个 vLLM 服务

### 7.1 最小可跑配置

```bash
# Llama-3-70B + 32K 上下文,2 卡 H100
python -m vllm.entrypoints.openai.api_server \
    --model meta-llama/Meta-Llama-3.1-70B-Instruct \
    --tensor-parallel-size 2 \
    --max-model-len 32768 \
    --block-size 16 \
    --enable-prefix-caching \
    --gpu-memory-utilization 0.92 \
    --max-num-seqs 64 \
    --port 8000
```

三个最关键参数:

| 参数 | 含义 | 调它影响什么 |
| --- | --- | --- |
| `--block-size` | KV 块大小(默认 16) | 大 → kernel launch 少但末块碎片大;小反之 |
| `--enable-prefix-caching` | 开 Prefix Cache | 多请求共享 system prompt 时立省 |
| `--gpu-memory-utilization` | 框架占用显存比例(默认 0.9) | 高 → KV 池更大,但留给临时 buffer 少,易 OOM |

辅助参数:

| 参数 | 含义 |
| --- | --- |
| `--max-num-seqs` | 并发上限(KV 池能装多少请求) |
| `--max-num-batched-tokens` | 每 step 总 token 数上限(09 篇展开) |
| `--swap-space` | KV 满时换出到 CPU 的空间大小(GB) |
| `--kv-cache-dtype` | KV 存储精度(fp8 / auto,23 篇展开) |

### 7.2 监控 Prefix Cache 命中率

```python
# vLLM 暴露的 Prometheus 指标
vllm:gpu_prefix_cache_queries_total      # 查询次数
vllm:gpu_prefix_cache_hits_total         # 命中次数
vllm:gpu_prefix_cache_hit_rate           # 命中率(派生)

# Python 内嵌时:
from vllm import LLM, SamplingParams

llm = LLM(model="...", enable_prefix_caching=True)
outputs = llm.generate(prompts, sampling_params)

# 看 stats
print(llm.llm_engine.scheduler.block_manager.get_prefix_cache_hit_rate())
```

健康基线:

| 场景 | 期望命中率 |
| --- | --- |
| 同一长 system prompt 多请求 | 80-99% |
| Chat 单轮、prompt 差异大 | 5-20% |
| Agent 多轮(prompt 累加历史) | 50-80%,但 vLLM 在多轮上不如 SGLang(详见 10) |

**命中率低于预期** → 检查 system 是不是含动态内容,或者切到 SGLang(10 篇)。调度参数(`max-num-seqs` / `max-num-batched-tokens`)的排错流程在 09 篇展开。

---

## 八、PagedAttention 的代价与局限

### 8.1 间接寻址的 kernel overhead

attention kernel 现在每次读 K, V 都要先查 block_table,在小 batch 下这层开销不能忽略。

```
batch = 1, seq_len = 200:
  block 数 = 200 / 16 = 13 个
  每次 decode 要做 13 次 block_table 查询 + 13 次跨 block 读
  vs 朴素一次连续读 200 token
  → kernel time 多 5-15% 不等

batch = 32, seq_len = 2000:
  block 数 × batch = 32 × 125 = 4000 个 block 引用
  kernel 完全 memory-bound,这点间接寻址几乎免费
  实测 kernel time 与朴素差距 < 2%
```

**结论**:batch 越大、kernel 越 memory-bound,PagedAttention 的间接开销越接近零;**单请求 batch=1 的场景下它不是免费午餐**(但本来 batch=1 也没什么生产意义)。

### 8.2 不擅长的场景

1. **极小 batch(单用户、流式 batch=1)**——间接寻址开销显得明显,朴素实现+小连续显存能更快
2. **不需要长 context 的纯短回复服务**——浪费的预留也不大,PagedAttention 收益没那么显著
3. **请求形态完全独立无共享**——Prefix Cache 无效,只剩 PagedAttention 本体的收益
4. **block_size 调不当**——太小 kernel overhead 重,太大碎片不容忽视

### 8.3 不是它解决的问题

- **decode 的 memory-bound 本质**——PagedAttention 不会让一次 forward 变快,它解的是"装得下更多并发",并发上去才间接降本(通过 batch 摊薄权重搬运)
- **长 context 的 KV 总量**——PagedAttention 让 KV 池利用率从 30% 提到 95%,但 KV 总字节数没动;那个要靠 KV 量化(23 篇)
- **多轮 / 分支的复杂共享**——PagedAttention + Prefix Cache 命中粒度粗,Agent 多轮场景命中率低;那个要靠 RadixAttention(10 篇)

**PagedAttention 解的是"KV 在显存里怎么摆放"这一个具体问题**——它不是推理引擎的全部,但它是 vLLM 之所以是 vLLM 的核心一招。

---

## 九、看完这一篇,你应该能

- 解释朴素 KV 分配为什么浪费 60-80%(max_seq_len 预留 + 外部碎片)
- 在白板上画出 Block Table:逻辑序列 → 物理 block 号的映射
- 说清 block_size=16 是怎么选出来的(末块碎片 vs kernel 间接寻址的权衡)
- 算出 PagedAttention 把 KV 利用率从 30% 提到 95%+,并发上限直接差一个数量级
- 解释 Copy-on-Write 让并行采样的 prompt KV 只算一次,采样 N 条节省 (N-1) × prompt_kv
- 解释 Prefix Caching 的链式哈希命中机制,以及为什么 system prompt 不能含动态内容
- 拿到一个 vLLM 服务故障(TTFT 高 / 抢占多),按 KV 池利用率 → 抢占 → cache 命中率三步排查
- 说出 PagedAttention 不能解决什么(KV 总量、复杂多轮共享、decode 的 memory-bound)

下一篇:**09 Continuous Batching** — PagedAttention 解了显存布局,但调度还得专门设计:每个 decode step 重新决定 batch 里有谁,新请求即来即加,完成请求即走即出,prefill 和 decode 还能混跑(chunked prefill)。从静态批 → 动态批 → 连续批,三代调度怎么演化。
