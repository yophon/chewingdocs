import{c as a,Q as n,j as p,m as i}from"./chunks/framework.Bhbi9jCp.js";const d=JSON.parse('{"title":"Paxos 经典版","description":"","frontmatter":{},"headers":[],"relativePath":"distributedLearning/11-Paxos经典版.md","filePath":"distributedLearning/11-Paxos经典版.md","lastUpdated":1778496697000}'),e={name:"distributedLearning/11-Paxos经典版.md"};function l(t,s,o,r,h,c){return n(),p("div",null,[...s[0]||(s[0]=[i(`<h1 id="paxos-经典版" tabindex="-1">Paxos 经典版 <a class="header-anchor" href="#paxos-经典版" aria-label="Permalink to &quot;Paxos 经典版&quot;">​</a></h1><p><strong>Paxos 是分布式系统的&quot;魔咒&quot;</strong>——所有人都听过,大多数人讲不清楚,Lamport 自己花了 8 年(1989 → 1998)才让学界接受这个算法,又花了 3 年(2001 <em>Paxos Made Simple</em>)试图重写得通俗一点。后来 Google 的 Tushar Chandra 在 <em>Paxos Made Live</em>(2007)里坦白:<strong>&quot;我们实现 Chubby 的 Paxos 时,反复发现论文有空缺,只能自己填&quot;</strong>。Ongaro 在 Raft 论文里更直白:<strong>&quot;Paxos 既难懂,又难实现&quot;</strong>——这是他发明 Raft 的动机。</p><p>这一篇不抄论文,<strong>直接把 Paxos 当成&quot;两阶段 + 多数派&quot;的最小共识协议来讲</strong>——剥开抽象名词后,Paxos 的核心只有一件事:<strong>多个 Proposer 同时想往日志里塞值,Acceptor 多数派投票决定塞哪个,Learner 看投票结果学到结果</strong>。看懂这一篇,你就知道 Chubby / Spanner / etcd / Zookeeper 的强一致是怎么来的。</p><blockquote><p>一句话先记住:<strong>Paxos 解决的问题是&quot;一群人异步通信、可能故障的前提下,对一个值达成不可反悔的共识&quot;</strong>。<strong>核心机制是两阶段</strong>(Prepare/Promise → Accept/Accepted)<strong>+ 多数派</strong>(Quorum)。<strong>关键不变量是&quot;一旦多数派接受了值 v,后续被选定的必然还是 v&quot;</strong>。<strong>Ballot Number(轮次编号)单调递增</strong> 是让协议在并发与失败下仍能收敛的&quot;时间感&quot;。Paxos 难懂不是因为复杂,而是因为它<strong>讨论的状态空间太抽象</strong>——所有反直觉都来自&quot;乱序消息 + 任意节点崩溃&quot;的组合爆炸。</p></blockquote><hr><h2 id="一、为什么-paxos-这么难懂" tabindex="-1">一、为什么 Paxos 这么难懂 <a class="header-anchor" href="#一、为什么-paxos-这么难懂" aria-label="Permalink to &quot;一、为什么 Paxos 这么难懂&quot;">​</a></h2><p>先把&quot;难懂&quot;这件事拆开:</p><h3 id="_1-1-lamport-写得故意拐弯" tabindex="-1">1.1 Lamport 写得故意拐弯 <a class="header-anchor" href="#_1-1-lamport-写得故意拐弯" aria-label="Permalink to &quot;1.1 Lamport 写得故意拐弯&quot;">​</a></h3><p>1990 年 Lamport 投了《The Part-Time Parliament》(兼职议会),用希腊岛 Paxos 的虚构议员故事讲算法。<strong>审稿人完全没看懂</strong>——以为是一篇考古论文,论文被拒。直到 1998 年才正式发表,2001 年 Lamport 不得不写《Paxos Made Simple》摘要,<strong>只有 13 页,把那个故事拆掉直接讲算法</strong>。</p><blockquote><p>Lamport 后来承认:那个故事是失败的(<em>&quot;This paper was rejected. Some of the reviewers thought it might be amusing.&quot;</em>)。<strong>&quot;我们做学术的人有时候会得意忘形&quot;</strong>——他在论文集里自嘲。</p></blockquote><h3 id="_1-2-抽象命名让人头大" tabindex="-1">1.2 抽象命名让人头大 <a class="header-anchor" href="#_1-2-抽象命名让人头大" aria-label="Permalink to &quot;1.2 抽象命名让人头大&quot;">​</a></h3><p>Paxos 的角色和概念都用了泛化命名:<strong>Proposer / Acceptor / Learner</strong>——听上去像三方,实际上<strong>一个进程可以同时扮演三种角色</strong>(工程上几乎所有 Paxos 实现都这么做)。 <strong>Ballot / Round / Proposal Number</strong> —— 三种说法指的是同一个东西。 <strong>Value</strong>——可以是日志一条,可以是命令,可以是配置。</p><h3 id="_1-3-状态空间太大" tabindex="-1">1.3 状态空间太大 <a class="header-anchor" href="#_1-3-状态空间太大" aria-label="Permalink to &quot;1.3 状态空间太大&quot;">​</a></h3><p>Paxos 假设:</p><ul><li>网络异步(消息任意延迟、丢失、乱序)</li><li>节点可崩溃 + 恢复(但不作恶,<strong>非拜占庭</strong>)</li><li>没有全局时钟</li></ul><p>在这种环境下&quot;对一个值达成共识&quot;这个目标看起来普通,<strong>展开状态空间后是组合爆炸</strong>——这就是论文里那些<code>if highest proposal number you&#39;ve seen is ≥ ...</code> 反直觉判断的根源。<strong>它在防&quot;任意时刻任意节点挂、任意消息乱序&quot;导致的所有错乱</strong>。</p><h3 id="_1-4-本质其实简单" tabindex="-1">1.4 本质其实简单 <a class="header-anchor" href="#_1-4-本质其实简单" aria-label="Permalink to &quot;1.4 本质其实简单&quot;">​</a></h3><p>剥开后:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>两阶段:</span></span>
<span class="line"><span>  Phase 1(Prepare): 提议者问 Acceptor 们 &quot;我用编号 n 提议,你们答应不答应?&quot;</span></span>
<span class="line"><span>  Phase 2(Accept):  得到多数同意后,提议者发 &quot;那就接受 (n, v) 吧&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>多数派(Quorum):</span></span>
<span class="line"><span>  任意两个多数派必然有交集 → 信息不会丢</span></span>
<span class="line"><span></span></span>
<span class="line"><span>不变量:</span></span>
<span class="line"><span>  一旦多数派 Acceptor 接受了 (n, v),</span></span>
<span class="line"><span>  之后任何编号 n&#39; &gt; n 的提议,提议的值必然还是 v</span></span></code></pre></div><blockquote><p>没了。<strong>这就是 Paxos 的全部</strong>。后面所有反直觉的细节都是为了让&quot;两阶段 + 多数派&quot;在异步网络 + 故障下仍能成立。</p></blockquote><hr><h2 id="二、共识问题的形式化" tabindex="-1">二、共识问题的形式化 <a class="header-anchor" href="#二、共识问题的形式化" aria-label="Permalink to &quot;二、共识问题的形式化&quot;">​</a></h2><p>Paxos 要解决的&quot;共识(Consensus)&quot;问题精确定义:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>N 个节点参与,要对&quot;一个值&quot;达成一致,要满足:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>1. Agreement(一致性):</span></span>
<span class="line"><span>   不存在两个不同的值被宣布&quot;被选中&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. Validity(有效性):</span></span>
<span class="line"><span>   被选中的值必须是某个 Proposer 真的提议过的</span></span>
<span class="line"><span>   (不能凭空造一个)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. Termination(终止性):</span></span>
<span class="line"><span>   只要有多数派节点不挂,协议最终能选出一个值</span></span>
<span class="line"><span></span></span>
<span class="line"><span>约束:</span></span>
<span class="line"><span>- 异步网络:消息任意延迟、丢失、乱序</span></span>
<span class="line"><span>- Crash-Recovery 故障模型:节点可崩溃,可恢复(磁盘持久化)</span></span>
<span class="line"><span>- 非拜占庭:节点不撒谎,只是会挂 / 慢</span></span></code></pre></div><p><strong>FLP 不可能定理</strong>(09 篇)告诉我们:严格满足三点不可能。<strong>Paxos 的妥协是放弃 Termination 的&quot;保证最终终止&quot;</strong>——理论上可能活锁(后面讲),<strong>工程上靠 Leader 选主消除活锁</strong>。</p><hr><h2 id="三、三角色" tabindex="-1">三、三角色 <a class="header-anchor" href="#三、三角色" aria-label="Permalink to &quot;三、三角色&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌─────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│                                                          │</span></span>
<span class="line"><span>│    Proposer ──提议──→ Acceptor ──告知结果──→ Learner    │</span></span>
<span class="line"><span>│       │                  ↑                                │</span></span>
<span class="line"><span>│       │                  │                                │</span></span>
<span class="line"><span>│       └──发起两阶段投票──┘                                │</span></span>
<span class="line"><span>│                                                          │</span></span>
<span class="line"><span>└─────────────────────────────────────────────────────────┘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Proposer(提议者):</span></span>
<span class="line"><span>   - 接受客户端请求</span></span>
<span class="line"><span>   - 发起 Paxos 协议</span></span>
<span class="line"><span>   - 决定提案编号(Ballot Number)</span></span>
<span class="line"><span>   - 决定提议什么值</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Acceptor(接受者):</span></span>
<span class="line"><span>   - &quot;议会成员&quot;,对提议投票</span></span>
<span class="line"><span>   - 持久化记录&quot;承诺过什么&quot;、&quot;接受过什么&quot;</span></span>
<span class="line"><span>   - 多数派 Acceptor 同意 = 决议通过</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Learner(学习者):</span></span>
<span class="line"><span>   - 不参与投票,只关心结果</span></span>
<span class="line"><span>   - 从 Acceptor 学习&quot;已选定的值&quot;</span></span>
<span class="line"><span>   - 接到结果后落到状态机执行</span></span></code></pre></div><p>工程上往往合并:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>真实部署常见的形态:</span></span>
<span class="line"><span>        ┌────────────────────┐</span></span>
<span class="line"><span>        │  Node 1            │</span></span>
<span class="line"><span>        │  Proposer+Acceptor │</span></span>
<span class="line"><span>        │  +Learner          │</span></span>
<span class="line"><span>        └────────────────────┘</span></span>
<span class="line"><span>        ┌────────────────────┐</span></span>
<span class="line"><span>        │  Node 2            │</span></span>
<span class="line"><span>        │  Proposer+Acceptor │</span></span>
<span class="line"><span>        │  +Learner          │</span></span>
<span class="line"><span>        └────────────────────┘</span></span>
<span class="line"><span>        ┌────────────────────┐</span></span>
<span class="line"><span>        │  Node 3            │</span></span>
<span class="line"><span>        │  Proposer+Acceptor │</span></span>
<span class="line"><span>        │  +Learner          │</span></span>
<span class="line"><span>        └────────────────────┘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>每个节点都能接客户端请求(都是 Proposer)</span></span>
<span class="line"><span>每个节点都是 Acceptor(投票成员)</span></span>
<span class="line"><span>每个节点都是 Learner(学到结果就在本地状态机 apply)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>→ 3 节点 Paxos 集群,容忍 1 个节点故障</span></span>
<span class="line"><span>→ 5 节点 Paxos 集群,容忍 2 个节点故障</span></span>
<span class="line"><span>→ 通式:N=2f+1 容忍 f 个故障</span></span></code></pre></div><hr><h2 id="四、phase-1-prepare-promise" tabindex="-1">四、Phase 1:Prepare / Promise <a class="header-anchor" href="#四、phase-1-prepare-promise" aria-label="Permalink to &quot;四、Phase 1:Prepare / Promise&quot;">​</a></h2><p>第一阶段的目的:<strong>Proposer 向 Acceptor 申请&quot;用编号 n 提议的资格&quot;,顺便了解之前已经发生过什么</strong>。</p><h3 id="_4-1-流程" tabindex="-1">4.1 流程 <a class="header-anchor" href="#_4-1-流程" aria-label="Permalink to &quot;4.1 流程&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Proposer 行为:</span></span>
<span class="line"><span>  1. 选一个比之前用过的都大的提案编号 n</span></span>
<span class="line"><span>     (常用 (round_number, node_id),保证全局唯一且单调)</span></span>
<span class="line"><span>  2. 向所有(至少多数派)Acceptor 发送 Prepare(n)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Acceptor 收到 Prepare(n) 时:</span></span>
<span class="line"><span>  if n &gt; 我承诺过的最大编号 max_promised:</span></span>
<span class="line"><span>      max_promised = n           # 持久化!</span></span>
<span class="line"><span>      回 Promise(n, accepted_proposal)</span></span>
<span class="line"><span>      # accepted_proposal = 我之前已经 Accept 过的 (n_a, v_a) 或 None</span></span>
<span class="line"><span>  else:</span></span>
<span class="line"><span>      拒绝 / 静默(或回 NACK)</span></span></code></pre></div><h3 id="_4-2-时序图-成功的-phase-1" tabindex="-1">4.2 时序图(成功的 Phase 1) <a class="header-anchor" href="#_4-2-时序图-成功的-phase-1" aria-label="Permalink to &quot;4.2 时序图(成功的 Phase 1)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Proposer                A1            A2            A3</span></span>
<span class="line"><span>   │                    │             │             │</span></span>
<span class="line"><span>   │  Prepare(n=5)      │             │             │</span></span>
<span class="line"><span>   ├───────────────────►│             │             │</span></span>
<span class="line"><span>   │  Prepare(n=5)      │             │             │</span></span>
<span class="line"><span>   ├──────────────────────────────────►│             │</span></span>
<span class="line"><span>   │  Prepare(n=5)      │             │             │</span></span>
<span class="line"><span>   ├────────────────────────────────────────────────►│</span></span>
<span class="line"><span>   │                    │             │             │</span></span>
<span class="line"><span>   │  Promise(5, None)  │             │             │</span></span>
<span class="line"><span>   │◄───────────────────┤             │             │</span></span>
<span class="line"><span>   │  Promise(5, None)  │             │             │</span></span>
<span class="line"><span>   │◄──────────────────────────────────┤             │</span></span>
<span class="line"><span>   │ (网络丢了,无所谓)                              │</span></span>
<span class="line"><span>   │                                                  │</span></span>
<span class="line"><span>   │  收到 2/3 = 多数派 ✓ → 可以进入 Phase 2          │</span></span>
<span class="line"><span>   │                                                  │</span></span></code></pre></div><h3 id="_4-3-关键含义" tabindex="-1">4.3 关键含义 <a class="header-anchor" href="#_4-3-关键含义" aria-label="Permalink to &quot;4.3 关键含义&quot;">​</a></h3><p><strong>Promise(n, accepted_proposal) 的含义</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>&quot;我承诺:</span></span>
<span class="line"><span>  1. 之后不再接受编号 &lt; n 的 Prepare(继续提升我的承诺线)</span></span>
<span class="line"><span>  2. 之后不再接受编号 &lt; n 的 Accept(锁住更早的提议)</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>顺便告诉你:</span></span>
<span class="line"><span>  我之前已经 Accept 过 (n_a, v_a) 这个提议(如果有的话)&quot;</span></span></code></pre></div><p><strong>为什么要带上&quot;之前 Accept 过什么&quot;</strong>?</p><p>这是 Paxos 最关键的设计——<strong>让新 Proposer 看到历史,避免它覆盖已经被多数派接受的值</strong>。</p><blockquote><p>这是 Paxos 协议的&quot;灵魂细节&quot;。<strong>Proposer 在 Phase 2 必须采用 Promise 里看到的最高编号已接受值</strong>,而不是它原本想提的值。<strong>这一步让&quot;已选定的值&quot;无法被新提议覆盖</strong>——保证 Agreement。</p></blockquote><hr><h2 id="五、phase-2-accept-accepted" tabindex="-1">五、Phase 2:Accept / Accepted <a class="header-anchor" href="#五、phase-2-accept-accepted" aria-label="Permalink to &quot;五、Phase 2:Accept / Accepted&quot;">​</a></h2><h3 id="_5-1-流程" tabindex="-1">5.1 流程 <a class="header-anchor" href="#_5-1-流程" aria-label="Permalink to &quot;5.1 流程&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Proposer 收到多数派 Promise 后:</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  # 决定要 Accept 什么值</span></span>
<span class="line"><span>  if 任何 Promise 里带回了 accepted_proposal:</span></span>
<span class="line"><span>      选编号最大的那个 accepted_proposal 的值 v</span></span>
<span class="line"><span>      # 关键!不再用 Proposer 自己想提的值</span></span>
<span class="line"><span>  else:</span></span>
<span class="line"><span>      v = 我自己想提的值</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  向 Acceptor 发 Accept(n, v)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Acceptor 收到 Accept(n, v):</span></span>
<span class="line"><span>  if n &gt;= max_promised:</span></span>
<span class="line"><span>      accepted = (n, v)          # 持久化!</span></span>
<span class="line"><span>      max_promised = n</span></span>
<span class="line"><span>      回 Accepted(n, v)</span></span>
<span class="line"><span>      同时把 (n, v) 告诉 Learner(或由 Proposer 通知)</span></span>
<span class="line"><span>  else:</span></span>
<span class="line"><span>      拒绝</span></span></code></pre></div><h3 id="_5-2-时序图-成功的-phase-2" tabindex="-1">5.2 时序图(成功的 Phase 2) <a class="header-anchor" href="#_5-2-时序图-成功的-phase-2" aria-label="Permalink to &quot;5.2 时序图(成功的 Phase 2)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Proposer                A1            A2            A3        Learner</span></span>
<span class="line"><span>   │                    │             │             │            │</span></span>
<span class="line"><span>   │  Accept(5, v=X)    │             │             │            │</span></span>
<span class="line"><span>   ├───────────────────►│             │             │            │</span></span>
<span class="line"><span>   │  Accept(5, v=X)    │             │             │            │</span></span>
<span class="line"><span>   ├──────────────────────────────────►│             │            │</span></span>
<span class="line"><span>   │  Accept(5, v=X)    │             │             │            │</span></span>
<span class="line"><span>   ├────────────────────────────────────────────────►│            │</span></span>
<span class="line"><span>   │                    │             │             │            │</span></span>
<span class="line"><span>   │  Accepted(5, X)    │             │             │            │</span></span>
<span class="line"><span>   │◄───────────────────┤             │             │            │</span></span>
<span class="line"><span>   │  Accepted(5, X)    │             │             │            │</span></span>
<span class="line"><span>   │◄──────────────────────────────────┤             │            │</span></span>
<span class="line"><span>   │                                                  │            │</span></span>
<span class="line"><span>   │  收到 2/3 多数派 Accepted ✓                      │            │</span></span>
<span class="line"><span>   │  X 被选定(Chosen)!                              │            │</span></span>
<span class="line"><span>   │                                                  │            │</span></span>
<span class="line"><span>   │  Decide(X) ───────────────────────────────────────────────►│</span></span>
<span class="line"><span>   │                                                              │</span></span>
<span class="line"><span>   │  返回客户端 OK                                                │</span></span></code></pre></div><h3 id="_5-3-完整两阶段时序图-无竞争场景" tabindex="-1">5.3 完整两阶段时序图(无竞争场景) <a class="header-anchor" href="#_5-3-完整两阶段时序图-无竞争场景" aria-label="Permalink to &quot;5.3 完整两阶段时序图(无竞争场景)&quot;">​</a></h3><p>把两个阶段串起来:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>  Client      Proposer       A1            A2            A3       Learner</span></span>
<span class="line"><span>   │            │             │             │             │           │</span></span>
<span class="line"><span>   │  Request   │             │             │             │           │</span></span>
<span class="line"><span>   ├───────────►│             │             │             │           │</span></span>
<span class="line"><span>   │            │             │             │             │           │</span></span>
<span class="line"><span>   │            │ ━━━━━━━━━━━━━ Phase 1: Prepare ━━━━━━━━━━━━━━━━━━   │</span></span>
<span class="line"><span>   │            │  Prepare(5) │             │             │           │</span></span>
<span class="line"><span>   │            ├────────────►│             │             │           │</span></span>
<span class="line"><span>   │            ├──────────────────────────►│             │           │</span></span>
<span class="line"><span>   │            ├────────────────────────────────────────►│           │</span></span>
<span class="line"><span>   │            │             │             │             │           │</span></span>
<span class="line"><span>   │            │ Promise(5,None) Promise(5,None)  (任一可丢)         │</span></span>
<span class="line"><span>   │            │◄────────────┤             │             │           │</span></span>
<span class="line"><span>   │            │◄──────────────────────────┤             │           │</span></span>
<span class="line"><span>   │            │       (多数派 = 2/3 ✓)                              │</span></span>
<span class="line"><span>   │            │                                                      │</span></span>
<span class="line"><span>   │            │ ━━━━━━━━━━━━━ Phase 2: Accept ━━━━━━━━━━━━━━━━━━━   │</span></span>
<span class="line"><span>   │            │  Accept(5, X)                                        │</span></span>
<span class="line"><span>   │            ├────────────►│             │             │           │</span></span>
<span class="line"><span>   │            ├──────────────────────────►│             │           │</span></span>
<span class="line"><span>   │            ├────────────────────────────────────────►│           │</span></span>
<span class="line"><span>   │            │             │             │             │           │</span></span>
<span class="line"><span>   │            │ Accepted(5,X) Accepted(5,X)                          │</span></span>
<span class="line"><span>   │            │◄────────────┤             │             │           │</span></span>
<span class="line"><span>   │            │◄──────────────────────────┤             │           │</span></span>
<span class="line"><span>   │            │       (多数派 = 2/3 ✓ → CHOSEN)                     │</span></span>
<span class="line"><span>   │            │                                                      │</span></span>
<span class="line"><span>   │            │  Decide(X)                                           │</span></span>
<span class="line"><span>   │            ├──────────────────────────────────────────────────►│</span></span>
<span class="line"><span>   │  Response  │                                                      │</span></span>
<span class="line"><span>   │◄───────────┤                                                      │</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>往返次数:2 RTT(Prepare/Promise + Accept/Accepted)</span></span>
<span class="line"><span>+ 1 次 disk fsync(Acceptor 持久化 max_promised)+ 1 次 disk fsync(Acceptor 持久化 accepted)</span></span></code></pre></div><hr><h2 id="六、有竞争场景-两个-proposer-抢" tabindex="-1">六、有竞争场景:两个 Proposer 抢 <a class="header-anchor" href="#六、有竞争场景-两个-proposer-抢" aria-label="Permalink to &quot;六、有竞争场景:两个 Proposer 抢&quot;">​</a></h2><p>这是 Paxos 最反直觉的地方,<strong>多个 Proposer 同时跑协议</strong>,看 Paxos 怎么保证最终只有一个值被选定:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Proposer P1 想提 v=X      Proposer P2 想提 v=Y</span></span>
<span class="line"><span>   │                            │</span></span>
<span class="line"><span>   │ Prepare(n=5)               │</span></span>
<span class="line"><span>   ├──→ A1 A2 A3                │</span></span>
<span class="line"><span>   │ ◄── Promise(5,None) x3     │</span></span>
<span class="line"><span>   │                            │</span></span>
<span class="line"><span>   │                            │ Prepare(n=7)</span></span>
<span class="line"><span>   │                            ├──→ A1 A2 A3</span></span>
<span class="line"><span>   │                            │ ◄── Promise(7,None) x3</span></span>
<span class="line"><span>   │                            │  (因为 7&gt;5,Acceptor 都升级承诺到 7)</span></span>
<span class="line"><span>   │                            │</span></span>
<span class="line"><span>   │ Accept(5, X)               │</span></span>
<span class="line"><span>   ├──→ A1 A2 A3                │</span></span>
<span class="line"><span>   │ ◄── NACK x3                │</span></span>
<span class="line"><span>   │     (Acceptor 拒绝!因为它们已承诺 7,5&lt;7)</span></span>
<span class="line"><span>   │                            │</span></span>
<span class="line"><span>   │ 需要重新跑:n=9             │</span></span>
<span class="line"><span>   │                            │ Accept(7, Y)</span></span>
<span class="line"><span>   │                            ├──→ A1 A2 A3</span></span>
<span class="line"><span>   │                            │ ◄── Accepted(7, Y) x3 ✓</span></span>
<span class="line"><span>   │                            │</span></span>
<span class="line"><span>   │                            │ Y 被选定 (Chosen)</span></span>
<span class="line"><span>   │                            │</span></span>
<span class="line"><span>   │ Prepare(n=9)               │</span></span>
<span class="line"><span>   ├──→ A1 A2 A3                │</span></span>
<span class="line"><span>   │ ◄── Promise(9, (7, Y)) x3  │ ← 这里关键!</span></span>
<span class="line"><span>   │     Acceptor 带回 &quot;我已接受过 (7, Y)&quot;</span></span>
<span class="line"><span>   │                            │</span></span>
<span class="line"><span>   │ 决定:我必须 Accept Y,不能 Accept X 了!</span></span>
<span class="line"><span>   │                            │</span></span>
<span class="line"><span>   │ Accept(9, Y)               │</span></span>
<span class="line"><span>   │  (即使 P1 客户端想提 X,协议强制它提 Y)</span></span></code></pre></div><p><strong>这就是 Paxos 的精髓</strong>——只要某个值被多数派接受过(进入&quot;将被选定&quot;状态),后续任何新 Proposer 都会<strong>通过 Phase 1 看到这个值</strong>,然后<strong>被强制在 Phase 2 提议这个值</strong>。</p><blockquote><p>这就是为什么 Paxos 不会&quot;两个不同值都被选定&quot;。<strong>这不是禁令,是协议把&quot;想覆盖已选值&quot;的可能性算死了</strong>——Phase 1 强制让你看到历史,Phase 2 强制你尊重历史。</p></blockquote><hr><h2 id="七、关键不变量-直觉版证明" tabindex="-1">七、关键不变量(直觉版证明) <a class="header-anchor" href="#七、关键不变量-直觉版证明" aria-label="Permalink to &quot;七、关键不变量(直觉版证明)&quot;">​</a></h2><p>Paxos 的正确性归结到一个不变量:</p><blockquote><p><strong>如果值 v 在编号 n 被选定(Chosen,即多数派 Acceptor Accept 了 (n, v)),那么任何编号 n&#39; &gt; n 的提议,提议的值必然还是 v</strong>。</p></blockquote><p><strong>证明思路(归纳法)</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>基础情况:n+1 这一轮</span></span>
<span class="line"><span>  Proposer 想用 n+1 提议</span></span>
<span class="line"><span>  → Phase 1 必须先得到多数派 Promise</span></span>
<span class="line"><span>  → 由于&quot;任意两个多数派必有交集&quot;(Quorum 性质)</span></span>
<span class="line"><span>  → Promise 多数派 ∩ Accept 多数派 ≠ ∅</span></span>
<span class="line"><span>  → 至少 1 个 Acceptor 既在 (n,v) 的 Accept 多数派,又在 (n+1) 的 Promise 多数派</span></span>
<span class="line"><span>  → 该 Acceptor 在 Promise 时会带回 accepted_proposal=(n, v)</span></span>
<span class="line"><span>  → Proposer 必须用 v 提议(协议强制)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>归纳:假设 n+1 ~ n+k 都被强制提议 v</span></span>
<span class="line"><span>  考虑 n+k+1:同样道理,多数派交集里至少有一个 Acceptor 带回 accepted_proposal</span></span>
<span class="line"><span>  且带回的编号最高的那个的值仍然是 v(因为前面都是 v)</span></span>
<span class="line"><span>  → n+k+1 也提议 v</span></span>
<span class="line"><span></span></span>
<span class="line"><span>结论:从 n 之后所有提议的值都是 v</span></span></code></pre></div><p><strong>Quorum 不变量是基石</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>        Acceptor 集合</span></span>
<span class="line"><span>   ┌─────────────────────┐</span></span>
<span class="line"><span>   │                     │</span></span>
<span class="line"><span>   │  ┌─ Promise ─┐      │</span></span>
<span class="line"><span>   │  │           │      │</span></span>
<span class="line"><span>   │  │ ┌─ 交集 ─┐│      │</span></span>
<span class="line"><span>   │  │ │ ●●●    ││      │</span></span>
<span class="line"><span>   │  │ └────────┘│      │</span></span>
<span class="line"><span>   │  └───────────┘      │</span></span>
<span class="line"><span>   │   ┌─ Accept ─┐      │</span></span>
<span class="line"><span>   │   │          │      │</span></span>
<span class="line"><span>   │   └──────────┘      │</span></span>
<span class="line"><span>   │                     │</span></span>
<span class="line"><span>   └─────────────────────┘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>任意两个多数派至少有 1 个 Acceptor 重叠</span></span>
<span class="line"><span>→ 信息不会丢</span></span>
<span class="line"><span>→ 已选定的值会被新 Proposer 看到</span></span></code></pre></div><hr><h2 id="八、ballot-number-单调递增" tabindex="-1">八、Ballot Number 单调递增 <a class="header-anchor" href="#八、ballot-number-单调递增" aria-label="Permalink to &quot;八、Ballot Number 单调递增&quot;">​</a></h2><p>提案编号是 Paxos 的&quot;逻辑时钟&quot;,<strong>必须满足</strong>:</p><ul><li><strong>全局唯一</strong>:不能两个 Proposer 用同一个 n</li><li><strong>单调递增</strong>:每次都比之前用过的大</li><li><strong>持久化</strong>:进程重启不能回退</li></ul><p><strong>典型实现</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>proposal_number = (round_number, node_id)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>比较规则:</span></span>
<span class="line"><span>  (r1, id1) &gt; (r2, id2)</span></span>
<span class="line"><span>  ⟺  r1 &gt; r2 OR (r1 == r2 AND id1 &gt; id2)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>每个节点维护本地的 round_number</span></span>
<span class="line"><span>  - 启动时从磁盘读</span></span>
<span class="line"><span>  - 每次发起 Prepare 前先 +1 并 fsync</span></span>
<span class="line"><span>  - 收到 NACK(发现别人用了更高 n)时,更新本地 round_number ≥ 对方的</span></span></code></pre></div><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>节点 ID=1 节点 ID=2</span></span>
<span class="line"><span>   round=0     round=0</span></span>
<span class="line"><span>   ↓           ↓</span></span>
<span class="line"><span>   提议 (1, 1)   提议 (1, 2)  ← 后者更大</span></span>
<span class="line"><span>   被 NACK     胜出</span></span>
<span class="line"><span>   ↓</span></span>
<span class="line"><span>   更新 round 到 2,提议 (2, 1)  ← 现在它更大</span></span></code></pre></div><blockquote><p><strong>Ballot Number 是 Paxos 的&quot;时间感&quot;</strong>。Lamport 在论文里把它叫 ballot number 是为了和&quot;议会投票&quot;故事对应,后人改叫 proposal number / round number / view number,本质都是一回事。</p></blockquote><hr><h2 id="九、活锁问题-paxos-的-心病" tabindex="-1">九、活锁问题:Paxos 的&quot;心病&quot; <a class="header-anchor" href="#九、活锁问题-paxos-的-心病" aria-label="Permalink to &quot;九、活锁问题:Paxos 的&quot;心病&quot;&quot;">​</a></h2><p><strong>两个 Proposer 不断互相打断</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>P1: Prepare(5)  → 收到多数派 Promise</span></span>
<span class="line"><span>P2: Prepare(7)  → 收到多数派 Promise(把 5 打断了)</span></span>
<span class="line"><span>P1: Accept(5,X) → 被拒绝(已承诺 7)</span></span>
<span class="line"><span>P1: Prepare(9)  → 收到多数派 Promise(把 7 打断了)</span></span>
<span class="line"><span>P2: Accept(7,Y) → 被拒绝(已承诺 9)</span></span>
<span class="line"><span>P2: Prepare(11) → 收到多数派 Promise</span></span>
<span class="line"><span>P1: Accept(9,X) → 被拒绝</span></span>
<span class="line"><span>... 无限循环,永远没人成功 Accept</span></span>
<span class="line"><span></span></span>
<span class="line"><span>这就是 Paxos 不满足 Termination 的根源</span></span></code></pre></div><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>时间 →</span></span>
<span class="line"><span>P1: P5 ──── A5(fail) ─── P9 ──── A9(fail) ─── P13 ──── A13(fail)</span></span>
<span class="line"><span>                                                          </span></span>
<span class="line"><span>P2: ────────── P7 ──── A7(fail) ─── P11 ──── A11(fail)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>任何时刻只要有人在 Prepare 阶段超过对方,对方在 Accept 阶段就失败</span></span></code></pre></div><p><strong>工程上的两种破解</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│ 方案一:随机退避(Random Backoff)                       │</span></span>
<span class="line"><span>│                                                         │</span></span>
<span class="line"><span>│ P1 失败 → 随机等 0~T 秒再重试                            │</span></span>
<span class="line"><span>│ P2 失败 → 随机等 0~T 秒再重试                            │</span></span>
<span class="line"><span>│                                                         │</span></span>
<span class="line"><span>│ 大概率两人不会同时重试,最终某人成功                     │</span></span>
<span class="line"><span>│ 简单,但延迟波动大                                       │</span></span>
<span class="line"><span>└────────────────────────────────────────────────────────┘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>┌────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│ 方案二:选一个稳定 Leader(Multi-Paxos 的核心)          │</span></span>
<span class="line"><span>│                                                         │</span></span>
<span class="line"><span>│ 集群在某段时间内选出一个 Leader,只有它发 Prepare        │</span></span>
<span class="line"><span>│ → 完全消除竞争,无活锁                                   │</span></span>
<span class="line"><span>│ Leader 失败时重新选举                                    │</span></span>
<span class="line"><span>│                                                         │</span></span>
<span class="line"><span>│ 这就是 Multi-Paxos / Raft 都用 Leader 的根本原因         │</span></span>
<span class="line"><span>└────────────────────────────────────────────────────────┘</span></span></code></pre></div><blockquote><p><strong>基础 Paxos 没有 Leader 概念,论文也没规定怎么选</strong>——它只规定了&quot;在 Proposer 之间存在共识协议&quot;。<strong>Leader 是工程必备,但 Lamport 把&quot;怎么选 Leader&quot; 这件事推给了实现者</strong>,这也是 Paxos 论文留下的最大&quot;工程空白&quot;之一,导致每家实现都不一样。</p></blockquote><hr><h2 id="十、为什么-basic-paxos-不能直接用" tabindex="-1">十、为什么 Basic Paxos 不能直接用 <a class="header-anchor" href="#十、为什么-basic-paxos-不能直接用" aria-label="Permalink to &quot;十、为什么 Basic Paxos 不能直接用&quot;">​</a></h2><p>把 Paxos 用在生产,有几个严重问题:</p><h3 id="_10-1-一个-paxos-实例只能决定一个值" tabindex="-1">10.1 一个 Paxos 实例只能决定一个值 <a class="header-anchor" href="#_10-1-一个-paxos-实例只能决定一个值" aria-label="Permalink to &quot;10.1 一个 Paxos 实例只能决定一个值&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Basic Paxos = 对&quot;一个值&quot;达成共识</span></span>
<span class="line"><span></span></span>
<span class="line"><span>但状态机需要&quot;一连串值&quot;(日志条目 1, 2, 3, ...)</span></span>
<span class="line"><span>→ 每条日志都要跑一个独立 Paxos = 每条都要 2 RTT + 多次 fsync</span></span>
<span class="line"><span></span></span>
<span class="line"><span>写一条日志的开销:</span></span>
<span class="line"><span>  - Prepare:1 RTT</span></span>
<span class="line"><span>  - Accept:1 RTT</span></span>
<span class="line"><span>  - Acceptor 两次 fsync(promised + accepted)</span></span>
<span class="line"><span>  - 网络往返 + 磁盘 fsync = 几十毫秒</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>→ 100 QPS 都到不了。</span></span></code></pre></div><h3 id="_10-2-每次都要-phase-1-太亏" tabindex="-1">10.2 每次都要 Phase 1 太亏 <a class="header-anchor" href="#_10-2-每次都要-phase-1-太亏" aria-label="Permalink to &quot;10.2 每次都要 Phase 1 太亏&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>观察:如果一直是同一个 Proposer 在提议</span></span>
<span class="line"><span>     它发的 Prepare 永远成功(没人和它抢)</span></span>
<span class="line"><span>     Phase 1 的功能就是&quot;发现历史 + 占住承诺线&quot;</span></span>
<span class="line"><span>     → 只要 Leader 不变,这部分可以一次性做完</span></span>
<span class="line"><span>     → 后续每条日志只跑 Phase 2(1 RTT)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>这就是 Multi-Paxos 的核心优化(下一篇详讲)</span></span></code></pre></div><h3 id="_10-3-工程实现的细节空白太多" tabindex="-1">10.3 工程实现的细节空白太多 <a class="header-anchor" href="#_10-3-工程实现的细节空白太多" aria-label="Permalink to &quot;10.3 工程实现的细节空白太多&quot;">​</a></h3><p>Basic Paxos 论文不告诉你:</p><ul><li>怎么选 Leader</li><li>怎么处理日志空洞(某些位置卡住)</li><li>怎么做成员变更</li><li>怎么 snapshot 压缩</li><li>怎么实现 client 幂等</li><li>Learner 怎么追日志</li></ul><p><strong>这就是为什么 Google Chubby、Spanner、PaxosStore 都用了&quot;自家版本&quot;的 Multi-Paxos</strong>,各家做法不一,<strong>Ongaro 看不下去,发明了规范一些的 Raft</strong>(13 篇)。</p><hr><h2 id="十一、basic-paxos-简化伪代码" tabindex="-1">十一、Basic Paxos 简化伪代码 <a class="header-anchor" href="#十一、basic-paxos-简化伪代码" aria-label="Permalink to &quot;十一、Basic Paxos 简化伪代码&quot;">​</a></h2><div class="language-python vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">python</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># === Proposer ===</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">class</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> Proposer</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    def</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> __init__</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(self, node_id, acceptors):</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.node_id </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> node_id</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.acceptors </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> acceptors</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.round </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 0</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    </span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    def</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> propose</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(self, value):</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">        while</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> True</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">            self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.round </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">+=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 1</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            n </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.round, </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.node_id)   </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 全局唯一编号</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            </span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">            # === Phase 1: Prepare ===</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            promises </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> broadcast(</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.acceptors, Prepare(n))</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">            if</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> count(promises) </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">&lt;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> majority(</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.acceptors):</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">                sleep(random_backoff())   </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 没拿到多数派,退避</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">                continue</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            </span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">            # 检查 Promise 里有没有带回已 Accept 过的值</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            accepted </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> [p.accepted </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">for</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> p </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">in</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> promises </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">if</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> p.accepted]</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">            if</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> accepted:</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                # 选编号最大的已接受值,放弃自己原本想提的 value</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">                v </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> max</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(accepted, </span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">key</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=lambda</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> x: x.n).v</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">            else</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">                v </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> value</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            </span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">            # === Phase 2: Accept ===</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            results </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> broadcast(</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.acceptors, Accept(n, v))</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">            if</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> count_accepted(results) </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">&gt;=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> majority(</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.acceptors):</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">                broadcast_learners(Chosen(n, v))</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">                return</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> v   </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 成功</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">            else</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">                sleep(random_backoff())</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">                continue</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">   # 重试</span></span></code></pre></div><div class="language-python vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">python</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># === Acceptor ===</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">class</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> Acceptor</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    def</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> __init__</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(self):</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">        # 这两个必须持久化(fsync 到磁盘)</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.promised_n </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> None</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.accepted </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> None</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">   # (n, v)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    </span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    def</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> on_prepare</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(self, n):</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">        if</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.promised_n </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">is</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> None</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> or</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> n </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">&gt;</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.promised_n:</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">            self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.promised_n </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> n</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            persist_to_disk(</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.promised_n)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">            return</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> Promise(n, </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.accepted)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">        else</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">            return</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> NACK(</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.promised_n)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    </span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    def</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> on_accept</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(self, n, v):</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">        if</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.promised_n </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">is</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> None</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> or</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> n </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">&gt;=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.promised_n:</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">            self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.promised_n </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> n</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">            self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.accepted </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (n, v)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            persist_to_disk(</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.promised_n, </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.accepted)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">            return</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> Accepted(n, v)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">        else</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">            return</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> NACK(</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.promised_n)</span></span></code></pre></div><div class="language-python vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">python</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># === Learner ===</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">class</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> Learner</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    def</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> __init__</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(self):</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.votes </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {}   </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># n -&gt; set of acceptors</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    </span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    def</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> on_accepted</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(self, acceptor_id, n, v):</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.votes.setdefault((n, v), </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">set</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">()).add(acceptor_id)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">        if</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> len</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">self</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">.votes[(n, v)]) </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">&gt;=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> majority:</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">            # 值已选定</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            apply_to_state_machine(v)</span></span></code></pre></div><hr><h2 id="十二、paxos-的工程映射" tabindex="-1">十二、Paxos 的工程映射 <a class="header-anchor" href="#十二、paxos-的工程映射" aria-label="Permalink to &quot;十二、Paxos 的工程映射&quot;">​</a></h2><p>虽然 Basic Paxos 不直接用,<strong>它的思想渗透在所有强一致系统里</strong>:</p><table tabindex="0"><thead><tr><th>真实系统</th><th>用 Paxos 的方式</th></tr></thead><tbody><tr><td><strong>Google Chubby</strong></td><td>Multi-Paxos 实现分布式锁 + 配置中心</td></tr><tr><td><strong>Google Spanner</strong></td><td>每个 Paxos group 用 Multi-Paxos 复制</td></tr><tr><td><strong>Microsoft Azure Cosmos DB</strong></td><td>Multi-Paxos 变体</td></tr><tr><td><strong>Tencent PaxosStore</strong></td><td>微信存储,Multi-Paxos</td></tr><tr><td><strong>Tencent Phxpaxos</strong></td><td>C++ 开源 Paxos 库</td></tr><tr><td><strong>Apache ZooKeeper</strong></td><td>ZAB(Zookeeper Atomic Broadcast,Paxos 变体)</td></tr><tr><td><strong>Apache Cassandra</strong></td><td>Lightweight Transaction 用 Basic Paxos 实现 CAS</td></tr><tr><td><strong>etcd / Consul</strong></td><td>Raft(Paxos 简化版,见 13 篇)</td></tr></tbody></table><blockquote><p><strong>Cassandra LWT 是少数真的在用 Basic Paxos 的场景</strong>——<code>INSERT ... IF NOT EXISTS</code> 这种 CAS 操作底下是 Basic Paxos,每次 CAS 要 2 RTT + 4 次 fsync,<strong>延迟数倍于普通写,生产慎用</strong>。</p></blockquote><hr><h2 id="十三、踩坑提醒" tabindex="-1">十三、踩坑提醒 <a class="header-anchor" href="#十三、踩坑提醒" aria-label="Permalink to &quot;十三、踩坑提醒&quot;">​</a></h2><ol><li><strong>以为 Paxos 是&quot;算法&quot;而忘了它需要稳定 Leader</strong>——Basic Paxos 没 Leader 概念,实际工程必须配上 Leader 选举,否则活锁</li><li><strong>以为 Paxos 在网络分区时还可用</strong>——多数派不可达就停服,这是 CP 的代价</li><li><strong>Proposal Number 没持久化</strong>——进程重启回滚 round,可能用比之前小的 n 提议,破坏不变量</li><li><strong>Acceptor 的 promised/accepted 没 fsync</strong>——掉电后状态丢失,可能重新承诺更小的 n,<strong>整个不变量崩溃</strong></li><li><strong>没区分 Promise 的&quot;约束&quot;和&quot;信息&quot;</strong>——Promise 既是承诺也是历史告知,两者都不能漏</li><li><strong>Proposer 不按 Promise 带回的最高编号 accepted 来选 value</strong>——直接破坏 Agreement,出现两个不同值都被选定</li><li><strong>多数派算错</strong>(N=4 时多数派是 3,N=5 时多数派是 3)——偶数节点是浪费,<strong>生产部署用奇数节点</strong>(3 / 5 / 7)</li><li><strong>用 Basic Paxos 跑高 QPS</strong>——单条 2 RTT + fsync,几百 QPS 就到顶,<strong>生产用 Multi-Paxos 或 Raft</strong></li><li><strong>Leader 选举不带 fencing</strong>——旧 Leader 复活继续提议,可能用旧 round 号造成混乱,<strong>新 Leader 必须先把 round 推高(看到旧的 + 1)</strong></li><li><strong>认为 Paxos 没有故障窗口</strong>——多数派不可达时拒绝服务,<strong>这是设计的容错代价,不是 bug</strong></li><li><strong>手写 Paxos 库</strong>——空缺太多,Google/腾讯都花了若干年才稳定,<strong>用 etcd-raft / hashicorp-raft / dragonboat,不要自己写</strong></li><li><strong>把 Paxos 当万能药</strong>——它只保证&quot;对一个值达成共识&quot;,<strong>不解决性能、跨地域、拜占庭、客户端幂等</strong>——这些都要工程额外加</li></ol><hr><p>Basic Paxos 是分布式共识的&quot;原始理论&quot;,它证明了&quot;在异步网络 + 故障下达成共识是可能的&quot;,但<strong>离能用还差很远</strong>。后人在 Basic Paxos 之上做的工程化叫 <strong>Multi-Paxos</strong>——Lamport 在 2001 年的 <em>Paxos Made Simple</em> 末尾简单提了几句(只有半页),<strong>所有真正生产用的&quot;Paxos 系统&quot;都是各家自己摸出的 Multi-Paxos</strong>。</p><p>下一篇:<code>12-Multi-Paxos与工程化.md</code>。<strong>这一篇决定你能不能看懂 Chubby / Spanner / PaxosStore 这些真正在跑生产的 Paxos 系统</strong>——稳定 Leader、日志复制、空洞填补、成员变更、Snapshot 压缩、客户端 exactly-once,<strong>Lamport 没告诉你的所有工程细节,都在这里</strong>。看完你也会理解,为什么 Ongaro 看不下去,直接发明了 Raft——Multi-Paxos 留的空白实在太多。</p>`,109)])])}const g=a(e,[["render",l]]);export{d as __pageData,g as default};
