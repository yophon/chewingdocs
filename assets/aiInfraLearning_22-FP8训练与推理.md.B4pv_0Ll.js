import{_ as a,H as n,f as p,i}from"./chunks/framework.BHvCMIhP.js";const o=JSON.parse('{"title":"FP8 训练与推理:Hopper 之后的新标配","description":"","frontmatter":{},"headers":[],"relativePath":"aiInfraLearning/22-FP8训练与推理.md","filePath":"aiInfraLearning/22-FP8训练与推理.md","lastUpdated":1778649484000}'),l={name:"aiInfraLearning/22-FP8训练与推理.md"};function e(t,s,h,r,c,d){return n(),p("div",null,[...s[0]||(s[0]=[i(`<h1 id="fp8-训练与推理-hopper-之后的新标配" tabindex="-1">FP8 训练与推理:Hopper 之后的新标配 <a class="header-anchor" href="#fp8-训练与推理-hopper-之后的新标配" aria-label="Permalink to &quot;FP8 训练与推理:Hopper 之后的新标配&quot;">​</a></h1><p>20 篇讲了量化的一般心智,21 篇讲了 GPTQ / AWQ / GGUF 三大权重量化方案——但那些都是「<strong>训练完再量</strong>」的事(PTQ)。FP8 是另一条路:<strong>训练的时候就在 FP8 上做矩阵乘</strong>。H100 把 FP8 Tensor Core 做成了一等公民,2026 年绝大部分新训练的中大模型(Llama / Qwen / DeepSeek / GPT 类)都在原生 FP8 上跑,<strong>FP8 已经不是「可选优化」,而是 Hopper 之后的默认起点</strong>。这一篇拉清楚 FP8 在训练和推理两侧分别长什么样,以及为什么它跟 INT8 完全是两种东西。</p><blockquote><p>一句话先记住:<strong>FP8 是浮点(有指数 + 尾数),INT8 是定点;LLM 激活值的离群点(outlier)很多,FP8 用动态范围吃下,INT8 没指数就被这些 outlier 拖死。Hopper 上 FP8 算力是 BF16 的 2 倍 / 显存搬运字节砍半,代价是 ~1-2% 下游精度,工程坑主要在 scaling 策略和混合精度边界</strong>。</p></blockquote><hr><h2 id="一、为什么不是「fp16-够用就别折腾」" tabindex="-1">一、为什么不是「FP16 够用就别折腾」 <a class="header-anchor" href="#一、为什么不是「fp16-够用就别折腾」" aria-label="Permalink to &quot;一、为什么不是「FP16 够用就别折腾」&quot;">​</a></h2><p>H100 之前(A100 时代),业界训练标准是 <strong>BF16 混合精度</strong> + Adam FP32 状态:权重 BF16、GEMM BF16、累加器 FP32、主参数 FP32。这套方案稳定但有三个不舒服的地方:</p><ol><li><strong>算力天花板</strong>:A100 BF16 算力 312 TFLOPS,千卡训练 70B 一周起步。算力买不到更便宜的形态了</li><li><strong>显存搬运占大头</strong>:LLM 推理 decode 阶段算术强度只有 2 FLOP/byte(02 篇),BF16 一个值 2 字节,搬运成了瓶颈</li><li><strong>AI 公司单 GPU 小时成本</strong>:H100 每月 2-3 美元/卡时,2 倍算力 = 2 倍 ROI</li></ol><p>Hopper 给的答案是 FP8 Tensor Core:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>H100 算力对比(SXM5 / 稠密):</span></span>
<span class="line"><span>  FP32:    67 TFLOPS</span></span>
<span class="line"><span>  TF32:    495 TFLOPS</span></span>
<span class="line"><span>  BF16:    989 TFLOPS</span></span>
<span class="line"><span>  FP8:     1979 TFLOPS    ← BF16 的 2 倍</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>B200(Blackwell,2024+):</span></span>
<span class="line"><span>  FP8:     ~4500 TFLOPS</span></span>
<span class="line"><span>  FP6:     ~4500 TFLOPS    ← 新增</span></span>
<span class="line"><span>  FP4:     ~9000 TFLOPS    ← BF16 的 9 倍以上</span></span></code></pre></div><p><strong>这不是「再快一点点」,是 2 倍以上的算力直接到位</strong>——前提是你能在 FP8 精度下让训练收敛、让推理精度不掉。</p><hr><h2 id="二、fp8-不是「更小的-int8」" tabindex="-1">二、FP8 不是「更小的 INT8」 <a class="header-anchor" href="#二、fp8-不是「更小的-int8」" aria-label="Permalink to &quot;二、FP8 不是「更小的 INT8」&quot;">​</a></h2><p>这是入门最大误区。FP8 和 INT8 都用 8 位,但<strong>数值类型完全不同</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>INT8(定点):</span></span>
<span class="line"><span>  ┌─┬─┬─┬─┬─┬─┬─┬─┐</span></span>
<span class="line"><span>  │S│M│M│M│M│M│M│M│      1 符号 + 7 数值位</span></span>
<span class="line"><span>  └─┴─┴─┴─┴─┴─┴─┴─┘</span></span>
<span class="line"><span>  能表示 [-128, 127] 共 256 个等距点</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  代表的连续值:</span></span>
<span class="line"><span>  value = scale × int_value  (per-tensor 一个 scale)</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  例:scale = 0.01,则</span></span>
<span class="line"><span>    int 1   → 0.01</span></span>
<span class="line"><span>    int 100 → 1.00</span></span>
<span class="line"><span>    int 127 → 1.27</span></span>
<span class="line"><span>    →→→ 间隔恒定 0.01,均匀分布</span></span>
<span class="line"><span></span></span>
<span class="line"><span>FP8 E4M3(浮点):</span></span>
<span class="line"><span>  ┌─┬─┬─┬─┬─┬─┬─┬─┐</span></span>
<span class="line"><span>  │S│E│E│E│E│M│M│M│      1 符号 + 4 指数 + 3 尾数</span></span>
<span class="line"><span>  └─┴─┴─┴─┴─┴─┴─┴─┘</span></span>
<span class="line"><span>  能表示 [-448, 448],非均匀分布(指数密集小数,稀疏大数)</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  代表的连续值:</span></span>
<span class="line"><span>  value = (-1)^S × 2^(E-bias) × (1 + M/8)</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  例:</span></span>
<span class="line"><span>    0.0156         ← 小数附近精度高</span></span>
<span class="line"><span>    0.0157</span></span>
<span class="line"><span>    0.0158</span></span>
<span class="line"><span>    ...</span></span>
<span class="line"><span>    448            ← 大数附近精度低但能表示</span></span></code></pre></div><h3 id="_2-1-必画图-为什么-llm-激活值适合-fp8-而不是-int8" tabindex="-1">2.1 必画图:为什么 LLM 激活值适合 FP8 而不是 INT8 <a class="header-anchor" href="#_2-1-必画图-为什么-llm-激活值适合-fp8-而不是-int8" aria-label="Permalink to &quot;2.1 必画图:为什么 LLM 激活值适合 FP8 而不是 INT8&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>LLM 一个 attention 输出的激活分布(典型):</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  频次</span></span>
<span class="line"><span>   ↑</span></span>
<span class="line"><span>   │     ░░░░░░             </span></span>
<span class="line"><span>   │   ░░░░░░░░░░           ← 90% 数值集中在 [-3, +3]</span></span>
<span class="line"><span>   │   ░░░░░░░░░░░░          </span></span>
<span class="line"><span>   │  ░░░░░░░░░░░░░░         </span></span>
<span class="line"><span>   │ ░░░░░░░░░░░░░░░         </span></span>
<span class="line"><span>   │░░░░░░░░░░░░░░░░░        </span></span>
<span class="line"><span>   │                                                      ●     ← outlier!</span></span>
<span class="line"><span>   │                                                            可能到 ±50 ~ ±200</span></span>
<span class="line"><span>   │                                                            (1% 的值,但拉大动态范围)</span></span>
<span class="line"><span>   └────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──→ 数值</span></span>
<span class="line"><span>       -100   -10     -3      0     +3    +10   +100   ...</span></span>
<span class="line"><span></span></span>
<span class="line"><span>INT8 量化:</span></span>
<span class="line"><span>  scale = max(|x|) / 127 ≈ 200/127 = 1.57</span></span>
<span class="line"><span>  落到 INT8 区间:</span></span>
<span class="line"><span>    主体 90% 数值: int(|x| / 1.57)</span></span>
<span class="line"><span>    数值 ±1.57 = int ±1     ← 主体丢了几乎全部精度!</span></span>
<span class="line"><span>    数值 ±3    = int ±2  </span></span>
<span class="line"><span>    数值 ±50   = int ±31</span></span>
<span class="line"><span>    数值 ±100  = int ±63</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  → 主体数据全挤进 ±2,**严重精度损失**</span></span>
<span class="line"><span></span></span>
<span class="line"><span>FP8 E4M3 量化:</span></span>
<span class="line"><span>  动态范围 ±448 直接覆盖</span></span>
<span class="line"><span>  主体 90% 数值落在 ±3 范围,FP8 在小数附近有充分精度</span></span>
<span class="line"><span>  outlier 落在 ±50 ~ ±200 范围,FP8 仍能表示(精度低但不爆)</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  → outlier 不污染主体精度,**整体损失小一个量级**</span></span></code></pre></div><p><strong>这就是 FP8 在 LLM 上比 INT8 稳的根本原因</strong>:浮点的非均匀分布天然贴合「主体集中 + 长尾 outlier」的真实分布。INT8 想做 LLM 量化必须配合 outlier 抑制(SmoothQuant / AWQ / GPTQ,21 篇),FP8 直接吃下来。</p><hr><h2 id="三、e4m3-vs-e5m2-训练为什么要两种" tabindex="-1">三、E4M3 vs E5M2:训练为什么要两种 <a class="header-anchor" href="#三、e4m3-vs-e5m2-训练为什么要两种" aria-label="Permalink to &quot;三、E4M3 vs E5M2:训练为什么要两种&quot;">​</a></h2><p>04 篇展开过浮点格式,这里只回顾工程相关的:</p><table tabindex="0"><thead><tr><th></th><th>E4M3</th><th>E5M2</th></tr></thead><tbody><tr><td>指数位</td><td>4</td><td>5</td></tr><tr><td>尾数位</td><td>3</td><td>2</td></tr><tr><td>最大值</td><td>±448</td><td>±57344</td></tr><tr><td>最小正常值</td><td>2^-6 ≈ 0.0156</td><td>2^-14 ≈ 6.1e-5</td></tr><tr><td>精度(小数附近)</td><td>高</td><td>低</td></tr><tr><td>动态范围</td><td>小</td><td>大</td></tr><tr><td>主要用途</td><td><strong>前向 / 权重 / 激活</strong></td><td><strong>反向梯度</strong></td></tr></tbody></table><p>为什么训练要两种?</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Forward pass 时:</span></span>
<span class="line"><span>  权重 W,激活 X 的数值范围一般在 [-10, +10] 内,稀少 outlier 到 ±100</span></span>
<span class="line"><span>  → 用 E4M3,精度优先,动态范围 ±448 足够</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>Backward pass 时:</span></span>
<span class="line"><span>  梯度 dW = X^T @ dY,经过链式法则后数值范围可能跨 6-8 个数量级</span></span>
<span class="line"><span>  从 1e-7 到 1e+2 都可能出现</span></span>
<span class="line"><span>  → 用 E5M2,范围优先,精度可以低一些(梯度本来就要平均掉)</span></span></code></pre></div><p><strong>单一格式做不到「权重小但梯度跨度大」</strong>——这是 NVIDIA 引入两种 FP8 格式的工程理由。</p><hr><h2 id="四、fp8-训练-混合精度怎么混" tabindex="-1">四、FP8 训练:混合精度怎么混 <a class="header-anchor" href="#四、fp8-训练-混合精度怎么混" aria-label="Permalink to &quot;四、FP8 训练:混合精度怎么混&quot;">​</a></h2><h3 id="_4-1-必画图-数值流" tabindex="-1">4.1 必画图:数值流 <a class="header-anchor" href="#_4-1-必画图-数值流" aria-label="Permalink to &quot;4.1 必画图:数值流&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                        FP8 训练一个 Transformer block 的数值流</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  ┌─────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>  │  主权重 (Master Weights)        BF16 / FP32       ┐         │</span></span>
<span class="line"><span>  │  存在显存,优化器更新它                              │ 不参与 │</span></span>
<span class="line"><span>  │                                                  │  GEMM  │</span></span>
<span class="line"><span>  │  Adam momentum / variance       FP32              │        │</span></span>
<span class="line"><span>  │  存在显存                                          ┘         │</span></span>
<span class="line"><span>  └─────────────────────────────────────────────────────────────┘</span></span>
<span class="line"><span>                              │</span></span>
<span class="line"><span>                              │ (每个 step 开始,cast 一份给计算)</span></span>
<span class="line"><span>                              ▼</span></span>
<span class="line"><span>  ┌─────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>  │  计算权重 W                      FP8 E4M3                    │</span></span>
<span class="line"><span>  │  (主权重 BF16 cast 到 FP8 + per-tensor scale)                │</span></span>
<span class="line"><span>  └─────────────────────────────────────────────────────────────┘</span></span>
<span class="line"><span>                              │</span></span>
<span class="line"><span>       Forward:               ▼</span></span>
<span class="line"><span>         X (激活,FP8 E4M3)</span></span>
<span class="line"><span>                │</span></span>
<span class="line"><span>                │  GEMM:Y = X @ W^T    输入 FP8,输出 FP32 (Tensor Core 累加)</span></span>
<span class="line"><span>                ▼</span></span>
<span class="line"><span>              Y_fp32  →→→  cast 回 FP8 E4M3  (per-tensor 重新 scale)</span></span>
<span class="line"><span>                                       │</span></span>
<span class="line"><span>                                       ▼</span></span>
<span class="line"><span>                                    下一层 X</span></span>
<span class="line"><span>                                       </span></span>
<span class="line"><span>       Backward:</span></span>
<span class="line"><span>         dY (梯度,FP8 E5M2)</span></span>
<span class="line"><span>                │</span></span>
<span class="line"><span>                │  GEMM:dX = dY @ W            FP8 输入,FP32 累加</span></span>
<span class="line"><span>                │  GEMM:dW = X^T @ dY          FP8 输入,FP32 累加</span></span>
<span class="line"><span>                ▼</span></span>
<span class="line"><span>              dX_fp32, dW_fp32</span></span>
<span class="line"><span>                │</span></span>
<span class="line"><span>                │  cast dX 回 FP8 E5M2</span></span>
<span class="line"><span>                │  dW 保留 BF16 / FP32(给 optimizer 用)</span></span>
<span class="line"><span>                ▼</span></span>
<span class="line"><span>              dW → 用来更新 master weight</span></span>
<span class="line"><span>              </span></span>
<span class="line"><span>  关键不变量:</span></span>
<span class="line"><span>    GEMM 输入永远是 FP8;累加器永远是 FP32;权重更新永远在 BF16/FP32</span></span>
<span class="line"><span>    一句话:FP8 只在「数据流过 Tensor Core 的那一瞬间」</span></span></code></pre></div><h3 id="_4-2-master-weights-必须更高精度" tabindex="-1">4.2 Master Weights 必须更高精度 <a class="header-anchor" href="#_4-2-master-weights-必须更高精度" aria-label="Permalink to &quot;4.2 Master Weights 必须更高精度&quot;">​</a></h3><p>为什么不直接用 FP8 当主权重?</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Adam 更新公式(简化):</span></span>
<span class="line"><span>  W_new = W_old - lr × m / sqrt(v + eps)</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  典型情况:</span></span>
<span class="line"><span>    lr = 1e-4</span></span>
<span class="line"><span>    m / sqrt(v) ≈ 0.1</span></span>
<span class="line"><span>    更新量 = 1e-5</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  W_old 大小 ≈ 0.1</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  如果 W 用 FP8 E4M3,精度大约是数值的 1/8(尾数 3 位)</span></span>
<span class="line"><span>    → 0.1 附近最小可分辨增量 ≈ 0.0125</span></span>
<span class="line"><span>    → 1e-5 的更新加上去后,W 完全没变化!</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  W 必须 BF16 或 FP32,update 才能积累。</span></span></code></pre></div><p><strong>这是「混合精度」的本质</strong>:<strong>算的时候用低精度赚速度,存的时候用高精度保更新积累</strong>。</p><h3 id="_4-3-scaling-策略-per-tensor-还是-per-channel" tabindex="-1">4.3 Scaling 策略:per-tensor 还是 per-channel <a class="header-anchor" href="#_4-3-scaling-策略-per-tensor-还是-per-channel" aria-label="Permalink to &quot;4.3 Scaling 策略:per-tensor 还是 per-channel&quot;">​</a></h3><p>FP8 的最大值是 ±448,但激活 outlier 可能到 ±200——直接把激活塞进 FP8 大概率溢出。所以每个张量都要算一个 scale:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>量化:  x_fp8 = clamp( x / scale,  -448,  +448 )</span></span>
<span class="line"><span>反量化:x = x_fp8 × scale</span></span></code></pre></div><p>scale 怎么选?三种主流策略:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. Per-tensor Scaling(主流)</span></span>
<span class="line"><span>   每个张量一个 scale,粒度粗,kernel 简单</span></span>
<span class="line"><span>   公式:scale = amax(|x|) / 448</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>2. Per-channel Scaling</span></span>
<span class="line"><span>   每个输出通道一个 scale,精度更高,kernel 复杂</span></span>
<span class="line"><span>   常用于权重(权重是静态的,可以离线算好)</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>3. Per-token Scaling</span></span>
<span class="line"><span>   激活的每个 token 一个 scale,精度最高</span></span>
<span class="line"><span>   FP8 训练目前少用,KV 量化(23 篇)主用</span></span></code></pre></div><h3 id="_4-4-delayedscaling-为什么不能直接用当前-tensor-的-max" tabindex="-1">4.4 DelayedScaling:为什么不能直接用当前 tensor 的 max <a class="header-anchor" href="#_4-4-delayedscaling-为什么不能直接用当前-tensor-的-max" aria-label="Permalink to &quot;4.4 DelayedScaling:为什么不能直接用当前 tensor 的 max&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Just-in-time Scaling 的问题:</span></span>
<span class="line"><span>   要 cast x 到 FP8,先算 max(|x|),再用它做 scale</span></span>
<span class="line"><span>   但算 max(|x|) 需要一次全 tensor 扫描,跟 cast 是两个 kernel</span></span>
<span class="line"><span>   开销大,GEMM 之外的额外延迟可观</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>DelayedScaling(NVIDIA Transformer Engine 的方案):</span></span>
<span class="line"><span>   不用「当前 tensor 的 max」,用「过去 N 个 step 的 max 历史」</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   滑动窗口:</span></span>
<span class="line"><span>   amax_history = [amax_0, amax_1, ..., amax_N]</span></span>
<span class="line"><span>   scale = max(amax_history) / 448</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   优点:cast 和 GEMM 可以并行,无额外扫描</span></span>
<span class="line"><span>   缺点:遇到突发 outlier 会瞬间溢出</span></span>
<span class="line"><span>        → 配合 amax 更新策略:每 step 记录当前 amax,但用上一步的 scale</span></span></code></pre></div><p>工程上:<strong>前 1000 step 用 just-in-time,稳定后切到 DelayedScaling</strong>。</p><hr><h2 id="五、transformer-engine-把这些封装起来" tabindex="-1">五、Transformer Engine:把这些封装起来 <a class="header-anchor" href="#五、transformer-engine-把这些封装起来" aria-label="Permalink to &quot;五、Transformer Engine:把这些封装起来&quot;">​</a></h2><p>NVIDIA 的 Transformer Engine(TE)是 H100 FP8 训练的事实标准库,封装了上面所有细节。一段最小训练代码:</p><div class="language-python vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">python</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">import</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> torch</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">import</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> torch.nn </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">as</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> nn</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">import</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> transformer_engine.pytorch </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">as</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> te</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">from</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> transformer_engine.common.recipe </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">import</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> Format, DelayedScaling</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 把 nn.Linear 换成 te.Linear,内部自动走 FP8 GEMM</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">class</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> MyBlock</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">nn</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">Module</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">):</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    def</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> __init__</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(self, d):</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        super</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">().</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">__init__</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">()</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">        # 不要写 nn.Linear,写 te.Linear</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.fc1 </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> te.Linear(d, </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">4</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">*</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">d)</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.fc2 </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> te.Linear(</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">4</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">*</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">d, d)</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">        # te.LayerNorm / te.LayerNormLinear 也都有 FP8 版本</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.ln  </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> te.LayerNorm(d)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    </span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    def</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> forward</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(self, x):</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">        return</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.fc2(torch.nn.functional.gelu(</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.fc1(</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.ln(x))))</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">model </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> MyBlock(</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">d</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">8192</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">).cuda()</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">optimizer </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> torch.optim.AdamW(model.parameters(), </span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">lr</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">1e-4</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># FP8 recipe 定义:E4M3 (forward) + E5M2 (backward)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">fp8_recipe </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> DelayedScaling(</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    fp8_format</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">Format.</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">HYBRID</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,    </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># forward E4M3, backward E5M2</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    amax_history_len</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">16</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,         </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 16 步滑窗</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    amax_compute_algo</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;max&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,     </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 取窗口内最大值</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 训练循环</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">for</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> step, batch </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">in</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> enumerate</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(loader):</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    x </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> batch.cuda()</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    </span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # 关键:用 fp8_autocast 上下文管理器</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    with</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> te.fp8_autocast(</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">enabled</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">True</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">fp8_recipe</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">fp8_recipe):</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        out </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> model(x)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        loss </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> out.mean()       </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 替成你的真实 loss</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    </span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    loss.backward()             </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># backward 也自动 FP8(梯度走 E5M2)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    optimizer.step()</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    optimizer.zero_grad()</span></span></code></pre></div><p><strong>只换三个东西</strong>:<code>nn.Linear</code> → <code>te.Linear</code>、<code>nn.LayerNorm</code> → <code>te.LayerNorm</code>、用 <code>te.fp8_autocast</code> 包 forward。整套 Adam / 主权重 / scale 维护都内部搞定。</p><hr><h2 id="六、训练侧的工程坑" tabindex="-1">六、训练侧的工程坑 <a class="header-anchor" href="#六、训练侧的工程坑" aria-label="Permalink to &quot;六、训练侧的工程坑&quot;">​</a></h2><h3 id="_6-1-收敛性-大模型偶尔发散" tabindex="-1">6.1 收敛性:大模型偶尔发散 <a class="header-anchor" href="#_6-1-收敛性-大模型偶尔发散" aria-label="Permalink to &quot;6.1 收敛性:大模型偶尔发散&quot;">​</a></h3><p>实际跑大模型(70B+)FP8 训练经常遇到:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>loss 曲线:</span></span>
<span class="line"><span>   2.5 ─────────────●●●●●                              </span></span>
<span class="line"><span>                        ●●●●                            ← 正常下降</span></span>
<span class="line"><span>   2.0 ─────────────────────●●●●                       </span></span>
<span class="line"><span>                                ●●                      </span></span>
<span class="line"><span>   1.5 ─────────────────────────●                       </span></span>
<span class="line"><span>                                  ●                     </span></span>
<span class="line"><span>   1.0 ───────────────────────────                      </span></span>
<span class="line"><span>                                   ●                    ← 突然跳到 inf!</span></span>
<span class="line"><span>   inf ────────────────────────────●●●●●●●●●            </span></span>
<span class="line"><span>                                    (loss spike,FP8 溢出 / 梯度爆)</span></span></code></pre></div><p>主要原因:</p><ul><li>某些层激活 outlier 突然变大,scale 跟不上</li><li>梯度链路某一段 E5M2 表示不下</li><li>Optimizer 状态被污染</li></ul><p>工程做法:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 监控 amax 历史,某层连续几步爆炸 → 该层 fallback 到 BF16</span></span>
<span class="line"><span>2. 关键层(embedding、final layer norm、output projection)强制 BF16</span></span>
<span class="line"><span>3. 设置 NaN/Inf 检查,出现就 skip 这个 step 或 rollback 到上一个 checkpoint</span></span>
<span class="line"><span>4. Loss scaling(参考下一节)</span></span></code></pre></div><h3 id="_6-2-gradscaler-loss-scaling-还需要吗" tabindex="-1">6.2 GradScaler / loss scaling 还需要吗 <a class="header-anchor" href="#_6-2-gradscaler-loss-scaling-还需要吗" aria-label="Permalink to &quot;6.2 GradScaler / loss scaling 还需要吗&quot;">​</a></h3><p>PyTorch AMP 时代,FP16 需要 GradScaler 防止小梯度 underflow:</p><div class="language-python vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">python</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># FP16 时代必备</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">scaler </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> torch.cuda.amp.GradScaler()</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">loss </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> scaler.scale(loss)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">loss.backward()</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">scaler.step(optimizer)</span></span></code></pre></div><p><strong>FP8 训练时,不需要这个</strong>——因为 TE 内部已经做了 per-tensor scaling,梯度走 E5M2 有 ±57344 的范围,基本碰不到 underflow。</p><p><strong>BF16 训练也不需要 GradScaler</strong>(BF16 范围跟 FP32 一样大)——这点跟 FP16 不同。</p><h3 id="_6-3-与-zero-fsdp-megatron-的集成成熟度" tabindex="-1">6.3 与 ZeRO / FSDP / Megatron 的集成成熟度 <a class="header-anchor" href="#_6-3-与-zero-fsdp-megatron-的集成成熟度" aria-label="Permalink to &quot;6.3 与 ZeRO / FSDP / Megatron 的集成成熟度&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>框架                 FP8 集成状态(2026)</span></span>
<span class="line"><span>────────             ────────────────────</span></span>
<span class="line"><span>Megatron-LM         成熟,3D 并行全支持 FP8,生产首选</span></span>
<span class="line"><span>DeepSpeed ZeRO      ZeRO-1/2/3 都支持,ZeRO-3 + FP8 有特殊处理(参数 cast)</span></span>
<span class="line"><span>PyTorch FSDP        FSDP2 原生支持 TE 模块,FSDP1 需要包装</span></span>
<span class="line"><span>NeMo                NVIDIA 自家,默认 FP8</span></span>
<span class="line"><span>HuggingFace TRL     SFT/DPO 都有 FP8 选项,但默认 BF16</span></span></code></pre></div><p><strong>坑点</strong>:ZeRO-3 + FP8 时,参数从其他卡 gather 回来要 BF16 形态,然后再 cast 到 FP8 算 —— <strong>gather 量没省</strong>,只省了 GEMM 时间。FSDP2 处理更好(直接 gather FP8 + scale)。</p><hr><h2 id="七、fp8-推理" tabindex="-1">七、FP8 推理 <a class="header-anchor" href="#七、fp8-推理" aria-label="Permalink to &quot;七、FP8 推理&quot;">​</a></h2><p>推理侧的 FP8 比训练侧简单——没有 backward、没有 master weights、没有梯度。</p><h3 id="_7-1-三个东西分别量化" tabindex="-1">7.1 三个东西分别量化 <a class="header-anchor" href="#_7-1-三个东西分别量化" aria-label="Permalink to &quot;7.1 三个东西分别量化&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>权重 W (Weights):</span></span>
<span class="line"><span>  离线一次性把 BF16/FP16 权重转 FP8</span></span>
<span class="line"><span>  存盘就是 FP8,加载到显存也是 FP8</span></span>
<span class="line"><span>  减半显存,等同权重量化的 50% 收益</span></span>
<span class="line"><span></span></span>
<span class="line"><span>激活 X (Activations):</span></span>
<span class="line"><span>  动态量化,每次 forward 时用 per-tensor 或 per-token scale</span></span>
<span class="line"><span>  减半显存搬运,等同算力 2 倍</span></span>
<span class="line"><span></span></span>
<span class="line"><span>KV Cache (K, V):</span></span>
<span class="line"><span>  Decode 阶段持续累加的状态,长上下文里占用比权重还大</span></span>
<span class="line"><span>  量化 KV 是「免费降本最大单点」(23 篇展开)</span></span></code></pre></div><h3 id="_7-2-一张表-同模型-bf16-vs-fp8" tabindex="-1">7.2 一张表:同模型 BF16 vs FP8 <a class="header-anchor" href="#_7-2-一张表-同模型-bf16-vs-fp8" aria-label="Permalink to &quot;7.2 一张表:同模型 BF16 vs FP8&quot;">​</a></h3><p>以 Llama-3-70B、单 H100 80GB × 8、batch=32、context=4K 为例:</p><table tabindex="0"><thead><tr><th></th><th>BF16 推理</th><th>FP8 推理(W+A+KV)</th></tr></thead><tbody><tr><td>权重</td><td>140 GB</td><td>70 GB</td></tr><tr><td>KV(32 并发 × 4K)</td><td>42 GB</td><td>21 GB</td></tr><tr><td>总显存</td><td>~190 GB</td><td>~95 GB</td></tr><tr><td>Decode 速度(单请求)</td><td>~50 tok/s</td><td>~85 tok/s</td></tr><tr><td>整体吞吐(QPS × 平均 token)</td><td>~1.0×</td><td>~1.8×</td></tr><tr><td>下游精度(MMLU 等)</td><td>100%</td><td>98.5-99.5%</td></tr><tr><td>长上下文检索(needle-in-haystack)</td><td>100%</td><td>95-98%(KV FP8 时)</td></tr></tbody></table><p><strong>收益非常实在</strong>:1.8 倍吞吐 + 显存对半,精度损失 1-2%。生产决策一般直接选 FP8。</p><h3 id="_7-3-vllm-sglang-trt-llm-的支持" tabindex="-1">7.3 vLLM / SGLang / TRT-LLM 的支持 <a class="header-anchor" href="#_7-3-vllm-sglang-trt-llm-的支持" aria-label="Permalink to &quot;7.3 vLLM / SGLang / TRT-LLM 的支持&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>vLLM (2024+):</span></span>
<span class="line"><span>  --quantization fp8                # 权重 FP8</span></span>
<span class="line"><span>  --kv-cache-dtype fp8              # KV Cache FP8 (默认 E4M3)</span></span>
<span class="line"><span>  支持 FP8 checkpoint 直接加载</span></span>
<span class="line"><span></span></span>
<span class="line"><span>SGLang:</span></span>
<span class="line"><span>  --quantization fp8_e4m3</span></span>
<span class="line"><span>  --kv-cache-dtype fp8_e5m2</span></span>
<span class="line"><span>  也支持权重 + KV 双 FP8</span></span>
<span class="line"><span></span></span>
<span class="line"><span>TRT-LLM:</span></span>
<span class="line"><span>  build 时 --use_fp8,kernel 级融合更深</span></span>
<span class="line"><span>  Hopper 上比 vLLM/SGLang 再快 10-30%(场景而定)</span></span></code></pre></div><p><strong>最小的 vLLM 启动示例</strong>:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">vllm</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> serve</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> meta-llama/Meta-Llama-3-70B-Instruct</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --quantization</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> fp8</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --kv-cache-dtype</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> fp8</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --tensor-parallel-size</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 4</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --max-model-len</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 8192</span></span></code></pre></div><hr><h2 id="八、其他格式与选型" tabindex="-1">八、其他格式与选型 <a class="header-anchor" href="#八、其他格式与选型" aria-label="Permalink to &quot;八、其他格式与选型&quot;">​</a></h2><h3 id="_8-1-b100-b200-fp4-fp6-的方向" tabindex="-1">8.1 B100 / B200:FP4 / FP6 的方向 <a class="header-anchor" href="#_8-1-b100-b200-fp4-fp6-的方向" aria-label="Permalink to &quot;8.1 B100 / B200:FP4 / FP6 的方向&quot;">​</a></h3><p>2024 年 NVIDIA Blackwell 进一步推:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>B200 (Blackwell):</span></span>
<span class="line"><span>  FP4(2 位指数 + 1 位尾数,或 3+0 变体)</span></span>
<span class="line"><span>  FP6(3 位指数 + 2 位尾数)</span></span>
<span class="line"><span>  NVLink 5(1.8 TB/s),HBM3e 192GB</span></span>
<span class="line"><span>  FP4 算力 ≈ FP8 的 2 倍</span></span>
<span class="line"><span></span></span>
<span class="line"><span>FP4 现状(2026):</span></span>
<span class="line"><span>  推理:已跑通(Llama-3, DeepSeek 等),精度损失 2-4%</span></span>
<span class="line"><span>        权重 FP4 + 激活 FP8/FP6 混合方案最稳</span></span>
<span class="line"><span>        微软 MX-FP4 加 block-scaling 精度回收一些</span></span>
<span class="line"><span>  训练:小模型可行,70B+ 尚未稳定生产</span></span></code></pre></div><p><strong>FP4 推理是 2026 降本的下一个浪头</strong>:1T 参数模型 FP4 大约 256GB,8 卡 B200 一节点装下。精度回退比 FP8 明显,混合精度策略要更细。</p><h3 id="_8-2-选型表-什么时候用什么" tabindex="-1">8.2 选型表:什么时候用什么 <a class="header-anchor" href="#_8-2-选型表-什么时候用什么" aria-label="Permalink to &quot;8.2 选型表:什么时候用什么&quot;">​</a></h3><table tabindex="0"><thead><tr><th>场景</th><th>推荐格式</th></tr></thead><tbody><tr><td>H100/H200/B200 训练</td><td>FP8 (E4M3 + E5M2 hybrid)</td></tr><tr><td>H100/H200/B200 推理</td><td>FP8 权重 + FP8 KV</td></tr><tr><td>A100 / 4090 / 消费级</td><td>INT8 / GPTQ-INT4(无 FP8 Tensor Core)</td></tr><tr><td>极致权重压缩</td><td>GPTQ-INT4 / AWQ-INT4(21 篇)</td></tr><tr><td>嵌入式 / 手机 NPU</td><td>INT8</td></tr><tr><td>B200 上 1T+ 模型一节点装下</td><td>FP4 权重 + FP8 KV(混合)</td></tr><tr><td>长上下文 needle 任务</td><td>FP8(KV INT4 会丢细节)</td></tr></tbody></table><p><strong>一个简单原则</strong>:有 FP8 硬件就先 FP8,FP8 跑不动再考虑 FP4 / INT4 极限压缩。</p><hr><h2 id="九、看完这一篇-你应该能" tabindex="-1">九、看完这一篇,你应该能 <a class="header-anchor" href="#九、看完这一篇-你应该能" aria-label="Permalink to &quot;九、看完这一篇,你应该能&quot;">​</a></h2><ul><li>解释 FP8 vs INT8 的根本差异(浮点 vs 定点,LLM outlier 让 FP8 更稳)</li><li>默写 E4M3 vs E5M2 的分工(前向 / 反向)及背后的数值范围理由</li><li>画 FP8 训练的数值流图:master weights BF16 → GEMM FP8 → 累加 FP32 → 回写 BF16</li><li>解释为什么主权重必须 BF16 / FP32(Adam 更新积累)</li><li>说出 DelayedScaling 是怎么回事,以及它解决的 just-in-time scaling 性能问题</li><li>用 <code>te.Linear</code> + <code>te.fp8_autocast</code> 改写一段 BF16 训练代码</li><li>列出 FP8 训练的几个典型坑(loss spike、ZeRO-3 gather 量没省、关键层 fallback BF16)</li><li>看到 <code>--quantization fp8 --kv-cache-dtype fp8</code> 知道它各自量化了什么、省了什么</li></ul><p>下一篇:<strong>23 KV Cache 量化</strong> — 上面提到 KV FP8 是「免费降本最大单点」,这一篇展开:为什么 KV 必须 per-token 量化、FP8 / INT8 / INT4 KV 在长上下文场景各自的精度回退、与 PagedAttention 的 kernel 集成、vLLM 的 <code>--kv-cache-dtype</code> 背后发生了什么。</p>`,88)])])}const g=a(l,[["render",e]]);export{o as __pageData,g as default};
