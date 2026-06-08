import{c as s,Q as n,j as p,m as e}from"./chunks/framework.Bhbi9jCp.js";const u=JSON.parse('{"title":"后台任务、前台服务与系统限制","description":"","frontmatter":{},"headers":[],"relativePath":"mobileCommonLearning/16-后台任务前台服务与系统限制.md","filePath":"mobileCommonLearning/16-后台任务前台服务与系统限制.md","lastUpdated":1780912084000}'),t={name:"mobileCommonLearning/16-后台任务前台服务与系统限制.md"};function i(l,a,d,c,o,h){return n(),p("div",null,[...a[0]||(a[0]=[e(`<h1 id="后台任务、前台服务与系统限制" tabindex="-1">后台任务、前台服务与系统限制 <a class="header-anchor" href="#后台任务、前台服务与系统限制" aria-label="Permalink to &quot;后台任务、前台服务与系统限制&quot;">​</a></h1><p>移动端后台能力不是你想跑就能跑。系统会为了电量、性能和隐私限制后台执行。</p><p>一句话:<strong>后台任务要按系统规则设计,不能把手机当服务器。</strong></p><hr><h2 id="一、先区分三件事" tabindex="-1">一、先区分三件事 <a class="header-anchor" href="#一、先区分三件事" aria-label="Permalink to &quot;一、先区分三件事&quot;">​</a></h2><table tabindex="0"><thead><tr><th>概念</th><th>说明</th></tr></thead><tbody><tr><td>前台运行</td><td>用户正在使用 App</td></tr><tr><td>后台运行</td><td>App 不在前台,但进程可能还活着</td></tr><tr><td>后台任务</td><td>系统允许 App 在特定条件下短时间执行</td></tr></tbody></table><p>很多问题来自误解:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>App 退到后台 != 代码还能一直跑</span></span>
<span class="line"><span>进程还活着 != 系统承诺不会杀</span></span>
<span class="line"><span>定时器还在跑 != 可以依赖它做业务</span></span></code></pre></div><p>移动端后台能力永远是条件性的。</p><hr><h2 id="二、android-的后台规则" tabindex="-1">二、Android 的后台规则 <a class="header-anchor" href="#二、android-的后台规则" aria-label="Permalink to &quot;二、Android 的后台规则&quot;">​</a></h2><p>Android 常见后台机制:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>WorkManager</span></span>
<span class="line"><span>JobScheduler</span></span>
<span class="line"><span>Foreground Service</span></span>
<span class="line"><span>AlarmManager</span></span>
<span class="line"><span>BroadcastReceiver</span></span>
<span class="line"><span>FCM high priority message</span></span></code></pre></div><p>选择原则:</p><table tabindex="0"><thead><tr><th>需求</th><th>建议</th></tr></thead><tbody><tr><td>可延迟任务</td><td>WorkManager</td></tr><tr><td>网络恢复后同步</td><td>WorkManager + constraints</td></tr><tr><td>用户可感知的持续任务</td><td>Foreground Service</td></tr><tr><td>精确定时</td><td>谨慎使用 AlarmManager</td></tr><tr><td>推送触发</td><td>FCM / 厂商推送</td></tr></tbody></table><p>Android 后台限制会受系统版本、厂商系统、省电策略、通知权限影响。</p><hr><h2 id="三、ios-的后台规则" tabindex="-1">三、iOS 的后台规则 <a class="header-anchor" href="#三、ios-的后台规则" aria-label="Permalink to &quot;三、iOS 的后台规则&quot;">​</a></h2><p>iOS 常见后台机制:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Background Modes</span></span>
<span class="line"><span>Background App Refresh</span></span>
<span class="line"><span>BGTaskScheduler</span></span>
<span class="line"><span>Silent Push</span></span>
<span class="line"><span>URLSession background transfer</span></span>
<span class="line"><span>Location background</span></span>
<span class="line"><span>Audio / VoIP 等特定模式</span></span></code></pre></div><p>iOS 更强调场景授权:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>不是你申请了后台模式就能随便跑</span></span>
<span class="line"><span>只有真实符合该模式的业务才应该开启</span></span>
<span class="line"><span>系统会根据电量、用户习惯、网络状态决定执行时机</span></span></code></pre></div><p>不要指望 iOS 后台任务精确准时。</p><hr><h2 id="四、哪些需求不能直接靠后台任务" tabindex="-1">四、哪些需求不能直接靠后台任务 <a class="header-anchor" href="#四、哪些需求不能直接靠后台任务" aria-label="Permalink to &quot;四、哪些需求不能直接靠后台任务&quot;">​</a></h2><p>这些需求风险很高:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>每 10 秒上报一次位置</span></span>
<span class="line"><span>App 关闭后持续轮询接口</span></span>
<span class="line"><span>后台长期保持 WebSocket</span></span>
<span class="line"><span>每天固定 9 点一定执行本地任务</span></span>
<span class="line"><span>后台下载大文件但无用户感知</span></span>
<span class="line"><span>退到后台继续跑复杂计算</span></span></code></pre></div><p>更合理的设计:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>服务端推送触发</span></span>
<span class="line"><span>用户打开 App 时补偿同步</span></span>
<span class="line"><span>系统任务做尽力执行</span></span>
<span class="line"><span>前台服务提供明确通知</span></span>
<span class="line"><span>服务端记录状态,客户端只做展示和确认</span></span></code></pre></div><p>移动端后台任务要有&quot;可能不执行&quot;的业务兜底。</p><hr><h2 id="五、前台服务不是免死牌" tabindex="-1">五、前台服务不是免死牌 <a class="header-anchor" href="#五、前台服务不是免死牌" aria-label="Permalink to &quot;五、前台服务不是免死牌&quot;">​</a></h2><p>Android 前台服务要求:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>用户可感知</span></span>
<span class="line"><span>必须有通知</span></span>
<span class="line"><span>用途要和声明类型匹配</span></span>
<span class="line"><span>不能滥用来保活</span></span></code></pre></div><p>常见适合场景:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>导航</span></span>
<span class="line"><span>运动记录</span></span>
<span class="line"><span>音频播放</span></span>
<span class="line"><span>文件上传下载</span></span>
<span class="line"><span>通话</span></span>
<span class="line"><span>蓝牙设备连接</span></span></code></pre></div><p>不适合:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>偷偷同步数据</span></span>
<span class="line"><span>维持长连接保活</span></span>
<span class="line"><span>规避系统省电限制</span></span>
<span class="line"><span>无通知后台计算</span></span></code></pre></div><p>滥用前台服务可能导致审核、系统限制或用户卸载。</p><hr><h2 id="六、后台任务要可重试、可中断、可恢复" tabindex="-1">六、后台任务要可重试、可中断、可恢复 <a class="header-anchor" href="#六、后台任务要可重试、可中断、可恢复" aria-label="Permalink to &quot;六、后台任务要可重试、可中断、可恢复&quot;">​</a></h2><p>后台任务设计规则:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>任务必须幂等</span></span>
<span class="line"><span>任务状态要落盘</span></span>
<span class="line"><span>任务可以分片</span></span>
<span class="line"><span>任务失败可重试</span></span>
<span class="line"><span>任务被杀后可恢复</span></span>
<span class="line"><span>任务超时要停止</span></span></code></pre></div><p>不要写这种逻辑:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>后台任务开始 -&gt; 内存里循环处理 5000 条 -&gt; 结束后一次性提交状态</span></span></code></pre></div><p>应该改成:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>读取待处理任务</span></span>
<span class="line"><span>处理一小批</span></span>
<span class="line"><span>提交进度</span></span>
<span class="line"><span>失败记录原因</span></span>
<span class="line"><span>下次继续</span></span></code></pre></div><p>后台任务不是事务,要按断点续跑设计。</p><hr><h2 id="七、推送和后台任务的关系" tabindex="-1">七、推送和后台任务的关系 <a class="header-anchor" href="#七、推送和后台任务的关系" aria-label="Permalink to &quot;七、推送和后台任务的关系&quot;">​</a></h2><p>推送可以唤起一部分后台处理,但不能当成可靠计算通道。</p><p>常见规则:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>普通通知用于提醒用户</span></span>
<span class="line"><span>静默推送用于提示客户端同步</span></span>
<span class="line"><span>推送可能延迟、合并、丢弃</span></span>
<span class="line"><span>用户关闭通知会影响部分链路</span></span>
<span class="line"><span>厂商通道行为不完全一致</span></span></code></pre></div><p>业务上要这样设计:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>推送只告诉客户端&quot;可能有变化&quot;</span></span>
<span class="line"><span>真正状态以服务端接口为准</span></span>
<span class="line"><span>用户进入页面时再拉取最新数据</span></span></code></pre></div><p>不要把关键业务只放在推送回调里完成。</p><hr><h2 id="八、后台定位要特别谨慎" tabindex="-1">八、后台定位要特别谨慎 <a class="header-anchor" href="#八、后台定位要特别谨慎" aria-label="Permalink to &quot;八、后台定位要特别谨慎&quot;">​</a></h2><p>后台定位涉及高电量消耗和高隐私风险。</p><p>上线前要确认:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>是否确实需要后台定位</span></span>
<span class="line"><span>是否有清晰的用户可见价值</span></span>
<span class="line"><span>是否有显著的前台提示</span></span>
<span class="line"><span>是否能降低采样频率</span></span>
<span class="line"><span>是否能按地理围栏替代持续定位</span></span>
<span class="line"><span>是否有隐私政策说明</span></span></code></pre></div><p>事故点:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>审核认为后台定位用途不充分</span></span>
<span class="line"><span>用户投诉耗电</span></span>
<span class="line"><span>系统关闭定位权限</span></span>
<span class="line"><span>后台定位被厂商系统杀掉</span></span>
<span class="line"><span>日志泄漏位置轨迹</span></span></code></pre></div><p>位置数据默认按敏感数据处理。</p><hr><h2 id="九、什么时候会出事故" tabindex="-1">九、什么时候会出事故 <a class="header-anchor" href="#九、什么时候会出事故" aria-label="Permalink to &quot;九、什么时候会出事故&quot;">​</a></h2><p>常见事故:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>debug 时后台定时器正常,release 线上被系统杀</span></span>
<span class="line"><span>Android 厂商系统限制导致后台同步不执行</span></span>
<span class="line"><span>iOS 静默推送不稳定,订单状态不同步</span></span>
<span class="line"><span>前台服务通知被用户关闭后任务中断</span></span>
<span class="line"><span>后台上传没有断点续传,进程被杀后文件丢失</span></span>
<span class="line"><span>后台定位耗电导致大量差评</span></span>
<span class="line"><span>任务重复执行造成重复扣款或重复提交</span></span></code></pre></div><p>后台事故的根因通常是把&quot;尽力执行&quot;当成&quot;保证执行&quot;。</p><hr><h2 id="十、检查清单" tabindex="-1">十、检查清单 <a class="header-anchor" href="#十、检查清单" aria-label="Permalink to &quot;十、检查清单&quot;">​</a></h2><ul><li>[ ] 后台任务是否有明确业务必要性</li><li>[ ] 是否接受任务延迟或不执行</li><li>[ ] 是否有打开 App 后的补偿同步</li><li>[ ] 任务是否幂等</li><li>[ ] 任务状态是否落盘</li><li>[ ] Android 是否选择了合适的 WorkManager / 前台服务</li><li>[ ] iOS 是否只开启必要 Background Modes</li><li>[ ] 推送触发是否不承载唯一业务逻辑</li><li>[ ] 后台定位是否有隐私说明和电量控制</li><li>[ ] 省电模式、弱网、杀进程是否测过</li></ul><hr><h2 id="十一、结论" tabindex="-1">十一、结论 <a class="header-anchor" href="#十一、结论" aria-label="Permalink to &quot;十一、结论&quot;">​</a></h2><p>后台任务的正确心智:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>前台:可以稳定执行</span></span>
<span class="line"><span>后台:系统允许时执行</span></span>
<span class="line"><span>被杀:下次恢复继续</span></span>
<span class="line"><span>关键状态:服务端兜底</span></span></code></pre></div><p>移动端后台能力是协商出来的,不是抢来的。</p>`,77)])])}const b=s(t,[["render",i]]);export{u as __pageData,b as default};
