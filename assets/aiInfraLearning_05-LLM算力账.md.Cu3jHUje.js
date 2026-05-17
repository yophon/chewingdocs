import{c as n,Q as a,j as p,m as e}from"./chunks/framework.CBiVa4O3.js";const u=JSON.parse('{"title":"LLM 算力账:三个公式 + 一张大表","description":"","frontmatter":{},"headers":[],"relativePath":"../aiInfraLearning/05-LLM算力账.md","filePath":"../aiInfraLearning/05-LLM算力账.md","lastUpdated":1778649484000}'),l={name:"../aiInfraLearning/05-LLM算力账.md"};function t(i,s,o,c,d,h){return a(),p("div",null,[...s[0]||(s[0]=[e(`<h1 id="llm-算力账-三个公式-一张大表" tabindex="-1">LLM 算力账:三个公式 + 一张大表 <a class="header-anchor" href="#llm-算力账-三个公式-一张大表" aria-label="Permalink to &quot;LLM 算力账:三个公式 + 一张大表&quot;">​</a></h1><p>LLM Infra 工程师跟前几代 Web 工程师最大的区别,就是必须会算账。一台 H100 8 卡服务器一天租金 100-200 美元,跑 70B 推理服务每千 token 成本 0.5 到 5 美元区间——算错一个数量级,公司从盈利变烧钱。这一篇用三个公式 + 几张表,把&quot;模型 vs 卡 vs 显存 vs 吞吐 vs 成本&quot;算清楚,后面所有选型(06 引擎、14 ZeRO、22 FP8、29 成本)都站在这一篇上。</p><blockquote><p>一句话先记住:<strong>推理一次 FLOPs ≈ 2 × P × tokens(P 是参数量),训练总 FLOPs ≈ 6 × P × D(D 是训练 token 数,Chinchilla),推理显存 ≈ 参数 × bytes + KV;Decode 阶段每 token 算量极小但要把所有权重读一遍,所以瓶颈是 HBM 带宽不是算力——这一组数学决定了选什么卡、能上什么模型、TPS 上限是多少</strong>。</p></blockquote><hr><h2 id="一、为什么必须会算账" tabindex="-1">一、为什么必须会算账 <a class="header-anchor" href="#一、为什么必须会算账" aria-label="Permalink to &quot;一、为什么必须会算账&quot;">​</a></h2><p>不会算账的三种典型错误:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 买错卡</span></span>
<span class="line"><span>   &quot;70B 推理 H100 一张就够吧&quot;</span></span>
<span class="line"><span>   → BF16 权重 140 GB,H100 SXM5 80 GB 装不下</span></span>
<span class="line"><span>   → 实际需要 2 张 H100 或 1 张 H200(141 GB)</span></span>
<span class="line"><span>   → 错了一档,采购预算翻倍</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. 定错 SLO</span></span>
<span class="line"><span>   &quot;我们 SLO 设 TTFT 100ms&quot;</span></span>
<span class="line"><span>   → 8K context prefill 在 H100 上至少 200-500ms</span></span>
<span class="line"><span>   → SLO 永远达不到,客户投诉,服务下线</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. 亏本上线</span></span>
<span class="line"><span>   &quot;OpenAI gpt-4o 0.005 美元/1k token,我们卖 0.003 应该有得赚&quot;</span></span>
<span class="line"><span>   → 70B 自托管成本算下来 0.5-2 美元/1k(没批量优化时)</span></span>
<span class="line"><span>   → 卖一单亏 100x,做得越大死得越快</span></span></code></pre></div><p>会算账的工程师在白板前 5 分钟就能砍掉这些方案,不用上线踩坑。下面三个公式是底子。</p><hr><h2 id="二、公式-1-推理-flops-≈-2-×-p-×-tokens" tabindex="-1">二、公式 1:推理 FLOPs ≈ 2 × P × tokens <a class="header-anchor" href="#二、公式-1-推理-flops-≈-2-×-p-×-tokens" aria-label="Permalink to &quot;二、公式 1:推理 FLOPs ≈ 2 × P × tokens&quot;">​</a></h2><p>每生成或处理一个 token,模型基本上要把所有参数都&quot;摸一遍&quot;。粗略估算:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>推理 FLOPs ≈ 2 × P × tokens</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  P:      模型参数量(忽略 embedding,只算 transformer block 主体)</span></span>
<span class="line"><span>  tokens: 处理的 token 总数(prefill 输入 + decode 输出)</span></span>
<span class="line"><span>  2:      一次乘加 (multiply-add) 算 2 个 FLOP</span></span></code></pre></div><p>为什么是 2 × P:每个权重在一个 token 上参与一次乘加,70B 模型一个 token 大概 140 G FLOPs。</p><p>举例:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>70B 模型,prompt 1024 + output 512 = 1536 tokens</span></span>
<span class="line"><span>  推理 FLOPs ≈ 2 × 70e9 × 1536 ≈ 2.15e14 = 215 TFLOPs</span></span>
<span class="line"><span></span></span>
<span class="line"><span>H100 BF16 算力 1979 TFLOPS:</span></span>
<span class="line"><span>  纯算力下 215 / 1979 ≈ 0.11 秒(理论下限,实际跑不到)</span></span></code></pre></div><p><strong>注意&quot;理论下限&quot;四个字</strong>——这只是把所有权重当 FLOP 算。实际 decode 阶段受 HBM 带宽限制,远跑不到这个速度。第九节展开。</p><p>Attention 项通常忽略,但长上下文不能忽略:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Attention FLOPs ≈ 2 × n_layer × n_head × seq_len² × head_dim</span></span>
<span class="line"><span>              ≈ O(L × H × seq² × d)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>70B (L=80, H=64, d=128):</span></span>
<span class="line"><span>  seq=2K:    Attention ≈ 5.4 G FLOPs / token        相比 140 G 主算量小</span></span>
<span class="line"><span>  seq=32K:   Attention ≈ 86  G FLOPs / token        开始可比</span></span>
<span class="line"><span>  seq=128K:  Attention ≈ 344 G FLOPs / token        反客为主</span></span></code></pre></div><p><strong>长上下文场景 attention 成本会反客为主</strong>——这是 FlashAttention / Sparse Attention / Sliding Window 等算法存在的原因(aiLearning 21 讲过算法细节)。</p><hr><h2 id="三、公式-2-训练总-flops-≈-6-×-p-×-d-chinchilla" tabindex="-1">三、公式 2:训练总 FLOPs ≈ 6 × P × D(Chinchilla) <a class="header-anchor" href="#三、公式-2-训练总-flops-≈-6-×-p-×-d-chinchilla" aria-label="Permalink to &quot;三、公式 2:训练总 FLOPs ≈ 6 × P × D(Chinchilla)&quot;">​</a></h2><p>DeepMind 2022 年 Chinchilla 论文给出的经验估计:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>训练总 FLOPs ≈ 6 × P × D</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  P: 参数量</span></span>
<span class="line"><span>  D: 训练 token 数</span></span>
<span class="line"><span>  6: 包含 forward (2P) + backward (4P,反向比前向贵 ~2x)</span></span></code></pre></div><p>为什么反向 ~2x 前向:每层反向要算两类梯度——对参数的梯度 + 对输入的梯度,两者各等于一次前向的算量。所以 forward 2P + backward 4P = 6P。</p><p>Chinchilla scaling law 还告诉我们,在算力预算固定时,<strong>最优 D ≈ 20 × P</strong>(每个参数训 20 个 token)。这是&quot;训多少 token 性价比最高&quot;的经验值。Llama-3 把这个推到 ~150 倍,是觉得算力不再是主要瓶颈,数据质量更重要。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>70B 模型,Chinchilla 最优 D = 20 × 70B = 1.4T tokens</span></span>
<span class="line"><span>训练总 FLOPs ≈ 6 × 70e9 × 1.4e12 = 5.88e23 FLOPs</span></span>
<span class="line"><span></span></span>
<span class="line"><span>折算到 H100 BF16(标称 1979 TFLOPS,实际 sustained 约 30-50%):</span></span>
<span class="line"><span>  实际有效算力 ≈ 1979 × 0.4 ≈ 800 TFLOPS / 卡</span></span>
<span class="line"><span>  总 GPU 秒 = 5.88e23 / (800e12) ≈ 7.35e8 秒</span></span>
<span class="line"><span>            = 8500 卡天</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  1024 张 H100 训:8500 / 1024 ≈ 8.3 天   (利用率拉满的理想)</span></span>
<span class="line"><span>  实际 30% MFU:                     ≈ 28 天 / 1024 卡</span></span>
<span class="line"><span>  256 张 H100 训:                   ≈ 33-100 天</span></span></code></pre></div><p><strong>8 天 1024 张 H100 训一个 70B,这是 2024-2025 头部公司的事实成本</strong>。考虑到 H100 月租 1500-2500 美元 / 卡,8 天 1024 卡 ≈ 1024 × 8/30 × 2000 ≈ 55 万美元——还没算前期数据准备、试错、checkpoint 恢复、超参搜索。</p><p>DeepSeek 系列在工程上反复验证一件事:<strong>MoE 把激活参数从 670B 降到 37B,训练 FLOPs 按&quot;激活参数 × D&quot;算</strong>——所以 V3 只用了 ~2.8e24 FLOPs(约 2048 H800 × 2 个月)就训完。这是 MoE 经济学。</p><hr><h2 id="四、公式-3-推理显存-权重-kv" tabindex="-1">四、公式 3:推理显存 = 权重 + KV <a class="header-anchor" href="#四、公式-3-推理显存-权重-kv" aria-label="Permalink to &quot;四、公式 3:推理显存 = 权重 + KV&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>推理显存 ≈ 模型参数 × bytes_per_param + KV Cache + workspace</span></span>
<span class="line"><span></span></span>
<span class="line"><span>KV Cache 大小 ≈ 2 × n_layer × n_kv_head × head_dim × seq × batch × bytes</span></span>
<span class="line"><span>             ↑</span></span>
<span class="line"><span>             K 和 V 各一份</span></span></code></pre></div><p><code>workspace</code>(临时计算 buffer、CUDA Graph 等)在 vLLM 里通常预留几 GB。下面只算前两块。</p><h3 id="_4-1-权重显存-各模型规模-×-各精度" tabindex="-1">4.1 权重显存(各模型规模 × 各精度) <a class="header-anchor" href="#_4-1-权重显存-各模型规模-×-各精度" aria-label="Permalink to &quot;4.1 权重显存(各模型规模 × 各精度)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                     BF16 (2B/p)    FP8 (1B/p)    INT4 (0.5B/p)</span></span>
<span class="line"><span>7B 模型:              14 GB          7 GB          3.5 GB</span></span>
<span class="line"><span>13B 模型:             26 GB          13 GB         6.5 GB</span></span>
<span class="line"><span>34B 模型:             68 GB          34 GB         17 GB</span></span>
<span class="line"><span>70B 模型:             140 GB         70 GB         35 GB</span></span>
<span class="line"><span>180B 模型 (MoE 激活):  360 GB         180 GB        90 GB</span></span>
<span class="line"><span>405B 模型:            810 GB         405 GB        202 GB</span></span></code></pre></div><p>(MoE 全部参数比这大,但每 token 只激活一部分。激活的部分要驻留,未激活的可以路由到不同卡——25 / 27 篇展开)</p><h3 id="_4-2-kv-cache-显存-每-token-典型-gqa-模型" tabindex="-1">4.2 KV Cache 显存(每 token,典型 GQA 模型) <a class="header-anchor" href="#_4-2-kv-cache-显存-每-token-典型-gqa-模型" aria-label="Permalink to &quot;4.2 KV Cache 显存(每 token,典型 GQA 模型)&quot;">​</a></h3><p>按 70B Llama-style 模型(80 层、64 头、8 KV 头、head_dim=128):</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>每 token KV (BF16) = 2 × 80 × 8 × 128 × 2B ≈ 327 KB</span></span>
<span class="line"><span>每 token KV (FP8)  ≈ 163 KB</span></span>
<span class="line"><span>每 token KV (INT4) ≈  82 KB</span></span></code></pre></div><p>按 7B Llama-3(32 层、32 头、8 KV 头、head_dim=128):</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>每 token KV (BF16) = 2 × 32 × 8 × 128 × 2B ≈ 131 KB</span></span>
<span class="line"><span>每 token KV (FP8)  ≈  66 KB</span></span>
<span class="line"><span>每 token KV (INT4) ≈  33 KB</span></span></code></pre></div><p><code>bytes/token = 2(KV) × n_layer × n_kv_head × head_dim × bytes_per_elem</code>,记住&quot;GQA 模型 KV 大小由 n_kv_head 决定,不是 n_head&quot;。Llama-3 70B GQA 把 KV 头数从 64 砍到 8,KV 占用直接砍 8x——这是为什么 GQA 几乎成了 2024 之后所有大模型的标配。</p><hr><h2 id="五、单卡能不能装下-三大模型-×-三大卡" tabindex="-1">五、单卡能不能装下:三大模型 × 三大卡 <a class="header-anchor" href="#五、单卡能不能装下-三大模型-×-三大卡" aria-label="Permalink to &quot;五、单卡能不能装下:三大模型 × 三大卡&quot;">​</a></h2><p>把权重 + 一段典型 KV 加起来:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>            权重 (BF16)  权重 (FP8)   权重 (INT4)</span></span>
<span class="line"><span>7B          14 GB        7 GB         3.5 GB</span></span>
<span class="line"><span>70B         140 GB       70 GB        35 GB</span></span>
<span class="line"><span>405B        810 GB       405 GB       202 GB</span></span></code></pre></div><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                A100 80G    H100 80G    H200 141G   8×H100      8×H200</span></span>
<span class="line"><span>7B   BF16       ✓单卡       ✓单卡       ✓单卡       ✓           ✓</span></span>
<span class="line"><span>7B   FP8        ✓单卡       ✓单卡       ✓单卡       ✓           ✓</span></span>
<span class="line"><span>70B  BF16       ✗(140&gt;80)   ✗           ✓单卡       ✓           ✓</span></span>
<span class="line"><span>70B  FP8        ✓单卡(紧)    ✓单卡(紧)    ✓单卡       ✓           ✓</span></span>
<span class="line"><span>70B  INT4       ✓单卡       ✓单卡       ✓单卡       ✓           ✓</span></span>
<span class="line"><span>405B BF16       ✗           ✗           ✗           ✓ TP=8       ✓ TP=8</span></span>
<span class="line"><span>405B FP8        ✗           ✗           ✗           ✓ TP=8       ✓ TP=8</span></span>
<span class="line"><span>405B INT4       ✗           ✗(202&gt;80)    ✓ TP=2      ✓           ✓</span></span></code></pre></div><p>&quot;单卡(紧)&quot;指权重塞下了但 KV 池余量很少,实际并发会很受限。</p><p>记忆要点:</p><ul><li><strong>7B 哪都装</strong>,主战场是端侧和小服务</li><li><strong>70B 是 H100 时代的甜点</strong>:FP8 单卡装下,2 卡 BF16 装下有富余</li><li><strong>405B 是必须 multi-GPU 的尺度</strong>,FP8 + 8 卡 H100 是 2024-2025 主流部署</li><li><strong>H200 的核心存在理由</strong>:把 70B BF16 单卡变成可能,把 405B INT4 也单/双卡化</li></ul><hr><h2 id="六、装下了之后-kv-还能塞多少-并发-×-上下文" tabindex="-1">六、装下了之后,KV 还能塞多少:并发 × 上下文 <a class="header-anchor" href="#六、装下了之后-kv-还能塞多少-并发-×-上下文" aria-label="Permalink to &quot;六、装下了之后,KV 还能塞多少:并发 × 上下文&quot;">​</a></h2><p>显存 = 权重 + KV,装下权重后剩下都是 KV 池。</p><p>以 70B FP8 在不同卡上算:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>单卡 H100 80GB:</span></span>
<span class="line"><span>  权重 70 GB + 工作空间 5 GB</span></span>
<span class="line"><span>  剩余给 KV ≈ 5 GB     ← 几乎没有,生产并发根本扛不住</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2 卡 H100 NVLink (TP=2):</span></span>
<span class="line"><span>  每张 35 GB 权重 + 5 GB workspace + 40 GB KV</span></span>
<span class="line"><span>  KV 总量 ≈ 80 GB,FP8 KV 每 token 163 KB</span></span>
<span class="line"><span>  能塞 ≈ 80 GB / 163 KB ≈ 514K tokens</span></span>
<span class="line"><span>  → 并发 32 × 16K context ≈ 512K       OK</span></span>
<span class="line"><span></span></span>
<span class="line"><span>单卡 H200 141GB:</span></span>
<span class="line"><span>  权重 70 GB + 5 GB workspace + 65 GB KV</span></span>
<span class="line"><span>  能塞 ≈ 65 GB / 163 KB ≈ 418K tokens</span></span>
<span class="line"><span>  → 并发 24 × 16K context              OK</span></span>
<span class="line"><span></span></span>
<span class="line"><span>单卡 H100 80GB,权重切到 INT4:</span></span>
<span class="line"><span>  权重 35 GB + 5 GB + 40 GB KV</span></span>
<span class="line"><span>  能塞 ≈ 257K tokens</span></span>
<span class="line"><span>  → 并发 16 × 16K context              OK,代价是精度 -1~2%</span></span>
<span class="line"><span></span></span>
<span class="line"><span>任意上配 + KV 量化(FP8 KV):每 token 减半到 82 KB</span></span>
<span class="line"><span>  上面所有方案的 KV 容量直接翻倍</span></span></code></pre></div><p><strong>KV 池容量是上下文长度和并发的硬墙</strong>——任何&quot;我们要支持 128K 上下文 / 1000 QPS&quot;的需求,先到这里来算。常见的回答:</p><ul><li>128K 上下文 + 32 并发 ≈ 4M tokens × 163 KB = 654 GB KV → 单副本必须 8 卡 H200 + KV 量化</li><li>1000 QPS + 平均 200 token / 秒输出 → 每副本至少 50-100 并发,看 TTFT 要求</li></ul><hr><h2 id="七、输出-tokens-s-与每千-token-成本" tabindex="-1">七、输出 tokens/s 与每千 token 成本 <a class="header-anchor" href="#七、输出-tokens-s-与每千-token-成本" aria-label="Permalink to &quot;七、输出 tokens/s 与每千 token 成本&quot;">​</a></h2><p>decode 阶段是 memory-bound:<strong>每 token 必须把所有权重从 HBM 读一遍</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>单 batch decode 时间 ≈ 模型大小 / HBM 带宽</span></span>
<span class="line"><span></span></span>
<span class="line"><span>H100 SXM5 HBM 带宽 ≈ 3.35 TB/s</span></span>
<span class="line"><span></span></span>
<span class="line"><span>70B FP8 权重 70 GB,decode 1 个 token 至少 70 / 3350 ≈ 21 ms</span></span>
<span class="line"><span>   → 单请求 max ≈ 48 tokens/s</span></span>
<span class="line"><span></span></span>
<span class="line"><span>加 batch:权重读一次摊给 batch 个请求</span></span>
<span class="line"><span>   batch=32 → 21 ms 出 32 个 token</span></span>
<span class="line"><span>   总吞吐 ≈ 32 / 0.021 ≈ 1524 tokens/s</span></span>
<span class="line"><span>   单请求仍然 ~48 tokens/s(每个用户感觉是这个速度)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>decode 本质:加 batch 提总吞吐,不加 batch 提单请求速度,</span></span>
<span class="line"><span>            但单请求不会因为 batch=1 而跑到 100 tokens/s,被 HBM 带宽锁死。</span></span></code></pre></div><p>实战吞吐(70B 模型,vLLM 默认配置,数字 ±30% 看 prompt 长度 / 调度):</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>            单卡   2 卡 TP   8 卡 TP   单请求 tokens/s   并发吞吐 tokens/s</span></span>
<span class="line"><span>H100 BF16   ✗      可行      好         ~25-40           ~1000-2000</span></span>
<span class="line"><span>H100 FP8    紧      好        极好       ~40-60           ~2000-4000</span></span>
<span class="line"><span>H100 INT4   好      好        好         ~50-70           ~1500-3000 (KV 限)</span></span>
<span class="line"><span>H200 FP8    好      极好      极好       ~50-70           ~3000-6000</span></span>
<span class="line"><span>B200 FP8    好      极好      极好       ~80-120          ~5000-10000</span></span></code></pre></div><h3 id="每千-token-成本-粗算" tabindex="-1">每千 token 成本(粗算) <a class="header-anchor" href="#每千-token-成本-粗算" aria-label="Permalink to &quot;每千 token 成本(粗算)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>H100 公开租金(2026 估):约 2 美元 / 卡时(规模采购可降到 1.5)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>70B FP8 + 2 张 H100,稳定吞吐 3000 tokens/s:</span></span>
<span class="line"><span>  每秒成本:2 × 2 / 3600 ≈ 0.00111 美元</span></span>
<span class="line"><span>  每 1k token:0.00111 / 3 ≈ 0.00037 美元</span></span>
<span class="line"><span>  → 1k token ≈ 0.04 美分(纯卡成本,不含运维 / 数据 / 模型授权)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>对比 OpenAI gpt-4o 价格(2026 公开价):</span></span>
<span class="line"><span>  $2.5 / 1M input  ≈ 0.25 美分 / 1k input</span></span>
<span class="line"><span>  $10  / 1M output ≈ 1.0  美分 / 1k output</span></span>
<span class="line"><span></span></span>
<span class="line"><span>自托管 70B 在饱和负载下纯卡成本是商用 API 的 1/5 ~ 1/20。</span></span>
<span class="line"><span>这是大量公司选自托管的核心理由。</span></span></code></pre></div><p>注意几个隐含假设:<strong>满负载 + 高 batch 利用率</strong>。如果你的服务每天就几百次调用,batch 起不来,自托管成本反而比 API 贵 10x:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>低负载场景(每天 1 万次调用,平均 1000 token):</span></span>
<span class="line"><span>  总 token = 10M / 天</span></span>
<span class="line"><span>  自托管:2 张 H100 × 24h × 2 美元 = 96 美元 / 天</span></span>
<span class="line"><span>  每千 token 成本 = 96 / 10000 ≈ 0.96 美分 / 1k    ← 比 OpenAI 还贵!</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  改 API:10M token × 0.6 美分(均价) ≈ 60 美元 / 天</span></span>
<span class="line"><span></span></span>
<span class="line"><span>自托管的盈亏平衡线大概在每天千万到亿 token 量级——低于这个直接用 API。</span></span></code></pre></div><p>29 篇展开成本细账。</p><hr><h2 id="八、chinchilla-scaling-一张表-训一个-x-b-大概多少卡天" tabindex="-1">八、Chinchilla scaling 一张表:训一个 X B 大概多少卡天 <a class="header-anchor" href="#八、chinchilla-scaling-一张表-训一个-x-b-大概多少卡天" aria-label="Permalink to &quot;八、Chinchilla scaling 一张表:训一个 X B 大概多少卡天&quot;">​</a></h2><p>H100 BF16,实际 sustained 800 TFLOPS / 卡(40% MFU),Chinchilla D=20×P:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>模型规模    最优 D       总 FLOPs       1024 卡天     1024 卡 × 多少天</span></span>
<span class="line"><span>7B         140B tokens  5.88e21        ~ 85          ~ 0.1 天 (一个白天)</span></span>
<span class="line"><span>13B        260B tokens  2.03e22        ~ 295         ~ 0.3 天</span></span>
<span class="line"><span>34B        680B tokens  1.39e23        ~ 2025        ~ 2 天</span></span>
<span class="line"><span>70B        1.4T tokens  5.88e23        ~ 8500        ~ 8 天 (理想 MFU)</span></span>
<span class="line"><span>                                                      ~ 28 天 (30% MFU 实际)</span></span>
<span class="line"><span>180B       3.6T tokens  3.89e24        ~ 56000       ~ 55 天 (1024 卡)</span></span>
<span class="line"><span>405B       8.1T tokens  1.97e25        ~ 285000      ~ 280 天 (1024 卡)</span></span>
<span class="line"><span>                                                      ~ 70 天 (4096 卡)</span></span></code></pre></div><p>(MoE 模型按&quot;激活参数 × D&quot;算,DeepSeek V3 670B-MoE / 37B 激活,实测约 2048 H800 × 2 个月)</p><p><strong>主流公司的实际预算</strong>:</p><ul><li>训一个 70B 主线模型:1024-2048 H100 × 1-2 个月,百万到千万美元</li><li>训一个 405B 主线模型:4096-8192 H100 × 2-4 个月,千万到亿美元级</li><li>训一个 1T+ MoE 模型:几千到上万张卡 × 几个月,亿美元级以上</li></ul><p>这是为什么 2024 年中国&quot;百模大战&quot;很快收敛到不超过 10 家——不是技术不会,是没人付得起算力账。</p><hr><h2 id="九、decode-阶段的-roofline-为什么-h100-算力大半浪费" tabindex="-1">九、Decode 阶段的 Roofline:为什么 H100 算力大半浪费 <a class="header-anchor" href="#九、decode-阶段的-roofline-为什么-h100-算力大半浪费" aria-label="Permalink to &quot;九、Decode 阶段的 Roofline:为什么 H100 算力大半浪费&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>H100 算力(BF16):1979 TFLOPS</span></span>
<span class="line"><span>H100 带宽(HBM): 3.35 TB/s</span></span>
<span class="line"><span>拐点 = 1979e12 / 3.35e12 ≈ 590 FLOP / Byte</span></span>
<span class="line"><span></span></span>
<span class="line"><span>70B BF16 一个 batch=1 decode:</span></span>
<span class="line"><span>  算量 ≈ 2 × 70e9 = 140 GFLOP</span></span>
<span class="line"><span>  数据搬运 ≈ 140 GB(权重一次)</span></span>
<span class="line"><span>  算术强度 ≈ 140e9 / 140e9 = 1 FLOP/Byte    ← 远低于拐点 590</span></span>
<span class="line"><span></span></span>
<span class="line"><span>实际利用算力 ≈ HBM 带宽 × 算术强度 = 3350 × 1 = 3.35 TFLOPS</span></span>
<span class="line"><span>              占 H100 标称 1979 TFLOPS 的 0.17% !</span></span></code></pre></div><p><strong>Decode 阶段绝大多数算力都在闲置</strong>——这是后续 09 / 11 / 24 篇所有&quot;加 batch / 投机解码 / multi-LoRA&quot;优化的根本驱动力:<strong>算力是免费的,带宽是贵的</strong>。任何能让&quot;读一次权重摊给更多 token&quot;的招都直接转化为吞吐。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>batch=1     算术强度 ≈ 1     利用算力 ≈ 3.35 TFLOPS    (0.17%)</span></span>
<span class="line"><span>batch=8     算术强度 ≈ 8     利用算力 ≈ 26.8 TFLOPS    (1.4%)</span></span>
<span class="line"><span>batch=32    算术强度 ≈ 32    利用算力 ≈ 107 TFLOPS     (5.4%)</span></span>
<span class="line"><span>batch=128   算术强度 ≈ 128   利用算力 ≈ 428 TFLOPS     (21.6%)</span></span>
<span class="line"><span>batch=590   算术强度 ≈ 590   利用算力 ≈ 1979 TFLOPS    (100%, 拐点)</span></span></code></pre></div><p>但 batch 不能无限拉,因为 batch 大 = KV Cache 大 = 显存撑爆;<strong>KV 池容量给 batch 设了硬上限</strong>。这就是为什么 PagedAttention(08 篇)能让 batch 几乎翻倍——它把 KV 浪费砍掉。</p><p>prefill 阶段算术强度可以推到几千(S × 2,S 是 prompt 长度),那时算力才是瓶颈,跟 decode 完全反过来。这一组观察(prefill compute-bound、decode memory-bound)是 03 篇的核心结论,也是 30 篇 Disaggregated Prefill-Decode 架构的物理依据。</p><hr><h2 id="十、看完这一篇-你应该能" tabindex="-1">十、看完这一篇,你应该能 <a class="header-anchor" href="#十、看完这一篇-你应该能" aria-label="Permalink to &quot;十、看完这一篇,你应该能&quot;">​</a></h2><ul><li>写出推理 FLOPs ≈ 2 × P × tokens 公式,用它估算一个推理请求的下限延迟</li><li>写出训练 FLOPs ≈ 6 × P × D 公式,算&quot;训一个 70B 大约多少卡天&quot;</li><li>算 70B / 405B 模型在 BF16 / FP8 / INT4 下的权重显存</li><li>算 KV Cache 每 token 大小,给一个上下文长度估总 KV 显存</li><li>看着模型规模和卡型,判断&quot;装得下吗、能塞多少并发 × 多少上下文&quot;</li><li>解释为什么 decode 阶段 H100 算力大半浪费(算术强度 ≈ 1,远低于拐点 590)</li><li>算自托管推理服务每千 token 成本,知道盈亏平衡量级在哪</li></ul><p>下一篇:<strong>06 推理引擎景观</strong> — vLLM / SGLang / TensorRT-LLM / TGI / llama.cpp / MLC-LLM / LMDeploy 七大主流引擎一张选型矩阵,知道什么场景该上哪个、为什么 vLLM 是默认选择。</p>`,86)])])}const k=n(l,[["render",t]]);export{u as __pageData,k as default};
