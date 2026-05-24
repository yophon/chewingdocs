import{c as a,Q as n,j as p,m as i}from"./chunks/framework.Bhbi9jCp.js";const g=JSON.parse('{"title":"渐进发布:蓝绿 / 金丝雀 / 影子流量 / 自动 rollback","description":"","frontmatter":{},"headers":[],"relativePath":"devopsLearning/21-渐进发布.md","filePath":"devopsLearning/21-渐进发布.md","lastUpdated":1778496697000}'),l={name:"devopsLearning/21-渐进发布.md"};function t(e,s,o,r,h,c){return n(),p("div",null,[...s[0]||(s[0]=[i(`<h1 id="渐进发布-蓝绿-金丝雀-影子流量-自动-rollback" tabindex="-1">渐进发布:蓝绿 / 金丝雀 / 影子流量 / 自动 rollback <a class="header-anchor" href="#渐进发布-蓝绿-金丝雀-影子流量-自动-rollback" aria-label="Permalink to &quot;渐进发布:蓝绿 / 金丝雀 / 影子流量 / 自动 rollback&quot;">​</a></h1><p>上一篇讲了 GitOps——<code>git push</code> 一推,ArgoCD 跟着把声明同步到集群。但这只解决了&quot;声明到达&quot;的问题,<strong>没解决&quot;声明到达之后,这个新版本会不会把生产打挂&quot;这个问题</strong>。这一篇就来回答它。</p><p>发布这件事,80% 团队的做法是「合 PR → CI 过 → 一键 deploy → 全量上线」。<strong>这条路在 5 个微服务 / 100 QPS 时勉强能跑,过了 50 个微服务 / 5000 QPS,Change Failure Rate 就会从 5% 飙到 30%</strong>——也就是说,每三次发布就有一次会撞出生产事故。这不是&quot;开发不努力&quot;,是**&quot;全量发布&quot;这个模式本身就不适合中等规模的系统**。</p><blockquote><p>一句话先记住:<strong>渐进发布不是&quot;为了稳&quot;才做的,是&quot;为了让事故发现得早、影响得小&quot;才做的</strong>——它的目标不是降低事故率(降不了多少,bug 该出还是会出),是<strong>把&quot;全量翻车&quot;压缩成&quot;1% 翻车&quot;</strong>,把 MTTR 从&quot;全员加班&quot;压缩成&quot;一次自动 rollback&quot;。我见过太多团队认为&quot;我们 CI 跑得很全,不需要灰度&quot;——CI 测的是&quot;代码逻辑对不对&quot;,<strong>生产环境暴露的是&quot;代码在真实流量 / 真实数据 / 真实下游组合下对不对&quot;</strong>,这两件事是平行的,任何一边都不能替代另一边。</p></blockquote><hr><h2 id="一、问题场景-全量发布的三种死法" tabindex="-1">一、问题场景:全量发布的三种死法 <a class="header-anchor" href="#一、问题场景-全量发布的三种死法" aria-label="Permalink to &quot;一、问题场景:全量发布的三种死法&quot;">​</a></h2><p>全量发布的失败模式有很多,但根上的就是三类——<strong>bug 一上线全员中招、性能问题没有任何预警、rollback 慢得离谱</strong>。下面分别说。</p><h3 id="_1-1-死法一-bug-一上线-全员中招" tabindex="-1">1.1 死法一:bug 一上线,全员中招 <a class="header-anchor" href="#_1-1-死法一-bug-一上线-全员中招" aria-label="Permalink to &quot;1.1 死法一:bug 一上线,全员中招&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>14:00  发布 v2.3.0(增加优惠券校验逻辑)</span></span>
<span class="line"><span>14:01  v2.3.0 部署完成,K8s 一次性把 30 个 pod 都换了</span></span>
<span class="line"><span>14:02  支付 5xx 率从 0.1% 飙到 12%</span></span>
<span class="line"><span>14:03  开始排查:CI 全过,staging 也跑过,怎么炸的?</span></span>
<span class="line"><span>14:08  定位:新优惠券逻辑在某种「用户既有 A 券又有 B 券」的边缘情况下崩</span></span>
<span class="line"><span>14:10  团队决定 rollback</span></span>
<span class="line"><span>14:11  rollback 命令已发,但 30 个 pod 滚动重启要 6 分钟</span></span>
<span class="line"><span>14:17  错误率回归,但这 17 分钟里 ~9000 笔支付失败</span></span>
<span class="line"><span>14:20  发现这种「A + B 券组合」的用户在生产占 3% —— 这种边缘情况 staging 永远没有</span></span></code></pre></div><p><strong>根因</strong>:<strong>生产流量长得跟 staging 不一样</strong>——staging 测的是&quot;happy path&quot;,生产暴露的是&quot;长尾分布&quot;。全量发布等于把所有用户都丢进未验证的代码,<strong>3% 的边缘情况 = 100% 的事故影响</strong>。</p><h3 id="_1-2-死法二-性能问题完全没预警" tabindex="-1">1.2 死法二:性能问题完全没预警 <a class="header-anchor" href="#_1-2-死法二-性能问题完全没预警" aria-label="Permalink to &quot;1.2 死法二:性能问题完全没预警&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>某次发布加了一段「订单聚合查询」逻辑,本地跑 50ms,staging 跑 80ms</span></span>
<span class="line"><span>全量上线后:</span></span>
<span class="line"><span>  - QPS 不高时:200ms,看着还行</span></span>
<span class="line"><span>  - QPS 上来后:DB 连接池被打满,等连接的请求堆积到 8s</span></span>
<span class="line"><span>  - K8s 健康检查超时,pod 不断被 kill 重启</span></span>
<span class="line"><span>  - 雪崩</span></span></code></pre></div><p><strong>根因</strong>:<strong>性能问题在低 QPS 下根本暴露不出来</strong>。staging 的 QPS 一般是生产的 1%,你在那看到 80ms,生产可能是 8s——<strong>性能不是线性的</strong>,数据库连接池、缓存命中率、GC 暂停、网络往返时间(RTT)在压力下行为完全不一样。<strong>只有让真实流量打 1% 的实例,你才能看到生产规模下这段代码的真实开销</strong>。</p><h3 id="_1-3-死法三-rollback-被数据库迁移挡住" tabindex="-1">1.3 死法三:rollback 被数据库迁移挡住 <a class="header-anchor" href="#_1-3-死法三-rollback-被数据库迁移挡住" aria-label="Permalink to &quot;1.3 死法三:rollback 被数据库迁移挡住&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>21:00  发布 v3.0,带一个 schema 迁移(给 orders 表加列 expire_at)</span></span>
<span class="line"><span>21:05  新代码上线,跑了半小时一切正常</span></span>
<span class="line"><span>21:35  发现新代码在某场景下死锁</span></span>
<span class="line"><span>21:36  决定 rollback 到 v2.9</span></span>
<span class="line"><span>21:37  rollback 卡住:v2.9 的代码不认识 expire_at 列</span></span>
<span class="line"><span>       (其实代码兼容,但有人写了 SELECT * 的 ORM 缓存 schema 校验失败)</span></span>
<span class="line"><span>21:50  讨论:能不能先回滚 schema?——表已经写入了带 expire_at 的数据</span></span>
<span class="line"><span>22:30  最终决定:不能 rollback,只能 fix forward(在 v3 上紧急打补丁)</span></span>
<span class="line"><span>00:15  补丁上线,3 个多小时事故</span></span></code></pre></div><p><strong>根因</strong>:<strong>代码可以快速 rollback,数据回不去</strong>。一旦 schema 改了 + 新数据已经写入,rollback 路径就被切断,只能 fix forward——而 fix forward 在凌晨写代码的速度,远远比 rollback 慢。<strong>这条死法是第 23 篇的主线</strong>,这里只先点出来。</p><h3 id="_1-4-三种死法的共同点" tabindex="-1">1.4 三种死法的共同点 <a class="header-anchor" href="#_1-4-三种死法的共同点" aria-label="Permalink to &quot;1.4 三种死法的共同点&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>死法一(bug 一上线全员中招):  没控制&quot;暴露面&quot;</span></span>
<span class="line"><span>死法二(性能问题无预警):      没控制&quot;流量逐步放量&quot;</span></span>
<span class="line"><span>死法三(rollback 被 DDL 挡住): 没控制&quot;代码 / 数据的发布顺序&quot;</span></span></code></pre></div><p><strong>渐进发布要解决的就是前两个</strong>——把暴露面做小、把流量做缓。第三个是 schema 与发布的耦合问题,留到 23 篇专门讲。</p><hr><h2 id="二、三种渐进发布模式-蓝绿-金丝雀-影子流量" tabindex="-1">二、三种渐进发布模式:蓝绿 / 金丝雀 / 影子流量 <a class="header-anchor" href="#二、三种渐进发布模式-蓝绿-金丝雀-影子流量" aria-label="Permalink to &quot;二、三种渐进发布模式:蓝绿 / 金丝雀 / 影子流量&quot;">​</a></h2><p>工业界把&quot;渐进发布&quot;具体化成三种模式。<strong>这三种不是互斥的,是不同的工具,解决不同的问题</strong>——很多团队最后会同时用两到三种。</p><h3 id="_2-1-一张图看清三种模式" tabindex="-1">2.1 一张图看清三种模式 <a class="header-anchor" href="#_2-1-一张图看清三种模式" aria-label="Permalink to &quot;2.1 一张图看清三种模式&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>全量发布(Recreate / RollingUpdate 默认):</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  100% 流量</span></span>
<span class="line"><span>      │</span></span>
<span class="line"><span>      ▼</span></span>
<span class="line"><span>  ┌────────────────┐</span></span>
<span class="line"><span>  │  v2 v2 v2 v2   │   ← 一次性全换,旧版本立即消失</span></span>
<span class="line"><span>  └────────────────┘</span></span>
<span class="line"><span>  风险窗口:整个 rollout 过程</span></span>
<span class="line"><span>  资源占用:1x</span></span>
<span class="line"><span>  回退速度:再 rollout 一次,几分钟</span></span>
<span class="line"><span></span></span>
<span class="line"><span></span></span>
<span class="line"><span>蓝绿发布(Blue-Green):</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  100% 流量            (待命 0% 流量)</span></span>
<span class="line"><span>      │</span></span>
<span class="line"><span>      ▼</span></span>
<span class="line"><span>  ┌────────────────┐  ┌────────────────┐</span></span>
<span class="line"><span>  │  v1 v1 v1 v1   │  │  v2 v2 v2 v2   │</span></span>
<span class="line"><span>  │   Blue(在岗)  │  │  Green(待命)  │</span></span>
<span class="line"><span>  └────────────────┘  └────────────────┘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  切换瞬间:</span></span>
<span class="line"><span>  100% 流量 ────────────────┐</span></span>
<span class="line"><span>                            ▼</span></span>
<span class="line"><span>  ┌────────────────┐  ┌────────────────┐</span></span>
<span class="line"><span>  │  v1 v1 v1 v1   │  │  v2 v2 v2 v2   │   ← LB 一行切换,流量秒级到 v2</span></span>
<span class="line"><span>  │  Blue(待命)   │  │  Green(在岗)  │</span></span>
<span class="line"><span>  └────────────────┘  └────────────────┘</span></span>
<span class="line"><span>  风险窗口:切换瞬间(几秒)</span></span>
<span class="line"><span>  资源占用:2x(切换瞬间),稳定后回到 1x(蓝色可销毁)</span></span>
<span class="line"><span>  回退速度:LB 切回 Blue,秒级</span></span>
<span class="line"><span></span></span>
<span class="line"><span></span></span>
<span class="line"><span>金丝雀发布(Canary):</span></span>
<span class="line"><span></span></span>
<span class="line"><span>  99% 流量                                  1% 流量</span></span>
<span class="line"><span>      │                                       │</span></span>
<span class="line"><span>      ▼                                       ▼</span></span>
<span class="line"><span>  ┌────────────────────────┐         ┌────────────┐</span></span>
<span class="line"><span>  │  v1 v1 v1 v1 v1 v1 v1  │         │     v2     │   ← 一小部分先尝</span></span>
<span class="line"><span>  │       Stable           │         │   Canary   │</span></span>
<span class="line"><span>  └────────────────────────┘         └────────────┘</span></span>
<span class="line"><span>                                         │</span></span>
<span class="line"><span>                  逐步放量 1% → 5% → 25% → 50% → 100%</span></span>
<span class="line"><span>                  ─────────────────────────────────▶</span></span>
<span class="line"><span>  风险窗口:每一挡的暴露时间(可控)</span></span>
<span class="line"><span>  资源占用:1.0x ~ 1.05x(canary 多出来的少量实例)</span></span>
<span class="line"><span>  回退速度:把 weight 降回 0%,秒级</span></span>
<span class="line"><span></span></span>
<span class="line"><span></span></span>
<span class="line"><span>影子流量(Shadow / Mirror):</span></span>
<span class="line"><span></span></span>
<span class="line"><span>   100% 真实流量</span></span>
<span class="line"><span>      │</span></span>
<span class="line"><span>      ▼</span></span>
<span class="line"><span>  ┌────────────────────────┐</span></span>
<span class="line"><span>  │  v1 v1 v1 v1   (返回)  │</span></span>
<span class="line"><span>  │       Stable           │</span></span>
<span class="line"><span>  └─────────────┬──────────┘</span></span>
<span class="line"><span>                │</span></span>
<span class="line"><span>                ├── 复制一份 ──┐</span></span>
<span class="line"><span>                ▼              │</span></span>
<span class="line"><span>            (返回用户)        │</span></span>
<span class="line"><span>                              ▼</span></span>
<span class="line"><span>                      ┌────────────────┐</span></span>
<span class="line"><span>                      │      v2        │   ← 接同样的流量,但响应丢弃</span></span>
<span class="line"><span>                      │   Shadow       │   (不参与对外返回)</span></span>
<span class="line"><span>                      └────────────────┘</span></span>
<span class="line"><span>  风险窗口:0(用户不感知)</span></span>
<span class="line"><span>  资源占用:1x + shadow 实例(典型 0.1x ~ 0.5x)</span></span>
<span class="line"><span>  回退速度:停影子,瞬间</span></span></code></pre></div><h3 id="_2-2-三种模式的核心差异" tabindex="-1">2.2 三种模式的核心差异 <a class="header-anchor" href="#_2-2-三种模式的核心差异" aria-label="Permalink to &quot;2.2 三种模式的核心差异&quot;">​</a></h3><table tabindex="0"><thead><tr><th>维度</th><th>蓝绿</th><th>金丝雀</th><th>影子流量</th></tr></thead><tbody><tr><td><strong>流量分布</strong></td><td>0% / 100% 切换</td><td>比例渐进(1% / 5% / 25% / 50% / 100%)</td><td>100% 走旧 + 镜像到新</td></tr><tr><td><strong>用户感知</strong></td><td>全员同时切</td><td>一部分用户先尝</td><td>用户完全不感知</td></tr><tr><td><strong>资源占用</strong></td><td>切换瞬间 2x,稳态 1x</td><td>1.0x ~ 1.1x</td><td>1x + 影子的部分</td></tr><tr><td><strong>风险窗口</strong></td><td>切换那一刻几秒</td><td>每一挡的暴露时间(可控)</td><td>0(只读不返回)</td></tr><tr><td><strong>回退速度</strong></td><td>秒级(LB 切回)</td><td>秒级(weight 调回)</td><td>关掉就行</td></tr><tr><td><strong>适用场景</strong></td><td>强一致 / 想要快速回退 / 数据库无关</td><td>大部分业务变更</td><td>重构 / 性能验证 / 写流量验证</td></tr><tr><td><strong>不适合</strong></td><td>数据有状态的服务</td><td>紧急修复 / 强一致变更</td><td>改变写入语义的变更</td></tr></tbody></table><h3 id="_2-3-大部分团队该选什么" tabindex="-1">2.3 大部分团队该选什么 <a class="header-anchor" href="#_2-3-大部分团队该选什么" aria-label="Permalink to &quot;2.3 大部分团队该选什么&quot;">​</a></h3><p><strong>直接给结论</strong>:</p><ul><li><strong>业务服务发布</strong>:金丝雀,90% 的场景都是它</li><li><strong>强一致 / 数据库无关的服务</strong>(比如纯计算服务、网关):蓝绿</li><li><strong>大型重构 / 性能不放心 / 接入新下游</strong>:在金丝雀之前先跑影子流量</li></ul><p><strong>最常见的误区</strong>:认为这三种是&quot;二选一&quot;——<strong>实际生产里它们经常组合</strong>。比如「重构后的搜索服务」上线路径:<strong>先影子流量跑 24 小时验证响应一致 → 再金丝雀逐步放量到 100% → 旧版本作为 shadow 跑一周观察对比</strong>。</p><hr><h2 id="三、蓝绿发布-被误解最深的一种" tabindex="-1">三、蓝绿发布:被误解最深的一种 <a class="header-anchor" href="#三、蓝绿发布-被误解最深的一种" aria-label="Permalink to &quot;三、蓝绿发布:被误解最深的一种&quot;">​</a></h2><p>蓝绿发布的名声很差——&quot;双倍资源浪费&quot;。<strong>这是天大的误解</strong>。</p><h3 id="_3-1-真实的资源占用" tabindex="-1">3.1 真实的资源占用 <a class="header-anchor" href="#_3-1-真实的资源占用" aria-label="Permalink to &quot;3.1 真实的资源占用&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>T0   稳态:Blue 在岗,资源 1x,Green 不存在</span></span>
<span class="line"><span>        ┌──────────────┐</span></span>
<span class="line"><span>        │  Blue (v1)   │  ← 100% 流量</span></span>
<span class="line"><span>        └──────────────┘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>T1   准备发版,起 Green:资源短暂 2x</span></span>
<span class="line"><span>        ┌──────────────┐  ┌──────────────┐</span></span>
<span class="line"><span>        │  Blue (v1)   │  │  Green (v2)  │  ← Green 启动并预热</span></span>
<span class="line"><span>        │ 100% 流量    │  │ 0% 流量      │</span></span>
<span class="line"><span>        └──────────────┘  └──────────────┘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>T2   切换:LB 把流量切到 Green,资源仍 2x(短暂)</span></span>
<span class="line"><span>        ┌──────────────┐  ┌──────────────┐</span></span>
<span class="line"><span>        │  Blue (v1)   │  │  Green (v2)  │</span></span>
<span class="line"><span>        │ 0% 流量      │  │ 100% 流量    │</span></span>
<span class="line"><span>        └──────────────┘  └──────────────┘</span></span>
<span class="line"><span></span></span>
<span class="line"><span>T3   稳定后销毁 Blue:资源回到 1x</span></span>
<span class="line"><span>                          ┌──────────────┐</span></span>
<span class="line"><span>                          │  Green (v2)  │</span></span>
<span class="line"><span>                          │ 100% 流量    │</span></span>
<span class="line"><span>                          └──────────────┘</span></span></code></pre></div><p><strong>蓝绿只在「Green 起来」到「Blue 销毁」之间是 2x 资源</strong>——典型 10-30 分钟。<strong>剩下 23.5 小时还是 1x</strong>。说蓝绿&quot;双倍资源&quot;的人,把这 30 分钟的临时资源算成了&quot;长期持有&quot;。</p><h3 id="_3-2-蓝绿的真实代价" tabindex="-1">3.2 蓝绿的真实代价 <a class="header-anchor" href="#_3-2-蓝绿的真实代价" aria-label="Permalink to &quot;3.2 蓝绿的真实代价&quot;">​</a></h3><p>但蓝绿确实有代价,只是不在资源上:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>代价一:服务必须无状态</span></span>
<span class="line"><span>   - 有内存 session 的服务,切完所有人重新登录</span></span>
<span class="line"><span>   - 修复:session 外置(Redis),但很多老服务做不到</span></span>
<span class="line"><span></span></span>
<span class="line"><span>代价二:数据库 / 队列 / 缓存 共享</span></span>
<span class="line"><span>   - Blue 和 Green 同时连同一个 DB,新版本如果改 schema 必须先 Expand(见 23 篇)</span></span>
<span class="line"><span>   - 缓存 key 格式变了 → 新旧版本互相污染</span></span>
<span class="line"><span></span></span>
<span class="line"><span>代价三:LB 切换的&quot;两个瞬间&quot;</span></span>
<span class="line"><span>   - 切到 Green:还在跑的 Blue 长连接没断,客户端可能在 Blue / Green 之间漂移</span></span>
<span class="line"><span>   - 切回 Blue:同上,而且 Green 已经写入的数据 Blue 看不见</span></span>
<span class="line"><span></span></span>
<span class="line"><span>代价四:数据库变更没法蓝绿</span></span>
<span class="line"><span>   - 蓝绿能切代码,切不了 schema(详见 23 篇)</span></span>
<span class="line"><span>   - 这是为什么&quot;蓝绿 schema 不存在&quot;的根本原因</span></span></code></pre></div><p><strong>经验</strong>:<strong>蓝绿是&quot;无状态网关 / 纯计算服务&quot;的最优选,业务服务不要硬上</strong>。</p><h3 id="_3-3-蓝绿什么时候比金丝雀好" tabindex="-1">3.3 蓝绿什么时候比金丝雀好 <a class="header-anchor" href="#_3-3-蓝绿什么时候比金丝雀好" aria-label="Permalink to &quot;3.3 蓝绿什么时候比金丝雀好&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>✓ 服务是无状态网关(API Gateway / BFF / 边缘计算)</span></span>
<span class="line"><span>✓ 想要&quot;秒级回退&quot;——金丝雀回退也快但不如蓝绿</span></span>
<span class="line"><span>✓ 测试环境验证够强,不需要&quot;先放 1% 看看&quot;</span></span>
<span class="line"><span>✓ 服务对内,影响面小,可以接受&quot;切换瞬间几个长连接抖动&quot;</span></span></code></pre></div><p><strong>反过来,大部分业务服务不适合蓝绿</strong>——它们都有&quot;用户 session / 缓存 / 数据库写入 / 与外部状态强耦合&quot;中的一个。</p><hr><h2 id="四、金丝雀发布-90-团队该用的方式" tabindex="-1">四、金丝雀发布:90% 团队该用的方式 <a class="header-anchor" href="#四、金丝雀发布-90-团队该用的方式" aria-label="Permalink to &quot;四、金丝雀发布:90% 团队该用的方式&quot;">​</a></h2><p>金丝雀(canary)的命名来自矿工——古代矿工带金丝雀下井,鸟先死人才知道有毒。<strong>先让 1% 的流量走新版本,新版本&quot;中毒&quot;了就只死 1%</strong>。</p><h3 id="_4-1-五个挡位-为什么是-1-5-25-50-100" tabindex="-1">4.1 五个挡位:为什么是 1 / 5 / 25 / 50 / 100 <a class="header-anchor" href="#_4-1-五个挡位-为什么是-1-5-25-50-100" aria-label="Permalink to &quot;4.1 五个挡位:为什么是 1 / 5 / 25 / 50 / 100&quot;">​</a></h3><p>主流实践把放量挡位分成 5 档:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>挡位      流量比例    停留时间        触发动作</span></span>
<span class="line"><span>─────     ────────    ──────────      ────────────</span></span>
<span class="line"><span>Step 1    1%          5-15 min        SLO 验证 / 错误率检查</span></span>
<span class="line"><span>Step 2    5%          5-15 min        SLO 验证 / 性能比对</span></span>
<span class="line"><span>Step 3    25%         10-30 min       完整 P99 周期观察</span></span>
<span class="line"><span>Step 4    50%         15-30 min       完整 P99 周期观察</span></span>
<span class="line"><span>Step 5    100%        持续监控        promote / 旧版本下线</span></span></code></pre></div><p><strong>为什么这五档,不是 4 档也不是 10 档</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1%   ── 出 bug 也只影响 1% 用户,可以快速验证&quot;代码能跑通&quot;</span></span>
<span class="line"><span>        ↑ 这一档的目标是&quot;smoke test&quot;,不要求统计显著</span></span>
<span class="line"><span>        </span></span>
<span class="line"><span>5%   ── 流量到达需要&quot;假阴性可以被察觉&quot;的量</span></span>
<span class="line"><span>        ↑ 5xx 率从 0.1% 到 0.5% 在 1% 流量下可能看不到,5% 能看到</span></span>
<span class="line"><span>        </span></span>
<span class="line"><span>25%  ── 跨越&quot;小流量&quot;和&quot;主流量&quot;的分界</span></span>
<span class="line"><span>        ↑ 缓存命中率、连接池行为开始接近生产真实</span></span>
<span class="line"><span>        </span></span>
<span class="line"><span>50%  ── 一半流量,数据库 / 下游 / 共享资源开始受全量影响</span></span>
<span class="line"><span>        ↑ 这一档暴露的是&quot;资源争抢&quot;问题</span></span>
<span class="line"><span>        </span></span>
<span class="line"><span>100% ── 全量,旧版本可以下线</span></span>
<span class="line"><span>        ↑ 但旧版本应该保留至少 1 小时,可以快速回滚</span></span></code></pre></div><p><strong>为什么停留时间是 5-15min</strong>:<strong>必须覆盖 P99 的请求生命周期 + SLO 验证窗口</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>停留时间 = max(P99 请求耗时 × 10, SLO 验证窗口)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>例如:某服务 P99 = 300ms → 3 秒就够&quot;经历完整请求生命周期&quot;</span></span>
<span class="line"><span>     但 SLO 验证窗口需要 5 分钟才能积累足够样本</span></span>
<span class="line"><span>     → 停留时间取 5 分钟</span></span>
<span class="line"><span>     </span></span>
<span class="line"><span>对于慢请求(报表 / 异步任务):P99 = 30s</span></span>
<span class="line"><span>     → 停留时间至少 5 分钟(让 10 次请求生命周期完整跑完)</span></span>
<span class="line"><span>     </span></span>
<span class="line"><span>对于长事务 / 跨调用链:全链路 P99 = 5 分钟</span></span>
<span class="line"><span>     → 停留时间至少 1 小时(否则错误可能在新版本下游才暴露)</span></span></code></pre></div><h3 id="_4-2-自动-rollback-不要用绝对阈值" tabindex="-1">4.2 自动 rollback:不要用绝对阈值 <a class="header-anchor" href="#_4-2-自动-rollback-不要用绝对阈值" aria-label="Permalink to &quot;4.2 自动 rollback:不要用绝对阈值&quot;">​</a></h3><p>新手最常见的错误是把 rollback 触发条件写成&quot;绝对阈值&quot;:</p><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># ✗ 错误写法</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">failureCondition</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">|</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  error_rate &gt; 0.01    # 错误率 &gt; 1% 就 rollback</span></span></code></pre></div><p><strong>为什么错</strong>:绝对阈值无法适应不同时段的真实&quot;基线&quot;——凌晨业务量小,某些边缘错误的相对比例本身就高;高峰期错误率本身就可能比平时高 50%。<strong>绝对阈值要么误报、要么漏报</strong>。</p><p><strong>正确做法</strong>:<strong>用相对基线 + 多窗口燃烧率</strong>:</p><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># ✓ 正确写法之一:相对基线(canary vs stable)</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">failureCondition</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">|</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  canary_error_rate / stable_error_rate &gt; 1.5</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  AND canary_error_rate &gt; 0.005   # 防止 stable 是 0.0001 把 canary 0.0002 当事故</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  AND sample_size &gt; 1000          # 防止小样本偶发</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># ✓ 正确写法之二:SLO 燃烧率(参考 15 篇)</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">failureCondition</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">|</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  burn_rate_5m &gt; 14</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  AND burn_rate_1h &gt; 1</span></span></code></pre></div><p><strong>两个写法的差异</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>相对基线:    适合&quot;刚发布的差异化检测&quot;,对&quot;baseline 也差&quot;的场景敏感度低</span></span>
<span class="line"><span>SLO 燃烧率:  适合&quot;绝对值守护&quot;,防止&quot;baseline 也差 + canary 一样差&quot;漏报</span></span>
<span class="line"><span></span></span>
<span class="line"><span>实际生产:   两个一起用,任一触发就 rollback</span></span></code></pre></div><p><strong>关键还有一条</strong>:<strong>自动 rollback 必须有最小观察窗口</strong>——刚启动的 30 秒内不要触发任何 rollback。新版本启动时的 warmup 期可能有抖动,直接 rollback 等于永远发不出去。</p><h3 id="_4-3-流量分流的三种方式" tabindex="-1">4.3 流量分流的三种方式 <a class="header-anchor" href="#_4-3-流量分流的三种方式" aria-label="Permalink to &quot;4.3 流量分流的三种方式&quot;">​</a></h3><p><strong>金丝雀的核心是&quot;怎么把 1% 流量精确导到 canary&quot;</strong>——这件事三种实现:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>方式一:L4 副本比例(最简单,不精确)</span></span>
<span class="line"><span>   ─────────────────────────────────────</span></span>
<span class="line"><span>   stable: 19 个 pod                canary: 1 个 pod</span></span>
<span class="line"><span>                                  </span></span>
<span class="line"><span>   ┌────────────────────┐         ┌────┐</span></span>
<span class="line"><span>   │ v1 v1 v1 ... v1    │         │ v2 │   ← K8s Service 把流量按 endpoint 数量负载均衡</span></span>
<span class="line"><span>   └────────────────────┘         └────┘</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   优点:0 额外组件,Service + Deployment 就能做</span></span>
<span class="line"><span>   缺点:1/20 不等于 5%,实际比例取决于&quot;客户端连接分布&quot;&quot;长连接&quot;&quot;请求耗时差异&quot;</span></span>
<span class="line"><span>        不能做 Header-based / 用户 ID hash 等精细切分</span></span>
<span class="line"><span>        </span></span>
<span class="line"><span>方式二:L7 service mesh(精确)</span></span>
<span class="line"><span>   ─────────────────────────────────────</span></span>
<span class="line"><span>   ┌────────────────────────────────────┐</span></span>
<span class="line"><span>   │  Istio / Linkerd VirtualService    │</span></span>
<span class="line"><span>   │  - destination: stable     95%     │</span></span>
<span class="line"><span>   │  - destination: canary     5%      │</span></span>
<span class="line"><span>   └─────────────────┬──────────────────┘</span></span>
<span class="line"><span>                     │</span></span>
<span class="line"><span>        ┌────────────┴─────────┐</span></span>
<span class="line"><span>        ▼                      ▼</span></span>
<span class="line"><span>   stable Deployment      canary Deployment</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   优点:精确按权重切分,与 pod 数无关</span></span>
<span class="line"><span>        可以基于 Header / Cookie / 用户 hash 切分</span></span>
<span class="line"><span>        Argo Rollouts / Flagger 都能直接接</span></span>
<span class="line"><span>   缺点:需要 service mesh,运维成本一上来</span></span>
<span class="line"><span></span></span>
<span class="line"><span>方式三:Header-based(灰度内部 VIP / 白名单)</span></span>
<span class="line"><span>   ─────────────────────────────────────</span></span>
<span class="line"><span>   ┌─────────────────────────────────────┐</span></span>
<span class="line"><span>   │  Ingress / Gateway 按 Header 路由   │</span></span>
<span class="line"><span>   │  - X-Canary: true → canary           │</span></span>
<span class="line"><span>   │  - 其他 → stable                     │</span></span>
<span class="line"><span>   └────────────────────┬────────────────┘</span></span>
<span class="line"><span>                        │</span></span>
<span class="line"><span>       ┌────────────────┴──────────────┐</span></span>
<span class="line"><span>       ▼                               ▼</span></span>
<span class="line"><span>   stable                           canary</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>   优点:可以指定&quot;只让内部员工 / VIP 客户 / 测试账号&quot;先尝</span></span>
<span class="line"><span>        发现问题影响范围明确(就是这一批人)</span></span>
<span class="line"><span>   缺点:不能反映真实用户分布,1% VIP ≠ 1% 普通用户</span></span>
<span class="line"><span>        必须配合后续 5%/25%/50% 的随机流量挡位</span></span></code></pre></div><p><strong>实战推荐</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>没 mesh:                方式一(简单)+ 方式三(VIP 灰度)双管</span></span>
<span class="line"><span>有 mesh:                方式二(精确)+ 方式三(VIP)</span></span>
<span class="line"><span>特殊场景(高合规):     方式三纯白名单灰度,放量靠人工拍板</span></span></code></pre></div><hr><h2 id="五、影子流量-被严重低估的工程价值" tabindex="-1">五、影子流量:被严重低估的工程价值 <a class="header-anchor" href="#五、影子流量-被严重低估的工程价值" aria-label="Permalink to &quot;五、影子流量:被严重低估的工程价值&quot;">​</a></h2><p>影子流量(traffic mirroring / shadow)是<strong>最不起眼但最有用</strong>的一种渐进发布姿势——它的核心是「复制流量给新版本,但不返回响应」。</p><h3 id="_5-1-工程价值" tabindex="-1">5.1 工程价值 <a class="header-anchor" href="#_5-1-工程价值" aria-label="Permalink to &quot;5.1 工程价值&quot;">​</a></h3><p>影子流量做的事:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>真实请求 ──┬── 走 stable ──┬── 返回用户</span></span>
<span class="line"><span>           │                │</span></span>
<span class="line"><span>           └── 镜像 ────────┘</span></span>
<span class="line"><span>                │</span></span>
<span class="line"><span>                ▼</span></span>
<span class="line"><span>              canary</span></span>
<span class="line"><span>                │</span></span>
<span class="line"><span>                └── 响应丢弃(不返回用户)</span></span>
<span class="line"><span>                    但记录:</span></span>
<span class="line"><span>                      - 错误率</span></span>
<span class="line"><span>                      - 延迟分布  </span></span>
<span class="line"><span>                      - 与 stable 响应的 diff(如果实现了)</span></span></code></pre></div><p><strong>这能做什么</strong>:</p><table tabindex="0"><thead><tr><th>价值</th><th>解释</th></tr></thead><tbody><tr><td><strong>验证扛得住</strong></td><td>真实生产流量打 canary,看它会不会 OOM / 连接池爆 / 慢查询</td></tr><tr><td><strong>排除写入副作用</strong></td><td>重构后的服务,写入路径短期可以&quot;假写&quot;(写入新库 / 测试库),验证逻辑</td></tr><tr><td><strong>重构后对比</strong></td><td>老接口和新接口同样输入,响应能不能 diff 出来</td></tr><tr><td><strong>新下游兼容性</strong></td><td>切了下游服务,但响应不返回用户,先观察一周</td></tr><tr><td><strong>性能基线对比</strong></td><td>canary 的 P99 vs stable 的 P99,直接看新版本是不是有性能回归</td></tr></tbody></table><h3 id="_5-2-写入副作用是最大的坑" tabindex="-1">5.2 写入副作用是最大的坑 <a class="header-anchor" href="#_5-2-写入副作用是最大的坑" aria-label="Permalink to &quot;5.2 写入副作用是最大的坑&quot;">​</a></h3><p><strong>影子流量的最大陷阱是&quot;写入&quot;</strong>——如果 canary 把请求当真处理了,写到了同一个数据库,<strong>等于一份订单写了两次</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错的做法:</span></span>
<span class="line"><span>   - canary 和 stable 共享数据库</span></span>
<span class="line"><span>   - 镜像流量过去 canary 老老实实 INSERT</span></span>
<span class="line"><span>   - 数据库里同一笔订单两条记录,主键冲突 / 数据污染</span></span>
<span class="line"><span></span></span>
<span class="line"><span>对的做法之一:</span></span>
<span class="line"><span>   - canary 在代码里支持 &quot;dry-run&quot; 模式,影子流量打开 dry-run flag</span></span>
<span class="line"><span>   - 走完业务逻辑,但所有写操作 noop</span></span>
<span class="line"><span>   - 只验证读路径 + 计算逻辑</span></span>
<span class="line"><span></span></span>
<span class="line"><span>对的做法之二:</span></span>
<span class="line"><span>   - canary 用独立数据库(影子库)</span></span>
<span class="line"><span>   - 真写,但写到隔离的环境</span></span>
<span class="line"><span>   - 适合&quot;重构数据存储&quot;的场景(从 MySQL 迁 PostgreSQL,影子两边写,对比一致性)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>对的做法之三:</span></span>
<span class="line"><span>   - canary 只接读流量,写流量不镜像</span></span>
<span class="line"><span>   - 适合&quot;只重构读路径&quot;的场景</span></span></code></pre></div><p><strong>经验</strong>:<strong>影子流量只用于读路径验证 / 性能基线对比</strong>。涉及写入的影子,必须明确指定 dry-run / 独立后端 / 只读其中一种,<strong>任何&quot;我先试试&quot;都是灾难</strong>。</p><h3 id="_5-3-影子流量何时该用" tabindex="-1">5.3 影子流量何时该用 <a class="header-anchor" href="#_5-3-影子流量何时该用" aria-label="Permalink to &quot;5.3 影子流量何时该用&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>✓ 必上影子:</span></span>
<span class="line"><span>   - 服务重构(逻辑改了,但接口语义不变)</span></span>
<span class="line"><span>   - 切换下游存储(MySQL → PG / Redis → Aerospike)</span></span>
<span class="line"><span>   - 性能不放心(新框架 / 新语言重写)</span></span>
<span class="line"><span>   - 接入新的下游服务(担心兼容性)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>△ 可选:</span></span>
<span class="line"><span>   - 小版本迭代(改动小,影子收益不高)</span></span>
<span class="line"><span>   - 新功能上线(用 feature flag 更合适,见 22 篇)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>✗ 不要上影子:</span></span>
<span class="line"><span>   - 写入语义本身就变了(影子写两份会污染)</span></span>
<span class="line"><span>   - 调用的下游有副作用(发短信 / 调支付 / 触发审计)</span></span>
<span class="line"><span>   - 流量本身很大,镜像翻倍下游扛不住</span></span></code></pre></div><hr><h2 id="六、argo-rollouts-vs-flagger-选型" tabindex="-1">六、Argo Rollouts vs Flagger:选型 <a class="header-anchor" href="#六、argo-rollouts-vs-flagger-选型" aria-label="Permalink to &quot;六、Argo Rollouts vs Flagger:选型&quot;">​</a></h2><p>K8s 上做渐进发布,事实上的两强是 <strong>Argo Rollouts</strong> 和 <strong>Flagger</strong>。<strong>这两个解决同一个问题,但出身完全不同</strong>。</p><h3 id="_6-1-两者的核心差异" tabindex="-1">6.1 两者的核心差异 <a class="header-anchor" href="#_6-1-两者的核心差异" aria-label="Permalink to &quot;6.1 两者的核心差异&quot;">​</a></h3><table tabindex="0"><thead><tr><th>维度</th><th>Argo Rollouts</th><th>Flagger</th></tr></thead><tbody><tr><td><strong>出身</strong></td><td>ArgoCD 项目家族</td><td>Flux / Weaveworks 家族</td></tr><tr><td><strong>核心模型</strong></td><td>自定义 CRD <code>Rollout</code> 替代 <code>Deployment</code></td><td>用原生 <code>Deployment</code>,Flagger 控制</td></tr><tr><td><strong>流量分流</strong></td><td>内置支持多种(NGINX / ALB / Istio / SMI / Traefik / Ambassador)</td><td>主要基于 service mesh(Istio / Linkerd / App Mesh / Contour)</td></tr><tr><td><strong>分析引擎</strong></td><td>内置 AnalysisTemplate(Prom / Datadog / Wavefront / NR)</td><td>内置 metric provider(Prom / Datadog / CloudWatch / Stackdriver)</td></tr><tr><td><strong>灰度策略</strong></td><td>Canary / BlueGreen</td><td>Canary / BlueGreen / A-B Testing / Mirror</td></tr><tr><td><strong>与 GitOps 配套</strong></td><td>与 ArgoCD 同家,无缝</td><td>与 Flux 同家,无缝,但跟 ArgoCD 也能配</td></tr><tr><td><strong>学习曲线</strong></td><td>CRD 换 Deployment,改造工作量大</td><td>不动 Deployment,Flagger 旁路接管</td></tr><tr><td><strong>生态成熟度</strong></td><td>主流,GitHub star 高,Datadog 等大厂用</td><td>主流但用户群偏 service mesh 重度用户</td></tr></tbody></table><h3 id="_6-2-选型决策" tabindex="-1">6.2 选型决策 <a class="header-anchor" href="#_6-2-选型决策" aria-label="Permalink to &quot;6.2 选型决策&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌────────────────────────────────────────────────────┐</span></span>
<span class="line"><span>│ 选型决策树                                          │</span></span>
<span class="line"><span>├────────────────────────────────────────────────────┤</span></span>
<span class="line"><span>│                                                    │</span></span>
<span class="line"><span>│ 已经在用 ArgoCD?                                   │</span></span>
<span class="line"><span>│    └─ Yes → Argo Rollouts(同家,生态打通)         │</span></span>
<span class="line"><span>│    └─ No  → 继续往下                                │</span></span>
<span class="line"><span>│                                                    │</span></span>
<span class="line"><span>│ 已经在用 service mesh(Istio / Linkerd)?         │</span></span>
<span class="line"><span>│    └─ Yes → Flagger(原生集成更顺)                 │</span></span>
<span class="line"><span>│    └─ No  → 继续往下                                │</span></span>
<span class="line"><span>│                                                    │</span></span>
<span class="line"><span>│ 想用原生 Deployment 不改 manifest?                 │</span></span>
<span class="line"><span>│    └─ Yes → Flagger                                │</span></span>
<span class="line"><span>│    └─ No  → Argo Rollouts                          │</span></span>
<span class="line"><span>│                                                    │</span></span>
<span class="line"><span>│ 主要看 nginx-ingress / ALB 流量?                  │</span></span>
<span class="line"><span>│    └─ Argo Rollouts(对 L7 ingress 支持广)         │</span></span>
<span class="line"><span>│                                                    │</span></span>
<span class="line"><span>└────────────────────────────────────────────────────┘</span></span></code></pre></div><p><strong>我推荐</strong>:</p><ul><li><strong>中型团队从 ArgoCD + Argo Rollouts 起步</strong>——20 篇推荐了 ArgoCD,这里顺手就是它</li><li><strong>已经全面 service mesh 的团队</strong>:Flagger 更顺手,流量切分精确度高</li><li><strong>不要两个都装</strong>——同一个集群两个 controller 互相打架,经典坑</li></ul><h3 id="_6-3-argo-rollouts-的核心-crd" tabindex="-1">6.3 Argo Rollouts 的核心 CRD <a class="header-anchor" href="#_6-3-argo-rollouts-的核心-crd" aria-label="Permalink to &quot;6.3 Argo Rollouts 的核心 CRD&quot;">​</a></h3><p>最简化的 <code>Rollout</code> 长这样:</p><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">apiVersion</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">argoproj.io/v1alpha1</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">kind</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">Rollout</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">metadata</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">order-api</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">spec</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  replicas</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">10</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  selector</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    matchLabels</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      app</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">order-api</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  template</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    metadata</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      labels</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        app</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">order-api</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    spec</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      containers</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">order-api</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          image</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">registry.example.com/order-api:v2.4.7</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          ports</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">containerPort</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">8080</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  strategy</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    canary</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      canaryService</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">order-api-canary</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">       # 单独的 Service 指向 canary pods</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      stableService</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">order-api-stable</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">       # 单独的 Service 指向 stable pods</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      trafficRouting</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        nginx</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          stableIngress</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">order-api-ingress</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  # 主 Ingress</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      steps</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">setWeight</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">5</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                       # 5% 流量到 canary</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">pause</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: { </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">duration</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">10m</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> }           </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 停 10 分钟</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">analysis</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:                          </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 跑分析</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">            templates</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">              - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">templateName</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">success-rate</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">            args</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">              - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">service-name</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">                value</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">order-api-canary</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">setWeight</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">25</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">pause</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: { </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">duration</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">15m</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> }</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">analysis</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">            templates</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">              - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">templateName</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">success-rate</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">            args</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">              - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">service-name</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">                value</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">order-api-canary</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">setWeight</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">50</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">pause</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: { </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">duration</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">15m</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> }</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">setWeight</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">100</span></span></code></pre></div><p><strong>关键取舍</strong>:</p><ol><li><strong><code>canaryService</code> / <code>stableService</code> 必须是独立的 Service</strong>——这两个 Service 各自指向 canary 和 stable 的 pod,Argo Rollouts 通过 ingress 的 weight 切分流量</li><li><strong>每个 setWeight 后必须有 pause 或 analysis</strong>——没有就直接放下一档,等于全量</li><li><strong><code>pause: {}</code> 是手动确认</strong>(不传 duration),<code>pause: { duration: 10m }</code> 是自动放行——<strong>生产推荐自动,但配 analysis 兜底</strong></li><li><strong><code>analysis</code> 失败 = 自动 rollback</strong>——不需要写 failureCondition,AnalysisTemplate 里定义</li></ol><h3 id="_6-4-analysistemplate-从-prom-拉错误率" tabindex="-1">6.4 AnalysisTemplate:从 Prom 拉错误率 <a class="header-anchor" href="#_6-4-analysistemplate-从-prom-拉错误率" aria-label="Permalink to &quot;6.4 AnalysisTemplate:从 Prom 拉错误率&quot;">​</a></h3><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">apiVersion</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">argoproj.io/v1alpha1</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">kind</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">AnalysisTemplate</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">metadata</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">success-rate</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">spec</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  args</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">service-name</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  metrics</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">success-rate</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      interval</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">30s</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      count</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">10</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                  # 跑 10 次 × 30s = 5 分钟</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      successCondition</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">result[0] &gt;= 0.99</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      failureLimit</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">2</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">            # 连续 2 次失败就 rollback</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">      provider</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">        prometheus</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          address</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">http://prometheus.monitoring.svc:9090</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">          query</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">|</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            sum(rate(http_requests_total{</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">              service=&quot;{{args.service-name}}&quot;,</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">              code!~&quot;5..&quot;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            }[2m]))</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            /</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            sum(rate(http_requests_total{</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">              service=&quot;{{args.service-name}}&quot;</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            }[2m]))</span></span></code></pre></div><p><strong>关键取舍</strong>:</p><ol><li><strong><code>interval: 30s</code> + <code>count: 10</code></strong>——总共 5 分钟,够积累样本但不会拖太久</li><li><strong><code>successCondition</code> 用 99%</strong>——根据自己服务的 SLO 调,<strong>不要硬抄 99.9</strong></li><li><strong><code>failureLimit: 2</code></strong>——一次失败不 rollback(避免偶发抖动误杀),连续两次才杀</li><li><strong>PromQL 用 <code>rate</code> + <code>[2m]</code></strong>——窗口要大于 scrape interval × 4,不要用 instant query</li><li><strong><code>result[0]</code> 是 PromQL 返回的第一个 sample</strong>——如果你的 query 返回多行,需要写 vector 选择器</li><li><strong><code>code!~&quot;5..&quot;</code></strong>——这里只看 5xx,<strong>业务错误码(4xx 中的业务失败)需要单独 metric</strong></li></ol><p><strong>这就是上面金丝雀 yaml 里 <code>analysis</code> 段引用的 template</strong>。这两段一起,构成了「自动放量 + 自动检测 + 自动回退」的最小闭环。</p><hr><h2 id="七、组合实战-一次真实的发布序列" tabindex="-1">七、组合实战:一次真实的发布序列 <a class="header-anchor" href="#七、组合实战-一次真实的发布序列" aria-label="Permalink to &quot;七、组合实战:一次真实的发布序列&quot;">​</a></h2><p>把上面所有概念串起来,讲一次真实的&quot;中等改动&quot;发布序列。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>场景:订单服务 order-api,要升级 v2.4.6 → v2.4.7</span></span>
<span class="line"><span>变更:加了&quot;优惠券叠加校验&quot;逻辑</span></span>
<span class="line"><span></span></span>
<span class="line"><span>发布序列:</span></span>
<span class="line"><span></span></span>
<span class="line"><span>T+0   PR 合入 main,CI 跑过,镜像 build 完成</span></span>
<span class="line"><span>       ↓</span></span>
<span class="line"><span>T+5   ArgoCD 同步,Argo Rollouts 触发新 ReplicaSet</span></span>
<span class="line"><span>       此时:stable 10 pod (v2.4.6),canary 1 pod (v2.4.7)</span></span>
<span class="line"><span>       ↓</span></span>
<span class="line"><span>T+6   Rollout 进入 step 1:setWeight 5%</span></span>
<span class="line"><span>       nginx ingress 把 5% 流量切到 canary service</span></span>
<span class="line"><span>       ↓</span></span>
<span class="line"><span>T+6   ~ T+16   pause 10 分钟,analysis 跑</span></span>
<span class="line"><span>                Prometheus 每 30s 查一次 canary 错误率</span></span>
<span class="line"><span>                目标 &gt; 99%,允许 2 次失败</span></span>
<span class="line"><span>       ↓</span></span>
<span class="line"><span>T+16  analysis 通过,进入 step 2:setWeight 25%</span></span>
<span class="line"><span>       canary 自动扩到 ~3 pod,nginx 调整 weight</span></span>
<span class="line"><span>       ↓</span></span>
<span class="line"><span>T+16 ~ T+31    pause 15 分钟,继续 analysis</span></span>
<span class="line"><span>       ↓</span></span>
<span class="line"><span>T+31  step 3:setWeight 50%,canary ~5 pod</span></span>
<span class="line"><span>       ↓</span></span>
<span class="line"><span>T+31 ~ T+46    pause 15 分钟,analysis</span></span>
<span class="line"><span>       ↓</span></span>
<span class="line"><span>T+46  step 4:setWeight 100%,canary 接管全量</span></span>
<span class="line"><span>       stable 缩到 0</span></span>
<span class="line"><span>       ↓</span></span>
<span class="line"><span>T+46 ~ T+106   stable 暂时保留(60 分钟 fallback 窗口)</span></span>
<span class="line"><span>                如果 100% 后出问题,可以一键切回 stable</span></span>
<span class="line"><span>       ↓</span></span>
<span class="line"><span>T+106 stable ReplicaSet 销毁,发布完成</span></span>
<span class="line"><span></span></span>
<span class="line"><span>任何阶段 analysis 失败:</span></span>
<span class="line"><span>   → Argo Rollouts 自动把 canary weight 设回 0</span></span>
<span class="line"><span>   → 5% 流量瞬间回归 stable</span></span>
<span class="line"><span>   → 整个 Rollout 标记为 Failed</span></span>
<span class="line"><span>   → 飞书 / Slack 告警</span></span></code></pre></div><p><strong>注意</strong>:这个过程<strong>不需要任何人 watching</strong>——CI 推完镜像就走人,发布全靠 Rollouts + AnalysisTemplate 自动决策。<strong>这才是渐进发布的真正价值——把&quot;发布&quot;从一个值守动作变成一个流水线任务</strong>。</p><hr><h2 id="八、何时不该用渐进发布" tabindex="-1">八、何时不该用渐进发布 <a class="header-anchor" href="#八、何时不该用渐进发布" aria-label="Permalink to &quot;八、何时不该用渐进发布&quot;">​</a></h2><p>渐进发布不是万能药,<strong>滥用会有反效果</strong>。</p><h3 id="_8-1-单实例服务" tabindex="-1">8.1 单实例服务 <a class="header-anchor" href="#_8-1-单实例服务" aria-label="Permalink to &quot;8.1 单实例服务&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>某服务只有 1-2 个 pod(低 QPS / 内部工具):</span></span>
<span class="line"><span>   - 1% 流量 = 0.01-0.02 pod ≈ 无法切分</span></span>
<span class="line"><span>   - 跑 canary 等于直接全量切</span></span>
<span class="line"><span>   - 加上 Rollouts 的复杂度,得不偿失</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>→ 直接用 RollingUpdate 即可,不要硬上 canary</span></span></code></pre></div><p><strong>经验</strong>:<strong>金丝雀的最小实例数是 5</strong>——不到这个数,精细切分无意义。</p><h3 id="_8-2-状态相关变更" tabindex="-1">8.2 状态相关变更 <a class="header-anchor" href="#_8-2-状态相关变更" aria-label="Permalink to &quot;8.2 状态相关变更&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>变更类型示例:</span></span>
<span class="line"><span>   - 改了内存中的状态机定义</span></span>
<span class="line"><span>   - 改了缓存 key 的编码</span></span>
<span class="line"><span>   - 改了消息队列的消息格式</span></span>
<span class="line"><span></span></span>
<span class="line"><span>问题:</span></span>
<span class="line"><span>   stable 写出来的数据,canary 读不懂(反之亦然)</span></span>
<span class="line"><span>   新旧版本并存期间数据被双方互相破坏</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>→ 这种变更必须走&quot;先兼容新旧 → 全量切代码 → 删旧代码&quot;三步走</span></span>
<span class="line"><span>   而不是&quot;灰度切流量&quot;</span></span>
<span class="line"><span>   这就是第 23 篇要讲的 Expand-Contract 模式</span></span></code></pre></div><h3 id="_8-3-紧急-hotfix" tabindex="-1">8.3 紧急 hotfix <a class="header-anchor" href="#_8-3-紧急-hotfix" aria-label="Permalink to &quot;8.3 紧急 hotfix&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>凌晨 P0 事故,需要立刻打补丁:</span></span>
<span class="line"><span>   - 走 canary 5% → 25% → 50% → 100% = 45 分钟</span></span>
<span class="line"><span>   - 用户已经在生产骂街了</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>→ 紧急 hotfix 应该有&quot;快速通道&quot;:</span></span>
<span class="line"><span>   - 跳过部分挡位(或者用 promote 命令一次拉到 100%)</span></span>
<span class="line"><span>   - 但仍然保留 stable,5 分钟后能 rollback</span></span>
<span class="line"><span>   - 不要为了&quot;按流程&quot;让事故多烧 30 分钟</span></span></code></pre></div><p><strong>经验</strong>:<code>kubectl argo rollouts promote &lt;rollout-name&gt; --full</code> 把当前 Rollout 一次推到 100%——<strong>给值班工程师授权使用</strong>,但事后必须发 incident report 说明为什么跳过流程。</p><h3 id="_8-4-数据库-schema-变更" tabindex="-1">8.4 数据库 / schema 变更 <a class="header-anchor" href="#_8-4-数据库-schema-变更" aria-label="Permalink to &quot;8.4 数据库 / schema 变更&quot;">​</a></h3><p>这一条留到 23 篇详细讲,这里先点出**:数据库变更不能走&quot;流量切分&quot;逻辑**——所有 pod 都连同一个数据库,5% 流量 vs 95% 流量看到的 schema 是一样的,<strong>canary 这层根本不解决 schema 兼容问题</strong>。</p><hr><h2 id="九、7-条踩坑" tabindex="-1">九、7 条踩坑 <a class="header-anchor" href="#九、7-条踩坑" aria-label="Permalink to &quot;九、7 条踩坑&quot;">​</a></h2><p>这 7 条都是真实出过的事故。</p><h3 id="_9-1-rollback-后旧版本残留-session" tabindex="-1">9.1 rollback 后旧版本残留 session <a class="header-anchor" href="#_9-1-rollback-后旧版本残留-session" aria-label="Permalink to &quot;9.1 rollback 后旧版本残留 session&quot;">​</a></h3><p><strong>症状</strong>:rollback 完成,流量回到 stable,但部分用户仍在报错。</p><p><strong>根因</strong>:用户的浏览器 / 移动端持有的是 canary 期间下发的 JWT / 长连接,<strong>这个 token 包含的某个字段是新版本的格式</strong>,stable 不识别。</p><p><strong>避坑</strong>:JWT / session payload 改格式时,<strong>必须先发&quot;只增不删的过渡版本&quot;</strong>——新版本能读旧格式 + 新格式,旧版本读旧格式正常,新格式忽略。等所有用户的旧 token 自然过期后,才能再发&quot;只读新格式&quot;的版本。<strong>这本质上是 22 篇 + 23 篇要讲的&quot;兼容期&quot;问题</strong>。</p><h3 id="_9-2-canary-pod-拉到-lb-但流量没切" tabindex="-1">9.2 canary pod 拉到 LB 但流量没切 <a class="header-anchor" href="#_9-2-canary-pod-拉到-lb-但流量没切" aria-label="Permalink to &quot;9.2 canary pod 拉到 LB 但流量没切&quot;">​</a></h3><p><strong>症状</strong>:Rollout 显示 &quot;Progressing 5%&quot;,但 canary pod 一个请求都没收到。</p><p><strong>根因</strong>:<strong>Ingress / Service mesh 的 weight 配置没生效</strong>。常见原因:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>- nginx ingress controller 没装&quot;canary annotation&quot; 支持的版本</span></span>
<span class="line"><span>- VirtualService 写错(weight 单位是 100 还是 1?)</span></span>
<span class="line"><span>- canary Service 的 selector 写错了,根本没匹配到 canary pod</span></span>
<span class="line"><span>- service mesh sidecar 没注入 canary pod(automatic injection 漏了 namespace 标签)</span></span></code></pre></div><p><strong>避坑</strong>:<strong>部署前在 staging 跑完整 Rollout 流程</strong>——不光是&quot;代码能跑&quot;,还要验证&quot;流量真的切了&quot;。可以在 canary 的 entrypoint 里临时加日志 <code>print(&quot;CANARY_VERSION_v2.4.7&quot;)</code>,然后看日志里 canary 是不是真的有请求过来。</p><h3 id="_9-3-analysis-用-instant-query-漏波动" tabindex="-1">9.3 analysis 用 instant query 漏波动 <a class="header-anchor" href="#_9-3-analysis-用-instant-query-漏波动" aria-label="Permalink to &quot;9.3 analysis 用 instant query 漏波动&quot;">​</a></h3><p><strong>症状</strong>:Prom analysis 一直显示成功,但实际错误率已经飙了,只是某些时刻 query 命中&quot;恰好是好的瞬间&quot;。</p><p><strong>根因</strong>:<strong>用了 <code>http_requests_total{...}</code> 这种没 rate 的 instant query</strong>,Prometheus 返回某个瞬间的 counter 值,不反映&quot;过去一段时间的速率&quot;。</p><p><strong>避坑</strong>:<code>AnalysisTemplate</code> 的 PromQL <strong>必须用 <code>rate()</code> / <code>increase()</code> / <code>histogram_quantile()</code> 这类区间函数</strong>,窗口至少 <code>[2m]</code>。<strong>对 PromQL 不熟的同学先去看 07 篇</strong>。</p><h3 id="_9-4-failurecondition-写反" tabindex="-1">9.4 failureCondition 写反 <a class="header-anchor" href="#_9-4-failurecondition-写反" aria-label="Permalink to &quot;9.4 failureCondition 写反&quot;">​</a></h3><p><strong>症状</strong>:canary 一切正常,但 Rollouts 显示 Failed,自动 rollback。</p><p><strong>根因</strong>:<code>successCondition: result[0] &gt;= 0.99</code> 和 <code>failureCondition: result[0] &lt; 0.99</code> 这两个<strong>只能写一个</strong>,写两个互相矛盾——或者写成 <code>&gt;=</code> 还是 <code>&lt;=</code> 搞反了。</p><p><strong>避坑</strong>:<strong>只写 <code>successCondition</code></strong>——<code>failureLimit</code> 控制&quot;连续失败次数&quot;,不需要 failureCondition。AnalysisTemplate 的两个字段不要同时写。</p><h3 id="_9-5-step-weight-和实际流量对不上" tabindex="-1">9.5 step weight 和实际流量对不上 <a class="header-anchor" href="#_9-5-step-weight-和实际流量对不上" aria-label="Permalink to &quot;9.5 step weight 和实际流量对不上&quot;">​</a></h3><p><strong>症状</strong>:<code>setWeight: 25</code> 但实际监控看 canary 接到 40% 的流量(或 5%)。</p><p><strong>根因</strong>:三种可能性:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. canary 和 stable 的 pod 数量不均衡</span></span>
<span class="line"><span>   - 比如 stable 10 pod, canary 1 pod, 但用的是 L4 Service 负载均衡</span></span>
<span class="line"><span>   - 实际是 1/11 ≈ 9%, 不是 25%</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>2. 长连接(gRPC / WebSocket / HTTP/2)</span></span>
<span class="line"><span>   - 客户端已经和 stable 建好 TCP,新流量才走到 canary</span></span>
<span class="line"><span>   - 实际比例严重偏向 stable</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>3. 客户端有本地负载均衡</span></span>
<span class="line"><span>   - SDK 缓存了 endpoint 列表,不响应 weight 调整</span></span></code></pre></div><p><strong>避坑</strong>:<strong>必须用 L7 流量分流(ingress / service mesh)而不是 K8s Service 自带的 L4</strong>——这是金丝雀做精确切分的硬要求。长连接服务额外要做&quot;主动断连&quot;或&quot;客户端配合&quot;。</p><h3 id="_9-6-并行多个-rollout-互相干扰" tabindex="-1">9.6 并行多个 rollout 互相干扰 <a class="header-anchor" href="#_9-6-并行多个-rollout-互相干扰" aria-label="Permalink to &quot;9.6 并行多个 rollout 互相干扰&quot;">​</a></h3><p><strong>症状</strong>:同时跑两个 Rollout,一个的 analysis 误把另一个的指标当自己的,误判失败 rollback。</p><p><strong>根因</strong>:PromQL 没有按 <code>version</code> / <code>pod_template_hash</code> 区分,<strong>两个 rollout 共享了 metric 标签空间</strong>。</p><p><strong>避坑</strong>:<strong>AnalysisTemplate 的 PromQL 必须用 canary 独有的标签筛选</strong>:</p><div class="language-promql vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">promql</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>sum(rate(http_requests_total{</span></span>
<span class="line"><span>  service=&quot;order-api&quot;,</span></span>
<span class="line"><span>  pod=~&quot;.*-canary-.*&quot;   # 或者用 Rollouts 注入的 rollouts-pod-template-hash</span></span>
<span class="line"><span>}[2m]))</span></span></code></pre></div><p>Argo Rollouts 会给 canary pod 注入 <code>rollouts-pod-template-hash</code> 标签,用这个最稳。</p><h3 id="_9-7-长周期-canary-卡住" tabindex="-1">9.7 长周期 canary 卡住 <a class="header-anchor" href="#_9-7-长周期-canary-卡住" aria-label="Permalink to &quot;9.7 长周期 canary 卡住&quot;">​</a></h3><p><strong>症状</strong>:某 Rollout 在 50% 卡了 3 天,nobody 推进。</p><p><strong>根因</strong>:发起人忘了——<code>pause: {}</code> 写成了&quot;手动确认&quot;,但没人去 promote。</p><p><strong>避坑</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>- 所有 pause 必须有 duration,不要无限期等</span></span>
<span class="line"><span>- 例外:重大变更想观察一晚 → pause: { duration: 12h }</span></span>
<span class="line"><span>- 配合&quot;超时告警&quot;:发布超过 N 小时未完成,自动告警提醒</span></span>
<span class="line"><span>- 团队建立&quot;Rollout 看板&quot;:Grafana 一眼能看到哪些 rollout 在进行中、卡在哪一步</span></span></code></pre></div><hr><h2 id="十、小结" tabindex="-1">十、小结 <a class="header-anchor" href="#十、小结" aria-label="Permalink to &quot;十、小结&quot;">​</a></h2><ol><li><strong>全量发布的三种死法</strong>:bug 一上线全员中招 / 性能无预警 / rollback 被 DDL 挡——前两种渐进发布解决,第三种 23 篇专讲</li><li><strong>蓝绿 / 金丝雀 / 影子流量</strong>:三种模式不互斥,组合使用是常态。蓝绿适合无状态网关,金丝雀适合 90% 业务服务,影子流量适合重构和性能验证</li><li><strong>金丝雀 5 挡位</strong>:1% / 5% / 25% / 50% / 100%,每挡停留至少覆盖 P99 周期 + SLO 验证窗口(5-15min)</li><li><strong>自动 rollback 用相对基线 + 燃烧率</strong>:绝对阈值会误报漏报,<strong>不要写&quot;错误率 &gt; 1% 就 rollback&quot;这种粗糙规则</strong></li><li><strong>Argo Rollouts vs Flagger</strong>:用 ArgoCD 选 Rollouts,用 mesh 选 Flagger,不要两个都装</li><li><strong>流量分流方式</strong>:L4 副本比例简单不精确 / L7 service mesh 精确 / Header-based 灰度内部 VIP</li><li><strong>蓝绿不是双倍资源浪费</strong>——只在切换那一段时间是 2x,稳态还是 1x</li><li><strong>影子流量必须明确&quot;读还是写&quot;</strong>——写入语义不能镜像,否则数据污染</li></ol><p>发布工程的目标不是&quot;零事故&quot;,是「<strong>任何一次事故都能被压缩到最小影响面 + 最快恢复时间</strong>」。渐进发布是这件事的硬骨架,Feature Flag 是这件事的肌肉(下一篇),数据库变更是这件事的关节(再下一篇)——<strong>三篇合起来才是&quot;发布工程&quot;的完整形态</strong>。</p><p>如果你团队现在还在用 <code>kubectl apply -f deployment.yaml</code> 全量发,这一篇看完就该动了——<strong>先从一个 P1 业务服务接 Argo Rollouts 试,跑通一个月再推广</strong>。<strong>不要一上来就给所有 100 个服务接,你会被 yaml 海溺死</strong>。</p><hr><p>下一篇:<strong><code>22-Feature-Flag工程.md</code></strong>——讲完&quot;实例维度&quot;的渐进发布,下一篇讲&quot;启用维度&quot;的灰度。<strong>Feature Flag 把&quot;发布&quot;和&quot;启用&quot;解耦</strong>——代码可以提前 deploy,但功能由 flag 控制开 / 关 / 灰度。LaunchDarkly 贵但完整,Unleash 开源够用,OpenFeature 给你 SDK 抽象层避免供应商锁定;但工具只是开始——<strong>Flag 真正的难点是&quot;长出来容易,删干净难&quot;</strong>,半年不管就一堆僵尸 flag,这一篇会讲清楚 flag 治理的工程纪律。</p>`,161)])])}const k=a(l,[["render",t]]);export{g as __pageData,k as default};
