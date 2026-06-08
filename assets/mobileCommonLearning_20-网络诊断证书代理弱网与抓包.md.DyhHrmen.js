import{c as s,Q as n,j as p,m as e}from"./chunks/framework.Bhbi9jCp.js";const u=JSON.parse('{"title":"网络诊断、证书、代理、弱网与抓包","description":"","frontmatter":{},"headers":[],"relativePath":"mobileCommonLearning/20-网络诊断证书代理弱网与抓包.md","filePath":"mobileCommonLearning/20-网络诊断证书代理弱网与抓包.md","lastUpdated":1780912084000}'),t={name:"mobileCommonLearning/20-网络诊断证书代理弱网与抓包.md"};function l(i,a,c,d,o,h){return n(),p("div",null,[...a[0]||(a[0]=[e(`<h1 id="网络诊断、证书、代理、弱网与抓包" tabindex="-1">网络诊断、证书、代理、弱网与抓包 <a class="header-anchor" href="#网络诊断、证书、代理、弱网与抓包" aria-label="Permalink to &quot;网络诊断、证书、代理、弱网与抓包&quot;">​</a></h1><p>移动端网络问题经常表现成&quot;接口失败&quot;,但根因可能在 DNS、TLS、代理、弱网、证书、网关、系统权限或客户端重试策略。</p><p>一句话:<strong>网络诊断要分层,不要一上来就说后端挂了。</strong></p><hr><h2 id="一、移动端网络链路" tabindex="-1">一、移动端网络链路 <a class="header-anchor" href="#一、移动端网络链路" aria-label="Permalink to &quot;一、移动端网络链路&quot;">​</a></h2><p>一次请求大致经过:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>业务代码</span></span>
<span class="line"><span>  -&gt; HTTP 客户端</span></span>
<span class="line"><span>  -&gt; DNS</span></span>
<span class="line"><span>  -&gt; TCP / QUIC</span></span>
<span class="line"><span>  -&gt; TLS</span></span>
<span class="line"><span>  -&gt; 代理 / VPN / 网关</span></span>
<span class="line"><span>  -&gt; CDN / WAF / API Gateway</span></span>
<span class="line"><span>  -&gt; 服务端</span></span></code></pre></div><p>任何一层都可能失败。</p><p>常见现象:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>域名解析失败</span></span>
<span class="line"><span>连接超时</span></span>
<span class="line"><span>TLS 握手失败</span></span>
<span class="line"><span>证书不受信任</span></span>
<span class="line"><span>请求被代理篡改</span></span>
<span class="line"><span>弱网下重试风暴</span></span>
<span class="line"><span>接口成功但业务码失败</span></span></code></pre></div><p>诊断时先判断失败发生在哪一层。</p><hr><h2 id="二、错误要分类" tabindex="-1">二、错误要分类 <a class="header-anchor" href="#二、错误要分类" aria-label="Permalink to &quot;二、错误要分类&quot;">​</a></h2><p>客户端至少要区分:</p><table tabindex="0"><thead><tr><th>类型</th><th>例子</th></tr></thead><tbody><tr><td>DNS 错误</td><td>域名无法解析</td></tr><tr><td>连接错误</td><td>connect timeout、connection refused</td></tr><tr><td>TLS 错误</td><td>证书过期、链不完整、pinning 失败</td></tr><tr><td>HTTP 错误</td><td>4xx、5xx</td></tr><tr><td>业务错误</td><td>code != success</td></tr><tr><td>解析错误</td><td>JSON 格式不符合预期</td></tr><tr><td>取消请求</td><td>页面关闭、用户取消</td></tr><tr><td>超时</td><td>连接超时、读超时、整体超时</td></tr></tbody></table><p>不要把所有异常都显示成&quot;网络异常&quot;。</p><p>对用户可以简化,对日志必须分类。</p><hr><h2 id="三、超时和重试" tabindex="-1">三、超时和重试 <a class="header-anchor" href="#三、超时和重试" aria-label="Permalink to &quot;三、超时和重试&quot;">​</a></h2><p>需要分别设置:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>连接超时</span></span>
<span class="line"><span>读超时</span></span>
<span class="line"><span>写超时</span></span>
<span class="line"><span>整体请求超时</span></span></code></pre></div><p>重试规则:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>只重试幂等请求</span></span>
<span class="line"><span>限制次数</span></span>
<span class="line"><span>指数退避</span></span>
<span class="line"><span>加随机抖动</span></span>
<span class="line"><span>弱网下降低并发</span></span>
<span class="line"><span>不要重试明确业务失败</span></span></code></pre></div><p>危险做法:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>所有接口失败都重试 3 次</span></span>
<span class="line"><span>支付、下单、提交表单无幂等重试</span></span>
<span class="line"><span>多个页面同时重试同一个接口</span></span>
<span class="line"><span>无网络时持续轮询</span></span></code></pre></div><p>重试是放大器,写不好会把小故障放大成大故障。</p><hr><h2 id="四、证书和-tls" tabindex="-1">四、证书和 TLS <a class="header-anchor" href="#四、证书和-tls" aria-label="Permalink to &quot;四、证书和 TLS&quot;">​</a></h2><p>移动端证书相关问题:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>服务端证书过期</span></span>
<span class="line"><span>中间证书链缺失</span></span>
<span class="line"><span>旧系统不支持新根证书</span></span>
<span class="line"><span>设备时间错误</span></span>
<span class="line"><span>企业代理替换证书</span></span>
<span class="line"><span>证书 pinning 配置过旧</span></span>
<span class="line"><span>测试环境自签证书未隔离</span></span></code></pre></div><p>证书 pinning 要谨慎:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>能防部分中间人攻击</span></span>
<span class="line"><span>也会提高证书轮换事故风险</span></span>
<span class="line"><span>必须支持多 pin 和灰度</span></span>
<span class="line"><span>必须有应急下发或版本预案</span></span></code></pre></div><p>不要把测试证书信任逻辑带进 release。</p><hr><h2 id="五、代理和抓包" tabindex="-1">五、代理和抓包 <a class="header-anchor" href="#五、代理和抓包" aria-label="Permalink to &quot;五、代理和抓包&quot;">​</a></h2><p>开发诊断常用:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Charles</span></span>
<span class="line"><span>Proxyman</span></span>
<span class="line"><span>mitmproxy</span></span>
<span class="line"><span>Wireshark</span></span>
<span class="line"><span>Android Studio Network Inspector</span></span>
<span class="line"><span>Xcode Instruments</span></span></code></pre></div><p>抓包前要确认:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>是否是 debug / staging 环境</span></span>
<span class="line"><span>是否安装了代理根证书</span></span>
<span class="line"><span>是否关闭或适配证书 pinning</span></span>
<span class="line"><span>是否避免采集真实用户敏感数据</span></span>
<span class="line"><span>是否清理导出的抓包文件</span></span></code></pre></div><p>生产环境抓包要非常谨慎,抓包文件可能包含 token、Cookie、手机号、地址和订单信息。</p><hr><h2 id="六、弱网测试" tabindex="-1">六、弱网测试 <a class="header-anchor" href="#六、弱网测试" aria-label="Permalink to &quot;六、弱网测试&quot;">​</a></h2><p>弱网不只是慢。</p><p>要覆盖:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>高延迟</span></span>
<span class="line"><span>高丢包</span></span>
<span class="line"><span>低带宽</span></span>
<span class="line"><span>网络抖动</span></span>
<span class="line"><span>从 Wi-Fi 切 4G / 5G</span></span>
<span class="line"><span>无网恢复</span></span>
<span class="line"><span>DNS 慢</span></span>
<span class="line"><span>TLS 慢</span></span>
<span class="line"><span>接口半开</span></span></code></pre></div><p>弱网下重点看:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>页面是否有 loading 和超时</span></span>
<span class="line"><span>是否能取消请求</span></span>
<span class="line"><span>是否重复提交</span></span>
<span class="line"><span>是否出现重试风暴</span></span>
<span class="line"><span>是否有离线兜底</span></span>
<span class="line"><span>恢复网络后是否自动同步</span></span></code></pre></div><p>弱网测试不是最后点一下飞行模式。</p><hr><h2 id="七、网络日志怎么采" tabindex="-1">七、网络日志怎么采 <a class="header-anchor" href="#七、网络日志怎么采" aria-label="Permalink to &quot;七、网络日志怎么采&quot;">​</a></h2><p>建议记录:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>trace id</span></span>
<span class="line"><span>接口名</span></span>
<span class="line"><span>域名</span></span>
<span class="line"><span>状态码</span></span>
<span class="line"><span>业务码</span></span>
<span class="line"><span>耗时</span></span>
<span class="line"><span>错误类型</span></span>
<span class="line"><span>重试次数</span></span>
<span class="line"><span>网络类型</span></span>
<span class="line"><span>App 版本</span></span>
<span class="line"><span>设备型号</span></span></code></pre></div><p>不要记录:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>完整 token</span></span>
<span class="line"><span>完整 Cookie</span></span>
<span class="line"><span>身份证、银行卡</span></span>
<span class="line"><span>完整地址</span></span>
<span class="line"><span>明文密码</span></span></code></pre></div><p>请求体和响应体默认不要全量上报。需要诊断时按白名单、采样和脱敏开启。</p><hr><h2 id="八、网络安全配置" tabindex="-1">八、网络安全配置 <a class="header-anchor" href="#八、网络安全配置" aria-label="Permalink to &quot;八、网络安全配置&quot;">​</a></h2><p>移动端要明确:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>是否允许 HTTP 明文</span></span>
<span class="line"><span>哪些域名允许明文</span></span>
<span class="line"><span>是否信任用户安装证书</span></span>
<span class="line"><span>debug 和 release 网络配置是否分离</span></span>
<span class="line"><span>是否启用证书 pinning</span></span>
<span class="line"><span>WebView 是否限制混合内容</span></span></code></pre></div><p>Android 有 Network Security Config。</p><p>iOS 有 ATS 相关配置。</p><p>不要为了测试方便把全局明文或任意证书信任放进生产包。</p><hr><h2 id="九、什么时候会出事故" tabindex="-1">九、什么时候会出事故 <a class="header-anchor" href="#九、什么时候会出事故" aria-label="Permalink to &quot;九、什么时候会出事故&quot;">​</a></h2><p>常见事故:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>证书过期导致全量请求失败</span></span>
<span class="line"><span>中间证书链配置错误,部分 Android 失败</span></span>
<span class="line"><span>pinning 没预留新证书,证书轮换后 App 全挂</span></span>
<span class="line"><span>弱网下重复下单</span></span>
<span class="line"><span>代理配置被带到 release</span></span>
<span class="line"><span>HTTP 明文接口被系统拦截</span></span>
<span class="line"><span>WebView 混合内容导致页面资源加载失败</span></span>
<span class="line"><span>接口错误被统一吞成网络异常,无法定位</span></span></code></pre></div><p>网络事故一定要能快速判断是客户端、网络链路还是服务端。</p><hr><h2 id="十、检查清单" tabindex="-1">十、检查清单 <a class="header-anchor" href="#十、检查清单" aria-label="Permalink to &quot;十、检查清单&quot;">​</a></h2><ul><li>[ ] 网络错误是否按 DNS、连接、TLS、HTTP、业务分类</li><li>[ ] 超时是否区分连接、读写和整体超时</li><li>[ ] 重试是否只用于幂等请求</li><li>[ ] 是否有 trace id 串联客户端和服务端日志</li><li>[ ] release 是否禁止测试证书信任</li><li>[ ] 证书 pinning 是否支持轮换和应急</li><li>[ ] 弱网、断网恢复、网络切换是否测过</li><li>[ ] 抓包文件是否避免真实敏感数据</li><li>[ ] WebView 是否限制混合内容和危险域名</li><li>[ ] HTTP 明文策略是否明确</li></ul><hr><h2 id="十一、结论" tabindex="-1">十一、结论 <a class="header-anchor" href="#十一、结论" aria-label="Permalink to &quot;十一、结论&quot;">​</a></h2><p>网络诊断的顺序:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>先分类错误</span></span>
<span class="line"><span>再看链路层级</span></span>
<span class="line"><span>再结合 trace id</span></span>
<span class="line"><span>再复现网络环境</span></span>
<span class="line"><span>最后修客户端或服务端策略</span></span></code></pre></div><p>移动端网络不稳定是常态。工程上要做的是分类、兜底、限流和可观测。</p>`,75)])])}const g=s(t,[["render",l]]);export{u as __pageData,g as default};
