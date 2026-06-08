import{c as a,Q as n,j as p,m as e}from"./chunks/framework.Bhbi9jCp.js";const b=JSON.parse('{"title":"移动端性能指标:启动、包体积、内存、电量、帧率","description":"","frontmatter":{},"headers":[],"relativePath":"mobileCommonLearning/19-移动端性能指标启动包体积内存电量帧率.md","filePath":"mobileCommonLearning/19-移动端性能指标启动包体积内存电量帧率.md","lastUpdated":1780912084000}'),l={name:"mobileCommonLearning/19-移动端性能指标启动包体积内存电量帧率.md"};function t(i,s,c,d,o,h){return n(),p("div",null,[...s[0]||(s[0]=[e(`<h1 id="移动端性能指标-启动、包体积、内存、电量、帧率" tabindex="-1">移动端性能指标:启动、包体积、内存、电量、帧率 <a class="header-anchor" href="#移动端性能指标-启动、包体积、内存、电量、帧率" aria-label="Permalink to &quot;移动端性能指标:启动、包体积、内存、电量、帧率&quot;">​</a></h1><p>移动端性能不是一个指标。启动慢、包太大、内存高、耗电、掉帧,都会直接影响留存和评分。</p><p>一句话:<strong>性能优化先定义指标,再定位瓶颈,最后验证收益。</strong></p><hr><h2 id="一、先定核心指标" tabindex="-1">一、先定核心指标 <a class="header-anchor" href="#一、先定核心指标" aria-label="Permalink to &quot;一、先定核心指标&quot;">​</a></h2><p>常见移动端性能指标:</p><table tabindex="0"><thead><tr><th>指标</th><th>看什么</th></tr></thead><tbody><tr><td>冷启动</td><td>用户点图标到首个可用页面</td></tr><tr><td>热启动</td><td>App 从后台回前台</td></tr><tr><td>首帧</td><td>页面首次有效渲染</td></tr><tr><td>包体积</td><td>安装包、下载包、安装后体积</td></tr><tr><td>内存</td><td>Java/Kotlin、Native、图片、WebView、Dart/JS</td></tr><tr><td>帧率</td><td>滚动、动画、转场流畅度</td></tr><tr><td>电量</td><td>CPU、定位、网络、传感器、后台任务</td></tr><tr><td>网络流量</td><td>首屏请求量、图片体积、重复请求</td></tr></tbody></table><p>不要用一个&quot;感觉流畅&quot;替代指标。</p><hr><h2 id="二、启动性能" tabindex="-1">二、启动性能 <a class="header-anchor" href="#二、启动性能" aria-label="Permalink to &quot;二、启动性能&quot;">​</a></h2><p>启动分几段:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>进程创建</span></span>
<span class="line"><span>Application / AppDelegate 初始化</span></span>
<span class="line"><span>依赖注入和 SDK 初始化</span></span>
<span class="line"><span>读取本地配置</span></span>
<span class="line"><span>首个页面创建</span></span>
<span class="line"><span>首屏接口和资源加载</span></span>
<span class="line"><span>首帧渲染</span></span></code></pre></div><p>常见问题:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>启动时初始化所有 SDK</span></span>
<span class="line"><span>启动时同步读大文件</span></span>
<span class="line"><span>启动时做数据库迁移</span></span>
<span class="line"><span>启动时等待网络接口</span></span>
<span class="line"><span>启动页广告和首页逻辑耦合</span></span></code></pre></div><p>优化原则:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>能延迟就延迟</span></span>
<span class="line"><span>能并行就并行</span></span>
<span class="line"><span>能缓存就缓存</span></span>
<span class="line"><span>首屏只做必要工作</span></span>
<span class="line"><span>初始化按业务分层</span></span></code></pre></div><p>启动指标要区分冷启动、热启动和首次安装启动。</p><hr><h2 id="三、包体积" tabindex="-1">三、包体积 <a class="header-anchor" href="#三、包体积" aria-label="Permalink to &quot;三、包体积&quot;">​</a></h2><p>包体积要分:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>上传包体积</span></span>
<span class="line"><span>用户下载体积</span></span>
<span class="line"><span>安装后体积</span></span>
<span class="line"><span>首次启动新增下载体积</span></span></code></pre></div><p>常见体积来源:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>图片资源</span></span>
<span class="line"><span>字体</span></span>
<span class="line"><span>多语言</span></span>
<span class="line"><span>so / framework</span></span>
<span class="line"><span>调试符号</span></span>
<span class="line"><span>重复依赖</span></span>
<span class="line"><span>WebView 离线包</span></span>
<span class="line"><span>Flutter / RN 运行时</span></span></code></pre></div><p>优化手段:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>资源压缩</span></span>
<span class="line"><span>删除未使用资源</span></span>
<span class="line"><span>按架构拆分</span></span>
<span class="line"><span>动态资源下发</span></span>
<span class="line"><span>图片格式优化</span></span>
<span class="line"><span>字体子集化</span></span>
<span class="line"><span>依赖审计</span></span></code></pre></div><p>不要只看安装包。首次打开再下载 200 MB 资源,用户体验一样差。</p><hr><h2 id="四、内存" tabindex="-1">四、内存 <a class="header-anchor" href="#四、内存" aria-label="Permalink to &quot;四、内存&quot;">​</a></h2><p>移动端内存问题常见来源:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>大图未压缩直接加载</span></span>
<span class="line"><span>列表缓存过多</span></span>
<span class="line"><span>页面引用没释放</span></span>
<span class="line"><span>WebView 长期持有</span></span>
<span class="line"><span>数据库游标未关闭</span></span>
<span class="line"><span>音视频资源未释放</span></span>
<span class="line"><span>Native 内存泄漏</span></span>
<span class="line"><span>跨端运行时对象膨胀</span></span></code></pre></div><p>重点观察:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>页面进入前后内存差</span></span>
<span class="line"><span>返回后是否回落</span></span>
<span class="line"><span>连续使用 10 分钟是否上涨</span></span>
<span class="line"><span>低端机是否 OOM</span></span>
<span class="line"><span>后台回来是否被系统杀</span></span></code></pre></div><p>内存优化不能只看单页面峰值,还要看长期使用趋势。</p><hr><h2 id="五、帧率和卡顿" tabindex="-1">五、帧率和卡顿 <a class="header-anchor" href="#五、帧率和卡顿" aria-label="Permalink to &quot;五、帧率和卡顿&quot;">​</a></h2><p>用户对卡顿最敏感的地方:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>启动到首页</span></span>
<span class="line"><span>列表滚动</span></span>
<span class="line"><span>页面转场</span></span>
<span class="line"><span>输入框输入</span></span>
<span class="line"><span>图片密集页面</span></span>
<span class="line"><span>地图和视频页面</span></span>
<span class="line"><span>弹窗出现</span></span></code></pre></div><p>常见原因:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>主线程任务过长</span></span>
<span class="line"><span>布局层级复杂</span></span>
<span class="line"><span>图片解码在主线程</span></span>
<span class="line"><span>频繁 setState / recomposition</span></span>
<span class="line"><span>列表 item 重建过多</span></span>
<span class="line"><span>动画期间发起重活</span></span>
<span class="line"><span>低端机 GPU 压力大</span></span></code></pre></div><p>优化规则:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>主线程只做 UI</span></span>
<span class="line"><span>列表 item 稳定复用</span></span>
<span class="line"><span>图片按展示尺寸加载</span></span>
<span class="line"><span>动画和重计算解耦</span></span>
<span class="line"><span>重活放后台线程</span></span></code></pre></div><p>帧率要在真实设备上测,模拟器不够。</p><hr><h2 id="六、电量" tabindex="-1">六、电量 <a class="header-anchor" href="#六、电量" aria-label="Permalink to &quot;六、电量&quot;">​</a></h2><p>耗电通常来自:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>频繁定位</span></span>
<span class="line"><span>后台任务</span></span>
<span class="line"><span>长连接保活</span></span>
<span class="line"><span>高频轮询</span></span>
<span class="line"><span>音视频采集</span></span>
<span class="line"><span>蓝牙扫描</span></span>
<span class="line"><span>大量唤醒 CPU</span></span>
<span class="line"><span>网络小包频繁发送</span></span></code></pre></div><p>优化方向:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>降低采样频率</span></span>
<span class="line"><span>合并网络请求</span></span>
<span class="line"><span>使用系统任务调度</span></span>
<span class="line"><span>前后台切换时降级</span></span>
<span class="line"><span>弱网下减少重试风暴</span></span>
<span class="line"><span>用户不可见时停止动画和采集</span></span></code></pre></div><p>电量问题最容易被忽略,但用户感知很直接。</p><hr><h2 id="七、网络性能" tabindex="-1">七、网络性能 <a class="header-anchor" href="#七、网络性能" aria-label="Permalink to &quot;七、网络性能&quot;">​</a></h2><p>首屏网络要看:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>请求数量</span></span>
<span class="line"><span>请求串行深度</span></span>
<span class="line"><span>DNS / TLS / 首包耗时</span></span>
<span class="line"><span>接口 P90 / P99</span></span>
<span class="line"><span>图片和静态资源大小</span></span>
<span class="line"><span>失败重试次数</span></span></code></pre></div><p>优化规则:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>首屏接口合并或预取</span></span>
<span class="line"><span>缓存稳定配置</span></span>
<span class="line"><span>图片按需加载</span></span>
<span class="line"><span>弱网下降级</span></span>
<span class="line"><span>避免无上限重试</span></span>
<span class="line"><span>统一超时策略</span></span></code></pre></div><p>网络慢不只是后端问题。客户端请求编排也会拖慢页面。</p><hr><h2 id="八、性能测试要覆盖设备档位" tabindex="-1">八、性能测试要覆盖设备档位 <a class="header-anchor" href="#八、性能测试要覆盖设备档位" aria-label="Permalink to &quot;八、性能测试要覆盖设备档位&quot;">​</a></h2><p>至少覆盖:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>旗舰机</span></span>
<span class="line"><span>中端机</span></span>
<span class="line"><span>低端机</span></span>
<span class="line"><span>旧系统版本</span></span>
<span class="line"><span>弱网</span></span>
<span class="line"><span>低电量模式</span></span>
<span class="line"><span>后台切回前台</span></span>
<span class="line"><span>连续使用</span></span></code></pre></div><p>线上指标要按维度拆:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>版本</span></span>
<span class="line"><span>渠道</span></span>
<span class="line"><span>设备型号</span></span>
<span class="line"><span>系统版本</span></span>
<span class="line"><span>网络类型</span></span>
<span class="line"><span>地区</span></span>
<span class="line"><span>新老用户</span></span></code></pre></div><p>平均值没有太大意义。P90 / P99 更接近真实问题。</p><hr><h2 id="九、什么时候会出事故" tabindex="-1">九、什么时候会出事故 <a class="header-anchor" href="#九、什么时候会出事故" aria-label="Permalink to &quot;九、什么时候会出事故&quot;">​</a></h2><p>常见事故:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>新版本集成 SDK 后冷启动慢 2 秒</span></span>
<span class="line"><span>图片资源未压缩导致包体积暴涨</span></span>
<span class="line"><span>低端 Android 频繁 OOM</span></span>
<span class="line"><span>首页接口串行导致弱网白屏</span></span>
<span class="line"><span>后台定位耗电被用户投诉</span></span>
<span class="line"><span>列表滚动在老机型严重掉帧</span></span>
<span class="line"><span>WebView 泄漏导致长时间使用后崩溃</span></span>
<span class="line"><span>热更新离线包过大导致首次启动很慢</span></span></code></pre></div><p>性能事故通常不是单点 bug,而是多个小成本叠加。</p><hr><h2 id="十、检查清单" tabindex="-1">十、检查清单 <a class="header-anchor" href="#十、检查清单" aria-label="Permalink to &quot;十、检查清单&quot;">​</a></h2><ul><li>[ ] 是否定义冷启动、热启动、首帧口径</li><li>[ ] 是否采集 P50 / P90 / P99</li><li>[ ] 是否按版本、渠道、设备拆分性能数据</li><li>[ ] 启动阶段是否延迟非必要 SDK</li><li>[ ] 包体积是否有每版对比</li><li>[ ] 图片、字体、so 是否做体积审计</li><li>[ ] 低端机是否测过列表、图片、WebView</li><li>[ ] 后台定位、轮询、长连接是否评估耗电</li><li>[ ] 弱网下是否避免重试风暴</li><li>[ ] 性能回归是否能阻断发布</li></ul><hr><h2 id="十一、结论" tabindex="-1">十一、结论 <a class="header-anchor" href="#十一、结论" aria-label="Permalink to &quot;十一、结论&quot;">​</a></h2><p>性能优化顺序:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>先量化</span></span>
<span class="line"><span>再定位</span></span>
<span class="line"><span>再优化</span></span>
<span class="line"><span>再对比</span></span>
<span class="line"><span>最后固化到发布门禁</span></span></code></pre></div><p>没有指标,优化只是在猜。</p><p>没有门禁,优化成果会在下个版本被重新破坏。</p>`,77)])])}const u=a(l,[["render",t]]);export{b as __pageData,u as default};
