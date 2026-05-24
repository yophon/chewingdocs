import{_ as s,H as n,f as p,i as l}from"./chunks/framework.BHvCMIhP.js";const u=JSON.parse('{"title":"延迟、吞吐量与并发:性能指标怎么读","description":"","frontmatter":{},"headers":[],"relativePath":"cloudBasicsLearning/20-延迟吞吐量与并发.md","filePath":"cloudBasicsLearning/20-延迟吞吐量与并发.md","lastUpdated":1779015580000}'),e={name:"cloudBasicsLearning/20-延迟吞吐量与并发.md"};function i(t,a,c,o,h,r){return n(),p("div",null,[...a[0]||(a[0]=[l(`<h1 id="延迟、吞吐量与并发-性能指标怎么读" tabindex="-1">延迟、吞吐量与并发:性能指标怎么读 <a class="header-anchor" href="#延迟、吞吐量与并发-性能指标怎么读" aria-label="Permalink to &quot;延迟、吞吐量与并发:性能指标怎么读&quot;">​</a></h1><blockquote><p>一句话先记住:<strong>延迟是一次请求等多久,吞吐量是一段时间能处理多少请求,并发是同一时刻有多少请求或任务正在处理</strong>。</p></blockquote><p>性能问题最容易被一句&quot;网站有点慢&quot;糊弄过去。但工程上必须拆开看:到底是单个请求慢,还是请求太多处理不过来,还是同时连接太多把数据库或函数额度打满?</p><p>延迟、吞吐量、并发不是三个孤立指标。它们常常一起出现,也常常互相影响。</p><hr><h2 id="一、一句话解释" tabindex="-1">一、一句话解释 <a class="header-anchor" href="#一、一句话解释" aria-label="Permalink to &quot;一、一句话解释&quot;">​</a></h2><h3 id="_1-1-延迟-用户等一次请求的时间" tabindex="-1">1.1 延迟:用户等一次请求的时间 <a class="header-anchor" href="#_1-1-延迟-用户等一次请求的时间" aria-label="Permalink to &quot;1.1 延迟:用户等一次请求的时间&quot;">​</a></h3><p>延迟通常指一次操作从发起到得到结果需要多久,例如:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>打开首页:</span></span>
<span class="line"><span>  800ms</span></span>
<span class="line"><span></span></span>
<span class="line"><span>调用登录接口:</span></span>
<span class="line"><span>  300ms</span></span>
<span class="line"><span></span></span>
<span class="line"><span>生成报表:</span></span>
<span class="line"><span>  20s</span></span>
<span class="line"><span></span></span>
<span class="line"><span>上传图片:</span></span>
<span class="line"><span>  5s</span></span></code></pre></div><p>对用户来说,延迟就是&quot;等多久&quot;。对系统来说,延迟可能由很多部分组成:</p><ul><li>DNS 查询时间</li><li>TLS 握手时间</li><li>CDN 命中或回源时间</li><li>后端处理时间</li><li>数据库查询时间</li><li>第三方 API 响应时间</li><li>文件上传和下载时间</li></ul><p>所以&quot;接口慢&quot;不一定是后端代码慢,也可能是数据库慢、网络远、缓存没命中、第三方服务慢。</p><h3 id="_1-2-吞吐量-单位时间能处理多少" tabindex="-1">1.2 吞吐量:单位时间能处理多少 <a class="header-anchor" href="#_1-2-吞吐量-单位时间能处理多少" aria-label="Permalink to &quot;1.2 吞吐量:单位时间能处理多少&quot;">​</a></h3><p>吞吐量看的是系统处理能力,常见表达是:</p><ul><li>每秒请求数,例如 100 RPS</li><li>每分钟任务数,例如每分钟处理 1000 条队列消息</li><li>每秒写入量,例如每秒写入 500 条日志</li><li>每秒传输数据量,例如 50 MB/s</li></ul><p>吞吐量高,不代表每个用户都快。一个系统可以每秒处理很多请求,但单个请求仍然很慢。反过来,一个系统在低流量时响应很快,但流量一上来吞吐量不够,就开始排队和超时。</p><h3 id="_1-3-并发-同一时刻有多少事在进行" tabindex="-1">1.3 并发:同一时刻有多少事在进行 <a class="header-anchor" href="#_1-3-并发-同一时刻有多少事在进行" aria-label="Permalink to &quot;1.3 并发:同一时刻有多少事在进行&quot;">​</a></h3><p>并发看的是&quot;同时进行中的数量&quot;:</p><ul><li>同时在线用户数</li><li>同时打开的 HTTP 连接数</li><li>同时执行的 Serverless 函数数</li><li>数据库同时连接数</li><li>队列中同时处理的任务数</li><li>浏览器同时下载的静态资源数</li></ul><p>并发最容易撞到硬限制。比如数据库最大连接数只有 60,你的 API 每个请求都新建连接,那 100 个同时请求就可能让系统开始报错。</p><hr><h2 id="二、放在系统哪里" tabindex="-1">二、放在系统哪里 <a class="header-anchor" href="#二、放在系统哪里" aria-label="Permalink to &quot;二、放在系统哪里&quot;">​</a></h2><h3 id="_2-1-用户请求链路里的性能指标" tabindex="-1">2.1 用户请求链路里的性能指标 <a class="header-anchor" href="#_2-1-用户请求链路里的性能指标" aria-label="Permalink to &quot;2.1 用户请求链路里的性能指标&quot;">​</a></h3><p>一次用户请求可能穿过这些层:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>浏览器</span></span>
<span class="line"><span>  -&gt; DNS</span></span>
<span class="line"><span>  -&gt; CDN / WAF</span></span>
<span class="line"><span>  -&gt; 负载均衡 / 网关</span></span>
<span class="line"><span>  -&gt; 应用服务 / Serverless 函数</span></span>
<span class="line"><span>  -&gt; 数据库 / 缓存 / 队列</span></span>
<span class="line"><span>  -&gt; 第三方 API</span></span></code></pre></div><p>每一层都可能影响延迟、吞吐量和并发:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>DNS:</span></span>
<span class="line"><span>  影响首次访问延迟</span></span>
<span class="line"><span></span></span>
<span class="line"><span>CDN:</span></span>
<span class="line"><span>  命中缓存时降低延迟和源站压力</span></span>
<span class="line"><span>  回源过多时可能把压力打到后端</span></span>
<span class="line"><span></span></span>
<span class="line"><span>网关:</span></span>
<span class="line"><span>  可能限制每秒请求数或连接数</span></span>
<span class="line"><span></span></span>
<span class="line"><span>应用服务:</span></span>
<span class="line"><span>  受 CPU、内存、线程池、函数执行时间影响</span></span>
<span class="line"><span></span></span>
<span class="line"><span>数据库:</span></span>
<span class="line"><span>  受连接数、慢查询、锁、IO、存储容量影响</span></span>
<span class="line"><span></span></span>
<span class="line"><span>队列:</span></span>
<span class="line"><span>  受消费速度、积压数量、重试策略影响</span></span>
<span class="line"><span></span></span>
<span class="line"><span>第三方 API:</span></span>
<span class="line"><span>  受对方限流和响应速度影响</span></span></code></pre></div><h3 id="_2-2-三个指标之间的关系" tabindex="-1">2.2 三个指标之间的关系 <a class="header-anchor" href="#_2-2-三个指标之间的关系" aria-label="Permalink to &quot;2.2 三个指标之间的关系&quot;">​</a></h3><p>一个简单理解:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>并发上升:</span></span>
<span class="line"><span>  同时处理的请求变多</span></span>
<span class="line"><span></span></span>
<span class="line"><span>系统资源接近上限:</span></span>
<span class="line"><span>  请求开始排队</span></span>
<span class="line"><span></span></span>
<span class="line"><span>排队变长:</span></span>
<span class="line"><span>  延迟上升</span></span>
<span class="line"><span></span></span>
<span class="line"><span>超时和错误变多:</span></span>
<span class="line"><span>  有效吞吐量下降</span></span></code></pre></div><p>这就是为什么一个网站平时很快,一上热搜就慢到不可用。不是每个请求突然变复杂了,而是同时来的请求太多,队列、连接池、函数并发、数据库连接数被打满。</p><h3 id="_2-3-平均值经常骗人" tabindex="-1">2.3 平均值经常骗人 <a class="header-anchor" href="#_2-3-平均值经常骗人" aria-label="Permalink to &quot;2.3 平均值经常骗人&quot;">​</a></h3><p>性能指标里最危险的是只看平均延迟。</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>100 个请求:</span></span>
<span class="line"><span>  95 个请求 100ms</span></span>
<span class="line"><span>  5 个请求 5s</span></span>
<span class="line"><span></span></span>
<span class="line"><span>平均值:</span></span>
<span class="line"><span>  看起来可能还可以</span></span>
<span class="line"><span></span></span>
<span class="line"><span>用户体验:</span></span>
<span class="line"><span>  那 5 个请求的用户非常痛苦</span></span></code></pre></div><p>所以常见监控会看 P50、P95、P99:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>P50:</span></span>
<span class="line"><span>  一半请求比这个值快</span></span>
<span class="line"><span></span></span>
<span class="line"><span>P95:</span></span>
<span class="line"><span>  95% 请求比这个值快</span></span>
<span class="line"><span></span></span>
<span class="line"><span>P99:</span></span>
<span class="line"><span>  99% 请求比这个值快</span></span></code></pre></div><p>小团队不一定要一开始追求复杂性能分析,但至少要知道:平均值不能代表尾部用户体验。</p><hr><h2 id="三、常见套餐和使用限制" tabindex="-1">三、常见套餐和使用限制 <a class="header-anchor" href="#三、常见套餐和使用限制" aria-label="Permalink to &quot;三、常见套餐和使用限制&quot;">​</a></h2><h3 id="_3-1-云服务常限制的不是一个维度" tabindex="-1">3.1 云服务常限制的不是一个维度 <a class="header-anchor" href="#_3-1-云服务常限制的不是一个维度" aria-label="Permalink to &quot;3.1 云服务常限制的不是一个维度&quot;">​</a></h3><p>免费套餐或低价套餐常见限制包括:</p><ul><li>每秒请求数</li><li>每月请求数</li><li>最大并发函数数</li><li>单次函数执行时长</li><li>CPU 和内存规格</li><li>数据库最大连接数</li><li>数据库读写次数或计算单元</li><li>队列消息吞吐量</li><li>对象存储上传下载速率</li><li>出站流量</li><li>构建分钟和部署次数</li></ul><p>你只看&quot;请求数免费 100 万&quot;是不够的。真正出问题时,可能不是月请求数用完,而是某一小时并发太高,数据库连接数先爆了。</p><h3 id="_3-2-serverless-最容易被忽略的限制" tabindex="-1">3.2 Serverless 最容易被忽略的限制 <a class="header-anchor" href="#_3-2-serverless-最容易被忽略的限制" aria-label="Permalink to &quot;3.2 Serverless 最容易被忽略的限制&quot;">​</a></h3><p>Serverless 平台常见性能边界:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>冷启动:</span></span>
<span class="line"><span>  长时间没人访问后,第一次请求更慢</span></span>
<span class="line"><span></span></span>
<span class="line"><span>最大执行时间:</span></span>
<span class="line"><span>  超过时间直接中断或返回超时</span></span>
<span class="line"><span></span></span>
<span class="line"><span>并发限制:</span></span>
<span class="line"><span>  同时执行函数数量有限</span></span>
<span class="line"><span></span></span>
<span class="line"><span>出站连接:</span></span>
<span class="line"><span>  每个函数都连数据库,可能快速打满连接数</span></span>
<span class="line"><span></span></span>
<span class="line"><span>区域距离:</span></span>
<span class="line"><span>  函数离用户或数据库太远,延迟增加</span></span></code></pre></div><p>Serverless 很适合小团队起步,但不代表可以不理解性能限制。它只是把服务器管理隐藏了,没有把物理限制消除。</p><h3 id="_3-3-数据库连接数是小团队常见瓶颈" tabindex="-1">3.3 数据库连接数是小团队常见瓶颈 <a class="header-anchor" href="#_3-3-数据库连接数是小团队常见瓶颈" aria-label="Permalink to &quot;3.3 数据库连接数是小团队常见瓶颈&quot;">​</a></h3><p>很多早期项目真正先坏的不是 CPU,而是数据库连接:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错误做法:</span></span>
<span class="line"><span>  每个 API 请求新建一个数据库连接</span></span>
<span class="line"><span>  请求结束后没有及时释放</span></span>
<span class="line"><span>  Serverless 函数并发一高,连接数瞬间打满</span></span>
<span class="line"><span></span></span>
<span class="line"><span>结果:</span></span>
<span class="line"><span>  新请求排队</span></span>
<span class="line"><span>  登录超时</span></span>
<span class="line"><span>  保存失败</span></span>
<span class="line"><span>  API 返回 500 或 502</span></span></code></pre></div><p>免费数据库的连接数通常有限。升级套餐可以缓解,但代码里的连接复用、连接池、读写模式同样重要。</p><h3 id="_3-4-限流不一定是坏事" tabindex="-1">3.4 限流不一定是坏事 <a class="header-anchor" href="#_3-4-限流不一定是坏事" aria-label="Permalink to &quot;3.4 限流不一定是坏事&quot;">​</a></h3><p>限流看起来像限制,其实也是保护:</p><ul><li>防止单个用户刷爆系统</li><li>防止爬虫消耗资源</li><li>防止下游数据库被打穿</li><li>防止第三方 API 额度被瞬间用完</li><li>防止账单失控</li></ul><p>没有限流的小系统,在流量突增时可能不是慢一点,而是直接崩掉。</p><hr><h2 id="四、小团队建议" tabindex="-1">四、小团队建议 <a class="header-anchor" href="#四、小团队建议" aria-label="Permalink to &quot;四、小团队建议&quot;">​</a></h2><h3 id="_4-1-先监控核心路径的-p95-延迟" tabindex="-1">4.1 先监控核心路径的 P95 延迟 <a class="header-anchor" href="#_4-1-先监控核心路径的-p95-延迟" aria-label="Permalink to &quot;4.1 先监控核心路径的 P95 延迟&quot;">​</a></h3><p>不要一开始就做复杂压测平台。先问:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>用户最常做的 3 个动作是什么?</span></span>
<span class="line"><span>  打开首页?</span></span>
<span class="line"><span>  登录?</span></span>
<span class="line"><span>  搜索?</span></span>
<span class="line"><span>  创建订单?</span></span>
<span class="line"><span>  上传文件?</span></span>
<span class="line"><span></span></span>
<span class="line"><span>这些动作的 P95 延迟是多少?</span></span>
<span class="line"><span>错误率是多少?</span></span>
<span class="line"><span>高峰时是否明显变慢?</span></span></code></pre></div><p>如果核心路径 P95 延迟长期偏高,用户会觉得产品不稳定,即使服务没有彻底挂掉。</p><h3 id="_4-2-把-慢任务-移出请求链路" tabindex="-1">4.2 把&quot;慢任务&quot;移出请求链路 <a class="header-anchor" href="#_4-2-把-慢任务-移出请求链路" aria-label="Permalink to &quot;4.2 把&quot;慢任务&quot;移出请求链路&quot;">​</a></h3><p>很多性能问题来自把重活放在同步请求里:</p><ul><li>生成大报表</li><li>批量发送邮件</li><li>调用多个第三方 API</li><li>图片压缩和转码</li><li>AI 推理或长文本处理</li><li>大文件导入导出</li></ul><p>更稳的做法是:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>用户请求:</span></span>
<span class="line"><span>  快速接收任务</span></span>
<span class="line"><span>  返回任务已创建</span></span>
<span class="line"><span></span></span>
<span class="line"><span>后台队列:</span></span>
<span class="line"><span>  慢慢处理</span></span>
<span class="line"><span>  失败可重试</span></span>
<span class="line"><span></span></span>
<span class="line"><span>前端:</span></span>
<span class="line"><span>  轮询或通知用户结果</span></span></code></pre></div><p>这样可以降低接口延迟,也能避免单个请求超时。</p><h3 id="_4-3-不要只靠升级套餐解决性能问题" tabindex="-1">4.3 不要只靠升级套餐解决性能问题 <a class="header-anchor" href="#_4-3-不要只靠升级套餐解决性能问题" aria-label="Permalink to &quot;4.3 不要只靠升级套餐解决性能问题&quot;">​</a></h3><p>升级套餐有用,但不是万能。先确认瓶颈在哪里:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>CPU 满:</span></span>
<span class="line"><span>  可能需要更大实例或优化计算</span></span>
<span class="line"><span></span></span>
<span class="line"><span>内存满:</span></span>
<span class="line"><span>  可能有缓存过大或内存泄漏</span></span>
<span class="line"><span></span></span>
<span class="line"><span>数据库慢:</span></span>
<span class="line"><span>  可能缺索引、查询太重、连接池不合理</span></span>
<span class="line"><span></span></span>
<span class="line"><span>CDN 回源多:</span></span>
<span class="line"><span>  可能缓存策略不对</span></span>
<span class="line"><span></span></span>
<span class="line"><span>第三方 API 慢:</span></span>
<span class="line"><span>  可能需要异步化、缓存或降级</span></span>
<span class="line"><span></span></span>
<span class="line"><span>并发打满:</span></span>
<span class="line"><span>  可能需要限流、队列、连接池或扩容</span></span></code></pre></div><p>先定位,再花钱。否则你可能买了更贵的实例,瓶颈仍然在数据库或第三方服务。</p><h3 id="_4-4-给小项目的最低配置" tabindex="-1">4.4 给小项目的最低配置 <a class="header-anchor" href="#_4-4-给小项目的最低配置" aria-label="Permalink to &quot;4.4 给小项目的最低配置&quot;">​</a></h3><p>一个准备上线的小项目,至少应该知道:</p><ul><li>首页和核心 API 的 P95 延迟</li><li>高峰时每秒请求数大概是多少</li><li>数据库最大连接数和当前连接数</li><li>Serverless 函数最大执行时间和并发限制</li><li>哪些接口可能调用第三方服务</li><li>哪些任务应该异步处理</li><li>是否有基本限流和超时设置</li></ul><p>这些信息不需要你变成性能专家,但能让你在出问题时知道先看哪里。</p><hr><h2 id="五、一句话总结" tabindex="-1">五、一句话总结 <a class="header-anchor" href="#五、一句话总结" aria-label="Permalink to &quot;五、一句话总结&quot;">​</a></h2><p><strong>延迟回答&quot;一次请求等多久&quot;,吞吐量回答&quot;一段时间能处理多少&quot;,并发回答&quot;同一时刻扛多少&quot;;小团队先看核心路径 P95、数据库连接数和高峰并发,再决定优化代码还是升级套餐。</strong></p>`,78)])])}const b=s(e,[["render",i]]);export{u as __pageData,b as default};
