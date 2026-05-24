import{c as a,Q as n,j as i,m as p}from"./chunks/framework.Bhbi9jCp.js";const o=JSON.parse('{"title":"张量并行:把单个算子切到多卡","description":"","frontmatter":{},"headers":[],"relativePath":"aiInfraLearning/16-张量并行.md","filePath":"aiInfraLearning/16-张量并行.md","lastUpdated":1778649484000}'),l={name:"aiInfraLearning/16-张量并行.md"};function e(t,s,h,r,d,k){return n(),i("div",null,[...s[0]||(s[0]=[p(`<h1 id="张量并行-把单个算子切到多卡" tabindex="-1">张量并行:把单个算子切到多卡 <a class="header-anchor" href="#张量并行-把单个算子切到多卡" aria-label="Permalink to &quot;张量并行:把单个算子切到多卡&quot;">​</a></h1><p>DDP / ZeRO / FSDP 解决的是「同一份模型复制到多卡,各算各的 batch」。但当模型本身的一份参数都装不下单卡——70B FP16 = 140 GB,一张 H100 80GB 放不下——再怎么切 batch 也无济于事。<strong>张量并行(Tensor Parallel,TP)就是把单个算子的权重矩阵本身切到多张卡上</strong>,每张卡只持有一部分,算的时候靠通信凑齐结果。这一篇拉清楚 TP 的两种切法、Transformer 里的标准组合、以及为什么 TP 几乎只能在单机 NVLink 域内用。</p><blockquote><p>一句话先记住:<strong>TP 把 Linear 层的权重按行或列切到多卡,每个 forward 一层要 2 次 All-Reduce(backward 再 2 次)——通信量正比于 batch × seq × hidden,只有机内 NVLink 撑得住,跨机几乎必死</strong>。这就是为什么 TP 几乎总是 TP=8,刚好对应单机 8 卡的 NVSwitch 域。</p></blockquote><hr><h2 id="一、为什么-ddp-zero-之后还需要-tp" tabindex="-1">一、为什么 DDP / ZeRO 之后还需要 TP <a class="header-anchor" href="#一、为什么-ddp-zero-之后还需要-tp" aria-label="Permalink to &quot;一、为什么 DDP / ZeRO 之后还需要 TP&quot;">​</a></h2><h3 id="_1-1-数据并行的天花板" tabindex="-1">1.1 数据并行的天花板 <a class="header-anchor" href="#_1-1-数据并行的天花板" aria-label="Permalink to &quot;1.1 数据并行的天花板&quot;">​</a></h3><p>复习一下前 13-15 篇的边界:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>DDP:        每卡一份完整模型 → 模型必须装得下单卡</span></span>
<span class="line"><span>ZeRO-1:     优化器状态切 → 模型 + 梯度仍要装下单卡(权重未切)</span></span>
<span class="line"><span>ZeRO-2:     梯度也切 → 模型权重仍要装下单卡</span></span>
<span class="line"><span>ZeRO-3 / FSDP: 权重也切,但 forward 时要 All-Gather 拼回完整层</span></span>
<span class="line"><span>            → 单层权重必须能装下单卡</span></span></code></pre></div><p>70B FP16 的单层(hidden=8192,FFN intermediate=28672)权重几个 GB,FSDP 的 All-Gather 还撑得住。但 405B、1T 这种,单层几十 GB,<strong>FSDP 拼回来那一刻单卡就 OOM 了</strong>。</p><h3 id="_1-2-tp-解决的根本问题" tabindex="-1">1.2 TP 解决的根本问题 <a class="header-anchor" href="#_1-2-tp-解决的根本问题" aria-label="Permalink to &quot;1.2 TP 解决的根本问题&quot;">​</a></h3><p>DDP / ZeRO 切的是「拷贝数」与「状态」,<strong>TP 切的是算子本身</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>DDP:           参数 W 完整存在每张卡</span></span>
<span class="line"><span>ZeRO-3 / FSDP: 参数 W 切片,但用的时候 All-Gather 回完整 W</span></span>
<span class="line"><span>TP:            参数 W 永远以切片形式参与计算,不拼回完整</span></span></code></pre></div><p>代价:每次算这个 Linear 都要通信。收益:<strong>单层权重永远不需要装下单卡</strong>。</p><h3 id="_1-3-经典出处" tabindex="-1">1.3 经典出处 <a class="header-anchor" href="#_1-3-经典出处" aria-label="Permalink to &quot;1.3 经典出处&quot;">​</a></h3><p>TP 的标准化设计来自 NVIDIA 2019 年的 Megatron-LM 论文(Shoeybi et al.),把 Transformer 的 Attention 与 FFN 切成「列切 + 行切」两段串联,正好让中间张量的通信抵消掉。<strong>今天 Megatron-Core / DeepSpeed-Megatron / NeMo 沿用的还是这套设计</strong>。</p><hr><h2 id="二、linear-层的两种切法" tabindex="-1">二、Linear 层的两种切法 <a class="header-anchor" href="#二、linear-层的两种切法" aria-label="Permalink to &quot;二、Linear 层的两种切法&quot;">​</a></h2><h3 id="_2-1-起点-一个-linear-在做什么" tabindex="-1">2.1 起点:一个 Linear 在做什么 <a class="header-anchor" href="#_2-1-起点-一个-linear-在做什么" aria-label="Permalink to &quot;2.1 起点:一个 Linear 在做什么&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Y = X · W + b</span></span>
<span class="line"><span></span></span>
<span class="line"><span>X:  [batch × seq, hidden_in]</span></span>
<span class="line"><span>W:  [hidden_in, hidden_out]</span></span>
<span class="line"><span>Y:  [batch × seq, hidden_out]</span></span></code></pre></div><p>把这个 W 切到 N 张卡上,有两种自然的切法:沿输出维度切(列切),或沿输入维度切(行切)。</p><h3 id="_2-2-列切-column-parallel" tabindex="-1">2.2 列切(Column Parallel) <a class="header-anchor" href="#_2-2-列切-column-parallel" aria-label="Permalink to &quot;2.2 列切(Column Parallel)&quot;">​</a></h3><p>把 W 沿 <code>hidden_out</code> 切成 <code>[W1 | W2 | ... | WN]</code>,每卡持有一列:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                     hidden_out</span></span>
<span class="line"><span>                  ┌──────┬──────┐</span></span>
<span class="line"><span>                  │      │      │</span></span>
<span class="line"><span>   hidden_in      │  W1  │  W2  │      W = [W1 | W2]</span></span>
<span class="line"><span>                  │      │      │      W1 在卡 0</span></span>
<span class="line"><span>                  │      │      │      W2 在卡 1</span></span>
<span class="line"><span>                  └──────┴──────┘</span></span>
<span class="line"><span>                  </span></span>
<span class="line"><span>   X 完整复制到两卡(无切)</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   卡 0:  Y1 = X · W1   ─→  [batch × seq, hidden_out / 2]</span></span>
<span class="line"><span>   卡 1:  Y2 = X · W2   ─→  [batch × seq, hidden_out / 2]</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   合起来: Y = [Y1 | Y2]</span></span></code></pre></div><p><strong>特点</strong>:</p><ul><li><strong>输入 X 不切</strong>,需要广播到所有卡(forward 时)</li><li><strong>输出 Y 天然按列切片</strong>,每卡持有 <code>hidden_out / N</code> 列</li><li>forward 不需要通信(假设 X 已经在所有卡上)</li><li>backward 计算 <code>dX</code> 时要 All-Reduce(把各卡的部分 <code>dX</code> 加起来)</li></ul><h3 id="_2-3-行切-row-parallel" tabindex="-1">2.3 行切(Row Parallel) <a class="header-anchor" href="#_2-3-行切-row-parallel" aria-label="Permalink to &quot;2.3 行切(Row Parallel)&quot;">​</a></h3><p>把 W 沿 <code>hidden_in</code> 切成 <code>[W1; W2; ...; WN]^T</code>,每卡持有一行:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                     hidden_out</span></span>
<span class="line"><span>                  ┌─────────────┐</span></span>
<span class="line"><span>                  │             │</span></span>
<span class="line"><span>   hidden_in /2   │     W1      │      W = [W1; W2] (上下拼)</span></span>
<span class="line"><span>                  │             │      W1 在卡 0</span></span>
<span class="line"><span>                  ├─────────────┤      W2 在卡 1</span></span>
<span class="line"><span>                  │             │</span></span>
<span class="line"><span>   hidden_in /2   │     W2      │</span></span>
<span class="line"><span>                  │             │</span></span>
<span class="line"><span>                  └─────────────┘</span></span>
<span class="line"><span>                  </span></span>
<span class="line"><span>   X 必须按列切片:X = [X1 | X2]   (要求上一层已切好)</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   卡 0:  Y1 = X1 · W1   ─→  [batch × seq, hidden_out]  (部分和)</span></span>
<span class="line"><span>   卡 1:  Y2 = X2 · W2   ─→  [batch × seq, hidden_out]  (部分和)</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   真正结果:  Y = Y1 + Y2   ← 必须 All-Reduce 求和</span></span></code></pre></div><p><strong>特点</strong>:</p><ul><li><strong>输入 X 必须按列切片</strong>,要求上一层已经把输出按列切好(刚好对应列切的输出)</li><li><strong>输出 Y 是各卡的部分和</strong>,forward 时要 All-Reduce 求总和</li><li>backward 计算 <code>dX</code> 时不需要通信(<code>dX</code> 天然按列分布)</li></ul><h3 id="_2-4-一张表对照" tabindex="-1">2.4 一张表对照 <a class="header-anchor" href="#_2-4-一张表对照" aria-label="Permalink to &quot;2.4 一张表对照&quot;">​</a></h3><table tabindex="0"><thead><tr><th></th><th>列切 ColumnParallel</th><th>行切 RowParallel</th></tr></thead><tbody><tr><td>W 切法</td><td>沿输出维度</td><td>沿输入维度</td></tr><tr><td>X 输入</td><td>完整(每卡一份)</td><td>切片(按列)</td></tr><tr><td>Y 输出</td><td>切片(按列)</td><td>完整(All-Reduce 求和)</td></tr><tr><td>forward 通信</td><td>无(假设 X 已就位)</td><td>All-Reduce(每个 token 一次)</td></tr><tr><td>backward 通信</td><td>All-Reduce on dX</td><td>无</td></tr><tr><td>与下一层衔接</td><td>输出已切,送给「行切」最自然</td><td>输出已合,送给「列切」要广播</td></tr></tbody></table><p><strong>关键洞察</strong>:<strong>列切的输出正好是行切的输入</strong>——把列切和行切串起来,中间不需要把张量合回完整,<strong>只在串联的两端各做一次通信</strong>。</p><hr><h2 id="三、transformer-block-中的标准组合" tabindex="-1">三、Transformer Block 中的标准组合 <a class="header-anchor" href="#三、transformer-block-中的标准组合" aria-label="Permalink to &quot;三、Transformer Block 中的标准组合&quot;">​</a></h2><h3 id="_3-1-必画图-attention-ffn-一层的-tp-数据流" tabindex="-1">3.1 必画图:Attention + FFN 一层的 TP 数据流 <a class="header-anchor" href="#_3-1-必画图-attention-ffn-一层的-tp-数据流" aria-label="Permalink to &quot;3.1 必画图:Attention + FFN 一层的 TP 数据流&quot;">​</a></h3><p>Megatron 的标准设计:Attention 用「QKV 列切 → Output 行切」,FFN 用「Linear1 列切 → GELU → Linear2 行切」,正好两段串联各做一次 All-Reduce。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                     输入 X  [batch, seq, hidden]</span></span>
<span class="line"><span>                     (在 TP 域内每卡一份完整复制)</span></span>
<span class="line"><span>                              │</span></span>
<span class="line"><span>              ┌───────────────┼───────────────┐</span></span>
<span class="line"><span>              ▼               ▼               ▼</span></span>
<span class="line"><span>   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐</span></span>
<span class="line"><span>   │ LayerNorm   │   │ LayerNorm   │   │ LayerNorm   │   (无参数大头,各卡自算)</span></span>
<span class="line"><span>   └─────────────┘   └─────────────┘   └─────────────┘</span></span>
<span class="line"><span>              │               │               │</span></span>
<span class="line"><span>   ╔═══════════════ Attention 块(TP=2 示意)═══════════════╗</span></span>
<span class="line"><span>              │               │</span></span>
<span class="line"><span>              ▼               ▼</span></span>
<span class="line"><span>   ┌──────────────┐   ┌──────────────┐</span></span>
<span class="line"><span>   │ Q,K,V 列切:  │   │ Q,K,V 列切:  │</span></span>
<span class="line"><span>   │  W_qkv 列切  │   │  W_qkv 列切  │     QKV Projection 列切</span></span>
<span class="line"><span>   │ 输出半数 head │   │ 输出半数 head │     每卡持有 n_head/2 个头</span></span>
<span class="line"><span>   └──────────────┘   └──────────────┘</span></span>
<span class="line"><span>              │               │</span></span>
<span class="line"><span>              ▼               ▼</span></span>
<span class="line"><span>   ┌──────────────┐   ┌──────────────┐</span></span>
<span class="line"><span>   │ Attention   │    │ Attention   │     各卡独立算自己持有的 head</span></span>
<span class="line"><span>   │ (n_head/2)  │    │ (n_head/2)  │     head 间无依赖,无通信</span></span>
<span class="line"><span>   └──────────────┘   └──────────────┘</span></span>
<span class="line"><span>              │               │</span></span>
<span class="line"><span>              ▼               ▼</span></span>
<span class="line"><span>   ┌──────────────┐   ┌──────────────┐</span></span>
<span class="line"><span>   │ Output Proj │    │ Output Proj │     Output Projection 行切</span></span>
<span class="line"><span>   │  W_o 行切    │    │  W_o 行切    │     每卡输出部分和</span></span>
<span class="line"><span>   │ 部分和       │    │ 部分和       │</span></span>
<span class="line"><span>   └──────────────┘   └──────────────┘</span></span>
<span class="line"><span>              │               │</span></span>
<span class="line"><span>              └───────┬───────┘</span></span>
<span class="line"><span>                      ▼</span></span>
<span class="line"><span>              ┌────────────────┐</span></span>
<span class="line"><span>              │  All-Reduce    │            ← Attention 块的唯一通信点</span></span>
<span class="line"><span>              └────────────────┘</span></span>
<span class="line"><span>                      │</span></span>
<span class="line"><span>                      ▼</span></span>
<span class="line"><span>              输出  [batch, seq, hidden]   (合回完整,每卡一份)</span></span>
<span class="line"><span>   ╚════════════════════════════════════════════════════╝</span></span>
<span class="line"><span>                      │</span></span>
<span class="line"><span>              ┌───────┼───────┐</span></span>
<span class="line"><span>              ▼               ▼</span></span>
<span class="line"><span>   ┌─────────────┐   ┌─────────────┐</span></span>
<span class="line"><span>   │ LayerNorm   │   │ LayerNorm   │</span></span>
<span class="line"><span>   └─────────────┘   └─────────────┘</span></span>
<span class="line"><span>              │               │</span></span>
<span class="line"><span>   ╔═══════════════ FFN 块(TP=2 示意)═══════════════╗</span></span>
<span class="line"><span>              │               │</span></span>
<span class="line"><span>              ▼               ▼</span></span>
<span class="line"><span>   ┌──────────────┐   ┌──────────────┐</span></span>
<span class="line"><span>   │ Linear1 列切 │    │ Linear1 列切 │     hidden → 4·hidden,每卡持半</span></span>
<span class="line"><span>   └──────────────┘   └──────────────┘</span></span>
<span class="line"><span>              │               │</span></span>
<span class="line"><span>              ▼               ▼</span></span>
<span class="line"><span>   ┌──────────────┐   ┌──────────────┐</span></span>
<span class="line"><span>   │ GELU         │    │ GELU         │     按元素,无通信</span></span>
<span class="line"><span>   └──────────────┘   └──────────────┘</span></span>
<span class="line"><span>              │               │</span></span>
<span class="line"><span>              ▼               ▼</span></span>
<span class="line"><span>   ┌──────────────┐   ┌──────────────┐</span></span>
<span class="line"><span>   │ Linear2 行切 │    │ Linear2 行切 │     4·hidden → hidden,部分和</span></span>
<span class="line"><span>   └──────────────┘   └──────────────┘</span></span>
<span class="line"><span>              │               │</span></span>
<span class="line"><span>              └───────┬───────┘</span></span>
<span class="line"><span>                      ▼</span></span>
<span class="line"><span>              ┌────────────────┐</span></span>
<span class="line"><span>              │  All-Reduce    │            ← FFN 块的唯一通信点</span></span>
<span class="line"><span>              └────────────────┘</span></span>
<span class="line"><span>                      │</span></span>
<span class="line"><span>                      ▼</span></span>
<span class="line"><span>              输出  [batch, seq, hidden]</span></span>
<span class="line"><span>   ╚════════════════════════════════════════════════════╝</span></span></code></pre></div><h3 id="_3-2-通信账" tabindex="-1">3.2 通信账 <a class="header-anchor" href="#_3-2-通信账" aria-label="Permalink to &quot;3.2 通信账&quot;">​</a></h3><p>对一个 Transformer Block(Attention + FFN),<strong>forward 需要 2 次 All-Reduce,backward 同样 2 次</strong>(梯度反向传播时输入侧的 dX 要合):</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>每层每次 forward:  2 × All-Reduce</span></span>
<span class="line"><span>每层每次 backward: 2 × All-Reduce</span></span>
<span class="line"><span>合计每步每层:      4 × All-Reduce</span></span>
<span class="line"><span></span></span>
<span class="line"><span>每次 All-Reduce 的张量大小: batch × seq × hidden × 2 bytes (FP16)</span></span></code></pre></div><p>举例:70B 模型(80 层,hidden=8192),global batch=4M tokens,TP=8:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>单次 All-Reduce: 4M × 8192 × 2 bytes ≈ 64 GB(理论上,实际按 micro-batch 摊)</span></span>
<span class="line"><span>每步全模型:    80 层 × 4 = 320 次 All-Reduce</span></span></code></pre></div><p><strong>TP 的通信总量比 DP 大一个数量级</strong>——这就是为什么 TP 只能在 NVLink 域内用。</p><hr><h2 id="四、为什么-tp-几乎总是-tp-8-几乎不跨机" tabindex="-1">四、为什么 TP 几乎总是 TP=8,几乎不跨机 <a class="header-anchor" href="#四、为什么-tp-几乎总是-tp-8-几乎不跨机" aria-label="Permalink to &quot;四、为什么 TP 几乎总是 TP=8,几乎不跨机&quot;">​</a></h2><h3 id="_4-1-通信带宽对比" tabindex="-1">4.1 通信带宽对比 <a class="header-anchor" href="#_4-1-通信带宽对比" aria-label="Permalink to &quot;4.1 通信带宽对比&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>NVLink 4 (节点内):    900 GB/s 单向</span></span>
<span class="line"><span>PCIe Gen5:            128 GB/s</span></span>
<span class="line"><span>InfiniBand 400G:      50 GB/s 单向(节点间最快)</span></span>
<span class="line"><span>                      </span></span>
<span class="line"><span>NVLink / IB ≈ 18 倍</span></span></code></pre></div><p>TP 的 All-Reduce 在每层都发生,通信量本来就大。<strong>走 IB 等于把每个 All-Reduce 慢 18 倍</strong>,加上每层 4 次,整张卡的算力很快就被通信吃光,GPU 利用率掉到个位数。</p><h3 id="_4-2-拓扑约束" tabindex="-1">4.2 拓扑约束 <a class="header-anchor" href="#_4-2-拓扑约束" aria-label="Permalink to &quot;4.2 拓扑约束&quot;">​</a></h3><p>H100 / H200 的标准节点是 8 卡 NVSwitch,<strong>NVSwitch 域内 8 卡两两全互联,带宽对等</strong>。这个域的大小决定了 TP 的上限:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>单机 8×H100 (NVSwitch):     TP=2 / 4 / 8 都可以,TP=8 是上限</span></span>
<span class="line"><span>8×H100 + 跨机:               TP 不要跨节点,会死</span></span>
<span class="line"><span>GB200 NVL72:                 NVLink 域扩到 72 卡,TP 理论上能到 72</span></span>
<span class="line"><span>                            (但目前 Megatron-Core 默认仍 TP=8)</span></span></code></pre></div><h3 id="_4-3-实战配置经验" tabindex="-1">4.3 实战配置经验 <a class="header-anchor" href="#_4-3-实战配置经验" aria-label="Permalink to &quot;4.3 实战配置经验&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>TP=2:    模型很大 + DP 还塞得下,典型用 NVLink 内 2 卡</span></span>
<span class="line"><span>TP=4:    机内一半,常见于 30B-70B 模型</span></span>
<span class="line"><span>TP=8:    机内全用,标准 70B+ 训练配置</span></span>
<span class="line"><span>TP &gt; 8:  几乎没人这么干,B200 NVL72 时代可能改写</span></span></code></pre></div><hr><h2 id="五、序列并行-sp-tp-的省显存补丁" tabindex="-1">五、序列并行(SP):TP 的省显存补丁 <a class="header-anchor" href="#五、序列并行-sp-tp-的省显存补丁" aria-label="Permalink to &quot;五、序列并行(SP):TP 的省显存补丁&quot;">​</a></h2><h3 id="_5-1-tp-没切的部分" tabindex="-1">5.1 TP 没切的部分 <a class="header-anchor" href="#_5-1-tp-没切的部分" aria-label="Permalink to &quot;5.1 TP 没切的部分&quot;">​</a></h3><p>回看第三节的图,LayerNorm / Dropout / 残差连接这些<strong>按元素</strong>的算子,在 TP 域内<strong>每卡都跑全份</strong>。这意味着:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>LayerNorm 的输入:  [batch, seq, hidden]   每卡完整一份</span></span>
<span class="line"><span>Dropout 的输出:    [batch, seq, hidden]   每卡完整一份</span></span></code></pre></div><p>激活的显存没省下来。长上下文(seq=32K / 128K)训练时,这部分激活就是显存大头。</p><h3 id="_5-2-序列并行-megatron-sp-的招数" tabindex="-1">5.2 序列并行(Megatron SP)的招数 <a class="header-anchor" href="#_5-2-序列并行-megatron-sp-的招数" aria-label="Permalink to &quot;5.2 序列并行(Megatron SP)的招数&quot;">​</a></h3><p>在 LayerNorm / Dropout 阶段,把 sequence 维度切到 TP 各卡:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>TP 的 Linear 阶段(列切 / 行切):</span></span>
<span class="line"><span>   张量形状: [batch, seq, hidden]   每卡完整 seq</span></span>
<span class="line"><span></span></span>
<span class="line"><span>非 Linear 阶段(LayerNorm / Dropout):</span></span>
<span class="line"><span>   张量形状: [batch, seq/TP, hidden]   每卡只持 1/TP 的 seq</span></span></code></pre></div><p>切换两种状态需要在边界做 All-Gather(SP→TP)和 Reduce-Scatter(TP→SP),<strong>这两个加起来正好等价于一次 All-Reduce</strong>——通信量没变,但激活显存省了 TP 倍。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>没 SP 时,每层激活显存:    batch × seq × hidden × 2 bytes</span></span>
<span class="line"><span>有 SP 时,每层激活显存:    batch × seq/TP × hidden × 2 bytes</span></span></code></pre></div><p>详细 + 其他两种序列并行(Ring / Ulysses)在 18 篇展开。</p><hr><h2 id="六、最小代码-megatron-风格的-tp-linear" tabindex="-1">六、最小代码:Megatron 风格的 TP Linear <a class="header-anchor" href="#六、最小代码-megatron-风格的-tp-linear" aria-label="Permalink to &quot;六、最小代码:Megatron 风格的 TP Linear&quot;">​</a></h2><p>Megatron-Core 暴露的两个核心类:<code>ColumnParallelLinear</code> 和 <code>RowParallelLinear</code>。</p><div class="language-python vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">python</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">from</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> megatron.core.tensor_parallel </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">import</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    ColumnParallelLinear,</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    RowParallelLinear,</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">from</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> megatron.core.parallel_state </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">import</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> initialize_model_parallel</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 初始化 TP 通信组(假设 TP=8)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">initialize_model_parallel(</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">tensor_model_parallel_size</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">8</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">hidden </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 8192</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">ffn_hidden </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 4</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> *</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> hidden  </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 32768</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># ============ Attention 块 ============</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># QKV 投影:列切,输出按 head 分到各卡</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">qkv </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> ColumnParallelLinear(</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    input_size</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">hidden,</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    output_size</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">3</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> *</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> hidden,         </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Q + K + V</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    gather_output</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">False</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,            </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 不在输出端 All-Gather,保持切片</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    bias</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">False</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Output 投影:行切,输入是切片,输出 All-Reduce</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">out_proj </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> RowParallelLinear(</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    input_size</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">hidden,</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    output_size</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">hidden,</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    input_is_parallel</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">True</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,         </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 输入已经按列切了</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    bias</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">False</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># ============ FFN 块 ============</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Linear1:列切,输出切片</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">fc1 </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> ColumnParallelLinear(</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    input_size</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">hidden,</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    output_size</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">ffn_hidden,</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    gather_output</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">False</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    bias</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">True</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Linear2:行切,输入切片,输出 All-Reduce</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">fc2 </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> RowParallelLinear(</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    input_size</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">ffn_hidden,</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    output_size</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">hidden,</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    input_is_parallel</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">True</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">    bias</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">True</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">def</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> transformer_block</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(x):</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # Attention</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    h </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> layer_norm(x)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    qkv_out, _ </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> qkv(h)               </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># [b, s, 3h/TP]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    q, k, v </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> split_qkv(qkv_out)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    attn_out </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> attention(q, k, v)     </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 各卡独立算自己 head</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    out, _ </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> out_proj(attn_out)       </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 内部触发 All-Reduce</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    x </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> x </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">+</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> out                       </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 残差</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # FFN</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    h </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> layer_norm(x)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    h, _ </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> fc1(h)                     </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># [b, s, ffn/TP]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    h </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> gelu(h)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    out, _ </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> fc2(h)                   </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 内部触发 All-Reduce</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    x </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> x </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">+</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> out</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    return</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> x</span></span></code></pre></div><p>启动命令(单机 8 卡 TP=8):</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">torchrun</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --nproc_per_node=8</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> train.py</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --tensor-model-parallel-size</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 8</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --pipeline-model-parallel-size</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 1</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --num-layers</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 80</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --hidden-size</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 8192</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --num-attention-heads</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 64</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --seq-length</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 4096</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --micro-batch-size</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 1</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --global-batch-size</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 1024</span></span></code></pre></div><hr><h2 id="七、tp-的边界与替代" tabindex="-1">七、TP 的边界与替代 <a class="header-anchor" href="#七、tp-的边界与替代" aria-label="Permalink to &quot;七、TP 的边界与替代&quot;">​</a></h2><h3 id="_7-1-什么时候-tp-不够" tabindex="-1">7.1 什么时候 TP 不够 <a class="header-anchor" href="#_7-1-什么时候-tp-不够" aria-label="Permalink to &quot;7.1 什么时候 TP 不够&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>TP=8 仍 OOM:        模型太大(405B / 1T)</span></span>
<span class="line"><span>                   → 上 PP(17 篇)+ DP,3D 并行(18 篇)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>通信打满 NVLink:    序列太长 + batch 大</span></span>
<span class="line"><span>                   → 加 SP(序列并行),减激活显存</span></span>
<span class="line"><span></span></span>
<span class="line"><span>跨机想切模型:       TP 几乎不可行</span></span>
<span class="line"><span>                   → 用 PP,P2P 通信跨机才撑得住</span></span></code></pre></div><h3 id="_7-2-tp-与-zero-3-fsdp-的关系" tabindex="-1">7.2 TP 与 ZeRO-3 / FSDP 的关系 <a class="header-anchor" href="#_7-2-tp-与-zero-3-fsdp-的关系" aria-label="Permalink to &quot;7.2 TP 与 ZeRO-3 / FSDP 的关系&quot;">​</a></h3><table tabindex="0"><thead><tr><th></th><th>TP</th><th>FSDP / ZeRO-3</th></tr></thead><tbody><tr><td>切什么</td><td>算子内部权重(切矩阵)</td><td>整层权重(切层)</td></tr><tr><td>通信时机</td><td>每层 forward / backward 都通信</td><td>All-Gather 拼回再算</td></tr><tr><td>通信量</td><td>大(正比于激活)</td><td>中(正比于权重)</td></tr><tr><td>跨机</td><td>几乎不行</td><td>可以(IB 撑得住)</td></tr><tr><td>单层权重要求</td><td>不要求装下单卡</td><td>拼回时要装下单卡</td></tr></tbody></table><p><strong>实战经验</strong>:中等规模(&lt;70B)单机 8 卡用 FSDP 简单且足够;100B+ 跨机训练必须 TP+PP+DP 三路并行。</p><h3 id="_7-3-pytorch-dtensor-megatron-core-的关系" tabindex="-1">7.3 PyTorch DTensor / Megatron-Core 的关系 <a class="header-anchor" href="#_7-3-pytorch-dtensor-megatron-core-的关系" aria-label="Permalink to &quot;7.3 PyTorch DTensor / Megatron-Core 的关系&quot;">​</a></h3><ul><li><strong>Megatron-LM</strong>:NVIDIA 2019 年开源,TP+PP 的工业级实现,3D 并行的事实标准</li><li><strong>Megatron-Core</strong>:Megatron 抽出来的核心库,可独立用,被 NeMo / DeepSpeed 集成</li><li><strong>PyTorch DTensor / 2D-Parallel API</strong>:PyTorch 2.x 把 TP / FSDP / PP 抽象到一套 DeviceMesh + DTensor 上,<strong>目标是替代 Megatron 的硬编码风格</strong>——但 2026 大规模训练仍以 Megatron-Core 为主,DTensor 在中等规模逐步铺开</li></ul><hr><h2 id="八、看完这一篇-你应该能" tabindex="-1">八、看完这一篇,你应该能 <a class="header-anchor" href="#八、看完这一篇-你应该能" aria-label="Permalink to &quot;八、看完这一篇,你应该能&quot;">​</a></h2><ul><li>解释 TP 切的是什么(算子权重),与 ZeRO/FSDP 的根本差别(切状态 vs 切算子)</li><li>在白板上画列切和行切的矩阵示意,说出 forward / backward 各自的通信点</li><li>默写 Transformer Block 的标准组合:QKV 列切 → 各 head 独立 → Output 行切;FFN Linear1 列切 → GELU → Linear2 行切</li><li>说出每层 forward 2 次 All-Reduce、backward 2 次,合计每步每层 4 次</li><li>解释为什么 TP 几乎只能在 NVLink 域内,跨机几乎死(通信带宽差 18 倍)</li><li>知道 TP=8 是单机 H100 / H200 的标准上限,GB200 NVL72 时代可能改写</li><li>看到序列并行(SP)知道是 TP 的省激活补丁,通信总量不变</li></ul><p>下一篇:<strong>17 流水并行</strong> —— TP 解决「单层装不下单卡」,PP 解决「整模型层数太多装不下单机」。把模型按层切到多卡,用 micro-batch 流水线把气泡压下去,1F1B / Interleaved 是怎么一步步把气泡逼到接近零的。</p>`,85)])])}const g=a(l,[["render",e]]);export{o as __pageData,g as default};
