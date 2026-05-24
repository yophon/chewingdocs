import{_ as a,H as n,f as p,i as e}from"./chunks/framework.BHvCMIhP.js";const r=JSON.parse('{"title":"KV Cache 量化:长上下文真正的杀手锏","description":"","frontmatter":{},"headers":[],"relativePath":"aiInfraLearning/23-KVCache量化.md","filePath":"aiInfraLearning/23-KVCache量化.md","lastUpdated":1778649484000}'),l={name:"aiInfraLearning/23-KVCache量化.md"};function i(t,s,c,h,o,d){return n(),p("div",null,[...s[0]||(s[0]=[e(`<h1 id="kv-cache-量化-长上下文真正的杀手锏" tabindex="-1">KV Cache 量化:长上下文真正的杀手锏 <a class="header-anchor" href="#kv-cache-量化-长上下文真正的杀手锏" aria-label="Permalink to &quot;KV Cache 量化:长上下文真正的杀手锏&quot;">​</a></h1><p>07 篇算过 KV Cache 的显存账:70B 模型 BF16 推理,128K 上下文一个请求 KV 就要 40GB,batch=8 直接 320GB,<strong>KV 比权重(140GB)还大</strong>。22 篇又说「KV FP8 是免费降本的最大单点」。这一篇拉清楚为什么——KV 量化跟权重量化 / 激活量化在工程上完全是另一回事,<strong>只动 KV 不动权重的设计</strong>让它代价小、收益大,2026 年长上下文服务基本默认开启。</p><blockquote><p>一句话先记住:<strong>KV 量化必须 per-token(每个 token 自己一个 scale),原因是 token 之间数值范围差异极大;FP8 KV 50% 显存收益、精度损失 &lt; 1%,长上下文必开;INT4 KV 75% 收益、长序列末尾会丢细节,适合极限显存场景;量化-反量化必须在 attention kernel 内部完成,vLLM / SGLang / TRT-LLM 都已生产可用</strong>。</p></blockquote><hr><h2 id="一、为什么-kv-量化收益大" tabindex="-1">一、为什么 KV 量化收益大 <a class="header-anchor" href="#一、为什么-kv-量化收益大" aria-label="Permalink to &quot;一、为什么 KV 量化收益大&quot;">​</a></h2><h3 id="_1-1-长上下文场景下-kv-远超权重" tabindex="-1">1.1 长上下文场景下 KV 远超权重 <a class="header-anchor" href="#_1-1-长上下文场景下-kv-远超权重" aria-label="Permalink to &quot;1.1 长上下文场景下 KV 远超权重&quot;">​</a></h3><p>复用 07 篇的公式,以 Llama-3-70B(80 层、8 KV head、head_dim=128、GQA)为例:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>每 token 每层 KV(BF16):</span></span>
<span class="line"><span>  2 × n_kv_head × head_dim × 2 bytes</span></span>
<span class="line"><span>  = 2 × 8 × 128 × 2 = 4096 bytes/层 = 4 KB/层</span></span>
<span class="line"><span></span></span>
<span class="line"><span>每 token 全部 80 层 KV:</span></span>
<span class="line"><span>  4 KB × 80 = 320 KB / token</span></span>
<span class="line"><span></span></span>
<span class="line"><span>不同 context 长度(单请求):</span></span>
<span class="line"><span>  4K  ctx:   4096 × 320 KB ≈ 1.25 GB</span></span>
<span class="line"><span>  32K ctx:   32768 × 320 KB ≈ 10 GB</span></span>
<span class="line"><span>  128K ctx: 131072 × 320 KB ≈ 40 GB</span></span>
<span class="line"><span>  1M  ctx:    ...        ≈ 320 GB    单请求就装不下</span></span>
<span class="line"><span></span></span>
<span class="line"><span>batch × context 双增长:</span></span>
<span class="line"><span>  batch=8 × 128K = 320 GB           ← 8 卡 H100 全部 KV 占满,权重都没地方放</span></span>
<span class="line"><span>  batch=4 × 256K = 320 GB</span></span>
<span class="line"><span>  batch=1 × 1M   = 320 GB</span></span></code></pre></div><p><strong>长上下文场景里 KV 是绝对的显存杀手</strong>,GQA(把 KV 头数从 64 砍到 8)已经把权重侧的优化都用完了,再省就只能往 KV 字节上动手。</p><h3 id="_1-2-一张表-三种量化方案对比" tabindex="-1">1.2 一张表:三种量化方案对比 <a class="header-anchor" href="#_1-2-一张表-三种量化方案对比" aria-label="Permalink to &quot;1.2 一张表:三种量化方案对比&quot;">​</a></h3><p>同一个 Llama-3-70B、batch=8、128K context:</p><table tabindex="0"><thead><tr><th>方案</th><th>字节/值</th><th>KV 总占用</th><th>显存收益</th><th>精度损失(MMLU)</th><th>长上下文检索(needle@128K)</th></tr></thead><tbody><tr><td>BF16</td><td>2.00</td><td>320 GB</td><td>0%</td><td>0%</td><td>100%</td></tr><tr><td>FP8 E4M3</td><td>1.00</td><td>160 GB</td><td>50%</td><td>0.3-0.8%</td><td>95-98%</td></tr><tr><td>FP8 E5M2</td><td>1.00</td><td>160 GB</td><td>50%</td><td>0.5-1.0%</td><td>95-97%</td></tr><tr><td>INT8 (per-token)</td><td>1.00 + scale</td><td>~165 GB</td><td>48%</td><td>0.5-1.5%</td><td>92-96%</td></tr><tr><td>INT4 (per-token)</td><td>0.50 + scale</td><td>~85 GB</td><td>73%</td><td>1-3%</td><td>85-92%</td></tr><tr><td>INT2(实验)</td><td>0.25 + scale</td><td>~50 GB</td><td>84%</td><td>5-10%</td><td>&lt; 70%</td></tr></tbody></table><p><strong>FP8 是 2026 长上下文服务的主流首选</strong>:50% 显存收益、精度几乎没损失。INT4 是「装不下就上」的极限方案。</p><hr><h2 id="二、kv-量化的特殊性" tabindex="-1">二、KV 量化的特殊性 <a class="header-anchor" href="#二、kv-量化的特殊性" aria-label="Permalink to &quot;二、KV 量化的特殊性&quot;">​</a></h2><h3 id="_2-1-为什么不能-per-tensor" tabindex="-1">2.1 为什么不能 per-tensor <a class="header-anchor" href="#_2-1-为什么不能-per-tensor" aria-label="Permalink to &quot;2.1 为什么不能 per-tensor&quot;">​</a></h3><p>权重量化可以 per-tensor 一个 scale(权重是静态的、整个张量数值范围相对一致)。KV 不行:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>不同 token 的 K / V 数值范围对比(典型 LLM):</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  token 序号    →</span></span>
<span class="line"><span>   ┌──────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>   │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │</span></span>
<span class="line"><span>   │█│ │█│ │ │ │█│█│ │ │ │ │ │ │█│█│█│ │█│ │█│ │ │ │█│ │█│█│ │█│ │</span></span>
<span class="line"><span>   └─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┘</span></span>
<span class="line"><span>      ↑ token 0 K 值范围 ±2.5,大多 token 在 ±1 内</span></span>
<span class="line"><span>      ↑ token 7 是 special token,K 值范围 ±50 (outlier)</span></span>
<span class="line"><span>      ↑ token 23 是数字 token,K 值范围 ±0.5</span></span>
<span class="line"><span>      </span></span>
<span class="line"><span>  如果 per-tensor 一个 scale:</span></span>
<span class="line"><span>    scale = max / 448 ≈ 50/448 = 0.11</span></span>
<span class="line"><span>    token 23 的真实值 0.5 → 量化后 = 4.5 (FP8 E4M3 邻近值 5.0)</span></span>
<span class="line"><span>    精度退化为 11%,无法用</span></span>
<span class="line"><span>    </span></span>
<span class="line"><span>  per-token scale:</span></span>
<span class="line"><span>    每个 token 自己算一个 scale</span></span>
<span class="line"><span>    token 7:  scale = 50/448 = 0.11</span></span>
<span class="line"><span>    token 23: scale = 0.5/448 = 0.0011    ← 精度极高</span></span>
<span class="line"><span>    每个 token 内部精度都最大化</span></span></code></pre></div><p><strong>所以 KV 量化天然是 per-token / per-channel 的细粒度量化</strong>——这是它跟权重量化最大的不同。</p><h3 id="_2-2-量化与反量化的发生位置" tabindex="-1">2.2 量化与反量化的发生位置 <a class="header-anchor" href="#_2-2-量化与反量化的发生位置" aria-label="Permalink to &quot;2.2 量化与反量化的发生位置&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>没量化的 attention 计算:</span></span>
<span class="line"><span>  Q (FP16) × K^T (FP16)  →  attention scores (FP32)</span></span>
<span class="line"><span>  scores → softmax → attention weights</span></span>
<span class="line"><span>  attention weights × V (FP16) → output</span></span>
<span class="line"><span></span></span>
<span class="line"><span>KV 量化后的 attention 计算:</span></span>
<span class="line"><span>  KV cache 里存的是 FP8 / INT4 K, V + 每 token 的 scale</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  Q (FP16) × K_quantized^T </span></span>
<span class="line"><span>       ↓</span></span>
<span class="line"><span>       kernel 内部边读 K 边反量化:</span></span>
<span class="line"><span>         for each token in cache:</span></span>
<span class="line"><span>           K_fp16_token = dequant(K_quantized_token, scale_token)</span></span>
<span class="line"><span>           score += Q · K_fp16_token^T</span></span>
<span class="line"><span>       ↓</span></span>
<span class="line"><span>  scores → softmax → attention weights</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  attention weights × V_quantized</span></span>
<span class="line"><span>       ↓</span></span>
<span class="line"><span>       同样,边读 V 边反量化</span></span>
<span class="line"><span>       ↓</span></span>
<span class="line"><span>  output</span></span>
<span class="line"><span></span></span>
<span class="line"><span>关键:反量化必须发生在 kernel 内部,不能在 kernel 外提前 dequant 整个 cache</span></span>
<span class="line"><span>       (那样反而把显存翻倍 + HBM 搬运变多,完全失去收益)</span></span></code></pre></div><p><strong>这就是为什么 KV 量化必须有 attention kernel 的支持</strong>——不是简单改个 dtype 就能跑,需要 kernel 内置 dequant 路径。FlashAttention-3 / vLLM 的 PagedAttention v2 都有专门的 FP8 / INT4 KV path。</p><hr><h2 id="三、显存布局-三种方案" tabindex="-1">三、显存布局:三种方案 <a class="header-anchor" href="#三、显存布局-三种方案" aria-label="Permalink to &quot;三、显存布局:三种方案&quot;">​</a></h2><h3 id="_3-1-必画图-kv-cache-block-的内部结构" tabindex="-1">3.1 必画图:KV Cache block 的内部结构 <a class="header-anchor" href="#_3-1-必画图-kv-cache-block-的内部结构" aria-label="Permalink to &quot;3.1 必画图:KV Cache block 的内部结构&quot;">​</a></h3><p>vLLM PagedAttention 把 KV 切成固定大小的 block(默认 16 token / block)。一个 block 内部布局如下:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>BF16 KV block(基线,vLLM 默认)</span></span>
<span class="line"><span>─────────────────────────────────────────────────────────</span></span>
<span class="line"><span>block 大小 = 16 token × 8 KV head × 128 head_dim × 2 bytes</span></span>
<span class="line"><span>           = 32 KB(K) + 32 KB(V) = 64 KB / block</span></span>
<span class="line"><span>           </span></span>
<span class="line"><span>内存布局:</span></span>
<span class="line"><span>  ┌─────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>  │  K 部分(连续 32 KB)                                │</span></span>
<span class="line"><span>  │  ┌───┬───┬───┬───┬───┬───┬───┬───┬───┬...┬───┐    │</span></span>
<span class="line"><span>  │  │t0 │t1 │t2 │t3 │t4 │t5 │t6 │t7 │t8 │...│t15│    │</span></span>
<span class="line"><span>  │  └───┴───┴───┴───┴───┴───┴───┴───┴───┴...┴───┘    │</span></span>
<span class="line"><span>  │   ↑ 每 token 2 KB(8 head × 128 dim × 2 bytes)     │</span></span>
<span class="line"><span>  ├─────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>  │  V 部分(连续 32 KB)                                │</span></span>
<span class="line"><span>  │  ┌───┬───┬───┬───┬───┬───┬───┬───┬───┬...┬───┐    │</span></span>
<span class="line"><span>  │  │t0 │t1 │t2 │t3 │t4 │t5 │t6 │t7 │t8 │...│t15│    │</span></span>
<span class="line"><span>  │  └───┴───┴───┴───┴───┴───┴───┴───┴───┴...┴───┘    │</span></span>
<span class="line"><span>  └─────────────────────────────────────────────────────┘</span></span>
<span class="line"><span></span></span>
<span class="line"><span></span></span>
<span class="line"><span>FP8 KV block(50% 收益,主流)</span></span>
<span class="line"><span>─────────────────────────────────────────────────────────</span></span>
<span class="line"><span>block 大小 = 16 token × 8 head × 128 dim × 1 byte</span></span>
<span class="line"><span>           = 16 KB(K) + 16 KB(V) + scale = 32 KB + ε / block</span></span>
<span class="line"><span></span></span>
<span class="line"><span>内存布局:</span></span>
<span class="line"><span>  ┌─────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>  │  K 部分(16 KB,FP8 E4M3)                          │</span></span>
<span class="line"><span>  │  ┌───┬───┬───┬───┬───┬───┬───┬───┬───┬...┬───┐    │</span></span>
<span class="line"><span>  │  │t0 │t1 │t2 │t3 │t4 │t5 │t6 │t7 │t8 │...│t15│    │</span></span>
<span class="line"><span>  │  └───┴───┴───┴───┴───┴───┴───┴───┴───┴...┴───┘    │</span></span>
<span class="line"><span>  │   ↑ 每 token 1 KB(8 head × 128 dim × 1 byte)      │</span></span>
<span class="line"><span>  │  K scale(per-token,FP16):16 个值 = 32 bytes      │</span></span>
<span class="line"><span>  ├─────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>  │  V 部分(16 KB,FP8 E5M2)+ V scale 32 bytes        │</span></span>
<span class="line"><span>  └─────────────────────────────────────────────────────┘</span></span>
<span class="line"><span>  总 block:32 KB + 64 bytes ≈ 32.06 KB</span></span>
<span class="line"><span>  scale 开销 &lt; 0.2%,可忽略</span></span>
<span class="line"><span></span></span>
<span class="line"><span></span></span>
<span class="line"><span>INT4 KV block(75% 收益,极限场景)</span></span>
<span class="line"><span>─────────────────────────────────────────────────────────</span></span>
<span class="line"><span>block 大小 = 16 token × 8 head × 128 dim × 0.5 byte</span></span>
<span class="line"><span>           = 8 KB(K) + 8 KB(V) + scale + zero_point = 16 KB + ε</span></span>
<span class="line"><span></span></span>
<span class="line"><span>内存布局:</span></span>
<span class="line"><span>  ┌─────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>  │  K 部分(8 KB,INT4 packed)                        │</span></span>
<span class="line"><span>  │  ┌───┬───┬───┬───┬───┬───┬───┬───┬───┬...┬───┐    │</span></span>
<span class="line"><span>  │  │t0 │t1 │t2 │t3 │t4 │t5 │t6 │t7 │t8 │...│t15│    │</span></span>
<span class="line"><span>  │  └───┴───┴───┴───┴───┴───┴───┴───┴───┴...┴───┘    │</span></span>
<span class="line"><span>  │   ↑ 每 token 512 bytes(每两个 INT4 打包成一个字节) │</span></span>
<span class="line"><span>  │  K scale(per-token, FP16) + zero_point(per-token, INT8) │</span></span>
<span class="line"><span>  │  额外:16 × (2 + 1) = 48 bytes                     │</span></span>
<span class="line"><span>  ├─────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>  │  V 部分(8 KB,INT4 packed)+ scale + zero_point   │</span></span>
<span class="line"><span>  └─────────────────────────────────────────────────────┘</span></span>
<span class="line"><span>  总 block:16 KB + 96 bytes ≈ 16.1 KB</span></span>
<span class="line"><span>  scale 开销 &lt; 0.6%</span></span></code></pre></div><p><strong>FP8 几乎不需要 zero_point</strong>(浮点本身能表示负数和 0),INT 量化必须配 scale + zero_point 两个参数。</p><h3 id="_3-2-per-token-scale-怎么算" tabindex="-1">3.2 per-token scale 怎么算 <a class="header-anchor" href="#_3-2-per-token-scale-怎么算" aria-label="Permalink to &quot;3.2 per-token scale 怎么算&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>量化:</span></span>
<span class="line"><span>  for each token in cache:</span></span>
<span class="line"><span>    amax_token = max(|K_token|)            # 这个 token 内最大绝对值</span></span>
<span class="line"><span>    scale_token = amax_token / 448         # FP8 E4M3 max = 448</span></span>
<span class="line"><span>    K_token_fp8 = clamp(K_token / scale_token, -448, +448).cast(FP8)</span></span>
<span class="line"><span>    存:K_token_fp8(1 byte/值)+ scale_token(2 byte / token)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>反量化(kernel 内):</span></span>
<span class="line"><span>  K_token_fp16 = K_token_fp8.cast(FP16) × scale_token</span></span></code></pre></div><p><strong>注意</strong>:scale 是「per-token」而不是「per-element」——一个 token 内的所有 head × dim 共享一个 scale。再细就成了「per-channel per-token」,精度更好但 kernel 复杂度爆炸,目前生产没人这么细。</p><hr><h2 id="四、与-pagedattention-的配合" tabindex="-1">四、与 PagedAttention 的配合 <a class="header-anchor" href="#四、与-pagedattention-的配合" aria-label="Permalink to &quot;四、与 PagedAttention 的配合&quot;">​</a></h2><h3 id="_4-1-vllm-block-内自包含" tabindex="-1">4.1 vLLM block 内自包含 <a class="header-anchor" href="#_4-1-vllm-block-内自包含" aria-label="Permalink to &quot;4.1 vLLM block 内自包含&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                 KV 物理内存池</span></span>
<span class="line"><span>   ┌───────────────────────────────────────────────────┐</span></span>
<span class="line"><span>   │  block 0:  request A, position 0-15  (FP8)        │</span></span>
<span class="line"><span>   │  block 1:  request B, position 0-15  (FP8)        │</span></span>
<span class="line"><span>   │  block 2:  request A, position 16-31 (FP8)        │</span></span>
<span class="line"><span>   │  block 3:  request C, position 0-15  (FP8)        │</span></span>
<span class="line"><span>   │  block 4:  request B, position 16-31 (FP8)        │</span></span>
<span class="line"><span>   │  ...                                              │</span></span>
<span class="line"><span>   └───────────────────────────────────────────────────┘</span></span>
<span class="line"><span>                         ↑</span></span>
<span class="line"><span>   每个 block 都自包含:K, V 数据 + 每 token 的 scale</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   Request A 的 block table:</span></span>
<span class="line"><span>   [0, 2, ...]    ← 通过 block 索引拼出整个 KV 序列</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   Attention kernel 拿到 block table → 逐 block 读 → block 内 dequant → 算 attention</span></span></code></pre></div><p><strong>关键工程点</strong>:scale 必须跟 K/V 在同一个 block 内,<strong>不能放到外部表</strong>——否则 kernel 读 K 一次、读 scale 一次,HBM 来回两倍。</p><h3 id="_4-2-量化-反量化的-kernel-overhead" tabindex="-1">4.2 量化-反量化的 kernel overhead <a class="header-anchor" href="#_4-2-量化-反量化的-kernel-overhead" aria-label="Permalink to &quot;4.2 量化-反量化的 kernel overhead&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>小 batch 场景(decode batch=1, 512 tokens cache):</span></span>
<span class="line"><span>  Attention 总计算量:Q (1,d) × K (512, d)^T  </span></span>
<span class="line"><span>                  + softmax  </span></span>
<span class="line"><span>                  + attn_w (1,512) × V (512, d)</span></span>
<span class="line"><span>  约 100 万次 FMA</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  反量化开销:dequant 512 个 K_token × 8 head × 128 dim × 1 cast</span></span>
<span class="line"><span>            ≈ 50 万次 cast(快但不忽略)</span></span>
<span class="line"><span>            </span></span>
<span class="line"><span>  → kernel 跑慢 10-15%(对比 BF16 KV,无需 dequant)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>大 batch 场景(decode batch=64, 32K tokens cache):</span></span>
<span class="line"><span>  Attention 总计算量增长 64 × 64 = 4096 倍</span></span>
<span class="line"><span>  反量化开销也增长 64 × 64 倍</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  但显存收益(50%)直接让 batch 翻倍成可能</span></span>
<span class="line"><span>  → 整体吞吐反而 1.5-1.8 倍</span></span></code></pre></div><p><strong>结论</strong>:小并发短上下文 KV 量化不一定划算,<strong>KV 量化的甜点在大并发 + 长上下文</strong>——而这正好是长上下文服务的常态。</p><hr><h2 id="五、工程落地" tabindex="-1">五、工程落地 <a class="header-anchor" href="#五、工程落地" aria-label="Permalink to &quot;五、工程落地&quot;">​</a></h2><h3 id="_5-1-vllm" tabindex="-1">5.1 vLLM <a class="header-anchor" href="#_5-1-vllm" aria-label="Permalink to &quot;5.1 vLLM&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># FP8 E4M3 KV(默认精度更好)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">vllm</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> serve</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> meta-llama/Meta-Llama-3-70B-Instruct</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --kv-cache-dtype</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> fp8</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --tensor-parallel-size</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 4</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --max-model-len</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 131072</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --gpu-memory-utilization</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 0.95</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 或者明确指定格式</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">--kv-cache-dtype</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> fp8_e4m3</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">      # 精度优先(主流)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">--kv-cache-dtype</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> fp8_e5m2</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">      # 范围优先(更长上下文,精度略差)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 与权重 FP8 / 激活 FP8 一起开</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">vllm</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> serve</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> meta-llama/Meta-Llama-3-70B-Instruct-FP8</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --quantization</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> fp8</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --kv-cache-dtype</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> fp8</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --tensor-parallel-size</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 4</span></span></code></pre></div><p>注意:<code>--quantization fp8</code>(权重量化)和 <code>--kv-cache-dtype fp8</code>(KV 量化)是<strong>两件独立的事</strong>——可以只开一个,也可以全开。</p><h3 id="_5-2-sglang" tabindex="-1">5.2 SGLang <a class="header-anchor" href="#_5-2-sglang" aria-label="Permalink to &quot;5.2 SGLang&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">python</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -m</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> sglang.launch_server</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --model-path</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> meta-llama/Meta-Llama-3-70B-Instruct</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --kv-cache-dtype</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> fp8_e5m2</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --tp</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 4</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --context-length</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 131072</span></span></code></pre></div><p>SGLang 的 RadixAttention(10 篇)对 KV 共享更激进,与 KV 量化叠加在长上下文 + 多轮场景收益更大。</p><h3 id="_5-3-trt-llm" tabindex="-1">5.3 TRT-LLM <a class="header-anchor" href="#_5-3-trt-llm" aria-label="Permalink to &quot;5.3 TRT-LLM&quot;">​</a></h3><p>TRT-LLM 不用运行时 flag,build engine 时指定:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">trtllm-build</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --checkpoint_dir</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ./llama-70b-fp8-checkpoint</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --output_dir</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ./engines/llama-70b-fp8</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --gemm_plugin</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> fp8</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --kv_cache_quant_algo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> fp8</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --use_paged_context_fmha</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> enable</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --max_input_len</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 131072</span></span></code></pre></div><p>TRT-LLM 也支持 INT8 KV(<code>--kv_cache_quant_algo int8</code>)和 INT4 KV(<code>int4_awq</code> 等)。</p><hr><h2 id="六、评测-不要只看-mmlu" tabindex="-1">六、评测:不要只看 MMLU <a class="header-anchor" href="#六、评测-不要只看-mmlu" aria-label="Permalink to &quot;六、评测:不要只看 MMLU&quot;">​</a></h2><p>短任务基准(MMLU、GSM8K、HumanEval)对 KV 量化的精度回退<strong>非常不敏感</strong>——这些任务的 context 短,KV 也少,量化误差累积有限。</p><p><strong>长上下文场景必须用专门基准</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>LongBench</span></span>
<span class="line"><span>  GitHub: THUDM/LongBench</span></span>
<span class="line"><span>  覆盖单文档 QA、多文档 QA、摘要、Few-shot、代码补全、合成任务</span></span>
<span class="line"><span>  context 范围 4K-200K</span></span>
<span class="line"><span>  KV 量化在这上面的回退能反映出来</span></span>
<span class="line"><span></span></span>
<span class="line"><span>RULER (NVIDIA)</span></span>
<span class="line"><span>  GitHub: NVIDIA/RULER</span></span>
<span class="line"><span>  专门测长上下文,包含 needle-in-a-haystack、变量追踪、共指消解</span></span>
<span class="line"><span>  4K-128K 多档,可对比量化精度退化曲线</span></span>
<span class="line"><span></span></span>
<span class="line"><span>InfiniteBench</span></span>
<span class="line"><span>  专测 100K+ 超长上下文</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Needle-in-a-Haystack</span></span>
<span class="line"><span>  最经典:在 N 万 token 的文档某处插一句「特定信息」,问模型能否找回</span></span>
<span class="line"><span>  KV 量化在这个任务上的回退最直观</span></span></code></pre></div><p><strong>实战建议</strong>:决定 KV 量化策略前,<strong>用 RULER 跑一遍 BF16 / FP8 / INT4 三档对比</strong>。INT4 在 32K 之前可能没差,到 64K 后开始掉,128K 时差距明显。FP8 几乎所有 context 长度都能跟住 BF16。</p><hr><h2 id="七、与-gqa-mqa-的关系" tabindex="-1">七、与 GQA / MQA 的关系 <a class="header-anchor" href="#七、与-gqa-mqa-的关系" aria-label="Permalink to &quot;七、与 GQA / MQA 的关系&quot;">​</a></h2><p>GQA(Grouped-Query Attention)和 MQA(Multi-Query Attention)是模型层面的 KV 压缩——把 KV head 数减少,Q head 共享同一组 KV。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Multi-Head Attention (原始):</span></span>
<span class="line"><span>  Q, K, V 各 N_head 个</span></span>
<span class="line"><span>  KV 大小 = 2 × N_head × head_dim × seq_len</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>GQA(Llama-2/3, Qwen 等主流):</span></span>
<span class="line"><span>  Q 仍 N_head 个,KV 只 N_kv_head 个(N_kv_head &lt; N_head)</span></span>
<span class="line"><span>  Q 分组,每组共享一组 KV</span></span>
<span class="line"><span>  Llama-3-70B:N_head = 64,N_kv_head = 8 → KV 缩 8 倍</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>MQA(PaLM 等):</span></span>
<span class="line"><span>  N_kv_head = 1,极端版 GQA</span></span>
<span class="line"><span>  KV 缩 N_head 倍</span></span></code></pre></div><p><strong>KV 量化是 GQA 之上还能再省一倍的方法</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Llama-3-70B 没 GQA:        KV 系数 1.0    (假设 baseline)</span></span>
<span class="line"><span>Llama-3-70B + GQA(已实现):KV 系数 1/8 = 0.125</span></span>
<span class="line"><span>Llama-3-70B + GQA + FP8 KV:KV 系数 0.0625</span></span>
<span class="line"><span>Llama-3-70B + GQA + INT4 KV:KV 系数 0.031</span></span></code></pre></div><p>GQA 是模型架构层面优化(训练就定了),KV 量化是推理层面优化(运行时切换)。<strong>两者完全正交,可以叠加</strong>。</p><hr><h2 id="八、什么时候不该量化-kv" tabindex="-1">八、什么时候不该量化 KV <a class="header-anchor" href="#八、什么时候不该量化-kv" aria-label="Permalink to &quot;八、什么时候不该量化 KV&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>场景                                     建议</span></span>
<span class="line"><span>──────────────────────────────────────  ─────────────────────────</span></span>
<span class="line"><span>短上下文(&lt; 4K)+ 中并发(batch &lt; 16)    可不开,收益小、精度损失没意义</span></span>
<span class="line"><span>TTFT 极敏感的实时对话                    谨慎,kernel overhead 在小 batch 影响 latency</span></span>
<span class="line"><span>精度敏感的代码 / 数学场景                FP8 OK,INT4 慎用</span></span>
<span class="line"><span>长上下文 RAG / 多轮 / agent              必开 FP8,可能要 INT4</span></span>
<span class="line"><span>1M+ 超长上下文                           必开 INT4 / 混合(浅层 FP8 + 深层 INT4)</span></span>
<span class="line"><span>极速研究迭代,精度评测不充分             先 FP8,验证后再考虑 INT4</span></span></code></pre></div><p><strong>反向 checklist</strong>:决定不开 KV 量化前,问自己一句「<strong>省下的显存能不能让 batch 翻倍</strong>」——能,就开;不能,就先调其他参数。</p><hr><h2 id="九、看完这一篇-你应该能" tabindex="-1">九、看完这一篇,你应该能 <a class="header-anchor" href="#九、看完这一篇-你应该能" aria-label="Permalink to &quot;九、看完这一篇,你应该能&quot;">​</a></h2><ul><li>解释为什么 KV 量化必须 per-token,不能 per-tensor</li><li>算出 70B 模型在不同 context / batch 下,BF16 vs FP8 vs INT4 KV 的占用对比</li><li>画 KV block 的内部布局(K 段、V 段、per-token scale 都在 block 内)</li><li>解释为什么反量化必须在 attention kernel 内部完成</li><li>说出 KV 量化在小 batch 短上下文可能拖慢的 kernel overhead,以及大 batch 长上下文为什么反而吞吐翻倍</li><li>用 vLLM <code>--kv-cache-dtype fp8</code> / SGLang / TRT-LLM 启动 KV 量化推理</li><li>知道评测必须用 RULER / LongBench / Needle-in-a-Haystack,不能只看 MMLU</li><li>解释 GQA 和 KV 量化为什么正交可叠加</li></ul><p>下一篇:<strong>24 LoRA 服务化</strong> — 训练侧的 LoRA(aiLearning 18)讲过低秩适配怎么训,但生产推理服务想同时跑 100 个领域 LoRA(法律 / 医疗 / 客服)怎么办?S-LoRA / Punica 怎么把多 LoRA 在同一 batch 内一次性算完,vLLM 的 multi-LoRA 怎么用,QLoRA 推理时该 dequant 还是混合 kernel——本系列量化 / 微调层最后一篇。</p>`,72)])])}const g=a(l,[["render",i]]);export{r as __pageData,g as default};
