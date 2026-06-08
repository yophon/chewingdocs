import{c as s,Q as n,j as p,m as e}from"./chunks/framework.Bhbi9jCp.js";const g=JSON.parse('{"title":"移动端通用知识总览","description":"","frontmatter":{},"headers":[],"relativePath":"mobileCommonLearning/01-移动端通用知识总览.md","filePath":"mobileCommonLearning/01-移动端通用知识总览.md","lastUpdated":1780912084000}'),t={name:"mobileCommonLearning/01-移动端通用知识总览.md"};function i(l,a,d,o,r,c){return n(),p("div",null,[...a[0]||(a[0]=[e(`<h1 id="移动端通用知识总览" tabindex="-1">移动端通用知识总览 <a class="header-anchor" href="#移动端通用知识总览" aria-label="Permalink to &quot;移动端通用知识总览&quot;">​</a></h1><p>移动端开发不只是写 UI。真正上线以后,你会面对签名、商店、权限、推送、深链、后台限制、崩溃、渠道、合规和发版事故。</p><p>一句话先记住:<strong>移动端通用知识是所有 App 的生产规则,和你用 Flutter、React Native、Kotlin、Swift 无关。</strong></p><hr><h2 id="一、为什么要有这个系列" tabindex="-1">一、为什么要有这个系列 <a class="header-anchor" href="#一、为什么要有这个系列" aria-label="Permalink to &quot;一、为什么要有这个系列&quot;">​</a></h2><p>Flutter 系列会告诉你怎么写 Flutter App。</p><p>Android 原生系列会告诉你怎么写 Kotlin + Compose。</p><p>iOS 原生系列会告诉你怎么写 Swift + SwiftUI。</p><p>但真实项目还有一堆跨平台问题:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Android keystore 丢了怎么办?</span></span>
<span class="line"><span>iOS 换 Mac 后还能不能更新线上 App?</span></span>
<span class="line"><span>Bundle ID 和 applicationId 能不能改?</span></span>
<span class="line"><span>TestFlight、Google Play、国内应用市场有什么区别?</span></span>
<span class="line"><span>推送 token 为什么会变?</span></span>
<span class="line"><span>App Links 为什么线上不生效?</span></span>
<span class="line"><span>release 包为什么 debug 没问题、线上崩?</span></span>
<span class="line"><span>签名泄漏后怎么止损?</span></span></code></pre></div><p>这些问题不属于某个 UI 框架,属于移动端工程本身。</p><hr><h2 id="二、移动端上线链路" tabindex="-1">二、移动端上线链路 <a class="header-anchor" href="#二、移动端上线链路" aria-label="Permalink to &quot;二、移动端上线链路&quot;">​</a></h2><p>一个 App 从代码到用户手机,大致是:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>代码</span></span>
<span class="line"><span>  -&gt; 编译</span></span>
<span class="line"><span>  -&gt; 打包</span></span>
<span class="line"><span>  -&gt; 签名</span></span>
<span class="line"><span>  -&gt; 上传商店 / 渠道</span></span>
<span class="line"><span>  -&gt; 审核</span></span>
<span class="line"><span>  -&gt; 灰度 / 分阶段发布</span></span>
<span class="line"><span>  -&gt; 用户安装 / 更新</span></span>
<span class="line"><span>  -&gt; 崩溃和性能监控</span></span>
<span class="line"><span>  -&gt; 下一次发版</span></span></code></pre></div><p>每一段都有事故点:</p><table tabindex="0"><thead><tr><th>阶段</th><th>常见事故</th></tr></thead><tbody><tr><td>编译</td><td>环境不一致、依赖版本漂移</td></tr><tr><td>打包</td><td>debug 正常、release 崩溃、资源缺失</td></tr><tr><td>签名</td><td>keystore 丢失、p12 缺私钥、profile 不匹配</td></tr><tr><td>上传</td><td>版本号没递增、包名不一致、target SDK 不达标</td></tr><tr><td>审核</td><td>隐私说明缺失、权限用途不清、截图材料不合规</td></tr><tr><td>发布</td><td>灰度策略错误、渠道包污染、回滚困难</td></tr><tr><td>线上</td><td>崩溃、ANR、推送异常、深链失效</td></tr></tbody></table><p>这个系列就是逐段补齐这些知识。</p><hr><h2 id="三、最重要的几个身份" tabindex="-1">三、最重要的几个身份 <a class="header-anchor" href="#三、最重要的几个身份" aria-label="Permalink to &quot;三、最重要的几个身份&quot;">​</a></h2><p>移动端有几个&quot;身份证&quot;,不能乱改。</p><table tabindex="0"><thead><tr><th>概念</th><th>Android</th><th>iOS</th></tr></thead><tbody><tr><td>应用身份</td><td><code>applicationId</code></td><td>Bundle ID</td></tr><tr><td>商店身份</td><td>Play Console / 国内市场应用记录</td><td>App Store Connect App</td></tr><tr><td>签名身份</td><td>keystore / signing key</td><td>Apple Team + certificate + private key + profile</td></tr><tr><td>版本身份</td><td>versionCode / versionName</td><td>build number / version</td></tr><tr><td>能力身份</td><td>package + cert fingerprint</td><td>App ID + entitlements</td></tr></tbody></table><p>记住:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>包名 / Bundle ID 决定是不是同一个 App</span></span>
<span class="line"><span>签名决定能不能覆盖升级</span></span>
<span class="line"><span>版本号决定商店收不收</span></span>
<span class="line"><span>能力配置决定推送、深链、登录等能不能工作</span></span></code></pre></div><hr><h2 id="四、android-和-ios-最大差异" tabindex="-1">四、Android 和 iOS 最大差异 <a class="header-anchor" href="#四、android-和-ios-最大差异" aria-label="Permalink to &quot;四、Android 和 iOS 最大差异&quot;">​</a></h2><p>Android:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>签名强绑定更新链路</span></span>
<span class="line"><span>同包名更新必须签名兼容</span></span>
<span class="line"><span>国内多渠道复杂</span></span>
<span class="line"><span>Google Play App Signing 可以托管发布签名</span></span></code></pre></div><p>iOS:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>App Store 更新主要绑定 Apple Team + Bundle ID</span></span>
<span class="line"><span>证书可以重新生成</span></span>
<span class="line"><span>Provisioning Profile 约束能力和分发方式</span></span>
<span class="line"><span>私钥不在 Apple 托管</span></span></code></pre></div><p>一句话:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Android 更怕 keystore 丢</span></span>
<span class="line"><span>iOS 更怕账号权限、证书/profile、entitlements 配错</span></span></code></pre></div><hr><h2 id="五、这个系列的地图" tabindex="-1">五、这个系列的地图 <a class="header-anchor" href="#五、这个系列的地图" aria-label="Permalink to &quot;五、这个系列的地图&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>01 总览</span></span>
<span class="line"><span>02 App 从代码到用户手机的全过程</span></span>
<span class="line"><span>03 包名、Bundle ID、版本号与构建号</span></span>
<span class="line"><span></span></span>
<span class="line"><span>04 移动端打包与签名管理</span></span>
<span class="line"><span>05 Android keystore、AAB、APK 与签名轮换</span></span>
<span class="line"><span>06 iOS 证书、私钥、Provisioning Profile 与 Archive</span></span>
<span class="line"><span>07 签名资产备份、迁移、丢失与泄漏应急</span></span>
<span class="line"><span></span></span>
<span class="line"><span>08 App Store、TestFlight、Google Play 与国内应用市场</span></span>
<span class="line"><span>09 灰度发布、分阶段发布与回滚策略</span></span>
<span class="line"><span>10 多环境、多 flavor 与渠道包</span></span>
<span class="line"><span>11 上架审核、隐私材料与合规清单</span></span>
<span class="line"><span></span></span>
<span class="line"><span>12 权限模型</span></span>
<span class="line"><span>13 推送通知</span></span>
<span class="line"><span>14 Deep Link / Universal Links / App Links</span></span>
<span class="line"><span>15 本地存储与敏感数据</span></span>
<span class="line"><span>16 后台任务与系统限制</span></span>
<span class="line"><span>17 WebView / Hybrid / 离线包 / 热更新边界</span></span>
<span class="line"><span></span></span>
<span class="line"><span>18 崩溃、ANR、卡顿与日志</span></span>
<span class="line"><span>19 启动、包体积、内存、电量、帧率</span></span>
<span class="line"><span>20 网络诊断、证书、代理、弱网与抓包</span></span>
<span class="line"><span>21 CI/CD 与签名 Secret 管理</span></span>
<span class="line"><span>22 发布前检查清单</span></span>
<span class="line"><span>23 线上事故处理</span></span></code></pre></div><hr><h2 id="六、和其他系列怎么配合" tabindex="-1">六、和其他系列怎么配合 <a class="header-anchor" href="#六、和其他系列怎么配合" aria-label="Permalink to &quot;六、和其他系列怎么配合&quot;">​</a></h2><p>如果你做 Flutter:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>flutterLearning/19 打包发布</span></span>
<span class="line"><span>flutterLearning/43 Fastlane 与 CI</span></span>
<span class="line"><span>mobileCommonLearning/04-07 签名管理</span></span>
<span class="line"><span>mobileCommonLearning/08-11 商店发布</span></span></code></pre></div><p>如果你做 Android:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>androidNativeLearning/22 测试打包与发布</span></span>
<span class="line"><span>androidPlatformLearning 平台机制</span></span>
<span class="line"><span>mobileCommonLearning/04-07 签名资产</span></span>
<span class="line"><span>mobileCommonLearning/12-17 系统能力共性</span></span></code></pre></div><p>如果你做 iOS:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>iosNativeLearning/27 签名 TestFlight 与上架</span></span>
<span class="line"><span>iosNativeLearning/18 权限与 Privacy Manifest</span></span>
<span class="line"><span>mobileCommonLearning/04-07 签名资产</span></span>
<span class="line"><span>mobileCommonLearning/08-11 商店与审核</span></span></code></pre></div><hr><h2 id="七、不要公开写什么" tabindex="-1">七、不要公开写什么 <a class="header-anchor" href="#七、不要公开写什么" aria-label="Permalink to &quot;七、不要公开写什么&quot;">​</a></h2><p>签名和发布文档经常会不小心泄漏内部信息。公开教程不要写:</p><ul><li>真实 keystore 文件路径</li><li>keystore / p12 / profile 文件名和存放位置</li><li>Team ID、Bundle ID、包名和项目名的完整映射</li><li>推送、地图、支付、登录平台的真实签名指纹</li><li>内部渠道账号和后台截图</li><li>CI secret 名称和值的对应关系</li></ul><p>可以写方法,不要写资产明细。资产明细放内部运维文档。</p><hr><h2 id="八、最小检查清单" tabindex="-1">八、最小检查清单 <a class="header-anchor" href="#八、最小检查清单" aria-label="Permalink to &quot;八、最小检查清单&quot;">​</a></h2><p>一个准备上线的移动端项目,至少要回答:</p><ul><li>[ ] 包名 / Bundle ID 是否最终确定</li><li>[ ] 版本号 / build 号规则是否清楚</li><li>[ ] Android keystore 是否加密备份</li><li>[ ] iOS 证书、私钥、profile 是否能在新机器恢复</li><li>[ ] CI/CD 的签名材料是否走 Secret</li><li>[ ] 推送、登录、支付、地图是否依赖签名指纹</li><li>[ ] App Store / Google Play / 国内渠道账号谁负责</li><li>[ ] 隐私政策、权限说明、截图材料是否准备</li><li>[ ] release 包是否真机测过核心流程</li><li>[ ] 崩溃和性能监控是否接入</li><li>[ ] 签名丢失或泄漏是否有预案</li></ul><hr><h2 id="九、心智模型" tabindex="-1">九、心智模型 <a class="header-anchor" href="#九、心智模型" aria-label="Permalink to &quot;九、心智模型&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>写代码只是移动端工程的一半</span></span>
<span class="line"><span>签名和商店决定能不能发</span></span>
<span class="line"><span>权限和系统限制决定能不能稳定运行</span></span>
<span class="line"><span>监控和事故预案决定线上能不能维护</span></span></code></pre></div><p>移动端一旦上架,每次发版都是生产变更。这个系列按生产变更来讲移动端。</p>`,56)])])}const u=s(t,[["render",i]]);export{g as __pageData,u as default};
