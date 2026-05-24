import{c as a,Q as n,j as p,m as i}from"./chunks/framework.Bhbi9jCp.js";const k=JSON.parse('{"title":"浮点格式全景:精度、范围、显存的三角","description":"","frontmatter":{},"headers":[],"relativePath":"aiInfraLearning/04-浮点格式全景.md","filePath":"aiInfraLearning/04-浮点格式全景.md","lastUpdated":1778649484000}'),l={name:"aiInfraLearning/04-浮点格式全景.md"};function e(t,s,h,o,r,c){return n(),p("div",null,[...s[0]||(s[0]=[i(`<h1 id="浮点格式全景-精度、范围、显存的三角" tabindex="-1">浮点格式全景:精度、范围、显存的三角 <a class="header-anchor" href="#浮点格式全景-精度、范围、显存的三角" aria-label="Permalink to &quot;浮点格式全景:精度、范围、显存的三角&quot;">​</a></h1><p>LLM Infra 的所有优化最终都要回答一个问题:这个数用几位存,用什么格式存。每砍一半精度,显存砍半、HBM 带宽利用率翻倍、Tensor Core 算力翻倍——这是 LLM 工程链上唯一一个能&quot;一刀三吃&quot;的杠杆。所以 FP32 → FP16 → BF16 → FP8 → INT4 这条路不是炫技,是过去十年把模型从 BERT 推到 405B 的经济学基础。这一篇把每个格式的位分布、表达范围、精度损失、硬件支持画清楚,后面 14 / 22 / 23 篇讲 ZeRO / FP8 训练 / KV 量化时,所有结论都站在这一篇上。</p><blockquote><p>一句话先记住:<strong>FP32 占 4 字节、FP16/BF16 占 2、FP8 占 1、INT4 占 0.5;同样 16 位,FP16 多 3 位精度但少 5 位指数,BF16 反之——训练用 BF16 是因为指数范围决定数值稳定;FP8 必须区分 E4M3(forward,精度高)和 E5M2(backward,范围大);INT8/INT4 是定点数,要 scale + zero point,本质和浮点不是一种东西</strong>。</p></blockquote><hr><h2 id="一、为什么浮点格式是-llm-infra-第一道选型" tabindex="-1">一、为什么浮点格式是 LLM Infra 第一道选型 <a class="header-anchor" href="#一、为什么浮点格式是-llm-infra-第一道选型" aria-label="Permalink to &quot;一、为什么浮点格式是 LLM Infra 第一道选型&quot;">​</a></h2><p>把&quot;格式占几位&quot;这件事的工程后果摆出来:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>70B 模型权重在不同格式下的显存:</span></span>
<span class="line"><span>  FP32:  70B × 4 bytes = 280 GB</span></span>
<span class="line"><span>  FP16:  70B × 2 bytes = 140 GB</span></span>
<span class="line"><span>  BF16:  70B × 2 bytes = 140 GB</span></span>
<span class="line"><span>  FP8:   70B × 1 byte  =  70 GB</span></span>
<span class="line"><span>  INT4:  70B × 0.5 byte = 35 GB</span></span></code></pre></div><p>70B FP32 四张 H100 都装不下,FP16 装两张,FP8 装一张,INT4 一张装下还有富余。<strong>显存这一刀直接决定能不能上线、要几张卡、每千 token 成本是多少</strong>。</p><p>但显存不是唯一收益。Tensor Core 算力天然按位宽分梯度:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>H100 SXM Tensor Core 峰值 (TFLOPS):</span></span>
<span class="line"><span>  FP32 (TF32):        ~ 989</span></span>
<span class="line"><span>  FP16 / BF16:        ~ 1979</span></span>
<span class="line"><span>  FP8:                ~ 3958</span></span>
<span class="line"><span>  INT8:               ~ 3958      (与 FP8 同档)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>B200 SXM Tensor Core 峰值 (TFLOPS):</span></span>
<span class="line"><span>  BF16:               ~ 4500</span></span>
<span class="line"><span>  FP8:                ~ 9000</span></span>
<span class="line"><span>  FP4:                ~ 18000</span></span></code></pre></div><p><strong>位宽砍半 = 算力翻倍</strong>——Tensor Core 硅面积固定,位宽越窄同样面积塞下越多乘加单元。这是 NVIDIA 从 V100 到 B200 一路推低位的原因。</p><p>第三层是带宽。02 / 03 篇已经讲过,decode 阶段每生成一个 token 都要把整个模型权重从 HBM 读一遍,memory-bound;<strong>砍半 byte 直接砍半搬运时间,decode 吞吐翻倍</strong>。</p><p>合起来一句话:<strong>每砍一半精度 = 一倍显存 + 一倍带宽 + 一倍算力</strong>。任何不优先讨论&quot;我用什么格式&quot;的 LLM 优化都是在小修小补。</p><hr><h2 id="二、ieee-754-一句话回顾" tabindex="-1">二、IEEE 754 一句话回顾 <a class="header-anchor" href="#二、ieee-754-一句话回顾" aria-label="Permalink to &quot;二、IEEE 754 一句话回顾&quot;">​</a></h2><p>任何浮点数都是三段:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>任意浮点数 = (-1)^sign × 1.mantissa × 2^(exponent - bias)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  sign:      1 位,正负号</span></span>
<span class="line"><span>  exponent:  E 位,决定能表达的数的范围(2 的几次方)</span></span>
<span class="line"><span>  mantissa:  M 位,决定有效数字精度</span></span>
<span class="line"><span>  bias:      指数偏移,让 exponent 能表达正负幂</span></span></code></pre></div><p>总位数 = <code>1 + E + M</code>。所有&quot;FP-X / BF-X / FP-Y&quot;格式的差异<strong>全在 E 和 M 怎么分</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>FP32:       1 + 8 + 23 = 32 位</span></span>
<span class="line"><span>FP16:       1 + 5 + 10 = 16 位</span></span>
<span class="line"><span>BF16:       1 + 8 +  7 = 16 位</span></span>
<span class="line"><span>FP8 E4M3:   1 + 4 +  3 = 8 位</span></span>
<span class="line"><span>FP8 E5M2:   1 + 5 +  2 = 8 位</span></span>
<span class="line"><span>FP4 E2M1:   1 + 2 +  1 = 4 位</span></span></code></pre></div><p><strong>E 决定范围,M 决定精度</strong>,记住这两条就够。</p><hr><h2 id="三、fp16-vs-bf16-同-16-位-完全不同的取舍" tabindex="-1">三、FP16 vs BF16:同 16 位,完全不同的取舍 <a class="header-anchor" href="#三、fp16-vs-bf16-同-16-位-完全不同的取舍" aria-label="Permalink to &quot;三、FP16 vs BF16:同 16 位,完全不同的取舍&quot;">​</a></h2><p>放到一张图里看:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                  Sign   Exponent (E)        Mantissa (M)</span></span>
<span class="line"><span>FP32:             [ S | EEEE EEEE | MMMM MMMM MMMM MMMM MMM ]</span></span>
<span class="line"><span>                    1     8                  23</span></span>
<span class="line"><span></span></span>
<span class="line"><span>FP16:             [ S | EEEEE | MMMM MMMM MM ]</span></span>
<span class="line"><span>                    1    5         10</span></span>
<span class="line"><span></span></span>
<span class="line"><span>BF16:             [ S | EEEE EEEE | MMMM MMM ]</span></span>
<span class="line"><span>                    1     8           7</span></span></code></pre></div><p>BF16 的设计意图是&quot;砍掉一半 mantissa,但保留 FP32 的全部指数位&quot;。指数位决定能表达的数值上下界,FP32 / BF16 同为 8 位,意味着两者<strong>能表达的数值上下界一致</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                       能表达的最小正规数      能表达的最大数      尾数位数</span></span>
<span class="line"><span>FP32 (8E, 23M):        ~ 1.2e-38            ~ 3.4e+38         23 (≈ 7 位十进制)</span></span>
<span class="line"><span>FP16 (5E, 10M):        ~ 6.1e-5             ~ 65504           10 (≈ 3-4 位十进制)</span></span>
<span class="line"><span>BF16 (8E, 7M):         ~ 1.2e-38            ~ 3.4e+38          7 (≈ 2-3 位十进制)</span></span></code></pre></div><p>为什么训练默认 BF16 而不是 FP16?<strong>因为训练里梯度经常很小</strong>(1e-6 ~ 1e-10),loss scaling 也压不住所有情况;FP16 最小数 6.1e-5,梯度一旦下溢直接归零,反向传播失效。<strong>BF16 最小数和 FP32 一致,根本不需要 loss scaling 这种 hack</strong>。</p><p>代价是 mantissa 只有 7 位,数值近似误差比 FP16 大。但训练里这点误差被反向传播反复累积,反而被优化器自己吸收(动量平滑 + 大量样本平均)。<strong>对静态精度敏感的少数算子(LayerNorm 累加、Softmax)单独提到 FP32 处理就够</strong>——这就是 Hopper 之前业界共识&quot;训练 BF16,关键算子 FP32 累加&quot;的来历。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>经验法则:</span></span>
<span class="line"><span>  训练:                  默认 BF16,梯度永远不下溢</span></span>
<span class="line"><span>  推理:                  BF16 / FP16 都行(只 forward,不会下溢)</span></span>
<span class="line"><span>                         FP16 显存带宽和 BF16 一样,精度稍好,推理稍占优</span></span>
<span class="line"><span>  关键累加 (LN, Softmax): 永远 FP32 累加,BF16 / FP16 输出</span></span></code></pre></div><p>A100 之前(V100)只有 FP16 没有 BF16,训练必须 FP16 + loss scaling,稳定性长期是个心智负担。Ampere(A100)开始原生支持 BF16,业界一年内全部切过去。</p><hr><h2 id="四、fp8-e4m3-与-e5m2-必须分开记" tabindex="-1">四、FP8:E4M3 与 E5M2 必须分开记 <a class="header-anchor" href="#四、fp8-e4m3-与-e5m2-必须分开记" aria-label="Permalink to &quot;四、FP8:E4M3 与 E5M2 必须分开记&quot;">​</a></h2><p>Hopper(H100)起原生支持 FP8。FP8 不是一种格式而是两种,因为 8 位太窄,无法同时兼顾范围和精度:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>FP8 E4M3:  [ S | EEEE | MMM ]    1 + 4 + 3 = 8 位</span></span>
<span class="line"><span>                范围 ≈ ± 448</span></span>
<span class="line"><span>                最小正规数 ≈ 2^-6 ≈ 0.0156</span></span>
<span class="line"><span>                精度:3 位 mantissa,约 0.5 位十进制</span></span>
<span class="line"><span></span></span>
<span class="line"><span>FP8 E5M2:  [ S | EEEEE | MM ]    1 + 5 + 2 = 8 位</span></span>
<span class="line"><span>                范围 ≈ ± 57344  (约等于 FP16 范围)</span></span>
<span class="line"><span>                最小正规数 ≈ 2^-14 ≈ 6e-5</span></span>
<span class="line"><span>                精度:2 位 mantissa,极差</span></span></code></pre></div><p><strong>E4M3 精度高、范围小</strong>,<strong>E5M2 范围大、精度差</strong>。Hopper 同时硬件支持两者。</p><p>工程上分工很清晰:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Forward 路径(权重 × 激活):</span></span>
<span class="line"><span>   数值范围一般在 ±10 量级,精度更重要</span></span>
<span class="line"><span>   → 用 E4M3,搭配 per-tensor / per-channel scale 把范围拉进 ±448</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Backward 路径(梯度):</span></span>
<span class="line"><span>   梯度量级差异极大,有些极小有些极大,容不下精度损失大</span></span>
<span class="line"><span>   → 用 E5M2,牺牲精度换范围</span></span>
<span class="line"><span></span></span>
<span class="line"><span>主权重 + 优化器状态:</span></span>
<span class="line"><span>   仍然 FP32(精度敏感,占显存大但没办法)</span></span></code></pre></div><p>这个 E4M3 / E5M2 分工就是 NVIDIA Transformer Engine 的核心设计——22 篇展开。简单说:<strong>FP8 不是把整个网络换成 8 位,而是 GEMM 输入用 FP8、输出累加用 FP32、然后 cast 回 FP8/BF16</strong>。精度损失可控。</p><p>H100 FP8 算力是 BF16 两倍,且显存 / 带宽砍半,<strong>训练端到端 ~2x 加速,推理 1.5-2x</strong>。Hopper 之后业界训练默认混合精度从纯 BF16 迁到 BF16 + FP8 GEMM。</p><p>B200 把 FP4 也做进硬件(E2M1),思路类似:为 forward 设计精度版,为某些场景设计范围版。FP4 在 2026 主要用在推理量化,训练侧仍在试。</p><hr><h2 id="五、int8-int4-定点数-跟浮点不是一回事" tabindex="-1">五、INT8 / INT4:定点数,跟浮点不是一回事 <a class="header-anchor" href="#五、int8-int4-定点数-跟浮点不是一回事" aria-label="Permalink to &quot;五、INT8 / INT4:定点数,跟浮点不是一回事&quot;">​</a></h2><p>整数量化是另一套世界观。INT8 不是&quot;小一号的 FP8&quot;,是定点数:<strong>没有指数位,只能表达均匀分布的整数</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>INT8: 8 位有符号整数</span></span>
<span class="line"><span>   能表达 -128 到 127,共 256 个等距整数</span></span>
<span class="line"><span></span></span>
<span class="line"><span>怎么表达浮点?需要 scale 把浮点压到整数范围:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   real_value ≈ (int_value - zero_point) × scale</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   scale:        浮点(通常 FP16/FP32),&quot;一个整数代表多少浮点&quot;</span></span>
<span class="line"><span>   zero_point:   整数,&quot;哪个整数对应浮点 0&quot;</span></span>
<span class="line"><span>                 (对称量化时 zero_point = 0,可以省掉)</span></span></code></pre></div><p>举例:一个 [-2.5, 3.0] 的张量量化到 INT8:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>非对称量化:</span></span>
<span class="line"><span>  scale = (3.0 - (-2.5)) / 255 ≈ 0.0216</span></span>
<span class="line"><span>  zero_point = round(0 - (-2.5) / scale) = 116</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  浮点 0.5 → int = round(0.5 / 0.0216) + 116 = 23 + 116 = 139</span></span>
<span class="line"><span>  反量化 139 → (139 - 116) × 0.0216 = 0.497  (有舍入误差)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>对称量化(更常见,无 zero_point):</span></span>
<span class="line"><span>  scale = max(|−2.5|, |3.0|) / 127 ≈ 0.0236</span></span>
<span class="line"><span>  浮点 0.5 → int = round(0.5 / 0.0236) = 21</span></span>
<span class="line"><span>  反量化 21 → 21 × 0.0236 = 0.4956</span></span></code></pre></div><p><strong>INT 量化的核心问题</strong>:scale 和 zero_point 是按张量(per-tensor)、按通道(per-channel)、还是按组(per-group)算?粒度越细,精度越好,存 scale 的开销越大。这是 GPTQ / AWQ / SmoothQuant(21 篇)在调的核心参数。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                   FP8                       INT8</span></span>
<span class="line"><span>                   ────                      ────</span></span>
<span class="line"><span>表达形式            浮点(指数 + 尾数)         定点 + scale</span></span>
<span class="line"><span>能表达的范围        硬件固定(E4M3 ±448)      scale 决定(任意)</span></span>
<span class="line"><span>精度               固定 3 位 mantissa         在 [min, max] 范围内 256 个等距点</span></span>
<span class="line"><span>对离群值           容忍                       敏感(一个大数把 scale 拉爆)</span></span>
<span class="line"><span>硬件支持           Hopper 之后原生            Turing/Ampere 起原生</span></span>
<span class="line"><span>适用              训练 + 推理                 只用于推理(训练数值不稳)</span></span></code></pre></div><p><strong>INT4 / FP4 同理</strong>,只是位宽更窄、精度更敏感。INT4 通常配 group-wise scale(每 32 / 64 / 128 个权重共享一个 scale),否则精度直接崩。</p><p>经验:推理权重量化(GPTQ / AWQ)走 INT4 是甜点;FP8 是训练 + 推理通用;INT8 在端侧 / CPU / 移动端仍占主流,GPU 上正在被 FP8 替代。</p><hr><h2 id="六、各代-gpu-支持矩阵" tabindex="-1">六、各代 GPU 支持矩阵 <a class="header-anchor" href="#六、各代-gpu-支持矩阵" aria-label="Permalink to &quot;六、各代 GPU 支持矩阵&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                 FP64    FP32   TF32   BF16   FP16   FP8    INT8   FP4</span></span>
<span class="line"><span>V100 (Volta)      ✓       ✓     —      —      ✓ TC   —      —      —</span></span>
<span class="line"><span>A100 (Ampere)     ✓       ✓     ✓ TC   ✓ TC   ✓ TC   —      ✓ TC   —</span></span>
<span class="line"><span>H100 (Hopper)     ✓       ✓     ✓ TC   ✓ TC   ✓ TC   ✓ TC   ✓ TC   —</span></span>
<span class="line"><span>H200 (Hopper)     同 H100,显存 80→141 GB,无新格式</span></span>
<span class="line"><span>B100 (Blackwell)  ✓       ✓     ✓ TC   ✓ TC   ✓ TC   ✓ TC   ✓ TC   ✓ TC</span></span>
<span class="line"><span>B200 (Blackwell)  同 B100,更高频率 + NVLink5</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  TC = Tensor Core 加速(普通 SM 也能算,但快不到一档)</span></span>
<span class="line"><span>  ✓ = 原生支持(硬件指令)</span></span>
<span class="line"><span>  — = 不支持或软件模拟</span></span></code></pre></div><p>记忆要点:</p><ul><li><strong>A100 把 BF16 引入主线</strong> —— 训练稳定性的分水岭</li><li><strong>H100 把 FP8 引入主线</strong> —— 训练 + 推理都进 FP8 时代</li><li><strong>H200 = H100 + 加大显存</strong>(141 GB),无新格式</li><li><strong>B200 把 FP4 引入主线</strong> —— 为更大模型 + 更激进推理量化铺路</li></ul><p>A100 时代主流是 BF16 训练 + INT8/INT4 推理量化;H100 时代是 BF16 + FP8 GEMM 训练 + FP8/INT4 推理;B200 之后会是 FP8 训练 + FP4/INT4 推理。<strong>每一代都把&quot;能用的最低精度&quot;往下推一档</strong>。</p><hr><h2 id="七、表达范围-vs-精度-vs-显存-三角不可能三角" tabindex="-1">七、表达范围 vs 精度 vs 显存:三角不可能三角 <a class="header-anchor" href="#七、表达范围-vs-精度-vs-显存-三角不可能三角" aria-label="Permalink to &quot;七、表达范围 vs 精度 vs 显存:三角不可能三角&quot;">​</a></h2><p>三件事此消彼长,一图看完:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                精度 (mantissa)</span></span>
<span class="line"><span>                     ↑</span></span>
<span class="line"><span>                FP32 ●</span></span>
<span class="line"><span>                     │</span></span>
<span class="line"><span>                FP16 ●</span></span>
<span class="line"><span>                     │</span></span>
<span class="line"><span>                BF16 ●─────────────● FP8 E4M3</span></span>
<span class="line"><span>                     │</span></span>
<span class="line"><span>                     │            ● FP8 E5M2</span></span>
<span class="line"><span>                     │</span></span>
<span class="line"><span>                     │          ● FP4 E2M1</span></span>
<span class="line"><span>                     └──────────────────→ 范围 (exponent)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>                显存 ↘  (越往右下越省)</span></span></code></pre></div><ul><li><strong>训练</strong>:必须保证梯度不下溢,选范围大的(BF16 / FP8 E5M2 给 backward,FP8 E4M3 + scale 给 forward GEMM)</li><li><strong>推理 prefill</strong>:大 GEMM,精度影响明显,BF16 / FP16 / FP8 E4M3 都可以</li><li><strong>推理 decode 权重</strong>:对精度容忍度最高(每 token 只过一次),最适合极致量化(INT4 / FP4)</li><li><strong>KV Cache</strong>:跨步累积访问,精度损失会累积,FP8 是甜点;INT4 KV 在 32K 以上长上下文也开始普及(23 篇)</li></ul><p>实战栈汇总:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>2026 主流栈                训练                       推理</span></span>
<span class="line"><span>─────────                ────                       ────</span></span>
<span class="line"><span>A100 集群                BF16 + 关键算子 FP32        BF16 / FP16 + INT8/INT4 量化</span></span>
<span class="line"><span>H100 集群                BF16 + FP8 GEMM             BF16 / FP8 + INT4/FP8 KV</span></span>
<span class="line"><span>B200 集群                FP8 + FP16 累加              FP8 / FP4 + INT4/FP4 KV</span></span>
<span class="line"><span>端侧 (Mac / 4090 / 手机)  一般不在端侧训练            INT4 / INT8 (llama.cpp / MLC)</span></span></code></pre></div><hr><h2 id="八、工程经验-不要自己造混合精度方案" tabindex="-1">八、工程经验:不要自己造混合精度方案 <a class="header-anchor" href="#八、工程经验-不要自己造混合精度方案" aria-label="Permalink to &quot;八、工程经验:不要自己造混合精度方案&quot;">​</a></h2><p>混合精度训练有大量陷阱(梯度下溢、loss 爆炸、层间溢出、scale 选错),业界已经有成熟实现,<strong>不要手写</strong>:</p><div class="language-python vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">python</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># PyTorch 原生 AMP(BF16 推荐做法)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">from</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> torch.cuda.amp </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">import</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> autocast</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">for</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> batch </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">in</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> dataloader:</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    with</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> autocast(</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">dtype</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">torch.bfloat16):</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        loss </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> model(batch).loss</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    loss.backward()</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    optimizer.step()       </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># optimizer 仍 FP32</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    optimizer.zero_grad()</span></span></code></pre></div><div class="language-python vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">python</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Transformer Engine(FP8 训练,Hopper 之后)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">import</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> transformer_engine.pytorch </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">as</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> te</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">from</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> transformer_engine.common.recipe </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">import</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> DelayedScaling, Format</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">fp8_recipe </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> DelayedScaling(</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">fp8_format</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">Format.</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">HYBRID</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)  </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># forward E4M3, backward E5M2</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 把 nn.Linear 替换成 te.Linear</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">model </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> te.Sequential(</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    te.Linear(d, d, </span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">bias</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">False</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">),</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    te.LayerNorm(d),</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    te.Linear(d, d, </span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">bias</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">False</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">),</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">with</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> te.fp8_autocast(</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">enabled</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">True</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">fp8_recipe</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">fp8_recipe):</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    out </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> model(x)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    loss </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> loss_fn(out, target)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">loss.backward()</span></span></code></pre></div><p>推理侧不用自己决定权重格式——直接选已经量化好的 model:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Hugging Face 上常见的命名约定</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">meta-llama/Llama-3.1-70B-Instruct</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                # BF16 原版</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">meta-llama/Llama-3.1-70B-Instruct-FP8</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">            # FP8 量化</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">TheBloke/Llama-3.1-70B-Instruct-GPTQ</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">             # INT4 GPTQ</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">TheBloke/Llama-3.1-70B-Instruct-AWQ</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">              # INT4 AWQ</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">unsloth/Llama-3.1-70B-Instruct-GGUF</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">              # llama.cpp 用</span></span></code></pre></div><p>具体选哪个看 05 篇算账:<strong>显存够用就上 BF16,不够降到 FP8,FP8 还不够再上 INT4</strong>。精度损失 &lt;1% 时无脑降,&gt;3% 要警惕。</p><p>一些反复踩到的雷:</p><ol><li><strong>不要在 FP8 recipe 里把 forward 也设 E5M2</strong>——E5M2 精度差,前向 GEMM 会出现明显 loss 漂移</li><li><strong>LayerNorm / RMSNorm 的累加必须 FP32</strong>,否则数值不稳</li><li><strong>Embedding 表保持 BF16/FP32</strong>,FP8 量化 embedding 几乎都炸</li><li><strong>softmax 之前的 logits 用 FP32</strong>,attention scores cast 回低精度</li><li><strong>per-tensor scale 在 outlier 多的层(如 attention 的 K)会被拉爆</strong>,改 per-channel 或 SmoothQuant 平滑(21 篇)</li></ol><hr><h2 id="九、看完这一篇-你应该能" tabindex="-1">九、看完这一篇,你应该能 <a class="header-anchor" href="#九、看完这一篇-你应该能" aria-label="Permalink to &quot;九、看完这一篇,你应该能&quot;">​</a></h2><ul><li>默写 FP32 / FP16 / BF16 / FP8 (E4M3 / E5M2) / INT4 的位分布(sign + exponent + mantissa)</li><li>解释为什么训练默认 BF16 而不是 FP16(指数位决定数值稳定)</li><li>解释 FP8 E4M3 与 E5M2 的分工(forward / backward)</li><li>解释 INT8 / INT4 与浮点的根本区别(定点 + scale + zero_point)</li><li>看到一张 GPU 表能立刻判断&quot;我能用什么格式&quot;</li><li>给出模型规模和卡型,初步选格式(BF16 / FP8 / INT4)</li></ul><p>下一篇:<strong>05 LLM 算力账</strong> — 三个公式把&quot;一次推理多少 FLOPs / 一次训练多少卡天 / 一张卡能装多大模型&quot;算清楚,7B / 70B / 405B 在 A100 / H100 / H200 上能装下吗、KV 还能塞多少、每千 token 成本怎么估,一张大表全摆出来。</p>`,77)])])}const g=a(l,[["render",e]]);export{k as __pageData,g as default};
