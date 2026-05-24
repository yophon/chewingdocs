import{c as a,Q as n,j as i,m as p}from"./chunks/framework.Bhbi9jCp.js";const d=JSON.parse('{"title":"LoRA 服务化:一台机器跑 100 个领域微调模型","description":"","frontmatter":{},"headers":[],"relativePath":"aiInfraLearning/24-LoRA服务化.md","filePath":"aiInfraLearning/24-LoRA服务化.md","lastUpdated":1778649484000}'),l={name:"aiInfraLearning/24-LoRA服务化.md"};function e(t,s,h,k,o,r){return n(),i("div",null,[...s[0]||(s[0]=[p(`<h1 id="lora-服务化-一台机器跑-100-个领域微调模型" tabindex="-1">LoRA 服务化:一台机器跑 100 个领域微调模型 <a class="header-anchor" href="#lora-服务化-一台机器跑-100-个领域微调模型" aria-label="Permalink to &quot;LoRA 服务化:一台机器跑 100 个领域微调模型&quot;">​</a></h1><p>aiLearning 18 篇讲过 LoRA 训练原理:不更新原始权重 W,只训两个小矩阵 A 和 B,让 ΔW = B @ A 来近似全量微调,<strong>只占 0.1-1% 参数量</strong>。这一篇不重复训练原理,只讲一个工程问题:<strong>训完 100 个 LoRA(法律、医疗、客服、代码、SQL……)上线,怎么不让 GPU 成本也变成 100 倍?</strong></p><blockquote><p>一句话先记住:<strong>LoRA 服务化的核心是「N 个 LoRA + 1 份 base model + 共享 KV」三者的批处理融合</strong>。S-LoRA / Punica 的 SGMV kernel 让同一 batch 里不同请求走不同 LoRA 也能一次算完;vLLM 把这套搬进了生产,<code>--enable-lora</code> 是 2026 微调服务的事实标准。Rank=8/16/32 是甜点,LoRA 显存占用比 KV 还小,真正瓶颈是路由调度和冷加载策略。</p></blockquote><hr><h2 id="一、单-lora-部署-其实没问题" tabindex="-1">一、单 LoRA 部署:其实没问题 <a class="header-anchor" href="#一、单-lora-部署-其实没问题" aria-label="Permalink to &quot;一、单 LoRA 部署:其实没问题&quot;">​</a></h2><p>如果只有一个 LoRA(比如就一个客服模型),最简单做法是 merge:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>W_finetuned = W_base + B @ A          # offline 一次性合并</span></span>
<span class="line"><span></span></span>
<span class="line"><span>部署:</span></span>
<span class="line"><span>  把 W_finetuned 当成普通模型加载,vLLM / SGLang / TRT-LLM 全支持</span></span>
<span class="line"><span>  推理时跟没用过 LoRA 完全一样,无任何额外开销</span></span></code></pre></div><p><strong>单 LoRA 服务跟普通推理服务完全等同</strong>,没有什么特殊工程问题。</p><p>但 merge 之后<strong>失去了 LoRA 的核心优势</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>单 LoRA merge 部署:</span></span>
<span class="line"><span>  + 推理 0 overhead</span></span>
<span class="line"><span>  - 模型变成全量大小(70B 还是 70B)</span></span>
<span class="line"><span>  - 100 个领域 = 100 个全量 70B 副本 = 不可能</span></span>
<span class="line"><span>  - 切换 LoRA 要重启服务</span></span>
<span class="line"><span></span></span>
<span class="line"><span>LoRA 留着不 merge:</span></span>
<span class="line"><span>  - 推理时算 W·x + B·(A·x)         (多两次小矩阵乘)</span></span>
<span class="line"><span>  + 100 个 LoRA 共享一份 base 70B</span></span>
<span class="line"><span>  + 切 LoRA 不重启,运行时加载</span></span>
<span class="line"><span>  + 同一 batch 内不同请求走不同 LoRA</span></span></code></pre></div><p><strong>生产 LoRA 服务化的全部价值都在「不 merge」这条路上</strong>。</p><hr><h2 id="二、多-lora-服务的真实需求" tabindex="-1">二、多 LoRA 服务的真实需求 <a class="header-anchor" href="#二、多-lora-服务的真实需求" aria-label="Permalink to &quot;二、多 LoRA 服务的真实需求&quot;">​</a></h2><p>实际产品场景:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>一个智能客服平台:</span></span>
<span class="line"><span>  base model:  Llama-3-70B</span></span>
<span class="line"><span>  LoRA-1:      法律咨询(rank=16,~150 MB)</span></span>
<span class="line"><span>  LoRA-2:      医疗咨询(rank=16,~150 MB)</span></span>
<span class="line"><span>  LoRA-3:      税务咨询(rank=16,~150 MB)</span></span>
<span class="line"><span>  LoRA-4:      工程问答(rank=32,~300 MB)</span></span>
<span class="line"><span>  ...</span></span>
<span class="line"><span>  LoRA-100:    某客户私有定制(rank=8,~75 MB)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>请求模式:</span></span>
<span class="line"><span>  来一条法律请求 → 用 LoRA-1</span></span>
<span class="line"><span>  来一条医疗请求 → 用 LoRA-2</span></span>
<span class="line"><span>  100 路混合请求,每路走自己的 LoRA</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  并发场景:同一时刻可能 50 个不同 LoRA 都在被请求</span></span></code></pre></div><p>这是 LoRA 服务化的标准画像:<strong>一份 base 权重 + 上百个小 LoRA,按请求路由</strong>。</p><hr><h2 id="三、朴素方案为什么死" tabindex="-1">三、朴素方案为什么死 <a class="header-anchor" href="#三、朴素方案为什么死" aria-label="Permalink to &quot;三、朴素方案为什么死&quot;">​</a></h2><h3 id="_3-1-每个-lora-起一个独立服务" tabindex="-1">3.1 每个 LoRA 起一个独立服务 <a class="header-anchor" href="#_3-1-每个-lora-起一个独立服务" aria-label="Permalink to &quot;3.1 每个 LoRA 起一个独立服务&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                    Load Balancer</span></span>
<span class="line"><span>                          │</span></span>
<span class="line"><span>       ┌─────────┬────────┼────────┬─────────┐</span></span>
<span class="line"><span>       ▼         ▼        ▼        ▼         ▼</span></span>
<span class="line"><span>   ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐</span></span>
<span class="line"><span>   │vLLM-1  │ │vLLM-2  │ │vLLM-3  │ │vLLM-4  │ │vLLM-100│</span></span>
<span class="line"><span>   │70B+LoRA1│ │70B+LoRA2│ │70B+LoRA3│ │70B+LoRA4│ │ 70B+...│</span></span>
<span class="line"><span>   │ 4×H100  │ │ 4×H100  │ │ 4×H100  │ │ 4×H100  │ │  ...   │</span></span>
<span class="line"><span>   └────────┘ └────────┘ └────────┘ └────────┘ └────────┘</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>GPU 成本:100 × 4 = 400 张 H100</span></span>
<span class="line"><span>Base model 重复浪费:99 × 140GB = 13.86 TB 显存重复存</span></span>
<span class="line"><span>LoRA 利用率严重不均:法律请求多 → vLLM-1 满载,医疗少 → vLLM-2 闲置</span></span></code></pre></div><p><strong>100 倍 GPU 成本去服务一份 base + 100 份 LoRA(总参数量 &lt; 70.5B),完全不可接受</strong>。</p><h3 id="_3-2-串行切换-lora" tabindex="-1">3.2 串行切换 LoRA <a class="header-anchor" href="#_3-2-串行切换-lora" aria-label="Permalink to &quot;3.2 串行切换 LoRA&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>方案:1 张服务器,按需加载 LoRA,处理完释放再加载下一个</span></span>
<span class="line"><span></span></span>
<span class="line"><span>请求 1(法律): load LoRA-1 → 处理 → done    (200ms 加载,500ms 推理)</span></span>
<span class="line"><span>请求 2(医疗): load LoRA-2 → 处理 → done    (200ms 加载,500ms 推理)</span></span>
<span class="line"><span>请求 3(税务): load LoRA-3 → 处理 → done</span></span>
<span class="line"><span></span></span>
<span class="line"><span>每个请求被 LoRA load 拖慢 200ms+</span></span>
<span class="line"><span>吞吐:1.4 QPS</span></span>
<span class="line"><span>完全不能并发(同时只能跑一个 LoRA)</span></span></code></pre></div><p><strong>这两条路都通不了——必须有「同 batch 不同 LoRA 一次算」的能力</strong>。</p><hr><h2 id="四、多-lora-路由-核心心智" tabindex="-1">四、多 LoRA 路由:核心心智 <a class="header-anchor" href="#四、多-lora-路由-核心心智" aria-label="Permalink to &quot;四、多 LoRA 路由:核心心智&quot;">​</a></h2><h3 id="_4-1-必画图-同-batch-内异构-lora" tabindex="-1">4.1 必画图:同 batch 内异构 LoRA <a class="header-anchor" href="#_4-1-必画图-同-batch-内异构-lora" aria-label="Permalink to &quot;4.1 必画图:同 batch 内异构 LoRA&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                        请求队列</span></span>
<span class="line"><span>                ┌──────────────────────┐</span></span>
<span class="line"><span>                │  R1: 法律问题 (LoRA-1) │</span></span>
<span class="line"><span>                │  R2: 医疗问题 (LoRA-2) │</span></span>
<span class="line"><span>                │  R3: 法律问题 (LoRA-1) │</span></span>
<span class="line"><span>                │  R4: 税务问题 (LoRA-3) │</span></span>
<span class="line"><span>                │  R5: 通用问题 (无 LoRA)│</span></span>
<span class="line"><span>                │  R6: 医疗问题 (LoRA-2) │</span></span>
<span class="line"><span>                └──────────────────────┘</span></span>
<span class="line"><span>                          │</span></span>
<span class="line"><span>                          ▼  调度器组成一个 batch (size=6)</span></span>
<span class="line"><span>                          </span></span>
<span class="line"><span>   batch 索引     0       1       2       3       4       5</span></span>
<span class="line"><span>   请求          R1      R2      R3      R4      R5      R6</span></span>
<span class="line"><span>   LoRA id       L1      L2      L1      L3      None    L2</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>                          │</span></span>
<span class="line"><span>                          ▼  Forward pass(单个 Transformer block)</span></span>
<span class="line"><span>                          </span></span>
<span class="line"><span>       Base GEMM(共享一次):</span></span>
<span class="line"><span>        ┌────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>        │  Y_base = X @ W^T                                   │</span></span>
<span class="line"><span>        │  对所有 6 个请求一起算,跑满 Tensor Core            │</span></span>
<span class="line"><span>        └────────────────────────────────────────────────────┘</span></span>
<span class="line"><span>                          │</span></span>
<span class="line"><span>                          ▼  </span></span>
<span class="line"><span>       LoRA GEMM(异构,SGMV 一次算完):</span></span>
<span class="line"><span>        ┌────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>        │  for i in batch:                                    │</span></span>
<span class="line"><span>        │    if LoRA[i] is not None:                          │</span></span>
<span class="line"><span>        │      Y_lora[i] = X[i] @ A[LoRA[i]]^T @ B[LoRA[i]]^T │</span></span>
<span class="line"><span>        │  Y[i] = Y_base[i] + Y_lora[i]                       │</span></span>
<span class="line"><span>        │                                                     │</span></span>
<span class="line"><span>        │  Punica SGMV kernel:把这个循环融合成一个 kernel call│</span></span>
<span class="line"><span>        └────────────────────────────────────────────────────┘</span></span>
<span class="line"><span>                          │</span></span>
<span class="line"><span>                          ▼</span></span>
<span class="line"><span>                       下一层</span></span>
<span class="line"><span>                       </span></span>
<span class="line"><span>   关键不变量:</span></span>
<span class="line"><span>     - Base 权重 W 共享(只搬一次)</span></span>
<span class="line"><span>     - 不同 LoRA 的 A, B 在显存里都活着,kernel 按需 gather</span></span>
<span class="line"><span>     - 同一 batch 不同 LoRA 一次 forward 完成</span></span></code></pre></div><h3 id="_4-2-算一笔账-lora-路径的额外开销" tabindex="-1">4.2 算一笔账:LoRA 路径的额外开销 <a class="header-anchor" href="#_4-2-算一笔账-lora-路径的额外开销" aria-label="Permalink to &quot;4.2 算一笔账:LoRA 路径的额外开销&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Base model GEMM:</span></span>
<span class="line"><span>  Y = X @ W^T   </span></span>
<span class="line"><span>  W 形状 (4096, 4096),一次 4096² ≈ 1670 万次 FMA / batch 元素</span></span>
<span class="line"><span></span></span>
<span class="line"><span>LoRA path GEMM (rank=16):</span></span>
<span class="line"><span>  Y_lora = X @ A^T @ B^T</span></span>
<span class="line"><span>  A 形状 (16, 4096), B 形状 (4096, 16)</span></span>
<span class="line"><span>  → 两次小 GEMM,4096 × 16 + 16 × 4096 ≈ 13 万次 FMA / batch 元素</span></span>
<span class="line"><span></span></span>
<span class="line"><span>LoRA 额外开销:13 / 1670 ≈ 0.78%</span></span>
<span class="line"><span></span></span>
<span class="line"><span>整体 LoRA 推理 vs base:   慢 1-3%(算上调度)</span></span></code></pre></div><p><strong>LoRA 增加的算力可以忽略,工程难点全在「不同 batch 元素走不同 LoRA」的 kernel 实现</strong>。</p><hr><h2 id="五、s-lora-berkeley-2024" tabindex="-1">五、S-LoRA(Berkeley 2024) <a class="header-anchor" href="#五、s-lora-berkeley-2024" aria-label="Permalink to &quot;五、S-LoRA(Berkeley 2024)&quot;">​</a></h2><p>S-LoRA 是 multi-LoRA 服务的奠基性论文,贡献两点:</p><h3 id="_5-1-unified-paging" tabindex="-1">5.1 Unified Paging <a class="header-anchor" href="#_5-1-unified-paging" aria-label="Permalink to &quot;5.1 Unified Paging&quot;">​</a></h3><p>把 LoRA 权重也分页管理,<strong>与 KV Cache 共用同一个显存池</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                  GPU 显存(80GB)</span></span>
<span class="line"><span>   ┌──────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>   │  Base model 权重:140GB / TP=4 = 35GB / 卡            │</span></span>
<span class="line"><span>   │  ──────────────────────────────────────────────────  │</span></span>
<span class="line"><span>   │                                                      │</span></span>
<span class="line"><span>   │  统一页表(每页 16 KB):                              │</span></span>
<span class="line"><span>   │  ┌────────────────────────────────────────────────┐  │</span></span>
<span class="line"><span>   │  │ page 0:  KV block (request A, position 0-15)   │  │</span></span>
<span class="line"><span>   │  │ page 1:  KV block (request B, position 0-15)   │  │</span></span>
<span class="line"><span>   │  │ page 2:  LoRA-1 part (layer 0-9 A matrix)      │  │</span></span>
<span class="line"><span>   │  │ page 3:  KV block (request C, position 0-15)   │  │</span></span>
<span class="line"><span>   │  │ page 4:  LoRA-1 part (layer 0-9 B matrix)      │  │</span></span>
<span class="line"><span>   │  │ page 5:  LoRA-2 part (layer 0-9 A matrix)      │  │</span></span>
<span class="line"><span>   │  │ page 6:  KV block (request A, position 16-31)  │  │</span></span>
<span class="line"><span>   │  │ ...                                            │  │</span></span>
<span class="line"><span>   │  └────────────────────────────────────────────────┘  │</span></span>
<span class="line"><span>   └──────────────────────────────────────────────────────┘</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   优点:</span></span>
<span class="line"><span>     - LoRA 和 KV 共享一个分配器,显存碎片不再撕裂两种用途</span></span>
<span class="line"><span>     - LoRA 也可以「按页换出 / 换入」(LRU)</span></span>
<span class="line"><span>     - 同一份显存池,业务波动时弹性更好</span></span></code></pre></div><h3 id="_5-2-heterogeneous-batching" tabindex="-1">5.2 Heterogeneous Batching <a class="header-anchor" href="#_5-2-heterogeneous-batching" aria-label="Permalink to &quot;5.2 Heterogeneous Batching&quot;">​</a></h3><p>不同 LoRA 在同一 batch 内一次算完——这是 S-LoRA 自定义 CUDA Kernel 的核心:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>传统做法(分组 batch):</span></span>
<span class="line"><span>  把同 LoRA 的请求分组,每组单独跑一次 forward</span></span>
<span class="line"><span>  group_1 (LoRA-1): 3 请求 → forward</span></span>
<span class="line"><span>  group_2 (LoRA-2): 2 请求 → forward</span></span>
<span class="line"><span>  group_3 (LoRA-3): 1 请求 → forward</span></span>
<span class="line"><span>  group_4 (None):   1 请求 → forward</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  共 4 次 forward,每次都重读 base 权重 → HBM 来回 4 倍</span></span>
<span class="line"><span>  Tensor Core 利用率低(每个 group 都是小 batch)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>S-LoRA Heterogeneous Batching:</span></span>
<span class="line"><span>  1 个 batch (size=7) 走 1 次 forward</span></span>
<span class="line"><span>  base GEMM:大 batch,一次算完</span></span>
<span class="line"><span>  LoRA GEMM:自定义 kernel 按 LoRA id gather A/B,一次算完</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  base 权重只搬 1 次</span></span>
<span class="line"><span>  Tensor Core 跑大 GEMM 吃满</span></span>
<span class="line"><span>  整体吞吐 5-10× 传统做法</span></span></code></pre></div><p>S-LoRA 实测:<strong>单台 8×A100 上同时服务上千个 LoRA</strong>,吞吐比传统方案 4 倍以上。</p><hr><h2 id="六、punica-sgmv-kernel" tabindex="-1">六、Punica:SGMV Kernel <a class="header-anchor" href="#六、punica-sgmv-kernel" aria-label="Permalink to &quot;六、Punica:SGMV Kernel&quot;">​</a></h2><p>Punica(CMU 2023)和 S-LoRA 思路相同,核心贡献是 <strong>SGMV(Segmented Gather Matrix-Vector multiplication)</strong> kernel:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>SGMV 解决的问题:</span></span>
<span class="line"><span>  batch 中每个元素要乘不同的小矩阵(LoRA A 或 B)</span></span>
<span class="line"><span>  这是「按 segment 分组的矩阵-向量乘」</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>传统实现:</span></span>
<span class="line"><span>  for i in batch:</span></span>
<span class="line"><span>    out[i] = mat[lora_id[i]] @ vec[i]</span></span>
<span class="line"><span>  → for 循环 = 串行,SM 闲置</span></span>
<span class="line"><span></span></span>
<span class="line"><span>SGMV 实现(GPU kernel):</span></span>
<span class="line"><span>  把一组按 lora_id 分段的矩阵-向量乘合并成一个 launch</span></span>
<span class="line"><span>  每个 SM 负责一个 segment,内部并行计算</span></span>
<span class="line"><span>  访存模式优化:连续 segment 的同一 LoRA 矩阵只读一次 HBM</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  → 1 次 launch 完成所有 batch 元素的 LoRA 计算</span></span>
<span class="line"><span>  → SM 利用率接近峰值</span></span></code></pre></div><p>vLLM 把 Punica 的 SGMV kernel 集成进了 PagedAttention 的批处理流水。<strong>今天用 vLLM 跑 multi-LoRA,底层就是 Punica 内核</strong>。</p><hr><h2 id="七、vllm-的-multi-lora-生产可用" tabindex="-1">七、vLLM 的 multi-LoRA(生产可用) <a class="header-anchor" href="#七、vllm-的-multi-lora-生产可用" aria-label="Permalink to &quot;七、vLLM 的 multi-LoRA(生产可用)&quot;">​</a></h2><h3 id="_7-1-启动配置" tabindex="-1">7.1 启动配置 <a class="header-anchor" href="#_7-1-启动配置" aria-label="Permalink to &quot;7.1 启动配置&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 启用 multi-LoRA 支持</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">vllm</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> serve</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> meta-llama/Meta-Llama-3-70B-Instruct</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --enable-lora</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --max-loras</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 16</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\ </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">             # 最多同时活跃 16 个 LoRA</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    --max-lora-rank</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 32</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\ </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">         # 最大支持 rank=32 的 LoRA</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    --max-cpu-loras</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 100</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\ </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">        # CPU 内存里缓存 100 个(LRU)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">    --tensor-parallel-size</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 4</span></span></code></pre></div><p><code>--max-loras</code> 是「同时在 GPU 显存里」的数量,<code>--max-cpu-loras</code> 是 CPU 缓存数量(超过 max-loras 时按 LRU 换出 GPU,需要时再 swap 进来)。</p><h3 id="_7-2-请求侧路由" tabindex="-1">7.2 请求侧路由 <a class="header-anchor" href="#_7-2-请求侧路由" aria-label="Permalink to &quot;7.2 请求侧路由&quot;">​</a></h3><div class="language-python vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">python</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">from</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> vllm </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">import</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> LLM</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, SamplingParams</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">from</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> vllm.lora.request </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">import</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> LoRARequest</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">llm </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> LLM(</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    model</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;meta-llama/Meta-Llama-3-70B-Instruct&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    enable_lora</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">True</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    max_loras</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">16</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    max_lora_rank</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">32</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 加载多个 LoRA</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">lora_law      </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> LoRARequest(</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;law-v2&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,      </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">1</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;/path/to/law-lora&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">lora_medical  </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> LoRARequest(</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;medical-v1&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,  </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">2</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;/path/to/medical-lora&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">lora_tax      </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> LoRARequest(</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;tax-v1&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,      </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">3</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;/path/to/tax-lora&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">lora_code     </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> LoRARequest(</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;code-v3&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,     </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">4</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;/path/to/code-lora&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 第二个参数是 lora_int_id(int 型 id,vLLM 内部用)</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 第三个参数是 LoRA 权重路径</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">prompts </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> [</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    &quot;请解释合同纠纷的处理流程&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,       </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># → 法律</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    &quot;心律不齐的常见原因是什么&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,       </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># → 医疗</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    &quot;增值税进项发票如何抵扣&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,         </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># → 税务</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    &quot;用 Python 实现快速排序&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,          </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># → 代码</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    &quot;今天天气怎么样&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,                  </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># → 不带 LoRA(走 base)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">lora_requests </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> [lora_law, lora_medical, lora_tax, lora_code, </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">None</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 一次性提交,vLLM 内部自动调度</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">outputs </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> llm.generate(</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    prompts,</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    SamplingParams(</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">temperature</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">0.7</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">max_tokens</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">512</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">),</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    lora_request</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">lora_requests,    </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 每个 prompt 配一个 LoRA(或 None)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">for</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> output </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">in</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> outputs:</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    print</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(output.outputs[</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">0</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">].text)</span></span></code></pre></div><p><strong>关键点</strong>:<code>generate</code> 一次调用提交 5 个不同 LoRA(含 None)的请求,vLLM 内部组成一个 batch、走一次 forward,SGMV kernel 完成异构 LoRA 计算。</p><h3 id="_7-3-openai-compatible-api-模式" tabindex="-1">7.3 OpenAI-compatible API 模式 <a class="header-anchor" href="#_7-3-openai-compatible-api-模式" aria-label="Permalink to &quot;7.3 OpenAI-compatible API 模式&quot;">​</a></h3><p>生产 server 模式更常用 OpenAI 协议:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 启动 server,把每个 LoRA 注册为一个 model 名</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">vllm</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> serve</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> meta-llama/Meta-Llama-3-70B-Instruct</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --enable-lora</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --lora-modules</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">        law=/path/to/law-lora</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">        medical=/path/to/medical-lora</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">        tax=/path/to/tax-lora</span></span></code></pre></div><div class="language-python vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">python</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Client 用 model 字段路由</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">import</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> openai</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">client </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> openai.OpenAI(</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">base_url</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;http://localhost:8000/v1&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">api_key</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;dummy&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 走法律 LoRA</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">client.chat.completions.create(</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    model</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;law&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,       </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># ← 这个名字对应 --lora-modules 里注册的</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    messages</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">[{</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;role&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;user&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;content&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;合同纠纷怎么办&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}],</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 走医疗 LoRA</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">client.chat.completions.create(</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    model</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;medical&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    messages</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">[{</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;role&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;user&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;content&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;心律不齐什么原因&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}],</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 走 base(不指定 LoRA)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">client.chat.completions.create(</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    model</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;meta-llama/Meta-Llama-3-70B-Instruct&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    messages</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">[{</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;role&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;user&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;content&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;今天天气&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}],</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span></code></pre></div><hr><h2 id="八、工程考量" tabindex="-1">八、工程考量 <a class="header-anchor" href="#八、工程考量" aria-label="Permalink to &quot;八、工程考量&quot;">​</a></h2><h3 id="_8-1-rank-大小的甜点" tabindex="-1">8.1 Rank 大小的甜点 <a class="header-anchor" href="#_8-1-rank-大小的甜点" aria-label="Permalink to &quot;8.1 Rank 大小的甜点&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>rank=4:    LoRA 太小,微调质量上不去</span></span>
<span class="line"><span>rank=8:    主流甜点,质量够 + LoRA 显存极小</span></span>
<span class="line"><span>rank=16:   主流甜点,中等任务首选</span></span>
<span class="line"><span>rank=32:   重任务(代码生成、复杂推理)上限</span></span>
<span class="line"><span>rank=64+:  收益边际递减,接近全量微调成本</span></span></code></pre></div><p><strong>rank 越大,SGMV kernel 的相对开销越大</strong>——rank=8 时 LoRA 计算占总时间 &lt; 1%,rank=64 可能到 5-8%。</p><h3 id="_8-2-显存账与冷加载" tabindex="-1">8.2 显存账与冷加载 <a class="header-anchor" href="#_8-2-显存账与冷加载" aria-label="Permalink to &quot;8.2 显存账与冷加载&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>rank=16,Llama-3-70B(80 层、hidden=8192):</span></span>
<span class="line"><span>  每层 LoRA = 2 × (16 × 8192) × 2 = 524 KB / 层</span></span>
<span class="line"><span>  全模型 LoRA ≈ 42 MB</span></span>
<span class="line"><span>  100 个 LoRA ≈ 4.2 GB     ← 微不足道</span></span>
<span class="line"><span>  1000 个 LoRA ≈ 42 GB     ← 一张 H100 仍能容纳</span></span></code></pre></div><p><strong>LoRA 显存压力远低于 KV Cache</strong>——<code>--max-loras</code> 限制更多是 kernel 调度复杂度,不是显存。</p><p>三级缓存策略:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>GPU 活跃池:max-loras = 16</span></span>
<span class="line"><span>CPU 缓存池:max-cpu-loras = 100,LRU 换入换出</span></span>
<span class="line"><span>本地存储池:数千个 LoRA 文件</span></span>
<span class="line"><span></span></span>
<span class="line"><span>请求带新 LoRA id 来:</span></span>
<span class="line"><span>  1. 在 GPU 池?直接用</span></span>
<span class="line"><span>  2. 在 CPU 池?swap 进 GPU(几十 ms)</span></span>
<span class="line"><span>  3. 都没?从磁盘 load 到 CPU,再 swap(秒级冷启动)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>工程实践:启动预热热门 LoRA、闲时主动卸载冷 LoRA、租户隔离 GPU slot</span></span></code></pre></div><h3 id="_8-3-监控指标" tabindex="-1">8.3 监控指标 <a class="header-anchor" href="#_8-3-监控指标" aria-label="Permalink to &quot;8.3 监控指标&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>multi-LoRA 服务特有指标:</span></span>
<span class="line"><span>  active_loras:                当前 GPU 上活跃 LoRA 数</span></span>
<span class="line"><span>  lora_swap_in_total:          冷加载次数(高 = 工作集太大)</span></span>
<span class="line"><span>  lora_swap_in_latency_p99:    冷加载延迟</span></span>
<span class="line"><span>  per_lora_qps:                每 LoRA 的 QPS(不均衡时考虑路由)</span></span>
<span class="line"><span>  batch_lora_diversity:        一个 batch 内 LoRA 种类数(分散 SGMV 越复杂)</span></span></code></pre></div><hr><h2 id="九、qlora-服务化与工业实践" tabindex="-1">九、QLoRA 服务化与工业实践 <a class="header-anchor" href="#九、qlora-服务化与工业实践" aria-label="Permalink to &quot;九、QLoRA 服务化与工业实践&quot;">​</a></h2><p>QLoRA 是训练时的事:<strong>4-bit 量化 base + LoRA 训练</strong>(NF4 + double quant + paged optimizer)。推理时两种做法:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>做法 1:dequant base + multi-LoRA(简单)</span></span>
<span class="line"><span>  4-bit base → load 时 dequant 回 BF16/FP16</span></span>
<span class="line"><span>  推理时 base BF16 + LoRA 走 SGMV</span></span>
<span class="line"><span>  问题:失去 4-bit 显存收益,只是「训练时省钱」</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>做法 2:量化 base + 量化 LoRA kernel(性能更好)</span></span>
<span class="line"><span>  base 保持 4-bit(GPTQ / AWQ / bnb-NF4 格式)</span></span>
<span class="line"><span>  LoRA 仍 BF16 / FP16</span></span>
<span class="line"><span>  attention / MLP kernel 内部:base dequant → BF16 GEMM,LoRA BF16 GEMM,累加</span></span>
<span class="line"><span>  vLLM 已支持 AWQ + multi-LoRA 组合</span></span></code></pre></div><p>实战推荐:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>GPU 充裕:base BF16 + multi-LoRA(最稳)</span></span>
<span class="line"><span>GPU 紧:  base FP8 + KV FP8 + multi-LoRA(2026 主流)</span></span>
<span class="line"><span>极致紧:  base AWQ INT4 + LoRA + KV INT4(精度略损)</span></span></code></pre></div><p>工业现状:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Modal Labs:    用户提交 LoRA 自动加载到共享 base,弹性算 LoRA 计费</span></span>
<span class="line"><span>                底层 vLLM + Ray Serve(26 篇)</span></span>
<span class="line"><span>Anyscale:      RayLLM 集成 vLLM multi-LoRA,K8s 多租户隔离</span></span>
<span class="line"><span>OpenAI fine-tuning API: 内部 multi-LoRA 路由,所有用户共享 base</span></span>
<span class="line"><span>                       (这就是 fine-tune 后只贵一点点而非 100 倍的原因)</span></span>
<span class="line"><span>Replicate / Together AI / Fireworks: 服务模式都是「上传 LoRA → 路由到 base 集群」</span></span></code></pre></div><p><strong>「微调」在 2026 云上等于「上传一个 LoRA 到 multi-LoRA 集群」</strong>,不是「单独起一个服务」——这是 LoRA 服务化最大的产业意义。</p><hr><h2 id="十、看完这一篇-你应该能" tabindex="-1">十、看完这一篇,你应该能 <a class="header-anchor" href="#十、看完这一篇-你应该能" aria-label="Permalink to &quot;十、看完这一篇,你应该能&quot;">​</a></h2><ul><li>解释为什么单 LoRA merge 没问题、多 LoRA merge 不可能</li><li>画出多 LoRA 服务的请求路由图(同 batch 不同 LoRA,base GEMM 一次 + SGMV LoRA 一次)</li><li>说出 S-LoRA 的两个核心贡献(Unified Paging + Heterogeneous Batching)</li><li>解释 SGMV kernel 解决的问题(按 LoRA id 分段的小矩阵乘合并成一个 launch)</li><li>用 vLLM <code>--enable-lora</code> + <code>LoRARequest</code> / <code>--lora-modules</code> 起一个 multi-LoRA 服务</li><li>选 LoRA rank 时知道 8/16/32 是甜点,以及 rank 越大 SGMV kernel 相对开销越大</li><li>设计一个 LoRA 冷加载 + LRU 缓存策略(GPU pool / CPU pool / 磁盘三级)</li><li>解释 QLoRA 推理时 dequant base 还是混合 kernel 的取舍</li></ul><p>下一篇:<strong>25 Ray 心智</strong> — 系列从模型层切换到调度平台层。Ray 的 Actor / Task / Object Store 是怎么把 vLLM / 训练 / 数据流水 / 多 LoRA 服务都托管起来的,Ray Serve 为什么是 RayLLM / Anyscale 的事实编排层。本系列后半段全部建立在 Ray 这套抽象之上。</p>`,83)])])}const g=a(l,[["render",e]]);export{d as __pageData,g as default};
