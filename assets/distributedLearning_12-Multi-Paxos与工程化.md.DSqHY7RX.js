import{c as a,Q as n,j as p,m as i}from"./chunks/framework.Bhbi9jCp.js";const k=JSON.parse('{"title":"Multi-Paxos 与工程化","description":"","frontmatter":{},"headers":[],"relativePath":"distributedLearning/12-Multi-Paxos与工程化.md","filePath":"distributedLearning/12-Multi-Paxos与工程化.md","lastUpdated":1778496697000}'),l={name:"distributedLearning/12-Multi-Paxos与工程化.md"};function e(t,s,h,o,r,c){return n(),p("div",null,[...s[0]||(s[0]=[i(`<h1 id="multi-paxos-与工程化" tabindex="-1">Multi-Paxos 与工程化 <a class="header-anchor" href="#multi-paxos-与工程化" aria-label="Permalink to &quot;Multi-Paxos 与工程化&quot;">​</a></h1><p>Basic Paxos(11 篇)只决定&quot;一个值&quot;,但<strong>真实系统要决定的是一连串值</strong>——一条日志、一组命令、一系列状态变更。<strong>Multi-Paxos 就是把 Basic Paxos 跑成&quot;流水线&quot;</strong>——选一个稳定 Leader,Phase 1 一次性做完,后续每条日志只跑 Phase 2,一次 RTT 落盘一条命令。</p><p>但 Lamport 在 2001 年的 <em>Paxos Made Simple</em> 末尾只用了半页篇幅讲 Multi-Paxos,<strong>所有&quot;怎么落地&quot;的细节都没写</strong>——选主、日志复制、空洞填补、成员变更、Snapshot、客户端幂等,全是各家自己摸出来的。Google 的 Tushar Chandra 在 <em>Paxos Made Live</em>(2007)第一节就抱怨:<strong>&quot;理论和工程之间有巨大的鸿沟&quot;</strong>。这一篇把这些&quot;鸿沟&quot;全填上,<strong>看完你才真正&quot;会看&quot;一个 Paxos 系统是怎么跑的</strong>。</p><blockquote><p>一句话先记住:<strong>Multi-Paxos = 稳定 Leader + 日志复制 + 状态机</strong>(Replicated State Machine)。<strong>核心优化:Leader 选出来之后,Phase 1 不再每次跑,只对&quot;所有 log slot&quot;一次性做完,后续每条日志只要 1 RTT(Phase 2)</strong>。<strong>工程上的麻烦全在 Leader 周围</strong>——选主、续约、空洞、成员变更、Snapshot、exactly-once,<strong>这些细节是 Paxos 论文留的空白</strong>,导致每家实现都不一样。<strong>Raft 火起来正是因为它&quot;把这些空白都填了&quot;</strong>。</p></blockquote><hr><h2 id="一、从-basic-paxos-到-multi-paxos" tabindex="-1">一、从 Basic Paxos 到 Multi-Paxos <a class="header-anchor" href="#一、从-basic-paxos-到-multi-paxos" aria-label="Permalink to &quot;一、从 Basic Paxos 到 Multi-Paxos&quot;">​</a></h2><h3 id="_1-1-basic-paxos-的低效根源" tabindex="-1">1.1 Basic Paxos 的低效根源 <a class="header-anchor" href="#_1-1-basic-paxos-的低效根源" aria-label="Permalink to &quot;1.1 Basic Paxos 的低效根源&quot;">​</a></h3><p>每决定一个值要 2 RTT(Prepare + Accept)+ 至少 2 次 fsync:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                    Basic Paxos 每个值的开销</span></span>
<span class="line"><span>┌─────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  Phase 1: Prepare → Promise          1 RTT       │</span></span>
<span class="line"><span>│           (Acceptor fsync(promised))   1 fsync    │</span></span>
<span class="line"><span>│  Phase 2: Accept → Accepted          1 RTT       │</span></span>
<span class="line"><span>│           (Acceptor fsync(accepted))   1 fsync    │</span></span>
<span class="line"><span>└─────────────────────────────────────────────────┘</span></span>
<span class="line"><span>        ⇒ 2 RTT + 2 fsync 每条日志</span></span>
<span class="line"><span>        ⇒ 跨城几十毫秒一条,生产不可用</span></span></code></pre></div><p><strong>Lamport 的观察</strong>:Phase 1 的作用是&quot;申请提议权 + 发现历史&quot;——<strong>如果 Proposer 不变,这些信息只需要建立一次</strong>。</p><h3 id="_1-2-multi-paxos-的核心优化" tabindex="-1">1.2 Multi-Paxos 的核心优化 <a class="header-anchor" href="#_1-2-multi-paxos-的核心优化" aria-label="Permalink to &quot;1.2 Multi-Paxos 的核心优化&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌──────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│  Multi-Paxos 关键观察:                                 │</span></span>
<span class="line"><span>│                                                        │</span></span>
<span class="line"><span>│  1. 选一个稳定 Leader,所有客户端请求都给它           │</span></span>
<span class="line"><span>│  2. Leader 启动时跑一次 Phase 1,对&quot;所有未来 log slot&quot;  │</span></span>
<span class="line"><span>│     一次性占住承诺权                                   │</span></span>
<span class="line"><span>│  3. 后续每条日志:                                     │</span></span>
<span class="line"><span>│     - 只跑 Phase 2(Accept → Accepted)= 1 RTT         │</span></span>
<span class="line"><span>│     - Acceptor 只需一次 fsync(accepted)                │</span></span>
<span class="line"><span>│  4. Leader 故障时,新 Leader 上来重新跑一次 Phase 1     │</span></span>
<span class="line"><span>└──────────────────────────────────────────────────────┘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>→ 稳态下每条日志只要 1 RTT + 1 fsync,可达 10000+ QPS</span></span></code></pre></div><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>              Multi-Paxos 流水线</span></span>
<span class="line"><span>           </span></span>
<span class="line"><span>Leader 启动:</span></span>
<span class="line"><span>   ━━━━━━━━━ Phase 1 (一次性) ━━━━━━━━━━━━━</span></span>
<span class="line"><span>   &quot;我用编号 n 占住所有 log slot 的提议权&quot;</span></span>
<span class="line"><span>              ↓</span></span>
<span class="line"><span>   Acceptor 答应,带回每个 slot 之前 accept 过什么</span></span>
<span class="line"><span>              ↓</span></span>
<span class="line"><span>   Leader 知道历史,可以继续往后写</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>稳态写入(每条):</span></span>
<span class="line"><span>   Client → Leader</span></span>
<span class="line"><span>   Leader → Acceptor: Accept(n, slot=i, v)</span></span>
<span class="line"><span>                       ↓ 1 RTT + fsync</span></span>
<span class="line"><span>   Acceptor → Leader: Accepted(n, slot=i, v)</span></span>
<span class="line"><span>                       ↓</span></span>
<span class="line"><span>   Leader → Client: OK (并通知 Learner)</span></span></code></pre></div><hr><h2 id="二、replicated-state-machine-模型" tabindex="-1">二、Replicated State Machine 模型 <a class="header-anchor" href="#二、replicated-state-machine-模型" aria-label="Permalink to &quot;二、Replicated State Machine 模型&quot;">​</a></h2><p>Multi-Paxos 的输出是<strong>一条&quot;被多数派认可&quot;的日志序列</strong>,但用户业务要的不是日志,<strong>是日志被执行后的&quot;状态&quot;</strong>。这就是 RSM(Replicated State Machine):</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌──────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│                     RSM 模型                              │</span></span>
<span class="line"><span>│                                                            │</span></span>
<span class="line"><span>│   客户端命令(SET x=5, INCR y, ...)                       │</span></span>
<span class="line"><span>│         │                                                  │</span></span>
<span class="line"><span>│         ▼                                                  │</span></span>
<span class="line"><span>│   ┌──────────────┐                                        │</span></span>
<span class="line"><span>│   │   Paxos 共识  │← 共识协议保证:                        │</span></span>
<span class="line"><span>│   │  (Multi-     │  &quot;所有副本看到的命令序列是同一份&quot;        │</span></span>
<span class="line"><span>│   │   Paxos)     │                                        │</span></span>
<span class="line"><span>│   └──────────────┘                                        │</span></span>
<span class="line"><span>│         │                                                  │</span></span>
<span class="line"><span>│         ▼  确定的日志顺序                                   │</span></span>
<span class="line"><span>│   ┌─────────────────────────────────────┐                 │</span></span>
<span class="line"><span>│   │  Log: [SET x=5][INCR y][DEL z][...] │                 │</span></span>
<span class="line"><span>│   └─────────────────────────────────────┘                 │</span></span>
<span class="line"><span>│         │                                                  │</span></span>
<span class="line"><span>│         ▼                                                  │</span></span>
<span class="line"><span>│   每个副本按同一顺序 apply:                                │</span></span>
<span class="line"><span>│   ┌──────┐   ┌──────┐   ┌──────┐                          │</span></span>
<span class="line"><span>│   │副本 A│   │副本 B│   │副本 C│                          │</span></span>
<span class="line"><span>│   │KV 存储│   │KV 存储│   │KV 存储│                          │</span></span>
<span class="line"><span>│   └──────┘   └──────┘   └──────┘                          │</span></span>
<span class="line"><span>│         │         │         │                              │</span></span>
<span class="line"><span>│   只要起始状态相同 + 日志序列相同 + apply 函数确定性        │</span></span>
<span class="line"><span>│   → 三个副本的最终状态相同                                 │</span></span>
<span class="line"><span>└──────────────────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>RSM 的三个不变量</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. Determinism(确定性):</span></span>
<span class="line"><span>   状态机 apply 函数必须是纯函数 — 同样的命令在同样的状态下</span></span>
<span class="line"><span>   产生同样的新状态。绝不能依赖本地时间、随机数、网络。</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. Same Log(相同日志):</span></span>
<span class="line"><span>   所有副本看到的日志序列完全相同(Paxos 保证)。</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. Same Order(相同顺序):</span></span>
<span class="line"><span>   所有副本按相同顺序 apply(由 log index 决定)。</span></span>
<span class="line"><span></span></span>
<span class="line"><span>→ 这三条满足,三个副本的状态最终必然一致。</span></span></code></pre></div><blockquote><p><strong>共识协议(Paxos / Raft)的本质不是&quot;决定值&quot;,而是决定一个 log 序列</strong>。决定 log 序列后,副本各自 apply,就有了一致的状态。<strong>这就是为什么 Paxos 论文里只讲&quot;对一个值的共识&quot;,但工程上能用来做 KV / 文件系统 / 数据库</strong>——因为只要把&quot;每条命令&quot;看作&quot;一个值&quot;,一条一条 apply 就能复制任意复杂的状态机。</p></blockquote><hr><h2 id="三、multi-paxos-的日志复制" tabindex="-1">三、Multi-Paxos 的日志复制 <a class="header-anchor" href="#三、multi-paxos-的日志复制" aria-label="Permalink to &quot;三、Multi-Paxos 的日志复制&quot;">​</a></h2><h3 id="_3-1-完整日志复制图" tabindex="-1">3.1 完整日志复制图 <a class="header-anchor" href="#_3-1-完整日志复制图" aria-label="Permalink to &quot;3.1 完整日志复制图&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Client            Leader L1            Acceptor A2          Acceptor A3</span></span>
<span class="line"><span>   │                  │                     │                    │</span></span>
<span class="line"><span>   │  cmd1: SET x=5   │                     │                    │</span></span>
<span class="line"><span>   ├─────────────────►│                     │                    │</span></span>
<span class="line"><span>   │                  │ ┌─ 分配 slot 1 ────┐│                    │</span></span>
<span class="line"><span>   │                  │ │ log[1] = SET x=5 ││                    │</span></span>
<span class="line"><span>   │                  │ └──────────────────┘│                    │</span></span>
<span class="line"><span>   │                  │ Accept(n=5, slot=1, v=SET x=5)            │</span></span>
<span class="line"><span>   │                  ├────────────────────►│                    │</span></span>
<span class="line"><span>   │                  ├──────────────────────────────────────────►│</span></span>
<span class="line"><span>   │                  │                     │ ┌─ log[1] ─┐       │</span></span>
<span class="line"><span>   │                  │                     │ │ persist  │       │</span></span>
<span class="line"><span>   │                  │                     │ └──────────┘       │</span></span>
<span class="line"><span>   │                  │ Accepted(n=5, slot=1)                    │</span></span>
<span class="line"><span>   │                  │◄────────────────────┤                    │</span></span>
<span class="line"><span>   │                  │◄──────────────────────────────────────────┤</span></span>
<span class="line"><span>   │                  │ (多数派 ✓ → slot=1 committed)             │</span></span>
<span class="line"><span>   │                  │ log[1] apply 到状态机:x=5                │</span></span>
<span class="line"><span>   │  OK              │                                          │</span></span>
<span class="line"><span>   │◄─────────────────┤                                          │</span></span>
<span class="line"><span>   │                  │                                          │</span></span>
<span class="line"><span>   │  cmd2: INCR y    │                                          │</span></span>
<span class="line"><span>   ├─────────────────►│                                          │</span></span>
<span class="line"><span>   │                  │ Accept(n=5, slot=2, v=INCR y)            │</span></span>
<span class="line"><span>   │                  ├────────────────────►│                    │</span></span>
<span class="line"><span>   │                  ├──────────────────────────────────────────►│</span></span>
<span class="line"><span>   │                  │ Accepted(n=5, slot=2)                    │</span></span>
<span class="line"><span>   │                  │◄────────────────────┤                    │</span></span>
<span class="line"><span>   │                  │◄──────────────────────────────────────────┤</span></span>
<span class="line"><span>   │  OK              │ (slot=2 committed → apply)                │</span></span>
<span class="line"><span>   │◄─────────────────┤                                          │</span></span></code></pre></div><p>每个 slot 是一个独立的&quot;Basic Paxos 实例&quot;——<strong>关键是它们共享同一个 Leader 和同一个 round number n,因此 Phase 1 只跑一次</strong>。</p><h3 id="_3-2-pipeline-优化" tabindex="-1">3.2 Pipeline 优化 <a class="header-anchor" href="#_3-2-pipeline-优化" aria-label="Permalink to &quot;3.2 Pipeline 优化&quot;">​</a></h3><p>Leader 不需要等上一条 Accepted 回来再发下一条:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>传统串行:</span></span>
<span class="line"><span>  cmd1 ─→ Accept ─→ Accepted ─→ cmd2 ─→ Accept ─→ Accepted ─→ ...</span></span>
<span class="line"><span>        |←─── RTT ────→|</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Pipeline:</span></span>
<span class="line"><span>  cmd1 ─→ Accept(slot=1) ──┐</span></span>
<span class="line"><span>  cmd2 ─→ Accept(slot=2) ──┤── 同时在飞</span></span>
<span class="line"><span>  cmd3 ─→ Accept(slot=3) ──┤</span></span>
<span class="line"><span>  cmd4 ─→ Accept(slot=4) ──┘</span></span>
<span class="line"><span>          ↓</span></span>
<span class="line"><span>  收到回包按 slot 顺序 commit + apply</span></span></code></pre></div><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Leader        A2          A3</span></span>
<span class="line"><span>  │            │           │</span></span>
<span class="line"><span>  │ Accept(1) ▼            │</span></span>
<span class="line"><span>  │ Accept(2) ▼            ▼   ← 并发飞向多个 Acceptor</span></span>
<span class="line"><span>  │ Accept(3) ▼            ▼</span></span>
<span class="line"><span>  │ Accept(4) ▼            ▼</span></span>
<span class="line"><span>  │            │           │</span></span>
<span class="line"><span>  │            └ Accepted(1)</span></span>
<span class="line"><span>  │ ◄ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤</span></span>
<span class="line"><span>  │            └ Accepted(2)</span></span>
<span class="line"><span>  │ ◄ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤</span></span>
<span class="line"><span>  │      ↓                 │</span></span>
<span class="line"><span>  │   commit log[1], log[2]│</span></span>
<span class="line"><span>  │   apply 到状态机        │</span></span>
<span class="line"><span>  │                        │</span></span></code></pre></div><p><strong>单次 fsync 可以 batch 多条</strong>——<code>group commit</code> 在工程上让 Multi-Paxos / Raft 实际 QPS 上到几万。</p><hr><h2 id="四、工程问题一-leader-选举" tabindex="-1">四、工程问题一:Leader 选举 <a class="header-anchor" href="#四、工程问题一-leader-选举" aria-label="Permalink to &quot;四、工程问题一:Leader 选举&quot;">​</a></h2><p>Basic Paxos 没规定怎么选 Leader,<strong>Multi-Paxos 的所有效率都建立在&quot;有稳定 Leader&quot; 这个前提上</strong>。</p><h3 id="_4-1-选主的两种典型方式" tabindex="-1">4.1 选主的两种典型方式 <a class="header-anchor" href="#_4-1-选主的两种典型方式" aria-label="Permalink to &quot;4.1 选主的两种典型方式&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>方式 A:用 Paxos 自身选主</span></span>
<span class="line"><span>  把&quot;谁是 Leader&quot;作为一个值用 Paxos 选定</span></span>
<span class="line"><span>  优势:协议层一致,无需外部依赖</span></span>
<span class="line"><span>  劣势:选主期间无法服务,延迟敏感</span></span>
<span class="line"><span></span></span>
<span class="line"><span>方式 B:外部仲裁 + 租约(Lease)</span></span>
<span class="line"><span>  用 ZooKeeper / etcd 选主(里面其实也是共识)</span></span>
<span class="line"><span>  Leader 定期续租约,过期则触发重选</span></span>
<span class="line"><span>  优势:与协议解耦,容易实现</span></span>
<span class="line"><span>  劣势:依赖外部协调服务</span></span></code></pre></div><h3 id="_4-2-lease-租约-是-multi-paxos-的常见手段" tabindex="-1">4.2 Lease(租约)是 Multi-Paxos 的常见手段 <a class="header-anchor" href="#_4-2-lease-租约-是-multi-paxos-的常见手段" aria-label="Permalink to &quot;4.2 Lease(租约)是 Multi-Paxos 的常见手段&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Leader 任期(Term / Epoch / Lease)</span></span>
<span class="line"><span>   │</span></span>
<span class="line"><span>   ▼</span></span>
<span class="line"><span>┌──────────────────────────────┐</span></span>
<span class="line"><span>│ Leader 持有租约 [t0, t0+T]   │   ← T 通常几秒到 30 秒</span></span>
<span class="line"><span>│                              │</span></span>
<span class="line"><span>│  在租约内:                   │</span></span>
<span class="line"><span>│   - Leader 才能发 Accept     │</span></span>
<span class="line"><span>│   - 客户端只信这个 Leader     │</span></span>
<span class="line"><span>│                              │</span></span>
<span class="line"><span>│  续约:                       │</span></span>
<span class="line"><span>│   每 T/3 时间 Leader 续一次   │</span></span>
<span class="line"><span>│                              │</span></span>
<span class="line"><span>│  租约过期(网络分区、Leader 挂):│</span></span>
<span class="line"><span>│   多数派 Acceptor 不再认它    │</span></span>
<span class="line"><span>│   触发新 Leader 选举         │</span></span>
<span class="line"><span>└──────────────────────────────┘</span></span></code></pre></div><p><strong>Chubby 用 Lease 防双主</strong>:Leader 即使脑裂出去,租约过期前不会有新 Leader 上来(详见 26 / 27 篇)。</p><h3 id="_4-3-新-leader-上任要做的第一件事" tabindex="-1">4.3 新 Leader 上任要做的第一件事 <a class="header-anchor" href="#_4-3-新-leader-上任要做的第一件事" aria-label="Permalink to &quot;4.3 新 Leader 上任要做的第一件事&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>新 Leader 上任时(round = n_new):</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  1. 向所有 Acceptor 发 Prepare(n_new),覆盖所有 log slot</span></span>
<span class="line"><span>     注意!不是只覆盖某一个 slot,而是&quot;所有未 commit 的 slot&quot;</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  2. 收集 Promise,带回每个 slot 各自的 accepted 历史</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  3. 对每个 slot,采用 Promise 里看到的最高编号 accepted 值</span></span>
<span class="line"><span>     (如果某 slot 没人 accept 过,可以填 no-op 占位)</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  4. 进入正常 Phase 2 流水线模式</span></span></code></pre></div><p><strong>第 3 步是关键</strong>:<strong>新 Leader 必须把&quot;前任 Leader 已经发出但未 commit&quot;的所有日志补完</strong>,否则状态机数据会丢。Raft 把这一步叫做 &quot;recovery&quot;。</p><hr><h2 id="五、工程问题二-日志空洞" tabindex="-1">五、工程问题二:日志空洞 <a class="header-anchor" href="#五、工程问题二-日志空洞" aria-label="Permalink to &quot;五、工程问题二:日志空洞&quot;">​</a></h2><h3 id="_5-1-空洞怎么产生" tabindex="-1">5.1 空洞怎么产生 <a class="header-anchor" href="#_5-1-空洞怎么产生" aria-label="Permalink to &quot;5.1 空洞怎么产生&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Leader 同时发 4 条日志,网络抖动:</span></span>
<span class="line"><span>  Accept(slot=1) ✓</span></span>
<span class="line"><span>  Accept(slot=2) × (丢包)</span></span>
<span class="line"><span>  Accept(slot=3) ✓</span></span>
<span class="line"><span>  Accept(slot=4) ✓</span></span>
<span class="line"><span></span></span>
<span class="line"><span>→ log 中 slot=2 没收到 Accepted</span></span>
<span class="line"><span>→ slot=3、4 已经 committed,但因为 2 没 commit,无法 apply</span></span>
<span class="line"><span>   (RSM 必须按顺序 apply)</span></span></code></pre></div><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>副本视角的日志状态:</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  slot:   1     2     3     4     5</span></span>
<span class="line"><span>  状态:   ✓     ✗     ✓     ✓     ✓</span></span>
<span class="line"><span>          │     │     │     │     │</span></span>
<span class="line"><span>          │   空洞   │     │     │</span></span>
<span class="line"><span>          │     │     │     │     │</span></span>
<span class="line"><span>       apply 卡在这里,后面的都不能 apply</span></span></code></pre></div><h3 id="_5-2-填补空洞" tabindex="-1">5.2 填补空洞 <a class="header-anchor" href="#_5-2-填补空洞" aria-label="Permalink to &quot;5.2 填补空洞&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>方案 A:Leader 重发</span></span>
<span class="line"><span>  Leader 维护&quot;未 commit 的 slot 列表&quot;</span></span>
<span class="line"><span>  发现某个 slot 超时未收到多数派 Accepted → 重发</span></span>
<span class="line"><span></span></span>
<span class="line"><span>方案 B:no-op 填补</span></span>
<span class="line"><span>  长时间填不上的空洞,Leader 主动写一条 no-op 命令</span></span>
<span class="line"><span>  (no-op = 不改变状态的命令,只占住 slot)</span></span>
<span class="line"><span>  → 让后续 slot 可以 apply</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>方案 C:新 Leader 重新填充</span></span>
<span class="line"><span>  Leader 切换时,新 Leader 必须把所有&quot;看到过 accepted&quot;的 slot 补完</span></span>
<span class="line"><span>  对空 slot 写 no-op</span></span></code></pre></div><h3 id="_5-3-真实场景" tabindex="-1">5.3 真实场景 <a class="header-anchor" href="#_5-3-真实场景" aria-label="Permalink to &quot;5.3 真实场景&quot;">​</a></h3><p>Phxpaxos / PaxosStore 的设计文档里都强调:<strong>空洞填补是 Multi-Paxos 实现里最隐蔽的 bug 源</strong>。常见错误:</p><ul><li>新 Leader 只补&quot;已知 slot&quot;,漏了某些 slot 上有过 Promise 但没人记下</li><li>重发 Accept 时用了错误的 round number</li><li>用错 fsync 顺序导致重启后状态丢失</li></ul><blockquote><p><strong>Raft 在这里做得比 Multi-Paxos 好太多</strong>——Raft 的 log 是连续的、新 Leader 必须有最完整 log 才能当选(Leader Completeness Property),<strong>直接消灭了空洞这个问题</strong>。</p></blockquote><hr><h2 id="六、工程问题三-成员变更-reconfiguration" tabindex="-1">六、工程问题三:成员变更(Reconfiguration) <a class="header-anchor" href="#六、工程问题三-成员变更-reconfiguration" aria-label="Permalink to &quot;六、工程问题三:成员变更(Reconfiguration)&quot;">​</a></h2><p>集群要扩容(3 节点 → 5 节点)或缩容怎么办?<strong>不能简单地&quot;改个配置重启&quot;</strong>——可能造成两个不相交多数派各自决定不同的值。</p><h3 id="_6-1-反例" tabindex="-1">6.1 反例 <a class="header-anchor" href="#_6-1-反例" aria-label="Permalink to &quot;6.1 反例&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>原集群 {A, B, C},多数派 = 2</span></span>
<span class="line"><span></span></span>
<span class="line"><span>某时刻只有 A 把配置改成 {A, B, C, D, E},多数派 = 3</span></span>
<span class="line"><span>其他节点还认为是旧配置</span></span>
<span class="line"><span></span></span>
<span class="line"><span>A 单独觉得新配置的多数派可以是 {A, D, E}</span></span>
<span class="line"><span>B、C 觉得旧多数派可以是 {B, C}</span></span>
<span class="line"><span></span></span>
<span class="line"><span>→ 两个不相交多数派,可能同时选定两个不同值</span></span>
<span class="line"><span>→ Agreement 被破坏!</span></span></code></pre></div><h3 id="_6-2-joint-consensus-lamport-提出的方案" tabindex="-1">6.2 Joint Consensus(Lamport 提出的方案) <a class="header-anchor" href="#_6-2-joint-consensus-lamport-提出的方案" aria-label="Permalink to &quot;6.2 Joint Consensus(Lamport 提出的方案)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>分两阶段过渡:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>阶段 1:Joint 配置(C_old ∪ C_new)</span></span>
<span class="line"><span>   - 任何决议要&quot;旧多数派 ∩ 新多数派&quot;同时同意</span></span>
<span class="line"><span>   - 这保证了过渡期间不会产生两个不相交多数派</span></span>
<span class="line"><span></span></span>
<span class="line"><span>阶段 2:切到 C_new</span></span>
<span class="line"><span>   - 只看新配置的多数派</span></span>
<span class="line"><span></span></span>
<span class="line"><span>C_old      Joint(C_old, C_new)       C_new</span></span>
<span class="line"><span>  ●─────────────●─────────────●</span></span>
<span class="line"><span>            过渡期间</span></span>
<span class="line"><span>   (任何值都要旧多数派 + 新多数派双重确认)</span></span></code></pre></div><p><strong>Joint Consensus 在工程上极其复杂</strong>——需要协议层多搞一套&quot;双重多数派&quot;的判断,Multi-Paxos 多数实现没原汁原味实现,而是用变种:</p><h3 id="_6-3-单步成员变更-raft-推广的简化方案" tabindex="-1">6.3 单步成员变更(Raft 推广的简化方案) <a class="header-anchor" href="#_6-3-单步成员变更-raft-推广的简化方案" aria-label="Permalink to &quot;6.3 单步成员变更(Raft 推广的简化方案)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>约束:每次只增减一个节点</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3 → 4 (加一个):</span></span>
<span class="line"><span>  旧多数派 = 2(从 3 中)</span></span>
<span class="line"><span>  新多数派 = 3(从 4 中)</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  任意旧多数派(2)和任意新多数派(3)的交集</span></span>
<span class="line"><span>  ≥ 2 + 3 - 4 = 1</span></span>
<span class="line"><span>  → 必有交集,Agreement 不破</span></span>
<span class="line"><span></span></span>
<span class="line"><span>→ 不需要 Joint Consensus,直接走一次普通共识写入新配置即可</span></span></code></pre></div><p><strong>代价</strong>:扩缩容要分多次进行(3→4→5,不能一步到位)。</p><blockquote><p>Raft 论文里推广了&quot;单步变更&quot;,但<strong>Diego Ongaro 自己后来在博士论文里指出&quot;单步变更其实有微妙 bug&quot;</strong>,<strong>推荐回到 Joint Consensus</strong>。这又是 Paxos 系工程化里的&quot;灰色地带&quot;。</p></blockquote><hr><h2 id="七、工程问题四-snapshot-与日志压缩" tabindex="-1">七、工程问题四:Snapshot 与日志压缩 <a class="header-anchor" href="#七、工程问题四-snapshot-与日志压缩" aria-label="Permalink to &quot;七、工程问题四:Snapshot 与日志压缩&quot;">​</a></h2><h3 id="_7-1-为什么要压缩" tabindex="-1">7.1 为什么要压缩 <a class="header-anchor" href="#_7-1-为什么要压缩" aria-label="Permalink to &quot;7.1 为什么要压缩&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>不压缩的 log:</span></span>
<span class="line"><span>  slot 1: SET x=5</span></span>
<span class="line"><span>  slot 2: SET x=6</span></span>
<span class="line"><span>  slot 3: SET x=7</span></span>
<span class="line"><span>  ...</span></span>
<span class="line"><span>  slot 1000000: SET x=最新</span></span>
<span class="line"><span></span></span>
<span class="line"><span>→ log 文件无限增长,磁盘吃满</span></span>
<span class="line"><span>→ 新副本上线要 replay 一百万条命令,几小时启动不完</span></span></code></pre></div><h3 id="_7-2-snapshot-思路" tabindex="-1">7.2 Snapshot 思路 <a class="header-anchor" href="#_7-2-snapshot-思路" aria-label="Permalink to &quot;7.2 Snapshot 思路&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>定期把&quot;状态机当前状态&quot;序列化:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  snapshot_at_slot = 999500</span></span>
<span class="line"><span>  state = { x: 最新值, y: ..., ... }</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>→ 删除 slot ≤ 999500 的所有日志</span></span>
<span class="line"><span>→ 新副本启动时:</span></span>
<span class="line"><span>  1. 加载 snapshot</span></span>
<span class="line"><span>  2. 从 slot 999501 开始 replay 日志</span></span></code></pre></div><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                  Snapshot 工作流</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   时间 ──→</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   log: [1][2][3]...[999500][999501]...[1000000]</span></span>
<span class="line"><span>                       │           │</span></span>
<span class="line"><span>                       │   后续 log 保留</span></span>
<span class="line"><span>                       │</span></span>
<span class="line"><span>                  ┌────▼─────┐</span></span>
<span class="line"><span>                  │ Snapshot │  ← state at slot 999500</span></span>
<span class="line"><span>                  │ (binary) │     persisted to disk</span></span>
<span class="line"><span>                  └──────────┘</span></span>
<span class="line"><span>                       │</span></span>
<span class="line"><span>                  删除 log ≤ 999500</span></span>
<span class="line"><span>                  </span></span>
<span class="line"><span>   新副本启动:</span></span>
<span class="line"><span>     1. load snapshot → state restored at slot 999500</span></span>
<span class="line"><span>     2. apply log[999501..] → state up to date</span></span></code></pre></div><h3 id="_7-3-工程细节" tabindex="-1">7.3 工程细节 <a class="header-anchor" href="#_7-3-工程细节" aria-label="Permalink to &quot;7.3 工程细节&quot;">​</a></h3><ul><li><strong>何时触发 snapshot</strong>:日志大小阈值(如 64MB)或时间间隔(每小时)</li><li><strong>谁来做 snapshot</strong>:Leader 做,然后传给 Follower / Follower 各自做</li><li><strong>传输 snapshot</strong>:大文件,要分块传输 + 校验</li><li><strong>snapshot 一致性</strong>:做 snapshot 时状态机要保持稳定(写时复制 / 暂停 apply)</li><li><strong>snapshot + log 复制并发</strong>:Snapshot 还在传时,Leader 又收到新写,要分清传哪个版本</li></ul><p><strong>Chubby、Spanner、etcd、TiKV</strong> 的 snapshot 实现都数千行代码,绝大多数 bug 都在这里。</p><hr><h2 id="八、工程问题五-客户端-exactly-once" tabindex="-1">八、工程问题五:客户端 Exactly-Once <a class="header-anchor" href="#八、工程问题五-客户端-exactly-once" aria-label="Permalink to &quot;八、工程问题五:客户端 Exactly-Once&quot;">​</a></h2><h3 id="_8-1-问题" tabindex="-1">8.1 问题 <a class="header-anchor" href="#_8-1-问题" aria-label="Permalink to &quot;8.1 问题&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>客户端 ──INCR x──→ Leader</span></span>
<span class="line"><span>                       │</span></span>
<span class="line"><span>                       │  Paxos 跑了一半,Leader 挂了</span></span>
<span class="line"><span>                       ×</span></span>
<span class="line"><span>客户端:超时,重试</span></span>
<span class="line"><span>客户端 ──INCR x──→ 新 Leader</span></span>
<span class="line"><span>                       │</span></span>
<span class="line"><span>                       │  又跑一遍 INCR x</span></span>
<span class="line"><span>                       │</span></span>
<span class="line"><span>                       ▼</span></span>
<span class="line"><span>                    x 被加了两次!</span></span></code></pre></div><p>如果操作不幂等(INCR、PUSH、转账),重试就出问题。</p><h3 id="_8-2-解决-client-id-req-id-去重" tabindex="-1">8.2 解决:client_id + req_id 去重 <a class="header-anchor" href="#_8-2-解决-client-id-req-id-去重" aria-label="Permalink to &quot;8.2 解决:client_id + req_id 去重&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>客户端为每个请求分配唯一 (client_id, req_id):</span></span>
<span class="line"><span>  ├─ client_id: 客户端启动时申请,集群里全局唯一</span></span>
<span class="line"><span>  └─ req_id:   单调递增</span></span>
<span class="line"><span></span></span>
<span class="line"><span>服务端记录:每个 client_id 最近 N 个 req_id 的处理结果</span></span>
<span class="line"><span></span></span>
<span class="line"><span>收到请求:</span></span>
<span class="line"><span>  if (client_id, req_id) 已经处理过:</span></span>
<span class="line"><span>      直接返回之前的结果(从缓存)</span></span>
<span class="line"><span>  else:</span></span>
<span class="line"><span>      跑 Paxos → 应用 → 缓存结果 → 返回</span></span></code></pre></div><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                 Exactly-Once 状态表</span></span>
<span class="line"><span>   ┌──────────────────────────────────────────┐</span></span>
<span class="line"><span>   │ client_id │ last_req_id │ last_response  │</span></span>
<span class="line"><span>   ├──────────────────────────────────────────┤</span></span>
<span class="line"><span>   │ c1        │  100        │  {ok: x=42}    │</span></span>
<span class="line"><span>   │ c2        │  85         │  {ok}          │</span></span>
<span class="line"><span>   │ c3        │  1003       │  {err: dup}    │</span></span>
<span class="line"><span>   └──────────────────────────────────────────┘</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   每次 Paxos commit 时也更新这张表(作为状态机的一部分)</span></span>
<span class="line"><span>   → snapshot 时一起 dump</span></span></code></pre></div><p><strong>这张表也要走 Paxos</strong>——所有副本都要看到同一份 client 状态,<strong>否则切主后新 Leader 不知道某个请求已经处理过,导致重复执行</strong>。</p><blockquote><p>这是 Multi-Paxos 工程化里的&quot;必修课&quot;,<strong>绝大多数初学者写出来的 Paxos 都没考虑这一层</strong>,跑测试一切正常,生产网络抖一下就重复扣款。</p></blockquote><hr><h2 id="九、multi-paxos-工程实现对照" tabindex="-1">九、Multi-Paxos 工程实现对照 <a class="header-anchor" href="#九、multi-paxos-工程实现对照" aria-label="Permalink to &quot;九、Multi-Paxos 工程实现对照&quot;">​</a></h2><table tabindex="0"><thead><tr><th>系统</th><th>实现者</th><th>特点</th></tr></thead><tbody><tr><td><strong>Chubby</strong></td><td>Google,Burrows 2006</td><td>分布式锁 + 配置中心,Multi-Paxos + Lease,生产 10+ 年</td></tr><tr><td><strong>Spanner</strong></td><td>Google 2012</td><td>每个 Paxos group 用 Multi-Paxos 复制,跨 region 强一致</td></tr><tr><td><strong>Megastore</strong></td><td>Google 2011</td><td>跨 DC Multi-Paxos,每个 entity group 一组</td></tr><tr><td><strong>PaxosStore</strong></td><td>腾讯,微信存储</td><td>大规模 KV,EPaxos 思想结合</td></tr><tr><td><strong>PhxPaxos</strong></td><td>腾讯,微信开源 C++ Paxos 库</td><td>工程参考价值高</td></tr><tr><td><strong>Microsoft Azure Cosmos DB</strong></td><td>Multi-Paxos 变体</td><td>支持五种一致性级别</td></tr><tr><td><strong>MongoDB Replica Set</strong></td><td>早期类 Multi-Paxos,后转 Raft 风格</td><td>—</td></tr><tr><td><strong>ZAB</strong></td><td>Apache ZooKeeper</td><td>不完全是 Paxos,但思想同源(后面会讲)</td></tr></tbody></table><h3 id="_9-1-chubby-的工程经验-paxos-made-live" tabindex="-1">9.1 Chubby 的工程经验(<em>Paxos Made Live</em>) <a class="header-anchor" href="#_9-1-chubby-的工程经验-paxos-made-live" aria-label="Permalink to &quot;9.1 Chubby 的工程经验(*Paxos Made Live*)&quot;">​</a></h3><p>Google 工程师踩过的坑:</p><ol><li><strong>Disk corruption</strong>:Acceptor 持久化的状态可能因磁盘故障损坏,<strong>需要 checksum + 多副本</strong></li><li><strong>Membership change</strong>:成员变更要做对极难,<strong>Chubby 实现了三次都有 bug</strong></li><li><strong>Master Lease</strong>:用 lease 防多主,<strong>但要小心 lease 续约期间 GC pause / clock skew</strong></li><li><strong>快速选举</strong>:选举时间影响可用性,Chubby 优化到几秒</li><li><strong>Snapshot during transfer</strong>:正在传 snapshot 时收到新写,版本协调是噩梦</li><li><strong>Testing</strong>:<strong>Chubby 用了 30% 的代码量做测试和验证</strong>(Jepsen 后来证明没他们想得那么稳)</li></ol><blockquote><p>Burrows 在论文里说:<strong>&quot;虽然 Paxos 算法本身只有 30 行伪代码,我们花了两年才让 Chubby 稳定。最后我们的代码远远超出原始算法的描述。&quot;</strong></p></blockquote><hr><h2 id="十、为什么工业界更流行-raft" tabindex="-1">十、为什么工业界更流行 Raft <a class="header-anchor" href="#十、为什么工业界更流行-raft" aria-label="Permalink to &quot;十、为什么工业界更流行 Raft&quot;">​</a></h2><p>Diego Ongaro 在 Raft 论文(2014)开篇就吐槽 Paxos:</p><blockquote><p><em>&quot;Despite its dominance, Paxos is notoriously difficult to understand. Furthermore, its architecture requires complex changes to support practical systems. As a result, both system builders and students struggle with Paxos.&quot;</em></p></blockquote><p>具体不满意的地方:</p><table tabindex="0"><thead><tr><th>Paxos 留下的空白</th><th>Raft 是怎么填的</th></tr></thead><tbody><tr><td>没规定怎么选 Leader</td><td>明确的 Leader 选举(任期 Term + 投票 + 心跳)</td></tr><tr><td>没规定日志怎么连续</td><td>强制 log 连续 + Leader Completeness</td></tr><tr><td>没规定怎么补空洞</td><td>不允许有空洞,Leader log 必须完整</td></tr><tr><td>成员变更只给思路</td><td>单步变更 + Joint Consensus 两种方案都给完整算法</td></tr><tr><td>Snapshot 不在论文里</td><td>显式 InstallSnapshot RPC</td></tr><tr><td>客户端去重不讨论</td><td>显式 client session + req_id</td></tr><tr><td>三种角色名抽象</td><td>Leader / Follower / Candidate,直观</td></tr><tr><td>两阶段不直观</td><td>AppendEntries 一种 RPC 完成正常写入</td></tr></tbody></table><p><strong>Raft 的设计哲学</strong>:&quot;为了可理解性而设计&quot;(<em>designed for understandability</em>)。<strong>牺牲一点点性能,换可读、可实现、可维护</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>社区采纳度对比:</span></span>
<span class="line"><span>                  </span></span>
<span class="line"><span>Raft 实现(开源):           Paxos 实现(开源):</span></span>
<span class="line"><span>  - etcd (Go)               - PhxPaxos (C++)</span></span>
<span class="line"><span>  - hashicorp/raft (Go)     - libpaxos</span></span>
<span class="line"><span>  - dragonboat (Go)         - (很少)</span></span>
<span class="line"><span>  - braft (C++)</span></span>
<span class="line"><span>  - tikv/raft-rs (Rust)</span></span>
<span class="line"><span>  - openraft (Rust)</span></span>
<span class="line"><span>  - JRaft (Java)</span></span>
<span class="line"><span>  - 几十种工业级实现        - 极少</span></span></code></pre></div><p><strong>结论</strong>:Multi-Paxos 是历史正确,但 <strong>2014 年后绝大多数新项目选 Raft</strong>——可读、社区库丰富、文档完备。<strong>Paxos 仍然活在 Spanner、Chubby、Cassandra LWT、PaxosStore 这些&quot;先于 Raft&quot; 的系统里</strong>。</p><blockquote><p><strong>不要被&quot;Raft 是 Paxos 简化版&quot;这种说法误导</strong>。Raft 是基于 Paxos 思想的<strong>完全独立设计</strong>,<strong>它把所有工程空白填满了</strong>——这就是它的核心价值。<strong>Paxos 是理论里程碑,Raft 是工程里程碑</strong>。</p></blockquote><hr><h2 id="十一、multi-paxos-简化伪代码" tabindex="-1">十一、Multi-Paxos 简化伪代码 <a class="header-anchor" href="#十一、multi-paxos-简化伪代码" aria-label="Permalink to &quot;十一、Multi-Paxos 简化伪代码&quot;">​</a></h2><div class="language-python vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">python</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">class</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> MultiPaxosLeader</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    def</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> __init__</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(self, node_id, peers):</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.node_id </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> node_id</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.peers </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> peers</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.round </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 0</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.log </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {}        </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># slot -&gt; (n, v, committed)</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.next_slot </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 1</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.state_machine </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> StateMachine()</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.client_table </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {}  </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># client_id -&gt; (last_req_id, last_response)</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.is_leader </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> False</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    </span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    def</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> become_leader</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(self):</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">        &quot;&quot;&quot;新 Leader 启动时跑一次 Phase 1&quot;&quot;&quot;</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.round </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">+=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 1</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        n </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.round, </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.node_id)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        </span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">        # 对&quot;所有 log slot&quot;做 Prepare</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        promises </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> broadcast(</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.peers, Prepare(n, </span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">slot</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">ALL</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">))</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">        if</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> len</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(promises) </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">&lt;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> majority:</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">            return</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> False</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        </span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">        # 收集已 accepted 的最高编号值,补完每个 slot</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">        for</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> slot </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">in</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> all_slots_seen(promises):</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            highest </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> max_accepted(promises, slot)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">            if</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> highest:</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">                self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.log[slot] </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> highest    </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 接收已 accept 过的最高值</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">            else</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">                self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.log[slot] </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> no_op()    </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 空洞填 no-op</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        </span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">        # 把这些&quot;补完&quot;的 slot 用 Phase 2 重发,确保多数派接受</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">        for</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> slot, value </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">in</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.log.items():</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">            self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.run_phase2(slot, value)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        </span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.is_leader </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> True</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">        return</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> True</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    </span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    def</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> handle_client</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(self, client_id, req_id, command):</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">        # === Exactly-once ===</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">        if</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (client_id, req_id) </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">in</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.client_table:</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">            return</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.client_table[(client_id, req_id)]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        </span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">        # === 分配 slot ===</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        slot </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.next_slot</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.next_slot </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">+=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 1</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.log[slot] </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.current_n(), command, committed=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">False</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        </span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">        # === Phase 2 (Pipeline) ===</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        accepts </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> broadcast(</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.peers, Accept(</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.current_n(), slot, command))</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">        if</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> count_accepted(accepts) </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">&lt;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> majority:</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">            return</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> ERR_NOT_LEADER</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        </span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">        # === Commit + Apply ===</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.log[slot] </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> mark_committed(</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.log[slot])</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        result </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.state_machine.apply(command)</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.client_table[(client_id, req_id)] </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> result</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">        return</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> result</span></span>
<span class="line"></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">class</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> MultiPaxosAcceptor</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    def</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> __init__</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(self):</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">        # 必须持久化的状态</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.promised_n </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> None</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # 当前承诺的最高 round</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.log </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {}             </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># slot -&gt; (n, v)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    </span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    def</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> on_prepare</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(self, n, slot</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">ALL</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">):</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">        if</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.promised_n </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">is</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> None</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> or</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> n </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">&gt;</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.promised_n:</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">            self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.promised_n </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> n</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            persist(</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.promised_n)</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">            # 返回所有 slot 的 accepted 历史</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">            return</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> Promise(n, </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.log)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">        return</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> NACK</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    </span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    def</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> on_accept</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(self, n, slot, v):</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">        if</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.promised_n </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">is</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> None</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> or</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> n </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">&gt;=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.promised_n:</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">            self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.promised_n </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> n</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">            self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.log[slot] </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (n, v)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            persist(</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.log[slot])</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">            return</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> Accepted(n, slot, v)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">        return</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> NACK</span></span></code></pre></div><hr><h2 id="十二、踩坑提醒" tabindex="-1">十二、踩坑提醒 <a class="header-anchor" href="#十二、踩坑提醒" aria-label="Permalink to &quot;十二、踩坑提醒&quot;">​</a></h2><ol><li><strong>Multi-Paxos 没标准实现</strong>——每家都自己摸,<strong>别期待&quot;按论文写&quot;能得到能用的系统</strong></li><li><strong>Leader 选举不用 Lease</strong>——直接靠心跳超时,<strong>容易脑裂(双主)</strong>,生产必须配 Lease + Fencing</li><li><strong>新 Leader 不重做 Phase 1</strong>——直接用旧 round 提议,可能写入和前任冲突,<strong>Agreement 被破坏</strong></li><li><strong>新 Leader 不补 log 空洞</strong>——前任已经 accept 但未 commit 的写丢了,<strong>数据丢失</strong></li><li><strong>状态机 apply 不是确定性的</strong>——比如用了 <code>time.Now()</code>、随机数、依赖外部 API,<strong>副本间状态发散</strong></li><li><strong>Snapshot 期间不暂停 apply</strong>——状态机被边读边写,snapshot 内容不一致,<strong>新副本启动状态错乱</strong></li><li><strong>没做 exactly-once</strong>——客户端重试导致重复扣款 / 重复 INCR,<strong>生产 100% 会踩</strong></li><li><strong>client_table 不走 Paxos</strong>——切主后新 Leader 没这个表,<strong>重复消息无法识别</strong></li><li><strong>成员变更直接改配置文件 + 重启</strong>——可能产生两个不相交多数派,<strong>Agreement 崩溃</strong></li><li><strong>Snapshot 与 log 串流交叉</strong>——半个 snapshot 半个 log,启动时状态混乱</li><li><strong>没做 fsync 批量</strong>(group commit)——每条命令单独 fsync,QPS 拉不上去,<strong>等于自废功夫</strong></li><li><strong>手写 Multi-Paxos</strong>——Google / 腾讯都做了 2-3 年,<strong>用 etcd-raft / braft / dragonboat</strong>,需要 Paxos 风格用 PhxPaxos</li><li><strong>以为 Multi-Paxos 比 Raft 强</strong>——纯粹的协议性能差异很小,<strong>工程成熟度 Raft 完胜</strong></li></ol><hr><h2 id="第三层中段小结-09-12" tabindex="-1">第三层中段小结(09-12) <a class="header-anchor" href="#第三层中段小结-09-12" aria-label="Permalink to &quot;第三层中段小结(09-12)&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>09 FLP 不可能定理     → 异步 + 一个故障 = 共识不可能</span></span>
<span class="line"><span>                       工程上靠&quot;放宽假设&quot;绕开</span></span>
<span class="line"><span></span></span>
<span class="line"><span>10 复制三态          → 主从 / 多主 / 无主</span></span>
<span class="line"><span>                       Quorum NWR 是无主的不变量</span></span>
<span class="line"><span>                       共识的&quot;前置题&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>11 Paxos 经典版      → 两阶段 + 多数派</span></span>
<span class="line"><span>                       &quot;对一个值的共识&quot;</span></span>
<span class="line"><span>                       理论里程碑,但工程不直接用</span></span>
<span class="line"><span></span></span>
<span class="line"><span>12 Multi-Paxos       → 稳定 Leader + RSM + 日志复制</span></span>
<span class="line"><span>                       + 空洞 + 成员变更 + Snapshot + exactly-once</span></span>
<span class="line"><span>                       Lamport 论文留的空白都在这里</span></span></code></pre></div><p><strong>到这一篇为止,你已经能&quot;看懂&quot;Spanner / Chubby / Cassandra LWT 的强一致是怎么来的</strong>——它们底层都是 Multi-Paxos 的某种工程化。</p><p>下一篇:<code>13-Raft全解.md</code>。<strong>Raft 是 2014 年至今最重要的共识算法</strong>——不是因为它比 Paxos 性能好,而是因为它<strong>把 Paxos 留的所有工程空白填得清清楚楚</strong>。我们会讲清:为什么&quot;Term 编号&quot;比&quot;Ballot Number&quot;直观、选主的&quot;3 种状态&quot; + &quot;RequestVote / AppendEntries 两种 RPC&quot;为什么够用、Log Matching Property 怎么保证日志一致性、为什么 etcd / TiKV / Consul / CockroachDB / MongoDB / Redis Cluster(部分)全用 Raft。看完 13 你就知道:<strong>Paxos 教你&quot;为什么对&quot;,Raft 教你&quot;怎么做对&quot;</strong>——这是从理论到工程的关键一跳。</p>`,112)])])}const g=a(l,[["render",e]]);export{k as __pageData,g as default};
