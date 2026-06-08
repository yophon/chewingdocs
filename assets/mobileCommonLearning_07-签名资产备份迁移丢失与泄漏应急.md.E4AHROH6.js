import{c as s,Q as n,j as p,m as e}from"./chunks/framework.Bhbi9jCp.js";const g=JSON.parse('{"title":"签名资产备份、迁移、丢失与泄漏应急","description":"","frontmatter":{},"headers":[],"relativePath":"mobileCommonLearning/07-签名资产备份迁移丢失与泄漏应急.md","filePath":"mobileCommonLearning/07-签名资产备份迁移丢失与泄漏应急.md","lastUpdated":1780912084000}'),i={name:"mobileCommonLearning/07-签名资产备份迁移丢失与泄漏应急.md"};function l(t,a,c,o,d,r){return n(),p("div",null,[...a[0]||(a[0]=[e(`<h1 id="签名资产备份、迁移、丢失与泄漏应急" tabindex="-1">签名资产备份、迁移、丢失与泄漏应急 <a class="header-anchor" href="#签名资产备份、迁移、丢失与泄漏应急" aria-label="Permalink to &quot;签名资产备份、迁移、丢失与泄漏应急&quot;">​</a></h1><p>签名资产不是开发者个人文件,是公司级生产资产。</p><p>一句话先记住:<strong>签名资产管理的目标不是能打一次包,而是任何时候都能安全地继续发版。</strong></p><hr><h2 id="一、资产清单" tabindex="-1">一、资产清单 <a class="header-anchor" href="#一、资产清单" aria-label="Permalink to &quot;一、资产清单&quot;">​</a></h2><p>Android:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>release keystore / jks</span></span>
<span class="line"><span>keyAlias</span></span>
<span class="line"><span>storePassword</span></span>
<span class="line"><span>keyPassword</span></span>
<span class="line"><span>签名指纹 MD5 / SHA1 / SHA256</span></span>
<span class="line"><span>Google Play upload key / app signing key 状态</span></span></code></pre></div><p>iOS:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Apple Developer 账号</span></span>
<span class="line"><span>Team ID</span></span>
<span class="line"><span>Bundle ID / App ID</span></span>
<span class="line"><span>Distribution certificate</span></span>
<span class="line"><span>private key</span></span>
<span class="line"><span>.p12</span></span>
<span class="line"><span>Provisioning Profile</span></span>
<span class="line"><span>entitlements</span></span>
<span class="line"><span>dSYM 归档</span></span></code></pre></div><p>不要只备份文件,还要备份说明和责任人。</p><hr><h2 id="二、备份规则" tabindex="-1">二、备份规则 <a class="header-anchor" href="#二、备份规则" aria-label="Permalink to &quot;二、备份规则&quot;">​</a></h2><p>最低要求:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>两份加密备份</span></span>
<span class="line"><span>两个人有恢复权限</span></span>
<span class="line"><span>密码进密码管理器</span></span>
<span class="line"><span>不进 git</span></span>
<span class="line"><span>不放聊天记录</span></span>
<span class="line"><span>不放公开网盘</span></span>
<span class="line"><span>有恢复演练</span></span></code></pre></div><p>建议记录:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>资产名</span></span>
<span class="line"><span>用途</span></span>
<span class="line"><span>所属 App</span></span>
<span class="line"><span>环境(dev/staging/prod)</span></span>
<span class="line"><span>创建时间</span></span>
<span class="line"><span>过期时间</span></span>
<span class="line"><span>负责人</span></span>
<span class="line"><span>恢复步骤</span></span></code></pre></div><hr><h2 id="三、迁移到新设备" tabindex="-1">三、迁移到新设备 <a class="header-anchor" href="#三、迁移到新设备" aria-label="Permalink to &quot;三、迁移到新设备&quot;">​</a></h2><p>Android:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>复制 keystore</span></span>
<span class="line"><span>恢复 key.properties</span></span>
<span class="line"><span>确认 Gradle signingConfig</span></span>
<span class="line"><span>打 release 包</span></span>
<span class="line"><span>用 apksigner 查看指纹</span></span>
<span class="line"><span>和历史记录比对</span></span>
<span class="line"><span>真机覆盖安装测试</span></span></code></pre></div><p>iOS:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>导入 .p12 到 Keychain</span></span>
<span class="line"><span>安装 profile</span></span>
<span class="line"><span>Xcode 选择 Team</span></span>
<span class="line"><span>Archive</span></span>
<span class="line"><span>检查 signing identity</span></span>
<span class="line"><span>上传 TestFlight</span></span></code></pre></div><p>迁移成功的标准不是&quot;能 build&quot;,而是<strong>签出来的包能覆盖旧版本或上传对应商店</strong>。</p><hr><h2 id="四、android-签名丢失" tabindex="-1">四、Android 签名丢失 <a class="header-anchor" href="#四、android-签名丢失" aria-label="Permalink to &quot;四、Android 签名丢失&quot;">​</a></h2><p>如果使用 Google Play App Signing:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>丢 upload key -&gt; 申请重置</span></span>
<span class="line"><span>丢 app signing key -&gt; 看是否由 Google 托管</span></span></code></pre></div><p>如果是国内渠道 / 官网 APK:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>先找旧电脑、CI、备份、构建机</span></span>
<span class="line"><span>再联系渠道确认签名变更流程</span></span>
<span class="line"><span>渠道不支持时,可能只能换包名重新发布</span></span></code></pre></div><p>不能做:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>从 APK / 证书还原私钥</span></span>
<span class="line"><span>随便生成新 keystore 直接发更新</span></span></code></pre></div><p>私钥不可逆。</p><hr><h2 id="五、android-签名泄漏" tabindex="-1">五、Android 签名泄漏 <a class="header-anchor" href="#五、android-签名泄漏" aria-label="Permalink to &quot;五、Android 签名泄漏&quot;">​</a></h2><p>仍持有旧签名:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>冻结渠道发版</span></span>
<span class="line"><span>检查是否有异常包</span></span>
<span class="line"><span>评估 v3 signing lineage</span></span>
<span class="line"><span>生成新签名并建立轮换链</span></span>
<span class="line"><span>更新三方平台指纹</span></span>
<span class="line"><span>全渠道实测覆盖升级</span></span></code></pre></div><p>旧签名失控:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>下架或冻结可疑渠道包</span></span>
<span class="line"><span>检查官网 / CDN / 下载页</span></span>
<span class="line"><span>后端拦截异常版本和签名指纹</span></span>
<span class="line"><span>联系各应用市场人工处理</span></span>
<span class="line"><span>准备新签名或新包名迁移方案</span></span>
<span class="line"><span>通知用户从可信渠道更新</span></span></code></pre></div><p>签名泄漏是安全事故,不是普通发版问题。</p><hr><h2 id="六、ios-证书丢失" tabindex="-1">六、iOS 证书丢失 <a class="header-anchor" href="#六、ios-证书丢失" aria-label="Permalink to &quot;六、iOS 证书丢失&quot;">​</a></h2><p>App Store 场景:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>有 Team 权限 -&gt; 可重新生成证书和 profile</span></span>
<span class="line"><span>Bundle ID 不变 -&gt; 可继续更新</span></span></code></pre></div><p>CI / 企业 / Ad Hoc:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>需要恢复或重新配置 .p12 / profile</span></span>
<span class="line"><span>旧 profile 可能绑定旧 certificate</span></span>
<span class="line"><span>设备列表和能力要重新确认</span></span></code></pre></div><p>iOS 更怕账号权限丢失和能力配置不一致,不如 Android 那样单点依赖旧 keystore。</p><hr><h2 id="七、渠道签名变更材料" tabindex="-1">七、渠道签名变更材料 <a class="header-anchor" href="#七、渠道签名变更材料" aria-label="Permalink to &quot;七、渠道签名变更材料&quot;">​</a></h2><p>国内渠道常见要求:</p><ul><li>公司营业执照</li><li>法人身份证或授权书</li><li>软件著作权</li><li>App 名称</li><li>包名</li><li>当前线上版本号</li><li>原签名 MD5 / SHA1 / SHA256</li><li>新签名 MD5 / SHA1 / SHA256</li><li>新 APK / AAB</li><li>官网或其他市场在架截图</li><li>签名丢失或泄漏说明</li></ul><p>这些材料平时就该准备好。</p><hr><h2 id="八、应急时的后端配合" tabindex="-1">八、应急时的后端配合 <a class="header-anchor" href="#八、应急时的后端配合" aria-label="Permalink to &quot;八、应急时的后端配合&quot;">​</a></h2><p>后端可以做:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>记录客户端版本</span></span>
<span class="line"><span>记录渠道</span></span>
<span class="line"><span>记录签名指纹或安装来源可信度</span></span>
<span class="line"><span>拦截异常版本号</span></span>
<span class="line"><span>关闭高风险功能</span></span>
<span class="line"><span>强制可信渠道升级</span></span>
<span class="line"><span>展示安全公告</span></span></code></pre></div><p>移动端事故往往不能只靠客户端修。发布新包需要时间,后端开关能争取缓冲。</p><hr><h2 id="九、演练" tabindex="-1">九、演练 <a class="header-anchor" href="#九、演练" aria-label="Permalink to &quot;九、演练&quot;">​</a></h2><p>至少每半年演练一次:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>新机器从零恢复 Android release 签名</span></span>
<span class="line"><span>新机器从零恢复 iOS Archive</span></span>
<span class="line"><span>CI 用 Secret 打一份 release 包</span></span>
<span class="line"><span>比对签名指纹</span></span>
<span class="line"><span>上传内测渠道</span></span>
<span class="line"><span>确认符号表上传</span></span></code></pre></div><p>没有演练的备份,只能算&quot;心理安慰&quot;。</p><hr><h2 id="十、检查清单" tabindex="-1">十、检查清单 <a class="header-anchor" href="#十、检查清单" aria-label="Permalink to &quot;十、检查清单&quot;">​</a></h2><ul><li>[ ] Android keystore 是否两份加密备份</li><li>[ ] iOS p12 / profile 是否可恢复</li><li>[ ] 密码是否在密码管理器</li><li>[ ] 是否记录签名指纹</li><li>[ ] 是否盘点渠道签名变更流程</li><li>[ ] 是否盘点依赖签名指纹的平台</li><li>[ ] 是否有签名泄漏应急预案</li><li>[ ] 是否做过新机器恢复演练</li><li>[ ] 是否有离职交接流程</li></ul><hr><h2 id="十一、心智模型" tabindex="-1">十一、心智模型 <a class="header-anchor" href="#十一、心智模型" aria-label="Permalink to &quot;十一、心智模型&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>备份解决丢失</span></span>
<span class="line"><span>权限解决迁移</span></span>
<span class="line"><span>轮换解决部分泄漏</span></span>
<span class="line"><span>渠道材料解决人工审核</span></span>
<span class="line"><span>后端风控解决发新版前的空窗期</span></span>
<span class="line"><span>演练证明预案真的可用</span></span></code></pre></div><p>下一篇 08 讲 App Store、TestFlight、Google Play 与国内应用市场。</p>`,68)])])}const u=s(i,[["render",l]]);export{g as __pageData,u as default};
