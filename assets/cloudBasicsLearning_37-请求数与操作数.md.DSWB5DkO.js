import{c as a,Q as n,j as p,m as l}from"./chunks/framework.Bhbi9jCp.js";const u=JSON.parse('{"title":"请求数与操作数:API 调用、Class A/B、读写次数怎么读","description":"","frontmatter":{},"headers":[],"relativePath":"cloudBasicsLearning/37-请求数与操作数.md","filePath":"cloudBasicsLearning/37-请求数与操作数.md","lastUpdated":1779015580000}'),e={name:"cloudBasicsLearning/37-请求数与操作数.md"};function i(t,s,c,o,d,r){return n(),p("div",null,[...s[0]||(s[0]=[l(`<h1 id="请求数与操作数-api-调用、class-a-b、读写次数怎么读" tabindex="-1">请求数与操作数:API 调用、Class A/B、读写次数怎么读 <a class="header-anchor" href="#请求数与操作数-api-调用、class-a-b、读写次数怎么读" aria-label="Permalink to &quot;请求数与操作数:API 调用、Class A/B、读写次数怎么读&quot;">​</a></h1><h2 id="一句话解释" tabindex="-1">一句话解释 <a class="header-anchor" href="#一句话解释" aria-label="Permalink to &quot;一句话解释&quot;">​</a></h2><p><strong>请求数和操作数,是云服务按&quot;发生了多少次动作&quot;来计费或限额的方式</strong>。</p><p>它最容易和&quot;用户数&quot;混淆。一个用户不是一个请求。一个用户打开页面,浏览器可能请求 HTML、CSS、JS、图片、字体、埋点接口、业务 API。一个业务动作也不是一个操作。用户上传一张图片,背后可能有获取上传凭证、PUT 文件、写数据库、生成缩略图、刷新缓存、写日志等多次操作。</p><p>在云产品文档里,它可能写成:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>requests</span></span>
<span class="line"><span>invocations</span></span>
<span class="line"><span>operations</span></span>
<span class="line"><span>API calls</span></span>
<span class="line"><span>read / write units</span></span>
<span class="line"><span>Class A / Class B operations</span></span>
<span class="line"><span>queries</span></span>
<span class="line"><span>events</span></span>
<span class="line"><span>messages</span></span></code></pre></div><p>这些词不完全一样,但共同点是:它们都在数&quot;动作发生的次数&quot;。对小团队来说,请求数和操作数的危险在于它们很容易被代码结构放大,而不是只由真实用户增长决定。</p><p>一句话先记住:<strong>用户量是业务指标,请求数和操作数是账单指标,两者中间隔着你的架构和代码实现</strong>。</p><h2 id="放在系统哪里" tabindex="-1">放在系统哪里 <a class="header-anchor" href="#放在系统哪里" aria-label="Permalink to &quot;放在系统哪里&quot;">​</a></h2><p>请求数和操作数分布在应用的多个层次:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>用户浏览器</span></span>
<span class="line"><span>  -&gt; 静态资源请求</span></span>
<span class="line"><span>  -&gt; API 请求</span></span>
<span class="line"><span>  -&gt; Serverless 函数调用</span></span>
<span class="line"><span>  -&gt; 数据库查询</span></span>
<span class="line"><span>  -&gt; 对象存储读写</span></span>
<span class="line"><span>  -&gt; 队列消息</span></span>
<span class="line"><span>  -&gt; 日志事件</span></span></code></pre></div><p>一个登录后的控制台页面,可能这样消耗请求:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>打开页面:</span></span>
<span class="line"><span>  1 次 HTML 请求</span></span>
<span class="line"><span>  多次 JS / CSS / 图片请求</span></span>
<span class="line"><span>  1 次获取当前用户</span></span>
<span class="line"><span>  1 次获取项目列表</span></span>
<span class="line"><span>  1 次获取通知数量</span></span>
<span class="line"><span>  1 次获取账单状态</span></span>
<span class="line"><span>  1 次埋点上报</span></span></code></pre></div><p>如果每个 API 又分别查询数据库、读缓存、写日志,底层操作数会继续增加。你在前端看到的是&quot;打开一次页面&quot;,云厂商看到的是&quot;几十次请求和操作&quot;。</p><p>对象存储里的 Class A / Class B 是一个典型例子。不同厂商命名不完全一样,但通常会把操作分成不同类别:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>写入类:PUT / POST / COPY / LIST / DELETE</span></span>
<span class="line"><span>读取类:GET / HEAD</span></span>
<span class="line"><span>管理类:生命周期、权限、元数据、清单</span></span></code></pre></div><p>有的文档把写入、列举这类相对重的操作归为一类,把读取对象或查询元数据归为另一类。你不需要背厂商命名,但要知道:存储服务不是只有容量收费,读写文件本身也可能按次数计费或限额。</p><h2 id="常见套餐和使用限制" tabindex="-1">常见套餐和使用限制 <a class="header-anchor" href="#常见套餐和使用限制" aria-label="Permalink to &quot;常见套餐和使用限制&quot;">​</a></h2><p>请求数和操作数常见限制可以分成几类。</p><p>第一类是 HTTP 请求数。CDN、静态托管、网关、WAF 都可能统计请求。一个页面资源越碎,请求数越多。HTTP/2 和 HTTP/3 可以改善连接效率,但不代表请求次数不算。</p><p>第二类是 API 调用次数。很多后端平台、BaaS、认证服务、邮件服务、支付服务、地图服务、AI 服务都会按 API call 计量。你要确认:</p><ul><li>成功和失败请求是否都计数.</li><li>4xx、5xx、超时、重试是否计数.</li><li>后台任务调用是否计数.</li><li>内部 webhook 是否计数.</li><li>SDK 自动刷新 token、轮询状态是否计数.</li></ul><p>第三类是 Serverless invocation。只要函数被触发,通常就会计一次调用,同时还可能按执行时间和内存计费。一次 HTTP 请求如果经过多个函数,就不是一次调用。</p><p>第四类是数据库读写。托管数据库可能限制连接数、存储和计算,也可能对读写单位、查询量、行读取、IO 或 serverless capacity 计量。最常见的问题是 N+1 查询:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>本来想显示 20 条记录</span></span>
<span class="line"><span>先查列表 1 次</span></span>
<span class="line"><span>再为每条记录查作者 20 次</span></span>
<span class="line"><span>再为每条记录查统计 20 次</span></span>
<span class="line"><span>合计 41 次查询</span></span></code></pre></div><p>用户只打开一个列表页,数据库却执行几十次查询。流量上来后,请求数、延迟和数据库压力都会一起涨。</p><p>第五类是对象存储操作数。常见动作包括:</p><ul><li>上传文件.</li><li>下载文件.</li><li>查询文件是否存在.</li><li>列举目录或前缀.</li><li>复制对象.</li><li>删除对象.</li><li>改元数据或权限.</li></ul><p>其中 LIST 很容易被忽略。对象存储不是传统文件系统,频繁列目录、全量扫描 bucket、后台任务反复检查文件状态,都可能制造大量操作。</p><p>第六类是队列、消息和事件。消息队列通常按发送、接收、删除、投递、事件数量计量。失败重试会放大操作数。如果一个任务失败后每分钟重试,一天就会产生大量无效操作。</p><p>第七类是日志和埋点事件。一次请求写 20 行日志,和一次请求写 2 行日志,在日志平台看来不是一个成本。debug 级别日志、请求体全量记录、前端埋点过密,都会把事件数推高。</p><p>查看请求数和操作数时,要重点找这些位置:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Usage:当前请求和操作用量</span></span>
<span class="line"><span>Metrics:按接口、状态码、路径、bucket、函数拆分</span></span>
<span class="line"><span>Billing details:哪些操作进入账单</span></span>
<span class="line"><span>Rate limits:每秒、每分钟、每日限制</span></span>
<span class="line"><span>Retries:失败重试是否自动发生</span></span>
<span class="line"><span>SDK docs:客户端是否有轮询、分页、批量接口</span></span></code></pre></div><p>只看总请求数不够。你需要知道哪个接口、哪个函数、哪个 bucket、哪个后台任务贡献最多。</p><h2 id="小团队建议" tabindex="-1">小团队建议 <a class="header-anchor" href="#小团队建议" aria-label="Permalink to &quot;小团队建议&quot;">​</a></h2><p>小团队控制请求数和操作数,关键是减少无意义动作,并把高频动作批量化、缓存化、限流化。</p><p>第一,画出一次核心用户动作的请求链路:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>用户点击保存</span></span>
<span class="line"><span>  -&gt; 前端 POST /api/save</span></span>
<span class="line"><span>  -&gt; 后端校验权限</span></span>
<span class="line"><span>  -&gt; 写数据库</span></span>
<span class="line"><span>  -&gt; 写对象存储</span></span>
<span class="line"><span>  -&gt; 发队列消息</span></span>
<span class="line"><span>  -&gt; 写日志</span></span>
<span class="line"><span>  -&gt; 返回结果</span></span></code></pre></div><p>然后问四个问题:</p><ul><li>哪些动作可以合并?</li><li>哪些数据可以缓存?</li><li>哪些失败会自动重试?</li><li>哪些操作对用户结果不是必须同步完成?</li></ul><p>第二,减少前端碎请求。常见做法包括:</p><ul><li>页面初始化接口聚合,不要一进页面打十几个小 API.</li><li>列表分页,不要一次加载全部数据.</li><li>搜索输入加 debounce,不要每个字符都请求.</li><li>轮询设置合理间隔,页面不可见时暂停.</li><li>静态配置和字典数据缓存到前端或 CDN.</li></ul><p>第三,使用批量接口。很多云服务和数据库都提供 batch 操作。一次写 100 条消息和 100 次单条写入,在延迟、请求数、失败处理上完全不同。当然批量也要有上限,避免单次请求太大或失败重试成本过高。</p><p>第四,控制重试。重试是必要的,但无限重试是账单和稳定性的敌人。后台任务、webhook、队列消费者要设置:</p><ul><li>最大重试次数.</li><li>指数退避.</li><li>死信队列或失败表.</li><li>幂等键,避免重复写入.</li><li>对不可恢复错误不要重试.</li></ul><p>第五,给公开 API 加速率限制。请求数异常增长时,不要等账单提醒才处理。登录、搜索、上传、下载、AI 调用、发送邮件这些接口都应该有基础限流。即使免费套餐提供很多请求数,也不应该把它当成公开无限资源。</p><p>第六,观察高频接口。每周看一次按路径、函数、状态码、bucket 操作类型拆分的请求统计。重点看:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>请求量最高的 10 个接口</span></span>
<span class="line"><span>失败率最高的 10 个接口</span></span>
<span class="line"><span>重试最多的后台任务</span></span>
<span class="line"><span>对象存储 LIST / PUT / GET 的比例</span></span>
<span class="line"><span>日志事件量最高的服务</span></span></code></pre></div><p>如果一个接口请求量很高但业务价值低,先优化它。成本优化不是全站平均用力,而是找到最会放大的那几个动作。</p><p>一个保守原则是:<strong>任何自动发生的请求,比如轮询、重试、埋点、同步任务,都必须有频率上限和停止条件</strong>。</p><h2 id="一句话总结" tabindex="-1">一句话总结 <a class="header-anchor" href="#一句话总结" aria-label="Permalink to &quot;一句话总结&quot;">​</a></h2><p><strong>请求数和操作数不是用户数的简单映射,而是由页面资源、API 设计、数据库查询、对象存储读写、重试和日志共同放大的计费维度</strong>。</p>`,52)])])}const g=a(e,[["render",i]]);export{u as __pageData,g as default};
