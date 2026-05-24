import{_ as a,H as n,f as p,i as e}from"./chunks/framework.BHvCMIhP.js";const u=JSON.parse('{"title":"设计文档与系统设计面试","description":"","frontmatter":{},"headers":[],"relativePath":"systemDesign/30-设计文档与系统设计面试.md","filePath":"systemDesign/30-设计文档与系统设计面试.md","lastUpdated":1778496697000}'),l={name:"systemDesign/30-设计文档与系统设计面试.md"};function t(i,s,o,c,r,d){return n(),p("div",null,[...s[0]||(s[0]=[e(`<h1 id="设计文档与系统设计面试" tabindex="-1">设计文档与系统设计面试 <a class="header-anchor" href="#设计文档与系统设计面试" aria-label="Permalink to &quot;设计文档与系统设计面试&quot;">​</a></h1><p>系统设计能力是<strong>软件工程师的天花板</strong>——3 年工程师能写出 CRUD,5 年工程师能优化性能,<strong>10 年工程师才能独立设计能扛 1 亿用户的系统</strong>。这种能力分两个外显出口:<strong>面试时白板答题</strong>(45 分钟拿到 P7 / Senior 的核心环节)和<strong>真实工作中写设计文档</strong>(让团队认可你方案的工具)。这两件事<strong>用的是同一套思维</strong>——前 29 篇讲的所有内容,在这两个场景里被压缩成一个标准答题流程。本系列的最后一篇,就讲清楚这个流程。</p><blockquote><p>一句话先记住:<strong>系统设计 = 五段式答题</strong>——需求拆解 → 容量估算 → 数据模型 → 架构演进 → 关键取舍。<strong>面试和文档用同一套结构</strong>,只是篇幅不同。<strong>面试 45 分钟,文档 5-20 页</strong>,但<strong>底层思维完全相同</strong>——这就是为什么本系列从 14 篇开始所有案例都套这个模板。<strong>会面试不一定会做事,会做事一定会面试</strong>——所以多做真项目永远比刷题更值钱。</p></blockquote><hr><h2 id="一、五段式模板回顾" tabindex="-1">一、五段式模板回顾 <a class="header-anchor" href="#一、五段式模板回顾" aria-label="Permalink to &quot;一、五段式模板回顾&quot;">​</a></h2><p>整个系列的核心模板,<strong>任何系统设计场景都套用</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 需求拆解        ← 30% 时间(被新手低估)</span></span>
<span class="line"><span>   - 功能边界(做什么、不做什么)</span></span>
<span class="line"><span>   - 非功能(QPS / 延迟 / 一致性 / 可用性)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. 容量估算</span></span>
<span class="line"><span>   - DAU → QPS</span></span>
<span class="line"><span>   - 数据量 → 存储</span></span>
<span class="line"><span>   - 流量 → 带宽</span></span>
<span class="line"><span>   - 数量级判断决定架构等级</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. 数据模型</span></span>
<span class="line"><span>   - 核心实体</span></span>
<span class="line"><span>   - 访问模式</span></span>
<span class="line"><span>   - 量级与分布</span></span>
<span class="line"><span></span></span>
<span class="line"><span>4. 架构演进</span></span>
<span class="line"><span>   - V1 单机</span></span>
<span class="line"><span>   - V2 加缓存</span></span>
<span class="line"><span>   - V3 分库分表</span></span>
<span class="line"><span>   - V4 多机房</span></span>
<span class="line"><span>   - 每一步都要说明&quot;为什么必须升级&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>5. 关键取舍</span></span>
<span class="line"><span>   - CAP 选什么</span></span>
<span class="line"><span>   - 推还是拉</span></span>
<span class="line"><span>   - 强一致还是最终一致</span></span>
<span class="line"><span>   - 同步还是异步</span></span></code></pre></div><blockquote><p><strong>新手的错误是直接跳到第 4 步画架构图</strong>。<strong>老手的关键差异在第 1-2 步</strong> —— 把模糊需求翻译成清晰约束。</p></blockquote><hr><h2 id="二、系统设计面试-45-分钟答题流程" tabindex="-1">二、系统设计面试:45 分钟答题流程 <a class="header-anchor" href="#二、系统设计面试-45-分钟答题流程" aria-label="Permalink to &quot;二、系统设计面试:45 分钟答题流程&quot;">​</a></h2><h3 id="_2-1-时间分配" tabindex="-1">2.1 时间分配 <a class="header-anchor" href="#_2-1-时间分配" aria-label="Permalink to &quot;2.1 时间分配&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>0 - 5 min:  澄清需求(问问题、画边界)</span></span>
<span class="line"><span>5 - 10 min: 容量估算(QPS / 存储 / 带宽)</span></span>
<span class="line"><span>10 - 15 min: 数据模型(核心表、关键字段)</span></span>
<span class="line"><span>15 - 30 min: 架构演进(从 V1 到 V4)</span></span>
<span class="line"><span>30 - 40 min: 深入某个组件(面试官引导)</span></span>
<span class="line"><span>40 - 45 min: 取舍讨论 + 失败模式</span></span></code></pre></div><h3 id="_2-2-第一步-澄清需求-关键" tabindex="-1">2.2 第一步:澄清需求(关键) <a class="header-anchor" href="#_2-2-第一步-澄清需求-关键" aria-label="Permalink to &quot;2.2 第一步:澄清需求(关键)&quot;">​</a></h3><p>面试官说&quot;设计 Twitter&quot;——<strong>你不应该直接画图</strong>。</p><p><strong>先问 5-10 个问题</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>功能边界:</span></span>
<span class="line"><span>- DAU 多少?(决定数量级)</span></span>
<span class="line"><span>- 是国内还是全球?(决定多机房)</span></span>
<span class="line"><span>- 要做推荐算法吗?(决定 Feed 复杂度)</span></span>
<span class="line"><span>- 要做评论 / 点赞 / 转发吗?</span></span>
<span class="line"><span>- 是不是要支持视频?(决定是否引入 CDN / 转码)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>非功能:</span></span>
<span class="line"><span>- 一致性要求?</span></span>
<span class="line"><span>- 延迟要求?</span></span>
<span class="line"><span>- 我们假设可用性要求 99.99%,可以吗?</span></span></code></pre></div><p><strong>面试官最看重的就是这一步</strong> —— 它体现你&quot;做减法&quot;的能力。<strong>直接开始设计的候选人,99% 拿不到 P7</strong>。</p><h3 id="_2-3-第二步-容量估算-必算" tabindex="-1">2.3 第二步:容量估算(必算) <a class="header-anchor" href="#_2-3-第二步-容量估算-必算" aria-label="Permalink to &quot;2.3 第二步:容量估算(必算)&quot;">​</a></h3><p>3 分钟内给出:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>- 平均 / 峰值 QPS</span></span>
<span class="line"><span>- 数据增量(GB / TB / PB 级别)</span></span>
<span class="line"><span>- 带宽</span></span>
<span class="line"><span>- 缓存大小</span></span>
<span class="line"><span>- 单机能扛吗?要分多少库?</span></span></code></pre></div><p><strong>详见 02 篇容量估算</strong>——这是面试硬通货,<strong>必须张嘴就来</strong>。</p><h3 id="_2-4-第三步-数据模型" tabindex="-1">2.4 第三步:数据模型 <a class="header-anchor" href="#_2-4-第三步-数据模型" aria-label="Permalink to &quot;2.4 第三步:数据模型&quot;">​</a></h3><p>不要写完整 SQL,<strong>只画核心表</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>User(id, name, email, ...)</span></span>
<span class="line"><span>Tweet(id, user_id, content, created_at)</span></span>
<span class="line"><span>Follow(follower_id, followee_id)</span></span></code></pre></div><p><strong>关键讨论</strong>:</p><ul><li>主键 / 索引</li><li>分片键</li><li>量级与分库</li></ul><h3 id="_2-5-第四步-架构演进-主战场" tabindex="-1">2.5 第四步:架构演进(主战场) <a class="header-anchor" href="#_2-5-第四步-架构演进-主战场" aria-label="Permalink to &quot;2.5 第四步:架构演进(主战场)&quot;">​</a></h3><p><strong>不要画终极版</strong>,<strong>画 V1 → V4 演进</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>V1: 单机能扛吗? (DAU &lt; X)</span></span>
<span class="line"><span>   什么瓶颈?</span></span>
<span class="line"><span>↓</span></span>
<span class="line"><span>V2: 加缓存 / 读写分离 (DAU &lt; Y)</span></span>
<span class="line"><span>   什么瓶颈?</span></span>
<span class="line"><span>↓</span></span>
<span class="line"><span>V3: 分库分表 (DAU &lt; Z)</span></span>
<span class="line"><span>   什么瓶颈?</span></span>
<span class="line"><span>↓</span></span>
<span class="line"><span>V4: 多机房 / 异地多活 (DAU &gt; W)</span></span></code></pre></div><p>每一步说清楚 <strong>&quot;V_n 的什么瓶颈逼出了 V_{n+1}&quot;</strong>。</p><h3 id="_2-6-第五步-深入某个组件" tabindex="-1">2.6 第五步:深入某个组件 <a class="header-anchor" href="#_2-6-第五步-深入某个组件" aria-label="Permalink to &quot;2.6 第五步:深入某个组件&quot;">​</a></h3><p>面试官通常会引导你深入一个模块:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>&quot;你刚才提到用 Redis 缓存,讲讲缓存击穿怎么处理&quot;</span></span>
<span class="line"><span>&quot;你说要分库,分片键怎么选?&quot;</span></span>
<span class="line"><span>&quot;用了 MQ,怎么保证消息不丢?&quot;</span></span></code></pre></div><p><strong>这是真正的考核点</strong> —— 你对每个组件了解多深?是只会&quot;用&quot;,还是知道&quot;为什么这么用、什么时候不该用&quot;?</p><h3 id="_2-7-第六步-讨论取舍-失败模式" tabindex="-1">2.7 第六步:讨论取舍 + 失败模式 <a class="header-anchor" href="#_2-7-第六步-讨论取舍-失败模式" aria-label="Permalink to &quot;2.7 第六步:讨论取舍 + 失败模式&quot;">​</a></h3><p>收尾:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>&quot;这个方案的取舍是 X 换 Y&quot;</span></span>
<span class="line"><span>&quot;如果 A 组件挂了,整个系统怎么响应?&quot;</span></span>
<span class="line"><span>&quot;如果流量翻 10 倍,瓶颈会先出现在哪?&quot;</span></span>
<span class="line"><span>&quot;如果业务需要全球用户,要怎么改?&quot;</span></span></code></pre></div><p><strong>这一段决定 P7 还是 P8</strong>——不只回答方案,而是<strong>讨论方案的边界</strong>。</p><hr><h2 id="三、面试加分项" tabindex="-1">三、面试加分项 <a class="header-anchor" href="#三、面试加分项" aria-label="Permalink to &quot;三、面试加分项&quot;">​</a></h2><h3 id="_3-1-主动画图-写公式" tabindex="-1">3.1 主动画图 / 写公式 <a class="header-anchor" href="#_3-1-主动画图-写公式" aria-label="Permalink to &quot;3.1 主动画图 / 写公式&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>[Client] → [LB] → [Web ×N] → [Redis Cluster]</span></span>
<span class="line"><span>                              ↘ [MySQL ×16]</span></span>
<span class="line"><span></span></span>
<span class="line"><span>QPS = DAU × 50 / 86400 ≈ 6 万</span></span>
<span class="line"><span>峰值 = 6 万 × 5 = 30 万</span></span>
<span class="line"><span>单 Redis 上限 = 10 万 → 必须 Cluster</span></span></code></pre></div><p><strong>让面试官清楚看到你的推理过程</strong>——文字 &lt; 图表 &lt; 数字。</p><h3 id="_3-2-引用真实案例" tabindex="-1">3.2 引用真实案例 <a class="header-anchor" href="#_3-2-引用真实案例" aria-label="Permalink to &quot;3.2 引用真实案例&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>&quot;这个推拉结合的 timeline 设计,Twitter 早期就是这么做的&quot;</span></span>
<span class="line"><span>&quot;分布式 ID 用雪花,Twitter 开源,后来 Sony / Discord 都改造过&quot;</span></span>
<span class="line"><span>&quot;双 11 阿里就用了类似的限流策略&quot;</span></span></code></pre></div><p><strong>说明你不是纸上谈兵</strong>——读过工程文章、关注业界实践。</p><h3 id="_3-3-主动提到取舍" tabindex="-1">3.3 主动提到取舍 <a class="header-anchor" href="#_3-3-主动提到取舍" aria-label="Permalink to &quot;3.3 主动提到取舍&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>&quot;我推荐用 Cassandra 而不是 MySQL,因为我们的访问模式是按 user_id 分区的简单 KV 查询&quot;</span></span>
<span class="line"><span>&quot;代价是失去了复杂查询能力,但我们的需求里没有那部分&quot;</span></span></code></pre></div><p><strong>永远主动说&quot;代价&quot;</strong>——不主动说就显得你只看到优点。</p><h3 id="_3-4-说-我不知道" tabindex="-1">3.4 说&quot;我不知道&quot; <a class="header-anchor" href="#_3-4-说-我不知道" aria-label="Permalink to &quot;3.4 说&quot;我不知道&quot;&quot;">​</a></h3><p>不知道时<strong>别瞎编</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>&quot;具体的 Cassandra 一致性级别配置我记不清,但我知道它支持 ONE / QUORUM / ALL,可以根据需要调&quot;</span></span></code></pre></div><p><strong>会承认不知道的工程师比硬编的强 10 倍</strong> —— 面试官也是工程师,知道你在编。</p><hr><h2 id="四、面试常见问题及-如何答" tabindex="-1">四、面试常见问题及&quot;如何答&quot; <a class="header-anchor" href="#四、面试常见问题及-如何答" aria-label="Permalink to &quot;四、面试常见问题及&quot;如何答&quot;&quot;">​</a></h2><h3 id="_4-1-怎么扛住-100-万-qps" tabindex="-1">4.1 &quot;怎么扛住 100 万 QPS?&quot; <a class="header-anchor" href="#_4-1-怎么扛住-100-万-qps" aria-label="Permalink to &quot;4.1 &quot;怎么扛住 100 万 QPS?&quot;&quot;">​</a></h3><p><strong>答题套路</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 这是读多还是写多?(决定优化方向)</span></span>
<span class="line"><span>2. 容量估算:这个量级单机扛不住,必须分布式</span></span>
<span class="line"><span>3. 读多写少:多级缓存(Caffeine + Redis + CDN)+ 读写分离</span></span>
<span class="line"><span>4. 写多读少:分库分表 + 异步写 + 削峰 MQ</span></span>
<span class="line"><span>5. 监控 + 限流兜底</span></span></code></pre></div><h3 id="_4-2-怎么保证不丢消息" tabindex="-1">4.2 &quot;怎么保证不丢消息?&quot; <a class="header-anchor" href="#_4-2-怎么保证不丢消息" aria-label="Permalink to &quot;4.2 &quot;怎么保证不丢消息?&quot;&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 生产端:acks=all + 重试</span></span>
<span class="line"><span>2. MQ:多副本 + 持久化</span></span>
<span class="line"><span>3. 消费端:手动 ACK + 失败重试 + 死信队列</span></span>
<span class="line"><span>4. 业务幂等(关键:Exactly Once 不存在,只能至少一次 + 幂等)</span></span></code></pre></div><h3 id="_4-3-db-主从延迟怎么办" tabindex="-1">4.3 &quot;DB 主从延迟怎么办?&quot; <a class="header-anchor" href="#_4-3-db-主从延迟怎么办" aria-label="Permalink to &quot;4.3 &quot;DB 主从延迟怎么办?&quot;&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 监控延迟(用心跳表,不信 Seconds_Behind_Master)</span></span>
<span class="line"><span>2. 关键写后立即读 → 强制走主库</span></span>
<span class="line"><span>3. 查询前等 GTID 应用完(强一致场景)</span></span>
<span class="line"><span>4. 跨机房复制 → 用半同步保证不丢</span></span></code></pre></div><h3 id="_4-4-怎么处理-hot-key" tabindex="-1">4.4 &quot;怎么处理 hot key?&quot; <a class="header-anchor" href="#_4-4-怎么处理-hot-key" aria-label="Permalink to &quot;4.4 &quot;怎么处理 hot key?&quot;&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 本地缓存 Caffeine(完全不打 Redis)</span></span>
<span class="line"><span>2. 多副本 Redis(分摊读)</span></span>
<span class="line"><span>3. CDN 缓存(对外接口)</span></span>
<span class="line"><span>4. 限流(防止 hot key 影响其他请求)</span></span></code></pre></div><hr><h2 id="五、写真实工作中的设计文档" tabindex="-1">五、写真实工作中的设计文档 <a class="header-anchor" href="#五、写真实工作中的设计文档" aria-label="Permalink to &quot;五、写真实工作中的设计文档&quot;">​</a></h2><h3 id="_5-1-文档结构-标准模板" tabindex="-1">5.1 文档结构(标准模板) <a class="header-anchor" href="#_5-1-文档结构-标准模板" aria-label="Permalink to &quot;5.1 文档结构(标准模板)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># XXX 系统设计文档</span></span>
<span class="line"><span></span></span>
<span class="line"><span>## 1. 背景与目标</span></span>
<span class="line"><span>- 业务背景(为什么要做)</span></span>
<span class="line"><span>- 目标(解决什么问题)</span></span>
<span class="line"><span>- 非目标(不在范围内)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>## 2. 现状分析</span></span>
<span class="line"><span>- 当前架构是什么</span></span>
<span class="line"><span>- 当前瓶颈 / 问题</span></span>
<span class="line"><span></span></span>
<span class="line"><span>## 3. 需求</span></span>
<span class="line"><span>- 功能需求</span></span>
<span class="line"><span>- 非功能需求(QPS / 延迟 / 一致性 / 可用性)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>## 4. 容量估算</span></span>
<span class="line"><span>- DAU、QPS、存储、带宽</span></span>
<span class="line"><span></span></span>
<span class="line"><span>## 5. 设计方案</span></span>
<span class="line"><span>- 数据模型</span></span>
<span class="line"><span>- 架构图(画清楚)</span></span>
<span class="line"><span>- 关键流程(时序图)</span></span>
<span class="line"><span>- 容错设计</span></span>
<span class="line"><span></span></span>
<span class="line"><span>## 6. 方案对比</span></span>
<span class="line"><span>- 方案 A vs 方案 B vs 方案 C</span></span>
<span class="line"><span>- 各自取舍</span></span>
<span class="line"><span>- 推荐方案及原因</span></span>
<span class="line"><span></span></span>
<span class="line"><span>## 7. 风险与回滚</span></span>
<span class="line"><span>- 已知风险</span></span>
<span class="line"><span>- 监控指标</span></span>
<span class="line"><span>- 回滚方案</span></span>
<span class="line"><span></span></span>
<span class="line"><span>## 8. 实施计划</span></span>
<span class="line"><span>- 里程碑</span></span>
<span class="line"><span>- 参与团队</span></span>
<span class="line"><span>- 估算工时</span></span>
<span class="line"><span></span></span>
<span class="line"><span>## 9. 附录</span></span>
<span class="line"><span>- 性能压测数据</span></span>
<span class="line"><span>- 参考文献</span></span></code></pre></div><h3 id="_5-2-一份好文档的特征" tabindex="-1">5.2 一份好文档的特征 <a class="header-anchor" href="#_5-2-一份好文档的特征" aria-label="Permalink to &quot;5.2 一份好文档的特征&quot;">​</a></h3><ul><li><strong>数字驱动</strong>:不写&quot;性能不错&quot;,写&quot;p99 80ms,QPS 5000&quot;</li><li><strong>画图</strong>:架构图、时序图、状态机图</li><li><strong>方案对比</strong>:列出至少 2-3 个方案,说明为什么选这个</li><li><strong>能 Code Review</strong>:别人能照着实现</li><li><strong>可回滚</strong>:每一步都有回滚方案</li></ul><h3 id="_5-3-一份烂文档的特征" tabindex="-1">5.3 一份烂文档的特征 <a class="header-anchor" href="#_5-3-一份烂文档的特征" aria-label="Permalink to &quot;5.3 一份烂文档的特征&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>× 没有数字,全是&quot;高性能 / 高可用&quot;</span></span>
<span class="line"><span>× 只有一个方案,没对比</span></span>
<span class="line"><span>× 无图(纯文字描述架构)</span></span>
<span class="line"><span>× 没估算,直接给方案</span></span>
<span class="line"><span>× 没考虑失败模式</span></span>
<span class="line"><span>× 篇幅过长但没重点(40 页讲废话)</span></span></code></pre></div><blockquote><p><strong>好文档让团队认可、上线后不变形</strong>——一边做一边发现&quot;原来文档没考虑这个&quot; = 文档没写好。</p></blockquote><hr><h2 id="六、设计文档的-评审流程" tabindex="-1">六、设计文档的&quot;评审流程&quot; <a class="header-anchor" href="#六、设计文档的-评审流程" aria-label="Permalink to &quot;六、设计文档的&quot;评审流程&quot;&quot;">​</a></h2><h3 id="_6-1-评审的目的" tabindex="-1">6.1 评审的目的 <a class="header-anchor" href="#_6-1-评审的目的" aria-label="Permalink to &quot;6.1 评审的目的&quot;">​</a></h3><p>不是让你&quot;过关&quot;,是<strong>找出方案漏洞</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 团队先 Async Review(预读)</span></span>
<span class="line"><span>2. 安排会议讨论(1 小时)</span></span>
<span class="line"><span>3. 重点议题:风险、取舍、边界条件</span></span>
<span class="line"><span>4. 文档迭代,直到所有 Concern 解决</span></span>
<span class="line"><span>5. 进入实施</span></span></code></pre></div><h3 id="_6-2-评审的关键问题" tabindex="-1">6.2 评审的关键问题 <a class="header-anchor" href="#_6-2-评审的关键问题" aria-label="Permalink to &quot;6.2 评审的关键问题&quot;">​</a></h3><p>评审者通常会问:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>&quot;如果 X 组件挂了怎么办?&quot;</span></span>
<span class="line"><span>&quot;流量翻 10 倍怎么办?&quot;</span></span>
<span class="line"><span>&quot;和 Y 系统冲突吗?&quot;</span></span>
<span class="line"><span>&quot;上线后怎么监控?&quot;</span></span>
<span class="line"><span>&quot;有更简单的方案吗?&quot;</span></span>
<span class="line"><span>&quot;投入 / 产出比如何?&quot;</span></span></code></pre></div><p><strong>回答得好 = 文档过关</strong>。回答不上来 = 文档要再迭代。</p><hr><h2 id="七、系统设计能力的-成长阶梯" tabindex="-1">七、系统设计能力的&quot;成长阶梯&quot; <a class="header-anchor" href="#七、系统设计能力的-成长阶梯" aria-label="Permalink to &quot;七、系统设计能力的&quot;成长阶梯&quot;&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>L0:CRUD</span></span>
<span class="line"><span>   能写接口、用 ORM、做基本测试</span></span>
<span class="line"><span></span></span>
<span class="line"><span>L1:能用基础设施</span></span>
<span class="line"><span>   懂 Redis / MQ / 缓存,能用对地方</span></span>
<span class="line"><span></span></span>
<span class="line"><span>L2:抗压设计</span></span>
<span class="line"><span>   QPS 数量级估算、分库分表、缓存策略、限流熔断</span></span>
<span class="line"><span>   能设计 1000 万 DAU 的系统(P6 / Senior)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>L3:案例设计</span></span>
<span class="line"><span>   能套五段式模板设计任意系统(短链 / IM / Feed)</span></span>
<span class="line"><span>   能讲出每一步的取舍(P7 / Staff)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>L4:多机房 / 全球</span></span>
<span class="line"><span>   异地多活、Cell 单元化、灰度发布、容灾演练</span></span>
<span class="line"><span>   能设计 1 亿 DAU 系统(P8 / Principal)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>L5:行业洞察</span></span>
<span class="line"><span>   能预判 3-5 年技术演进方向</span></span>
<span class="line"><span>   能影响行业(写论文 / 开源项目领导者)</span></span>
<span class="line"><span>   (P9+ / Distinguished)</span></span></code></pre></div><blockquote><p><strong>本系列覆盖到 L3-L4</strong>——L5 是天赋 + 长期积累 + 运气,<strong>不是看教程能到的</strong>。</p></blockquote><hr><h2 id="八、和其他系列的关系" tabindex="-1">八、和其他系列的关系 <a class="header-anchor" href="#八、和其他系列的关系" aria-label="Permalink to &quot;八、和其他系列的关系&quot;">​</a></h2><p>systemDesign 不是孤岛——<strong>它综合了 backendLearning 的所有内容</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>01-13 心智 + 抗压基础设施</span></span>
<span class="line"><span>      ← 用了 backendLearning 的 Redis / MQ / 分库 / 监控</span></span>
<span class="line"><span></span></span>
<span class="line"><span>14-24 经典案例</span></span>
<span class="line"><span>      ← 用了 webLearning 的前端协议</span></span>
<span class="line"><span>      ← 用了 aiLearning 的推荐算法</span></span>
<span class="line"><span>      ← 用了 backendLearning 的所有中间件</span></span>
<span class="line"><span></span></span>
<span class="line"><span>25-30 进阶</span></span>
<span class="line"><span>      ← 用了 gitLearning 的工作流(灰度发布)</span></span>
<span class="line"><span>      ← 用了 claudeLearning 的 Agent 设计模式(故障诊断 AI)</span></span></code></pre></div><p><strong>系统设计是&quot;上层综合&quot;</strong> —— 没有底层基础,设计就是空谈。<strong>这就是为什么本系列建议放在 backendLearning 后面学</strong>。</p><hr><h2 id="九、推荐的下一步" tabindex="-1">九、推荐的下一步 <a class="header-anchor" href="#九、推荐的下一步" aria-label="Permalink to &quot;九、推荐的下一步&quot;">​</a></h2><p>读完 30 篇,<strong>别只是&quot;读完&quot;</strong>。建议:</p><h3 id="_9-1-自己设计-5-个系统" tabindex="-1">9.1 自己设计 5 个系统 <a class="header-anchor" href="#_9-1-自己设计-5-个系统" aria-label="Permalink to &quot;9.1 自己设计 5 个系统&quot;">​</a></h3><p>挑 5 个本系列没讲的:</p><ul><li>共享单车(类似网约车)</li><li>在线考试(类似秒杀但要求公平)</li><li>视频会议(类似直播但要求超低延迟)</li><li>知乎 / Quora(类似 Twitter 但要重排)</li><li>滴滴外卖(网约车 + 商品 + 商家)</li></ul><p><strong>自己用五段式模板写一遍</strong>——看你能套用到什么程度。</p><h3 id="_9-2-找一个真实项目深入" tabindex="-1">9.2 找一个真实项目深入 <a class="header-anchor" href="#_9-2-找一个真实项目深入" aria-label="Permalink to &quot;9.2 找一个真实项目深入&quot;">​</a></h3><p>选一个你工作 / 兴趣相关的系统,<strong>深挖到代码级</strong>:</p><ul><li>看 Redis Cluster 源码</li><li>读 Kafka 设计论文</li><li>研究 TiDB 怎么实现强一致</li></ul><p><strong>深度 &gt; 广度</strong>——10 个系统都看个皮毛,不如把 Kafka 看透。</p><h3 id="_9-3-关注业界实践" tabindex="-1">9.3 关注业界实践 <a class="header-anchor" href="#_9-3-关注业界实践" aria-label="Permalink to &quot;9.3 关注业界实践&quot;">​</a></h3><ul><li>读各大厂技术博客(美团、字节、阿里、Twitter、Meta、Stripe)</li><li>看 ACM / SIGMOD / OSDI 论文</li><li>关注开源项目的设计文档</li></ul><p><strong>真实工程的&quot;土办法&quot;</strong> 往往比教科书更值钱。</p><hr><h2 id="十、最后的话-系统设计的本质" tabindex="-1">十、最后的话:系统设计的本质 <a class="header-anchor" href="#十、最后的话-系统设计的本质" aria-label="Permalink to &quot;十、最后的话:系统设计的本质&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>系统设计不是技术,是工程思维:</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>  - 在约束里找最优解</span></span>
<span class="line"><span>  - 在不确定性里做决策</span></span>
<span class="line"><span>  - 在团队里推动方案落地</span></span>
<span class="line"><span>  - 在故障中保持冷静</span></span></code></pre></div><p>这不是&quot;刷题&quot;能学的,是<strong>做项目 + 看真系统 + 经历事故</strong> 才能修炼的。</p><blockquote><p><strong>看完这 30 篇,你有了&quot;工具箱&quot;和&quot;思维框架&quot;</strong>——剩下的,<strong>靠真实工作中的迭代积累</strong>。</p></blockquote><hr><h2 id="整个系列的回顾" tabindex="-1">整个系列的回顾 <a class="header-anchor" href="#整个系列的回顾" aria-label="Permalink to &quot;整个系列的回顾&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>第一层 心智(01-05)</span></span>
<span class="line"><span>   总览 / 估算 / 演进 / CAP / 高可用</span></span>
<span class="line"><span>   ↓ 学完知道&quot;在想什么&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>第二层 抗压基础设施(06-13)</span></span>
<span class="line"><span>   LB / 缓存 / 分库 / 主从 / MQ / 限流 / 熔断 / 一致性哈希</span></span>
<span class="line"><span>   ↓ 学完会&quot;搭积木&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>第三层 经典案例(14-24)</span></span>
<span class="line"><span>   短链 / 登录 / Twitter / Feed / IM / 视频 / 直播 / 网约车 / 秒杀 / 订单 / 12306</span></span>
<span class="line"><span>   ↓ 学完会&quot;套模板&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>第四层 进阶(25-30)</span></span>
<span class="line"><span>   多机房 / 容灾 / 迁移 / 发布 / 追踪 / 文档面试</span></span>
<span class="line"><span>   ↓ 学完知道&quot;怎么把方案落地&quot;</span></span></code></pre></div><p><strong>30 篇,30-50 万字,覆盖了系统设计的核心知识图谱</strong>。</p><hr><h2 id="写在结束" tabindex="-1">写在结束 <a class="header-anchor" href="#写在结束" aria-label="Permalink to &quot;写在结束&quot;">​</a></h2><p>这是 systemDesign 系列的<strong>最后一篇</strong>——也是 biglearning 项目的第六个完整系列。</p><p>回顾一下整个 biglearning 走过的路:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>webLearning(50)     前端栈</span></span>
<span class="line"><span>aiLearning(36)      AI 栈</span></span>
<span class="line"><span>backendLearning(50) 后端栈</span></span>
<span class="line"><span>flutterLearning(37) 移动栈</span></span>
<span class="line"><span>claudeLearning(30)  AI 工具实战</span></span>
<span class="line"><span>gitLearning(22)     工程基础</span></span>
<span class="line"><span>systemDesign(30)    架构思维 ← 当下完成</span></span></code></pre></div><p><strong>总计 255 篇,几百万字。</strong></p><p>后面的方向?——<code>未来系列规划.md</code> 里还有十几个候选系列。但不管下一个写什么,本系列的核心思想在所有未来系列里仍然成立:</p><blockquote><p><strong>数字 → 约束 → 取舍 → 演进</strong></p></blockquote><p>这是任何工程问题的求解路径。</p><p>愿你在真正的系统中,把这些字变成代码,把代码变成扛得住的服务。</p>`,124)])])}const g=a(l,[["render",t]]);export{u as __pageData,g as default};
