import{_ as a,H as n,f as p,i as l}from"./chunks/framework.BHvCMIhP.js";const u=JSON.parse('{"title":"安全责任共担模型:云厂商负责什么,你负责什么","description":"","frontmatter":{},"headers":[],"relativePath":"../cloudBasicsLearning/33-安全责任共担模型.md","filePath":"../cloudBasicsLearning/33-安全责任共担模型.md","lastUpdated":1779015580000}'),e={name:"../cloudBasicsLearning/33-安全责任共担模型.md"};function i(t,s,c,o,d,r){return n(),p("div",null,[...s[0]||(s[0]=[l(`<h1 id="安全责任共担模型-云厂商负责什么-你负责什么" tabindex="-1">安全责任共担模型:云厂商负责什么,你负责什么 <a class="header-anchor" href="#安全责任共担模型-云厂商负责什么-你负责什么" aria-label="Permalink to &quot;安全责任共担模型:云厂商负责什么,你负责什么&quot;">​</a></h1><h2 id="一句话解释" tabindex="-1">一句话解释 <a class="header-anchor" href="#一句话解释" aria-label="Permalink to &quot;一句话解释&quot;">​</a></h2><p><strong>安全责任共担模型是说:云厂商负责云平台本身的安全,你负责自己在云上如何配置,使用,开发和管理数据</strong>.</p><p>很多人把&quot;用了大厂云&quot;理解成&quot;安全交给大厂了&quot;.这只对了一半.云厂商会负责机房,硬件,底层网络,虚拟化平台,托管服务基础设施,物理安全,平台补丁等.但你的账号密码,IAM 权限,API Key,数据库公开访问,对象存储桶权限,应用漏洞,日志里的敏感信息,通常还是你自己的责任.</p><p>一句话区分:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>云厂商负责云的安全</span></span>
<span class="line"><span>你负责云中内容的安全</span></span></code></pre></div><p>当然,不同服务模式下边界不同.IaaS 云服务器里,操作系统补丁,Nginx 配置,运行时安全更多归你负责.托管数据库里,底层数据库软件和高可用由厂商负责更多,但账号权限,网络访问,数据加密,备份策略和 SQL 权限仍然要你管.Serverless 和静态托管替你隐藏了服务器,但不会替你修业务越权和泄露的环境变量.</p><h2 id="放在系统哪里" tabindex="-1">放在系统哪里 <a class="header-anchor" href="#放在系统哪里" aria-label="Permalink to &quot;放在系统哪里&quot;">​</a></h2><p>可以按层看责任边界:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>物理机房,供电,硬件</span></span>
<span class="line"><span>  -&gt; 主要由云厂商负责</span></span>
<span class="line"><span></span></span>
<span class="line"><span>虚拟化,宿主机,基础网络</span></span>
<span class="line"><span>  -&gt; 主要由云厂商负责</span></span>
<span class="line"><span></span></span>
<span class="line"><span>云产品默认安全能力,控制台,API</span></span>
<span class="line"><span>  -&gt; 云厂商负责提供和维护</span></span>
<span class="line"><span></span></span>
<span class="line"><span>账号,IAM,MFA,密钥,权限策略</span></span>
<span class="line"><span>  -&gt; 你负责配置和管理</span></span>
<span class="line"><span></span></span>
<span class="line"><span>云服务器操作系统,中间件,开放端口</span></span>
<span class="line"><span>  -&gt; IaaS 场景下主要由你负责</span></span>
<span class="line"><span></span></span>
<span class="line"><span>应用代码,业务权限,输入校验</span></span>
<span class="line"><span>  -&gt; 你负责</span></span>
<span class="line"><span></span></span>
<span class="line"><span>数据分类,访问控制,备份恢复,日志脱敏</span></span>
<span class="line"><span>  -&gt; 你负责</span></span></code></pre></div><p>一个常见例子:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>你使用对象存储保存用户上传文件</span></span>
<span class="line"><span></span></span>
<span class="line"><span>云厂商负责:</span></span>
<span class="line"><span>  - 存储系统可用性</span></span>
<span class="line"><span>  - 硬件故障处理</span></span>
<span class="line"><span>  - 存储服务 API 的平台安全</span></span>
<span class="line"><span>  - 服务端加密能力</span></span>
<span class="line"><span></span></span>
<span class="line"><span>你负责:</span></span>
<span class="line"><span>  - Bucket 是否公开</span></span>
<span class="line"><span>  - 谁能上传和下载</span></span>
<span class="line"><span>  - 临时链接有效期</span></span>
<span class="line"><span>  - 是否允许覆盖别人的文件</span></span>
<span class="line"><span>  - 文件是否包含敏感信息</span></span>
<span class="line"><span>  - 删除和生命周期策略</span></span></code></pre></div><p>如果你把私有文件桶配置成公开读,这通常不是云厂商&quot;不安全&quot;,而是你的配置责任.云厂商可能提供风险提示和默认保护,但最终允许谁访问资源,取决于你的策略.</p><h2 id="常见套餐和使用限制" tabindex="-1">常见套餐和使用限制 <a class="header-anchor" href="#常见套餐和使用限制" aria-label="Permalink to &quot;常见套餐和使用限制&quot;">​</a></h2><p>安全责任共担不一定直接体现在价格表里,但套餐会影响你能用到哪些安全能力:</p><ul><li>免费套餐可能只有基础账号权限,团队权限细分不足.</li><li>MFA,SSO,SCIM,细粒度审计可能在高阶套餐.</li><li>安全日志保留时间可能很短.</li><li>高级 WAF,Bot 管理,DDoS 报表可能需要付费.</li><li>私有网络,专线,私有端点,客户管理密钥可能不在入门套餐.</li><li>备份保留,跨区域复制,定点恢复可能受套餐限制.</li><li>安全支持,应急响应,合规报告通常需要商业或企业计划.</li></ul><p>这不代表小团队必须一开始买最高套餐.它代表你要知道哪些风险靠免费能力已经够用,哪些风险需要你自己补上,哪些风险只能通过升级获得.</p><p>最容易踩的坑是&quot;默认配置幻觉&quot;:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>默认创建的资源不一定最安全</span></span>
<span class="line"><span>默认公开的预览地址可能被搜索引擎收录</span></span>
<span class="line"><span>默认 API Key 可能权限过大</span></span>
<span class="line"><span>默认日志可能只保留几小时</span></span>
<span class="line"><span>默认备份可能不覆盖误删除</span></span>
<span class="line"><span>默认跨区域复制可能没有开启</span></span>
<span class="line"><span>默认告警可能不会通知到真正负责的人</span></span></code></pre></div><p>另一个坑是&quot;托管服务幻觉&quot;.托管数据库会帮你维护数据库进程,但不会自动阻止你在应用里写出 SQL 注入;托管认证会帮你处理密码哈希和登录流程,但不会自动设计你的管理员权限模型;CDN 会帮你抗一部分流量,但不会知道某个用户是否有资格下载某个私有文件.</p><h2 id="小团队建议" tabindex="-1">小团队建议 <a class="header-anchor" href="#小团队建议" aria-label="Permalink to &quot;小团队建议&quot;">​</a></h2><p>先把责任边界写进自己的系统清单.每增加一个云产品,都问四个问题:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>厂商替我负责了什么?</span></span>
<span class="line"><span>还有什么必须我配置?</span></span>
<span class="line"><span>这个服务里最容易泄露或误删的是什么?</span></span>
<span class="line"><span>出事后我靠什么日志和备份恢复?</span></span></code></pre></div><p>最低限度建议:</p><ul><li>Root 或主账号开启 MFA,日常不用主账号操作.</li><li>给成员使用独立账号,不要共享同一个登录.</li><li>API Key,Token,数据库密码只给最小权限,不用就删除.</li><li>生产和开发环境隔离,不要共用数据库和密钥.</li><li>对象存储,数据库,管理后台默认私有,需要公开时写清原因.</li><li>所有公网入口列清楚,关闭不用的端口,预览环境和测试服务.</li><li>打开关键操作审计,至少覆盖登录,权限变更,密钥创建,删除资源.</li><li>验证备份能恢复,不要只相信控制台显示&quot;已备份&quot;.</li><li>为账单,流量,5xx,登录失败,权限变更设置告警.</li></ul><p>什么时候该升级?</p><ul><li>团队超过 2-3 人,需要细粒度权限和离职回收.</li><li>有企业客户,需要 SSO,审计日志,合规证明.</li><li>产品开始收费,安全事件会直接影响收入和声誉.</li><li>使用多个云厂商和大量第三方服务,密钥和权限变复杂.</li><li>保存敏感数据,需要更强加密,备份,访问控制和日志保留.</li><li>曾经发生过误删,泄露,账号被盗,公开存储桶或密钥提交到 Git.</li></ul><p>小团队最实用的做法不是画一张很复杂的安全架构图,而是维护一份&quot;责任清单&quot;:</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>资源: 生产数据库</span></span>
<span class="line"><span>厂商负责: 托管数据库可用性,底层补丁,基础备份能力</span></span>
<span class="line"><span>我们负责: 网络访问,账号权限,备份保留,慢查询,敏感字段访问</span></span>
<span class="line"><span>最低检查: 不公开公网,强密码,只允许应用访问,每月恢复演练</span></span></code></pre></div><p>这份清单能帮助你避免把所有问题都归给云厂商,也避免把所有底层问题都扛在自己身上.</p><h2 id="一句话总结" tabindex="-1">一句话总结 <a class="header-anchor" href="#一句话总结" aria-label="Permalink to &quot;一句话总结&quot;">​</a></h2><p><strong>云厂商负责把云平台安全地运行起来,你负责把自己的账号,权限,配置,代码,数据和备份用安全的方式放上去;责任边界越清楚,出事时越不慌</strong>.</p>`,32)])])}const g=a(e,[["render",i]]);export{u as __pageData,g as default};
