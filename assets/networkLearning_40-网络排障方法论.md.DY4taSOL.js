import{_ as a,H as n,f as i,i as p}from"./chunks/framework.BHvCMIhP.js";const k=JSON.parse('{"title":"网络排障方法论","description":"","frontmatter":{},"headers":[],"relativePath":"networkLearning/40-网络排障方法论.md","filePath":"networkLearning/40-网络排障方法论.md","lastUpdated":1778496697000}'),t={name:"networkLearning/40-网络排障方法论.md"};function l(e,s,h,d,r,o){return n(),i("div",null,[...s[0]||(s[0]=[p(`<h1 id="网络排障方法论" tabindex="-1">网络排障方法论 <a class="header-anchor" href="#网络排障方法论" aria-label="Permalink to &quot;网络排障方法论&quot;">​</a></h1><p>39 章把抓包和压测推到了高级——但工具会用还不够,<strong>真正的高手是把所有工具组合成一套可复用的&quot;反射式工作流&quot;</strong>:看到一个网络症状,30 秒内定位到「是哪一层、哪个协议、哪个具体环节」,而不是凭直觉猜。这一章把前 39 篇所有的协议知识、抓包技巧、压测手段、案例经验<strong>收束成一套方法论</strong>——「分层定位法 + 三视角切换 + 工具树查询」。看完你应该能在任何排障会议上<strong>主导节奏</strong>:先问对问题、再敲对命令、最后给出有证据的结论。这是本系列的收官篇,也是把&quot;懂网络&quot;变成&quot;会排网络&quot;的最后一公里。</p><blockquote><p>一句话先记住:<strong>网络排障 = 分层定位法(从应用到链路反向走) + 三视角切换(包/时序/状态机) + 症状-工具映射(看到 X 就敲 Y)</strong>。<strong>核心不是记命令,是建立&quot;反射&quot;</strong>:连不上 → 先 ss/dig/curl;慢 → 先看时序;偶丢 → 抓包看重传;P99 抖 → 看 socket buffer 和 GC。<strong>任何&quot;网络玄学&quot;在熟练工眼里都是 5 步内能定位的工程问题</strong>。</p></blockquote><hr><h2 id="一、为什么需要-方法论" tabindex="-1">一、为什么需要&quot;方法论&quot; <a class="header-anchor" href="#一、为什么需要-方法论" aria-label="Permalink to &quot;一、为什么需要&quot;方法论&quot;&quot;">​</a></h2><h3 id="_1-1-没方法论的三种典型反应" tabindex="-1">1.1 没方法论的三种典型反应 <a class="header-anchor" href="#_1-1-没方法论的三种典型反应" aria-label="Permalink to &quot;1.1 没方法论的三种典型反应&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>症状:    用户报&quot;接口偶尔超时&quot;</span></span>
<span class="line"><span>菜鸟:    &quot;应该是网络问题&quot;(然后没下文)</span></span>
<span class="line"><span>半生:    &quot;我抓个包看看&quot;(抓 3 小时翻不出东西)</span></span>
<span class="line"><span>熟练:    分层猜 + 5 步诊断,30 分钟定位</span></span></code></pre></div><p><strong>菜鸟和熟练的差距不是工具熟,是「工作流」</strong>——熟练有套既定步骤,从来不&quot;灵感式&quot;排障。</p><h3 id="_1-2-方法论的三个核心组件" tabindex="-1">1.2 方法论的三个核心组件 <a class="header-anchor" href="#_1-2-方法论的三个核心组件" aria-label="Permalink to &quot;1.2 方法论的三个核心组件&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌──────────────────────────────────────┐</span></span>
<span class="line"><span>│  1. 分层定位法                          │</span></span>
<span class="line"><span>│     从应用 → 运输 → 网络 → 链路反向走      │</span></span>
<span class="line"><span>└──────────────────────────────────────┘</span></span>
<span class="line"><span>              ↓</span></span>
<span class="line"><span>┌──────────────────────────────────────┐</span></span>
<span class="line"><span>│  2. 三视角切换                          │</span></span>
<span class="line"><span>│     包视角 / 时序视角 / 状态机视角         │</span></span>
<span class="line"><span>└──────────────────────────────────────┘</span></span>
<span class="line"><span>              ↓</span></span>
<span class="line"><span>┌──────────────────────────────────────┐</span></span>
<span class="line"><span>│  3. 症状-工具映射                       │</span></span>
<span class="line"><span>│     看到症状 X 就敲命令 Y                │</span></span>
<span class="line"><span>└──────────────────────────────────────┘</span></span></code></pre></div><blockquote><p>经验法则:<strong>高手排障的特征是&quot;无情&quot;:情绪稳定、步骤稳定、不被症状带跑</strong>——方法论给的就是这种&quot;稳&quot;。</p></blockquote><hr><h2 id="二、分层定位法-从应用反向走" tabindex="-1">二、分层定位法:从应用反向走 <a class="header-anchor" href="#二、分层定位法-从应用反向走" aria-label="Permalink to &quot;二、分层定位法:从应用反向走&quot;">​</a></h2><p>为什么从<strong>应用</strong>开始(自顶向下)而不是从<strong>链路</strong>开始?</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>正向(从底到上)    反向(从上到下) ← 推荐</span></span>
<span class="line"><span>─────────────────────────────────────────</span></span>
<span class="line"><span>查链路 → 网络 → ...    查应用 → 运输 → 网络 → 链路</span></span>
<span class="line"><span>慢:每层都要测            快:99% 问题在上面两层</span></span>
<span class="line"><span>要懂全栈                 大部分人能一步到位</span></span></code></pre></div><p><strong>真实数据</strong>:<strong>99% 的&quot;网络问题&quot;实际在应用层(超时配置、连接池满、DNS 缓存)或运输层(TCP 拥塞、socket buffer)</strong>——只有 1% 真在链路。<strong>反向走效率高 50 倍</strong>。</p><h3 id="_2-1-标准-5-层定位流程" tabindex="-1">2.1 标准 5 层定位流程 <a class="header-anchor" href="#_2-1-标准-5-层定位流程" aria-label="Permalink to &quot;2.1 标准 5 层定位流程&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>    用户报&quot;慢 / 不通 / 偶尔失败&quot;</span></span>
<span class="line"><span>              ↓</span></span>
<span class="line"><span>    ┌─────────────────────┐</span></span>
<span class="line"><span>    │  第 1 步:应用层确认   │   curl / 浏览器 DevTools</span></span>
<span class="line"><span>    │  HTTP 状态码?         │</span></span>
<span class="line"><span>    │  TLS 握手成功?        │</span></span>
<span class="line"><span>    │  DNS 解析正常?        │</span></span>
<span class="line"><span>    └─────────────────────┘</span></span>
<span class="line"><span>              ↓ 仍不清楚</span></span>
<span class="line"><span>    ┌─────────────────────┐</span></span>
<span class="line"><span>    │  第 2 步:运输层       │   ss / netstat / tcpdump</span></span>
<span class="line"><span>    │  TCP 连不上?          │</span></span>
<span class="line"><span>    │  TIME_WAIT 满?       │</span></span>
<span class="line"><span>    │  Recv-Q / Send-Q 堆积? │</span></span>
<span class="line"><span>    │  零窗口?重传率?       │</span></span>
<span class="line"><span>    └─────────────────────┘</span></span>
<span class="line"><span>              ↓ 仍不清楚</span></span>
<span class="line"><span>    ┌─────────────────────┐</span></span>
<span class="line"><span>    │  第 3 步:网络层       │   ping / traceroute / mtr</span></span>
<span class="line"><span>    │  目标可达?            │</span></span>
<span class="line"><span>    │  哪一跳延迟?哪一跳丢? │</span></span>
<span class="line"><span>    │  MTU 黑洞?ICMP 通?  │</span></span>
<span class="line"><span>    └─────────────────────┘</span></span>
<span class="line"><span>              ↓ 仍不清楚</span></span>
<span class="line"><span>    ┌─────────────────────┐</span></span>
<span class="line"><span>    │  第 4 步:链路层       │   ip / ethtool / arp</span></span>
<span class="line"><span>    │  网卡 up?ARP 正常?   │</span></span>
<span class="line"><span>    │  网卡丢包计数?         │</span></span>
<span class="line"><span>    │  双工 / 速率匹配?      │</span></span>
<span class="line"><span>    └─────────────────────┘</span></span>
<span class="line"><span>              ↓ 仍不清楚</span></span>
<span class="line"><span>    ┌─────────────────────┐</span></span>
<span class="line"><span>    │  第 5 步:物理层 / 外部 │   电源 / 光衰 / 找运维</span></span>
<span class="line"><span>    │  线 / 光模块 / 机房问题│</span></span>
<span class="line"><span>    └─────────────────────┘</span></span></code></pre></div><p><strong>80% 问题在第 1-2 步搞定;15% 在第 3-4 步;真到第 5 步的不到 5%</strong>。</p><h3 id="_2-2-每一层的-3-个第一命令" tabindex="-1">2.2 每一层的&quot;3 个第一命令&quot; <a class="header-anchor" href="#_2-2-每一层的-3-个第一命令" aria-label="Permalink to &quot;2.2 每一层的&quot;3 个第一命令&quot;&quot;">​</a></h3><table tabindex="0"><thead><tr><th>层</th><th>第一命令(看通)</th><th>第二命令(看时序)</th><th>第三命令(看状态)</th></tr></thead><tbody><tr><td><strong>应用</strong></td><td><code>curl -v https://...</code></td><td><code>curl -w &#39;@time.fmt&#39;</code> 看分段耗时</td><td>浏览器 DevTools Network</td></tr><tr><td><strong>运输(TCP)</strong></td><td><code>ss -tnp | grep :443</code></td><td><code>tcpdump -i any port 443</code></td><td><code>ss -s</code> / <code>nstat</code></td></tr><tr><td><strong>网络</strong></td><td><code>ping &lt;ip&gt;</code></td><td><code>mtr &lt;ip&gt;</code></td><td><code>ip route get &lt;ip&gt;</code></td></tr><tr><td><strong>链路</strong></td><td><code>ip link</code></td><td><code>ethtool -S eth0</code></td><td><code>arp -an</code></td></tr></tbody></table><p><strong><code>curl -w &#39;@time.fmt&#39;</code> 的 <code>time.fmt</code> 内容</strong>(保存为文件,讲应用 + 运输 + 网络耗时):</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>DNS 解析:        %{time_namelookup}\\n</span></span>
<span class="line"><span>TCP 建连:        %{time_connect}\\n</span></span>
<span class="line"><span>TLS 握手:        %{time_appconnect}\\n</span></span>
<span class="line"><span>请求开始传输:    %{time_pretransfer}\\n</span></span>
<span class="line"><span>首字节(TTFB):    %{time_starttransfer}\\n</span></span>
<span class="line"><span>总时长:          %{time_total}\\n</span></span></code></pre></div><p><strong>输出示例</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>DNS 解析:        0.005s</span></span>
<span class="line"><span>TCP 建连:        0.045s   ← 加了 40ms = 1 RTT,正常</span></span>
<span class="line"><span>TLS 握手:        0.130s   ← 加了 85ms,1.3 是 1 RTT 偏慢</span></span>
<span class="line"><span>请求开始传输:    0.130s</span></span>
<span class="line"><span>首字节:          0.220s   ← TTFB 90ms,服务端处理</span></span>
<span class="line"><span>总时长:          0.225s</span></span></code></pre></div><blockquote><p>经验法则:<strong>第 1 步必看 <code>curl -w</code> 的分段耗时</strong>——能立刻判断&quot;是 DNS 慢、握手慢、还是服务慢&quot;。<strong>比加日志快 100 倍</strong>。</p></blockquote><hr><h2 id="三、症状-→-可能层的映射表" tabindex="-1">三、症状 → 可能层的映射表 <a class="header-anchor" href="#三、症状-→-可能层的映射表" aria-label="Permalink to &quot;三、症状 → 可能层的映射表&quot;">​</a></h2><p>排障的精髓是**「先猜对方向再动手」**——下面这张表背下来,看到症状直接知道找哪几层。</p><table tabindex="0"><thead><tr><th>症状</th><th>应用层</th><th>TLS</th><th>TCP</th><th>IP</th><th>链路</th><th>DNS</th><th>第一命令</th></tr></thead><tbody><tr><td><strong>完全连不上(超时)</strong></td><td>✗</td><td>✗</td><td>✓✓</td><td>✓✓</td><td>✓</td><td>✓✓</td><td><code>curl -v</code> + <code>ping</code> + <code>dig</code></td></tr><tr><td><strong>完全连不上(refused)</strong></td><td>✓</td><td>-</td><td>✓✓</td><td>-</td><td>-</td><td>-</td><td><code>ss -tnlp</code> 看端口是否监听</td></tr><tr><td><strong>TLS 握手失败</strong></td><td>-</td><td>✓✓</td><td>-</td><td>-</td><td>-</td><td>-</td><td><code>openssl s_client -connect</code></td></tr><tr><td><strong>连得上但慢</strong></td><td>✓</td><td>✓</td><td>✓</td><td>✓</td><td>-</td><td>✓</td><td><code>curl -w &#39;@time.fmt&#39;</code></td></tr><tr><td><strong>偶尔丢包 / 偶尔失败</strong></td><td>-</td><td>-</td><td>✓</td><td>✓✓</td><td>✓</td><td>✓</td><td><code>mtr</code> 看每跳丢包率</td></tr><tr><td><strong>P99 抖动</strong></td><td>✓✓</td><td>-</td><td>✓✓</td><td>-</td><td>-</td><td>-</td><td>tcpdump + IO Graph</td></tr><tr><td><strong>大量 RST</strong></td><td>✓</td><td>-</td><td>✓✓</td><td>-</td><td>-</td><td>-</td><td>tcpdump 看 RST TTL</td></tr><tr><td><strong>吞吐打不上去</strong></td><td>✓</td><td>-</td><td>✓✓</td><td>-</td><td>✓</td><td>-</td><td>iperf3 看裸带宽</td></tr><tr><td><strong>CPU 飙高但流量没多</strong></td><td>✓</td><td>✓</td><td>✓</td><td>-</td><td>✓</td><td>-</td><td><code>top</code> + <code>softirq</code></td></tr><tr><td><strong>DNS 偶发失败</strong></td><td>-</td><td>-</td><td>-</td><td>-</td><td>-</td><td>✓✓</td><td><code>dig +trace</code> 看递归</td></tr><tr><td><strong>跨机房慢</strong></td><td>-</td><td>-</td><td>✓</td><td>✓✓</td><td>-</td><td>-</td><td><code>mtr</code> + <code>ss -i</code> 看 cwnd</td></tr><tr><td><strong>浏览器超时但 curl 正常</strong></td><td>✓✓</td><td>✓</td><td>-</td><td>-</td><td>-</td><td>✓</td><td>DevTools Network 看协议</td></tr></tbody></table><p><strong><code>✓✓</code> = 高度怀疑;<code>✓</code> = 可能;<code>-</code> = 几乎排除</strong></p><blockquote><p>经验法则:<strong>这张表打印贴墙上</strong>——出问题先扫一眼,缩小范围再动手。</p></blockquote><hr><h2 id="四、症状-→-工具树-看到-x-就敲-y" tabindex="-1">四、症状 → 工具树:看到 X 就敲 Y <a class="header-anchor" href="#四、症状-→-工具树-看到-x-就敲-y" aria-label="Permalink to &quot;四、症状 → 工具树:看到 X 就敲 Y&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                       网络排障决策树</span></span>
<span class="line"><span>                              ↓</span></span>
<span class="line"><span>              ┌───────────────┴───────────────┐</span></span>
<span class="line"><span>              ↓                               ↓</span></span>
<span class="line"><span>         能 ping 通?                    能 ping 通?</span></span>
<span class="line"><span>         (连通性)                       (是)</span></span>
<span class="line"><span>              ↓ 否                            ↓</span></span>
<span class="line"><span>       ┌──────┴──────┐                能 telnet 端口?</span></span>
<span class="line"><span>       ↓             ↓                       ↓</span></span>
<span class="line"><span>    本地路由?      mtr 看跳数         ┌──────┴──────┐</span></span>
<span class="line"><span>    \`ip route\`     \`mtr -n &lt;ip&gt;\`      ↓             ↓</span></span>
<span class="line"><span>                                   端口未开?    能但慢?</span></span>
<span class="line"><span>                                   \`ss -tnlp\`    ↓</span></span>
<span class="line"><span>                                                ↓</span></span>
<span class="line"><span>                                  curl -w 看分段</span></span>
<span class="line"><span>                                        ↓</span></span>
<span class="line"><span>                  ┌─────────────┬───────┴───────┬────────┐</span></span>
<span class="line"><span>                  ↓             ↓               ↓        ↓</span></span>
<span class="line"><span>              DNS 慢          TCP 慢         TLS 慢    TTFB 慢</span></span>
<span class="line"><span>              dig +trace      ss -i          openssl    服务端</span></span>
<span class="line"><span>              换 8.8.8.8      看 cwnd        s_client    问题</span></span>
<span class="line"><span>                              和 RTT         -tls1_3     不是网络</span></span></code></pre></div><h3 id="_4-1-连通性问题工具树" tabindex="-1">4.1 连通性问题工具树 <a class="header-anchor" href="#_4-1-连通性问题工具树" aria-label="Permalink to &quot;4.1 连通性问题工具树&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Step 1:本机出口正常?</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">ip</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> route</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> get</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 1.1.1.1</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 看默认网关 / 出口接口</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Step 2:能 ping 通公网?</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">ping</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -c</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 3</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 1.1.1.1</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 通 → 本机网络 OK</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 不通 → 本机或局域网问题</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Step 3:DNS 解析?</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">dig</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> +short</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> api.example.com</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 没结果 → DNS 问题</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 有结果但慢 → DNS 服务器慢</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Step 4:能 ping 通目标 IP?</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">ping</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -c</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 3</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> &lt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">目标I</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">P</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">&gt;</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 不通 → ICMP 被防,或目标不可达</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 通但延迟高 → 跨机房 / 公网拥塞</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Step 5:目标端口开?</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">nc</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -zv</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> &lt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">目标I</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">P</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">&gt;</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 443</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># refused → 端口未开 / 进程没起</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># timeout → 防火墙拦了</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Step 6:HTTP 层?</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">curl</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -v</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> https://api.example.com/</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 看完整 HTTP 交互</span></span></code></pre></div><h3 id="_4-2-慢问题工具树" tabindex="-1">4.2 慢问题工具树 <a class="header-anchor" href="#_4-2-慢问题工具树" aria-label="Permalink to &quot;4.2 慢问题工具树&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Step 1:分段耗时</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">curl</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -w</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;@time.fmt&quot;</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -o</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /dev/null</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -s</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> https://api.example.com/</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Step 2:基于哪段慢决定下一步</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#   DNS 慢      → dig +trace</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#   TCP 慢      → ping + mtr 看 RTT 和丢包</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#   TLS 慢      → openssl s_client -tls1_3 -connect 看握手细节</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#   TTFB 慢     → 服务端问题,看应用日志 / APM</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#   总长慢      → 看响应体大小 + 带宽</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Step 3:抓包确认</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> tcpdump</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -i</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> any</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -w</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> t.pcap</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> host</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> &lt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">目标I</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">P</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">&gt;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> &amp;</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">curl</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> https://api.example.com/</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> killall</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> tcpdump</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Wireshark 打开看时序</span></span></code></pre></div><h3 id="_4-3-p99-抖动工具树" tabindex="-1">4.3 P99 抖动工具树 <a class="header-anchor" href="#_4-3-p99-抖动工具树" aria-label="Permalink to &quot;4.3 P99 抖动工具树&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Step 1:确认是不是周期性</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 看 1 小时延迟图,周期性?随机?</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#   周期性 → GC / 定时任务 / cron</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#   随机 → 可能网络抖</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Step 2:看 socket 状态(实时)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">watch</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -n</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 1</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;ss -s&#39;</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 看 TIME_WAIT / Recv-Q 是不是涨</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Step 3:抓包同步看</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> tcpdump</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -i</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> any</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -w</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> out.pcap</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> port</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 443</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> &amp;</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 等 P99 出现一次再停,Wireshark 找时间点</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 红线(重传)/ 零窗口 出现 → 网络问题</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 都没出现 → 应用问题</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Step 4:netstat 计数器对比</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">nstat</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -rs</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> &gt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> before.txt</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 等问题发生</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">nstat</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -rs</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> &gt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> after.txt</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">diff</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> before.txt</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> after.txt</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 看哪个计数器涨得快(retrans / drop / overflow)</span></span></code></pre></div><hr><h2 id="五、linux-网络计数器全解读" tabindex="-1">五、Linux 网络计数器全解读 <a class="header-anchor" href="#五、linux-网络计数器全解读" aria-label="Permalink to &quot;五、Linux 网络计数器全解读&quot;">​</a></h2><p><code>ss -s</code> / <code>netstat -s</code> / <code>nstat</code> 这三个命令背后是 <strong><code>/proc/net/snmp</code> + <code>/proc/net/netstat</code></strong>——里面有几百个计数器,记几个关键的就能 80% 排障。</p><h3 id="_5-1-ss-s-概览" tabindex="-1">5.1 <code>ss -s</code> 概览 <a class="header-anchor" href="#_5-1-ss-s-概览" aria-label="Permalink to &quot;5.1 \`ss -s\` 概览&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">ss</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -s</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">Total:</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 1234</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">TCP:</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">   789</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (estab </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">456,</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> closed</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 280,</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> orphaned</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 12,</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> timewait</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 35</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">                      ↑</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">              ↑</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">              ↑</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">                      正常连接</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">        待回收孤儿</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">     TIME_WAIT</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">Transport</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> Total</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">     IP</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">        IPv6</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">RAW</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">       0</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">         0</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">         0</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">UDP</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">       45</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        20</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">        25</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">TCP</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">       509</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">       400</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">       109</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">INET</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">      554</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">       420</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">       134</span></span></code></pre></div><p><strong>关键判断</strong>:</p><ul><li><code>estab</code> 持续接近上限(<code>net.ipv4.ip_local_port_range</code> 大小):<strong>端口耗尽</strong></li><li><code>timewait</code> 几万以上:<strong>反复短连接,需开 <code>tcp_tw_reuse</code></strong></li><li><code>orphaned</code> 持续涨:<strong>应用 close 了但 FIN 没走完(对端没回 FIN-ACK)</strong></li></ul><h3 id="_5-2-nstat-rs-关键计数器" tabindex="-1">5.2 <code>nstat -rs</code> 关键计数器 <a class="header-anchor" href="#_5-2-nstat-rs-关键计数器" aria-label="Permalink to &quot;5.2 \`nstat -rs\` 关键计数器&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">nstat</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -a</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> 2&gt;&amp;1</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> |</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> grep</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -E</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;(Retrans|Drop|Overflow|Listen)&#39;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 重传相关</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">TcpExtTCPLostRetransmit</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">         多少重传又丢了</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (高 </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 拥塞严重</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">TcpExtTCPRetransFail</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            重传都失败</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (链路断了)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">TcpRetransSegs</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">                  总重传段数</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">TcpExtTCPSpuriousRtxHostQueues</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  网卡</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> queue</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 引起的假重传</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 丢包 / 队列溢出</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">TcpExtTCPBacklogDrop</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            backlog</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 队列溢出</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (服务 </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">accept</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 慢</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">TcpExtTCPListenOverflows</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">        SYN</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 队列满</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (somaxconn </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">太小</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">TcpExtTCPListenDrops</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            丢的</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> SYN</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">TcpExtTCPRcvQDrop</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">               接收队列丢</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">UdpRcvbufErrors</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">                 UDP</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 接收</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> buffer</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 满</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">UdpSndbufErrors</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">                 UDP</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 发送</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> buffer</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 满</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 内存</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">TcpExtTCPMemoryPressures</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">        TCP</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 内存压力次数</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (调 </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">tcp_mem</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># TIME_WAIT</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">TcpExtTimeWaitOverflow</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          TIME_WAIT</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 桶满</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># SYN/Cookies</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">TcpExtSyncookiesSent</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            发了</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> SYN</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> cookie</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (在被 </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">SYN</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> flood</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">TcpExtSyncookiesRecv</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">            收了</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> SYN</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> cookie</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">TcpExtSyncookiesFailed</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">          SYN</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> cookie</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> 校验失败</span></span></code></pre></div><h3 id="_5-3-计数器-→-根因映射" tabindex="-1">5.3 计数器 → 根因映射 <a class="header-anchor" href="#_5-3-计数器-→-根因映射" aria-label="Permalink to &quot;5.3 计数器 → 根因映射&quot;">​</a></h3><table tabindex="0"><thead><tr><th>计数器变多</th><th>99% 根因</th></tr></thead><tbody><tr><td><code>TcpExtTCPListenOverflows</code></td><td><code>net.core.somaxconn</code> 太小或服务 accept 慢</td></tr><tr><td><code>TcpExtTCPBacklogDrop</code></td><td>应用 epoll 处理太慢,内核 backlog 满</td></tr><tr><td><code>TcpRetransSegs</code> 占总段 &gt;1%</td><td>链路丢包或拥塞</td></tr><tr><td><code>TcpExtTCPLostRetransmit</code> 多</td><td>重传也丢,要么严重拥塞要么 MTU 问题</td></tr><tr><td><code>UdpRcvbufErrors</code></td><td>UDP 接收方 socket buffer 太小</td></tr><tr><td><code>TcpExtTCPMemoryPressures</code> 出现</td><td>TCP 总内存达上限,扩 <code>tcp_mem</code></td></tr><tr><td><code>TcpExtSyncookiesSent</code> 暴涨</td><td>被 SYN flood 攻击(见 37 章)</td></tr></tbody></table><blockquote><p>经验法则:<strong>生产服务每分钟 dump 一次 <code>nstat -a</code></strong>——出问题立刻 diff,90% 概率指出方向。</p></blockquote><h3 id="_5-4-标准的-事故诊断-5-步" tabindex="-1">5.4 标准的&quot;事故诊断&quot;5 步 <a class="header-anchor" href="#_5-4-标准的-事故诊断-5-步" aria-label="Permalink to &quot;5.4 标准的&quot;事故诊断&quot;5 步&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 1. 看连接数</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">ss</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -s</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 2. 看错误计数器变化(对比 1 分钟前)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">nstat</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -rs</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 3. 看队列堆积</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">ss</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -tnp</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> |</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> awk</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;$2&gt;0 || $3&gt;0&#39;</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">   # Recv-Q / Send-Q 非 0 的 socket</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 4. 看 socket 内存</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">cat</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /proc/net/sockstat</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 关注 TCP: mem 是否接近 tcp_mem 中位</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 5. 看网卡侧</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">ip</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -s</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> link</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> show</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> eth0</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">ethtool</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -S</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> eth0</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> |</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> grep</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -i</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> drop</span></span></code></pre></div><hr><h2 id="六、三视角再用一次" tabindex="-1">六、三视角再用一次 <a class="header-anchor" href="#六、三视角再用一次" aria-label="Permalink to &quot;六、三视角再用一次&quot;">​</a></h2><p>39 章和 04 章讲了三视角,<strong>这章把&quot;什么场景该切哪个视角&quot;明确成规则</strong>。</p><h3 id="_6-1-视角选择矩阵" tabindex="-1">6.1 视角选择矩阵 <a class="header-anchor" href="#_6-1-视角选择矩阵" aria-label="Permalink to &quot;6.1 视角选择矩阵&quot;">​</a></h3><table tabindex="0"><thead><tr><th>现象</th><th>包视角</th><th>时序视角</th><th>状态机视角</th></tr></thead><tbody><tr><td>重传 / 乱序 / RST</td><td>✓✓</td><td>✓</td><td>-</td></tr><tr><td>慢(分段耗时)</td><td>-</td><td>✓✓</td><td>-</td></tr><tr><td>连接突然失效</td><td>✓</td><td>-</td><td>✓✓</td></tr><tr><td>TIME_WAIT 堆积</td><td>-</td><td>-</td><td>✓✓</td></tr><tr><td>TLS 握手失败</td><td>✓</td><td>✓</td><td>✓✓</td></tr><tr><td>HTTP/2 stream 卡</td><td>✓</td><td>✓</td><td>✓✓</td></tr><tr><td>长连接 idle 后失败</td><td>-</td><td>-</td><td>✓✓</td></tr><tr><td>P99 抖动</td><td>✓</td><td>✓✓</td><td>✓</td></tr></tbody></table><h3 id="_6-2-切视角的-3-个信号" tabindex="-1">6.2 切视角的 3 个信号 <a class="header-anchor" href="#_6-2-切视角的-3-个信号" aria-label="Permalink to &quot;6.2 切视角的 3 个信号&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>信号 1:盯着抓包翻 30 分钟没头绪 → 切时序视角</span></span>
<span class="line"><span>        (画出 DNS / TCP / TLS / HTTP 各段时长,看谁占大头)</span></span>
<span class="line"><span>        </span></span>
<span class="line"><span>信号 2:时序图发现某段长但说不清原因 → 切包视角</span></span>
<span class="line"><span>        (那段时间到底发了多少包、有没有重传)</span></span>
<span class="line"><span>        </span></span>
<span class="line"><span>信号 3:包和时序都&quot;看着正常&quot;但故障真实存在 → 切状态机视角</span></span>
<span class="line"><span>        (是不是 TCP 状态机错位 / TLS 状态错 / HTTP/2 stream 状态)</span></span></code></pre></div><blockquote><p>经验法则:<strong>任何一个视角看 30 分钟没结论,就强制切下一个</strong>——别死磕,排障最忌&quot;沉没成本&quot;。</p></blockquote><hr><h2 id="七、五个经典案例" tabindex="-1">七、五个经典案例 <a class="header-anchor" href="#七、五个经典案例" aria-label="Permalink to &quot;七、五个经典案例&quot;">​</a></h2><p>把方法论套到具体案例上——这是把&quot;懂&quot;变成&quot;会&quot;的关键。</p><h3 id="_7-1-案例一-浏览器超时但-curl-正常" tabindex="-1">7.1 案例一:浏览器超时但 curl 正常 <a class="header-anchor" href="#_7-1-案例一-浏览器超时但-curl-正常" aria-label="Permalink to &quot;7.1 案例一:浏览器超时但 curl 正常&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>现象:用户反馈打开页面 30 秒白屏</span></span>
<span class="line"><span>      curl 同 URL 200ms 返回</span></span>
<span class="line"><span>      </span></span>
<span class="line"><span>方法论应用:</span></span>
<span class="line"><span>  Step 1:应用层确认 → curl OK,锁定差异在浏览器</span></span>
<span class="line"><span>  Step 2:DevTools Network → 看到 HTTP/2 协议</span></span>
<span class="line"><span>  Step 3:对比 curl(默认 HTTP/1.1) vs 浏览器(HTTP/2)</span></span>
<span class="line"><span>  Step 4:抓包看 HTTP/2 → 客户端在等 SETTINGS frame</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>根因:服务端 HTTP/2 的 INITIAL_WINDOW_SIZE 配错为 0</span></span>
<span class="line"><span>      → 客户端被 0 窗口阻塞,等到超时</span></span>
<span class="line"><span>      </span></span>
<span class="line"><span>fix: nginx http2_max_concurrent_streams 配回默认</span></span></code></pre></div><h3 id="_7-2-案例二-curl-慢-5-秒但服务端日志说-200ms" tabindex="-1">7.2 案例二:curl 慢 5 秒但服务端日志说 200ms <a class="header-anchor" href="#_7-2-案例二-curl-慢-5-秒但服务端日志说-200ms" aria-label="Permalink to &quot;7.2 案例二:curl 慢 5 秒但服务端日志说 200ms&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>现象:curl 总耗时 5.1s,但服务端 access.log 说 200ms 完成</span></span>
<span class="line"><span>      </span></span>
<span class="line"><span>方法论应用:</span></span>
<span class="line"><span>  Step 1:curl -w 分段</span></span>
<span class="line"><span>    DNS 解析:5.005s   ← 锁定 DNS</span></span>
<span class="line"><span>    TCP 建连:5.045s</span></span>
<span class="line"><span>    TTFB:    5.220s</span></span>
<span class="line"><span>  Step 2:dig +trace api.example.com</span></span>
<span class="line"><span>    第一个 NS 服务器超时,5 秒后回退第二个</span></span>
<span class="line"><span>  Step 3:看本机 /etc/resolv.conf</span></span>
<span class="line"><span>    nameserver 10.0.0.99   ← 已宕机</span></span>
<span class="line"><span>    nameserver 8.8.8.8</span></span>
<span class="line"><span></span></span>
<span class="line"><span>根因:DNS 主服务器宕机,resolver 等 5s timeout 才换备用</span></span>
<span class="line"><span>fix: 调小 DNS timeout(options timeout:1) + 修主 DNS</span></span></code></pre></div><h3 id="_7-3-案例三-服务雪崩-连环超时" tabindex="-1">7.3 案例三:服务雪崩(连环超时) <a class="header-anchor" href="#_7-3-案例三-服务雪崩-连环超时" aria-label="Permalink to &quot;7.3 案例三:服务雪崩(连环超时)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>现象:某服务 P99 突然飙到 30s,下游全部超时</span></span>
<span class="line"><span>      </span></span>
<span class="line"><span>方法论应用:</span></span>
<span class="line"><span>  Step 1:看 ss -s</span></span>
<span class="line"><span>    estab 数 50000(平时 8000),timewait 0</span></span>
<span class="line"><span>    → 连接堆积,客户端不断建新连接</span></span>
<span class="line"><span>  Step 2:看 nstat</span></span>
<span class="line"><span>    TcpExtTCPListenOverflows 在涨</span></span>
<span class="line"><span>    → SYN 队列满</span></span>
<span class="line"><span>  Step 3:看应用 metrics</span></span>
<span class="line"><span>    数据库 query 平均 200ms → 5s</span></span>
<span class="line"><span>    → 数据库慢导致请求 hang,worker 占满</span></span>
<span class="line"><span>    </span></span>
<span class="line"><span>根因:数据库慢 → 应用 worker 池满 → 新请求堆 SYN 队列 → 雪崩</span></span>
<span class="line"><span>fix:</span></span>
<span class="line"><span>  紧急 → 加 worker 池 + 限流(rate limit 1/4)</span></span>
<span class="line"><span>  根治 → 数据库慢查询治理 + 加熔断器</span></span></code></pre></div><p><strong>这个案例的关键</strong>:<strong>症状是&quot;网络问题&quot;(SYN 队列溢出),但根因在应用 + 数据库</strong>——<strong>5 步分层定位法逐层往下走才能识别</strong>。</p><h3 id="_7-4-案例四-dns-偶发失败-每天几次" tabindex="-1">7.4 案例四:DNS 偶发失败(每天几次) <a class="header-anchor" href="#_7-4-案例四-dns-偶发失败-每天几次" aria-label="Permalink to &quot;7.4 案例四:DNS 偶发失败(每天几次)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>现象:每天 3-5 次,某 DNS 查询失败,持续 30 秒后自愈</span></span>
<span class="line"><span>      监控显示失败时 query timeout</span></span>
<span class="line"><span>      </span></span>
<span class="line"><span>方法论应用:</span></span>
<span class="line"><span>  Step 1:dig +trace 重现?复现率 &lt; 1%</span></span>
<span class="line"><span>  Step 2:抓包(连续抓 24 小时,过滤 udp port 53)</span></span>
<span class="line"><span>    sudo tcpdump -i any -w dns-%H.pcap -G 3600 -W 24 udp port 53</span></span>
<span class="line"><span>  Step 3:Wireshark 看失败时段</span></span>
<span class="line"><span>    UDP 53 请求发出,但响应到达前先收到一个 ICMP &quot;port unreachable&quot;</span></span>
<span class="line"><span>  Step 4:traceroute 失败时 看路径</span></span>
<span class="line"><span>    跟正常时不同,绕道一个新跳</span></span>
<span class="line"><span>    </span></span>
<span class="line"><span>根因:运营商路由偶发抖动,某条备份路径上有 DNS 黑洞</span></span>
<span class="line"><span>fix:</span></span>
<span class="line"><span>  应用 → 加本地 DNS 缓存 (CoreDNS / dnsmasq)</span></span>
<span class="line"><span>  运营 → 报工单 + 切换 resolver 到 DoH</span></span></code></pre></div><h3 id="_7-5-案例五-tls-报错-handshake-failure" tabindex="-1">7.5 案例五:TLS 报错 &quot;handshake failure&quot; <a class="header-anchor" href="#_7-5-案例五-tls-报错-handshake-failure" aria-label="Permalink to &quot;7.5 案例五:TLS 报错 &quot;handshake failure&quot;&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>现象:某客户端调 API 失败,日志:</span></span>
<span class="line"><span>      tls: handshake failure</span></span>
<span class="line"><span>      </span></span>
<span class="line"><span>方法论应用:</span></span>
<span class="line"><span>  Step 1:openssl s_client 复现</span></span>
<span class="line"><span>    openssl s_client -connect api.example.com:443</span></span>
<span class="line"><span>    → 看是不是 cipher / 版本 / SNI 问题</span></span>
<span class="line"><span>  Step 2:openssl s_client -tls1_2(强制版本)</span></span>
<span class="line"><span>    OK!→ 锁定 TLS 1.3 问题</span></span>
<span class="line"><span>  Step 3:抓包看 ClientHello → 看支持的 cipher_suites</span></span>
<span class="line"><span>    客户端只发 4 个老 cipher,服务端只接受 TLS 1.3 新 cipher</span></span>
<span class="line"><span>    </span></span>
<span class="line"><span>根因:客户端 OpenSSL 1.0.2 不支持 TLS 1.3,服务端禁了 1.2</span></span>
<span class="line"><span>fix:</span></span>
<span class="line"><span>  紧急 → 服务端临时开 TLS 1.2</span></span>
<span class="line"><span>  根治 → 客户端升 OpenSSL 1.1.1+</span></span></code></pre></div><blockquote><p>经验法则:<strong>TLS 问题 99% 用 <code>openssl s_client</code> 5 分钟内能定位</strong>——别先怀疑代码,先怀疑 cipher / 版本 / SNI / 证书链。</p></blockquote><hr><h2 id="八、排障的-软技能" tabindex="-1">八、排障的&quot;软技能&quot; <a class="header-anchor" href="#八、排障的-软技能" aria-label="Permalink to &quot;八、排障的&quot;软技能&quot;&quot;">​</a></h2><p>工具和命令外,<strong>真正影响排障速度的是&quot;做事方法&quot;</strong>:</p><h3 id="_8-1-5-个反直觉建议" tabindex="-1">8.1 5 个反直觉建议 <a class="header-anchor" href="#_8-1-5-个反直觉建议" aria-label="Permalink to &quot;8.1 5 个反直觉建议&quot;">​</a></h3><table tabindex="0"><thead><tr><th>建议</th><th>解释</th></tr></thead><tbody><tr><td><strong>先复现,再排查</strong></td><td>不能复现的问题 = 玄学,先想办法稳定复现</td></tr><tr><td><strong>改一个变量再测</strong></td><td>一次改 5 个调优项,P99 降了你不知道哪个起的作用</td></tr><tr><td><strong>保留现场再 reload</strong></td><td>服务出问题先 <code>tcpdump -w + ss -anp + dmesg</code> 落盘,再重启</td></tr><tr><td><strong>不被症状骗</strong></td><td>&quot;网络超时&quot;不一定是网络,90% 是应用</td></tr><tr><td><strong>写排障日志</strong></td><td>排完归档:症状/假设/验证/结论——3 个月后又出会感激自己</td></tr></tbody></table><h3 id="_8-2-决策框架-何时止损-vs-何时根治" tabindex="-1">8.2 决策框架:何时止损 vs 何时根治 <a class="header-anchor" href="#_8-2-决策框架-何时止损-vs-何时根治" aria-label="Permalink to &quot;8.2 决策框架:何时止损 vs 何时根治&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>紧急程度高(用户报障):</span></span>
<span class="line"><span>  → 先恢复服务(回滚 / 限流 / 重启 / 切流量)</span></span>
<span class="line"><span>  → 保留现场(pcap / coredump / metrics dump)</span></span>
<span class="line"><span>  → 事后复盘根因</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>紧急程度低(P99 微抖):</span></span>
<span class="line"><span>  → 先建假设</span></span>
<span class="line"><span>  → 抓数据验证</span></span>
<span class="line"><span>  → 改一个参数测</span></span>
<span class="line"><span>  → 滚动上线</span></span>
<span class="line"><span>  → 持续观测</span></span></code></pre></div><blockquote><p>经验法则:<strong>生产排障的 #1 守则是&quot;先恢复后排查&quot;</strong>——用户不在乎你定位多准,在乎服务多快回来。</p></blockquote><hr><h2 id="九、本系列学过的-40-章一图回顾" tabindex="-1">九、本系列学过的 40 章一图回顾 <a class="header-anchor" href="#九、本系列学过的-40-章一图回顾" aria-label="Permalink to &quot;九、本系列学过的 40 章一图回顾&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>[01-05] 心智模型</span></span>
<span class="line"><span>  └─ TCP/IP 四层、抓包入门、三视角、链路层</span></span>
<span class="line"><span></span></span>
<span class="line"><span>[06-10] 网络层</span></span>
<span class="line"><span>  └─ IPv4/IPv6、ICMP、路由(BGP)、NAT/CIDR</span></span>
<span class="line"><span></span></span>
<span class="line"><span>[11-16] 传输层 ← 最值钱</span></span>
<span class="line"><span>  └─ UDP、TCP 握手/挥手、拥塞(CUBIC/BBR)、SACK、MPTCP、调优</span></span>
<span class="line"><span></span></span>
<span class="line"><span>[17-21] 安全层</span></span>
<span class="line"><span>  └─ 密码学、TLS 1.2/1.3、mTLS、PKI</span></span>
<span class="line"><span></span></span>
<span class="line"><span>[22-26] HTTP 演进 ← 第二值钱</span></span>
<span class="line"><span>  └─ HTTP/1.1、2、3(QUIC)、WebSocket、WebRTC</span></span>
<span class="line"><span></span></span>
<span class="line"><span>[27-29] DNS</span></span>
<span class="line"><span>  └─ 协议、DoH/DoT、性能(GSLB)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>[30-33] Linux 内核网络</span></span>
<span class="line"><span>  └─ socket、epoll、io_uring、eBPF/XDP/DPDK</span></span>
<span class="line"><span></span></span>
<span class="line"><span>[34-36] 反向代理 / LB / CDN</span></span>
<span class="line"><span>  └─ Nginx、Envoy、负载均衡 + CDN 调度</span></span>
<span class="line"><span></span></span>
<span class="line"><span>[37-38] 安全防御</span></span>
<span class="line"><span>  └─ WAF/DDoS、渗透</span></span>
<span class="line"><span></span></span>
<span class="line"><span>[39-40] 排障与压测 ← 收口</span></span>
<span class="line"><span>  └─ 抓包高级、压测、方法论</span></span></code></pre></div><p><strong>整个系列的&quot;骨架&quot;</strong>:<strong>抽象→具体→工具→方法</strong>。前 38 章建知识体系,39-40 把知识体系变成&quot;反射&quot;。</p><hr><h2 id="十、踩坑提醒-总集" tabindex="-1">十、踩坑提醒(总集) <a class="header-anchor" href="#十、踩坑提醒-总集" aria-label="Permalink to &quot;十、踩坑提醒(总集)&quot;">​</a></h2><p><strong>网络排障的常见错误</strong>——出问题先翻这个清单:</p><ol><li><strong>症状当根因</strong>:用户说&quot;网络问题&quot;,真去查网络层,90% 错过应用层</li><li><strong>不复现就排</strong>:抓不到第二次的问题不是问题,是巧合</li><li><strong>同时改多个参数</strong>:测试集变量爆炸,谁起作用都不知道</li><li><strong>不留现场就重启</strong>:服务恢复了,根因永远成迷</li><li><strong>抓包不限大小</strong>:一晚上抓 200GB 把磁盘撑死</li><li><strong>看监控不看包</strong>:监控告诉你&quot;延迟高&quot;,抓包告诉你&quot;为什么&quot;</li><li><strong>跳过分层</strong>:直接抓包看协议,跳过 ss / curl 等基础命令</li><li><strong>不切视角</strong>:盯包视角 1 小时,该切时序就切</li><li><strong>不看计数器变化</strong>:<code>nstat</code> 累计值没意义,<strong>变化值</strong>才有意义</li><li><strong>混淆 BPF 过滤和显示过滤</strong>:抓不到回头怪 Wireshark</li><li><strong>不看对端日志</strong>:网络是双方的事,只看自己一半看不全</li><li><strong>以为 ping 通就是网络通</strong>:ping 是 ICMP,跟 TCP 走的不是一条快慢通道</li></ol><hr><h2 id="十一、本章-checklist" tabindex="-1">十一、本章 Checklist <a class="header-anchor" href="#十一、本章-checklist" aria-label="Permalink to &quot;十一、本章 Checklist&quot;">​</a></h2><table tabindex="0"><thead><tr><th>项</th><th>说明</th></tr></thead><tbody><tr><td>✅ 能写出&quot;分层定位法 5 步&quot;</td><td>应用 → 运输 → 网络 → 链路 → 物理</td></tr><tr><td>✅ 知道每层的&quot;3 个第一命令&quot;</td><td>反射式排障</td></tr><tr><td>✅ 背得出&quot;症状 → 可能层&quot;映射表</td><td>5 秒缩小范围</td></tr><tr><td>✅ 会看 <code>ss -s</code> / <code>nstat -rs</code> 关键计数器</td><td>TCPListenOverflows / Retrans / Drop</td></tr><tr><td>✅ 知道何时切包/时序/状态机视角</td><td>死磕 30 分钟必切</td></tr><tr><td>✅ 能用 <code>curl -w</code> 拆分耗时</td><td>DNS/TCP/TLS/TTFB 分段</td></tr><tr><td>✅ 会用 <code>openssl s_client</code> 排 TLS 问题</td><td>比看代码快 100 倍</td></tr><tr><td>✅ 会&quot;先恢复再排查&quot;</td><td>生产排障第一守则</td></tr><tr><td>✅ 写过至少一份排障 post-mortem</td><td>把经验沉淀成知识</td></tr></tbody></table><hr><h2 id="十二、系列总结" tabindex="-1">十二、系列总结 <a class="header-anchor" href="#十二、系列总结" aria-label="Permalink to &quot;十二、系列总结&quot;">​</a></h2><p>40 篇下来,<strong>网络这门学科的轮廓应该已经建立</strong>:</p><p><strong>它是分层的</strong>——TCP/IP 四层加上 TLS 中间层,每层只解决自己那点事。</p><p><strong>它是演进的</strong>——HTTP/2 修 1.1 的队头阻塞、HTTP/3 修 HTTP/2 在 TCP 层的队头阻塞、QUIC 用 UDP 重写&quot;可靠传输&quot;避开内核协议栈。<strong>任何&quot;魔法般快&quot;的优化都源于减少 RTT 或减少 syscall</strong>。</p><p><strong>它是工具密集的</strong>——七件套(tcpdump / Wireshark / dig / curl / openssl / ss / mtr)是入门门票,加上 tshark / wrk2 / h2load / iperf3 / netperf / bpftrace 是进阶,<strong>会工具不等于会排障,但不会工具一定排不出</strong>。</p><p><strong>它是反直觉的</strong>——TCP 加密窗口越大不一定越快、BBR 不一定比 CUBIC 公平、HTTP/2 在内网不一定比 HTTP/1.1 快、TLS 1.3 的 0-RTT 有重放风险。<strong>&quot;看起来对的优化&quot;在网络里永远要用数据验证</strong>。</p><p><strong>它是工程的</strong>——RFC 不是圣经,生产是。RFC 7540 说 HTTP/2 priority 应该这么实现,实际 nginx / envoy / Chrome 各有出入。<strong>懂 RFC 是基本功,懂&quot;工业实现的偏差&quot;才是高手</strong>。</p><hr><h2 id="十三、给读者的-下一步" tabindex="-1">十三、给读者的&quot;下一步&quot; <a class="header-anchor" href="#十三、给读者的-下一步" aria-label="Permalink to &quot;十三、给读者的&quot;下一步&quot;&quot;">​</a></h2><p>40 章是终点也是起点。<strong>真正的网络功力在&quot;实战&quot;</strong>——下面 5 个项目,<strong>做完一个就能在简历上多写一行,做完三个能镇住 80% 的中高级网络面试</strong>:</p><h3 id="_13-1-项目一-在生产开-bbr" tabindex="-1">13.1 项目一:在生产开 BBR <a class="header-anchor" href="#_13-1-项目一-在生产开-bbr" aria-label="Permalink to &quot;13.1 项目一:在生产开 BBR&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>门槛:Linux 4.9+</span></span>
<span class="line"><span>做法:</span></span>
<span class="line"><span>  sysctl -w net.core.default_qdisc=fq</span></span>
<span class="line"><span>  sysctl -w net.ipv4.tcp_congestion_control=bbr</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>观测:</span></span>
<span class="line"><span>  ss -i 看 cwnd 行为对比 CUBIC</span></span>
<span class="line"><span>  iperf3 测带宽对比</span></span>
<span class="line"><span>  生产 P99 对比</span></span>
<span class="line"><span></span></span>
<span class="line"><span>收获:理解拥塞控制不是&quot;开关&quot;,是&quot;对带宽的建模方式&quot;</span></span></code></pre></div><h3 id="_13-2-项目二-用-io-uring-写一个-echo-服务" tabindex="-1">13.2 项目二:用 io_uring 写一个 echo 服务 <a class="header-anchor" href="#_13-2-项目二-用-io-uring-写一个-echo-服务" aria-label="Permalink to &quot;13.2 项目二:用 io_uring 写一个 echo 服务&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>门槛:Linux 5.6+,会 C 或 Rust</span></span>
<span class="line"><span>做法:</span></span>
<span class="line"><span>  liburing API,实现 accept/read/write 全异步</span></span>
<span class="line"><span>  对比 epoll 版本的吞吐和延迟</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>收获:理解&quot;零 syscall 网络栈&quot;是怎么实现的</span></span>
<span class="line"><span>      为下一代高性能服务架构打底</span></span></code></pre></div><h3 id="_13-3-项目三-写一个-mtls-服务网关" tabindex="-1">13.3 项目三:写一个 mTLS 服务网关 <a class="header-anchor" href="#_13-3-项目三-写一个-mtls-服务网关" aria-label="Permalink to &quot;13.3 项目三:写一个 mTLS 服务网关&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>门槛:会写 Go / Rust</span></span>
<span class="line"><span>做法:</span></span>
<span class="line"><span>  自建 CA → 签客户端证书 + 服务证书</span></span>
<span class="line"><span>  Go 标准库 net/http + tls.Config 实现 mTLS</span></span>
<span class="line"><span>  加证书轮换 + 证书撤销列表(CRL)</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>收获:理解零信任 / 服务网格的核心机制</span></span>
<span class="line"><span>      面试讲 SPIFFE / Istio 不再背书</span></span></code></pre></div><h3 id="_13-4-项目四-自己搭-stun-turn-服务" tabindex="-1">13.4 项目四:自己搭 STUN + TURN 服务 <a class="header-anchor" href="#_13-4-项目四-自己搭-stun-turn-服务" aria-label="Permalink to &quot;13.4 项目四:自己搭 STUN + TURN 服务&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>门槛:有公网 IP 一台</span></span>
<span class="line"><span>做法:</span></span>
<span class="line"><span>  coturn 装一下,配 TURN secret</span></span>
<span class="line"><span>  写一个 WebRTC demo,两个浏览器 P2P 通话</span></span>
<span class="line"><span>  在 NAT 后试,看 ICE 是怎么打洞 / fallback 到 TURN</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>收获:理解 P2P 通信的工程现实</span></span>
<span class="line"><span>      理解为什么腾讯会议要建那么多边缘节点</span></span></code></pre></div><h3 id="_13-5-项目五-跟踪一个真实-http-3-请求" tabindex="-1">13.5 项目五:跟踪一个真实 HTTP/3 请求 <a class="header-anchor" href="#_13-5-项目五-跟踪一个真实-http-3-请求" aria-label="Permalink to &quot;13.5 项目五:跟踪一个真实 HTTP/3 请求&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>门槛:Wireshark 4.0+ + SSLKEYLOGFILE</span></span>
<span class="line"><span>做法:</span></span>
<span class="line"><span>  Chrome --enable-quic 访问 cloudflare / google</span></span>
<span class="line"><span>  Wireshark 解 QUIC 包(配 keylog)</span></span>
<span class="line"><span>  对比 HTTP/2:</span></span>
<span class="line"><span>    - 0-RTT 有没有真用上?</span></span>
<span class="line"><span>    - 连接迁移怎么做?(切 WiFi 看)</span></span>
<span class="line"><span>    - HEADERS frame vs HTTP/2 的 HPACK vs HTTP/3 的 QPACK</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>收获:在 RFC 9000 / 9114 不再是&quot;听过&quot;</span></span>
<span class="line"><span>      能在简历写&quot;熟悉 HTTP/3 / QUIC 协议细节&quot;</span></span></code></pre></div><hr><h2 id="十四、最后的-5-条心法" tabindex="-1">十四、最后的 5 条心法 <a class="header-anchor" href="#十四、最后的-5-条心法" aria-label="Permalink to &quot;十四、最后的 5 条心法&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 网络从来不是&quot;通&quot;或&quot;不通&quot;</span></span>
<span class="line"><span>   是&quot;快慢、抖动、丢包率、队列深度&quot;——量化才有讨论空间</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. 任何&quot;网络玄学&quot;都是因为没抓包</span></span>
<span class="line"><span>   抓了包就有证据,有证据就能定位</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. 减少 RTT 是网络优化的最大杠杆</span></span>
<span class="line"><span>   连接复用、缓存、CDN、HTTP/2 多路复用、HTTP/3 0-RTT</span></span>
<span class="line"><span>   归根到底都是&quot;少一次往返&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>4. 不要相信单一指标</span></span>
<span class="line"><span>   QPS 高不代表服务好,P99 抖才看出真问题</span></span>
<span class="line"><span>   带宽够不代表延迟低,延迟低不代表抖动小</span></span>
<span class="line"><span></span></span>
<span class="line"><span>5. &quot;懂&quot;和&quot;会&quot;的差距 = 有没有自己排过 10 个生产故障</span></span>
<span class="line"><span>   没排过故障的网络知识都是浮的——多上手、多写复盘</span></span></code></pre></div><hr><h2 id="系列完结-2026-05-10" tabindex="-1">系列完结(2026/05/10) <a class="header-anchor" href="#系列完结-2026-05-10" aria-label="Permalink to &quot;系列完结(2026/05/10)&quot;">​</a></h2><p>40 章,从「为什么要重新学一次网络」到「排障方法论」,<strong>整个 networkLearning 系列到此结束</strong>。<strong>写完它的目的不是让你&quot;懂网络&quot;,是让你&quot;做网络问题不用怕&quot;</strong>——任何症状,你都有套路、有工具、有视角、有案例可以套。</p><p>如果这个系列只能留下一句话给你,那是:<strong>抓包 + 时序 + 状态机,这三件事每天练,半年内你会变成团队里&quot;网络问题找他&quot;的那个人</strong>。</p><p>后续不再更新本系列。如果你想继续深入,推荐方向:</p><ul><li><strong>走深</strong>:挑一两个协议(QUIC / TLS 1.3 / BGP)读 RFC 全文 + 看 Linux 内核 / quiche 源码</li><li><strong>走广</strong>:补硬件方向(智能网卡 / RDMA / SR-IOV / NVMe-oF)</li><li><strong>走应用</strong>:写 Envoy filter、cilium eBPF 程序、自己 fork 一份开源代理</li><li><strong>走攻防</strong>:HackTheBox 网络方向 / OSCP / DEFCON CTF 网络题</li></ul><p><strong>networkLearning 完结。下一段是你自己的实战。</strong></p>`,128)])])}const g=a(t,[["render",l]]);export{k as __pageData,g as default};
