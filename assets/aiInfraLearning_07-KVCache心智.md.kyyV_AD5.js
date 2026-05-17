import{c as s,Q as n,j as t,m as p}from"./chunks/framework.CBiVa4O3.js";const g=JSON.parse('{"title":"KV Cache 心智:推理一切优化绕着它转的那个东西","description":"","frontmatter":{},"headers":[],"relativePath":"../aiInfraLearning/07-KVCache心智.md","filePath":"../aiInfraLearning/07-KVCache心智.md","lastUpdated":1778649484000}'),e={name:"../aiInfraLearning/07-KVCache心智.md"};function l(i,a,d,c,o,r){return n(),t("div",null,[...a[0]||(a[0]=[p(`<h1 id="kv-cache-心智-推理一切优化绕着它转的那个东西" tabindex="-1">KV Cache 心智:推理一切优化绕着它转的那个东西 <a class="header-anchor" href="#kv-cache-心智-推理一切优化绕着它转的那个东西" aria-label="Permalink to &quot;KV Cache 心智:推理一切优化绕着它转的那个东西&quot;">​</a></h1><p>03 篇划清了训练和推理的边界,提了一句 KV Cache 是推理&quot;权重之外唯一活的状态&quot;。这一篇把它单独拎出来——为什么自回归生成必须 cache、KV 显存怎么算、长上下文为什么把卡撑爆、GQA/MQA 是怎么把 KV 砍下来的,以及为什么后面 06-30 一半的篇章都在围着 KV 这一件事转。</p><blockquote><p>一句话先记住:<strong>KV Cache 把自回归生成的计算量从 O(n²) 压到 O(n),代价是显存占用从零变成 O(L × H × d × seq_len × batch);70B 模型在 128K 上下文下,单请求 KV 就 40GB 起步,KV 比权重还大;后面所有推理引擎的优化(PagedAttention、Continuous Batching、KV 量化、Prefix Cache、Disaggregated)都是在解 KV 这一件事的不同子问题</strong>。</p></blockquote><hr><h2 id="一、没有-kv-cache-的世界长什么样" tabindex="-1">一、没有 KV Cache 的世界长什么样 <a class="header-anchor" href="#一、没有-kv-cache-的世界长什么样" aria-label="Permalink to &quot;一、没有 KV Cache 的世界长什么样&quot;">​</a></h2><h3 id="_1-1-为什么自回归必须-cache" tabindex="-1">1.1 为什么自回归必须 cache <a class="header-anchor" href="#_1-1-为什么自回归必须-cache" aria-label="Permalink to &quot;1.1 为什么自回归必须 cache&quot;">​</a></h3><p>LLM 推理的 decode 阶段每一步生成 1 个 token,本质上是这样:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>输入序列: [t1, t2, t3, t4]  → 目标:生成 t5</span></span>
<span class="line"><span></span></span>
<span class="line"><span>不带 cache 的朴素做法:</span></span>
<span class="line"><span>  step N 要生成第 N+1 个 token,要算 attention:</span></span>
<span class="line"><span>    Q_N+1 = X_N+1 · W_Q          (新 token 的 Q)</span></span>
<span class="line"><span>    Attention(Q_N+1, K_1..N+1, V_1..N+1)</span></span>
<span class="line"><span>                ↑</span></span>
<span class="line"><span>                每次都要把 K_1, K_2, ..., K_N 重新算一遍</span></span>
<span class="line"><span>                因为 K_i = X_i · W_K, V_i = X_i · W_V</span></span>
<span class="line"><span>                X_i 没变、W_K W_V 没变,但每步还在重算</span></span></code></pre></div><p>这就是 03 篇点过的&quot;重复计算&quot;问题。摊到整个生成过程:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>朴素生成 N 个 token 总计算量:</span></span>
<span class="line"><span>   step 1:  算 1 个 token 的 K, V        → 1 次投影</span></span>
<span class="line"><span>   step 2:  算 2 个 token 的 K, V        → 2 次投影(重算 1 个)</span></span>
<span class="line"><span>   step 3:  算 3 个 token 的 K, V        → 3 次投影(重算 2 个)</span></span>
<span class="line"><span>   ...</span></span>
<span class="line"><span>   step N:  算 N 个 token 的 K, V        → N 次投影</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   总投影次数 = 1+2+3+...+N = O(N²)</span></span>
<span class="line"><span>   每个 attention 算 score 也是 O(N²)</span></span>
<span class="line"><span>   合起来 decode 阶段是 O(N²) 复杂度</span></span></code></pre></div><p>短文本看不出来,但生成 2000 个 token 的代码:朴素做法 ≈ 200 万次重复投影,带 cache ≈ 2000 次。<strong>两个数量级差距</strong>。</p><h3 id="_1-2-一张图-有-cache-vs-无-cache-的-attention" tabindex="-1">1.2 一张图:有 cache vs 无 cache 的 attention <a class="header-anchor" href="#_1-2-一张图-有-cache-vs-无-cache-的-attention" aria-label="Permalink to &quot;1.2 一张图:有 cache vs 无 cache 的 attention&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>无 KV Cache:每步要重算前面所有 token 的 K, V</span></span>
<span class="line"><span>─────────────────────────────────────────────────────</span></span>
<span class="line"><span>step 1   X1 ─→ K1,V1   ┐                      Q1·K1</span></span>
<span class="line"><span>                       ├ attention(Q1, K1, V1)</span></span>
<span class="line"><span>                       └</span></span>
<span class="line"><span></span></span>
<span class="line"><span>step 2   X1 ─→ K1,V1   ┐</span></span>
<span class="line"><span>         X2 ─→ K2,V2   ├ attention(Q2, K1..2, V1..2)</span></span>
<span class="line"><span>                       │  ↑ 又算了 K1, V1(浪费!)</span></span>
<span class="line"><span>                       └</span></span>
<span class="line"><span></span></span>
<span class="line"><span>step 3   X1 ─→ K1,V1   ┐</span></span>
<span class="line"><span>         X2 ─→ K2,V2   ├ attention(Q3, K1..3, V1..3)</span></span>
<span class="line"><span>         X3 ─→ K3,V3   │  ↑ K1, V1, K2, V2 全重算一遍</span></span>
<span class="line"><span>                       └</span></span>
<span class="line"><span></span></span>
<span class="line"><span>有 KV Cache:K, V 算一次进缓存,新 token 只算自己那份</span></span>
<span class="line"><span>─────────────────────────────────────────────────────</span></span>
<span class="line"><span>step 1   X1 ─→ K1,V1 ─→ KV_CACHE: [K1,V1]</span></span>
<span class="line"><span>                          attention(Q1, KV_CACHE)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>step 2   X2 ─→ K2,V2 ─→ KV_CACHE: [K1,V1, K2,V2]</span></span>
<span class="line"><span>                          attention(Q2, KV_CACHE)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>step 3   X3 ─→ K3,V3 ─→ KV_CACHE: [K1,V1, K2,V2, K3,V3]</span></span>
<span class="line"><span>                          attention(Q3, KV_CACHE)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>每步只算 1 个新 K, 1 个新 V,然后追加进 cache</span></span></code></pre></div><p><strong>用显存换算力</strong>——这五个字概括了 KV Cache 的全部本质。GPU 算力和显存都是稀缺资源,在 LLM 推理这个特定的工作负载下,<strong>显存不够花,但拿显存换算力是净赚</strong>(因为 decode 是 memory-bound,算力本来就闲着,详见 02 篇)。</p><hr><h2 id="二、kv-cache-显存公式-一个必须默写的等式" tabindex="-1">二、KV Cache 显存公式:一个必须默写的等式 <a class="header-anchor" href="#二、kv-cache-显存公式-一个必须默写的等式" aria-label="Permalink to &quot;二、KV Cache 显存公式:一个必须默写的等式&quot;">​</a></h2><h3 id="_2-1-公式" tabindex="-1">2.1 公式 <a class="header-anchor" href="#_2-1-公式" aria-label="Permalink to &quot;2.1 公式&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>KV Cache 大小 (字节) = 2 × L × H_kv × d_head × seq_len × batch × bytes_per_element</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  ┬   ┬     ┬       ┬        ┬          ┬          ┬</span></span>
<span class="line"><span>  K+V Layer KV head head_dim 序列长度    并发请求    精度字节</span></span>
<span class="line"><span>                                                  (BF16=2, FP8=1, INT4=0.5)</span></span></code></pre></div><p><strong>变量逐项的工程含义</strong>:</p><table tabindex="0"><thead><tr><th>变量</th><th>含义</th><th>你能调的</th></tr></thead><tbody><tr><td>2</td><td>K 和 V 各一份</td><td>不能</td></tr><tr><td>L</td><td>Transformer 层数</td><td>不能(模型架构定死)</td></tr><tr><td>H_kv</td><td>KV 头数(GQA/MQA 已砍过)</td><td>不能(模型架构定死)</td></tr><tr><td>d_head</td><td>每个头的维度</td><td>不能(模型架构定死)</td></tr><tr><td>seq_len</td><td>当前序列长度(prompt + 已生成)</td><td>应用层(限 max_tokens)</td></tr><tr><td>batch</td><td>并发请求数</td><td>调度层(continuous batching,09 篇)</td></tr><tr><td>bytes_per_element</td><td>精度</td><td>KV 量化(23 篇)</td></tr></tbody></table><p><strong>模型架构这一行是固定的</strong>——挑模型时 KV 单价就锁死了。剩下三个旋钮:<strong>截 seq_len、限 batch、降精度</strong>。所有 KV 优化最终都落在这三件事上。</p><h3 id="_2-2-几个常见模型的-每-token-kv-单价" tabindex="-1">2.2 几个常见模型的&quot;每 token KV 单价&quot; <a class="header-anchor" href="#_2-2-几个常见模型的-每-token-kv-单价" aria-label="Permalink to &quot;2.2 几个常见模型的&quot;每 token KV 单价&quot;&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Llama-3-8B:</span></span>
<span class="line"><span>  L=32, H_kv=8 (GQA), d_head=128</span></span>
<span class="line"><span>  → 每 token 每层 KV (BF16) = 2 × 8 × 128 × 2 = 4096 bytes</span></span>
<span class="line"><span>  → 每 token 全部层 KV = 4096 × 32 = 128 KB</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Llama-3-70B:</span></span>
<span class="line"><span>  L=80, H_kv=8 (GQA), d_head=128</span></span>
<span class="line"><span>  → 每 token 每层 KV (BF16) = 2 × 8 × 128 × 2 = 4096 bytes</span></span>
<span class="line"><span>  → 每 token 全部层 KV = 4096 × 80 = 320 KB</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Llama-3-405B:</span></span>
<span class="line"><span>  L=126, H_kv=8 (GQA), d_head=128</span></span>
<span class="line"><span>  → 每 token 每层 KV (BF16) = 2 × 8 × 128 × 2 = 4096 bytes</span></span>
<span class="line"><span>  → 每 token 全部层 KV = 4096 × 126 = 504 KB</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Mistral-7B (GQA):</span></span>
<span class="line"><span>  L=32, H_kv=8, d_head=128 → 同 Llama3-8B,128 KB / token</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Qwen2-72B:</span></span>
<span class="line"><span>  L=80, H_kv=8 (GQA), d_head=128 → ≈ 320 KB / token</span></span></code></pre></div><p><strong>记一个粗略量级</strong>:中等规模模型 BF16 大约 <strong>每 token 100-500 KB</strong>。</p><h3 id="_2-3-一张大表-7b-70b-在不同上下文下的-kv-占用" tabindex="-1">2.3 一张大表:7B / 70B 在不同上下文下的 KV 占用 <a class="header-anchor" href="#_2-3-一张大表-7b-70b-在不同上下文下的-kv-占用" aria-label="Permalink to &quot;2.3 一张大表:7B / 70B 在不同上下文下的 KV 占用&quot;">​</a></h3><p>单个请求(batch=1)的 KV:</p><table tabindex="0"><thead><tr><th>模型</th><th>上下文</th><th>BF16 (320KB/tok)</th><th>FP8 (160KB/tok)</th><th>INT4 (80KB/tok)</th></tr></thead><tbody><tr><td>7B</td><td>4K</td><td>0.5 GB</td><td>0.25 GB</td><td>0.13 GB</td></tr><tr><td>7B</td><td>32K</td><td>4 GB</td><td>2 GB</td><td>1 GB</td></tr><tr><td>7B</td><td>128K</td><td>16 GB</td><td>8 GB</td><td>4 GB</td></tr><tr><td>70B</td><td>4K</td><td>1.3 GB</td><td>0.6 GB</td><td>0.3 GB</td></tr><tr><td>70B</td><td>32K</td><td>10 GB</td><td>5 GB</td><td>2.5 GB</td></tr><tr><td>70B</td><td>128K</td><td><strong>40 GB</strong></td><td><strong>20 GB</strong></td><td><strong>10 GB</strong></td></tr><tr><td>405B</td><td>32K</td><td>16 GB</td><td>8 GB</td><td>4 GB</td></tr><tr><td>405B</td><td>128K</td><td>64 GB</td><td>32 GB</td><td>16 GB</td></tr></tbody></table><p><strong>关键观察</strong>:</p><ol><li><strong>70B + 128K 单请求 KV = 40GB</strong>——这一个请求就吃掉半张 H100 的 80GB</li><li><strong>batch 一上,KV 线性涨</strong>——70B + 32K + batch=8 = 80GB,等于一张 H100 的全部显存</li><li><strong>FP8 砍一半,INT4 砍四分之三</strong>——23 篇专门讲 KV 量化怎么省</li></ol><h3 id="_2-4-batch-×-context-双增长是非线性灾难" tabindex="-1">2.4 batch × context 双增长是非线性灾难 <a class="header-anchor" href="#_2-4-batch-×-context-双增长是非线性灾难" aria-label="Permalink to &quot;2.4 batch × context 双增长是非线性灾难&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                70B BF16 KV 显存(单位 GB)</span></span>
<span class="line"><span>                </span></span>
<span class="line"><span>        context →</span></span>
<span class="line"><span>batch ↓     4K     16K    32K    64K    128K</span></span>
<span class="line"><span>  1        1.3    5.0    10     20     40</span></span>
<span class="line"><span>  4        5      20     40     80    160</span></span>
<span class="line"><span>  8       10     40      80    160    320</span></span>
<span class="line"><span> 16       20     80     160    320    640</span></span>
<span class="line"><span> 32       40    160     320    640   1280</span></span>
<span class="line"><span> 64       80    320     640   1280   2560</span></span>
<span class="line"><span>                                    </span></span>
<span class="line"><span>                ← 一张 H100 80GB 的边界(权重还没算)</span></span></code></pre></div><p>红线很显然:<strong>长 context + 高并发</strong> = 卡撑爆。这就是为什么生产服务在长上下文场景下,batch 上不去——不是算力不够,<strong>是 KV 装不下</strong>。</p><hr><h2 id="三、显存怎么分-一张-70b-推理服务的饼图" tabindex="-1">三、显存怎么分:一张 70B 推理服务的饼图 <a class="header-anchor" href="#三、显存怎么分-一张-70b-推理服务的饼图" aria-label="Permalink to &quot;三、显存怎么分:一张 70B 推理服务的饼图&quot;">​</a></h2><h3 id="_3-1-70b-在-h100-8-卡-640gb-上-不同-context-的显存构成" tabindex="-1">3.1 70B 在 H100 8 卡 (640GB) 上,不同 context 的显存构成 <a class="header-anchor" href="#_3-1-70b-在-h100-8-卡-640gb-上-不同-context-的显存构成" aria-label="Permalink to &quot;3.1 70B 在 H100 8 卡 (640GB) 上,不同 context 的显存构成&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>4K context, batch=32:</span></span>
<span class="line"><span>┌────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│ 权重 (BF16, 8 卡 TP 切片): 140 GB ████████████ 22%      │</span></span>
<span class="line"><span>│ KV (32 × 4K × 320KB): 42 GB ███ 7%                     │</span></span>
<span class="line"><span>│ 激活 + workspace: 20 GB █ 3%                            │</span></span>
<span class="line"><span>│ 空闲(可加 batch): 438 GB ███████████████████████ 68%   │</span></span>
<span class="line"><span>└────────────────────────────────────────────────────────┘</span></span>
<span class="line"><span>                                ↑ KV 才占小头,批量还能拉</span></span>
<span class="line"><span></span></span>
<span class="line"><span>32K context, batch=16:</span></span>
<span class="line"><span>┌────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│ 权重: 140 GB ████████████ 22%                           │</span></span>
<span class="line"><span>│ KV (16 × 32K × 320KB): 168 GB ███████████████ 26%      │</span></span>
<span class="line"><span>│ 激活 + workspace: 20 GB █ 3%                            │</span></span>
<span class="line"><span>│ 空闲: 312 GB ██████████████████ 49%                     │</span></span>
<span class="line"><span>└────────────────────────────────────────────────────────┘</span></span>
<span class="line"><span>                                ↑ KV 已经超过权重了</span></span>
<span class="line"><span></span></span>
<span class="line"><span>128K context, batch=8:</span></span>
<span class="line"><span>┌────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│ 权重: 140 GB ████████ 22%                                │</span></span>
<span class="line"><span>│ KV (8 × 128K × 320KB): 336 GB ████████████████████ 53% │</span></span>
<span class="line"><span>│ 激活 + workspace: 30 GB █ 5%                            │</span></span>
<span class="line"><span>│ 空闲: 134 GB ███████ 21%                                │</span></span>
<span class="line"><span>└────────────────────────────────────────────────────────┘</span></span>
<span class="line"><span>                                ↑ KV 占主导,扩 batch 风险高</span></span>
<span class="line"><span></span></span>
<span class="line"><span>128K context, batch=16(冒进配置):</span></span>
<span class="line"><span>┌────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│ 权重: 140 GB ████████ 22%                                │</span></span>
<span class="line"><span>│ KV (16 × 128K × 320KB): 672 GB ████████████████████ 75%│</span></span>
<span class="line"><span>│                                  ← 已经超过总显存 640GB │</span></span>
<span class="line"><span>│ ── OOM,服务起不来 / 频繁抢占 / 抖动 ──                  │</span></span>
<span class="line"><span>└────────────────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>长上下文场景下 KV 占比能飙到 70%+</strong>——这就是为什么&quot;长 context&quot;在工程上是另一类问题:不是简单调一个 max_tokens,<strong>是整个显存预算结构都得重排</strong>。</p><h3 id="_3-2-推理服务运维第一指标-kv-占比" tabindex="-1">3.2 推理服务运维第一指标:KV 占比 <a class="header-anchor" href="#_3-2-推理服务运维第一指标-kv-占比" aria-label="Permalink to &quot;3.2 推理服务运维第一指标:KV 占比&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># vLLM 在线指标(Prometheus 或 logger 都能拿到)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">vllm:gpu_cache_usage_perc</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">       # KV 池使用率,应监控 P95</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">vllm:num_running</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                # 当前在跑的请求数</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">vllm:num_waiting</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                # 排队中(KV 不够装下)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">vllm:num_preempted</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">              # 抢占次数(KV 紧张被踢回去重算/换出)</span></span></code></pre></div><p>健康基线:</p><table tabindex="0"><thead><tr><th>指标</th><th>健康</th><th>警戒</th><th>出事</th></tr></thead><tbody><tr><td>KV 池使用率 (P95)</td><td>60-80%</td><td>85-95%</td><td>&gt; 95%</td></tr><tr><td>num_waiting</td><td>&lt; 1</td><td>1-5</td><td>&gt; 10</td></tr><tr><td>num_preempted/min</td><td>0-1</td><td>5-10</td><td>&gt; 30</td></tr><tr><td>TPOT P99</td><td>平稳</td><td>偶尔尖刺</td><td>周期性飙升</td></tr></tbody></table><p><strong>KV 占比是推理服务的&quot;CPU load&quot;</strong>——它一高,后面所有指标(TTFT、TPOT、QPS)开始抖。运维感知到的&quot;模型变慢了&quot;,八成不是模型变慢,是 KV 池满了开始抢占。</p><hr><h2 id="四、gqa-mqa-从架构层面把-kv-砍下来" tabindex="-1">四、GQA / MQA:从架构层面把 KV 砍下来 <a class="header-anchor" href="#四、gqa-mqa-从架构层面把-kv-砍下来" aria-label="Permalink to &quot;四、GQA / MQA:从架构层面把 KV 砍下来&quot;">​</a></h2><h3 id="_4-1-mha-gqa-mqa-的关系" tabindex="-1">4.1 MHA / GQA / MQA 的关系 <a class="header-anchor" href="#_4-1-mha-gqa-mqa-的关系" aria-label="Permalink to &quot;4.1 MHA / GQA / MQA 的关系&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>原始 MHA (Multi-Head Attention):</span></span>
<span class="line"><span>  Q 头数 = K 头数 = V 头数 = H</span></span>
<span class="line"><span>  每个 Q 头有自己独立的 K, V 头</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  Llama-1-65B:  H = 64,  KV 头数 = 64,  KV 单价 = 32 KB/token/层</span></span>
<span class="line"><span></span></span>
<span class="line"><span>GQA (Grouped-Query Attention):</span></span>
<span class="line"><span>  Q 头数 = H,  K 头数 = V 头数 = H_kv  (H_kv &lt; H)</span></span>
<span class="line"><span>  G = H / H_kv 个 Q 头共享一组 K, V</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  Llama-3-70B:  H = 64,  H_kv = 8,  G = 8</span></span>
<span class="line"><span>                KV 单价 = 4 KB/token/层  (砍到原来 1/8)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>MQA (Multi-Query Attention):</span></span>
<span class="line"><span>  H_kv = 1,  所有 Q 头共享同一组 K, V</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  PaLM, Falcon-7B 早期:KV 单价 = 0.5 KB/token/层  (砍到原来 1/64)</span></span></code></pre></div><h3 id="_4-2-一张图" tabindex="-1">4.2 一张图 <a class="header-anchor" href="#_4-2-一张图" aria-label="Permalink to &quot;4.2 一张图&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>MHA  (64 Q 头 + 64 KV 头):</span></span>
<span class="line"><span>  Q  Q  Q  Q  Q  Q  Q  Q  ... Q  Q  Q  Q  (64 个)</span></span>
<span class="line"><span>  │  │  │  │  │  │  │  │      │  │  │  │</span></span>
<span class="line"><span>  K  K  K  K  K  K  K  K  ... K  K  K  K  (64 个)</span></span>
<span class="line"><span>  V  V  V  V  V  V  V  V  ... V  V  V  V  (64 个)</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  KV 头数 = Q 头数,KV 显存最大</span></span>
<span class="line"><span></span></span>
<span class="line"><span>GQA (64 Q 头 + 8 KV 头,G=8):</span></span>
<span class="line"><span>  Q Q Q Q Q Q Q Q  Q Q Q Q Q Q Q Q  ... (64 个,8 个为一组)</span></span>
<span class="line"><span>   \\│ │ │ │ │ │ /  \\│ │ │ │ │ │ /</span></span>
<span class="line"><span>    └─┴─K─┴─┴─┘    └─┴─K─┴─┴─┘    ... (8 个 K)</span></span>
<span class="line"><span>    └─┴─V─┴─┴─┘    └─┴─V─┴─┴─┘    ... (8 个 V)</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  每 8 个 Q 头共享 1 个 K, V 头 → KV 砍到 1/8</span></span>
<span class="line"><span></span></span>
<span class="line"><span>MQA (64 Q 头 + 1 KV 头):</span></span>
<span class="line"><span>  Q Q Q Q Q Q Q Q Q Q Q Q Q Q Q Q ... (64 个)</span></span>
<span class="line"><span>   \\│ │ │ │ │ │ │ │ │ │ │ │ │ │ /</span></span>
<span class="line"><span>    ├──────────K────────────┤        (只有 1 个 K)</span></span>
<span class="line"><span>    ├──────────V────────────┤        (只有 1 个 V)</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  所有 Q 头共享同一组 K, V → KV 砍到 1/64</span></span></code></pre></div><h3 id="_4-3-为什么主流停在-gqa-8-头-kv" tabindex="-1">4.3 为什么主流停在 GQA(8 头 KV) <a class="header-anchor" href="#_4-3-为什么主流停在-gqa-8-头-kv" aria-label="Permalink to &quot;4.3 为什么主流停在 GQA(8 头 KV)&quot;">​</a></h3><table tabindex="0"><thead><tr><th>方案</th><th>KV 显存</th><th>效果</th><th>谁在用</th></tr></thead><tbody><tr><td>MHA</td><td>100%</td><td>基线</td><td>Llama-1, GPT-3 老模型</td></tr><tr><td>GQA G=8</td><td>12.5%</td><td>几乎无损</td><td><strong>Llama-3, Qwen2, Mistral, DeepSeek</strong></td></tr><tr><td>GQA G=4</td><td>25%</td><td>几乎无损</td><td>部分中等模型</td></tr><tr><td>MQA</td><td>1.5%</td><td>推理质量明显掉</td><td>PaLM, Falcon 早期</td></tr></tbody></table><p>GQA G=8 是<strong>经验最优</strong>——KV 砍到 1/8,模型效果几乎不掉(测了 MMLU、HumanEval、长 context 检索都基本持平)。MQA 太极端,长 context 检索能力明显退化。<strong>2024 之后新出的开源大模型几乎全是 GQA H_kv=8</strong>,这是个工程社区收敛掉的设计选择。</p><h3 id="_4-4-别忘了-mla-deepseek-的另一条路" tabindex="-1">4.4 别忘了 MLA(DeepSeek 的另一条路) <a class="header-anchor" href="#_4-4-别忘了-mla-deepseek-的另一条路" aria-label="Permalink to &quot;4.4 别忘了 MLA(DeepSeek 的另一条路)&quot;">​</a></h3><p>DeepSeek-V2/V3 用的是 <strong>MLA(Multi-head Latent Attention)</strong>:把 K, V 压缩到一个低秩 latent 向量,推理时再展开。它的 KV 单价比 GQA 还小(典型小一倍),但 attention kernel 要专门写——好在 vLLM / SGLang 都已经支持。这条路 2026 年仍在演进,不是主流默认,但在长 context 场景越来越常见。</p><hr><h2 id="五、所有推理优化都围着-kv-转" tabindex="-1">五、所有推理优化都围着 KV 转 <a class="header-anchor" href="#五、所有推理优化都围着-kv-转" aria-label="Permalink to &quot;五、所有推理优化都围着 KV 转&quot;">​</a></h2><p>把 06-30 篇里和 KV 直接相关的优化全列出来:</p><table tabindex="0"><thead><tr><th>优化</th><th>解决 KV 的什么子问题</th><th>出自</th></tr></thead><tbody><tr><td><strong>PagedAttention</strong></td><td>KV 在显存里碎片化,预留浪费</td><td>08</td></tr><tr><td><strong>Prefix Caching</strong></td><td>多请求共享前缀 KV 复用</td><td>08(尾)/ 10</td></tr><tr><td><strong>RadixAttention</strong></td><td>任意公共前缀以基数树形式共享 KV</td><td>10</td></tr><tr><td><strong>Continuous Batching</strong></td><td>KV 池里的活跃请求滚动进出,提利用率</td><td>09</td></tr><tr><td><strong>Chunked Prefill</strong></td><td>长 prompt 切片不阻塞 decode 的 KV 流转</td><td>09</td></tr><tr><td><strong>投机解码</strong></td><td>一次 forward 多产 token,摊薄 KV 搬运</td><td>11</td></tr><tr><td><strong>KV 量化(FP8/INT4)</strong></td><td>KV 字节单价砍半到 1/4</td><td>23</td></tr><tr><td><strong>KV CPU 卸载</strong></td><td>KV 池满时部分换出到 host RAM</td><td>09 / 23</td></tr><tr><td><strong>KV 重计算</strong></td><td>抢占时丢掉 KV,需要时再重 prefill</td><td>09</td></tr><tr><td><strong>Disaggregated Prefill-Decode</strong></td><td>Prefill 和 decode 用不同卡池,KV 跨节点传</td><td>30</td></tr></tbody></table><p><strong>没有一个推理优化和 KV 无关</strong>——你说&quot;vLLM 比 transformers.generate 快 10 倍&quot;,拆下来 10x 里每一倍都对应 KV 的某个子问题被解了。</p><p><strong>这就是把 KV 单独写一篇的理由</strong>——把 KV 心智建立起来,后面 08-30 的每一个引擎、每一个优化、每一个调参,你都能用一句话说清&quot;它解决了 KV 的哪部分&quot;。</p><hr><h2 id="六、工程现场-一个-70b-服务的-kv-调优清单" tabindex="-1">六、工程现场:一个 70B 服务的 KV 调优清单 <a class="header-anchor" href="#六、工程现场-一个-70b-服务的-kv-调优清单" aria-label="Permalink to &quot;六、工程现场:一个 70B 服务的 KV 调优清单&quot;">​</a></h2><h3 id="_6-1-容量预算" tabindex="-1">6.1 容量预算 <a class="header-anchor" href="#_6-1-容量预算" aria-label="Permalink to &quot;6.1 容量预算&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>H100 80GB 单卡 → 跑 70B 推理,要 TP=2 或 TP=4</span></span>
<span class="line"><span>TP=2 (两卡):</span></span>
<span class="line"><span>  权重切片 ≈ 70 GB / 卡(BF16 砍半,但加上 framework overhead 大约这个数)</span></span>
<span class="line"><span>  剩 80 - 70 = 10 GB / 卡 给 KV</span></span>
<span class="line"><span>  全卡 KV 池 = 20 GB</span></span>
<span class="line"><span>  / 320 KB/token = 65000 tokens 容量</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  如果配 max_tokens=2K, system prompt = 500:</span></span>
<span class="line"><span>    每请求平均占 2500 token KV</span></span>
<span class="line"><span>    并发上限 ≈ 65000 / 2500 = 26 个请求</span></span>
<span class="line"><span>    </span></span>
<span class="line"><span>  如果 context 拉到 32K:</span></span>
<span class="line"><span>    单请求就 10 GB,并发 = 2,基本没法服务</span></span>
<span class="line"><span>    → 必须开 KV FP8(23 篇)→ 等效翻倍 → 并发 4</span></span>
<span class="line"><span>    → 或者上 TP=4 减少每卡权重压力</span></span></code></pre></div><h3 id="_6-2-配置三件套-vllm-视角-08-09-篇展开细节" tabindex="-1">6.2 配置三件套(vLLM 视角,08/09 篇展开细节) <a class="header-anchor" href="#_6-2-配置三件套-vllm-视角-08-09-篇展开细节" aria-label="Permalink to &quot;6.2 配置三件套(vLLM 视角,08/09 篇展开细节)&quot;">​</a></h3><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 启动 vLLM 70B + 32K context 服务</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">--model            meta-llama/Meta-Llama-3.1-70B-Instruct</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">--tensor-parallel-size  4</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">              # 把权重摊薄,腾给 KV</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">--max-model-len    32768</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">               # 限死 context 上限</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">--gpu-memory-utilization  0.92</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">         # KV 池能用多少显存(留 8% 给 framework)</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">--kv-cache-dtype   fp8</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                 # KV 用 FP8,等效 KV 池翻倍</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">--max-num-seqs     64</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                  # 并发上限,根据上面预算调</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">--enable-prefix-caching</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                # 系统提示能复用就开</span></span></code></pre></div><h3 id="_6-3-监控告警" tabindex="-1">6.3 监控告警 <a class="header-anchor" href="#_6-3-监控告警" aria-label="Permalink to &quot;6.3 监控告警&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>告警规则:</span></span>
<span class="line"><span>  - vllm:gpu_cache_usage_perc &gt; 0.92, 持续 5 分钟 → 警告(KV 池吃紧)</span></span>
<span class="line"><span>  - vllm:num_preempted_total 增速 &gt; 10/min        → 警告(频繁抢占)</span></span>
<span class="line"><span>  - vllm:num_waiting &gt; 5, 持续 1 分钟              → 警告(请求排队)</span></span>
<span class="line"><span>  - vllm:time_per_output_token P99 &gt; 100ms        → 警告(decode 慢)</span></span>
<span class="line"><span>  - 任何 OOM                                      → 紧急(降 max-num-seqs)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>排查顺序(KV 满了怎么办):</span></span>
<span class="line"><span>  1. 先看 max-num-seqs 是不是开太大</span></span>
<span class="line"><span>  2. 看请求实际 context 分布,长尾 99% 是不是远超中位数</span></span>
<span class="line"><span>  3. 看是否能开 FP8 KV(23 篇),立省 50%</span></span>
<span class="line"><span>  4. 看是否能开 chunked prefill 让长请求不阻塞(09 篇)</span></span>
<span class="line"><span>  5. 看是否要扩 TP / 加卡</span></span></code></pre></div><p><strong>KV 容量不够有 5 个解,从轻到重</strong>:限 max_tokens → 量化 KV → 减并发 → 分阶段(prefill/decode 分卡,30 篇)→ 扩硬件。</p><hr><h2 id="七、几个常见误区" tabindex="-1">七、几个常见误区 <a class="header-anchor" href="#七、几个常见误区" aria-label="Permalink to &quot;七、几个常见误区&quot;">​</a></h2><h3 id="_7-1-把-max-model-len-调到-1m-反正用不到" tabindex="-1">7.1 &quot;把 max_model_len 调到 1M 反正用不到&quot; <a class="header-anchor" href="#_7-1-把-max-model-len-调到-1m-反正用不到" aria-label="Permalink to &quot;7.1 &quot;把 max_model_len 调到 1M 反正用不到&quot;&quot;">​</a></h3><p>错。vLLM 启动时会按 max_model_len 预留 KV 池上界——把它从 32K 改到 1M,<strong>池的容量预算换算逻辑会变</strong>,容易让 batch 跑得更不稳。<strong>只在确实有 1M 用例时才开</strong>,否则限死合理上限。</p><h3 id="_7-2-gpu-利用率-100-说明性能拉满" tabindex="-1">7.2 &quot;GPU 利用率 100% 说明性能拉满&quot; <a class="header-anchor" href="#_7-2-gpu-利用率-100-说明性能拉满" aria-label="Permalink to &quot;7.2 &quot;GPU 利用率 100% 说明性能拉满&quot;&quot;">​</a></h3><p>错。nvidia-smi 看到的 GPU-Util 只表示&quot;SM 是否在忙&quot;,对 LLM decode 来说,<strong>整个 SM 大部分时间在等 HBM 搬权重和 KV</strong>——SM 在等也算&quot;忙&quot;。真要看的是 HBM 带宽利用率,以及 vLLM 的 KV 池利用率。</p><h3 id="_7-3-kv-cache-是-vllm-发明的" tabindex="-1">7.3 &quot;KV Cache 是 vLLM 发明的&quot; <a class="header-anchor" href="#_7-3-kv-cache-是-vllm-发明的" aria-label="Permalink to &quot;7.3 &quot;KV Cache 是 vLLM 发明的&quot;&quot;">​</a></h3><p>错。KV Cache 是 Transformer decoder 自回归生成的固有需求,2018 年起所有推理实现都有。vLLM 的贡献是 <strong>PagedAttention</strong>(08 篇)——一种 KV 在显存里的<strong>布局方式</strong>,不是 KV Cache 本身。</p><h3 id="_7-4-gqa-会掉效果所以别用" tabindex="-1">7.4 &quot;GQA 会掉效果所以别用&quot; <a class="header-anchor" href="#_7-4-gqa-会掉效果所以别用" aria-label="Permalink to &quot;7.4 &quot;GQA 会掉效果所以别用&quot;&quot;">​</a></h3><p>错。GQA H_kv=8 在主流 benchmark 上和 MHA 几乎无差。<strong>Llama-3 / Qwen2 / Mistral / DeepSeek 全部用 GQA</strong>,这是社区已经收敛掉的事实,<strong>MHA 70B 推理的 KV 是 GQA 的 8 倍,你扛不住这个代价</strong>。</p><h3 id="_7-5-prefix-cache-一开就快" tabindex="-1">7.5 &quot;Prefix Cache 一开就快&quot; <a class="header-anchor" href="#_7-5-prefix-cache-一开就快" aria-label="Permalink to &quot;7.5 &quot;Prefix Cache 一开就快&quot;&quot;">​</a></h3><p>不一定。Prefix Cache 的命中率取决于请求形态——大量请求挂同一个长 system prompt 就命中率高,每个请求 prompt 都不一样命中率就接近 0,纯算管理开销。详见 08 篇尾部 / 10 篇 SGLang。</p><hr><h2 id="八、看完这一篇-你应该能" tabindex="-1">八、看完这一篇,你应该能 <a class="header-anchor" href="#八、看完这一篇-你应该能" aria-label="Permalink to &quot;八、看完这一篇,你应该能&quot;">​</a></h2><ul><li>用一行公式默写 KV Cache 大小:<code>2 × L × H_kv × d_head × seq_len × batch × bytes</code></li><li>心算:Llama-3-70B BF16,128K context,单请求 KV ≈ 40 GB</li><li>解释为什么自回归 decode 必须 cache(O(N) vs O(N²))</li><li>解释 GQA H_kv=8 为什么是当前社区最优(KV 砍 8x,效果几乎无损)</li><li>在 nvidia-smi + vLLM metrics 里指出 KV 池使用率、抢占次数、排队数三个关键指标</li><li>给一个长上下文 OOM 故障,按&quot;限长度 → 量化 → 减并发 → 分卡&quot;四步排查</li><li>把 PagedAttention / Continuous Batching / KV 量化 / Disaggregated 这些后续优化全对应到 KV 公式的具体维度</li></ul><p>下一篇:<strong>08 PagedAttention</strong> — 朴素实现把 KV 当连续显存预留 max_seq_len,浪费高达 80%;vLLM 借鉴操作系统虚拟内存,把 KV 切成固定大小的 block,逻辑序列通过 Block Table 索引到物理块,碎片消失,Copy-on-Write 让并行采样共享前缀,Prefix Cache 让多请求复用系统提示。</p>`,84)])])}const K=s(e,[["render",l]]);export{g as __pageData,K as default};
