import{_ as n,H as a,f as t,i as p}from"./chunks/framework.BHvCMIhP.js";const g=JSON.parse('{"title":"复制三态","description":"","frontmatter":{},"headers":[],"relativePath":"../distributedLearning/10-复制三态.md","filePath":"../distributedLearning/10-复制三态.md","lastUpdated":1778496697000}'),e={name:"../distributedLearning/10-复制三态.md"};function l(o,s,i,r,d,c){return a(),t("div",null,[...s[0]||(s[0]=[p(`<h1 id="复制三态" tabindex="-1">复制三态 <a class="header-anchor" href="#复制三态" aria-label="Permalink to &quot;复制三态&quot;">​</a></h1><p>数据放在一台机器上你不需要复制。<strong>一旦放到多台机器</strong>——为了不丢、为了高可用、为了读扩展、为了就近访问——你就立刻陷入分布式系统最古老的问题:<strong>多个副本之间,谁说了算</strong>。这一篇把工程上所有复制方案归结到三种基础拓扑:<strong>主从、多主、无主</strong>,以及那个贯穿三种拓扑的核心公式 <code>W + R &gt; N</code>。<strong>理解这一篇,你就理解了 MySQL 主从 / Kafka ISR / Cassandra Quorum / DynamoDB / Redis Sentinel 全家桶在做什么</strong>——它们都是三种拓扑的工程变体。</p><blockquote><p>一句话先记住:<strong>主从是&quot;一个人说了算&quot;</strong>(强一致但单点),<strong>多主是&quot;几个人各说各的&quot;</strong>(可用但要解冲突),<strong>无主是&quot;投票决定&quot;</strong>(弹性但延迟高)。<strong>Quorum NWR(W+R&gt;N)</strong> 是无主拓扑的不变量——任何一次读必然能&quot;撞上&quot;上一次写的副本。<strong>选错拓扑,后面所有共识算法都救不了你</strong>。</p></blockquote><hr><h2 id="一、为什么需要复制" tabindex="-1">一、为什么需要复制 <a class="header-anchor" href="#一、为什么需要复制" aria-label="Permalink to &quot;一、为什么需要复制&quot;">​</a></h2><p>副本(replica)是分布式系统第一块砖。一台机器扛不住的原因不只一个,<strong>每个原因都对应一种复制思路</strong>:</p><table tabindex="0"><thead><tr><th>痛点</th><th>复制能解决的事</th></tr></thead><tbody><tr><td>机器会坏(磁盘、内存、电源)</td><td>多副本防数据丢失</td></tr><tr><td>进程会重启(部署、OOM)</td><td>副本接管,业务不停</td></tr><tr><td>读压力大(热点 key)</td><td>读分摊到多副本</td></tr><tr><td>跨地域用户慢(延迟 100ms+)</td><td>数据就近放,读延迟低</td></tr><tr><td>单机存不下(PB 级)</td><td>分片 + 副本(本篇不深入分片)</td></tr></tbody></table><blockquote><p><strong>复制本身不创造价值,它只是为了应对&quot;机器会坏 / 用户在远方 / 单机扛不住&quot;这三件事</strong>。代价是:<strong>一旦你有了两个副本,你就有了&quot;它俩不一致&quot;的可能</strong>——所有麻烦从这里开始。</p></blockquote><hr><h2 id="二、复制的三种基础拓扑" tabindex="-1">二、复制的三种基础拓扑 <a class="header-anchor" href="#二、复制的三种基础拓扑" aria-label="Permalink to &quot;二、复制的三种基础拓扑&quot;">​</a></h2><p>工程上所有复制方案都能归到这三种:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>拓扑一:主从(Leader-based / Master-Slave / Primary-Secondary)</span></span>
<span class="line"><span>                  ┌──────┐</span></span>
<span class="line"><span>                  │ Leader│ ← 客户端只写这里</span></span>
<span class="line"><span>                  └───┬──┘</span></span>
<span class="line"><span>                      │ 同步/异步复制</span></span>
<span class="line"><span>            ┌─────────┼─────────┐</span></span>
<span class="line"><span>            ▼         ▼         ▼</span></span>
<span class="line"><span>        ┌──────┐  ┌──────┐  ┌──────┐</span></span>
<span class="line"><span>        │Follower│ │Follower│ │Follower│ ← 客户端可读这里</span></span>
<span class="line"><span>        └──────┘  └──────┘  └──────┘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>拓扑二:多主(Multi-Leader / Master-Master)</span></span>
<span class="line"><span>        ┌──────┐ ──────互相复制────→ ┌──────┐</span></span>
<span class="line"><span>        │Leader│ ←──────复制──────── │Leader│</span></span>
<span class="line"><span>        └──────┘                      └──────┘</span></span>
<span class="line"><span>            ▲ 客户端可写            客户端可写 ▲</span></span>
<span class="line"><span>            │                                │</span></span>
<span class="line"><span>         机房 A                            机房 B</span></span>
<span class="line"><span></span></span>
<span class="line"><span>拓扑三:无主(Leaderless / Dynamo-style)</span></span>
<span class="line"><span>                客户端</span></span>
<span class="line"><span>              ╱   │   ╲</span></span>
<span class="line"><span>             写到任意多个副本  / 读取任意多个副本</span></span>
<span class="line"><span>            ╱     │     ╲</span></span>
<span class="line"><span>        ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐</span></span>
<span class="line"><span>        │  N1  │ │  N2  │ │  N3  │ │  N4  │</span></span>
<span class="line"><span>        └──────┘ └──────┘ └──────┘ └──────┘</span></span>
<span class="line"><span>                没有 Leader,Quorum 决定一致性</span></span></code></pre></div><p>三种拓扑的特征对比:</p><table tabindex="0"><thead><tr><th>维度</th><th>主从</th><th>多主</th><th>无主</th></tr></thead><tbody><tr><td>写入点</td><td>单点(Leader)</td><td>多点(每个 Leader)</td><td>多点(任意副本)</td></tr><tr><td>强一致性</td><td>容易实现</td><td>难(冲突)</td><td>靠 Quorum</td></tr><tr><td>写性能</td><td>受 Leader 限制</td><td>高(并行)</td><td>高(并行)</td></tr><tr><td>故障切换</td><td>选新 Leader,有窗口</td><td>一个 Leader 挂不影响别的</td><td>副本失效不影响整体</td></tr><tr><td>写冲突</td><td>不存在</td><td>必然有,要解决</td><td>不存在(都是同一份数据)</td></tr><tr><td>真实系统</td><td>MySQL / PG / Kafka / Redis Sentinel</td><td>MySQL 双主 / CouchDB / DynamoDB Global</td><td>Cassandra / Riak / DynamoDB 单 region</td></tr></tbody></table><blockquote><p><strong>没有&quot;最优拓扑&quot;——只有&quot;和你业务对得上的拓扑&quot;</strong>。金融账户业务必须主从 + 强一致;跨地域协作类多主;海量低价值数据(用户行为日志、设备数据)无主。<strong>这一篇后面三节展开讲三种拓扑各自的工程细节</strong>。</p></blockquote><hr><h2 id="三、主从复制-工程世界最常见的形态" tabindex="-1">三、主从复制:工程世界最常见的形态 <a class="header-anchor" href="#三、主从复制-工程世界最常见的形态" aria-label="Permalink to &quot;三、主从复制:工程世界最常见的形态&quot;">​</a></h2><h3 id="_3-1-基本流程" tabindex="-1">3.1 基本流程 <a class="header-anchor" href="#_3-1-基本流程" aria-label="Permalink to &quot;3.1 基本流程&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>客户端 ──写──→ Leader</span></span>
<span class="line"><span>                 │</span></span>
<span class="line"><span>                 ▼</span></span>
<span class="line"><span>              本地持久化(WAL/binlog)</span></span>
<span class="line"><span>                 │</span></span>
<span class="line"><span>                 ▼</span></span>
<span class="line"><span>              复制日志到 Follower</span></span>
<span class="line"><span>                 │</span></span>
<span class="line"><span>        ┌────────┼────────┐</span></span>
<span class="line"><span>        ▼        ▼        ▼</span></span>
<span class="line"><span>     Follower Follower Follower</span></span>
<span class="line"><span>        │        │        │</span></span>
<span class="line"><span>        └────────┴────────┴───→ 应答 Leader</span></span>
<span class="line"><span>                                  │</span></span>
<span class="line"><span>                                  ▼</span></span>
<span class="line"><span>                              回复客户端 OK</span></span></code></pre></div><p><strong>核心问题</strong>:Leader <strong>什么时候</strong>回复客户端&quot;OK&quot;?</p><ul><li><strong>回复早</strong>:复制还没完成,Leader 挂了就丢数据</li><li><strong>回复晚</strong>:等所有 Follower 都收到才回,任何一个 Follower 慢都拖累整体</li></ul><p>这就是&quot;<strong>复制模式</strong>&quot;的取舍——同步、异步、半同步。</p><h3 id="_3-2-三种复制模式" tabindex="-1">3.2 三种复制模式 <a class="header-anchor" href="#_3-2-三种复制模式" aria-label="Permalink to &quot;3.2 三种复制模式&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌─────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│ 同步复制(Synchronous)                                  │</span></span>
<span class="line"><span>│   Leader 写本地 → 等&quot;所有&quot;Follower 确认 → 回客户端         │</span></span>
<span class="line"><span>│   保证不丢数据,但任何一个 Follower 慢就全卡              │</span></span>
<span class="line"><span>│   极少有生产系统这么做(性能太差)                        │</span></span>
<span class="line"><span>└─────────────────────────────────────────────────────────┘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>┌─────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│ 异步复制(Asynchronous)                                 │</span></span>
<span class="line"><span>│   Leader 写本地 → 立刻回客户端 → 异步推给 Follower         │</span></span>
<span class="line"><span>│   性能最好,但 Leader 挂了 + 未同步的数据就丢了           │</span></span>
<span class="line"><span>│   MySQL 默认主从 / Redis 主从 / PG 默认                  │</span></span>
<span class="line"><span>└─────────────────────────────────────────────────────────┘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>┌─────────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│ 半同步复制(Semi-synchronous)                           │</span></span>
<span class="line"><span>│   Leader 写本地 → 等&quot;至少 K 个&quot;Follower 确认 → 回客户端    │</span></span>
<span class="line"><span>│   K 可调(MySQL semi-sync K=1,Kafka acks=all + ISR)     │</span></span>
<span class="line"><span>│   性能与可靠性的平衡,生产主力方案                        │</span></span>
<span class="line"><span>└─────────────────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>为什么没人用纯同步</strong>:5 个 Follower,只要一个抖到 100ms,所有写都要等 100ms。在网络抖动是常态的真实环境下,<strong>纯同步等于&quot;任何一个副本故障 = 全系统不可用&quot;</strong>——完全反高可用。</p><p><strong>半同步是大多数生产系统的真实选择</strong>:</p><table tabindex="0"><thead><tr><th>系统</th><th>半同步参数</th><th>K 默认</th></tr></thead><tbody><tr><td>MySQL</td><td><code>rpl_semi_sync_master_wait_for_slave_count</code></td><td>1</td></tr><tr><td>Kafka</td><td><code>min.insync.replicas</code> + <code>acks=all</code></td><td>2(常见配置 3 副本 ISR≥2)</td></tr><tr><td>PostgreSQL</td><td><code>synchronous_standby_names</code></td><td>可指定 ANY N</td></tr><tr><td>MongoDB</td><td><code>writeConcern: {w: &quot;majority&quot;}</code></td><td>majority</td></tr></tbody></table><h3 id="_3-3-故障转移-failover" tabindex="-1">3.3 故障转移(Failover) <a class="header-anchor" href="#_3-3-故障转移-failover" aria-label="Permalink to &quot;3.3 故障转移(Failover)&quot;">​</a></h3><p>主从最复杂的不是复制,是<strong>Leader 挂了之后选谁当新 Leader</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌──────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│ Step 1: 故障检测                                       │</span></span>
<span class="line"><span>│   Follower 监测 Leader 心跳,N 秒无响应 → 标记 Down    │</span></span>
<span class="line"><span>│                                                       │</span></span>
<span class="line"><span>│ Step 2: 选举新 Leader                                  │</span></span>
<span class="line"><span>│   常见策略:                                           │</span></span>
<span class="line"><span>│     - 选日志最新的(GTID 最大、offset 最大)            │</span></span>
<span class="line"><span>│     - 仲裁 / Quorum 投票(Redis Sentinel / Patroni)    │</span></span>
<span class="line"><span>│     - 共识算法(Raft,见 13 篇)                       │</span></span>
<span class="line"><span>│                                                       │</span></span>
<span class="line"><span>│ Step 3: 客户端 / Proxy 切换                            │</span></span>
<span class="line"><span>│   通知所有客户端新 Leader 地址                          │</span></span>
<span class="line"><span>│   旧 Leader 复活后必须降级为 Follower(防双主!)         │</span></span>
<span class="line"><span>│                                                       │</span></span>
<span class="line"><span>│ Step 4: 数据修复                                       │</span></span>
<span class="line"><span>│   旧 Leader 上没同步出去的写要么丢、要么人工修复        │</span></span>
<span class="line"><span>└──────────────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>核心风险:脑裂(Split-brain)</strong>——网络分区时,两个分区各选出一个 Leader,<strong>两边都接收写</strong>,合并时数据冲突。</p><p><strong>主从架构防脑裂的工程手段</strong>:</p><ul><li><strong>多数派投票</strong>(Raft / Sentinel quorum):必须超过半数节点同意才能当 Leader</li><li><strong>STONITH</strong>(Shoot The Other Node In The Head):新 Leader 上线前先把旧 Leader 强制关电</li><li><strong>Fencing token</strong>(详见 26 篇分布式锁):每次切主递增 epoch,旧 Leader 用旧 epoch 写入会被拒绝</li></ul><blockquote><p><strong>故障转移是主从架构最容易出事的环节</strong>——98% 的&quot;主从挂了导致数据丢失 / 双写&quot;事故都发生在切主期间。<strong>自动切主必须配上多数派仲裁,千万别让单个 sentinel 决定切主</strong>。</p></blockquote><h3 id="_3-4-真实系统对照" tabindex="-1">3.4 真实系统对照 <a class="header-anchor" href="#_3-4-真实系统对照" aria-label="Permalink to &quot;3.4 真实系统对照&quot;">​</a></h3><table tabindex="0"><thead><tr><th>系统</th><th>复制方式</th><th>切主机制</th><th>默认一致性倾向</th></tr></thead><tbody><tr><td><strong>MySQL 主从</strong></td><td>异步 binlog 复制</td><td>人工 / MHA / Orchestrator</td><td>AP(主挂丢未同步数据)</td></tr><tr><td><strong>MySQL 半同步</strong></td><td>至少 1 个从确认</td><td>同上</td><td>偏 CP</td></tr><tr><td><strong>PostgreSQL 流复制</strong></td><td>异步 / 同步可配</td><td>Patroni + etcd</td><td>取决于配置</td></tr><tr><td><strong>Redis Sentinel</strong></td><td>异步</td><td>Sentinel Quorum 选举</td><td>AP(主挂数据可能丢)</td></tr><tr><td><strong>Kafka</strong></td><td>ISR 同步,acks=all</td><td>Controller 选 ISR 中的</td><td>CP(acks=all+min.insync)</td></tr><tr><td><strong>MongoDB</strong></td><td>OpLog 异步,writeConcern 可配</td><td>Replica Set 投票</td><td>偏 CP(majority)</td></tr><tr><td><strong>etcd / Consul</strong></td><td>Raft 同步多数派</td><td>Raft 选举</td><td>强一致 CP</td></tr></tbody></table><hr><h2 id="四、多主复制-跨地域协作的方案" tabindex="-1">四、多主复制:跨地域协作的方案 <a class="header-anchor" href="#四、多主复制-跨地域协作的方案" aria-label="Permalink to &quot;四、多主复制:跨地域协作的方案&quot;">​</a></h2><h3 id="_4-1-为什么需要多主" tabindex="-1">4.1 为什么需要多主 <a class="header-anchor" href="#_4-1-为什么需要多主" aria-label="Permalink to &quot;4.1 为什么需要多主&quot;">​</a></h3><p>主从拓扑的天生限制:<strong>写入必须经过单点 Leader</strong>。如果用户分布在多个大陆:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>中国用户 ──→ 美国 Leader(单点)</span></span>
<span class="line"><span>            往返延迟 250ms</span></span>
<span class="line"><span>            写一次就 250ms+,体验极差</span></span></code></pre></div><p><strong>多主拓扑允许每个机房有一个本地 Leader</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>            ┌─────────────┐         ┌─────────────┐</span></span>
<span class="line"><span>            │ 北京 Leader │ ←━复制━→│ 美国 Leader │</span></span>
<span class="line"><span>            └─────────────┘         └─────────────┘</span></span>
<span class="line"><span>                  ▲                       ▲</span></span>
<span class="line"><span>        中国用户写本地 Leader        美国用户写本地 Leader</span></span>
<span class="line"><span>        延迟 1ms                       延迟 1ms</span></span></code></pre></div><p>每个地域用户的写延迟都是本地级别(1-10ms),<strong>异步双向复制</strong>让数据最终在两边一致。</p><p><strong>典型场景</strong>:</p><ul><li><strong>跨地域多活</strong>:Google Docs、Notion、Figma 协同编辑(配 CRDT)</li><li><strong>离线优先</strong>:CouchDB 移动端、Apple iCloud 笔记</li><li><strong>数据库双主</strong>:MySQL 双主互备(谨慎用,容易冲突)</li></ul><h3 id="_4-2-写冲突——多主的死穴" tabindex="-1">4.2 写冲突——多主的死穴 <a class="header-anchor" href="#_4-2-写冲突——多主的死穴" aria-label="Permalink to &quot;4.2 写冲突——多主的死穴&quot;">​</a></h3><p><strong>两个 Leader 同时改同一行</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>T0  Leader A: UPDATE user SET name=&#39;张三&#39; WHERE id=1</span></span>
<span class="line"><span>T0  Leader B: UPDATE user SET name=&#39;李四&#39; WHERE id=1</span></span>
<span class="line"><span>       ↓               ↓</span></span>
<span class="line"><span>       同步给对方     同步给对方</span></span>
<span class="line"><span>       ↓               ↓</span></span>
<span class="line"><span>T1  Leader A 收到 &quot;id=1 → 李四&quot;</span></span>
<span class="line"><span>    Leader B 收到 &quot;id=1 → 张三&quot;</span></span>
<span class="line"><span>    </span></span>
<span class="line"><span>现在两边的值不一样,谁说了算?</span></span></code></pre></div><p><strong>冲突解决策略</strong>:</p><table tabindex="0"><thead><tr><th>策略</th><th>思路</th><th>用在哪</th></tr></thead><tbody><tr><td><strong>Last Write Wins(LWW)</strong></td><td>用时间戳取最新,丢掉旧的</td><td>DynamoDB / Cassandra(默认)</td></tr><tr><td><strong>客户端定义合并函数</strong></td><td>应用层决定怎么合并</td><td>Riak / CouchDB</td></tr><tr><td><strong>CRDT</strong></td><td>选择数据结构本身就能合并</td><td>Yjs / Automerge / Redis(部分)</td></tr><tr><td><strong>版本向量 + 多版本保留</strong></td><td>检测到冲突就保留所有版本让用户选</td><td>Dynamo / Riak siblings</td></tr><tr><td><strong>避免冲突</strong>(拓扑约束)</td><td>同一条记录只能在某个机房改</td><td>业务设计(用户分配到某 region)</td></tr></tbody></table><blockquote><p><strong>LWW 是最简单但最危险的方案</strong>——它会<strong>静默丢数据</strong>。两个用户同时改一个文档,LWW 直接丢一个的修改。这就是为什么 Google Docs 不用 LWW 而用 CRDT(见 19 篇)。<strong>LWW 只适合&quot;丢一个无所谓&quot;的数据</strong>(状态字段、计数等)。</p></blockquote><h3 id="_4-3-复制拓扑" tabindex="-1">4.3 复制拓扑 <a class="header-anchor" href="#_4-3-复制拓扑" aria-label="Permalink to &quot;4.3 复制拓扑&quot;">​</a></h3><p>多主之间的复制图也分形态:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>全连接(全员互复制):</span></span>
<span class="line"><span>    A ←→ B</span></span>
<span class="line"><span>    │ X │      N 个节点 → N*(N-1) 条复制链路</span></span>
<span class="line"><span>    C ←→ D     扩展性差,适合 3-4 个节点</span></span>
<span class="line"><span></span></span>
<span class="line"><span>环形:</span></span>
<span class="line"><span>    A → B → C → D → A   每个节点接收上游,转发给下游</span></span>
<span class="line"><span>    复制链路少,但中间任一节点挂了就断链</span></span>
<span class="line"><span></span></span>
<span class="line"><span>星形:</span></span>
<span class="line"><span>    A</span></span>
<span class="line"><span>    │</span></span>
<span class="line"><span>    A ↔ B,A ↔ C,A ↔ D     A 是中心,但 A 挂了就废</span></span></code></pre></div><p>工程上<strong>全连接最常见</strong>(机房数少),CockroachDB / Spanner / 跨 region 数据库都用全连接。</p><h3 id="_4-4-真实系统案例" tabindex="-1">4.4 真实系统案例 <a class="header-anchor" href="#_4-4-真实系统案例" aria-label="Permalink to &quot;4.4 真实系统案例&quot;">​</a></h3><table tabindex="0"><thead><tr><th>系统</th><th>多主方式</th><th>冲突解决</th></tr></thead><tbody><tr><td><strong>MySQL 双主</strong></td><td>互为 master,binlog 双向复制</td><td>业务层避免(分库到不同主)</td></tr><tr><td><strong>CouchDB</strong></td><td>多主异步同步</td><td>应用层 / 多版本保留</td></tr><tr><td><strong>DynamoDB Global Tables</strong></td><td>跨 region 多主</td><td>LWW(时间戳)</td></tr><tr><td><strong>CockroachDB / Spanner</strong></td><td>多 region 多副本</td><td>Paxos/Raft 决定单条记录唯一 Leader</td></tr><tr><td><strong>Cassandra(跨 DC)</strong></td><td>DC 间多向复制</td><td>LWW(timestamp)</td></tr><tr><td><strong>Google Docs / Figma</strong></td><td>客户端多主 + 服务端协调</td><td>CRDT / OT</td></tr></tbody></table><hr><h2 id="五、无主复制-dynamo-风格" tabindex="-1">五、无主复制:Dynamo 风格 <a class="header-anchor" href="#五、无主复制-dynamo-风格" aria-label="Permalink to &quot;五、无主复制:Dynamo 风格&quot;">​</a></h2><h3 id="_5-1-基本思路" tabindex="-1">5.1 基本思路 <a class="header-anchor" href="#_5-1-基本思路" aria-label="Permalink to &quot;5.1 基本思路&quot;">​</a></h3><p><strong>没有 Leader,客户端直接写多个副本,读也直接读多个副本</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                   写入流程(N=3, W=2)</span></span>
<span class="line"><span>                        客户端</span></span>
<span class="line"><span>                          │</span></span>
<span class="line"><span>                ┌─────────┼─────────┐</span></span>
<span class="line"><span>                ▼         ▼         ▼</span></span>
<span class="line"><span>             ┌────┐    ┌────┐    ┌────┐</span></span>
<span class="line"><span>             │ N1 │    │ N2 │    │ N3 │</span></span>
<span class="line"><span>             └────┘    └────┘    └────┘</span></span>
<span class="line"><span>              ✓ OK     ✓ OK     × 超时</span></span>
<span class="line"><span></span></span>
<span class="line"><span>           收到 2 个 ACK ≥ W(2),返回客户端成功</span></span>
<span class="line"><span>           N3 之后会通过 read-repair 或 hinted handoff 同步</span></span></code></pre></div><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                   读取流程(N=3, R=2)</span></span>
<span class="line"><span>                        客户端</span></span>
<span class="line"><span>                          │</span></span>
<span class="line"><span>                ┌─────────┼─────────┐</span></span>
<span class="line"><span>                ▼         ▼         ▼</span></span>
<span class="line"><span>             ┌────┐    ┌────┐    ┌────┐</span></span>
<span class="line"><span>             │ N1 │    │ N2 │    │ N3 │</span></span>
<span class="line"><span>             └────┘    └────┘    └────┘</span></span>
<span class="line"><span>              v=5      v=5      v=3(旧)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>           收到 2 个响应 ≥ R(2),取版本最新的 v=5 返回</span></span>
<span class="line"><span>           顺便修复 N3 上的旧版本(read-repair)</span></span></code></pre></div><p><strong>关键参数</strong>:</p><ul><li><code>N</code> = 副本数(每个 key 写到 N 个副本)</li><li><code>W</code> = 写入要求多少副本确认(写 quorum)</li><li><code>R</code> = 读取要求多少副本响应(读 quorum)</li></ul><h3 id="_5-2-quorum-公式-w-r-n" tabindex="-1">5.2 Quorum 公式:W + R &gt; N <a class="header-anchor" href="#_5-2-quorum-公式-w-r-n" aria-label="Permalink to &quot;5.2 Quorum 公式:W + R &gt; N&quot;">​</a></h3><p><strong>这是无主复制的核心不变量</strong>。</p><p><strong>为什么 W + R &gt; N 能保证读到最新写</strong>?</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>鸽笼原理(Pigeonhole)证明:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>假设 N = 5,W = 3,R = 3,W + R = 6 &gt; 5</span></span>
<span class="line"><span></span></span>
<span class="line"><span>某次写入:更新到 3 个副本(集合 W&#39;)</span></span>
<span class="line"><span>某次读取:读 3 个副本(集合 R&#39;)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>|W&#39;| + |R&#39;| = 6 &gt; 5 = |所有副本|</span></span>
<span class="line"><span>→ W&#39; 和 R&#39; 必然有交集(至少 1 个副本同时被写过又被读到)</span></span>
<span class="line"><span>→ 读到的版本里必然包含最新写过的那份</span></span>
<span class="line"><span>→ 客户端只要取版本号最大的,就读到了最新数据</span></span></code></pre></div><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                所有副本 N=5</span></span>
<span class="line"><span>       ┌─────────────────────────────────┐</span></span>
<span class="line"><span>       │                                 │</span></span>
<span class="line"><span>       │  ┌───── W (写过的 3 个) ─────┐  │</span></span>
<span class="line"><span>       │  │                           │  │</span></span>
<span class="line"><span>       │  │  ┌─── 必然有交集 ─┐       │  │</span></span>
<span class="line"><span>       │  │  │  ●  ●  ●        │      │  │</span></span>
<span class="line"><span>       │  │  └────────────────┘       │  │</span></span>
<span class="line"><span>       │  └───────────────────────────┘  │</span></span>
<span class="line"><span>       │     ┌─── R (读到的 3 个) ────┐  │</span></span>
<span class="line"><span>       │     │                         │ │</span></span>
<span class="line"><span>       │     └─────────────────────────┘ │</span></span>
<span class="line"><span>       │                                 │</span></span>
<span class="line"><span>       └─────────────────────────────────┘</span></span>
<span class="line"><span>       </span></span>
<span class="line"><span>        W=3, R=3, N=5</span></span>
<span class="line"><span>        W ∪ R 不可能塞下 N=5 的所有</span></span>
<span class="line"><span>        → 必有交集 ≥ W+R-N = 1</span></span></code></pre></div><h3 id="_5-3-可调一致性" tabindex="-1">5.3 可调一致性 <a class="header-anchor" href="#_5-3-可调一致性" aria-label="Permalink to &quot;5.3 可调一致性&quot;">​</a></h3><p>通过调 <code>W</code> 和 <code>R</code>,<strong>同一个系统不同操作可以选不同一致性档</strong>:</p><table tabindex="0"><thead><tr><th>配置</th><th>含义</th><th>一致性</th><th>性能</th></tr></thead><tbody><tr><td>W=N, R=1</td><td>全部副本都写,读任一</td><td>强一致</td><td>写慢,读快</td></tr><tr><td>W=1, R=N</td><td>写一个就回,读全部</td><td>强一致</td><td>写快,读慢</td></tr><tr><td>W=quorum, R=quorum</td><td>多数派写读</td><td>强一致</td><td>平衡</td></tr><tr><td>W=1, R=1</td><td>写一个读一个</td><td>最终一致(可能读到旧)</td><td>极快</td></tr><tr><td>W=N, R=N</td><td>全部</td><td>强一致 + 容错差(任一挂就停)</td><td>慢</td></tr></tbody></table><p><strong>Cassandra 的 consistency level</strong>(单行操作可配):</p><div class="language-sql vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">sql</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">-- 这条写需要多数派确认,强一致</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">INSERT INTO</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> users ... </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">USING</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> CONSISTENCY QUORUM;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">-- 这条读只要一个副本响应就行,最快但可能读到旧</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">SELECT</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> *</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> FROM</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> users </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">WHERE</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> ... </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">USING</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> CONSISTENCY ONE;</span></span></code></pre></div><h3 id="_5-4-反熵机制-数据怎么追上" tabindex="-1">5.4 反熵机制:数据怎么追上 <a class="header-anchor" href="#_5-4-反熵机制-数据怎么追上" aria-label="Permalink to &quot;5.4 反熵机制:数据怎么追上&quot;">​</a></h3><p>无主复制下,某些写没到达所有副本(W &lt; N 时是常态),靠两种机制最终对齐:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌──────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│ Read Repair(读时修复)                                │</span></span>
<span class="line"><span>│                                                       │</span></span>
<span class="line"><span>│   客户端读 R 个副本 → 发现某些副本版本旧                │</span></span>
<span class="line"><span>│   → 立刻把最新版本写回旧副本                            │</span></span>
<span class="line"><span>│                                                       │</span></span>
<span class="line"><span>│   优势:对常被读的 key,自然趋向一致                    │</span></span>
<span class="line"><span>│   劣势:冷数据永远不会被修复                            │</span></span>
<span class="line"><span>└──────────────────────────────────────────────────────┘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>┌──────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│ Hinted Handoff(暂存递送)                            │</span></span>
<span class="line"><span>│                                                       │</span></span>
<span class="line"><span>│   写入时某个副本不可达 → 协调节点把写&quot;暂存&quot;在别的节点    │</span></span>
<span class="line"><span>│   → 失联节点恢复后,协调节点把暂存的写转发过去          │</span></span>
<span class="line"><span>│                                                       │</span></span>
<span class="line"><span>│   优势:故障期间不丢写                                 │</span></span>
<span class="line"><span>│   劣势:暂存节点本身挂了就丢                            │</span></span>
<span class="line"><span>└──────────────────────────────────────────────────────┘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>┌──────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│ Anti-Entropy(后台反熵)                              │</span></span>
<span class="line"><span>│                                                       │</span></span>
<span class="line"><span>│   定期跑后台进程,对比副本间数据差异 → 修复             │</span></span>
<span class="line"><span>│   (用 Merkle Tree 加速比较,Cassandra/Dynamo 都这样)   │</span></span>
<span class="line"><span>│                                                       │</span></span>
<span class="line"><span>│   优势:能覆盖冷数据,最终一定一致                      │</span></span>
<span class="line"><span>│   劣势:延迟高,带宽消耗大                              │</span></span>
<span class="line"><span>└──────────────────────────────────────────────────────┘</span></span></code></pre></div><h3 id="_5-5-真实系统" tabindex="-1">5.5 真实系统 <a class="header-anchor" href="#_5-5-真实系统" aria-label="Permalink to &quot;5.5 真实系统&quot;">​</a></h3><table tabindex="0"><thead><tr><th>系统</th><th>默认 N/W/R</th><th>冲突解决</th></tr></thead><tbody><tr><td><strong>Cassandra</strong></td><td>可配,常见 N=3, W=R=Quorum(=2)</td><td>LWW(timestamp)</td></tr><tr><td><strong>Riak</strong></td><td>N=3, W=R=2 默认</td><td>siblings(多版本) / CRDT</td></tr><tr><td><strong>DynamoDB</strong></td><td>内部 N=3</td><td>LWW + 客户端可选强一致读(R=quorum)</td></tr><tr><td><strong>Voldemort</strong>(LinkedIn)</td><td>可配</td><td>客户端定义 merge</td></tr><tr><td><strong>Redis Cluster</strong></td><td>严格意义不是无主,<strong>它是 sharded 主从</strong></td><td>—</td></tr></tbody></table><hr><h2 id="六、复制延迟引发的一致性问题" tabindex="-1">六、复制延迟引发的一致性问题 <a class="header-anchor" href="#六、复制延迟引发的一致性问题" aria-label="Permalink to &quot;六、复制延迟引发的一致性问题&quot;">​</a></h2><p><strong>异步复制 + 主从读写分离</strong>,几乎必然遇到下面三类用户感知问题(详见 16 篇一致性谱):</p><h3 id="_6-1-读自己写-read-your-writes" tabindex="-1">6.1 读自己写(Read-Your-Writes) <a class="header-anchor" href="#_6-1-读自己写-read-your-writes" aria-label="Permalink to &quot;6.1 读自己写(Read-Your-Writes)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>用户改头像 → 写到 Leader → 立刻刷新页面</span></span>
<span class="line"><span>                            ↓</span></span>
<span class="line"><span>                        请求被路由到 Follower</span></span>
<span class="line"><span>                            ↓</span></span>
<span class="line"><span>                        Follower 还没同步到最新</span></span>
<span class="line"><span>                            ↓</span></span>
<span class="line"><span>                        用户看到旧头像 → &quot;我没改成功?&quot; → 又改一遍</span></span></code></pre></div><p><strong>对策</strong>:</p><ul><li>用户自己的写后 N 秒内,所有读强制走 Leader</li><li>或者前端记 <code>lastWriteTimestamp</code>,带在请求里,服务端确认 Follower 同步到这个时间戳之后才返回</li></ul><h3 id="_6-2-单调读-monotonic-read" tabindex="-1">6.2 单调读(Monotonic Read) <a class="header-anchor" href="#_6-2-单调读-monotonic-read" aria-label="Permalink to &quot;6.2 单调读(Monotonic Read)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>用户刷朋友圈 → 请求路由到 Follower A(已同步到 t=100)</span></span>
<span class="line"><span>              → 看到 100 条新动态</span></span>
<span class="line"><span>用户再刷一次 → 请求路由到 Follower B(同步到 t=80)</span></span>
<span class="line"><span>              → 看到 80 条新动态(比上次还少!)</span></span>
<span class="line"><span>              </span></span>
<span class="line"><span>用户:&quot;我的朋友圈倒退了?&quot;</span></span></code></pre></div><p><strong>对策</strong>:</p><ul><li>同一用户的请求走同一个 Follower(session sticky)</li><li>或者带版本游标,服务端保证返回数据版本 ≥ 客户端游标</li></ul><h3 id="_6-3-一致前缀读-consistent-prefix-read" tabindex="-1">6.3 一致前缀读(Consistent Prefix Read) <a class="header-anchor" href="#_6-3-一致前缀读-consistent-prefix-read" aria-label="Permalink to &quot;6.3 一致前缀读(Consistent Prefix Read)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>群里对话:</span></span>
<span class="line"><span>A: &quot;你今晚有空吗?&quot;  → 写到 Leader → 同步到 Follower 1</span></span>
<span class="line"><span>B: &quot;有,几点?&quot;      → 写到 Leader → 同步到 Follower 2(更慢)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>读 Follower 2 的用户先看到 &quot;有,几点?&quot;</span></span>
<span class="line"><span>后看到 &quot;你今晚有空吗?&quot; → 顺序反了</span></span></code></pre></div><p><strong>对策</strong>:</p><ul><li>因果相关的写聚到同一分片(同一会话同一分片)</li><li>用版本向量或 HLC(详见 07 / 08 篇)追踪因果</li></ul><hr><h2 id="七、复制-vs-分片-两件不同的事" tabindex="-1">七、复制 vs 分片:两件不同的事 <a class="header-anchor" href="#七、复制-vs-分片-两件不同的事" aria-label="Permalink to &quot;七、复制 vs 分片:两件不同的事&quot;">​</a></h2><p>经常被混淆,<strong>它们正交</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌────────────────────────┬────────────────────────┐</span></span>
<span class="line"><span>│ 单分片 + 多副本          │ 多分片 + 多副本          │</span></span>
<span class="line"><span>│ Redis 主从 / MySQL 主从  │ Cassandra / Redis Cluster│</span></span>
<span class="line"><span>│ (只能扩读,不能扩容量)   │ (读写容量都扩)           │</span></span>
<span class="line"><span>├────────────────────────┼────────────────────────┤</span></span>
<span class="line"><span>│ 单分片 + 单副本          │ 多分片 + 单副本          │</span></span>
<span class="line"><span>│ 单机 MySQL              │ MySQL 分库(无主备)      │</span></span>
<span class="line"><span>│ (一台机器)               │ (容量扩了但不容错)        │</span></span>
<span class="line"><span>└────────────────────────┴────────────────────────┘</span></span></code></pre></div><ul><li><strong>复制</strong>解决:可用性、读扩展、就近访问</li><li><strong>分片</strong>解决:写扩展、容量扩展(单机存不下)</li></ul><blockquote><p><strong>本系列 10 篇只讲复制,分片在 25 篇一致性哈希里展开</strong>。但生产系统两者都要,Cassandra 这种「先分片到 token range,再每个 range 做 N=3 复制」是典型组合。</p></blockquote><hr><h2 id="八、复制三态选型决策" tabindex="-1">八、复制三态选型决策 <a class="header-anchor" href="#八、复制三态选型决策" aria-label="Permalink to &quot;八、复制三态选型决策&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                  数据写入是否要强一致?</span></span>
<span class="line"><span>                        │</span></span>
<span class="line"><span>              ┌─────────┴─────────┐</span></span>
<span class="line"><span>              是                   否</span></span>
<span class="line"><span>              │                   │</span></span>
<span class="line"><span>        在跨地域吗?         能容忍冲突解决吗?</span></span>
<span class="line"><span>              │                   │</span></span>
<span class="line"><span>        ┌─────┴────┐         ┌────┴────┐</span></span>
<span class="line"><span>        否          是        是        否</span></span>
<span class="line"><span>        │           │         │         │</span></span>
<span class="line"><span>      ┌─▼──┐   ┌────▼────┐ ┌─▼─┐   ┌──▼──┐</span></span>
<span class="line"><span>      │主从│   │跨地域CP│  │多主│   │主从+│</span></span>
<span class="line"><span>      │+共识│   │Spanner│  │+冲突│   │读自写│</span></span>
<span class="line"><span>      │etcd│   │CockroachDB│解决│   │主库读│</span></span>
<span class="line"><span>      └────┘   └────────┘  └────┘   └─────┘</span></span>
<span class="line"><span>                                    </span></span>
<span class="line"><span>        全量级海量低价值数据(用户行为日志、设备数据、爆款商品评论)?</span></span>
<span class="line"><span>                            │</span></span>
<span class="line"><span>                            ▼</span></span>
<span class="line"><span>                       无主 + Quorum</span></span>
<span class="line"><span>                       Cassandra / DynamoDB</span></span></code></pre></div><p><strong>最常见的工程选择</strong>:</p><table tabindex="0"><thead><tr><th>业务</th><th>推荐拓扑</th></tr></thead><tbody><tr><td>金融账户 / 库存 / 订单核心</td><td>主从 + 共识(etcd/ZK 调度,或 TiDB / Spanner)</td></tr><tr><td>用户资料 / 商品 / 通用业务</td><td>主从 + 半同步 + 缓存(MySQL + Redis)</td></tr><tr><td>时序日志 / 监控 / IoT 海量数据</td><td>无主(Cassandra / InfluxDB Cluster)</td></tr><tr><td>跨大洲实时协作(文档、白板)</td><td>多主 + CRDT</td></tr><tr><td>缓存 / 计数器 / 排行榜</td><td>主从异步 + 偶尔丢可接受(Redis 主从)</td></tr></tbody></table><hr><h2 id="九、真实生产事故引发的教训" tabindex="-1">九、真实生产事故引发的教训 <a class="header-anchor" href="#九、真实生产事故引发的教训" aria-label="Permalink to &quot;九、真实生产事故引发的教训&quot;">​</a></h2><p><strong>MySQL 主从异步丢数据(无数公司踩过)</strong></p><p>GitHub 2012、Gitlab 2017 那种&quot;主库挂了,从库晋升后发现 5 分钟数据没了&quot;的事故,<strong>根本原因都是默认异步复制</strong>。<strong>写入价值高的业务必须开半同步</strong>(MySQL <code>rpl_semi_sync_master_wait_for_slave_count &gt;= 1</code>,配双从)。</p><p><strong>Redis Sentinel 脑裂丢写</strong></p><p>2015 年 Antirez 自己写过:Sentinel 默认配置下,<strong>网络分区时旧主仍在接受写,新主选出来后旧主的写全丢</strong>。修复:开 <code>min-slaves-to-write</code>(现在叫 <code>min-replicas-to-write</code>),没有足够从节点同步时主库直接拒写。</p><p><strong>Cassandra LWW 静默丢数据</strong></p><p>跨 DC 时钟不同步 → 时间戳小的写被丢弃。<strong>Jepsen 报告里 Cassandra 在网络分区 + 时钟漂移下丢数据是常态</strong>。修复:用 HLC / 业务层版本号,别完全依赖系统时钟。</p><p><strong>Kafka acks=1 的隐患</strong></p><p><code>acks=1</code> 表示只要 Leader 确认就回 OK,Leader 挂了 + 未同步到 ISR 的消息 → 丢。<strong>生产推荐 <code>acks=all + min.insync.replicas=2</code></strong>(3 副本配置下),配合 <code>unclean.leader.election.enable=false</code>。</p><hr><h2 id="十、踩坑提醒" tabindex="-1">十、踩坑提醒 <a class="header-anchor" href="#十、踩坑提醒" aria-label="Permalink to &quot;十、踩坑提醒&quot;">​</a></h2><ol><li><strong>默认配置就上生产</strong>——MySQL / Redis / Kafka 默认都是异步,<strong>主挂必丢数据</strong>,价值高的业务必须显式开半同步/多数派确认</li><li><strong>半同步只配 1 个</strong>——<code>min.insync.replicas=1</code> 等于异步,<strong>至少 2 个</strong>才有意义(3 副本 / 配 2 确认)</li><li><strong>以为有从库就高可用</strong>——故障切换不自动 = 没有高可用,<strong>主从 + 自动切换 + 仲裁三件套缺一不可</strong></li><li><strong>自动切主没配仲裁</strong>——Sentinel 1 个节点决定切主就是定时炸弹,<strong>至少 3 节点 quorum</strong></li><li><strong>多主当主从用</strong>——双主互写不做业务侧拆分必出冲突,<strong>多主必须配明确的冲突解决策略</strong></li><li><strong>LWW 用在重要数据</strong>——LWW 静默丢数据,<strong>用在有版本意义的字段(状态、计数器),别用在用户内容</strong></li><li><strong>Quorum 不等于强一致</strong>——<code>W+R&gt;N</code> 只保证&quot;能读到上次确认的写&quot;,<strong>读写之间的并发顺序还要靠版本号 / HLC</strong></li><li><strong>跨 DC 时钟不同步直接上 LWW</strong>——必丢数据,<strong>跨 DC 上 NTP 严格同步 + HLC / 业务版本号</strong></li><li><strong>以为复制能扩写</strong>——主从扩读不扩写,<strong>Leader 单点是写性能上限</strong>,要扩写必须分片(见 25 篇)</li><li><strong>故障切主期间不停止旧主写入</strong>——旧主复活继续写就是双写脑裂,<strong>必须 fencing / STONITH(见 26 / 27 篇)</strong></li><li><strong>忽略读自己写需求</strong>——用户感知最强的就是&quot;我刚改的怎么没生效&quot;,<strong>所有用户面的写后立刻读必须走 Leader</strong></li><li><strong>不画复制拓扑图</strong>——复制方案不在白板上画一遍永远看不见漏洞,<strong>写之前画图,看完图再写</strong></li></ol><hr><p>复制三态是共识的&quot;前置题&quot;——<strong>主从用 Leader,Leader 怎么选?多主有冲突,怎么不出错?无主用 quorum,quorum 怎么投票?</strong> 答案都是同一个东西:<strong>共识算法(Consensus)</strong>。</p><p>下一篇:<code>11-Paxos经典版.md</code>。<strong>Paxos 是分布式系统的&quot;哥德巴赫猜想&quot;</strong>——所有人都听过,大多数人讲不清楚,Leslie Lamport 写了三篇论文(1989/1998/2001)讲它,后人还在写&quot;Paxos Made Simple&quot;、&quot;Paxos Made Live&quot;、&quot;Paxos Made Moderately Complex&quot; 试图把它讲明白。我们这篇不堆论文,<strong>只把 Paxos 当成&quot;两阶段 + 多数派&quot;的最小化共识协议来讲</strong>——讲完你就知道为什么 Chubby / Spanner / 几乎所有数据库的&quot;强一致&quot;底下都是它。</p>`,123)])])}const u=n(e,[["render",l]]);export{g as __pageData,u as default};
