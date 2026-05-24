import{c as a,Q as n,j as p,m as i}from"./chunks/framework.Bhbi9jCp.js";const r=JSON.parse('{"title":"PagedAttention:把 KV Cache 当虚拟内存管","description":"","frontmatter":{},"headers":[],"relativePath":"aiInfraLearning/08-PagedAttention.md","filePath":"aiInfraLearning/08-PagedAttention.md","lastUpdated":1778649484000}'),e={name:"aiInfraLearning/08-PagedAttention.md"};function l(t,s,h,k,o,c){return n(),p("div",null,[...s[0]||(s[0]=[i(`<h1 id="pagedattention-把-kv-cache-当虚拟内存管" tabindex="-1">PagedAttention:把 KV Cache 当虚拟内存管 <a class="header-anchor" href="#pagedattention-把-kv-cache-当虚拟内存管" aria-label="Permalink to &quot;PagedAttention:把 KV Cache 当虚拟内存管&quot;">​</a></h1><p>07 篇算清了 KV 的显存账,但没说一件事:<strong>KV 在显存里是怎么摆放的</strong>。vLLM 出现之前(2023 中以前),主流推理实现的做法朴素到离谱——<strong>给每个请求按 max_seq_len 预留一整块连续显存</strong>。一个请求宣布&quot;我最多生成 2K token&quot;,引擎就给它划 2K token 的 KV 空间,哪怕这个请求最后只生成了 50 token,<strong>1950 个 token 的空间也一直空在那</strong>。算下来浪费 60-80% 的显存。vLLM 的 PagedAttention 把这件事从根上重做:借鉴操作系统的虚拟内存,<strong>KV 切成固定大小的 block,逻辑序列通过 Block Table 索引到物理块</strong>,碎片消失,共享自然发生。这一篇拆它怎么做、为什么这么做、什么时候是它的代价。</p><blockquote><p>一句话先记住:<strong>PagedAttention = 把 KV Cache 当虚拟内存,固定 block_size(vLLM 默认 16 token)的物理块从池子里按需分配,Block Table 把逻辑 KV 序列映射到物理块号</strong>。外部碎片消失,只剩末块平均一半的内部碎片;Copy-on-Write 让并行采样共享 prefix,Prefix Caching 让多请求复用系统提示。代价是 attention kernel 多一层间接寻址,小 batch 下有 kernel overhead——但绝大多数生产负载下是净赚。</p></blockquote><hr><h2 id="一、朴素实现的痛-预留-浪费" tabindex="-1">一、朴素实现的痛:预留 = 浪费 <a class="header-anchor" href="#一、朴素实现的痛-预留-浪费" aria-label="Permalink to &quot;一、朴素实现的痛:预留 = 浪费&quot;">​</a></h2><h3 id="_1-1-一段典型的朴素-kv-分配" tabindex="-1">1.1 一段典型的朴素 KV 分配 <a class="header-anchor" href="#_1-1-一段典型的朴素-kv-分配" aria-label="Permalink to &quot;1.1 一段典型的朴素 KV 分配&quot;">​</a></h3><div class="language-python vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">python</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># transformers / 早期推理实现的做法(伪代码)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">def</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> serve_request</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(prompt, max_new_tokens):</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    max_seq_len </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> len</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(prompt) </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">+</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> max_new_tokens   </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 比如 2048</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    </span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # 给整个请求预留一整块连续显存</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    kv_cache </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> torch.empty(</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        (n_layers, </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">2</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, max_seq_len, n_heads, d_head),</span></span>
<span class="line"><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">        dtype</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">torch.float16, </span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">device</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;cuda&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    )</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    </span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # 然后按位置往里填</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    for</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> t </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">in</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> range</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(max_seq_len):</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        kv_cache[:, :, t, :, :] </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> compute_kv(</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">input</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">[t])</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">        if</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> generated </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">==</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> EOS</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">            break</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  # 后面的空间一直空着到请求结束</span></span></code></pre></div><p>问题摆在台面上:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>请求 A: max_seq_len=2048, 实际生成 50 token   → 浪费 1998 token 的 KV 空间</span></span>
<span class="line"><span>请求 B: max_seq_len=2048, 实际生成 1500 token → 浪费 548 token</span></span>
<span class="line"><span>请求 C: max_seq_len=2048, 实际生成 2000 token → 浪费 48 token</span></span>
<span class="line"><span></span></span>
<span class="line"><span>平均生成长度通常只有 max_seq_len 的 20-40%,意味着 60-80% 的 KV 预留空间是空的。</span></span></code></pre></div><p>更糟的是<strong>外部碎片</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>显存空间:</span></span>
<span class="line"><span>┌─────┬─────┬─────┬─────┬─────┬─────┐</span></span>
<span class="line"><span>│ A   │ B   │ 已释放 │ C   │ D   │ 空    │</span></span>
<span class="line"><span>│ 2K  │ 2K  │  2K   │ 2K  │ 2K  │ 1.5K │</span></span>
<span class="line"><span>└─────┴─────┴───────┴─────┴─────┴──────┘</span></span>
<span class="line"><span>              ↑</span></span>
<span class="line"><span>              请求 E 想要 2K,中间这块够大,但</span></span>
<span class="line"><span>              不连续到旁边的空块,装不下</span></span>
<span class="line"><span>              → 等其他请求释放才能调度</span></span></code></pre></div><p><strong>预留 + 连续要求</strong>这两件事联手,让朴素实现的有效 KV 利用率经常只有 30-40%。</p><h3 id="_1-2-vllm-原论文里的实测数字" tabindex="-1">1.2 vLLM 原论文里的实测数字 <a class="header-anchor" href="#_1-2-vllm-原论文里的实测数字" aria-label="Permalink to &quot;1.2 vLLM 原论文里的实测数字&quot;">​</a></h3><p>vLLM 2023 年发的论文里测了一下:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>朴素 KV 分配的显存使用拆解(同卡同模型,Naive 实现):</span></span>
<span class="line"><span>   有效 KV(真正在用):     20-40%</span></span>
<span class="line"><span>   预留浪费(请求实际短):   60-80%</span></span>
<span class="line"><span>   外部碎片(空但分配不下):  10-20%</span></span>
<span class="line"><span></span></span>
<span class="line"><span>加起来:有效利用率经常 &lt; 30%</span></span></code></pre></div><p>直接结论:<strong>有 60% 的卡其实没在做事</strong>——这就是 PagedAttention 想啃掉的那块。</p><hr><h2 id="二、心智-kv-cache-当成虚拟内存" tabindex="-1">二、心智:KV Cache 当成虚拟内存 <a class="header-anchor" href="#二、心智-kv-cache-当成虚拟内存" aria-label="Permalink to &quot;二、心智:KV Cache 当成虚拟内存&quot;">​</a></h2><h3 id="_2-1-借的是操作系统的什么招" tabindex="-1">2.1 借的是操作系统的什么招 <a class="header-anchor" href="#_2-1-借的是操作系统的什么招" aria-label="Permalink to &quot;2.1 借的是操作系统的什么招&quot;">​</a></h3><p>操作系统管内存早就解决过同类问题——程序申请一段&quot;连续&quot;的虚拟地址空间,<strong>底层却切成 4KB 的页(page),散在物理内存任意位置</strong>,靠页表(Page Table)把虚拟地址翻译成物理地址。<strong>程序眼里看到的是连续,物理上却是离散</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                  ┌────────────────────────────┐</span></span>
<span class="line"><span>程序眼里:          │ 一段连续的虚拟地址空间      │</span></span>
<span class="line"><span>                  └────┬────┬────┬────┬────┬───┘</span></span>
<span class="line"><span>                       │    │    │    │    │</span></span>
<span class="line"><span>                  ┌────▼────▼────▼────▼────▼───┐</span></span>
<span class="line"><span>   Page Table:    │ 虚拟页号 → 物理页号映射      │</span></span>
<span class="line"><span>                  └────┬────────────────────────┘</span></span>
<span class="line"><span>                       │</span></span>
<span class="line"><span>                  ┌────▼───────────────────────┐</span></span>
<span class="line"><span>物理上:            │ 页可以在物理内存任意位置    │</span></span>
<span class="line"><span>                  │  P3       P0  P5    P1   P9│</span></span>
<span class="line"><span>                  └────────────────────────────┘</span></span></code></pre></div><p><strong>PagedAttention 把这个心智搬到 KV Cache 上</strong>——一个请求逻辑上看到&quot;我有一段从 0 到 N 的 KV 序列&quot;,物理上是 N/block_size 个小块散在 KV 池子里,Block Table 做映射。</p><h3 id="_2-2-朴素-vs-pagedattention-的显存布局对比" tabindex="-1">2.2 朴素 vs PagedAttention 的显存布局对比 <a class="header-anchor" href="#_2-2-朴素-vs-pagedattention-的显存布局对比" aria-label="Permalink to &quot;2.2 朴素 vs PagedAttention 的显存布局对比&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>朴素实现(每个请求一整块连续):</span></span>
<span class="line"><span></span></span>
<span class="line"><span>KV 显存池:</span></span>
<span class="line"><span>┌──────────────┬──────────────┬──────────────┬──────────────┐</span></span>
<span class="line"><span>│ Request A    │ Request B    │ Request C    │ Request D    │</span></span>
<span class="line"><span>│ max=2048 tok │ max=2048 tok │ max=2048 tok │ max=2048 tok │</span></span>
<span class="line"><span>│ ████░░░░░░░░ │ ██████░░░░░░ │ ████████░░░░ │ ██░░░░░░░░░░ │</span></span>
<span class="line"><span>│ 用 50/2048   │ 用 800/2048  │ 用 1200/2048 │ 用 300/2048  │</span></span>
<span class="line"><span>└──────────────┴──────────────┴──────────────┴──────────────┘</span></span>
<span class="line"><span>     2% used      39% used      59% used       15% used    ← 平均利用 29%</span></span>
<span class="line"><span></span></span>
<span class="line"><span></span></span>
<span class="line"><span>PagedAttention(逻辑/物理分离):</span></span>
<span class="line"><span></span></span>
<span class="line"><span>逻辑视图(每个请求看到的连续序列):</span></span>
<span class="line"><span>  Request A: [tok0][tok1][tok2]...[tok49]                   (50 tokens)</span></span>
<span class="line"><span>  Request B: [tok0][tok1]...[tok799]                        (800 tokens)</span></span>
<span class="line"><span>  Request C: [tok0][tok1]...[tok1199]                       (1200 tokens)</span></span>
<span class="line"><span>  Request D: [tok0][tok1]...[tok299]                        (300 tokens)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>物理视图(KV 池由固定 block 组成,block_size=16):</span></span>
<span class="line"><span>┌──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┐</span></span>
<span class="line"><span>│B0│B1│B2│B3│B4│B5│B6│B7│B8│B9│..│..│..│..│..│..│..│..│..│Bn│</span></span>
<span class="line"><span>└──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┘</span></span>
<span class="line"><span>  ↓                                                          </span></span>
<span class="line"><span>  Block Table 把逻辑序列映射到物理 block 号:</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  A: [B7, B19, B42, B3]              (50 token / 16 = 4 个 block)</span></span>
<span class="line"><span>  B: [B11, B5, B22, ... 50 个 block]                       (800/16=50)</span></span>
<span class="line"><span>  C: [B0, B14, B8, ... 75 个 block]                       (1200/16=75)</span></span>
<span class="line"><span>  D: [B33, B41, B17, B12, ... 19 个 block]                (300/16=19)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  分配按需进行,blocks 池利用率 95%+</span></span></code></pre></div><p><strong>核心差别</strong>:逻辑上每个请求看到一段连续 KV(attention kernel 还是按位置取),物理上 block 散在池子各处。<strong>没用到的 block 留在池里给其他请求</strong>,不预留、不浪费、不碎片。</p><h3 id="_2-3-attention-kernel-怎么寻址" tabindex="-1">2.3 attention kernel 怎么寻址 <a class="header-anchor" href="#_2-3-attention-kernel-怎么寻址" aria-label="Permalink to &quot;2.3 attention kernel 怎么寻址&quot;">​</a></h3><p>朴素实现:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>attention(Q, K, V):</span></span>
<span class="line"><span>  K_full = K[0..seq_len, :, :]    # 直接按位置切连续切片</span></span>
<span class="line"><span>  scores = Q @ K_full.T           # 一把大 matmul</span></span></code></pre></div><p>PagedAttention kernel(伪代码,vLLM 的 paged_attention CUDA kernel 这么做):</p><div class="language-cpp vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">cpp</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">__global__ </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">void</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> paged_attention</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    Q, output,</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    block_table,</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">        // [num_seqs, max_num_blocks]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    K_cache, V_cache,</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">   // [num_blocks, block_size, num_kv_heads, d_head]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    seq_lens,</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    block_size </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 16</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">) {</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    int</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> seq_idx </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> blockIdx.x;</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    int</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> seq_len </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> seq_lens[seq_idx];</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    int</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> num_blocks </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (seq_len </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">+</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> block_size </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">-</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 1</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">) </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">/</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> block_size;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    </span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    for</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">int</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> b </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 0</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">; b </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">&lt;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> num_blocks; b</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">++</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">) {</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">        int</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> physical_block_num </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> block_table[seq_idx][b];</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">     // 间接寻址!</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        K_block </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> K_cache[physical_block_num];</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                 // 物理块取数据</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        V_block </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> V_cache[physical_block_num];</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        </span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">        // 算这个 block 内 token 跟 Q 的 attention</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        partial_score </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> Q @ K_block.T;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        ...</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    }</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    // softmax + 加权 V</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span></code></pre></div><p><strong>关键代价就在那一句&quot;间接寻址&quot;</strong>——每个 block 取数据前要先查 block_table。CPU 端做这层映射几乎没开销,但在 GPU 上,每个 SM 在 attention 计算时都要做这层间接,<strong>当 batch 小、block 数也小的时候,kernel launch overhead 占比会上升</strong>。后面讲局限会回到这一点。</p><hr><h2 id="三、block-table-的索引结构" tabindex="-1">三、Block Table 的索引结构 <a class="header-anchor" href="#三、block-table-的索引结构" aria-label="Permalink to &quot;三、Block Table 的索引结构&quot;">​</a></h2><h3 id="_3-1-数据组织" tabindex="-1">3.1 数据组织 <a class="header-anchor" href="#_3-1-数据组织" aria-label="Permalink to &quot;3.1 数据组织&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>KV 池子(物理):</span></span>
<span class="line"><span>┌──────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│ Block 0  Block 1  Block 2  ...  Block N-1                    │</span></span>
<span class="line"><span>│ ┌─────┐ ┌─────┐ ┌─────┐         ┌─────┐                       │</span></span>
<span class="line"><span>│ │16tok│ │16tok│ │16tok│   ...   │16tok│  每 block 装 16 个 token │</span></span>
<span class="line"><span>│ │K+V  │ │K+V  │ │K+V  │         │K+V  │  跨所有层(80 层 K + V) │</span></span>
<span class="line"><span>│ └─────┘ └─────┘ └─────┘         └─────┘                       │</span></span>
<span class="line"><span>└──────────────────────────────────────────────────────────────┘</span></span>
<span class="line"><span>                              ↑</span></span>
<span class="line"><span>                              N = gpu_memory_for_KV / block_bytes</span></span>
<span class="line"><span>                              典型 N 在几千到几万</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Block Table(逻辑 → 物理映射):</span></span>
<span class="line"><span>┌────────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  seq_id  │ logical block 0 → phy block | 1 → phy | ...     │</span></span>
<span class="line"><span>├──────────┼─────────────────────────────────────────────────┤</span></span>
<span class="line"><span>│   A      │       7        |    19      |   42   |   3      │</span></span>
<span class="line"><span>│   B      │      11        |     5      |   22   |  ...50个 │</span></span>
<span class="line"><span>│   C      │       0        |    14      |    8   |  ...75个 │</span></span>
<span class="line"><span>│   D      │      33        |    41      |   17   |   12 ... │</span></span>
<span class="line"><span>└──────────────────────────────────────────────────────────────┘</span></span></code></pre></div><p>每个序列只需要存一个数组(逻辑块号 → 物理块号),数组长度 = 已分配的 block 数。<strong>Block Table 本身的开销很小</strong>——一个 70B 模型 max_seq_len=128K 单请求最多 8K 个 block,Block Table 也就 32KB 不到。</p><h3 id="_3-2-一次-decode-step-发生什么" tabindex="-1">3.2 一次 decode step 发生什么 <a class="header-anchor" href="#_3-2-一次-decode-step-发生什么" aria-label="Permalink to &quot;3.2 一次 decode step 发生什么&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>请求 A 现在 seq_len = 47,要生成第 48 个 token:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>step 1:  KV 池里取出 Block 7, 19, 42, 3 的 K, V,跑 attention</span></span>
<span class="line"><span>         → 算出第 48 个 token 的 logits → 采样 → 得到新 token</span></span>
<span class="line"><span></span></span>
<span class="line"><span>step 2:  把新 token 的 K, V 写入 cache</span></span>
<span class="line"><span>         - 当前最后一个 block(Block 3)还有 16-(47 mod 16+1) = 0 个空位?</span></span>
<span class="line"><span>           查一下:47 = 2*16+15,所以 Block 3 已经装了 16 个 token,满了</span></span>
<span class="line"><span>         - 满了 → 从池子里分配新的 free block,假设拿到 Block 88</span></span>
<span class="line"><span>         - Block Table[A] 追加:[7, 19, 42, 3, 88]</span></span>
<span class="line"><span>         - 把新 token 的 K, V 写到 Block 88 的位置 0</span></span>
<span class="line"><span></span></span>
<span class="line"><span>step 3:  下一步 decode 时,Block Table[A] = [7, 19, 42, 3, 88],seq_len=48</span></span>
<span class="line"><span>         attention 取这 5 个 block</span></span></code></pre></div><p><strong>分配是&quot;按需&quot;和&quot;局部&quot;的</strong>——只有 block 满了才申请新的,其他请求一点不受影响。</p><h3 id="_3-3-block-size-为什么是-16" tabindex="-1">3.3 block_size 为什么是 16 <a class="header-anchor" href="#_3-3-block-size-为什么是-16" aria-label="Permalink to &quot;3.3 block_size 为什么是 16&quot;">​</a></h3><p>vLLM 默认 <code>block_size=16</code>,可以调到 8 / 32。三者权衡:</p><table tabindex="0"><thead><tr><th>block_size</th><th>优点</th><th>缺点</th></tr></thead><tbody><tr><td>1(逐 token)</td><td>几乎零内部碎片</td><td>Block Table 极长,attention kernel 间接寻址次数爆炸</td></tr><tr><td>16</td><td>内部碎片小(平均浪费 8 token)、kernel 间接寻址次数适中</td><td>平衡点,工程默认</td></tr><tr><td>64</td><td>Block Table 更短,kernel launch 更少</td><td>内部碎片大(平均浪费 32 token),短请求浪费明显</td></tr><tr><td>1024</td><td>退化成朴素实现</td><td>同朴素实现的浪费</td></tr></tbody></table><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>内部碎片(末块平均空着多少):</span></span>
<span class="line"><span>  block_size = 16  → 平均空 8 token,占请求 KV 的 0.4%(2000 token 请求)</span></span>
<span class="line"><span>  block_size = 32  → 平均空 16 token,占 0.8%</span></span>
<span class="line"><span>  block_size = 64  → 平均空 32 token,占 1.6%</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>kernel 间接寻址次数(seq_len=2000 的请求):</span></span>
<span class="line"><span>  block_size = 16  → 125 个 block</span></span>
<span class="line"><span>  block_size = 32  → 63 个 block</span></span>
<span class="line"><span>  block_size = 64  → 32 个 block</span></span></code></pre></div><p><strong>16 是经验最优</strong>——足够小让浪费忽略,又足够大让 kernel launch 摊薄。</p><hr><h2 id="四、显存碎片-从外部碎片到只剩末块" tabindex="-1">四、显存碎片:从外部碎片到只剩末块 <a class="header-anchor" href="#四、显存碎片-从外部碎片到只剩末块" aria-label="Permalink to &quot;四、显存碎片:从外部碎片到只剩末块&quot;">​</a></h2><h3 id="_4-1-朴素实现-vs-pagedattention-的碎片对比" tabindex="-1">4.1 朴素实现 vs PagedAttention 的碎片对比 <a class="header-anchor" href="#_4-1-朴素实现-vs-pagedattention-的碎片对比" aria-label="Permalink to &quot;4.1 朴素实现 vs PagedAttention 的碎片对比&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>朴素实现:</span></span>
<span class="line"><span>  外部碎片:严重(请求大小不一,释放后空洞难再用)</span></span>
<span class="line"><span>  内部碎片:严重(max_seq_len 预留,但实际生成短)</span></span>
<span class="line"><span>  整体浪费:60-80%</span></span>
<span class="line"><span></span></span>
<span class="line"><span>PagedAttention:</span></span>
<span class="line"><span>  外部碎片:消失(block 都一样大,池里任何 free block 都通用)</span></span>
<span class="line"><span>  内部碎片:只剩末块平均一半浪费(0.4% 左右,可忽略)</span></span>
<span class="line"><span>  整体浪费:&lt; 4%</span></span></code></pre></div><p><strong>KV 利用率从 30% 提到 95%+</strong>——这是 vLLM 比早期推理实现吞吐高一个数量级的最大单一原因。</p><h3 id="_4-2-一个量化对比" tabindex="-1">4.2 一个量化对比 <a class="header-anchor" href="#_4-2-一个量化对比" aria-label="Permalink to &quot;4.2 一个量化对比&quot;">​</a></h3><p>同一张 H100 80GB,Llama-3-70B BF16,4K max_seq_len 设定:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>朴素实现:</span></span>
<span class="line"><span>   KV 池能容纳 = 80 GB - 70 GB(权重) - 5 GB(其他) = 5 GB</span></span>
<span class="line"><span>   每请求预留 = 4K × 320KB = 1.28 GB</span></span>
<span class="line"><span>   并发上限 = 5 / 1.28 = 3 个请求</span></span>
<span class="line"><span>   实际平均使用 ≈ 30% → 浪费 1 GB / 请求</span></span>
<span class="line"><span>   有效请求体验:3 个请求,每个真实长度 &lt; 4K</span></span>
<span class="line"><span></span></span>
<span class="line"><span>PagedAttention(同样的硬件配置,加上 TP=2 把权重摊薄):</span></span>
<span class="line"><span>   KV 池能容纳 ≈ 30 GB</span></span>
<span class="line"><span>   每个 block(block_size=16,80 层 GQA-8) ≈ 80 × 4096 = 5 KB / 层(实际更紧凑)</span></span>
<span class="line"><span>   全部 block 数 ≈ 30 GB / 320 KB × 16 / 16 ≈ 数千个 block</span></span>
<span class="line"><span>   并发上限 = 几十个请求(按实际长度分配,不预留)</span></span></code></pre></div><p>数字上的差距就是工程上的差距——同一张卡,<strong>并发上限差一个数量级</strong>。</p><hr><h2 id="五、copy-on-write-并行采样的-kv-共享" tabindex="-1">五、Copy-on-Write:并行采样的 KV 共享 <a class="header-anchor" href="#五、copy-on-write-并行采样的-kv-共享" aria-label="Permalink to &quot;五、Copy-on-Write:并行采样的 KV 共享&quot;">​</a></h2><h3 id="_5-1-并行采样是什么" tabindex="-1">5.1 并行采样是什么 <a class="header-anchor" href="#_5-1-并行采样是什么" aria-label="Permalink to &quot;5.1 并行采样是什么&quot;">​</a></h3><p><code>num_return_sequences=4</code> 或者 <code>n=4</code>:<strong>一个 prompt 同时采样 4 条不同的输出</strong>(常见于 best-of-N、RLHF rollout、Tree-of-Thought)。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Prompt: &quot;讲一个笑话&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>朴素做法:</span></span>
<span class="line"><span>  开 4 个独立请求,每个跑完整 prefill + decode</span></span>
<span class="line"><span>  KV 占用 = 4 × prompt_kv + 4 × generated_kv</span></span>
<span class="line"><span>  Prompt 占用部分是完全重复的浪费(4 份相同 prompt KV)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>PagedAttention + CoW:</span></span>
<span class="line"><span>  Prompt 只 prefill 一次,4 条采样共享同一份 prompt KV 块</span></span>
<span class="line"><span>  分歧后,各自的新 token 写到自己的新 block</span></span>
<span class="line"><span>  KV 占用 = 1 × prompt_kv + 4 × generated_kv</span></span></code></pre></div><h3 id="_5-2-一张图" tabindex="-1">5.2 一张图 <a class="header-anchor" href="#_5-2-一张图" aria-label="Permalink to &quot;5.2 一张图&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Prompt prefill 完成,4 条采样开始之前:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  Logical seq 1: [Block 7, Block 19, Block 42]  ← 共享</span></span>
<span class="line"><span>  Logical seq 2: [Block 7, Block 19, Block 42]  ← 共享</span></span>
<span class="line"><span>  Logical seq 3: [Block 7, Block 19, Block 42]  ← 共享</span></span>
<span class="line"><span>  Logical seq 4: [Block 7, Block 19, Block 42]  ← 共享</span></span>
<span class="line"><span>                  └─ Block ref_count = 4 ─┘</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  Block 42 内还有 8 个空位(prompt 长度刚好填 40 个 token)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>4 条采样各自走了几步 decode,token 不同:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  Logical seq 1: [Block 7, Block 19, Block 42*, Block 51]</span></span>
<span class="line"><span>  Logical seq 2: [Block 7, Block 19, Block 42*, Block 88]</span></span>
<span class="line"><span>  Logical seq 3: [Block 7, Block 19, Block 42*, Block 19_new]   </span></span>
<span class="line"><span>  Logical seq 4: [Block 7, Block 19, Block 42*, Block 33]</span></span>
<span class="line"><span>                  └─ Block 42* 是怎么回事?─┘</span></span>
<span class="line"><span>                  </span></span>
<span class="line"><span>  问题:第一个分歧 token 要写到 Block 42 的位置 41(空位 0)</span></span>
<span class="line"><span>        但 4 条采样的第 41 个 token 不一样,</span></span>
<span class="line"><span>        不能都写到同一个物理 block</span></span>
<span class="line"><span>        </span></span>
<span class="line"><span>  Copy-on-Write:第一个想写的采样把 Block 42 复制成 Block 42a,</span></span>
<span class="line"><span>                 把 Block 42 的内容拷过去,再写自己的新 token</span></span>
<span class="line"><span>                 之后其他采样各自再 CoW 出 42b, 42c, 42d</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  结果:</span></span>
<span class="line"><span>    Logical seq 1: [B7, B19, B42a]</span></span>
<span class="line"><span>    Logical seq 2: [B7, B19, B42b]</span></span>
<span class="line"><span>    Logical seq 3: [B7, B19, B42c]</span></span>
<span class="line"><span>    Logical seq 4: [B7, B19, B42d]</span></span>
<span class="line"><span>    </span></span>
<span class="line"><span>    Block 7 和 Block 19 仍然共享(还没动到末位)</span></span>
<span class="line"><span>    Block 42 内容被复制了 4 份,代价是一次 block 拷贝(16 token × KV 字节)</span></span></code></pre></div><p><strong>节省效果</strong>:prompt 长度 1000 token,采样 4 条各生成 200 token:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>朴素:        4 × (1000 + 200) × 320 KB = 1.5 GB</span></span>
<span class="line"><span>CoW:        (1000 + 4×200) × 320 KB    + 16-token 拷贝开销</span></span>
<span class="line"><span>            = 1800 × 320 KB ≈ 575 MB</span></span>
<span class="line"><span>            </span></span>
<span class="line"><span>节省 60%+,采样数越多收益越显著</span></span></code></pre></div><hr><h2 id="六、prefix-caching-多请求复用系统提示" tabindex="-1">六、Prefix Caching:多请求复用系统提示 <a class="header-anchor" href="#六、prefix-caching-多请求复用系统提示" aria-label="Permalink to &quot;六、Prefix Caching:多请求复用系统提示&quot;">​</a></h2><h3 id="_6-1-场景" tabindex="-1">6.1 场景 <a class="header-anchor" href="#_6-1-场景" aria-label="Permalink to &quot;6.1 场景&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>请求 1: [system: 你是助手...] [user: 帮我写代码]    (sys=2000 tok, user=10)</span></span>
<span class="line"><span>请求 2: [system: 你是助手...] [user: 解释一下...]    (sys=2000 tok, user=20)</span></span>
<span class="line"><span>请求 3: [system: 你是助手...] [user: 翻译这段]      (sys=2000 tok, user=15)</span></span>
<span class="line"><span>...</span></span>
<span class="line"><span></span></span>
<span class="line"><span>每个请求开头都是同样的 system prompt(假设 2000 token)。</span></span>
<span class="line"><span>朴素:每个请求都对 system 部分跑 prefill,每个都建一份 KV。</span></span>
<span class="line"><span>Prefix Caching:第一次见到这个 system,prefill 完留下 KV;后续请求来,</span></span>
<span class="line"><span>                查询是否有匹配前缀,命中就直接挪用,跳过 prefill。</span></span></code></pre></div><h3 id="_6-2-vllm-怎么做命中检测" tabindex="-1">6.2 vLLM 怎么做命中检测 <a class="header-anchor" href="#_6-2-vllm-怎么做命中检测" aria-label="Permalink to &quot;6.2 vLLM 怎么做命中检测&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>拿到新请求的 prompt:</span></span>
<span class="line"><span>  把 prompt 按 block_size 切成 block 序列</span></span>
<span class="line"><span>  对每个 block,算 hash(block 内 token + 前文 hash)</span></span>
<span class="line"><span>    → 链式哈希,只有前面所有 block 都一致才匹配</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  从前往后找最长匹配的 block 序列:</span></span>
<span class="line"><span>    request: [hash_a, hash_b, hash_c, hash_d]</span></span>
<span class="line"><span>    cache:   {hash_a: Block 7, hash_b: Block 19, ...}</span></span>
<span class="line"><span>    </span></span>
<span class="line"><span>    最长前缀匹配:[hash_a, hash_b, hash_c] → [Block 7, 19, 42]</span></span>
<span class="line"><span>    </span></span>
<span class="line"><span>  命中部分:三个 block(48 个 token)的 prefill 全跳过</span></span>
<span class="line"><span>  未命中部分:从第 4 个 block 开始 prefill</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  对应的物理 block 引用计数 +1(被新请求复用)</span></span></code></pre></div><p><strong>链式哈希的关键</strong>:hash 包含前文,<strong>任何一个 token 不同后续就不再命中</strong>。所以 system prompt 不能有动态内容(时间戳、随机 ID、user_id 等),否则命中率立刻 0。</p><h3 id="_6-3-实测" tabindex="-1">6.3 实测 <a class="header-anchor" href="#_6-3-实测" aria-label="Permalink to &quot;6.3 实测&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>场景:同一个 system prompt 2000 token,batch 10 个请求各异</span></span>
<span class="line"><span>  朴素:每请求 prefill 2010 token → 总计 20100 token prefill</span></span>
<span class="line"><span>  Prefix Caching:首请求 prefill 2010,后 9 个各 prefill 10 → 总计 2100</span></span>
<span class="line"><span>                  → 节省 89%</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  TTFT 影响:首请求和朴素一样,后续请求 TTFT 接近瞬时(只算 user 部分)</span></span></code></pre></div><p><strong>Prefix Caching 是当下生产 LLM 服务的免费午餐</strong>——没有副作用,vLLM <code>--enable-prefix-caching</code> 一开就有,system prompt 长的场景立刻见效。Agent / 多轮场景 SGLang 的 RadixAttention 更彻底,详见 10 篇。</p><hr><h2 id="七、工程落地-启动一个-vllm-服务" tabindex="-1">七、工程落地:启动一个 vLLM 服务 <a class="header-anchor" href="#七、工程落地-启动一个-vllm-服务" aria-label="Permalink to &quot;七、工程落地:启动一个 vLLM 服务&quot;">​</a></h2><h3 id="_7-1-最小可跑配置" tabindex="-1">7.1 最小可跑配置 <a class="header-anchor" href="#_7-1-最小可跑配置" aria-label="Permalink to &quot;7.1 最小可跑配置&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Llama-3-70B + 32K 上下文,2 卡 H100</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">python</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -m</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> vllm.entrypoints.openai.api_server</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --model</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> meta-llama/Meta-Llama-3.1-70B-Instruct</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --tensor-parallel-size</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 2</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --max-model-len</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 32768</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --block-size</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 16</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --enable-prefix-caching</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --gpu-memory-utilization</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 0.92</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --max-num-seqs</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 64</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --port</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 8000</span></span></code></pre></div><p>三个最关键参数:</p><table tabindex="0"><thead><tr><th>参数</th><th>含义</th><th>调它影响什么</th></tr></thead><tbody><tr><td><code>--block-size</code></td><td>KV 块大小(默认 16)</td><td>大 → kernel launch 少但末块碎片大;小反之</td></tr><tr><td><code>--enable-prefix-caching</code></td><td>开 Prefix Cache</td><td>多请求共享 system prompt 时立省</td></tr><tr><td><code>--gpu-memory-utilization</code></td><td>框架占用显存比例(默认 0.9)</td><td>高 → KV 池更大,但留给临时 buffer 少,易 OOM</td></tr></tbody></table><p>辅助参数:</p><table tabindex="0"><thead><tr><th>参数</th><th>含义</th></tr></thead><tbody><tr><td><code>--max-num-seqs</code></td><td>并发上限(KV 池能装多少请求)</td></tr><tr><td><code>--max-num-batched-tokens</code></td><td>每 step 总 token 数上限(09 篇展开)</td></tr><tr><td><code>--swap-space</code></td><td>KV 满时换出到 CPU 的空间大小(GB)</td></tr><tr><td><code>--kv-cache-dtype</code></td><td>KV 存储精度(fp8 / auto,23 篇展开)</td></tr></tbody></table><h3 id="_7-2-监控-prefix-cache-命中率" tabindex="-1">7.2 监控 Prefix Cache 命中率 <a class="header-anchor" href="#_7-2-监控-prefix-cache-命中率" aria-label="Permalink to &quot;7.2 监控 Prefix Cache 命中率&quot;">​</a></h3><div class="language-python vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">python</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># vLLM 暴露的 Prometheus 指标</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">vllm:gpu_prefix_cache_queries_total      </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 查询次数</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">vllm:gpu_prefix_cache_hits_total         </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 命中次数</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">vllm:gpu_prefix_cache_hit_rate           </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 命中率(派生)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Python 内嵌时:</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">from</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> vllm </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">import</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> LLM</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, SamplingParams</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">llm </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> LLM(</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">model</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;...&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">enable_prefix_caching</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">True</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">outputs </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> llm.generate(prompts, sampling_params)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 看 stats</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">print</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(llm.llm_engine.scheduler.block_manager.get_prefix_cache_hit_rate())</span></span></code></pre></div><p>健康基线:</p><table tabindex="0"><thead><tr><th>场景</th><th>期望命中率</th></tr></thead><tbody><tr><td>同一长 system prompt 多请求</td><td>80-99%</td></tr><tr><td>Chat 单轮、prompt 差异大</td><td>5-20%</td></tr><tr><td>Agent 多轮(prompt 累加历史)</td><td>50-80%,但 vLLM 在多轮上不如 SGLang(详见 10)</td></tr></tbody></table><p><strong>命中率低于预期</strong> → 检查 system 是不是含动态内容,或者切到 SGLang(10 篇)。调度参数(<code>max-num-seqs</code> / <code>max-num-batched-tokens</code>)的排错流程在 09 篇展开。</p><hr><h2 id="八、pagedattention-的代价与局限" tabindex="-1">八、PagedAttention 的代价与局限 <a class="header-anchor" href="#八、pagedattention-的代价与局限" aria-label="Permalink to &quot;八、PagedAttention 的代价与局限&quot;">​</a></h2><h3 id="_8-1-间接寻址的-kernel-overhead" tabindex="-1">8.1 间接寻址的 kernel overhead <a class="header-anchor" href="#_8-1-间接寻址的-kernel-overhead" aria-label="Permalink to &quot;8.1 间接寻址的 kernel overhead&quot;">​</a></h3><p>attention kernel 现在每次读 K, V 都要先查 block_table,在小 batch 下这层开销不能忽略。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>batch = 1, seq_len = 200:</span></span>
<span class="line"><span>  block 数 = 200 / 16 = 13 个</span></span>
<span class="line"><span>  每次 decode 要做 13 次 block_table 查询 + 13 次跨 block 读</span></span>
<span class="line"><span>  vs 朴素一次连续读 200 token</span></span>
<span class="line"><span>  → kernel time 多 5-15% 不等</span></span>
<span class="line"><span></span></span>
<span class="line"><span>batch = 32, seq_len = 2000:</span></span>
<span class="line"><span>  block 数 × batch = 32 × 125 = 4000 个 block 引用</span></span>
<span class="line"><span>  kernel 完全 memory-bound,这点间接寻址几乎免费</span></span>
<span class="line"><span>  实测 kernel time 与朴素差距 &lt; 2%</span></span></code></pre></div><p><strong>结论</strong>:batch 越大、kernel 越 memory-bound,PagedAttention 的间接开销越接近零;<strong>单请求 batch=1 的场景下它不是免费午餐</strong>(但本来 batch=1 也没什么生产意义)。</p><h3 id="_8-2-不擅长的场景" tabindex="-1">8.2 不擅长的场景 <a class="header-anchor" href="#_8-2-不擅长的场景" aria-label="Permalink to &quot;8.2 不擅长的场景&quot;">​</a></h3><ol><li><strong>极小 batch(单用户、流式 batch=1)</strong>——间接寻址开销显得明显,朴素实现+小连续显存能更快</li><li><strong>不需要长 context 的纯短回复服务</strong>——浪费的预留也不大,PagedAttention 收益没那么显著</li><li><strong>请求形态完全独立无共享</strong>——Prefix Cache 无效,只剩 PagedAttention 本体的收益</li><li><strong>block_size 调不当</strong>——太小 kernel overhead 重,太大碎片不容忽视</li></ol><h3 id="_8-3-不是它解决的问题" tabindex="-1">8.3 不是它解决的问题 <a class="header-anchor" href="#_8-3-不是它解决的问题" aria-label="Permalink to &quot;8.3 不是它解决的问题&quot;">​</a></h3><ul><li><strong>decode 的 memory-bound 本质</strong>——PagedAttention 不会让一次 forward 变快,它解的是&quot;装得下更多并发&quot;,并发上去才间接降本(通过 batch 摊薄权重搬运)</li><li><strong>长 context 的 KV 总量</strong>——PagedAttention 让 KV 池利用率从 30% 提到 95%,但 KV 总字节数没动;那个要靠 KV 量化(23 篇)</li><li><strong>多轮 / 分支的复杂共享</strong>——PagedAttention + Prefix Cache 命中粒度粗,Agent 多轮场景命中率低;那个要靠 RadixAttention(10 篇)</li></ul><p><strong>PagedAttention 解的是&quot;KV 在显存里怎么摆放&quot;这一个具体问题</strong>——它不是推理引擎的全部,但它是 vLLM 之所以是 vLLM 的核心一招。</p><hr><h2 id="九、看完这一篇-你应该能" tabindex="-1">九、看完这一篇,你应该能 <a class="header-anchor" href="#九、看完这一篇-你应该能" aria-label="Permalink to &quot;九、看完这一篇,你应该能&quot;">​</a></h2><ul><li>解释朴素 KV 分配为什么浪费 60-80%(max_seq_len 预留 + 外部碎片)</li><li>在白板上画出 Block Table:逻辑序列 → 物理 block 号的映射</li><li>说清 block_size=16 是怎么选出来的(末块碎片 vs kernel 间接寻址的权衡)</li><li>算出 PagedAttention 把 KV 利用率从 30% 提到 95%+,并发上限直接差一个数量级</li><li>解释 Copy-on-Write 让并行采样的 prompt KV 只算一次,采样 N 条节省 (N-1) × prompt_kv</li><li>解释 Prefix Caching 的链式哈希命中机制,以及为什么 system prompt 不能含动态内容</li><li>拿到一个 vLLM 服务故障(TTFT 高 / 抢占多),按 KV 池利用率 → 抢占 → cache 命中率三步排查</li><li>说出 PagedAttention 不能解决什么(KV 总量、复杂多轮共享、decode 的 memory-bound)</li></ul><p>下一篇:<strong>09 Continuous Batching</strong> — PagedAttention 解了显存布局,但调度还得专门设计:每个 decode step 重新决定 batch 里有谁,新请求即来即加,完成请求即走即出,prefill 和 decode 还能混跑(chunked prefill)。从静态批 → 动态批 → 连续批,三代调度怎么演化。</p>`,100)])])}const g=a(e,[["render",l]]);export{r as __pageData,g as default};
