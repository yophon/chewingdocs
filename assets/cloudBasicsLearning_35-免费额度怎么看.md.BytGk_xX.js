import{c as a,Q as n,j as p,m as e}from"./chunks/framework.CBiVa4O3.js";const u=JSON.parse('{"title":"免费额度怎么看:请求数、存储量、出站流量、构建分钟分别在限制什么","description":"","frontmatter":{},"headers":[],"relativePath":"../cloudBasicsLearning/35-免费额度怎么看.md","filePath":"../cloudBasicsLearning/35-免费额度怎么看.md","lastUpdated":1779015580000}'),l={name:"../cloudBasicsLearning/35-免费额度怎么看.md"};function i(t,s,c,o,d,h){return n(),p("div",null,[...s[0]||(s[0]=[e(`<h1 id="免费额度怎么看-请求数、存储量、出站流量、构建分钟分别在限制什么" tabindex="-1">免费额度怎么看:请求数、存储量、出站流量、构建分钟分别在限制什么 <a class="header-anchor" href="#免费额度怎么看-请求数、存储量、出站流量、构建分钟分别在限制什么" aria-label="Permalink to &quot;免费额度怎么看:请求数、存储量、出站流量、构建分钟分别在限制什么&quot;">​</a></h1><h2 id="一句话解释" tabindex="-1">一句话解释 <a class="header-anchor" href="#一句话解释" aria-label="Permalink to &quot;一句话解释&quot;">​</a></h2><p><strong>免费额度不是&quot;这个服务免费&quot;,而是厂商允许你在一组资源维度内免费使用,超过边界后会限速、暂停、要求升级或开始计费</strong>。</p><p>它最容易和&quot;免费套餐&quot;混淆。免费套餐是一个产品档位,免费额度是这个档位里每个资源的限制。一个平台可以写着免费,但它的免费可能被拆成很多小格子:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>每月请求数</span></span>
<span class="line"><span>每月出站流量</span></span>
<span class="line"><span>存储容量</span></span>
<span class="line"><span>构建分钟</span></span>
<span class="line"><span>函数调用次数</span></span>
<span class="line"><span>函数运行时间</span></span>
<span class="line"><span>数据库连接数</span></span>
<span class="line"><span>日志保留时间</span></span>
<span class="line"><span>团队成员数量</span></span>
<span class="line"><span>项目数量</span></span></code></pre></div><p>任何一个格子用完,你的体验都会变化。可能只是收到提醒,也可能功能变慢,也可能构建失败,也可能直接产生账单。真正要看懂的不是&quot;免费几个字&quot;,而是&quot;哪些东西免费,免费到哪里,超过后怎样&quot;。</p><p>一句话先记住:<strong>免费额度要按维度逐项看,不要按产品整体理解</strong>。</p><h2 id="放在系统哪里" tabindex="-1">放在系统哪里 <a class="header-anchor" href="#放在系统哪里" aria-label="Permalink to &quot;放在系统哪里&quot;">​</a></h2><p>免费额度覆盖的是应用运行的整条链路:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>开发者 push 代码</span></span>
<span class="line"><span>  -&gt; 平台构建</span></span>
<span class="line"><span>  -&gt; 部署静态文件或函数</span></span>
<span class="line"><span>  -&gt; 用户访问页面</span></span>
<span class="line"><span>  -&gt; CDN 返回资源</span></span>
<span class="line"><span>  -&gt; API 处理请求</span></span>
<span class="line"><span>  -&gt; 数据库读写</span></span>
<span class="line"><span>  -&gt; 对象存储上传下载</span></span>
<span class="line"><span>  -&gt; 日志和监控记录事件</span></span></code></pre></div><p>所以一个小项目即使没有很多用户,也可能先撞到免费额度:</p><ul><li>频繁 push 代码,先撞到构建分钟.</li><li>图片没有压缩,先撞到出站流量.</li><li>API 设计太碎,先撞到请求数.</li><li>数据库连接没有复用,先撞到连接数.</li><li>日志打印过多,先撞到日志写入或保留限制.</li><li>预览环境太多,先撞到项目数、部署数或构建并发.</li></ul><p>以一个独立开发的工具站为例:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>首页静态文件:消耗 CDN 流量</span></span>
<span class="line"><span>搜索接口:消耗 Serverless 调用和数据库读请求</span></span>
<span class="line"><span>用户上传图片:消耗对象存储 PUT、存储量和后续下载流量</span></span>
<span class="line"><span>每次提交代码:消耗构建分钟</span></span>
<span class="line"><span>每次报错:写入日志平台</span></span></code></pre></div><p>用户只看到一个页面,账单和额度系统看到的是一串资源消耗。免费额度的本质,就是给这串资源消耗分别划线。</p><h2 id="常见套餐和使用限制" tabindex="-1">常见套餐和使用限制 <a class="header-anchor" href="#常见套餐和使用限制" aria-label="Permalink to &quot;常见套餐和使用限制&quot;">​</a></h2><p>看免费额度时,不要从价格开始,从限制项开始。常见限制可以分成七组。</p><p>第一组是流量类限制:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>出站流量:用户从平台下载页面、图片、文件、API 响应</span></span>
<span class="line"><span>带宽峰值:同一时间最多能传多少数据</span></span>
<span class="line"><span>CDN 流量:边缘节点返回给用户的数据</span></span>
<span class="line"><span>回源流量:CDN 没命中时从源站拉取的数据</span></span></code></pre></div><p>流量类最容易超预算,因为它会被图片、视频、下载文件、爬虫、热链放大。查看时要找 bandwidth、data transfer、egress、traffic 这些词。特别注意&quot;入站免费,出站收费&quot;很常见,上传文件不贵,大量下载文件才贵。</p><p>第二组是请求类限制:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>HTTP 请求数</span></span>
<span class="line"><span>API 调用次数</span></span>
<span class="line"><span>对象存储 GET / PUT / LIST</span></span>
<span class="line"><span>数据库读写次数</span></span>
<span class="line"><span>边缘函数调用次数</span></span></code></pre></div><p>请求类限制和用户数不是一回事。一个用户打开一个页面,可能触发几十个静态资源请求和多次 API 调用。前端轮询、失败重试、瀑布流加载、搜索建议、埋点上报,都会放大请求数。</p><p>第三组是计算类限制:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Serverless 调用次数</span></span>
<span class="line"><span>执行时间</span></span>
<span class="line"><span>分配内存</span></span>
<span class="line"><span>CPU 时间</span></span>
<span class="line"><span>并发数</span></span>
<span class="line"><span>最大运行时长</span></span>
<span class="line"><span>冷启动和超时限制</span></span></code></pre></div><p>计算类限制决定动态逻辑能跑多久、能跑多少次、能承受多少并发。免费套餐常见风险是:低流量时一切正常,高峰时函数排队、超时或被限流。</p><p>第四组是存储类限制:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>对象存储容量</span></span>
<span class="line"><span>数据库容量</span></span>
<span class="line"><span>文件数量</span></span>
<span class="line"><span>备份容量</span></span>
<span class="line"><span>快照数量</span></span>
<span class="line"><span>日志存储量</span></span></code></pre></div><p>存储类限制不仅看容量,还要看访问方式。对象存储里放 10 GB 冷门备份和放 10 GB 热门图片,成本结构完全不同。前者主要是存储费,后者还有大量读取请求和出站流量。</p><p>第五组是构建和部署类限制:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>构建分钟</span></span>
<span class="line"><span>构建次数</span></span>
<span class="line"><span>并发构建数</span></span>
<span class="line"><span>预览部署数量</span></span>
<span class="line"><span>部署保留数量</span></span>
<span class="line"><span>缓存容量</span></span></code></pre></div><p>这类限制经常被忽略,因为它发生在开发阶段,不是用户访问阶段。小团队如果有多分支预览、自动测试、频繁提交,构建额度可能比流量额度更早用完。</p><p>第六组是协作和治理类限制:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>团队成员数</span></span>
<span class="line"><span>项目数量</span></span>
<span class="line"><span>权限角色</span></span>
<span class="line"><span>审计日志</span></span>
<span class="line"><span>SSO</span></span>
<span class="line"><span>环境变量管理</span></span>
<span class="line"><span>访问控制</span></span></code></pre></div><p>很多平台对个人项目很慷慨,但团队协作会触发付费。这不是技术瓶颈,是组织能力限制。小团队要提前确认:第二个成员加入、客户要求审计日志、生产环境需要权限隔离时,是否必须升级。</p><p>第七组是可观测性类限制:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>日志保留时间</span></span>
<span class="line"><span>日志查询量</span></span>
<span class="line"><span>指标保留时间</span></span>
<span class="line"><span>告警规则数量</span></span>
<span class="line"><span>通知渠道</span></span>
<span class="line"><span>错误追踪事件数</span></span></code></pre></div><p>免费套餐常常让你能上线,但不一定让你在事故后看清发生了什么。日志只保留很短时间时,周末出的问题可能周一已经查不到完整上下文。</p><p>查看免费额度时,建议按这个顺序:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. Pricing 页面:看主套餐和免费档位</span></span>
<span class="line"><span>2. Limits / Quotas 页面:看硬限制</span></span>
<span class="line"><span>3. Billing FAQ:看超额怎么处理</span></span>
<span class="line"><span>4. Usage 面板:看当前用量按什么维度统计</span></span>
<span class="line"><span>5. Terms / Fair use:看是否有公平使用或滥用限制</span></span>
<span class="line"><span>6. Upgrade 页面:看升级后哪些限制解除,哪些仍然按量收费</span></span></code></pre></div><p>不要只截图套餐对比表。真正关键的超额规则,经常写在脚注、FAQ、限制文档和账单说明里。</p><h2 id="小团队建议" tabindex="-1">小团队建议 <a class="header-anchor" href="#小团队建议" aria-label="Permalink to &quot;小团队建议&quot;">​</a></h2><p>小团队使用免费额度,要把它当成验证阶段的资源预算,不是生产系统的永久承诺。</p><p>第一,为每个项目做一张额度清单:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>平台:</span></span>
<span class="line"><span>用途:</span></span>
<span class="line"><span>免费维度:</span></span>
<span class="line"><span>当前用量:</span></span>
<span class="line"><span>接近上限时提醒方式:</span></span>
<span class="line"><span>超额后行为:</span></span>
<span class="line"><span>升级成本查看入口:</span></span>
<span class="line"><span>替代方案:</span></span></code></pre></div><p>这张表不需要复杂,但必须能在流量上涨时快速回答&quot;先超哪一项&quot;。</p><p>第二,区分软限制和硬限制:</p><ul><li>软限制:超过后继续运行,但开始计费或降速.</li><li>硬限制:超过后请求失败、构建失败、写入失败或服务暂停.</li><li>人工审核限制:超过某个阈值后需要申请提高配额.</li><li>公平使用限制:文档不写具体数字,但异常用量可能被限制.</li></ul><p>对生产项目来说,硬限制比费用更危险。账单高还能处理,数据库写入失败、构建无法发布、函数全部超时会直接影响用户。</p><p>第三,不要把所有环境放进同一个免费额度里。开发环境、预览环境、测试脚本、压测脚本、生产环境如果共用一个免费额度,很容易被内部操作耗尽。至少要给生产环境单独看用量,重要资源最好单独项目或单独账号管理。</p><p>第四,给公开入口加保护:</p><ul><li>静态资源使用 CDN 缓存.</li><li>API 加基础限流.</li><li>上传限制文件大小和类型.</li><li>搜索、登录、验证码接口防刷.</li><li>大文件下载尽量使用签名 URL 和过期时间.</li><li>后台任务要有最大重试次数.</li></ul><p>第五,每月固定看一次 usage 面板和账单明细。免费额度不是设置一次就结束,产品功能变化会改变资源消耗。例如加了图片上传、全文搜索、AI 接口、邮件通知、埋点日志后,原来的免费边界可能立刻失效。</p><p>一个保守原则是:<strong>免费额度适合验证需求,不适合替代成本管理</strong>。只要项目开始有真实用户,就应该设置预算告警、用量告警和超额处理预案。</p><h2 id="一句话总结" tabindex="-1">一句话总结 <a class="header-anchor" href="#一句话总结" aria-label="Permalink to &quot;一句话总结&quot;">​</a></h2><p><strong>看免费额度时,不要问这个服务是不是免费,要问请求、流量、存储、计算、构建、日志和团队协作分别免费到哪里,超过后会发生什么</strong>。</p>`,56)])])}const g=a(l,[["render",i]]);export{u as __pageData,g as default};
