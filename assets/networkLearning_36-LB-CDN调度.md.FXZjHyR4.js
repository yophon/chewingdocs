import{c as a,Q as n,j as p,m as i}from"./chunks/framework.Bhbi9jCp.js";const k=JSON.parse('{"title":"负载均衡与 CDN 调度","description":"","frontmatter":{},"headers":[],"relativePath":"networkLearning/36-LB-CDN调度.md","filePath":"networkLearning/36-LB-CDN调度.md","lastUpdated":1778496697000}'),t={name:"networkLearning/36-LB-CDN调度.md"};function e(l,s,h,d,r,o){return n(),p("div",null,[...s[0]||(s[0]=[i(`<h1 id="负载均衡与-cdn-调度" tabindex="-1">负载均衡与 CDN 调度 <a class="header-anchor" href="#负载均衡与-cdn-调度" aria-label="Permalink to &quot;负载均衡与 CDN 调度&quot;">​</a></h1><p>「我用 Nginx 做 LB,加几个 backend,负载就均衡了」——这是入门视角。但<strong>真做大规模流量调度,你会发现负载均衡不是&quot;分散请求&quot;这么简单</strong>:<strong>L4 还是 L7?同一用户请求要不要落同一台?backend 挂了多久察觉?健康检查是主动 ping 还是被动统计?跨机房怎么调度?用户在巴西,我服务在北京,DNS 怎么把他指到圣保罗的边缘节点?边缘节点缓存命中率从 30% 提到 80% 那 50% 的差值 P99 能省多少?Cloudflare 怎么用 Anycast 让全球都觉得&quot;主页就在身边&quot;?CDN 回源风暴打挂源站,源站怎么保护自己?</strong>——这些是 LB 和 CDN 真正的工程命题。从 LVS(2000 年章文嵩)到 HAProxy(2001 年)到 Cloudflare 全球 Anycast(2010+),<strong>这条路线把&quot;用户感受到的快&quot;做到了极致</strong>——而懂这条路的工程师,在每家公司都是 SRE / 网关 / 基础架构岗的硬通货。</p><blockquote><p>一句话先记住:<strong>LB 的核心问题是&quot;把请求送到哪个 backend&quot;——L4 看 IP+端口,L7 看 HTTP</strong>;<strong>CDN 的核心问题是&quot;把用户送到哪个边缘节点&quot;——靠 GSLB(智能 DNS)或 Anycast(同 IP 多地播)</strong>。<strong>两层调度合起来:用户 → 最近的边缘 → 命中缓存(80%+)就直接返回,没命中才回源 → 源站再用 LB 在 backend 池里挑一个</strong>。<strong>性能优化的第一杠杆永远是减少 RTT</strong>——CDN 把 200ms 的跨洋 RTT 干到 10ms,就是这个杠杆的最大化。<strong>这一篇把这两层调度的全部算法、协议、坑一次讲清</strong>。</p></blockquote><p>承接上一篇 35-Envoy:你已经知道 Envoy 怎么做 L7 代理 + xDS 动态配置 + mTLS。<strong>这一篇把视角拉远</strong>:从单台代理(Envoy / Nginx)拉到&quot;几百台 LB + 几千个边缘节点&quot;的全球流量调度。<strong>Envoy / Nginx 是这套体系里的&quot;L7 数据面零件&quot;</strong>,LVS / HAProxy 在 L4 层补位,CDN 在用户 → 源站之间再加一层缓存和调度。</p><hr><h2 id="一、lb-全景-四层-vs-七层" tabindex="-1">一、LB 全景:四层 vs 七层 <a class="header-anchor" href="#一、lb-全景-四层-vs-七层" aria-label="Permalink to &quot;一、LB 全景:四层 vs 七层&quot;">​</a></h2><h3 id="_1-1-一图对比" tabindex="-1">1.1 一图对比 <a class="header-anchor" href="#_1-1-一图对比" aria-label="Permalink to &quot;1.1 一图对比&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>                    用户</span></span>
<span class="line"><span>                     │</span></span>
<span class="line"><span>                     ▼</span></span>
<span class="line"><span>          ┌──────────────────────┐</span></span>
<span class="line"><span>          │    L4 LB (LVS, HAProxy TCP, DPVS)  │</span></span>
<span class="line"><span>          │    决策依据:IP + 端口             │</span></span>
<span class="line"><span>          │    不解 HTTP,纯转 TCP/UDP 字节       │</span></span>
<span class="line"><span>          │    100 万 QPS 单机不眨眼              │</span></span>
<span class="line"><span>          └──────────────────────┘</span></span>
<span class="line"><span>                     │</span></span>
<span class="line"><span>                     ▼</span></span>
<span class="line"><span>          ┌──────────────────────┐</span></span>
<span class="line"><span>          │    L7 LB (Nginx, Envoy, HAProxy HTTP) │</span></span>
<span class="line"><span>          │    决策依据:URL / Host / Cookie / Header │</span></span>
<span class="line"><span>          │    解 HTTP,能改请求 / 路由           │</span></span>
<span class="line"><span>          │    单机 5-10 万 QPS                    │</span></span>
<span class="line"><span>          └──────────────────────┘</span></span>
<span class="line"><span>                     │</span></span>
<span class="line"><span>                     ▼</span></span>
<span class="line"><span>                 backend 池</span></span></code></pre></div><h3 id="_1-2-关键差异" tabindex="-1">1.2 关键差异 <a class="header-anchor" href="#_1-2-关键差异" aria-label="Permalink to &quot;1.2 关键差异&quot;">​</a></h3><table tabindex="0"><thead><tr><th>维度</th><th>L4 LB</th><th>L7 LB</th></tr></thead><tbody><tr><td>决策依据</td><td>IP + 端口</td><td>URL / Host / Header / Cookie</td></tr><tr><td>性能</td><td>~100 万 QPS</td><td>~5-10 万 QPS</td></tr><tr><td>延迟开销</td><td>&lt; 0.1 ms</td><td>0.3-1 ms</td></tr><tr><td>协议感知</td><td>无(任意 TCP/UDP)</td><td>必须 HTTP/HTTPS/gRPC</td></tr><tr><td>TLS 终止</td><td>不(直接转 TCP)</td><td>是(可以解 TLS)</td></tr><tr><td>URL 路由</td><td>不能</td><td>能</td></tr><tr><td>灰度 / canary</td><td>不能</td><td>能(按 header / weight)</td></tr><tr><td>健康检查</td><td>TCP 通就算活</td><td>HTTP 200 才算活</td></tr><tr><td>单机连接数</td><td>几百万</td><td>几十万</td></tr><tr><td>典型场景</td><td>LB 入口、MySQL 反代</td><td>API 网关、Web 前置</td></tr></tbody></table><h3 id="_1-3-真实生产架构-两层叠加" tabindex="-1">1.3 真实生产架构:两层叠加 <a class="header-anchor" href="#_1-3-真实生产架构-两层叠加" aria-label="Permalink to &quot;1.3 真实生产架构:两层叠加&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>互联网</span></span>
<span class="line"><span>  │</span></span>
<span class="line"><span>  ▼</span></span>
<span class="line"><span>[ Anycast IP ]</span></span>
<span class="line"><span>  │ (多个机房同时宣告同一 IP,BGP 引到最近)</span></span>
<span class="line"><span>  ▼</span></span>
<span class="line"><span>机房入口</span></span>
<span class="line"><span>  │</span></span>
<span class="line"><span>  ▼</span></span>
<span class="line"><span>┌─────────────────────────┐</span></span>
<span class="line"><span>│  L4 LB 集群(LVS DR 模式)  │     扛大流量,做基础分流</span></span>
<span class="line"><span>│  扛 SYN flood、CC 一级粗筛   │</span></span>
<span class="line"><span>└─────────┬───────────────┘</span></span>
<span class="line"><span>          │</span></span>
<span class="line"><span>          ▼</span></span>
<span class="line"><span>┌─────────────────────────┐</span></span>
<span class="line"><span>│  L7 LB 集群(Nginx / Envoy) │     做 URL 路由、TLS 终止、限流</span></span>
<span class="line"><span>│  按业务线分流到对应 backend     │</span></span>
<span class="line"><span>└─────────┬───────────────┘</span></span>
<span class="line"><span>          │</span></span>
<span class="line"><span>          ▼</span></span>
<span class="line"><span>   backend Pod / 实例</span></span></code></pre></div><p><strong>为什么不一层就完事</strong>:<strong>L4 扛量但路由弱,L7 路由强但扛量弱</strong>——大厂&quot;L4 + L7&quot;两层是标配。<strong>字节 / 阿里 / 美团</strong>的接入层基本都是这个结构。</p><hr><h2 id="二、l4-lb-三种模式-nat-tun-dr" tabindex="-1">二、L4 LB:三种模式(NAT / TUN / DR) <a class="header-anchor" href="#二、l4-lb-三种模式-nat-tun-dr" aria-label="Permalink to &quot;二、L4 LB:三种模式(NAT / TUN / DR)&quot;">​</a></h2><p>LVS(Linux Virtual Server,1998 年章文嵩开发,2003 进 Linux 内核)是 L4 LB 的祖宗,三种工作模式至今是教科书:</p><h3 id="_2-1-nat-模式" tabindex="-1">2.1 NAT 模式 <a class="header-anchor" href="#_2-1-nat-模式" aria-label="Permalink to &quot;2.1 NAT 模式&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>client ──→ LB(改 dst IP)──→ backend</span></span>
<span class="line"><span>                ▲                    │</span></span>
<span class="line"><span>                └──── 改 src IP ─────┘  (回包必须经 LB,改回 client 的视角)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>特点:</span></span>
<span class="line"><span>  - 配置简单</span></span>
<span class="line"><span>  - LB 是网关,所有进出都经过</span></span>
<span class="line"><span>  - 双向流量打 LB → 带宽瓶颈</span></span>
<span class="line"><span>  - 适合 &lt; 10 Gbps 场景</span></span></code></pre></div><h3 id="_2-2-tun-模式-ip-tunneling" tabindex="-1">2.2 TUN 模式(IP Tunneling) <a class="header-anchor" href="#_2-2-tun-模式-ip-tunneling" aria-label="Permalink to &quot;2.2 TUN 模式(IP Tunneling)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>client ──→ LB ──[IP-in-IP 封装]──→ backend</span></span>
<span class="line"><span>                                     │</span></span>
<span class="line"><span>                                     ▼</span></span>
<span class="line"><span>                              直接回 client(走自己的网关)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>特点:</span></span>
<span class="line"><span>  - 出口流量不经过 LB(只入口)</span></span>
<span class="line"><span>  - LB 带宽压力小 10 倍</span></span>
<span class="line"><span>  - backend 要支持 IPIP 解封装(Linux 默认有)</span></span></code></pre></div><h3 id="_2-3-dr-模式-direct-routing-生产首选" tabindex="-1">2.3 DR 模式(Direct Routing,生产首选) <a class="header-anchor" href="#_2-3-dr-模式-direct-routing-生产首选" aria-label="Permalink to &quot;2.3 DR 模式(Direct Routing,生产首选)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>client ──→ LB(只改 MAC,IP 不变)──→ backend</span></span>
<span class="line"><span>                                       │</span></span>
<span class="line"><span>                                       ▼</span></span>
<span class="line"><span>                              直接回 client</span></span>
<span class="line"><span></span></span>
<span class="line"><span>特点:</span></span>
<span class="line"><span>  - LB 和 backend 同一个 L2(同交换机/VLAN)</span></span>
<span class="line"><span>  - 几乎零开销转发(只改一个 MAC)</span></span>
<span class="line"><span>  - 单机能扛 100 万 QPS+</span></span>
<span class="line"><span>  - backend 必须配 VIP 在 lo,且关 ARP 应答(避免抢 ARP)</span></span></code></pre></div><p><strong>DR 模式的&quot;魔法&quot;</strong>:client 看到的目标 IP 就是 VIP,backend 也以为自己就是 VIP——<strong>LB 只是把 frame 的 dst MAC 改成 backend 的 MAC</strong>,<strong>IP 层完全不动</strong>。</p><h3 id="_2-4-现代-l4-lb-dpvs-katran-maglev" tabindex="-1">2.4 现代 L4 LB:DPVS / Katran / Maglev <a class="header-anchor" href="#_2-4-现代-l4-lb-dpvs-katran-maglev" aria-label="Permalink to &quot;2.4 现代 L4 LB:DPVS / Katran / Maglev&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>LVS(传统)        基于 Linux 内核 netfilter,~1M QPS</span></span>
<span class="line"><span>DPVS(爱奇艺)     LVS + DPDK,绕过内核,~10M QPS</span></span>
<span class="line"><span>Katran(Facebook) eBPF/XDP,内核级加速 + 一致性哈希,~3M QPS</span></span>
<span class="line"><span>Maglev(Google)   纯软件 LB + 一致性哈希算法,跑在普通商品机器上</span></span></code></pre></div><p><strong>思路一致</strong>:<strong>绕开 Linux 内核协议栈</strong>(走 DPDK / XDP),<strong>或者用 ebpf 在 XDP 层做转发决策</strong>——详见 33 篇 eBPF/XDP/DPDK。</p><hr><h2 id="三、l7-lb-为什么慢但是值" tabindex="-1">三、L7 LB:为什么慢但是值 <a class="header-anchor" href="#三、l7-lb-为什么慢但是值" aria-label="Permalink to &quot;三、L7 LB:为什么慢但是值&quot;">​</a></h2><h3 id="_3-1-l7-能做什么-l4-做不了" tabindex="-1">3.1 L7 能做什么 L4 做不了 <a class="header-anchor" href="#_3-1-l7-能做什么-l4-做不了" aria-label="Permalink to &quot;3.1 L7 能做什么 L4 做不了&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>按 URL 分:</span></span>
<span class="line"><span>  /api/v1/users → user-service</span></span>
<span class="line"><span>  /api/v1/orders → order-service</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>按 Host 分:</span></span>
<span class="line"><span>  api.example.com → API 集群</span></span>
<span class="line"><span>  www.example.com → 静态站</span></span>
<span class="line"><span></span></span>
<span class="line"><span>按 Header 分:</span></span>
<span class="line"><span>  User-Agent: iPhone → mobile-backend</span></span>
<span class="line"><span>  X-Region: cn → 国内集群</span></span>
<span class="line"><span></span></span>
<span class="line"><span>按 Cookie 分:</span></span>
<span class="line"><span>  sessionid → 同一用户落同一 backend(粘性会话)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>灰度:</span></span>
<span class="line"><span>  90% → v1</span></span>
<span class="line"><span>  10% → v2</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>A/B 测试:</span></span>
<span class="line"><span>  hash(user_id) % 100 &lt; 5 → 实验组</span></span></code></pre></div><h3 id="_3-2-l7-的代价" tabindex="-1">3.2 L7 的代价 <a class="header-anchor" href="#_3-2-l7-的代价" aria-label="Permalink to &quot;3.2 L7 的代价&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>解 HTTP 头:        ~10 μs</span></span>
<span class="line"><span>解 TLS:            ~50 μs(session 复用)/ ~2 ms(全握手)</span></span>
<span class="line"><span>路由匹配:          ~5 μs</span></span>
<span class="line"><span>log 写入:          ~5 μs</span></span>
<span class="line"><span>─────────</span></span>
<span class="line"><span>总开销:             ~70 μs(P50)</span></span>
<span class="line"><span>                    ~500 μs(P99,有 GC / 缓冲冲突)</span></span></code></pre></div><p><strong>比 L4 的 &lt; 100 ns 慢 1000 倍</strong>——但<strong>对于业务 50ms 的请求,加个 70μs 的 LB 没人感知</strong>。</p><h3 id="_3-3-l7-lb-选型" tabindex="-1">3.3 L7 LB 选型 <a class="header-anchor" href="#_3-3-l7-lb-选型" aria-label="Permalink to &quot;3.3 L7 LB 选型&quot;">​</a></h3><table tabindex="0"><thead><tr><th>产品</th><th>强项</th><th>弱项</th></tr></thead><tbody><tr><td><strong>Nginx</strong></td><td>配置直觉、社区大、稳</td><td>动态性差、reload 痛</td></tr><tr><td><strong>Envoy</strong></td><td>xDS 动态、可观测性强</td><td>配置复杂、学习曲线陡</td></tr><tr><td><strong>HAProxy</strong></td><td>TCP/HTTP 都强、性能极佳</td><td>历史包袱、配置语法独特</td></tr><tr><td><strong>Traefik</strong></td><td>K8s Ingress 简单</td><td>性能弱、生产规模少</td></tr><tr><td><strong>APISIX</strong></td><td>国产 OpenResty 系、插件多</td><td>生态相对小</td></tr></tbody></table><blockquote><p>经验法则:<strong>没特殊需求选 Nginx</strong>;<strong>K8s + 微服务选 Envoy / Istio</strong>;<strong>纯 TCP LB 选 HAProxy + LVS</strong>。</p></blockquote><hr><h2 id="四、lb-算法地图" tabindex="-1">四、LB 算法地图 <a class="header-anchor" href="#四、lb-算法地图" aria-label="Permalink to &quot;四、LB 算法地图&quot;">​</a></h2><h3 id="_4-1-五大经典算法" tabindex="-1">4.1 五大经典算法 <a class="header-anchor" href="#_4-1-五大经典算法" aria-label="Permalink to &quot;4.1 五大经典算法&quot;">​</a></h3><h4 id="轮询-round-robin" tabindex="-1">轮询(Round Robin) <a class="header-anchor" href="#轮询-round-robin" aria-label="Permalink to &quot;轮询(Round Robin)&quot;">​</a></h4><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>请求 1 → backend A</span></span>
<span class="line"><span>请求 2 → backend B</span></span>
<span class="line"><span>请求 3 → backend C</span></span>
<span class="line"><span>请求 4 → backend A</span></span>
<span class="line"><span>...</span></span></code></pre></div><p><strong>适合</strong>:backend 同质化(配置一样、请求耗时相近)。 <strong>不适合</strong>:有的 backend 慢,被打死。</p><h4 id="加权轮询-weighted-round-robin" tabindex="-1">加权轮询(Weighted Round Robin) <a class="header-anchor" href="#加权轮询-weighted-round-robin" aria-label="Permalink to &quot;加权轮询(Weighted Round Robin)&quot;">​</a></h4><div class="language-nginx vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">nginx</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">upstream</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> backend </span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">{</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    server</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> A </span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">weight</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">3</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;   </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 60% 流量</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    server B </span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">weight</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">1</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;   </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 20%</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    server C </span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">weight</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">1</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;   </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 20%</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span></code></pre></div><p><strong>适合</strong>:backend 配置不均(老服务器 + 新服务器混跑)。 <strong>坑</strong>:权重高的瞬间负载也高,要平滑(平滑加权算法)。</p><h4 id="最少连接-least-connections" tabindex="-1">最少连接(Least Connections) <a class="header-anchor" href="#最少连接-least-connections" aria-label="Permalink to &quot;最少连接(Least Connections)&quot;">​</a></h4><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>LB 维护每 backend 当前活跃连接数</span></span>
<span class="line"><span>新请求 → 选连接数最少的那个</span></span></code></pre></div><p><strong>适合</strong>:<strong>请求耗时差异大</strong>——快请求快还,慢请求堆在一台,LB 自动避开。 <strong>典型场景</strong>:有大文件下载 + 普通 API 混跑。</p><h4 id="一致性哈希-consistent-hashing" tabindex="-1">一致性哈希(Consistent Hashing) <a class="header-anchor" href="#一致性哈希-consistent-hashing" aria-label="Permalink to &quot;一致性哈希(Consistent Hashing)&quot;">​</a></h4><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>hash(client_ip) % 范围 → 落到环上某个位置</span></span>
<span class="line"><span>顺时针找第一个 backend 节点</span></span></code></pre></div><p><strong>详见 algorithmLearning/25 一致性哈希</strong>。<strong>关键性质</strong>:<strong>新增 / 删除一台 backend,只影响 1/N 的 key</strong>(普通 hash 会重洗 100%)。</p><p><strong>应用场景</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 缓存(同一 key 永远落同一台,缓存命中率高)</span></span>
<span class="line"><span>2. 粘性会话(同一用户永远落同一台,session 不丢)</span></span>
<span class="line"><span>3. CDN 节点选源(同一 URL 永远从同一节点回源)</span></span></code></pre></div><p><strong>Maglev 算法</strong>(Google,2016):一致性哈希的工业级改进版,<strong>Lookup table 预计算</strong>,转发时只查表,O(1)。</p><h4 id="随机-带权随机" tabindex="-1">随机 / 带权随机 <a class="header-anchor" href="#随机-带权随机" aria-label="Permalink to &quot;随机 / 带权随机&quot;">​</a></h4><p>简单粗暴,<strong>对真随机 + 大流量等效于轮询</strong>。Envoy 的 <code>RANDOM</code> 算法在大流量下表现接近轮询且实现极简。</p><h3 id="_4-2-算法对比表" tabindex="-1">4.2 算法对比表 <a class="header-anchor" href="#_4-2-算法对比表" aria-label="Permalink to &quot;4.2 算法对比表&quot;">​</a></h3><table tabindex="0"><thead><tr><th>算法</th><th>实现难度</th><th>负载均匀度</th><th>缓存友好</th><th>会话保持</th><th>加 / 减节点影响</th></tr></thead><tbody><tr><td>轮询</td><td>低</td><td>中</td><td>差</td><td>不</td><td>100% 重新分布</td></tr><tr><td>加权轮询</td><td>低</td><td>中</td><td>差</td><td>不</td><td>100% 重新分布</td></tr><tr><td>最少连接</td><td>中</td><td>好</td><td>差</td><td>不</td><td>自适应</td></tr><tr><td>一致性哈希</td><td>中</td><td>中(虚拟节点改善)</td><td>极好</td><td>是</td><td>1/N</td></tr><tr><td>随机</td><td>极低</td><td>中(大流量好)</td><td>差</td><td>不</td><td>100%</td></tr></tbody></table><h3 id="_4-3-用-nginx-envoy-配" tabindex="-1">4.3 用 nginx / envoy 配 <a class="header-anchor" href="#_4-3-用-nginx-envoy-配" aria-label="Permalink to &quot;4.3 用 nginx / envoy 配&quot;">​</a></h3><div class="language-nginx vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">nginx</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Nginx</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">upstream</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> backend </span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">{</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    least_conn</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;          </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 或 ip_hash;  hash $request_uri consistent;</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    server</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 10.0.0.1:8080;</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    server</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 10.0.0.2:8080;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span></code></pre></div><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Envoy</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">clusters</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">- </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">backend</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  lb_policy</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">LEAST_REQUEST</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">     # 或 RING_HASH / MAGLEV / ROUND_ROBIN</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  ring_hash_lb_config</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    minimum_ring_size</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">1024</span></span></code></pre></div><hr><h2 id="五、会话保持-粘性还是分布式" tabindex="-1">五、会话保持:粘性还是分布式 <a class="header-anchor" href="#五、会话保持-粘性还是分布式" aria-label="Permalink to &quot;五、会话保持:粘性还是分布式&quot;">​</a></h2><h3 id="_5-1-三种实现" tabindex="-1">5.1 三种实现 <a class="header-anchor" href="#_5-1-三种实现" aria-label="Permalink to &quot;5.1 三种实现&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. Source IP Hash(L4)</span></span>
<span class="line"><span>   优点:LB 无状态,简单</span></span>
<span class="line"><span>   缺点:NAT 后的客户(公司出口)全部落同一台</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. Cookie 注入(L7)</span></span>
<span class="line"><span>   LB 给响应加 Set-Cookie: SERVERID=A</span></span>
<span class="line"><span>   后续请求按 Cookie 路由</span></span>
<span class="line"><span>   缺点:LB 必须有状态(或 Cookie 包含 backend 信息)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. App-Level Session Sharing(根本方案)</span></span>
<span class="line"><span>   把 session 放 Redis / DB,任意 backend 都能读</span></span>
<span class="line"><span>   完全无状态,LB 想怎么调度都行</span></span></code></pre></div><h3 id="_5-2-nginx-配-cookie-粘性-商业版独有-开源版只能-ip-hash" tabindex="-1">5.2 Nginx 配 Cookie 粘性(商业版独有,开源版只能 ip_hash) <a class="header-anchor" href="#_5-2-nginx-配-cookie-粘性-商业版独有-开源版只能-ip-hash" aria-label="Permalink to &quot;5.2 Nginx 配 Cookie 粘性(商业版独有,开源版只能 ip_hash)&quot;">​</a></h3><div class="language-nginx vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">nginx</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">upstream</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> backend </span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">{</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    server</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 10.0.0.1:8080;</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    server</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> 10.0.0.2:8080;</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    sticky </span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">cookie srv_id expires=1h domain=.example.com path=/;   </span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># NGINX Plus</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span></code></pre></div><p>开源版用 <code>ip_hash</code> 替代,但精度差。</p><h3 id="_5-3-实战-为什么大厂都不用粘性" tabindex="-1">5.3 实战:为什么大厂都不用粘性 <a class="header-anchor" href="#_5-3-实战-为什么大厂都不用粘性" aria-label="Permalink to &quot;5.3 实战:为什么大厂都不用粘性&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>粘性会话的根本问题:</span></span>
<span class="line"><span>  1. 一台 backend 挂了 → 上面的 session 全丢</span></span>
<span class="line"><span>  2. 扩缩容时 hash 重新分布 → 一波重新登录</span></span>
<span class="line"><span>  3. 跨机房灾备时 session 没法迁</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>解药:</span></span>
<span class="line"><span>  把 session 移出 backend → Redis / 自研 KV</span></span>
<span class="line"><span>  backend 完全无状态 → 任意 LB 算法</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>代价:</span></span>
<span class="line"><span>  每个请求多 1 次 Redis 读(~1ms)</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>但拿到了:</span></span>
<span class="line"><span>  无限扩缩、零停机、跨机房灾备</span></span></code></pre></div><blockquote><p>经验法则:<strong>粘性会话是上世纪的技术</strong>——所有新系统应该 stateless backend + 共享 session 存储。</p></blockquote><hr><h2 id="六、健康检查-别让-lb-把请求扔到死人手里" tabindex="-1">六、健康检查:别让 LB 把请求扔到死人手里 <a class="header-anchor" href="#六、健康检查-别让-lb-把请求扔到死人手里" aria-label="Permalink to &quot;六、健康检查:别让 LB 把请求扔到死人手里&quot;">​</a></h2><h3 id="_6-1-主动-vs-被动" tabindex="-1">6.1 主动 vs 被动 <a class="header-anchor" href="#_6-1-主动-vs-被动" aria-label="Permalink to &quot;6.1 主动 vs 被动&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>主动健康检查:</span></span>
<span class="line"><span>  LB 定时(如 5s)向 backend 发 GET /healthz</span></span>
<span class="line"><span>  连续 N 次失败 → 标记 down</span></span>
<span class="line"><span>  连续 M 次成功 → 标记 up</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>被动健康检查:</span></span>
<span class="line"><span>  统计实际请求的失败率</span></span>
<span class="line"><span>  达到阈值 → 标记 down(或 outlier eject)</span></span>
<span class="line"><span>  一段时间后再让一点点流量过去试探</span></span></code></pre></div><h3 id="_6-2-主动检查的-trade-off" tabindex="-1">6.2 主动检查的 trade-off <a class="header-anchor" href="#_6-2-主动检查的-trade-off" aria-label="Permalink to &quot;6.2 主动检查的 trade-off&quot;">​</a></h3><table tabindex="0"><thead><tr><th>参数</th><th>太大</th><th>太小</th></tr></thead><tbody><tr><td>检查间隔</td><td>故障检测慢(分钟级)</td><td>健康检查请求把 backend 打满</td></tr><tr><td>超时</td><td>慢响应误判健康</td><td>网络抖动误判挂</td></tr><tr><td>失败阈值</td><td>故障检测延迟</td><td>误判频繁</td></tr></tbody></table><p><strong>典型生产配置</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>间隔 5s,超时 1s,连续失败 3 次标记 down</span></span>
<span class="line"><span>→ 故障检测延迟 ~15s</span></span>
<span class="line"><span>→ /healthz 请求 = 12 次/分钟/backend,可忽略</span></span></code></pre></div><h3 id="_6-3-healthz-应该检查什么" tabindex="-1">6.3 /healthz 应该检查什么 <a class="header-anchor" href="#_6-3-healthz-应该检查什么" aria-label="Permalink to &quot;6.3 /healthz 应该检查什么&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>浅:</span></span>
<span class="line"><span>  GET /healthz → return 200</span></span>
<span class="line"><span>  问题:进程还在但数据库挂了,LB 看不见</span></span>
<span class="line"><span></span></span>
<span class="line"><span>深:</span></span>
<span class="line"><span>  GET /healthz 内部:</span></span>
<span class="line"><span>    1. ping DB,500ms 内通</span></span>
<span class="line"><span>    2. ping Redis,200ms 内通</span></span>
<span class="line"><span>    3. 检查内部 metric(队列堆积量 &lt; 阈值)</span></span>
<span class="line"><span>  失败任一项 → 503</span></span>
<span class="line"><span></span></span>
<span class="line"><span>代价:</span></span>
<span class="line"><span>  健康检查本身可能引发问题(检查 DB 把 DB 打慢)</span></span>
<span class="line"><span>  → 主接口和健康检查接口分开,健康检查内部缓存 1s</span></span></code></pre></div><h3 id="_6-4-慢启动-slow-start" tabindex="-1">6.4 慢启动(Slow Start) <a class="header-anchor" href="#_6-4-慢启动-slow-start" aria-label="Permalink to &quot;6.4 慢启动(Slow Start)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>backend 刚起来 / 刚 up:</span></span>
<span class="line"><span>  JIT 还没热、连接池还空、缓存空</span></span>
<span class="line"><span>  → 立刻打满 100% 流量必崩</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>慢启动:</span></span>
<span class="line"><span>  前 30s 流量从 0% 线性涨到 100%</span></span>
<span class="line"><span>  → 给系统时间预热</span></span></code></pre></div><p>Nginx Plus 和 Envoy 都支持。<strong>开源 Nginx 没有,要 lua 实现</strong>。</p><h3 id="_6-5-异常驱逐-outlier-detection-envoy-独门" tabindex="-1">6.5 异常驱逐(Outlier Detection,Envoy 独门) <a class="header-anchor" href="#_6-5-异常驱逐-outlier-detection-envoy-独门" aria-label="Permalink to &quot;6.5 异常驱逐(Outlier Detection,Envoy 独门)&quot;">​</a></h3><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">outlier_detection</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  consecutive_5xx</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">5</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">             # 连续 5 个 5xx</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  interval</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">10s</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">                   # 检查间隔</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  base_ejection_time</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">30s</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">         # 第一次驱逐 30s</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  max_ejection_percent</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">50</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">         # 最多驱逐 50% 节点(避免雪崩)</span></span></code></pre></div><p><strong>特别强</strong>:<strong>自动驱逐 + 自动恢复</strong>,不需要人工介入。<strong>驱逐时间指数级增长</strong>(30s → 60s → 120s),反复出问题的节点关得越久。</p><hr><h2 id="七、cdn-把内容推到用户身边" tabindex="-1">七、CDN:把内容推到用户身边 <a class="header-anchor" href="#七、cdn-把内容推到用户身边" aria-label="Permalink to &quot;七、CDN:把内容推到用户身边&quot;">​</a></h2><h3 id="_7-1-为什么需要" tabindex="-1">7.1 为什么需要 <a class="header-anchor" href="#_7-1-为什么需要" aria-label="Permalink to &quot;7.1 为什么需要&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>没 CDN:</span></span>
<span class="line"><span>  用户在巴西 → 请求源站(北京)→ RTT 250ms</span></span>
<span class="line"><span>  100 张图 = 100 × 250ms = 25 秒首屏</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>有 CDN:</span></span>
<span class="line"><span>  用户在巴西 → 请求最近的 CDN 边缘(圣保罗)→ RTT 10ms</span></span>
<span class="line"><span>  命中缓存 → 直接返回 → 100 张图 = 1 秒</span></span>
<span class="line"><span>  没命中 → 边缘代回源 → 用户感知 ~RTT 25ms × 1 倍数</span></span></code></pre></div><p><strong>性能优化的最大杠杆永远是 RTT</strong>——CDN 是这个杠杆的物理化体现。</p><h3 id="_7-2-cdn-三件套" tabindex="-1">7.2 CDN 三件套 <a class="header-anchor" href="#_7-2-cdn-三件套" aria-label="Permalink to &quot;7.2 CDN 三件套&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 边缘节点(POP, Point of Presence)</span></span>
<span class="line"><span>   全球部署几百-几千个机房</span></span>
<span class="line"><span>   每个机房有 反代 + 缓存</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. 调度系统(GSLB / Anycast)</span></span>
<span class="line"><span>   决定:用户请求 → 哪个 POP</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. 回源系统</span></span>
<span class="line"><span>   POP 没命中时怎么回源:</span></span>
<span class="line"><span>     直接回源(简单,源站压力大)</span></span>
<span class="line"><span>     层级回源(POP → 区域中心 → 源站)</span></span>
<span class="line"><span>     回源限流 + 鉴权</span></span></code></pre></div><hr><h2 id="八、cdn-调度-gslb-dns-vs-anycast" tabindex="-1">八、CDN 调度:GSLB DNS vs Anycast <a class="header-anchor" href="#八、cdn-调度-gslb-dns-vs-anycast" aria-label="Permalink to &quot;八、CDN 调度:GSLB DNS vs Anycast&quot;">​</a></h2><h3 id="_8-1-gslb-global-server-load-balancing" tabindex="-1">8.1 GSLB(Global Server Load Balancing) <a class="header-anchor" href="#_8-1-gslb-global-server-load-balancing" aria-label="Permalink to &quot;8.1 GSLB(Global Server Load Balancing)&quot;">​</a></h3><p><strong>核心</strong>:<strong>用 DNS 把不同地理位置的用户解析到不同 IP</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>user 在北京:  dig cdn.example.com → 1.1.1.1(北京边缘)</span></span>
<span class="line"><span>user 在巴西:  dig cdn.example.com → 2.2.2.2(圣保罗边缘)</span></span>
<span class="line"><span>user 在伦敦:  dig cdn.example.com → 3.3.3.3(伦敦边缘)</span></span></code></pre></div><p><strong>怎么知道 user 在哪</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 看 DNS 请求源 IP(其实是 Local DNS 的 IP)</span></span>
<span class="line"><span>2. 查 IP 库 → 地理位置</span></span>
<span class="line"><span>3. 选最近的 POP IP 返回</span></span></code></pre></div><p><strong>EDNS Client Subnet (ECS)</strong>:DNS 查询里多带一个字段告诉权威 DNS&quot;实际客户端的 IP 段&quot;——避免&quot;用户在巴西,但用了美国的 8.8.8.8 DNS,结果被指到美国&quot;。<strong>详见 networkLearning/29-DNS 性能优化</strong>。</p><h3 id="_8-2-anycast" tabindex="-1">8.2 Anycast <a class="header-anchor" href="#_8-2-anycast" aria-label="Permalink to &quot;8.2 Anycast&quot;">​</a></h3><p><strong>核心</strong>:<strong>多个机房宣告同一个 IP,BGP 路由让用户走最近的</strong>。</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>机房 A、B、C 都宣告 IP 1.1.1.1</span></span>
<span class="line"><span>                 │</span></span>
<span class="line"><span>                 ▼</span></span>
<span class="line"><span>                 BGP</span></span>
<span class="line"><span>  ┌──────────────┼──────────────┐</span></span>
<span class="line"><span>  ▼              ▼              ▼</span></span>
<span class="line"><span>beijing user → A  brazil user → B  london user → C</span></span>
<span class="line"><span>(routing 自动选最近的 hop)</span></span></code></pre></div><p><strong>Cloudflare 全球用 Anycast</strong>——一个 IP(如 1.1.1.1)在全球几百个节点同时宣告,<strong>BGP 自然把流量引到最近的</strong>。</p><h3 id="_8-3-两者对比" tabindex="-1">8.3 两者对比 <a class="header-anchor" href="#_8-3-两者对比" aria-label="Permalink to &quot;8.3 两者对比&quot;">​</a></h3><table tabindex="0"><thead><tr><th>维度</th><th>GSLB DNS</th><th>Anycast</th></tr></thead><tbody><tr><td>调度依据</td><td>IP 库 + 地理</td><td>BGP routing</td></tr><tr><td>切换故障节点</td><td>改 DNS,TTL 等待几分钟</td><td>BGP 撤销,几秒</td></tr><tr><td>精度</td><td>受 LDNS 影响</td><td>物理网络精度</td></tr><tr><td>部署复杂度</td><td>中(智能 DNS)</td><td>高(要 BGP + 自治系统号)</td></tr><tr><td>成本</td><td>低</td><td>高</td></tr><tr><td>一台节点压力均衡</td><td>难</td><td>自然均衡</td></tr></tbody></table><p><strong>实际</strong>:<strong>大厂两个都用</strong>——GSLB 做粗粒度调度,Anycast 在每个 POP 内做精细化。</p><h3 id="_8-4-自己测一下-gslb" tabindex="-1">8.4 自己测一下 GSLB <a class="header-anchor" href="#_8-4-自己测一下-gslb" aria-label="Permalink to &quot;8.4 自己测一下 GSLB&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 在不同地区机器跑(或用 dig +subnet 模拟)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> dig</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> www.cloudflare.com</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">$</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> dig</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> www.cloudflare.com</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> @1.1.1.1</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> +subnet=1.1.1.1/24</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 看返回的 IP 是不是不同</span></span></code></pre></div><hr><h2 id="九、cdn-缓存策略" tabindex="-1">九、CDN 缓存策略 <a class="header-anchor" href="#九、cdn-缓存策略" aria-label="Permalink to &quot;九、CDN 缓存策略&quot;">​</a></h2><h3 id="_9-1-cache-control-是命" tabindex="-1">9.1 Cache-Control 是命 <a class="header-anchor" href="#_9-1-cache-control-是命" aria-label="Permalink to &quot;9.1 Cache-Control 是命&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>源站返:</span></span>
<span class="line"><span>  Cache-Control: public, max-age=3600, s-maxage=86400</span></span>
<span class="line"><span>       │           │            │            │</span></span>
<span class="line"><span>       │           │            │            └─ CDN 缓存 1 天</span></span>
<span class="line"><span>       │           │            └─ 浏览器缓存 1 小时</span></span>
<span class="line"><span>       │           └─ 公共资源(任何缓存可缓存)</span></span>
<span class="line"><span>       └─ 缓存控制</span></span></code></pre></div><table tabindex="0"><thead><tr><th>指令</th><th>含义</th></tr></thead><tbody><tr><td><code>public</code></td><td>任何缓存可缓存(浏览器 + CDN)</td></tr><tr><td><code>private</code></td><td>只浏览器缓存(CDN 不缓存)</td></tr><tr><td><code>no-cache</code></td><td>缓存但用前必须 revalidate</td></tr><tr><td><code>no-store</code></td><td>不缓存(支付 / 隐私数据)</td></tr><tr><td><code>max-age=N</code></td><td>缓存 N 秒(浏览器)</td></tr><tr><td><code>s-maxage=N</code></td><td>共享缓存(CDN) N 秒</td></tr><tr><td><code>stale-while-revalidate=N</code></td><td>过期后 N 秒内仍可用旧缓存 + 异步刷新</td></tr><tr><td><code>immutable</code></td><td>永远不变(适合 hash 文件名)</td></tr></tbody></table><h3 id="_9-2-三类内容的缓存策略" tabindex="-1">9.2 三类内容的缓存策略 <a class="header-anchor" href="#_9-2-三类内容的缓存策略" aria-label="Permalink to &quot;9.2 三类内容的缓存策略&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>静态资源(JS/CSS/图片,带 hash 文件名):</span></span>
<span class="line"><span>  Cache-Control: public, max-age=31536000, immutable</span></span>
<span class="line"><span>  → 1 年 + 永不变 → CDN 命中率接近 100%</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>动态 HTML:</span></span>
<span class="line"><span>  Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=60</span></span>
<span class="line"><span>  → 浏览器 1 分钟,CDN 5 分钟</span></span>
<span class="line"><span>  → 过期 1 分钟内仍能用旧的(避免穿透)</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>API:</span></span>
<span class="line"><span>  Cache-Control: private, no-store</span></span>
<span class="line"><span>  → 不缓存(每个用户数据不同)</span></span></code></pre></div><h3 id="_9-3-缓存-key-怎么定义" tabindex="-1">9.3 缓存 key 怎么定义 <a class="header-anchor" href="#_9-3-缓存-key-怎么定义" aria-label="Permalink to &quot;9.3 缓存 key 怎么定义&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>默认 key = scheme + host + path + querystring</span></span>
<span class="line"><span></span></span>
<span class="line"><span>要按 cookie 区分:</span></span>
<span class="line"><span>  Vary: Cookie         (不推荐,缓存命中率崩)</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>要按语言区分:</span></span>
<span class="line"><span>  Vary: Accept-Language</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>要忽略某些 query 参数:</span></span>
<span class="line"><span>  Cloudflare / 阿里云的&quot;query string white list&quot;</span></span></code></pre></div><blockquote><p>经验法则:<strong>Vary 用得越多,缓存命中率越低</strong>——只用最必要的(<code>Accept-Encoding</code> 几乎必加)。</p></blockquote><h3 id="_9-4-主动-purge-和预热" tabindex="-1">9.4 主动 purge 和预热 <a class="header-anchor" href="#_9-4-主动-purge-和预热" aria-label="Permalink to &quot;9.4 主动 purge 和预热&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>purge:</span></span>
<span class="line"><span>  发布新版本时,主动清掉旧 URL 的缓存</span></span>
<span class="line"><span>  CDN API: POST /purge {urls: [...]}</span></span>
<span class="line"><span>  几秒到几分钟全球生效</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>预热(prefetch):</span></span>
<span class="line"><span>  发布前主动访问一遍 URL → CDN 提前缓存</span></span>
<span class="line"><span>  避免首批用户穿透回源</span></span></code></pre></div><h3 id="_9-5-回源-cdn-没命中时" tabindex="-1">9.5 回源:CDN 没命中时 <a class="header-anchor" href="#_9-5-回源-cdn-没命中时" aria-label="Permalink to &quot;9.5 回源:CDN 没命中时&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>用户 → 边缘 POP(没命中) → 回源</span></span>
<span class="line"><span>                              │</span></span>
<span class="line"><span>                     ┌────────┴────────┐</span></span>
<span class="line"><span>                     ▼                 ▼</span></span>
<span class="line"><span>              直接回源站           层级回源</span></span>
<span class="line"><span>              (简单)               用户 → POP → 区域中心 → 源站</span></span>
<span class="line"><span>                                    └─ 多个 POP 共享区域中心的缓存</span></span>
<span class="line"><span>                                    └─ 大幅降低源站压力</span></span></code></pre></div><p><strong>回源 collapse(回源合并)</strong>:</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>没合并:</span></span>
<span class="line"><span>  100 个 POP 同时穿透 → 源站收到 100 个请求</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>合并:</span></span>
<span class="line"><span>  100 个 POP 中第 1 个去回源</span></span>
<span class="line"><span>  其他 99 个等结果</span></span>
<span class="line"><span>  → 源站只收 1 个请求</span></span></code></pre></div><hr><h2 id="十、源站保护-别让-cdn-反过来打挂你" tabindex="-1">十、源站保护:别让 CDN 反过来打挂你 <a class="header-anchor" href="#十、源站保护-别让-cdn-反过来打挂你" aria-label="Permalink to &quot;十、源站保护:别让 CDN 反过来打挂你&quot;">​</a></h2><h3 id="_10-1-回源风暴的来源" tabindex="-1">10.1 回源风暴的来源 <a class="header-anchor" href="#_10-1-回源风暴的来源" aria-label="Permalink to &quot;10.1 回源风暴的来源&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 缓存集体过期(同一时刻)</span></span>
<span class="line"><span>2. 攻击者构造大量 cache miss URL</span></span>
<span class="line"><span>3. 发布后预热没做完就开放</span></span>
<span class="line"><span>4. CDN 节点故障切换,新节点全 cold cache</span></span></code></pre></div><h3 id="_10-2-五道防线" tabindex="-1">10.2 五道防线 <a class="header-anchor" href="#_10-2-五道防线" aria-label="Permalink to &quot;10.2 五道防线&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 回源限流</span></span>
<span class="line"><span>   CDN 边缘节点设回源 QPS 上限</span></span>
<span class="line"><span>   超过 → 用 stale 缓存(stale-while-revalidate / use_stale)</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>2. 回源鉴权</span></span>
<span class="line"><span>   只有 CDN 节点 IP 能直连源站</span></span>
<span class="line"><span>   或者 CDN 给请求签名,源站验签</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>3. 源站本地缓存(双层缓存)</span></span>
<span class="line"><span>   源站前再放一层 nginx + proxy_cache</span></span>
<span class="line"><span>   CDN 没命中 → 源站缓存命中 → 不打 backend</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>4. 自适应缓存延长</span></span>
<span class="line"><span>   源站压力大时,自动延长 max-age</span></span>
<span class="line"><span>   牺牲数据新鲜度换稳定性</span></span>
<span class="line"><span>   </span></span>
<span class="line"><span>5. 回源 collapse + cache lock</span></span>
<span class="line"><span>   nginx 的 proxy_cache_lock(见 34 篇)</span></span></code></pre></div><h3 id="_10-3-鉴权回源-怎么防-绕过-cdn-直接打源站" tabindex="-1">10.3 鉴权回源:怎么防&quot;绕过 CDN 直接打源站&quot; <a class="header-anchor" href="#_10-3-鉴权回源-怎么防-绕过-cdn-直接打源站" aria-label="Permalink to &quot;10.3 鉴权回源:怎么防&quot;绕过 CDN 直接打源站&quot;&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>方案 1:IP 白名单</span></span>
<span class="line"><span>  源站 nginx 只允许 CDN 节点 IP 段</span></span>
<span class="line"><span>  CDN 厂商提供 IP 段列表</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>方案 2:Token 签名</span></span>
<span class="line"><span>  CDN 在请求头加 X-Cdn-Signature: HMAC-SHA256(timestamp + path, secret)</span></span>
<span class="line"><span>  源站验签</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>方案 3:mTLS</span></span>
<span class="line"><span>  CDN 节点持客户端证书,源站只接受持证客户端</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>方案 4:私网链路(BGP / 专线)</span></span>
<span class="line"><span>  源站只暴露在内网,CDN 通过专线访问</span></span>
<span class="line"><span>  最贵但最稳</span></span></code></pre></div><hr><h2 id="十一、边缘计算-不只是缓存" tabindex="-1">十一、边缘计算:不只是缓存 <a class="header-anchor" href="#十一、边缘计算-不只是缓存" aria-label="Permalink to &quot;十一、边缘计算:不只是缓存&quot;">​</a></h2><h3 id="_11-1-cloudflare-workers-vercel-edge-fastly-compute-edge" tabindex="-1">11.1 Cloudflare Workers / Vercel Edge / Fastly Compute@Edge <a class="header-anchor" href="#_11-1-cloudflare-workers-vercel-edge-fastly-compute-edge" aria-label="Permalink to &quot;11.1 Cloudflare Workers / Vercel Edge / Fastly Compute@Edge&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>传统 CDN:</span></span>
<span class="line"><span>  边缘节点只能 缓存 + 转发</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>边缘计算:</span></span>
<span class="line"><span>  边缘节点能跑代码(JS / Rust / WebAssembly)</span></span>
<span class="line"><span>  → 鉴权、A/B、个性化、SSR 全在边缘做</span></span>
<span class="line"><span>  → 完全不回源也能返回动态响应</span></span></code></pre></div><p><strong>一段 Cloudflare Worker</strong>:</p><div class="language-javascript vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">javascript</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">addEventListener</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;fetch&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">event</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =&gt;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  event.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">respondWith</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">handle</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(event.request))</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">})</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">async</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> function</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> handle</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">req</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">) {</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  // 在边缘做地理判断</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">  const</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> country</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> req.cf.country</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">  if</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (country </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">===</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;CN&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">) {</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">    return</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> Response.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">redirect</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;https://cn.example.com&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">302</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  }</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  </span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  // 边缘缓存</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">  const</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> cache</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> caches.default</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">  let</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> resp </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> await</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> cache.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">match</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(req)</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">  if</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> (resp) </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">return</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> resp</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  </span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  // 回源</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  resp </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> await</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> fetch</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(req)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  resp </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> new</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> Response</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(resp.body, resp)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  resp.headers.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">set</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;Cache-Control&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&#39;max-age=300&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  event.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">waitUntil</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(cache.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">put</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(req, resp.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">clone</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">()))</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">  return</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> resp</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span></code></pre></div><p><strong>优势</strong>:<strong>用户 → 边缘 ~5ms,边缘上跑 V8 isolate ~1ms → 总 6ms 返回</strong>——比&quot;边缘 → 源站&quot;快几十倍。</p><h3 id="_11-2-边缘的限制" tabindex="-1">11.2 边缘的限制 <a class="header-anchor" href="#_11-2-边缘的限制" aria-label="Permalink to &quot;11.2 边缘的限制&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>CPU 时间限制:Workers 50ms / 请求(免费版 10ms)</span></span>
<span class="line"><span>内存:128MB</span></span>
<span class="line"><span>持久存储:KV(读快写慢)/ D1(SQLite at edge)</span></span>
<span class="line"><span>不能开 TCP socket(只能 HTTP fetch 出去)</span></span></code></pre></div><p><strong>适合</strong>:鉴权、路由、SSR、个性化、A/B、API 聚合。 <strong>不适合</strong>:CPU 密集(图像处理)、长连接、复杂业务。</p><hr><h2 id="十二、监控指标-lb-和-cdn-该看什么" tabindex="-1">十二、监控指标:LB 和 CDN 该看什么 <a class="header-anchor" href="#十二、监控指标-lb-和-cdn-该看什么" aria-label="Permalink to &quot;十二、监控指标:LB 和 CDN 该看什么&quot;">​</a></h2><h3 id="_12-1-lb-指标" tabindex="-1">12.1 LB 指标 <a class="header-anchor" href="#_12-1-lb-指标" aria-label="Permalink to &quot;12.1 LB 指标&quot;">​</a></h3><table tabindex="0"><thead><tr><th>指标</th><th>阈值</th><th>含义</th></tr></thead><tbody><tr><td>QPS</td><td>看历史基线</td><td>流量水位</td></tr><tr><td>P50 / P99 / P999 延迟</td><td>P99 &lt; 100ms</td><td>用户体验</td></tr><tr><td>5xx 比例</td><td>&lt; 0.1%</td><td>错误率</td></tr><tr><td>backend up 数</td><td>== 总数</td><td>健康状态</td></tr><tr><td>连接数</td><td>看上限</td><td>是否要扩</td></tr><tr><td>TLS 握手时间 P99</td><td>&lt; 100ms</td><td>session 复用是否正常</td></tr><tr><td>upstream 连接失败</td><td>~0</td><td>backend 是否健康</td></tr></tbody></table><h3 id="_12-2-cdn-指标" tabindex="-1">12.2 CDN 指标 <a class="header-anchor" href="#_12-2-cdn-指标" aria-label="Permalink to &quot;12.2 CDN 指标&quot;">​</a></h3><table tabindex="0"><thead><tr><th>指标</th><th>阈值</th><th>含义</th></tr></thead><tbody><tr><td>缓存命中率</td><td>&gt; 80%(理想 95%+)</td><td>缓存配置是否合理</td></tr><tr><td>回源带宽</td><td>&lt; 总带宽 5%</td><td>源站压力</td></tr><tr><td>回源 QPS</td><td>远小于总 QPS</td><td>回源风暴预警</td></tr><tr><td>边缘 P99 延迟</td><td>&lt; 50ms</td><td>用户体验</td></tr><tr><td>5xx 比例</td><td>&lt; 0.01%</td><td>错误率</td></tr><tr><td>Bandwidth Saved</td><td>越高越好</td><td>CDN 价值体现</td></tr></tbody></table><h3 id="_12-3-一个真实案例" tabindex="-1">12.3 一个真实案例 <a class="header-anchor" href="#_12-3-一个真实案例" aria-label="Permalink to &quot;12.3 一个真实案例&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>现象:某 API P99 从 80ms 飙到 800ms</span></span>
<span class="line"><span>排查路径:</span></span>
<span class="line"><span>  1. 看 LB metric → 发现 backend P99 也 800ms → 锅在 backend</span></span>
<span class="line"><span>  2. 看 backend metric → DB 查询 P99 飙</span></span>
<span class="line"><span>  3. 看 DB metric → 一个慢查询打满 CPU</span></span>
<span class="line"><span>  4. 看 trace → 一个新业务上线带了 N+1 查询</span></span>
<span class="line"><span>  </span></span>
<span class="line"><span>关键:监控分层 → 一层一层往下推</span></span>
<span class="line"><span>没监控 → 瞎猜 → 修错地方</span></span></code></pre></div><hr><h2 id="十三、踩坑提醒" tabindex="-1">十三、踩坑提醒 <a class="header-anchor" href="#十三、踩坑提醒" aria-label="Permalink to &quot;十三、踩坑提醒&quot;">​</a></h2><ol><li><strong>L4 LB 和 L7 LB 不分</strong>——单纯 TCP 转发用 L4,需要 URL 路由用 L7</li><li><strong>DR 模式 backend 没绑 VIP / 没关 ARP</strong>——VIP 在网络上&quot;消失&quot;</li><li><strong>NAT 模式撑大流量</strong>——LB 入口出口双向打,~1Gbps 就崩</li><li><strong>健康检查间隔 1s</strong>——backend 多了 health check 自己把 backend 打挂</li><li><strong>/healthz 没检查依赖</strong>——进程在但 DB 挂,LB 还在转</li><li><strong>粘性会话上规模</strong>——backend 重启时 session 集体丢</li><li><strong>DNS TTL 设几小时</strong>——故障切换要等几小时,设 60s</li><li><strong>CDN 不区分 query 参数</strong>——有 ?utm_source=xx 的 URL 重复缓存,命中率崩</li><li><strong>Cache-Control 不带 s-maxage</strong>——CDN 用 max-age,浏览器缓存失效时 CDN 也失效</li><li><strong>回源没鉴权</strong>——攻击者扫描出源站 IP 直接打,绕过 CDN 防护</li><li><strong>缓存集体过期</strong>——同时间发布的资源都设 max-age=86400 → 第二天同时间集体回源</li><li><strong>CDN purge 太频繁</strong>——每改一行就 purge 全部 → 命中率几乎 0</li><li><strong>Anycast 没考虑长连接</strong>——BGP 路由变化时,长连接被引到别的节点,直接 RST</li><li><strong>以为 ECS 一定准</strong>——很多 LDNS 不支持 ECS,大段 IP 用同一个解析结果</li><li><strong>边缘 Worker 里调外部 API 没缓存</strong>——每次都往外打,边缘性能优势抵消</li></ol><hr><p>下一篇:<code>37-WAF与DDoS防御.md</code>,讲完了&quot;怎么把流量送到对的地方&quot;,该讲&quot;怎么把坏流量挡在门外&quot;——<strong>WAF 在 LB 后面做了什么</strong>(SQL 注入 / XSS / 路径遍历的特征匹配 + 行为分析)、<strong>OWASP ModSecurity 规则集</strong>、<strong>DDoS 三大类型</strong>(SYN flood 在传输层 / UDP amp 利用反射 / CC 在应用层伪装真用户)、<strong>防御手段从浅到深</strong>(SYN cookie / 速率限制 / 挑战质询 / Anycast 摊平 / 大流量清洗中心)、<strong>429 / 503 在限流时怎么用、Retry-After 是关键、Cloudflare / 阿里云 / AWS Shield 各自的玩法</strong>——以及为什么&quot;防 DDoS 最好的办法是有钱买 Anycast 带宽&quot;,而<strong>钱不够的小厂只能在源站做 CC 防御</strong>。</p>`,158)])])}const g=a(t,[["render",e]]);export{k as __pageData,g as default};
