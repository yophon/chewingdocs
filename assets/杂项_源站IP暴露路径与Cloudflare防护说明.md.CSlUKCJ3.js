import{c as s,Q as n,j as p,m as e}from"./chunks/framework.Bhbi9jCp.js";const u=JSON.parse('{"title":"源站 IP 暴露路径与 Cloudflare 防护说明","description":"","frontmatter":{},"headers":[],"relativePath":"杂项/源站IP暴露路径与Cloudflare防护说明.md","filePath":"杂项/源站IP暴露路径与Cloudflare防护说明.md","lastUpdated":1780882022000}'),l={name:"杂项/源站IP暴露路径与Cloudflare防护说明.md"};function i(t,a,c,o,d,h){return n(),p("div",null,[...a[0]||(a[0]=[e(`<h1 id="源站-ip-暴露路径与-cloudflare-防护说明" tabindex="-1">源站 IP 暴露路径与 Cloudflare 防护说明 <a class="header-anchor" href="#源站-ip-暴露路径与-cloudflare-防护说明" aria-label="Permalink to &quot;源站 IP 暴露路径与 Cloudflare 防护说明&quot;">​</a></h1><h2 id="核心结论" tabindex="-1">核心结论 <a class="header-anchor" href="#核心结论" aria-label="Permalink to &quot;核心结论&quot;">​</a></h2><p>Cloudflare 主要保护的是通过域名进入的流量。<br> 如果源站 IP 已经在历史解析、子域、证书、扫描平台或配置文件中暴露，攻击方可以直接访问源站 IP，从而绕过 Cloudflare。</p><p>例如域名曾经直接解析到源站：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>example.com -&gt; 1.2.3.4</span></span></code></pre></div><p>后来再套 Cloudflare：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>example.com -&gt; Cloudflare IP</span></span></code></pre></div><p>这只能保护继续通过 <code>example.com</code> 访问的人。<br> 如果攻击方已经知道 <code>1.2.3.4</code> 是源站，就可以直接攻击：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1.2.3.4</span></span></code></pre></div><p>因此准确说法是：</p><blockquote><p>不是“套了 Cloudflare 没用”，而是“源站 IP 一旦泄露，仅靠事后套 Cloudflare 不能解决”。</p></blockquote><h2 id="攻击方可能从哪里拿到解析记录" tabindex="-1">攻击方可能从哪里拿到解析记录 <a class="header-anchor" href="#攻击方可能从哪里拿到解析记录" aria-label="Permalink to &quot;攻击方可能从哪里拿到解析记录&quot;">​</a></h2><h3 id="_1-被动-dns-数据库" tabindex="-1">1. 被动 DNS 数据库 <a class="header-anchor" href="#_1-被动-dns-数据库" aria-label="Permalink to &quot;1. 被动 DNS 数据库&quot;">​</a></h3><p>这是最常见的来源之一。</p><p>很多安全公司、威胁情报平台、DNS 服务商、CDN 厂商、爬虫节点会长期收集 DNS 查询结果，形成历史解析库。</p><p>例如某个时间点存在过：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>example.com A 1.2.3.4</span></span></code></pre></div><p>即使后来改成：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>example.com A 104.x.x.x</span></span></code></pre></div><p>历史库里仍可能保存：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>example.com 曾经解析到 1.2.3.4</span></span></code></pre></div><p>攻击方可以用这些数据查询历史 A 记录、AAAA 记录、CNAME 记录和子域记录。</p><p>常见风险包括：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>example.com       -&gt; 旧源站 IP</span></span>
<span class="line"><span>www.example.com   -&gt; 旧源站 IP</span></span>
<span class="line"><span>api.example.com   -&gt; 源站 IP</span></span>
<span class="line"><span>admin.example.com -&gt; 源站 IP</span></span>
<span class="line"><span>test.example.com  -&gt; 源站 IP</span></span></code></pre></div><p>很多泄露并不是主域泄露，而是子域泄露。</p><h3 id="_2-dns-缓存和递归解析器记录" tabindex="-1">2. DNS 缓存和递归解析器记录 <a class="header-anchor" href="#_2-dns-缓存和递归解析器记录" aria-label="Permalink to &quot;2. DNS 缓存和递归解析器记录&quot;">​</a></h3><p>域名曾经直连源站时，访问者本地 DNS、运营商 DNS、公共 DNS 解析器都可能缓存过结果。</p><p>理论上缓存会按照 TTL 过期，但现实中一些系统、日志、监控平台、安全平台可能会保存更久。<br> 这些数据也可能被收集进被动 DNS 数据库。</p><h3 id="_3-证书透明度日志" tabindex="-1">3. 证书透明度日志 <a class="header-anchor" href="#_3-证书透明度日志" aria-label="Permalink to &quot;3. 证书透明度日志&quot;">​</a></h3><p>证书透明度日志，也就是 CT Logs，会公开记录签发过证书的域名。</p><p>CT Logs 通常不直接暴露 IP，但会暴露很多子域：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>example.com</span></span>
<span class="line"><span>www.example.com</span></span>
<span class="line"><span>api.example.com</span></span>
<span class="line"><span>origin.example.com</span></span>
<span class="line"><span>panel.example.com</span></span>
<span class="line"><span>dev.example.com</span></span></code></pre></div><p>攻击方拿到这些子域后，可以继续查历史解析、扫开放端口、比对证书和页面指纹，从而找到源站。</p><p>尤其危险的是这类命名：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>origin.example.com</span></span>
<span class="line"><span>direct.example.com</span></span>
<span class="line"><span>server.example.com</span></span>
<span class="line"><span>host.example.com</span></span>
<span class="line"><span>backend.example.com</span></span>
<span class="line"><span>admin.example.com</span></span></code></pre></div><p>这些名字本身就在提示“这里可能是源站”。</p><h3 id="_4-子域遗漏" tabindex="-1">4. 子域遗漏 <a class="header-anchor" href="#_4-子域遗漏" aria-label="Permalink to &quot;4. 子域遗漏&quot;">​</a></h3><p>很多人只把主域和 <code>www</code> 套了 Cloudflare，但忘了其他子域。</p><p>例如：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>example.com       -&gt; Cloudflare</span></span>
<span class="line"><span>www.example.com   -&gt; Cloudflare</span></span>
<span class="line"><span>api.example.com   -&gt; 1.2.3.4</span></span>
<span class="line"><span>img.example.com   -&gt; 1.2.3.4</span></span>
<span class="line"><span>admin.example.com -&gt; 1.2.3.4</span></span>
<span class="line"><span>mail.example.com  -&gt; 1.2.3.4</span></span></code></pre></div><p>攻击方只要找到任意一个指向同一台服务器的子域，就可能推断源站 IP。</p><p>需要重点排查：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>A</span></span>
<span class="line"><span>AAAA</span></span>
<span class="line"><span>CNAME</span></span>
<span class="line"><span>MX</span></span>
<span class="line"><span>TXT</span></span>
<span class="line"><span>SPF</span></span>
<span class="line"><span>CAA</span></span>
<span class="line"><span>NS</span></span></code></pre></div><h3 id="_5-邮件记录泄露" tabindex="-1">5. 邮件记录泄露 <a class="header-anchor" href="#_5-邮件记录泄露" aria-label="Permalink to &quot;5. 邮件记录泄露&quot;">​</a></h3><p>如果 Web 服务和邮件服务在同一台机器上，源站很容易通过邮件记录暴露。</p><p>例如：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>example.com MX mail.example.com</span></span>
<span class="line"><span>mail.example.com A 1.2.3.4</span></span></code></pre></div><p>即使 <code>www.example.com</code> 已经套 Cloudflare，<code>mail.example.com</code> 仍然暴露了源站 IP。</p><p>SPF 记录也可能直接写出服务器 IP：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>v=spf1 ip4:1.2.3.4 include:_spf.google.com ~all</span></span></code></pre></div><p>这里的 <code>ip4:1.2.3.4</code> 就是明显泄露。</p><h3 id="_6-旧-dns-记录没有清理" tabindex="-1">6. 旧 DNS 记录没有清理 <a class="header-anchor" href="#_6-旧-dns-记录没有清理" aria-label="Permalink to &quot;6. 旧 DNS 记录没有清理&quot;">​</a></h3><p>DNS 面板中可能残留已经不用的旧记录：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>old.example.com</span></span>
<span class="line"><span>beta.example.com</span></span>
<span class="line"><span>v1.example.com</span></span>
<span class="line"><span>cdn-old.example.com</span></span>
<span class="line"><span>backup.example.com</span></span></code></pre></div><p>这些记录即使业务上不用，只要仍然解析到源站，就可能被子域枚举工具发现。</p><h3 id="_7-源站直接响应-http-https" tabindex="-1">7. 源站直接响应 HTTP/HTTPS <a class="header-anchor" href="#_7-源站直接响应-http-https" aria-label="Permalink to &quot;7. 源站直接响应 HTTP/HTTPS&quot;">​</a></h3><p>即使攻击方不知道域名，只要扫到 IP，源站如果直接返回网站内容，就可以被确认。</p><p>例如访问：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>http://1.2.3.4</span></span>
<span class="line"><span>https://1.2.3.4</span></span></code></pre></div><p>如果服务器直接返回站点页面、标题、favicon、证书、跳转地址，就能说明这个 IP 与目标站点有关。</p><p>常见暴露点包括：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>HTTP Title</span></span>
<span class="line"><span>Server Header</span></span>
<span class="line"><span>TLS Certificate</span></span>
<span class="line"><span>favicon hash</span></span>
<span class="line"><span>页面内容特征</span></span>
<span class="line"><span>重定向 Location</span></span>
<span class="line"><span>错误页品牌信息</span></span></code></pre></div><p>例如源站返回：</p><div class="language-http vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">http</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">Location</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">:</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> https://www.example.com/login</span></span></code></pre></div><p>这会直接暴露关联关系。</p><h3 id="_8-tls-证书复用" tabindex="-1">8. TLS 证书复用 <a class="header-anchor" href="#_8-tls-证书复用" aria-label="Permalink to &quot;8. TLS 证书复用&quot;">​</a></h3><p>如果源站 HTTPS 证书中包含目标域名：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>CN=example.com</span></span>
<span class="line"><span>SAN=www.example.com, api.example.com</span></span></code></pre></div><p>攻击方扫描公网 IP 的 443 端口时，可以通过证书反查域名。</p><p>即使 DNS 已经切到 Cloudflare，只要源站 443 仍对公网开放，并返回包含真实域名的证书，就可能被发现。</p><h3 id="_9-favicon-和页面指纹" tabindex="-1">9. Favicon 和页面指纹 <a class="header-anchor" href="#_9-favicon-和页面指纹" aria-label="Permalink to &quot;9. Favicon 和页面指纹&quot;">​</a></h3><p>扫描平台可以根据网站图标、标题、HTML 结构、JS 文件、CSS 路径等生成指纹。</p><p>如果 Cloudflare 后的网站和源站直连 IP 返回相同内容：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>/favicon.ico</span></span>
<span class="line"><span>/static/app.js</span></span>
<span class="line"><span>&lt;title&gt;Atlas Admin&lt;/title&gt;</span></span></code></pre></div><p>攻击方可以通过指纹匹配确认源站。</p><p>这类方法不依赖历史 DNS。只要源站能被公网访问，就有风险。</p><h3 id="_10-搜索引擎缓存和互联网扫描平台" tabindex="-1">10. 搜索引擎缓存和互联网扫描平台 <a class="header-anchor" href="#_10-搜索引擎缓存和互联网扫描平台" aria-label="Permalink to &quot;10. 搜索引擎缓存和互联网扫描平台&quot;">​</a></h3><p>一些平台会长期扫描全网 IP，并记录：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>开放端口</span></span>
<span class="line"><span>HTTP 标题</span></span>
<span class="line"><span>TLS 证书</span></span>
<span class="line"><span>响应头</span></span>
<span class="line"><span>favicon</span></span>
<span class="line"><span>服务版本</span></span>
<span class="line"><span>历史快照</span></span></code></pre></div><p>如果源站曾经裸奔过，可能已经被记录。</p><p>例如：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1.2.3.4:80   返回 example.com 页面</span></span>
<span class="line"><span>1.2.3.4:443  证书包含 example.com</span></span>
<span class="line"><span>1.2.3.4:8080 后台登录页</span></span></code></pre></div><p>后来再套 Cloudflare，这些历史数据仍可能存在。</p><h3 id="_11-访问日志、第三方统计和-webhook" tabindex="-1">11. 访问日志、第三方统计和 Webhook <a class="header-anchor" href="#_11-访问日志、第三方统计和-webhook" aria-label="Permalink to &quot;11. 访问日志、第三方统计和 Webhook&quot;">​</a></h3><p>如果网站接入过第三方服务，源站 IP 可能出现在请求链路、日志、报错或配置里。</p><p>常见来源包括：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>支付回调</span></span>
<span class="line"><span>Webhook</span></span>
<span class="line"><span>监控探针</span></span>
<span class="line"><span>错误上报</span></span>
<span class="line"><span>CI/CD 部署日志</span></span>
<span class="line"><span>对象存储回源配置</span></span>
<span class="line"><span>第三方测速</span></span>
<span class="line"><span>安全扫描报告</span></span></code></pre></div><p>某些请求头、日志、调试信息中可能出现真实 IP 或后端地址。</p><h3 id="_12-反向代理配置错误" tabindex="-1">12. 反向代理配置错误 <a class="header-anchor" href="#_12-反向代理配置错误" aria-label="Permalink to &quot;12. 反向代理配置错误&quot;">​</a></h3><p>套了 Cloudflare 后，如果源站或反向代理配置不当，响应中仍可能泄露内部信息。</p><p>例如：</p><div class="language-http vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">http</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">X-Origin-IP</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">:</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 1.2.3.4</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">X-Backend-Server</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">:</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 1.2.3.4</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">Via</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">:</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> nginx-origin-1</span></span></code></pre></div><p>错误页也可能暴露：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>connect() failed to 1.2.3.4:8080</span></span>
<span class="line"><span>upstream timed out while connecting to 1.2.3.4</span></span></code></pre></div><p>这些信息会直接指向后端或源站。</p><h3 id="_13-git-仓库、配置文件和部署脚本泄露" tabindex="-1">13. Git 仓库、配置文件和部署脚本泄露 <a class="header-anchor" href="#_13-git-仓库、配置文件和部署脚本泄露" aria-label="Permalink to &quot;13. Git 仓库、配置文件和部署脚本泄露&quot;">​</a></h3><p>项目代码或部署文件中可能写有源站地址：</p><div class="language-ini vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">ini</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">ORIGIN_HOST</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">=1.2.3.4</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">API_BASE_URL</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">=http://1.2.3.4:8080</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">SSH_HOST</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">=1.2.3.4</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">DEPLOY_TARGET</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">=1.2.3.4</span></span></code></pre></div><p>常见位置包括：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>.env</span></span>
<span class="line"><span>.env.production</span></span>
<span class="line"><span>docker-compose.yml</span></span>
<span class="line"><span>nginx.conf</span></span>
<span class="line"><span>deploy.sh</span></span>
<span class="line"><span>CI/CD logs</span></span>
<span class="line"><span>README.md</span></span>
<span class="line"><span>Terraform 文件</span></span>
<span class="line"><span>Ansible 文件</span></span></code></pre></div><p>如果仓库公开、日志泄露、构建产物暴露，攻击方就能拿到。</p><h3 id="_14-面板、数据库和旁路服务" tabindex="-1">14. 面板、数据库和旁路服务 <a class="header-anchor" href="#_14-面板、数据库和旁路服务" aria-label="Permalink to &quot;14. 面板、数据库和旁路服务&quot;">​</a></h3><p>源站所在机器可能还运行其他服务：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>宝塔面板</span></span>
<span class="line"><span>1Panel</span></span>
<span class="line"><span>phpMyAdmin</span></span>
<span class="line"><span>Grafana</span></span>
<span class="line"><span>Prometheus</span></span>
<span class="line"><span>Redis</span></span>
<span class="line"><span>MySQL</span></span>
<span class="line"><span>MongoDB</span></span>
<span class="line"><span>SSH</span></span>
<span class="line"><span>FTP</span></span>
<span class="line"><span>MinIO</span></span></code></pre></div><p>攻击方通过扫描这些服务发现 IP，再结合证书、页面标题、端口组合判断它与目标网站有关。</p><h3 id="_15-cdn-回源配置和多-cdn-混用" tabindex="-1">15. CDN 回源配置和多 CDN 混用 <a class="header-anchor" href="#_15-cdn-回源配置和多-cdn-混用" aria-label="Permalink to &quot;15. CDN 回源配置和多 CDN 混用&quot;">​</a></h3><p>如果曾经使用过其他 CDN、对象存储或负载均衡，配置里可能留下回源地址。</p><p>例如：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>旧 CDN 回源：1.2.3.4</span></span>
<span class="line"><span>对象存储回源：origin.example.com</span></span>
<span class="line"><span>图片 CDN 回源：img-origin.example.com</span></span></code></pre></div><p>攻击方查历史 CNAME 或子域时，可能顺着这些记录找到真实源站。</p><h3 id="_16-ipv6-被遗忘" tabindex="-1">16. IPv6 被遗忘 <a class="header-anchor" href="#_16-ipv6-被遗忘" aria-label="Permalink to &quot;16. IPv6 被遗忘&quot;">​</a></h3><p>很多人只保护 IPv4，却忘了 AAAA 记录。</p><p>例如：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>example.com A     -&gt; Cloudflare</span></span>
<span class="line"><span>example.com AAAA  -&gt; 2400:xxxx::1234</span></span></code></pre></div><p>这时攻击方可以直接通过 IPv6 访问源站，绕过 Cloudflare。</p><p>所以必须同时排查 IPv4 和 IPv6。</p><h3 id="_17-origin-域名命名太明显" tabindex="-1">17. Origin 域名命名太明显 <a class="header-anchor" href="#_17-origin-域名命名太明显" aria-label="Permalink to &quot;17. Origin 域名命名太明显&quot;">​</a></h3><p>一些常见命名会明显暴露用途：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>origin.example.com</span></span>
<span class="line"><span>real.example.com</span></span>
<span class="line"><span>direct.example.com</span></span>
<span class="line"><span>server.example.com</span></span>
<span class="line"><span>backend.example.com</span></span></code></pre></div><p>这些域名如果曾经存在或仍然存在，被发现概率很高。</p><p>更糟的是，这类域名有时不会开启 Cloudflare 代理，因为使用者觉得“只是自己用”。</p><h3 id="_18-同-ip-托管多个站点" tabindex="-1">18. 同 IP 托管多个站点 <a class="header-anchor" href="#_18-同-ip-托管多个站点" aria-label="Permalink to &quot;18. 同 IP 托管多个站点&quot;">​</a></h3><p>如果同一台源站上跑多个域名，其中一个没有套 Cloudflare，其他站点也可能被连带暴露。</p><p>例如：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>site-a.com -&gt; Cloudflare -&gt; 1.2.3.4</span></span>
<span class="line"><span>site-b.com -&gt; 1.2.3.4</span></span></code></pre></div><p>攻击方发现 <code>site-b.com</code> 后，可能推断 <code>site-a.com</code> 的源站也是 <code>1.2.3.4</code>。</p><h3 id="_19-历史迁移记录" tabindex="-1">19. 历史迁移记录 <a class="header-anchor" href="#_19-历史迁移记录" aria-label="Permalink to &quot;19. 历史迁移记录&quot;">​</a></h3><p>域名刚上线、迁移或测试时，经常会短暂直连源站：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>example.com -&gt; VPS IP</span></span></code></pre></div><p>测试完成后再套 Cloudflare。<br> 这个短暂窗口也可能被扫描器、DNS 数据库或监控平台记录。</p><h3 id="_20-人为泄露" tabindex="-1">20. 人为泄露 <a class="header-anchor" href="#_20-人为泄露" aria-label="Permalink to &quot;20. 人为泄露&quot;">​</a></h3><p>一些很朴素的泄露也很常见：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>截图里露出 IP</span></span>
<span class="line"><span>群聊里发过服务器地址</span></span>
<span class="line"><span>工单里贴过域名和 IP</span></span>
<span class="line"><span>博客教程里写过配置</span></span>
<span class="line"><span>GitHub issue 里发过 curl 命令</span></span></code></pre></div><p>攻击方不一定需要复杂技术，有时只是把公开信息拼起来。</p><h2 id="常见攻击路径" tabindex="-1">常见攻击路径 <a class="header-anchor" href="#常见攻击路径" aria-label="Permalink to &quot;常见攻击路径&quot;">​</a></h2><p>攻击方常见的信息收集链路是：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>查历史 DNS</span></span>
<span class="line"><span>-&gt; 找子域</span></span>
<span class="line"><span>-&gt; 查证书透明度日志</span></span>
<span class="line"><span>-&gt; 查邮件、SPF、AAAA、CNAME 记录</span></span>
<span class="line"><span>-&gt; 扫 80、443、面板端口</span></span>
<span class="line"><span>-&gt; 比对证书、标题、favicon、页面内容</span></span>
<span class="line"><span>-&gt; 确认源站 IP</span></span></code></pre></div><h2 id="延展理解-边界不在-dns-而在回源信任" tabindex="-1">延展理解：边界不在 DNS，而在回源信任 <a class="header-anchor" href="#延展理解-边界不在-dns-而在回源信任" aria-label="Permalink to &quot;延展理解：边界不在 DNS，而在回源信任&quot;">​</a></h2><p>隐藏源站 IP 不等于源站安全。<br> 真正要建立的是回源信任边界。</p><p>很多人以为套了 Cloudflare 后，安全模型是：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>用户 -&gt; Cloudflare -&gt; 源站</span></span></code></pre></div><p>但真实风险在于，只要源站仍然在公网可达，攻击方就可能绕过 Cloudflare：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>攻击者 -&gt; 源站 IP</span></span></code></pre></div><p>所以 Cloudflare 只是多了一层入口，不代表源站自动变成“只能被 Cloudflare 访问”。</p><p>更合理的安全模型应该是：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>用户 -&gt; Cloudflare -&gt; 源站</span></span>
<span class="line"><span>             |</span></span>
<span class="line"><span>             | 允许</span></span>
<span class="line"><span>             v</span></span>
<span class="line"><span></span></span>
<span class="line"><span>其他公网 IP -&gt; 源站</span></span>
<span class="line"><span>             |</span></span>
<span class="line"><span>             | 拒绝</span></span>
<span class="line"><span>             v</span></span></code></pre></div><p>也就是说，源站要把 Cloudflare 当作唯一可信入口。<br> 否则 Cloudflare 只是“推荐入口”，不是“强制入口”。</p><p>这里有一个关键点：</p><blockquote><p>边界不在 DNS，边界在防火墙和身份校验。</p></blockquote><p>DNS 只能告诉访问者：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>example.com 应该访问 Cloudflare</span></span></code></pre></div><p>但 DNS 不能阻止别人直接访问：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1.2.3.4</span></span></code></pre></div><p>真正能阻止直连的是：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>源站防火墙</span></span>
<span class="line"><span>云厂商安全组</span></span>
<span class="line"><span>Nginx / Apache 访问控制</span></span>
<span class="line"><span>Cloudflare Authenticated Origin Pulls</span></span>
<span class="line"><span>mTLS</span></span>
<span class="line"><span>Cloudflare Tunnel</span></span></code></pre></div><p>一个比较完整的 Cloudflare 防护闭环应该是：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. DNS 走 Cloudflare</span></span>
<span class="line"><span>2. 源站 IP 不公开</span></span>
<span class="line"><span>3. 源站安全组只放行 Cloudflare IP</span></span>
<span class="line"><span>4. 源站拒绝非 Cloudflare 请求</span></span>
<span class="line"><span>5. 回源链路使用 HTTPS</span></span>
<span class="line"><span>6. 校验 Cloudflare 客户端证书</span></span>
<span class="line"><span>7. 管理端口不暴露公网</span></span></code></pre></div><p>还要注意：Cloudflare IP 段也不是严格意义上的“身份”，它只是来源范围。</p><p>如果只做：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>只允许 Cloudflare IP 访问源站</span></span></code></pre></div><p>这已经比源站裸奔强很多，但仍然不是最强。<br> 因为理论上，别人也可以把自己的域名接入 Cloudflare，再让 Cloudflare 去请求你的源站。</p><p>更严谨的做法，是再加一层“这个请求确实来自我的 Cloudflare 配置”的校验：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Authenticated Origin Pulls</span></span>
<span class="line"><span>mTLS 客户端证书</span></span>
<span class="line"><span>自定义回源 Header + 源站校验</span></span>
<span class="line"><span>Cloudflare Tunnel</span></span></code></pre></div><p>可以这样理解：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>只套 Cloudflare：</span></span>
<span class="line"><span>别人应该走正门，但后门还开着。</span></span>
<span class="line"><span></span></span>
<span class="line"><span>源站只放行 Cloudflare IP：</span></span>
<span class="line"><span>后门关了，但所有穿 Cloudflare 制服的人都能靠近门口。</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Authenticated Origin Pulls / mTLS：</span></span>
<span class="line"><span>不只看来源范围，还要查身份证明。</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Cloudflare Tunnel：</span></span>
<span class="line"><span>源站没有公网入口，只主动连接 Cloudflare。</span></span></code></pre></div><p>因此，CDN 防护的核心不是隐藏，而是强制所有流量经过可信入口。</p><p>只要源站还有公网可达路径，攻击方就有机会绕过 CDN。<br> 只有当源站从网络层、应用层、回源身份层都只信任 Cloudflare 时，Cloudflare 才真正从“代理”变成“边界”。</p><h2 id="补救和防护建议" tabindex="-1">补救和防护建议 <a class="header-anchor" href="#补救和防护建议" aria-label="Permalink to &quot;补救和防护建议&quot;">​</a></h2><p>如果源站 IP 已经暴露，仅仅把 DNS 切到 Cloudflare 不够。建议按下面顺序处理。</p><h3 id="_1-更换源站-ip" tabindex="-1">1. 更换源站 IP <a class="header-anchor" href="#_1-更换源站-ip" aria-label="Permalink to &quot;1. 更换源站 IP&quot;">​</a></h3><p>如果旧源站 IP 已经被记录，最直接的补救方式是更换源站 IP。</p><p>换 IP 后，不要再让新 IP 通过任何 DNS 记录、日志、面板、证书、子域暴露出去。</p><h3 id="_2-源站防火墙只允许-cloudflare-回源" tabindex="-1">2. 源站防火墙只允许 Cloudflare 回源 <a class="header-anchor" href="#_2-源站防火墙只允许-cloudflare-回源" aria-label="Permalink to &quot;2. 源站防火墙只允许 Cloudflare 回源&quot;">​</a></h3><p>在源站服务器防火墙、安全组或 WAF 上限制：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>只允许 Cloudflare IP 段访问 80/443</span></span>
<span class="line"><span>拒绝其他公网 IP 直接访问 80/443</span></span></code></pre></div><p>这样即使攻击方知道源站 IP，也无法直接访问 Web 服务。</p><h3 id="_3-关闭不必要端口" tabindex="-1">3. 关闭不必要端口 <a class="header-anchor" href="#_3-关闭不必要端口" aria-label="Permalink to &quot;3. 关闭不必要端口&quot;">​</a></h3><p>检查公网开放端口，关闭不需要暴露的服务。</p><p>重点检查：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>22</span></span>
<span class="line"><span>80</span></span>
<span class="line"><span>443</span></span>
<span class="line"><span>3306</span></span>
<span class="line"><span>5432</span></span>
<span class="line"><span>6379</span></span>
<span class="line"><span>8080</span></span>
<span class="line"><span>8888</span></span>
<span class="line"><span>9000</span></span>
<span class="line"><span>9090</span></span></code></pre></div><p>管理端口应尽量只允许固定办公 IP、VPN 或内网访问。</p><h3 id="_4-清理所有-dns-泄露" tabindex="-1">4. 清理所有 DNS 泄露 <a class="header-anchor" href="#_4-清理所有-dns-泄露" aria-label="Permalink to &quot;4. 清理所有 DNS 泄露&quot;">​</a></h3><p>排查并清理：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>主域</span></span>
<span class="line"><span>www</span></span>
<span class="line"><span>api</span></span>
<span class="line"><span>admin</span></span>
<span class="line"><span>img</span></span>
<span class="line"><span>static</span></span>
<span class="line"><span>old</span></span>
<span class="line"><span>dev</span></span>
<span class="line"><span>test</span></span>
<span class="line"><span>mail</span></span>
<span class="line"><span>origin</span></span>
<span class="line"><span>backend</span></span></code></pre></div><p>同时检查：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>A</span></span>
<span class="line"><span>AAAA</span></span>
<span class="line"><span>CNAME</span></span>
<span class="line"><span>MX</span></span>
<span class="line"><span>TXT</span></span>
<span class="line"><span>SPF</span></span>
<span class="line"><span>CAA</span></span>
<span class="line"><span>NS</span></span></code></pre></div><p>不要只检查主域。</p><h3 id="_5-避免源站直接返回站点内容" tabindex="-1">5. 避免源站直接返回站点内容 <a class="header-anchor" href="#_5-避免源站直接返回站点内容" aria-label="Permalink to &quot;5. 避免源站直接返回站点内容&quot;">​</a></h3><p>源站直接被 IP 访问时，不应返回真实网站内容。</p><p>建议：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>未通过 Cloudflare 的请求直接拒绝</span></span>
<span class="line"><span>默认站点返回 403 或空响应</span></span>
<span class="line"><span>不在默认站点暴露业务页面</span></span>
<span class="line"><span>不返回带业务域名的跳转</span></span></code></pre></div><h3 id="_6-校验-cloudflare-回源身份" tabindex="-1">6. 校验 Cloudflare 回源身份 <a class="header-anchor" href="#_6-校验-cloudflare-回源身份" aria-label="Permalink to &quot;6. 校验 Cloudflare 回源身份&quot;">​</a></h3><p>可以开启或配置：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Authenticated Origin Pulls</span></span>
<span class="line"><span>mTLS</span></span>
<span class="line"><span>Cloudflare Origin Certificate</span></span>
<span class="line"><span>只信任 Cloudflare 代理来源</span></span></code></pre></div><p>这样可以降低伪造回源请求的风险。</p><h3 id="_7-使用-cloudflare-tunnel" tabindex="-1">7. 使用 Cloudflare Tunnel <a class="header-anchor" href="#_7-使用-cloudflare-tunnel" aria-label="Permalink to &quot;7. 使用 Cloudflare Tunnel&quot;">​</a></h3><p>更稳的方式是使用 Cloudflare Tunnel。</p><p>Cloudflare Tunnel 可以让源站不直接暴露公网 IP，由源站主动连接 Cloudflare，再由 Cloudflare 转发请求。</p><p>这样攻击方即使扫描公网，也更难直接找到 Web 源站。</p><h2 id="排查清单" tabindex="-1">排查清单 <a class="header-anchor" href="#排查清单" aria-label="Permalink to &quot;排查清单&quot;">​</a></h2><p>可以按下面清单自查：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>[ ] 是否更换过已经暴露的源站 IP</span></span>
<span class="line"><span>[ ] 源站 80/443 是否只允许 Cloudflare IP 段访问</span></span>
<span class="line"><span>[ ] 是否存在未代理的 A / AAAA 记录</span></span>
<span class="line"><span>[ ] 是否存在泄露源站的 CNAME</span></span>
<span class="line"><span>[ ] MX / SPF 是否暴露服务器 IP</span></span>
<span class="line"><span>[ ] CT Logs 是否暴露敏感子域</span></span>
<span class="line"><span>[ ] 源站 443 是否返回包含真实域名的证书</span></span>
<span class="line"><span>[ ] 直接访问源站 IP 是否能看到网站内容</span></span>
<span class="line"><span>[ ] 源站是否暴露管理面板或数据库端口</span></span>
<span class="line"><span>[ ] Git 仓库、CI/CD 日志、配置文件是否出现源站 IP</span></span>
<span class="line"><span>[ ] 是否存在旧子域、测试子域、备份子域</span></span>
<span class="line"><span>[ ] IPv6 是否被单独暴露</span></span>
<span class="line"><span>[ ] 同服务器上的其他站点是否未套 Cloudflare</span></span></code></pre></div><h2 id="总结" tabindex="-1">总结 <a class="header-anchor" href="#总结" aria-label="Permalink to &quot;总结&quot;">​</a></h2><p>源站 IP 暴露通常不是单点问题，而是历史 DNS、子域、证书、邮件、扫描平台、配置文件和源站响应共同造成的。</p><p>防护的关键不是“把域名套上 Cloudflare”这一件事，而是：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>换掉已暴露的源站 IP</span></span>
<span class="line"><span>限制源站只接受 Cloudflare 回源</span></span>
<span class="line"><span>清理所有 DNS 和子域泄露</span></span>
<span class="line"><span>关闭源站直连响应</span></span>
<span class="line"><span>收紧管理端口和旁路服务</span></span>
<span class="line"><span>必要时使用 Cloudflare Tunnel</span></span></code></pre></div><p>只要源站 IP 仍然可以被公网直接访问，Cloudflare 就只能保护通过域名进入的流量，不能阻止攻击方绕过它直接打源站。</p>`,207)])])}const g=s(l,[["render",i]]);export{u as __pageData,g as default};
