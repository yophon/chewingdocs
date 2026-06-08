import{c as a,Q as n,j as p,m as e}from"./chunks/framework.Bhbi9jCp.js";const b=JSON.parse('{"title":"线上事故:热修、强更、下架、签名异常与渠道污染","description":"","frontmatter":{},"headers":[],"relativePath":"mobileCommonLearning/23-线上事故热修强更下架签名异常与渠道污染.md","filePath":"mobileCommonLearning/23-线上事故热修强更下架签名异常与渠道污染.md","lastUpdated":1780912084000}'),t={name:"mobileCommonLearning/23-线上事故热修强更下架签名异常与渠道污染.md"};function l(i,s,c,d,o,h){return n(),p("div",null,[...s[0]||(s[0]=[e(`<h1 id="线上事故-热修、强更、下架、签名异常与渠道污染" tabindex="-1">线上事故:热修、强更、下架、签名异常与渠道污染 <a class="header-anchor" href="#线上事故-热修、强更、下架、签名异常与渠道污染" aria-label="Permalink to &quot;线上事故:热修、强更、下架、签名异常与渠道污染&quot;">​</a></h1><p>移动端事故和服务端事故不一样。服务端可以快速回滚,App 发出去以后会留在用户手机里很久。</p><p>一句话:<strong>移动端事故处理的核心是止损,不是幻想所有用户马上升级。</strong></p><hr><h2 id="一、先判断事故类型" tabindex="-1">一、先判断事故类型 <a class="header-anchor" href="#一、先判断事故类型" aria-label="Permalink to &quot;一、先判断事故类型&quot;">​</a></h2><p>常见移动端线上事故:</p><table tabindex="0"><thead><tr><th>类型</th><th>例子</th></tr></thead><tbody><tr><td>崩溃事故</td><td>新版本启动即崩</td></tr><tr><td>业务事故</td><td>登录、支付、下单失败</td></tr><tr><td>配置事故</td><td>生产包连测试环境</td></tr><tr><td>签名事故</td><td>包签名错误、无法覆盖安装</td></tr><tr><td>渠道事故</td><td>渠道包串包、渠道参数污染</td></tr><tr><td>合规事故</td><td>审核被拒、隐私投诉、下架</td></tr><tr><td>性能事故</td><td>启动慢、耗电、卡顿严重</td></tr><tr><td>推送事故</td><td>全量误推、token 大面积失效</td></tr><tr><td>深链事故</td><td>链接跳错页面或打不开</td></tr></tbody></table><p>第一步不是修代码,而是判断影响面。</p><hr><h2 id="二、事故分级" tabindex="-1">二、事故分级 <a class="header-anchor" href="#二、事故分级" aria-label="Permalink to &quot;二、事故分级&quot;">​</a></h2><p>可以按影响面分:</p><table tabindex="0"><thead><tr><th>级别</th><th>判断</th></tr></thead><tbody><tr><td>P0</td><td>App 大面积不可用、启动即崩、支付严重异常</td></tr><tr><td>P1</td><td>核心流程不可用,但有部分兜底</td></tr><tr><td>P2</td><td>部分功能异常,影响可控</td></tr><tr><td>P3</td><td>非核心问题或体验问题</td></tr></tbody></table><p>每次事故要明确:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>影响版本</span></span>
<span class="line"><span>影响平台</span></span>
<span class="line"><span>影响渠道</span></span>
<span class="line"><span>影响用户比例</span></span>
<span class="line"><span>是否影响交易或数据</span></span>
<span class="line"><span>是否可通过服务端止损</span></span></code></pre></div><p>没有影响面判断,就无法决定是否暂停发布、强更或下架。</p><hr><h2 id="三、第一优先级是止损" tabindex="-1">三、第一优先级是止损 <a class="header-anchor" href="#三、第一优先级是止损" aria-label="Permalink to &quot;三、第一优先级是止损&quot;">​</a></h2><p>常见止损手段:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>暂停灰度</span></span>
<span class="line"><span>关闭功能开关</span></span>
<span class="line"><span>服务端降级</span></span>
<span class="line"><span>回滚配置</span></span>
<span class="line"><span>屏蔽异常渠道包</span></span>
<span class="line"><span>停止推送</span></span>
<span class="line"><span>下架问题版本</span></span>
<span class="line"><span>强制升级</span></span>
<span class="line"><span>热更新修复</span></span>
<span class="line"><span>紧急提审新版本</span></span></code></pre></div><p>优先顺序:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>能服务端止损 -&gt; 先服务端</span></span>
<span class="line"><span>能配置止损 -&gt; 先配置</span></span>
<span class="line"><span>能热修 -&gt; 再热修</span></span>
<span class="line"><span>必须发版 -&gt; 紧急发版</span></span>
<span class="line"><span>无法止损 -&gt; 下架或强更</span></span></code></pre></div><p>不要先争论责任。先让影响不再扩大。</p><hr><h2 id="四、热修和热更新" tabindex="-1">四、热修和热更新 <a class="header-anchor" href="#四、热修和热更新" aria-label="Permalink to &quot;四、热修和热更新&quot;">​</a></h2><p>热修适合:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>文案错误</span></span>
<span class="line"><span>H5 页面问题</span></span>
<span class="line"><span>离线包资源错误</span></span>
<span class="line"><span>部分 JS / Dart 层逻辑</span></span>
<span class="line"><span>可通过远程配置关闭的功能</span></span></code></pre></div><p>不适合:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>原生崩溃</span></span>
<span class="line"><span>签名错误</span></span>
<span class="line"><span>权限声明错误</span></span>
<span class="line"><span>Bundle ID / applicationId 错误</span></span>
<span class="line"><span>证书和 entitlements 错误</span></span>
<span class="line"><span>审核政策问题</span></span>
<span class="line"><span>核心安全逻辑变更</span></span></code></pre></div><p>热更新必须有:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>灰度</span></span>
<span class="line"><span>校验</span></span>
<span class="line"><span>回滚</span></span>
<span class="line"><span>版本兼容</span></span>
<span class="line"><span>生效监控</span></span></code></pre></div><p>没有回滚的热修,本身可能制造第二次事故。</p><hr><h2 id="五、强更怎么设计" tabindex="-1">五、强更怎么设计 <a class="header-anchor" href="#五、强更怎么设计" aria-label="Permalink to &quot;五、强更怎么设计&quot;">​</a></h2><p>强更适合:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>旧版本存在严重安全问题</span></span>
<span class="line"><span>旧协议已无法服务</span></span>
<span class="line"><span>支付或登录链路必须升级</span></span>
<span class="line"><span>合规要求必须阻断旧版本</span></span>
<span class="line"><span>旧版本会造成数据损坏</span></span></code></pre></div><p>强更要避免:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>把所有小 bug 都强更</span></span>
<span class="line"><span>无商店包可下载时弹强更</span></span>
<span class="line"><span>国内渠道版本不一致导致无法升级</span></span>
<span class="line"><span>弱网下无法进入任何兜底页面</span></span>
<span class="line"><span>强更弹窗文案不说明原因</span></span></code></pre></div><p>强更配置至少包括:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>平台</span></span>
<span class="line"><span>版本范围</span></span>
<span class="line"><span>渠道范围</span></span>
<span class="line"><span>最低可用版本</span></span>
<span class="line"><span>下载地址</span></span>
<span class="line"><span>生效时间</span></span>
<span class="line"><span>灰度比例</span></span></code></pre></div><p>强更也是线上功能,要提前测试。</p><hr><h2 id="六、下架和暂停发布" tabindex="-1">六、下架和暂停发布 <a class="header-anchor" href="#六、下架和暂停发布" aria-label="Permalink to &quot;六、下架和暂停发布&quot;">​</a></h2><p>什么时候考虑下架:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>启动即崩且影响全量</span></span>
<span class="line"><span>严重合规或隐私问题</span></span>
<span class="line"><span>支付、资金、数据风险</span></span>
<span class="line"><span>错误包已进入商店且无法通过配置止损</span></span>
<span class="line"><span>签名或渠道污染导致错误用户安装</span></span></code></pre></div><p>下架不是删除用户手机里的 App。</p><p>下架只能阻止新下载或部分更新,已安装用户仍然需要:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>服务端降级</span></span>
<span class="line"><span>强更提示</span></span>
<span class="line"><span>配置屏蔽</span></span>
<span class="line"><span>紧急新版本</span></span>
<span class="line"><span>客服和公告</span></span></code></pre></div><p>不要把下架当成完整回滚。</p><hr><h2 id="七、签名异常" tabindex="-1">七、签名异常 <a class="header-anchor" href="#七、签名异常" aria-label="Permalink to &quot;七、签名异常&quot;">​</a></h2><p>Android 签名异常常见表现:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>无法覆盖安装</span></span>
<span class="line"><span>渠道后台识别为不同签名</span></span>
<span class="line"><span>第三方登录 / 支付 / 地图失败</span></span>
<span class="line"><span>Play App Signing 配置不一致</span></span>
<span class="line"><span>签名轮换后旧渠道不认</span></span></code></pre></div><p>iOS 签名异常常见表现:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Archive 成功但上传失败</span></span>
<span class="line"><span>entitlements 不匹配</span></span>
<span class="line"><span>推送环境不对</span></span>
<span class="line"><span>TestFlight 可用但 App Store 包异常</span></span>
<span class="line"><span>企业包过期</span></span></code></pre></div><p>处理原则:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>先确认问题包的真实签名</span></span>
<span class="line"><span>再比对渠道后台配置</span></span>
<span class="line"><span>再确认是否影响覆盖升级</span></span>
<span class="line"><span>最后决定重打包、补材料、联系渠道或紧急发版</span></span></code></pre></div><p>签名异常不要凭文件名判断,要用工具验签。</p><hr><h2 id="八、渠道污染" tabindex="-1">八、渠道污染 <a class="header-anchor" href="#八、渠道污染" aria-label="Permalink to &quot;八、渠道污染&quot;">​</a></h2><p>渠道污染包括:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>渠道号写错</span></span>
<span class="line"><span>A 渠道上传了 B 渠道包</span></span>
<span class="line"><span>测试包流入生产渠道</span></span>
<span class="line"><span>国内市场抓取了错误包</span></span>
<span class="line"><span>第三方下载站二次分发旧包</span></span>
<span class="line"><span>渠道统计参数互相覆盖</span></span></code></pre></div><p>预防:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>每个渠道产物独立命名</span></span>
<span class="line"><span>包内写入渠道元信息</span></span>
<span class="line"><span>上传前自动验包</span></span>
<span class="line"><span>渠道后台截图或记录留档</span></span>
<span class="line"><span>上线后按渠道监控安装和崩溃</span></span></code></pre></div><p>处理:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>暂停问题渠道</span></span>
<span class="line"><span>重新上传正确包</span></span>
<span class="line"><span>服务端识别并屏蔽污染渠道</span></span>
<span class="line"><span>通知渠道审核或替换</span></span>
<span class="line"><span>监控旧包存量</span></span></code></pre></div><p>国内多渠道项目必须把渠道治理当成发布系统的一部分。</p><hr><h2 id="九、事故沟通" tabindex="-1">九、事故沟通 <a class="header-anchor" href="#九、事故沟通" aria-label="Permalink to &quot;九、事故沟通&quot;">​</a></h2><p>事故期间要有固定信息:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>当前影响</span></span>
<span class="line"><span>已采取止损</span></span>
<span class="line"><span>下一步动作</span></span>
<span class="line"><span>预计时间</span></span>
<span class="line"><span>负责人</span></span>
<span class="line"><span>需要谁协助</span></span></code></pre></div><p>不要在群里滚动刷猜测。</p><p>对外口径要谨慎:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>不暴露内部密钥、证书、渠道后台细节</span></span>
<span class="line"><span>不承诺未经确认的恢复时间</span></span>
<span class="line"><span>涉及隐私和支付时走正式合规流程</span></span></code></pre></div><p>移动端事故经常跨研发、测试、产品、运营、客服、渠道和法务。</p><hr><h2 id="十、复盘要沉淀什么" tabindex="-1">十、复盘要沉淀什么 <a class="header-anchor" href="#十、复盘要沉淀什么" aria-label="Permalink to &quot;十、复盘要沉淀什么&quot;">​</a></h2><p>复盘至少写:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>事故时间线</span></span>
<span class="line"><span>影响版本和渠道</span></span>
<span class="line"><span>用户影响</span></span>
<span class="line"><span>根因</span></span>
<span class="line"><span>为什么测试没发现</span></span>
<span class="line"><span>为什么发布门禁没拦住</span></span>
<span class="line"><span>止损是否及时</span></span>
<span class="line"><span>后续防复发动作</span></span>
<span class="line"><span>负责人和截止时间</span></span></code></pre></div><p>复盘不要只写&quot;加强测试&quot;。</p><p>要变成:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>自动验签</span></span>
<span class="line"><span>发布前清单</span></span>
<span class="line"><span>CI 门禁</span></span>
<span class="line"><span>配置灰度</span></span>
<span class="line"><span>监控告警</span></span>
<span class="line"><span>应急预案</span></span></code></pre></div><p>没有机制变化的复盘没有意义。</p><hr><h2 id="十一、检查清单" tabindex="-1">十一、检查清单 <a class="header-anchor" href="#十一、检查清单" aria-label="Permalink to &quot;十一、检查清单&quot;">​</a></h2><ul><li>[ ] 是否能按版本、平台、渠道快速圈定影响面</li><li>[ ] 是否能暂停灰度或分阶段发布</li><li>[ ] 是否有服务端功能开关</li><li>[ ] 是否有强更配置能力</li><li>[ ] 是否能快速下架或暂停问题渠道</li><li>[ ] 是否能验证线上包签名</li><li>[ ] 是否保留每个渠道包的产物和 hash</li><li>[ ] 是否有热更新回滚能力</li><li>[ ] 是否有人发布后值守</li><li>[ ] 是否有事故复盘模板</li></ul><hr><h2 id="十二、结论" tabindex="-1">十二、结论 <a class="header-anchor" href="#十二、结论" aria-label="Permalink to &quot;十二、结论&quot;">​</a></h2><p>移动端事故处理顺序:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>定级</span></span>
<span class="line"><span>圈影响面</span></span>
<span class="line"><span>止损</span></span>
<span class="line"><span>修复</span></span>
<span class="line"><span>验证</span></span>
<span class="line"><span>恢复发布</span></span>
<span class="line"><span>复盘固化</span></span></code></pre></div><p>移动端最难的不是修一个 bug,而是处理已经散落在用户手机和渠道里的错误版本。</p>`,90)])])}const g=a(t,[["render",l]]);export{b as __pageData,g as default};
