import{_ as a,H as n,f as p,i as l}from"./chunks/framework.BHvCMIhP.js";const g=JSON.parse('{"title":"量化心智:PTQ、QAT、对称非对称、校准集、离群值","description":"","frontmatter":{},"headers":[],"relativePath":"../aiInfraLearning/20-量化心智.md","filePath":"../aiInfraLearning/20-量化心智.md","lastUpdated":1778649484000}'),e={name:"../aiInfraLearning/20-量化心智.md"};function t(i,s,c,r,h,o){return n(),p("div",null,[...s[0]||(s[0]=[l(`<h1 id="量化心智-ptq、qat、对称非对称、校准集、离群值" tabindex="-1">量化心智:PTQ、QAT、对称非对称、校准集、离群值 <a class="header-anchor" href="#量化心智-ptq、qat、对称非对称、校准集、离群值" aria-label="Permalink to &quot;量化心智:PTQ、QAT、对称非对称、校准集、离群值&quot;">​</a></h1><p>通信解决「卡之间怎么传」,量化解决「卡内怎么塞得下、跑得快」。<strong>砍一半精度等于省一半显存,等于翻倍带宽,等于翻倍吞吐</strong>——这是 LLM 部署降本最直接的杠杆。但精度不是白砍的,这一篇拉清楚精度从哪掉、怎么补、什么粒度合适,为 21 篇 GPTQ / AWQ / GGUF 三大方法铺底。</p><blockquote><p>一句话先记住:<strong>量化 = scale × 整数 + 偏移</strong>。两个轴:<strong>权重 vs 激活</strong>(只量权重最稳)、<strong>离线 vs 训练时</strong>(PTQ 主流,QAT 备选)。决定精度的是粒度(per-token / per-channel / per-group)和<strong>离群值</strong>——LLM 的 1% 激活离群值会把 per-tensor 量化拉伤,这是 SmoothQuant / AWQ 全部诞生的原因。</p></blockquote><hr><h2 id="一、为什么量化是降本第一手段" tabindex="-1">一、为什么量化是降本第一手段 <a class="header-anchor" href="#一、为什么量化是降本第一手段" aria-label="Permalink to &quot;一、为什么量化是降本第一手段&quot;">​</a></h2><h3 id="_1-1-一组数字账" tabindex="-1">1.1 一组数字账 <a class="header-anchor" href="#_1-1-一组数字账" aria-label="Permalink to &quot;1.1 一组数字账&quot;">​</a></h3><p>70B 模型一次推理(一个用户、单卡),不同精度的成本:</p><table tabindex="0"><thead><tr><th>精度</th><th>权重显存</th><th>单步带宽需求(读权重)</th><th>推理速度近似</th><th>1×H100 80GB</th></tr></thead><tbody><tr><td>FP32</td><td>280 GB</td><td>280 GB/step</td><td>慢</td><td><strong>塞不下</strong></td></tr><tr><td>BF16/FP16</td><td>140 GB</td><td>140 GB/step</td><td>baseline</td><td>塞不下</td></tr><tr><td>FP8</td><td>70 GB</td><td>70 GB</td><td>1.5-2×</td><td>塞下,KV 紧</td></tr><tr><td>INT8 / W8A8</td><td>70 GB</td><td>70 GB</td><td>1.5-2×</td><td>同上</td></tr><tr><td>INT4 (W4A16)</td><td>35 GB</td><td>35 GB</td><td>2-3×</td><td>舒适,KV 充裕</td></tr></tbody></table><p>为什么「砍精度 = 提吞吐」:02 篇讲过,LLM 推理是<strong>显存带宽受限</strong>,不是算力受限。每 step 都要把整套权重从 HBM 读一遍,读得越少越快。INT4 比 FP16 少读 4 倍,延迟差不多就降到 1/3。</p><h3 id="_1-2-推理-vs-训练的量化优先级" tabindex="-1">1.2 推理 vs 训练的量化优先级 <a class="header-anchor" href="#_1-2-推理-vs-训练的量化优先级" aria-label="Permalink to &quot;1.2 推理 vs 训练的量化优先级&quot;">​</a></h3><ul><li><strong>推理</strong>:量化优先级最高,80% 模型上线都是 INT8 / FP8 / INT4</li><li><strong>训练</strong>:量化代价大,主流仍是 BF16,FP8 训练 2024 后开始普及(详见 22 篇)</li></ul><p>这一篇主要讲推理量化心智——训练侧的 FP8 留 22 篇。</p><hr><h2 id="二、ptq-vs-qat" tabindex="-1">二、PTQ vs QAT <a class="header-anchor" href="#二、ptq-vs-qat" aria-label="Permalink to &quot;二、PTQ vs QAT&quot;">​</a></h2><h3 id="_2-1-两套路线" tabindex="-1">2.1 两套路线 <a class="header-anchor" href="#_2-1-两套路线" aria-label="Permalink to &quot;2.1 两套路线&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>PTQ (Post-Training Quantization)    QAT (Quantization-Aware Training)</span></span>
<span class="line"><span>─────────────────────────────       ────────────────────────────────</span></span>
<span class="line"><span>训练完之后,离线量化                  训练时就模拟量化,反向带量化误差</span></span>
<span class="line"><span>几小时搞定(7B 大约 1-4 小时)        训练成本翻几倍,数月级</span></span>
<span class="line"><span>不需要训练数据,只要少量校准样本      需要完整训练 pipeline 和数据</span></span>
<span class="line"><span>精度损失稍大                         精度损失极小</span></span>
<span class="line"><span>LLM 圈 90% 用 PTQ                   LLM 几乎不用 QAT</span></span>
<span class="line"><span>                                     (训练成本下不去)</span></span>
<span class="line"><span>                                     CV 小模型仍有用 QAT</span></span></code></pre></div><p><strong>为什么 LLM 不用 QAT</strong>:重新预训练一个 70B 太贵,PTQ 几小时就能出推理版本,精度损失也通常可控。<strong>未来如果有「原生 INT8 训练」流派,QAT 才会回到 LLM 视野</strong>——现在这条路是 FP8 训练在走(22 篇)。</p><h3 id="_2-2-ptq-的最简流程" tabindex="-1">2.2 PTQ 的最简流程 <a class="header-anchor" href="#_2-2-ptq-的最简流程" aria-label="Permalink to &quot;2.2 PTQ 的最简流程&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>原模型(FP16/BF16)</span></span>
<span class="line"><span>      │</span></span>
<span class="line"><span>      ▼</span></span>
<span class="line"><span>1. 准备校准集(128-1024 条样本即可)</span></span>
<span class="line"><span>      │</span></span>
<span class="line"><span>      ▼</span></span>
<span class="line"><span>2. 跑前向,记录每层激活的分布(min/max 或 percentile)</span></span>
<span class="line"><span>      │</span></span>
<span class="line"><span>      ▼</span></span>
<span class="line"><span>3. 计算每层 scale 和 zero point</span></span>
<span class="line"><span>      │</span></span>
<span class="line"><span>      ▼</span></span>
<span class="line"><span>4. 把权重按 scale 转成 INT8/INT4 存</span></span>
<span class="line"><span>      │</span></span>
<span class="line"><span>      ▼</span></span>
<span class="line"><span>5. 推理时:输入激活动态量化(或预先校准),</span></span>
<span class="line"><span>         算完反量化输出</span></span>
<span class="line"><span>      │</span></span>
<span class="line"><span>      ▼</span></span>
<span class="line"><span>量化模型(INT8/INT4 权重 + 推理 kernel)</span></span></code></pre></div><p>GPTQ / AWQ / SmoothQuant 都是 PTQ 的不同变种,差别在第 3-4 步怎么算 scale、怎么补偿误差。21 篇展开。</p><hr><h2 id="三、对称-vs-非对称" tabindex="-1">三、对称 vs 非对称 <a class="header-anchor" href="#三、对称-vs-非对称" aria-label="Permalink to &quot;三、对称 vs 非对称&quot;">​</a></h2><h3 id="_3-1-量化的数学定义" tabindex="-1">3.1 量化的数学定义 <a class="header-anchor" href="#_3-1-量化的数学定义" aria-label="Permalink to &quot;3.1 量化的数学定义&quot;">​</a></h3><p>把浮点 <code>x ∈ [α, β]</code> 映射到整数 <code>q ∈ [Q_min, Q_max]</code>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>对称量化(symmetric):</span></span>
<span class="line"><span>  x_max = max(|α|, |β|)</span></span>
<span class="line"><span>  scale = x_max / Q_max          (Q_max = 127 for INT8)</span></span>
<span class="line"><span>  q     = round(x / scale)</span></span>
<span class="line"><span>  反量化:x = q × scale</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  零点 = 0,只用一个标量,推理时 dequant 一次乘法</span></span>
<span class="line"><span></span></span>
<span class="line"><span></span></span>
<span class="line"><span>非对称量化(asymmetric / affine):</span></span>
<span class="line"><span>  scale       = (β - α) / (Q_max - Q_min)</span></span>
<span class="line"><span>  zero_point  = round(Q_min - α / scale)</span></span>
<span class="line"><span>  q           = round(x / scale + zero_point)</span></span>
<span class="line"><span>  反量化:x = (q - zero_point) × scale</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  零点 ≠ 0,要存 zero_point,dequant 多一次减法</span></span></code></pre></div><h3 id="_3-2-对比" tabindex="-1">3.2 对比 <a class="header-anchor" href="#_3-2-对比" aria-label="Permalink to &quot;3.2 对比&quot;">​</a></h3><table tabindex="0"><thead><tr><th></th><th>对称</th><th>非对称</th></tr></thead><tbody><tr><td>范围利用</td><td>浪费(数据偏一侧时)</td><td>充分</td></tr><tr><td>推理速度</td><td>快(无 zero_point)</td><td>慢(多一步减)</td></tr><tr><td>Kernel 实现</td><td>简单</td><td>复杂</td></tr><tr><td>适合</td><td>权重(分布通常对称)</td><td>激活(常常不对称,如 ReLU 后全正)</td></tr></tbody></table><h3 id="_3-3-llm-的实际选择" tabindex="-1">3.3 LLM 的实际选择 <a class="header-anchor" href="#_3-3-llm-的实际选择" aria-label="Permalink to &quot;3.3 LLM 的实际选择&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>权重:对称 + per-channel(GPTQ/AWQ 默认)</span></span>
<span class="line"><span>激活:对称 + per-token(SmoothQuant 默认)</span></span>
<span class="line"><span>KV Cache:对称 + per-token(23 篇展开)</span></span></code></pre></div><p><strong>LLM 几乎全用对称</strong>——非对称的额外计算开销(每个元素多一次减法)在大模型里成本太高。代价是放弃了不对称分布的利用,但配合 per-token 粒度,精度够用。</p><hr><h2 id="四、量化粒度-从-per-tensor-到-per-group" tabindex="-1">四、量化粒度:从 Per-tensor 到 Per-group <a class="header-anchor" href="#四、量化粒度-从-per-tensor-到-per-group" aria-label="Permalink to &quot;四、量化粒度:从 Per-tensor 到 Per-group&quot;">​</a></h2><h3 id="_4-1-必须画图对比" tabindex="-1">4.1 必须画图对比 <a class="header-anchor" href="#_4-1-必须画图对比" aria-label="Permalink to &quot;4.1 必须画图对比&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>张量 W 形状: [out_channels=4, in_channels=8]</span></span>
<span class="line"><span></span></span>
<span class="line"><span>W = [[1.2, -0.8,  2.1, -1.5,  0.3, -0.1,  4.5, -2.3],   ← out_channel 0</span></span>
<span class="line"><span>     [0.5, -1.1,  0.9,  0.7, -0.4,  1.8, -0.6,  0.2],   ← out_channel 1</span></span>
<span class="line"><span>     [3.2,  1.5, -2.1,  0.8,  1.1, -0.5,  0.9, -1.7],   ← out_channel 2</span></span>
<span class="line"><span>     [0.1,  0.2,  0.3, -0.4,  0.5, -0.6,  0.7, -0.8]]   ← out_channel 3</span></span>
<span class="line"><span></span></span>
<span class="line"><span>────────────────────────────────────────────────</span></span>
<span class="line"><span>1. Per-tensor:整个张量一个 scale</span></span>
<span class="line"><span>────────────────────────────────────────────────</span></span>
<span class="line"><span>   max(|W|) = 4.5</span></span>
<span class="line"><span>   scale = 4.5 / 127 ≈ 0.0354</span></span>
<span class="line"><span>   ↑ 全张量一个标量</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   优点:存最少,kernel 最快</span></span>
<span class="line"><span>   缺点:第 4 行最大才 0.8,被第 1 行的 4.5 拉伤,整行精度低</span></span>
<span class="line"><span></span></span>
<span class="line"><span></span></span>
<span class="line"><span>────────────────────────────────────────────────</span></span>
<span class="line"><span>2. Per-channel(行 / 列):每个 out_channel 一个 scale</span></span>
<span class="line"><span>────────────────────────────────────────────────</span></span>
<span class="line"><span>   scale = [4.5, 1.8, 3.2, 0.8] / 127</span></span>
<span class="line"><span>         = [0.0354, 0.0142, 0.0252, 0.0063]</span></span>
<span class="line"><span>   ↑ 每行一个标量,按 out_channel 切</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   优点:精度大幅提升,常用基线</span></span>
<span class="line"><span>   缺点:每行算 dequant 时要查对应 scale</span></span>
<span class="line"><span></span></span>
<span class="line"><span></span></span>
<span class="line"><span>────────────────────────────────────────────────</span></span>
<span class="line"><span>3. Per-group:每 G 个元素一个 scale(G 常 = 128)</span></span>
<span class="line"><span>────────────────────────────────────────────────</span></span>
<span class="line"><span>   每行的 8 个元素分成 N/G 组(假设 G=4):</span></span>
<span class="line"><span>   row 0: group_0 = [1.2,-0.8,2.1,-1.5] scale_0</span></span>
<span class="line"><span>          group_1 = [0.3,-0.1,4.5,-2.3] scale_1</span></span>
<span class="line"><span>   ↑ 比 per-channel 更细,每 128 个元素一个 scale</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   优点:精度最好,4-bit 量化必备</span></span>
<span class="line"><span>   缺点:存的 scale 多(每 G 个元素 1 个)</span></span>
<span class="line"><span></span></span>
<span class="line"><span></span></span>
<span class="line"><span>────────────────────────────────────────────────</span></span>
<span class="line"><span>4. Per-token(只在激活上有意义):每 token 一个 scale</span></span>
<span class="line"><span>────────────────────────────────────────────────</span></span>
<span class="line"><span>   激活形状 [batch, seq, hidden]</span></span>
<span class="line"><span>   每个 (batch, seq) 位置一个 scale</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   优点:适配每个 token 的动态范围</span></span>
<span class="line"><span>   缺点:运行时算,kernel 复杂</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   场景:KV cache 量化、SmoothQuant 激活</span></span></code></pre></div><h3 id="_4-2-决策表" tabindex="-1">4.2 决策表 <a class="header-anchor" href="#_4-2-决策表" aria-label="Permalink to &quot;4.2 决策表&quot;">​</a></h3><table tabindex="0"><thead><tr><th>用在哪</th><th>推荐粒度</th><th>理由</th></tr></thead><tbody><tr><td>INT8 权重</td><td>per-channel</td><td>精度足够,kernel 简单</td></tr><tr><td>INT4 权重</td><td><strong>per-group(G=128)</strong></td><td>INT4 范围小,粒度必须细</td></tr><tr><td>INT8 激活</td><td>per-token</td><td>LLM 激活每 token 分布差异大</td></tr><tr><td>FP8 权重</td><td>per-tensor 或 per-channel</td><td>FP8 自带指数,粒度可粗</td></tr><tr><td>KV cache</td><td>per-token / per-channel</td><td>23 篇展开</td></tr></tbody></table><h3 id="_4-3-一个反直觉的点" tabindex="-1">4.3 一个反直觉的点 <a class="header-anchor" href="#_4-3-一个反直觉的点" aria-label="Permalink to &quot;4.3 一个反直觉的点&quot;">​</a></h3><p><strong>粒度越细,精度越高,但存 scale 占的显存也变大</strong>。INT4 + group=128 的真实位宽不是 4 bit:权重 4 bit + scale (FP16) 16 / 128 = 0.125 bit/元素,合计 4.125 bit。但 per-tensor 精度会差到不可用,这 0.125 bit 是必要开销。</p><hr><h2 id="五、数值流-量化-→-反量化怎么走" tabindex="-1">五、数值流:量化 → 反量化怎么走 <a class="header-anchor" href="#五、数值流-量化-→-反量化怎么走" aria-label="Permalink to &quot;五、数值流:量化 → 反量化怎么走&quot;">​</a></h2><h3 id="_5-1-一张图说清楚" tabindex="-1">5.1 一张图说清楚 <a class="header-anchor" href="#_5-1-一张图说清楚" aria-label="Permalink to &quot;5.1 一张图说清楚&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                      原始浮点 x = 2.34 (FP16)</span></span>
<span class="line"><span>                              │</span></span>
<span class="line"><span>          ┌───────── 量化阶段(离线 / 校准时) ─────────┐</span></span>
<span class="line"><span>          │                                              │</span></span>
<span class="line"><span>          │  确定 scale = 0.018, zero_point = 0          │</span></span>
<span class="line"><span>          │     (从校准集的分布算出)                     │</span></span>
<span class="line"><span>          │                                              │</span></span>
<span class="line"><span>          │  q = round(x / scale + zero_point)           │</span></span>
<span class="line"><span>          │    = round(2.34 / 0.018 + 0)                 │</span></span>
<span class="line"><span>          │    = round(130) = 127  (clip 到 INT8 上限)   │</span></span>
<span class="line"><span>          │                                              │</span></span>
<span class="line"><span>          └──────────────────────────────────────────────┘</span></span>
<span class="line"><span>                              │</span></span>
<span class="line"><span>                              ▼</span></span>
<span class="line"><span>                    存储:q     = 127  (INT8 = 1 byte)</span></span>
<span class="line"><span>                          scale = 0.018 (FP16 = 2 byte / group)</span></span>
<span class="line"><span>                              │</span></span>
<span class="line"><span>                              │</span></span>
<span class="line"><span>          ┌───────── 反量化阶段(推理时) ────────────────┐</span></span>
<span class="line"><span>          │                                              │</span></span>
<span class="line"><span>          │  x_hat = (q - zero_point) × scale            │</span></span>
<span class="line"><span>          │        = (127 - 0) × 0.018                   │</span></span>
<span class="line"><span>          │        = 2.286  (≈ 原始 2.34,误差 0.054)    │</span></span>
<span class="line"><span>          │                                              │</span></span>
<span class="line"><span>          │  这个误差就是「量化误差」                     │</span></span>
<span class="line"><span>          │  整张量积累 → 模型输出精度损失               │</span></span>
<span class="line"><span>          │                                              │</span></span>
<span class="line"><span>          └──────────────────────────────────────────────┘</span></span>
<span class="line"><span>                              │</span></span>
<span class="line"><span>                              ▼</span></span>
<span class="line"><span>                    送进矩阵乘 kernel</span></span></code></pre></div><h3 id="_5-2-推理时怎么真正算" tabindex="-1">5.2 推理时怎么真正算 <a class="header-anchor" href="#_5-2-推理时怎么真正算" aria-label="Permalink to &quot;5.2 推理时怎么真正算&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Y = X · W  (FP16 矩阵乘 → 量化版怎么做?)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>方案 A: W8A16(只量权重)</span></span>
<span class="line"><span>  W_int8 (存) → dequant 到 FP16 → 跟 X(FP16) 算 GEMM</span></span>
<span class="line"><span>  优点:精度损失小,kernel 改动小</span></span>
<span class="line"><span>  缺点:dequant 把内存带宽优势吃掉一半</span></span>
<span class="line"><span></span></span>
<span class="line"><span>方案 B: W8A8(权重+激活都量)</span></span>
<span class="line"><span>  W_int8, X_int8 → INT8 GEMM (Tensor Core 直接支持)</span></span>
<span class="line"><span>  → 输出 INT32 → dequant 到 FP16</span></span>
<span class="line"><span>  优点:速度最快,Tensor Core 利用率高</span></span>
<span class="line"><span>  缺点:激活量化精度损失大,需要 SmoothQuant 类技术</span></span>
<span class="line"><span></span></span>
<span class="line"><span>方案 C: W4A16(LLM 推理主流)</span></span>
<span class="line"><span>  W_int4 (存) → dequant 到 FP16 → GEMM</span></span>
<span class="line"><span>  优点:权重显存最省,适合 70B 推理</span></span>
<span class="line"><span>  缺点:dequant 仍然耗时,但 INT4 GEMM kernel 已成熟</span></span></code></pre></div><p>工业落地:<strong>vLLM / SGLang 用 W4A16(AWQ/GPTQ)是 LLM 推理主流</strong>;TRT-LLM 在 H100 上推 W8A8(SmoothQuant)。详见 21 篇。</p><hr><h2 id="六、校准集与离群值" tabindex="-1">六、校准集与离群值 <a class="header-anchor" href="#六、校准集与离群值" aria-label="Permalink to &quot;六、校准集与离群值&quot;">​</a></h2><h3 id="_6-1-校准集是什么" tabindex="-1">6.1 校准集是什么 <a class="header-anchor" href="#_6-1-校准集是什么" aria-label="Permalink to &quot;6.1 校准集是什么&quot;">​</a></h3><p>PTQ 量化时,要知道每层激活的「动态范围」才能算 scale。这个范围不是从训练数据全量算,而是用一个<strong>几百到几千条</strong>的代表性样本集前向跑一遍,记录激活的 min/max/percentile。</p><div class="language-python vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">python</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 伪代码</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">calibration_data </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> load_samples(</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">n</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">512</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)   </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 512 条够用</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">with</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> torch.no_grad():</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    for</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> sample </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">in</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> calibration_data:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        activations </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> []</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">        # 注册 hook 收集每层激活</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">        for</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> layer </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">in</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> model.layers:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            layer.register_forward_hook(</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">lambda</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> m, i, o: activations.append(o))</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        model(sample)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 每层激活的分布</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">for</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> layer_act </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">in</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> activations:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    scale </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> layer_act.abs().max() </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">/</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 127</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">   # 或者用 percentile,避免离群值</span></span></code></pre></div><h3 id="_6-2-校准集的几个原则" tabindex="-1">6.2 校准集的几个原则 <a class="header-anchor" href="#_6-2-校准集的几个原则" aria-label="Permalink to &quot;6.2 校准集的几个原则&quot;">​</a></h3><ul><li><strong>覆盖业务场景</strong>:聊天模型用 ShareGPT 类样本,代码模型用代码样本</li><li><strong>样本量适中</strong>:128-1024,太少分布偏,太多 PTQ 慢</li><li><strong>不要全用短文本</strong>:长上下文场景必须有长样本,不然 KV 量化失真</li><li><strong>多语言模型必须多语言样本</strong></li></ul><h3 id="_6-3-离群值是精度杀手" tabindex="-1">6.3 离群值是精度杀手 <a class="header-anchor" href="#_6-3-离群值是精度杀手" aria-label="Permalink to &quot;6.3 离群值是精度杀手&quot;">​</a></h3><p>LLM 激活有一个非常诡异的特性:<strong>少数几个 channel 的激活值会比其他 channel 大几十甚至几百倍</strong>(2022 年 LLM.int8 论文首次系统观察到)。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>某 LLM 第 25 层激活分布(示意):</span></span>
<span class="line"><span></span></span>
<span class="line"><span>激活值</span></span>
<span class="line"><span>  ↑</span></span>
<span class="line"><span>  │  ●                                          ← 这个 channel 离群</span></span>
<span class="line"><span>  │  │</span></span>
<span class="line"><span>  │  │           ●</span></span>
<span class="line"><span>  │              │</span></span>
<span class="line"><span>  │  │   ●       │</span></span>
<span class="line"><span>  │  │   │   ●   │   ●</span></span>
<span class="line"><span>  │  │   │   │   │   │   ●  ●  ●  ●  ●  ●  ●  ●</span></span>
<span class="line"><span>  └─────────────────────────────────────────────→ channel 索引</span></span>
<span class="line"><span>     0    5    10   15   20   25   30   35</span></span>
<span class="line"><span></span></span>
<span class="line"><span>99% 的 channel:  |x| &lt; 5</span></span>
<span class="line"><span>1% 的离群 channel: |x| &gt; 50,极端时 &gt; 500</span></span></code></pre></div><p><strong>Per-tensor 量化的灾难</strong>:如果 scale 按 max=500 算,99% 的正常 channel 量化精度极差(都被压到 INT8 的 0 附近);如果按 max=5 算,1% 的离群被 clip 掉,模型直接崩。</p><h3 id="_6-4-三种解法的预告-21-篇主菜" tabindex="-1">6.4 三种解法的预告(21 篇主菜) <a class="header-anchor" href="#_6-4-三种解法的预告-21-篇主菜" aria-label="Permalink to &quot;6.4 三种解法的预告(21 篇主菜)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. SmoothQuant(2022)</span></span>
<span class="line"><span>   把激活的离群值通过等价变换搬到权重侧</span></span>
<span class="line"><span>   激活变平滑 → per-token 量化好做</span></span>
<span class="line"><span>   权重变陡峭 → 没关系,权重还是 per-channel</span></span>
<span class="line"><span>   适合 W8A8</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. AWQ(2023)</span></span>
<span class="line"><span>   1% 的「salient」权重对应 1% 的大激活 channel</span></span>
<span class="line"><span>   保护这部分权重(等价 scale 放大,量化分辨率提高)</span></span>
<span class="line"><span>   其他正常量化</span></span>
<span class="line"><span>   适合 W4A16</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. GPTQ(2022)</span></span>
<span class="line"><span>   不直接处理离群值,用 Hessian 信息一层一层量化补偿误差</span></span>
<span class="line"><span>   离群值会被部分吸收到补偿里</span></span>
<span class="line"><span>   通用,但对某些激活离群严重的模型精度掉</span></span></code></pre></div><hr><h2 id="七、权重-vs-激活-两个独立的轴" tabindex="-1">七、权重 vs 激活:两个独立的轴 <a class="header-anchor" href="#七、权重-vs-激活-两个独立的轴" aria-label="Permalink to &quot;七、权重 vs 激活:两个独立的轴&quot;">​</a></h2><h3 id="_7-1-命名约定" tabindex="-1">7.1 命名约定 <a class="header-anchor" href="#_7-1-命名约定" aria-label="Permalink to &quot;7.1 命名约定&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>W8A8   = Weight INT8, Activation INT8</span></span>
<span class="line"><span>W8A16  = Weight INT8, Activation FP16</span></span>
<span class="line"><span>W4A16  = Weight INT4, Activation FP16  ← LLM 推理主流</span></span>
<span class="line"><span>W4A8   = Weight INT4, Activation INT8  ← 实验阶段</span></span>
<span class="line"><span>W4A4   = Weight INT4, Activation INT4  ← 几乎没人在生产用,精度太崩</span></span></code></pre></div><h3 id="_7-2-工业主流-weight-only-优先" tabindex="-1">7.2 工业主流:weight-only 优先 <a class="header-anchor" href="#_7-2-工业主流-weight-only-优先" aria-label="Permalink to &quot;7.2 工业主流:weight-only 优先&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>权重:静态(模型加载完就固定),离线量化稳</span></span>
<span class="line"><span>激活:动态(每个 prompt 不同),量化容易掉精度</span></span>
<span class="line"><span></span></span>
<span class="line"><span>→ weight-only 量化(Wx A16)是 80% LLM 推理选择</span></span>
<span class="line"><span>→ 激活量化主要在 W8A8 + Tensor Core 高吞吐场景</span></span></code></pre></div><h3 id="_7-3-一张矩阵" tabindex="-1">7.3 一张矩阵 <a class="header-anchor" href="#_7-3-一张矩阵" aria-label="Permalink to &quot;7.3 一张矩阵&quot;">​</a></h3><table tabindex="0"><thead><tr><th></th><th>A16(激活不量)</th><th>A8(激活量)</th></tr></thead><tbody><tr><td><strong>W16</strong></td><td>baseline</td><td>几乎不用</td></tr><tr><td><strong>W8</strong></td><td>简单,精度好,显存省一半</td><td>W8A8,Tensor Core 友好,需 SmoothQuant</td></tr><tr><td><strong>W4</strong></td><td>LLM 主流(GPTQ/AWQ)</td><td>W4A8 实验,kernel 还不成熟</td></tr><tr><td><strong>W4A4</strong></td><td>—</td><td>精度崩,生产几乎不用</td></tr></tbody></table><hr><h2 id="八、工程经验-从-fp8-起步" tabindex="-1">八、工程经验:从 FP8 起步 <a class="header-anchor" href="#八、工程经验-从-fp8-起步" aria-label="Permalink to &quot;八、工程经验:从 FP8 起步&quot;">​</a></h2><h3 id="_8-1-不要一上来就量到-int4" tabindex="-1">8.1 不要一上来就量到 INT4 <a class="header-anchor" href="#_8-1-不要一上来就量到-int4" aria-label="Permalink to &quot;8.1 不要一上来就量到 INT4&quot;">​</a></h3><p>新模型上线量化的合理顺序:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. BF16 baseline,记录 MMLU / GSM8K / 业务评测分数</span></span>
<span class="line"><span>        │</span></span>
<span class="line"><span>        ▼</span></span>
<span class="line"><span>2. FP8 (E4M3 权重 + E5M2 激活,详见 22 篇)</span></span>
<span class="line"><span>   精度损失通常 &lt; 0.5%,先看吞吐提升够不够</span></span>
<span class="line"><span>        │</span></span>
<span class="line"><span>        ▼</span></span>
<span class="line"><span>3. INT8 W8A8 (SmoothQuant 校准,per-token 激活)</span></span>
<span class="line"><span>   精度损失 0.5-2%,吞吐再上一档</span></span>
<span class="line"><span>        │</span></span>
<span class="line"><span>        ▼</span></span>
<span class="line"><span>4. INT4 W4A16 (GPTQ 或 AWQ)</span></span>
<span class="line"><span>   精度损失 1-3%,显存大降</span></span>
<span class="line"><span>        │</span></span>
<span class="line"><span>        ▼</span></span>
<span class="line"><span>5. 看业务能不能接受。不行就退回上一档</span></span></code></pre></div><p><strong>反例</strong>:有人不评测直接上 INT4,模型 MMLU 掉 5 个点上线,客户投诉准确率下降——量化精度损失必须<strong>评测过</strong>才能上线。</p><h3 id="_8-2-评测指标-不要只看-mmlu" tabindex="-1">8.2 评测指标:不要只看 MMLU <a class="header-anchor" href="#_8-2-评测指标-不要只看-mmlu" aria-label="Permalink to &quot;8.2 评测指标:不要只看 MMLU&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>通用能力:MMLU、HellaSwag、ARC</span></span>
<span class="line"><span>代码能力:HumanEval、MBPP</span></span>
<span class="line"><span>数学:    GSM8K、MATH</span></span>
<span class="line"><span>长上下文:LongBench、Needle in Haystack</span></span>
<span class="line"><span>业务:    你们自己的评测集(最重要)</span></span></code></pre></div><p>量化对不同任务的损失不一致:</p><ul><li><strong>数学和代码任务对量化最敏感</strong>(需要精确推理链路)</li><li><strong>聊天和摘要任务相对鲁棒</strong></li></ul><h3 id="_8-3-量化后的精度恢复手段" tabindex="-1">8.3 量化后的精度恢复手段 <a class="header-anchor" href="#_8-3-量化后的精度恢复手段" aria-label="Permalink to &quot;8.3 量化后的精度恢复手段&quot;">​</a></h3><ul><li><strong>更优校准数据</strong>:校准集换成与下游任务分布更接近的样本</li><li><strong>混合精度</strong>:某些层(常见是 lm_head 或第一层 / 最后一层)保留 FP16</li><li><strong>更细的粒度</strong>:从 per-channel 切到 per-group=128,或 group=64</li><li><strong>AWQ 替代 GPTQ</strong>:对激活敏感的模型 AWQ 通常更稳</li></ul><h3 id="_8-4-量化后真实显存账" tabindex="-1">8.4 量化后真实显存账 <a class="header-anchor" href="#_8-4-量化后真实显存账" aria-label="Permalink to &quot;8.4 量化后真实显存账&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Llama-70B 推理(2k context, batch=1):</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  FP16:    权重 140 GB + KV 1.6 GB + 其他 5 GB ≈ 147 GB → 必须 2 张 80GB</span></span>
<span class="line"><span>  W4A16:   权重 35 GB  + KV 1.6 GB + 其他 5 GB ≈  42 GB → 1 张 80GB 跑得很爽</span></span>
<span class="line"><span></span></span>
<span class="line"><span>→ 量化把「必须 2 卡」压到「1 卡跑得稳」,成本对半砍,KV 还能撑 32k+ 上下文</span></span></code></pre></div><hr><h2 id="九、看完这一篇-你应该能" tabindex="-1">九、看完这一篇,你应该能 <a class="header-anchor" href="#九、看完这一篇-你应该能" aria-label="Permalink to &quot;九、看完这一篇,你应该能&quot;">​</a></h2><ul><li>解释为什么量化是降本第一手段(显存 + 带宽 + 吞吐三件事一起省)</li><li>解释 PTQ vs QAT,知道 LLM 圈为什么 90% 走 PTQ</li><li>默写量化的两种 schema(对称 vs 非对称),知道 LLM 几乎全用对称</li><li>在白板上画 per-tensor / per-channel / per-group / per-token 四种粒度</li><li>解释量化数值流(scale + zero_point 怎么用)</li><li>知道 LLM 激活离群值是精度杀手,1% 的 channel 能毁掉 per-tensor 量化</li><li>默写 W8A16 / W4A16 / W8A8 / W4A8 的命名约定</li><li>上线前不做精度评测就量化的人,你能讲出他错在哪</li></ul><p>下一篇:<strong>21 GPTQ / AWQ / GGUF</strong> — 三套主流量化方案的本质差异。GPTQ 用 Hessian,AWQ 保护 salient 权重,GGUF 是 llama.cpp 的格式 + k-quants 方案。配一张大对比表,选型不再纠结。</p>`,84)])])}const k=a(e,[["render",t]]);export{g as __pageData,k as default};
