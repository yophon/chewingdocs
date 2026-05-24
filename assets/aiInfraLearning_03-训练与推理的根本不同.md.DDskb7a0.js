import{_ as a,H as s,f as t,i as p}from"./chunks/framework.BHvCMIhP.js";const g=JSON.parse('{"title":"训练与推理的根本不同:为什么是两套工程问题","description":"","frontmatter":{},"headers":[],"relativePath":"aiInfraLearning/03-训练与推理的根本不同.md","filePath":"aiInfraLearning/03-训练与推理的根本不同.md","lastUpdated":1778649484000}'),e={name:"aiInfraLearning/03-训练与推理的根本不同.md"};function l(i,n,o,d,c,r){return s(),t("div",null,[...n[0]||(n[0]=[p(`<h1 id="训练与推理的根本不同-为什么是两套工程问题" tabindex="-1">训练与推理的根本不同:为什么是两套工程问题 <a class="header-anchor" href="#训练与推理的根本不同-为什么是两套工程问题" aria-label="Permalink to &quot;训练与推理的根本不同:为什么是两套工程问题&quot;">​</a></h1><p>「LLM」这三个字下面,<strong>训练和推理几乎是两个不同的工程领域</strong>——用的并行策略不同、显存账不同、SLA 不同、用的框架不同、优化方向也不同。训练侧的全部努力在解决&quot;一个 70B 模型在 1TB+ 显存需求下怎么切到多卡上跑&quot;;推理侧的全部努力在解决&quot;decode 阶段 memory-bound 怎么把卡榨出更多 token&quot;。同一个模型,两边工程师看的指标完全不重叠。这一篇把这道分界线划清楚——后续 6-12 是推理一侧,13-19 是训练一侧。</p><blockquote><p>一句话先记住:<strong>训练存的是「权重 + 梯度 + 优化器状态 + 激活」(≈ 16 × 参数 bytes,以 Adam FP16 混合精度算),推理只存「权重 + KV Cache」(权重一次性,KV 随并发和上下文涨);训练永远 compute-bound 偏通信,推理 prefill 是 compute-bound 但 decode 是 memory-bound——这一组不同决定了两侧后续所有优化方向</strong>。</p></blockquote><hr><h2 id="一、最直白的区别-谁在调什么-api" tabindex="-1">一、最直白的区别:谁在调什么 API <a class="header-anchor" href="#一、最直白的区别-谁在调什么-api" aria-label="Permalink to &quot;一、最直白的区别:谁在调什么 API&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># 训练侧 (一次 step)</span></span>
<span class="line"><span>loss = model(input).loss        # forward</span></span>
<span class="line"><span>loss.backward()                  # backward,产生 grad</span></span>
<span class="line"><span>optimizer.step()                 # 用 grad 更新参数</span></span>
<span class="line"><span>optimizer.zero_grad()            # 清掉 grad</span></span>
<span class="line"><span># 关键变量:loss, grad, optimizer state(都要存在显存)</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 推理侧 (一次 generate)</span></span>
<span class="line"><span>with torch.no_grad():            # 关键:不算 grad</span></span>
<span class="line"><span>    output = model.generate(input, max_new_tokens=512)</span></span>
<span class="line"><span># 关键变量:KV Cache(权重外唯一活的状态)</span></span></code></pre></div><p>代码差几行,但<strong>底层显存形状、计算图、通信模式全不一样</strong>:</p><table tabindex="0"><thead><tr><th>维度</th><th>训练</th><th>推理</th></tr></thead><tbody><tr><td>计算图</td><td>forward + backward + optimizer step</td><td>只有 forward</td></tr><tr><td>显存项</td><td>权重 + 梯度 + 优化器状态 + 激活</td><td>权重 + KV Cache</td></tr><tr><td>主要状态</td><td>权重在反向后被更新</td><td>权重一开始就冻结,KV 持续追加</td></tr><tr><td>输入形状</td><td><code>[B, S, d]</code>(定长 batch,seq_len 固定)</td><td><code>[B, 1, d]</code>(自回归,每步只算 1 个 token)</td></tr><tr><td>Batch 行为</td><td>一个 batch 内所有样本一致前进</td><td>不同请求可能在 prefill / decode 不同阶段</td></tr><tr><td>主要瓶颈</td><td>显存 + 跨节点通信</td><td>KV 容量 + HBM 带宽</td></tr><tr><td>框架</td><td>Megatron-LM + DeepSpeed / FSDP</td><td>vLLM / SGLang / TRT-LLM</td></tr><tr><td>SLA</td><td>整个训练 run 完成 / loss 降到位</td><td>TTFT / TPOT / QPS</td></tr><tr><td>时间尺度</td><td>周-月级</td><td>毫秒级</td></tr></tbody></table><hr><h2 id="二、训练显存账-adam-让一切变成-16x" tabindex="-1">二、训练显存账:Adam 让一切变成 16x <a class="header-anchor" href="#二、训练显存账-adam-让一切变成-16x" aria-label="Permalink to &quot;二、训练显存账:Adam 让一切变成 16x&quot;">​</a></h2><h3 id="_2-1-训练一个-70b-模型-显存项一项一项算" tabindex="-1">2.1 训练一个 70B 模型,显存项一项一项算 <a class="header-anchor" href="#_2-1-训练一个-70b-模型-显存项一项一项算" aria-label="Permalink to &quot;2.1 训练一个 70B 模型,显存项一项一项算&quot;">​</a></h3><p>用 FP16 混合精度训练(主权重 FP32 + 计算 FP16,业界 2022-2024 标准做法):</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>模型本身相关:</span></span>
<span class="line"><span>  - 权重 FP16:              70B × 2 = 140 GB</span></span>
<span class="line"><span>  - 梯度 FP16:              70B × 2 = 140 GB</span></span>
<span class="line"><span>  - 主权重 FP32(供更新):    70B × 4 = 280 GB</span></span>
<span class="line"><span>  - Adam momentum FP32:     70B × 4 = 280 GB</span></span>
<span class="line"><span>  - Adam variance FP32:     70B × 4 = 280 GB</span></span>
<span class="line"><span>                            ─────────────────</span></span>
<span class="line"><span>                            合计 ~ 1120 GB</span></span>
<span class="line"><span></span></span>
<span class="line"><span>激活(用于 backward):</span></span>
<span class="line"><span>  - 每层激活 ≈ B × S × d × 层数,以 70B + B=4 + S=2048 算</span></span>
<span class="line"><span>  - 不做 activation checkpoint:几百 GB</span></span>
<span class="line"><span>  - 做 activation checkpoint(只存关键点,反向时重算):几十 GB</span></span></code></pre></div><p><strong>核心是这一行</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>训练显存 ≈ 16 × 参数 byte (FP16 混合精度 + Adam,不算激活)</span></span>
<span class="line"><span>70B × 16 = 1120 GB  ≈ 1.1 TB</span></span></code></pre></div><p>一张 H100 80GB 装不下这 1.1TB 的 1/14——<strong>所以训练必须切到多卡上</strong>,这就是 ZeRO / TP / PP / FSDP 存在的全部原因(13-18 篇展开)。</p><h3 id="_2-2-fp8-训练怎么变" tabindex="-1">2.2 FP8 训练怎么变 <a class="header-anchor" href="#_2-2-fp8-训练怎么变" aria-label="Permalink to &quot;2.2 FP8 训练怎么变&quot;">​</a></h3><p>Hopper 之后 FP8 训练逐渐成熟(22 篇展开),显存账缩水:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>- 权重 FP8:               70B × 1 = 70 GB</span></span>
<span class="line"><span>- 梯度 FP16 (大多还保 FP16):  140 GB  </span></span>
<span class="line"><span>- 主权重 FP32:             280 GB</span></span>
<span class="line"><span>- Adam momentum + variance FP32:  560 GB</span></span>
<span class="line"><span>                          ─────────────────</span></span>
<span class="line"><span>                          合计 ~ 1050 GB</span></span>
<span class="line"><span></span></span>
<span class="line"><span>不到 5% 收益——为什么?因为 Adam 状态是 FP32 的两倍参数,不能简单 FP8 化。</span></span></code></pre></div><p><strong>FP8 训练的真正收益不在显存,在算力</strong>——Tensor Core FP8 算力是 FP16 的 2 倍,等效 step 时间砍半。22 篇展开。</p><h3 id="_2-3-激活的处理-checkpoint-是怎么回事" tabindex="-1">2.3 激活的处理:Checkpoint 是怎么回事 <a class="header-anchor" href="#_2-3-激活的处理-checkpoint-是怎么回事" aria-label="Permalink to &quot;2.3 激活的处理:Checkpoint 是怎么回事&quot;">​</a></h3><p>Backward 需要 forward 时每一层的中间激活才能算 grad。简单做法是 forward 时全存住——70B + 长 seq 几百 GB。</p><p><strong>激活重计算 (Activation Checkpoint / Gradient Checkpoint)</strong>:forward 时只存关键点(每隔几层),backward 时再算一遍中间层。<strong>省 4-10x 激活显存,代价是 ~30% 额外算力</strong>。这是 70B+ 训练的标配。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>完整存激活:           显存大,无重算</span></span>
<span class="line"><span>每层都 checkpoint:    显存小,backward 慢 2x</span></span>
<span class="line"><span>每 K 层 checkpoint:   折中,K 通常 2-4</span></span></code></pre></div><h3 id="_2-4-训练通信账" tabindex="-1">2.4 训练通信账 <a class="header-anchor" href="#_2-4-训练通信账" aria-label="Permalink to &quot;2.4 训练通信账&quot;">​</a></h3><p>切到多卡后,每个 step 末尾必须把所有卡的梯度同步:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>N 张卡数据并行 (DDP):</span></span>
<span class="line"><span>  每 step 一次 AllReduce,通信量 ≈ 2 × 参数 bytes (FP16)</span></span>
<span class="line"><span>  70B FP16: 140 GB</span></span>
<span class="line"><span>  即使 NVLink 900 GB/s,一次也要 ~150ms</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  集群规模上去后,跨节点的 InfiniBand 400 Gbps ≈ 50 GB/s</span></span>
<span class="line"><span>  一次 AllReduce 在跨节点环上 ~ 数秒</span></span></code></pre></div><p><strong>这就是为什么&quot;千卡训练 80% 时间在等通信&quot;——梯度大,网络慢,每 step 都要同步</strong>。13-19 篇全在讲怎么把这块榨干:Bucket + 计算通信重叠、Ring 拓扑、ZeRO 分片让通信量正比于 1/N、TP 把通信局限在节点内 NVLink、PP 用气泡换通信减少……</p><hr><h2 id="三、推理显存账-权重-kv" tabindex="-1">三、推理显存账:权重 + KV <a class="header-anchor" href="#三、推理显存账-权重-kv" aria-label="Permalink to &quot;三、推理显存账:权重 + KV&quot;">​</a></h2><h3 id="_3-1-推理只存两块" tabindex="-1">3.1 推理只存两块 <a class="header-anchor" href="#_3-1-推理只存两块" aria-label="Permalink to &quot;3.1 推理只存两块&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>推理显存 = 模型权重 + KV Cache(随并发和上下文长度涨)</span></span>
<span class="line"><span>        + 一点点 activation buffer 和 workspace</span></span></code></pre></div><p>不存梯度、优化器状态、不存反向激活。<strong>推理显存通常只有训练的 1/10 左右</strong>——70B FP16 推理大约 140GB + KV(几十 GB),训练要 1TB+。</p><h3 id="_3-2-kv-cache-推理特有的状态" tabindex="-1">3.2 KV Cache:推理特有的状态 <a class="header-anchor" href="#_3-2-kv-cache-推理特有的状态" aria-label="Permalink to &quot;3.2 KV Cache:推理特有的状态&quot;">​</a></h3><p>自回归生成的本质:<strong>每生成一个 token,要重新走一遍整个 Transformer</strong>。第 N 步时,前面 N-1 个 token 的 K、V 矩阵必须重新算一次吗?</p><p>不必。<strong>K、V 是输入的线性投影,前面 token 的 K、V 算完后不会变</strong>——存起来下一步直接用。这就是 KV Cache:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>没 KV Cache:</span></span>
<span class="line"><span>   step 1:  算 1 个 token 的 Q × 1 个 K^T → 1×1 attention</span></span>
<span class="line"><span>   step 2:  算 1 个 token 的 Q × 2 个 K^T → 1×2 attention</span></span>
<span class="line"><span>            (重新算前面 1 个 token 的 K 和 V,浪费)</span></span>
<span class="line"><span>   step 3:  算 1 个 token 的 Q × 3 个 K^T → 1×3 attention</span></span>
<span class="line"><span>            (重新算前面 2 个 token 的 K 和 V,更浪费)</span></span>
<span class="line"><span>   ...</span></span>
<span class="line"><span>   step N:  O(N^2) 累积计算量</span></span>
<span class="line"><span></span></span>
<span class="line"><span>有 KV Cache:</span></span>
<span class="line"><span>   step 1:  算 1 个 K, V 存到 cache,1×1 attention</span></span>
<span class="line"><span>   step 2:  算 1 个新 K, V 加到 cache,1×2 attention(只 dot 一次)</span></span>
<span class="line"><span>   step 3:  算 1 个新 K, V 加到 cache,1×3 attention</span></span>
<span class="line"><span>   ...</span></span>
<span class="line"><span>   step N:  O(N) 计算量,但 cache 占 O(N) 显存</span></span></code></pre></div><p><strong>用显存换算力</strong>,自回归生成必备。代价是 cache 随 seq_len 线性增长,长上下文场景能把显存撑爆——这就是 07 篇要展开的&quot;为什么 KV 是 LLM 推理的真正稀缺资源&quot;。</p><h3 id="_3-3-kv-cache-占多大" tabindex="-1">3.3 KV Cache 占多大 <a class="header-anchor" href="#_3-3-kv-cache-占多大" aria-label="Permalink to &quot;3.3 KV Cache 占多大&quot;">​</a></h3><p>以 70B 类模型为例(80 层、64 头、head_dim=128、grouped-query attention=8 KV head):</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>每 token 每层的 KV(FP16):</span></span>
<span class="line"><span>   2 × n_kv_head × head_dim × 2 bytes = 2 × 8 × 128 × 2 = 4096 bytes / 层</span></span>
<span class="line"><span></span></span>
<span class="line"><span>每 token 全部层的 KV:</span></span>
<span class="line"><span>   4096 × 80 层 = 327 KB / token</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>单请求上下文:</span></span>
<span class="line"><span>   4K  上下文: 4096 × 327 KB ≈ 1.3 GB</span></span>
<span class="line"><span>   32K 上下文: 32768 × 327 KB ≈ 10.5 GB</span></span>
<span class="line"><span>   128K 上下文: 131072 × 327 KB ≈ 42 GB</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>并发场景:</span></span>
<span class="line"><span>   并发 32 × 4K上下文 = 42 GB     可承受</span></span>
<span class="line"><span>   并发 32 × 32K上下文 = 336 GB   8 卡 H100 都吃紧</span></span>
<span class="line"><span>   并发 4 × 128K上下文 = 168 GB   单副本只能服务很少并发</span></span></code></pre></div><p><strong>实战上 KV Cache 经常比权重还大</strong>——70B FP16 权重 140 GB,32K 并发的 KV 能轻松超过。这就是为什么:</p><ul><li>PagedAttention(08 篇):把 KV 切块管理,允许碎片化分配</li><li>FP8 / INT4 KV 量化(23 篇):KV byte 砍半到 1/4</li><li>Prefix Caching:同样 system prompt 不同请求复用 KV</li></ul><p><strong>所有这些都是 KV 这个&quot;推理特有项&quot;逼出来的</strong>。</p><hr><h2 id="四、自回归生成的两阶段-prefill-vs-decode" tabindex="-1">四、自回归生成的两阶段:Prefill vs Decode <a class="header-anchor" href="#四、自回归生成的两阶段-prefill-vs-decode" aria-label="Permalink to &quot;四、自回归生成的两阶段:Prefill vs Decode&quot;">​</a></h2><p>LLM 推理不是一个均匀的过程,而是<strong>两个截然不同的阶段</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>用户输入 &quot;解释一下 PagedAttention 是怎么工作的&quot;  (S=10 tokens)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>阶段 1: Prefill</span></span>
<span class="line"><span>   输入:  10 个 token 一次性进 forward</span></span>
<span class="line"><span>   计算:  矩阵 Q ∈ [1, 10, d] × K^T ∈ [1, d, 10]  (大 matmul)</span></span>
<span class="line"><span>         所有 10 个 token 的 K, V 同时算出来,存进 KV cache</span></span>
<span class="line"><span>   输出:  第 11 个 token 的 logits → 采样得到 &quot;Paged&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>阶段 2: Decode (反复)</span></span>
<span class="line"><span>   输入:  上一步生成的 1 个 token</span></span>
<span class="line"><span>   计算:  矩阵 Q ∈ [1, 1, d] × K^T ∈ [1, d, 11]  (小 matmul / GEMV)</span></span>
<span class="line"><span>         新 token 的 K, V 追加到 cache</span></span>
<span class="line"><span>   输出:  下一个 token 的 logits → 采样得到 &quot;Attention&quot;</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   ... 重复 ~500 次直到 EOS ...</span></span></code></pre></div><h3 id="_4-1-两阶段形状对比" tabindex="-1">4.1 两阶段形状对比 <a class="header-anchor" href="#_4-1-两阶段形状对比" aria-label="Permalink to &quot;4.1 两阶段形状对比&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                    Prefill 阶段                    Decode 阶段</span></span>
<span class="line"><span>                  ─────────────────              ─────────────────</span></span>
<span class="line"><span>   每步输入:       整个 prompt (S 个 token)        上一步生成的 1 个 token</span></span>
<span class="line"><span>                  </span></span>
<span class="line"><span>   矩阵形状:       Q ∈ [B, S, d]                   Q ∈ [B, 1, d]</span></span>
<span class="line"><span>                  K, V ∈ [B, S, d]                K, V cache ∈ [B, S+t, d]</span></span>
<span class="line"><span>                                                  新 K, V ∈ [B, 1, d]</span></span>
<span class="line"><span>                  </span></span>
<span class="line"><span>   主算子:         大 matmul (GEMM)                小 matmul / GEMV</span></span>
<span class="line"><span>                  </span></span>
<span class="line"><span>   计算量:         O(B × S × d²) MLP               O(B × 1 × d²) MLP</span></span>
<span class="line"><span>                  + O(B × S² × d) Attention       + O(B × S × d) Attention</span></span>
<span class="line"><span>                  </span></span>
<span class="line"><span>   读权重:         1 次,摊到 S 个 token            1 次,只算 1 个 token</span></span>
<span class="line"><span>                  </span></span>
<span class="line"><span>   算术强度:       ≈ S × 2                         ≈ 2  </span></span>
<span class="line"><span>                  (S=2048 时大概 4000)             (无论 S 多大都 ≈ 2)</span></span>
<span class="line"><span>                  </span></span>
<span class="line"><span>   瓶颈:           compute-bound (大 S, 大 B)      memory-bound (永远)</span></span>
<span class="line"><span>                  Tensor Core 跑满                 HBM 带宽限制</span></span>
<span class="line"><span>                  </span></span>
<span class="line"><span>   单步延迟:       几十 ms 到几百 ms                几 ms 到几十 ms</span></span>
<span class="line"><span>                  (TTFT 由它决定)                  (TPOT 由它决定)</span></span></code></pre></div><h3 id="_4-2-算术强度差异-roofline-上的两个点" tabindex="-1">4.2 算术强度差异:Roofline 上的两个点 <a class="header-anchor" href="#_4-2-算术强度差异-roofline-上的两个点" aria-label="Permalink to &quot;4.2 算术强度差异:Roofline 上的两个点&quot;">​</a></h3><p>把 Prefill 和 Decode 标到 H100 的 Roofline 上:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>性能 (FLOP/s)</span></span>
<span class="line"><span>     ↑</span></span>
<span class="line"><span>     │</span></span>
<span class="line"><span>989T │                       ┌─────────────────  H100 FP16 Peak</span></span>
<span class="line"><span>     │                      ╱</span></span>
<span class="line"><span>     │                    P ╱  ← Prefill (大 batch + 长 S)</span></span>
<span class="line"><span>     │                   ╱         可以接近顶峰</span></span>
<span class="line"><span>     │                  ╱</span></span>
<span class="line"><span>     │                 ╱  </span></span>
<span class="line"><span>     │                ╱   ← 拐点 ≈ 295 FLOP/Byte</span></span>
<span class="line"><span>     │               ╱</span></span>
<span class="line"><span>     │              ╱</span></span>
<span class="line"><span>     │             ╱</span></span>
<span class="line"><span>     │            ╱</span></span>
<span class="line"><span>     │           ╱</span></span>
<span class="line"><span>     │          ╱       </span></span>
<span class="line"><span>     │         ╱ Decode (即使 batch=32)</span></span>
<span class="line"><span>     │        ╱  ●  ← 永远停在这附近</span></span>
<span class="line"><span>     │       ╱        算术强度 ≈ 64</span></span>
<span class="line"><span>     │      ╱</span></span>
<span class="line"><span>     │     ╱</span></span>
<span class="line"><span>     │    ●  ← Decode batch=1</span></span>
<span class="line"><span>     │       算术强度 ≈ 2</span></span>
<span class="line"><span>     └────┴──────────────────────────────→ 算术强度 (FLOP/Byte)</span></span>
<span class="line"><span>          2    64        256   295         1000+</span></span></code></pre></div><p><strong>两条关键观察</strong>:</p><ol><li><strong>Decode 无论怎么调,算术强度都接近 2</strong>——因为每生成 1 个 token 都要把整个模型权重读一遍,没法摊;唯一的办法是<strong>加 batch</strong>(同一份权重供更多请求复用)</li><li><strong>Prefill 在合理 batch 和 S 下可以打满算力</strong>——所以 prefill 的优化方向跟 decode 完全不同</li></ol><h3 id="_4-3-这个分界决定了所有推理优化方向" tabindex="-1">4.3 这个分界决定了所有推理优化方向 <a class="header-anchor" href="#_4-3-这个分界决定了所有推理优化方向" aria-label="Permalink to &quot;4.3 这个分界决定了所有推理优化方向&quot;">​</a></h3><table tabindex="0"><thead><tr><th>优化</th><th>解决 Prefill 还是 Decode 的问题</th><th>出自第几篇</th></tr></thead><tbody><tr><td><strong>PagedAttention</strong></td><td>Decode KV 显存碎片 + 并发不够</td><td>08</td></tr><tr><td><strong>Continuous Batching</strong></td><td>Decode batch 拉满(把 decode 推到拐点)</td><td>09</td></tr><tr><td><strong>Prefix Caching / RadixAttention</strong></td><td>Prefill 重复 prompt 的 KV 复用</td><td>10</td></tr><tr><td><strong>投机解码</strong></td><td>Decode 用小模型预生草稿,大模型批量验证</td><td>11</td></tr><tr><td><strong>Chunked Prefill</strong></td><td>长 prompt 切片,避免单次 prefill 拖垮 batch</td><td>09 / 12</td></tr><tr><td><strong>TRT-LLM Kernel 融合</strong></td><td>Decode 的 attention kernel 合并,减少 HBM 来回</td><td>12</td></tr><tr><td><strong>KV 量化 (FP8 / INT4)</strong></td><td>Decode 时 KV 搬运字节数砍半</td><td>23</td></tr><tr><td><strong>Disaggregated Prefill-Decode</strong></td><td>物理上把 prefill 和 decode 分到不同 GPU 池</td><td>30</td></tr></tbody></table><p><strong>没有一个优化是&quot;通用让推理变快&quot;</strong>,每一个都对应一个具体的 Prefill 或 Decode 子问题。<strong>听到任何&quot;X 让推理快&quot;的说法,先问&quot;它解决的是 prefill 还是 decode 的什么具体瓶颈&quot;</strong>。</p><hr><h2 id="五、ttft-和-tpot-推理-sla-必须分两段" tabindex="-1">五、TTFT 和 TPOT:推理 SLA 必须分两段 <a class="header-anchor" href="#五、ttft-和-tpot-推理-sla-必须分两段" aria-label="Permalink to &quot;五、TTFT 和 TPOT:推理 SLA 必须分两段&quot;">​</a></h2><p>推理服务的延迟不能用一个数字概括,必须拆两段:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>TTFT (Time To First Token)</span></span>
<span class="line"><span>   = 从请求到达到第一个 token 输出</span></span>
<span class="line"><span>   = Prefill 时间 + 排队 + queue 处理</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>TPOT (Time Per Output Token)</span></span>
<span class="line"><span>   = 后续每个 output token 的平均间隔</span></span>
<span class="line"><span>   = Decode 时间(主导)+ 调度开销</span></span>
<span class="line"><span></span></span>
<span class="line"><span>总延迟 ≈ TTFT + (生成 token 数 - 1) × TPOT</span></span></code></pre></div><p><strong>两个指标受不同因素影响</strong>:</p><table tabindex="0"><thead><tr><th>指标</th><th>主要受谁影响</th></tr></thead><tbody><tr><td>TTFT</td><td>Prefill 计算量(prompt 长度)、并发请求挤队、prefill batch 调度</td></tr><tr><td>TPOT</td><td>Decode 的 HBM 带宽利用、batch 大小、KV 操作开销</td></tr><tr><td>Throughput</td><td>TPOT × 并发数,本质是带宽利用率</td></tr></tbody></table><p><strong>生产中的取舍</strong>:</p><ul><li>聊天场景:TTFT &lt; 500ms 决定&quot;用户感觉是不是卡&quot;,优化 prefill</li><li>长生成场景(写代码、生成长文档):TPOT 决定&quot;打字速度&quot;,优化 decode</li><li>高 QPS 场景:Throughput 决定每张卡每千 token 成本(29 篇展开)</li></ul><p><strong>用单一&quot;latency&quot;或&quot;QPS&quot;评价推理服务,基本都是没分清两阶段</strong>。</p><hr><h2 id="六、训练侧的优化方向-与推理完全不同" tabindex="-1">六、训练侧的优化方向:与推理完全不同 <a class="header-anchor" href="#六、训练侧的优化方向-与推理完全不同" aria-label="Permalink to &quot;六、训练侧的优化方向:与推理完全不同&quot;">​</a></h2><p>回到训练侧,所有优化也都围着两件事:<strong>显存装不下</strong>和<strong>通信跑不快</strong>。</p><table tabindex="0"><thead><tr><th>优化</th><th>解决什么</th><th>出自第几篇</th></tr></thead><tbody><tr><td><strong>DDP</strong></td><td>数据并行,把 batch 切到多卡</td><td>13</td></tr><tr><td><strong>ZeRO-1/2/3</strong></td><td>把优化器状态 / 梯度 / 参数分片到多卡(显存)</td><td>14</td></tr><tr><td><strong>FSDP</strong></td><td>PyTorch 原生 ZeRO-3,易用性更好</td><td>15</td></tr><tr><td><strong>张量并行 (TP)</strong></td><td>矩阵切块分到多卡(显存 + 算力)</td><td>16</td></tr><tr><td><strong>流水并行 (PP)</strong></td><td>把层切到不同卡,流水推进(显存)</td><td>17</td></tr><tr><td><strong>3D 并行</strong></td><td>TP × PP × DP 三者组合</td><td>18</td></tr><tr><td><strong>Sequence Parallelism</strong></td><td>长 seq 切到多卡(显存 + 算力)</td><td>18</td></tr><tr><td><strong>激活 checkpoint</strong></td><td>重算换显存</td><td>14</td></tr><tr><td><strong>FP8 训练</strong></td><td>算力 + 显存 + 通信全收益</td><td>22</td></tr><tr><td><strong>Overlap 计算通信</strong></td><td>AllReduce 与下一层 forward 并行</td><td>19</td></tr><tr><td><strong>Bucket</strong></td><td>多个小梯度合并一次 AllReduce</td><td>13</td></tr></tbody></table><p><strong>注意完全没有&quot;Continuous Batching&quot;、&quot;PagedAttention&quot;——训练根本不存在 decode 这个阶段</strong>。同样,推理几乎用不上 ZeRO / TP 这种为训练显存设计的并行——TP 在推理也用,但更多是&quot;装得下&quot;而非&quot;算得快&quot;。</p><hr><h2 id="七、为什么不能用一套框架覆盖训练和推理" tabindex="-1">七、为什么不能用一套框架覆盖训练和推理 <a class="header-anchor" href="#七、为什么不能用一套框架覆盖训练和推理" aria-label="Permalink to &quot;七、为什么不能用一套框架覆盖训练和推理&quot;">​</a></h2><p>理论上 PyTorch + <code>model.generate</code> 可以同时做训练和推理——确实可以,但<strong>生产上没人这么干</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>训练真实栈:</span></span>
<span class="line"><span>    Megatron-LM (3D 并行)</span></span>
<span class="line"><span>    + DeepSpeed (ZeRO / 优化器分片)</span></span>
<span class="line"><span>    + Transformer Engine (FP8)</span></span>
<span class="line"><span>    + Slurm 集群调度</span></span>
<span class="line"><span>    + 自定义 collator + 数据流水</span></span>
<span class="line"><span></span></span>
<span class="line"><span>推理真实栈:</span></span>
<span class="line"><span>    vLLM / SGLang / TRT-LLM</span></span>
<span class="line"><span>    + Ray Serve (服务化)</span></span>
<span class="line"><span>    + KubeRay (K8s 调度)</span></span>
<span class="line"><span>    + 自定义路由 / 多 LoRA</span></span>
<span class="line"><span>    + 监控 + 流式输出</span></span></code></pre></div><p><strong>两边几乎不重叠</strong>——除了&quot;PyTorch 张量&quot;和&quot;NCCL 通信&quot;,从框架到调度到指标到运维全是独立栈。</p><p><strong>原因不复杂</strong>:</p><ol><li><strong>训练优化的是吞吐</strong>(每秒处理多少 token),推理优化的是<strong>单请求延迟 + 多请求 QPS</strong>——目标函数不同</li><li>训练 batch 静态 + 同步推进,推理 batch 动态 + 不同请求异步进出(continuous batching)</li><li>训练有 backward 计算图(autograd),推理可以做 kernel 融合 / 重写而不用管 grad</li><li>训练 checkpoint 几小时一次,推理服务必须 0 downtime 更新</li></ol><p><strong>所以训练和推理工程师在生产侧基本是两拨人,工具栈、关注指标、调优手感都不同</strong>——这也是为什么本系列要分两层:06-12 推理 + 13-19 训练。</p><hr><h2 id="八、看完这一篇-你应该能" tabindex="-1">八、看完这一篇,你应该能 <a class="header-anchor" href="#八、看完这一篇-你应该能" aria-label="Permalink to &quot;八、看完这一篇,你应该能&quot;">​</a></h2><ul><li>算出 70B 训练显存 ≈ 16 × 参数 bytes(FP16 混合精度 + Adam),解释每一项是什么</li><li>算出 70B 推理显存 = 权重 + KV;每 token KV ≈ 300+ KB,长上下文 KV 能超过权重本身</li><li>解释为什么自回归生成必须 KV Cache(O(N) vs O(N²))</li><li>默写 Prefill vs Decode 的对比表:形状、算术强度、瓶颈、对应延迟指标</li><li>把任何一个推理优化(PagedAttention / Continuous Batching / 投机解码 / KV 量化)对应到 prefill / decode 的某个具体瓶颈</li><li>解释为什么训练和推理需要两套独立框架栈</li></ul><p>下一篇:<strong>04 浮点格式全景</strong> — FP32 / FP16 / BF16 / FP8 / INT8 / INT4 各自能塞多少位精度,Hopper 之后 FP8 为什么成了训练 + 推理双侧的新标配,精度-性能-显存三角的甜点在哪。</p>`,84)])])}const u=a(e,[["render",l]]);export{g as __pageData,u as default};
