import{c as s,Q as n,j as p,m as t}from"./chunks/framework.Bhbi9jCp.js";const b=JSON.parse('{"title":"崩溃、ANR、卡顿与日志采集","description":"","frontmatter":{},"headers":[],"relativePath":"mobileCommonLearning/18-崩溃ANR卡顿与日志采集.md","filePath":"mobileCommonLearning/18-崩溃ANR卡顿与日志采集.md","lastUpdated":1780912084000}'),e={name:"mobileCommonLearning/18-崩溃ANR卡顿与日志采集.md"};function l(i,a,d,c,o,r){return n(),p("div",null,[...a[0]||(a[0]=[t(`<h1 id="崩溃、anr、卡顿与日志采集" tabindex="-1">崩溃、ANR、卡顿与日志采集 <a class="header-anchor" href="#崩溃、anr、卡顿与日志采集" aria-label="Permalink to &quot;崩溃、ANR、卡顿与日志采集&quot;">​</a></h1><p>上线后不能只看&quot;我手机没问题&quot;。移动端质量要靠崩溃、ANR、卡顿、日志和用户路径一起判断。</p><p>一句话:<strong>没有监控的 App,线上问题只能靠用户投诉发现。</strong></p><hr><h2 id="一、先区分几类问题" tabindex="-1">一、先区分几类问题 <a class="header-anchor" href="#一、先区分几类问题" aria-label="Permalink to &quot;一、先区分几类问题&quot;">​</a></h2><table tabindex="0"><thead><tr><th>类型</th><th>说明</th></tr></thead><tbody><tr><td>崩溃</td><td>进程异常退出</td></tr><tr><td>ANR</td><td>Android 主线程长时间无响应</td></tr><tr><td>卡顿</td><td>页面掉帧、交互不流畅</td></tr><tr><td>OOM</td><td>内存不足导致进程被杀或崩溃</td></tr><tr><td>业务异常</td><td>接口失败、状态错误、流程中断</td></tr><tr><td>白屏</td><td>页面没有渲染出有效内容</td></tr></tbody></table><p>不要只接崩溃平台。很多线上问题不会崩,但用户已经无法使用。</p><hr><h2 id="二、崩溃采集要包含什么" tabindex="-1">二、崩溃采集要包含什么 <a class="header-anchor" href="#二、崩溃采集要包含什么" aria-label="Permalink to &quot;二、崩溃采集要包含什么&quot;">​</a></h2><p>一条有用的崩溃记录至少包含:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>异常类型</span></span>
<span class="line"><span>堆栈</span></span>
<span class="line"><span>线程</span></span>
<span class="line"><span>App 版本和 build 号</span></span>
<span class="line"><span>系统版本</span></span>
<span class="line"><span>设备型号</span></span>
<span class="line"><span>渠道</span></span>
<span class="line"><span>用户匿名 ID</span></span>
<span class="line"><span>页面路径</span></span>
<span class="line"><span>最近关键操作</span></span>
<span class="line"><span>网络状态</span></span>
<span class="line"><span>是否 root / 越狱</span></span></code></pre></div><p>没有版本和渠道,崩溃就很难定位。</p><p>没有用户路径,堆栈就只能说明代码在哪里炸,不能说明为什么炸。</p><hr><h2 id="三、符号表必须管理" tabindex="-1">三、符号表必须管理 <a class="header-anchor" href="#三、符号表必须管理" aria-label="Permalink to &quot;三、符号表必须管理&quot;">​</a></h2><p>release 包通常会混淆或符号化:</p><table tabindex="0"><thead><tr><th>平台</th><th>需要管理什么</th></tr></thead><tbody><tr><td>Android</td><td>mapping.txt、native symbols</td></tr><tr><td>iOS</td><td>dSYM</td></tr><tr><td>Flutter</td><td>split-debug-info 产物</td></tr><tr><td>RN</td><td>sourcemap</td></tr></tbody></table><p>规则:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>每个 release build 都要保留符号表</span></span>
<span class="line"><span>符号表和版本号 / build 号绑定</span></span>
<span class="line"><span>上传崩溃平台要自动化</span></span>
<span class="line"><span>不能只存在开发机本地</span></span></code></pre></div><p>没有符号表,线上堆栈会变成不可读乱码。</p><hr><h2 id="四、anr-怎么看" tabindex="-1">四、ANR 怎么看 <a class="header-anchor" href="#四、anr-怎么看" aria-label="Permalink to &quot;四、ANR 怎么看&quot;">​</a></h2><p>ANR 常见原因:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>主线程做 IO</span></span>
<span class="line"><span>主线程做数据库大查询</span></span>
<span class="line"><span>主线程等待锁</span></span>
<span class="line"><span>BroadcastReceiver 执行太久</span></span>
<span class="line"><span>Service 响应太慢</span></span>
<span class="line"><span>WebView 或图片加载阻塞主线程</span></span></code></pre></div><p>Android ANR 不是&quot;卡一下&quot;,而是系统认为你的进程没有及时响应。</p><p>排查顺序:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>看发生页面</span></span>
<span class="line"><span>看主线程栈</span></span>
<span class="line"><span>看锁等待</span></span>
<span class="line"><span>看同时期 CPU / IO / 内存</span></span>
<span class="line"><span>看是否集中在某设备或系统版本</span></span></code></pre></div><p>ANR 要按版本趋势看,不要只看单条堆栈。</p><hr><h2 id="五、卡顿和掉帧" tabindex="-1">五、卡顿和掉帧 <a class="header-anchor" href="#五、卡顿和掉帧" aria-label="Permalink to &quot;五、卡顿和掉帧&quot;">​</a></h2><p>用户感知的卡顿通常来自:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>页面首帧慢</span></span>
<span class="line"><span>列表滚动掉帧</span></span>
<span class="line"><span>图片解码太重</span></span>
<span class="line"><span>布局计算过多</span></span>
<span class="line"><span>主线程任务太长</span></span>
<span class="line"><span>动画和网络状态耦合</span></span>
<span class="line"><span>低端机压力未测试</span></span></code></pre></div><p>需要采集:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>页面打开耗时</span></span>
<span class="line"><span>首帧耗时</span></span>
<span class="line"><span>慢帧比例</span></span>
<span class="line"><span>冻结帧</span></span>
<span class="line"><span>主线程长任务</span></span>
<span class="line"><span>设备档位</span></span></code></pre></div><p>卡顿优化不能只拿旗舰机做结论。</p><hr><h2 id="六、日志采集要分级" tabindex="-1">六、日志采集要分级 <a class="header-anchor" href="#六、日志采集要分级" aria-label="Permalink to &quot;六、日志采集要分级&quot;">​</a></h2><p>日志级别:</p><table tabindex="0"><thead><tr><th>级别</th><th>用途</th></tr></thead><tbody><tr><td>debug</td><td>本地调试</td></tr><tr><td>info</td><td>关键状态变化</td></tr><tr><td>warn</td><td>可恢复异常</td></tr><tr><td>error</td><td>明确失败</td></tr><tr><td>fatal</td><td>导致不可用的问题</td></tr></tbody></table><p>线上日志要克制:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>只采关键链路</span></span>
<span class="line"><span>默认脱敏</span></span>
<span class="line"><span>支持按用户或会话临时提升等级</span></span>
<span class="line"><span>限制大小和上传频率</span></span>
<span class="line"><span>避免影响性能</span></span></code></pre></div><p>日志平台不是垃圾桶。采太多会增加成本、泄漏风险和排查噪音。</p><hr><h2 id="七、业务异常也要上报" tabindex="-1">七、业务异常也要上报 <a class="header-anchor" href="#七、业务异常也要上报" aria-label="Permalink to &quot;七、业务异常也要上报&quot;">​</a></h2><p>需要上报的业务异常:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>登录失败</span></span>
<span class="line"><span>支付失败</span></span>
<span class="line"><span>下单失败</span></span>
<span class="line"><span>推送 token 注册失败</span></span>
<span class="line"><span>深链解析失败</span></span>
<span class="line"><span>权限被拒绝</span></span>
<span class="line"><span>离线包加载失败</span></span>
<span class="line"><span>关键接口超时</span></span></code></pre></div><p>字段建议:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>业务错误码</span></span>
<span class="line"><span>接口 trace id</span></span>
<span class="line"><span>页面</span></span>
<span class="line"><span>App 版本</span></span>
<span class="line"><span>渠道</span></span>
<span class="line"><span>网络状态</span></span>
<span class="line"><span>是否重试成功</span></span></code></pre></div><p>不要把所有失败都当成崩溃。业务异常需要单独看漏斗。</p><hr><h2 id="八、监控指标怎么定" tabindex="-1">八、监控指标怎么定 <a class="header-anchor" href="#八、监控指标怎么定" aria-label="Permalink to &quot;八、监控指标怎么定&quot;">​</a></h2><p>常见质量指标:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>崩溃率</span></span>
<span class="line"><span>崩溃用户率</span></span>
<span class="line"><span>ANR 率</span></span>
<span class="line"><span>卡顿率</span></span>
<span class="line"><span>启动耗时 P50 / P90 / P99</span></span>
<span class="line"><span>页面打开耗时</span></span>
<span class="line"><span>接口成功率</span></span>
<span class="line"><span>白屏率</span></span>
<span class="line"><span>新版本问题占比</span></span></code></pre></div><p>优先看用户率:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>崩溃次数很多,可能是少量用户反复崩</span></span>
<span class="line"><span>崩溃用户率高,说明影响面更大</span></span></code></pre></div><p>版本发布后要看小时级趋势,不要等日报。</p><hr><h2 id="九、什么时候会出事故" tabindex="-1">九、什么时候会出事故 <a class="header-anchor" href="#九、什么时候会出事故" aria-label="Permalink to &quot;九、什么时候会出事故&quot;">​</a></h2><p>常见事故:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>release 包崩溃但没有上传 mapping / dSYM</span></span>
<span class="line"><span>崩溃平台只接入 Android,漏了 iOS</span></span>
<span class="line"><span>日志里带 token 和手机号</span></span>
<span class="line"><span>新版本崩溃率升高但无人值守</span></span>
<span class="line"><span>低端机列表卡顿导致差评</span></span>
<span class="line"><span>ANR 集中在某厂商系统但测试未覆盖</span></span>
<span class="line"><span>业务接口失败没有上报,只能靠客服反馈</span></span>
<span class="line"><span>崩溃采样过低漏掉核心问题</span></span></code></pre></div><p>监控不是上线后补的,必须进发布流程。</p><hr><h2 id="十、检查清单" tabindex="-1">十、检查清单 <a class="header-anchor" href="#十、检查清单" aria-label="Permalink to &quot;十、检查清单&quot;">​</a></h2><ul><li>[ ] Android / iOS 是否都接入崩溃采集</li><li>[ ] release 符号表是否自动上传</li><li>[ ] 崩溃是否绑定版本、渠道、设备、页面</li><li>[ ] ANR 是否单独监控</li><li>[ ] 启动、页面首帧、卡顿是否采集</li><li>[ ] 关键业务失败是否上报</li><li>[ ] 日志是否脱敏</li><li>[ ] release 是否关闭调试日志</li><li>[ ] 新版本发布后是否有人看小时级数据</li><li>[ ] 是否能按用户或 trace id 串联问题</li></ul><hr><h2 id="十一、结论" tabindex="-1">十一、结论 <a class="header-anchor" href="#十一、结论" aria-label="Permalink to &quot;十一、结论&quot;">​</a></h2><p>移动端质量监控最小闭环:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>采集 -&gt; 聚合 -&gt; 告警 -&gt; 定位 -&gt; 修复 -&gt; 验证 -&gt; 复盘</span></span></code></pre></div><p>只采集不告警,问题会静默扩大。</p><p>只告警不保留符号表,问题无法定位。</p><p>只看崩溃不看业务异常,用户仍然会卡在流程里。</p>`,71)])])}const u=s(e,[["render",l]]);export{b as __pageData,u as default};
