import{_ as a,H as n,f as p,i}from"./chunks/framework.BHvCMIhP.js";const k=JSON.parse('{"title":"Continuous Batching:每一步都能换人的批调度","description":"","frontmatter":{},"headers":[],"relativePath":"../aiInfraLearning/09-连续批处理.md","filePath":"../aiInfraLearning/09-连续批处理.md","lastUpdated":1778649484000}'),e={name:"../aiInfraLearning/09-连续批处理.md"};function t(l,s,h,d,c,r){return n(),p("div",null,[...s[0]||(s[0]=[i(`<h1 id="continuous-batching-每一步都能换人的批调度" tabindex="-1">Continuous Batching:每一步都能换人的批调度 <a class="header-anchor" href="#continuous-batching-每一步都能换人的批调度" aria-label="Permalink to &quot;Continuous Batching:每一步都能换人的批调度&quot;">​</a></h1><p>08 篇把 KV 在显存里怎么摆解了,但还有一件事没说:<strong>什么时候让谁进 batch、什么时候让谁出</strong>。早期推理服务的批调度跟 Web 后端的批处理是一个套路——攒一批一起发,大家一起结束。问题是 LLM 不像普通 Web 请求:<strong>生成长度天差地别</strong>,有的请求 50 token 就 EOS,有的要 2000 token。一批里只要有一个跑长的,其他短的全得陪它跑完才能下一批。这就是&quot;队头阻塞&quot;,<strong>GPU 一半时间在等最慢的请求结束</strong>。Continuous Batching(vLLM 叫这个,TRT-LLM 叫 In-flight Batching,本质同一个东西)的核心想法是:<strong>别等齐,每个 decode step 都重新决定 batch 里有谁</strong>——新请求即来即加、完成请求即走即出。这一篇拆三代批调度的演化,以及生产里调它的关键旋钮。</p><blockquote><p>一句话先记住:<strong>Continuous Batching = 每个 decode step 都重新组 batch,新请求在 prefill 完成后即刻加入正在跑的 decode batch,完成的请求立即让位</strong>。最大单一吞吐提升手段(对静态批通常 5-20x),代价是调度器复杂得多;chunked prefill 让长 prompt 不阻塞 decode batch,是 2024 之后的默认开关。调优靠 <code>max-num-seqs</code> 和 <code>max-num-batched-tokens</code> 两个旋钮,过大会导致 KV 满抢占频繁,过小 GPU 闲。</p></blockquote><hr><h2 id="一、三代批调度的演化" tabindex="-1">一、三代批调度的演化 <a class="header-anchor" href="#一、三代批调度的演化" aria-label="Permalink to &quot;一、三代批调度的演化&quot;">​</a></h2><h3 id="_1-1-静态批-static-batching" tabindex="-1">1.1 静态批(Static Batching) <a class="header-anchor" href="#_1-1-静态批-static-batching" aria-label="Permalink to &quot;1.1 静态批(Static Batching)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>最早的做法——攒一批一起发,一起结束:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>t=0:        [收到请求 A] 等一会</span></span>
<span class="line"><span>t=100ms:    [收到请求 B] 等一会</span></span>
<span class="line"><span>t=200ms:    [收到请求 C, D] 凑齐 batch_size=4 → 触发推理</span></span>
<span class="line"><span>t=200ms+:   一起 prefill,一起 decode</span></span>
<span class="line"><span></span></span>
<span class="line"><span>请求生成长度:A=50, B=200, C=300, D=2000</span></span>
<span class="line"><span></span></span>
<span class="line"><span>时序图:</span></span>
<span class="line"><span>  ────────────────────────────────────────────→ 时间</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  [A prefill][AAAAAAAAAA EOS]                            (50 步)</span></span>
<span class="line"><span>  [B prefill][BBBBBBBBBBBBBBBBBBBB BOS]                  (200 步)</span></span>
<span class="line"><span>  [C prefill][CCCCCCCCCCCCCCCCCCCCCCCCCC EOS]            (300 步)</span></span>
<span class="line"><span>  [D prefill][DDDDDDDDDDDDDDDDDDDDDDDDDDDDD ... EOS]     (2000 步)</span></span>
<span class="line"><span>                                                          ↑</span></span>
<span class="line"><span>                                                          整批等 D 跑完才能换下批</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>GPU 利用率:</span></span>
<span class="line"><span>  step 0-50:    4 个活跃          → GPU 高</span></span>
<span class="line"><span>  step 50-200:  3 个活跃 (A 完了) → GPU 中等</span></span>
<span class="line"><span>  step 200-300: 2 个活跃          → GPU 低</span></span>
<span class="line"><span>  step 300-2000:1 个活跃 (只剩 D) → GPU 极低,大部分算力闲置</span></span></code></pre></div><p><strong>问题</strong>:</p><ol><li><strong>队头阻塞</strong>:最长的请求拖死全 batch</li><li><strong>凑批延迟</strong>:要等 batch_size 凑齐才发,首请求 TTFT 大幅增加</li><li><strong>GPU 利用率周期性塌方</strong>:batch 里请求越来越少,卡越来越闲</li><li><strong>batch_size 难调</strong>:太大凑不齐拖延迟,太小吞吐起不来</li></ol><h3 id="_1-2-动态批-dynamic-batching" tabindex="-1">1.2 动态批(Dynamic Batching) <a class="header-anchor" href="#_1-2-动态批-dynamic-batching" aria-label="Permalink to &quot;1.2 动态批(Dynamic Batching)&quot;">​</a></h3><p>NVIDIA Triton Inference Server 的默认行为,常用于普通 NN 推理:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>调度器有个等待窗口(比如 50ms):</span></span>
<span class="line"><span>  t=0:       请求 A 进队,启动等待计时</span></span>
<span class="line"><span>  t=20ms:    请求 B 进队,加入正在等的批</span></span>
<span class="line"><span>  t=50ms:    超时,有几个就发几个(假设这时有 A、B、C)</span></span>
<span class="line"><span>             → 触发推理</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>特点:</span></span>
<span class="line"><span>  - 长度相近的请求会被尽量合并到同一批</span></span>
<span class="line"><span>  - 等待窗口是工程参数(吞吐 vs 延迟权衡)</span></span>
<span class="line"><span>  - 一批发出后,中间不再加入新请求</span></span>
<span class="line"><span>  - 等齐这批跑完才能下一批</span></span></code></pre></div><p>动态批比静态批好一些(不用死等 batch_size 凑齐),但<strong>队头阻塞还在</strong>——一批发出后,中间没法塞新请求,长请求仍然拖死全批。Triton 默认就是这种,对 CV 模型(每个请求计算量类似)够用,<strong>对 LLM 是灾难</strong>。</p><h3 id="_1-3-连续批-continuous-batching" tabindex="-1">1.3 连续批(Continuous Batching) <a class="header-anchor" href="#_1-3-连续批-continuous-batching" aria-label="Permalink to &quot;1.3 连续批(Continuous Batching)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>核心改变:每个 decode step,调度器都重新决定这一步谁跑</span></span>
<span class="line"><span></span></span>
<span class="line"><span>t=0ms:    请求 A 到 → prefill → 进 decode batch</span></span>
<span class="line"><span>t=10ms:   [decode step 1] batch = {A}</span></span>
<span class="line"><span>t=20ms:   请求 B 到 → 等下一个 step 空位</span></span>
<span class="line"><span>t=30ms:   [decode step 2] B 完成 prefill → 加入 batch</span></span>
<span class="line"><span>                          batch = {A, B}</span></span>
<span class="line"><span>t=40ms:   请求 C 到</span></span>
<span class="line"><span>t=50ms:   [decode step 3] C 完成 prefill → batch = {A, B, C}</span></span>
<span class="line"><span>t=60ms:   [decode step 4] A 出了 EOS → 移出 batch</span></span>
<span class="line"><span>                          batch = {B, C}</span></span>
<span class="line"><span>t=70ms:   请求 D 到</span></span>
<span class="line"><span>t=80ms:   [decode step 5] D 加入 batch = {B, C, D}</span></span>
<span class="line"><span>...</span></span>
<span class="line"><span></span></span>
<span class="line"><span>关键点:每 step 都可以加可以减,不等齐</span></span></code></pre></div><p><strong>时序图</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                         Continuous Batching</span></span>
<span class="line"><span>─────────────────────────────────────────────────────────→ 时间</span></span>
<span class="line"><span></span></span>
<span class="line"><span>A: [prefill]AAAA EOS</span></span>
<span class="line"><span>B:       [prefill]BBBBBBBBBBBBBBBBBBBB EOS</span></span>
<span class="line"><span>C:            [prefill]CCCCCCCCCCCCCCCCCC EOS</span></span>
<span class="line"><span>D:                  [prefill]DDDDDDDDDDDDDDDDDDDDDDDDDDDD ... EOS</span></span>
<span class="line"><span>E:                       [prefill]EEEEEEEEEEEEEE EOS</span></span>
<span class="line"><span>F:                            [prefill]FFFFFFFFFFF EOS</span></span>
<span class="line"><span>                              ...</span></span>
<span class="line"><span></span></span>
<span class="line"><span>GPU 利用率:每个 step 内 batch 大小相对稳定,几乎不出现 batch=1 的低谷</span></span></code></pre></div><p><strong>核心收益</strong>:GPU 在长生成请求的尾部不会变成单请求,<strong>有新请求源源不断顶上来</strong>,batch 维持在一个高位,卡始终在跑活。</p><h3 id="_1-4-三代对比" tabindex="-1">1.4 三代对比 <a class="header-anchor" href="#_1-4-三代对比" aria-label="Permalink to &quot;1.4 三代对比&quot;">​</a></h3><table tabindex="0"><thead><tr><th>维度</th><th>静态批</th><th>动态批</th><th>连续批</th></tr></thead><tbody><tr><td>何时凑批</td><td>攒满或超时</td><td>时间窗口</td><td>每个 step 都可换人</td></tr><tr><td>队头阻塞</td><td>严重</td><td>严重</td><td>消失</td></tr><tr><td>凑批延迟 (TTFT)</td><td>高</td><td>中</td><td>几乎零(新请求即来即 prefill)</td></tr><tr><td>GPU 利用率</td><td>低,后段塌方</td><td>中</td><td>高,持续</td></tr><tr><td>实现复杂度</td><td>低</td><td>中</td><td>高(调度器要管 KV 池、prefill/decode 混跑)</td></tr><tr><td>代表</td><td>早期 transformers</td><td>Triton 默认</td><td>vLLM / SGLang / TRT-LLM</td></tr><tr><td>LLM 上吞吐</td><td>1x</td><td>1.5-2x</td><td>5-20x</td></tr></tbody></table><p><strong>对 LLM 推理,连续批不是优化,是必需</strong>——所有现代推理引擎都默认这么做。<strong>听到任何引擎说&quot;不支持 continuous batching&quot;,直接跳过</strong>。</p><hr><h2 id="二、三代时序对比图" tabindex="-1">二、三代时序对比图 <a class="header-anchor" href="#二、三代时序对比图" aria-label="Permalink to &quot;二、三代时序对比图&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>            横轴时间,纵轴 GPU SM 利用率</span></span>
<span class="line"><span></span></span>
<span class="line"><span>静态批(batch_size=4,生成长度 50/200/300/2000):</span></span>
<span class="line"><span>   GPU%  ↑</span></span>
<span class="line"><span>   100%  │     ┌─────┐</span></span>
<span class="line"><span>         │     │     │</span></span>
<span class="line"><span>    75%  │     │     └─────┐</span></span>
<span class="line"><span>         │     │           └────────┐</span></span>
<span class="line"><span>    50%  │     │                    │</span></span>
<span class="line"><span>         │     │                    └───────────┐</span></span>
<span class="line"><span>    25%  │ ┌───┘                                │</span></span>
<span class="line"><span>         │ │                                    └─── 等 D 跑完</span></span>
<span class="line"><span>         │_│____________________________________________→ 时间</span></span>
<span class="line"><span>            ↑ 凑批等待                      ↑ 只剩 D 一个,SM 大量空闲</span></span>
<span class="line"><span></span></span>
<span class="line"><span>动态批:同样塌方,只是凑批等待变短</span></span>
<span class="line"><span></span></span>
<span class="line"><span>         GPU%  ↑</span></span>
<span class="line"><span>         100%  │   ┌────┐</span></span>
<span class="line"><span>               │   │    │</span></span>
<span class="line"><span>          75%  │   │    └────┐</span></span>
<span class="line"><span>               │   │         └───────┐</span></span>
<span class="line"><span>          50%  │   │                 │</span></span>
<span class="line"><span>               │   │                 └────────┐</span></span>
<span class="line"><span>          25%  │ ┌─┘                          │</span></span>
<span class="line"><span>               │ │                            └────</span></span>
<span class="line"><span>               │_│________________________________________→ 时间</span></span>
<span class="line"><span></span></span>
<span class="line"><span></span></span>
<span class="line"><span>连续批(每 step 都有新请求顶上):</span></span>
<span class="line"><span>   GPU%  ↑</span></span>
<span class="line"><span>   100%  │ ┌─────────────────────────────────────────</span></span>
<span class="line"><span>         │ │</span></span>
<span class="line"><span>    75%  │ │</span></span>
<span class="line"><span>         │ │</span></span>
<span class="line"><span>    50%  │ │</span></span>
<span class="line"><span>         │ │</span></span>
<span class="line"><span>    25%  │ │</span></span>
<span class="line"><span>         │ │</span></span>
<span class="line"><span>         │_│_______________________________________________→ 时间</span></span>
<span class="line"><span>            ↑ 首请求一来就跑,新请求源源不断补 batch</span></span></code></pre></div><p><strong>核心收益不在峰值,在持续</strong>——静态批峰值也能到 100%,但只有几十毫秒;连续批能让 GPU 持续在 70-90% 这条线上跑几小时。</p><hr><h2 id="三、continuous-batching-的实现要点" tabindex="-1">三、Continuous Batching 的实现要点 <a class="header-anchor" href="#三、continuous-batching-的实现要点" aria-label="Permalink to &quot;三、Continuous Batching 的实现要点&quot;">​</a></h2><h3 id="_3-1-调度器在每个-step-做什么" tabindex="-1">3.1 调度器在每个 step 做什么 <a class="header-anchor" href="#_3-1-调度器在每个-step-做什么" aria-label="Permalink to &quot;3.1 调度器在每个 step 做什么&quot;">​</a></h3><p>vLLM 的调度器(Scheduler)在每个 decode step 之前要做一连串决策:</p><div class="language-python vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">python</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 极简伪代码</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">def</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> schedule_one_step</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">():</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # 1. 当前在跑的请求列表 (running)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    running </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.running   </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 正在 decode 的请求</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    waiting </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.waiting   </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 排队等 prefill 的新请求</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    swapped </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.swapped   </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 之前被抢占,KV 已换出 CPU 的请求</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    </span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # 2. 检查完成的请求 (生成了 EOS / 到 max_tokens)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    for</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> req </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">in</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> running:</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">        if</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> req.is_finished():</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            running.remove(req)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            free_blocks(req)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    </span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # 3. 尝试把 waiting 队列的请求 prefill 进来</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    while</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> waiting </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">and</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> can_fit_prefill(waiting[</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">0</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]):</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        new_req </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> waiting.popleft()</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        do_prefill(new_req)              </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># prefill 完成的 KV 进池</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        running.append(new_req)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    </span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # 4. 尝试把 swapped 队列的请求换回来</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    while</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> swapped </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">and</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> can_fit(swapped[</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">0</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]):</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        req </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> swapped.popleft()</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        swap_in(req)                      </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 从 CPU 换回 GPU</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        running.append(req)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    </span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # 5. KV 不够装下当前 running 怎么办?</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    while</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> not</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> enough_kv_for(running):</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        victim </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> choose_victim(running)   </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 选一个倒霉蛋</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">        if</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> can_swap_to_cpu(victim):</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            swap_out(victim)              </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 换出 KV 到 CPU</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            swapped.append(victim)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">        else</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            preempt(victim)               </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># KV 全丢弃,后面再重 prefill</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            waiting.append(victim)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        running.remove(victim)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    </span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # 6. 真正调用 forward</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    forward(running)                       </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 这一步的 batch = running</span></span></code></pre></div><p><strong>每个 step 这一套都要走一遍</strong>——所以调度器的逻辑性能也很关键(早期 vLLM 在百级 batch 时 scheduler 本身就要几毫秒,后来优化掉了大头)。</p><h3 id="_3-2-prefill-和-decode-混跑-chunked-prefill" tabindex="-1">3.2 Prefill 和 Decode 混跑:Chunked Prefill <a class="header-anchor" href="#_3-2-prefill-和-decode-混跑-chunked-prefill" aria-label="Permalink to &quot;3.2 Prefill 和 Decode 混跑:Chunked Prefill&quot;">​</a></h3><p>朴素做法是把 prefill 和 decode 分开处理:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>朴素策略(早期 vLLM v0.2 之前):</span></span>
<span class="line"><span>  step k:    完整 batch decode</span></span>
<span class="line"><span>  收到新请求 → 进 waiting 队</span></span>
<span class="line"><span>  下一个空 step:整个一步只跑这一个新请求的 prefill(没有 decode)</span></span>
<span class="line"><span>  完成后回到 decode 模式</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>问题:prefill 长 prompt(比如 4K token)在 H100 上要 100-300ms</span></span>
<span class="line"><span>      → 这段时间 decode batch 全停 → TPOT 抖动</span></span>
<span class="line"><span>      → 用户体感:打字一会一卡</span></span></code></pre></div><p><strong>Chunked Prefill</strong>(vLLM v0.5+ 默认)把 prefill 切成跟 decode 同一 step 跑:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>混跑策略:</span></span>
<span class="line"><span>  step k 的 batch =</span></span>
<span class="line"><span>    [request_1 decode 一个 token,</span></span>
<span class="line"><span>     request_2 decode 一个 token,</span></span>
<span class="line"><span>     ...,</span></span>
<span class="line"><span>     request_15 decode 一个 token,</span></span>
<span class="line"><span>     request_16 prefill 128 个 token (这是 chunked 的一片)]</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  整个 step 的 token 数 = 15 + 128 = 143,</span></span>
<span class="line"><span>  限制在 --max-num-batched-tokens 之内</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  长 prompt 切成多片,每 step 跑一片,</span></span>
<span class="line"><span>  期间 decode batch 几乎不受影响,TPOT 平稳</span></span></code></pre></div><p>权衡:</p><table tabindex="0"><thead><tr><th>策略</th><th>TTFT</th><th>TPOT 稳定性</th><th>实现</th></tr></thead><tbody><tr><td>Prefill / Decode 分开</td><td>单 prefill 阶段快</td><td>抖动明显</td><td>简单</td></tr><tr><td>完全混跑(chunked)</td><td>单 prefill 稍慢一点</td><td>平稳</td><td>复杂</td></tr><tr><td>物理分离(Disaggregated)</td><td>两边都快</td><td>最稳</td><td>跨 GPU,30 篇展开</td></tr></tbody></table><p><strong>生产默认开 chunked prefill</strong>,代价小、TPOT 稳。</p><h3 id="_3-3-抢占-kv-池满了怎么办" tabindex="-1">3.3 抢占:KV 池满了怎么办 <a class="header-anchor" href="#_3-3-抢占-kv-池满了怎么办" aria-label="Permalink to &quot;3.3 抢占:KV 池满了怎么办&quot;">​</a></h3><p>KV 池总容量有限,当前 running 请求的 KV 需求超出池容量时,得踢人:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>抢占策略二选一:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>策略 A:换出 (Swap)</span></span>
<span class="line"><span>  把倒霉蛋请求的 KV 整个挪到 CPU RAM(--swap-space 指定容量)</span></span>
<span class="line"><span>  request 进 swapped 队列等待</span></span>
<span class="line"><span>  KV 池空出来给其他请求</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  代价:换出和换回是 PCIe 传输,几十 GB 数据,几百 ms 延迟</span></span>
<span class="line"><span>  好处:不用重算 prefill</span></span>
<span class="line"><span></span></span>
<span class="line"><span>策略 B:重计算 (Recompute)</span></span>
<span class="line"><span>  直接丢弃倒霉蛋的 KV,把它扔回 waiting 队列</span></span>
<span class="line"><span>  下次轮到它时,重新 prefill 一遍</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  代价:prefill 又算一次(几十 ms 到几百 ms)</span></span>
<span class="line"><span>  好处:不占 PCIe 和 CPU RAM</span></span>
<span class="line"><span></span></span>
<span class="line"><span>选择规则(vLLM):</span></span>
<span class="line"><span>  - 请求 prompt 短 → 重计算更便宜(重 prefill 快)</span></span>
<span class="line"><span>  - 请求 prompt 长 + 已生成多 → 换出更划算(避免重新 prefill 长 prompt)</span></span>
<span class="line"><span>  - 没配 --swap-space → 只能重计算</span></span></code></pre></div><p><strong>生产里的常见症状</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>num_preempted 飙升:</span></span>
<span class="line"><span>  → 通常是 max-num-seqs 配大了,KV 池频繁满</span></span>
<span class="line"><span>  → 处理:降并发,或开 KV 量化(23 篇)扩容池</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>TTFT 周期性飙升:</span></span>
<span class="line"><span>  → 抢占后重计算的请求,本质又走了一次 prefill</span></span>
<span class="line"><span>  → 用户看到的是&quot;我都生成到一半了,突然又卡住&quot;</span></span></code></pre></div><hr><h2 id="四、关键调度参数-vllm-视角" tabindex="-1">四、关键调度参数:vLLM 视角 <a class="header-anchor" href="#四、关键调度参数-vllm-视角" aria-label="Permalink to &quot;四、关键调度参数:vLLM 视角&quot;">​</a></h2><h3 id="_4-1-三个最关键的旋钮" tabindex="-1">4.1 三个最关键的旋钮 <a class="header-anchor" href="#_4-1-三个最关键的旋钮" aria-label="Permalink to &quot;4.1 三个最关键的旋钮&quot;">​</a></h3><table tabindex="0"><thead><tr><th>参数</th><th>默认</th><th>含义</th><th>调大影响</th><th>调小影响</th></tr></thead><tbody><tr><td><code>--max-num-seqs</code></td><td>256</td><td>running batch 最大请求数</td><td>KV 池可能不够,抢占频繁</td><td>GPU 利用率低</td></tr><tr><td><code>--max-num-batched-tokens</code></td><td>各模型不同</td><td>每 step token 总数上限(含 decode + chunked prefill)</td><td>TPOT 可能抖动</td><td>prefill 切更细,首 token 慢</td></tr><tr><td><code>--enable-chunked-prefill</code></td><td>大模型默认 on</td><td>长 prompt 切片混跑</td><td>略增 TTFT</td><td>TPOT 抖动</td></tr></tbody></table><p>调参公式(粗略):</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>max-num-seqs 上界 ≈ KV池容量 / 单请求平均 KV 占用</span></span>
<span class="line"><span>   例如 KV 池 40GB,平均请求 1000 token × 320KB/tok = 320MB</span></span>
<span class="line"><span>   上界 = 40GB / 320MB = 125</span></span>
<span class="line"><span>   实际配 max-num-seqs ≈ 100(留余量给突发长请求)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>max-num-batched-tokens 选择:</span></span>
<span class="line"><span>   单纯 decode:每 step 总 token = 当前 batch 大小(每请求 1 token)</span></span>
<span class="line"><span>                所以 max-num-batched-tokens 至少 ≥ max-num-seqs</span></span>
<span class="line"><span>   chunked prefill 开启:</span></span>
<span class="line"><span>                典型设 2048-8192,允许一个 step 内跑 N 个 decode + K 个 prefill chunk</span></span>
<span class="line"><span>                太小 → prefill 切太细,首 token 慢</span></span>
<span class="line"><span>                太大 → 单 step 跑得久,decode TPOT 抖动</span></span></code></pre></div><h3 id="_4-2-其他常用参数" tabindex="-1">4.2 其他常用参数 <a class="header-anchor" href="#_4-2-其他常用参数" aria-label="Permalink to &quot;4.2 其他常用参数&quot;">​</a></h3><table tabindex="0"><thead><tr><th>参数</th><th>用途</th></tr></thead><tbody><tr><td><code>--gpu-memory-utilization</code></td><td>总显存里多少给 vLLM(默认 0.9,激进可 0.92-0.95)</td></tr><tr><td><code>--swap-space</code></td><td>KV 换出到 CPU RAM 的容量(GB),默认 4</td></tr><tr><td><code>--block-size</code></td><td>KV 块大小(默认 16,见 08 篇)</td></tr><tr><td><code>--enable-prefix-caching</code></td><td>开 Prefix Cache(见 08 篇)</td></tr><tr><td><code>--max-num-prefill-tokens</code></td><td>单 step prefill 部分上限(进一步分离调控)</td></tr><tr><td><code>--preemption-mode</code></td><td><code>swap</code> 或 <code>recompute</code>(vLLM 0.5+ 暴露)</td></tr></tbody></table><h3 id="_4-3-一个真实的配置-70b-长-context" tabindex="-1">4.3 一个真实的配置(70B + 长 context) <a class="header-anchor" href="#_4-3-一个真实的配置-70b-长-context" aria-label="Permalink to &quot;4.3 一个真实的配置(70B + 长 context)&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">python</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -m</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> vllm.entrypoints.openai.api_server</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --model</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> meta-llama/Meta-Llama-3.1-70B-Instruct</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --tensor-parallel-size</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 4</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --max-model-len</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 32768</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --gpu-memory-utilization</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 0.92</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --kv-cache-dtype</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> fp8</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --enable-prefix-caching</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --enable-chunked-prefill</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --max-num-seqs</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 64</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --max-num-batched-tokens</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 4096</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> \\</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">    --swap-space</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 16</span></span></code></pre></div><p>意图:</p><ul><li>70B + 32K 长 context,FP8 KV 把池容量翻倍</li><li>chunked prefill 让长请求不阻塞 decode batch</li><li>max-num-seqs=64 是按 KV 池容量 / 平均请求长度算出来的合理上限</li><li>swap-space=16GB 留作 KV 换出兜底</li></ul><hr><h2 id="五、性能对比-同卡同模型" tabindex="-1">五、性能对比:同卡同模型 <a class="header-anchor" href="#五、性能对比-同卡同模型" aria-label="Permalink to &quot;五、性能对比:同卡同模型&quot;">​</a></h2><p>H100 80GB × 2,Llama-3-70B BF16,ShareGPT 数据集(平均 prompt 250 token,平均生成 300 token):</p><table tabindex="0"><thead><tr><th>调度</th><th>吞吐 (tok/s)</th><th>平均 TTFT</th><th>平均 TPOT</th><th>P99 TPOT</th></tr></thead><tbody><tr><td>静态批 (batch=8)</td><td>800</td><td>1.2s</td><td>35ms</td><td>280ms</td></tr><tr><td>动态批 (Triton 默认)</td><td>1500</td><td>700ms</td><td>30ms</td><td>220ms</td></tr><tr><td>连续批 (vLLM,无 chunked)</td><td>6500</td><td>350ms</td><td>25ms</td><td>180ms</td></tr><tr><td>连续批 + chunked prefill</td><td>7200</td><td>380ms</td><td>23ms</td><td>45ms</td></tr><tr><td>连续批 + Prefix Cache</td><td>8500</td><td>200ms</td><td>23ms</td><td>45ms</td></tr></tbody></table><p><strong>关键观察</strong>:</p><ol><li><strong>吞吐 8-10 倍提升不是夸张数字</strong>,在生产真实数据集上能直接看到</li><li><strong>TTFT 也明显改善</strong>:连续批不用凑批等待,新请求即来即 prefill</li><li><strong>chunked prefill 的最大收益是 P99 TPOT</strong>——没 chunked 之前,长 prompt prefill 时 decode batch 卡住,P99 飙到几百 ms;开了之后稳在 45ms</li><li><strong>Prefix Cache 在 system prompt 长场景下再叠加一波</strong></li></ol><hr><h2 id="六、trt-llm-的-in-flight-batching-同一个东西换个名" tabindex="-1">六、TRT-LLM 的 In-flight Batching:同一个东西换个名 <a class="header-anchor" href="#六、trt-llm-的-in-flight-batching-同一个东西换个名" aria-label="Permalink to &quot;六、TRT-LLM 的 In-flight Batching:同一个东西换个名&quot;">​</a></h2><p>NVIDIA 的 TensorRT-LLM 把 Continuous Batching 叫 <strong>In-flight Batching</strong>,核心机制完全一致(每 step 重新组 batch、prefill/decode 混跑、KV 抢占)。差别在工程实现:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                  vLLM Continuous Batching         TRT-LLM In-flight Batching</span></span>
<span class="line"><span>                  ───────────────────────          ──────────────────────────</span></span>
<span class="line"><span>调度器位置        Python (主进程)                  C++ (engine 内部)</span></span>
<span class="line"><span>KV 管理           PagedAttention(Python+CUDA)     KV Cache Manager (C++)</span></span>
<span class="line"><span>配置文件          运行时 flag                      build 时静态配置 + 运行时 tuning</span></span>
<span class="line"><span>混跑策略          chunked prefill                  in-flight prefill 混跑</span></span>
<span class="line"><span>开发体验          灵活,改 flag 即生效              build engine 后行为相对固定</span></span></code></pre></div><p>12 篇专门拆 TRT-LLM,这里只点一句:<strong>名词不一样,本质同一招</strong>。生产里看到&quot;我们用的是 In-flight Batching&quot;和&quot;我们用的是 Continuous Batching&quot;,可以理解为同一件事。</p><hr><h2 id="七、工程坑-max-num-seqs-怎么调" tabindex="-1">七、工程坑:max-num-seqs 怎么调 <a class="header-anchor" href="#七、工程坑-max-num-seqs-怎么调" aria-label="Permalink to &quot;七、工程坑:max-num-seqs 怎么调&quot;">​</a></h2><h3 id="_7-1-调太大-→-kv-池满-频繁抢占" tabindex="-1">7.1 调太大 → KV 池满,频繁抢占 <a class="header-anchor" href="#_7-1-调太大-→-kv-池满-频繁抢占" aria-label="Permalink to &quot;7.1 调太大 → KV 池满,频繁抢占&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>症状:</span></span>
<span class="line"><span>  - num_preempted 飙升(每分钟几十次)</span></span>
<span class="line"><span>  - TPOT P99 飙到几百 ms</span></span>
<span class="line"><span>  - 用户报&quot;为什么生成到一半卡住&quot;</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>原因:max-num-seqs 配比 KV 池能装的多</span></span>
<span class="line"><span>  调度器尽量塞满 batch,KV 池压力大</span></span>
<span class="line"><span>  长请求一来,KV 不够装,踢已有请求出去 → 那个请求过会要再回来 → 再有别人来 → ...</span></span>
<span class="line"><span>  抢占振荡循环</span></span>
<span class="line"><span></span></span>
<span class="line"><span>排查:</span></span>
<span class="line"><span>  vllm:gpu_cache_usage_perc P95 &gt; 95%</span></span>
<span class="line"><span>  vllm:num_preempted_total 每分钟增量 &gt; 10</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>解法(按代价从轻到重):</span></span>
<span class="line"><span>  1. 降 max-num-seqs(直接减并发上限)</span></span>
<span class="line"><span>  2. 开 --kv-cache-dtype fp8(KV 池等效翻倍,23 篇)</span></span>
<span class="line"><span>  3. 限 --max-model-len(限请求 context 上界)</span></span>
<span class="line"><span>  4. 上更多卡(扩 TP 或加节点)</span></span></code></pre></div><h3 id="_7-2-调太小-→-gpu-闲" tabindex="-1">7.2 调太小 → GPU 闲 <a class="header-anchor" href="#_7-2-调太小-→-gpu-闲" aria-label="Permalink to &quot;7.2 调太小 → GPU 闲&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>症状:</span></span>
<span class="line"><span>  - GPU SM 利用率持续 &lt; 30%</span></span>
<span class="line"><span>  - 用户请求积压排队,但 KV 池只用了一半</span></span>
<span class="line"><span>  - 吞吐上不去</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>原因:max-num-seqs 太保守,调度器不愿意塞更多请求</span></span>
<span class="line"><span>  即使 KV 还有余,batch 也封顶</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>排查:</span></span>
<span class="line"><span>  vllm:num_running &lt; max-num-seqs(没塞满)</span></span>
<span class="line"><span>  vllm:gpu_cache_usage_perc &lt; 60%(KV 还有空间)</span></span>
<span class="line"><span>  vllm:num_waiting &gt; 5(请求在排队)</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>解法:</span></span>
<span class="line"><span>  1. 提 max-num-seqs(允许更多并发)</span></span>
<span class="line"><span>  2. 监控 num_preempted,确认没引发抢占</span></span>
<span class="line"><span>  3. 提 max-num-batched-tokens(允许 step 内塞更多 prefill chunk)</span></span></code></pre></div><h3 id="_7-3-经验公式" tabindex="-1">7.3 经验公式 <a class="header-anchor" href="#_7-3-经验公式" aria-label="Permalink to &quot;7.3 经验公式&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>初始配置:</span></span>
<span class="line"><span>  max-num-seqs = floor(KV 池容量 / 平均请求 KV 占用) × 0.8</span></span>
<span class="line"><span>                                                  ↑ 留 20% 余量给突发长请求</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  max-num-batched-tokens = max(2048, max-num-seqs × 2)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>跑生产数据 1 小时,看监控指标调整:</span></span>
<span class="line"><span>  - gpu_cache_usage_perc P95 在 75-85% → 合适</span></span>
<span class="line"><span>  - num_preempted_total 增量 &lt; 1/min → 合适</span></span>
<span class="line"><span>  - GPU SM 利用率 P50 &gt; 50% → 合适</span></span>
<span class="line"><span>  - 任一不达标 → 按上面解法调</span></span></code></pre></div><hr><h2 id="八、continuous-batching-没解决的事" tabindex="-1">八、Continuous Batching 没解决的事 <a class="header-anchor" href="#八、continuous-batching-没解决的事" aria-label="Permalink to &quot;八、Continuous Batching 没解决的事&quot;">​</a></h2><h3 id="_8-1-prefill-还是会拖累-batch" tabindex="-1">8.1 Prefill 还是会拖累 batch <a class="header-anchor" href="#_8-1-prefill-还是会拖累-batch" aria-label="Permalink to &quot;8.1 Prefill 还是会拖累 batch&quot;">​</a></h3><p>Chunked Prefill 缓解了,但没消灭——长 prompt prefill 时本来能跑更多 decode 的算力被占了。物理上的彻底解法是 <strong>Disaggregated Prefill-Decode</strong>(30 篇):prefill 用一组 GPU,decode 用另一组,KV 跨节点传过去。</p><h3 id="_8-2-decode-的-memory-bound-还在" tabindex="-1">8.2 Decode 的 memory-bound 还在 <a class="header-anchor" href="#_8-2-decode-的-memory-bound-还在" aria-label="Permalink to &quot;8.2 Decode 的 memory-bound 还在&quot;">​</a></h3><p>Continuous Batching 让 GPU 持续在跑,但每一步 decode 仍然是 memory-bound——它解的是&quot;利用率&quot;,不是&quot;每步效率&quot;。降字节(KV 量化,23 篇)、一次出多个 token(投机解码,11 篇)是另两个互补方向。</p><h3 id="_8-3-kv-共享还得-pagedattention-prefix-cache-配合" tabindex="-1">8.3 KV 共享还得 PagedAttention + Prefix Cache 配合 <a class="header-anchor" href="#_8-3-kv-共享还得-pagedattention-prefix-cache-配合" aria-label="Permalink to &quot;8.3 KV 共享还得 PagedAttention + Prefix Cache 配合&quot;">​</a></h3><p>Continuous Batching 本身不管 KV 怎么摆,它依赖 PagedAttention(08 篇)。再要做请求间共享前缀,要 Prefix Caching(08 篇尾)或 RadixAttention(10 篇)。</p><h3 id="_8-4-小流量下没收益" tabindex="-1">8.4 小流量下没收益 <a class="header-anchor" href="#_8-4-小流量下没收益" aria-label="Permalink to &quot;8.4 小流量下没收益&quot;">​</a></h3><p>Batch 大小本来就小的服务(单用户、低 QPS),Continuous Batching 跟普通批没差。<strong>它本质是&quot;高并发下榨利用率&quot;的工具,低并发用不上</strong>。</p><hr><h2 id="九、看完这一篇-你应该能" tabindex="-1">九、看完这一篇,你应该能 <a class="header-anchor" href="#九、看完这一篇-你应该能" aria-label="Permalink to &quot;九、看完这一篇,你应该能&quot;">​</a></h2><ul><li>解释静态批 / 动态批 / 连续批的差别,指出队头阻塞为什么是前两者的核心痛点</li><li>画出三代的 GPU 利用率时序图,指出连续批的关键收益是&quot;持续&quot;而非&quot;峰值&quot;</li><li>说清调度器每个 step 在做什么:check finished → prefill new → swap in / swap out → preempt → forward</li><li>解释 Chunked Prefill 解决的问题(prefill 时 decode batch 不停)和代价(略增 TTFT)</li><li>分别说出抢占的两种策略(swap vs recompute)及选择规则</li><li>拿到一个 vLLM 服务,按 <code>max-num-seqs</code> 太大(抢占)/ 太小(闲置)两类症状对应排查</li><li>解释 TRT-LLM In-flight Batching 和 vLLM Continuous Batching 是同一件事的不同实现</li><li>说出 Continuous Batching 不能解决的问题(prefill 拖累、decode memory-bound、KV 共享、低并发场景)</li></ul><p>下一篇:<strong>10 SGLang 与 RadixAttention</strong> — vLLM 的 Prefix Caching 是&quot;扁平命中&quot;,对 Agent 多轮、Tree-of-Thought 分支、RAG 跨 chunk 等&quot;复杂 LLM 程序&quot;命中率低。SGLang 把所有出现过的前缀塞进一棵基数树,任意公共前缀都能共享 KV;Compressed FSM 让 JSON / regex 输出一次推多个确定 token;前端 DSL 让多轮 / 分支 / 并行被引擎看见。这是另一种推理引擎的世界观。</p>`,89)])])}const g=a(e,[["render",t]]);export{k as __pageData,g as default};
