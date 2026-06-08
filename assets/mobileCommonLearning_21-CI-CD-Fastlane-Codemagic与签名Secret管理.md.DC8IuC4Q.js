import{c as s,Q as n,j as p,m as e}from"./chunks/framework.Bhbi9jCp.js";const u=JSON.parse('{"title":"CI/CD、Fastlane、Codemagic 与签名 Secret 管理","description":"","frontmatter":{},"headers":[],"relativePath":"mobileCommonLearning/21-CI-CD-Fastlane-Codemagic与签名Secret管理.md","filePath":"mobileCommonLearning/21-CI-CD-Fastlane-Codemagic与签名Secret管理.md","lastUpdated":1780912084000}'),t={name:"mobileCommonLearning/21-CI-CD-Fastlane-Codemagic与签名Secret管理.md"};function i(l,a,c,o,d,r){return n(),p("div",null,[...a[0]||(a[0]=[e(`<h1 id="ci-cd、fastlane、codemagic-与签名-secret-管理" tabindex="-1">CI/CD、Fastlane、Codemagic 与签名 Secret 管理 <a class="header-anchor" href="#ci-cd、fastlane、codemagic-与签名-secret-管理" aria-label="Permalink to &quot;CI/CD、Fastlane、Codemagic 与签名 Secret 管理&quot;">​</a></h1><p>移动端 CI/CD 的难点不只是自动打包,而是把签名、证书、版本号、渠道、测试和上传都做成可重复流程。</p><p>一句话:<strong>移动端发版不要依赖某台开发机。</strong></p><hr><h2 id="一、移动端-ci-cd-要解决什么" tabindex="-1">一、移动端 CI/CD 要解决什么 <a class="header-anchor" href="#一、移动端-ci-cd-要解决什么" aria-label="Permalink to &quot;一、移动端 CI/CD 要解决什么&quot;">​</a></h2><p>目标:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>同一份代码能稳定构建</span></span>
<span class="line"><span>构建环境可复现</span></span>
<span class="line"><span>签名材料可控</span></span>
<span class="line"><span>版本号自动递增</span></span>
<span class="line"><span>测试和检查自动运行</span></span>
<span class="line"><span>产物可追溯</span></span>
<span class="line"><span>上传商店可自动化</span></span></code></pre></div><p>如果只有某个人电脑能打 release 包,项目就是高风险状态。</p><hr><h2 id="二、常见工具" tabindex="-1">二、常见工具 <a class="header-anchor" href="#二、常见工具" aria-label="Permalink to &quot;二、常见工具&quot;">​</a></h2><table tabindex="0"><thead><tr><th>工具</th><th>适合场景</th></tr></thead><tbody><tr><td>GitHub Actions</td><td>通用 CI、开源和轻量团队</td></tr><tr><td>GitLab CI</td><td>自建代码仓库和企业流水线</td></tr><tr><td>Fastlane</td><td>iOS / Android 打包、签名、上传自动化</td></tr><tr><td>Codemagic</td><td>Flutter / 移动端云构建</td></tr><tr><td>Bitrise</td><td>移动端云 CI</td></tr><tr><td>Jenkins</td><td>自建复杂流水线</td></tr></tbody></table><p>工具不是重点。重点是流程能复现、密钥能治理、产物能追踪。</p><hr><h2 id="三、一条基础流水线" tabindex="-1">三、一条基础流水线 <a class="header-anchor" href="#三、一条基础流水线" aria-label="Permalink to &quot;三、一条基础流水线&quot;">​</a></h2><p>最小流水线:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>拉代码</span></span>
<span class="line"><span>安装依赖</span></span>
<span class="line"><span>静态检查</span></span>
<span class="line"><span>单元测试</span></span>
<span class="line"><span>生成版本号</span></span>
<span class="line"><span>注入环境配置</span></span>
<span class="line"><span>解密签名材料</span></span>
<span class="line"><span>构建 release 包</span></span>
<span class="line"><span>上传符号表</span></span>
<span class="line"><span>上传测试平台 / 商店</span></span>
<span class="line"><span>归档产物和日志</span></span></code></pre></div><p>不要跳过:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>release 构建检查</span></span>
<span class="line"><span>符号表归档</span></span>
<span class="line"><span>签名信息验证</span></span>
<span class="line"><span>产物 hash 记录</span></span></code></pre></div><p>CI 产物要能回答&quot;这个包从哪次提交构建出来&quot;。</p><hr><h2 id="四、签名-secret-怎么放" tabindex="-1">四、签名 Secret 怎么放 <a class="header-anchor" href="#四、签名-secret-怎么放" aria-label="Permalink to &quot;四、签名 Secret 怎么放&quot;">​</a></h2><p>不要把这些提交到仓库:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Android keystore</span></span>
<span class="line"><span>keystore 密码</span></span>
<span class="line"><span>key alias 密码</span></span>
<span class="line"><span>iOS p12</span></span>
<span class="line"><span>p12 密码</span></span>
<span class="line"><span>Provisioning Profile</span></span>
<span class="line"><span>App Store Connect API Key</span></span>
<span class="line"><span>Google Play service account json</span></span></code></pre></div><p>常见做法:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>CI Secret 保存密码和 API key</span></span>
<span class="line"><span>签名文件加密后保存到安全存储</span></span>
<span class="line"><span>构建时临时解密</span></span>
<span class="line"><span>构建结束清理工作目录</span></span>
<span class="line"><span>限制 Secret 访问分支和人员</span></span></code></pre></div><p>Secret 名称也不要暴露太多业务细节。</p><hr><h2 id="五、android-ci-签名" tabindex="-1">五、Android CI 签名 <a class="header-anchor" href="#五、android-ci-签名" aria-label="Permalink to &quot;五、Android CI 签名&quot;">​</a></h2><p>Android 通常需要:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>keystore 文件</span></span>
<span class="line"><span>store password</span></span>
<span class="line"><span>key alias</span></span>
<span class="line"><span>key password</span></span>
<span class="line"><span>signingConfig</span></span></code></pre></div><p>构建后要检查:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>applicationId 是否正确</span></span>
<span class="line"><span>versionCode 是否递增</span></span>
<span class="line"><span>是否 release 签名</span></span>
<span class="line"><span>是否 minify / shrink 配置符合预期</span></span>
<span class="line"><span>AAB / APK 是否能安装或上传</span></span>
<span class="line"><span>签名证书指纹是否符合渠道后台配置</span></span></code></pre></div><p>国内渠道包还要确认渠道标识没有串。</p><hr><h2 id="六、ios-ci-签名" tabindex="-1">六、iOS CI 签名 <a class="header-anchor" href="#六、ios-ci-签名" aria-label="Permalink to &quot;六、iOS CI 签名&quot;">​</a></h2><p>iOS 通常需要:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>p12 证书和密码</span></span>
<span class="line"><span>Provisioning Profile</span></span>
<span class="line"><span>Bundle ID</span></span>
<span class="line"><span>Team ID</span></span>
<span class="line"><span>exportOptions.plist</span></span>
<span class="line"><span>App Store Connect API Key</span></span></code></pre></div><p>构建后要检查:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Bundle ID 是否正确</span></span>
<span class="line"><span>build number 是否递增</span></span>
<span class="line"><span>Archive 是否成功</span></span>
<span class="line"><span>export method 是否正确</span></span>
<span class="line"><span>entitlements 是否符合能力配置</span></span>
<span class="line"><span>dSYM 是否归档并上传</span></span></code></pre></div><p>iOS CI 的核心是让临时 keychain、证书导入、profile 安装都自动化。</p><hr><h2 id="七、版本号策略" tabindex="-1">七、版本号策略 <a class="header-anchor" href="#七、版本号策略" aria-label="Permalink to &quot;七、版本号策略&quot;">​</a></h2><p>推荐规则:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>用户可见版本:语义化或产品版本</span></span>
<span class="line"><span>构建号:CI 自动递增</span></span>
<span class="line"><span>提交信息:写入产物元信息</span></span>
<span class="line"><span>渠道:写入构建元信息</span></span></code></pre></div><p>示例:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>versionName / CFBundleShortVersionString = 2.3.0</span></span>
<span class="line"><span>versionCode / CFBundleVersion = CI build number</span></span>
<span class="line"><span>git sha = abc1234</span></span>
<span class="line"><span>channel = appstore / googleplay / huawei</span></span></code></pre></div><p>不要手改构建号。手工改最容易冲突。</p><hr><h2 id="八、fastlane-的位置" tabindex="-1">八、Fastlane 的位置 <a class="header-anchor" href="#八、fastlane-的位置" aria-label="Permalink to &quot;八、Fastlane 的位置&quot;">​</a></h2><p>Fastlane 适合把本地和 CI 的移动端命令统一:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>build_android</span></span>
<span class="line"><span>upload_google_play</span></span>
<span class="line"><span>build_ios</span></span>
<span class="line"><span>upload_testflight</span></span>
<span class="line"><span>upload_symbols</span></span>
<span class="line"><span>increment_build_number</span></span></code></pre></div><p>好的 lane 应该:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>参数明确</span></span>
<span class="line"><span>环境隔离</span></span>
<span class="line"><span>失败立即停止</span></span>
<span class="line"><span>输出产物路径</span></span>
<span class="line"><span>不在日志打印 secret</span></span></code></pre></div><p>Fastlane 不是必须,但它能减少&quot;本地一套、CI 一套&quot;。</p><hr><h2 id="九、什么时候会出事故" tabindex="-1">九、什么时候会出事故 <a class="header-anchor" href="#九、什么时候会出事故" aria-label="Permalink to &quot;九、什么时候会出事故&quot;">​</a></h2><p>常见事故:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>开发机能打包,CI 打不出来</span></span>
<span class="line"><span>CI 日志打印了 keystore 密码</span></span>
<span class="line"><span>临时分支也能读取生产签名</span></span>
<span class="line"><span>版本号没递增导致商店拒收</span></span>
<span class="line"><span>dSYM / mapping 没上传,线上崩溃不可读</span></span>
<span class="line"><span>国内渠道包 applicationId 正确但渠道号串了</span></span>
<span class="line"><span>测试环境配置被打进生产包</span></span>
<span class="line"><span>CI 缓存导致依赖版本漂移</span></span></code></pre></div><p>CI/CD 事故本质是发布流程不可重复、资产权限不清晰。</p><hr><h2 id="十、检查清单" tabindex="-1">十、检查清单 <a class="header-anchor" href="#十、检查清单" aria-label="Permalink to &quot;十、检查清单&quot;">​</a></h2><ul><li>[ ] release 包是否能在干净 CI 环境构建</li><li>[ ] 签名文件是否没有提交到仓库</li><li>[ ] Secret 是否限制访问人员和分支</li><li>[ ] CI 日志是否不打印密码、token、证书内容</li><li>[ ] 构建号是否自动递增</li><li>[ ] 产物是否记录 git sha、版本、渠道</li><li>[ ] mapping / dSYM 是否自动上传</li><li>[ ] 构建结束是否清理临时签名材料</li><li>[ ] App Store / Google Play API key 是否有最小权限</li><li>[ ] 生产签名是否不能被任意分支使用</li></ul><hr><h2 id="十一、结论" tabindex="-1">十一、结论 <a class="header-anchor" href="#十一、结论" aria-label="Permalink to &quot;十一、结论&quot;">​</a></h2><p>移动端 CI/CD 最小目标:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>任何授权的人</span></span>
<span class="line"><span>在干净环境</span></span>
<span class="line"><span>用同一条流水线</span></span>
<span class="line"><span>构建出可追溯的 release 包</span></span>
<span class="line"><span>并且不泄漏签名资产</span></span></code></pre></div><p>能做到这件事,发版风险会下降一个量级。</p>`,67)])])}const g=s(t,[["render",i]]);export{u as __pageData,g as default};
